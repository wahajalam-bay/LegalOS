// THE COMMERCIAL FREEZE GATE.
//
// Commercial is closed. Everything this suite asserts was paid for by a real
// defect found while closing it, and each check exists so that defect cannot
// come back without a test going red.
//
// Nothing here talks to a server or a browser — these are facts about the
// dataset, the corrections and the toolchain, so they are cheap and they run
// every time.
//
//   node tests/m9-commercial-freeze.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path"), cp = require("child_process");

const ROOT = P.join(__dirname, "..");
const readJson = (rel, d) => { try { return JSON.parse(fs.readFileSync(P.join(ROOT, rel), "utf8")); } catch (e) { return d; } };
const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

H.runSuite("m9-commercial-freeze — the corrections hold, and the readers are a precondition", async (ctx) => {
  const { check } = ctx;
  const registers = require("../api/registers.js");

  /* ─────────────────────────── §9 the Aurum corrections are permanent ───── */
  /* Seven byte-identical Zameen Aurum documents were attached to Zameen Ace
     Mall as well. Reading proved them Aurum's three separate ways (a TEPA NOC
     naming Zameen Platinum at 15-A Gulberg, a property tax demand for
     L-SXXA-15/A, and a 236K receipt dating the purchase). Ace Mall is a ZUI
     Investments project in Islamabad. */
  const st1 = await registers.rebuild(true);
  const holders = (fileId, state) => {
    const out = [];
    for (const arr of Object.values(state.registers || {})) {
      if (!Array.isArray(arr)) continue;
      for (const r of arr) if ((r.driveFiles || []).some((d) => d.id === fileId)) out.push(r.project || r.title || "");
    }
    return out;
  };

  const plan = readJson("audit/commercial-reattach.json", []);
  const aurumMoves = plan.filter((p) => norm(p.toProject) === norm("Zameen Aurum"));
  check("the Aurum corrections are recorded in the reattachment plan",
    aurumMoves.length >= 5, aurumMoves.length + " moves onto Zameen Aurum");

  let onAurum = 0, stillOnAceMall = 0;
  for (const m of aurumMoves) {
    const h = holders(m.fileId, st1).map(norm);
    if (h.includes(norm("Zameen Aurum"))) onAurum++;
    if (h.includes(norm(m.fromProject))) stillOnAceMall++;
  }
  check("every Aurum document is held by Zameen Aurum",
    onAurum === aurumMoves.length, onAurum + " of " + aurumMoves.length);
  check("not one of them is still held by the project it was moved off",
    stillOnAceMall === 0, stillOnAceMall + " still on the old project");

  /* ── §9 continued: rebuilding twice must not change the answer ─────────── */
  const st2 = await registers.rebuild(true);
  const fingerprint = (state) => aurumMoves.map((m) => m.fileId + ":" + holders(m.fileId, state).map(norm).sort().join(",")).join("|");
  check("a second rebuild produces an identical attachment picture",
    fingerprint(st1) === fingerprint(st2), "stable across two builds");

  /* ── §10 a correction REMOVES as well as ADDS ──────────────────────────── */
  /* The removal loop once ran over property records alone, so a document was
     added to the right project and left on the wrong one. A reattachment that
     only adds does not correct anything — it doubles the error. */
  const regSrc = fs.readFileSync(P.join(ROOT, "api", "registers.js"), "utf8");
  check("reattachment removal spans every register family, not just properties",
    /for \(const arr of Object\.values\(registers\)\)[\s\S]{0,200}everyRecord/.test(regSrc)
      || /everyRecord[\s\S]{0,400}norm\(p\.fromProject\) === key/.test(regSrc),
    "the removal loop walks all families");
  check("no document moved by a correction sits on both the old and the new project",
    stillOnAceMall === 0 && onAurum === aurumMoves.length,
    "add and remove both applied");

  /* ── §11 a deliberate correction survives pruning ──────────────────────── */
  /* The sharing rules rank evidence. A reattachment once ranked BELOW a filename
     citation, so a correction was applied and then pruned away on the same
     build: the plan still said the right thing and the registers did not. */
  check("a deliberate reattachment outranks a filename citation when links are pruned",
    /content-reattach"\s*\?\s*3/.test(regSrc),
    "content-reattach carries top evidence rank");

  /* A CORRECTION MAY BE WITHDRAWN BY POLICY, BUT NEVER LOST BY ACCIDENT.
     Four entries in this plan point at documents that were later read and found
     to be blank pro-formas -- the Downtown Rumanza and Zameen Jade agreements
     to sell carry 66 to 162 blank-field markers, twenty empty witness lines
     apiece, no stamp and no signature, and two of them were read page by page
     and recorded `executed: false`. Attaching those to a project record is the
     template pollution the register now removes deliberately.
     So the check splits the two cases it must never confuse:
       withdrawn  -- the document is classified as one that is not a record's
                     own document. Expected, and named here so the withdrawal is
                     visible rather than silent.
       lost       -- everything else. That is the ranking bug this guards, where
                     a correction was applied and pruned away on the same build,
                     and it must still fail. */
  const tplLib = require("../api/template-library.js");
  const withdrawnByPolicy = plan.filter((m) => {
    const st = tplLib.classificationOf(m.fileId);
    return st && tplLib.NOT_A_RECORDS_OWN_DOCUMENT.has(st);
  });
  const expected = plan.filter((m) => !withdrawnByPolicy.includes(m));
  const survivors = expected.filter((m) => holders(m.fileId, st2).map(norm).includes(norm(m.toProject)));
  check("every correction not withdrawn by the template policy survives rebuild and prune",
    survivors.length === expected.length,
    survivors.length + " of " + expected.length + " survive"
      + (withdrawnByPolicy.length ? "; " + withdrawnByPolicy.length + " withdrawn as blank templates" : ""));

  /* And a withdrawal must be justified by the document, not by convenience. */
  const unjustified = withdrawnByPolicy.filter((m) => {
    const row = (tplLib.load().byId.get(m.fileId) || {});
    const sig = row.signals || {};
    const blanks = (sig.placeholders || 0) + (sig.blankRules || 0) + (sig.witnessBlank || 0);
    return blanks < 3 || (sig.eStamp || 0) > 0;
  });
  check("each withdrawn correction points at a document that really is a blank form",
    unjustified.length === 0,
    unjustified.length
      ? unjustified.map((m) => m.filename || m.fileId).join(", ")
      : withdrawnByPolicy.length + " withdrawn, each with blank-field markers and no stamp");

  /* ── §12 the readers are a precondition of building ────────────────────── */
  const gate = require("../api/parser-gate.js");
  const now = gate.check();
  check("every required document reader is present",
    now.ok, now.detail || (now.checked + " readers checked"));
  check("the gate names what a missing reader would cost, not just a package",
    gate.REQUIRED.every((r) => r.reads && r.reads.length > 4),
    gate.REQUIRED.map((r) => r.id).join(", "));

  /* Prove the gate actually fires.
     The check must run in a CHILD PROCESS: node caches module resolution for the
     life of a process, so hiding the directory and re-requiring in-process still
     finds it — which is exactly how this test passed while proving nothing the
     first time. The library is restored in a finally, because a test that leaves
     the tree broken is worse than no test at all. */
  const mam = P.join(ROOT, "node_modules", "mammoth");
  const hidden = mam + ".hidden-by-test";
  let fired = null;
  if (fs.existsSync(mam)) {
    try {
      fs.renameSync(mam, hidden);
      const out = cp.execFileSync(process.execPath,
        ["-e", 'process.stdout.write(JSON.stringify(require("' + P.join(ROOT, "api", "parser-gate.js").replace(/\\/g, "/") + '").check()))'],
        { cwd: ROOT, encoding: "utf8", timeout: 60000 });
      fired = JSON.parse(out);
    } catch (e) {
      fired = { error: String((e && e.message) || e).slice(0, 120) };
    } finally {
      if (fs.existsSync(hidden)) fs.renameSync(hidden, mam);
    }
    check("removing a reader makes the gate refuse, naming what can no longer be read",
      !!fired && fired.ok === false && /docx/i.test(fired.detail || ""),
      fired ? (fired.detail || fired.error || JSON.stringify(fired)) : "gate did not run");
  } else {
    check("gate firing test skipped: mammoth is not installed here", true, "skipped");
  }
  check("the reader library is back where it belongs after the test",
    fs.existsSync(mam) && !fs.existsSync(hidden), "restored");

  /* ── §13 a degraded build keeps serving the last good dataset ──────────── */
  check("a failed reader check refuses the candidate build rather than publishing it",
    /PARSER GATE|parser gate|THE READERS ARE A PRECONDITION/i.test(regSrc) && /keep serving the last good build/.test(regSrc),
    "rebuild returns the previous state instead of promoting a hollow one");
  /* Asserted by CALLING health(), not by grepping for the field name.
     The source-text version of this check passed for as long as it existed
     while the value it described was null on every running server: the cache
     restores `builtAt`, so `ensure()` skips the rebuild that sets the verdict,
     and `saveCache` never persisted it. A server up for days reported no reader
     gate at all. The gate is now checked live on every health read, so it
     answers "can this host read a .doc now", not "could it when the cache was
     written". */
  check("the reader verdict reaches Data Health on the cache path, not just after a rebuild",
    await (async () => {
      try {
        const regs = require("../api/registers.js");
        const h = await regs.health();
        return !!(h.parserGate && typeof h.parserGate.ok === "boolean" && h.parserGate.checked > 0);
      } catch (e) { return false; }
    })(),
    "health() returns a live gate verdict even when the book came from cache");
  check("Data Health can still say what the last BUILD saw, separately from now",
    /parserGateAtLastBuild/.test(regSrc) && /parserGate: state\.parserGate/.test(regSrc),
    "the build-time verdict is persisted and reported alongside the live one");

  /* ── §15 generic words may not identify a project on their own ─────────── */
  /* "heights" was treated as unique to Boulevard Heights, because ownership was
     counted across tracker projects only and Broadway Heights, Sitara Heights
     and J Heights live in the contract list. Three executed Broadway Heights
     documents were reported as naming Boulevard Heights on one shared noun. */
  const recSrc = fs.readFileSync(P.join(ROOT, "tools", "commercial-reconcile.js"), "utf8");
  check("project-word ownership is counted across every project name, not just tracker projects",
    /tokenOwnersWide/.test(recSrc) && /contractProjects\.filter/.test(recSrc),
    "contract projects are included in the uniqueness test");

  const mism = readJson("audit/commercial-project-mismatch.json", { findings: [] });
  const GENERIC = ["heights", "mall", "residences", "commercial", "tower", "estate", "square", "park"];
  const onGeneric = (mism.findings || []).filter((f) => GENERIC.includes(String(f.matchedWord || "").toLowerCase()));
  check("no project claim rests on a generic word alone",
    onGeneric.length === 0, onGeneric.length ? onGeneric.map((f) => f.filename).join(", ") : "none");

  /* And the specific documents that were misread. */
  const vision = readJson("audit/commercial-vision.json", {});
  const broadway = Object.values(vision).filter((e) => /Broadway Heights|no\.?\s*15/i.test(e.filename || "")
    && e.facts && /broadway/i.test(e.facts.project || ""));
  check("the Broadway Heights documents are recorded as Broadway Heights, not Boulevard",
    broadway.length >= 3 && broadway.every((e) => !/boulevard/i.test(e.facts.project)),
    broadway.length + " documents, all naming Broadway Heights");

  /* ── §6 files and documents are counted as different things ────────────── */
  const dups = readJson("audit/commercial-duplicates.json", { summary: {} });
  const s = dups.summary || {};
  check("the duplicate audit distinguishes physical files from distinct documents",
    s.commercialFiles === 1303 && s.distinctDocuments === 1181 && s.redundantCopies === 122,
    s.commercialFiles + " files, " + s.distinctDocuments + " distinct documents, " + s.redundantCopies + " duplicate copies");

  /* ── §7 every physical copy keeps its own Drive path ───────────────────── */
  const groups = dups.groups || [];
  const everyCopyHasAPath = groups.every((g) => [g.canonical, ...(g.duplicates || [])]
    .every((c) => c.fileId && c.folderPath));
  check("every copy in every duplicate group retains its own fileId and Drive path",
    everyCopyHasAPath && groups.length > 0,
    groups.length + " groups, all copies carry provenance");
  check("no duplicate group was collapsed by discarding copies",
    groups.every((g) => 1 + (g.duplicates || []).length === g.count),
    "each group still lists every physical copy");

  /* ── §16 source defects are classed as source quality, not system failure ─ */
  const sq = require("../api/source-quality.js");
  const sum = sq.summary(true);
  check("document defects are classified as a source quality issue",
    /SOURCE QUALITY ISSUE/.test(sum.classification || ""), sum.classification);
  check("the defects found by reading are surfaced, not swallowed",
    sum.documentsWithIssues > 0, sum.documentsWithIssues + " documents carry a source issue");

  const rows = sq.all();
  const named = (re) => rows.find((r) => re.test(r.filename));
  for (const [label, re, type] of [
    ["Samrina Boulevard", /Samrina Boulevard/i, "SOURCE_DOCUMENT_CONFLICT"],
    ["Golf View Rumanza", /GolfViewRumanza/i, "BLANK_SCHEDULE"],
    ["Peak Nest", /PEAK NEST/i, "JURISDICTION_STAMP_MISMATCH"],
    ["Vintage Commercials", /Vintage Commercials/i, "MISSING_SIGNATURE"],
  ]) {
    const row = named(re);
    check(label + " is surfaced as " + type,
      !!row && row.issues.some((i) => i.type === type),
      row ? row.issues.map((i) => i.type).join(", ") : "not surfaced");
  }
  check("every surfaced issue carries checkable evidence",
    rows.every((r) => r.issues.every((i) => i.evidence && String(i.evidence).length > 10)),
    "no bare warnings");
  check("every surfaced issue keeps a Drive file id so the original can be opened",
    rows.every((r) => r.fileId), "all rows openable in Drive");

  /* ── §2 Drive is never written to ──────────────────────────────────────── */
  for (const tool of ["commercial-prepare.js", "commercial-resolve.js", "commercial-reconcile.js"]) {
    const src = fs.readFileSync(P.join(ROOT, "tools", tool), "utf8");
    check(tool + " never writes to Drive",
      !/driveRaw\([^)]*method:\s*["'](POST|PATCH|PUT|DELETE)/i.test(src)
      && !/files\.(update|delete|create|copy)\(/.test(src),
      "read-only against Drive");
  }
});
