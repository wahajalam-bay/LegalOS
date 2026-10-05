// Users & Access — the single permission engine (server-side, persisted,
// editable, audited). Effective access = role template + per-user overrides,
// default-DENY. The browser never decides access on its own: the server computes
// each identity's effective permissions and returns them at sign-in and on every
// session revalidation, so an admin's change reflects app-wide without a restart.
//
// Granularity is module-GROUP × access-LEVEL (a genuine configurable model, not
// name hardcoding). The three initial full-access users (Maryam Haq u1, Imran
// Tariq u3, Salman Rashid u6) are seeded as "Legal Super Admin" HERE, through
// this engine, and remain fully editable in Administration → Users & Access.
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./config");
const identity = require("./identity");

const FILE = path.join(ROOT, "config", "access.json");
const GROUPS = ["commercial", "compliance", "litigation", "shared", "insight", "admin"];
const LEVELS = ["none", "view", "edit", "full"];
const rank = (l) => Math.max(0, LEVELS.indexOf(l));

const allFull = () => Object.fromEntries(GROUPS.map((g) => [g, "full"]));
const allNone = () => Object.fromEntries(GROUPS.map((g) => [g, "none"]));
const normalize = (g) => { const o = allNone(); for (const k of GROUPS) if (g && LEVELS.includes(g[k])) o[k] = g[k]; return o; };

// Roles are templates. A non-admin role sets the level for the user's OWN team
// group plus the cross-cutting groups; other teams stay "none".
const ROLE_TEMPLATES = {
  superAdmin:    { label: "Legal Super Admin",    team: "full", shared: "full", insight: "full", admin: "full" },
  seniorManager: { label: "Senior Legal Manager", team: "full", shared: "full", insight: "full", admin: "none" },
  manager:       { label: "Legal Manager",        team: "full", shared: "edit", insight: "view", admin: "none" },
  associate:     { label: "Legal Associate",      team: "edit", shared: "view", insight: "none", admin: "none" },
  viewer:        { label: "Legal Viewer",         team: "view", shared: "view", insight: "none", admin: "none" },
};
const DEFAULT_ROLE = { head: "superAdmin", lead: "manager", member: "associate", paralegal: "viewer" };

function groupsFromRole(roleKey, legalTeam) {
  if (roleKey === "superAdmin") return allFull();
  const t = ROLE_TEMPLATES[roleKey] || ROLE_TEMPLATES.viewer;
  const g = allNone();
  g.shared = t.shared; g.insight = t.insight; g.admin = t.admin;
  if (legalTeam && GROUPS.includes(legalTeam)) g[legalTeam] = t.team;
  return g;
}

let state = null;
function loadRaw() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { return { users: {}, audit: [] }; }
}
// ATOMIC. This file IS the access-control state: a truncated write (a crash or a
// full disk mid-save) would leave every user's permissions unreadable, and the
// engine would fall back to role defaults for the whole organisation. Write to a
// temporary file and rename, which is atomic on the same filesystem.
function save() {
  try {
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o640 });
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error("[permissions] save failed:", e.message); }
}

// Seed once from the roster: every roster member gets a role-derived default;
// the three named users are Super Admin. Existing config is never overwritten,
// so admin edits persist across restarts.
function ensure() {
  if (state) return state;
  state = loadRaw();
  if (!state.users) state.users = {};
  if (!state.audit) state.audit = [];
  const SUPER = new Set(["u1", "u3", "u6"]); // Maryam Haq · Imran Tariq · Salman Rashid
  let changed = false;
  for (const u of identity.listRoster()) {
    if (!u.id || state.users[u.id]) continue;
    const role = SUPER.has(u.id) ? "superAdmin" : (DEFAULT_ROLE[u.rbac] || "viewer");
    state.users[u.id] = { status: "active", role, groups: groupsFromRole(role, u.legalTeam), updatedAt: new Date().toISOString(), updatedBy: "system (seed)" };
    changed = true;
  }
  if (changed) save();
  return state;
}

// The effective permissions for a signed-in identity {id, rbac, legalTeam, admin}.
function effectiveFor(id) {
  ensure();
  if (!id) return { role: null, status: "inactive", groups: allNone() };
  if (id.admin) return { role: "superAdmin", status: "active", groups: allFull() }; // system owner
  const cfg = id.id && state.users[id.id];
  if (cfg) {
    if (cfg.status && cfg.status !== "active") return { role: cfg.role, status: cfg.status, groups: allNone() };
    return { role: cfg.role || "viewer", status: "active", groups: normalize(cfg.groups) };
  }
  // Unconfigured identity → safe role-derived default (never silent full access).
  const roster = identity.listRoster().find((u) => u.id === id.id);
  const legalTeam = id.legalTeam || (roster && roster.legalTeam) || null;
  if (!legalTeam && id.rbac !== "head") return { role: "requester", status: "active", groups: allNone() };
  const role = DEFAULT_ROLE[id.rbac] || "viewer";
  return { role, status: "active", groups: groupsFromRole(role, legalTeam) };
}

// Roster joined with the access config, for the admin Users list.
function listUsers() {
  ensure();
  return identity.listRoster().filter((u) => u.id).map((u) => {
    const cfg = state.users[u.id] || {};
    const eff = effectiveFor({ id: u.id, rbac: u.rbac, legalTeam: u.legalTeam });
    return {
      id: u.id, name: u.name, email: u.email || "", role: u.role, team: u.team, legalTeam: u.legalTeam || null,
      status: cfg.status || "active", accessRole: eff.role, groups: eff.groups,
      updatedAt: cfg.updatedAt || null, updatedBy: cfg.updatedBy || null,
      moduleCount: GROUPS.filter((g) => eff.groups[g] !== "none").length,
    };
  });
}

function auditEntry(by, userId, before, after, reason) {
  ensure();
  state.audit.unshift({ ts: new Date().toISOString(), by: by || "admin", user: userId, before, after, reason: reason || "" });
  state.audit = state.audit.slice(0, 2000);
}

// Apply an update to one user's access (groups / status / role). `by` is the
// admin's display name. Records an audit event with the before/after.
/* How many ACTIVE accounts still hold full administration, if this patch were
   applied? Used to refuse the change that would lock everyone out. */
function activeAdminsAfter(userId, next) {
  ensure();
  let n = 0;
  for (const u of identity.listRoster()) {
    const cur = u.id === userId ? next : state.users[u.id];
    if (!cur) continue;
    if (cur.status === "active" && cur.groups && cur.groups.admin === "full") n++;
  }
  return n;
}

function updateUser(userId, patch, by, actorId) {
  ensure();
  const roster = identity.listRoster().find((u) => u.id === userId);
  if (!roster) return { error: "unknown user" };

  /* LOCKOUT GUARDS.
     Deactivating yourself, or the last remaining administrator, cannot be undone
     from inside the application: the identity gate refuses a disabled account
     before it ever reaches Users & Access, so the account that could re-enable
     it is the one that just went dark. Both are refused. */
  if (patch.status === "inactive" && actorId && actorId === userId) {
    return { error: "You cannot deactivate your own account. Ask another administrator." };
  }
  const cur = state.users[userId] || { status: "active", role: DEFAULT_ROLE[roster.rbac] || "viewer", groups: groupsFromRole(DEFAULT_ROLE[roster.rbac] || "viewer", roster.legalTeam) };
  const before = { status: cur.status, role: cur.role, groups: { ...cur.groups } };
  const next = { status: cur.status, role: cur.role, groups: { ...cur.groups } };
  if (patch.role && ROLE_TEMPLATES[patch.role]) { next.role = patch.role; next.groups = groupsFromRole(patch.role, roster.legalTeam); }
  if (patch.groups) { next.groups = normalize({ ...next.groups, ...patch.groups }); next.role = "custom"; }
  if (patch.status && ["active", "inactive"].includes(patch.status)) next.status = patch.status;
  next.updatedAt = new Date().toISOString(); next.updatedBy = by || "admin";

  // Would this leave nobody able to administer LegalOS?
  if (activeAdminsAfter(userId, next) === 0) {
    return { error: "At least one active administrator must remain. Grant another account full Administration access first." };
  }

  state.users[userId] = next;
  auditEntry(by, userId, before, { status: next.status, role: next.role, groups: next.groups }, patch.reason);
  save();
  return { ok: true, user: listUsers().find((u) => u.id === userId) };
}

function roles() { return Object.entries(ROLE_TEMPLATES).map(([key, r]) => ({ key, label: r.label })); }
function auditLog(limit = 200) { ensure(); return state.audit.slice(0, limit); }

module.exports = { GROUPS, LEVELS, rank, effectiveFor, listUsers, updateUser, roles, auditLog, ensure };
