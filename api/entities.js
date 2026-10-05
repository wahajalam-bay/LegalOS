// Entity registry & statutory compliance rules.
//
// Every compliance module needs the same three things about a company: a stable
// key (so "Zameen Media Pvt Ltd" and "Zameen Media (Private) Limited" are ONE
// entity), its legal FORM, and what the Companies Act therefore requires of it.
//
// The registry is derived from the real source registers — resolutions, licences,
// loan parties and spend contracts. No entity is invented here; if a company is
// not named somewhere in the source data it does not appear.
//
// WHY THE TYPE MATTERS (PART 25/26 of the compliance brief): a Single Member
// Company has one member, so it holds no Annual General Meeting. Showing an
// "AGM overdue" item against an SMC is not a cosmetic bug — it is a false
// statutory exception that sends Legal chasing a meeting the law does not
// require. The rule therefore lives HERE, once, as data, and never as a
// frontend conditional.

/* Required LAZILY. registers.js runs loadCache() at module scope, and that path
   can reach this file before registers.js has assigned its module.exports — at
   which point this binding is frozen to a half-built object and every later
   call fails with "registers.ensure is not a function", which reads like a
   typo and is actually a load-order cycle. Resolving it at call time costs
   nothing and cannot be sequenced wrongly. */
const registers = { get ensure() { return require("./registers").ensure; } };
const drive = require("./drive");

/* ------------------------------------------------------------------ naming */

// Same normalisation the client graph uses (src/graph.js normEntity), so an
// entity key computed on the server matches one computed in the browser.
const entityKey = (s) => String(s || "").toLowerCase()
  .replace(/\(.*?\)/g, " ")
  .replace(/\b(private|pvt|limited|ltd|smc|company|group|the|and|co)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------- types */

// Legal form, read from the registered name. These suffixes are how Pakistani
// companies are actually registered, so the form is evidence from the source
// rather than a guess. Anything we cannot read stays UNKNOWN — never defaulted
// to a type that would then imply statutory duties we have no basis for.
const TYPES = {
  SMC:         { key: "SMC",         label: "Single Member Company",  agm: false },
  PRIVATE:     { key: "PRIVATE",     label: "Private Limited",        agm: true  },
  PUBLIC:      { key: "PUBLIC",      label: "Public Limited Company", agm: true  },
  PARTNERSHIP: { key: "PARTNERSHIP", label: "Registered Partnership", agm: false },
  FOREIGN:     { key: "FOREIGN",     label: "Foreign / Offshore",     agm: false },
  UNKNOWN:     { key: "UNKNOWN",     label: "Unknown - not stated in source", agm: null },
  CONFLICT:    { key: "CONFLICT",    label: "Conflicting source",             agm: null },
};

// Offshore/foreign group members. They are not Pakistani registered companies,
// so SECP filing duties do not attach to them at all.
const FOREIGN_RE = /\b(ADGM|UK|EMPG|EMP Management|Dubbizle Group|Daftarkhwan Holdings)\b/i;

function entityType(rawName) {
  const n = String(rawName || "");
  if (!n.trim()) return TYPES.UNKNOWN;
  if (/\bSMC\b/i.test(n)) return TYPES.SMC;
  if (/registered partnership|\bpartnership\b/i.test(n)) return TYPES.PARTNERSHIP;
  if (FOREIGN_RE.test(n) && !/\bZameen (Media|Developments|Venture)\b/i.test(n)) return TYPES.FOREIGN;
  if (/\b(private|pvt)\b/i.test(n) || /\(pvt\)/i.test(n)) return TYPES.PRIVATE;
  if (/\blimited\b|\bltd\b/i.test(n)) return TYPES.PUBLIC;
  return TYPES.UNKNOWN;
}

/* -------------------------------------------------- statutory requirements */

// What each legal form must do annually. Driven by the entity's form, so a new
// entity added to the source data inherits the correct duties automatically.
//
// The SECP form catalogue itself is configurable (config/secp-forms.json, see
// api/secp.js) — this table says only WHICH obligations exist, not what the
// forms are called this year.
const REQUIREMENTS = {
  SMC:         { agm: false, financialStatements: true,  annualForms: ["A", "9", "19"], note: "Single Member Company — no AGM required under the Companies Act." },
  PRIVATE:     { agm: true,  financialStatements: true,  annualForms: ["A", "9", "19"], note: "Private Limited — AGM required." },
  PUBLIC:      { agm: true,  financialStatements: true,  annualForms: ["A", "9", "19"], note: "Public limited company — AGM required." },
  PARTNERSHIP: { agm: false, financialStatements: false, annualForms: [],               note: "Registered partnership — not an SECP-registered company." },
  FOREIGN:     { agm: false, financialStatements: false, annualForms: [],               note: "Foreign / offshore entity — outside SECP jurisdiction." },
  UNKNOWN:     { agm: null,  financialStatements: null,  annualForms: [],               note: "Legal form could not be determined from the source data." },
  CONFLICT:    { agm: null,  financialStatements: null,  annualForms: [],               note: "Sources disagree about this entity's legal form." },
};

function requirementsFor(rawName) {
  const t = entityType(rawName);
  return { type: t.key, typeLabel: t.label, ...REQUIREMENTS[t.key] };
}

// Does an AGM apply to this entity? Returns true / false / null (unknown).
// Callers MUST treat null as "we do not know" and never as "yes".
function agmApplies(rawName) {
  const r = REQUIREMENTS[entityType(rawName).key];
  return r ? r.agm : null;
}

/* ---------------------------------------------------------------- registry */

// Build the registry from every register that names a company. Each entity
// records where it was seen, so the UI can show provenance rather than assert.
async function list() {
  const st = await registers.ensure();
  const R = (st && st.registers) || {};
  const m = new Map();

  const add = (raw, source) => {
    const name = String(raw || "").trim();
    const key = entityKey(name);
    if (!key || key.length < 3) return;
    let e = m.get(key);
    if (!e) { e = { key, name, aliases: new Set(), sources: new Set(), counts: {} }; m.set(key, e); }
    e.aliases.add(name);
    // Keep the longest spelling as canonical — it is the most complete form,
    // e.g. "Zameen Media (Private) Limited" over "Zameen Media Pvt Ltd".
    if (name.length > e.name.length) e.name = name;
    e.sources.add(source);
    e.counts[source] = (e.counts[source] || 0) + 1;
  };

  for (const r of R.resolutions || []) add(r.entity, "resolutions");
  for (const r of R.licences || []) add(r.entity, "licences");
  for (const r of R.loans || []) { add(r.borrower, "loans"); add(r.lender, "loans"); }
  for (const r of R.properties || []) add(r.entity, "properties");
  for (const r of R.contracts || []) add(r.entityName, "contracts");

  /* The statutory root names every company the group actually files for, and it
     is the ONLY source for eight of them — Zameen Nexus, Zameen Core, Mall 35
     Facilities Management and others that hold no contract, loan or licence yet
     but do have a SECP folder. Leaving them out meant LegalOS could hold 276
     statutory documents for a company it would not admit existed. */
  try {
    for (const e of require("./secp-source").build().entities) add(e.name, "secp-folder");
  } catch (err) { /* the statutory root may not be shared; the roster stands without it */ }

  // Drive FOLDER NAMES are a source in their own right, and often the more
  // precise one: the resolutions tree spells companies exactly as they are
  // registered ("Zameen Axis(SMC-Pvt)Ltd"), where a summary workbook's filename
  // may not. Feeding them in is how a legal-form disagreement becomes visible
  // instead of being decided by whichever spelling happened to be read first.
  try {
    for (const f of drive.indexFiles()) {
      const p = String(f.folderPath || "");
      let m2 = p.match(/\/\s*Resolutions\s*\/\s*([^/]+?)_Resolutions?[^/]*(?:\/|$)/i);
      if (m2) { add(m2[1].replace(/\s*\(\d+\)\s*$/, "").trim(), "drive-folder"); continue; }
      m2 = p.match(/Licenses & Approvals[^/]*\/\s*[A-Za-z]+\s*[-_]\s*([^/]+?)(?:\s*\(\d+\))?\s*(?:\/|$)/i);
      if (m2) { add(m2[1].replace(/_+$/, "").trim(), "drive-folder"); continue; }
      m2 = p.match(/Zameen Group(?: _PK Intercompany Loans|_Loan Agreements)\s*\/\s*([^/]+?)(?:\s*\(\d+\))?\s*(?:\/|$)/i);
      if (m2) add(m2[1].replace(/\s*&\s*subsidiaries$/i, "").trim(), "drive-folder");
    }
  } catch (e) { /* index not loaded yet: the register sources above still stand */ }

  return [...m.values()]
    .map((e) => {
      // Legal form is decided across EVERY spelling of the company, not from
      // whichever name happened to be longest. "Zameen Axis" is written
      // "(SMC-Pvt)Ltd" in the resolutions folders and "(Private) Limited" in the
      // loan tracker -- a genuine disagreement between two sources about whether
      // an AGM is required. Guessing here would silently create or suppress a
      // statutory obligation, so a disagreement is reported as a conflict and
      // the requirement is withheld until a human resolves it.
      const votes = new Map();
      for (const a of e.aliases) {
        const t = entityType(a);
        if (t.key === "UNKNOWN") continue;
        if (!votes.has(t.key)) votes.set(t.key, []);
        votes.get(t.key).push(a);
      }
      const distinct = [...votes.keys()];
      let type, conflict = null;
      if (distinct.length === 0) type = "UNKNOWN";
      else if (distinct.length === 1) type = distinct[0];
      else {
        conflict = distinct.map((k) => ({ type: k, label: TYPES[k].label, spellings: votes.get(k) }));
        type = "CONFLICT";
      }

      const req = type === "CONFLICT"
        ? { agm: null, financialStatements: null, annualForms: [], note: "Sources disagree about this entity's legal form, so its statutory requirements are undetermined. Resolve the spelling in the source data to settle it." }
        : REQUIREMENTS[type];

      return {
        key: e.key,
        name: e.name,
        aliases: [...e.aliases].sort(),
        type,
        typeLabel: type === "CONFLICT" ? "Conflicting source" : TYPES[type].label,
        typeEvidence: [...votes.entries()].map(([k, v]) => ({ type: k, spellings: v })),
        typeConflict: conflict,
        quality: type === "CONFLICT" ? "CONFLICTING_SOURCE" : type === "UNKNOWN" ? "INCOMPLETE_SOURCE" : "COMPLETE",
        requirements: req,
        sources: [...e.sources].sort(),
        counts: e.counts,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function byKey(key) {
  const all = await list();
  return all.find((e) => e.key === entityKey(key)) || null;
}

module.exports = { entityKey, entityType, requirementsFor, agmApplies, list, byKey, TYPES, REQUIREMENTS };
