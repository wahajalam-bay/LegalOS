# The Org Architecture Build — requirements traceability

This maps every section of the department's **LegalOS Functional Requirements Document**
(received 10 Aug 2026) to what is now built, and where to click to see it.
Everything runs on the same no-build stack; all data is still fictional but shaped
by the FRD's own examples (Zameen Media, OLX, ZD/CPML projects, LESCO, SECP, labour
and civil-defence inspections).

| FRD section | Requirement | Built | Where to see it |
|---|---|---|---|
| **1. Purpose** | Single window across the three Legal teams; every request shows who raised it, who owns it, what stage, how long — excluding time parked with other departments | The sidebar is organised by team; every record carries requester, owner, stage and a TAT net of holds | Any module register; any record header |
| **2. Master data** | Master tables administrable (add / edit / deactivate), never hard-coded | 15 master tables in a store slice; every dropdown in every form reads them live; deactivate keeps history | Settings → **Master Data** |
| 2. Counterparty / Entity Registry | Central registry, referenced by every module, never re-typed | The registry gained lender / lessor / service-provider / developer / payee entries with role facets; entity and counterparty are pickers everywhere | Entity Registry; any raise form |
| **3. Common request fields** | Team-prefixed ID, dept, requested-by, team, sub-type, dates, owner, stage, priority, TAT status & clock, Drive link, attachments, versions, activity log, linked entity | One envelope shape shared by all thirteen modules (`LIT-…`, `CRM-…`, `CMP-…`) | Open any record — header, meta strip, activity log |
| **4. Contracts** | Master-list contract types; PPA category conditional and jurisdiction-dependent (KSA vs Pakistan models); Template Type drives drafting TAT 3d/7d + review 2d; risk sign-off required before submission; version log; instructions box | All present; the risk gate physically blocks the stage move and says which fields are missing | Commercial & Risk → **Contracts** → CRM-0001 (PPA, Medallion Model) |
| **5. Lease / Loan / Service** | Drafting workflow + separate renewal workflow; renewal trigger auto-generated 30 days out; reminders 30/15/7; renewal owner may differ | Both workflows in the registry; a boot-time sweep raises triggers and reminder notifications, idempotently | Compliance → **Lease, Loan & Service** → CMP-0004 (a live renewal-path record) |
| **6. Resolutions** | Board + Partners; urgency distinct from priority; authority; authorized persons w/ CNIC; tracker upload Y/N + date + link; TAT drafting 2d review 1d; **6.4 report by requesting department, filterable by urgency** | All fields; the report sits on top of the register with urgency and period filters; an un-uploaded finalized resolution generates a reminder | Compliance → **Resolutions** |
| **7. Licenses** | Renewal workflow (Trigger → Assigned → Document Collection → Submission to Authority → Awaiting Response → Renewed); auto-reminders 30/15/7 | The renewals module works the workflow; the sweep also watches the existing **License Register** and raises triggers for anything expiring ≤ 30 days with no open renewal | Compliance → **License Renewals** |
| **8.1 Case Handling** | Case number/court/position/counsel/PKR+USD exposure; **hearing log (one matter → many hearings)** driving "next action due"; TAT = internal task TAT, not case age | Hearing log with types from master data; next hearing surfaces on the register; the clock **freezes at "Submitted to Court"** — court time never counts against Legal | Litigation → **Case Handling** → LIT-0001 |
| **8.2 Asset Recovery** | HR / Admin / Legal inputs in separate field groups, each field tagged with its source; Legal Action = Recovered / Not Recovered / No Action Required; TAT + total value recovered | Every field from both FRD lists, grouped and source-tagged (HR / Admin / Legal chips) | Litigation → **Asset Recovery** → LIT-0007 |
| **8.3 IP Portfolio** | Mark, classes, registration number, dates, renewal due, status + sub-status, registered owner, local counsel; requests = New Filing / Renewal / Infringement; reminders 30/15/7 | The register is the portfolio (registered, pending prosecution and open actions in one place); renewal reminders ride the same sweep | Litigation → **IP Portfolio** |
| **8.4 Developer Disputes** | CPML matters: nature, latest update, action required/taken, region, authorized person | Built as its own module | Litigation → **Developer Disputes** |
| **8.5.1 Police Complaints** | Complaint type (ZD vendors / ex-employees / ZD buyers), authorized person, board resolution provided, police station, FIR dates | Built; the workflow makes board-resolution authorization an explicit stage | Litigation → **Police Complaints** |
| **8.5.2 Notices** | Received/issued register with the eight categories; status Reply Required/Received/Submitted; **auto-generate a standard response by detecting the notice type** | Templates stored for citizen-portal, IP-infringement, defamation and standard legal notices; one click drafts the reply for review; a category with no template refuses honestly | Litigation → **Notices** → the Falcon Estates notice → *Generate auto-response* |
| **8.6 Govt inspections** | Labour (bi-annual) + Civil Defence (annual) per office; officer, irregularities, book signed / certificate; **cost per office current vs forthcoming year, reduced Y/N** | Both types per office from the FRD's own office list; the YoY comparison feeds the cost dashboard | Litigation → **Govt Inspections**; Cost Analysis → inspections table |
| **9. TAT engine** | Clock starts on assignment; every stage change timestamped; intra-dept hold pauses the clock with dept + sender + structured reason; reported TAT = gross − paused; stage SLAs with early warning; every pause/resume logged with actor | `tat2.js` — pure and unit-tested; the record page shows the arithmetic (gross − held = reported vs SLA); holds are select-only, never free text | Any open record → *Turnaround* + *Intra-dept holds* panels |
| **10. Drive / tracker integration** | Phase 1: link a Drive folder/file per request; Phase 2: read-only sheet sync for structured trackers | Phase 1 done (field + button on every record). Phase 2 remains a marked seam, as specified | Any record header → *Drive folder* |
| **11. Single-window dashboard** | **My Tasks as the personal landing view**, sorted by TAT/SLA urgency; role-based views (lead → team, head → aggregated); filters; colour-coded TAT with paused shown distinctly; drill-down; cross-team search under access rules | Landing is role-aware (legal staff → My Tasks, management → Executive Overview, business → Raise Request); scope switcher per role; ⌘K search runs through the same row-level filter | **My Tasks**; switch identities from the sidebar footer |
| **12. Notifications** | New request → owner; stage change/closure → requesting dept; SLA breach → team lead; renewal reminders; resolutions-tracker upload reminder | All five wired; each is addressed to an identity or department and deduped so re-booting never stacks copies | The bell — switch View As and watch the feed change |
| **13. Cost tracking** | Cost type / estimated / actual / currency PKR-USD / vendor-payee from registry / invoice no / cost approved by / attribution tagged by the requester at raise time; dashboards by team, dept, module; budget vs actual by period; YoY trend; Excel export | Cost lines on every record; requester tags attribution in the raise flow; the dashboard normalizes to USD, meters budget burn per team, and exports CSV for Finance | **Cost Analysis** |
| **14. Access control** | Raising ≠ viewing; the five-role permission matrix; row-level security keyed on Legal Team + Requesting Department; requester sees status/stage/owner/TAT only, never internal notes; internal fields flaggable team-internal; search respects the filter | `rbac.js` enforces exactly the FRD filter logic; internal fields are declared in the module registry and stripped from the requester's own-request view; the matrix is published in Settings; a **View As** switcher demos every role live | Settings → **Access & Visibility**; sidebar footer → View As |
| **14.2 Raise flow** | Step 1 team → Step 2 module + sub-type → Step 3 common fields + attachments → auto-assigned per team rules → Request ID → track under My Requests | The single window, with auto-assignment to the least-loaded member of the receiving team and a My Requests list underneath | **Raise Request** |

## The Filing Module addendum (review feedback, 12 Aug 2026)

The department's post-review doc ("Filing Module — Compliance") added a thirteenth module. Traceability:

| Doc section | Requirement | Built | Where to see it |
|---|---|---|---|
| **8.1 Fields** | Filing entity from the registry; **SECP Form Type from a master list configurable without a dev cycle** (Form A, 3, 7, 9, 19, 29, Other); category Periodic/Event-Based; filing date; status Not Due / Due Soon / Filed / Overdue; **linked Resolution**; authorized person; **CTC applied Y/N** | All fields; form types live in Settings → Master Data → *SECP Form Types* — add a form there and it is in the dropdowns immediately; the linked resolution is a real cross-record link, clickable both ways; filing status is **derived** from the dates, never hand-typed | Compliance → **SECP Filings** |
| **8.2 Workflow** | Periodic filings: **system-generated automatically at 30 days before** the due date; event-based filings: raised as requests, often linked to a resolution | A per-entity **filing calendar** (maintained by Compliance on the register) drives `ensurePeriodicFilings()`: at every boot, anything inside the 30-day window with no record yet is created at *Filing Trigger*, auto-assigned, owner notified, activity stamped "System-generated"; once filed, the calendar rolls forward a year. Event-based forms arrive through Raise Request with the full 8.1 field set | Open SECP Filings on a fresh demo — the OLX Form A in the queue was created by the system, not a person; its activity log says so |
| **8.3 Reporting** | **Per-entity filing status view — all forms due / overdue / filed for a given entity in one place**, so nothing is missed across the group's entities | The *Filings by entity* board on top of the register: one row per entity, worst-first, a chip per filing (red overdue / amber due soon / green filed), ghost chips for calendar entries that have not generated yet, and click-to-filter. KPIs count **against the statute**, not just the TAT clock | SECP Filings → the board |
| Working the filing | — | Quick actions: **Mark filed with SECP** (stamps date + SRN, moves the stage), then **Mark CTC applied**; resolutions show the reverse link ("SECP filings triggered by this resolution") | Any open filing → *Quick actions* |

## The operational layer (Sprint 7 — inputs, not just outputs)

The departments do all of it inside the OS:

| Who | Can now do | Where |
|---|---|---|
| Any requester | Reply to the team in a two-way conversation on their own request; attach documents through a real file picker; both notify the owning lawyer | Any record → *Conversation* / *Documents* |
| HR / Admin | **Maintain their own source-tagged field groups** on Asset Recovery — §8.2's field ownership is a write right, enforced per group, even from a status-only view | Asset Recovery record → *HR Input* / *Admin Input* → Edit |
| Legal staff | Log any record **directly with the full field set** (a notice received, an inspection, a case) — not just the requester-facing subset; pick the owner or let auto-assign route it | Any register → *New …* |
| Legal staff | Post internal notes the requester never sees; drive the conversation from the same thread | Record → *Conversation* → *internal note* |
| Team leads / head | **Reassign the owner** from the People & routing rail; set priority | Record → rail |
| Legal staff | Grow the **Counterparty / Entity Registry inline** from any picker (name, type, jurisdiction, registry roles) — registered once, selected everywhere | Any entity/vendor picker → **+** |
| Compliance | One-click **Confirm tracker upload** on a finalized resolution | Record → *Quick actions* |
| Litigation | **Schedule the next inspection** on the bi-annual/annual cadence, costs rolled forward | Closed inspection → *Quick actions* |
| Commercial | **Log draft versions** on a contract | Contract record → *Quick actions* |

Plus the UX layer: two-column record pages (work on the left, clock/people/holds/documents on the right), stage pipeline strips on every register (click a stage to filter), a "start here" focus line on My Tasks with urgency rails, a global **+ New** in the topbar, and toast feedback on every action.

## What is real vs seam (honest list)

- **Real**: the thirteen modules, TAT v2 arithmetic, holds, hearing logs, auto-responses,
  renewal sweeps, notifications, cost book + export, master data admin, the full RBAC
  filter, role-aware landing, cross-team search filtering.
- **Seam (marked in code, by design)**: SSO (View As stands in for the identity layer —
  FRD 14.4 itself recommends roles/claims in the identity layer), Google Drive Phase 2
  sheet sync, e-signature, real file storage (attachments are references).

## The five-minute demo for the department

1. Land as **Layla (Department Head)** → Executive Overview, then **My Tasks → All teams**.
2. Open **Case Handling → LIT-0001**: hearing log, the TAT arithmetic, "with court" freeze.
3. Open the **IT Service Contract (CRM-0003)**: it is *Paused — with IT*; receive it back
   and watch the clock resume; try to jump the risk gate on a contract and get refused.
4. Switch View As to **Klaus Werner (CFO)**: he lands on Raise Request; submit a
   resolution to Compliance; open it — status-only, no internal notes, no costs.
5. Switch to **Sarah Chen (Commercial member)**: Litigation's queue politely refuses;
   ⌘K cannot even find LIT records.
6. Finish on **Cost Analysis** and Settings → **Master Data** (add a hold reason, watch
   it appear in the live form).
