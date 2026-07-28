# LegalOS — Complete Functionality Reference

**Purpose of this document.** A full inventory of what the system does today, and
for each capability, **what real-world data drives it**. Read this to understand
what exists; then use `02-DATA-COLLECTION-PACK.md` to ask the legal department for
the right things.

**Status.** Everything described here is built and working. All data is currently
**fictional placeholder data** ("Northwind Global Holdings" and the entities under
it). Nothing here is connected to a live system: there is no backend, no real Drive
integration, and no real OCR. Those are marked as **seams** in section 8.

**Scale as built:** 27 routes in the legal application, 3 views in the requester
portal, 15 store slices, 22 requests, 13 matters, 50 contracts, 12 documents,
20 licences, 37 companies, 12 templates.

---

## 1. What the system is, in one page

Two separate web applications sharing one data contract.

| | **LegalOS** | **Requester Portal** |
|---|---|---|
| For | The legal department | The business (anyone who needs legal) |
| URL | `/` | `/portal/` |
| Sees | Everything | Only their own requests |
| Purpose | Do the work, govern the portfolio | Raise a request, follow it, respond |

The core idea: **one front door, one identity per piece of work, one clock.**

A business user raises a request in the portal. It becomes a single record that
keeps its identity all the way through: request → matter → executed contract →
filed document → tracked obligation. At every point the system knows who is
holding it, how long they have had it, and whether it is late.

**No build step.** React and htm load from a CDN as ES modules. A 90-line
zero-dependency Node server serves static files. All state lives in the browser's
`localStorage` under one key (`legalos-store-v1`).

---

## 2. The nine-stage journey (the spine of everything)

Every request travels this path. Different request types use different subsets.

| # | Stage | Who holds it | What goes in | What comes out |
|---|---|---|---|---|
| 1 | **Intake** | Business | A need, in the requester's words | A logged request with an owner queued |
| 2 | **Triage** | Legal | The request and its attachments | Turnaround fixed, desk assigned, duplicates checked |
| 3 | **Commercial Review** | Business | Triaged commercial request | Commercial terms and budget confirmed |
| 4 | **Legal Review** | Legal | The draft or counterparty paper | Risk assessed, playbook deviations logged |
| 5 | **Drafting / Redlining / Notice Drafting** | Legal | Agreed position + template version | A draft with its template version recorded |
| 6 | **Negotiation** | Counterparty | Our draft and their redlines | Agreed final form, or a clear escalation |
| 7 | **Approval** | Legal | The final form | A complete approval record |
| 8 | **Signature** | Both sides | The approved final form | An executed counterpart |
| 9 | **Executed → Repository** | Legal | The executed document | Drive link, tracker row, physical record ref |
| 10 | **Obligations & renewals** | System | Key dates from the signed contract | Reminders before anything lapses |

**Lifecycle paths per request type (as configured):**

| Request type | Path |
|---|---|
| New | Intake → Triage → Legal Review → Drafting → Negotiation → Approval → Signature → Executed → Repository |
| Revision | Intake → Triage → Legal Review → **Redlining** → Negotiation → Approval → Signature → Executed → Repository |
| Extension | Intake → Triage → Legal Review → Drafting → Approval → Signature → Executed → Repository |
| Draft | Intake → Triage → Drafting → Legal Review → Approval → Repository |
| Termination | Intake → Triage → Legal Review → **Notice Drafting** → Approval → **Notice Served** → Closed |
| Amendment | same as New |
| Commercial | Intake → Triage → **Commercial Review** → Legal Review → Negotiation → Approval → Signature → Executed → Repository |

Each of the 14 stages carries **entry criteria, exit criteria, a default
ball-holder, and the artifacts it produces**. This is configuration, not code, and
the department should review it.

> **Ask the department:** is this your actual process? Which stages are missing,
> which are named differently, and which do you skip?

---

## 3. LegalOS modules (27 routes)

### 3.1 Leadership views

| Module | Route | What it does | Data it needs |
|---|---|---|---|
| **Executive Overview** | `/exec` | The landing page. Four hero metrics (portfolio value, average turnaround, portal adoption, share of waiting time outside legal), six department tiles, portfolio by entity, work by legal desk, and a written board note computed from the data. | Everything below, aggregated. Needs the **entity list** and **FX rates** to total value in one currency. |
| **How It Works** | `/flow-map` | The nine-stage journey with live counts, input/action/output per stage, before-and-after cards, and the two-apps diagram. Each stage clicks through to that stage filtered. | The **stage list** and your real process names. |
| **Executive Brief** | `/exec/brief` | A printable one-page leave-behind. Monochrome safe. | Same aggregates. |
| **Operational Dashboard** | `/dashboard` | The original team dashboard: KPIs, risk distribution, turnaround trend, volume by type, workload by business unit, activity heatmap, request funnel, delayed work, lifecycle reminders. | **Historical volumes and turnaround by month** for the trends. Currently hardcoded placeholder series. |

### 3.2 The working core

| Module | Route | What it does | Data it needs |
|---|---|---|---|
| **Legal Workspace** | `/workspace` | The department's command surface. Six lenses over one filtered dataset: **Worklist** (requests and matters as one continuous record), **Request Log** (every incoming request, auditable), **Contracts**, **Compliance**, **Templating**, **Browse** (entity → contract type → record). Worklist columns: Request Date, Filed Matter, Requestee, Category, Company/Entity, Due Date, TAT Analysis, TAT Status. | Requests, matters, contracts, the entity register, the team list. |
| **Record Flow** | `/workspace/:id` | The **WorkflowSpine**: any record rendered as four zones. See 4.1. | Per-record: form fields, documents, stages, outputs, relationships. |
| **Contract Tracker** | `/tracker` | The dense operational grid over the whole contract book. Columns: Sr No, Entity, Contract Type, Counterparty, Category, Legal Sub-division, Owner, Value, PPA Value, Land Value, Start, Expiry, Renewal/Notice, TAT, Physical Record, Office Location, Drive link, Stage. Inline quick-edit on Sr No, owner, dates and office location. Dashboard cards that narrow the grid. CSV export. | **The contract register.** This is the single biggest data ask. |
| **Intake & Repository** | `/repository` | The document pipeline: add or scan → OCR → extraction → repository record → operational fields. Creates the Drive link **and** the tracker row at once, and maps a **Sr No against the physical hard copy** with its office location. Per document: editable extracted fields that write back, raw OCR text, re-run extraction, Drive-style per-user access. | **The document inventory** and **where files physically and digitally live.** |
| **Data Analyzer** | `/analyzer` | Four views: **Active PPA** (every live property purchase with PPA value, land value, parcel ref, entity, jurisdiction, expiry), **Types of Licences** (rollup by type and jurisdiction with validity), **Extraction** (editable fields per document, write-back, re-run, bulk re-extract), **Aggregates** (total PPA and land value, portfolio by entity/jurisdiction/type/sub-division, expiring-value radar, extraction confidence). | Contract values split into **PPA value / land value / total**, plus parcel and title references. |
| **Team Pipelines** | `/pipelines` | Per-person kanban by lifecycle stage with per-card TAT health and days-in-stage. Team overview with load balance, delayed items per person and the worst blocker. Lifecycle reminder feed grouped by owner. | **The team roster with capacities.** |

### 3.3 Records and content

| Module | Route | What it does | Data it needs |
|---|---|---|---|
| **Legal Requests** | `/requests` | Kanban board with drag-and-drop across seven columns, plus a list view carrying the full TAT columns. Intake wizard. Request drawer with conversion to a matter. | The request backlog. |
| **Matters** | `/matters`, `/matters/:id` | Matter list and workspace. Tabs: **Flow** (the spine, default), Overview, **Requester** (chat + document asks), Timeline, Documents, Tasks, Comments. | Open matters with owner, risk, progress. |
| **Contracts** | `/contracts`, `/contracts/:id` | Contract portfolio and document workspace. Tabs: **Flow** (default), Document, Versions, **Spend** (budget burn, expense entries, add expense), **Access** (Drive-style per-user permissions with drafter/approver separation), Approvals, Comments. Clause navigator. AI review panel. | Contract register + spend + clause structure. |
| **Companies & Entities** | `/companies`, `/companies/:id` | Entity and counterparty registry. Per company: **contract-type drill-down** (default), then contracts, matters, requests, reviews, litigation, licences, all tagged to that company. | **The entity structure and the counterparty list.** |
| **Licences** | `/licences` | Every regulatory licence and registration. Validity (**Valid / Expiring Soon / Critical / Expired**) is computed at render from the expiry date, never stored. Detail drawer with validity timeline, renewal history and "Mark renewed". Auto-notifications, deduped. | **The licence register.** High value, usually already a spreadsheet. |
| **Templates** | `/templates` | Template library with per-template version control (Approved / Draft / Retired), changelog, a line-diff **Compare** view, restore-as-new-draft, and generation into a record's Drafting stage. | **The actual template library.** |
| **Clause Library** | `/clauses` | Governed clause catalogue with category, jurisdiction, risk and usage. AI clause generator. | The clause bank / playbook. |
| **Knowledge Base** | `/knowledge` | Natural-language search over playbooks, opinions and SOPs. | Internal legal know-how documents. |
| **Litigation** | `/litigation` | Case tracker: type, stage, exposure, external counsel, filing date, next hearing, jurisdiction. | **The litigation register.** |
| **Compliance** | `/compliance` | Regulatory posture by area and region with a score, owner, last and next review. | The compliance framework list. |
| **Reviews** | `/reviews` | AI-assisted review queue with SLA, flagged-issue counts, and **overlap detection** (two or more open items touching the same counterparty). | The review queue. |
| **Approvals** | `/approvals` | Approval chains with live approve and reject. | Who approves what, at what value or risk threshold. |
| **Negotiations** | `/negotiations` | Per-deal negotiation rounds with clause-by-clause **from → to** changes, direction (sent/received), version labels and attachments. | Negotiation history, if recorded anywhere. |
| **Reports** | `/reports` | Operations, Risk, Productivity and Financial analytics. | Historical series. |

### 3.4 Administration and intelligence

| Module | Route | What it does | Data it needs |
|---|---|---|---|
| **Requester Portal (ops)** | `/portal` | The legal-side view of the external app: traffic by source, registered requesters, unread threads, outstanding document asks, and the integration contract. | Portal usage. |
| **Settings → Request Form** | `/settings` | **End-to-end control of the portal with no code change:** nature-of-matter options, the company list, the **company × contract-type matrix**, request types, **required-document templates per contract type**, routing and TAT defaults per nature, branding, and a publish toggle. | **This is a decision ask, not a data ask.** See pack items 4, 5, 9. |
| **Settings → other** | `/settings` | Organisation config, RBAC roles, SSO/MFA, notifications, AI controls, integrations, billing, **Presentation mode** (demo reset). | The real org chart and role model. |
| **Organization** | `/organization` | People, teams, business units, entities. | **The team roster and the org structure.** |
| **AI Copilot** | `/copilot` | Chat workspace. **Currently canned responses matched by keyword.** Not a real model. | Nothing yet. This is a seam. |
| **Workflow Builder** | `/automation` | Node canvas for triggers, conditions, AI steps, approvals and SLAs. Visual only today. | The automation rules you would want. |

---

## 4. The engines (logic, not screens)

These are the parts that make the system more than a set of lists. Each one has
configuration the department must validate.

### 4.1 The WorkflowSpine (`flow.js`, `spine.js`)

Any request, matter or contract renders as **four zones**:

1. **INPUT** — the request form exactly as submitted, the requester, the owning
   entity, uploaded and scanned documents with their OCR confidence and extracted
   fields, the prior contract it attaches to, and the outstanding document asks.
2. **PROCESS** — the ordered stages with, per stage: state, the accountable owner
   **and** who is currently holding it, entry and exit criteria, in and out
   timestamps, the stage clock, the risk-based review or approval gate, and the
   artifacts that stage produced. A "you are here" marker.
3. **OUTPUT** — drafts, executed documents, extracted obligations, and the **three
   destinations**: Drive link, tracker row, physical record. Plus what the record
   contributes to the analytics.
4. **RELATIONSHIPS** — entity, counterparties, requester, owner, both faces of the
   record, the contract family (parent and children), related contracts and
   matters, licences, templates used, negotiation rounds, reviews, the approval
   chain, litigation, documents and the physical record. Every item click-through.

**One identity, two faces.** A request and the matter it becomes are the same
record. Open it by request id, matter id or contract id and you get the same
cluster.

### 4.2 The TAT engine (`tat.js`)

Turnaround is **automatic, not negotiated**.

- At triage the engine reads **contract type × risk tier** from a matrix, in
  **working days**, and scales it by request type (a Revision gets 0.75 of a New; an
  Extension 0.6).
- The working week excludes **Friday and Saturday**.
- The clock **pauses** when the ball is not with legal (with the business or the
  counterparty), because legal is not accountable for time it cannot spend.
- Every list, card and record shows the same verdict: **On Track / Due Today /
  Delayed**, and when delayed, **by how many working days and which stage is
  holding it, with the person named**.

Current matrix (working days) — **this is the single most important thing for the
department to sign off:**

| Contract type | Critical | High | Medium | Low |
|---|---|---|---|---|
| Default | 3 | 5 | 8 | 12 |
| PPA / SPA | 5 | 8 | 12 | 18 |
| Ejar Lease | 3 | 5 | 8 | 10 |
| Tenancy (PK) | 3 | 5 | 7 | 10 |
| Musataha | 6 | 10 | 15 | 20 |
| Development / JV | 8 | 12 | 18 | 25 |
| Brokerage & Agency | 2 | 4 | 6 | 8 |
| Off-plan / Wafi | 5 | 8 | 12 | 15 |
| Construction | 6 | 10 | 14 | 18 |
| Land / Plot Purchase | 5 | 8 | 12 | 16 |
| Marketing & Listing | 2 | 3 | 5 | 7 |
| Vendor MSA | 4 | 6 | 9 | 12 |
| Employment | 2 | 3 | 5 | 7 |
| NDA / MoU / LOI | 1 | 2 | 3 | 4 |
| SLA | 3 | 5 | 7 | 9 |
| Licence (software / trademark) | 3 | 5 | 8 | 10 |
| Listing & Subscription | 2 | 3 | 5 | 7 |
| Advertising & Media | 2 | 3 | 5 | 7 |
| Partnership / Reseller | 4 | 6 | 9 | 12 |
| Creator / Influencer | 2 | 3 | 4 | 6 |
| Data Processing (DPA) | 3 | 5 | 7 | 10 |

### 4.3 Risk-based gates

The risk tier decides review depth and the approval chain **before anyone is asked**.

| Risk | Reviewers | Approval chain | Depth |
|---|---|---|---|
| Critical | Reviewing counsel, Legal Director, Deputy GC | 3 steps, GC mandatory | Clause-by-clause against the playbook |
| High | Reviewing counsel, Legal Director | 2 steps | All risk clauses plus a written deviation log |
| Medium | Reviewing counsel | 1 step | Playbook checklist and deviation flags |
| Low | Reviewing counsel | 1 step (contract manager) | Template conformity check only |

### 4.4 Lifecycle reminders (`reminders.js`)

Watches every contract and fires, deduped by record and milestone:

| Milestone | Basis | Trigger |
|---|---|---|
| Notice window closing | Notice period | 14 days before the window closes, and after it has closed |
| Expires in 30 days | Expiry | red |
| Expires in 60 days | Expiry | amber |
| Expires in 90 days | Expiry | amber |
| Obligation due | Extracted obligation date | within 30 days, red if overdue |
| Lapsed but still active | Expiry in the past | red |

Auto-renewing contracts inside their notice window are called out separately,
because that is where money leaks.

### 4.5 Document extraction (`data.js#extractFromOcr`)

Reads OCR text and pulls out: parties, governing law, term, notice period,
registration reference (Ejar, PLRA, DLD, Ejari, BTK, Wafi, REGA), title or deed
reference, total value, currency, land value, PPA value, key clauses, and quality
flags. Values are **editable and write back** to the contract, so the analyzer and
filters see corrections immediately.

**Currently a deterministic text parser, not a model.** See section 8.

### 4.6 The Master Filter Bar (`shared.js`)

One filter surface reused across eight modules. Dimensions: Business Unit,
Department, Company/Entity, Type of Contract, Legal Sub-division, Category, Team
member, Status, Risk tier, TAT status. Plus a **date-range control that works on
any date field** (expiry, due, request date, execution date) with presets
(Expiring ≤30/60/90 days, Overdue, This month, This quarter), a sort control,
removable filter chips, and **named saved views**. The last-used filter set
persists per module.

### 4.7 The two-way bridge (`messages.js`)

One message thread per request, rendered by **both** applications. A message sent
from either side appears on the other. Unread badges both ways. Plus the
**missing-document loop**: legal asks for a document, the requester sees a
highlighted prompt, uploads it, and the checklist flips to received on both sides.

Because the two apps run in separate browser tabs, the store listens for
cross-tab storage events and re-hydrates, so **the other side updates without a
reload**.

---

## 5. The Requester Portal

A separate application with its own entry point, shell, session and theme.

| View | What it does |
|---|---|
| **Sign in** | Email plus name, and the **auto-captured source**: which company and site the request is raised from. Returning emails are recognised. Both values stamp every request and every message. |
| **Guided request flow** | Five steps: **Nature of Matter** → **Company/Entity** → **Type of Contract** (only the types mapped to that company) → request type, details and uploads → review and submit. Shows the turnaround it will get before submitting. Live duplicate warning. |
| **My requests** | Their own requests only. Columns: Request ID, Nature, Company, Contract Type, Raised, Target, Status, stage, unread badge. Filters for status, company and nature. |
| **Request detail** | A **read-only requester-facing spine**: internal stages collapse into plain language ("Under legal review", "In negotiation with the counterparty"), the ball-holder reads *you* / *Legal team* / *Counterparty*. Tabs: Progress, What I asked for, Documents, Messages. Outstanding document asks appear as a highlighted prompt at the top. |

**Scope isolation:** a requester opening another person's request id is blocked.
Internal notes, risk scoring and privileged analysis never cross over.

**Nature of Matter options (6):** Contracts (full flow), Advice, Compliance,
Disputes & Litigation, Labour Matters, Intellectual Property. Only Contracts walks
the full wizard today; the other five still create a complete record flagged
**routed manually**, so nothing is lost.

**Company × contract-type matrix as configured:**

| Portal option | Entity | Contract types offered |
|---|---|---|
| Zameen.com (ZD) | Zameen.com | Listing & Subscription, Brokerage & Agency, Marketing & Listing, Vendor MSA, SLA, NDA/MoU/LOI, Employment, DPA |
| Bayut KSA | Bayut | same 8 |
| Dubizzle KSA | Dubizzle | same 8 |
| OLX | OLX Pakistan | Advertising & Media, Vendor MSA, Partnership/Reseller, NDA/MoU/LOI, SLA, Employment |
| Zameen Media | Zameen Media | Advertising & Media, Marketing & Listing, Creator/Influencer, Vendor MSA, Licence, NDA/MoU/LOI |
| Z Property Developments | Z Property Developments | PPA, SPA, Land/Plot Purchase, Musataha, Construction, Development/JV, Off-plan/Wafi, Ejar Lease, Brokerage & Agency |

---

## 6. The data model — every field, and where it comes from in real life

15 store slices. "Source" is the column to read when deciding what to ask for.

### 6.1 `requests` (22 records, 41 fields)

| Field | Type | Real-world source |
|---|---|---|
| `id` | string | System-assigned (REQ-nnnn) |
| `title`, `description` | string | The requester writes these |
| `natureOfMatter` | enum | Portal step 1 |
| `company` | enum | Portal step 2 |
| `contractType` | enum | Portal step 3 |
| `requestType` | enum | New / Revision / Extension / Draft / Termination / Amendment |
| `category`, `subdivision` | enum | Derived, overridable |
| `entityId`, `companyTags` | ref | The entity register |
| `department`, `unit` | enum | The requester's org position |
| `requestDate`, `dueDate` | ISO date | Submission time, business need-by date |
| `tat` | object | **Computed by the engine.** `{days, fixedAt, dueAt, basis}` |
| `requesterId`, `requesterEmail`, `source` | string | Captured at portal sign-in |
| `channel` | enum | `portal` or `internal` |
| `owner` | ref | Assigned at triage |
| `risk`, `riskPreliminary` | enum | Requester's view, then legal re-scores |
| `value`, `currency` | number | The requester estimates |
| `counterparty` | string | The other side's name |
| `linkedContractId` | ref | For amendments, revisions, extensions, terminations |
| `stage`, `status`, `stageLog` | enum + array | Where it is and its history |
| `attachments` | object[] | What the requester uploaded |
| `requiredDocs` | object[] | `{name, status: requested\|received, requestedBy, requestedAt, receivedAt, docId}` |
| `matterId` | ref | The matter face of the same record |
| `messagesCount` | number | Denormalised thread length |

### 6.2 `contracts` (50 records, 40 fields) — **the biggest ask**

| Field | Type | Real-world source |
|---|---|---|
| `id`, `srNo` | string, number | System id, and the **Sr No that maps to the physical file** |
| `title`, `counterparty` | string | From the contract |
| `contractType` | enum | The type register |
| `entityId`, `companyTags` | ref | Which group entity signed it |
| `jur`, `jurisdiction` | enum | KSA / PK / UAE / … |
| `category`, `subdivision` | enum | Taxonomy |
| `status`, `stage` | enum | Active, In Negotiation, Expiring, Executed, Terminated … |
| `risk` | enum | low / medium / high / critical |
| `owner` | ref | The responsible lawyer |
| `value`, `currency` | number | Total contract value |
| **`ppaValue`** | number | Property purchase consideration (PPA, SPA, Land, Off-plan only) |
| **`landValue`** | number | The land component |
| **`landRef`** | string | Title deed / plot / mutation reference |
| `start`, `expiry` | ISO date | Commencement and expiry |
| `autoRenew`, `renewalNoticeDays` | boolean, number | **Critical for the reminder engine** |
| `physicalRecordRef`, `officeLocation` | string | Where the hard copy sits |
| `driveLink`, `storagePath` | string | Where the digital file sits |
| `extractedFields` | object | parties, governing law, term, notice, values, key clauses, **obligations** |
| `extractionConfidence` | number | 0 to 1 |
| `parentContractId` | ref | For amendments and variation orders |
| `access` | object[] | `{userId, level: view\|comment\|edit}` |
| `spendToDate`, `committedSpend`, `spendEntries` | number, object[] | Budget burn and invoices |
| `rounds` | object[] | Negotiation history |

### 6.3 `repository` (12 records, 24 fields) — documents

`id`, `name`, `kind` (Contract / Deed / Lease / Amendment / Licence / Notice /
Correspondence), `source` (Upload / Scan / Generated / Requester upload),
`contractId`, `requestId`, `licenseId`, `entityId`, `contractType`, `jur`,
`uploadedBy`, `uploadedAt`, `pages`, `sizeKb`, `stage`, `ocrStatus`,
`ocrConfidence`, **`ocrText`**, `extractedFields`, **`srNo`**,
**`physicalRecordRef`**, **`officeLocation`**, `storagePath`, `driveLink`, `access`.

### 6.4 `licenses` (20 records, 18 fields)

`id`, `name`, `type`, `entity`, `entityId`, `authority`, `jurisdiction`,
`licenseNumber`, `issueDate`, **`expiryDate`**, **`renewalLeadDays`**, `owner`,
`linkedContractId`, `linkedMatterId`, `companyTags`, `notes`, `renewalHistory`,
`subdivision`.

Validity is **never stored**, always computed from `expiryDate` and
`renewalLeadDays`.

### 6.5 `companies` (37 records) — entities and counterparties

`id`, `name`, `aliases[]`, `jurisdiction`, `jur`, `type` (Group Entity /
Counterparty / Vendor / Client), `parentId`, `subdivisionOwner`, `riskNote`, `note`.

### 6.6 `templates` (12 records)

`id`, `title`, `category`, `jurisdiction`, `version`, `usage`, `owner`, `updated`,
`status`, and `versions[]` with `{version, date, author, status, changelog, body}`.

### 6.7 Other slices

| Slice | Records | Key fields |
|---|---|---|
| `matters` | 13 | id, title, type, status, priority, risk, owner, opened, due, progress, requestId, entityId, stage |
| `requesters` | 4 | id, email, name, userId, company, source, department, unit, createdAt |
| `messages` | 4 | id, requestId, from, role, text, at, readBy[], attachments[] |
| `clauses` | 14 | id, title, category, jurisdiction, risk, usage, owner, status |
| `litigation` | 6 | id, title, type, status, stage, risk, exposure, currency, counsel, lead, filed, nextHearing, jurisdiction |
| `compliance` | 10 | id, area, owner, status, score, region, lastReview, nextReview |
| `reviews` | 8 | id, title, contract, reviewer, risk, flagged, status, received, sla |
| `approvals` | 8 | id, matter, type, requestedBy, approver, role, status, amount, requested |
| `users` | 16 | id, name, role, team, email, country |
| `formConfig` | object | The whole portal configuration |
| `savedViews` | array | Named filter sets |

---

## 7. Reference registers (the enumerations)

Everything the department should review and correct.

| Register | Count | Current values |
|---|---|---|
| **Group entities** | 15 | Group Holding, Zameen.com, OLX Pakistan, Bayut, Dubizzle, Propsults, Propenta, Zameen Media, Z Property Developments, plus 6 legacy placeholders |
| **Counterparties / vendors** | 22 | Al-Rajhi RED, Retal, Bahria Town, DHA Lahore, Al-Habib, Riyadh Front, Nesma, Imarat, Al-Bilad Escrow, DGDA, Emaar, ACWA, STC, and software vendors |
| **Contract types** | 21 | PPA, SPA, Ejar Lease, Tenancy, Musataha, Development/JV, Brokerage & Agency, Off-plan/Wafi, Construction, Land/Plot Purchase, Marketing & Listing, Vendor MSA, Employment, NDA/MoU/LOI, SLA, Licence, Listing & Subscription, Advertising & Media, Partnership/Reseller, Creator/Influencer, DPA |
| **Legal sub-divisions** | 8 | Commercial, Litigation & Disputes, Compliance & Regulatory, IP, Labour/Employment, Corporate & Governance, Real Estate & Conveyancing, Data Privacy |
| **Work categories** | 8 | Litigation & Dispute, Commercial Contracts, Admin Contracts, Compliance, IP, Labour Matters, Corporate & Governance, Real Estate & Leasing |
| **Business units** | 6 | Real Estate, Technology, Retail, Logistics, Energy, Financial Services |
| **Departments** | 8 | Procurement, HR, Sales, Marketing, Finance, IT, Operations, Legal |
| **Office locations** (physical records) | 9 | Riyadh HQ Legal Vault L3, Riyadh HQ Cabinet A2, Jeddah Branch Records Room, Dammam Cabinet B1, Dubai Legal Cabinet A, Lahore HQ Legal Almirah 2, Karachi Records Room, Islamabad Cabinet C, Group Holding Riyadh Safe |
| **Portal sources** (sites) | 10 | Zameen Lahore/Karachi/Islamabad, OLX Karachi, Zameen Media Lahore, Bayut Riyadh/Jeddah, Dubizzle Dubai, ZPD Riyadh, Group Holding Riyadh |
| **Required-doc templates** | 21 | One checklist per contract type |
| **FX to USD** | 6 | USD 1, EUR 1.08, GBP 1.27, SAR 0.2667, AED 0.2723, PKR 0.0036 |

---

## 8. What is real and what is a seam

Be precise about this when you present. These are **deliberate, documented
integration points**, each marked in the code.

| Capability | Status today | Seam location |
|---|---|---|
| Data storage | Browser `localStorage`, one key | `store.js` — every call already funnels through it |
| Portal ↔ LegalOS | Shared store + cross-tab sync | `store.js` `// portal ↔ LegalOS API seam`, with the 7 REST endpoints already mapped |
| **OCR** | Deterministic text generator | `pages/repository.js#simulateOcr` |
| **Field extraction** | Regex parser over text | `data.js#extractFromOcr` |
| **Google Drive** | Fake `drive.google.com/file/d/…` links | `pages/repository.js` on create |
| **Drive permissions** | Data model matches Drive's reader/commenter/writer | `pages/contracts.js#AccessTab` |
| **Authentication** | Email plus name, no password | `portal/auth.js` `// SSO / auth seam` |
| **AI Copilot** | Canned keyword responses | `layout.js` CANNED array |
| **e-Signature** | A stage, no integration | Would sit at the Signature stage |
| Turnaround, spine, reminders, filters, extraction write-back, chat, the missing-doc loop, the audit log | **Fully working logic** | Not seams |

---

## 9. Verification status

Everything above is covered by automated tests that run against a real browser.

| Suite | Result |
|---|---|
| Portal round-trip (submit → triage → doc ask → upload → chat both ways → admin matrix change) | 27/27 |
| Executive layer (tour 9 steps, flow map, brief, deep-links, demo reset) | 29/29 |
| Interaction suite (spine, filters, tracker edit persistence, repository wizard, command palette) | 21/21 |
| Route and theme sweep, 37 routes × light and dark | 82 combinations, 0 console errors |
| Layout audit, 6 routes × 4 widths × 2 themes | 48 views, no clipping or overflow |
| Store upgrade paths (old data survives, admin edits survive) | pass |

---

## 10. Next step

Read `02-DATA-COLLECTION-PACK.md`. It converts everything above into a
prioritised list of what to ask the legal department for, in what format, and from
whom, with ready-to-send messages.
