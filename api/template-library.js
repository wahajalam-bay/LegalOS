/* WHAT EACH FILE IN THE TEMPLATE DRAWER ACTUALLY IS.
 *
 * "Zameen - Pakistan Contract Templates" holds 413 files and the folder name is
 * not a verdict on any of them. Sixteen are executed instruments: a Google
 * advertising agreement stamped by Google's legal department, digital marketing
 * agreements with three banks under seal, a vehicle lease on Rs 100 stamp paper,
 * seventeen DHA allotment letters signed by the Director Transfer & Record.
 *
 * Two surfaces need that distinction and used to disagree about it:
 *
 *   the registers    attached blank pro-formas to live records, because a blank
 *                    "Agreement to Sell for Zameen Quadrangle" matches the
 *                    Quadrangle project on every signal a matcher has.
 *   the Templates    listed the executed instruments alongside the blanks with
 *   page             nothing to tell them apart, which is the same error from
 *                    the other side: a signed contract that can only be found
 *                    inside the template library is a signed contract lost.
 *
 * Both read this. The classification itself is produced by
 * tools/zm-template-classify.js and lives in audit/zm-template-library.json;
 * this module only serves it, cached on the file's mtime so a reclassification
 * takes effect without a restart.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "audit", "zm-template-library.json");

/* States that are NOT a live record's own document. An executed instrument
   filed in this drawer is real and stays attached; a blank form is stationery
   and must not appear on a record as though it were that record's agreement. */
const NOT_A_RECORDS_OWN_DOCUMENT = new Set([
  "APPROVED_TEMPLATE",
  "DRAFT_TEMPLATE",
  "WORK_IN_PROGRESS_TEMPLATE",
  "STANDARD_CLAUSE_LIBRARY",
  "NON_TEMPLATE_MISC",
  "EDITOR_ARTEFACT",
]);

/* How each state should read on a screen. The stored values are SCREAMING_SNAKE
   because they are compared in code; a person should not have to. */
const LABELS = {
  APPROVED_TEMPLATE: "Approved template",
  DRAFT_TEMPLATE: "Draft",
  WORK_IN_PROGRESS_TEMPLATE: "Work in progress",
  REFERENCE_DOCUMENT: "Reference document",
  STANDARD_CLAUSE_LIBRARY: "Standard clauses",
  EXECUTED_OPERATIONAL_DOCUMENT: "Signed agreement",
  EXECUTED_PRECEDENT_SAMPLE: "Signed example",
  NON_TEMPLATE_MISC: "Not a template",
  EDITOR_ARTEFACT: "Editor artefact",
  UNRESOLVED_AFTER_FULL_ANALYSIS: "Not yet classified",
};

let cache = null, cachedMtime = 0;

function load() {
  try {
    const m = fs.statSync(FILE).mtimeMs;
    if (cache && m === cachedMtime) return cache;
    const lib = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const rows = lib.templates || [];
    cache = {
      rows,
      byId: new Map(rows.map((r) => [r.fileId, r])),
      summary: lib.summary || null,
    };
    cachedMtime = m;
    return cache;
  } catch (e) {
    /* No artefact on this host is not an error: it means the classification has
       not been run here. Every caller degrades to "unclassified", which is
       honest, rather than to "template", which would be a guess. */
    return cache || { rows: [], byId: new Map(), summary: null };
  }
}

const states = () => {
  const m = new Map();
  for (const [id, r] of load().byId) m.set(id, r.classification);
  return m;
};

const classificationOf = (fileId) => {
  const r = load().byId.get(fileId);
  return r ? r.classification : null;
};

/* The one-line explanation recorded when the file was classified — the stamp
   serial, the seal, the blank signature block. A state without its evidence is
   an assertion, and this is what makes it checkable. */
const basisOf = (fileId) => {
  const r = load().byId.get(fileId);
  return r ? r.basis || "" : "";
};

const isExecuted = (fileId) => /^EXECUTED_/.test(classificationOf(fileId) || "");
const label = (k) => LABELS[k] || String(k || "").toLowerCase().replace(/_/g, " ");

module.exports = {
  load, states, classificationOf, basisOf, isExecuted, label,
  NOT_A_RECORDS_OWN_DOCUMENT, LABELS,
};
