# LegalOS — full bidirectional data reconciliation

**Date:** 18 September 2026 · **Scope:** every Drive root, every register, every document link
**Result:** all seven reconciliation gates at zero. No object in the source is unaccounted for.

Drive was read only. No file or folder was renamed, moved, rewritten or deleted.

---

## 1. What this exercise was

Two passes over the same estate, in opposite directions.

**Forward — source to LegalOS.** Crawl every shared Drive root from the top down to the
leaves and give every object a disposition: what it is, and where it ended up. Nothing may
remain unknown.

**Backward — LegalOS to source.** Take every record and every document LegalOS displays and
trace it back to the file and the tracker row it came from. Nothing may be shown that the
source cannot account for.

The point of running it in both directions is that each catches what the other cannot. The
forward pass finds what the system is ignoring. The backward pass finds what the system has
invented.

---

## 2. Headline: the number got worse before it got better

At the start of this work, 754 files were unresolved. That number was wrong, and it was
wrong in the more dangerous direction — it was flattered by roughly three thousand document
links that the matcher had guessed at and could not defend.

| Stage | Unresolved | What changed |
|---|---:|---|
| Reported at start | 754 | Flattered by ~3,000 unproven document links |
| After removing unproven links | 3,820 | The real gap, made visible |
| After reading the statutory root | 461 | 3,359 statutory documents placed |
| After the loan and litigation joins | 384 | Deterministic joins replacing guesses |
| **Final** | **0** | Every remaining file disposed by its own folder |

Removing a false link raises the unresolved count. That is the correct direction of travel:
a document nobody can place is a known gap, while a document placed on the wrong contract is
a false statement that looks like coverage.

---

## 3. The estate as crawled

5 roots · 1,531 folders · 6,843 files · 0 unreadable folders.

| Root | Files | Folders |
|---|---:|---:|
| Entities data for secp filing | 3,367 | 675 |
| Compliance Data _LegalOS | 1,772 | 190 |
| Commercial_Zameen Media Contracts | 995 | 350 |
| Commercial_ZD Projects Master Data and Tracker | 308 | 131 |
| Litigation & Dispute - LegalOS | 401 | 185 |

### The statutory root was invisible until now

`Entities data for secp filing` — half the estate — was not shared with the service account
when the SECP module was built. That module's own header recorded the fact honestly: a crawl
of the four visible roots found no FY folder, no AGM folder and no SECP folder anywhere, and
so the module was seeded only from the board minutes it could find elsewhere.

That statement was true when it was written and is now false. The root is shared, and it
holds the statutory record the module was missing: **3,367 documents across 43 companies**,
filed by entity and by calendar year — Forms A, 1, 3, 7, 8, 9, 10, 12, 17, 19, 21, 23, 26,
28, 29, 43 and 45, AGM and EOGM papers, share certificates, registers of members and
directors, provident fund records and SECP show-cause notices.

The header has been corrected in place rather than rewritten, so the record of what was
believed, and when, survives.

---

## 4. Disposition of every file

| Disposition | Files |
|---|---:|
| Record document | 2,464 |
| SECP — filed under a calendar year | 1,908 |
| SECP — corporate action | 847 |
| Template / precedent | 326 |
| SECP — AGM | 247 |
| Entity document | 230 |
| Multi-record document (cited by name on each) | 176 |
| Project document | 144 |
| SECP — share certificates, registers, PF, notices, other | 355 |
| Module document | 42 |
| Source tracker | 79 |
| System file / not a document | 14 |
| **Unresolved** | **0** |

Folders: 1,531, all disposed. Tracker rows: 2,351 ingested, 208 recorded as incomplete at
source, 594 otherwise classified. **Incomplete source rows were preserved as incomplete.**
Nothing was filled in to make a total look better.

---

## 5. What was actually wrong, and what fixed it

### 5.1 Documents were being awarded on a shared place name

A Rawalpindi lease from landlord Zaheer Iqbal had been given three documents: two about
Mall 35 and one about **Silk Mall** — a different property. All three scored identically,
because all three matched on the same two words: `rawalpindi` and `mall`.

Three separate faults were behind it:

- **The cited filenames were never found.** The record's tracker row names its documents
  exactly — `Lease Agreement - Rawalpindi MALL 35-GF,FF SF.pdf`. Both files exist in Drive,
  under *Spend Contracts*. The matcher only searched the Commercial roots, so the citation
  resolved to nothing and the record fell through to guessing. Being told where a document
  is now outranks being scoped: a filename written in the tracker is honoured wherever the
  file lives. Source-proven links rose from **3 to 261** in the spend register alone.
- **Numbers were discarded.** The tokeniser dropped anything under three characters, so
  `Mall 35` and `Silk Mall` were the same word to it. Two-digit numbers are now kept.
- **A place was treated as identifying.** Words that any two property documents in Pakistan
  share — city names, `mall`, `plaza`, `floor`, `block`, `north` — can still contribute to a
  score but can no longer be the evidence that creates a link.

A record whose documents the tracker names exactly no longer runs the fuzzy matcher at all.

### 5.2 Loans could not tell five identical drawdowns apart

Five ZVO–EMPG loans share both parties, the same currency and the same AED 3.6m principal,
and differ only by date. Token matching cannot separate them, and was giving whole folders to
the wrong drawdown.

Both sides state the date: the tracker writes `Loan Agreement dated 02-Sep-2020`, the folder
is named `[Loan Agreement dated 02.09.2020]` or `…_20131015`. Normalising all three
spellings to one day turns the guess into an exact join on a value the source itself wrote.
Where two loans share a day, the amount stated in the folder name breaks the tie — and if it
does not, the record is left unlinked, because a document on the wrong drawdown is worse than
a record with no document.

Loan records carrying documents: **90 → 112**.

### 5.3 Case files stopped at the case folder

Litigation folders were keyed by exact path, so `…/Ali Vs. ZMPL` and
`…/Ali Vs. ZMPL/Annexures` were unrelated groups. Only the first could be matched, and the
applications, annexures and orders filed one level down belonged to nothing. A case folder is
now a case file all the way down.

Litigation records carrying documents: **138 → 258 of 357 (72%)**.

### 5.4 Sharing a document was an access decision made by accident

Document authorisation treats a file cited by several families as readable by any of them, so
each extra holder widens who can open it. The old rule let a *guessed* match sit on two
records and never looked across families at all. One MEP works agreement was held by two
contracts and four properties; a PACRA rating mandate by both contracts and loans.

Sharing is now decided on evidence:

| Evidence | May be shared |
|---|---|
| The tracker names the file | Any number of records, across families — the source is describing a genuinely shared instrument |
| A deterministic folder link | Within one family only — an original suit and its appeal are two rows and one case file |
| A token guess | One record. Never. Across. Families. |

920 documents are shared today, **every one of them because a tracker cites it by name**.

### 5.5 An unclassified root was advertised to everyone

Adding a fifth Drive root exposed a disagreement between two pieces of code that
are supposed to enforce the same rule.

`mayReadFile` maps a root to a module group and **fails closed** when it does not
recognise one — its comment says so explicitly, and it was right: every one of
the 3,367 statutory documents was denied to everyone except an administrator.

The knowledge tree did the opposite. Its condition read
`if (isAdmin || !group || level !== "none")` — so a root that matched no group
fell through the `!group` arm and was listed to **every** legal user: its name,
its folder names and its file counts. Its own comment two lines above states the
rule it was breaking: *"A root the caller may not read is not listed at all — its
existence, folder names and file counts are themselves information."*

Both are fixed. The statutory root is now classified as **compliance**, which is
what it is — SECP filings are shown under Compliance & Licences — so compliance
staff can read it and others cannot. And the tree now fails closed on an
unrecognised root, matching `mayReadFile`, so the next new root cannot repeat
this.

---

## 6. Register coverage after reconciliation

| Register | Records | With documents | Attachments |
|---|---:|---:|---:|
| Resolutions | 933 | 913 (98%) | 913 |
| Properties | 38 | 28 (74%) | 692 |
| Litigation | 357 | 258 (72%) | 692 |
| Loans | 192 | 112 (58%) | 1,603 |
| Contracts | 1,371 | 648 (47%) | 1,924 |
| Licences | 7 | 7 (100%) | 13 |
| Notices | 255 | 13 (5%) | 14 |

Notices remain deliberately low. Drive holds a PDF for only about 30 of the 255 logged
notices, and the tracker's free-text subject shares no dependable key with the filenames —
both parties are usually "Zameen Media". Every attempted match produced confident-wrong
links, so none is made. The 30 notice PDFs stay reachable through search.

---

## 7. Findings that are not defects

These are conditions in the source. They are reported, not corrected — changing the source
was out of scope and would in any case destroy the evidence.

- **Six litigation matters exist in Drive but not in the Litigation Tracker.** Case folders
  hold filed documents for: *Syed Fakhar Imam Vs. ZMPL (Payment of Wages Authority)*, three
  *WAPDA Employees vs WAPDA* matters (Sargodha, Faisalabad, Sheikhupura), *ZMPL Vs.
  Federation of Pakistan & others (PRA)*, and *Kulsoom Bibi Vs. GOP*. Their documents are
  disposed as case files for matters the tracker does not list.
- **One document is cited on two unrelated records.** `FirstAmendment_ZameenMediaandTariqAfzaal…`
  is cited both on a Tariq Afzaal fire-fighting service record and on a security services
  record whose counterparty is Gulraiz Afzal Khan. The source states both. The conflict is
  preserved rather than silently resolved.
- **Eight companies existed only in the statutory root.** Zameen Nexus, Zameen Core, Zameen
  Habitat, ZI Universal, Mall 35 Facilities Management, Property Transaction Services, TAAD
  Technologies and Downtown Rise Developments held no contract, loan or licence, so the
  entity roster did not admit they existed — while LegalOS held 276 statutory documents for
  them. The statutory root is now an entity source in its own right.
- **Only 53 of 3,367 statutory documents carry an acknowledgement.** See §8.

---

## 8. The rule that governs the statutory module

**A form on file is not a filing.**

A Form 29 sitting in a `CY 2023` folder proves the company prepared a Form 29. It does not
prove the regulator received it. Only an acknowledgement, challan or receipt is evidence of
submission — and there are 53 of those against 671 forms on record.

The two are counted separately, labelled separately and never merged, all the way to the
screen. Nothing in the statutory root is promoted into a completed filing. Where a company
has no statutory folder at all, the screen shows that it has none — which is not the same
statement as "nothing has been filed", and is not rendered the same way.

---

## 9. Gates

Run with `node tools/full-reconcile.js`.

| Gate | Result |
|---|---|
| Unresolved files | 0 |
| Unresolved folders | 0 |
| Records without lineage | 0 |
| Documents not in Drive | 0 |
| Duplicate record ids | 0 |
| Missing record ids | 0 |
| Unclaimed trackers | 0 |

These are re-asserted on every test run by `tests/m4-data-lineage.js` (22 checks), which
walks both directions and additionally proves that every attachment records *how* it was
linked, that no document is shared on a guess, and that no document crosses a family. That
suite found §5.4 on its first run.

Artifacts, all machine-readable, in `audit/`: `reconciliation-summary.json`,
`full-source-registry.json`, `full-file-disposition.json`, `full-folder-disposition.json`,
`full-row-disposition.json`, `full-record-lineage.json`, `full-document-lineage.json`.

---

## 10. Reading the documents (added 2026-09-21)

Everything above reconciles the SHAPE of the estate — where each object sits and
which record claims it. This section is about opening the files.

### The estate is scanned paper

A 29-document sample across all five roots found **8 with a text layer and 21
without**, and there is no OCR on this server. So "read the documents" needed two
mechanisms, not one, and the difference between them is carried all the way to
the screen.

| How a document was read | Documents |
|---|---:|
| **Text extracted and held** — we have its own words | **1,566** |
| **Scan read via Drive's OCR index** — we know which measured keywords are in it | **2,387** |
| **Not read** — images, legacy `.doc`, or a scan no probe matched | 2,890 |
| **Total with some content signal** | **3,953 of 6,843 (58%)** |

`tools/content-index.js` fetched all 6,763 indexed files — **12.2 GB, zero
failures** — extracted text with `pdftotext` and a docx reader, cached it, and
deleted every downloaded copy immediately. Nothing was written to Drive.

### Google has already OCR'd the scans

Drive's `fullText contains` searches document CONTENT, which is provable rather
than hopeful: "witnesseth" returns 30 documents and matches **no filename at
all**, as do "hereinafter referred to as" and "WHEREAS the Lessor".
`tools/content-probe.js` asks that index for 68 measured single words and
records which documents come back. That reads the scanned majority without
downloading it and without touching the source.

**Two measurements changed the design, and both corrected a first attempt:**

- **The index is token-based, not phrase-exact.** Scrambling "WHEREAS the
  Lessor" into "Lessor WHEREAS the" barely moves the count (665 against 616),
  and a three-word probe returns MORE hits than its rarest word alone. Every
  multi-word probe was therefore discarded — they looked precise and were not.
- **It is ~93% precise, not the 67% it first appeared.** Measured against 791
  documents whose text we hold. The disagreements were checked by downloading
  the documents WHOLE: **11 of 14 turned out to be the index being right and our
  own extract being partial**, because we read the first 8 pages and those are
  15-to-36-page leases whose "lessee" sits on page 20. Recall 91%.

Because it is 93% and not 100%, a content match is supporting evidence and never
on its own sufficient to assert that a document belongs to a record.

### Linking records to documents by what is inside them

`tools/content-link.js` closes the gap left by the rule that filename similarity
must never create a legal relationship — roughly 900 records had no document at
all because the tracker names a party and the document is a scan called
`0001.pdf`. A party's name in the BODY of an agreement is a different kind of
fact from the same name in its title.

It took four corrections to become honest, each one caught by reading the
proposals rather than the counts:

1. It proposed **the litigation tracker itself** as evidence for every case — a
   tracker lists every party, so full-text returns it. A tracker is where a
   record came from, not a document of it.
2. Single-word matching gave "Mehran Abbasi vs Zameen Media" a summons about
   *Omer Ashraf*. Two words are now required, intersected across two queries,
   because the index cannot AND them itself.
3. Two words still matched on `media`, `state`, `others`, `additional` — none of
   which names anybody. Only the **counterparty** side of "X vs Y" is used now,
   with our own group names excluded.
4. Two words still matched on `first`+`amendment`, handing ONE document to five
   different records (Dream Garden, Palm City, Maymar Pride, Falaknaz Dynasty,
   Grand City), and on `tower`+`floor`. The fix is measured rather than a
   growing banned-word list: **at least one of the two words must be rare in
   this estate** (≤30 documents), and the rare word must be one of the pair that
   matched that document.

## 11. Module by module: Commercial_Zameen Media Contracts

995 files, 350 folders, nesting to 12 levels, in two branches.

**Documents attached to no record fell from 449 to 128** (of 979). What fixed it:

| Defect | Effect |
|---|---|
| The properties matcher only searched the ZD Projects root | 324 sale-deed documents in 24 project folders reached nothing. `Agreement to Sell & Sale Deeds / Zameen Arx - Lahore` and its siblings are now joined to their project by folder name. |
| Project folders were matched by token score, not by name | Seven projects — Jade, Neo, Phoenix, Golf View Rumanza, Downtown Rumanza, Boulevard Heights, Grande Palladium — showed ZERO documents while a folder bearing each one's name sat in the root. Now matched by name. **All 38 of 38 projects now hold documents.** |
| The document-sharing rule tested the register FAMILY | Access is decided per module GROUP, and contracts and properties are both commercial — so sharing between them widens access to nobody. Testing the family stripped those same seven projects of everything a contract had also cited. |
| A ten-character floor on folder names | "almadevii" is nine characters, so **both** Al Madev folders were skipped before any matching ran. Al Madev Complex I and II now hold their own 11 and 13 documents, kept apart by exact signature rather than a prefix test — "almadevi" is a prefix of "almadevii". |
| "Zameen Pheonix" | The tracker's spelling; Drive says "Phoenix". Accepted as a single adjacent-letter transposition in a 14-character name. Neither side is edited. |

**What remains unattached is correct.** 80 are genuine precedents — MOUs, NDAs,
grey-structure and employment templates — which belong in the Templates library
(all 413 are listed there), not bolted onto a record. 48 are PPAs for projects
the contracts tracker does not name: Broadway-ICON, Mehran Icon, and an 18-file
catch-all. Nothing was invented to make those numbers meet.

**One near-miss worth recording.** A filename-to-title matcher I added produced
ten wrong links in its first run — a record titled "Third Amendment" took
`ThirdAmendmentofGrandOrchard`, "First Amendment" took `FirstAmendmentV9mall`.
Length was no protection: "thirdamendment" is fourteen characters. It now
rejects the `GENERIC_TITLES` set, and the surviving matches are right
("Mall of Gujrat" ← `MallofGujrat_PPA`, "Grand Orchard" ←
`ThirdAmendmentofGrandOrchard`).

## 12. Where the documents disagree with their folders

Reading the documents makes a new question answerable: does a document's content
match where it was filed? Across all 6,843 files:

| | Documents |
|---|---:|
| Content and folder say the same thing | 1,151 |
| Content is MORE SPECIFIC, same domain (a statutory folder holding an affidavit) | 1,342 |
| **Content points at a DIFFERENT DOMAIN** | **314** |
| Folder says something, content unreadable | 2,744 |
| Content says something, folder implies nothing | 636 |
| Neither | 656 |

The three-way split matters. A first pass called everything that was not an
exact match a disagreement and produced 1,656 of them, which buried the ones
worth reading: a statutory folder containing an affidavit or a set of financial
statements is not misfiled, it is a folder holding the bundle it is supposed to
hold. Only a change of DOMAIN is worth a person's time.

The 314 that remain are led by 62 documents in loan folders that read as court
filings, 45 in resolution folders that read the same way, and 17 in the
statutory root. **None has been moved.** A keyword disagreeing with a folder is
a reason to look, not a licence to refile somebody's legal records, and the
source is not edited here.

## 13. What is not done

- **`Entities data for secp filing` is read but not yet fully modelled as obligations.** The
  documents, entities, years, forms and categories are surfaced. Turning "Form A exists for
  CY 2023" into "the CY 2023 annual return obligation is met" requires the acknowledgement
  evidence that mostly is not there, and would be exactly the inference §8 forbids.
- **The 847 corporate-action documents are classified but not itemised.** They sit under
  share-transfer and director-change folders and are reachable by entity and year; they are
  not yet broken out as individual corporate actions.
- Notices coverage stays at 5% by design (§6).
