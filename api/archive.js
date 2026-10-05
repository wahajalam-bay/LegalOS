/* ARCHIVING — TAKING A FINISHED RECORD OFF THE WORKING BOOK.
 *
 * Deleting says "this should never have existed": a duplicate, a mistake, a row
 * raised against the wrong entity. Archiving says the opposite — this happened,
 * it is over, and it should stop appearing in the work.
 *
 * They are not the same act and they must not share a state. A closed matter
 * filed away as "deleted" reads as a mistake in the audit, and a live register
 * padded with everything that ever concluded is a register nobody can work
 * from. So:
 *
 *   ACTIVE     on the register, in the counts, in the work
 *   ARCHIVED   off the register and out of the KPIs, still searchable, still
 *              readable in full, reversible in one click
 *   REMOVED    soft-deleted, needs a reason, restorable — see api/module-records
 *
 * WHY AN OVERLAY. Only a handful of records are LegalOS's own; the other three
 * thousand are rows in somebody's workbook in Drive. Archiving cannot be a
 * column on a spreadsheet this system does not write to, so it is recorded here
 * — keyed by family and record id — and applied on top of the register on every
 * build and every restart. Drive is untouched, and a refresh cannot undo it.
 *
 * ARCHIVING IS NOT DELETING and it is deliberately easy: no approval, no
 * eligibility ladder. Anything can be archived, anything can be brought back,
 * and the audit says who did which and when.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "config", "archived.json");

/* Why a record was taken off the book. Free text is allowed but the list is
   what the department actually says, so the reasons stay comparable. */
const ARCHIVE_REASONS = [
  "Concluded",
  "Superseded by a later record",
  "Expired and not renewed",
  "Transferred out of Legal",
  "No longer relevant",
  "Other",
];

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache = j && typeof j.records === "object" ? j.records : {};
  } catch (e) {
    cache = {};                      // no file yet is the normal first-run state
  }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ records: cache }, null, 1), "utf8");
    fs.renameSync(tmp, FILE);        // atomic: a crash cannot truncate the file
    return true;
  } catch (e) { return false; }
}

const keyOf = (family, id) => String(family || "") + "::" + String(id || "");

function archive(family, id, reason, who) {
  if (!family || !id) return { error: "invalid", detail: "a family and a record id are required" };
  const all = read();
  const k = keyOf(family, id);
  if (all[k]) return { ok: true, already: true, record: all[k] };
  const at = new Date().toISOString();
  all[k] = {
    family, id, archivedAt: at,
    archivedBy: (who && (who.name || who.email)) || "unknown",
    reason: String(reason || "").trim() || null,
    audit: [{ at, action: "archived", by: (who && (who.name || who.email)) || "unknown",
      detail: String(reason || "").trim() || null }],
  };
  if (!write()) return { error: "could not save" };
  return { ok: true, record: all[k] };
}

function unarchive(family, id, who) {
  const all = read();
  const k = keyOf(family, id);
  const had = all[k];
  if (!had) return { ok: true, already: true };
  delete all[k];
  if (!write()) return { error: "could not save" };
  return { ok: true, was: had, by: (who && (who.name || who.email)) || "unknown" };
}

function list(family) {
  const all = read();
  return Object.values(all).filter((r) => !family || r.family === family);
}

function isArchived(family, id) { return !!read()[keyOf(family, id)]; }

/* Stamp the register. Called on the BUILD path and the REHYDRATE path, because
   a state that only survives one of them is a state that changes on restart —
   the same defect that once lost every recorded case decision. */
function applyTo(registers) {
  const all = read();
  if (!Object.keys(all).length) return { archived: 0 };
  let n = 0;
  for (const [family, rows] of Object.entries(registers || {})) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const hit = all[keyOf(family, r.id)];
      if (!hit) { if (r.archivedAt) { delete r.archivedAt; delete r.archivedBy; delete r.archiveReason; } continue; }
      r.archivedAt = hit.archivedAt;
      r.archivedBy = hit.archivedBy;
      r.archiveReason = hit.reason;
      n++;
    }
  }
  return { archived: n };
}

function reload() { cache = null; return read(); }

module.exports = { ARCHIVE_REASONS, archive, unarchive, list, isArchived, applyTo, reload };
