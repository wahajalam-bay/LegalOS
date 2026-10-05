# LegalOS — Frontend Component Inventory

Every reusable UI component in the application, where it lives, and whether it
is the canonical implementation for its job. Read alongside
`FRONTEND-DESIGN-SYSTEM.md` (tokens and values) and
`FRONTEND-STYLE-SOURCE-MAP.md` (where a given pixel comes from).

There is **no external component library**. Everything below is local.

---

## Index

| Component | Source | Variants / props | Used by | Canonical? |
|---|---|---|---|---|
| `Btn` | `src/ui.js:6` | `variant` primary·ghost·soft·accent·danger·gradient; `size` sm·lg; `icon`, `iconRight` | Every page | **Yes** |
| `Card` | `src/ui.js:15` | `hover`, `pad` | Every page | **Yes** |
| `Section` | `src/ui.js:19` | `title`, `sub`, `icon`, `actions`, `right`, `noBody` | Most pages | **Yes** |
| `Metric` | `src/ui.js` | `icon`, `tone`, `label`, `value`, `foot` | analyzer, dashboards | Yes |
| `Pill` | `src/ui.js` | `tone` gray·blue·green·amber·red·purple·indigo·orange; `dot` | 232 call sites | **Yes** |
| `Status` | `src/ui.js:78` | `value` → `STATUS_MAP` (43 entries) → `Pill` | Registers, records | **Yes** |
| `Risk` | `src/ui.js:83` | `level` critical·high·medium·low | Litigation, contracts | **Yes** |
| `Priority` | `src/ui.js:90` | `level` urgent·high·medium·low | Workspace, requests | **Yes** |
| `Avatar` | `src/ui.js` | `name`, `size` sm·md | Tables, topbar, sidebar | **Yes** |
| `AvatarStack` | `src/ui.js` | `names` | Team surfaces | Yes |
| `Tabs` | `src/ui.js:117` | `tabs`, `active`, `onChange`, `variant` pills, `ariaLabel`; arrow-key roving | 20+ pages, `FamilyTabs` | **Yes** |
| `Segmented` | `src/ui.js:145` | `options`, `value`, `onChange` | Costs, calendar, dashboards | **Yes** |
| `Field` | `src/ui.js` | `label`, `hint` | Every form | **Yes** |
| `Input` | `src/ui.js` | native passthrough | Every form | **Yes** |
| `Textarea` | `src/ui.js` | `rows` | Forms | **Yes** |
| `SearchInput` | `src/ui.js` | `value`, `onChange` | `Toolbar`, `RegisterShell` | **Yes** |
| `DateInput` | `src/ui.js:201` | `value` (ISO), `onInput`/`onChange`, `disabled` | Every date field | **Yes — mandatory** |
| `Select` | `src/complianceui.js:32` | `options`, `placeholder` | Compliance forms | Partial — most pages use a raw `<select class="select">` |
| `Toggle` | `src/ui.js` | `on`, `onChange` | Settings, request form | **Yes** |
| `Chip` | `src/ui.js` | `active`, `onClick` | Toolbars, filters | **Yes** |
| `Progress` | `src/ui.js` | `value`, `tone` | Dashboards, pipelines | **Yes** |
| `Stepper` | `src/ui.js` | `steps`, `current` | Record pages, request form | **Yes** |
| `Timeline` | `src/ui.js:293` | `items` `[{title, meta, tone}]` | Record pages | **Yes** |
| `Empty` | `src/ui.js` | `icon`, `title`, `text`, `action` | Every register | **Yes** |
| `Modal` | `src/ui.js` | `title`, `icon`, `footer`, `onClose`, `width` (snaps 420/560/680/820/980), `exactWidth` | All dialogs | **Yes** |
| `Drawer` | `src/ui.js` | `title`, `onClose` | Filters, detail panes | **Yes** |
| `Dropdown` | `src/ui.js` | `trigger`, `align`, `width` | Topbar, sidebar, toolbars | **Yes** |
| `MenuItem` | `src/ui.js:399` | `icon`, `danger`, `onClick` — renders a real `<button role="menuitem">` | Dropdowns | **Yes** |
| `AICard` | `src/ui.js` | `title` | Record pages | Yes |
| `Comment` | `src/ui.js` | — | Threads | Yes |
| `Picker` | `src/ui.js` | `options`, `value`, `onChange` — commits on both `mousedown` and `click` | Case/module forms | **Yes** |
| `PageHead` | `src/parts.js:6` | `title` (renders `<h1>`), `sub`, `actions` | **Every page** | **Yes — mandatory** |
| `Toolbar` | `src/parts.js:20` | `search`, `onSearch`, `chips`, `active`, `onChip`, `right` | Simple list pages | Yes |
| `DataTable` | `src/parts.js:48` | `columns`, `rows`, `onRow`, `empty`, `sort`, `onSort`, `pinFirst`, `keepHead` | 23 files | **Yes** |
| `StatStrip` | `src/parts.js` | `stats[{value,label,tone,onClick,active,title}]` | Most pages | **Yes** |
| `RegisterShell` | `src/register.js` | `ns`, `rows`, `fields`, `columns`, `views`, `searchKeys`, `noun`, `exportName`, `summary`, `defaultSort`, `onRow` | Every register | **Yes — mandatory for registers** |
| `RegisterTabs` | `src/register.js:30` | `tabs`, `active`, `onChange`, `ariaLabel` | Record detail tabs | **Yes** |
| `Donut` | `src/charts.js` | `data`, `size`, `thickness`, `centerValue`, `centerLabel`, `onItem` | Analytics, dashboards | **Yes** |
| `BarChart` | `src/charts.js` | `data`, `height`, `format`, `onItem` | Analytics | **Yes** |
| `StackBar` | `src/charts.js` | `data` | Dashboards | Yes |
| `AreaTrend` | `src/charts.js` | `data` | Dashboards | Yes |
| `Spark` | `src/charts.js` | `data` | Inline trends | Yes |
| `HBars` | `src/charts.js:203` | `data`, `format`, `color`, `onItem`, `gap` | Analytics, breakdowns | **Yes** |
| `Funnel` | `src/charts.js` | `data` | Pipelines | Yes |
| `Gauge` | `src/charts.js` | `value` | Dashboards | Yes |
| `Icon` | `src/icons.js` | `name` (99), `size`, `class`, `style` | Everywhere | **Yes** |
| `Shell` | `src/layout.js` | `path`, `children` | `main.js` | **Yes** |
| `FamilyTabs` | `src/layout.js` | `path` | Auto-mounted in `Shell` | **Yes** |
| `CommandPalette` | `src/layout.js` | ⌘K | `Shell` | **Yes** |
| `ToastHost` / `toast()` | `src/toast.js` | `success`·`error`·`info` | Everywhere | **Yes** |

---

## Detail — the components you will reuse most

### `Btn` — `src/ui.js:6`

```
Variants   primary · ghost (default) · soft · accent · danger · gradient
Sizes      default 36px · sm 30px · lg 42px · icon-only 36×36
Padding    0 14px  (sm 0 11px, lg 0 20px)
Radius     --r-sm 10px  (sm --r-xs 8px)
Type       13px / 600  (sm 12.5px, lg 14px)
Icon       16px, or 14px when size="sm"; gap 8px
Hover      per variant — see FRONTEND-DESIGN-SYSTEM.md §10
Active     translateY(1px)
Focus      2px solid var(--brand), offset 2px (shared rule)
Disabled   opacity .5; pointer-events: none
Loading    NOT IMPLEMENTED — pages pass `disabled` and change the label
Transition all .14s ease
```

### `DataTable` — `src/parts.js:48`

```
columns  [{ key, label, render(row), plain(row), align, width, mono,
            sortValue|sortKey, essential, secondary }]
props    rows, onRow, empty, sort, onSort, pinFirst, keepHead

Behaviour
  · Renders CHUNK = 120 rows, extending on an IntersectionObserver
    (rootMargin 400px). Filtering and sorting still run on the full set.
  · `secondary: true` marks a column hidden by default — only honoured when the
    table is inside RegisterShell, which owns the Columns control.
  · `essential: true` locks a column on.
  · `keepHead` keeps the column headings when there are no rows.
  · A sortable column renders its header as a real button with aria-sort.
```

### `RegisterShell` — `src/register.js`

The one screen shell for anything with a filter bar. Owns: search, filter
dropdowns, active-filter chips, saved Views, the Columns picker, CSV export and
the record count — **all held in the URL** under the `ns` prefix
(`cases_lifecycle`, `loan_category`, `wsp_tat`…), which is what makes every KPI
and chart drill-through reconcile with the table.

> **Rule:** if a new screen has a table and filters, it goes through
> `RegisterShell`. Rebuilding a toolbar by hand is how the URL-backed filter
> contract gets broken.

### `Modal` — `src/ui.js`

```
Width    snaps to 420 / 560 / 680 / 820 / 980 unless `exactWidth` is given
Max      calc(100vw - 40px) wide, 80vh tall
Radius   --r-xl 18px      Shadow --shadow-pop
Head     18px 22px, 1px bottom border, title 16px/700
Body     22px, scrolls
Foot     16px 22px, --surface-2, buttons right, gap 10px
Overlay  rgba(9,13,22,.5) + blur(3px), z-index 90, padding-top 10vh
Motion   rise .2s cubic-bezier(.16,1,.3,1)
```

### `DateInput` — `src/ui.js:201`

Renders a masked `dd/mm/yyyy` text box plus an off-screen native
`<input type="date">` and a calendar button that calls `showPicker()`.

> **Rule:** never render a raw `<input type="date">`. It displays in the
> *browser's* locale, so the same form shows `mm/dd/yyyy` to one person and
> `dd/mm/yyyy` to the next, and `03/07` becomes two different days.

### `StatStrip` — `src/parts.js`

```
stats  [{ value, label, tone, onClick, active, title, trend, trendDir }]
Grid   repeat(auto-fit, minmax(150px, 1fr)), gap 12px, margin-bottom 18px
Tone   blue green amber red purple gray → the 3px left rail colour
```

> **Rule:** a KPI with an `onClick` must land on **exactly the records it
> counted**. A figure a reader cannot get behind is a decoration.

---

## Components that exist but should NOT be copied

| Component / file | Why |
|---|---|
| `src/pages/matters.js` | Retired concept. The route redirects to the Legal Workspace and the import is gone; the file is left only as history. |
| Raw `<table class="table">` in 19 pages | Looks right (same CSS) but loses chunked rendering, sorting, `keepHead` and the empty state. Use `DataTable`. |
| `Toolbar` (`src/parts.js:20`) | Fine for a simple list, but it is **not** the register toolbar. Anything with filters belongs in `RegisterShell`. |
| Inline `style=` blocks in `compliance-secp.js` (133), `datahealth.js` (102), `settings.js` (92) | One-off layout that bypasses the shared system. Reuse `Section`, `Card` and the grid helpers instead. |
| `.crfcard` | A KPI **toggle**, not the standard KPI. Use `StatStrip` unless you specifically need a pressed state. |

---

## Missing primitives — repeated patterns with no shared component

These are written by hand in several places and have no component. Listed as
findings, not as work.

1. **Two-column detail layout** — `grid-template-columns: minmax(0,1fr) 330px` is
   hand-written on every record page.
2. **Key/value fact grid** — `.kvgrid` + `.kv__l`/`.kv__v` markup is repeated
   rather than wrapped.
3. **Banner / callout** — `.banner`, `.banner--warn`, `.banner--info` are used as
   raw markup with a hand-placed `Icon` every time.
4. **"Not evidenced" row** — the `.staterow`/`.statedot` pattern is duplicated
   across compliance and companies.
5. **Skeleton / loading placeholder** — `@keyframes shimmer` exists; there is no
   component, and pages render a `tiny muted` sentence instead.
6. **Button loading state** — see `Btn` above.
