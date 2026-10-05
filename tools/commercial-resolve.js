#!/usr/bin/env node
/* CLOSE THE COMMERCIAL REMAINDER.
 *
 * The estate is already 100% accounted for. This pass pushes the UNCERTAINTY
 * down as far as the evidence safely allows, and makes whatever is left
 * actionable rather than merely counted.
 *
 * It does six things, each with its own evidence rule:
 *
 *   §8  executed agreements sitting in template folders are reclassified on
 *       what they say, not where they sit
 *   §10 files that are not Commercial documents at all are called that
 *   §13 the queued attachment conflicts are decided, or explained
 *   §22 every multi-record link is required to show its evidence
 *   §24 contract chains are graded, and only confirmed ones are operational
 *   §12 whatever remains gets an entry a person can act on in one sitting
 *
 * EVIDENCE ORDER (§14). Not majority voting — source strength:
 *   1 explicit reference inside the document   4 tracker row
 *   2 filename                                 5 sibling documents
 *   3 folder
 * A reference printed in a document outranks the folder it was filed in.
 *
 * Human decisions already recorded (config/commercial-decisions.json) are
 * authoritative and are never re-queued (§31/§32).
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const cctx = require("../api/commercial-context.js");
const vision = require("../api/commercial-vision-facts.js");

const ROOT = P.join(__dirname, "..");
const AUD = P.join(ROOT, "audit");
const DECISIONS = P.join(ROOT, "config", "commercial-decisions.json");
const A = (n) => JSON.parse(fs.readFileSync(P.join(AUD, n), "utf8"));
const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");
const say = console.log;

/* Things that are plainly not this company's commercial paperwork. Kept narrow
   and literal: each pattern was written after reading the file it matches. */
const NON_COMMERCIAL = [
  [/election commission act.*mcq|\bmcqs?\b/i, "study material — multiple-choice questions on the Election Commission Act"],
  [/sub[_\s-]?inspector|written_examination_qualified/i, "a police recruitment examination list"],
  [/\bcv\b|curriculum vitae|resume/i, "a personal CV"],
];

function humanDecisions() {
  try {
    const d = JSON.parse(fs.readFileSync(DECISIONS, "utf8"));
    const m = new Map();
    for (const r of d.decisions || []) m.set(r.fileId, r);
    return m;
  } catch (e) { return new Map(); }
}

(async () => {
  await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};
  cctx.load(true);

  const ctx = A("commercial-document-context.json");
  const disp = A("commercial-document-disposition.json");
  const conflicts = A("commercial-conflicts.json");
  const templates = A("commercial-template-verification.json");
  const byId = new Map(ctx.map((c) => [c.fileId, c]));
  const dispById = new Map(disp.map((d) => [d.fileId, d]));
  const decided = humanDecisions();

  const projects = [];
  { const seen = new Set();
    for (const p of regs.properties || []) {
      const k = norm(p.project); if (!k || seen.has(k)) continue; seen.add(k);
      projects.push({ key: k, name: p.project, records: (regs.properties || []).filter((x) => norm(x.project) === k) });
    } }
  const contracts = regs.contracts || [];

  const outcomes = [];          // every file this pass decided something about
  const reviewQueue = [];       // §12 actionable
  const record = (o) => outcomes.push(o);

  /* ------------------------------------------------- §10 contamination --- */
  let contamination = 0;
  for (const c of ctx) {
    const hit = NON_COMMERCIAL.find(([re]) => re.test(c.filename || ""));
    if (!hit) continue;
    contamination++;
    record({
      fileId: c.fileId, filename: c.filename, path: c.path,
      from: (dispById.get(c.fileId) || {}).disposition,
      to: "NON_COMMERCIAL_SOURCE_CONTAMINATION",
      basis: hit[1],
      evidence: [{ field: "filename", value: c.filename, source: "filename", confidence: "HIGH" }],
      safety: "SAFE_AUTO_RECLASSIFY",
    });
  }

  /* ------------------------- §8/§9 executed agreements in template folders */
  let reclassifiedTemplates = 0;
  for (const t of templates) {
    if (t.verdict !== "LOOKS_EXECUTED_REVIEW") continue;
    const c = byId.get(t.fileId);
    if (!c) continue;
    if (decided.has(c.fileId)) continue;

    /* An executed instrument names parties AND carries a date. A precedent
       that names a project but no parties is still a precedent — the project
       folder it was drafted for does not execute it. */
    const vf = vision.identity(c.fileId);
    const exec = vision.executionState(c.fileId);
    const hasParties = (c.parties || []).length >= 2 || (vf && vf.parties.length >= 2);
    const hasDate = !!(c.agreementDate || c.executionDate || (vf && (vf.agreementDate || vf.executionDate)));
    const namesProject = (c.projectFromContent || []).length > 0 || !!(vf && vf.project);
    const draftMarker = /\b(draft|base draft|template|specimen|standard|proforma|sample|\[●\]|xxx)\b/i.test(c.filename || "");

    let to, basis, safety;
    /* THE SIGNATURE PAGE DECIDES. Someone looked at the execution block and
       either saw signatures or saw it blank. That outranks every inference
       from wording, from the folder and from the filename — a draft and an
       executed agreement read the same until you look. */
    if (exec.state === "EXECUTED") {
      to = namesProject ? "HISTORICAL_EXECUTED_DOCUMENT" : "REFERENCE_EXECUTED_SAMPLE";
      basis = "the pages show it signed — " + exec.evidence
        + (namesProject ? "; it names project " + ((vf && vf.project) || c.projectFromContent[0].project) : "")
        + " — an executed instrument kept in the precedent library";
      safety = "SAFE_AUTO_RECLASSIFY";
    } else if (exec.state === "NOT_EXECUTED") {
      to = "TEMPLATE";
      basis = "the pages show it is not executed — " + exec.evidence;
      safety = "SAFE_AUTO_RECLASSIFY";
    } else if (draftMarker && !hasDate) {
      to = "TEMPLATE"; basis = "its own name marks it a draft or standard form, and it carries no execution date";
      safety = "LIKELY_DRAFT_COPY";
    } else if (hasParties && hasDate && namesProject) {
      /* Executed AND project-specific. It is a real instrument, but it lives in
         the precedent library, so it is recorded as a historical executed
         document rather than bolted onto an operational contract — §9 requires
         a valid operational relationship, and sitting in a template folder is
         not one. */
      /* The project may have come from the extracted text or from reading the
         pages, and namesProject is true for either. Reaching only into the text
         list crashed once the read pass began supplying projects the extractor
         never found, so take whichever source actually produced a name. */
      const projName = (vf && vf.project) || (c.projectFromContent[0] && c.projectFromContent[0].project) || "";
      to = "HISTORICAL_EXECUTED_DOCUMENT";
      basis = "names " + c.parties.length + " parties, carries a date, and names the project " + projName
        + " — an executed instrument retained in the precedent library";
      safety = "SAFE_AUTO_RECLASSIFY";
    } else if (hasParties && hasDate) {
      to = "REFERENCE_EXECUTED_SAMPLE";
      basis = "executed between named parties but names no project — retained as a worked example";
      safety = "SAFE_AUTO_RECLASSIFY";
    } else if (vision.wasRead(c.fileId)) {
      /* Read end to end and still not determinable. That is a fact about the
         DOCUMENT, not a task for a person, so it is recorded as such (§30). */
      to = "UNRESOLVED_AFTER_FULL_DOCUMENT_ANALYSIS";
      basis = "every page was read and the document shows neither signatures nor draft markers";
      safety = "UNRESOLVED_AFTER_FULL_DOCUMENT_ANALYSIS";
    } else {
      to = "HUMAN_REVIEW_REQUIRED";
      basis = "shows some execution signals but not enough to be sure it is not a precedent";
      safety = "HUMAN_REVIEW_REQUIRED";
    }
    if (to !== "TEMPLATE") reclassifiedTemplates++;
    record({
      fileId: c.fileId, filename: c.filename, path: c.path,
      from: "TEMPLATE", to, basis, safety,
      evidence: [
        { field: "parties", value: c.parties, source: "document content", confidence: hasParties ? "HIGH" : "LOW" },
        { field: "agreementDate", value: c.agreementDate || c.executionDate || null, source: "document content", confidence: hasDate ? "HIGH" : "LOW" },
        { field: "projectInText", value: (c.projectFromContent || []).map((x) => x.project), source: "document content", confidence: namesProject ? "MEDIUM" : "LOW" },
        { field: "folder", value: "template library", source: "folder", confidence: "MEDIUM" },
      ],
    });
    if (to === "HUMAN_REVIEW_REQUIRED") {
      reviewQueue.push({
        fileId: c.fileId, filename: c.filename, drivePath: c.path,
        documentType: c.documentType, currentFolder: (c.path || "").split(" / ").slice(-1)[0],
        candidateA: "TEMPLATE (where it is filed)",
        candidateB: "an executed agreement",
        evidenceA: "filed in the Pakistan Contract Templates library",
        evidenceB: "parties: " + JSON.stringify(c.parties) + "; date: " + (c.agreementDate || "none"),
        whyAutomationCannotDecide: "it shows one execution signal but not both, and its name carries no draft marker",
        suggestedAction: "open it and mark template, executed-historical, or attach to a contract",
        reason: "template-vs-executed",
      });
    }
  }

  /* -------------------------------- §13-§16 the queued attachment conflicts */
  const projectConflicts = conflicts.filter((c) => c.trackerCandidate && !c.autoResolve);
  let attachResolved = 0;
  const reattachExtra = [];
  for (const cf of projectConflicts) {
    const c = byId.get(cf.fileId);
    if (!c || decided.has(cf.fileId)) continue;

    const folderProject = cf.folderCandidate;
    const contentProjects = cf.contentCandidate || [];
    const fileKey = norm(cf.name);
    const filenameAgrees = contentProjects.filter((p) => fileKey.includes(norm(p)));

    /* §15 — is this an executed, project-specific document, or a base draft
       copied from another project with its old text still inside? The two look
       identical to a keyword and are completely different facts. */
    const vfc = vision.identity(c.fileId);
    const execC = vision.executionState(c.fileId);
    /* Seen, not guessed. `executed` used to mean "names parties and carries a
       date", which is true of most drafts too. */
    const executed = execC.state === "EXECUTED"
      || (execC.state === null && (c.parties || []).length >= 2 && !!(c.agreementDate || c.executionDate));
    const draftish = execC.state === "NOT_EXECUTED"
      || (execC.state === null && (/\b(base draft|draft|template|standard|specimen|sample|v\d|version)\b/i.test(c.filename || "")
        || !(c.parties || []).length));
    // A project the PAGES name is identity evidence of its own.
    const visionProject = vfc && vfc.project ? vfc.project : null;

    /* A third, independent source: do OTHER documents in the same folder name
       the same project the content does? A lone odd document among siblings
       that all agree with the folder is a copy; a cluster is a misfiling. */
    const siblings = ctx.filter((x) => x.path === c.path && x.fileId !== c.fileId);
    const siblingAgreement = siblings.filter((s) => (s.projectFromContent || [])
      .some((p) => contentProjects.includes(p.project))).length;

    let safety, decision, basis;
    /* Strongest first: the pages show it signed AND name the other project. */
    if (execC.state === "EXECUTED" && visionProject
      && contentProjects.some((p) => norm(p) === norm(visionProject))
      && norm(visionProject) !== norm(folderProject)) {
      safety = "SAFE_AUTO_ATTACH";
      decision = "REATTACH to " + visionProject;
      basis = "read end to end: signed (" + execC.evidence + ") and the pages name project " + visionProject;
      reattachExtra.push({ fileId: c.fileId, filename: c.filename, fromProject: folderProject, toProject: visionProject });
      attachResolved++;
    } else if (execC.state === "NOT_EXECUTED") {
      safety = "LIKELY_DRAFT_COPY";
      decision = "KEEP where it is";
      basis = "read end to end: not executed — " + execC.evidence
        + "; stale project wording in an unsigned draft is expected and is not a misfiling";
      attachResolved++;
    } else if (executed && filenameAgrees.length === 1) {
      safety = "SAFE_AUTO_ATTACH";
      decision = "REATTACH to " + filenameAgrees[0];
      basis = "executed (named parties and a date), and the filename and the body agree on " + filenameAgrees[0];
      reattachExtra.push({ fileId: c.fileId, filename: c.filename, fromProject: folderProject, toProject: filenameAgrees[0] });
      attachResolved++;
    } else if (draftish && !executed) {
      safety = "LIKELY_DRAFT_COPY";
      decision = "KEEP where it is";
      basis = "reads as a base draft copied from another project — no parties and/or a draft marker in the name; "
        + "old project text inside a copied draft is expected and is not a misfiling";
      attachResolved++;
    } else if (siblingAgreement >= 2 && contentProjects.length === 1) {
      safety = "SOURCE_CONFLICT";
      decision = "HUMAN_REVIEW_REQUIRED";
      basis = siblingAgreement + " sibling documents in the same folder also name " + contentProjects[0]
        + " — the folder itself may be mislabelled, which is a bigger decision than one file";
    } else if (vision.wasRead(c.fileId)) {
      safety = "UNRESOLVED_AFTER_FULL_DOCUMENT_ANALYSIS";
      decision = "UNRESOLVED_AFTER_FULL_DOCUMENT_ANALYSIS";
      basis = "every page was read; the document names " + JSON.stringify(contentProjects)
        + " but shows no execution evidence and nothing else distinguishes the two candidates";
    } else {
      safety = "HUMAN_REVIEW_REQUIRED";
      decision = "HUMAN_REVIEW_REQUIRED";
      basis = "the body names " + JSON.stringify(contentProjects) + " but the filename does not corroborate it, "
        + "and it is neither clearly executed nor clearly a draft";
    }

    record({
      fileId: c.fileId, filename: c.filename, path: c.path,
      from: "attached to " + folderProject, to: decision, basis, safety,
      evidence: [
        { field: "folder", value: folderProject, source: "folder", confidence: "MEDIUM" },
        { field: "projectInText", value: contentProjects, source: "document content", confidence: "HIGH" },
        { field: "projectInFilename", value: filenameAgrees, source: "filename", confidence: filenameAgrees.length ? "HIGH" : "NONE" },
        { field: "siblingsNamingSameProject", value: siblingAgreement, source: "sibling documents", confidence: siblingAgreement >= 2 ? "MEDIUM" : "LOW" },
        { field: "executionSignals", value: { parties: (c.parties || []).length, date: c.agreementDate || null }, source: "document content", confidence: executed ? "HIGH" : "LOW" },
        { field: "signaturePage", value: execC.state, source: "every page read visually", evidence: execC.evidence, confidence: execC.state ? "CONFIRMED" : "NONE" },
        { field: "projectOnThePages", value: visionProject, source: "every page read visually", confidence: visionProject ? "HIGH" : "NONE" },
      ],
    });
    if (decision === "HUMAN_REVIEW_REQUIRED") {
      reviewQueue.push({
        fileId: c.fileId, filename: c.filename, drivePath: c.path,
        documentType: c.documentType, currentFolder: folderProject,
        candidateA: folderProject + " (current attachment, from the folder)",
        candidateB: contentProjects.join(" / ") + " (named inside the document)",
        evidenceA: "filed in that project's folder" + (siblingAgreement ? "; " + siblingAgreement + " siblings agree with the content instead" : ""),
        evidenceB: "the document's own text names " + contentProjects.join(", "),
        whyAutomationCannotDecide: filenameAgrees.length
          ? "content and filename agree but the document shows no execution signals — it may be a copied draft"
          : "only one source disagrees with the folder, which is not enough to move a document between projects",
        suggestedAction: "open it; if executed for " + (contentProjects[0] || "the other project") + ", reattach — if a draft copy, leave it",
        reason: "project-attachment",
      });
    }
  }

  /* ------------------- ingest: place documents the pages could identify -----
     A document that nothing had placed, whose pages name a project we hold, is
     now placeable. This is the point of reading them.

     THE BAR (§26/§28). Never a project name alone — a lease for Mall 35 and a
     PPA for Mall 35 are different instruments and a bare project name would
     attach both to the same record. Auto-attach requires:
       · the pages read at CONFIRMED or HIGH confidence, AND
       · a project we actually hold, AND
       · a SECOND independent fact — the entity, the counterparty, a property or
         unit reference, or an agreement number
     Anything less is recorded with its evidence and left unattached. */
  const visionAttach = [];
  let visionPlaced = 0, visionThin = 0;
  for (const c of ctx) {
    if (c.recordId) continue;                       // already placed
    const vf = vision.identity(c.fileId);
    if (!vf || !vf.project) continue;
    const conf = String(vf.confidence || "").toUpperCase();
    const target = projects.find((p) => {
      const pk = p.key, vk = norm(vf.project);
      return pk === vk || vk.includes(pk) || pk.includes(vk);
    });
    if (!target) continue;

    const corroboration = [];
    if (vf.entity) corroboration.push({ field: "entity", value: vf.entity });
    if (vf.counterparty) corroboration.push({ field: "counterparty", value: vf.counterparty });
    if (vf.propertyOrUnit) corroboration.push({ field: "propertyOrUnit", value: vf.propertyOrUnit });
    if (vf.agreementNumber) corroboration.push({ field: "agreementNumber", value: vf.agreementNumber });

    const strong = (conf === "CONFIRMED" || conf === "HIGH") && corroboration.length >= 1;
    if (strong) {
      visionPlaced++;
      visionAttach.push({
        fileId: c.fileId, filename: c.filename, toProject: target.name,
        confidence: conf, corroboration,
      });
    } else visionThin++;

    record({
      fileId: c.fileId, filename: c.filename, path: c.path,
      from: (dispById.get(c.fileId) || {}).disposition,
      to: strong ? "PROJECT_DOCUMENT (placed from the pages)" : "left unattached — identity too thin",
      basis: strong
        ? "the pages name project " + vf.project + " at " + conf + " confidence, corroborated by "
          + corroboration.map((x) => x.field).join(" and ")
        : "the pages name " + vf.project + " but at " + (conf || "unstated") + " confidence with "
          + corroboration.length + " corroborating fact(s) — a project name alone does not identify an instrument",
      safety: strong ? "SAFE_AUTO_ATTACH" : "UNRESOLVED_AFTER_FULL_DOCUMENT_ANALYSIS",
      evidence: [
        { field: "projectOnThePages", value: vf.project, source: "pages read visually", confidence: conf },
        ...corroboration.map((x) => Object.assign({}, x, { source: "pages read visually", confidence: conf })),
        { field: "documentType", value: vision.documentType(c.fileId), source: "pages read visually", confidence: conf },
      ],
    });
  }
  if (visionAttach.length) {
    fs.writeFileSync(P.join(AUD, "commercial-vision-attach.json"), JSON.stringify(visionAttach, null, 1));
  }

  /* --------------------------------------- §22/§23 multi-record validation */
  const multi = [];
  {
    const holders = new Map();
    for (const fam of ["contracts", "properties"]) {
      for (const r of regs[fam] || []) for (const d of r.driveFiles || []) {
        if (!holders.has(d.id)) holders.set(d.id, []);
        holders.get(d.id).push({ fam, id: r.id, via: d.via, title: r.title || r.project });
      }
    }
    for (const [fileId, hs] of holders) {
      if (hs.length < 2) continue;
      const f = drive.fileById(fileId);
      if (!f || !/^Commercial/.test(f.root || "")) continue;
      const vias = [...new Set(hs.map((h) => h.via))];
      /* A document may be held by several records only on evidence the SOURCE
         provides: a tracker citation, or one project folder whose rows are
         genuinely the same project. A token guess may never be shared. */
      const cited = vias.includes("filename");
      const sameProject = new Set(hs.map((h) => norm(h.title))).size === 1;
      const guessed = vias.some((v) => v === "match" || v === "content");
      const strength = cited ? "CITED_BY_SOURCE"
        : sameProject ? "SAME_PROJECT_ROWS"
          : guessed ? "WEAK_GUESS_SHARED" : "FOLDER_SHARED";
      multi.push({
        fileId, filename: f.name, holders: hs.length,
        records: hs.map((h) => h.fam + "/" + h.id), vias, strength,
        distinctTitles: [...new Set(hs.map((h) => h.title))].slice(0, 4),
      });
    }
  }
  const weakMulti = multi.filter((m) => m.strength === "WEAK_GUESS_SHARED");

  /* ------------------------------------------- §24/§25 chain confidence --- */
  const chains = A("commercial-contract-lineage.json").map((ch) => {
    const docs = ch.chain.map((x) => byId.get(x.fileId)).filter(Boolean);
    const withParent = docs.filter((d) => d.parentReference).length;
    const numbered = docs.filter((d) => d.amendmentNumber).length;
    const dated = docs.filter((d) => d.agreementDate).length;
    const projects2 = new Set(docs.flatMap((d) => (d.projectFromContent || []).map((p) => p.project)));
    const sameProject = projects2.size <= 1;
    /* FOUR grades, because "not confirmed" is not the same as "needs a person".
       Most of these groups are simply the contents of one project folder that
       happen to carry lifecycle stages — a listing, not a proven sequence.
       Calling 28 of them HUMAN_REVIEW_CHAIN put work in a queue that no human
       action would resolve, while burying the handful that genuinely are
       ambiguous. A chain is only operational when a document says what it
       amends. */
    let grade;
    if (withParent >= 1 && sameProject) grade = "CONFIRMED_CHAIN";
    else if (numbered >= 1 && sameProject) grade = "PROBABLE_CHAIN";
    else if (!sameProject) grade = "HUMAN_REVIEW_CHAIN";      // names more than one project: genuinely ambiguous
    else grade = "FOLDER_GROUPED";                            // a folder listing, not a claim about sequence
    return {
      project: ch.project, length: ch.chain.length, grade,
      parentReferences: withParent, numbered, dated,
      projectsNamed: [...projects2].slice(0, 3),
      steps: ch.chain.map((s) => ({ stage: s.stage, no: s.amendmentNumber, date: s.agreementDate, filename: s.filename })),
    };
  });

  /* ------------------------------------------------------------- outputs -- */
  fs.writeFileSync(P.join(AUD, "commercial-resolutions.json"), JSON.stringify(outcomes, null, 1));
  fs.writeFileSync(P.join(AUD, "commercial-review-queue.json"), JSON.stringify(reviewQueue, null, 1));
  fs.writeFileSync(P.join(AUD, "commercial-multirecord.json"), JSON.stringify(multi, null, 1));
  fs.writeFileSync(P.join(AUD, "commercial-chain-confidence.json"), JSON.stringify(chains, null, 1));
  if (reattachExtra.length) {
    const prev = (() => { try { return JSON.parse(fs.readFileSync(P.join(AUD, "commercial-reattach.json"), "utf8")); } catch (e) { return []; } })();
    const seen = new Set(prev.map((p) => p.fileId + "->" + p.toProject));
    for (const r of reattachExtra) if (!seen.has(r.fileId + "->" + r.toProject)) prev.push(r);
    fs.writeFileSync(P.join(AUD, "commercial-reattach.json"), JSON.stringify(prev, null, 1));
  }

  const bySafety = {};
  for (const o of outcomes) bySafety[o.safety] = (bySafety[o.safety] || 0) + 1;

  say("=== COMMERCIAL RESOLUTION ===\n");
  say("§10 non-commercial contamination   : " + contamination);
  say("§8  executed docs moved off TEMPLATE: " + reclassifiedTemplates + " of " + templates.filter((t) => t.verdict === "LOOKS_EXECUTED_REVIEW").length);
  say("§13 queued attachments decided      : " + attachResolved + " of " + projectConflicts.length);
  say("\n§16 review-safety classification");
  for (const [k, v] of Object.entries(bySafety).sort((a, b) => b[1] - a[1])) say("      " + String(v).padStart(4) + "  " + k);
  say("\ningest from the pages");
  say("      placed on a project           : " + visionPlaced);
  say("      identity too thin to place    : " + visionThin);
  say("\n§22 multi-record links             : " + multi.length);
  const byStrength = {};
  for (const m of multi) byStrength[m.strength] = (byStrength[m.strength] || 0) + 1;
  for (const [k, v] of Object.entries(byStrength).sort((a, b) => b[1] - a[1])) say("      " + String(v).padStart(4) + "  " + k);
  say("      WEAK (must be zero)          : " + weakMulti.length);
  const byHolders = {};
  for (const m of multi) { const k = m.holders >= 4 ? "4+" : String(m.holders); byHolders[k] = (byHolders[k] || 0) + 1; }
  say("      by holder count: " + JSON.stringify(byHolders));
  say("\n§24 contract chains                : " + chains.length);
  const byGrade = {};
  for (const c of chains) byGrade[c.grade] = (byGrade[c.grade] || 0) + 1;
  for (const [k, v] of Object.entries(byGrade).sort((a, b) => b[1] - a[1])) say("      " + String(v).padStart(4) + "  " + k);
  say("\n§12 review queue (actionable)      : " + reviewQueue.length);
  const byReason = {};
  for (const r of reviewQueue) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  for (const [k, v] of Object.entries(byReason)) say("      " + String(v).padStart(4) + "  " + k);
  say("\n  wrote commercial-resolutions / review-queue / multirecord / chain-confidence");
})().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });
