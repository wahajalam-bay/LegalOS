// The organisation architecture — Functional Requirements Document, Section 1, 2 & 14.
// Three Legal teams, the master data registry (administrable in Settings), and the
// role / permission matrix. Pure data + pure functions: no React, unit-testable.

/* ---------------- Section 1 — the three Legal teams ---------------- */
export const LEGAL_TEAMS = [
  {
    key: "litigation",
    name: "Litigation & Dispute Management",
    short: "Litigation & Disputes",
    prefix: "LIT",
    tone: "red",
    icon: "gavel",
    functions: ["Case Handling", "Asset Recovery", "IP Portfolio"],
  },
  {
    key: "commercial",
    name: "Commercial & Risk Management",
    short: "Commercial & Risk",
    prefix: "CRM",
    tone: "blue",
    icon: "briefcase",
    functions: ["Contracts", "Commercial Risk Vetting"],
  },
  {
    key: "compliance",
    name: "Compliance",
    short: "Compliance",
    prefix: "CMP",
    tone: "amber",
    icon: "shield",
    functions: ["Lease / Loan / Service Agreements", "Resolutions & Authorization Letters", "Licenses", "SECP Filings"],
  },
];
// The curated pipeline bench (PRD §2 personas). Assignment / delegation pickers
// use THIS small set — one Lead per team plus a couple of reportees — instead of
// the whole department, so the pipeline stays legible (same bench as the View-As
// persona switcher, legal side only). The Director (u1/u2) is deliberately not an
// assignee: work is delegated DOWN the hierarchy, not up to the Director.
// THE CANONICAL ASSIGNABLE BENCH — exactly the legal credentials on the login
// screen (minus the Directors: work delegates DOWN, never up). Every assignment
// surface (triage, reassign, auto-routing, matter experts) draws from THIS list
// and nothing else, so a case can never be sent to someone who isn't a
// credentialed view in the system.
//   u3  Priya Nair    — Senior Manager · Commercial & Risk
//   u6  David Okonkwo — Senior Manager · Litigation & Disputes
//   u20 Noor Fatima   — Senior Manager · Compliance
//   u5  Sarah Chen    — Senior Associate · Commercial
//   u17 Ahmed Raza    — Senior Associate · Litigation
//   u9  Elena Popova  — Legal Associate · Commercial
//   u21 Hassan Ali    — Legal Associate · Compliance
//   u10 Yousef Nasser — Paralegal / Legal Executive
export const ASSIGNABLE_BENCH = ["u3", "u6", "u20", "u5", "u17", "u9", "u21", "u10"];
export const PIPELINE_BENCH = ASSIGNABLE_BENCH; // legacy alias

export const teamByKey = (key) => LEGAL_TEAMS.find((t) => t.key === key) || null;
export const teamName = (key) => (teamByKey(key) || {}).name || key || "—";
export const teamShort = (key) => (teamByKey(key) || {}).short || key || "—";
export const teamTone = (key) => (teamByKey(key) || {}).tone || "gray";
export const teamPrefix = (key) => (teamByKey(key) || {}).prefix || "REQ";

// Legacy sub-division → owning team, so every pre-existing record rolls up
// into the new architecture without touching the record itself.
export const SUBDIVISION_TEAM = {
  "Commercial": "commercial",
  "Litigation & Disputes": "litigation",
  "Compliance & Regulatory": "compliance",
  "IP": "litigation",
  "Labour/Employment": "litigation",
  "Corporate & Governance": "compliance",
  "Real Estate & Conveyancing": "commercial",
  "Data Privacy": "compliance",
};
export const teamOfSubdivision = (s) => SUBDIVISION_TEAM[s] || "commercial";

/* ---------------- Section 2 — master data (administrable) ----------------
   Configured once, reused across all modules. Each list item is { value, active }
   so Settings can add / edit / deactivate without deleting history. The seed
   below is what a fresh store gets; the live copy is the `masterData` slice. */
const L = (arr) => arr.map((value) => ({ value, active: true }));

export const MASTER_DATA_SEED = {
  requestingDepartments: L(["Finance", "Admin", "HR", "Acquisition", "Sales & Marketing", "Procurement", "Operations", "IT"]),
  contractTypes: L(["Sale & Purchase", "Agreement to Sell", "PPA", "IT Service Contract", "MEP Contract", "Construction Contract", "Service Agreement", "Other"]),
  // PPA Category is jurisdiction-dependent (Section 4.1).
  ppaCategoriesKsa: L(["Off-Plan Project", "Ready Project", "Advance-Fee Model Project"]),
  ppaCategoriesPk: L(["Medallion Model", "Non-Medallion Model"]),
  agreementTypes: L(["Lease Agreement", "Loan Agreement", "Service Agreement"]),
  resolutionTypes: L(["Board Resolution", "Partners Resolution"]),
  authorities: L(["SECP", "LESCO", "EPA", "Bank", "Customs", "Labour Department", "Civil Defence", "LDA / Municipality", "REGA", "ZATCA", "Ministry of Commerce", "IPO Pakistan", "Saudi Authority for IP"]),
  licenseTypes: L(["Trade License", "Commercial Registration", "Municipality License", "Broadcasting License", "Data License", "Real Estate Brokerage (FAL)"]),
  holdReasons: L(["Awaiting Documents", "Awaiting Approval", "Awaiting Clarification", "Awaiting Signature", "Other"]),
  noticeCategories: L(["Citizen Portal Notice", "Legal Notice", "Developer PPA", "Hearing Notice / Court Summons", "Defamation Notice", "IP Infringement", "Government Notice", "Private Notice"]),
  hearingTypes: L(["First hearing", "Arguments", "Evidence", "Cross-examination", "Final arguments"]),
  costTypes: L(["Internal Effort", "External Counsel Fee", "Filing & Government Fee", "Consultancy Fee", "Other"]),
  complaintTypes: L(["Against ZD-project vendors", "Against ex-employees", "Against ZD buyers"]),
  ipRequestTypes: L(["New Filing", "Renewal", "Infringement Action"]),
  // Section 8.6 — offices tracked for government inspections.
  inspectionOffices: L(["Zameen Media — Head Office", "Zameen Media — Square One Building", "Zameen Media — B64", "Zameen Media — New Auriga", "OLX", "Zameen Developments — Mega Tower", "Dubizzle — Mega Tower"]),
  // Filing Module (Compliance) 8.1 — configurable so new SECP forms can be
  // added in Settings without a dev cycle.
  secpFormTypes: L([
    "Form A — Annual Return",
    "Form 3 — Allotment of Shares",
    "Form 7 — Increase in Capital",
    "Form 9 — Registered Office Change",
    "Form 19 — Mortgage / Charge",
    "Form 29 — Directors & Officers Change",
    "Other",
  ]),
};

// Filing Module 8.1 — category drives the workflow: periodic filings are
// system-generated 30 days ahead; event-based ones arrive as requests.
export const FILING_CATEGORIES = ["Periodic (Annual)", "Event-Based"];
export const FILING_TRIGGER_LEAD_DAYS = 30;

// Read the active values of a master list (falls back to the seed so pure
// modules can be used without the store).
export function masterList(md, key) {
  const src = (md && md[key]) || MASTER_DATA_SEED[key] || [];
  return src.filter((x) => x && x.active !== false).map((x) => x.value);
}
export const MASTER_TABLES = [
  { key: "requestingDepartments", label: "Requesting Departments" },
  { key: "contractTypes", label: "Contract Types" },
  { key: "ppaCategoriesKsa", label: "PPA Categories — KSA model" },
  { key: "ppaCategoriesPk", label: "PPA Categories — Pakistan model" },
  { key: "agreementTypes", label: "Compliance Agreement Types" },
  { key: "resolutionTypes", label: "Resolution Types" },
  { key: "authorities", label: "Issuing / Regulatory Authorities" },
  { key: "licenseTypes", label: "License Types" },
  { key: "holdReasons", label: "Intra-Dept Hold Reasons" },
  { key: "noticeCategories", label: "Notice Categories" },
  { key: "hearingTypes", label: "Hearing Types" },
  { key: "costTypes", label: "Cost Types" },
  { key: "complaintTypes", label: "Police Complaint Types" },
  { key: "ipRequestTypes", label: "IP Request Types" },
  { key: "inspectionOffices", label: "Inspection Offices / Sites" },
  { key: "secpFormTypes", label: "SECP Form Types" },
];

/* ---------------- Section 2 — canonical workflow + TAT status ---------------- */
export const CANONICAL_WORKFLOW = [
  "Request Raised", "Assigned", "Drafting", "Internal Review",
  "Shared with Intra-Dept", "Final Review", "Submission / Execution", "Closed",
];
export const TAT_STATUSES_V2 = ["Running", "Paused", "Overdue", "Closed"];
export const TAT_TONE_V2 = { Running: "green", Paused: "blue", Overdue: "red", Closed: "gray" };

/* ---------------- Section 13 — cost attribution ---------------- */
export const COST_ATTRIBUTION = ["Legal operating budget", "Recharged to requesting department"];
export const COST_CURRENCIES = ["PKR", "USD"];

/* ---------------- Section 14 — roles & the permission matrix ----------------
   Raising and viewing are deliberately separate capabilities. Anyone can raise
   to any team; viewing is narrow and row-level. */
// The five personas (PRD §2). Each carries its capabilities and its landing
// view, so the whole app — landing, queues, approvals, config — obeys the role.
export const RBAC_ROLES = {
  requester: {
    key: "requester", label: "Requester", tone: "gray", landing: "/raise",
    raiseAny: true, viewOwn: "status", viewOwnTeam: false, viewOtherTeams: false,
    canApprove: false, config: false, privilegeAccess: false,
  },
  bizHead: {
    key: "bizHead", label: "Business Department Head", tone: "gray", landing: "/raise",
    raiseAny: true, viewOwn: "status", viewOwnDept: "status", viewOwnTeam: false, viewOtherTeams: false,
    canApprove: false, config: false, privilegeAccess: false,
  },
  paralegal: {
    key: "paralegal", label: "Paralegal / Legal Executive", tone: "blue", landing: "/requests",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: false,
    canApprove: false, config: false, privilegeAccess: false, register: true, drafting: true,
  },
  member: {
    key: "member", label: "AM / Associate", tone: "green", landing: "/requests",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: false,
    canApprove: false, config: false, privilegeAccess: "named", drafting: true, precedent: true, escalate: true,
  },
  lead: {
    key: "lead", label: "AD / Senior Manager", tone: "amber", landing: "/workspace",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: false, slaReporting: true,
    canApprove: "threshold", config: "propose", privilegeAccess: "named", reassign: true, triage: true,
    drafting: true, precedent: true,
  },
  head: {
    key: "head", label: "Director Legal", tone: "purple", landing: "/exec",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: "aggregated", slaReporting: true,
    canApprove: "all", config: true, privilegeAccess: true, reassign: true, triage: true, exportData: true,
    drafting: true, precedent: true,
  },
};

// The published permission matrix (PRD §7.3) — rendered in Settings.
export const PERMISSION_MATRIX = [
  { role: "Director Legal", raise: "Yes", own: "Full", queue: "All teams + SLA · approvals · config", other: "Aggregated + export" },
  { role: "AD / Senior Manager", raise: "Yes", own: "Full", queue: "Own portfolio + reassign + approve (threshold)", other: "No" },
  { role: "AM / Associate", raise: "Yes", own: "Full", queue: "Own + collaborating", other: "No" },
  { role: "Paralegal / Legal Executive", raise: "Yes", own: "Tasks + contract register", queue: "Assigned only · no privileged · no approval", other: "No" },
  { role: "Requester", raise: "Yes", own: "Status only (non-privileged)", queue: "No", other: "No" },
];
