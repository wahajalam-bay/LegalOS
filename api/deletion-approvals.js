/* DELETING A RECORD IS A REQUEST, NOT AN ACTION.
 *
 * Nothing in LegalOS leaves a register because one person decided it should.
 * A deletion is raised with a reason, sits as PENDING against the record it
 * names, and takes effect only when the head of the team that owns that module
 * approves it. Until then the record is exactly where it was, marked so nobody
 * works on something that is on its way out.
 *
 * THE RULES, and why each one is here:
 *
 *   A reason is required to RAISE.    "Deleted by Maryam Haq" tells a reader
 *                                     that something went and nothing about
 *                                     whether it should have.
 *
 *   Only the head of that module's    A register anyone can empty is not a
 *   team, or the Director, decides.   register. The Director decides for every
 *                                     team; a team lead only for their own.
 *
 *   Nobody approves their own.        Separation of duties. The one control
 *                                     that makes the other two mean anything:
 *                                     without it the approval is a formality
 *                                     the requester performs on themselves.
 *
 *   One pending request per record.   Two people asking to delete the same
 *                                     thing is one decision, not two.
 *
 *   A rejection is kept.              That somebody wanted this gone, and was
 *                                     told no, is part of the record's history.
 *
 * Approving performs the delete through the record's OWN store, so the soft
 * delete, the reason and the audit trail are written exactly as that store
 * writes them. This module decides WHETHER; it never invents HOW.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "deletion-requests.json");
const MAX = 5000;

/* Which team owns which module, and therefore whose head decides. A module
   missing from here cannot be deleted from at all -- that is deliberate: a new
   module has to state its owner before it can lose records. */
const MODULE_TEAM = {
  cases: "litigation",
  notices: "litigation",
  ip: "litigation",
  developerDisputes: "litigation",
  assetRecovery: "litigation",
  police: "litigation",
  inspections: "compliance",
  contracts: "commercial",
};

const MODULE_LABEL = {
  cases: "litigation case",
  notices: "legal notice",
  ip: "IP matter",
  developerDisputes: "developer dispute",
  assetRecovery: "recovery matter",
  police: "police complaint",
  inspections: "authority visit",
  contracts: "contract",
};

const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 500);
const now = () => new Date().toISOString();

let cache = null;
function read() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")).requests || []; }
  catch (e) { cache = []; }
  return cache;
}
function write() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ requests: cache }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}
function reload() { cache = null; return read(); }

const teamOf = (moduleKey) => MODULE_TEAM[moduleKey] || null;
const labelOf = (moduleKey) => MODULE_LABEL[moduleKey] || "record";

/* WHO MAY DECIDE. The Director Legal decides for every team; a team lead only
   for their own. Everyone else, including the person who raised it, may not. */
function mayDecide(user, moduleKey) {
  if (!user) return false;
  if (user.rbac === "head") return true;                 // Director Legal
  const team = teamOf(moduleKey);
  return !!(team && user.rbac === "lead" && user.legalTeam === team);
}

function approversFor(moduleKey, users) {
  const team = teamOf(moduleKey);
  return (users || []).filter((u) =>
    u.rbac === "head" || (team && u.rbac === "lead" && u.legalTeam === team));
}

function list(opts) {
  const o = opts || {};
  return read().filter((r) =>
    (!o.status || r.status === o.status)
    && (!o.module || r.module === o.module)
    && (!o.recordId || r.recordId === o.recordId));
}

const pendingFor = (moduleKey, recordId) =>
  read().find((r) => r.status === "Pending" && r.module === moduleKey && r.recordId === recordId) || null;

/* Every pending request, keyed for a screen that wants to mark rows without
   asking once per row. */
function pendingIndex() {
  const out = {};
  for (const r of read()) if (r.status === "Pending") out[r.module + ":" + r.recordId] = r.id;
  return out;
}

function raise(body, by) {
  const moduleKey = str((body || {}).module, 40);
  const recordId = str((body || {}).recordId, 80);
  const reason = str((body || {}).reason, 500);
  if (!moduleKey || !teamOf(moduleKey)) {
    return { error: "invalid", errors: ["that module cannot be deleted from"] };
  }
  if (!recordId) return { error: "invalid", errors: ["a record is required"] };
  if (!reason) return { error: "invalid", errors: ["a reason is required to request a deletion"] };
  const already = pendingFor(moduleKey, recordId);
  if (already) {
    return { error: "invalid", pending: already,
      errors: ["a deletion is already awaiting approval for this record"] };
  }
  const rec = {
    id: "DEL-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    module: moduleKey,
    team: teamOf(moduleKey),
    kind: labelOf(moduleKey),
    recordId,
    recordLabel: str((body || {}).label, 200) || recordId,
    reason,
    status: "Pending",
    requestedBy: by ? { id: by.id || null, name: by.name || null, email: by.email || null } : null,
    requestedAt: now(),
    decidedBy: null, decidedAt: null, decisionNote: "",
  };
  const l = read();
  l.unshift(rec);
  cache = l.slice(0, MAX);
  write();
  return { request: rec };
}

/* THE DECISION. Approving does the delete through the record's own store, so
   whatever that store writes on a delete -- the reason, the audit line, the
   creator it keeps -- is written here too, unchanged. */
function decide(id, body, user) {
  const l = read();
  const r = l.find((x) => x.id === id);
  if (!r) return { error: "not found" };
  if (r.status !== "Pending") {
    return { error: "invalid", errors: ["that request has already been " + r.status.toLowerCase()] };
  }
  if (!mayDecide(user, r.module)) {
    return { error: "forbidden",
      errors: ["only the head of " + r.team + ", or the Director Legal, can decide this"] };
  }
  /* SEPARATION OF DUTIES. A head may raise a deletion like anyone else; they
     may not then wave it through themselves. */
  const sameUser = r.requestedBy && user
    && ((r.requestedBy.id && r.requestedBy.id === user.id)
      || (r.requestedBy.email && user.email
        && r.requestedBy.email.toLowerCase() === String(user.email).toLowerCase()));
  if (sameUser) {
    return { error: "forbidden",
      errors: ["you raised this deletion; somebody else has to approve it"] };
  }

  const approve = !!(body || {}).approve;
  const note = str((body || {}).note, 500);
  if (!approve && !note) {
    return { error: "invalid", errors: ["say why it is being refused"] };
  }

  if (approve) {
    const done = performDelete(r, user);
    if (done.error) return done;
  }
  r.status = approve ? "Approved" : "Rejected";
  r.decidedBy = user ? { id: user.id || null, name: user.name || null, email: user.email || null } : null;
  r.decidedAt = now();
  r.decisionNote = note;
  write();
  return { request: r };
}

/* Each module's own delete, called by its own rules. The reason travels with
   it: the record's audit trail should say why it went, not merely that a
   request was approved. */
function performDelete(r, user) {
  try {
    if (r.module === "cases") {
      const cases = require("./litigation-cases.js");
      const out = cases.deleteCase(r.recordId, { reason: r.reason }, null, user);
      if (out && out.error) return out;
      return { ok: true };
    }
    const records = require("./module-records.js");
    const out = records.remove(r.recordId, r.reason, user);
    if (out && out.error) return out;
    return { ok: true };
  } catch (e) {
    return { error: "failed", errors: ["the record could not be deleted: " + e.message] };
  }
}

/* A request withdrawn by the person who raised it. Not a decision -- nobody
   approved anything -- so it is kept as its own outcome. */
function withdraw(id, user) {
  const l = read();
  const r = l.find((x) => x.id === id);
  if (!r) return { error: "not found" };
  if (r.status !== "Pending") return { error: "invalid", errors: ["that request is no longer pending"] };
  const mine = r.requestedBy && user
    && ((r.requestedBy.id && r.requestedBy.id === user.id)
      || (r.requestedBy.email && user.email
        && r.requestedBy.email.toLowerCase() === String(user.email).toLowerCase()));
  if (!mine) return { error: "forbidden", errors: ["only the person who raised it can withdraw it"] };
  r.status = "Withdrawn";
  r.decidedAt = now();
  write();
  return { request: r };
}

module.exports = {
  list, raise, decide, withdraw, pendingFor, pendingIndex,
  mayDecide, approversFor, teamOf, labelOf, reload,
  MODULE_TEAM, MODULE_LABEL,
};
