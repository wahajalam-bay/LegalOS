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
import { NAV, NAV_GROUPS } from "./nav.js";
import { moduleByKey } from "./modules.js";
import { api } from "./api.js";

/* ---------------- The active identity (View As) ----------------
   The prototype has no real login, so the shell carries a View As switcher:
   pick any user and the entire app — nav, landing, queues, search — obeys
   that user's row-level visibility. */
/* A signed-in credential that is not a roster row — the system administrator
   account today, possibly requester credentials later — still needs a full user
   object for nav, landing and page gates. It is synthesised from the verified
   account the server returned at sign-in, never from anything typed locally. */
function userFromSession(s) {
  // Effective permissions the SERVER computed for this account (the single
  // source the gate consults). Carried on the session account and refreshed on
  // each /api/auth/session poll, so an admin's access change reaches a live tab.
  const account = s && s.account;
  const accountPerms = account && account.permissions ? account.permissions : null;
  const vid = (s && s.viewAsId) || "u1";

  /* VIEW-AS MUST NOT CARRY THE VIEWER'S ACCESS.
     This used to attach the signed-in account's permissions to WHOEVER was
     being viewed, so an admin previewing a litigation associate saw that
     associate's name and role over the ADMIN's super-admin grants — the whole
     nav, every team's registers, Administration. The preview therefore proved
     nothing and looked like a total RBAC failure.

     Permissions now belong to the identity being rendered:
       • viewing yourself      → your own effective permissions;
       • viewing someone else  → THEIR permissions, fetched from the engine and
         cached on the session by setViewAs;
       • not yet fetched       → null, which falls through to the team-scoped
         legacy rules. That is the default-DENY side: it restricts by the
         viewed person's own team rather than granting the viewer's access. */
  const isSelf = !!(account && account.id && account.id === vid);
  const viewAsPerms = s && s.viewAsPermissions && s.viewAsPermissions.id === vid
    ? s.viewAsPermissions.permissions : null;
  const perms = isSelf ? accountPerms : viewAsPerms;

  const u = USERS.find((x) => x.id === vid);
  if (u) return perms ? { ...u, permissions: perms } : u;
  const a = account;
  if (a && (isSelf || !USERS.some((x) => x.id === vid))) {
    return {
      id: vid,
      name: a.name || "Administrator",
      role: a.role || "System Administrator",
      rbac: a.rbac || (a.admin ? "head" : "requester"),
      legalTeam: a.legalTeam || null,
      team: "Executive",
      dept: "IT / Systems",
      email: a.email,
      permissions: accountPerms,
    };
  }
  return byId(vid); // portal demo identities keep their old fallback
}
export function activeUser() {
  return userFromSession(getSession());
}
export function setViewAs(userId) {
  const id = userId || "u1";
  // Clear the previous preview's permissions immediately, so there is never a
  // window in which one identity is rendered with another's access.
  setSession({ viewAsId: id, viewAsPermissions: null });
  const s = getSession();
  const account = s && s.account;
  if (!account || account.id === id) return;     // viewing yourself: nothing to fetch
  // Ask the engine what THIS person may actually do. Only an admin can read the
  // roster's access, which is exactly who is allowed to use View-As; if the call
  // fails we simply stay on the restrictive fallback.
  try {
    api.access.users().then((r) => {
      const row = ((r && r.users) || []).find((x) => x.id === id);
      if (!row) return;
      setSession({ viewAsPermissions: { id, permissions: { status: row.status, groups: row.groups } } });
    }, () => {});
  } catch (e) {}
}
export function useActiveUser() {
  return userFromSession(useSession());
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
  // §7.2 privilege tiers — enforced here at the access layer, not as a label.
  // A Privileged matter never surfaces (view, search, or AI retrieval) for a
  // viewer who is not named on it; Restricted excludes cross-team and, by
  // default, paralegals. The Director (head) retains full access.
  const priv = rec.privilege || "Open";
  if (priv !== "Open" && viewer.rbac !== "head") {
    const named = rec.owner === viewer.id || (rec.namedAccess || []).includes(viewer.id);
    if (priv === "Privileged" && !named) return null;
    if (priv === "Restricted") {
      const sameTeam = viewer.legalTeam && viewer.legalTeam === recTeam(rec);
      if (!named && !(sameTeam && viewer.rbac !== "paralegal")) return null;
    }
  }
  // Legal Department Head — aggregated cross-team view, full drill-down.
  if (viewer.rbac === "head") return "full";
  // Module 2: the responsible lawyer and named collaborators always have access,
  // even across teams (Phase 15 — collaborators receive access via the matter).
  if (isLegal(viewer) && (rec.owner === viewer.id || (rec.collaborators || []).includes(viewer.id))) return "full";
  // Same Legal team → the full record.
  if (viewer.legalTeam && viewer.legalTeam === recTeam(rec)) return "full";
  // Your own raised request → status / stage / owner / TAT only. This applies to
  // the REQUEST face only — a requester never gains visibility of the internal
  // MATTER merely because they raised the originating request (Module 2 §23).
  const raisedBy = rec.requestedById || rec.requesterId || rec.requestedBy;
  if (raisedBy && raisedBy === viewer.id && !rec.practiceArea) return "status";
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
// PRD §2 — "approval within a defined threshold". A Lead (threshold) can sign off
// up to this value; above it, only the Director (all) can. Value is in the
// record's own currency (prototype does not FX-convert).
export const APPROVAL_THRESHOLD = 1000000;
export const approvalLimitFor = (user) => {
  const scope = approvalScope(user);
  if (scope === "all") return Infinity;
  if (scope === "threshold") return APPROVAL_THRESHOLD;
  return 0;
};
export const canApproveValue = (user, value) => approvalScope(user) !== false && Number(value || 0) <= approvalLimitFor(user);
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
/* ---------------- Page-level access (Section 14.1) ----------------
   ONE rule, used by BOTH the sidebar and the router. Filtering the menu is not
   access control: every privileged page was reachable by typing its hash, so a
   Paralegal could open Settings, Organization, the Executive Overview, Cost
   Analysis and other teams' modules. The nav is now built from this function and
   the router refuses anything it rejects, so the two can never drift.

   Row-level visibility (visibilityOf / filterVisible) still applies on top: this
   decides whether a PAGE opens, that decides which RECORDS it may show. */
const LEGAL_RBAC = ["head", "lead", "member", "paralegal"];
// Leadership only — the config and cross-team surfaces.
const MGMT_ONLY = new Set(["/settings", "/triage", "/costs", "/pipelines", "/reports"]);
// Dashboards are role-scoped, and the scoping is enforced HERE, not by hiding a
// nav row: the Executive Overview and the org-wide Operational Dashboard are the
// Director's alone, the Team Dashboard is a lead's own team, and My Dashboard is
// an individual's own work. Typing another role's URL is refused like any other
// privileged page.
/* EXACTLY ONE dashboard per role. The rail carries three dashboard rows and
   each identity must see only its own — a lead seeing "Team Dashboard" AND "My
   Dashboard" is a bug, not a feature. Role decides WHICH; the permission engine
   can still revoke it (the two aggregate dashboards are Insight surfaces). */
const DASH_OF_ROLE = { head: "/exec", lead: "/team", member: "/me", paralegal: "/me" };
const DASH_PATHS = new Set(["/exec", "/dashboard", "/team", "/me"]);
function dashboardAllowed(user, base, perms) {
  const rbac = (user && user.rbac) || "requester";
  // A SUPER ADMIN sees the department-wide Dashboard whatever their job title
  // says. Maryam Haq is "head", but Imran Tariq and Salman Rashid are team
  // LEADS who have been granted full access through the engine — keying the
  // dashboard off rbac alone parked them on "Team Dashboard" while Maryam got
  // the full picture. Full access means the same view for all three.
  const superAdmin = !!(perms && perms.admin === "full" && perms.insight === "full");
  const mine = superAdmin ? "/exec" : DASH_OF_ROLE[rbac];
  if (!mine) return false;                       // not a legal role → no dashboard
  const want = base === "/dashboard" ? "/exec" : base;
  // Does the engine allow this particular dashboard? The department-wide /exec
  // view is the whole-function picture — value under management, every team's
  // load, the full register roll-up — so it takes FULL access to Insight &
  // Governance, not merely read. /me carries no group and is always personal.
  const okFor = (path) => {
    const g = GROUP_OF_PATH[path] || null;
    if (!g || !perms) return true;
    const level = perms[g] || "none";
    return path === "/exec" ? level === "full" : level !== "none";
  };
  if (want === mine) return okFor(mine);
  // Fallback: when the engine has revoked this person's OWN dashboard, /me
  // (personal, ungated) keeps them from being left with no home at all.
  if (want === "/me") return !okFor(mine);
  return false;
}

const LEAD_ONLY = new Set(["/team"]);
const IC_ONLY = new Set(["/me"]);
// Director only.
// The entity registry is a Director-level view of the whole group, so it sits
// with Organization rather than in the shared surfaces.
// /contracts (the historic register) and /tracker carry the organisation's
// real contract book — Director-only, like the executive views.
/* /companies left this set when Companies became the primary COMPLIANCE
   object (§40): a compliance lawyer whose whole job is the entity estate could
   not open the register that now leads their family. It is gated with the rest
   of Compliance instead — by team on the legacy path, by the compliance group
   on the engine path — which is a narrower rule than "head only" for everyone
   except the compliance team, who are precisely the people it is for. */
const HEAD_ONLY = new Set(["/organization", "/portal", "/exec", "/dashboard", "/negotiations", "/analyzer"]);
// Everything a business requester may open, and nothing else.
const REQUESTER_PATHS = new Set(["/raise", "/requests", "/my-requests", "/my-tasks", "/login"]);

// Team-scoped operational surfaces: a legal IC/lead sees ONLY their own team's
// register pages and record hubs; the Department Head (rbac "head") sees all.
// This is what makes a Commercial user see Commercial only, Compliance see
// Compliance only, Litigation see Litigation only — the group hub, its register
// and its modules all disappear for other teams because navForUser hides any row
// canOpenPath refuses.
const TEAM_OF_PATH = {
  "/contracts": "commercial", "/tracker": "commercial", "/projects": "commercial",
  "/compliance": "compliance", "/licenses": "compliance", "/companies": "compliance",
  "/litigation": "litigation",
};
const TEAM_OF_GROUP = { commercial: "commercial", compliance: "compliance", litigation: "litigation" };
// Which team owns each RecordWorkspace kind at /rec/<kind>/<id>.
const TEAM_OF_KIND = { contract: "commercial", property: "commercial", litigation: "litigation", notice: "litigation", licence: "compliance", loan: "compliance", resolution: "compliance" };

// Every gated surface → its permission GROUP (commercial/compliance/litigation/
// shared/insight/admin). The permission engine's per-user group level then
// decides visibility. Personal/workflow surfaces (/me,/workspace,/matters,/raise)
// map to null and stay open to any active signed-in user.
const GROUP_OF_PATH = {
  "/contracts": "commercial", "/tracker": "commercial", "/projects": "commercial", "/negotiations": "commercial",
  "/compliance": "compliance", "/licenses": "compliance",
  "/litigation": "litigation",
  "/repository": "shared", "/templates": "shared", "/clauses": "shared", "/knowledge": "shared",
  "/playbooks": "shared", "/drafting": "shared",
  "/reports": "insight", "/costs": "insight", "/analyzer": "insight", "/pipelines": "insight",
  "/exec": "insight", "/dashboard": "insight", "/team": "insight",
  "/companies": "compliance",
  "/organization": "admin", "/settings": "admin", "/access": "admin", "/portal": "admin",
  "/datahealth": "admin",
};
/* /m/<key> addresses that are NOT module definitions.
   The cause list, the invoice ledger and the weekly report used to be tabs on
   the litigation workspace and were given addresses of their own. They have no
   entry in MODULES, so `moduleByKey` returned nothing, `groupOf` returned null
   and canOpenPath fell through to "ungated shared surface" — which put three
   litigation surfaces in the nav of every legal user, including Compliance.
   The server refused them (403, so nothing leaked), but the person was shown a
   link that could only ever answer with an error. A family with its own
   address still belongs to its team. */
const GROUP_OF_MODULE_KEY = { causelist: "litigation", spend: "litigation", report: "litigation", analytics: "litigation" };

function groupOf(base, parts) {
  if (GROUP_OF_PATH[base]) return GROUP_OF_PATH[base];
  if (base === "/g") { const k = parts[1]; return TEAM_OF_GROUP[k] || ({ shared: "shared", insight: "insight", admin: "admin" }[k]) || null; }
  if (base === "/m") {
    const key = parts[1];
    if (!key) return null;
    if (GROUP_OF_MODULE_KEY[key]) return GROUP_OF_MODULE_KEY[key];
    const def = moduleByKey(key);
    return def ? def.team : null;
  }
  if (base === "/rec") return TEAM_OF_KIND[parts[1]] || null;
  return null;
}

export function canOpenPath(user, path) {
  const rbac = (user && user.rbac) || "requester";
  const legal = LEGAL_RBAC.includes(rbac);
  const mgmt = rbac === "head" || rbac === "lead";
  const parts = String(path || "").split("?")[0].split("/").filter(Boolean);
  const base = "/" + (parts[0] || "");

  if (base === "/login") return true;              // the credential screen is always reachable
  // The permission ENGINE is authoritative when the server has computed the
  // account's effective access (every roster user is seeded, so this is the norm).
  // A group at level "none" is refused; personal/workflow surfaces (group null)
  // stay open. This single check drives nav visibility AND direct-URL refusal.
  const perms = user && user.permissions && user.permissions.groups;
  if (perms && legal && user.permissions.status === "inactive") return false; // /login already returned
  // The dashboard rows are ROLE landings, not permission groups. Checked here,
  // ahead of both branches, so the engine cannot hand someone a second one.
  if (DASH_PATHS.has(base)) return legal && dashboardAllowed(user, base, perms);
  if (perms && legal) {
    if (base === "/my-tasks" || base === "/workspace" || base === "/matters" || base === "/requests" || base === "/my-requests" || base === "/calendar" || base === "/project-wise") return true;
    if (base === "/raise") return false;
    const g = groupOf(base, parts);
    if (g) return (perms[g] || "none") !== "none";
    return true; // ungated shared surface
  }
  if (!legal) return REQUESTER_PATHS.has(base);     // requester: raise + track + how it works
  if (base === "/raise") return false;              // only the business raises (PRD 3.1)
  if (base === "/my-requests") return true;         // reachable alias of /requests
  const head = rbac === "head";
  // A module-family hub: head sees all; a team hub (commercial/compliance/
  // litigation) is visible only to that team; other hubs (shared/insight/admin)
  // fall back to "visible if any tool inside is".
  if (base === "/g") {
    const key = parts[1] || "";
    const g = NAV_GROUPS.find((x) => x.key === key);
    if (!g) return true;
    if (TEAM_OF_GROUP[key] && !head) return user && user.legalTeam === TEAM_OF_GROUP[key];
    return g.items.some((it) => canOpenPath(user, it.path));
  }
  // Team-scoped register / hub pages — the heart of the RBAC ask.
  if (TEAM_OF_PATH[base]) return head || (user && user.legalTeam === TEAM_OF_PATH[base]);
  // Shared full-page record detail: gate by the record kind's owning team.
  if (base === "/rec") {
    const t = TEAM_OF_KIND[parts[1]];
    return !t || head || (user && user.legalTeam === t);
  }
  // Administration (Users & Access, Organization, Settings, the portal config)
  // is a head-only group in the legacy rules too. Without this, a surface added
  // to the admin group later falls through to the permissive `return true` at
  // the bottom — which is how Users & Access stayed open to an associate
  // whenever effective permissions were not available.
  if (groupOf(base, parts) === "admin") return rbac === "head";
  if (HEAD_ONLY.has(base)) return rbac === "head";
  if (LEAD_ONLY.has(base)) return rbac === "lead";
  if (IC_ONLY.has(base)) return rbac === "member" || rbac === "paralegal";
  if (MGMT_ONLY.has(base)) return mgmt;
  if (base === "/m") {                              // a team module obeys its own gate
    const key = parts[1];
    // The same hole as in groupOf: a family with its own address but no module
    // definition must still be gated to the team that owns it, on the legacy
    // path as well as the engine path.
    if (key && GROUP_OF_MODULE_KEY[key]) return head || (user && user.legalTeam === GROUP_OF_MODULE_KEY[key]);
    const def = key && moduleByKey(key);
    return def ? canBrowseModule(user, def) : true;
  }
  return true;                                      // the shared legal surfaces
}

export function navForUser(user) {
  // The menu is exactly "the pages this identity may open", so it can never
  // show a row the router would refuse. /my-requests is the one exception: a
  // reachable alias that is retired from the menu. And for LEGAL users the
  // standalone "Legal Requests" row is retired too — it now lives as a sub-tab
  // inside Legal Workspace (WorkspaceHub). Requesters keep the row: it is their
  // only surface.
  const itemOk = (item) => {
    if (item.path === "/my-requests") return false;
    if (item.path === "/requests" && isLegal(user)) return false;
    return canOpenPath(user, item.path);
  };

  /* A family is shown only if this identity may open the FAMILY, not merely
     something inside it. Each family carries its group key, and /g/<key> is the
     same address the hub uses, so nav visibility and route refusal are decided
     by one rule as before. Sections with no key (the headerless rows at the top)
     are gated per item, as they always were. */
  return NAV
    .filter((sec) => !sec.key || canOpenPath(user, "/g/" + sec.key))
    .map((sec) => ({ ...sec, items: sec.items.filter(itemOk) }))
    .filter((sec) => sec.items.length > 0);
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
