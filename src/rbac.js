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
import { NAV } from "./nav.js";
import { moduleByKey } from "./modules.js";

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
  const role = RBAC_ROLES[user.rbac];
  if (role && role.landing) return role.landing;
  if (user.legalTeam) return "/my-tasks";
  return "/raise";
}

// Capability gates (PRD §2 / §7.3). Views read these to show/hide actions.
export const approvalScope = (user) => (roleOf(user).canApprove || false);   // "all" | "threshold" | false
export const canApprove = (user) => approvalScope(user) !== false;
export const canConfigure = (user) => roleOf(user).config === true;          // Director publishes config
export const canProposeConfig = (user) => !!roleOf(user).config;             // AD proposes, Director publishes
export const canTriage = (user) => !!roleOf(user).triage;                    // Director + AD
export const canReassign = (user) => !!roleOf(user).reassign;
export const hasPrivilegeAccess = (user) => roleOf(user).privilegeAccess === true;
export const canExport = (user) => !!roleOf(user).exportData;

// Role-based navigation (PRD §2 / §7.3): the sidebar shows only what a role may
// act on. Modules off the user's team, leadership-only analytics/admin, and the
// triage queue are hidden by designation. A business requester sees only the
// front door.
export function navForUser(user) {
  const rbac = (user && user.rbac) || "requester";
  const isLegal = ["head", "lead", "member", "paralegal"].includes(rbac);
  const isMgmt = rbac === "head" || rbac === "lead";

  const itemOk = (item) => {
    const p = item.path || "";
    if (!isLegal) return p === "/raise" || p === "/flow-map";        // requester: front door only
    if (p === "/triage") return isMgmt;                              // triage = Director / AD
    if (p === "/exec") return isMgmt;                                // executive overview = leadership
    if (p === "/organization" || p === "/portal") return rbac === "head";
    if (p === "/settings") return isMgmt;                            // AD proposes, Director publishes
    if (p.startsWith("/m/")) { const def = moduleByKey(p.slice(3)); return def ? canBrowseModule(user, def) : true; }
    return true;
  };
  const sectionOk = (name) => (name === "Insight & Governance" || name === "Administration") ? isMgmt : true;

  return NAV
    .filter((s) => sectionOk(s.section))
    .map((s) => ({ ...s, items: s.items.filter(itemOk) }))
    .filter((s) => s.items.length > 0);
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
