/* WHAT IS WRONG WITH THE DOCUMENT, NOT WITH US.
 *
 * Reading 377 documents turned up defects inside signed instruments: an executed
 * project sales agreement whose own footer names a different project, a signed
 * promotion agreement with a blank Schedule of Work, an instrument executed at
 * Lahore on a stamp paper marked for Islamabad only.
 *
 * None of those is a bug in LegalOS. The file is preserved, it is attached to
 * the right record, and Legal can open the original. What LegalOS owes the
 * reader is to SAY SO — quietly, in the record, where a lawyer will see it.
 *
 * THE RULES THIS FILE OBEYS
 *
 *   Drive is the source of truth. Nothing here rewrites, repairs or normalises a
 *   stored document. The defect is reported; the file is left exactly as filed.
 *
 *   The system may decide WHICH RECORD a document belongs to. It may not decide
 *   which of two contradictory wordings is legally correct. Where a signed
 *   instrument contradicts itself, both readings are surfaced and neither is
 *   chosen. Contract terms, execution facts, jurisdiction, signatures and
 *   schedule contents are never rewritten.
 *
 *   A blank signature block in a PRECEDENT is not a defect — that is what a
 *   precedent is. Only instruments are judged, which is why every rule below
 *   tests execution first.
 *
 * Issue types are deliberately few and legible to a lawyer, not to a parser.
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const VISION = P.join(ROOT, "audit", "commercial-vision.json");

const TYPES = {
  SOURCE_DOCUMENT_CONFLICT: "The stored document contradicts itself or its folder about which project or instrument it is.",
  MISSING_SIGNATURE: "The stored copy carries no execution marks although it is drawn as an instrument between named parties.",
  BLANK_SCHEDULE: "The document was executed with a schedule or annexure left blank.",
  JURISDICTION_STAMP_MISMATCH: "The stamp paper's jurisdiction does not match where the instrument was executed.",
  MISFILED_DRAFT_CONTENT: "A precedent carries another project's details, so the next draft made from it inherits them.",
  EXECUTION_ISSUE: "Something about how the document was executed does not hold together.",
  EMPTY_SOURCE_FILE: "The file stored in Drive is zero bytes and contains no document.",
  NOT_A_DOCUMENT: "The stored file is a container, not a legal instrument.",
};

const SEVERITY = {
  SOURCE_DOCUMENT_CONFLICT: "HIGH",
  MISSING_SIGNATURE: "HIGH",
  BLANK_SCHEDULE: "HIGH",
  JURISDICTION_STAMP_MISMATCH: "MEDIUM",
  EXECUTION_ISSUE: "MEDIUM",
  MISFILED_DRAFT_CONTENT: "MEDIUM",
  EMPTY_SOURCE_FILE: "MEDIUM",
  NOT_A_DOCUMENT: "LOW",
};

/* Re-read only when the file on disk has actually changed. The first version
   took `force` from the caller and the route passed `true`, so a multi-megabyte
   JSON was parsed on every request — fine once, wasteful thousands of times. The
   modification time answers "is my copy stale" for a fraction of the cost. */
let STORE = null, STORE_MTIME = 0;
function load(force) {
  let mtime = 0;
  try { mtime = fs.statSync(VISION).mtimeMs; } catch (e) { mtime = 0; }
  if (STORE && !force && mtime === STORE_MTIME) return STORE;
  if (STORE && mtime === STORE_MTIME) return STORE;      // force only matters if it changed
  try { STORE = JSON.parse(fs.readFileSync(VISION, "utf8")); } catch (e) { STORE = {}; }
  STORE_MTIME = mtime;
  ROWS = null;                                            // derived view is now stale
  return STORE;
}

/* The derived rows are the expensive part, not the parse. Cached against the
   same modification time so a page that asks twice pays once. */
let ROWS = null;

/* Whether a document names a project other than the one it is filed under is
   computed systematically by tools/commercial-project-mismatch.js, against the
   estate's real project list. Reading it here — rather than looking for a
   hand-written marker — means the finding does not depend on whoever recorded
   the document remembering to note it. */
let MISMATCH = null;
function mismatches(force) {
  if (MISMATCH && !force) return MISMATCH;
  MISMATCH = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "commercial-project-mismatch.json"), "utf8"));
    for (const f of j.findings || []) {
      if (f.kind !== "CONTRADICTS_FOLDER") continue;
      MISMATCH.set(f.fileId, f);
    }
  } catch (e) { /* not computed yet */ }
  return MISMATCH;
}

const has = (markers, re) => (markers || []).some((m) => re.test(String(m)));

/* Every issue carries the EVIDENCE that produced it, in the words recorded when
   the document was read. A warning a lawyer cannot check is not worth showing. */
function issuesFor(entry) {
  const f = (entry && entry.facts) || null;
  if (entry && !entry.fileId) entry = Object.assign({}, entry);
  if (!f) return [];
  const out = [];
  const marks = f.draftMarkers || [];
  const executed = f.executed === true;
  const isTemplate = f.documentType === "TEMPLATE" || f.documentFamily === "TEMPLATE";
  const add = (type, evidence) => out.push({
    type, severity: SEVERITY[type] || "MEDIUM", evidence,
    explanation: TYPES[type],
  });

  if (f.documentFamily === "EMPTY_SOURCE_FILE") add("EMPTY_SOURCE_FILE", f.executionEvidence || "zero-byte file");
  if (f.documentFamily === "NOT_A_DOCUMENT") add("NOT_A_DOCUMENT", f.executionEvidence || "archive");

  /* An instrument drawn between named parties, stamped, and stored without a
     single execution mark. This is a fact about the COPY that is held, not proof
     the agreement was never signed, and it is phrased that way. */
  if (!isTemplate && f.executed === null && (f.parties || []).length >= 2 && f.agreementDate
      && has(marks, /no initials from either party|carries no execution marks/i)) {
    add("MISSING_SIGNATURE", f.executionEvidence || "no execution marks in the pages read");
  }

  if (executed) {
    if (has(marks, /footer reads|names the project '|misnames the instrument|opening line misnames/i)) {
      add("SOURCE_DOCUMENT_CONFLICT", marks.filter((m) => /footer reads|misnames|names the project '/i.test(m)).join("; "));
    }
    if (has(marks, /schedule of work|annexure .* blank|blank schedule/i) || /Annexure J .*blank|Schedule of Work is blank/i.test(f.summary || "")) {
      add("BLANK_SCHEDULE", (marks.find((m) => /schedule|annexure/i.test(m)) || f.summary || "").slice(0, 200));
    }
    if (has(marks, /ONLY USED FOR|stamp paper is marked|jurisdiction/i)) {
      add("JURISDICTION_STAMP_MISMATCH", marks.find((m) => /ONLY USED FOR|stamp/i.test(m)) || "");
    }
    if (has(marks, /e-stamp names|different representative|template brackets|initials omitted|placeholder|numbered 1 of/i)) {
      add("EXECUTION_ISSUE", marks.filter((m) => /e-stamp names|representative|template brackets|initials omitted|placeholder|numbered 1 of/i.test(m)).join("; ").slice(0, 300));
    }
  }

  /* Filed under one project, naming another. For a precedent that is a drafting
     hazard; for an executed instrument it is a conflict in a binding document,
     so the two are reported as different things. */
  const mm = mismatches().get(entry.fileId);
  if (mm) {
    const evidence = "filed under " + mm.folderSays + "; the document names " + mm.documentSays;
    if (executed) add("SOURCE_DOCUMENT_CONFLICT", evidence);
    else add("MISFILED_DRAFT_CONTENT", evidence);
  }

  return out;
}

/* Every document with something wrong with it, ready for a register or a
   Data Health table. Pure read; changes nothing. */
function all(force) {
  const store = load(force);
  if (ROWS && !force) return ROWS;
  const rows = [];
  for (const id of Object.keys(store)) {
    const e = store[id];
    const issues = issuesFor(e);
    if (!issues.length) continue;
    rows.push({
      fileId: id,
      filename: e.filename || "",
      folderPath: e.folderPath || "",
      project: (e.facts && e.facts.project) || "",
      documentType: (e.facts && e.facts.documentType) || "",
      executed: e.facts ? e.facts.executed : null,
      issues,
      severity: issues.some((i) => i.severity === "HIGH") ? "HIGH"
        : issues.some((i) => i.severity === "MEDIUM") ? "MEDIUM" : "LOW",
      status: "OPEN",
    });
  }
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  rows.sort((a, b) => order[a.severity] - order[b.severity] || a.filename.localeCompare(b.filename));
  ROWS = rows;
  return rows;
}

const byFile = (fileId) => {
  const e = load()[fileId];
  return e ? issuesFor(e) : [];
};

function summary(force) {
  const rows = all(force);
  const byType = {};
  for (const r of rows) for (const i of r.issues) byType[i.type] = (byType[i.type] || 0) + 1;
  return {
    documentsWithIssues: rows.length,
    high: rows.filter((r) => r.severity === "HIGH").length,
    medium: rows.filter((r) => r.severity === "MEDIUM").length,
    low: rows.filter((r) => r.severity === "LOW").length,
    byType,
    /* Said plainly, because the distinction decides whether anyone is on the
       hook: these are defects in what was signed and filed, not in LegalOS. */
    classification: "SOURCE QUALITY ISSUE — the file is preserved, attached to the correct record, and openable in Drive; LegalOS reports the defect and invents nothing.",
  };
}

module.exports = { all, byFile, summary, issuesFor, TYPES, SEVERITY };
