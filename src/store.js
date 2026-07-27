// Lightweight reactive store — shared, persisted collections so "create" works
// across the app without a backend. Seeds from data.js, persists to localStorage.
import { useState, useEffect } from "./core.js";
import {
  REQUESTS, MATTERS, CONTRACTS, LICENSES, COMPANIES, TEMPLATES, REPOSITORY,
  REQUESTERS, MESSAGES, FORM_CONFIG, USERS,
  lifecyclePathFor, inferCategory, inferSubdivision, entityById, byId,
} from "./data.js";
import { fixTat, addWorkingDays } from "./tat.js";

const addWorkingDaysIso = (from, n) => addWorkingDays(from, n).toISOString();

const LS_KEY = "legalos-store-v1";
const PORTAL_SESSION_KEY = "legalos-portal-session";

// Fresh seed snapshot. New slices are added here; the merge below is
// backward-compatible so an existing (older-shape) localStorage never crashes.
function seed() {
  return {
    requests: [...REQUESTS],
    matters: [...MATTERS],
    contracts: [...CONTRACTS],
    licenses: [...LICENSES],
    companies: [...COMPANIES],
    templates: [...TEMPLATES],
    // Sprint 3 slices
    repository: [...REPOSITORY],
    savedViews: [],
    reminders: [],
    // Sprint 4 slices — the requester portal
    requesters: [...REQUESTERS],
    messages: [...MESSAGES],
    // Object-shaped slice: the admin-editable form configuration.
    formConfig: JSON.parse(JSON.stringify(FORM_CONFIG)),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// Defensive merge:
//  • missing slice  → seed it (this is how old stores gain new modules)
//  • present slice  → keep the user's records; for records that also exist in
//    the seed (by id), backfill any NEW fields the record predates (spend,
//    companyTags, category, rounds, srNo, driveLink, stage, tat…). User-created
//    records are left untouched.
//  • unknown slices the user had are preserved (forward-compat).
function mergeState(loaded) {
  const base = seed();
  if (!loaded || typeof loaded !== "object") return base;
  const out = {};
  for (const key of Object.keys(base)) {
    const slice = loaded[key];
    // Object-shaped slices (formConfig): keep the admin's edits and only
    // backfill top-level keys the saved copy predates. Replacing it wholesale
    // would silently discard every Settings change on the next release.
    if (!Array.isArray(base[key]) && base[key] && typeof base[key] === "object") {
      out[key] = slice && typeof slice === "object" && !Array.isArray(slice)
        ? { ...base[key], ...slice }
        : base[key];
      continue;
    }
    if (!Array.isArray(slice)) { out[key] = base[key]; continue; }
    const seedById = new Map(base[key].map((r) => [r && r.id, r]));
    const kept = slice.map((rec) => {
      if (!rec || typeof rec !== "object") return rec;
      const s = seedById.get(rec.id);
      if (!s) return rec; // user-created record → as-is
      const merged = { ...rec };
      for (const f of Object.keys(s)) if (merged[f] === undefined) merged[f] = s[f];
      return merged;
    });
    // Records added to the seed AFTER the user's snapshot was written must still
    // appear (this sprint adds ~29 contracts, 8 requests, 17 entities, 12 docs).
    const haveIds = new Set(kept.map((r) => r && r.id));
    const added = base[key].filter((r) => r && !haveIds.has(r.id));
    out[key] = added.length ? [...added, ...kept] : kept;
  }
  for (const key of Object.keys(loaded)) if (!(key in out)) out[key] = loaded[key];
  return out;
}

let state = mergeState(load());

const listeners = new Set();
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function emit() { listeners.forEach((l) => l()); persist(); }

// ---------------- cross-tab live sync ----------------
// The requester portal and LegalOS are separate apps in separate tabs. The
// browser fires `storage` in OTHER tabs whenever localStorage changes, so this
// is what makes the bridge genuinely real-time: legal asks for a document and
// the requester's open tab updates, and vice versa — no reload, no polling.
// Re-hydrate and notify, but never re-persist here or the two tabs ping-pong.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      state = mergeState(JSON.parse(e.newValue));
      listeners.forEach((l) => l());
    } catch (err) {}
  });
}

export function addItem(name, item) { state = { ...state, [name]: [item, ...(state[name] || [])] }; emit(); }
export function updateItem(name, id, patch) {
  state = { ...state, [name]: (state[name] || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  emit();
}
export function removeItem(name, id) {
  state = { ...state, [name]: (state[name] || []).filter((x) => x.id !== id) };
  emit();
}
export function getCollection(name) { return state[name] || []; }
export function resetStore() { state = seed(); emit(); }

export function useCollection(name) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state[name] || [];
}

// Zero-pads to the width the collection already uses, so a new id sorts and
// reads alongside the existing ones (DOC-001 → DOC-013, not DOC-13).
export function nextId(name, prefix) {
  const ids = (state[name] || []).map((x) => String(x && x.id)).filter((s) => s.startsWith(prefix));
  const nums = ids.map((s) => parseInt(s.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  const width = ids.reduce((w, s) => Math.max(w, s.slice(prefix.length).length), 0);
  return prefix + String(max + 1).padStart(width, "0");
}

// Sr No is sequenced against the PHYSICAL record and must never collide across
// the tracker (contracts) and the repository (documents).
export function nextSrNo() {
  const all = [...(state.contracts || []), ...(state.repository || [])]
    .map((x) => Number(x && x.srNo))
    .filter((n) => !isNaN(n));
  return (all.length ? Math.max(...all) : 4000) + 1;
}

export const nowIso = () => new Date().toISOString();
export const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

/* ============================================================
   Workstream J — the ONE submission handoff.

   Both the internal Legal Workspace intake and the external requester-facing
   form call exactly this function. It is the only writer of new requests:

     validate → assign id → create the unified Request/Matter record →
     counterparty/duplicate check → auto-fix the TAT → drop into Triage

   The external form app posts the same `LegalRequest` payload documented in
   data.js#LEGAL_REQUEST_SCHEMA. See the seam marker below.
   ============================================================ */

// Deterministic duplicate/counterparty check — no fuzzy matching.
// Flags open requests on the same entity + counterparty, or the same linked contract.
export function duplicateCheck(payload) {
  const open = (state.requests || []).filter((r) => !/Approved|Rejected|Completed/.test(r.status || ""));
  const cp = String(payload.counterparty || "").trim().toLowerCase();
  const hits = open.filter((r) => {
    if (payload.linkedContractId && r.linkedContractId === payload.linkedContractId) return true;
    if (!cp) return false;
    const sameCp = String(r.counterparty || "").trim().toLowerCase() === cp;
    return sameCp && r.entityId === payload.entityId;
  });
  return hits.map((r) => ({ id: r.id, title: r.title, status: r.status, owner: r.owner, reason: payload.linkedContractId && r.linkedContractId === payload.linkedContractId ? "same contract" : "same counterparty + entity" }));
}

// Triage routing: the sub-division's most available owner (deterministic).
const SUBDIV_OWNER = {
  "Real Estate & Conveyancing": "u10",
  "Commercial": "u5",
  "Litigation & Disputes": "u6",
  "Compliance & Regulatory": "u12",
  "IP": "u8",
  "Labour/Employment": "u8",
  "Corporate & Governance": "u4",
  "Data Privacy": "u12",
};

export function submitLegalRequest(payload = {}) {
  /* ---- validate ---- */
  const errors = [];
  if (!String(payload.title || "").trim()) errors.push("title is required");
  if (!payload.requestType) errors.push("requestType is required");
  if (!payload.entityId) errors.push("entityId (company/entity) is required");
  if (!payload.requesterId) errors.push("requesterId is required");
  if (payload.entityId && !entityById(payload.entityId)) errors.push("entityId is not in the company registry");
  if (errors.length) return { ok: false, errors };

  const cfg = getFormConfig();
  const nature = payload.natureOfMatter || "Contracts";
  const natureCfg = (cfg.natures || []).find((n) => n.key === nature) || null;
  const routing = (cfg.routing || {})[nature] || {};
  // A nature that is enabled but has no full flow yet is still captured — it is
  // simply flagged for manual routing rather than being dropped.
  const routedManually = !!(natureCfg && natureCfg.enabled && !natureCfg.fullFlow);

  /* ---- identity ---- */
  const id = nextId("requests", "REQ-");
  const requestDate = payload.requestDate || nowIso();
  const category = payload.category || inferCategory({ type: payload.contractType, title: payload.title });
  const draft = {
    id,
    title: String(payload.title).trim(),
    // Legacy fields the existing board/list columns still read.
    type: payload.contractType || payload.requestType,
    bu: payload.unit || "Real Estate",
    dept: payload.department || "—",
    country: (entityById(payload.entityId) || {}).jurisdiction || "—",
    priority: payload.priority || ({ critical: "Urgent", high: "High", medium: "Medium", low: "Low" }[payload.riskPreliminary] || "Medium"),
    due: payload.dueDate || daysFromNow(7),
    created: requestDate,
    // Canonical LegalRequest shape (data.js#LEGAL_REQUEST_SCHEMA).
    requestType: payload.requestType,
    contractType: payload.contractType || null,
    category,
    subdivision: payload.subdivision || inferSubdivision({ contractType: payload.contractType, title: payload.title, category }),
    entityId: payload.entityId,
    companyTags: payload.companyTags && payload.companyTags.length ? [...payload.companyTags] : [payload.entityId],
    department: payload.department || "—",
    unit: payload.unit || "Real Estate",
    requestDate,
    dueDate: payload.dueDate || daysFromNow(7),
    requesterId: payload.requesterId,
    requester: payload.requesterId,
    description: payload.description || "",
    attachments: (payload.attachments || []).map((a, i) => ({ id: `${id}-A${i + 1}`, name: a.name, sizeKb: a.sizeKb || null, kind: a.kind || "Attachment" })),
    linkedContractId: payload.linkedContractId || null,
    riskPreliminary: payload.riskPreliminary || "medium",
    risk: payload.riskPreliminary || "medium",
    counterparty: payload.counterparty || "—",
    value: payload.value == null ? null : Number(payload.value),
    currency: payload.currency || ({ KSA: "SAR", PK: "PKR", UAE: "AED" }[(entityById(payload.entityId) || {}).jur] || "USD"),
    matterId: null,
    stageLog: [],
    /* ---- Sprint 4: the portal-facing fields ---- */
    // `channel` = how it arrived. `source` = where from (site/office), captured
    // at portal login. Both are stamped on every request and every message.
    channel: payload.channel === "portal" || payload.source === "portal" ? "portal" : "internal",
    source: payload.source && payload.source !== "portal" ? payload.source : (payload.channel === "portal" ? "Requester portal" : "internal"),
    natureOfMatter: nature,
    company: payload.company || null,
    requesterEmail: payload.requesterEmail || (byId(payload.requesterId) || {}).email || null,
    routedManually,
    // The missing-document checklist, pre-loaded from the admin template for
    // this contract type so legal starts from a real ask list.
    requiredDocs: (payload.requiredDocs && payload.requiredDocs.length
      ? payload.requiredDocs
      : ((cfg.requiredDocTemplates || {})[payload.contractType] || [])
    ).map((doc, i) => (typeof doc === "string"
      ? { id: `${id}-RD${i + 1}`, name: doc, status: "requested", requestedBy: null, requestedAt: requestDate, docId: null }
      : { id: `${id}-RD${i + 1}`, docId: null, status: "requested", ...doc })),
    messagesCount: 0,
  };

  /* ---- duplicate / counterparty check ---- */
  const duplicates = duplicateCheck(draft);

  /* ---- route + auto-fix the TAT (never manually negotiated) ---- */
  // Routing precedence: explicit owner → the admin's per-nature routing →
  // the sub-division desk.
  const owner = payload.owner || routing.owner || SUBDIV_OWNER[draft.subdivision] || "u5";
  const tat = routing.tatDays
    ? { days: routing.tatDays, fixedAt: requestDate, dueAt: addWorkingDaysIso(requestDate, routing.tatDays), basis: `${nature} routing default` }
    : fixTat({ contractType: draft.contractType, type: draft.type, risk: draft.risk, requestType: draft.requestType }, requestDate);

  /* ---- drop into Triage on the department side ---- */
  const path = lifecyclePathFor(draft.requestType);
  const record = {
    ...draft,
    owner,
    tat,
    status: "Triage",
    stage: path[1] || "Triage",
    stageLog: [{ stage: path[0], enteredAt: requestDate, exitedAt: nowIso(), owner: draft.requesterId, ballWith: "business" },
               { stage: path[1] || "Triage", enteredAt: nowIso(), exitedAt: null, owner, ballWith: "legal" }],
    aiSummary: payload.description
      ? payload.description.slice(0, 220)
      : `Captured via ${draft.channel === "portal" ? "the requester portal" : "internal intake"}. TAT auto-fixed at ${tat.days} working days (${tat.basis}); routed to ${draft.subdivision}.`,
  };

  addItem("requests", record);

  // Attachments carried in from the portal also become repository documents, so
  // they appear in the internal WorkflowSpine's Input zone (not just on the form).
  (record.attachments || []).forEach((a, i) => {
    addItem("repository", {
      id: nextId("repository", "DOC-"),
      name: a.name,
      kind: a.kind === "Attachment" ? "Correspondence" : a.kind,
      source: "Requester upload",
      contractId: record.linkedContractId || null,
      requestId: record.id,
      entityId: record.entityId,
      contractType: record.contractType,
      jur: (entityById(record.entityId) || {}).jur || "—",
      uploadedBy: record.requesterId,
      uploadedByEmail: record.requesterEmail,
      uploadedAt: nowIso(),
      pages: null, sizeKb: a.sizeKb || null,
      stage: "Intake",
      ocrStatus: "Pending", ocrConfidence: null, ocrText: "",
      extractedFields: {},
      srNo: null, physicalRecordRef: null, officeLocation: null,
      storagePath: `/legal/portal/${record.id}/${a.name}`,
      // `// Drive / server storage seam` — swap for the real Drive file id + link.
      driveLink: `https://drive.google.com/file/d/legalos-${record.id.toLowerCase()}-${i + 1}/view`,
      access: [{ userId: record.owner || owner, level: "edit" }, { userId: record.requesterId, level: "comment" }],
    });
  });

  // `// external request-form endpoint seam`
  // The standalone requester form will POST this payload to a real endpoint and
  // the server will call this same function. Nothing else needs to change:
  // swap the line below for `await fetch(ENDPOINT, {method:"POST", body:...})`
  // and keep returning the same { ok, id, tat, duplicates } contract.

  return { ok: true, id, record, tat, duplicates, owner };
}

// Status a requester is allowed to see (Workstream J: requester-scoped view).
export function requesterView(requesterId) {
  return (state.requests || [])
    .filter((r) => (r.requesterId || r.requester) === requesterId)
    .sort((a, b) => new Date(b.requestDate || b.created) - new Date(a.requestDate || a.created));
}

/* ---------------- Workstream B: saved views (per module) ---------------- */
export function saveView(module, name, filters) {
  const id = "SV-" + module + "-" + Date.now().toString(36);
  addItem("savedViews", { id, module, name, filters, createdAt: nowIso() });
  return id;
}
export const viewsFor = (module) => (state.savedViews || []).filter((v) => v.module === module);

/* ============================================================
   SPRINT 4 — the Requester Portal API.

   // portal ↔ LegalOS API seam
   For the prototype both apps share this store (and therefore localStorage),
   which is what makes the round-trip live in a demo. To split the portal into
   its own deployable, replace the bodies below with HTTP calls to a backend
   that owns the same slices — every call site already goes through this module,
   so nothing in either UI has to change:
       submitLegalRequest      POST   /api/requests
       requesterView           GET    /api/requests?requester=:id
       addRequestAttachment    POST   /api/requests/:id/attachments
       requestRequiredDoc      POST   /api/requests/:id/required-docs
       fulfilRequiredDoc       PATCH  /api/requests/:id/required-docs/:docId
       postMessage (messages.js) POST /api/requests/:id/messages
       getFormConfig           GET    /api/form-config
   ============================================================ */

/* ---------------- the admin-editable form configuration ---------------- */
export function getFormConfig() { return state.formConfig || {}; }
export function updateFormConfig(patch) {
  state = { ...state, formConfig: { ...(state.formConfig || {}), ...patch } };
  emit();
}
export function resetFormConfig() {
  state = { ...state, formConfig: JSON.parse(JSON.stringify(FORM_CONFIG)) };
  emit();
}
export function useFormConfig() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state.formConfig || {};
}
// The contract types Step 3 offers for a company — the single read path the
// portal uses, so an admin edit changes the live form immediately.
export function contractTypesFor(companyKey) {
  const cfg = getFormConfig();
  return ((cfg.companyContractTypes || {})[companyKey] || []).slice();
}

/* ---------------- requester identity (// SSO / auth seam) ---------------- */
// No password logic in the prototype: a real deployment swaps this for SSO and
// takes the verified email from the token. The captured email + source stamp
// every request and every chat message either way.
export function findOrCreateRequester({ email, name, company, source, department, unit }) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return { ok: false, errors: ["email is required"] };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, errors: ["that does not look like an email address"] };
  if (!String(name || "").trim()) return { ok: false, errors: ["name is required"] };

  const existing = (state.requesters || []).find((r) => r.email.toLowerCase() === clean);
  if (existing) {
    // Keep the profile current — people move between sites and departments.
    const patch = {};
    if (company && company !== existing.company) patch.company = company;
    if (source && source !== existing.source) patch.source = source;
    if (department && department !== existing.department) patch.department = department;
    if (unit && unit !== existing.unit) patch.unit = unit;
    if (Object.keys(patch).length) updateItem("requesters", existing.id, patch);
    return { ok: true, requester: { ...existing, ...patch }, created: false };
  }

  // Link to an internal USERS record when the email matches, so the request
  // shows a real person on the legal side; otherwise the RQ- id stands in.
  const staff = USERS.find((u) => String(u.email || "").toLowerCase() === clean) || null;
  const id = nextId("requesters", "RQ-");
  const requester = {
    id, email: clean, name: String(name).trim(),
    company: company || null, source: source || null,
    department: department || (staff ? staff.team : "—"),
    unit: unit || "—",
    userId: staff ? staff.id : null,
    createdAt: nowIso(),
  };
  addItem("requesters", requester);
  return { ok: true, requester, created: true };
}
export const requesterByEmail = (email) =>
  (state.requesters || []).find((r) => r.email.toLowerCase() === String(email || "").trim().toLowerCase()) || null;
export const requesterById = (id) => (state.requesters || []).find((r) => r.id === id) || null;

// The identity a request is stamped with. A seeded requester maps onto an
// internal USERS id so existing records keep working; a brand-new portal signup
// is stamped with its own RQ- id.
export const requesterStampId = (requester) => (requester && (requester.userId || requester.id)) || null;

// Names any actor in the system — an internal user (u*) OR a portal requester
// (RQ-*). Everything that displays a requester must go through this, otherwise a
// portal sign-up renders as "Unassigned" on the legal side.
export function personName(id) {
  if (!id) return "Unassigned";
  if (String(id).startsWith("RQ-")) {
    const r = requesterById(id);
    return r ? r.name : id;
  }
  return (byId(id) || {}).name || String(id);
}
export function personRole(id) {
  if (!id) return "";
  if (String(id).startsWith("RQ-")) {
    const r = requesterById(id);
    return r ? `${r.department || "Business"}${r.source ? " · " + r.source : ""}` : "Requester";
  }
  return (byId(id) || {}).role || "";
}
export function personEmail(id) {
  if (!id) return null;
  if (String(id).startsWith("RQ-")) {
    const r = requesterById(id);
    return r ? r.email : null;
  }
  return (byId(id) || {}).email || null;
}

/* ---------------- portal session ---------------- */
export function getPortalSession() {
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.requesterId ? s : null;
  } catch (e) { return null; }
}
export function setPortalSession(requesterId, source) {
  try { localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify({ requesterId, source, at: nowIso() })); } catch (e) {}
}
export function clearPortalSession() {
  try { localStorage.removeItem(PORTAL_SESSION_KEY); } catch (e) {}
}

/* ---------------- documents: requester uploads ---------------- */
// Adds the file to the request AND to the repository, so it lands in the
// internal WorkflowSpine's Input zone. If it satisfies an outstanding required
// doc, that checklist row flips to `received` on both sides.
export function addRequestAttachment(requestId, file, opts = {}) {
  const req = (state.requests || []).find((r) => r.id === requestId);
  if (!req) return { ok: false, errors: ["request not found"] };

  const att = {
    id: `${requestId}-A${(req.attachments || []).length + 1}`,
    name: file.name,
    sizeKb: file.sizeKb || null,
    kind: file.kind || "Attachment",
    uploadedBy: opts.by || req.requesterId,
    uploadedAt: nowIso(),
    satisfies: opts.requiredDocId || null,
  };

  const docId = nextId("repository", "DOC-");
  addItem("repository", {
    id: docId,
    name: file.name,
    kind: file.kind && file.kind !== "Attachment" ? file.kind : "Correspondence",
    source: "Requester upload",
    contractId: req.linkedContractId || null,
    requestId,
    entityId: req.entityId,
    contractType: req.contractType,
    jur: (entityById(req.entityId) || {}).jur || "—",
    uploadedBy: opts.by || req.requesterId,
    uploadedByEmail: req.requesterEmail,
    uploadedAt: nowIso(),
    pages: null, sizeKb: file.sizeKb || null,
    stage: "Intake",
    ocrStatus: "Pending", ocrConfidence: null, ocrText: "",
    extractedFields: {},
    srNo: null, physicalRecordRef: null, officeLocation: null,
    storagePath: `/legal/portal/${requestId}/${file.name}`,
    // `// Drive / server storage seam`
    driveLink: `https://drive.google.com/file/d/legalos-${docId.toLowerCase()}/view`,
    access: [{ userId: req.owner, level: "edit" }, { userId: req.requesterId, level: "comment" }],
  });

  const patch = { attachments: [...(req.attachments || []), att] };
  if (opts.requiredDocId) {
    patch.requiredDocs = (req.requiredDocs || []).map((d) =>
      d.id === opts.requiredDocId ? { ...d, status: "received", receivedAt: nowIso(), docId } : d);
  }
  updateItem("requests", requestId, patch);
  return { ok: true, attachment: att, docId };
}

/* ---------------- the missing-document flow ---------------- */
// Legal asks for a document; the requester sees it as an outstanding ask.
export function requestRequiredDoc(requestId, name, byUserId) {
  const req = (state.requests || []).find((r) => r.id === requestId);
  if (!req || !String(name || "").trim()) return { ok: false };
  const entry = {
    id: `${requestId}-RD${(req.requiredDocs || []).length + 1}-${Date.now().toString(36).slice(-3)}`,
    name: String(name).trim(),
    status: "requested",
    requestedBy: byUserId || "u1",
    requestedAt: nowIso(),
    receivedAt: null,
    docId: null,
  };
  updateItem("requests", requestId, { requiredDocs: [...(req.requiredDocs || []), entry] });
  return { ok: true, entry };
}
// Marks an ask satisfied without an upload (e.g. it arrived by email).
export function fulfilRequiredDoc(requestId, requiredDocId, docId) {
  const req = (state.requests || []).find((r) => r.id === requestId);
  if (!req) return { ok: false };
  updateItem("requests", requestId, {
    requiredDocs: (req.requiredDocs || []).map((d) =>
      d.id === requiredDocId ? { ...d, status: "received", receivedAt: nowIso(), docId: docId || d.docId } : d),
  });
  return { ok: true };
}
export function withdrawRequiredDoc(requestId, requiredDocId) {
  const req = (state.requests || []).find((r) => r.id === requestId);
  if (!req) return { ok: false };
  updateItem("requests", requestId, { requiredDocs: (req.requiredDocs || []).filter((d) => d.id !== requiredDocId) });
  return { ok: true };
}
export const outstandingDocs = (req) => (req && req.requiredDocs || []).filter((d) => d.status === "requested");

// Every request that came through the portal — the Request Log's source set.
export const portalRequests = () => (state.requests || []).filter((r) => r.channel === "portal");

/* ============================================================
   SPRINT 5 — presenting the system.
   ============================================================ */

// A one-shot navigation intent: "open the Workspace on THIS lens with THESE
// filters". The Flow Map and the Executive Overview set it, WorkspaceHome
// consumes it on mount. Deliberately not persisted — it is an intent, not state.
let _workspaceTarget = null;
export function setWorkspaceTarget(target) { _workspaceTarget = target || null; }
export function takeWorkspaceTarget() {
  const t = _workspaceTarget;
  _workspaceTarget = null;
  return t;
}

// Demo reset: return everything to the seeded, presentation-perfect state so a
// walkthrough always starts clean. Clears the derived/UI state too, otherwise a
// stale saved filter or portal session makes the first screen look wrong.
export function resetDemo() {
  state = seed();
  try {
    localStorage.removeItem(LAST_KEY);
    localStorage.removeItem(PORTAL_SESSION_KEY);
    localStorage.removeItem("legalos-tour-seen");
  } catch (e) {}
  emit();
  return { ok: true };
}

// Last-used filter set per module, persisted alongside the saved views.
const LAST_KEY = "legalos-filters-v1";
export function loadLastFilters(module) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
    return all[module] || null;
  } catch (e) { return null; }
}
export function saveLastFilters(module, filters) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
    all[module] = filters;
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch (e) {}
}
