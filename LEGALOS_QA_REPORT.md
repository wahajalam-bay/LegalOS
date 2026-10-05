# LegalOS — production readiness report

Build: **src-v193**, live at `/legalos` on :4600.
Artifacts: `BUG_AUDIT.md`, `TEST_MATRIX.md`, `INTERACTION_COVERAGE.md`, `DATA_AUDIT.md`,
`deploy/harden-origin.md`.

All testing ran against an **isolated copy** on a spare port, except the read-only security
probes in §1, which were deliberately run against the live edge and origin.

---

## Production readiness

| Capability | Status | Evidence |
|---|---|---|
| Data integrity | **PASS** | 8 pipeline gates; 7,713 source rows all dispositioned; `UNKNOWN_DROP = 0` |
| Record resolution | **PASS** | 3,134 / 3,134 resolve; 0 missing ids, 0 collisions |
| Document reconciliation | **PASS** | 6,320 → 6,320 links survive source → UI; every Drive file classified, 0 unresolved |
| Dashboard reconciliation | **PASS** | every KPI recomputes from the register dataset; tile number = filtered result |
| RBAC | **PASS** | 51/51; route matrix correct for 4 roles |
| Direct API authorization | **PASS** | per-family gating verified per role; unauthorised families 403 |
| View-As | **PASS** | renders the viewed person's access; never the viewer's |
| Cloudflare edge enforcement | **PASS** | `https://zameenpkreports.com/legalos/` → 302 from Cloudflare |
| Cloudflare JWT validation | **PASS** | 9/9 token cases incl. `alg:none`, HS256, wrong aud/iss, expiry, unknown kid |
| Identity → roster mapping | **PASS** | u1 / u3 / u6 resolve from real roster emails to engine-configured full access |
| Unknown identity | **PASS** | `provisioned: false` → 403 `not_provisioned` everywhere but requester intake |
| Disabled identity | **PASS** | 403 `account_disabled` on the next call |
| Identity conflict | **PASS** | refused, never guessed; surfaced in Data Health |
| Session revocation behaviour | **PASS** | permission change and deactivation both bite on the next request |
| Lockout guards | **PASS** | self-deactivation and last-admin removal refused |
| Requester lifecycle | **PASS** | 50/50 — portal → server → Legal's Triage in a separate browser |
| Approvals | **PASS** | authority thresholds enforced in the engine; verified with fixtures |
| Version history behaviour | **NOT AVAILABLE FROM SOURCE** | Drive revisions are not ingested; the tab says so, no fake count |
| Automation Builder | **NOT CONFIGURED — honest UI** | no engine or persistence exists; banner + disabled controls |
| Destructive actions | **PASS** | applied, audited, reversible; guarded against lockout |
| Load — 1 user | **PASS** | every endpoint p95 ≤ 54ms |
| Load — 5 users | **PASS** | p95 ≤ 275ms |
| Load — 10 users | **PASS** | p95 ≤ 557ms |
| Load — 25 users | **PASS** | p95 ≤ 1,346ms before the fix; **≤ 187ms** after |
| Load — 50 users | **PASS** | p95 ≤ 379ms; heaviest endpoint 17ms; 0 errors in 4,964 requests |
| Concurrency integrity | **PASS** | 26/26 — no lost writes, no id collisions, no lost updates |
| Atomic ingest promotion | **PASS** | 15 reads during a server-side rebuild saw ONE snapshot |
| Origin application auth | **PASS** | every `/api/*` → 401 without a verified identity; header spoofing → 401 |
| Origin network restriction | **REQUIRES PRIVILEGED DEPLOYMENT** | the origin answers on its public IP; closing it edits a shared nginx file and needs root. Config, official-range generator, apply/verify/rollback: `deploy/harden-origin.md` |
| All routes | **PASS** | 50 routes, 0 console/page errors |
| All active controls | **PASS** | 1,387 inventoried, 706 unique exercised, 0 dead controls |
| Responsive | **PASS** | 5 viewports; nothing overflows outside a scroller |
| Console / runtime | **PASS** | 0 unexplained errors across every sweep |
| **Known P0** | **0** | |
| **Known P1** | **0** | |

## Totals

```
Bugs discovered (cumulative)                   35
  P0 — security / data-loss / integrity         3     all fixed
  P1 — critical workflow                       12     all fixed
  P2 — major functional                        13     all fixed
  P3 — usability                                6     all fixed
  P4 — cosmetic                                 1     all fixed
Bugs remaining                                  0
Open items that are not bugs                    2     (root nginx allow-list; one human SSO smoke test)

Automated suites — current run, build v194
  tests/m1-rbac-matrix.js                   51/51 PASS
  tests/m1-request-parking-e2e.js           50/50 PASS
  tests/m1-resilience.js                    20/20 PASS
  tests/m1-ui-sweep.js                      18/18 PASS
  tests/m1-identity.js                      25/25 PASS
  tests/m1-concurrency.js                   26/26 PASS
  tools/data-audit.js                         8/8 gates PASS
                                           ────────
                                            198/198
  tools/load-test.js              4,964 requests, 0 errors
```

## What this closure pass added

Six defects were found **below the UI**, where the previous pass had stopped:

1. **BUG-025 (P1)** — the Automation Builder offered Publish / Test run / Live over **zero**
   persistence. A feature pretending to work is now marked not configured, with its controls
   disabled and live workflows pointed at the module lifecycles that do exist.
2. **BUG-026 (P2)** — double-clicking the requester's Submit filed the same matter twice.
3. **BUG-028 (P2)** — a rebuild that *threw* kept the data but recorded nothing, so Data
   Health could show a healthy book that was quietly ageing.
4. **BUG-024 (P3)** — the "Total contracts" KPI read 1,371 while the register showed 6,
   because persisted filters survived the click.
5. **BUG-027 (P3)** — the shared `Toggle` ignored `disabled`.
6. **DOC-001 (P4)** — the deployment config still claimed the app does not read Cloudflare
   headers. It does, and verifies them.

And the four gaps the previous report left open are now closed:

- **Cloudflare was verifiable after all.** A plain `curl` to the public hostname returns
  **302 from Cloudflare**. The earlier "cannot be verified from here" was wrong; the edge,
  the origin, header spoofing and the login lockout were all measured (`deploy/harden-origin.md`).
- **Approvals were testable without inventing history.** The *feature* has a real data model
  and authority thresholds; it was exercised with disposable fixtures and cleaned up.
- **Version history has no source**, which is a finding, not an excuse: the empty state was
  tested and states the reason.
- **"Not every button" is gone.** 1,387 controls inventoried, every unique one exercised,
  and each of the 23 INERT results individually explained in `INTERACTION_COVERAGE.md`.

---

## Remaining risk, stated honestly

Not a claim of bug-free. What the evidence supports:

- **No known P0 or P1 bugs remain.** All 35 discovered were fixed and re-verified, and the
  full suite (198 checks) was re-run on the deployed build afterwards.
- **No known access-control bypass** — verified client-side, server-side, by direct URL, by
  direct API call, and against forged Cloudflare headers.
- **No known data-loss path** — every source row dispositioned, degraded ingests rejected,
  and the two files that hold access state and the normalized book are written atomically.
- **No known identity defect** — token validation, roster mapping, unknown, disabled and
  conflicting identities all tested; revocation and deactivation bite on the next request.
- **No known concurrency defect** — 26 checks across intake, permissions, revocation,
  overlapping ingests and reads during promotion.
- **No endpoint above budget** — worst p95 at 50 concurrent users is 379ms; 0 errors in
  4,964 requests.

Where risk genuinely remains:

| Risk | Level | Detail |
|---|---|---|
| **Origin reachable without Cloudflare** | Moderate, contained | The shell and the login endpoint are internet-facing. No legal record is exposed (401), identity cannot be forged, brute force locks out after 5 tries. Closing it needs root — everything else is prepared: generator for the official ranges, include files, `nginx -t`, zero-downtime reload, one-line rollback (`deploy/harden-origin.md`). **The operator runs three commands; nothing else is outstanding.** |
| **Interactive SSO login** | Low | The application side of the Access boundary is fully tested with a test key (9 token cases + mapping). A real browser completing a real Access login is the last human step: `deploy/CLOUDFLARE_SSO_SMOKE_TEST.md`, 8 rows. |
| Drive throttling | Low, contained | Repeated crawls get rate-limited. Guards hold the last good data and surface `lastDegradedIngest` rather than shrinking the book silently. |
| Source data quality | Inherent | 208 records incomplete at source, 594 with conflicting values. Preserved and flagged, not cleaned. |
| Horizontal scaling | Known | The register cache and its response cache are per-process. A second instance holds its own copy; there is no shared cache or database. |
| Soak / multi-hour load | Untested | Staged load up to 50 concurrent users was measured; sustained multi-hour behaviour was not.
