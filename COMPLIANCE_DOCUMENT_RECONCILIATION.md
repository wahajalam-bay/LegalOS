# Compliance — document reconciliation

Generated 2026-09-23 06:07 from `audit/compliance-document-*.json`.
Every figure below is read from those artifacts.

## A. Drive estate

| | |
|---|---|
| Compliance files discovered | **5139** |
| Attached to a record | 4969 |
| Exposed at entity level | 155 |
| Trackers and system files | 15 |
| **Unexplained** | **0** |
| Broken Drive links | **0** |
| Documents on records with no Drive object | **0** |

Entity-level documents are not losses. A shared "General Agreements" folder serves many
agreements and only a counterparty match attributes one; a resolution entity folder holds
papers no single resolution row claims. Attributing the rest would put an amendment on the
wrong lease, so they are held at entity level where they can be seen and worked.

## B. Records

| Family | Records | Documents | With no document |
|---|---|---|---|
| loans | 69 | 967 | 0 |
| leases | 102 | 315 | 2 |
| services | 83 | 172 | 13 |
| other-spend | 14 | 12 | 6 |
| resolutions | 933 | 913 | 20 |
| licences | 8 | 17 | 0 |
| secp | 43 | 3361 | 0 |

## C. Logical vs physical documents

| | |
|---|---|
| Physical files in duplicate groups | 447 |
| Logical documents represented | 223 |
| Extra physical copies | 224 |
| Copies collapsed in the UI | 28 |

A count shown to a reader is a count of INSTRUMENTS. Physical copies are reported
separately, and every Drive id and path travels with the row.

## D. Duplicate groups

| Classification | Groups |
|---|---|
| E_SAME_FILE_USED_BY_MULTIPLE_RECORDS_LEGITIMATELY | 194 |
| A_SAME_DOCUMENT_MULTIPLE_PHYSICAL_COPIES | 28 |
| F_UNATTRIBUTED_INSTRUMENT_HELD_TWICE | 1 |
| **Unclassified** | **0** |

The dominant case is a statutory document filed under both an entity and its parent. Both
records are entitled to show it, so nothing is collapsed ACROSS records — only within one.
No duplicate group holds copies with different authorization (0),
and grouping happens only after the permission filter, so a copy the caller may not open
can never become the one they are shown.

## E. Parent / child lineage

| Status | Count |
|---|---|
| CONFIRMED_PARENT | 2 |
| SOURCE_ONLY_CHILD | 8 |
| PROBABLE_PARENT_NOT_OPERATIONAL | 7 |
| NO_PARENT_REQUIRED | 1 |
| **Unresolved** | **0** |

Rule: same internal entity AND same counterparty AND an agreement starting on or before the child's date; linked only when exactly one candidate survives. Nothing was linked on a probable match. A lifecycle action
attached to the wrong lease changes what a lawyer believes the terms are, which is worse
than one left honestly unattached.

## F. Document ordering

| | |
|---|---|
| Records ordered | 1211 |
| **Ordering errors** | **0** |
| Rule | explicit date ascending; undated last; ties broken by lifecycle rank |

A document whose own name carries no date is undated and sorts last. Drive's created time
records when a file was uploaded, not when the instrument was made — dating by it put four
2022 leases in 2026 and made every real amendment appear to predate the agreement it amends.

## G. UI reconciliation

| | |
|---|---|
| Records checked | **1195** |
| Count mismatches (register badge / detail badge / rendered list) | **0** |
| UI documents without a Drive object | **0** |

Verified as an ordinary Compliance user, not an administrator.

## H. Authorization

| | |
|---|---|
| Documents scoped | 4974 |
| Unscoped | **0** |
| Readable by Compliance | 4952 |
| Readable by Commercial | 317 |
| Readable by Litigation | 0 |
| Readable by a requester | 0 |

## I. Empty states

| | |
|---|---|
| Nothing linked | 35 |
| Linked but not permitted | 6 |

These read differently on screen. "No documents are currently linked to this record" is a
statement about the filing cabinet; "No Compliance-accessible documents are available for
this record" is a statement about permission — and neither discloses a hidden name, path or
count to an ordinary user.

## J. Regression

`m19-compliance-documents` holds this layer in place: every Drive file accounted for, no
tracker served as a record document, badge equals list on every record, duplicate groups all
dispositioned, ordering errors zero, and no widening beyond the approved Spend policy.
