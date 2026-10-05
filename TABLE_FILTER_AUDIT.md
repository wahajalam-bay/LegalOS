# Table & register filter audit

Every tabular view in LegalOS, what it can be filtered by, and — where a filter
someone might expect is missing — why. The rule throughout: **a filter exists
only if the source carries the field.** An empty dropdown is worse than no
dropdown, because it implies the data is there and simply unpopulated.

Generated for build `src-v217`. Record counts are the live Drive figures
(3,134 records across seven register families).

---

## The shared system

Eleven registers are rendered by one shell (`src/register.js`) over one filter
engine (`src/filters.js`), configured per family in `src/registerdefs.js`.

| Primitive | Where | What it does |
|---|---|---|
| `RegisterShell` | `src/register.js` | search · filters · chips · count · table · views · columns · export |
| `RegisterTabs` | `src/register.js` | workspace-level register switching, URL-backed, arrow-key navigable |
| `useRegisterFilters` | `src/filters.js` | the engine: options, matching, sorting, URL state |
| `FilterSelect` | `src/filters.js` | multi-select dropdown, searchable past 8 options |
| `ActiveChips` | `src/filters.js` | one removable chip per applied value |
| `useFilterLink` | `src/filters.js` | lets a KPI or chart set the register's filters |
| `DrillCell` | `src/registerdefs.js` | a badge in a row that filters the register |

**Semantics.** Different filters AND together; values inside one filter OR
together; search ANDs with all of them and never resets them.

**Field types.** `multi` (distinct values, with counts) · `bucket` (a named rule,
e.g. licence expiry) · `date` / `datePast` (presets) · `money` · `count` ·
`multiValue` (a record legitimately holding several values).

**Permission safety.** Options are derived from the rows the component was
given, and those rows are already scoped by the server's permission engine. A
user who cannot read litigation is not offered litigation counsel, entities or
case types — the filter list cannot describe records the table cannot show.

**Export safety.** Export follows what is on screen. When filters are active the
Export control offers "these N" and "all N you can access" as two labelled
choices; neither can reach past the authorized row set. Cells beginning `=`,
`+`, `-`, `@` or a control character are quoted (SEC-003).

---

## Workspace restructuring

Two pages stacked several complete record families in one scroll. Both are now
register tabs — one register visible at a time.

**Litigation & Disputes** — was 357 cases followed by 255 notices.

`[ Cases 357 ] [ Legal Notices 255 ]`

**Compliance & Licences** — was licences, then 192 loans, then 914 resolutions,
each truncated ("… and 132 more").

`[ Overview ] [ Licences & Permits 7 ] [ Loan Agreements 192 ] [ Board Resolutions 914 ] [ Project Properties 38 ]`

Overview summarises and links into the registers; it holds no operational list.
Contracts also stacked a Project Properties register underneath the contract
book — removed, since properties have a register of their own in Compliance and
a page at `/projects`.

Nothing is truncated any more: the resolutions register renders all 914 and the
Data Health issue list all 846 (it previously stopped at 400).

---

## Register by register

### Litigation · Cases — `/litigation` · 357
Columns: ID · Case · Stage · Risk · Exposure · Counsel · Entity · Docs · Status · Next hearing · Filed

| | |
|---|---|
| **Search** | case name, entity, court, case no, counsel, nature, position |
| **Primary filters** | Stage · Status · Risk · Case type · Counsel · Next hearing |
| **More filters** | Entity · Court/forum · Position · Exposure · Documents · Filed · Source quality |
| **Quick views** | Open cases · High risk · Hearings next 7 days · Overdue hearings · No documents · Closed cases |
| **Sortable** | every column; Exposure and Docs numerically, Next hearing and Filed as dates |
| **Drill-down in** | KPI Open cases / Closed / Exposure / Next hearing · donut *Cases by Stage* · bars *Cases by Type* |
| **Drill-down cells** | Stage, Risk, Counsel, Entity, Status badges filter in place |

*Not offered:* jurisdiction as a separate filter (the tracker's court column is
the jurisdiction), and "case owner" — litigation records carry outside counsel,
not an internal owner.

### Litigation · Legal Notices — `/litigation?view=notices` · 255
Columns: ID · Notice / subject · Type · Sender · Recipient · Issued · Received · Replied · Docs · Status

| | |
|---|---|
| **Search** | sender, recipient, details, category, status, comments |
| **Primary filters** | Status · Notice type · Sender · Reply |
| **More filters** | Recipient · Notice date · Date received · Documents · Source quality |
| **Quick views** | Not resolved · Resolved · No reply recorded · Issued this month · No documents |
| **Summary strip** | 255 total · 235 not recorded as resolved · 20 resolved · 226 no reply recorded |

*Not offered, and why:* **Entity**, **Owner**, **Jurisdiction** and **Response
due** do not exist in the notices tracker. Its columns are date of notice, date
of receipt, sender, recipient, category, details, status, date of reply and
comments. "Date of reply" records when a reply went **out**, not when one is
**owed**, so it is surfaced as *Replied / No reply recorded* rather than dressed
up as an SLA. No "Next hearing" filter appears here — that is a case concept.

### Contracts — `/contracts` · 1,371
Columns: Sr · ID · Contract · Entity · Category · Docs · Value · Risk · Status · Expiry

| | |
|---|---|
| **Search** | title, counterparty, id, contract type, entity, physical record ref |
| **Primary filters** | Status · Category · Contract type · Risk · Expiry |
| **More filters** | Entity · Counterparty · Owner · Department · City · Value · Execution date · Documents · Source quality |
| **Quick views** | Active · Expiring ≤30 days · Expired · High/critical risk · PKR 100M+ · No linked documents |
| **Also** | "Search inside the documents" runs a Drive full-text match and narrows the register to contracts whose scanned copies contain the phrase |

A gray Docs badge means the tracker *names* documents that are not in the Drive
library yet — a real gap in the record, deliberately distinct from zero.

### Compliance · Licences & Permits — `/compliance?view=licences` · 7
Columns: Reference · Entity · Regulator · Issued · Expiry · Owner · Docs · Status

Primary: Status · Entity · Regulator · Expiry. More: Owner · Issued · Documents · Source quality.
Quick views: Expired · Expiring ≤90 days · Valid beyond 90 days · No documents.

Expiry buckets — Expired · ≤30d · ≤60d · ≤90d · beyond 90d · no expiry recorded —
partition the register exactly. The Overview donut and the "needs attention"
rows compute their figures with **the same predicate the filter uses**
(`licenceExpiryMatch`), so a segment and the register it opens cannot disagree.

*Renewal status* is not a separate filter: the tracker records renewal state
inside the status column ("Renewal Application Submitted"), so it appears as a
Status value rather than an invented second field.

### Compliance · Loan Agreements — `/compliance?view=loans` · 192
Columns: Reference · Agreement · Lender/counterparty · Value · Term · Start · Repayment · Docs · Status

Primary: Status · Borrower · Lender · Value · Repayment. More: Term · Agreement date · Documents · Source quality.
Quick views: Repayment ≤30 days · Repayment passed · PKR 100M+ · No documents.

### Compliance · Board Resolutions — `/compliance?view=resolutions` · 914
Two views of one dataset: **By entity** (39 entities, count and latest date) and
**All resolutions**. Choosing an entity hands over to the full register with that
entity filtered, so the summary and the register are never disconnected pages.

Columns: Reference · Resolution · Entity · Date · Docs. Filters: Entity · Date · Documents · Source quality.

*Resolution type* and *meeting/board* are not filters — the source carries date,
agenda and document number only.

### Compliance · Project Properties — `/compliance?view=properties` · 38
Columns: ID · Property/project · Entity · Location · Ownership · Value · Docs · Status.
Primary: Entity · City · Ownership · Status. More: Value · JV partner · Contractor · Start date · Documents.

### Matters — `/matters`
Columns: ID · Matter · Practice · Dept · Counterparty · Owner · Status · Risk · Target · Age · Value/Exposure

Primary: Queue · Practice · Status · Owner · Risk. More: Matter type · Department · Counterparty · Age · Target date · Value · Last updated.

The six queue chips (Needs action, Overdue, Due soon, Awaiting external, On
hold, Recently completed) became a **Queue** filter with live counts, replacing
a parallel chip row that had its own state and no counts. Seven single-select
dropdowns became multi-select filters with chips.

**Behaviour change, deliberate:** archived matters are no longer hidden by
default. The old view dropped them silently unless a status filter was set, so
the register's own total was not the truth. They are now included and Status
exposes "Archived" with its count.

### Users & Access — `/access`
Columns: User · Email · Team · Access role · Modules · Status · Last change.
Primary: Status · Access role · Legal team · Module access · Access level. More: Job title · Department · Last change.
Quick views: Deactivated · Administrators · No module access.

*Last login* is not a filter: the roster the permission engine returns has no
last-login field. Adding one would mean adding session tracking, which is a
different piece of work from filtering.

### Data Health · Issues — `/datahealth?tab=problems` · 846
Columns: Record · Register · Issue · Detail · Source.
Primary: Register · Issue · Missing field. More: Source workbook · Source sheet.
Previously capped at 400 rows with a search box; now the whole set, filterable.

### Legal Requests — `/requests?rv=list`
Columns: Request Date · ID · Filed Matter · Request · Requestee · Category · Company/Entity · Contract Value · Due Date · TAT Analysis · TAT Status.
Primary: Status · Request type · SLA · Priority · Department · Required by.
More: Assigned to · Requester · Entity · Category · Risk · Stage · Contract value · Submitted.
Quick views: Awaiting triage · SLA breached · Due today · Past required-by date · Required this week.

SLA is the computed TAT status (On Track / Due Today / Delayed), derived rather
than stored. The Board view keeps its own search and category chips; the List
view is a full register.

---

## Overdue, corrected

The register showed "527d overdue" against cases closed years ago. A past date
on a finished matter is history, not a missed deadline.

`dueState()` in `src/filters.js` now returns one of **none · upcoming · overdue ·
past**, where a past date on a record the source marks closed, resolved,
completed, withdrawn, disposed, decided, dismissed, settled, concluded,
finalised, expired, terminated or cancelled is `past` — rendered as a plain date
with no urgency styling. Only a record still requiring action can be `overdue`.

The same function backs both the Next-hearing filter and the cell, so the badge
and the filter cannot disagree. Licence and contract **expiry** deliberately do
**not** use this rule: a licence that lapsed is lapsed regardless of what the
status column says, so those use their own calendar predicate.

---

## Tables deliberately left as they are

Not every table is an operational register. These are summaries, configuration
surfaces or short fixed lists where a filter bar would be noise:

| View | Table | Why no filter bar |
|---|---|---|
| `/datahealth` overview | Register summary (7 rows) | one row per register family; it *is* the summary |
| `/datahealth?tab=rows` | Row disposition (7 buckets) | a fixed accounting of every source row |
| `/compliance` Overview | — | summary only, links into the registers |
| `/access` Access Matrix | user × module grid | a matrix, not a list; the Users tab filters the same data |
| `/settings` | configuration tables | settings, not records |
| `/organization`, `/team` | org structure | small fixed hierarchies |
| `/portal`, `/raise`, `/myrequests` | requester surfaces | a requester sees only their own requests |
| `/costs`, `/reports` | analytics | aggregations with their own period controls |
| `/repository`, `/tracker`, `/pipelines`, `/analyzer`, `/licenses`, `/workspace` | — | already carry the older `FilterBar` (entities / types / risk / date) and were not rebuilt in this pass |

The last row is the honest remainder: **six** views still use the previous
`FilterBar` component rather than the new shell — `src/pages/analyzer.js`,
`licenses.js`, `pipelines.js`, `repository.js`, `tracker.js` and `workspace.js`.
They are filterable today, but without URL-backed state, chips or multi-select.
That is the next increment, not a claim of completion.

Eleven register instances are on the new shell, across seven files: Litigation
(Cases, Legal Notices), Compliance (Licences, Loans, Resolutions, Properties),
Contracts, Matters, Users & Access, Data Health Issues and Legal Requests.

---

## Asked for and NOT built

Stated plainly rather than left to be discovered.

**User-saved filter views.** Each register ships *predefined* quick views (named
filter states, never separate datasets — "Open cases", "Expiring ≤ 90 days",
"SLA breached"). A user cannot yet save their own combination under their own
name. That needs a per-user preference store on the server; faking it in
`localStorage` would be persistence that silently disappears on another device,
which is worse than not offering it. **Column visibility** *is* remembered, in
`localStorage`, because it is a genuine per-viewer convenience and its loss is
harmless.

**Custom date ranges.** Date filters offer presets (Today, Tomorrow, Next 7/30/90
days, Overdue, No date; and Last 7 days / This month / This quarter / This year
for historical fields). A free "from–to" picker is not implemented.

**Numeric min/max entry.** Money and document-count filters use buckets
(`< PKR 1M`, `PKR 1M–10M`, `PKR 10M–100M`, `PKR 100M+`, `Not quantified`;
`1+ / 5+ / 10+ / 25+`). There is no free min/max pair.

**Bulk actions.** None of these registers has row selection or bulk operations,
so the filter/selection/pagination interaction the brief asks about does not
arise. If bulk actions are added, selection must be cleared or clearly flagged
when a filter removes selected rows.

**Six views still on the older `FilterBar`.** Listed above. They filter today but
without URL state, chips or multi-select.
