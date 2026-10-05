// The knowledge base — a read-only mirror of one Google Drive folder tree.
//
// Read-only is a deliberate constraint, not a limitation we grew into: the
// service account holds drive.readonly, so no bug in this app can alter or
// delete a legal document. Drive stays the system of record; LegalOS indexes it.
//
// Two things are cached: the folder TREE (ids, names, paths, sizes, times) and
// nothing else. File BYTES are streamed through on demand and never written to
// disk, so a document is only ever as available as the caller's own permission.
//
// Search uses Drive's own full-text index, which already covers the text inside
// PDFs and Docs. That is why there is no PDF parser here — Google has read the
// documents already, and asking it is both better and cheaper than re-doing it.
const fs = require("fs");
const path = require("path");
const { load, ROOT } = require("./config");
const { driveJson, driveRaw } = require("./google");

const CACHE_FILE = path.join(ROOT, "config", ".drive-index.json");
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,createdTime,webViewLink,iconLink,parents,md5Checksum";

let index = { builtAt: 0, roots: [], files: [], folders: [], error: "", building: false };

function isFolder(f) { return f.mimeType === "application/vnd.google-apps.folder"; }

// Drive throttles. A 429 mid-crawl used to surface as "this folder is empty",
// which quietly shrank the whole index — and an index that shrinks takes real
// documents off real records. Retry with backoff before giving up, and when we
// do give up, throw so the caller records a FAILURE rather than an empty folder.
async function withRetry(fn, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      const transient = /\b(429|500|502|503|504)\b/.test(msg) || /rate limit|quota|timeout|ECONNRESET|socket hang up/i.test(msg);
      if (!transient || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i) + Math.floor(Math.random() * 250)));
    }
  }
  throw lastErr;
}

async function listChildren(folderId) {
  const out = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
    const qs =
      "/files?q=" + q +
      "&fields=" + encodeURIComponent("nextPageToken,files(" + FILE_FIELDS + ")") +
      "&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const page = await withRetry(() => driveJson(qs));
    out.push(...(page.files || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return out;
}

// Every folder shared with the service account. Sharing IS the grant, so this
// is what makes "share a folder with LegalOS" the entire act of adding it.
async function discoverRoots() {
  const q = encodeURIComponent("sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const qs = "/files?q=" + q + "&fields=" + encodeURIComponent("files(id,name)") +
    "&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true";
  const res = await driveJson(qs);
  return (res.files || []).map((f) => ({ id: f.id, name: f.name.trim() }));
}

// Resolve the roots to crawl: pinned ids win, otherwise discover.
async function resolveRoots() {
  const cfg = load();
  const pinned = (cfg.drive.knowledgeFolderIds || []).concat(cfg.drive.knowledgeFolderId ? [cfg.drive.knowledgeFolderId] : []);
  if (pinned.length) {
    const out = [];
    for (const id of pinned) {
      try {
        const meta = await driveJson("/files/" + encodeURIComponent(id) + "?fields=id,name&supportsAllDrives=true");
        out.push({ id: meta.id, name: (meta.name || id).trim() });
      } catch (e) {
        out.push({ id, name: id, error: e.message });
      }
    }
    return out;
  }
  if (cfg.drive.autoDiscover) return discoverRoots();
  return [];
}

// Walk one tree breadth-first. Depth is capped so a folder loop (possible with
// shortcuts) can never spin forever.
/* HOW FAR DOWN THE CRAWL GOES: ALL THE WAY.
 *
 * This used to stop at twelve levels and return a `truncated` flag that only
 * blocked promotion if the crawl ALSO came back smaller than the index it was
 * replacing. So a tree that grew past the cap — or any first build — published a
 * partial index and said nothing. Measured on the Zameen Media contracts root,
 * the deepest folder sits at exactly level 12: the estate was one nested folder
 * away from losing files with no error anywhere.
 *
 * Depth is now unbounded. The dangers a depth cap was standing in for are real,
 * so they are guarded directly instead:
 *
 *   cycles        — `seen` already refuses a folder id twice, and a Drive
 *                   shortcut loop cannot outlive that.
 *   runaway size  — MAX_OBJECTS is an explicit ceiling on objects discovered.
 *                   Hitting it is an ERROR, not a quiet stop.
 *
 * Either guard firing marks the crawl incomplete, and an incomplete crawl never
 * replaces a good index. A stale complete index beats a fresh partial one.
 */
const MAX_OBJECTS = 500000;      // explicit, and loud when reached
const MAX_DEPTH_SANITY = 200;    // a folder tree deeper than this is pathological

async function crawl(rootId, rootName, maxDepth = MAX_DEPTH_SANITY) {
  const files = [];
  const folders = [];
  const failures = [];
  const seen = new Set();
  // Paths are prefixed with the root's name so a document's origin is legible
  // once several folders are merged into one library.
  let frontier = [{ id: rootId, pathParts: [rootName] }];
  let depth = 0;

  while (frontier.length && depth < maxDepth && (files.length + folders.length) < MAX_OBJECTS) {
    const next = [];
    // Fetch each level with bounded concurrency. Walking one folder at a time
    // meant one network round trip per folder in series — on a tree this size
    // that is minutes, and the first person to open the page would wait for all
    // of it. 8 at a time is well inside Drive's rate limit and turns the crawl
    // from serial latency into roughly one round trip per level.
    const pending = frontier.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    const batches = [];
    for (let i = 0; i < pending.length; i += 8) batches.push(pending.slice(i, i + 8));

    for (const batch of batches) {
      const settled = await Promise.all(batch.map((n) =>
        // One unreadable subfolder must not abandon the whole crawl — but it
        // must not vanish either. A swallowed failure here looks exactly like
        // "that folder is empty", which silently removes real documents from
        // the app. Record it so the crawl reports what it could not read.
        listChildren(n.id).then(
          (children) => ({ node: n, children }),
          (err) => { failures.push({ folderId: n.id, path: n.pathParts.join(" / "), error: String(err && err.message || err) }); return { node: n, children: [] }; })
      ));
      for (const { node, children } of settled) {
        for (const c of children) {
          const rel = node.pathParts.concat(c.name);
          const entry = {
            id: c.id,
            name: c.name,
            mimeType: c.mimeType,
            size: c.size ? Number(c.size) : 0,
            modifiedTime: c.modifiedTime || "",
            createdTime: c.createdTime || "",
            webViewLink: c.webViewLink || "",
            root: rootName,
            folderPath: node.pathParts.join(" / "),
            path: rel.join(" / "),
          };
          if (isFolder(c)) {
            folders.push(entry);
            next.push({ id: c.id, pathParts: rel });
          } else {
            files.push(entry);
          }
        }
      }
    }
    frontier = next;
    depth++;
  }
  /* Incomplete for ANY reason, named so the operator learns which. Reaching the
     sanity depth or the object ceiling is a defect to investigate, not a
     resting state to publish from. */
  const hitDepth = frontier.length > 0 && depth >= maxDepth;
  const hitCount = (files.length + folders.length) >= MAX_OBJECTS;
  const truncated = hitDepth || hitCount;
  return {
    files, folders, failures, truncated,
    maxDepthReached: depth,
    incompleteReason: hitDepth ? "CRAWL_INCOMPLETE: depth sanity guard of " + maxDepth + " levels reached with " + frontier.length + " folder(s) still unvisited"
      : hitCount ? "CRAWL_INCOMPLETE: object ceiling of " + MAX_OBJECTS + " reached"
        : null,
  };
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (raw && Array.isArray(raw.files)) index = Object.assign(index, raw, { building: false });
  } catch (e) { /* no cache yet — first run */ }
}

function saveCache() {
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ builtAt: index.builtAt, roots: index.roots, files: index.files, folders: index.folders }),
      { mode: 0o640 }
    );
  } catch (e) { console.error("[drive] could not write index cache:", e.message); }
}

async function rebuild(force = false) {
  const cfg = load();
  if (index.building) return index;

  const ageMs = Date.now() - index.builtAt;
  const ttl = (cfg.drive.refreshMinutes || 15) * 60 * 1000;
  if (!force && index.files.length && ageMs < ttl) return index;

  index.building = true;
  try {
    const roots = await resolveRoots();
    if (!roots.length) {
      index = { builtAt: Date.now(), roots: [], files: [], folders: [], building: false,
        error: "No folders are shared with the LegalOS service account yet." };
      return index;
    }
    const files = [];
    const folders = [];
    const rootSummaries = [];
    const crawlFailures = [];
    for (const r of roots) {
      try {
        const got = await crawl(r.id, r.name);
        files.push(...got.files);
        folders.push(...got.folders);
        if (got.failures && got.failures.length) crawlFailures.push(...got.failures);
        rootSummaries.push({ id: r.id, name: r.name, fileCount: got.files.length, folderCount: got.folders.length,
          unreadableFolders: (got.failures || []).length, truncated: !!got.truncated,
          maxDepthReached: got.maxDepthReached || 0, incompleteReason: got.incompleteReason || null });
      } catch (e) {
        // One unreadable root must not lose the other three.
        rootSummaries.push({ id: r.id, name: r.name, fileCount: 0, folderCount: 0, error: e.message });
      }
    }
    // A DEGRADED CRAWL MUST NOT OVERWRITE A GOOD INDEX.
    // If this pass hit unreadable folders (throttling, a permissions blip) and
    // came back with fewer files than we already had, the previous index is the
    // better picture of Drive. Keep it, and report the failure — shrinking the
    // index is how documents silently disappear from records.
    const degraded = crawlFailures.length > 0 || rootSummaries.some((r) => r.error || r.truncated);
    /* An INCOMPLETE crawl never publishes, whatever the file count says. The old
       rule also required the crawl to have shrunk, so a truncated first build,
       or a truncated build of a growing tree, went straight into the index. */
    const incomplete = rootSummaries.filter((r) => r.truncated);
    if (incomplete.length) {
      const why = incomplete.map((r) => r.name + ": " + (r.incompleteReason || "truncated")).join(" | ");
      index = Object.assign({}, index, {
        building: false, degradedAt: Date.now(),
        crawlIncomplete: true,
        error: "CRAWL_INCOMPLETE — " + why + ". The previous index is being kept.",
        failures: crawlFailures,
      });
      console.error("[drive] " + index.error);
      return index;
    }
    if (degraded && index.files.length && files.length < index.files.length) {
      index = Object.assign({}, index, {
        building: false,
        degradedAt: Date.now(),
        error: "Last refresh was incomplete (" + crawlFailures.length + " folder(s) unreadable; " +
               files.length + " files seen vs " + index.files.length + " held) — keeping the previous index.",
        failures: crawlFailures,
      });
      console.error("[drive] " + index.error);
      return index;
    }
    index = { builtAt: Date.now(), roots: rootSummaries, files, folders, crawlIncomplete: false,
      maxDepthReached: Math.max(0, ...rootSummaries.map((r) => r.maxDepthReached || 0)),
      error: crawlFailures.length ? crawlFailures.length + " folder(s) could not be listed" : "",
      building: false, failures: crawlFailures };
    if (crawlFailures.length) console.error("[drive] " + crawlFailures.length + " folder(s) could not be listed");
    saveCache();
  } catch (e) {
    index.building = false;
    index.error = e.message + (e.hint ? " \u2014 " + e.hint : "");
    console.error("[drive] crawl failed:", index.error);
  }
  return index;
}

// Ask Drive's own index for documents whose CONTENT matches, then keep only
// those inside our folder tree. This is what makes a search hit text buried in
// a PDF rather than only matching filenames.
async function contentSearch(term, known) {
  const safe = String(term).replace(/['\\]/g, " ").trim();
  if (!safe) return [];
  const q = encodeURIComponent("fullText contains '" + safe + "' and trashed=false");
  const qs =
    "/files?q=" + q +
    "&fields=" + encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink,size)") +
    "&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true";
  try {
    const res = await driveJson(qs);
    return (res.files || []).filter((f) => known.has(f.id));
  } catch (e) { return []; }
}

async function search(term, { limit = 60 } = {}) {
  const idx = await ensureIndex();
  const t = String(term || "").trim().toLowerCase();
  if (!t) return { results: idx.files.slice(0, limit), term: "", contentHits: 0, indexedAt: idx.builtAt };

  const byName = idx.files.filter(
    (f) => f.name.toLowerCase().includes(t) || f.path.toLowerCase().includes(t)
  );
  const nameIds = new Set(byName.map((f) => f.id));
  const known = new Map(idx.files.map((f) => [f.id, f]));
  const hits = await contentSearch(term, new Set(known.keys()));

  // Name matches first — they are what a person usually means — then documents
  // that merely mention the term inside.
  const merged = byName.map((f) => Object.assign({}, f, { match: "name" }));
  for (const h of hits) {
    if (nameIds.has(h.id)) continue;
    const f = known.get(h.id);
    if (f) merged.push(Object.assign({}, f, { match: "content" }));
  }
  return {
    results: merged.slice(0, limit),
    term,
    contentHits: merged.filter((m) => m.match === "content").length,
    indexedAt: idx.builtAt,
  };
}

// Which of the GIVEN documents contain the phrase. Drive has already read the
// text inside every PDF and Doc, so this answers for scans the browser itself
// cannot search. Ids outside the crawled tree are ignored.
async function matchesIn(term, ids) {
  const idx = await ensureIndex();
  const inTree = new Set(idx.files.map((f) => f.id));
  const known = new Set((ids || []).filter((id) => inTree.has(id)));
  if (!known.size || !String(term || "").trim()) return [];
  const hits = await contentSearch(term, known);
  return hits.map((h) => h.id);
}

// Serve what we have, refresh behind the caller.
//
// A full crawl of this library takes far longer than anyone should wait for a
// page, so no request is ever allowed to block on one. If the index is warm it
// is returned instantly and a refresh is kicked off in the background when
// stale; only a genuinely cold start (no cache on disk, nothing in memory) has
// to wait, because there is nothing else to show.
async function ensureIndex() {
  const cfg = load();
  const ttl = (cfg.drive.refreshMinutes || 15) * 60 * 1000;
  const stale = Date.now() - index.builtAt > ttl;

  if (!index.files.length && !index.builtAt) return rebuild(true);
  if (stale && !index.building) {
    rebuild(true).catch((e) => console.error("[drive] background refresh failed:", e.message));
  }
  return index;
}

async function tree() {
  const idx = await ensureIndex();

  // Group by top-level folder first — that is how the department actually
  // thinks about this material (commercial / compliance / litigation /
  // projects), and it keeps 40-odd subfolders from arriving as a flat wall.
  const byRoot = new Map();
  for (const f of idx.files) {
    const r = f.root || "Knowledge base";
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(f);
  }

  const roots = [...byRoot.entries()].map(([name, files]) => {
    const subs = new Map();
    for (const f of files) {
      // Path is "Root / Sub / Deeper"; the section under the root is what the
      // card list shows. Files sitting directly in the root group under "".
      const rest = (f.folderPath || "").split(" / ").slice(1).join(" / ");
      const key = rest || "(top level)";
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key).push(f);
    }
    return {
      name,
      fileCount: files.length,
      bytes: files.reduce((n, f) => n + (f.size || 0), 0),
      lastModified: files.map((f) => f.modifiedTime).sort().pop() || "",
      folders: [...subs.entries()]
        .map(([sub, fs]) => ({
          name: sub,
          fileCount: fs.length,
          bytes: fs.reduce((n, f) => n + (f.size || 0), 0),
          lastModified: fs.map((f) => f.modifiedTime).sort().pop() || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    configured: true,
    indexedAt: idx.builtAt,
    error: idx.error,
    fileCount: idx.files.length,
    folderCount: idx.folders.length,
    totalBytes: idx.files.reduce((n, f) => n + (f.size || 0), 0),
    rootCount: roots.length,
    roots,
    // Flat list kept for callers that just want every folder.
    folders: roots.flatMap((r) => r.folders.map((f) => ({ name: r.name + (f.name === "(top level)" ? "" : " / " + f.name), fileCount: f.fileCount, bytes: f.bytes, lastModified: f.lastModified }))),
  };
}

// Files sitting directly in one folder path, straight from the warm index.
// This is what the UI opens a section with — no Drive round trip, so expanding
// a folder is instant rather than a search call per click.
function filesIn(folderPath, { root = "", limit = 500 } = {}) {
  const want = String(folderPath || "");
  return index.files
    .filter((f) => (root ? f.root === root : true) && (f.folderPath || "") === want)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

// The raw indexed file list, for callers that need to select across it —
// the register ingest picks its spreadsheets out of this rather than re-listing
// Drive.
function indexFiles() {
  return index.files;
}

// The crawled FOLDERS, for reconciliation. Files alone cannot tell you about an
// empty folder, and an empty folder is exactly the thing an audit has to be able
// to see and account for.
function indexFolders() {
  return index.folders || [];
}

/* ONE LOOKUP, NOT A SCAN OF SIX THOUSAND.
   This was `index.files.find(...)` — a linear walk of the whole crawl on every
   call, and it is called TWICE for every document request (once to authorize
   it, once to stream it). On a 6,846-file index that is ~14,000 string
   compares per document opened, and the authorization suite, which asks every
   persona for every file, spent its time here rather than on anything it was
   testing.

   The map is derived from `index` and rebuilt whenever the index identity
   changes, so it cannot go stale against a refresh or a cache load: the
   comparison is on the array reference, which every assignment in this file
   replaces wholesale. */
let byIdMap = null;
let byIdFor = null;
function fileById(id) {
  if (!id) return null;
  if (byIdFor !== index.files) {
    byIdMap = new Map();
    for (const f of index.files) if (f && f.id) byIdMap.set(f.id, f);
    byIdFor = index.files;
  }
  return byIdMap.get(id) || null;
}

// Stream one document's bytes through to the caller. Only ids that appear in
// the crawled tree are allowed, so this can never be used as a general-purpose
// read-anything-in-Drive proxy.
async function streamFile(id, res) {
  // A cold process (restarted, no cache on disk) has an empty index, so a
  // direct link to a document would 404 until something else warmed it. Build
  // it on demand rather than making the first click fail.
  if (!index.files.length) await ensureIndex();
  const meta = fileById(id);
  if (!meta) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not in the knowledge base"); }

  const isGoogleDoc = meta.mimeType.startsWith("application/vnd.google-apps");
  const url = isGoogleDoc
    ? "/files/" + encodeURIComponent(id) + "/export?mimeType=application%2Fpdf&supportsAllDrives=true"
    : "/files/" + encodeURIComponent(id) + "?alt=media&supportsAllDrives=true";

  const upstream = await driveRaw(url);
  if (!upstream.ok) {
    res.writeHead(upstream.status, { "Content-Type": "text/plain" });
    return res.end("Drive returned " + upstream.status);
  }
  res.writeHead(200, {
    "Content-Type": isGoogleDoc ? "application/pdf" : meta.mimeType,
    "Content-Disposition": 'inline; filename="' + meta.name.replace(/"/g, "") + '"',
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
}

function status() {
  const c = load().drive;
  return {
    configured: !!(c.autoDiscover || c.knowledgeFolderId || (c.knowledgeFolderIds || []).length),
    roots: index.roots,
    indexedAt: index.builtAt,
    fileCount: index.files.length,
    folderCount: index.folders.length,
    error: index.error,
    unreadableFolders: (index.failures || []).length,
    degraded: !!index.degradedAt,
    failures: (index.failures || []).slice(0, 25),
  };
}

loadCache();

// Warm the index shortly after boot, then keep it warm on a timer. unref() so
// this never holds the process open on its own.
if (process.env.LEGALOS_NO_WARM !== "1") {
  const warm = setTimeout(() => {
    rebuild(false).catch((e) => console.error("[drive] initial warm failed:", e.message));
  }, 3000);
  if (warm.unref) warm.unref();

  const cfg = load();
  const every = Math.max((cfg.drive.refreshMinutes || 15), 5) * 60 * 1000;
  const tick = setInterval(() => {
    rebuild(true).catch((e) => console.error("[drive] scheduled refresh failed:", e.message));
  }, every);
  if (tick.unref) tick.unref();
}

module.exports = { rebuild, ensureIndex, search, tree, streamFile, status, fileById, filesIn, indexFiles, indexFolders, matchesIn };
