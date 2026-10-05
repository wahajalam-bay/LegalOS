// Legal request intake — SERVER SIDE.
//
// This is what makes the requester portal real. A request raised at
// /legalos/portal/ used to be written only into that browser's localStorage,
// so it existed for exactly one person: the requester. Nobody in Legal ever
// saw it. Here the request is written to the server, which means the business
// raises it on their screen and it lands in Legal's triage queue on THEIRS.
//
// Two rules hold the trust boundary:
//   1. the CLIENT composes the record (the request shape, its module fields and
//      routing already live in the client store — duplicating that here would
//      give us two divergent definitions of a request), but
//   2. the SERVER stamps WHO raised it. The caller's identity comes from the
//      verified Cloudflare Access assertion or the app session, never from the
//      body — otherwise anyone could file a request as somebody else.
//
// Storage is a JSON file next to the other runtime config. It is small (a
// request is a few KB), it survives restarts, and it needs no database.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "config", "requests.json");
const DELETED_FILE = path.join(__dirname, "..", "config", "requests-deleted.json");
const MAX_RECORDS = 5000;      // hard ceiling so the file cannot grow forever
const MAX_RECORD_BYTES = 64 * 1024;

let cache = null;

/* DELETED MEANS DELETED, EVEN TO A BROWSER THAT STILL REMEMBERS.
 *
 * The client keeps its own copy of every request in localStorage, and
 * `hydrateRequests()` re-pushes anything the server does not have -- it exists
 * so a request raised while the server was unreachable is not stranded. But it
 * cannot tell "the server never received this" from "the server deliberately no
 * longer has this", so removing a request server-side lasted exactly until the
 * next page load in any browser that still held it. Nine removed requests came
 * straight back that way.
 *
 * The id is therefore remembered. A re-push of a removed request is refused
 * rather than re-created, and refused for every browser at once, which is the
 * only place that question can be answered. Retrying a request the server never
 * saw still works: its id was never removed, so it is not in here. */
/* DELIBERATELY NOT CACHED. The list is removed-request ids -- a few dozen at
   most -- and it is written by the cleanup tooling running as a SEPARATE
   process while the server is up. Cached, the server answered from a set it had
   read before the removal happened and let every one of those requests back in;
   the tombstone only took effect after a restart, which is precisely the
   "it came back" behaviour this exists to stop. `create` is not a hot path. */
function readDeleted() {
  try {
    const j = JSON.parse(fs.readFileSync(DELETED_FILE, "utf8"));
    return new Set(Array.isArray(j.deleted) ? j.deleted : []);
  } catch (e) {
    return new Set();          // no file yet is the normal state
  }
}

/* Record that these ids are gone for good. Used by the cleanup tooling; a
   request removed by hand from the store without this will simply come back. */
function tombstone(ids) {
  const set = readDeleted();
  for (const id of [].concat(ids || [])) if (id) set.add(String(id));
  try {
    fs.mkdirSync(path.dirname(DELETED_FILE), { recursive: true });
    const tmp = DELETED_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ deleted: [...set] }, null, 2), "utf8");
    fs.renameSync(tmp, DELETED_FILE);
  } catch (e) { /* the caller sees the count either way */ }
  return set.size;
}

function isDeleted(id) { return readDeleted().has(String(id)); }

function read() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const j = JSON.parse(raw);
    cache = Array.isArray(j.requests) ? j.requests : [];
  } catch (e) {
    cache = [];                // no file yet is the normal first-run state
  }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ requests: cache }, null, 2), "utf8");
    fs.renameSync(tmp, FILE);  // atomic: a crash mid-write cannot truncate it
    return true;
  } catch (e) {
    return false;
  }
}

// The identity the server vouches for, in the shape the client already renders.
function stamp(who, me) {
  return {
    name: (me && me.name) || (who.email || "").split("@")[0].replace(/[._]/g, " ") || "Requester",
    email: who.email || null,
    designation: (me && me.role) || null,
  };
}

/* Accept a request composed by the client. Everything about WHO is overwritten
   with the verified caller, and the payload is size-capped. */
function create(payload, who, me) {
  if (!payload || typeof payload !== "object") return { error: "empty request" };
  const title = String(payload.title || "").trim();
  if (!title) return { error: "a request needs a title" };

  const list = read();
  const now = new Date().toISOString();
  // Keep the client's id when it looks like one, otherwise mint a server id.
  // Either way it must be unique in this store.
  let id = String(payload.id || "").trim() || "REQ-" + Date.now().toString(36).toUpperCase();
  /* A request that was removed does not come back because a browser still has
     it. Refused rather than given a fresh id -- minting a new one would put the
     same request back on the register under a different number, which is the
     resurrection this prevents, only harder to spot. */
  if (isDeleted(id)) return { error: "deleted", detail: "This request was removed and cannot be re-created." };
  if (list.some((r) => r.id === id)) id = id + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

  /* The client composes the request, but it does not get to write whatever it
     likes. Internal keys (anything `__`-prefixed) and fields the server owns are
     stripped before the spread, so a crafted body cannot forge provenance,
     back-date an arrival, or smuggle engine internals into the store. */
  const SERVER_OWNED = new Set(["requestedBy", "requestedByEmail", "requestedById", "receivedAt",
    "serverCreatedAt", "source", "updatedBy", "updatedAt", "history"]);
  const safe = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k.startsWith("__") || SERVER_OWNED.has(k)) continue;
    safe[k] = v;
  }

  const rec = {
    ...safe,
    id,
    title,
    /* A REQUEST WITH NO STATUS IS INVISIBLE.
       The triage board sorts requests into lanes by status ("New"/"Triage" is
       the intake lane). A request raised through the API without one matched no
       lane at all: it was stored, and the requester could see it, but it never
       appeared on any Legal screen. Intake defaults to the first lane, which is
       what "raised and awaiting triage" means. */
    status: String(safe.status || "").trim() || "New",
    // Server-owned fields. A client cannot forge any of these.
    requestedBy: stamp(who, me),
    requestedByEmail: who.email || null,
    // A roster id when the caller is on it; otherwise whatever the client used
    // to stamp the record (the portal's department identity), so "who raised
    // this" is never lost even for someone outside the legal roster.
    requestedById: (me && me.id) || payload.requestedById || payload.requesterId || null,
    source: payload.source === "portal" ? "portal" : "app",
    receivedAt: now,
    serverCreatedAt: now,
  };

  const size = Buffer.byteLength(JSON.stringify(rec), "utf8");
  if (size > MAX_RECORD_BYTES) return { error: "request is too large" };

  list.unshift(rec);
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;
  if (!write()) return { error: "could not save the request" };
  return { ok: true, id, request: rec };
}

/* What this caller may read.
   Legal staff (a known principal who may read the registers) see the whole
   intake queue — that is the triage queue. Everyone else sees only the requests
   they raised themselves, matched on the verified email. Default-deny: an
   unknown caller with no email gets nothing. */
/* May this caller see this request? The person who raised it, or Legal.
   Attachments follow the same rule, so a document can never be more visible
   than the request carrying it -- including after triage reassigns it. */
function canSee(rec, who, me) {
  if (!rec) return false;
  const legal = !!(me && (me.admin || me.canReadKnowledge || me.legalTeam || me.rbac === "head"));
  if (legal) return true;
  const mine = String((who && who.email) || "").toLowerCase();
  return !!mine && String(rec.requestedByEmail || "").toLowerCase() === mine;
}

function byId(id) {
  return read().find((r) => r.id === String(id)) || null;
}

/* Attach a document to a request. The bytes are stored by request-uploads;
   what lands on the record is the description of them. */
function attach(id, file, who, me) {
  const rec = byId(id);
  if (!rec) return { error: "not_found" };
  if (!canSee(rec, who, me)) return { error: "forbidden" };
  const uploads = require("./request-uploads");
  if ((rec.attachments || []).length >= uploads.MAX_PER_REQUEST) {
    return { error: "this request already has the maximum number of attachments" };
  }
  const r = uploads.store(id, file || {}, { email: (who && who.email) || null, name: stamp(who, me) });
  if (r.error) return r;

  const list_ = read();
  const i = list_.findIndex((x) => x.id === rec.id);
  const now = new Date().toISOString();
  list_[i] = {
    ...list_[i],
    attachments: [...(list_[i].attachments || []), r.attachment],
    updatedAt: now,
    history: [...(list_[i].history || []), {
      at: now, by: (who && who.email) || null,
      action: "Document attached", detail: r.attachment.name,
    }],
  };
  if (!write()) return { error: "could not save the attachment" };
  return { ok: true, attachment: r.attachment, request: list_[i] };
}

/* Stream one attachment back, if this caller may see its request. An
   unauthorised attachment is reported exactly like a missing one. */
function attachment(id, attId, who, me) {
  const rec = byId(id);
  if (!rec || !canSee(rec, who, me)) return { error: "not_found" };
  const att = (rec.attachments || []).find((a) => a.id === String(attId));
  if (!att) return { error: "not_found" };
  const uploads = require("./request-uploads");
  /* A recovered row keeps its own id and points at where the new bytes went. */
  const buf = uploads.read(att.storedId || att.id, rec.id) || uploads.read(att.id, rec.id);
  if (!buf) return { error: "not_found" };
  return { ok: true, attachment: att, buffer: buf };
}

/* "ON FILE" MEANS THE BYTES COME BACK.
 *
 * Attachments seeded before uploads were durable are metadata only: a name, a
 * size and nothing to serve. Rendering those as normal rows is what produced
 * a working-looking Preview that 404s and a Download that the browser reports
 * as "file wasn't available on site".
 *
 * Every attachment handed to a client is stamped with whether its bytes
 * actually resolve, so a screen can say "needs re-upload" instead of lying.
 * The rows are NOT deleted: the record that a document was once attached is
 * part of the request, and the fix is to re-upload it, not to hide it. */
function stampAttachments(rec) {
  if (!rec || !Array.isArray(rec.attachments)) return rec;
  const uploads = require("./request-uploads");
  return Object.assign({}, rec, {
    attachments: rec.attachments.map((a) => {
      const buf = uploads.read(a.storedId || a.id, rec.id);
      return Object.assign({}, a, {
        onFile: !!(buf && buf.length),
        bytes: buf ? buf.length : 0,
      });
    }),
  });
}

/* RE-UPLOADING A DOCUMENT WHOSE FILE WAS NEVER STORED.
 *
 * Attachments recorded before uploads were durable have a name, a size and no
 * bytes. Making somebody delete the request and start again to fix that would
 * throw away the approvals and the history attached to it, so the file is
 * restored IN PLACE: the row keeps its id, its place on the request and the
 * category it answers, and gains the bytes it never had.
 *
 * NOTHING IS REWRITTEN. The original row's details are kept on the record as
 * `recovered`, and the history gains a line saying the file was missing and a
 * line saying who supplied it -- so the gap between the two is visible rather
 * than tidied away. */
function replaceAttachment(id, attId, file, who, me) {
  const rec = byId(id);
  if (!rec) return { error: "not_found" };
  if (!canSee(rec, who, me)) return { error: "forbidden" };
  const existing = (rec.attachments || []).find((a) => a.id === String(attId));
  if (!existing) return { error: "not_found" };

  const uploads = require("./request-uploads");
  const had = uploads.read(existing.id, rec.id);
  const r = uploads.store(id, file || {}, { email: (who && who.email) || null, name: stamp(who, me) });
  if (r.error) return r;

  const list_ = read();
  const i = list_.findIndex((x) => x.id === rec.id);
  const now = new Date().toISOString();
  const restored = Object.assign({}, r.attachment, {
    /* The row keeps its identity so every reference to it still resolves. */
    id: existing.id,
    kind: existing.kind || r.attachment.kind,
    version: (existing.version || 1) + 1,
    recovered: {
      originalName: existing.name,
      originalSizeKb: existing.sizeKb || null,
      hadBytes: !!(had && had.length),
      recoveredAt: now,
      recoveredBy: stamp(who, me),
    },
  });
  /* The bytes were written under a new id; point the row at them. */
  restored.storedId = r.attachment.id;
  list_[i] = {
    ...list_[i],
    attachments: (list_[i].attachments || []).map((a) => (a.id === existing.id ? restored : a)),
    updatedAt: now,
    history: [...(list_[i].history || []), {
      at: now, by: (who && who.email) || null,
      action: had && had.length ? "Document replaced" : "Document re-uploaded after its file was found missing",
      detail: existing.name + " → " + r.attachment.name + " (version " + restored.version + ")",
    }],
  };
  if (!write()) return { error: "could not save the attachment" };
  return { ok: true, attachment: restored, request: list_[i] };
}

function list(who, me, opts) {
  /* A removed request is off the register by default. `withDeleted` is what
     the Removed view asks for, and it never widens WHO may see a request —
     the visibility filter below still applies to it. */
  const withDeleted = !!(opts && opts.withDeleted);
  const all = read().filter((r) => withDeleted || !r.deletedAt);
  const legal = !!(me && (me.admin || me.canReadKnowledge || me.legalTeam || me.rbac === "head"));
  if (legal) return all.map(stampAttachments);
  const mine = String((who && who.email) || "").toLowerCase();
  if (!mine) return [];
  return all.filter((r) => String(r.requestedByEmail || "").toLowerCase() === mine).map(stampAttachments);
}

/* Triage / status updates from the legal side. Only fields Legal owns. */
/* What a legal caller may change on a shared request.
 *
 * This used to stop at status/stage/owner, which meant a stage advance synced
 * the stage but left the WORKFLOW STATE behind: no stageLog, no progress, no
 * record of who asked for approval, no activity trail. Another person opening
 * the same request saw it at the new stage with none of the context that got it
 * there — and the approval round-trip could not fire, because the server had
 * lost `approvalRequestedBy`.
 *
 * Provenance stays server-owned and is deliberately NOT here: requestedBy,
 * requestedByEmail, requestedById, receivedAt, serverCreatedAt, source and
 * history cannot be set by a client, so nobody can forge who raised a request
 * or when it arrived. */
const PATCHABLE = new Set([
  "status", "stage", "owner", "category", "practiceArea", "priority", "assignedTo", "triage", "dueDate",
  // workflow state — the shared story of the request
  "stageLog", "activity", "progress", "ballWith", "blockedOn", "hold",
  "approvalRequestedBy", "escalated", "escalation", "deliveredAt",
  "categoryConfirmed", "proposedCategory", "requiredDocs", "closedAt", "closeReason",
]);
function patch(id, changes, who, me) {
  const legal = !!(me && (me.admin || me.canReadKnowledge || me.legalTeam || me.rbac === "head"));
  if (!legal) return { error: "forbidden" };
  const list_ = read();
  const rec = list_.find((r) => r.id === id);
  if (!rec) return { error: "no such request" };
  const applied = {};
  Object.keys(changes || {}).forEach((k) => {
    if (!PATCHABLE.has(k)) return;
    applied[k] = changes[k];
    rec[k] = changes[k];
  });
  rec.updatedAt = new Date().toISOString();
  rec.updatedBy = (me && me.name) || (who && who.email) || "legal";
  (rec.history = rec.history || []).push({ at: rec.updatedAt, by: rec.updatedBy, changes: applied });
  if (!write()) return { error: "could not save" };
  return { ok: true, request: rec };
}

/* ------------------------------------------------- removing a request (§95)
 *
 * SOFT, AND TOMBSTONED AT THE SAME TIME.
 *
 * A request lives in two places: this store, and every browser that has one in
 * its local collection. Marking it removed here is what makes it disappear from
 * the register; adding it to the tombstone list is what stops the next browser
 * that still holds a copy from pushing it straight back in. Doing only the
 * first is the "deleted requests resurrect" bug; doing only the second loses
 * the record. So a removal does both, in that order.
 *
 * Restoring lifts the tombstone as well, otherwise a restored request would be
 * on the register and simultaneously refused on its next sync. */
function untombstone(ids) {
  const set = readDeleted();
  let touched = false;
  for (const id of [].concat(ids || [])) if (set.delete(String(id))) touched = true;
  if (!touched) return false;
  try {
    fs.mkdirSync(path.dirname(DELETED_FILE), { recursive: true });
    const tmp = DELETED_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ deleted: [...set] }, null, 2), "utf8");
    fs.renameSync(tmp, DELETED_FILE);
  } catch (e) { return false; }
  return true;
}

/* Who may remove a request, decided here and not in the browser.
 *
 * The person who raised it may withdraw it while it is still only theirs —
 * nothing assigned, nothing approved, no work done against it. After that it is
 * shared work and the head of Legal decides, which is the deletion-approval
 * path that already exists. Legal leads may remove at any stage; they are the
 * ones who answer for the register. */
const REQ_EARLY = /^(|draft|new|submitted|received|to be assigned|unassigned|open)$/i;

function canRemove(rec, who, me) {
  if (!rec) return { ok: false, why: "not found" };
  const head = !!(me && (me.admin || me.rbac === "head"));
  if (head) return { ok: true };
  const mine = String(rec.requestedByEmail || "").toLowerCase() === String((who && who.email) || "").toLowerCase();
  if (!mine) return { ok: false, why: "approval_required", detail: "This request was raised by someone else, so the head of Legal decides." };
  const stage = String(rec.stage || rec.status || "").trim();
  if (!REQ_EARLY.test(stage)) {
    return { ok: false, why: "approval_required", detail: "Work has already started on this request, so the head of Legal decides." };
  }
  if (rec.assignedTo || rec.owner) {
    return { ok: false, why: "approval_required", detail: "This request is already assigned, so the head of Legal decides." };
  }
  return { ok: true };
}

function remove(id, reason, who, me) {
  const rec = read().find((r) => r.id === id);
  if (!rec) return { error: "no such request" };
  if (rec.deletedAt) return { error: "already removed" };
  const verdict = canRemove(rec, who, me);
  if (!verdict.ok) return { error: verdict.why, detail: verdict.detail };
  const txt = String(reason || "").trim();
  if (!txt) return { error: "invalid", detail: "a reason is required" };
  rec.deletedAt = new Date().toISOString();
  rec.deletedBy = (me && me.name) || (who && who.email) || "unknown";
  rec.deleteReason = txt;
  (rec.history = rec.history || []).push({ at: rec.deletedAt, by: rec.deletedBy, action: "removed", detail: txt });
  if (!write()) return { error: "could not save" };
  tombstone(id);
  return { ok: true, request: rec };
}

function restore(id, who, me) {
  const rec = read().find((r) => r.id === id);
  if (!rec) return { error: "no such request" };
  if (!rec.deletedAt) return { ok: true, request: rec };
  const at = new Date().toISOString();
  (rec.history = rec.history || []).push({ at, by: (me && me.name) || (who && who.email) || "unknown", action: "restored" });
  delete rec.deletedAt; delete rec.deletedBy; delete rec.deleteReason;
  untombstone(id);
  if (!write()) return { error: "could not save" };
  return { ok: true, request: rec };
}

const count = () => read().filter((r) => !r.deletedAt).length;

module.exports = { attach, attachment, replaceAttachment, canSee, byId, create, list, patch, count, stampAttachments, tombstone, untombstone, isDeleted, remove, restore, canRemove };
