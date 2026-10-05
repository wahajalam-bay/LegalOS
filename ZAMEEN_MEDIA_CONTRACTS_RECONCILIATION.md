# Zameen Media Contracts — reconciliation

**Scope:** everything under the Drive folder `Commercial_Zameen Media Contracts`.
**Date:** 21 September 2026.
**Drive was not modified.** No file was renamed, moved, deleted or rewritten, no
tracker was edited, and nothing was written back. Drive remains the source of
truth; LegalOS adapted to it.

---

## 1. What is in the folder

The folder was walked with no limit on depth, file count or folder count.

| | |
|---|---|
| Folders | 351 |
| Files | 995 |
| Deepest folder | 12 levels down |
| Folders that could not be read | 0 |

The depth matters. The crawl used to stop at twelve levels, and the deepest
folder here sits at exactly twelve — the estate was one nested folder away from
losing files silently. That limit has been removed and a regression test now
fails if it comes back.

---

## 2. Where every file ended up

Each of the 995 files is accounted for exactly once.

| Outcome | Files |
|---|---:|
| Classified in the template library | 384 |
| Attached to a record in LegalOS | 533 |
| Both (an executed instrument stored in the template folder) | 29 |
| Held in Drive, attached to nothing | 49 |
| **Total** | **995** |

Of the 49 attached to nothing, **5 are the source workbooks themselves** — a
workbook *is* the register, not a document filed under one. The remaining
**44 are agreements, amendments, termination letters and settlement documents**
sitting in the regional PPA folders (18 Lahore, 12 North, 10 Other PPA's,
3 South, 1 Central) that no tracker row names. They are listed by name in
`audit/zm-ppa-document-lineage.json`. **These need a human decision** — either
the tracker is missing a row, or the document belongs elsewhere. LegalOS has not
guessed a home for any of them.

---

## 3. The contract templates folder

413 files sit under `Zameen - Pakistan Contract Templates`. **Every one of them
now has exactly one recorded state**, and the states sum to 413.

| State | Files |
|---|---:|
| Approved template | 312 |
| Draft template | 50 |
| Reference document | 19 |
| Executed operational document | 12 |
| Editor artefact (Word lock and autorecovery files) | 7 |
| Not a template (marketing brochures) | 6 |
| Standard clause library | 3 |
| Executed precedent sample | 3 |
| Work in progress | 1 |
| **Total** | **413** |

### 3.1 Executed contracts were sitting in the template drawer

The folder name is not evidence. **Fifteen executed instruments** were found
filed among the templates, including:

- a **Google advertising services agreement** stamped by Google's legal department
- three **executed digital marketing agreements** with HBFC, Allied Bank and Escorts Bank
- an executed **DMA with Riaz Ahmad & Co, Chartered Accountants** (Rs 500 stamp paper B622390)
- a **ready-mix concrete supply agreement** under company seals
- a **vehicle lease financing agreement** with a named employee (Rs 100 stamp N584904, attested by an Oath Commissioner)
- **seventeen DHA Rawalpindi allotment letters** across two packs, each sealed and signed by the Director Transfer & Record

None of these is lost. Each is recorded as executed, with the stamp, seal,
signature or date that proves it, and each remains reachable from its record.

### 3.2 Blank templates are no longer shown as real documents

The opposite error was live and had not been noticed. The document matchers link
on project name and clause language, and a blank *Agreement to Sell for Zameen
Quadrangle* matches the Zameen Quadrangle project on every signal there is. So
it was attached. **27 of 38 property records were carrying blank pro-formas
among their documents** — the Zameen Quadrangle record showed nine blank
agreements among forty-nine — with nothing on screen to say which was a deal and
which was stationery.

This is dangerous in a specific way: a blank agreement looks exactly like an
executed one until someone opens it and reads the signature block.

**785 template attachments across 59 records have been detached.** They remain in
Drive and in the template library; they are simply no longer presented as a
record's own agreement. Executed instruments and reference material were
deliberately left attached.

### 3.3 What happened to each of the fifteen

Every signed agreement found in the template estate has a recorded operational
disposition. None is left as "signed, but only in the template library".

| Outcome | Documents |
|---|---:|
| Linked to an existing operational contract | 9 |
| Historical executed document, linked to its property record | 3 |
| Executed precedent retained as reference | 3 |
| **Total** | **15** |

The nine linked to contracts are the vehicle lease (ref 95), the ready-mix
concrete supply agreement (ref 1386), the drain pipeline agreement (ref 1233),
the HBFC digital marketing agreement (ref 93) and its first amendment (ref 134),
the Google advertising agreement (ref 132), the Escorts Bank DMA (ref 131), the
Riaz Ahmad & Co DMA (ref 135) and the Allied Bank DMA (ref 195). The three
historical documents are the DHA allotment letters and the V4 Capital unit
agreement, which evidence title behind Zameen Ace Homes rather than being Zameen
contracts. The three precedents are the two affidavit copies and the Block-H
Gulberg agreement to sell.

Full detail, including the evidence behind each, is in
`audit/zm-signed-agreement-disposition.json`.

### 3.4 A sixteenth was claimed as executed and is not

`CONTRACT AGREEMENT [Final Version].docx` had been classified as an executed
operational document. Read in full, it is not one: the body still carries six
placeholder marks for **both party names and the agreement date**, the signature
lines are blank underscores and the witness block is empty. The closing block
types the intended signatories and 27 October 2020 — but a Word file carries no
wet signature, and a contract whose body does not name its parties is not a
complete instrument.

It had been judged on a single-page skim recorded at MEDIUM confidence. It is
now a draft. The other Word file in the set, the drain pipeline agreement, was
checked the same way and passes cleanly: no placeholders, both parties named in
the opening, dated in the body.

### 3.5 Four more agreements were filed as executed but are not

Four documents had been classified as executed on the strength of counted
signals, while the record of someone actually reading them said the execution
block was blank:

- Amended and Restated JV Agreement (execution version)
- Joint Venture Agreement [20190531]
- Agreement to Sell (Land–Mall 35) [20201106]
- Undertaking for Payments — Medallion Account

All four are now recorded as drafts, each citing what the reader saw (for
example, *"signature line present but blank; only a typed name and CNIC below
it"*). Reading a document now outranks counting patterns in it, in both
directions.

---

## 4. The contract register

**1,259 records**, built from four workbooks holding **3,683 rows** that name a
project. Those rows merge to **1,183 logical agreements**; the difference is
copies, and every copy keeps its lineage — workbook, sheet, row and serial — so
any merged record can be taken apart again.

### 4.1 Both trackers were kept

The two near-namesake trackers are **not** duplicates. They are **divergent**:
each holds rows the other does not. Neither was dropped. The broader
Admin/Other pair carries leases, NDAs, tenancy and novation agreements the
trackers never had; the Finder's Fee tracker carries 24 agreements the broader
pair has never heard of — serials 688–714, dated late 2025 into July 2026.

**All six of the newest agreements are present in LegalOS with their documents:**

| Agreement | Serial | Start | Documents |
|---|---:|---|---:|
| Peak Nest | 689 | 2025-10-09 | 170 |
| Zameen EON | 696 | 2026-01-05 | 10 |
| Clifton Square | 707 | 2026-06-23 | 14 |
| Zameen Hive | 708 | 2026-05-01 | 11 |
| Broadway by ICON | 709 | 2026-07-10 | 15 |
| Florence Hill | 714 | 2026-07-29 | 19 |

### 4.2 The Admin and Other workbooks differ in exactly two rows

The `Admin Contracts` and `Other Contracts` workbooks hold 1,124 rows each and
agree on all but two. Both differences were checked and dispositioned; neither
lost anything.

- **Serial 1104.** `Admin` names the project *Aziz Excellency*; `Other` leaves the
  project name blank. The named row is kept and is in the register (start
  2024-04-29, Karachi). The blank copy names no agreement, so it makes no
  record — a blank is not a competing value.
- **Serial 1273** (*Contract Agreement — Grey Structure*). The two workbooks list
  different documents against the same agreement. Kept as a record, with the
  disagreement recorded rather than resolved.

### 4.3 Where sources disagree

**91 records carry a genuine disagreement between sources.** Both values are kept
and both are shown. **LegalOS does not decide which source is correct** — that is
a question about the business, not about data, and the record says so.

| Field in disagreement | Instances |
|---|---:|
| Documents listed | 231 |
| City | 60 |
| Contract value | 50 |
| First party | 42 |
| End date | 40 |
| Start date | 35 |
| Region | 21 |
| Department | 21 |
| Agreement type | 11 |
| Counter party | 2 |
| **Total instances** | **513** |

(One record can disagree on more than one field, so the instances total 513
across the 91 records.)

Two things were separated out of that count, because mixing them in was hiding
the real ones:

- **Spelling is not disagreement.** *"Lease Agreement"* and *"Lease agreement"*,
  *"Non-Disclosure"* and *"Non- Disclosure"*, *"ZIMS Security Pvt. Ltd"* with and
  without the closing full stop — one value, typed twice. **9 records** are
  recorded as spelling variants rather than conflicts. Every original spelling is
  kept; nothing in Drive or in the workbook was rewritten. The test is
  deliberately shallow: it folds case, punctuation and spacing and nothing else,
  so *Sahiwal* and *Bahawalpur* remain the conflict they are.
- **A filing number is not a term of the agreement.** The two workbook families
  number the same contract differently for the same reason they use different
  serials. **16 agreements** differed on nothing else.

---

## 5. What this looks like on screen

Findings that live only in a file under `audit/` are findings nobody acts on, so
both of the above reach **Data Health**:

- a **Contract templates** panel: all 413 files by state, a count of files not
  yet classified (zero), a note naming the 16 signed agreements found in the
  templates folder, and a note saying how many blank templates were taken off
  records and why that mattered.
- a **reader status** notice, shown only when something is wrong. It names what
  cannot be read — *"legacy Word documents"* — and never the software that reads
  it, and it says that the last complete set of records is still being shown.

And on the **Templates** page, which had the same problem as the registers but
from the other side: it listed all 406 files flat, so the Google advertising
agreement stamped by Google's legal department sat next to a blank pro-forma
with nothing to tell them apart. A signed contract that can only be found inside
the template library, described as a template, is a signed contract lost. Each
file now carries its state — *Signed agreement*, *Approved template*, *Draft*,
*Reference document* — the 16 signed ones are called out above the list, and
each states the stamp, seal or signature it was judged on so the label can be
checked rather than trusted.

---

## 6. Defects found that are not yet fixed

These are real and they block a clean freeze. None is a data-loss risk; all are
recorded with the evidence behind them.

1. **Eight duplicate logical contracts.** One agreement recorded twice, surviving
   because the two rows differ in title and one leaves the counterparty blank —
   for example ref 95 *Vehicle Lease Agreement* (Adil Masud) and ref 137 *Lease
   Agreement*, which share a type, a start date of 2018-12-06 and the same
   documents column. A conservative rule (same type, same start, same documents,
   with one title containing the other and no contradicting counterparty) merges
   these eight and correctly leaves eleven look-alike pairs separate — including
   *Lease Agreement SF14* against *SF-11 (Square One)*, and the 2nd/3rd-floor
   against the 1st/2nd-floor Bughti leases, which a looser rule would have
   merged and destroyed.
2. **A wrong attachment.** The drain pipeline agreement sits on the *Zameen Ace
   Mall* property record rather than on contract ref 1233, whose first party
   (ZUI Investments) and documents column both name it.
3. **An over-attached generic record.** Contract ref 1233, titled simply
   "Construction Agreement", holds 20 documents spanning Mall 35, Zameen
   Quadrangle, Kingcrete and Tetra — none of them the drainworks agreement it
   names.
4. **A suspected duplicate property record.** `PRP-1IIPG3R` and `PRP-1IIPG3S`
   are both *Zameen Ace Homes*, Islamabad, each holding the same 25 documents.
5. **A tracker inconsistency.** Contract ref 135's documents column names the
   Expo agreement while its type is Digital Marketing Agreement; ref 136, the
   Expo record, holds no document, and the Expo PDF is attached nowhere.

---

## 7. What still needs a person

Nothing here is a system error. These are questions only the business can answer.

1. **44 documents in the regional PPA folders that no tracker row names** (§2).
   Either a row is missing, or the document belongs somewhere else.
2. **91 records where two sources disagree** (§4.3) — most usefully the 50 value
   disagreements and the 42 where the first party is a different company.
3. **One filename variance** left flagged rather than merged: the same Defence
   Raya Condominiums PPA written once with spaces and once without. It was not
   folded away, because collapsing all spacing could merge genuinely different
   filenames.
4. **31 documents carrying a source defect** found by reading them — a missing
   signature, a blank schedule, a jurisdiction that disagrees with the stamp.
   These are defects in the signed paper itself. The files are preserved
   untouched and reported as they are; LegalOS has corrected nothing.

---

## Appendix — verification

Artefacts, all regenerable:

| File | What it holds |
|---|---|
| `audit/zm-contracts-root-inventory.json` | the unbounded crawl: every folder and file |
| `audit/zm-template-library.json` | all 413 template files, one state and a stated basis each |
| `audit/zm-ppa-record-lineage.json` | every workbook row, and which agreement it merged into |
| `audit/zm-ppa-workbook-diff.json` | the two trackers compared sheet by sheet and row by row |
| `audit/zm-ppa-document-lineage.json` | where each of the 995 files ended up |
| `audit/zm-contracts-final-summary.json` | the counts above, with the reconciliation flags |

Checks:

```
node tests/m11-template-library.js     28 checks — the 413, and template pollution
node tests/m10-crawl-depth.js          15 checks — nothing below level 12 goes missing
node tests/m9-commercial-freeze.js     32 checks — the commercial freeze
node tools/zm-final-summary.js         regenerates the two summary artefacts
```

Every count in this document reconciles:

- template files: 413 classified = 413 under the root
- workbook rows: 1,183 agreements + 2,500 copies = 3,683 rows
- physical files: 384 + 533 + 29 + 49 = 995

One reader defect is worth recording, because it is the failure mode this work
exists to prevent. A drafting clause held as an OpenDocument file read as *empty*
— not as an error, as nothing at all — because the reader shelled out to an
`unzip` program that is not installed on this server, and the failure was
swallowed. It is now read in process, and a reader that cannot open a file says
so instead of returning blank text.
