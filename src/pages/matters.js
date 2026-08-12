// Matters — list + Linear-style matter workspace.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, AvatarStack, Risk, Priority, Pill, Status, Progress, Tabs, Timeline, AICard, Comment, Dropdown, MenuItem, Section, Modal, Field, Input } from "../ui.js";
import { PageHead, Toolbar, DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { CONTRACTS, BUSINESS_UNITS, WORK_CATEGORIES, inferCategory, nameOf, byId, USERS } from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, daysFromNow } from "../store.js";
import { CategoryChips, CategoryPill, TagChips, TagEditor, matchCategories, TatCell, SubdivisionPill } from "../shared.js";
import { WorkflowSpine } from "../spine.js";
import { rowTat } from "../flow.js";
import { unreadCount } from "../messages.js";
import { RequesterPanel } from "./workspace.js";

const MATTER_TYPES = ["Contract", "Corporate", "Litigation", "Compliance", "Employment", "IP", "Policy", "Regulatory"];

function NewMatterModal({ onClose, onCreate }) {
  const [f, setF] = useState({ title: "", type: "Contract", bu: BUSINESS_UNITS[0], priority: "medium", risk: "medium", category: inferCategory({ type: "Contract" }) });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    onCreate({
      id: nextId("matters", "MAT-"), title: f.title.trim() || "Untitled matter", type: f.type,
      status: "Open", priority: f.priority, risk: f.risk, bu: f.bu, owner: "u1",
      category: f.category || inferCategory({ type: f.type, title: f.title }), companyTags: [],
      opened: nowIso(), due: daysFromNow(14), tasks: 0, docs: 0, comments: 0, progress: 0,
    });
    onClose();
  };
  return html`<${Modal} title="New Matter" icon="folder" width=${540} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>Create matter</${Btn}>`}>
    <div class="col" style="gap:16px">
      <${Field} label="Matter title"><${Input} placeholder="e.g. AWS MSA — Data Residency Review" value=${f.title} onInput=${(e) => set("title", e.target.value)} /></${Field}>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Type"><select class="select" value=${f.type} onChange=${(e) => setF((s) => ({ ...s, type: e.target.value, category: inferCategory({ type: e.target.value }) }))}>${MATTER_TYPES.map((t) => html`<option key=${t}>${t}</option>`)}</select></${Field}>
        <${Field} label="Business Unit"><select class="select" value=${f.bu} onChange=${(e) => set("bu", e.target.value)}>${BUSINESS_UNITS.map((b) => html`<option key=${b}>${b}</option>`)}</select></${Field}>
        <${Field} label="Priority"><select class="select" value=${f.priority} onChange=${(e) => set("priority", e.target.value)}><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></${Field}>
        <${Field} label="Risk"><select class="select" value=${f.risk} onChange=${(e) => set("risk", e.target.value)}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></${Field}>
        <${Field} label="Category"><select class="select" value=${f.category} onChange=${(e) => set("category", e.target.value)}>${WORK_CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></${Field}>
      </div>
      <${AICard} title="Auto-setup">I'll open the matter at the Intake stage, start the audit trail, and suggest tasks based on the matter type.</${AICard}>
    </div>
  </${Modal}>`;
}

const TASKS = [
  { t: "Review counterparty redlines v3", done: true, who: "u5" },
  { t: "Confirm liability cap vs. playbook", done: true, who: "u3" },
  { t: "Escalate change-in-law clause to GC", done: false, who: "u3" },
  { t: "Prepare negotiation position paper", done: false, who: "u10" },
  { t: "Schedule counterparty call", done: false, who: "u5" },
];
const DOCS = [
  { name: "PPA — Execution draft v3.docx", type: "Draft", size: "2.4 MB", who: "u3", when: 0 },
  { name: "ACWA redlines (received).pdf", type: "Redline", size: "1.1 MB", who: "u5", when: -1 },
  { name: "Risk memo — change in law.pdf", type: "Memo", size: "380 KB", who: "u3", when: -2 },
  { name: "Term sheet (signed).pdf", type: "Signed", size: "620 KB", who: "u1", when: -8 },
];
function tlEvents(m) {
  return [
    { title: "Matter created & assigned", meta: `${nameOf(m.owner)} · ${fmt.date(m.opened)}`, tone: "gray" },
    { title: "Moved to Legal Review", meta: `System · ${fmt.dateShort(m.opened)}`, tone: "" },
    { title: "AI flagged 3 high-risk clauses", meta: "Copilot · 2 days ago", tone: "red" },
    { title: "Counterparty submitted redlines v3", meta: "Grace Liu · 1 day ago", tone: "amber" },
    { title: "Comment thread opened on liability cap", meta: `${nameOf(m.owner)} · 4h ago`, tone: "" },
  ];
}

function MatterList() {
  const MATTERS = useCollection("matters");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [modal, setModal] = useState(false);
  const [cats, setCats] = useState([]);
  const toggleCat = (c) => setCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const tabs = [
    { key: "all", label: "All", count: MATTERS.length },
    { key: "mine", label: "Assigned to me", count: MATTERS.filter((m) => m.owner === "u1").length },
    { key: "high", label: "High risk", count: MATTERS.filter((m) => ["high", "critical"].includes(m.risk)).length },
    { key: "open", label: "Active", count: MATTERS.filter((m) => m.progress < 100).length },
  ];
  let rows = MATTERS.filter((m) => (!q || m.title.toLowerCase().includes(q.toLowerCase())) && matchCategories(m, cats));
  if (tab === "mine") rows = rows.filter((m) => m.owner === "u1");
  if (tab === "high") rows = rows.filter((m) => ["high", "critical"].includes(m.risk));
  if (tab === "open") rows = rows.filter((m) => m.progress < 100);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Matters" sub="Every legal engagement, tracked end-to-end with full audit history."
      actions=${html`<${Btn} variant="ghost" icon="filter">Filter</${Btn}><${Btn} variant="primary" icon="plus" onClick=${() => setModal(true)}>New matter</${Btn}>`} />
    ${modal && html`<${NewMatterModal} onClose=${() => setModal(false)} onCreate=${(m) => addItem("matters", m)} />`}
    <${StatStrip} stats=${[
      { value: MATTERS.filter((m) => m.progress < 100).length, label: "Active matters" },
      { value: MATTERS.filter((m) => ["high", "critical"].includes(m.risk)).length, label: "High / critical risk", trend: "▲", trendDir: "up" },
      { value: "3.4d", label: "Avg. cycle time", trend: "-29%", trendDir: "down" },
      { value: MATTERS.filter((m) => new Date(m.due) < Date.now() && m.progress < 100).length, label: "Overdue" },
    ]} />
    <div style="margin-bottom:16px"><${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} /></div>
    <div style="width:280px;margin-bottom:14px"><${Toolbar} search=${q} onSearch=${setQ} /></div>
    <div class="row wrap" style="gap:8px;margin-bottom:16px"><${CategoryChips} selected=${cats} onToggle=${toggleCat} /></div>
    <${DataTable} onRow=${(m) => navigate("/matters/" + m.id)} columns=${[
      { key: "id", label: "ID", mono: true, width: "88px" },
      { key: "title", label: "Matter", render: (m) => html`<div class="cell-strong">${m.title}</div><div class="tiny muted">${m.type} · ${m.bu}</div>` },
      { key: "status", label: "Status", render: (m) => html`<${Status} value=${m.status} />` },
      { key: "category", label: "Category", render: (m) => html`<${CategoryPill} item=${m} />` },
      { key: "priority", label: "Priority", render: (m) => html`<${Priority} level=${m.priority} />` },
      { key: "risk", label: "Risk", render: (m) => html`<${Risk} level=${m.risk} />` },
      { key: "progress", label: "Progress", width: "130px", render: (m) => html`<div class="row" style="gap:8px"><div style="flex:1"><${Progress} value=${m.progress} tone=${m.progress === 100 ? "green" : ""} /></div><span class="tiny muted">${m.progress}%</span></div>` },
      { key: "owner", label: "Owner", render: (m) => html`<${Avatar} name=${nameOf(m.owner)} size="sm" />` },
      { key: "due", label: "Due", render: (m) => html`<span class=${cx("tiny strong", new Date(m.due) < Date.now() && m.progress < 100 && "risk--critical")}>${fmt.until(m.due)}</span>` },
    ]} rows=${rows} />
  </div>`;
}

function MatterDetail({ id }) {
  const m = useCollection("matters").find((x) => x.id === id);
  // "Flow" is the DEFAULT tab — the GC sees the process before the outputs.
  const [tab, setTab] = useState("flow");
  const [comment, setComment] = useState("");
  const [tagEdit, setTagEdit] = useState(false);
  if (!m) return html`<div class="page"><${Btn} icon="arrowLeft" onClick=${() => navigate("/matters")}>Back to matters</${Btn}><div class="empty">Matter not found.</div></div>`;
  const related = CONTRACTS.filter((c) => c.bu === m.bu).slice(0, 3);
  const participants = [m.owner, "u1", "u11", "u3"];
  // Sprint 4 — the requester thread lives on the request face of this record.
  const linkedRequest = useCollection("requests").find((r) => r.id === m.requestId || r.matterId === m.id) || null;
  const messages = useCollection("messages");
  const reqUnread = linkedRequest ? unreadCount(linkedRequest.id, "u1", messages) : 0;
  const reqAsks = linkedRequest ? (linkedRequest.requiredDocs || []).filter((d) => d.status === "requested").length : 0;

  const tabsCfg = [
    { key: "flow", label: "Flow", icon: "workflow" },
    { key: "overview", label: "Overview", icon: "layers" },
    ...(linkedRequest ? [{ key: "requester", label: "Requester", icon: "user", count: (reqUnread + reqAsks) || undefined }] : []),
    { key: "timeline", label: "Timeline", icon: "activity" },
    { key: "documents", label: "Documents", icon: "file", count: DOCS.length },
    { key: "tasks", label: "Tasks", icon: "checksquare", count: TASKS.filter((t) => !t.done).length },
    { key: "comments", label: "Comments", icon: "message", count: m.comments },
  ];

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:14px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/matters")}>Matters</${Btn}>
    </div>
    <div class="pagehead" style="margin-bottom:18px">
      <div class="pagehead__main">
        <div class="row" style="gap:8px;margin-bottom:8px">
          <span class="mono muted">${m.id}</span><${Status} value=${m.status} /><${Priority} level=${m.priority} /><${Risk} level=${m.risk} /><${CategoryPill} item=${m} />
        </div>
        <div class="pagehead__title">${m.title}</div>
      </div>
      <div class="pagehead__actions">
        <${Btn} variant="ghost" icon="share">Share</${Btn}>
        <${Dropdown} trigger=${html`<${Btn} variant="ghost" icon="more" />`}>
          <${MenuItem} icon="edit">Edit matter</${MenuItem}>
          <${MenuItem} icon="user">Reassign owner</${MenuItem}>
          <${MenuItem} icon="flag">Escalate</${MenuItem}>
          <div class="menu__sep"></div>
          <${MenuItem} icon="trash" danger=${true}>Archive</${MenuItem}>
        </${Dropdown}>
        <${Btn} variant="primary" icon="checksquare">Request approval</${Btn}>
      </div>
    </div>

    <!-- Flow is the default tab: input → stages → outputs → relationships -->
    ${tab === "flow" ? html`<div class="col" style="gap:16px">
      <div class="card"><div style="padding:6px 18px 0"><${Tabs} tabs=${tabsCfg} active=${tab} onChange=${setTab} /></div></div>
      <${WorkflowSpine} id=${m.id} showHeader=${false} />
    </div>` : tab === "requester" && linkedRequest ? html`<div class="col" style="gap:16px">
      <div class="card"><div style="padding:6px 18px 0"><${Tabs} tabs=${tabsCfg} active=${tab} onChange=${setTab} /></div></div>
      <${RequesterPanel} requestId=${linkedRequest.id} viewer="u1" />
    </div>` : html`
    <div class="grid" style="grid-template-columns:1fr 340px;align-items:start">
      <div class="col" style="gap:16px">
        <div class="card"><div style="padding:6px 18px 0"><${Tabs} tabs=${tabsCfg} active=${tab} onChange=${setTab} /></div>
          <div class="card__body">
            ${tab === "overview" && html`<div class="col" style="gap:20px">
              <div>
                <div class="tiny muted" style="margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Lifecycle stage</div>
                <div class="row wrap" style="gap:8px">
                  ${["Intake", "Legal Review", "Negotiation", "Approval", "Execution"].map((s, i) => html`<div key=${s} class="row" style="gap:6px">
                    <span class=${cx("kcol__dot")} style=${`background:${i <= 2 ? "var(--brand)" : "var(--surface-3)"}`}></span><span class=${cx("tiny", i <= 2 ? "strong" : "muted")}>${s}</span>${i < 4 && html`<${Icon} name="chevronRight" size=13 style=${{ color: "var(--text-3)" }} />`}
                  </div>`)}
                </div>
              </div>
              <div><div class="tiny muted" style="margin-bottom:6px;font-weight:600">Progress</div><div class="row" style="gap:10px"><div style="flex:1"><${Progress} value=${m.progress} /></div><span class="strong">${m.progress}%</span></div></div>
              <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:14px">
                ${[["Type", m.type], ["Business Unit", m.bu], ["Opened", fmt.date(m.opened)], ["Due", fmt.date(m.due)], ["Documents", m.docs], ["Comments", m.comments]].map(([l, v]) => html`<div key=${l}><div class="tiny muted">${l}</div><div class="panel__title" style="margin-top:2px">${v}</div></div>`)}
              </div>
            </div>`}
            ${tab === "timeline" && html`<${Timeline} items=${tlEvents(m)} />`}
            ${tab === "documents" && html`<div class="col" style="gap:2px">
              ${DOCS.map((doc) => html`<div key=${doc.name} class="feed__item" style="align-items:center">
                <div class="notif__ico" style="width:34px;height:34px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="file" size=16 /></div>
                <div style="flex:1"><div class="strong" style="font-size:13px">${doc.name}</div><div class="tiny muted">${doc.type} · ${doc.size} · ${nameOf(doc.who)} · ${fmt.rel(new Date(Date.now() + doc.when * 86400000))}</div></div>
                <button class="iconbtn"><${Icon} name="download" size=16 /></button>
              </div>`)}
            </div>`}
            ${tab === "tasks" && html`<div class="col" style="gap:2px">
              ${TASKS.map((t, i) => html`<div key=${i} class="feed__item" style="align-items:center">
                <div class=${cx("step__dot")} style=${`width:22px;height:22px;font-size:11px;${t.done ? "background:var(--success);border-color:var(--success);color:#fff" : ""}`}>${t.done ? html`<${Icon} name="check" size=12 />` : ""}</div>
                <div style="flex:1"><div class=${cx("strong", t.done && "muted")} style=${`font-size:13px;${t.done ? "text-decoration:line-through" : ""}`}>${t.t}</div></div>
                <${Avatar} name=${nameOf(t.who)} size="sm" />
              </div>`)}
            </div>`}
            ${tab === "comments" && html`<div class="col">
              ${[{ a: "u3", t: "2h ago", x: "The liability cap at 0.5x fees is below our playbook. Recommend we push for 1x with a supercap for data breach." }, { a: "u1", t: "1h ago", x: "Agreed. Flag the change-in-law clause too — that's the real exposure on a 25-year term." }, { a: "u5", t: "40m ago", x: "Drafting the counter-position now, will circulate before the call." }].map((c, i) => html`<${Comment} key=${i} author=${nameOf(c.a)} time=${c.t} text=${c.x} />`)}
              <div class="row" style="gap:10px;margin-top:12px;align-items:flex-end">
                <${Avatar} name="Layla Al-Rashid" size="md" />
                <textarea class="textarea" rows=1 placeholder="Add a comment…" style="min-height:38px" value=${comment} onInput=${(e) => setComment(e.target.value)}></textarea>
                <${Btn} variant="primary" icon="send" onClick=${() => setComment("")} />
              </div>
            </div>`}
          </div>
        </div>
      </div>

      <div class="col" style="gap:16px">
        <${AICard} title="Matter summary">A 25-year Neom solar PPA (SAR 48M). Three clauses drive the risk profile: <b>termination-for-convenience</b>, <b>force majeure</b>, and <b>change-in-law</b>. Counterparty (ACWA Power) submitted redlines v3 yesterday. <b>Recommended next step:</b> escalate the change-in-law clause to the GC before the counterparty call.</${AICard}>
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Company tags</span><div class="spacer"></div><button class="iconbtn" style="width:28px;height:28px" onClick=${() => setTagEdit(true)}><${Icon} name="edit" size=15 /></button></div>
          ${(m.companyTags || []).length ? html`<${TagChips} ids=${m.companyTags} />` : html`<span class="tiny muted">No company tags. Click edit to add.</span>`}
        </div>
        ${tagEdit && html`<${TagEditor} ids=${m.companyTags || []} onClose=${() => setTagEdit(false)} onSave=${(sel) => updateItem("matters", m.id, { companyTags: sel })} />`}
        <div class="card card--pad col" style="gap:14px">
          <div class="row"><span class="strong">Participants</span><div class="spacer"></div><button class="iconbtn" style="width:28px;height:28px"><${Icon} name="plus" size=15 /></button></div>
          ${[...new Set(participants)].map((p) => html`<div key=${p} class="row" style="gap:10px"><${Avatar} name=${nameOf(p)} size="sm" /><div><div class="strong" style="font-size:13px">${nameOf(p)}</div><div class="tiny muted">${byId(p).role}</div></div></div>`)}
        </div>
        <div class="card card--pad col" style="gap:12px">
          <span class="strong">Key deadlines</span>
          <div class="row"><div class="notif__ico" style="width:30px;height:30px;background:var(--danger-bg);color:var(--danger)"><${Icon} name="clock" size=15 /></div><div style="flex:1"><div class="strong tiny">Counterparty call</div><div class="tiny muted">${fmt.until(m.due)}</div></div></div>
          <div class="row"><div class="notif__ico" style="width:30px;height:30px;background:var(--warning-bg);color:var(--warning)"><${Icon} name="calendar" size=15 /></div><div style="flex:1"><div class="strong tiny">Board term-sheet review</div><div class="tiny muted">in 8d</div></div></div>
        </div>
        <div class="card card--pad col" style="gap:10px">
          <span class="strong">Related contracts</span>
          ${related.map((c) => html`<div key=${c.id} class="row clickable" style="gap:9px" onClick=${() => navigate("/contracts/" + c.id)}>
            <div class="notif__ico" style="width:30px;height:30px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="file" size=15 /></div>
            <div style="flex:1;min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title}</div><div class="tiny muted">${c.id} · ${fmt.money(c.value, c.currency)}</div></div>
            <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
          </div>`)}
        </div>
      </div>
    </div>`}
  </div>`;
}

export default function Matters({ id }) {
  return id ? html`<${MatterDetail} id=${id} />` : html`<${MatterList} />`;
}
