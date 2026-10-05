// EVERY FILE IN THE TEMPLATE DRAWER ENDS IN EXACTLY ONE STATE.
//
// "Zameen - Pakistan Contract Templates" is a folder name, not a verdict. It
// held executed, stamped instruments — a vehicle lease, two digital marketing
// agreements under company seals, seventeen DHA allotment letters signed by the
// Director Transfer & Record. It also held blank pro-formas that must never
// reach the live contract register as if they were deals.
//
// So the classification has to be total and it has to be honest in both
// directions: nothing executed may be left filed as a template, and nothing
// blank may be promoted into the register. These checks hold that line.
//
// Three specific ways the count lied before, each now a check:
//
//   * Files were dropped on their NAME. Seven were skipped as editor artefacts
//     because they began with "~", and two of those were a 174KB and a 36KB
//     Word autorecovery file holding complete document bodies. Both were read
//     before being set aside; "it looks like a temp file" is not evidence.
//   * Blanks that are DRAWN RULES rather than underscore characters made a
//     22-page blank agreement look like prose with no placeholders, so the
//     signal counter left it unresolved.
//   * An ODT read as the empty string because the reader shelled out to an
//     `unzip` binary this host does not have, and `|| true` swallowed it.
//
//   node tests/m11-template-library.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const T_ROOT = "Commercial_Zameen Media Contracts / Zameen - Pakistan Contract Templates";

const readJson = (rel) => {
  try { return JSON.parse(fs.readFileSync(P.join(ROOT, rel), "utf8")); } catch (e) { return null; }
};

/* Every state a file may end in. A classification outside this set is a typo or
   an invented category, and either way it breaks the arithmetic below. */
const STATES = new Set([
  "APPROVED_TEMPLATE",
  "DRAFT_TEMPLATE",
  "WORK_IN_PROGRESS_TEMPLATE",
  "REFERENCE_DOCUMENT",
  "STANDARD_CLAUSE_LIBRARY",
  "EXECUTED_OPERATIONAL_DOCUMENT",
  "EXECUTED_PRECEDENT_SAMPLE",
  "NON_TEMPLATE_MISC",
  "EDITOR_ARTEFACT",
]);

H.runSuite("m11-template-library — 413 files, 413 decisions", async (ctx) => {
  const { check } = ctx;

  const lib = readJson("audit/zm-template-library.json");
  const inv = readJson("audit/zm-contracts-root-inventory.json");

  if (!lib || !inv) {
    check("the template library and root inventory are both present", false,
      "missing " + (!lib ? "zm-template-library.json " : "") + (!inv ? "zm-contracts-root-inventory.json" : ""));
    return;
  }

  const under = inv.files.filter((f) => String(f.path || "").startsWith(T_ROOT + " / "));
  const rows = lib.templates || [];

  /* ---- totality: no file classified twice, none left out ----------------- */
  check("every file under the Templates root has a row in the library",
    rows.length === under.length, rows.length + " rows for " + under.length + " files");

  const rowIds = rows.map((r) => r.fileId);
  check("no file is classified twice",
    new Set(rowIds).size === rowIds.length,
    (rowIds.length - new Set(rowIds).size) + " duplicate row(s)");

  const have = new Set(rowIds);
  const missing = under.filter((f) => !have.has(f.id));
  check("no file under the root is left without a decision",
    missing.length === 0,
    missing.length ? missing.slice(0, 5).map((f) => f.name).join(", ") : "none missing");

  /* ---- the target the brief names, stated as a number -------------------- */
  const unresolved = rows.filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS");
  check("UNCLASSIFIED_TEMPLATE_FILE is zero",
    unresolved.length === 0,
    unresolved.length ? unresolved.slice(0, 5).map((r) => r.name).join(", ") : "0");

  const unknown = rows.filter((r) => !STATES.has(r.classification));
  check("every classification is one of the defined states",
    unknown.length === 0,
    unknown.length ? [...new Set(unknown.map((r) => r.classification))].join(", ") : "all known");

  const byClass = rows.reduce((m, r) => (m[r.classification] = (m[r.classification] || 0) + 1, m), {});
  const summed = Object.values(byClass).reduce((a, b) => a + b, 0);
  check("the classification counts sum to the file count",
    summed === under.length, summed + " vs " + under.length);

  /* ---- every decision is explained -------------------------------------- */
  const unexplained = rows.filter((r) => !r.basis || String(r.basis).trim().length < 12);
  check("every file's state is backed by a stated basis",
    unexplained.length === 0,
    unexplained.length ? unexplained.slice(0, 3).map((r) => r.name).join(", ") : "all explained");

  /* ---- the two directions that matter ------------------------------------ */
  // NO EXECUTED CONTRACT LOST IN THE TEMPLATE LIBRARY: an executed instrument
  // may sit in this folder, but it must be RECORDED as executed, never as a
  // template. This is the count that tells a person they exist at all.
  const executed = rows.filter((r) => /^EXECUTED_/.test(r.classification));
  check("executed instruments found in the template drawer are recorded as executed",
    executed.length > 0, executed.length + " executed document(s) surfaced, not filed as templates");

  const executedNoBasis = executed.filter((r) => !/\b(stamp|seal|signed|executed|serial|dated)\b/i.test(String(r.basis || "")));
  check("each executed document names the evidence that it was executed",
    executedNoBasis.length === 0,
    executedNoBasis.length ? executedNoBasis.slice(0, 3).map((r) => r.name).join(", ") : "all cite stamp/seal/signature/date");

  // NO TEMPLATE POLLUTION OF THE LIVE CONTRACT REGISTER: a blank pro-forma is
  // not a deal. Templates carry no counterparty, so they must not be presented
  // as executed.
  const templateish = rows.filter((r) => /TEMPLATE$/.test(r.classification));
  const pollutes = templateish.filter((r) => r.signals && r.signals.executionEvidence === true);
  check("no file classified as a template carries execution evidence",
    pollutes.length === 0,
    pollutes.length ? pollutes.slice(0, 3).map((r) => r.name).join(", ") : "none");

  /* ---- the artefacts were read, not assumed ------------------------------ */
  const artefacts = rows.filter((r) => r.classification === "EDITOR_ARTEFACT");
  const bigUnread = artefacts.filter((r) => Number(r.size || 0) > 1024 && !Number(r.textChars));
  check("an editor artefact large enough to hold a document was actually read",
    bigUnread.length === 0,
    bigUnread.length ? bigUnread.map((r) => r.name).join(", ") : artefacts.length + " artefact(s), the large ones read");

  const artefactExecuted = artefacts.filter((r) => r.signals && r.signals.executionEvidence === true);
  check("no executed contract is hiding in a Word autorecovery file",
    artefactExecuted.length === 0,
    artefactExecuted.length ? artefactExecuted.map((r) => r.name).join(", ") : "none carry execution evidence");

  /* ---- the ODT that read as nothing -------------------------------------- */
  // A file recorded with zero characters and no explanation is the exact shape
  // of the failure that turned 23 real contracts into empty strings.
  const silentlyEmpty = rows.filter((r) =>
    !Number(r.textChars) && r.classification !== "EDITOR_ARTEFACT"
    && !/\b(image|screenshot|photograph|brochure|scan|no text|workbook|spreadsheet|annexure|render)\b/i.test(String(r.basis || "")));
  check("no file is left with empty text and no explanation for it",
    silentlyEmpty.length === 0,
    silentlyEmpty.length ? silentlyEmpty.slice(0, 5).map((r) => r.name).join(", ") : "none");

  /* ---- and the reader that caused it is no longer a shell-out ------------- */
  const resolver = fs.readFileSync(P.join(ROOT, "tools", "zm-template-resolve.js"), "utf8");
  // Look for an actual shell invocation, not the word. Matching the bare string
  // flagged the comment that explains why the shell-out was removed, which is a
  // check that fails hardest on the code that fixed it.
  const shellsOutToUnzip = /exec(Sync|File|FileSync)?\s*\(\s*["'`][^"'`]*\bunzip\b/.test(resolver);
  check("the ODT reader no longer depends on an `unzip` binary being installed",
    !shellsOutToUnzip && /xlsx\.unzip\(/.test(resolver),
    "ODT is inflated in process");
  check("an unreadable ODT is reported rather than read as the empty string",
    /odt-unreadable/.test(resolver), "failure is recorded, not swallowed");

  /* ---- and what the LIVE register actually presents ---------------------- */
  // The counts above are about a JSON artefact. This part is about the screen:
  // the matchers linked blank pro-formas to the projects they are pro-formas
  // FOR, which is the one link they were always going to make.
  const registers = require("../api/registers.js");
  const NOT_ATTACHABLE = new Set([
    "APPROVED_TEMPLATE", "DRAFT_TEMPLATE", "WORK_IN_PROGRESS_TEMPLATE",
    "STANDARD_CLAUSE_LIBRARY", "NON_TEMPLATE_MISC", "EDITOR_ARTEFACT",
  ]);
  const state = rows.reduce((m, r) => (m.set(r.fileId, r.classification), m), new Map());

  const attachedStates = [];
  const executedAttached = new Set();
  for (const fam of registers.FAMILIES) {
    for (const rec of await registers.get(fam.key)) {
      for (const d of (rec.driveFiles || [])) {
        const st = state.get(d.id);
        if (!st) continue;
        if (NOT_ATTACHABLE.has(st)) attachedStates.push({ name: d.name, state: st, family: fam.key });
        if (/^EXECUTED_/.test(st)) executedAttached.add(d.id);
      }
    }
  }

  check("no blank template is presented as a live record's own document",
    attachedStates.length === 0,
    attachedStates.length
      ? attachedStates.length + " still attached, e.g. " + attachedStates.slice(0, 3).map((a) => a.name + " (" + a.state + " on " + a.family + ")").join("; ")
      : "none");

  // The other half of the same instruction. Pruning templates must not sweep
  // out the stamped, sealed instruments that were filed in the same drawer.
  check("executed instruments found in the template drawer stay attached to their records",
    executedAttached.size > 0,
    executedAttached.size + " executed document(s) still reachable from a record");

  const detached = (await registers.summary()).diagnostics.templateFilesDetachedFromRecords;
  check("the register reports how many template files it detached, rather than doing it quietly",
    !!(detached && typeof detached.removed === "number"),
    detached ? detached.removed + " detached from " + detached.records + " record(s)" : "not reported");

  /* ---- and that any of it is visible to a person -------------------------- */
  // Findings that live only in a JSON file under audit/ are findings nobody
  // acts on. Both of these have to reach Data Health.
  const h = await registers.health();
  check("Data Health is given the template library, not just the audit file",
    !!(h.templateLibrary && h.templateLibrary.files === under.length),
    h.templateLibrary ? h.templateLibrary.files + " files, " + h.templateLibrary.executedInstrumentsFound + " executed found" : "absent");

  const pageDir = fs.readdirSync(ROOT).filter((n) => /^src-v\d+$/.test(n))
    .sort((a, b) => parseInt(b.slice(5), 10) - parseInt(a.slice(5), 10))[0];
  const page = fs.readFileSync(P.join(ROOT, pageDir, "pages", "datahealth.js"), "utf8");
  /* The page must MOUNT before anything on it can be rendered. `export default`
     sat on ContentRead -- a small panel near the top that takes a required data
     prop -- so main.js mounted that panel at /datahealth with no props and it
     threw on its first line. The whole page was dead, and a check that only
     grepped for `d.templateLibrary` passed the entire time, which is the same
     mistake as asserting source text instead of behaviour. */
  const defaultExport = (page.match(/export default (?:\/\*[\s\S]*?\*\/\s*)?function\s+([A-Za-z0-9_]+)/) || [])[1];
  check("the Data Health module default-exports the page, not one of its panels",
    defaultExport === "DataHealth", "default export is " + (defaultExport || "not a named function"));
  check("the Data Health page renders the template library",
    /d\.templateLibrary/.test(page), pageDir + "/pages/datahealth.js");
  check("the Data Health page reports when documents cannot be read",
    /d\.parserGate/.test(page), "reader status is on the screen, not only in the API");

  /* The brief is explicit: do not expose technical parser details to ordinary
     users. The gate deliberately carries a `reads` sentence per entry for
     exactly this -- "legacy Word documents" rather than "word-extractor" -- so
     the page must use that and never name a package. */
  const leaked = ["mammoth", "word-extractor", "pdftotext", "pdftoppm", "pdfinfo", "jimp", "@anthropic-ai"]
    .filter((pkg) => new RegExp("[\"'`][^\"'`]*" + pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "", "i").test(page));
  check("the page never names a parser package to the user",
    leaked.length === 0,
    leaked.length ? "leaks: " + leaked.join(", ") : "reader problems are described by what breaks");

  /* ---- the Templates page: the same error seen from the other side -------- */
  // Detaching blank forms from live records solves half of it. The other half
  // is this list, which showed a Google advertising agreement stamped by
  // Google's legal department next to a blank pro-forma with nothing to tell
  // them apart. A signed contract that can only be found inside the template
  // library, described as a template, is a signed contract lost.
  const tplLib = require("../api/template-library.js");
  const listed = rows.filter((r) => !/^~\$/.test(r.name) && !/^\.|desktop\.ini$|\.tmp$/i.test(r.name));

  check("every file the Templates page lists carries the state it was classified into",
    listed.every((r) => !!tplLib.classificationOf(r.fileId)),
    listed.filter((r) => !tplLib.classificationOf(r.fileId)).length + " without a state, of " + listed.length);

  const signedOnPage = listed.filter((r) => tplLib.isExecuted(r.fileId));
  check("signed agreements in the templates folder are distinguishable from blank forms",
    signedOnPage.length > 0 && signedOnPage.every((r) => /signed/i.test(tplLib.label(tplLib.classificationOf(r.fileId)))),
    signedOnPage.length + " marked as signed, not as templates");

  check("each one carries the evidence it was executed on, so the label can be checked",
    signedOnPage.every((r) => (tplLib.basisOf(r.fileId) || "").length > 12),
    "every signed document states its stamp, seal or signature");

  // A state is compared in code as SCREAMING_SNAKE; a person should never see that.
  check("states are given a human label rather than shown as stored",
    Object.values(tplLib.LABELS).every((v) => !/_/.test(v) && /^[A-Z]/.test(v)),
    "labels read as English");

  const routeSrc = fs.readFileSync(P.join(ROOT, "api", "router.js"), "utf8");
  check("the Templates route classifies what it returns instead of listing files flat",
    /tplLib\.classificationOf\(/.test(routeSrc) && /isExecuted:/.test(routeSrc),
    "state, label and evidence are returned per file");

  const tplPage = fs.readFileSync(P.join(ROOT, pageDir, "pages", "templates.js"), "utf8");
  check("the Templates page shows the state and calls out the signed agreements",
    /t\.stateLabel/.test(tplPage) && /signed\.length/.test(tplPage),
    pageDir + "/pages/templates.js");
});
