#!/usr/bin/env node
/* ONE ROOT, WALKED TO EVERY LEAF, AND BACK.
 *
 * The estate-wide reconciliation answers "is anything unaccounted for". This
 * answers a harder question about one root at a time: is every single document
 * in it actually USABLE in the product — reachable, correctly typed, and
 * attached to the record it belongs to.
 *
 * It walks the folder tree top-down to the leaves, then comes back up from each
 * file to whatever LegalOS holds about it, and prints the gap. Nothing is
 * inferred here: it reports what is, so the fixes can be aimed.
 *
 *   node tools/module-audit.js --root "Commercial_Zameen Media Contracts" [--tree] [--gaps]
 */
const P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const content = require("../api/content-model.js");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const isDocFile = (f) => !/\.(xlsx?|tmp)$/i.test(f.name || "")
  && !/^~\$/.test(f.name || "") && !/^\./.test(f.name || "")
  && !/spreadsheetml|ms-excel/i.test(f.mimeType || "");

(async () => {
  const ROOT = arg("--root", "Commercial_Zameen Media Contracts");
  await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};
  content.load(true);

  const files = drive.indexFiles().filter((f) => String(f.folderPath || "").startsWith(ROOT));
  const folders = drive.indexFolders().filter((f) => String(f.path || f.folderPath || "").startsWith(ROOT));

  // Up from each document: which record, in which family, by what evidence.
  const owner = new Map();
  for (const [fam, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) for (const d of r.driveFiles || []) {
      if (!owner.has(d.id)) owner.set(d.id, []);
      owner.get(d.id).push({ fam, id: r.id, via: d.via });
    }
  }

  console.log("ROOT: " + ROOT);
  console.log("  files " + files.length + "   folders " + folders.length + "\n");

  // ---- the tree, by branch
  const branches = new Map();
  for (const f of files) {
    const seg = String(f.folderPath || "").split(" / ")[1] || "(loose in the root)";
    if (!branches.has(seg)) branches.set(seg, []);
    branches.get(seg).push(f);
  }

  const rows = [];
  for (const [branch, bfiles] of [...branches.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const docs = bfiles.filter(isDocFile);
    const linked = docs.filter((f) => owner.has(f.id));
    const read = docs.filter((f) => content.factsFor(f.id).read !== "NOT_READ");
    const typed = docs.filter((f) => content.factsFor(f.id).type);
    console.log("  " + branch);
    console.log("      documents " + String(docs.length).padStart(4)
      + "   attached to a record " + String(linked.length).padStart(4)
      + "   read " + String(read.length).padStart(4)
      + "   typed " + String(typed.length).padStart(4)
      + "   non-documents " + (bfiles.length - docs.length));
    // deepest paths, so the shape of the branch is visible
    const leaves = new Map();
    for (const f of bfiles) {
      const k = String(f.folderPath || "").split(" / ").slice(0, 4).join(" / ");
      leaves.set(k, (leaves.get(k) || 0) + 1);
    }
    for (const [k, n] of [...leaves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log("         " + String(n).padStart(4) + "  " + k.split(" / ").slice(1).join(" / ").slice(0, 86));
    }
    for (const f of docs) {
      const o = owner.get(f.id) || [];
      const c = content.factsFor(f.id);
      rows.push({ branch, name: f.name, folderPath: f.folderPath, id: f.id,
        attached: o.length, families: [...new Set(o.map((x) => x.fam))], via: [...new Set(o.map((x) => x.via))],
        read: c.read, type: c.type });
    }
  }

  const unattached = rows.filter((r) => !r.attached);
  console.log("\n  === GAPS ===");
  console.log("  documents attached to no record: " + unattached.length + " of " + rows.length);
  const byBranch = {};
  for (const r of unattached) byBranch[r.branch] = (byBranch[r.branch] || 0) + 1;
  for (const [k, v] of Object.entries(byBranch).sort((a, b) => b[1] - a[1])) console.log("      " + String(v).padStart(4) + "  " + k);

  const unread = rows.filter((r) => r.read === "NOT_READ");
  console.log("  documents we have not read at all: " + unread.length);
  const untyped = rows.filter((r) => !r.type);
  console.log("  documents with no content type:    " + untyped.length);

  if (has("--gaps")) {
    console.log("\n  UNATTACHED (first 60):");
    for (const r of unattached.slice(0, 60)) {
      console.log("    [" + r.read.padEnd(19) + "] " + (r.type || "-").padEnd(18) + " "
        + r.folderPath.split(" / ").slice(1).join(" / ").slice(0, 62) + " / " + r.name.slice(0, 44));
    }
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
