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

export const USERS = [
  { id: "u1", name: "Layla Al-Rashid", role: "General Counsel", team: "Executive", email: "layla.alrashid@northwind.com", country: "Saudi Arabia" },
  { id: "u2", name: "Marcus Feld", role: "Deputy General Counsel", team: "Executive", email: "marcus.feld@northwind.com", country: "United Kingdom" },
  { id: "u3", name: "Priya Nair", role: "Legal Director — Commercial", team: "Commercial", email: "priya.nair@northwind.com", country: "Singapore" },
  { id: "u4", name: "Omar Haddad", role: "Legal Director — Corporate", team: "Corporate", email: "omar.haddad@northwind.com", country: "UAE" },
  { id: "u5", name: "Sarah Chen", role: "Senior Counsel", team: "Commercial", email: "sarah.chen@northwind.com", country: "Singapore" },
  { id: "u6", name: "David Okonkwo", role: "Senior Counsel", team: "Litigation", email: "david.okonkwo@northwind.com", country: "United States" },
  { id: "u7", name: "Aisha Bukhari", role: "Counsel", team: "Commercial", email: "aisha.bukhari@northwind.com", country: "Pakistan" },
  { id: "u8", name: "Tom Bennett", role: "Counsel", team: "Corporate", email: "tom.bennett@northwind.com", country: "United Kingdom" },
  { id: "u9", name: "Elena Popova", role: "Junior Counsel", team: "Commercial", email: "elena.popova@northwind.com", country: "United Kingdom" },
  { id: "u10", name: "Yousef Nasser", role: "Paralegal", team: "Commercial", email: "yousef.nasser@northwind.com", country: "Saudi Arabia" },
  { id: "u11", name: "Grace Liu", role: "Contract Manager", team: "Operations", email: "grace.liu@northwind.com", country: "Singapore" },
  { id: "u12", name: "Rania Fadel", role: "Compliance Officer", team: "Compliance", email: "rania.fadel@northwind.com", country: "UAE" },
  // Business requesters
  { id: "u13", name: "James Whitfield", role: "VP Procurement", team: "Procurement", email: "james.whitfield@northwind.com", country: "United States" },
  { id: "u14", name: "Fatima Al-Sayed", role: "Head of HR", team: "Human Resources", email: "fatima.alsayed@northwind.com", country: "Saudi Arabia" },
  { id: "u15", name: "Ravi Menon", role: "Sales Director", team: "Sales", email: "ravi.menon@northwind.com", country: "Singapore" },
  { id: "u16", name: "Klaus Werner", role: "CFO", team: "Finance", email: "klaus.werner@northwind.com", country: "United Kingdom" },
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
