// THE ONE PLACE LITIGATION DROP-DOWNS COME FROM.
//
// THE INCIDENT THIS ENCODES
// The wizard shipped with every menu empty and the helper text reading
// "0 entities in the register" and "0 already used in the register", beside a
// register holding 357 cases, 61 courts and 37 entity spellings. Two separate
// faults produced that one screen:
//
//   1. The live server was running a build from before api/litigation-routes.js
//      existed, so GET /api/litigation/meta answered 404. Node resolves
//      require() once at startup: a new route file is NOT picked up by a
//      running process the way a versioned front-end file is.
//   2. The client turned ANY failure into `{ caseTypes: [], suggest: {} }`.
//      A dead endpoint and a genuinely empty estate rendered identically, so
//      the screen reported a data problem that did not exist and hid a
//      deployment problem that did.
//
// The second fault is the dangerous one, and it is the reason this module
// reports a STATUS per list rather than only an array. "Loading", "empty" and
// "failed" are three different facts about the business and a lawyer is
// entitled to be told which one they are looking at. A count of zero is a
// claim about the estate; it is never allowed to be the way an outage looks.
//
// WHERE THE VALUES COME FROM
// Closed vocabularies (direction, risk, priority, party kind) drive logic and
// are defined in litigation-cases.js. Everything else is derived from what the
// business actually files -- the litigation register, the canonical entity
// registry, the user roster -- because a tidy invented list sitting beside the
// estate's real values is a second taxonomy, and the lawyer picks from the one
// we invented while 357 rows stay filed under the other.
const store = require("./litigation-cases");

const clean = (v, max = 300) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const canon = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ------------------------------------------------------- near-duplicates ---
   The register contains "Civil Dispute" (169 rows) and "Civil Dipute" (4) --
   one dropped letter. Offering both invites the next lawyer to pick the typo
   and makes any count of civil disputes wrong by four.

   A rare spelling is folded into a STRICTLY more common one within edit
   distance 2. It is folded only downhill, so a genuine value is never absorbed
   by a typo, and nothing is folded when no more-common variant exists: "IP
   Infringment" is misspelled but it is what this business has filed nine times
   and no better-attested spelling exists to fold it into, so it stands. We are
   de-duplicating a menu, not silently rewriting the estate's records. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;     // cheap reject
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function foldNearDuplicates(entries) {
  const sorted = entries.slice().sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const kept = [];
  for (const e of sorted) {
    const host = kept.find((k) => k.n > e.n && editDistance(canon(k.name), canon(e.name)) <= 2);
    if (host) {
      host.n += e.n;
      host.aliases = (host.aliases || []).concat([e.name]);
    } else kept.push(Object.assign({}, e, { aliases: e.aliases || [] }));
  }
  return kept;
}

/* ------------------------------------------------------------- tallying --- */
function tally() {
  const m = new Map();
  return {
    add(v, weight) {
      const s = clean(v, 160);
      if (!s || s.length < 2) return;
      const k = canon(s);
      if (!k) return;
      const cur = m.get(k);
      if (cur) cur.n += (weight == null ? 1 : weight);
      else m.set(k, { name: s, n: (weight == null ? 1 : weight) });
    },
    entries() { return [...m.values()]; },
  };
}

/* ------------------------------------------------------------ court type ---
   The register has a court column and NO jurisdiction or court-type column,
   but the court names carry both: "Lahore High Court, Rawalpindi Bench",
   "Intellectual Property Tribunal, Lahore", "P.S Gulberg, Lahore". Reading the
   forum out of the name it was already given is the difference between a
   lawyer confirming a value and a lawyer typing one. Anything unrecognised is
   left blank rather than guessed -- an empty field is honest, a wrong
   jurisdiction on a case file is not. */
const COURT_KINDS = [
  [/supreme court/i, "Supreme Court", "Supreme Court"],
  [/high court/i, "High Court", "High Court"],
  [/\bnirc\b|national industrial relations/i, "Tribunal", "NIRC"],
  [/intellectual property tribunal/i, "Tribunal", "IP Tribunal"],
  [/appellate tribunal|tribunal/i, "Tribunal", "Tribunal"],
  [/banking court/i, "Banking Court", "Banking Court"],
  [/consumer court/i, "Consumer Court", "Consumer Court"],
  [/rent controller/i, "Rent Controller", "Rent Controller"],
  [/labou?r court/i, "Labour Court", "Labour Court"],
  [/wages authority/i, "Wages Authority", "Payment of Wages"],
  [/ombuds/i, "Ombudsman", "Ombudsman"],
  [/securities and exchange|\bsecp\b/i, "Regulator", "SECP"],
  [/customs|collector \(adjudication\)/i, "Regulator", "Customs"],
  [/horticulture authority|commission|authority|\bboard\b|department/i, "Regulator", "Regulator"],
  [/sessions judge|session court|sessions court/i, "District Judiciary", "Sessions"],
  [/magistrate/i, "Magistracy", "Magistrate"],
  [/district judge|district court|district courts/i, "District Judiciary", "District Judge"],
  [/civil court|civil judge/i, "District Judiciary", "Civil Court"],
  [/^p\.?s\b|police station|\bsp office\b|\bdsp office\b|\bthana\b/i, "Police / Investigation", "Police"],
];

function courtKind(name) {
  const n = clean(name, 200);
  for (const [re, type, jurisdiction] of COURT_KINDS) if (re.test(n)) return { courtType: type, jurisdiction };
  return { courtType: "", jurisdiction: "" };
}

/* The cities this business actually litigates in are read out of its own court
   names rather than shipped as a list of Pakistani cities. A name matching two
   cities is left unresolved instead of guessed. */
const CITY_WORDS = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Peshawar", "Quetta", "Gujranwala", "Sialkot", "Hyderabad", "Bahawalpur", "Sargodha",
  "Sahiwal", "Sukkur", "Abbottabad", "Mardan", "Gujrat", "Sheikhupura", "Okara", "Model Town"];

function cityOf(name) {
  const hits = CITY_WORDS.filter((c) => new RegExp("\\b" + c.replace(/\s+/g, "\\s+") + "\\b", "i").test(String(name || "")));
  const real = hits.filter((h) => h !== "Model Town");      // a locality, not a city
  return real.length === 1 ? real[0] : "";
}

/* ------------------------------------------------------- the option lists --- */

/* Every list is returned in ONE shape so the client has one way to render a
   menu, one way to show a count and one way to show a failure. `status` is the
   point of the shape: "ok" with 0 options means the estate is genuinely empty,
   and that is a different screen from "failed". */
const list = (key, label, options, opts) => Object.assign({
  key, label, options, count: options.length, status: "ok", source: "", closed: false,
}, opts || {});

/* Closed vocabularies: these drive workflow, scoring and validation, so a value
   outside them is refused rather than stored. */
function closedLists() {
  return {
    directions: list("directions", "Direction", store.DIRECTIONS, { closed: true, source: "LegalOS workflow vocabulary" }),
    risks: list("risks", "Risk", store.RISKS, { closed: true, source: "LegalOS vocabulary" }),
    priorities: list("priorities", "Priority", store.PRIORITIES, { closed: true, source: "LegalOS vocabulary" }),
    partyKinds: list("partyKinds", "Party type", store.PARTY_KINDS, { closed: true, source: "LegalOS vocabulary" }),
    currencies: list("currencies", "Currency", store.CURRENCIES, { closed: true, source: "LegalOS vocabulary" }),
    documentTypes: list("documentTypes", "Document type", store.DOCUMENT_TYPES, { closed: true, source: "LegalOS vocabulary" }),
    deadlineKinds: list("deadlineKinds", "Deadline type", store.DEADLINE_KINDS, { closed: true, source: "LegalOS vocabulary" }),
    hearingPurposes: list("hearingPurposes", "Hearing purpose", store.HEARING_PURPOSES, { closed: true, source: "LegalOS vocabulary" }),
    hearingOutcomes: list("hearingOutcomes", "Hearing outcome", store.HEARING_OUTCOMES, { closed: true, source: "LegalOS vocabulary" }),
    closureOutcomes: list("closureOutcomes", "Closure outcome", store.CLOSURE_OUTCOMES, { closed: true, source: "LegalOS vocabulary" }),
    statuses: list("statuses", "Status", store.STATUSES, { closed: true, source: "LegalOS vocabulary" }),
    motionTypes: list("motionTypes", "Motion type", store.MOTION_TYPES, { closed: true, source: "LegalOS vocabulary" }),
    motionOutcomes: list("motionOutcomes", "Motion outcome", store.MOTION_OUTCOMES, { closed: true, source: "LegalOS vocabulary" }),
    askRecipients: list("askRecipients", "Ask", store.ASK_RECIPIENTS, { closed: true, source: "LegalOS vocabulary" }),
    counselModes: list("counselModes", "Counsel", ["Internal", "External"], { closed: true, source: "LegalOS vocabulary" }),
    workflow: list("workflow", "Stage", store.WORKFLOW, { closed: true, source: "LegalOS workflow" }),
    modules: list("modules", "Module", store.MODULES, { closed: true, source: "LegalOS modules" }),
  };
}

/* THE CASE CLASSIFICATION.
   The register keeps ONE classification column, `nature`, and it mixes subject
   matter ("Employee Dispute", "Non-Compete", "Tax") with procedural form
   ("Writ Petition", "Bail Application", "Civil Appeal"). That is how this
   business classifies its cases, so that is the single control the wizard
   shows. The previous build asked for a "Case type" from a 13-value list
   invented here that matched NONE of the 357 filed rows, and then asked again
   for "Nature" -- two fields, one real concept, and a benchmark that could
   never join back to the register. */
function categories(rows, cases) {
  const t = tally();
  for (const r of rows) t.add(r.nature);
  for (const c of cases) t.add(c.nature);
  const folded = foldNearDuplicates(t.entries());
  const used = folded.map((e) => ({ name: e.name, n: e.n, aliases: e.aliases, inRegister: true }));
  /* The canonical vocabulary sits BEHIND what the estate uses, so a brand-new
     estate is not left with an empty menu and nothing invented outranks a value
     the business has actually filed. */
  const extra = store.NATURES
    .filter((x) => !used.some((y) => canon(y.name) === canon(x)))
    .map((x) => ({ name: x, n: 0, aliases: [], inRegister: false }));
  return used.concat(extra);
}

/* THE BENCHMARK GROUPING, DERIVED -- NEVER TYPED.
   Success rates are worth benchmarking across broad families ("Employment",
   "Property") and the register's 24 categories are finer than that. The
   grouping is computed from the chosen category so the lawyer answers once.
   A category that matches no family is grouped as "Other" rather than guessed
   into one. */
const FAMILIES = [
  [/employee|employment|labour|labor|wages|termination|grievance/i, "Employment / Labour"],
  [/non.?compete/i, "Non-Compete"],
  [/\bip\b|intellectual|infring|trademark|copyright|patent/i, "Intellectual Property"],
  [/consumer/i, "Consumer"],
  [/\btax\b|customs|duty/i, "Tax / Customs"],
  [/criminal|bail|fir|acquittal|crpc|561/i, "Criminal"],
  [/writ|contempt|constitutional|22 a|petition u\/s/i, "Constitutional / Writ"],
  [/defamation/i, "Defamation"],
  [/rent|possession|property|lease|ejectment/i, "Property / Possession"],
  [/recovery/i, "Recovery"],
  [/appeal|\bfao\b|revision/i, "Appellate"],
  [/regulat|show cause|notice/i, "Regulatory"],
  [/civil|suit|dispute|contract|commercial/i, "Civil / Commercial"],
];

function familyOf(category) {
  const c = clean(category, 120);
  if (!c) return "";
  for (const [re, fam] of FAMILIES) if (re.test(c)) return fam;
  return "Other";
}

function courts(rows, cases) {
  const t = tally();
  for (const r of rows) t.add(r.court);
  for (const c of cases) t.add(c.court && c.court.name);
  return foldNearDuplicates(t.entries()).map((e) => {
    const k = courtKind(e.name);
    return { name: e.name, n: e.n, city: cityOf(e.name), courtType: k.courtType, jurisdiction: k.jurisdiction, aliases: e.aliases };
  });
}

/* Counsel columns hold several names at once -- "Hamza Haider / CLM" -- so they
   are split before counting, or the menu offers a firm and a barrister glued
   together as one option nobody can pick correctly. */
function counsel(rows, cases) {
  const t = tally();
  for (const r of rows) for (const c of String(r.counsel || "").split(/[,/;]|\band\b/)) t.add(c);
  for (const c of cases) {
    t.add(c.counsel && c.counsel.lead);
    t.add(c.counsel && c.counsel.firm);
  }
  return foldNearDuplicates(t.entries()).map((e) => ({ name: e.name, n: e.n, aliases: e.aliases }));
}

function positions(rows, cases) {
  const t = tally();
  for (const r of rows) t.add(r.position);
  for (const c of cases) for (const p of (c.parties || [])) t.add(p.role);
  const used = foldNearDuplicates(t.entries()).map((e) => ({ name: e.name, n: e.n, aliases: e.aliases }));
  const extra = store.PARTY_ROLES.filter((x) => !used.some((y) => canon(y.name) === canon(x))).map((x) => ({ name: x, n: 0, aliases: [] }));
  return used.concat(extra);
}

/* ENTITIES COME FROM THE CANONICAL REGISTRY, NOT FROM THE LITIGATION COLUMN.
   The litigation column holds 37 spellings, many of them compound -- "Zameen
   Media (Private) Limited & Imzee Consulting." -- because a case can be filed
   against several group companies at once. Deriving the menu from that column
   alone would offer those compounds as if they were companies and would hide
   every group entity that has not yet been sued.

   So the registry is the source, the register supplies usage counts through
   alias matching, and a spelling that matches no canonical entity is still
   offered -- flagged -- because 357 existing rows refer to it and a menu that
   cannot express what is already filed is a menu people type around. */
async function entities(rows, cases, entitiesApi) {
  let canonical = [];
  try { canonical = (await entitiesApi.list()) || []; } catch (e) { canonical = []; }
  if (!Array.isArray(canonical)) canonical = canonical.entities || [];

  const t = tally();
  for (const r of rows) t.add(r.entity);
  for (const c of cases) t.add(c.entity);
  const usage = t.entries();

  const matchOf = (used) => canonical.find((c) =>
    [c.name].concat(c.aliases || []).some((a) => {
      const ca = canon(a), cu = canon(used);
      return ca && cu && (ca === cu || cu.includes(ca));
    }));

  const counts = new Map();
  const unmatched = [];
  for (const u of usage) {
    const m = matchOf(u.name);
    if (m) counts.set(m.key, (counts.get(m.key) || 0) + u.n);
    else unmatched.push(u);
  }

  const known = canonical.map((c) => ({
    key: c.key, name: c.name, type: c.typeLabel || c.type || "", aliases: c.aliases || [],
    n: counts.get(c.key) || 0, canonical: true,
  }));
  const strays = unmatched.map((u) => ({ key: null, name: u.name, type: "", aliases: [], n: u.n, canonical: false }));
  return known.concat(strays).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/* OWNERS ARE REAL PEOPLE WITH ACCOUNTS.
   A free-text owner box produces "Salman", "S. Rashid" and "salman.rashid@" for
   one person and a workload report nobody can total. */
function owners(identity) {
  let roster = [];
  try { roster = identity.listRoster() || []; } catch (e) { roster = []; }
  return roster
    .filter((u) => u && u.email)
    .map((u) => ({
      id: u.id || u.email, name: u.name || u.email, email: u.email,
      role: u.role || u.title || "", team: u.team || "",
      /* the Picker prints `type` beside the name, so the menu reads
         "Salman Rashid — AD Legal, Head of Litigation" rather than a bare name */
      type: u.role || u.title || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------ assemble ---- */

/* One call, every menu, each carrying its own status. The caller is a route;
   the failure of ONE derivation must not empty the others, so each is guarded
   and reports its own state. */
async function optionsFor({ registers, level, mayWrite }) {
  const out = { lists: {}, canCreate: !!mayWrite, level: level || "none", generatedAt: new Date().toISOString() };

  let rows = [], registerStatus = "ok", registerError = "";
  try {
    rows = (await registers.get("litigation")) || [];
  } catch (e) {
    registerStatus = "failed";
    registerError = String((e && e.message) || e).slice(0, 200);
    rows = [];
  }
  const cases = (() => { try { return store.list() || []; } catch (e) { return []; } })();

  Object.assign(out.lists, closedLists());

  const derived = (key, label, fn, source) => {
    if (registerStatus === "failed") {
      out.lists[key] = list(key, label, [], { status: "failed", error: registerError, source });
      return;
    }
    try {
      out.lists[key] = list(key, label, fn(), { source });
    } catch (e) {
      out.lists[key] = list(key, label, [], { status: "failed", error: String((e && e.message) || e).slice(0, 200), source });
    }
  };

  derived("categories", "Case category", () => categories(rows, cases), "litigation register");
  derived("courts", "Court / forum", () => courts(rows, cases), "litigation register");
  derived("counsel", "Counsel", () => counsel(rows, cases), "litigation register");
  derived("positions", "Party role", () => positions(rows, cases), "litigation register");

  /* Cities and jurisdictions are properties OF a court, not independent lists.
     They are still offered flat for the rare forum whose name carries neither. */
  derived("cities", "City", () => {
    const t = tally();
    for (const c of courts(rows, cases)) if (c.city) t.add(c.city, c.n);
    for (const r of rows) t.add(r.city);
    return foldNearDuplicates(t.entries()).map((e) => ({ name: e.name, n: e.n }));
  }, "court names in the register");
  derived("jurisdictions", "Jurisdiction", () => {
    const t = tally();
    for (const c of courts(rows, cases)) if (c.jurisdiction) t.add(c.jurisdiction, c.n);
    return foldNearDuplicates(t.entries()).map((e) => ({ name: e.name, n: e.n }));
  }, "court names in the register");

  try {
    out.lists.entities = list("entities", "Internal entity",
      await entities(rows, cases, require("./entities")), { source: "canonical entity registry + litigation register" });
  } catch (e) {
    out.lists.entities = list("entities", "Internal entity", [], { status: "failed", error: String((e && e.message) || e).slice(0, 200) });
  }

  try {
    out.lists.owners = list("owners", "Case owner", owners(require("./identity")), { source: "LegalOS user roster" });
  } catch (e) {
    out.lists.owners = list("owners", "Case owner", [], { status: "failed", error: String((e && e.message) || e).slice(0, 200) });
  }

  out.registerStatus = registerStatus;
  if (registerError) out.registerError = registerError;
  return out;
}

/* -------------------------------------------------------- server checks ---
   §29/§30: the client sends display strings, and a client is not a security
   boundary. Anything a menu offered is resolved back to its canonical value
   here, and a closed vocabulary refuses what it does not recognise. An open
   list accepts a new value -- a court this business has not used before is a
   real event -- but it is normalised first so it does not become the 62nd
   court by way of a stray double space. */
function resolveClosed(kind, value) {
  const v = clean(value, 120);
  if (!v) return { ok: true, value: "" };
  const vocab = {
    direction: store.DIRECTIONS, risk: store.RISKS, priority: store.PRIORITIES,
    partyKind: store.PARTY_KINDS, currency: store.CURRENCIES, documentType: store.DOCUMENT_TYPES,
    deadlineKind: store.DEADLINE_KINDS, hearingPurpose: store.HEARING_PURPOSES,
    hearingOutcome: store.HEARING_OUTCOMES, closureOutcome: store.CLOSURE_OUTCOMES,
    status: store.STATUSES, motionType: store.MOTION_TYPES, motionOutcome: store.MOTION_OUTCOMES,
    stage: store.WORKFLOW, module: store.MODULES,
  }[kind];
  if (!vocab) return { ok: true, value: v };
  const hit = vocab.find((x) => canon(x) === canon(v));
  return hit ? { ok: true, value: hit } : { ok: false, value: v, allowed: vocab };
}

/* An owner must be somebody with an account. Submitting a name that is not on
   the roster is refused rather than stored, so "owner" stays a person you can
   actually assign work to. */
function resolveOwner(value, identityApi) {
  const v = clean(value, 200);
  if (!v) return { ok: true, value: "", owner: null };
  const roster = owners(identityApi || require("./identity"));
  const hit = roster.find((u) =>
    canon(u.email) === canon(v) || canon(u.name) === canon(v) || canon(u.id) === canon(v));
  return hit ? { ok: true, value: hit.email, owner: hit } : { ok: false, value: v };
}

module.exports = {
  optionsFor, categories, courts, counsel, positions, entities, owners,
  familyOf, courtKind, cityOf, foldNearDuplicates, editDistance,
  resolveClosed, resolveOwner, canon, clean,
};
