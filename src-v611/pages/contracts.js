// Contracts — CLM portfolio + contract workspace (preview · clauses · AI review).
import { html, cx, fmt, useState, useEffect } from "../core.js";
import { RaiseCase } from "../raisecase.js";
import { CaseLinks } from "../caseactions.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Pill, Status, Tabs, Stepper, AICard, Dropdown, MenuItem, Progress, Modal, Field, Input, Timeline } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { RegisterShell } from "../register.js";
import { useFilterLink } from "../filters.js";
import { contractFields, contractColumns, contractViews, contractSearchKeys, contractExpiryMatch } from "../registerdefs.js";
import { navigate } from "../router.js";
import {
  BUSINESS_UNITS, COUNTRIES, WORK_CATEGORIES, inferCategory, nameOf, byId, USERS,
  CONTRACT_TYPE_CODES, GROUP_ENTITIES, riskGatesFor, ACCESS_LEVELS, ACCESS_LABEL, toUsd,
  } from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, daysFromNow } from "../store.js";
import { CategoryPill, TagChips, TagEditor } from "../shared.js";
import { WorkflowSpine } from "../spine.js";
import { rowTat } from "../flow.js";
import { useRegister, findByIdOrLegacy } from "../live.js";
import { LegalDocuments } from "../legaldocuments.js";
import { RecordAssist } from "../recordassist.js";
import { api } from "../api.js";

// Burn helpers (Feature 2)
const burnPct = (c) => ((c.value || 0) ? Math.round(((c.spendToDate || 0) / c.value) * 100) : 0);
const commitBurnPct = (c) => ((c.value || 0) ? Math.round((((c.spendToDate || 0) + (c.committedSpend || 0)) / c.value) * 100) : 0);

// Eight stages, not ten. "Intake" was a hand-off inside Request and "Executed"
// is the moment Active begins — neither earned a step of its own on a rail
// this long. Records still carry the finer-grained stage names, so STAGE_FOLD
// maps what the data says onto what the rail shows; without it a value like
// "Legal Review" missed the rail entirely and fell back to a hardcoded index.
const CLM_STAGES = ["Request", "Review", "Drafting", "Negotiation", "Approval", "Signature", "Active", "Renewal"];
const STAGE_FOLD = {
  Intake: "Request", Triage: "Request",
  "Legal Review": "Review", Vetting: "Review",
  "Notice Drafting": "Drafting",
  Executed: "Active", Signed: "Active", Repository: "Active", Extraction: "Active", Archive: "Active",
};
const railStage = (stage) => STAGE_FOLD[stage] || stage;
const CONTRACT_TYPES = ["MSA", "SaaS / MSA", "Vendor", "Consultancy", "Lease", "Partnership", "Framework", "Supply", "SOW", "Insurance", "Reseller"];
const CURRENCIES = ["USD", "SAR", "AED", "GBP", "EUR", "PKR"];

function NewContractModal({ onClose, onCreate }) {
  const [f, setF] = useState({ title: "", counterparty: "", type: "MSA", bu: BUSINESS_UNITS[0], value: "", currency: "USD", risk: "medium", jurisdiction: COUNTRIES[0], category: inferCategory({ type: "MSA" }) });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    onCreate({
      id: nextId("contracts", "CTR-"), title: f.title.trim() || "Untitled contract", type: f.type,
      counterparty: f.counterparty || "—", bu: f.bu, status: "Drafting", risk: f.risk,
      category: f.category || inferCategory({ type: f.type, title: f.title }), companyTags: [],
      spendToDate: 0, committedSpend: 0, spendEntries: [], rounds: [],
      value: f.value ? Number(String(f.value).replace(/[^0-9.]/g, "")) : 0, currency: f.currency,
      owner: "u5", start: nowIso(), expiry: daysFromNow(365), autoRenew: false, jurisdiction: f.jurisdiction, stage: "Drafting",
    });
    onClose();
  };
  return html`<${Modal} title="New Contract" icon="file" width=${580} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>Create contract</${Btn}>`}>
    <div class="col" style="gap:16px">
      <${Field} label="Contract title"><${Input} placeholder="e.g. Salesforce Enterprise License Agreement" value=${f.title} onInput=${(e) => set("title", e.target.value)} /></${Field}>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Counterparty"><${Input} placeholder="e.g. Salesforce Inc." value=${f.counterparty} onInput=${(e) => set("counterparty", e.target.value)} /></${Field}>
        <${Field} label="Type"><select class="select" value=${f.type} onChange=${(e) => set("type", e.target.value)}>${CONTRACT_TYPES.map((t) => html`<option key=${t}>${t}</option>`)}</select></${Field}>
        <${Field} label="Business Unit"><select class="select" value=${f.bu} onChange=${(e) => set("bu", e.target.value)}>${BUSINESS_UNITS.map((b) => html`<option key=${b}>${b}</option>`)}</select></${Field}>
        <${Field} label="Jurisdiction"><select class="select" value=${f.jurisdiction} onChange=${(e) => set("jurisdiction", e.target.value)}>${COUNTRIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></${Field}>
        <${Field} label="Value"><${Input} placeholder="e.g. 2400000" value=${f.value} onInput=${(e) => set("value", e.target.value)} /></${Field}>
        <${Field} label="Currency"><select class="select" value=${f.currency} onChange=${(e) => set("currency", e.target.value)}>${CURRENCIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></${Field}>
        <${Field} label="Risk"><select class="select" value=${f.risk} onChange=${(e) => set("risk", e.target.value)}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></${Field}>
        <${Field} label="Category"><select class="select" value=${f.category} onChange=${(e) => set("category", e.target.value)}>${WORK_CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></${Field}>
      </div>
      <${AICard} title="On create">I'll start the contract at the <b>Drafting</b> stage, generate a first draft from the matching template, and queue an AI clause review.</${AICard}>
    </div>
  </${Modal}>`;
}

const CLAUSES_NAV = [
  { n: "1", t: "Parties & Recitals", risk: null },
  { n: "2", t: "Definitions", risk: null },
  { n: "3", t: "Scope of Services", risk: null },
  { n: "4", t: "Term & Renewal", risk: "medium" },
  { n: "5", t: "Fees & Payment", risk: null },
  { n: "6", t: "Limitation of Liability", risk: "high" },
  { n: "7", t: "Data Protection", risk: "high" },
  { n: "8", t: "Confidentiality", risk: null },
  { n: "9", t: "Termination", risk: "medium" },
  { n: "10", t: "Governing Law & Disputes", risk: null },
];

/* ---- Feature 2: Spend tab + add-expense ----
   Cost is tracked by TYPE, not as one undifferentiated "spend to date":
   external counsel, internal legal time, and the administrative outlay
   (stamp paper, attestation, notarisation). Entries recorded before this
   existed are read as external legal, which is what they were. */
export const COST_TYPES = [
  { key: "external", label: "External legal cost", hint: "outside counsel, filing agents" },
  { key: "internalLegal", label: "Internal legal cost", hint: "in-house time charged to the matter" },
  { key: "internalAdmin", label: "Internal admin cost", hint: "stamp paper, attestation, notarisation" },
];
const costOf = (entries, key) => (entries || [])
  .filter((e) => (e.costType || "external") === key)
  .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

function AddExpenseModal({ c, onClose }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", invoiceRef: "", costType: "external" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    const amt = Number(String(f.amount).replace(/[^0-9.]/g, "")) || 0;
    const entry = { id: c.id + "-E" + ((c.spendEntries || []).length + 1) + "-" + Date.now().toString().slice(-4), date: new Date(f.date + "T00:00:00").toISOString(), description: f.description.trim() || "Expense", amount: amt, invoiceRef: f.invoiceRef.trim() || "—", costType: f.costType, by: "u1" };
    updateItem("contracts", c.id, { spendEntries: [entry, ...(c.spendEntries || [])], spendToDate: (c.spendToDate || 0) + amt });
    onClose();
  };
  return html`<${Modal} title="Add expense" icon="dollar" width=${520} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>Add expense</${Btn}>`}>
    <div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Date"><${Input} type="date" value=${f.date} onInput=${(e) => set("date", e.target.value)} /></${Field}>
        <${Field} label=${`Amount (${c.currency})`}><${Input} placeholder="e.g. 120000" value=${f.amount} onInput=${(e) => set("amount", e.target.value)} /></${Field}>
      </div>
      <${Field} label="Description"><${Input} placeholder="e.g. Q3 milestone invoice" value=${f.description} onInput=${(e) => set("description", e.target.value)} /></${Field}>
      <${Field} label="Invoice reference"><${Input} placeholder="e.g. INV-2026-0142" value=${f.invoiceRef} onInput=${(e) => set("invoiceRef", e.target.value)} /></${Field}>
      <${Field} label="Cost type">
        <select class="input" value=${f.costType} onChange=${(e) => set("costType", e.target.value)}>
          ${COST_TYPES.map((t) => html`<option key=${t.key} value=${t.key}>${t.label} — ${t.hint}</option>`)}
        </select>
      </${Field}>
    </div>
  </${Modal}>`;
}

function SpendTab({ c }) {
  const [add, setAdd] = useState(false);
  // Clicking a cost card filters the entries beneath it; clicking it again clears.
  const [costFilter, setCostFilter] = useState("");
  const total = c.value || 0;
  const commitBurn = commitBurnPct(c);
  const tone = commitBurn > 100 ? "red" : commitBurn > 80 ? "amber" : "";
  const all = c.spendEntries || [];
  const entries = costFilter ? all.filter((e) => (e.costType || "external") === costFilter) : all;
  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: fmt.money(total, c.currency), label: "Total contract value" },
      ...COST_TYPES.map((t) => ({
        value: fmt.money(costOf(all, t.key), c.currency),
        label: t.label,
        title: t.hint,
        onClick: () => setCostFilter((k) => (k === t.key ? "" : t.key)),
      })),
    ]} />
    ${costFilter && html`<div class="row" style="gap:8px">
      <span class="tiny muted">Showing ${COST_TYPES.find((t) => t.key === costFilter).label} only</span>
      <button class="cellbtn cellbtn--text" onClick=${() => setCostFilter("")}><span class="tiny strong">Clear</span></button>
    </div>`}
    <div class="card card--pad col" style="gap:10px">
      <div class="row"><span class="strong tiny">Budget burn</span><div class="spacer"></div><span class=${cx("tiny strong", tone === "red" && "risk--critical", tone === "amber" && "risk--high")}>${commitBurn}% committed</span></div>
      <${Progress} value=${Math.min(100, commitBurn)} tone=${tone} />
      ${commitBurn > 100 ? html`<div class="banner banner--warn"><${Icon} name="alertTriangle" size=15 />Over budget — spend + commitments exceed the total contract value.</div>` : ""}
    </div>
    <div class="row"><span class="strong">Expense entries</span><div class="spacer"></div><${Btn} variant="primary" size="sm" icon="plus" onClick=${() => setAdd(true)}>Add expense</${Btn}></div>
    <${DataTable} columns=${[
      { key: "date", label: "Date", render: (e) => html`<span class="tiny">${fmt.date(e.date)}</span>` },
      { key: "description", label: "Description", render: (e) => html`<span class="cell-strong">${e.description}</span>` },
      { key: "invoiceRef", label: "Invoice", render: (e) => html`<span class="tiny mono">${e.invoiceRef}</span>` },
      { key: "costType", label: "Cost type", render: (e) => html`<${Pill} tone="gray">${(COST_TYPES.find((t) => t.key === (e.costType || "external")) || {}).label}</${Pill}>` },
      { key: "by", label: "By", render: (e) => html`<${Avatar} name=${nameOf(e.by)} size="sm" />` },
      { key: "amount", label: "Amount", align: "right", render: (e) => html`<span class="strong">${fmt.money(e.amount, c.currency)}</span>` },
    ]} rows=${entries} empty=${html`<div class="empty" style="padding:26px"><${Icon} name="dollar" size=30 /><div>No expenses recorded yet.</div></div>`} />
    ${add && html`<${AddExpenseModal} c=${c} onClose=${() => setAdd(false)} />`}
  </div>`;
}

/* ---- Workstream H: draft / review / access ----
   Role- and stage-gated document access with a Google-Drive-style permission
   model (view · comment/annotate · edit) per user. The drafter and the approver
   are deliberately different people, and the risk tier decides the chain. */
function AccessTab({ c }) {
  const gates = riskGatesFor(c.risk);
  const access = c.access || [];
  const setLevel = (i, level) => updateItem("contracts", c.id, { access: access.map((a, j) => (j === i ? { ...a, level } : a)) });
  const revoke = (i) => updateItem("contracts", c.id, { access: access.filter((_, j) => j !== i) });
  const grant = (userId) => { if (userId) updateItem("contracts", c.id, { access: [...access, { userId, level: "view" }] }); };
  const drafter = access.find((a) => a.level === "edit");
  const approver = gates.approvers[gates.approvers.length - 1];
  const conflict = drafter && drafter.userId === approver;

  return html`<div class="col" style="gap:16px">
    <div class="banner banner--info" style="align-items:flex-start">
      <${Icon} name="lock" size=17 />
      <div>
        <div class="strong tiny">Risk tier drives the gate — ${(c.risk || "medium")} risk</div>
        <div class="tiny" style="margin-top:3px;opacity:.85">${gates.depth}</div>
        <div class="tiny" style="margin-top:3px;opacity:.85">Approval chain: ${gates.approvers.map(nameOf).join(" → ")}</div>
      </div>
    </div>

    ${conflict
      ? html`<div class="banner banner--warn"><${Icon} name="alertTriangle" size=16 /><span>The drafter and the final approver are the same person — separate them before sign-off.</span></div>`
      : html`<div class="row" style="gap:8px"><${Icon} name="checkcircle" size=15 style=${{ color: "var(--success)" }} /><span class="tiny" style="color:var(--success);font-weight:600">Drafter and approver are separate people.</span></div>`}

    <div class="col" style="gap:8px">
      <div class="row"><span class="strong">Document access</span><div class="spacer"></div><span class="tiny muted">view · comment/annotate · edit</span></div>
      ${access.length === 0 && html`<span class="tiny muted">Nobody has been granted access yet.</span>`}
      ${access.map((a, i) => html`<div key=${a.userId} class="docrow">
        <${Avatar} name=${nameOf(a.userId)} size="md" />
        <div style="flex:1;min-width:0">
          <div class="strong tiny">${nameOf(a.userId)}</div>
          <div class="tiny muted">${byId(a.userId).role}${a.userId === approver ? " · final approver" : ""}${a.level === "edit" ? " · drafter" : ""}</div>
        </div>
        <select class="select" style="width:136px;height:32px" value=${a.level} onChange=${(e) => setLevel(i, e.target.value)}>
          ${ACCESS_LEVELS.map((l) => html`<option key=${l} value=${l}>${ACCESS_LABEL[l]}</option>`)}
        </select>
        <button class="iconbtn" title="Revoke" onClick=${() => revoke(i)}><${Icon} name="x" size=16 /></button>
      </div>`)}
      <${Field} label="Grant access">
        <select class="select" value="" onChange=${(e) => grant(e.target.value)}>
          <option value="">— pick a user —</option>
          ${USERS.filter((u) => !access.some((a) => a.userId === u.id)).map((u) => html`<option key=${u.id} value=${u.id}>${u.name} · ${u.role}</option>`)}
        </select>
      </${Field}>
    </div>

    <div class="tiny muted">
      Real Google Drive ACLs plug in where this list is written — the shape already matches
      Drive's reader / commenter / writer roles. <span class="mono">// google drive access seam</span>
    </div>
  </div>`;
}

/* ---- Feature 4: condensed read-only negotiation history mirror ---- */
function NegHistoryMini({ c }) {
  const rounds = [...(c.rounds || [])].sort((a, b) => b.round - a.round);
  if (!rounds.length) return null;
  return html`<div class="card card--pad col" style="gap:10px">
    <div class="row"><span class="strong">Negotiation history</span><div class="spacer"></div><${Pill} tone="amber">Round ${rounds[0].round}</${Pill}></div>
    ${rounds.slice(0, 3).map((r) => html`<div key=${r.id} class="row" style="gap:9px">
      <div class="notif__ico" style="width:28px;height:28px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="gitbranch" size=14 /></div>
      <div style="flex:1;min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.versionLabel}</div><div class="tiny muted">${r.direction === "sent" ? "Sent" : "Received"} · ${fmt.dateShort(r.date)}</div></div>
    </div>`)}
    <button class="tiny" style="color:var(--brand);font-weight:600;text-align:left" onClick=${() => navigate("/negotiations")}>Open in Negotiations →</button>
  </div>`;
}

function ContractList() {
  const CONTRACTS = useCollection("contracts");
  const [modal, setModal] = useState(false);

  // Query INSIDE the documents: one Drive full-text call maps the phrase to the
  // contracts whose scanned copies contain it. A title match and a body match
  // are different questions, so this is an explicit extra step rather than
  // something the search box does silently.
  const [docQ, setDocQ] = useState(null);      // { term, ids:Set|null } | null
  const [docBusy, setDocBusy] = useState(false);

  const totalVal   = CONTRACTS.reduce((s, c) => s + toUsd(c.value, c.currency), 0);
  const expiring30 = CONTRACTS.filter((c) => contractExpiryMatch(c, "d30")).length;
  const critical   = CONTRACTS.filter((c) => c.risk === "critical").length;
  const active     = CONTRACTS.filter((c) => c.status === "Active").length;
  const expired    = CONTRACTS.filter((c) => contractExpiryMatch(c, "expired")).length;
  const drill = useFilterLink("ct");
  // Is anything narrowing the register right now?
  const anyContractFilter = !!docQ || contractFields.some((f) => drill.active(f.key).length > 0) || !!drill.active("q").length;

  // Rows the document search has narrowed to, applied on top of whatever the
  // register's own filters produced.
  const rows = docQ && docQ.ids
    ? CONTRACTS.filter((r) => (r.driveFiles || []).some((f) => docQ.ids.has(f.id)))
    : CONTRACTS;

  const summary = html`<div>
    <${StatStrip} stats=${[
      { value: CONTRACTS.length, label: "Total contracts",
        // Pressed when the register is already showing everything, so "nothing
        // happened" reads as "you are already here" rather than a dead control.
        active: !anyContractFilter,
        onClick: () => { setDocQ(null); drill.clearAll(contractFields); },
        title: anyContractFilter ? "Clear every filter and show the whole register" : "Showing the whole register" },
      { value: fmt.money(totalVal), label: "Total contract value", title: "Total across the register, in PKR" },
      { value: active,     label: "Active", tone: "green", onClick: () => drill.set("status", ["Active"]) },
      { value: expired,    label: "Expired", onClick: () => drill.set("expiry", ["expired"]) },
      { value: expiring30, label: "Expiring < 30 days", tone: expiring30 ? "amber" : "", onClick: () => drill.set("expiry", ["d30"]) },
      { value: critical,   label: "Critical risk", tone: critical ? "red" : "", title: "Value \u2265 PKR 10B", onClick: () => drill.set("risk", ["critical"]) },
    ]} />
  </div>`;

  // The search-inside-documents affordance needs the live query, so it renders
  // through the shell's afterBar slot rather than duplicating filter state.
  const afterBar = (f) => {
    const term = (f.q || "").trim();
    const run = () => {
      if (!term) return;
      setDocBusy(true);
      api.registers.docmatches(term).then(
        (r) => { setDocQ({ term, ids: new Set(r.fileIds || []) }); setDocBusy(false); },
        () => { setDocQ({ term, ids: null }); setDocBusy(false); }
      );
    };
    if (docQ && docQ.term !== term) setTimeout(() => setDocQ(null), 0);
    return html`<div>
      ${term && !docQ && html`<div class="row" style="margin:0 0 10px">
        <button type="button" class="tagchip" onClick=${run} disabled=${docBusy}><${Icon} name="search" size=12 />
          ${docBusy ? "Searching inside the scanned documents\u2026" : `Search inside the documents for \u201c${term}\u201d`}</button>
      </div>`}
      ${docQ && html`<div class="row" style="margin:0 0 10px;gap:8px">
        ${docQ.ids
          ? html`<${Pill} tone=${rows.length ? "green" : "gray"}>${rows.length} contract${rows.length === 1 ? "" : "s"} with a scanned copy mentioning \u201c${docQ.term}\u201d</${Pill}>`
          : html`<${Pill} tone="red">Document search unavailable right now</${Pill}>`}
        <button type="button" class="tagchip" onClick=${() => setDocQ(null)}><${Icon} name="x" size=11 />Back to normal search</button>
      </div>`}
    </div>`;
  };

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Contracts" sub="The historic record \u2014 every contract on the book, from request to renewal, including the ones already done."
      actions=${html`<${Btn} variant="ghost" icon="grid" onClick=${() => navigate("/tracker")}>Tracker</${Btn}>
        <${Btn} variant="ghost" icon="upload" onClick=${() => navigate("/repository")}>Import</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => setModal(true)}>New contract</${Btn}>`} />
    ${modal && html`<${NewContractModal} onClose=${() => setModal(false)} onCreate=${(c) => addItem("contracts", c)} />`}

    <${RegisterShell}
      ns="ct" rows=${rows}
      fields=${contractFields}
      columns=${(f) => contractColumns(f, { onDocs: (c) => navigate("/contracts/" + c.id), CategoryPill })}
      views=${contractViews} searchKeys=${contractSearchKeys}
      searchPlaceholder="Search contracts, counterparties, deed refs\u2026"
      noun=${["contract", "contracts"]}
      onRow=${(c) => navigate("/contracts/" + c.id)}
      exportName="contracts" emptyIcon="file"
      summary=${summary} afterBar=${afterBar} />
  </div>`;
}

function recordReview(c) {
  const days = c.expiry ? Math.round((new Date(c.expiry) - Date.now()) / 86400000) : null;
  const linked = (c.driveFiles || []).length;
  const named = (c.docFiles || []).length;
  const checks = [];   // { t, level }  level: high | medium | low
  /* A DAY COUNT IS USEFUL FOR A QUARTER, NOT FOR A DECADE (§41).
     "expired 1344d" is arithmetic a reader has to undo to learn the contract
     ended in 2023 — and the date is already right there in the same sentence.
     Inside 90 days the count is the useful part; past that, the word is. */
  if (days != null && days < 0) {
    const late = Math.abs(days);
    checks.push({ t: late <= 90
      ? `Expired ${late}d ago — term ended ${fmt.date(c.expiry)}`
      : `Expired — term ended ${fmt.date(c.expiry)}`, level: "high" });
  }
  else if (days != null && days <= 30) checks.push({ t: `Expires in ${days}d (${fmt.date(c.expiry)})`, level: "medium" });
  else if (days != null) checks.push({ t: `In term until ${fmt.date(c.expiry)}`, level: "low" });
  else checks.push({ t: "No end date recorded in the tracker", level: "medium" });
  if (linked) checks.push({ t: `${linked} scanned ${linked === 1 ? "copy" : "copies"} linked from the knowledge base`, level: "low" });
  else if (named) checks.push({ t: `${named} document${named === 1 ? "" : "s"} named in the tracker, none in Drive`, level: "high" });
  else checks.push({ t: "No documents recorded for this contract", level: "medium" });
  if (!c.value) checks.push({ t: "No contract value recorded", level: "medium" });
  if ((c.__copies || 1) > 1) checks.push({ t: `Recorded in ${c.__copies} register copies`, level: "medium" });
  const gaps = [];     // what is genuinely missing from the record
  if (!c.expiry) gaps.push("End / expiry date");
  if (!c.value) gaps.push("Contract value");
  if (!c.counterparty || c.counterparty === "—") gaps.push("Counterparty");
  if (!linked && named) gaps.push(`Scanned cop${named === 1 ? "y" : "ies"}: ${(c.docFiles || []).slice(0, 2).join(", ")}${named > 2 ? "…" : ""}`);
  if (!linked && !named) gaps.push("Any signed document");
  if (!c.physicalRecord) gaps.push("Physical record number");
  const summary = [
    linked ? `${linked} scanned ${linked === 1 ? "copy is" : "copies are"} linked from the knowledge base.` : named ? `The tracker names ${named} document${named === 1 ? "" : "s"} but none are in the Drive library yet.` : "No documents are recorded for this contract.",
    days != null && days < 0 ? `The term ended ${fmt.date(c.expiry)}.` : days != null && days <= 30 ? `The term ends in ${days} days.` : days != null ? `In term until ${fmt.date(c.expiry)}.` : "The tracker records no end date.",
    c.value ? `Recorded value ${fmt.money(c.value, c.currency)}.` : "No value is recorded.",
    c.__source && c.__source.file ? `Source: ${String(c.__source.file).replace(/\.xlsx?$/i, "")}.` : "",
  ].filter(Boolean).join(" ");
  return { checks, gaps, summary };
}

// In-app .docx rendering. Word documents cannot display in an <iframe>, so we
// stream the bytes from OUR server (knowledge/file/:id — never an external Drive
// link) and convert them to HTML in the browser with mammoth. This is what keeps
// the "everything is viewed here" rule for the 350+ .docx templates and the
// .docx case / contract attachments, none of which a PDF viewer can show.
// Above this many bytes we do not pull the file into the browser to render it —
// it would freeze the tab (see the 39MB inventory workbook). Offer a download of
// the streamed file instead (still served by us, never an external Drive link).
const INLINE_MAX = 12 * 1024 * 1024;
function TooBig({ id, name, kind, size }) {
  const mb = size ? Math.round(size / 1048576) + " MB" : "";
  return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", color: "var(--text-3)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
    <div>This ${kind}${mb ? " (" + mb + ")" : ""} is too large to render inline. Download it to view.</div>
    <a href=${api.knowledge.fileUrl(id)} target="_blank" rel="noopener" style=${{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>Download ${name}</a>
  </div>`;
}
export function DocxView({ id, name, size }) {
  const [st, setSt] = useState({ loading: true, body: "", error: null });
  useEffect(() => {
    let alive = true;
    if (size && size > INLINE_MAX) { setSt({ loading: false, body: "", error: "too-big" }); return; }
    setSt({ loading: true, body: "", error: null });
    (async () => {
      try {
        const mod = await import("https://esm.sh/mammoth@1.8.0/mammoth.browser");
        const mammoth = mod.default || mod;
        const resp = await fetch(api.knowledge.fileUrl(id), { credentials: "include" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const buf = await resp.arrayBuffer();
        const out = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (alive) setSt({ loading: false, body: sanitizeDocHtml(out.value) || "<p><em>(This document has no extractable text.)</em></p>", error: null });
      } catch (e) {
        if (alive) setSt({ loading: false, body: "", error: (e && e.message) || String(e) });
      }
    })();
    return () => { alive = false; };
  }, [id]);
  if (st.error === "too-big") return html`<${TooBig} id=${id} name=${name} size=${size} kind="Word document" />`;
  if (st.loading) return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>Rendering document…</div>`;
  if (st.error) return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", color: "var(--text-3)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
    <div>This Word document could not be rendered inline (${st.error}).</div>
    <a href=${api.knowledge.fileUrl(id)} target="_blank" rel="noopener" style=${{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>Download ${name}</a>
  </div>`;
  return html`<div class="doclb__frame" style=${{ overflow: "auto", background: "var(--surface-2)", padding: "26px 18px" }}>
    <div class="doc" style=${{ maxWidth: "820px", margin: "0 auto" }} dangerouslySetInnerHTML=${{ __html: st.body }}></div>
  </div>`;
}

// In-app spreadsheet rendering. XLSX/XLS can't display in an <iframe>, so we
// stream the bytes from our server and render them to an HTML table with SheetJS,
// with a tab per sheet. Same "viewed here" rule as the docx path.
export function XlsxView({ id, name, size }) {
  const [st, setSt] = useState({ loading: true, sheets: [], active: 0, error: null });
  useEffect(() => {
    let alive = true;
    if (size && size > INLINE_MAX) { setSt({ loading: false, sheets: [], active: 0, error: "too-big" }); return; }
    setSt({ loading: true, sheets: [], active: 0, error: null });
    (async () => {
      try {
        const XLSX = await import("https://esm.sh/xlsx@0.18.5");
        const resp = await fetch(api.knowledge.fileUrl(id), { credentials: "include" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const wb = XLSX.read(new Uint8Array(await resp.arrayBuffer()), { type: "array" });
        const sheets = wb.SheetNames.map((n) => ({ name: n, html: sanitizeDocHtml(XLSX.utils.sheet_to_html(wb.Sheets[n])) }));
        if (alive) setSt({ loading: false, sheets, active: 0, error: null });
      } catch (e) {
        if (alive) setSt({ loading: false, sheets: [], active: 0, error: (e && e.message) || String(e) });
      }
    })();
    return () => { alive = false; };
  }, [id]);
  if (st.error === "too-big") return html`<${TooBig} id=${id} name=${name} size=${size} kind="spreadsheet" />`;
  if (st.loading) return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>Rendering spreadsheet…</div>`;
  if (st.error || !st.sheets.length) return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", color: "var(--text-3)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
    <div>This spreadsheet could not be rendered inline${st.error ? " (" + st.error + ")" : ""}.</div>
    <a href=${api.knowledge.fileUrl(id)} target="_blank" rel="noopener" style=${{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>Download ${name}</a>
  </div>`;
  return html`<div class="doclb__frame" style=${{ overflow: "auto", background: "var(--surface-2)", padding: "0" }}>
    ${st.sheets.length > 1 && html`<div class="row" style="gap:4px;padding:8px 12px;position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--border);z-index:1;flex-wrap:wrap">
      ${st.sheets.map((s, i) => html`<button key=${s.name} class=${cx("chip", i === st.active && "chip--active")} style="cursor:pointer" onClick=${() => setSt({ ...st, active: i })}>${s.name}</button>`)}
    </div>`}
    <div class="xlsxsheet" style=${{ padding: "14px 16px" }} dangerouslySetInnerHTML=${{ __html: st.sheets[st.active].html }}></div>
  </div>`;
}

export function DocViewerModal({ c, files, index, onIndex, onClose, initialQuery }) {
  const f = files[index];
  const [q, setQ] = useState(initialQuery || "");
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  // Arriving from a search, the term is already known — run it immediately so
  // the match banner and #search highlight are there when the viewer opens.
  useEffect(() => { if (initialQuery) run(); }, []);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [index, files.length]);
  const run = () => {
    const term = q.trim();
    if (!term) { setHits(null); return; }
    setBusy(true);
    api.knowledge.matches(term, files.map((x) => x.id)).then(
      (r) => { setHits(new Set(r.matches || [])); setBusy(false); },
      () => { setHits(new Set()); setBusy(false); }
    );
  };
  const term = q.trim();
  const src = api.knowledge.fileUrl(f.id) + (term && hits && hits.has(f.id) ? "#search=" + encodeURIComponent(term) : "");
  return html`<div class="doclb" onClick=${onClose}>
    <button class="doclb__arrow doclb__arrow--l" disabled=${index === 0}
      onClick=${(e) => { e.stopPropagation(); if (index > 0) onIndex(index - 1); }} title="Previous document (←)">
      <${Icon} name="chevronLeft" size=26 /></button>
    <div class="doclb__panel" onClick=${(e) => e.stopPropagation()}>
      <div class="doclb__bar">
        <${Icon} name="file" size=15 style=${{ color: "var(--brand)", flex: "none" }} />
        <span class="doclb__name" title=${(f.folderPath || "") + " / " + f.name}>${f.name}</span>
        ${f.via === "filename" && html`<${Pill} tone="green">named in tracker</${Pill}>`}
        <span class="tiny muted" style="flex:none">${index + 1} / ${files.length}</span>
        <div class="doclb__search inputgroup"><${Icon} name="search" size=13 />
          <input class="input" placeholder="Search these documents…" value=${q}
            onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { e.stopPropagation(); if (e.key === "Enter") run(); }} /></div>
        <a class="iconbtn" href=${api.knowledge.fileUrl(f.id)} target="_blank" rel="noopener" title="Open in new tab"><${Icon} name="externalLink" size=15 /></a>
        ${f.webViewLink && html`<a class="iconbtn" href=${f.webViewLink} target="_blank" rel="noopener" title="Open in Google Drive"><${Icon} name="folder" size=15 /></a>`}
        <button class="iconbtn" onClick=${onClose} title="Close (Esc)"><${Icon} name="x" size=16 /></button>
      </div>
      ${/* WHERE THIS DOCUMENT CAME FROM, ON SCREEN RATHER THAN IN A TOOLTIP.
            A lawyer reading a statutory document needs to know which company
            and which compliance year it belongs to, and what the estate says it
            is -- a tooltip on the filename is not an answer to that. Built only
            from fields the document actually carries, so a record that has no
            provenance shows no provenance line rather than an empty one. */ ""}
      ${(() => {
        const bits = [];
        if (f.stage) bits.push(["Category", String(f.stage).replace(/_/g, " ").toLowerCase()
          .replace(/^./, (c) => c.toUpperCase()).replace(/\b(agm|eogm|secp)\b/gi, (w) => w.toUpperCase())]);
        if (f.entity) bits.push(["Entity", f.entity]);
        if (f.sourcePeriodLabel || f.complianceYear) bits.push(["Compliance year", f.sourcePeriodLabel || ("CY " + f.complianceYear)]);
        if (f.form) bits.push(["Form", "Form " + f.form]);
        if (f.documentDate) bits.push(["Document date", fmt.date(f.documentDate)]);
        if (!bits.length && !f.folderPath) return null;
        const copies = (f.sourceCopies || []).length;
        return html`<div class="doclb__prov tiny">
          ${bits.map(([k, v]) => html`<span key=${k}><span class="muted">${k}:</span> <strong>${v}</strong></span>`)}
          ${f.folderPath && html`<span style="min-width:0"><span class="muted">Source:</span> ${f.folderPath}</span>`}
          ${copies > 1 && html`<span title=${(f.sourceCopies || []).map((c) => c.folderPath).join("  |  ")}>
            <span class="muted">Copies:</span> <strong>${copies}</strong> source folders</span>`}
          ${f.submissionEvidence && html`<${Pill} tone="green">Submission evidence</${Pill}>`}
        </div>`;
      })()}
      ${hits && !busy && html`<div class="doclb__hits tiny">
        ${hits.size ? `“${term}” found inside ${hits.size} of ${files.length} — ${hits.has(f.id) ? "including this one (Ctrl+F in the preview to jump)" : "not this one; use the arrows"}` : `No document here mentions “${term}”.`}
      </div>`}
      ${(() => {
        const mt = f.mimeType || "";
        if (/pdf|google-apps/.test(mt))
          return html`<${PdfFrame} key=${src} src=${src} name=${f.name} />`;
        if (/^image\//.test(mt))
          return html`<div class="doclb__frame" style=${{ overflow: "auto", background: "var(--surface-2)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px" }}>
            <img src=${api.knowledge.fileUrl(f.id)} alt=${f.name} style=${{ maxWidth: "100%", height: "auto", borderRadius: "6px", boxShadow: "0 2px 12px rgba(0,0,0,.12)" }} /></div>`;
        if (/wordprocessingml/.test(mt))
          return html`<${DocxView} key=${f.id} id=${f.id} name=${f.name} size=${f.size} />`;
        if (/spreadsheetml|ms-excel|\.xlsx?$/i.test(mt) || /\.xlsx?$/i.test(f.name || ""))
          return html`<${XlsxView} key=${f.id} id=${f.id} name=${f.name} size=${f.size} />`;
        return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", color: "var(--text-3)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
          <div>No inline preview for this file type (${mt || "unknown"}).</div>
          <a href=${api.knowledge.fileUrl(f.id)} target="_blank" rel="noopener" style=${{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>Download ${f.name}</a>
        </div>`;
      })()}
    </div>
    <button class="doclb__arrow doclb__arrow--r" disabled=${index === files.length - 1}
      onClick=${(e) => { e.stopPropagation(); if (index < files.length - 1) onIndex(index + 1); }} title="Next document (→)">
      <${Icon} name="chevronRight" size=26 /></button>
  </div>`;
}

/* A DOCUMENT THE SERVER REFUSES IS NOT A DOCUMENT WHOSE ERROR YOU READ.
   The preview was a bare <iframe src=…>, so when the file endpoint answered
   404 the iframe happily rendered the response body and the reader saw
   {"error":"not_found"} laid out where the lease should be. That is a raw
   internal shape shown to a lawyer, and it tells them nothing about what to do.

   The source is probed first. A refusal becomes an honest state; only a file
   that actually answers gets framed. 404 is deliberately ambiguous here --
   missing and not-permitted look alike by design, so the wording claims
   neither. */
function PdfFrame({ src, name }) {
  const [state, setState] = useState("checking");
  useEffect(() => {
    let live = true;
    setState("checking");
    fetch(src, { method: "HEAD", credentials: "same-origin" })
      .then((r) => { if (live) setState(r.ok ? "ok" : (r.status === 404 ? "unavailable" : "error")); })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [src]);

  if (state === "checking")
    return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>Opening ${name}…</div>`;
  if (state === "ok")
    return html`<iframe src=${src} title=${name} class="doclb__frame"></iframe>`;
  return html`<div class="doclb__frame" style=${{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "8px", color: "var(--text-3)", fontSize: "13px", textAlign: "center", padding: "24px" }}>
    <div class="strong">This document cannot be opened here.</div>
    <div>It is either not available to your team or no longer in the source folder.</div>
    <div class="tiny muted">${name}</div>
  </div>`;
}

export function ContractWorkspace({ id, backTo = "/contracts", backLabel = "Contracts" }) {
  const c = findByIdOrLegacy(useCollection("contracts"), id);
  // "Workflow" is the DEFAULT tab — the process, not just the document.
  const [tab, setTab] = useState("flow");
  const [raising, setRaising] = useState(null);   // escalate this contract into a case
  const [active, setActive] = useState("6");
  const [docOpen, setDocOpen] = useState(-1);
  const [tagEdit, setTagEdit] = useState(false);
  if (!c) return html`<div class="page"><${Btn} icon="arrowLeft" onClick=${() => navigate(backTo)}>Back</${Btn}><div class="empty">Contract not found.</div></div>`;
  // Unknown stages land on Active rather than a magic number, so adding a stage
  // to the rail can never silently move where every odd record points.
  const foldedIdx = CLM_STAGES.indexOf(railStage(c.stage));
  const stageIdx = foldedIdx >= 0 ? foldedIdx : CLM_STAGES.indexOf("Active");

  return html`<div class="page page--wide fade-in">
    <!-- A contract in dispute shows the case it gave rise to, and links to it. -->
    <${CaseLinks} type="contract" id=${c.id} />
    ${raising && html`<${RaiseCase} moduleKey="cases" moduleLabel="Litigation & Disputes" source=${raising}
      onClose=${() => setRaising(null)} onCreated=${() => setRaising(null)} />`}
    <div class="row" style="margin-bottom:14px"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate(backTo)}>${backLabel}</${Btn}></div>
    <div class="pagehead" style="margin-bottom:16px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px"><span class="mono muted">${c.id}</span><${Status} value=${c.status} /><${Risk} level=${c.risk} /><${Pill} tone="gray">${c.type}</${Pill}><${CategoryPill} item=${c} /></div>
        <h1 class="pagehead__title">${c.title}</h1>
        <div class="pagehead__sub">${c.counterparty} · ${c.jurisdiction} · ${fmt.moneyFull(c.value, c.currency)}</div>
      </div>
      <div class="pagehead__actions">
        ${/* A dispute over this contract should start FROM it: the entity,
              counterparty, project and value are already here, and retyping
              them is the manual work Raise a Case exists to remove. */
          html`<${Btn} variant="ghost" icon="gavel"
            onClick=${() => setRaising({ type: "contract", id: c.id, label: "contract " + (c.ref || c.id) })}>Raise a case</${Btn}>`}
        <${Btn} variant="ghost" icon="gitbranch">Compare</${Btn}>
        <${Btn} variant="ghost" icon="download">Export</${Btn}>
        <${Dropdown} label="More contract actions" trigger=${html`<span class="btn btn--ghost"><${Icon} name="more" size=16 /></span>`}>
          <${MenuItem} icon="edit">Edit metadata</${MenuItem}>
          <${MenuItem} icon="copy">Duplicate</${MenuItem}>
          <${MenuItem} icon="refresh">Start renewal</${MenuItem}>
        </${Dropdown}>
        <${Btn} variant="primary" icon="checksquare">Send for approval</${Btn}>
      </div>
    </div>

    <div class="card card--pad" style="margin-bottom:16px">
      <${Stepper} steps=${CLM_STAGES} current=${stageIdx} />
    </div>

    <!-- Flow is the default view: input → stages → outputs → relationships -->
    <div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0">
      ${/* THE SAME SPINE AS EVERY OTHER RECORD (§78).
            This had seven tabs, three of which could never hold anything for a
            contract read out of Drive: Versions ("the source tracks no
            revisions"), Approvals ("this record carries no sign-off history")
            and Comments ("no comments") were three clicks that each led to a
            paragraph explaining why there was nothing there. A case, a notice,
            a loan, a lease and a licence all read Overview → module tab →
            Documents → Timeline; a contract now does too, and what those three
            tabs used to say is said once, on the Timeline, where a reader is
            actually asking what has happened to this record. */ ""}
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "flow", label: "Overview", icon: "workflow" },
        // The count is the real number of linked Drive documents, not a constant.
        { key: "document", label: "Documents", icon: "file", count: (c.driveFiles || []).length },
        { key: "spend", label: "Spend", icon: "dollar" },
        { key: "access", label: "Access", icon: "lock", count: (c.access || []).length },
        { key: "timeline", label: "Timeline", icon: "clock" },
      ]} />
    </div></div>

    ${docOpen >= 0 && (c.driveFiles || [])[docOpen] && html`<${DocViewerModal} c=${c} files=${c.driveFiles} index=${docOpen} onIndex=${setDocOpen} onClose=${() => setDocOpen(-1)} />`}

    ${tab === "flow" ? html`<${WorkflowSpine} id=${c.id} showHeader=${false} />` : html`
    <div class="grid" style=${`grid-template-columns:${tab === "document" ? "240px minmax(0,1fr) 330px" : "minmax(0,1fr) 330px"};align-items:start;gap:16px`}>
      ${tab === "document" && html`<div class="card" style="position:sticky;top:16px">
        <div class="card__head" style="padding:13px 15px"><div class="card__title" style="font-size:13px">Clause Navigator</div></div>
        <div style="padding:8px">
          ${CLAUSES_NAV.map((cl) => html`<button type="button" key=${cl.n} class=${cx("menu__item")} style=${`padding:8px 10px;${active === cl.n ? "background:var(--brand-soft)" : ""}`} onClick=${() => setActive(cl.n)}>
            <span class="mono tiny muted" style="width:16px">${cl.n}</span>
            <span style=${`font-size:12.5px;flex:1;${active === cl.n ? "color:var(--brand-600);font-weight:600" : ""}`}>${cl.t}</span>
            ${cl.risk && html`<span class="tag-dot" style=${`background:${cl.risk === "high" ? "var(--danger)" : "var(--warning)"}`}></span>`}
          </button>`)}
        </div>
      </div>`}

      <div class="card">
        <div class="card__body">
          ${tab === "document" && html`<div class="col" style="gap:12px">
            <${RecordAssist} family="contracts" rec=${c} />
            <${LegalDocuments} files=${c.driveFiles || []} recordType="contract" record=${c} />
          </div>`}
          ${tab === "timeline" && html`<div class="col" style="gap:14px">
            <div class="tiny muted">What this system holds about the history of this contract, and what it does not.</div>
            ${(c.driveFiles || []).length
              ? html`<${Timeline} items=${(c.driveFiles || []).slice()
                  .sort((a, b) => String(b.modifiedTime || b.createdTime || "").localeCompare(String(a.modifiedTime || a.createdTime || "")))
                  .slice(0, 12)
                  .map((f) => ({ title: f.name || "Document",
                    meta: [f.modifiedTime ? fmt.date(f.modifiedTime) : (f.createdTime ? fmt.date(f.createdTime) : "No date on file"),
                      f.folder || "Filed in Drive"].filter(Boolean).join(" · ") }))} />`
              : html`<div class="tiny muted">No document is linked to this contract, so there is nothing dated to show.</div>`}
            <div class="card card--pad col" style="gap:8px">
              <span class="tiny strong">What the source does not carry</span>
              <span class="tiny muted">· <b>Revisions.</b> The Drive register records one current document set per contract. No revision history is tracked, so none is shown.</span>
              <span class="tiny muted">· <b>Approvals.</b> Sign-off is captured for requests raised through LegalOS. This record was read from the Drive register, which carries no approval trail.</span>
              <span class="tiny muted">· <b>Comments.</b> Discussion is kept on the request that produced a contract, not on the executed record.</span>
            </div>
          </div>`}
          ${tab === "spend" && html`<${SpendTab} c=${c} />`}
          ${tab === "access" && html`<${AccessTab} c=${c} />`}
        </div>
      </div>

      <div class="col" style="gap:16px;position:sticky;top:16px">
        <${AICard} title=${html`Record review`}>
          ${recordReview(c).summary}
        </${AICard}>
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Company tags</span><div class="spacer"></div><button class="iconbtn" style="width:28px;height:28px" onClick=${() => setTagEdit(true)}><${Icon} name="edit" size=15 /></button></div>
          ${(c.companyTags || []).length ? html`<${TagChips} ids=${c.companyTags} />` : html`<span class="tiny muted">No company tags. Click edit to add.</span>`}
        </div>
        ${tagEdit && html`<${TagEditor} ids=${c.companyTags || []} onClose=${() => setTagEdit(false)} onSave=${(sel) => updateItem("contracts", c.id, { companyTags: sel })} />`}
        <div class="card card--pad col" style="gap:12px">
          <span class="strong">Extracted terms</span>
          <!-- Real references only — the invented "liability cap / Net 45" rows are
               gone. Every line here traces back to the tracker or the Drive library. -->
          ${[["Counterparty", c.counterparty],
             ["Contract value", fmt.money(c.value, c.currency)],
             ["Effective date", fmt.date(c.start)],
             ["Expiry", fmt.date(c.expiry)],
             ["Governing law", c.jurisdiction],
             c.physicalRecord ? ["Physical record #", c.physicalRecord] : null,
             c.__source ? ["Source register", (c.__source.file || "").replace(/\.xlsx?$/i, "")] : null,
             c.__source && c.__source.sheet ? ["Sheet · row", c.__source.sheet + (c.__row ? " · " + c.__row : "")] : null,
             ["Documents", (c.driveFiles || []).length ? (c.driveFiles.length + " linked from the knowledge base") : ((c.docFiles || []).length ? (c.docFiles.length + " named, not in Drive yet") : "none recorded")],
            ].filter(Boolean).map(([l, v]) => html`<div key=${l} class="row" style="font-size:12.5px;gap:12px"><span class="muted" style="flex:none">${l}</span><span class="spacer"></span><span class="strong" style="text-align:right;min-width:0;overflow-wrap:break-word">${v}</span></div>`)}
        </div>
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Risk analysis</span><div class="spacer"></div><${Risk} level=${c.risk} /></div>
          <!-- Derived from THIS record: term state, document coverage, value,
               duplicate register copies. No invented clause findings. -->
          ${recordReview(c).checks.map((k) => html`<div key=${k.t} class="row" style="gap:8px;font-size:12.5px"><span class="tag-dot" style=${`flex:none;background:${k.level === "high" ? "var(--danger)" : k.level === "medium" ? "var(--warning)" : "var(--success)"}`}></span><span style="flex:1">${k.t}</span></div>`)}
        </div>
        <div class="card card--pad col" style="gap:8px">
          <span class="strong">Missing from this record</span>
          ${(() => { const g = recordReview(c).gaps;
            return g.length
              ? g.map((mc) => html`<div key=${mc} class="row" style="gap:8px;font-size:12.5px"><${Icon} name="alertCircle" size=14 style=${{ color: "var(--warning)", flex: "none" }} />${mc}</div>`)
              : html`<div class="row" style="gap:8px;font-size:12.5px"><${Icon} name="check" size=14 style=${{ color: "var(--success)", flex: "none" }} />Nothing missing — dates, value, counterparty and scans are all recorded.</div>`; })()}
        </div>
        <${NegHistoryMini} c=${c} />
      </div>
    </div>`}
  </div>`;
}


/* Document-derived HTML is UNTRUSTED.
   mammoth converts a .docx to HTML and SheetJS renders a sheet to a table; both
   outputs are inserted with dangerouslySetInnerHTML, so a crafted document could
   otherwise run script inside the application's own origin — with the viewer's
   session. Legal documents arrive from many counterparties, so they are treated
   as hostile input: parse the markup, drop anything executable, and keep only
   the formatting a document legitimately needs.

   Parsing (rather than regex-stripping) means malformed or deliberately
   obfuscated markup is normalised by the browser before we inspect it. */
const SAFE_TAGS = new Set(("p br b i u em strong span div h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr td th " +
  "blockquote pre code hr sub sup small caption colgroup col a img figure figcaption").split(" "));
const SAFE_ATTRS = new Set(["class", "colspan", "rowspan", "align", "valign", "width", "height", "style", "title", "alt"]);
function sanitizeDocHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString("<body>" + String(html) + "</body>", "text/html");
  const walk = (node) => {
    for (const el of [...node.children]) {
      const tag = el.tagName.toLowerCase();
      if (!SAFE_TAGS.has(tag)) { el.remove(); continue; }   // script, iframe, object, form, iframe…
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || "");
        // every on* handler, plus anything that can carry a URL scheme
        if (name.startsWith("on") || !SAFE_ATTRS.has(name)) { el.removeAttribute(attr.name); continue; }
        if (name === "style" && /expression|url\s*\(|@import/i.test(value)) el.removeAttribute(attr.name);
      }
      if (tag === "a") {
        const href = el.getAttribute("href") || "";
        if (!/^(https?:|mailto:|#)/i.test(href)) el.removeAttribute("href");
        el.setAttribute("rel", "noopener noreferrer nofollow");
        el.setAttribute("target", "_blank");
      }
      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        // mammoth inlines images as data: URIs; anything else is dropped.
        if (!/^data:image\//i.test(src)) el.remove();
        continue;
      }
      walk(el);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export default function Contracts({ id }) {
  return id ? html`<${ContractWorkspace} id=${id} />` : html`<${ContractList} />`;
}
