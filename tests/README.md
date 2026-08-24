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
