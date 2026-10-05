# Compliance Data Reconciliation

**LegalOS — Compliance & Licences** · build **src-v241** · Drive re-crawled 17 Sep 2026

Reproduce every figure below with:

```
node tools/compliance-reconcile.js          # the table
node tools/compliance-reconcile.js --json   # the underlying data
```

The rule this document exists to enforce: **every source row and every Drive file
gets a disposition, and the arithmetic closes.** "We did not look" and "there is
nothing there" must never be allowed to look the same.

---

## 1. The old combined family is gone

"Lease, Loan & Service" was one operational family. It is now three registers.
The split is read from the spend trackers' own `Agreement Type` column, not
guessed from titles:

| | rows |
|---|---:|
| Combined source rows | **172** |
| → Leases | 91 |
| → Service Agreements | 68 |
| → Neither (NDA, MOU, Sale & Purchase, Franchise, Novation, Termination) | 13 |
| **Reconciles** | **YES** (91 + 68 + 13 = 172) |

The 13 are not forced into a register they do not belong to; they remain in the
contracts register, which is where a non-disclosure agreement actually lives.

**The legacy route is gone, not merely hidden.** `/m/agreements` held fabricated
demo records, was emptied in September, and opened to nothing. It — along with
`/m/resolutions`, `/m/licenses`, `/m/filings` and the duplicate `/licenses`
register — now redirects to the register that owns its records, so no bookmark
or dashboard deep link breaks and no second dataset survives.

## 2. Loans

The loan trackers were never one-row-per-loan:

| | rows |
|---|---:|
| Ingested source rows | **192** |
| → Loan agreements | 60 |
| → Historical event rows (rollovers, registrations, repayments) | 117 |
| → Repeated header rows (spreadsheet block separators) | 15 |
| **Reconciles** | **YES** (60 + 117 + 15 = 192) |
| + Agreements evidenced only in Drive (no tracker row) | 9 |
| **Loan register total** | **69** |

History attached: 85 of 117 tracker event rows, plus 449 Drive documents
classified into dated lifecycle events. 32 event rows stay unattached for stated
reasons — 9 where the master tracker carries one LRN twice, 23 where the
reference cell is a placeholder (`N/A — no registration records` appears against
three different Daftarkhwan loans, so joining on it would attach one loan's
history to another).

One Drive folder is **contested** between two Zameen Arcs loans from the same
lender and is attached to neither until a human resolves it.

## 3. Register totals

| Register | Records | Source |
|---|---:|---|
| Loans | **69** | 3 trackers + 40 Drive loan folders |
| Leases | **91** | spend trackers, `Agreement Type` = Lease/Tenancy |
| Service Agreements | **68** | spend trackers, `Agreement Type` = Services/Consultancy/Marketing |
| Resolutions | **914** | 39 per-entity workbooks |
| Licences & Permits | **8** | summary workbook (7) + Drive-only (1) |
| SECP compliance years | **33** | derived from Drive evidence |
| SECP filings recorded | **0** | none recorded yet — no filing register exists |

Every one of these is reachable: the hub tile shows the count, the tile opens the
register, the register opens the record, and the record shows its documents and
timeline. Resolutions offers **By entity** (39 rows) *and* **All resolutions**
(914 rows) — the entity view is a drill-down, never a replacement for the data.

## 4. Drive document disposition

All 2,185 compliance-relevant files (the Compliance root plus the template tree):

| Disposition | Files |
|---|---:|
| `RECORD_DOCUMENT` — attached to a specific record | 1,396 |
| `TEMPLATE` — approved template library | 394 |
| `ACTION_DOCUMENT` — a dated lifecycle event on a loan | 206 |
| `ENTITY_DOCUMENT` — belongs to a known entity folder, no single row claimed it | 177 |
| `NOT_A_DOCUMENT` — Word lock/recovery artifacts (`~$…`, `~WRL….tmp`) | 7 |
| `SOURCE_TRACKER` — the workbooks the registers were read from | 5 |
| **`UNRESOLVED`** | **0** |

`ENTITY_DOCUMENT` is not a shrug. Those files are reachable through their entity:
`GET /api/compliance/resolutions` reports `folderDocuments` and
`unlinkedDocuments` per entity, and
`GET /api/compliance/resolutions/entity/<key>/documents` lists them with
`linkedToResolution` on each. Across 39 entities that is **827 documents, of
which 55** are not claimed by a specific resolution row.

The last two unresolved files were real: ZIMS security-guard **service
agreements** filed under the *loan* tree in "Subsidiaries Contracts". They are
service agreements wherever they happen to sit, and are now picked up.

## 5. SECP source report

The previous pass concluded "no source" on a tracker-shaped search. Re-checked
against the folder hierarchy, as the requirement demands:

| | |
|---|---:|
| Entity folders inspected | 42 |
| **FY folders discovered** | **0** |
| **AGM folders discovered** | **0** |
| **SECP folders discovered** | **0** |
| SECP-adjacent evidence documents | 54 |
| — pre/post-AGM board minutes | 39 |
| — resolutions approving audited financial statements | 7 |
| — the group's own SECP forms | 4 |
| — third-party forms (**excluded** — a counterparty's, not ours) | 4 |
| Form breakdown | Form A 4 · Form 3 2 · Form 9 1 · Form 29 1 |
| **Compliance years derived** | **33** |
| Entities with a derived year | 13 |
| Financial years represented | FY 2020, 2021, 2022, 2023, 2024, 2026 |
| AGMs evidenced | 29 |
| Financial statements evidenced | 4 |

So: there is **no filing register** in Drive — verified across all 856 folders,
not assumed — **but the module is not empty.** 33 statutory years are built from
documents that prove real events.

**The line this does not cross.** A document is not a filing. A "Form A" in Drive
does not prove Form A was filed with SECP, and an AGM minute does not prove the
annual return went in. Every derived year therefore carries
`filingStatus: "Not recorded"` until a person records the filing, states what it
*does* prove ("AGM held", "Financial statements approved"), and names the
document that proves it. Filing dates are never fabricated from a file's modified
timestamp.

## 6. Entities

64 entities, derived from the source registers **and** the Drive folder names:

| Legal form | Count | AGM |
|---|---:|---|
| Single Member Company | 26 | not required |
| Private Limited | 17 | required |
| Foreign / offshore | 8 | out of scope |
| Not stated in source | 10 | withheld |
| Conflicting source | 2 | **withheld** |
| Registered partnership | 1 | out of scope |

Two entities have sources that disagree about their legal form (`Zameen Axis` is
`(SMC-Pvt)Ltd` in the resolution folders and `(Private) Limited` in the loan
tracker). Their statutory requirements are **withheld rather than guessed** —
guessing would either invent or suppress a statutory obligation.

## 7. Templates and letterheads

| | |
|---|---:|
| Approved template library | 406 |
| — approved | 370 |
| — marked draft / work-in-progress from their own names and folders | 36 |
| **Entity letterhead assets** | **0** |

One file mentions "Letterhead" in its name, but it is a Dubizzle Labs resolution
*printed on* letterhead — not a template. Treating it as one would mean
generating future resolutions from someone else's signed minutes. Resolution
drafts state "Letterhead not configured" on their face.

## 8. Data quality states

No record is dropped for being incomplete:

| State | Meaning |
|---|---|
| `COMPLETE` | every expected field present |
| `INCOMPLETE_SOURCE` | a field the source never recorded (94 loan documents carry no date in their filename) |
| `CONFLICTING_SOURCE` | two sources disagree (13 resolutions mis-filed; 2 entities' legal form) |
| `DRIVE_ONLY` | evidenced in Drive with no tracker row (9 loans, 1 licence) |
| `DRIVE_ONLY_POSSIBLE_DUPLICATE` | the same convertible loan filed under both trees — cross-flagged, not silently merged |

## 9. Verification

`node tests/m1-compliance.js` — **128/128 checks passed**, including that the
source registers are unchanged by all of the above: **loans 192, licences 7,
resolutions 914**. The domain model is derived *on top of* the ingest, never in
place of it. No spreadsheet was edited; no Drive folder was moved, renamed or
deleted — LegalOS holds a read-only Drive credential and cannot write to Drive.
