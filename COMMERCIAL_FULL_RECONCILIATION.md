# Commercial — full reconciliation, read from the documents

**Date:** 21 September 2026 · **Scope:** the two Commercial roots only.
Compliance, Litigation and SECP were not touched.

Drive was read only. Nothing was renamed, moved, rewritten or deleted, and no
document body appears in any artifact produced here.

---

## 1. What was reconciled

| | |
|---|---:|
| Roots | 2 |
| Folders | 481 |
| Files | 1,303 |
| Documents (excluding trackers, locks, OS artefacts) | 1,286 |
| Tracker rows behind them | 1,409 |
| Contract records | 1,371 |
| Project records | 17 distinct (38 rows) |

Roots: `Commercial_Zameen Media Contracts` (995 files) and
`Commercial_ZD Projects Master Data and Tracker` (308 files).

---

## 2. What we could actually read

The estate is scanned paper, and this server has no OCR. "Read" is therefore
not one thing, and is never reported as one.

| Content state | Documents |
|---|---:|
| `CONTENT_NATIVE_TEXT` — a .docx, the words as authored | **337** |
| `CONTENT_LOCAL_EXTRACT` — a PDF with a text layer, every page | **77** |
| `CONTENT_PARTIAL` — text present but plainly truncated | **4** |
| `CONTENT_DRIVE_OCR` — a scan, read through Google's index | **681** |
| `CONTENT_UNREADABLE` — a scan no probe touched, or a legacy `.doc` | **183** |
| `CONTENT_NOT_REQUIRED` — an image or a workbook the ingest reads | **21** |
| **Analysed for mapping** | **1,099** |
| **Analysed for metadata extraction** (full text held) | **418** |

**15.9 million characters** of Commercial text were extracted and cached
locally; **7.5 GB** was downloaded and every downloaded file deleted the moment
it had been parsed.

This is a deeper read than the estate-wide pass: every page rather than the
first eight, 120,000 characters rather than 20,000. That mattered — the clause
naming a parent agreement and the execution block live well past page 8.

### Reading the scans

Google has already OCR'd this material. Drive's `fullText contains` searches
document CONTENT, which is provable rather than hopeful: "witnesseth" returns
30 documents and matches **no filename at all**. A vocabulary of distinctive
project names and instrument words was run against that index, and **1,046 of
1,303** Commercial files now carry at least one probed word — up from 531.

Project words and instrument words are kept deliberately apart. A project name
found inside a document is evidence of IDENTITY and may support a mapping. An
instrument word tells us what KIND of paper it is and may not.

---

## 3. Disposition — every file, no exceptions

| Disposition | Files |
|---|---:|
| `MULTI_RECORD_DOCUMENT` | 585 |
| `RECORD_DOCUMENT` | 428 |
| `PROJECT_DOCUMENT` | 143 |
| `PROJECT_ONLY_SOURCE_DOCUMENT` | 69 |
| `TEMPLATE` | 38 |
| `UNRESOLVED_REQUIRES_HUMAN` | 19 |
| `SOURCE_TRACKER` | 10 |
| `SYSTEM_FILE` | 7 |
| `REFERENCE` | 4 |
| **Total** | **1,303** |

`FILES_WITHOUT_DISPOSITION: 0` · `UNKNOWN_FOLDERS: 0`.

100% accounted for is not the same as 100% attached, and was never made to be.

---

## 4. What the documents say they are

Read from the content, not from the filename or the folder.

| Instrument | Documents |
|---|---:|
| Sale deed / agreement to sell | 372 |
| Project promotion agreement (PPA) | 141 |
| Construction | 118 |
| Addendum | 71 |
| Land record | 65 |
| Joint venture / partnership | 29 |
| Termination | 11 |
| Lease · Agreement · Service | 6 each |
| Novation · NDA | 4 each |
| Approval · MOU | 3 each |

### Where each sits in an agreement's life

| Stage | Documents |
|---|---:|
| Amendment | 229 |
| Original | 144 |
| Addendum | 28 |
| Novation | 8 |
| Annexure | 4 |
| Termination | 3 |
| Extension · Supplement | 1 each |
| **Unknown — we could not read it** | **885** |

An unread document is recorded as `UNKNOWN`, never as "original". An earlier cut
defaulted it and made 1,279 of 1,303 documents look like original agreements
when most had not been opened.

### Facts extracted, of the 418 documents whose text we hold

| | |
|---|---:|
| Document type identified | 363 |
| Named parties | 257 |
| Amendment number | 29 |
| Agreement date | 33 |
| Parent agreement referenced | 7 |

Dates look low and are not. Of the 381 readable documents with no agreement
date, only 23 contain a date string at all — and those are challans, tax
certificates and site plans, which do not carry one. The rest are certificates,
plans, or templates whose date is still a `[●]` placeholder.

**33 contract chains** were reconstructed where the documents declare their own
sequence, e.g. Zameen Opal: original licence terms → First Amendment to the SPA
(three drafts) → First Addendum (early possession).

---

## 5. The 130 unattached documents, each one dispositioned

| | Files |
|---|---:|
| `PROJECT_ONLY_SOURCE_DOCUMENT` — belongs to a project, no contract row claims it | 69 |
| `TEMPLATE` — precedent material, belongs in the library | 38 |
| `UNRESOLVED_REQUIRES_HUMAN` | 19 |
| `REFERENCE` — an image or media file | 4 |

### The 19 that need a person, and why

Six are unreadable scans that no folder or tracker places — including
`PPAofMountainvillasNaran_20220823.pdf` (Mountain Villas Naran is in no tracker)
and a file called `CamScanner 20-12-2025 23.46.pdf`.

Twelve are documents filed as precedents that read as executed instruments —
named parties and an agreement date in a template folder. That is a filing
question, not a matching one, and the conflict record carries both sides.

**Two are not commercial documents at all**: an *Election Commission Act 2017
MCQs* study file and a *written examination — qualified sub-inspector* list.
They are sitting in the Commercial estate and someone should take them out.

---

## 6. The templates, verified by reading them

89 documents in the precedent library were checked against their own contents. A
precedent should name no parties and carry no execution date.

| Verdict | Documents |
|---|---:|
| `TEMPLATE_CONFIRMED` — no executed signals | 47 |
| `PROBABLE_TEMPLATE_WITH_ONE_SIGNAL` | 30 |
| `LOOKS_EXECUTED_REVIEW` — two or more executed signals | **12** |

The 12 are flagged, not attached. A precedent is never bolted onto an
operational contract, and an executed agreement in a template folder is a
question for a person.

All 413 files in the template branch remain listed in the Commercial Templates
library, which is their proper home.

---

## 7. The PPAs

57 PPA documents that no record claims were read individually.

| Outcome | Documents |
|---|---:|
| `D` — project folder exists, no tracker row | 35 |
| `F` — project-only, source-backed (the document names its project) | 15 |
| `H` — human review required | 6 |
| `A` — existing project, exact name | 1 |

The 35 in class D are concentrated in `Broadway - ICON` (17) and
`Mehran Icon (Karachi)` (2) — projects whose names appear nowhere in the
contracts tracker. The nearest rows are "Broadway Heights Service Agreement" and
"Mehran Bin Qasim Trade Centre", which are different projects. Nothing was
forced onto them.

"Tracker doesn't name them" is no longer the answer for any of these: each has a
named outcome and its evidence.

---

## 8. Project folders with no tracker row

Three, and only three, survive as genuine project-only source records:

| Id | Project | Documents |
|---|---|---:|
| `PRJ-SRC-ZAMEENEON` | Zameen Eon | 11 |
| `PRJ-SRC-ZAMEENHIVE` | Zameen Hive | 4 |
| `PRJ-SRC-ZAMEENIVORYBYEDZD` | Zameen — Ivory by EDZD (Ex Grande Palladium) | 2 |

Each carries a stable id, its display name, its source folder, its documents and
`quality: SOURCE_NOT_IN_TRACKER`. **No business fields were invented** — entity
is null because no source states one.

An earlier cut listed fifteen. Ten of those were real projects the matcher had
failed to recognise ("ZD - Golf View Rumanza - Multan" against the tracker's
"Golf View Rumanza"), and two were template batches misread as projects
("0-Agreement to Sell-Standard Templates"). Both were matcher faults, and both
are fixed.

---

## 9. Conflicts between what a document says and where it sits

Every conflict is recorded with the folder's claim, the content's claim, the
filename's claim, the evidence and a recommendation. **Nothing is refiled in
Drive.**

Auto-resolution has one rule: the filename AND the document's own text must both
name the same other project. That is two independent sources against the
folder's one — the "clearly stronger deterministic evidence" bar. **13
attachments met it**, including:

- `20220118 PRIV Downtown Rumanza_Agreement to Sell` — filed under **Zameen Ace
  Mall**, moved to Downtown Rumanza
- `20220118 PRIV Downtown Rumanza_Leaseback Agreement` — same
- `240912-Agreement to Sell-Zameen Jade-Guaranteed Rent` — filed under Zameen Ace
  Mall, moved to Zameen Jade

**37 remain queued for a person**, each with its evidence. These are mostly base
drafts copied between projects and half-edited — `Base Draft.docx` in the Golf
View Rumanza folder whose body still says Zameen Aurum. That reads exactly like
a misfiling and usually is not one, so it is not moved.

---

## 10. Validations

| Check | Result |
|---|---|
| Al Madev I and Al Madev II hold separate documents | **PASS** — 11 and 13 documents, zero shared |
| Phoenix / Pheonix: both spellings preserved, mapped not rewritten | **PASS** — tracker "Zameen Pheonix", Drive "Zameen Phoenix"; 16 documents attached; neither side edited |
| Every questioned project attachment is resolved on stronger evidence or queued | **PASS** — 50 questioned, 13 auto-resolved, 37 queued |

Al Madev I and II are kept apart by exact signature, not by prefix: "almadevi"
is a prefix of "almadevii", so a prefix test would give one project the other's
file. Phoenix is matched by a single adjacent-letter transposition on a
14-character name — narrow enough that it cannot reach anything else.

---

## 11. Defects found and fixed in this pass

| Defect | Effect |
|---|---|
| Project matching used single tokens | "ace" names both Zameen Ace Mall and Zameen Ace Homes, "rumanza" both Golf View and Downtown. 80 of Ace Mall's documents looked like they belonged elsewhere. Only a word unique to one project, or the full project name in the text, may name it. |
| A 10-character floor on folder names | "almadevii" is nine — both Al Madev folders were skipped before matching ran. |
| Prefix-only project matching | "ZD - Golf View Rumanza - Multan" and "Zameen - Mall 35" looked absent from the tracker. Containment either way, plus the transposition, fixed ten false absences. |
| PPA folders compared against the properties register | A PPA is a contract. 36 folders were reported as having no tracker row while their rows sat in the contracts tracker. |
| Word-processor damage defeated every extraction regex | A date arrives as `1 st August , 20 19` and a party as `Zameen Media (Private) Limited ("Zameen")`. The first run found 5 dates and 2 parties in 418 readable documents, and zero parent references. After repairing smart quotes, split ordinals and split years: **257 parties, 33 dates, 7 parent references, 29 amendment numbers.** |
| "on this 24th day of May, 2021" was not a recognised date | The commonest form in Pakistani drafting. Adding it, with tolerance for OCR reading "28th" as "28111", recovered most of the dates. |
| Body text outranked the title for lifecycle | "FIRST AMENDMENT to Digital Marketing Agreement" that goes on to "extend the Term" was classified EXTENSION. The heading decides now. |
| "Schedule 1" referenced in an opening paragraph | Classified 148 ordinary agreements as schedules. A document that IS a schedule begins with the word. |
| Clause words treated as document types | `allotment` and `possession` are clauses of a sale. They had become the commonest "document type" in the estate; they are now a separate `clauses` field. |
| Lifecycle defaulted to ORIGINAL | 1,279 of 1,303 documents looked like original agreements when most had not been read. Unread is `UNKNOWN`. |

---

## 12. Machine-readable output

In `audit/`, none containing document text:

`commercial-document-context.json` · `commercial-document-disposition.json` ·
`commercial-project-lineage.json` · `commercial-contract-lineage.json` ·
`commercial-conflicts.json` · `commercial-reconciliation-summary.json` ·
`commercial-unattached-audit.json` · `commercial-template-verification.json` ·
`commercial-ppa-findings.json` · `commercial-project-only-records.json` ·
`commercial-validations.json` · `commercial-reattach.json`

Every extracted fact carries its provenance: the field, the value, the source
(document content / Drive OCR index / filename / folder), the method, the words
that fired, a quotation of at most 80 characters, and a confidence.

---

## 13. What is not done, stated plainly

- **183 documents remain unreadable.** They are scans that matched no probe
  word, plus 26 legacy `.doc` files this server has no converter for. They are
  counted as unread and are not guessed at. OCR would close most of this gap and
  needs software this machine cannot install without root.
- **19 documents need a person.** Listed individually in §5.
- **37 project attachments are queued for review.** Listed in
  `commercial-conflicts.json` with both candidates and the evidence.
- **35 PPAs belong to projects no tracker names.** They are dispositioned and
  reachable; creating tracker rows for them is a business decision, not a
  reconciliation one.

---

# Part II — closing the remainder (21 September 2026)

Part I established that the estate was 100% accounted for. This part pushes the
UNCERTAINTY down as far as the evidence safely allows.

## A. The populations, with their overlaps

Four numbers were being quoted side by side without anyone saying whether they
described the same files. They do overlap, and the arithmetic is now exact.

| Population | Files |
|---|---:|
| Unreadable | 183 |
| Human review | 19 |
| Queued attachment decisions (project conflicts not auto-resolved) | 85 |
| Executed-looking files in template areas | 12 |
| **Union** | **262 distinct files** (a naive sum says 274) |

- **Unreadable (183):** 5 also in human review · 0 also queued · 0 also
  executed-looking · **178 in none of the others** — classified safely from
  folder and tracker alone.
- **Human review (19):** 14 readable · 5 unreadable · 6 also executed-looking.
- **Queued attachments (85):** all 85 readable · 0 unreadable.
- **Executed-looking (12):** all 12 readable · 6 also in human review.

A separate 23 rows are folder-vs-content advisories, which are a different
population again and were previously being added to the conflict count.

## B. The 183 unreadable, exhausted

Every one was fetched again and put through every method this machine has:
`file(1)` magic, `pdftotext`, `pdf-parse`, `word-extractor` (a real OLE
compound-file parser), `mammoth`, a Python reader across every XML part, and
`strings` as a last resort. No LibreOffice, antiword or OCR exists here; the
parsers were installed as ordinary npm packages, not system software.

**The extension was lying.** 28 files named `.docx` had been recorded as
"scanned with no text layer", which is not a thing a `.docx` can be.

| Outcome | Files |
|---|---:|
| `CONTENT_RECOVERED` | 1 |
| `CONTENT_PARTIAL` | 30 |
| `CONTENT_UNREADABLE` | 152 |

Remaining causes, exactly: **148 scanned PDFs with no text layer**, **2 empty
files**, **2 whose bytes are not a document format at all**.

Estate-wide this moved unreadable from **183 to 156** and local extraction from
77 to 104.

## C. Executed agreements in template folders

All 12 were read and judged on content, not location:

| Outcome | Files |
|---|---:|
| `HISTORICAL_EXECUTED_DOCUMENT` | 5 |
| `REFERENCE_EXECUTED_SAMPLE` | 5 |
| `HUMAN_REVIEW_REQUIRED` | 2 |
| Confirmed genuine template | 1 |

**11 of 12 no longer sit under TEMPLATE.** None was attached to an operational
contract: §9 requires a valid operational relationship, and being executed is
not one. An executed instrument in the precedent library is recorded as exactly
that.

## D. The queued attachment decisions

91 of 114 decided, under the review-safety classification:

| Class | Files |
|---|---:|
| `LIKELY_DRAFT_COPY` | 92 |
| `HUMAN_REVIEW_REQUIRED` | 19 |
| `SAFE_AUTO_RECLASSIFY` | 12 |
| `SOURCE_CONFLICT` | 6 |

The largest class matters most. A base draft copied between projects, still
carrying the original project's text, **is not a misfiling** — it is how drafts
are made. It is distinguished from an executed document by the absence of named
parties and an execution date, and by draft markers in its own name. Those are
left where they are, deliberately.

`SOURCE_CONFLICT` is where two or more sibling documents in the same folder also
name the other project — which suggests the FOLDER is mislabelled, a bigger
decision than one file, so it goes to a person.

## E. Multi-record links — why 585 is not alarming

| Strength | Links |
|---|---:|
| `SAME_PROJECT_ROWS` — several tracker rows for one project | 414 |
| `FOLDER_SHARED` — one project folder, one project | 108 |
| `CITED_BY_SOURCE` — the tracker names the file on each record | 63 |
| **`WEAK_GUESS_SHARED`** | **0** |

By holder count: 184 held by two records, 120 by three, 278 by four or more —
almost entirely the duplicate project rows the trackers themselves contain.

## F. Contract chains, graded

| Grade | Chains |
|---|---:|
| `FOLDER_GROUPED` — a folder listing, not a claimed sequence | 16 |
| `HUMAN_REVIEW_CHAIN` — names more than one project | 12 |
| `PROBABLE_CHAIN` | 3 |
| `CONFIRMED_CHAIN` — a document names its parent | 2 |

Only confirmed chains are treated as operational. An earlier grading dumped 28
into human review, which put work in a queue no human action would resolve.

## G. The moved attachments

**4 distinct documents** (13 record-level entries across duplicate project rows)
were moved on two independent sources agreeing against the folder. Each
re-proved: filename evidence ✓, content evidence ✓, landed on the target project
only ✓, **Drive folder unchanged** ✓.

**A regression was found and fixed here.** The reattach plan was rewritten on
every reconciliation run. Once the moves succeeded the conflicts they resolved
no longer existed, so the next run produced an empty plan, overwrote the file,
and the following rebuild silently put all four documents back on the wrong
projects. A decision that evaporates when it succeeds is worse than no decision;
the plan is now cumulative and survives repeated runs.

## H. Final disposition arithmetic

| Category | Files |
|---|---:|
| Auto-resolved | 1,019 |
| Unreadable but safely classified | 147 |
| Project-only / historical | 74 |
| Template | 35 |
| Human review required | 17 |
| Reference | 9 |
| Non-commercial contamination | 2 |
| **TOTAL** | **1,303** |

It reconciles exactly to the file count.

**§34 in practice:** 147 documents whose body cannot be read are nonetheless
safely classified, because folder, tracker and file identity determine them
deterministically. The target was 100% safe disposition, not 100% OCR.

## I. Non-commercial contamination

Two files are not Commercial documents at all and are now classified
`NON_COMMERCIAL_SOURCE_CONTAMINATION`, keeping their Drive path and id:
an *Election Commission Act 2017 MCQs* study file, and a
*written examination — qualified sub-inspector* list. Neither is deleted from
Drive; both are visible as source contamination rather than as operational
Commercial uncertainty.

## J. The remainder, made actionable

**25 items** await a person: 23 project-attachment questions, 2 template-vs-executed.
Every one carries the file, the Drive path and id, the document type, both
candidates, the evidence for each, why automation could not decide, and a
suggested action — so a reviewer does not repeat the investigation.

They are exposed at **Administration → Data Health → Commercial review queue**.
A decision records the reviewer, the time, the reason and the evidence as it
stood, and **later reconciliations respect it and do not ask again**.

## K. Gates

| Gate | |
|---|---|
| `FILES_WITHOUT_DISPOSITION` | 0 |
| `WRONG_PROJECT_ATTACHMENTS` | 0 |
| `PROJECTS_WITH_NO_DOCUMENTS` | 0 |
| `PROJECT_ONLY_RECORDS_MALFORMED` | 0 |
| `PROJECT_ONLY_DOCS_UNPLACED` | 0 |
| `EXECUTED_DOCS_LEFT_AS_TEMPLATE` | 0 |
| `WEAK_MULTI_RECORD_LINKS` | 0 |
| `HUMAN_REVIEW_ITEMS_WITHOUT_EVIDENCE` | 0 |
| `HUMAN_REVIEW_ITEMS_WITHOUT_DRIVE_PATH` | 0 |
| `ARITHMETIC_RECONCILES` | 0 |

## L. Extraction regression fixtures

`tests/m6-extraction-fixtures.js` (18 checks) pins every shape that defeated the
extractor: `1 st August , 20 19`, `24th day of May, 2021`, OCR reading `28th` as
`28111`, smart quotes around a defined term, `between:` with a colon, amendment
numbering, parent-agreement references, and a title that must outrank the body.

Two further extractor bugs were found BY these fixtures and fixed: a party name
was lost when the parties were separated by a colon, and the "heading" window
was 300 characters wide — enough to reach past `FIRST AMENDMENT TO SERVICE
AGREEMENT` into a body saying "extend the Term", which classified it EXTENSION.

`tests/m7-commercial.js` (51 checks) holds the gates, the arithmetic, the
actionability of every queue item, and that a reviewer's decision persists.
