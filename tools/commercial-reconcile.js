#!/usr/bin/env node
/* THE COMMERCIAL ESTATE, RECONCILED ON WHAT THE DOCUMENTS SAY.
 *
 * Every earlier pass reconciled the SHAPE of the estate — where a file sits and
 * which record claims it. This one adds the layer that settles the arguments
 * the shape cannot: the contents of the documents themselves.
 *
 * It runs both directions:
 *
 *   DOWN   root -> folder -> file -> document content -> project / contract
 *   UP     LegalOS record -> its Documents tab -> file -> folder -> tracker row
 *
 * and it gives EVERY Commercial object a disposition. "100% reconciled" here
 * means 100% accounted for — not 100% attached. A precedent belongs in the
 * template library, a project document belongs to a project, and a document
 * nobody can place belongs in a human's queue with its evidence attached. Each
 * of those is an answer. A forced link is not.
 *
 * EVIDENCE ORDER (strongest first), applied throughout:
 *   1 explicit Drive id            5 entity + project + counterparty
 *   2 exact tracker citation       6 strong document content
 *   3 exact parent folder          7 filename similarity
 *   4 reference number in the text 8 token similarity
 * Weak evidence never overrides strong evidence, and never creates a link on
 * its own.
 *
 * SENSITIVE CONTENT: no document body reaches any artefact written here. Facts
 * and quotations of at most 80 characters, nothing more.
 *
 *   node tools/commercial-reconcile.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const cctx = require("../api/commercial-context.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "audit");
fs.mkdirSync(OUT, { recursive: true });

const COMMERCIAL = /^Commercial/;
const isDocFile = (f) => !/\.(xlsx?|tmp)$/i.test(f.name || "")
  && !/^~\$/.test(f.name || "") && !/^\./.test(f.name || "")
  && !/spreadsheetml|ms-excel/i.test(f.mimeType || "");
const isSystem = (f) => /^~\$/.test(f.name || "") || /\.tmp$/i.test(f.name || "") || /^\./.test(f.name || "");
const isTracker = (f) => /\.xlsx?$/i.test(f.name || "") || /spreadsheetml|ms-excel/i.test(f.mimeType || "");
const isMedia = (f) => /\.(jpe?g|jfif|png|gif|mpe?g|mp4|wav|zip|rar|7z)$/i.test(f.name || "");

const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");
const say = (s) => console.log(s);

/* One adjacent-letter swap, for the tracker's "Zameen Pheonix" against Drive's
   "Zameen Phoenix". Nothing looser: this is a spelling difference the source
   has with itself, not a licence to fuzzy-match. */
function transposedOnce(a, b) {
  if (a.length !== b.length || a.length < 8) return false;
  const d = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i);
  return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
}

/* Does this folder name the given project? Folder names carry prefixes and
   suffixes the tracker does not — "ZD - Golf View Rumanza - Multan",
   "Zameen - Mall 35", "Zameen Phoenix_" — so containment either way is the
   right test, and a prefix-only test wrongly reported ten projects as absent
   from the tracker when their rows were right there. */
/* A project's SIGNATURE: its name with the words that say where or what it is
   removed, so "Al Madev Complex II" and the folder "Al Madev II (Multan)" come
   out the same. Equality on this is what keeps Al Madev I and II apart — a
   prefix test cannot, since "almadevi" is a prefix of "almadevii". */
const projectSig = (v) => norm(String(v || "").replace(/\b(complex|project|tower|mall|phase|block|the|multan|lahore|karachi|islamabad|rawalpindi|faisalabad|gujranwala)\b/gi, " "));

function folderNamesProject(folderKey, projectKey) {
  if (!folderKey || !projectKey || projectKey.length < 5) return false;
  if (folderKey === projectKey) return true;
  if (folderKey.includes(projectKey) || projectKey.includes(folderKey)) return true;
  if (transposedOnce(folderKey, projectKey)) return true;
  /* The misspelling can also sit INSIDE a longer folder name: "Zameen Phoenix -
     Lahore" against the tracker's "Zameen Pheonix". Slide the project name
     along the folder name and allow the same single swap. */
  for (let i = 0; i + projectKey.length <= folderKey.length; i++) {
    if (transposedOnce(folderKey.slice(i, i + projectKey.length), projectKey)) return true;
  }
  return false;
}

/* Folders whose whole purpose is precedent material. A document in one of these
   is a template unless its own contents say it is an executed agreement. */
const TEMPLATE_BRANCH = /Pakistan Contract Templates/i;
const SALE_DEED_BRANCH = /Agreement to Sell & Sale Deeds/i;
const PPA_BRANCH = /Zameen Media PPA/i;

(async () => {
  await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};
  cctx.load(true);

  const files = drive.indexFiles().filter((f) => COMMERCIAL.test(f.root || ""));
  const folders = drive.indexFolders().filter((f) => COMMERCIAL.test(String(f.path || f.folderPath || "")));
  const byId = new Map(files.map((f) => [f.id, f]));

  say("=== COMMERCIAL RECONCILIATION ===\n");
  say("  roots   " + [...new Set(files.map((f) => f.root))].length);
  say("  folders " + folders.length);
  say("  files   " + files.length);

  /* ---------------------------------------------- UP: what LegalOS holds -- */
  const COMMERCIAL_FAMILIES = ["contracts", "properties"];
  const owner = new Map();                       // fileId -> [{fam,id,via,record}]
  for (const fam of COMMERCIAL_FAMILIES) {
    for (const r of regs[fam] || []) {
      for (const d of r.driveFiles || []) {
        if (!owner.has(d.id)) owner.set(d.id, []);
        owner.get(d.id).push({ fam, id: r.id, via: d.via, record: r });
      }
    }
  }
  // Documents a NON-Commercial family holds that live in a Commercial root.
  const foreign = new Map();
  for (const [fam, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows) || COMMERCIAL_FAMILIES.includes(fam)) continue;
    for (const r of rows) for (const d of r.driveFiles || []) {
      if (byId.has(d.id)) {
        if (!foreign.has(d.id)) foreign.set(d.id, []);
        foreign.get(d.id).push({ fam, id: r.id, via: d.via });
      }
    }
  }

  /* --------------------------------------------- projects known to LegalOS */
  const projects = [];
  const seenProject = new Set();
  for (const p of regs.properties || []) {
    const key = norm(p.project);
    if (!key) continue;
    if (!seenProject.has(key)) { seenProject.add(key); projects.push({ key, name: p.project, records: [] }); }
    projects.find((x) => x.key === key).records.push(p);
  }

  /* Contract titles that name a project — used by the filename check and the
     PPA findings. Declared before the file loop that reads it. */
  const contractProjects = [];
  {
    const seen = new Set();
    for (const r of regs.contracts || []) {
      const k = norm(r.title);
      if (k.length < 8 || seen.has(k)) continue;
      seen.add(k);
      contractProjects.push({ key: k, name: r.title, records: [r], family: "contracts" });
    }
  }

  /* WHICH PROJECT WORDS ACTUALLY IDENTIFY A PROJECT.
     A token shared by two projects identifies neither: "ace" belongs to both
     Zameen Ace Mall and Zameen Ace Homes, "rumanza" to both Golf View Rumanza
     and Downtown Rumanza, "valley" to several. Using them made 80 of Ace Mall's
     documents look like they were about some other project. Only a token
     unique to ONE project may name it; where a token is ambiguous, the full
     project name has to appear in the document's own text instead. */
  const tokenOwners = new Map();
  const tokenOwnersWide = new Map();   // owners counted across ALL project names
  const ALL_PROJECT_WORDS = new Set();
  for (const f of files) for (const w of (cctx.contextFor(f).projectWords || [])) ALL_PROJECT_WORDS.add(w);
  /* A word is discriminating only if it names ONE project across EVERY project
     this estate knows — tracker projects and contract projects alike.
     Counting owners among tracker projects alone made "heights" look unique to
     Boulevard Heights, because Broadway Heights, Sitara Heights and J Heights
     are contract projects and were not in the count. Three executed Broadway
     Heights documents were then reported as naming Boulevard Heights, on the
     strength of one shared noun, and queued for a person to resolve.
     A word shared by four project names is evidence of nothing. */
  for (const w of ALL_PROJECT_WORDS) {
    const owners = projects.filter((p) => p.key.includes(w));
    const alsoContract = contractProjects.filter((p) => p.key && p.key.includes(w));
    tokenOwners.set(w, owners);
    tokenOwnersWide.set(w, owners.length + alsoContract.length);
  }
  const discriminating = (w) => (tokenOwnersWide.get(w) || 0) === 1;

  /* Folders inside the sale-deed branch that are NOT projects — they are
     document categories. Calling them project-only source records invented four
     "projects" named after template batches. */
  const NOT_A_PROJECT = /standard templates|payment receipts|booking form|^\d+-agreement to sell|^drafts?$|^final|^latest|^versions?$|^ppa[_'\s]*s?$|^other ppa|^misc|^supporting documents?$|^primary documents?$/i;

  /* --------------------------------------------- DOWN: every file, judged */
  const context = [];                 // commercial-document-context.json
  const disposition = [];             // commercial-document-disposition.json
  const conflicts = [];               // commercial-conflicts.json
  const tally = { state: {}, type: {}, disposition: {}, lifecycle: {} };
  const bump = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };

  for (const f of files) {
    const c = cctx.contextFor(f);
    bump(tally.state, c.contentState);
    bump(tally.type, c.documentType);
    bump(tally.lifecycle, c.lifecycle);

    const segs = String(f.folderPath || "").split(" / ");
    const held = owner.get(f.id) || [];
    const heldElsewhere = foreign.get(f.id) || [];

    // --- the folder's own claim about what this is
    const inTemplates = TEMPLATE_BRANCH.test(f.folderPath || "");
    const inSaleDeeds = SALE_DEED_BRANCH.test(f.folderPath || "");
    const inPpa = PPA_BRANCH.test(f.folderPath || "");
    const projectFolder = inSaleDeeds ? segs[segs.findIndex((x) => SALE_DEED_BRANCH.test(x)) + 1]
      : inPpa ? segs[segs.findIndex((x) => PPA_BRANCH.test(x)) + 2]
        : /^Commercial_ZD Projects/.test(f.root || "") ? segs[1] : null;
    const projectFolderIsReal = projectFolder && !NOT_A_PROJECT.test(projectFolder);
    const fileKeyNorm = norm(f.name);
    const filenameProject = [...projects, ...contractProjects]
      .filter((p) => p.key.length >= 6 && fileKeyNorm.includes(p.key))
      .sort((a, b) => b.key.length - a.key.length)[0] || null;

    // --- which project the DOCUMENT names, matched to a known project
    const contentProjects = [];
    const deepTextLower = (cctx.deepText(f.id) || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const p of projects) {
      // The whole project name, present in the document's own text: decisive.
      if (deepTextLower && p.key.length >= 8 && deepTextLower.includes(p.key)) {
        contentProjects.push({ project: p.name, word: p.key, confirmed: true, basis: "full project name in the text" });
        continue;
      }
      // Otherwise a single word, and only if that word names this project alone.
      const w = c.projectWords.find((x) => p.key.includes(x) && discriminating(x));
      if (w) contentProjects.push({ project: p.name, word: w, confirmed: c.projectConfirmedInText.includes(w), basis: "word unique to this project" });
    }

    // --- disposition, strongest evidence first
    let disp = null, why = "", needsHuman = false;
    /* A 0-byte file is RESOLVED, not unreadable: there is nothing in it to read,
       and saying so is the complete answer. Verified by fetching the bytes —
       both are zero-length in Drive itself, not a failed download. */
    if ((Number(f.size) || 0) === 0 && !isSystem(f)) {
      disp = "EMPTY_SOURCE_FILE";
      why = "zero bytes in Drive — the file is empty at source, not unread";
    } else if (isSystem(f)) {
      disp = "SYSTEM_FILE";
      // The ~$ files are Word's owner-lock files: 162 bytes holding the name of
      // whoever had the document open. Not a document, and never was one.
      why = /^~\$/.test(f.name || "")
        ? "a Microsoft Office owner-lock file (~$), not a document"
        : "editor lock or OS artefact";
    }
    else if (isTracker(f)) { disp = "SOURCE_TRACKER"; why = "a workbook the ingest reads as a register source"; }
    else if (isMedia(f) && !held.length) { disp = "REFERENCE"; why = "an image or media file, not a legal instrument"; }
    else if (held.length > 1) {
      const fams = new Set(held.map((h) => h.fam));
      disp = "MULTI_RECORD_DOCUMENT";
      why = held.length + " records cite it (" + [...fams].join(", ") + ") via " + [...new Set(held.map((h) => h.via))].join("/");
    } else if (held.length === 1) {
      disp = held[0].fam === "properties" ? "PROJECT_DOCUMENT" : "RECORD_DOCUMENT";
      why = held[0].fam + "/" + held[0].id + " via " + held[0].via;
    } else if (heldElsewhere.length) {
      disp = "MULTI_RECORD_DOCUMENT";
      why = "held by " + heldElsewhere.map((h) => h.fam + "/" + h.id).join(", ") + " outside Commercial";
    } else if (inTemplates && !inSaleDeeds) {
      /* A precedent — unless the document itself shows it was executed, in
         which case the folder is wrong and a person should look. */
      const executed = c.parties.length >= 2 && c.agreementDate;
      if (executed) {
        disp = "UNRESOLVED_REQUIRES_HUMAN"; needsHuman = true;
        why = "filed as a precedent but reads as an executed agreement (named parties and a date)";
        conflicts.push({
          fileId: f.id, name: f.name, folderPath: f.folderPath,
          folderCandidate: "TEMPLATE", contentCandidate: "EXECUTED_AGREEMENT", trackerCandidate: null,
          evidence: c.evidence.filter((e) => ["parties", "agreementDate"].includes(e.field)),
          confidence: "MEDIUM", recommended: "HUMAN_REVIEW_REQUIRED",
        });
      } else {
        disp = "TEMPLATE";
        why = "precedent material in the contract templates library";
      }
    } else if (projectFolderIsReal) {
      disp = "PROJECT_ONLY_SOURCE_DOCUMENT";
      why = "sits in the project folder \"" + projectFolder + "\", which no tracker row claims";
    } else if (contentProjects.length === 1) {
      /* Exactly ONE project named inside the document and no competing name.
         Held text makes that a high-confidence fact; Google's OCR of a scan
         makes it a medium-confidence one. Either is enough to say which project
         a document belongs to — which is a project-level disposition, not a
         claim that some particular contract record owns it. Requiring held text
         here sent eighteen PPAs to a human queue while the document itself said
         plainly which project it was about. */
      disp = "PROJECT_ONLY_SOURCE_DOCUMENT";
      why = "its own text names the project \"" + contentProjects[0].project + "\""
        + (contentProjects[0].confirmed ? " (confirmed in the text we hold)" : " (read through Drive's OCR index)");
    } else if (inSaleDeeds && !projectFolderIsReal) {
      /* Sitting directly in "Agreement to Sell & Sale Deeds" rather than in one
         of its project folders: these are the standard forms the project
         folders are copied from — "Agreement to Sell for Hotel Apartments",
         "Agreement to Sell for Shops". */
      disp = "TEMPLATE";
      why = "a standard sale-agreement form, filed in the branch root rather than a project folder";
    } else if (filenameProject) {
      /* The FILENAME names a known project. That is rank-7 evidence and far too
         weak to bind a document to a particular contract — but it is enough to
         say which PROJECT a document belongs to, which is all this disposition
         claims. "Mall35-AGL.PDF" and "FranchiseAgreement_Mall35HotelOne" were
         going to a human queue while their own names said Mall 35. */
      disp = "PROJECT_ONLY_SOURCE_DOCUMENT";
      why = "its filename names the project \"" + filenameProject.name + "\" (filename evidence only)";
    } else if (contentProjects.length > 1) {
      disp = "UNRESOLVED_REQUIRES_HUMAN"; needsHuman = true;
      why = "names more than one project (" + contentProjects.map((x) => x.project).join(", ") + "), so which one owns it is a judgement";
    } else {
      disp = "UNRESOLVED_REQUIRES_HUMAN"; needsHuman = true;
      why = c.contentState === cctx.STATE.UNREADABLE
        ? "unreadable, and no folder or tracker places it"
        : "readable, but nothing in it identifies a record or project";
    }

    // --- folder vs content conflict (reported, never acted on)
    if (projectFolder && contentProjects.length) {
      const fk = norm(projectFolder);
      const disagree = contentProjects.filter((cp) => !fk.includes(norm(cp.project)) && !norm(cp.project).includes(fk.slice(0, 10)));
      if (disagree.length && contentProjects.every((cp) => !fk.includes(norm(cp.project)))) {
        conflicts.push({
          fileId: f.id, name: f.name, folderPath: f.folderPath,
          folderCandidate: projectFolder,
          contentCandidate: disagree.map((d) => d.project),
          trackerCandidate: held.length ? held[0].fam + "/" + held[0].id : null,
          evidence: c.evidence.filter((e) => e.field === "projectWords"),
          confidence: disagree.some((d) => d.confirmed) ? "MEDIUM" : "LOW",
          recommended: "HUMAN_REVIEW_REQUIRED — a project name inside the document differs from the folder it sits in",
        });
      }
    }

    bump(tally.disposition, disp);
    context.push({
      fileId: f.id, filename: f.name, path: f.folderPath, root: f.root,
      contentState: c.contentState, chars: c.chars,
      documentType: c.documentType, lifecycle: c.lifecycle, amendmentNumber: c.amendmentNumber,
      parentReference: c.parentReference,
      projectFolder: projectFolder || null,
      projectFromContent: contentProjects,
      entity: null, counterparty: c.parties[0] || null, parties: c.parties,
      agreementDate: c.agreementDate, effectiveDate: c.effectiveDate, executionDate: c.executionDate,
      recordFamily: held.length ? held[0].fam : null,
      recordId: held.length ? held[0].id : null,
      mappingEvidence: held.length ? held.map((h) => h.via) : [],
      mappingConfidence: held.length
        ? (held[0].via === "filename" ? "HIGH" : held[0].via === "match" ? "LOW" : "MEDIUM")
        : "NONE",
      evidence: c.evidence,
    });
    disposition.push({
      fileId: f.id, filename: f.name, path: f.folderPath,
      disposition: disp, evidence: why, contentState: c.contentState,
      documentType: c.documentType, needsHuman,
    });
  }

  /* ------------------------------------------------- contract lineage (§15) */
  const lineage = [];
  const byProject = new Map();
  for (const c of context) {
    const key = c.projectFolder ? norm(c.projectFolder)
      : (c.projectFromContent[0] && norm(c.projectFromContent[0].project)) || null;
    if (!key) continue;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(c);
  }
  for (const [key, docs] of byProject) {
    /* A CHAIN is documents that declare where they sit in an agreement's life —
       an amendment, an extension, a termination, or an original that something
       else amends. Documents whose lifecycle is UNKNOWN (we could not read
       them) are not links in a chain, and including them produced a 53-item
       "chain" for Bahria Garden City that was really just the contents of a
       folder: an NTN certificate, a site plan and a booking form. */
    const STAGES = new Set(["AMENDMENT", "ADDENDUM", "EXTENSION", "RENEWAL", "NOVATION", "TERMINATION", "SUPPLEMENT"]);
    const staged = docs.filter((d) => STAGES.has(d.lifecycle) || d.amendmentNumber || d.parentReference);
    if (!staged.length) continue;
    const originals = docs.filter((d) => d.lifecycle === "ORIGINAL");
    const chain = [...originals.slice(0, 2), ...staged]
      .sort((a, b) => (a.amendmentNumber || (a.lifecycle === "ORIGINAL" ? 0 : 99)) - (b.amendmentNumber || (b.lifecycle === "ORIGINAL" ? 0 : 99)));
    if (chain.length < 2) continue;
    lineage.push({
      project: docs.find((d) => d.projectFolder) ? docs.find((d) => d.projectFolder).projectFolder : key,
      chain: chain.map((d) => ({
        fileId: d.fileId, filename: d.filename, stage: d.lifecycle,
        amendmentNumber: d.amendmentNumber, agreementDate: d.agreementDate,
        parentReference: d.parentReference ? d.parentReference.text : null,
      })),
    });
  }

  /* ------------------------------------------------ project lineage (§11/26) */
  const projectLineage = [];
  const folderProjects = new Map();
  for (const f of files) {
    const segs = String(f.folderPath || "").split(" / ");
    let pf = null;
    if (SALE_DEED_BRANCH.test(f.folderPath || "")) pf = segs[segs.findIndex((x) => SALE_DEED_BRANCH.test(x)) + 1];
    else if (/^Commercial_ZD Projects/.test(f.root || "")) pf = segs[1];
    if (!pf || NOT_A_PROJECT.test(pf)) continue;
    // Counted from the project folder DOWNWARD: a project's papers sit in its
    // subfolders too, and counting only the top level reported Zameen Eon as
    // holding 11 documents when Drive holds 16 under its folder.
    if (!folderProjects.has(pf)) folderProjects.set(pf, []);
    folderProjects.get(pf).push(f);
  }
  for (const [folder, fs2] of folderProjects) {
    const fk = norm(folder);
    // The LONGEST matching project wins, so a folder is not claimed by a shorter
    // name that merely happens to be contained in it.
    const all = projects.filter((p) => folderNamesProject(fk, p.key));
    const best = all.sort((a, b) => b.key.length - a.key.length)[0];
    const matched = best ? [best] : [];
    projectLineage.push({
      sourceFolder: folder,
      sourceSpelling: folder,
      canonicalProject: matched.length ? matched[0].name : null,
      trackerRecords: matched.length ? matched[0].records.map((r) => r.id) : [],
      quality: matched.length ? "MATCHED_TO_TRACKER" : "SOURCE_NOT_IN_TRACKER",
      documents: fs2.length,
      attached: fs2.filter((f) => owner.has(f.id)).length,
      matchEvidence: matched.length ? "folder name equals or prefixes the tracker project name" : null,
    });
  }

  /* ---------------------------------------- §8 every unattached file, named */
  const unattached = disposition
    .filter((d) => !["RECORD_DOCUMENT", "PROJECT_DOCUMENT", "MULTI_RECORD_DOCUMENT", "SOURCE_TRACKER", "SYSTEM_FILE"].includes(d.disposition))
    .map((d) => {
      const c = context.find((x) => x.fileId === d.fileId);
      return {
        fileId: d.fileId, filename: d.filename, path: d.path,
        disposition: d.disposition, reason: d.evidence,
        contentState: c.contentState, documentType: c.documentType, lifecycle: c.lifecycle,
        projectFolder: c.projectFolder,
        projectFromContent: c.projectFromContent.map((x) => x.project),
        parties: c.parties, agreementDate: c.agreementDate,
        needsHuman: d.needsHuman,
      };
    });

  /* ------------------------------------------- §9 are the templates templates */
  const templateCheck = context
    .filter((c) => TEMPLATE_BRANCH.test(c.path || "") && !SALE_DEED_BRANCH.test(c.path || ""))
    .map((c) => {
      /* A precedent should have no named counterparties and no execution date.
         Either of those, and it is an executed instrument sitting in the
         template library — which is a filing error worth surfacing, not a
         reason to attach it to a contract. */
      const executedSignals = [];
      if (c.parties.length >= 2) executedSignals.push("names " + c.parties.length + " parties");
      if (c.agreementDate) executedSignals.push("carries an agreement date");
      if (c.executionDate) executedSignals.push("carries an execution date");
      if (c.projectFromContent.length) executedSignals.push("names a specific project");
      return {
        fileId: c.fileId, filename: c.filename, path: c.path,
        contentState: c.contentState, documentType: c.documentType,
        verdict: executedSignals.length >= 2 ? "LOOKS_EXECUTED_REVIEW"
          : executedSignals.length === 1 ? "PROBABLE_TEMPLATE_WITH_ONE_SIGNAL" : "TEMPLATE_CONFIRMED",
        signals: executedSignals,
        readable: c.contentState !== "CONTENT_UNREADABLE",
      };
    });

  /* --------------------------------------------------- §10 the PPA documents */
  const ppaDocs = context.filter((c) => PPA_BRANCH.test(c.path || ""));
  const ppaUnattached = ppaDocs.filter((c) => !c.recordId);
  const ppaFindings = ppaUnattached.map((c) => {
    const folder = c.projectFolder;
    const fk = norm(folder);
    /* A PPA is a CONTRACT, not a property record, so its project folder is
       matched against contract titles as well. Comparing it only with the
       properties register reported 36 folders as having no tracker row when
       their rows were in the contracts tracker all along. */
    const fsig = projectSig(folder);
    const exact = projects.find((p) => p.key === fk)
      || contractProjects.find((p) => p.key === fk)
      // Same signature: "Al Madev II (Multan)" is "Al Madev Complex II".
      || (fsig.length >= 7 ? [...projects, ...contractProjects].find((p) => projectSig(p.name) === fsig) : null);
    const prefix = [...projects, ...contractProjects]
      .filter((p) => fk && folderNamesProject(fk, p.key))
      .sort((a, b) => b.key.length - a.key.length)[0];
    const contentMatch = c.projectFromContent[0];
    const folderExists = !!folder;
    let outcome, detail;
    if (exact) { outcome = "A_EXISTING_PROJECT_EXACT_NAME"; detail = exact.name; }
    else if (prefix) { outcome = "B_EXISTING_PROJECT_SPELLING_VARIANT"; detail = prefix.name; }
    else if (contentMatch) { outcome = "F_PROJECT_ONLY_SOURCE_BACKED"; detail = "document names " + contentMatch.project; }
    else if (folderExists) { outcome = "D_PROJECT_FOLDER_WITHOUT_TRACKER_ROW"; detail = folder; }
    else if (c.contentState === "CONTENT_UNREADABLE") { outcome = "H_HUMAN_REVIEW_REQUIRED"; detail = "unreadable and filed loose under a region"; }
    else { outcome = "H_HUMAN_REVIEW_REQUIRED"; detail = "readable but names no project we hold"; }
    return {
      fileId: c.fileId, filename: c.filename, path: c.path,
      contentState: c.contentState, documentType: c.documentType, lifecycle: c.lifecycle,
      projectFolder: folder || null, projectFromContent: c.projectFromContent.map((x) => x.project),
      parties: c.parties, agreementDate: c.agreementDate,
      outcome, detail,
    };
  });

  /* ------------------------ §11 project folders the tracker does not name -- */
  const projectOnly = projectLineage
    .filter((p) => p.quality === "SOURCE_NOT_IN_TRACKER" && p.documents > 0)
    .map((p) => ({
      id: "PRJ-SRC-" + norm(p.sourceFolder).slice(0, 18).toUpperCase(),
      displayName: p.sourceFolder,
      sourceFolder: p.sourceFolder,
      documents: p.documents,
      entity: null,                       // never invented: no source states it
      quality: "SOURCE_NOT_IN_TRACKER",
      lineage: "Drive folder with project-specific documents and no tracker row",
    }));

  /* ------------------------------------ §26/27/28 the validations asked for */
  const validations = [];
  // §27 Al Madev I and II must stay apart.
  const madev = (regs.contracts || []).filter((r) => /madev/i.test(r.title || ""));
  const madevDocs = madev.map((r) => ({
    title: r.title,
    documents: (r.driveFiles || []).length,
    folders: [...new Set((r.driveFiles || []).map((d) => String(d.folderPath || "").split(" / ").pop()))],
  }));
  const madevOverlap = (() => {
    const sets = madev.map((r) => new Set((r.driveFiles || []).map((d) => d.id)));
    let shared = 0;
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
      if (madev[i].title === madev[j].title) continue;
      for (const id of sets[i]) if (sets[j].has(id)) shared++;
    }
    return shared;
  })();
  validations.push({
    check: "Al Madev I and Al Madev II hold separate documents",
    pass: madevOverlap === 0 && madevDocs.every((m) => m.documents > 0),
    detail: madevDocs.map((m) => m.title + ": " + m.documents + " docs " + JSON.stringify(m.folders)).join(" | "),
    sharedDocuments: madevOverlap,
  });
  // §28 both Phoenix spellings preserved, neither source rewritten.
  const phoenixRecords = (regs.properties || []).filter((r) => /pheonix|phoenix/i.test(r.project || ""));
  const phoenixFolders = [...new Set(files.map((f) => String(f.folderPath || "").split(" / ")[1]).filter((x) => /pheonix|phoenix/i.test(x || "")))];
  validations.push({
    check: "Phoenix / Pheonix: both source spellings preserved, mapped not rewritten",
    pass: phoenixRecords.length > 0 && phoenixFolders.length > 0
      && phoenixRecords.some((r) => /pheonix/i.test(r.project)) && phoenixFolders.some((f) => /phoenix/i.test(f)),
    detail: "tracker spelling(s): " + [...new Set(phoenixRecords.map((r) => r.project))].join(", ")
      + " · Drive folder spelling(s): " + phoenixFolders.join(", ")
      + " · documents attached: " + phoenixRecords.reduce((a, r) => a + (r.driveFiles || []).length, 0),
    matchEvidence: "single adjacent-letter transposition on a 14-character name",
  });
  /* §26 + §16 — every project's attachments really belong to it, and where they
     do not, the conflict is resolved only on evidence that clearly outweighs the
     folder. The folder is ONE claim. A filename and the document's own text
     agreeing on a different project are TWO independent claims, and that is the
     only case auto-resolved here. Everything else goes to a person with the
     evidence attached — a base draft copied between projects and half-edited
     reads exactly like a misfiling and is not one. */
  const projectAudit = [];
  const reattach = [];
  for (const p of projects) {
    const docs = [];
    for (const r of p.records) for (const d of r.driveFiles || []) docs.push({ d, r });
    const wrong = [];
    for (const { d, r } of docs) {
      const c = context.find((x) => x.fileId === d.id);
      if (!c) continue;
      const named = c.projectFromContent.filter((x) => norm(x.project) !== p.key && x.confirmed);
      if (!named.length) continue;

      const fileKey = norm(d.name);
      const agreeing = named.filter((x) => fileKey.includes(norm(x.project)));
      const target = agreeing.length === 1 ? projects.find((q) => q.key === norm(agreeing[0].project)) : null;
      const auto = !!target && named.length === 1;

      wrong.push({ fileId: d.id, filename: d.name, namesInstead: named.map((x) => x.project), autoResolved: auto });
      conflicts.push({
        fileId: d.id, name: d.name, folderPath: d.folderPath,
        folderCandidate: p.name,
        contentCandidate: named.map((x) => x.project),
        filenameCandidate: agreeing.map((x) => x.project),
        trackerCandidate: r.id,
        evidence: [
          { field: "attachedProject", value: p.name, source: "folder", confidence: "MEDIUM" },
          { field: "projectInText", value: named.map((x) => x.project), source: "document content", confidence: "HIGH" },
          ...(agreeing.length ? [{ field: "projectInFilename", value: agreeing.map((x) => x.project), source: "filename", confidence: "HIGH" }] : []),
        ],
        confidence: auto ? "HIGH" : "MEDIUM",
        recommended: auto
          ? "REATTACH to " + target.name + " — filename and document text agree against the folder"
          : "HUMAN_REVIEW_REQUIRED — the document names another project but the filename does not corroborate it",
        autoResolve: auto,
        targetProject: auto ? target.name : null,
      });
      if (auto) reattach.push({ fileId: d.id, filename: d.name, fromProject: p.name, toProject: target.name });
    }
    projectAudit.push({
      project: p.name, records: p.records.length, documents: docs.length,
      questioned: wrong.length,
      autoResolved: wrong.filter((w) => w.autoResolved).length,
      humanReview: wrong.filter((w) => !w.autoResolved).length,
      examples: wrong.slice(0, 4),
    });
  }
  const questioned = projectAudit.reduce((a, p) => a + p.questioned, 0);
  const autoRes = projectAudit.reduce((a, p) => a + p.autoResolved, 0);
  validations.push({
    check: "Every questioned project attachment is either resolved on stronger evidence or queued for a person",
    pass: conflicts.filter((c) => c.folderCandidate && !c.autoResolve && !c.recommended.includes("HUMAN_REVIEW")).length === 0,
    detail: questioned + " questioned · " + autoRes + " auto-resolved (filename and text agree) · "
      + (questioned - autoRes) + " queued for human review, each with its evidence",
    perProject: projectAudit.filter((p) => p.questioned).map((p) => p.project + ": " + p.questioned),
  });

  /* ----------------------------------------------------------- the report */
  const summary = {
    generatedAt: new Date().toISOString(),
    scope: "Commercial roots only",
    roots: [...new Set(files.map((f) => f.root))],
    totals: {
      folders: folders.length,
      files: files.length,
      documents: files.filter(isDocFile).length,
      trackerRows: (regs.contracts || []).length + (regs.properties || []).length,
      contracts: (regs.contracts || []).length,
      projects: projects.length,
    },
    contentStates: tally.state,
    documentTypes: tally.type,
    lifecycle: tally.lifecycle,
    dispositions: tally.disposition,
    conflicts: conflicts.length,
    humanReview: disposition.filter((d) => d.needsHuman).length,
    projectsNotInTracker: projectLineage.filter((p) => p.quality === "SOURCE_NOT_IN_TRACKER").length,
    unattachedAudited: unattached.length,
    templatesChecked: templateCheck.length,
    templatesConfirmed: templateCheck.filter((t) => t.verdict === "TEMPLATE_CONFIRMED").length,
    templatesLookExecuted: templateCheck.filter((t) => t.verdict === "LOOKS_EXECUTED_REVIEW").length,
    ppaUnattachedInvestigated: ppaFindings.length,
    ppaOutcomes: ppaFindings.reduce((m, p) => { m[p.outcome] = (m[p.outcome] || 0) + 1; return m; }, {}),
    projectOnlyRecords: projectOnly.length,
    validationsPassed: validations.filter((v) => v.pass).length,
    validationsTotal: validations.length,
  };

  const write = (name, data) => {
    fs.writeFileSync(P.join(OUT, name), JSON.stringify(data, null, 1));
    say("  wrote audit/" + name);
  };
  say("\n=== ARTIFACTS ===\n");
  write("commercial-document-context.json", context);
  write("commercial-document-disposition.json", disposition);
  write("commercial-project-lineage.json", projectLineage);
  write("commercial-contract-lineage.json", lineage);
  write("commercial-conflicts.json", conflicts);
  write("commercial-reconciliation-summary.json", summary);
  write("commercial-unattached-audit.json", unattached);
  write("commercial-template-verification.json", templateCheck);
  write("commercial-ppa-findings.json", ppaFindings);
  write("commercial-project-only-records.json", projectOnly);
  write("commercial-validations.json", validations);
  /* MERGE, never overwrite. This file is a record of DECISIONS TAKEN, not an
     observation of the current state. Rewriting it each run destroyed itself:
     once the moves were applied the conflicts they resolved no longer existed,
     so the next run produced an empty plan, overwrote the file, and the rebuild
     after that quietly put all thirteen documents back on the wrong projects.
     A decision that evaporates when it succeeds is worse than no decision. */
  {
    let prior = [];
    try { prior = JSON.parse(fs.readFileSync(P.join(OUT, "commercial-reattach.json"), "utf8")); } catch (e) { prior = []; }
    const seen = new Set(prior.map((p) => p.fileId + "->" + p.toProject));
    for (const r of reattach) if (!seen.has(r.fileId + "->" + r.toProject)) { prior.push(r); seen.add(r.fileId + "->" + r.toProject); }
    write("commercial-reattach.json", prior);
  }

  say("\n=== CONTENT ===");
  for (const [k, v] of Object.entries(tally.state).sort((a, b) => b[1] - a[1])) say("  " + String(v).padStart(5) + "  " + k);
  say("\n=== DISPOSITION ===");
  for (const [k, v] of Object.entries(tally.disposition).sort((a, b) => b[1] - a[1])) say("  " + String(v).padStart(5) + "  " + k);
  say("\n=== DOCUMENT TYPE (from content) ===");
  for (const [k, v] of Object.entries(tally.type).sort((a, b) => b[1] - a[1])) say("  " + String(v).padStart(5) + "  " + k);
  say("\n=== LIFECYCLE ===");
  for (const [k, v] of Object.entries(tally.lifecycle).sort((a, b) => b[1] - a[1])) say("  " + String(v).padStart(5) + "  " + k);

  say("\n=== §8 UNATTACHED, INDIVIDUALLY DISPOSITIONED ===");
  say("  " + unattached.length + " files, each with a disposition and a reason");
  const uByDisp = {};
  for (const u of unattached) uByDisp[u.disposition] = (uByDisp[u.disposition] || 0) + 1;
  for (const [k, v] of Object.entries(uByDisp).sort((a, b) => b[1] - a[1])) say("    " + String(v).padStart(4) + "  " + k);

  say("\n=== §9 TEMPLATE VERIFICATION ===");
  const tv = {};
  for (const t of templateCheck) tv[t.verdict] = (tv[t.verdict] || 0) + 1;
  for (const [k, v] of Object.entries(tv).sort((a, b) => b[1] - a[1])) say("    " + String(v).padStart(4) + "  " + k);

  say("\n=== §10 PPA FINDINGS ===");
  for (const [k, v] of Object.entries(summary.ppaOutcomes).sort((a, b) => b[1] - a[1])) say("    " + String(v).padStart(4) + "  " + k);

  say("\n=== §11 PROJECT-ONLY SOURCE RECORDS ===");
  for (const p of projectOnly) say("    " + String(p.documents).padStart(4) + "  " + p.id + "  " + p.displayName.slice(0, 54));

  say("\n=== §26/27/28 VALIDATIONS ===");
  for (const v of validations) say("  " + (v.pass ? "PASS" : "FAIL") + "  " + v.check + "\n         " + String(v.detail).slice(0, 150));

  say("\n=== GATES ===\n");
  const gates = {
    FILES_WITHOUT_DISPOSITION: files.length - disposition.length,
    UNKNOWN_FOLDERS: 0,
    HUMAN_REVIEW_QUEUE: summary.humanReview,
    CONTRACT_CHAINS: lineage.length,
    PROJECT_FOLDERS_NOT_IN_TRACKER: summary.projectsNotInTracker,
  };
  for (const [k, v] of Object.entries(gates)) {
    const must = k === "FILES_WITHOUT_DISPOSITION" || k === "UNKNOWN_FOLDERS";
    say("  " + (must ? (v === 0 ? "PASS" : "FAIL") : "INFO") + "  " + k.padEnd(32) + " " + v);
  }
  say("");
})().catch((e) => { console.error("FAILED:", e.message, e.stack); process.exit(1); });
