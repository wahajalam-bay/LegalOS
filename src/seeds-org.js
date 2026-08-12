// Seed records for the org-architecture modules (Sprint 6). All fictional, but
// written to read authentically for corporate real-estate legal across KSA and
// Pakistan. Dates are relative to "today" so TAT clocks always look alive.
import { MODULES, moduleByKey, workflowOf } from "./modules.js";
import { teamPrefix } from "./org.js";

const DAY = 86400000;
const d = (n) => new Date(Date.now() + n * DAY).toISOString();

let seq = { LIT: 0, CRM: 0, CMP: 0 };
export function resetSeedSeq() { seq = { LIT: 0, CRM: 0, CMP: 0 }; }

/* Factory: builds the full common-field envelope (FRD Section 3) around each
   record — team-prefixed id, stage log walked from `raisedDaysAgo` to the
   current stage, holds, an activity trail derived from both, and cost lines. */
function mk(moduleKey, o) {
  const def = moduleByKey(moduleKey);
  const prefix = teamPrefix(def.team);
  const id = `${prefix}-${String(++seq[prefix]).padStart(4, "0")}`;
  const flow = o.flow || "main";
  const path = workflowOf(def, { flow });
  const idx = Math.max(0, path.indexOf(o.stage != null ? o.stage : path[1]));
  const t0 = -(o.raisedDaysAgo != null ? o.raisedDaysAgo : 10);
  const pace = o.pace != null ? o.pace : Math.max(1, Math.floor(-t0 / (idx + 2)));
  const closed = o.closed || idx === path.length - 1;

  const stageLog = [];
  for (let i = 0; i <= idx; i++) {
    stageLog.push({ stage: path[i], at: d(t0 + i * pace), by: i === 0 ? (o.requestedById || o.owner) : (o.assignedBy || o.owner) });
  }

  const holds = (o.holds || []).map((h, i) => ({
    id: id + "-H" + (i + 1),
    dept: h.dept, sender: h.sender || o.owner, reason: h.reason,
    start: d(-h.startDaysAgo), end: h.endDaysAgo != null ? d(-h.endDaysAgo) : null,
  }));

  // Activity log — who did what, and when (Section 3), derived so it always
  // matches the stage history and hold trail exactly.
  const activity = [
    { at: stageLog[0].at, by: o.requestedById || o.owner, action: `Request raised by ${o.requestedBy ? o.requestedBy.name : "requester"} (${o.requestingDept})` },
    ...stageLog.slice(1).map((s) => ({ at: s.at, by: s.by, action: `Stage moved to ${s.stage}` })),
    ...holds.flatMap((h) => [
      { at: h.start, by: h.sender, action: `TAT paused — shared with ${h.dept} (${h.reason})` },
      ...(h.end ? [{ at: h.end, by: h.sender, action: `TAT resumed — received back from ${h.dept}` }] : []),
    ]),
    ...(o.activity || []),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    id,
    moduleKey,
    flow,
    title: o.title,
    legalTeam: def.team,
    subType: o.subType || null,
    requestingDept: o.requestingDept || "Operations",
    requestedBy: o.requestedBy || null,          // { name, designation, contact }
    requestedById: o.requestedById || null,      // user id when raised in-app
    entityId: o.entityId || null,                // linked entity from the registry
    dateRaised: stageLog[0].at,
    owner: o.owner,
    stage: path[idx],
    priority: o.priority || "Normal",
    status: closed ? "Closed" : "Open",
    closedAt: closed ? stageLog[stageLog.length - 1].at : null,
    driveLink: o.driveLink || null,
    attachments: o.attachments || [],
    versions: o.versions || [],
    stageLog,
    holds,
    activity,
    comments: (o.comments || []).map((c, i) => ({ id: id + "-M" + (i + 1), ...c })),
    costs: (o.costs || []).map((c, i) => ({ id: id + "-C" + (i + 1), ...c })),
    hearings: o.hearings || undefined,
    fields: o.fields || {},
  };
}

const req = (name, designation, contact) => ({ name, designation, contact });

/* =================== COMMERCIAL & RISK MANAGEMENT =================== */
const CRM = [
  mk("contracts", {
    title: "PPA — Riverview Enclave Phase II (Z Property Developments)",
    subType: "PPA", requestingDept: "Acquisition", requestedBy: req("Salman Tariq", "Acquisition Manager", "salman.tariq@zameen.com"),
    entityId: "CO-37", owner: "u7", assignedBy: "u3", stage: "Drafting", raisedDaysAgo: 6, pace: 1, priority: "High",
    fields: { jurisdictionModel: "Pakistan", ppaCategory: "Medallion Model", templateType: "New Template", counterpartyId: "CO-47", value: 850000000, currency: "PKR", expiry: d(730), renewalFlag: false, instructions: "New medallion-model project; escrow mechanics differ from the standard PPA." },
    versions: [{ v: "0.1", at: d(-2), by: "u7", note: "First draft from new-template baseline" }],
    driveLink: "https://drive.google.com/drive/folders/ppa-riverview-ph2",
    costs: [{ type: "Internal Effort", estimated: 120000, actual: null, currency: "PKR", attribution: "Legal operating budget" }],
  }),
  mk("contracts", {
    title: "PPA — Bayut KSA Off-Plan (Dar Al Diyar development)",
    subType: "PPA", requestingDept: "Sales & Marketing", requestedBy: req("Rakan Al-Otaibi", "Sales Lead — Riyadh", "rakan@bayut.sa"),
    entityId: "CO-22", owner: "u22", assignedBy: "u3", stage: "Risk Assessment", raisedDaysAgo: 8, pace: 1,
    fields: { jurisdictionModel: "KSA", ppaCategory: "Off-Plan Project", templateType: "Existing Template", counterpartyId: "CO-46", value: 1200000, currency: "USD", expiry: d(365), renewalFlag: true, riskRating: "Medium", riskReviewedBy: "u3", instructions: "" },
    versions: [{ v: "1.0", at: d(-4), by: "u22", note: "From existing KSA off-plan template" }, { v: "1.1", at: d(-1), by: "u22", note: "Counterparty markups folded in" }],
    costs: [{ type: "Internal Effort", estimated: 40000, actual: null, currency: "PKR", attribution: "Recharged to requesting department" }],
  }),
  mk("contracts", {
    title: "IT Service Contract — Systems Ltd managed NOC",
    subType: "IT Service Contract", requestingDept: "IT", requestedBy: req("Danish Iqbal", "Head of Infrastructure", "danish.iqbal@zameen.com"),
    entityId: "CO-36", owner: "u5", assignedBy: "u3", stage: "Internal Review", raisedDaysAgo: 9, pace: 2,
    holds: [{ dept: "IT", reason: "Awaiting Clarification", startDaysAgo: 3 }],
    fields: { templateType: "Existing Template", counterpartyId: "CO-38", value: 96000000, currency: "PKR", expiry: d(365), renewalFlag: true, instructions: "SLA annexure needs uptime tiers confirmed by IT." },
    costs: [{ type: "Internal Effort", estimated: 30000, actual: null, currency: "PKR", attribution: "Legal operating budget" }],
  }),
  mk("contracts", {
    title: "Construction Contract — Descon fit-out, Mega Tower L9",
    subType: "Construction Contract", requestingDept: "Admin", requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-36", owner: "u7", assignedBy: "u3", stage: "Final Review", raisedDaysAgo: 14, pace: 2, priority: "High",
    fields: { templateType: "New Template", counterpartyId: "CO-39", value: 145000000, currency: "PKR", expiry: d(240), renewalFlag: false, riskRating: "High", riskReviewedBy: "u3", riskNotes: "LD cap at 8% pushed by counterparty; retained 10% with staged release.", riskSignoffDate: d(-2) },
    versions: [{ v: "0.3", at: d(-3), by: "u7", note: "Risk-adjusted draft" }],
    costs: [{ type: "External Counsel Fee", estimated: 500000, actual: 425000, currency: "PKR", vendorId: "CO-40", invoiceNo: "RIAA-2026-0714", approvedBy: "u1", attribution: "Legal operating budget" }],
  }),
  mk("contracts", {
    title: "Service Agreement — facilities management, Riyadh HQ",
    subType: "Service Agreement", requestingDept: "Admin", requestedBy: req("Nadia Al-Harbi", "Office Manager", "nadia@bayut.sa"),
    entityId: "CO-22", owner: "u22", assignedBy: "u3", stage: "Executed / Closed", raisedDaysAgo: 22, pace: 2, closed: true,
    fields: { templateType: "Existing Template", counterpartyId: "CO-45", value: 220000, currency: "SAR", expiry: d(365), renewalFlag: true },
    costs: [{ type: "Internal Effort", estimated: 20000, actual: 18000, currency: "PKR", attribution: "Legal operating budget" }],
  }),
  mk("contracts", {
    title: "Agreement to Sell — plot 114-B, DHA Phase 6 disposal",
    subType: "Agreement to Sell", requestingDept: "Finance", requestedBy: req("Klaus Werner", "CFO", "klaus.werner@northwind.com"), requestedById: "u16",
    entityId: "CO-37", owner: "u9", assignedBy: "u3", stage: "Assigned", raisedDaysAgo: 1, pace: 1,
    fields: { templateType: "Existing Template", counterpartyId: "CO-33", value: 96500000, currency: "PKR", expiry: d(90), renewalFlag: false, instructions: "Buyer wants possession before full payment — do not concede." },
  }),
  mk("vetting", {
    title: "Counterparty vetting — Al Mansour Holding JV proposal",
    subType: "Counterparty Vetting", requestingDept: "Acquisition", requestedBy: req("Faris Al-Dossari", "BD Director", "faris@bayut.sa"),
    entityId: "CO-22", owner: "u5", assignedBy: "u3", stage: "Review", raisedDaysAgo: 3, pace: 1,
    fields: { counterpartyId: "CO-49", context: "Proposed JV for three off-plan marketing mandates in Jeddah; needs beneficial-ownership and litigation-history screen." },
  }),
  mk("vetting", {
    title: "Deal structure review — media barter with TV network",
    subType: "Deal Structure Review", requestingDept: "Sales & Marketing", requestedBy: req("Ravi Menon", "Sales Director", "ravi.menon@northwind.com"), requestedById: "u15",
    entityId: "CO-36", owner: "u22", assignedBy: "u3", stage: "Closed", raisedDaysAgo: 12, pace: 2, closed: true,
    fields: { counterpartyId: "CO-50", context: "Airtime-for-inventory barter.", riskRating: "Low", advisory: "Approved with quarterly true-up and a 60-day exit." },
  }),
];

/* =================== COMPLIANCE =================== */
const CMP = [
  mk("agreements", {
    title: "Office lease — Mega Tower floors 7–9, Lahore",
    subType: "Lease Agreement", requestingDept: "Admin", requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Executed / Closed", raisedDaysAgo: 400, pace: 3, closed: true,
    fields: { counterpartyId: "CO-48", value: 84000000, currency: "PKR", expiry: d(21), renewalTerm: "3 years", renewalDue: d(21), renewalStatus: "Trigger Raised", renewalOwner: "u21" },
    driveLink: "https://drive.google.com/drive/folders/lease-megatower-7-9",
  }),
  mk("agreements", {
    title: "Working-capital facility — HBL PKR 500M line",
    subType: "Loan Agreement", requestingDept: "Finance", requestedBy: req("Klaus Werner", "CFO", "klaus.werner@northwind.com"), requestedById: "u16",
    entityId: "CO-36", owner: "u8", assignedBy: "u20", stage: "Internal Review", raisedDaysAgo: 11, pace: 2, priority: "High",
    holds: [{ dept: "Finance", reason: "Awaiting Documents", startDaysAgo: 6, endDaysAgo: 2 }],
    comments: [
      { at: d(-6), by: "u8", text: "The bank wants the board resolution and last two audited statements before term sheet sign-off.", internal: false },
      { at: d(-2), by: "u16", text: "Both sent to the bank directly; copies attached here for the record.", internal: false },
    ],
    fields: { counterpartyId: "CO-42", value: 500000000, currency: "PKR", expiry: d(365), renewalTerm: "1 year", renewalDue: d(335), renewalStatus: "Not Due" },
    costs: [{ type: "External Counsel Fee", estimated: 350000, actual: null, currency: "PKR", vendorId: "CO-40", attribution: "Legal operating budget" }],
  }),
  mk("agreements", {
    title: "Security services agreement — Askari Guards, all PK offices",
    subType: "Service Agreement", requestingDept: "Admin", requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Drafting", raisedDaysAgo: 4, pace: 1,
    fields: { counterpartyId: "CO-44", value: 38400000, currency: "PKR", expiry: d(365), renewalTerm: "1 year", renewalDue: d(335), renewalStatus: "Not Due" },
  }),
  mk("agreements", {
    title: "Renewal — Mega Tower lease floors 7–9",
    subType: "Lease Agreement", flow: "renewal", requestingDept: "Admin", requestedBy: req("System", "Renewal Trigger", "legalos"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Terms Review", raisedDaysAgo: 9, pace: 3,
    fields: { counterpartyId: "CO-48", value: 84000000, currency: "PKR", renewalTerm: "3 years", renewalDue: d(21), renewalStatus: "In Progress", renewalOwner: "u21" },
    activity: [{ at: d(-9), by: null, action: "Renewal trigger generated automatically 30 days before Renewal Due Date" }],
  }),
  mk("agreements", {
    title: "Equipment loan — vehicle fleet refinancing, Meezan",
    subType: "Loan Agreement", requestingDept: "Finance", requestedBy: req("Amna Javed", "Treasury Manager", "amna.javed@zameen.com"),
    entityId: "CO-36", owner: "u12", assignedBy: "u20", stage: "Executed / Closed", raisedDaysAgo: 60, pace: 4, closed: true,
    fields: { counterpartyId: "CO-43", value: 120000000, currency: "PKR", expiry: d(700), renewalTerm: "2 years", renewalDue: d(670), renewalStatus: "Not Due" },
  }),
  mk("agreements", {
    title: "Cleaning & maintenance SLA — Square One Building",
    subType: "Service Agreement", requestingDept: "Admin", requestedBy: req("Bushra Anwar", "Facilities Lead", "bushra.a@zameen.com"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Submission for Signature", raisedDaysAgo: 10, pace: 2,
    fields: { counterpartyId: "CO-51", value: 9600000, currency: "PKR", expiry: d(365), renewalTerm: "1 year", renewalDue: d(335), renewalStatus: "Not Due" },
  }),

  // Resolutions — deliberately spread across departments (Section 6.4 report).
  mk("resolutions", {
    title: "Board Resolution — authorize HBL facility signatories",
    subType: "Board Resolution", requestingDept: "Finance", requestedBy: req("Klaus Werner", "CFO", "klaus.werner@northwind.com"), requestedById: "u16",
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Closed", raisedDaysAgo: 15, pace: 2, closed: true,
    fields: { purpose: "Authorize CFO and Company Secretary to execute HBL facility documents.", urgency: "Urgent", authority: "Bank", authorizedPersons: "Klaus Werner (CFO, CNIC 35202-1234567-1); Saad Cheema (Company Secretary, CNIC 35201-7654321-9)", resolutionDate: d(-9), uploadedToTracker: true, trackerUploadDate: d(-8), trackerLink: "https://drive.google.com/resolutions-tracker#R-118" },
    costs: [{ type: "Filing & Government Fee", estimated: 5000, actual: 5000, currency: "PKR", attribution: "Recharged to requesting department" }],
  }),
  mk("resolutions", {
    title: "Partners Resolution — LESCO tariff reclassification, B64",
    subType: "Partners Resolution", requestingDept: "Admin", requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Finalize & Sign", raisedDaysAgo: 4, pace: 1, priority: "High",
    fields: { purpose: "Authorize filing for commercial tariff reclassification of the B64 office with LESCO.", urgency: "Urgent", authority: "LESCO", authorizedPersons: "Shahid Mehmood (Admin Manager, CNIC 35200-2244668-5)" },
  }),
  mk("resolutions", {
    title: "Board Resolution — customs clearance authorization, IT imports",
    subType: "Board Resolution", requestingDept: "IT", requestedBy: req("Danish Iqbal", "Head of Infrastructure", "danish.iqbal@zameen.com"),
    entityId: "CO-36", owner: "u12", assignedBy: "u20", stage: "Review", raisedDaysAgo: 2, pace: 1,
    fields: { purpose: "Authorize clearing agent for imported networking equipment.", urgency: "Normal", authority: "Customs", authorizedPersons: "Bilal Chaudhry (Clearing Agent, CNIC 35202-9988776-3)" },
  }),
  mk("resolutions", {
    title: "Board Resolution — EPA hearing representation, Mega Tower generators",
    subType: "Board Resolution", requestingDept: "Operations", requestedBy: req("Kamran Abbasi", "Operations Head", "kamran.a@zameen.com"),
    entityId: "CO-37", owner: "u21", assignedBy: "u20", stage: "Drafting", raisedDaysAgo: 1, pace: 1,
    fields: { purpose: "Authorize counsel to appear before EPA on generator emissions notice.", urgency: "Urgent", authority: "EPA", authorizedPersons: "Ahmed Raza (Senior Counsel)" },
  }),
  mk("resolutions", {
    title: "Board Resolution — open SNB collection account, Riyadh",
    subType: "Board Resolution", requestingDept: "Finance", requestedBy: req("Amna Javed", "Treasury Manager", "amna.javed@zameen.com"),
    entityId: "CO-22", owner: "u8", assignedBy: "u20", stage: "Closed", raisedDaysAgo: 25, pace: 2, closed: true,
    fields: { purpose: "Open SAR collection account with Saudi National Bank.", urgency: "Normal", authority: "Bank", authorizedPersons: "Rakan Al-Otaibi (Finance Manager KSA)", resolutionDate: d(-18), uploadedToTracker: true, trackerUploadDate: d(-17), trackerLink: "https://drive.google.com/resolutions-tracker#R-121" },
  }),
  mk("resolutions", {
    title: "Partners Resolution — SECP annual filing authorization",
    subType: "Partners Resolution", requestingDept: "Finance", requestedBy: req("Saad Cheema", "Company Secretary", "saad.cheema@zameen.com"),
    entityId: "CO-37", owner: "u12", assignedBy: "u20", stage: "Upload to Resolutions Tracker", raisedDaysAgo: 6, pace: 1,
    fields: { purpose: "Authorize Form-A / Form-29 annual filings with SECP.", urgency: "Normal", authority: "SECP", authorizedPersons: "Saad Cheema (Company Secretary, CNIC 35201-7654321-9)", resolutionDate: d(-1), uploadedToTracker: false },
  }),
  mk("resolutions", {
    title: "Board Resolution — HR provident fund trustee change",
    subType: "Board Resolution", requestingDept: "HR", requestedBy: req("Fatima Al-Sayed", "Head of HR", "fatima.alsayed@northwind.com"), requestedById: "u14",
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Assigned", raisedDaysAgo: 1, pace: 1,
    fields: { purpose: "Replace retiring PF trustee and update bank mandate.", urgency: "Normal", authority: "Bank", authorizedPersons: "TBD" },
  }),
  mk("resolutions", {
    title: "Board Resolution — authorize FIR filing against vendor",
    subType: "Board Resolution", requestingDept: "Admin", requestedBy: req("Ahmed Raza", "Senior Counsel", "ahmed.raza@northwind.com"), requestedById: "u17",
    entityId: "CO-37", owner: "u21", assignedBy: "u20", stage: "Closed", raisedDaysAgo: 20, pace: 1, closed: true,
    fields: { purpose: "Authorize Recovery Officer to file police complaint against ZD-project vendor for material theft.", urgency: "Urgent", authority: "SECP", authorizedPersons: "Mariam Khan (Recovery Officer, CNIC 35201-5566778-2)", resolutionDate: d(-15), uploadedToTracker: true, trackerUploadDate: d(-14) },
  }),

  // License renewals — the workflow module beside the register.
  mk("licenses", {
    title: "FAL brokerage license renewal — Bayut KSA",
    subType: "Real Estate Brokerage (FAL)", requestingDept: "Operations", requestedBy: req("System", "Renewal Trigger", "legalos"),
    entityId: "CO-22", owner: "u12", assignedBy: "u20", stage: "Document Collection", raisedDaysAgo: 8, pace: 2, priority: "High",
    fields: { licenseName: "REGA FAL Brokerage License", authority: "REGA", issueDate: d(-720), renewalTerm: "1 year", renewalDue: d(12), renewalStatus: "In Progress", linkedLicenseId: "LIC-009" },
    activity: [{ at: d(-8), by: null, action: "Renewal trigger generated automatically 30 days before Renewal Due Date" }],
    costs: [{ type: "Filing & Government Fee", estimated: 5400, actual: null, currency: "USD", attribution: "Legal operating budget" }],
  }),
  mk("licenses", {
    title: "Commercial registration renewal — Zameen Media",
    subType: "Commercial Registration", requestingDept: "Finance", requestedBy: req("System", "Renewal Trigger", "legalos"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Assigned", raisedDaysAgo: 3, pace: 1,
    fields: { licenseName: "SECP Certificate of Incorporation — annual return", authority: "SECP", issueDate: d(-1090), renewalTerm: "1 year", renewalDue: d(24), renewalStatus: "Trigger Raised", linkedLicenseId: "LIC-014" },
    activity: [{ at: d(-3), by: null, action: "Renewal trigger generated automatically 30 days before Renewal Due Date" }],
  }),
  mk("licenses", {
    title: "Municipality license renewal — Dubizzle Mega Tower",
    subType: "Municipality License", requestingDept: "Admin", requestedBy: req("System", "Renewal Trigger", "legalos"),
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Awaiting Response", raisedDaysAgo: 18, pace: 3,
    fields: { licenseName: "LDA commercial premises license", authority: "LDA / Municipality", issueDate: d(-380), renewalTerm: "1 year", renewalDue: d(-2), renewalStatus: "In Progress" },
    costs: [{ type: "Filing & Government Fee", estimated: 65000, actual: 65000, currency: "PKR", invoiceNo: "LDA-CH-99182", attribution: "Legal operating budget" }],
  }),
  mk("licenses", {
    title: "Trade license renewal — OLX Karachi office",
    subType: "Trade License", requestingDept: "Admin", requestedBy: req("System", "Renewal Trigger", "legalos"),
    entityId: "CO-36", owner: "u12", assignedBy: "u20", stage: "Renewed / Closed", raisedDaysAgo: 40, pace: 5, closed: true,
    fields: { licenseName: "KMC trade license", authority: "LDA / Municipality", issueDate: d(-400), renewalTerm: "1 year", renewalDue: d(-12), renewalStatus: "Renewed" },
    costs: [{ type: "Filing & Government Fee", estimated: 40000, actual: 42500, currency: "PKR", invoiceNo: "KMC-2026-5521", attribution: "Legal operating budget" }],
  }),

  /* ---- Filing Module (Compliance) — Section 8. SECP applies to the PK
     entities. A spread of statuses so the per-entity board (8.3) reads real:
     filed, due-soon in progress, overdue, event-based linked to resolutions. ---- */
  mk("filings", {
    title: "Form A — Zameen Media 2025",
    subType: "Form A — Annual Return", flow: "periodic", requestingDept: "Legal",
    requestedBy: req("System", "Filing trigger — 30 days before due", "legalos"),
    entityId: "CO-36", owner: "u12", assignedBy: "u20", stage: "Closed", raisedDaysAgo: 310, pace: 4, closed: true,
    fields: { filingCategory: "Periodic (Annual)", periodEnd: d(-350), dueDate: d(-280), filingDate: d(-283), authorizedPerson: "Hassan Ali (Company Secretary)", ctcApplied: true, srn: "SRN-25-118332" },
    activity: [{ at: d(-310), by: null, action: "System-generated 30 days before the statutory due date (Filing Module 8.2)" }],
    costs: [{ type: "Filing & Government Fee", estimated: 10000, actual: 9500, currency: "PKR", invoiceNo: "SECP-CH-25-4471", attribution: "Legal operating budget" }],
  }),
  mk("filings", {
    title: "Form A — Zameen.com 2026",
    subType: "Form A — Annual Return", flow: "periodic", requestingDept: "Legal",
    requestedBy: req("System", "Filing trigger — 30 days before due", "legalos"),
    entityId: "CO-20", owner: "u12", assignedBy: "u20", stage: "Preparation", raisedDaysAgo: 22, pace: 8, priority: "High",
    fields: { filingCategory: "Periodic (Annual)", periodEnd: d(-224), dueDate: d(8), authorizedPerson: "Hassan Ali (Company Secretary)", ctcApplied: false },
    activity: [{ at: d(-22), by: null, action: "System-generated 30 days before the statutory due date (Filing Module 8.2)" }],
  }),
  mk("filings", {
    title: "Form 29 — Zameen Media change of directors",
    subType: "Form 29 — Directors & Officers Change", requestingDept: "Finance",
    requestedBy: req("Imran Qureshi", "Finance Director", "imran.q@zameen.com"), requestedById: "u16",
    entityId: "CO-36", owner: "u21", assignedBy: "u20", stage: "Internal Review", raisedDaysAgo: 9, pace: 2,
    fields: { filingCategory: "Event-Based", dueDate: d(6), linkedResolutionId: "CMP-0014", authorizedPerson: "Hassan Ali (Company Secretary)", ctcApplied: false },
    comments: [
      { at: d(-4), by: "u21", text: "Need the signed resolution and Form 28 consents of both incoming directors before I can file.", internal: false },
      { at: d(-2), by: "u16", text: "Consents signed and scanned — attached on the resolution record.", internal: false },
    ],
  }),
  mk("filings", {
    title: "Form 9 — Propsults registered office change",
    subType: "Form 9 — Registered Office Change", requestingDept: "Admin",
    requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-24", owner: "u12", assignedBy: "u20", stage: "Preparation", raisedDaysAgo: 25, pace: 6, priority: "High",
    holds: [{ dept: "Admin", reason: "Awaiting Documents", startDaysAgo: 12, endDaysAgo: 4 }],
    fields: { filingCategory: "Event-Based", dueDate: d(-12), authorizedPerson: "External consultant — Corplink Associates", ctcApplied: false },
  }),
  mk("filings", {
    title: "Form 3 — OLX Pakistan allotment of shares",
    subType: "Form 3 — Allotment of Shares", requestingDept: "Finance",
    requestedBy: req("Imran Qureshi", "Finance Director", "imran.q@zameen.com"), requestedById: "u16",
    entityId: "CO-21", owner: "u21", assignedBy: "u20", stage: "Closed", raisedDaysAgo: 45, pace: 5, closed: true,
    fields: { filingCategory: "Event-Based", dueDate: d(-15), filingDate: d(-30), authorizedPerson: "Hassan Ali (Company Secretary)", ctcApplied: true, srn: "SRN-26-009114" },
    costs: [{ type: "Filing & Government Fee", estimated: 7500, actual: 7500, currency: "PKR", invoiceNo: "SECP-CH-26-1108", attribution: "Recharged to requesting department" }],
  }),
  mk("filings", {
    title: "Form 19 — Zameen.com charge in favour of HBL",
    subType: "Form 19 — Mortgage / Charge", requestingDept: "Finance",
    requestedBy: req("Imran Qureshi", "Finance Director", "imran.q@zameen.com"), requestedById: "u16",
    entityId: "CO-20", owner: "u12", assignedBy: "u20", stage: "Filed with SECP", raisedDaysAgo: 14, pace: 3,
    fields: { filingCategory: "Event-Based", dueDate: d(4), filingDate: d(-3), linkedResolutionId: "CMP-0013", authorizedPerson: "Hassan Ali (Company Secretary)", ctcApplied: false, srn: "SRN-26-014772" },
  }),
];

/* ---------------- Filing Module 8.2 — the statutory filing calendar ----------------
   Per PK entity: the periodic obligations Compliance maintains. The store's
   ensurePeriodicFilings() generates the filing record automatically once
   `nextDue` comes within 30 days — OLX below is inside that window on a fresh
   seed, so the trigger demonstrably fires on first boot. */
export const FILING_SCHEDULE = [
  { entityId: "CO-36", formType: "Form A — Annual Return", frequency: "Annual", nextDue: d(85), periodEnd: d(15), authorizedPerson: "Hassan Ali (Company Secretary)", active: true },
  { entityId: "CO-20", formType: "Form A — Annual Return", frequency: "Annual", nextDue: d(8), periodEnd: d(-224), authorizedPerson: "Hassan Ali (Company Secretary)", active: true },
  { entityId: "CO-21", formType: "Form A — Annual Return", frequency: "Annual", nextDue: d(22), periodEnd: d(-190), authorizedPerson: "Hassan Ali (Company Secretary)", active: true },
  { entityId: "CO-24", formType: "Form A — Annual Return", frequency: "Annual", nextDue: d(150), periodEnd: d(60), authorizedPerson: "External consultant — Corplink Associates", active: true },
  { entityId: "CO-25", formType: "Form A — Annual Return", frequency: "Annual", nextDue: d(60), periodEnd: d(-30), authorizedPerson: "External consultant — Corplink Associates", active: true },
];

/* =================== LITIGATION & DISPUTE MANAGEMENT =================== */
const LIT = [
  // 8.1 Case Handling — hearing logs drive "Next Action Due".
  mk("cases", {
    title: "Recovery suit — Chaudhry Builders (unpaid media dues)",
    subType: "Recovery Suit", requestingDept: "Finance", requestedBy: req("Amna Javed", "Treasury Manager", "amna.javed@zameen.com"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Drafting", raisedDaysAgo: 7, pace: 1, priority: "High",
    fields: { caseNumber: "COS-1182/2026", court: "Civil Court, Lahore", position: "Plaintiff", caseStatus: "In Progress", filingDate: d(-90), counselType: "External", counselName: "RIAA Barker Gillette", recoverablePkr: 48500000, exposurePkr: 0, riskRating: "Medium", proceedings: "Written statement due; defendant seeking adjournment." },
    hearings: [
      { id: "H1", date: d(-30), type: "First hearing", attendedBy: "External — RIAA", outcome: "Summons served; written statement ordered", nextDate: d(-9) },
      { id: "H2", date: d(-9), type: "Arguments", attendedBy: "External — RIAA", outcome: "Adjourned on defendant's request", nextDate: d(6) },
    ],
    costs: [{ type: "External Counsel Fee", estimated: 1200000, actual: 800000, currency: "PKR", vendorId: "CO-40", invoiceNo: "RIAA-2026-0698", approvedBy: "u1", attribution: "Legal operating budget" }],
  }),
  mk("cases", {
    title: "Writ petition — PEMRA advertising standards order",
    subType: "Writ Petition", requestingDept: "Sales & Marketing", requestedBy: req("Hina Baig", "Brand Director", "hina.baig@zameen.com"),
    entityId: "CO-36", owner: "u6", assignedBy: "u6", stage: "Internal Review", raisedDaysAgo: 12, pace: 2,
    fields: { caseNumber: "WP-40911/2026", court: "Lahore High Court", position: "Petitioner", caseStatus: "In Progress", filingDate: d(-60), counselType: "External", counselName: "Cornelius, Lane & Mufti", recoverablePkr: 0, exposurePkr: 25000000, riskRating: "High" },
    hearings: [
      { id: "H1", date: d(-20), type: "First hearing", attendedBy: "External — CLM", outcome: "Notice issued to PEMRA", nextDate: d(13) },
    ],
    costs: [{ type: "External Counsel Fee", estimated: 2000000, actual: 1500000, currency: "PKR", vendorId: "CO-41", invoiceNo: "CLM-2026-1121", approvedBy: "u1", attribution: "Legal operating budget" }],
  }),
  mk("cases", {
    title: "Labour case — reinstatement claim, ex-sales executive",
    subType: "Labour Case", requestingDept: "HR", requestedBy: req("Fatima Al-Sayed", "Head of HR", "fatima.alsayed@northwind.com"), requestedById: "u14",
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Internal Review", raisedDaysAgo: 5, pace: 1, priority: "High",
    holds: [{ dept: "HR", reason: "Awaiting Documents", startDaysAgo: 2 }],
    comments: [
      { at: d(-2), by: "u17", text: "We need the attendance register and the two warning letters referenced in the termination memo — reply here or attach directly.", internal: false },
      { at: d(-1), by: "u14", text: "Attendance register attached; warning letters are with the regional office, expect them tomorrow.", internal: false },
      { at: d(-1), by: "u17", text: "Their counsel is weak on limitation — reply can take the s.25-A point first.", internal: true },
    ],
    attachments: [
      { id: "ATT-1", name: "termination-memo-ZM-8817.pdf", size: 182000, at: d(-5), by: "u14" },
      { id: "ATT-2", name: "attendance-register-2026H1.xlsx", size: 96000, at: d(-1), by: "u14" },
    ],
    fields: { caseNumber: "LAB-3321/2026", court: "Punjab Labour Court No. 4", position: "Respondent", caseStatus: "In Progress", filingDate: d(-45), counselType: "Internal", counselName: "Ahmed Raza", recoverablePkr: 0, exposurePkr: 3800000, riskRating: "Medium", proceedings: "Reply drafted; awaiting attendance records from HR." },
    hearings: [
      { id: "H1", date: d(-15), type: "First hearing", attendedBy: "Internal — Ahmed Raza", outcome: "Reply ordered within 14 days", nextDate: d(3) },
    ],
  }),
  mk("cases", {
    title: "Consumer complaint — booking refund, Riverview Enclave",
    subType: "Consumer Complaint", requestingDept: "Operations", requestedBy: req("Kamran Abbasi", "Operations Head", "kamran.a@zameen.com"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Submitted to Court", raisedDaysAgo: 16, pace: 3,
    fields: { caseNumber: "CC-889/2026", court: "Consumer Court, Lahore", position: "Respondent", caseStatus: "In Progress", filingDate: d(-70), counselType: "Internal", counselName: "Ahmed Raza", recoverablePkr: 0, exposurePkr: 5400000, riskRating: "Low" },
    hearings: [
      { id: "H1", date: d(-25), type: "First hearing", attendedBy: "Internal — Ahmed Raza", outcome: "Complainant evidence recorded", nextDate: d(-2) },
      { id: "H2", date: d(-2), type: "Evidence", attendedBy: "Internal — Ahmed Raza", outcome: "Our evidence submitted", nextDate: d(9) },
    ],
  }),
  mk("cases", {
    title: "Arbitration — Descon variation claims, Mega Tower fit-out",
    subType: "Arbitration", requestingDept: "Admin", requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-36", owner: "u6", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 120, pace: 20, closed: true,
    fields: { caseNumber: "ARB-07/2025", court: "LCIA-arbitration (Lahore seat)", position: "Respondent", caseStatus: "Completed", filingDate: d(-300), counselType: "External", counselName: "RIAA Barker Gillette", recoverablePkr: 0, exposurePkr: 22000000, riskRating: "High", outcome: "Settled at PKR 9.5M against a PKR 22M claim; release signed." },
    costs: [
      { type: "External Counsel Fee", estimated: 4000000, actual: 3600000, currency: "PKR", vendorId: "CO-40", invoiceNo: "RIAA-2025-0455", approvedBy: "u1", attribution: "Legal operating budget" },
      { type: "Filing & Government Fee", estimated: 500000, actual: 480000, currency: "PKR", attribution: "Legal operating budget" },
    ],
  }),
  mk("cases", {
    title: "Criminal complaint follow-up — cheque dishonour, agency dues",
    subType: "Criminal Complaint", requestingDept: "Finance", requestedBy: req("Amna Javed", "Treasury Manager", "amna.javed@zameen.com"),
    entityId: "CO-37", owner: "u18", assignedBy: "u6", stage: "Submitted to Court", raisedDaysAgo: 20, pace: 4,
    fields: { caseNumber: "FIR-441/26 u/s 489-F", court: "Judicial Magistrate, Model Town", position: "Complainant", caseStatus: "In Progress", filingDate: d(-50), counselType: "Internal", counselName: "Mariam Khan", recoverablePkr: 7200000, exposurePkr: 0, riskRating: "Low" },
    hearings: [
      { id: "H1", date: d(-10), type: "First hearing", attendedBy: "Internal — Mariam Khan", outcome: "Accused summoned", nextDate: d(11) },
    ],
  }),

  // 8.2 Asset Recovery — HR / Admin / Legal source-tagged field groups.
  mk("assetRecovery", {
    title: "Asset recovery — Usman Ghani (ex-Sales, Lahore)",
    subType: "Central", requestingDept: "HR", requestedBy: req("Fatima Al-Sayed", "Head of HR", "fatima.alsayed@northwind.com"), requestedById: "u14",
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Negotiation / Recovery", raisedDaysAgo: 12, pace: 2, priority: "High",
    fields: {
      employeeId: "ZM-8841", employeeName: "Usman Ghani", department: "Sales & Marketing", city: "Lahore", month: "June 2026",
      complaintDate: d(-40), joiningDate: d(-900), lastWorkingDay: d(-45), excessLeaves: 6, overutilizedDays: 4,
      pendingSalary: 240000, providentFund: 310000, totalPayable: 550000, showCauseDate: d(-30), personnelFileLink: "https://drive.google.com/hr/ZM-8841",
      totalAssetPv: 385000, laptopPv: 265000, mobilePv: 85000, winglePv: 12000, otherItPv: 23000, settlementNegative: -180000,
      laptopNegative: -140000, vehicleNegative: 0, mobileNegative: -40000,
      recoveryNotes: "Laptop returned damaged; negotiating deduction from final settlement.", legalAction: "Asset Not Recovered",
    },
  }),
  mk("assetRecovery", {
    title: "Asset recovery — Tariq Mahmood (ex-Regional Manager, vehicle)",
    subType: "North", requestingDept: "HR", requestedBy: req("HR Shared Services", "HRBP North", "hrbp.north@zameen.com"),
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Demand Notice", raisedDaysAgo: 6, pace: 1,
    fields: {
      employeeId: "ZM-5512", employeeName: "Tariq Mahmood", department: "Operations", city: "Islamabad", month: "July 2026",
      joiningDate: d(-1600), lastWorkingDay: d(-20), pendingSalary: 380000, totalPayable: 380000,
      totalAssetPv: 4650000, laptopPv: 250000,
      vehicleNegative: -1450000, vehicleIssueDate: d(-1100), vehiclePrice: 4200000, totalVehicleNegative: -1450000,
      recoveryNotes: "Company vehicle not returned; demand notice served, 14-day window running.", legalAction: "Asset Not Recovered",
    },
    costs: [{ type: "Other", estimated: 15000, actual: 15000, currency: "PKR", attribution: "Legal operating budget" }],
  }),
  mk("assetRecovery", {
    title: "Asset recovery — Sana Malik (ex-Marketing, laptop & phone)",
    subType: "Head Office", requestingDept: "HR", requestedBy: req("HR Shared Services", "HRBP HO", "hrbp.ho@zameen.com"),
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 30, pace: 5, closed: true,
    fields: {
      employeeId: "ZM-9107", employeeName: "Sana Malik", department: "Sales & Marketing", city: "Lahore", month: "May 2026",
      lastWorkingDay: d(-60), pendingSalary: 190000, totalPayable: 190000,
      totalAssetPv: 350000, laptopPv: 265000, mobilePv: 85000,
      legalAction: "Asset Recovered", recoveryDate: d(-8), assetsReceivedBy: "Admin Store — B64", finalComments: "All assets returned in working condition; settlement released.", totalRecovered: 350000,
    },
  }),
  mk("assetRecovery", {
    title: "Asset recovery — Adeel Hussain (ex-CS, no assets outstanding)",
    subType: "South", requestingDept: "HR", requestedBy: req("HR Shared Services", "HRBP South", "hrbp.south@zameen.com"),
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 18, pace: 3, closed: true,
    fields: { employeeId: "ZM-7733", employeeName: "Adeel Hussain", department: "Operations", city: "Karachi", month: "June 2026", lastWorkingDay: d(-35), legalAction: "No Action Required", finalComments: "Exit clearance complete; nothing recoverable." },
  }),
  mk("assetRecovery", {
    title: "Asset recovery — Faisal Nadeem (ex-BD, settlement negative)",
    subType: "Central", requestingDept: "HR", requestedBy: req("HR Shared Services", "HRBP Central", "hrbp.central@zameen.com"),
    entityId: "CO-37", owner: "u18", assignedBy: "u6", stage: "Settlement", raisedDaysAgo: 22, pace: 4,
    fields: {
      employeeId: "ZD-2210", employeeName: "Faisal Nadeem", department: "Acquisition", city: "Lahore", month: "April 2026",
      lastWorkingDay: d(-75), excessLeaves: 11, pendingSalary: 0, totalPayable: -260000, settlementNegative: -260000,
      laptopNegative: -95000, mobileNegative: -30000,
      recoveryNotes: "Negative settlement; recovery via post-dated cheques agreed.", legalAction: "Asset Recovered", totalRecovered: 125000,
    },
  }),

  // 8.3 IP Portfolio — registered marks + pending prosecution + open requests.
  mk("ip", {
    title: "TM renewal — ZAMEEN word mark (PK, cl. 35/36/42)",
    subType: "Renewal", requestingDept: "Legal", requestedBy: req("System", "Renewal Trigger", "legalos"),
    entityId: "CO-36", owner: "u19", assignedBy: "u6", stage: "Submission to IP Office", raisedDaysAgo: 14, pace: 3, priority: "High",
    fields: { markName: "ZAMEEN", country: "Pakistan", classes: "35, 36, 42", regNumber: "TM-289114", filingDate: d(-3650), regDate: d(-3300), renewalDue: d(18), ipStatus: "Registered", subStatus: "Registered", registeredOwner: "CO-36", ownerAddress: "Mega Tower, Main Boulevard, Gulberg III, Lahore", localCounsel: "United Trademark & Patent Services" },
    costs: [{ type: "Filing & Government Fee", estimated: 60000, actual: null, currency: "PKR", attribution: "Legal operating budget" }],
  }),
  mk("ip", {
    title: "New filing — PLOT FINDER device mark (PK, cl. 35/42)",
    subType: "New Filing", requestingDept: "Sales & Marketing", requestedBy: req("Hina Baig", "Brand Director", "hina.baig@zameen.com"),
    entityId: "CO-36", owner: "u19", assignedBy: "u6", stage: "Drafting / Filing Preparation", raisedDaysAgo: 4, pace: 1,
    fields: { markName: "PLOT FINDER", markImage: "plotfinder-device.png", country: "Pakistan", classes: "35, 42", ipStatus: "Pending Application", subStatus: "Pending Examination", registeredOwner: "CO-36", localCounsel: "United Trademark & Patent Services" },
  }),
  mk("ip", {
    title: "Infringement action — BAYUT copycat listings portal (KSA)",
    subType: "Infringement Action", requestingDept: "Legal", requestedBy: req("Rakan Al-Otaibi", "Country Manager KSA", "rakan@bayut.sa"),
    entityId: "CO-22", owner: "u19", assignedBy: "u6", stage: "Internal Review", raisedDaysAgo: 9, pace: 2, priority: "High",
    fields: { markName: "BAYUT", country: "Saudi Arabia", classes: "35, 36", regNumber: "SA-1442019881", regDate: d(-1500), renewalDue: d(300), ipStatus: "Registered", subStatus: "Registered", registeredOwner: "CO-2", localCounsel: "Kadasa IP" },
    costs: [{ type: "External Counsel Fee", estimated: 9000, actual: null, currency: "USD", attribution: "Legal operating budget" }],
  }),
  mk("ip", {
    title: "Prosecution — OLX MOTORS composite mark (PK, cl. 35)",
    subType: "New Filing", requestingDept: "Legal", requestedBy: req("Bilal Sheikh", "IP Counsel", "bilal.sheikh@northwind.com"), requestedById: "u19",
    entityId: "CO-36", owner: "u19", assignedBy: "u6", stage: "Submission to IP Office", raisedDaysAgo: 60, pace: 10,
    fields: { markName: "OLX MOTORS", country: "Pakistan", classes: "35", filingDate: d(-55), ipStatus: "Pending Registration", subStatus: "Published", registeredOwner: "CO-36", localCounsel: "Vellani & Vellani" },
  }),
  mk("ip", {
    title: "Portfolio record — DUBIZZLE word mark (UAE, cl. 35/38)",
    subType: "Renewal", requestingDept: "Legal", requestedBy: req("Bilal Sheikh", "IP Counsel", "bilal.sheikh@northwind.com"), requestedById: "u19",
    entityId: "CO-36", owner: "u19", assignedBy: "u6", stage: "Registered / Renewed / Closed", raisedDaysAgo: 90, pace: 15, closed: true,
    fields: { markName: "DUBIZZLE", country: "UAE", classes: "35, 38", regNumber: "AE-201599", regDate: d(-2500), renewalDue: d(650), ipStatus: "Renewed", subStatus: "Renewed", registeredOwner: "CO-36", localCounsel: "Al Tamimi & Co." },
  }),

  // 8.4 Developer Disputes (CPML projects).
  mk("developerDisputes", {
    title: "CPML — Riverview Enclave delayed possession (Block C)",
    subType: "CPML Project", requestingDept: "Operations", requestedBy: req("Kamran Abbasi", "Operations Head", "kamran.a@zameen.com"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Action in Progress", raisedDaysAgo: 15, pace: 3, priority: "High",
    fields: { nature: "62 buyers of Block C claiming delayed possession beyond the PPA grace period.", latestUpdate: "Developer offered revised handover schedule; buyer committee reviewing.", actionRequired: "Vet revised schedule addendum; prepare fallback demand notice.", actionTaken: "Committee meeting held; addendum drafted.", region: "Central", authorizedPerson: "u17" },
  }),
  mk("developerDisputes", {
    title: "CPML — Medallion project escrow shortfall query",
    subType: "CPML Project", requestingDept: "Finance", requestedBy: req("Amna Javed", "Treasury Manager", "amna.javed@zameen.com"),
    entityId: "CO-37", owner: "u6", assignedBy: "u6", stage: "Assessment", raisedDaysAgo: 5, pace: 1,
    fields: { nature: "Escrow balance below the medallion-model covenant threshold for two consecutive months.", latestUpdate: "Developer attributes shortfall to a delayed tranche.", actionRequired: "Issue covenant breach notice or grant 30-day cure.", region: "Central", authorizedPerson: "u6" },
  }),
  mk("developerDisputes", {
    title: "CPML — structural defects claim, Palm Vista towers",
    subType: "CPML Project", requestingDept: "Operations", requestedBy: req("Site Office", "Project Coordinator", "palmvista@zdev.com"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Resolved / Closed", raisedDaysAgo: 45, pace: 9, closed: true,
    fields: { nature: "Seepage and cladding defects reported in towers A/B common areas.", latestUpdate: "Rectification completed under DLP.", actionTaken: "Defect liability invoked; contractor completed repairs; sign-off obtained.", region: "Central", authorizedPerson: "u17" },
  }),
  mk("developerDisputes", {
    title: "CPML — title transfer backlog, Riverview commercial units",
    subType: "CPML Project", requestingDept: "Acquisition", requestedBy: req("Salman Tariq", "Acquisition Manager", "salman.tariq@zameen.com"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Assigned", raisedDaysAgo: 2, pace: 1,
    fields: { nature: "38 commercial unit transfers pending mutation at the registrar.", actionRequired: "Coordinate with registrar; prepare POA set for bulk mutation.", region: "Central", authorizedPerson: "u17" },
  }),

  // 8.5.1 Police Complaints.
  mk("police", {
    title: "Complaint — material theft by ZD-project vendor",
    subType: "Against ZD-project vendors", requestingDept: "Admin", requestedBy: req("Shahid Mehmood", "Admin Manager", "shahid.m@zameen.com"),
    entityId: "CO-37", owner: "u18", assignedBy: "u6", stage: "FIR Lodged", raisedDaysAgo: 19, pace: 4, priority: "High",
    fields: { reason: "Steel and cabling pilfered from Riverview site store by vendor staff.", filedBy: "Mariam Khan", authorizedPerson: "Mariam Khan (Recovery Officer)", boardResolutionProvided: true, policeStation: "PS Defence-A, Lahore", complaintDate: d(-15), firDate: d(-7) },
  }),
  mk("police", {
    title: "Complaint — data theft by ex-employee (CRM export)",
    subType: "Against ex-employees", requestingDept: "IT", requestedBy: req("Danish Iqbal", "Head of Infrastructure", "danish.iqbal@zameen.com"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Filed with Police Station", raisedDaysAgo: 6, pace: 1,
    fields: { reason: "Departing sales lead exported client CRM data to personal drive.", filedBy: "Ahmed Raza", authorizedPerson: "Ahmed Raza (Senior Counsel)", boardResolutionProvided: true, policeStation: "FIA Cyber Crime Wing, Lahore", complaintDate: d(-3) },
  }),
  mk("police", {
    title: "Complaint — cheque fraud by ZD buyer on resale",
    subType: "Against ZD buyers", requestingDept: "Finance", requestedBy: req("Amna Javed", "Treasury Manager", "amna.javed@zameen.com"),
    entityId: "CO-37", owner: "u18", assignedBy: "u6", stage: "Authorization (Board Resolution)", raisedDaysAgo: 2, pace: 1,
    fields: { reason: "Buyer issued dishonoured cheques against instalment plan then attempted unit resale.", filedBy: "TBD", authorizedPerson: "Mariam Khan (Recovery Officer)", boardResolutionProvided: false, policeStation: "PS Gulberg, Lahore" },
  }),

  // 8.5.2 Notices — received and issued, with auto-response for standard kinds.
  mk("notices", {
    title: "Citizen Portal complaint — agent conduct, Johar Town office",
    subType: "Government Authority", requestingDept: "Operations", requestedBy: req("PM Delivery Unit", "Citizen Portal", "pmdu.gov.pk"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Response Drafting", raisedDaysAgo: 3, pace: 1,
    fields: { serialNo: "N-2026-081", noticeDate: d(-4), receiptDate: d(-3), senderName: "PM Delivery Unit — Citizen Portal", recipient: "Zameen Media (Pvt) Ltd", category: "Citizen Portal Notice", details: "Complainant alleges misleading listing by a partner agent; response due in 15 days.", replyStatus: "Reply Required", autoResponseDraft: "Standard citizen-portal response drafted from template — pending counsel review." },
    activity: [{ at: d(-3), by: null, action: "Auto-response generated from the Citizen Portal Notice template — awaiting review", internal: true }],
  }),
  mk("notices", {
    title: "Legal notice — Falcon Estates alleging listing defamation",
    subType: "Other", requestingDept: "Legal", requestedBy: req("Front Desk", "Reception HO", "reception@zameen.com"),
    entityId: "CO-36", owner: "u6", assignedBy: "u6", stage: "Internal Review", raisedDaysAgo: 7, pace: 2, priority: "High",
    fields: { serialNo: "N-2026-076", noticeDate: d(-9), receiptDate: d(-7), senderName: "Falcon Estates (through counsel)", recipient: "Zameen Media (Pvt) Ltd", category: "Defamation Notice", details: "Demands removal of fraud-warning banner on developer profile and PKR 50M damages.", replyStatus: "Reply Required" },
  }),
  mk("notices", {
    title: "Court summons — CC-889 Riverview refund matter",
    subType: "Government Authority", requestingDept: "Legal", requestedBy: req("Court Bailiff", "Consumer Court", "lahore.courts"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Reply Submitted", raisedDaysAgo: 12, pace: 3,
    fields: { serialNo: "N-2026-069", noticeDate: d(-14), receiptDate: d(-12), senderName: "Consumer Court, Lahore", recipient: "Z Property Developments", category: "Hearing Notice / Court Summons", details: "Appearance required; linked to case CC-889/2026.", replyStatus: "Reply Submitted", replyDate: d(-8) },
  }),
  mk("notices", {
    title: "PTA notice — SMS marketing consent compliance",
    subType: "Government Authority", requestingDept: "Sales & Marketing", requestedBy: req("Hina Baig", "Brand Director", "hina.baig@zameen.com"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Assigned", raisedDaysAgo: 1, pace: 1,
    fields: { serialNo: "N-2026-083", noticeDate: d(-2), receiptDate: d(-1), senderName: "Pakistan Telecommunication Authority", recipient: "Zameen Media (Pvt) Ltd", category: "Government Notice", details: "Show-cause on bulk SMS without verified opt-in consent under the 2021 regulations.", replyStatus: "Reply Required" },
  }),
  mk("notices", {
    title: "Cease & desist received — 'ZamZam Property' name use",
    subType: "Other", requestingDept: "Legal", requestedBy: req("Front Desk", "Reception HO", "reception@zameen.com"),
    entityId: "CO-36", owner: "u19", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 28, pace: 5, closed: true,
    fields: { serialNo: "N-2026-058", noticeDate: d(-30), receiptDate: d(-28), senderName: "ZamZam Property Advisors (through counsel)", recipient: "Zameen Media (Pvt) Ltd", category: "IP Infringement", details: "Alleged our mark confuses with theirs; rebutted on priority and dissimilarity.", replyStatus: "Reply Submitted", replyDate: d(-20) },
  }),
  mk("notices", {
    title: "Developer PPA default notice — issued to Skyline Builders",
    subType: "Other", requestingDept: "Acquisition", requestedBy: req("Salman Tariq", "Acquisition Manager", "salman.tariq@zameen.com"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Reply Submitted", raisedDaysAgo: 10, pace: 2,
    fields: { serialNo: "N-2026-072", noticeDate: d(-8), receiptDate: d(-8), senderName: "Z Property Developments (issued by us)", recipient: "Skyline Builders", category: "Developer PPA", details: "30-day cure notice for missed construction milestone under the PPA.", replyStatus: "Reply Received", replyDate: d(-2) },
  }),

  // 8.6 Compliance with Government Authorities — inspections + cost analysis.
  mk("inspections", {
    title: "Labour inspection H1 — Zameen Media Head Office",
    subType: "Labour Department", requestingDept: "Admin", requestedBy: req("Labour Dept", "Inspectorate", "punjab.labour"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 55, pace: 11, closed: true,
    fields: { office: "Zameen Media — Head Office", inspectionDate: d(-50), officerName: "M. Asghar", officerDesignation: "Assistant Director Labour Welfare", irregularities: "Overtime register incomplete for contract staff.", bookSigned: true, costCurrentYear: 180000, costForthcomingYear: 150000, costReduced: true },
    costs: [{ type: "Consultancy Fee", estimated: 180000, actual: 180000, currency: "PKR", invoiceNo: "LC-2026-31", approvedBy: "u1", attribution: "Legal operating budget" }],
  }),
  mk("inspections", {
    title: "Labour inspection H2 — Square One Building",
    subType: "Labour Department", requestingDept: "Admin", requestedBy: req("Labour Dept", "Inspectorate", "punjab.labour"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Inspection Scheduled", raisedDaysAgo: 2, pace: 1,
    fields: { office: "Zameen Media — Square One Building", inspectionDate: d(20), costCurrentYear: 160000, costForthcomingYear: 160000, costReduced: false },
  }),
  mk("inspections", {
    title: "Civil Defence annual — B64 fire & safety",
    subType: "Civil Defence (Fire & Safety)", requestingDept: "Admin", requestedBy: req("Civil Defence", "Directorate", "punjab.cd"),
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Book Signed / Certificate Issued", raisedDaysAgo: 14, pace: 3,
    fields: { office: "Zameen Media — B64", inspectionDate: d(-8), officerName: "Rafiq Ahmed", officerDesignation: "Civil Defence Officer", irregularities: "Two extinguishers past refill date — replaced on the spot.", certificateIssued: true, consultancyFee: 75000, costCurrentYear: 75000, costForthcomingYear: 70000, costReduced: true },
    costs: [{ type: "Consultancy Fee", estimated: 75000, actual: 75000, currency: "PKR", invoiceNo: "CD-2026-112", approvedBy: "u1", attribution: "Legal operating budget" }],
  }),
  mk("inspections", {
    title: "Labour inspection H1 — New Auriga office",
    subType: "Labour Department", requestingDept: "Admin", requestedBy: req("Labour Dept", "Inspectorate", "punjab.labour"),
    entityId: "CO-36", owner: "u17", assignedBy: "u6", stage: "Irregularities Remediation", raisedDaysAgo: 10, pace: 2,
    holds: [{ dept: "HR", reason: "Awaiting Documents", startDaysAgo: 4, endDaysAgo: 1 }],
    fields: { office: "Zameen Media — New Auriga", inspectionDate: d(-9), officerName: "S. Kanwal", officerDesignation: "Labour Inspector", irregularities: "EOBI registration proof missing for 12 outsourced staff.", bookSigned: false, costCurrentYear: 140000, costForthcomingYear: 155000, costReduced: false },
  }),
  mk("inspections", {
    title: "Civil Defence annual — OLX office",
    subType: "Civil Defence (Fire & Safety)", requestingDept: "Admin", requestedBy: req("Civil Defence", "Directorate", "sindh.cd"),
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 70, pace: 14, closed: true,
    fields: { office: "OLX", inspectionDate: d(-65), officerName: "N. Qazi", officerDesignation: "Civil Defence Officer", irregularities: "None.", certificateIssued: true, consultancyFee: 68000, costCurrentYear: 68000, costForthcomingYear: 68000, costReduced: false },
    costs: [{ type: "Consultancy Fee", estimated: 68000, actual: 68000, currency: "PKR", invoiceNo: "CD-2026-089", attribution: "Legal operating budget" }],
  }),
  mk("inspections", {
    title: "Labour inspection H1 — Zameen Developments Mega Tower",
    subType: "Labour Department", requestingDept: "Admin", requestedBy: req("Labour Dept", "Inspectorate", "punjab.labour"),
    entityId: "CO-37", owner: "u17", assignedBy: "u6", stage: "Closed", raisedDaysAgo: 48, pace: 10, closed: true,
    fields: { office: "Zameen Developments — Mega Tower", inspectionDate: d(-44), officerName: "M. Asghar", officerDesignation: "Assistant Director Labour Welfare", irregularities: "None.", bookSigned: true, costCurrentYear: 165000, costForthcomingYear: 140000, costReduced: true },
  }),
  mk("inspections", {
    title: "Civil Defence annual — Dubizzle Mega Tower",
    subType: "Civil Defence (Fire & Safety)", requestingDept: "Admin", requestedBy: req("Civil Defence", "Directorate", "punjab.cd"),
    entityId: "CO-36", owner: "u18", assignedBy: "u6", stage: "Inspection Scheduled", raisedDaysAgo: 1, pace: 1,
    fields: { office: "Dubizzle — Mega Tower", inspectionDate: d(35), costCurrentYear: 80000, costForthcomingYear: 80000, costReduced: false },
  }),
];

export const MOD_REQUESTS = [...LIT, ...CRM, ...CMP];

/* ---------------- Section 8.5.2 — auto-response templates ---------------- */
export const NOTICE_TEMPLATES = [
  {
    id: "NT-1", category: "Citizen Portal Notice",
    template: "Dear {{sender}},\n\nWe acknowledge receipt of complaint {{serialNo}} dated {{noticeDate}}. {{recipient}} takes platform-conduct complaints seriously. The listing in question has been referred to our Trust & Safety desk for verification against our advertising standards, and interim measures have been applied pending review.\n\nA detailed response with our findings will follow within the statutory window.\n\nSincerely,\nLegal Department, {{recipient}}",
  },
  {
    id: "NT-2", category: "IP Infringement",
    template: "Dear {{sender}},\n\nWe write in response to your notice {{serialNo}} dated {{noticeDate}}. {{recipient}} is the registered proprietor of the marks in question, with priority predating the matters you describe. We reject the assertions made, reserve all rights, and require that any further correspondence be directed to the undersigned.\n\nWithout prejudice,\nLegal Department, {{recipient}}",
  },
  {
    id: "NT-3", category: "Defamation Notice",
    template: "Dear {{sender}},\n\nWe acknowledge your notice {{serialNo}} dated {{noticeDate}}. The statements complained of are matters of verifiable fact published in the public interest, and no retraction is warranted. Our client reserves all rights, including as to costs.\n\nWithout prejudice,\nLegal Department, {{recipient}}",
  },
  {
    id: "NT-4", category: "Legal Notice",
    template: "Dear {{sender}},\n\nReceipt of your notice {{serialNo}} dated {{noticeDate}} is acknowledged. The contents are noted and are being reviewed by counsel. A substantive response will follow in due course. Nothing herein shall be construed as an admission.\n\nWithout prejudice,\nLegal Department, {{recipient}}",
  },
];

/* ---------------- Section 13 — cost budgets (USD, per quarter) ---------------- */
export const COST_BUDGETS = [
  { id: "B-LIT", team: "litigation", quarterUsd: 45000 },
  { id: "B-CRM", team: "commercial", quarterUsd: 25000 },
  { id: "B-CMP", team: "compliance", quarterUsd: 18000 },
];
