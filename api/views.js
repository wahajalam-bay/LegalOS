// Saved views — a user's named filter states, persisted SERVER-SIDE.
//
// Why not localStorage: a saved view that lives in one browser is not saved, it
// is remembered. It disappears on another device, in another profile, and the
// day IT reimages the laptop. So the authoritative store is here, keyed to the
// verified caller, and the same person signing in anywhere sees their views.
//
// A saved view is UI CRITERIA ONLY. It never carries data and never carries
// authority: applying one sets filters over whatever the register API is willing
// to return to that user TODAY. Someone whose litigation access was revoked can
// still open a saved "High risk litigation" view — and it will show nothing,
// because the register refuses the rows. Permissions are evaluated at read time,
// every time, by the register endpoint. This file cannot widen them.
const fs = require("fs");
const path = require("path");
const { sanitize } = require("./register-schema");

const FILE = path.join(__dirname, "..", "config", "views.json");
const MAX_PER_USER = 60;

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache = Array.isArray(j.views) ? j.views : [];
  } catch (e) {
    cache = [];                      // no file yet is the normal first-run state
  }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ views: cache }, null, 2), "utf8");
    fs.renameSync(tmp, FILE);        // atomic: a crash mid-write cannot truncate
    return true;
  } catch (e) {
    return false;
  }
}

// Who owns a view. The verified email is the key, so the same person sees their
// views on any device. Never taken from the request body.
const ownerOf = (who) => String((who && who.email) || "").toLowerCase();

function list(who, register) {
  const owner = ownerOf(who);
  if (!owner) return [];
  return read()
    .filter((v) => v.owner === owner && (!register || v.register === register))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function create(payload, who, me) {
  const owner = ownerOf(who);
  if (!owner) return { error: "unauthenticated" };
  const clean = sanitize(payload);
  if (clean.error) return { error: clean.error };

  const all = read();
  const mine = all.filter((v) => v.owner === owner);
  if (mine.length >= MAX_PER_USER) return { error: "You already have " + MAX_PER_USER + " saved views. Delete one first." };
  // A name is unique per (owner, register) so "apply" is unambiguous.
  if (mine.some((v) => v.register === clean.register && v.name.toLowerCase() === clean.name.toLowerCase())) {
    return { error: "You already have a view called “" + clean.name + "” here." };
  }

  const now = new Date().toISOString();
  const rec = {
    id: "VIEW-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    owner,
    ownerName: (me && me.name) || (who && who.email) || owner,
    register: clean.register,
    name: clean.name,
    filters: clean.filters || {},
    q: clean.q || "",
    sort: clean.sort || null,
    hiddenColumns: clean.hiddenColumns || [],
    view: clean.view || "",
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
  all.unshift(rec);
  if (!write()) return { error: "could not save the view" };
  return { ok: true, view: rec, dropped: clean.dropped };
}

/* Rename, overwrite with the current filter state, or set as default.
   Ownership is checked against the VERIFIED caller, so a known id is not enough
   to touch somebody else's view — it answers 404, the same as one that is not
   there, so ids cannot be probed. */
function update(id, payload, who, me) {
  const owner = ownerOf(who);
  if (!owner) return { error: "unauthenticated" };
  const all = read();
  const rec = all.find((v) => v.id === id && v.owner === owner);
  if (!rec) return { error: "not_found" };

  let dropped = [];
  if (payload && (payload.filters || payload.sort || payload.q != null || payload.hiddenColumns || payload.name)) {
    const clean = sanitize({
      register: rec.register,
      name: payload.name != null ? payload.name : rec.name,
      filters: payload.filters != null ? payload.filters : rec.filters,
      q: payload.q != null ? payload.q : rec.q,
      sort: payload.sort !== undefined ? payload.sort : rec.sort,
      hiddenColumns: payload.hiddenColumns != null ? payload.hiddenColumns : rec.hiddenColumns,
      view: payload.view != null ? payload.view : rec.view,
    });
    if (clean.error) return { error: clean.error };
    if (payload.name != null && clean.name.toLowerCase() !== rec.name.toLowerCase()
      && all.some((v) => v.owner === owner && v.register === rec.register && v.id !== rec.id
        && v.name.toLowerCase() === clean.name.toLowerCase())) {
      return { error: "You already have a view called “" + clean.name + "” here." };
    }
    rec.name = clean.name;
    rec.filters = clean.filters || {};
    rec.q = clean.q || "";
    rec.sort = clean.sort || null;
    rec.hiddenColumns = clean.hiddenColumns || [];
    rec.view = clean.view || "";
    dropped = clean.dropped || [];
  }

  if (payload && payload.isDefault != null) {
    const want = !!payload.isDefault;
    if (want) for (const v of all) if (v.owner === owner && v.register === rec.register) v.isDefault = false;
    rec.isDefault = want;
  }

  rec.updatedAt = new Date().toISOString();
  if (!write()) return { error: "could not save the view" };
  return { ok: true, view: rec, dropped };
}

function remove(id, who) {
  const owner = ownerOf(who);
  if (!owner) return { error: "unauthenticated" };
  const all = read();
  const i = all.findIndex((v) => v.id === id && v.owner === owner);
  if (i === -1) return { error: "not_found" };
  all.splice(i, 1);
  if (!write()) return { error: "could not save" };
  return { ok: true };
}

function duplicate(id, who, me) {
  const owner = ownerOf(who);
  if (!owner) return { error: "unauthenticated" };
  const src = read().find((v) => v.id === id && v.owner === owner);
  if (!src) return { error: "not_found" };
  let name = src.name + " (copy)";
  const mine = read().filter((v) => v.owner === owner && v.register === src.register);
  let n = 2;
  while (mine.some((v) => v.name.toLowerCase() === name.toLowerCase())) name = src.name + " (copy " + n++ + ")";
  return create({ register: src.register, name, filters: src.filters, q: src.q, sort: src.sort,
    hiddenColumns: src.hiddenColumns, view: src.view }, who, me);
}

const count = () => read().length;

module.exports = { list, create, update, remove, duplicate, count };
