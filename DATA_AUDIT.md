# LegalOS — end-to-end data audit

**Scope:** Google Drive → trackers → rows → records → folders → documents → registers →
dashboards → detail pages → Documents tab.

Every number here comes from `tools/data-audit.js`, which re-runs the real ingest against
live Google Drive with counters at each stage. Nothing is sampled, nothing is estimated,
and no number is read off the UI. Re-run it with:

```
node tools/data-audit.js          # full (re-downloads and re-parses every workbook)
node tools/data-audit.js --quick  # skips the workbook re-parse
```

Artifacts: `audit-summary.json`, `audit-trackers.json`, `audit-records.json`,
`audit-files.json`, `DATA_AUDIT_GENERATED.md` (tables). No credentials are written to any
of them.

---

## 1. The pipeline as it actually exists

Mapped from the code, not from names:

```
Google Drive
  4 roots, shared with the service account (drive.readonly)
  └─ api/drive.js        crawl() BFS, depth cap 12, pageSize 1000 with full pageToken paging
       → in-memory index {files[], folders[]} + config/.drive-index.json
  └─ api/registers.js    candidates() picks .xlsx/.xls under 26MB whose NAME or FOLDER
                         matches one of 7 FAMILIES (regex per family)
       → xlsx.readWorkbook (cap 60 sheets) → toObjects() (header detect, >=2 filled cells)
       → mapRecords()    synonym column map; needs >=2 mapped columns; drops rows whose
                         family-`required` fields are blank
       → de-duplicate    per-family `identity` key, newest source file wins
       → attach*Docs()   record → Drive folder/file linking
       → config/.registers.json
  └─ api/router.js       GET /api/registers            (summary + counts + diagnostics)
                         GET /api/registers/<family>   (paged, limit capped at 5000)
                         gated on me.canReadKnowledge
  └─ src/live.js         fetchRegister() limit 5000 → adapt<Family>() → client shape
  └─ src/store.js        hydrateLive("contracts", …) for the contract book
  └─ pages               registers, dashboards, /rec/<kind>/<id> detail, Documents tab
```

There is **no database**. The normalized dataset is the register cache, and it is the
single source behind registers, dashboards, detail pages and Documents.

---

## 2. Executive summary — BEFORE vs AFTER

```
                                        BEFORE      AFTER
Drive roots                                  4          4
Drive folders                              856        856
Drive files                              3,476      3,476
  document files (non-tracker)           3,382      3,382

Tracker workbooks read                      79         79
Tracker workbooks unclaimed                  5          5
Raw data rows parsed                     7,677      7,677
Rows mapped                              5,539      5,539
Records after de-duplication             2,896      2,896

Records carrying a stable id                 0      2,896
Records carrying source row number           0      2,896
Duplicate / colliding ids                  n/a          0

Document files linked to a record        2,506      2,544
Document files linked to NOTHING           877        839
Document links in total                  8,661      5,740
Files asserted on >1 record              1,275      1,038
Fabricated fuzzy links removed               —      2,971
Records carrying documents               2,391      2,064
Contracts pinned at the 6-doc cap          551         31
Records truncated by a document cap      1,038          0
```

Record counts did not change, and that is the correct outcome: the audit found no
missing records in the ingest. What was wrong was **identity**, **document mapping** and
**fabricated content in the detail page**.

### Verified end-to-end after the fix

| Phase | Check | Result |
|---|---|---|
| 9 | KPI values recomputed from the normalized dataset | litigation 331 total / **182 open** / 149 closed; contracts 1,341 / 248 active / 897 expired; exposure PKR 449,595,594 across 32 cases |
| 10 | source → API → adapted dataset, all 7 families | `apiTotal == returned == adapted == uniqueIds` for every family |
| 11 | register row → detail page | **12 / 12** sampled records resolved; 0 blank, 0 wrong record, 0 404 |
| 12 | Drive-linked documents → Documents tab | **21 / 21** reconcile exactly, including a 73-document contract that previously showed 6 |

## 3. What was actually broken

### D1 — Every record id was positional. **Fixed.**

`mapRecords()` never copied the spreadsheet row number onto the record. The client's
`idFor()` therefore fell through to `rec.__row || i` — the **array index**.

Consequence: ids shifted whenever a tracker gained or lost a row, or whenever
de-duplication picked a different winner. A bookmarked or shared detail URL would later
open a *different contract*. There was also no line back from a record to the cell range
it came from, so nothing in the system was auditable.

Evidence (before): `has __row: 0` and `has id: 0` for all 2,896 records across all 7
families.

Fix: `registers.js` now stamps `__row` and mints `id` from a hash of
(Drive file id, sheet name, row number) — `CTR-1FYJTOS`, `LIT-…`, `NTC-…`. The same
source row yields the same id across ingests, restarts and re-orderings. `live.js`
`idFor()` uses the server id when present.

### D2 — 1,275 documents were asserted on more than one record. **Fixed.**

The contracts matcher has three stages: filename citation, the record's own project
folder, then a **fuzzy token match** across the whole Drive index. The fuzzy stage had no
global constraint, so one PDF could be attached to a dozen unrelated contracts. Across
2,506 linked files there were **8,661 links** — an average of 3.5 records per document.

For a legal system this is the worst class of defect: it puts a document on a matter it
does not belong to.

Fix: fuzzy links now carry their match score, and `pruneSharedLinks()` keeps an
over-shared fuzzy document on its **single strongest** record, removing it from the rest.
Deterministic links (the tracker named the file; the file sits in the record's own
folder) are never pruned — a shared project folder legitimately serves several rows of
the same project. **2,971 fabricated links removed**, and genuinely-linked files went
*up* (2,506 → 2,544) because pruning no longer had to discard a file everywhere.

### D3 — Arbitrary caps silently truncated the Documents tab. **Fixed.**

| Cap | Where | Effect |
|---|---|---|
| 60 files per folder segment | `byFolderSeg` index | a well-populated project folder was indexed only 60 deep |
| 40 documents | project-folder attach | a record's own folder stopped at 40 |
| 25 documents | litigation case folder | **`best.files.slice(0, 25)`** — a case file was cut at 25 with nothing saying so |
| 6 documents | fuzzy stage | 551 contracts sat at *exactly* 6 — the cap was binding, not the data |

A record's own folder is a deterministic link, so the folder is now attached in full. The
fuzzy cap (6) is retained deliberately — it is the untrusted stage.

### D4 — Legal notices had zero documents. **Partly fixed; source-limited.**

205 notice records, **0** linked documents — no matcher existed for the family.

Drive holds only **14** notice documents in total (`Litigation & Dispute - LegalOS /
TRACKERS / Legal Notice`). They are named after the counterparty
(`Legal Notice_Ali Amjad_DB 32_Refund Dispute.pdf`), so `attachNoticeDocs()` now links
them deterministically: a file is attached only on a **distinctive** shared party token
(≥5 characters, appearing in ≤2 files), and each file is claimed by only its best notice.

**The remaining ~191 notices have no document because Drive does not contain one.** That
is a source gap, not an ingestion gap, and nothing has been invented to hide it.

### D5 — The notices adapter silently dropped every document. **Fixed.**

Six of the seven client adapters in `live.js` copy `driveFiles` through to the UI.
`adaptNotices()` did not. So even once the ingest matched a notice to its PDF, the
notice's Documents tab rendered empty — the data reached the browser and was discarded
one layer short of the screen.

### D6 — The contract detail page displayed fabricated content. **Fixed.**

Independent of Drive, `contracts.js` rendered invented material as if it were record data:

- a **Document** tab that, for any contract without a scanned copy, printed a fake
  agreement body — "4. Term & Renewal… commence on the Effective Date…", "6. Limitation
  of Liability… 0.5× the fees paid…" — styled as the real instrument;
- a **Versions** tab with a hardcoded `v3.0 / v2.1 / v1.0` history attributed to real
  named colleagues, and a hardcoded tab badge of `3`;
- an **Approvals** tab listing four fixed approvers, including "Klaus Werner", who is not
  on the roster at all;
- a **Comments** tab claiming "4 comment threads on clauses 6, 7 and 9", with a hardcoded
  badge of `4`.

All of it is removed. The Document tab now renders the shared `LegalDocuments` component
(the same one every other record type uses, satisfying the single-source requirement),
its badge is `(c.driveFiles || []).length`, and Versions/Approvals/Comments show honest
empty states explaining that the Drive register carries no such history.

---

## 4. Findings that are the SOURCE's fault, not the pipeline's

These are reported, not fixed, because fixing them would mean inventing data.

**4.1 — 1,213 rows dropped as "not a register".** Correct behaviour in every case
inspected:

| Rows | Workbook | Why |
|--:|---|---|
| 793 | `00 Zameen Media-PPAs and Finder's Fee Tracker (1).xlsx` | duplicate `(1)` copy whose sheets use a different layout; the original maps fully |
| 286 | `Loan Ledger (monthwise with Invoice name).xlsx` | a 19MB month-by-month invoice ledger, not a loan register |
| 69 | `Loan PRC Working.xlsx` | a working calculation sheet |
| 13 | `ZD Project Properties…Master Tracker.xlsx` | header/summary blocks |

**4.2 — 957 rows dropped for a blank required field.** The largest single block is
litigation: 690 rows from `Litigation Tracker_.xlsx` → **689 are padding** (trailing rows
carrying only `0` in two USD columns, rows 295–983) and **1 is a real case** (row 218,
Sr. #202 — Civil Dispute, Civil Judge Peshawar, In Progress) that has **no Case Name in
the source**. That one case cannot be ingested without inventing a name for it.

**4.3 — `Litigation Tracker_.xlsx` has 98 sheets; the ingest reads 60.** Verified cost:
**0 rows**. All 947 data rows live in sheet 1 (`Cause List`); sheets 2–98 are per-case
tabs that contain formatting only. The cap is not currently losing anything, but it is
1 workbook away from doing so silently.

**4.4 — Modules in the navigation with no Drive source at all.** Asset Recovery, IP
Portfolio, Developer Disputes, Police Complaints, Govt Inspections, SECP Filings and Risk
Analysis have **no tracker** anywhere in the shared Drive (`recovery` → 0 spreadsheets,
`police` → 0, `inspection` → 0, `secp` → 0 spreadsheets, `trademark` → 0 files). These
surfaces cannot be populated from the current Drive content. They must either be given a
tracker, or removed from the navigation — they should not display invented records.

**4.5 — Licences rest on a single 7-row spreadsheet.** `00_ Summary_ZTech Entities
Licenses and Permits_ (1).xlsx` is the only licence tracker in Drive. The Compliance root
holds licence *documents* (PEC, LCC folders) but no fuller register. 7 is the true
tracker count.

**4.6 — Contract de-duplication collapses 2,588 of 3,929 rows (66%).** Verified
legitimate: **all 1,169 collapsed groups span multiple files** (`Admin Contracts.xlsx`
and `Other Contracts- Zameen Media.xlsx` are near-identical books, and the PPA tracker
has a `(1)` copy); **zero** groups collapsed within a single file. Residual risk: **16**
groups matched on title alone (no dates, no counterparty) and **13** groups collapsed
rows that carried *different* contract values — these are listed in `audit-files.json`
and are the only merges that could be wrong.

**4.7 — 839 document files (25%) are linked to no record.** These are largely templates,
approvals and project-support material that no tracker row cites. They remain reachable
through the Knowledge/Repository browser; they are simply not attached to a record.

**4.8 — Drive crawl limits.** `discoverRoots()` requests `pageSize=200` with **no
pageToken loop** — safe today (4 roots) but it would silently truncate at 200 shared
folders. The BFS depth cap is 12; the deepest observed path is 13 segments, with 1 file
and 1 folder at the cap. `crawl()` swallows a failed `listChildren` into an empty array,
so an unreadable folder is invisible rather than reported.

---

## 5. Field completeness

Full per-field tables are in `DATA_AUDIT_GENERATED.md`. `—`, `N/A`, `unknown`, `nil` and
a bare `0` are counted as **blank**, not populated.

---

## 6. Diagnostics (so this cannot go invisible again)

`GET /api/registers` now returns a `diagnostics` block alongside the counts:

```json
{ "records": 2896, "recordsWithDocuments": 2064, "recordsWithoutDocuments": 832,
  "driveDocumentFiles": 3382, "documentsLinked": 2544, "documentsUnlinked": 839,
  "documentsOnMultipleRecords": 1038, "totalLinks": 5740, "prunedFuzzyLinks": 2971 }
```

Every unmapped document and every over-shared file is now a number on that surface rather
than a silent omission.

---

## 7. Remaining discrepancies — every one, explained

| Count | What | Why it remains |
|--:|---|---|
| 839 | Drive documents linked to no record | templates, approvals and project-support material that no tracker row cites. Reachable through Repository/Knowledge; not attached to a record because nothing in the source attaches them. |
| 1,038 | documents on more than one record | deterministic folder links only. Several contract rows of the same project legitimately share that project's folder. All 2,971 *fuzzy* multi-record assertions were removed. |
| 832 | records with no document | the Drive tree holds nothing for them — chiefly ~191 notices (Drive has 14 notice PDFs for 205 notices) and pre-2020 CPML-era contracts never scanned. |
| 1 | litigation case not ingested | `Litigation Tracker_.xlsx` → `Cause List` row 218 (Sr. #202) has no Case Name. Ingesting it would mean inventing one. |
| 16 | contract groups merged on title alone | no date and no counterparty in the source to separate them. Listed in `audit-files.json`. |
| 13 | merged contract groups with differing values | same title/date/counterparty but different value cells — a genuine source contradiction. Listed in `audit-files.json`. |
| 7 | modules with no Drive source | Asset Recovery, IP Portfolio, Developer Disputes, Police Complaints, Govt Inspections, SECP Filings, Risk Analysis. No tracker exists. They must be given one or removed from the navigation. |
| 5 | spreadsheets no register reads | inventory/unit-area/land-detail sheets — not registers. |

## 8. Known limits still in the pipeline

These are documented rather than silently tolerated:

- `MAX_SHEETS_PER_FILE = 60`. `Litigation Tracker_.xlsx` has **98** sheets. Verified cost
  today: **0 rows** (all data is in sheet 1; sheets 2–98 are empty per-case tabs). One
  workbook away from silent loss.
- `discoverRoots()` fetches `pageSize=200` with **no pageToken loop** — fine at 4 roots,
  wrong above 200.
- BFS depth cap 12; deepest observed path is 13 segments (1 file, 1 folder at the cap).
- `crawl()` turns a failed `listChildren` into `[]`, so an unreadable folder is invisible.
- The fuzzy document stage still caps at 6 documents per record. That cap is deliberate —
  it is the untrusted matching stage — and it now binds on only 31 contracts (was 551).

---

# Remediation pass — source-to-UI recovery

The audit above established the gaps. This section records what was **recovered and
wired**, and is regenerated by `node tools/data-audit.js` (add `--no-crawl` to reuse the
warm Drive index; repeated full crawls get the service account throttled with HTTP 429,
and a throttled crawl returns a SMALLER tree that looks like data loss).

## A. Source discovery — the whole estate, opened

`tools/source-discovery.js` opens **every** spreadsheet in Drive and records every sheet
name and column header, then scores them against each module's vocabulary. Filename
matching was never enough to answer "is there a dataset for Asset Recovery anywhere".

```
spreadsheet-like files in Drive        84
  Google-native (need /export)          0
  over the 26MB cap                     1
workbooks opened and parsed            83
sheets inspected                      218
sheets carrying data rows             114
data rows discovered                9,000
```

Output: `source-registry.json` — one row per (file, sheet) with headers, row count and
candidate module.

### The seven "unsourced" modules — re-investigated and PROVEN

| Module | Candidate sheets | Verdict |
|---|--:|---|
| Asset Recovery | 0 | no dataset in the estate |
| IP Portfolio | 0 | no dataset in the estate |
| Govt Inspections | 0 | no dataset in the estate |
| Risk Analysis | 0 | no dataset in the estate |
| Developer Disputes | 1 | **false positive** — matched "society/project" in a property list |
| Police Complaints | 1 | **false positive** — matched *"Plot No. 35 A, Police Station Road, Rawalpindi Cantt."*, a street address |
| SECP Filings | 3 | **false positives** — all matched `filing date` on litigation sheets (a case filing, not a SECP filing) |

Every header of all 218 sheets was searched. These modules have **no source**, and no
record has been invented for them.

## B. Every source row now has a disposition

```
SOURCE ROWS READ                     7,713
  INGESTED_RECORD                    5,539
  INCOMPLETE_SOURCE_RECORD             214   ← preserved, previously dropped
  MERGED_DUPLICATE                   2,619   (already counted as ingested)
  NOT_A_REGISTER_SHEET               1,213
  BLANK_ROW                            689
  PADDING_ROW                           54
  SKIPPED_SHEET                          4
  UNKNOWN_DROP                           0   ← target met
RECORDS HELD                         3,134
  expected (ingested + incomplete − merged) = 3,134   RECONCILES
```

## C. Records recovered

| Register | Before | After | Recovered |
|---|--:|--:|--:|
| Contracts | 1,341 | **1,371** | +30 |
| Litigation | 331 | **357** | +26 |
| Legal notices | 205 | **255** | +50 |
| Loans & financing | 60 | **192** | +132 |
| Board resolutions | 914 | 914 | — |
| Licences & permits | 7 | 7 | — |
| Project properties | 38 | 38 | — |
| **Total** | **2,896** | **3,134** | **+238** |

Nothing was invented. These are source rows that the old ingest discarded because a
`required` field was blank, or that were wrongly merged away.

- **208** records are flagged `INCOMPLETE_SOURCE` and carry `missingFields`. Litigation
  `Cause List` row 218 (Sr. #202) is one of them — it is kept with the system display
  label *"Case name missing in source"*, which is never written back to the source.
- **594** records are flagged `CONFLICTING_SOURCE`: where two tracker copies disagree,
  both values are retained on the record (`__conflicts`) instead of the newer file
  silently overwriting the older.
- **70** records carry `WEAK_IDENTITY`: a title-only identity is no longer treated as
  grounds to merge. The 16 title-only merges and 13 contradictory-value merges the first
  audit reported are gone — those records are separate again.

## D. Every Drive file has a disposition

```
SOURCE_TRACKER            84     a spreadsheet the ingest reads (or ignores) as a source
RECORD_DOCUMENT        1,493     attached to exactly one record
MULTI_RECORD_DOCUMENT  1,081     attached to several, with the evidence recorded
REFERENCE                398     filed under a legal root; no record cites it
TEMPLATE                 338     template / precedent material
PROJECT_DOCUMENT          70     project hierarchy material
MODULE_DOCUMENT            2     belongs to a module, not one record
SYSTEM_FILE               10     editor lock files / OS artefacts
UNRESOLVED                 0     ← nothing is invisible
```

The 839 "orphans" of the first audit are now classified, not shrugged at.

## E. Identity and lineage

Every record carries `id` (hashed from Drive fileId + sheet + source row), `__row`,
`__lineage` (fileId, file, sheet, row, ingestedAt, parser version) and `__raw` (the
untouched source cells behind the normalized values).

```
records with a stable id             3,134 / 3,134
records with source lineage          3,134 / 3,134
duplicate / colliding ids                0
```

## F. Exhaustive verification — all records, not samples

| Register | API | Adapted | Missing id | Duplicate id | Docs lost in adapter | Documents source → UI | Resolvable |
|---|--:|--:|--:|--:|--:|--:|--:|
| Contracts | 1,371 | 1,371 | 0 | 0 | 0 | 2,530 → 2,530 | 1,371 |
| Litigation | 357 | 357 | 0 | 0 | 0 | 678 → 678 | 357 |
| Legal notices | 255 | 255 | 0 | 0 | 0 | 14 → 14 | 255 |
| Licences | 7 | 7 | 0 | 0 | 0 | 13 → 13 | 7 |
| Loans | 192 | 192 | 0 | 0 | 0 | 1,222 → 1,222 | 192 |
| Resolutions | 914 | 914 | 0 | 0 | 0 | 913 → 913 | 914 |
| Properties | 38 | 38 | 0 | 0 | 0 | 950 → 950 | 38 |
| **Total** | **3,134** | **3,134** | **0** | **0** | **0** | **6,320 → 6,320** | **3,134 / 3,134** |

## G. Pipeline hardening

- **Drive throttling.** `listChildren` now retries 429/5xx with exponential backoff, and a
  failed folder listing is recorded as a FAILURE instead of being swallowed as an empty
  folder. A crawl that comes back degraded (unreadable folders, fewer files than we
  already hold) **no longer overwrites the good index** — shrinking the index is how
  documents silently disappear from records.
- **Stale links.** `revalidateLinks()` drops links to files that have left Drive and
  counts them — but refuses to prune at all while the index is degraded, so a throttled
  crawl can never delete a legitimate document link.
- **Server-side permission filtering.** `/api/registers/*` is gated on the caller's
  effective permission GROUP, not just membership of Legal. Verified: a Compliance-only
  account receives 403 for litigation and contracts; a Litigation-only account receives
  403 for contracts, licences and resolutions; a super admin receives all. The summary
  endpoint is scoped too, so counts for a book you may not open are not leaked.

## H. Data Health (Administration → Data Health)

An admin-only surface (`/datahealth`, API `/api/registers/health`, 403 for non-admins)
showing: per-module records / incomplete / conflicting / weak-identity counts, the row
disposition ledger, records needing attention with their source file-sheet-row, document
dispositions, the unresolved-document queue, the source registry, and sync health.

## I. The audit is now a regression gate

`node tools/data-audit.js` exits non-zero if any of these fail:

```
PASS  every record carries a stable id        (3134/3134)
PASS  no duplicate record ids                 (0)
PASS  every record carries source lineage
PASS  row ledger reconciles                   (3134 expected vs 3134 held)
PASS  no unexplained row drops                (0)
PASS  every mapped document exists in Drive   (0)
PASS  every Drive file has a disposition      (3448/3448)
PASS  no unresolved documents                 (0)
```

## J. What remains, and why

| Item | Why it remains |
|---|---|
| 7 modules with no register | Proven sourceless by opening all 84 workbooks and all 218 sheets. They need a tracker in Drive, or removal from the navigation. Nothing will be invented for them. |
| 792 documents linked to no record | Classified as REFERENCE (398), TEMPLATE (338), PROJECT_DOCUMENT (70) and MODULE_DOCUMENT (2). They are visible in Data Health and the Knowledge browser; no record cites them, so attaching them would be fabrication. |
| 208 incomplete-source records | The source left a required field blank. They are preserved, flagged and listed for stewards. Filling them would mean inventing legal facts. |
| 594 conflicting records | Two tracker copies disagree. Both values are retained and flagged; picking a winner without evidence would be a guess. |
| 191 notices with no document | Drive holds 14 notice PDFs for 255 notices. Re-checked across the whole estate; there are no others. |
| 1 licence source (7 rows) | The only licence tracker in Drive. Re-searched for licence/permit/registration/renewal/certificate/NOC; nothing further exists. |
