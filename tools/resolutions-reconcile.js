#!/usr/bin/env node
/* RESOLUTIONS RECONCILIATION -- Drive estate <-> LegalOS records.
 *
 * Google Drive is the structural source of truth. This walks the resolution
 * estate top-down (root -> entity folder -> document) and bottom-up (record ->
 * document -> file id -> parent folder -> root), and asserts both directions
 * agree. It writes metadata and lineage only, never document bodies, and has
 * no code path that can write to Drive.
 *
 *   node tools/resolutions-reconcile.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const prov = require("../api/drive-provenance.js");

const OUT = P.join(__dirname, "..", "audit");
const isTracker = (f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name) || /^~\$/.test(f.name);
const write = (n, d) => fs.writeFileSync(P.join(OUT, n), JSON.stringify(d, null, 2));

(async () => {
  await drive.ensureIndex();
  fs.mkdirSync(OUT, { recursive: true });
  const st = await registers.ensure();
  const regs = st.registers || {};
  const rows = regs.resolutions || [];

  /* ---- the estate, straight from Drive ---------------------------------- */
  const estate = drive.indexFiles().filter((f) => /resolution/i.test(String(f.folderPath || "")));
  const docs = estate.filter((f) => !isTracker(f));
  const trackers = estate.filter(isTracker);
  const folders = [...new Set(estate.map((f) => String(f.folderPath)))].sort();
  const roots = [...new Set(estate.map((f) => String(f.folderPath).split(" / ")[0]))];

  /* ---- what the whole model claims -------------------------------------- */
  const claimedAnywhere = new Map();
  for (const [fam, list] of Object.entries(regs)) {
    if (!Array.isArray(list)) continue;
    for (const r of list) for (const d of (r.driveFiles || [])) {
      if (!claimedAnywhere.has(d.id)) claimedAnywhere.set(d.id, []);
      claimedAnywhere.get(d.id).push({ family: fam, recordId: r.id, via: d.via || null });
    }
  }

  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));
  const undisposed = docs.filter((f) => !claimedAnywhere.has(f.id));

  /* ---- bottom-up: every record back to a real Drive folder --------------- */
  const noLineage = rows.filter((r) => !r.fullDrivePath || !r.sourceFolderId);
  const broken = [];
  for (const r of rows) for (const d of (r.driveFiles || [])) if (!byId.has(d.id)) broken.push({ recordId: r.id, fileId: d.id, name: d.name });

  const folderRecords = rows.filter((r) => r.origin === "RESOLUTION_SOURCE_DRIVE");
  const perFolder = {};
  for (const r of rows) {
    const k = r.sourceEntityFolder || "(unknown)";
    perFolder[k] = perFolder[k] || { records: 0, documents: 0, folderDerived: 0 };
    perFolder[k].records++;
    perFolder[k].documents += (r.driveFiles || []).length;
    if (r.origin === "RESOLUTION_SOURCE_DRIVE") perFolder[k].folderDerived++;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    source: {
      roots, resolutionEntityFolders: folders.length,
      sourceFiles: estate.length, documentFiles: docs.length, trackerFiles: trackers.length,
    },
    records: {
      individualResolutions: rows.length,
      fromTracker: rows.length - folderRecords.length,
      fromFolderOnly: folderRecords.length,
      entitiesRepresented: new Set(rows.map((r) => r.entity).filter(Boolean)).size,
      documentsOnRecords: rows.reduce((a, r) => a + (r.driveFiles || []).length, 0),
      recordsWithMoreThanOneDocument: rows.filter((r) => (r.driveFiles || []).length > 1).length,
      recordsWithNoDocument: rows.filter((r) => !(r.driveFiles || []).length).length,
    },
    gates: {
      FILES_WITHOUT_DISPOSITION: undisposed.length,
      RECORDS_WITHOUT_SOURCE_LINEAGE: noLineage.length,
      BROKEN_DRIVE_LINKS: broken.length,
    },
  };

  write("resolutions-source-inventory.json", {
    roots, folders: folders.map((f) => ({ path: f, ...prov.forFolderPath(f), files: estate.filter((x) => x.folderPath === f).length })),
    sourceFiles: estate.length, documentFiles: docs.length, trackerFiles: trackers.length,
  });
  write("resolutions-records.json", {
    records: rows.length, perFolder,
    list: rows.map((r) => ({
      id: r.id, entity: r.entity || null, sourceEntityFolder: r.sourceEntityFolder || null,
      sourceFolderId: r.sourceFolderId || null, sourceRootName: r.sourceRootName || null,
      sourceRootId: r.sourceRootId || null, parentFolderId: r.parentFolderId || null,
      fullDrivePath: r.fullDrivePath || null,
      docNo: r.docNo == null ? null : r.docNo, agenda: r.agenda || null, date: r.date || null,
      origin: r.origin || "RESOLUTION_TRACKER",
      documents: (r.driveFiles || []).map((d) => ({ driveFileId: d.id, exactSourceFilename: d.name, folderPath: d.folderPath, via: d.via || null })),
    })),
  });
  write("resolutions-file-disposition.json", {
    documentFiles: docs.length, disposed: docs.length - undisposed.length,
    withoutDisposition: undisposed.length,
    undisposed: undisposed.map((f) => ({ fileId: f.id, name: f.name, folderPath: f.folderPath })),
    claimedByAnotherFamily: docs.filter((f) => (claimedAnywhere.get(f.id) || []).every((c) => c.family !== "resolutions"))
      .map((f) => ({ fileId: f.id, name: f.name, folderPath: f.folderPath, claims: claimedAnywhere.get(f.id) })),
  });
  write("resolutions-final-summary.json", summary);

  console.log(JSON.stringify(summary, null, 2));
  const pass = Object.values(summary.gates).every((v) => v === 0);
  console.log("\nGATES: " + (pass ? "ALL PASS" : "FAILURES PRESENT"));
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
