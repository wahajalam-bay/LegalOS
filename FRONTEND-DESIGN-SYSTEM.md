# LegalOS — Frontend Design System

**What this is.** A reverse-engineered record of the design system this
application *already has*, so a new module can be built that looks native to it
without guessing. Every value below was read out of this repository and, where
marked **verified**, confirmed against the running application in a browser at
1366×768 on `/litigation`.

Nothing here is a proposal. Where the code contradicts itself that is recorded
as drift in §14, not corrected.

**Audited:** `index.html`, `assets/styles.css` (4,167 lines), `src/` (68 modules),
`src/pages/` (59 route components), rendered output on 22 routes at three widths.

---

## 1. Stack

| Concern | What this app actually uses |
|---|---|
| Framework | **React 18.2.0**, loaded from `https://esm.sh` via an import map in `index.html`. No local React. |
| Templating | **htm 3.1.1** tagged templates — `html\`<div>\`` — bound in `src/core.js`. **No JSX, no build step.** |
| Build / bundler | **None.** Native ES modules served straight from disk. |
| Cache-busting | Path-versioned symlinks `src-vNNN → src`, rewritten by `tools/bust-cache.sh`; `index.html` points at the current one. |
| CSS strategy | **One global stylesheet** — `assets/styles.css` — plus CSS custom properties. No CSS-in-JS, no CSS modules. |
| CSS framework | **None.** No Tailwind, no Bootstrap. All classes are hand-written and app-specific. |
| Theme provider | None. Theming is `:root[data-theme="light"|"dark"]` toggled by `setTheme()` in `src/layout.js`. |
| Component library | **None external.** Every primitive is local — `src/ui.js`. |
| Icons | **Local inline SVG**, 99 icons, `src/icons.js`, lucide-style geometry. No icon package. |
| Charts | **Hand-built SVG**, `src/charts.js`. No chart library. |
| Tables | Local `DataTable`, `src/parts.js`. No table library. |
| Forms | Local primitives in `src/ui.js`. No form library. |
| Animation | CSS keyframes in `assets/styles.css`. No animation library. |
| Fonts | **Inter** 400/500/600/700/800 and **JetBrains Mono** 400/500, from Google Fonts, linked in `index.html`. |
| Assets | `assets/` holds exactly two files: `styles.css` and `zameen-logo.png`. |

> **Consequence for new work:** there is no package to `npm install` and no class
> utility layer. A new module is written with `html\`\`` templates, imports its
> primitives from `src/ui.js` / `src/parts.js`, and adds any new CSS to
> `assets/styles.css`.

---

## 2. Source structure

| Directory / file | Responsibility | Global or module | Reusable primitives |
|---|---|---|---|
| `index.html` | Import map, font links, stylesheet link, boot + fatal-error screen | Global | — |
| `assets/styles.css` | **The entire visual system.** Tokens, every component class, responsive rules | Global | Yes — the source of truth |
| `src/core.js` | `html` (htm+React bind), `cx`, `fmt`, `colorFor`, React hook re-exports | Global | Yes |
| `src/ui.js` | 30 UI primitives (see §9) | Global | **Yes — canonical** |
| `src/parts.js` | Page building blocks: `PageHead`, `Toolbar`, `DataTable`, `StatStrip` | Global | **Yes — canonical** |
| `src/charts.js` | 8 SVG charts + the validated categorical palette | Global | **Yes — canonical** |
| `src/icons.js` | 99-icon inline SVG set | Global | **Yes — canonical** |
| `src/register.js` | `RegisterShell` — the one register/table screen shell | Global | **Yes — canonical** |
| `src/registerdefs.js` | Per-family field, column and view definitions consumed by `RegisterShell` | Global | Yes (data, not visual) |
| `src/layout.js` | App shell: `Sidebar`, `Topbar`, `FamilyTabs`, `CommandPalette`, `Shell` | Global | Yes |
| `src/main.js` | Route table, `NoAccess`, `NotFound` | Global | — |
| `src/nav.js` | `NAV`, `NAV_GROUPS` — navigation as data | Global | — |
| `src/pages/*.js` | 59 route components | Module-specific | No |
| `src/portal/` | The business requester door (separate shell) | Module-specific | No |
| `src/crf/` | Contract-request form definitions | Module-specific | No |

---

## 3. Colour system

All values from `assets/styles.css`. Light theme is `:root, :root[data-theme="light"]`
(line 78); dark is `:root[data-theme="dark"]` (line 132).

### Brand

| Token | Value | Usage | Source |
|---|---|---|---|
| `--brand-500` | `#0d7a3f` | Bayut green. Primary actions, active states, focus ring | styles.css:9 |
| `--brand-600` | `#063d24` | Primary hover; the sidebar gradient's mid stop | styles.css:10 |
| `--brand-400` | `#27a96d` | Active-row accent bar, gradient light stop | styles.css:11 |
| `--brand` | `var(--brand-500)` | The alias components use | styles.css:105 |
| `--brand-soft` | `#e7f3ec` | Tinted brand background (active tab, soft chip) | styles.css:106 |
| `--brand-soft-2` | `#d3ecdd` | Deeper brand tint | styles.css:107 |
| `--accent-500` | `#0891b2` | Teal accent — AI surfaces, purple KPI rail | styles.css:12 |
| `--accent-600` | `#0e7490` | Accent hover | styles.css:13 |
| `--accent-soft` | `#e0f1f5` | Accent tint | styles.css:108 |

Logo: `assets/zameen-logo.png` (69 KB), plus an inline `ZMark` SVG in `src/pages/login.js`.

### Backgrounds

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--bg` | `#f4f8f5` | — | Application canvas |
| `--bg-elev` | `#ffffff` | — | Elevated surface |
| `--surface` | `#ffffff` | `#16221c` | Cards, tables, modals, drawers, inputs |
| `--surface-2` | `#edf5ef` | — | Table header, modal footer, hover wash |
| `--surface-3` | `#e3efe7` | — | Soft button, chip, segmented track |
| `--sidebar-bg` | `#063d24` | `#08130e` | Sidebar |
| `--glass` | `rgba(255,255,255,.74)` | — | Topbar (with `backdrop-filter: blur(14px)`) |

### Text

| Token | Light | Usage | Note |
|---|---|---|---|
| `--text` | `#14261c` | Headings, primary text | |
| `--text-2` | `#4c655a` | Secondary text, table headers, ghost button | |
| `--text-3` | `#5b6d64` | Muted text, captions, placeholders | Raised from `#7c9488`, which failed AA at 2.76:1 |
| `--danger-text` | `#c92323` | Danger **as text** on its own tint | Fill colours fail AA as text; these are the darkened pairs |
| `--warning-text` | `#a55a05` | Warning as text | |
| `--success-text` | `#11803a` | Success as text | |
| `--sidebar-fg` | `#c6ddd2` | Nav text — clears 4.5:1 on every sidebar wash | |
| `--sidebar-fg-dim` | `#b4cbbf` | Sidebar secondary | Raised from `#6f957f` (2.8:1) |

### Borders

| Token | Value | Usage |
|---|---|---|
| `--border` | `#d3e3d8` | Default: cards, inputs, table rows, dividers |
| `--border-strong` | `#bfd6c6` | Hover borders, gray KPI rail |

Border width is **1px everywhere**. The only exceptions are the 3px KPI left rail
and the 3px accent bar on an active nav row.

### Semantic

| Token | Fill | Tint | Usage |
|---|---|---|---|
| `--success` | `#16a34a` | `--success-bg` `#dcfce7` | Active, approved, executed, on time |
| `--warning` | `#d97706` | `--warning-bg` `#fef3c7` | Expiring, pending, delayed |
| `--danger` | `#dc2626` | `--danger-bg` `#fee2e2` | Expired, overdue, adverse, rejected |
| `--info` | `#1d6cb0` | `--info-bg` `#e3f0fb` | Informational |

### Data visualisation — **do not extend**

| Token | Value | Slot |
|---|---|---|
| `--viz-1` | `#0d7a3f` | green |
| `--viz-2` | `#1d6cb0` | blue |
| `--viz-3` | `#ea580c` | orange |
| `--viz-4` | `#6d28d9` | violet |
| `--viz-5` | `#db2777` | magenta |
| `--viz-other` | `#8a9a91` | the aggregated tail — **never a sixth hue** |
| `--viz-grid` / `--viz-axis` | `#e6efe9` / `#cfe0d5` | chart chrome |

The **order is the colour-blind-safety mechanism** (`src/charts.js` header):
worst adjacent CVD ΔE 17.3 light / 15.9 dark. Never reorder and never add a
sixth hue — `foldSeries()` exists to aggregate the tail instead.

**Hard-coded colours:** 129 distinct hex literals appear in `styles.css` outside
`:root`. Most are dark-theme pill overrides (`:root[data-theme="dark"] .pill--*`),
which is intentional. See §14.

---

## 4. Typography

**Family:** `--font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
**Mono:** `--mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace`
**Base:** `body { font-size: 14px; line-height: 1.5 }` — **verified**: `14px / 21px`.

| Role | Class | Size | Weight | Line height | Colour | Source |
|---|---|---|---|---|---|---|
| Page title | `.pagehead__title` (`<h1>`) | 24px | 700 | 1.25 | `--text` | styles.css:564 — **verified** 24px/700/-0.48px |
| Page subtitle | `.pagehead__sub` | 13.5px | — | — | `--text-2` | styles.css:565 |
| Section / panel title | `.panel__title` | 13.5px | 750 | — | `--text` | styles.css:2596 — carries a 3.5px brand bar via `::before` |
| Card title | `.card__title` | 14px | 650 | — | `--text` | styles.css:604 |
| Card subtitle | `.card__sub` | 12px | — | — | `--text-3` | styles.css:605 |
| Modal title | `.modal__title` | 16px | 700 | — | `--text` | styles.css:904 |
| Table header | `.table thead th` | 11px, uppercase, `.03em` | 600 | 1.25 | `--text-2` | styles.css:747 — **verified renders 10.5px**, see §14 |
| Table body | `.table` | 12.5px | — | 1.32 | `--text` | styles.css:746 — **verified renders 12px** |
| Table strong cell | `.table .cell-strong` | inherit | 600 | — | `--text` | styles.css:774 |
| Table mono cell | `.table .cell-mono` | 12px (11px in body) | — | — | `--text-2` | styles.css:775 |
| Form label | `.field label` | via `Field` | — | — | — | `src/ui.js` |
| Input text | `.input, .textarea, .select` | 13px | — | — | `--text` | styles.css:869 |
| Helper / caption | `.tiny` | 11.5px | — | — | inherit | styles.css:1054 |
| Muted | `.muted` | — | — | — | `--text-3` | styles.css:1051 |
| Strong | `.strong` | — | 650 | — | — | styles.css:1055 |
| Button text | `.btn` | 13px | 600 | — | per variant | styles.css:575 |
| Navigation item | `.nav__item` | 13px | 500 | — | `--sidebar-fg` | styles.css:334 — **verified renders 14px/400**, see §14 |
| Badge / pill | `.pill` | 11.5px | 600 | — | per tone | styles.css:637 — **verified renders 10.5px inside tables** |
| KPI value | `.statkpi__n` | 21px | 750, `-0.02em`, tabular-nums | — | `--text` | styles.css — **verified** |
| KPI label | `.statkpi__l` | 11.5px | — | 1.3 | `--text-2` | **verified** |

---

## 5. Spacing

Declared scale (`:root`, styles.css:29):
`--sp-1:4 --sp-2:8 --sp-3:12 --sp-4:16 --sp-5:20 --sp-6:24 --sp-8:32 --sp-10:40 --sp-12:48`
— a **4/8 base scale**.

> **NOT VERIFIED as load-bearing.** The `--sp-*` tokens are declared but almost
> never referenced; components use literal px. The scale below is what the
> components actually do.

Layout-scale tokens (styles.css:57–72) — these *are* consumed:

| Token | Value | Consumed by |
|---|---|---|
| `--page-pad-x` | 30px | `.page`, `.famtabs`, `.wshub__tabs` |
| `--page-pad-t` | 26px | `.page` |
| `--page-pad-b` | 60px | `.page` |
| `--section-gap` | 22px | `.pagehead` margin, section gaps |
| `--card-pad` | 18px | `.card--pad`, `.card__body` |
| `--card-r` | `var(--r-lg)` = 14px | `.card` |
| `--row-h` | 54px | `.table tbody td/tr` |
| `--head-h` | 40px | `.table thead th` |
| `--field-h` | 36px | `.input`, `.select`, `.textarea`, `.calnav__b` |
| `--btn-h` | 36px | `.btn` |
| `--badge-h` | 22px | `.pill` |
| `--kpi-h` | 112px | compact KPI tile |
| `--sidebar-w` | 268px | `.app` grid track |
| `--topbar-h` | 60px | `.topbar`, `.sidebar__brand` |

Observed rhythm in components: **gaps of 6, 8, 10, 12, 14, 16, 20, 22px**;
card padding 18px; grid gaps 12–16px; modal padding 18–22px.

---

## 6. Radius, borders, shadows

**Radius** — note `:root` is declared twice and the second wins:

| Token | Final value | Used by |
|---|---|---|
| `--r-xs` | **8px** | small button, sortable-header focus |
| `--r-sm` | **10px** | buttons, inputs, nav items, chips |
| `--r-md` | **12px** | KPI cards, toasts |
| `--r-lg` | **14px** | cards (`--card-r`), table wrapper, command palette |
| `--r-xl` | **18px** | modals, copilot panel |
| `--r-full` | 999px | pills, avatars, progress |

**Verified:** card 14px, KPI 12px, button 10px, pill 999px.

**Shadows** (light):

| Token | Value | Used by |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(6,61,36,.05)` | card resting, primary button |
| `--shadow-sm` | `0 1px 3px rgba(6,61,36,.08), 0 1px 2px rgba(6,61,36,.04)` | button hover |
| `--shadow-md` | `0 4px 12px -2px rgba(6,61,36,.10), 0 2px 6px -2px rgba(6,61,36,.06)` | `.card--hover:hover` |
| `--shadow-lg` | `0 16px 40px -8px rgba(6,61,36,.16), 0 6px 14px -6px rgba(6,61,36,.10)` | toast, floating button |
| `--shadow-pop` | `0 24px 60px -12px rgba(6,61,36,.24)` | modal, drawer, command palette |
| `--shadow-card` | `0 1px 2px rgba(16,38,26,.05), 0 6px 22px -10px rgba(16,38,26,.12)` | **verified** — the shadow `.card` actually renders |
| `--shadow-modal` | three-layer ring + lift | declared; see §14 |

---

## 7. Application shell

`src/layout.js` → `Shell`. Grid: `.app { grid-template-columns: var(--sidebar-w) 1fr; height: 100vh }`,
transitioning `grid-template-columns` over `.28s cubic-bezier(.4,0,.2,1)` so the
rail and the page move together. Collapsed: `.app--collapsed { --sidebar-w: 72px }`.

### Sidebar — `Sidebar` in `src/layout.js`, CSS styles.css:238–466

| Property | Value |
|---|---|
| Width | **268px** (72px collapsed) — **verified** |
| Background | **`linear-gradient(180deg, #085031 0%, var(--sidebar-bg) 38%, #042a19 100%)`** — re-declared at styles.css:2637. The flat `--sidebar-bg` `#063d24` at styles.css:238 is the *first* declaration and is not what renders. |
| Brand row | `.sidebar__brand`, height `--topbar-h` (60px), padding 16px 18px, 30px logo |
| Entity switcher | `.workspace` — a `Dropdown` listing `COMPANY.entities`, each opening that company |
| Nav container | `.nav { flex:1; overflow-y:auto; padding: 6px 12px 16px; display:flex; flex-direction:column }` |
| Nav item | `.nav__item` — height **37px verified**, padding 8px 10px, radius 10px, gap 11px, icon 17px, single line with ellipsis |
| Active state | `.nav__item.active` — `--sidebar-active` `#0c5836` + a 3px `--brand-400` bar at `left:-12px` |
| Hover | `rgba(255,255,255,.06)`, text `#fff` |
| Badge | `.nav__badge` — right-aligned pill, 10.5px/600, never wraps; `--nav__badge--alert` turns `--danger` |
| Footer | `.sidebar__footrow` — avatar, name, role, rail-collapse toggle |

Families are **one row each**; their destinations are tabs on the page (see `FamilyTabs`).

### Topbar — `Topbar` in `src/layout.js`, CSS styles.css:472

Height **60px verified**; background `--glass` with `backdrop-filter: saturate(180%) blur(14px)`;
1px bottom border; `z-index: --z-topbar (40)`. Contains: back control, breadcrumbs
(`.topbar__crumbs`, 13px, last crumb `<b>`), global search trigger (⌘K), New,
Tour, theme toggle, notifications bell, user chip.

### Family tabs — `FamilyTabs` in `src/layout.js`, CSS styles.css:526

Full-bleed strip below the topbar on every page inside a module family.
`padding: 10px var(--page-pad-x) 0`, 1px bottom border, horizontally scrollable
with left/right arrow buttons that appear only when the row continues, plus a
mask fade. Auto-scrolls the current tab into view.

### Main content

`.main { display:flex; flex-direction:column; height:100vh; overflow:hidden }` →
`<main class="content">` (`overflow-y:auto`) → the routed `.page`.

`.page { padding: var(--page-pad-t) var(--page-pad-x) var(--page-pad-b); max-width: 1560px; margin: 0 auto }`
**— but see §14: this is overridden later.** Verified rendered padding on
`/litigation` is `20px 34px 76px`. `.page--wide` removes the max-width.

---

## 8. Page structure

The recurring pattern, from the real screens:

```
Shell
 └── FamilyTabs               (only inside a module family)
      └── .page[.page--wide]
           ├── PageHead        title · sub · actions
           ├── StatStrip       KPI cards, each drilling
           ├── [banner]        attention / not-evidenced notes
           └── RegisterShell   toolbar (search · filters · views · columns · export)
                └── DataTable
```

Variations actually in use:

- **Overview pages** (`/compliance`) — `.page--cov`: module card grid → needs-attention → health strip → activity.
- **Dashboard** (`/exec`) — `.page--dash`: tighter padding (16px 22px 40px), denser cards.
- **Record pages** (`/litigation/<id>`) — `RecordWorkspace`: header + `Stepper` + tabs (Overview · module tab · Documents · Timeline) + a 330px right rail.
- **Hub pages** (`/g/<key>`) — tile grid with live counts.

---

## 9. Component inventory

See `FRONTEND-COMPONENT-INVENTORY.md` for the full table. Summary:

- **`src/ui.js` (30):** `Btn` `Card` `Section` `Metric` `Pill` `Status` `Risk` `Priority` `Avatar` `AvatarStack` `Tabs` `Segmented` `Field` `DateInput` `Input` `Textarea` `SearchInput` `Toggle` `Chip` `Progress` `Stepper` `Timeline` `Empty` `Modal` `Drawer` `Dropdown` `MenuItem` `AICard` `Comment` `Picker`
- **`src/parts.js` (5):** `PageHead` `Toolbar` `DataTable` `useFilter` `StatStrip`
- **`src/charts.js` (8):** `Donut` `BarChart` `StackBar` `AreaTrend` `Spark` `HBars` `Funnel` `Gauge` + `seriesColor` / `foldSeries`
- **`src/register.js` (3):** `RegisterShell` `RegisterTabs` `useRegisterTab`

---

## 10. Buttons

`Btn` — `src/ui.js:6`. Signature: `{ variant = "ghost", size, icon, iconRight, children, className, ...rest }`.

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| `primary` | `--brand` | `#fff` | — | `--brand-600` + `--shadow-sm` |
| `ghost` **(default)** | transparent | `--text-2` | `--border` | `--surface-3`, text `--text`, border `--border-strong` |
| `soft` | `--surface-3` | `--text` | — | `--border` |
| `accent` | `--accent-500` | `#fff` | — | `--accent-600` |
| `danger` | `--danger` | `#fff` | — | `brightness(.94)` |
| `gradient` | `linear-gradient(135deg, --brand-500, --accent-500)` | `#fff` | — | `brightness(1.05)` + glow |

| Size | Height | Padding | Font | Radius |
|---|---|---|---|---|
| default | **36px verified** | 0 14px | 13px/600 | **10px verified** |
| `sm` | 30px | 0 11px | 12.5px | `--r-xs` 8px |
| `lg` | 42px | 0 20px | 14px | 10px |
| icon-only | 36×36 | 0 | — | 10px |

Icon size follows size: 14px for `sm`, else 16px. Gap 8px.
`:active` → `translateY(1px)`. `[disabled]` → `opacity .5; pointer-events: none`.
**No loading state exists on `Btn`** — pages pass `disabled` and swap the label
("Saving…"). Transition `all .14s ease`.

---

## 11. Tables

**One canonical implementation:** `DataTable` in `src/parts.js:48`, wrapped by
`RegisterShell` (`src/register.js`) for any screen with filters.

| Property | Value |
|---|---|
| Container | `.tablewrap` — `overflow-x:auto`, radius 14px, 1px `--border`, `--surface`, horizontal scroll-shadow gradients |
| Header | `.table thead th` — sticky `top:0`, `--surface-2`, 11px/600 uppercase `.03em`, padding 9px 10px, `max-width:130px`, wraps, `vertical-align: bottom` |
| Header height | `--head-h` 40px (**verified 44.75px** — content-driven) |
| Row height | `--row-h` 54px (**verified 81.6px** with two-line cells) |
| Cell | padding 9px 10px, 1px bottom border, `vertical-align: middle`, `max-width:200px`, wraps |
| Body font | 12.5px (**verified 12px** in `.dense`) |
| Alternating rows | **None** |
| Hover | `background .12s`; `.rowlink { cursor: pointer }` |
| Sorting | `sortValue`/`sortKey` on a column → header becomes a `.thsort` button, `aria-sort`, ▲/▼, brand-coloured when active |
| Sticky first column | `pinFirst` → `.tablewrap--pin` (used only by the Commercial Contract Tracker) |
| Empty state | `empty` prop replaces the table; `keepHead` keeps the headings and puts the empty state in the body |
| Virtualisation | Reveals `CHUNK = 120` rows, extends via `IntersectionObserver` at `rootMargin: 400px` |
| Pagination | **None** — progressive reveal instead |
| In-cell pills | `.table td .pill { height: 19px; padding: 0 7px; font-size: 10.5px }` |

**Competing implementations:** 19 files render a raw `<table class="table">`
directly rather than going through `DataTable`. They inherit the same CSS, so
they *look* right, but they do not get chunked rendering, sorting, `keepHead` or
the empty state. See §14.

---

## 12. Cards and KPIs

| Component | Source | Background | Radius | Border | Padding | Shadow |
|---|---|---|---|---|---|---|
| `Card` | `ui.js:15` / `.card` | `--surface` | `--card-r` 14px | 1px `--border` | `--card-pad` 18px with `pad` | `--shadow-card` (**verified**) |
| `Card` hover | `.card--hover:hover` | — | — | `--border-strong` | — | `--shadow-md` + `translateY(-2px)` |
| `Section` | `ui.js:19` | card + `.card__head` (icon chip 28×28 r8, title 14px/650, sub 12px) | | | body `--card-pad` | |
| `StatStrip` | `parts.js` / `.statkpis` | grid `repeat(auto-fit, minmax(150px, 1fr))`, gap 12px, margin-bottom 18px | | | | |
| KPI card | `.statkpi` | `--surface` | **12px verified** | 1px + **3px left rail verified** | **13px 16px verified** | `--shadow-xs` |
| KPI value | `.statkpi__n` | — | — | — | — | **21px / 750 / -0.02em / tabular-nums verified** |
| KPI label | `.statkpi__l` | 11.5px `--text-2`, margin-top 3px | | | | |

KPI rail colour by tone: `blue → --brand`, `green → --success`, `amber → --warning`,
`red → --danger`, `purple → --accent-500`, `gray → --border-strong`.
A clickable KPI gets `.statkpi--link` + `role="button"` + `tabindex` and, on hover,
`--shadow-sm` + `translateY(-1px)`.

**A second KPI style exists:** `.crfcard` (contract requests) — same geometry,
but a toggle with a pressed state. Intentional variation.

---

## 13. Charts, forms, status, icons, overlays, motion

**Charts** — `src/charts.js`, hand-built SVG, no library. Palette is the five
`--viz-*` slots, consumed as `var()` inside SVG paint attributes so themes swap
in one place. `seriesColor(i)` folds past slot 5 to `--viz-other`; `foldSeries()`
aggregates the tail. Charts accept `onItem` for drill-through.

**Forms** — `.input, .textarea, .select`: width 100%, height `--field-h` 36px,
padding 0 12px, radius `--r-sm`, 1px `--border`, 13px. Focus: `border-color: --brand`
+ `box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 16%, transparent)`.
Placeholder `--text-3`. `Textarea` is `height:auto; padding:10px 12px; resize:vertical`.
`DateInput` wraps a text box masked to `dd/mm/yyyy` plus an off-screen native
`<input type=date>` and a calendar button — **the app never renders a raw
`<input type=date>`**, because it would show in the browser's locale.

**Status** — centralised. `Status` (`ui.js:78`) maps a value through `STATUS_MAP`
(43 entries) onto a `Pill` tone. `Risk` and `Priority` are separate components
with their own classes. `Pill` tones: gray, blue, green, amber, red, purple,
indigo, orange. Direct `<Pill tone="…">` use is common (232 call sites) where the
value is not a lifecycle status.

**Icons** — `src/icons.js`, 99 inline SVG paths, 24×24 viewBox, `stroke-width` 2,
`stroke-linecap/linejoin: round`, `fill: none`. Sizes in use: 10–22px; 17px in
nav, 15–16px in buttons, 13–14px in table cells.

**Overlays** — `.overlay` (`rgba(9,13,22,.5)` + `blur(3px)`, `--z-overlay` 90,
`padding-top: 10vh`); `.modal` (width 560px, `max-width: calc(100vw - 40px)`,
`max-height: 80vh`, radius `--r-xl` 18px, `--shadow-pop`, `rise .2s`);
`.drawer` (right, 440px, `max-width: 92vw`, full height, `slidein .22s`);
`.cmdk` command palette (640px). `Modal` snaps `width` to the ladder
**420 / 560 / 680 / 820 / 980** unless `exactWidth` is passed.

**Motion** — durations 0.12–0.28s. Easings: `ease`, `cubic-bezier(.16,1,.3,1)`
(enter), `cubic-bezier(.4,0,.2,1)` (shell). Keyframes: `fade rise modalrise
slidein sheet toastin pop spin shimmer ppulse r`.
`@media (prefers-reduced-motion: reduce)` disables modal/toast/overlay animation,
hover transforms and smooth scrolling.

**Z-index** — `--z-sidebar 30 · --z-topbar 40 · --z-overlay 90 · --z-modal 100 ·
--z-toast 120`. Sticky table headers use `z-index: 1` inside their own stacking
context. **Collision:** `.toasts` hard-codes `z-index: 300`, above every token.

**Focus** — one shared rule: `2px solid var(--brand)` with `outline-offset: 2px`
and `border-radius: 6px`, applied to `.tab .chip .clickable .rowlink .statkpi
summary [tabindex]`. Table rows outline **inset** so the ring is not clipped.

**Breakpoints** — no framework defaults. Actual: **1500, 1200, 1100, 1024, 1000,
960, 900, 860, 820, 760, 720, 640, 620**. The load-bearing ones are **900px**
(sidebar becomes an overlay drawer, 9 rules) and **1100px** (`.calsplit` and other
two-column layouts collapse, 8 rules).

---

## 14. Design drift — found, **not** corrected

| # | Finding | Evidence | Classification |
|---|---|---|---|
| 0 | **The stylesheet has three layers, and the later two silently re-declare core components.** After the component rules, `assets/styles.css` contains a *"PREMIUM POLISH PASS"* (line 2409) and a *"DISTINCTION PASS"* (line 2574), each re-opening `:root` and re-declaring classes that were already defined. **43 selectors are declared more than once**, including `.btn` (573 → 2515), `.card` (597 → 2544 → 2591), `.page` (498 → 2606), `.topbar` (472 → 2446 → 2592), `.modal` (902 → 2471), `.input` (869 → 2510), `.sidebar` (238 → 2637) and `.table thead th` (710 → 747). Reading only the first declaration of a component gives the wrong answer. | `grep`-counted; verified against rendered values | **Likely design drift** — the passes were deliberate, the duplication they left is the single biggest source of "the token isn't working" |
| 1 | **The page-gutter tokens are dead.** `.page` is defined with `--page-pad-*` at styles.css:498, then redefined at **styles.css:2606** as `padding: 28px 34px 76px` inside a later "DISTINCTION PASS" block. The later rule wins. | Rendered `/litigation` padding = `20px 34px 76px` (top from `.famtabs + .page`) | **Likely design drift** — the token exists, is documented as "one product, one rhythm", and is overridden |
| 2 | **`font: inherit` wipes component type.** styles.css:3360 applies `font: inherit` to `.nav__item .tab .menu__item .th__sortbtn .ovcard .regsum__i .alertrow .linkbtn` *after* their own rules. The `font` shorthand resets size and weight to the body's. | `.nav__item` is declared 13px/500; **renders 14px/400** | **Likely design drift** — the reset is deliberate (appearance normalisation) but takes size/weight with it |
| 3 | `:root` is declared **three times** (lines 7, ~74, ~76) and `--r-xs/sm/xl` are redefined in the second. The first block's values are dead. | `--r-sm` declared 8px then 10px; renders 10px | **Legacy** |
| 4 | **19 files render a raw `<table class="table">`** instead of `DataTable`, losing chunked rendering, sorting, `keepHead` and the empty state. | `assetrecovery access contractrequests costs developerdisputes compliance-resolutions myrequests ipportfolio compliance-secp module datahealth requests caseinvoices settings matters legalspend raise intakedesk` | **Likely design drift** for the large ones; **intentional** for small fixed lists |
| 5 | **Two KPI card styles** — `.statkpi` and `.crfcard`. Aligned to the same geometry, but still two classes. | styles.css | **Intentional variation** (`.crfcard` is a toggle) |
| 6 | **Toast z-index bypasses the scale** — `.toasts { z-index: 300 }` vs `--z-toast: 120`. | styles.css:2276 | **Likely design drift** |
| 7 | **`--sp-*` spacing tokens are declared but effectively unused**; components use literal px. | grep | **Legacy** |
| 8 | **`--shadow-modal` is declared and not applied**; `.modal` uses `--shadow-pop`. | styles.css | **Legacy** |
| 9 | **Heavy inline `style=` use in pages** — `compliance-secp.js` 133, `datahealth.js` 102, `settings.js` 92, `matters.js` 92, `module.js` 57. | grep | **Likely design drift** — one-off layout bypassing the shared system |
| 10 | **`src/pages/matters.js` is unreachable** — the route redirects and the import was removed; the file remains. | main.js | **Legacy** |
| 11 | `.page--dash` and `.page--cov` set their own padding rather than deriving from the tokens. | styles.css:1706, 3505 | **Intentional variation** (density is a deliberate decision for those two) |
| 12 | 129 distinct hex literals outside `:root`. Most are dark-theme pill/risk overrides. | grep | **Intentional** for theme pairs; **Unknown — requires verification** for the ~20 one-offs |

---

## 15. What is NOT VERIFIED

- Dark theme was not visually walked; its token block was read but not rendered.
- Mobile (<640px) and tablet (640–900px) rendering were not exercised in a browser; only 1920/1440/1366 were measured.
- `Skeleton`/shimmer loading: `@keyframes shimmer` exists; no component was observed using it at runtime.
- Print styles: none found.
- The `--sp-*` scale's original intent.
