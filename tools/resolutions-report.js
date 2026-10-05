#!/usr/bin/env node
/* Writes RESOLUTIONS_RECONCILIATION.md from the audit artifacts, so no number
 * in the prose can drift from what the model holds.
 *   node tools/resolutions-report.js
 */
const fs = require("fs"), P = require("path");
const ROOT = P.join(__dirname, "..");
const a = (n) => JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8"));
const inv = a("resolutions-source-inventory.json");
const recs = a("resolutions-records.json");
const disp = a("resolutions-file-disposition.json");
const sum = a("resolutions-final-summary.json");
const n = (x) => Number(x).toLocaleString();

const md = `# Board resolutions — reconciliation

Generated ${sum.generatedAt} by \`tools/resolutions-reconcile.js\`.

## The estate

| | |
|---|---|
| Source roots | ${inv.roots.map((r) => "\`" + r + "\`").join(", ")} |
| Resolution entity folders | ${inv.folders.length} |
| Source files | ${n(inv.sourceFiles)} |
| Document files | ${n(inv.documentFiles)} |
| Tracker spreadsheets | ${inv.trackerFiles} |

Resolution folders live under **two** roots: \`Compliance Data _LegalOS / Resolutions\`
and each company's own \`<entity>-Resolutions & Authorizations\` folder inside the SECP
root. The document sweep was restricted to the compliance root, so every resolution filed
in the other one resolved to no document at all.

## Records

| | |
|---|---|
| Individual resolutions | **${n(sum.records.individualResolutions)}** |
| Indexed by a tracker sheet | ${n(sum.records.fromTracker)} |
| Derived from the folder alone | ${sum.records.fromFolderOnly} |
| Entities represented | ${sum.records.entitiesRepresented} |
| Documents on records | ${n(sum.records.documentsOnRecords)} |
| Resolutions carrying more than one document | ${sum.records.recordsWithMoreThanOneDocument} |
| Resolutions with no document found | ${sum.records.recordsWithNoDocument} |

An entity folder is a container, not a record. Each numbered resolution inside it is its
own record, and carries every document filed under that number — the resolution, the board
minute, the notice, the signed copy, the acknowledgement. The matcher previously attached
the first file it found and stopped.

**A tracker is not required for a record to exist.** Companies that file resolutions in
Drive without maintaining the summary sheet had no records at all: Dubizzle Labs' entire
board-resolution history and eight of Zameen Medallion's, ${sum.records.fromFolderOnly}
documents in total. Those are now folder-derived records, marked
\`SOURCE_ONLY_NO_TRACKER_ROW\` so nobody mistakes them for tracker-indexed ones.

The register number grammar is the company's own: \`002\`, \`02\`, \`99.1\` (a sub-number)
and \`129A\` (a companion document filed under resolution 129) all belong to their
resolution, and sort in the company's own register order rather than by date.

## Disposition

| | |
|---|---|
| Document files | ${n(disp.documentFiles)} |
| Reaching a record | ${n(disp.disposed)} |
| **Without disposition** | **${disp.withoutDisposition}** |
| Held by another register family | ${disp.claimedByAnotherFamily.length} |

A document sitting in a resolutions folder does not always belong to the resolutions
register: ${disp.claimedByAnotherFamily.length === 1 ? "one is" : disp.claimedByAnotherFamily.length + " are"}
claimed by Commercial — a "Novation & Renewal" agreement is a contract, not a board
resolution — and the stronger claim wins rather than the file being listed twice or lost.

## Gates

| Gate | Value | Result |
|---|---|---|
${Object.entries(sum.gates).map(([k, v]) => "| " + k.replace(/_/g, " ") + " | " + v + " | " + (v === 0 ? "PASS" : "FAIL") + " |").join("\n")}

## Provenance

Every record retains, unmodified:

- \`sourceEntityFolder\` — the exact Drive folder name, suffix and all
- \`sourceFolderId\`, \`parentFolderId\`, \`sourceRootId\`, \`sourceRootName\`
- \`fullDrivePath\`
- every document's \`driveFileId\` and exact filename

The display entity is canonical ("Zameen Axis"); the source folder stays verbatim
("Zameen Axis(SMC-Pvt)Ltd_Resolutions & Authorizations"). Normalization decides what is
shown, never where the source lives.

## Artifacts

- \`audit/resolutions-source-inventory.json\`
- \`audit/resolutions-records.json\`
- \`audit/resolutions-file-disposition.json\`
- \`audit/resolutions-final-summary.json\`

Regression: \`node tests/m23-resolutions-source.js\`, \`node tests/m22-drive-readonly.js\`.

No write of any kind was made to the Drive source.
`;
fs.writeFileSync(P.join(ROOT, "RESOLUTIONS_RECONCILIATION.md"), md);
console.log("wrote RESOLUTIONS_RECONCILIATION.md (" + md.split("\n").length + " lines)");
