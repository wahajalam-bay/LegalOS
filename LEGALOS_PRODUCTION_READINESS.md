# LegalOS — production readiness

Build **src-v217** · live at `/legalos` on zameenpkreports.com, behind Cloudflare Access.

Every figure below comes from a run recorded in this document. Where something is
not done, it says so and says what remains.

---

## Data integrity

Unchanged by this pass, and gated on every run:

| | |
|---|---:|
| Records across 7 register families | **3,134** |
| — contracts / litigation / notices / licences / loans / resolutions / properties | 1,371 / 357 / 255 / 7 / 192 / 914 / 38 |
| Drive files indexed | 3,476 |
| Documents linked to a record | 2,575 |
| Regression gates (`tools/data-audit.js`) | **8/8** |

Gates: stable ids on all 3,134 · no duplicate ids · lineage on every record · row
ledger reconciles · 0 unexplained drops · every mapped document exists in Drive ·
every Drive file has a disposition (3,476/3,476) · 0 unresolved documents.

---

### CORRECTION — 2026-09-18: the table above is superseded

Two of those figures were wrong, and both were wrong in the flattering
direction. A full bidirectional reconciliation
(`LEGALOS_FULL_DATA_RECONCILIATION.md`) established the following.

**The Drive index was half the estate.** `Entities data for secp filing` was not
shared with the service account when the figures above were taken, and the
statement "every Drive file has a disposition (3,476/3,476)" was therefore a
statement about the roots that happened to be visible. The root is now shared.

**"0 unresolved documents" was flattered by ~3,000 guesses.** Removing document
links that could not be defended raised unresolved from 754 to 3,820 before
honest matching brought it back to 0. A document nobody can place is a known
gap; a document placed on the wrong contract is a false statement that looks
like coverage.

| | was | now |
|---|---:|---:|
| Drive roots crawled | 4 | **5** |
| Drive files indexed | 3,476 | **6,843** |
| Folders | 856 | **1,531** |
| Records across 7 families | 3,134 | **3,153** |
| — resolutions | 914 | **933** (933 source rows, 1:1, none dropped) |
| Unresolved files | 0 *(overstated)* | **0** *(verified)* |
| Reconciliation gates | 8/8 (`data-audit.js`) | **7/7** (`full-reconcile.js`) + 22 checks (`m4-data-lineage`) |

**A real access defect was found and fixed.** Document authorisation treats a
file cited by several families as readable by any of them — so each extra holder
widens who can open it. The old rule let a *guessed* match sit on two records and
never checked across families: one agreement was held by two contracts and four
properties, a PACRA rating mandate by both contracts and loans. Sharing is now
decided on evidence rank, and 920 shared documents remain — every one of them
because a tracker cites it by name.

The "Rules now written down" note below still stands, but its scope is narrower
than it reads: a document cited across several modules is readable by any of
them **only when the source cites it in each of them**, never because a matcher
thought the names looked alike.

---

## Security

### Document & knowledge authorization — exhaustive

`tests/m1-document-auth.js` asks **every persona for every file**, comparing each
answer against an expectation derived independently from the register data and
the Drive roots.

| | |
|---|---:|
| Document × persona checks | **10,428** (3,476 files × 3 restricted personas) |
| Readable that policy forbids | **0** |
| Wrongly withheld | **0** |
| Multi-module documents verified against the stated rule | 396 checks over 132 documents |
| Search hits across 30 broad queries | 3,030 — **0 unauthorized** |
| Folder names exposed | 718 — **0** from an unreadable root |
| Content-matching on unauthorized ids | checks 0, returns 0 |
| Register endpoints (7 families × 3 personas) | 21/21 correct 200/403 |
| **Total** | **34/34** |

### SEC-007 (P2, fixed this pass)

`GET /api/knowledge/templates` returned **406** template names, ids, paths and
sizes to any legal user, then answered 404 on every attempt to open one. It was
the only knowledge route with no authorization filter. Now scoped like every
other: compliance-only and litigation-only accounts list **0**; commercial and
admin list 406, with 0 entries the caller cannot open. A filename is information.

### Rules now written down

- A document cited by a record you may read is part of that record's file; a
  document cited across several modules is readable by any of them. Deliberate,
  stated in SECURITY_AUDIT.md, asserted for all 132 such documents.
- A document no record cites is scoped to its Drive root's module — never global.
- An unrecognised root now **denies** (was: granted to anyone with `shared`).
  Unreachable today, but a branch that fails open is a trap for the next root.
- 403 for a module the caller lacks; 404 for an individual document, byte- and
  timing-indistinguishable from one that does not exist.

### Deployed security headers — verified on the live response

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob: https://drive.google.com https://docs.google.com https://*.googleusercontent.com;
  connect-src 'self' https://esm.sh; frame-src 'self' blob: data: https://drive.google.com https://docs.google.com;
  object-src 'self' blob: data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
```

HSTS is deliberately not set by the origin (TLS terminates at Cloudflare, and the
origin answers plain HTTP on the loopback for health checks). If HSTS is wanted it
belongs at the edge; it is not currently present on the edge response.

### Admin security diagnostics

`/datahealth` gains a **Security posture** tab, `GET /api/health/security`,
restricted to administrators (403 for other legal users, 401 with no session). It
reports states, never values: Access enforced, dev bypass off, app bound to
loopback, nginx allow-list installed or not, headers/CSP/clickjacking/HttpOnly on,
documents scoped, last ingest healthy. No key, token or session is included.

---

## Origin hardening

### ORIGIN-001 — **FIXED and verified**

LegalOS was bound to `0.0.0.0:4600`. Every other service on the box binds
loopback. That port answered directly on the instance's public interface,
bypassing nginx entirely — which would have made any Cloudflare allow-list at the
nginx layer moot.

`server.js` now binds `127.0.0.1` by default (`HOST`/`BIND_HOST` to override).
Verified after restart: a request to the private interface on :4600 is **refused**
(`000`), while nginx→loopback still serves 200.

### ORIGIN-002 — **READY FOR PRIVILEGED APPLY**

nginx still accepts arbitrary public traffic on the `/legalos/` route.

Current measured state:

| | |
|---|---|
| A · public-source shell `http://<origin>/legalos/` | **200** (want 403) |
| B · public-source API | **401** — app auth holds independently |
| C · loopback health | **200** |
| D · app port direct | **000, refused** ✔ fixed |
| E · Cloudflare edge unauthenticated | **302** to `zameen-zt.cloudflareaccess.com` ✔ |

**The remaining operation is exactly one command:**

```
sudo ./deploy/apply-origin-hardening.sh
```

What it does, and what has already been proven about it without root:

- Fetches Cloudflare's official ranges at run time from `cloudflare.com/ips-v4`
  and `ips-v6` — **never from memory** — and aborts if the fetch fails or the
  response does not look sane (15 IPv4 + 7 IPv6 CIDRs, 0 malformed, verified).
- Generates a snippet of 24 allow rules + `deny all`, plus loopback for health
  checks. **Validated:** `nginx -t` on the candidate config reports "syntax is ok",
  identical to the untouched live file under the same harness.
- Restricts **only** `location /legalos/`, so no other dashboard on the shared
  vhost changes behaviour.
- Backs up the site file, shows a diff, runs `nginx -t`, and **restores and
  re-validates on any failure** before reloading.
- Verifies itself afterwards from a non-loopback source address, and prints
  `ORIGIN HARDENING: PASS` only if A=403, B=403, C=200, D=refused, E=302.
- `--dry-run` (no root needed), `--verify` (no root needed) and `--rollback` all
  work today. **Rollback proven exact:** stripping the include returns the site
  file to the baseline byte for byte. Re-applying is idempotent.

Why it is not applied: `/etc/nginx` is root-owned and this account's sudo grants
`nginx -t`, `systemctl reload nginx` and service control — **not** file writes
under `/etc`. There is no Cloudflare Tunnel, no CI/CD path to privileged config,
and no reachable host firewall or security-group API from here. That was checked,
not assumed.

Network restriction is defence in depth. It does not replace application
security, which is independently verified above.

---

## Accessibility

Measurement, not a WCAG certification. See `ACCESSIBILITY_AUDIT.md` and
`ACCESSIBILITY_DATA.json`.

| | Before | After |
|---|---:|---:|
| Interactive elements inventoried (28 routes) | 4,770 | 4,733 |
| Native controls | 2,822 | 3,827 |
| Mouse-only (keyboard-unreachable) | **1,046** | **0** |
| Controls with no accessible name | 20 | **0** |

Every one of the 28 routes reports **0 mouse-only and 0 unnamed** controls.

The 1,046 were a handful of shared components, not 1,046 problems: sidebar
navigation (276), sortable headers (84), dropdown triggers (56), breadcrumbs (48),
document cards (419), tabs, menu items, metric cards, feed rows and chart
segments. Fixes are at the component level, so they land everywhere at once.

Keyboard behaviour is asserted by driving the real keyboard, not by reading
attributes: Enter opens a filter panel and moves focus inside it, Space on an
option applies the filter, Escape closes and returns focus to the trigger,
ArrowRight moves between register tabs, and a record row opens on Enter/Space.

---

## Registers & filters

See `TABLE_FILTER_AUDIT.md`.

- Two workspaces stopped stacking record families. Litigation is
  `Cases 357 | Legal Notices 255`; Compliance is
  `Overview | Licences 7 | Loans 192 | Resolutions 914 | Properties 38`.
  One register renders at a time. Nothing is truncated any more.
- Eleven registers share one shell, one filter engine and one config format.
- Filter state lives in the URL, so a filtered register survives refresh and Back,
  and a dashboard drill-down is a link.
- **63 filter-option reconciliations, all exact**: the count printed beside an
  option equals the result count equals the rows returned. Plus 4 KPI drill-downs.
- "527d overdue" on closed cases fixed: only a record still requiring action can
  be overdue, and the filter and the cell share one function.

---

## Test suites

| Suite | Result |
|---|---|
| `m1-security` | 56/56 |
| `m1-identity` | 25/25 |
| `m1-concurrency` | 26/26 |
| `m1-resilience` | 20/20 |
| `m1-rbac-matrix` | 51/51 |
| `m1-request-parking-e2e` | 50/50 |
| `m1-ui-sweep` | 19/19 (5 viewports, 0 console errors) |
| `m1-document-auth` *(new)* | 34/34 |
| `m1-register-filters` *(new)* | 27/27 |
| `m1-accessibility` *(new)* | 12/12 |
| `m1-control-disposition` *(new)* | 4/4 |
| `tools/data-audit.js` gates | 8/8 |
| **Total** | **332 / 332** |

All run against the deployed build after the final change.

---

### CORRECTION — 2026-09-18: that table was true of the suites it lists, and
### misleading about the suite as a whole

The figure above counts **11 suites of 31**. It was never wrong about those
eleven. It was wrong by omission: it read as a statement about the regression
suite, and at the time it was written **13 other suites had silently stopped
exercising the application altogether**.

Those 13 were written before LegalOS had authentication. Each pointed a browser
at a shared server, deleted `legalos-store-v1`, reloaded, and expected the app to
re-seed itself. When credential sign-in landed on **2026-09-14** the app began
rendering the login page instead; localStorage stayed empty; every one of them
died on `JSON.parse(null)`. They had been dead for four days.

Nobody saw it because `tests/run-all.js` defaulted to port **4600** — the live
service — and the standing rule on this box is never to run tests on 4600. So the
aggregate run was never performed, and the suites people ran individually were
the ones that still worked.

**Previously reported** · "332 / 332, all suites green"
**Actually executable at that moment** · 11 suites of 31; 13 dead, 1 timing out
**Final corrected state** · see `TEST_SUITE_COVERAGE.md` and the table below

All 13 were repaired — none deleted, none marked superseded, none weakened to
pass. Restoring them exposed **seven real application defects**, since fixed:

| # | Defect | Effect before the fix |
|---|---|---|
| 1 | The intake queue hydrated only at boot, before sign-in | Every legal user landed on an empty workspace until they refreshed |
| 2 | The compliance alert feed was fetched for every legal user | A 403 on every page load for Commercial and Litigation staff |
| 3 | Configuration proposals lived only in the proposer's browser | A Lead proposed and the Director never saw it |
| 4 | Request changes were never sent to the server | Advance, approve, escalate and close were invisible to colleagues |
| 5 | The server's patch allowlist stopped at `status`/`stage` | Stage synced; stage log, progress and "who asked for approval" did not |
| 6 | The intake desk was missing from the Drive-backed registers | Triaged requests were invisible on the desks that own their category |
| 7 | Notifications were written into the raiser's own browser | Every notification was addressed to somebody and delivered to nobody |

Defects 3, 4 and 7 are one mistake made three times: state that several people
share, kept in a single person's browser. Each is now server-held, with the
server deciding who may read it and who may decide on it.

**The harness itself is now tested** (`tests/m0-harness.js`), and the runner
distinguishes a product failure from a harness failure, counts skips, refuses the
live port, and records the build under test. A run is green only when every
active suite executed.

### Harness integrity

Three "failures" this pass were the rig, not the product, and each is now
impossible to repeat silently:

1. **A leftover server held the port**, so a new run tested a stale sandbox and
   reported duplicate ids and an empty store. Every suite that spawns a server now
   refuses to start if its port already answers.
2. **The session cookie is `Path=/legalos/`**, correct in production but wrong in a
   sandbox served at `/`, which made a reload look like "refresh logs you out" —
   a P1 that does not exist. Sandboxes now set `LEGALOS_COOKIE_PATH=/`.
3. **The requester journey "broke"** when navigation became real buttons: the test
   searched the whole document for `/^raise/` and matched the sidebar's "Raise
   Request" nav row instead of the form's submit. The search is now scoped to the
   form.

A fourth was corrected in the accessibility measurement itself: ARIA containers
(`tablist`, `tabpanel`, `group`), inherited `cursor: pointer` on children, and
clickable arcs inside an `aria-hidden` chart were all being counted as
keyboard-unreachable controls. A number is only useful if it measures the right
thing.

---

## Control inventory reconciliation

Every control ends in exactly one bucket. Controls are identified by a stable key
(route + kind + label) and re-queried immediately before each click, so one React
re-rendered is exercised rather than recorded as `GONE` and counted as covered.

| Disposition | Count |
|---|---:|
| UNIQUE_CONTROL_TESTED | **1,429** |
| DUPLICATE_INSTANCE_OF_TESTED_CONTROL | 1,954 |
| ALREADY_IN_THIS_STATE | 29 |
| NO_DATA_TO_ACT_ON | 23 |
| DISABLED_BY_DESIGN | 3 |
| DESTRUCTIVE_NOT_CLICKED_HERE | 1 |
| CONDITIONAL_NOT_REACHABLE_WITH_CURRENT_DATA | **0** |
| NOT_CONFIGURED_FEATURE | 0 |
| BUG | **0** |
| **UNCLASSIFIED** | **0** |
| **Total page-level control instances** | **3,439** |

4,560 control instances across 55 routes; 1,121 of them are shell chrome
(sidebar and topbar, repeated on every route) and are counted separately so a
navigation row is not counted 55 times.

Unique behaviour groups: **1,485** — not the 706 reported in an earlier pass. That
figure was low because the previous sweep held element handles React invalidated
and counted 482 stale ones as covered.

### What the exercise found

**UX-101 (P2, fixed)** — four primary CTAs with no click handler: "Open case"
(Litigation), "Add license" (Licences), "Import" and "Invite user"
(Organization).

**UX-102 (P2, fixed)** — three more: "Row actions" (Organization), "Edit this
row" and "New role" (Settings).

All seven sat on **read-only** surfaces — the registers are projections of Drive
trackers and the org chart derives from the roster — so wiring up create flows
would have meant fabricating legal records. Each now points at something real, or
was removed.

**API-014 (P1, fixed)** — "Re-read Drive" returned an unhandled **500**.
`registers.rebuild()` throws when Drive is unreachable, and the throw escaped.
The degraded-ingest guard was working exactly as designed — refusing a partial
read rather than overwriting good records — but the API said "Internal Server
Error" and the client swallowed it, so an operator could not tell whether Drive
was down or the register had been damaged. It now answers **503** with *"the last
good data is still being served — nothing was changed or lost"*, reports the held
record count, and surfaces a toast.

**Two accessibility gaps** surfaced by controls that looked dead: the active
Settings section was marked only by an inline background colour (now
`aria-current="page"`), and the "Total contracts" KPI could not express that the
register is already unfiltered (now `aria-pressed` via `StatStrip`).

### Measurement defects corrected along the way

The first run reported 105 dead controls and 465 unreachable. Seven were real.
The rest were the harness, and each is fixed rather than excused:

| Defect | Effect |
|---|---|
| `page.goto()` to a hash-only URL change does not reload an SPA | typing `zz` into a route's search box filtered its list, and that filter persisted for every later control on the route — **465 → 0** |
| the legacy `FilterBar` persists to `localStorage` (`legalos-filters-v1`) | unmounting the component was not enough; the store must be cleared too |
| already-active controls counted as dead | re-clicking the selected tab correctly does nothing — now `ALREADY_IN_THIS_STATE` |
| filters over an empty register counted as dead | nothing to narrow — now `NO_DATA_TO_ACT_ON` |
| a toggle flips its own state and almost no markup | compare the element's own signature, not the page's size |
| **a sort reorders rows without changing the page's size** | fingerprint row *order* and read `aria-sort` |
| inventory and exercise phases had drifted to different settle times | one shared `settle()` both phases use |

---

## Final table

| Area | State |
|---|---|
| UI consistency | PASS |
| Responsive | PASS |
| Keyboard accessibility | PASS |
| Focus management | PASS |
| Forms | PASS |
| Tables | PASS |
| Charts | PASS |
| Documents UX | PASS |
| RBAC | PASS |
| Object authorization | PASS |
| Document authorization | PASS |
| Knowledge search authorization | PASS |
| Requester isolation | PASS |
| Admin security | PASS |
| Mass assignment | PASS |
| Preview sanitization | PASS |
| CSV export safety | PASS |
| CSP | PASS |
| Security headers | PASS |
| View-As | PASS |
| Cloudflare edge | PASS |
| Application origin auth | PASS |
| Origin app-port exposure | PASS (fixed this pass) |
| Origin network restriction | **PRIVILEGED APPLY REQUIRED** — one command |

---

## Open, stated plainly

1. **`sudo ./deploy/apply-origin-hardening.sh`** — the only remaining privileged
   operation. Script written, dry-run clean, config validated with `nginx -t`,
   rollback proven byte-exact.
2. **One human Cloudflare SSO browser login** — `deploy/CLOUDFLARE_SSO_SMOKE_TEST.md`.
   The edge redirect is verified (302 to the Access login); a real
   sign-in-and-land cannot be driven from here.
3. **Accessibility is a measurement, not a certification.** No screen-reader
   testing with a real screen reader, and no colour-contrast analysis.
4. **Six views still use the older `FilterBar`** rather than the new register
   shell: `/repository`, `/tracker`, `/pipelines`, `/analyzer`, `/licenses` and
   `/workspace`. They filter today, but without URL state, chips or
   multi-select. Eleven register instances are on the new shell.
5. **Filter features asked for and not built**, listed in `TABLE_FILTER_AUDIT.md`:
   user-saved views (needs a per-user store on the server — faking it in
   `localStorage` would be persistence that vanishes on another device), custom
   date ranges, and free numeric min/max entry. Presets and buckets cover these
   today. Column visibility *is* remembered per browser.
