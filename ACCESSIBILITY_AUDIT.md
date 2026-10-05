# Accessibility audit

**This is a measurement, not a WCAG certification.** No conformance level is
claimed. What follows is what was counted, how it was counted, what was fixed,
and what is still open — per route, with the numbers the tooling produced.

Measured by `tests/m1-accessibility.js` against a self-contained instance,
Chrome headless at 1600×1000, signed in as Director Legal (full access, so the
widest possible surface renders).

---

## How an element is classified

Every element on every route is examined. An element enters the inventory if it
is a native control (`button`, `a[href]`, `input`, `select`, `textarea`,
`summary`), carries an **interactive** ARIA role, or computes to
`cursor: pointer`. It then lands in exactly one bucket:

| Disposition | Meaning |
|---|---|
| **NATIVE** | a real control; focusable and operable by definition |
| **ROLE + TABINDEX** | not a native element, but focusable and given an interactive role |
| **CONTAINER WITH CHILD ACTIONS** | a card or row clickable as a mouse convenience that contains its own focusable control doing the same thing |
| **MOUSE-ONLY** | looks and behaves like a control, but a keyboard cannot reach it — **the defect** |
| **DECORATIVE** | inside an `aria-hidden` subtree; not exposed to assistive technology and duplicated by a real control (charts) |

Three earlier counting mistakes were corrected, because a number is only useful
if it measures the right thing:

- A container with `role="tablist"`, `"tabpanel"` or `"group"` was being counted
  as an unreachable control. Those are structure, not controls; only interactive
  roles now count.
- `cursor` is an inherited CSS property, so children of a clickable card were
  each counted again. An element whose parent is already clickable is skipped.
- Clickable SVG arcs inside an `aria-hidden` chart were counted as barriers even
  though the legend beside them offers the same drill-down as real buttons.

---

## Result

| | Before | After |
|---|---:|---:|
| Interactive elements inventoried (28 routes) | 4,770 | 4,733 |
| Native controls | 2,822 | **3,831** |
| Focusable via role + tabindex | 902 | 902 |
| Mouse-only (keyboard-unreachable) | **1,046** | **0** |
| Controls with no accessible name | 20 | **0** |

**Every one of the 28 routes reports 0 mouse-only and 0 unnamed controls.**
`ACCESSIBILITY_DATA.json` holds the machine-readable per-route record.

The inventory total moved because three counting errors were corrected (below)
and because several clickable containers became single controls rather than a
container plus its children.

---

## What was fixed, and why these ones

The 1,046 were not 1,046 separate problems. They were a small number of shared
components rendered on every route, so the fixes are at the component level:

| Component | Instances | Was | Now |
|---|---:|---|---|
| Sidebar navigation (`src/layout.js`) | 276 | `<div onClick>` | `<button>` + `aria-current="page"` on the active route |
| Sortable table headers (`src/parts.js`) | 84 | `<th onClick>` | `<th aria-sort>` containing a `<button>` that names the sort |
| Dropdown trigger (`src/ui.js`) | 56 | `<div onClick>` | `<button aria-haspopup aria-expanded>`, Escape closes and returns focus |
| Breadcrumbs (`src/layout.js`) | 48 | `<span onClick>` | `<button>` |
| Tabs (`src/ui.js`) | 16 | `<div onClick>` | tablist, roving tabindex, arrow/Home/End keys |
| Menu items (`src/ui.js`, settings, contracts) | 24 | `<div onClick>` | `<button role="menuitem">` |
| KPI metric cards (`src/ui.js`, clauses) | 27 | `<div onClick>` | `<button>` when it has an action, plain `<div>` when it is only a figure |
| Document library cards (knowledge, templates) | 419 | `<div onClick>` | `<button>`; folder cards report `aria-expanded` as disclosures |
| Feed rows (dashboard, exec, companies, knowledge) | 34 | `<div onClick>` | `<button>` |
| Chart segments and bars (`src/charts.js`) | 12 | clickable SVG arcs | SVG marked `aria-hidden`; the legend and bars are labelled buttons carrying the same drill-down |

Two fixes are worth stating separately because they are patterns rather than
swaps:

**Nested interactive elements were avoided, not introduced.** A template card
containing its own "N versions" button cannot itself become a button. Those
cards keep the whole-card mouse click and gained a real button on the title, so
a keyboard user has the same primary action without one control inside another.

**A regression was caught by the same sweep.** Making the Dropdown trigger a
button put a `<button>` inside a `<button>` for the notifications bell and the
contract actions menu — invalid markup, and the outer control lost its
accessible name because an icon carries no text. Both triggers are now plain
content with an explicit `label`, and the count of unnamed controls is what
surfaced it.

---

## Keyboard behaviour, driven rather than inspected

These are asserted by operating the real keyboard, not by reading attributes:

| Behaviour | Check |
|---|---|
| Filter trigger takes focus, reports `aria-expanded="false"` | PASS |
| `Enter` opens the panel and moves focus inside it | PASS |
| `Space` on an option applies the filter (native checkbox semantics) | PASS |
| `Escape` closes the panel and returns focus to its trigger | PASS |
| Register tabs form a tablist with one selected tab and a roving tabindex | PASS |
| `ArrowRight` moves to the next register and changes the URL | PASS |
| A record row is focusable, announced as a link, and opens on Enter/Space | PASS |
| A focused control paints a visible focus indicator | PASS |
| Every filter chip has a labelled remove button | PASS |

Filter dropdowns are built from real `<input type="checkbox">` rows rather than
`role="option"` divs. That is deliberate: checkboxes are focusable, toggle on
Space and announce their own checked state, with no ARIA state to drift out of
sync with what is rendered.

---

## Per-route record

`ACCESSIBILITY_DATA.json` carries the full table: for each of the 28 routes,
the number of interactive elements, how many are native, how many are containers
with child actions, how many remain mouse-only, and how many lack an accessible
name — plus every remaining mouse-only element grouped by component with the
routes it appears on.

---

## Status by area

| Area | State |
|---|---|
| Keyboard navigation of core workflows | Navigation, tabs, filters, tables, rows, menus and charts are all operable without a mouse |
| Focus visible | Global `:focus-visible` ring; verified painted on a focused control |
| Focus management in panels | Filter panels and dropdowns move focus in, trap Escape, and return focus to the trigger |
| Tables | Rows focusable with `role="link"` and an `aria-label`; sortable headers are buttons reporting `aria-sort` |
| Charts | Non-pointer equivalent for every clickable chart; SVG marked decorative |
| Forms | Search inputs carry labels (visually hidden where the affordance is an icon) |
| Icon-only controls | All named (0 unnamed across 28 routes) |
| Status not by colour alone | Status, risk and SLA render text in the pill, not colour alone |

---

## Open

No mouse-only or unnamed controls remain on the 28 routes swept.

Not covered by this pass, and therefore not claimed:

- Screen-reader testing with an actual screen reader (NVDA/JAWS/VoiceOver).
- Colour-contrast ratios. The tooling used here does not compute them.
- Reduced-motion and high-contrast rendering beyond the existing
  `prefers-reduced-motion` rules.
- The record-detail modals and document viewer, which were not part of the
  28-route sweep.
