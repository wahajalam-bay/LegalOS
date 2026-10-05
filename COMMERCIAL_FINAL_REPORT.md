# Commercial — final reconciliation report

Every document whose placement was in doubt has now been read, and the estate has
been reconciled, resolved, rebuilt and re-verified against those readings.

All figures below are **post-promotion**: they come from the run that finished
after the last mapping change, not from an earlier pass.

---

## Final Commercial counts

```
SOURCE ESTATE
  Physical/source files in Drive        1,303
  Distinct documents by checksum        1,181
  Duplicate file copies                   122
  Duplicate checksum groups                87

READING
  Documents requiring deep read           377
  Completed                               377
  Pages visually inspected                749
  Failures                                  0

MAPPING
  Files dispositioned             1,303 / 1,303
  Unknown                                   0
  Wrong attachments                         0
  Review queue                              0

SOURCE QUALITY
  Documents carrying a source issue         31
  Application mapping defects, after fixes   0
```

**Terminology is load-bearing here.** There are **1,303 physical source files** in
Drive and **1,181 distinct documents** among them. Counts of *files* and counts of
*documents* are never used interchangeably in this report or in the application:
a duplicate is a second copy of one document, not a second document, and every
physical copy keeps its own Drive path.

---

## A. Reading

| | |
|---|---|
| Commercial files in Drive | **1,303** |
| Files whose placement was uncertain, and were read | **377** |
| Read successfully | **377** (100%) |
| Read failures | **0** |
| Pages rendered and looked at | 749 |

The 377 were not an arbitrary sample. They are the union of every document the
pipeline could not place with confidence: the review queue, everything unattached,
every contested attachment, every precedent not confirmed as a template, and
everything previously recorded as unreadable. The remaining 926 files were already
placed on agreeing folder, filename and extracted-text evidence, and 263 of those
already held extracted text.

**How they were read.** 315 by looking at rendered pages, 51 from an extracted text
layer, 2 from both, 6 carried across from a byte-identical twin, and 3 could not be
read at all — see below.

**What reading established:** 231 documents seen to be executed, 127 seen to be
unexecuted, 350 with named parties, 264 naming a project, 55 naming a parent
agreement, 120 distinct projects and 156 distinct counterparties.

**The three that cannot be read, and why none is a reader failure**

- Two are **zero-byte files in Drive**. The source contains no document.
- One is a **`.rar` archive** — a container, not an instrument.

They are recorded as `EMPTY_SOURCE_FILE` and `NOT_A_DOCUMENT` rather than as
unreadable documents, because the distinction matters: nothing is wrong with the
reader, something is wrong with the source.

**Three executed agreements had been hidden by a size limit.** An earlier 31MB cap
refused them, and they sat in the store as "unreadable". They are:

- the four-party **Shareholders Agreement** (21 Feb 2022) forming "Group A" —
  Zameen Centre, ZI Universal and AASH Projects — with Prosyon (Private) Limited;
- the **executed** Amended and Restated JV for Mall 35 (Zameen Alpha ↔ EBCO
  Constructions, 25 June 2019), of which only the unsigned draft had been seen;
- the Mall 35 grey structure contract with Tameer Construction (27 Oct 2020).

The cap was excluding precisely the largest and most consequential instruments.

---

## B. Mapping

| | |
|---|---|
| Queued attachments decided | **27 of 27** |
| Documents placed from their own pages | **40** |
| Placements refused for thin identity | **0** |
| Executed documents moved off TEMPLATE | **12 of 24** |
| Actionable human-review queue | **0** (was 22) |
| Items left "unresolved after full document analysis" | **0** |

Resolution safety: 40 `SAFE_AUTO_ATTACH`, 27 `LIKELY_DRAFT_COPY`,
26 `SAFE_AUTO_RECLASSIFY`.

**Disposition arithmetic reconciles exactly:**

```
 1072  auto-resolved
  145  no extractable text, safely classified by folder
   37  project-only / historical
   36  template
   11  reference
    2  non-commercial contamination
 1303  total   (Commercial files: 1,303 — reconciles)
```

---

## C. Project reconciliation

**The estate holds fewer documents than the file count suggests.** Checksumming
every size-collision candidate found **87 byte-identical groups covering 122
redundant copies**, so Commercial holds **1,181 distinct documents, not 1,303**.

Most of that is legitimate: 7 groups are one blank precedent kept in several
projects' template sets, which is correct filing. What matters is the rest.

**Seven provable wrong attachments, all one story.** Byte-identical documents were
attached to records describing *different* projects. Every one is a Zameen Aurum
document also attached to Zameen Ace Mall. Reading settled it three independent
ways:

- the **TEPA/LDA traffic NOC** (No. 52, 30-1-2020) names *Zameen Platinum Pvt Ltd*,
  Plot 15-A Block L Gulberg III, 4 kanal;
- the **property tax demand** is for Property No. L-SXXA-**15/A**, Gulberg III;
- the **236K purchase receipt** dates Zameen Platinum's acquisition of 15-A to
  April 2019 at Rs 66,820,000.

Zameen Ace Mall is a ZUI Investments project at **DHA Phase-II, Islamabad** — a
different city. The documents are Aurum's; the Ace Mall attachments were wrong and
have been removed.

**Nine duplicate *records*, not wrong attachments.** A further nine groups have one
instrument held by two records that describe the *same* project — usually two
folder spellings (`Zameen Opal` / `Zameen Opal_`, `Zameen Ace Mall` /
`Zameen Ace Mall_`) or the same contract entered twice. No document is on the wrong
project; the register has two rows where it should have one. They are listed in
`audit/commercial-identity-gate.json` for merging.

**Eighteen documents whose content names a different project than their folder**,
of which 5 are executed. The four Aurum tax documents above, plus
`Aurum Area Summary.pdf` filed under Zameen Quadrangle.

---

## D. Contract chains

33 chains reconstructed — 21 folder-grouped, 3 confirmed, 3 probable, 6 still
needing a person. Reading rebuilt several end to end:

- **Broadway Heights** — PPA # 2503-017 (28 Sep 2017, Q-Links) → First Addendum
  (16 May 2018) → Second Addendum (4 Dec 2019) → a *separate* Service Agreement
  (25 Oct 2019) → its First Amendment (11 Oct 2020). The filename groups all five
  as "no. 15"; they are two successive instruments, not one.
- **J Heights** — PPA (4 Oct 2021) → four amendments → First Addendum (3 Jul 2025),
  service period extended to 12 Dec 2026.
- **Golf View Rumanza** — non-binding MOU (29 Jan 2021) → DHA Multan land sale to
  ZB Developers (Dec 2021) → PPA (4 Feb 2022).
- **Downtown Rumanza** — DHA Multan → Delta Centauri land sale (20 Oct 2021, Plot
  RC-01) → 1st Amendment (26 Dec 2022).
- **Madison Square** — Enaara → Maqen sale deed (13 Jan 2025) → LDA transfer letter
  (27 Jun 2025) → commercialization payment verified (11 Jul 2025) → board
  authority to deal with Zameen (Nov 2025).
- **Six terminated PPAs** — Box Park 2 and 3, Spring Arch, Hyde Park One,
  River Hills IV, River Courtyard Tower II, each closed by an executed
  acknowledgment letter.

**Four land assemblies**, each traceable from title to plan:

| Assembly | Location | Evidence |
|---|---|---|
| Icon Valley Ph-I | Mouza Pajji, Lahore | two 2008 deeds, 101-11-0 + 107-2-0 = **208-13-0**, matching the DC's "208.65 kanal"; mutated to Zia Mohi Ud Din |
| Icon Valley Ph-II | Mouza Rakh Rai, Raiwind | registries plus patwari shajras (receipts 1333/1334) covering exactly the 200K-17M the LDA queried |
| ADP | Chak 62 Kot Jiwan Mal | co-owner fards → mutations 441/615/**864** → two registries to Kashif Javaid (Rs 147M and Rs 48M) |
| AMC | Mouza Baleel, Multan | family fards and non-encumbrance certificates → Jan 2026 sale to Valencia's CEO and a director, matched by CNIC |

Karachi holds two further sites: the Saddar Cooperative Market on Abdullah Haroon
Road, whose root title is a **Government of Sind evacuee property transfer order of
15 December 1953**, and Gulshan-e-Maymar Plot COMM-12/1, where the site plan and
the SBCA construction permit agree to the square yard (2,488.88).

---

## E. Defects found in executed, binding documents

These are not filing problems. They are errors inside signed instruments, and none
is visible from a filename, a folder or metadata.

| Document | Defect |
|---|---|
| Samrina Boulevard project sales agreement | Calls itself an *IT Services Agreement*; its running footer reads **SAEEDA RESIDENCY**. The e-stamp, issued by the Board of Revenue, confirms it is a project sales agreement with Samrina Builders. Copied from Saeeda's file and not updated. |
| Tomorrow Land IT services agreement | The Zameen representative's name is still in template brackets, and the e-stamp names a *different* representative than the deed. |
| Al Faateh Agri Farms service agreement | The e-stamp names two customers; the deed names one. |
| Peak Nest IT services agreement | Executed at Lahore on a stamp paper marked "ONLY USED FOR ISLAMABAD". |
| Clifton Square project sales agreement | The customer is described as "a company incorporated under the laws of Pakistan… acting through its **sole proprietor**". |
| Royal City Sargodha settlement | The printed execution date is a placeholder; the document is dated only in manuscript. |
| Golf View Rumanza PPA | Executed with **Annexure J (Schedule of Work) blank**. |
| HBFC digital marketing amendment | Names the customer "House Building **Company** Limited" while its own seal reads "House Building **Finance** Company Ltd". |
| Vienna Heights sales agreement | Customer initials omitted on page 1 (present on page 40); page 1 numbered "of 32" while later pages are "of 42". |
| Vintage Commercials IT agreement | The stored copy carries **no initials from either party** on any page read, despite a valid e-stamp and named customers. |

**A systemic drafting hazard.** Every file named `Base Draft.docx` is a *different*
project's agreement sitting in another project's folder — Mall 35's names Zameen
Phoenix, Zameen Neo's names Zameen Jade, Golf View Rumanza's names Zameen Aurum.
Three for three. Whoever fills one in inherits the wrong developer and address.

**Filenames that misdescribe their contents:** `Map.jpeg` is an unsigned draft LDA
letter; `Aurum Area Summary.pdf` is a granted TEPA NOC; `Zameen Aurum - CVT` is a
236W receipt; `PPAofPrimeCity` and `PPA Al Fateh` are Service Agreements;
`Applicable LDA By-laws` is a letter pointing to them; `Madisan Square…` is a board
resolution of Maqen Developers.

**Three non-estate files** — exam question banks, a police examination result and
personal study notes — sit in a Commercial "Miscellenaous" folder. They are
recorded as `NOT_A_LEGAL_RECORD`, not attached to anything.

---

## F. Product defects fixed

Data actually changed as a result of these:

1. **Reattachment only ever added, never removed.** The removal loop ran over
   property records alone, so four Aurum documents were added to Aurum and left on
   Ace Mall as well — because Ace Mall holds them through a *contracts* record. A
   reattachment that only adds doubles the error. It now spans every register family.
2. **A deliberate reattachment was silently pruned.** `content-reattach` ranked
   below a filename citation, so a correction was applied and then discarded by the
   sharing rules. It now ranks with filename evidence, because it is the outcome of
   reading the document, not a guess.
3. **"heights" was treated as a word unique to one project.** Ownership was counted
   across tracker projects only, missing Broadway Heights, Sitara Heights and
   J Heights in the contract list. Three *executed Broadway Heights* documents were
   reported as naming Boulevard Heights on the strength of one shared noun. Fixing
   it cleared the last three review items and improved chain reconstruction
   (human-review chains 12 → 6, confirmed chains 2 → 3).
4. **`commercial-resolve.js` crashed** when a project came from a page read rather
   than extracted text.
5. **A missing extractor looked like an empty document.** Installing an image
   library pruned `mammoth`, `word-extractor` and the assistant's CLI, none of which
   had been saved to `package.json`. Twenty-three real contracts — employment
   contracts, a bank cash-management SLA, a joint venture agreement — extracted to
   "" and would have been recorded as having no text. All four are now declared
   dependencies, a missing extractor is its own reported outcome, and the test
   suite asserts both.

Gates that were wrong rather than data that was wrong:

6. **`EXECUTED_DOCS_LEFT_AS_TEMPLATE` grepped prose** for "executed" and matched
   "**not** executed" — 15 correctly-classified documents reported as failures. It
   now reads the recorded facts.
7. **`WRONG_PROJECT_ATTACHMENTS` inspected only property records**, missing
   contracts holders; required filename *and* content evidence, rejecting
   content-proven moves; and demanded sole holding, rejecting a contract
   legitimately held by both its contract record and its project.

---

## F2. Where source defects are surfaced in the application

Drive is the source of truth and is never written to. Every defective document is
preserved exactly as filed, stays attached to the correct record, and can still be
previewed, opened in Drive and downloaded by anyone authorised to see it. What
changed is that LegalOS now **says** what is wrong.

**Administration → Data Health → Document integrity** lists every affected
document with Record, Document, Issue type, Severity, Evidence, a Drive link and
Status. Restricted to Legal and administrators.

**On a record** — a compact `Source quality: review required` badge in the header,
and a short *Source quality* block on the overview naming the issue types and how
many documents carry each. It does not make the page look broken.

**On a document** — a `Source issue` pill in the Documents tab with a one-line
`⚠` explanation underneath. Preview, Open in Drive and Download are unaffected.

Issue types, in a lawyer's words rather than a parser's:

| Type | Meaning |
|---|---|
| `SOURCE_DOCUMENT_CONFLICT` | The document contradicts itself or its folder about which project or instrument it is |
| `MISSING_SIGNATURE` | The stored copy carries no execution marks although drawn between named parties |
| `BLANK_SCHEDULE` | Executed with a schedule or annexure left blank |
| `JURISDICTION_STAMP_MISMATCH` | The stamp's jurisdiction is not where the instrument was executed |
| `MISFILED_DRAFT_CONTENT` | A precedent carries another project's details |
| `EXECUTION_ISSUE` | Something about the execution does not hold together |
| `EMPTY_SOURCE_FILE` | The stored file is zero bytes |
| `NOT_A_DOCUMENT` | The stored file is a container, not an instrument |

**31 documents** carry at least one issue — 9 high, 21 medium, 1 low.

**What the system will not do.** It decides which *record* a document belongs to.
It does not decide which of two contradictory wordings is legally correct, and it
never rewrites contract terms, execution facts, jurisdiction, signatures or
schedule contents. Where a signed instrument contradicts itself, both readings are
shown and neither is chosen.

These are classified **SOURCE QUALITY ISSUE**, not system failure: the file is
preserved, correctly attached, openable, the discrepancy is surfaced, and no
business fact is invented.

---

## F3. Duplicate handling

All **1,303** physical files are retained with their own Drive paths. Nothing is
deleted or collapsed in Drive.

Where files are byte-identical they are **one logical document** with several
stored locations, and every copy keeps its `fileId` and folder path as provenance.
A duplicate group never becomes two legal instruments. The freeze suite asserts
that each group still lists every physical copy and that no copy lost its path.

---

## G. Regression

See the scoreboard appended below. The suite was re-run **after** the final
mapping change and rebuild; no earlier green result is reported here.

New permanent protections added this pass:

- `tests/m8-reader-routes.js` — asserts that a tool's limits are never recorded as
  a document's: every file type reaches the right reader, transient failures are
  retried rather than recorded as verdicts, the extraction libraries are declared
  dependencies that actually load, and a missing extractor is its own outcome.
- The tool-name probe now carries a **negative control**. The installed CLI accepts
  a deliberately invented tool name, so "the CLI accepted it" proves nothing; the
  probe reports that it cannot answer instead of certifying a falsehood.

---

## H. Remaining genuine source ambiguity

Nothing is queued for a person. What remains is ambiguity in the source itself:

1. **Nine duplicate records** (section C) — the register holds two rows for one
   contract or one project under two folder spellings. Merging them is a decision
   about the tracker, not about any document.
2. **Three project folders with no tracker row**, and three project-only source
   records (Zameen Eon, Zameen Hive, Zameen Ivory by EDZD). Eon and Hive now each
   have real executed agreements behind them.
3. **Two zero-byte files and one archive** — unreadable because there is nothing
   there, not because reading failed.
4. **Six contract chains** still needing a person, where the source does not say
   which instrument supersedes which.
5. The defects in section E are **facts about signed documents**. They cannot be
   fixed by reconciliation; they are reported so someone can decide whether any of
   them needs a correcting instrument.
