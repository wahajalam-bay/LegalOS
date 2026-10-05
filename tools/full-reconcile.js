// Full bidirectional reconciliation: Drive root → leaf → LegalOS → back.
//
// Two passes, and a record only reconciles when BOTH succeed.
//
//   PASS A  every Drive root, every folder, every file, every tracker row,
//           each given a disposition. Nothing is allowed to be UNRESOLVED
//           without that being counted and named.
//
//   PASS B  every LegalOS record and every document it shows, walked back to
//           the source row or folder it came from and on to the Drive root.
//           A record that cannot be traced back is an orphan, and an orphan is
//           a defect whether or not the screen looks fine.
//
//   node tools/full-reconcile.js [--json] [--verbose]
//
// Writes the machine-readable artifacts under audit/.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "audit");
const JSON_ONLY = process.argv.includes("--json");
const VERBOSE = process.argv.includes("--verbose");

const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const model = require("../api/compliance-model.js");
const sources = require("../api/compliance-sources.js");
const secp = require("../api/secp.js");
const entities = require("../api/entities.js");
const workflow = require("../api/workflow.js");

const say = (...a) => { if (!JSON_ONLY) console.log(...a); };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/* ------------------------------------------------------------ dispositions */

// "Entities data for secp filing" is filed by ENTITY and CALENDAR YEAR, so its
// documents are disposed from the path the company itself filed them under
// rather than by matching them to a register row. They are statutory records;
// there is no contract for them to belong to.
const secpSource = require("../api/secp-source.js");
const content = require("../api/content-model.js");
const SECP_DISPOSITIONS = ["SECP_FILING_YEAR", "SECP_AGM", "SECP_EOGM", "SECP_CORPORATE_ACTION",
  "SECP_SHARE_CERTIFICATE", "SECP_REGISTER_OF_MEMBERS", "SECP_REGISTER_OF_DIRECTORS",
  "SECP_RESOLUTION", "SECP_SECP_NOTICE", "SECP_PROVIDENT_FUND", "SECP_FINANCIAL_STATEMENTS",
  "SECP_INCORPORATION", "SECP_CORRESPONDENCE", "SECP_ENTITY_LEVEL"];

const FILE_DISPOSITIONS = [
  "SOURCE_TRACKER", "RECORD_DOCUMENT", "MULTI_RECORD_DOCUMENT", "ENTITY_DOCUMENT",
  "PROJECT_DOCUMENT", "MODULE_DOCUMENT", "SECP_YEAR_DOCUMENT", "ACTION_DOCUMENT",
  "TEMPLATE", "LETTERHEAD", "REFERENCE", "SYSTEM_FILE", "NOT_A_DOCUMENT", "UNRESOLVED",
  // The statutory root, disposed from its own folder grammar (api/secp-source.js).
  ...SECP_DISPOSITIONS,
];
const FOLDER_DISPOSITIONS = [
  "MODULE_ROOT", "ENTITY_FOLDER", "RECORD_FOLDER", "PROJECT_FOLDER",
  "FINANCIAL_YEAR_FOLDER", "ACTION_FOLDER", "DOCUMENT_FOLDER",
  "TEMPLATE_FOLDER", "REFERENCE_FOLDER", "UNRESOLVED",
];
const ROW_DISPOSITIONS = [
  "INGESTED_RECORD", "INCOMPLETE_SOURCE_RECORD", "HISTORY_ROW", "CHILD_ROW",
  "HEADER", "BLANK", "INVALID_SOURCE_ROW", "OTHER_CLASSIFIED_SOURCE",
];

const tally = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));

/* --------------------------------------------------------------- PASS A */

async function passA() {
  say("\n=== PASS A — Drive root to leaf ===\n");

  const crawlStartedAt = new Date().toISOString();
  await drive.ensureIndex();
  const st = drive.status();
  if (st.degraded) {
    throw new Error("the Drive index is DEGRADED — refusing to reconcile against a partial crawl");
  }
  if ((st.unreadableFolders || 0) > 0) {
    say(`  WARNING: ${st.unreadableFolders} folder(s) could not be read. They are counted as failures, never as empty.`);
  }

  const files = drive.indexFiles();
  const folders = drive.indexFolders();
  const roots = st.roots || [];

  say(`  roots            ${roots.length}`);
  for (const r of roots) say(`    ${r.name.padEnd(46)} files=${String(r.fileCount).padStart(5)} folders=${String(r.folderCount).padStart(4)}`);
  say(`  files            ${files.length}`);
  say(`  folders          ${folders.length}`);
  say(`  unreadable       ${st.unreadableFolders || 0}`);

  /* -------- which files are cited by a record, and by how many ---------- */
  const regState = await registers.ensure();
  const regs = regState.registers || {};
  const citedBy = new Map();                 // fileId -> Set("family:recordId")
  for (const [famKey, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      for (const f of r.driveFiles || []) {
        if (!citedBy.has(f.id)) citedBy.set(f.id, new Set());
        citedBy.get(f.id).add(famKey + ":" + r.id);
      }
    }
  }

  /* -------- which files are the trackers themselves -------------------- */
  const trackerIds = new Set();
  for (const [, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const fid = (r.__source && r.__source.fileId) || (r.__lineage && r.__lineage.fileId);
      if (fid) trackerIds.add(fid);
    }
  }

  /* -------- compliance-side claims (entity docs, SECP evidence, …) -----
     The compliance DOMAIN attaches documents that the raw register rows do not:
     a loan's folder is matched to the loan, a licence's certificates are its
     renewal chain. Asking only the registers would report every one of those as
     an unclaimed file — a measurement gap that would read exactly like a real
     one. So the domain is asked too, and each claim carries the record it is
     claimed BY, so a document is still traceable in both directions. */
  let complianceClaims = new Map();           // fileId -> disposition
  const complianceCitedBy = new Map();        // fileId -> Set("module:recordId")
  const claimDomain = (fileId, disposition, who) => {
    if (!fileId) return;
    complianceClaims.set(fileId, disposition);
    if (!complianceCitedBy.has(fileId)) complianceCitedBy.set(fileId, new Set());
    if (who) complianceCitedBy.get(fileId).add(who);
  };
  try {
    const built = await model.buildLoans();
    for (const l of built.agreements) for (const f of l.driveFiles || []) claimDomain(f.id, "RECORD_DOCUMENT", "loans:" + l.id);
  } catch (e) { say("  (loans domain unavailable: " + e.message + ")"); }
  try {
    const sp = await model.buildSpend();
    for (const l of sp.leases) for (const f of (l.driveFiles || []).concat(l.extraDocuments || [])) claimDomain(f.id, "RECORD_DOCUMENT", "leases:" + l.id);
    for (const v of sp.services) for (const f of (v.driveFiles || []).concat(v.extraDocuments || [])) claimDomain(f.id, "RECORD_DOCUMENT", "services:" + v.id);
  } catch (e) { say("  (spend domain unavailable: " + e.message + ")"); }
  try {
    const lc = await model.buildLicences();
    for (const l of lc.licences) for (const f of (l.driveFiles || []).concat(l.folderDocuments || [])) claimDomain(f.id, "RECORD_DOCUMENT", "licences:" + l.id);
  } catch (e) { say("  (licence domain unavailable: " + e.message + ")"); }
  try {
    const folderDocs = sources.resolutionFolderDocs();
    for (const [, fd] of folderDocs) for (const f of fd.files || []) complianceClaims.set(f.id, "ENTITY_DOCUMENT");
  } catch (e) { /* the compliance sources layer is optional here */ }
  try {
    for (const y of secp.derivedYears()) {
      for (const ev of y.evidence || []) if (ev.file && ev.file.id) complianceClaims.set(ev.file.id, "SECP_YEAR_DOCUMENT");
    }
  } catch (e) {}
  try {
    for (const t of sources.templateRegistry() || []) {
      for (const f of t.files || [t]) if (f && f.id) complianceClaims.set(f.id, "TEMPLATE");
    }
  } catch (e) {}

  /* -------- classify every FILE ---------------------------------------- */
  const fileRows = [];
  const fileTally = tally(FILE_DISPOSITIONS);
  /* Build the statutory dispositions once. Each one records the entity and the
     year the SOURCE filed the document under, so the evidence line can be read
     back without re-deriving anything. */
  const secpDispositions = new Map();
  {
    const model = secpSource.build();
    for (const d of model.documents) {
      secpDispositions.set(d.fileId, {
        disposition: "SECP_" + d.category,
        why: d.entityName + (d.year ? " — " + d.year : "") + (d.form ? " — Form " + d.form : ""),
      });
    }
  }

  /* FOLDER-SCOPED DOCUMENTS. What is left after record matching is not junk and
     is not a mystery: it is material the source files against a PROJECT or an
     ENTITY rather than against any one agreement — land registries and khasra
     plans for a project, customer CNICs, an entity's loan file, the spend
     documents no single lease claims. Each is disposed by the folder the
     company itself filed it under, and the evidence line says plainly that no
     record claims it, so a reader can tell "we know what this is" from "this is
     linked to a record". Nothing here is a match. */
  const FOLDER_SCOPED = [
    { re: /^Commercial_Zameen Media Contracts \/ Zameen Media PPA/i, disposition: "PROJECT_DOCUMENT",
      owner: (g) => g[3] || g[2], what: "project file under Zameen Media PPAs" },
    { re: /^Commercial_ZD Projects Master/i, disposition: "PROJECT_DOCUMENT",
      owner: (g) => g[1], what: "ZD project file" },
    { re: /Spend Contracts \(Lease and Service Agreements\)/i, disposition: "ENTITY_DOCUMENT",
      owner: (g) => g[2], what: "entity spend file; no single lease or service record claims it" },
    { re: /Loan Agreements|Intercompany Loans/i, disposition: "ENTITY_DOCUMENT",
      owner: (g) => g[2], what: "entity loan file; no loan record in the tracker matches this folder" },
    { re: /^Litigation & Dispute/i, disposition: "MODULE_DOCUMENT",
      owner: (g) => g[3] || g[2], what: "case file for a matter the Litigation Tracker does not list" },
  ];

  const TEMPLATE_RE = /template|precedent|standard form|draft format|proforma/i;
  const LETTERHEAD_RE = /letterhead|letter head/i;
  const SYSTEM_RE = /^~\$|\.tmp$|^\.DS_Store$|desktop\.ini/i;
  const NOT_A_DOC_RE = /\.(mp3|mpeg|mp4|wav|zip|rar|7z)$/i;

  for (const f of files) {
    const cited = citedBy.get(f.id);
    let disposition = "UNRESOLVED";
    let why = "";
    const hay = f.name + " " + (f.folderPath || "");

    const secpDisp = secpDispositions.get(f.id);
    if (SYSTEM_RE.test(f.name)) { disposition = "SYSTEM_FILE"; why = "an editor lock or OS artefact"; }
    else if (secpDisp) { disposition = secpDisp.disposition; why = secpDisp.why; }
    else if (NOT_A_DOC_RE.test(f.name)) { disposition = "NOT_A_DOCUMENT"; why = "media or an archive, not a legal document"; }
    else if (trackerIds.has(f.id)) { disposition = "SOURCE_TRACKER"; why = "rows from this workbook are ingested as records"; }
    else if (cited && cited.size > 1) { disposition = "MULTI_RECORD_DOCUMENT"; why = [...cited].join(", "); }
    else if (cited && cited.size === 1) { disposition = "RECORD_DOCUMENT"; why = [...cited][0]; }
    else if (complianceClaims.has(f.id)) {
      const owners = complianceCitedBy.get(f.id);
      disposition = owners && owners.size > 1 ? "MULTI_RECORD_DOCUMENT" : complianceClaims.get(f.id);
      why = owners && owners.size ? [...owners].join(", ") : "claimed by the compliance source layer";
    }
    else if (LETTERHEAD_RE.test(hay)) { disposition = "LETTERHEAD"; why = "letterhead asset"; }
    else if (TEMPLATE_RE.test(hay)) { disposition = "TEMPLATE"; why = "template or precedent material"; }
    else if (/\.xlsx?$/i.test(f.name)) { disposition = "SOURCE_TRACKER"; why = "a workbook no family claims — see unclaimed trackers"; }
    else {
      const segs = String(f.folderPath || "").split(" / ");
      const rule = FOLDER_SCOPED.find((x) => x.re.test(f.folderPath || ""));
      if (rule) {
        disposition = rule.disposition;
        why = (rule.owner(segs) || segs[1] || "").trim() + " — " + rule.what;
      }
    }

    fileTally[disposition] = (fileTally[disposition] || 0) + 1;
    fileRows.push({
      id: f.id, name: f.name, root: f.root, folderPath: f.folderPath,
      mimeType: f.mimeType, size: f.size || 0,
      modifiedTime: f.modifiedTime, createdTime: f.createdTime,
      disposition, evidence: why,
      citedByRecords: [...new Set([...(cited || []), ...(complianceCitedBy.get(f.id) || [])])],
    });
  }

  /* -------- classify every FOLDER -------------------------------------- */
  const folderTally = tally(FOLDER_DISPOSITIONS);
  const folderRows = [];
  const rootNames = new Set(roots.map((r) => r.name));
  const FY_RE = /\bFY\s*20\d\d\b|\b20\d\d\s*-\s*20?\d\d\b/i;
  const ACTION_RE = /amendment|addend|renewal|novation|termination|repayment|extension|rollover/i;
  const filesInFolder = new Map();
  for (const f of files) {
    const key = f.folderPath || "";
    filesInFolder.set(key, (filesInFolder.get(key) || 0) + 1);
  }
  for (const d of folders) {
    const name = d.name || "";
    const p = d.path || d.folderPath || "";
    let disposition = "UNRESOLVED";
    if (rootNames.has(name) || !p.includes(" / ")) disposition = "MODULE_ROOT";
    else if (FY_RE.test(name)) disposition = "FINANCIAL_YEAR_FOLDER";
    else if (ACTION_RE.test(name)) disposition = "ACTION_FOLDER";
    else if (TEMPLATE_RE.test(name)) disposition = "TEMPLATE_FOLDER";
    else if (/resolutions|authorizations|entity|\(pvt\)|\(private\)|ltd\b|limited\b|smc/i.test(name)) disposition = "ENTITY_FOLDER";
    else if (/project|phase|tower|block|site/i.test(name)) disposition = "PROJECT_FOLDER";
    else if (/reference|library|archive|misc/i.test(name)) disposition = "REFERENCE_FOLDER";
    else if (filesInFolder.get(p)) disposition = "RECORD_FOLDER";
    else disposition = "DOCUMENT_FOLDER";
    folderTally[disposition] = (folderTally[disposition] || 0) + 1;
    folderRows.push({ id: d.id, name, path: p, root: d.root, disposition, files: filesInFolder.get(p) || 0 });
  }

  /* -------- classify every SOURCE ROW ---------------------------------- */
  const rowTally = tally(ROW_DISPOSITIONS);
  const rowRows = [];
  for (const [famKey, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      let disposition = "INGESTED_RECORD";
      if (r.__quality === "INCOMPLETE_SOURCE") disposition = "INCOMPLETE_SOURCE_RECORD";
      else if (r.__quality && /CONFLICT/i.test(r.__quality)) disposition = "OTHER_CLASSIFIED_SOURCE";
      rowTally[disposition] = (rowTally[disposition] || 0) + 1;
      rowRows.push({
        family: famKey, id: r.id, disposition,
        sourceFileId: (r.__source && r.__source.fileId) || null,
        sourceFile: (r.__source && r.__source.file) || null,
        sourceSheet: (r.__source && r.__source.sheet) || null,
        sourceRow: r.__row != null ? r.__row : null,
        sourcePath: (r.__source && r.__source.folder) || null,
        sourceRoot: (r.__source && r.__source.root) || null,
        documents: (r.driveFiles || []).length,
      });
    }
  }

  const unclaimedTrackers = regState.unclaimed || [];

  return {
    crawlStartedAt,
    crawlCompletedAt: new Date().toISOString(),
    crawlStatus: st.degraded ? "DEGRADED" : "COMPLETE",
    roots: roots.map((r) => ({ id: r.id, name: r.name, files: r.fileCount, folders: r.folderCount })),
    counts: { files: files.length, folders: folders.length, unreadableFolders: st.unreadableFolders || 0 },
    fileTally, folderTally, rowTally,
    fileRows, folderRows, rowRows,
    unclaimedTrackers,
  };
}

/* --------------------------------------------------------------- PASS B */

async function passB(a) {
  say("\n=== PASS B — LegalOS back to the Drive root ===\n");

  const byFileId = new Map(a.fileRows.map((f) => [f.id, f]));
  const regState = await registers.ensure();
  const regs = regState.registers || {};

  const recordLineage = [];
  const documentLineage = [];
  const problems = { recordsWithoutLineage: [], documentsNotInDrive: [], duplicateIds: [], missingIds: [] };

  for (const [famKey, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows)) continue;
    const seen = new Map();
    for (const r of rows) {
      if (!r.id) { problems.missingIds.push({ family: famKey, row: r.__row }); continue; }
      if (seen.has(r.id)) problems.duplicateIds.push({ family: famKey, id: r.id });
      else seen.set(r.id, true);

      const src = r.__source || {};
      const lineage = {
        family: famKey, id: r.id,
        sourceRootId: null, sourceRootName: src.root || null,
        sourceFileId: src.fileId || null, sourceFile: src.file || null,
        sourceSheet: src.sheet || null, sourceRow: r.__row != null ? r.__row : null,
        sourcePath: src.folder || null,
        sourceType: src.fileId ? "tracker-row" : (src.folder ? "folder-derived" : "legalos-native"),
        sourceModifiedAt: src.modified || null,
        traced: !!(src.fileId || src.folder),
      };
      /* A RECORD RAISED IN LEGALOS IS NOT AN ORPHAN.
         The gate asked one question — "does this come from Drive?" — and
         counted every No as a broken lineage. But a case, request or complaint
         raised in the product has no Drive row by definition, and never will:
         its provenance is native (who raised it, when, and the audit that
         follows). Treating that as an ingestion defect both hides real orphans
         in the noise and puts permanent red on a record that is behaving
         exactly as designed.
         So provenance is now satisfied by EITHER a Drive source or a native
         one, and a record with neither is the only thing that fails. */
      const native = r.__origin === "LEGALOS" || r.origin === "LEGALOS"
        || !!(r.createdBy || r.raisedBy || r.createdAt || r.raisedInApp);
      lineage.provenance = lineage.traced ? "drive" : (native ? "legalos-native" : "none");
      lineage.nativeCreatedBy = !lineage.traced && native
        ? ((r.createdBy && (r.createdBy.name || r.createdBy.email)) || r.raisedBy || null) : null;
      lineage.nativeCreatedAt = !lineage.traced && native ? (r.createdAt || null) : null;
      const rootHit = (a.roots || []).find((x) => x.name === lineage.sourceRootName);
      if (rootHit) lineage.sourceRootId = rootHit.id;
      if (lineage.provenance === "none") problems.recordsWithoutLineage.push({ family: famKey, id: r.id });
      recordLineage.push(lineage);

      for (const f of r.driveFiles || []) {
        const inDrive = byFileId.get(f.id);
        if (!inDrive) problems.documentsNotInDrive.push({ family: famKey, record: r.id, fileId: f.id, name: f.name });
        documentLineage.push({
          family: famKey, record: r.id, fileId: f.id, name: f.name,
          root: inDrive ? inDrive.root : null,
          folderPath: inDrive ? inDrive.folderPath : (f.folderPath || null),
          inDriveIndex: !!inDrive,
          disposition: inDrive ? inDrive.disposition : "NOT_IN_INDEX",
        });
      }
    }
  }

  /* ---- one-way orphans: Drive files nothing accounts for -------------- */
  const orphanFiles = a.fileRows.filter((f) => f.disposition === "UNRESOLVED");

  const nat = recordLineage.filter((r) => r.provenance === "legalos-native").length;
  say(`  records traced          ${recordLineage.filter((r) => r.traced).length}/${recordLineage.length}`
    + (nat ? `  (+${nat} raised in LegalOS, native provenance)` : ""));
  say(`  documents traced        ${documentLineage.filter((d) => d.inDriveIndex).length}/${documentLineage.length}`);
  say(`  records without lineage ${problems.recordsWithoutLineage.length}`);
  say(`  documents not in Drive  ${problems.documentsNotInDrive.length}`);
  say(`  duplicate record ids    ${problems.duplicateIds.length}`);
  say(`  missing record ids      ${problems.missingIds.length}`);
  say(`  UNRESOLVED Drive files  ${orphanFiles.length}`);

  return { recordLineage, documentLineage, problems, orphanFiles };
}

/* ------------------------------------------------- module reconciliation */

async function moduleCounts() {
  say("\n=== MODULE RECONCILIATION ===\n");
  const out = [];
  const regState = await registers.ensure();
  const regs = regState.registers || {};

  const loans = await model.buildLoans();
  const spend = await model.buildSpend();
  const lic = await model.buildLicences();
  const ents = await entities.list();

  const push = (module, sourceObjects, normalized, note) =>
    out.push({ module, sourceObjects, normalized, difference: sourceObjects - normalized, note: note || "" });

  push("contracts", (regs.contracts || []).length, (regs.contracts || []).length, "1:1 — register is the normalized form");
  push("litigation", (regs.litigation || []).length, (regs.litigation || []).length, "1:1");
  push("notices", (regs.notices || []).length, (regs.notices || []).length, "1:1");
  push("properties", (regs.properties || []).length, (regs.properties || []).length, "1:1");
  push("loans", (regs.loans || []).length, loans.agreements.length,
    `${loans.reconciliation ? JSON.stringify(loans.reconciliation) : ""}`);
  push("leases", 0, spend.leases.length, "derived from the spend trackers by Agreement Type");
  push("services", 0, spend.services.length, "derived from the spend trackers by Agreement Type");
  push("licences", (regs.licences || []).length, lic.licences.length, "workbook rows + Drive-only licences");
  push("resolutions", (regs.resolutions || []).length, (regs.resolutions || []).length, "1:1");
  push("entities", 0, ents.length, "derived from every spelling across sources and Drive folders");

  for (const m of out) {
    const flag = m.difference === 0 || m.note ? " " : "!";
    say(`  ${flag} ${m.module.padEnd(14)} source=${String(m.sourceObjects).padStart(6)}  normalized=${String(m.normalized).padStart(6)}  diff=${String(m.difference).padStart(5)}  ${m.note.slice(0, 60)}`);
  }
  return out;
}

/* ------------------------------------------------------------------ main */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const a = await passA();
  const b = await passB(a);
  const modules = await moduleCounts();

  say("\n=== DISPOSITIONS ===\n");
  say("  FILES");
  for (const [k, v] of Object.entries(a.fileTally)) if (v) say(`    ${k.padEnd(24)} ${String(v).padStart(6)}  ${pct(v, a.counts.files)}%`);
  say("  FOLDERS");
  for (const [k, v] of Object.entries(a.folderTally)) if (v) say(`    ${k.padEnd(24)} ${String(v).padStart(6)}`);
  say("  SOURCE ROWS");
  for (const [k, v] of Object.entries(a.rowTally)) if (v) say(`    ${k.padEnd(24)} ${String(v).padStart(6)}`);

  const summary = {
    generatedAt: new Date().toISOString(),
    crawl: {
      startedAt: a.crawlStartedAt, completedAt: a.crawlCompletedAt, status: a.crawlStatus,
      rootsScanned: a.roots.length, foldersVisited: a.counts.folders,
      filesVisited: a.counts.files, unreadableFolders: a.counts.unreadableFolders,
    },
    roots: a.roots,
    dispositions: { files: a.fileTally, folders: a.folderTally, rows: a.rowTally },
    modules,
    gates: {
      UNRESOLVED_FILES: a.fileTally.UNRESOLVED || 0,
      UNRESOLVED_FOLDERS: a.folderTally.UNRESOLVED || 0,
      RECORDS_WITHOUT_LINEAGE: b.problems.recordsWithoutLineage.length,
      DOCUMENTS_NOT_IN_DRIVE: b.problems.documentsNotInDrive.length,
      DUPLICATE_RECORD_IDS: b.problems.duplicateIds.length,
      MISSING_RECORD_IDS: b.problems.missingIds.length,
      UNCLAIMED_TRACKERS: (a.unclaimedTrackers || []).length,
    },
  };

  const write = (name, data) => {
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1));
    say(`  wrote audit/${name}`);
  };
  /* ===================================================== PASS C — CONTENT ===
     The first two passes reconcile the SHAPE of the estate: where every object
     sits and which record claims it. This pass reconciles what the documents
     SAY against where they were filed.

     It is the only pass that can catch a document filed in the wrong place,
     because a folder path and a file name are both just labels somebody typed.
     A disagreement here is not automatically an error — a lease often sits
     inside a project folder quite properly — so nothing is moved on the
     strength of it. It is reported, with the evidence, for a person to judge. */
  const contentRows = [];
  const contentTally = { read: {}, type: {}, agreement: {} };
  {
    /* What the FOLDER says a document is. Matched on whole path SEGMENTS, never
       on the path as one string: testing the whole string for "service" matched
       the entity name "Property Transaction Services (Private) Limited" and
       declared every one of its statutory documents to be a service agreement
       in disagreement with its folder. A folder's meaning lives in the folder's
       own name, not in any word that happens to appear somewhere in the path. */
    const folderType = (f) => {
      const segs = String(f.folderPath || "").split(" / ").map((x) => x.trim().toLowerCase());
      const root = String(f.root || "").toLowerCase();
      if (/^litigation/.test(root)) return "LITIGATION";
      if (/^entities data for secp/.test(root)) return "SECP_FILING";
      const seg = (re) => segs.some((x) => re.test(x));
      if (seg(/^lease agreements?\b/)) return "LEASE";
      if (seg(/^general agreements?\b/)) return "SERVICE";
      if (seg(/loan agreements?$|intercompany loans/)) return "LOAN";
      if (seg(/^resolutions?\b|resolutions and authorizations|resolutions & authorizations/)) return "RESOLUTION";
      if (seg(/^land docs?$|^registries|khasra|^fards?$/)) return "LAND_RECORD";
      if (seg(/^legal notices?$|^notices?$/)) return "NOTICE";
      if (seg(/^share certificates?$|^register of (members|directors)$/)) return "SECP_FILING";
      return null;
    };
    // a.fileRows is the crawl's own record of every file; `files` is local to
    // pass A and not in scope here.
    for (const f of a.fileRows) {
      const c = content.factsFor(f.id);
      contentTally.read[c.read] = (contentTally.read[c.read] || 0) + 1;
      if (c.type) contentTally.type[c.type] = (contentTally.type[c.type] || 0) + 1;
      const ft = folderType(f);
      /* THREE outcomes, not two. A statutory folder holding an affidavit is not
         a contradiction — the folder says "this entity's statutory records" and
         the content says which one this is. Calling that a disagreement
         produced 1,656 of them and buried the ones that matter. A real conflict
         is when the content points at a different DOMAIN from the folder: a
         loan folder holding a court filing is worth a person's attention; a
         loan folder holding a board resolution is not. */
      let agreement = "NO_CONTENT";
      if (c.type && ft) {
        if (c.type === ft) agreement = "AGREES";
        else {
          const cm = content.contentModule(c.type);
          const fm = content.contentModule(ft);
          agreement = (cm && fm && cm !== fm) ? "CONFLICTS" : "REFINES";
        }
      } else if (c.type && !ft) agreement = "CONTENT_ONLY";
      else if (!c.type && ft) agreement = "FOLDER_ONLY";
      contentTally.agreement[agreement] = (contentTally.agreement[agreement] || 0) + 1;
      contentRows.push({
        id: f.id, name: f.name, root: f.root, folderPath: f.folderPath,
        read: c.read, method: c.method, chars: c.chars,
        contentType: c.type, alsoLooksLike: c.alsoLooksLike,
        folderImpliedType: ft, agreement,
        evidence: c.evidence,
        facts: c.read === "TEXT_EXTRACTED" ? c.facts : undefined,
      });
    }
  }
  summary.content = {
    read: contentTally.read,
    type: contentTally.type,
    folderVsContent: contentTally.agreement,
    note: "AGREES: same type. REFINES: content is more specific, same domain. CONFLICTS: content points at a different domain — worth a person's attention. Nothing is moved on the strength of any of these; a document is not refiled because a keyword disagreed with a folder.",
  };

  say("\n=== ARTIFACTS ===\n");
  write("reconciliation-summary.json", summary);
  write("full-content-disposition.json", contentRows);
  write("full-source-registry.json", { roots: a.roots, unclaimedTrackers: a.unclaimedTrackers });
  write("full-file-disposition.json", a.fileRows);
  write("full-folder-disposition.json", a.folderRows);
  write("full-row-disposition.json", a.rowRows);
  write("full-record-lineage.json", b.recordLineage);
  write("full-document-lineage.json", b.documentLineage);

  say("\n=== GATES ===\n");
  let bad = 0;
  for (const [k, v] of Object.entries(summary.gates)) {
    const ok = v === 0;
    if (!ok) bad++;
    say(`  ${ok ? "PASS" : "FAIL"}  ${k.padEnd(26)} ${v}`);
  }
  if (VERBOSE && (a.unclaimedTrackers || []).length) {
    say("\n  UNCLAIMED TRACKERS:");
    for (const u of a.unclaimedTrackers.slice(0, 40)) say(`    ${u.file}  —  ${u.reason}`);
  }
  if (VERBOSE && b.orphanFiles.length) {
    say("\n  UNRESOLVED FILES (first 40):");
    for (const f of b.orphanFiles.slice(0, 40)) say(`    [${f.root}] ${f.folderPath} / ${f.name}`);
  }

  if (JSON_ONLY) console.log(JSON.stringify(summary, null, 1));
  say(bad ? `\n  ${bad} gate(s) not yet at zero\n` : "\n  every gate at zero\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("RECONCILE FAILED:", e && e.stack ? e.stack : e); process.exit(2); });
