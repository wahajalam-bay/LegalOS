#!/usr/bin/env node
/* RECONCILING EVERY COMPLIANCE YEAR TO THE LAST DOCUMENT.
 *
 * "No source document" was appearing against financial statements on years
 * holding 49 files, and a status like that is a question, not an answer. This
 * tool is what turns it into one: it walks every source-backed CY folder to its
 * leaves, gives EVERY file a disposition, and -- where the filename cannot
 * settle what a file is -- asks Drive's content index what the document
 * actually says.
 *
 * WHY CONTENT AND NOT FILENAMES. A filename is a label somebody typed. This
 * estate is 72% scanned paper, and the machine has no OCR, but Google has
 * already read every page: `fullText contains` searches INSIDE a scan. So the
 * probe words below are chosen to appear in the BODY of a set of accounts and
 * almost nowhere else -- "amortisation", "payables", "equity" -- rather than in
 * anything that merely mentions an auditor. A Form 29 appointing an auditor is
 * not a financial statement, and a filename regex looking for "auditor" cannot
 * tell the difference.
 *
 * WHAT IT WILL NOT DO. It will not attach a document to a year because the year
 * has none. A document is attached on the Drive path it sits in plus what it
 * says; nothing is fuzzy-matched to clear a missing state. Where a year
 * genuinely holds no accounts, that is the finding, and it is recorded with the
 * evidence behind it.
 *
 *   node tools/secp-cy-reconcile.js              # reconcile, write the matrix
 *   node tools/secp-cy-reconcile.js --probe      # also read ambiguous files
 *   node tools/secp-cy-reconcile.js --entity X   # one company
 */
const fs = require("fs"), P = require("path");
const records = require("../api/secp-records.js");
const drive = require("../api/drive.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "cache", "secp-cy-reconciliation.json");

/* ---------------------------------------------------------- dispositions --
   Every file under a CY folder ends in exactly one of these. The list is the
   one the reconciliation was specified against; nothing falls outside it,
   because UNCLASSIFIED is itself a disposition and its count must reach zero. */
const DISPOSITIONS = [
  "AUDITED_FINANCIAL_STATEMENTS", "FINANCIAL_STATEMENTS_SUPPORT",
  "AGM_NOTICE", "AGM_MINUTES", "AGM_ATTENDANCE",
  "FORM_A", "FORM_9", "FORM_19", "FORM_29", "OTHER_ANNUAL_FORM", "EVENT_BASED_FILING",
  "FILING_RECEIPT", "SECP_ACKNOWLEDGEMENT", "CHALLAN", "PAYMENT_RECEIPT",
  "CORRESPONDENCE", "SUPPORTING_DOCUMENT", "REFERENCE_DOCUMENT",
  "SYSTEM_FILE", "NON_SECP_CONTAMINATION", "UNCLASSIFIED",
];

/* Ordered: the FIRST rule that matches wins, so the specific sits above the
   general. "Audited accounts" must be tested before "accounts", and an
   acknowledgement of a filing before the filing it acknowledges. */
const RULES = [
  ["AUDITED_FINANCIAL_STATEMENTS", /audited financial|financial statement|audited account|annual account|signed account|\bfinancials\b|\bfs\b|balance sheet|profit and loss|statement of financial position/i],
  /* The annual accounts package is more than the accounts. A directors' report,
     a chairman's review and a statement of compliance are laid before the same
     meeting and filed with the same return -- they evidence the accounts
     without BEING them, so they support rather than satisfy. */
  ["FINANCIAL_STATEMENTS_SUPPORT", /auditor.?s? (consent|certificat|report)|audit report|trial balance|working paper|management letter|engagement letter|directors.{0,3} report|chairman.{0,3}s? review|statement of compliance|review report|audited .{0,12}recon|\baup\b|\bccg\b.{0,12}report|code of corporate governance/i],
  ["AGM_NOTICE", /(notice|intimation|direction).{0,30}(agm|annual general)|\bagm\b.{0,25}(notice|direction)|pre agm/i],
  ["AGM_MINUTES", /(minutes|proceeding).{0,30}(agm|annual general)|\bagm\b.{0,20}minutes/i],
  ["AGM_ATTENDANCE", /attendance|quorum|proxy/i],
  ["SECP_ACKNOWLEDGEMENT", /acknowledg|\backn\b/i],
  ["CHALLAN", /challan/i],
  ["PAYMENT_RECEIPT", /payment|fee (receipt|voucher)|bank receipt|deposit slip/i],
  ["FILING_RECEIPT", /filing receipt|e-?zfile|ezfile|submission|submitted|\breceipt\b/i],
  /* The same misspellings api/secp-source.js now repairs -- "Fom A", "Fomr A",
     "From 45" are Form A and Form 45, and a reconciliation that cannot read
     them disagrees with the product about what is on file. */
  ["FORM_A", /\b(?:form|fomr|forn|fom|frm)\s*a\b/i],
  ["FORM_9", /\b(?:form|fomr|forn|fom|frm)\s*0?9\b/i],
  ["FORM_19", /\b(?:form|fomr|forn|fom|frm)\s*19\b/i],
  ["FORM_29", /\b(?:form|fomr|forn|fom|frm)\s*29\b/i],
  /* A form code is a number or a letter -- "Form I" is a form. Restricting the
     catch-all to digits left lettered forms with no disposition at all. */
  ["EVENT_BASED_FILING", /\b(?:form|fomr|forn|fom|frm|from)\s*(?:\d{1,3}[a-z]?|[ivx]+|[a-z])\b/i],
  /* The registrar writes to the company and the company writes back. A
     "Deputy Registrar of Companies" document is that correspondence, and it
     was the single largest unclassified group in the estate. */
  ["CORRESPONDENCE", /letter|email|e-?mail|correspondence|intimation|notice|reply|response|query|secp direction|direction u\.?s|circular|compliance directive|retainership|deputy registrar|registrar(ar)? of companies|observation|secp (order|confirmation)|name availability|reservation of company name/i],
  /* "Memorandam", "Affidvit", "Appointement", "Registrarar" -- this estate is
     typed by hand and the reconciliation has to read what is actually there.
     Each of these is a single-character slip of a word already in the rules,
     not a guess about a document nobody has read. */
  ["REFERENCE_DOCUMENT", /memorand(um|am)|articles? of association|\bmoa\b|\baoa\b|certificate of incorporation|incorporation certificate|\bcoi\b|company profile|bio ?data|passport|\bcnic\b|\bntn\b|certificate|\bpseb\b|taxpayer|inc\.? ?form|name change|shareholder|prospectus|\blicense\b|licence|post incorporation|alt verification|company address/i],
  ["SYSTEM_FILE", /^\.|\.tmp$|desktop\.ini|thumbs\.db|^~\$/i],
  ["SUPPORTING_DOCUMENT", /affid(a)?vit|undertaking|resignation|appoint(e)?ment|appoinment|minutes|meeting|agreement|resolution|transfer|clearance|list of (directors|company officers|documents|successful allottees)|bank (account )?statement|account maintenance|\bmom\b|app\.?\s*v[\s-]?\d+|annexure|declaration|registration|share|allot(tee|ment)|\barts\b|\bppt\b/i],
];

/* Words that appear in the BODY of a set of accounts and essentially nowhere
   else in this estate. Single words on purpose: Drive's index ORs the words of
   a phrase, so a multi-word probe matches anything containing any one of them
   and proves nothing. */
const FS_PROBES = [
  "amortisation", "amortization", "payables", "receivables", "depreciation",
  "equity", "liabilities", "accrued", "creditors", "debtors", "turnover",
  "taxation", "revenue", "expenses", "assets",
];
/* ONE WORD IS NOT A FINDING. "equity" alone matched board resolutions about
   increasing authorised capital and a minute about an equity investment --
   documents that are not accounts and must never be filed as them. A set of
   accounts uses this whole vocabulary at once, so a file is only read as
   accounts when SEVERAL of these words are in it. The threshold is the
   difference between reading a document and pattern-matching a word in it.
   Note also the converse: Drive's index answers for roughly six of ten known
   financial statements here, so a file with no hits is NOT thereby proven to
   be something else -- which is why no file is ever RE-classified downward by
   this probe, only recovered upward. */
const FS_PROBE_THRESHOLD = 4;

/* "_" IS A WORD CHARACTER. "Form 9_[Election of Directors]" and "11_Form 28"
   defeat every \b anchor above, which is why the first pass left 554 files
   unclassified and why "Audited Financials" never registered as accounts.
   Separators are normalised to spaces before anything is matched -- the same
   trap secp-source.js records as having once misfiled 216 documents. */
/* What earlier runs established by READING the documents. "Audited Accoutns FY
   2022" is a set of audited accounts and no pattern will ever say so, because
   the word is misspelt past recognition; the probe read it and recorded what
   it is. The product applies the same file (api/secp-records.js), so tool and
   product agree about what that document is rather than disagreeing by one. */
let PRIOR_FINDINGS = {};
try { PRIOR_FINDINGS = require("../cache/secp-content-findings.json").findings || {}; } catch (e) { PRIOR_FINDINGS = {}; }

function disposition(d) {
  const prior = PRIOR_FINDINGS[d.id] || PRIOR_FINDINGS[d.fileId];
  if (prior && prior.disposition) return prior.disposition;
  const n = String(d.name || "").replace(/[_\-]+/g, " ");
  for (const [tag, re] of RULES) if (re.test(n)) return tag;
  return "UNCLASSIFIED";
}

/* A file only counts as accounts when it is BOTH named like a set of accounts
   and, where we looked, reads like one -- or when the content probe found it
   regardless of its name. */
function isAccounts(tag) { return tag === "AUDITED_FINANCIAL_STATEMENTS"; }
/* Would the FILENAME alone have settled it? Used only to report how a document
   was identified, never to decide what it is. */
const FS_NAME_RE = RULES.find(([t]) => t === "AUDITED_FINANCIAL_STATEMENTS")[1];
const FS_BY_NAME = (d) => FS_NAME_RE.test(String(d.name || "").replace(/[_-]+/g, " "));

async function main() {
  const args = process.argv.slice(2);
  const doProbe = args.includes("--probe");
  const only = args.includes("--entity") ? args[args.indexOf("--entity") + 1] : null;

  let years = records.annualCompliance();
  if (only) years = years.filter((y) => new RegExp(only, "i").test(y.entity));
  console.log("reconciling " + years.length + " entity-years\n");

  /* ---- pass 1: every file gets a disposition from its name and its folder */
  const rows = [];
  const ambiguous = [];
  for (const y of years) {
    const docs = y.documents || [];
    const tally = {};
    for (const d of docs) {
      const tag = disposition(d);
      d.__tag = tag;
      tally[tag] = (tally[tag] || 0) + 1;
      if (tag === "UNCLASSIFIED") ambiguous.push({ y, d });
    }
    rows.push({ y, docs, tally });
  }

  const unclassified = ambiguous.length;
  console.log("pass 1 — " + unclassified + " file(s) the filename could not settle");

  /* ---- pass 2: ask Drive what the ambiguous files, and the FS-less years, say */
  const probedFs = new Set();
  let probeScores = new Map();
  if (doProbe) {
    /* Every file sitting in a year that shows no accounts is a candidate: this
       is the state the reconciliation exists to disprove, so it is read rather
       than assumed. */
    const candidates = [];
    for (const r of rows) {
      if (r.docs.some((d) => isAccounts(d.__tag))) continue;
      for (const d of r.docs) candidates.push(d.id);
    }
    const ids = [...new Set(candidates.concat(ambiguous.map((a) => a.d.id)))];
    console.log("pass 2 — reading " + ids.length + " file(s) through Drive's content index");
    const score = new Map();
    for (const term of FS_PROBES) {
      try {
        const hits = await drive.matchesIn(term, ids);
        for (const id of hits) score.set(id, (score.get(id) || 0) + 1);
        console.log("   \"" + term + "\" → " + hits.length + " hit(s)");
      } catch (e) {
        console.log("   \"" + term + "\" → probe failed: " + e.message);
      }
    }
    for (const [id, n] of score) if (n >= FS_PROBE_THRESHOLD) probedFs.add(id);
    console.log("   " + probedFs.size + " file(s) used " + FS_PROBE_THRESHOLD
      + "+ of the accounting vocabulary and are read as accounts"
      + " (" + score.size + " matched at least one word)");
    probeScores = score;
  }

  /* ---- the matrix */
  const matrix = rows.map((r) => {
    const t = r.tally;
    const fsFiles = r.docs.filter((d) => isAccounts(d.__tag) || probedFs.has(d.id));
    const uiDocs = r.y.documentCount || 0;
    return {
      entity: r.y.entity,
      entityKey: r.y.entityKey,
      sourceGroup: r.y.group === "group" ? "Group" : "Non-group",
      cy: r.y.sourcePeriodLabel,
      sourceFolders: (r.y.sourceFolders || []).map((f) => f.fullDrivePath),
      totalFiles: r.docs.length,
      financialStatements: fsFiles.length,
      financialStatementFiles: fsFiles.map((d) => ({ id: d.id, name: d.name,
        /* True when the filename never said so and the document itself had to
           be read -- either in this run's probe, or in an earlier one whose
           finding is on file. Both are "we read it", and the matrix should not
           quietly demote the second to "the name told us". */
        viaContent: !!(PRIOR_FINDINGS[d.id] || probedFs.has(d.id)) && !FS_BY_NAME(d),
        probeWords: probeScores.get(d.id) || (PRIOR_FINDINGS[d.id] || {}).accountingWords || 0 })),
      agm: (t.AGM_NOTICE || 0) + (t.AGM_MINUTES || 0) + (t.AGM_ATTENDANCE || 0),
      formA: t.FORM_A || 0,
      form9: t.FORM_9 || 0,
      form19: t.FORM_19 || 0,
      form29: t.FORM_29 || 0,
      eventFilings: t.EVENT_BASED_FILING || 0,
      filingEvidence: (t.FILING_RECEIPT || 0) + (t.CHALLAN || 0) + (t.PAYMENT_RECEIPT || 0),
      acknowledgements: t.SECP_ACKNOWLEDGEMENT || 0,
      otherDocuments: (t.CORRESPONDENCE || 0) + (t.SUPPORTING_DOCUMENT || 0)
        + (t.REFERENCE_DOCUMENT || 0) + (t.FINANCIAL_STATEMENTS_SUPPORT || 0),
      unclassified: t.UNCLASSIFIED || 0,
      uiDocuments: uiDocs,
      /* The whole point of the matrix: every file the folder holds has to be
         accounted for by the dispositions above it. */
      difference: r.docs.length - uiDocs,
      dispositions: t,
    };
  });

  const bad = matrix.filter((m) => m.difference !== 0);
  const stillUnclassified = matrix.reduce((n, m) => n + m.unclassified, 0);
  const noFs = matrix.filter((m) => m.financialStatements === 0);
  const recovered = matrix.filter((m) => m.financialStatementFiles.some((f) => f.viaContent));

  console.log("\n=== RECONCILIATION ===");
  console.log("entity-years reconciled:        " + matrix.length);
  console.log("files with a disposition:       " + matrix.reduce((n, m) => n + m.totalFiles, 0));
  console.log("UNCLASSIFIED files:             " + stillUnclassified);
  console.log("rows where Drive != UI count:   " + bad.length);
  console.log("years holding accounts:         " + (matrix.length - noFs.length));
  console.log("  of which found by content:    " + recovered.length);
  console.log("years genuinely without:        " + noFs.length);
  for (const b of bad.slice(0, 10)) console.log("   DIFF " + b.entity + " " + b.cy + ": drive " + b.totalFiles + " vs ui " + b.uiDocuments);

  /* WHAT READING THE DOCUMENTS ESTABLISHED, HANDED TO THE PRODUCT.
     The classifier in api/secp-records.js reads filenames, and a filename is
     all it can read at request time -- probing Drive's content index takes
     minutes, not milliseconds. So the findings are written here, keyed by Drive
     file id, and the model applies them on top of its own classification. Only
     UPWARD: a finding can establish that a file IS a set of accounts, never
     that it is not, because the index answers for roughly six documents in ten
     and silence is not evidence. Each entry carries what proved it. */
  const findings = {};
  for (const m of matrix) {
    for (const f of m.financialStatementFiles) {
      if (!f.viaContent) continue;
      findings[f.id] = {
        disposition: "AUDITED_FINANCIAL_STATEMENTS",
        name: f.name, entity: m.entity, cy: m.cy,
        provenBy: "drive-fulltext", accountingWords: f.probeWords,
      };
    }
  }
  const FIND = P.join(ROOT, "cache", "secp-content-findings.json");
  fs.mkdirSync(P.dirname(FIND), { recursive: true });
  if (doProbe) {
    fs.writeFileSync(FIND, JSON.stringify({
      builtAt: new Date().toISOString(),
      probeWords: FS_PROBES, threshold: FS_PROBE_THRESHOLD,
      filesProbed: probeScores.size, findings,
    }, null, 1));
    console.log("content findings written to " + P.relative(ROOT, FIND)
      + " (" + Object.keys(findings).length + " file(s))");
  }

  fs.mkdirSync(P.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    builtAt: new Date().toISOString(),
    probed: doProbe,
    dispositions: DISPOSITIONS,
    totals: {
      entityYears: matrix.length,
      files: matrix.reduce((n, m) => n + m.totalFiles, 0),
      unclassified: stillUnclassified,
      countMismatches: bad.length,
      yearsWithAccounts: matrix.length - noFs.length,
      yearsWithoutAccounts: noFs.length,
      accountsFoundByContent: recovered.length,
    },
    matrix,
  }, null, 1));
  console.log("\nmatrix written to " + P.relative(ROOT, OUT));
}

main().catch((e) => { console.error(e); process.exit(1); });
