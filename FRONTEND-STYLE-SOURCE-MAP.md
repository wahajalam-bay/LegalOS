# LegalOS — Frontend Style Source Map

> *"Where does this styling come from?"*

One stylesheet, one token layer, one primitives module. There is no Tailwind, no
CSS-in-JS and no theme provider — so every answer below is a file, a CSS class
and (usually) a custom property.

`assets/styles.css` is referenced as `styles.css?v=NNN`; the `v` is rewritten by
`tools/bust-cache.sh` and carries no meaning beyond cache-busting.

---

## How to trace anything in three steps

1. **Inspect the element and read its class.** Every visual rule in this app is
   class-based; there are no utility chains to decode.
2. **Find that class in `assets/styles.css`.** It is the only stylesheet.
3. **Follow the `var(--…)`** to `:root` (line 7) or the theme block
   (`:root, :root[data-theme="light"]`, line 78 / `:root[data-theme="dark"]`, line 132).

The one trap: a handful of classes are **re-declared later in the same file** and
the later rule wins. See "Overrides that surprise people" at the end.

---

## Shell

| What you see | Class | Token | Rendered by | Stylesheet |
|---|---|---|---|---|
| Sidebar background | `.sidebar` | gradient over `--sidebar-bg` | `Sidebar`, `src/layout.js` | **styles.css:238 declares it flat; 2637 re-declares it as a gradient — 2637 wins** |
| Sidebar width | `.app` grid track | `--sidebar-w` **268px** | `Shell`, `src/layout.js` | styles.css:47, 229 |
| Collapsed rail | `.app--collapsed` | `--sidebar-w: 72px` | rail toggle in `Sidebar` | styles.css:235 |
| Nav row | `.nav__item` | `--r-sm`, `--sidebar-fg` | `navItem()` in `Sidebar` | styles.css:334 |
| Nav row, current page | `.nav__item.active` | gradient + `--brand-400` bar | `isActive()` in `Sidebar` | styles.css:341, re-declared 2639 |
| Nav attention count | `.nav__badge` / `.nav__badge--alert` | `--danger` | `groupBadge()` in `Sidebar` | styles.css:348 |
| Entity switcher | `.workspace` | `--sidebar-fg-dim` | `Dropdown` + `COMPANY.entities` (`src/data.js:21`) | styles.css:260 |
| Topbar | `.topbar` | `--glass`, `--topbar-h`, `--z-topbar` | `Topbar`, `src/layout.js` | styles.css:472 |
| Breadcrumbs | `.topbar__crumbs` | `--text-3`, `--text` | `Topbar` + `labelFor()` (`src/nav.js`) | styles.css:477 |
| Family tab strip | `.famtabs`, `.famtabs__strip`, `.famtabs__arrow` | `--page-pad-x`, `--border` | `FamilyTabs`, `src/layout.js` | styles.css:526 |
| Page canvas | `body` | `--bg` `#f4f8f5` | — | styles.css:188 |
| Page container | `.page` / `.page--wide` | `--page-pad-*` **(overridden, see below)** | every page component | styles.css:498 **and 2606** |
| Scroll region | `.content` | — | `Shell` | styles.css:497 |

## Page furniture

| What you see | Class | Rendered by | Stylesheet |
|---|---|---|---|
| Page title (`<h1>`) | `.pagehead__title` | `PageHead`, `src/parts.js:6` | styles.css:564 |
| Page subtitle | `.pagehead__sub` | `PageHead` | styles.css:565 |
| Page actions | `.pagehead__actions` | `PageHead` | styles.css:566 |
| KPI row | `.statkpis` | `StatStrip`, `src/parts.js` | styles.css:2107 |
| KPI card | `.statkpi` + `.statkpi--<tone>` | `StatStrip` | styles.css:2112 |
| Section heading with brand bar | `.panel__title` | raw markup / `Section` | styles.css:2596 |
| Card | `.card`, `.card--pad`, `.card--hover` | `Card`/`Section`, `src/ui.js:15` | styles.css:597 |
| Card head / body / foot | `.card__head` `.card__body` `.card__foot` | `Section`, `src/ui.js:19` | styles.css:603–607 |

## Registers and tables

| What you see | Class | Rendered by | Stylesheet |
|---|---|---|---|
| Table frame + horizontal scroll shadows | `.tablewrap` | `DataTable`, `src/parts.js:48` | styles.css:687 |
| Sticky column header | `.table thead th` | `DataTable` | styles.css:747 |
| Sortable header button | `.thsort` | `DataTable` when `sortValue`/`sortKey` | styles.css:759 |
| Row | `.table tbody tr`, `.rowlink` | `DataTable` `onRow` | styles.css:708, 784 |
| Cell | `.table tbody td` | `DataTable` | styles.css:770 |
| Strong / mono cell | `.cell-strong`, `.cell-mono` | column `render` | styles.css:774–775 |
| Pinned first column | `.tablewrap--pin` | `DataTable` `pinFirst` | styles.css |
| Filter bar, chips, Views, Columns, Export | `.regbar*`, `.fltbtn`, `.fltchip`, `.regcount` | `RegisterShell`, `src/register.js` | styles.css:~3290 |
| Register summary strip | `.regsum`, `.regsum__i` | page `summary` prop | styles.css:3304 |
| In-cell pill (smaller) | `.table td .pill` | any column render | styles.css:779 |

## Controls

| What you see | Class | Rendered by | Stylesheet |
|---|---|---|---|
| Button | `.btn` + `.btn--<variant>` + `.btn--<size>` | `Btn`, `src/ui.js:6` | styles.css:573 |
| Text input / select / textarea | `.input`, `.select`, `.textarea` | `Input`/`Textarea`/raw `<select>` | styles.css:869 |
| Select arrow | `--select-arrow` (inline SVG data URI) | — | styles.css:74 |
| Date field | `.dateinput`, `.dateinput__picker`, `.dateinput__btn` | `DateInput`, `src/ui.js:201` | styles.css |
| Tabs | `.tabs`, `.tab`, `.tabs--pills` | `Tabs`, `src/ui.js:117` | styles.css:770–792 |
| Segmented control | `.segmented` | `Segmented`, `src/ui.js:145` | styles.css:794 |
| Chip | `.chip` | `Chip`, `src/ui.js` | styles.css |
| Toggle | `.toggle` | `Toggle`, `src/ui.js` | styles.css |

## Status and semantics

| What you see | Class | Decided by | Stylesheet |
|---|---|---|---|
| Status pill | `.pill` + `.pill--<tone>` | `STATUS_MAP`, `src/ui.js:65` → `Status` | styles.css:635–645 |
| Risk | `.risk` + `.risk--<level>` | `Risk`, `src/ui.js:83` | styles.css:656 |
| Priority | `.prio--*` | `Priority`, `src/ui.js:90` | styles.css |
| Dark-theme pill colours | `:root[data-theme="dark"] .pill--*` | — | styles.css:647–653 |

## Overlays, motion, layering

| What you see | Class / token | Rendered by | Stylesheet |
|---|---|---|---|
| Modal + backdrop | `.modal`, `.overlay` | `Modal`, `src/ui.js` | styles.css:901–906 |
| Drawer | `.drawer` | `Drawer`, `src/ui.js` | styles.css:1025 |
| Command palette | `.cmdk` | `CommandPalette`, `src/layout.js` | styles.css:911 |
| Toast | `.toasts`, `.toast--*` | `ToastHost`, `src/toast.js` | styles.css:2276 |
| Floating assistant button | `.copilot-fab` | `CopilotDock`, `src/layout.js` | styles.css:1029 |
| Back-to-top | `.gotop` | `GoToTop`, `src/layout.js` | styles.css |
| Layer order | `--z-sidebar 30 · --z-topbar 40 · --z-overlay 90 · --z-modal 100 · --z-toast 120` | — | styles.css:41 |
| Focus ring | `:focus-visible` shared rule | — | styles.css:3152–3163 |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` | — | styles.css:2568 |

## Charts

| What you see | Source | Colour token |
|---|---|---|
| Any chart | `src/charts.js` — hand-built SVG | `--viz-1…5`, `--viz-other` |
| Series colour | `seriesColor(i)`, `src/charts.js` | folds to `--viz-other` past slot 5 |
| Tail aggregation | `foldSeries()`, `src/charts.js` | — |
| Grid / axis | — | `--viz-grid`, `--viz-axis` |

## Theme switching

`setTheme()` / `getTheme()` in `src/layout.js` write `data-theme` on
`<html>` and persist it. There is no provider and no context: the attribute
swaps one `:root` block for another.

---

## Overrides that surprise people

Read this before concluding "the token isn't working".

> **Read this first.** The stylesheet is written in three layers: the component
> rules, then a *"PREMIUM POLISH PASS"* (line 2409), then a *"DISTINCTION PASS"*
> (line 2574). The later passes re-open `:root` and re-declare components.
> **43 selectors are declared more than once.** Always `grep -n` for *every*
> occurrence of a class, not the first one.

| Symptom | Cause | Line |
|---|---|---|
| `.btn`, `.card`, `.topbar`, `.modal`, `.input`, `.sidebar` don't match their first declaration | Each is re-declared in a later pass | 573→2515 · 597→2544→2591 · 472→2446→2592 · 902→2471 · 869→2510 · 238→2637 |
| `.page` padding is not `--page-pad-*` | `.page` is **re-declared** as `padding: 28px 34px 76px` in a later block | styles.css:498 → **2606** |
| Page top padding is 20px, not 28px | `.famtabs + .page { padding-top: 20px }` on any page inside a module family | styles.css:537 |
| `.nav__item` renders 14px/400, not 13px/500 | `font: inherit` is applied to `.nav__item .tab .menu__item .th__sortbtn .ovcard .regsum__i .alertrow .linkbtn` **after** their own rules; the `font` shorthand resets size and weight | styles.css:3360 |
| `--r-sm` is 10px, not the 8px in the first `:root` | `:root` is declared three times; the second re-declares `--r-xs/sm/xl` | styles.css:7 → ~74 |
| Pills inside tables are 19px, not `--badge-h` 22px | `.table td .pill` deliberately shrinks them | styles.css:779 |
| Table body is 12px, not 12.5px | `.dense .table td` (Legal Workspace worklist) | styles.css:1313 |
| A toast sits above everything | `.toasts { z-index: 300 }`, bypassing `--z-toast: 120` | styles.css:2276 |
| `--shadow-modal` seems unused | It is. `.modal` uses `--shadow-pop` | styles.css |

---

## Checklist — making a new module look native

1. **Shell.** Render `<div class="page fade-in">` (or `page--wide` for a
   register). Do not build your own header bar; `Shell` already supplies the
   sidebar, topbar and family tabs.
2. **Title.** Always `PageHead` — it renders the page's only `<h1>`, which
   screen-reader heading navigation depends on.
3. **Figures.** Always `StatStrip`. Give every KPI an `onClick` that lands on
   exactly the records it counted, and a `tone` that matches what it reports.
   Never print a strip of zeros: if there is nothing to count, say so in a
   sentence.
4. **Tables.** `RegisterShell` + `DataTable`. Never hand-roll a filter bar — the
   URL-backed filter state (`<ns>_<field>`) is what makes drill-through
   reconcile. Mark identifier columns `essential`, extras `secondary`.
5. **Buttons.** `Btn`. `variant="primary"` for the one action the page exists
   for; `ghost` for everything else. Never style a `<button>` by hand.
6. **Dates.** `DateInput` only.
7. **Status.** `Status` for lifecycle values so `STATUS_MAP` stays the single
   vocabulary; `Pill` with an explicit tone only for things that are not a
   status.
8. **Charts.** `src/charts.js` only, with `seriesColor()` / `foldSeries()`.
   Never add a sixth categorical hue — aggregate the tail.
9. **Icons.** `Icon` from `src/icons.js`. If the icon you want is missing, add
   it there; do not inline an SVG in a page.
10. **Colour and spacing.** Use `var(--…)`. If you are typing a hex or a px
    padding into a page component, check the token layer first.
11. **Empty states.** `Empty`, and say *why* it is empty and what to do.
12. **Dead ends.** Every count, chart segment, badge and document number opens
    the records behind it — or the page says plainly why it cannot.
13. **Accessibility.** Controls are real `<button>`s; tabs carry
    `aria-selected`; the shared `:focus-visible` ring is inherited, not
    replaced.
14. **Responsive.** Check 1366×768. No page may scroll horizontally; a wide
    register scrolls inside `.tablewrap`.
15. **After any frontend edit,** run `bash tools/bust-cache.sh` or the browser
    will serve the previous build.
