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
    functions: ["Lease / Loan / Service Agreements", "Resolutions & Authorization Letters", "Licenses"],
  },
];
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
};

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
export const RBAC_ROLES = {
  requester: {
    key: "requester", label: "Requester (business user)",
    raiseAny: true, viewOwn: "status", viewOwnTeam: false, viewOtherTeams: false,
  },
  member: {
    key: "member", label: "Legal Team Member",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: false,
  },
  lead: {
    key: "lead", label: "Legal Team Lead",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: false, slaReporting: true,
  },
  head: {
    key: "head", label: "Legal Department Head",
    raiseAny: true, viewOwn: "full", viewOwnTeam: true, viewOtherTeams: "aggregated", slaReporting: true,
  },
  bizHead: {
    key: "bizHead", label: "Business Department Head",
    raiseAny: true, viewOwn: "status", viewOwnDept: "status", viewOwnTeam: false, viewOtherTeams: false,
  },
};

// The published permission matrix (Section 14.3) — rendered in Settings.
export const PERMISSION_MATRIX = [
  { role: "Requester (business user)", raise: "Yes", own: "Yes (status only)", queue: "No", other: "No" },
  { role: "Legal Team Member", raise: "Yes", own: "Yes", queue: "Yes (own team)", other: "No" },
  { role: "Legal Team Lead", raise: "Yes", own: "Yes", queue: "Yes (own team) + SLA/TAT", other: "No" },
  { role: "Legal Department Head", raise: "Yes", own: "Yes", queue: "Yes (all teams)", other: "Yes (aggregated)" },
  { role: "Business Department Head", raise: "Yes", own: "Yes (own dept only)", queue: "No", other: "No" },
];
