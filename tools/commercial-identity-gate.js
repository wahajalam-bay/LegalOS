#!/usr/bin/env node
/* ONE DOCUMENT CANNOT BE TWO CONTRACTS.
 *
 * Drive stores the same bytes in several folders — a leaseback filed both under
 * the project and under a "Leaseback Agreements" drawer, a construction
 * contract filed under the project and again in a regional drop. Every copy is
 * the SAME executed instrument. It follows that every copy must attach to the
 * same record.
 *
 * Where two copies attach to different records, that is not a preference or a
 * ranking problem. It is a contradiction, and exactly one of these is true:
 *
 *   MISATTACHED   one of the attachments is wrong
 *   DUPLICATE_RECORDS  the two records are the same contract entered twice
 *
 * BUT THE RULE ONLY HOLDS FOR INSTRUMENTS. A blank Appendix A - Payment Plan is
 * byte-identical in thirteen projects because it is the same EMPTY FORM copied
 * into each project's template set, and that is correct filing, not error. An
 * executed agreement cannot be two contracts; an unexecuted precedent is
 * supposed to be many. Treating the two alike produced 22 "contradictions" of
 * which most were simply the house template, so the gate separates them and
 * only the instruments are called contradictions.
 *
 * The template copies are still worth reporting for a different reason: a
 * precedent whose TEXT names one project while it sits in another project's
 * folder is a live drafting hazard, because the next person to fill it in
 * inherits the wrong project name.
 *
 * This is worth more than any similarity score because it needs no judgement:
 * md5 equality is decisive, and the registers were built without it. It is the
 * one check here that can prove an attachment wrong rather than merely doubt it.
 *
 * It resolves nothing by itself. Deciding which record is right needs the
 * document's content, so this states the contradiction, ranks the candidate
 * canonical copy, and leaves the decision to the resolve step.
 *
 *   node tools/commercial-identity-gate.js
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const DUPS = P.join(ROOT, "audit", "commercial-duplicates.json");
const CTX = P.join(ROOT, "audit", "commercial-document-context.json");
const OUT = P.join(ROOT, "audit", "commercial-identity-gate.json");

const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return d; } };

const dups = read(DUPS, { groups: [] });
const ctx = read(CTX, []);
const byId = new Map(ctx.map((c) => [c.fileId, c]));

/* The project a path denotes, which is the segment after the root — not a fixed
   index, because the two Commercial roots nest differently. */
function projectOf(folderPath) {
  const parts = String(folderPath || "").split(" / ");
  return parts.length > 1 ? parts[1] : "";
}

/* A precedent, not an instrument: everything under the templates root is a
   blank form kept per project on purpose. Vision facts override this where we
   have actually looked and seen signatures. */
const vision = read(P.join(ROOT, "audit", "commercial-vision.json"), {});
function isInstrument(copies) {
  const seen = copies.map((c) => vision[c.fileId]).filter(Boolean);
  const executed = seen.some((v) => v.facts && v.facts.executed === true);
  if (executed) return true;                      // we SAW it signed
  const unexecuted = seen.length && seen.every((v) => v.facts && v.facts.executed === false);
  if (unexecuted) return false;                   // we SAW it blank
  // Not read: the templates root is the house precedent library.
  return !copies.every((c) => /Pakistan Contract Templates/.test(c.folderPath || ""));
}

const findings = [];
for (const g of dups.groups || []) {
  const copies = [g.canonical, ...g.duplicates].map((f) => {
    const c = byId.get(f.fileId);
    return {
      fileId: f.fileId, filename: f.filename, folderPath: f.folderPath,
      project: projectOf(f.folderPath),
      recordId: (c && c.recordId) || null,
    };
  });

  const records = [...new Set(copies.map((c) => c.recordId).filter(Boolean))];
  const attached = copies.filter((c) => c.recordId);
  const unattached = copies.filter((c) => !c.recordId);

  const instrument = isInstrument(copies);

  if (records.length > 1 && !instrument) {
    /* The same blank form issued to several projects. Correct filing, but it
       means the estate's document count double-counts one form many times. */
    findings.push({
      kind: "TEMPLATE_SHARED",
      md5: g.md5, size: g.size, copies: copies.length, records,
      detail: "one blank precedent kept in " + copies.length + " project template sets",
      resolution: "no attachment is wrong; count these as one form, not " + copies.length + " documents",
      copiesDetail: copies,
    });
  } else if (records.length > 1) {
    /* Two records holding one instrument is not always a misfiling. Separate
       the cases, because they call for completely different action:

       DUPLICATE_RECORDS  the records describe the SAME project — usually two
                          folder spellings ("Zameen Opal" and "Zameen Opal_")
                          or the same contract entered twice. Nothing is
                          attached to the wrong project; the REGISTER has two
                          rows where it should have one.
       CONTRADICTION      the records describe DIFFERENT projects, so one of
                          the two attachments really is wrong.

       Reporting both as contradictions overstates the problem and points the
       reader at the documents when the fault is in the records. */
    const normProj = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const distinctProjects = new Set(copies.map((c) => normProj(c.project)).filter(Boolean));
    const sameProject = distinctProjects.size <= 1;
    findings.push({
      kind: sameProject ? "DUPLICATE_RECORDS" : "CONTRADICTION",
      md5: g.md5, size: g.size, copies: copies.length,
      records,
      projects: [...new Set(copies.map((c) => c.project).filter(Boolean))],
      detail: sameProject
        ? "one instrument is held by " + records.length + " records that describe the same project"
        : "byte-identical copies are attached to records describing different projects",
      resolution: sameProject
        ? "merge the duplicate records; no document is attached to the wrong project"
        : "one attachment is wrong — decide it from the document's own content",
      copiesDetail: copies,
    });
  } else if (records.length === 1 && unattached.length) {
    /* Not a contradiction — an omission. The same instrument is already placed,
       so the unplaced copies have a known home and need no guessing. */
    findings.push({
      kind: "INHERITABLE",
      md5: g.md5, size: g.size, copies: copies.length,
      records,
      detail: unattached.length + " copies of an already-placed document are unattached",
      resolution: "attach the remaining copies to record " + records[0] + " as duplicates of the same instrument",
      copiesDetail: copies,
    });
  } else if (!records.length) {
    findings.push({
      kind: "ORPHAN_SET",
      md5: g.md5, size: g.size, copies: copies.length, records: [],
      detail: "no copy of this document is attached to any record",
      resolution: "identify once and place every copy together",
      copiesDetail: copies,
    });
  }
}

const summary = {
  duplicateGroups: (dups.groups || []).length,
  contradictions: findings.filter((f) => f.kind === "CONTRADICTION").length,
  duplicateRecords: findings.filter((f) => f.kind === "DUPLICATE_RECORDS").length,
  templateShared: findings.filter((f) => f.kind === "TEMPLATE_SHARED").length,
  inheritable: findings.filter((f) => f.kind === "INHERITABLE").length,
  inheritableCopies: findings.filter((f) => f.kind === "INHERITABLE")
    .reduce((n, f) => n + f.copiesDetail.filter((c) => !c.recordId).length, 0),
  orphanSets: findings.filter((f) => f.kind === "ORPHAN_SET").length,
};

fs.writeFileSync(OUT, JSON.stringify({ summary, findings }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const f of findings.filter((x) => x.kind === "CONTRADICTION")) {
  console.log("\n  CONTRADICTION  " + f.copiesDetail[0].filename.slice(0, 66));
  for (const c of f.copiesDetail) {
    console.log("     " + (c.recordId || "(unattached)").padEnd(14) + "  " + c.folderPath);
  }
}
