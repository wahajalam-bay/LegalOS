// Legal Requests — Intake portal (Kanban · List · dynamic intake form).
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Priority, Pill, Status, Segmented, Modal, Field, Input, Drawer, AICard } from "../ui.js";
import { PageHead, Toolbar, DataTable } from "../parts.js";
import { REQUEST_TYPES, BUSINESS_UNITS, WORK_CATEGORIES, inferCategory, nameOf, entityName } from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, daysFromNow, convertRequestToMatter } from "../store.js";
import { activeUser } from "../rbac.js";
import { navigate } from "../router.js";
import { CategoryChips, CategoryPill, TagChips, TagEditor, matchCategories, TatCell, SubdivisionPill } from "../shared.js";
import { rowTat } from "../flow.js";
import { tatAnalysis } from "../tat.js";

const COLUMNS = [
  { key: "New", color: "#1d6cb0" },
  { key: "Triage", color: "#6d28d9" },
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
      <span class="tiny" style=${`color:${new Date(r.due) < Date.now() ? "var(--danger)" : "var(--text-3)"}`}><${Icon} name="clock" size=12 style=${{ display: "inline", verticalAlign: "-2px", marginRight: "3px" }} />${fmt.until(r.due)}</span>
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
      aiSummary: `Captured via intake. AI pre-scored this ${type} as ${URGENCY_RISK[form.urgency] || "medium"} risk; suggested owner Sarah Chen (Commercial).`,
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
      <${AICard} title="AI pre-assessment">Based on type and urgency, this will be logged as <b>${URGENCY_RISK[form.urgency] || "medium"} risk</b>, routed to <b>Sarah Chen</b> (Commercial). Estimated turnaround <b>${form.urgency === "Urgent" ? "1.5" : "3.2"} days</b>.</${AICard}>
    </div>`}
  </${Modal}>`;
}

export default function Requests() {
  const items = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const [view, setView] = useState("board");
  const [q, setQ] = useState("");
  const [bu, setBu] = useState("all");
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState(false);
  const [drag, setDrag] = useState(null);
  const [cats, setCats] = useState([]);
  const [tagEdit, setTagEdit] = useState(false);
  const toggleCat = (c) => setCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const filtered = items.filter((r) => (!q || (r.title + r.counterparty + r.type).toLowerCase().includes(q.toLowerCase())) && (bu === "all" || r.bu === bu) && matchCategories(r, cats));
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
    <${PageHead} title="Legal Requests" sub="Every legal need starts here — intake, triage and route in one flow."
      actions=${html`<${Segmented} value=${view} onChange=${setView} options=${[{ label: "Board", value: "board", icon: "columns" }, { label: "List", value: "list", icon: "list" }]} />
        <${Btn} variant="primary" icon="plus" onClick=${() => setModal(true)}>New request</${Btn}>`} />

    <${Toolbar} search=${q} onSearch=${setQ} chips=${chips} active=${bu} onChip=${setBu} />
    <div class="row wrap" style="gap:8px;margin-bottom:16px"><${CategoryChips} selected=${cats} onToggle=${toggleCat} /></div>

    ${view === "board" ? html`<div class="kanban">
      ${COLUMNS.map((col) => {
        const cards = withTat.filter((r) => r.status === col.key);
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
      { key: "due", label: "Due Date", width: "94px", render: (r) => { const d = r.dueDate || r.due; const late = new Date(d) < Date.now(); return html`<div><div class=${cx("tiny strong", late && "risk--critical")}>${fmt.dateShort(d)}</div><div class="tiny muted">${fmt.until(d)}</div></div>`; } },
      { key: "tatAnalysis", label: "TAT Analysis", width: "140px", render: (r) => html`<div><div class="tiny strong">${r.__tat.days}d allowed</div><div class="tiny muted">${tatAnalysis(r.__tat)}</div></div>` },
      { key: "tatStatus", label: "TAT Status", width: "168px", render: (r) => html`<${TatCell} tat=${r.__tat} />` },
    ]} rows=${withTat} /></div>`}

    ${modal && html`<${IntakeModal} onClose=${() => setModal(false)} onCreate=${(item) => addItem("requests", item)} />`}
    ${open && html`<${Drawer} title=${open.id} onClose=${() => setOpen(null)}
      footer=${html`<${Btn} variant="ghost" icon="workflow" onClick=${() => navigate("/workspace/" + open.id)}>Open flow</${Btn}>
        ${open.matterId
          ? html`<${Btn} variant="primary" icon="folder" onClick=${() => navigate("/matters/" + open.matterId)}>Open matter ${open.matterId}</${Btn}>`
          : html`<${Btn} variant="primary" icon="arrowRight" onClick=${() => convert(open)}>Convert to matter</${Btn}>`}`}>
      <div class="col" style="gap:18px;padding:20px">
        <div>
          <div class="row wrap" style="gap:8px;margin-bottom:8px"><${Pill} tone="blue">${open.type}</${Pill}><${Status} value=${open.status} /><${Risk} level=${open.risk} /><${CategoryPill} item=${open} /></div>
          <div style="font-size:18px;font-weight:700;letter-spacing:-.01em">${open.title}</div>
        </div>
        <${AICard} title="AI summary">${open.aiSummary}</${AICard}>
        <div>
          <div class="row" style="margin-bottom:8px"><span class="strong tiny" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">Company tags</span><div class="spacer"></div><button class="tiny" style="color:var(--brand);font-weight:600" onClick=${() => setTagEdit(true)}>Edit tags</button></div>
          ${(open.companyTags || []).length ? html`<${TagChips} ids=${open.companyTags} />` : html`<span class="tiny muted">No company tags yet.</span>`}
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
          ${[["Business Unit", open.bu], ["Department", open.dept], ["Country", open.country], ["Counterparty", open.counterparty], ["Value", open.value ? fmt.moneyFull(open.value, open.currency) : "—"], ["Priority", open.priority], ["Requester", nameOf(open.requester)], ["Legal Owner", nameOf(open.owner)], ["Due date", fmt.date(open.due)], ["Created", fmt.date(open.created)]].map(([l, v]) => html`<div key=${l}><div class="tiny muted" style="margin-bottom:2px">${l}</div><div class="strong" style="font-size:13px">${v}</div></div>`)}
        </div>
      </div>
    </${Drawer}>`}
    ${tagEdit && open && html`<${TagEditor} ids=${open.companyTags || []} onClose=${() => setTagEdit(false)} onSave=${(sel) => { updateItem("requests", open.id, { companyTags: sel }); setOpen({ ...open, companyTags: sel }); }} />`}
  </div>`;
}
