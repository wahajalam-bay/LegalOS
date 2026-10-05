// The LegalOS-native compliance workflow store.
//
// Everything in the registers comes FROM Drive and is read-only: a loan tracker
// row, a resolution, a licence. This module holds the other half -- the work
// Legal does IN LegalOS: amendments, novations, terminations, repayments,
// licence renewal applications, SECP filings, the documents generated for them,
// who reviewed and signed them, and an append-only audit of every step.
//
// Four rules shape the design:
//
//  1. HISTORY IS NEVER OVERWRITTEN. An amendment does not edit the loan; it
//     creates a child record. The parent's original terms stay exactly as the
//     source recorded them, and "current effective terms" is computed from the
//     chain. Repayments accumulate; the outstanding balance is derived, never
//     stored as a mutable number that loses what came before.
//
//  2. THE SERVER DECIDES. Every transition is guarded here. A client that posts
//     "status: EXECUTED" directly gets the same refusal as one that clicks a
//     button it should not see. The UI hides what you cannot do; this file is
//     what actually stops you.
//
//  3. SEGREGATION OF DUTIES. Preparing, reviewing and finalising are distinct
//     capabilities, and by default the person who drafted a document cannot be
//     the one who finalises it. That is configurable, because a two-person team
//     can deadlock on it -- but it is ON unless someone turns it off on purpose.
//
//  4. NO FAKE INTEGRATIONS. The Drive service account is read-only by design, so
//     LegalOS cannot upload an executed document to Drive and never pretends to.
//     It records the target folder and an explicit filing state that a human
//     moves to FILED. E-signature is unconfigured and says so.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ROOT } = require("./config");
const complianceModel = require("./compliance-model");

const DIR = path.join(ROOT, "config");
const FILE = path.join(DIR, "workflow.json");
const DOCS_DIR = path.join(DIR, "workflow-docs");

/* ------------------------------------------------------------ capabilities */

// Granular compliance capabilities (PART 41/42 of the brief). Access is NOT
// "you can see Compliance, therefore you can execute a loan amendment": each
// capability names the minimum module level that grants it.
const CAPS = {
  "compliance.view": "view",
  "compliance.export": "view",
  "compliance.portal.open": "view",

  "compliance.create": "edit",
  "compliance.edit": "edit",
  "compliance.document.generate": "edit",
  "compliance.review": "edit",
  "compliance.signature.upload": "edit",
  "compliance.licence.renew": "edit",
  "compliance.licence.create": "edit",
  "compliance.filing.create": "edit",
  "compliance.filing.status": "edit",
  "compliance.resolution.create": "edit",

  "compliance.finalize": "full",
  "compliance.signature.request": "full",
  "compliance.execute": "full",
  "compliance.repayment.record": "full",
  "compliance.drive.file": "full",
};

const LEVELS = ["none", "view", "edit", "full"];
const rank = (l) => Math.max(0, LEVELS.indexOf(String(l || "none")));

// `perm` is the caller's effective compliance level, as computed by
// api/permissions.js for the *rendered* identity. Default-DENY: an unknown
// capability is refused rather than allowed.
function can(perm, cap) {
  const need = CAPS[cap];
  if (!need) return false;
  return rank(perm) >= rank(need);
}

function requireCap(perm, cap) {
  if (!can(perm, cap)) {
    const e = new Error("forbidden");
    e.code = 403;
    e.detail = "This action needs the " + (CAPS[cap] || "full") + " level on Compliance. Your access is " + (perm || "none") + ".";
    e.capability = cap;
    throw e;
  }
}

/* ------------------------------------------------------------- persistence */

let state = null;

function blank() {
  return { version: 1, seq: {}, records: {}, audit: [] };
}

function load() {
  if (state) return state;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    state = raw && raw.records ? raw : blank();
  } catch (e) {
    state = blank();
  }
  if (!state.seq) state.seq = {};
  if (!state.records) state.records = {};
  if (!state.audit) state.audit = [];
  return state;
}

// ATOMIC. This file is the only record of work done inside LegalOS -- a
// truncated write would lose executed documents and their audit trail. Write to
// a temp file and rename, which is atomic on the same filesystem.
function save() {
  load();
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true, mode: 0o750 });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o640 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) {
    console.error("[workflow] save failed:", e.message);
    const err = new Error("save_failed");
    err.code = 500;
    err.detail = "The workflow store could not be written. Nothing was changed.";
    throw err;
  }
}

const nowIso = () => new Date().toISOString();

// Human-readable, stable, type-prefixed ids: AMEND-0007, RPMT-0003, RES-N0012.
const PREFIX = {
  loanAction: { amendment: "AMEND", novation: "NOVAT", termination: "TERMN", rollover: "AMEND", conversion: "CONVT", other: "LACTN" },
  repayment: { default: "RPMT" },
  leaseAction: { amendment: "LSAMD", renewal: "LSREN", termination: "LSTRM", novation: "LSNOV", other: "LSACT" },
  serviceAction: { amendment: "SVAMD", renewal: "SVREN", termination: "SVTRM", novation: "SVNOV", other: "SVACT" },
  resolution: { default: "RESN" },
  licenceApplication: { renewal: "LREN", new: "LNEW", default: "LAPP" },
  secpFiling: { annual: "SECPA", event: "SECPE", default: "SECP" },
};

function nextId(type, subtype) {
  load();
  const table = PREFIX[type] || {};
  const pfx = table[subtype] || table.default || "WF";
  const key = pfx;
  state.seq[key] = (state.seq[key] || 0) + 1;
  return pfx + "-" + String(state.seq[key]).padStart(4, "0");
}

/* -------------------------------------------------------------- audit trail */

// Append-only. Nothing in this module ever edits or removes an audit entry, and
// there is no route that does either -- an ordinary user cannot rewrite what
// happened (PART 40).
function audit(actor, action, record, before, after, extra) {
  load();
  state.audit.push({
    id: crypto.randomBytes(8).toString("hex"),
    at: nowIso(),
    actor: actorOf(actor),
    action,
    recordId: record ? record.id : null,
    recordType: record ? record.type : null,
    parentId: record && record.parent ? record.parent.id : null,
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
    ...(extra || {}),
  });
}

// Identity is recorded from the VERIFIED session, never from the request body,
// so an actor cannot be spoofed by a client that posts someone else's name.
function actorOf(who) {
  if (!who) return { id: null, name: "unknown", email: null };
  return {
    id: who.id || null,
    name: who.name || who.email || who.id || "unknown",
    email: (who.email || "").toLowerCase() || null,
  };
}

function auditFor(recordId) {
  load();
  return state.audit.filter((a) => a.recordId === recordId || a.parentId === recordId);
}

function auditForParent(parentId) {
  load();
  return state.audit.filter((a) => a.parentId === parentId);
}

// A copy of the whole trail, for the Overview's activity panel. A copy, because
// nothing outside this module may hold a reference it could mutate.
function auditAll() {
  load();
  return state.audit.map((a) => ({ ...a }));
}

/* ------------------------------------------------------------- lifecycle */

// Document lifecycle (PART 6). A stage is never skipped: the allowed next
// states are declared here and enforced on every transition.
const FLOW = {
  DRAFT: ["LEGAL_REVIEW", "CANCELLED"],
  LEGAL_REVIEW: ["FINALIZED", "DRAFT", "CANCELLED"],
  FINALIZED: ["SIGNATURE", "LEGAL_REVIEW", "CANCELLED"],
  SIGNATURE: ["EXECUTED", "FINALIZED", "CANCELLED"],
  EXECUTED: [],
  CANCELLED: [],
};

const STATUS_LABEL = {
  DRAFT: "Draft",
  LEGAL_REVIEW: "Legal review",
  FINALIZED: "Finalized",
  SIGNATURE: "Out for signature",
  EXECUTED: "Executed",
  CANCELLED: "Cancelled",
};

// The capability each transition needs. Preparing is not finalising, and
// finalising is not executing (PART 42).
const TRANSITION_CAP = {
  LEGAL_REVIEW: "compliance.review",
  FINALIZED: "compliance.finalize",
  SIGNATURE: "compliance.signature.request",
  EXECUTED: "compliance.execute",
  DRAFT: "compliance.review",
  CANCELLED: "compliance.edit",
};

function sodEnforced() {
  const r = complianceModel.rules();
  const v = r && r.workflow && r.workflow.segregationOfDuties;
  return v !== false; // ON unless explicitly disabled
}

/* ------------------------------------------------------------- record CRUD */

function get(id) {
  load();
  return state.records[id] || null;
}

function list(filter) {
  load();
  let rows = Object.values(state.records);
  if (filter) {
    if (filter.type) rows = rows.filter((r) => r.type === filter.type);
    if (filter.parentId) rows = rows.filter((r) => r.parent && r.parent.id === filter.parentId);
    if (filter.parentKind) rows = rows.filter((r) => r.parent && r.parent.kind === filter.parentKind);
    if (filter.entityKey) rows = rows.filter((r) => r.entityKey === filter.entityKey);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function childrenOf(parentId) {
  return list({ parentId });
}

/* ------------------------------------------------------------------ create */

const TYPES = new Set(["loanAction", "repayment", "leaseAction", "serviceAction", "resolution", "licenceApplication", "secpFiling"]);

// Field allowlists per record type. A client cannot introduce arbitrary keys:
// anything not named here is dropped, which keeps the store a known shape and
// stops a crafted request from smuggling values into the audit trail.
const FIELD_ALLOW = {
  loanAction: ["amendmentType", "effectiveDate", "revisedRepaymentDate", "revisedPrincipal", "revisedInterest", "revisedCurrency", "newLender", "newBorrower", "terminationDate", "reason", "notes"],
  repayment: ["repaymentType", "repaymentDate", "amount", "currency", "paymentReference", "notes"],
  leaseAction: ["actionType", "effectiveDate", "revisedRent", "revisedExpiry", "revisedTerm", "newLandlord", "newTenant", "terminationDate", "reason", "notes"],
  serviceAction: ["actionType", "effectiveDate", "revisedValue", "revisedExpiry", "revisedScope", "newProvider", "terminationDate", "reason", "notes"],
  /* The drafting lifecycle carries a few more facts than the old free-text
     record did: which approved template the draft came from, how it is being
     signed, and what the executed instrument turned out to be. */
  resolution: ["subject", "resolutionType", "requestingDepartment", "authorizedPerson", "authorizedPersonDesignation", "addressedTo", "urgency", "resolutionDate", "body", "notes",
    "templateKey", "templateTitle", "legalForm", "signatureMethod", "executionDate", "signatoryRole", "stampedCopy", "driveTarget", "archivedAt"],
  licenceApplication: ["applicationType", "licenceType", "authority", "purpose", "jurisdiction", "currentLicenceNumber", "currentExpiry", "applicationStart", "applicationReference", "requiredDate", "submissionDate", "decisionDate", "renewedLicenceNumber", "newIssueDate", "newExpiryDate", "portalStatus", "requiredDocuments", "missingItems", "notes"],
  secpFiling: ["filingCategory", "financialYear", "form", "event", "eventDate", "statutoryDueDate", "filingDate", "filingStatus", "overdueReason", "authorizedFiler", "ctcApplied", "acknowledgementRef", "linkedResolutionId", "financialStatementsDate", "agmDate", "notes"],
};

function pick(type, fields) {
  const allow = FIELD_ALLOW[type] || [];
  const out = {};
  for (const k of allow) {
    if (fields && Object.prototype.hasOwnProperty.call(fields, k) && fields[k] !== undefined) {
      const v = fields[k];
      out[k] = typeof v === "string" ? v.slice(0, 8000) : v;
    }
  }
  return out;
}

function create(who, perm, input) {
  load();
  const type = String(input && input.type || "");
  if (!TYPES.has(type)) {
    const e = new Error("bad_type"); e.code = 400;
    e.detail = "Unknown record type."; throw e;
  }

  // Each type needs its own capability, so "can create a filing" does not imply
  // "can record a repayment against a loan".
  const capByType = {
    loanAction: "compliance.create",
    repayment: "compliance.repayment.record",
    leaseAction: "compliance.create",
    serviceAction: "compliance.create",
    resolution: "compliance.resolution.create",
    licenceApplication: input && input.subtype === "new" ? "compliance.licence.create" : "compliance.licence.renew",
    secpFiling: "compliance.filing.create",
  };
  requireCap(perm, capByType[type]);

  const subtype = String(input.subtype || "other").slice(0, 40);
  const id = nextId(type, subtype);
  const at = nowIso();
  const rec = {
    id,
    type,
    subtype,
    parent: input.parent && input.parent.id
      ? { kind: String(input.parent.kind || "").slice(0, 30), id: String(input.parent.id).slice(0, 60), label: String(input.parent.label || "").slice(0, 200), ref: String(input.parent.ref || "").slice(0, 120) || null }
      : null,
    entity: String(input.entity || "").slice(0, 200) || null,
    entityKey: String(input.entityKey || "").slice(0, 200) || null,
    status: type === "repayment" || type === "secpFiling" ? "DRAFT" : "DRAFT",
    fields: pick(type, input.fields),
    template: null,
    documents: [],
    signature: { method: null, requestedAt: null, requestedBy: null, signatories: [] },
    review: { createdBy: actorOf(who), createdAt: at, reviewer: null, reviewStatus: null, reviewComments: null, finalizedBy: null, finalizedAt: null },
    drive: { status: "NOT_FILED", folderPath: input.driveFolderPath ? String(input.driveFolderPath).slice(0, 400) : null, fileId: null, at: null, by: null, note: null },
    createdAt: at,
    createdBy: actorOf(who),
    updatedAt: at,
    origin: "legalos", // created here, not imported from a spreadsheet
  };

  state.records[id] = rec;
  audit(who, "record.created", rec, null, { type, subtype, parent: rec.parent, fields: rec.fields });
  save();
  return rec;
}

function update(who, perm, id, patch) {
  requireCap(perm, "compliance.edit");
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  if (rec.status === "EXECUTED" || rec.status === "CANCELLED") {
    const e = new Error("locked"); e.code = 409;
    e.detail = "This record is " + STATUS_LABEL[rec.status].toLowerCase() + " and can no longer be edited. Create a new action instead.";
    throw e;
  }
  const before = { fields: { ...rec.fields } };
  rec.fields = { ...rec.fields, ...pick(rec.type, patch && patch.fields) };
  rec.updatedAt = nowIso();
  audit(who, "record.updated", rec, before, { fields: rec.fields });
  save();
  return rec;
}

/* -------------------------------------------------------------- transitions */

function transition(who, perm, id, next, opts) {
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  const to = String(next || "").toUpperCase();
  const allowed = FLOW[rec.status] || [];
  if (!allowed.includes(to)) {
    const e = new Error("bad_transition"); e.code = 409;
    e.detail = "A record that is " + (STATUS_LABEL[rec.status] || rec.status).toLowerCase() +
      " cannot move to " + (STATUS_LABEL[to] || to).toLowerCase() +
      ". Allowed from here: " + (allowed.map((s) => STATUS_LABEL[s] || s).join(", ") || "nothing");
    throw e;
  }
  requireCap(perm, TRANSITION_CAP[to] || "compliance.execute");

  // Segregation of duties: the person who drafted it should not be the person
  // who finalises it. Checked on the server, by verified identity.
  if (to === "FINALIZED" && sodEnforced()) {
    const drafter = (rec.review.createdBy && rec.review.createdBy.email) || null;
    const me = (actorOf(who).email || null);
    if (drafter && me && drafter === me) {
      const e = new Error("sod"); e.code = 409;
      e.detail = "You drafted this document, so someone else must finalize it. This separation is a compliance control; an administrator can disable it in config/compliance-rules.json if your team is too small for it.";
      throw e;
    }
  }

  // Executing requires that a signature stage actually happened and that every
  // required signatory is accounted for -- not merely that a button was clicked.
  if (to === "EXECUTED") {
    const sigs = rec.signature.signatories || [];
    const outstanding = sigs.filter((s) => s.status !== "Signed" && s.status !== "Not required");
    if (sigs.length && outstanding.length) {
      const e = new Error("signatures_outstanding"); e.code = 409;
      e.detail = outstanding.length + " signator" + (outstanding.length === 1 ? "y has" : "ies have") +
        " not signed yet (" + outstanding.map((s) => s.name).join(", ") + "). Mark each as signed, declined or not required first.";
      throw e;
    }
    const hasExecutedDoc = (rec.documents || []).some((d) => d.kind === "executed");
    if (!hasExecutedDoc) {
      const e = new Error("no_executed_document"); e.code = 409;
      e.detail = "Upload the signed copy before marking this executed. The executed document is what makes the record evidence.";
      throw e;
    }
  }

  const before = { status: rec.status };
  rec.status = to;
  rec.updatedAt = nowIso();

  if (to === "LEGAL_REVIEW") {
    rec.review.reviewer = opts && opts.reviewer ? String(opts.reviewer).slice(0, 200) : null;
    rec.review.reviewStatus = "In review";
  }
  if (to === "FINALIZED") {
    rec.review.finalizedBy = actorOf(who);
    rec.review.finalizedAt = nowIso();
    rec.review.reviewStatus = "Complete";
    if (opts && opts.reviewComments) rec.review.reviewComments = String(opts.reviewComments).slice(0, 4000);
  }
  if (to === "EXECUTED") {
    rec.executedAt = nowIso();
    rec.executedBy = actorOf(who);
    // Filing is now owed. The status starts as pending so it shows up as
    // outstanding work rather than quietly looking complete.
    if (rec.drive.status === "NOT_FILED") rec.drive.status = "PENDING_UPLOAD";
  }

  audit(who, "status." + to.toLowerCase(), rec, before, { status: to, ...(opts && opts.reviewComments ? { reviewComments: opts.reviewComments } : {}) });
  save();
  return rec;
}

/* -------------------------------------------------------------- signatures */

const SIG_STATUS = ["Not sent", "Pending", "Signed", "Declined", "Not required"];
const SIG_METHODS = ["wet", "esign"];

// Whether an e-signature connector exists. There is none, so the UI shows the
// honest state instead of a Send button that would do nothing (PART 6.2 / 51).
function esignConfigured() {
  const r = complianceModel.rules();
  return !!(r && r.integrations && r.integrations.esign && r.integrations.esign.configured);
}

function setSignatories(who, perm, id, signatories) {
  requireCap(perm, "compliance.edit");
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  if (rec.status === "EXECUTED") { const e = new Error("locked"); e.code = 409; e.detail = "This record is executed; its signatories can no longer change."; throw e; }

  const before = { signatories: rec.signature.signatories };
  const list = Array.isArray(signatories) ? signatories.slice(0, 20) : [];
  rec.signature.signatories = list.map((s) => ({
    name: String(s.name || "").slice(0, 200),
    capacity: String(s.capacity || "").slice(0, 200) || null,
    entity: String(s.entity || "").slice(0, 200) || null,
    method: SIG_METHODS.includes(s.method) ? s.method : "wet",
    status: SIG_STATUS.includes(s.status) ? s.status : "Not sent",
    signedDate: s.signedDate ? String(s.signedDate).slice(0, 40) : null,
  })).filter((s) => s.name);

  rec.updatedAt = nowIso();
  audit(who, "signatories.set", rec, before, { signatories: rec.signature.signatories });
  save();
  return rec;
}

function requestSignature(who, perm, id, method) {
  requireCap(perm, "compliance.signature.request");
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  const m = SIG_METHODS.includes(method) ? method : "wet";

  if (m === "esign" && !esignConfigured()) {
    const e = new Error("esign_not_configured"); e.code = 501;
    e.detail = "E-signature integration is not configured, so nothing was sent. Use wet/ink signature, or ask an administrator to configure a provider.";
    throw e;
  }
  if (!(rec.signature.signatories || []).length) {
    const e = new Error("no_signatories"); e.code = 409;
    e.detail = "Add at least one signatory before sending for signature.";
    throw e;
  }

  const before = { status: rec.status, method: rec.signature.method };
  // Moving to SIGNATURE goes through the same guard as any other transition.
  if (rec.status === "FINALIZED") transition(who, perm, id, "SIGNATURE");

  rec.signature.method = m;
  rec.signature.requestedAt = nowIso();
  rec.signature.requestedBy = actorOf(who);
  for (const s of rec.signature.signatories) if (s.status === "Not sent") s.status = "Pending";
  rec.updatedAt = nowIso();
  audit(who, "signature.requested", rec, before, { method: m, signatories: rec.signature.signatories.length });
  save();
  return rec;
}

function markSigned(who, perm, id, index, status, signedDate) {
  requireCap(perm, "compliance.signature.upload");
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  const i = Number(index);
  const s = (rec.signature.signatories || [])[i];
  if (!s) { const e = new Error("no_signatory"); e.code = 404; throw e; }
  if (!SIG_STATUS.includes(status)) { const e = new Error("bad_status"); e.code = 400; throw e; }

  const before = { signatory: { ...s } };
  s.status = status;
  s.signedDate = status === "Signed" ? (signedDate ? String(signedDate).slice(0, 40) : nowIso().slice(0, 10)) : null;
  rec.updatedAt = nowIso();
  audit(who, "signature.updated", rec, before, { signatory: s });
  save();
  return rec;
}

// How far through signature a record is -- Pending / Partially signed / Fully
// executed (PART 13). Derived, so it can never disagree with the signatories.
function signatureState(rec) {
  const sigs = (rec.signature && rec.signature.signatories) || [];
  if (!sigs.length) return { key: "none", label: "No signatories" };
  const required = sigs.filter((s) => s.status !== "Not required");
  const signed = required.filter((s) => s.status === "Signed");
  const declined = sigs.filter((s) => s.status === "Declined");
  if (declined.length) return { key: "declined", label: "Declined", signed: signed.length, of: required.length };
  if (!required.length) return { key: "none", label: "No signature required" };
  if (signed.length === 0) return { key: "pending", label: "Pending", signed: 0, of: required.length };
  if (signed.length < required.length) return { key: "partial", label: "Partially signed", signed: signed.length, of: required.length };
  return { key: "complete", label: "Fully signed", signed: signed.length, of: required.length };
}

/* --------------------------------------------------------------- documents */

const MAX_DOC_BYTES = 25 * 1024 * 1024;
const DOC_KINDS = new Set(["generated", "executed", "supporting", "correspondence", "acknowledgement"]);
// Only document formats a legal team actually files. An allowlist, not a
// denylist: an unknown type is refused rather than stored and served later.
const DOC_MIME = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function docsDir() {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true, mode: 0o750 });
  return DOCS_DIR;
}

function attachDocument(who, perm, id, doc) {
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  const kind = DOC_KINDS.has(doc && doc.kind) ? doc.kind : "supporting";
  requireCap(perm, kind === "executed" ? "compliance.signature.upload" : "compliance.edit");

  const buf = doc.contentBase64 ? Buffer.from(String(doc.contentBase64), "base64") : null;
  if (!buf || !buf.length) { const e = new Error("empty"); e.code = 400; e.detail = "The uploaded file was empty."; throw e; }
  if (buf.length > MAX_DOC_BYTES) {
    const e = new Error("too_large"); e.code = 413;
    e.detail = "That file is " + Math.round(buf.length / 1048576) + " MB. The limit is 25 MB.";
    throw e;
  }
  const ext = DOC_MIME[String(doc.mimeType || "")];
  if (!ext) {
    const e = new Error("bad_type"); e.code = 415;
    e.detail = "Only PDF, Word and image files can be filed against a compliance record.";
    throw e;
  }

  const docId = crypto.randomBytes(10).toString("hex");
  const file = path.join(docsDir(), docId + "." + ext);
  fs.writeFileSync(file, buf, { mode: 0o640 });

  const entry = {
    id: docId,
    kind,
    name: String(doc.name || "document." + ext).slice(0, 300),
    mimeType: doc.mimeType,
    size: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    storage: "legalos",
    uploadedAt: nowIso(),
    uploadedBy: actorOf(who),
    templateFileId: doc.templateFileId ? String(doc.templateFileId).slice(0, 80) : null,
  };
  rec.documents.push(entry);
  rec.updatedAt = nowIso();
  audit(who, "document.attached", rec, null, { document: { id: entry.id, kind: entry.kind, name: entry.name, size: entry.size, sha256: entry.sha256 } });
  save();
  return { rec, doc: entry };
}

function readDocument(id, docId) {
  const rec = get(id);
  if (!rec) return null;
  const entry = (rec.documents || []).find((d) => d.id === docId);
  if (!entry) return null;
  const ext = DOC_MIME[entry.mimeType] || "bin";
  const file = path.join(DOCS_DIR, docId + "." + ext);
  if (!fs.existsSync(file)) return null;
  return { entry, buffer: fs.readFileSync(file) };
}

/* ------------------------------------------------------------ Drive filing */

const DRIVE_STATES = ["NOT_FILED", "PENDING_UPLOAD", "FILED", "UPLOAD_FAILED"];

// LegalOS holds a READ-ONLY Drive credential on purpose, so it cannot upload and
// does not pretend to. Legal files the document in Drive and records that here,
// with who asserted it and when -- an auditable human step rather than a fake
// automated one.
function setDriveFiling(who, perm, id, status, opts) {
  requireCap(perm, "compliance.drive.file");
  const rec = get(id);
  if (!rec) { const e = new Error("not_found"); e.code = 404; throw e; }
  const st = String(status || "").toUpperCase();
  if (!DRIVE_STATES.includes(st)) { const e = new Error("bad_status"); e.code = 400; throw e; }
  if (st === "FILED" && !(opts && (opts.fileId || opts.folderPath))) {
    const e = new Error("no_location"); e.code = 400;
    e.detail = "Record where in Drive it was filed (a folder path or a file id) so the link can be verified later.";
    throw e;
  }
  const before = { drive: { ...rec.drive } };
  rec.drive = {
    status: st,
    folderPath: opts && opts.folderPath ? String(opts.folderPath).slice(0, 400) : rec.drive.folderPath,
    fileId: opts && opts.fileId ? String(opts.fileId).slice(0, 80) : rec.drive.fileId,
    at: nowIso(),
    by: actorOf(who),
    note: opts && opts.note ? String(opts.note).slice(0, 1000) : null,
  };
  rec.updatedAt = nowIso();
  audit(who, "drive.filing", rec, before, { drive: rec.drive });
  save();
  return rec;
}

/* -------------------------------------------------------------- repayments */

// Outstanding principal is DERIVED from the repayment chain, never stored as a
// mutable number. That makes it impossible for the balance to drift away from
// the history that produced it (PART 3.6 / 3.7).
function repaymentsFor(loanId) {
  return list({ type: "repayment", parentId: loanId })
    .filter((r) => r.status !== "CANCELLED")
    .sort((a, b) => String(a.fields.repaymentDate || a.createdAt).localeCompare(String(b.fields.repaymentDate || b.createdAt)));
}

function outstandingFor(loan) {
  const principal = typeof loan.principal === "number" ? loan.principal : null;
  const reps = repaymentsFor(loan.id);
  const paid = reps.reduce((s, r) => s + (Number(r.fields.amount) || 0), 0);
  return {
    principal,
    repaid: paid,
    outstanding: principal == null ? null : Math.max(0, principal - paid),
    repayments: reps.length,
    fullyRepaid: principal != null && paid >= principal,
  };
}

// Validate a repayment against the ACTUAL outstanding balance before recording
// it, so the register cannot reach a state the money never reached.
function recordRepayment(who, perm, loan, input) {
  requireCap(perm, "compliance.repayment.record");
  const amount = Number(input && input.amount);
  const type = input && input.repaymentType === "full" ? "full" : "partial";
  if (!isFinite(amount) || amount <= 0) {
    const e = new Error("bad_amount"); e.code = 400;
    e.detail = "Enter a repayment amount greater than zero.";
    throw e;
  }
  const bal = outstandingFor(loan);
  if (bal.outstanding != null && amount > bal.outstanding + 0.005) {
    const e = new Error("exceeds_outstanding"); e.code = 409;
    e.detail = "That repayment (" + amount.toLocaleString() + ") is more than the outstanding balance (" +
      bal.outstanding.toLocaleString() + "). Record the actual amount, or raise an amendment first if the principal changed.";
    throw e;
  }
  if (type === "full" && bal.outstanding != null && Math.abs(amount - bal.outstanding) > 0.005) {
    const e = new Error("not_full"); e.code = 409;
    e.detail = "A full repayment must clear the outstanding balance of " + bal.outstanding.toLocaleString() +
      ". Record this as a partial repayment instead.";
    throw e;
  }

  const rec = create(who, perm, {
    type: "repayment",
    subtype: type,
    parent: { kind: "loan", id: loan.id, label: loan.borrower || loan.id, ref: loan.ref },
    entity: loan.borrower,
    entityKey: loan.entityKey,
    fields: {
      repaymentType: type,
      repaymentDate: input.repaymentDate || nowIso().slice(0, 10),
      amount,
      currency: input.currency || loan.currency || null,
      paymentReference: input.paymentReference || null,
      notes: input.notes || null,
    },
  });
  const after = outstandingFor(loan);
  audit(who, "repayment.recorded", rec, { outstanding: bal.outstanding }, { outstanding: after.outstanding, amount, type });
  save();
  return { rec, balance: after };
}

module.exports = {
  CAPS, can, requireCap,
  load, save, get, list, childrenOf, create, update, transition,
  FLOW, STATUS_LABEL,
  setSignatories, requestSignature, markSigned, signatureState, esignConfigured, SIG_STATUS,
  attachDocument, readDocument, DOC_MIME,
  setDriveFiling, DRIVE_STATES,
  repaymentsFor, outstandingFor, recordRepayment,
  audit, auditFor, auditForParent, auditAll, actorOf,
};
