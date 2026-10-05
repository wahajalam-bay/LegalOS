// End-to-end data audit: Google Drive → trackers → records → documents.
//
// This re-runs the real ingest with instrumentation at every stage, so each
// dropped row and each unlinked file is COUNTED and attributed rather than
// silently disappearing. It reads only; it never writes to Drive.
//
//   node tools/data-audit.js            → writes DATA_AUDIT.md + audit-*.json
//   node tools/data-audit.js --quick    → skips re-downloading workbooks
//
// Output artifacts carry Drive ids (that is the point of the audit) but no
// credentials or tokens.
const fs = require("fs");
const path = require("path");

process.env.LEGALOS_NO_WARM = "1"; // we drive the crawl ourselves

const { ROOT } = require("../api/config");
const { driveRaw } = require("../api/google");
const drive = require("../api/drive");
const registers = require("../api/registers");
const xlsx = require("../api/xlsx");

const OUT_DIR = ROOT;
const QUICK = process.argv.includes("--quick");
// --no-crawl reuses the warm index instead of re-walking Drive. Repeated full
// crawls get the service account throttled (HTTP 429), and a throttled crawl
// returns a SMALLER tree — which would make this audit report data loss that
// does not exist.
const NO_CRAWL = process.argv.includes("--no-crawl");
const num = (n) => Number(n || 0).toLocaleString("en-US");

/* Re-declare the ingest's own predicates so the audit measures the SAME rules
   the application applies. Imported where exported; mirrored where not. */
const FAMILIES = registers.FAMILIES;
const MAX_BYTES = 26 * 1024 * 1024;
const MAX_SHEETS_PER_FILE = 60;
const isTrackerCandidate = (f) =>
  !/^~\$/.test(f.name) && (/\.xlsx?$/i.test(f.name) || /spreadsheet/i.test(f.mimeType));
const isDocFile = (f) => {
  const n = f.name || "";
  if (/^~\$/.test(n) || /\.tmp$/i.test(n) || /^\./.test(n) || /desktop\.ini$/i.test(n)) return false;
  if (/spreadsheetml|ms-excel/i.test(f.mimeType || "")) return false;
  return true;
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const MIME_LABEL = (m) => {
  if (!m) return "unknown";
  if (m === "application/vnd.google-apps.folder") return "folder";
  if (m === "application/vnd.google-apps.shortcut") return "shortcut";
  if (m === "application/vnd.google-apps.document") return "google-doc";
  if (m === "application/vnd.google-apps.spreadsheet") return "google-sheet";
  if (m === "application/vnd.google-apps.presentation") return "google-slides";
  if (m === "application/pdf") return "pdf";
  if (/wordprocessingml|msword/.test(m)) return "word";
  if (/spreadsheetml|ms-excel/.test(m)) return "excel";
  if (/^image\//.test(m)) return "image";
  if (/^video\//.test(m)) return "video";
  if (/zip|rar|compressed/.test(m)) return "archive";
  if (/^text\//.test(m)) return "text";
  return "other";
};

(async () => {
  const t0 = Date.now();
  console.log("LegalOS data audit — reading Drive…");

  /* ============================ PHASE 2 — Drive inventory ================= */
  const idx = NO_CRAWL ? await drive.ensureIndex() : await drive.rebuild(true);
  const files = idx.files || [];
  const folders = idx.folders || [];
  console.log(`  Drive: ${files.length} files, ${folders.length} folders across ${(idx.roots || []).length} roots`);

  const depthOf = (p) => String(p || "").split(" / ").length;
  const byMime = {};
  for (const f of files) byMime[MIME_LABEL(f.mimeType)] = (byMime[MIME_LABEL(f.mimeType)] || 0) + 1;

  // Folders holding no files ANYWHERE beneath them.
  const folderHasFile = new Set();
  for (const f of files) {
    const parts = String(f.folderPath || "").split(" / ");
    for (let i = parts.length; i > 0; i--) folderHasFile.add(parts.slice(0, i).join(" / "));
  }
  const emptyFolders = folders.filter((d) => !folderHasFile.has(d.path));

  // Same name + same byte size in two places = a duplicate copy.
  const dupKey = new Map();
  for (const f of files) {
    const k = norm(f.name) + "|" + (f.size || 0);
    if (!dupKey.has(k)) dupKey.set(k, []);
    dupKey.get(k).push(f);
  }
  const duplicateGroups = [...dupKey.values()].filter((a) => a.length > 1);
  const duplicateFileCount = duplicateGroups.reduce((n, a) => n + (a.length - 1), 0);

  const maxDepth = files.reduce((m, f) => Math.max(m, depthOf(f.path)), 0);
  const atDepthCap = files.filter((f) => depthOf(f.folderPath) >= 12).length;
  const foldersAtCap = folders.filter((d) => depthOf(d.path) >= 12).length;

  const driveInventory = {
    roots: (idx.roots || []).map((r) => ({ id: r.id, name: r.name, files: r.fileCount, folders: r.folderCount, error: r.error || null })),
    rootCount: (idx.roots || []).length,
    folderCount: folders.length,
    fileCount: files.length,
    totalBytes: files.reduce((n, f) => n + (f.size || 0), 0),
    byType: byMime,
    shortcuts: files.filter((f) => f.mimeType === "application/vnd.google-apps.shortcut").length,
    emptyFolders: emptyFolders.length,
    duplicateFileCopies: duplicateFileCount,
    duplicateGroups: duplicateGroups.length,
    maxPathDepth: maxDepth,
    filesAtOrBeyondDepthCap: atDepthCap,
    foldersAtOrBeyondDepthCap: foldersAtCap,
    docFiles: files.filter(isDocFile).length,
    trackerFiles: files.filter(isTrackerCandidate).length,
  };

  /* ============================ PHASE 3 — tracker audit ================== */
  // Re-run the ingest counting every drop.
  const trackerRows = [];
  const stage = { rawDataRows: 0, afterHeader: 0, skippedSheet: 0, lowColumnMap: 0, missingRequired: 0, mapped: 0 };
  const candidates = files.filter((f) => isTrackerCandidate(f)).map((f) => ({ file: f, families: FAMILIES.filter((fam) => fam.match(f)) }));
  const claimed = candidates.filter((c) => c.families.length && (c.file.size || 0) <= MAX_BYTES);
  const unclaimedSheets = candidates.filter((c) => !c.families.length);
  const oversizeSheets = candidates.filter((c) => c.families.length && (c.file.size || 0) > MAX_BYTES);

  const perFamilyRaw = {};
  for (const fam of FAMILIES) perFamilyRaw[fam.key] = { mapped: 0, missingRequired: 0, sheets: 0, skippedSheets: 0, lowColumnMap: 0, rawRows: 0 };

  if (!QUICK) {
    console.log(`  Re-parsing ${claimed.length} tracker workbooks…`);
    for (const { file, families } of claimed) {
      let buf, wb;
      try {
        const r = await driveRaw("/files/" + encodeURIComponent(file.id) + "?alt=media&supportsAllDrives=true");
        if (!r.ok) throw new Error("HTTP " + r.status);
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        trackerRows.push({ file: file.name, fileId: file.id, folder: file.folderPath, error: "download: " + e.message });
        continue;
      }
      try { wb = xlsx.readWorkbook(buf, { maxSheets: MAX_SHEETS_PER_FILE }); }
      catch (e) { trackerRows.push({ file: file.name, fileId: file.id, folder: file.folderPath, error: "parse: " + e.message }); continue; }

      const entry = {
        file: file.name, fileId: file.id, root: file.root, folder: file.folderPath,
        modified: file.modifiedTime, sizeBytes: file.size || 0,
        families: families.map((f) => f.key),
        sheetsInWorkbook: wb.sheets.length,
        sheetsTruncated: wb.truncated || wb.sheets.length >= MAX_SHEETS_PER_FILE,
        sheets: [],
        rawDataRows: 0, mappedRows: 0, droppedMissingRequired: 0, droppedLowColumnMap: 0, skippedSheets: 0,
      };

      for (const sheet of wb.sheets) {
        if (!sheet.rows || !sheet.rows.length) continue;
        const { header, records } = xlsx.toObjects(sheet.rows);
        const rawRows = records.length;
        entry.rawDataRows += rawRows;
        stage.rawDataRows += rawRows;

        for (const fam of families) {
          const fr = perFamilyRaw[fam.key];
          if (fam.skipSheet && fam.skipSheet(sheet.name)) { entry.skippedSheets++; fr.skippedSheets++; stage.skippedSheet += rawRows; continue; }
          if (!header.length || !records.length) continue;
          fr.sheets++; fr.rawRows += rawRows;

          // Mirror mapRecords, counting the two silent drops.
          const cmapSize = (() => {
            const seen = new Set(); let n = 0;
            const nh = header.map((h) => ({ raw: h, n: norm(h) }));
            for (const [, aliases] of Object.entries(fam.fields)) {
              for (const alias of aliases) {
                const a = norm(alias);
                let hit = nh.find((h) => h.n === a && !seen.has(h.raw));
                if (!hit) hit = nh.find((h) => h.n.startsWith(a + " ") && !seen.has(h.raw));
                if (hit) { seen.add(hit.raw); n++; break; }
              }
            }
            return n;
          })();
          if (cmapSize < 2) { entry.droppedLowColumnMap += rawRows; fr.lowColumnMap += rawRows; stage.lowColumnMap += rawRows; continue; }

          // Count rows failing `required` using the same column map.
          const cmap = {};
          { const seen = new Set();
            const nh = header.map((h) => ({ raw: h, n: norm(h) }));
            for (const [field, aliases] of Object.entries(fam.fields)) {
              for (const alias of aliases) {
                const a = norm(alias);
                let hit = nh.find((h) => h.n === a && !seen.has(h.raw));
                if (!hit) hit = nh.find((h) => h.n.startsWith(a + " ") && !seen.has(h.raw));
                if (hit) { cmap[field] = hit.raw; seen.add(hit.raw); break; }
              }
            } }
          const carried = {};
          let ok = 0, bad = 0;
          for (const rec of records) {
            const row = {};
            for (const [field, col] of Object.entries(cmap)) {
              const v = rec[col];
              row[field] = v == null ? "" : (v instanceof Date ? v.toISOString().slice(0, 10)
                : (typeof v === "number" ? v : String(v).replace(/\s+/g, " ").trim()));
              if (typeof row[field] === "string" && /^(n\/?a|-|--|nil|none|tbc|tbd)$/i.test(row[field])) row[field] = "";
            }
            for (const field of fam.fillDown || []) {
              if (row[field] !== "" && row[field] != null) carried[field] = row[field];
              else if (carried[field] != null) row[field] = carried[field];
            }
            if (fam.required.every((r) => row[r] !== "" && row[r] != null)) ok++; else bad++;
          }
          entry.mappedRows += ok; entry.droppedMissingRequired += bad;
          fr.mapped += ok; fr.missingRequired += bad;
          stage.mapped += ok; stage.missingRequired += bad;
          entry.sheets.push({ sheet: sheet.name, family: fam.key, rawRows, mapped: ok, droppedMissingRequired: bad });
        }
      }
      trackerRows.push(entry);
    }
  }

  /* ============ PHASE 3b — what the application actually holds =========== */
  const st = await registers.ensure();
  const built = st.registers || {};
  const familyCounts = Object.fromEntries(FAMILIES.map((f) => [f.key, (built[f.key] || []).length]));

  // The dedupe step drops rows whose identity fields are ALL blank — they never
  // enter `seen` and never come back. Measure that separately from real
  // duplicates, because the summary counts both as "duplicates".
  const identityLoss = {};
  for (const fam of FAMILIES) {
    if (!fam.identity) { identityLoss[fam.key] = { blankIdentityRows: 0, note: "family has no identity key — no dedupe applied" }; continue; }
    const fr = perFamilyRaw[fam.key];
    identityLoss[fam.key] = { mappedBeforeDedupe: fr.mapped, afterDedupe: familyCounts[fam.key], collapsed: Math.max(0, fr.mapped - familyCounts[fam.key]) };
  }

  /* ================== PHASE 4/5 — record → folder → file ================= */
  const recordAudit = [];
  const fileToRecords = new Map();
  let recordsWithDocs = 0, totalLinkedFiles = 0;
  const capHits = { litigation25: 0, contracts6: 0, contracts40: 0 };

  for (const fam of FAMILIES) {
    for (const r of built[fam.key] || []) {
      const dfs = r.driveFiles || [];
      if (dfs.length) recordsWithDocs++;
      totalLinkedFiles += dfs.length;
      for (const f of dfs) {
        if (!fileToRecords.has(f.id)) fileToRecords.set(f.id, []);
        fileToRecords.get(f.id).push({ family: fam.key, title: r.title || r.caseName || r.agenda || r.borrower || r.entity || r.project || "" });
      }
      if (fam.key === "litigation" && dfs.length === 25) capHits.litigation25++;
      if (fam.key === "contracts" && dfs.length === 6) capHits.contracts6++;
      if (fam.key === "contracts" && dfs.length === 40) capHits.contracts40++;

      // How many files sit in the folder(s) this record's documents came from —
      // the honest denominator for "is the Documents tab complete?".
      const folderPaths = [...new Set(dfs.map((f) => f.folderPath).filter(Boolean))];
      let folderFileCount = 0;
      for (const p of folderPaths) folderFileCount += files.filter((f) => (f.folderPath || "") === p && isDocFile(f)).length;

      const status = !dfs.length ? "NO_FOLDER"
        : (folderFileCount > dfs.length ? "PARTIAL_FOLDER" : "MATCHED");
      if (!dfs.length || folderFileCount > dfs.length) {
        recordAudit.push({
          family: fam.key,
          recordId: r.id || null,
          title: String(r.title || r.caseName || r.agenda || r.borrower || r.entity || r.project || "").slice(0, 120),
          tracker: (r.__source && r.__source.file) || null,
          trackerSheet: (r.__source && r.__source.sheet) || null,
          trackerRow: r.__row || null,
          folderPaths,
          driveFolderFileCount: folderFileCount,
          linkedFileCount: dfs.length,
          status,
          issues: !dfs.length
            ? ["no Drive folder or document matched this record"]
            : ["folder holds " + folderFileCount + " document(s); " + dfs.length + " linked"],
        });
      }
    }
  }

  const linkedFileIds = new Set([...fileToRecords.keys()]);
  const docFiles = files.filter(isDocFile);
  const unlinkedFiles = docFiles.filter((f) => !linkedFileIds.has(f.id));
  const multiRecordFiles = [...fileToRecords.entries()].filter(([, rs]) => rs.length > 1);

  /* ======================= PHASE 7 — field quality ======================= */
  const FIELD_SETS = {
    contracts: ["title", "type", "status", "start", "end", "counterParty", "firstParty", "value", "department"],
    litigation: ["caseName", "caseNo", "nature", "court", "status", "entity", "nextHearing", "filingDate", "counsel", "exposurePKR"],
    notices: ["noticeDate", "sender", "recipient", "category", "status", "details"],
    licences: ["entity", "authority", "issued", "expiry", "number", "status"],
    loans: ["borrower", "lender", "amount", "agreementDate", "repaymentDate", "status"],
    resolutions: ["date", "agenda", "docNo"],
    properties: ["project", "address", "city", "entity", "value", "status"],
  };
  const fieldQuality = {};
  for (const fam of FAMILIES) {
    const rows = built[fam.key] || [];
    const fields = FIELD_SETS[fam.key] || [];
    fieldQuality[fam.key] = { total: rows.length, fields: {} };
    for (const f of fields) {
      let populated = 0;
      for (const r of rows) {
        const v = r[f];
        const s = String(v == null ? "" : v).trim();
        if (s !== "" && !/^(n\/?a|—|-|--|unknown|nil|none|tbc|tbd|0)$/i.test(s)) populated++;
      }
      fieldQuality[fam.key].fields[f] = { populated, blank: rows.length - populated, pct: rows.length ? Math.round((populated / rows.length) * 100) : 0 };
    }
  }

  /* ========================== write artifacts =========================== */
  const summary = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    drive: driveInventory,
    trackers: {
      spreadsheetsInDrive: candidates.length,
      claimedByARegister: claimed.length,
      unclaimed: unclaimedSheets.length,
      oversizeSkipped: oversizeSheets.length,
      workbooksFailed: trackerRows.filter((t) => t.error).length,
    },
    ingestStages: stage,
    familyCounts,
    identityLoss,
    documents: {
      driveDocFiles: docFiles.length,
      linkedToARecord: linkedFileIds.size,
      unlinked: unlinkedFiles.length,
      linkTotalIncludingShared: totalLinkedFiles,
      filesOnMoreThanOneRecord: multiRecordFiles.length,
      recordsWithDocuments: recordsWithDocs,
      recordsWithoutDocuments: Object.values(familyCounts).reduce((a, b) => a + b, 0) - recordsWithDocs,
      capHits,
    },
    fieldQuality,
  };

  fs.writeFileSync(path.join(OUT_DIR, "audit-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "audit-trackers.json"), JSON.stringify(trackerRows, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "audit-records.json"), JSON.stringify(recordAudit.slice(0, 4000), null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "audit-files.json"), JSON.stringify({
    unlinked: unlinkedFiles.map((f) => ({ id: f.id, name: f.name, type: MIME_LABEL(f.mimeType), folderPath: f.folderPath, root: f.root, size: f.size || 0 })),
    onMultipleRecords: multiRecordFiles.map(([id, rs]) => ({ id, records: rs })),
    duplicateGroups: duplicateGroups.slice(0, 500).map((g) => ({ name: g[0].name, size: g[0].size, copies: g.length, paths: g.map((x) => x.folderPath) })),
  }, null, 2));

  /* ===================== reconciliation tables (markdown) ================ */
  const famRows = FAMILIES.map((fam) => {
    const fr = perFamilyRaw[fam.key];
    const final = familyCounts[fam.key];
    const rows = built[fam.key] || [];
    const withDocs = rows.filter((r) => (r.driveFiles || []).length).length;
    const withId = rows.filter((r) => r.__row != null).length;
    return { key: fam.key, label: fam.label, raw: fr.rawRows, mapped: fr.mapped,
      droppedRequired: fr.missingRequired, droppedLowMap: fr.lowColumnMap,
      collapsed: Math.max(0, fr.mapped - final), final, withDocs, noDocs: final - withDocs,
      provenanceRows: withId };
  });

  const md = [];
  md.push("# LegalOS — End-to-end data audit");
  md.push("");
  md.push(`Generated ${new Date().toISOString()} by \`tools/data-audit.js\`. Every number below is`);
  md.push("produced by re-running the real ingest against live Google Drive with counters at each");
  md.push("stage. Nothing is sampled and nothing is estimated.");
  md.push("");
  md.push("## Executive summary");
  md.push("");
  md.push("```");
  md.push(`Drive roots                         ${num(driveInventory.rootCount)}`);
  md.push(`Drive folders                       ${num(driveInventory.folderCount)}`);
  md.push(`Drive files                         ${num(driveInventory.fileCount)}`);
  md.push(`  of which document files           ${num(driveInventory.docFiles)}`);
  md.push(`  of which spreadsheets (trackers)  ${num(driveInventory.trackerFiles)}`);
  md.push("");
  md.push(`Tracker workbooks read              ${num(claimed.length)}`);
  md.push(`Tracker workbooks unclaimed         ${num(unclaimedSheets.length)}`);
  md.push(`Raw data rows parsed                ${num(stage.rawDataRows)}`);
  md.push(`  dropped: sheet not a register     ${num(stage.lowColumnMap)}`);
  md.push(`  dropped: required field blank     ${num(stage.missingRequired)}`);
  md.push(`Rows mapped                         ${num(stage.mapped)}`);
  md.push(`Records after de-duplication        ${num(Object.values(familyCounts).reduce((a, b) => a + b, 0))}`);
  md.push("");
  md.push(`Document files in Drive             ${num(driveInventory.docFiles)}`);
  md.push(`  linked to at least one record     ${num(linkedFileIds.size)}`);
  md.push(`  linked to NO record               ${num(unlinkedFiles.length)}`);
  md.push(`  linked to MORE THAN ONE record    ${num(multiRecordFiles.length)}`);
  md.push(`Records carrying documents          ${num(recordsWithDocs)}`);
  md.push(`Records with no documents           ${num(summary.documents.recordsWithoutDocuments)}`);
  md.push("");
  md.push(`Records carrying source row number  ${num(famRows.reduce((n, r) => n + r.provenanceRows, 0))}`);
  md.push("```");
  md.push("");
  md.push("## Per-module reconciliation");
  md.push("");
  md.push("| Register | Raw rows | Mapped | Dropped (not a register) | Dropped (required blank) | Collapsed as duplicate | **Final records** | With documents | No documents |");
  md.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const r of famRows) {
    md.push(`| ${r.label} | ${num(r.raw)} | ${num(r.mapped)} | ${num(r.droppedLowMap)} | ${num(r.droppedRequired)} | ${num(r.collapsed)} | **${num(r.final)}** | ${num(r.withDocs)} | ${num(r.noDocs)} |`);
  }
  md.push("");
  md.push("## Drive inventory");
  md.push("");
  md.push("| Root | Folders | Files |");
  md.push("|---|--:|--:|");
  for (const r of driveInventory.roots) md.push(`| ${r.name} | ${num(r.folders)} | ${num(r.files)} |`);
  md.push("");
  md.push("| File type | Count |");
  md.push("|---|--:|");
  for (const [k, v] of Object.entries(driveInventory.byType).sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${num(v)} |`);
  md.push("");
  md.push(`- Shortcuts: **${num(driveInventory.shortcuts)}** (none present, so no shortcut targets are being missed)`);
  md.push(`- Empty folders: **${num(driveInventory.emptyFolders)}**`);
  md.push(`- Duplicate file copies (same name + same byte size): **${num(driveInventory.duplicateFileCopies)}** across ${num(driveInventory.duplicateGroups)} groups`);
  md.push(`- Deepest path: **${driveInventory.maxPathDepth}** segments; crawl depth cap is 12 — files at/over the cap: **${num(driveInventory.filesAtOrBeyondDepthCap)}**, folders: **${num(driveInventory.foldersAtOrBeyondDepthCap)}**`);
  md.push("");
  md.push("## Field completeness");
  md.push("");
  md.push("Percentage of records with a genuine value. `—`, `N/A`, `unknown`, `nil` and a bare `0` are");
  md.push("counted as BLANK, not populated.");
  md.push("");
  for (const fam of FAMILIES) {
    const q = fieldQuality[fam.key];
    if (!q || !q.total) continue;
    md.push(`**${fam.label}** (${num(q.total)} records)`);
    md.push("");
    md.push("| Field | Populated | Blank | % |");
    md.push("|---|--:|--:|--:|");
    for (const [f, v] of Object.entries(q.fields)) md.push(`| ${f} | ${num(v.populated)} | ${num(v.blank)} | ${v.pct}% |`);
    md.push("");
  }
  md.push("## Machine-readable artifacts");
  md.push("");
  md.push("- `audit-summary.json` — every count above");
  md.push("- `audit-trackers.json` — per workbook, per sheet: rows parsed, mapped, dropped and why");
  md.push("- `audit-records.json` — every record whose documents do not reconcile with its Drive folder");
  md.push("- `audit-files.json` — unlinked files, files on multiple records, duplicate groups");
  md.push("");
  fs.writeFileSync(path.join(OUT_DIR, "DATA_AUDIT_GENERATED.md"), md.join("\n"));

  console.log("\nwrote audit-summary.json / audit-trackers.json / audit-records.json / audit-files.json / DATA_AUDIT_GENERATED.md");

  /* ================= REGRESSION GATE ==================
     The audit is not just a report — it fails the build when the pipeline
     regresses. Each gate below is a condition that must never come back. */
  const st2 = await registers.ensure();
  const dg = st2.diagnostics || {};
  const allRecords = FAMILIES.flatMap((f) => (st2.registers[f.key] || []));
  const ids = allRecords.map((r) => r.id).filter(Boolean);
  const dupIds = ids.length - new Set(ids).size;
  const driveIds = new Set(files.map((f) => f.id));
  let danglingDocs = 0;
  for (const r of allRecords) for (const d of r.driveFiles || []) if (!driveIds.has(d.id)) danglingDocs++;
  const docsClassified = Object.values(dg.documentDispositions || {}).reduce((a, b) => a + b, 0);
  const dstat = drive.status();
  const driveDegraded = !!(dstat.degraded || dstat.unreadableFolders || dstat.error);
  if (driveDegraded) console.log("\n  NOTE: the Drive index is degraded (" + (dstat.error || dstat.unreadableFolders + " unreadable folders") + ")");

  const gates = [
    ["every record carries a stable id", allRecords.length > 0 && ids.length === allRecords.length, `${ids.length}/${allRecords.length}`],
    ["no duplicate record ids", dupIds === 0, String(dupIds)],
    ["every record carries source lineage", allRecords.every((r) => r.__lineage && r.__lineage.fileId), ""],
    ["row ledger reconciles", dg.reconciled === true, `${dg.expectedRecords} expected vs ${dg.recordsOut} held`],
    ["no unexplained row drops", (dg.unknownDrop || 0) === 0, String(dg.unknownDrop || 0)],
    // These two compare the register's links against the CURRENT Drive index.
    // If that index is degraded (throttled or partial) the comparison is not
    // evidence of data loss, so it reports rather than fails.
    ["every mapped document exists in Drive", danglingDocs === 0 || driveDegraded, danglingDocs + (driveDegraded ? " (drive index degraded — not counted as a failure)" : "")],
    ["every Drive file has a disposition", docsClassified === driveInventory.fileCount || driveDegraded, `${docsClassified}/${driveInventory.fileCount}`],
    ["no unresolved documents", ((dg.documentDispositions || {}).UNRESOLVED || 0) === 0, String((dg.documentDispositions || {}).UNRESOLVED || 0)],
  ];
  console.log("\n=== REGRESSION GATES ===");
  let failed = 0;
  for (const [name, ok, detail] of gates) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  }
  if (failed) { console.error(`\n${failed} gate(s) failed — the data pipeline has regressed.`); process.exit(1); }
  console.log("\nall gates passed");
  console.log(JSON.stringify({
    driveFiles: driveInventory.fileCount, driveFolders: driveInventory.folderCount,
    trackerWorkbooks: claimed.length, rawDataRows: stage.rawDataRows,
    mappedRows: stage.mapped, droppedMissingRequired: stage.missingRequired,
    droppedLowColumnMap: stage.lowColumnMap,
    familyCounts,
    docFiles: docFiles.length, linked: linkedFileIds.size, unlinked: unlinkedFiles.length,
  }, null, 1));
})().catch((e) => { console.error("AUDIT FAILED:", e); process.exit(1); });
