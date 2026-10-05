#!/usr/bin/env node
/* Writes SECP_FULL_RECONCILIATION.md from the audit artifacts, so no number in
 * the prose can drift from the number the model actually holds.
 *   node tools/secp-report.js
 */
const fs = require("fs"), P = require("path");
const ROOT = P.join(__dirname, "..");
const a = (n) => JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8"));

const inv = a("secp-root-inventory.json"), reg = a("secp-entity-registry.json");
const mat = a("secp-year-matrix.json"), disp = a("secp-file-disposition.json");
const ann = a("secp-annual-compliance.json"), ev = a("secp-event-filings.json");
const rgs = a("secp-statutory-registers.json"), lin = a("secp-document-lineage.json");
const rec = a("secp-ui-reconciliation.json"), sum = a("secp-final-summary.json");

const n = (x) => Number(x).toLocaleString();
const gate = (k, v) => "| " + k.replace(/_/g, " ") + " | " + v + " | " + (v === 0 ? "PASS" : "FAIL") + " |";

const md = `# SECP & Statutory Compliance — full reconciliation

Generated ${sum.generatedAt} by \`tools/secp-reconcile.js\`.

## What changed

The module reported **0 recorded filings · 52 entities · 33 compliance years** over a
Google Drive estate holding **${n(inv.files)} statutory documents**. Nothing was missing from
the source. The register was reading a legacy path that derived a handful of years from
board minutes, and the statutory tree itself had never been turned into records.

The folder is now the record. \`Group Entities / <company> / CY 2024\` is deterministic
evidence that the company has a 2024 compliance year, whether or not any tracker says so.

## The Drive estate

| | |
|---|---|
| Source root | \`${inv.root}\` |
| Files | ${n(inv.files)} |
| Root children | ${Object.keys(inv.rootChildren).join(", ")} |
| Unknown root children | ${inv.unknownRootChildren.length} |

## Entities

| | |
|---|---|
| Companies with a statutory folder | **${reg.entities}** |
| Group entities | ${reg.group} |
| Non-group entities | ${reg.nonGroup} |
| Canonical distinct entities | ${reg.canonicalDistinct} |
| By legal form | ${Object.entries(reg.byType).map(([k, v]) => v + " " + k.replace(/_/g, " ").toLowerCase()).join(", ")} |

Group / non-group provenance is preserved as structural metadata. Spelling and casing
variants (\`SMC-Pvt\`, \`SMC-Private\`, \`(Pvt) Ltd\`) resolve to one canonical entity, with
the original folder wording kept as the source alias.

**Two companies are filed inside another company's folder in Drive** — Zameen Delta sits
under \`Zameen Crest / CY 2024 /\`, and Zameen Nord under \`Zameen Medallion /\`. Reading the
entity as "the folder under Group Entities" handed Delta's audited accounts and AGM
minutes to Crest. The owning entity is now the deepest path segment naming a known
company; **${n(lin.filesInAnotherEntitysFolder)} files** are attributed to the company they
belong to, and the misfiling is recorded rather than silently corrected. No Drive write
was made.

## Compliance years

| | |
|---|---|
| Entity-year records | **${n(sum.complianceYears.entityYearRecords)}** |
| Distinct calendar years | ${sum.complianceYears.distinctCalendarYears} (${sum.complianceYears.range}) |
| Year folders in Drive without a record | ${rec.foldersWithoutRecord.length} |
| Records without a year folder | ${rec.recordsWithoutFolder.length} |
| Entity-years with no document | ${ann.withoutDocuments} |

"${n(sum.complianceYears.entityYearRecords)} entity-year records across
${sum.complianceYears.distinctCalendarYears} calendar years" is the honest statement of the
estate. The old card's "33 compliance years evidenced" named neither quantity.

The source wording is preserved verbatim: a folder named \`CY 2024\` is reported as
\`CY 2024\`, with \`periodType\` and \`complianceYear\` modelled separately. Nothing is
relabelled FY.

## Annual compliance

| | |
|---|---|
| Records | ${n(ann.records)} |
| With submission evidence | ${ann.provenSubmissions} |
| With an acknowledgement | ${ann.acknowledgements} |
| AGM not applicable (SMC) | ${ann.agmNotApplicable} |

Annual rows show exactly the forms \`config/compliance-rules.json\` classifies as annual —
Form A, Form 9, Form 19. The code previously hardcoded Form 29 as annual, contradicting
that configuration and pulling change-of-officer filings into annual rows.

A single-member company holds no annual general meeting, so an SMC never shows an AGM
requirement. That rule lives in one place, not in per-screen conditions.

## Event-based filings

| | |
|---|---|
| Records | **${n(ev.records)}** |
| Dated from the document | ${n(ev.dated)} |
| Undated (no date stated in source) | ${ev.undated} |
| With submission evidence | ${ev.provenSubmissions} |

By form / event type: ${Object.entries(ev.byForm).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + " (" + v + ")").join(", ")}.

The previous build excluded any document inside a \`CY\` folder, which is exactly where
these live — the Form 29 for a 2022 director change sits in CY 2022. That single exclusion
hid almost the whole event estate and left the register showing 6 records.

Copies do not inflate the register: one event is one record, keyed on company, form and
the date the filename states, with every physical copy attached.

## Statutory registers

| | |
|---|---|
| Records | ${rgs.records} |
| Counted as filings | **${rgs.countedAsFilings}** |

${Object.entries(rgs.byCategory).sort((x, y) => y[1] - x[1]).map(([k, v]) => "- " + k.replace(/_/g, " ").toLowerCase() + " — " + v).join("\n")}

Registers of members and directors and share certificates are corporate records, not
filings, and never inflate the filing counts. Spelling variants in Drive
(\`Register of Director\`, \`Register Of Members\`, \`Shareholder_s Certificates\`) normalise
to one category each.

## Documents

| | |
|---|---|
| Files under the root | ${n(disp.rootFiles)} |
| Files reaching a record | ${n(disp.disposed)} |
| **Files without a disposition** | **${disp.withoutDisposition}** |
| Files in more than one register | ${n(disp.inMultipleRegisters)} |
| Record → Drive mappings | ${n(lin.mappings)} |
| Broken Drive links | ${lin.brokenLinks} |

A file appearing in two registers is expected and correct: a Form 29 lodged in CY 2022
belongs to that year's folder *and* is an event filing.

Document dates are read from the document. Drive's created and modified times are never
used as an AGM, filing, execution or financial-statement date.

## What counts as a filing

| | |
|---|---|
| Entity-year records | ${n(sum.complianceYears.entityYearRecords)} |
| Event filing records | ${n(sum.eventFilings.records)} |
| **Filings proven submitted** | **${sum.filings.provenSubmitted}** |
| Acknowledgements received | ${sum.filings.acknowledgementsReceived} |

Every statutory item carries three separate states — \`documentStatus\`, \`filingStatus\`,
\`acknowledgementStatus\`. A Form A on file proves the company *prepared* one; only a
receipt, challan, acknowledgement or eZfile confirmation proves SECP received it.
Collapsing these into one status is how a register comes to claim compliance nobody can
produce a receipt for. The estate holds thousands of documents and
**${sum.filings.provenSubmitted} filings with explicit submission evidence**; both numbers
are shown, and neither is presented as the other.

## Acceptance gates

| Gate | Value | Result |
|---|---|---|
${Object.entries(sum.gates).map(([k, v]) => gate(k, v)).join("\n")}

## Artifacts

${["secp-root-inventory", "secp-entity-registry", "secp-year-matrix", "secp-file-disposition",
   "secp-annual-compliance", "secp-event-filings", "secp-statutory-registers",
   "secp-document-lineage", "secp-ui-reconciliation", "secp-final-summary"]
  .map((f) => "- `audit/" + f + ".json`").join("\n")}

## Source-backed history is not future planning

The workspace printed **FY 2028 / FY 2027 / FY 2026** in its header, above ten years of
real filings. Those labels are a formula's output -- current financial year plus one,
six back -- and nothing in Drive asserts them. Beside a CY 2024 folder they read exactly
like source.

They are now separate populations, and no screen or number combines them:

| | |
|---|---|
| Source-backed entity-year records | ${sum.complianceYears.entityYearRecords} (a Drive folder exists) |
| System-generated future obligations | computed from \`config/compliance-rules.json\` |

Future obligations live in their own **Upcoming obligations** view, labelled
system-generated, each due date citing the configured rule that produced it (year end plus
\`annualReturnDaysAfterYearEnd\` or \`agmDaysAfterYearEnd\`). The compliance history shows only
years Drive holds a folder for. Administration -> Data Health reports the two counts
separately and asserts \`driveYearsMissingFromUI = 0\` and \`uiYearsAbsentFromDrive = 0\`.

The entity register likewise lists the companies Drive actually holds a statutory folder
for. LegalOS knows more names than the estate contains -- former names, alternative
spellings, and foreign entities outside SECP jurisdiction -- and those stay reachable
behind a scope selector rather than padding the register with rows that have no folder,
no years and no documents.

## Google Drive is the source of truth

This reconciliation is **read-only** against Drive. The service account holds
\`drive.readonly\` and nothing else, so no code path in this application can alter the
source. \`tests/m22-drive-readonly.js\` fails if that scope ever widens, if any server
module gains a Drive write, or if a single file id, folder id or parent id changes across
a full build.

Every record and every document retains its provenance unmodified:

| Field | Meaning |
|---|---|
| \`driveFileId\` | the file's Drive id |
| \`exactSourceFilename\` | the filename Drive holds, never a cleaned-up version |
| \`fullDrivePath\` | the complete path from the crawl root |
| \`sourceRootId\` / \`sourceRootName\` | the crawl root |
| \`sourceFolderId\` / \`sourceFolderName\` | the folder containing the file |
| \`parentFolderId\` / \`parentFolderName\` | that folder's parent |

Normalization decides what the register *displays* -- a canonical entity name, a document
type, a lifecycle stage. It never rewrites where the source lives. Where the two disagree,
both are kept: a file filed inside another company's folder is attributed to the company
it belongs to **and** reports the Drive path it actually sits at, flagged
\`sourceLocationMismatch\`.

Regression: \`node tests/m20-secp-statutory.js\`, \`node tests/m21-secp-workspace.js\`,
\`node tests/m22-drive-readonly.js\`, \`node tests/m23-resolutions-source.js\`.

No document bodies are stored in any artifact, and no write of any kind was made to the
Drive source.
`;
fs.writeFileSync(P.join(ROOT, "SECP_FULL_RECONCILIATION.md"), md);
console.log("wrote SECP_FULL_RECONCILIATION.md (" + md.split("\n").length + " lines)");
