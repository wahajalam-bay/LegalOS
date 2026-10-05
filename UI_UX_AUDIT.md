# LegalOS — UI/UX audit

Inventory generated from the CURRENT codebase (`tools/interaction-sweep.mjs` walks every
route in a real browser; `interaction-inventory.json` holds the raw data). Build **v196**.

---

## 1. Inventory

```
Routes in the router            57   (50 operational + login/portal + 4 invalid-route cases)
Modules                         12   Overview · Requester Portal · Legal Requests · Contracts ·
                                     Commercial & Risk · Litigation · Compliance · Users & Access ·
                                     Data Health · Shared/Knowledge · Insight · Administration
Pages (src/pages)               44
Shared components (src)         38   layout · ui · parts · charts · shared · legaldocuments ·
                                     recordworkspace · spine · icons …
Page-level controls           1,387  inventoried across 50 routes
Unique controls exercised       706  0 errors, 0 dead controls
```

Per-route detail (layout, title, breadcrumb, actions, tabs, tables, filters, charts, forms,
modals, empty/loading/error states and responsive behaviour) is in
`INTERACTION_COVERAGE.md` and `UI_REGRESSION_MATRIX.md`.

## 2. One design system

The application already ships a single token layer (`assets/styles.css`) and a shared
component set (`ui.js`, `parts.js`, `charts.js`). This sweep did **not** restyle screens
individually; it fixed the places where a page escaped the system:

| Area | What was wrong | Fix |
|---|---|---|
| Money | `fmt.money` defaulted to **USD**, so PKR rendered as `$947.0M` | default is PKR; genuine foreign values pass a currency |
| Charts | The donut's centre overlay swallowed every click | `pointer-events: none` — repaired every donut |
| Grids | Pages set `grid-template-columns` inline, beating the `.grid--N` breakpoints | `.page .grid` collapses to one column below 820px |
| Tabs | `.tabs` had no `overflow-x`, so tabs past the edge were unreachable | horizontal scroll, scrollbar hidden |
| Topbar | The user menu sat 78px off-screen at 390px | labels drop below 640px; search hides below 420px |
| Toggle | `disabled` was ignored | honoured, with a visibly inert style |
| Focus | No application-wide focus indicator | one `:focus-visible` rule for every interactive surface |

## 3. Page shell

Operational pages follow: breadcrumb → title → status/metadata → primary actions → filters
/ tabs → content. The record detail shell (`recordworkspace.js`) is shared by litigation,
licence, loan, resolution, property and notice; contracts use `contracts.js` with the same
architecture. Tabs are **Overview · Documents · Timeline** plus module-specific operational
tabs. **There is no Related tab.**

## 4. Documents

One component (`legaldocuments.js`) serves every record type: search, record-aware category
chips, sort, per-document preview / open / Open in Drive / copy link, type and folder
metadata, and a live count. Verified against 0-, 1-, many- and **73-document** records; the
Documents badge equals the linked file count in every case. No cap truncates the list —
the 6/25/40/60 caps were removed earlier in this effort.

## 5. Tables

`DataTable` is the single register table: column alignment, ellipsised long values, honest
`—` for missing data, status and risk chips, sort, search, filters, click-through. Rows are
now **keyboard-operable** (`tabindex`, `role="link"`, Enter/Space) with a focus ring that
sits inside the row's own bounds. Tables keep their own horizontal scroller rather than
collapsing the layout.

## 6. Dashboards and click-through

Every KPI recomputes from the same normalized dataset the register uses, and every tile's
number now matches what clicking it returns (898→898, 249→249, 6→6, 0→0, 1371→1371). The
"Total contracts" tile clears persisted filters, which is what made it read 1,371 and show
6. Chart segments and bars filter the table and show a removable chip.

## 7. Honest states

| State | Rule | Example |
|---|---|---|
| Empty | say why | "No documents are currently linked to this record." |
| No source | say so | "No version history" · Automation "not configured" |
| Error | distinguish from empty | six injected failures (500/403/404/empty/malformed/empty-set) render without blanking, without `undefined`, without fabricated values |
| Loading | consistent | "Loading from Drive…" / "Reading the pipeline…" |

## 8. Accessibility (practical pass — no WCAG certification claimed)

| Check | Result |
|---|---|
| Icon-only buttons with no accessible name | **0** across 8 routes |
| Inputs with no label / aria-label / placeholder | **0** |
| Images without `alt` | **0** |
| Visible focus indicator | **was missing → added** application-wide `:focus-visible` |
| Keyboard-operable table rows | **was mouse-only → added** `tabindex` + `role` + Enter/Space |
| `prefers-reduced-motion` | animations disabled when the OS asks |

Remaining: 758 decorative/secondary clickable elements (metric cards, feed items, inline
cell drills) are still mouse-first. The primary path — navigation, tabs, KPI tiles, table
rows, forms, modals — is keyboard-reachable. This is stated plainly rather than claimed as
full conformance.

## 9. Colour and status

Status tones come from one map (`Status`, `Pill`, `Risk` in `ui.js`): green = good/active,
amber = attention/expiring, red = danger/expired/critical, blue = informational, grey =
neutral/unknown. Risk levels use the same scale everywhere.

## 10. Currency and dates

PKR throughout, verified **by value** (`money(0)` → `PKR 0`, `money(535200000)` →
`PKR 535.2M`, `money(null)` → `—`), not by scanning for `$`. Dates render through one
formatter; a missing date is `—`, never `Invalid Date`.

---

# Register architecture pass (build v217)

## The problem

Two workspaces rendered several complete record families as one long scroll:

- **Litigation & Disputes** — 357 cases, then 255 legal notices underneath them.
- **Compliance & Licences** — licences, then 192 loans, then 914 board
  resolutions, then project properties, each truncated ("… and 132 more").
- **Contracts** — the contract book, then a project-properties register below it.

Stacking two unrelated record families is not a register. The counts belong to
different things, the second dataset is only reachable by scrolling past the
first, and neither can be filtered or linked to.

Separately, the same product had three different filter experiences: litigation
filtered from chart clicks into four `useState` hooks; contracts used a
`FilterBar` component; compliance had no filters at all; matters had seven
single-select dropdowns with no chips. None of it was linkable — a filtered
register could not be shared, bookmarked, or returned to with the browser's Back
button.

## What changed

**One workspace, register tabs, one register at a time.**

```
Litigation & Disputes    [ Cases 357 ] [ Legal Notices 255 ]
Compliance & Licences    [ Overview ] [ Licences 7 ] [ Loans 192 ] [ Resolutions 914 ] [ Properties 38 ]
```

Compliance's Overview summarises and links into the registers; it holds no
operational list of its own. Contracts' stacked properties register was removed —
properties have a register in Compliance and a page at `/projects`.

Nothing is truncated any more. The resolutions register renders all 914 and the
Data Health issue list all 846, where it previously stopped at 400.

**One filter system.** Eleven registers now render through a single shell
(`src/register.js`) over a single engine (`src/filters.js`), configured per
family in `src/registerdefs.js`. Each gets search, contextual filters, an
advanced drawer, quick views, column control, export, active chips, a result
count and typed sorting. Filters live in the URL, so a filtered register is an
address that survives refresh, Back and sharing.

**Board resolutions get two views of one dataset** — by entity (39 companies,
count and latest date) and the full register — where choosing a company hands
over to the register with that entity filtered, rather than opening a separate
page.

## Reconciliation

A dashboard figure and the register it opens must be the same number. Where a
KPI or chart drills into a register, both are computed from the same predicate
rather than from two definitions that can drift: the licence expiry donut and the
Expiry filter share `licenceExpiryMatch`; the case KPIs set the same filter keys
the toolbar sets.

`tests/m1-register-filters.js` proves this mechanically. For every register and
every primary filter it opens the dropdown, reads the count printed beside the
first option, applies it, and compares against both the result count and the rows
returned — **63 reconciliations, all exact** — plus four KPI drill-downs.

## "527d overdue" on a closed case

The register showed cases closed years ago as hundreds of days overdue. A past
date on a finished matter is history, not a missed deadline.

`dueState()` now distinguishes **upcoming · overdue · past · none**, where a past
date on a record the source marks closed is `past` and renders as a plain date.
The filter and the cell use the same function, so they cannot disagree. Licence
and contract expiry deliberately keep a pure calendar rule — a lapsed licence is
lapsed whatever the status column says.

Verified: of the litigation cases with a past hearing date, none the application
considers closed is reported overdue, and every unresolved one still is.

## Filters and access

Filter options are derived from the rows the component received, and those rows
are already scoped by the server's permission engine. A user who cannot read
litigation is never offered litigation counsel, entities or case types — the
filter list cannot describe records the table cannot show.

Export follows what is on screen: with filters active it offers "these N" and
"all N you can access" as two labelled choices, and neither can reach past the
authorized row set.

## Defects found and fixed during this pass

| | |
|---|---|
| **React error #310 on Legal Notices** | `useMemo` sat behind a loading guard, so the hook count changed the moment data arrived and the register died the first time it was opened on a warm cache. Every hook now runs before any early return; a scanner checks for the pattern. |
| **`.modkpi { cursor: pointer }`** | Every module KPI showed a pointer cursor and lifted on hover, promising a click that no KPI in the app implements. The affordance moved to an explicit `--link` variant. |
| **Nested interactive elements** | Making the Dropdown trigger a button put a `<button>` inside a `<button>` for the notifications bell and the contract actions menu. Both triggers are now plain content with an explicit label. |
| **Archived matters hidden silently** | The matters register dropped archived records unless a status filter was set, so its own total was not the truth. They are included; Status exposes "Archived" with its count. |
