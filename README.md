# LegalOS — Enterprise Legal Operating System

An AI-native operating system for corporate legal departments. This is a fully
interactive, production-styled front-end prototype covering the whole platform:
intake → matters → contract lifecycle → reviews → approvals → negotiations →
templates & clauses → knowledge → litigation → compliance → analytics → AI
copilot → no-code workflow builder.

Built to feel like Linear × Stripe × Notion × Palantir — premium, fast, minimal.

## Run it (localhost)

You need **Node.js** (already installed — v24). No `npm install` required.

**Easiest:** double-click **`Start LegalOS.bat`**, then open the URL it prints.

**Or from a terminal:**

```bash
cd "C:\Users\Muhammad Ashhad\Desktop\legalos"
node server.js
```

Then open **http://localhost:4600**

> First load fetches React from a CDN (jsDelivr/esm.sh), so it needs internet
> the first time. Everything else — the design system, charts, icons, data — is
> local and served by a zero-dependency Node server.

To use a different port: `set PORT=5600 && node server.js` (Windows) .

## What's inside

| Module | Route | Highlights |
|---|---|---|
| Executive Dashboard | `/dashboard` | KPIs, risk donut, TAT trend, BU heatmap, funnel, AI insights |
| Legal Requests | `/requests` | Kanban (drag & drop), list, dynamic intake form |
| Matters | `/matters` | List + Linear-style matter workspace with right rail |
| Contracts (CLM) | `/contracts` | Portfolio + doc workspace: clause navigator, AI review, versions, approvals |
| Reviews | `/reviews` | AI-assisted review queue + issue drawer |
| Approvals | `/approvals` | Approval chains, live approve/reject |
| Negotiations | `/negotiations` | Redline comparison, versions, AI suggested position |
| Templates | `/templates` | Document automation with conditional "smart rules" |
| Clause Library | `/clauses` | AI clause generator + governed clause catalog |
| Knowledge Base | `/knowledge` | Natural-language search, playbooks, opinions, SOPs |
| Litigation | `/litigation` | Case tracker, exposure, hearings, counsel |
| Compliance | `/compliance` | Regional posture, scores, gauge, upcoming reviews |
| Reports | `/reports` | Operations / Risk / Productivity / Financial analytics |
| AI Copilot | `/copilot` | Full chat workspace, grounded on your data |
| Workflow Builder | `/automation` | Node canvas: triggers, conditions, AI, approvals, SLAs |
| Organization | `/organization` | People, teams, business units, entities |
| Settings | `/settings` | RBAC roles, SSO/MFA, integrations, AI controls |
| Licenses | `/licenses` | Regulatory licenses & registrations — auto validity status, renewal alerts (KSA/UAE/PK) |
| Companies | `/companies`, `/companies/:id` | Company registry + single-company "extract everything" view |

Global: permanent sidebar, top command bar, **⌘K / Ctrl+K command palette**,
global search, notifications, light/dark theme toggle, and a floating **AI Copilot**
dock available on every screen.

## As-built additions (additive sprint — v2)

Seven features layered on **without changing any existing module, route or behavior**.
New persistent slices (`licenses`, `companies`, `templates`) follow the same
`localStorage` pattern; the store now does a **defensive merge** so an existing
`legalos-store-v1` is upgraded (missing slices seeded, new fields backfilled onto
seed records) without wiping user-created requests / matters / contracts.

| # | Feature | Where | Notes |
|---|---|---|---|
| 1 | **Licenses & Registrations** | new module `/licenses` (sidebar → Risk & Governance, badge = expiring/expired count) | Validity (**Valid / Expiring Soon / Critical / Expired**) is *computed at render* from `expiryDate`, never stored. Boot-time auto-notifications (de-duped by `licenseId+status`), Dashboard KPI + "License Alerts" card, detail Drawer with validity timeline, renewal history and **Mark renewed**. KSA/UAE/PK seed (REGA, RERA, Ejar, ZATCA, MISA, Balady, CR, SECP, PLRA, PSEB, SAIP/IPO trademarks, Civil Defense, DED). |
| 2 | **Contract spend / expense-out** | Contracts module | New **Spend** tab (summary strip + burn gauge that turns amber >80% / red >100%, expense table, **Add expense** → persists & recomputes), a burn column on the list, and a Dashboard spend insight. ~15 seeded contracts (10–105% utilization; one overspent). |
| 3 | **Reviews overlap detection** | Reviews module + `overlaps.js` | Deterministic (no AI): 2+ open reviews/matters/negotiations sharing a company tag or contract. Overlap **Pill** on rows, **Overlaps** panel in the drawer (click-through), summary **AICard**. Seeded overlaps: Al-Faisal (2 reviews + 1 matter), plus ACWA & AWS (review + matter + negotiation). |
| 4 | **Negotiation history** | Negotiations module (+ condensed mirror in Contract workspace) | Per-deal `rounds` with clause-by-clause **from → to** changes; new **History** tab (Timeline, expandable), round-counter Pill, **Log round** modal (persists). 2–4 seeded rounds per active deal. |
| 5 | **Template version control** | Templates module | Per-template `versions` (Approved/Draft/Retired), version Pill on cards, **Version history** Drawer with changelog, **Compare** view (tiny LCS line-diff, added-green / removed-red), **Restore as new draft** (persists). Generate modal shows the approved version it would use. |
| 6 | **Work categories** (taxonomy) | Requests · Matters · Contracts · Reviews + Dashboard | Orthogonal `category` field (8 canonical categories in `data.js`) — multi-select filter chips, category field in intake/new-matter/new-contract, colored category Pill everywhere, "Work by category" Dashboard card. |
| 7 | **Company tags** | every record + new module `/companies`, `/companies/:id` | Canonical `COMPANIES` registry; `companyTags[]` on contracts/matters/requests/reviews/litigation/licenses. Tag chips everywhere, tag editor (searchable multi-select + inline create), ⌘K searches companies, and a per-company view that extracts every tagged record (contracts · value · spend · matters · reviews · litigation · licenses). |

New/changed files: `src/pages/licenses.js`, `src/pages/companies.js`, `src/shared.js`
(category + tag primitives), `src/overlaps.js` (overlap engine); extended `data.js`,
`store.js`, `nav.js`, `main.js`, `layout.js`, `assets/styles.css`, and the
requests / matters / contracts / reviews / negotiations / templates / dashboard pages.

## Tech

- React 18 (via ESM import map — no build step)
- **htm** for JSX-free templating
- Hand-built CSS design system (`assets/styles.css`) — tokens, both themes
- Custom SVG charts (`src/charts.js`) — donut, area, stacked bar, funnel, gauge, heatmap
- Inline SVG icon set (`src/icons.js`)
- Zero-dependency Node static server (`server.js`)

## Structure

```
legalos/
  server.js            zero-dep static server
  index.html           import map + boot
  assets/styles.css    design system
  src/
    core.js            React/htm bootstrap, formatters
    icons.js  ui.js  charts.js  parts.js
    data.js            realistic enterprise legal seed data
    nav.js  router.js  layout.js  main.js
    pages/             17 modules
```

All data is fictional (company "Northwind Global Holdings"). No real records.
