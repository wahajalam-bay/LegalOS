/* ONE REQUEST. ONE DOCUMENT SET. REAL BYTES.
 *
 * What this replaces: request attachments were stored as
 *     { id, name: "Term Sheet.docx", sizeKb: 1, kind: "...docx" }
 * and nothing else. No bytes, no storage key, no source. The filename rendered,
 * the row said "On file", and Preview and Download could not work because there
 * had never been a file -- only the memory of one being chosen in a file picker.
 *
 * HOW THIS STORES A DOCUMENT
 *   bytes      content-addressed under config/request-docs/blobs, named by the
 *              sha256 of the content. The same file uploaded twice is one blob.
 *   record     an entry in index.json binding that blob to ONE request, with
 *              who uploaded it, when, what checklist item it answers, and which
 *              version it is.
 * Both are on disk before the upload call returns, so the document survives a
 * refresh, a new session and a server restart. Nothing here uses a blob: URL,
 * an object URL or an in-memory File -- those die at navigation, which is how
 * a document can appear to exist and then not.
 *
 * ACCESS IS BY REQUEST SCOPE, NOT BY WHO UPLOADED IT.
 * A document belongs to the request and travels with it: the requester, their
 * HOD, Finance when the request is routed there, and Legal once it arrives all
 * read the SAME object. The requester never uploads anything twice, and the
 * next approver never opens an empty panel. What controls access is the
 * request's own participants plus the document's visibility class -- never a
 * copy per role, and never a global relaxation of document security.
 *
 * AN UNAUTHORISED READER GETS 404, NOT 403: a 403 on a document id confirms
 * that the document exists, which is itself a leak.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "config", "request-docs");
const BLOBS = path.join(ROOT, "blobs");
const INDEX = path.join(ROOT, "index.json");
const MAX_BYTES = 40 * 1024 * 1024;

const VISIBILITY = ["REQUEST_SHARED", "INTERNAL_LEGAL", "FINANCE_INTERNAL"];
const SOURCE_TYPE = "LEGALOS_UPLOAD";

const now = () => new Date().toISOString();
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 300);

const MIME = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8",
};
const extOf = (name) => (String(name || "").match(/\.[A-Za-z0-9]{1,6}$/) || [""])[0].toLowerCase();
const mimeFor = (name, given) => MIME[extOf(name)] || str(given, 120) || "application/octet-stream";

/* Formats the in-app viewer can render. Anything else still downloads -- the
   answer to "we cannot preview this" is never "so you cannot have it". */
const PREVIEWABLE = /^(application\/pdf|image\/|text\/)|wordprocessingml|msword|spreadsheetml|ms-excel/;

let idx = null;
function read() {
  if (idx) return idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX, "utf8")).documents || []; }
  catch (e) { idx = []; }
  return idx;
}
function write() {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = INDEX + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ documents: idx }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, INDEX);
}
function reload() { idx = null; return read(); }

const byId = (id) => read().find((d) => d.id === id) || null;

/* -------------------------------------------------------------- writing -- */

/* The bytes land first. A record that points at a blob which was never written
   is exactly the failure this module exists to end, so the index is only
   touched once the file is on disk. */
function put(meta, buf, by) {
  if (!buf || !buf.length) return { error: "invalid", errors: ["no file received"] };
  if (buf.length > MAX_BYTES) return { error: "too_large", errors: ["that file is larger than 40MB"] };
  const requestId = str(meta.requestId, 80);
  const filename = str(meta.originalFilename, 240);
  if (!requestId) return { error: "invalid", errors: ["a request is required"] };
  if (!filename) return { error: "invalid", errors: ["a file name is required"] };

  const checksum = crypto.createHash("sha256").update(buf).digest("hex");
  const storageKey = checksum + extOf(filename);
  fs.mkdirSync(BLOBS, { recursive: true });
  const dest = path.join(BLOBS, storageKey);
  try {
    if (!fs.existsSync(dest)) {
      const tmp = dest + ".part";
      fs.writeFileSync(tmp, buf, { mode: 0o600 });
      fs.renameSync(tmp, dest);
    }
  } catch (e) { return { error: "storage_failed", errors: ["the file could not be stored: " + e.message] }; }

  const replaces = meta.replacesId ? byId(str(meta.replacesId, 60)) : null;
  const doc = {
    id: "RDOC-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
    requestId,
    requestKind: str(meta.requestKind, 30) || "contract",
    originalFilename: filename,
    storageKey,
    checksum,
    mimeType: mimeFor(filename, meta.mimeType),
    size: buf.length,
    uploadedBy: by ? { id: by.id || null, name: by.name || null, email: by.email || null } : null,
    uploadedAt: now(),
    visibility: VISIBILITY.includes(meta.visibility) ? meta.visibility : "REQUEST_SHARED",
    attachmentRequirementType: str(meta.attachmentRequirementType, 120) || null,
    annexureRef: str(meta.annexureRef, 60) || null,
    sourceType: SOURCE_TYPE,
    version: replaces ? (replaces.version || 1) + 1 : 1,
    replacesId: replaces ? replaces.id : null,
    supersededById: null,
    removedAt: null, removedBy: null,
  };
  read().unshift(doc);
  /* REPLACING DOES NOT ERASE. The earlier version keeps its bytes and its row;
     it is marked superseded so the current one is unambiguous and the history
     is still there to inspect. */
  if (replaces) { replaces.supersededById = doc.id; }
  write();
  return { document: doc };
}

/* Soft. Removing a document from a request must not remove the evidence that
   it was once there, or an approval can be rewritten after the fact. */
function remove(id, by) {
  const d = byId(id);
  if (!d) return { error: "not found" };
  if (d.removedAt) return { error: "invalid", errors: ["that document is already removed"] };
  d.removedAt = now();
  d.removedBy = by ? { id: by.id || null, name: by.name || null, email: by.email || null } : null;
  write();
  return { document: d };
}

/* --------------------------------------------------------- authorisation -- */

/* Who is in this request. Contract requests answer for themselves; a legacy
   Legal Request answers from the server-side copy. A request nobody can
   resolve grants nobody anything. */
function participants(requestId, kind) {
  if (kind === "request" || /^REQ-/i.test(requestId)) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "requests.json"), "utf8"));
      const r = (raw.requests || []).find((x) => x.id === requestId);
      if (!r) return null;
      return {
        kind: "request",
        requesterEmail: String(r.requestedByEmail || r.requesterEmail || "").toLowerCase(),
        hodEmail: "", financeRequired: false,
        reachedApproval: true, reachedFinance: false, reachedLegal: true,
      };
    } catch (e) { return null; }
  }
  try {
    const cr = require("./contract-requests.js");
    const r = cr.byId(requestId);
    if (!r) return null;
    const reached = (s) => cr.STAGE_ORDER.indexOf(r.status) >= cr.STAGE_ORDER.indexOf(s);
    return {
      kind: "contract",
      requesterEmail: String((r.createdBy && r.createdBy.email) || "").toLowerCase(),
      hodEmail: String(((r.values || {}).request || {}).approvingHod || "").toLowerCase(),
      financeRequired: !!(r.financeRequired || cr.assess(r).financeRequired),
      reachedApproval: r.status !== "Draft",
      reachedFinance: reached("Finance Review"),
      reachedLegal: reached("Legal Intake"),
      escalated: !!r.escalated,
      status: r.status,
    };
  } catch (e) { return null; }
}

const isLegalUser = (u) => !!(u && (u.rbac === "head" || u.rbac === "lead" || u.rbac === "member"
  || u.rbac === "paralegal") && u.canReadKnowledge !== false && String(u.dept || "Legal") === "Legal");
const isFinanceUser = (u) => !!(u && (String(u.dept || "").toLowerCase() === "finance" || u.finance === true));
const sameUser = (a, b) => !!(a && b && String(a).toLowerCase() === String(b).toLowerCase());

/* The one decision. Everything that serves a name, a count, a preview or bytes
   asks this first, so a hidden document cannot leak through a route that
   forgot. */
function canAccess(viewer, doc, parts) {
  if (!viewer || !doc) return false;
  const p = parts || participants(doc.requestId, doc.requestKind);
  if (!p) return false;
  const me = String(viewer.email || "").toLowerCase();

  /* Visibility class first: an internal Legal note is not request-shared even
     to the person whose request it is. */
  if (doc.visibility === "INTERNAL_LEGAL" && !isLegalUser(viewer)) return false;
  if (doc.visibility === "FINANCE_INTERNAL" && !(isFinanceUser(viewer) || isLegalUser(viewer))) return false;

  if (sameUser(me, p.requesterEmail)) return true;              // it is their request
  if (p.hodEmail && sameUser(me, p.hodEmail) && p.reachedApproval) return true;
  if (isFinanceUser(viewer) && p.financeRequired && p.reachedFinance) return true;
  /* Legal reads a request from the moment it is submitted for approval -- the
     intake desk needs to see what is coming, and the assignee and the head
     read the same set afterwards. Before submission it is a private draft. */
  if (isLegalUser(viewer) && p.reachedApproval) return true;
  if (viewer.admin === true) return true;
  return false;
}

/* Documents on a request, for THIS reader. Removed ones are kept out of the
   working list; the history call asks for them explicitly. */
function list(requestId, viewer, opts) {
  const o = opts || {};
  const parts = participants(requestId, o.kind);
  if (!parts) return [];
  return read()
    .filter((d) => d.requestId === requestId)
    .filter((d) => (o.withRemoved ? true : !d.removedAt))
    .filter((d) => (o.withSuperseded ? true : !d.supersededById))
    .filter((d) => canAccess(viewer, d, parts))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

/* Every version of everything, removed rows included -- the audit view. */
const history = (requestId, viewer) =>
  list(requestId, viewer, { withRemoved: true, withSuperseded: true });

/* ----------------------------------------------------------- the bytes --- */

function blobPath(doc) { return path.join(BLOBS, doc.storageKey); }

/* "On file" has to mean the bytes come back. This is what the badge is allowed
   to be computed from -- never from the row existing. */
function resolves(doc) {
  try { return !!doc && fs.existsSync(blobPath(doc)) && fs.statSync(blobPath(doc)).size > 0; }
  catch (e) { return false; }
}

function open(id, viewer) {
  const doc = byId(id);
  if (!doc) return { error: "not found" };
  if (!canAccess(viewer, doc)) return { error: "not found" };   // existence hiding
  if (doc.removedAt) return { error: "not found" };
  if (!resolves(doc)) return { error: "unavailable", document: doc };
  return { document: doc, file: blobPath(doc), previewable: PREVIEWABLE.test(doc.mimeType) };
}

/* -------------------------------------------------------- reconciliation -- */

/* Which documents claim to exist and cannot be served. Run before believing
   any "On file" badge in the estate. */
function reconcile() {
  const rows = read().map((d) => ({
    documentId: d.id, requestId: d.requestId, filename: d.originalFilename,
    metadata: true, storage: resolves(d), size: d.size,
    uploadedBy: (d.uploadedBy && d.uploadedBy.name) || null, uploadedAt: d.uploadedAt,
    removed: !!d.removedAt,
  }));
  return {
    documents: rows.length,
    servable: rows.filter((r) => r.storage).length,
    broken: rows.filter((r) => !r.storage && !r.removed),
    rows,
  };
}

module.exports = {
  put, remove, list, history, byId, open, canAccess, participants, reconcile,
  resolves, blobPath, mimeFor, PREVIEWABLE, VISIBILITY, SOURCE_TYPE, MAX_BYTES,
  ROOT, BLOBS, reload, isLegalUser, isFinanceUser,
};
