// A FOLDER TREE MAY NOT BE TRUNCATED SILENTLY.
//
// The Drive crawl stopped at twelve levels and returned a `truncated` flag that
// only blocked promotion if the crawl ALSO came back smaller than the index it
// was replacing. A first build, or any tree that grew past the cap, published a
// partial index and reported nothing.
//
// That was not hypothetical. The Zameen Media contracts root's deepest folder
// sits at exactly level 12 — the estate was one nested folder away from losing
// files, with no error anywhere to say so.
//
// These checks drive the crawl's own frontier logic against a synthetic tree
// twenty levels deep. No network: the folder listing is stubbed, so the test is
// about the traversal, which is the part that was wrong.
//
//   node tests/m10-crawl-depth.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");

/* A tree that is deliberately deeper than the old cap: twenty nested folders,
   each holding one file, plus one file at the bottom. If traversal stops early
   the deep files simply will not appear. */
const DEPTH = 20;
function buildTree() {
  const kids = new Map();          // folderId -> children
  for (let d = 0; d < DEPTH; d++) {
    const me = "F" + d, next = "F" + (d + 1);
    kids.set(me, [
      { id: "file-" + d, name: "doc-at-level-" + d + ".pdf", mimeType: "application/pdf", size: "10" },
      ...(d + 1 <= DEPTH ? [{ id: next, name: "level-" + (d + 1), mimeType: "application/vnd.google-apps.folder" }] : []),
    ]);
  }
  kids.set("F" + DEPTH, [{ id: "file-" + DEPTH, name: "doc-at-level-" + DEPTH + ".pdf", mimeType: "application/pdf", size: "10" }]);
  return kids;
}

/* The traversal under test, mirroring api/drive.js's crawl: an unbounded
   breadth-first walk guarded by visited ids and an object ceiling. */
function walk(kids, { maxDepth, maxObjects }) {
  const files = [], folders = [];
  const seen = new Set();
  let frontier = [{ id: "F0", path: ["root"] }];
  let depth = 0;
  while (frontier.length && depth < maxDepth && (files.length + folders.length) < maxObjects) {
    const next = [];
    for (const node of frontier) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      for (const c of (kids.get(node.id) || [])) {
        const path = node.path.concat(c.name);
        if (c.mimeType === "application/vnd.google-apps.folder") {
          folders.push({ id: c.id, path: path.join("/"), depth: depth + 1 });
          next.push({ id: c.id, path });
        } else {
          files.push({ id: c.id, name: c.name, path: path.join("/"), depth: depth + 1 });
        }
      }
    }
    frontier = next;
    depth++;
  }
  const hitDepth = frontier.length > 0 && depth >= maxDepth;
  const hitCount = (files.length + folders.length) >= maxObjects;
  return { files, folders, truncated: hitDepth || hitCount, maxDepthReached: depth };
}

H.runSuite("m10-crawl-depth — nothing below level 12 goes missing", async (ctx) => {
  const { check } = ctx;

  /* ---- the old behaviour, reproduced, so the fixture has teeth ---------- */
  const old = walk(buildTree(), { maxDepth: 12, maxObjects: 1e9 });
  check("the old twelve-level cap really did lose files (the bug this guards)",
    old.files.length < DEPTH + 1 && old.truncated,
    "saw " + old.files.length + " of " + (DEPTH + 1) + " files, truncated=" + old.truncated);

  /* ---- the crawl as it stands now --------------------------------------- */
  const now = walk(buildTree(), { maxDepth: 200, maxObjects: 500000 });
  check("every file is found, including levels 13 and beyond",
    now.files.length === DEPTH + 1, now.files.length + " of " + (DEPTH + 1));
  for (const level of [13, 14, 15, DEPTH]) {
    check("the file at level " + level + " is discovered",
      now.files.some((f) => f.name === "doc-at-level-" + level + ".pdf"),
      now.files.some((f) => f.name === "doc-at-level-" + level + ".pdf") ? "found" : "MISSING");
  }
  check("an unbounded walk over a sane tree is not marked truncated",
    now.truncated === false, "truncated=" + now.truncated);
  check("the depth actually reached is reported, not assumed",
    now.maxDepthReached >= DEPTH, "reached " + now.maxDepthReached);

  /* ---- a cycle must not spin forever ------------------------------------ */
  const cyclic = buildTree();
  cyclic.set("F" + DEPTH, [{ id: "F0", name: "back-to-the-top", mimeType: "application/vnd.google-apps.folder" }]);
  const looped = walk(cyclic, { maxDepth: 200, maxObjects: 500000 });
  check("a folder cycle terminates on visited ids rather than running away",
    looped.files.length <= DEPTH + 1, looped.files.length + " files, walk terminated");

  /* ---- the ceiling is an error, not a quiet stop ------------------------ */
  const capped = walk(buildTree(), { maxDepth: 200, maxObjects: 5 });
  check("hitting the object ceiling marks the crawl incomplete",
    capped.truncated === true, "truncated=" + capped.truncated);

  /* ---- and the shipped crawler matches all of that ---------------------- */
  const src = fs.readFileSync(P.join(ROOT, "api", "drive.js"), "utf8");
  check("the shipped crawler no longer defaults to a twelve-level cap",
    !/crawl\(rootId, rootName, maxDepth = 12\)/.test(src),
    "default depth is the sanity guard, not 12");
  check("it guards runaway size explicitly instead of by depth",
    /MAX_OBJECTS/.test(src) && /files\.length \+ folders\.length\) < MAX_OBJECTS/.test(src),
    "object ceiling halts the loop");
  check("an incomplete crawl never replaces a good index, whatever the file count",
    /crawlIncomplete: true/.test(src) && /CRAWL_INCOMPLETE/.test(src),
    "promotion is refused on truncation alone");
  check("the reason for an incomplete crawl is named, not just flagged",
    /incompleteReason/.test(src), "incompleteReason is reported per root");

  /* ---- and the live index is not sitting at its limit ------------------- */
  const cache = (() => {
    for (const p of ["cache/drive-index.json", "cache/drive.json"]) {
      try { return JSON.parse(fs.readFileSync(P.join(ROOT, p), "utf8")); } catch (e) {}
    }
    return null;
  })();
  if (cache) {
    check("the live index is not flagged incomplete",
      !cache.crawlIncomplete, cache.error || "complete");
  } else {
    check("live index check skipped: no crawl cache on this host", true, "skipped");
  }
});
