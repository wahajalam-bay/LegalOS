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

Then open:

- **LegalOS** (the legal team) — **http://localhost:4600** (lands on the Executive Overview)
- **Requester Portal** (the business) — **http://localhost:4600/portal/**

Both are served by the same process. Open them in two tabs to watch them talk to
each other: submit a request in the portal and it appears in the Legal Workspace
Triage queue; ask for a document from LegalOS and the requester's tab updates live.

> First load fetches React from a CDN (jsDelivr/esm.sh), so it needs internet
> the first time. Everything else — the design system, charts, icons, data — is
> local and served by a zero-dependency Node server.

To use a different port: `set PORT=5600 && node server.js` (Windows) .

## What's inside

| Module | Route | Highlights |
|---|---|---|
| **Executive Overview** | `/exec` | The board view: hero metrics, department tiles, portfolio by entity, written board note. **Default landing route.** |
| **How It Works** | `/flow-map` | The nine-stage journey with live counts, before/after, and the two-apps diagram |
| **Executive Brief** | `/exec/brief` | Printable one-pager, monochrome safe |
| Operational Dashboard | `/dashboard` | KPIs, risk donut, TAT trend, BU heatmap, funnel, AI insights |
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
| Companies & Entities | `/companies`, `/companies/:id` | Entity registry + single-company "extract everything" view + contract-type drill-down |
| **Legal Workspace** | `/workspace`, `/workspace/:id` | Unified request↔matter command surface, five lenses, drill-down browse, and every record's **Flow** |
| **Contract Tracker** | `/tracker` | Dense operational grid — inline quick-edit, dashboard cards, CSV export |
| **Intake & Repository** | `/repository`, `/repository/:id` | Add/scan → OCR → extraction → Drive link + tracker row + physical record |
| **Data Analyzer** | `/analyzer` | Active PPAs, licence-type rollups, editable extraction, portfolio aggregates |
| **Team Pipelines** | `/pipelines` | Per-person pipelines, team load balance, lifecycle reminders |
| **Requester Portal** (ops) | `/portal` | Legal-side view of the external app: traffic by source, requesters, unread threads, integration contract |
| **Request Form** (admin) | `/settings` → Request Form | End-to-end control of the portal: natures, companies, contract-type matrix, required docs, routing/TAT, branding, publish |

### A second application

| App | Entry | Who it is for |
|---|---|---|
| LegalOS | `/` | The legal department — everything above |
| **Requester Portal** | **`/portal/`** | The business — raise a legal request and follow it end to end |

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

---

## As-built additions (Sprint 3 — "show the machine, not just the meter")

The reframe: the portal used to show **outputs** — dashboards, lists, gauges.
It now shows the **machine**. Every primary object (a Legal Request/Matter, or a
Contract) is presentable as a **workflow spine** with four zones that are always
visible and traversable.

### The WorkflowSpine (North Star)

`src/spine.js` renders — and `src/flow.js` models — four zones from any
Request / Matter / Contract id:

| Zone | What it answers | Contents |
|---|---|---|
| **1 · INPUT** | where it came from | the request-form fields as submitted, the requester, the owning entity, uploaded/**scanned** documents with their OCR confidence and extracted fields, and the prior contract it attaches to |
| **2 · PROCESS** | who holds the ball, and what is delayed | the ordered lifecycle stages with, per stage: state, accountable owner **and** current ball-holder, entry/exit criteria, in/out timestamps, the stage clock, the risk-based review/approval gate, and the artifacts that stage produced. A "you are here" marker, plus a TAT strip naming the **blocking stage** |
| **3 · OUTPUT** | what it produced and where that lives | drafts, executed documents, extracted obligations, and the **three destinations** — Drive/folder link · tracker row · physical record (Sr No + office location) — plus what the record contributes to analytics |
| **4 · RELATIONSHIPS** | everything connected | entity, counterparties, requester, owner, both faces of the record, the contract family (parent/child), related contracts and matters, licences, templates used, negotiation rounds, reviews, the approval chain, litigation, documents and the physical record. Every item click-through |

Embedded as the **default "Flow" tab** on the matter workspace (`/matters/:id`),
the contract workspace (`/contracts/:id`) and the unified record view
(`/workspace/:id`).

### New modules

| Module | Route | What it does |
|---|---|---|
| **Legal Workspace** | `/workspace`, `/workspace/:id` | The department's command surface. A request and its matter are **one continuous record** — the row carries both faces and opens on its Flow. Five lenses over the same filtered dataset: Worklist · Contracts · Compliance · Templating · **Browse** (drill-down: Company/Entity → Type of Contract → records → Flow). Worklist columns are exactly: Request Date · Filed Matter · Requestee · Category · Company/Entity · Due Date · TAT Analysis · TAT Status |
| **Contract Tracker** | `/tracker` | The operational command centre. Dense sortable/filterable grid over the whole book (Sr No · Entity · Type · Counterparty · Category · Sub-division · Owner · Value · PPA Value · Land Value · Start · Expiry · Renewal/Notice · TAT · Physical Record · Office Location · Drive · Stage). Inline quick-edit on Sr No / owner / dates / office location (persists), dashboard cards that **narrow the grid**, and client-side CSV export |
| **Intake & Repository** | `/repository`, `/repository/:id` | The input pipeline made visible: **add or scan → OCR → extraction → repository record → operational fields**. Creates the Drive link *and* the tracker row simultaneously, and maps the **Sr No against the physical record** with its office location. Per-document: editable extracted fields that write back, raw OCR text, re-run extraction, and Drive-style per-user access |
| **Data Analyzer** | `/analyzer` | **Active PPA** (counterparty, PPA value, land value, parcel/plot ref, entity, jurisdiction, expiry) · **Types of Licenses** rollup by type and jurisdiction with validity · **Extraction** panel (editable fields per document, write-back, re-run, and a bulk re-extract over the filtered set) · **Aggregates** (total PPA and land value, portfolio value by entity/jurisdiction/type/sub-division, expiring-value radar, extraction confidence) |
| **Team Pipelines** | `/pipelines` | Per-individual pipeline (kanban by lifecycle stage, per-card TAT health and days-in-stage), the GC's team overview (load balance, delayed items per person, worst blocker), and the lifecycle-reminder feed grouped by owner |
| **Requester Portal** | `/portal` | Preview of the Legal Requests module *as the requestee sees it* — own submissions only, stage + ball-holder + target date, and the integration contract on screen |

### The TAT engine (`src/tat.js`)

Turnaround is **auto-fixed, never negotiated**. At triage the engine reads
`type × risk` from `TAT_MATRIX` (working days, scaled by request type), stamps
the clock, and every list, card and spine reads the same verdict:

- **On Track** · **Due Today** · **Delayed (+n working days, blocked at ‹stage›)**
- The clock runs on **working days** (Fri/Sat weekend) and **pauses** whenever the
  ball sits with the business or the counterparty — legal is not charged for time
  it cannot spend. A record blocked *at* a legal stage keeps accruing and is shown
  as blocked, so delays stay visible rather than being paused away.

### The Master Filter Bar (`src/shared.js`)

Built once, wired into **Legal Workspace, Contracts, Compliance, Licenses,
Reviews, Tracker, Analyzer and Pipelines**. Dimensions: All Units · All
Departments · Company/Entity · Type of Contract · Legal Sub-division · Category ·
Team member · Status · Risk tier · TAT status, plus a **date-range control that
works on any date field** (expiry, due, request date, execution date) with quick
presets (Expiring ≤30/60/90d, Overdue, This month, This quarter), a sort control
(due date · TAT health · value · expiry · last activity · Sr No · title, asc/desc),
removable active-filter chips, Clear all, and **named saved views**. The last-used
filter set persists per module.

### Data-model additions

- Entity portfolio (**Zameen.com** · **OLX Pakistan** · **Bayut** · **Dubizzle** ·
  **Propsults** · **Propenta** under a **Group Holding** parent), jurisdiction-tagged,
  plus KSA/PK counterparties and vendors
- `CONTRACT_TYPE_REGISTER` — PPA · SPA · Ejar Lease · Tenancy · Musataha ·
  Development/JV · Brokerage & Agency · Off-plan/Wafi · Construction ·
  Land/Plot Purchase · Marketing & Listing · Vendor MSA · Employment ·
  NDA/MoU/LOI · SLA · License
- `LEGAL_SUBDIVISIONS`, `OFFICE_LOCATIONS`, `FX_TO_USD`
- Contract fields: `ppaValue, landValue, landRef, srNo, physicalRecordRef,
  officeLocation, driveLink, storagePath, extractedFields{}, extractionConfidence,
  parentContractId, renewalNoticeDays, access[]`
- `repository` slice (file meta · `ocrText` · extracted fields · drive link ·
  tracker link · Sr No · physical location · access), `savedViews`, `reminders`
- `TAT_MATRIX`, `LIFECYCLE_PATHS`, `STAGE_META`, `RISK_GATES`, `REMINDER_MILESTONES`
- ~29 seeded KSA/PK real-estate contracts (PPAs with PPA/land values in SAR & PKR,
  Ejar leases, Musataha, Wafi escrow, construction + a variation-order child,
  brokerage, plot purchases, listing agreements, JVs) and 12 repository documents
  with OCR text; licences retagged to the operating entities (REGA, RERA, Ejar,
  ZATCA, MISA, Balady, CR, SECP, PLRA, PSEB, SAIP/IPO, Trakheesi, FBR, PRA)

### Request-form integration contract (Workstream J)

The requester-facing form will be a **separate app**. The boundary is already in
place so it drops in without refactoring:

1. **Shared schema** — `data.js#LEGAL_REQUEST_SCHEMA` is the single canonical
   `LegalRequest` shape used by both the internal workspace and the external form:
   `{ id, requestType, contractType, category, subdivision, entityId, companyTags,
   department, unit, requestDate, dueDate, tat, requesterId, owner, description,
   attachments[], linkedContractId, riskPreliminary, stage, stageLog, status,
   matterId, source }`
2. **Submission handoff** — `store.js#submitLegalRequest(payload)` is the **only**
   writer of new requests. It validates, assigns the id, creates the unified
   Request/Matter record, runs the counterparty/duplicate check, auto-fixes the TAT
   from `TAT_MATRIX`, and drops the record into **Triage** on the department side.
   Returns `{ ok, id, record, tat, duplicates, owner }`. The real endpoint plugs in
   at the marked `// external request-form endpoint seam`.
3. **Status polling** — `store.js#requesterView(requesterId)` returns only that
   requester's own submissions, newest first. The portal renders stage,
   ball-holder and target date from these and never exposes internal notes.
4. `src/intake.js` is the **one** intake form — the internal workspace and the
   portal preview render the same component against the same schema and submit
   through the same function, which is what makes the round-trip real:
   form → `submitLegalRequest` → Legal Workspace Triage → status back to the requester.

The same three points are viewable in-app via **Requester Portal → Integration contract**.

### Integration seams (marked in code)

| Seam | Location |
|---|---|
| OCR provider | `pages/repository.js#simulateOcr` |
| Field extraction model | `data.js#extractFromOcr` |
| Google Drive / server / folder storage | `pages/repository.js` (`driveLink` + `storagePath` on create) |
| Drive-style ACLs (view / comment / edit) | `pages/contracts.js#AccessTab`, `pages/repository.js` access tab |
| External request-form endpoint | `store.js#submitLegalRequest` |

### New/changed files

New: `src/tat.js`, `src/flow.js`, `src/spine.js`, `src/reminders.js`,
`src/intake.js`, `src/pages/workspace.js`, `src/pages/tracker.js`,
`src/pages/repository.js`, `src/pages/analyzer.js`, `src/pages/pipelines.js`,
`src/pages/portal.js`.
Extended: `data.js`, `store.js`, `shared.js` (Master FilterBar), `nav.js`,
`main.js`, `router.js`, `layout.js`, `core.js`, `assets/styles.css`, and the
dashboard / requests / matters / contracts / companies / licenses / compliance /
reviews pages.

Everything from the earlier sprints still works: Kanban drag-drop, the intake
wizard, request→matter conversion, approvals approve/reject, the workflow-builder
canvas, copilot canned responses, template version diff, license auto-notifications,
company tag views and the overlap engine. **Every previous route keeps its URL.**

---

## As-built additions (Sprint 4 — the Requester Portal)

The business-facing **Request Form**: the Legal Requests module rendered *for the
requestee*. A **separate application** with its own entry point, shell and session
— connected to LegalOS and talking to it in real time.

### Where it lives

| | |
|---|---|
| **Portal URL** | **`http://localhost:4600/portal/`** (deep links work: `/portal/#/requests`, `/portal/#/new`, `/portal/#/requests/REQ-2050`) |
| Entry point | `portal/index.html` → `src/portal/main.js` — its own import map, boot screen and error trap |
| Shell | Own requester topbar, branding, theme toggle and session. **No legal sidebar, no internal modules.** |
| Legal-side view | `/#/portal` in LegalOS — portal operations: traffic by source, registered requesters, unread threads, outstanding document asks, and the integration contract |
| Admin control | `/#/settings` → **Request Form** |

Served by the same zero-dependency `server.js` (which now resolves directory
indexes and falls back to the **portal's** shell for deep links under `/portal`,
not LegalOS's).

### How the two apps talk

The portal is a separate app that **imports the shared data contract** from
`/src` — the `LegalRequest` schema, `submitLegalRequest()`, the store slices and
the chat bridge — so it can be split into its own deployable without a rewrite.
For the prototype both apps share one store (and therefore `localStorage`), which
is what makes the round-trip live in a demo: a submission appears in LegalOS
Triage instantly, and a reply or a document request flows straight back to the
requester. Because they are separate browser tabs, the store also listens for the
`storage` event and re-hydrates, so **legal asking for a document updates the
requester's open tab with no reload and no polling** — and vice versa. Every call
already funnels through `src/store.js`, so making the split real means replacing
those function bodies with HTTP; nothing in either UI changes:

```
submitLegalRequest      POST   /api/requests
requesterView           GET    /api/requests?requester=:id
addRequestAttachment    POST   /api/requests/:id/attachments
requestRequiredDoc      POST   /api/requests/:id/required-docs
fulfilRequiredDoc       PATCH  /api/requests/:id/required-docs/:docId
postMessage             POST   /api/requests/:id/messages
getFormConfig           GET    /api/form-config
```

The single boundary is marked `// portal ↔ LegalOS API seam` in `store.js`.

### The shared data contract

| Piece | Where | What it is |
|---|---|---|
| `LegalRequest` | `data.js#LEGAL_REQUEST_SCHEMA` | The one canonical request shape, now also carrying `natureOfMatter · company · contractType · requestType · requesterEmail · source · channel · requiredDocs[] · messagesCount · routedManually` |
| `submitLegalRequest(payload)` | `store.js` | The **only** writer of new requests. Validates → assigns the id → creates the unified Request/Matter → runs the counterparty/duplicate check → auto-fixes the TAT (type × risk, or the per-nature routing default) → pre-loads the required-document checklist from the admin template → turns portal attachments into repository documents → drops it into **Triage**. Returns `{ ok, id, record, tat, duplicates, owner }` |
| `messages` slice | `src/messages.js` | `{id, requestId, from, role: requester\|legal, text, attachments, at, readBy[]}` plus **one `<ChatThread />` component rendered by both apps**, so a message sent from either side appears on the other |
| `formConfig` slice | `data.js#FORM_CONFIG` | Everything the form asks — the portal reads its entire structure from here |
| `requesters` slice | `store.js#findOrCreateRequester` | `{id, email, name, company, source, department, unit, userId}`, find-or-create by email, session in `legalos-portal-session` |

### The requester experience

1. **Sign in** — email + name, plus the auto-captured **source** (which company /
   site the request is raised from). Returning emails are recognised and
   pre-filled. Both values stamp every request and every chat message.
   Marked `// SSO / auth seam` — production takes the verified email from the token.
2. **Guided flow** — **Nature of Matter** (Contracts · Advice · Compliance ·
   Disputes & Litigation · Labour Matters · Intellectual Property) → **Company /
   Entity** (Zameen.com (ZD) · OLX · Zameen Media · Bayut KSA · Dubizzle KSA ·
   Z Property Developments) → **Type of Contract**, showing *only* the types mapped
   to that company → **request type, details and uploads** → **review & submit**.
   Only **Contracts** walks the full flow this sprint; the other five are
   selectable and still create a complete record flagged **routed manually**, so
   nothing is lost.
3. **Their panel** — their own requests only, with Request ID · Nature · Company ·
   Contract Type · Raised · Target · TAT status · stage · unread badge, and filters
   for status / company / nature.
4. **Request detail** — a **read-only requester-facing spine**: internal stages
   collapse into plain language ("Under legal review", "In negotiation with the
   counterparty"), the ball-holder shows as *you* / *Legal team* / *Counterparty*,
   and internal notes, risk scoring and privileged analysis never cross over.
   A requester opening someone else's request id is blocked.
5. **Documents & the missing-doc loop** — upload at submission or any time after.
   When legal asks for a document it appears as a highlighted prompt at the top of
   the request; uploading it flips the checklist to *received* on both sides and
   notifies legal. Files land in the repository and in the internal spine's Input zone.
6. **Chat** — a thread per request, on the requester's detail and on the legal
   side's **Requester** tab, with unread badges both ways.

### Admin control of the form (Settings → Request Form)

Legal changes the live form with **no code change and no deploy** — the portal
reads its whole structure from `formConfig`:

- **Nature of Matter** — show/hide each option, and mark which have a full flow
- **Companies** — add/rename/disable options and map each to a registry entity
- **Company × Contract-Type matrix** — the clickable grid that decides exactly
  which contract types appear at Step 3 for each company
- **Request types**, **required-document templates** per contract type (these
  pre-load the missing-doc checklist), **routing & TAT defaults** per nature
- **Branding** (name, logo initials, tagline, default theme) and a
  **publish / unpublish** toggle — unpublished shows requesters a holding page
- Reset-to-defaults, and a live preview link

Admin edits are **preserved across releases**: `formConfig` is an object-shaped
slice, so the defensive merge keeps the saved configuration and only backfills
keys it predates rather than resetting it to the seed.

### Request Log (inside LegalOS)

`/#/workspace` → **Request Log** lens — the department's auditable record of every
incoming request, portal and internal side by side: logged timestamp, channel,
**source**, requester + email, entity, contract type, stage, TAT, message count,
document count, outstanding asks, and a link into the matter. Portal traffic also
raises notifications in the LegalOS bell (new submissions, requester replies,
documents received).

### New/changed files

New: `portal/index.html`, `src/portal/main.js`, `src/portal/auth.js`,
`src/portal/wizard.js`, `src/portal/panel.js`, `src/messages.js`.
Extended: `data.js` (formConfig + registers + 2 entities + 5 contract types),
`store.js` (portal API, cross-tab sync, object-slice merge), `flow.js`, `spine.js`,
`server.js`, `assets/styles.css`, `pages/settings.js` (Request Form admin),
`pages/workspace.js` (Requester tab + Request Log), `pages/matters.js`
(Requester tab), `pages/portal.js` (now the legal-side operations view),
`layout.js` (portal notifications).

---

## As-built additions (Sprint 5 — the CEO cut)

A polish and presentation sprint, not a feature sprint. The system already worked;
this makes it **narrate itself** so the value is legible in five minutes to someone
who will never click through twenty modules.

House style for everything a leader reads: plain English, no internal jargon, no
em dashes. The operational modules keep their own language.

| Surface | Route | What it is |
|---|---|---|
| **Executive Overview** | **`/exec`** (the default landing route) | The one screen a CEO sees first. Four hero numbers, six department tiles, where the value sits, who does the work, and a written board note. Every number carries a plain-English "so what" and clicks through to its detail. |
| **How It Works** | `/flow-map` | The nine-stage journey from a business request to a filed contract, with **live counts**, the input / system action / output for each stage, honest before-and-after cards, and the two-apps diagram. |
| **Guided tour** | any screen, "Tour" in the topbar | Nine steps that drive the app for the viewer: spotlight, one-sentence caption, arrow-key control, skip and resume. |
| **Executive Brief** | `/exec/brief` | A printable one-pager to forward. Monochrome safe, fits one page. |
| **Presentation mode** | `/settings` → Presentation mode | Demo reset back to the seeded state, so a walkthrough always opens on the same numbers. |

`/dashboard` keeps its URL and its content for the operational team; it is now
labelled "Operational Dashboard" in the sidebar.

### The charts were rebuilt to a method, not to taste

The previous chart palette **hard-failed** a colourblind-safety check: it cycled ten
hues including three near-identical greens (`#0d7a3f` / `#10935a` / `#27a96d`) that
measure ΔE 6.7 apart, which a reader with full colour vision cannot reliably tell
apart, let alone a colourblind one. Several charts also coloured nominal bars by
their own value, which spends the identity channel re-encoding what bar length
already shows.

What replaced it:

- A **five-slot categorical palette derived from the app's own hues** and validated
  with a script against both real surfaces, not eyeballed. Order
  green → blue → orange → violet → magenta. Worst adjacent CVD ΔE **17.3 light /
  15.9 dark** against a ≥ 8 target; worst normal-vision ΔE **19.5 / 19.3** against
  a ≥ 15 floor; lightness band, chroma floor and 3:1 contrast all pass in both modes.
- Dark steps are **selected for the dark surface**, not flipped from light.
- Teal was dropped from the series set (teal↔blue measure only ~10.7 normal-vision
  ΔE, a floor that secondary encoding cannot excuse) and stays the accent for
  non-series use. Status hues stay reserved so a series never impersonates a status.
- **No cycling.** `seriesColor(i)` folds past the last slot into a de-emphasis grey,
  and `foldSeries()` aggregates a long tail into one named "Other" slice.
- Nominal bars now take **one hue**; magnitude is carried by length alone.
- Live in `assets/styles.css` as `--viz-1..5` and `--viz-other`, so both themes swap
  in one place. `src/execviz.js` holds the exec primitives: hero stat tile, rank
  bars, capped share donut, meter, sparkline, and a **table twin** on every chart so
  no value is colour-only or hover-only.

### New/changed files

New: `src/pages/exec.js`, `src/pages/flowmap.js`, `src/execviz.js`, `src/tour.js`.
Extended: `charts.js` (validated palette, fold-not-cycle), `assets/styles.css`
(exec / flow map / tour / brief + print rules), `store.js` (one-shot workspace
deep-link target, `resetDemo()`), `shared.js` (`useFilters(..., {force})` so a deep
link beats the saved filter set), `router.js` + `main.js` (landing route and URL
normalisation), `nav.js`, `layout.js` (topbar Tour button, tour overlay),
`pages/settings.js` (Presentation mode), and the analyzer / pipelines / portal
charts re-palette.

## Presenting to leadership

**The five-minute walkthrough.** Before you start, optionally reset the data:
`/#/settings` → Presentation mode → Reset to the seeded demo data.

1. Open **`http://localhost:4600`**. It lands on the Executive Overview.
2. Read the four hero numbers, then click **Take the 5 minute tour** and press the
   right arrow through all nine steps. The tour drives the app itself: exec overview
   → flow map → the portal → a live record's flow → what is late and why → the
   tracker → the analyzer → renewal reminders → back to the overview.
3. Finish on **Executive brief** and print or save it as the leave-behind.

**The showstopper: the two-tab round trip.** This is the moment that lands, because
the audience watches two separate applications talk to each other.

1. Tab A: `http://localhost:4600/portal/` — sign in with any work email, pick a
   site, then **New request → Contracts → Bayut KSA**. Point out that only Bayut's
   eight mapped contract types appear. Complete and submit.
2. Tab B: `http://localhost:4600/#/workspace` → **Request Log**. The submission is
   already there with the requester's email and the site it came from.
3. Open the record, go to the **Requester** tab and ask for a document.
4. Switch back to Tab A **without reloading**. The request now shows the ask, live.
   Upload it, then watch the checklist flip to received in Tab B.
5. Send a message from each side to show the shared thread.

**If somebody asks "can legal change the form themselves?"** — `/#/settings` →
Request Form → Contract-type matrix. Untick a cell, reload the portal's step 3, and
the option is gone. No code, no deploy.

## Live connections — Google Drive + email (Sprint 6)

Up to this point LegalOS held everything in the browser's `localStorage`. It now
has a server-side layer (`api/`) so it can read the legal department's real
document library and send mail as `legal.os@zameen.com` — neither of which a
browser can do, because neither a Google key nor a mailbox password can safely
be shipped to one.

- **Knowledge base = the Drive folders shared with LegalOS, read-only.**
  `api/drive.js` discovers every folder shared with the service account and
  mirrors them all — sharing a folder is the whole act of adding it. Live since
  2026-09-13: 3,476 documents, 856 folders, 11 GB across commercial, compliance,
  litigation and projects. Search goes through Drive's own full-text index,
  which already covers the text *inside* PDFs — so a query matches document
  contents, not just filenames, with no PDF parser in this codebase. The service
  account holds `drive.readonly`, so nothing here can alter a legal document.
- **Email is send-only, and off by default.** `api/mail.js` is a small SMTP
  client (SMTP is a line protocol; it needs no library). While `mail.enabled` is
  false the send path runs end to end but stops before the wire.
- **Identity is now real.** `api/access.js` verifies the Cloudflare Access signed
  assertion — signature, audience, issuer, expiry — and maps the verified email
  onto the roster in `src/data.js`. Every `/api` answer is scoped to that person
  regardless of which persona the UI is displaying.

Still zero npm dependencies: Node 18 built-ins provide `fetch`, RSA signing and
verification via `crypto`, and TLS sockets.

Commissioning it — the three credentials, and why identity comes from a
signature rather than a header — is in **`deploy/CONNECTIONS.md`**.

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
  server.js            zero-dep static server + /api mount
  index.html           import map + boot
  assets/styles.css    design system
  api/                 the server-side layer (zero-dep, Node built-ins only)
    router.js          the /api surface; authenticated on every route but health
    access.js          verifies the Cloudflare Access signed assertion
    identity.js        verified email -> the roster in src/data.js -> role
    google.js          service-account JWT -> Drive access token
    drive.js           read-only mirror + search of the Drive knowledge folder
    mail.js            SMTP client for legal.os@zameen.com
    config.js          reads config/ (gitignored, never served)
  config/              SECRETS — service-account key, mailbox password (gitignored)
  portal/
    index.html         the Requester Portal's own entry point (separate app)
  src/
    portal/
      main.js          portal shell + router + session
      auth.js          requester sign-in (email + name + captured source)
      wizard.js        the guided request flow (config-driven)
      panel.js         own-requests list + requester-facing request detail
    messages.js        the two-way chat bridge (shared by BOTH apps)
    execviz.js         exec chart primitives (validated palette, table twins)
    tour.js            the nine-step guided tour
    core.js            React/htm bootstrap, formatters
    api.js             browser client for /api (knowledge base, mail, identity)
    icons.js  ui.js  charts.js  parts.js
    data.js            seed data + registers (entities, contract types, TAT matrix,
                       lifecycle paths, stage meta, LegalRequest schema)
    tat.js             TAT engine — working days, type x risk, pause, verdict
    flow.js            WorkflowSpine model — record identity + the four zones
    spine.js           <WorkflowSpine /> — the component
    reminders.js       lifecycle reminders (renewals, notice windows, obligations)
    intake.js          the ONE intake form (internal + external portal)
    shared.js          category/tag primitives + the Master FilterBar
    overlaps.js        overlap engine
    nav.js  router.js  layout.js  main.js  store.js
    pages/             25 modules
```

All data is fictional (company "Northwind Global Holdings"). No real records.
