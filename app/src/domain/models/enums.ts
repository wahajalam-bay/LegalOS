// Controlled vocabularies as const arrays → derived string-literal unions.
// (Arrays double as the source for dropdowns; the unions give compile-time safety.)

export const ROLES = [
  "director",          // Director Legal / HoD
  "adSeniorManager",   // AD / Senior Manager
  "managerAM",         // Manager / AM
  "seniorAssociate",   // Senior Associate / Associate
  "paralegal",         // Paralegal / Legal Executive
  "requester",         // Business requester
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  director: "Director Legal / HoD",
  adSeniorManager: "AD / Senior Manager",
  managerAM: "Manager / AM",
  seniorAssociate: "Senior Associate / Associate",
  paralegal: "Paralegal / Legal Executive",
  requester: "Requester",
};

export const JURISDICTIONS = ["PK", "KSA"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  PK: "Pakistan",
  KSA: "Saudi Arabia",
};

export const BUSINESS_URGENCIES = ["Routine", "Important", "Time-critical", "Emergency"] as const;
export type BusinessUrgency = (typeof BUSINESS_URGENCIES)[number];

// Legal-assigned priority. Per PRD §3.6 the SLA/TAT matrix is category × priority
// on the SAME four-level scale the requester uses for business urgency. Ordered
// most-urgent first.
export const PRIORITIES = ["Emergency", "Time-critical", "Important", "Routine"] as const;
export type Priority = (typeof PRIORITIES)[number];

// The internal legal categorisation Legal assigns during triage (PRD §3.3).
export const LEGAL_CATEGORIES = [
  "NDA",
  "Contract Review — Standard",
  "Contract Review — Complex / High Value",
  "Contract Drafting — From Template",
  "Contract Drafting — Complex / High Value",
  "Amendment",
  "Renewal",
  "Termination",
  "Legal Opinion — Simple/Narrow",
  "Legal Opinion — Complex",
  "Regulatory / Compliance",
  "Dispute — Initial Assessment",
  "IP Filing",
  "Triage Required",
] as const;
export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

// The request lifecycle (PRD §3.5). "Converted to Matter" is a terminal branch.
export const REQUEST_STATUSES = [
  "Submitted",
  "Categorised",
  "Assigned",
  "In Progress",
  "Awaiting Requester",
  "Awaiting Approval",
  "Delivered",
  "Closed",
  "Converted to Matter",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Statuses in which the SLA clock is paused (requester waiting time is not Legal's). */
export const CLOCK_PAUSED_STATUSES: readonly RequestStatus[] = ["Awaiting Requester"];

/** Terminal statuses — the clock stops and the request leaves active workload. */
export const TERMINAL_STATUSES: readonly RequestStatus[] = ["Delivered", "Closed", "Converted to Matter"];
