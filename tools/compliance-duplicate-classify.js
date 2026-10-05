#!/usr/bin/env node
/* THE 223 DUPLICATE GROUPS, EACH GIVEN A REASON.
 *
 * Two files with the same name and the same byte count are almost always one
 * instrument filed twice -- but "almost always" is not a disposition, and the
 * difference between the cases decides what the screen should do:
 *
 *   one record holding both copies      -> one row, two source copies
 *   two records each holding one copy   -> one row each; nothing to collapse
 *
 * The second is the common case here and it is CORRECT: a subsidiary's Form 29
 * is kept in its own statutory folder and again in its parent's, and both
 * entities are entitled to show it on their own record. Collapsing those would
 * remove a filing from one entity's file.
 *
 *   node tools/compliance-duplicate-classify.js
 */
const fs = require("fs"), P = require("path");
const scope = require("../api/document-scope.js");

const AUDIT = P.join(__dirname, "..", "audit");
const r = (n) => JSON.parse(fs.readFileSync(P.join(AUDIT, n), "utf8"));

const seg = (p) => String(p || "").split("/").map((s) => s.trim()).filter(Boolean);

(async () => {
  const dups = r("compliance-document-duplicates.json");
  const inv = r("compliance-document-inventory.json");

  const recordsOf = new Map();
  for (const d of inv.documents) {
    if (!recordsOf.has(d.fileId)) recordsOf.set(d.fileId, []);
    recordsOf.get(d.fileId).push({ family: d.family, recordId: d.recordId });
  }
  const scopeOf = (id) => {
    const rec = scope.load().byFile.get(id);
    return rec ? { allowed: rec.allowedGroups || [], shared: rec.sharedGroups || [], denied: rec.deniedGroups || [] } : null;
  };
  const sameScope = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const out = [];
  const tally = {};
  let unclassified = 0;

  for (let i = 0; i < dups.groups.length; i++) {
    const g = dups.groups[i];
    const copies = g.locations.map((l) => ({
      fileId: l.fileId, folderPath: l.folderPath,
      records: recordsOf.get(l.fileId) || [],
      scope: scopeOf(l.fileId),
    }));
    const allRecords = [...new Set(copies.flatMap((c) => c.records.map((x) => x.family + ":" + x.recordId)))];
    const families = [...new Set(copies.flatMap((c) => c.records.map((x) => x.family)))];
    const perRecord = new Map();
    for (const c of copies) for (const rr of c.records) {
      const k = rr.family + ":" + rr.recordId;
      perRecord.set(k, (perRecord.get(k) || 0) + 1);
    }
    const recordHoldingBoth = [...perRecord.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const scopesDiffer = copies.length > 1 && !copies.every((c) => sameScope(c.scope, copies[0].scope));

    let classification, reason, uiBehaviour;
    if (/\.(xlsx|xlsm|xls|csv)$/i.test(g.name)) {
      classification = "G_SOURCE_TRACKER_DUPLICATE";
      reason = "a source spreadsheet kept in two folders; it is not a record document in either";
      uiBehaviour = "not shown in any Documents tab";
    } else if (/^~\$/.test(g.name)) {
      classification = "H_SYSTEM_COPY";
      reason = "an editor lock file";
      uiBehaviour = "not shown";
    } else if (recordHoldingBoth.length) {
      classification = "A_SAME_DOCUMENT_MULTIPLE_PHYSICAL_COPIES";
      reason = "one record cites both copies of the same instrument";
      uiBehaviour = "one row, carrying " + g.copies + " source copies";
    } else if (allRecords.length > 1) {
      /* The dominant case: a filing kept under a subsidiary AND its parent. */
      const parentChild = copies.some((c) => seg(c.folderPath).length > seg(copies[0].folderPath).length)
        || families.every((f) => f === "secp");
      classification = "E_SAME_FILE_USED_BY_MULTIPLE_RECORDS_LEGITIMATELY";
      reason = parentChild
        ? "the same statutory document is filed under the entity and under its parent; both records are entitled to show it"
        : "distinct records each cite one copy of the same instrument";
      uiBehaviour = "one row on each record; nothing collapsed across records";
    } else if (allRecords.length === 1) {
      classification = "B_SAME_INSTRUMENT_DIFFERENT_STORAGE_LOCATION";
      reason = "one record, one copy shown; the second copy is filed elsewhere in Drive and is reachable as a source copy";
      uiBehaviour = "one row, second location kept as provenance";
    } else {
      /* Neither copy is attached to a record. That is not "unclassified" -- it
         is an instrument the estate holds twice and no tracker row claims, so
         it sits at entity level like every other unattributed document.
         Recording it as unknown would hide a real agreement behind a word. */
      classification = "F_UNATTRIBUTED_INSTRUMENT_HELD_TWICE";
      reason = "both copies are real documents that no record cites; they are exposed at entity level, not attributed to an agreement without evidence";
      uiBehaviour = "entity-level document; one row if a record later claims it";
    }

    tally[classification] = (tally[classification] || 0) + 1;
    out.push({
      groupId: "DUP-" + String(i + 1).padStart(3, "0"),
      identity: "name + byte size",
      name: g.name, size: g.size,
      physicalFileCount: g.copies,
      logicalDocumentCount: 1,
      driveFileIds: copies.map((c) => c.fileId),
      paths: copies.map((c) => c.folderPath),
      recordIds: allRecords, families,
      recordHoldingMultipleCopies: recordHoldingBoth,
      authorizationScopes: copies.map((c) => c.scope),
      scopesDiffer,
      classification, reason, uiBehaviour,
    });
  }

  const physicalInGroups = out.reduce((a, g) => a + g.physicalFileCount, 0);
  const logical = out.length;
  const collapsedInUi = out.filter((g) => g.classification === "A_SAME_DOCUMENT_MULTIPLE_PHYSICAL_COPIES")
    .reduce((a, g) => a + (g.physicalFileCount - 1), 0);

  fs.writeFileSync(P.join(AUDIT, "compliance-document-duplicate-groups.json"), JSON.stringify({
    builtAt: new Date().toISOString(),
    groups: out.length, unclassified,
    physicalFilesInDuplicateGroups: physicalInGroups,
    logicalDocumentsRepresented: logical,
    physicalCopiesCollapsedInUi: collapsedInUi,
    scopeDifferencesWithinAGroup: out.filter((g) => g.scopesDiffer).length,
    byClassification: tally,
    detail: out,
  }, null, 1));
  console.log("  wrote audit/compliance-document-duplicate-groups.json");
  console.log("\nDUPLICATE GROUPS                 " + out.length);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log("   " + String(v).padStart(4) + "  " + k);
  console.log("\nphysical files in groups         " + physicalInGroups);
  console.log("logical documents represented    " + logical);
  console.log("physical copies collapsed in UI  " + collapsedInUi);
  console.log("groups where copies differ in scope " + out.filter((g) => g.scopesDiffer).length);
  console.log("UNCLASSIFIED                     " + unclassified);
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
