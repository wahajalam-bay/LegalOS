// Access control & cross-department visibility — FRD Section 14.
// Raising and viewing are separate capabilities: anyone can raise to any team;
// viewing is row-level, keyed on (Legal Team, Requesting Department).
//
// visibilityOf(viewer, rec) → "full" | "status" | null
//   full   — team member / lead of the owning team, or the Department Head
//   status — the requester's own request, or a Business Department Head looking
//            at their department's outgoing requests: status / stage / owner /
//            TAT only; internal fields, risk notes and internal activity are
//            stripped
//   null   — not visible, not searchable
import { USERS, byId } from "./data.js";
import { RBAC_ROLES, teamOfSubdivision } from "./org.js";
import { getSession, setSession, useSession } from "./store.js";

/* ---------------- The active identity (View As) ----------------
   The prototype has no real login, so the shell carries a View As switcher:
   pick any user and the entire app — nav, landing, queues, search — obeys
   that user's row-level visibility. */
export function activeUser() {
  const s = getSession();
  return byId((s && s.viewAsId) || "u1");
}
export function setViewAs(userId) {
  setSession({ viewAsId: userId || "u1" });
}
export function useActiveUser() {
  const s = useSession();
  return byId((s && s.viewAsId) || "u1");
}

export const roleOf = (user) => RBAC_ROLES[(user && user.rbac) || "requester"] || RBAC_ROLES.requester;
export const isManagement = (user) => (user && user.rbac) === "head";
export const isLegal = (user) => !!(user && (user.legalTeam || user.rbac === "head"));

// Which team owns a record. Module records carry legalTeam explicitly; legacy
// records (requests / matters / contracts) roll up via their sub-division.
export function recTeam(rec = {}) {
  if (rec.legalTeam) return rec.legalTeam;
  if (rec.subdivision) return teamOfSubdivision(rec.subdivision);
  return "commercial";
}

/* ---------------- Section 14.4 — the row-level filter ---------------- */
export function visibilityOf(viewer, rec) {
  if (!viewer || !rec) return null;
  // Legal Department Head — aggregated cross-team view, full drill-down.
  if (viewer.rbac === "head") return "full";
  // Same Legal team → the full record.
  if (viewer.legalTeam && viewer.legalTeam === recTeam(rec)) return "full";
  // Your own raised request → status / stage / owner / TAT only.
  const raisedBy = rec.requestedById || rec.requesterId || rec.requestedBy;
  if (raisedBy && raisedBy === viewer.id) return "status";
  // Business Department Head → their department's outgoing requests.
  if (viewer.rbac === "bizHead" && rec.requestingDept && rec.requestingDept === viewer.dept) return "status";
  return null;
}

export const canSee = (viewer, rec) => visibilityOf(viewer, rec) !== null;
export const filterVisible = (viewer, recs = []) => recs.filter((r) => canSee(viewer, r));

// Strip team-internal content for a status-only view (Section 14.4: internal
// fields are excluded even from the requester's own-request view).
export function stripInternal(def, rec) {
  if (!rec) return rec;
  const internalKeys = new Set(((def && def.fields) || []).filter((f) => f.internal).map((f) => f.key));
  const fields = {};
  for (const [k, v] of Object.entries(rec.fields || {})) {
    if (!internalKeys.has(k)) fields[k] = v;
  }
  return {
    ...rec,
    fields,
    activity: (rec.activity || []).filter((a) => !a.internal),
    holds: rec.holds || [], // hold state is part of "why is my request paused"
    costs: [],              // cost lines are internal to Legal & Finance
    comments: (rec.comments || []).filter((c) => !c.internal),
  };
}

// Can this viewer browse a module's register at all? Members and leads see
// their own team's modules; the head sees everything; business users see none
// (they use My Requests instead).
export function canBrowseModule(viewer, def) {
  if (!viewer || !def) return false;
  if (viewer.rbac === "head") return true;
  return !!viewer.legalTeam && viewer.legalTeam === def.team;
}

// The landing route per role — Section 11: My Tasks is every legal user's
// day-to-day screen; management lands on the aggregated executive view;
// business users land on their own requests.
export function landingFor(user) {
  if (!user) return "/exec";
  if (user.rbac === "head") return "/exec";
  if (user.legalTeam) return "/my-tasks";
  return "/raise";
}

// People pickers: legal staff of a given team (for owner assignment).
export const teamMembers = (teamKey) => USERS.filter((u) => u.legalTeam === teamKey);

/* ---------------- Section 8.2 — source-group input rights ----------------
   Asset Recovery pulls data from three sources; each field is tagged with the
   department that OWNS it. That ownership is a WRITE right: HR maintains the
   HR Input group and Admin theirs, even from a status-only view — the OS
   manages the inputs, not just the outputs. Legal's own group stays legal-only. */
const SOURCE_DEPT = { HR: "HR", Admin: "Admin" };
export function canEditGroup(viewer, def, groupFields = []) {
  if (!viewer || !def) return false;
  // The owning team (and the head) edit everything.
  if (viewer.rbac === "head" || (viewer.legalTeam && viewer.legalTeam === def.team)) return true;
  // A source-tagged group is editable by the department that owns the source.
  const src = (groupFields.find((f) => f.source) || {}).source;
  return !!src && SOURCE_DEPT[src] === viewer.dept;
}
