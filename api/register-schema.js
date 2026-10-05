// The ALLOWLIST for saved views.
//
// A saved view is user input that the application later replays into a register.
// It must never be able to name a filter, a sort or a column the product does
// not have — that is how "restore my view" turns into field injection. So the
// server keeps its own list of what each register legitimately supports, and
// anything outside it is dropped on the way in.
//
// This mirrors src/registerdefs.js (and the per-page field lists). The two are
// kept honest by tests/m1-saved-views.js, which reads the CLIENT definitions in
// a real browser and fails if any client field key is missing here. That is the
// drift alarm: adding a filter without allowing it here breaks the test, not a
// user's saved view.
//
// `ns` is the URL namespace the register uses for its query parameters.

const REGISTERS = {
  cases: {
    label: "Litigation · Cases",
    filters: ["stage", "status", "risk", "type", "counsel", "hearing", "entity", "court", "position", "exposure", "docs", "filed", "quality"],
    sorts:   ["id", "title", "stage", "risk", "exposure", "counsel", "entity", "docs", "status", "nextHearing", "filed"],
    columns: ["id", "title", "stage", "risk", "exposure", "counsel", "entity", "docs", "status", "nextHearing", "filed"],
  },
  notices: {
    label: "Litigation · Legal Notices",
    filters: ["status", "category", "sender", "replied", "recipient", "issued", "received", "docs", "quality"],
    sorts:   ["id", "details", "category", "sender", "recipient", "noticeDate", "receiptDate", "replyDate", "docs", "status"],
    columns: ["id", "details", "category", "sender", "recipient", "noticeDate", "receiptDate", "replyDate", "docs", "status"],
  },
  ct: {
    label: "Contracts",
    filters: ["status", "category", "ctype", "risk", "expiry", "entity", "party", "owner", "dept", "city", "value", "start", "docs", "quality"],
    sorts:   ["id", "title", "entityName", "category", "docs", "value", "risk", "status", "expiry"],
    columns: ["sr", "id", "title", "entityName", "category", "docs", "value", "risk", "status", "expiry"],
  },
  /* The Compliance registers below were rebuilt around the real source data, so
     their allowlists name the CURRENT field keys. A key that is not listed is
     dropped from a saved view rather than stored — that is what stops a crafted
     view from smuggling a filter the register does not support. */
  lic: {
    label: "Compliance · Licences & Permits",
    filters: ["authority", "entity", "status", "expiry", "renewal", "renewals", "issued", "docs", "origin"],
    sorts:   ["id", "title", "authority", "number", "issued", "expiry", "renewals", "renewal", "docs", "status"],
    columns: ["id", "title", "authority", "number", "issued", "expiry", "renewals", "renewal", "docs", "status"],
  },
  loan: {
    label: "Compliance · Loan Agreements",
    filters: ["category", "status", "sbp", "entity", "lender", "currency", "principal", "repay", "signed", "history", "docs", "origin", "quality"],
    sorts:   ["id", "title", "category", "principal", "outstanding", "effective", "sbp", "history", "docs", "status"],
    columns: ["id", "title", "category", "principal", "outstanding", "effective", "sbp", "history", "docs", "status"],
  },
  lease: {
    label: "Compliance · Lease Agreements",
    filters: ["status", "entity", "landlord", "city", "region", "department", "type", "rent", "expiry", "start", "docs"],
    sorts:   ["id", "title", "entity", "counterparty", "value", "start", "end", "actions", "docs", "status"],
    columns: ["id", "title", "entity", "counterparty", "value", "start", "end", "actions", "docs", "status"],
  },
  svc: {
    label: "Compliance · Service Agreements",
    filters: ["status", "entity", "provider", "type", "department", "city", "value", "expiry", "start", "docs"],
    sorts:   ["id", "title", "entity", "counterparty", "department", "value", "end", "actions", "docs", "status"],
    columns: ["id", "title", "entity", "counterparty", "department", "value", "end", "actions", "docs", "status"],
  },
  res: {
    label: "Compliance · Board Resolutions",
    filters: ["entity", "restype", "dept", "person", "authority", "urgency", "wstatus", "sig", "drive", "date", "docs", "origin"],
    sorts:   ["docNo", "subject", "entity", "dept", "person", "urgency", "date", "sig", "drive", "docs", "status"],
    columns: ["docNo", "subject", "entity", "dept", "person", "urgency", "date", "sig", "drive", "docs", "status"],
  },
  secp: {
    label: "Compliance · SECP Filings",
    filters: ["entity", "fy", "category", "form", "fstatus", "due", "overdue", "filed", "docs"],
    sorts:   ["id", "entity", "fy", "category", "form", "event", "due", "filed", "ack", "docs", "fstatus"],
    columns: ["id", "entity", "fy", "category", "form", "event", "due", "filed", "ack", "docs", "fstatus"],
  },
  prop: {
    label: "Compliance · Project Properties",
    filters: ["entity", "city", "ownership", "status", "value", "jv", "contractor", "start", "docs"],
    sorts:   ["id", "project", "entity", "city", "ownership", "value", "docs", "status"],
    columns: ["id", "project", "entity", "city", "ownership", "value", "docs", "status"],
  },
  mat: {
    label: "Matters",
    filters: ["queue", "practice", "status", "owner", "risk", "mtype", "dept", "cparty", "age", "target", "value", "updated"],
    sorts:   ["id", "name", "practiceArea", "department", "counterpartyId", "owner", "status", "risk", "targetDate", "age", "value"],
    columns: ["id", "name", "practiceArea", "department", "counterpartyId", "owner", "status", "risk", "targetDate", "age", "value"],
  },
  req: {
    label: "Legal Requests",
    filters: ["status", "rtype", "sla", "priority", "dept", "due", "owner", "requester", "entity", "category", "risk", "stage", "value", "raised"],
    sorts:   ["requestDate", "id", "matterId", "title", "requester", "category", "entityId", "value", "due", "tatStatus"],
    columns: ["requestDate", "id", "matterId", "title", "requester", "category", "entityId", "value", "due", "tatAnalysis", "tatStatus"],
  },
  usr: {
    label: "Users & Access",
    filters: ["status", "arole", "team", "modules", "level", "jobrole", "dept", "changed"],
    sorts:   ["name", "email", "team", "accessRole", "modules", "status", "updatedAt"],
    columns: ["name", "email", "team", "accessRole", "modules", "status", "updatedAt"],
  },
  dh: {
    label: "Data Health · Issues",
    filters: ["family", "quality", "field", "file", "sheet"],
    sorts:   ["id", "family", "quality", "detail", "source"],
    columns: ["id", "family", "quality", "detail", "source"],
  },
  // --- registers migrated off the legacy FilterBar ---
  repo: {
    label: "Repository",
    filters: ["source", "kind", "entity", "ctype", "mapped", "ocr", "physical", "office", "uploader", "drive"],
    sorts:   ["srNo", "name", "source", "entityId", "contractType", "ocr", "physicalRecordRef", "officeLocation", "contractId"],
    columns: ["srNo", "name", "source", "entityId", "contractType", "ocr", "physicalRecordRef", "officeLocation", "driveLink", "contractId"],
  },
  trk: {
    label: "Contract Tracker",
    filters: ["status", "ctype", "entity", "expiry", "docs", "party", "dept", "region", "city", "risk", "value", "start"],
    sorts:   ["sr", "title", "start", "expiry", "dept", "region", "contractType", "company", "counterparty", "documents", "city", "value", "status", "physicalRecord"],
    columns: ["sr", "title", "start", "expiry", "dept", "region", "contractType", "company", "counterparty", "documents", "city", "value", "status", "physicalRecord"],
  },
  pipe: {
    label: "Pipelines",
    filters: ["status", "stage", "tat", "owner", "category", "entity", "risk", "priority", "due"],
    sorts:   ["u", "team", "count", "load", "delayed", "due", "worst", "value"],
    columns: ["u", "team", "count", "load", "delayed", "due", "worst", "value"],
  },
  anz: {
    label: "Contract Analyzer",
    filters: ["status", "entity", "jur", "ctype", "expiry", "party", "ppa", "land", "parcel", "risk"],
    sorts:   ["id", "title", "counterparty", "jur", "ppaValue", "landValue", "landRef", "status", "expiry"],
    columns: ["id", "title", "counterparty", "jur", "ppaValue", "landValue", "landRef", "status", "expiry"],
  },
  lcn: {
    label: "Licenses & Registrations",
    filters: ["validity", "type", "entity", "authority", "region", "owner", "expiry", "issued"],
    sorts:   ["id", "name", "type", "entity", "authority", "jurisdiction", "status", "expiryDate", "issueDate", "owner"],
    columns: ["id", "name", "type", "entity", "authority", "jurisdiction", "status", "expiryDate", "issueDate", "owner"],
  },
  wsp: {
    label: "Legal Workspace",
    // The union across its lenses (worklist/log, contracts/browse, compliance);
    // each lens offers only the subset its own records carry.
    filters: ["status", "stage", "tat", "owner", "category", "due", "rtype", "entity", "dept", "risk", "priority", "raised",
              "ctype", "expiry", "value", "docs", "area", "region"],
    sorts:   ["requestDate", "id", "matterId", "title", "requester", "category", "entityId", "owner", "due", "tatStatus"],
    columns: ["requestDate", "id", "matterId", "title", "requester", "category", "entityId", "owner", "due", "tatAnalysis", "tatStatus"],
  },
  rpt: {
    label: "Reports",
    filters: ["entity", "ctype", "status", "risk", "city", "expiry", "start", "value"],
    sorts:   ["title", "entityName", "contractType", "value", "risk", "status", "expiry"],
    columns: ["title", "entityName", "contractType", "value", "risk", "status", "expiry"],
  },
};

const MAX = { name: 80, values: 40, valueLen: 120, filters: 24, columns: 40 };

/* Reduce an incoming saved view to what this register genuinely supports.
   Returns { view, dropped } — `dropped` is not an error: a register that loses a
   filter, or a saved value for an entity that no longer exists, should keep the
   rest of the view working and TELL the user which parts no longer apply. */
function sanitize(input) {
  const out = { dropped: [] };
  const reg = REGISTERS[String((input && input.register) || "")];
  if (!reg) return { error: "unknown register" };
  out.register = String(input.register);

  const name = String((input && input.name) || "").trim().slice(0, MAX.name);
  if (!name) return { error: "a saved view needs a name" };
  out.name = name;

  // filters: { key: [values] }, keys allowlisted, values are opaque strings
  const filters = {};
  const raw = (input && input.filters) || {};
  let nFilters = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (nFilters >= MAX.filters) { out.dropped.push("filter:" + k); continue; }
    if (!reg.filters.includes(k)) { out.dropped.push("filter:" + k); continue; }
    const vals = (Array.isArray(v) ? v : [v])
      .filter((x) => typeof x === "string" || typeof x === "number")
      .map((x) => String(x).slice(0, MAX.valueLen))
      .slice(0, MAX.values);
    if (!vals.length) continue;
    filters[k] = vals; nFilters++;
  }
  out.filters = filters;

  const q = String((input && input.q) || "").slice(0, MAX.valueLen);
  if (q) out.q = q;

  if (input && input.sort && input.sort.key) {
    if (reg.sorts.includes(String(input.sort.key))) {
      out.sort = { key: String(input.sort.key), dir: input.sort.dir === "desc" ? "desc" : "asc" };
    } else out.dropped.push("sort:" + input.sort.key);
  }

  if (Array.isArray(input && input.hiddenColumns)) {
    const cols = [];
    for (const c of input.hiddenColumns.slice(0, MAX.columns)) {
      if (reg.columns.includes(String(c))) cols.push(String(c));
      else out.dropped.push("column:" + c);
    }
    if (cols.length) out.hiddenColumns = cols;
  }

  if (input && input.view) out.view = String(input.view).slice(0, 40);   // sub-tab (?view=)
  return out;
}

module.exports = { REGISTERS, sanitize, MAX };
