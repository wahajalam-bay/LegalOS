# Compliance Implementation Report

**LegalOS — Compliance & Licences**
Build **src-v244** · Drive re-crawled **17 Sep 2026** · all figures below are measured, not estimated.

Companion: **COMPLIANCE_DATA_RECONCILIATION.md** — every source row and every Drive
file with its disposition, and the arithmetic that closes.

---

## 1. What this report is

The Compliance team asked for six modules to move from *view a record → download a document* to a
complete legal lifecycle: identify → prepare → generate → review → approve → sign → execute → file →
track → renew/amend → audit.

This report states what was built, what the source data actually contains, and what is genuinely not
configured. Every number is reproducible: `GET /api/compliance/sources` returns the reconciliation
live, and `node tests/m1-compliance.js` re-derives it.

---

## 2. SOURCE RE-DISCOVERY

A fresh live crawl was run against Google Drive before any modelling. Not the previous snapshot — the
API was re-read from source.

**Estate crawled:** 3,476 files across 856 folders in 4 roots. `unreadableFolders: 0`,
`truncated: false`, `degraded: false`.

An independent `sharedWithMe` enumeration confirmed those 4 folders are **everything** the service
account can see, so no compliance material sits outside the crawl:

| Root | Files | Folders |
|---|---:|---:|
| Compliance Data _LegalOS | 1,772 | 190 |
| Commercial_Zameen Media Contracts | 995 | 350 |
| Litigation & Dispute - LegalOS | 401 | 185 |
| Commercial_ZD Projects Master Data and Tracker | 308 | 131 |

### LOANS

- **Source files:** `FDI_Loan_Tracker_20260611.xlsx`, `OLX_Loan_Tracker_Updated 20260609.xlsx`,
  `Inter Company Loans Tracker (1).xlsx`
- **Folders:** `Zameen Group_Loan Agreements` (380 files), `Zameen Group _PK Intercompany Loans`
- **Rows:** 192 ingested
- **Documents:** 464 classified into dated lifecycle events across 40 loan folders; 449 attached
- **History recovered:** yes — see below
- **Missing source fields:** outstanding balance (nowhere in source), interest on FDI loans,
  loan term on FDI loans, SBP reference numbers as structured data

**The central finding.** The 192 rows are not 192 loans. The FDI tracker's per-entity sheets are the
*rollover history* of the loans in its Master Tracker, in blocks separated by a repeated header row:

```
192 ingested rows
 =  60 loan agreements   (20 FDI master + 40 intercompany)
 + 117 historical event rows
 +  15 repeated header rows (spreadsheet separators, not records)
```

That identity is asserted in code and tested (`balances: true`). Rendering all 192 as loans overstated
the portfolio three-fold and hid the history the team needs.

**Folder-driven history.** The intercompany loans have *no* event rows at all — their history is in the
folder structure, and the FDI loans carry theirs as documents:

```
10.Loan Agreement_Zameen Platinum & Zameen Venture One [Rs. 760 mil.]_20190404/
   Loan Agreement/      First Amendment/      Second Amendment/      Third Amendment/
                                                                     └─ "loan to equity conversion"
```

Classified from filenames under the group's consistent `_YYYYMMDD` convention:

| Event kind | Documents |
|---|---:|
| Supporting | 77 |
| SBP registration request | 75 |
| Loan agreement | 72 |
| Amendment | 72 |
| Board approval | 71 |
| Authority correspondence | 52 |
| Proceeds realisation certificate | 17 |
| Repayment | 16 |
| Conversion to equity | 12 |
| Novation | 10 |
| Withdrawal | 6 |

94 of the 449 attached documents carry no date in the filename. They are kept, attached and flagged
`INCOMPLETE_SOURCE` — never given an invented date. The remaining 355 carry a real date.

**Coverage:** 40 of 69 loans now have a chronological history (was 12). Intercompany loans went from
0 to 16 with history.

**One folder is contested and awarded to nobody.** The intercompany tracker holds two Zameen Arcs loans
from Zameen Venture One, and both match the "Rs. 30 mil." folder on parties alone. A folder holds one
loan's documents, so it can be claimed by at most one agreement — on a tie it goes to neither, and the
contest is reported. Matching each agreement independently had attached the same 15 documents to both
records; that is fixed and asserted.

**9 loans exist in Drive with no tracker row** — including a withdrawn AED 3.6m facility with 55
documents, a Deevar/Bayut loan and two convertible loans. They are surfaced as records flagged
`DRIVE_ONLY` with unknown fields left null. Two are cross-flagged as a possible duplicate (the same
convertible loan is filed under both trees; LegalOS does not silently merge them).

**32 history rows remain unattached, for stated reasons:** 9 are ambiguous (the master tracker carries
one LRN twice, annotated "as cited — verify"), 23 sit in sheets whose entity has several loans and
whose reference cell is a placeholder (`N/A — no registration records` appears against three different
Daftarkhwan loans). Joining on a placeholder would have attached one loan's history to another.

### LEASES

- **Source:** `Master Tracker - Spend Contracts` workbooks, `Spend Contracts (Lease and Service Agreements)`
- **Rows:** 172 spend contracts → **91 leases**
- **Split basis:** the tracker's own `Agreement Type` column — "Lease Agreement" (89), "Tenancy
  Agreement" (1), "Employee Vehicle Lease Financing Agreement" (1). Not guessed from titles.
- **Missing source fields:** renewal term, renewal due date, renewal status, responsible owner

### SERVICE AGREEMENTS

- **Rows:** **68** — "Services Agreement" (50), "Service Agreement" (5), "Consultancy" (3),
  "Cosultancy" (2, a source typo, handled), "Digital Marketing Agreement" (8)
- **13 remain neither lease nor service** (NDA, MOU, Sale & Purchase, Franchise, Novation,
  Termination). They are not forced into either register; they stay in the contracts register.
- **Missing source fields:** scope of services, SLA terms, renewal status

### RESOLUTIONS

- **Source:** 39 per-entity `000 Summary - <Entity>.xlsx` workbooks, "Board Resolutions" sheets
- **Folders:** 44 entity folders under `Compliance Data _LegalOS / Resolutions`
- **Rows:** 914 across 39 entities
- **Source fields that exist:** Date, Agenda, Document No. **That is all.**
- **Missing source fields:** requesting department, person authorised, department/function, urgency,
  signature status, Drive upload status. These are LegalOS workflow fields — blank on the 914
  historical rows, populated on resolutions created here. Never back-filled.

**Attribution defect found.** Entity is derivable two ways — the Drive folder and the workbook
filename — and they disagree on 180 rows. 167 of those are naming variants of one company
(`Zameen RMC Limited` = `Zameen REIT Management Company`; `EDZD` = `EDZD Developers`) or generic
filenames (`000_Tracker.xlsx`). **13 are a genuine mis-filing**: Delta Centauri's summary workbook sits
in Downtownrise's folder. The folder is preferred and the 13 are flagged `CONFLICTING_SOURCE` rather
than silently resolved.

### LICENCES

- **Source:** `00_ Summary_ZTech Entities Licenses and Permits_ (1).xlsx`
- **Folders:** 8 authority folders under `Licenses & Approvals _ Pakistan Entities`
- **Rows:** 7 tracker + **1 Drive-only** (Deevar's PEC licence has a folder but no tracker row) = **8**
- **Documents:** 17
- **History recovered:** **5 renewals** reconstructed from dated certificates —
  LCCI/Zameen Developments has three (2022-12-09 → 2026-03-31 → 2026-04-07); PCATP, PEC and PSEB have
  one each.
- **Missing source fields:** renewal term, application references, fee amounts, responsible owner

### SECP

- **Filing register in Drive: NONE.** Verified, not assumed: across all 849 folders there are
  **0** FY folders, **0** AGM folders, **0** SECP folders and **0** "annual return" folders.
- **But evidence exists**, and it is now used — **54 documents**:

| Evidence | Count | What it proves |
|---|---:|---|
| Pre-/post-AGM board minutes | 39 | an AGM was **held** (11 entities, 2020–2025) |
| Resolutions approving audited financial statements | 7 | FS approval dates |
| The group's own SECP forms | 4 | Zameen Media Form A (2020-05-11), Daftarkhwan Form A & 29 |
| Third-party forms | 4 | **excluded** — a developer's due-diligence copies in a PPA folder, not ours |

A board minute proves a **meeting**, not a **filing**. Every date the UI shows carries its origin:
`recorded` (Legal entered it) or `drive-evidence` (derived from a document). They are never blended.

The filing register itself starts empty and says so, on the face of the dashboard.

### TEMPLATES

- **406 approved templates** in `Zameen - Pakistan Contract Templates` (370 approved, 36 marked
  DRAFT/work-in-progress from their own names and folders — a Word file is not treated as approved
  merely for being in the folder).
- By family: general 329, licence 26, service 22, lease 15, NDA 12, loan 3, termination 2.
- **No loan-amendment or resolution template exists.** Document generation cites the closest approved
  template and does not fabricate clause text.

### LETTERHEADS

- **0 approved letterhead assets exist.** One document mentions "Letterhead" in its filename, but it is
  a Dubizzle Labs resolution *printed on* letterhead — not a template. Treating it as one would mean
  generating future resolutions from someone else's signed minutes.
- Resolution drafts therefore state **"Letterhead not configured"** on their face.

---

## 2b. THE WORKSPACE: ONE DASHBOARD, SIX PAGES

The Compliance landing page was still the old model — six cards, four of which
opened legacy `/m/*` module pages holding **zero** records (their seed arrays
were emptied in September as fabricated demo data), and a sixth duplicating the
licence register.

It is now a dashboard and six separate module pages. Not a tabbed workspace: six
major registers behind a horizontal strip fails at the sixth item and fails
harder on a narrow screen, and putting the dashboard in the same frame as the
registers it links to makes the dashboard read as a seventh register.

```
/compliance                  Overview dashboard — no tab strip, no register table
/compliance/loans            Loans register          (+ /<id> for one loan)
/compliance/leases           Lease register          (+ /<id>)
/compliance/services         Service Agreements      (+ /<id>)
/compliance/resolutions      Resolutions
/compliance/licenses         Licences & Permits      (+ /<id>)
/compliance/sec-filings      SECP Filings
```

The module list is declared once in `src/compliancemodules.js`, which routing,
the sidebar and the breadcrumb all read — so a module cannot exist in the
navigation but not the router, or carry one name in the menu and another in the
crumb. Breadcrumbs read `ZM > Compliance & Licences > Loans > LON-XXXX`.

**The Overview is four bands, each answering its question once.** The first
version of it stacked six sections vertically and printed every book's total
three times — in the module card, in the alert rows and again in the health
block — which is most of why it ran to four screens. It is now:

| Band | Answers | Shape |
|---|---|---|
| Module cards | *what is here* | six cards, 140px, 3 / 2 / 1 responsive |
| Needs attention **·** Upcoming deadlines | *what do I do now* | side by side, 65% / 35% |
| Compliance health | *how healthy is each book* | six micro-cards, 116px, 3 × 2 |
| Recent activity **·** Insight | *what happened, and the one thing worth saying* | 60% / 40% |

A **module card** is a summary and a doorway, never a small version of the
register behind it: fixed grid rows, ellipsis on the title and summary line, and
a reserved-height chip row so a card with an alert and one without are identical.
The whole card is a named `<button>` that opens the module; the chip inside it
opens the module filtered to exactly those records. The number carries a unit
word beside it, which matters most on the one card whose honest headline is
zero — *"0 recorded filings · 43 entities · 33 compliance years evidenced ·
[Evidence available]"* reads as a fact, where a bare `0` read as an empty module.

A **health micro-card** states the share of its book that needs nothing today,
as a percentage and a bar, plus the one or two things that do — each a live
filter. It deliberately carries **no totals**: the module card two bands up owns
those. Where there is no denominator to state a percentage from, it says so
rather than inventing one (SECP reads *"Not started · 33 statutory years
evidenced · 0 filings recorded"*).

**Needs attention** and **Upcoming deadlines** now share no rows. The first is
what has already gone wrong or is blocked; the second is what is dated ahead of
us. The earlier version listed the three "expires within 90 days" items in both.

**Recent activity is the append-only audit trail and nothing else** — every row
is a named person doing something in LegalOS at a recorded time, served by
`GET /api/compliance/activity`. Document dates from Drive are deliberately not
mixed in: a document dated 12 March is not somebody acting on 12 March, and the
whole model rests on keeping those apart. Nobody has acted yet, so the panel says
so in words instead of being filled with dates nobody produced.

Nothing on the page is a card inside a card — a band is a heading and one
surface — and the dimensions are asserted in a browser rather than eyeballed
(`tools/compliance-overview-shots.js`, 43 checks at 1440 / 900 / 390px).

Counts come from the same API the registers use, so a dashboard figure and a
register count cannot disagree — asserted in the suite, not asserted about.

**Every level of the hierarchy is an address.** Clicking a register row used to
land you back on the Compliance dashboard — see defect 11 below. The module now
has one path grammar, parsed in one place (`src/compliancenav.js`), which the
router *and* the breadcrumb both read:

```
/compliance                                 the Overview dashboard
/compliance/<module>                        the register
/compliance/<module>/<recordId>             one record
/compliance/<module>/<recordId>?tab=…       one tab of that record
/compliance/resolutions/entity/<key>        one entity's resolutions
/compliance/sec-filings/entity/<key>        one entity's filing history
/compliance/sec-filings/year/<id>           one statutory year
/compliance/document/<fileId>               one document, full view
```

The singular spellings the registers used to emit (`/compliance/loan/<id>`) still
resolve, and then rewrite themselves to the canonical address, so no existing
link breaks and no one copies a bad one out of the address bar.

**An address this module does not define renders a not-found**, naming the
address it was given — it never quietly renders the dashboard. That silent
fallback is what let a broken record link look like a working one for an entire
build.

**Records that had no page now have one.** A resolution imported from the tracker
was previously a dead row: clicking it did nothing, and only LegalOS-drafted ones
opened, into a slide-over no URL could reach. Both kinds now have a record page,
and it never pretends they are the same thing — a source row has a date, a
subject and its documents, so it shows those and says the lifecycle was never
recorded, rather than rendering an empty signature panel that implies nobody
signed. SECP gained three pages for levels that previously existed only as table
rows: a recorded filing, an entity's filing history, and one statutory year.

**Back returns to the register you left, wearing its filters.** Opening a record
carries the register's own query in `from=`, so Back restores the same filtered,
searched, sorted register. It rides in the URL because that is the only version
that survives a refresh, a pasted link and the browser's own Back button.

**A document is a record too.** `/compliance/document/<fileId>` renders the file
in LegalOS — PDF and Google files in a frame, images inline, `.docx` through
mammoth, `.xlsx` through SheetJS — using the same renderers the contract
workspace uses rather than a second copy that drifts. Object-level authorization
is the same `mayReadFile` predicate as every other Drive surface: knowing a file
id is not permission to read it, and an unauthorised file is reported exactly
like a missing one. Where no renderable bytes exist the page says so and offers
the original; it never draws a placeholder that looks like a document.

**Redundant navigation removed.** The sidebar used to open `/g/compliance`, a hub
of tiles pointing at the same six registers: sidebar → hub → cards → register.
The rail now opens `/compliance` directly and the hub redirects there.

**No legacy address breaks:**

| Old address | Lands on |
|---|---|
| `/licenses` | `/compliance/licenses` |
| `/m/agreements` | `/compliance` (now three registers) |
| `/m/resolutions` | `/compliance/resolutions` |
| `/m/licenses` | `/compliance/licenses` |
| `/m/filings` (incl. deep links) | `/compliance/sec-filings` |
| `/g/compliance` | `/compliance` |
| `/compliance?view=<key>` (the old tabbed form) | that module's page |

## 3. WHAT WAS BUILT, BY AREA

### LOANS

| | |
|---|---|
| **Implemented** | Register (69 agreements), record detail, Overview/Documents/Timeline, original vs current effective terms, amendment, rollover/extension, conversion to equity, repayment-date change, interest change, principal change, novation, termination, partial + full repayment, SBP status, document generation, legal review, finalize, signature, execution, Drive filing, audit |
| **Data source** | 3 trackers + 40 Drive loan folders; 464 documents classified into events, 449 attached |
| **Workflow** | `DRAFT → LEGAL_REVIEW → FINALIZED → SIGNATURE → EXECUTED`, server-guarded; no stage skippable |
| **Documents** | Real `.docx` generated server-side carrying parties, original terms, revised terms, an explicit before/after, and a citation of the approved template |
| **Drive** | Filing state tracked (`NOT_FILED / PENDING_UPLOAD / FILED / UPLOAD_FAILED`) with folder path, file id, actor and timestamp |
| **Permissions** | `compliance.create` (edit) · `compliance.finalize`, `compliance.execute`, `compliance.repayment.record` (full) |
| **Tests** | 128-check suite; full lifecycle + repayment validation + saved views + persistence |
| **External dependency** | none |

An amendment never edits the loan. It creates a child record; the loan's original terms stay exactly as
the source recorded them, and current effective terms are computed from the chain. Outstanding balance
is **derived** from the repayment history, never stored — so it cannot drift from what produced it.

### LEASES / SERVICE AGREEMENTS

Bifurcated into two independent registers with their own fields. A lease filters by landlord, city,
region and rent; a service agreement by provider, scope and department. Neither has a principal, a
lender or an SBP position. Amendment / renewal / extension / novation / termination all create child
actions on the shared lifecycle. 207 lease and service documents that live in Drive outside the spend
tracker are attached where the counterparty matches and reported as unattached otherwise.

### RESOLUTIONS

Entity-first, following the folder structure that already exists. `By entity` shows each company with
its count, pending, executed and latest; picking one hands over to the full register filtered to it.
"Create new resolution" makes a **resolution**, not a legal request. Configured subjects (criminal
complaint, written statement, appeal, evidence…) and authorities (SECP, LESCO, EPA, TEPA, WASA, CBD,
NSIT…) are data in `config/compliance-rules.json` — addable without a code change.

### LICENCES

Apply for Renewal auto-populates from the existing licence (authority, number, expiry). Apply for New
Licence captures entity, type, authority, purpose, jurisdiction. Missing requirements are surfaced from
what the application form itself asks for — LegalOS does not assert an authority's requirements,
because no portal integration exists to read them. Renewal history is preserved; a renewal adds to the
chain.

### SAVED VIEWS, FILTERS AND DRILL-DOWN

Every register uses the existing shared register shell: search, contextual filters, More filters,
active chips, Clear all, sort, saved views, result count, URL state and export. No legacy FilterBar.
Filters are module-aware — a loan filters by SBP registration and repayment date, a service agreement
by provider and scope, a SECP filing by financial year and form.

Saved views work on all six registers with exactly the examples the brief asked for — *SBP Pending*,
*Repayment Due 30 Days*, *International Loans*, *Pending Signature*, *Expiring 90 Days*,
*Renewal Pending*, *FY 2026 Outstanding*, *Overdue*. They remain permission-safe: a view carries filter
criteria and no authority, is invisible to other users, and applying one cannot return a row the
register would otherwise refuse.

Overview is a summary, not a stack: one card per module plus a "needs attention" list. Each module's
own KPI strip lives in that module's tab. Every figure drills into the register it counts using the
same predicate it was computed from, so a dashboard number and a register count cannot disagree.

### NOTIFICATIONS

Compliance deadlines feed the existing notification panel (`src/compliancealerts.js`): loan repayment
approaching and overdue, SBP registration pending, lease and service expiry, licence expiry and
authority queries, resolutions awaiting signature or unfiled, SECP filings due and overdue. Every alert
is generated from a real date or status on a real record — **35** are currently raised from live data,
and none for SECP, because that register is genuinely empty. Nothing due raises nothing.

### SECP

**The module is populated from Drive, not empty.** The earlier pass searched for
a tracker and concluded "no source". Re-checked against the folder hierarchy:
there is still **no filing register** — 0 FY folders, 0 AGM folders, 0 SECP
folders across all 856 folders, verified rather than assumed — but 54 documents
evidence real statutory events, and **33 compliance years across 13 entities
(FY 2020–FY 2026)** are now built from them, each naming the document that proves
it.

The line that matters: a document is not a filing. A Form A in Drive does not
prove Form A was filed; an AGM minute proves a *meeting*, not an annual return.
Every derived year carries `filingStatus: "Not recorded"` until a person records
the filing, and no filing date is ever inferred from a file's modified timestamp.

Entity + Financial Year as first-class. Annual and Event-based filings are separate registers that
share one chronological entity history. FY is selected, never inferred from a filing date. The form
catalogue (A, 9, 19, 3, 7, 29, Other) is configuration. Overdue filings **must** carry a reason, chosen
from the configured list — LegalOS will not pick one. "Open eZfile" links to the real SECP eServices
portal. **The request workflow is gone**: filings never touch the intake queue.

**The AGM rule.** Entity legal form is derived from every spelling of a company across the source *and*
the Drive folder names:

| Form | Entities | AGM |
|---|---:|---|
| Private Limited | 17 | required |
| Single Member Company | 26 | **not required** |
| Foreign / offshore | 8 | out of scope |
| Registered partnership | 1 | out of scope |
| Not stated in source | 10 | withheld |
| **Conflicting source** | **2** | **withheld** |

An SMC never shows an overdue AGM. Where two sources disagree about a company's form — `Zameen Axis` is
`(SMC-Pvt)Ltd` in the resolutions folders and `(Private) Limited` in the loan tracker — the requirement
is **withheld**, not guessed, because guessing would either invent or suppress a statutory obligation.

---

## 4. HONEST INTEGRATION STATES

Three integrations are genuinely unavailable. In each case the **entire internal workflow is built**;
only the external hop is absent.

| Integration | State | Why | What still works |
|---|---|---|---|
| **E-signature** | `NOT CONFIGURED` | No provider configured | Signature method selection, signatories, per-signatory status, partial/full tracking, wet-signature branch end to end. Selecting e-sign returns **501** and sends nothing. |
| **Drive upload** | `NOT CONFIGURED` | The service account holds `drive.readonly` **by design**, so no bug in this app can alter or delete Drive data | Executed documents stored in LegalOS; target folder computed; filing state tracked with actor and timestamp as an auditable human step |
| **Authority portals** | `NOT CONFIGURED` | No credential vault exists, so LegalOS holds **no** portal credentials and performs no automated access | Full application workflow, requirement checks, manual status updates, external portal link |

No control anywhere says Connected, Submitted, Running or Tracking unless it is.

---

## 5. SECURITY

- Every route is gated on the caller's effective **compliance** level, computed server-side from the
  verified session. A litigation or commercial account receives **403** on all seven endpoints.
- 18 granular capabilities (`compliance.create`, `.finalize`, `.execute`, `.repayment.record`,
  `.drive.file`, …), default-deny; an unknown capability is refused.
- Seeing Compliance does not grant acting on it: `view` reads, `edit` creates and reviews, `full`
  finalizes, executes, records repayments and files to Drive. Verified by direct API call, not by
  hidden buttons.
- **Segregation of duties**: the person who drafted a document cannot finalize it. Enforced on the
  server by verified email; configurable for a team too small to separate the roles.
- Generated documents inherit record scope — a cross-module read returns 403.
- The template picker uses the same `mayReadFile` predicate as every other Drive surface, so it cannot
  list a file the caller could not open.
- Audit is append-only. No route edits or deletes an entry.
- Uploads: 25 MB cap, allowlisted types (PDF/Word/image), SHA-256 recorded. A `.exe` is refused.
- Actor identity is taken from the verified session, never from the request body.

**One note, no value exposed:** an SMTP credential is present in `config/legalos.config.json`. That is
the correct location — it is not in code and `config/` is git-ignored, so it is not in version control.
Rotation is advisable as routine hygiene.

---

## 6. TESTS

| Suite | Result |
|---|---|
| `m1-compliance-e2e` — dashboard IA, routes, register → record → documents → timeline | **78/78** |
| `m1-compliance-drilldown` — every level reached by **clicking**, both themes | **44/44** |
| `m1-compliance` — API, workflow, permissions, persistence, activity trail, drill-down endpoints | **151/151** |
| `m1-document-auth` — 3,476 documents × 4 personas | **34/34** |
| `m1-filter-security` — filter options, facets, export, 5 personas × 9 registers | **18/18** |
| `m1-saved-views` | **32/32** |
| `m1-security` | **56/56** |
| `m1-rbac-matrix` | **51/51** |
| `m1-register-filters` | **28/28** |
| `m1-identity` | **25/25** |
| `m1-accessibility` | **12/12** — 6,276 interactive elements across 30 routes, **0 mouse-only, 0 unnamed** |
| `m1-screenreader` | **17/17** |
| `m1-ui-sweep` | **19/19** |
| `m1-contrast` — WCAG AA across 29 routes | **4/4** — 201 text styles measured, 0 below threshold |
| `tools/compliance-overview-shots.js` — Overview layout at 1440 / 900 / 390px | **43/43** |
| `tools/compliance-drill-shots.js` — every new page, light + dark + 390px | no page errors |
| `tools/compliance-reconcile.js` | **UNRESOLVED = 0** across 2,185 compliance files |

All seven new compliance routes scan clean for keyboard access:

```
/compliance                      66 controls · 0 mouse-only · 0 unnamed
/compliance/loans               398 controls · 0 mouse-only · 0 unnamed
/compliance/leases              502 controls · 0 mouse-only · 0 unnamed
/compliance/services            372 controls · 0 mouse-only · 0 unnamed
/compliance/resolutions         418 controls · 0 mouse-only · 0 unnamed
/compliance/licenses             75 controls · 0 mouse-only · 0 unnamed
/compliance/sec-filings          50 controls · 0 mouse-only · 0 unnamed
```

Every compliance register carries the full shell contract — search, contextual
filters, result count and columns:

```
Compliance · Loans               12 filter controls · 10 columns
Compliance · Lease Agreements    13 filter controls · 10 columns
Compliance · Service Agreements  12 filter controls · 10 columns
Compliance · Resolutions         15 filter controls · 11 columns
Compliance · Licences            10 filter controls · 10 columns
```

Both compliance suites run against an isolated sandbox with the dev bypass off,
so a real session cookie is the identity. Fixtures die with the sandbox.

### The acceptance table

|                     | SOURCE | REGISTER | DETAIL | DOCS | TIMELINE |
|---|---:|---:|---|---:|---|
| Loans               | 192 rows → 60 + 9 Drive-only | **69** | opens, correct record | 16/16 on first record | PASS (21 events) |
| Leases              | 172 spend rows → 91 | **91** | opens, correct record | 30/30 | PASS |
| Service Agreements  | 172 spend rows → 68 | **68** | opens, correct record | 4/4 | PASS |
| Resolutions         | 914 | **914** (+39 entity view) | entity → its resolutions | 827 across entities | PASS |
| Licences            | 7 workbook + 1 Drive-only | **8** | opens, correct record | 2/2 | PASS |
| SECP Filings        | 54 evidence docs | **33 years** · 0 filings | entity × FY history | evidence attached | PASS |

Register totals equal API totals equal hub tile counts — asserted, not asserted-about.
Document counts match between register and detail on every module tested.

**Eleven defects found and fixed during the build**, eight of them mine — plus three in the suites themselves:

1. **Date parsing missed 391 of 464 documents.** `\b` never matches between `_`
   and a digit, so the group's own `_YYYYMMDD` convention failed and the
   documents were wrongly reported `INCOMPLETE_SOURCE`.
2. **React hooks violation** in the compliance router — an early return before
   later hooks, the error #310 pattern.
3. **One Drive folder attached to two loans**, duplicating 15 documents onto both
   records. A folder is now awarded to a single best claimant, or to neither on a
   tie.
4. **Saved views would have silently lost every filter** — the server allowlist
   still named the old field keys and had no entry for leases, services or SECP.
5. **The hub still served the old model** — four tiles opening empty legacy
   pages and a fifth duplicating the licence register.
6. **The breadcrumb rendered the family twice** on the Compliance Overview
   ("Compliance & Licences > Compliance & Licences"), because that page is its
   own family landing. The crumb and the Back control now suppress it.
7. **The legacy `?view=` redirect silently did nothing.** It parsed the query off
   the `path` prop, but `currentPath()` strips the query string — so every old
   tabbed link sat on the Overview instead of opening its module. It reads
   `useQuery()` now.

8. **`/active/i` matched "Inactive".** The substring is right there, so the naive
   test counted every inactive record as active. The Overview reported **87 of 91
   leases active** when the true figure is **44**, and **63 of 68 service
   agreements** when it is **14** — beside an expired count of 68 and 48 in the
   same block, which is what exposed it. The same line had been copied to seven
   places, including one **outside Compliance**: Insight & Governance reported
   **187 active contracts** out of 1,371 where the true figure is **83** (the
   register holds 82 `Active`, 104 `Inactive`/`Inactive/Ceased`, 5 `Terminated`
   and 1 `Active/In renewel Process`). They now share one predicate,
   `isActiveStatus()` in `src/compliancemodules.js`, which checks the negative
   first and is verified against every spelling the trackers actually use —
   `Active`, `Inactive`, `Inactive/Ceased`, `Terminated`, `N/I`, `Novated to
   Medallion`, `Active/In renewel Process`, blank. **No source data changed**:
   the records, their statuses and their dates are exactly as they were, and only
   the count that described them was wrong.

9. **The new activity endpoint ignored its own `limit`.** `query` is a
   `URLSearchParams` here, as it is on every other route in the file, so
   `query.limit` was `undefined` and silently fell through to the default of 8:
   `?limit=50` returned 8 entries out of 29, and `?limit=2` also returned 8. It
   reads `query.get("limit")` now. Worth naming because it was caught by a check
   written in the same sitting as the code — the endpoint *looked* right and
   returned a 200 with plausible data every time.

10. **Every register row navigated to an address the router could not resolve.**
    The registers sent a row click to the SINGULAR segment —
    `/compliance/loan/LON-0RRG5T4` — while the router only knew the plural module
    keys. `complianceModule("loan")` returned `null`, so the router fell through
    to its last branch and rendered the **Overview**. The address bar showed the
    record, the breadcrumb showed `> loan`, and the page showed the dashboard.
    Nothing threw. Every one of the six modules was affected, which is why the
    module felt broken rather than buggy. The router and the breadcrumb now read
    one shared parser, so they cannot disagree again.

11. **Local state shadowed the navigation helper.** In two files a slide-over's
    `const [openRecord, setOpenRecord] = useState(null)` shadowed the imported
    `openRecord()`, so calling it called `null`. It surfaced as
    `openRecord is not a function` in the browser console — caught by the new
    suite's page-error assertion, not by any check about navigation, which is
    the argument for asserting "no page errors" at all.

Two further problems were mine, in the TEST suites rather than the product, and
are worth naming because both would have produced a misleading green:

12. **A bulk find-and-replace across the suites corrupted one file.** Rewriting
   the compliance routes hit a line an earlier edit had already changed, turning
   a register entry into a syntax error. `m1-register-filters.js` then failed to
   parse — and because the batch grepped only for "checks passed", it reported
   *nothing at all* rather than a failure. Every suite is now syntax-checked
   before it is trusted, and the Properties entry (which moved to `/projects`)
   was replaced with the two registers that genuinely use the register shell.
13. **The end-to-end suite navigated by URL where a user clicks.** It reached
    every record page with `go(path + "/" + id)`, so it proved the ROUTE worked
    and never touched the control that leads there. Defect 10 lived behind that
    gap for a whole build with the suite green. `m1-compliance-drilldown` now
    starts every assertion from a click on something a person can see, and the
    deep-link checks are separate assertions rather than a substitute for them.

14. **Two suites asserted a tablist on `/compliance`.** That was correct until
   this change and is now wrong by design: Compliance is a dashboard plus six
   separate pages and deliberately has no tab strip. Both checks
   (`m1-accessibility`, `m1-screenreader`) moved to Litigation, which still
   carries register tabs — the pattern they were really testing. `m1-screenreader`
   also gained the inverse assertion, that Compliance exposes **no** tablist, so
   a strip reappearing on the dashboard fails rather than passes.

## 7. DATA PRESERVATION

Nothing was rewritten. After the entire build and test run:

```
loans 192 · licences 7 · resolutions 914   (source registers, unchanged)
```

Stable IDs, Drive mappings, source rows, documents, dates, status and lineage are all intact. The
domain model is **derived on top of** the ingest, not in place of it. Every source row remains
reachable: an event row through its parent loan's timeline, a header artifact through data health.
No spreadsheet was edited, no Drive folder moved, renamed or deleted — LegalOS cannot write to Drive.

---

## 8. KNOWN LIMITATIONS

Stated plainly rather than buried:

0. **Every compliance Drive file has a disposition — `UNRESOLVED` is 0** across
   all 2,185 files (1,396 record documents, 394 templates, 206 loan action
   documents, 177 entity documents, 7 Word artifacts, 5 source trackers). See
   COMPLIANCE_DATA_RECONCILIATION.md.
1. **32 loan history rows are unattached** (9 ambiguous LRN, 23 placeholder reference). Attaching them
   would require a human to resolve the source, not a better heuristic.
2. **13 resolutions carry a conflicting entity** — flagged `CONFLICTING_SOURCE`, needs a filing fix in
   Drive.
3. **2 entities have a disputed legal form**, so their statutory requirements are withheld.
4. **94 attached loan documents have no date** in the filename and sort last in the timeline.
5. **1 Drive loan folder is contested** between two Zameen Arcs loans and is attached to neither until
   a human resolves which it belongs to.
6. **177 documents belong to an entity folder but to no single record** — reachable
   through their entity (`/api/compliance/resolutions/entity/<key>/documents`),
   classified `ENTITY_DOCUMENT`, not stranded. Previously to a tracker row — reported, not hidden.
7. **SECP starts empty.** There is no filing register to import. It fills as Legal records filings.
8. **No loan-amendment or resolution template exists** in the approved library; generation cites the
   nearest approved template rather than inventing clause language.
9. **Outstanding loan balance has no source value.** It is derived from repayments recorded in LegalOS,
   so it reads as the full principal until repayments are entered.

---

## 9. EXTERNAL ACTIONS REQUIRED

Nothing in this implementation is blocked. The following are outside the application:

1. **E-signature provider** — supply credentials to activate the already-built connector boundary.
2. **Drive write credential** — a write-scoped service account would turn the tracked filing step into
   an automated upload. Deliberately not requested: read-only is a safety property.
3. **Credential vault** — required before any authority-portal automation.
4. **Resolve 13 mis-filed resolutions and 2 disputed entity names** in the source data.
