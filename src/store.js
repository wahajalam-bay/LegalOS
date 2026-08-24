// Lightweight reactive store — shared, persisted collections so "create" works
// across the app without a backend. Seeds from data.js, persists to localStorage.
import { useState, useEffect } from "./core.js";
import {
  REQUESTS, MATTERS, CONTRACTS, LICENSES, COMPANIES, TEMPLATES, REPOSITORY,
  REQUESTERS, MESSAGES, FORM_CONFIG, USERS,
  lifecyclePathFor, inferCategory, inferSubdivision, entityById, entityName, byId, licenseStatus,
  stageMeta,
} from "./data.js";
import { fixTat, addWorkingDays, weekendFor } from "./tat.js";
// Module 2 — Matter Management: taxonomy, lifecycle machine, risk matrix.
import {
  PRACTICE_AREAS, practiceArea, practiceCode, matterTypesOf, CATEGORY_PRACTICE,
  canTransition, TRANSITION_NEEDS_REASON, isTerminal, riskSeverity, proposeRisk,
  normalizeCpName, matterAgeDays,
} from "./matters2.js";
// Module 3 — Contract Intelligence: pure model (no imports → no cycle).
import {
  CLAUSE_FLOW, CLAUSE_GATE, CLAUSE_SEED_DEFS, TEMPLATE_DEFS,
  generateRecitals, splitSections, classifyClauseText, sameText, textGap,
} from "./contracts3.js";
// Sprint 6 — the org architecture (FRD): teams, master data, modules, TAT v2.
import { MASTER_DATA_SEED, teamPrefix } from "./org.js";
import { MODULES, moduleByKey, workflowOf, riskGateMissing } from "./modules.js";
import { tatV2 } from "./tat2.js";
import { MOD_REQUESTS, NOTICE_TEMPLATES, COST_BUDGETS, FILING_SCHEDULE } from "./seeds-org.js";

const addWorkingDaysIso = (from, n, jurisdiction) => addWorkingDays(from, n, weekendFor(jurisdiction)).toISOString();

// PRD §3.6 TAT matrix — the FULL matrix, business days, keyed by
// (fine SLA category × urgency band). Emergency 0 = "same day". Seeded here so
// the Director can edit it in Settings (the live copy is the `slaMatrix` slice).
const SLA_MATRIX_SEED = {
  "NDA (our template)":                     { Emergency: 0, "Time-critical": 1, Important: 1, Routine: 2 },
  "NDA (counterparty paper)":               { Emergency: 1, "Time-critical": 1, Important: 2, Routine: 3 },
  "Contract review — standard":             { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 4 },
  "Contract review — complex/high value":   { Emergency: 2, "Time-critical": 3, Important: 4, Routine: 6 },
  "Contract drafting — from template":      { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 4 },
  "Contract drafting — complex/high value": { Emergency: 2, "Time-critical": 3, Important: 4, Routine: 6 },
  "Amendment":                              { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
  "Renewal":                                { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
  "Termination":                            { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
  "Legal opinion — simple/narrow":          { Emergency: 2, "Time-critical": 3, Important: 5, Routine: 7 },
  "Legal opinion — complex":                { Emergency: 2, "Time-critical": 5, Important: 7, Routine: 10 },
  "Regulatory / compliance query":          { Emergency: 1, "Time-critical": 2, Important: 4, Routine: 5 },
  "Dispute — initial assessment":           { Emergency: 0, "Time-critical": 1, Important: 2, Routine: 3 },
  "IP filing":                              { Emergency: 1, "Time-critical": 3, Important: 5, Routine: 10 },
  "Triage required":                        { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
};
export const SLA_BANDS = ["Emergency", "Time-critical", "Important", "Routine"];

// Playbooks (PRD §2 — the Director configures playbooks). Seeded, then editable.
const PLAYBOOK_SEED = [
  { id: "PB-01", title: "Commercial Contracting Playbook", area: "Commercial · fallback positions", icon: "briefcase", updatedAt: null },
  { id: "PB-02", title: "Data Privacy Playbook", area: "GDPR · PDPL · PDPA", icon: "shield", updatedAt: null },
  { id: "PB-03", title: "Employment Playbook — GCC", area: "KSA · UAE labor law", icon: "users", updatedAt: null },
  { id: "PB-04", title: "M&A Diligence Playbook", area: "Corporate · transactions", icon: "gavel", updatedAt: null },
  { id: "PB-05", title: "Litigation & Disputes Playbook", area: "Pre-action · settlement", icon: "scale", updatedAt: null },
  { id: "PB-06", title: "Procurement & Vendor Playbook", area: "Sourcing · SLAs · risk", icon: "clipboard", updatedAt: null },
];

/* ============================================================
   MODULE 2 — MATTER MANAGEMENT seeds
   ============================================================ */
// Counterparty MASTER (Phase 8) — seeded FROM the existing entity registry so
// nothing is retyped: every non-group company becomes a master record, enriched
// with the Module 2 fields (relationship, entity type, registration).
const CP_SEED = () => [
  ...COMPANIES.filter((c) => c.type !== "Group Entity").map((c, i) => ({
    id: "CP-" + String(i + 1).padStart(3, "0"),
    legalName: c.name,
    tradingNames: [],
    aliases: [...(c.aliases || [])],
    jurisdiction: c.jurisdiction || "—",
    registrationNo: null,
    entityType: "Company",
    relationship: c.type === "Vendor" ? "Supplier" : c.type === "Counterparty" ? "Customer" : "Other",
    parentId: null,
    entityRef: c.id,          // back-reference to the registry record
    createdAt: null, createdBy: null,
  })),
  // Demo counterparties referenced by the Module 2 seed matters.
  { id: "CP-900", legalName: "Acme Ltd", tradingNames: [], aliases: ["ACME Limited"], jurisdiction: "Saudi Arabia", registrationNo: "CR-104482", entityType: "Company", relationship: "Customer", parentId: null, entityRef: null, createdAt: null, createdBy: null },
  { id: "CP-901", legalName: "Orbit Ventures", tradingNames: [], aliases: [], jurisdiction: "UAE", registrationNo: null, entityType: "Company", relationship: "Partner", parentId: null, entityRef: null, createdAt: null, createdBy: null },
];

// Phase 31 — realistic Module 2 demo matters (new id scheme, varied states).
const d2 = (n) => new Date(Date.now() + n * 86400000).toISOString();
const M2_SEED = () => {
  const cps = CP_SEED();
  const cp = (name) => (cps.find((c) => c.legalName.toLowerCase().includes(name)) || cps[0]).id;
  const mk = (id, o) => ({
    // identity + taxonomy
    id, name: o.name, practiceArea: o.pa, matterType: o.mt,
    // people + org
    department: o.dept, counterpartyId: o.cp || null, owner: o.owner, collaborators: o.collab || [],
    // lifecycle + dates
    status: o.status || "Active", openedAt: o.opened, targetDate: o.target || null, closedAt: o.closed || null,
    // money + risk + privilege. `risk2` is the Module 2 assessment object;
    // legacy `risk` stays a lowercase severity string so the existing spine /
    // exec / TAT consumers keep working.
    value: o.value || null, exposure: o.exposure || null, currency: o.cur || "USD",
    risk2: o.risk || null,                   // { likelihood, impact, severity, proposed, confirmedBy, confirmedAt, override }
    risk: o.risk ? o.risk.severity.toLowerCase() : "medium",
    privilege: o.priv || "Open", namedAccess: o.named || [],
    // links
    sourceRequestId: o.req || null, relatedMatters: o.rel || [],
    outcome: o.outcome || null,
    // audit (immutable, append-only)
    audit: [{ at: o.opened, by: o.owner, kind: "created", detail: "Matter opened" }],
    createdBy: o.owner, createdAt: o.opened, updatedBy: o.owner, updatedAt: o.opened,
    // legacy-compat fields so the existing spine/worklist keep working
    title: o.name, type: "Contract", bu: o.dept, opened: o.opened, due: o.target || d2(14),
    progress: o.status === "Closed" ? 100 : o.progress || 30, priority: o.priority || "medium",
    stage: o.status === "Closed" ? "Closed" : o.stage || "Legal Review",
    subdivision: o.sub || "Commercial", entityId: o.entityId || "CO-19", companyTags: [],
  });
  return [
    mk("COM-2026-0147", { name: "Customer Service Agreement — Acme", pa: "commercial", mt: "Customer / Service agreement", dept: "Sales & Marketing", cp: cp("acme"), owner: "u5", collab: ["u9"], status: "Active", opened: d2(-18), target: d2(9), value: 480000, exposure: 120000, risk: { likelihood: "Possible", impact: "Moderate", severity: "Medium", proposed: true }, req: null, progress: 45 }),
    mk("ADM-2026-0042", { name: "SaaS Renewal — Technology Vendor", pa: "administrative", mt: "SaaS / technology agreement", dept: "IT", cp: cp("amazon"), owner: "u7", status: "Awaiting External", opened: d2(-32), target: d2(4), value: 220000, risk: { likelihood: "Unlikely", impact: "Moderate", severity: "Low", proposed: true }, progress: 60 }),
    mk("EMP-2026-0021", { name: "Employment Settlement — Regional Sales Lead", pa: "employment", mt: "Termination / settlement", dept: "HR", owner: "u17", collab: ["u18"], status: "Substantively Complete", opened: d2(-51), target: d2(-6), exposure: 300000, cur: "PKR", risk: { likelihood: "Likely", impact: "Moderate", severity: "Medium", proposed: false, confirmedBy: "u6", confirmedAt: d2(-40) }, priv: "Restricted", named: ["u6", "u17", "u18"], sub: "Labour/Employment", progress: 90 }),
    mk("DIS-2026-0012", { name: "Pre-action Legal Notice — Orbit Ventures", pa: "disputes", mt: "Pre-action / legal notices", dept: "Finance", cp: cp("orbit"), owner: "u6", status: "Active", opened: d2(-9), target: d2(6), exposure: 2000000, risk: { likelihood: "Likely", impact: "Major", severity: "High", proposed: false, confirmedBy: "u6", confirmedAt: d2(-7) }, priv: "Privileged", named: ["u6", "u17"], sub: "Litigation & Disputes", progress: 35, priority: "high" }),
    mk("REG-2026-0034", { name: "Regulatory Compliance Assessment — PDPL", pa: "regulatory", mt: "Compliance assessment", dept: "IT", owner: "u12", status: "On Hold", opened: d2(-70), target: d2(20), risk: { likelihood: "Possible", impact: "Major", severity: "High", proposed: true }, sub: "Compliance & Regulatory", progress: 50 }),
    mk("COM-2026-0139", { name: "Distribution Agreement — Delta Trading", pa: "commercial", mt: "Partnership / JV", dept: "Sales & Marketing", cp: cps[2] && cps[2].id, owner: "u5", status: "Closed", opened: d2(-95), target: d2(-30), closed: d2(-22), value: 950000, risk: { likelihood: "Possible", impact: "Moderate", severity: "Medium", proposed: false, confirmedBy: "u3", confirmedAt: d2(-80) }, outcome: { category: "Completed with modifications", positionAchieved: "Substantial", conceded: "Extended cure period to 30 days", held: "Liability cap at 1× fees; our governing law", externalCounsel: false, lessons: "Cure-period concession acceptable when cap holds.", differently: "Engage commercial team before first draft.", closedBy: "u5", closedAt: d2(-22) } }),
  ];
};

// Legacy seed matters (MAT-xxx) upgraded in place to the Module 2 shape —
// same ids, all legacy fields kept (the spine still reads them), new fields
// added so the register / risk / privilege / audit machinery works everywhere.
const LEGACY_PRACTICE = {
  Contract: "commercial", Corporate: "corporate", Litigation: "disputes",
  Compliance: "regulatory", Employment: "employment", IP: "ip",
  Policy: "advisory", Regulatory: "regulatory",
};
function migrateLegacyMatter(m) {
  if (m.practiceArea) return m; // already Module 2 shape
  const pa = LEGACY_PRACTICE[m.type] || "commercial";
  const sev = m.risk ? m.risk[0].toUpperCase() + m.risk.slice(1) : null;
  return {
    ...m,
    name: m.title,
    practiceArea: pa,
    matterType: (matterTypesOf(pa) || [])[0] || m.type,
    department: m.department || m.bu || "—",
    counterpartyId: null,
    collaborators: [],
    openedAt: m.opened, targetDate: m.due, closedAt: m.progress === 100 ? m.due : null,
    value: null, exposure: null, currency: "USD",
    risk2: sev ? { likelihood: null, impact: null, severity: sev === "Critical" ? "Critical" : sev === "High" ? "High" : sev === "Medium" ? "Medium" : "Low", proposed: true } : null,
    privilege: m.privilege || "Open", namedAccess: m.namedAccess || [],
    sourceRequestId: m.requestId || null, relatedMatters: [],
    outcome: null,
    audit: [{ at: m.opened, by: m.owner, kind: "created", detail: "Matter opened" }],
    createdBy: m.owner, createdAt: m.opened, updatedBy: m.owner, updatedAt: m.opened,
  };
}

// Matter task seeds (Phase 11) — real records, not counts.
const M2_TASKS_SEED = () => [
  { id: "MT-0001", matterId: "COM-2026-0147", name: "Review counterparty redlines v2", description: "", owner: "u5", due: d2(2), status: "In Progress", dependsOn: null, createdAt: d2(-6), createdBy: "u5", completedAt: null },
  { id: "MT-0002", matterId: "COM-2026-0147", name: "Confirm liability cap vs playbook", description: "", owner: "u9", due: d2(4), status: "Not Started", dependsOn: "MT-0001", createdAt: d2(-6), createdBy: "u5", completedAt: null },
  { id: "MT-0003", matterId: "DIS-2026-0012", name: "Draft pre-action notice", description: "", owner: "u6", due: d2(1), status: "In Progress", dependsOn: null, createdAt: d2(-8), createdBy: "u6", completedAt: null },
  { id: "MT-0004", matterId: "EMP-2026-0021", name: "Obtain signed settlement deed", description: "", owner: "u17", due: d2(-2), status: "Completed", dependsOn: null, createdAt: d2(-30), createdBy: "u17", completedAt: d2(-3) },
];

const LS_KEY = "legalos-store-v1";
const PORTAL_SESSION_KEY = "legalos-portal-session";

// Fresh seed snapshot. New slices are added here; the merge below is
// backward-compatible so an existing (older-shape) localStorage never crashes.
function seed() {
  return {
    requests: [...REQUESTS],
    // Module 2: new-scheme demo matters first, then the legacy seed matters
    // upgraded in place to the Module 2 shape (same ids, richer record).
    matters: [...M2_SEED(), ...MATTERS.map(migrateLegacyMatter)],
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
    // Sprint 6 slices — the org architecture
    modRequests: [...MOD_REQUESTS],
    noticeTemplates: [...NOTICE_TEMPLATES],
    costBudgets: [...COST_BUDGETS],
    // Filing Module 8.2 — the statutory filing calendar per entity, maintained
    // by Compliance; the system generates the filing record 30 days ahead.
    filingSchedule: FILING_SCHEDULE.map((x) => ({ ...x })),
    notifs: [],
    // Object-shaped slices: administrable master data + the View As session.
    masterData: JSON.parse(JSON.stringify(MASTER_DATA_SEED)),
    // PRD §2/§3.6 — the Director-editable SLA matrix + playbooks, and the queue
    // of config changes an AD has proposed for the Director to publish.
    slaMatrix: JSON.parse(JSON.stringify(SLA_MATRIX_SEED)),
    playbooks: [...PLAYBOOK_SEED],
    configProposals: [],
    // Module 2 — Matter Management slices
    counterparties: CP_SEED(),
    matterTasks: M2_TASKS_SEED(),
    // Module 3 — Contract Intelligence slices. The clause library seeds as
    // PUBLISHED (approved internal positions); everything else starts empty and
    // is produced by the engine.
    clauses3: CLAUSE_SEED_DEFS.map((def, i) => ({
      id: "LIB-" + String(101 + i).padStart(4, "0"),
      type: def.type, agreementType: def.agreementType || "Any",
      jurisdiction: def.jurisdiction || "Any",
      risk: def.risk, approvalRequired: def.approval,
      status: "Published", currentVersion: 1,
      versions: [{ v: 1, tiers: { ...def.tiers }, notes: def.notes || "", guidance: def.guidance || "", author: "u3", reviewer: "u3", approvedBy: "u1", status: "Published", effectiveAt: d2(-40), supersededAt: null, changeSummary: "Initial approved position" }],
      relatedClauses: [], createdBy: "u3", createdAt: d2(-60), lastReviewedBy: "u1", lastReviewedAt: d2(-40),
      audit: [{ at: d2(-40), by: "u1", kind: "published", detail: "Approved and published" }],
    })),
    templates3: TEMPLATE_DEFS.map((t, i) => ({
      id: "TPL-" + String(11 + i).padStart(3, "0"), key: t.key,
      agreementType: t.agreementType, label: t.label, jurisdiction: t.jurisdiction,
      version: 1, status: "Published",
      versions: [{ v: 1, by: "u1", at: d2(-40), status: "Published", note: "Approved structure" }],
      approvedBy: "u1",
    })),
    drafts3: [], reviews3: [], deviations3: [], clauseSuggestions: [], aiAudit: [],
    session: { viewAsId: "u1" },
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
    // R1.0 Module 1 (PRD §3.1) — the requester describes in plain language and
    // the system carries a PROPOSED legal category into triage; the requester
    // never picks a legal category / team / module.
    businessContext: payload.businessContext || null,
    urgencyBand: payload.urgencyBand || null,
    requesterOption: payload.requesterOption || null,
    layer2: payload.layer2 || null,
    proposedCategory: payload.category || category,
    categoryConfirmed: false,
    needByJustification: payload.needByJustification || null,
    needByTight: !!payload.needByTight,
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

  /* ---- jurisdiction drives the working-week calendar (PRD §3.6) ---- */
  const jurisdiction = (entityById(payload.entityId) || {}).jur || payload.jurisdiction || payload.country || null;

  /* ---- auto-fix the TAT: CATEGORY × PRIORITY, in business days (PRD §3.6) ----
     Same engine as triage, so intake and triage never disagree on the clock. */
  const urgencyBand = draft.urgencyBand || "Important";
  const sla = resolveSlaDays(draft, urgencyBand);
  // Routing precedence for the owner: explicit → admin per-nature routing →
  // least-loaded member of the right team (workload + past-matter aware).
  const owner = payload.owner || routing.owner || suggestOwner(draft) || SUBDIV_OWNER[draft.subdivision] || "u5";
  const tat = routing.tatDays
    ? { days: routing.tatDays, fixedAt: requestDate, dueAt: addWorkingDaysIso(requestDate, routing.tatDays, jurisdiction), basis: `${nature} routing default` }
    : { days: sla.days, fixedAt: requestDate, dueAt: addWorkingDaysIso(requestDate, sla.days, jurisdiction), basis: `${sla.fine} × ${urgencyBand}` };

  /* ---- drop into Triage on the department side ---- */
  const path = lifecyclePathFor(draft.requestType);
  const record = {
    ...draft,
    jurisdiction,
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

  // PRD §3.7 — automated acknowledgement to the requester.
  notifyRequester(record, {
    kind: "ack", tone: "blue", icon: "inbox",
    title: `Request received — ${id}`,
    body: `We've logged "${record.title}". Target turnaround ${tat.days} working day${tat.days === 1 ? "" : "s"} (by ${new Date(tat.dueAt).toLocaleDateString()}).`,
  });
  // The request goes TO the desk immediately: the suggested expert counsel and
  // their team lead both hear about it at submission, before formal triage.
  notifyUser(owner, {
    kind: "new-req", ref: id, tone: "purple", icon: "inbox",
    title: `${id} — new request suggested to you`,
    body: `${record.title} (${record.category || "Triage required"}). Awaiting triage confirmation.`,
    to: "/triage/" + id,
  });
  const ownerLead = USERS.find((u) => u.rbac === "lead" && u.legalTeam === (byId(owner) || {}).legalTeam);
  if (ownerLead && ownerLead.id !== owner) notifyUser(ownerLead.id, {
    kind: "new-req-lead", ref: id, tone: "purple", icon: "filter",
    title: `${id} — new request for your desk`,
    body: `${record.title} — system-routed to ${_nm(owner)}. Triage to confirm or reassign.`,
    to: "/triage/" + id,
  });

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

/* ============================================================
   R1.0 MODULE 1 — ASSISTED TRIAGE (PRD §3.4)
   The system PROPOSES category / priority / SLA / assignee; a lawyer accepts in
   one click or overrides with a reason. Every override is recorded. After
   enough logged overrides, defined categories can be auto-triaged.
   ============================================================ */
const _nm = (uid) => (byId(uid) || {}).name || uid || "Unassigned";

// The live SLA matrix — the admin-editable slice, falling back to the seed.
const slaMatrix = () => (state && state.slaMatrix) || SLA_MATRIX_SEED;
// Coarse requester category → a sensible default fine row (used when we cannot
// resolve a finer row from the request's signals).
const COARSE_TO_FINE = {
  "Contract Drafting / Review": "Contract review — standard",
  "Amendment / Renewal / Termination": "Amendment",
  "Legal Opinion / Advisory": "Legal opinion — simple/narrow",
  "Dispute / Litigation": "Dispute — initial assessment",
  "Regulatory / Compliance": "Regulatory / compliance query",
  "IP": "IP filing",
  "Triage required": "Triage required",
};
const URGENCY_PRIORITY = { Emergency: "Urgent", "Time-critical": "High", Important: "Medium", Routine: "Low" };
// The requester-facing coarse categories the triage UI offers.
export const TRIAGE_CATEGORIES = Object.keys(COARSE_TO_FINE);

// Is this a complex / high-value request? Drives the harder SLA tiers.
function isComplex(req = {}) {
  const v = Number(req.value || req.contractValue || 0);
  const r = String(req.risk || req.riskPreliminary || "").toLowerCase();
  return v >= 1000000 || r === "high" || r === "critical" || req.complex === true || /complex|high.?value/i.test(req.complexity || "");
}
// Resolve the FINE SLA category from a request's category + captured signals
// (whose paper, NDA-ness, change nature, complexity/value).
export function slaCategoryOf(req = {}) {
  const cat = req.proposedCategory || req.category || "Triage required";
  const l2 = req.layer2 || {};
  const paper = String(l2.paper || req.paper || "").toLowerCase();
  const ct = String(req.contractType || req.natureOfMatter || req.title || "").toLowerCase();
  const isNda = /nda|non.?disclosure|mou|confidential/.test(ct) || /nda|confidential/.test(String(req.requesterOption || "").toLowerCase());
  if (cat === "Contract Drafting / Review") {
    if (isNda) return paper.includes("their") ? "NDA (counterparty paper)" : "NDA (our template)";
    const theirs = paper.includes("their");
    if (theirs) return isComplex(req) ? "Contract review — complex/high value" : "Contract review — standard";
    return isComplex(req) ? "Contract drafting — complex/high value" : "Contract drafting — from template";
  }
  if (cat === "Amendment / Renewal / Termination") {
    const n = String(l2.changeNature || req.changeNature || "").toLowerCase();
    if (n.includes("renew")) return "Renewal";
    if (n.includes("terminat")) return "Termination";
    return "Amendment";
  }
  if (cat === "Legal Opinion / Advisory") return isComplex(req) ? "Legal opinion — complex" : "Legal opinion — simple/narrow";
  return COARSE_TO_FINE[cat] || "Triage required";
}

// SLA days for a coarse category (used by the intake wizard's tight-date check).
export function triageSlaDays(category, urgencyBand) {
  const M = slaMatrix();
  const fine = COARSE_TO_FINE[category] || category;
  const row = M[fine] || M["Triage required"] || {};
  const d = row[urgencyBand];
  return d == null ? 3 : d;
}
// SLA days resolved from the full request (uses fine-category signals). This is
// the authoritative computation used at intake and at triage.
export function resolveSlaDays(req, urgencyBand) {
  const M = slaMatrix();
  const fine = slaCategoryOf(req);
  const row = M[fine] || M["Triage required"] || {};
  const d = row[urgencyBand];
  return { days: d == null ? 3 : d, fine };
}

/* ---------------- config surfaces (PRD §2) ---------------- */
// The SLA matrix, playbooks, and the propose→publish workflow. The Director
// (canConfigure) publishes directly; an AD (canProposeConfig) submits a proposal
// the Director then reviews.
export function useSlaMatrix() { return useCollection("slaMatrix"); }
export function getSlaMatrix() { return slaMatrix(); }
export function updateSlaCell(fineCategory, band, days) {
  const M = JSON.parse(JSON.stringify(slaMatrix()));
  M[fineCategory] = { ...(M[fineCategory] || {}), [band]: Math.max(0, Math.round(Number(days) || 0)) };
  state = { ...state, slaMatrix: M }; emit();
  return { ok: true };
}
export function resetSlaMatrix() { state = { ...state, slaMatrix: JSON.parse(JSON.stringify(SLA_MATRIX_SEED)) }; emit(); }

// A change proposed by an AD for the Director to publish (PRD §2).
export function proposeConfigChange(kind, summary, detail, byUserId) {
  const id = "CP-" + ((state.configProposals || []).length + 1).toString().padStart(3, "0");
  const prop = { id, kind, summary, detail: detail || null, by: byUserId || null, at: nowIso(), status: "proposed" };
  state = { ...state, configProposals: [prop, ...(state.configProposals || [])] }; emit();
  // Notify every Director so it lands on their desk.
  (USERS || []).filter((u) => u.rbac === "head").forEach((u) => notifyUser(u.id, {
    kind: "config-proposal", ref: id, tone: "purple", icon: "sparkles",
    title: `Config change proposed — ${summary}`, body: `${_nm(byUserId)} proposed a change to ${kind}. Review it in Settings.`, to: "/settings",
  }));
  return { ok: true, id };
}
export function resolveConfigProposal(id, decision, byUserId) {
  state = { ...state, configProposals: (state.configProposals || []).map((p) => p.id === id ? { ...p, status: decision, decidedBy: byUserId || null, decidedAt: nowIso() } : p) };
  emit();
  return { ok: true };
}
// Director publishes a proposed change — applies it, then marks it published.
export function publishConfigProposal(id, byUserId) {
  const p = (state.configProposals || []).find((x) => x.id === id);
  if (!p) return { ok: false, error: "proposal not found" };
  const d = p.detail || {};
  if (p.kind === "SLA matrix" && d.cat && d.band != null) updateSlaCell(d.cat, d.band, d.days);
  else if (p.kind === "playbooks") {
    if (d.id) updateItem("playbooks", d.id, { title: d.title, area: d.area, updatedAt: nowIso() });
    else addItem("playbooks", { id: nextId("playbooks", "PB-"), title: d.title, area: d.area, icon: "book", updatedAt: nowIso() });
  }
  return resolveConfigProposal(id, "published", byUserId);
}

// Which team owns a category — used to route the owner suggestion.
const CATEGORY_TEAM = {
  "Contract Drafting / Review": "commercial",
  "Amendment / Renewal / Termination": "commercial",
  "Legal Opinion / Advisory": "commercial",
  "Dispute / Litigation": "litigation",
  "Regulatory / Compliance": "compliance",
  "IP": "litigation",
  "Triage required": "commercial",
};
// Current open workload of a user, across BOTH request domains.
function ownerLoad(uid) {
  const live = (s) => !["Closed", "Delivered", "Completed", "Executed"].includes(s);
  const a = (state.requests || []).filter((r) => r.owner === uid && live(r.status)).length;
  const b = (state.modRequests || []).filter((r) => r.owner === uid && r.status !== "Closed").length;
  return a + b;
}
// How many matters of this category this user has handled — experience signal.
function pastMattersOfType(uid, category) {
  return (state.requests || []).filter((r) => r.owner === uid && (r.category === category || r.proposedCategory === category)).length;
}
// PRD §3.4 — the suggested assignee: the LEAST-LOADED member of the owning team,
// ties broken by MORE past matters of this type (experience), then id.
export function suggestOwner(req) {
  const cat = (req && (req.proposedCategory || req.category)) || "Triage required";
  const team = CATEGORY_TEAM[cat] || "commercial";
  const members = USERS.filter((u) => u.legalTeam === team && (u.rbac === "member" || u.rbac === "paralegal"));
  const pool = members.length ? members : USERS.filter((u) => u.legalTeam === team);
  if (!pool.length) return null;
  return pool.slice().sort((a, b) =>
    ownerLoad(a.id) - ownerLoad(b.id) ||
    pastMattersOfType(b.id, cat) - pastMattersOfType(a.id, cat) ||
    (a.id < b.id ? -1 : 1)
  )[0].id;
}

// The system's proposal for a request awaiting triage.
export function triageProposal(req) {
  if (!req) return null;
  const category = req.proposedCategory || req.category || "Triage required";
  const urgencyBand = req.urgencyBand || "Important";
  const priority = URGENCY_PRIORITY[urgencyBand] || "Medium";
  const sla = resolveSlaDays(req, urgencyBand);
  const slaDays = sla.days;
  const base = req.requestDate || req.created || nowIso();
  const slaDueAt = addWorkingDaysIso(base, slaDays, req.jurisdiction || req.country);
  // requested date earlier than the SLA allows → needs approval / justification.
  const needBy = req.dueDate ? new Date(req.dueDate) : null;
  const escalate = !!(needBy && needBy < new Date(slaDueAt));
  return { category, slaCategory: sla.fine, urgencyBand, priority, slaDays, slaDueAt, owner: req.owner || suggestOwner(req), subdivision: req.subdivision || null, escalate, needByDate: req.dueDate || null };
}

// Similar past matters + conflict/sensitivity flags for the triage screen.
export function triageContext(req) {
  if (!req) return { similar: [], flags: [] };
  const cat = req.proposedCategory || req.category;
  const cp = (req.counterparty || "").toLowerCase();
  const pool = [
    ...(state.requests || []).map((r) => ({ ...r, __kind: "request" })),
    ...(state.matters || []).map((m) => ({ ...m, __kind: "matter" })),
  ];
  const similar = pool.filter((x) => x.id !== req.id && (
    (cat && (x.category === cat || x.proposedCategory === cat)) ||
    (cp && cp !== "—" && (x.counterparty || "").toLowerCase() === cp)
  )).slice(0, 4).map((x) => ({ id: x.id, title: x.title, status: x.status, kind: x.__kind }));
  const flags = [];
  if (/Dispute/i.test(cat || "") || req.natureOfMatter === "Dispute")
    flags.push({ tone: "red", text: "Sensitive — dispute/litigation. Consider privilege classification before assigning." });
  const openCp = pool.find((x) => x.id !== req.id && cp && cp !== "—" && (x.counterparty || "").toLowerCase() === cp && x.status !== "Closed");
  if (openCp) flags.push({ tone: "amber", text: `Counterparty already has open work — ${openCp.id} · ${openCp.title}.` });
  return { similar, flags };
}

// The triage decision. `decision` = { category, priority, subdivision, owner,
// reason }. Accepting = leaving the proposal unchanged; any change is an
// override and REQUIRES a reason (PRD §3.4 — every override is logged).
export function triageDecision(id, decision = {}, byUserId) {
  const req = (state.requests || []).find((r) => r.id === id);
  if (!req) return { ok: false, error: "request not found" };
  const proposal = triageProposal(req);
  const final = {
    category: decision.category || proposal.category,
    priority: decision.priority || proposal.priority,
    subdivision: decision.subdivision || proposal.subdivision,
    owner: decision.owner || proposal.owner,
  };
  const overrides = [];
  if (final.category !== proposal.category) overrides.push({ field: "category", from: proposal.category, to: final.category });
  if (final.priority !== proposal.priority) overrides.push({ field: "priority", from: proposal.priority, to: final.priority });
  if (final.owner !== proposal.owner) overrides.push({ field: "assignee", from: _nm(proposal.owner), to: _nm(final.owner) });
  const accepted = overrides.length === 0;
  // Correcting the system's category/priority is a logged OVERRIDE (needs a
  // reason). Assigning/delegating to a different owner is the HoD's prerogative —
  // it is logged but does not require a reason (PRD §2 hierarchy).
  const substantive = overrides.some((o) => o.field === "category" || o.field === "priority");
  if (substantive && !String(decision.reason || "").trim()) return { ok: false, error: "an override reason is required" };

  const sla = resolveSlaDays({ ...req, category: final.category, proposedCategory: final.category }, proposal.urgencyBand);
  const slaDays = sla.days;
  const base = req.requestDate || req.created || nowIso();
  const tat = { days: slaDays, fixedAt: base, dueAt: addWorkingDaysIso(base, slaDays, req.jurisdiction || req.country), basis: `${sla.fine} × ${proposal.urgencyBand}` };
  const decidedAt = nowIso();

  const triageRecord = {
    proposal: { category: proposal.category, priority: proposal.priority, owner: proposal.owner, slaDays: proposal.slaDays },
    final, accepted, overrides, reason: decision.reason || null, escalate: proposal.escalate,
    decidedBy: byUserId || null, decidedAt,
  };
  const activity = [...(req.activity || []), {
    at: decidedAt, by: byUserId || null,
    action: accepted
      ? `Triage accepted — ${final.category} · ${final.priority} · assigned to ${_nm(final.owner)} (SLA ${slaDays}d)`
      : substantive
        ? `Triage OVERRIDE — ${overrides.map((o) => `${o.field}: ${o.from} → ${o.to}`).join("; ")}.${decision.reason ? " Reason: " + decision.reason : ""}`
        : `Triage — assigned to ${_nm(final.owner)}${decision.reason ? " (" + decision.reason + ")" : ""}`,
  }];

  updateItem("requests", id, {
    category: final.category, proposedCategory: proposal.category, categoryConfirmed: true,
    priority: final.priority, subdivision: final.subdivision, owner: final.owner,
    tat, escalated: proposal.escalate, triage: triageRecord, activity,
    status: "Assigned", stage: "Assigned",
    // Assignment is the clean start of the working lifecycle — clear any stale
    // progress / hold so the spine opens at the stage after Triage.
    progress: 0, blockedOn: null, hold: null,
  });
  // PRD §3.7 — status-change notification: categorised & assigned.
  notifyRequester(req, {
    kind: "assigned", tone: "blue", icon: "filter",
    title: `${id} — categorised & assigned`,
    body: `Your request has been reviewed and assigned to the ${final.category} desk. Target ${new Date(tat.dueAt).toLocaleDateString()}.`,
  });
  return { ok: true, accepted, overrides, escalated: proposal.escalate, tat };
}

/* ============================================================
   MODULE 1 — request lifecycle engine (PRD §5).
   A triaged request must actually MOVE through its lifecycle: Legal Review →
   Drafting → Negotiation → Approval → Signature → Executed. Before this the
   spine could only DISPLAY a derived stage; nothing advanced, escalated, held
   or reassigned a `requests`-slice record. These functions are that engine.
   ============================================================ */

// Each lifecycle stage → the board/pill status it reports. Chosen so the status
// maps back to the SAME stage in flow.js (never jumping the "you are here").
const REQUEST_STAGE_STATUS = {
  "Intake": "New", "Triage": "Triage", "Commercial Review": "Business Review",
  "Legal Review": "In Review", "Drafting": "Drafting", "Redlining": "Drafting",
  "Notice Drafting": "Drafting", "Negotiation": "Negotiation", "Approval": "Pending Approval",
  "Signature": "Awaiting Signature", "Notice Served": "Notice Served",
  "Executed": "Executed", "Repository": "Completed", "Closed": "Closed",
};

// Where the record sits on its path right now. A just-triaged record carries
// status "Assigned" (stage "Assigned" — not a lifecycle stage), which means
// Triage is done and it is ready to enter the stage after Triage.
function requestStageIndex(rec, path) {
  const explicit = path.indexOf(rec.stage);
  if (explicit >= 0) return explicit;
  if (rec.status === "Assigned") return path.indexOf("Triage"); // triaged, ready to advance
  return Math.min(1, path.length - 1);
}
export function requestStages(rec) {
  const path = lifecyclePathFor(rec.requestType);
  return { path, idx: requestStageIndex(rec, path) };
}

// A request and its matter are ONE continuous object (Workstream A). The spine's
// WORKING face is the matter when one exists, so the lifecycle engine must act on
// whichever slice actually drives what the spine displays — otherwise a click
// updates the request while the matter face keeps showing the old stage, and the
// "you are here" never moves. This resolves the record from any id and returns
// the working slice, mirroring key fields onto the request face for the
// requester's tracking + the board.
function resolveWorking(id) {
  const requests = state.requests || [];
  const matters = state.matters || [];
  let request = requests.find((r) => r.id === id) || null;
  let matter = matters.find((m) => m.id === id) || null;
  if (request && !matter && request.matterId) matter = matters.find((m) => m.id === request.matterId) || null;
  if (matter && !request) request = requests.find((r) => r.id === matter.requestId || r.matterId === matter.id) || null;
  const workSlice = matter ? "matters" : "requests";
  const work = matter || request;
  return { request, matter, workSlice, work };
}
// Mirror a small, requester-safe patch onto the request face so My Requests, the
// board and My Tasks stay in step when the matter face moves.
function mirrorToRequest(request, matter, patch) {
  if (matter && request) updateItem("requests", request.id, patch);
}

// Move the record one stage forward. Closes the open stageLog entry, opens the
// next, and updates stage / status / progress / ball. Returns { ok, stage, final }.
export function advanceRequestStage(id, byUserId) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  if (work.status === "Closed") return { ok: false, error: "record is closed" };
  const { path, idx } = requestStages(work);
  if (idx >= path.length - 1) return { ok: false, error: "already at the final stage", final: true };
  const current = path[idx];
  const next = path[idx + 1];
  const meta = stageMeta(next);
  const now = nowIso();
  const ballWith = meta.ball;
  const log = (work.stageLog || []).map((s) => (s.exitedAt ? s : { ...s, exitedAt: now }));
  log.push({ stage: next, enteredAt: now, exitedAt: null, owner: work.owner || null, ballWith });
  const isFinal = idx + 1 === path.length - 1;
  // PRD §3.5 — reaching the final stage is DELIVERY to the requester.
  const status = isFinal ? "Delivered" : (REQUEST_STAGE_STATUS[next] || next);
  const progress = Math.round(((idx + 1) / (path.length - 1)) * 100);
  const patch = { stage: next, status, progress, ballWith, blockedOn: null, hold: null, stageLog: log,
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: isFinal ? `Delivered (${next})` : `Moved to ${next}` }] };
  if (isFinal) patch.deliveredAt = now;
  // Approval round-trip: entering Approval records WHO asked; approving OUT of it
  // notifies that person their request was approved.
  if (next === "Approval") patch.approvalRequestedBy = byUserId || work.owner || null;
  const id0 = (request || work).id;
  updateItem(workSlice, work.id, patch);
  mirrorToRequest(request, matter, { stage: next, status, progress, ...(isFinal ? { deliveredAt: now } : {}) });
  if (current === "Approval" && work.approvalRequestedBy && work.approvalRequestedBy !== byUserId) {
    notifyUser(work.approvalRequestedBy, {
      kind: "approved", ref: id0, tone: "green", icon: "checksquare",
      title: `${id0} — approved`,
      body: `${_nm(byUserId)} approved your request. It has moved to ${next}.`,
      to: "/workspace/" + id0,
    });
  }
  // PRD §3.7 — status-change / delivery notification to the requester.
  notifyRequester(request || work, isFinal
    ? { kind: "delivered", tone: "green", icon: "checkcircle", title: `${(request || work).id} — delivered`, body: "Your request is complete. Legal has delivered the outcome." }
    : { kind: "stage-" + next, tone: "blue", icon: "workflow", title: `${(request || work).id} — update`, body: REQUESTER_STAGE_NOTE[next] || `Your request moved to ${next}.` });
  return { ok: true, stage: next, final: isFinal };
}

// Close the record from its current point (the heavyweight §4.7 outcome capture
// lives on the matter side).
export function closeRequest(id, byUserId, note) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  const { path } = requestStages(work);
  const now = nowIso();
  const log = (work.stageLog || []).map((s) => (s.exitedAt ? s : { ...s, exitedAt: now }));
  updateItem(workSlice, work.id, {
    status: "Closed", stage: path[path.length - 1], progress: 100, blockedOn: null, hold: null,
    closedAt: now, stageLog: log,
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: `Closed${note ? ": " + note : ""}` }],
  });
  mirrorToRequest(request, matter, { status: "Closed", progress: 100 });
  notifyRequester(request || work, {
    kind: "closed", tone: "green", icon: "checkcircle",
    title: `${(request || work).id} — closed`,
    body: `Your request has been closed.${note ? " " + note : ""}`,
  });
  return { ok: true };
}

// Escalate — raise priority to Urgent, flag it, and log why. The SLA/TAT layer
// already surfaces breaches; this is the human escalation on top of it, and it is
// the junior ranks' route to ask a superior for help on a case they can't move.
export function escalateRequest(id, byUserId, reason) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  const now = nowIso();
  const escalation = { at: now, by: byUserId || null, reason: reason || null };
  updateItem(workSlice, work.id, {
    escalated: true, escalation, priority: "Urgent",
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: `Escalated${reason ? ": " + reason : ""}` }],
  });
  mirrorToRequest(request, matter, { escalated: true, escalation, priority: "Urgent" });
  return { ok: true };
}
export function deescalateRequest(id, byUserId) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  const now = nowIso();
  updateItem(workSlice, work.id, {
    escalated: false, escalation: null,
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: "Escalation cleared" }],
  });
  mirrorToRequest(request, matter, { escalated: false, escalation: null });
  return { ok: true };
}

// Put the clock on hold — the ball leaves Legal (waiting on the business or the
// counterparty). The TAT engine does not charge legal for held time.
export function holdRequest(id, party, byUserId, reason) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  if (party !== "business" && party !== "counterparty") return { ok: false, error: "hold party must be business or counterparty" };
  const now = nowIso();
  const log = (work.stageLog || []).map((s) => (s.exitedAt ? s : { ...s, ballWith: party, holdReason: reason || null, heldAt: now }));
  updateItem(workSlice, work.id, {
    blockedOn: party, ballWith: party, hold: { party, reason: reason || null, start: now }, stageLog: log,
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: `On hold — waiting on ${party}${reason ? " (" + reason + ")" : ""}` }],
  });
  mirrorToRequest(request, matter, { blockedOn: party, hold: { party, reason: reason || null, start: now } });
  // PRD §3.5/§3.7 — "Awaiting Requester": tell the requester we need them.
  if (party === "business") notifyRequester(request || work, {
    kind: "awaiting", tone: "amber", icon: "clock",
    title: `${(request || work).id} — we need something from you`,
    body: reason ? `Legal is waiting on you: ${reason}. The clock is paused until you respond.` : "Legal is waiting on input from you. The clock is paused until you respond.",
  });
  return { ok: true };
}
export function resumeRequest(id, byUserId) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  const now = nowIso();
  const held = work.hold ? { ...work.hold, end: now } : null;
  const log = (work.stageLog || []).map((s) => (s.exitedAt ? s : { ...s, ballWith: "legal", holdReason: null }));
  const paused = (work.tatPausedMs || 0) + (held && held.start ? Math.max(0, new Date(now) - new Date(held.start)) : 0);
  updateItem(workSlice, work.id, {
    blockedOn: null, ballWith: "legal", hold: null, tatPausedMs: paused, stageLog: log,
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: "Resumed — ball back with Legal" }],
  });
  mirrorToRequest(request, matter, { blockedOn: null, hold: null });
  if (work.hold && work.hold.party === "business") notifyRequester(request || work, {
    kind: "resumed", tone: "blue", icon: "play",
    title: `${(request || work).id} — back with Legal`,
    body: "Thanks — Legal has resumed work on your request and the clock is running again.",
  });
  return { ok: true };
}

// Delegate down the hierarchy — a Lead/Director hands the case to another owner.
// (RBAC gates the UI: junior ranks cannot reassign.)
export function reassignRequest(id, ownerId, byUserId, note) {
  const { request, matter, workSlice, work } = resolveWorking(id);
  if (!work) return { ok: false, error: "record not found" };
  if (!ownerId) return { ok: false, error: "choose an owner" };
  const now = nowIso();
  const log = (work.stageLog || []).map((s) => (s.exitedAt ? s : { ...s, owner: ownerId }));
  updateItem(workSlice, work.id, {
    owner: ownerId, stageLog: log,
    activity: [...(work.activity || []), { at: now, by: byUserId || null, action: `Reassigned to ${_nm(ownerId)}${note ? " — " + note : ""}` }],
  });
  mirrorToRequest(request, matter, { owner: ownerId });
  return { ok: true };
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
  ensurePeriodicFilings();
  return { ok: true };
}

/* ============================================================
   SPRINT 6 — the org architecture API (FRD Sections 2, 3, 9, 12, 13, 14).

   Everything below operates on the `modRequests` slice: one envelope shape
   for all eleven modules, with team-prefixed ids, timestamped stage logs,
   structured intra-dept holds, activity trails and cost lines.
   ============================================================ */

/* ---------------- session (View As) ---------------- */
export function getSession() { return state.session || { viewAsId: "u1" }; }
export function setSession(patch) {
  state = { ...state, session: { ...(state.session || {}), ...patch } };
  emit();
}
export function useSession() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state.session || { viewAsId: "u1" };
}

/* ---------------- master data (Section 2 — administrable) ---------------- */
export function getMasterData() { return state.masterData || {}; }
export function useMasterData() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state.masterData || {};
}
export function updateMasterList(key, items) {
  state = { ...state, masterData: { ...(state.masterData || {}), [key]: items } };
  emit();
}
export function resetMasterData() {
  state = { ...state, masterData: JSON.parse(JSON.stringify(MASTER_DATA_SEED)) };
  emit();
}

/* ---------------- notifications (Section 12) ---------------- */
// Deduped by id so sweeps can run every boot without stacking duplicates.
export function pushNotif(n) {
  if ((state.notifs || []).some((x) => x.id === n.id)) return false;
  state = { ...state, notifs: [{ time: nowIso(), unread: true, ...n }, ...(state.notifs || [])].slice(0, 80) };
  emit();
  return true;
}
export function markNotifsRead() {
  state = { ...state, notifs: (state.notifs || []).map((n) => ({ ...n, unread: false })) };
  emit();
}

// PRD §3.7 — the requester's notification trio (acknowledgement, status-change,
// delivery). Targets the requester directly and links to their tracking view.
// `rec` should be the request-bearing record (it carries requesterId).
function notifyRequester(rec, note) {
  const rid = rec && (rec.requesterId || rec.requester);
  if (!rid || String(rid).startsWith("RQ-")) return; // in-app requester only
  pushNotif({
    id: `req-${rec.id}-${note.kind}-${nowIso()}`,
    forUserId: rid,
    tone: note.tone || "blue",
    icon: note.icon || "inbox",
    title: note.title,
    body: note.body || "",
    to: "/my-requests",
  });
}
// Notify an internal user directly (approver callbacks, reassignment, etc.).
function notifyUser(uid, note) {
  if (!uid || String(uid).startsWith("RQ-")) return;
  pushNotif({
    id: `u-${uid}-${note.kind}-${note.ref || ""}-${nowIso()}`,
    forUserId: uid, tone: note.tone || "blue", icon: note.icon || "bell",
    title: note.title, body: note.body || "", to: note.to || null,
  });
}
// Plain-language status-change lines for the requester (no internal jargon).
const REQUESTER_STAGE_NOTE = {
  "Legal Review": "Your request is now under legal review.",
  "Drafting": "Legal has started drafting your document.",
  "Redlining": "Legal is marking up the document.",
  "Notice Drafting": "Legal is preparing the notice.",
  "Negotiation": "Your matter has moved to negotiation.",
  "Approval": "Your matter is awaiting internal approval.",
  "Signature": "Your matter is ready for signature.",
  "Notice Served": "The notice has been served.",
  "Executed": "Your matter has been executed.",
  "Repository": "Your matter has been filed and completed.",
  "Closed": "Your request has been closed.",
};
// The bell shows what is addressed to the active identity: direct, their
// department, or broadcast; the Department Head sees everything.
export function notifsFor(user) {
  return (state.notifs || []).filter((n) =>
    (user && user.rbac === "head") ||
    (!n.forUserId && !n.forDept) ||
    (n.forUserId && user && n.forUserId === user.id) ||
    (n.forDept && user && n.forDept === user.dept));
}

/* ---------------- id + assignment ---------------- */
export function nextModId(teamKey) {
  const prefix = teamPrefix(teamKey) + "-";
  const nums = (state.modRequests || [])
    .map((r) => String(r.id))
    .filter((s) => s.startsWith(prefix))
    .map((s) => parseInt(s.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0");
}

// Auto-assignment per team rules (Section 14.2 step 4): the least-loaded
// member of the receiving team. Deterministic, ties broken by user id.
export function autoAssign(teamKey) {
  const members = USERS.filter((u) => u.legalTeam === teamKey && u.rbac === "member");
  const pool = members.length ? members : USERS.filter((u) => u.legalTeam === teamKey);
  const load = (uid) => (state.modRequests || []).filter((r) => r.owner === uid && r.status !== "Closed").length;
  return pool.sort((a, b) => load(a.id) - load(b.id) || (a.id < b.id ? -1 : 1))[0] || null;
}

/* ---------------- raise (Section 14.2 — the single window) ---------------- */
export function raiseModuleRequest(payload = {}) {
  const def = moduleByKey(payload.moduleKey);
  const errors = [];
  if (!def) errors.push("moduleKey is required");
  if (!String(payload.title || "").trim()) errors.push("a short subject is required");
  if (def) {
    for (const f of def.fields) {
      if (f.request && f.required && !((payload.fields || {})[f.key])) errors.push(`${f.label} is required`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const id = nextModId(def.team);
  const now = nowIso();
  const by = payload.requestedById || null;
  const owner = payload.owner || (autoAssign(def.team) || {}).id || null;
  const path = workflowOf(def, { flow: payload.flow || "main" });

  const record = {
    id,
    moduleKey: def.key,
    flow: payload.flow || "main",
    title: String(payload.title).trim(),
    legalTeam: def.team,
    subType: payload.subType || null,
    requestingDept: payload.requestingDept || "Operations",
    requestedBy: payload.requestedBy || null,
    requestedById: by,
    entityId: payload.entityId || null,
    dateRaised: now,
    owner,
    stage: path[1] || path[0],           // Raised → auto-assigned on entry
    priority: payload.priority || "Normal",
    status: "Open",
    closedAt: null,
    driveLink: payload.driveLink || null,
    attachments: payload.attachments || [],
    versions: [],
    stageLog: [
      { stage: path[0], at: now, by },
      { stage: path[1] || path[0], at: now, by: null },
    ],
    holds: [],
    comments: [],
    activity: [
      { at: now, by, action: `Request raised${payload.requestedBy ? " by " + payload.requestedBy.name : ""} (${payload.requestingDept || "—"})` },
      { at: now, by: null, action: `Auto-assigned to ${(byId(owner) || {}).name || "queue"} per ${def.label} team rules` },
    ],
    costs: [],
    hearings: def.hearings ? [] : undefined,
    fields: payload.fields || {},
  };
  addItem("modRequests", record);

  // Section 12 — new request → assigned owner.
  pushNotif({
    id: "assign-" + id, forUserId: owner, tone: "blue", icon: "inbox",
    title: `${id} assigned to you — ${record.title}`, path: "/m/" + def.key + "/" + id,
  });
  return { ok: true, id, record };
}

/* ---------------- stage moves + risk gate ---------------- */
function stampActivity(rec, entry) {
  return { ...rec, activity: [...(rec.activity || []), entry] };
}

export function advanceStage(id, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const def = moduleByKey(rec.moduleKey);
  const path = workflowOf(def, rec);
  const idx = path.indexOf(rec.stage);
  if (idx < 0 || idx >= path.length - 1) return { ok: false, error: "already at the final stage" };
  if ((rec.holds || []).some((h) => !h.end)) return { ok: false, error: "on intra-dept hold — receive the file back before moving stage" };
  const next = path[idx + 1];
  // Section 4.2 — risk assessment must be signed off before submission.
  const missing = riskGateMissing(def, rec, next);
  if (missing.length) {
    const labels = missing.map((k) => (def.fields.find((f) => f.key === k) || { label: k }).label);
    return { ok: false, error: "Risk Assessment incomplete: " + labels.join(", ") + " required before " + next };
  }
  const now = nowIso();
  const closing = idx + 1 === path.length - 1;
  // PRD §4.7 — a matter cannot be closed without structured outcome capture.
  if (closing && !rec.outcome) return { ok: false, needsOutcome: true, next };
  let updated = {
    ...rec,
    stage: next,
    stageLog: [...(rec.stageLog || []), { stage: next, at: now, by }],
    status: closing ? "Closed" : rec.status,
    closedAt: closing ? now : rec.closedAt,
  };
  updated = stampActivity(updated, { at: now, by, action: `Stage moved to ${next}` });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  // Section 12 — stage change / closure → requesting department.
  pushNotif({
    id: `stage-${id}-${idx + 1}`, forDept: rec.requestingDept,
    tone: closing ? "green" : "blue", icon: closing ? "checkcircle" : "workflow",
    title: `${id} ${closing ? "closed" : "moved to " + next} — ${rec.title}`,
    path: "/m/" + rec.moduleKey + "/" + id,
  });
  return { ok: true, stage: next, closed: closing };
}

/* ============================================================
   R1.0 MODULE 2 — matter spine: privilege, risk rating, outcome capture
   ============================================================ */
export const PRIVILEGE_TIERS = ["Open", "Restricted", "Privileged"];
export const RISK_LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
export const RISK_IMPACTS = ["Minor", "Moderate", "Major", "Severe"];
// PRD §4.6 likelihood × impact → band (matter level).
const RISK_MATRIX = {
  Minor:    { Rare: "Low", Unlikely: "Low", Possible: "Low", Likely: "Low", "Almost Certain": "Medium" },
  Moderate: { Rare: "Low", Unlikely: "Low", Possible: "Medium", Likely: "Medium", "Almost Certain": "Medium" },
  Major:    { Rare: "Low", Unlikely: "Medium", Possible: "High", Likely: "Critical", "Almost Certain": "Critical" },
  Severe:   { Rare: "Medium", Unlikely: "High", Possible: "High", Likely: "Critical", "Almost Certain": "Critical" },
};
export function riskBand(impact, likelihood) { return ((RISK_MATRIX[impact] || {})[likelihood]) || null; }

const _modPatch = (id, patch, by, action) => {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const activity = action ? [...(rec.activity || []), { at: nowIso(), by: by || null, action }] : rec.activity;
  updateItem("modRequests", id, { ...patch, activity });
  return { ok: true };
};

// §7.2 privilege classification — a permissions-bearing field, not a label.
export function setModPrivilege(id, tier, namedAccess, by) {
  return _modPatch(id, { privilege: tier, namedAccess: namedAccess || [] }, by,
    `Privilege set to ${tier}${(namedAccess || []).length ? " (named: " + namedAccess.length + ")" : ""}`);
}
// §4.6 matter-level risk rating.
export function setModRisk(id, likelihood, impact, by) {
  const band = riskBand(impact, likelihood);
  return _modPatch(id, { riskLikelihood: likelihood, riskImpact: impact, riskBand: band }, by,
    `Risk rated ${band} (${likelihood} × ${impact})`);
}
// §4.7 close a matter with structured outcome (mandatory).
export function closeWithOutcome(id, outcome, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  if (!outcome || !outcome.category) return { ok: false, error: "an outcome category is required to close" };
  const def = moduleByKey(rec.moduleKey);
  const path = workflowOf(def, rec);
  const now = nowIso();
  const finalStage = path[path.length - 1];
  let updated = {
    ...rec, outcome: { ...outcome, closedBy: by || null, closedAt: now },
    stage: finalStage, status: "Closed", closedAt: now,
    stageLog: [...(rec.stageLog || []), { stage: finalStage, at: now, by }],
  };
  updated = stampActivity(updated, { at: now, by, action: `Closed — outcome: ${outcome.category}${outcome.positionAchieved ? " · position " + outcome.positionAchieved : ""}` });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  pushNotif({ id: `close-${id}`, forDept: rec.requestingDept, tone: "green", icon: "checkcircle",
    title: `${id} closed — ${rec.title}`, path: "/m/" + rec.moduleKey + "/" + id });
  return { ok: true, closed: true };
}

/* ---------------- intra-dept holds (Section 9) ---------------- */
export function startHold(id, { dept, reason }, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  if ((rec.holds || []).some((h) => !h.end)) return { ok: false, error: "already on hold" };
  if (!dept || !reason) return { ok: false, error: "department and hold reason are required" };
  const now = nowIso();
  const hold = { id: id + "-H" + ((rec.holds || []).length + 1), dept, sender: by, reason, start: now, end: null };
  let updated = { ...rec, holds: [...(rec.holds || []), hold] };
  updated = stampActivity(updated, { at: now, by, action: `TAT paused — shared with ${dept} (${reason})` });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true, hold };
}

export function endHold(id, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const open = (rec.holds || []).find((h) => !h.end);
  if (!open) return { ok: false, error: "no open hold" };
  const now = nowIso();
  let updated = { ...rec, holds: rec.holds.map((h) => (h === open ? { ...h, end: now } : h)) };
  updated = stampActivity(updated, { at: now, by, action: `TAT resumed — received back from ${open.dept}` });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true };
}

/* ---------------- field edits, hearings, costs ---------------- */
export function updateModFields(id, patch, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const def = moduleByKey(rec.moduleKey);
  const labels = Object.keys(patch).map((k) => ((def.fields || []).find((f) => f.key === k) || { label: k }).label);
  let updated = { ...rec, fields: { ...(rec.fields || {}), ...patch } };
  updated = stampActivity(updated, { at: nowIso(), by, action: `Updated ${labels.join(", ")}` });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true };
}

export function addHearing(id, hearing, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const h = { id: "H" + ((rec.hearings || []).length + 1), ...hearing };
  let updated = { ...rec, hearings: [...(rec.hearings || []), h] };
  updated = stampActivity(updated, { at: nowIso(), by, action: `Hearing logged — ${h.type || "hearing"}${h.nextDate ? ", next on " + String(h.nextDate).slice(0, 10) : ""}` });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true, hearing: h };
}

export function addModCost(id, cost, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const c = { id: id + "-C" + ((rec.costs || []).length + 1), ...cost };
  let updated = { ...rec, costs: [...(rec.costs || []), c] };
  updated = stampActivity(updated, { at: nowIso(), by, action: `Cost recorded — ${c.type} ${c.actual != null ? "actual" : "estimated"} ${c.currency} ${(c.actual != null ? c.actual : c.estimated) || 0}`, internal: true });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true, cost: c };
}

/* ---------------- auto-response for standard notices (Section 8.5.2) ---------------- */
export function generateAutoResponse(id, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const f = rec.fields || {};
  const tpl = (state.noticeTemplates || []).find((t) => t.category === f.category);
  if (!tpl) return { ok: false, error: `no standard template for "${f.category || "this category"}" — draft manually` };
  const text = tpl.template
    .replace(/\{\{sender\}\}/g, f.senderName || "Sir/Madam")
    .replace(/\{\{serialNo\}\}/g, f.serialNo || rec.id)
    .replace(/\{\{noticeDate\}\}/g, String(f.noticeDate || rec.dateRaised).slice(0, 10))
    .replace(/\{\{recipient\}\}/g, f.recipient || "the Company");
  let updated = { ...rec, fields: { ...f, autoResponseDraft: text } };
  updated = stampActivity(updated, { at: nowIso(), by, action: `Auto-response generated from the ${f.category} template — awaiting review`, internal: true });
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true, text };
}

/* ---------------- sweeps (Sections 5.2, 7.2, 9, 12) ----------------
   Run once on app boot. Every output is deduped — renewal triggers by a
   `renewalOf` marker, notifications by deterministic id — so booting twice
   never doubles anything. */
export function runOrgSweeps() {
  const DAYMS = 86400000;
  const now = Date.now();
  const daysUntil = (iso) => Math.ceil((new Date(iso) - now) / DAYMS);
  const created = [];

  // 1. License renewal triggers from the license REGISTER — system-generated
  //    30 days out, no manual tracking.
  const openRenewalFor = (licId) => (state.modRequests || []).some(
    (r) => r.moduleKey === "licenses" && r.status !== "Closed" &&
      ((r.fields || {}).linkedLicenseId === licId));
  for (const lic of state.licenses || []) {
    const s = licenseStatus(lic);
    if (s.days < 0 || s.days > 30) continue;
    if (openRenewalFor(lic.id)) continue;
    const res = raiseModuleRequest({
      moduleKey: "licenses",
      title: `${lic.name} renewal — ${lic.entity}`,
      subType: lic.type,
      requestingDept: "Operations",
      requestedBy: { name: "System", designation: "Renewal Trigger", contact: "legalos" },
      entityId: lic.entityId || null,
      fields: {
        licenseName: lic.name, authority: lic.authority,
        issueDate: lic.issueDate, renewalDue: lic.expiryDate,
        renewalStatus: "Trigger Raised", linkedLicenseId: lic.id,
      },
    });
    if (res.ok) {
      created.push(res.id);
      // Stamp the trigger provenance in the activity log.
      state = { ...state, modRequests: state.modRequests.map((r) => (r.id === res.id
        ? stampActivity(r, { at: nowIso(), by: null, action: "Renewal trigger generated automatically 30 days before Renewal Due Date" }) : r)) };
    }
  }

  // 2. Renewal reminders at 30 / 15 / 7 days (agreements, licenses, IP).
  for (const rec of state.modRequests || []) {
    const def = moduleByKey(rec.moduleKey);
    if (!def || !def.renewal) continue;
    const due = (rec.fields || {})[def.renewal.dueField];
    if (!due || rec.status === "Closed") continue;
    const days = daysUntil(due);
    for (const bucket of def.renewal.reminders || []) {
      if (days <= bucket && days > (bucket === 7 ? -1 : bucket === 15 ? 7 : 15)) {
        pushNotif({
          id: `rem-${rec.id}-${bucket}`, forUserId: rec.owner, tone: days <= 7 ? "red" : "amber", icon: "clock",
          title: `${rec.id} renewal due ${days >= 0 ? "in " + days + "d" : Math.abs(days) + "d ago"} — ${rec.title}`,
          path: "/m/" + rec.moduleKey + "/" + rec.id,
        });
        break;
      }
    }
  }

  // 3. SLA breach → team lead (Section 12).
  const leads = Object.fromEntries(USERS.filter((u) => u.rbac === "lead" && u.legalTeam).map((u) => [u.legalTeam, u.id]));
  for (const rec of state.modRequests || []) {
    if (rec.status === "Closed") continue;
    const t = tatV2(moduleByKey(rec.moduleKey), rec);
    if (t.status === "Overdue") {
      pushNotif({
        id: `sla-${rec.id}`, forUserId: leads[rec.legalTeam] || null, tone: "red", icon: "alertTriangle",
        title: `SLA breach on ${rec.id} — ${rec.title} (${t.reported}d net of holds)`,
        path: "/m/" + rec.moduleKey + "/" + rec.id,
      });
    }
  }

  // 4. Resolutions past sign-off but not yet on the tracker (Section 12).
  for (const rec of state.modRequests || []) {
    if (rec.moduleKey !== "resolutions" || rec.status === "Closed") continue;
    if (!/Finalize|Upload/.test(rec.stage) || (rec.fields || {}).uploadedToTracker) continue;
    pushNotif({
      id: `res-upload-${rec.id}`, forUserId: rec.owner, tone: "amber", icon: "upload",
      title: `${rec.id} finalized — confirm the Resolutions Tracker upload`,
      path: "/m/resolutions/" + rec.id,
    });
  }

  return { ok: true, renewalsCreated: created };
}

/* ---------------- Sprint 7: operational inputs ----------------
   The OS manages the inputs, not just the outputs: comments between the
   requester and the team, document attachments, owner reassignment, source-
   group edits, and the module-specific quick actions. */

function patchMod(id, fn) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return null;
  const updated = fn(rec);
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return updated;
}

// Two-way comments on a record. `internal: true` keeps a note team-side —
// excluded from the requester's view (Section 14.4).
export function postModComment(id, { text, internal = false }, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const clean = String(text || "").trim();
  if (!clean) return { ok: false, error: "empty comment" };
  const c = { id: id + "-M" + ((rec.comments || []).length + 1), at: nowIso(), by, text: clean, internal: !!internal };
  patchMod(id, (r) => ({ ...r, comments: [...(r.comments || []), c] }));
  // Route the ping to the other side of the conversation.
  const byUser = byId(by) || {};
  const fromLegal = byUser.dept === "Legal";
  if (!internal) {
    if (fromLegal) {
      pushNotif({
        id: "cmt-" + c.id, forDept: rec.requestingDept, tone: "blue", icon: "message",
        title: `${byUser.name || "Legal"} commented on ${id} — ${rec.title}`,
        path: "/m/" + rec.moduleKey + "/" + id,
      });
    } else {
      pushNotif({
        id: "cmt-" + c.id, forUserId: rec.owner, tone: "blue", icon: "message",
        title: `${byUser.name || "Requester"} replied on ${id} — ${rec.title}`,
        path: "/m/" + rec.moduleKey + "/" + id,
      });
    }
  }
  return { ok: true, comment: c };
}

// Attachments — metadata references (name/size/type), the storage seam stays
// marked. Requesters attach from their own-request view; legal from anywhere.
export function addModAttachment(id, file, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const att = {
    id: id + "-A" + ((rec.attachments || []).length + 1),
    name: file.name, size: file.size || 0, mime: file.type || "",
    at: nowIso(), by,
  };
  patchMod(id, (r) => stampActivity(
    { ...r, attachments: [...(r.attachments || []), att] },
    { at: att.at, by, action: `Document attached — ${att.name}` }
  ));
  const byUser = byId(by) || {};
  if (byUser.dept !== "Legal") {
    pushNotif({
      id: "att-" + att.id, forUserId: rec.owner, tone: "green", icon: "paperclip",
      title: `${byUser.name || "Requester"} attached ${att.name} on ${id}`,
      path: "/m/" + rec.moduleKey + "/" + id,
    });
  }
  return { ok: true, attachment: att };
}

export function removeModAttachment(id, attId, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const att = (rec.attachments || []).find((a) => a.id === attId);
  if (!att) return { ok: false, error: "attachment not found" };
  patchMod(id, (r) => stampActivity(
    { ...r, attachments: r.attachments.filter((a) => a.id !== attId) },
    { at: nowIso(), by, action: `Attachment removed — ${att.name}` }
  ));
  return { ok: true };
}

// Owner reassignment — leads and the head rebalance the queue.
export function reassignOwner(id, newOwner, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  if (rec.owner === newOwner) return { ok: false, error: "already the owner" };
  const from = personName(rec.owner);
  patchMod(id, (r) => stampActivity(
    { ...r, owner: newOwner },
    { at: nowIso(), by, action: `Reassigned from ${from} to ${personName(newOwner)}` }
  ));
  pushNotif({
    id: `assign-${id}-${newOwner}`, forUserId: newOwner, tone: "blue", icon: "inbox",
    title: `${id} reassigned to you — ${rec.title}`,
    path: "/m/" + rec.moduleKey + "/" + id,
  });
  return { ok: true };
}

export function setModPriority(id, priority, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec || rec.priority === priority) return { ok: false };
  patchMod(id, (r) => stampActivity({ ...r, priority }, { at: nowIso(), by, action: `Priority set to ${priority}` }));
  return { ok: true };
}

// Google Drive reference (Section 10, Phase 1) — a link, no data sync.
export function setModDriveLink(id, link, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const clean = String(link || "").trim() || null;
  if (clean === rec.driveLink) return { ok: true };
  patchMod(id, (r) => stampActivity({ ...r, driveLink: clean }, { at: nowIso(), by, action: clean ? "Drive reference linked" : "Drive reference removed" }));
  return { ok: true };
}

// Contracts — the draft version log (Section 4.1).
export function logModVersion(id, note, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  const last = (rec.versions || []).slice(-1)[0];
  const v = last ? (parseFloat(last.v) + 0.1).toFixed(1) : "0.1";
  patchMod(id, (r) => stampActivity(
    { ...r, versions: [...(r.versions || []), { v, at: nowIso(), by, note: String(note || "").trim() || "Draft updated" }] },
    { at: nowIso(), by, action: `Draft v${v} logged` }
  ));
  return { ok: true, v };
}

// Resolutions — confirm the tracker upload (Sections 6.2 / 12).
export function markResolutionUploaded(id, link, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec) return { ok: false, error: "record not found" };
  patchMod(id, (r) => stampActivity(
    { ...r, fields: { ...(r.fields || {}), uploadedToTracker: true, trackerUploadDate: nowIso(), trackerLink: link || (r.fields || {}).trackerLink || "" } },
    { at: nowIso(), by, action: "Confirmed upload to the Resolutions Tracker" }
  ));
  return { ok: true };
}

// Inspections — schedule the next cycle from the closed one (Section 8.6:
// labour is bi-annual, civil defence annual). Costs roll forward.
export function scheduleNextInspection(id, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec || rec.moduleKey !== "inspections") return { ok: false, error: "not an inspection" };
  const months = rec.subType === "Labour Department" ? 6 : 12;
  const f = rec.fields || {};
  const nextDate = new Date((f.inspectionDate ? new Date(f.inspectionDate) : new Date()).getTime());
  nextDate.setMonth(nextDate.getMonth() + months);
  const res = raiseModuleRequest({
    moduleKey: "inspections",
    title: `${rec.subType === "Labour Department" ? "Labour inspection" : "Civil Defence annual"} — ${f.office}`,
    subType: rec.subType,
    requestingDept: rec.requestingDept,
    requestedBy: { name: "System", designation: "Inspection cadence", contact: "legalos" },
    entityId: rec.entityId,
    owner: rec.owner,
    fields: {
      office: f.office,
      inspectionDate: nextDate.toISOString(),
      costCurrentYear: f.costForthcomingYear != null ? f.costForthcomingYear : f.costCurrentYear,
      costForthcomingYear: f.costForthcomingYear != null ? f.costForthcomingYear : f.costCurrentYear,
      costReduced: false,
    },
  });
  if (res.ok) {
    patchMod(res.id, (r) => stampActivity(r, { at: nowIso(), by, action: `Scheduled from ${id} on the ${months === 6 ? "bi-annual" : "annual"} cadence` }));
  }
  return res;
}

// The Counterparty / Entity Registry grows from inside the flow — selected on
// every module, never re-typed (Section 2).
export function addCompanyEntity({ name, type = "Counterparty", jurisdiction = "Pakistan", roles = [] }, by) {
  const clean = String(name || "").trim();
  if (!clean) return { ok: false, error: "name is required" };
  const dup = (state.companies || []).find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (dup) return { ok: true, id: dup.id, existed: true };
  const id = nextId("companies", "CO-");
  const jur = { "Saudi Arabia": "KSA", "Pakistan": "PK", "UAE": "UAE", "United Kingdom": "UK", "United States": "US", "Singapore": "SG" }[jurisdiction] || "PK";
  addItem("companies", { id, name: clean, aliases: [], jurisdiction, jur, type, roles, addedBy: by, createdAt: nowIso() });
  return { ok: true, id };
}

/* ---------------- Filing Module (Compliance) — Section 8 ----------------
   Periodic statutory filings are SYSTEM-GENERATED: the filing calendar per
   entity lives in the `filingSchedule` slice, and 30 days before the statutory
   due date the record is created automatically at "Filing Trigger" — nobody
   has to remember to raise it. Idempotent: safe to run on every boot. */
const FILING_LEAD_MS = 30 * 86400000;

export function ensurePeriodicFilings() {
  const sched = state.filingSchedule || [];
  if (!sched.length) return { created: [] };
  const now = Date.now();
  const created = [];
  let schedChanged = false;
  const nextSched = sched.map((row) => {
    if (row.active === false) return row;
    let due = new Date(row.nextDue).getTime();
    // Roll the calendar forward: once the filing for a due date is filed or
    // closed, the next cycle is due a year on.
    const filedFor = (d) => (state.modRequests || []).some((r) =>
      r.moduleKey === "filings" && r.entityId === row.entityId && r.subType === row.formType &&
      String((r.fields || {}).dueDate || "").slice(0, 10) === new Date(d).toISOString().slice(0, 10) &&
      ((r.fields || {}).filingDate || r.status === "Closed"));
    let rolled = row;
    while (filedFor(due)) {
      const d = new Date(due);
      d.setFullYear(d.getFullYear() + 1);
      due = d.getTime();
      rolled = { ...rolled, nextDue: new Date(due).toISOString() };
      schedChanged = true;
    }
    // Inside the 30-day window and no record exists yet → generate it.
    const exists = (state.modRequests || []).some((r) =>
      r.moduleKey === "filings" && r.entityId === rolled.entityId && r.subType === rolled.formType &&
      String((r.fields || {}).dueDate || "").slice(0, 10) === new Date(due).toISOString().slice(0, 10));
    if (!exists && due - now <= FILING_LEAD_MS && due - now > -365 * 86400000) {
      const daysLeft = Math.floor((due - now) / 86400000);
      const year = new Date(due).getFullYear();
      const res = raiseModuleRequest({
        moduleKey: "filings",
        flow: "periodic",
        title: `${rolled.formType.split(" — ")[0]} — ${entityName(rolled.entityId)} ${year}`,
        subType: rolled.formType,
        requestingDept: "Legal",
        requestedBy: { name: "System", designation: "Filing trigger — 30 days before due", contact: "legalos" },
        entityId: rolled.entityId,
        fields: {
          filingCategory: "Periodic (Annual)",
          dueDate: new Date(due).toISOString(),
          periodEnd: rolled.periodEnd || null,
          authorizedPerson: rolled.authorizedPerson || "",
        },
      });
      if (res.ok) {
        created.push(res.id);
        state = {
          ...state,
          modRequests: state.modRequests.map((r) => (r.id === res.id
            ? {
                ...r,
                activity: [...r.activity, { at: nowIso(), by: null, action: `System-generated ${daysLeft} days before the statutory due date (Filing Module 8.2)` }],
              }
            : r)),
        };
        pushNotif({
          id: "filing-trigger-" + res.id,
          forUserId: res.record.owner, tone: "amber", icon: "book",
          title: `${rolled.formType.split(" — ")[0]} for ${entityName(rolled.entityId)} generated — due in ${daysLeft} days`,
          path: "/m/filings/" + res.id,
        });
      }
    }
    return rolled;
  });
  if (schedChanged) state = { ...state, filingSchedule: nextSched };
  if (created.length || schedChanged) emit();
  return { created };
}

// Mark a filing as actually filed with SECP — stamps the date (and SRN), and
// moves the workflow to "Filed with SECP" in one step.
export function markFiled(id, { date, srn } = {}, by) {
  const rec = (state.modRequests || []).find((r) => r.id === id);
  if (!rec || rec.moduleKey !== "filings") return { ok: false, error: "not a filing" };
  const def = moduleByKey("filings");
  const path = workflowOf(def, rec);
  const target = "Filed with SECP";
  const at = nowIso();
  const filingDate = date || at;
  const idx = path.indexOf(target);
  const curIdx = path.indexOf(rec.stage);
  const moveStage = idx >= 0 && curIdx >= 0 && curIdx < idx;
  const updated = stampActivity(
    {
      ...rec,
      stage: moveStage ? target : rec.stage,
      stageLog: moveStage ? [...rec.stageLog, { stage: target, at, by }] : rec.stageLog,
      fields: { ...(rec.fields || {}), filingDate, ...(srn ? { srn } : {}) },
    },
    { at, by, action: `Filed with SECP on ${String(filingDate).slice(0, 10)}${srn ? " — SRN " + srn : ""}` }
  );
  state = { ...state, modRequests: state.modRequests.map((r) => (r.id === id ? updated : r)) };
  emit();
  return { ok: true };
}

// The filing calendar is maintainable from the register (Compliance only).
export function upsertFilingScheduleRow(row, by) {
  const list = state.filingSchedule || [];
  const key = (x) => x.entityId + "|" + x.formType;
  const exists = list.some((x) => key(x) === key(row));
  state = {
    ...state,
    filingSchedule: exists
      ? list.map((x) => (key(x) === key(row) ? { ...x, ...row } : x))
      : [...list, { ...row, active: row.active !== false }],
  };
  emit();
  // A calendar change may put a filing inside the 30-day window right away.
  ensurePeriodicFilings();
  return { ok: true };
}

export const useFilingSchedule = () => useCollection("filingSchedule");

/* ---------------- reads ---------------- */
export const modRequestById = (id) => (state.modRequests || []).find((r) => r.id === id) || null;
export const modRequestsFor = (moduleKey) => (state.modRequests || []).filter((r) => r.moduleKey === moduleKey);

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

/* ============================================================
   MODULE 2 — MATTER MANAGEMENT engine.
   The Matter is the permanent organising record of legal work. Everything here
   is validated, transition-checked, and appended to an immutable audit trail.
   ============================================================ */

/* ---------------- audit (Phase 24) ---------------- */
// Append-only. Never edited, never rewritten — every writer goes through this.
function auditMatter(m, entry) {
  return [...(m.audit || []), { at: nowIso(), ...entry }];
}
function patchMatter(id, patch, byUserId, auditEntry) {
  const m = (state.matters || []).find((x) => x.id === id);
  if (!m) return { ok: false, error: "matter not found" };
  updateItem("matters", id, {
    ...patch,
    updatedBy: byUserId || null, updatedAt: nowIso(),
    ...(auditEntry ? { audit: auditMatter(m, { by: byUserId || null, ...auditEntry }) } : {}),
  });
  return { ok: true, matter: { ...m, ...patch } };
}
export const matterById = (id) => (state.matters || []).find((m) => m.id === id) || null;

/* ---------------- Matter ID (Phase 2) ---------------- */
// [PracticeCode]-[Year]-[Seq], e.g. COM-2026-0148. Sequence is per code+year,
// derived from the store's own records — immutable, human-readable, sortable.
export function nextMatterId(practiceKey) {
  const code = practiceCode(practiceKey);
  const year = new Date().getFullYear();
  const prefix = `${code}-${year}-`;
  const nums = (state.matters || [])
    .map((m) => String(m.id))
    .filter((s) => s.startsWith(prefix))
    .map((s) => parseInt(s.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0");
}

/* ---------------- counterparty master (Phase 8) ---------------- */
// No free-text counterparties on matters: a matter references a master record.
// Duplicate prevention: names are normalised (case, punctuation, Ltd/LLC/Inc…)
// and checked against legal names, trading names AND aliases before creation.
export function findCounterparty(name) {
  const n = normalizeCpName(name);
  if (!n) return null;
  return (state.counterparties || []).find((c) =>
    normalizeCpName(c.legalName) === n ||
    (c.aliases || []).some((a) => normalizeCpName(a) === n) ||
    (c.tradingNames || []).some((a) => normalizeCpName(a) === n)) || null;
}
export function searchCounterparties(q) {
  const n = normalizeCpName(q);
  if (!n) return [];
  return (state.counterparties || []).filter((c) =>
    normalizeCpName(c.legalName).includes(n) ||
    (c.aliases || []).some((a) => normalizeCpName(a).includes(n)));
}
export function createCounterparty(payload = {}, byUserId) {
  const name = String(payload.legalName || "").trim();
  if (!name) return { ok: false, error: "a legal name is required" };
  const existing = findCounterparty(name);
  if (existing) return { ok: true, existed: true, counterparty: existing };
  const cp = {
    id: nextId("counterparties", "CP-"),
    legalName: name,
    tradingNames: payload.tradingNames || [],
    aliases: payload.aliases || [],
    jurisdiction: payload.jurisdiction || "—",
    registrationNo: payload.registrationNo || null,
    entityType: payload.entityType || "Company",
    relationship: payload.relationship || "Other",
    parentId: payload.parentId || null,
    entityRef: payload.entityRef || null,
    createdAt: nowIso(), createdBy: byUserId || null,
  };
  addItem("counterparties", cp);
  return { ok: true, existed: false, counterparty: cp };
}
export const counterpartyById = (id) => (state.counterparties || []).find((c) => c.id === id) || null;
export const counterpartyName = (id) => (counterpartyById(id) || {}).legalName || "—";
// The consolidated relationship view: everything tied to one counterparty.
export function counterpartyMatters(cpId) {
  return (state.matters || []).filter((m) => m.counterpartyId === cpId);
}

/* ---------------- create matter (Phases 2/7) ---------------- */
// Practice area → the legal team whose bench owns it.
const PRACTICE_TEAM = {
  commercial: "commercial", administrative: "commercial", advisory: "commercial",
  realestate: "commercial", corporate: "compliance", regulatory: "compliance",
  disputes: "litigation", ip: "litigation", employment: "litigation",
};
// Auto-assignment: the matter goes to the practice-area EXPERT first — the
// lawyer on the owning team with the most matters of this practice area
// (experience), ties broken by lightest open load. The Director is notified
// and can reassign (setMatterOwner is Lead/Director-gated in the UI).
export function suggestMatterOwner(practiceKey) {
  const team = PRACTICE_TEAM[practiceKey] || "commercial";
  const pool = USERS.filter((u) => u.legalTeam === team && (u.rbac === "member" || u.rbac === "lead"));
  if (!pool.length) return null;
  const expertise = (uid) => (state.matters || []).filter((m) => m.owner === uid && m.practiceArea === practiceKey).length;
  const load = (uid) => (state.matters || []).filter((m) => m.owner === uid && !isTerminal(m.status)).length;
  return pool.slice().sort((a, b) => expertise(b.id) - expertise(a.id) || load(a.id) - load(b.id) || (a.id < b.id ? -1 : 1))[0].id;
}
const M2_REQUIRED = ["name", "practiceArea", "matterType"];
export function createMatter(payload = {}, byUserId) {
  for (const k of M2_REQUIRED) if (!String(payload[k] || "").trim()) return { ok: false, error: `${k} is required` };
  // Expert-first auto-assignment when no owner is chosen explicitly.
  const autoAssigned = !payload.owner;
  if (autoAssigned) payload = { ...payload, owner: suggestMatterOwner(payload.practiceArea) };
  if (!payload.owner) return { ok: false, error: "owner is required" };
  if (!practiceArea(payload.practiceArea)) return { ok: false, error: "unknown practice area" };
  if (!matterTypesOf(payload.practiceArea).includes(payload.matterType)) return { ok: false, error: "matter type does not belong to the practice area" };
  if (payload.counterpartyId && !counterpartyById(payload.counterpartyId)) return { ok: false, error: "counterparty must reference the master registry" };
  const id = nextMatterId(payload.practiceArea);
  const now = nowIso();
  const proposal = proposeRisk(payload);
  const m = {
    id, name: payload.name.trim(),
    practiceArea: payload.practiceArea, matterType: payload.matterType,
    department: payload.department || "—",
    counterpartyId: payload.counterpartyId || null,
    owner: payload.owner, collaborators: (payload.collaborators || []).filter((u) => u !== payload.owner),
    status: "Open", openedAt: now, targetDate: payload.targetDate || null, closedAt: null,
    value: payload.value == null ? null : Number(payload.value),
    exposure: payload.exposure == null ? null : Number(payload.exposure),
    currency: payload.currency || "USD",
    risk2: { ...proposal, proposed: true },
    risk: proposal.severity.toLowerCase(), // legacy string face
    privilege: payload.privilege || "Open", namedAccess: payload.namedAccess || [],
    sourceRequestId: payload.sourceRequestId || null,
    relatedMatters: [], outcome: null,
    description: payload.description || null, businessContext: payload.businessContext || null,
    requesterId: payload.requesterId || null,
    audit: [
      { at: now, by: byUserId || null, kind: "created", detail: payload.sourceRequestId ? `Converted from ${payload.sourceRequestId}` : "Matter opened" },
      ...(autoAssigned ? [{ at: now, by: null, kind: "owner", from: "Unassigned", to: _nm(payload.owner), detail: `Auto-assigned to the ${practiceLabelOf(payload.practiceArea)} expert (experience + load) — the Director can reassign` }] : []),
    ],
    createdBy: byUserId || null, createdAt: now, updatedBy: byUserId || null, updatedAt: now,
    // legacy-compat so the spine / unified worklist keep working
    title: payload.name.trim(), type: "Contract", bu: payload.department || "—",
    opened: now, due: payload.targetDate || daysFromNow(14), progress: 5,
    priority: payload.priority || "medium", stage: "Legal Review",
    subdivision: payload.subdivision || "Commercial",
    entityId: payload.entityId || "CO-19", companyTags: payload.companyTags || [],
    requestId: payload.sourceRequestId || null,
  };
  addItem("matters", m);
  if (m.owner !== byUserId) notifyUser(m.owner, { kind: "matter-assign", ref: id, tone: "blue", icon: "folder", title: `${id} assigned to you${autoAssigned ? " (auto — practice-area expert)" : ""}`, body: m.name, to: "/matters/" + id });
  // The Director is told about every auto-assignment and can reassign.
  if (autoAssigned) USERS.filter((u) => u.rbac === "head").forEach((u) => notifyUser(u.id, {
    kind: "matter-auto", ref: id, tone: "purple", icon: "user",
    title: `${id} auto-assigned to ${_nm(m.owner)}`,
    body: `${m.name} — routed to the ${practiceLabelOf(m.practiceArea)} expert. Open the matter to reassign.`,
    to: "/matters/" + id,
  }));
  return { ok: true, id, matter: m };
}
const practiceLabelOf = (k) => (practiceArea(k) || { label: k }).label;

/* ---------------- request → matter conversion (Phase 1) ---------------- */
// Store-level duplicate guard + full carry-forward, so the lawyer never
// re-enters what the requester already gave.
export function convertRequestToMatter(requestId, overrides = {}, byUserId) {
  const r = (state.requests || []).find((x) => x.id === requestId);
  if (!r) return { ok: false, error: "request not found" };
  if (r.matterId && matterById(r.matterId)) return { ok: false, error: "already converted", existing: r.matterId };
  // counterparty: resolve the request's free-text name against the master,
  // creating a master record when it is genuinely new.
  let counterpartyId = overrides.counterpartyId || null;
  if (!counterpartyId && r.counterparty && r.counterparty !== "—") {
    const res = createCounterparty({ legalName: r.counterparty, relationship: "Customer" }, byUserId);
    if (res.ok) counterpartyId = res.counterparty.id;
  }
  const practice = overrides.practiceArea || CATEGORY_PRACTICE[r.category || r.proposedCategory] || "commercial";
  const created = createMatter({
    name: overrides.name || r.title,
    practiceArea: practice,
    matterType: overrides.matterType || matterTypesOf(practice)[0],
    department: r.department || r.dept || "—",
    counterpartyId,
    // Expert-first: unless the converter names an owner, the matter routes to
    // the practice-area expert (the request's owner becomes a collaborator).
    owner: overrides.owner || null,
    collaborators: overrides.collaborators || (r.owner ? [r.owner] : []),
    targetDate: overrides.targetDate || r.dueDate || null,
    value: overrides.value != null ? overrides.value : r.value,
    exposure: overrides.exposure != null ? overrides.exposure : null,
    currency: r.currency || "USD",
    privilege: overrides.privilege || "Open",
    description: r.description || null,
    businessContext: r.businessContext || null,
    requesterId: r.requesterId || null,
    sourceRequestId: r.id,
    priority: (r.priority || "medium").toLowerCase(),
    subdivision: r.subdivision, entityId: r.entityId, companyTags: r.companyTags || [],
  }, byUserId);
  if (!created.ok) return created;
  // Attachments carry forward: repository docs keyed to the request gain the
  // matter link so the matter's Documents tab shows them.
  (state.repository || []).filter((d) => d.requestId === r.id).forEach((d) => updateItem("repository", d.id, { matterId: created.id }));
  updateItem("requests", r.id, {
    matterId: created.id,
    activity: [...(r.activity || []), { at: nowIso(), by: byUserId || null, action: `Converted to matter ${created.id}` }],
  });
  return created;
}

/* ---------------- lifecycle (Phases 4/20) ---------------- */
export function setMatterStatus(id, to, byUserId, reason) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  const from = m.status;
  if (from === to) return { ok: false, error: "already " + to };
  if (!canTransition(from, to)) return { ok: false, error: `cannot move ${from} → ${to}` };
  if (TRANSITION_NEEDS_REASON.has(to) && !String(reason || "").trim()) return { ok: false, error: "a reason is required for " + to };
  if (to === "Closed") return closeMatter(id, m.outcome, byUserId); // closure goes through outcome validation
  const patch = { status: to };
  if (from === "Closed" && to === "Active") { patch.closedAt = null; patch.outcome = m.outcome; patch.progress = 90; } // explicit reopen, audited
  if (to === "Archived") patch.archivedAt = nowIso();
  return patchMatter(id, patch, byUserId, { kind: "status", from, to, reason: reason || null });
}

// Phase 19/20 — a matter CANNOT close without a validated outcome.
export function validateOutcome(outcome) {
  const missing = [];
  if (!outcome || !outcome.category) missing.push("outcome category");
  if (!outcome || !outcome.positionAchieved) missing.push("position achieved vs sought");
  if (outcome && outcome.externalCounsel) {
    if (outcome.externalCost == null || outcome.externalCost === "") missing.push("external counsel cost");
    if (!outcome.externalCurrency) missing.push("external counsel currency");
  }
  return missing;
}
export function closeMatter(id, outcome, byUserId) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  if (m.status === "Closed" || m.status === "Archived") return { ok: false, error: "matter is already closed" };
  if (!canTransition(m.status, "Closed")) return { ok: false, error: `cannot close from ${m.status}` };
  const missing = validateOutcome(outcome);
  if (missing.length) return { ok: false, error: "outcome incomplete", missing };
  const now = nowIso();
  const durationDays = matterAgeDays({ ...m, closedAt: now });
  return patchMatter(id, {
    status: "Closed", closedAt: now, progress: 100,
    outcome: { ...outcome, closedBy: byUserId || null, closedAt: now, durationDays },
    finalRisk: m.risk2 ? m.risk2.severity : null,
  }, byUserId, { kind: "closed", detail: `${outcome.category} · ${outcome.positionAchieved} · ${durationDays}d`, from: m.status, to: "Closed" });
}
export function reopenMatter(id, byUserId, reason) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  if (m.status !== "Closed") return { ok: false, error: "only a closed matter can be reopened" };
  if (!String(reason || "").trim()) return { ok: false, error: "a reason is required to reopen" };
  return patchMatter(id, { status: "Active", closedAt: null, progress: 90 }, byUserId, { kind: "reopened", from: "Closed", to: "Active", reason });
}

/* ---------------- risk (Phases 12/13) ---------------- */
// The severity is ALWAYS computed from likelihood × impact — never typed.
// Confirming values different from the system proposal is an override and
// requires a reason; both proposal and decision are audited.
export function assessMatterRisk(id, likelihood, impact, byUserId, reason) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  const severity = riskSeverity(likelihood, impact);
  if (!severity) return { ok: false, error: "pick a likelihood and an impact" };
  const prev = m.risk2 || null;
  const proposal = prev && prev.proposed ? prev : proposeRisk(m);
  const overridden = proposal && (proposal.likelihood !== likelihood || proposal.impact !== impact);
  if (overridden && !String(reason || "").trim()) return { ok: false, error: "an override reason is required — you are departing from the system proposal" };
  const risk2 = {
    likelihood, impact, severity, proposed: false,
    confirmedBy: byUserId || null, confirmedAt: nowIso(),
    ...(overridden ? { override: { from: { likelihood: proposal.likelihood, impact: proposal.impact, severity: proposal.severity }, reason: String(reason).trim() } } : {}),
  };
  return patchMatter(id, { risk2, risk: severity.toLowerCase() }, byUserId, {
    kind: "risk", from: prev ? `${prev.severity}${prev.proposed ? " (proposed)" : ""}` : "unrated", to: severity,
    reason: overridden ? String(reason).trim() : null,
  });
}

/* ---------------- privilege (Phase 14) ---------------- */
export function setMatterPrivilege(id, tier, namedAccess, byUserId) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  if (!["Open", "Restricted", "Privileged"].includes(tier)) return { ok: false, error: "unknown privilege tier" };
  return patchMatter(id, { privilege: tier, namedAccess: namedAccess || m.namedAccess || [] }, byUserId,
    { kind: "privilege", from: m.privilege || "Open", to: tier });
}

/* ---------------- people (Phase 15) ---------------- */
export function setMatterOwner(id, ownerId, byUserId) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  if (!ownerId) return { ok: false, error: "a matter must have exactly one responsible lawyer" };
  const res = patchMatter(id, { owner: ownerId, collaborators: (m.collaborators || []).filter((u) => u !== ownerId) }, byUserId,
    { kind: "owner", from: _nm(m.owner), to: _nm(ownerId) });
  if (res.ok && ownerId !== byUserId) notifyUser(ownerId, { kind: "matter-owner", ref: id, tone: "blue", icon: "folder", title: `${id} — you are now the responsible lawyer`, body: m.name, to: "/matters/" + id });
  return res;
}
export function setMatterCollaborators(id, ids, byUserId) {
  const m = matterById(id);
  if (!m) return { ok: false, error: "matter not found" };
  const clean = [...new Set(ids || [])].filter((u) => u && u !== m.owner);
  return patchMatter(id, { collaborators: clean }, byUserId,
    { kind: "collaborators", detail: clean.map(_nm).join(", ") || "none" });
}

/* ---------------- related matters (Phase 16) ---------------- */
export function linkMatters(aId, bId, relation, byUserId) {
  if (aId === bId) return { ok: false, error: "a matter cannot relate to itself" };
  const a = matterById(aId), b = matterById(bId);
  if (!a || !b) return { ok: false, error: "matter not found" };
  if ((a.relatedMatters || []).some((r) => r.id === bId)) return { ok: false, error: "already linked" };
  patchMatter(aId, { relatedMatters: [...(a.relatedMatters || []), { id: bId, relation: relation || "related" }] }, byUserId, { kind: "linked", detail: `→ ${bId}` });
  patchMatter(bId, { relatedMatters: [...(b.relatedMatters || []), { id: aId, relation: relation || "related" }] }, byUserId, { kind: "linked", detail: `→ ${aId}` });
  return { ok: true };
}
export function unlinkMatters(aId, bId, byUserId) {
  const a = matterById(aId), b = matterById(bId);
  if (!a || !b) return { ok: false, error: "matter not found" };
  patchMatter(aId, { relatedMatters: (a.relatedMatters || []).filter((r) => r.id !== bId) }, byUserId, { kind: "unlinked", detail: `× ${bId}` });
  patchMatter(bId, { relatedMatters: (b.relatedMatters || []).filter((r) => r.id !== aId) }, byUserId, { kind: "unlinked", detail: `× ${aId}` });
  return { ok: true };
}

/* ---------------- tasks (Phase 11) ---------------- */
// Every task has exactly one owner; duration is derived from system timestamps
// (createdAt → completedAt) and can never be typed.
export function addMatterTask(matterId, t = {}, byUserId) {
  const m = matterById(matterId);
  if (!m) return { ok: false, error: "matter not found" };
  if (!String(t.name || "").trim()) return { ok: false, error: "a task name is required" };
  if (!t.owner) return { ok: false, error: "every task needs exactly one owner" };
  const task = {
    id: nextId("matterTasks", "MT-"),
    matterId, name: t.name.trim(), description: t.description || "",
    owner: t.owner, due: t.due || null, status: "Not Started",
    dependsOn: t.dependsOn || null,
    createdAt: nowIso(), createdBy: byUserId || null, completedAt: null,
  };
  addItem("matterTasks", task);
  patchMatter(matterId, {}, byUserId, { kind: "task", detail: `Task created — ${task.name} (${_nm(task.owner)})` });
  if (task.owner !== byUserId) notifyUser(task.owner, { kind: "task", ref: task.id, tone: "blue", icon: "checksquare", title: `Task on ${matterId} — ${task.name}`, body: task.due ? "Due " + String(task.due).slice(0, 10) : "", to: "/matters/" + matterId });
  return { ok: true, task };
}
export function updateMatterTask(taskId, patch = {}, byUserId) {
  const t = (state.matterTasks || []).find((x) => x.id === taskId);
  if (!t) return { ok: false, error: "task not found" };
  // duration fields are system-owned
  delete patch.createdAt; delete patch.completedAt; delete patch.duration;
  updateItem("matterTasks", taskId, patch);
  return { ok: true };
}
export function setTaskStatus(taskId, status, byUserId) {
  const t = (state.matterTasks || []).find((x) => x.id === taskId);
  if (!t) return { ok: false, error: "task not found" };
  const patch = { status };
  if (status === "Completed") patch.completedAt = nowIso();
  else if (t.completedAt) patch.completedAt = null;
  updateItem("matterTasks", taskId, patch);
  if (status === "Completed") patchMatter(t.matterId, {}, byUserId, { kind: "task", detail: `Task completed — ${t.name}` });
  return { ok: true };
}
export const tasksForMatter = (matterId) => (state.matterTasks || []).filter((t) => t.matterId === matterId);

/* ============================================================
   MODULE 3 — CONTRACT INTELLIGENCE & TEMPLATE GENERATION engine.
   Assembly before generation. The clause library is the source of approved
   positions; deviations are detected, recorded and approval-routed; every
   AI-assisted step writes an immutable execution record. Retrieval is
   authorization-FIRST (filterVisible before any context is built).
   ============================================================ */

/* ---------------- clause library (Phases 2–5) ---------------- */
export const clauseById3 = (id) => (state.clauses3 || []).find((c) => c.id === id) || null;
export const publishedClauses = () => (state.clauses3 || []).filter((c) => c.status === "Published");
// Published clause for a type + jurisdiction (exact jurisdiction beats "Any").
export function findLibraryClause(type, jurisdiction) {
  const pub = publishedClauses().filter((c) => c.type === type);
  return pub.find((c) => c.jurisdiction === jurisdiction) || pub.find((c) => c.jurisdiction === "Any") || null;
}
export const clauseCurrentVersion = (c) => (c.versions || []).find((v) => v.v === c.currentVersion) || (c.versions || [])[0] || null;

function clauseAudit(c, entry, by) {
  return [...(c.audit || []), { at: nowIso(), by: by || null, ...entry }];
}
export function proposeClause(payload = {}, byUserId) {
  if (!payload.type || !String(payload.tiers && payload.tiers.Preferred || "").trim()) return { ok: false, error: "a clause type and a Preferred-tier text are required" };
  const c = {
    id: nextId("clauses3", "LIB-"),
    type: payload.type, agreementType: payload.agreementType || "Any",
    jurisdiction: payload.jurisdiction || "Any",
    risk: payload.risk || "Medium",
    approvalRequired: payload.approvalRequired || "Lead",
    status: "Proposed", currentVersion: 1,
    versions: [{ v: 1, tiers: { ...payload.tiers }, notes: payload.notes || "", guidance: payload.guidance || "", author: byUserId || null, reviewer: null, approvedBy: null, status: "Proposed", effectiveAt: null, supersededAt: null, changeSummary: payload.changeSummary || "Initial proposal" }],
    relatedClauses: payload.relatedClauses || [],
    createdBy: byUserId || null, createdAt: nowIso(), lastReviewedBy: null, lastReviewedAt: null,
    audit: [{ at: nowIso(), by: byUserId || null, kind: "proposed", detail: "Clause proposed" }],
  };
  addItem("clauses3", c);
  return { ok: true, id: c.id, clause: c };
}
const CLAUSE_ROLE_OK = (gate, viewer) => !gate
  || (gate === "lead" && (viewer.rbac === "lead" || viewer.rbac === "head"))
  || (gate === "head" && viewer.rbac === "head");
export function advanceClauseStatus(id, to, byUserId) {
  const c = clauseById3(id);
  if (!c) return { ok: false, error: "clause not found" };
  if (!(CLAUSE_FLOW[c.status] || []).includes(to)) return { ok: false, error: `cannot move ${c.status} → ${to}` };
  const viewer = byId(byUserId) || {};
  if (!CLAUSE_ROLE_OK(CLAUSE_GATE[to], viewer)) return { ok: false, error: `${to} requires ${CLAUSE_GATE[to] === "head" ? "the Director" : "a Lead or the Director"}` };
  const patch = { status: to, audit: clauseAudit(c, { kind: "status", from: c.status, to }, byUserId) };
  if (to === "Manager Review") { patch.lastReviewedBy = byUserId; patch.lastReviewedAt = nowIso(); }
  if (to === "Published") {
    patch.versions = (c.versions || []).map((v) => v.v === c.currentVersion ? { ...v, status: "Published", approvedBy: byUserId, effectiveAt: nowIso() } : v);
  }
  updateItem("clauses3", id, patch);
  return { ok: true };
}
// Versioning (Phase 4): history is never overwritten; drafts keep pointing at
// the exact version they used.
export function newClauseVersion(id, payload = {}, byUserId) {
  const c = clauseById3(id);
  if (!c) return { ok: false, error: "clause not found" };
  const viewer = byId(byUserId) || {};
  if (viewer.rbac !== "head") return { ok: false, error: "publishing a new version requires the Director" };
  const cur = clauseCurrentVersion(c);
  const v = {
    v: (c.versions || []).length + 1,
    tiers: { ...(cur ? cur.tiers : {}), ...(payload.tiers || {}) },
    notes: payload.notes != null ? payload.notes : (cur ? cur.notes : ""),
    guidance: payload.guidance != null ? payload.guidance : (cur ? cur.guidance : ""),
    author: byUserId, reviewer: byUserId, approvedBy: byUserId,
    status: "Published", effectiveAt: nowIso(), supersededAt: null,
    changeSummary: payload.changeSummary || "Revised position",
  };
  updateItem("clauses3", id, {
    versions: [...(c.versions || []).map((x) => x.v === c.currentVersion ? { ...x, status: "Superseded", supersededAt: nowIso() } : x), v],
    currentVersion: v.v, status: "Published",
    lastReviewedBy: byUserId, lastReviewedAt: nowIso(),
    audit: clauseAudit(c, { kind: "version", detail: `v${v.v} published — ${v.changeSummary}` }, byUserId),
  });
  return { ok: true, version: v.v };
}
export function retireClause(id, byUserId) {
  const c = clauseById3(id);
  if (!c) return { ok: false, error: "clause not found" };
  if ((byId(byUserId) || {}).rbac !== "head") return { ok: false, error: "retiring requires the Director" };
  updateItem("clauses3", id, { status: "Retired", audit: clauseAudit(c, { kind: "status", from: c.status, to: "Retired" }, byUserId) });
  return { ok: true };
}

/* Feedback loop (Phase 29): lawyers suggest; managers review; the Director
   publishes. The library is never silently rewritten. */
export function suggestClauseImprovement(clauseId, { tier, text, reason }, byUserId) {
  const c = clauseById3(clauseId);
  if (!c) return { ok: false, error: "clause not found" };
  if (!String(text || "").trim() || !String(reason || "").trim()) return { ok: false, error: "suggested text and a reason are required" };
  const s = { id: nextId("clauseSuggestions", "SG-"), clauseId, tier: tier || "Preferred", text: text.trim(), reason: reason.trim(), by: byUserId, at: nowIso(), status: "Proposed", agreementType: c.agreementType, jurisdiction: c.jurisdiction };
  addItem("clauseSuggestions", s);
  (USERS || []).filter((u) => u.rbac === "lead" && u.legalTeam).slice(0, 3).forEach((u) => notifyUser(u.id, { kind: "clause-suggestion", ref: s.id, tone: "purple", icon: "sparkles", title: `Clause improvement proposed — ${c.type}`, body: reason.slice(0, 120), to: "/clauses" }));
  return { ok: true, id: s.id };
}
export function reviewSuggestion(id, decision, byUserId) {
  const s = (state.clauseSuggestions || []).find((x) => x.id === id);
  if (!s) return { ok: false, error: "suggestion not found" };
  const viewer = byId(byUserId) || {};
  if (viewer.rbac !== "lead" && viewer.rbac !== "head") return { ok: false, error: "manager review requires a Lead or the Director" };
  updateItem("clauseSuggestions", id, { status: decision === "forward" ? "Manager Reviewed" : "Rejected", reviewedBy: byUserId, reviewedAt: nowIso() });
  return { ok: true };
}
export function publishSuggestion(id, byUserId) {
  const s = (state.clauseSuggestions || []).find((x) => x.id === id);
  if (!s) return { ok: false, error: "suggestion not found" };
  if ((byId(byUserId) || {}).rbac !== "head") return { ok: false, error: "publishing requires the Director" };
  if (s.status !== "Manager Reviewed") return { ok: false, error: "manager review comes first" };
  const res = newClauseVersion(s.clauseId, { tiers: { [s.tier]: s.text }, changeSummary: "From suggestion " + s.id + " — " + s.reason }, byUserId);
  if (!res.ok) return res;
  updateItem("clauseSuggestions", id, { status: "Published", publishedBy: byUserId, publishedAt: nowIso() });
  return { ok: true, version: res.version };
}

/* ---------------- AI execution audit (Phase 27) ---------------- */
function aiExec(rec) {
  const x = { id: nextId("aiAudit", "AIX-"), engine: "legalos-rules-v1", at: nowIso(), ...rec };
  addItem("aiAudit", x);
  return x.id;
}

/* ---------------- draft assembly (Phases 10–12) ---------------- */
const DEV_ESCALATE = { Low: "Medium", Medium: "High", High: "Critical", Critical: "Critical" };
export const draftById = (id) => (state.drafts3 || []).find((d) => d.id === id) || null;
export function createDraft(params = {}, byUserId) {
  const tpl = (state.templates3 || []).find((t) => t.agreementType === params.agreementType && t.status === "Published");
  if (!tpl) return { ok: false, error: "no approved template for " + (params.agreementType || "this agreement type") };
  if (!params.jurisdiction) return { ok: false, error: "jurisdiction is mandatory" };
  const cpName = params.counterpartyId ? counterpartyName(params.counterpartyId) : (params.counterpartyName || null);
  const def = TEMPLATE_DEFS.find((t) => t.key === tpl.key);
  const clauseRefs = [];
  const sections = def.sections
    .filter((s) => s.kind !== "conditional" || (params.features || []).includes(s.feature))
    .map((s) => {
      if (s.kind === "fixed") return { key: s.key, heading: s.heading, source: "fixed", text: s.text };
      if (s.kind === "generated") return { key: s.key, heading: s.heading, source: "generated", text: generateRecitals({ counterpartyName: cpName, ourRole: params.ourRole, agreementType: params.agreementType, jurisdiction: params.jurisdiction }) };
      if (s.kind === "input") return { key: s.key, heading: s.heading, source: "user-provided", text: `[${s.prompt} — to be completed by the business]`, prompt: s.prompt };
      // library / conditional-with-clause: ASSEMBLY — approved position or an
      // explicit gap. Never generated.
      const cl = findLibraryClause(s.clauseType, params.jurisdiction);
      if (!cl) return { key: s.key, heading: s.heading, source: "missing", clauseType: s.clauseType, text: "", note: `Source not found in LegalOS — no published ${s.clauseType} position for ${params.jurisdiction}.`, required: !!s.required };
      const cv = clauseCurrentVersion(cl);
      clauseRefs.push({ clauseId: cl.id, version: cl.currentVersion, tier: "Preferred", type: cl.type });
      return { key: s.key, heading: s.heading, source: "library", clauseType: s.clauseType, clauseId: cl.id, clauseVersion: cl.currentVersion, tier: "Preferred", libraryText: cv.tiers.Preferred, text: cv.tiers.Preferred, required: !!s.required };
    });
  const now = nowIso();
  const id = nextId("drafts3", "DRA-");
  const draft = {
    id, title: `${params.agreementType}${cpName ? " — " + cpName : ""}`,
    agreementType: params.agreementType, ourRole: params.ourRole || null,
    counterpartyId: params.counterpartyId || null, jurisdiction: params.jurisdiction,
    governingLaw: params.governingLaw || params.jurisdiction,
    valueBand: params.valueBand || null, term: params.term || null,
    features: params.features || [], matterId: params.matterId || null,
    templateId: tpl.id, templateVersion: tpl.version,
    status: "Draft", version: 1,
    versions: [{ v: 1, by: byUserId, at: now, note: "Assembled from approved template + library" }],
    sections, deviations: [],
    approvedBy: null, approvedAt: null, deliveredAt: null,
    createdBy: byUserId, createdAt: now, updatedBy: byUserId, updatedAt: now,
    audit: [{ at: now, by: byUserId, kind: "created", detail: `Assembled from ${tpl.id} v${tpl.version} · ${clauseRefs.length} library clauses` }],
  };
  draft.aiExecId = aiExec({ kind: "assembly", user: byUserId, draftId: id, matterId: params.matterId || null, jurisdiction: params.jurisdiction, inputs: { ...params }, clauseSources: clauseRefs, retrievedSources: [], output: `${sections.length} sections assembled` });
  addItem("drafts3", draft);
  return { ok: true, id, draft };
}

// Editing a library section = potential deviation (Phases 13–15). Never silent.
export function editDraftSection(draftId, sectionKey, text, byUserId) {
  const d = draftById(draftId);
  if (!d) return { ok: false, error: "draft not found" };
  const sec = (d.sections || []).find((s) => s.key === sectionKey);
  if (!sec) return { ok: false, error: "section not found" };
  const now = nowIso();
  let sections = d.sections, deviations = d.deviations || [], audit = d.audit || [];
  const others = deviations.filter((x) => x.sectionKey !== sectionKey);
  if (sec.clauseId) {
    const cl = clauseById3(sec.clauseId);
    const cv = (cl.versions || []).find((v) => v.v === sec.clauseVersion) || clauseCurrentVersion(cl);
    if (sameText(text, sec.libraryText)) {
      // reverted to the library position — deviation closes
      sections = sections.map((s) => s.key === sectionKey ? { ...s, text: sec.libraryText, source: "library", tier: "Preferred" } : s);
      deviations = [...others, ...deviations.filter((x) => x.sectionKey === sectionKey).map((x) => ({ ...x, status: "Reverted", resolvedBy: byUserId, resolvedAt: now }))];
      audit = [...audit, { at: now, by: byUserId, kind: "edit", detail: `${sec.heading} reverted to the library position` }];
    } else {
      const tierTo = Object.keys(cv.tiers || {}).find((t) => sameText(text, cv.tiers[t])) || "Custom";
      const custom = tierTo === "Custom";
      const risk = custom ? DEV_ESCALATE[cl.risk] || cl.risk : cl.risk;
      // Below-Fallback (custom) deviations need the Director; tier moves follow
      // the clause's own approval rule.
      const approvalRequired = custom ? "HoD" : tierTo === "Fallback" ? (cl.approvalRequired === "None" ? "Lead" : cl.approvalRequired) : cl.approvalRequired;
      const dev = {
        id: nextId("deviations3", "DEV-"), draftId, sectionKey, clauseId: cl.id, clauseVersion: sec.clauseVersion,
        clauseType: cl.type, originalTier: "Preferred", tierTo,
        originalText: sec.libraryText, currentText: text,
        gap: textGap(sec.libraryText, text), risk,
        recommendation: tierTo === "Acceptable" ? "Negotiate to Acceptable" : tierTo === "Fallback" ? "Negotiate to Fallback" : "Reject",
        approvalRequired, status: approvalRequired === "None" ? "Logged" : "Open",
        createdBy: byUserId, createdAt: now, resolvedBy: null, resolvedAt: null,
      };
      addItem("deviations3", dev);
      deviations = [...others.filter((x) => x.status !== "Reverted" || x.sectionKey !== sectionKey), dev];
      sections = sections.map((s) => s.key === sectionKey ? { ...s, text, source: "user-edited", tier: tierTo } : s);
      audit = [...audit, { at: now, by: byUserId, kind: "deviation", detail: `${sec.heading}: Preferred → ${tierTo} (${risk} risk${approvalRequired !== "None" ? " · " + approvalRequired + " approval required" : ""})` }];
    }
  } else {
    sections = sections.map((s) => s.key === sectionKey ? { ...s, text, source: s.source === "generated" ? "generated" : "user-provided", editedBy: byUserId, editedAt: now } : s);
    audit = [...audit, { at: now, by: byUserId, kind: "edit", detail: `${sec.heading} edited` }];
  }
  const patch = { sections, deviations, audit, updatedBy: byUserId, updatedAt: now };
  // Editing an approved document reopens review (Phase 33): new version, approval invalidated.
  if (d.status === "Approved" || d.status === "Delivered") {
    patch.status = "In Review"; patch.approvedBy = null; patch.approvedAt = null;
    patch.version = d.version + 1;
    patch.versions = [...(d.versions || []), { v: d.version + 1, by: byUserId, at: now, note: "Edited after approval — approval invalidated" }];
    patch.audit = [...patch.audit, { at: now, by: byUserId, kind: "status", from: d.status, to: "In Review", detail: "approval invalidated by post-approval edit" }];
  }
  updateItem("drafts3", draftId, patch);
  return { ok: true };
}
export function approveDeviation(devId, byUserId, decision = "Approved") {
  const dev = (state.deviations3 || []).find((x) => x.id === devId);
  if (!dev) return { ok: false, error: "deviation not found" };
  const viewer = byId(byUserId) || {};
  if (dev.approvalRequired === "HoD" && viewer.rbac !== "head") return { ok: false, error: "below-Fallback deviations require the Director" };
  if (dev.approvalRequired === "Lead" && !(viewer.rbac === "lead" || viewer.rbac === "head")) return { ok: false, error: "this deviation requires a Lead or the Director" };
  updateItem("deviations3", devId, { status: decision, resolvedBy: byUserId, resolvedAt: nowIso() });
  const d = draftById(dev.draftId);
  if (d) updateItem("drafts3", d.id, {
    deviations: (d.deviations || []).map((x) => x.id === devId ? { ...x, status: decision, resolvedBy: byUserId, resolvedAt: nowIso() } : x),
    audit: [...(d.audit || []), { at: nowIso(), by: byUserId, kind: "deviation-" + decision.toLowerCase(), detail: `${dev.clauseType} deviation ${decision.toLowerCase()}` }],
  });
  return { ok: true };
}
// The human review gate (Phase 28): explicit approval by a named lawyer; blocked
// while required deviation approvals are outstanding.
export function draftOutstanding(d) {
  return (d.deviations || []).filter((x) => x.approvalRequired !== "None" && x.status !== "Approved" && x.status !== "Reverted");
}
export function setDraftStatus(draftId, to, byUserId, note) {
  const d = draftById(draftId);
  if (!d) return { ok: false, error: "draft not found" };
  if (to === "Approved") {
    const out = draftOutstanding(d);
    if (out.length) return { ok: false, error: "approval blocked — deviations awaiting approval", outstanding: out.map((x) => x.id) };
    const missing = (d.sections || []).filter((s) => s.source === "missing" && s.required);
    if (missing.length) return { ok: false, error: "approval blocked — required sections have no approved source: " + missing.map((s) => s.heading).join(", ") };
    updateItem("drafts3", draftId, { status: "Approved", approvedBy: byUserId, approvedAt: nowIso(), audit: [...(d.audit || []), { at: nowIso(), by: byUserId, kind: "approved", detail: "Final output approved by " + _nm(byUserId) }] });
    return { ok: true };
  }
  if (to === "Delivered") {
    if (d.status !== "Approved") return { ok: false, error: "only the approved version can be delivered" };
    updateItem("drafts3", draftId, { status: "Delivered", deliveredAt: nowIso(), audit: [...(d.audit || []), { at: nowIso(), by: byUserId, kind: "delivered", detail: "Released for external delivery" }] });
    return { ok: true };
  }
  updateItem("drafts3", draftId, { status: to, audit: [...(d.audit || []), { at: nowIso(), by: byUserId, kind: "status", from: d.status, to, detail: note || null }] });
  return { ok: true };
}

/* ---------------- counterparty review (Phases 17–22) ---------------- */
export const reviewById3 = (id) => (state.reviews3 || []).find((r) => r.id === id) || null;
export function createContractReview(payload = {}, byUserId) {
  const now = nowIso();
  const id = nextId("reviews3", "CRV-");
  const base = {
    id, name: payload.name || "Counterparty draft", agreementType: payload.agreementType || null,
    jurisdiction: payload.jurisdiction || null, counterpartyId: payload.counterpartyId || null,
    matterId: payload.matterId || null, uploadedBy: byUserId, uploadedAt: now,
    decisions: {}, approvedBy: null, approvedAt: null,
    audit: [{ at: now, by: byUserId, kind: "created", detail: "Counterparty document uploaded" }],
  };
  const text = String(payload.text || "").trim();
  if (!text) {
    // honest extraction failure — never fabricate content (Phase 18)
    addItem("reviews3", { ...base, status: "Extraction Failed", findings: [], sourceText: null });
    return { ok: true, id, status: "Extraction Failed" };
  }
  const sections = splitSections(text);
  const seen = new Map();
  sections.forEach((s) => {
    const cls = classifyClauseText((s.heading ? s.heading + ". " : "") + s.text);
    if (!cls.type) return;
    const prev = seen.get(cls.type);
    if (!prev || cls.score > prev.cls.score) seen.set(cls.type, { s, cls });
  });
  let fidx = 0;
  const findings = [];
  seen.forEach(({ s, cls }, type) => {
    const lib = findLibraryClause(type, payload.jurisdiction);
    const f = {
      id: `F-${++fidx}`, clauseType: type,
      location: s.n ? `Section ${s.n}${s.heading ? " — " + s.heading : ""}` : (s.heading || "Unlocated"),
      actualText: s.text.slice(0, 600), confidence: cls.confidence,
    };
    if (!lib) {
      findings.push({ ...f, ourPosition: null, sourceNote: "Source not found in LegalOS — no published position for this clause type.", gap: null, risk: "Medium", recommendation: null, suggestedRedline: null, approvalRequired: "None", jurWarning: false });
      return;
    }
    const cv = clauseCurrentVersion(lib);
    const matchTier = Object.keys(cv.tiers || {}).find((t) => sameText(s.text, cv.tiers[t])) || null;
    const belowFallback = !matchTier;
    const risk = belowFallback ? DEV_ESCALATE[lib.risk] || lib.risk : lib.risk;
    findings.push({
      ...f,
      ourPosition: { clauseId: lib.id, version: lib.currentVersion, tier: "Preferred", text: cv.tiers.Preferred, approvedAt: cv.effectiveAt },
      tiers: cv.tiers,
      gap: matchTier ? (matchTier === "Preferred" ? null : { added: [], removed: [], changed: true, note: `Matches our ${matchTier} position, not Preferred.` }) : textGap(cv.tiers.Preferred, s.text),
      matchTier, risk,
      recommendation: matchTier === "Preferred" ? "Accept" : matchTier === "Acceptable" ? "Accept" : matchTier === "Fallback" ? "Negotiate to Acceptable" : (risk === "Critical" || risk === "High") ? "Negotiate to Acceptable" : "Negotiate to Acceptable",
      suggestedRedline: { text: cv.tiers.Preferred, source: "library", clauseId: lib.id, version: lib.currentVersion, tier: "Preferred" },
      approvalRequired: belowFallback ? "HoD" : matchTier === "Fallback" ? (lib.approvalRequired === "None" ? "Lead" : lib.approvalRequired) : "None",
      jurWarning: !!(lib.jurisdiction !== "Any" && payload.jurisdiction && lib.jurisdiction !== payload.jurisdiction),
    });
  });
  // Required clauses the counterparty paper is missing entirely.
  const tplDef = TEMPLATE_DEFS.find((t) => t.agreementType === payload.agreementType);
  if (tplDef) tplDef.sections.filter((s) => s.required && s.clauseType && !seen.has(s.clauseType)).forEach((s) => {
    const lib = findLibraryClause(s.clauseType, payload.jurisdiction);
    if (!lib) return;
    const cv = clauseCurrentVersion(lib);
    findings.push({
      id: `F-${++fidx}`, clauseType: s.clauseType, location: "Not present in document", actualText: null,
      confidence: "High", missing: true,
      ourPosition: { clauseId: lib.id, version: lib.currentVersion, tier: "Preferred", text: cv.tiers.Preferred },
      gap: { changed: true, note: "Clause is absent from the counterparty draft." },
      risk: lib.risk, recommendation: "Reject",
      suggestedRedline: { text: cv.tiers.Preferred, source: "library", clauseId: lib.id, version: lib.currentVersion, tier: "Preferred" },
      approvalRequired: "None", jurWarning: false,
    });
  });
  const rec = { ...base, status: "Findings", findings, sourceText: text };
  rec.aiExecId = aiExec({ kind: "review-extraction", user: byUserId, reviewId: id, matterId: payload.matterId || null, jurisdiction: payload.jurisdiction || null, inputs: { name: rec.name, chars: text.length }, clauseSources: findings.filter((f) => f.ourPosition).map((f) => ({ clauseId: f.ourPosition.clauseId, version: f.ourPosition.version })), retrievedSources: [], output: `${findings.length} findings` });
  addItem("reviews3", rec);
  return { ok: true, id, findings: findings.length };
}
export function decideFinding(reviewId, fid, { action, note }, byUserId) {
  const r = reviewById3(reviewId);
  if (!r) return { ok: false, error: "review not found" };
  const f = (r.findings || []).find((x) => x.id === fid);
  if (!f) return { ok: false, error: "finding not found" };
  const viewer = byId(byUserId) || {};
  if (action === "Accept" && f.approvalRequired === "HoD" && viewer.rbac !== "head") return { ok: false, error: "accepting a below-Fallback position requires the Director" };
  if (action === "Accept" && f.approvalRequired === "Lead" && !(viewer.rbac === "lead" || viewer.rbac === "head")) return { ok: false, error: "accepting this position requires a Lead or the Director" };
  updateItem("reviews3", reviewId, {
    decisions: { ...(r.decisions || {}), [fid]: { action, note: note || null, by: byUserId, at: nowIso() } },
    audit: [...(r.audit || []), { at: nowIso(), by: byUserId, kind: "decision", detail: `${f.clauseType}: ${action}` }],
  });
  return { ok: true };
}
export function approveReview(reviewId, byUserId) {
  const r = reviewById3(reviewId);
  if (!r) return { ok: false, error: "review not found" };
  const undecided = (r.findings || []).filter((f) => !(r.decisions || {})[f.id]);
  if (undecided.length) return { ok: false, error: "every finding needs a decision first", outstanding: undecided.map((f) => f.id) };
  updateItem("reviews3", reviewId, { status: "Approved", approvedBy: byUserId, approvedAt: nowIso(), audit: [...(r.audit || []), { at: nowIso(), by: byUserId, kind: "approved", detail: "Redline approved by " + _nm(byUserId) }] });
  return { ok: true };
}
export function deliverReview(reviewId, byUserId) {
  const r = reviewById3(reviewId);
  if (!r) return { ok: false, error: "review not found" };
  if (r.status !== "Approved") return { ok: false, error: "only an approved redline can be delivered" };
  updateItem("reviews3", reviewId, { status: "Redline Delivered", deliveredAt: nowIso(), audit: [...(r.audit || []), { at: nowIso(), by: byUserId, kind: "delivered", detail: "Redline released" }] });
  return { ok: true };
}

/* ---------------- precedent retrieval (Phases 23–25) ----------------
   AUTHORIZATION FIRST: sources are permission-filtered BEFORE any card is
   built — a privileged matter never appears in, or influences, retrieval. */
export function retrievePrecedent(viewer, { clauseType, counterpartyId, jurisdiction } = {}) {
  const visMatters = filterVisibleRef(viewer, state.matters || []);
  const visIds = new Set(visMatters.map((m) => m.id));
  const cards = [];
  visMatters.forEach((m) => {
    const o = m.outcome || {};
    const held = Array.isArray(o.held) && clauseType && o.held.includes(clauseType);
    const conceded = Array.isArray(o.conceded) && clauseType && o.conceded.includes(clauseType);
    if (held || conceded) cards.push({ kind: "MATTER", id: m.id, title: m.name || m.title, why: held ? `Position held on ${clauseType}` : `Conceded on ${clauseType} (${o.positionAchieved || "—"})`, to: "/matters/" + m.id, jurisdiction: m.jurisdiction || null });
    else if (counterpartyId && m.counterpartyId === counterpartyId) cards.push({ kind: "MATTER", id: m.id, title: m.name || m.title, why: `Same counterparty · ${m.status}`, to: "/matters/" + m.id, jurisdiction: m.jurisdiction || null });
  });
  (state.reviews3 || []).forEach((r) => {
    if (r.matterId && !visIds.has(r.matterId)) return; // privilege travels with the matter
    (r.findings || []).forEach((f) => {
      const dec = (r.decisions || {})[f.id];
      if (dec && clauseType && f.clauseType === clauseType) cards.push({ kind: "REVIEW", id: r.id, title: r.name, why: `Prior decision on ${clauseType}: ${dec.action}`, to: "/reviews", jurisdiction: r.jurisdiction || null });
    });
  });
  (state.deviations3 || []).forEach((dv) => {
    if (dv.status === "Approved" && clauseType && dv.clauseType === clauseType) {
      const d = draftById(dv.draftId);
      if (d && (!d.matterId || visIds.has(d.matterId))) cards.push({ kind: "DRAFT", id: d.id, title: d.title, why: `Approved deviation: Preferred → ${dv.tierTo}`, to: "/drafting/" + d.id, jurisdiction: d.jurisdiction || null });
    }
  });
  const seen = new Set();
  return cards.filter((c) => { const k = c.kind + c.id + c.why; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c) => ({ ...c, jurMismatch: !!(jurisdiction && c.jurisdiction && c.jurisdiction !== jurisdiction) }))
    .slice(0, 6);
}
// rbac import indirection (avoids a static import cycle: rbac ← store).
// SECURITY: the unbound default DENIES everything — retrieval can never run
// wider than the access layer just because wiring is missing.
let filterVisibleRef = () => [];
export function _bindRbac(fv) { filterVisibleRef = fv; }

// Boot-time pass: generate any periodic filings whose 30-day window has opened.
// Runs after every hydrate so the calendar is always acted on, never just read.
ensurePeriodicFilings();
