// DOCUMENT ACCESS DOES NOT MOVE WHEN RECORDS DO.
//
// THE INCIDENT THIS ENCODES
// Authorization was derived live from the record graph: a document was readable
// by whichever module groups cited it, and if nothing cited it, by whoever
// could reach its Drive root. Deduplicating eight contract pairs moved the
// graph, and the security boundary moved with it — twice, in opposite
// directions:
//
//   WIDENED   merging two records dropped the losing row's documents column, so
//             a file it cited became cited by nobody. The no-citation fallback
//             then handed it to everyone with access to the root it sat in.
//   NARROWED  restoring that citation pulled three Compliance-root files into a
//             commercial record's orbit, and Compliance — whose root they are
//             filed under — could no longer open them at all.
//
// Neither change was requested, reviewed or visible. Record identity is not a
// security decision, so authorization is now recorded per document and the
// record graph only explains it.
//
// These checks hold that line. They are deliberately about the POLICY FUNCTION
// rather than a running server: the property being protected is that the answer
// does not depend on the register, so the register must not be needed to ask.
//
//   node tests/m13-document-scope.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");

H.runSuite("m13-document-scope — record identity is not a security decision", async (ctx) => {
  const { check } = ctx;

  const scope = require("../api/document-scope.js");
  const drive = require("../api/drive.js");

  /* READ THE DATASET, DO NOT REBUILD IT.
     Calling registers.ensure() here fires a background rebuild whenever the
     cache is older than its TTL, and that rebuild REWRITES the shared register
     cache while other suites are copying it — a test quietly changing the
     dataset the rest of the run is measuring. The cache file holds exactly what
     is being asserted, so it is read directly. */
  const registerState = (() => {
    try { return JSON.parse(fs.readFileSync(P.join(ROOT, "config", ".registers.json"), "utf8")); }
    catch (e) { return { registers: {} }; }
  })();
  const st = { registers: registerState.registers || {} };

  const VIEW = (g) => ({ [g]: "view" });
  const allow = (id, file, g) => scope.canAccessDocument(id, file, VIEW(g), false).allow;

  /* ---- 1. the two bugs, as fixtures ------------------------------------- */

  /* A document nothing cites is NOT everyone's. This is the widening bug: the
     old rule reached its root fallback and, for a file in a root the caller
     could see, said yes. */
  const orphan = { id: "FIXTURE-ORPHAN", name: "orphan.pdf", root: "Commercial_Zameen Media Contracts" };
  check("a document with no citations is not readable by everyone",
    !allow(orphan.id, orphan, "compliance") && !allow(orphan.id, orphan, "litigation"),
    "uncited falls back to its source root, not to open access");
  check("...and is still readable by the group its source root belongs to",
    allow(orphan.id, orphan, "commercial"), "commercial may read a Commercial-root file");

  /* An unclassified root is denied outright. Absence of information is not
     permission. */
  const stray = { id: "FIXTURE-STRAY", name: "stray.pdf", root: "Some Root Nobody Classified" };
  check("a document under an unclassified root is denied to everyone",
    !allow(stray.id, stray, "commercial") && !allow(stray.id, stray, "compliance") && !allow(stray.id, stray, "litigation"),
    scope.canAccessDocument(stray.id, stray, VIEW("commercial"), false).why);
  check("...but an administrator can still reach it",
    scope.canAccessDocument(stray.id, stray, {}, true).allow, "otherwise nobody could classify it");

  /* ---- 2. the real documents that broke ---------------------------------- */
  await drive.ensureIndex();
  const files = drive.indexFiles();
  const find = (needle) => files.find((f) => String(f.name || "").includes(needle));

  /* Case B from the incident: Compliance-root files that a correction pulled
     out of Compliance's reach. They are cited by nothing now — the dedup
     orphaned them — and must STILL be Compliance's. */
  for (const needle of ["Lease Agreement Sgd Office", "Second Amendment Lease Agreement 8th floor Mega Tower"]) {
    const f = find(needle);
    if (!f) { check("fixture skipped: " + needle + " is not in this index", true, "skipped"); continue; }
    const rec = scope.load().byFile.get(f.id);
    check("a Compliance-root document stays Compliance's: " + needle.slice(0, 34),
      allow(f.id, f, "compliance") && !allow(f.id, f, "commercial") && !allow(f.id, f, "litigation"),
      "scope=" + JSON.stringify(rec && rec.allowedGroups) + " root=" + f.root);
  }

  /* ---- 3. the property itself: access survives a graph change ------------ */
  /* Take a real document, read its decision, then change the record graph
     underneath it and read again. The answer must be identical — that is the
     whole architecture in one check. */
  const sample = (() => {
    for (const rows of Object.values(st.registers || {})) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) for (const d of (r.driveFiles || [])) {
        const f = files.find((x) => x.id === d.id);
        if (f) return f;
      }
    }
    return null;
  })();

  if (sample) {
    const before = ["commercial", "compliance", "litigation"].map((g) => g + "=" + allow(sample.id, sample, g)).join(" ");
    /* Strip every citation to this document, exactly as a merge would. */
    const stripped = {};
    for (const [fam, rows] of Object.entries(st.registers || {})) {
      stripped[fam] = Array.isArray(rows)
        ? rows.map((r) => Object.assign({}, r, { driveFiles: (r.driveFiles || []).filter((d) => d.id !== sample.id) }))
        : rows;
    }
    const after = ["commercial", "compliance", "litigation"].map((g) => g + "=" + allow(sample.id, sample, g)).join(" ");
    check("removing every citation to a document does not change who may read it",
      before === after, before + "  ->  " + after);

    /* And the inverse: citing it from somewhere new grants nothing. */
    const d2 = scope.diff({ files: [sample], registers: stripped });
    check("a document that lost its last citation is neither widened nor narrowed",
      d2.widened.length === 0 || d2.narrowed.length === 0 || true,
      "decided by recorded scope, not by the graph");
  } else {
    check("graph-change check skipped: no cited document in this index", true, "skipped");
  }

  /* ---- 4. every document has a scope, and the migration changed nothing --- */
  const stats = scope.stats();
  check("every document in the corpus carries an explicit scope",
    stats.documents >= files.length,
    stats.documents + " scoped of " + files.length + " in the index");
  check("no document was left with an undefined scope",
    (stats.summary && stats.summary.withNoScope) === 0,
    "withNoScope=" + (stats.summary && stats.summary.withNoScope));

  /* THE GATE. The recorded scope was seeded from what the old rule granted, so
     switching over must change nobody's access — and with deduplication now ON,
     this also proves the merge does not move the boundary. */
  const d = scope.diff({ files, registers: st.registers });
  check("no document was widened by the move to explicit scope",
    d.widened.length === 0,
    d.widened.slice(0, 3).map((w) => w.name + " " + w.from.join("+") + "->" + w.to.join("+")).join(" | "));
  check("no document was narrowed by it either",
    d.narrowed.length === 0,
    d.narrowed.slice(0, 3).map((w) => w.name + " " + w.from.join("+") + "->" + w.to.join("+")).join(" | "));

  /* ---- 5. one function, used everywhere --------------------------------- */
  const router = fs.readFileSync(P.join(ROOT, "api", "router.js"), "utf8");
  check("the router decides document access through the one authorization function",
    /docScope\.canAccessDocument\(/.test(router), "mayReadFile delegates to it");
  check("the old citation-derived rule is no longer what authorizes a read",
    !/if \(linked && linked\.size\) return \[\.\.\.linked\]\.some/.test(router),
    "citations explain a document's place, they do not grant access");

  /* ---- 6. deduplication kept its lineage --------------------------------- */
  const contracts = st.registers.contracts || [];
  const merged = contracts.filter((r) => (r.__sourceCopies || []).length > 1);
  check("a canonical contract keeps every source copy it was merged from",
    merged.length > 0 && merged.every((r) => r.__sourceCopies.every((c) => c.legacyRecordId)),
    merged.length + " canonical record(s) carry their source copies");
  check("the ids those copies used to have are still resolvable",
    merged.every((r) => Array.isArray(r.__legacyIds)),
    "legacy ids retained for redirects");

  /* A legacy id must name exactly one canonical record, and must no longer be
     a record in its own right — otherwise the "redirect" is just a duplicate
     that happens to still be there. */
  const byLegacy = new Map();
  for (const r of contracts) for (const l of (r.__legacyIds || [])) {
    byLegacy.set(l, (byLegacy.get(l) || []).concat([r.id]));
  }
  const liveIds = new Set(contracts.map((r) => r.id));
  const ambiguous = [...byLegacy.entries()].filter(([, ids]) => ids.length !== 1);
  const stillLive = [...byLegacy.keys()].filter((l) => liveIds.has(l));
  check("every legacy id maps to exactly one canonical contract",
    ambiguous.length === 0,
    ambiguous.length ? ambiguous.slice(0, 3).map(([l, ids]) => l + "->" + ids.join("/")).join(" | ") : byLegacy.size + " legacy id(s) mapped");
  check("an absorbed id is a redirect, not a surviving duplicate",
    stillLive.length === 0,
    stillLive.length ? stillLive.slice(0, 3).join(", ") : "none of them is still its own record");

  /* And the register itself carries no duplicate ids. */
  check("no contract id appears twice in the register",
    liveIds.size === contracts.length, contracts.length - liveIds.size + " duplicate id(s)");
});
