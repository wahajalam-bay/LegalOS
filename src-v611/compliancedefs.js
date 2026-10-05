// Register definitions for the Compliance workspace.
//
// Six record families, one shared register shell. Every filter here is
// CONTEXTUAL -- it exists because the family's own data has that dimension, not
// because a generic filter bar offers it. A loan filters by SBP registration and
// repayment date; a resolution filters by entity and signature state; a SECP
// filing filters by financial year and form. Nothing offers "priority" to a
// register whose source has no priority.
import { html, cx, fmt } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Status } from "./ui.js";
import { DueCell, DrillCell, DocsCell, ExpiryCell, qualityLabel } from "./registerdefs.js";

const money = (v, ccy) => (v == null || v === "" ? "—" : (ccy ? ccy + " " : "") + Number(v).toLocaleString());
const plainDate = (d) => (d ? String(d).slice(0, 10) : "");
/* A VALUE THAT IS ONLY WHITESPACE IS NOT A VALUE.
   The spend trackers carry cells holding a single space, and this used to pass
   them straight through: the cell rendered blank, and where the same value was
   also used as the button's `title` the control ended up with no accessible
   name at all — a button a screen reader announces as nothing. Trim first,
   then decide. */
const dash = (v) => { const t = String(v == null ? "" : v).trim(); return t === "" ? "—" : t; };

/* A short provenance marker. A record read from a spreadsheet, a record found
   only in Drive and a record created in LegalOS are three different kinds of
   thing, and the register says which without the reader having to ask. */
export function OriginTag({ row }) {
  if (row.origin === "drive") {
    return html`<${Pill} tone="amber" title="Discovered in Google Drive with no tracker row. Fields the folder does not state are left blank.">Drive only</${Pill}>`;
  }
  if (row.origin === "legalos") return html`<${Pill} tone="indigo" title="Created in LegalOS">LegalOS</${Pill}>`;
  return null;
}

/* ===================================================================== LOANS */

// Category, SBP state and repayment position are the three questions the
// compliance team actually asks of the loan book.
/* The three categories the business uses (§48/§49). Their labels come from the
   record itself (`categoryLabel`, set once on the server) so the filter, the
   column, the KPI tiles and the company cards cannot drift apart. */
export const LOAN_CATEGORY_LABEL = {
  fdi: "FDI Loans",
  fcy: "FCY Loans",
  intercompany: "Intercompany PK Loans",
  international: "FDI Loans",          // legacy value from a cached payload
};
export const loanCategoryLabel = (r) => (r && r.categoryLabel) || LOAN_CATEGORY_LABEL[r && r.category] || "Uncategorised";

export const loanFields = [
  { key: "category", label: "Category", type: "multi", get: loanCategoryLabel },
  { key: "status", label: "Status", type: "multi", get: (r) => r.status },
  { key: "sbp", label: "SBP registration", type: "multi", get: (r) => (r.sbp ? r.sbp.label : null) },
  { key: "entity", label: "Entity (borrower)", type: "multi", get: (r) => r.borrower },
  { key: "lender", label: "Lender", type: "multi", get: (r) => r.lender },
  { key: "currency", label: "Currency", type: "multi", get: (r) => r.currency },
  { key: "principal", label: "Principal", type: "money", get: (r) => (typeof r.principal === "number" ? r.principal : null) },
  { key: "repay", label: "Repayment due", type: "date", get: (r) => (r.current ? r.current.repaymentDue : null) },
  { key: "signed", label: "Agreement date", type: "datePast", get: (r) => (r.original ? r.original.agreementDate : r.agreementDate), advanced: true },
  { key: "history", label: "History on file", type: "count", get: (r) => (r.eventCount || 0), advanced: true },
  { key: "docs", label: "Documents", type: "count", get: (r) => (r.driveFiles || []).length, advanced: true },
  { key: "origin", label: "Source", type: "multi", advanced: true,
    get: (r) => (r.origin === "drive" ? "Drive only (no tracker row)" : "Tracker") },
  { key: "quality", label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.__quality), advanced: true },
];
/* A RECORD IS ALSO ITS PAPERWORK.
   Searching "PACRA" in Service Agreements returned "0 of 83" while a PACRA
   rating mandate sat in a service agreement's Documents tab two clicks away.
   The register searched title, entity, counterparty and file number -- every
   field except the one the lawyer had actually read. People search for the
   document they remember, not the tracker row somebody typed around it.

   Document names are appended to every compliance register's search. The
   shapes differ by family (`driveFiles` on most, `documents` on SECP, plus
   folder-swept and contested copies), and on some list payloads `documents` is
   a COUNT rather than an array, so each is taken only when it is really a
   list. */
export const documentNames = (r) => {
  const lists = [r.driveFiles, r.extraDocuments, r.contestedDocuments, r.documents, r.folderDocuments];
  const out = [];
  for (const l of lists) {
    if (!Array.isArray(l)) continue;
    for (const d of l) if (d && d.name) out.push(d.name);
  }
  return out.join(" ");
};

export const loanSearchKeys = ["id", "ref", "refText", "title", "borrower", "lender", "status", "currency", documentNames];
export const loanViews = [
  { id: "fdi", label: "FDI", filters: { category: "FDI Loans" } },
  { id: "fcy", label: "FCY", filters: { category: "FCY Loans" } },
  { id: "inter", label: "Intercompany PK", filters: { category: "Intercompany PK Loans" } },
  { id: "sbppending", label: "SBP pending", filters: { sbp: "Pending registration|Submitted" } },
  { id: "sbpreg", label: "SBP registered", filters: { sbp: "Registered" } },
  { id: "due30", label: "Repayment ≤ 30 days", filters: { repay: "d30" } },
  { id: "overdue", label: "Repayment passed", filters: { repay: "overdue" } },
  { id: "closed", label: "Closed / repaid", filters: { status: "Repaid|Closed|Converted to equity|Withdrawn|Discarded" } },
];

export const loanColumns = (f, { onOpen }) => [
  { key: "id", label: "Loan ID", mono: true, width: "116px", essential: true, sortValue: true, plain: (r) => r.id,
    render: (r) => html`<span class="cell-mono">${r.id}</span>` },
  { key: "title", label: "Loan agreement", essential: true, sortValue: true, plain: (r) => r.title,
    render: (r) => html`<div class="cell-strong">${dash(r.borrower || r.title)}</div>
      <div class="tiny muted">${r.lender ? "← " + r.lender : (r.origin === "drive" ? r.title : "")}</div>` },
  { key: "category", label: "Category", sortValue: true, plain: loanCategoryLabel,
    render: (r) => html`<${DrillCell} f=${f} fkey="category" value=${loanCategoryLabel(r)} title="Filter by category">
      <${Pill} tone=${r.category === "fdi" ? "indigo" : r.category === "fcy" ? "purple" : "gray"}>${loanCategoryLabel(r)}</${Pill}>
    </${DrillCell}>` },
  { key: "principal", label: "Principal", align: "right", sortAs: "number", sortValue: true,
    plain: (r) => (r.principal == null ? "" : r.principal),
    render: (r) => html`<span class="strong">${r.principal != null ? money(r.principal, r.currency) : html`<span class="tiny muted">${dash(r.principalText)}</span>`}</span>` },
  { key: "outstanding", label: "Outstanding", secondary: true, align: "right", sortAs: "number", sortValue: true,
    plain: (r) => (r.balance && r.balance.outstanding != null ? r.balance.outstanding : ""),
    render: (r) => (r.balance && r.balance.outstanding != null
      ? html`<span class=${cx(r.balance.fullyRepaid && "muted")}>${money(r.balance.outstanding, r.currency)}</span>`
      : html`<span class="tiny muted">—</span>`) },
  { key: "effective", label: "Repayment due", sortAs: "date", sortValue: true,
    plain: (r) => plainDate(r.current && r.current.repaymentDue),
    render: (r) => html`<${DueCell} row=${{ ...r, __due: r.current && r.current.repaymentDue, status: r.status }} field="__due" />` },
  { key: "sbp", label: "SBP", sortValue: true, plain: (r) => (r.sbp ? r.sbp.label : ""),
    render: (r) => html`<${DrillCell} f=${f} fkey="sbp" value=${r.sbp && r.sbp.label} title="Filter by SBP state">
      <${SbpPill} sbp=${r.sbp} /></${DrillCell}>` },
  { key: "history", label: "History", secondary: true, align: "center", sortAs: "number", sortValue: true, plain: (r) => r.eventCount || 0,
    render: (r) => (r.eventCount
      ? html`<span class="tiny" title=${r.eventCount + " recorded events"}>${r.eventCount}</span>`
      : html`<span class="tiny muted">—</span>`) },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: (r) => (r.driveFiles || []).length,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onOpen} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<div class="row" style="gap:6px;align-items:center">
      <${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status} /></${DrillCell}>
      <${OriginTag} row=${r} /></div>` },
];

export function SbpPill({ sbp }) {
  if (!sbp) return html`<span class="tiny muted">—</span>`;
  const tone = { REGISTERED: "green", SUBMITTED: "amber", PENDING: "amber", REJECTED: "red", NOT_REQUIRED: "gray", UNKNOWN: "gray" }[sbp.key] || "gray";
  return html`<${Pill} tone=${tone} title=${sbp.reason || sbp.note || sbp.label}>${sbp.label}</${Pill}>`;
}

/* ==================================================================== LEASES */

export const leaseFields = [
  { key: "status", label: "Status", type: "multi", get: (r) => r.status },
  { key: "entity", label: "Entity", type: "multi", get: (r) => r.entity },
  { key: "landlord", label: "Landlord / counterparty", type: "multi", get: (r) => r.counterparty },
  { key: "city", label: "City", type: "multi", get: (r) => r.city },
  { key: "region", label: "Region", type: "multi", get: (r) => r.region },
  { key: "department", label: "Department", type: "multi", get: (r) => r.department },
  { key: "type", label: "Agreement type", type: "multi", get: (r) => r.agreementType },
  { key: "rent", label: "Contract value", type: "money", get: (r) => (typeof r.value === "number" ? r.value : null) },
  { key: "expiry", label: "Expiry", type: "date", get: (r) => r.end },
  { key: "start", label: "Start date", type: "datePast", get: (r) => r.start, advanced: true },
  { key: "docs", label: "Documents", type: "count", get: (r) => (r.driveFiles || []).length, advanced: true },
];
export const leaseSearchKeys = ["id", "title", "entity", "counterparty", "city", "fileNo", "agreementType", documentNames];
export const leaseViews = [
  { id: "active", label: "Active", filters: { status: "Active" } },
  { id: "expiring", label: "Expiring ≤ 90 days", filters: { expiry: "d90" } },
  { id: "expired", label: "Expired", filters: { expiry: "overdue" } },
  { id: "terminated", label: "Terminated / inactive", filters: { status: "Inactive|Terminated" } },
];

export const leaseColumns = (f, { onOpen }) => [
  { key: "id", label: "ID", mono: true, width: "110px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "title", label: "Lease", essential: true, sortValue: true, plain: (r) => r.title,
    render: (r) => html`<div class="cell-strong">${dash(r.title)}</div>
      <div class="tiny muted">${[r.city, r.fileNo && "File " + r.fileNo].filter(Boolean).join(" · ")}</div>` },
  { key: "entity", label: "Entity", width: "150px", sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title=${dash(r.entity)}>
      <span class="tiny clip">${dash(r.entity)}</span></${DrillCell}>` },
  { key: "counterparty", label: "Landlord", width: "160px", sortValue: true, plain: (r) => r.counterparty,
    render: (r) => html`<${DrillCell} f=${f} fkey="landlord" value=${r.counterparty} title=${dash(r.counterparty)}>
      <span class="tiny clip">${dash(r.counterparty)}</span></${DrillCell}>` },
  { key: "value", label: "Rent / value", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.value || "",
    render: (r) => html`<span class="strong">${r.value != null ? money(r.value, "PKR") : html`<span class="tiny muted">${dash(r.valueText)}</span>`}</span>` },
  { key: "start", label: "Start", secondary: true, sortAs: "date", sortValue: true, plain: (r) => plainDate(r.start),
    render: (r) => html`<span class="tiny muted">${r.start ? fmt.dateShort(r.start) : "—"}</span>` },
  { key: "end", label: "Expiry", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.end),
    render: (r) => (r.end ? html`<${ExpiryCell} date=${r.end} />`
      : html`<span class="tiny muted">${dash(r.endText) === "—" ? "No expiry recorded" : dash(r.endText)}</span>`) },
  { key: "actions", label: "Lifecycle actions", secondary: true, align: "center", sortAs: "number", sortValue: true, plain: (r) => r.actionCount || 0,
    render: (r) => (r.actionCount ? html`<${Pill} tone="indigo">${r.actionCount}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: (r) => (r.driveFiles || []).length,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onOpen} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status || "Unknown"} /></${DrillCell}>` },
];

/* ======================================================== SERVICE AGREEMENTS */

// Deliberately NOT the loan field set. A service agreement has a scope and a
// provider; it has no principal, no lender and no SBP position.
export const serviceFields = [
  { key: "status", label: "Status", type: "multi", get: (r) => r.status },
  { key: "entity", label: "Entity", type: "multi", get: (r) => r.entity },
  { key: "provider", label: "Service provider", type: "multi", get: (r) => r.counterparty },
  { key: "type", label: "Agreement type", type: "multi", get: (r) => r.agreementType },
  { key: "department", label: "Department", type: "multi", get: (r) => r.department },
  { key: "city", label: "City", type: "multi", get: (r) => r.city },
  { key: "value", label: "Contract value", type: "money", get: (r) => (typeof r.value === "number" ? r.value : null) },
  { key: "expiry", label: "Expiry", type: "date", get: (r) => r.end },
  { key: "start", label: "Start date", type: "datePast", get: (r) => r.start, advanced: true },
  { key: "docs", label: "Documents", type: "count", get: (r) => (r.driveFiles || []).length, advanced: true },
];
export const serviceSearchKeys = ["id", "title", "entity", "counterparty", "agreementType", "department", "fileNo", documentNames];
export const serviceViews = [
  { id: "active", label: "Active", filters: { status: "Active" } },
  { id: "expiring", label: "Expiring ≤ 90 days", filters: { expiry: "d90" } },
  { id: "expired", label: "Expired", filters: { expiry: "overdue" } },
  { id: "ongoing", label: "Ongoing (no end date)", filters: { expiry: "none" } },
];

export const serviceColumns = (f, { onOpen }) => [
  { key: "id", label: "ID", mono: true, width: "110px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "title", label: "Spend agreement", essential: true, sortValue: true, plain: (r) => r.title,
    render: (r) => html`<div class="cell-strong">${dash(r.title)}</div>
      <div class="tiny muted">${dash(r.agreementType)}</div>` },
  { key: "entity", label: "Entity", width: "150px", sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title=${dash(r.entity)}>
      <span class="tiny clip">${dash(r.entity)}</span></${DrillCell}>` },
  { key: "counterparty", label: "Provider", width: "160px", sortValue: true, plain: (r) => r.counterparty,
    render: (r) => html`<${DrillCell} f=${f} fkey="provider" value=${r.counterparty} title=${dash(r.counterparty)}>
      <span class="tiny clip">${dash(r.counterparty)}</span></${DrillCell}>` },
  { key: "department", label: "Department", secondary: true, sortValue: true, plain: (r) => r.department,
    render: (r) => html`<span class="tiny">${dash(r.department)}</span>` },
  { key: "value", label: "Value", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.value || "",
    render: (r) => html`<span class="strong">${r.value != null ? money(r.value, "PKR") : html`<span class="tiny muted">${dash(r.valueText)}</span>`}</span>` },
  { key: "end", label: "Expiry", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.end),
    render: (r) => (r.end ? html`<${ExpiryCell} date=${r.end} />`
      : html`<span class="tiny muted">${dash(r.endText) === "—" ? "No expiry recorded" : dash(r.endText)}</span>`) },
  { key: "actions", label: "Lifecycle actions", secondary: true, align: "center", sortAs: "number", sortValue: true, plain: (r) => r.actionCount || 0,
    render: (r) => (r.actionCount ? html`<${Pill} tone="indigo">${r.actionCount}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: (r) => (r.driveFiles || []).length,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onOpen} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status || "Unknown"} /></${DrillCell}>` },
];

/* =============================================================== RESOLUTIONS */

// The source workbook holds date, agenda and document number. Everything else
// the compliance brief asks for (requesting department, authorised person,
// urgency, signature and Drive-filing state) exists on resolutions CREATED in
// LegalOS, and is blank on historical rows rather than invented for them.
export const resolutionFields2 = [
  { key: "entity", label: "Entity", type: "multi", get: (r) => r.entity },
  { key: "restype", label: "Resolution type", type: "multi", get: (r) => (r.fields ? r.fields.resolutionType : "Board Resolution") },
  { key: "dept", label: "Requesting department", type: "multi", get: (r) => (r.fields ? r.fields.requestingDepartment : null) },
  { key: "person", label: "Person authorised", type: "multi", get: (r) => (r.fields ? r.fields.authorizedPerson : null) },
  { key: "authority", label: "Addressed to", type: "multi", get: (r) => (r.fields ? r.fields.addressedTo : null) },
  { key: "urgency", label: "Urgency", type: "multi", get: (r) => (r.fields ? r.fields.urgency : null) },
  { key: "wstatus", label: "Workflow status", type: "multi", get: (r) => r.statusLabel || null },
  { key: "sig", label: "Signature", type: "multi", get: (r) => (r.signature ? r.signature.label : null) },
  { key: "drive", label: "Drive upload", type: "multi", get: (r) => driveLabel(r) },
  { key: "date", label: "Resolution date", type: "datePast", get: (r) => (r.fields && r.fields.resolutionDate) || r.date },
  { key: "docs", label: "Documents", type: "count", get: (r) => (r.documents != null ? r.documents : (r.driveFiles || []).length) },
  { key: "origin", label: "Source", type: "multi", advanced: true,
    get: (r) => (r.origin === "legalos" ? "Created in LegalOS" : "Historical (Drive tracker)") },
];
export const resolutionSearchKeys2 = ["id", "agenda", "entity", "docNo", "subject", documentNames];
export const resolutionViews2 = [
  { id: "pendingsig", label: "Pending signature", filters: { sig: "Pending|Partially signed" } },
  { id: "executed", label: "Executed", filters: { wstatus: "Executed" } },
  { id: "notfiled", label: "Not filed to Drive", filters: { drive: "Not filed|Pending upload" } },
  { id: "urgent", label: "Urgent", filters: { urgency: "Urgent" } },
];

export function driveLabel(r) {
  const s = r.drive && r.drive.status;
  return { NOT_FILED: "Not filed", PENDING_UPLOAD: "Pending upload", FILED: "Filed", UPLOAD_FAILED: "Upload failed" }[s] || null;
}

export const resolutionColumns2 = (f, { onOpen }) => [
  { key: "docNo", label: "Resolution no.", mono: true, width: "128px", essential: true, sortValue: true,
    plain: (r) => r.docNo || r.id,
    render: (r) => html`<span class="cell-mono">${dash(r.docNo || r.id)}</span>` },
  { key: "subject", label: "Resolution / subject", essential: true, sortValue: true,
    plain: (r) => r.agenda || (r.fields && r.fields.subject),
    render: (r) => html`<div class="cell-strong">${dash(r.agenda || (r.fields && r.fields.subject))}</div>
      <div class="tiny muted">${dash((r.fields && r.fields.addressedTo) || "")}</div>` },
  { key: "entity", label: "Entity", width: "150px", sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title=${dash(r.entity)}>
      <span class="tiny clip">${dash(r.entity)}</span></${DrillCell}>` },
  { key: "dept", label: "Requesting dept.", sortValue: true, plain: (r) => r.fields && r.fields.requestingDepartment,
    render: (r) => html`<span class="tiny">${dash(r.fields && r.fields.requestingDepartment)}</span>` },
  { key: "person", label: "Person authorised", sortValue: true, plain: (r) => r.fields && r.fields.authorizedPerson,
    render: (r) => html`<span class="tiny">${dash(r.fields && r.fields.authorizedPerson)}</span>` },
  { key: "urgency", label: "Urgency", sortValue: true, plain: (r) => r.fields && r.fields.urgency,
    render: (r) => (r.fields && r.fields.urgency
      ? html`<${Pill} tone=${/urgent/i.test(r.fields.urgency) ? "red" : "gray"}>${r.fields.urgency}</${Pill}>`
      : html`<span class="tiny muted">—</span>`) },
  { key: "date", label: "Date", sortAs: "date", sortValue: true,
    plain: (r) => plainDate((r.fields && r.fields.resolutionDate) || r.date),
    render: (r) => { const d = (r.fields && r.fields.resolutionDate) || r.date;
      return html`<span class="tiny muted">${d ? fmt.dateShort(d) : "—"}</span>`; } },
  { key: "sig", label: "Signature", sortValue: true, plain: (r) => r.signature && r.signature.label,
    render: (r) => html`<${SignaturePill} sig=${r.signature} />` },
  { key: "drive", label: "Drive upload", sortValue: true, plain: (r) => driveLabel(r),
    render: (r) => html`<${DrivePill} drive=${r.drive} />` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true,
    plain: (r) => (r.documents != null ? r.documents : (r.driveFiles || []).length),
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onOpen} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.statusLabel,
    render: (r) => html`<div class="row" style="gap:6px;align-items:center">
      ${r.statusLabel ? html`<${Status} value=${r.statusLabel} />` : html`<span class="tiny muted">Historical</span>`}
      <${OriginTag} row=${r} /></div>` },
];

export function SignaturePill({ sig }) {
  if (!sig || sig.key === "none") return html`<span class="tiny muted">—</span>`;
  const tone = { complete: "green", partial: "amber", pending: "gray", declined: "red" }[sig.key] || "gray";
  const n = sig.of ? " " + sig.signed + "/" + sig.of : "";
  return html`<${Pill} tone=${tone}>${sig.label}${n}</${Pill}>`;
}

export function DrivePill({ drive }) {
  const s = drive && drive.status;
  if (!s || s === "NOT_FILED") return html`<${Pill} tone="gray">Not filed</${Pill}>`;
  const tone = { FILED: "green", PENDING_UPLOAD: "amber", UPLOAD_FAILED: "red" }[s] || "gray";
  const label = { FILED: "Filed", PENDING_UPLOAD: "Pending upload", UPLOAD_FAILED: "Upload failed" }[s] || s;
  return html`<${Pill} tone=${tone} title=${drive.folderPath || ""}>${label}</${Pill}>`;
}

/* ================================================================== LICENCES */

export const licenceFields2 = [
  { key: "authority", label: "Licensing authority", type: "multi", get: (r) => r.authority },
  { key: "entity", label: "Entity", type: "multi", get: (r) => r.entity },
  { key: "status", label: "Licence status", type: "multi", get: (r) => r.status },
  { key: "expiry", label: "Expiry", type: "date", get: (r) => r.expiry },
  { key: "substatus", label: "Substatus", type: "multi", get: (r) => substatusOf(r) || null },
  { key: "renewal", label: "Renewal application", type: "multi", get: (r) => renewalState(r), advanced: true },
  { key: "renewals", label: "Renewals on file", type: "count", get: (r) => r.renewalsOnFile || 0, advanced: true },
  { key: "issued", label: "Issue date", type: "datePast", get: (r) => r.issued, advanced: true },
  { key: "docs", label: "Documents", type: "count", get: (r) => (r.folderDocuments || r.driveFiles || []).length },
  { key: "origin", label: "Source", type: "multi", advanced: true,
    get: (r) => (r.origin === "drive" ? "Drive only (no tracker row)" : "Tracker") },
];
export const licenceSearchKeys2 = ["id", "title", "entity", "authority", "number", "status", documentNames];
export const licenceViews2 = [
  { id: "expiring", label: "Expiring ≤ 90 days", filters: { expiry: "d90" } },
  { id: "expired", label: "Expired", filters: { expiry: "overdue" } },
  { id: "renewalpending", label: "Renewal pending", filters: { renewal: "In progress" } },
  { id: "norenewal", label: "No renewal application", filters: { renewal: "None" } },
];

export function renewalState(r) {
  const apps = r.applications || [];
  if (!apps.length) return "None";
  if (apps.some((a) => a.status !== "EXECUTED" && a.status !== "CANCELLED")) return "In progress";
  return "Completed";
}

/* THE DEFAULT LICENCE REGISTER (§50).
 *
 * What a compliance lawyer reads: which instrument, whose it is, who issued it,
 * its number, when it runs from and to, where it stands, and whether there is
 * paper behind it.
 *
 * "Renewals on file" and "Renewal application" have left the default set. Both
 * are renewal HISTORY, both belong on the licence's own Renewal tab where the
 * whole chain is, and between them they were taking two columns out of a
 * register that has to be readable at 1366px. They are still defined, still
 * sortable, still exportable, and one click away in Columns.
 */
export const licenceColumns2 = (f, { onOpen }) => [
  { key: "id", label: "ID", mono: true, width: "116px", essential: true, sortValue: true, plain: (r) => r.id },
  /* THE INSTRUMENT IS THE AUTHORITY AND ITS NUMBER.
     The licence summary workbook has no licence-NAME column: a licence is
     identified by who issued it and under what number. The register used to
     print `title` here — which is built as "AUTHORITY — Entity" — with the
     entity underneath it and a Company column beside it, so the same company
     name appeared three times in one row.

     Authority and Licence No. therefore stay DEFINED as columns (§50 asks for
     them, and export and sorting need them) but are off by default, because
     on this source they can only repeat what the first cell already says. One
     click in Columns brings either back. */
  { key: "title", label: "Licence / permit", essential: true, sortValue: true, plain: (r) => r.title,
    render: (r) => html`<div class="cell-strong">${dash(r.authority)}</div>
      <div class="tiny muted">${r.number ? "No. " + r.number : "Number not recorded in the source"}</div>` },
  { key: "entity", label: "Company", sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title="Filter by company">
      <span class="tiny">${dash(r.entity)}</span></${DrillCell}>` },
  { key: "authority", label: "Licensing authority", sortValue: true, plain: (r) => r.authority,
    render: (r) => html`<${DrillCell} f=${f} fkey="authority" value=${r.authority} title="Filter by authority"><${Pill} tone="gray">${dash(r.authority)}</${Pill}></${DrillCell}>` },
  { key: "number", label: "Licence no.", mono: true, sortValue: true, plain: (r) => r.number,
    render: (r) => html`<span class="cell-mono tiny">${dash(r.number)}</span>` },
  { key: "issued", label: "Issued", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.issued),
    render: (r) => html`<span class="tiny muted">${r.issued ? fmt.dateShort(r.issued) : "—"}</span>` },
  { key: "expiry", label: "Expiry", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.expiry),
    render: (r) => html`<${ExpiryCell} date=${r.expiry} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<div class="row" style="gap:6px;align-items:center">
      <${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by licence status">
        <${Status} value=${r.status || "Unknown"} /></${DrillCell}>
      <${OriginTag} row=${r} /></div>` },
  /* SUBSTATUS IS A SEPARATE FACT FROM STATUS (§51).
     "Active" says the instrument is in force; "Renewal submitted" says where
     the renewal has got to. Collapsing them into one column meant a licence in
     force with a renewal pending had to pick one of the two to display. The
     values are the source's and the workflow's own -- nothing here invents a
     taxonomy. */
  { key: "substatus", label: "Substatus", sortValue: true, plain: (r) => substatusOf(r),
    render: (r) => { const sub = substatusOf(r);
      return sub
        ? html`<${DrillCell} f=${f} fkey="substatus" value=${sub} title="Filter by substatus">
            <${Pill} tone=${/progress|submitt|pending|review/i.test(sub) ? "amber" : /renewed|granted|complete/i.test(sub) ? "green" : "gray"}>${sub}</${Pill}></${DrillCell}>`
        : html`<span class="tiny muted">—</span>`; } },
  { key: "docs", label: "Documents", align: "center", sortAs: "number", sortValue: true,
    plain: (r) => (r.folderDocuments || r.driveFiles || []).length,
    render: (r) => html`<${DocsCell} row=${{ ...r, driveFiles: r.folderDocuments || r.driveFiles || [] }} onOpen=${onOpen} />` },
  { key: "renewals", label: "Renewals on file", secondary: true, align: "center", sortAs: "number", sortValue: true, plain: (r) => r.renewalsOnFile || 0,
    render: (r) => (r.renewalsOnFile
      ? html`<${Pill} tone="gray" title="Renewal certificates evidenced in Drive">${r.renewalsOnFile}</${Pill}>`
      : html`<span class="tiny muted">—</span>`) },
  { key: "renewal", label: "Renewal application", secondary: true, sortValue: true, plain: renewalState,
    render: (r) => { const st = renewalState(r);
      return html`<${Pill} tone=${st === "In progress" ? "amber" : st === "Completed" ? "green" : "gray"}>${st}</${Pill}>`; } },
];

/* The licence's SUBSTATUS: where its renewal stands, taken from the source's
   own renewal-status column where it has one and from the LegalOS renewal
   workflow otherwise. A licence with neither has no substatus, and shows a
   dash rather than a manufactured one. */
export function substatusOf(r) {
  const fromSource = String((r && r.renewalStatus) || "").trim();
  if (fromSource) return fromSource;
  const st = renewalState(r);
  return st === "None" ? "" : "Renewal " + st.toLowerCase();
}

/* ====================================================================== SECP */

export const secpFields = [
  { key: "entity", label: "Entity", type: "multi", get: (r) => r.entity },
  { key: "fy", label: "Financial year", type: "multi", get: (r) => r.fields && r.fields.financialYear },
  { key: "category", label: "Filing type", type: "multi",
    get: (r) => (r.subtype === "event" ? "Event-based" : r.subtype === "period" ? "Annual period" : "Annual") },
  { key: "form", label: "SECP form", type: "multi", get: (r) => (r.fields && r.fields.form ? "Form " + r.fields.form : null) },
  { key: "fstatus", label: "Filing status", type: "multi", get: (r) => r.fields && r.fields.filingStatus },
  { key: "due", label: "Statutory due date", type: "date", get: (r) => r.fields && r.fields.statutoryDueDate },
  { key: "overdue", label: "Overdue reason", type: "multi", get: (r) => r.fields && r.fields.overdueReason, advanced: true },
  { key: "filed", label: "Filing date", type: "datePast", get: (r) => r.fields && r.fields.filingDate, advanced: true },
  { key: "docs", label: "Documents", type: "count", get: (r) => r.documents || 0, advanced: true },
];
export const secpSearchKeys = ["id", "entity", "form", "event", "acknowledgementRef", "financialYear", documentNames];
export const secpViews = [
  { id: "outstanding", label: "Outstanding", filters: { fstatus: "Identified / due|Preparation|Ready to file|Additional information required" } },
  { id: "overdue", label: "Overdue", filters: { due: "overdue" } },
  { id: "duesoon", label: "Due ≤ 30 days", filters: { due: "d30" } },
  { id: "filed", label: "Filed / completed", filters: { fstatus: "Filed|Acknowledged / completed" } },
];

export const secpColumns = (f, { onOpen }) => [
  { key: "id", label: "Filing ID", mono: true, width: "116px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "entity", label: "Entity", essential: true, sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title="Filter by entity"><div class="cell-strong">${dash(r.entity)}</div></${DrillCell}>` },
  { key: "fy", label: "FY", sortValue: true, plain: (r) => r.fields && r.fields.financialYear,
    render: (r) => html`<${DrillCell} f=${f} fkey="fy" value=${r.fields && r.fields.financialYear} title="Filter by financial year">
      <${Pill} tone="gray">${dash(r.fields && r.fields.financialYear)}</${Pill}></${DrillCell}>` },
  { key: "category", label: "Type", sortValue: true, plain: (r) => r.subtype,
    render: (r) => html`<${Pill} tone=${r.subtype === "event" ? "indigo" : "gray"}>${r.subtype === "event" ? "Event-based" : r.subtype === "period" ? "Annual period" : "Annual"}</${Pill}>` },
  { key: "form", label: "Form", sortValue: true, plain: (r) => r.fields && r.fields.form,
    render: (r) => html`<span class="cell-mono tiny">${r.fields && r.fields.form ? "Form " + r.fields.form : "—"}</span>` },
  { key: "event", label: "Event / trigger", sortValue: true, plain: (r) => r.fields && r.fields.event,
    render: (r) => html`<span class="tiny">${dash(r.fields && r.fields.event)}</span>` },
  { key: "due", label: "Statutory due", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.fields && r.fields.statutoryDueDate),
    render: (r) => html`<${SecpDueCell} row=${r} />` },
  { key: "filed", label: "Filed", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.fields && r.fields.filingDate),
    render: (r) => html`<span class="tiny muted">${r.fields && r.fields.filingDate ? fmt.dateShort(r.fields.filingDate) : "—"}</span>` },
  { key: "ack", label: "Acknowledgement", sortValue: true, plain: (r) => r.fields && r.fields.acknowledgementRef,
    render: (r) => html`<span class="tiny cell-mono">${dash(r.fields && r.fields.acknowledgementRef)}</span>` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: (r) => r.documents || 0,
    render: (r) => html`<${DocsCell} row=${{ driveFiles: new Array(r.documents || 0) }} onOpen=${() => onOpen(r)} />` },
  { key: "fstatus", label: "Status", sortValue: true, plain: (r) => r.fields && r.fields.filingStatus,
    render: (r) => html`<${DrillCell} f=${f} fkey="fstatus" value=${r.fields && r.fields.filingStatus} title="Filter by filing status">
      <${Status} value=${(r.fields && r.fields.filingStatus) || "Identified / due"} /></${DrillCell}>` },
];

// Overdue is shown with its REASON, because an overdue filing without a stated
// reason is an unanswered question rather than a status.
function SecpDueCell({ row }) {
  const st = row.state || {};
  const due = row.fields && row.fields.statutoryDueDate;
  if (!due) return html`<span class="tiny muted">—</span>`;
  if (st.filed) return html`<span class="tiny muted">${fmt.dateShort(due)}</span>`;
  if (st.overdue) {
    return html`<div><span class="tiny" style="color:var(--danger-text);font-weight:600">${fmt.dateShort(due)} · overdue</span>
      <div class="tiny ${st.needsReason ? "" : "muted"}" style=${st.needsReason ? "color:var(--warning-text)" : ""}>
        ${st.overdueReason || "Reason not recorded"}</div></div>`;
  }
  if (st.dueSoon) return html`<span class="tiny" style="color:var(--warning-text);font-weight:600">${fmt.dateShort(due)} · due soon</span>`;
  return html`<span class="tiny muted">${fmt.dateShort(due)}</span>`;
}
