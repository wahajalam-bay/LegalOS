// RESOLUTIONS: THE DRIVE FOLDER IS THE SOURCE, THE TRACKER IS ONE INDEX OF IT.
//
// WHAT THESE CHECKS ARE HOLDING IN PLACE
//
//   THE ESTATE SPANS TWO ROOTS. Resolution folders live under BOTH
//   "Compliance Data _LegalOS / Resolutions" and each company's own
//   "<entity>-Resolutions & Authorizations" folder in the SECP root. The
//   document sweep was restricted to the compliance root, so every resolution
//   filed in the other one resolved to no document at all.
//
//   A RESOLUTION IS RARELY ONE FILE. The matcher attached the first file it
//   found and stopped. A resolution has the resolution, the board minute, the
//   notice, the signed copy, the acknowledgement -- capping at one hid the rest.
//
//   A TRACKER IS NOT REQUIRED FOR A RECORD TO EXIST. Companies that file
//   resolutions in Drive without maintaining the summary sheet had NO records:
//   Dubizzle Labs' entire board-resolution history and eight of Zameen
//   Medallion's, 33 documents, were invisible. The folder is the source index.
//
//   A DERIVED RECORD MUST NOT BE RE-MATCHED. Running the tracker matcher over
//   a folder-derived record re-attached by agenda tokens and overwrote its
//   documents -- the record built from an unnumbered "Novation & Renewal" PDF
//   ended up citing the numbered 99.3 one, leaving its own file mapped to
//   nothing.
//
//   THE NUMBER GRAMMAR IS THE COMPANY'S. 002, 02, 99.1 (a sub-number) and 129A
//   (a companion document) all belong to their resolution.
//
//   node tests/m23-resolutions-source.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const audit = (n) => { try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8")); } catch (e) { return null; } };

H.runSuite("m23-resolutions-source — every resolution, from the folder that holds it", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_RES_PORT", portFallback: "4880", prefix: "legalos-res-",
  }));
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);
  const rows = ((await H.request(sb.base, "GET", "/api/registers/resolutions?limit=5000", { cookie })).body || {}).records || [];

  const sum = audit("resolutions-final-summary.json");
  const disp = audit("resolutions-file-disposition.json");

  /* ---- 1. the estate ----------------------------------------------------- */
  check("the resolution estate is crawled across every root that holds one",
    !!sum && sum.source.roots.length >= 2 && sum.source.resolutionEntityFolders > 40,
    sum ? sum.source.resolutionEntityFolders + " entity folders across roots ["
      + sum.source.roots.join(", ") + "], " + sum.source.documentFiles + " documents" : "summary missing");

  /* ---- 2. one record per resolution, not per folder ---------------------- */
  check("an entity folder yields many resolutions, never one record",
    !!sum && sum.records.individualResolutions > sum.source.resolutionEntityFolders * 5,
    sum ? sum.records.individualResolutions + " individual resolutions over "
      + sum.source.resolutionEntityFolders + " entity folders" : "-");

  /* ---- 3. a tracker is not required -------------------------------------- */
  check("a resolution with no tracker row still becomes a record",
    !!sum && sum.records.fromFolderOnly > 0,
    sum ? sum.records.fromTracker + " indexed by a tracker, "
      + sum.records.fromFolderOnly + " derived from the folder alone" : "-");
  const derived = rows.filter((r) => r.origin === "RESOLUTION_SOURCE_DRIVE");
  check("a folder-derived record says so rather than posing as tracker-indexed",
    derived.length > 0 && derived.every((r) => r.sourceIndex === "NO_TRACKER_ROW" && r.__quality === "INCOMPLETE_SOURCE"),
    derived.length + " folder-derived records, all INCOMPLETE_SOURCE / NO_TRACKER_ROW");
  check("a folder-derived record names the document it was ingested from",
    derived.every((r) => r.__source && r.__source.fileId && r.__source.file),
    derived.filter((r) => !(r.__source && r.__source.fileId)).length + " without a source file id");
  check("a folder-derived record keeps the documents it was built from",
    derived.length > 0 && derived.every((r) => (r.driveFiles || []).length > 0),
    derived.filter((r) => !(r.driveFiles || []).length).length + " folder-derived records lost their documents");

  /* ---- 4. a resolution carries every document that belongs to it --------- */
  check("a resolution is not capped at one document",
    !!sum && sum.records.recordsWithMoreThanOneDocument > 0,
    sum ? sum.records.documentsOnRecords + " documents across "
      + sum.records.individualResolutions + " resolutions; "
      + sum.records.recordsWithMoreThanOneDocument + " carry more than one" : "-");

  /* ---- 5. Drive lineage, both directions -------------------------------- */
  check("RESOLUTION RECORD WITHOUT SOURCE PATH = 0",
    !!sum && sum.gates.RECORDS_WITHOUT_SOURCE_LINEAGE === 0,
    sum ? sum.gates.RECORDS_WITHOUT_SOURCE_LINEAGE + " records without Drive lineage" : "-");
  check("every resolution document resolves to a live Drive file",
    !!sum && sum.gates.BROKEN_DRIVE_LINKS === 0,
    sum ? sum.gates.BROKEN_DRIVE_LINKS + " broken links" : "-");
  check("every document in the resolution estate has a disposition",
    !!sum && sum.gates.FILES_WITHOUT_DISPOSITION === 0,
    sum ? sum.source.documentFiles + " documents, " + sum.gates.FILES_WITHOUT_DISPOSITION + " without disposition" : "-");
  check("a document claimed by another family is recorded as such, not lost",
    !!disp && Array.isArray(disp.claimedByAnotherFamily),
    disp ? disp.claimedByAnotherFamily.length + " documents in a resolution folder belong to another register "
      + "(a Novation & Renewal agreement is a contract, not a board resolution)" : "-");

  /* ---- 6. the source folder is preserved verbatim ------------------------ */
  const withSource = rows.filter((r) => r.sourceEntityFolder);
  check("every record names the exact Drive folder it came from",
    withSource.length === rows.length,
    rows.length + " records, " + (rows.length - withSource.length) + " without a source folder name");
  check("the display entity is canonical while the source folder stays verbatim",
    rows.every((r) => !r.entity || !/resolution|authoris|authoriz/i.test(r.entity))
      && rows.some((r) => r.sourceEntityFolder && /resolution|authoris|authoriz/i.test(r.sourceEntityFolder)),
    "e.g. entity " + JSON.stringify((rows.find((r) => r.entity) || {}).entity)
      + " from folder " + JSON.stringify((rows.find((r) => r.entity) || {}).sourceEntityFolder));
  check("every record carries its Drive folder, parent and root ids",
    rows.every((r) => r.sourceFolderId && r.sourceRootId && r.fullDrivePath),
    rows.filter((r) => !(r.sourceFolderId && r.sourceRootId && r.fullDrivePath)).length + " records missing a Drive id");
});
