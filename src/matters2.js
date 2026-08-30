// MODULE 2 — MATTER MANAGEMENT: the pure model layer.
//
// The Matter is the permanent organising record of legal work. This module is
// deliberately pure data + pure functions (no React, no store import) in the
// same style as modules.js: the taxonomy, the lifecycle state machine, the
// likelihood × impact risk matrix, aging bands, and the id scheme. store.js
// implements the persistence/engine on top of this; the pages render it.

/* ============================================================
   PHASE 3 — TAXONOMY  (Practice Area → Matter Type)
   Centralised here so it is never duplicated across components.
   `code` drives the Matter ID prefix: COM-2026-0147.
   ============================================================ */
export const PRACTICE_AREAS = [
  { key: "commercial", code: "COM", label: "Commercial", icon: "briefcase", tone: "blue",
    types: ["Customer / Service agreement", "Partnership / JV"] },
  { key: "administrative", code: "ADM", label: "Administrative", icon: "clipboard", tone: "gray",
    types: ["Supplier / vendor agreement", "Marketing / sponsorship", "SaaS / technology agreement"] },
  { key: "corporate", code: "COR", label: "Corporate", icon: "building", tone: "indigo",
    types: ["Entity formation", "Corporate restructuring", "Board / governance", "Shareholder matters", "Licensing & permits"] },
  { key: "employment", code: "EMP", label: "Employment", icon: "users", tone: "green",
    types: ["Employment agreement", "Termination / settlement", "Policy development", "Employment dispute", "Immigration / visa"] },
  { key: "regulatory", code: "REG", label: "Regulatory & Compliance", icon: "shield", tone: "amber",
    types: ["Regulatory filing", "Regulatory inquiry", "Licensing application", "Compliance assessment", "Data protection"] },
  { key: "disputes", code: "DIS", label: "Disputes", icon: "gavel", tone: "red",
    types: ["Pre-action / legal notices", "Litigation", "Arbitration", "Mediation", "Regulatory enforcement", "Debt recovery"] },
  { key: "ip", code: "IP", label: "Intellectual Property", icon: "tag", tone: "purple",
    types: ["Trade mark", "Copyright", "Domain", "IP licensing", "IP enforcement"] },
  { key: "realestate", code: "RE", label: "Real Estate", icon: "home", tone: "amber",
    types: ["Lease (as tenant)", "Lease (as landlord)", "Property acquisition / disposal", "Property regulatory"] },
  { key: "advisory", code: "ADV", label: "Advisory", icon: "help", tone: "blue",
    types: ["Legal opinion", "Risk assessment", "Training / awareness", "Policy advice"] },
];
export const practiceArea = (key) => PRACTICE_AREAS.find((p) => p.key === key) || null;
export const practiceAreaByCode = (code) => PRACTICE_AREAS.find((p) => p.code === code) || null;
export const practiceLabel = (key) => (practiceArea(key) || {}).label || key || "—";
export const practiceCode = (key) => (practiceArea(key) || {}).code || "GEN";
export const practiceTone = (key) => (practiceArea(key) || {}).tone || "gray";
export const practiceIcon = (key) => (practiceArea(key) || {}).icon || "folder";
export const matterTypesOf = (key) => (practiceArea(key) || {}).types || [];

// Module 1 category → the practice area a converted matter defaults into.
export const CATEGORY_PRACTICE = {
  "Contract Drafting / Review": "commercial",
  "Amendment / Renewal / Termination": "commercial",
  "Legal Opinion / Advisory": "advisory",
  "Dispute / Litigation": "disputes",
  "Regulatory / Compliance": "regulatory",
  "IP": "ip",
  "Triage required": "advisory",
};

/* ============================================================
   PHASE 4 — LIFECYCLE  (a real state machine, not free statuses)
   ============================================================ */
export const MATTER_STATUSES = [
  "Open", "Active", "On Hold", "Awaiting External", "Substantively Complete", "Closed", "Archived",
];
// Valid transitions. "Substantively Complete" stops the active clock; Closed
// requires an outcome (enforced by the store); Archived never silently returns
// to an active state (only explicit reopen → Active, audited).
export const MATTER_TRANSITIONS = {
  "Open":                    ["Active", "On Hold", "Closed"],
  "Active":                  ["On Hold", "Awaiting External", "Substantively Complete", "Closed"],
  "On Hold":                 ["Active", "Awaiting External", "Closed"],
  "Awaiting External":       ["Active", "On Hold", "Substantively Complete"],
  "Substantively Complete":  ["Active", "Closed"],
  "Closed":                  ["Archived", "Active"],   // Active = explicit reopen, audited
  "Archived":                [],                        // terminal; restore is a deliberate store action
};
export const canTransition = (from, to) => (MATTER_TRANSITIONS[from] || []).includes(to);
// Transitions that REQUIRE a reason in the audit trail.
export const TRANSITION_NEEDS_REASON = new Set(["On Hold", "Awaiting External", "Archived"]);
export const MATTER_STATUS_TONE = {
  "Open": "blue", "Active": "green", "On Hold": "amber", "Awaiting External": "purple",
  "Substantively Complete": "indigo", "Closed": "gray", "Archived": "gray",
};
// States where the active TAT / workload clock is stopped.
export const CLOCK_STOPPED = new Set(["Substantively Complete", "Closed", "Archived"]);
export const isTerminal = (s) => s === "Closed" || s === "Archived";

/* ============================================================
   PHASE 12 — RISK  (Likelihood × Impact → severity, system-computed)
   ============================================================ */
export const LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
export const IMPACTS = ["Minor", "Moderate", "Major", "Critical"];
// impact → likelihood → severity (exactly the Aug-2026 PRD §4.6 matrix)
const RISK_MATRIX = {
  Minor:    { Rare: "Low",    Unlikely: "Low",    Possible: "Low",    Likely: "Low",      "Almost Certain": "Medium" },
  Moderate: { Rare: "Low",    Unlikely: "Low",    Possible: "Medium", Likely: "Medium",   "Almost Certain": "Medium" },
  Major:    { Rare: "Low",    Unlikely: "Medium", Possible: "High",   Likely: "Critical", "Almost Certain": "Critical" },
  Critical: { Rare: "Medium", Unlikely: "High",   Possible: "High",   Likely: "Critical", "Almost Certain": "Critical" },
};
export function riskSeverity(likelihood, impact) {
  const row = RISK_MATRIX[impact];
  return (row && row[likelihood]) || null;
}
export const RISK_TONE = { Low: "gray", Medium: "blue", High: "amber", Critical: "red" };

// PHASE 13 — the rule-based SYSTEM PROPOSAL (deliberately simple, clearly
// labelled "system proposed" in the UI; a human confirms or overrides with a
// reason, and both are audited).
export function proposeRisk(m = {}) {
  const exposure = Number(m.exposure || m.estimatedExposure || 0);
  const area = m.practiceArea;
  let impact = "Moderate";
  if (exposure >= 5000000) impact = "Critical";
  else if (exposure >= 1000000) impact = "Major";
  else if (exposure < 100000 && exposure > 0) impact = "Minor";
  let likelihood = "Possible";
  if (area === "disputes" || /dispute|litigation|enforcement/i.test(m.matterType || "")) likelihood = "Likely";
  if (area === "regulatory" || /inquiry|enforcement/i.test(m.matterType || "")) { likelihood = "Likely"; if (impact === "Minor") impact = "Moderate"; }
  if (area === "advisory") likelihood = "Unlikely";
  const severity = riskSeverity(likelihood, impact);
  const basis = [
    exposure ? `exposure ${Math.round(exposure / 1000)}k` : "no stated exposure",
    practiceLabel(area).toLowerCase(),
  ].join(" · ");
  return { likelihood, impact, severity, basis };
}

/* ============================================================
   PHASES 19/21/22 — OUTCOME, AGEING, TARGET DATE
   ============================================================ */
export const OUTCOME_CATEGORIES = ["Completed as requested", "Completed with modifications", "Withdrawn by business", "Settled", "Determined"];
export const POSITION_LEVELS = ["Full", "Substantial", "Partial", "Minimal", "None"];
// §4.7 — positions conceded/held are multi-selects from the playbook clause
// list (§5.2 clause types), so outcomes aggregate by clause across matters.
export const CLAUSE_TYPES = [
  "Confidentiality", "Limitation of liability", "Indemnity", "Termination",
  "Governing law", "IP ownership", "Data protection", "Force majeure",
  "Assignment", "Dispute resolution", "Severability", "Non-solicit",
  "Relationship between the parties", "Renewal", "Payment terms", "Exclusivity",
];

// Age in whole days: opened → now, or opened → closed once closed.
export function matterAgeDays(m = {}, now = new Date()) {
  const start = m.openedAt || m.opened || m.created;
  if (!start) return 0;
  const end = m.closedAt ? new Date(m.closedAt) : now;
  return Math.max(0, Math.floor((end - new Date(start)) / 86400000));
}
export const AGE_BANDS = [
  { key: "0-7", label: "0–7 days", max: 7 },
  { key: "8-30", label: "8–30 days", max: 30 },
  { key: "31-60", label: "31–60 days", max: 60 },
  { key: "61-90", label: "61–90 days", max: 90 },
  { key: "90+", label: "90+ days", max: Infinity },
];
export const ageBandOf = (days) => AGE_BANDS.find((b) => days <= b.max) || AGE_BANDS[AGE_BANDS.length - 1];

// Target-date verdict (label + icon, never colour alone). Distinct from the
// Module 1 request SLA.
export function targetVerdict(m = {}, now = new Date()) {
  if (isTerminal(m.status) || m.status === "Substantively Complete")
    return { key: "Completed", tone: "green", icon: "checkcircle", label: "Completed" };
  const target = m.targetDate || m.due; // legacy matters carry `due`
  if (!target) return { key: "None", tone: "gray", icon: "minus", label: "No target" };
  const days = Math.ceil((new Date(target) - now) / 86400000);
  if (days < 0) return { key: "Overdue", tone: "red", icon: "alertTriangle", label: `Overdue ${-days}d` };
  if (days <= 5) return { key: "Due soon", tone: "amber", icon: "clock", label: `Due in ${days}d` };
  return { key: "On track", tone: "green", icon: "check", label: `On track · ${days}d` };
}

/* ============================================================
   PHASE 11 — TASKS
   ============================================================ */
export const TASK_STATUSES = ["Not Started", "In Progress", "Blocked", "Completed", "Cancelled"];
export const TASK_TONE = { "Not Started": "gray", "In Progress": "blue", "Blocked": "red", "Completed": "green", "Cancelled": "gray" };
export const taskOpen = (t) => t && t.status !== "Completed" && t.status !== "Cancelled";

/* ============================================================
   PHASE 8 — COUNTERPARTY MASTER
   ============================================================ */
export const CP_RELATIONSHIPS = ["Customer", "Supplier", "Partner", "Other"];
export const CP_ENTITY_TYPES = ["Company", "LLC", "Government body", "Individual", "Partnership", "Non-profit", "Other"];
// Normalise a legal name for duplicate detection: case, punctuation and the
// usual suffixes (Ltd/Limited/LLC/Inc/Co/FZE/…). "Acme Ltd" ≡ "ACME Limited".
export function normalizeCpName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.,'’&()-]/g, " ")
    .replace(/\b(ltd|limited|llc|l\.l\.c|inc|incorporated|co|company|corp|corporation|plc|fze|fzco|llp|gmbh|sa|pvt|private|holdings?|group)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
