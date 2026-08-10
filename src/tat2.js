// TAT Engine v2 — Section 9 of the Functional Requirements Document.
// TAT measures actual Legal working time, not calendar time:
//   • the clock starts on assignment
//   • an Intra-Dept Hold pauses the clock (department + sender + structured reason)
//   • reported TAT = gross working time minus paused time
//   • statuses: Running / Paused / Overdue / Closed
// Pure functions on the record shape { stageLog, holds, dateRaised, status } —
// no React, unit-testable. Working-day math (Fri/Sat weekend) comes from tat.js.
import { workingDaysBetween, asDate } from "./tat.js";
import { slaFor, workflowOf, totalSla } from "./modules.js";

// When did the legal clock start? First "Assigned" stage entry; if the record
// was never explicitly assigned, fall back to when it was raised.
export function assignedAt(rec = {}) {
  const hit = (rec.stageLog || []).find((s) => /assigned/i.test(s.stage));
  return hit ? hit.at : rec.dateRaised || null;
}

export function closedAt(rec = {}) {
  if (rec.closedAt) return rec.closedAt;
  const log = rec.stageLog || [];
  const hit = [...log].reverse().find((s) => /closed|executed|renewed|resolved|registered/i.test(s.stage));
  return hit ? hit.at : null;
}

export const openHold = (rec = {}) => (rec.holds || []).find((h) => !h.end) || null;

// Working days consumed by holds, clamped to [start of clock, now/closure].
export function heldWorkingDays(rec = {}, now = new Date()) {
  const from = assignedAt(rec);
  if (!from) return 0;
  const cap = closedAt(rec) || now;
  let total = 0;
  for (const h of rec.holds || []) {
    const a = asDate(h.start) < asDate(from) ? from : h.start;
    const b = h.end || cap;
    if (asDate(b) > asDate(a)) total += workingDaysBetween(a, b);
  }
  return total;
}

export function grossWorkingDays(rec = {}, now = new Date()) {
  const from = assignedAt(rec);
  if (!from) return 0;
  return workingDaysBetween(from, closedAt(rec) || now);
}

// Reported TAT = gross minus paused — delays caused by other departments do
// not count against Legal.
export const reportedTat = (rec, now = new Date()) =>
  Math.max(0, grossWorkingDays(rec, now) - heldWorkingDays(rec, now));

// How long the record has sat in its CURRENT stage (working days, net of holds
// that overlap the stage window).
export function stageAge(rec = {}, now = new Date()) {
  const log = rec.stageLog || [];
  const last = log[log.length - 1];
  if (!last) return 0;
  const cap = closedAt(rec) || now;
  let gross = workingDaysBetween(last.at, cap);
  for (const h of rec.holds || []) {
    const a = asDate(h.start) < asDate(last.at) ? last.at : h.start;
    const b = h.end || cap;
    if (asDate(b) > asDate(a)) gross -= workingDaysBetween(a, b);
  }
  return Math.max(0, gross);
}

// Full verdict for a record given its module definition.
//   { status, tone, reported, gross, held, hold, sla, stageSla, stageAge,
//     stageBreached, nearBreach, frozen }
export function tatV2(def, rec = {}, now = new Date()) {
  const closed = rec.status === "Closed" || !!closedAt(rec);
  // Clock-stop stages (Section 8.1 — Case Handling): once the file is with the
  // court, the internal-task clock freezes at the moment it went out.
  let effNow = now, frozen = false;
  if (!closed && def && def.clockStops && def.clockStops.includes(rec.stage)) {
    const hit = (rec.stageLog || []).filter((s) => def.clockStops.includes(s.stage)).pop();
    if (hit) { effNow = asDate(hit.at); frozen = true; }
  }
  const hold = openHold(rec);
  const reported = reportedTat(rec, effNow);
  const gross = grossWorkingDays(rec, effNow);
  const held = heldWorkingDays(rec, effNow);
  const stage = rec.stage;
  const sSla = def ? slaFor(def, rec, stage) : null;
  const sAge = stageAge(rec, effNow);
  const budget = def ? totalSla(def, rec) : null;

  let status = "Running";
  if (closed) status = "Closed";
  else if (hold) status = "Paused";
  else if (!frozen && ((sSla != null && sAge > sSla) || (budget != null && reported > budget))) status = "Overdue";

  // Early warning near breach (Section 9) — within one working day of a limit.
  const nearBreach = status === "Running" && (
    (sSla != null && sAge >= sSla - 1 && sSla > 1) ||
    (budget != null && reported >= budget - 1 && budget > 1)
  );

  return {
    status, reported, gross, held, hold, frozen,
    sla: budget, stageSla: sSla, stageAge: sAge,
    stageBreached: !frozen && sSla != null && sAge > sSla,
    nearBreach,
    tone: { Running: "green", Paused: "blue", Overdue: "red", Closed: "gray" }[status],
  };
}

// Compact label for tables: "4d of 5d" / "Paused 2d — Finance" / "Closed in 6d".
export function tatV2Label(t) {
  if (!t) return "";
  if (t.status === "Closed") return `Closed in ${t.reported}d`;
  if (t.status === "Paused") return `Paused — with ${t.hold ? t.hold.dept : "dept"}`;
  if (t.frozen) return `${t.reported}d — with court`;
  if (t.sla != null) return `${t.reported}d of ${t.sla}d`;
  return `${t.reported}d running`;
}

// Sort weight for My Tasks: overdue first, then near-breach, then by how much
// of the budget is burnt; paused sinks below running; closed last.
export function urgencyOf(t) {
  if (!t) return 0;
  if (t.status === "Closed") return -1;
  if (t.status === "Overdue") return 1000 + t.reported;
  if (t.status === "Paused") return 10 + t.reported * 0.01;
  const burn = t.sla ? t.reported / t.sla : 0.5;
  return (t.nearBreach ? 500 : 100) + burn * 100;
}
