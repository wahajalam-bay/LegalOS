// ============================================================
// LegalOS — Seed data (realistic enterprise legal operations)
// Fictional multinational: "Northwind Global Holdings"
// ============================================================

const now = new Date();
function d(offsetDays) {
  const x = new Date(now);
  x.setDate(x.getDate() + offsetDays);
  return x.toISOString();
}

export const COMPANY = {
  name: "Northwind Global Holdings",
  short: "NW",
  entities: ["Northwind KSA", "Northwind UAE", "Northwind UK", "Northwind US", "Northwind Singapore", "Northwind Pakistan"],
};

export const BUSINESS_UNITS = ["Real Estate", "Technology", "Retail", "Logistics", "Energy", "Financial Services"];
export const DEPARTMENTS = ["Procurement", "Human Resources", "Sales", "Marketing", "Finance", "IT", "Operations", "Legal"];
export const COUNTRIES = ["Saudi Arabia", "UAE", "United Kingdom", "United States", "Singapore", "Pakistan"];

// Each user now carries their org-architecture placement (FRD Section 14):
// legalTeam = litigation | commercial | compliance | null, rbac = the role key,
// dept = business department for non-legal users.
export const USERS = [
  { id: "u1", name: "Layla Al-Rashid", role: "General Counsel", team: "Executive", email: "layla.alrashid@northwind.com", country: "Saudi Arabia", rbac: "head", legalTeam: null, dept: "Legal" },
  { id: "u2", name: "Marcus Feld", role: "Deputy General Counsel", team: "Executive", email: "marcus.feld@northwind.com", country: "United Kingdom", rbac: "head", legalTeam: null, dept: "Legal" },
  { id: "u3", name: "Priya Nair", role: "Team Lead — Commercial & Risk", team: "Commercial", email: "priya.nair@northwind.com", country: "Singapore", rbac: "lead", legalTeam: "commercial", dept: "Legal" },
  { id: "u4", name: "Omar Haddad", role: "Legal Director — Corporate", team: "Corporate", email: "omar.haddad@northwind.com", country: "UAE", rbac: "lead", legalTeam: "compliance", dept: "Legal" },
  { id: "u5", name: "Sarah Chen", role: "Senior Counsel", team: "Commercial", email: "sarah.chen@northwind.com", country: "Singapore", rbac: "member", legalTeam: "commercial", dept: "Legal" },
  { id: "u6", name: "David Okonkwo", role: "Team Lead — Litigation & Disputes", team: "Litigation", email: "david.okonkwo@northwind.com", country: "United States", rbac: "lead", legalTeam: "litigation", dept: "Legal" },
  { id: "u7", name: "Aisha Bukhari", role: "Counsel", team: "Commercial", email: "aisha.bukhari@northwind.com", country: "Pakistan", rbac: "member", legalTeam: "commercial", dept: "Legal" },
  { id: "u8", name: "Tom Bennett", role: "Counsel", team: "Corporate", email: "tom.bennett@northwind.com", country: "United Kingdom", rbac: "member", legalTeam: "compliance", dept: "Legal" },
  { id: "u9", name: "Elena Popova", role: "Junior Counsel", team: "Commercial", email: "elena.popova@northwind.com", country: "United Kingdom", rbac: "member", legalTeam: "commercial", dept: "Legal" },
  { id: "u10", name: "Yousef Nasser", role: "Paralegal", team: "Commercial", email: "yousef.nasser@northwind.com", country: "Saudi Arabia", rbac: "paralegal", legalTeam: "commercial", dept: "Legal" },
  { id: "u11", name: "Grace Liu", role: "Contract Manager", team: "Operations", email: "grace.liu@northwind.com", country: "Singapore", rbac: "paralegal", legalTeam: "commercial", dept: "Legal" },
  { id: "u12", name: "Rania Fadel", role: "Compliance Officer", team: "Compliance", email: "rania.fadel@northwind.com", country: "UAE", rbac: "member", legalTeam: "compliance", dept: "Legal" },
  // Business requesters
  { id: "u13", name: "James Whitfield", role: "VP Procurement", team: "Procurement", email: "james.whitfield@northwind.com", country: "United States", rbac: "bizHead", legalTeam: null, dept: "Procurement" },
  { id: "u14", name: "Fatima Al-Sayed", role: "Head of HR", team: "Human Resources", email: "fatima.alsayed@northwind.com", country: "Saudi Arabia", rbac: "bizHead", legalTeam: null, dept: "HR" },
  { id: "u15", name: "Ravi Menon", role: "Sales Director", team: "Sales", email: "ravi.menon@northwind.com", country: "Singapore", rbac: "bizHead", legalTeam: null, dept: "Sales & Marketing" },
  { id: "u16", name: "Klaus Werner", role: "CFO", team: "Finance", email: "klaus.werner@northwind.com", country: "United Kingdom", rbac: "bizHead", legalTeam: null, dept: "Finance" },
  // Pakistan-side legal staff for the three-team architecture (Sprint 6)
  { id: "u17", name: "Ahmed Raza", role: "Senior Counsel — Litigation", team: "Litigation", email: "ahmed.raza@northwind.com", country: "Pakistan", rbac: "member", legalTeam: "litigation", dept: "Legal" },
  { id: "u18", name: "Mariam Khan", role: "Recovery Officer", team: "Litigation", email: "mariam.khan@northwind.com", country: "Pakistan", rbac: "member", legalTeam: "litigation", dept: "Legal" },
  { id: "u19", name: "Bilal Sheikh", role: "IP Counsel", team: "Litigation", email: "bilal.sheikh@northwind.com", country: "Pakistan", rbac: "member", legalTeam: "litigation", dept: "Legal" },
  { id: "u20", name: "Noor Fatima", role: "Team Lead — Compliance", team: "Compliance", email: "noor.fatima@northwind.com", country: "Pakistan", rbac: "lead", legalTeam: "compliance", dept: "Legal" },
  { id: "u21", name: "Hassan Ali", role: "Compliance Officer", team: "Compliance", email: "hassan.ali@northwind.com", country: "Pakistan", rbac: "member", legalTeam: "compliance", dept: "Legal" },
  { id: "u22", name: "Zainab Qureshi", role: "Counsel — Commercial & Risk", team: "Commercial", email: "zainab.qureshi@northwind.com", country: "Saudi Arabia", rbac: "member", legalTeam: "commercial", dept: "Legal" },
];
export const byId = (id) => USERS.find((u) => u.id === id) || { name: "Unassigned" };
export const nameOf = (id) => byId(id).name;

const REQUEST_TYPES = [
  "NDA", "Vendor Agreement", "Employment Contract", "Lease Agreement", "Procurement Review",
  "Legal Advice", "Litigation", "Policy Review", "Compliance Review", "Government Approval",
  "IP Review", "Trademark", "Data Privacy Review", "Contract Amendment", "Contract Renewal",
  "Legal Opinion", "MOU", "Partnership Agreement", "Board Resolution", "Power of Attorney",
];
export { REQUEST_TYPES };

// ---------------- Legal Requests (Intake) ----------------
export const REQUESTS = [
  { id: "REQ-2041", title: "SaaS agreement — Salesforce enterprise renewal", type: "Contract Renewal", status: "New", bu: "Technology", dept: "IT", country: "United States", priority: "High", risk: "medium", value: 2400000, currency: "USD", counterparty: "Salesforce Inc.", owner: "u9", requester: "u13", due: d(6), created: d(-1), aiSummary: "Renewal of 850-seat CRM license. Auto-renewal clause and 9% uplift flagged for negotiation." },
  { id: "REQ-2040", title: "NDA — Project Falcon (M&A target)", type: "NDA", status: "New", bu: "Financial Services", dept: "Finance", country: "United Kingdom", priority: "Urgent", risk: "high", value: null, currency: "GBP", counterparty: "Meridian Capital Partners", owner: "u8", requester: "u16", due: d(1), created: d(0), aiSummary: "Mutual NDA for confidential acquisition diligence. Recommend 3-year confidentiality term and carve-out review." },
  { id: "REQ-2039", title: "Cloud infrastructure MSA — AWS", type: "Vendor Agreement", status: "Triage", bu: "Technology", dept: "IT", country: "United States", priority: "High", risk: "high", value: 5600000, currency: "USD", counterparty: "Amazon Web Services", owner: "u5", requester: "u13", due: d(4), created: d(-2), aiSummary: "Multi-region hosting MSA. Data residency (KSA PDPL) and liability cap require legal review." },
  { id: "REQ-2038", title: "Warehouse lease — Jeddah Logistics Park", type: "Lease Agreement", status: "Triage", bu: "Logistics", dept: "Operations", country: "Saudi Arabia", priority: "Medium", risk: "medium", value: 1850000, currency: "SAR", counterparty: "Jeddah Industrial City Authority", owner: "u10", requester: "u15", due: d(9), created: d(-3), aiSummary: "10-year lease with 5-year break option. Rent escalation and sublease rights to confirm." },
  { id: "REQ-2037", title: "Executive employment — Regional CTO", type: "Employment Contract", status: "In Review", bu: "Technology", dept: "Human Resources", country: "UAE", priority: "High", risk: "medium", value: 1200000, currency: "AED", counterparty: "Candidate — N. Farouk", owner: "u8", requester: "u14", due: d(3), created: d(-5), aiSummary: "C-suite offer with equity, non-compete (18mo) and IP assignment. Non-compete enforceability under UAE law noted." },
  { id: "REQ-2036", title: "Data Processing Addendum — MoEngage", type: "Data Privacy Review", status: "In Review", bu: "Technology", dept: "Marketing", country: "Singapore", priority: "Medium", risk: "high", value: 320000, currency: "USD", counterparty: "MoEngage Inc.", owner: "u5", requester: "u15", due: d(2), created: d(-4), aiSummary: "Cross-border marketing data flows. GDPR + PDPA SCCs required; sub-processor list incomplete." },
  { id: "REQ-2035", title: "Master consultancy — Deloitte transformation", type: "Vendor Agreement", status: "Drafting", bu: "Financial Services", dept: "Finance", country: "United Kingdom", priority: "Medium", risk: "medium", value: 3200000, currency: "GBP", counterparty: "Deloitte LLP", owner: "u7", requester: "u16", due: d(7), created: d(-8), aiSummary: "SOW-based advisory. Recommend liability cap at 1x fees and clear deliverable acceptance criteria." },
  { id: "REQ-2034", title: "Trademark filing — 'Northwind Homes' (GCC)", type: "Trademark", status: "Drafting", bu: "Real Estate", dept: "Marketing", country: "UAE", priority: "Low", risk: "low", value: 45000, currency: "AED", counterparty: "GCC Trademark Office", owner: "u10", requester: "u15", due: d(14), created: d(-6), aiSummary: "Class 36 & 37 filing across 6 GCC states. No conflicting marks found in preliminary search." },
  { id: "REQ-2033", title: "Solar PPA — Neom energy supply", type: "Partnership Agreement", status: "Negotiation", bu: "Energy", dept: "Operations", country: "Saudi Arabia", priority: "Urgent", risk: "critical", value: 48000000, currency: "SAR", counterparty: "ACWA Power", owner: "u3", requester: "u15", due: d(5), created: d(-14), aiSummary: "25-year power purchase agreement. Termination-for-convenience, force majeure and change-in-law clauses under active negotiation." },
  { id: "REQ-2032", title: "Distribution agreement — STC partnership", type: "Partnership Agreement", status: "Negotiation", bu: "Technology", dept: "Sales", country: "Saudi Arabia", priority: "High", risk: "high", value: 12500000, currency: "SAR", counterparty: "Saudi Telecom Company (STC)", owner: "u5", requester: "u15", due: d(4), created: d(-11), aiSummary: "Exclusive reseller terms. Exclusivity scope and minimum revenue commitments being negotiated." },
  { id: "REQ-2031", title: "Board resolution — Northwind Singapore capital raise", type: "Board Resolution", status: "Pending Approval", bu: "Financial Services", dept: "Finance", country: "Singapore", priority: "High", risk: "medium", value: null, currency: "USD", counterparty: "Internal — Board", owner: "u4", requester: "u16", due: d(2), created: d(-7), aiSummary: "Resolution authorising $40M Series expansion. Awaiting GC and CFO sign-off before circulation." },
  { id: "REQ-2030", title: "Supplier framework — DHL logistics", type: "Vendor Agreement", status: "Pending Approval", bu: "Logistics", dept: "Procurement", country: "United States", priority: "Medium", risk: "medium", value: 4100000, currency: "USD", counterparty: "DHL Supply Chain", owner: "u7", requester: "u13", due: d(3), created: d(-9), aiSummary: "Framework agreement with SLA credits. Legal review complete; awaiting Procurement VP approval." },
  { id: "REQ-2029", title: "Employee handbook & policy refresh — KSA", type: "Policy Review", status: "Approved", bu: "Retail", dept: "Human Resources", country: "Saudi Arabia", priority: "Low", risk: "low", value: null, currency: "SAR", counterparty: "Internal", owner: "u12", requester: "u14", due: d(-1), created: d(-18), aiSummary: "Handbook aligned to updated Saudi Labor Law. Approved and ready for rollout." },
  { id: "REQ-2028", title: "Government approval — Riyadh retail expansion", type: "Government Approval", status: "Approved", bu: "Retail", dept: "Operations", country: "Saudi Arabia", priority: "Medium", risk: "medium", value: null, currency: "SAR", counterparty: "Ministry of Commerce", owner: "u10", requester: "u15", due: d(-2), created: d(-20), aiSummary: "Commercial registration amendment approved. Municipality permit issued." },
];

// ---------------- Contracts ----------------
export const CONTRACTS = [
  { id: "CTR-1187", title: "Salesforce Enterprise License Agreement", type: "SaaS / MSA", counterparty: "Salesforce Inc.", bu: "Technology", status: "Active", risk: "medium", value: 2200000, currency: "USD", owner: "u5", start: d(-330), expiry: d(35), autoRenew: true, jurisdiction: "United States", stage: "Active" },
  { id: "CTR-1186", title: "AWS Cloud Services Master Agreement", type: "MSA", counterparty: "Amazon Web Services", bu: "Technology", status: "In Negotiation", risk: "high", value: 5600000, currency: "USD", owner: "u5", start: d(-20), expiry: d(1080), autoRenew: false, jurisdiction: "United States", stage: "Negotiation" },
  { id: "CTR-1185", title: "ACWA Power — Neom Solar PPA", type: "Partnership", counterparty: "ACWA Power", bu: "Energy", status: "In Negotiation", risk: "critical", value: 48000000, currency: "SAR", owner: "u3", start: d(-14), expiry: d(9125), autoRenew: false, jurisdiction: "Saudi Arabia", stage: "Negotiation" },
  { id: "CTR-1184", title: "STC Distribution Partnership", type: "Reseller", counterparty: "Saudi Telecom Company", bu: "Technology", status: "In Negotiation", risk: "high", value: 12500000, currency: "SAR", owner: "u5", start: d(-11), expiry: d(730), autoRenew: true, jurisdiction: "Saudi Arabia", stage: "Negotiation" },
  { id: "CTR-1183", title: "Deloitte Advisory Master Consultancy", type: "Consultancy", counterparty: "Deloitte LLP", bu: "Financial Services", status: "Drafting", risk: "medium", value: 3200000, currency: "GBP", owner: "u7", start: d(-8), expiry: d(365), autoRenew: false, jurisdiction: "United Kingdom", stage: "Drafting" },
  { id: "CTR-1182", title: "Jeddah Logistics Park Warehouse Lease", type: "Lease", counterparty: "Jeddah Industrial City Authority", bu: "Logistics", status: "Awaiting Signature", risk: "medium", value: 1850000, currency: "SAR", owner: "u10", start: d(15), expiry: d(3665), autoRenew: false, jurisdiction: "Saudi Arabia", stage: "Signature" },
  { id: "CTR-1181", title: "Microsoft 365 & Azure Enterprise Agreement", type: "SaaS / MSA", counterparty: "Microsoft Corporation", bu: "Technology", status: "Active", risk: "low", value: 1850000, currency: "USD", owner: "u5", start: d(-200), expiry: d(165), autoRenew: true, jurisdiction: "United States", stage: "Active" },
  { id: "CTR-1180", title: "DHL Supply Chain Framework", type: "Framework", counterparty: "DHL Supply Chain", bu: "Logistics", status: "Pending Approval", risk: "medium", value: 4100000, currency: "USD", owner: "u7", start: d(10), expiry: d(1105), autoRenew: false, jurisdiction: "United States", stage: "Approval" },
  { id: "CTR-1179", title: "Emaar Properties — Dubai HQ Lease", type: "Lease", counterparty: "Emaar Properties", bu: "Real Estate", status: "Active", risk: "low", value: 9200000, currency: "AED", owner: "u4", start: d(-540), expiry: d(52), autoRenew: false, jurisdiction: "UAE", stage: "Renewal" },
  { id: "CTR-1178", title: "PwC Statutory Audit Engagement", type: "Consultancy", counterparty: "PricewaterhouseCoopers", bu: "Financial Services", status: "Active", risk: "low", value: 780000, currency: "GBP", owner: "u8", start: d(-120), expiry: d(245), autoRenew: true, jurisdiction: "United Kingdom", stage: "Active" },
  { id: "CTR-1177", title: "Careem Enterprise Mobility Agreement", type: "Vendor", counterparty: "Careem (Uber)", bu: "Operations", status: "Active", risk: "low", value: 420000, currency: "AED", owner: "u7", start: d(-90), expiry: d(275), autoRenew: true, jurisdiction: "UAE", stage: "Active" },
  { id: "CTR-1176", title: "Oracle NetSuite ERP Subscription", type: "SaaS", counterparty: "Oracle Corporation", bu: "Finance", status: "Active", risk: "medium", value: 1350000, currency: "USD", owner: "u5", start: d(-260), expiry: d(28), autoRenew: true, jurisdiction: "United States", stage: "Renewal" },
  { id: "CTR-1175", title: "Aramco Fuel Supply Agreement", type: "Supply", counterparty: "Saudi Aramco", bu: "Logistics", status: "Active", risk: "medium", value: 6700000, currency: "SAR", owner: "u3", start: d(-400), expiry: d(330), autoRenew: false, jurisdiction: "Saudi Arabia", stage: "Active" },
  { id: "CTR-1174", title: "Adobe Creative Cloud Enterprise", type: "SaaS", counterparty: "Adobe Inc.", bu: "Marketing", status: "Expiring", risk: "low", value: 290000, currency: "USD", owner: "u9", start: d(-350), expiry: d(12), autoRenew: true, jurisdiction: "United States", stage: "Renewal" },
  { id: "CTR-1173", title: "Cushman & Wakefield Facilities Mgmt", type: "Vendor", counterparty: "Cushman & Wakefield", bu: "Real Estate", status: "Active", risk: "low", value: 1100000, currency: "AED", owner: "u4", start: d(-180), expiry: d(185), autoRenew: false, jurisdiction: "UAE", stage: "Active" },
  { id: "CTR-1172", title: "Meta Ads Managed Services", type: "Vendor", counterparty: "Meta Platforms", bu: "Retail", status: "Active", risk: "medium", value: 540000, currency: "USD", owner: "u9", start: d(-70), expiry: d(295), autoRenew: true, jurisdiction: "United States", stage: "Active" },
  { id: "CTR-1171", title: "Zoom Enterprise Communications", type: "SaaS", counterparty: "Zoom Video Communications", bu: "Technology", status: "Expiring", risk: "low", value: 165000, currency: "USD", owner: "u9", start: d(-340), expiry: d(20), autoRenew: true, jurisdiction: "United States", stage: "Renewal" },
  { id: "CTR-1170", title: "SAP Ariba Procurement Suite", type: "SaaS", counterparty: "SAP SE", bu: "Financial Services", status: "Active", risk: "medium", value: 2100000, currency: "EUR", owner: "u5", start: d(-150), expiry: d(215), autoRenew: false, jurisdiction: "United Kingdom", stage: "Active" },
  { id: "CTR-1169", title: "KPMG Tax Advisory Retainer", type: "Consultancy", counterparty: "KPMG", bu: "Finance", status: "Active", risk: "low", value: 610000, currency: "GBP", owner: "u8", start: d(-100), expiry: d(265), autoRenew: true, jurisdiction: "United Kingdom", stage: "Active" },
  { id: "CTR-1168", title: "Bupa Group Health Insurance", type: "Insurance", counterparty: "Bupa Arabia", bu: "Human Resources", status: "Active", risk: "low", value: 3400000, currency: "SAR", owner: "u7", start: d(-60), expiry: d(305), autoRenew: true, jurisdiction: "Saudi Arabia", stage: "Active" },
  { id: "CTR-1167", title: "IBM Consulting — Data Platform Build", type: "SOW", counterparty: "IBM", bu: "Technology", status: "Terminated", risk: "medium", value: 2800000, currency: "USD", owner: "u6", start: d(-500), expiry: d(-30), autoRenew: false, jurisdiction: "United States", stage: "Archive" },
];

// ---------------- Matters ----------------
export const MATTERS = [
  { id: "MAT-508", title: "Neom Solar PPA Negotiation", type: "Contract", status: "In Negotiation", priority: "urgent", risk: "critical", bu: "Energy", owner: "u3", opened: d(-14), due: d(5), tasks: 8, docs: 12, comments: 23, progress: 62 },
  { id: "MAT-507", title: "AWS MSA — Data Residency Review", type: "Contract", status: "Legal Review", priority: "high", risk: "high", bu: "Technology", owner: "u5", opened: d(-2), due: d(4), tasks: 5, docs: 7, comments: 9, progress: 30 },
  { id: "MAT-506", title: "Project Falcon — M&A Diligence", type: "Corporate", status: "Open", priority: "urgent", risk: "high", bu: "Financial Services", owner: "u8", opened: d(0), due: d(21), tasks: 14, docs: 46, comments: 5, progress: 12 },
  { id: "MAT-505", title: "STC Distribution Dispute — Pre-litigation", type: "Litigation", status: "Escalated", priority: "high", risk: "high", bu: "Technology", owner: "u6", opened: d(-9), due: d(11), tasks: 6, docs: 18, comments: 31, progress: 45 },
  { id: "MAT-504", title: "Riyadh Retail Expansion Approvals", type: "Regulatory", status: "Completed", priority: "medium", risk: "medium", bu: "Retail", owner: "u10", opened: d(-20), due: d(-2), tasks: 9, docs: 15, comments: 12, progress: 100 },
  { id: "MAT-503", title: "GDPR/PDPL Data Mapping Program", type: "Compliance", status: "In Review", priority: "high", risk: "high", bu: "Technology", owner: "u12", opened: d(-30), due: d(15), tasks: 22, docs: 34, comments: 18, progress: 70 },
  { id: "MAT-502", title: "Deloitte Advisory — SOW Drafting", type: "Contract", status: "Drafting", priority: "medium", risk: "medium", bu: "Financial Services", owner: "u7", opened: d(-8), due: d(7), tasks: 4, docs: 6, comments: 7, progress: 40 },
  { id: "MAT-501", title: "Regional CTO Employment Package", type: "Employment", status: "In Review", priority: "high", risk: "medium", bu: "Technology", owner: "u8", opened: d(-5), due: d(3), tasks: 6, docs: 5, comments: 14, progress: 55 },
  { id: "MAT-500", title: "Trademark Portfolio — GCC Expansion", type: "IP", status: "Drafting", priority: "low", risk: "low", bu: "Real Estate", owner: "u10", opened: d(-6), due: d(14), tasks: 5, docs: 9, comments: 3, progress: 35 },
  { id: "MAT-499", title: "Warehouse Lease — Jeddah Park", type: "Contract", status: "Pending Approval", priority: "medium", risk: "medium", bu: "Logistics", owner: "u10", opened: d(-3), due: d(2), tasks: 3, docs: 4, comments: 6, progress: 80 },
  { id: "MAT-498", title: "Employee Handbook Refresh — KSA", type: "Policy", status: "Completed", priority: "low", risk: "low", bu: "Retail", owner: "u12", opened: d(-18), due: d(-1), tasks: 7, docs: 3, comments: 9, progress: 100 },
  { id: "MAT-497", title: "IBM Data Platform — Contract Termination", type: "Litigation", status: "Escalated", priority: "high", risk: "medium", bu: "Technology", owner: "u6", opened: d(-40), due: d(9), tasks: 11, docs: 27, comments: 42, progress: 65 },
];

// ---------------- Clause Library ----------------
export const CLAUSES = [
  { id: "CL-01", title: "Mutual Confidentiality", category: "Confidentiality", jurisdiction: "Global", risk: "low", usage: 342, owner: "u3", updated: d(-12), status: "Approved" },
  { id: "CL-02", title: "Limitation of Liability (1x Fees Cap)", category: "Liability", jurisdiction: "Global", risk: "medium", usage: 288, owner: "u3", updated: d(-30), status: "Approved" },
  { id: "CL-03", title: "Governing Law — Saudi Arabia", category: "Governing Law", jurisdiction: "Saudi Arabia", risk: "low", usage: 156, owner: "u10", updated: d(-45), status: "Approved" },
  { id: "CL-04", title: "Data Processing Addendum (GDPR)", category: "Data Privacy", jurisdiction: "United Kingdom", risk: "high", usage: 134, owner: "u12", updated: d(-8), status: "Approved" },
  { id: "CL-05", title: "PDPL Data Residency (KSA)", category: "Data Privacy", jurisdiction: "Saudi Arabia", risk: "high", usage: 67, owner: "u12", updated: d(-5), status: "In Review" },
  { id: "CL-06", title: "Force Majeure (Extended)", category: "Risk", jurisdiction: "Global", risk: "medium", usage: 201, owner: "u5", updated: d(-60), status: "Approved" },
  { id: "CL-07", title: "Termination for Convenience (30d)", category: "Termination", jurisdiction: "Global", risk: "medium", usage: 178, owner: "u5", updated: d(-22), status: "Approved" },
  { id: "CL-08", title: "IP Assignment — Work for Hire", category: "IP", jurisdiction: "Global", risk: "medium", usage: 145, owner: "u8", updated: d(-18), status: "Approved" },
  { id: "CL-09", title: "Non-Compete (18 months) — UAE", category: "Employment", jurisdiction: "UAE", risk: "high", usage: 43, owner: "u8", updated: d(-14), status: "In Review" },
  { id: "CL-10", title: "Indemnification (Third-Party Claims)", category: "Liability", jurisdiction: "Global", risk: "high", usage: 167, owner: "u3", updated: d(-27), status: "Approved" },
  { id: "CL-11", title: "Arbitration — DIFC-LCIA", category: "Dispute Resolution", jurisdiction: "UAE", risk: "medium", usage: 89, owner: "u4", updated: d(-33), status: "Approved" },
  { id: "CL-12", title: "Anti-Bribery & Corruption (FCPA/UKBA)", category: "Compliance", jurisdiction: "Global", risk: "high", usage: 210, owner: "u12", updated: d(-9), status: "Approved" },
  { id: "CL-13", title: "SLA Service Credits", category: "Commercial", jurisdiction: "Global", risk: "low", usage: 98, owner: "u11", updated: d(-40), status: "Approved" },
  { id: "CL-14", title: "Auto-Renewal (Opt-out 60d)", category: "Commercial", jurisdiction: "Global", risk: "medium", usage: 122, owner: "u5", updated: d(-16), status: "Approved" },
];

// ---------------- Templates ----------------
export const TEMPLATES = [
  { id: "T-01", title: "Mutual NDA", category: "Confidentiality", jurisdiction: "Global", version: "4.2", usage: 512, owner: "u3", updated: d(-10), status: "Approved" },
  { id: "T-02", title: "Master Services Agreement (MSA)", category: "Commercial", jurisdiction: "Global", version: "6.1", usage: 288, owner: "u3", updated: d(-24), status: "Approved" },
  { id: "T-03", title: "Statement of Work (SOW)", category: "Commercial", jurisdiction: "Global", version: "3.0", usage: 344, owner: "u5", updated: d(-15), status: "Approved" },
  { id: "T-04", title: "Employment Contract — KSA", category: "Employment", jurisdiction: "Saudi Arabia", version: "2.5", usage: 176, owner: "u8", updated: d(-20), status: "Approved" },
  { id: "T-05", title: "Employment Contract — UAE", category: "Employment", jurisdiction: "UAE", version: "2.3", usage: 143, owner: "u8", updated: d(-28), status: "Approved" },
  { id: "T-06", title: "Vendor Agreement", category: "Procurement", jurisdiction: "Global", version: "5.0", usage: 267, owner: "u7", updated: d(-6), status: "Approved" },
  { id: "T-07", title: "Commercial Lease", category: "Real Estate", jurisdiction: "Saudi Arabia", version: "1.8", usage: 54, owner: "u10", updated: d(-35), status: "Approved" },
  { id: "T-08", title: "Data Processing Agreement (DPA)", category: "Data Privacy", jurisdiction: "Global", version: "3.1", usage: 121, owner: "u12", updated: d(-4), status: "Approved" },
  { id: "T-09", title: "Board Resolution", category: "Corporate", jurisdiction: "Global", version: "2.0", usage: 88, owner: "u4", updated: d(-42), status: "Approved" },
  { id: "T-10", title: "Power of Attorney", category: "Corporate", jurisdiction: "Saudi Arabia", version: "1.4", usage: 37, owner: "u10", updated: d(-50), status: "Approved" },
  { id: "T-11", title: "MOU / Letter of Intent", category: "Commercial", jurisdiction: "Global", version: "2.2", usage: 96, owner: "u3", updated: d(-30), status: "Approved" },
  { id: "T-12", title: "Settlement Agreement", category: "Litigation", jurisdiction: "Global", version: "1.6", usage: 29, owner: "u6", updated: d(-38), status: "In Review" },
];

// ---------------- Litigation ----------------
export const LITIGATION = [
  { id: "LIT-24", title: "Northwind KSA v. Falcon Contractors", type: "Commercial Dispute", status: "Open", stage: "Discovery", risk: "high", exposure: 4200000, currency: "SAR", counsel: "Al-Tamimi & Co.", lead: "u6", filed: d(-120), nextHearing: d(18), jurisdiction: "Saudi Arabia" },
  { id: "LIT-23", title: "IBM Data Platform Termination Claim", type: "Contract", status: "Open", stage: "Mediation", risk: "medium", exposure: 2800000, currency: "USD", counsel: "Latham & Watkins", lead: "u6", filed: d(-40), nextHearing: d(9), jurisdiction: "United States" },
  { id: "LIT-22", title: "Employee Grievance — Unfair Dismissal (UK)", type: "Employment", status: "Open", stage: "Tribunal", risk: "medium", exposure: 180000, currency: "GBP", counsel: "In-house", lead: "u8", filed: d(-60), nextHearing: d(25), jurisdiction: "United Kingdom" },
  { id: "LIT-21", title: "IP Infringement — 'Northwind' mark (UAE)", type: "IP", status: "Open", stage: "Pleadings", risk: "medium", exposure: 350000, currency: "AED", counsel: "BSA Ahmad Bin Hezeem", lead: "u4", filed: d(-30), nextHearing: d(14), jurisdiction: "UAE" },
  { id: "LIT-20", title: "Vendor Payment Recovery — Meridian", type: "Debt Recovery", status: "Closed", stage: "Settled", risk: "low", exposure: 620000, currency: "USD", counsel: "In-house", lead: "u6", filed: d(-200), nextHearing: null, jurisdiction: "United States" },
  { id: "LIT-19", title: "Regulatory Inquiry — Data Protection (SG)", type: "Regulatory", status: "Open", stage: "Response", risk: "high", exposure: 900000, currency: "USD", counsel: "Allen & Gledhill", lead: "u12", filed: d(-15), nextHearing: d(7), jurisdiction: "Singapore" },
];

// ---------------- Compliance ----------------
export const COMPLIANCE = [
  { id: "CMP-01", area: "Data Protection — GDPR", owner: "u12", status: "Compliant", score: 94, region: "United Kingdom", lastReview: d(-20), nextReview: d(70) },
  { id: "CMP-02", area: "Data Protection — PDPL", owner: "u12", status: "At Risk", score: 71, region: "Saudi Arabia", lastReview: d(-8), nextReview: d(22) },
  { id: "CMP-03", area: "Data Protection — PDPA", owner: "u12", status: "Compliant", score: 88, region: "Singapore", lastReview: d(-35), nextReview: d(55) },
  { id: "CMP-04", area: "Anti-Bribery & Corruption", owner: "u12", status: "Compliant", score: 91, region: "Global", lastReview: d(-45), nextReview: d(45) },
  { id: "CMP-05", area: "Labor Law Compliance — KSA", owner: "u8", status: "Compliant", score: 86, region: "Saudi Arabia", lastReview: d(-15), nextReview: d(75) },
  { id: "CMP-06", area: "AML / KYC", owner: "u12", status: "At Risk", score: 68, region: "UAE", lastReview: d(-5), nextReview: d(25) },
  { id: "CMP-07", area: "Corporate Governance — Board", owner: "u4", status: "Compliant", score: 96, region: "Global", lastReview: d(-60), nextReview: d(30) },
  { id: "CMP-08", area: "Export Controls & Sanctions", owner: "u6", status: "Non-Compliant", score: 58, region: "United States", lastReview: d(-3), nextReview: d(12) },
  { id: "CMP-09", area: "Health & Safety", owner: "u10", status: "Compliant", score: 90, region: "Saudi Arabia", lastReview: d(-25), nextReview: d(65) },
  { id: "CMP-10", area: "Competition / Antitrust", owner: "u3", status: "Compliant", score: 84, region: "United Kingdom", lastReview: d(-50), nextReview: d(40) },
];

// ---------------- Approvals ----------------
export const APPROVALS = [
  { id: "AP-91", matter: "DHL Supply Chain Framework", type: "Contract Execution", requestedBy: "u7", approver: "u13", role: "VP Procurement", status: "pending", amount: 4100000, currency: "USD", requested: d(-1) },
  { id: "AP-90", matter: "Neom Solar PPA — Term Sheet", type: "High-Value Deal", requestedBy: "u3", approver: "u1", role: "General Counsel", status: "pending", amount: 48000000, currency: "SAR", requested: d(0) },
  { id: "AP-89", matter: "Board Resolution — SG Capital Raise", type: "Corporate", requestedBy: "u4", approver: "u16", role: "CFO", status: "pending", amount: null, currency: "USD", requested: d(-1) },
  { id: "AP-88", matter: "Regional CTO Employment Offer", type: "Employment", requestedBy: "u8", approver: "u14", role: "Head of HR", status: "pending", amount: 1200000, currency: "AED", requested: d(-2) },
  { id: "AP-87", matter: "Salesforce Renewal — 9% uplift", type: "Renewal", requestedBy: "u9", approver: "u2", role: "Deputy GC", status: "pending", amount: 2400000, currency: "USD", requested: d(0) },
  { id: "AP-86", matter: "MoEngage DPA", type: "Data Privacy", requestedBy: "u5", approver: "u12", role: "Compliance", status: "approved", amount: 320000, currency: "USD", requested: d(-3) },
  { id: "AP-85", matter: "Adobe CC Renewal", type: "Renewal", requestedBy: "u9", approver: "u3", role: "Legal Director", status: "approved", amount: 290000, currency: "USD", requested: d(-4) },
  { id: "AP-84", matter: "Aramco Fuel Amendment", type: "Amendment", requestedBy: "u3", approver: "u1", role: "General Counsel", status: "rejected", amount: 6700000, currency: "SAR", requested: d(-5) },
];

// ---------------- Reviews queue ----------------
export const REVIEWS = [
  { id: "RV-330", title: "AWS MSA — Third-party paper", contract: "CTR-1186", reviewer: "u5", risk: "high", flagged: 7, status: "In Review", received: d(-1), sla: d(1) },
  { id: "RV-329", title: "ACWA Power PPA — Redline v3", contract: "CTR-1185", reviewer: "u3", risk: "critical", flagged: 12, status: "In Review", received: d(-2), sla: d(0) },
  { id: "RV-328", title: "Deloitte SOW #4 — Deliverables", contract: "CTR-1183", reviewer: "u7", risk: "medium", flagged: 3, status: "In Review", received: d(-1), sla: d(2) },
  { id: "RV-327", title: "STC Reseller — Exclusivity terms", contract: "CTR-1184", reviewer: "u5", risk: "high", flagged: 5, status: "In Review", received: d(-3), sla: d(1) },
  { id: "RV-326", title: "MoEngage DPA — Sub-processors", contract: null, reviewer: "u12", risk: "high", flagged: 4, status: "Completed", received: d(-4), sla: d(-1) },
  { id: "RV-325", title: "Jeddah Lease — Escalation clause", contract: "CTR-1182", reviewer: "u10", risk: "medium", flagged: 2, status: "Completed", received: d(-5), sla: d(-2) },
];

// ---------------- Activity feed ----------------
export const ACTIVITY = [
  { id: 1, user: "u3", action: "moved", target: "Neom Solar PPA", detail: "to Negotiation", time: d(0), tone: "amber", icon: "gitbranch" },
  { id: 2, user: "u5", action: "flagged", target: "AWS MSA", detail: "7 clauses for review", time: d(0), tone: "red", icon: "alertTriangle" },
  { id: 3, user: "u1", action: "approved", target: "MoEngage DPA", detail: "", time: d(0), tone: "green", icon: "check" },
  { id: 4, user: "u9", action: "generated", target: "Salesforce Renewal draft", detail: "from template", time: d(0), tone: "purple", icon: "sparkles" },
  { id: 5, user: "u8", action: "commented on", target: "Regional CTO Offer", detail: "non-compete term", time: d(0), tone: "blue", icon: "message" },
  { id: 6, user: "u12", action: "escalated", target: "Export Controls compliance", detail: "score dropped to 58", time: d(0), tone: "red", icon: "flag" },
  { id: 7, user: "u10", action: "completed", target: "Riyadh Retail Approvals", detail: "", time: d(-1), tone: "green", icon: "checkcircle" },
  { id: 8, user: "u7", action: "uploaded", target: "DHL Framework", detail: "signed counterpart", time: d(-1), tone: "blue", icon: "upload" },
  { id: 9, user: "u6", action: "opened litigation", target: "STC Distribution Dispute", detail: "", time: d(-1), tone: "red", icon: "scale" },
  { id: 10, user: "u5", action: "requested approval", target: "Salesforce Renewal", detail: "from Deputy GC", time: d(-1), tone: "amber", icon: "checksquare" },
];

// ---------------- Notifications ----------------
export const NOTIFICATIONS = [
  { id: 1, type: "approval", title: "Approval needed — Neom Solar PPA term sheet", time: d(0), unread: true, tone: "amber", icon: "checksquare" },
  { id: 2, type: "risk", title: "AWS MSA flagged as High Risk by AI review", time: d(0), unread: true, tone: "red", icon: "alertTriangle" },
  { id: 3, type: "deadline", title: "Project Falcon NDA due tomorrow", time: d(0), unread: true, tone: "amber", icon: "clock" },
  { id: 4, type: "mention", title: "Omar Haddad mentioned you on MAT-506", time: d(0), unread: true, tone: "blue", icon: "message" },
  { id: 5, type: "renewal", title: "3 contracts expiring within 30 days", time: d(-1), unread: false, tone: "amber", icon: "refresh" },
  { id: 6, type: "assigned", title: "You were assigned to STC Distribution Dispute", time: d(-1), unread: false, tone: "blue", icon: "user" },
  { id: 7, type: "ai", title: "AI Copilot summarized 4 new documents", time: d(-1), unread: false, tone: "purple", icon: "sparkles" },
  { id: 8, type: "compliance", title: "Export Controls compliance now Non-Compliant", time: d(-2), unread: false, tone: "red", icon: "shield" },
];

// ---------------- Dashboard aggregates ----------------
export const DASH = {
  kpis: {
    activeContracts: 1284,
    pendingReviews: 37,
    avgTat: 3.4, // days
    overdue: 9,
    litigation: 6,
    approvalsPending: 12,
    complianceScore: 84,
    contractValue: 486000000, // portfolio USD
    nearExpiry: 23,
    aiSaved: 1840, // hours
  },
  riskDist: [
    { label: "Low", value: 642, color: "#16a34a" },
    { label: "Medium", value: 431, color: "#ca8a04" },
    { label: "High", value: 168, color: "#ea580c" },
    { label: "Critical", value: 43, color: "#dc2626" },
  ],
  tatTrend: [4.8, 4.5, 4.9, 4.2, 3.9, 4.1, 3.6, 3.4, 3.5, 3.2, 3.4],
  tatLabels: ["", "Mar", "", "Apr", "", "May", "", "Jun", "", "Jul", ""],
  volumeTrend: [
    { label: "Feb", NDA: 42, Vendor: 28, Employment: 18 },
    { label: "Mar", NDA: 51, Vendor: 34, Employment: 22 },
    { label: "Apr", NDA: 48, Vendor: 41, Employment: 19 },
    { label: "May", NDA: 63, Vendor: 38, Employment: 27 },
    { label: "Jun", NDA: 58, Vendor: 45, Employment: 24 },
    { label: "Jul", NDA: 71, Vendor: 52, Employment: 31 },
  ],
  buWorkload: [
    { label: "Technology", value: 312, color: "#0d7a3f" },
    { label: "Real Estate", value: 198, color: "#10935a" },
    { label: "Financial Svcs", value: 176, color: "#27a96d" },
    { label: "Logistics", value: 154, color: "#0891b2" },
    { label: "Energy", value: 132, color: "#d97706" },
    { label: "Retail", value: 112, color: "#6d28d9" },
  ],
  requestFunnel: [
    { label: "Intake", value: 428 },
    { label: "Triage", value: 356 },
    { label: "In Review", value: 284 },
    { label: "Negotiation", value: 142 },
    { label: "Executed", value: 118 },
  ],
  lawyerLoad: [
    { name: "u5", assigned: 18, capacity: 20 },
    { name: "u3", assigned: 14, capacity: 16 },
    { name: "u7", assigned: 16, capacity: 18 },
    { name: "u8", assigned: 12, capacity: 18 },
    { name: "u6", assigned: 15, capacity: 16 },
    { name: "u9", assigned: 9, capacity: 14 },
  ],
  // Department heatmap: rows=BU, cols=months intensity 0-100
  heatCols: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  heat: [
    { row: "Technology", vals: [45, 62, 58, 78, 71, 88] },
    { row: "Real Estate", vals: [32, 41, 38, 52, 48, 61] },
    { row: "Financial Svcs", vals: [51, 55, 62, 58, 66, 72] },
    { row: "Logistics", vals: [28, 35, 44, 41, 52, 54] },
    { row: "Energy", vals: [22, 30, 35, 48, 61, 79] },
    { row: "Retail", vals: [38, 42, 39, 45, 43, 48] },
  ],
};

export const AI_INSIGHTS = [
  { title: "3 renewals at risk of auto-renewing", text: "Salesforce, Oracle NetSuite and Adobe CC will auto-renew within 30 days at a combined +$310K uplift. Opt-out windows close soon.", action: "Review renewals" },
  { title: "AWS MSA liability cap is an outlier", text: "The proposed cap (0.5x fees) is below your playbook standard (1x). Similar deals settled at 1x in 82% of cases.", action: "Open matter" },
  { title: "Legal capacity concentrated on Technology BU", text: "Technology accounts for 34% of active workload. Consider rebalancing 2 matters from Sarah Chen to Tom Bennett.", action: "View workload" },
];

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
export const COMPANIES = [
  { id: "CO-01", name: "Salesforce Inc.", aliases: ["Salesforce"], jurisdiction: "United States", type: "Vendor" },
  { id: "CO-02", name: "Amazon Web Services", aliases: ["AWS", "Amazon"], jurisdiction: "United States", type: "Vendor", riskNote: "Third-party paper; data-residency under PDPL is the key exposure." },
  { id: "CO-03", name: "ACWA Power", aliases: ["ACWA"], jurisdiction: "Saudi Arabia", type: "Counterparty", riskNote: "25-year Neom Solar PPA; critical-risk change-in-law clause in negotiation." },
  { id: "CO-04", name: "Saudi Telecom Company", aliases: ["STC"], jurisdiction: "Saudi Arabia", type: "Counterparty" },
  { id: "CO-05", name: "Deloitte LLP", aliases: ["Deloitte"], jurisdiction: "United Kingdom", type: "Vendor" },
  { id: "CO-06", name: "Emaar Properties", aliases: ["Emaar"], jurisdiction: "UAE", type: "Counterparty" },
  { id: "CO-07", name: "Jeddah Industrial City Authority", aliases: ["MODON Jeddah", "JICA"], jurisdiction: "Saudi Arabia", type: "Counterparty" },
  { id: "CO-08", name: "IBM", aliases: ["IBM Corp", "IBM Consulting"], jurisdiction: "United States", type: "Vendor", riskNote: "Terminated SOW now in mediation ($2.8M claim)." },
  { id: "CO-09", name: "Meridian Capital Partners", aliases: ["Meridian"], jurisdiction: "United Kingdom", type: "Counterparty" },
  { id: "CO-10", name: "MoEngage Inc.", aliases: ["MoEngage"], jurisdiction: "Singapore", type: "Vendor" },
  { id: "CO-11", name: "DHL Supply Chain", aliases: ["DHL"], jurisdiction: "United States", type: "Vendor" },
  { id: "CO-12", name: "Al-Faisal Development Co.", aliases: ["Al-Faisal Development", "Al Faisal Dev"], jurisdiction: "Saudi Arabia", type: "Counterparty", riskNote: "Parallel lease-amendment and procurement-MSA negotiations — see overlap alerts." },
  // Group legal entities
  { id: "CO-13", name: "Northwind KSA", aliases: ["Northwind Saudi", "Northwind Realty KSA"], jurisdiction: "Saudi Arabia", type: "Group Entity" },
  { id: "CO-14", name: "Northwind UAE", aliases: ["Northwind Dubai"], jurisdiction: "UAE", type: "Group Entity" },
  { id: "CO-15", name: "Northwind UK", aliases: [], jurisdiction: "United Kingdom", type: "Group Entity" },
  { id: "CO-16", name: "Northwind US", aliases: [], jurisdiction: "United States", type: "Group Entity" },
  { id: "CO-17", name: "Northwind Singapore", aliases: ["Northwind SG"], jurisdiction: "Singapore", type: "Group Entity" },
  { id: "CO-18", name: "Northwind Pakistan", aliases: ["Northwind PK"], jurisdiction: "Pakistan", type: "Group Entity" },
];

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

export const LICENSES = [
  { id: "LIC-001", name: "REGA Brokerage License", type: "Real Estate Brokerage", entity: "Northwind KSA", authority: "Real Estate General Authority (REGA)", jurisdiction: "KSA", licenseNumber: "REGA-BRK-4471", issueDate: d(-323), expiryDate: d(42), renewalLeadDays: 90, owner: "u10", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-13"], notes: "FAL license for brokerage & property marketing across KSA.", renewalHistory: [{ date: d(-323), action: "Initial issuance", by: "u10" }] },
  { id: "LIC-002", name: "RERA Broker Registration (Dubai)", type: "Real Estate Brokerage", entity: "Northwind UAE", authority: "Dubai Land Department (RERA)", jurisdiction: "UAE", licenseNumber: "RERA-DXB-20981", issueDate: d(-295), expiryDate: d(70), renewalLeadDays: 90, owner: "u4", linkedContractId: "CTR-1179", linkedMatterId: null, companyTags: ["CO-14"], notes: "Broker card + office registration under Dubai Land Department.", renewalHistory: [] },
  { id: "LIC-003", name: "Ejar Platform Registration", type: "Tenancy Registration", entity: "Northwind KSA", authority: "Ejar (REGA)", jurisdiction: "KSA", licenseNumber: "EJAR-119224", issueDate: d(-350), expiryDate: d(15), renewalLeadDays: 90, owner: "u10", linkedContractId: "CTR-1182", linkedMatterId: "MAT-499", companyTags: ["CO-13"], notes: "Mandatory for lease contract registration & attestation in KSA.", renewalHistory: [] },
  { id: "LIC-004", name: "ZATCA VAT Registration", type: "Tax Registration", entity: "Northwind KSA", authority: "Zakat, Tax and Customs Authority (ZATCA)", jurisdiction: "KSA", licenseNumber: "3000-4471-119", issueDate: d(-700), expiryDate: d(300), renewalLeadDays: 90, owner: "u16", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-13"], notes: "Includes Phase-2 e-invoicing (Fatoora) integration.", renewalHistory: [{ date: d(-330), action: "Renewed for 1 year", by: "u16" }] },
  { id: "LIC-005", name: "Balady Municipal License", type: "Municipal License", entity: "Northwind KSA", authority: "Ministry of Municipal & Rural Affairs (Balady)", jurisdiction: "KSA", licenseNumber: "BLD-RYD-88214", issueDate: d(-340), expiryDate: d(25), renewalLeadDays: 90, owner: "u10", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-13"], notes: "Municipal operating license — Riyadh head office.", renewalHistory: [] },
  { id: "LIC-006", name: "MISA Investment License", type: "Foreign Investment License", entity: "Northwind KSA", authority: "Ministry of Investment (MISA)", jurisdiction: "KSA", licenseNumber: "MISA-INV-7789", issueDate: d(-500), expiryDate: d(220), renewalLeadDays: 90, owner: "u1", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-13"], notes: "Foreign-ownership license for the KSA holding structure.", renewalHistory: [{ date: d(-500), action: "Initial issuance", by: "u1" }] },
  { id: "LIC-007", name: "Commercial Registration (CR)", type: "Commercial Registration", entity: "Northwind KSA", authority: "Ministry of Commerce", jurisdiction: "KSA", licenseNumber: "CR-1010557781", issueDate: d(-385), expiryDate: d(-20), renewalLeadDays: 90, owner: "u1", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-13"], notes: "LAPSED — CR renewal overdue; blocks Balady and bank operations.", renewalHistory: [] },
  { id: "LIC-008", name: "SECP Company Registration", type: "Company Registration", entity: "Northwind Pakistan", authority: "Securities & Exchange Commission of Pakistan (SECP)", jurisdiction: "PK", licenseNumber: "SECP-PK-0099231", issueDate: d(-620), expiryDate: d(400), renewalLeadDays: 90, owner: "u7", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-18"], notes: "Annual filing (Form-A) due with the CR renewal.", renewalHistory: [] },
  { id: "LIC-009", name: "Punjab Land Records e-Stamp Authorization", type: "e-Stamp Authorization", entity: "Northwind Pakistan", authority: "Punjab Land Records Authority (PLRA)", jurisdiction: "PK", licenseNumber: "PLRA-ESTAMP-5521", issueDate: d(-280), expiryDate: d(85), renewalLeadDays: 90, owner: "u7", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-18"], notes: "e-Stamping authorization for property transfers in Punjab.", renewalHistory: [] },
  { id: "LIC-010", name: "PSEB Registration", type: "Sector Registration", entity: "Northwind Pakistan", authority: "Pakistan Software Export Board (PSEB)", jurisdiction: "PK", licenseNumber: "PSEB-PK-44120", issueDate: d(-210), expiryDate: d(150), renewalLeadDays: 90, owner: "u7", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-18"], notes: "PropTech subsidiary registration for tax exemptions.", renewalHistory: [] },
  { id: "LIC-011", name: "Trademark — 'Northwind Homes' (SAIP)", type: "Trademark", entity: "Northwind KSA", authority: "Saudi Authority for Intellectual Property (SAIP)", jurisdiction: "KSA", licenseNumber: "SAIP-TM-33219", issueDate: d(-460), expiryDate: d(500), renewalLeadDays: 120, owner: "u8", linkedContractId: null, linkedMatterId: "MAT-500", companyTags: ["CO-13"], notes: "Classes 36 & 37; renewable every 10 years.", renewalHistory: [] },
  { id: "LIC-012", name: "Trademark — 'Northwind' (IPO-Pakistan)", type: "Trademark", entity: "Northwind Pakistan", authority: "Intellectual Property Organization of Pakistan (IPO-Pakistan)", jurisdiction: "PK", licenseNumber: "IPOP-TM-77120", issueDate: d(-800), expiryDate: d(-60), renewalLeadDays: 120, owner: "u8", linkedContractId: null, linkedMatterId: "MAT-500", companyTags: ["CO-18"], notes: "LAPSED — renewal window missed; refiling assessment required.", renewalHistory: [] },
  { id: "LIC-013", name: "Civil Defense Safety Certificate", type: "Safety Certificate", entity: "Northwind KSA", authority: "General Directorate of Civil Defense", jurisdiction: "KSA", licenseNumber: "CD-JED-2201", issueDate: d(-120), expiryDate: d(600), renewalLeadDays: 90, owner: "u10", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-13"], notes: "Fire-safety certificate for the Jeddah logistics facility.", renewalHistory: [] },
  { id: "LIC-014", name: "DED Trade License (Dubai)", type: "Trade License", entity: "Northwind UAE", authority: "Department of Economic Development (DED)", jurisdiction: "UAE", licenseNumber: "DED-DXB-664120", issueDate: d(-320), expiryDate: d(38), renewalLeadDays: 90, owner: "u4", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-14"], notes: "Mainland trade license — Dubai HQ.", renewalHistory: [] },
];

// ---------------- New seed records powering overlap detection (Feature 3) ----------------
MATTERS.push({ id: "MAT-509", title: "Al-Faisal Development — Master Lease Amendment", type: "Contract", status: "Open", priority: "high", risk: "high", bu: "Real Estate", owner: "u4", opened: d(-4), due: d(12), tasks: 4, docs: 6, comments: 3, progress: 20 });
REVIEWS.push(
  { id: "RV-331", title: "Al-Faisal Development — Master Lease Amendment", contract: null, reviewer: "u10", risk: "high", flagged: 5, status: "In Review", received: d(-2), sla: d(2) },
  { id: "RV-332", title: "Al-Faisal Development — Procurement MSA", contract: null, reviewer: "u7", risk: "medium", flagged: 3, status: "In Review", received: d(-1), sla: d(3) },
);

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
const ROUNDS_SEED = {
  "CTR-1186": [
    { id: "CTR-1186-R1", round: 1, date: d(-18), direction: "sent", versionLabel: "v1 — our draft", summary: "Issued Northwind standard MSA with 1× liability cap and KSA data-residency addendum.", clausesChanged: [{ clause: "Limitation of Liability", from: "—", to: "1× fees" }, { clause: "Data Residency", from: "—", to: "KSA region pinned (PDPL)" }], by: "u5", attachmentName: "AWS-MSA-v1.docx" },
    { id: "CTR-1186-R2", round: 2, date: d(-2), direction: "received", versionLabel: "v2 — AWS redline", summary: "AWS countered liability to 0.5× and softened the data-residency guarantee.", clausesChanged: [{ clause: "Limitation of Liability", from: "1× fees", to: "0.5× fees", fallbackLevel: "below playbook" }, { clause: "Data Residency", from: "KSA region pinned", to: "best-efforts, no guarantee" }], by: "Amazon Web Services", attachmentName: "AWS-MSA-v2-redline.docx" },
  ],
  "CTR-1185": [
    { id: "CTR-1185-R1", round: 1, date: d(-13), direction: "sent", versionLabel: "v1 — our draft", summary: "Issued PPA: 1× cap, change-in-law shared above threshold, TFC on 90 days.", clausesChanged: [{ clause: "Limitation of Liability", from: "—", to: "1× fees" }, { clause: "Change in Law", from: "—", to: "shared above threshold" }, { clause: "Termination", from: "—", to: "TFC 90 days" }], by: "u3", attachmentName: "ACWA-PPA-v1.docx" },
    { id: "CTR-1185-R2", round: 2, date: d(-6), direction: "received", versionLabel: "v2 — ACWA redline", summary: "ACWA shifted all change-in-law cost to us; TFC only after year 5.", clausesChanged: [{ clause: "Change in Law", from: "shared above threshold", to: "customer bears all cost", fallbackLevel: "off playbook" }, { clause: "Termination", from: "TFC 90 days", to: "TFC after year 5, 180 days' notice" }], by: "ACWA Power", attachmentName: "ACWA-PPA-v2-redline.docx" },
    { id: "CTR-1185-R3", round: 3, date: d(-1), direction: "sent", versionLabel: "v3 — our counter", summary: "Held 1× cap; proposed change-in-law cost-share above SAR 2M; conceded 180-day notice.", clausesChanged: [{ clause: "Change in Law", from: "customer bears all cost", to: "shared above SAR 2M threshold" }, { clause: "Termination", from: "TFC after year 5", to: "accepted 180-day notice" }], by: "u3", attachmentName: "ACWA-PPA-v3.docx" },
  ],
  "CTR-1184": [
    { id: "CTR-1184-R1", round: 1, date: d(-11), direction: "sent", versionLabel: "v1 — our draft", summary: "Reseller terms: non-exclusive, quarterly minimum commitments, KSA courts.", clausesChanged: [{ clause: "Exclusivity", from: "—", to: "non-exclusive" }, { clause: "Minimum Revenue", from: "—", to: "quarterly minimums" }], by: "u5", attachmentName: "STC-Reseller-v1.docx" },
    { id: "CTR-1184-R2", round: 2, date: d(-8), direction: "received", versionLabel: "v2 — STC redline", summary: "STC demanded full KSA exclusivity and an annual minimum commitment.", clausesChanged: [{ clause: "Exclusivity", from: "non-exclusive", to: "exclusive — all KSA" }, { clause: "Minimum Revenue", from: "quarterly", to: "annual SAR 12.5M" }], by: "Saudi Telecom Company", attachmentName: "STC-Reseller-v2-redline.docx" },
    { id: "CTR-1184-R3", round: 3, date: d(-5), direction: "sent", versionLabel: "v3 — our counter", summary: "Offered category-only exclusivity; tied minimum to STC-sourced lead volume.", clausesChanged: [{ clause: "Exclusivity", from: "exclusive — all KSA", to: "category-only exclusive" }, { clause: "Minimum Revenue", from: "annual SAR 12.5M", to: "annual, tied to lead volume" }], by: "u5", attachmentName: "STC-Reseller-v3.docx" },
    { id: "CTR-1184-R4", round: 4, date: d(-1), direction: "received", versionLabel: "v4 — STC redline", summary: "STC accepted category exclusivity; pushing DIFC-LCIA arbitration over KSA courts.", clausesChanged: [{ clause: "Governing Law", from: "KSA courts", to: "DIFC-LCIA arbitration" }, { clause: "Minimum Revenue", from: "annual, tied to lead volume", to: "annual with 6-month ramp" }], by: "Saudi Telecom Company", attachmentName: "STC-Reseller-v4-redline.docx" },
  ],
};
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
    { version: "v4.3", date: d(-3), author: "u9", status: "Draft", changelog: "Draft: add AI-tools confidentiality clause; awaiting GC review.", body: "1. The Parties agree to keep Confidential Information secret.\n2. Confidentiality term: three (3) years from disclosure.\n3. Standard mutual carve-outs apply.\n4. Cross-border transfers comply with KSA PDPL safeguards.\n5. Confidential Information must not be input into public AI tools." },
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
    { version: "v2.4", date: d(-160), author: "u8", status: "Retired", changelog: "Updated probation period wording.", body: "1. Governed by the Saudi Labor Law.\n2. Probation: ninety (90) days.\n3. End-of-service benefit per statutory formula." },
    { version: "v2.5", date: d(-20), author: "u8", status: "Approved", changelog: "Aligned to updated Saudi Labor Law; refined end-of-service benefit formula.", body: "1. Governed by the Saudi Labor Law (2025 amendments).\n2. Probation: ninety (90) days.\n3. End-of-service benefit: half-month per year for first 5 years, full-month thereafter." },
    { version: "v2.6", date: d(-2), author: "u8", status: "Draft", changelog: "Draft: add remote-work policy and WPS payroll clause.", body: "1. Governed by the Saudi Labor Law (2025 amendments).\n2. Probation: ninety (90) days.\n3. End-of-service benefit: half-month per year for first 5 years, full-month thereafter.\n4. Salary paid via WPS (Mudad); remote-work eligibility per policy." },
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
export const OFFICE_LOCATIONS = [
  "Riyadh HQ — Legal Vault L3",
  "Riyadh HQ — Cabinet A2",
  "Jeddah Branch — Records Room",
  "Dammam Office — Cabinet B1",
  "Dubai Office — Legal Cabinet A",
  "Lahore HQ — Legal Almirah 2",
  "Karachi Office — Records Room",
  "Islamabad Office — Cabinet C",
  "Group Holding — Riyadh Safe",
];

/* ---------------- Workstream C: group entity portfolio ---------------- */
// The real operating companies, seeded as jurisdiction-tagged entities under a
// Group Holding parent. Counterparties from the earlier sprint stay untouched.
COMPANIES.push(
  { id: "CO-19", name: "Northwind Group Holding", aliases: ["Group Holding", "NGH"], jurisdiction: "Saudi Arabia", type: "Group Entity", jur: "KSA", parentId: null, subdivisionOwner: "Corporate & Governance", note: "Topco for the portfolio — holds the Musataha and JV interests." },
  { id: "CO-20", name: "Zameen.com", aliases: ["Zameen", "Zameen Media (Pvt) Ltd"], jurisdiction: "Pakistan", type: "Group Entity", jur: "PK", parentId: "CO-19", subdivisionOwner: "Real Estate & Conveyancing", note: "PK marketplace + agency; largest plot-purchase and tenancy book." },
  { id: "CO-21", name: "OLX Pakistan", aliases: ["OLX", "OLX PK"], jurisdiction: "Pakistan", type: "Group Entity", jur: "PK", parentId: "CO-19", subdivisionOwner: "Commercial" },
  { id: "CO-22", name: "Bayut", aliases: ["Bayut KSA", "Bayut.sa"], jurisdiction: "Saudi Arabia", type: "Group Entity", jur: "KSA", parentId: "CO-19", subdivisionOwner: "Real Estate & Conveyancing", note: "KSA operating entity — REGA/Ejar regulated brokerage and off-plan sales." },
  { id: "CO-23", name: "Dubizzle", aliases: ["Dubizzle UAE", "dubizzle"], jurisdiction: "UAE", type: "Group Entity", jur: "UAE", parentId: "CO-19", subdivisionOwner: "Commercial", note: "KSA/UAE dual footprint; RERA-registered brokerage in Dubai." },
  { id: "CO-24", name: "Propsults", aliases: ["Propsults Marketing"], jurisdiction: "Pakistan", type: "Group Entity", jur: "PK", parentId: "CO-19", subdivisionOwner: "Commercial", note: "Business-development arm — performance marketing for developers." },
  { id: "CO-25", name: "Propenta", aliases: ["Propenta Developments"], jurisdiction: "Pakistan", type: "Group Entity", jur: "PK", parentId: "CO-19", subdivisionOwner: "Real Estate & Conveyancing", note: "Development arm — co-development JVs and off-plan inventory." },
  // Counterparties / vendors for the KSA + PK real-estate book
  { id: "CO-26", name: "Al-Rajhi Real Estate Development", aliases: ["Al-Rajhi RED"], jurisdiction: "Saudi Arabia", type: "Counterparty", jur: "KSA" },
  { id: "CO-27", name: "Retal Urban Development Co.", aliases: ["Retal"], jurisdiction: "Saudi Arabia", type: "Counterparty", jur: "KSA", riskNote: "Counterparty on the Riyadh North JV and two Ejar leases — check the overlap view before conceding on indemnities." },
  { id: "CO-28", name: "Bahria Town (Pvt) Ltd", aliases: ["Bahria Town"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK" },
  { id: "CO-29", name: "DHA Lahore", aliases: ["Defence Housing Authority Lahore", "DHA"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK" },
  { id: "CO-30", name: "Al-Habib Construction (Pvt) Ltd", aliases: ["Al-Habib"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK" },
  { id: "CO-31", name: "Riyadh Front Development Co.", aliases: ["Riyadh Front"], jurisdiction: "Saudi Arabia", type: "Counterparty", jur: "KSA" },
  { id: "CO-32", name: "Nesma & Partners Contracting", aliases: ["Nesma"], jurisdiction: "Saudi Arabia", type: "Vendor", jur: "KSA" },
  { id: "CO-33", name: "Imarat Group", aliases: ["Imarat"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK" },
  { id: "CO-34", name: "Al-Bilad Capital — Escrow Trustee", aliases: ["Al-Bilad Escrow"], jurisdiction: "Saudi Arabia", type: "Vendor", jur: "KSA", riskNote: "Wafi escrow trustee — release conditions are the exposure on off-plan sales." },
  { id: "CO-35", name: "Diriyah Gate Development Authority", aliases: ["DGDA"], jurisdiction: "Saudi Arabia", type: "Counterparty", jur: "KSA" },
  // Sprint 4 — the two remaining entities the requester portal offers.
  { id: "CO-36", name: "Zameen Media", aliases: ["Zameen Media (Pvt) Ltd", "ZM"], jurisdiction: "Pakistan", type: "Group Entity", jur: "PK", parentId: "CO-19", subdivisionOwner: "Commercial", note: "Media, advertising and creator arm for the PK portals." },
  { id: "CO-37", name: "Z Property Developments", aliases: ["Z Property", "ZPD"], jurisdiction: "Saudi Arabia", type: "Group Entity", jur: "KSA", parentId: "CO-19", subdivisionOwner: "Real Estate & Conveyancing", note: "Development vehicle — PPAs, land, Musataha, construction and JV paper across KSA and PK." },
  // Sprint 6 — Counterparty / Entity Registry entries the org-architecture
  // modules reference (FRD Section 2): each carries its registry roles so
  // lessor / lender / service provider / vendor-payee are selected, never re-typed.
  { id: "CO-38", name: "Systems Ltd", aliases: ["Systems Limited"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK", roles: ["Service Provider", "Vendor/Payee"] },
  { id: "CO-39", name: "Descon Engineering", aliases: ["Descon"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK", roles: ["Contractor", "Vendor/Payee"] },
  { id: "CO-40", name: "RIAA Barker Gillette", aliases: ["RIAA"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK", roles: ["External Counsel", "Vendor/Payee"] },
  { id: "CO-41", name: "Cornelius, Lane & Mufti", aliases: ["CLM"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK", roles: ["External Counsel", "Vendor/Payee"] },
  { id: "CO-42", name: "Habib Bank Limited", aliases: ["HBL"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK", roles: ["Lender"] },
  { id: "CO-43", name: "Meezan Bank", aliases: ["Meezan"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK", roles: ["Lender"] },
  { id: "CO-44", name: "Askari Guards (Pvt) Ltd", aliases: ["Askari Guards"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK", roles: ["Service Provider", "Vendor/Payee"] },
  { id: "CO-45", name: "Crescent Facilities Management", aliases: ["Crescent FM"], jurisdiction: "Saudi Arabia", type: "Vendor", jur: "KSA", roles: ["Service Provider", "Vendor/Payee"] },
  { id: "CO-46", name: "Dar Al Diyar Development", aliases: ["Dar Al Diyar"], jurisdiction: "Saudi Arabia", type: "Counterparty", jur: "KSA", roles: ["Developer"] },
  { id: "CO-47", name: "Skyline Builders", aliases: ["Skyline"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK", roles: ["Developer"] },
  { id: "CO-48", name: "Mega Tower Holdings", aliases: ["MTH"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK", roles: ["Lessor"] },
  { id: "CO-49", name: "Al Mansour Holding", aliases: ["Al Mansour"], jurisdiction: "Saudi Arabia", type: "Counterparty", jur: "KSA", roles: ["JV Partner"] },
  { id: "CO-50", name: "Galaxy Broadcasting Network", aliases: ["GBN"], jurisdiction: "Pakistan", type: "Counterparty", jur: "PK", roles: ["Media Partner"] },
  { id: "CO-51", name: "CityClean Services (Pvt) Ltd", aliases: ["CityClean"], jurisdiction: "Pakistan", type: "Vendor", jur: "PK", roles: ["Service Provider", "Vendor/Payee"] },
);
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
  New: ["Intake", "Triage", "Legal Review", "Drafting", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
  Revision: ["Intake", "Triage", "Legal Review", "Redlining", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
  Extension: ["Intake", "Triage", "Legal Review", "Drafting", "Approval", "Signature", "Executed", "Repository"],
  Draft: ["Intake", "Triage", "Drafting", "Legal Review", "Approval", "Repository"],
  Termination: ["Intake", "Triage", "Legal Review", "Notice Drafting", "Approval", "Notice Served", "Closed"],
  Amendment: ["Intake", "Triage", "Legal Review", "Drafting", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
  Commercial: ["Intake", "Triage", "Commercial Review", "Legal Review", "Negotiation", "Approval", "Signature", "Executed", "Repository"],
};
export const lifecyclePathFor = (requestType) => LIFECYCLE_PATHS[requestType] || LIFECYCLE_PATHS.New;

// Per-stage: who holds the ball by default, entry/exit criteria, and the
// artifacts the stage produces (these become the OUTPUT zone's provenance).
export const STAGE_META = {
  "Intake": { icon: "inbox", ball: "business", role: "Requester", entry: "Request submitted with the mandatory fields", exit: "Mandatory fields complete and supporting documents attached", artifacts: ["Request form", "Attachments"] },
  "Triage": { icon: "filter", ball: "legal", role: "Triage counsel", entry: "Request landed in the department queue", exit: "Category, sub-division, owner and TAT fixed; duplicates checked", artifacts: ["Triage note", "TAT assignment"] },
  "Commercial Review": { icon: "dollar", ball: "business", role: "Commercial owner", entry: "Triaged and routed as a commercial request", exit: "Commercial terms and budget confirmed by the business", artifacts: ["Commercial term sheet"] },
  "Legal Review": { icon: "eye", ball: "legal", role: "Reviewing counsel", entry: "Owner assigned and documents readable", exit: "Risk assessed, playbook deviations logged, position agreed", artifacts: ["Review memo", "Risk assessment"] },
  "Drafting": { icon: "edit", ball: "legal", role: "Drafter", entry: "Position agreed and template version selected", exit: "Draft generated from an approved template version", artifacts: ["Draft agreement"] },
  "Redlining": { icon: "gitbranch", ball: "legal", role: "Drafter", entry: "Counterparty paper or prior version received", exit: "Redlines applied and deviations flagged", artifacts: ["Redlined draft", "Deviation log"] },
  "Notice Drafting": { icon: "edit", ball: "legal", role: "Drafter", entry: "Termination grounds confirmed", exit: "Notice drafted against the contractual notice clause", artifacts: ["Termination notice"] },
  "Negotiation": { icon: "gitbranch", ball: "counterparty", role: "Lead negotiator", entry: "Draft issued to the counterparty", exit: "All open positions closed or escalated", artifacts: ["Negotiation rounds", "Position paper"] },
  "Approval": { icon: "checksquare", ball: "legal", role: "Approver chain", entry: "Final form agreed; risk tier determines the chain", exit: "Every required approver has signed off", artifacts: ["Approval record"] },
  "Signature": { icon: "fileCheck", ball: "counterparty", role: "Signatories", entry: "Approvals complete", exit: "Both counterparts executed and dated", artifacts: ["Executed counterpart"] },
  "Notice Served": { icon: "send", ball: "legal", role: "Owner", entry: "Notice approved", exit: "Notice served and receipt evidenced", artifacts: ["Served notice", "Proof of service"] },
  "Executed": { icon: "check", ball: "legal", role: "Owner", entry: "Executed counterpart received", exit: "Key dates and obligations extracted", artifacts: ["Executed agreement", "Obligation set"] },
  "Repository": { icon: "database", ball: "legal", role: "Contract manager", entry: "Executed document available", exit: "Drive link saved, tracker row created, Sr No mapped to the physical record", artifacts: ["Repository record", "Drive link", "Tracker row", "Physical record ref"] },
  "Closed": { icon: "checkcircle", ball: "legal", role: "Owner", entry: "Outcome delivered", exit: "Matter closed and archived", artifacts: ["Closure note"] },
};
export const stageMeta = (name) => STAGE_META[name] || { icon: "circle", ball: "legal", role: "Owner", entry: "—", exit: "—", artifacts: [] };
export const BALL_LABEL = { legal: "Legal", business: "Business", counterparty: "Counterparty" };

// Workstream H: risk tier drives review depth + the approval chain.
export const RISK_GATES = {
  critical: { reviewers: ["Reviewing counsel", "Legal Director", "Deputy GC"], approvers: ["u3", "u2", "u1"], depth: "Full review — clause-by-clause against the playbook, GC sign-off mandatory." },
  high: { reviewers: ["Reviewing counsel", "Legal Director"], approvers: ["u3", "u1"], depth: "Deep review — all risk clauses plus a written deviation log." },
  medium: { reviewers: ["Reviewing counsel"], approvers: ["u3"], depth: "Standard review — playbook checklist and deviation flags." },
  low: { reviewers: ["Reviewing counsel"], approvers: ["u11"], depth: "Light-touch — template conformity check only." },
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
const KSA_PK_CONTRACTS = [
  // ---- Bayut / Group Holding (KSA) ----
  { id: "CTR-2001", title: "Riyadh Front — Office Floor Purchase (Tower 3, L11–L12)", contractType: "PPA", requestType: "New", counterparty: "Riyadh Front Development Co.", entityId: "CO-22", companyTags: ["CO-22", "CO-31"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "In Negotiation", stage: "Negotiation", risk: "critical", currency: "SAR", value: 42000000, ppaValue: 42000000, landValue: 18500000, landRef: "Deed 310204009871 · Plot 44/B, Riyadh Front", owner: "u10", start: d(-26), expiry: d(3600), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Riyadh HQ — Legal Vault L3", extractionConfidence: 0.94 },
  { id: "CTR-2002", title: "Jeddah Corniche — Retail Podium Purchase", contractType: "PPA", requestType: "New", counterparty: "Al-Rajhi Real Estate Development", entityId: "CO-22", companyTags: ["CO-22", "CO-26"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "Pending Approval", stage: "Approval", risk: "high", currency: "SAR", value: 28400000, ppaValue: 28400000, landValue: 12000000, landRef: "Deed 420117553102 · Plot 12, Corniche District", owner: "u10", start: d(-19), expiry: d(3600), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Jeddah Branch — Records Room", extractionConfidence: 0.91 },
  { id: "CTR-2003", title: "Olaya Tower — Bayut KSA HQ Lease (Floors 12–14)", contractType: "Ejar Lease", requestType: "New", counterparty: "Retal Urban Development Co.", entityId: "CO-22", companyTags: ["CO-22", "CO-27"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "Active", stage: "Active", risk: "medium", currency: "SAR", value: 4600000, landRef: "Ejar contract EJ-2291884", owner: "u10", start: d(-300), expiry: d(58), renewalNoticeDays: 60, autoRenew: false, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.96 },
  { id: "CTR-2004", title: "Dammam Sales Office — Ejar Lease", contractType: "Ejar Lease", requestType: "Extension", counterparty: "Al-Rajhi Real Estate Development", entityId: "CO-22", companyTags: ["CO-22", "CO-26"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "Expiring", stage: "Renewal", risk: "medium", currency: "SAR", value: 980000, landRef: "Ejar contract EJ-2288120", owner: "u10", start: d(-340), expiry: d(22), renewalNoticeDays: 60, autoRenew: true, officeLocation: "Dammam Office — Cabinet B1", extractionConfidence: 0.93 },
  { id: "CTR-2005", title: "Diriyah Plot — 30-Year Musataha Grant", contractType: "Musataha", requestType: "New", counterparty: "Diriyah Gate Development Authority", entityId: "CO-19", companyTags: ["CO-19", "CO-35"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "In Negotiation", stage: "Negotiation", risk: "critical", currency: "SAR", value: 63000000, landValue: 63000000, landRef: "Deed 310990114552 · Musataha parcel D-118", owner: "u3", start: d(-31), expiry: d(10950), renewalNoticeDays: 180, autoRenew: false, officeLocation: "Group Holding — Riyadh Safe", extractionConfidence: 0.88 },
  { id: "CTR-2006", title: "Sedra Phase 4 — Off-plan Units (Wafi Escrow)", contractType: "Off-plan / Wafi", requestType: "New", counterparty: "Al-Bilad Capital — Escrow Trustee", entityId: "CO-22", companyTags: ["CO-22", "CO-34"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Sales", status: "Legal Review", stage: "Legal Review", risk: "high", currency: "SAR", value: 34500000, ppaValue: 34500000, landRef: "Wafi project WF-KSA-4471 · escrow acct 8820-4471", owner: "u10", start: d(-12), expiry: d(1095), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Riyadh HQ — Legal Vault L3", extractionConfidence: 0.86 },
  { id: "CTR-2007", title: "Riyadh North — Co-Development JV (Phase 1)", contractType: "Development / JV", requestType: "New", counterparty: "Retal Urban Development Co.", entityId: "CO-19", companyTags: ["CO-19", "CO-27"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "In Negotiation", stage: "Negotiation", risk: "critical", currency: "SAR", value: 118000000, landValue: 46000000, landRef: "Deed 310556002199 · Parcels N-22 to N-27", owner: "u3", start: d(-38), expiry: d(2555), renewalNoticeDays: 90, autoRenew: false, officeLocation: "Group Holding — Riyadh Safe", extractionConfidence: 0.83 },
  { id: "CTR-2008", title: "REGA Brokerage Mandate — Bayut KSA Listings", contractType: "Brokerage & Agency", requestType: "New", counterparty: "Al-Rajhi Real Estate Development", entityId: "CO-22", companyTags: ["CO-22", "CO-26"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Sales", status: "Active", stage: "Active", risk: "medium", currency: "SAR", value: 2750000, owner: "u10", start: d(-150), expiry: d(215), renewalNoticeDays: 30, autoRenew: true, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.95 },
  { id: "CTR-2009", title: "Bayut KSA HQ — Fit-out Construction Contract", contractType: "Construction", requestType: "New", counterparty: "Nesma & Partners Contracting", entityId: "CO-22", companyTags: ["CO-22", "CO-32"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "Active", stage: "Active", risk: "high", currency: "SAR", value: 8900000, owner: "u10", start: d(-210), expiry: d(120), renewalNoticeDays: 30, autoRenew: false, officeLocation: "Riyadh HQ — Legal Vault L3", extractionConfidence: 0.92 },
  { id: "CTR-2010", title: "Retal — Developer Listing & Marketing Agreement", contractType: "Marketing & Listing", requestType: "Commercial", counterparty: "Retal Urban Development Co.", entityId: "CO-22", companyTags: ["CO-22", "CO-27"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Marketing", status: "Drafting", stage: "Drafting", risk: "medium", currency: "SAR", value: 3400000, owner: "u7", start: d(-9), expiry: d(365), renewalNoticeDays: 30, autoRenew: true, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.90 },
  { id: "CTR-2011", title: "Cloud & Data-Residency MSA — KSA Region", contractType: "Vendor MSA", requestType: "New", counterparty: "Amazon Web Services", entityId: "CO-22", companyTags: ["CO-22", "CO-02"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Technology", dept: "IT", status: "Legal Review", stage: "Legal Review", risk: "high", currency: "SAR", value: 12600000, owner: "u5", start: d(-16), expiry: d(1095), renewalNoticeDays: 60, autoRenew: false, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.89, subdivision: "Data Privacy" },
  { id: "CTR-2012", title: "Ejar Platform API Integration — SLA", contractType: "SLA", requestType: "New", counterparty: "Ejar (REGA) Platform Services", entityId: "CO-22", companyTags: ["CO-22"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Technology", dept: "IT", status: "Active", stage: "Active", risk: "medium", currency: "SAR", value: 620000, owner: "u5", start: d(-120), expiry: d(245), renewalNoticeDays: 30, autoRenew: true, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.94 },
  { id: "CTR-2013", title: "KSA Country Manager — Employment Contract", contractType: "Employment", requestType: "New", counterparty: "Candidate — A. Al-Otaibi", entityId: "CO-22", companyTags: ["CO-22"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Human Resources", status: "Pending Approval", stage: "Approval", risk: "medium", currency: "SAR", value: 1450000, owner: "u8", start: d(-6), expiry: d(730), renewalNoticeDays: 90, autoRenew: false, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.97 },
  { id: "CTR-2014", title: "MoU — Emaar The Economic City Listings Partnership", contractType: "NDA / MoU / LOI", requestType: "Draft", counterparty: "Emaar Properties", entityId: "CO-22", companyTags: ["CO-22", "CO-06"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Sales", status: "Drafting", stage: "Drafting", risk: "low", currency: "SAR", value: null, owner: "u9", start: d(-4), expiry: d(365), renewalNoticeDays: 30, autoRenew: false, officeLocation: "Riyadh HQ — Cabinet A2", extractionConfidence: 0.87 },
  { id: "CTR-2015", title: "Trademark License — 'Bayut' Mark (KSA)", contractType: "License", requestType: "New", counterparty: "Northwind Group Holding", entityId: "CO-22", companyTags: ["CO-22", "CO-19"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Legal", status: "Active", stage: "Active", risk: "low", currency: "SAR", value: 450000, owner: "u8", start: d(-400), expiry: d(330), renewalNoticeDays: 90, autoRenew: true, officeLocation: "Group Holding — Riyadh Safe", extractionConfidence: 0.96, subdivision: "IP" },
  // ---- Dubizzle (UAE) ----
  { id: "CTR-2016", title: "Business Bay — Office SPA (Dubizzle UAE)", contractType: "SPA", requestType: "New", counterparty: "Emaar Properties", entityId: "CO-23", companyTags: ["CO-23", "CO-06"], jur: "UAE", jurisdiction: "UAE", bu: "Real Estate", dept: "Operations", status: "Awaiting Signature", stage: "Signature", risk: "high", currency: "AED", value: 19500000, ppaValue: 19500000, landRef: "DLD title 2024-BB-771204", owner: "u4", start: d(-22), expiry: d(3600), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Dubai Office — Legal Cabinet A", extractionConfidence: 0.93 },
  { id: "CTR-2017", title: "DIFC Office Lease — Dubizzle UAE", contractType: "Tenancy", requestType: "Extension", counterparty: "Emaar Properties", entityId: "CO-23", companyTags: ["CO-23", "CO-06"], jur: "UAE", jurisdiction: "UAE", bu: "Real Estate", dept: "Operations", status: "Expiring", stage: "Renewal", risk: "medium", currency: "AED", value: 3850000, landRef: "Ejari 4471-DIFC-2291", owner: "u4", start: d(-330), expiry: d(41), renewalNoticeDays: 90, autoRenew: false, officeLocation: "Dubai Office — Legal Cabinet A", extractionConfidence: 0.95 },
  { id: "CTR-2018", title: "RERA Broker Agency Agreement — Dubizzle", contractType: "Brokerage & Agency", requestType: "Revision", counterparty: "Emaar Properties", entityId: "CO-23", companyTags: ["CO-23", "CO-06"], jur: "UAE", jurisdiction: "UAE", bu: "Real Estate", dept: "Sales", status: "In Negotiation", stage: "Negotiation", risk: "medium", currency: "AED", value: 2100000, owner: "u4", start: d(-15), expiry: d(365), renewalNoticeDays: 30, autoRenew: true, officeLocation: "Dubai Office — Legal Cabinet A", extractionConfidence: 0.90 },
  // ---- Zameen / OLX / Propenta / Propsults (PK) ----
  { id: "CTR-2019", title: "DHA Phase 8 — Commercial Plot Purchase (Lahore)", contractType: "Land / Plot Purchase", requestType: "New", counterparty: "DHA Lahore", entityId: "CO-20", companyTags: ["CO-20", "CO-29"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Operations", status: "In Negotiation", stage: "Negotiation", risk: "high", currency: "PKR", value: 880000000, ppaValue: 880000000, landValue: 720000000, landRef: "Plot 44-C, Block CCA, DHA Ph-8 · Mutation 1187/22", owner: "u7", start: d(-33), expiry: d(3600), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Lahore HQ — Legal Almirah 2", extractionConfidence: 0.85 },
  { id: "CTR-2020", title: "Bahria Town Karachi — Plot Purchase (Precinct 27)", contractType: "Land / Plot Purchase", requestType: "New", counterparty: "Bahria Town (Pvt) Ltd", entityId: "CO-20", companyTags: ["CO-20", "CO-28"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Operations", status: "Legal Review", stage: "Legal Review", risk: "critical", currency: "PKR", value: 465000000, ppaValue: 465000000, landValue: 402000000, landRef: "Plot 88, Precinct 27, BTK · Allotment BTK-27-0088", owner: "u7", start: d(-24), expiry: d(3600), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Karachi Office — Records Room", extractionConfidence: 0.79 },
  { id: "CTR-2021", title: "Zameen Lahore HQ — Gulberg Tenancy Agreement", contractType: "Tenancy", requestType: "Extension", counterparty: "Imarat Group", entityId: "CO-20", companyTags: ["CO-20", "CO-33"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Operations", status: "Expiring", stage: "Renewal", risk: "medium", currency: "PKR", value: 96000000, landRef: "Tenancy reg. PLRA-LHR-88214 · e-Stamp 55219", owner: "u7", start: d(-320), expiry: d(29), renewalNoticeDays: 60, autoRenew: false, officeLocation: "Lahore HQ — Legal Almirah 2", extractionConfidence: 0.92 },
  { id: "CTR-2022", title: "OLX Pakistan — Karachi Office Tenancy", contractType: "Tenancy", requestType: "New", counterparty: "Bahria Town (Pvt) Ltd", entityId: "CO-21", companyTags: ["CO-21", "CO-28"], jur: "PK", jurisdiction: "Pakistan", bu: "Technology", dept: "Operations", status: "Active", stage: "Active", risk: "low", currency: "PKR", value: 54000000, landRef: "Tenancy reg. SRB-KHI-44120", owner: "u7", start: d(-190), expiry: d(175), renewalNoticeDays: 60, autoRenew: true, officeLocation: "Karachi Office — Records Room", extractionConfidence: 0.94 },
  { id: "CTR-2023", title: "Zameen Islamabad Office — Fit-out Construction", contractType: "Construction", requestType: "New", counterparty: "Al-Habib Construction (Pvt) Ltd", entityId: "CO-20", companyTags: ["CO-20", "CO-30"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Operations", status: "Active", stage: "Active", risk: "medium", currency: "PKR", value: 148000000, owner: "u7", start: d(-160), expiry: d(95), renewalNoticeDays: 30, autoRenew: false, officeLocation: "Islamabad Office — Cabinet C", extractionConfidence: 0.90 },
  { id: "CTR-2024", title: "Imarat Group — Listing & Marketing Agreement", contractType: "Marketing & Listing", requestType: "Commercial", counterparty: "Imarat Group", entityId: "CO-20", companyTags: ["CO-20", "CO-33"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Marketing", status: "Active", stage: "Active", risk: "low", currency: "PKR", value: 72000000, owner: "u9", start: d(-100), expiry: d(265), renewalNoticeDays: 30, autoRenew: true, officeLocation: "Lahore HQ — Legal Almirah 2", extractionConfidence: 0.93 },
  { id: "CTR-2025", title: "Propenta × Imarat — Co-Development Agreement", contractType: "Development / JV", requestType: "New", counterparty: "Imarat Group", entityId: "CO-25", companyTags: ["CO-25", "CO-33"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Operations", status: "Pending Approval", stage: "Approval", risk: "high", currency: "PKR", value: 1250000000, landValue: 540000000, landRef: "Khasra 221/4, Mouza Chak-12 · Mutation 3312/24", owner: "u3", start: d(-42), expiry: d(2555), renewalNoticeDays: 90, autoRenew: false, officeLocation: "Lahore HQ — Legal Almirah 2", extractionConfidence: 0.81 },
  { id: "CTR-2026", title: "Propsults — Performance Marketing MSA", contractType: "Vendor MSA", requestType: "Revision", counterparty: "Meta Platforms", entityId: "CO-24", companyTags: ["CO-24"], jur: "PK", jurisdiction: "Pakistan", bu: "Retail", dept: "Marketing", status: "Drafting", stage: "Drafting", risk: "medium", currency: "PKR", value: 210000000, owner: "u9", start: d(-11), expiry: d(365), renewalNoticeDays: 60, autoRenew: false, officeLocation: "Lahore HQ — Legal Almirah 2", extractionConfidence: 0.88 },
  { id: "CTR-2027", title: "Zameen VP Sales — Employment Contract", contractType: "Employment", requestType: "New", counterparty: "Candidate — H. Raza", entityId: "CO-20", companyTags: ["CO-20"], jur: "PK", jurisdiction: "Pakistan", bu: "Real Estate", dept: "Human Resources", status: "Active", stage: "Active", risk: "low", currency: "PKR", value: 42000000, owner: "u8", start: d(-70), expiry: d(660), renewalNoticeDays: 90, autoRenew: false, officeLocation: "Lahore HQ — Legal Almirah 2", extractionConfidence: 0.96 },
  { id: "CTR-2028", title: "OLX PK — Asset Transfer & Share Purchase (Classifieds)", contractType: "SPA", requestType: "New", counterparty: "Northwind Group Holding", entityId: "CO-21", companyTags: ["CO-21", "CO-19"], jur: "PK", jurisdiction: "Pakistan", bu: "Financial Services", dept: "Finance", status: "Legal Review", stage: "Legal Review", risk: "critical", currency: "PKR", value: 3400000000, ppaValue: 3400000000, owner: "u4", start: d(-28), expiry: d(1825), renewalNoticeDays: 0, autoRenew: false, officeLocation: "Group Holding — Riyadh Safe", extractionConfidence: 0.84, subdivision: "Corporate & Governance" },
  // ---- Child record: amendment attached to a pre-existing construction contract ----
  { id: "CTR-2029", title: "Bayut KSA Fit-out — Variation Order No.2 (Amendment)", contractType: "Construction", requestType: "Amendment", counterparty: "Nesma & Partners Contracting", entityId: "CO-22", companyTags: ["CO-22", "CO-32"], jur: "KSA", jurisdiction: "Saudi Arabia", bu: "Real Estate", dept: "Operations", status: "Legal Review", stage: "Legal Review", risk: "high", currency: "SAR", value: 1650000, owner: "u10", start: d(-7), expiry: d(120), renewalNoticeDays: 30, autoRenew: false, officeLocation: "Riyadh HQ — Legal Vault L3", extractionConfidence: 0.90, parentContractId: "CTR-2009" },
];
KSA_PK_CONTRACTS.forEach((c) => CONTRACTS.push(c));

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
      { userId: "u11", level: "view" },
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
  "CTR-2017": [{ text: "Serve Ejari renewal notice (90 days)", dueDays: -6, owner: "u4", basis: "Clause 3.3" }],
  "CTR-2021": [{ text: "Pay e-Stamp duty on the renewed tenancy", dueDays: 9, owner: "u7", basis: "PLRA e-Stamp rules" }],
  "CTR-2019": [{ text: "Complete DHA transfer & mutation in the revenue record", dueDays: 40, owner: "u7", basis: "Clause 7 — transfer" }],
  "CTR-2025": [{ text: "Register the JV with SECP and file Form-A", dueDays: 30, owner: "u4", basis: "SECP filing" }],
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
export const REPOSITORY = [
  { id: "DOC-001", name: "Riyadh Front PPA — executed counterpart.pdf", kind: "Contract", source: "Upload", contractId: "CTR-2001", entityId: "CO-22", contractType: "PPA", jur: "KSA", uploadedBy: "u10", uploadedAt: d(-24), pages: 42, sizeKb: 3180, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.94, srNo: 4001, physicalRecordRef: "PR-4001", officeLocation: "Riyadh HQ — Legal Vault L3", storagePath: "/legal/KSA/ppa/CTR-2001.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2001/view", ocrText: "PROPERTY PURCHASE AGREEMENT dated 12 Rajab 1447 between RIYADH FRONT DEVELOPMENT CO. (Seller) and BAYUT (Purchaser). Property: Tower 3, Levels 11-12, Riyadh Front, Riyadh, KSA. Title Deed No. 310204009871, Plot 44/B. Total purchase consideration SAR 42,000,000 of which the land component is SAR 18,500,000. Governing law: the laws of the Kingdom of Saudi Arabia. Completion within 180 days of the effective date. Termination for convenience is not permitted after handover." },
  { id: "DOC-002", name: "Jeddah Corniche PPA — signed deed pack.pdf", kind: "Deed", source: "Scan", contractId: "CTR-2002", entityId: "CO-22", contractType: "PPA", jur: "KSA", uploadedBy: "u10", uploadedAt: d(-18), pages: 28, sizeKb: 5210, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.91, srNo: 4002, physicalRecordRef: "PR-4002", officeLocation: "Jeddah Branch — Records Room", storagePath: "/legal/KSA/ppa/CTR-2002.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2002/view", ocrText: "PROPERTY PURCHASE AGREEMENT between AL-RAJHI REAL ESTATE DEVELOPMENT (Seller) and BAYUT (Purchaser) for the retail podium, Plot 12, Corniche District, Jeddah. Title Deed No. 420117553102. Purchase price SAR 28,400,000; land value SAR 12,000,000. Governing law: laws of the Kingdom of Saudi Arabia. Notice period for termination: 30 days." },
  { id: "DOC-003", name: "Olaya Tower lease — Ejar certificate.pdf", kind: "Lease", source: "Upload", contractId: "CTR-2003", entityId: "CO-22", contractType: "Ejar Lease", jur: "KSA", uploadedBy: "u10", uploadedAt: d(-298), pages: 12, sizeKb: 820, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.96, srNo: 4003, physicalRecordRef: "PR-4003", officeLocation: "Riyadh HQ — Cabinet A2", storagePath: "/legal/KSA/ejar-lease/CTR-2003.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2003/view", ocrText: "EJAR LEASE CONTRACT EJ-2291884. Lessor: RETAL URBAN DEVELOPMENT CO. Lessee: BAYUT. Premises: Olaya Tower Floors 12-14, Riyadh. Annual rent SAR 4,600,000. Term 12 months renewable. Notice of renewal or non-renewal: 60 days before expiry. Registered on the Ejar platform per REGA requirements." },
  { id: "DOC-004", name: "Diriyah Musataha grant — draft v3.pdf", kind: "Contract", source: "Upload", contractId: "CTR-2005", entityId: "CO-19", contractType: "Musataha", jur: "KSA", uploadedBy: "u3", uploadedAt: d(-9), pages: 64, sizeKb: 4400, stage: "Extraction", ocrStatus: "Complete", ocrConfidence: 0.88, srNo: 4004, physicalRecordRef: "PR-4004", officeLocation: "Group Holding — Riyadh Safe", storagePath: "/legal/KSA/musataha/CTR-2005.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2005/view", ocrText: "MUSATAHA AGREEMENT between DIRIYAH GATE DEVELOPMENT AUTHORITY (Grantor) and NORTHWIND GROUP HOLDING (Musataha Holder). Parcel D-118, Title Deed 310990114552. Term: thirty (30) years from the effective date. Consideration SAR 63,000,000 representing the land right. Grantor consent required for assignment. Notice period 180 days. Governing law: laws of the Kingdom of Saudi Arabia." },
  { id: "DOC-005", name: "Sedra Phase 4 — Wafi escrow agreement.pdf", kind: "Contract", source: "Upload", contractId: "CTR-2006", entityId: "CO-22", contractType: "Off-plan / Wafi", jur: "KSA", uploadedBy: "u10", uploadedAt: d(-11), pages: 36, sizeKb: 2640, stage: "Extraction", ocrStatus: "Complete", ocrConfidence: 0.86, srNo: 4005, physicalRecordRef: "PR-4005", officeLocation: "Riyadh HQ — Legal Vault L3", storagePath: "/legal/KSA/off-plan-wafi/CTR-2006.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2006/view", ocrText: "OFF-PLAN SALES ESCROW AGREEMENT under the Wafi programme, project WF-KSA-4471. Escrow trustee: AL-BILAD CAPITAL. Developer proceeds SAR 34,500,000 held in escrow account 8820-4471. Releases are tied to certified construction milestones. REGA off-plan sales permit required before marketing. Governing law: laws of the Kingdom of Saudi Arabia." },
  { id: "DOC-006", name: "DHA Phase 8 plot — allotment + mutation.pdf", kind: "Deed", source: "Scan", contractId: "CTR-2019", entityId: "CO-20", contractType: "Land / Plot Purchase", jur: "PK", uploadedBy: "u7", uploadedAt: d(-30), pages: 22, sizeKb: 6100, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.85, srNo: 4006, physicalRecordRef: "PR-4006", officeLocation: "Lahore HQ — Legal Almirah 2", storagePath: "/legal/PK/land-plot-purchase/CTR-2019.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2019/view", ocrText: "AGREEMENT TO SELL for Plot No. 44-C, Block CCA, DHA Phase 8, Lahore. Seller: DHA LAHORE. Purchaser: ZAMEEN MEDIA (PVT) LTD. Total sale consideration PKR 880,000,000 of which land value is PKR 720,000,000. Mutation No. 1187/22 in the revenue record. Stamp duty and CVT payable by the purchaser. Possession on full payment. Governing law: laws of Pakistan; disputes referred to arbitration at Lahore." },
  { id: "DOC-007", name: "Bahria Town Karachi — allotment letter (scan).pdf", kind: "Deed", source: "Scan", contractId: "CTR-2020", entityId: "CO-20", contractType: "Land / Plot Purchase", jur: "PK", uploadedBy: "u7", uploadedAt: d(-22), pages: 8, sizeKb: 4820, stage: "Extraction", ocrStatus: "Low confidence", ocrConfidence: 0.79, srNo: 4007, physicalRecordRef: "PR-4007", officeLocation: "Karachi Office — Records Room", storagePath: "/legal/PK/land-plot-purchase/CTR-2020.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2020/view", ocrText: "ALLOTMENT BTK-27-0088. Plot 88, Precinct 27, Bahria Town Karachi. Allottee: ZAMEEN MEDIA (PVT) LTD. Consideration PKR 465,000,000; land value PKR 402,000,000. Transfer subject to NOC and clearance of development charges. Governing law: laws of Pakistan. [Scan quality poor on pages 4-6 — values require manual confirmation.]" },
  { id: "DOC-008", name: "Zameen Gulberg HQ — tenancy + e-Stamp.pdf", kind: "Lease", source: "Upload", contractId: "CTR-2021", entityId: "CO-20", contractType: "Tenancy", jur: "PK", uploadedBy: "u7", uploadedAt: d(-316), pages: 14, sizeKb: 980, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.92, srNo: 4008, physicalRecordRef: "PR-4008", officeLocation: "Lahore HQ — Legal Almirah 2", storagePath: "/legal/PK/tenancy/CTR-2021.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2021/view", ocrText: "TENANCY AGREEMENT registered PLRA-LHR-88214, e-Stamp 55219. Landlord: IMARAT GROUP. Tenant: ZAMEEN MEDIA (PVT) LTD. Premises: Gulberg III, Lahore. Annual rent PKR 96,000,000 with 10% yearly escalation. Term 12 months. Notice for renewal: 60 days. Governing law: laws of Pakistan." },
  { id: "DOC-009", name: "Propenta × Imarat co-development — execution draft.pdf", kind: "Contract", source: "Upload", contractId: "CTR-2025", entityId: "CO-25", contractType: "Development / JV", jur: "PK", uploadedBy: "u3", uploadedAt: d(-14), pages: 88, sizeKb: 7200, stage: "Extraction", ocrStatus: "Complete", ocrConfidence: 0.81, srNo: 4009, physicalRecordRef: "PR-4009", officeLocation: "Lahore HQ — Legal Almirah 2", storagePath: "/legal/PK/development-jv/CTR-2025.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2025/view", ocrText: "CO-DEVELOPMENT AGREEMENT between PROPENTA and IMARAT GROUP. Land contributed: Khasra 221/4, Mouza Chak-12, Mutation 3312/24, valued at PKR 540,000,000. Total project value PKR 1,250,000,000. Revenue share 55:45. SECP registration and Form-A filing required within 30 days. Notice period 90 days. Governing law: laws of Pakistan." },
  { id: "DOC-010", name: "Business Bay office SPA — DLD title pack.pdf", kind: "Deed", source: "Upload", contractId: "CTR-2016", entityId: "CO-23", contractType: "SPA", jur: "UAE", uploadedBy: "u4", uploadedAt: d(-20), pages: 31, sizeKb: 2980, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.93, srNo: 4010, physicalRecordRef: "PR-4010", officeLocation: "Dubai Office — Legal Cabinet A", storagePath: "/legal/UAE/spa/CTR-2016.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2016/view", ocrText: "SALE AND PURCHASE AGREEMENT. Seller: EMAAR PROPERTIES. Purchaser: DUBIZZLE. Unit: office floor, Business Bay, Dubai. DLD title 2024-BB-771204. Purchase price AED 19,500,000. Transfer fee 4% payable to the Dubai Land Department. Governing law: laws of the UAE; Dubai Courts have jurisdiction." },
  { id: "DOC-011", name: "Nesma fit-out — Variation Order No.2.pdf", kind: "Amendment", source: "Upload", contractId: "CTR-2029", entityId: "CO-22", contractType: "Construction", jur: "KSA", uploadedBy: "u10", uploadedAt: d(-6), pages: 9, sizeKb: 640, stage: "Extraction", ocrStatus: "Complete", ocrConfidence: 0.90, srNo: 4011, physicalRecordRef: "PR-4011", officeLocation: "Riyadh HQ — Legal Vault L3", storagePath: "/legal/KSA/construction/CTR-2029.pdf", driveLink: "https://drive.google.com/file/d/legalos-ctr-2029/view", ocrText: "VARIATION ORDER NO. 2 to the fit-out construction contract dated between BAYUT and NESMA & PARTNERS CONTRACTING. Additional works value SAR 1,650,000. Time extension 45 days. All other terms of the principal contract remain unchanged. Performance bond to be increased pro rata." },
  { id: "DOC-012", name: "REGA brokerage license — renewal certificate.pdf", kind: "License", source: "Scan", contractId: null, licenseId: "LIC-001", entityId: "CO-22", contractType: null, jur: "KSA", uploadedBy: "u10", uploadedAt: d(-40), pages: 4, sizeKb: 410, stage: "Repository", ocrStatus: "Complete", ocrConfidence: 0.95, srNo: 4012, physicalRecordRef: "PR-4012", officeLocation: "Riyadh HQ — Cabinet A2", storagePath: "/legal/KSA/licenses/LIC-001.pdf", driveLink: "https://drive.google.com/file/d/legalos-lic-001/view", ocrText: "REAL ESTATE GENERAL AUTHORITY (REGA) — FAL BROKERAGE LICENSE REGA-BRK-4471 issued to BAYUT. Activity: real estate brokerage and property marketing across the Kingdom. Valid for 12 months from issuance. Renewal application must be filed 90 days before expiry." },
];
// Every repository doc carries the same operational contract as a tracker row.
REPOSITORY.forEach((r) => {
  if (r.extractedFields === undefined) r.extractedFields = extractFromOcr(r.ocrText, r);
  if (r.access === undefined) r.access = [{ userId: r.uploadedBy, level: "edit" }, { userId: "u1", level: "comment" }, { userId: "u11", level: "view" }];
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
LICENSES.push(
  { id: "LIC-015", name: "REGA Off-plan Sales Permit (Wafi)", type: "Off-plan Sales Permit", entity: "Bayut", authority: "Real Estate General Authority (REGA)", jurisdiction: "KSA", licenseNumber: "WAFI-PRM-4471-04", issueDate: d(-150), expiryDate: d(56), renewalLeadDays: 90, owner: "u10", linkedContractId: "CTR-2006", linkedMatterId: null, companyTags: ["CO-22"], notes: "Required before marketing Sedra Phase 4 off-plan inventory.", renewalHistory: [] },
  { id: "LIC-016", name: "REGA Property Management License", type: "Property Management", entity: "Bayut", authority: "Real Estate General Authority (REGA)", jurisdiction: "KSA", licenseNumber: "REGA-PM-4471", issueDate: d(-260), expiryDate: d(105), renewalLeadDays: 90, owner: "u10", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-22"], notes: "Covers managed-listing and property-management services.", renewalHistory: [] },
  { id: "LIC-017", name: "Trakheesi Advertising Permit", type: "Advertising Permit", entity: "Dubizzle", authority: "Dubai Land Department (Trakheesi)", jurisdiction: "UAE", licenseNumber: "TRK-DXB-77120", issueDate: d(-200), expiryDate: d(18), renewalLeadDays: 60, owner: "u4", linkedContractId: "CTR-2018", linkedMatterId: null, companyTags: ["CO-23"], notes: "Per-listing advertising permits depend on this master registration.", renewalHistory: [] },
  { id: "LIC-018", name: "FBR National Tax Number (NTN)", type: "Tax Registration", entity: "Zameen.com", authority: "Federal Board of Revenue (FBR)", jurisdiction: "PK", licenseNumber: "NTN-4471021-8", issueDate: d(-900), expiryDate: d(420), renewalLeadDays: 90, owner: "u7", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-20"], notes: "Sales-tax and withholding registration for the PK entities.", renewalHistory: [] },
  { id: "LIC-019", name: "Punjab Revenue Authority Registration", type: "Sales Tax Registration", entity: "Zameen.com", authority: "Punjab Revenue Authority (PRA)", jurisdiction: "PK", licenseNumber: "PRA-LHR-119224", issueDate: d(-420), expiryDate: d(-8), renewalLeadDays: 60, owner: "u7", linkedContractId: null, linkedMatterId: null, companyTags: ["CO-20"], notes: "LAPSED — services sales-tax registration renewal overdue.", renewalHistory: [] },
  { id: "LIC-020", name: "Trademark — 'Bayut' (SAIP)", type: "Trademark", entity: "Bayut", authority: "Saudi Authority for Intellectual Property (SAIP)", jurisdiction: "KSA", licenseNumber: "SAIP-TM-55120", issueDate: d(-600), expiryDate: d(680), renewalLeadDays: 120, owner: "u8", linkedContractId: "CTR-2015", linkedMatterId: null, companyTags: ["CO-22"], notes: "Classes 35, 36 & 42; licensed to the operating entity.", renewalHistory: [] },
);
// Re-point the earlier KSA/PK/UAE licenses at the real operating entities so the
// entity drill-down and the analyzer's licence rollup are populated.
const LICENSE_RETAG = {
  "LIC-001": { entity: "Bayut", companyTags: ["CO-22"] },
  "LIC-002": { entity: "Dubizzle", companyTags: ["CO-23"] },
  "LIC-003": { entity: "Bayut", companyTags: ["CO-22"] },
  "LIC-004": { entity: "Bayut", companyTags: ["CO-22"] },
  "LIC-005": { entity: "Bayut", companyTags: ["CO-22"] },
  "LIC-006": { entity: "Northwind Group Holding", companyTags: ["CO-19"] },
  "LIC-007": { entity: "Bayut", companyTags: ["CO-22"] },
  "LIC-008": { entity: "Zameen.com", companyTags: ["CO-20"] },
  "LIC-009": { entity: "Zameen.com", companyTags: ["CO-20"] },
  "LIC-010": { entity: "Propsults", companyTags: ["CO-24"] },
  "LIC-011": { entity: "Northwind Group Holding", companyTags: ["CO-19"] },
  "LIC-012": { entity: "OLX Pakistan", companyTags: ["CO-21"] },
  "LIC-013": { entity: "Bayut", companyTags: ["CO-22"] },
  "LIC-014": { entity: "Dubizzle", companyTags: ["CO-23"] },
};
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
export const PORTAL_COMPANIES = [
  { key: "ZD", label: "Zameen.com (ZD)", entityId: "CO-20", enabled: true },
  { key: "OLX", label: "OLX", entityId: "CO-21", enabled: true },
  { key: "ZM", label: "Zameen Media", entityId: "CO-36", enabled: true },
  { key: "BAYUT-KSA", label: "Bayut KSA", entityId: "CO-22", enabled: true },
  { key: "DUBIZZLE-KSA", label: "Dubizzle KSA", entityId: "CO-23", enabled: true },
  { key: "ZPD", label: "Z Property Developments", entityId: "CO-37", enabled: true },
];

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
  "Compliance": { subdivision: "Compliance & Regulatory", owner: "u21", tatDays: 5, note: "Hassan Ali — Legal Associate · Compliance." },
  "Disputes & Litigation": { subdivision: "Litigation & Disputes", owner: "u6", tatDays: 2, note: "David Okonkwo — Senior Manager · Litigation." },
  "Labour Matters": { subdivision: "Labour/Employment", owner: "u17", tatDays: 3, note: "Ahmed Raza — Senior Associate · Litigation (labour matters)." },
  "Intellectual Property": { subdivision: "IP", owner: "u17", tatDays: 5, note: "Ahmed Raza — Senior Associate · Litigation (IP desk)." },
};

// Fields the wizard marks mandatory, per nature.
export const REQUIRED_FIELDS = {
  "Contracts": ["title", "company", "contractType", "requestType", "description"],
  default: ["title", "description"],
};

export const FORM_CONFIG = {
  version: 1,
  branding: {
    name: "Northwind Legal Requests",
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
export const PORTAL_SOURCES = [
  "Zameen.com — Lahore HQ",
  "Zameen.com — Karachi",
  "Zameen.com — Islamabad",
  "OLX — Karachi",
  "Zameen Media — Lahore",
  "Bayut — Riyadh HQ",
  "Bayut — Jeddah",
  "Dubizzle — Dubai",
  "Z Property Developments — Riyadh",
  "Group Holding — Riyadh",
];

/* ---------------- Sprint 4: seed requesters + a demo portal thread ---------------- */
export const REQUESTERS = [
  { id: "RQ-001", email: "james.whitfield@northwind.com", name: "James Whitfield", userId: "u13", company: "BAYUT-KSA", source: "Bayut — Riyadh HQ", department: "Procurement", unit: "Real Estate", createdAt: d(-120) },
  { id: "RQ-002", email: "ravi.menon@northwind.com", name: "Ravi Menon", userId: "u15", company: "ZD", source: "Zameen.com — Lahore HQ", department: "Sales", unit: "Real Estate", createdAt: d(-90) },
  { id: "RQ-003", email: "fatima.alsayed@northwind.com", name: "Fatima Al-Sayed", userId: "u14", company: "BAYUT-KSA", source: "Bayut — Riyadh HQ", department: "Human Resources", unit: "Real Estate", createdAt: d(-70) },
  { id: "RQ-004", email: "klaus.werner@northwind.com", name: "Klaus Werner", userId: "u16", company: "ZPD", source: "Z Property Developments — Riyadh", department: "Finance", unit: "Financial Services", createdAt: d(-60) },
];

// A live two-way thread on the delayed JV revision, so the bridge demos on load.
export const MESSAGES = [
  { id: "MSG-001", requestId: "REQ-2050", from: "u15", role: "requester", text: "Submitting the indemnity revision — Retal came back asking for joint-and-several across both phases. Can we hold the line at phase 1 only?", at: d(-20), readBy: ["u15", "u3"], attachments: [] },
  { id: "MSG-002", requestId: "REQ-2050", from: "u3", role: "legal", text: "Reviewing now. Joint-and-several across both phases is off-playbook — we'd be carrying phase-2 exposure before the land is even contributed. I'll draft a phase-limited alternative.", at: d(-18), readBy: ["u3", "u15"], attachments: [] },
  { id: "MSG-003", requestId: "REQ-2050", from: "u3", role: "legal", text: "To finish this I need the phase-2 land contribution confirmed by the business — that's what's holding the file. Could you upload the signed contribution schedule?", at: d(-9), readBy: ["u3"], attachments: [] },
  { id: "MSG-004", requestId: "REQ-2051", from: "u15", role: "requester", text: "The Bahria allotment scan is poor on pages 4–6. I've asked their office for a certified copy.", at: d(-6), readBy: ["u15"], attachments: [] },
];

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
REQUESTS.push(
  { id: "REQ-2050", title: "Riyadh North JV — indemnity package revision", type: "Partnership Agreement", requestType: "Revision", contractType: "Development / JV", status: "In Review", stage: "Legal Review", bu: "Real Estate", dept: "Operations", unit: "Real Estate", department: "Operations", country: "Saudi Arabia", entityId: "CO-19", companyTags: ["CO-19", "CO-27"], category: "Real Estate & Leasing", subdivision: "Real Estate & Conveyancing", priority: "Urgent", risk: "critical", riskPreliminary: "high", value: 118000000, currency: "SAR", counterparty: "Retal Urban Development Co.", owner: "u3", requester: "u15", requesterId: "u15", due: d(-3), requestDate: d(-21), created: d(-21), linkedContractId: "CTR-2007", source: "internal", aiSummary: "Retal pushed a joint-and-several indemnity across both JV phases. Legal Review has held the file for 9 working days waiting on the business to confirm the phase-2 land contribution." },
  { id: "REQ-2051", title: "Bahria Town Karachi plot — title diligence & mutation", type: "Lease Agreement", requestType: "New", contractType: "Land / Plot Purchase", status: "In Review", stage: "Legal Review", bu: "Real Estate", dept: "Operations", unit: "Real Estate", department: "Operations", country: "Pakistan", entityId: "CO-20", companyTags: ["CO-20", "CO-28"], category: "Real Estate & Leasing", subdivision: "Real Estate & Conveyancing", priority: "High", risk: "critical", riskPreliminary: "high", value: 465000000, currency: "PKR", counterparty: "Bahria Town (Pvt) Ltd", owner: "u7", requester: "u15", requesterId: "u15", due: d(-1), requestDate: d(-24), created: d(-24), linkedContractId: "CTR-2020", source: "internal", aiSummary: "Allotment scan is low-confidence on pages 4–6; the development-charges NOC is still outstanding with the counterparty." },
  { id: "REQ-2052", title: "Dammam sales office — Ejar lease extension", type: "Contract Renewal", requestType: "Extension", contractType: "Ejar Lease", status: "Pending Approval", stage: "Approval", bu: "Real Estate", dept: "Operations", unit: "Real Estate", department: "Operations", country: "Saudi Arabia", entityId: "CO-22", companyTags: ["CO-22", "CO-26"], category: "Real Estate & Leasing", subdivision: "Real Estate & Conveyancing", priority: "High", risk: "medium", riskPreliminary: "low", value: 980000, currency: "SAR", counterparty: "Al-Rajhi Real Estate Development", owner: "u10", requester: "u15", requesterId: "u15", due: d(2), requestDate: d(-9), created: d(-9), linkedContractId: "CTR-2004", source: "internal", aiSummary: "Auto-renewal fires in 22 days. Escalation cap needs confirming before the notice window closes." },
  { id: "REQ-2053", title: "Nesma fit-out — Variation Order No.2 (amendment)", type: "Contract Amendment", requestType: "Amendment", contractType: "Construction", status: "In Review", stage: "Legal Review", bu: "Real Estate", dept: "Operations", unit: "Real Estate", department: "Operations", country: "Saudi Arabia", entityId: "CO-22", companyTags: ["CO-22", "CO-32"], category: "Commercial Contracts", subdivision: "Commercial", priority: "High", risk: "high", riskPreliminary: "medium", value: 1650000, currency: "SAR", counterparty: "Nesma & Partners Contracting", owner: "u10", requester: "u13", requesterId: "u13", due: d(1), requestDate: d(-7), created: d(-7), linkedContractId: "CTR-2009", source: "internal", aiSummary: "Variation attaches to the principal fit-out contract; the performance bond must be increased pro rata before sign-off." },
  { id: "REQ-2054", title: "Trakheesi advertising permit — renewal support", type: "Government Approval", requestType: "New", contractType: null, status: "Triage", stage: "Triage", bu: "Real Estate", dept: "Marketing", unit: "Real Estate", department: "Marketing", country: "UAE", entityId: "CO-23", companyTags: ["CO-23"], category: "Admin Contracts", subdivision: "Compliance & Regulatory", priority: "Urgent", risk: "high", riskPreliminary: "high", value: null, currency: "AED", counterparty: "Dubai Land Department", owner: "u4", requester: "u15", requesterId: "u15", due: d(4), requestDate: d(-2), created: d(-2), linkedContractId: null, source: "portal", aiSummary: "Master Trakheesi registration expires in 18 days — every per-listing advertising permit depends on it." },
  { id: "REQ-2055", title: "Propsults performance-marketing MSA — revision", type: "Procurement Review", requestType: "Revision", contractType: "Vendor MSA", status: "Drafting", stage: "Drafting", bu: "Retail", dept: "Marketing", unit: "Retail", department: "Marketing", country: "Pakistan", entityId: "CO-24", companyTags: ["CO-24"], category: "Commercial Contracts", subdivision: "Commercial", priority: "Medium", risk: "medium", riskPreliminary: "medium", value: 210000000, currency: "PKR", counterparty: "Meta Platforms", owner: "u9", requester: "u15", requesterId: "u15", due: d(6), requestDate: d(-11), created: d(-11), linkedContractId: "CTR-2026", source: "internal", aiSummary: "Rate-card revision plus a data-sharing addendum; needs a Data Privacy sign-off before drafting closes." },
  { id: "REQ-2056", title: "PRA sales-tax registration — lapsed, reinstatement", type: "Compliance Review", requestType: "New", contractType: null, status: "New", stage: "Intake", bu: "Real Estate", dept: "Finance", unit: "Real Estate", department: "Finance", country: "Pakistan", entityId: "CO-20", companyTags: ["CO-20"], category: "Compliance", subdivision: "Compliance & Regulatory", priority: "Urgent", risk: "high", riskPreliminary: "high", value: null, currency: "PKR", counterparty: "Punjab Revenue Authority", owner: "u7", requester: "u16", requesterId: "u16", due: d(3), requestDate: d(0), created: d(0), linkedContractId: null, source: "portal", aiSummary: "PRA registration lapsed 8 days ago — invoicing exposure until reinstated." },
  { id: "REQ-2057", title: "Olaya Tower HQ lease — non-renewal notice", type: "Contract Amendment", requestType: "Termination", contractType: "Ejar Lease", status: "In Review", stage: "Notice Drafting", bu: "Real Estate", dept: "Operations", unit: "Real Estate", department: "Operations", country: "Saudi Arabia", entityId: "CO-22", companyTags: ["CO-22", "CO-27"], category: "Real Estate & Leasing", subdivision: "Real Estate & Conveyancing", priority: "Urgent", risk: "high", riskPreliminary: "medium", value: 4600000, currency: "SAR", counterparty: "Retal Urban Development Co.", owner: "u10", requester: "u15", requesterId: "u15", due: d(-2), requestDate: d(-12), created: d(-12), linkedContractId: "CTR-2003", source: "internal", aiSummary: "The 60-day notice window closed 2 days ago. Notice drafting is the blocking stage — escalate today or the lease rolls." },
);

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
const REQUIRED_DOC_SEED = {
  "REQ-2050": [
    { name: "Signed phase-2 land contribution schedule", status: "requested", requestedBy: "u3", requestedAt: d(-9) },
    { name: "Board resolution approving the JV indemnity", status: "received", requestedBy: "u3", requestedAt: d(-16), receivedAt: d(-14) },
  ],
  "REQ-2051": [
    { name: "Certified copy of the Bahria allotment (pages 4–6)", status: "requested", requestedBy: "u7", requestedAt: d(-6) },
    { name: "Development-charges NOC", status: "requested", requestedBy: "u7", requestedAt: d(-4) },
  ],
  "REQ-2054": [
    { name: "Current Trakheesi registration certificate", status: "received", requestedBy: "u4", requestedAt: d(-2), receivedAt: d(-1) },
  ],
};
Object.keys(REQUIRED_DOC_SEED).forEach((id) => {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r) return;
  r.requiredDocs = REQUIRED_DOC_SEED[id].map((doc, i) => ({ id: `${id}-RD${i + 1}`, docId: null, ...doc }));
});
// Requests that arrived through the portal carry their origin: which site the
// requester raised it from. The portal has been live for a while, so most recent
// work came through it while the older records predate it and still read
// "internal" — that mix is what makes the adoption figure honest.
const PORTAL_ORIGIN = {
  "REQ-2050": { requesterId: "u15", source: "Z Property Developments — Riyadh" },
  "REQ-2051": { requesterId: "u15", source: "Zameen.com — Lahore HQ" },
  "REQ-2052": { requesterId: "u15", source: "Bayut — Jeddah" },
  "REQ-2053": { requesterId: "u13", source: "Bayut — Riyadh HQ" },
  "REQ-2054": { requesterId: "u15", source: "Dubizzle — Dubai" },
  "REQ-2055": { requesterId: "u15", source: "Zameen Media — Lahore" },
  "REQ-2056": { requesterId: "u16", source: "Zameen.com — Lahore HQ" },
  "REQ-2057": { requesterId: "u15", source: "Bayut — Riyadh HQ" },
  "REQ-2041": { requesterId: "u13", source: "Bayut — Riyadh HQ" },
  "REQ-2039": { requesterId: "u13", source: "Bayut — Riyadh HQ" },
  "REQ-2036": { requesterId: "u15", source: "Zameen Media — Lahore" },
  "REQ-2034": { requesterId: "u15", source: "Dubizzle — Dubai" },
};
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
