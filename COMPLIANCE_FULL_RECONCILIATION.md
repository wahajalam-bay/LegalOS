# Compliance — full source reconciliation

Root: **Compliance Data _LegalOS**
Generated 2026-09-23 06:07 from `audit/compliance-*.json`.
Every figure below is read from those artifacts; none is typed by hand.

## 1. The root

| | |
|---|---|
| Folders | 190 |
| Files | 1772 |
| Deepest path | 7 levels |
| Depth cap reached | no |
| **Unknown root children** | **0** |

First-level families:

| Family | Folders | Files |
|---|---|---|
| Zameen Group_Loan Agreements | 50 | 380 |
| Zameen Group _PK Intercompany Loans | 61 | 152 |
| Licenses & Approvals _ Pakistan Entities | 11 | 18 |
| Resolutions | 43 | 850 |
| Spend Contracts (Lease and Service Agreements) | 25 | 372 |

## 2. Dispositions

**Folders — 190, unknown 0**

| Disposition | Count |
|---|---|
| LOAN_FOLDER | 56 |
| RESOLUTION_ENTITY_FOLDER | 42 |
| DOCUMENT_FOLDER | 34 |
| ENTITY_FOLDER | 25 |
| SERVICE_FOLDER | 10 |
| LICENCE_ENTITY_FOLDER | 8 |
| LEASE_FOLDER | 8 |
| MODULE_ROOT | 5 |
| APPLICATION_FOLDER | 1 |
| LICENCE_FOLDER | 1 |

**Files — 1772, without disposition 0**

| Disposition | Count |
|---|---|
| RECORD_DOCUMENT | 1045 |
| ACTION_DOCUMENT | 348 |
| CORRESPONDENCE | 172 |
| APPLICATION_DOCUMENT | 75 |
| SOURCE_TRACKER | 69 |
| PAYMENT_RECEIPT | 30 |
| ACKNOWLEDGEMENT | 16 |
| RENEWAL_DOCUMENT | 9 |
| EXECUTED_DOCUMENT | 3 |
| SYSTEM_FILE | 2 |
| HISTORICAL_DOCUMENT | 2 |
| LETTERHEAD | 1 |

**Source rows — read from the register build's own ledger, unknown drops 0**

| Disposition | Rows |
|---|---|
| INGESTED_RECORD | 1227 |
| NOT_A_REGISTER_SHEET | 368 |
| INCOMPLETE_SOURCE_RECORD | 132 |
| PADDING_ROW | 50 |
| MERGED_DUPLICATE | 47 |

Per source family, rows read = ingested + not ingested:

| Family | Rows read | Ingested | Not ingested |
|---|---|---|---|
| Zameen Group_Loan Agreements | 548 | 30 | 518 |
| Zameen Group _PK Intercompany Loans | 86 | 60 | 26 |
| Licenses & Approvals _ Pakistan Entities | 7 | 7 | 0 |
| Resolutions | 923 | 918 | 5 |
| Spend Contracts (Lease and Service Agreements) | 260 | 212 | 48 |

## 3. Loans — an amendment is not a loan

| | |
|---|---|
| Source rows | 192 |
| Loan agreements | 60 |
| Lifecycle event rows | 117 |
| Header artifacts | 15 |
| **Arithmetic** | 60 + 117 + 15 = 192 — balances: **true** |
| Logical loans served | **69** (60 tracker + 9 folder-only) |

By category: international 25, intercompany 44
SBP status: REGISTERED 10, SUBMITTED 8, PENDING 5, UNKNOWN 2, NOT_REQUIRED 44

The register previously published all 192 rows as loans. 117 of
them are amendments, novations, rollovers and repayments **on** those loans, and
15 are spreadsheet furniture. The raw rows remain the model's input and
every logical loan points back to the exact row it came from.

## 4. Spend contracts — lease and service, bifurcated

| | |
|---|---|
| Total | 199 |
| Leases | **102** |
| Service agreements | **83** |
| Other instruments | 14 |
| Arithmetic | 102 + 83 + 14 = 199 — balances: **true** |
| Misfiled records recovered | **32** |

Recovered from the wrong family: 20 under Zameen Group _PK Intercompany Loans, 4 under Resolutions, 8 under Zameen Group_Loan Agreements.
These are real lease and service agreements whose trackers are physically filed
under a loan or resolution folder. They were correctly ingested and then
excluded from their own register by a selector that classified on folder path.
They are now classified on what they are, and the misfiling is recorded on each
record (`filedUnder`) rather than silently corrected — the folder is still
where the business keeps it, and moving it is a Drive change we do not make.

The 14 "other" are genuinely neither: Cash Management
 Agreement, Non-Disclosure Agreement, Sale & Purchase Agreement.

Lifecycle actions linked to a parent agreement: 2; left unlinked and flagged: 2.

## 5. Licences

| | |
|---|---|
| Tracker rows | 7 |
| Folder-only licences | 1 |
| **Served** | **8** — 7 tracker + 1 folder-only = 8 |
| Entity folders | 8 |
| Unmatched folders |  |

## 6. Resolutions

| | |
|---|---|
| Records | **933** |
| Entities | 43 |
| Entity conflicts flagged | 13 |
| Records with no document | 20 |

By source root — this is the 19 / 933 difference:

| Source root | Records |
|---|---|
| Entities data for secp filing | 19 |
| Compliance Data _LegalOS | 914 |

19 Entities data for secp filing  +  914 Compliance Data _LegalOS  =  933

Resolutions are individual records, not one row per entity: the largest entity
folder holds 201 of them and each is separately addressable.

## 7. Bottom-up — every record back to its source

| Family | Records | Lineage proven | Missing | Documents | No document |
|---|---|---|---|---|---|
| loans | 69 | 69 | 0 | 841 | 0 |
| leases | 102 | 102 | 0 | 212 | 3 |
| services | 83 | 83 | 0 | 100 | 16 |
| other-spend | 14 | 14 | 0 | 11 | 6 |
| licences | 8 | 8 | 0 | 14 | 0 |
| resolutions | 933 | 933 | 0 | 913 | 20 |

Documents traced: 2091; outside the Compliance root: 5
(these are Commercial-root files attached to spend agreements that both modules
share, because the Compliance spend trackers also feed the Commercial contracts
register from the same rows).

## 8. Entities

| | |
|---|---|
| Canonical registry | 72 |
| Used across Compliance | 34 |
| Not in the canonical registry | 2 |

## 9. Acceptance

| Gate | Result |
|---|---|
| Compliance root fully crawled | YES |
| Unknown root children | 0 |
| Unknown folders | 0 |
| Files without disposition | 0 |
| Unknown tracker-row drops | 0 |
| Records without lineage | 0 |
| Loan arithmetic balances | true |
| Spend arithmetic balances | true |

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
| Distinct spend documents | 321 |
| Readable by Compliance | **311** |
| Not readable by Compliance | **10** |
| Readable by Commercial | 305 |

- **Lease** — 102 records: 95 with every document visible to Compliance, 2 partially visible, 2 with none visible, 3 with no documents linked at all.
- **Service Agreement** — 83 records: 62 with every document visible to Compliance, 1 partially visible, 4 with none visible, 16 with no documents linked at all.
- **Other Spend** — 14 records: 8 with every document visible to Compliance, 0 partially visible, 0 with none visible, 6 with no documents linked at all.

These agreements are registered in BOTH Compliance and Commercial from the same source
rows, and the scope recorded for their documents says Commercial. This predates the
reconciliation and was not caused by it — the 32 misfiled records show the same access
pattern as the correctly filed ones.

It is **not** a P0, a P1, a reconciliation failure or a security failure. It is an
authorization policy decision, and widening ~300 documents is not something a
reconciliation may do on its own. The evidence for that decision, per document and per
record, is in `SPEND_DOCUMENT_ACCESS_REVIEW.md` (admin-only).
