# LegalOS — End-to-end data audit

Generated 2026-09-17T06:52:55.773Z by `tools/data-audit.js`. Every number below is
produced by re-running the real ingest against live Google Drive with counters at each
stage. Nothing is sampled and nothing is estimated.

## Executive summary

```
Drive roots                         4
Drive folders                       856
Drive files                         3,476
  of which document files           3,382
  of which spreadsheets (trackers)  84

Tracker workbooks read              79
Tracker workbooks unclaimed         5
Raw data rows parsed                7,677
  dropped: sheet not a register     1,213
  dropped: required field blank     957
Rows mapped                         5,539
Records after de-duplication        3,134

Document files in Drive             3,382
  linked to at least one record     2,575
  linked to NO record               808
  linked to MORE THAN ONE record    1,082
Records carrying documents          2,106
Records with no documents           1,028

Records carrying source row number  3,134
```

## Per-module reconciliation

| Register | Raw rows | Mapped | Dropped (not a register) | Dropped (required blank) | Collapsed as duplicate | **Final records** | With documents | No documents |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Contracts | 4,733 | 3,929 | 798 | 6 | 2,558 | **1,371** | 791 | 580 |
| Litigation | 1,111 | 382 | 11 | 718 | 25 | **357** | 254 | 103 |
| Legal notices | 288 | 209 | 28 | 51 | 0 | **255** | 13 | 242 |
| Licences & permits | 7 | 7 | 0 | 0 | 0 | **7** | 7 | 0 |
| Loans & financing | 600 | 60 | 359 | 181 | 0 | **192** | 90 | 102 |
| Board resolutions | 919 | 914 | 4 | 1 | 0 | **914** | 913 | 1 |
| Project properties | 51 | 38 | 13 | 0 | 0 | **38** | 38 | 0 |

## Drive inventory

| Root | Folders | Files |
|---|--:|--:|
| Litigation & Dispute - LegalOS | 185 | 401 |
| Compliance Data _LegalOS | 190 | 1,772 |
| Commercial_ZD Projects Master Data and Tracker | 131 | 308 |
| Commercial_Zameen Media Contracts | 350 | 995 |

| File type | Count |
|---|--:|
| pdf | 2,750 |
| word | 545 |
| image | 89 |
| excel | 86 |
| video | 3 |
| other | 2 |
| archive | 1 |

- Shortcuts: **0** (none present, so no shortcut targets are being missed)
- Empty folders: **11**
- Duplicate file copies (same name + same byte size): **85** across 61 groups
- Deepest path: **13** segments; crawl depth cap is 12 — files at/over the cap: **1**, folders: **1**

## Field completeness

Percentage of records with a genuine value. `—`, `N/A`, `unknown`, `nil` and a bare `0` are
counted as BLANK, not populated.

**Contracts** (1,371 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| title | 1,369 | 2 | 100% |
| type | 1,366 | 5 | 100% |
| status | 194 | 1,177 | 14% |
| start | 1,317 | 54 | 96% |
| end | 1,142 | 229 | 83% |
| counterParty | 291 | 1,080 | 21% |
| firstParty | 1,360 | 11 | 99% |
| value | 257 | 1,114 | 19% |
| department | 1,341 | 30 | 98% |

**Litigation** (357 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| caseName | 331 | 26 | 93% |
| caseNo | 123 | 234 | 34% |
| nature | 334 | 23 | 94% |
| court | 340 | 17 | 95% |
| status | 355 | 2 | 99% |
| entity | 355 | 2 | 99% |
| nextHearing | 211 | 146 | 59% |
| filingDate | 167 | 190 | 47% |
| counsel | 263 | 94 | 74% |
| exposurePKR | 13 | 344 | 4% |

**Legal notices** (255 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| noticeDate | 254 | 1 | 100% |
| sender | 255 | 0 | 100% |
| recipient | 252 | 3 | 99% |
| category | 254 | 1 | 100% |
| status | 208 | 47 | 82% |
| details | 206 | 49 | 81% |

**Licences & permits** (7 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| entity | 7 | 0 | 100% |
| authority | 7 | 0 | 100% |
| issued | 7 | 0 | 100% |
| expiry | 7 | 0 | 100% |
| number | 7 | 0 | 100% |
| status | 7 | 0 | 100% |

**Loans & financing** (192 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| borrower | 60 | 132 | 31% |
| lender | 60 | 132 | 31% |
| amount | 60 | 132 | 31% |
| agreementDate | 174 | 18 | 91% |
| repaymentDate | 140 | 52 | 73% |
| status | 145 | 47 | 76% |

**Board resolutions** (914 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| date | 914 | 0 | 100% |
| agenda | 914 | 0 | 100% |
| docNo | 912 | 2 | 100% |

**Project properties** (38 records)

| Field | Populated | Blank | % |
|---|--:|--:|--:|
| project | 38 | 0 | 100% |
| address | 16 | 22 | 42% |
| city | 38 | 0 | 100% |
| entity | 38 | 0 | 100% |
| value | 13 | 25 | 34% |
| status | 0 | 38 | 0% |

## Machine-readable artifacts

- `audit-summary.json` — every count above
- `audit-trackers.json` — per workbook, per sheet: rows parsed, mapped, dropped and why
- `audit-records.json` — every record whose documents do not reconcile with its Drive folder
- `audit-files.json` — unlinked files, files on multiple records, duplicate groups
