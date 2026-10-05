// LEGALOS-HELD CORRECTIONS TO A DRIVE-DERIVED RECORD.
//
// A licence is read from a tracker in Google Drive, and Drive is the source of
// truth and is never written to. But the tracker is sometimes wrong, or behind:
// a licence number mistyped, a renewal granted last week, a status the sheet
// has not caught up with. Legal needs to correct that in LegalOS without
// touching the source.
//
// So an edit is stored HERE, as an overlay keyed by record id, and merged over
// the Drive-derived record when it is served. Three consequences, all of them
// deliberate:
//
//   THE SOURCE IS UNCHANGED. Re-crawling Drive re-derives the same record; the
//   overlay is re-applied on top. Nothing is lost on a rebuild, and nothing is
//   written back to Drive.
//
//   THE ORIGINAL IS STILL VISIBLE. Every overridden field keeps what the source
//   said, so a reader can always see that LegalOS is showing a correction and
//   what it replaced.
//
//   EVERY EDIT IS ATTRIBUTED. Who changed it and when, per field. A correction
//   nobody can trace is worth less than the value it replaced.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "config", "compliance-overrides.json");

/* Fields a person may correct. Anything about LINEAGE -- the Drive file ids,
   folder paths, document lists, the source row -- is deliberately absent: those
   describe where the record came from, and are not opinions to be edited. */
const EDITABLE = {
  licence: ["number", "authority", "issued", "expiry", "status", "entity", "owner", "renewalStatus", "notes"],
};

let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { cache = {}; }
  if (!cache || typeof cache !== "object") cache = {};
  return cache;
}

function save() {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1));
  fs.renameSync(tmp, FILE);
}

function forRecord(id) {
  const all = load();
  return all[String(id)] || null;
}

/* Merge the overlay over a Drive-derived record. The record is copied, never
   mutated in place -- the model hands out the same objects to every caller. */
function apply(kind, rec) {
  if (!rec || !rec.id) return rec;
  const ov = forRecord(rec.id);
  if (!ov || !ov.fields) return rec;
  const allowed = EDITABLE[kind] || [];
  const out = { ...rec };
  const edited = {};
  for (const [k, v] of Object.entries(ov.fields)) {
    if (!allowed.includes(k)) continue;
    edited[k] = { from: v.was != null ? v.was : (rec[k] == null ? null : rec[k]), to: v.value, by: v.by, at: v.at, reason: v.reason || null };
    out[k] = v.value;
  }
  if (!Object.keys(edited).length) return rec;
  out.edited = edited;                       // what LegalOS changed, and from what
  out.editedFields = Object.keys(edited);
  out.hasEdits = true;
  return out;
}

function applyAll(kind, rows) {
  return (rows || []).map((r) => apply(kind, r));
}

/* Record an edit. Returns the fields actually accepted, so a caller cannot
   believe it saved something the policy refused. */
function set(kind, id, fields, by, reason, prev) {
  const allowed = EDITABLE[kind] || [];
  prev = prev || {};
  if (!by || !by.email) throw Object.assign(new Error("an edit must name who made it"), { status: 400 });
  const all = load();
  const key = String(id);
  const cur = all[key] || { kind, fields: {} };
  const at = new Date().toISOString();
  const accepted = [], refused = [];
  for (const [k, v] of Object.entries(fields || {})) {
    if (!allowed.includes(k)) { refused.push(k); continue; }
    const value = typeof v === "string" ? v.trim() : v;
    if (value === "" || value == null) { delete cur.fields[k]; accepted.push(k); continue; }
    /* WHY, not just what. A correction with no stated reason is an unexplained
       divergence from the source: the next reader cannot tell whether the
       tracker was wrong, the authority reissued the licence, or somebody
       mistyped. The previous value is kept alongside so the change is legible
       in both directions. */
    cur.fields[k] = { value, by: by.email, at, reason: String(reason || "").trim() || null, was: prev[k] == null ? null : prev[k] };
    accepted.push(k);
  }
  cur.kind = kind;
  if (!Object.keys(cur.fields).length) delete all[key];
  else all[key] = cur;
  cache = all;
  save();
  return { accepted, refused, editable: allowed };
}

module.exports = { apply, applyAll, set, forRecord, EDITABLE };
