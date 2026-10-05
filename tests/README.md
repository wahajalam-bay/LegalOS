# LegalOS end-to-end tests

Headless-Chrome (puppeteer-core) suites that drive the **real app** on
`localhost:4600` — real screens, real store, no mocks. Engine-level assertions
run through the same live ES modules the app uses (dynamic `import("/src/store.js")`
inside the page), so what the tests exercise is exactly what production runs.

## Run

```
node tests/run-all.js          # every suite (boots the server itself if needed)
node tests/run-all.js m2       # only Module 2
node tests/m2-matter-management.js   # one suite directly (needs :4600 up)
```

Requires Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.
Each suite resets `localStorage` first, so runs are deterministic.

## Suites

| Suite | Covers |
|---|---|
| `m1-lifecycle.js` | Request lifecycle end to end: triage→assign, advance through every stage (incl. matter-backed records), escalate, hold/resume (SLA pause), reassign; PRD §2 rank rules (lead reassigns, associate/paralegal cannot, requester sees no controls); persona-bench assignee picker |
| `m1-approval-gate.js` | Approval stage gating: junior blocked with escalate-for-sign-off, Lead approves → Signature, approval logged |
| `m1-mytasks-escalation.js` | Completed/closed work drops off My Tasks; escalation shows when/by whom/why |
| `m1-approval-queue.js` | "Awaiting my approval" on My Tasks: Director sees all, Lead only their team, Associate none; escalated items flagged |
| `m1-notifications.js` | Full-screen request sheet; status-change / delivery / awaiting-requester notifications; Delivered state |
| `m1-intake-submit.js` | Real wizard submit: unique reference, category×priority TAT basis, jurisdiction stamped, acknowledgement notification |
| `m1-module-sorting.js` | Triaged requests surface on their category's module register; approval round-trip notifies the requester of sign-off |
| `m1-config-surfaces.js` | In-app requester chat; numeric approval threshold (lead blocked above, Director allowed); Director edits the SLA matrix inline; playbook publish; Precedents & Playbooks nav |
| `m1-propose-publish.js` | AD proposes an SLA change → Director notified → publishes; matrix changes only after publication |
| `m2-matter-management.js` | Module 2 end to end (47 checks): matter id scheme, taxonomy validation, lifecycle state machine (invalid transitions blocked, reasons required), PRD risk matrix + override-with-reason, task ownership + system-stamped duration, bidirectional related matters, outcome-gated closure (missing fields named, no double-close, archive one-way), counterparty master dedupe (Ltd ≡ Limited), request→matter conversion with duplicate guard, workspace UI, **privilege security** (unauthorized register/URL/search denial, named access, requester lockout) |

A suite exits `0` only when **every check passes and the browser console is
clean** — a console error fails the run even if the assertions pass.

---

## Writing a suite that boots its own server

Four rules, each learned from a run that reported a confident, wrong answer.

**1. Refuse to start if the port already answers.**
A leftover server from a crashed run keeps the port. This run's server then fails
to bind *silently*, and every request goes to the stale sandbox — which produces
duplicate record ids, an empty store and "not signed in", all of which read like
product bugs. Every suite that spawns a server checks first and exits 2.

**2. Set `LEGALOS_COOKIE_PATH=/` in the sandbox.**
The session cookie is issued with `Path=/legalos/`, which is correct in
production. A sandbox serves the app at `/`, so without the override the browser
never sends the cookie back and a page reload lands on the login screen — which
looks exactly like "refresh logs you out", a P1 that does not exist.

**3. A click and the DOM read that follows it cannot share one `page.evaluate`.**
React renders asynchronously. Click, wait, then read — otherwise the panel you
just opened is not there yet and the sweep reports zero controls.

**4. Identify controls by a stable key, not a live handle.**
Handles captured up front go stale when React re-renders; an earlier sweep
recorded 482 of 706 controls as GONE and counted them as covered. Re-query by
(route, kind, label) immediately before acting.

And one about selectors: **scope a text search to the page, not the document.**
The sidebar has a navigation row labelled "Raise Request"; once navigation became
real `<button>`s, a document-wide search for `/^raise/` matched the nav row
instead of the form's submit.

## The suites

| Suite | What it proves |
|---|---|
| `m1-security` | the server boundary: 403/404, not hidden buttons |
| `m1-identity` | unknown, disabled and conflicting identities |
| `m1-concurrency` | concurrent writes and read scoping under load |
| `m1-resilience` | degraded Drive, formatting, adapter edge cases |
| `m1-rbac-matrix` | every persona × every module |
| `m1-request-parking-e2e` | a requester's journey reaches Legal's triage queue |
| `m1-ui-sweep` | every route renders; every record resolves; five viewports |
| `m1-document-auth` | every document × every persona, plus every metadata surface |
| `m1-register-filters` | filter counts reconcile with the rows returned |
| `m1-accessibility` | per-route keyboard and accessible-name measurement |
| `m1-control-disposition` | every control ends in exactly one disposition |
