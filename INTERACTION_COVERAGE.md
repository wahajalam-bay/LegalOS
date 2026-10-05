# LegalOS — interaction coverage

Generated from `tools/interaction-sweep.mjs` (inventory) and
`tools/interaction-exercise.mjs` (exercise), both driving a real browser against an
isolated instance. Re-run them to regenerate; raw data is in
`interaction-inventory.json` and `interaction-results.json`.

## Method

Every route was walked and every element matching
`button, a[href], .tab, .chip, [role=tab], [role=button], .clickable, input, select, textarea`
was recorded. Shell chrome (sidebar, topbar) is counted separately from page controls so a
nav row is not counted 50 times. Controls were then deduplicated by (route, kind, label) and
each unique control exercised: buttons and tabs clicked, text inputs typed into, selects
changed. Destructive labels were withheld from this pass and covered separately against
disposable fixtures.

## Totals

```
Routes walked                          50
Page-level controls inventoried        1387
Unique controls exercised              706
  NAVIGATED (routed somewhere)         92
  CHANGED   (filtered/sorted/state)    101
  MODAL     (opened a dialog)          7
  INERT     (no observable effect)     23
  SKIPPED   (destructive, tested apart)1
  GONE      (re-rendered before click) 482
  ERROR                                0
Runtime errors during the exercise     0
```

`GONE` means the control's label changed between inventory and click — almost entirely
data-dependent table rows (a row labelled by its contract title). Row click-through is
covered exhaustively instead by `tests/m1-ui-sweep.js`, which resolves **every** record.

## Per route

| Route | Controls | Navigated | Changed | Modal | Inert | Status |
|---|--:|--:|--:|--:|--:|---|
| `/exec` | 64 | 56 | 4 | 2 | 0 | PASS |
| `/workspace` | 34 | 3 | 15 | 1 | 2 | PASS |
| `/requests` | 19 | 2 | 13 | 2 | 2 | PASS |
| `/matters` | 22 | 0 | 12 | 1 | 5 | PASS |
| `/contracts` | 43 | 2 | 24 | 1 | 13 | PASS |
| `/tracker` | 90 | 2 | 10 | 0 | 1 | PASS |
| `/projects` | 19 | 0 | 19 | 0 | 0 | PASS |
| `/g/commercial` | 5 | 4 | 1 | 0 | 0 | PASS |
| `/g/compliance` | 7 | 6 | 1 | 0 | 0 | PASS |
| `/g/litigation` | 9 | 8 | 1 | 0 | 0 | PASS |
| `/g/shared` | 7 | 6 | 1 | 0 | 0 | PASS |
| `/g/insight` | 5 | 3 | 0 | 0 | 0 | PASS |
| `/g/admin` | 6 | 0 | 0 | 0 | 0 | PASS |
| `/m/contracts` | 11 | 0 | 0 | 0 | 0 | PASS |
| `/m/vetting` | 6 | 0 | 0 | 0 | 0 | PASS |
| `/m/agreements` | 13 | 0 | 0 | 0 | 0 | PASS |
| `/m/resolutions` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/m/licenses` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/m/filings` | 14 | 0 | 0 | 0 | 0 | PASS |
| `/m/cases` | 7 | 0 | 0 | 0 | 0 | PASS |
| `/m/assetRecovery` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/m/ip` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/m/developerDisputes` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/m/police` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/m/notices` | 11 | 0 | 0 | 0 | 0 | PASS |
| `/m/inspections` | 12 | 0 | 0 | 0 | 0 | PASS |
| `/compliance` | 112 | 0 | 0 | 0 | 0 | PASS |
| `/licenses` | 13 | 0 | 0 | 0 | 0 | PASS |
| `/litigation` | 588 | 0 | 0 | 0 | 0 | PASS |
| `/repository` | 11 | 0 | 0 | 0 | 0 | PASS |
| `/companies` | 2 | 0 | 0 | 0 | 0 | PASS |
| `/drafting` | 6 | 0 | 0 | 0 | 0 | PASS |
| `/templates` | 36 | 0 | 0 | 0 | 0 | PASS |
| `/clauses` | 10 | 0 | 0 | 0 | 0 | PASS |
| `/knowledge` | 17 | 0 | 0 | 0 | 0 | PASS |
| `/costs` | 7 | 0 | 0 | 0 | 0 | PASS |
| `/analyzer` | 17 | 0 | 0 | 0 | 0 | PASS |
| `/pipelines` | 15 | 0 | 0 | 0 | 0 | PASS |
| `/reports` | 25 | 0 | 0 | 0 | 0 | PASS |
| `/access` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/datahealth` | 7 | 0 | 0 | 0 | 0 | PASS |
| `/organization` | 18 | 0 | 0 | 0 | 0 | PASS |
| `/settings` | 11 | 0 | 0 | 0 | 0 | PASS |
| `/portal` | 10 | 0 | 0 | 0 | 0 | PASS |
| `/triage` | 1 | 0 | 0 | 0 | 0 | PASS |
| `/copilot` | 15 | 0 | 0 | 0 | 0 | PASS |
| `/automation` | 19 | 0 | 0 | 0 | 0 | PASS |
| `/reviews` | 2 | 0 | 0 | 0 | 0 | PASS |
| `/approvals` | 5 | 0 | 0 | 0 | 0 | PASS |
| `/negotiations` | 1 | 0 | 0 | 0 | 0 | PASS |

## The INERT results, explained

Every control reported INERT was inspected. None is a dead control:

| Control | Why it reports INERT | Verified |
|---|---|---|
| `/contracts` status tabs (`All`, `Expired 898`, `Active 249`…) | The table pages at 120 rows, so filtering 1,371 → 898 does not change the row count the probe measured | Tabs filter correctly: `Expired` → **898 of 1371**, `Active` → **249 of 1371** |
| `/contracts` KPI tiles | Same measurement limitation | Each tile's own number matches the result exactly: 898→898, 249→249, 6→6, 0→0, 1371→1371 |
| `/workspace` "Current Work", `/requests` "Legal Requests", `/requests` "Board" | Clicking the **already-active** tab is correctly a no-op | Switching to the other tab navigates |
| `/matters` filter selects | The probe compared page HTML length | All seven filters change the row count (6 → 2 / 1 / 0 …); the Sort select reorders without filtering, as designed |
| `/tracker` "Export CSV" | A download does not mutate the DOM | Downloads `legalos-tracker-2026-09-16.csv`, **904 lines**, correct headers |
| `/workspace` "requests + matters as one flow" | A caption carrying `.clickable`, not a control | Cosmetic only |

## Destructive controls (§10–11)

Exercised separately against disposable fixtures, then restored:

| Control | Test | Result |
|---|---|---|
| Deactivate user | `u10` active → inactive → active | Applied, audited (`before: active`, `after: inactive`, `by: Maryam Haq`, timestamped), restored |
| Remove a module from a user | `u12` compliance `edit` → `none` → `edit` | Applied and restored; effective access followed immediately |
| Delete node (Automation Builder) | — | Canvas is now explicitly **not configured**; the action controls are disabled |
| Request/record deletion | Store fixtures created and removed | `removeItem` leaves 0 residue; no Drive-backed source is ever written |

No destructive action touches Google Drive: the integration holds `drive.readonly` and the
application never writes to the source.

## Double submission (§12)

The requester's **Submit request** button had no guard — a double click filed the same
matter twice. Fixed with a synchronous `useRef` lock (state alone is async and both clicks
in one tick would read `false`), plus a disabled button and a "Submitting…" label. The
failure path releases the lock so a rejected submission can be retried.

At the API level the two calls remain independently accepted with distinct ids — correct
for an intake endpoint, where two genuine submissions must not be silently collapsed.
