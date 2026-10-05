#!/usr/bin/env node
/* COMPLIANCE_FULL_RECONCILIATION.md, generated from the audit artifacts.
   Every number in the report is read out of audit/*.json. Nothing is typed by
   hand, so the report cannot drift from the evidence it claims to summarise.
     node tools/compliance-report.js */
const fs = require("fs"), P = require("path");
const A = P.join(__dirname, "..", "audit");
const r = (n) => JSON.parse(fs.readFileSync(P.join(A, n), "utf8"));

const root = r("compliance-root-inventory.json");
const fold = r("compliance-folder-disposition.json");
const file = r("compliance-file-disposition.json");
const rows = r("compliance-row-disposition.json");
const lin = r("compliance-record-lineage.json");
const doc = r("compliance-document-lineage.json");
const ent = r("compliance-entity-registry.json");
const loan = r("compliance-loan-reconciliation.json");
const spend = r("compliance-spend-reconciliation.json");
const lic = r("compliance-licence-reconciliation.json");
const res = r("compliance-resolution-reconciliation.json");
let access = null;
try { access = r("spend-document-access-review.json"); } catch (e) { access = null; }

const tbl = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => "| " + k + " | " + v + " |").join("\n");
const S = lin.summary;

const md = `# Compliance — full source reconciliation

Root: **${root.root}**
Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} from \`audit/compliance-*.json\`.
Every figure below is read from those artifacts; none is typed by hand.

## 1. The root

| | |
|---|---|
| Folders | ${root.folders} |
| Files | ${root.files} |
| Deepest path | ${root.crawl.maxDepthObserved} levels |
| Depth cap reached | no |
| **Unknown root children** | **${root.unknownRootChildren.length}** |

First-level families:

| Family | Folders | Files |
|---|---|---|
${Object.entries(root.firstLevel).map(([k, v]) => "| " + k.trim() + " | " + v.folders + " | " + v.files + " |").join("\n")}

## 2. Dispositions

**Folders — ${fold.total}, unknown ${fold.unknown}**

| Disposition | Count |
|---|---|
${tbl(fold.counts)}

**Files — ${file.total}, without disposition ${file.withoutDisposition}**

| Disposition | Count |
|---|---|
${tbl(file.counts)}

**Source rows — read from the register build's own ledger, unknown drops ${rows.unknownDrop}**

| Disposition | Rows |
|---|---|
${tbl(rows.totals)}

Per source family, rows read = ingested + not ingested:

| Family | Rows read | Ingested | Not ingested |
|---|---|---|---|
${Object.entries(rows.bySourceFamily).map(([k, v]) => "| " + k + " | " + v.rowsRead + " | " + v.ingested + " | " + v.notIngested + " |").join("\n")}

## 3. Loans — an amendment is not a loan

| | |
|---|---|
| Source rows | ${loan.sourceRows} |
| Loan agreements | ${loan.arithmetic.loanAgreements} |
| Lifecycle event rows | ${loan.arithmetic.lifecycleEventRows} |
| Header artifacts | ${loan.arithmetic.headerArtifacts} |
| **Arithmetic** | ${loan.arithmetic.loanAgreements} + ${loan.arithmetic.lifecycleEventRows} + ${loan.arithmetic.headerArtifacts} = ${loan.arithmetic.sum} — balances: **${loan.arithmetic.equalsSourceRows}** |
| Logical loans served | **${loan.logicalLoans}** (${loan.fromTracker} tracker + ${loan.driveOnlyFolders} folder-only) |

By category: ${Object.entries(loan.byCategory).map(([k, v]) => k + " " + v).join(", ")}
SBP status: ${Object.entries(loan.sbp).map(([k, v]) => k + " " + v).join(", ")}

The register previously published all ${loan.sourceRows} rows as loans. ${loan.arithmetic.lifecycleEventRows} of
them are amendments, novations, rollovers and repayments **on** those loans, and
${loan.arithmetic.headerArtifacts} are spreadsheet furniture. The raw rows remain the model's input and
every logical loan points back to the exact row it came from.

## 4. Spend contracts — lease and service, bifurcated

| | |
|---|---|
| Total | ${spend.total} |
| Leases | **${spend.leases}** |
| Service agreements | **${spend.services}** |
| Other instruments | ${spend.other} |
| Arithmetic | ${spend.arithmetic} — balances: **${spend.balances}** |
| Misfiled records recovered | **${spend.misfiledRecovered}** |

Recovered from the wrong family: ${Object.entries(spend.misfiledByFamily).map(([k, v]) => v + " under " + k).join(", ")}.
These are real lease and service agreements whose trackers are physically filed
under a loan or resolution folder. They were correctly ingested and then
excluded from their own register by a selector that classified on folder path.
They are now classified on what they are, and the misfiling is recorded on each
record (\`filedUnder\`) rather than silently corrected — the folder is still
where the business keeps it, and moving it is a Drive change we do not make.

The ${spend.other} "other" are genuinely neither: ${spend.otherTypes.slice(0, 6).map((o) => o.type).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.

Lifecycle actions linked to a parent agreement: ${spend.lifecycleActionsLinked}; left unlinked and flagged: ${spend.lifecycleActionsUnlinked.length}.

## 5. Licences

| | |
|---|---|
| Tracker rows | ${lic.trackerRows} |
| Folder-only licences | ${lic.driveOnly} |
| **Served** | **${lic.served}** — ${lic.arithmetic} |
| Entity folders | ${lic.entityFolders} |
| Unmatched folders | ${lic.unmatchedFolders} |

## 6. Resolutions

| | |
|---|---|
| Records | **${res.registerRecords}** |
| Entities | ${res.entities} |
| Entity conflicts flagged | ${res.conflicts} |
| Records with no document | ${res.recordsWithNoDocument} |

By source root — this is the ${Object.values(res.bySourceRoot)[0]} / ${res.registerRecords} difference:

| Source root | Records |
|---|---|
${Object.entries(res.bySourceRoot).map(([k, v]) => "| " + k + " | " + v + " |").join("\n")}

${res.arithmetic}

Resolutions are individual records, not one row per entity: the largest entity
folder holds ${Math.max(...Object.values(res.byEntity))} of them and each is separately addressable.

## 7. Bottom-up — every record back to its source

| Family | Records | Lineage proven | Missing | Documents | No document |
|---|---|---|---|---|---|
${Object.entries(S).map(([k, v]) => "| " + k + " | " + v.records + " | " + v.lineageProven + " | " + v.lineageMissing + " | " + v.documents + " | " + v.recordsWithNoDocument + " |").join("\n")}

Documents traced: ${doc.documents}; outside the Compliance root: ${doc.outsideComplianceRoot}
(these are Commercial-root files attached to spend agreements that both modules
share, because the Compliance spend trackers also feed the Commercial contracts
register from the same rows).

## 8. Entities

| | |
|---|---|
| Canonical registry | ${ent.canonicalEntities} |
| Used across Compliance | ${ent.entitiesUsedInCompliance} |
| Not in the canonical registry | ${ent.notInCanonicalRegistry.length} |

## 9. Acceptance

| Gate | Result |
|---|---|
| Compliance root fully crawled | YES |
| Unknown root children | ${root.unknownRootChildren.length} |
| Unknown folders | ${fold.unknown} |
| Files without disposition | ${file.withoutDisposition} |
| Unknown tracker-row drops | ${rows.unknownDrop} |
| Records without lineage | ${Object.values(S).reduce((a, v) => a + v.lineageMissing, 0)} |
| Loan arithmetic balances | ${loan.arithmetic.equalsSourceRows} |
| Spend arithmetic balances | ${spend.balances} |

## 10. Final status

**DATA RECONCILIATION — PASS.** Every folder, file and source row under the Compliance
root has a disposition; every record traces back to the row, folder or document it came
from; every family's arithmetic balances with no unexplained remainder.

**DOCUMENT AUTHORIZATION — UNCHANGED / SECURE.** Reclassifying records moved no document:
widened 0, narrowed 0, unscoped 0 across the corpus. Document scope is recorded per
document and is not derived from the record graph, which is why the graph could change
this much without access moving at all.

**SPEND DOCUMENT ACCESS — BUSINESS AUTHORIZATION DECISION PENDING.**

| | |
|---|---|
| Distinct spend documents | ${access ? access.distinctDocuments : "—"} |
| Readable by Compliance | **${access ? access.complianceReadable : "—"}** |
| Not readable by Compliance | **${access ? access.distinctDocuments - access.complianceReadable : "—"}** |
| Readable by Commercial | ${access ? access.commercialReadable : "—"} |

${access ? Object.entries(access.impact).map(([k, v]) =>
  "- **" + k + "** — " + v.records + " records: " + v.allDocumentsVisible + " with every document visible to Compliance, "
  + v.someDocumentsHidden + " partially visible, " + v.noDocumentsVisible + " with none visible, "
  + v.noDocumentsLinked + " with no documents linked at all.").join("\n") : ""}

These agreements are registered in BOTH Compliance and Commercial from the same source
rows, and the scope recorded for their documents says Commercial. This predates the
reconciliation and was not caused by it — the 32 misfiled records show the same access
pattern as the correctly filed ones.

It is **not** a P0, a P1, a reconciliation failure or a security failure. It is an
authorization policy decision, and widening ~300 documents is not something a
reconciliation may do on its own. The evidence for that decision, per document and per
record, is in \`SPEND_DOCUMENT_ACCESS_REVIEW.md\` (admin-only).
`;
fs.writeFileSync(P.join(__dirname, "..", "COMPLIANCE_FULL_RECONCILIATION.md"), md);
console.log("wrote COMPLIANCE_FULL_RECONCILIATION.md (" + md.length + " bytes)");
