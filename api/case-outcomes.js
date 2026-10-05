/* WHAT HAPPENED TO A CASE — RECORDED, NEVER INFERRED.
 *
 * A decision is the single most reportable fact a litigation department has,
 * and until now there was nowhere to put one for the cases that matter. The
 * case store (litigation-cases.js) holds only the matters raised inside
 * LegalOS — one of them. The other three hundred and fifty-seven come from the
 * Drive trackers, are read-only, and had no decision action at all: a lawyer
 * could log a hearing on them but could not say the case was won.
 *
 * So the outcome lives here, as an OVERLAY keyed by case id. The tracker row
 * stays exactly as Drive has it; this records what the department knows on top
 * of it, with who said so and when. Nothing is written back to Drive.
 *
 * `outcomeCode` is one of the seven reported states (see src/litigationmodel.js)
 * and is the ONLY thing that makes the product report a win. Everything else on
 * the register is text the tracker happened to carry, and this file never
 * guesses from it.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = path.join(__dirname, "..", "config", "case-outcomes.json");

/* The seven states, exactly as the product reports them. A code outside this
   list is refused rather than stored — a register with an eighth outcome in it
   silently breaks every count that groups by outcome. */
const OUTCOME_CODES = [
  "Successful / Won",
  "Adverse / Lost",
  "Settled",
  "Withdrawn",
  "Dismissed",
  "Partial / Other",
  "Not Recorded",
];

let cache = null;

function read() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch (e) { cache = {}; }
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) cache = {};
  return cache;
}

function write(next) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + "\n");
    cache = next;
    return true;
  } catch (e) { return false; }
}

const clean = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const asDate = (v) => {
  const s = clean(v, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

/* Every recorded decision, by case id. */
const all = () => read();
const get = (caseId) => read()[String(caseId)] || null;

/* Record (or correct) the decision on a case.
   A correction is a normal thing — the first entry after a judgment is often
   "Dismissed" and becomes "Partial / Other" once counsel has read the order —
   so previous entries are kept in `history` rather than overwritten away. */
function record(caseId, body, who, me) {
  const id = clean(caseId, 64);
  if (!id) return { error: "invalid", errors: ["no case id"] };
  const b = body || {};
  const code = clean(b.outcomeCode, 40);
  if (!OUTCOME_CODES.includes(code)) {
    return { error: "invalid", errors: ["that outcome is not one of: " + OUTCOME_CODES.join(", ")] };
  }
  const decisionDate = asDate(b.decisionDate);
  if (!decisionDate) return { error: "invalid", errors: ["a decision date is required, as dd/mm/yyyy"] };
  /* A decision cannot have happened tomorrow. This is the one date check worth
     making here: a typo in the year turns a decided case into a live one with a
     hearing in 2036 and nobody notices for a year. */
  const today = new Date().toISOString().slice(0, 10);
  if (decisionDate > today) return { error: "invalid", errors: ["the decision date is in the future"] };

  const now = new Date().toISOString();
  const byEmail = (me && me.email) || (who && who.email) || who || "";
  const byName = (me && me.name) || "";
  const store = read();
  const prev = store[id];
  const entry = {
    caseId: id,
    outcomeCode: code,
    decisionDate,
    summary: clean(b.summary, 2000),
    judgment: clean(b.judgment, 400),
    notes: clean(b.notes, 2000),
    recordedAt: now,
    recordedBy: byEmail,
    recordedByName: byName,
    id: "OUT-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    history: prev ? [...(prev.history || []), {
      outcomeCode: prev.outcomeCode, decisionDate: prev.decisionDate, summary: prev.summary,
      judgment: prev.judgment, notes: prev.notes,
      recordedAt: prev.recordedAt, recordedBy: prev.recordedBy,
    }] : [],
  };
  const next = Object.assign({}, store, { [id]: entry });
  if (!write(next)) return { error: "the decision could not be saved" };
  return { ok: true, outcome: entry };
}

/* Take a decision back off a case — for a row decided in error. The history is
   kept, so "it was never decided" and "somebody undid it" stay different. */
function clear(caseId, who, me) {
  const id = clean(caseId, 64);
  const store = read();
  if (!store[id]) return { error: "not found" };
  const next = Object.assign({}, store);
  delete next[id];
  if (!write(next)) return { error: "the decision could not be cleared" };
  return { ok: true };
}

/* Apply every recorded decision onto a register's rows, in place.
   Called from the register build so the case register, the KPIs, the analytics
   and the export all read the same thing. The row keeps whatever the tracker
   said in `status`; what this adds is the department's own recorded verdict. */
function applyTo(rows) {
  const store = read();
  let applied = 0;
  for (const r of (rows || [])) {
    const o = store[r.id];
    if (!o) continue;
    r.outcomeCode = o.outcomeCode;
    r.decisionDate = o.decisionDate;
    r.outcomeSummary = o.summary;
    r.judgmentRef = o.judgment;
    r.finalNotes = o.notes;
    r.outcomeRecordedBy = o.recordedByName || o.recordedBy;
    r.outcomeRecordedAt = o.recordedAt;
    /* "Not Recorded" is a real answer, and it does NOT decide the case.
       Everything else does: the department has said what happened, so the
       matter is off the live book whatever the tracker's status column says. */
    if (o.outcomeCode !== "Not Recorded") {
      r.lifecycle = "Decided";
      r.status = "Closed";
    }
    applied++;
  }
  return applied;
}

function reload() { cache = null; return Object.keys(read()).length; }

module.exports = { OUTCOME_CODES, all, get, record, clear, applyTo, reload };
