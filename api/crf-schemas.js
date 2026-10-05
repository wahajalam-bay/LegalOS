/* THE CONTRACT REQUEST FORMS, AS DATA.
 *
 * Nine request types share one engine. The difference between them is this
 * file and nothing else: no form is hand-built in a component, no field list is
 * duplicated per type, and the server validates from exactly the definitions
 * the browser renders from. A field that exists here exists everywhere; a rule
 * written here is enforced on the server whatever the screen chooses to show.
 *
 * WHY IT LIVES IN api/ AND NOT src/. The requester's browser is not allowed to
 * decide whether their own request is complete. The schema is served to the
 * client to RENDER; submission is validated here, against the same objects.
 *
 * THE SHAPE
 *   COMMON.<block>   sections every request has, in their fixed order
 *   TYPES.CRF-0n     that type's own sections, slotted into the same steps
 *
 * A section:  { key, label, step, hint?, grid?, fields[] }
 * A field:    { key, label, type, options?, required?, requiredIf?, showIf?,
 *               standard?, financeTrigger?, calc?, hint? }
 *
 * CONDITIONS ARE DATA, not functions, because the browser and the server both
 * have to reach the same answer about whether a field was required. A function
 * would have to be shipped as a string and eval'd, and the two would drift.
 *   { field: "priority", eq: "Urgent" }
 *   { field: "cpKind", in: ["Partnership", "Private Limited"] }
 *   { field: "targets", truthy: true }
 *   { any: [ {...}, {...} ] }   { all: [ {...}, {...} ] }
 *
 * STANDARD POSITIONS. A field carrying `standard` has a position the business
 * has already agreed. Choosing anything else is a DEVIATION: the engine records
 * standardValue, selectedValue and isDeviation, makes Special Terms mandatory,
 * and Legal sees the list. Labelling a default in the UI and doing nothing with
 * it would be decoration.
 *
 * FINANCE. Any field marked `financeTrigger` that carries a value makes Finance
 * Review required. The requester is never asked to judge it.
 */

/* ------------------------------------------------------------ vocabularies */

const CRF_TYPES = [
  { key: "CRF-01", label: "IT & Project Sales Services Agreement / PPA", short: "PPA / Project Sales" },
  { key: "CRF-02", label: "Lease Agreement", short: "Lease" },
  { key: "CRF-03", label: "Service Agreement", short: "Service" },
  { key: "CRF-04", label: "Land Agreement", short: "Land" },
  { key: "CRF-05", label: "Construction Agreement", short: "Construction" },
  { key: "CRF-06", label: "Consultancy Agreement", short: "Consultancy" },
  { key: "CRF-07", label: "Architecture & Design Agreement", short: "Architecture & Design" },
  { key: "CRF-08", label: "Joint Venture Agreement", short: "Joint Venture" },
  /* AN NDA IS ITS OWN REQUEST TYPE, not "Other". It is the single most
     frequently requested agreement in most departments, it has a standard
     form, and filing it under Other buried it behind a free-text description
     that Legal then had to read to find out it was an NDA. */
  { key: "CRF-10", label: "Non-Disclosure Agreement", short: "NDA" },
  { key: "CRF-09", label: "Other Agreements", short: "Other" },
];

const STEPS = [
  { n: 1, key: "request", label: "Request" },
  { n: 2, key: "parties", label: "Parties" },
  { n: 3, key: "commercial", label: "Commercial Terms" },
  { n: 4, key: "legal", label: "Legal Terms" },
  { n: 5, key: "attachments", label: "Attachments" },
  { n: 6, key: "special", label: "Special Terms" },
  { n: 7, key: "review", label: "Review" },
];

const STATUSES = [
  "Draft", "Submitted", "HOD Approval", "Finance Review", "Legal Intake",
  "Returned to Requester", "Accepted & Assigned", "In Drafting", "Closed",
  "HOD Rejected",
];

/* Statuses in which the requester may still edit their own request. Everything
   else is locked to them -- a request under approval that its author can still
   change is a request nobody actually approved. */
const REQUESTER_EDITABLE = ["Draft", "Returned to Requester"];

const CITY = ["Lahore", "Islamabad", "Karachi", "Other"];

/* ---------------------------------------------------------- common blocks */

const COMMON = [
  {
    key: "request", label: "Request information", step: 1,
    fields: [
      { key: "requester", label: "Requester", type: "auto", hint: "From your sign-in" },
      { key: "department", label: "Department", type: "auto", hint: "From your profile" },
      { key: "requiredBy", label: "Required-by date", type: "date", required: true },
      { key: "priority", label: "Priority", type: "select", options: ["Standard", "Urgent"], required: true },
      { key: "urgentReason", label: "Reason it is urgent", type: "textarea", requiredIf: { field: "priority", eq: "Urgent" }, showIf: { field: "priority", eq: "Urgent" } },
      { key: "requestType", label: "Request type", type: "select", options: ["New", "Renewal", "Amendment", "Termination"], required: true },
      { key: "baseDraft", label: "Base draft", type: "select", options: ["Zameen Template", "Counterparty Draft", "Previous Agreement Reference"], required: true },
      { key: "relatedAgreement", label: "Related agreement", type: "contractRef", hint: "Links to an existing contract where one exists; otherwise state the reference." },
      { key: "approvingHod", label: "Approving HOD", type: "hod", required: true },
    ],
  },
  {
    key: "entity", label: "Zameen entity", step: 2,
    fields: [
      { key: "entityName", label: "Entity", type: "entity", required: true },
      { key: "entityRole", label: "Role", type: "select", options: [], required: true, hint: "Depends on the request type" },
      { key: "entityAddress", label: "Registered address", type: "textarea", autoFrom: "entity", required: true },
      { key: "entitySignatory", label: "Authorised signatory", type: "text", required: true },
      { key: "entitySignatoryDesignation", label: "Designation", type: "text", required: true },
      { key: "entitySignatoryCnic", label: "CNIC", type: "cnic", required: true },
    ],
  },
  {
    key: "counterparties", label: "Counterparty", step: 2, grid: true, minRows: 1,
    hint: "One card per counterparty. Add as many as the agreement has.",
    fields: [
      { key: "kind", label: "Counterparty type", type: "select", required: true,
        options: ["Individual", "Sole Proprietorship", "Partnership", "Private Limited", "Public Limited", "Other"] },
      { key: "legalName", label: "Legal name", type: "text", required: true },
      { key: "parentage", label: "S/o, D/o or W/o", type: "text", requiredIf: { field: "kind", eq: "Individual" }, showIf: { field: "kind", eq: "Individual" } },
      { key: "cnic", label: "CNIC / Passport", type: "text", requiredIf: { field: "kind", in: ["Individual", "Sole Proprietorship"] } },
      { key: "ntn", label: "NTN / STRN", type: "text" },
      { key: "secpNo", label: "SECP no. / Form C no.", type: "text",
        requiredIf: { field: "kind", in: ["Partnership", "Private Limited", "Public Limited"] },
        showIf: { field: "kind", in: ["Partnership", "Private Limited", "Public Limited"] } },
      { key: "partners", label: "Partners", type: "subgrid", showIf: { field: "kind", eq: "Partnership" },
        requiredIf: { field: "kind", eq: "Partnership" },
        columns: [
          { key: "name", label: "Partner name", type: "text", required: true },
          { key: "cnic", label: "CNIC", type: "cnic", required: true },
        ] },
      { key: "address", label: "Address", type: "textarea", required: true },
      { key: "signatory", label: "Signatory", type: "text", required: true },
      { key: "signatoryDesignation", label: "Designation", type: "text" },
      { key: "signatoryCnic", label: "Signatory CNIC", type: "cnic", required: true },
      { key: "signingAuthority", label: "Signing authority", type: "select", options: ["Resolution", "Partners", "POA", "Self"], required: true },
      { key: "contactPerson", label: "Contact person", type: "text" },
      { key: "contactEmail", label: "Email", type: "email", required: true },
      { key: "contactPhone", label: "Phone", type: "text", required: true },
    ],
  },
  {
    key: "disputes", label: "Disputes", step: 4,
    fields: [
      { key: "governingLaw", label: "Governing law", type: "text", required: true },
      { key: "forum", label: "Forum", type: "select", options: ["Arbitration", "Courts"], required: true },
      { key: "seat", label: "Seat", type: "select", options: CITY, required: true },
      { key: "amicableDays", label: "Amicable settlement days", type: "number", required: true },
    ],
  },
  {
    key: "notices", label: "Notices", step: 4, grid: true, minRows: 2,
    hint: "A notice address for EACH party — the Zameen entity and every counterparty.",
    fields: [
      { key: "party", label: "Party", type: "text", required: true },
      { key: "attention", label: "Attention", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "address", label: "Address", type: "textarea", required: true },
    ],
  },
  {
    key: "execution", label: "Execution", step: 4,
    fields: [
      { key: "executionPlace", label: "Execution place", type: "text" },
      { key: "executionDate", label: "Execution / effective date", type: "date" },
      { key: "witness1Name", label: "Witness 1 — name", type: "text" },
      { key: "witness1Cnic", label: "Witness 1 — CNIC", type: "cnic" },
      { key: "witness2Name", label: "Witness 2 — name", type: "text" },
      { key: "witness2Cnic", label: "Witness 2 — CNIC", type: "cnic" },
    ],
  },
  {
    key: "special", label: "Special terms", step: 6,
    fields: [
      { key: "specialTerms", label: "Special terms", type: "richtext",
        hint: "Deviations, negotiated positions, side arrangements, known risks, clause references. Required once any standard position is changed." },
    ],
  },
];

/* Role options differ by request type -- the Zameen entity is a Lessee on a
   lease and a Buyer on a land agreement, and offering all of them everywhere
   invites the wrong one. */
const ENTITY_ROLES = {
  "CRF-01": ["Sales & Marketing Partner", "Service Provider", "Agent"],
  "CRF-02": ["Lessee", "Lessor"],
  "CRF-03": ["Service Provider", "Customer"],
  "CRF-04": ["Buyer", "Seller"],
  "CRF-05": ["Employer", "Co-employer"],
  "CRF-06": ["Client", "Consultant"],
  "CRF-07": ["Client", "Consultant"],
  "CRF-08": ["JV Partner", "Landowner", "Developer"],
  "CRF-09": ["Party", "Disclosing Party", "Receiving Party", "Licensor", "Licensee"],
  "CRF-10": ["Disclosing Party", "Receiving Party", "Party (mutual)"],
};

module.exports = { CRF_TYPES, STEPS, STATUSES, REQUESTER_EDITABLE, COMMON, ENTITY_ROLES, CITY };

/* ------------------------------------------------------- CRF-01 — PPA ---- */

const CRF01 = [
  { key: "project", label: "Project", step: 3, fields: [
    { key: "landowner", label: "Landowner (if different from the developer)", type: "text" },
    { key: "projectName", label: "Project name", type: "text", required: true },
    { key: "projectAddress", label: "Project address", type: "textarea", required: true },
    { key: "totalArea", label: "Total area", type: "text", required: true },
    { key: "structure", label: "Structure", type: "textarea" },
    { key: "approvals", label: "Approvals", type: "select", options: ["Available", "Not Available", "Applied"], required: true },
    { key: "authorityRef", label: "Authority reference", type: "text", requiredIf: { field: "approvals", in: ["Available", "Applied"] } },
  ] },
  { key: "inventory", label: "Inventory", step: 3, grid: true, minRows: 1, fields: [
    { key: "unitType", label: "Type", type: "text", required: true },
    { key: "total", label: "Total", type: "number", required: true },
    { key: "available", label: "Available to Zameen", type: "number", required: true },
    { key: "mortgaged", label: "Mortgaged", type: "number" },
    { key: "reserved", label: "Reserved", type: "number" },
    { key: "sold", label: "Sold", type: "number" },
  ] },
  { key: "pricing", label: "Pricing", step: 3, fields: [
    { key: "allotmentCharges", label: "Allotment charges", type: "money", financeTrigger: true, required: true },
    { key: "transferCharges", label: "Transfer charges", type: "money", financeTrigger: true },
    { key: "devChargesApply", label: "Development charges", type: "select", options: ["Yes", "No"], required: true },
    { key: "devChargesAmount", label: "Development charges — amount / %", type: "text", showIf: { field: "devChargesApply", eq: "Yes" }, requiredIf: { field: "devChargesApply", eq: "Yes" }, financeTrigger: true },
    { key: "discountUpfront100", label: "Discount — 100% upfront", type: "percent", standard: "10", required: true },
    { key: "discountUpfront50", label: "Discount — 50% upfront", type: "percent", standard: "5", required: true },
    { key: "discountProRated", label: "Discount — pro-rated", type: "select", options: ["Yes", "No"], standard: "Yes", required: true },
    { key: "cancellationFee", label: "Cancellation fee", type: "money", financeTrigger: true },
    { key: "priceRevision", label: "Price revision", type: "select", options: ["Mutual Only", "Developer May Revise", "Indexed"], standard: "Mutual Only", required: true },
  ] },
  { key: "buyerPlan", label: "Buyer payment plan", step: 3, fields: [
    { key: "downPaymentPct", label: "Down payment %", type: "percent", required: true },
    { key: "instalmentMonths", label: "Instalment months", type: "number", required: true },
    { key: "possessionPct", label: "Possession %", type: "percent", required: true },
    { key: "instalmentFrequency", label: "Frequency", type: "select", options: ["Monthly", "Quarterly", "Half-yearly", "Annual"], required: true },
  ] },
  { key: "fees", label: "Fees", step: 3, fields: [
    { key: "servicePeriod", label: "Service period", type: "text", required: true },
    { key: "exclusivity", label: "Exclusivity", type: "select", options: ["Exclusive", "Non-exclusive"], required: true },
    { key: "itFeePerLead", label: "IT fee — per lead", type: "money", financeTrigger: true },
    { key: "itFeeCap", label: "IT fee — cap", type: "money", financeTrigger: true },
    { key: "salesFeeTranches", label: "Sales fee tranches", type: "subgrid", columns: [
      { key: "tranche", label: "Tranche", type: "text", required: true },
      { key: "pct", label: "%", type: "percent", required: true },
      { key: "trigger", label: "Trigger", type: "text", required: true },
    ] },
    { key: "resellingFee", label: "Re-selling fee", type: "money", financeTrigger: true },
    { key: "feeBaseUpfront", label: "Fee base on upfront sale", type: "select", options: ["Before Discount", "After Discount"], required: true },
    { key: "premiumShare", label: "Premium share", type: "percent", standard: "50", required: true },
    { key: "cancellationSharing", label: "Cancellation sharing", type: "percent", standard: "50", required: true },
  ] },
  { key: "targets", label: "Targets", step: 3, fields: [
    { key: "targetsApply", label: "Targets", type: "select", options: ["Yes", "No"], required: true },
    { key: "cycle1", label: "Cycle I %", type: "percent", showIf: { field: "targetsApply", eq: "Yes" }, requiredIf: { field: "targetsApply", eq: "Yes" } },
    { key: "cycle2", label: "Cycle II %", type: "percent", showIf: { field: "targetsApply", eq: "Yes" }, requiredIf: { field: "targetsApply", eq: "Yes" } },
    { key: "cycle3", label: "Cycle III %", type: "percent", showIf: { field: "targetsApply", eq: "Yes" }, requiredIf: { field: "targetsApply", eq: "Yes" } },
    { key: "minPerPhase", label: "Minimum per phase", type: "text", showIf: { field: "targetsApply", eq: "Yes" } },
    { key: "minForTerm", label: "Minimum for term", type: "text", showIf: { field: "targetsApply", eq: "Yes" } },
    { key: "exclusivityRevocationPct", label: "Exclusivity revocation %", type: "percent", showIf: { field: "targetsApply", eq: "Yes" } },
    { key: "autoExtensionPct", label: "Auto-extension %", type: "percent", showIf: { field: "targetsApply", eq: "Yes" } },
    { key: "autoExtensionMonths", label: "Auto-extension months", type: "number", showIf: { field: "targetsApply", eq: "Yes" } },
  ] },
  { key: "otherPpa", label: "Other", step: 3, fields: [
    { key: "modelUnit", label: "Model unit", type: "select", options: ["Yes", "No"], required: true },
    { key: "siteOffice", label: "Site office", type: "select", options: ["Customer Cost", "Zameen Cost", "Shared"], standard: "Customer Cost", required: true },
    { key: "customerBankAccount", label: "Customer bank account", type: "text", required: true },
  ] },
];

/* ----------------------------------------------------- CRF-02 — Lease ---- */

const CRF02 = [
  { key: "lessors", label: "Lessors", step: 2, grid: true, minRows: 1, fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "parentage", label: "Parentage", type: "text", required: true },
    { key: "cnic", label: "CNIC", type: "cnic", required: true },
    { key: "address", label: "Address", type: "textarea", required: true },
    { key: "rentSharePct", label: "Rent share %", type: "percent", required: true },
  ] },
  { key: "premises", label: "Premises", step: 3, fields: [
    { key: "building", label: "Building", type: "text", required: true },
    { key: "floorsUnits", label: "Floors / units", type: "text", required: true },
    { key: "area", label: "Area", type: "text", required: true },
    { key: "use", label: "Use", type: "text", required: true },
    { key: "parking", label: "Parking", type: "text" },
    { key: "extraSpaces", label: "Extra spaces", type: "text" },
    { key: "buildingApprovals", label: "Building approvals held", type: "textarea" },
  ] },
  { key: "term", label: "Term", step: 3, fields: [
    { key: "years", label: "Years", type: "number", required: true },
    { key: "commencement", label: "Commencement", type: "date", required: true },
    { key: "expiry", label: "Expiry", type: "date", required: true },
    { key: "renewal", label: "Renewal", type: "text" },
    { key: "possessionDate", label: "Possession date", type: "date", required: true },
    { key: "lockIn", label: "Lock-in", type: "text" },
    { key: "possessionFailureDays", label: "Possession failure days", type: "number" },
  ] },
  { key: "rent", label: "Rent", step: 3, fields: [
    { key: "monthlyRent", label: "Monthly rent", type: "money", required: true, financeTrigger: true },
    { key: "taxTreatment", label: "Tax treatment", type: "select", options: ["Inclusive", "Exclusive"], required: true },
    { key: "inclusions", label: "Inclusions", type: "textarea" },
    { key: "rentFreePeriod", label: "Rent-free period", type: "text" },
    { key: "advanceRentMonths", label: "Advance rent — months", type: "number" },
    { key: "advanceRentAmount", label: "Advance rent — amount", type: "money", financeTrigger: true },
    { key: "dueDay", label: "Due day", type: "number", required: true },
    { key: "escalationPct", label: "Escalation %", type: "percent", required: true },
    { key: "escalationAfterYears", label: "Escalation after N years", type: "number", required: true },
    { key: "paymentSplit", label: "Payment split", type: "textarea", hint: "Where rent is split between lessors" },
  ] },
  { key: "deposit", label: "Deposit", step: 3, fields: [
    { key: "depositMonths", label: "Months", type: "number", required: true },
    { key: "depositAmount", label: "Amount", type: "money", required: true, financeTrigger: true },
    { key: "depositInstrument", label: "Instrument", type: "select", options: ["Pay Order", "Cheque", "Bank Transfer", "Bank Guarantee"], required: true },
  ] },
  { key: "obligations", label: "Obligations", step: 3, fields: [
    { key: "lessorFitout", label: "Lessor fit-out works", type: "textarea" },
    { key: "fitoutCompletion", label: "Completion date", type: "date" },
    { key: "maintenanceCharges", label: "Maintenance charges", type: "money", financeTrigger: true },
    { key: "utilities", label: "Utilities", type: "textarea" },
    { key: "meterReadings", label: "Meter readings", type: "subgrid", columns: [
      { key: "meter", label: "Meter", type: "text", required: true },
      { key: "reference", label: "Reference", type: "text" },
      { key: "reading", label: "Reading at handover", type: "text", required: true },
    ] },
  ] },
  { key: "leaseTermination", label: "Termination", step: 4, fields: [
    { key: "lessorNotice", label: "Lessor notice", type: "text", required: true },
    { key: "lesseeNotice", label: "Lessee notice", type: "text", required: true },
    { key: "cureDays", label: "Cure days", type: "number", required: true },
    { key: "earlyExitPenalty", label: "Early exit penalty", type: "text" },
  ] },
];

/* --------------------------------------------------- CRF-03 — Service ---- */

const CRF03 = [
  { key: "customer", label: "Customer", step: 2, fields: [
    { key: "customerType", label: "Customer type", type: "select", required: true,
      options: ["Agency", "Developer", "Developer Agency", "Residential Agency", "Individual", "Agent", "Partner"] },
    { key: "clientId", label: "Client ID", type: "text" },
    { key: "pNo", label: "P-No.", type: "text" },
  ] },
  { key: "order", label: "Order", step: 3, grid: true, minRows: 1,
    calc: { total: { sum: "amount" } },
    fields: [
      { key: "package", label: "Package", type: "select", required: true,
        options: ["Listings", "Hot", "Super Hot", "Refresh Credits", "Other"] },
      { key: "quantity", label: "Quantity", type: "number", required: true },
      { key: "months", label: "Months", type: "number", required: true },
      { key: "unitPrice", label: "Unit price", type: "money", required: true, financeTrigger: true },
      { key: "amount", label: "Amount", type: "money", calc: { multiply: ["quantity", "unitPrice"] }, readOnly: true },
    ] },
  { key: "orderTotals", label: "Order totals", step: 3, fields: [
    { key: "orderTotal", label: "Total", type: "money", calc: { sumGrid: ["order", "amount"] }, readOnly: true, financeTrigger: true },
    { key: "amountInWords", label: "Amount in words", type: "text", calc: { words: "orderTotal" }, readOnly: true },
    { key: "discountPct", label: "Discount %", type: "percent" },
    { key: "discountApprover", label: "Discount approver", type: "text", requiredIf: { field: "discountPct", truthy: true } },
  ] },
  { key: "termPayment", label: "Term & payment", step: 3, fields: [
    { key: "startDate", label: "Start date", type: "date", required: true },
    { key: "endDate", label: "End date", type: "date", required: true },
    { key: "autoRenewal", label: "Auto renewal", type: "select", options: ["Yes", "No"], required: true },
    { key: "paymentTerms", label: "Payment terms", type: "select", options: ["Advance", "Instalments", "Credit Days"], required: true },
    { key: "creditDays", label: "Credit days", type: "number", showIf: { field: "paymentTerms", eq: "Credit Days" }, requiredIf: { field: "paymentTerms", eq: "Credit Days" } },
  ] },
  { key: "payments", label: "Payments received", step: 3, grid: true, fields: [
    { key: "bank", label: "Bank", type: "text", required: true },
    { key: "reference", label: "Reference", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "amount", label: "Amount", type: "money", required: true, financeTrigger: true },
    { key: "receivingAccount", label: "Receiving account", type: "text", required: true },
  ] },
  { key: "serviceTerms", label: "Terms", step: 4, fields: [
    { key: "termsBasis", label: "Terms", type: "select", options: ["Standard Website Terms", "Standard + Special", "Bespoke"], required: true },
    { key: "deviationsSought", label: "Deviations sought", type: "textarea", requiredIf: { field: "termsBasis", in: ["Standard + Special", "Bespoke"] }, showIf: { field: "termsBasis", in: ["Standard + Special", "Bespoke"] } },
  ] },
];

/* ------------------------------------------------------ CRF-04 — Land ---- */

const CRF04 = [
  { key: "owners", label: "Owners", step: 2, grid: true, minRows: 1, fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "parentage", label: "Parentage", type: "text", required: true },
    { key: "cnic", label: "CNIC", type: "cnic", required: true },
    { key: "address", label: "Address", type: "textarea", required: true },
    { key: "sharePct", label: "Share %", type: "percent", required: true },
    { key: "attorney", label: "Attorney", type: "select", options: ["Yes", "No"], required: true },
    { key: "gpaRef", label: "GPA reference", type: "text", showIf: { field: "attorney", eq: "Yes" }, requiredIf: { field: "attorney", eq: "Yes" } },
  ] },
  { key: "property", label: "Property", step: 3, fields: [
    { key: "plotKhasra", label: "Plot / Khasra", type: "text", required: true },
    { key: "block", label: "Block", type: "text" },
    { key: "schemeMauza", label: "Scheme / Mauza", type: "text", required: true },
    { key: "city", label: "City", type: "text", required: true },
    { key: "area", label: "Area", type: "number", required: true },
    { key: "areaUnit", label: "Unit", type: "select", options: ["Kanal", "Marla", "Sq Ft"], required: true },
    { key: "dimensions", label: "Dimensions", type: "text" },
    { key: "boundaryNorth", label: "Boundary — north", type: "text", required: true },
    { key: "boundarySouth", label: "Boundary — south", type: "text", required: true },
    { key: "boundaryEast", label: "Boundary — east", type: "text", required: true },
    { key: "boundaryWest", label: "Boundary — west", type: "text", required: true },
    { key: "propertyType", label: "Property type", type: "text", required: true },
    { key: "titleInstrument", label: "Title instrument", type: "text", required: true },
    { key: "documentNo", label: "Document no.", type: "text", required: true },
    { key: "book", label: "Book", type: "text" },
    { key: "volume", label: "Volume", type: "text" },
    { key: "titleDate", label: "Date", type: "date", required: true },
    { key: "subRegistrar", label: "Sub-Registrar", type: "text", required: true },
    { key: "authority", label: "Authority", type: "text" },
    { key: "encumbrances", label: "Encumbrances", type: "textarea", required: true },
    { key: "occupantsLitigation", label: "Occupants / litigation", type: "textarea", required: true },
    { key: "acquisitionNotice", label: "Acquisition notice", type: "select", options: ["Yes", "No"], required: true },
  ] },
  { key: "landPrice", label: "Price", step: 3, fields: [
    { key: "consideration", label: "Consideration", type: "money", required: true, financeTrigger: true },
    { key: "rate", label: "Rate", type: "money", financeTrigger: true },
    { key: "downPaymentAmount", label: "Down payment — amount", type: "money", required: true, financeTrigger: true },
    { key: "downPaymentPct", label: "Down payment — %", type: "percent", required: true },
    { key: "payOrderDetails", label: "Pay order details", type: "text", required: true },
    { key: "transferCosts", label: "Transfer costs", type: "select", options: ["Buyer", "Seller", "Shared"], required: true },
  ] },
  { key: "instalments", label: "Instalments", step: 3, grid: true, fields: [
    { key: "amount", label: "Amount", type: "money", required: true, financeTrigger: true },
    { key: "pct", label: "%", type: "percent" },
    { key: "trigger", label: "Trigger", type: "text", required: true },
  ] },
  { key: "completion", label: "Completion", step: 4, fields: [
    { key: "conditionsPrecedent", label: "Conditions precedent", type: "textarea", required: true },
    { key: "completionDays", label: "Completion days", type: "number", required: true },
    { key: "extensionDays", label: "Extension days", type: "number" },
    { key: "extensionGrounds", label: "Extension grounds", type: "textarea" },
    { key: "dueDiligencePeriod", label: "Due diligence period", type: "text", required: true },
    { key: "possessionTrigger", label: "Possession trigger", type: "text", required: true },
    { key: "sellerDefault", label: "Seller default", type: "select", required: true,
      options: ["Refund + penalty equal to down payment", "Refund only", "Specific performance", "Other"],
      standard: "Refund + penalty equal to down payment" },
    { key: "buyerDefault", label: "Buyer default", type: "select", required: true,
      options: ["Forfeiture", "Partial forfeiture", "Refund less costs", "Other"], standard: "Forfeiture" },
    { key: "forceMajeureCap", label: "Force majeure cap", type: "text" },
    { key: "assignmentRight", label: "Assignment right", type: "select", options: ["Yes", "No"], required: true },
  ] },
];

/* ---------------------------------------------- CRF-05 — Construction ---- */

const CRF05 = [
  { key: "coEmployers", label: "Co-employers", step: 2, grid: true, fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "role", label: "Role", type: "text", required: true },
    { key: "address", label: "Address", type: "textarea" },
  ] },
  { key: "contractor", label: "Contractor", step: 2, fields: [
    { key: "pecLicence", label: "PEC licence number", type: "text", required: true },
    { key: "pecCategory", label: "PEC category", type: "text", required: true },
    { key: "pecValidity", label: "Validity", type: "date", required: true },
  ] },
  { key: "works", label: "Works", step: 3, fields: [
    { key: "project", label: "Project", type: "text", required: true },
    { key: "plot", label: "Plot", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea", required: true },
    { key: "tenderRef", label: "Tender reference", type: "text", required: true },
    { key: "loaDate", label: "LoA date", type: "date", required: true },
    { key: "contractForm", label: "Contract form", type: "select", options: ["FIDIC", "PEC", "Bespoke"], required: true },
    { key: "engineer", label: "Engineer", type: "text", required: true },
  ] },
  { key: "constructionPrice", label: "Price", step: 3, fields: [
    { key: "contractPrice", label: "Contract price", type: "money", required: true, financeTrigger: true },
    { key: "priceBasis", label: "Basis", type: "select", options: ["Lump Sum", "BOQ", "Cost Plus", "Item Rate"], required: true },
    { key: "tax", label: "Tax", type: "text", required: true },
    { key: "escalation", label: "Escalation", type: "text" },
    { key: "mobilisationAdvancePct", label: "Mobilisation advance %", type: "percent", financeTrigger: true },
    { key: "apg", label: "APG", type: "text" },
    { key: "recoveryPct", label: "Recovery %", type: "percent" },
    { key: "ipcCycle", label: "IPC cycle", type: "text", required: true },
    { key: "paymentDays", label: "Payment days", type: "number", required: true },
    { key: "retentionPct", label: "Retention %", type: "percent", required: true },
    { key: "retentionCap", label: "Retention cap", type: "money", financeTrigger: true },
    { key: "retentionRelease", label: "Retention release", type: "text", required: true },
    { key: "employerSuppliedMaterials", label: "Employer-supplied materials", type: "textarea" },
    { key: "variationLimit", label: "Variation limit", type: "text" },
  ] },
  { key: "timeRisk", label: "Time & risk", step: 3, fields: [
    { key: "sitePossession", label: "Site possession", type: "date", required: true },
    { key: "commencement", label: "Commencement", type: "date", required: true },
    { key: "completionPeriod", label: "Completion period", type: "text", required: true },
    { key: "milestones", label: "Milestones", type: "subgrid", columns: [
      { key: "milestone", label: "Milestone", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "value", label: "Value", type: "money" },
    ] },
    { key: "ldRate", label: "LD rate", type: "text", required: true },
    { key: "ldCap", label: "LD cap", type: "text", required: true },
    { key: "performanceSecurityPct", label: "Performance security %", type: "percent", required: true },
    { key: "securityForm", label: "Form", type: "select", options: ["Bank Guarantee", "Insurance Bond", "Retention"], required: true },
    { key: "securityValidity", label: "Validity", type: "text", required: true },
    { key: "dnpMonths", label: "DNP months", type: "number", required: true },
    { key: "insurances", label: "Insurances", type: "textarea", required: true },
    { key: "subContracting", label: "Sub-contracting", type: "select", options: ["Not permitted", "With consent", "Permitted"], required: true },
    { key: "contractDocuments", label: "Contract documents list", type: "textarea", required: true },
  ] },
];

/* ----------------------------------------------- CRF-06 — Consultancy ---- */

const CRF06 = [
  { key: "consultantReg", label: "Consultant registration", step: 2, fields: [
    { key: "registrationNo", label: "Professional registration no.", type: "text", required: true },
    { key: "registrationValidity", label: "Validity", type: "date", required: true },
  ] },
  { key: "scope", label: "Scope", step: 3, fields: [
    { key: "project", label: "Project", type: "text", required: true },
    { key: "address", label: "Address", type: "textarea", required: true },
    { key: "services", label: "Services", type: "textarea", required: true },
    { key: "deliverables", label: "Deliverables", type: "textarea", required: true },
    { key: "authority", label: "Authority", type: "select", options: ["CDA", "LDA", "RDA", "DHA", "Other"], required: true },
    { key: "keyPersonnel", label: "Key personnel", type: "textarea", required: true },
    { key: "termBasis", label: "Term", type: "select", options: ["Until Completion", "Fixed"], required: true },
    { key: "effectiveDate", label: "Effective date", type: "date", required: true },
  ] },
  { key: "consultancyFee", label: "Fee", step: 3, fields: [
    { key: "feeBasis", label: "Basis", type: "select", options: ["Per Sq Ft", "Lump Sum", "Retainer", "Time"], required: true },
    { key: "rate", label: "Rate", type: "money", required: true, financeTrigger: true },
    { key: "quantity", label: "Quantity", type: "number", required: true },
    { key: "feeTotal", label: "Total", type: "money", calc: { multiply: ["rate", "quantity"] }, readOnly: true, financeTrigger: true },
    { key: "tax", label: "Tax", type: "text", required: true },
  ] },
  { key: "consultancyMilestones", label: "Milestones", step: 3, grid: true, minRows: 1, fields: [
    { key: "pct", label: "%", type: "percent", required: true },
    { key: "amount", label: "Amount", type: "money", required: true, financeTrigger: true },
    { key: "trigger", label: "Trigger", type: "text", required: true },
    { key: "paymentMode", label: "Payment mode", type: "text", required: true },
  ] },
  { key: "consultancyTerms", label: "Terms", step: 4, fields: [
    { key: "escalation", label: "Escalation", type: "select", options: ["None", "Annual", "Indexed"], required: true, standard: "None" },
    { key: "reimbursables", label: "Reimbursables", type: "textarea" },
    { key: "finalPaymentConditions", label: "Final payment conditions", type: "textarea", required: true,
      hint: "Include EOBI proof where applicable" },
    { key: "clientNoticeDays", label: "Client notice days", type: "number", required: true },
    { key: "consultantExitRight", label: "Consultant exit right", type: "text", required: true },
    { key: "ip", label: "IP", type: "select", options: ["Client", "Consultant", "Joint"], required: true, standard: "Client" },
    { key: "subContracting", label: "Sub-contracting", type: "select", options: ["Not permitted", "With consent", "Permitted"], required: true },
    { key: "nonSolicit", label: "Non-solicit", type: "select", options: ["Yes", "No"], required: true },
  ] },
];

/* --------------------------------------- CRF-07 — Architecture & Design -- */

const CRF07 = [
  { key: "adHeader", label: "Engagement", step: 1, fields: [
    { key: "intraGroup", label: "Intra-group", type: "select", options: ["Yes", "No"], required: true },
    { key: "effectiveDate", label: "Effective date", type: "date", required: true },
    { key: "retrospective", label: "Retrospective", type: "select", options: ["Yes", "No"], required: true },
  ] },
  { key: "projectSpec", label: "Project specification", step: 3, fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "site", label: "Site", type: "textarea", required: true },
    { key: "towers", label: "Towers", type: "number", required: true },
    { key: "basements", label: "Floors — basements", type: "number", required: true },
    { key: "groundFloor", label: "Floors — ground floor", type: "select", options: ["Yes", "No"], required: true },
    { key: "upperFloors", label: "Floors — N upper floors", type: "number", required: true },
    { key: "category", label: "Category", type: "multiselect", required: true,
      options: ["Residential", "Commercial", "Mixed Use", "Hospitality", "Retail", "Office", "Institutional"] },
    { key: "coveredArea", label: "Covered area (sq ft)", type: "number", required: true },
    { key: "authority", label: "Authority", type: "text", required: true },
    { key: "brief", label: "Brief", type: "textarea", required: true },
  ] },
  { key: "adScope", label: "Scope", step: 3, fields: [
    { key: "disciplines", label: "Disciplines", type: "multiselect", required: true,
      options: ["Master Plan", "Architectural", "Structural", "Electrical / ELV", "Plumbing / Fire",
        "HVAC", "Vertical Transport", "Interiors", "Landscape", "BOQ / Tender", "Authority Support"] },
    { key: "exclusions", label: "Exclusions", type: "textarea" },
    { key: "revisionCount", label: "Revision count", type: "number", required: true },
    { key: "acceptanceDays", label: "Acceptance days", type: "number", required: true },
    { key: "siteVisits", label: "Site visits", type: "text", required: true },
    { key: "subConsultants", label: "Sub-consultants", type: "select", options: ["Not permitted", "With consent", "Permitted"], required: true },
  ] },
  { key: "adFee", label: "Fee", step: 3, fields: [
    { key: "feeBasis", label: "Basis", type: "select", options: ["Per Sq Ft", "Lump Sum"], required: true },
    { key: "rate", label: "Rate per sq ft", type: "money", showIf: { field: "feeBasis", eq: "Per Sq Ft" }, requiredIf: { field: "feeBasis", eq: "Per Sq Ft" }, financeTrigger: true },
    { key: "lumpSum", label: "Lump sum", type: "money", showIf: { field: "feeBasis", eq: "Lump Sum" }, requiredIf: { field: "feeBasis", eq: "Lump Sum" }, financeTrigger: true },
    { key: "feeTotal", label: "Total", type: "money", calc: { rateByArea: ["rate", "coveredArea", "lumpSum", "feeBasis"] }, readOnly: true, financeTrigger: true },
    { key: "tax", label: "Tax", type: "text", required: true },
    { key: "mobilisationRecharge", label: "Mobilisation / monthly recharge", type: "text" },
    { key: "structure", label: "Structure", type: "textarea", required: true },
    { key: "invoiceDays", label: "Invoice days", type: "number", required: true },
    { key: "consultantBank", label: "Consultant bank", type: "text", required: true },
  ] },
  { key: "adTerms", label: "Terms", step: 4, fields: [
    { key: "ip", label: "IP", type: "select", options: ["Consultant Owns, Client Licence", "Client Owns", "Joint"], required: true, standard: "Consultant Owns, Client Licence" },
    { key: "terminationNotice", label: "Termination notice", type: "text", required: true },
    { key: "cureDays", label: "Cure days", type: "number", required: true },
    { key: "forceMajeureThreshold", label: "Force majeure threshold", type: "text" },
    { key: "liabilityCap", label: "Liability cap", type: "text", required: true },
  ] },
];

/* --------------------------------------------- CRF-08 — Joint Venture ---- */

const CRF08 = [
  { key: "jvParties", label: "JV parties", step: 2, fields: [
    { key: "landownerThirdParty", label: "Landowner (if a third party)", type: "text" },
    { key: "seniorOfficers", label: "Senior officers for deadlock", type: "textarea", required: true },
  ] },
  { key: "jvProject", label: "Project", step: 3, fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "projectType", label: "Type", type: "text", required: true },
    { key: "landDetails", label: "Land details", type: "textarea", required: true },
    { key: "authority", label: "Authority", type: "text", required: true },
    { key: "masterPlanner", label: "Master planner", type: "text" },
    { key: "vehicle", label: "Vehicle", type: "select", options: ["Contractual", "SPV", "Partnership", "Musharakah"], required: true },
    { key: "effectiveDate", label: "Effective date", type: "date", required: true },
    { key: "term", label: "Term", type: "text", required: true },
  ] },
  { key: "contributions", label: "Contributions", step: 3, grid: true, minRows: 2, fields: [
    { key: "party", label: "Party", type: "text", required: true },
    { key: "land", label: "Land", type: "text" },
    { key: "cash", label: "Cash", type: "money", financeTrigger: true },
    { key: "services", label: "Services", type: "text" },
    { key: "deadline", label: "Deadline", type: "date", required: true },
  ] },
  { key: "jvLand", label: "Land", step: 3, fields: [
    { key: "landCost", label: "Land cost", type: "money", financeTrigger: true, required: true },
    { key: "landSchedule", label: "Land schedule", type: "textarea" },
    { key: "approvalCostBearer", label: "Approval cost bearer", type: "text", required: true },
    { key: "incurredCosts", label: "Incurred costs", type: "money", financeTrigger: true },
    { key: "landTransferRoute", label: "Land transfer route", type: "text", required: true },
    { key: "charges", label: "Charges", type: "text" },
  ] },
  { key: "governance", label: "Governance", step: 4, fields: [
    { key: "pmcSize", label: "PMC size", type: "number", required: true },
    { key: "pmcSplit", label: "PMC split", type: "text", required: true },
    { key: "nominees", label: "Nominees", type: "textarea", required: true },
    { key: "quorum", label: "Quorum", type: "text", required: true },
    { key: "voting", label: "Voting", type: "text", required: true },
    { key: "meetingFrequency", label: "Meeting frequency", type: "text", required: true },
    { key: "meetingNotice", label: "Meeting notice", type: "text", required: true },
    { key: "reservedMatters", label: "Reserved matters", type: "textarea", required: true },
    { key: "deadlockRoute", label: "Deadlock route", type: "text", required: true },
    { key: "buyOutPaymentDays", label: "Buy-out payment days", type: "number", required: true },
  ] },
  { key: "jvCommercials", label: "Commercials", step: 3, fields: [
    { key: "contractorAppointment", label: "Contractor appointment", type: "text", required: true },
    { key: "worksSchedule", label: "Works schedule", type: "textarea", required: true },
    { key: "marketingCompany", label: "Marketing company", type: "text", required: true },
    { key: "exclusivity", label: "Exclusivity", type: "select", options: ["Exclusive", "Non-exclusive"], required: true },
    { key: "marketingFeePct", label: "Marketing fee %", type: "percent", required: true, financeTrigger: true },
    { key: "collectionCapPct", label: "Collection cap %", type: "percent", required: true },
    { key: "projectAccounts", label: "Project accounts", type: "text", required: true },
    { key: "waterfallPct", label: "Waterfall %", type: "text", required: true },
    { key: "profitSharing", label: "Profit sharing", type: "text", required: true },
    { key: "lossSharing", label: "Loss sharing", type: "text", required: true },
    { key: "distributionTiming", label: "Distribution timing", type: "text", required: true },
    { key: "jointSignatories", label: "Joint signatories", type: "text", required: true },
  ] },
  { key: "jvExit", label: "Exit", step: 4, fields: [
    { key: "defaults", label: "Defaults", type: "textarea", required: true },
    { key: "cureDays", label: "Cure days", type: "number", required: true },
    { key: "transferRestrictions", label: "Transfer restrictions", type: "textarea", required: true },
    { key: "lockIn", label: "Lock-in", type: "text", required: true },
    { key: "rofr", label: "ROFR", type: "select", options: ["Yes", "No"], required: true },
    { key: "tag", label: "Tag", type: "select", options: ["Yes", "No"], required: true },
    { key: "drag", label: "Drag", type: "select", options: ["Yes", "No"], required: true },
    { key: "nonCompete", label: "Non-compete", type: "text", required: true },
    { key: "postCompletionManagement", label: "Post-completion management", type: "textarea", required: true },
  ] },
];

/* ----------------------------------------------------- CRF-09 — Other ---- */

const CRF09 = [
  { key: "otherAgreement", label: "Agreement", step: 3, fields: [
    { key: "agreementType", label: "Agreement type", type: "select", required: true,
      options: ["NDA", "MoU / LoI", "Vendor", "Licence", "Partnership / Referral", "Settlement", "Other"] },
    { key: "purpose", label: "Purpose", type: "textarea", required: true },
    { key: "scopeDeliverables", label: "Scope & deliverables", type: "textarea", required: true },
    { key: "obligationsPerParty", label: "Obligations per party", type: "textarea", required: true },
    { key: "effectiveDate", label: "Effective date", type: "date", required: true },
    { key: "term", label: "Term", type: "text", required: true },
    { key: "renewal", label: "Renewal", type: "text" },
    { key: "exclusivity", label: "Exclusivity", type: "select", options: ["Exclusive", "Non-exclusive"], required: true },
  ] },
  { key: "otherCommercials", label: "Commercials", step: 3, fields: [
    { key: "consideration", label: "Consideration", type: "money", financeTrigger: true },
    { key: "tax", label: "Tax", type: "text" },
    { key: "paymentTerms", label: "Payment terms", type: "text" },
    { key: "kpisPenalties", label: "KPIs / penalties", type: "textarea" },
  ] },
  { key: "otherTerms", label: "Terms", step: 4, fields: [
    { key: "terminationConvenience", label: "Termination — convenience", type: "text", required: true },
    { key: "cureDays", label: "Cure days", type: "number", required: true },
    { key: "liabilityIndemnity", label: "Liability & indemnity", type: "textarea", required: true },
    { key: "confidentiality", label: "Confidentiality", type: "select", options: ["Mutual", "One-Way", "NDA"], required: true },
    { key: "ip", label: "IP", type: "text", required: true },
    { key: "personalData", label: "Personal data", type: "select", options: ["Yes", "No"], required: true },
    { key: "regulatoryApprovals", label: "Regulatory approvals", type: "textarea" },
    { key: "signingFormalities", label: "Signing formalities", type: "multiselect", required: true,
      options: ["Stamp Paper", "Witnesses", "Registration", "E-sign"] },
  ] },
];

/* ------------------------------------------------------- CRF-10 — NDA ---- */

/* AN NDA ASKS FEW QUESTIONS AND THE RIGHT ONES.
   It has no consideration, no deliverables and no payment terms, so putting it
   through the Other-agreement form asked a requester eight questions that do
   not apply to it and then required them to answer several. What an NDA
   actually turns on is: which way the information flows, what it is about, how
   long the duty lasts, and whose law governs it. */
const CRF10 = [
  { key: "ndaTerms", label: "Confidentiality", step: 3, fields: [
    { key: "direction", label: "Which way does information flow?", type: "select", required: true,
      options: ["Mutual — both sides disclose", "We disclose only", "They disclose only"] },
    { key: "purpose", label: "Purpose of disclosure", type: "textarea", required: true,
      hint: "What the other side is being told, and why. This defines what they may use it for." },
    { key: "subject", label: "Subject matter", type: "text", required: true },
    { key: "termYears", label: "Confidentiality period (years)", type: "number", required: true,
      hint: "Our standard is 5 years from disclosure." },
    { key: "effectiveDate", label: "Effective date", type: "date", required: true },
    { key: "personalData", label: "Does it involve personal data?", type: "select",
      options: ["Yes", "No"], required: true },
  ] },
  { key: "ndaLegal", label: "Standard terms", step: 4, fields: [
    { key: "governingLaw", label: "Governing law", type: "select",
      options: ["Pakistan", "UAE", "Saudi Arabia", "Other"], required: true },
    { key: "carveOuts", label: "Requested carve-outs", type: "textarea",
      hint: "Anything the counterparty has asked to exclude from the duty. Leave blank if none." },
    { key: "returnDestroy", label: "Return or destruction on termination", type: "select",
      options: ["Return", "Destroy", "Either, at our option"], required: true },
    { key: "signingFormalities", label: "Signing formalities", type: "multiselect", required: true,
      options: ["Stamp Paper", "Witnesses", "E-sign"] },
  ] },
];

const TYPE_SECTIONS = {
  "CRF-01": CRF01, "CRF-02": CRF02, "CRF-03": CRF03, "CRF-04": CRF04, "CRF-05": CRF05,
  "CRF-06": CRF06, "CRF-07": CRF07, "CRF-08": CRF08, "CRF-09": CRF09, "CRF-10": CRF10,
};

/* ------------------------------------------------ mandatory attachments -- */

const ATTACHMENTS = {
  "CRF-01": ["Land Title", "Landowner CNIC", "Developer CNIC", "Corporate Authority",
    "Approvals / NOCs", "Inventory", "Price Schedule", "Buyer Payment Plan"],
  "CRF-02": ["Title Documents", "Lessor CNICs", "Floor Plan"],
  "CRF-03": ["Customer CNIC or Registration", "NTN", "Payment Proof"],
  "CRF-04": ["Title Documents", "Owner CNICs", "Site Plan", "Lien Status", "Down-Payment Instrument"],
  "CRF-05": ["Tender", "LoA", "BOQ", "Drawings & Specifications", "Schedule", "PEC Licence",
    "Contractor NTN / Incorporation"],
  "CRF-06": ["Proposal / Scope", "Fee Quote", "Consultant CNIC / Incorporation", "NTN", "Registrations"],
  "CRF-07": ["Design Brief", "Site Plan & Title", "Fee Proposal", "Counterparty Authority"],
  "CRF-08": ["Land Title", "Land ATS", "Partner Corporate Documents", "Board Resolutions", "Feasibility Model"],
  "CRF-09": ["Counterparty CNIC / Incorporation", "Proposal / Term Sheet"],
  "CRF-10": ["Counterparty CNIC / Incorporation"],
};

module.exports.TYPE_SECTIONS = TYPE_SECTIONS;
module.exports.ATTACHMENTS = ATTACHMENTS;

/* ------------------------------------------------------- the rule kernel -- */

/* CONDITIONS ARE DATA so the browser and the server reach the same answer about
   whether a field was required. This evaluator is the server's, and it is the
   one that decides; src/crf/rules.js mirrors it for instant visibility only. */
function evalCond(cond, values) {
  if (!cond) return true;
  if (Array.isArray(cond.any)) return cond.any.some((c) => evalCond(c, values));
  if (Array.isArray(cond.all)) return cond.all.every((c) => evalCond(c, values));
  const v = values ? values[cond.field] : undefined;
  const has = v !== undefined && v !== null && String(v).trim() !== ""
    && !(Array.isArray(v) && v.length === 0);
  if (cond.truthy) return has;
  if (cond.falsy) return !has;
  if (cond.eq !== undefined) return String(v == null ? "" : v) === String(cond.eq);
  if (cond.ne !== undefined) return String(v == null ? "" : v) !== String(cond.ne);
  if (Array.isArray(cond.in)) return cond.in.map(String).includes(String(v == null ? "" : v));
  return has;
}

const isBlank = (v) => v === undefined || v === null
  || (typeof v === "string" && v.trim() === "")
  || (Array.isArray(v) && v.length === 0);

/* The sections a request of this type actually has, in step order. Common
   blocks and type-specific blocks are interleaved by step, so "Commercial
   Terms" reads as one screen rather than as "the shared ones, then the rest". */
function sectionsFor(type) {
  const own = TYPE_SECTIONS[type] || [];
  const all = COMMON.concat(own).map((s) => Object.assign({}, s, { typeSpecific: own.includes(s) }));
  return all.sort((a, b) => (a.step - b.step) || (COMMON.includes(a) ? -1 : 1));
}

/* The role list depends on the type; everything else about the entity block is
   the same, so the options are patched in rather than the block duplicated. */
function schemaFor(type) {
  const sections = sectionsFor(type).map((s) => {
    if (s.key !== "entity") return s;
    return Object.assign({}, s, {
      fields: s.fields.map((f) => (f.key === "entityRole"
        ? Object.assign({}, f, { options: ENTITY_ROLES[type] || [] }) : f)),
    });
  });
  return {
    type,
    label: (CRF_TYPES.find((t) => t.key === type) || {}).label || type,
    steps: STEPS,
    sections,
    requiredAttachments: ATTACHMENTS[type] || [],
  };
}

module.exports.evalCond = evalCond;
module.exports.isBlank = isBlank;
module.exports.sectionsFor = sectionsFor;
module.exports.schemaFor = schemaFor;
