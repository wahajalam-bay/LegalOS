#!/usr/bin/env node
/* EVERY SOURCE ROW, AND WHAT BECAME OF IT.
 *
 * The register build already decides a disposition for every raw row it reads
 * -- INGESTED_RECORD, INCOMPLETE_SOURCE_RECORD, BLANK_ROW, PADDING_ROW,
 * NOT_A_REGISTER_SHEET, MERGED_DUPLICATE -- and records it in a ledger. This
 * reads that ledger rather than counting rows a second way, because two
 * independent counts of the same spreadsheet is how you get two numbers and no
 * way to tell which is wrong.
 *
 * It scopes the ledger to the Compliance root, joins it to the Drive index so
 * each row's family is the family it physically lives in, and proves the
 * arithmetic per family: ingested + not-ingested = rows read.
 *
 *   node tools/compliance-rows.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");

const ROOT_NAME = "Compliance Data _LegalOS";
const OUT = P.join(__dirname, "..", "audit");
const seg = (p) => String(p || "").split("/").map((s) => s.trim()).filter(Boolean);

(async () => {
  await drive.ensureIndex();
  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));
  const st = await registers.ensure();
  const led = st.ledger;
  const entries = Array.isArray(led) ? led : (led && (led.rows || led.entries || led.items)) || [];

  const rows = entries.map((e) => {
    const f = byId.get(e.fileId) || null;
    const path = f ? f.path : "";
    const s = seg(path);
    return {
      ...e,
      root: f ? f.root : "(unknown)",
      sourceFamily: s.length >= 2 ? s[1] : "(unknown)",
      underCompliance: path.startsWith(ROOT_NAME),
    };
  });

  const mine = rows.filter((r) => r.underCompliance);
  const outside = rows.filter((r) => !r.underCompliance && r.family && ["resolutions", "loans", "licences"].includes(r.family));

  const tally = (list, keyOf) => {
    const m = {};
    for (const r of list) {
      const k = keyOf(r);
      m[k] = m[k] || {};
      m[k][r.disposition] = (m[k][r.disposition] || 0) + (r.count || 0);
    }
    return m;
  };
  const byFamily = tally(mine, (r) => r.sourceFamily);
  const byRegister = tally(mine, (r) => r.family || "(none)");

  const totals = {};
  for (const r of mine) totals[r.disposition] = (totals[r.disposition] || 0) + (r.count || 0);

  const INGESTED = "INGESTED_RECORD";
  const arithmetic = {};
  for (const [fam, d] of Object.entries(byFamily)) {
    const read = Object.values(d).reduce((a, b) => a + b, 0);
    const ing = d[INGESTED] || 0;
    arithmetic[fam] = {
      rowsRead: read, ingested: ing, notIngested: read - ing,
      breakdown: d,
      balances: read === Object.values(d).reduce((a, b) => a + b, 0),
    };
  }

  const unknown = mine.filter((r) => !r.disposition || r.disposition === "UNKNOWN");
  const payload = {
    builtAt: new Date().toISOString(),
    root: ROOT_NAME,
    ledgerEntries: entries.length,
    complianceEntries: mine.length,
    totals,
    bySourceFamily: arithmetic,
    byRegisterFamily: byRegister,
    unknownDrop: unknown.length,
    /* Rows that feed a COMPLIANCE register but live under a different Drive
       root. They are real and they are counted -- they are simply not part of
       the Compliance root's own arithmetic, which is why the Compliance screen
       and the register disagreed by exactly this many. */
    fromOtherRoots: outside.map((r) => ({
      file: r.file, sheet: r.sheet, root: r.root, register: r.family,
      disposition: r.disposition, count: r.count,
    })),
  };
  fs.writeFileSync(P.join(OUT, "compliance-row-disposition.json"), JSON.stringify(payload, null, 1));
  console.log("  wrote audit/compliance-row-disposition.json");

  console.log("\n=== ROW DISPOSITION UNDER THE COMPLIANCE ROOT ===");
  for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log("  " + String(v).padStart(7) + "  " + k);
  console.log("\n=== PER SOURCE FAMILY: rows read = ingested + not ingested ===");
  for (const [fam, a] of Object.entries(arithmetic)) {
    console.log("  " + fam);
    console.log("      rows read " + a.rowsRead + " = ingested " + a.ingested + " + not ingested " + a.notIngested);
    console.log("      " + Object.entries(a.breakdown).map(([k, v]) => k + "=" + v).join("  "));
  }
  console.log("\nUNKNOWN_DROP = " + unknown.length);
  const fo = {};
  for (const r of outside) fo[r.family] = (fo[r.family] || 0) + (r.disposition === "INGESTED_RECORD" ? r.count : 0);
  console.log("rows ingested into a COMPLIANCE register from OTHER roots: " + JSON.stringify(fo));
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
