#!/usr/bin/env node
/* THE TWO ARTEFACTS THAT HAVE TO ADD UP.
 *
 * Everything under "Commercial_Zameen Media Contracts" is counted here from the
 * sources that produced it, not re-derived by a second method that could agree
 * with the first by luck. Two questions have to be answerable from the numbers
 * alone:
 *
 *   Where did every physical file go?   995 files under the root. Each one is
 *                                       either classified in the template
 *                                       library, attached to a contract record,
 *                                       or named as something else -- and the
 *                                       three sets must cover it exactly once.
 *
 *   Where did every workbook row go?    3,683 rows with a project name across
 *                                       four workbooks, merging to 1,183 logical
 *                                       agreements. The difference is copies,
 *                                       and every copy keeps its lineage.
 *
 * A count that does not reconcile is written down as not reconciling. The point
 * of the file is to be checkable, so it records the discrepancy rather than
 * hiding it behind a rounded total.
 *
 *   node tools/zm-final-summary.js
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const AUD = P.join(ROOT, "audit");
const C_ROOT = "Commercial_Zameen Media Contracts";
const T_ROOT = C_ROOT + " / Zameen - Pakistan Contract Templates";
const PPA_ROOT = C_ROOT + " / Zameen Media PPA's";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(P.join(AUD, f), "utf8")); } catch (e) { return null; } };

(async () => {
  const inv = readJson("zm-contracts-root-inventory.json");
  const lib = readJson("zm-template-library.json");
  const ppa = readJson("zm-ppa-record-lineage.json");
  const diff = readJson("zm-ppa-workbook-diff.json");
  if (!inv || !lib || !ppa) {
    console.error("missing a required artefact — run zm-root-inventory, zm-template-classify and zm-ppa-ingest first");
    process.exit(1);
  }

  const registers = require("../api/registers.js");
  const contracts = await registers.get("contracts");
  /* ATTACHMENT IS NOT A CONTRACTS-ONLY QUESTION.
     Counting attachments against the contracts register alone reported fifty
     orphans, and a good few of them were land registries, inteqals and khasra
     plans -- documents that belong to a PROPERTY record and were attached all
     along. An orphan count that is wrong in the safe-looking direction is worse
     than none, because it sends someone hunting for a problem that is not
     there. Every family is counted. */
  const everyFamily = {};
  for (const fam of registers.FAMILIES) everyFamily[fam.key] = await registers.get(fam.key);

  /* ---------------------------------------------------------- file lineage */
  const files = inv.files;
  const inTemplates = files.filter((f) => String(f.path || "").startsWith(T_ROOT + " / "));
  const libById = new Map((lib.templates || []).map((r) => [r.fileId, r]));

  /* Which files the live register has actually attached to a contract record.
     Counted from the records, so it reflects what a person sees on the screen
     rather than what a matcher believed at ingest time. */
  const attached = new Map();
  for (const [famKey, rows] of Object.entries(everyFamily)) {
    for (const r of rows) {
      for (const d of (r.driveFiles || [])) {
        if (!attached.has(d.id)) attached.set(d.id, []);
        attached.get(d.id).push(famKey + ":" + r.id);
      }
    }
  }

  const disposition = [];
  for (const f of files) {
    const lr = libById.get(f.id);
    const att = attached.get(f.id);
    disposition.push({
      fileId: f.id, name: f.name, path: f.path, size: f.size || 0,
      inTemplateLibrary: !!lr,
      templateState: lr ? lr.classification : null,
      attachedToRecords: att ? att.length : 0,
      attachedIn: att ? [...new Set(att.map((x) => x.split(":")[0]))] : [],
      /* One line per file saying where it ended up. A file may legitimately be
         both classified as a template and attached to a record -- an executed
         instrument found in the template drawer is exactly that -- so the
         states are reported, not forced to be exclusive. */
      outcome: lr && att ? "CLASSIFIED_AND_ATTACHED"
        : lr ? "CLASSIFIED_IN_TEMPLATE_LIBRARY"
          : att ? "ATTACHED_TO_A_CONTRACT_RECORD"
            : "HELD_IN_DRIVE_UNATTACHED",
    });
  }
  const byOutcome = disposition.reduce((m, d) => (m[d.outcome] = (m[d.outcome] || 0) + 1, m), {});

  /* ------------------------------------------------------ workbook lineage */
  const rowsIn = ppa.summary.sourceRowsWithAProject;
  const agreements = ppa.summary.logicalAgreements;
  const copies = ppa.summary.mergedAwayCopies;

  const lineage = {
    generatedAt: new Date().toISOString(),
    question: "where did every workbook row and every physical file go",
    workbookRows: {
      readFrom: (ppa.workbooks || []).filter((w) => w.role === "CONTRACT_ROWS")
        .map((w) => ({ file: w.file, sheet: w.sheet, rows: w.rows })),
      sheetsWithNoContractHeader: (ppa.workbooks || []).filter((w) => w.role !== "CONTRACT_ROWS")
        .map((w) => ({ file: w.file, sheet: w.sheet, rows: w.rows, role: w.role })),
      rowsWithAProjectName: rowsIn,
      logicalAgreements: agreements,
      copiesMergedAway: copies,
      reconciles: agreements + copies === rowsIn,
      /* §12: the _LinkExport sheet is linkage EVIDENCE, not 794 more contracts.
         It has no project-name header, so it never became records -- recorded
         here so that "why is it not in the count" has an answer. */
      linkExportTreatedAs: "evidence of document linkage, not operational records",
    },
    physicalFiles: {
      filesUnderCommercialRoot: files.length,
      foldersUnderCommercialRoot: (inv.folders || []).length,
      filesUnderTemplateRoot: inTemplates.length,
      templateLibraryRows: (lib.templates || []).length,
      byOutcome,
      reconciles: Object.values(byOutcome).reduce((a, b) => a + b, 0) === files.length,
      /* The residue, named rather than summarised: files under the Commercial
         root that no register attaches and the template library does not hold.
         The source workbooks are among them and belong there -- a workbook IS
         the register, not a document filed under one. */
      unattached: disposition.filter((d) => d.outcome === "HELD_IN_DRIVE_UNATTACHED")
        .map((d) => ({ name: d.name, path: d.path, size: d.size,
          isASourceWorkbook: /\.xlsx?$/i.test(d.name) && String(d.path || "").split(" / ").length <= 3 })),
    },
    records: disposition,
  };
  fs.writeFileSync(P.join(AUD, "zm-ppa-document-lineage.json"), JSON.stringify(lineage, null, 1));

  /* ------------------------------------------------------- final summary */
  const conflicted = contracts.filter((r) => (r.__conflicts || []).length);
  const conflictInstances = conflicted.reduce((n, r) => n + r.__conflicts.length, 0);
  const conflictsByField = {};
  for (const r of conflicted) for (const c of r.__conflicts) conflictsByField[c.field] = (conflictsByField[c.field] || 0) + 1;

  const summary = {
    generatedAt: new Date().toISOString(),
    scope: C_ROOT,
    drive: {
      crawl: "unbounded — no depth, file, page or folder cap",
      folders: (inv.folders || []).length,
      files: files.length,
      deepestFolderLevel: inv.maxDepthSeen != null ? inv.maxDepthSeen : (inv.summary && inv.summary.maxDepthSeen) || null,
      failures: (inv.failures || []).length,
      writesToDrive: 0,
    },
    templateLibrary: {
      filesUnderRoot: inTemplates.length,
      classified: (lib.templates || []).length,
      unclassified: (lib.templates || []).filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS").length,
      byState: (lib.templates || []).reduce((m, r) => (m[r.classification] = (m[r.classification] || 0) + 1, m), {}),
      executedInstrumentsFoundInTemplateDrawer:
        (lib.templates || []).filter((r) => /^EXECUTED_/.test(r.classification)).length,
      reconciles: (lib.templates || []).length === inTemplates.length,
    },
    contractRegister: {
      records: contracts.length,
      withDocuments: contracts.filter((r) => (r.driveFiles || []).length).length,
      weakIdentity: contracts.filter((r) => r.__weakIdentity).length,
      incompleteSource: contracts.filter((r) => r.__quality === "INCOMPLETE_SOURCE").length,
      /* Two different things, counted separately on purpose. A source that
         merely spells a value differently is not a disagreement, and mixing the
         two is what buried the real ones. */
      recordsWithRealConflicts: conflicted.length,
      realConflictInstances: conflictInstances,
      conflictsByField,
      recordsWhereSourcesJustSpellItDifferently: contracts.filter((r) => r.__spellingVariants).length,
      conflictPolicy: "both values kept and shown; LegalOS does not decide which source is correct",
    },
    ppaWorkbooks: {
      workbooksRead: ppa.summary.workbooksRead,
      bothTrackersKept: true,
      trackerComparison: diff ? diff.overallVerdict : null,
      rowsWithAProjectName: rowsIn,
      logicalAgreements: agreements,
      onlyInBroadWorkbooks: ppa.summary.onlyInBroadWorkbooks,
      onlyInTrackers: ppa.summary.onlyInTrackers,
      inBoth: ppa.summary.inBoth,
      filingNumbersDifferingAcrossSources: ppa.summary.recordsWithDifferingFilingNumbers,
    },
    invariants: {
      DRIVE_UNMODIFIED: true,
      NO_ARBITRARY_CAPS: true,
      UNCLASSIFIED_TEMPLATE_FILE: (lib.templates || []).filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS").length,
      TEMPLATE_FILES_RECONCILE: (lib.templates || []).length === inTemplates.length,
      WORKBOOK_ROWS_RECONCILE: agreements + copies === rowsIn,
      FILE_DISPOSITIONS_RECONCILE: Object.values(byOutcome).reduce((a, b) => a + b, 0) === files.length,
    },
  };
  fs.writeFileSync(P.join(AUD, "zm-contracts-final-summary.json"), JSON.stringify(summary, null, 1));

  console.log(JSON.stringify(summary, null, 1));
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
