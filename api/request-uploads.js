// A DOCUMENT A REQUESTER ATTACHES IS A REAL DOCUMENT.
//
// Attachments used to be metadata only -- name, size, mime -- with the storage
// seam left unimplemented. The business could "attach" a contract to a request
// and nobody in Legal could ever open it: the request arrived in triage naming
// a file that existed only on the requester's laptop.
//
// So the bytes are stored here, on this server, and the file is readable in the
// app by the people the request belongs to.
//
// WHY NOT DRIVE. The Drive estate is the system of record for documents Legal
// already holds, and LegalOS treats it as read-only -- the service account has
// drive.readonly and nothing in this app may write there. A requester's upload
// is not yet a filed document; it is evidence attached to an intake. It lives
// here until Legal decides what it is.
//
// WHO MAY READ ONE. The person who raised the request, and Legal. That is the
// same rule the request itself follows, so an attachment can never be more
// visible than the request that carries it -- including after triage hands the
// request to somebody else.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(__dirname, "..", "var", "request-uploads");
const MAX_BYTES = 25 * 1024 * 1024;        // one document, not a disk image
const MAX_PER_REQUEST = 20;

/* What a business user can usefully attach to a legal request. Deliberately a
   list of document formats: this is an intake attachment, not a file share. */
const ALLOWED = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

const safe = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "");

/* HOW A REQUEST'S DOCUMENTS ARE LAID OUT ON THIS SERVER.
 *
 *   var/request-uploads/<REQUEST-ID>/<ATT-ID>.<ext>     the file itself
 *   var/request-uploads/<REQUEST-ID>/<ATT-ID>.json      what it is
 *
 * A folder per request, so the documents belonging to one piece of work sit
 * together and can be found, counted and archived as a unit. The extension is
 * the real one, so a file lifted out of here opens in the application it
 * belongs to instead of being a nameless .bin.
 *
 * NOTHING GOES TO GOOGLE DRIVE. Drive is the system of record for documents
 * Legal already holds, and this service account holds read-only access to it by
 * design. An intake attachment is evidence on a request and is held here.
 *
 * Files written before this layout are flat `<ATT-ID>.bin` at the root; both
 * readers fall back to that, so nothing stored earlier becomes unreachable. */
const dirFor = (requestId) => path.join(DIR, safe(requestId) || "_unassigned");
const fileFor = (attId, requestId, ext) => path.join(dirFor(requestId),
  safe(attId) + "." + (ext || "bin"));
const legacyFileFor = (attId) => path.join(DIR, safe(attId) + ".bin");

/* Where a stored attachment actually is: the structured path when the request
   is known, then a search of the request folders, then the flat legacy name. */
function locate(attId, requestId) {
  const id = safe(attId);
  if (!id) return null;
  const tryDir = (d) => {
    try {
      for (const f of fs.readdirSync(d)) {
        if (f === id + ".json") continue;
        if (f.startsWith(id + ".")) return path.join(d, f);
      }
    } catch (e) { /* no such folder */ }
    return null;
  };
  if (requestId) { const hit = tryDir(dirFor(requestId)); if (hit) return hit; }
  try {
    for (const entry of fs.readdirSync(DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const hit = tryDir(path.join(DIR, entry.name));
      if (hit) return hit;
    }
  } catch (e) { /* no uploads yet */ }
  try { if (fs.statSync(legacyFileFor(id)).isFile()) return legacyFileFor(id); } catch (e) { /* none */ }
  return null;
}

/* Store one upload. `dataBase64` is the file itself; everything else is what
   the browser said about it, which is checked rather than trusted. */
function store(requestId, { name, mime, dataBase64 }, by) {
  if (!dataBase64) return { error: "no file content was sent" };
  const declared = String(mime || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED[declared]) {
    return { error: "that file type cannot be attached to a request", mime: declared };
  }
  let buf;
  try { buf = Buffer.from(String(dataBase64), "base64"); }
  catch (e) { return { error: "the file could not be read" }; }
  if (!buf.length) return { error: "the file is empty" };
  if (buf.length > MAX_BYTES) {
    return { error: "that file is larger than " + Math.round(MAX_BYTES / 1024 / 1024) + " MB" };
  }

  const attId = "ATT-" + crypto.randomBytes(9).toString("base64url");
  const ext = ALLOWED[declared];
  fs.mkdirSync(dirFor(requestId), { recursive: true });
  const dest = fileFor(attId, requestId, ext);
  /* The bytes land before anything claims the document exists. */
  const tmp = dest + ".part";
  try {
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, dest);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* nothing to clean */ }
    return { error: "the file could not be saved on the server" };
  }

  /* READ IT BACK BEFORE SAYING IT IS STORED.
     An attachment row with no file behind it is the whole defect this module
     exists to prevent, so the upload proves the bytes are retrievable and
     identical before it reports success. If it cannot, the caller is told the
     upload FAILED -- and no row is created for a document nobody could open. */
  let verified = null;
  try { verified = fs.readFileSync(dest); } catch (e) { verified = null; }
  const good = verified && verified.length === buf.length
    && crypto.createHash("sha256").update(verified).digest("hex")
      === crypto.createHash("sha256").update(buf).digest("hex");
  if (!good) {
    try { fs.unlinkSync(dest); } catch (e) { /* already gone */ }
    return { error: "the file did not store correctly — please attach it again" };
  }

  const meta = {
    id: attId,
    requestId: String(requestId),
    name: String(name || "attachment").slice(0, 200),
    mime: declared,
    ext,
    size: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    uploadedAt: new Date().toISOString(),
    uploadedBy: (by && by.email) || null,
    uploadedByName: (by && by.name) || null,
    storedBy: "legalos",
    sourceType: "LEGALOS_UPLOAD",
    storedAt: path.relative(path.join(__dirname, ".."), dest),
  };
  /* A sidecar beside the file, so the folder is readable on its own: somebody
     looking at the disk can tell what each document is and who sent it. */
  try { fs.writeFileSync(dest.replace(/\.[^.]+$/, "") + ".json", JSON.stringify(meta, null, 2), { mode: 0o600 }); }
  catch (e) { /* the file is what matters; the sidecar is a convenience */ }

  return {
    ok: true,
    attachment: {
      id: attId,
      requestId: String(requestId),
      name: String(name || "attachment").slice(0, 200),
      mime: declared,
      ext: ALLOWED[declared],
      size: buf.length,
      /* A checksum so a stored upload can be shown to be the file that was
         sent, and so the same document attached twice is recognisable. */
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      uploadedAt: new Date().toISOString(),
      uploadedBy: (by && by.email) || null,
      uploadedByName: (by && by.name) || null,
      storedBy: "legalos",          // never written to Drive
      sourceType: "LEGALOS_UPLOAD",
    },
  };
}

function read(attId, requestId) {
  const f = locate(attId, requestId);
  if (!f) return null;
  try { return fs.readFileSync(f); } catch (e) { return null; }
}

function exists(attId, requestId) { return !!locate(attId, requestId); }

function remove(attId, requestId) {
  const f = locate(attId, requestId);
  if (!f) return false;
  try {
    fs.unlinkSync(f);
    try { fs.unlinkSync(f.replace(/\.[^.]+$/, "") + ".json"); } catch (e) { /* none */ }
    return true;
  } catch (e) { return false; }
}

/* Disk actually used by intake uploads -- reported in Data Health so this can
   never grow unnoticed. */
function usage() {
  let files = 0, bytes = 0, requests = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { requests++; walk(full); continue; }
      if (/\.json$/.test(e.name)) continue;      // sidecars are not documents
      try { bytes += fs.statSync(full).size; files++; } catch (e2) { /* skip */ }
    }
  };
  try { walk(DIR); } catch (e) { /* no uploads yet */ }
  return { files, bytes, requests, dir: DIR, storedIn: "LegalOS", writesToDrive: false,
    maxBytesPerFile: MAX_BYTES, maxPerRequest: MAX_PER_REQUEST };
}

module.exports = { store, read, exists, remove, usage, ALLOWED, MAX_BYTES, MAX_PER_REQUEST };
