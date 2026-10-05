#!/usr/bin/env node
/* READ THE DOCUMENTS NOTHING ELSE CAN, using Claude on the account's plan.
 *
 * This is for the residue: the scans with no text layer, the legacy .doc files,
 * the documents every other method in this repository has already failed on.
 * It transmits those documents to Anthropic, which is why it will not move
 * without an explicit allowlist in config/claude-reader.json.
 *
 *   node tools/claude-read.js --preview                 what WOULD be sent, sends nothing
 *   node tools/claude-read.js --preview --root Commercial
 *   node tools/claude-read.js --run [--limit N]         read the allowlisted ones
 *
 * --preview is the honest first step: it prints, folder by folder, how many
 * unreadable documents sit there and how many the current allowlist would
 * permit. Choose folders from those numbers rather than from a guess.
 *
 * Results are structured facts only — type, parties, dates, project, parent
 * agreement. The document's text is never written to disk, the log or any
 * artefact, and the downloaded copy is destroyed as soon as it has been read.
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const content = require("../api/content-model.js");
const reader = require("../api/claude-reader.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "cache", "claude-read.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

(async () => {
  await drive.ensureIndex();
  content.load(true);

  const rootFilter = arg("--root", null);
  const unreadable = (f) => {
    if (rootFilter && !String(f.root || "").startsWith(rootFilter)) return false;
    if (/\.(xlsx?|tmp)$/i.test(f.name || "") || /^~\$/.test(f.name || "")) return false;
    if (/\.(jpe?g|jfif|png|gif|mp4|mpe?g|zip|rar)$/i.test(f.name || "")) return false;
    return content.factsFor(f.id).read === "NOT_READ";
  };
  const targets = drive.indexFiles().filter(unreadable);

  const st = reader.status();
  console.log("claude-read");
  console.log("  CLI installed        : " + st.installed);
  console.log("  reading enabled      : " + st.enabled);
  console.log("  allowlisted folders  : " + (st.allowlist.length ? st.allowlist.join(" | ") : "(none — nothing may be sent)"));
  console.log("  documents nothing can read: " + targets.length + (rootFilter ? "  (under " + rootFilter + ")" : ""));

  if (has("--preview") || !has("--run")) {
    const pv = reader.preview(unreadable);
    console.log("\n  WOULD SEND: " + pv.totals.wouldSend + " of " + pv.totals.files + " unreadable documents\n");
    console.log("  by folder (the prefix you would allowlist is the folder path):");
    for (const f of pv.folders.slice(0, 30)) {
      console.log("    " + String(f.files).padStart(4) + " unreadable  "
        + String(f.allowed).padStart(4) + " permitted   " + (f.bytes / 1e6).toFixed(0).padStart(5) + "MB   " + f.folder.slice(0, 82));
    }
    if (!has("--run")) console.log("\n  Nothing was transmitted. Add folders to config/claude-reader.json and re-run with --run.");
    return;
  }

  const limit = parseInt(arg("--limit", "0"), 10);
  let store = {};
  try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { store = {}; }

  const todo = targets.filter((f) => !store[f.id] && reader.maySend(f, reader.config()).ok);
  const work = limit ? todo.slice(0, limit) : todo;
  if (!work.length) {
    console.log("\n  Nothing to do: no unreadable document is both unread and allowlisted.");
    return;
  }
  console.log("\n  reading " + work.length + " documents…\n");

  let ok = 0, failed = 0, cost = 0;
  for (let i = 0; i < work.length; i++) {
    const f = work[i];
    const r = await reader.readDocument(f.id);
    if (r.ok) {
      ok++;
      cost += r.costUsd || 0;
      store[f.id] = {
        fileId: f.id, filename: f.name, folderPath: f.folderPath,
        facts: r.facts, readAt: r.readAt, source: "claude-read",
      };
      const fa = r.facts || {};
      console.log("  [" + (i + 1) + "/" + work.length + "] " + String(fa.documentType || "?").padEnd(14)
        + String(fa.lifecycle || "").padEnd(12) + (f.name || "").slice(0, 46));
    } else {
      failed++;
      store[f.id] = { fileId: f.id, filename: f.name, folderPath: f.folderPath, error: r.error, readAt: new Date().toISOString() };
      console.log("  [" + (i + 1) + "/" + work.length + "] FAILED " + String(r.error).slice(0, 50) + "  " + (f.name || "").slice(0, 40));
    }
    if ((i + 1) % 10 === 0) fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
  }
  fs.writeFileSync(OUT, JSON.stringify(store, null, 1));

  console.log("\n=== READ ===");
  console.log("  identified : " + ok);
  console.log("  failed     : " + failed);
  if (cost) console.log("  plan usage : $" + cost.toFixed(2) + " equivalent");
  console.log("  wrote cache/claude-read.json (structured facts only)");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
