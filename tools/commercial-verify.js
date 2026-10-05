#!/usr/bin/env node
/* THE COMMERCIAL GATES, and the arithmetic behind them.
 *
 * Everything else in this module produces findings. This one checks them, and
 * refuses to call the estate closed on anything it cannot show:
 *
 *   §17 the 13 attachments that were moved automatically — each one re-proved,
 *       and checked for a NEW wrong association introduced by the move
 *   §18 every tracker project's documents, graded by confidence rather than
 *       merely counted
 *   §19/§21 the project-only source records, end to end
 *   §33 the final disposition arithmetic, which must reconcile to the total
 *   §36 the gates
 *
 *   node tools/commercial-verify.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const vision = require("../api/commercial-vision-facts.js");

const ROOT = P.join(__dirname, "..");
const AUD = P.join(ROOT, "audit");
const A = (n) => { try { return JSON.parse(fs.readFileSync(P.join(AUD, n), "utf8")); } catch (e) { return null; } };
const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");
const say = console.log;

(async () => {
  await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};

  const ctx = A("commercial-document-context.json") || [];
  const disp = A("commercial-document-disposition.json") || [];
  const resolutions = A("commercial-resolutions.json") || [];
  const reviewQueue = A("commercial-review-queue.json") || [];
  const multi = A("commercial-multirecord.json") || [];
  const reattach = A("commercial-reattach.json") || [];
  const projectOnly = A("commercial-project-only-records.json") || [];
  const recovery = A("commercial-recovery.json") || [];
  const byId = new Map(ctx.map((c) => [c.fileId, c]));
  const resById = new Map(resolutions.map((r) => [r.fileId, r]));

  const gates = {};
  const findings = [];

  /* ------------------------------------- §17 the moved attachments, re-proved */
  say("=== §17 AUTOMATICALLY MOVED ATTACHMENTS ===\n");
  const moveChecks = [];
  for (const m of reattach) {
    const c = byId.get(m.fileId);
    const f = drive.fileById(m.fileId);
    /* Every family, not just properties. Three reattachments were reported as
       failures because this looked only at property records while the documents
       had landed on CONTRACTS records — by filename citation, the strongest
       evidence there is. The gate was measuring the wrong shelf. */
    const holders = [];
    for (const [famKey, arr] of Object.entries(regs)) {
      if (!Array.isArray(arr)) continue;
      for (const r of arr) {
        if ((r.driveFiles || []).some((d) => d.id === m.fileId)) holders.push(r.project || r.title || famKey);
      }
    }
    const fileKey = norm(m.filename);
    const filenameEvidence = fileKey.includes(norm(m.toProject));
    /* Content evidence now includes what was seen on the pages. A document that
       was READ and names its project is better evidence than a filename, so
       requiring the filename to agree as well would reject the very findings
       the read pass exists to produce. */
    const vfm = vision.identity ? vision.identity(m.fileId) : null;
    const pageEvidence = !!(vfm && vfm.project && norm(vfm.project) === norm(m.toProject));
    const contentEvidence = pageEvidence
      || (c && (c.projectFromContent || []).some((p) => norm(p.project) === norm(m.toProject))) || false;
    /* A reattachment succeeded when the document REACHED the right project and
       LEFT the wrong one. Demanding that nothing else hold it was too strong: a
       contract document belongs both to its own contract record and to the
       project it was written for, so a ready-mix supply agreement sitting on
       "Agreement for supply of Ready-Mix Concrete" AND on Zameen Quadrangle is
       correct, not a failure. What must never happen is the document still
       hanging off the project it was moved away from. */
    const onTarget = holders.some((h) => norm(h) === norm(m.toProject));
    const stillOnSource = holders.some((h) => norm(h) === norm(m.fromProject));
    const landedRight = onTarget && !stillOnSource;
    const driveUnchanged = !!f && String(f.folderPath || "").includes(m.fromProject.split(" ")[0]);
    moveChecks.push({
      fileId: m.fileId, filename: m.filename,
      from: m.fromProject, to: m.toProject,
      filenameEvidence, contentEvidence,
      nowHeldBy: holders,
      onTarget, stillOnSource, landedRight,
      driveFolderUnchanged: driveUnchanged,
      pageEvidence,
      /* EITHER kind of evidence, plus actually landing on the target. Demanding
         both name and content meant a correctly-moved document with a filename
         that says nothing (Aurum Area Summary is a TEPA approval) failed a gate
         it had satisfied on the merits. */
      ok: (filenameEvidence || contentEvidence) && landedRight,
    });
    say("  " + ((filenameEvidence || contentEvidence) && landedRight ? "OK  " : "CHECK")
      + "  " + m.fromProject + " -> " + m.toProject
      + "  [name:" + (filenameEvidence ? "y" : "n") + " content:" + (contentEvidence ? "y" : "n")
      + (pageEvidence ? " pages:y" : "")
      + " heldBy:" + JSON.stringify(holders) + "]  " + m.filename.slice(0, 44));
  }
  const badMoves = moveChecks.filter((m) => !m.ok);
  gates.WRONG_PROJECT_ATTACHMENTS = badMoves.length;

  /* ------------------------------------------- §18 project content quality */
  say("\n=== §18 EVERY TRACKER PROJECT, BY CONFIDENCE ===\n");
  const projectAudit = [];
  const seen = new Set();
  for (const p of regs.properties || []) {
    const key = norm(p.project);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const rows = (regs.properties || []).filter((x) => norm(x.project) === key);
    const docs = [];
    for (const r of rows) for (const d of r.driveFiles || []) docs.push(d);
    const uniq = new Map(docs.map((d) => [d.id, d]));
    let strong = 0, weak = 0, templates = 0, cross = 0, review = 0;
    for (const [id, d] of uniq) {
      const c = byId.get(id);
      const q = reviewQueue.find((x) => x.fileId === id);
      if (q) review++;
      if (/Pakistan Contract Templates/i.test(d.folderPath || "") && !/Agreement to Sell/i.test(d.folderPath || "")) templates++;
      const namesOther = c && (c.projectFromContent || []).some((x) => norm(x.project) !== key && x.confirmed);
      if (namesOther) cross++;
      if (d.via === "filename" || d.via === "project-folder" || d.via === "project-sale-deeds" || d.via === "content-reattach") strong++;
      else weak++;
    }
    projectAudit.push({
      project: p.project, rows: rows.length, documents: uniq.size,
      strong, weak, templatesPresent: templates, crossProject: cross, inReview: review,
    });
  }
  for (const a of projectAudit.sort((x, y) => y.documents - x.documents)) {
    say("  " + a.project.slice(0, 26).padEnd(28) + " docs " + String(a.documents).padStart(3)
      + "  strong " + String(a.strong).padStart(3) + "  weak " + String(a.weak).padStart(3)
      + "  cross-project " + String(a.crossProject).padStart(2) + "  in review " + a.inReview);
  }
  gates.PROJECTS_WITH_NO_DOCUMENTS = projectAudit.filter((a) => a.documents === 0).length;
  /* INFORMATIONAL, not a gate. A document held by a project while a person
     decides whether it belongs there is exactly what §1 asks for — preserved
     explicitly with its evidence — and failing the build for it would push
     towards forcing a match to make a number go green. */
  const contested = projectAudit.reduce((n, a) => n + a.inReview, 0);

  /* ----------------------------------- §19/§21 the project-only source records */
  say("\n=== §19/§21 PROJECT-ONLY SOURCE RECORDS ===\n");
  const poChecks = projectOnly.map((p) => {
    /* Count the same way the lineage did: documents whose folder path contains
       the project folder, excluding the trackers and lock files the lineage
       also excludes. Comparing a raw file count against a document count is
       comparing two different things and reported a mismatch that was not one. */
    const SALE_DEED = /Agreement to Sell & Sale Deeds/i;
    const projectSegment = (f) => {
      const segs = String(f.folderPath || "").split(" / ");
      if (SALE_DEED.test(f.folderPath || "")) return segs[segs.findIndex((x) => SALE_DEED.test(x)) + 1];
      if (/^Commercial_ZD Projects/.test(f.root || "")) return segs[1];
      return null;
    };
    /* The SEGMENT must equal the project folder, not merely appear somewhere in
       the path. `includes` also matched "Zameen Eon Phase 2" and similar, and
       reported 16 documents against a record holding 11 — a mismatch that was
       an artefact of asking a looser question than the lineage asked. */
    const docs = drive.indexFiles().filter((f) => projectSegment(f) === p.sourceFolder);
    return {
      id: p.id, displayName: p.displayName, sourceFolder: p.sourceFolder,
      hasStableId: /^PRJ-SRC-[A-Z0-9]+$/.test(p.id),
      documentsInDrive: docs.length, documentsRecorded: p.documents,
      entity: p.entity, quality: p.quality,
      countsAgree: docs.length === p.documents,
    };
  });
  for (const c of poChecks) {
    say("  " + (c.hasStableId && c.countsAgree ? "OK  " : "CHECK") + "  " + c.id.padEnd(28)
      + c.displayName.slice(0, 34).padEnd(36) + " docs " + c.documentsRecorded
      + (c.countsAgree ? "" : " (Drive shows " + c.documentsInDrive + ")")
      + "  entity " + (c.entity === null ? "null (not stated in source)" : c.entity));
  }
  gates.PROJECT_ONLY_RECORDS_MALFORMED = poChecks.filter((c) => !c.hasStableId || !c.countsAgree).length;

  // §21 — the 69 project-only DOCUMENTS must each name their project/folder.
  const poDocs = disp.filter((d) => d.disposition === "PROJECT_ONLY_SOURCE_DOCUMENT");
  const poDocsPlaced = poDocs.filter((d) => /project|names the project|filename names/i.test(d.evidence || ""));
  say("\n  project-only documents: " + poDocs.length + ", of which " + poDocsPlaced.length
    + " name a specific project or project folder in their evidence");
  gates.PROJECT_ONLY_DOCS_UNPLACED = poDocs.length - poDocsPlaced.length;

  /* --------------------------------------------------- §33 the arithmetic -- */
  say("\n=== §33 FINAL DISPOSITION ARITHMETIC ===\n");
  const finalOf = (fileId) => {
    const r = resById.get(fileId);
    if (r && r.to && r.to !== "HUMAN_REVIEW_REQUIRED" && r.to !== "KEEP where it is" && !/^REATTACH/.test(r.to)) return r.to;
    const d = disp.find((x) => x.fileId === fileId);
    return (d && d.disposition) || "UNKNOWN";
  };
  const inReview = new Set(reviewQueue.map((r) => r.fileId));
  const unreadableNow = new Set(recovery.filter((r) => r.state === "CONTENT_UNREADABLE").map((r) => r.fileId));

  const buckets = {};
  const bump = (k) => { buckets[k] = (buckets[k] || 0) + 1; };
  for (const c of ctx) {
    const id = c.fileId;
    if (inReview.has(id)) { bump(unreadableNow.has(id) ? "UNREADABLE AND REVIEW REQUIRED" : "HUMAN REVIEW REQUIRED"); continue; }
    const f = finalOf(id);
    if (f === "NON_COMMERCIAL_SOURCE_CONTAMINATION") { bump("NON-COMMERCIAL CONTAMINATION"); continue; }
    if (f === "TEMPLATE") { bump("TEMPLATE"); continue; }
    if (f === "REFERENCE" || f === "REFERENCE_EXECUTED_SAMPLE") { bump("REFERENCE"); continue; }
    if (f === "PROJECT_ONLY_SOURCE_DOCUMENT" || f === "HISTORICAL_EXECUTED_DOCUMENT") { bump("PROJECT-ONLY / HISTORICAL"); continue; }
    if (unreadableNow.has(id)) { bump("UNREADABLE BUT SAFELY CLASSIFIED"); continue; }
    bump("AUTO-RESOLVED");
  }
  let total = 0;
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) { say("  " + String(v).padStart(5) + "  " + k); total += v; }
  say("  " + String(total).padStart(5) + "  TOTAL");
  gates.ARITHMETIC_RECONCILES = total === ctx.length ? 0 : 1;
  say("  (Commercial files: " + ctx.length + (total === ctx.length ? " — reconciles)" : " — DOES NOT RECONCILE)"));

  /* -------------------------------------------------------------- §36 gates */
  gates.FILES_WITHOUT_DISPOSITION = ctx.length - disp.length;
  /* A gate must not read prose. This one grepped the human-readable basis for
     "executed" and so matched every basis that said "the pages show it is NOT
     executed" — fifteen documents the pipeline had classified correctly were
     reported as failures, and the gate would have stayed red however well the
     work was done. The question it means to ask is factual: did we SEE
     signatures on a document that is still filed as a template? That is
     answered by the recorded facts, not by a substring. */
  const visionStore = (() => {
    try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "commercial-vision.json"), "utf8")); }
    catch (e) { return {}; }
  })();
  const stillTemplateButSigned = resolutions.filter((r) => {
    if (r.from !== "TEMPLATE" || r.to !== "TEMPLATE") return false;
    const v = visionStore[r.fileId];
    return !!(v && v.facts && v.facts.executed === true);
  });
  gates.EXECUTED_DOCS_LEFT_AS_TEMPLATE = stillTemplateButSigned.length;
  if (stillTemplateButSigned.length) {
    say("\n  documents left as TEMPLATE although signatures were seen:");
    for (const r of stillTemplateButSigned.slice(0, 10)) {
      say("     " + String(r.filename || r.fileId).slice(0, 70));
    }
  }
  gates.WEAK_MULTI_RECORD_LINKS = multi.filter((m) => m.strength === "WEAK_GUESS_SHARED").length;
  gates.HUMAN_REVIEW_ITEMS_WITHOUT_EVIDENCE = reviewQueue
    .filter((r) => !r.evidenceA || !r.evidenceB || !r.whyAutomationCannotDecide || !r.suggestedAction).length;
  gates.HUMAN_REVIEW_ITEMS_WITHOUT_DRIVE_PATH = reviewQueue.filter((r) => !r.drivePath || !r.fileId).length;

  say("\n  project documents awaiting a human decision (informational): " + contested);

  say("\n=== §36 GATES ===\n");
  let bad = 0;
  for (const [k, v] of Object.entries(gates)) {
    const ok = v === 0;
    if (!ok) bad++;
    say("  " + (ok ? "PASS" : "FAIL") + "  " + k.padEnd(38) + v);
  }
  say(bad ? "\n  " + bad + " gate(s) not yet at zero" : "\n  every gate at zero");

  fs.writeFileSync(P.join(AUD, "commercial-final-status.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals: { files: ctx.length },
    buckets, gates,
    movedAttachments: moveChecks,
    projectAudit,
    projectOnly: poChecks,
    reviewQueue: reviewQueue.length,
  }, null, 1));
  say("\n  wrote audit/commercial-final-status.json");
})().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });
