// Compliance reconciliation, for Administration -> Data Health.
// Same computation as tools/compliance-reconcile.js, exposed in the app so
// unresolved documents are a working queue rather than a number in a report.
const drive = require("./drive");

/* ------------------------------------------------- compliance reconciliation */

// The Data Health view of the Compliance rebuild: where every source row went,
// and what every Drive file is. Surfaced in the app rather than living only in a
// markdown file, because "unresolved" is a working queue, not a footnote.
async function reconciliation() {
  const model = require("./compliance-model");
  const sources = require("./compliance-sources");
  const secp = require("./secp");
  const registersMod = require("./registers");

  const st = await registersMod.ensure();
  const R = (st && st.registers) || {};
  const loans = await model.buildLoans();
  const spend = await model.buildSpendWithDocs();
  const lic = await model.buildLicences();

  /* THE SAME SELECTOR THE REGISTER USES.
     This used to test the folder path for "Spend Contracts", which is how 30
     real lease and service agreements went missing: their trackers are filed
     under a loan or resolution folder. Data Health then reported the smaller
     set as balancing, which is the worst kind of green. */
  const spendRows = (R.contracts || []).filter(model.isSpendRow);

  const claim = new Map();
  const claimOnce = (id, d) => { if (id && !claim.has(id)) claim.set(id, d); };
  for (const a of loans.agreements) {
    for (const f of a.driveFiles || []) claimOnce(f.id, "RECORD_DOCUMENT");
    for (const d of a.documentEvents || []) claimOnce(d.file && d.file.id, "ACTION_DOCUMENT");
  }
  for (const r of [...spend.leases, ...spend.services, ...spend.other]) {
    for (const f of r.driveFiles || []) claimOnce(f.id, "RECORD_DOCUMENT");
    for (const f of r.extraDocuments || []) claimOnce(f.id, "RECORD_DOCUMENT");
  }
  for (const l of lic.licences) for (const f of (l.folderDocuments || l.driveFiles || [])) claimOnce(f.id, "RECORD_DOCUMENT");
  for (const r of R.resolutions || []) for (const f of r.driveFiles || []) claimOnce(f.id, "RECORD_DOCUMENT");
  for (const e of sources.secpEvidence()) claimOnce(e.file && e.file.id, e.kind === "third_party_form" ? "REFERENCE" : "SECP_YEAR_DOCUMENT");
  for (const t of sources.templateRegistry()) claimOnce(t.driveFileId, "TEMPLATE");
  for (const fd of sources.resolutionFolderDocs().values()) for (const f of fd.files) claimOnce(f.id, "ENTITY_DOCUMENT");
  for (const fo of sources.spendDocumentFolders()) for (const f of fo.files) claimOnce(f.id, "ENTITY_DOCUMENT");
  for (const fo of sources.loanFolders()) for (const f of fo.files) claimOnce(f.id, "ACTION_DOCUMENT");
  for (const fo of sources.licenceFolders()) for (const f of fo.files) claimOnce(f.id, "RECORD_DOCUMENT");
  const trackers = new Set();
  for (const fam of Object.keys(R)) for (const r of R[fam] || []) if (r.__source && r.__source.fileId) trackers.add(r.__source.fileId);
  for (const id of trackers) claimOnce(id, "SOURCE_TRACKER");

  const relevant = drive.indexFiles().filter((f) =>
    /^Compliance Data _LegalOS/.test(f.folderPath || "") || /Pakistan Contract Templates/i.test(f.folderPath || ""));
  const disp = {};
  const unresolved = [];
  for (const f of relevant) {
    let d = claim.get(f.id);
    if (!d) {
      if (/^~\$/.test(f.name || "") || /^~WRL\w*\.tmp$/i.test(f.name || "") || /desktop\.ini$/i.test(f.name || "")) d = "NOT_A_DOCUMENT";
      else if (/\.(xlsx|xls|xlsm)$/i.test(f.name || "")) d = "SOURCE_TRACKER";
      else { d = "UNRESOLVED"; unresolved.push({ id: f.id, name: f.name, folderPath: f.folderPath }); }
    }
    disp[d] = (disp[d] || 0) + 1;
  }

  return {
    rows: {
      combined: {
        label: "Lease / Loan / Service (combined source)",
        sourceRows: spendRows.length,
        leases: spend.leases.length,
        services: spend.services.length,
        neither: spend.other.length,
        balances: spend.leases.length + spend.services.length + spend.other.length === spendRows.length,
      },
      loans: loans.reconciliation,
    },
    /* SOURCE CONTAMINATION: real compliance records filed under the wrong
       family. Nothing is moved and nothing is deleted -- it is listed, so the
       misfiling is a working queue rather than an invisible cause of missing
       records. */
    contamination: (() => {
      const all = [...spend.leases, ...spend.services, ...spend.other];
      const mis = all.filter((r) => r.misfiled);
      const byFamily = {};
      const byTracker = {};
      for (const r of mis) {
        byFamily[r.filedUnder || "(unknown)"] = (byFamily[r.filedUnder || "(unknown)"] || 0) + 1;
        const f = (r.__source && r.__source.file) || "(unknown)";
        byTracker[f] = (byTracker[f] || 0) + 1;
      }
      return {
        misfiledSpendRecords: mis.length, byFamily, byTracker,
        note: "Lease and service agreements whose tracker is filed under a loan or resolution folder. "
          + "They are classified by what they are; the folder is unchanged.",
      };
    })(),
    registers: {
      loans: loans.agreements.length,
      leases: spend.leases.length,
      services: spend.services.length,
      resolutions: (R.resolutions || []).length,
      licences: lic.licences.length,
      // The reconciled Drive-backed model -- the same one the registers,
      // dashboard and entity pages read. There is no second count.
      secpYearsFromDrive: require("./secp-records").annualCompliance().length,
      secpFilingsRecorded: secp.filings({}).length,
    },
    documents: { total: relevant.length, disposition: disp, unresolved: unresolved.slice(0, 50), unresolvedCount: unresolved.length },
    /* THE SPEND SHARING POLICY, VISIBLE TO WHOEVER OWNS ACCESS.
       A bulk authorization change that is only recorded in a JSON file is a
       change nobody can review. This surfaces what was shared, to whom, on
       whose approval, and — most importantly — the count of widening nobody
       approved, which must stay zero. */
    sharingPolicy: (() => {
      const P = require("path"), F = require("fs");
      let applied = null;
      try { applied = JSON.parse(F.readFileSync(P.join(__dirname, "..", "audit", "spend-compliance-share-applied.json"), "utf8")); }
      catch (e) { applied = null; }
      if (!applied) return { status: "NOT_APPLIED" };
      let review = null;
      try { review = JSON.parse(F.readFileSync(P.join(__dirname, "..", "audit", "spend-document-access-review.json"), "utf8")); }
      catch (e) { review = null; }
      let diff = null;
      try {
        const scopeApi = require("./document-scope");
        const d = scopeApi.diff({ files: drive.indexFiles(), registers: R });
        diff = { unexplainedWidened: d.widened.length, byPolicy: d.byPolicy || {}, narrowed: d.narrowed.length, unscoped: d.unscoped.length };
      } catch (e) { diff = null; }
      return {
        status: "ACTIVE",
        policyId: applied.policyId,
        reason: applied.reason,
        approvedLinks: applied.approvedLinks,
        distinctDocumentsShared: applied.effectiveDocumentsShared != null ? applied.effectiveDocumentsShared : applied.shared,
        appliedAt: applied.approvedAt,
        approvedBy: applied.approvedByDisplay,
        approvedByUserId: applied.approvedByUserId,
        approvedByEmail: applied.approvedBy,
        complianceReadableSpendDocuments: review ? review.complianceReadable : null,
        commercialOnlyExclusions: review ? (review.byRecommendation.B_COMMERCIAL_ONLY || 0) : null,
        historicalOnlyExclusions: review ? (review.byRecommendation.D_HISTORICAL_SOURCE_ONLY || 0) : null,
        securityDiff: diff,
      };
    })(),
    /* THE DOCUMENT LAYER, AS A WORKING QUEUE.
       Physical files and logical documents are reported separately on purpose:
       collapsing them hides that 447 files are 223 instruments, and separating
       them without saying so makes two true numbers look like a discrepancy. */
    documentLayer: (() => {
      const P2 = require("path"), F2 = require("fs");
      const rd = (n) => { try { return JSON.parse(F2.readFileSync(P2.join(__dirname, "..", "audit", n), "utf8")); } catch (e) { return null; } };
      const inv = rd("compliance-document-inventory.json");
      const ord = rd("compliance-document-order.json");
      const dup = rd("compliance-document-duplicate-groups.json");
      const brk = rd("compliance-document-broken-links.json");
      const gap = rd("compliance-document-lineage-gaps.json");
      const uir = rd("compliance-document-ui-reconciliation.json");
      if (!inv) return { status: "NOT_AUDITED" };
      return {
        physicalFiles: inv.complianceFiles,
        attachedToARecord: inv.mappedToARecord,
        exposedAtEntityLevel: inv.ofWhichExposedAtEntityLevel,
        trackersAndSystemFiles: inv.ofWhichNotRecordDocuments,
        unresolvedDocuments: inv.unexplained,
        duplicateGroups: dup ? dup.groups : null,
        duplicateSourceCopies: dup ? (dup.physicalFilesInDuplicateGroups - dup.logicalDocumentsRepresented) : null,
        logicalDocumentsInDuplicateGroups: dup ? dup.logicalDocumentsRepresented : null,
        unclassifiedDuplicateGroups: dup ? dup.unclassified : null,
        orderingErrors: ord ? ord.orderingErrors : null,
        lineageGaps: gap ? gap.gaps : (ord ? ord.lineageGaps : null),
        unresolvedLineageGaps: gap ? gap.unresolved : null,
        lineageGapsByStatus: gap ? gap.byStatus : null,
        brokenDriveLinks: brk ? brk.broken : null,
        strayDocuments: brk ? brk.strayDocumentsOnRecords : null,
        recordsChecked: uir ? uir.recordsChecked : null,
        documentCountMismatches: uir ? uir.countMismatches : null,
        uiDocumentsWithoutASource: uir ? uir.documentsWithoutADriveObject : null,
        recordsWithNothingLinked: uir ? uir.emptyBecauseNothingLinked : null,
        recordsWithRestrictedDocumentsOnly: uir ? uir.emptyBecauseRestricted : null,
      };
    })(),
    unmatched: {
      loanHistoryRows: loans.orphanEvents.length,
      contestedLoanFolders: (loans.contestedFolders || []).length,
      driveOnlyLoans: loans.reconciliation.driveOnlyAgreements,
      driveOnlyLicences: lic.driveOnlyLicences,
      unattachedSpendDocuments: spend.unattachedDocuments.length,
    },
  };
}

module.exports.reconciliation = reconciliation;
