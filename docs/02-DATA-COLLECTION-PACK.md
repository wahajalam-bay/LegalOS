# Data Collection Pack — replacing the placeholder data with the real thing

**Who this is for.** You, going into a conversation with the legal department.

**What it does.** Converts every feature in `01-SYSTEM-FUNCTIONALITY.md` into a
concrete list of what to ask for, in what format, from whom, and in what order.

**The framing that works.** Do not ask for "your data". Ask for **twelve specific
things**, most of which already exist as spreadsheets, folders or someone's head.
Lead with what you will give back: a live contract register, automatic renewal
reminders, and a turnaround number they can defend to the CEO.

---

## Part 1 — How to run the collection

Three phases. Do not try to collect everything at once, and do not start with the
contracts.

| Phase | Goal | What you collect | Why this order |
|---|---|---|---|
| **1. Skeleton** (week 1) | Make the system *theirs* | Items 1 to 6: entities, team, contract types, sub-divisions, offices, turnaround table | Cheap, no confidentiality issue, mostly decisions not documents. The moment these land, every screen stops saying "Northwind" and starts saying Bayut and Zameen. This is what converts scepticism. |
| **2. Live spine** (weeks 2 to 3) | Make it usable | Items 7 to 10: the contract register, the licence register, templates, the current request backlog | The real work. The contract register is the heaviest lift and the highest payoff. |
| **3. Depth** (week 4+) | Make it complete | Items 11 to 15: documents and drives, obligations, litigation, compliance, historical volumes | Only worth doing once they believe the skeleton. |

**Rule for phase 2: pilot one entity first.** Pick **Bayut KSA** or **Zameen.com**,
load 20 to 30 real contracts, and show them their own portfolio. Asking for all
entities at once gets you a committee. Asking for one entity gets you a champion.

---

## Part 2 — The twelve asks

Each ask lists: **what it is · who has it · what format · priority · which screens
come alive**.

---

### PHASE 1 — SKELETON

### Ask 1. The legal entity structure

**What:** every company in the group that signs contracts, with its jurisdiction
and its parent.

**Who:** General Counsel or Company Secretary. Often already in a group structure
chart or the corporate register.

**Format:** spreadsheet.

| Column | Example | Notes |
|---|---|---|
| Entity name | Bayut | As it appears on contracts |
| Short name / alias | Bayut KSA, Bayut.sa | For search |
| Jurisdiction | Saudi Arabia | |
| Country code | KSA | KSA / PK / UAE |
| Parent entity | Group Holding | Blank for the topco |
| Type | Group Entity | Group Entity / Counterparty / Vendor / Client |
| Which legal desk owns it | Real Estate & Conveyancing | Optional |
| CR / registration number | 1010557781 | Optional, useful later |

**Priority: critical.** Nothing works without this.

**Brings alive:** every entity filter, the portfolio-by-entity chart, the portal's
step 2, the drill-down browse, the tracker's entity column.

**Currently placeholder:** 15 entities, 9 of them real names (Zameen, OLX, Bayut,
Dubizzle, Propsults, Propenta, Zameen Media, Z Property Developments, Group
Holding) and 6 invented placeholders (Northwind KSA/UAE/UK/US/Singapore/Pakistan)
that should be deleted or replaced.

---

### Ask 2. The legal team roster

**What:** everyone in the department, their role, their desk, and roughly how many
matters each can carry.

**Who:** GC or the legal ops lead.

**Format:** spreadsheet.

| Column | Example |
|---|---|
| Full name | (real names) |
| Role / title | Senior Counsel |
| Legal desk | Commercial |
| Country | Saudi Arabia |
| Work email | |
| Capacity (open matters) | 18 |
| Can approve up to | value or risk threshold |

**Priority: critical.**

**Brings alive:** owner assignment, Team Pipelines, the load-balance view, approval
chains, the "who is holding it" line on every record.

**Note on capacity:** they will not have a number. Ask "how many open matters is
too many for one person?" and use that. It only drives the load bar.

---

### Ask 3. The contract type register

**What:** the list of contract types they actually use, per entity.

**Who:** the lawyers who do the drafting, not the GC.

**Format:** review the existing list and correct it. The system currently has
**21 types**. Print section 7 of the functionality doc and mark it up.

Ask specifically:
- Which of these 21 do you never use? *(delete)*
- What do you call this one internally? *(rename)*
- What are we missing? *(add)*
- Which types carry a **property purchase value and a separate land value**?
  Currently: PPA, SPA, Land/Plot Purchase, Off-plan/Wafi, Musataha, Development/JV.

**Priority: critical.**

**Brings alive:** the turnaround matrix, the portal's step 3, the analyzer's PPA
view, the contract-type drill-down, required-document checklists.

---

### Ask 4. The company × contract type matrix

**What:** for each entity, which contract types the business is allowed to request.

**Who:** GC. This is a policy decision, not data.

**Format:** a grid. Entities down the side, contract types across the top, tick the
cells. Section 5 of the functionality doc has the current grid to mark up.

**Priority: high.** This is the one that makes the portal feel bespoke: a Zameen
user never sees Musataha, a Z Property user never sees Creator/Influencer.

**Brings alive:** the portal's step 3. Editable in Settings → Request Form with no
code change, so they can own it permanently.

---

### Ask 5. Turnaround expectations (the TAT matrix)

**What:** how many **working days** each contract type should take at each risk
level.

**Who:** GC, ideally with the business in the room.

**Format:** take the table in section 4.2 of the functionality doc and let them
correct the numbers. 84 cells, but they will move fast once they see the pattern.

Also confirm:
- **Is the working week Sunday to Thursday?** The system currently treats
  **Friday and Saturday** as the weekend. Confirm per country, since Pakistan is
  usually Monday to Friday or Saturday.
- Should the clock **pause** when the ball is with the business or the
  counterparty? The system does this today, and it is the fairest reading, but they
  must agree because it changes every "delayed" number.
- How is the risk tier decided? Value threshold, contract type, or judgement?

**Priority: critical.** This is the number the CEO will quote. It has to be theirs.

**Brings alive:** every TAT status, the delayed lists, the executive turnaround
metric, the whole enforcement story.

---

### Ask 6. Legal desks, categories and physical record locations

**What:** three small lists.

1. **Legal sub-divisions** — the desks work is routed to. Currently 8: Commercial,
   Litigation & Disputes, Compliance & Regulatory, IP, Labour/Employment,
   Corporate & Governance, Real Estate & Conveyancing, Data Privacy.
2. **Work categories** — the reporting taxonomy. Currently 8, overlapping with the
   above. **Ask whether they need both**; if not, we collapse to one.
3. **Physical record locations** — the actual cabinets, vaults and almirahs where
   hard copies live, per office. Currently 9 placeholder locations.

**Who:** legal ops, and whoever manages the filing.

**Priority: high** for sub-divisions, **medium** for the rest.

**Brings alive:** routing, the sub-division filter, and the Sr No → physical record
mapping that makes the repository trustworthy.

---

### PHASE 2 — LIVE SPINE

### Ask 7. The contract register  ← **the big one**

**What:** every live contract. If they have a spreadsheet, this is one file. If
they do not, this is the project.

**Who:** contract manager, legal ops, or whoever maintains the renewals list.

**Format:** one row per contract. Ask for what they have; do not insist on every
column.

| Column | Priority | Notes |
|---|---|---|
| Sr No / internal reference | must | The number that ties to the physical file |
| Contract title | must | |
| Our entity | must | Must match Ask 1 |
| Counterparty name | must | |
| Contract type | must | Must match Ask 3 |
| Status | must | Active / In negotiation / Expiring / Terminated |
| Total value | must | |
| Currency | must | SAR / PKR / AED / USD |
| Start date | must | |
| Expiry date | must | **Drives every reminder** |
| Auto-renews? | must | Yes/No. **Where money leaks** |
| Notice period (days) | must | **The sharpest reminder signal** |
| Responsible lawyer | must | Must match Ask 2 |
| Risk tier | should | low / medium / high / critical |
| **Property purchase value** | should | PPA, SPA, Land, Off-plan only |
| **Land value** | should | The land component |
| **Title deed / plot / mutation reference** | should | e.g. "Deed 310204009871, Plot 44/B" |
| Physical file location | should | Which cabinet |
| Link to the digital file | should | Drive or SharePoint URL |
| Governing law | nice | |
| Spend to date | nice | Enables the budget-burn view |
| Parent contract | nice | For amendments and variation orders |

**Priority: critical, but pilot it.** Start with one entity and 20 to 30 contracts.

**Brings alive:** the Contract Tracker, the Data Analyzer, portfolio value, the
expiry radar, renewal reminders, the executive hero metric. Roughly half the
system.

**What to say if they push back on volume:** "Give me the twenty contracts you
worry about most." That is enough to make the tracker real.

---

### Ask 8. The licence and registration register

**What:** every regulatory licence, registration and permit, per entity.

**Who:** compliance officer, or company secretary.

**Format:** spreadsheet. This one is usually the easiest win because it often
already exists and they already worry about it.

| Column | Example |
|---|---|
| Licence name | REGA Brokerage Licence |
| Type | Real Estate Brokerage |
| Entity | Bayut |
| Issuing authority | Real Estate General Authority (REGA) |
| Jurisdiction | KSA |
| Licence number | REGA-BRK-4471 |
| Issue date | |
| **Expiry date** | **drives the alert** |
| Renewal lead time (days) | 90 |
| Responsible owner | |
| Linked contract or matter | optional |
| Notes | |

Types already modelled: REGA brokerage and property management, Wafi off-plan
sales permit, RERA broker registration, Trakheesi advertising permit, Ejar
platform registration, ZATCA VAT, MISA investment, Balady municipal, Commercial
Registration, Civil Defense, DED trade licence, SECP, PLRA e-stamp, PSEB, FBR NTN,
Punjab Revenue Authority, SAIP and IPO trademarks.

**Priority: high.** Small dataset, immediate visible value, and lapses are real
money.

**Brings alive:** the Licences module, expiry alerts, the analyzer's licence
rollup, the executive "licences in good standing" tile.

---

### Ask 9. The template library and required-document checklists

**What:** two things.

**9a. The templates themselves.** The actual Word or PDF files they draft from, with:
- template name and what it is for
- current approved version number
- jurisdiction it applies to
- who owns and approves it
- what changed in the last version, if they track that

Ask for **the files**, not a list. Even 6 to 10 real templates makes the templating
module honest.

**9b. Required-document checklists per contract type.** For each contract type,
what does legal always have to chase? Section 5 of the functionality doc has a
first draft (for example PPA needs title deed, valuation report, board resolution,
counterparty CR). **Get them to correct it.**

**Who:** the drafting lawyers.

**Priority: high** for 9b (it drives the missing-document loop, which is the
feature the business will feel most), **medium** for 9a.

**Brings alive:** the template library, version control, generate-into-draft, and
the whole missing-document loop on both sides.

---

### Ask 10. The current request backlog

**What:** what is on the department's plate right now.

**Who:** whoever tracks work today, even if that is an inbox or a WhatsApp group.

**Format:** spreadsheet, or a screenshot of however they track it.

| Column | Notes |
|---|---|
| What was asked for | |
| Who asked | name, email, and which site or office |
| Which entity | |
| Contract type | if applicable |
| Date requested | |
| Date needed by | |
| Current stage | in their words; we map it |
| Responsible lawyer | |
| Is it late? | their judgement |
| What is it waiting on? | **the most valuable column** |

**Priority: high.** 15 to 20 live items is plenty.

**Brings alive:** the Legal Workspace worklist, the kanban, the request log, the
delayed view, Team Pipelines, and the flow map's live counts. It also proves the
turnaround engine against work they recognise.

---

### PHASE 3 — DEPTH

### Ask 11. Documents and where files live

**What:** access to, or a copy of, the actual document store.

**Who:** legal ops plus IT.

**Ask these questions:**
1. Where do signed contracts live today? Google Drive, SharePoint, a file server, a
   physical cabinet, or all four?
2. Is there a folder convention? (for example `/Legal/KSA/Leases/2026/`)
3. Who has access, and at what level?
4. Are documents scanned, and if so at what quality? **This decides whether OCR is
   worth wiring.**
5. Can we get **10 to 20 sample documents** across different types (a PPA, an Ejar
   lease, a plot purchase, a construction contract, a licence certificate, an
   amendment) to test extraction against real paper?
6. Do hard copies have a numbering system already? If so, use theirs as the Sr No.

**Priority: medium**, but the 10 to 20 samples are **high** because they are the
only way to know whether real extraction is feasible.

**Brings alive:** the repository, real Drive links, the OCR and extraction seams.

---

### Ask 12. Obligations, litigation, compliance and history

Four smaller registers, each worth having but none blocking.

**12a. Obligations.** Post-signature commitments with dates: performance bond
renewals, notices to serve, registration filings, milestone certificates. Usually
lives in people's heads. Ask: "what have you been caught out by?"

**12b. Litigation register.** Case title, type, stage, exposure and currency,
external counsel, filing date, next hearing, jurisdiction.

**12c. Compliance framework.** The regulatory areas they are assessed against
(data protection under PDPL and GDPR, anti-bribery, labour law, AML/KYC, and so
on) with owner, score or status, and review dates.

**12d. Historical volumes.** Monthly request counts and average turnaround for the
last 6 to 12 months. **Needed to replace the hardcoded trend lines** on the
dashboard and the executive sparkline. Even rough numbers beat invented ones.

**Priority: medium.** 12d is worth pushing for because the executive view currently
shows an invented trend, which is the one honesty gap in the demo.

---

## Part 3 — Confidentiality, and the question they will ask first

A legal department's instinct with "send me your contracts" is to say no. Get
ahead of it. **Raise this before they do.**

**The questions they will ask, and the answers you need ready:**

| Their question | What to have ready |
|---|---|
| Where does this data live? | Today: only in the browser on one machine, in `localStorage`. Nothing leaves the device. There is no server and no database yet. |
| Who can see it? | Whoever opens that browser. **There is no authentication yet.** Be honest: this is a prototype. |
| Is it on the internet? | Only if deployed. Right now it runs on `localhost`. |
| What happens when it is real? | That is the conversation to have: hosting, SSO, role-based access, audit, retention, and which jurisdiction the data sits in. |
| Can we start without real contracts? | **Yes, and you should.** Phases 1 and 2 need registers and metadata, not the documents themselves. |

**The de-risking offer, in order of preference:**

1. **Metadata only.** The tracker needs *counterparty, type, value, dates, owner*.
   It does not need the contract text. This alone lights up most of the system.
2. **Pilot one entity.** One entity, 20 contracts, expiring soonest.
3. **Redacted samples.** For the 10 to 20 documents in Ask 11, redacted or already
   public ones are fine for testing extraction.
4. **Their machine, not yours.** For anything sensitive, run it on a legal-team
   laptop so nothing moves.

**Flag honestly:** the current build has **no authentication and no access control**
between users. Everyone who opens it sees everything. That is fine for a prototype
and unacceptable for real contract data, and it is the first thing to build if this
goes forward. Saying this yourself buys you enormous credibility.

---

## Part 4 — Ready-to-send messages

### 4.1 First message to the General Counsel

> Subject: 20 minutes on the legal request system, and a small data ask
>
> Hi [name],
>
> Following on from the walkthrough, I have the system working end to end: the
> business raises a request through a portal, it lands with the team with a
> turnaround already fixed, and it stays traceable through to a signed contract
> that is filed and watched for renewal.
>
> It is currently running on placeholder data, so it looks like a demo rather than
> like your department. I would like to change that.
>
> To make it yours I need six things first, and none of them are contracts:
>
> 1. The list of legal entities that sign contracts, with jurisdiction and parent
> 2. The team, their desks, and roughly how many matters each can carry
> 3. The contract types you actually use (I have a draft list of 21 to correct)
> 4. Which contract types each entity should be allowed to request
> 5. Your turnaround expectations in working days, by contract type and risk
> 6. Your legal desks, and where hard copies are physically filed
>
> Most of that is decisions rather than documents, and I think we can get through
> it in one sitting. Once it lands, every screen shows your entities and your
> process instead of invented ones.
>
> After that I would like to pilot one entity, say Bayut KSA, with 20 to 30 real
> contracts, so you can see your own portfolio, your own expiry dates and your own
> renewal reminders. Metadata only at that stage: counterparty, type, value, dates
> and owner. No contract text needed.
>
> Could we book 45 minutes? I will bring the draft lists so we are correcting
> rather than starting from blank.
>
> Thanks,
> [you]

### 4.2 Message to the contract manager or legal ops

> Subject: The contract register, and whether one already exists
>
> Hi [name],
>
> I am loading real data into the legal request system and the contract register is
> the part that unlocks the most: the tracker, the expiry radar, the renewal
> reminders and the portfolio value all read from it.
>
> Before I ask you to build anything: **is there already a spreadsheet?** A renewals
> list, a master tracker, anything. If so, send it as it is. I will work with
> whatever columns exist rather than asking you to reformat.
>
> If there is not one, could we start with the 20 to 30 contracts you worry about
> most? For each: our entity, counterparty, contract type, status, value and
> currency, start and expiry date, whether it auto-renews, the notice period, and
> the responsible lawyer.
>
> Two extras that matter for the real-estate paper, where you have them:
> the property purchase value and the land value separately, and the title deed or
> plot reference.
>
> And one question: do hard copies already have a numbering system? If they do I
> will use yours rather than inventing one, so the system points at the right shelf.
>
> Thanks,
> [you]

### 4.3 Message to the compliance officer

> Subject: The licence register
>
> Hi [name],
>
> The system tracks regulatory licences and works out validity automatically from
> the expiry date, so it flags anything expiring inside its renewal window and
> anything already lapsed.
>
> Do you have a list? Ideally: licence name, type, which entity holds it, the
> issuing authority, the licence number, issue and expiry dates, how far ahead you
> normally start the renewal, and who owns it.
>
> I have modelled REGA, Wafi, RERA, Trakheesi, Ejar, ZATCA, MISA, Balady, CR, Civil
> Defense, DED, SECP, PLRA, PSEB, FBR, PRA and the trademark registrations, so the
> shape should already fit. Correcting my list is fine if that is faster.
>
> Thanks,
> [you]

### 4.4 Message to the drafting lawyers

> Subject: Templates, and what you always end up chasing
>
> Hi both,
>
> Two quick things for the request system.
>
> First, could you send me the templates you actually draft from? Even six or eight
> is enough. I want the real files, with the current version number and who
> approves changes.
>
> Second, and this is the one the business will feel: **for each contract type,
> what documents do you always have to chase?** For a property purchase I have
> guessed title deed, valuation report, board resolution and the counterparty CR.
> If that list is right, the portal will ask the requester for them up front, and
> when you need something later you can request it in one click and they get
> prompted. Correct my guesses and add the ones I have missed.
>
> Thanks,
> [you]

---

## Part 5 — The 45-minute meeting agenda

Bring printed copies of section 7 (the registers) and section 4.2 (the turnaround
matrix) from the functionality doc so they are marking up rather than starting cold.

| Time | Topic | Outcome |
|---|---|---|
| 0 to 5 | Show `/exec`, then take the 5-minute tour | They see the whole loop before any discussion of data |
| 5 to 12 | The two-tab round trip: submit in the portal, watch it land, ask for a document, watch the requester get prompted | This is the moment they buy in |
| 12 to 18 | "Everything you just saw is invented. Here is what I need to make it yours." Walk asks 1 to 6 | Agreement on scope |
| 18 to 30 | Mark up the entity list, the contract types and the legal desks, live | **Three registers done in the room** |
| 30 to 40 | The turnaround matrix. Confirm the working week and the pause rule | The number they will defend |
| 40 to 45 | Agree the pilot entity and who owns each remaining ask, with dates | Named owners, not "the team will" |

**Leave with:** a pilot entity chosen, a named owner per ask, and a date for the
contract register.

---

## Part 6 — Where each ask lands in the system

The engineering mapping, so nothing collected goes to waste.

| Ask | Store slice or config | File |
|---|---|---|
| 1. Entities | `companies` | `data.js` `COMPANIES`, `GROUP_ENTITIES` |
| 2. Team | `users` | `data.js` `USERS`, capacities in `pages/pipelines.js` |
| 3. Contract types | register | `data.js` `CONTRACT_TYPE_REGISTER` |
| 4. Company × type matrix | `formConfig` | `data.js` `COMPANY_CONTRACT_TYPES`, editable in Settings |
| 5. Turnaround matrix | register | `data.js` `TAT_MATRIX`, `TAT_REQUEST_FACTOR`; working week in `tat.js` `WEEKEND` |
| 6. Desks, categories, offices | registers | `data.js` `LEGAL_SUBDIVISIONS`, `WORK_CATEGORIES`, `OFFICE_LOCATIONS` |
| 7. Contract register | `contracts` | `data.js` `CONTRACTS` |
| 8. Licence register | `licenses` | `data.js` `LICENSES` |
| 9a. Templates | `templates` | `data.js` `TEMPLATES` + `TPL_VERSIONS` |
| 9b. Required-doc checklists | `formConfig` | `data.js` `REQUIRED_DOC_TEMPLATES`, editable in Settings |
| 10. Request backlog | `requests` | `data.js` `REQUESTS` |
| 11. Documents and drives | `repository` | `data.js` `REPOSITORY`; storage seam in `pages/repository.js` |
| 12a. Obligations | `contracts[].extractedFields.obligations` | `data.js` `OBLIGATION_SEED` |
| 12b. Litigation | `litigation` | `data.js` `LITIGATION` |
| 12c. Compliance | `compliance` | `data.js` `COMPLIANCE` |
| 12d. Historical volumes | `DASH` | `data.js` `DASH.tatTrend`, `volumeTrend`, `heat` |

**A note on how loading works today.** All of the above are JavaScript arrays in
`src/data.js`. Loading real data currently means editing that file. If the volume
is more than a few hundred rows, the right move is to add a small CSV import step
first rather than hand-editing. Flag that when the contract register arrives.

---

## Part 7 — What NOT to ask for yet

Restraint buys credibility. Leave these out of the first conversation.

| Do not ask yet | Why |
|---|---|
| Full contract text or PDFs in bulk | Metadata lights up most of the system. Asking for documents triggers the confidentiality conversation before you have earned it. |
| Anything privileged: litigation strategy, advice memos, board papers | Never needed for what is built. |
| Personal data beyond work name, work email and department | No reason to hold more. |
| Historical spend and invoices | The spend view is a nice-to-have. |
| Clause-level playbook detail | Only after templates land. |
| Access to live Google Drive or SharePoint | Sample files first. Integration is a later decision. |
| Their AI or automation wish list | It will expand scope before the basics are real. |

---

## Part 8 — Honest gaps to disclose

Say these yourself. Each one is small, and volunteering them makes everything else
believable.

1. **No authentication or access control.** Everyone who opens it sees everything.
   First thing to build for real data.
2. **No backend.** Data lives in one browser. Not shared, not backed up, cleared if
   the browser is cleared.
3. **OCR and extraction are simulated.** Deterministic parsers, not a model. The
   seams are marked and the interface will not change, but nobody has read a real
   scanned deed yet.
4. **Drive links are fabricated.** The permission model matches Drive's
   reader/commenter/writer, but nothing is connected.
5. **The AI Copilot is canned responses**, matched on keywords.
6. **The dashboard trend lines are invented.** This is why Ask 12d matters.
7. **No e-signature integration.** Signature is a stage, not a DocuSign call.
8. **Working week is hardcoded** to a Friday and Saturday weekend, which is wrong
   for Pakistan. Confirm in Ask 5.

---

## Quick reference: the whole ask on one page

| # | Ask | Who | Priority | Phase |
|---|---|---|---|---|
| 1 | Legal entity structure | GC / Company Secretary | Critical | 1 |
| 2 | Team roster and capacity | GC / Legal ops | Critical | 1 |
| 3 | Contract type register | Drafting lawyers | Critical | 1 |
| 4 | Company × contract type matrix | GC | High | 1 |
| 5 | Turnaround matrix, working week, pause rule | GC + business | Critical | 1 |
| 6 | Legal desks, categories, physical record locations | Legal ops | High | 1 |
| 7 | **Contract register** | Contract manager | **Critical** | 2 |
| 8 | Licence register | Compliance officer | High | 2 |
| 9 | Templates and required-document checklists | Drafting lawyers | High | 2 |
| 10 | Current request backlog | Legal ops | High | 2 |
| 11 | Documents, drives, and 10 to 20 samples | Legal ops + IT | Medium | 3 |
| 12 | Obligations, litigation, compliance, historical volumes | Various | Medium | 3 |
