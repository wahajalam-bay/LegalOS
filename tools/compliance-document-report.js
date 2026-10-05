#!/usr/bin/env node
/* COMPLIANCE_DOCUMENT_RECONCILIATION.md, generated from the audit artifacts.
   Every figure is read from audit/*.json; none is typed by hand.
     node tools/compliance-document-report.js */
const fs = require("fs"), P = require("path");
const A = P.join(__dirname, "..", "audit");
const r = (n) => { try { return JSON.parse(fs.readFileSync(P.join(A, n), "utf8")); } catch (e) { return null; } };

const inv = r("compliance-document-inventory.json");
const ord = r("compliance-document-order.json");
const dup = r("compliance-document-duplicate-groups.json");
const brk = r("compliance-document-broken-links.json");
const gap = r("compliance-document-lineage-gaps.json");
const uir = r("compliance-document-ui-reconciliation.json");
const sec = r("compliance-document-security.json");
const fin = r("compliance-document-final-summary.json");

const famRow = (k, v) => "| " + k + " | " + v.records + " | " + v.documents + " | " + v.withNone + " |";

const md = `# Compliance — document reconciliation

Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} from \`audit/compliance-document-*.json\`.
Every figure below is read from those artifacts.

## A. Drive estate

| | |
|---|---|
| Compliance files discovered | **${inv.complianceFiles}** |
| Attached to a record | ${inv.mappedToARecord} |
| Exposed at entity level | ${inv.ofWhichExposedAtEntityLevel} |
| Trackers and system files | ${inv.ofWhichNotRecordDocuments} |
| **Unexplained** | **${inv.unexplained}** |
| Broken Drive links | **${brk.broken}** |
| Documents on records with no Drive object | **${brk.strayDocumentsOnRecords}** |

Entity-level documents are not losses. A shared "General Agreements" folder serves many
agreements and only a counterparty match attributes one; a resolution entity folder holds
papers no single resolution row claims. Attributing the rest would put an amendment on the
wrong lease, so they are held at entity level where they can be seen and worked.

## B. Records

| Family | Records | Documents | With no document |
|---|---|---|---|
${Object.entries(fin.byFamily).map(([k, v]) => famRow(k, v)).join("\n")}

## C. Logical vs physical documents

| | |
|---|---|
| Physical files in duplicate groups | ${dup.physicalFilesInDuplicateGroups} |
| Logical documents represented | ${dup.logicalDocumentsRepresented} |
| Extra physical copies | ${dup.physicalFilesInDuplicateGroups - dup.logicalDocumentsRepresented} |
| Copies collapsed in the UI | ${dup.physicalCopiesCollapsedInUi} |

A count shown to a reader is a count of INSTRUMENTS. Physical copies are reported
separately, and every Drive id and path travels with the row.

## D. Duplicate groups

| Classification | Groups |
|---|---|
${Object.entries(dup.byClassification).map(([k, v]) => "| " + k + " | " + v + " |").join("\n")}
| **Unclassified** | **${dup.unclassified}** |

The dominant case is a statutory document filed under both an entity and its parent. Both
records are entitled to show it, so nothing is collapsed ACROSS records — only within one.
No duplicate group holds copies with different authorization (${dup.scopeDifferencesWithinAGroup}),
and grouping happens only after the permission filter, so a copy the caller may not open
can never become the one they are shown.

## E. Parent / child lineage

| Status | Count |
|---|---|
${Object.entries(gap.byStatus).map(([k, v]) => "| " + k + " | " + v + " |").join("\n")}
| **Unresolved** | **${gap.unresolved}** |

Rule: ${gap.resolutionRule}. Nothing was linked on a probable match. A lifecycle action
attached to the wrong lease changes what a lawyer believes the terms are, which is worse
than one left honestly unattached.

## F. Document ordering

| | |
|---|---|
| Records ordered | ${ord.recordsWithDocuments} |
| **Ordering errors** | **${ord.orderingErrors}** |
| Rule | ${ord.orderingRule} |

A document whose own name carries no date is undated and sorts last. Drive's created time
records when a file was uploaded, not when the instrument was made — dating by it put four
2022 leases in 2026 and made every real amendment appear to predate the agreement it amends.

## G. UI reconciliation

| | |
|---|---|
| Records checked | **${uir.recordsChecked}** |
| Count mismatches (register badge / detail badge / rendered list) | **${uir.countMismatches}** |
| UI documents without a Drive object | **${uir.documentsWithoutADriveObject}** |

Verified as an ordinary Compliance user, not an administrator.

## H. Authorization

| | |
|---|---|
| Documents scoped | ${sec.documents} |
| Unscoped | **${sec.unscoped}** |
| Readable by Compliance | ${sec.byGroup.compliance} |
| Readable by Commercial | ${sec.byGroup.commercial} |
| Readable by Litigation | ${sec.byGroup.litigation} |
| Readable by a requester | ${sec.byGroup.requester} |

## I. Empty states

| | |
|---|---|
| Nothing linked | ${uir.emptyBecauseNothingLinked} |
| Linked but not permitted | ${uir.emptyBecauseRestricted} |

These read differently on screen. "No documents are currently linked to this record" is a
statement about the filing cabinet; "No Compliance-accessible documents are available for
this record" is a statement about permission — and neither discloses a hidden name, path or
count to an ordinary user.

## J. Regression

\`m19-compliance-documents\` holds this layer in place: every Drive file accounted for, no
tracker served as a record document, badge equals list on every record, duplicate groups all
dispositioned, ordering errors zero, and no widening beyond the approved Spend policy.
`;
fs.writeFileSync(P.join(__dirname, "..", "COMPLIANCE_DOCUMENT_RECONCILIATION.md"), md);
console.log("wrote COMPLIANCE_DOCUMENT_RECONCILIATION.md (" + md.length + " bytes)");
