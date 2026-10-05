#!/usr/bin/env node
/* THE SAME INSTRUMENT, FILED TWICE.
 *
 * "Copy of Second Addendum Broadway Heights no. 15" and "Second Addendum
 * Broadway Heights no. 15" are the same 2,112,106 bytes and render to
 * hash-identical pages. They are one executed addendum, stored twice. Until now
 * the pipeline counted them as two documents, and anything that reasons about
 * how many addenda a contract has was wrong by one.
 *
 * Drive gives an md5Checksum for every binary file and api/drive.js already
 * ASKS for it — but the cached index was built before that field was added, so
 * not one of the 6,845 entries carries it. Rebuilding the whole index to learn
 * this would re-walk 1,531 folders.
 *
 * So this asks a narrower question. Two files can only be identical if they are
 * the same length, and only 222 Commercial files share a length with anything
 * else. Fetching the checksum for those 222 settles every case exactly, and
 * leaves the other 1,081 alone.
 *
 * It decides NOTHING on its own. Identical bytes mean the same document was
 * stored twice; which copy is canonical is a question about folders and names,
 * so the output ranks them and the caller applies it.
 *
 *   node tools/commercial-duplicates.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const { driveJson } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "audit", "commercial-duplicates.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checksum(id, attempt = 0) {
  try {
    const j = await driveJson("/files/" + encodeURIComponent(id)
      + "?fields=id,md5Checksum,size&supportsAllDrives=true");
    return j && j.md5Checksum ? j.md5Checksum : null;
  } catch (e) {
    if (attempt < 3) { await sleep(800 * Math.pow(2, attempt)); return checksum(id, attempt + 1); }
    return null;
  }
}

/* Which copy should the registers point at? A file sitting in the project's own
   folder beats one in a general drop, and a name that does not announce itself
   as a copy beats one that does. This is a preference, not a deletion: nothing
   in Drive is touched and the other copies stay reachable as duplicates. */
function rank(f) {
  let score = 0;
  const name = String(f.name || "");
  if (/^copy of |[-_ ]copy\b|\(\d\)\./i.test(name)) score -= 10;
  if (/~\$|\btmp\b/i.test(name)) score -= 20;
  const depth = String(f.folderPath || "").split(" / ").length;
  score += depth;                        // a deeper, more specific folder wins
  if (/Miscell|Other|Misc\b/i.test(f.folderPath || "")) score -= 5;
  return score;
}

(async () => {
  await drive.ensureIndex();
  const comm = drive.indexFiles().filter((f) => /^Commercial_/.test(f.folderPath || ""));

  const bySize = new Map();
  for (const f of comm) {
    if (!f.size || Number(f.size) === 0) continue;
    const k = String(f.size);
    if (!bySize.has(k)) bySize.set(k, []);
    bySize.get(k).push(f);
  }
  const candidates = [...bySize.values()].filter((g) => g.length > 1);
  const files = candidates.flat();
  console.error("size-collision groups: " + candidates.length + " covering " + files.length + " files");

  const sums = new Map();
  for (let i = 0; i < files.length; i++) {
    sums.set(files[i].id, await checksum(files[i].id));
    if ((i + 1) % 25 === 0) console.error("  checksummed " + (i + 1) + "/" + files.length);
    await sleep(60);
  }

  const byHash = new Map();
  let noSum = 0;
  for (const f of files) {
    const h = sums.get(f.id);
    if (!h) { noSum++; continue; }
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }

  const groups = [...byHash.entries()].filter(([, g]) => g.length > 1).map(([hash, g]) => {
    const sorted = g.slice().sort((a, b) => rank(b) - rank(a));
    return {
      md5: hash,
      size: Number(sorted[0].size) || 0,
      count: g.length,
      canonical: { fileId: sorted[0].id, filename: sorted[0].name, folderPath: sorted[0].folderPath },
      duplicates: sorted.slice(1).map((f) => ({ fileId: f.id, filename: f.name, folderPath: f.folderPath })),
      /* Same bytes in two different projects is not a filing convenience, it is
         a mapping question: one of the two attachments is probably wrong. */
      crossProject: new Set(g.map((f) => String(f.folderPath || "").split(" / ")[1])).size > 1,
    };
  }).sort((a, b) => b.count - a.count);

  const redundant = groups.reduce((n, g) => n + g.duplicates.length, 0);
  const summary = {
    commercialFiles: comm.length,
    sizeCollisionGroups: candidates.length,
    filesChecksummed: files.length - noSum,
    checksumUnavailable: noSum,
    duplicateGroups: groups.length,
    redundantCopies: redundant,
    distinctDocuments: comm.length - redundant,
    crossProjectGroups: groups.filter((g) => g.crossProject).length,
  };
  fs.writeFileSync(OUT, JSON.stringify({ summary, groups }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  for (const g of groups.slice(0, 40)) {
    console.log("\n  " + g.count + "x " + g.size + (g.crossProject ? "  [CROSS-PROJECT]" : ""));
    console.log("    keep " + g.canonical.filename);
    console.log("         " + g.canonical.folderPath);
    for (const d of g.duplicates) console.log("    dup  " + d.filename + "\n         " + d.folderPath);
  }
})();
