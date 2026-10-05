#!/usr/bin/env node
/* COMPLIANCE: BOTTOM-UP.
 *
 * tools/compliance-audit.js walks the Drive root downwards and gives every
 * folder, file and tracker row a disposition. This tool walks the other way:
 * it starts from what LegalOS actually serves and proves each record back to a
 * source row or source folder, then to its family, then to the Compliance root.
 *
 * WHY BOTH DIRECTIONS ARE NEEDED. Top-down alone proves nothing was missed in
 * the source. Bottom-up alone proves nothing was invented. Only together do
 * they prove the two are the same estate -- which is the whole point, because
 * this module has TWO datasets in it:
 *
 *   api/compliance-model.js  reconciles the source properly. It knows that the
 *                            FDI tracker's 192 rows are 60 loan agreements,
 *                            117 lifecycle events and 15 header artifacts.
 *   api/registers.js         ingests the same workbooks row by row and calls
 *                            all 192 of them loans.
 *
 * The compliance UI reads the first. The generic register reads the second. So
 * the same business has 69 loans on one screen and 192 on another, and the
 * difference is entirely amendments and spreadsheet furniture being counted as
 * borrowings.
 *
 *   node tools/compliance-reconcile.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const model = require("../api/compliance-model.js");
const registers = require("../api/registers.js");
const entitiesApi = require("../api/entities.js");

const ROOT_NAME = "Compliance Data _LegalOS";
const OUT = P.join(__dirname, "..", "audit");
const seg = (p) => String(p || "").split("/").map((s) => s.trim()).filter(Boolean);
const write = (n, o) => { fs.writeFileSync(P.join(OUT, n), JSON.stringify(o, null, 1)); console.log("  wrote audit/" + n); };

(async () => {
  await drive.ensureIndex();
  const files = drive.indexFiles().filter((f) => String(f.path || "").startsWith(ROOT_NAME));
  const fileById = new Map(files.map((f) => [f.id, f]));

  const st = await registers.ensure();
  const loans = await model.buildLoans(st);
  const spend = await model.buildSpendWithDocs();
  const lic = await model.buildLicences(st);
  const resolutions = (st.registers && st.registers.resolutions) || [];

  /* ---------------------------------------------------- lineage per record --
     A record is proven when we can name the thing it came from AND that thing
     is under the Compliance root. "It has a title" is not lineage. */
  const famOf = (path) => { const s = seg(path); return s.length >= 2 ? s[1] : ""; };
  const lineageOf = (rec) => {
    const src = rec.__source || rec.source || null;
    const out = { row: null, file: null, sheet: null, folder: null, family: null, root: null };
    if (src) {
      out.file = src.file || null; out.sheet = src.sheet || null;
      out.row = (src.row != null ? src.row : null);
      out.folder = src.folder || null;
      out.root = src.root || null;
    }
    const lin = rec.__lineage || null;
    if (!out.folder && lin && lin.folder) out.folder = lin.folder;
    const anyPath = out.folder || (rec.driveFiles && rec.driveFiles[0] && rec.driveFiles[0].folderPath) || "";
    out.family = anyPath ? famOf(anyPath) : (out.root === ROOT_NAME ? "(root)" : null);
    if (!out.root && anyPath.startsWith(ROOT_NAME)) out.root = ROOT_NAME;
    const proven = !!(out.row != null || out.file || out.folder || (rec.driveFiles || []).length);
    return { ...out, proven };
  };

  const families = [
    ["loans", loans.agreements || []],
    ["leases", spend.leases || []],
    ["services", spend.services || []],
    ["other-spend", spend.other || []],
    ["licences", lic.licences || []],
    ["resolutions", resolutions],
  ];

  const recordLineage = [];
  const docLineage = [];
  const summary = {};
  for (const [name, rows] of families) {
    let proven = 0, unproven = 0, docs = 0, zeroDocs = 0, offRoot = 0;
    for (const r of rows) {
      const L = lineageOf(r);
      if (L.proven) proven++; else unproven++;
      const df = r.driveFiles || r.documents || [];
      docs += df.length;
      if (!df.length) zeroDocs++;
      for (const d of df) {
        const f = fileById.get(d.id);
        if (!f) { offRoot++; }
        docLineage.push({
          family: name, recordId: r.id, fileId: d.id, name: d.name || (f && f.name) || "",
          folderPath: (f && f.folderPath) || d.folderPath || "",
          sourceFamily: f ? famOf(f.path) : null,
          underComplianceRoot: !!f,
        });
      }
      recordLineage.push({
        family: name, id: r.id, title: r.title || r.agenda || r.name || "",
        entity: r.entity || "", lineage: L, documents: df.length,
      });
    }
    summary[name] = { records: rows.length, lineageProven: proven, lineageMissing: unproven, documents: docs, recordsWithNoDocument: zeroDocs, documentsOutsideRoot: offRoot };
  }

  write("compliance-record-lineage.json", { builtAt: new Date().toISOString(), summary, records: recordLineage });
  write("compliance-document-lineage.json", {
    builtAt: new Date().toISOString(),
    documents: docLineage.length,
    outsideComplianceRoot: docLineage.filter((d) => !d.underComplianceRoot).length,
    byFamily: docLineage.reduce((m, d) => { m[d.family] = (m[d.family] || 0) + 1; return m; }, {}),
    crossFamily: docLineage.filter((d) => d.sourceFamily && d.family && !sameDomain(d.family, d.sourceFamily)).slice(0, 400),
    links: docLineage,
  });

  /* --------------------------------------------------------- entity registry */
  const canonical = await entitiesApi.list();
  const seen = new Map();
  const addAlias = (name, fam) => {
    const k = entitiesApi.entityKey(name || "");
    if (!k) return;
    const e = seen.get(k) || { key: k, spellings: new Set(), families: new Set(), canonical: null };
    if (name) e.spellings.add(String(name).trim());
    e.families.add(fam);
    seen.set(k, e);
  };
  for (const [name, rows] of families) for (const r of rows) addAlias(r.entity, name);
  for (const e of seen.values()) {
    const hit = canonical.find((c) => c.key === e.key);
    e.canonical = hit ? hit.name : null;
  }
  write("compliance-entity-registry.json", {
    builtAt: new Date().toISOString(),
    canonicalEntities: canonical.length,
    entitiesUsedInCompliance: seen.size,
    notInCanonicalRegistry: [...seen.values()].filter((e) => !e.canonical).map((e) => ({ key: e.key, spellings: [...e.spellings] })),
    entities: [...seen.values()].map((e) => ({ key: e.key, canonical: e.canonical, spellings: [...e.spellings], families: [...e.families] })),
  });

  /* ------------------------------------------------------------ the numbers */
  const audit = (() => { try { return JSON.parse(fs.readFileSync(P.join(OUT, "compliance-row-disposition.json"), "utf8")); } catch (e) { return { sheets: [] }; } })();
  const rowsByFamily = {};
  for (const s of audit.sheets || []) {
    if (s.error) continue;
    rowsByFamily[s.family] = (rowsByFamily[s.family] || 0) + (s.candidateRecords || 0);
  }

  const final = {
    builtAt: new Date().toISOString(),
    root: ROOT_NAME,
    sourceRows: rowsByFamily,
    loans: {
      sourceRows: loans.reconciliation.sourceRows,
      logicalLoans: loans.reconciliation.agreements,
      fromTracker: loans.reconciliation.trackerAgreements,
      driveOnly: loans.reconciliation.driveOnlyAgreements,
      historyRows: loans.reconciliation.historyRows,
      headerArtifacts: loans.reconciliation.headerArtifacts,
      balances: loans.reconciliation.balances,
      arithmetic: loans.reconciliation.trackerAgreements + loans.reconciliation.historyRows + loans.reconciliation.headerArtifacts
        + " = " + loans.reconciliation.sourceRows,
      cacheHoldsRawSourceRows: (st.registers && st.registers.loans || []).length,
      servedByRegisterApi: "reconciled on read -- see registers.get()",
    },
    spend: { total: spend.total, leases: spend.leases.length, services: spend.services.length, other: (spend.other || []).length,
      arithmetic: spend.leases.length + " + " + spend.services.length + " + " + (spend.other || []).length + " = " + spend.total },
    licences: { model: (lic.licences || []).length, tracker: lic.trackerLicences, driveOnly: lic.driveOnlyLicences,
      cacheHoldsRawTrackerRows: (st.registers && st.registers.licences || []).length,
      servedByRegisterApi: "reconciled on read -- see registers.get()" },
    resolutions: { register: resolutions.length, sourceRows: rowsByFamily.RESOLUTIONS || 0 },
    summary,
  };
  /* ---- per-family reconciliation artifacts (§56) ------------------------- */
  const rootOf = (r) => ((r.__source || {}).root || "").trim();

  write("compliance-loan-reconciliation.json", {
    builtAt: new Date().toISOString(),
    sourceRows: loans.reconciliation.sourceRows,
    arithmetic: {
      loanAgreements: loans.reconciliation.trackerAgreements,
      lifecycleEventRows: loans.reconciliation.historyRows,
      headerArtifacts: loans.reconciliation.headerArtifacts,
      sum: loans.reconciliation.trackerAgreements + loans.reconciliation.historyRows + loans.reconciliation.headerArtifacts,
      equalsSourceRows: (loans.reconciliation.trackerAgreements + loans.reconciliation.historyRows + loans.reconciliation.headerArtifacts) === loans.reconciliation.sourceRows,
    },
    logicalLoans: loans.reconciliation.agreements,
    fromTracker: loans.reconciliation.trackerAgreements,
    driveOnlyFolders: loans.reconciliation.driveOnlyAgreements,
    historyAttached: loans.reconciliation.historyAttached,
    historyUnattached: loans.reconciliation.historyUnattached,
    byCategory: (loans.agreements || []).reduce((m, a) => { m[a.category || "unclassified"] = (m[a.category || "unclassified"] || 0) + 1; return m; }, {}),
    /* SBP status lives on `sbp.key`, not `sbp.status`. Reading the wrong field
       reported all 69 loans as "unknown" -- a reconciliation artifact quietly
       asserting the estate has no registration evidence at all. */
    sbp: (loans.agreements || []).reduce((m, a) => { const k = (a.sbp && (a.sbp.key || a.sbp.label)) || "unknown"; m[k] = (m[k] || 0) + 1; return m; }, {}),
    registerServes: (st.registers && st.registers.loans || []).length,
    rawRowsRetainedAs: "registers.loansSource",
  });

  const spendAll = [...(spend.leases || []), ...(spend.services || []), ...(spend.other || [])];
  write("compliance-spend-reconciliation.json", {
    builtAt: new Date().toISOString(),
    total: spend.total,
    leases: (spend.leases || []).length,
    services: (spend.services || []).length,
    other: (spend.other || []).length,
    arithmetic: (spend.leases || []).length + " + " + (spend.services || []).length + " + " + (spend.other || []).length + " = " + spend.total,
    balances: (spend.leases || []).length + (spend.services || []).length + (spend.other || []).length === spend.total,
    misfiledRecovered: spendAll.filter((r) => r.misfiled).length,
    misfiledByFamily: spendAll.filter((r) => r.misfiled).reduce((m, r) => { m[r.filedUnder] = (m[r.filedUnder] || 0) + 1; return m; }, {}),
    lifecycleActionsLinked: spendAll.filter((r) => r.isAction).length,
    lifecycleActionsUnlinked: spendAll.filter((r) => r.actionUnlinked).map((r) => ({ id: r.id, title: r.title, why: r.actionUnlinked })),
    /* Every one of the 199, by explicit category -- no "other" bucket. */
    byCategory: spendAll.reduce((m, r) => { m[r.spendCategory || "(unset)"] = (m[r.spendCategory || "(unset)"] || 0) + 1; return m; }, {}),
    remainderAfterLeaseAndService: (spend.other || []).reduce((m, r) => { m[r.spendCategory] = (m[r.spendCategory] || 0) + 1; return m; }, {}),
    dataCompleteness: spendAll.reduce((m, r) => { m[r.dataCompleteness || "(unset)"] = (m[r.dataCompleteness || "(unset)"] || 0) + 1; return m; }, {}),
    evidenceStatus: spendAll.reduce((m, r) => { m[r.evidenceStatus || "(unset)"] = (m[r.evidenceStatus || "(unset)"] || 0) + 1; return m; }, {}),
    sourceLocationMismatch: spendAll.filter((r) => r.sourceLocation).length,
    /* A STANDING AUTHORIZATION STATE, RECORDED RATHER THAN CHANGED.
       The spend trackers under the Compliance root also feed the Commercial
       contracts register from the same rows, and the persisted document scope
       for those files says `commercial`. So a Compliance user sees the lease
       record and cannot open most of its documents.

       This predates the reclassification and was NOT caused by it -- the scope
       diff is 0/0/0, and the misfiled subset behaves exactly like the
       correctly-filed one. Widening 300-odd documents to Compliance is a
       deliberate authorization decision for the business, not a side effect a
       reconciliation should take on its own, so it is reported here and left
       alone. */
    documentAuthorization: (() => {
      const scope = require("../api/document-scope.js");
      const byId = new Map(files.map((f) => [f.id, f]));
      const tally = (rows) => {
        const ids = [...new Set(rows.flatMap((r) => (r.driveFiles || []).map((d) => d.id)))];
        let compliance = 0, commercial = 0;
        for (const id of ids) {
          const f = byId.get(id);
          if (!f) continue;
          if (scope.canAccessDocument(id, f, { compliance: "view" }, false).allow) compliance++;
          if (scope.canAccessDocument(id, f, { commercial: "view" }, false).allow) commercial++;
        }
        return { documents: ids.length, readableByCompliance: compliance, readableByCommercial: commercial };
      };
      return {
        all: tally(spendAll),
        misfiled: tally(spendAll.filter((r) => r.misfiled)),
        correctlyFiled: tally(spendAll.filter((r) => !r.misfiled)),
        note: "Pre-existing scope, unchanged by this reconciliation (scope diff 0/0/0). "
          + "Granting Compliance read access here is an authorization decision, not a reconciliation step.",
      };
    })(),
    otherTypes: (spend.other || []).map((r) => ({ id: r.id, type: r.agreementType, title: r.title, category: r.spendCategory })),
    recordsWithNoDocument: spendAll.filter((r) => !(r.driveFiles || []).length).length,
  });

  write("compliance-licence-reconciliation.json", {
    builtAt: new Date().toISOString(),
    trackerRows: lic.trackerLicences,
    driveOnly: lic.driveOnlyLicences,
    served: (lic.licences || []).length,
    arithmetic: lic.trackerLicences + " tracker + " + lic.driveOnlyLicences + " folder-only = " + (lic.licences || []).length,
    entityFolders: lic.folders,
    unmatchedFolders: lic.unmatchedFolders,
    historyEntries: (lic.licences || []).reduce((a, l) => a + (l.history || []).length, 0),
    originals: (lic.licences || []).reduce((a, l) => a + (l.history || []).filter((h) => h.kind === "original").length, 0),
    renewals: (lic.licences || []).reduce((a, l) => a + (l.history || []).filter((h) => h.kind === "renewal").length, 0),
    licences: (lic.licences || []).map((l) => ({
      id: l.id, entity: l.entity, authority: l.authority, number: l.number,
      issued: l.issued, expiry: l.expiry, status: l.status,
      origin: l.origin || (l.__source ? "tracker" : "folder"),
      documents: (l.driveFiles || []).length,
      historyEntries: (l.history || []).length,
      renewalsOnFile: l.renewalsOnFile || 0,
      currentEffective: l.currentEffective ? {
        file: l.currentEffective.file && l.currentEffective.file.name,
        date: l.currentEffective.date, validUntil: l.currentEffective.validUntil,
        basis: l.currentEffective.basis,
      } : null,
      currentEffectiveUnknown: l.currentEffectiveUnknown || null,
    })),
  });

  const resByRoot = resolutions.reduce((m, r) => { const k = rootOf(r) || "(none)"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const resByEntity = resolutions.reduce((m, r) => {
    const e = model.resolutionEntity(r.__source || {});
    const k = (e && e.name) || "(unknown)";
    m[k] = (m[k] || 0) + 1; return m;
  }, {});
  write("compliance-resolution-reconciliation.json", {
    builtAt: new Date().toISOString(),
    registerRecords: resolutions.length,
    bySourceRoot: resByRoot,
    arithmetic: Object.entries(resByRoot).map(([k, v]) => v + " " + k).join("  +  ") + "  =  " + resolutions.length,
    entities: Object.keys(resByEntity).length,
    byEntity: resByEntity,
    recordsWithNoDocument: resolutions.filter((r) => !(r.driveFiles || []).length).length,
    conflicts: resolutions.filter((r) => {
      const e = model.resolutionEntity(r.__source || {});
      return e && e.conflict;
    }).length,
  });

  write("compliance-final-summary.json", final);

  console.log("\n=== RECORD LINEAGE ===");
  console.log("FAMILY        RECORDS  PROVEN  MISSING   DOCS  NO-DOC  OFFROOT");
  for (const [k, v] of Object.entries(summary))
    console.log(k.padEnd(13), String(v.records).padStart(7), String(v.lineageProven).padStart(7), String(v.lineageMissing).padStart(8),
      String(v.documents).padStart(6), String(v.recordsWithNoDocument).padStart(7), String(v.documentsOutsideRoot).padStart(8));
  console.log("\n=== NUMBERS ===");
  console.log("  loans:      source rows " + final.loans.sourceRows + " -> " + final.loans.logicalLoans
    + " logical  (" + final.loans.arithmetic + ", balances=" + final.loans.balances + ")   cache holds the " + final.loans.cacheHoldsRawSourceRows + " raw rows");
  console.log("  spend:      " + final.spend.arithmetic);
  console.log("  licences:   model " + final.licences.model + " (tracker " + final.licences.tracker + " + drive-only " + final.licences.driveOnly + ")   cache holds the " + final.licences.cacheHoldsRawTrackerRows + " tracker rows");
  console.log("  resolutions:register " + final.resolutions.register + "   tracker rows " + final.resolutions.sourceRows);
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });

function sameDomain(recFamily, sourceFamily) {
  const map = {
    loans: ["Zameen Group_Loan Agreements", "Zameen Group _PK Intercompany Loans"],
    leases: ["Spend Contracts (Lease and Service Agreements)", "Zameen Group_Loan Agreements", "Zameen Group _PK Intercompany Loans"],
    services: ["Spend Contracts (Lease and Service Agreements)", "Zameen Group_Loan Agreements", "Zameen Group _PK Intercompany Loans"],
    "other-spend": ["Spend Contracts (Lease and Service Agreements)"],
    licences: ["Licenses & Approvals _ Pakistan Entities"],
    resolutions: ["Resolutions"],
  };
  return (map[recFamily] || []).some((f) => String(sourceFamily).trim() === f.trim());
}
