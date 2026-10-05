#!/usr/bin/env node
/* RECORD WHAT WAS READ — same store, honest provenance.
 *
 * audit/commercial-vision.json is the record of what a reader saw on the pages
 * of a document. Until now every entry came from a spawned CLI. These entries
 * come from the agent reading the prepared pages and text directly, which is
 * the same act with none of the per-document start-up cost.
 *
 * The store must not lie about WHO looked, because the two routes can fail in
 * different ways and a later audit needs to tell them apart. So every entry
 * written here carries `method: "agent-read"` and the batch it came from, while
 * CLI entries keep theirs. The facts themselves are in the same shape and are
 * consumed by the same code.
 *
 * Only structured facts are stored — never a document body. That rule does not
 * change with the reader.
 *
 *   node tools/record-read.js facts.json
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "audit", "commercial-vision.json");

const FIELDS = ["documentType", "agreementTitle", "parties", "entity", "project", "counterparty",
  "agreementDate", "executionDate", "effectiveDate", "agreementNumber", "amendmentNumber",
  "parentAgreement", "propertyOrUnit", "executed", "executionEvidence", "draftMarkers",
  "documentFamily", "confidence", "unreadable", "summary"];

/* A summary is the one field that could carry commercial terms out of the
   document and into an artefact that is not access-controlled the way the
   document is. It is capped here as well as asked for short, because an
   instruction is not a guarantee. */
const capSummary = (s) => String(s || "").split(/\s+/).slice(0, 30).join(" ");

const input = process.argv[2];
if (!input) { console.error("usage: node tools/record-read.js facts.json"); process.exit(2); }

const incoming = JSON.parse(fs.readFileSync(input, "utf8"));
let store = {};
try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { store = {}; }

let added = 0, replaced = 0;
for (const rec of incoming) {
  if (!rec.fileId) continue;
  const facts = {};
  for (const f of FIELDS) {
    if (f === "parties" || f === "draftMarkers") facts[f] = Array.isArray(rec[f]) ? rec[f] : [];
    else if (f === "amendmentNumber") facts[f] = typeof rec[f] === "number" ? rec[f] : null;
    else if (f === "executed") facts[f] = typeof rec[f] === "boolean" ? rec[f] : null;
    else if (f === "unreadable") facts[f] = rec[f] === true;
    else if (f === "summary") facts[f] = capSummary(rec[f]);
    else facts[f] = typeof rec[f] === "string" ? rec[f] : "";
  }
  if (store[rec.fileId]) replaced++; else added++;
  store[rec.fileId] = {
    fileId: rec.fileId,
    filename: rec.filename || "",
    folderPath: rec.folderPath || "",
    pagesRead: Number(rec.pagesRead) || 0,
    facts,
    /* What the reader was actually given. "text" and "pages" fail differently:
       a text layer can be complete and a render can miss a stamp, so a later
       dispute needs to know which one produced a fact. */
    evidence: rec.evidence || "pages",
    method: "agent-read",
    batch: rec.batch || "",
    readAt: new Date().toISOString(),
  };
}

fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
console.log("recorded " + added + " new, " + replaced + " replaced; store now " + Object.keys(store).length);
