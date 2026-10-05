// THE COMPLIANCE DOCUMENT LAYER: ONE INSTRUMENT, ONE ROW, ONE NUMBER.
//
// WHAT THESE CHECKS ARE HOLDING IN PLACE
//
//   A TRACKER IS NOT A DOCUMENT. Sweeping a folder's contents onto a record
//   pulled the spreadsheets that DEFINE the register into the records they
//   describe: "00_Master Tracker - Spend Contracts - Zameen Media.xlsx" sat in
//   a lease's Documents tab beside the lease. Seventeen of them across nine
//   records.
//
//   THE BADGE IS THE LIST. The register row, the detail badge and the rendered
//   list are three separate reads of the same thing, and they disagreed: two
//   loans showed "Documents 4" above a tab rendering 19, because contested
//   documents were listed but not counted.
//
//   A COUNT IS OF INSTRUMENTS, NOT FILES. The same signed lease filed in two
//   folders is one document. Rendered literally it put 82 identical rows in
//   front of Legal across 41 records.
//
//   DRIVE'S CREATED TIME IS NOT A DOCUMENT DATE. Using it to order a history
//   dated four lease agreements to the day of the migration, after which every
//   real amendment appeared to predate the agreement it amends.
//
//   node tests/m19-compliance-documents.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const audit = (n) => { try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8")); } catch (e) { return null; } };

H.runSuite("m19-compliance-documents — every document accounted for, once", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_CDOC_PORT", portFallback: "4855", prefix: "legalos-cdoc-",
  }));
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);
  const get = async (p) => H.request(sb.base, "GET", p, { cookie });

  /* ---- 1. every Drive file has a disposition ----------------------------- */
  const inv = audit("compliance-document-inventory.json");
  check("every Compliance Drive file is accounted for",
    !!inv && inv.unexplained === 0,
    inv ? inv.complianceFiles + " files: " + inv.mappedToARecord + " on records, "
      + inv.ofWhichExposedAtEntityLevel + " at entity level, " + inv.ofWhichNotRecordDocuments
      + " not record documents, " + inv.unexplained + " unexplained" : "inventory missing");

  const links = audit("compliance-document-broken-links.json");
  check("no record cites a Drive file that does not exist",
    !!links && links.broken === 0 && links.strayDocumentsOnRecords === 0,
    links ? links.broken + " broken, " + links.strayDocumentsOnRecords + " stray" : "missing");

  /* ---- 2. trackers are not record documents ------------------------------ */
  const isSheet = (n) => /\.(xlsx|xlsm|xls|csv)$/i.test(String(n || ""));
  const docsOf = (r) => (r.driveFiles || []).concat(r.extraDocuments || []).concat(r.contestedDocuments || []);
  const leases = ((await get("/api/compliance/leases")).body || {}).leases || [];
  const services = ((await get("/api/compliance/services")).body || {}).services || [];
  const loans = ((await get("/api/compliance/loans")).body || {}).loans || [];
  const spreadsheetRows = [...leases, ...services, ...loans]
    .flatMap((r) => docsOf(r).filter((d) => isSheet(d.name)).map((d) => r.id + ": " + d.name));
  check("no source tracker is served as a record document",
    spreadsheetRows.length === 0,
    spreadsheetRows.slice(0, 3).join(" | ") || "checked " + (leases.length + services.length + loans.length) + " records");

  /* ---- 3. the badge equals the list, everywhere -------------------------- */
  const ui = audit("compliance-document-ui-reconciliation.json");
  check("register badge, detail badge and rendered list agree on every record",
    !!ui && ui.countMismatches === 0,
    ui ? ui.recordsChecked + " records checked, " + ui.countMismatches + " mismatches" : "missing");
  check("no document on screen lacks a Drive object behind it",
    !!ui && ui.documentsWithoutADriveObject === 0,
    ui ? ui.documentsWithoutADriveObject + " without a source" : "missing");

  /* ---- 4. duplicates: one instrument, one row ---------------------------- */
  const dups = audit("compliance-document-duplicate-groups.json");
  check("every duplicate group has a disposition",
    !!dups && dups.unclassified === 0,
    dups ? dups.groups + " groups: " + Object.entries(dups.byClassification).map(([k, v]) => v + " " + k.split("_")[0]).join(", ") : "missing");
  check("the duplicate arithmetic balances",
    !!dups && dups.logicalDocumentsRepresented === dups.groups,
    dups ? dups.physicalFilesInDuplicateGroups + " physical files = " + dups.logicalDocumentsRepresented
      + " logical documents + " + (dups.physicalFilesInDuplicateGroups - dups.logicalDocumentsRepresented) + " extra copies" : "missing");
  /* GROUPING MUST NOT WIDEN ACCESS. Copies are grouped only after the
     permission filter, so a copy the caller cannot open can never become the
     one they are shown. */
  check("no duplicate group holds copies with different authorization",
    !!dups && dups.scopeDifferencesWithinAGroup === 0,
    dups ? dups.scopeDifferencesWithinAGroup + " groups differ in scope" : "missing");

  const withCopies = [...leases, ...services, ...loans].flatMap(docsOf).filter((d) => d.physicalCopies > 1);
  check("a document with several physical copies is shown once, carrying its copies",
    withCopies.every((d) => Array.isArray(d.sourceCopies) && d.sourceCopies.length === d.physicalCopies),
    withCopies.length + " collapsed document(s), each naming every Drive location");
  const anyRec = [...leases, ...services, ...loans].find((r) => r.physicalFileCount > r.documentCount);
  check("the visible count is of instruments; physical copies are reported separately",
    !anyRec || (anyRec.documentCount < anyRec.physicalFileCount && anyRec.duplicateSourceCopies > 0),
    anyRec ? anyRec.id + ": " + anyRec.documentCount + " documents from " + anyRec.physicalFileCount + " files" : "no record holds duplicate copies");

  /* ---- 5. ordering and lineage ------------------------------------------- */
  const order = audit("compliance-document-order.json");
  check("no record displays its documents out of date order",
    !!order && order.orderingErrors === 0,
    order ? order.recordsWithDocuments + " records ordered, " + order.orderingErrors + " errors" : "missing");
  /* A document whose own name carries no date is undated. Drive's created time
     is when the file was uploaded, and dating instruments by it put four 2022
     leases in 2026. */
  const undatedFirst = (order && order.errors || []).filter((e) => /undated/.test(e.why));
  check("an undated document never sorts before a dated one", undatedFirst.length === 0,
    undatedFirst.length + " undated documents ahead of dated ones");

  const gaps = audit("compliance-document-lineage-gaps.json");
  check("every lineage gap has a disposition",
    !!gaps && gaps.unresolved === 0,
    gaps ? gaps.gaps + " gaps: " + Object.entries(gaps.byStatus).map(([k, v]) => v + " " + k).join(", ") : "missing");
  check("a lifecycle action is only linked to a parent when the evidence is unambiguous",
    !!gaps && (gaps.detail || []).filter((x) => x.status === "CONFIRMED_PARENT").every((x) => x.candidateCount === 1),
    "a probable parent is recorded as probable, never linked");

  /* ---- 6. the two empty states stay distinguishable ---------------------- */
  check("an empty Documents tab says WHY it is empty",
    !!ui && (ui.emptyBecauseNothingLinked + ui.emptyBecauseRestricted) > 0
      && ui.emptyBecauseRestricted > 0,
    ui ? ui.emptyBecauseNothingLinked + " have nothing linked, " + ui.emptyBecauseRestricted + " are linked but not permitted" : "missing");

  /* ---- 7. grouping changed no one's access ------------------------------- */
  const drive = require("../api/drive.js");
  const scope = require("../api/document-scope.js");
  const registers = require("../api/registers.js");
  await drive.ensureIndex();
  const st = await registers.ensure();
  const d = scope.diff({ files: drive.indexFiles(), registers: st.registers });
  const stats = scope.stats();
  check("no document was widened without an approval behind it", d.widened.length === 0,
    d.widened.slice(0, 3).map((w) => w.name).join(" | ") || "none");
  check("the only widening on record is the approved Spend policy",
    Object.keys(d.byPolicy || {}).every((k) => k === "SPEND-COMPLIANCE-SHARE-V1"),
    JSON.stringify(d.byPolicy));
  check("nothing was narrowed and nothing is unscoped",
    d.narrowed.length === 0 && (stats.summary && stats.summary.withNoScope) === 0,
    "narrowed " + d.narrowed.length + ", unscoped " + (stats.summary && stats.summary.withNoScope));
});
