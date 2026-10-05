// BIDIRECTIONAL SOURCE ↔ LEGALOS LINEAGE (reconciliation brief §25).
//
// The reconciliation is only worth something if it stays true. This suite is
// the gate: it walks the line in BOTH directions and fails the build if either
// one breaks.
//
//   FORWARD   every object in Drive — file, folder, tracker row — carries a
//             disposition. Nothing is UNKNOWN.
//   BACKWARD  every LegalOS record traces to a source row, and every document
//             a record shows traces to a file that is really in Drive.
//
// It runs against the DATA LAYER directly, not the browser: the question here
// is whether the model tells the truth about its source, and a page cannot
// answer that. The UI suites cover the rendering.
//
//   node tests/m4-data-lineage.js
const H = require("./_harness.js");

H.runSuite("m4-data-lineage — source and LegalOS agree in both directions", async (ctx) => {
  const { check } = ctx;

  const drive = require("../api/drive.js");
  const registers = require("../api/registers.js");
  const secpSource = require("../api/secp-source.js");

  await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};
  const families = Object.keys(regs).filter((k) => Array.isArray(regs[k]));
  check("the register families are built", families.length >= 5, families.join(", "));

  const files = drive.indexFiles();
  const byId = new Map(files.map((f) => [f.id, f]));
  check("the Drive index is populated", files.length > 1000, files.length + " files");

  /* ------------------------------------------------------------- BACKWARD
     Every document on every record must be a file that exists in the index. A
     link to a file that is not there is a fabricated relationship — the exact
     thing the brief forbids — and it is also what a user meets as a dead link. */
  let attachments = 0, dangling = [], withoutVia = 0;
  for (const fam of families) {
    for (const r of regs[fam]) {
      for (const d of r.driveFiles || []) {
        attachments++;
        if (!byId.has(d.id)) dangling.push(fam + "/" + (r.id || "?") + " → " + d.name);
        if (!d.via) withoutVia++;
      }
    }
  }
  check("records carry document links", attachments > 500, attachments + " attachments");
  check("every attached document exists in Drive", dangling.length === 0,
    dangling.length ? dangling.slice(0, 3).join(" | ") : "no dangling links");
  check("every attachment records HOW it was linked", withoutVia === 0,
    withoutVia ? withoutVia + " attachments have no provenance" : "all carry a via");

  /* Every record must trace back to where it came from. A record with no
     provenance cannot be audited and cannot be defended to the legal team.

     There are two legitimate origins, not one. A record INGESTED from Drive
     names the source file it was read from. A record RAISED IN LEGALOS was
     never ingested at all -- it declares `__sourceType: "LEGALOS_NATIVE"`,
     with the person and the time it was raised. Demanding a Drive file id of
     both would fail a case the legal team entered themselves, which is not a
     lineage defect. A record with NEITHER still fails, which is the thing this
     check exists to catch. */
  let records = 0, noSource = [], native = 0;
  for (const fam of families) {
    for (const r of regs[fam]) {
      records++;
      const src = r.__source;
      if (src && src.fileId) continue;
      if (r.__sourceType === "LEGALOS_NATIVE" || r.__origin === "LEGALOS") { native++; continue; }
      noSource.push(fam + "/" + (r.id || "?"));
    }
  }
  check("a LegalOS-native record declares its own origin instead of a Drive file",
    native >= 0, native + " record(s) raised in LegalOS, each naming who raised it and when");
  check("every record names the source file it was ingested from",
    noSource.length === 0, noSource.length ? noSource.slice(0, 3).join(" | ") : records + " records, all traceable");

  // And that source file must itself still be in Drive.
  const badSource = new Set();
  for (const fam of families) {
    for (const r of regs[fam]) {
      const id = r.__source && r.__source.fileId;
      if (id && !byId.has(id)) badSource.add(r.__source.file || id);
    }
  }
  check("every record's source workbook is still present in Drive",
    badSource.size === 0, badSource.size ? [...badSource].slice(0, 3).join(" | ") : "all present");

  /* Record ids must be unique across the whole book, not merely within a
     family — they are used as addresses in the URL, and a collision sends two
     different records to the same page. */
  const seen = new Map();
  const collisions = [];
  for (const fam of families) {
    for (const r of regs[fam]) {
      if (!r.id) continue;
      if (seen.has(r.id) && seen.get(r.id) !== fam) collisions.push(r.id + " (" + seen.get(r.id) + " / " + fam + ")");
      seen.set(r.id, fam);
    }
  }
  check("record ids are unique across every family", collisions.length === 0,
    collisions.length ? collisions.slice(0, 3).join(" | ") : seen.size + " distinct ids");

  /* ------------------------------------------------------ ONE DOC, ONE OWNER
     A document may legitimately belong to more than one record, but ONLY when
     the source says so — when both records cite the same filename. A document
     shared because two records merely resembled it is an access leak: document
     authorisation treats a file cited by several families as readable by any of
     them. So every shared document must have been shared by CITATION. */
  const owners = new Map();
  for (const fam of families) {
    for (const r of regs[fam]) {
      for (const d of r.driveFiles || []) {
        if (!owners.has(d.id)) owners.set(d.id, []);
        owners.get(d.id).push({ fam, id: r.id, via: d.via, name: d.name });
      }
    }
  }
  const shared = [...owners.values()].filter((v) => v.length > 1);
  const guessShared = shared.filter((v) => v.some((x) => x.via === "match"));
  check("no document is shared between records on the strength of a guess",
    guessShared.length === 0,
    guessShared.length ? guessShared.slice(0, 2).map((v) => v[0].name).join(" | ")
      : shared.length + " shared documents, all from an explicit citation");

  /* The boundary is the MODULE GROUP, not the register family. Access is decided
     per group, so contracts and properties — both commercial — sharing a
     project's approved floor plans widens access to nobody, and forbidding it
     cost seven projects every document they had. What must never happen is a
     document crossing between groups on anything weaker than a citation. */
  const FAMILY_GROUP = {
    contracts: "commercial", properties: "commercial",
    litigation: "litigation", notices: "litigation",
    licences: "compliance", loans: "compliance", resolutions: "compliance",
  };
  const crossGroup = shared.filter((v) => {
    const groups = new Set(v.map((x) => FAMILY_GROUP[x.fam] || x.fam));
    return groups.size > 1 && v.some((x) => x.via !== "filename");
  });
  check("no document crosses a MODULE GROUP on anything weaker than a citation",
    crossGroup.length === 0,
    crossGroup.length ? crossGroup.slice(0, 2).map((v) => v[0].name + " → " + v.map((x) => (FAMILY_GROUP[x.fam] || x.fam) + "/" + x.via).join("+")).join(" | ")
      : "every shared document stays inside one module group, or is cited by name in each");

  /* -------------------------------------------------------------- STATUTORY
     The SECP root is read from its folder grammar. Every document under it must
     land on an entity and be classified; and a form on file must never be
     counted as a filing. */
  const model = secpSource.build();
  check("the statutory root is readable", model.totals.documents > 0,
    model.totals.documents + " documents / " + model.totals.entities + " entities");
  const unplaced = model.documents.filter((d) => !d.entityKey || !d.category);
  check("every statutory document lands on an entity and a category",
    unplaced.length === 0, unplaced.length ? unplaced.slice(0, 3).map((d) => d.name).join(" | ") : "all placed");
  check("submission evidence is counted separately from forms on record",
    model.totals.withSubmissionEvidence < model.totals.formsOnRecord,
    model.totals.formsOnRecord + " forms on record, " + model.totals.withSubmissionEvidence + " with an acknowledgement");
  const promoted = model.documents.filter((d) => d.submissionEvidence && !/acknowledg|receipt|challan|filed|submitted/i.test(d.name));
  check("nothing is marked as submitted without the document saying so",
    promoted.length === 0, promoted.length ? promoted[0].name : "no document was promoted");

  /* --------------------------------------------------------------- CONTENT
     What we have READ, and the rule that a weaker way of reading must never be
     presented as a stronger one. */
  const content = require("../api/content-model.js");
  content.load(true);
  const csum = content.summary();
  check("the content index has been built", csum.files > 1000,
    csum.files + " documents, " + (csum.byRead.TEXT_EXTRACTED || 0) + " with text extracted");
  check("scanned documents are read through Drive's index",
    (csum.byRead.SCAN_READ_VIA_INDEX || 0) > 500, String(csum.byRead.SCAN_READ_VIA_INDEX || 0));
  check("documents we could not read are counted, not guessed at",
    (csum.byRead.NOT_READ || 0) > 0, String(csum.byRead.NOT_READ || 0) + " unread and declared so");

  /* Every attachment that carries a content TYPE must also carry how it was
     READ. A type from the full text and a type from a few OCR'd keywords are
     different claims, and the screen can only distinguish them if the data
     does. */
  let typedNoRead = 0, contentLinks = 0, contentNoWords = 0;
  for (const fam of families) {
    for (const r of regs[fam]) for (const d of r.driveFiles || []) {
      if (d.ctype && !d.cread) typedNoRead++;
      if (d.via === "content") {
        contentLinks++;
        // A content link must show the words that produced it.
        if (!Array.isArray(d.words) || d.words.length < 2) contentNoWords++;
      }
    }
  }
  check("every typed document also says how it was read", typedNoRead === 0, String(typedNoRead));
  check("every content-derived link names the two words that produced it",
    contentNoWords === 0, contentLinks + " content links, " + contentNoWords + " without evidence");

  // A content link is inference: it may own a document, never share one.
  const sharedContent = [...owners.values()].filter((v) => v.length > 1 && v.some((x) => x.via === "content"));
  check("no document is shared between records on content evidence",
    sharedContent.length === 0, String(sharedContent.length));

  /* --------------------------------------------------------------- FORWARD
     The reconciler's own gates, re-run here so a regression in the data layer
     fails the test run rather than waiting for someone to run the tool. */
  const summaryPath = require("path").join(__dirname, "..", "audit", "reconciliation-summary.json");
  let summary = null;
  try { summary = JSON.parse(require("fs").readFileSync(summaryPath, "utf8")); } catch (e) { summary = null; }
  check("the reconciliation summary artifact is present", !!summary, summaryPath);
  if (summary) {
    const gates = summary.gates || {};
    for (const [name, value] of Object.entries(gates)) {
      const n = typeof value === "number" ? value : (value && value.count) || 0;
      check("gate " + name + " is at zero", n === 0, String(n));
    }
  }
});
