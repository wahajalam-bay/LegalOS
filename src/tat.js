// Workstream G — the TAT engine.
//
// Turnaround time is AUTO-FIXED, never manually negotiated: at triage the engine
// reads `type × risk` out of TAT_MATRIX (working days), stamps the clock, and from
// then on every list, card and spine reads the same computed verdict:
//
//     On Track  ·  Due Today  ·  Delayed (+n working days, blocked at <stage>)
//
// The clock runs on WORKING days and PAUSES whenever the ball is not with legal
// (i.e. the active stage's holder is the business or the counterparty) — legal is
// not accountable for time it cannot spend.
//
// Deliberately dependency-free (no React, no store) so it is pure and testable.
import { TAT_MATRIX, TAT_REQUEST_FACTOR, lifecyclePathFor, stageMeta } from "./data.js";

/* ---------------- working-day arithmetic ---------------- */
// Fri/Sat is the KSA + PK working week's weekend for the group's legal team.
const WEEKEND = new Set([5, 6]); // 5 = Friday, 6 = Saturday
export const isWorkingDay = (dt) => !WEEKEND.has(dt.getDay());

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const asDate = (d) => (d instanceof Date ? d : new Date(d));

// n working days after `from` (n = 0 → the next working day at or after `from`).
export function addWorkingDays(from, n) {
  const x = startOfDay(asDate(from));
  while (!isWorkingDay(x)) x.setDate(x.getDate() + 1);
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    x.setDate(x.getDate() + 1);
    if (isWorkingDay(x)) left -= 1;
  }
  return x;
}

// Whole working days elapsed from `a` to `b` (0 if b precedes a).
export function workingDaysBetween(a, b) {
  let x = startOfDay(asDate(a));
  const end = startOfDay(asDate(b));
  if (end <= x) return 0;
  let n = 0;
  while (x < end) {
    x = new Date(x.getTime() + 86400000);
    if (isWorkingDay(x)) n += 1;
  }
  return n;
}

/* ---------------- the matrix lookup ---------------- */
// type × risk → working days, scaled by what kind of request it is.
export function tatDaysFor(type, risk, requestType) {
  const row = TAT_MATRIX[type] || TAT_MATRIX.default;
  const base = row[(risk || "medium").toLowerCase()] != null ? row[(risk || "medium").toLowerCase()] : TAT_MATRIX.default.medium;
  const factor = TAT_REQUEST_FACTOR[requestType] == null ? 1 : TAT_REQUEST_FACTOR[requestType];
  return Math.max(1, Math.round(base * factor));
}

// The record's own type key: contract type first, then legacy request type.
export const tatTypeKey = (rec = {}) => rec.contractType || rec.type || "default";

// Called at triage (and by submitLegalRequest) — this is the whole "auto-fix".
export function fixTat(rec = {}, fixedAtIso) {
  const days = tatDaysFor(tatTypeKey(rec), rec.risk || rec.riskPreliminary, rec.requestType);
  const fixedAt = fixedAtIso || new Date().toISOString();
  return { days, fixedAt, dueAt: addWorkingDays(fixedAt, days).toISOString(), basis: `${tatTypeKey(rec)} × ${(rec.risk || rec.riskPreliminary || "medium").toLowerCase()}` };
}

/* ---------------- pause accounting ---------------- */
// Working days a record spent with the ball outside legal, per its stage log.
export function pausedWorkingDays(stageLog = [], now = new Date()) {
  let paused = 0;
  stageLog.forEach((s) => {
    const ball = s.ballWith || stageMeta(s.stage).ball;
    if (ball === "legal") return;
    paused += workingDaysBetween(s.enteredAt, s.exitedAt || now);
  });
  return paused;
}

/* ---------------- the verdict ---------------- */
export const TAT_STATUS = { ON_TRACK: "On Track", DUE: "Due Today", DELAYED: "Delayed" };
export const TAT_TONE = { "On Track": "green", "Due Today": "amber", "Delayed": "red" };

// Everything a UI needs to render the TAT cell, including WHAT is delayed.
// `stages` is the resolved spine stage list (see flow.js#buildStages).
export function computeTat(rec = {}, stages = [], now = new Date()) {
  const tat = rec.tat && rec.tat.days
    ? rec.tat
    : fixTat(rec, rec.requestDate || rec.created || rec.opened || rec.start);

  const log = stages.length
    ? stages.filter((s) => s.enteredAt).map((s) => ({ stage: s.name, enteredAt: s.enteredAt, exitedAt: s.exitedAt, ballWith: s.ballWith }))
    : (rec.stageLog || []);

  const clockStart = tat.fixedAt || rec.requestDate || rec.created || rec.opened || rec.start || now;
  const elapsed = workingDaysBetween(clockStart, now);
  const paused = pausedWorkingDays(log, now);
  const netElapsed = Math.max(0, elapsed - paused);
  const remaining = tat.days - netElapsed;

  // The stage holding the ball right now is what "is delayed" points at.
  const active = stages.find((s) => s.state === "active" || s.state === "blocked") || null;
  const activeMeta = active ? stageMeta(active.name) : null;
  const daysInStage = active && active.enteredAt ? workingDaysBetween(active.enteredAt, now) : 0;

  let status = TAT_STATUS.ON_TRACK;
  if (remaining < 0) status = TAT_STATUS.DELAYED;
  else if (remaining === 0) status = TAT_STATUS.DUE;

  // A record already at a terminal stage is never "delayed" — it landed.
  const path = lifecyclePathFor(rec.requestType);
  const terminal = path[path.length - 1];
  const done = !active || active.name === terminal || rec.progress === 100 || /Approved|Completed|Executed|Active|Closed|Signed/.test(rec.status || "");
  if (done) status = TAT_STATUS.ON_TRACK;

  return {
    days: tat.days,
    basis: tat.basis,
    fixedAt: tat.fixedAt,
    dueAt: tat.dueAt,
    elapsed: netElapsed,
    paused,
    remaining,
    overdueBy: remaining < 0 ? Math.abs(remaining) : 0,
    status,
    tone: TAT_TONE[status],
    done,
    // "delayed → shows WHAT is delayed"
    blockingStage: status === TAT_STATUS.DELAYED && active ? active.name : null,
    blockingOwner: status === TAT_STATUS.DELAYED && active ? active.owner : null,
    blockingBall: active ? (active.ballWith || (activeMeta || {}).ball) : null,
    daysInStage,
    // Progress against the allowance, for meters.
    pct: tat.days ? Math.min(100, Math.round((netElapsed / tat.days) * 100)) : 0,
  };
}

// One-line human summary used in table cells and card footers.
export function tatLabel(t) {
  if (!t) return "—";
  if (t.status === TAT_STATUS.DELAYED) {
    return t.blockingStage
      ? `Delayed ${t.overdueBy}d — ${t.blockingStage}`
      : `Delayed ${t.overdueBy}d`;
  }
  if (t.status === TAT_STATUS.DUE) return "Due today";
  return `${Math.max(0, t.remaining)}d left of ${t.days}d`;
}

// "TAT Analysis" cell: the allowance and how it has actually been consumed.
export function tatAnalysis(t) {
  if (!t) return "—";
  const parts = [`${t.elapsed}/${t.days} working days`];
  if (t.paused > 0) parts.push(`${t.paused}d paused`);
  return parts.join(" · ");
}
