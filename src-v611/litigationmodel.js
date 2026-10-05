/* THE LITIGATION MODEL — lifecycle, outcome, position, age and claim value.
 *
 * One file, because these five questions are asked on the register, the record
 * page, the analytics tab and the dashboard, and the moment each screen
 * answers them for itself they start disagreeing. Everything here is DERIVED
 * FROM THE SOURCE and says so; nothing guesses a result the record does not
 * state.
 *
 * The rule that shapes the whole file: A CASE'S LIFECYCLE AND ITS OUTCOME ARE
 * DIFFERENT FACTS. "Completed" tells you the matter is over. It does not tell
 * you whether the company won, and treating a closed case as a good one is how
 * a success rate ends up being a count of finished work.
 */

const low = (v) => String(v == null ? "" : v).toLowerCase();

/* ------------------------------------------------------------- LIFECYCLE -- */

export const LIFECYCLE = ["Active", "Decided"];

/* Active until the source says otherwise. A case with no status is a live
   matter nobody has updated, not a finished one. */
export function lifecycleOf(c) {
  if (!c) return "Active";
  if (c.lifecycle === "Active" || c.lifecycle === "Decided") return c.lifecycle;   // recorded here
  const s = low(c.rawStatus || c.status);
  if (/complet|closed|disposed|decided|withdraw|dismiss|settl/.test(s)) return "Decided";
  return "Active";
}
export const isActiveCase = (c) => lifecycleOf(c) === "Active";

/* --------------------------------------------------------------- OUTCOME -- */

/* The seven states a finished matter can be in. "Not Recorded" is a first-class
   answer, not a gap to be filled: a decided case whose result nobody wrote down
   is a real and reportable condition, and it is excluded from the success-rate
   denominator (§72) rather than quietly counted as a loss. */
export const OUTCOMES = [
  "Successful / Won",
  "Adverse / Lost",
  "Settled",
  "Withdrawn",
  "Dismissed",
  "Partial / Other",
  "Not Recorded",
];
/* THE SHORT FORM, for a column that has to fit beside nine others. The full
   name is the record's; this is what a pill says. The long form is always on
   the pill's title attribute, so nothing is lost to a reader who wants it. */
export const OUTCOME_SHORT = {
  "Successful / Won": "Won",
  "Adverse / Lost": "Lost",
  "Settled": "Settled",
  "Withdrawn": "Withdrawn",
  "Dismissed": "Dismissed",
  "Partial / Other": "Partial",
  "Not Recorded": "Not recorded",
};
export const OUTCOME_TONE = {
  "Successful / Won": "green",
  "Adverse / Lost": "red",
  "Settled": "blue",
  "Withdrawn": "gray",
  "Dismissed": "gray",
  "Partial / Other": "amber",
  "Not Recorded": "gray",
};

/* WIN AND LOSS ARE NEVER INFERRED FROM STATUS.
   Only two things can say a case was won: somebody recording it through Mark
   Decided (which writes `outcomeCode`), or the source's own outcome column
   saying so in words. "Dismissed" is deliberately its OWN bucket rather than
   being read as a win — a suit dismissed against the company and a suit of the
   company's that was dismissed are opposite results from identical text, and
   the register does not carry enough to tell them apart. */
/* The closure vocabulary the server accepts, mapped onto the seven reported
   states. Keeping the map here rather than widening the server's list means a
   case closed before this pass reports correctly without being re-saved. */
export const CLOSURE_TO_OUTCOME = {
  won: "Successful / Won",
  lost: "Adverse / Lost",
  settled: "Settled",
  withdrawn: "Withdrawn",
  dismissed: "Dismissed",
  resolved: "Partial / Other",
  transferred: "Partial / Other",
  other: "Partial / Other",
};

export function outcomeOf(c) {
  if (!c) return "Not Recorded";
  if (c.outcomeCode && OUTCOMES.includes(c.outcomeCode)) return c.outcomeCode;
  if (lifecycleOf(c) === "Active") return "Not Recorded";
  const exact = CLOSURE_TO_OUTCOME[low(c.outcome).trim()];
  if (exact) return exact;
  const t = low(c.outcome) + " " + low(c.rawStatus || c.status);
  if (/in (our|the compan(y|ies)) favou?r|decree[d]? in favou?r|award(ed)? in favou?r|\bwon\b|succeeded|allowed in favou?r/.test(t)) return "Successful / Won";
  if (/against (us|the compan)|decree[d]? against|\blost\b|adverse/.test(t)) return "Adverse / Lost";
  if (/settl|compromis|amicab|out of court/.test(t)) return "Settled";
  if (/withdraw/.test(t)) return "Withdrawn";
  if (/dismiss/.test(t)) return "Dismissed";
  if (/part(ly|ial)/.test(t)) return "Partial / Other";
  return "Not Recorded";
}

/* The denominator for a success rate. A live case has no result yet and an
   unrecorded one is unknown — counting either is what turns a success rate
   into a completion rate. */
export const DECIDED_WITH_RESULT = new Set(["Successful / Won", "Adverse / Lost", "Settled", "Withdrawn", "Dismissed", "Partial / Other"]);
export function successRate(cases) {
  const decided = cases.filter((c) => DECIDED_WITH_RESULT.has(outcomeOf(c)));
  if (!decided.length) return null;                      // null, never 0% — they are different answers
  const good = decided.filter((c) => outcomeOf(c) === "Successful / Won").length;
  return Math.round((good / decided.length) * 100);
}

/* -------------------------------------------------------------- POSITION -- */

/* FOR / AGAINST — is the company bringing this, or answering it?
   Read off the source's own "Company Position" / "For-Against" column. A row
   whose column is blank is "Not stated in source", never assigned a side. */
export function positionOf(c) {
  const p = low(c && c.position);
  if (!p.trim()) return "Not stated in source";
  if (/^for\b|plaintiff|petitioner|complainant|appellant|claimant|applicant/.test(p)) return "For";
  if (/^against\b|defendant|respondent|accused|opponent/.test(p)) return "Against";
  return "Not stated in source";
}
export const POSITIONS = ["For", "Against", "Not stated in source"];

/* ------------------------------------------------------------------ CITY -- */

/* THE CITY IS READ OUT OF THE COURT, AND LABELLED AS SUCH.
   The litigation trackers carry no city column. They do carry the forum, and a
   Pakistani forum names its seat ("Lahore High Court", "Civil Court Karachi",
   "NAB Court, Rawalpindi"). Matching the court against the known seats is a
   derivation from a source value — not an invention — and anything that does
   not match stays honestly blank rather than being assigned a plausible city. */
const CITIES = [
  "Islamabad", "Rawalpindi", "Lahore", "Karachi", "Faisalabad", "Multan", "Peshawar", "Quetta",
  "Gujranwala", "Sialkot", "Hyderabad", "Sukkur", "Bahawalpur", "Sargodha", "Sahiwal", "Abbottabad",
  "Mardan", "Gujrat", "Sheikhupura", "Kasur", "Okara", "Jhelum", "Chakwal", "Attock", "Murree",
  "Mirpur", "Muzaffarabad", "Gilgit", "Sukkar", "Nawabshah", "Larkana",
];
export function cityOf(c) {
  const hay = (c && (c.court || "")) + " " + (c && (c.jurisdiction || ""));
  const hit = CITIES.find((city) => new RegExp("\\b" + city + "\\b", "i").test(hay));
  return hit || "Not stated in source";
}

/* ----------------------------------------------------------- CLAIM VALUE -- */

/* TOTAL CLAIMS VALUE, NOT "EXPOSURE".
   The tracker's column is what the other side is claiming (or what the company
   is claiming). Calling it exposure asserts an accounting position the legal
   register has no basis for. Currency is preserved: PKR and USD are totalled
   SEPARATELY and never added, because there is no rate in the source and an
   invented one produces a confident wrong number. */
export function claimTotals(cases) {
  let pkr = 0, usd = 0, quantified = 0;
  for (const c of cases) {
    const p = Number(c.exposurePKR || 0);
    const u = Number(c.exposureUSD || 0);
    if (p > 0) { pkr += p; }
    if (u > 0) { usd += u; }
    if (p > 0 || u > 0) quantified++;
  }
  return { pkr, usd, quantified, total: cases.length };
}
export function recoverableTotals(cases) {
  let pkr = 0, usd = 0, quantified = 0;
  for (const c of cases) {
    const p = Number(c.recoverablePKR || 0);
    const u = Number(c.recoverableUSD || 0);
    if (p > 0) pkr += p;
    if (u > 0) usd += u;
    if (p > 0 || u > 0) quantified++;
  }
  return { pkr, usd, quantified, total: cases.length };
}

/* ------------------------------------------------------------------ AGING */

/* HOW LONG A MATTER HAS RUN.
   Active: from filing to today. Decided: from filing to the decision. A case
   with no filing date has no age — it is reported as such rather than being
   aged from the epoch, which is how a 2024 matter ends up in the "2+ years"
   bucket with 20,000 days against it. */
export const AGE_BUCKETS = [
  { id: "d30",  label: "0–30 days",   max: 30 },
  { id: "d90",  label: "31–90 days",  max: 90 },
  { id: "d180", label: "91–180 days", max: 180 },
  { id: "d365", label: "181–365 days", max: 365 },
  { id: "y2",   label: "1–2 years",   max: 730 },
  { id: "y2p",  label: "2 years +",   max: Infinity },
];
export function ageDays(c, now = new Date()) {
  const filed = c && c.filed ? new Date(c.filed) : null;
  if (!filed || isNaN(filed)) return null;
  const end = lifecycleOf(c) === "Decided" && c.closedDate && !isNaN(new Date(c.closedDate))
    ? new Date(c.closedDate) : now;
  const d = Math.round((end - filed) / 86400000);
  return d >= 0 ? d : null;
}
export function ageBucket(c, now) {
  const d = ageDays(c, now);
  if (d == null) return null;
  return (AGE_BUCKETS.find((b) => d <= b.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1]).id;
}

/* ---------------------------------------------------------- YEAR / FIRMS -- */

export const filedYear = (c) => (c && c.filed ? String(c.filed).slice(0, 4) : null);

/* Per-firm performance, on the §72 definition. The firm name is the source's
   own counsel string; a case with no counsel recorded is grouped under
   "Counsel not recorded" rather than dropped, because "we do not know who ran
   142 matters" is itself a finding. */
export function byLawFirm(cases) {
  const m = new Map();
  for (const c of cases) {
    const key = (c.counsel && c.counsel !== "—" ? c.counsel : "Counsel not recorded").trim();
    let f = m.get(key);
    if (!f) { f = { firm: key, cases: [], active: 0, decided: 0, won: 0, adverse: 0, other: 0, unrecorded: 0 }; m.set(key, f); }
    f.cases.push(c);
    if (lifecycleOf(c) === "Active") f.active++;
    else {
      f.decided++;
      const o = outcomeOf(c);
      if (o === "Successful / Won") f.won++;
      else if (o === "Adverse / Lost") f.adverse++;
      else if (o === "Not Recorded") f.unrecorded++;
      else f.other++;
    }
  }
  return [...m.values()].map((f) => ({
    ...f,
    successRate: successRate(f.cases),
    claims: claimTotals(f.cases),
  })).sort((a, b) => b.cases.length - a.cases.length);
}

/* A plain counter used by every chart on the analytics tab. */
export function countBy(rows, fn) {
  const m = new Map();
  for (const r of rows) {
    const k = fn(r);
    if (k == null || k === "") continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
