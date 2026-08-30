// Contracts — CLM portfolio + contract workspace (preview · clauses · AI review).
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Pill, Status, Tabs, Stepper, AICard, Dropdown, MenuItem, Progress, Modal, Field, Input } from "../ui.js";
import { PageHead, Toolbar, DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import {
  BUSINESS_UNITS, COUNTRIES, WORK_CATEGORIES, inferCategory, nameOf, byId, USERS,
  CONTRACT_TYPE_CODES, GROUP_ENTITIES, entityName, riskGatesFor, ACCESS_LEVELS, ACCESS_LABEL, toUsd,
} from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, daysFromNow } from "../store.js";
import { CategoryChips, CategoryPill, TagChips, TagEditor, matchCategories, FilterBar, useFilters, applyFilters, TatCell, SubdivisionPill } from "../shared.js";
import { WorkflowSpine } from "../spine.js";
import { rowTat } from "../flow.js";

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
  const repository = useCollection("repository");
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const [tab, setTab] = useState("all");
  const [modal, setModal] = useState(false);
  const { filters, patch, toggle, clear } = useFilters("contracts");

  const ctx = { requests, matters, contracts: CONTRACTS, repository };
  const withTat = CONTRACTS.map((c) => ({ ...c, __tat: rowTat(c, ctx) }));
  const tabs = [
    { key: "all", label: "All", count: CONTRACTS.length },
    { key: "Active", label: "Active", count: CONTRACTS.filter((c) => c.status === "Active").length },
    { key: "Expiring", label: "Expiring", count: CONTRACTS.filter((c) => c.status === "Expiring").length },
    { key: "In Negotiation", label: "In Negotiation", count: CONTRACTS.filter((c) => c.status === "In Negotiation").length },
    { key: "Drafting", label: "Drafting", count: CONTRACTS.filter((c) => c.status === "Drafting").length },
  ];
  let rows = applyFilters(withTat, filters, { searchKeys: ["title", "counterparty", "id", "contractType", "landRef", "physicalRecordRef"] });
  if (tab !== "all") rows = rows.filter((c) => c.status === tab);
  const totalVal = CONTRACTS.reduce((s, c) => s + toUsd(c.value, c.currency), 0);
  const expiring30 = CONTRACTS.filter((c) => { const d = (new Date(c.expiry) - Date.now()) / 86400000; return d >= 0 && d <= 30; }).length;
  const critical = CONTRACTS.filter((c) => c.risk === "critical").length;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Contracts" sub="The historic record — every contract on the book, from request to renewal, including the ones already done."
      actions=${html`<${Btn} variant="ghost" icon="grid" onClick=${() => navigate("/tracker")}>Tracker</${Btn}>
        <${Btn} variant="ghost" icon="upload" onClick=${() => navigate("/repository")}>Import</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => setModal(true)}>New contract</${Btn}>`} />
    ${modal && html`<${NewContractModal} onClose=${() => setModal(false)} onCreate=${(c) => addItem("contracts", c)} />`}
    <${StatStrip} stats=${[
      { value: CONTRACTS.length, label: "Total contracts" },
      { value: fmt.money(totalVal), label: "Total contract value", trend: "+14%", trendDir: "up" },
      { value: expiring30, label: "Expiring < 30 days", trend: "▲", trendDir: "up" },
      { value: critical, label: "Critical risk", trendDir: "flat" },
      { value: withTat.filter((c) => c.__tat.status === "Delayed").length, label: "Past TAT" },
    ]} />
    <div style="margin-bottom:14px"><${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} /></div>
    <${FilterBar} module="contracts" filters=${filters} onPatch=${patch} onToggle=${toggle} onClear=${clear}
      rows=${withTat}
      dateFields=${[{ key: "expiry", label: "Expiry" }, { key: "start", label: "Execution / start" }]}
      placeholder="Search contracts, counterparties, deed refs…"
      right=${html`<span class="tiny muted">${rows.length} of ${CONTRACTS.length}</span>`} />
    <${DataTable} onRow=${(c) => navigate("/contracts/" + c.id)} columns=${[
      { key: "srNo", label: "Sr No", mono: true, width: "62px" },
      { key: "id", label: "ID", mono: true, width: "86px" },
      { key: "title", label: "Contract", render: (c) => html`<div class="cell-strong">${c.title}</div><div class="tiny muted">${c.counterparty} · ${c.contractType}</div>` },
      { key: "entityId", label: "Entity", width: "116px", render: (c) => html`<span class="tiny strong">${entityName(c.entityId)}</span>` },
      { key: "subdivision", label: "Sub-division", render: (c) => html`<${SubdivisionPill} item=${c} />` },
      { key: "value", label: "Value", align: "right", render: (c) => html`<span class="strong">${fmt.money(c.value, c.currency)}</span>` },
      { key: "spend", label: "Burn", width: "120px", render: (c) => { const b = commitBurnPct(c); const t = b > 100 ? "red" : b > 80 ? "amber" : ""; return html`<div class="row" style="gap:8px"><div style="flex:1"><${Progress} value=${Math.min(100, b)} tone=${t} /></div><span class="tiny muted" style="width:34px">${b}%</span></div>`; } },
      { key: "risk", label: "Risk", render: (c) => html`<${Risk} level=${c.risk} />` },
      { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` },
      { key: "tat", label: "TAT Status", width: "160px", render: (c) => html`<${TatCell} tat=${c.__tat} />` },
      { key: "owner", label: "Owner", render: (c) => html`<${Avatar} name=${nameOf(c.owner)} size="sm" />` },
      { key: "expiry", label: "Expiry", render: (c) => { const days = Math.round((new Date(c.expiry) - Date.now()) / 86400000); return html`<span class=${cx("tiny", days > 0 && days < 30 && "risk--high")} style="font-weight:600">${days < 0 ? "Expired" : fmt.date(c.expiry)}</span>`; } },
    ]} rows=${rows} />
  </div>`;
}

// `backTo`/`backLabel` let the SAME lifecycle view serve two lists: the Contract
// Tracker (current, ongoing work) and Contracts (the historic record). Landing
// on it from the tracker must return you to the tracker.
export function ContractWorkspace({ id, backTo = "/contracts", backLabel = "Contracts" }) {
  const c = useCollection("contracts").find((x) => x.id === id);
  // "Workflow" is the DEFAULT tab — the process, not just the document.
  const [tab, setTab] = useState("flow");
  const [active, setActive] = useState("6");
  const [tagEdit, setTagEdit] = useState(false);
  if (!c) return html`<div class="page"><${Btn} icon="arrowLeft" onClick=${() => navigate(backTo)}>Back</${Btn}><div class="empty">Contract not found.</div></div>`;
  // Unknown stages land on Active rather than a magic number, so adding a stage
  // to the rail can never silently move where every odd record points.
  const foldedIdx = CLM_STAGES.indexOf(railStage(c.stage));
  const stageIdx = foldedIdx >= 0 ? foldedIdx : CLM_STAGES.indexOf("Active");

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:14px"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate(backTo)}>${backLabel}</${Btn}></div>
    <div class="pagehead" style="margin-bottom:16px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px"><span class="mono muted">${c.id}</span><${Status} value=${c.status} /><${Risk} level=${c.risk} /><${Pill} tone="gray">${c.type}</${Pill}><${CategoryPill} item=${c} /></div>
        <div class="pagehead__title">${c.title}</div>
        <div class="pagehead__sub">${c.counterparty} · ${c.jurisdiction} · ${fmt.moneyFull(c.value, c.currency)}</div>
      </div>
      <div class="pagehead__actions">
        <${Btn} variant="ghost" icon="gitbranch">Compare</${Btn}>
        <${Btn} variant="ghost" icon="download">Export</${Btn}>
        <${Dropdown} trigger=${html`<${Btn} variant="ghost" icon="more" />`}>
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
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "flow", label: "Workflow", icon: "workflow" },
        { key: "document", label: "Document", icon: "file" },
        { key: "versions", label: "Versions", icon: "layers", count: 3 },
        { key: "spend", label: "Spend", icon: "dollar" },
        { key: "access", label: "Access", icon: "lock", count: (c.access || []).length },
        { key: "approvals", label: "Approvals", icon: "checksquare" },
        { key: "comments", label: "Comments", icon: "message", count: 4 },
      ]} />
    </div></div>

    ${tab === "flow" ? html`<${WorkflowSpine} id=${c.id} showHeader=${false} />` : html`
    <div class="grid" style=${`grid-template-columns:${tab === "document" ? "240px 1fr 330px" : "1fr 330px"};align-items:start;gap:16px`}>
      ${tab === "document" && html`<div class="card" style="position:sticky;top:16px">
        <div class="card__head" style="padding:13px 15px"><div class="card__title" style="font-size:13px">Clause Navigator</div></div>
        <div style="padding:8px">
          ${CLAUSES_NAV.map((cl) => html`<div key=${cl.n} class=${cx("menu__item")} style=${`padding:8px 10px;${active === cl.n ? "background:var(--brand-soft)" : ""}`} onClick=${() => setActive(cl.n)}>
            <span class="mono tiny muted" style="width:16px">${cl.n}</span>
            <span style=${`font-size:12.5px;flex:1;${active === cl.n ? "color:var(--brand-600);font-weight:600" : ""}`}>${cl.t}</span>
            ${cl.risk && html`<span class="tag-dot" style=${`background:${cl.risk === "high" ? "var(--danger)" : "var(--warning)"}`}></span>`}
          </div>`)}
        </div>
      </div>`}

      <div class="card">
        <div class="card__body">
          ${tab === "document" && html`<div class="doc">
            <div style="text-align:center;margin-bottom:24px"><div style="font-size:16px;font-weight:700;letter-spacing:.02em">${c.type.toUpperCase()} AGREEMENT</div><div class="tiny muted" style="margin-top:4px">Between ${c.counterparty} and Northwind Global Holdings</div></div>
            <h3>4. Term &amp; Renewal</h3>
            <p>This Agreement shall commence on the Effective Date and continue for an initial term of <span class="clause-hl">${c.autoRenew ? "twelve (12) months, automatically renewing for successive 12-month periods unless either party provides sixty (60) days' written notice" : "the period set out in the Order Form"}</span>.</p>
            <h3>6. Limitation of Liability</h3>
            <p>Except for the Excluded Claims, each party's aggregate liability arising out of this Agreement shall not exceed <span class="clause-risk">an amount equal to 0.5× the fees paid in the twelve (12) months preceding the claim</span>. In no event shall either party be liable for indirect or consequential losses.</p>
            <h3>7. Data Protection</h3>
            <p>Each party shall comply with applicable Data Protection Laws. Where the Supplier processes Personal Data, it shall do so only on documented instructions, <span class="clause-risk">including with respect to cross-border transfers, subject to appropriate safeguards</span>.</p>
            <h3>9. Termination</h3>
            <p>Either party may terminate this Agreement <span class="clause-hl">for convenience upon ninety (90) days' written notice</span>, or immediately upon a material breach not remedied within thirty (30) days.</p>
          </div>`}
          ${tab === "versions" && html`<div class="col" style="gap:2px">
            ${[{ v: "v3.0", who: "u3", when: "Today", label: "Current · counterparty redlines", tone: "amber" }, { v: "v2.1", who: "u5", when: "2 days ago", label: "Internal review", tone: "" }, { v: "v1.0", who: "u5", when: "8 days ago", label: "Initial draft from template", tone: "" }].map((v) => html`<div key=${v.v} class="feed__item" style="align-items:center">
              <div class="notif__ico" style=${`width:34px;height:34px;background:${v.tone === "amber" ? "var(--warning-bg)" : "var(--surface-3)"};color:${v.tone === "amber" ? "var(--warning)" : "var(--text-2)"}`}><${Icon} name="layers" size=15 /></div>
              <div style="flex:1"><div class="strong" style="font-size:13px">${v.v} · ${v.label}</div><div class="tiny muted">${nameOf(v.who)} · ${v.when}</div></div>
              <${Btn} variant="ghost" size="sm">View</${Btn}>
            </div>`)}
          </div>`}
          ${tab === "approvals" && html`<div class="col" style="gap:10px">
            ${[{ r: "Legal Review — Ahmed Sardar", s: "approved" }, { r: "Risk Review — Imran Tariq Mir", s: "approved" }, { r: "Finance — Klaus Werner", s: "pending" }, { r: "General Counsel — Maryam Haq", s: "pending" }].map((a, i) => html`<div key=${i} class=${cx("approval", `approval--${a.s}`)}>
              <div class="notif__ico" style=${`width:32px;height:32px;background:${a.s === "approved" ? "var(--success-bg)" : "var(--warning-bg)"};color:${a.s === "approved" ? "var(--success)" : "var(--warning)"}`}><${Icon} name=${a.s === "approved" ? "check" : "clock"} size=15 /></div>
              <div style="flex:1"><div class="strong" style="font-size:13px">${a.r}</div><div class="tiny muted">${a.s === "approved" ? "Approved" : "Awaiting decision"}</div></div>
              <${Status} value=${a.s === "approved" ? "Approved" : "Pending Approval"} />
            </div>`)}
          </div>`}
          ${tab === "spend" && html`<${SpendTab} c=${c} />`}
          ${tab === "access" && html`<${AccessTab} c=${c} />`}
          ${tab === "comments" && html`<div class="empty"><${Icon} name="message" size=36 /><div>4 comment threads on clauses 6, 7 and 9.</div></div>`}
        </div>
      </div>

      <div class="col" style="gap:16px;position:sticky;top:16px">
        <${AICard} title=${html`AI Contract Review`}>
          I extracted <b>18 key terms</b> and flagged <b>2 high-risk clauses</b>. The liability cap (0.5× fees) is below your playbook standard and cross-border data transfer safeguards are underspecified.
        </${AICard}>
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Company tags</span><div class="spacer"></div><button class="iconbtn" style="width:28px;height:28px" onClick=${() => setTagEdit(true)}><${Icon} name="edit" size=15 /></button></div>
          ${(c.companyTags || []).length ? html`<${TagChips} ids=${c.companyTags} />` : html`<span class="tiny muted">No company tags. Click edit to add.</span>`}
        </div>
        ${tagEdit && html`<${TagEditor} ids=${c.companyTags || []} onClose=${() => setTagEdit(false)} onSave=${(sel) => updateItem("contracts", c.id, { companyTags: sel })} />`}
        <div class="card card--pad col" style="gap:12px">
          <span class="strong">Extracted terms</span>
          ${[["Counterparty", c.counterparty], ["Contract value", fmt.money(c.value, c.currency)], ["Effective date", fmt.date(c.start)], ["Expiry", fmt.date(c.expiry)], ["Auto-renewal", c.autoRenew ? "Yes — 60d opt-out" : "No"], ["Governing law", c.jurisdiction], ["Liability cap", "0.5× fees"], ["Payment terms", "Net 45"]].map(([l, v]) => html`<div key=${l} class="row" style="font-size:12.5px"><span class="muted">${l}</span><span class="spacer"></span><span class="strong" style="text-align:right">${v}</span></div>`)}
        </div>
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Risk analysis</span><div class="spacer"></div><${Risk} level=${c.risk} /></div>
          ${[["Liability cap below standard", "high"], ["Cross-border data transfer", "high"], ["Auto-renewal exposure", "medium"], ["Termination rights balanced", "low"]].map(([t, r]) => html`<div key=${t} class="row" style="gap:8px"><span class="risk__bar" style=${`background:${r === "high" ? "var(--danger)" : r === "medium" ? "var(--warning)" : "var(--success)"};height:14px`}></span><span class="tiny" style="flex:1">${t}</span><${Risk} level=${r} /></div>`)}
        </div>
        <div class="card card--pad col" style="gap:8px">
          <span class="strong">Missing clauses</span>
          ${["Force Majeure (extended)", "Anti-Bribery (FCPA/UKBA)", "Insurance requirements"].map((mc) => html`<div key=${mc} class="row" style="gap:8px"><${Icon} name="alertCircle" size=15 style=${{ color: "var(--warning)" }} /><span class="tiny" style="flex:1">${mc}</span><button class="tiny" style="color:var(--brand);font-weight:600">Insert</button></div>`)}
        </div>
        <${NegHistoryMini} c=${c} />
      </div>
    </div>`}
  </div>`;
}

export default function Contracts({ id }) {
  return id ? html`<${ContractWorkspace} id=${id} />` : html`<${ContractList} />`;
}
