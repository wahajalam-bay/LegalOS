# LegalOS — test matrix

Status: **PASS** verified now · **FIXED** failed first, fixed, re-verified · **BLOCKED**
could not be tested, with the reason.

Harness: `tests/m1-rbac-matrix.js` (51 checks), `tests/m1-request-parking-e2e.js` (50
checks), `tools/data-audit.js` (8 regression gates), plus the driven-browser sweeps
described per row. All runs are against an isolated instance, never the live service.

## Routes & shell

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| All routes | Sweep 57 routes as a full-access user | renders, no console/page errors | 0 errors, 0 blank screens | PASS |
| All routes | Horizontal overflow at 1440px | none | none | PASS |
| Routing | `/nonexistent-route` | graceful empty state | "This module isn't available yet" | PASS |
| Routing | `/rec/litigation/NOPE-123` | "not found", no crash | honest empty state | PASS |
| Routing | `/rec/badkind/x` | "Unknown record type" | correct | PASS |
| Routing | `/contracts/NOPE-123` | graceful | correct | PASS |
| Shell | Topbar user menu at 390px | reachable | was 78px off-screen | **FIXED** (BUG-005) |
| Shell | Tab row overflow on narrow screens | scrollable | was unreachable | **FIXED** (BUG-007) |
| Responsive | 1920/1440/1280/834/390 × 7 routes | no overflow outside a scroller | clean at all five | **FIXED** (BUG-006) |

## Data pipeline

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| Ingest | Every source row has a disposition | UNKNOWN_DROP = 0 | 7,713 rows classified, 0 unknown | PASS |
| Ingest | Ledger reconciles | ingested + incomplete − merged = held | 3,134 = 3,134 | PASS |
| Ingest | Throttled Drive crawl | keep the healthy book | overwrote it (licences 7→0) | **FIXED** (BUG-002) |
| Identity | Stable record ids | no collisions, survive re-ingest | 3,134/3,134, 0 collisions | PASS |
| Lineage | Record → file/sheet/row | traceable | 3,134/3,134 | PASS |
| Documents | Every Drive file classified | no invisible files | 3,448 classified, 0 UNRESOLVED | PASS |
| Documents | Mapped file still exists in Drive | 0 dangling | 0 | PASS |

## Registers, details, documents

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| All 7 registers | API = adapted = unique ids | equal | equal for every family | PASS |
| All records | Register row resolves to its detail | 100% | **3,134 / 3,134** | PASS |
| All records | Documents survive the adapter | no loss | 6,320 → 6,320 | PASS |
| Notices | Documents tab populated | shows linked PDFs | adapter dropped them | **FIXED** (BUG-018) |
| Contracts | Documents tab count = linked files | exact | 21/21 sampled exact, incl. a 73-doc contract | PASS |
| Contracts | Detail page content | real data only | invented clauses/versions/approvers | **FIXED** (BUG-015) |
| Litigation | Case detail + documents + timeline | resolves | resolves | PASS |
| Compliance | Licence/loan/resolution details | resolve | resolve | PASS |
| `/m/licenses` | License Renewals register | 7 licences | showed 0 | **FIXED** (BUG-002) |
| `/m/*` modules | Asset Recovery / IP / Police / Developer Disputes | populated from litigation by nature | 7 / 9 / 13 / 13 cases | PASS |

## Dashboards & charts

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| Litigation | total = open + closed | reconciles | 357 = 208 + 149 | PASS |
| Litigation | Cases by Stage sums to population | 357 | 357 across 5 stages | PASS |
| Litigation | Cases by Type sums to population | 357 | 357 across 25 types | PASS |
| Contracts | status buckets sum to register | 1,371 | 1,371 | PASS |
| Contracts | KPI → filter returns the same count | exact | Expired 898→898, Active 249→249 | PASS |
| Charts | Donut segment click filters | filters + chip | dead on every segment | **FIXED** (BUG-004) |
| Charts | Bar click filters | filters + chip | 357 → 169 with chip | PASS |
| Money | Currency on money screens | PKR | rendered `$947.0M` | **FIXED** (BUG-003) |
| Money | Exposure aggregation | reconciles | PKR 450,011,594 over 38 cases | PASS |
| Dashboard | No invented trends | none | `+14%` hardcoded | **FIXED** (BUG-010) |
| Copilot | Corpus counts | data-derived | hardcoded 1,284/12/14 | **FIXED** (BUG-008) |
| Negotiations | Stats | data-derived | hardcoded 3.2 / 4 | **FIXED** (BUG-009) |

## Filters & search

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| Contracts | Status filter chips | filters + count matches KPI | Expired 898, Active 249 | PASS |
| Litigation | Free-text search | matching rows only | "Muzammil" → 1 row, term present | PASS |
| Litigation | Search with no match | empty state, no crash | 0 rows + empty state | PASS |
| Litigation | Clear search | full list returns | returns | PASS |
| Litigation | Filter chips + Clear all | removable | chip renders with ✕ | PASS |

## Permissions (client AND server)

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| RBAC | One dashboard per identity | exactly one | 51-check suite | PASS |
| RBAC | Three super admins identical | identical access | verified identical | PASS |
| RBAC | Team isolation (registers/hubs/modules/`/rec`) | no cross-team access | verified 3 teams | PASS |
| RBAC | Nav never offers a refused row | 0 | 0 for all teams | PASS |
| RBAC | Deactivated account | only `/login` | verified | PASS |
| RBAC | View-As preview | shows the VIEWED person's access | inherited the admin's | **FIXED** (BUG-012) |
| API | Compliance-only fetches litigation | 403 | returned all 331 | **FIXED** (BUG-001) |
| API | Litigation-only fetches contracts/licences/resolutions | 403 | 403 | PASS |
| API | Commercial-only fetches contracts only | 200 + 403s | correct | PASS |
| API | Data Health as non-admin | 403 | 403 for all three | PASS |
| API | Unauthenticated register fetch | 401 | 401 | PASS |

## Requester → Legal lifecycle

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| Portal | Department identities offered | real, not "Unassigned" | 7 real departments | PASS |
| Portal | Requester lands on Raise | `#/raise`, not refused | correct | PASS |
| Portal | Complete the wizard and submit | request created | gate made it impossible | **FIXED** (BUG-022) |
| Portal | Submission reaches the server | POST 201 | 201, parked `status: Triage` | PASS |
| Handoff | Identity stamped by the server | verified caller, body ignored | forged `requestedBy` overwritten | PASS |
| Handoff | Legal sees it in Triage | appears for a different user | appears in a clean browser | PASS |
| Scoping | Requester sees only their own | own requests only | verified across two requesters | PASS |
| Triage | Legal may patch status | 200 + audited | 200, history recorded | PASS |
| Triage | Requester may patch | 403 | 403 | PASS |
| Persistence | Requests survive a restart | retained | retained, status too | PASS |
| Validation | Empty / untitled / oversized | 400 | 400 | PASS |

## Not covered

| Area | Why |
|---|---|
| Live Cloudflare domain | The box answers on its own origin; driving Chrome with a host-resolver rule bypasses Cloudflare Access entirely, so "it passes here" is not evidence about the real hostname. Origin-verified only. |
| Approvals / multi-approver flows | No approval records exist in the source; the surfaces now show honest empty states rather than invented approvers (BUG-015). |
| Version history | Drive revision history is not ingested; the tab states that plainly instead of inventing v1/v2/v3. |
| Export / download of documents | `Open in Drive` and preview verified; byte-level download of every file not exercised. |

---

# Production-closure pass (build v193)

## Security edge & session

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| Edge | `https://zameenpkreports.com/legalos/` | Cloudflare Access challenge | **302 from Cloudflare** | PASS |
| Origin | Public IP + spoofed Host, app shell | reachable (no data) | 200 | PASS (documented) |
| Origin | Public IP + spoofed Host, `/api/registers/litigation` | refused | **401** | PASS |
| Spoofing | Plaintext `Cf-Access-Authenticated-User-Email` | not trusted | 401 | PASS |
| Spoofing | Forged `Cf-Access-Jwt-Assertion` | signature rejected | 401 | PASS |
| Spoofing | `alg:none` JWT | rejected | 401 | PASS |
| Anonymous | 6 API endpoints incl. admin | 401 | 401 each | PASS |
| Session | 5 wrong passwords | lockout | 429 on the 6th | PASS |
| Session | correct password during lockout | still refused | 429 | PASS |

## Route authorization by role

| Route class | Super admin | Commercial only | Litigation only | Compliance only | Status |
|---|---|---|---|---|---|
| `/exec` | ALLOW | DENY | DENY | DENY | PASS |
| `/me` | DENY (has /exec) | ALLOW | ALLOW | ALLOW | PASS |
| Commercial (`/contracts`, `/tracker`, `/projects`) | ALLOW | ALLOW | DENY | DENY | PASS |
| Litigation (`/litigation`, `/m/cases`) | ALLOW | DENY | ALLOW | DENY | PASS |
| Compliance (`/compliance`, `/licenses`, `/m/resolutions`) | ALLOW | DENY | DENY | ALLOW | PASS |
| Admin (`/access`, `/datahealth`, `/organization`, `/settings`) | ALLOW | DENY | DENY | DENY | PASS |
| Shared legal (`/workspace`, `/matters`) | ALLOW | ALLOW | ALLOW | ALLOW | PASS |
| `/raise` (business only) | DENY | DENY | DENY | DENY | PASS |

## Controls, approvals, automation, destructive

| Module | Scenario | Expected | Result | Status |
|---|---|---|---|---|
| All routes | Inventory every interactive control | complete list | 1,387 across 50 routes | PASS |
| All routes | Exercise every unique control | no errors, no dead controls | 706 exercised, 0 errors, 23 INERT all explained | PASS |
| Contracts | KPI tile → register | tile number = result | 898/249/6/0 exact; 1371 disagreed | **FIXED** (BUG-024) |
| Tracker | Export CSV | file with real rows | 904-line CSV, correct headers | PASS |
| Matters | 7 filter selects + sort | filter changes rows; sort reorders | all correct | PASS |
| Approvals | Paralegal approves | refused | "approval requires a Lead… or the Director" | PASS |
| Approvals | Associate approves | refused | refused | PASS |
| Approvals | Lead approves PKR 5M (limit 1M) | refused | "above your approval threshold" | PASS |
| Approvals | Director approves | allowed | stage → Signature, audited | PASS |
| Workflow | Advance through stages | gates enforced | blocked at the risk gate with named missing fields | PASS |
| Automation | Publish / Test run / Live | honest behaviour | claimed to publish with no engine | **FIXED** (BUG-025) |
| Destructive | Deactivate → reactivate user | applied, audited, reversible | audit has ts/by/user/before/after | PASS |
| Destructive | Remove module → restore | applied and reverted | edit → none → edit | PASS |
| Double-submit | Double-click Submit request | one request | filed twice | **FIXED** (BUG-026) |
| Versions tab | No source data | honest empty state | "No version history…" with no fake count | PASS |
| Approvals tab | No source data | honest empty state | "No approval trail for this contract" | PASS |
| Comments tab | No comments | 0 means 0 | "No comments on this record" | PASS |

## Error injection

| Injected | Expected | Result | Status |
|---|---|---|---|
| API 500 | no crash, no blank, no fabricated values | handled | PASS |
| API 403 | handled | handled | PASS |
| API 404 | handled | handled | PASS |
| Empty body | handled | handled | PASS |
| Malformed JSON | handled | handled | PASS |
| Empty record set | honest empty register | handled | PASS |
| Drive 429 during ingest | keep the good book, record it | held + recorded | **FIXED** (BUG-028) |

## Regression suites (permanent)

| Suite | Checks | Status |
|---|--:|---|
| `tests/m1-rbac-matrix.js` | 51 | PASS |
| `tests/m1-request-parking-e2e.js` | 50 | PASS |
| `tests/m1-resilience.js` (cache protection, money by value, View-As, responsive) | 20 | PASS |
| `tests/m1-ui-sweep.js` (routes, every record, responsive) | 18 | PASS |
| `tools/data-audit.js` (pipeline gates) | 8 | PASS |
