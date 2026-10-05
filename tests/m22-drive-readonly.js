// GOOGLE DRIVE IS THE SOURCE OF TRUTH, AND THIS RECONCILIATION NEVER WRITES TO IT.
//
// The estate LegalOS reads is the company's real statutory and compliance
// record. A reconciliation that "tidied" it -- renamed a folder to match a
// register, moved a misfiled file to the company it belongs to, deleted a
// duplicate -- would destroy the only evidence of how the business actually
// filed. LegalOS adapts to Drive. Drive is not changed to fit LegalOS.
//
// WHAT THESE CHECKS HOLD IN PLACE
//
//   THE CREDENTIAL CANNOT WRITE. The service account requests
//   drive.readonly and nothing else, so no bug in this application can alter
//   the source. That is a structural guarantee, not a convention, and this
//   test fails the moment the scope widens.
//
//   NO WRITE VERB EXISTS. No code path calls files.create, files.update,
//   files.delete, files.copy, or moves a parent.
//
//   THE ESTATE IS IDENTICAL AFTER A FULL RECONCILIATION. Every file id, every
//   containing folder id and every parent folder id is the same before and
//   after the model is built end to end.
//
//   A MISFILED FILE KEEPS ITS PATH. Two companies are filed inside another
//   company's folder. LegalOS attributes their records correctly AND reports
//   the Drive path unchanged -- it never pretends the file lives elsewhere.
//
//   node tests/m22-drive-readonly.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");

H.runSuite("m22-drive-readonly — the source estate is never modified", async (ctx) => {
  const { check } = ctx;

  /* ---- 1. the credential itself cannot write ----------------------------- */
  const google = fs.readFileSync(P.join(ROOT, "api", "google.js"), "utf8");
  const scopes = [...google.matchAll(/https:\/\/www\.googleapis\.com\/auth\/[\w.]+/g)].map((m) => m[0]);
  check("the service account requests read-only Drive access and nothing more",
    scopes.length > 0 && scopes.every((s) => /drive\.readonly$/.test(s)),
    scopes.join(", ") || "no scope found");

  /* ---- 2. no write verb anywhere in the server --------------------------- */
  const WRITE = /files\.(create|update|delete|copy)\b|addParents|removeParents|\bsupportsAllDrives=true&uploadType|uploadType=(media|multipart|resumable)/;
  const offenders = [];
  for (const f of fs.readdirSync(P.join(ROOT, "api"))) {
    if (!f.endsWith(".js")) continue;
    const src = fs.readFileSync(P.join(ROOT, "api", f), "utf8");
    // Strip comments so prose describing what is NOT done cannot fail the test.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (WRITE.test(code)) offenders.push(f);
  }
  check("no server module invokes a Drive write",
    offenders.length === 0, offenders.length ? "writes in: " + offenders.join(", ") : "none of the api modules write to Drive");

  /* ---- 3. the estate is byte-for-byte the same after a full build -------- */
  const drive = require(P.join(ROOT, "api", "drive.js"));
  const prov = require(P.join(ROOT, "api", "drive-provenance.js"));
  await drive.ensureIndex();
  const snapshot = () => drive.indexFiles()
    .map((f) => {
      const p = prov.forFile(f);
      return [p.driveFileId, p.sourceFolderId, p.parentFolderId, p.sourceRootId, p.exactSourceFilename, p.fullDrivePath].join("\u0001");
    }).sort().join("\n");

  const before = snapshot();
  const records = require(P.join(ROOT, "api", "secp-records.js"));
  const resolutions = require(P.join(ROOT, "api", "resolution-documents.js"));
  const annual = records.annualCompliance();
  const events = records.eventFilings();
  const regs = records.statutoryRegisters();
  // and the resolutions estate, bifurcated per entity folder
  const resFiles = drive.indexFiles().filter((f) => /Resolution/i.test(String(f.folderPath || "")));
  const byFolder = new Map();
  for (const f of resFiles) {
    const k = String(f.folderPath);
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k).push(f);
  }
  let resolutionDocs = 0;
  for (const [k, files] of byFolder) resolutionDocs += resolutions.bifurcate(files, k.split(" / ").pop()).total;
  const after = snapshot();

  check("every Drive file id, folder id and parent id is unchanged by the reconciliation",
    before === after,
    drive.indexFiles().length + " files snapshotted before and after building "
      + (annual.length + events.length + regs.length) + " SECP records and " + resolutionDocs + " resolution documents");

  /* ---- 4. normalization never rewrites a source path --------------------- */
  const docs = [...annual, ...events, ...regs].flatMap((r) => r.documents || []);
  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));
  const rewritten = docs.filter((d) => {
    const f = byId.get(d.driveFileId);
    return !f || d.fullDrivePath !== f.path || d.exactSourceFilename !== f.name;
  });
  check("every document reports the exact path and filename Drive holds",
    rewritten.length === 0,
    docs.length + " documents checked, " + rewritten.length + " with a rewritten path or name");

  /* ---- 5. a misfiled file keeps its Drive path --------------------------- */
  const misfiled = docs.filter((d) => d.sourceLocationMismatch);
  check("a file filed under another company reports where it really sits",
    misfiled.length > 0 && misfiled.every((d) => d.filedUnder && d.fullDrivePath.startsWith(d.filedUnder)),
    misfiled.length + " files sit inside another entity's folder; each reports that folder as its source path");

  /* ---- 6. full provenance on every record and document ------------------- */
  const FIELDS = ["driveFileId", "exactSourceFilename", "fullDrivePath", "sourceRootId",
    "sourceRootName", "sourceFolderId", "sourceFolderName", "parentFolderId"];
  const incomplete = docs.filter((d) => FIELDS.some((f) => !d[f]));
  check("every document carries its full Drive provenance",
    incomplete.length === 0, docs.length + " documents, " + incomplete.length + " missing a provenance field");

  const noLineage = [...annual, ...events, ...regs].filter((r) => !r.source || !r.source.sourceFolderId);
  check("every record names the Drive folder it was built from",
    noLineage.length === 0,
    (annual.length + events.length + regs.length) + " records, " + noLineage.length + " without Drive lineage");
});
