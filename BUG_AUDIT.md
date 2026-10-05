# LegalOS — bug audit

Every bug below was **reproduced**, **root-caused**, **fixed**, and **re-tested**, and the
adjacent suites were re-run afterwards. Severity: P0 system/data/security · P1 critical
workflow · P2 major functional · P3 usability · P4 cosmetic.

---

## BUG-001 — Register API ignored permissions (access-control bypass)

- **Module:** API / Users & Access · **Severity: P0**
- **Reproduction:** Sign in as Sana Hurmat (`compliance: edit`, `litigation: none`,
  `commercial: none`). `GET /api/registers/litigation` with her session cookie.
- **Expected:** 403. **Actual:** `HTTP 200`, **331 litigation cases**; `contracts` returned
  all 1,341. The navigation hid the modules, but the data was fully retrievable.
- **Root cause:** `api/router.js` gated the whole `registers` branch on
  `me.canReadKnowledge` — "are you in Legal" — and never consulted the caller's effective
  permission groups. Hiding a nav row is not access control.
- **Fix:** each register family is mapped to its owning permission group
  (contracts/properties→commercial, litigation/notices→litigation,
  licences/loans/resolutions→compliance) and checked against
  `permissions.effectiveFor(me)`. The summary endpoint is scoped the same way, so counts
  and source filenames for a book you may not open are not leaked either.
- **Verification:** compliance-only → licences/resolutions 200, litigation/contracts/notices
  403. Litigation-only → litigation/notices 200, rest 403. Commercial-only → contracts 200,
  rest 403. Super admin → all 200.

## BUG-002 — A throttled Drive crawl wiped the register cache

- **Module:** Ingest / Google Drive · **Severity: P0 (data loss)**
- **Reproduction:** Let a rebuild run while Drive is returning HTTP 429. Read
  `config/.registers.json`.
- **Expected:** the previous good book is kept. **Actual:** the register was overwritten
  with a partial ingest — **licences 7 → 0, properties 38 → 0**, contracts 1,371 → 1,060,
  resolutions 914 → 457. `/m/licenses` then rendered "0 Records · No records".
- **Root cause:** Drive throttling shrinks the file index, which shrinks the candidate
  workbook list, which produces a smaller register — and `rebuild()` saved it
  unconditionally. Whole modules went empty with nothing saying why.
- **Fix:** three layers. `listChildren` retries 429/5xx with exponential backoff; a failed
  folder listing is recorded as a failure instead of being swallowed as "empty folder"; a
  degraded crawl never overwrites a healthy Drive index; and `rebuild()` refuses to replace
  a healthy register when the new pass is materially smaller (or loses a whole family)
  while Drive is unhealthy — it keeps the old book and records `lastDegradedIngest`,
  surfaced on Data Health.
- **Verification:** `/m/licenses` renders 7 again; live counts hold at 1,371 / 357 / 255 /
  7 / 192 / 914 / 38.

## BUG-003 — Every money figure in the system was labelled in dollars

- **Module:** Shared formatting · **Severity: P1**
- **Reproduction:** Open Contracts. The KPI read **`$947.0M`**.
- **Expected:** PKR — every register in this system is Pakistani.
- **Actual:** `$` on rupee figures across Contracts, Dashboard, Companies, Analyzer and
  Litigation; captions said "USD eq." and "Total PPA value (USD)".
- **Root cause:** `fmt.money(n, currency = "USD")` in `src/core.js` — the default. Most
  call sites pass no currency.
- **Fix:** default changed to PKR (genuine foreign values still pass a currency
  explicitly), unknown-code fallback changed from `$` to `PKR`, and the mislabelled
  captions corrected.
- **Verification:** automated scan of `/contracts`, `/exec`, `/companies`, `/analyzer`,
  `/litigation` — **0 `$` figures**, 121 PKR figures on Contracts alone.

## BUG-004 — Donut charts were not clickable (drill-down dead app-wide)

- **Module:** Shared charts · **Severity: P2**
- **Reproduction:** Litigation → click any segment of "Cases by Stage". Probed at 8
  positions around the ring.
- **Expected:** the register filters to that stage and a filter chip appears.
- **Actual:** nothing — no chip, no change, on every segment. The bars ("Cases by Type")
  worked, so the page logic was fine.
- **Root cause:** the donut's centre-label overlay is `position:absolute; inset:0` and is
  painted **over** the SVG ring. With no `pointer-events`, it intercepted every click. The
  segments still showed `cursor:pointer` and a tooltip, so the chart looked interactive.
- **Fix:** `pointer-events: none` on the centre overlay in `src/charts.js` — one line, and
  it repairs every donut in the app (litigation, compliance, exec, analyzer).
- **Verification:** clicking a segment now yields `Stage: … ✕` and filters the table;
  clicking again clears it.

## BUG-005 — The user menu was off-screen on a phone

- **Module:** Shell / topbar · **Severity: P2**
- **Reproduction:** 390 × 844 viewport, any page. Measure the topbar avatar.
- **Expected:** inside the viewport. **Actual:** `right: 468px` against a 390px viewport —
  **78px off-screen and unreachable**, with no horizontal page scroll to get to it.
- **Root cause:** crumbs + search + New + Tour + theme + notifications + avatar on one
  row; the mobile media query only reduced padding.
- **Fix:** below 640px the search/New buttons drop their labels and the Tour button is
  hidden; below 420px the search button is hidden. Identity, notifications and navigation
  always survive.
- **Verification:** avatar now at `right: 376px` in a 390px viewport.

## BUG-006 — Inline grid layouts never collapsed on small screens

- **Module:** Shared CSS · **Severity: P2**
- **Reproduction:** Users & Access and Data Health at 390px and 834px.
- **Root cause:** those pages set `grid-template-columns` **inline** (`1fr 420px`,
  `1fr 1fr`) to build a body+rail split. An inline style beats the `.grid--2/3/4` class
  rules, so the responsive breakpoints could not apply.
- **Fix:** below 820px, `.page .grid` collapses to a single column (and sticky rails go
  static). Tables keep their own horizontal scroller.
- **Verification:** five viewports × seven routes — no element overflows outside a
  scrollable ancestor, page overflow 0 everywhere.

## BUG-007 — Tab rows could not be scrolled when they overflowed

- **Module:** Shared UI · **Severity: P3**
- **Root cause:** `.tabs` was `display:flex` with no `overflow-x`, so tabs past the edge
  were unreachable on narrow screens.
- **Fix:** `overflow-x: auto` with the scrollbar hidden.

## BUG-008 — Legal Copilot advertised invented corpus counts

- **Module:** Copilot · **Severity: P3 (fabricated content)**
- **Actual:** "Grounded on **1,284 contracts, 12 matters, 14 clauses**" — string literals.
  The real book is 1,371 contracts.
- **Fix:** counts read from `useRegister("contracts")` and the matters/clauses collections;
  the canned reply no longer quotes numbers.

## BUG-009 — Negotiations showed invented statistics

- **Module:** Negotiations · **Severity: P3 (fabricated content)**
- **Actual:** `"3.2" Avg. rounds` and `4 In your court` were constants, and the total was
  converted **into USD** then rendered with the default symbol.
- **Fix:** average rounds computed from the deals on screen, "in your court" derived from
  `ballWith`, and the total reported in PKR.

## BUG-010 — Dashboard portfolio value carried a fake trend

- **Module:** Dashboard · **Severity: P3 (fabricated content)**
- **Actual:** `trend="+14%" trendDir="up"` hardcoded on Portfolio Value.
- **Fix:** removed — no trend is shown rather than an invented one.

## BUG-011 — Litigation stage legend showed a bare dash

- **Module:** Litigation · **Severity: P4**
- **Actual:** the "Cases by Stage" legend and filter chip showed `—` for cases whose
  tracker status cell is empty, which reads as a rendering fault.
- **Fix:** displayed as **Unspecified**. The underlying value is untouched.

---

# Fixed earlier in the same stabilisation effort

| ID | Severity | Summary |
|---|---|---|
| BUG-012 | **P0** | **View-As leaked the viewer's permissions** — previewing any user rendered them with the *admin's* super-admin grants, so every restricted account appeared to see everything. Permissions now belong to the rendered identity. |
| BUG-013 | P1 | `/access` (Users & Access) was ungated in the legacy permission branch and fell through to a permissive `return true`. The whole admin group is now head-only there. |
| BUG-014 | P1 | **Record ids were array indices** — ids shifted whenever a tracker gained a row, so a shared detail URL later opened a different contract. Ids are now hashed from (Drive fileId, sheet, row). |
| BUG-015 | P1 | **Fabricated contract detail** — an invented agreement body, a hardcoded `v3.0/v2.1/v1.0` version history, four fixed approvers including "Klaus Werner" (not on the roster), and "4 comment threads". All removed. |
| BUG-016 | P1 | **Document caps silently truncated** the Documents tab (25 per case, 40 per folder, 60 per folder-segment, 6 fuzzy). 551 contracts sat at exactly 6. Deterministic links are now uncapped. |
| BUG-017 | P1 | **2,971 fabricated document links** — one PDF asserted on up to a dozen unrelated contracts. Over-shared fuzzy links now keep only their single strongest record. |
| BUG-018 | P2 | `adaptNotices` was the only adapter that dropped `driveFiles`, so notice Documents tabs were always empty. |
| BUG-019 | P2 | Users saw **two or three dashboards**; and the three super admins did not see the same view (Imran and Salman were parked on "Team Dashboard"). One dashboard per identity; super admin wins over job title. |
| BUG-020 | P2 | Contracts showed **0** after a restart — `hydrateContracts` swallowed a failed boot fetch and left a confident zero. Now retries with backoff. |
| BUG-021 | P2 | Data Health read **zero** after every restart because `loadCache()` replaced the persisted diagnostics instead of merging them. |
| BUG-022 | P1 | The requester portal could not submit at all: both the wizard gate and `submitLegalRequest` required an entity from an **empty** registry. |
| BUG-023 | P1 | Requests never left the browser — `raise` wrote only to `localStorage`, so Legal never saw them. Now persisted server-side and pulled into Triage. |

---

# Production-closure pass (build v193)

## BUG-024 — "Total contracts" KPI disagreed with what it showed

- **Module:** Contracts · **Severity: P3**
- **Reproduction:** Click the "Critical risk" KPI (filters to 6), then click "Total contracts".
- **Expected:** 1,371 records. **Actual:** the tile read **1,371** and the register showed **6 of 1371**.
- **Root cause:** `useFilters` deliberately persists the last filter set, and the tile only
  reset the status tab (`setTab("all")`) — the risk filter survived.
- **Fix:** the tile now calls `clear()` as well, so "Total contracts" means everything.
- **Verification:** all five tiles reconcile exactly — 898→898, 249→249, 6→6, 0→0, **1371→1371**.

## BUG-025 — The Automation Builder pretended to work

- **Module:** Workflow Builder · **Severity: P1 (feature with no data model)**
- **Reproduction:** Open `/automation`, drag nodes, press **Publish**, flip **Live**.
- **Expected:** either a persisted automation, or an honest statement that none is possible.
- **Actual:** the page makes **zero** store writes (`useState` only). "Publish" published
  nothing, "Test run" ran nothing, and the "Live" toggle flipped a local boolean while the
  header claimed the workflow was "running".
- **Root cause:** a design surface shipped with production-looking action controls and no
  engine, persistence or scheduler behind it.
- **Fix:** the page now states plainly that automation is not configured, explains that live
  legal workflows run on the module lifecycles instead, and **disables** Publish, Test run
  and the Live toggle. No automation engine was invented.
- **Verification:** controls render disabled; the banner is present; no store writes.

## BUG-026 — Double-clicking Submit filed the request twice

- **Module:** Requester portal · **Severity: P2**
- **Reproduction:** Complete the wizard and double-click **Submit request**.
- **Expected:** one legal request. **Actual:** two — two ids in Legal's triage queue from one
  intent.
- **Root cause:** `onClick=${submit}` with no lock and no disabled state.
- **Fix:** a `useRef` lock checked and set synchronously (a state flag is asynchronous — both
  clicks in one tick would read `false`), the button disabled while in flight with a
  "Submitting…" label, and the lock released on the failure path so a rejected submission
  can be retried.

## BUG-027 — `Toggle` ignored `disabled`

- **Module:** Shared UI · **Severity: P3**
- **Actual:** the shared `Toggle` accepted no `disabled` prop, so a switch on an
  unconfigured surface still flipped and did nothing.
- **Fix:** `disabled` is honoured (no handler, `aria-disabled`, a visibly inert style).

## BUG-028 — A failed register rebuild was silent

- **Module:** Ingest · **Severity: P2**
- **Reproduction:** Force a rebuild while Drive throws (HTTP 429).
- **Expected:** the previous book is kept **and the failure is recorded**.
- **Actual:** the data was correctly kept, but the outer `catch` recorded only an entry in
  `errors` — `lastDegradedIngest` stayed null, so Data Health showed a healthy book that was
  quietly ageing.
- **Fix:** a thrown rebuild now records `lastDegradedIngest` exactly as a rejected degraded
  ingest does, and Data Health surfaces it.
- **Verification:** `tests/m1-resilience.js` — "the rejection is recorded, not silent" PASS.

## DOC-001 — Stale security comment in the deployment config

- **File:** `deploy/nginx-legalos.conf` · **Severity: P4**
- **Actual:** the comment claimed "This prototype does not read [Cf-Access-*] … Cloudflare
  Access is the ONLY thing gating who reaches it". Both halves are now false: the app
  verifies the CF JWT itself and has its own credential layer.
- **Fix:** comment corrected, and the measured origin exposure documented in
  `deploy/harden-origin.md` with the exact nginx allow-list to close it.

---

# Final hardening pass (build v194)

## BUG-029 — An administrator could lock everyone out permanently

- **Module:** Users & Access · **Severity: P1**
- **Reproduction:** As the only administrator, set your own account to `inactive`.
- **Expected:** refused. **Actual:** accepted. The identity gate then refuses that account
  before it reaches Users & Access — so **the only account that could re-enable it is the
  one that just went dark**. Unrecoverable through the application.
- **Root cause:** `updateUser` had no guard against self-deactivation or against removing
  the last active administrator.
- **Fix:** both refused — "You cannot deactivate your own account", and any change that
  would leave zero active administrators is rejected.
- **Verification:** `tests/m1-concurrency.js` §4b — 400 with the reason, and the admin keeps
  working.

## BUG-030 — An unknown Cloudflare identity was silently given a LegalOS role

- **Module:** Identity · **Severity: P1**
- **Reproduction:** Authenticate at the edge with any company address that is not on the
  LegalOS roster.
- **Expected:** default-deny; an explicit "not provisioned" answer.
- **Actual:** `principalFor` returned `rbac: "requester"` with no marker, so an
  unprovisioned stranger was treated as a LegalOS user shape and every route fell through
  to its own checks rather than refusing up front.
- **Fix:** unknown identities are `provisioned: false`. The router refuses them with
  **403 `not_provisioned`** on every route except the requester intake, which is the
  business front door by design and exposes only the caller's own requests.
- **Verification:** `tests/m1-identity.js` — not provisioned, not a legal user, not admin.

## BUG-031 — A deactivated account kept working

- **Module:** Identity · **Severity: P1**
- **Reproduction:** Deactivate a signed-in user in Users & Access; they keep browsing.
- **Expected:** refused on the next request.
- **Actual:** `principalFor` never consulted account status, so a valid Cloudflare token or
  live session continued to resolve to a working principal.
- **Fix:** status is read from the permission engine during identity resolution, and the
  router refuses a disabled principal before any route.
- **Verification:** `tests/m1-concurrency.js` §4 — **403 `account_disabled`** on the very
  next call, with an explicit reason; reactivation restores access immediately.

## BUG-032 — Two roster rows claiming one login would silently pick one

- **Module:** Identity · **Severity: P2**
- **Actual:** `userByEmail` returned the first match, so a duplicated address would hand
  one person another's access with nothing said.
- **Fix:** the conflict is detected, the principal is **refused** (`403 identity_conflict`)
  rather than guessed, and the conflict is surfaced in Data Health.
- **Verification:** `tests/m1-identity.js` — a simulated duplicate is detected and refused.
  The live roster has none.

## BUG-033 — The register endpoint collapsed under concurrent readers

- **Module:** API performance · **Severity: P2**
- **Reproduction:** 50 concurrent `GET /api/registers/contracts?limit=5000` — the call the
  Contracts page makes on every visit.
- **Expected:** sub-second. **Actual:** **p50 2,667ms**, throughput pinned at 18.7 RPS
  regardless of concurrency.
- **Root cause:** ~3.3MB of JSON re-serialized and **synchronously gzipped per request**,
  and 27% of that payload was lineage (`__raw`, `__lineage`) that no screen reads.
- **Fix:** list responses are lean (lineage on `?lineage=1` only, still held in the cache
  for Data Health), and serialized responses are cached keyed on the ingest `builtAt`, so a
  rebuild invalidates everything automatically.
- **Verification:** **p50 16ms, p95 17ms, 3,371 RPS at 50 VU** — see
  `PERFORMANCE_TEST_REPORT.md`.

## BUG-034 — Access-control state was written non-atomically

- **Module:** Persistence · **Severity: P2**
- **Actual:** `config/access.json` (every user's permissions) and `config/.registers.json`
  (the whole normalized book) were written with a plain `writeFileSync`. A crash or a full
  disk mid-write truncates the file; on next boot the engine would fall back to role
  defaults for the entire organisation, or the app would serve an empty register.
- **Fix:** both write to a temporary file and `rename` — atomic on the same filesystem.
  `api/requests.js` already did this; the other two now match.

---

# Control disposition pass (build v218)

## UX-101 (P2, fixed) — four primary CTAs with no click handler

Found by `tests/m1-control-disposition.js`, which exercises every unique control
and requires an observable effect.

| Route | Button | Was |
|---|---|---|
| `/litigation` | **Open case** | no `onClick` at all |
| `/licenses` | **Add license** | no `onClick` at all |
| `/organization` | **Import** | no `onClick` at all |
| `/organization` | **Invite user** | no `onClick` at all |

All four rendered as live primary buttons and did nothing when clicked.

These registers are **read-only views of Drive trackers**. Drive is the source of
truth and the application never writes back, so a "create" button above them is a
promise the product cannot keep — and the honest fix is not to wire up a fake
create flow, which would fabricate legal records. Each now points at something
real: Litigation → data health (where the source workbooks are accounted for),
Licences → the licence register, Organization → `/access`, which is where users
and access are actually managed.

## The measurement was wrong before it was right

The first run flagged **105** controls as dead. Four were. The other ~101 were the
detector treating two legitimate behaviours as defects:

- **`ALREADY_IN_THIS_STATE`** — clicking the tab you are already on. `Licences &
  Permits 7` doing nothing while `?view=licences` is open is correct.
- **`NO_DATA_TO_ACT_ON`** — `/m/filings` and `/m/inspections` report `0` at every
  stage, so a stage filter cannot change what is displayed.

One more was confirmed *not* a defect: `Export PDF` calls `window.print()`, which
opens a browser dialog a DOM diff cannot observe.

Both categories are now separate dispositions rather than being folded into
"tested" or "bug". A number that counts correct behaviour as a defect is as
useless as one that counts a defect as correct.

## The earlier coverage figure was too low

The previous sweep reported **706** unique controls. Re-querying by a stable key
(route + kind + label) immediately before each click — instead of holding element
handles that React invalidates — found **1,487** unique behaviour groups. The
difference is the 482 controls the old sweep recorded as `GONE` and then counted
as covered.

## UX-102 (P2, fixed) — three more controls with no handler

| Route | Control | Was |
|---|---|---|
| `/organization` | **Row actions** (⋯) | a three-dot button opening nothing |
| `/settings` | **Edit this row** (✎) | a pencil button opening nothing |
| `/settings` | **New role** | promised role creation that does not exist |

The org chart derives from the roster and role templates live in
`api/permissions.js`, neither of which is user-editable here. The two icon
columns were removed; "New role" now opens `/access`, where access actually is
managed.

## API-014 (P1, fixed) — "Re-read Drive" returned an unhandled 500

`POST /api/registers/refresh` calls `registers.rebuild()`, which **throws** when
Drive cannot be read — throttling, a revoked service account, an unparseable
workbook. The throw escaped as a bare `500`.

The irony: the degraded-ingest guard was doing its job. It refuses a partial read
rather than overwrite 3,134 good records with a broken one. But the API reported
a server fault and the client swallowed it entirely — the spinner stopped and
nothing else happened — so an operator could not tell whether Drive was
unreachable or the register had just been damaged.

Now:

- **503** `refresh_failed`, with *"Drive could not be re-read just now. The last
  good data is still being served — nothing was changed or lost."*
- the number of records still held, so the answer is checkable
- the failure reason logged server-side
- a toast, so the operator sees it

`POST /api/knowledge/refresh` had the identical shape and got the identical fix.

Found only by exercising every control: this path fires exclusively when Drive is
unreachable, which is precisely when a bare 500 is least useful.

## Two accessibility gaps surfaced by "dead" controls

Neither was a dead control; both were real gaps that made one look dead.

- The active **Settings** section was marked only with an inline background
  colour — nothing announced it. Now `aria-current="page"`, consistent with the
  rest of the app's navigation.
- The **"Total contracts"** KPI means "show everything", so with no filters
  applied it correctly does nothing. `StatStrip` now accepts an `active` flag and
  the KPI reports `aria-pressed`, so the state is visible instead of looking
  inert.
