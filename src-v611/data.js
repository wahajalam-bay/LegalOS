// ============================================================
// LegalOS — Seed data (realistic enterprise legal operations)
// Fictional multinational: "Zameen Group"
// ============================================================

const now = new Date();
function d(offsetDays) {
  const x = new Date(now);
  x.setDate(x.getDate() + offsetDays);
  return x.toISOString();
}

// contracts-real.js (522 KB) is NOT imported any more.
//
// It was generated from the PPA tracker and seeded the contract book. The
// register now reads that same tracker live from Drive, so the baked copy was
// both redundant and stale-by-construction — and importing it shipped half a
// megabyte of unused JSON to every browser on every page load. The file is left
// on disk as provenance; nothing loads it.

/* THE ENTITIES ARE THE GROUP'S OWN, NOT A MAP OF OFFICES.
   This listed "Zameen KSA", "Zameen UAE", "Zameen UK", "Zameen US" and
   "Zameen Singapore" — none of which is a legal entity in this estate. They
   were placeholders describing an international footprint the company does not
   have, and they were offered in the entity picker as though a contract could
   be signed by one of them. The real estate is in the registers and the
   statutory root (94 companies, see /companies); these three are the ones the
   department is working through for now, and the list is deliberately short
   rather than deliberately impressive. */
export const COMPANY = {
  name: "Zameen Group",
  short: "ZM",
  entities: ["Zameen Media (Private) Limited", "Zameen Developments (Private) Limited", "Dubizzle"],
};

export const BUSINESS_UNITS = ["Real Estate", "Technology", "Retail", "Logistics", "Energy", "Financial Services"];
export const DEPARTMENTS = ["Procurement", "Human Resources", "Sales", "Marketing", "Finance", "IT", "Operations", "Legal"];
/* The countries the group actually operates the legal function in. "Saudi
   Arabia", "United Kingdom", "United States" and "Singapore" sat here for the
   same reason the entities above did, and every forum, licence and filing in
   this system is Pakistani. */
export const COUNTRIES = ["Pakistan", "UAE"];

/* ---------------- the requester portal's identities ----------------
   USERS below is the LEGAL team — the only real roster this system has. There
   are no business users in it, and inventing colleagues ("Finance — CFO", with
   an invented email) would put fabricated people into a live system and attach
   their names to real requests. So the portal identifies a requester by their
   DEPARTMENT, which IS real: you enter as Finance, raise for Finance, and track
   Finance's requests.

   WHO the person is does not come from here. On the live domain Cloudflare
   Access has already proved their identity, and the server (api/requests.js)
   stamps that verified email onto every request it stores. The department is
   what the requester chooses; it is never treated as proof of identity. */
export const REQUESTER_DEPTS = DEPARTMENTS.filter((d) => d !== "Legal");
export const REQUESTER_PERSONAS = REQUESTER_DEPTS.map((d) => ({
  id: "dept-" + d.toLowerCase().replace(/[^a-z]+/g, "-"),
  name: d,
  role: "Business requester",
  rbac: "bizHead",          // lands on /raise, sees only the requester surfaces
  dept: d,
  department: d,
  legalTeam: null,          // never legal — isLegal() must stay false
  portal: true,
}));

// Each user now carries their org-architecture placement (FRD Section 14):
// legalTeam = litigation | commercial | compliance | null, rbac = the role key,
// dept = business department for non-legal users.
export const USERS = [
  { id: "u1", name: "Maryam Haq", role: "Director Legal", team: "Executive", email: "maryam.haq@zameen.com", country: "Pakistan", rbac: "head", legalTeam: null, dept: "Legal" },
  { id: "u3", name: "Imran Tariq Mir", role: "Head of Commercial Contracts", team: "Commercial", email: "imran.tariq@zameen.com", country: "Pakistan", rbac: "lead", legalTeam: "commercial", dept: "Legal" },
  { id: "u5", name: "Ahmed Sardar", role: "Associate (Commercial Contracts)", team: "Commercial", email: "ahmed.sardar@zameen.com", country: "Pakistan", rbac: "member", legalTeam: "commercial", dept: "Legal" },
  { id: "u6", name: "Salman Rashid", role: "AD Legal — Head of Litigation & Disputes", team: "Litigation", email: "salman.rashid@zameen.com", country: "Pakistan", rbac: "lead", legalTeam: "litigation", dept: "Legal" },
  { id: "u7", name: "Modassar Ali", role: "Assistant Manager M Legal (Commercial Contracts)", team: "Commercial", email: "modassar.ali@zameen.com", country: "Pakistan", rbac: "member", legalTeam: "commercial", dept: "Legal" },
  { id: "u10", name: "Ali Raza", role: "Legal Executive", team: "Commercial", email: "ali.raza@zameen.com", country: "Pakistan", rbac: "paralegal", legalTeam: "commercial", dept: "Legal" },
  { id: "u12", name: "Sana Hurmat", role: "Associate (Compliance)", team: "Compliance", email: "sana.hurmat@zameen.com", country: "Pakistan", rbac: "member", legalTeam: "compliance", dept: "Legal" },
  // Business requesters are not seeded: a requester becomes known to LegalOS
  // when they actually raise a request, or through Cloudflare Access identity.
  // Pakistan-side legal staff for the three-team architecture (Sprint 6)
  { id: "u17", name: "Hasan Majeed", role: "Senior Manager (Litigation & Disputes)", team: "Litigation", email: "hasan.majeed@zameen.com", country: "Pakistan", rbac: "lead", legalTeam: "litigation", dept: "Legal" },
  { id: "u18", name: "Salman Khan", role: "Senior Associate (Litigation & Disputes)", team: "Litigation", email: "salman.khan@zameen.com", country: "Pakistan", rbac: "member", legalTeam: "litigation", dept: "Legal" },
  { id: "u19", name: "Afzal Chaudhary", role: "Assistant Manager (Recovery)", team: "Litigation", email: "afzal.chaudhary@zameen.com", country: "Pakistan", rbac: "member", legalTeam: "litigation", dept: "Legal" },
  /* Developer Disputes is his. He is on the Litigation bench as a member, which
     in this model IS "reports to the litigation lead" -- assignmentGuard already
     says a Team Lead may only assign to people on their own team, so putting him
     here is what makes him assignable by Salman Rashid (u6) and nobody else.
     Referenced by id everywhere; his name is written once, here. */
  { id: "u26", name: "Muhammad Ali Bajwa", role: "Manager (Developer Disputes)", team: "Litigation", email: "muhammad.bajwa@zameen.com", country: "Pakistan", rbac: "member", legalTeam: "litigation", dept: "Legal" },
  { id: "u20", name: "Arsalan Sandhu", role: "Manager Compliance", team: "Compliance", email: "arsalan.sandhu@zameen.com", country: "Pakistan", rbac: "lead", legalTeam: "compliance", dept: "Legal" },
];
export const byId = (id) =>
  USERS.find((u) => u.id === id) ||
  // A portal requester is a department identity, not a roster person.
  REQUESTER_PERSONAS.find((p) => p.id === id) ||
  { name: "Unassigned" };
// Defensive: an id that no longer resolves (a retired demo id in an old saved
// store) must degrade to a dash, never crash the page that renders it.
export const nameOf = (id) => (byId(id) || {}).name || "—";

const REQUEST_TYPES = [
  "NDA", "Vendor Agreement", "Employment Contract", "Lease Agreement", "Procurement Review",
  "Legal Advice", "Litigation", "Policy Review", "Compliance Review", "Government Approval",
  "IP Review", "Trademark", "Data Privacy Review", "Contract Amendment", "Contract Renewal",
  "Legal Opinion", "MOU", "Partnership Agreement", "Board Resolution", "Power of Attorney",
];
export { REQUEST_TYPES };

// ---------------- Legal Requests (Intake) ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const REQUESTS = [];

// ---------------- Contracts ----------------
// The contract register is the REAL one — 723 records generated from the
// PPAs & Finder's Fee tracker (see contracts-real.js). The demo seed this
// replaced is stripped from saved stores by a migration in store.js.
// The contract book comes from Drive, not from a file baked into the app.
//
// contracts-real.js was generated from "00 Zameen Media-PPAs and Finder's Fee
// Tracker.xlsx" — which the live register now reads directly. Seeding both
// counted every PPA twice (2,064 contracts where there are ~1,341), and a baked
// copy goes stale the moment someone edits the sheet. The register is the
// single source now; see live.js hydrateContracts().
export const CONTRACTS = [];

// ---------------- Matters ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const MATTERS = [];

// ---------------- Clause Library ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const CLAUSES = [];

// ---------------- Templates ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const TEMPLATES = [];

// ---------------- Litigation ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const LITIGATION = [];

// ---------------- Compliance ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const COMPLIANCE = [];

// ---------------- Approvals ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const APPROVALS = [];

// ---------------- Reviews queue ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const REVIEWS = [];

// ---------------- Activity feed ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const ACTIVITY = [];

// ---------------- Notifications ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const NOTIFICATIONS = [];

// ---------------- Dashboard aggregates ----------------
/* RETIRED — the seeded dashboard constants.
 *
 * DASH held 1,284 active contracts, 37 pending reviews, an average turnaround
 * of "3.4 days", a compliance score of 84, an eleven-point turnaround trend
 * "down from 4.8 in January", a twelve-month contract-volume series, a
 * business-unit workload chart, a request funnel, a per-lawyer load table and a
 * six-month department heatmap. None of it was measured. It was written by hand
 * before Drive was connected, and it survived long enough to be quoted in a
 * narrative paragraph addressed to the General Counsel.
 *
 * Every figure it fed is now computed from live records (src/dashmetrics.js)
 * or reported as unmeasurable. The empty shape is kept, rather than the export
 * deleted, so an old cached module that still reaches for DASH.kpis gets an
 * empty object instead of a crash — and gets nothing to display, which is the
 * correct outcome.
 */
export const DASH = {
  kpis: {},
  riskDist: [], tatTrend: [], tatLabels: [],
  volumeTrend: [], buWorkload: [], requestFunnel: [], lawyerLoad: [],
  heatCols: [], heat: [],
};
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const AI_INSIGHTS = [];

// ============================================================
// ADDITIVE SPRINT — companies, work categories, licenses,
// contract spend, negotiation rounds, template versions.
// All appended; existing arrays above are untouched. Fictional.
// ============================================================

// ---------------- Feature 6: Work categories (single source of truth) ----------------
export const WORK_CATEGORIES = [
  "Litigation & Dispute",
  "Commercial Contracts",
  "Admin Contracts",
  "Compliance",
  "Intellectual Property",
  "Labour Matters",
  "Corporate & Governance",
  "Real Estate & Leasing",
];
export const CATEGORY_TONE = {
  "Litigation & Dispute": "red",
  "Commercial Contracts": "blue",
  "Admin Contracts": "indigo",
  "Compliance": "amber",
  "Intellectual Property": "purple",
  "Labour Matters": "green",
  "Corporate & Governance": "gray",
  "Real Estate & Leasing": "orange",
};
export function inferCategory(item = {}) {
  const s = ((item.type || "") + " " + (item.title || "")).toLowerCase();
  if (/litigation|dispute|grievance|infring|debt recovery|claim|arbitrat/.test(s)) return "Litigation & Dispute";
  if (/lease|tenanc|property|warehouse|real estate|\bland\b/.test(s)) return "Real Estate & Leasing";
  if (/employment|labour|labor|handbook|\bhr\b|non-compete|\bcto\b/.test(s)) return "Labour Matters";
  if (/trademark|\bip\b|patent|intellectual/.test(s)) return "Intellectual Property";
  if (/privacy|gdpr|pdpl|pdpa|\bdpa\b|compliance|policy|data process/.test(s)) return "Compliance";
  if (/board|resolution|governance|m&a|capital raise|power of attorney|audit/.test(s)) return "Corporate & Governance";
  if (/government|approval|municipal|permit|registration/.test(s)) return "Admin Contracts";
  return "Commercial Contracts";
}
export const categoryOf = (item) => (item && item.category) || inferCategory(item || {});

// ---------------- Feature 7: Company registry ----------------
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const COMPANIES = [];

// ---------------- Feature 1: Licenses & Registrations ----------------
// Auto validity is NEVER stored — derive from expiryDate at render time.
export function licenseStatus(lic, now = new Date()) {
  const days = Math.round((new Date(lic.expiryDate) - now) / 86400000);
  const lead = lic.renewalLeadDays == null ? 90 : lic.renewalLeadDays;
  if (days < 0) return { key: "Expired", label: "Expired", tone: "red", days };
  if (days <= 30) return { key: "Critical", label: "Critical", tone: "orange", days };
  if (days <= lead) return { key: "Expiring", label: "Expiring Soon", tone: "amber", days };
  return { key: "Valid", label: "Valid", tone: "green", days };
}

// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const LICENSES = [];

// ---------------- New seed records powering overlap detection (Feature 3) ----------------
// Removed 2026-09-13 with the rest of the fabricated demo content.
// Removed 2026-09-13 with the rest of the fabricated demo content.
// ---------------- Retro-tag + categorize all seed records ----------------
const RECORD_TAGS = {
  // requests
  "REQ-2041": ["CO-01"], "REQ-2040": ["CO-09"], "REQ-2039": ["CO-02"], "REQ-2038": ["CO-07"],
  "REQ-2036": ["CO-10"], "REQ-2035": ["CO-05"], "REQ-2033": ["CO-03"], "REQ-2032": ["CO-04"],
  "REQ-2031": ["CO-17"], "REQ-2030": ["CO-11"], "REQ-2029": ["CO-13"], "REQ-2028": ["CO-13"],
  // matters
  "MAT-508": ["CO-03"], "MAT-507": ["CO-02"], "MAT-506": ["CO-09"], "MAT-505": ["CO-04"],
  "MAT-504": ["CO-13"], "MAT-502": ["CO-05"], "MAT-499": ["CO-07"], "MAT-498": ["CO-13"],
  "MAT-497": ["CO-08"], "MAT-509": ["CO-12"],
  // contracts
  "CTR-1187": ["CO-01"], "CTR-1186": ["CO-02"], "CTR-1185": ["CO-03"], "CTR-1184": ["CO-04"],
  "CTR-1183": ["CO-05"], "CTR-1182": ["CO-07"], "CTR-1180": ["CO-11"], "CTR-1179": ["CO-06"],
  "CTR-1167": ["CO-08"],
  // reviews
  "RV-330": ["CO-02"], "RV-329": ["CO-03"], "RV-328": ["CO-05"], "RV-327": ["CO-04"],
  "RV-326": ["CO-10"], "RV-325": ["CO-07"], "RV-331": ["CO-12"], "RV-332": ["CO-12"],
  // litigation
  "LIT-24": ["CO-13"], "LIT-23": ["CO-08"], "LIT-22": ["CO-15"], "LIT-21": ["CO-14"], "LIT-20": ["CO-09"], "LIT-19": ["CO-17"],
};
const RECORD_CAT = {
  "REQ-2041": "Commercial Contracts", "REQ-2040": "Corporate & Governance", "REQ-2039": "Commercial Contracts",
  "REQ-2038": "Real Estate & Leasing", "REQ-2037": "Labour Matters", "REQ-2036": "Compliance",
  "REQ-2035": "Commercial Contracts", "REQ-2034": "Intellectual Property", "REQ-2033": "Commercial Contracts",
  "REQ-2032": "Commercial Contracts", "REQ-2031": "Corporate & Governance", "REQ-2030": "Commercial Contracts",
  "REQ-2029": "Labour Matters", "REQ-2028": "Admin Contracts",
  "MAT-508": "Commercial Contracts", "MAT-507": "Commercial Contracts", "MAT-506": "Corporate & Governance",
  "MAT-505": "Litigation & Dispute", "MAT-504": "Admin Contracts", "MAT-503": "Compliance",
  "MAT-502": "Commercial Contracts", "MAT-501": "Labour Matters", "MAT-500": "Intellectual Property",
  "MAT-499": "Real Estate & Leasing", "MAT-498": "Labour Matters", "MAT-497": "Litigation & Dispute", "MAT-509": "Real Estate & Leasing",
  "CTR-1187": "Commercial Contracts", "CTR-1186": "Commercial Contracts", "CTR-1185": "Commercial Contracts",
  "CTR-1184": "Commercial Contracts", "CTR-1183": "Commercial Contracts", "CTR-1182": "Real Estate & Leasing",
  "CTR-1181": "Commercial Contracts", "CTR-1180": "Commercial Contracts", "CTR-1179": "Real Estate & Leasing",
  "CTR-1178": "Corporate & Governance", "CTR-1177": "Commercial Contracts", "CTR-1176": "Commercial Contracts",
  "CTR-1175": "Commercial Contracts", "CTR-1174": "Commercial Contracts", "CTR-1173": "Commercial Contracts",
  "CTR-1172": "Commercial Contracts", "CTR-1171": "Commercial Contracts", "CTR-1170": "Commercial Contracts",
  "CTR-1169": "Corporate & Governance", "CTR-1168": "Labour Matters", "CTR-1167": "Commercial Contracts",
  "RV-330": "Commercial Contracts", "RV-329": "Commercial Contracts", "RV-328": "Commercial Contracts",
  "RV-327": "Commercial Contracts", "RV-326": "Compliance", "RV-325": "Real Estate & Leasing",
  "RV-331": "Real Estate & Leasing", "RV-332": "Commercial Contracts",
  "LIT-24": "Litigation & Dispute", "LIT-23": "Litigation & Dispute", "LIT-22": "Labour Matters",
  "LIT-21": "Intellectual Property", "LIT-20": "Litigation & Dispute", "LIT-19": "Compliance",
};
function applyMeta(arr) {
  arr.forEach((r) => {
    if (r.companyTags === undefined) r.companyTags = RECORD_TAGS[r.id] ? [...RECORD_TAGS[r.id]] : [];
    if (r.category === undefined) r.category = RECORD_CAT[r.id] || inferCategory(r);
  });
}
[REQUESTS, MATTERS, CONTRACTS, REVIEWS, LITIGATION].forEach(applyMeta);

// ---------------- Feature 2: Contract spend (utilization 10%–105%) ----------------
const SPEND = [
  { id: "CTR-1187", to: 1500000, committed: 200000 },
  { id: "CTR-1186", to: 620000, committed: 400000 },
  { id: "CTR-1185", to: 4800000, committed: 2000000 },
  { id: "CTR-1184", to: 1300000, committed: 500000 },
  { id: "CTR-1183", to: 1100000, committed: 600000 },
  { id: "CTR-1181", to: 1200000, committed: 100000 },
  { id: "CTR-1179", to: 7800000, committed: 500000 },
  { id: "CTR-1178", to: 615000, committed: 50000 },
  { id: "CTR-1177", to: 350000, committed: 0 },
  { id: "CTR-1176", to: 950000, committed: 150000 },
  { id: "CTR-1175", to: 5900000, committed: 400000 },
  { id: "CTR-1170", to: 1300000, committed: 200000 },
  { id: "CTR-1169", to: 405000, committed: 50000 },
  { id: "CTR-1168", to: 2100000, committed: 300000 },
  { id: "CTR-1167", to: 2950000, committed: 0 },
];
const SPEND_DESC = ["Onboarding & setup fee", "Q1 milestone invoice", "Q2 milestone invoice", "Professional services", "Monthly true-up", "Progress payment"];
SPEND.forEach((s, si) => {
  const c = CONTRACTS.find((x) => x.id === s.id);
  if (!c) return;
  const e1 = Math.round(s.to * 0.55), e2 = s.to - e1;
  c.spendToDate = s.to;
  c.committedSpend = s.committed;
  c.spendEntries = [
    { id: s.id + "-E1", date: d(-140), description: SPEND_DESC[si % SPEND_DESC.length], amount: e1, invoiceRef: "INV-" + s.id.slice(-4) + "-01", by: c.owner },
    { id: s.id + "-E2", date: d(-40), description: SPEND_DESC[(si + 2) % SPEND_DESC.length], amount: e2, invoiceRef: "INV-" + s.id.slice(-4) + "-02", by: c.owner },
  ];
});

// ---------------- Feature 4: Negotiation rounds ----------------
// Emptied 2026-09-13 with the rest of the fabricated demo content.
const ROUNDS_SEED = {};
Object.keys(ROUNDS_SEED).forEach((id) => {
  const c = CONTRACTS.find((x) => x.id === id);
  if (c) c.rounds = ROUNDS_SEED[id];
});

// Defaults so every contract carries the new fields (backward-compat for the UI)
CONTRACTS.forEach((c) => {
  if (c.spendEntries === undefined) { c.spendToDate = 0; c.committedSpend = 0; c.spendEntries = []; }
  if (c.rounds === undefined) c.rounds = [];
});

// ---------------- Feature 5: Template version control ----------------
const TPL_VERSIONS = {
  "T-01": [
    { version: "v4.1", date: d(-120), author: "u3", status: "Retired", changelog: "Added mutual carve-outs for residual knowledge.", body: "1. The Parties agree to keep Confidential Information secret.\n2. Confidentiality term: two (2) years from disclosure.\n3. Standard mutual carve-outs apply." },
    { version: "v4.2", date: d(-10), author: "u3", status: "Approved", changelog: "Aligned confidentiality term to 3 years; added PDPL cross-border wording.", body: "1. The Parties agree to keep Confidential Information secret.\n2. Confidentiality term: three (3) years from disclosure.\n3. Standard mutual carve-outs apply.\n4. Cross-border transfers comply with KSA PDPL safeguards." },
    { version: "v4.3", date: d(-3), author: "u5", status: "Draft", changelog: "Draft: add AI-tools confidentiality clause; awaiting GC review.", body: "1. The Parties agree to keep Confidential Information secret.\n2. Confidentiality term: three (3) years from disclosure.\n3. Standard mutual carve-outs apply.\n4. Cross-border transfers comply with KSA PDPL safeguards.\n5. Confidential Information must not be input into public AI tools." },
  ],
  "T-02": [
    { version: "v6.0", date: d(-210), author: "u3", status: "Retired", changelog: "Consolidated SOW references; standard 1× liability cap.", body: "1. Services provided per each executed SOW.\n2. Liability capped at 1× fees paid in the prior 12 months.\n3. Payment: Net 45 from valid invoice." },
    { version: "v6.1", date: d(-24), author: "u3", status: "Approved", changelog: "Updated liability cap clause to align with 2026 playbook; added ZATCA e-invoicing clause.", body: "1. Services provided per each executed SOW.\n2. Liability capped at 1× fees, with a 2× supercap for data-breach claims.\n3. Payment: Net 45 from valid invoice.\n4. KSA invoices issued via ZATCA-compliant e-invoicing (Fatoora)." },
  ],
  "T-03": [
    { version: "v2.4", date: d(-140), author: "u5", status: "Retired", changelog: "Clarified change-request process.", body: "1. Deliverables listed in Schedule A.\n2. Changes handled via written change request." },
    { version: "v3.0", date: d(-15), author: "u5", status: "Approved", changelog: "Added deliverable acceptance criteria and milestone invoicing.", body: "1. Deliverables listed in Schedule A.\n2. Changes handled via written change request.\n3. Acceptance within 10 business days against defined criteria.\n4. Invoicing tied to milestone acceptance." },
  ],
  "T-04": [
    { version: "v2.4", date: d(-160), author: "u12", status: "Retired", changelog: "Updated probation period wording.", body: "1. Governed by the Saudi Labor Law.\n2. Probation: ninety (90) days.\n3. End-of-service benefit per statutory formula." },
    { version: "v2.5", date: d(-20), author: "u12", status: "Approved", changelog: "Aligned to updated Saudi Labor Law; refined end-of-service benefit formula.", body: "1. Governed by the Saudi Labor Law (2025 amendments).\n2. Probation: ninety (90) days.\n3. End-of-service benefit: half-month per year for first 5 years, full-month thereafter." },
    { version: "v2.6", date: d(-2), author: "u12", status: "Draft", changelog: "Draft: add remote-work policy and WPS payroll clause.", body: "1. Governed by the Saudi Labor Law (2025 amendments).\n2. Probation: ninety (90) days.\n3. End-of-service benefit: half-month per year for first 5 years, full-month thereafter.\n4. Salary paid via WPS (Mudad); remote-work eligibility per policy." },
  ],
  "T-06": [
    { version: "v4.3", date: d(-90), author: "u7", status: "Retired", changelog: "Standardized payment terms to Net 45.", body: "1. Vendor supplies goods/services per PO.\n2. Payment: Net 45.\n3. Termination for convenience on 30 days' notice." },
    { version: "v5.0", date: d(-6), author: "u7", status: "Approved", changelog: "Added anti-bribery (FCPA/UKBA) and SLA service-credit schedule.", body: "1. Vendor supplies goods/services per PO.\n2. Payment: Net 45.\n3. Termination for convenience on 30 days' notice.\n4. Anti-bribery compliance (FCPA/UKBA) required.\n5. SLA breaches trigger service credits per Schedule B." },
  ],
  "T-08": [
    { version: "v3.0", date: d(-70), author: "u12", status: "Retired", changelog: "GDPR baseline.", body: "1. Processor acts only on documented instructions.\n2. Transfers rely on GDPR Standard Contractual Clauses." },
    { version: "v3.1", date: d(-4), author: "u12", status: "Approved", changelog: "Added SCC module 2 and PDPL data-residency annex.", body: "1. Processor acts only on documented instructions.\n2. Transfers rely on SCC Module 2 (controller-to-processor).\n3. KSA personal data residency per PDPL Annex." },
  ],
};
TEMPLATES.forEach((t) => {
  if (t.versions === undefined) {
    t.versions = TPL_VERSIONS[t.id] || [
      { version: "v" + t.version, date: t.updated, author: t.owner, status: "Approved", changelog: "Current approved version.", body: "1. Standard clauses assembled from the approved library.\n2. Jurisdiction language inserted automatically." },
    ];
  }
});

// ============================================================
// SPRINT 3 — "Show the machine, not just the meter"
//
// Everything below EXTENDS the arrays above (never forks them):
//   • the group entity portfolio (KSA / PK / UAE) + contract-type register
//   • legal sub-divisions + office locations (physical records)
//   • the TAT matrix (type × risk) and the lifecycle paths + stage meta
//     that the WorkflowSpine renders as its PROCESS zone
//   • ~29 authentic KSA/PK real-estate contracts with PPA / land values,
//     Sr No, physical record refs, drive links and extracted fields
//   • the document repository (OCR text + extraction) feeding the tracker
//   • the canonical LegalRequest shape shared with the external form
// All fictional; textured to read as corporate real-estate legal in KSA + PK.
// ============================================================

/* ---------------- FX (single conversion source of truth) ---------------- */
export const FX_TO_USD = { USD: 1, EUR: 1.08, GBP: 1.27, SAR: 0.2667, AED: 0.2723, PKR: 0.0036 };
export const toUsd = (v, c) => (v || 0) * (FX_TO_USD[c] == null ? 1 : FX_TO_USD[c]);

/* ---------------- Workstream C: legal sub-divisions ---------------- */
export const LEGAL_SUBDIVISIONS = [
  "Commercial",
  "Litigation & Disputes",
  "Compliance & Regulatory",
  "IP",
  "Labour/Employment",
  "Corporate & Governance",
  "Real Estate & Conveyancing",
  "Data Privacy",
];
export const SUBDIVISION_TONE = {
  "Commercial": "blue",
  "Litigation & Disputes": "red",
  "Compliance & Regulatory": "amber",
  "IP": "purple",
  "Labour/Employment": "green",
  "Corporate & Governance": "gray",
  "Real Estate & Conveyancing": "orange",
  "Data Privacy": "indigo",
};
// Category → owning sub-division (so old records infer one for free).
const CAT_SUBDIV = {
  "Litigation & Dispute": "Litigation & Disputes",
  "Commercial Contracts": "Commercial",
  "Admin Contracts": "Compliance & Regulatory",
  "Compliance": "Compliance & Regulatory",
  "Intellectual Property": "IP",
  "Labour Matters": "Labour/Employment",
  "Corporate & Governance": "Corporate & Governance",
  "Real Estate & Leasing": "Real Estate & Conveyancing",
};
export function inferSubdivision(item = {}) {
  if (item.subdivision) return item.subdivision;
  const s = ((item.contractType || "") + " " + (item.type || "") + " " + (item.title || "")).toLowerCase();
  if (/privacy|pdpl|gdpr|pdpa|\bdpa\b|data process/.test(s)) return "Data Privacy";
  if (/ppa|spa|lease|ejar|tenanc|musataha|usufruct|plot|land|off-plan|wafi|brokerage|conveyanc|deed|title/.test(s)) return "Real Estate & Conveyancing";
  return CAT_SUBDIV[categoryOf(item)] || "Commercial";
}
export const subdivisionOf = (item) => (item && item.subdivision) || inferSubdivision(item || {});

/* ---------------- Workstream C: type-of-contract register ---------------- */
// `code` is what records store in `contractType`; the register carries the
// jurisdictional flavour and which money fields are first-class for the type.
export const CONTRACT_TYPE_REGISTER = [
  { code: "PPA", name: "PPA — Property Purchase Agreement", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Real Estate & Conveyancing", ppa: true, land: true },
  { code: "SPA", name: "SPA — Sale & Purchase Agreement", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Corporate & Governance", ppa: true, land: false },
  { code: "Ejar Lease", name: "Lease — Ejar (KSA)", jurisdictions: ["KSA"], subdivision: "Real Estate & Conveyancing" },
  { code: "Tenancy", name: "Tenancy Agreement (PK)", jurisdictions: ["PK"], subdivision: "Real Estate & Conveyancing" },
  { code: "Musataha", name: "Musataha / Usufruct (KSA)", jurisdictions: ["KSA"], subdivision: "Real Estate & Conveyancing", land: true },
  { code: "Development / JV", name: "Development / JV / Co-development", jurisdictions: ["KSA", "PK"], subdivision: "Real Estate & Conveyancing", land: true },
  { code: "Brokerage & Agency", name: "Brokerage & Agency", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Real Estate & Conveyancing" },
  { code: "Off-plan / Wafi", name: "Off-plan / Wafi escrow (KSA)", jurisdictions: ["KSA"], subdivision: "Real Estate & Conveyancing", ppa: true },
  { code: "Construction", name: "Construction Contract", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "Land / Plot Purchase", name: "Land / Plot Purchase (PK)", jurisdictions: ["PK"], subdivision: "Real Estate & Conveyancing", ppa: true, land: true },
  { code: "Marketing & Listing", name: "Marketing & Listing", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "Vendor MSA", name: "Vendor / Procurement MSA", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "Employment", name: "Employment / Labour", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Labour/Employment" },
  { code: "NDA / MoU / LOI", name: "NDA / MoU / LOI", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "SLA", name: "SLA", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "License", name: "License (software / trademark)", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "IP" },
  // Sprint 4 — the marketplace / media types the requester portal offers.
  { code: "Listing & Subscription", name: "Listing & Subscription Agreement", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "Advertising & Media", name: "Advertising / Media", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "Partnership / Reseller", name: "Partnership / Reseller", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Commercial" },
  { code: "Creator / Influencer", name: "Creator / Influencer", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "IP" },
  { code: "Data Processing (DPA)", name: "Data Processing Agreement (DPA)", jurisdictions: ["KSA", "PK", "UAE"], subdivision: "Data Privacy" },
];
export const CONTRACT_TYPE_CODES = CONTRACT_TYPE_REGISTER.map((t) => t.code);
export const contractTypeMeta = (code) => CONTRACT_TYPE_REGISTER.find((t) => t.code === code) || null;
// Does this type carry a first-class PPA / land value?
export const typeHasPpa = (code) => !!(contractTypeMeta(code) || {}).ppa;
export const typeHasLand = (code) => !!(contractTypeMeta(code) || {}).land;

/* ---------------- Workstream D: physical record locations ---------------- */
// Emptied 2026-09-13: these named Riyadh/Jeddah/Dammam/Dubai vaults for a
// group whose real records are in Pakistan. Physical locations are a
// configuration the department should set, not something to invent.
export const OFFICE_LOCATIONS = [];

/* ---------------- Workstream C: group entity portfolio ---------------- */
// The real operating companies, seeded as jurisdiction-tagged entities under a
// Group Holding parent. Counterparties from the earlier sprint stay untouched.
// Removed 2026-09-13 with the rest of the fabricated demo content.
// Backfill the jurisdiction short-code + hierarchy fields on the earlier seeds.
const JUR_CODE = { "Saudi Arabia": "KSA", "Pakistan": "PK", "UAE": "UAE", "United Kingdom": "UK", "United States": "US", "Singapore": "SG" };
COMPANIES.forEach((c) => {
  if (c.jur === undefined) c.jur = JUR_CODE[c.jurisdiction] || "—";
  if (c.parentId === undefined) c.parentId = c.type === "Group Entity" ? "CO-19" : null;
  if (c.subdivisionOwner === undefined) c.subdivisionOwner = null;
});
export const GROUP_ENTITIES = COMPANIES.filter((c) => c.type === "Group Entity");
export const entityById = (id) => COMPANIES.find((c) => c.id === id) || null;
export const entityName = (id) => (entityById(id) || {}).name || "—";

/* ---------------- Workstream H: contract-request types ---------------- */
export const CONTRACT_REQUEST_TYPES = ["New", "Revision", "Extension", "Draft", "Termination", "Amendment", "Commercial"];

/* ---------------- North Star: lifecycle paths (the PROCESS spine) ---------------- */
// Each request type presets an ordered stage path. Risk tier deepens the
// review/approval segment at render time (see riskGatesFor below).
export const LIFECYCLE_PATHS = {
  /* The department's standard path. "Triage" keeps its KEY -- it is wired into
     tone maps, stage weights, aliases and the TAT fix -- and is DISPLAYED as
     "To be assigned" via STAGE_META.label. Renaming the key itself would have
     collided with the separate "Assigned" request status.

     "Triage" was never the business's word for this. A request sitting here is
     not being sorted by severity, it is waiting for an owner, and calling it
     triage made the requester's own status screen read like an emergency
     room. */
  New: ["Intake", "Triage", "Legal Review", "Internal Review", "External Review", "Drafting", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
  Revision: ["Intake", "Triage", "Legal Review", "Internal Review", "External Review", "Redlining", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
  Extension: ["Intake", "Triage", "Legal Review", "Drafting", "Approval", "Signature", "Executed", "Repository"],
  Draft: ["Intake", "Triage", "Drafting", "Legal Review", "Approval", "Repository"],
  Termination: ["Intake", "Triage", "Legal Review", "Notice Drafting", "Approval", "Notice Served", "Closed"],
  Amendment: ["Intake", "Triage", "Legal Review", "Internal Review", "External Review", "Drafting", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
  Commercial: ["Intake", "Triage", "Commercial Review", "Legal Review", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
};
export const lifecyclePathFor = (requestType) => LIFECYCLE_PATHS[requestType] || LIFECYCLE_PATHS.New;

// Per-stage: who holds the ball by default, entry/exit criteria, and the
// artifacts the stage produces (these become the OUTPUT zone's provenance).
export const STAGE_META = {
  "Intake": { icon: "inbox", ball: "business", role: "Requester", entry: "Request submitted with the mandatory fields", exit: "Mandatory fields complete and supporting documents attached", artifacts: ["Request form", "Attachments"] },
  "Triage": { label: "To be assigned", icon: "filter", ball: "legal", role: "Assigning counsel", entry: "Request landed in the department queue", exit: "Category, sub-division, owner and TAT fixed; duplicates checked", artifacts: ["Assignment note", "TAT assignment"] },
  "Commercial Review": { icon: "dollar", ball: "business", role: "Commercial owner", entry: "Triaged and routed as a commercial request", exit: "Commercial terms and budget confirmed by the business", artifacts: ["Commercial term sheet"] },
  "Legal Review": { icon: "eye", ball: "legal", role: "Reviewing counsel", entry: "Owner assigned and documents readable", exit: "Risk assessed, playbook deviations logged, position agreed", artifacts: ["Review memo", "Risk assessment"] },
  "Internal Review": { icon: "users", ball: "legal", role: "Reviewing counsel", entry: "Legal position drafted", exit: "Internal stakeholders have signed off on the position", artifacts: ["Internal review note"] },
  "External Review": { icon: "externalLink", ball: "counterparty", role: "External counsel / counterparty", entry: "Position cleared internally", exit: "External comments received and reconciled", artifacts: ["External comments"] },
  "Drafting": { icon: "edit", ball: "legal", role: "Drafter", entry: "Position agreed and template version selected", exit: "Draft generated from an approved template version", artifacts: ["Draft agreement"] },
  "Redlining": { icon: "gitbranch", ball: "legal", role: "Drafter", entry: "Counterparty paper or prior version received", exit: "Redlines applied and deviations flagged", artifacts: ["Redlined draft", "Deviation log"] },
  "Notice Drafting": { icon: "edit", ball: "legal", role: "Drafter", entry: "Termination grounds confirmed", exit: "Notice drafted against the contractual notice clause", artifacts: ["Termination notice"] },
  /* HIDDEN FROM THE LIVE WORKFLOW, KEPT IN THE HISTORY.
     These two stages are not steps this department works through on screen any
     more. They are NOT deleted: a record that genuinely passed through one
     still shows it on its Timeline, because removing something that happened
     is falsifying a history rather than simplifying a UI. `hidden` means "do
     not offer this as a step ahead"; anything already recorded against it
     renders exactly as it did. */
  "Negotiation": { hidden: true, icon: "gitbranch", ball: "counterparty", role: "Lead negotiator", entry: "Draft issued to the counterparty", exit: "All open positions closed or escalated", artifacts: ["Negotiation rounds", "Position paper"] },
  "Approval": { hidden: true, icon: "checksquare", ball: "legal", role: "Approver chain", entry: "Final form agreed; risk tier determines the chain", exit: "Every required approver has signed off", artifacts: ["Approval record"] },
  "Signature": { icon: "fileCheck", ball: "counterparty", role: "Signatories", entry: "Approvals complete", exit: "Both counterparts executed and dated", artifacts: ["Executed counterpart"] },
  "Notice Served": { icon: "send", ball: "legal", role: "Owner", entry: "Notice approved", exit: "Notice served and receipt evidenced", artifacts: ["Served notice", "Proof of service"] },
  "Executed": { icon: "check", ball: "legal", role: "Owner", entry: "Executed counterpart received", exit: "Key dates and obligations extracted", artifacts: ["Executed agreement", "Obligation set"] },
  "Repository": { icon: "database", ball: "legal", role: "Contract manager", entry: "Executed document available", exit: "Drive link saved, tracker row created, Sr No mapped to the physical record", artifacts: ["Repository record", "Drive link", "Tracker row", "Physical record ref"] },
  "Closed": { icon: "checkcircle", ball: "legal", role: "Owner", entry: "Outcome delivered", exit: "Matter closed and archived", artifacts: ["Closure note"] },
};
// What a stage is CALLED on screen. Keys stay stable for the logic; labels can
// be renamed without touching tone maps, weights or aliases.
export const stageDisplay = (name) => (STAGE_META[name] && STAGE_META[name].label) || name;
/* Is this a stage the live workflow should still offer as a step ahead? A
   hidden stage a record has ALREADY entered stays visible on that record --
   see buildStages in flow.js, which keeps any stage carrying a recorded
   event. */
export const stageHidden = (name) => !!(STAGE_META[name] && STAGE_META[name].hidden);
export const stageMeta = (name) => STAGE_META[name] || { icon: "circle", ball: "legal", role: "Owner", entry: "—", exit: "—", artifacts: [] };
export const BALL_LABEL = { legal: "Legal", business: "Business", counterparty: "Counterparty" };

// Workstream H: risk tier drives review depth + the approval chain.
export const RISK_GATES = {
  critical: { reviewers: ["Reviewing counsel", "Legal Director", "Deputy GC"], approvers: ["u3", "u1", "u1"], depth: "Full review — clause-by-clause against the playbook, GC sign-off mandatory." },
  high: { reviewers: ["Reviewing counsel", "Legal Director"], approvers: ["u3", "u1"], depth: "Deep review — all risk clauses plus a written deviation log." },
  medium: { reviewers: ["Reviewing counsel"], approvers: ["u3"], depth: "Standard review — playbook checklist and deviation flags." },
  low: { reviewers: ["Reviewing counsel"], approvers: ["u10"], depth: "Light-touch — template conformity check only." },
};
export const riskGatesFor = (risk) => RISK_GATES[(risk || "medium").toLowerCase()] || RISK_GATES.medium;

// Workstream H: Google-Drive-style per-user document access.
export const ACCESS_LEVELS = ["view", "comment", "edit"];
export const ACCESS_LABEL = { view: "Viewer", comment: "Commenter", edit: "Editor" };

/* ---------------- Workstream G: auto-fixed TAT matrix (working days) ---------------- */
// Never manually negotiated: on triage the engine reads type × risk from here.
// Keys are contract-type codes (or request types); `default` is the fallback.
export const TAT_MATRIX = {
  default: { critical: 3, high: 5, medium: 8, low: 12 },
  "PPA": { critical: 5, high: 8, medium: 12, low: 18 },
  "SPA": { critical: 5, high: 8, medium: 12, low: 18 },
  "Ejar Lease": { critical: 3, high: 5, medium: 8, low: 10 },
  "Tenancy": { critical: 3, high: 5, medium: 7, low: 10 },
  "Musataha": { critical: 6, high: 10, medium: 15, low: 20 },
  "Development / JV": { critical: 8, high: 12, medium: 18, low: 25 },
  "Brokerage & Agency": { critical: 2, high: 4, medium: 6, low: 8 },
  "Off-plan / Wafi": { critical: 5, high: 8, medium: 12, low: 15 },
  "Construction": { critical: 6, high: 10, medium: 14, low: 18 },
  "Land / Plot Purchase": { critical: 5, high: 8, medium: 12, low: 16 },
  "Marketing & Listing": { critical: 2, high: 3, medium: 5, low: 7 },
  "Vendor MSA": { critical: 4, high: 6, medium: 9, low: 12 },
  "Employment": { critical: 2, high: 3, medium: 5, low: 7 },
  "NDA / MoU / LOI": { critical: 1, high: 2, medium: 3, low: 4 },
  "SLA": { critical: 3, high: 5, medium: 7, low: 9 },
  "License": { critical: 3, high: 5, medium: 8, low: 10 },
  "Listing & Subscription": { critical: 2, high: 3, medium: 5, low: 7 },
  "Advertising & Media": { critical: 2, high: 3, medium: 5, low: 7 },
  "Partnership / Reseller": { critical: 4, high: 6, medium: 9, low: 12 },
  "Creator / Influencer": { critical: 2, high: 3, medium: 4, low: 6 },
  "Data Processing (DPA)": { critical: 3, high: 5, medium: 7, low: 10 },
};
// Request-type multipliers — a termination is tighter than a fresh negotiation.
export const TAT_REQUEST_FACTOR = { New: 1, Revision: 0.75, Extension: 0.6, Draft: 0.6, Termination: 0.75, Amendment: 0.75, Commercial: 1 };

/* ---------------- Workstream G: lifecycle reminder milestones ---------------- */
// Fired against expiry / renewal-notice windows; deduped by record + milestone.
export const REMINDER_MILESTONES = [
  { key: "notice-window", label: "Notice window closing", offsetDays: 0, basis: "notice", tone: "red", icon: "alertTriangle" },
  { key: "expiry-30", label: "Expires in 30 days", offsetDays: 30, basis: "expiry", tone: "red", icon: "alertTriangle" },
  { key: "expiry-60", label: "Expires in 60 days", offsetDays: 60, basis: "expiry", tone: "amber", icon: "clock" },
  { key: "expiry-90", label: "Expires in 90 days", offsetDays: 90, basis: "expiry", tone: "amber", icon: "calendar" },
];

/* ============================================================
   Workstream C/F: the KSA + PK real-estate contract book
   ============================================================ */
// (The demo KSA/PK contract block that used to be pushed here was retired
// with the rest of the demo register — the real one carries the PK records.)

/* ---------------- Deterministic normalization of every contract ----------------
   Fills the Sprint-3 fields on BOTH the new records and the earlier seeds so the
   tracker, filters and analyzer never see an undefined column. Sr No is
   sequenced against the physical record and is stable across reloads. */
const LEGACY_TYPE_MAP = {
  "SaaS / MSA": "Vendor MSA", "MSA": "Vendor MSA", "SaaS": "Vendor MSA", "Vendor": "Vendor MSA",
  "Consultancy": "Vendor MSA", "Framework": "Vendor MSA", "Supply": "Vendor MSA", "SOW": "Vendor MSA",
  "Insurance": "Vendor MSA", "Reseller": "Marketing & Listing", "Partnership": "Development / JV",
  "Lease": "Ejar Lease",
};
const LEGACY_ENTITY = { "Saudi Arabia": "CO-13", "UAE": "CO-14", "United Kingdom": "CO-15", "United States": "CO-16", "Singapore": "CO-17", "Pakistan": "CO-18" };
let _srNo = 1000;
CONTRACTS.forEach((c) => {
  if (c.contractType === undefined) c.contractType = LEGACY_TYPE_MAP[c.type] || "Vendor MSA";
  if (c.type === undefined) c.type = c.contractType;
  if (c.jur === undefined) c.jur = JUR_CODE[c.jurisdiction] || "—";
  if (c.entityId === undefined) c.entityId = LEGACY_ENTITY[c.jurisdiction] || "CO-19";
  if (c.dept === undefined) c.dept = "Legal";
  if (c.requestType === undefined) c.requestType = "New";
  if (c.subdivision === undefined) c.subdivision = inferSubdivision(c);
  if (c.category === undefined) c.category = inferCategory(c);
  if (c.companyTags === undefined) c.companyTags = [];
  if (c.spendEntries === undefined) { c.spendToDate = 0; c.committedSpend = 0; c.spendEntries = []; }
  if (c.rounds === undefined) c.rounds = [];
  // Money fields are first-class only where the type register says so.
  if (c.ppaValue === undefined) c.ppaValue = typeHasPpa(c.contractType) ? c.value || 0 : null;
  if (c.landValue === undefined) c.landValue = null;
  if (c.landRef === undefined) c.landRef = null;
  if (c.renewalNoticeDays === undefined) c.renewalNoticeDays = c.autoRenew ? 60 : 30;
  // Operational / physical-record fields (Workstream D).
  _srNo += 1;
  if (c.srNo === undefined) c.srNo = _srNo;
  if (c.physicalRecordRef === undefined) c.physicalRecordRef = "PR-" + String(c.srNo);
  if (c.officeLocation === undefined) c.officeLocation = OFFICE_LOCATIONS[c.srNo % OFFICE_LOCATIONS.length];
  if (c.storagePath === undefined) c.storagePath = `/legal/${c.jur}/${String(c.contractType).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}/${c.id}.pdf`;
  // `// Google Drive seam` — a real integration swaps this for the Drive file URL.
  if (c.driveLink === undefined) c.driveLink = `https://drive.google.com/file/d/legalos-${c.id.toLowerCase()}/view`;
  if (c.extractionConfidence === undefined) c.extractionConfidence = 0.9;
  if (c.parentContractId === undefined) c.parentContractId = null;
  if (c.access === undefined) {
    const g = riskGatesFor(c.risk);
    c.access = [
      { userId: c.owner, level: "edit" },
      { userId: g.approvers[g.approvers.length - 1], level: "comment" },
      { userId: "u10", level: "view" },
    ];
  }
  if (c.extractedFields === undefined) {
    c.extractedFields = {
      parties: `${entityName(c.entityId)} · ${c.counterparty}`,
      governingLaw: c.jur === "KSA" ? "Laws of the Kingdom of Saudi Arabia" : c.jur === "PK" ? "Laws of Pakistan" : c.jur === "UAE" ? "Laws of the UAE (Dubai Courts)" : c.jurisdiction,
      startDate: c.start,
      endDate: c.expiry,
      renewalNotice: c.renewalNoticeDays ? `${c.renewalNoticeDays} days` : "—",
      totalValue: c.value,
      ppaValue: c.ppaValue,
      landValue: c.landValue,
      landRef: c.landRef,
      keyClauses: c.jur === "KSA"
        ? ["Governing law — KSA", "Ejar / REGA registration", "Termination for convenience", "Force majeure"]
        : c.jur === "PK"
          ? ["Governing law — Pakistan", "Stamp duty & mutation", "Possession & handover", "Dispute resolution — arbitration"]
          : ["Governing law", "Termination", "Liability cap", "Confidentiality"],
      obligations: [],
    };
  }
});

/* ---------------- Obligations extracted at the Executed stage (OUTPUT zone) ---------------- */
const OBLIGATION_SEED = {
  "CTR-2003": [{ text: "Serve renewal / non-renewal notice on the landlord", dueDays: -2, owner: "u10", basis: "Clause 4.2 — 60 days' notice" }, { text: "Re-register the Ejar contract on renewal", dueDays: 58, owner: "u10", basis: "Ejar mandate" }],
  "CTR-2004": [{ text: "Confirm rent escalation cap before auto-renewal", dueDays: 5, owner: "u10", basis: "Clause 5.1 — 5% cap" }],
  "CTR-2006": [{ text: "Verify Wafi escrow release conditions per milestone", dueDays: 14, owner: "u10", basis: "Escrow agreement §3" }],
  "CTR-2009": [{ text: "Collect performance bond renewal from contractor", dueDays: 21, owner: "u10", basis: "Clause 12 — 10% bond" }, { text: "Issue practical completion certificate", dueDays: 110, owner: "u10", basis: "Clause 18" }],
  "CTR-2017": [{ text: "Serve Ejari renewal notice (90 days)", dueDays: -6, owner: "u20", basis: "Clause 3.3" }],
  "CTR-2021": [{ text: "Pay e-Stamp duty on the renewed tenancy", dueDays: 9, owner: "u7", basis: "PLRA e-Stamp rules" }],
  "CTR-2019": [{ text: "Complete DHA transfer & mutation in the revenue record", dueDays: 40, owner: "u7", basis: "Clause 7 — transfer" }],
  "CTR-2025": [{ text: "Register the JV with SECP and file Form-A", dueDays: 30, owner: "u20", basis: "SECP filing" }],
};
Object.keys(OBLIGATION_SEED).forEach((id) => {
  const c = CONTRACTS.find((x) => x.id === id);
  if (!c) return;
  c.extractedFields.obligations = OBLIGATION_SEED[id].map((o, i) => ({
    id: `${id}-OB${i + 1}`, text: o.text, due: d(o.dueDays), owner: o.owner, basis: o.basis,
    status: o.dueDays < 0 ? "Overdue" : "Open",
  }));
});

/* ============================================================
   Workstream D: the document repository (intake → OCR → extraction)
   `ocrText` is the deterministic stand-in for a real OCR pass — the seam is
   marked in pages/repository.js. Every record links the three destinations:
   drive file · tracker row · physical record.
   ============================================================ */
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const REPOSITORY = [];
// Every repository doc carries the same operational contract as a tracker row.
REPOSITORY.forEach((r) => {
  if (r.extractedFields === undefined) r.extractedFields = extractFromOcr(r.ocrText, r);
  if (r.access === undefined) r.access = [{ userId: r.uploadedBy, level: "edit" }, { userId: "u1", level: "comment" }, { userId: "u10", level: "view" }];
});

/* ---------------- Workstream E: deterministic extraction over OCR text ----------------
   `// OCR provider seam` and `// extraction model seam` are marked in
   pages/repository.js — this parser is the prototype stand-in and is
   intentionally deterministic so the demo is stable. */
export function extractFromOcr(text = "", ctx = {}) {
  const t = String(text || "");
  const money = (label) => {
    const re = new RegExp(label + "[^0-9]{0,40}(SAR|PKR|AED|USD)\\s*([0-9,]+)", "i");
    const m = t.match(re);
    return m ? { currency: m[1], amount: Number(m[2].replace(/,/g, "")) } : null;
  };
  const firstMoney = () => {
    const m = t.match(/(SAR|PKR|AED|USD)\s*([0-9,]{4,})/);
    return m ? { currency: m[1], amount: Number(m[2].replace(/,/g, "")) } : null;
  };
  const grab = (re) => { const m = t.match(re); return m ? m[1].trim() : null; };
  const land = money("land (?:component|value)(?: is)?") || money("valued at");
  const total = money("(?:total (?:purchase )?(?:sale )?consideration|purchase price|consideration|total project value|annual rent|additional works value|proceeds)") || firstMoney();
  // Party names run until the first sentence break — the class deliberately
  // excludes `.` and `,` so "DHA LAHORE. Purchaser:" doesn't bleed into one name.
  const party = (roles) => grab(new RegExp("(?:" + roles + ")\\s*[:.]?\\s*([A-Z][A-Z0-9&\\-'() ]{2,60})"));
  const parties = [
    party("Seller|Lessor|Landlord|Grantor|Developer"),
    party("Purchaser|Buyer|Lessee|Tenant|Musataha Holder|Allottee"),
  ].filter(Boolean).map((s) => s.replace(/\s+(?:AND|BETWEEN)$/i, "").trim());
  return {
    parties: parties.length ? parties.join(" · ") : (ctx.entityId ? `${entityName(ctx.entityId)} · counterparty` : "—"),
    governingLaw: grab(/[Gg]overning law\s*[:.]?\s*(?:the )?([^.;]{4,80})/) || (ctx.jur === "KSA" ? "Laws of the Kingdom of Saudi Arabia" : ctx.jur === "PK" ? "Laws of Pakistan" : ctx.jur === "UAE" ? "Laws of the UAE (Dubai Courts)" : "—"),
    term: grab(/[Tt]erm\s*[:.]?\s*([^.;]{3,60})/),
    noticePeriod: grab(/[Nn]otice(?: period| of renewal[^:]*)?\s*[:.]?\s*([^.;]{3,60})/),
    registration: grab(/((?:EJAR|EJ-|PLRA-|DLD|Ejari|BTK-|WF-KSA-|REGA-)[A-Z0-9\-/]{3,30})/),
    titleRef: grab(/(?:Title Deed(?: No\.?)?|Mutation(?: No\.?)?|Deed)\s*[:.]?\s*([0-9]{4,}[0-9/\-]*)/),
    totalValue: total ? total.amount : null,
    currency: total ? total.currency : (ctx.jur === "KSA" ? "SAR" : ctx.jur === "PK" ? "PKR" : ctx.jur === "UAE" ? "AED" : "USD"),
    landValue: land ? land.amount : null,
    ppaValue: total && typeHasPpa(ctx.contractType) ? total.amount : null,
    keyClauses: (t.match(/(?:Termination[^.;]{0,70}|Force majeure[^.;]{0,70}|Stamp duty[^.;]{0,70}|Possession[^.;]{0,70}|Escrow[^.;]{0,70}|Performance bond[^.;]{0,70}|Revenue share[^.;]{0,70}|Notice of renewal[^.;]{0,70}|Transfer fee[^.;]{0,70}|Registered on[^.;]{0,70}|Renewal application[^.;]{0,70}|Grantor consent[^.;]{0,70}|Releases are tied[^.;]{0,70})/gi) || []).slice(0, 5).map((s) => s.trim()),
    flags: /poor|low confidence|require manual/i.test(t) ? ["Scan quality — values need manual confirmation"] : [],
  };
}

/* ---------------- Workstream E: additional licenses for the new entities ---------------- */
// Removed 2026-09-13 with the rest of the fabricated demo content.
// Re-point the earlier KSA/PK/UAE licenses at the real operating entities so the
// entity drill-down and the analyzer's licence rollup are populated.
// Emptied 2026-09-13: tagging for licences that no longer exist.
const LICENSE_RETAG = {};
LICENSES.forEach((l) => {
  const rt = LICENSE_RETAG[l.id];
  if (rt) { l.entity = rt.entity; l.companyTags = rt.companyTags; }
  if (l.entityId === undefined) l.entityId = (l.companyTags || [])[0] || null;
  if (l.subdivision === undefined) l.subdivision = "Compliance & Regulatory";
});

/* ============================================================
   Workstream A + J: the canonical LegalRequest shape
   ONE schema, used by the internal Legal Workspace and by the external
   requester-facing form. store.js#submitLegalRequest is the only writer.
   ============================================================ */
export const LEGAL_REQUEST_SCHEMA = {
  id: "string — REQ-nnnn, assigned by submitLegalRequest()",
  requestType: `enum — ${CONTRACT_REQUEST_TYPES.join(" | ")}`,
  contractType: "enum — CONTRACT_TYPE_CODES (optional for advice-only requests)",
  category: "enum — WORK_CATEGORIES",
  subdivision: "enum — LEGAL_SUBDIVISIONS (auto-inferred when omitted)",
  entityId: "string — COMPANIES id of the group entity the request belongs to",
  companyTags: "string[] — COMPANIES ids (counterparties, entities)",
  department: "enum — DEPARTMENTS (requesting department)",
  unit: "enum — BUSINESS_UNITS",
  requestDate: "ISO date — when the requester submitted",
  dueDate: "ISO date — business need-by date (informational; TAT is authoritative)",
  tat: "{ days, dueAt, fixedAt, basis } — auto-fixed at triage from TAT_MATRIX",
  requesterId: "string — USERS id of the requestee/requester",
  owner: "string — USERS id of the accountable legal owner (set at triage)",
  description: "string — free text from the requester",
  attachments: "[{ id, name, sizeKb, kind }] — files carried into Intake",
  linkedContractId: "string|null — parent contract for Amendment/Revision/Extension/Termination",
  riskPreliminary: "enum — low | medium | high | critical (requester's view; legal re-scores)",
  stage: "string — current lifecycle stage (LIFECYCLE_PATHS[requestType])",
  stageLog: "[{ stage, enteredAt, exitedAt, owner, ballWith }] — the PROCESS spine",
  status: "string — board column / lifecycle status",
  matterId: "string|null — the matter face of the same record once triaged",
  source: "enum — internal | portal (portal = external request form)",
};

/* ============================================================
   SPRINT 4 — the Requester Portal's form configuration.

   The portal reads its ENTIRE structure from here (via the `formConfig` store
   slice), so legal can change the live form from Settings → Request Form with
   no code change: which natures of matter are open, which entities appear,
   which contract types each entity offers, the required-document checklists,
   routing/TAT defaults and the portal branding.
   ============================================================ */

// Step 1 — Nature of Matter. Only `fullFlow` natures walk the whole wizard;
// the others still create a routed-manually record so nothing is lost.
export const NATURE_OPTIONS = [
  { key: "Contracts", label: "Contracts", icon: "file", enabled: true, fullFlow: true, blurb: "New paper, amendments, renewals and terminations." },
  { key: "Advice", label: "Advice", icon: "help", enabled: true, fullFlow: false, blurb: "A legal question or an opinion you need in writing." },
  { key: "Compliance", label: "Compliance", icon: "shield", enabled: true, fullFlow: false, blurb: "Regulatory, licensing and policy questions." },
  { key: "Disputes & Litigation", label: "Disputes & Litigation", icon: "scale", enabled: true, fullFlow: false, blurb: "Claims, demands and anything heading to court." },
  { key: "Labour Matters", label: "Labour Matters", icon: "users", enabled: true, fullFlow: false, blurb: "Employment, disciplinary and end-of-service matters." },
  { key: "Intellectual Property", label: "Intellectual Property", icon: "star", enabled: true, fullFlow: false, blurb: "Trademarks, brand use and content rights." },
];

// Step 2 — the entity the request is raised for. `entityId` ties the portal
// option back to the COMPANIES registry so the record lands on the right books.
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const PORTAL_COMPANIES = [];

// Step 3 — the editable matrix. Values are CANONICAL contract-type codes, so a
// portal submission flows straight into the tracker, filters, TAT matrix and
// analyzer without translation.
export const COMPANY_CONTRACT_TYPES = {
  "ZD": ["Listing & Subscription", "Brokerage & Agency", "Marketing & Listing", "Vendor MSA", "SLA", "NDA / MoU / LOI", "Employment", "Data Processing (DPA)"],
  "BAYUT-KSA": ["Listing & Subscription", "Brokerage & Agency", "Marketing & Listing", "Vendor MSA", "SLA", "NDA / MoU / LOI", "Employment", "Data Processing (DPA)"],
  "DUBIZZLE-KSA": ["Listing & Subscription", "Brokerage & Agency", "Marketing & Listing", "Vendor MSA", "SLA", "NDA / MoU / LOI", "Employment", "Data Processing (DPA)"],
  "OLX": ["Advertising & Media", "Vendor MSA", "Partnership / Reseller", "NDA / MoU / LOI", "SLA", "Employment"],
  "ZM": ["Advertising & Media", "Marketing & Listing", "Creator / Influencer", "Vendor MSA", "License", "NDA / MoU / LOI"],
  "ZPD": ["PPA", "SPA", "Land / Plot Purchase", "Musataha", "Construction", "Development / JV", "Off-plan / Wafi", "Ejar Lease", "Brokerage & Agency"],
};

// Step 5 → the missing-document checklist legal works from.
export const REQUIRED_DOC_TEMPLATES = {
  "PPA": ["Title deed copy", "Valuation report", "Board resolution approving the purchase", "Counterparty CR / trade licence"],
  "SPA": ["Share register extract", "Board resolution", "Latest audited accounts"],
  "Land / Plot Purchase": ["Allotment letter", "Mutation / revenue record extract", "NOC from the development authority", "Seller CNIC / CR"],
  "Musataha": ["Grantor title deed", "Site plan", "Board resolution"],
  "Off-plan / Wafi": ["REGA off-plan sales permit", "Escrow account confirmation", "Project completion certificate"],
  "Construction": ["Scope of works / BOQ", "Contractor CR + classification certificate", "Performance bond draft"],
  "Development / JV": ["Term sheet", "Land title / ownership proof", "Feasibility study"],
  "Ejar Lease": ["Ejar draft contract", "Landlord title deed", "Municipal (Balady) licence"],
  "Brokerage & Agency": ["Counterparty CR", "Commission schedule"],
  "Listing & Subscription": ["Signed order form / rate card", "Counterparty CR"],
  "Marketing & Listing": ["Campaign brief", "Media plan & budget approval"],
  "Advertising & Media": ["Campaign brief", "Media plan & budget approval"],
  "Creator / Influencer": ["Content brief", "Rate card", "Rights & usage note"],
  "Partnership / Reseller": ["Term sheet", "Counterparty CR", "Territory & exclusivity note"],
  "Vendor MSA": ["Vendor quotation", "Procurement approval", "Vendor CR"],
  "SLA": ["Service description", "Agreed service levels"],
  "Employment": ["Signed offer letter", "Candidate CV", "Salary band approval"],
  "NDA / MoU / LOI": ["Counterparty details", "Purpose note"],
  "License": ["Trademark / IP certificate", "Scope of licence note"],
  "Data Processing (DPA)": ["Data-flow description", "Sub-processor list", "Security questionnaire"],
  default: ["Supporting documentation"],
};

// Routing & TAT defaults per nature — feeds the internal TAT engine and triage.
export const PORTAL_ROUTING = {
  "Contracts": { subdivision: null, owner: null, note: "Routed by contract type — sub-division and owner are derived." },
  "Advice": { subdivision: "Commercial", owner: "u5", tatDays: 3, note: "Commercial desk answers advice requests." },
  // Owners are CREDENTIAL-bench members on the team that owns the sub-division
  // (labour + IP roll up to Litigation & Disputes) — never someone who isn't a
  // signable view in the system.
  "Compliance": { subdivision: "Compliance & Regulatory", owner: "u20", tatDays: 5, note: "Arsalan Sandhu — Team Lead · Compliance." },
  "Disputes & Litigation": { subdivision: "Litigation & Disputes", owner: "u6", tatDays: 2, note: "Salman Rashid — Team Lead · Litigation." },
  "Labour Matters": { subdivision: "Labour/Employment", owner: "u6", tatDays: 3, note: "Salman Rashid — Team Lead · Litigation (labour matters)." },
  "Intellectual Property": { subdivision: "IP", owner: "u6", tatDays: 5, note: "Salman Rashid — Team Lead · Litigation (IP desk)." },
};

// Fields the wizard marks mandatory, per nature.
export const REQUIRED_FIELDS = {
  "Contracts": ["title", "company", "contractType", "requestType", "description"],
  default: ["title", "description"],
};

export const FORM_CONFIG = {
  version: 1,
  branding: {
    name: "Zameen Legal Requests",
    tagline: "Raise a legal request and follow it end to end.",
    logoText: "NW",
    themeDefault: "light",
    published: true,
  },
  natures: NATURE_OPTIONS.map((n) => ({ ...n })),
  companies: PORTAL_COMPANIES.map((c) => ({ ...c })),
  companyContractTypes: JSON.parse(JSON.stringify(COMPANY_CONTRACT_TYPES)),
  requestTypes: [...CONTRACT_REQUEST_TYPES.filter((t) => t !== "Commercial")],
  requiredFields: JSON.parse(JSON.stringify(REQUIRED_FIELDS)),
  requiredDocTemplates: JSON.parse(JSON.stringify(REQUIRED_DOC_TEMPLATES)),
  routing: JSON.parse(JSON.stringify(PORTAL_ROUTING)),
};

// The portal's source-of-request options (auto-captured at login: which site /
// company / department the request is being raised from).
// Emptied 2026-09-13: invented Gulf offices (Riyadh, Jeddah, Dubai) for a
// group whose operations are in Pakistan. The portal learns a source when a
// real requester uses it.
export const PORTAL_SOURCES = [];;

/* ---------------- Sprint 4: seed requesters + a demo portal thread ---------------- */
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const REQUESTERS = [];

// A live two-way thread on the delayed JV revision, so the bridge demos on load.
// Emptied 2026-09-13: this was fabricated demo content. The modules now
// read real records from the Drive registers (see api/registers.js), and a
// module with no Drive source shows an honest empty state rather than
// invented data.
export const MESSAGES = [];

/* ---------------- Retro-fit the canonical shape onto the existing requests ---------------- */
// Request→matter identity: the same record wearing two faces (Workstream A).
const REQ_MATTER_LINK = {
  "REQ-2033": "MAT-508", "REQ-2039": "MAT-507", "REQ-2040": "MAT-506", "REQ-2032": "MAT-505",
  "REQ-2028": "MAT-504", "REQ-2036": "MAT-503", "REQ-2035": "MAT-502", "REQ-2037": "MAT-501",
  "REQ-2034": "MAT-500", "REQ-2038": "MAT-499", "REQ-2029": "MAT-498",
};
const REQ_TYPE_MAP = {
  "Contract Renewal": "Extension", "Contract Amendment": "Amendment", "NDA": "New",
  "Vendor Agreement": "New", "Employment Contract": "New", "Lease Agreement": "New",
  "Partnership Agreement": "Commercial", "Board Resolution": "Draft", "Policy Review": "Draft",
  "Government Approval": "New", "Trademark": "New", "Data Privacy Review": "Revision",
  "Procurement Review": "Commercial", "Legal Advice": "Draft", "Legal Opinion": "Draft",
};
const REQ_CONTRACT_TYPE = {
  "REQ-2041": "Vendor MSA", "REQ-2040": "NDA / MoU / LOI", "REQ-2039": "Vendor MSA",
  "REQ-2038": "Ejar Lease", "REQ-2037": "Employment", "REQ-2036": "Vendor MSA",
  "REQ-2035": "Vendor MSA", "REQ-2034": "License", "REQ-2033": "Development / JV",
  "REQ-2032": "Marketing & Listing", "REQ-2031": null, "REQ-2030": "Vendor MSA",
  "REQ-2029": "Employment", "REQ-2028": null,
};
const REQ_ENTITY = {
  "Saudi Arabia": "CO-22", "Pakistan": "CO-20", "UAE": "CO-23",
  "United Kingdom": "CO-15", "United States": "CO-16", "Singapore": "CO-17",
};
// Work category → the requester-facing Nature of Matter (Sprint 4 Step 1).
const NATURE_FOR_CATEGORY = {
  "Litigation & Dispute": "Disputes & Litigation",
  "Commercial Contracts": "Contracts",
  "Admin Contracts": "Compliance",
  "Compliance": "Compliance",
  "Intellectual Property": "Intellectual Property",
  "Labour Matters": "Labour Matters",
  "Corporate & Governance": "Contracts",
  "Real Estate & Leasing": "Contracts",
};

// New KSA/PK legal requests — including a live, visibly-delayed set so the
// TAT Status column demonstrates Delayed (+days, +blocking stage) on load.
// Removed 2026-09-13 with the rest of the fabricated demo content.
REQUESTS.forEach((r) => {
  if (r.requestType === undefined) r.requestType = REQ_TYPE_MAP[r.type] || "New";
  if (r.contractType === undefined) r.contractType = REQ_CONTRACT_TYPE[r.id] !== undefined ? REQ_CONTRACT_TYPE[r.id] : null;
  if (r.requestDate === undefined) r.requestDate = r.created;
  if (r.dueDate === undefined) r.dueDate = r.due;
  if (r.requesterId === undefined) r.requesterId = r.requester;
  if (r.riskPreliminary === undefined) r.riskPreliminary = r.risk;
  if (r.unit === undefined) r.unit = r.bu;
  if (r.department === undefined) r.department = r.dept;
  if (r.entityId === undefined) r.entityId = REQ_ENTITY[r.country] || "CO-19";
  if (r.subdivision === undefined) r.subdivision = inferSubdivision(r);
  if (r.description === undefined) r.description = r.aiSummary || "";
  if (r.attachments === undefined) r.attachments = [];
  if (r.linkedContractId === undefined) r.linkedContractId = null;
  if (r.matterId === undefined) r.matterId = REQ_MATTER_LINK[r.id] || null;
  if (r.source === undefined) r.source = "internal";
  /* ---- Sprint 4: the portal-facing fields ---- */
  // `channel` is HOW it arrived (internal | portal); `source` on a portal
  // request is WHERE FROM (site / office), auto-captured at login.
  if (r.channel === undefined) r.channel = r.source === "portal" ? "portal" : "internal";
  if (r.natureOfMatter === undefined) r.natureOfMatter = NATURE_FOR_CATEGORY[categoryOf(r)] || "Contracts";
  if (r.company === undefined) {
    const pc = PORTAL_COMPANIES.find((c) => c.entityId === r.entityId);
    r.company = pc ? pc.key : null;
  }
  if (r.requesterEmail === undefined) r.requesterEmail = (byId(r.requesterId || r.requester) || {}).email || null;
  if (r.requiredDocs === undefined) r.requiredDocs = [];
  if (r.messagesCount === undefined) r.messagesCount = MESSAGES.filter((m) => m.requestId === r.id).length;
  if (r.stage === undefined) {
    // Board status → the equivalent lifecycle stage on this record's path.
    const path = lifecyclePathFor(r.requestType);
    const map = { "New": "Intake", "Triage": "Triage", "In Review": "Legal Review", "Drafting": "Drafting", "Negotiation": "Negotiation", "Pending Approval": "Approval", "Approved": path[path.length - 1] };
    const want = map[r.status] || "Triage";
    r.stage = path.includes(want) ? want : path[Math.min(1, path.length - 1)];
  }
});
// Sprint 4 — seed the missing-document flow on the two delayed records, so the
// requester sees an outstanding ask and legal sees the checklist on load.
// Emptied 2026-09-13: document checklists attached to demo requests.
const REQUIRED_DOC_SEED = {};;
Object.keys(REQUIRED_DOC_SEED).forEach((id) => {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r) return;
  r.requiredDocs = REQUIRED_DOC_SEED[id].map((doc, i) => ({ id: `${id}-RD${i + 1}`, docId: null, ...doc }));
});
// Requests that arrived through the portal carry their origin: which site the
// requester raised it from. The portal has been live for a while, so most recent
// work came through it while the older records predate it and still read
// "internal" — that mix is what makes the adoption figure honest.
// Emptied 2026-09-13: portal-adoption figures derived from demo requests.
// A real adoption number needs real traffic.
const PORTAL_ORIGIN = {};;
Object.keys(PORTAL_ORIGIN).forEach((id) => {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r) return;
  r.channel = "portal";
  r.source = PORTAL_ORIGIN[id].source;
  r.requesterEmail = (byId(PORTAL_ORIGIN[id].requesterId) || {}).email || null;
});

// The matter face carries the request id back (Workstream A: one identity).
const MATTER_REQ_LINK = {};
Object.keys(REQ_MATTER_LINK).forEach((rq) => { MATTER_REQ_LINK[REQ_MATTER_LINK[rq]] = rq; });
MATTERS.forEach((m) => {
  if (m.requestId === undefined) m.requestId = MATTER_REQ_LINK[m.id] || null;
  if (m.subdivision === undefined) m.subdivision = inferSubdivision(m);
  if (m.entityId === undefined) m.entityId = (m.companyTags || []).find((t) => (entityById(t) || {}).type === "Group Entity") || "CO-19";
  if (m.unit === undefined) m.unit = m.bu;
  if (m.department === undefined) m.department = "Legal";
  if (m.requestType === undefined) {
    const rq = REQUESTS.find((x) => x.id === m.requestId);
    m.requestType = rq ? rq.requestType : "New";
  }
  if (m.contractType === undefined) {
    const rq = REQUESTS.find((x) => x.id === m.requestId);
    m.contractType = rq ? rq.contractType : null;
  }
  if (m.stage === undefined) {
    const path = lifecyclePathFor(m.requestType);
    const map = { "Open": "Triage", "Intake": "Intake", "Legal Review": "Legal Review", "In Review": "Legal Review", "Drafting": "Drafting", "In Negotiation": "Negotiation", "Negotiation": "Negotiation", "Pending Approval": "Approval", "Escalated": "Legal Review", "Completed": path[path.length - 1] };
    const want = map[m.status] || "Triage";
    m.stage = path.includes(want) ? want : path[1];
  }
});

// Reviews / litigation get a sub-division so the FilterBar covers them too.
[REVIEWS, LITIGATION].forEach((arr) => arr.forEach((r) => {
  if (r.subdivision === undefined) r.subdivision = inferSubdivision(r);
  if (r.companyTags === undefined) r.companyTags = [];
}));
// Compliance rows are area-based, not type-based — map the area text directly.
COMPLIANCE.forEach((r) => {
  if (r.companyTags === undefined) r.companyTags = [];
  if (r.subdivision === undefined) {
    const a = (r.area || "").toLowerCase();
    r.subdivision = /data protection|privacy/.test(a) ? "Data Privacy"
      : /labor|labour|employment/.test(a) ? "Labour/Employment"
      : /governance|board/.test(a) ? "Corporate & Governance"
      : /competition|antitrust|export|sanction/.test(a) ? "Litigation & Disputes"
      : "Compliance & Regulatory";
  }
});
