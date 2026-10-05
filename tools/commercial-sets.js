#!/usr/bin/env node
/* EXACT SET ARITHMETIC for the Commercial populations.
 *
 * Four numbers have been quoted side by side — 183 unreadable, 19 human review,
 * 37 queued attachment decisions, 12 executed-looking templates — without
 * anyone saying whether they overlap. A file can be in several of them, so
 * adding them up is meaningless until the intersections are stated.
 *
 *   node tools/commercial-sets.js
 */
const fs = require("fs"), P = require("path");
const ROOT = P.join(__dirname, "..");
const A = (n) => JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8"));

const ctx = A("commercial-document-context.json");
const disp = A("commercial-document-disposition.json");
const conflicts = A("commercial-conflicts.json");
const templates = A("commercial-template-verification.json");

const byId = new Map(ctx.map((c) => [c.fileId, c]));

const UNREADABLE = new Set(ctx.filter((c) => c.contentState === "CONTENT_UNREADABLE").map((c) => c.fileId));
const PARTIAL = new Set(ctx.filter((c) => c.contentState === "CONTENT_PARTIAL").map((c) => c.fileId));
const HUMAN = new Set(disp.filter((d) => d.needsHuman).map((d) => d.fileId));
/* Conflicts come in three kinds and must not be added together. The "37 queued
   attachment decisions" are specifically the PROJECT-ATTACHMENT conflicts that
   were not auto-resolved; counting every conflict row gave 114 and made the
   population look three times its size. */
const kindOf = (c) => (c.folderCandidate === "TEMPLATE" ? "template-vs-executed"
  : c.trackerCandidate ? "project-attachment" : "folder-vs-content");
const PROJECT_CONFLICTS = conflicts.filter((c) => kindOf(c) === "project-attachment");
const QUEUED = new Set(PROJECT_CONFLICTS.filter((c) => !c.autoResolve).map((c) => c.fileId));
const FOLDER_CONTENT = new Set(conflicts.filter((c) => kindOf(c) === "folder-vs-content").map((c) => c.fileId));
const AUTO = new Set(PROJECT_CONFLICTS.filter((c) => c.autoResolve).map((c) => c.fileId));
const EXEC_TEMPLATE = new Set(templates.filter((t) => t.verdict === "LOOKS_EXECUTED_REVIEW").map((t) => t.fileId));

const inter = (a, b) => [...a].filter((x) => b.has(x));
const line = (label, n) => console.log("  " + String(n).padStart(5) + "  " + label);

console.log("=== COMMERCIAL SET ARITHMETIC ===\n");
console.log("POPULATIONS");
line("unreadable (CONTENT_UNREADABLE)", UNREADABLE.size);
line("partial (CONTENT_PARTIAL)", PARTIAL.size);
line("human review (disposition UNRESOLVED_REQUIRES_HUMAN)", HUMAN.size);
line("queued attachment decisions (conflicts not auto-resolved)", QUEUED.size);
line("auto-resolved attachment decisions", AUTO.size);
line("executed-looking files in template areas", EXEC_TEMPLATE.size);
line("folder-vs-content advisories (a different population)", FOLDER_CONTENT.size);
console.log("\n  conflict rows by kind: " + JSON.stringify(conflicts.reduce((m, c) => { m[kindOf(c)] = (m[kindOf(c)] || 0) + 1; return m; }, {})));

console.log("\nUNREADABLE (" + UNREADABLE.size + ") breaks down as");
line("also human review", inter(UNREADABLE, HUMAN).length);
line("also queued attachment decision", inter(UNREADABLE, QUEUED).length);
line("also executed-looking template", inter(UNREADABLE, EXEC_TEMPLATE).length);
line("in NONE of the other three — classified from folder/tracker alone", [...UNREADABLE]
  .filter((x) => !HUMAN.has(x) && !QUEUED.has(x) && !EXEC_TEMPLATE.has(x)).length);

console.log("\nHUMAN REVIEW (" + HUMAN.size + ") breaks down as");
line("readable", [...HUMAN].filter((x) => !UNREADABLE.has(x)).length);
line("unreadable", inter(HUMAN, UNREADABLE).length);
line("also queued attachment decision", inter(HUMAN, QUEUED).length);
line("also executed-looking template", inter(HUMAN, EXEC_TEMPLATE).length);

console.log("\nQUEUED ATTACHMENTS (" + QUEUED.size + ") breaks down as");
line("readable", [...QUEUED].filter((x) => !UNREADABLE.has(x)).length);
line("unreadable", inter(QUEUED, UNREADABLE).length);
line("also human review", inter(QUEUED, HUMAN).length);

console.log("\nEXECUTED-LOOKING TEMPLATES (" + EXEC_TEMPLATE.size + ") breaks down as");
line("readable", [...EXEC_TEMPLATE].filter((x) => !UNREADABLE.has(x)).length);
line("unreadable", inter(EXEC_TEMPLATE, UNREADABLE).length);
line("also human review", inter(EXEC_TEMPLATE, HUMAN).length);

const union = new Set([...UNREADABLE, ...HUMAN, ...QUEUED, ...EXEC_TEMPLATE]);
console.log("\nUNION of all four populations: " + union.size + " distinct files"
  + "   (naive sum would be " + (UNREADABLE.size + HUMAN.size + QUEUED.size + EXEC_TEMPLATE.size) + ")");
console.log("of " + ctx.length + " Commercial files in total");

/* The technical cause of each unreadable file, from what we already know about
   it — the extension and mime are enough to separate most classes without
   touching Drive again. */
console.log("\n=== §3 WHY EACH UNREADABLE FILE IS UNREADABLE (from existing evidence) ===");
let mani = {};
try { mani = JSON.parse(fs.readFileSync(P.join(ROOT, "cache", "commercial-manifest.json"), "utf8")); } catch (e) {}
const cause = {};
const causeOf = (c) => {
  const m = mani[c.fileId] || {};
  const n = String(c.filename || "").toLowerCase();
  if (m.why === "too large") return "oversized (over the fetch limit)";
  if (/^http/.test(String(m.why || ""))) return "fetch failed: " + m.why;
  if (/\.docx?$/.test(n) && !/\.docx$/.test(n)) return "legacy .doc (OLE compound file)";
  if (/\.odt$/.test(n)) return "OpenDocument (.odt)";
  if (/\.pdf$/.test(n)) return m.state === "CONTENT_SCANNED_NO_TEXT" ? "scanned PDF, no text layer" : "PDF, no text recovered";
  if (/\.(jpe?g|jfif|png|gif)$/.test(n)) return "image-only format";
  if (/\.(mp4|mpe?g|wav|zip|rar|7z)$/.test(n)) return "not a document (media/archive)";
  return "other / unsupported";
};
for (const c of ctx) {
  if (c.contentState !== "CONTENT_UNREADABLE") continue;
  const k = causeOf(c);
  cause[k] = (cause[k] || 0) + 1;
}
for (const [k, v] of Object.entries(cause).sort((a, b) => b[1] - a[1])) line(k, v);

fs.writeFileSync(P.join(ROOT, "audit", "commercial-sets.json"), JSON.stringify({
  populations: {
    unreadable: UNREADABLE.size, partial: PARTIAL.size, humanReview: HUMAN.size,
    queuedAttachments: QUEUED.size, autoResolved: AUTO.size, executedLookingTemplates: EXEC_TEMPLATE.size,
  },
  intersections: {
    unreadable_and_human: inter(UNREADABLE, HUMAN).length,
    unreadable_and_queued: inter(UNREADABLE, QUEUED).length,
    unreadable_and_execTemplate: inter(UNREADABLE, EXEC_TEMPLATE).length,
    human_and_queued: inter(HUMAN, QUEUED).length,
    human_and_execTemplate: inter(HUMAN, EXEC_TEMPLATE).length,
    queued_and_execTemplate: inter(QUEUED, EXEC_TEMPLATE).length,
  },
  union: union.size,
  unreadableCauses: cause,
  ids: {
    unreadable: [...UNREADABLE], humanReview: [...HUMAN], queued: [...QUEUED],
    executedLookingTemplates: [...EXEC_TEMPLATE], partial: [...PARTIAL],
  },
}, null, 1));
console.log("\n  wrote audit/commercial-sets.json");
