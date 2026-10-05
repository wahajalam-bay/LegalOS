// Source discovery — what data actually exists in Drive, regardless of whether
// any code currently reads it.
//
// The register ingest only looks at FILENAMES and FOLDER PATHS to decide what a
// spreadsheet is. That answers "does a file called 'Litigation Tracker' exist",
// which is not the same question as "is there a dataset for Asset Recovery
// anywhere in this estate". This tool opens EVERY workbook and records every
// sheet name and every column header, then scores those against each module's
// vocabulary — so a tracker whose filename says nothing useful is still found.
//
//   node tools/source-discovery.js
//
// Writes source-registry.json: one row per (file, sheet) with its headers, its
// row count and its candidate module. Read-only; nothing is written to Drive.
const fs = require("fs");
const path = require("path");

process.env.LEGALOS_NO_WARM = "1";

const { ROOT } = require("../api/config");
const { driveRaw } = require("../api/google");
const drive = require("../api/drive");
const registers = require("../api/registers");
const xlsx = require("../api/xlsx");

/* The vocabularies. A module is "found" when a sheet's headers or name carry
   enough of its distinctive words. Deliberately broad on discovery (we would
   rather inspect a false positive than miss a real dataset) and reported with a
   score so a human can judge. */
const MODULE_VOCAB = {
  assetRecovery: {
    label: "Asset Recovery",
    strong: ["asset recovery", "recovery date", "assets received", "total recovered", "provident fund", "pending salary", "final settlement", "laptop", "wingle", "vehicle pv"],
    weak: ["recovery", "recovered", "settlement", "employee", "clearance", "asset", "possession", "execution", "receivable"],
  },
  ip: {
    label: "IP Portfolio",
    strong: ["trademark", "trade mark", "mark name", "registration no", "class", "wipo", "patent", "copyright", "ipo pakistan"],
    weak: ["ip", "brand", "logo", "domain", "intellectual"],
  },
  developerDisputes: {
    label: "Developer Disputes",
    strong: ["developer dispute", "society", "development agreement dispute", "project dispute"],
    weak: ["developer", "society", "builder", "project", "dispute"],
  },
  police: {
    label: "Police Complaints",
    strong: ["fir", "police station", "fir date", "complaint date", "investigating officer"],
    weak: ["police", "complaint", "station", "criminal", "application"],
  },
  inspections: {
    label: "Govt Inspections",
    strong: ["inspection date", "officer name", "officer designation", "irregularities", "book signed", "certificate issued"],
    weak: ["inspection", "inspector", "officer", "visit", "labour", "eobi", "sessi"],
  },
  filings: {
    label: "SECP Filings",
    strong: ["secp", "form a", "form 29", "annual return", "srn", "filing date", "period end", "ctc"],
    weak: ["filing", "commission", "return", "statutory", "registrar"],
  },
  vetting: {
    label: "Risk Analysis",
    strong: ["risk rating", "risk assessment", "risk register", "mitigation", "risk reviewed", "risk signoff"],
    weak: ["risk", "vetting", "review", "assessment"],
  },
  // Families already wired, included so the registry is complete.
  contracts: { label: "Contracts", strong: ["agreement title", "contract value", "counter party", "contract type"], weak: ["contract", "agreement", "ppa", "vendor"] },
  litigation: { label: "Litigation", strong: ["case name", "case nature", "next date of hearing", "court"], weak: ["case", "hearing", "litigation", "court", "suit"] },
  notices: { label: "Legal notices", strong: ["date of notice", "recepient", "recipient", "date of dispatch"], weak: ["notice", "summons", "sender"] },
  licences: { label: "Licences & permits", strong: ["issuing authority", "date of expiry", "license no", "licence no", "permit no"], weak: ["licence", "license", "permit", "certificate", "noc", "registration", "renewal", "regulator"] },
  loans: { label: "Loans & financing", strong: ["borrower", "lender", "total loan amount", "repayment term"], weak: ["loan", "financing", "interest", "fdi"] },
  resolutions: { label: "Board resolutions", strong: ["agenda", "resolution no", "document no"], weak: ["resolution", "board", "authorization", "attorney"] },
  properties: { label: "Project properties", strong: ["property address", "group company", "purchase price", "joint venture"], weak: ["property", "project", "plot", "land"] },
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const MAX_BYTES = 26 * 1024 * 1024;

function scoreSheet(sheetName, headers) {
  const hay = " " + norm(sheetName + " " + headers.join(" ")) + " ";
  const out = [];
  for (const [key, v] of Object.entries(MODULE_VOCAB)) {
    let score = 0; const hits = [];
    for (const t of v.strong) if (hay.includes(" " + norm(t) + " ")) { score += 3; hits.push(t); }
    for (const t of v.weak) if (hay.includes(" " + norm(t) + " ")) { score += 1; hits.push(t); }
    if (score > 0) out.push({ module: key, label: v.label, score, hits: hits.slice(0, 6) });
  }
  return out.sort((a, b) => b.score - a.score);
}

(async () => {
  console.log("Source discovery — opening every workbook in the estate\n");
  const idx = await drive.rebuild(true);
  const files = idx.files || [];

  const sheetsLike = files.filter((f) =>
    !/^~\$/.test(f.name) &&
    (/\.(xlsx?|csv)$/i.test(f.name) || /spreadsheet|csv/i.test(f.mimeType || "")));
  const googleNative = sheetsLike.filter((f) => /google-apps/.test(f.mimeType || ""));
  const oversize = sheetsLike.filter((f) => (f.size || 0) > MAX_BYTES);

  console.log(`  spreadsheet-like files: ${sheetsLike.length}`);
  console.log(`  of which Google-native: ${googleNative.length}  (these need /export, not alt=media)`);
  console.log(`  of which over the ${Math.round(MAX_BYTES / 1048576)}MB cap: ${oversize.length}`);
  console.log(`  currently claimed by a register family: ${sheetsLike.filter((f) => registers.FAMILIES.some((fam) => fam.match(f))).length}\n`);

  const registry = [];
  let n = 0;
  for (const f of sheetsLike) {
    n++;
    const claimedBy = registers.FAMILIES.filter((fam) => fam.match(f)).map((fam) => fam.key);
    const entry = {
      sourceId: "SRC-" + f.id.slice(-10),
      fileId: f.id, file: f.name, root: f.root, folderPath: f.folderPath,
      mimeType: f.mimeType, sizeBytes: f.size || 0, modified: f.modifiedTime,
      googleNative: /google-apps/.test(f.mimeType || ""),
      oversize: (f.size || 0) > MAX_BYTES,
      claimedByFamilies: claimedBy,
      sheets: [], status: "", error: null,
    };

    if (entry.oversize) { entry.status = "SKIPPED_OVERSIZE"; registry.push(entry); continue; }

    let buf;
    try {
      const url = entry.googleNative
        ? "/files/" + encodeURIComponent(f.id) + "/export?mimeType=" + encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") + "&supportsAllDrives=true"
        : "/files/" + encodeURIComponent(f.id) + "?alt=media&supportsAllDrives=true";
      const r = await driveRaw(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) { entry.status = "DOWNLOAD_FAILED"; entry.error = e.message; registry.push(entry); continue; }

    let wb;
    try { wb = xlsx.readWorkbook(buf, { maxSheets: 500 }); }
    catch (e) { entry.status = "PARSE_FAILED"; entry.error = e.message; registry.push(entry); continue; }

    entry.sheetCount = wb.sheets.length;
    for (const sh of wb.sheets) {
      const { header, records } = xlsx.toObjects(sh.rows || []);
      const cand = scoreSheet(sh.name, header);
      entry.sheets.push({
        sheet: sh.name, rows: records.length, headers: header.slice(0, 24),
        candidates: cand.slice(0, 3),
        best: cand[0] ? cand[0].module : null,
        bestScore: cand[0] ? cand[0].score : 0,
      });
    }
    entry.status = "READ";
    registry.push(entry);
    if (n % 10 === 0) process.stdout.write(`  …${n}/${sheetsLike.length}\r`);
  }

  fs.writeFileSync(path.join(ROOT, "source-registry.json"), JSON.stringify(registry, null, 2));

  /* ---- what did we find for the modules with no wired source? ---- */
  const UNSOURCED = ["assetRecovery", "ip", "developerDisputes", "police", "inspections", "filings", "vetting"];
  console.log("\n\n=== Candidate sources for the modules with NO wired register ===\n");
  for (const mod of UNSOURCED) {
    const hits = [];
    for (const e of registry) {
      for (const sh of e.sheets || []) {
        const c = (sh.candidates || []).find((x) => x.module === mod);
        if (c && c.score >= 3 && sh.rows > 0) hits.push({ file: e.file, folder: e.folderPath, sheet: sh.sheet, rows: sh.rows, score: c.score, hits: c.hits, claimed: e.claimedByFamilies });
      }
    }
    hits.sort((a, b) => b.score - a.score || b.rows - a.rows);
    console.log(`${MODULE_VOCAB[mod].label}  —  ${hits.length} candidate sheet(s)`);
    hits.slice(0, 6).forEach((h) => console.log(
      `   score ${String(h.score).padStart(2)} | ${String(h.rows).padStart(5)} rows | ${h.file.slice(0, 40).padEnd(40)} | ${h.sheet.slice(0, 26).padEnd(26)} | ${h.hits.slice(0, 4).join(", ")}`));
    if (!hits.length) console.log("   (nothing in the estate scores for this module)");
    console.log("");
  }

  const totals = {
    files: sheetsLike.length, read: registry.filter((r) => r.status === "READ").length,
    failed: registry.filter((r) => /FAILED/.test(r.status)).length,
    skipped: registry.filter((r) => r.status === "SKIPPED_OVERSIZE").length,
    sheets: registry.reduce((n2, r) => n2 + (r.sheets || []).length, 0),
    sheetsWithRows: registry.reduce((n2, r) => n2 + (r.sheets || []).filter((s) => s.rows > 0).length, 0),
    dataRows: registry.reduce((n2, r) => n2 + (r.sheets || []).reduce((m, s) => m + s.rows, 0), 0),
  };
  console.log("=== registry totals ===");
  console.log(JSON.stringify(totals, null, 1));
  console.log("\nwrote source-registry.json");
})().catch((e) => { console.error("DISCOVERY FAILED:", e); process.exit(1); });
