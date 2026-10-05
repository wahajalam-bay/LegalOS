#!/usr/bin/env node
/* THE WHOLE ROOT, TO EVERY LEAF, WITH NOTHING CAPPED.
 *
 * api/drive.js crawls with `maxDepth = 12` and the registers are built from that
 * cache. Twelve is almost certainly enough for this tree — but "almost certainly"
 * is not an inventory. A depth cap does not announce itself: the folders past it
 * simply never appear, and every count downstream is quietly short.
 *
 * So this walks the root itself with no depth limit, no page limit and no slice,
 * and then compares what it found against the cached index. If the cache is
 * complete the comparison says so in numbers; if it is not, the difference is
 * the thing worth knowing.
 *
 * It records, for every folder and every file:
 *   id · parentId · full path · name · mimeType · created · modified · size
 *   shortcut target where applicable · depth
 *
 * Drive is read-only here. Nothing is renamed, moved, deleted or written.
 *
 *   node tools/zm-root-inventory.js
 */
const fs = require("fs"), P = require("path");
const { driveJson } = require("../api/google.js");
const drive = require("../api/drive.js");

const ROOT_NAME = "Commercial_Zameen Media Contracts";
const OUT = P.join(__dirname, "..", "audit", "zm-contracts-root-inventory.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Every field we need to describe a node, including the shortcut target — a
   shortcut is a real entry in the tree that points elsewhere, and treating it as
   an ordinary file would both double-count the target and hide the pointer. */
const FIELDS = [
  "id", "name", "mimeType", "size", "modifiedTime", "createdTime",
  "webViewLink", "parents", "md5Checksum", "trashed",
  "shortcutDetails(targetId,targetMimeType)",
].join(",");

async function listChildren(folderId) {
  const out = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
    const url = "/files?q=" + q
      + "&fields=" + encodeURIComponent("nextPageToken,files(" + FIELDS + ")")
      + "&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true"
      + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    let j = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try { j = await driveJson(url); break; }
      catch (e) {
        if (attempt === 4) throw e;
        await sleep(800 * Math.pow(2, attempt));
      }
    }
    for (const f of (j.files || [])) out.push(f);
    pageToken = j.nextPageToken || "";
  } while (pageToken);          // every page, always — no first-N
  return out;
}

const isFolder = (f) => f.mimeType === "application/vnd.google-apps.folder";

(async () => {
  await drive.ensureIndex();

  /* THE ROOT'S REAL ID, ESTABLISHED FROM DRIVE, NOT GUESSED FROM A NAME.
     The first version looked the root up by name, found nothing (the index holds
     no folder literally called "Commercial_Zameen Media Contracts" — that is the
     display name of a configured root), and fell through to a startsWith match,
     which returned the FIRST folder whose path begins with the root: "Zameen
     Media PPA's". The walk then covered one of the two subfolders and reported
     the other 413 files as "in the cache but not found", which read like data
     loss and was entirely an error in this tool.
     So the root is now derived from its children: both subfolders name the same
     parent, and that parent is the root. */
  const KNOWN_CHILDREN = ["Zameen Media PPA's", "Zameen - Pakistan Contract Templates"];
  const childIds = KNOWN_CHILDREN
    .map((n) => (drive.indexFolders().find((f) => f.name === n) || {}).id)
    .filter(Boolean);
  if (!childIds.length) { console.error("neither subfolder is in the index"); process.exit(2); }
  const parents = new Set();
  for (const id of childIds) {
    const j = await driveJson("/files/" + id + "?fields=id,name,parents&supportsAllDrives=true");
    for (const p of (j.parents || [])) parents.add(p);
  }
  if (parents.size !== 1) {
    console.error("expected one common parent for the two subfolders, found " + parents.size);
    process.exit(2);
  }
  const rootId = [...parents][0];
  const rootMeta = await driveJson("/files/" + rootId + "?fields=id,name,createdTime,modifiedTime&supportsAllDrives=true");
  const rootFolder = { id: rootId, createdTime: rootMeta.createdTime, modifiedTime: rootMeta.modifiedTime, realName: rootMeta.name };

  const folders = [];
  const files = [];
  const shortcuts = [];
  const failures = [];
  let maxDepthSeen = 0;

  /* Breadth-first, unbounded. `seen` guards against a cycle via shortcuts, which
     would otherwise walk forever. */
  const seen = new Set([rootFolder.id]);
  let frontier = [{ id: rootFolder.id, path: [ROOT_NAME], depth: 0, parentId: null }];
  folders.push({
    id: rootFolder.id, parentId: null, name: ROOT_NAME, path: ROOT_NAME, depth: 0,
    mimeType: "application/vnd.google-apps.folder",
    createdTime: rootFolder.createdTime || "", modifiedTime: rootFolder.modifiedTime || "",
  });

  while (frontier.length) {
    const next = [];
    for (let i = 0; i < frontier.length; i += 8) {
      const batch = frontier.slice(i, i + 8);
      const settled = await Promise.all(batch.map(async (node) => {
        try { return { node, kids: await listChildren(node.id) }; }
        catch (e) { failures.push({ path: node.path.join(" / "), error: String(e.message || e).slice(0, 160) }); return { node, kids: [] }; }
      }));
      for (const { node, kids } of settled) {
        for (const k of kids) {
          const path = node.path.concat(k.name);
          const depth = node.depth + 1;
          maxDepthSeen = Math.max(maxDepthSeen, depth);
          const base = {
            id: k.id, parentId: node.id, name: k.name, path: path.join(" / "), depth,
            mimeType: k.mimeType || "",
            createdTime: k.createdTime || "", modifiedTime: k.modifiedTime || "",
            size: Number(k.size) || 0,
            md5Checksum: k.md5Checksum || null,
            webViewLink: k.webViewLink || "",
          };
          if (k.shortcutDetails) {
            base.shortcutTarget = k.shortcutDetails.targetId || null;
            base.shortcutTargetMime = k.shortcutDetails.targetMimeType || null;
            shortcuts.push(base);
          }
          if (isFolder(k)) {
            folders.push(base);
            if (!seen.has(k.id)) { seen.add(k.id); next.push({ id: k.id, path, depth, parentId: node.id }); }
          } else {
            files.push(base);
          }
        }
      }
    }
    frontier = next;
  }

  /* Does the app's cached index see everything this walk saw? A silent shortfall
     here is exactly what the depth cap would produce. */
  const cachedFiles = drive.indexFiles().filter((f) => String(f.folderPath || "").startsWith(ROOT_NAME));
  const cachedIds = new Set(cachedFiles.map((f) => f.id));
  const missingFromCache = files.filter((f) => !cachedIds.has(f.id));
  const walkedIds = new Set(files.map((f) => f.id));
  const extraInCache = cachedFiles.filter((f) => !walkedIds.has(f.id));

  const firstLevel = folders.filter((f) => f.depth === 1);
  const byChild = {};
  for (const f of files) {
    const seg = f.path.split(" / ")[1] || "(directly in root)";
    byChild[seg] = (byChild[seg] || 0) + 1;
  }

  const summary = {
    root: ROOT_NAME,
    rootId: rootFolder.id,
    folders: folders.length,
    files: files.length,
    shortcuts: shortcuts.length,
    maxDepthSeen,
    depthCapInAppCrawl: 12,
    deeperThanAppCap: folders.filter((f) => f.depth > 12).length + files.filter((f) => f.depth > 12).length,
    listFailures: failures.length,
    firstLevelChildren: firstLevel.map((f) => f.name).sort(),
    filesByFirstLevelChild: byChild,
    cachedIndexFiles: cachedFiles.length,
    missingFromCachedIndex: missingFromCache.length,
    inCacheButNotWalked: extraInCache.length,
  };

  fs.writeFileSync(OUT, JSON.stringify({ summary, folders, files, shortcuts, failures }, null, 1));
  summary.rootFolderRealName = rootFolder.realName;
  console.log(JSON.stringify(summary, null, 1));
  if (missingFromCache.length) {
    console.log("\nFILES THE APP'S INDEX DOES NOT HAVE:");
    for (const f of missingFromCache.slice(0, 40)) console.log("  d" + f.depth + "  " + f.path);
  }
  if (extraInCache.length) {
    console.log("\nIN THE INDEX BUT NOT FOUND BY THIS WALK (likely trashed since):");
    for (const f of extraInCache.slice(0, 20)) console.log("  " + (f.folderPath || "") + " / " + f.name);
  }
})();
