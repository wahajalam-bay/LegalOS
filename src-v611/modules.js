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
    label: "Contract Review",
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
    label: "Risk Analysis",
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
    // Filing Module (Compliance) — Section 8 of the review addendum.
    key: "filings",
    team: "compliance",
    label: "SECP Filings",
    icon: "book",
    noun: "filing",
    subTypeLabel: "SECP Form Type",
    subTypesFrom: "secpFormTypes", // 8.1 — configurable in Settings, no dev cycle
    // 8.2 — event-based filings arrive as requests (often off the back of a
    // corporate event / resolution)…
    workflow: ["Request Raised", "Assigned", "Preparation", "Internal Review", "Filed with SECP", "Closed"],
    // …periodic filings are system-generated 30 days before the statutory due
    // date and enter at Filing Trigger.
    flows: {
      periodic: ["Filing Trigger", "Assigned", "Preparation", "Internal Review", "Filed with SECP", "Closed"],
    },
    slas: { Preparation: 3, "Internal Review": 2 },
    tatNote: "Periodic filings (e.g. Form A) are system-generated 30 days before the due date; event-based filings (e.g. Form 9, Form 29) arrive as requests, often linked to a resolution.",
    fields: [
      { key: "filingCategory", label: "Filing Category", type: "select", options: ["Periodic (Annual)", "Event-Based"], request: true, required: true },
      { key: "periodEnd", label: "Period / Year End", type: "date", showIf: (f) => f.filingCategory !== "Event-Based", hint: "The financial or reporting period this filing covers." },
      { key: "dueDate", label: "Statutory Due Date", type: "date", request: true, required: true, hint: "Drives the filing status and the 30-day system trigger." },
      { key: "filingDate", label: "Filing Date (actual)", type: "date" },
      { key: "linkedResolutionId", label: "Linked Resolution", type: "record", recordModule: "resolutions", request: true, showIf: (f) => f.filingCategory !== "Periodic (Annual)", hint: "Optional — where the filing was triggered by a board resolution." },
      { key: "authorizedPerson", label: "Authorized Person to File", type: "text", request: true, hint: "Company secretary, director or consultant authorized on SECP eServices." },
      { key: "ctcApplied", label: "CTC Applied", type: "toggle", hint: "Certified true copy requested from SECP." },
      { key: "srn", label: "SECP SRN / Challan No", type: "text", showIf: (f) => !!f.filingDate },
    ],
    columns: ["title", "entityId", "subType", "filingDueCol", "filingStatusCol", "owner", "stage"],
    report: "byEntity", // 8.3 — per-entity filing status view
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
      { key: "recoverablePkr", label: "Recoverable", type: "money", group: "Financials" },
      { key: "exposurePkr", label: "Exposure", type: "money", group: "Financials" },
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
    /* Each module says what IT creates. "New complaint" is right here and
       wrong everywhere else; one generic label across six modules is how a
       user ends up raising a court case when they meant to log a visit. */
    createLabel: "New Police Complaint",
    label: "Police Complaints",
    icon: "alertTriangle",
    noun: "complaint",
    subTypeLabel: "Complaint Type",
    subTypesFrom: "complaintTypes",
    /* THE WORKFLOW A POLICE COMPLAINT ACTUALLY FOLLOWS, INCLUDING WHEN IT STOPS.
       A complaint that the police do not act on does not end -- it PAUSES while
       a 22-A / 22-B petition is heard in the Sessions Court, and resumes or
       dies depending on what that court orders. Modelling the pause as "Closed"
       loses the matter entirely: the original complaint keeps its documents,
       its diary number and its history, and the petition is a separate
       proceeding that points back at it. */
    workflow: ["Complaint Raised", "Authorization (Board Resolution)", "Filed with Police Station",
      "Police Inquiry", "FIR Lodged", "Under Investigation",
      "Paused – 22-A / 22-B Proceedings", "Closed"],
    slas: { "Authorization (Board Resolution)": 2 },
    fields: [
      /* Which way the complaint runs. A complaint against the company is not a
         variant of one the company filed -- the parties swap, and so does what
         Legal has to do about it. */
      { key: "direction", label: "Complaint Direction", type: "select",
        options: ["Filed by the company", "Filed against the company"], request: true, required: true },
      { key: "reason", label: "Nature of Complaint", type: "textarea", request: true, required: true },
      { key: "complainant", label: "Complainant", type: "text", request: true },
      { key: "accused", label: "Accused / Respondents", type: "textarea", request: true },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "entityFiling", label: "Company / Entity Filing", type: "text",
        showIf: (f, rec) => (rec.fields || {}).direction !== "Filed against the company" },
      { key: "entityAgainst", label: "Company / Entity Against Which Filed", type: "text",
        showIf: (f, rec) => (rec.fields || {}).direction === "Filed against the company" },
      { key: "filedBy", label: "Complaint Filed By", type: "text", request: true },
      { key: "authorizedPerson", label: "Authorized Person to File", type: "text", request: true },
      { key: "boardResolutionProvided", label: "Board Resolution Provided", type: "toggle" },
      { key: "policeStation", label: "Police Station", type: "text", request: true },
      { key: "diaryNumber", label: "Diary Number", type: "text" },
      { key: "investigatingOfficer", label: "Investigating Officer", type: "text" },
      { key: "forum", label: "Forum", type: "text" },
      { key: "complaintDate", label: "Filing Date", type: "date" },
      { key: "firDate", label: "Date of FIR Lodging", type: "date" },
      /* The petition, recorded on the complaint it came out of, so the link is
         a fact on the record rather than something a reader reconstructs.
         NO "Section 154 CrPC" FIELD: every complaint here is treated under it,
         so a column that is the same on every row says nothing. */
      { key: "s22Filed", label: "22-A / 22-B Filed", type: "toggle", group: "22-A / 22-B" },
      { key: "s22FilingDate", label: "22-A / 22-B Filing Date", type: "date", group: "22-A / 22-B",
        showIf: (f, rec) => !!(rec.fields || {}).s22Filed },
      { key: "s22Court", label: "Sessions Court / Forum", type: "text", group: "22-A / 22-B",
        showIf: (f, rec) => !!(rec.fields || {}).s22Filed },
      { key: "s22CaseNo", label: "22-A / 22-B Case No.", type: "text", group: "22-A / 22-B",
        showIf: (f, rec) => !!(rec.fields || {}).s22Filed },
      { key: "s22NextDate", label: "22-A / 22-B Next Date", type: "date", group: "22-A / 22-B",
        showIf: (f, rec) => !!(rec.fields || {}).s22Filed },
      { key: "s22Outcome", label: "22-A / 22-B Order / Outcome", type: "textarea", group: "22-A / 22-B",
        showIf: (f, rec) => !!(rec.fields || {}).s22Filed },
    ],
    columns: ["fields.direction", "subType", "fields.policeStation", "fields.diaryNumber",
      "fields.complaintDate", "owner", "stage"],
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
    /* GOVERNMENT AUTHORITY VISITS, not "Govt Inspections".
       Authorities visit for reasons that are not inspections -- a notice
       served, a survey, a demand -- and calling all of it an inspection made
       the register read as narrower than what it holds. The route key stays
       `inspections` so every existing link, saved view and bookmark keeps
       working; only what people read changes. */
    label: "Government Authority Visits",
    createLabel: "Log a Visit",
    icon: "shield",
    noun: "visit",
    subTypeLabel: "Inspecting Authority",
    /* Expandable without a schema change: add an authority here and it is
       offered everywhere the sub-type is. */
    subTypes: ["PESSI", "PHA", "Civil Defence", "Labour Department", "Other Government Authority"],
    workflow: ["Inspection Scheduled", "Conducted", "Irregularities Remediation", "Book Signed / Certificate Issued", "Closed"],
    slas: { "Irregularities Remediation": 5 },
    fields: [
      /* ONE CANONICAL "ENTITY / OFFICE" FIELD (§79).
         A visit happens somewhere: to a company, at an office. The record used
         to carry the generic `entityId` from the workflow envelope AND a
         separate "Linked Entity" on the form, so the same fact was asked for
         twice and the two disagreed on half the records. This is the one
         field, it offers the canonical companies from the litigation option
         lists (type "entity"), and it accepts an office the register does not
         know yet rather than refusing the visit. */
      { key: "entity", label: "Entity / Office", type: "entity", request: true, required: true,
        hint: "The company or office the authority visited." },
      { key: "inspectionDate", label: "Visit Date", type: "date", request: true },
      { key: "officerName", label: "Inspecting Officer Name", type: "text" },
      { key: "officerDesignation", label: "Officer Designation", type: "text" },
      { key: "irregularities", label: "Irregularities Noticed", type: "textarea" },
      { key: "bookSigned", label: "Visit Book Signed", type: "toggle", showIf: (f, rec) => rec.subType === "Labour Department" },
      { key: "certificateIssued", label: "Certificate Issued", type: "toggle", showIf: (f, rec) => rec.subType !== "Labour Department" },
    ],
    /* NO TAT, NO STAGE, NO COST COLUMNS.
       The cost-analysis fields were never filled on a single record and the
       turnaround column had nothing to measure, so the register was three
       columns of blanks -- an empty column is a question the reader has to
       decide to ignore. Anything a historical import carried is still on the
       record for provenance; it is simply not part of the operational screen.
       Add a column back here the day somebody starts recording it. */
    columns: ["fields.entity", "subType", "fields.inspectionDate", "fields.officerName", "owner", "stage"],
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

// A record's workflow path — renewal-triggered records follow the renewal path;
// modules can declare further named flows (e.g. the filings "periodic" path).
export function workflowOf(def, rec) {
  if (!def) return [];
  if (rec && rec.flow === "renewal" && def.renewalWorkflow) return def.renewalWorkflow;
  if (rec && rec.flow && rec.flow !== "main" && def.flows && def.flows[rec.flow]) return def.flows[rec.flow];
  return def.workflow || [];
}

/* ---------------- Filing Module 8.1 — Filing Status ----------------
   Derived, never hand-typed: Filed / Overdue / Due Soon / Not Due. "Due Soon"
   matches the 30-day system-trigger window. */
export function filingStatusOf(rec = {}, now = new Date()) {
  const f = rec.fields || {};
  if (f.filingDate || /Filed|Closed/.test(rec.stage || "") && rec.status === "Closed") {
    return { key: "Filed", tone: "green", detail: f.filingDate ? "filed " + String(f.filingDate).slice(0, 10) : "filed" };
  }
  if (!f.dueDate) return { key: "Not Due", tone: "gray", detail: "no due date set" };
  const days = Math.floor((new Date(f.dueDate) - now) / 86400000);
  if (days < 0) return { key: "Overdue", tone: "red", detail: `${-days}d past due`, days };
  if (days <= 30) return { key: "Due Soon", tone: "amber", detail: `due in ${days}d`, days };
  return { key: "Not Due", tone: "gray", detail: `due in ${days}d`, days };
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
