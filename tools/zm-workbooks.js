#!/usr/bin/env node
/* EVERY WORKBOOK, EVERY SHEET, EVERY ROW.
 *
 * Five workbooks sit directly under "Zameen Media PPA's". The registers read
 * them with `maxSheets: 60`, which is almost certainly generous — but a cap that
 * is never checked is a cap you find out about from a missing register. This
 * reads with no sheet cap at all and reports how many sheets each workbook
 * actually has, so "60 was enough" becomes a measured fact.
 *
 * Two of the five are near-namesakes:
 *
 *   00 Zameen Media-PPAs and Finder's Fee Tracker.xlsx        138,844 bytes
 *   00 Zameen Media-PPAs and Finder's Fee Tracker (1).xlsx    157,928 bytes
 *
 * Different sizes and different checksums, so they are not copies. Their Drive
 * modification times are three seconds apart because the whole folder was
 * uploaded in one go, which means the timestamp says nothing about which content
 * is newer. Deciding between them on "(1) is a duplicate" or "the newer one
 * wins" would be a guess, and the instruction is explicit that neither may be
 * silently dropped. So this diffs them sheet by sheet and row by row and reports
 * what is actually different.
 *
 * Nothing is written back to Drive. Cell values are summarised, not dumped:
 * headers and counts are recorded, and only the small number of genuinely
 * divergent rows are kept, so no workbook body ends up in an audit artefact.
 *
 *   node tools/zm-workbooks.js
 */
const fs = require("fs"), P = require("path"), crypto = require("crypto");
const xlsx = require("../api/xlsx.js");
const drive = require("../api/drive.js");
const { driveRaw } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const OUT_DIFF = P.join(ROOT, "audit", "zm-ppa-workbook-diff.json");
const OUT_SRC = P.join(ROOT, "audit", "zm-ppa-source-reconciliation.json");
const PPA_ROOT = "Commercial_Zameen Media Contracts / Zameen Media PPA's";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/* A row's identity, for comparing two workbooks. Not the row NUMBER — rows move
   when someone inserts a line, and comparing by position would report an entire
   sheet as changed because one row was added at the top. */
function rowKey(cells) {
  const joined = cells.map((c) => String(c == null ? "" : c).trim().toLowerCase()).join("\u0001");
  return crypto.createHash("sha1").update(joined).digest("hex").slice(0, 16);
}
const nonEmpty = (cells) => cells.some((c) => String(c == null ? "" : c).trim() !== "");

function describeSheet(sheet) {
  const rows = (sheet.rows || []).filter(nonEmpty);
  const header = xlsx.detectHeader ? xlsx.detectHeader(sheet.rows || []) : null;
  const widths = rows.map((r) => r.length);
  return {
    name: sheet.name,
    hidden: !!sheet.hidden,
    rowsTotal: (sheet.rows || []).length,
    rowsNonEmpty: rows.length,
    widestRow: widths.length ? Math.max(...widths) : 0,
    headerRowIndex: header && typeof header.index === "number" ? header.index : null,
    headers: header && header.headers ? header.headers.filter(Boolean).map(String) : [],
    rowKeys: rows.map(rowKey),
  };
}

(async () => {
  await drive.ensureIndex();
  const books = drive.indexFiles().filter((f) =>
    (f.folderPath || "") === PPA_ROOT && /\.xlsx?$/i.test(f.name || ""));

  console.error("workbooks directly under the PPA root: " + books.length);

  const read = [];
  for (const b of books) {
    const buf = await fetchBytes(b.id);
    /* No sheet cap. If a workbook has more sheets than the registers read, that
       is the finding. */
    const wb = xlsx.readWorkbook(buf, { maxSheets: 100000 });
    const sheets = (wb.sheets || []).map(describeSheet);
    read.push({
      fileId: b.id, name: b.name, bytes: buf.length,
      modifiedTime: b.modifiedTime || "",
      md5: crypto.createHash("md5").update(buf).digest("hex"),
      sheetCount: sheets.length,
      sheets,
      totalNonEmptyRows: sheets.reduce((n, s) => n + s.rowsNonEmpty, 0),
    });
    console.error("  read " + b.name + " — " + sheets.length + " sheets, "
      + sheets.reduce((n, s) => n + s.rowsNonEmpty, 0) + " non-empty rows");
  }

  /* ---- the two near-namesakes, compared properly ---------------------- */
  const a = read.find((r) => /Finder's Fee Tracker\.xlsx$/i.test(r.name));
  const b = read.find((r) => /Finder's Fee Tracker \(1\)\.xlsx$/i.test(r.name));
  let diff = null;
  if (a && b) {
    const sheetsA = new Map(a.sheets.map((s) => [s.name, s]));
    const sheetsB = new Map(b.sheets.map((s) => [s.name, s]));
    const names = [...new Set([...sheetsA.keys(), ...sheetsB.keys()])].sort();
    const perSheet = names.map((n) => {
      const sa = sheetsA.get(n), sb = sheetsB.get(n);
      if (!sa) return { sheet: n, verdict: "ONLY_IN_(1)", rowsOnlyInB: sb.rowsNonEmpty };
      if (!sb) return { sheet: n, verdict: "ONLY_IN_BASE", rowsOnlyInA: sa.rowsNonEmpty };
      const ka = new Set(sa.rowKeys), kb = new Set(sb.rowKeys);
      const onlyA = sa.rowKeys.filter((k) => !kb.has(k));
      const onlyB = sb.rowKeys.filter((k) => !ka.has(k));
      const shared = sa.rowKeys.filter((k) => kb.has(k)).length;
      return {
        sheet: n,
        verdict: (!onlyA.length && !onlyB.length) ? "IDENTICAL_CONTENT"
          : (!onlyA.length) ? "(1)_IS_A_SUPERSET"
            : (!onlyB.length) ? "BASE_IS_A_SUPERSET" : "DIVERGENT",
        rowsBase: sa.rowsNonEmpty, rows1: sb.rowsNonEmpty,
        sharedRows: shared, onlyInBase: onlyA.length, onlyIn1: onlyB.length,
        headersMatch: JSON.stringify(sa.headers) === JSON.stringify(sb.headers),
        headersBase: sa.headers, headers1: sb.headers,
      };
    });
    const verdicts = perSheet.reduce((m, s) => (m[s.verdict] = (m[s.verdict] || 0) + 1, m), {});
    diff = {
      base: { name: a.name, bytes: a.bytes, md5: a.md5, sheets: a.sheetCount, rows: a.totalNonEmptyRows, modified: a.modifiedTime },
      other: { name: b.name, bytes: b.bytes, md5: b.md5, sheets: b.sheetCount, rows: b.totalNonEmptyRows, modified: b.modifiedTime },
      identicalFile: a.md5 === b.md5,
      /* Stated rather than decided. Which workbook is authoritative is a
         question about the business, not about bytes, and the evidence for it
         is laid out here for a person to settle. */
      overallVerdict: null,
      perSheet, verdicts,
    };
    const anyDivergent = perSheet.some((s) => s.verdict === "DIVERGENT");
    const allIdentical = perSheet.every((s) => s.verdict === "IDENTICAL_CONTENT");
    const bSuperset = perSheet.every((s) => s.verdict === "IDENTICAL_CONTENT" || s.verdict === "(1)_IS_A_SUPERSET" || s.verdict === "ONLY_IN_(1)");
    const aSuperset = perSheet.every((s) => s.verdict === "IDENTICAL_CONTENT" || s.verdict === "BASE_IS_A_SUPERSET" || s.verdict === "ONLY_IN_BASE");
    diff.overallVerdict = allIdentical ? "SAME_CONTENT_DIFFERENT_FILE"
      : anyDivergent ? "DIVERGENT — both hold rows the other does not"
        : bSuperset ? "(1) CONTAINS EVERYTHING IN THE BASE, PLUS MORE"
          : aSuperset ? "BASE CONTAINS EVERYTHING IN (1), PLUS MORE"
            : "MIXED";
  }

  fs.writeFileSync(OUT_DIFF, JSON.stringify(diff, null, 1));
  fs.writeFileSync(OUT_SRC, JSON.stringify({
    generatedAt: new Date().toISOString(),
    workbooks: read.map((r) => ({
      fileId: r.fileId, name: r.name, bytes: r.bytes, md5: r.md5,
      modifiedTime: r.modifiedTime, sheetCount: r.sheetCount,
      totalNonEmptyRows: r.totalNonEmptyRows,
      registersSheetCap: 60,
      exceedsRegistersCap: r.sheetCount > 60,
      sheets: r.sheets.map((s) => ({
        name: s.name, hidden: s.hidden, rowsTotal: s.rowsTotal, rowsNonEmpty: s.rowsNonEmpty,
        widestRow: s.widestRow, headerRowIndex: s.headerRowIndex, headers: s.headers,
      })),
    })),
  }, null, 1));

  console.log("\n=== WORKBOOKS ===");
  for (const r of read) {
    console.log("\n" + r.name);
    console.log("  " + r.bytes + " bytes · " + r.sheetCount + " sheets · " + r.totalNonEmptyRows + " non-empty rows"
      + (r.sheetCount > 60 ? "   *** MORE SHEETS THAN THE REGISTERS READ ***" : ""));
    for (const s of r.sheets) {
      console.log("    " + String(s.rowsNonEmpty).padStart(5) + " rows  " + (s.hidden ? "[hidden] " : "")
        + s.name + (s.headers.length ? "   headers: " + s.headers.slice(0, 6).join(" | ").slice(0, 90) : ""));
    }
  }
  if (diff) {
    console.log("\n=== THE TWO TRACKERS ===");
    console.log("  verdict: " + diff.overallVerdict);
    console.log("  per-sheet: " + JSON.stringify(diff.verdicts));
    for (const s of diff.perSheet) {
      console.log("    " + s.verdict.padEnd(26) + s.sheet
        + (s.rowsBase != null ? "   base " + s.rowsBase + " / (1) " + s.rows1
          + "   shared " + s.sharedRows + "   onlyBase " + s.onlyInBase + "   only(1) " + s.onlyIn1 : ""));
    }
  }
})();
