// Legal Requests — Intake portal (Kanban · List · dynamic intake form).
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Priority, Pill, Status, Segmented, Modal, Field, Input, Drawer, AICard } from "../ui.js";
import { PageHead, Toolbar, DataTable } from "../parts.js";
import { REQUEST_TYPES, BUSINESS_UNITS, WORK_CATEGORIES, inferCategory, nameOf, entityName } from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, daysFromNow, convertRequestToMatter, personName } from "../store.js";
import { activeUser, useActiveUser, filterVisible, canApprove, canTriage } from "../rbac.js";
import { byId } from "../data.js";
import { teamShort, teamTone } from "../org.js";
import { moduleByKey } from "../modules.js";
import { tatV2, urgencyOf } from "../tat2.js";
import { TatChip } from "./module.js";
import { ApprovalsInline } from "./approvals.js";
import { Empty } from "../ui.js";
import { StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { CategoryChips, CategoryPill, TagChips, TagEditor, matchCategories, TatCell, SubdivisionPill } from "../shared.js";
import { rowTat } from "../flow.js";
import { tatAnalysis } from "../tat.js";

const COLUMNS = [
  // One intake lane: New and Triage are the same working state ("needs triage"),
  // so the lane always agrees with the Awaiting-triage KPI.
  { key: "Triage", color: "#6d28d9", match: (r) => r.status === "New" || r.status === "Triage" },
  // Triage assigns an owner and sets status "Assigned"; the board needs this
  // column so a just-triaged request stays visible in the pipeline (it was
  // previously dropping off between Triage and In Review).
  { key: "Assigned", color: "#0d7a3f" },
  { key: "In Review", color: "#d97706" },
  { key: "Drafting", color: "#0891b2" },
  { key: "Negotiation", color: "#ea580c" },
  { key: "Pending Approval", color: "#27a96d" },
  { key: "Approved", color: "#16a34a" },
];

// dynamic intake questions by request type
const DYN = {
  "Vendor Agreement": ["Vendor name", "Payment terms", "Auto-renewal?", "Data processing involved?", "Requires SLA?"],
  "NDA": ["Mutual or one-way?", "Confidentiality term", "Purpose", "Governing law"],
  "Employment Contract": ["Candidate name", "Role & grade", "Base + equity", "Non-compete required?", "Start date"],
  "Lease Agreement": ["Landlord / lessor", "Property location", "Term (years)", "Break option?"],
  "Data Privacy Review": ["Data categories", "Cross-border transfer?", "Sub-processors", "Retention period"],
  default: ["Business justification", "Key terms", "Deadline drivers"],
};
const URGENCY_RISK = { Standard: "low", High: "medium", Urgent: "high" };
const URGENCY_PRIO = { Standard: "Medium", High: "High", Urgent: "Urgent" };

function RequestCard({ r, onOpen, onDragStart }) {
  const t = r.__tat;
  return html`<div class="kcard" draggable=${true}
    style=${t && t.status === "Delayed" ? "border-color:color-mix(in srgb, var(--danger) 40%, transparent)" : ""}
    onDragStart=${(e) => onDragStart(e, r.id)} onClick=${() => onOpen(r)}>
    <div class="kcard__top">
      <span class="kcard__id">${r.id}</span>
      <div class="spacer"></div>
      <${Priority} level=${r.priority} />
    </div>
    <div class="kcard__title">${r.title}</div>
    <div class="kcard__meta">
      <${Pill} tone="gray">${r.type}</${Pill}>
      <${Risk} level=${r.risk} />
      <${CategoryPill} item=${r} />
    </div>
    <!-- the fixed TAT verdict travels with the card, not just the list -->
    ${t && html`<div class="row" style="gap:6px;margin-top:9px">
      <${TatCell} tat=${t} compact=${true} />
      ${t.status === "Delayed" && t.blockingStage && html`<span class="tiny" style="color:var(--danger);font-weight:600">${t.blockingStage}</span>`}
    </div>`}
    ${r.aiSummary && html`<div class="row" style="gap:6px;margin-top:10px;padding:8px 9px;background:var(--accent-soft);border-radius:8px">
      <${Icon} name="sparkles" size=13 style=${{ color: "var(--accent-500)", flex: "none", marginTop: "2px" }} />
      <span class="tiny" style="color:var(--text-2);line-height:1.4">${r.aiSummary.length > 90 ? r.aiSummary.slice(0, 90) + "…" : r.aiSummary}</span>
    </div>`}
    <div class="kcard__foot">
      <${Avatar} name=${nameOf(r.owner)} size="sm" />
      <span class="tiny muted">${nameOf(r.owner).split(" ")[0]}</span>
      <div class="spacer"></div>
      ${r.value && html`<span class="tiny strong">${fmt.money(r.value, r.currency)}</span>`}
      ${(r.due || (r.tat && r.tat.dueAt)) && html`<span class="tiny" style=${`color:${new Date(r.due || r.tat.dueAt) < Date.now() ? "var(--danger)" : "var(--text-3)"}`}><${Icon} name="clock" size=12 style=${{ display: "inline", verticalAlign: "-2px", marginRight: "3px" }} />${fmt.until(r.due || r.tat.dueAt)}</span>`}
    </div>
    ${(r.companyTags || []).length ? html`<div style="margin-top:8px"><${TagChips} ids=${r.companyTags} /></div>` : ""}
  </div>`;
}

function IntakeModal({ onClose, onCreate }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState("");
  const [form, setForm] = useState({ title: "", counterparty: "", bu: BUSINESS_UNITS[0], urgency: "Standard", value: "", category: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const questions = DYN[type] || DYN.default;

  const submit = () => {
    const title = form.title.trim() || `${type} — new request`;
    onCreate({
      id: nextId("requests", "REQ-"),
      title, type, status: "New",
      bu: form.bu, dept: "—", country: "—",
      category: form.category || inferCategory({ type, title }),
      companyTags: [],
      priority: URGENCY_PRIO[form.urgency] || "Medium", risk: URGENCY_RISK[form.urgency] || "medium",
      value: form.value ? Number(String(form.value).replace(/[^0-9.]/g, "")) : null,
      currency: "USD",
      counterparty: form.counterparty || "—",
      owner: "u5", requester: "u13",
      due: daysFromNow(form.urgency === "Urgent" ? 2 : 7), created: nowIso(),
      aiSummary: `Captured via intake. AI pre-scored this ${type} as ${URGENCY_RISK[form.urgency] || "medium"} risk; suggested owner Ahmed Sardar (Commercial).`,
    });
    onClose();
  };

  return html`<${Modal} title="New Legal Request" icon="inbox" onClose=${onClose} width=${560}
    footer=${step === 0
      ? html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" iconRight="arrowRight" onClick=${() => { if (type) { setForm((f) => ({ ...f, category: f.category || inferCategory({ type }) })); setStep(1); } }}>Continue</${Btn}>`
      : html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(0)}>Back</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>Submit request</${Btn}>`}>
    ${step === 0 ? html`<div class="col" style="gap:18px">
      <div class="banner banner--info"><${Icon} name="sparkles" size=18 /><span>Pick a request type — the form adapts to ask only what's relevant. AI pre-scores risk on submit.</span></div>
      <${Field} label="What do you need?">
        <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
          ${REQUEST_TYPES.slice(0, 12).map((t) => html`<button key=${t} class=${cx("chip", type === t && "active")} style="justify-content:flex-start;height:38px" onClick=${() => setType(t)}>
            <${Icon} name=${type === t ? "checkcircle" : "file"} size=15 />${t}
          </button>`)}
        </div>
      </${Field}>
    </div>` : html`<div class="col" style="gap:16px">
      <div class="row"><${Pill} tone="blue">${type}</${Pill}><span class="spacer"></span><span class="tiny muted">Dynamic form · adapts to type</span></div>
      <${Field} label="Request title"><${Input} placeholder=${`e.g. ${type} — Acme Corp`} value=${form.title} onInput=${(e) => set("title", e.target.value)} /></${Field}>
      <${Field} label="Category" hint="Auto-suggested from request type — change if needed.">
        <select class="select" value=${form.category} onChange=${(e) => set("category", e.target.value)}>${WORK_CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}</select>
      </${Field}>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Counterparty"><${Input} placeholder="Vendor / customer" value=${form.counterparty} onInput=${(e) => set("counterparty", e.target.value)} /></${Field}>
        <${Field} label="Business Unit"><select class="select" value=${form.bu} onChange=${(e) => set("bu", e.target.value)}>${BUSINESS_UNITS.map((b) => html`<option key=${b}>${b}</option>`)}</select></${Field}>
        <${Field} label="Urgency"><select class="select" value=${form.urgency} onChange=${(e) => set("urgency", e.target.value)}><option>Standard</option><option>High</option><option>Urgent</option></select></${Field}>
        <${Field} label="Estimated value (USD)"><${Input} placeholder="e.g. 250000" value=${form.value} onInput=${(e) => set("value", e.target.value)} /></${Field}>
      </div>
      <${Field} label=${`${type}-specific details`}>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          ${questions.map((qn) => html`<${Input} key=${qn} placeholder=${qn} />`)}
        </div>
      </${Field}>
      <${AICard} title="AI pre-assessment">Based on type and urgency, this will be logged as <b>${URGENCY_RISK[form.urgency] || "medium"} risk</b>, routed to <b>Ahmed Sardar</b> (Commercial). Estimated turnaround <b>${form.urgency === "Urgent" ? "1.5" : "3.2"} days</b>.</${AICard}>
    </div>`}
  </${Modal}>`;
}

// Statuses that mean the request is finished — off the working board.
const REQ_DONE = new Set(["Closed", "Approved", "Delivered", "Executed", "Completed", "Signed"]);
const UNTRIAGED = (r) => r.status === "New" || r.status === "Triage";

// LEGAL REQUESTS — the merged single-window surface (Legal Requests + My Tasks):
// scoped pipeline board, the approver's queue, and module tasks, all in one flow.
export default function Requests() {
  const items = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const mods = useCollection("modRequests");
  const viewer = useActiveUser();
  const [view, setView] = useState("board");
  const [q, setQ] = useState("");
  const [bu, setBu] = useState("all");
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState(false);
  const [drag, setDrag] = useState(null);
  const [cats, setCats] = useState([]);
  const [tagEdit, setTagEdit] = useState(false);
  const toggleCat = (c) => setCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  // Scope — the My Tasks lens, folded in: my plate / my team / everything.
  const scopes = [{ key: "mine", label: "My tasks" }];
  if (viewer.legalTeam) scopes.push({ key: "team", label: viewer.rbac === "lead" ? "Team queue" : "Team" });
  if (viewer.rbac === "head") scopes.push({ key: "all", label: "All teams" });
  const [scope, setScope] = useState(viewer.rbac === "head" ? "all" : "mine");
  const triager = canTriage(viewer);
  const inScope = (r) => scope === "all" ? true
    : scope === "team" ? (byId(r.owner) || {}).legalTeam === viewer.legalTeam
    : r.owner === viewer.id;

  // Privilege first, then scope. Triagers additionally see the WHOLE untriaged
  // queue (the triage desk is department-wide — a new request must reach the
  // expert lead even before it has a confirmed team).
  const visible = filterVisible(viewer, items);
  const untriagedPool = triager ? items.filter((r) => UNTRIAGED(r) && (r.privilege || "Open") === "Open") : [];
  const baseIds = new Set();
  const base = [...visible.filter(inScope), ...untriagedPool].filter((r) => (baseIds.has(r.id) ? false : (baseIds.add(r.id), true)));

  // The approver's queue (PRD §2): matters at the Approval gate for MY sign-off.
  const myApprovals = !canApprove(viewer) ? [] : visible
    .filter((r) => (r.stage === "Approval" || r.status === "Pending Approval") && !REQ_DONE.has(r.status))
    .filter((r) => viewer.rbac === "head" || (byId(r.owner) || {}).legalTeam === viewer.legalTeam)
    .sort((a, b) => (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0));

  // Module tasks (the org-architecture queues), same scope.
  const modRows = filterVisible(viewer, mods)
    .filter((r) => r.status !== "Closed")
    .filter((r) => scope === "all" ? true : scope === "team" ? r.legalTeam === viewer.legalTeam : r.owner === viewer.id)
    .map((r) => ({ r, def: moduleByKey(r.moduleKey) }))
    .filter((x) => x.def)
    .map((x) => ({ ...x, t: tatV2(x.def, x.r) }))
    .sort((a, b) => urgencyOf(b.t) - urgencyOf(a.t));

  const openReqs = base.filter((r) => !REQ_DONE.has(r.status));
  const filtered = base.filter((r) => (!q || (r.title + r.counterparty + r.type).toLowerCase().includes(q.toLowerCase())) && (bu === "all" || r.bu === bu) && matchCategories(r, cats));
  // TAT is computed once per row and reused by the board cards and the list.
  const ctx = { requests: items, matters, contracts, repository };
  const withTat = filtered.map((r) => ({ ...r, __tat: rowTat(r, ctx) }));
  const onDrop = (status) => { if (drag) { updateItem("requests", drag, { status }); setDrag(null); } };
  // Conversion keeps ONE identity: the matter carries the request id back, and
  // the request records which matter it was filed as. Module 2 owns the logic —
  // duplicate-guarded, counterparty resolved against the master, attachments
  // carried forward, audited (convertRequestToMatter in store.js).
  const convert = (r) => {
    const res = convertRequestToMatter(r.id, {}, activeUser().id);
    setOpen(null);
    if (res.ok) navigate("/matters/" + res.id);
    else if (res.existing) navigate("/matters/" + res.existing);
  };
  const chips = [{ label: "All units", value: "all" }, ...BUSINESS_UNITS.map((b) => ({ label: b, value: b }))];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Legal Requests" sub=${"Everything on " + viewer.name.split(" ")[0] + "'s plate — intake, triage, pipeline, approvals and module tasks in one flow."}
      actions=${html`<${Segmented} value=${view} onChange=${setView} options=${[{ label: "Board", value: "board", icon: "columns" }, { label: "List", value: "list", icon: "list" }]} />
        <${Btn} variant="primary" icon="plus" onClick=${() => setModal(true)}>New request</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: openReqs.length, label: "Open requests", tone: "blue" },
      { value: base.filter(UNTRIAGED).length, label: "Awaiting triage", tone: "purple",
        // Triage has no nav row of its own any more, so this count IS the way in
        // to the queue. Without it the queue was reachable only per-request.
        ...(canTriage(viewer) ? { onClick: () => navigate("/triage"), title: "Open the triage queue" } : {}) },
      // Non-approvers never see the "my approval" phrasing — nothing is theirs to sign.
      ...(canApprove(viewer) ? [{ value: myApprovals.length, label: "Awaiting my approval", tone: "amber" }] : []),
      { value: modRows.length, label: "Module tasks open", tone: "green" },
      { value: openReqs.filter((r) => r.tat && r.tat.dueAt && new Date(r.tat.dueAt) < Date.now()).length, label: "Overdue vs TAT", tone: "red" },
    ]} />

    <div class="row wrap" style="gap:10px;margin-bottom:12px">
      ${scopes.length > 1 && html`<${Segmented} value=${scope} onChange=${setScope} options=${scopes.map((s) => ({ value: s.key, label: s.label }))} />`}
    </div>

    <${ApprovalsInline} viewer=${viewer} requests=${items} />

    <${Toolbar} search=${q} onSearch=${setQ} chips=${chips} active=${bu} onChip=${setBu} />
    <div class="row wrap" style="gap:8px;margin-bottom:16px"><${CategoryChips} selected=${cats} onToggle=${toggleCat} /></div>

    ${view === "board" ? html`<div class="kanban">
      ${COLUMNS.filter((col) => triager || col.key !== "Triage").map((col) => {
        const cards = withTat.filter((r) => (col.match ? col.match(r) : r.status === col.key));
        return html`<div key=${col.key} class="kcol"
          onDragOver=${(e) => e.preventDefault()} onDrop=${() => onDrop(col.key)}>
          <div class="kcol__head">
            <span class="kcol__dot" style=${`background:${col.color}`}></span>
            <span class="kcol__title">${col.key}</span>
            <span class="kcol__count">${cards.length}</span>
            <div class="spacer"></div>
            <button class="iconbtn" style="width:26px;height:26px" onClick=${() => setModal(true)}><${Icon} name="plus" size=15 /></button>
          </div>
          <div class="kcol__list">
            ${cards.map((r) => html`<${RequestCard} key=${r.id} r=${r} onOpen=${setOpen} onDragStart=${(e, id) => setDrag(id)} />`)}
            ${cards.length === 0 && html`<div class="tiny muted center" style="padding:20px 0">Drop here</div>`}
          </div>
        </div>`;
      })}
    </div>` : html`<div class="dense"><${DataTable} onRow=${(r) => navigate("/workspace/" + r.id)} columns=${[
      // The GC's exact row: Request Date · Filed Matter · Requestee · Category ·
      // Company/Entity · Due Date · TAT Analysis · TAT Status.
      { key: "requestDate", label: "Request Date", width: "102px", render: (r) => html`<span class="tiny strong">${fmt.dateShort(r.requestDate || r.created)}</span>` },
      { key: "id", label: "ID", mono: true, width: "92px" },
      { key: "matterId", label: "Filed Matter", width: "96px", render: (r) => r.matterId
        ? html`<button class="facechip" onClick=${(e) => { e.stopPropagation(); navigate("/matters/" + r.matterId); }}>${r.matterId}</button>`
        : html`<span class="tiny muted">not filed</span>` },
      { key: "title", label: "Request", render: (r) => html`<div class="wrapcell"><div class="cell-strong">${r.title}</div><div class="tiny muted">${r.requestType}${r.contractType ? " · " + r.contractType : ""} · ${r.counterparty}</div></div>` },
      { key: "requester", label: "Requestee", width: "124px", render: (r) => { const q = r.requesterId || r.requester; return html`<div class="row" style="gap:7px"><${Avatar} name=${nameOf(q)} size="sm" /><div style="min-width:0"><div class="tiny strong">${nameOf(q).split(" ")[0]}</div><div class="tiny muted">${r.department || r.dept}</div></div></div>`; } },
      { key: "category", label: "Category", render: (r) => html`<div class="col" style="gap:4px;align-items:flex-start"><${CategoryPill} item=${r} /><${SubdivisionPill} item=${r} /></div>` },
      { key: "entityId", label: "Company / Entity", width: "142px", render: (r) => html`<button class="tagchip" onClick=${(e) => { e.stopPropagation(); navigate("/companies/" + r.entityId); }}><${Icon} name="building" size=11 />${entityName(r.entityId)}</button>` },
      // Contract value: what the request is worth, so the queue can be read by
      // exposure and not just by date.
      { key: "value", label: "Contract Value", align: "right", width: "104px", render: (r) => r.value
        ? html`<span class="strong">${fmt.money(r.value, r.currency)}</span>`
        : html`<span class="tiny muted">—</span>` },
      { key: "due", label: "Due Date", width: "94px", render: (r) => { const d = r.dueDate || r.due; const late = new Date(d) < Date.now(); return html`<div><div class=${cx("tiny strong", late && "risk--critical")}>${fmt.dateShort(d)}</div><div class="tiny muted">${fmt.until(d)}</div></div>`; } },
      { key: "tatAnalysis", label: "TAT Analysis", width: "140px", render: (r) => html`<div><div class="tiny strong">${r.__tat.days}d allowed</div><div class="tiny muted">${tatAnalysis(r.__tat)}</div></div>` },
      { key: "tatStatus", label: "TAT Status", width: "168px", render: (r) => html`<${TatCell} tat=${r.__tat} />` },
    ]} rows=${withTat} /></div>`}

    <!-- Module tasks (org-architecture queues), merged in from My Tasks -->
    <div class="card" style="padding:0;margin-top:16px">
      <div class="row" style="padding:14px 16px 6px;align-items:baseline">
        <span class="panel__title">Module tasks</span>
        <span class="tiny muted" style="margin-left:8px">— ${scope === "mine" ? "assigned to you" : scope === "team" ? "your team's queue" : "all teams"} across the team modules</span>
        <span class="spacer"></span><${Pill} tone=${modRows.length ? "blue" : "gray"}>${modRows.length}</${Pill}>
      </div>
      ${modRows.length === 0
        ? html`<${Empty} icon="checkcircle" title="No module tasks" text="Your assigned legal requests are shown above." />`
        : html`<div class="tablewrap"><table class="table">
            <thead><tr><th>Ref</th><th>Matter</th><th>Module</th><th>Team</th>${scope !== "mine" && html`<th>Owner</th>`}<th>Stage</th><th>TAT</th></tr></thead>
            <tbody>
              ${modRows.slice(0, 12).map(({ r, def, t }) => html`<tr key=${r.id} class="clickable" onClick=${() => navigate("/m/" + r.moduleKey + "/" + r.id)}>
                <td class="mono tiny">${r.id}</td>
                <td style="max-width:300px"><div class="ellipsis" title=${r.title}>${r.title}</div></td>
                <td class="tiny">${def.label}</td>
                <td><${Pill} tone=${teamTone(r.legalTeam)}>${teamShort(r.legalTeam)}</${Pill}></td>
                ${scope !== "mine" && html`<td><span class="row" style="gap:7px"><${Avatar} name=${personName(r.owner)} size="xs" />${personName(r.owner).split(" ")[0]}</span></td>`}
                <td><${Pill} tone="blue">${r.stage}</${Pill}></td>
                <td><${TatChip} t=${t} /></td>
              </tr>`)}
            </tbody>
          </table></div>`}
    </div>

    ${modal && html`<${IntakeModal} onClose=${() => setModal(false)} onCreate=${(item) => addItem("requests", item)} />`}
    ${open && html`<div class="sheet" onClick=${() => setOpen(null)}>
      <div class="sheet__panel" onClick=${(e) => e.stopPropagation()}>
        <div class="sheet__bar">
          <span class="mono muted">${open.id}</span>
          <${Status} value=${open.status} />
          ${open.escalated && html`<${Pill} tone="red" dot=${true}>Escalated</${Pill}>`}
          ${open.tat && open.tat.dueAt && html`<${Pill} tone=${new Date(open.tat.dueAt) < Date.now() ? "red" : "blue"}>TAT ${open.tat.days}d · due ${fmt.dateShort(open.tat.dueAt)}</${Pill}>`}
          <div class="spacer"></div>
          <${Btn} variant="ghost" size="sm" icon="workflow" onClick=${() => navigate("/workspace/" + open.id)}>Open flow</${Btn}>
          ${UNTRIAGED(open) && canTriage(viewer) && html`<${Btn} variant="soft" size="sm" icon="filter" onClick=${() => navigate("/triage/" + open.id)}>Triage this</${Btn}>`}
          ${open.matterId
            ? html`<${Btn} variant="primary" size="sm" icon="folder" onClick=${() => navigate("/matters/" + open.matterId)}>Matter ${open.matterId}</${Btn}>`
            : html`<${Btn} variant="primary" size="sm" icon="arrowRight" onClick=${() => convert(open)}>Convert to matter</${Btn}>`}
          <button class="iconbtn" onClick=${() => setOpen(null)} title="Close"><${Icon} name="x" size=18 /></button>
        </div>
        <div class="sheet__body">
          <div class="sheet__hero">
            <div class="row wrap" style="gap:8px;margin-bottom:8px">
              <${Pill} tone="blue">${open.type || open.requestType}</${Pill}><${Risk} level=${open.risk} /><${CategoryPill} item=${open} />
              ${open.requesterOption && html`<${Pill} tone="gray">${open.requesterOption}</${Pill}>`}
            </div>
            <div class="sheet__title">${open.title}</div>
          </div>
          <div class="sheet__grid">
            <div class="col" style="gap:18px;min-width:0">
              ${(open.businessContext || open.aiSummary) && html`<div>
                <div class="fpop__lbl" style="margin-bottom:6px">${open.businessContext ? "Business context — as submitted" : "AI summary"}</div>
                <div class="spine__desc">${open.businessContext || open.aiSummary}</div>
              </div>`}
              <div>
                <div class="fpop__lbl" style="margin-bottom:8px">Request record</div>
                <div class="sheet__facts">
                  ${[["Requester", nameOf(open.requesterId || open.requester)], ["Department", open.department || open.dept || "—"], ["Business unit", open.bu || open.unit || "—"], ["Counterparty", open.counterparty || "—"], ["Value", open.value ? fmt.moneyFull(open.value, open.currency) : "—"], ["Priority", open.priority || "—"], ["Legal owner", nameOf(open.owner)], ["Due date", open.dueDate || open.due ? fmt.date(open.dueDate || open.due) : "—"], ["Created", open.requestDate || open.created ? fmt.date(open.requestDate || open.created) : "—"], ["Filed matter", open.matterId || "not filed"]].map(([l, v]) => html`<div key=${l} class="sheet__fact"><div class="sheet__fl">${l}</div><div class="sheet__fv">${v}</div></div>`)}
                </div>
                ${open.layer2 && Object.keys(open.layer2).filter((k) => open.layer2[k]).length > 0 && html`<div class="sheet__facts" style="margin-top:10px">
                  ${Object.keys(open.layer2).filter((k) => open.layer2[k]).map((k) => html`<div key=${k} class="sheet__fact"><div class="sheet__fl">${k}</div><div class="sheet__fv">${open.layer2[k]}</div></div>`)}
                </div>`}
              </div>
              <div>
                <div class="row" style="margin-bottom:8px"><span class="fpop__lbl">Company tags</span><div class="spacer"></div><button class="tiny" style="color:var(--brand);font-weight:600" onClick=${() => setTagEdit(true)}>Edit tags</button></div>
                ${(open.companyTags || []).length ? html`<${TagChips} ids=${open.companyTags} />` : html`<span class="tiny muted">No company tags yet.</span>`}
              </div>
            </div>
            <div class="col" style="gap:18px;min-width:0">
              <div>
                <div class="fpop__lbl" style="margin-bottom:8px">What's happening — full history</div>
                ${(open.activity || []).length === 0 && (open.stageLog || []).length === 0 && html`<span class="tiny muted">Submitted — waiting for triage.</span>`}
                <div class="col" style="gap:8px">
                  ${(open.stageLog || []).map((s, i) => html`<div key=${"s" + i} class="row tiny" style="gap:8px;align-items:flex-start">
                    <${Icon} name=${s.exitedAt ? "checkcircle" : "clock"} size=13 style=${{ color: s.exitedAt ? "var(--success)" : "var(--brand)", flex: "none", marginTop: "1px" }} />
                    <div style="flex:1"><b>${s.stage}</b> <span class="muted">· ${s.enteredAt ? fmt.dateShort(s.enteredAt) : ""}${s.exitedAt ? " → " + fmt.dateShort(s.exitedAt) : " · in progress"}${s.ballWith ? " · ball with " + s.ballWith : ""}</span></div>
                  </div>`)}
                  ${[...(open.activity || [])].slice(-8).reverse().map((a, i) => html`<div key=${"a" + i} class="row tiny" style="gap:8px;align-items:flex-start">
                    <${Icon} name="dot" size=13 style=${{ color: "var(--text-3)", flex: "none", marginTop: "1px" }} />
                    <div style="flex:1">${a.action} <span class="muted">· ${a.by ? nameOf(a.by) : "System"} · ${a.at ? fmt.rel(a.at) : ""}</span></div>
                  </div>`)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`}
    ${tagEdit && open && html`<${TagEditor} ids=${open.companyTags || []} onClose=${() => setTagEdit(false)} onSave=${(sel) => { updateItem("requests", open.id, { companyTags: sel }); setOpen({ ...open, companyTags: sel }); }} />`}
  </div>`;
}
