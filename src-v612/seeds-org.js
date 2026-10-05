// Seed records for the org-architecture modules (Sprint 6). All fictional, but
// written to read authentically for corporate real-estate legal across KSA and
// Pakistan. Dates are relative to "today" so TAT clocks always look alive.
import { MODULES, moduleByKey, workflowOf } from "./modules.js";
import { teamPrefix } from "./org.js";

const DAY = 86400000;
const d = (n) => new Date(Date.now() + n * DAY).toISOString();

let seq = { LIT: 0, CRM: 0, CMP: 0 };
export function resetSeedSeq() { seq = { LIT: 0, CRM: 0, CMP: 0 }; }

/* Factory: builds the full common-field envelope (FRD Section 3) around each
   record — team-prefixed id, stage log walked from `raisedDaysAgo` to the
   current stage, holds, an activity trail derived from both, and cost lines. */
function mk(moduleKey, o) {
  const def = moduleByKey(moduleKey);
  const prefix = teamPrefix(def.team);
  const id = `${prefix}-${String(++seq[prefix]).padStart(4, "0")}`;
  const flow = o.flow || "main";
  const path = workflowOf(def, { flow });
  const idx = Math.max(0, path.indexOf(o.stage != null ? o.stage : path[1]));
  const t0 = -(o.raisedDaysAgo != null ? o.raisedDaysAgo : 10);
  const pace = o.pace != null ? o.pace : Math.max(1, Math.floor(-t0 / (idx + 2)));
  const closed = o.closed || idx === path.length - 1;

  const stageLog = [];
  for (let i = 0; i <= idx; i++) {
    stageLog.push({ stage: path[i], at: d(t0 + i * pace), by: i === 0 ? (o.requestedById || o.owner) : (o.assignedBy || o.owner) });
  }

  const holds = (o.holds || []).map((h, i) => ({
    id: id + "-H" + (i + 1),
    dept: h.dept, sender: h.sender || o.owner, reason: h.reason,
    start: d(-h.startDaysAgo), end: h.endDaysAgo != null ? d(-h.endDaysAgo) : null,
  }));

  // Activity log — who did what, and when (Section 3), derived so it always
  // matches the stage history and hold trail exactly.
  const activity = [
    { at: stageLog[0].at, by: o.requestedById || o.owner, action: `Request raised by ${o.requestedBy ? o.requestedBy.name : "requester"} (${o.requestingDept})` },
    ...stageLog.slice(1).map((s) => ({ at: s.at, by: s.by, action: `Stage moved to ${s.stage}` })),
    ...holds.flatMap((h) => [
      { at: h.start, by: h.sender, action: `TAT paused — shared with ${h.dept} (${h.reason})` },
      ...(h.end ? [{ at: h.end, by: h.sender, action: `TAT resumed — received back from ${h.dept}` }] : []),
    ]),
    ...(o.activity || []),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    id,
    moduleKey,
    flow,
    title: o.title,
    legalTeam: def.team,
    subType: o.subType || null,
    requestingDept: o.requestingDept || "Operations",
    requestedBy: o.requestedBy || null,          // { name, designation, contact }
    requestedById: o.requestedById || null,      // user id when raised in-app
    entityId: o.entityId || null,                // linked entity from the registry
    dateRaised: stageLog[0].at,
    owner: o.owner,
    stage: path[idx],
    priority: o.priority || "Normal",
    status: closed ? "Closed" : "Open",
    closedAt: closed ? stageLog[stageLog.length - 1].at : null,
    driveLink: o.driveLink || null,
    attachments: o.attachments || [],
    versions: o.versions || [],
    stageLog,
    holds,
    activity,
    comments: (o.comments || []).map((c, i) => ({ id: id + "-M" + (i + 1), ...c })),
    costs: (o.costs || []).map((c, i) => ({ id: id + "-C" + (i + 1), ...c })),
    hearings: o.hearings || undefined,
    fields: o.fields || {},
  };
}

const req = (name, designation, contact) => ({ name, designation, contact });

/* =================== COMMERCIAL & RISK MANAGEMENT =================== */
// Emptied 2026-09-13: fabricated demo records. Real work enters LegalOS
// through the Drive registers or by someone actually raising it.
const CRM = [];;

/* =================== COMPLIANCE =================== */
// Emptied 2026-09-13: fabricated demo records. Real work enters LegalOS
// through the Drive registers or by someone actually raising it.
const CMP = [];;

/* ---------------- Filing Module 8.2 — the statutory filing calendar ----------------
   Per PK entity: the periodic obligations Compliance maintains. The store's
   ensurePeriodicFilings() generates the filing record automatically once
   `nextDue` comes within 30 days — OLX below is inside that window on a fresh
   seed, so the trigger demonstrably fires on first boot. */
// Emptied 2026-09-13: fabricated demo records. Real work enters LegalOS
// through the Drive registers or by someone actually raising it.
export const FILING_SCHEDULE = [];;

/* =================== LITIGATION & DISPUTE MANAGEMENT =================== */
// Emptied 2026-09-13: fabricated demo records. Real work enters LegalOS
// through the Drive registers or by someone actually raising it.
const LIT = [];;

export const MOD_REQUESTS = [...LIT, ...CRM, ...CMP];

/* ---------------- Section 8.5.2 — auto-response templates ---------------- */
// Emptied 2026-09-13: fabricated demo records. Real work enters LegalOS
// through the Drive registers or by someone actually raising it.
export const NOTICE_TEMPLATES = [];;

/* ---------------- Section 13 — cost budgets (USD, per quarter) ---------------- */
// Emptied 2026-09-13: fabricated demo records. Real work enters LegalOS
// through the Drive registers or by someone actually raising it.
export const COST_BUDGETS = [];;
