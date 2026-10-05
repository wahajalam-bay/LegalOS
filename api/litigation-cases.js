// THE LITIGATION CASE ENGINE — one way to create a case, on the server.
//
// WHY THIS EXISTS
// The Case Handling module could not create a case at all. /m/cases renders the
// live litigation register, and the "New case" button lived on the workflow
// page that route stopped using. The litigation team was looking at a list they
// could not add to.
//
// The button that used to exist would not have been enough either: it wrote the
// record into the browser's localStorage, so a case raised by one lawyer
// existed for that lawyer, on that machine, until they cleared their site data.
//
// ONE ENGINE, MANY DOORS
// A case may be raised from scratch, from a legal request, from a notice, from
// a contract, from a project, or from an uploaded court document. Every one of
// those goes through `createCase` here. The alternative — a creation path per
// entry point — is how two cases raised the same week end up with different
// fields populated and a register that cannot be counted.
//
// WHAT IT GUARANTEES
//   validation      a case with no title is refused, and nothing beyond what
//                   the register itself requires is made mandatory.
//   identity        LIT-nnnnn, generated under a lock, never an array index.
//                   The court's own number is stored separately: a court
//                   reference is not unique across forums and is not ours.
//   deduplication   likely duplicates are reported BEFORE creation. Litigation
//                   records are never silently merged.
//   atomicity       the record, its parties, documents, deadlines, timeline and
//                   audit are built in memory and written once. A half-created
//                   case is worse than none.
//   provenance      every auto-filled field records where it came from, how,
//                   and how confident that was.
//   audit           who did what, when, for the life of the case.
//
// WHAT IT IS NOT
// It is not a second source of truth for litigation. The Drive trackers remain
// authoritative for the cases already in them. This file holds only cases that
// originated in LegalOS, each marked LEGALOS_NATIVE, and the register merges
// them alongside the tracker rows. Nothing here is ever written back to Drive.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = path.join(__dirname, "..", "config", "litigation-cases.json");
const MAX_RECORDS = 20000;
const MAX_RECORD_BYTES = 512 * 1024;

let cache = null;

/* ------------------------------------------------------- vocabularies ---- */

/* Which module a case was filed from. The litigation modules are FILTERED
   VIEWS of one register and their filters read the case's prose -- a case
   raised in IP Portfolio whose name never says "trademark" would save
   correctly and then be missing from the module it was raised in. Recording
   the module explicitly is what stops that. */
const MODULES = ["cases", "ip", "developerDisputes", "assetRecovery", "police"];

/* Subject matter, which is what success rates are benchmarked on. Kept apart
   from `nature`, the procedural form: a Recovery Suit and a Writ Petition can
   both be commercial disputes. */
/* THE NINE THE BUSINESS ACTUALLY FILES UNDER.
   The previous thirteen were a generic taxonomy -- "Commercial", "Contractual",
   "Negligence" -- that nobody in this team picks, because a matter is a writ
   petition or a severance claim, not a "contractual" one. A dropdown of
   categories the user does not recognise gets answered at random, and then the
   register cannot be filtered by anything meaningful.

   Historical labels are NOT rewritten in the source. `CASE_TYPE_ALIASES` maps
   the old vocabulary onto the new so an imported row keeps resolving and a
   saved filter keeps working; what changes is what the form offers. */
const CASE_TYPES = ["Writ Petitions", "Tax Matters", "Severance Claims",
  "Non-Compete Matters", "IP Infringement", "Defamation", "Criminal Cases",
  "Civil Disputes", "ZD Project Cases"];

const CASE_TYPE_ALIASES = {
  "writ petition": "Writ Petitions", "writ petitions": "Writ Petitions",
  "tax": "Tax Matters", "tax matters": "Tax Matters",
  "employment / labour": "Severance Claims", "employment": "Severance Claims",
  "labour": "Severance Claims", "severance claims": "Severance Claims",
  "non-compete": "Non-Compete Matters", "non compete": "Non-Compete Matters",
  "non-compete matters": "Non-Compete Matters",
  "intellectual property": "IP Infringement", "ip infringement": "IP Infringement",
  "defamation": "Defamation",
  "criminal": "Criminal Cases", "criminal cases": "Criminal Cases",
  "commercial": "Civil Disputes", "contractual": "Civil Disputes",
  "negligence": "Civil Disputes", "consumer": "Civil Disputes",
  "recovery": "Civil Disputes", "property / possession": "Civil Disputes",
  "regulatory": "Civil Disputes", "civil disputes": "Civil Disputes",
  "zd project cases": "ZD Project Cases", "zd project": "ZD Project Cases",
  "other": "",
};
/* Resolve any spelling this register has ever held to one of the nine. An
   unrecognised value resolves to nothing rather than being forced into a
   category it does not belong to. */
const canonCaseType = (v) => {
  const k = String(v == null ? "" : v).trim().toLowerCase();
  if (!k) return "";
  if (CASE_TYPES.includes(v)) return v;
  return Object.prototype.hasOwnProperty.call(CASE_TYPE_ALIASES, k) ? CASE_TYPE_ALIASES[k] : "";
};

const NATURES = ["Recovery Suit", "Civil Suit", "Writ Petition", "Labour Case",
  "Consumer Complaint", "Arbitration", "Criminal Complaint", "Appeal", "Bail Application",
  "Non-Compete", "Other"];

/* Who we are in the matter, in the two words Legal actually uses: a case is
   either one we brought or one brought against us. It drives which stage the
   case starts in, because a case served on us does not begin at "Drafting".

   It used to offer five: "We initiated", "Against us", "Regulatory /
   Government", "Criminal / Police" and "Other". The last three answer a
   different question -- what KIND of matter it is, which the case category
   already records -- so a user picking "Criminal / Police" was choosing a
   nature in a field meant to record a side, and the two readings of the same
   value then disagreed about where the case should start. */
const DIRECTIONS = ["For", "Against"];

/* Every direction this register has ever stored, mapped to the two that remain.
   Old records keep working and a saved filter still resolves; nothing in the
   source is rewritten to make the new list fit. */
const DIRECTION_ALIASES = {
  "we initiated": "For",
  "for": "For",
  "against us": "Against",
  "against": "Against",
  "regulatory / government": "Against",
  "criminal / police": "Against",
  "other": "",
};
const canonDirection = (v) => {
  const k = String(v == null ? "" : v).trim().toLowerCase();
  if (!k) return "";
  if (Object.prototype.hasOwnProperty.call(DIRECTION_ALIASES, k)) return DIRECTION_ALIASES[k];
  return DIRECTIONS.includes(v) ? v : "";
};

/* Litigation has more than two sides. Modelling only plaintiff/defendant is
   why co-defendants and government respondents end up in a free-text note. */
const PARTY_ROLES = ["Claimant", "Plaintiff", "Petitioner", "Appellant", "Applicant",
  "Respondent", "Defendant", "Complainant", "Accused", "Government Authority", "Third Party", "Other"];

const RISKS = ["Low", "Medium", "High", "Critical"];

const DEADLINE_KINDS = ["Next Hearing", "Reply Due", "Written Statement Due",
  "Appeal Deadline", "Notice Response Due", "Document Due", "Limitation", "Other"];

const MOTION_TYPES = ["Motion to Dismiss", "Summary Judgment", "Injunction / Stay",
  "Strike Out", "Jurisdictional Challenge", "Interim Relief", "Other"];
const MOTION_OUTCOMES = ["Pending", "Granted", "Denied", "Partially Granted", "Withdrawn"];

/* The lifecycle. Not every case walks every stage, and the entry stage depends
   on direction -- see `openingStage`. */
const WORKFLOW = ["Intake", "Review", "Filed / Received", "Proceedings", "Hearing",
  "Judgment / Decision", "Enforcement / Recovery", "Closed"];

const DATA_QUALITY = ["COMPLETE", "INCOMPLETE_SOURCE", "NEEDS_INFORMATION"];

/* Operational urgency, which is NOT legal risk. A low-risk case can be urgent
   because a reply is due on Friday; a critical-risk case can be quiet for
   months. Keeping them apart is the difference between a work queue and a
   liability report. */
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

/* What a party IS, which decides how it is matched: an entity resolves against
   the canonical registry, an individual does not. */
const PARTY_KINDS = ["Entity", "Individual", "Government Authority", "Other"];

const CURRENCIES = ["PKR", "USD", "AED", "GBP", "EUR", "SAR"];

const DOCUMENT_TYPES = ["Plaint", "Petition", "Summons", "Court Order", "Notice",
  "Complaint", "FIR", "Written Statement", "Application", "Appeal", "Evidence",
  "Correspondence", "Judgment", "Settlement", "Agreement", "Other"];

const HEARING_PURPOSES = ["Arguments", "Evidence", "Written Statement", "Orders",
  "Framing of Issues", "Final Hearing", "Miscellaneous Application", "Other"];

const HEARING_OUTCOMES = ["Adjourned", "Arguments Heard", "Order Reserved",
  "Order Passed", "Evidence Recorded", "Dismissed", "Allowed", "Partially Allowed",
  "Next Date Given", "Other"];

const CLOSURE_OUTCOMES = ["Won", "Lost", "Settled", "Withdrawn", "Dismissed",
  "Resolved", "Transferred", "Other"];

/* A CASE IS PENDING OR IT IS COMPLETED.
   "Open", "Active", "Pending", "On Hold" and "Closed" were five words for two
   states, and the register could not be filtered by status because no two
   people used them the same way. Stage still records where in the process a
   matter has got to; status records only whether it is still running.

   Every older value resolves through the aliases, so nothing in the source has
   to be rewritten and an imported row keeps its meaning. */
const STATUSES = ["Pending", "Completed"];
const STATUS_ALIASES = {
  open: "Pending", active: "Pending", pending: "Pending", "on hold": "Pending",
  ongoing: "Pending", "in progress": "Pending",
  closed: "Completed", completed: "Completed", disposed: "Completed",
  decided: "Completed", withdrawn: "Completed", settled: "Completed",
};
const canonStatus = (v) => {
  const k = String(v == null ? "" : v).trim().toLowerCase();
  if (!k) return "";
  if (STATUSES.includes(v)) return v;
  return STATUS_ALIASES[k] || "";
};

/* WHICH SIDE THE COMPANY IS ON, in the four words a pleading uses. This is not
   the same question as `direction` (did we bring it or did they): a company can
   be the petitioner in a matter brought against it. It drives filters, which
   procedural stages are relevant, and reporting. */
const COMPANY_POSITIONS = ["Plaintiff", "Defendant", "Petitioner", "Respondent"];
const canonPosition = (v) => {
  const k = String(v == null ? "" : v).trim().toLowerCase();
  if (!k) return "";
  const hit = COMPANY_POSITIONS.find((x) => x.toLowerCase() === k);
  if (hit) return hit;
  if (/claimant|applicant|complainant/.test(k)) return "Plaintiff";
  if (/accused|defendent/.test(k)) return "Defendant";
  if (/appellant/.test(k)) return "Petitioner";
  return "";
};

/* Who an information request goes to. A requester is OUTSIDE the litigation
   team and must never see internal case strategy. */
const ASK_RECIPIENTS = ["Requester", "Business Contact", "Internal Department", "Counsel"];

/* ------------------------------------------------------------ storage ---- */

function read() {
  if (cache) return cache;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache = Array.isArray(j.cases) ? j.cases : [];
  } catch (e) {
    cache = [];                        // no file yet is the normal first run
  }
  return cache;
}

function write(next) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ cases: next }, null, 2), "utf8");
    fs.renameSync(tmp, FILE);          // atomic: a crash mid-write cannot truncate it
    cache = next;
    return true;
  } catch (e) {
    return false;
  }
}

/* IDs are allocated against what is ON DISK, re-read inside the allocation, so
   two servers (or two clicks) cannot hand out the same number. Re-reading is
   cheap next to the cost of two cases sharing an id. */
function nextId() {
  let rows;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    rows = Array.isArray(j.cases) ? j.cases : [];
  } catch (e) { rows = read(); }
  let n = 0;
  for (const r of rows) {
    const m = String(r.id || "").match(/^LIT-(\d+)$/);
    if (m) n = Math.max(n, parseInt(m[1], 10));
  }
  return { id: "LIT-" + String(n + 1).padStart(5, "0"), rows };
}

/* ------------------------------------------------------------ helpers ---- */

const clean = (v, max = 400) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function asDate(v) {
  const s = clean(v, 40);
  if (!s) return "";
  const t = new Date(s);
  return isNaN(t) ? s : t.toISOString().slice(0, 10);
}

function num(v) {
  if (v == null || String(v).trim() === "") return "";
  const n = Number(String(v).replace(/[, ]/g, ""));
  return isNaN(n) ? "" : n;
}

/* The identity the server vouches for. Never taken from the request body, or
   anyone could file a case in somebody else's name. */
function stamp(who, me) {
  return {
    name: (me && me.name) || String((who && who.email) || "").split("@")[0].replace(/[._]/g, " ") || "Legal",
    email: (who && who.email) || null,
    designation: (me && me.role) || null,
  };
}

const canon = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* A case served on us starts where it actually starts. Forcing an incoming
   summons through "Drafting" makes the stage meaningless as a filter. */
function openingStage(direction) {
  /* Read through the alias map, so a case stored under an older direction
     still opens at the stage it always did. */
  if (canonDirection(direction) === "Against") return "Filed / Received";
  return "Intake";
}

/* ------------------------------------------------------------ shaping ---- */

function cleanParties(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const p of v.slice(0, 60)) {
    const name = clean(p && p.name, 200);
    if (!name) continue;
    const role = clean(p && p.role, 40);
    out.push({
      name,
      /* An unrecognised role is KEPT, not flattened to "Other". The register
         carries fifteen distinct positions and a pleading may name a role none
         of them cover; replacing it with "Other" discards what the document
         actually said. */
      role: role || "Other",
      kind: /individual/i.test(clean(p && p.kind, 20)) ? "Individual" : "Entity",
      /* The canonical entity this resolves to, when the caller matched one.
         The ORIGINAL wording is kept beside it: the tracker and the pleading
         spell company names differently and overwriting the source spelling
         loses the link back to the document. */
      entityId: clean(p && p.entityId, 120) || null,
      matchedName: clean(p && p.matchedName, 200) || null,
      counsel: clean(p && p.counsel, 160),
      contact: clean(p && p.contact, 160),
      isUs: !!(p && p.isUs),
    });
  }
  return out;
}

function cleanDocuments(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const d of v.slice(0, 200)) {
    const driveFileId = clean(d && d.driveFileId, 120);
    const uploadId = clean(d && d.uploadId, 120);
    const name = clean(d && d.name, 240);
    if (!name && !driveFileId && !uploadId) continue;
    /* Stable identity, so selecting the same file twice -- or an upload that is
       also the Drive copy -- produces one document, not two. */
    const key = driveFileId || uploadId || canon(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: "DOC-" + crypto.createHash("sha1").update(key).digest("hex").slice(0, 10).toUpperCase(),
      name: name || driveFileId || uploadId,
      driveFileId: driveFileId || null,
      uploadId: uploadId || null,
      kind: clean(d && d.kind, 60),
      source: clean(d && d.source, 60) || "selected",
      addedAt: nowIso(),
    });
  }
  return out;
}

function cleanDeadlines(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const d of v.slice(0, 60)) {
    const kind = clean(d && d.kind, 60);
    const due = asDate(d && d.dueDate);
    if (!due) continue;
    out.push({
      id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      kind: DEADLINE_KINDS.includes(kind) ? kind : "Other",
      dueDate: due,
      note: clean(d && d.note, 300),
      /* WHO put this date here. The system does not compute limitation periods
         -- see the note on statutory deadlines below -- so a deadline is either
         read off a document or entered by a lawyer, and the record says which. */
      setBy: clean(d && d.setBy, 60) || "legal",
      sourceDocument: clean(d && d.sourceDocument, 240) || null,
      done: false,
    });
  }
  return out;
}

function cleanMotions(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const m of v.slice(0, 50)) {
    const motion = clean(m && m.motion, 60);
    if (!motion || !MOTION_TYPES.includes(motion)) continue;
    const outcome = clean(m && m.outcome, 30);
    out.push({
      motion,
      filedDate: asDate(m && m.filedDate),
      outcome: MOTION_OUTCOMES.includes(outcome) ? outcome : "Pending",
      decidedDate: asDate(m && m.decidedDate),
      note: clean(m && m.note, 400),
    });
  }
  return out;
}

/* Where each auto-filled value came from. Kept whole, because "the system
   filled this in" is not an answer anyone can audit six months later. */
function cleanProvenance(v) {
  if (!v || typeof v !== "object") return {};
  const out = {};
  for (const [k, p] of Object.entries(v).slice(0, 80)) {
    if (!p || typeof p !== "object") continue;
    out[clean(k, 40)] = {
      sourceType: clean(p.sourceType, 40),        // request | notice | contract | document | manual
      sourceId: clean(p.sourceId, 120) || null,
      /* The human-readable label — "Plaint.pdf", "Legal notice N-204". The
         screen shows this; an id alone tells a reader nothing. */
      source: clean(p.source, 200) || "",
      documentId: clean(p.documentId, 120) || null,
      method: clean(p.method, 40) || "extracted",
      confidence: clean(p.confidence, 20) || "",
      snippet: clean(p.snippet, 240) || "",
      acceptedBy: clean(p.acceptedBy, 120) || null,
    };
  }
  return out;
}

/* --------------------------------------------------------- duplicates ---- */

/* Report likely duplicates; never merge. Two cases with the same court number
   are almost certainly one case, but "almost certainly" is not a licence to
   collapse a litigation record -- a wrongly merged case is a lost case. */
function findPossibleDuplicates(payload, trackerRows) {
  const p = payload || {};
  const hits = [];
  const wantNo = canon(p.courtCaseNumber);
  const wantTitle = canon(p.title || p.caseName);
  const wantParties = cleanParties(p.parties).map((x) => canon(x.name)).filter(Boolean);
  const wantCourt = canon((p.court && p.court.name) || p.court);

  const consider = (rec, source) => {
    let score = 0; const why = [];
    const recNo = canon(rec.courtCaseNumber || rec.caseNo);
    const recTitle = canon(rec.title || rec.caseName);
    if (wantNo && recNo && wantNo === recNo) { score += 60; why.push("same court case number"); }
    if (wantTitle && recTitle) {
      if (wantTitle === recTitle) { score += 30; why.push("same case title"); }
      else if (wantTitle.includes(recTitle) || recTitle.includes(wantTitle)) { score += 15; why.push("similar case title"); }
    }
    if (wantCourt && canon(rec.court && rec.court.name ? rec.court.name : rec.court) === wantCourt) { score += 10; why.push("same court"); }
    const recParties = (Array.isArray(rec.parties) ? rec.parties.map((x) => canon(x.name)) : [])
      .concat([canon(rec.entity)]).filter(Boolean);
    const shared = wantParties.filter((n) => recParties.some((r) => r && (r === n || r.includes(n) || n.includes(r))));
    if (shared.length >= 2) { score += 25; why.push("both parties match"); }
    else if (shared.length === 1) { score += 10; why.push("one party matches"); }
    if (score >= 40) {
      hits.push({
        id: rec.id, title: rec.title || rec.caseName || "(untitled)",
        court: (rec.court && rec.court.name) || rec.court || "",
        courtCaseNumber: rec.courtCaseNumber || rec.caseNo || "",
        source, score: Math.min(99, score), why,
      });
    }
  };

  for (const rec of read()) consider(rec, "LegalOS");
  for (const rec of (Array.isArray(trackerRows) ? trackerRows : [])) consider(rec, "Tracker");
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

/* ------------------------------------------------------------- create ---- */

/**
 * The one way a litigation case is created. Every entry point -- manual, from a
 * request, a notice, a contract, a project, an uploaded document, or the
 * assistant -- calls this.
 */
function createCase(payload, who, me, opts) {
  const b = payload || {};
  const o = opts || {};
  const errors = [];

  /* HARD-REQUIRED IS KEPT SMALL ON PURPOSE. A case that genuinely has no court
     number yet, no hearing and no documents is a real case, and refusing it
     would push the team back to a spreadsheet. */
  const title = clean(b.title || b.caseName, 300);
  if (!title) errors.push("a case title is required");

  /* THE BENCHMARK GROUPING IS DERIVED, NOT ASKED FOR.
     The register keeps ONE classification column -- `nature` -- mixing subject
     matter with procedural form, which is how this business files its cases.
     An earlier build asked for a separate "case type" from a 13-value list
     invented in this file that matched NONE of the 357 filed rows, so the two
     fields could never be joined back to the register. The broad family is now
     computed from the category. A caller may still send one explicitly (the
     assistant, an import) and it is validated as before. */
  /* Read through the aliases, so an imported row filed as "Commercial" resolves
     to Civil Disputes rather than being refused. */
  /* Same trap as direction: validate what the caller sent, then store the
     canonical form. A status outside the vocabulary is refused rather than
     quietly becoming "Pending". */
  const rawStatus = clean(b.status, 40);
  const statusValue = canonStatus(rawStatus) || "Pending";
  if (rawStatus && !canonStatus(rawStatus)) errors.push("status is not one of the recognised values");

  const rawCaseType = clean(b.caseType, 60);
  let caseType = canonCaseType(rawCaseType);
  if (rawCaseType && !caseType) errors.push("case type is not one of the recognised values");

  /* NOT a closed list. The register already holds 24 natures this business
     uses -- "Employee Dispute", "Non-Compete", "Civil Dispute" -- and only some
     of them appear in the canonical vocabulary. Rejecting anything outside it
     would refuse a value the lawyer picked from the estate's own data, which is
     the opposite of useful. NATURES is offered as suggestions; what is stored
     is what they chose. */
  const nature = clean(b.nature, 60);
  if (!caseType && nature) {
    try { caseType = require("./litigation-options").familyOf(nature) || ""; } catch (e) { caseType = ""; }
    /* familyOf may return a family that is not in the legacy CASE_TYPES list;
       that is fine -- it is a derived grouping, not a user-submitted value --
       but it must not then fail the validation above, which has already run. */
  }

  /* Stored canonically, so the register holds one spelling of a side rather
     than five, and an older value coming back in still resolves.

     VALIDATE THE RAW VALUE, NOT THE CANONICAL ONE. Checking the output of
     canonDirection() is a test that can never fail: an unrecognised direction
     canonicalises to "" and `if ("" && ...)` is never entered, so the register
     accepted any string at all and silently stored nothing. The refusal has to
     look at what the caller actually sent. */
  const rawDirection = clean(b.direction, 40);
  const direction = canonDirection(rawDirection);
  if (rawDirection && !direction) errors.push("case direction is not one of the recognised values");

  const risk = clean(b.risk, 20);
  if (risk && !RISKS.includes(risk)) errors.push("risk is not one of the recognised values");

  const priority = clean(b.priority, 20);
  if (priority && !PRIORITIES.includes(priority)) errors.push("priority is not one of the recognised values");

  const moduleKey = clean(b.moduleKey, 40) || "cases";
  if (!MODULES.includes(moduleKey)) errors.push("unknown module");

  if (errors.length) return { error: "invalid", errors };

  const rows0 = read();
  if (rows0.length >= MAX_RECORDS) return { error: "the case store is full" };

  /* Duplicates are reported, not resolved. The caller must pass
     `allowDuplicate` to proceed, which makes creating one a deliberate act
     recorded in the audit trail. */
  if (!o.allowDuplicate) {
    const dups = findPossibleDuplicates(b, o.trackerRows);
    if (dups.length) return { error: "possible_duplicate", duplicates: dups };
  }

  const { id, rows } = nextId();
  const now = nowIso();
  const by = stamp(who, me);
  const parties = cleanParties(b.parties);
  const documents = cleanDocuments(b.documents);
  const deadlines = cleanDeadlines(b.deadlines);
  const stage = WORKFLOW.includes(clean(b.stage, 40)) ? clean(b.stage, 40) : openingStage(direction);

  const court = {
    name: clean((b.court && b.court.name) || b.courtName, 160),
    jurisdiction: clean((b.court && b.court.jurisdiction) || b.jurisdiction, 120),
    city: clean((b.court && b.court.city) || b.city, 80),
    type: clean((b.court && b.court.type) || b.courtType, 80),
    bench: clean((b.court && b.court.bench) || b.bench, 120),
  };

  const links = {
    requestId: clean(b.links && b.links.requestId, 80) || null,
    noticeId: clean(b.links && b.links.noticeId, 120) || null,
    contractId: clean(b.links && b.links.contractId, 80) || null,
    projectId: clean(b.links && b.links.projectId, 120) || null,
    entityId: clean(b.links && b.links.entityId, 120) || null,
    caseIds: Array.isArray(b.links && b.links.caseIds) ? b.links.caseIds.map((x) => clean(x, 40)).filter(Boolean).slice(0, 20) : [],
  };

  /* AN OWNER MUST BE SOMEBODY WITH AN ACCOUNT.
     The menu offers the roster, but a menu is not a security boundary: a
     crafted request could otherwise assign a case to any string at all, and a
     case owned by "asdf" is a case nobody is accountable for. Unknown owners
     are refused rather than quietly replaced, so the caller learns the name
     was wrong instead of discovering later that the case went to whoever
     happened to raise it. */
  const resolveOwner = (v) => {
    const raw = clean(v, 120);
    if (!raw) return { ok: true, value: "" };
    try { return require("./litigation-options").resolveOwner(raw); }
    catch (e) { return { ok: true, value: raw }; }
  };
  const ownerR = resolveOwner(b.ownership && b.ownership.owner);
  if (!ownerR.ok) return { error: "invalid", errors: ["the case owner must be a LegalOS user"] };
  const backupR = resolveOwner(b.ownership && b.ownership.backup);
  if (!backupR.ok) return { error: "invalid", errors: ["the backup owner must be a LegalOS user"] };

  const ownership = {
    owner: ownerR.value || by.email,
    ownerName: clean(b.ownership && b.ownership.ownerName, 120)
      || (ownerR.owner && ownerR.owner.name) || by.name,
    team: clean(b.ownership && b.ownership.team, 60) || "litigation",
    backup: backupR.value || null,
  };

  const counselMode = /external/i.test(clean(b.counsel && b.counsel.mode, 20)) ? "External" : "Internal";
  const counsel = {
    mode: counselMode,
    firm: counselMode === "External" ? clean(b.counsel && b.counsel.firm, 160) : "",
    lead: clean(b.counsel && b.counsel.lead, 160),
    contact: clean(b.counsel && b.counsel.contact, 160),
    engagedAt: asDate(b.counsel && b.counsel.engagedAt),
    feeArrangement: clean(b.counsel && b.counsel.feeArrangement, 200),
  };

  /* EXPOSURE AND RECOVERABLE ARE HELD IN BOTH CURRENCIES, because the register
     holds them in both: exposurePKR/exposureUSD and recoverablePKR/
     recoverableUSD are real columns with real figures in them. A case raised in
     the app that could only record one currency would not reconcile against the
     357 rows already imported.

     `exposure` and `recovery` are kept as mirrors of the PKR figure so closure
     and the existing dashboards keep reading the field they always read. */
/* The approved PKR/USD rate, or null when no approved source is connected.
   NO FALLBACK RATE. A number invented here would be indistinguishable on screen
   from one a bank published, and an exposure figure is something Legal reports
   upward -- so when there is no approved source the product says the conversion
   is pending rather than showing a figure nobody can stand behind. */
function fxRate() {
  try {
    const l = (require("../config/compliance-rules.json").litigation || {}).fx || {};
    const r = Number(l.pkrPerUsd);
    if (!(r > 0)) return null;
    return { pkrPerUsd: r, asOf: l.asOf || null, source: l.source || null };
  } catch (e) { return null; }
}

/* Fill in whichever side of each pair the user did not type. Only ever fills a
   BLANK: a figure that was entered, in either currency, is left exactly as it
   was entered. */
function fxCounterparts(fin) {
  const fx = fxRate();
  const out = {};
  if (!fx) return out;
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && v !== "" && v != null ? x : null; };
  const round2 = (x) => Math.round(x * 100) / 100;
  const pairs = [["exposurePKR", "exposureUSD"], ["recoverablePKR", "recoverableUSD"]];
  const derived = [];
  for (const [pkrKey, usdKey] of pairs) {
    const pkr = n(fin[pkrKey] != null && fin[pkrKey] !== "" ? fin[pkrKey] : fin[pkrKey.replace("PKR", "")]);
    const usd = n(fin[usdKey]);
    if (pkr != null && usd == null) { out[usdKey] = round2(pkr / fx.pkrPerUsd); derived.push(usdKey); }
    else if (usd != null && pkr == null) { out[pkrKey] = round2(usd * fx.pkrPerUsd); derived.push(pkrKey); }
  }
  if (derived.length) {
    out.converted = { fields: derived, pkrPerUsd: fx.pkrPerUsd, asOf: fx.asOf, source: fx.source };
  }
  return out;
}

/* What the screen should say about conversion when it cannot do one. Carried on
   the record so the UI never has to guess whether a missing USD figure means
   "nobody entered one" or "we have no rate". */
function fxStatus() {
  const fx = fxRate();
  return fx
    ? { available: true, pkrPerUsd: fx.pkrPerUsd, asOf: fx.asOf, source: fx.source }
    : { available: false, reason: "No approved FX source is configured, so amounts are shown only in the currency they were entered in." };
}

  const fin = (b.financial || {});
  const firstNum = (...vals) => { for (const v of vals) { const n = num(v); if (n !== "") return n; } return ""; };
  const financial = {
    currency: clean(fin.currency, 8) || "PKR",
    /* The claimed amount and OUR exposure are different numbers. Equating them
       would overstate the book the moment a claim is inflated, which is most of
       the time. Legal sets exposure itself. */
    claimed: num(fin.claimed),
    exposurePKR: firstNum(fin.exposurePKR, fin.exposure),
    exposureUSD: num(fin.exposureUSD),
    recoverablePKR: firstNum(fin.recoverablePKR, fin.recovery),
    recoverableUSD: num(fin.recoverableUSD),
    exposure: firstNum(fin.exposurePKR, fin.exposure),
    recovery: firstNum(fin.recoverablePKR, fin.recovery),
    /* THE OTHER CURRENCY, DERIVED AND LABELLED AS DERIVED.
       A case raised in the app records one figure in one currency, so a claim
       entered as PKR 10,000 showed "PKR 10.0K" and nothing else, while the
       imported rows carry both columns. The counterpart is computed from the
       configured rate -- never stored over a figure somebody actually entered,
       and never presented as one: `converted` says which side was derived, at
       what rate, as of when. No rate configured means no conversion, rather
       than a number nobody can source. */
    ...fxCounterparts(fin),
    fx: fxStatus(),
    legalCost: num(fin.legalCost),
    settlement: num(fin.settlement),
    reserve: num(fin.reserve),
  };

  const dates = {
    incident: asDate(b.dates && b.dates.incident),
    /* TWO NOTICE DATES, BECAUSE THEY ARE TWO FACTS.
       A notice is issued on one day and reaches the company on another, and
       the gap between them is exactly what a limitation argument turns on.
       One "Notice date" field forced whoever typed it to pick which of the two
       they meant and gave the reader no way to tell which they got.

       `notice` stays as the issuance date so every existing record keeps its
       meaning -- it is not re-pointed at the new field -- and reads back under
       both names. */
    noticeIssued: asDate((b.dates && (b.dates.noticeIssued || b.dates.notice))),
    noticeReceived: asDate(b.dates && b.dates.noticeReceived),
    notice: asDate((b.dates && (b.dates.noticeIssued || b.dates.notice))),
    filing: asDate((b.dates && b.dates.filing) || b.filingDate),
    service: asDate(b.dates && b.dates.service),
    nextHearing: asDate((b.dates && b.dates.nextHearing) || b.nextHearing),
    responseDue: asDate(b.dates && b.dates.responseDue),
    lastHearing: asDate(b.dates && b.dates.lastHearing),
  };

  /* A hearing date IS a deadline. Leaving it only in a date field is how a
     hearing gets missed: nothing watches a plain date. */
  if (dates.nextHearing && !deadlines.some((d) => d.kind === "Next Hearing")) {
    deadlines.push({
      id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      kind: "Next Hearing", dueDate: dates.nextHearing, note: "", setBy: "legal",
      sourceDocument: null, done: false,
    });
  }

  const quality = (() => {
    const q = clean(b.dataQuality, 30);
    if (DATA_QUALITY.includes(q)) return q;
    if (!court.name || !parties.length) return "NEEDS_INFORMATION";
    return "COMPLETE";
  })();

  const timeline = [{
    id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    at: now, by: by.email, byName: by.name,
    kind: "Case Raised",
    text: "Case raised in LegalOS" + (b.sourceLabel ? " from " + clean(b.sourceLabel, 80) : ""),
    meta: { sourceType: clean(b.sourceType, 40) || "manual" },
  }];
  if (ownership.owner) {
    timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
      kind: "Owner Assigned", text: "Owner set to " + (ownership.ownerName || ownership.owner), meta: {} });
  }
  for (const d of documents) {
    timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
      kind: "Document Added", text: d.name, meta: { documentId: d.id } });
  }
  for (const d of deadlines) {
    timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
      kind: "Deadline Added", text: d.kind + " — " + d.dueDate, meta: { deadlineId: d.id } });
  }

  const rec = {
    id,
    /* The court's own reference. Never the primary key: it is not unique across
       forums, it changes on transfer, and it does not exist yet for a case we
       are about to file. */
    courtCaseNumber: clean(b.courtCaseNumber || b.caseNo, 80),
    title,
    /* No default side. "Other" was never an answer to "whose case is this",
       and defaulting to it made every case with an unstated direction look
       deliberately classified. Unstated stays unstated. */
    caseType, nature, direction: direction || "",
    status: statusValue,
    /* Which side the company is on, in the words a pleading uses. Taken from
       the caller where given, otherwise read off the party this company is
       recorded as -- the register already knows, and asking twice for a fact
       it holds is how two answers end up disagreeing. */
    companyPosition: canonPosition(clean(b.companyPosition || b.position, 40))
      || (() => {
        const us = (parties || []).find((x) => x && x.isUs);
        return us ? canonPosition(us.role) : "";
      })(),
    /* The court's own page for THIS matter. Stored per case: a province-wide
       portal address tells a lawyer where to start searching, not where the
       case is. */
    courtPortalUrl: (() => {
      const u = clean(b.courtPortalUrl || (b.court && b.court.portalUrl), 500);
      return /^https?:\/\//i.test(u) ? u : "";
    })(),
    stage,
    summary: clean(b.summary || b.proceedings, 6000),
    moduleKey,
    entity: clean(b.entity, 200),
    entityId: links.entityId,
    court, parties, dates, deadlines, financial, ownership, counsel, links,
    risk: risk || "",
    priority: priority || "Normal",
    motions: cleanMotions(b.motions),
    /* Hearings are first-class: a case is heard many times and each sitting has
       its own purpose, outcome, judge and documents. Keeping them as a list
       rather than overwriting one "next hearing" field is what makes a case
       history readable. */
    hearings: [],
    /* Open questions put to a requester, a business contact or counsel, and
       what came back. This is the two-way half of intake. */
    informationRequests: [],
    /* Internal legal notes NEVER travel to a requester. Held apart from
       messages for exactly that reason. */
    internalNotes: [],
    documents,
    timeline,
    provenance: cleanProvenance(b.provenance),
    dataQuality: quality,
    /* Imported and native cases live in one estate but must stay tellable
       apart: one is evidence of what the business recorded in Drive, the other
       of what somebody entered here. */
    sourceType: "LEGALOS_NATIVE",
    origin: "LEGALOS",
    draft: false,
    createdBy: by, createdAt: now, updatedAt: now,
    closedAt: null,
    audit: [{ at: now, by: by.email, action: "Case created", detail: clean(b.sourceLabel, 120) || "manual" }],
  };

  if (o.allowDuplicate) {
    rec.audit.push({ at: now, by: by.email, action: "Created despite a possible duplicate", detail: clean(o.duplicateNote, 200) || "" });
  }

  if (Buffer.byteLength(JSON.stringify(rec), "utf8") > MAX_RECORD_BYTES) {
    return { error: "the case record is too large" };
  }

  /* One write. Everything above is assembled in memory first so a failure
     cannot leave a case with parties but no timeline. */
  if (!write(rows.concat([rec]))) return { error: "the case could not be saved" };
  return { ok: true, id: rec.id, case: rec };
}

/* ------------------------------------------------------------- update ---- */

const SIGNIFICANT = new Set(["caseType", "nature", "direction", "status", "stage",
  "risk", "priority", "entity", "courtCaseNumber", "title"]);

/* WHEN A LAWYER CORRECTS AN EXTRACTED VALUE, KEEP BOTH.
   A field that was read out of a plaint and then corrected has two truths: what
   the document says and what the team decided. Overwriting the first destroys
   the ability to ask "where did this come from" six months later, and makes the
   extraction impossible to audit or improve. */
function recordCorrection(rec, field, from, to, by) {
  const p = (rec.provenance || {})[field];
  if (!p) return;
  rec.provenance = Object.assign({}, rec.provenance, {
    [field]: Object.assign({}, p, {
      correctedFrom: p.correctedFrom !== undefined ? p.correctedFrom : from,
      correctedTo: to,
      correctedBy: by && by.email,
      correctedAt: nowIso(),
      method: "corrected by hand",
    }),
  });
}

function patchCase(id, body, who, me) {
  const rows = read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { error: "not found" };
  const b = body || {};
  const rec = JSON.parse(JSON.stringify(rows[i]));
  const by = stamp(who, me);
  const now = nowIso();
  const changed = [];

  for (const k of ["title", "courtCaseNumber", "status", "stage", "summary", "entity", "risk", "priority", "caseType", "nature", "direction"]) {
    if (b[k] === undefined) continue;
    const v = clean(b[k], k === "summary" ? 6000 : 300);
    if (v === rec[k]) continue;
    if (k === "caseType" && v && !canonCaseType(v)) return { error: "invalid", errors: ["case type is not recognised"] };
    if (k === "risk" && v && !RISKS.includes(v)) return { error: "invalid", errors: ["risk is not recognised"] };
    if (k === "priority" && v && !PRIORITIES.includes(v)) return { error: "invalid", errors: ["priority is not recognised"] };
    if (k === "status" && v && !canonStatus(v)) return { error: "invalid", errors: ["status is not recognised"] };
    /* Closing a case is not a field edit. It needs an outcome and a date, so it
       goes through closeCase where those are captured. */
    if (k === "status" && v === "Closed") return { error: "invalid", errors: ["close the case through Close Case, so the outcome is recorded"] };
    if (k === "stage" && v && !WORKFLOW.includes(v)) return { error: "invalid", errors: ["stage is not recognised"] };
    changed.push({ field: k, from: rec[k], to: v });
    /* A corrected extraction keeps BOTH values. */
    recordCorrection(rec, k, rec[k], v, by);
    rec[k] = v;
  }
  for (const grp of ["court", "financial", "ownership", "counsel", "dates"]) {
    if (!b[grp] || typeof b[grp] !== "object") continue;
    for (const [k, v0] of Object.entries(b[grp])) {
      const v = grp === "financial" ? num(v0) : grp === "dates" ? asDate(v0) : clean(v0, 200);
      if (rec[grp] && rec[grp][k] === v) continue;
      changed.push({ field: grp + "." + k, from: rec[grp] ? rec[grp][k] : undefined, to: v });
      rec[grp] = Object.assign({}, rec[grp], { [k]: v });
    }
  }
  if (Array.isArray(b.parties)) { rec.parties = cleanParties(b.parties); changed.push({ field: "parties", from: "", to: rec.parties.length + " parties" }); }
  if (Array.isArray(b.motions)) { rec.motions = cleanMotions(b.motions); changed.push({ field: "motions", from: "", to: rec.motions.length + " motions" }); }

  if (!changed.length) return { error: "nothing to change" };

  rec.updatedAt = now;
  for (const c of changed) {
    rec.audit.push({ at: now, by: by.email, action: "Changed " + c.field, detail: String(c.from || "—") + " → " + String(c.to || "—") });
    /* A material change belongs on the timeline, where the case's story is
       read. A typo fix does not, or the timeline becomes a changelog nobody
       scrolls. */
    if (SIGNIFICANT.has(c.field)) {
      rec.timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
        kind: "Field Changed", text: c.field + ": " + String(c.from || "—") + " → " + String(c.to || "—"), meta: {} });
    }
  }
  const next = rows.slice(); next[i] = rec;
  if (!write(next)) return { error: "the change could not be saved" };
  return { ok: true, case: rec };
}

/* Add a hearing, an order, or any other case event, and let it move the case
   forward: a hearing with a next date updates the next-hearing deadline rather
   than leaving two versions of the truth. */
function addEvent(id, body, who, me) {
  const rows = read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { error: "not found" };
  const b = body || {};
  const kind = clean(b.kind, 60) || "Internal Note";
  const rec = JSON.parse(JSON.stringify(rows[i]));
  const by = stamp(who, me);
  const now = nowIso();

  const ev = {
    id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    at: now, by: by.email, byName: by.name, kind,
    text: clean(b.text || b.notes || b.purpose, 2000),
    occurredOn: asDate(b.date || b.hearingDate || b.orderDate),
    meta: {},
  };

  if (/hearing/i.test(kind)) {
    ev.meta = {
      court: clean(b.court, 160), purpose: clean(b.purpose, 200),
      outcome: clean(b.outcome, 400), judge: clean(b.judge, 160),
    };
    const nextDate = asDate(b.nextHearing);
    if (nextDate) {
      rec.dates = Object.assign({}, rec.dates, { nextHearing: nextDate, lastHearing: ev.occurredOn || rec.dates.nextHearing });
      rec.deadlines = (rec.deadlines || []).filter((d) => d.kind !== "Next Hearing").concat([{
        id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        kind: "Next Hearing", dueDate: nextDate, note: clean(b.purpose, 200),
        setBy: "legal", sourceDocument: clean(b.sourceDocument, 240) || null, done: false,
      }]);
      rec.timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
        kind: "Deadline Added", text: "Next Hearing — " + nextDate, meta: {} });
    }
    if (rec.stage === "Intake" || rec.stage === "Review") rec.stage = "Hearing";
  }

  if (Array.isArray(b.documents) && b.documents.length) {
    const add = cleanDocuments(b.documents).filter((d) => !(rec.documents || []).some((x) => x.id === d.id));
    rec.documents = (rec.documents || []).concat(add);
    for (const d of add) {
      rec.timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
        kind: "Document Added", text: d.name, meta: { documentId: d.id } });
    }
  }

  rec.timeline.push(ev);
  rec.audit.push({ at: now, by: by.email, action: "Added " + kind, detail: ev.text.slice(0, 120) });
  rec.updatedAt = now;
  const next = rows.slice(); next[i] = rec;
  if (!write(next)) return { error: "the event could not be saved" };
  return { ok: true, case: rec, event: ev };
}

/* ------------------------------------------------- operational services -- */

/* Every mutation below goes through this: load, mutate in memory, write once,
   and record what happened on BOTH the audit trail and the timeline. A mutation
   that updates the record but not the history leaves a case nobody can explain. */
function mutate(id, who, me, fn) {
  const rows = read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { error: "not found" };
  const rec = JSON.parse(JSON.stringify(rows[i]));
  const by = stamp(who, me);
  const now = nowIso();
  const events = [];
  const audit = (action, detail) => rec.audit.push({ at: now, by: by.email, action, detail: String(detail || "").slice(0, 200) });
  const event = (kind, text, meta) => {
    const e = { id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name, kind, text: String(text || "").slice(0, 2000), meta: meta || {} };
    rec.timeline.push(e); events.push(e); return e;
  };
  const out = fn({ rec, by, now, audit, event });
  if (out && out.error) return out;
  rec.updatedAt = now;
  const next = rows.slice(); next[i] = rec;
  if (!write(next)) return { error: "the change could not be saved" };
  return { ok: true, case: rec, events };
}

/* ---- hearings ---- */

function addHearing(id, body, who, me) {
  const b = body || {};
  const date = asDate(b.date || b.hearingDate);
  if (!date) return { error: "invalid", errors: ["a hearing date is required"] };
  const purpose = clean(b.purpose, 200);
  const outcome = clean(b.outcome, 60);
  if (outcome && !HEARING_OUTCOMES.includes(outcome)) return { error: "invalid", errors: ["that hearing outcome is not recognised"] };

  return mutate(id, who, me, ({ rec, audit, event }) => {
    const h = {
      id: "HRG-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      date, court: clean(b.court, 160) || (rec.court && rec.court.name) || "",
      purpose, judge: clean(b.judge, 160),
      /* A hearing in the future has not happened yet. Recording it as
         "Scheduled" is what lets the team see what is coming rather than only
         what is past. */
      status: date > new Date().toISOString().slice(0, 10) ? "Scheduled" : (outcome ? "Completed" : "Scheduled"),
      outcome: outcome || "", notes: clean(b.notes, 2000),
      documents: cleanDocuments(b.documents),
      nextHearing: asDate(b.nextHearing),
      recordedAt: nowIso(),
    };
    rec.hearings = (rec.hearings || []).concat([h]);

    /* ADDING A HEARING SUPERSEDES THE ONE IT REPLACES.
       A case has exactly one next hearing. The date that was the next hearing
       becomes the LAST hearing, and there is never more than one "Next Hearing"
       deadline on the case.

       This used to happen only when the user also filled in "Next hearing" on
       the form. Leave that box blank -- which is the normal thing to do when
       you are recording the sitting you have just been given a date for -- and
       the old deadline stayed exactly where it was, so the case showed
       "Next Hearing 23 Sep" and "Next Hearing 30 Sep" one under the other with
       nothing to say which one anybody should turn up for. */
    const prevNext = (rec.dates && rec.dates.nextHearing) || "";
    /* What the case is now waiting for: an explicit next date if one was given,
       otherwise this hearing itself while it is still ahead of us. */
    const upcoming = h.nextHearing || (date > new Date().toISOString().slice(0, 10) ? date : "");
    /* What has already been heard: whichever dates are now behind the upcoming
       one. A hearing entered out of order must not drag the last-heard date
       backwards, so the later of the two wins. */
    const behind = [prevNext, date].filter((d) => d && (!upcoming || d < upcoming));
    const lastHeard = behind.sort().pop() || (rec.dates && rec.dates.lastHearing) || "";

    rec.dates = Object.assign({}, rec.dates, {
      nextHearing: upcoming || "",
      lastHearing: lastHeard || "",
    });

    /* One kind, one deadline. Rebuilt rather than appended to, so a case can
       never accumulate a second "Next Hearing". */
    rec.deadlines = (rec.deadlines || []).filter((d) => d.kind !== "Next Hearing");
    if (upcoming) {
      rec.deadlines = rec.deadlines.concat([{
        id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        kind: "Next Hearing", dueDate: upcoming, note: purpose,
        setBy: "legal", sourceDocument: clean(b.sourceDocument, 240) || null, done: false,
      }]);
      event("Deadline Added", "Next Hearing — " + upcoming, { hearingId: h.id });
    }
    if (prevNext && prevNext !== upcoming) {
      event("Hearing Superseded", "Previous next hearing " + prevNext + " is now the last hearing", { hearingId: h.id });
    }
    if (rec.stage === "Intake" || rec.stage === "Review") rec.stage = "Hearing";
    event("Hearing " + h.status, [date, purpose, outcome].filter(Boolean).join(" · "), { hearingId: h.id });
    audit("Hearing added", date + " " + purpose);
    return { hearing: h };
  });
}

/* Complete a hearing that was scheduled, rather than adding a second one for
   the same sitting. */
function updateHearing(id, hearingId, body, who, me) {
  const b = body || {};
  const outcome = clean(b.outcome, 60);
  if (outcome && !HEARING_OUTCOMES.includes(outcome)) return { error: "invalid", errors: ["that hearing outcome is not recognised"] };
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const h = (rec.hearings || []).find((x) => x.id === hearingId);
    if (!h) return { error: "not found" };
    if (outcome) { h.outcome = outcome; h.status = "Completed"; }
    if (b.notes !== undefined) h.notes = clean(b.notes, 2000);
    if (b.judge !== undefined) h.judge = clean(b.judge, 160);
    if (b.date !== undefined) h.date = asDate(b.date) || h.date;
    const nd = asDate(b.nextHearing);
    if (nd) {
      /* Completing a hearing supersedes its own date the same way adding one
         does: the sitting just heard becomes the last hearing, the new date
         becomes the next, and there is still exactly one such deadline. */
      const prevNext = (rec.dates && rec.dates.nextHearing) || "";
      const behind = [prevNext, h.date].filter((d) => d && d < nd);
      h.nextHearing = nd;
      rec.dates = Object.assign({}, rec.dates, {
        nextHearing: nd,
        lastHearing: behind.sort().pop() || (rec.dates && rec.dates.lastHearing) || "",
      });
      rec.deadlines = (rec.deadlines || []).filter((d) => d.kind !== "Next Hearing").concat([{
        id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        kind: "Next Hearing", dueDate: nd, note: h.purpose, setBy: "legal", sourceDocument: null, done: false,
      }]);
      event("Deadline Added", "Next Hearing — " + nd, { hearingId: h.id });
    }
    if (Array.isArray(b.documents) && b.documents.length) {
      const add = cleanDocuments(b.documents).filter((d) => !(rec.documents || []).some((x) => x.id === d.id));
      rec.documents = (rec.documents || []).concat(add);
      h.documents = (h.documents || []).concat(add);
      for (const d of add) event("Document Added", d.name, { documentId: d.id, hearingId: h.id });
    }
    event("Hearing Updated", [h.date, h.outcome].filter(Boolean).join(" · "), { hearingId: h.id });
    audit("Hearing updated", h.date + " " + (h.outcome || ""));
    return { hearing: h };
  });
}

/* ---- deadlines ---- */

/* ---- deleting a case -----------------------------------------------------
 *
 * SOFT, REASONED, AND IT KEEPS THE AUTHOR.
 *
 * A hard delete takes the creator, the hearings, the documents and the audit
 * trail with it, and leaves nobody able to answer "what happened to that
 * matter" -- which is the one question somebody always asks afterwards. The
 * case leaves the active register and keeps everything it had.
 *
 * A reason is required. "Who deleted this" without "why" tells a reader that
 * something was removed and nothing about whether it should have been.
 */
function deleteCase(id, body, who, me) {
  const reason = clean((body || {}).reason, 500);
  if (!reason) return { error: "invalid", errors: ["a reason is required to delete a case"] };
  return mutate(id, who, me, ({ rec, by, now, audit, event }) => {
    if (rec.deletedAt) return { error: "invalid", errors: ["that case is already deleted"] };
    rec.deletedAt = now;
    /* `by` is the verified actor mutate() already resolved — the same stamp
       every other change on this record carries. */
    rec.deletedBy = by;
    rec.deletionReason = reason;
    /* The creator is NOT cleared. Losing it on delete is exactly the gap this
       exists to close. */
    event("Case Deleted", reason, {});
    audit("Case deleted", reason);
    return { case: { id: rec.id, deletedAt: rec.deletedAt, deletedBy: rec.deletedBy, deletionReason: reason } };
  });
}

function restoreCase(id, who, me) {
  return mutate(id, who, me, ({ rec, by, now, audit, event }) => {
    if (!rec.deletedAt) return { error: "invalid", errors: ["that case is not deleted"] };
    rec.deletedAt = null;
    rec.restoredBy = by;
    rec.restoredAt = now;
    /* deletedBy and the reason stay on the record: that it was once deleted,
       by whom and why, is part of its history and not something a restore
       should erase. */
    event("Case Restored", "", {});
    audit("Case restored", "");
    return { case: { id: rec.id, restoredAt: rec.restoredAt, restoredBy: rec.restoredBy } };
  });
}

/* ---- invoices and retainers ---------------------------------------------
 *
 * WHAT OUTSIDE COUNSEL HAS BILLED, AND WHAT HAS BEEN PAID.
 *
 * Two populations, kept apart because they answer different questions:
 *
 *   INVOICES are billed against a CASE. A case fee, a TA/DA claim, an expense.
 *   RETAINERS are billed against a FIRM, not a matter -- an engagement is
 *            retained for a year and the fee has no case to sit under. Filing
 *            a retainer against whichever case happens to be open is how a
 *            case's cost becomes a number nobody can explain.
 *
 * PAYMENT % AND OUTSTANDING ARE DERIVED, from the amount and what has been
 * paid, EXCEPT where an imported record already states them. A historical row
 * that says 40% when its own figures say 38% is telling us something about
 * what was agreed; silently recomputing it destroys that and makes the import
 * unreconcilable against its source. So a stated value wins, and the fact that
 * it was stated rather than computed travels with it.
 */
const INVOICE_NATURES = ["Case Fee", "TADA", "Miscellaneous Expenses"];
const INVOICE_STATUSES = ["Unpaid", "Partially Paid", "Paid", "Disputed"];

/* "" means NOBODY STATED A FIGURE. 0 means somebody stated zero.
   Collapsing the two is what made an invoice with no stated payment percentage
   look like one stated as 0% -- which then counted as "the record says so",
   suppressed the derivation, and reported a 250,000 invoice as fully paid. */
const money = (v) => {
  const raw = String(v == null ? "" : v).replace(/[,\s]/g, "").trim();
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : "";
};

/* What a case's invoice looks like once cleaned. Every field is one the brief
   asks for; a blank stays blank rather than being defaulted to zero, because
   "nothing billed" and "billed nothing" are different statements. */
function cleanInvoice(b, existing) {
  const amount = money(b.amount);
  const paid = money(b.amountPaid);
  const statedPct = money(b.paymentPercent);
  const statedOut = money(b.outstanding);

  /* Derived unless the record states otherwise. `derived` says which. */
  const canDerive = amount !== "" && amount > 0;
  const pct = statedPct !== "" ? statedPct : (canDerive && paid !== "" ? Math.round((paid / amount) * 1000) / 10 : "");
  const outstanding = statedOut !== "" ? statedOut : (canDerive ? Math.round((amount - (paid || 0)) * 100) / 100 : "");

  const status = INVOICE_STATUSES.includes(clean(b.status, 30)) ? clean(b.status, 30)
    : (outstanding !== "" && outstanding <= 0 ? "Paid"
      : (paid !== "" && paid > 0 ? "Partially Paid" : "Unpaid"));

  return {
    id: (existing && existing.id) || "INV-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    invoiceDate: asDate(b.invoiceDate),
    invoiceNumber: clean(b.invoiceNumber, 80),
    jeffiNo: clean(b.jeffiNo, 80),
    nature: INVOICE_NATURES.includes(clean(b.nature, 60)) ? clean(b.nature, 60) : clean(b.nature, 60),
    amount, currency: clean(b.currency, 8) || "PKR",
    amountPaid: paid, paymentDate: asDate(b.paymentDate),
    paymentPercent: pct, outstanding,
    transactionId: clean(b.transactionId, 80),
    invoicedTo: clean(b.invoicedTo, 200),
    issuingFirm: clean(b.issuingFirm || b.firm, 200),
    status,
    notes: clean(b.notes, 2000),
    documents: cleanDocuments(b.documents),
    /* Which of the two computed fields came from the record rather than from
       us. A reader auditing a total needs to know. */
    derived: { paymentPercent: statedPct === "", outstanding: statedOut === "" },
    recordedAt: (existing && existing.recordedAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function addInvoice(id, body, who, me) {
  const b = body || {};
  if (money(b.amount) === "" ) return { error: "invalid", errors: ["an invoice amount is required"] };
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const inv = cleanInvoice(b);
    rec.invoices = (rec.invoices || []).concat([inv]);
    /* AN INVOICE'S DOCUMENT IS ONE OF THE CASE'S DOCUMENTS.
       Not a copy: the same logical document, listed under the invoice and in
       the case's Documents tab, so a bill can be found from either direction
       without two binary records to keep in step. */
    const add = (inv.documents || []).filter((d) => !(rec.documents || []).some((x) => x.id === d.id));
    if (add.length) rec.documents = (rec.documents || []).concat(add);
    event("Invoice Recorded", [inv.invoiceNumber, inv.nature, inv.currency + " " + inv.amount].filter(Boolean).join(" · "),
      { invoiceId: inv.id });
    audit("Invoice recorded", (inv.invoiceNumber || inv.id) + " " + inv.currency + " " + inv.amount);
    return { invoice: inv };
  });
}

function updateInvoice(id, invoiceId, body, who, me) {
  const b = body || {};
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const i = (rec.invoices || []).findIndex((x) => x.id === invoiceId);
    if (i === -1) return { error: "not found" };
    const before = rec.invoices[i];
    const merged = cleanInvoice({ ...before, ...b }, before);
    rec.invoices[i] = merged;
    const add = (merged.documents || []).filter((d) => !(rec.documents || []).some((x) => x.id === d.id));
    if (add.length) rec.documents = (rec.documents || []).concat(add);
    /* What actually changed, field by field, so the audit is readable. */
    const moved = ["amount", "amountPaid", "paymentDate", "status", "outstanding"]
      .filter((k) => String(before[k]) !== String(merged[k]))
      .map((k) => k + ": " + (before[k] === "" ? "—" : before[k]) + " → " + (merged[k] === "" ? "—" : merged[k]));
    event("Invoice Updated", moved.join(" · ") || "no change", { invoiceId });
    audit("Invoice updated", (merged.invoiceNumber || invoiceId) + (moved.length ? " — " + moved.join("; ") : ""));
    return { invoice: merged };
  });
}

function addDeadline(id, body, who, me) {
  const b = body || {};
  const due = asDate(b.dueDate);
  const kind = clean(b.kind, 60);
  if (!due) return { error: "invalid", errors: ["a due date is required"] };
  if (kind && !DEADLINE_KINDS.includes(kind)) return { error: "invalid", errors: ["that deadline type is not recognised"] };
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const d = {
      id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      kind: kind || "Other", dueDate: due, note: clean(b.note, 300),
      /* Statutory limitation periods are NOT computed here. A deadline is
         either read off a document or entered by a lawyer, and the record says
         which -- a date the system invented and nobody checked is worse than no
         date at all. */
      setBy: clean(b.setBy, 60) || "legal",
      sourceDocument: clean(b.sourceDocument, 240) || null, done: false,
    };
    rec.deadlines = (rec.deadlines || []).concat([d]);
    event("Deadline Added", d.kind + " — " + d.dueDate, { deadlineId: d.id });
    audit("Deadline added", d.kind + " " + d.dueDate);
    return { deadline: d };
  });
}

function completeDeadline(id, deadlineId, body, who, me) {
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const d = (rec.deadlines || []).find((x) => x.id === deadlineId);
    if (!d) return { error: "not found" };
    d.done = true;
    d.completedAt = nowIso();
    d.completionNote = clean((body || {}).note, 300);
    event("Deadline Completed", d.kind + " — " + d.dueDate, { deadlineId: d.id });
    audit("Deadline completed", d.kind);
    return { deadline: d };
  });
}

/* ---- parties ---- */

function addParty(id, body, who, me) {
  const p = cleanParties([body || {}])[0];
  if (!p) return { error: "invalid", errors: ["a party name is required"] };
  return mutate(id, who, me, ({ rec, audit, event }) => {
    /* The same party added twice is a data-entry slip, not two parties. */
    if ((rec.parties || []).some((x) => canon(x.name) === canon(p.name) && x.role === p.role)) {
      return { error: "invalid", errors: ["that party is already on the case in that role"] };
    }
    rec.parties = (rec.parties || []).concat([p]);
    event("Party Added", p.name + " (" + p.role + ")", {});
    audit("Party added", p.name + " " + p.role);
    return { party: p };
  });
}

function removeParty(id, name, role, who, me) {
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const before = (rec.parties || []).length;
    rec.parties = (rec.parties || []).filter((x) => !(canon(x.name) === canon(name) && (!role || x.role === role)));
    if (rec.parties.length === before) return { error: "not found" };
    event("Party Removed", clean(name, 200), {});
    audit("Party removed", clean(name, 200));
    return {};
  });
}

/* ---- counsel ---- */

function assignCounsel(id, body, who, me) {
  const b = body || {};
  const mode = /external/i.test(clean(b.mode, 20)) ? "External" : "Internal";
  const lead = clean(b.lead, 160);
  if (!lead && !clean(b.firm, 160)) return { error: "invalid", errors: ["name the counsel or the firm"] };
  return mutate(id, who, me, ({ rec, audit, event }) => {
    const from = (rec.counsel && (rec.counsel.lead || rec.counsel.firm)) || "none";
    rec.counsel = {
      mode, firm: mode === "External" ? clean(b.firm, 160) : "",
      lead, contact: clean(b.contact, 160),
      engagedAt: asDate(b.engagedAt), feeArrangement: clean(b.feeArrangement, 200),
      /* Co-counsel is common and a single field cannot hold it. */
      coCounsel: Array.isArray(b.coCounsel) ? b.coCounsel.map((x) => clean(x, 160)).filter(Boolean).slice(0, 10) : (rec.counsel && rec.counsel.coCounsel) || [],
    };
    event("Counsel Assigned", [mode, lead, rec.counsel.firm].filter(Boolean).join(" · "), {});
    audit("Counsel changed", from + " → " + (lead || rec.counsel.firm));
    return { counsel: rec.counsel };
  });
}

/* ---- documents ---- */

function attachDocument(id, body, who, me) {
  const docs = cleanDocuments(Array.isArray(body) ? body : [body || {}]);
  if (!docs.length) return { error: "invalid", errors: ["nothing to attach"] };
  return mutate(id, who, me, ({ rec, audit, event }) => {
    /* Stable identity means the same Drive file or upload selected twice is one
       document on the case, not two rows that later disagree. */
    const add = docs.filter((d) => !(rec.documents || []).some((x) => x.id === d.id));
    if (!add.length) return { error: "invalid", errors: ["already attached"] };
    rec.documents = (rec.documents || []).concat(add);
    for (const d of add) { event("Document Added", d.name, { documentId: d.id }); audit("Document attached", d.name); }
    return { documents: add };
  });
}

/* ---- two-way communication ---- */

/* Ask somebody outside the litigation team for something, and track it until it
   comes back. Without this the "two-way" flow is a lawyer sending an email and
   remembering to chase it. */
function requestInformation(id, body, who, me) {
  const b = body || {};
  const to = clean(b.recipientType, 40) || "Requester";
  if (!ASK_RECIPIENTS.includes(to)) return { error: "invalid", errors: ["unknown recipient"] };
  const question = clean(b.question, 2000);
  if (!question) return { error: "invalid", errors: ["say what is being asked for"] };
  return mutate(id, who, me, ({ rec, by, audit, event }) => {
    const ask = {
      id: "ASK-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      recipientType: to, recipient: clean(b.recipient, 160),
      question, documentsWanted: clean(b.documentsWanted, 400),
      dueDate: asDate(b.dueDate),
      status: "Sent", sentAt: nowIso(), sentBy: by.email,
      responses: [],
    };
    rec.informationRequests = (rec.informationRequests || []).concat([ask]);
    if (ask.dueDate) {
      rec.deadlines = (rec.deadlines || []).concat([{
        id: "DL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
        kind: "Other", dueDate: ask.dueDate, note: "Response due: " + question.slice(0, 80),
        setBy: "legal", sourceDocument: null, done: false,
      }]);
    }
    event("Information Requested", to + ": " + question.slice(0, 160), { askId: ask.id });
    audit("Information requested", to);
    return { ask };
  });
}

function respondInformation(id, askId, body, who, me) {
  const b = body || {};
  const text = clean(b.text, 4000);
  const docs = cleanDocuments(b.documents);
  if (!text && !docs.length) return { error: "invalid", errors: ["a response needs a message or a document"] };
  return mutate(id, who, me, ({ rec, by, audit, event }) => {
    const ask = (rec.informationRequests || []).find((x) => x.id === askId);
    if (!ask) return { error: "not found" };
    const resp = { at: nowIso(), by: by.email, byName: by.name, text, documents: docs };
    ask.responses = (ask.responses || []).concat([resp]);
    ask.status = "Responded";
    ask.respondedAt = resp.at;
    const add = docs.filter((d) => !(rec.documents || []).some((x) => x.id === d.id));
    rec.documents = (rec.documents || []).concat(add);
    for (const d of add) event("Document Added", d.name, { documentId: d.id, askId });
    /* The answer belongs to the case, not only to the thread. */
    event("Information Received", (text || docs.map((d) => d.name).join(", ")).slice(0, 200), { askId });
    audit("Information received", ask.recipientType);
    /* Any deadline raised for this question is satisfied. */
    for (const d of (rec.deadlines || [])) {
      if (!d.done && d.note && d.note.startsWith("Response due:")) { d.done = true; d.completedAt = resp.at; }
    }
    return { ask };
  });
}

/* An internal note is privileged. It is held separately from anything a
   requester can see, and it is never copied into a response thread. */
function addInternalNote(id, body, who, me) {
  const text = clean((body || {}).text, 4000);
  if (!text) return { error: "invalid", errors: ["the note is empty"] };
  return mutate(id, who, me, ({ rec, by, audit, event }) => {
    const n = { id: "NOTE-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: nowIso(), by: by.email, byName: by.name, text };
    rec.internalNotes = (rec.internalNotes || []).concat([n]);
    event("Internal Note", text.slice(0, 160), { internal: true, noteId: n.id });
    audit("Internal note added", "");
    return { note: n };
  });
}

function reopenCase(id, body, who, me) {
  return mutate(id, who, me, ({ rec, audit, event }) => {
    if (rec.status !== "Closed") return { error: "invalid", errors: ["the case is not closed"] };
    rec.status = "Open";
    rec.stage = clean((body || {}).stage, 40) && WORKFLOW.includes(clean((body || {}).stage, 40)) ? clean((body || {}).stage, 40) : "Proceedings";
    rec.closedAt = null;
    event("Case Reopened", clean((body || {}).reason, 400), {});
    audit("Case reopened", clean((body || {}).reason, 200));
    return {};
  });
}

function closeCase(id, body, who, me) {
  const rows = read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { error: "not found" };
  const rec = JSON.parse(JSON.stringify(rows[i]));
  const by = stamp(who, me); const now = nowIso();
  const b = body || {};
  const outcome = clean(b.outcome, 400);
  if (outcome && !CLOSURE_OUTCOMES.includes(outcome)) {
    return { error: "invalid", errors: ["that closure outcome is not recognised"] };
  }
  rec.status = "Closed";
  rec.stage = "Closed";
  /* A DECIDED CASE RECORDS WHEN IT WAS DECIDED, WHAT THE RESULT WAS, AND WHY.
     Closure used to write a date and one word. That is enough to take a matter
     off the active list and not nearly enough to report on: "Dismissed" with
     no summary tells the next reader nothing about whether the company came
     out ahead, and there was nowhere to put the judgment's own reasoning. The
     summary and the final notes are stored on the record, not only in the
     audit trail, so they are readable from the case page and exportable with
     the register. */
  rec.closedAt = asDate(b.decisionDate) || asDate(b.closureDate) || now.slice(0, 10);
  rec.decisionDate = rec.closedAt;
  rec.outcome = outcome;
  rec.outcomeSummary = clean(b.outcomeSummary, 2000);
  rec.finalNotes = clean(b.notes, 2000);
  rec.financial = Object.assign({}, rec.financial, {
    settlement: num(b.settlement) !== "" ? num(b.settlement) : rec.financial.settlement,
    recovery: num(b.recovery) !== "" ? num(b.recovery) : rec.financial.recovery,
    exposure: num(b.finalExposure) !== "" ? num(b.finalExposure) : rec.financial.exposure,
  });
  rec.timeline.push({ id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(), at: now, by: by.email, byName: by.name,
    kind: "Case Decided", text: [rec.outcome, rec.outcomeSummary].filter(Boolean).join(" — ") || "Decided", meta: { decisionDate: rec.decisionDate } });
  rec.audit.push({ at: now, by: by.email, action: "Case marked decided",
    detail: [rec.outcome, rec.outcomeSummary].filter(Boolean).join(" — ").slice(0, 400) });
  rec.updatedAt = now;
  const next = rows.slice(); next[i] = rec;
  if (!write(next)) return { error: "the closure could not be saved" };
  return { ok: true, case: rec };
}

/* ------------------------------------------------------------- access ---- */

const list = () => read().filter((r) => !r.draft);
const listAll = () => read().slice();
const get = (id) => read().find((r) => r.id === id) || null;
const count = () => list().length;

/* Drafts do not count as cases. A half-finished intake inflating "open cases"
   on the dashboard would make the number useless. */
function saveDraft(body, who, me) {
  const rows = read();
  const by = stamp(who, me); const now = nowIso();
  const draftId = clean(body && body.draftId, 40);
  const existing = draftId ? rows.findIndex((r) => r.id === draftId && r.draft) : -1;
  const payload = Object.assign({}, body || {});
  delete payload.draftId;
  if (existing >= 0) {
    const rec = Object.assign({}, rows[existing], { payload, updatedAt: now });
    const next = rows.slice(); next[existing] = rec;
    if (!write(next)) return { error: "the draft could not be saved" };
    return { ok: true, draftId: rec.id };
  }
  const id = "DRAFT-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  const rec = { id, draft: true, payload, createdBy: by, createdAt: now, updatedAt: now, sourceType: "LEGALOS_NATIVE" };
  if (!write(rows.concat([rec]))) return { error: "the draft could not be saved" };
  return { ok: true, draftId: id };
}

const listDrafts = (email) => read().filter((r) => r.draft && (!email || (r.createdBy && r.createdBy.email === email)));

function deleteDraft(id) {
  const rows = read();
  const next = rows.filter((r) => !(r.id === id && r.draft));
  if (next.length === rows.length) return { error: "not found" };
  if (!write(next)) return { error: "the draft could not be removed" };
  return { ok: true };
}

/* The register reads this file on every build; a long-lived server that never
   re-read it would serve the case list as it stood at boot. */
function reload() { cache = null; return read().length; }

module.exports = {
  createCase, patchCase, addEvent, closeCase, reopenCase, findPossibleDuplicates,
  addHearing, updateHearing, addDeadline, completeDeadline,
  addParty, removeParty, assignCounsel, attachDocument,
  requestInformation, respondInformation, addInternalNote,
  list, listAll, get, count, reload, saveDraft, listDrafts, deleteDraft, FILE,
  addInvoice, updateInvoice, INVOICE_NATURES, INVOICE_STATUSES,
  deleteCase, restoreCase,
  MODULES, CASE_TYPES, canonCaseType, NATURES, DIRECTIONS, canonDirection,
  STATUSES, canonStatus, COMPANY_POSITIONS, canonPosition,
  PARTY_ROLES, RISKS, PRIORITIES,
  PARTY_KINDS, CURRENCIES, DOCUMENT_TYPES, HEARING_PURPOSES, HEARING_OUTCOMES,
  CLOSURE_OUTCOMES, STATUSES, ASK_RECIPIENTS,
  DEADLINE_KINDS, MOTION_TYPES, MOTION_OUTCOMES, WORKFLOW, DATA_QUALITY,
};
