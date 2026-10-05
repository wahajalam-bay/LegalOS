// EVERY COMPLIANCE YEAR, RECONCILED TO THE LAST DOCUMENT.
//
// A year holding 49 files was reporting "No source document" against its
// financial statements, and that is the shape of failure this suite exists to
// catch: a status that is a question nobody went and answered.
//
// WHAT WAS ACTUALLY WRONG. Not the crawl -- every nested subfolder was already
// being walked. It was the reading:
//
//   "Audited Financials FY 2023" is a set of audited financial statements, and
//   the classifier looked for "financial statement". 53 entity-years reported
//   no accounts over accounts that were sitting in the folder.
//
//   "_" is a word character, so \bform never fires on "Form 9_[Election of
//   Directors]" or "11_Form 28". The same boundary trap secp-source.js records
//   as having once misfiled 216 documents was still live in secp-records.js.
//
//   "Fom A", "Fomr A" and "From 45" are Form A and Form 45 with a slip of the
//   pen. Three annual returns read as no form at all.
//
//   "Form 3A" was no form at all either -- the code pattern allowed "3" or "A"
//   but not "3A".
//
//   The same instrument filed in two source folders was counted twice in the
//   register and once in the drill-down, so 3,367 sat above pages adding to
//   3,150.
//
// AND WHAT IS NOT A BUG. 108 entity-years genuinely hold no accounts. That is
// a finding, reached by reading the documents and not by failing to look:
// tools/secp-cy-reconcile.js --probe reads candidates through Drive's content
// index, which is how "Audited Accoutns FY 2022" -- misspelt past any pattern
// -- was found. Absence stays absence; it is never filled in.
//
//   node tests/m31-secp-cy-reconciliation.js
const H = require("./_harness.js");
const records = require("../api/secp-records.js");

H.runSuite("SECP compliance-year reconciliation", async (ctx) => {
  const { check } = ctx;
  const years = records.annualCompliance();
  const sum = records.summary();

  /* ------------------------------------------------ reading the filenames */

  const norm = (s) => String(s || "").replace(/[_-]+/g, " ");
  const looksLikeAccounts = (d) =>
    /audited financial|audited account|audited financials|signed account/i.test(norm(d.name));
  const missedAccounts = years.filter((y) =>
    y.financialStatements.status === "NO_SOURCE_DOCUMENT"
    && (y.documents || []).some(looksLikeAccounts));
  check("no year reports 'no source document' over accounts sitting in its own folder",
    missedAccounts.length === 0,
    missedAccounts.length
      ? missedAccounts.slice(0, 3).map((y) => y.entity + " " + y.sourcePeriodLabel).join("; ")
      : "checked all " + years.length + " entity-years");

  check("the estate's accounts are found, not assumed missing",
    years.filter((y) => y.financialStatements.status !== "NO_SOURCE_DOCUMENT").length >= 140,
    years.filter((y) => y.financialStatements.status !== "NO_SOURCE_DOCUMENT").length + " of "
      + years.length + " entity-years hold accounts");

  /* An underscore next to a keyword must not hide it. */
  const underscoreHidden = [];
  for (const y of years) {
    for (const d of (y.documents || [])) {
      const n = norm(d.name);
      if (/\bform\s*(a|9|19|29)\b/i.test(n) && !d.form) underscoreHidden.push(d.name);
    }
  }
  check("a keyword next to an underscore is still read",
    underscoreHidden.length === 0,
    underscoreHidden.length ? underscoreHidden.slice(0, 3).join(" ;; ") : "no form is hidden by its separator");

  /* Misspellings of one word, repaired only where a real code follows. */
  const typos = [];
  for (const y of years) {
    for (const d of (y.documents || [])) {
      if (/\b(fom|fomr|forn|frm)\s+([0-9]{1,3}[a-z]?|[a-z])\b/i.test(norm(d.name)) && !d.form) {
        typos.push(d.name);
      }
    }
  }
  check("a misspelt form word still yields its form",
    typos.length === 0, typos.length ? typos.slice(0, 3).join(" ;; ") : "Fom / Fomr / From all resolve");

  const codes = new Set();
  for (const y of years) for (const d of (y.documents || [])) if (d.form) codes.add(d.form);
  const malformed = [...codes].filter((c) => !/^([0-9]{1,3}[A-Z]?|[A-Z])$/.test(c));
  check("no form code is an artefact of the pattern that read it",
    malformed.length === 0,
    malformed.length ? malformed.join(", ") : [...codes].sort().join(", "));
  check("suffixed form codes are read as themselves", codes.has("3A"),
    codes.has("3A") ? "Form 3A is a form" : "Form 3A is still being dropped");

  /* -------------------------------------------- every file has a home */

  const placed = years.reduce((n, y) => n + (y.documents || []).length, 0);
  check("every file under a compliance year is attached to that year",
    placed === sum.documentsOnAnnualRecords,
    placed + " files placed");

  /* ------------------------------------------------- the counts reconcile */

  check("the estate counts instruments, and says separately how many files that is",
    sum.documents < sum.physicalFiles
      && sum.physicalFiles - sum.documents === sum.duplicateSourceCopies,
    sum.documents + " documents across " + sum.physicalFiles + " files ("
      + sum.duplicateSourceCopies + " second copies)");

  const secp = require("../api/secp.js");
  const ents = await secp.entityOverview(null);
  const inScope = ents.filter((e) => e.statutory);
  const perEntity = inScope.reduce((n, e) => n + (e.statutoryDocuments || 0), 0);
  check("the register's rows add up to the estate, with no unexplained difference",
    perEntity === sum.documents, perEntity + " summed against an estate of " + sum.documents);
  const perEntityFiles = inScope.reduce((n, e) => n + (e.statutoryPhysicalFiles || 0), 0);
  check("and so do the physical files", perEntityFiles === sum.physicalFiles,
    perEntityFiles + " against " + sum.physicalFiles);

  /* ------------------------------------- what remains absent, and why */

  const without = years.filter((y) => y.financialStatements.status === "NO_SOURCE_DOCUMENT");
  let findings = {};
  try { findings = require("../cache/secp-content-findings.json").findings || {}; } catch (e) { findings = {}; }
  check("where a filename could not settle it, the document itself was read",
    Object.keys(findings).length > 0,
    Object.keys(findings).length + " file(s) classified by their contents, not their names");
  check("a year with no accounts says so rather than being filled in",
    without.every((y) => (y.financialStatements.documents || []).length === 0),
    without.length + " entity-years genuinely hold no accounts");

  /* ------------------------------------------- the matrix, as an artefact */

  /* tools/secp-cy-reconcile.js writes the entity-year matrix this suite's
     findings come from. It is checked in here so a regression cannot quietly
     leave files undisposed: "UNCLASSIFIED" is itself a disposition, and its
     count reaching zero is the whole acceptance condition. */
  let matrix = null;
  try { matrix = require("../cache/secp-cy-reconciliation.json"); } catch (e) { matrix = null; }
  check("the reconciliation matrix exists to be read", !!matrix,
    matrix ? "built " + matrix.builtAt : "run tools/secp-cy-reconcile.js");
  if (matrix) {
    check("every file under a compliance year has a disposition",
      matrix.totals.unclassified === 0,
      matrix.totals.unclassified + " unclassified of " + matrix.totals.files + " files");
    check("no entity-year's Drive contents differ from what the product counts",
      matrix.totals.countMismatches === 0,
      matrix.totals.countMismatches + " rows differ across " + matrix.totals.entityYears + " entity-years");
    check("the matrix and the model agree on how many years hold accounts",
      matrix.totals.yearsWithAccounts
        === years.filter((y) => y.financialStatements.status !== "NO_SOURCE_DOCUMENT").length,
      matrix.totals.yearsWithAccounts + " in the matrix");
  }

  /* An AGM is never asserted against a company that holds none. */
  const smcWithAgm = years.filter((y) => y.entityType === "SMC" && y.agm && y.agm.applicable);
  check("no single member company is given an AGM", smcWithAgm.length === 0,
    smcWithAgm.length ? smcWithAgm.slice(0, 2).map((y) => y.entity).join("; ") : "SMCs hold no AGM");
});
