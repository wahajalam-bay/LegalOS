/* WHAT THE PAGES SHOWED, folded back into classification.
 *
 * tools/commercial-vision.js renders every page of a document and reads it.
 * This is where those facts become decisions.
 *
 * THE FACT THAT MATTERS MOST IS THE SIGNATURE. A draft and an executed
 * agreement are near-identical in wording and completely different in law, and
 * no amount of text extraction distinguishes them — only looking at the
 * execution page does. So `executed` is treated as the strongest single signal
 * available about a Commercial document, above the folder, above the filename,
 * and above anything inferred from wording.
 *
 * Vision is evidence, not gospel (§11). Where the pages disagree with the
 * extracted text, BOTH are kept and the discrepancy is recorded rather than
 * silently resolved.
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const VISION = P.join(ROOT, "audit", "commercial-vision.json");

let STORE = null;

function load(force) {
  if (STORE && !force) return STORE;
  try { STORE = JSON.parse(fs.readFileSync(VISION, "utf8")); } catch (e) { STORE = {}; }
  return STORE;
}

const factsFor = (fileId) => {
  const s = load();
  const e = s[fileId];
  return e && e.facts ? e.facts : null;
};

const wasRead = (fileId) => {
  const s = load();
  const e = s[fileId];
  return !!(e && e.facts && !e.error);
};

/* Did we SEE it signed? Three states, and the third is not the second:
   true  — signatures, initials or a stamp were visible on a page
   false — the execution block was there and blank, or draft markers were shown
   null  — we have not looked, or the pages were illegible */
function executionState(fileId) {
  const f = factsFor(fileId);
  if (!f) return { state: null, evidence: null };
  if (f.unreadable) return { state: null, evidence: "pages were illegible" };
  if (f.executed === true) return { state: "EXECUTED", evidence: f.executionEvidence || "signatures visible" };
  if (f.executed === false) {
    return {
      state: "NOT_EXECUTED",
      evidence: (f.draftMarkers && f.draftMarkers.length)
        ? "draft markers seen: " + f.draftMarkers.join(", ")
        : "execution block present but unsigned",
    };
  }
  return { state: null, evidence: null };
}

/* A canonical-ish document type from the pages, mapped onto the vocabulary the
   rest of the Commercial pipeline already uses. */
const TYPE_MAP = {
  SALE_DEED: "SALE_DEED", PPA: "PPA", LEASE: "LEASE", SERVICE: "SERVICE",
  CONSTRUCTION: "CONSTRUCTION", LOAN: "LOAN", NDA: "NDA", MOU: "MOU", JV: "JV",
  POA: "POA", LAND_RECORD: "LAND_RECORD", APPROVAL: "APPROVAL",
  RESOLUTION: "RESOLUTION", LITIGATION: "LITIGATION", NOTICE: "NOTICE",
  TEMPLATE: "TEMPLATE", CERTIFICATE: "CERTIFICATE", INVOICE: "INVOICE",
  RECEIPT: "RECEIPT", PLAN: "PLAN", OTHER: null,
};

function documentType(fileId) {
  const f = factsFor(fileId);
  if (!f || f.unreadable) return null;
  return TYPE_MAP[String(f.documentType || "").toUpperCase()] || null;
}

/* Everything the pages said about identity, with its confidence. Empty strings
   are dropped — an empty field means the document did not say, which is a fact
   worth preserving and not the same as a blank guess. */
function identity(fileId) {
  const f = factsFor(fileId);
  if (!f || f.unreadable) return null;
  const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const out = {
    project: clean(f.project),
    entity: clean(f.entity),
    counterparty: clean(f.counterparty),
    parties: Array.isArray(f.parties) ? f.parties.filter((x) => typeof x === "string" && x.trim()) : [],
    agreementTitle: clean(f.agreementTitle),
    agreementNumber: clean(f.agreementNumber),
    amendmentNumber: typeof f.amendmentNumber === "number" ? f.amendmentNumber : null,
    parentAgreement: clean(f.parentAgreement),
    propertyOrUnit: clean(f.propertyOrUnit),
    // Three distinct dates, never merged (§23).
    agreementDate: clean(f.agreementDate),
    executionDate: clean(f.executionDate),
    effectiveDate: clean(f.effectiveDate),
    confidence: clean(f.confidence) || "MEDIUM",
    summary: clean(f.summary),
  };
  return out;
}

/* Where the pages and the extracted text disagree. Kept, not resolved: OCR and
   text layers both corrupt characters in their own ways, and a recorded
   disagreement is more use to a reader than a silent winner. */
function discrepancies(fileId, textFacts) {
  const v = identity(fileId);
  if (!v || !textFacts) return [];
  const out = [];
  const cmp = (field, a, b) => {
    if (!a || !b) return;
    const na = String(a).toLowerCase().replace(/[^a-z0-9]/g, "");
    const nb = String(b).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (na && nb && na !== nb && !na.includes(nb) && !nb.includes(na)) {
      out.push({ field, fromPages: a, fromText: b });
    }
  };
  cmp("agreementDate", v.agreementDate, textFacts.agreementDate);
  cmp("documentType", documentType(fileId), textFacts.documentType);
  return out;
}

function summary() {
  const s = load(true);
  const ids = Object.keys(s);
  const read = ids.filter((id) => s[id].facts && !s[id].error);
  const failed = ids.filter((id) => s[id].error);
  const executed = read.filter((id) => s[id].facts.executed === true);
  const notExecuted = read.filter((id) => s[id].facts.executed === false);
  const illegible = read.filter((id) => s[id].facts.unreadable === true);
  const pages = read.reduce((n, id) => n + (s[id].pagesRead || 0), 0);
  return {
    attempted: ids.length,
    readVisually: read.length,
    failed: failed.length,
    pagesRendered: pages,
    executed: executed.length,
    notExecuted: notExecuted.length,
    illegible: illegible.length,
    withProject: read.filter((id) => s[id].facts.project).length,
    withParties: read.filter((id) => (s[id].facts.parties || []).length).length,
    withParent: read.filter((id) => s[id].facts.parentAgreement).length,
  };
}

module.exports = { load, factsFor, wasRead, executionState, documentType, identity, discrepancies, summary };
