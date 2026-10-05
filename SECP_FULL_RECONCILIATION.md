# SECP & Statutory Compliance — full reconciliation

Generated 2026-09-23T19:28:02.704Z by `tools/secp-reconcile.js`.

## What changed

The module reported **0 recorded filings · 52 entities · 33 compliance years** over a
Google Drive estate holding **3,367 statutory documents**. Nothing was missing from
the source. The register was reading a legacy path that derived a handful of years from
board minutes, and the statutory tree itself had never been turned into records.

The folder is now the record. `Group Entities / <company> / CY 2024` is deterministic
evidence that the company has a 2024 compliance year, whether or not any tracker says so.

## The Drive estate

| | |
|---|---|
| Source root | `Entities data for secp filing` |
| Files | 3,367 |
| Root children | Group Entities, Non-Group Entities |
| Unknown root children | 0 |

## Entities

| | |
|---|---|
| Companies with a statutory folder | **43** |
| Group entities | 38 |
| Non-group entities | 5 |
| Canonical distinct entities | 43 |
| By legal form | 17 private limited, 25 smc, 1 other |

Group / non-group provenance is preserved as structural metadata. Spelling and casing
variants (`SMC-Pvt`, `SMC-Private`, `(Pvt) Ltd`) resolve to one canonical entity, with
the original folder wording kept as the source alias.

**Two companies are filed inside another company's folder in Drive** — Zameen Delta sits
under `Zameen Crest / CY 2024 /`, and Zameen Nord under `Zameen Medallion /`. Reading the
entity as "the folder under Group Entities" handed Delta's audited accounts and AGM
minutes to Crest. The owning entity is now the deepest path segment naming a known
company; **266 files** are attributed to the company they
belong to, and the misfiling is recorded rather than silently corrected. No Drive write
was made.

## Compliance years

| | |
|---|---|
| Entity-year records | **250** |
| Distinct calendar years | 15 (2012-2026) |
| Year folders in Drive without a record | 0 |
| Records without a year folder | 0 |
| Entity-years with no document | 0 |

"250 entity-year records across
15 calendar years" is the honest statement of the
estate. The old card's "33 compliance years evidenced" named neither quantity.

The source wording is preserved verbatim: a folder named `CY 2024` is reported as
`CY 2024`, with `periodType` and `complianceYear` modelled separately. Nothing is
relabelled FY.

## Annual compliance

| | |
|---|---|
| Records | 250 |
| With submission evidence | 35 |
| With an acknowledgement | 27 |
| AGM not applicable (SMC) | 115 |

Annual rows show exactly the forms `config/compliance-rules.json` classifies as annual —
Form A, Form 9, Form 19. The code previously hardcoded Form 29 as annual, contradicting
that configuration and pulling change-of-officer filings into annual rows.

A single-member company holds no annual general meeting, so an SMC never shows an AGM
requirement. That rule lives in one place, not in per-screen conditions.

## Event-based filings

| | |
|---|---|
| Records | **769** |
| Dated from the document | 679 |
| Undated (no date stated in source) | 90 |
| With submission evidence | 9 |

By form / event type: CORPORATE_ACTION (279), 29 (227), 28 (61), 21 (51), 45 (47), 3 (26), 1 (20), EOGM (17), 26 (11), 7 (8), 17 (6), SECP_NOTICE (5), 43 (3), 10 (2), 23 (2), 8 (1), 12 (1), I (1), INCORPORATION (1).

The previous build excluded any document inside a `CY` folder, which is exactly where
these live — the Form 29 for a 2022 director change sits in CY 2022. That single exclusion
hid almost the whole event estate and left the register showing 6 records.

Copies do not inflate the register: one event is one record, keyed on company, form and
the date the filename states, with every physical copy attached.

## Statutory registers

| | |
|---|---|
| Records | 130 |
| Counted as filings | **0** |

- register of members — 43
- register of directors — 42
- share certificate — 24
- entity level — 10
- provident fund — 5
- resolution — 4
- correspondence — 1
- financial statements — 1

Registers of members and directors and share certificates are corporate records, not
filings, and never inflate the filing counts. Spelling variants in Drive
(`Register of Director`, `Register Of Members`, `Shareholder_s Certificates`) normalise
to one category each.

## Documents

| | |
|---|---|
| Files under the root | 3,367 |
| Files reaching a record | 3,367 |
| **Files without a disposition** | **0** |
| Files in more than one register | 1,290 |
| Record → Drive mappings | 4,657 |
| Broken Drive links | 0 |

A file appearing in two registers is expected and correct: a Form 29 lodged in CY 2022
belongs to that year's folder *and* is an event filing.

Document dates are read from the document. Drive's created and modified times are never
used as an AGM, filing, execution or financial-statement date.

## What counts as a filing

| | |
|---|---|
| Entity-year records | 250 |
| Event filing records | 769 |
| **Filings proven submitted** | **44** |
| Acknowledgements received | 29 |

Every statutory item carries three separate states — `documentStatus`, `filingStatus`,
`acknowledgementStatus`. A Form A on file proves the company *prepared* one; only a
receipt, challan, acknowledgement or eZfile confirmation proves SECP received it.
Collapsing these into one status is how a register comes to claim compliance nobody can
produce a receipt for. The estate holds thousands of documents and
**44 filings with explicit submission evidence**; both numbers
are shown, and neither is presented as the other.

## Acceptance gates

| Gate | Value | Result |
|---|---|---|
| UNKNOWN ROOT CHILDREN | 0 | PASS |
| FILES WITHOUT DISPOSITION | 0 | PASS |
| ENTITY YEAR FOLDERS WITHOUT RECORD | 0 | PASS |
| RECORDS WITHOUT FOLDER | 0 | PASS |
| BROKEN DRIVE LINKS | 0 | PASS |
| DOCUMENT COUNT MISMATCH | 0 | PASS |
| DUPLICATE RECORD IDS | 0 | PASS |

## Artifacts

- `audit/secp-root-inventory.json`
- `audit/secp-entity-registry.json`
- `audit/secp-year-matrix.json`
- `audit/secp-file-disposition.json`
- `audit/secp-annual-compliance.json`
- `audit/secp-event-filings.json`
- `audit/secp-statutory-registers.json`
- `audit/secp-document-lineage.json`
- `audit/secp-ui-reconciliation.json`
- `audit/secp-final-summary.json`

## Source-backed history is not future planning

The workspace printed **FY 2028 / FY 2027 / FY 2026** in its header, above ten years of
real filings. Those labels are a formula's output -- current financial year plus one,
six back -- and nothing in Drive asserts them. Beside a CY 2024 folder they read exactly
like source.

They are now separate populations, and no screen or number combines them:

| | |
|---|---|
| Source-backed entity-year records | 250 (a Drive folder exists) |
| System-generated future obligations | computed from `config/compliance-rules.json` |

Future obligations live in their own **Upcoming obligations** view, labelled
system-generated, each due date citing the configured rule that produced it (year end plus
`annualReturnDaysAfterYearEnd` or `agmDaysAfterYearEnd`). The compliance history shows only
years Drive holds a folder for. Administration -> Data Health reports the two counts
separately and asserts `driveYearsMissingFromUI = 0` and `uiYearsAbsentFromDrive = 0`.

The entity register likewise lists the companies Drive actually holds a statutory folder
for. LegalOS knows more names than the estate contains -- former names, alternative
spellings, and foreign entities outside SECP jurisdiction -- and those stay reachable
behind a scope selector rather than padding the register with rows that have no folder,
no years and no documents.

## Google Drive is the source of truth

This reconciliation is **read-only** against Drive. The service account holds
`drive.readonly` and nothing else, so no code path in this application can alter the
source. `tests/m22-drive-readonly.js` fails if that scope ever widens, if any server
module gains a Drive write, or if a single file id, folder id or parent id changes across
a full build.

Every record and every document retains its provenance unmodified:

| Field | Meaning |
|---|---|
| `driveFileId` | the file's Drive id |
| `exactSourceFilename` | the filename Drive holds, never a cleaned-up version |
| `fullDrivePath` | the complete path from the crawl root |
| `sourceRootId` / `sourceRootName` | the crawl root |
| `sourceFolderId` / `sourceFolderName` | the folder containing the file |
| `parentFolderId` / `parentFolderName` | that folder's parent |

Normalization decides what the register *displays* -- a canonical entity name, a document
type, a lifecycle stage. It never rewrites where the source lives. Where the two disagree,
both are kept: a file filed inside another company's folder is attributed to the company
it belongs to **and** reports the Drive path it actually sits at, flagged
`sourceLocationMismatch`.

Regression: `node tests/m20-secp-statutory.js`, `node tests/m21-secp-workspace.js`,
`node tests/m22-drive-readonly.js`, `node tests/m23-resolutions-source.js`.

No document bodies are stored in any artifact, and no write of any kind was made to the
Drive source.
