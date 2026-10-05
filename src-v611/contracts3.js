// MODULE 3 — CONTRACT INTELLIGENCE & TEMPLATE GENERATION: the pure model layer.
//
// THIS IS NOT A GENERIC AI CONTRACT GENERATOR. The clause library is the source
// of approved drafting positions; the template library is the source of approved
// structure. Assembly comes BEFORE generation: operative risk-allocation language
// is always an approved library clause (or explicitly absent — "Source not found
// in LegalOS"), never invented. Everything here is pure data + pure functions —
// store.js implements the engine, the pages render it.

/* ============================================================
   CLAUSE TAXONOMY (Phase 2)
   ============================================================ */
export const CLAUSE_TYPES3 = [
  "Confidentiality", "Limitation of Liability", "Indemnity", "Termination",
  "Governing Law", "IP Ownership", "Data Protection", "Force Majeure",
  "Assignment", "Dispute Resolution", "Severability", "Non-Solicit",
  "Relationship Between Parties", "Renewal", "Payment",
  "Representations & Warranties", "Insurance", "Audit Rights",
  "Publicity", "Compliance", "Anti-Bribery", "Sanctions", "Subcontracting",
  "Definitions",
];

export const TIERS = ["Preferred", "Acceptable", "Fallback"];
export const TIER_TONE = { Preferred: "green", Acceptable: "blue", Fallback: "amber" };

/* Clause lifecycle (Phase 5): only PUBLISHED clauses are authoritative. */
export const CLAUSE_STATUSES = ["Draft", "Proposed", "Manager Review", "HoD Approval", "Published", "Superseded", "Retired"];
export const CLAUSE_FLOW = {
  "Draft": ["Proposed"],
  "Proposed": ["Manager Review", "Retired"],
  "Manager Review": ["HoD Approval", "Proposed", "Retired"],
  "HoD Approval": ["Published", "Manager Review", "Retired"],
  "Published": ["Superseded", "Retired"],
  "Superseded": [], "Retired": [],
};
// Who may move a clause INTO this state (checked against rbac in the store).
export const CLAUSE_GATE = { "Manager Review": "lead", "HoD Approval": "lead", "Published": "head", "Retired": "head" };
export const CLAUSE_STATUS_TONE = {
  Draft: "gray", Proposed: "blue", "Manager Review": "amber", "HoD Approval": "purple",
  Published: "green", Superseded: "gray", Retired: "gray",
};

/* Draft output lifecycle (Phase 28). Approved is an explicit act, never implied. */
export const DRAFT_STATUSES = ["Draft", "In Review", "Changes Required", "Approved", "Rejected", "Delivered"];
export const DRAFT_TONE = { Draft: "gray", "In Review": "amber", "Changes Required": "red", Approved: "green", Rejected: "red", Delivered: "green" };

export const RECOMMENDATIONS = ["Accept", "Negotiate to Acceptable", "Negotiate to Fallback", "Reject"];
export const OUR_ROLES = ["Customer", "Supplier", "Licensor", "Licensee", "Service Provider"];
export const VALUE_BANDS = ["< 100k", "100k – 1M", "1M – 5M", "> 5M"];
export const DRAFT_FEATURES = ["Data Processing", "IP Creation", "Exclusivity", "Subcontracting", "International Transfer"];
export const M3_JURISDICTIONS = ["Saudi Arabia", "Pakistan"];

/* Every span of text in a draft carries its provenance (Phase 12/37). */
export const SOURCE_KINDS = {
  library: { label: "LIBRARY", icon: "checkcircle", tone: "green", hint: "Approved library position" },
  generated: { label: "AI-SUGGESTED", icon: "sparkles", tone: "purple", hint: "Generated connective text — not an approved position" },
  "user-edited": { label: "USER-EDITED", icon: "edit", tone: "amber", hint: "Edited away from the library position" },
  "user-provided": { label: "COMMERCIAL INPUT", icon: "user", tone: "blue", hint: "Business / commercial input" },
  fixed: { label: "TEMPLATE", icon: "template", tone: "gray", hint: "Fixed template boilerplate" },
  missing: { label: "NO APPROVED SOURCE", icon: "alertTriangle", tone: "red", hint: "Source not found in LegalOS — no published position" },
};

/* ============================================================
   TEXT UTILITIES — normalisation, diff, classification
   ============================================================ */
export const normText = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9% ]+/g, " ").replace(/\s+/g, " ").trim();
export const sameText = (a, b) => normText(a) === normText(b);

// Word-level gap summary between two texts (for deviation / findings display).
export function textGap(libText, actual) {
  const A = new Set(normText(libText).split(" ").filter((w) => w.length > 2));
  const B = new Set(normText(actual).split(" ").filter((w) => w.length > 2));
  const removed = [...A].filter((w) => !B.has(w));
  const added = [...B].filter((w) => !A.has(w));
  return { added: added.slice(0, 12), removed: removed.slice(0, 12), changed: added.length + removed.length > 0 };
}

// Rule-based clause classification for uploaded counterparty text (Phase 19).
// Deterministic and honest: keyword scoring with an explicit confidence band —
// never pretends an uncertain classification is certain.
const CLASSIFY_KEYWORDS = {
  "Confidentiality": ["confidential", "non-disclosure", "disclose", "confidentiality", "proprietary information"],
  "Limitation of Liability": ["liability", "liable", "aggregate", "cap", "consequential", "indirect damages"],
  "Indemnity": ["indemnify", "indemnity", "indemnification", "hold harmless", "defend"],
  "Termination": ["terminate", "termination", "notice period", "convenience", "material breach"],
  "Governing Law": ["governing law", "governed by", "laws of", "jurisdiction of the courts"],
  "IP Ownership": ["intellectual property", "work product", "ownership", "license grant", "background ip"],
  "Data Protection": ["personal data", "data protection", "processor", "controller", "pdpl", "gdpr", "data subject"],
  "Force Majeure": ["force majeure", "act of god", "beyond the reasonable control"],
  "Assignment": ["assign", "assignment", "change of control", "novation"],
  "Dispute Resolution": ["arbitration", "dispute", "mediation", "seat of arbitration", "escalation"],
  "Payment": ["payment", "fees", "invoice", "net 30", "net 45", "payable"],
  "Renewal": ["renew", "renewal", "auto-renew", "extension term"],
  "Non-Solicit": ["solicit", "non-solicit", "poach", "employees of the other"],
  "Anti-Bribery": ["bribery", "anti-corruption", "fcpa", "kickback"],
  "Insurance": ["insurance", "insured", "policy limits"],
  "Audit Rights": ["audit", "inspect", "books and records"],
  "Subcontracting": ["subcontract", "subcontractor"],
  "Publicity": ["publicity", "press release", "logo", "announce"],
};
export function classifyClauseText(text) {
  const t = normText(text);
  let best = null, bestScore = 0, second = 0;
  for (const [type, kws] of Object.entries(CLASSIFY_KEYWORDS)) {
    const score = kws.reduce((n, k) => n + (t.includes(k) ? (k.includes(" ") ? 2 : 1) : 0), 0);
    if (score > bestScore) { second = bestScore; bestScore = score; best = type; }
    else if (score > second) second = score;
  }
  if (!best || bestScore === 0) return { type: null, confidence: "None", score: 0 };
  const confidence = bestScore >= 3 && bestScore > second ? "High" : bestScore >= 2 ? "Medium" : "Low";
  return { type: best, confidence, score: bestScore };
}

// Split an uploaded document into sections (numbered headings / blank lines),
// preserving the source location so every finding can point back at it.
export function splitSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let cur = { n: null, heading: null, body: [] };
  const push = () => { const body = cur.body.join("\n").trim(); if (body || cur.heading) sections.push({ n: cur.n, heading: cur.heading, text: body }); };
  lines.forEach((line) => {
    const m = line.match(/^\s*(\d{1,2}(?:\.\d{1,2})?)[.)]?\s+([A-Z][A-Za-z &/-]{2,60})\s*$/);
    if (m) { push(); cur = { n: m[1], heading: m[2].trim(), body: [] }; }
    else cur.body.push(line);
  });
  push();
  return sections.filter((s) => (s.text || "").trim().length > 0 || s.heading);
}

/* ============================================================
   THE SEEDED CLAUSE LIBRARY (Phase 2/3) — approved internal positions.
   Concise but real drafting; each tier separately identifiable.
   approval: who must approve a deviation BELOW this position.
   ============================================================ */
const C = (type, risk, approval, tiers, extra = {}) => ({ type, risk, approval, tiers, ...extra });
export const CLAUSE_SEED_DEFS = [
  C("Confidentiality", "Medium", "Lead", {
    Preferred: "Each party shall keep the other's Confidential Information strictly confidential, use it solely for the purposes of this Agreement, and protect it with no less than reasonable care, for a period of five (5) years from disclosure.",
    Acceptable: "Each party shall keep the other's Confidential Information confidential and use it solely for the purposes of this Agreement, for a period of three (3) years from disclosure.",
    Fallback: "Each party shall keep the other's Confidential Information confidential for a period of two (2) years from the date of this Agreement.",
  }, { notes: "5-year term is our standard; resist survival shorter than 2 years.", guidance: "Concede duration before scope. Never concede the standard-of-care wording." }),
  C("Limitation of Liability", "High", "HoD", {
    Preferred: "Except for the Excluded Claims, each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable in the twelve (12) months preceding the event giving rise to the claim.",
    Acceptable: "Except for the Excluded Claims, each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable in the twenty-four (24) months preceding the event giving rise to the claim.",
    Fallback: "Each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable in the thirty-six (36) months preceding the event giving rise to the claim.",
  }, { notes: "12-month cap with Excluded Claims carve-out (confidentiality, IP, data). Uncapped liability is a walk-away.", guidance: "Move 12 → 24 months only against a reciprocal cap. Below Fallback requires the Director." }),
  C("Indemnity", "High", "HoD", {
    Preferred: "Each party shall indemnify the other against third-party claims arising from its breach of confidentiality, infringement of intellectual property rights, or violation of applicable law, subject to prompt notice and control of the defence.",
    Acceptable: "The Supplier shall indemnify the Customer against third-party IP-infringement claims arising from the deliverables, subject to prompt notice and control of the defence.",
  }, { notes: "Mutual, capped indemnities only. One-way uncapped indemnities are a walk-away.", guidance: "Never accept indemnities for the counterparty's own negligence." }),
  C("Termination", "Medium", "Lead", {
    Preferred: "Either party may terminate this Agreement for convenience on thirty (30) days' written notice, and immediately on material breach not cured within fifteen (15) days of notice.",
    Acceptable: "Either party may terminate this Agreement for convenience on sixty (60) days' written notice, and immediately on material breach not cured within thirty (30) days of notice.",
  }, { notes: "Always keep a convenience right.", guidance: "Extend notice periods before conceding the convenience right itself." }),
  C("Governing Law", "High", "HoD", {
    Preferred: "This Agreement is governed by the laws of the Kingdom of Saudi Arabia, and the courts of Riyadh have exclusive jurisdiction.",
  }, { jurisdiction: "Saudi Arabia", notes: "KSA-governed paper for KSA entities. Foreign governing law needs the Director.", guidance: "Offer arbitration (SCCA) before foreign courts." }),
  C("Governing Law", "High", "HoD", {
    Preferred: "This Agreement is governed by the laws of the Islamic Republic of Pakistan, and the courts of Lahore have exclusive jurisdiction.",
  }, { jurisdiction: "Pakistan", notes: "Pakistan-governed paper for PK entities.", guidance: "Offer LCIA/SIAC arbitration before foreign courts." }),
  C("IP Ownership", "High", "HoD", {
    Preferred: "All intellectual property created under this Agreement vests in the Customer on creation. Each party retains its background intellectual property.",
    Acceptable: "Deliverable intellectual property vests in the Customer on payment. The Supplier retains background IP and grants a perpetual licence to use it within the deliverables.",
  }, { notes: "Vest-on-creation is our paper position when we are the customer.", guidance: "Vest-on-payment is acceptable; licence-only is Fallback territory." }),
  C("Data Protection", "High", "HoD", {
    Preferred: "Each party shall comply with applicable data-protection law, including the Saudi PDPL. Personal data shall not be transferred outside the Kingdom without the disclosing party's written consent and a lawful transfer mechanism.",
    Acceptable: "Each party shall comply with applicable data-protection law. Cross-border transfers require a lawful transfer mechanism and notice to the disclosing party.",
  }, { notes: "PDPL residency default for KSA data.", guidance: "Consent-to-transfer can move to notice-only at Acceptable." }),
  C("Force Majeure", "Low", "None", {
    Preferred: "Neither party is liable for delay or failure caused by events beyond its reasonable control, provided the affected party notifies the other promptly and mitigates the impact. Payment obligations are not excused.",
  }, { notes: "Carve payment obligations out of FM.", guidance: "Resist FM definitions that include labour disputes of the counterparty's own workforce." }),
  C("Assignment", "Medium", "Lead", {
    Preferred: "Neither party may assign this Agreement without the other's prior written consent, except to an affiliate or in connection with a merger or sale of substantially all assets, with notice.",
  }, { notes: "Keep the affiliate / M&A carve-out for our side.", guidance: "" }),
  C("Dispute Resolution", "High", "HoD", {
    Preferred: "The parties shall first escalate any dispute to senior management for thirty (30) days. Unresolved disputes shall be finally settled by arbitration under the SCCA Rules, seated in Riyadh, in English.",
    Acceptable: "Unresolved disputes shall be finally settled by arbitration under the LCIA Rules, seated in Dubai (DIFC), in English.",
  }, { notes: "Escalation-then-arbitration. Seat matters more than rules.", guidance: "Concede rules before seat; never concede language." }),
  C("Payment", "Medium", "Lead", {
    Preferred: "Invoices are payable within thirty (30) days of receipt of a valid invoice. Late amounts accrue no interest for the first fifteen (15) days.",
    Acceptable: "Invoices are payable within forty-five (45) days of receipt of a valid invoice.",
  }, { notes: "Net 30 default.", guidance: "Move to Net 45 against price or SLA concessions." }),
  C("Renewal", "Low", "Lead", {
    Preferred: "This Agreement renews only by express written agreement of the parties. No automatic renewal applies.",
    Acceptable: "This Agreement auto-renews for successive one-year terms unless either party gives ninety (90) days' notice of non-renewal.",
  }, { notes: "Express renewal is our default — auto-renewal creates missed-notice risk.", guidance: "If auto-renew is conceded, insist on ≥90 days' notice and CLM registration." }),
  C("Non-Solicit", "Low", "None", {
    Preferred: "During the term and for twelve (12) months after, neither party shall solicit for employment the other's personnel directly involved in this Agreement. General advertisements are not solicitation.",
  }, { notes: "", guidance: "" }),
  C("Anti-Bribery", "Medium", "Lead", {
    Preferred: "Each party shall comply with applicable anti-bribery and anti-corruption laws and shall not offer, give or receive any improper advantage in connection with this Agreement.",
  }, { notes: "Non-negotiable in substance.", guidance: "Wording flexible; obligation is not." }),
  C("Severability", "Low", "None", {
    Preferred: "If any provision of this Agreement is held invalid or unenforceable, the remainder continues in full force, and the parties shall replace the provision with a valid one closest to its intent.",
  }, { notes: "", guidance: "" }),
];

/* ============================================================
   TEMPLATE STRUCTURES (Phases 8/9) — approved document skeletons.
   Section kinds: fixed | library | conditional | generated | input.
   The AI never decides structure for standard templates.
   ============================================================ */
export const TEMPLATE_DEFS = [
  {
    key: "nda", agreementType: "NDA", label: "Mutual NDA", jurisdiction: "Any",
    sections: [
      { key: "title", heading: "Title", kind: "fixed", text: "MUTUAL NON-DISCLOSURE AGREEMENT" },
      { key: "recitals", heading: "Recitals", kind: "generated" },
      { key: "definitions", heading: "1. Definitions", kind: "fixed", text: "\"Confidential Information\" means non-public information disclosed by either party, in any form, that is designated confidential or would reasonably be understood to be confidential." },
      { key: "confidentiality", heading: "2. Confidentiality", kind: "library", clauseType: "Confidentiality", required: true },
      { key: "term", heading: "3. Term & Termination", kind: "library", clauseType: "Termination", required: true },
      { key: "nonsolicit", heading: "4. Non-Solicitation", kind: "library", clauseType: "Non-Solicit" },
      { key: "gov", heading: "5. Governing Law", kind: "library", clauseType: "Governing Law", required: true },
      { key: "dispute", heading: "6. Dispute Resolution", kind: "library", clauseType: "Dispute Resolution", required: true },
      { key: "severability", heading: "7. Severability", kind: "library", clauseType: "Severability" },
    ],
  },
  {
    key: "saas", agreementType: "SaaS / technology agreement", label: "SaaS Agreement", jurisdiction: "Any",
    sections: [
      { key: "title", heading: "Title", kind: "fixed", text: "SOFTWARE-AS-A-SERVICE AGREEMENT" },
      { key: "recitals", heading: "Recitals", kind: "generated" },
      { key: "services", heading: "1. Services", kind: "input", prompt: "Describe the subscribed services and service levels" },
      { key: "fees", heading: "2. Fees", kind: "input", prompt: "Commercial schedule — fees, billing frequency" },
      { key: "payment", heading: "3. Payment Terms", kind: "library", clauseType: "Payment", required: true },
      { key: "confidentiality", heading: "4. Confidentiality", kind: "library", clauseType: "Confidentiality", required: true },
      { key: "ip", heading: "5. Intellectual Property", kind: "library", clauseType: "IP Ownership", required: true },
      { key: "data", heading: "6. Data Protection", kind: "conditional", feature: "Data Processing", clauseType: "Data Protection" },
      { key: "liability", heading: "7. Limitation of Liability", kind: "library", clauseType: "Limitation of Liability", required: true },
      { key: "indemnity", heading: "8. Indemnity", kind: "library", clauseType: "Indemnity", required: true },
      { key: "term", heading: "9. Term & Termination", kind: "library", clauseType: "Termination", required: true },
      { key: "renewal", heading: "10. Renewal", kind: "library", clauseType: "Renewal" },
      { key: "subk", heading: "11. Subcontracting", kind: "conditional", feature: "Subcontracting", clauseType: "Assignment" },
      { key: "fm", heading: "12. Force Majeure", kind: "library", clauseType: "Force Majeure" },
      { key: "antibribery", heading: "13. Anti-Bribery", kind: "library", clauseType: "Anti-Bribery" },
      { key: "gov", heading: "14. Governing Law", kind: "library", clauseType: "Governing Law", required: true },
      { key: "dispute", heading: "15. Dispute Resolution", kind: "library", clauseType: "Dispute Resolution", required: true },
    ],
  },
  {
    key: "supplier", agreementType: "Supplier / vendor agreement", label: "Supplier Agreement", jurisdiction: "Any",
    sections: [
      { key: "title", heading: "Title", kind: "fixed", text: "SUPPLIER AGREEMENT" },
      { key: "recitals", heading: "Recitals", kind: "generated" },
      { key: "supply", heading: "1. Supply of Goods / Services", kind: "input", prompt: "Scope of supply, specifications, delivery" },
      { key: "payment", heading: "2. Payment Terms", kind: "library", clauseType: "Payment", required: true },
      { key: "confidentiality", heading: "3. Confidentiality", kind: "library", clauseType: "Confidentiality", required: true },
      { key: "liability", heading: "4. Limitation of Liability", kind: "library", clauseType: "Limitation of Liability", required: true },
      { key: "indemnity", heading: "5. Indemnity", kind: "library", clauseType: "Indemnity", required: true },
      { key: "term", heading: "6. Term & Termination", kind: "library", clauseType: "Termination", required: true },
      { key: "assignment", heading: "7. Assignment", kind: "library", clauseType: "Assignment" },
      { key: "antibribery", heading: "8. Anti-Bribery & Compliance", kind: "library", clauseType: "Anti-Bribery", required: true },
      { key: "fm", heading: "9. Force Majeure", kind: "library", clauseType: "Force Majeure" },
      { key: "gov", heading: "10. Governing Law", kind: "library", clauseType: "Governing Law", required: true },
      { key: "dispute", heading: "11. Dispute Resolution", kind: "library", clauseType: "Dispute Resolution", required: true },
    ],
  },
  {
    key: "service", agreementType: "Customer / Service agreement", label: "Customer Service Agreement", jurisdiction: "Any",
    sections: [
      { key: "title", heading: "Title", kind: "fixed", text: "SERVICE AGREEMENT" },
      { key: "recitals", heading: "Recitals", kind: "generated" },
      { key: "services", heading: "1. Services", kind: "input", prompt: "Services to be provided, deliverables, milestones" },
      { key: "payment", heading: "2. Fees & Payment", kind: "library", clauseType: "Payment", required: true },
      { key: "confidentiality", heading: "3. Confidentiality", kind: "library", clauseType: "Confidentiality", required: true },
      { key: "ip", heading: "4. Intellectual Property", kind: "conditional", feature: "IP Creation", clauseType: "IP Ownership" },
      { key: "liability", heading: "5. Limitation of Liability", kind: "library", clauseType: "Limitation of Liability", required: true },
      { key: "term", heading: "6. Term & Termination", kind: "library", clauseType: "Termination", required: true },
      { key: "fm", heading: "7. Force Majeure", kind: "library", clauseType: "Force Majeure" },
      { key: "gov", heading: "8. Governing Law", kind: "library", clauseType: "Governing Law", required: true },
      { key: "dispute", heading: "9. Dispute Resolution", kind: "library", clauseType: "Dispute Resolution", required: true },
    ],
  },
];
export const M3_AGREEMENT_TYPES = TEMPLATE_DEFS.map((t) => t.agreementType);

// The permitted use of generation: connective language only (Phase 11).
// Deterministic here — clearly marked AI-SUGGESTED in the UI either way.
export function generateRecitals({ counterpartyName, ourRole, agreementType, jurisdiction }) {
  const us = "Zameen Group";
  const them = counterpartyName || "the Counterparty";
  const doing = agreementType === "NDA"
    ? "wish to exchange confidential information to evaluate a potential business relationship"
    : ourRole === "Customer" ? `wish for ${them} to provide the services described below to ${us}`
    : `wish for ${us} to provide the services described below to ${them}`;
  return `This Agreement is entered into between ${us} and ${them}. The parties ${doing}, on the terms set out in this Agreement, under the laws of ${jurisdiction || "the agreed jurisdiction"}.`;
}
