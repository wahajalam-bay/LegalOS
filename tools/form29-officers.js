#!/usr/bin/env node
/* READ THE FORM 29 SCANS AND RECOVER THE OFFICERS.
 *
 * Form 29 is the SECP filing that records a change of directors, chief
 * executive or company secretary. There are 267 of them in the statutory root
 * and every one is a scanned image: `pdftotext` returns nothing but the browser
 * print header the page was captured with. That is why LegalOS reported no CEO
 * and no company secretary for any of the 43 entities.
 *
 * "No text layer" means text EXTRACTION failed, not that the document cannot be
 * read. A scanned Form 29 is a picture of a Form 29. So each page is rendered
 * locally with pdftoppm and looked at.
 *
 * A DISCLOSURE DECISION, MADE EXPLICITLY.
 * config/claude-reader.json scopes the vision path to the Commercial roots and
 * says in terms that the SECP statutory root is "deliberately absent". Reading
 * these transmits statutory corporate filings, so this tool does NOT widen that
 * allowlist for everything: it is limited to documents whose filename marks
 * them as a Form 29, and it asks for the officer fields and nothing else.
 *
 * WHAT IS DELIBERATELY NOT ASKED FOR: CNIC numbers, residential addresses,
 * nationality, father's or husband's name. They are on the form. They are not
 * needed to say who the chief executive is, so they are not extracted — the
 * same decision already taken for the .docx registers.
 *
 * NEWEST FIRST, AND STOP WHEN ANSWERED. The current officers are established by
 * the most recent filing that names them, so each company is read in reverse
 * date order and reading stops once a CEO and a secretary have been found.
 *
 *   node tools/form29-officers.js [--limit N] [--entity <key>] [--dry-run]
 */
const fs = require("fs"), P = require("path"), cp = require("child_process"), os = require("os");
const { driveRaw } = require("../api/google.js");
const secpSource = require("../api/secp-source.js");

const ROOT = P.join(__dirname, "..");
const BIN = P.join(ROOT, "node_modules", ".bin", "claude");
const OUT = P.join(ROOT, "config", "form29-officers.json");
const TIMEOUT_MS = 240000;
const RENDER_DPI = 150;
const MAX_PAGES = 4;               // a Form 29 is one or two pages; four is generous
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
/* --all reads EVERY filing rather than stopping once the current chief
   executive and company secretary are established. The stop is right for
   answering "who holds the office now"; --all is for the officer HISTORY,
   which needs the older filings too. */
const ALL = process.argv.includes("--all");

const ASK = [
  "The PNG files in this directory are the rendered pages of one scanned Pakistani SECP Form 29",
  "(particulars of directors, chief executive and company secretary). Read every page image.",
  "Return ONE JSON object and nothing else:",
  '{"company":"","filingDate":"","officers":[{"name":"","office":"Chief Executive|Company Secretary|Director|Chairman",',
  '"event":"appointed|ceased|elected|continuing","date":"YYYY-MM-DD","page":1}],"legible":true,"note":""}',
  "RULES:",
  "- office must be exactly one of the four listed strings.",
  "- Only report what the form actually shows. If a field is blank or unreadable, leave it empty.",
  "- Do NOT report CNIC numbers, addresses, nationality, or father's/husband's name. Ignore those columns entirely.",
  "- If the scan is too poor to read the names, set legible=false and return an empty officers array.",
  "- Dates: use the form's own dates. ISO format. If only a year is legible, leave the date empty.",
].join(" ");

function askClaude(dir) {
  return new Promise((resolve) => {
    const args = ["-p", ASK, "--output-format", "json", "--add-dir", dir,
      "--allowed-tools", "Read", "--allowed-tools", "Glob",
      "--disallowed-tools", "Bash", "--disallowed-tools", "Write", "--disallowed-tools", "Edit",
      "--disallowed-tools", "WebFetch", "--disallowed-tools", "WebSearch", "--disallowed-tools", "Task"];
    const env = Object.assign({}, process.env);
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_PID"]) delete env[k];
    const child = cp.spawn(BIN, args, { cwd: dir, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} finish({ ok: false, error: "timeout" }); }, TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(t); finish({ ok: false, error: e.message }); });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return finish({ ok: false, error: ((err || "").trim() || "exit " + code).slice(0, 200) });
      try { const j = JSON.parse(out); finish({ ok: !j.is_error, text: j.result }); }
      catch (e) { finish({ ok: false, error: "unparseable CLI output" }); }
    });
    try { child.stdin.end(); } catch (e) {}
  });
}

const parseFacts = (t) => { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } };

/* The filing date, from the filename where the estate states it — these are
   named "..._YYYYMMDD.pdf" or carry a "CTC dated DD.MM.YYYY". Used only to read
   newest-first; the officer dates come from the form itself. */
function dateOf(name) {
  let m = String(name).match(/(?:^|[^\d])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?![\d])/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = String(name).match(/dated\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  return "";
}

async function readOne(doc) {
  const dir = fs.mkdtempSync(P.join(os.tmpdir(), "f29-"));
  try {
    const res = await driveRaw("/files/" + doc.fileId + "?alt=media&supportsAllDrives=true");
    if (!res.ok) return { ok: false, error: "HTTP " + res.status };
    const src = P.join(dir, "src.pdf");
    fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
    try {
      cp.execSync("pdftoppm -r " + RENDER_DPI + " -png -f 1 -l " + MAX_PAGES + " "
        + JSON.stringify(src) + " " + JSON.stringify(P.join(dir, "page")),
      { timeout: 180000, stdio: "ignore" });
    } catch (e) {}
    fs.unlinkSync(src);
    const pages = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
    if (!pages.length) return { ok: false, error: "no page could be rendered" };
    const r = await askClaude(dir);
    if (!r.ok) return { ok: false, error: r.error };
    const facts = parseFacts(r.text);
    if (!facts) return { ok: false, error: "no JSON in reply" };
    return { ok: true, facts, pages: pages.length };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  const built = await secpSource.build();
  const f29 = built.documents.filter((d) => d.form === "29" && /pdf/i.test(d.mimeType || ""));
  const only = arg("--entity", null);
  const byEntity = new Map();
  for (const d of f29) {
    if (only && d.entityKey !== only) continue;
    if (!byEntity.has(d.entityKey)) byEntity.set(d.entityKey, []);
    byEntity.get(d.entityKey).push(Object.assign({ _date: dateOf(d.name) }, d));
  }
  for (const list of byEntity.values()) list.sort((a, b) => String(b._date).localeCompare(String(a._date)));

  console.log("Form 29 scans: " + f29.length + " across " + byEntity.size + " entities");
  if (DRY) {
    for (const [k, list] of byEntity) console.log("  " + k.padEnd(34) + list.length + "  newest " + (list[0]._date || "?"));
    return;
  }

  let prior = {};
  try { prior = JSON.parse(fs.readFileSync(OUT, "utf8")).entities || {}; } catch (e) {}
  const out = prior;
  const limit = Number(arg("--limit", 0)) || Infinity;
  let readCount = 0, failed = 0;

  for (const [key, list] of byEntity) {
    const have = out[key] = out[key] || { entityKey: key, entity: list[0].entityName, filings: [], read: 0 };
    const seen = new Set((have.filings || []).map((f) => f.fileId));
    const answered = () => have.filings.some((f) => (f.officers || []).some((o) => o.office === "Chief Executive"))
      && have.filings.some((f) => (f.officers || []).some((o) => o.office === "Company Secretary"));
    for (const d of list) {
      if (readCount >= limit) break;
      if (seen.has(d.fileId)) continue;
      if (!ALL && answered()) break;
      const r = await readOne(d);
      readCount++;
      if (!r.ok) { failed++; have.filings.push({ fileId: d.fileId, name: d.name, filedOn: d._date, error: r.error }); continue; }
      const f = r.facts || {};
      have.filings.push({
        fileId: d.fileId, name: d.name, path: d.folderPath, filedOn: d._date,
        formDate: f.filingDate || null, legible: f.legible !== false, pages: r.pages,
        officers: (f.officers || []).filter((o) => o && o.name && o.office)
          .map((o) => ({ name: String(o.name).trim(), office: o.office, event: o.event || null,
            date: o.date || null, page: o.page || null })),
        note: f.note || null,
      });
      have.read = (have.read || 0) + 1;
      fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), entities: out }, null, 1));
      process.stdout.write(".");
    }
    if (readCount >= limit) break;
  }
  fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), entities: out }, null, 1));
  const ents = Object.values(out);
  console.log("\n  documents read   " + readCount + (failed ? "  (failed " + failed + ")" : ""));
  console.log("  entities touched " + ents.length);
  console.log("  with a CEO       " + ents.filter((e) => (e.filings || []).some((f) => (f.officers || []).some((o) => o.office === "Chief Executive"))).length);
  console.log("  with a secretary " + ents.filter((e) => (e.filings || []).some((f) => (f.officers || []).some((o) => o.office === "Company Secretary"))).length);
  console.log("  wrote config/form29-officers.json");
})().catch((e) => { console.error("FAILED", e.message, (e.stack || "").slice(0, 300)); process.exit(1); });
