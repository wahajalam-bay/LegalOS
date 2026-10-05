/* NATIVE RECORDS FOR THE TRACKER-BACKED MODULES.
 *
 * IP matters, developer disputes and the like come from workbooks in Drive,
 * which LegalOS reads and must not write to. But Legal has to be able to raise
 * a NEW one without going to the workbook first — and that new record has to
 * persist, appear in the register beside the tracker rows, and be visibly
 * distinguishable from them.
 *
 * So native records live here, in LegalOS's own store, and are merged into the
 * register at read time carrying `origin: "LEGALOS"`. The tracker stays the
 * tracker; nothing is written back into Drive and nothing pretends to have
 * been. Where the two disagree, both are visible.
 *
 * Every record keeps who made it and when, because a record that appears in a
 * register with no author is one nobody can ask about.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "module-records.json");
const MAX = 5000;

let cache = null;
function read() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")).records || []; }
  catch (e) { cache = []; }
  return cache;
}
function write() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ records: cache }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}

const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 500);
const now = () => new Date().toISOString();

/* Not deleted, unless you ask for them. A record that vanishes takes its
   history with it. */
function list(moduleKey, opts) {
  const withDeleted = !!(opts && opts.withDeleted);
  return read().filter((r) => r.module === moduleKey && (withDeleted || !r.deletedAt));
}

function create(moduleKey, fields, who) {
  const l = read();
  const prefix = { ip: "IPN", developerDisputes: "DDN", notices: "NTN" }[moduleKey] || "MOD";
  const rec = {
    id: prefix + "-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    module: moduleKey,
    origin: "LEGALOS",
    fields: fields && typeof fields === "object" ? fields : {},
    createdBy: who ? { id: who.id || null, name: who.name || null, email: who.email || null } : null,
    createdAt: now(),
    updatedBy: null,
    updatedAt: null,
    deletedAt: null,
    audit: [{ at: now(), action: "created", by: (who && who.name) || (who && who.email) || null }],
  };
  l.unshift(rec);
  cache = l.slice(0, MAX);
  write();
  return { record: rec };
}

function update(id, fields, who) {
  const l = read();
  const r = l.find((x) => x.id === id);
  if (!r) return { error: "not found" };
  if (r.deletedAt) return { error: "deleted", detail: "This record has been deleted. Restore it before editing." };
  const before = { ...r.fields };
  r.fields = { ...r.fields, ...(fields || {}) };
  r.updatedBy = who ? { id: who.id || null, name: who.name || null, email: who.email || null } : null;
  r.updatedAt = now();
  /* What actually changed, so the trail reads as a sentence. */
  const moved = Object.keys(fields || {})
    .filter((k) => String(before[k] || "") !== String(r.fields[k] || ""))
    .map((k) => k + ": " + (before[k] || "—") + " → " + (r.fields[k] || "—"));
  r.audit.push({ at: now(), action: "updated", by: (who && who.name) || null, detail: moved.join("; ") });
  write();
  return { record: r };
}

/* SOFT DELETE, WITH A REASON.
   A hard delete takes the creator, the history and the documents with it, and
   leaves nobody able to answer "what happened to that matter". The record
   leaves the active register and keeps everything. */
function remove(id, reason, who) {
  const l = read();
  const r = l.find((x) => x.id === id);
  if (!r) return { error: "not found" };
  if (r.deletedAt) return { error: "invalid", errors: ["that record is already deleted"] };
  const why = str(reason, 500);
  if (!why) return { error: "invalid", errors: ["a reason is required to delete a record"] };
  r.deletedAt = now();
  r.deletedBy = who ? { id: who.id || null, name: who.name || null, email: who.email || null } : null;
  r.deletionReason = why;
  r.audit.push({ at: r.deletedAt, action: "deleted", by: (who && who.name) || null, detail: why });
  write();
  return { record: r };
}

function restore(id, who) {
  const l = read();
  const r = l.find((x) => x.id === id);
  if (!r) return { error: "not found" };
  if (!r.deletedAt) return { error: "invalid", errors: ["that record is not deleted"] };
  r.deletedAt = null;
  r.restoredBy = who ? { id: who.id || null, name: who.name || null, email: who.email || null } : null;
  r.restoredAt = now();
  r.audit.push({ at: r.restoredAt, action: "restored", by: (who && who.name) || null });
  write();
  return { record: r };
}

/* One record, by id, including a deleted one — the delete route has to read
   who raised it and what stage it is at BEFORE deciding, and it must not have
   to pull a whole module's list to do it. */
function get(id) { return read().find((r) => r.id === id) || null; }

module.exports = { list, get, create, update, remove, restore };
