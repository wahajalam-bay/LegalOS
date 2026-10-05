// DRIVE IS THE STRUCTURAL SOURCE OF TRUTH.
//
// The root is truth. The folder is truth. The parent folder is truth. The path
// is truth. The file id is truth.
//
// LegalOS normalizes entity names, document types, years and lifecycle stages
// for the register it presents -- but normalization must never erase where the
// source actually lives. Every record and every document therefore carries the
// provenance below, unmodified, so any row on screen can be walked back to the
// exact folder and file it came from.
//
// Nothing here writes to Drive. There is no code path in this module that can.
const drive = require("./drive.js");

let CACHE = null;

/* Folder id by full path. The file index records a file's folderPath but not
   the id of that folder, so the two indexes are joined on the path Drive
   itself reports. */
function folderIndex() {
  const folders = drive.indexFolders() || [];
  if (CACHE && CACHE.n === folders.length) return CACHE;
  const byPath = new Map();
  for (const f of folders) byPath.set(String(f.path), f);
  /* The crawl roots are not themselves in the folder index -- a root is where
     the crawl STARTS, so nothing lists it as a child. Their ids come from the
     crawl summary, and without them every record would report a null
     sourceRootId. */
  const rootId = new Map();
  try {
    for (const r of ((drive.status() || {}).roots || [])) if (r && r.id) rootId.set(String(r.name), r.id);
  } catch (e) { /* a missing summary costs the root id, never the rest */ }
  CACHE = { n: folders.length, byPath, rootId };
  return CACHE;
}

const parentPathOf = (p) => {
  const seg = String(p || "").split(" / ");
  return seg.length > 1 ? seg.slice(0, -1).join(" / ") : null;
};

/* The provenance of one Drive file, exactly as Drive states it. Any field the
   source does not give is null -- never guessed, never back-filled from a
   similar path. */
function forFile(file) {
  if (!file) return null;
  const { byPath, rootId } = folderIndex();
  const folderPath = String(file.folderPath || "");
  const folder = byPath.get(folderPath) || null;
  const parentPath = parentPathOf(folderPath);
  const parent = parentPath ? byPath.get(parentPath) || null : null;
  const rootName = file.root || String(folderPath).split(" / ")[0] || null;
  return {
    driveFileId: file.id || null,
    exactSourceFilename: file.name || null,
    fullDrivePath: file.path || (folderPath ? folderPath + " / " + (file.name || "") : null),
    sourceRootName: rootName,
    sourceRootId: rootId.get(rootName) || null,
    sourceFolderName: folder ? folder.name : (folderPath.split(" / ").pop() || null),
    /* A file sitting directly in a crawl root has no folder entry, because the
       root is not listed as anyone's child. Its containing folder IS the root. */
    sourceFolderId: folder ? folder.id : (rootId.get(folderPath) || null),
    parentFolderName: parent ? parent.name : (parentPath ? parentPath.split(" / ").pop() : null),
    parentFolderId: parent ? parent.id : null,
    webViewLink: file.webViewLink || null,
  };
}

/* The provenance of a FOLDER that a LegalOS record was built from -- an entity
   folder, a CY folder, a statutory register folder. */
function forFolderPath(path) {
  if (!path) return null;
  const { byPath, rootId } = folderIndex();
  const folder = byPath.get(String(path)) || null;
  const parentPath = parentPathOf(path);
  const parent = parentPath ? byPath.get(parentPath) || null : null;
  const rootName = String(path).split(" / ")[0] || null;
  return {
    fullDrivePath: String(path),
    sourceRootName: rootName,
    sourceRootId: rootId.get(rootName) || null,
    sourceFolderName: folder ? folder.name : String(path).split(" / ").pop(),
    sourceFolderId: folder ? folder.id : null,
    parentFolderName: parent ? parent.name : (parentPath ? parentPath.split(" / ").pop() : null),
    parentFolderId: parent ? parent.id : null,
    webViewLink: folder ? folder.webViewLink : null,
    /* Set when the folder path is not present in the crawled index -- the
       record names a location Drive does not report, which is a reconciliation
       failure, not something to paper over. */
    resolved: !!folder,
  };
}

module.exports = { forFile, forFolderPath };
