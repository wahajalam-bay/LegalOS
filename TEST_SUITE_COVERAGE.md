# Test suite coverage

Every suite in `tests/`, what it covers, and whether it is actually exercising
the current application. Nothing is listed as passing that does not run.

**Regenerate the facts behind this table with:** `node tests/run-all.js`

---

## Why this document exists

On 2026-09-18 the full suite was run end to end for the first time in weeks and
**13 of 31 suites turned out to be dead**. They had stopped exercising the
application on 2026-09-14, the day credential sign-in landed: each one pointed a
browser at a shared server, deleted `legalos-store-v1`, reloaded and expected the
app to re-seed itself. After sign-in existed the app rendered the login page,
localStorage stayed empty, and every one of them died on `JSON.parse(null)`.

Nobody saw it because `tests/run-all.js` defaulted to port **4600** — the live
service — and the standing rule was never to run tests on 4600. So the aggregate
run was never done, and the individual suites people did run were the ones that
still worked.

That failure mode is now structurally prevented:

| Guard | Where |
|---|---|
| A test may not address the live port | `tests/_port.js` — refuses 4600 unless `LEGALOS_ALLOW_LIVE=1` |
| A suite owns its server and proves it | `tests/_harness.js` — `/api/health` echoes a per-run sandbox id |
| A suite is skipped only if it says so | `tests/run-all.js` — `@retired <reason>` in the file, counted and printed |
| A harness failure is not a product failure | exit code 3, reported separately |
| A timeout is reported as a timeout | per-suite limit raised to 2400s, labelled when hit |
| The credential handout file cannot go stale | `tools/legalos-passwd.js` — `set` rewrites it, `list` verifies it |

---

## The shared harness

All migrated suites use `tests/_harness.js`:

- `startSandbox()` — copies the app, starts its own server on its own port,
  refuses a port that already answers, and verifies `/api/health` returns THIS
  run's sandbox id. Kills the process handle it holds; never a `pgrep` pattern.
- `loginAs()` / `asUser()` — real sign-in through the real form, one browser
  context per identity, asserted before anything else runs.
- `enterPortalAs()` — the business requester's supported door (`/portal/`).
- `seedRequest()` — fixtures go through the SERVER, where requests live.
- `waitFor()` / `goHash()` — every wait bounded, and says what it waited for.
- `runSuite()` — cleanup on success, failure and signal.

**Identity is never seeded through localStorage.** The suites used to switch
role by writing `session.viewAsId` into browser storage, which meant a test
granted itself the authority it was supposed to be testing. `m0-harness` asserts
that writing a user id into storage does not change who the server thinks you are.

---

## Suites

| Suite | Feature area | Auth | Sandbox | Store | Checks | Status |
|---|---|---|---|---|---|---|
| `m0-harness` | the harness itself | real + negative | yes | v2 | 17 | **active** |
| `m1-approval-gate` | approval authority at the Approval stage | real, 2 roles | yes | v2 | 11 | **migrated** |
| `m1-approval-queue` | approval queue scoped by authority + team | real, 3 roles | yes | v2 | 8 | **migrated** |
| `m1-config-surfaces` | requester chat, thresholds, SLA, playbooks | real, 3 roles + portal | yes | v2 | 12 | **migrated** |
| `m1-intake-submit` | raising a request through the portal wizard | portal door | yes | v2 | 8 | **migrated** |
| `m1-lifecycle` | triage, stage walk, escalate/hold, rank rules | real, 5 roles + portal | yes | v2 | 24 | **migrated** |
| `m1-module-sorting` | triaged work reaching its desk; approval round-trip | real, 4 roles | yes | v2 | 10 | **migrated** |
| `m1-mytasks-escalation` | closed work drops off; escalation is dated | real | yes | v2 | 8 | **migrated** |
| `m1-notifications` | the requester is told what is happening | real + portal | yes | v2 | 10 | **migrated** |
| `m1-propose-publish` | Lead proposes, only the Director publishes | real, 3 roles | yes | v2 | 13 | **migrated** |
| `m1-request-flow-e2e` | one request, raised to delivered | real, 4 roles | yes | v2 | 24 | **migrated** |
| `m1-routing-names` | work routes to the right person | real | yes | v2 | 5 | **migrated** |
| `m2-matter-management` | matters, risk, closure, privilege | real, 4 roles + portal | yes | v2 | 50 | **migrated** |
| `m3-contract-intelligence` | clause governance, drafting, review | real, 3 roles + portal | yes | v2 | 56 | **migrated** |
| `m1-compliance` | compliance API, workflow, permissions | real, 4 personas | yes | n/a | 151 | active |
| `m1-compliance-e2e` | compliance IA, routes, records | real | yes | n/a | 78 | active |
| `m1-compliance-drilldown` | every drill-down level, by clicking | real | yes | n/a | 44 | active |
| `m1-security` | auth, headers, cookies, credential file | real | yes | n/a | 58 | active |
| `m1-rbac-matrix` | permission matrix | real | yes | n/a | 51 | active |
| `m1-document-auth` | every document × every persona | real, 4 personas | yes | n/a | 34 | active |
| `m1-filter-security` | filter options, facets, export | real, 5 personas | yes | n/a | 18 | active |
| `m1-saved-views` | saved views and ownership | real | yes | n/a | 32 | active |
| `m1-register-filters` | register filter behaviour | real | yes | n/a | 28 | active |
| `m1-identity` | identity resolution | real | yes | n/a | 25 | active |
| `m1-ui-sweep` | UI sweep across routes | real | yes | n/a | 19 | active |
| `m1-accessibility` | keyboard + naming | real | yes | n/a | 12 | active |
| `m1-screenreader` | semantics | real | yes | n/a | 17 | active |
| `m1-contrast` | WCAG AA contrast | real | yes | n/a | 4 | active |
| `m1-concurrency` | concurrent writes | real | yes | n/a | — | active |
| `m1-control-disposition` | control disposition | real | yes | n/a | — | active |
| `m1-resilience` | failure handling | real | yes | n/a | — | active |
| `m1-request-parking-e2e` | request parking | real | yes | v2 | — | active |

| `m4-data-lineage` | source ↔ LegalOS reconciliation | data layer | n/a | n/a | — | active |

**Retired suites: none.** Every suite that existed still runs. Nothing was
deleted to make the board green.

### `m4-data-lineage` — added 2026-09-18

The reconciliation gate. It walks the line in both directions — every Drive
object has a disposition; every record and every document it shows traces back
to a real source row and a real file — and re-asserts the seven
`tools/full-reconcile.js` gates so a regression in the data layer fails the test
run instead of waiting for someone to run the tool by hand.

It runs against the data layer rather than the browser, because the question is
whether the model tells the truth about its source and a page cannot answer that.

**It found a real access defect on its first run.** Document authorisation treats
a file cited by several families as readable by any of them, and the old sharing
rule let a *guessed* match sit on two records while never looking across families
at all: one MEP works agreement was held by two contracts and four properties, a
PACRA rating mandate by both contracts and loans. Sharing is now decided on
evidence rank — see `LEGALOS_FULL_DATA_RECONCILIATION.md` §5.4.

---

## Application bugs these suites found once they ran again

Restoring the 13 exposed seven real defects, all fixed:

| # | Defect | Why it mattered |
|---|---|---|
| 1 | The request queue was hydrated only at boot, before sign-in | Every legal user landed on an EMPTY workspace and had to refresh |
| 2 | The compliance alert feed was fetched for every legal user | A 403 on every page load for Commercial and Litigation staff |
| 3 | Configuration proposals lived only in the proposer's browser | A Lead proposed and the Director **never saw it** — an approval workflow with nobody at the other end |
| 4 | Request changes were never sent to the server | Advancing, approving, escalating and closing were invisible to colleagues |
| 5 | The server's patch allowlist stopped at `status`/`stage` | A stage synced but its stage log, progress and "who asked for approval" did not |
| 6 | The intake desk existed only on the workflow module pages | Triaged requests were invisible on the Drive-backed registers that own their category |
| 7 | Notifications were written to the raiser's own browser | **Every** notification — approved, delivered, we-need-something-from-you — was addressed to somebody and delivered to nobody |

3, 4 and 7 are the same defect three times over: state that several people share,
kept in one person's browser. Each is now server-held, with the server deciding
who may read and who may decide.

## Two more the suites found on the final regression (2026-09-18)

| Defect | Why it mattered |
|---|---|
| `m1-compliance` asserted `resolutions === 914` against a source that now holds 933 rows | A hard-coded count that has gone stale fails while nothing is wrong — the worst kind of red, because it trains people to ignore the board. Replaced with a baseline captured in the same run, which cannot go stale, plus a check that the registers are not simply empty. |
| `m1-control-disposition` slept a fixed 1.1s + 220ms per control, ~1,839 times | About 22 minutes of pure blind waiting, which pushed the suite past the run-all ceiling and scored it as TIMED OUT. Replaced with a DOM-stability condition: the same guarantee, measured instead of assumed. |
| `run-all` labelled the build by whichever `src-v*` directory `readdir` returned first | It reported `src-v267` while `src-v268` was the live build, quietly mislabelling every result in the log. Now takes the highest version. `/api/health` had the identical bug and now reports the build `index.html` actually loads — a health endpoint is consulted precisely when someone is working out what is running. |

## Harness defects, reported separately

These were faults in the rig, not in the product. Two of them produced a FALSE
RED, which is as damaging as a false green: it trains people to disbelieve the
board.

| Defect | Effect |
|---|---|
| `m1-control-disposition` measured a control's own state without its **text or disabled attribute**, and its redraw threshold is 40 characters | "Re-read Drive" relabels itself to "Re-reading…" and disables while the crawl runs — about 12 characters. It was reported as the suite's only BUG. Verified by hand in a browser that the control works: label and disabled state both flip within 0.6s. The signature now includes `textContent`, `disabled` and `aria-busy`, and the two copies of it (before/after) are asserted identical, because if they drift the suite goes green for the wrong reason. |
| `m1-document-auth` only examined roots that **had** a module group (`g && …`) | An unclassified root listed to everyone fell straight through and was never examined. That is precisely how the statutory root came to be advertised to every legal user. The suite now fails if any root it cannot classify appears in any persona's tree. |
| `m1-compliance` hard-coded `resolutions === 914` | Failed while nothing was wrong. Now a baseline captured in the same run. |
| `m4-data-lineage` asserted "no document is shared ACROSS families" | It encoded a rule that turned out to be wrong. Access is decided per module GROUP, and contracts and properties are both commercial — so sharing a project's approved floor plans between them widens access to nobody, while forbidding it stripped seven projects of every document they had. The check now tests the group boundary, and still forbids a crossing on anything weaker than a citation. |

## Content reading, added 2026-09-21

`m4-data-lineage` grew seven checks covering what the system has actually READ:
that the content index is built, that scanned documents are reached through
Drive's OCR index, that documents we could not read are **counted rather than
guessed at**, that every typed document also records HOW it was read, that every
content-derived link names the two words that produced it, and that a content
link never shares a document between records.

That last one matters: content is inference. It is ranked below a deterministic
folder link and above a filename guess, and like a guess it gets exactly one
owner — strong evidence that a document concerns a party, not evidence that two
records share the instrument.
