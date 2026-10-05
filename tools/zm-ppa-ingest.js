#!/usr/bin/env node
/* FOUR WORKBOOKS, ONE SET OF AGREEMENTS.
 *
 * "Zameen Media PPA's" holds four contract workbooks and they overlap heavily:
 *
 *   Admin Contracts .xlsx                              1,122 rows
 *   Other Contracts- Zameen Media .xlsx                1,122 rows   (1,122 shared with Admin)
 *   00 Zameen Media-PPAs and Finder's Fee Tracker      807 rows
 *   00 …Finder's Fee Tracker (1).xlsx                  807 rows + a _LinkExport sheet
 *
 * None of them is simply the newest. The Admin/Other pair is BROADER — 734
 * projects against 559, adding leases, NDAs, tenancy, novation and settlement
 * agreements. The Finder's Fee tracker is NARROWER but CURRENT: it carries 24
 * agreements the broader pair has never heard of, serials 688–714, dated late
 * 2025 to July 2026 — Peak Nest, Zameen EON, Zameen Hive, Clifton Square,
 * Broadway by ICON, Florence Hill. Choosing either one loses real contracts.
 *
 * THE IDENTITY QUESTION, AND HOW IT IS ANSWERED
 *
 * The two workbook families number the same agreement differently: "First
 * Amendment of Grand Square" is serial 1162 in Admin/Other and serial 231 in the
 * tracker. So a serial cannot identify an agreement across families.
 *
 * Nor can title, type and start date. Four rows all read "Services Agreement",
 * type Services Agreement, starting 2020-02-21 — and they are four DIFFERENT
 * agreements, for LDA City Alpha Estate, LDA City Urban Developers, LDA City
 * Maymar Housing and one other. Merging them would have destroyed three
 * contracts.
 *
 * What separates those four, and what unites the four copies of Grand Square, is
 * the DOCUMENTS column: identical for the copies, different for the four. So
 * identity is title + type + documents, with dates and counterparty used to
 * confirm rather than to decide. Where the documents column is empty the row is
 * only merged on an exact match of everything else, because a blank field is not
 * evidence of sameness.
 *
 * Nothing is written to Drive. Every contributing source row keeps its lineage —
 * workbook, sheet, row number and serial — so a merged record can always be
 * taken back apart.
 *
 *   node tools/zm-ppa-ingest.js
 */
const fs = require("fs"), P = require("path"), crypto = require("crypto");
const xlsx = require("../api/xlsx.js");
const drive = require("../api/drive.js");
const { driveRaw } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const PPA_ROOT = "Commercial_Zameen Media Contracts / Zameen Media PPA's";
const OUT_LINEAGE = P.join(ROOT, "audit", "zm-ppa-record-lineage.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
const nonEmpty = (c) => c.some((x) => String(x == null ? "" : x).trim() !== "");
const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const asDate = (v) => {
  if (v == null || v === "") return "";
  const t = new Date(v);
  return isNaN(t) ? clean(v) : t.toISOString().slice(0, 10);
};

async function fetchBytes(id, attempt = 0) {
  const res = await driveRaw("/files/" + id + "?alt=media&supportsAllDrives=true");
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    if (attempt >= 4) throw new Error("HTTP " + res.status);
    await sleep(1200 * Math.pow(2, attempt));
    return fetchBytes(id, attempt + 1);
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

/* The header is not on row 0 — these workbooks carry a banner row first. Find the
   row that actually names the columns rather than assuming a position. */
function headerIndex(rows) {
  return rows.findIndex((r) => r.some((c) => /project name/i.test(String(c || ""))));
}

const COLS = [
  ["ref", /^serial\s*no/i],
  ["title", /^project name/i],
  ["start", /^start date/i],
  ["end", /^end date/i],
  ["department", /^department/i],
  ["region", /^region/i],
  ["type", /^agreement type/i],
  ["firstParty", /^company/i],
  ["counterParty", /^counter\s*party/i],
  ["documents", /^documents?$/i],
  ["city", /^city/i],
  ["value", /contract value/i],
  ["status", /^contract status/i],
  ["physicalRecord", /physical record/i],
];

function mapColumns(header) {
  const ci = {};
  for (const [key, re] of COLS) {
    const i = header.findIndex((c) => re.test(String(c || "").replace(/\s+/g, " ").trim()));
    if (i >= 0) ci[key] = i;
  }
  return ci;
}

(async () => {
  await drive.ensureIndex();
  const books = drive.indexFiles().filter((f) =>
    (f.folderPath || "") === PPA_ROOT && /\.xlsx?$/i.test(f.name || "")
    && !/Reference Numbers/i.test(f.name));

  const rows = [];                       // every source row, from every workbook
  const workbooks = [];

  for (const b of books) {
    const buf = await fetchBytes(b.id);
    const wb = xlsx.readWorkbook(buf, { maxSheets: 100000 });   // no sheet cap
    for (const sheet of (wb.sheets || [])) {
      const raw = (sheet.rows || []);
      const hi = headerIndex(raw);
      if (hi < 0) {
        /* A sheet with no project-name column names no agreements, so it makes
           no records. _LinkExport is the one that matters here: 794 rows that
           look like a register until you read the header. It is a serial ->
           title -> filename export, i.e. EVIDENCE about which documents belong
           to a tracker row, not 794 more contracts. Measured rather than
           asserted, because "it is only evidence" is the kind of claim that
           should carry a number: of its 793 data rows, 700 carry filenames that
           the `documents` column already holds, and exactly one carries real
           Drive links. It therefore adds no agreement the register lacks. */
        const body = raw.slice(1).filter(nonEmpty);
        const col = (i) => body.filter((r) => String(r[i] == null ? "" : r[i]).trim()).length;
        const looksLikeLinkExport = /_?link ?export/i.test(sheet.name);
        workbooks.push({
          file: b.name, sheet: sheet.name, rows: raw.filter(nonEmpty).length,
          role: "NO_CONTRACT_HEADER",
          treatedAs: looksLikeLinkExport ? "linkage evidence, not operational records" : "not a register",
          dataRows: body.length,
          rowsCarryingDocumentNames: col(3),
          rowsCarryingRealDriveLinks: body.filter((r) => /https?:\/\//.test(String(r[2] || ""))).length,
        });
        continue;
      }
      const ci = mapColumns(raw[hi]);
      let n = 0;
      for (let i = hi + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!nonEmpty(r)) continue;
        const rec = { __src: { file: b.name, fileId: b.id, sheet: sheet.name, rowIndex: i } };
        for (const [key] of COLS) rec[key] = ci[key] != null ? clean(r[ci[key]]) : "";
        rec.start = asDate(rec.start); rec.end = asDate(rec.end);
        if (!rec.title) continue;        // a row with no project name names nothing
        rows.push(rec); n++;
      }
      workbooks.push({ file: b.name, sheet: sheet.name, headerRow: hi, rows: n, role: "CONTRACT_ROWS", columns: ci });
    }
  }

  /* ---- group into logical agreements --------------------------------- */
  const groups = new Map();
  for (const r of rows) {
    /* Documents is the discriminator. Where it is present it decides; where it is
       absent the row must match on everything else before it merges, because a
       blank column is not evidence that two rows are the same agreement. */
    const key = r.documents
      ? "D|" + norm(r.title) + "|" + norm(r.type) + "|" + norm(r.documents)
      : "F|" + [r.title, r.type, r.start, r.end, r.region, r.counterParty, r.city, r.value].map(norm).join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  /* ---- merge each group, keeping conflicts visible -------------------- */
  const FIELDS = COLS.map(([k]) => k).filter((k) => k !== "ref");

  /* A FILING NUMBER IS NOT A TERM OF THE AGREEMENT.
     "physical record" is where the paper copy sits in a cabinet, and the two
     workbook families number the same contract differently for the same reason
     they use different serials. Sixteen of the twenty-three flagged records
     disagreed on nothing else. Counting that as a conflict buries the seven
     that are real, so these are collected like serials instead. */
  const FILING_FIELDS = new Set(["physicalRecord"]);

  /* SPELLING IS NOT DISAGREEMENT.
     "Lease Agreement" / "Lease agreement", "Non-Disclosure" / "Non- Disclosure",
     "...Pvt. Ltd" / "...Pvt. Ltd." and two filenames differing by a hyphen are
     the same value typed twice. Case, punctuation and runs of whitespace are
     normalised for COMPARISON only -- every original spelling is kept, because
     the workbook's exact text is what the source says and LegalOS does not
     rewrite its sources. What this must NOT do is reach further: "Sahiwal" and
     "Bahawalpur" are different cities and stay a conflict. */
  const canon = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const records = [];
  let conflictCount = 0;
  for (const [key, members] of groups) {
    const out = {
      /* A stable id from the agreement's own identity, not from where it
         happened to land in an array. Rebuilds cannot renumber it. */
      id: "ZMC-" + crypto.createHash("sha1").update(key).digest("hex").slice(0, 10).toUpperCase(),
      sourceRows: members.length,
      serials: [...new Set(members.map((m) => m.ref).filter(Boolean))],
      lineage: members.map((m) => ({ ...m.__src, serial: m.ref })),
      conflicts: {},
    };
    out.filings = {};
    out.spellingVariants = {};
    for (const f of FIELDS) {
      const vals = [...new Set(members.map((m) => m[f]).filter((v) => v !== ""))];
      out[f] = vals[0] || "";
      if (vals.length <= 1) continue;

      if (FILING_FIELDS.has(f)) { out.filings[f] = vals; continue; }

      /* Group the spellings by their comparison form. One group means the
         sources agree and typed it differently; more than one means they
         genuinely disagree. */
      const groups = new Map();
      for (const v of vals) {
        const k = canon(v);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(v);
      }
      if (groups.size === 1) { out.spellingVariants[f] = vals; continue; }

      /* Preserved, never averaged away: where two sources disagree the record
         says so and keeps both, which §33 requires and a silent winner hides.
         Each distinct value is reported, grouped so that a difference of
         spelling inside one side is not mistaken for a third position. */
      out.conflicts[f] = [...groups.values()].map((g) => g[0]);
      conflictCount++;
    }
    out.quality = Object.keys(out.conflicts).length ? "CONFLICTING_SOURCE"
      : (!out.start && !out.end && !out.counterParty) ? "INCOMPLETE_SOURCE" : "OK";
    records.push(out);
  }

  const inFamily = (f) => /Admin Contracts|Other Contracts/i.test(f) ? "broad" : "tracker";
  const summary = {
    workbooksRead: books.length,
    sheetsRead: workbooks.length,
    sourceRowsWithAProject: rows.length,
    logicalAgreements: records.length,
    mergedAwayCopies: rows.length - records.length,
    recordsWithConflicts: records.filter((r) => Object.keys(r.conflicts).length).length,
    conflictingFieldInstances: conflictCount,
    recordsWithDifferingFilingNumbers: records.filter((r) => Object.keys(r.filings || {}).length).length,
    recordsWhereSourcesJustSpellItDifferently: records.filter((r) => Object.keys(r.spellingVariants || {}).length).length,
    conflictsByField: records.reduce((m, r) => { for (const f of Object.keys(r.conflicts)) m[f] = (m[f] || 0) + 1; return m; }, {}),
    incompleteSource: records.filter((r) => r.quality === "INCOMPLETE_SOURCE").length,
    onlyInBroadWorkbooks: records.filter((r) => r.lineage.every((l) => inFamily(l.file) === "broad")).length,
    onlyInTrackers: records.filter((r) => r.lineage.every((l) => inFamily(l.file) === "tracker")).length,
    inBoth: records.filter((r) => new Set(r.lineage.map((l) => inFamily(l.file))).size > 1).length,
    byType: records.reduce((m, r) => (m[r.type || "(none)"] = (m[r.type || "(none)"] || 0) + 1, m), {}),
    byRegion: records.reduce((m, r) => (m[r.region || "(none)"] = (m[r.region || "(none)"] || 0) + 1, m), {}),
  };

  fs.writeFileSync(OUT_LINEAGE, JSON.stringify({ summary, workbooks, records }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
})();
