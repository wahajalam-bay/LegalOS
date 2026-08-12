// The module registry — Sections 4 to 8 of the Functional Requirements Document,
// expressed declaratively. One generic page renders any module from this spec:
// field schemas (with source-group tags and team-internal flags), workflows,
// stage-level SLAs, and list columns. Pure data + pure functions: no React.
import { masterList } from "./org.js";

/* Field spec:
   { key, label, type, from?, options?, group?, source?, internal?, showIf?,
     required?, hint?, request? }
   type: text | textarea | number | money | date | select | toggle | entity | user
   from:      master-data list key (options resolved live, so admin edits apply)
   group:     detail-view grouping header
   source:    which department OWNS the field (HR / Admin / Legal) — Section 8.2
   internal:  team-internal — stripped from the requester's own-request view (14.4)
   request:   collected on the Raise Request form (Section 14.2 step 3)
   showIf(f): conditional visibility, evaluated against the record's fields
*/

export const MODULES = [
  /* ============ COMMERCIAL & RISK MANAGEMENT ============ */
  {
    key: "contracts",
    team: "commercial",
    label: "Contracts",
    icon: "file",
    noun: "contract request",
    subTypeLabel: "Contract Type",
    subTypesFrom: "contractTypes",
    workflow: ["Request Raised", "Assigned", "Drafting", "Internal Review", "Risk Assessment", "Final Review", "Submission for Signature", "Executed / Closed"],
    // Section 4.3 — Template Type drives the drafting TAT.
    slas: {
      Drafting: { byField: "templateType", map: { "Existing Template": 3, "New Template": 7 }, default: 3 },
      "Internal Review": 2,
    },
    riskGate: { before: "Submission for Signature", fields: ["riskRating", "riskReviewedBy", "riskSignoffDate"] },
    fields: [
      { key: "ppaCategory", label: "PPA Category", type: "select", fromByJurisdiction: { KSA: "ppaCategoriesKsa", Pakistan: "ppaCategoriesPk" }, request: true, showIf: (f, rec) => (rec.subType === "PPA"), hint: "Jurisdiction-dependent — KSA and Pakistan use different models." },
      { key: "jurisdictionModel", label: "Jurisdiction Model", type: "select", options: ["KSA", "Pakistan"], request: true, showIf: (f, rec) => rec.subType === "PPA" },
      { key: "templateType", label: "Template Type", type: "select", options: ["Existing Template", "New Template"], request: true, required: true, hint: "Drives the drafting TAT: 3 days existing, 7 days new." },
      { key: "counterpartyId", label: "Counterparty", type: "entity", request: true, hint: "From the Counterparty / Entity Registry — never re-typed." },
      { key: "value", label: "Contract Value", type: "money", request: true },
      { key: "currency", label: "Currency", type: "select", options: ["PKR", "USD", "SAR"], request: true },
      { key: "expiry", label: "Contract Term / Expiry", type: "date", request: true },
      { key: "renewalFlag", label: "Renewal Flag", type: "toggle", request: true },
      { key: "instructions", label: "Additional Instructions", type: "textarea", request: true, hint: "If Contract Type is Other, describe the contract here." },
      { key: "riskRating", label: "Risk Rating", type: "select", options: ["High", "Medium", "Low"], group: "Risk Assessment" },
      { key: "riskReviewedBy", label: "Reviewed By", type: "user", group: "Risk Assessment" },
      { key: "riskNotes", label: "Risk Notes", type: "textarea", group: "Risk Assessment", internal: true },
      { key: "riskSignoffDate", label: "Sign-off Date", type: "date", group: "Risk Assessment" },
    ],
    columns: ["subType", "entityId", "counterpartyId", "templateType", "owner", "stage", "tat"],
    versionLog: true,
  },
  {
    key: "vetting",
    team: "commercial",
    label: "Risk Vetting",
    icon: "checkcircle",
    noun: "vetting request",
    subTypeLabel: "Vetting Subject",
    subTypes: ["Counterparty Vetting", "Deal Structure Review", "Commercial Terms Review", "Other"],
    workflow: ["Request Raised", "Assigned", "Review", "Risk Assessment", "Advisory Issued", "Closed"],
    slas: { Review: 2, "Risk Assessment": 1 },
    fields: [
      { key: "counterpartyId", label: "Counterparty", type: "entity", request: true },
      { key: "context", label: "Deal Context", type: "textarea", request: true },
      { key: "riskRating", label: "Risk Rating", type: "select", options: ["High", "Medium", "Low"], group: "Risk Assessment" },
      { key: "advisory", label: "Advisory / Recommendation", type: "textarea", group: "Risk Assessment", internal: true },
    ],
    columns: ["subType", "counterpartyId", "owner", "stage", "tat"],
  },

  /* ============ COMPLIANCE ============ */
  {
    key: "agreements",
    team: "compliance",
    label: "Lease, Loan & Service",
    icon: "clipboard",
    noun: "agreement",
    subTypeLabel: "Agreement Type",
    subTypesFrom: "agreementTypes",
    workflow: ["Request Raised", "Assigned", "Drafting", "Internal Review", "Final Review", "Submission for Signature", "Executed / Closed"],
    renewalWorkflow: ["Renewal Trigger", "Assigned", "Terms Review", "Draft Renewal / Amendment", "Internal Review", "Submission for Signature", "Renewed / Closed"],
    slas: { Drafting: 3, "Internal Review": 2 },
    renewal: { dueField: "renewalDue", leadDays: 30, reminders: [30, 15, 7] },
    fields: [
      { key: "counterpartyId", label: "Counterparty", type: "entity", request: true, hint: "Lessor / lessee, lender / borrower, or service provider." },
      { key: "value", label: "Agreement Value / Principal", type: "money", request: true },
      { key: "currency", label: "Currency", type: "select", options: ["PKR", "USD", "SAR"], request: true },
      { key: "expiry", label: "Term / Expiry Date", type: "date", request: true },
      { key: "renewalTerm", label: "Renewal Term", type: "text", request: true },
      { key: "renewalDue", label: "Renewal Due Date", type: "date", request: true },
      { key: "renewalStatus", label: "Renewal Status", type: "select", options: ["Not Due", "Trigger Raised", "In Progress", "Renewed", "Not Renewing"] },
      { key: "renewalOwner", label: "Renewal Owner", type: "user", hint: "Drafting and renewal owners may differ over time." },
    ],
    columns: ["subType", "counterpartyId", "renewalDue", "owner", "stage", "tat"],
  },
  {
    key: "resolutions",
    team: "compliance",
    label: "Resolutions",
    icon: "checksquare",
    noun: "resolution",
    subTypeLabel: "Resolution Type",
    subTypesFrom: "resolutionTypes",
    workflow: ["Request Raised", "Assigned", "Drafting", "Review", "Finalize & Sign", "Upload to Resolutions Tracker", "Closed"],
    slas: { Drafting: 2, Review: 1 },
    fields: [
      { key: "purpose", label: "Purpose", type: "textarea", request: true, required: true },
      { key: "urgency", label: "Urgency", type: "select", options: ["Urgent", "Normal"], request: true, required: true, hint: "Tracked per request, distinct from the general priority flag — reported separately." },
      { key: "authority", label: "Addressed To / Authority", type: "select", from: "authorities", request: true },
      { key: "authorizedPersons", label: "Authorized Person(s)", type: "textarea", request: true, hint: "Name, designation, CNIC if required." },
      { key: "resolutionDate", label: "Resolution Date", type: "date" },
      { key: "uploadedToTracker", label: "Uploaded on Resolutions Tracker", type: "toggle" },
      { key: "trackerUploadDate", label: "Tracker Upload Date", type: "date", showIf: (f) => !!f.uploadedToTracker },
      { key: "trackerLink", label: "Tracker Link", type: "text", showIf: (f) => !!f.uploadedToTracker },
    ],
    columns: ["subType", "requestingDept", "urgencyCol", "authorityCol", "owner", "stage", "tat"],
    report: "byDepartment", // Section 6.4
  },
  {
    key: "licenses",
    team: "compliance",
    label: "License Renewals",
    icon: "fileCheck",
    noun: "license renewal",
    subTypeLabel: "License Type",
    subTypesFrom: "licenseTypes",
    workflow: ["Renewal Trigger", "Assigned", "Document Collection", "Submission to Authority", "Awaiting Response", "Renewed / Closed"],
    slas: { "Document Collection": 3 },
    renewal: { dueField: "renewalDue", leadDays: 30, reminders: [30, 15, 7] },
    fields: [
      { key: "licenseName", label: "License Name", type: "text", request: true, required: true },
      { key: "authority", label: "Issuing Authority", type: "select", from: "authorities", request: true },
      { key: "issueDate", label: "Issue Date", type: "date", request: true },
      { key: "renewalTerm", label: "Renewal Term", type: "text", request: true },
      { key: "renewalDue", label: "Renewal Due Date", type: "date", request: true, required: true },
      { key: "renewalStatus", label: "Renewal Status", type: "select", options: ["Not Due", "Trigger Raised", "In Progress", "Renewed", "Lapsed"] },
      { key: "linkedLicenseId", label: "Register Entry", type: "text", hint: "Links to the license register record." },
    ],
    columns: ["fields.licenseName", "subType", "fields.authority", "renewalDueCol", "owner", "stage", "tat"],
  },
  {
    key: "secpFilings",
    team: "compliance",
    label: "SECP Filings",
    icon: "briefcase",
    noun: "SECP filing",
    subTypeLabel: "SECP Form Type",
    subTypesFrom: "secpFormTypes",
    // Section 8.2 — event-based filings are raised on a corporate event (often a
    // board resolution); periodic (annual) filings are system-triggered 30 days
    // before they fall due and then follow the same preparation path.
    workflow: ["Request Raised", "Assigned", "Preparation", "Internal Review", "Filed with SECP", "Closed"],
    renewalWorkflow: ["Filing Trigger", "Assigned", "Preparation", "Internal Review", "Filed with SECP", "Closed"],
    slas: { Preparation: 3, "Internal Review": 2 },
    renewal: { dueField: "filingDueDate", leadDays: 30, reminders: [30, 15, 7] },
    fields: [
      { key: "filingEntityId", label: "Filing Entity", type: "entity", request: true, required: true, hint: "The group entity the statutory filing is made for — from the Entities registry (Section 2)." },
      { key: "filingCategory", label: "Filing Category", type: "select", options: ["Periodic (Annual)", "Event-Based"], request: true, required: true, hint: "Periodic filings are auto-triggered 30 days before due; event-based ones are raised on a corporate event." },
      { key: "filingDueDate", label: "Filing Due Date", type: "date", request: true, hint: "Statutory deadline — periodic filings trigger 30 days before this date." },
      { key: "filingDate", label: "Filing Date", type: "date", hint: "Actual date the form was filed with SECP." },
      { key: "filingStatus", label: "Filing Status", type: "select", options: ["Not Due", "Due Soon", "Filed", "Overdue"] },
      { key: "linkedResolution", label: "Linked Resolution", type: "text", hint: "Optional — the Resolutions record that triggered this filing (e.g. CMP-0007)." },
      { key: "authorizedPerson", label: "Authorized Person to do Filing", type: "text", request: true },
      { key: "ctcApplied", label: "CTC Applied", type: "toggle", hint: "Certified True Copy applied for after filing." },
    ],
    columns: ["fields.filingEntityId", "subType", "fields.filingCategory", "fields.filingStatus", "fields.filingDueDate", "owner", "tat"],
  },

  /* ============ LITIGATION & DISPUTE MANAGEMENT ============ */
  {
    key: "cases",
    team: "litigation",
    label: "Case Handling",
    icon: "gavel",
    noun: "case",
    subTypeLabel: "Case Nature",
    subTypes: ["Recovery Suit", "Civil Suit", "Writ Petition", "Labour Case", "Consumer Complaint", "Arbitration", "Criminal Complaint", "Appeal"],
    // TAT tracks Internal Task TAT (legal-controlled steps), not total case age.
    workflow: ["Task Raised", "Assigned", "Drafting", "Internal Review", "Submitted to Court", "Closed"],
    // Once the filing is with the court, the legal-controlled work is done —
    // the internal-task clock freezes there (Section 8.1 note).
    clockStops: ["Submitted to Court"],
    slas: { Drafting: 4, "Internal Review": 2 },
    tatNote: "TAT tracks internal legal tasks (e.g. drafting a written statement), not total case age — the courts control that.",
    fields: [
      { key: "caseNumber", label: "Case Number", type: "text", request: true },
      { key: "court", label: "Court / Forum", type: "text", request: true },
      { key: "position", label: "Company Position", type: "select", options: ["Plaintiff", "Defendant", "Petitioner", "Respondent", "Complainant"], request: true },
      { key: "caseStatus", label: "Case Status", type: "select", options: ["In Progress", "Completed"] },
      { key: "proceedings", label: "Proceedings", type: "textarea", internal: true },
      { key: "filingDate", label: "Filing Date", type: "date", request: true },
      { key: "counselType", label: "Assigned Counsel", type: "select", options: ["Internal", "External"] },
      { key: "counselName", label: "Counsel Name", type: "text" },
      { key: "recoverablePkr", label: "Financial Recoverable (PKR)", type: "money", group: "Financials" },
      { key: "exposurePkr", label: "Financial Exposure (PKR)", type: "money", group: "Financials" },
      { key: "riskRating", label: "Risk Rating", type: "select", options: ["High", "Medium", "Low"], group: "Financials" },
      { key: "outcome", label: "Outcome", type: "textarea", group: "Financials" },
    ],
    columns: ["fields.caseNumber", "subType", "fields.court", "nextHearingCol", "owner", "stage", "tat"],
    hearings: true, // Section 8.1 — one matter, many hearings
  },
  {
    key: "assetRecovery",
    team: "litigation",
    label: "Asset Recovery",
    icon: "refresh",
    noun: "recovery case",
    subTypeLabel: "Region",
    subTypes: ["National", "North", "Head Office", "Central", "South"],
    workflow: ["Case Opened", "Assigned", "Demand Notice", "Negotiation / Recovery", "Settlement", "Closed"],
    slas: { "Demand Notice": 3 },
    // Section 8.2 — three sources, each field tagged so ownership stays clear.
    fields: [
      { key: "employeeId", label: "Employee ID", type: "text", source: "HR", group: "HR Input", request: true },
      { key: "employeeName", label: "Employee Name", type: "text", source: "HR", group: "HR Input", request: true, required: true },
      { key: "department", label: "Department", type: "select", from: "requestingDepartments", source: "HR", group: "HR Input", request: true },
      { key: "city", label: "City", type: "text", source: "HR", group: "HR Input", request: true },
      { key: "month", label: "Month", type: "text", source: "HR", group: "HR Input" },
      { key: "complaintDate", label: "Complaint Date", type: "date", source: "HR", group: "HR Input" },
      { key: "joiningDate", label: "Date of Joining", type: "date", source: "HR", group: "HR Input" },
      { key: "lastWorkingDay", label: "Last Working Day", type: "date", source: "HR", group: "HR Input", request: true },
      { key: "excessLeaves", label: "Excess Leaves", type: "number", source: "HR", group: "HR Input" },
      { key: "overutilizedDays", label: "Over-utilized Days", type: "number", source: "HR", group: "HR Input" },
      { key: "pendingSalary", label: "Pending Salary (PKR)", type: "money", source: "HR", group: "HR Input" },
      { key: "providentFund", label: "Provident Fund, if any (PKR)", type: "money", source: "HR", group: "HR Input" },
      { key: "totalPayable", label: "Total Payable to Employee (PKR)", type: "money", source: "HR", group: "HR Input" },
      { key: "showCauseDate", label: "Show-cause Date", type: "date", source: "HR", group: "HR Input" },
      { key: "personnelFileLink", label: "Personnel File Link", type: "text", source: "HR", group: "HR Input" },
      { key: "totalAssetPv", label: "Total Asset Purchase Value (PKR)", type: "money", source: "HR", group: "Asset Details" },
      { key: "laptopPv", label: "Laptop PV (PKR)", type: "money", source: "HR", group: "Asset Details" },
      { key: "mobilePv", label: "Mobile PV (PKR)", type: "money", source: "HR", group: "Asset Details" },
      { key: "winglePv", label: "Wingle PV (PKR)", type: "money", source: "HR", group: "Asset Details" },
      { key: "otherItPv", label: "Other IT Equipment (bag, charger, etc.)", type: "money", source: "HR", group: "Asset Details" },
      { key: "settlementNegative", label: "Final Settlement Negative Amount (PKR)", type: "money", source: "HR", group: "Asset Details" },
      { key: "laptopNegative", label: "Laptop Negative Balance (PKR)", type: "money", source: "Admin", group: "Admin Input" },
      { key: "vehicleNegative", label: "Vehicle Negative Balance (PKR)", type: "money", source: "Admin", group: "Admin Input" },
      { key: "mobileNegative", label: "Mobile Negative Balance (PKR)", type: "money", source: "Admin", group: "Admin Input" },
      { key: "otherAdmin", label: "Other Admin Inputs", type: "textarea", source: "Admin", group: "Admin Input" },
      { key: "recoveryNotes", label: "Recovery Officer's Notes", type: "textarea", source: "Legal", group: "Legal Input", internal: true },
      { key: "vehicleIssueDate", label: "Issue Date of Vehicle", type: "date", source: "Legal", group: "Legal Input" },
      { key: "vehiclePrice", label: "Price of Vehicle (PKR)", type: "money", source: "Legal", group: "Legal Input" },
      { key: "totalVehicleNegative", label: "Total Negative Vehicle Balance (PKR)", type: "money", source: "Legal", group: "Legal Input" },
      { key: "legalAction", label: "Legal Action", type: "select", options: ["Asset Recovered", "Asset Not Recovered", "No Action Required"], source: "Legal", group: "Legal Input" },
      { key: "recoveryDate", label: "Recovery Date", type: "date", source: "Legal", group: "Legal Input" },
      { key: "assetsReceivedBy", label: "Assets Received By", type: "text", source: "Legal", group: "Legal Input" },
      { key: "finalComments", label: "Final Comments", type: "textarea", source: "Legal", group: "Legal Input" },
      { key: "totalRecovered", label: "Total Value Recovered (PKR)", type: "money", source: "Legal", group: "Legal Input" },
    ],
    columns: ["fields.employeeName", "fields.department", "subType", "fields.legalAction", "recoveredCol", "owner", "stage", "tat"],
  },
  {
    key: "ip",
    team: "litigation",
    label: "IP Portfolio",
    icon: "tag",
    noun: "IP request",
    subTypeLabel: "Request Type",
    subTypesFrom: "ipRequestTypes",
    workflow: ["Request Raised", "Assigned", "Drafting / Filing Preparation", "Internal Review", "Submission to IP Office", "Registered / Renewed / Closed"],
    slas: { "Drafting / Filing Preparation": 5, "Internal Review": 2 },
    renewal: { dueField: "renewalDue", leadDays: 30, reminders: [30, 15, 7] },
    fields: [
      { key: "markName", label: "Mark Name", type: "text", request: true, required: true },
      { key: "markImage", label: "Mark Image (ref)", type: "text", request: true },
      { key: "country", label: "Country", type: "select", options: ["Pakistan", "Saudi Arabia", "UAE"], request: true },
      { key: "classes", label: "Classes", type: "text", request: true, hint: "Nice classification, e.g. 35, 36, 42." },
      { key: "regNumber", label: "TM Registration Number", type: "text" },
      { key: "filingDate", label: "Filing Date", type: "date" },
      { key: "regDate", label: "Registration Date", type: "date" },
      { key: "renewalDue", label: "Renewal Due", type: "date" },
      { key: "ipStatus", label: "Status", type: "select", options: ["Filed", "Pending Application", "Pending Registration", "Registered", "Renewed"] },
      { key: "subStatus", label: "Sub-status", type: "select", options: ["Accepted", "Pending Examination", "Published", "Registered", "Renewed"] },
      { key: "registeredOwner", label: "Registered Owner", type: "entity" },
      { key: "ownerAddress", label: "Address", type: "text" },
      { key: "localCounsel", label: "Local Current Counsel", type: "text" },
    ],
    columns: ["fields.markName", "subType", "fields.country", "fields.ipStatus", "renewalDueCol", "owner", "tat"],
  },
  {
    key: "developerDisputes",
    team: "litigation",
    label: "Developer Disputes",
    icon: "building",
    noun: "dispute",
    subTypeLabel: "Project Type",
    subTypes: ["CPML Project"],
    workflow: ["Raised", "Assigned", "Assessment", "Action in Progress", "Resolved / Closed"],
    slas: { Assessment: 3 },
    fields: [
      { key: "nature", label: "Description / Nature of Dispute", type: "textarea", request: true, required: true },
      { key: "latestUpdate", label: "Latest Update", type: "textarea" },
      { key: "actionRequired", label: "Action Required", type: "textarea" },
      { key: "actionTaken", label: "Action Taken", type: "textarea" },
      { key: "region", label: "Region", type: "select", options: ["Central", "North", "South"], request: true },
      { key: "authorizedPerson", label: "Authorized Person Dealing", type: "user" },
    ],
    columns: ["title", "fields.region", "fields.authorizedPerson", "owner", "stage", "tat"],
  },
  {
    key: "police",
    team: "litigation",
    label: "Police Complaints",
    icon: "alertTriangle",
    noun: "complaint",
    subTypeLabel: "Complaint Type",
    subTypesFrom: "complaintTypes",
    workflow: ["Complaint Raised", "Authorization (Board Resolution)", "Filed with Police Station", "FIR Lodged", "Under Investigation", "Closed"],
    slas: { "Authorization (Board Resolution)": 2 },
    fields: [
      { key: "reason", label: "Reason", type: "textarea", request: true, required: true },
      { key: "filedBy", label: "Complaint Filed By", type: "text", request: true },
      { key: "authorizedPerson", label: "Authorized Person to File", type: "text", request: true },
      { key: "boardResolutionProvided", label: "Board Resolution Provided", type: "toggle" },
      { key: "policeStation", label: "Concerned Police Station", type: "text", request: true },
      { key: "complaintDate", label: "Date of Complaint", type: "date" },
      { key: "firDate", label: "Date of FIR Lodging", type: "date" },
    ],
    columns: ["subType", "fields.policeStation", "fields.firDate", "owner", "stage", "tat"],
  },
  {
    key: "notices",
    team: "litigation",
    label: "Notices",
    icon: "mail",
    noun: "notice",
    subTypeLabel: "Notice Source",
    subTypes: ["Government Authority", "Other"],
    workflow: ["Notice Logged", "Assigned", "Response Drafting", "Internal Review", "Reply Submitted", "Closed"],
    slas: { "Response Drafting": 3, "Internal Review": 1 },
    autoResponse: true, // Section 8.5.2 — standard notices get an auto-drafted reply
    fields: [
      { key: "serialNo", label: "Serial Number", type: "text" },
      { key: "noticeDate", label: "Date of Notice", type: "date", request: true },
      { key: "receiptDate", label: "Date of Receipt", type: "date", request: true },
      { key: "senderName", label: "Sender Name", type: "text", request: true, required: true },
      { key: "recipient", label: "Recipient", type: "text", request: true },
      { key: "category", label: "Category of Notice", type: "select", from: "noticeCategories", request: true, required: true },
      { key: "details", label: "Details of Notice", type: "textarea", request: true },
      { key: "replyStatus", label: "Status", type: "select", options: ["Reply Required", "Reply Received", "Reply Submitted"] },
      { key: "replyDate", label: "Date of Reply", type: "date" },
      { key: "autoResponseDraft", label: "Auto-drafted Response", type: "textarea", internal: true },
    ],
    columns: ["fields.senderName", "fields.category", "fields.replyStatus", "fields.noticeDate", "owner", "stage", "tat"],
  },
  {
    key: "inspections",
    team: "litigation",
    label: "Govt Inspections",
    icon: "shield",
    noun: "inspection",
    subTypeLabel: "Inspection Type",
    subTypes: ["Labour Department", "Civil Defence (Fire & Safety)"],
    workflow: ["Inspection Scheduled", "Conducted", "Irregularities Remediation", "Book Signed / Certificate Issued", "Closed"],
    slas: { "Irregularities Remediation": 5 },
    fields: [
      { key: "office", label: "Office / Entity", type: "select", from: "inspectionOffices", request: true, required: true },
      { key: "inspectionDate", label: "Inspection Date", type: "date", request: true },
      { key: "officerName", label: "Inspecting Officer Name", type: "text" },
      { key: "officerDesignation", label: "Officer Designation", type: "text" },
      { key: "irregularities", label: "Irregularities Noticed", type: "textarea" },
      { key: "bookSigned", label: "Inspection Book Signed", type: "toggle", showIf: (f, rec) => rec.subType === "Labour Department" },
      { key: "certificateIssued", label: "Inspection Certificate Issued", type: "toggle", showIf: (f, rec) => rec.subType !== "Labour Department" },
      { key: "consultancyFee", label: "Consultancy Fee (PKR)", type: "money", group: "Cost Analysis", showIf: (f, rec) => rec.subType !== "Labour Department" },
      { key: "costCurrentYear", label: "Cost per Office — Current Year (PKR)", type: "money", group: "Cost Analysis" },
      { key: "costForthcomingYear", label: "Cost — Forthcoming Year (PKR)", type: "money", group: "Cost Analysis" },
      { key: "costReduced", label: "Cost Reduced", type: "toggle", group: "Cost Analysis" },
    ],
    columns: ["fields.office", "subType", "fields.inspectionDate", "costYoYCol", "owner", "stage", "tat"],
    cadenceNote: "Labour Department inspections are bi-annual; Civil Defence is annual.",
  },
];

export const moduleByKey = (key) => MODULES.find((m) => m.key === key) || null;
export const modulesForTeam = (teamKey) => MODULES.filter((m) => m.team === teamKey);
export const moduleRoute = (key, id) => "/m/" + key + (id ? "/" + id : "");

// Sub-type options, live from master data where the module points at a list.
export function subTypesOf(def, md) {
  if (!def) return [];
  if (def.subTypesFrom) return masterList(md, def.subTypesFrom);
  return def.subTypes || [];
}

// Options for a select field — master list, jurisdiction-dependent master list,
// or a fixed set.
export function fieldOptions(field, md, rec = {}) {
  if (field.fromByJurisdiction) {
    const jur = (rec.fields || {}).jurisdictionModel || "KSA";
    return masterList(md, field.fromByJurisdiction[jur] || field.fromByJurisdiction.KSA);
  }
  if (field.from) return masterList(md, field.from);
  return field.options || [];
}

// The stage SLA in working days — `{ byField }` rules resolve against the record.
export function slaFor(def, rec, stage) {
  const rule = def && def.slas && def.slas[stage];
  if (rule == null) return null;
  if (typeof rule === "number") return rule;
  const v = ((rec || {}).fields || {})[rule.byField];
  return (rule.map && rule.map[v]) != null ? rule.map[v] : rule.default;
}

// A record's workflow path — renewal-triggered records follow the renewal path.
export function workflowOf(def, rec) {
  if (!def) return [];
  if (rec && rec.flow === "renewal" && def.renewalWorkflow) return def.renewalWorkflow;
  return def.workflow || [];
}

// Total SLA budget for a record = sum of its staged SLAs (used for the
// whole-request Overdue verdict when stage SLAs exist).
export function totalSla(def, rec) {
  const path = workflowOf(def, rec);
  let sum = 0, any = false;
  for (const s of path) {
    const d = slaFor(def, rec, s);
    if (d != null) { sum += d; any = true; }
  }
  // Stages without an SLA still take time — give each remaining working stage
  // one budget day so the total is realistic rather than punitive.
  const unbudgeted = path.filter((s) => slaFor(def, rec, s) == null).length;
  return any ? sum + Math.max(0, unbudgeted - 2) : null;
}

// Risk gate (Section 4.2) — the fields that must be complete before the given
// stage can be entered. Returns the missing field keys.
export function riskGateMissing(def, rec, targetStage) {
  const gate = def && def.riskGate;
  if (!gate || gate.before !== targetStage) return [];
  const f = (rec || {}).fields || {};
  return gate.fields.filter((k) => !f[k]);
}
