/* READ THE STATUTORY REGISTERS AND WRITE DOWN WHAT THEY SAY.
 *
 * Every company page in LegalOS showed no directors, no CEO, no company
 * secretary, no incorporation date and no parent — for all 95 companies. Not
 * because the estate is silent, but because nobody had opened the documents:
 * the Registers of Directors and Members are .docx, not scans, and they state
 * the answer in plain text.
 *
 *   Register of Directors  ->  officers, with appointment and resignation
 *                              dates, so CURRENT officers are the ones with no
 *                              resignation recorded.
 *   Register of Members    ->  members, with entry and cessation dates. A
 *                              CORPORATE member that has not ceased IS the
 *                              parent — that is what shareholding means.
 *   Both                   ->  the Corporate Unique Identification Number,
 *                              which is the company's real registry key.
 *
 * DELIBERATELY NOT EXTRACTED: CNIC numbers and home addresses. They are on the
 * page, they are personal data, and nothing in the product needs them. Reading
 * a document is not a licence to copy everything in it.
 *
 *   node tools/secp-officers-extract.js
 */
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const { driveRaw } = require("../api/google.js");
const secpSource = require("../api/secp-source.js");

const OUT = path.join(__dirname, "..", "config", "secp-officers.json");

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const CORP = /\b(limited|ltd|llc|inc|plc|fz-?llc|holdings)\b/i;

function parseDate(s) {
  const t = clean(s);
  if (!t) return null;
  const m = t.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mon = ["january","february","march","april","may","june","july","august","september","october","november","december"]
    .indexOf(m[2].toLowerCase());
  if (mon < 0) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

/* THE LAYOUT, AS THE DOCUMENTS ACTUALLY ARE.
 *
 * Each register repeats one block per person or member, and each block starts
 * with the document's own title line. Inside a block the labels and their
 * values are on SEPARATE lines with blank lines between them:
 *
 *     Date of appointment:
 *     (blank)
 *     26 November 2020
 *     Name: Shahzad Masih s/o Barkat Masih
 *     Date of resignation:
 *     (blank)
 *     9 June 2021
 *     Address: ...
 *     Role | Nationality | CNIC No.
 *     Director | Pakistani | 35202-...
 *
 * So a label's value is the next non-empty line that parses as a date — and
 * only if it does. A director still serving has "Date of resignation:" with
 * nothing under it, and reading the following "Address:" line as a date would
 * quietly retire every current officer in the group.
 */
function nextDateAfter(lines, i, stop = 6) {
  for (let j = i + 1; j < Math.min(lines.length, i + 1 + stop); j++) {
    const L = lines[j];
    if (!L) continue;
    if (/^(Name|Address|Date of|Role|Nationality|CNIC)/i.test(L)) return null;  // hit the next field
    return parseDate(L);                                                        // first real line decides
  }
  return null;
}

const TITLE = /^REGISTER OF (DIRECTORS|MEMBERS) OF /i;

function parseRegister(text) {
  const lines = text.split(/\n/).map(clean);
  const cuin = (text.match(/CORPORATE UNIQUE IDENTIFICATION NUMBER:\s*([0-9A-Z-]+)/i) || [])[1] || null;

  /* Split into blocks on the repeated title line. The first block is the
     document preamble and carries no Name, so it falls out naturally. */
  const blocks = [];
  let cur = [];
  for (const L of lines) {
    if (TITLE.test(L)) { if (cur.length) blocks.push(cur); cur = []; }
    cur.push(L);
  }
  if (cur.length) blocks.push(cur);

  const entries = [];
  for (const b of blocks) {
    const ni = b.findIndex((L) => /^Name:/i.test(L));
    if (ni < 0) continue;
    const e = { name: clean(b[ni].replace(/^Name:\s*/i, "")), role: null, from: null, to: null };
    for (let i = 0; i < b.length; i++) {
      if (/^Date of (appointment|entry as member|entry)/i.test(b[i])) e.from = e.from || nextDateAfter(b, i);
      else if (/^Date of (resignation|cessation)/i.test(b[i])) e.to = e.to || nextDateAfter(b, i);
      /* The role sits in a small table: a header row, then the values. The
         office is the cell under "Role". */
      else if (/^CNIC No\.?$/i.test(b[i])) {
        for (let j = i + 1; j < Math.min(b.length, i + 6); j++) {
          if (b[j] && !/^(Role|Nationality|CNIC)/i.test(b[j])) { e.role = b[j]; break; }
        }
      }
    }
    entries.push(e);
  }
  return { cuin, entries };
}

/* A role is stated either on its own line or inside the name block. The word
   that matters is the office, so it is normalised to one of four. */
function roleOf(entry, text) {
  const hay = (entry.role || "") + " " + entry.name;
  if (/chief executive|(^|\W)ceo(\W|$)/i.test(hay)) return "CEO";
  if (/company secretary/i.test(hay)) return "Company Secretary";
  if (/chairman/i.test(hay)) return "Chairman";
  return "Director";
}

(async () => {
  const built = await secpSource.build();
  const docs = built.documents.filter((d) =>
    (d.category === "REGISTER_OF_DIRECTORS" || d.category === "REGISTER_OF_MEMBERS")
    && /wordprocessingml/.test(d.mimeType || ""));
  console.log("statutory registers readable as .docx: " + docs.length);

  const out = {};
  let read = 0, failed = [];
  for (const d of docs) {
    try {
      const res = await driveRaw("/files/" + d.fileId + "?alt=media&supportsAllDrives=true");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const text = (await mammoth.extractRawText({ buffer: buf })).value;
      const parsed = parseRegister(text);
      const k = d.entityKey;
      out[k] = out[k] || { entity: d.entityName, entityKey: k, cuin: null, officers: [], members: [], sources: [] };
      if (parsed.cuin && !out[k].cuin) out[k].cuin = parsed.cuin;
      const prov = { driveId: d.fileId, name: d.name, path: d.folderPath, category: d.category };
      out[k].sources.push(prov);
      for (const e of parsed.entries) {
        if (!e.name || e.name.length < 3) continue;
        if (d.category === "REGISTER_OF_DIRECTORS") {
          out[k].officers.push({ name: e.name.replace(/\s+s\/o\s+.*$/i, "").trim(), fullName: e.name,
            role: roleOf(e, text), appointed: e.from, resigned: e.to, current: !e.to, source: prov });
        } else {
          const nm = e.name.replace(/\s+through\s+.*$/i, "").trim();
          out[k].members.push({ name: nm, via: (e.name.match(/through\s+(.+)$/i) || [])[1] || null,
            corporate: CORP.test(nm), from: e.from, to: e.to, current: !e.to, source: prov });
        }
      }
      read++;
    } catch (e) { failed.push({ name: d.name, error: e.message }); }
  }

  /* THE SAME BLOCK APPEARS TWICE WHERE A PAGE BREAK REPEATS IT.
     Deduplicated on the person and their dates, so a director who genuinely
     served twice (appointed, resigned, re-appointed) stays as two entries. */
  for (const v of Object.values(out)) {
    const seen = new Set();
    v.officers = v.officers.filter((o) => {
      const k = [o.name.toLowerCase(), o.role, o.appointed, o.resigned].join("|");
      return seen.has(k) ? false : (seen.add(k), true);
    });
    const seenM = new Set();
    v.members = v.members.filter((m) => {
      const k = [m.name.toLowerCase(), m.from, m.to].join("|");
      return seenM.has(k) ? false : (seenM.add(k), true);
    });
  }

  /* The parent is the corporate member that still holds shares. Where more than
     one does, all are kept — a joint venture has two parents and flattening
     that would be a lie. */
  let withParent = 0, withOfficers = 0;
  for (const v of Object.values(out)) {
    const holders = v.members.filter((m) => m.current && m.corporate);
    v.parents = [...new Map(holders.map((m) => [m.name.toLowerCase(), { name: m.name, since: m.from, source: m.source }])).values()];
    v.currentOfficers = v.officers.filter((o) => o.current);
    if (v.parents.length) withParent++;
    if (v.currentOfficers.length) withOfficers++;
  }

  fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), entities: out }, null, 1));
  console.log("  documents read      " + read + (failed.length ? "   (failed " + failed.length + ")" : ""));
  console.log("  entities covered    " + Object.keys(out).length);
  console.log("  with a parent       " + withParent);
  console.log("  with current officers " + withOfficers);
  console.log("  with a CUIN         " + Object.values(out).filter((v) => v.cuin).length);
  for (const f of failed.slice(0, 5)) console.log("      failed: " + f.name + " — " + f.error);
  console.log("  wrote config/secp-officers.json");
})().catch((e) => { console.error("FAILED", e.message, (e.stack || "").slice(0, 400)); process.exit(1); });
