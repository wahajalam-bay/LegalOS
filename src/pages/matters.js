// MODULE 2 — MATTER MANAGEMENT.
// The Matter is the permanent organising record of legal work. This page is the
// register (portfolio view + My Matters work queue) and the Matter Workspace
// (overview · tasks · documents · risk · related · timeline · outcome · flow).
// All writes go through the store engine (validated transitions, computed risk,
// outcome-gated closure, immutable audit); all reads are privilege-filtered.
import { html, cx, fmt, useState, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import {
  Btn, Avatar, AvatarStack, Pill, Status, Tabs, Segmented, Progress, Empty,
  Modal, Field, Input, Textarea, Toggle, Drawer,
} from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { nameOf, byId, USERS, DEPARTMENTS, entityName } from "../data.js";
import {
  useCollection, updateItem, addItem, nextId, nowIso,
  createMatter, convertRequestToMatter, matterById,
  setMatterStatus, closeMatter, reopenMatter, validateOutcome,
  assessMatterRisk, setMatterPrivilege, setMatterOwner, setMatterCollaborators,
  linkMatters, unlinkMatters,
  addMatterTask, setTaskStatus, updateMatterTask,
  findCounterparty, searchCounterparties, createCounterparty, counterpartyById, counterpartyName, counterpartyMatters,
  personName,
} from "../store.js";
import {
  PRACTICE_AREAS, practiceArea, practiceLabel, practiceTone, matterTypesOf,
  MATTER_STATUSES, MATTER_TRANSITIONS, TRANSITION_NEEDS_REASON, MATTER_STATUS_TONE, isTerminal,
  LIKELIHOODS, IMPACTS, riskSeverity, RISK_TONE, proposeRisk,
  OUTCOME_CATEGORIES, POSITION_LEVELS, CLAUSE_TYPES,
  matterAgeDays, ageBandOf, targetVerdict,
  TASK_STATUSES, TASK_TONE, taskOpen,
  CP_RELATIONSHIPS, CP_ENTITY_TYPES,
} from "../matters2.js";
import { useActiveUser, isLegal, filterVisible, visibilityOf, canReassign } from "../rbac.js";
import { WorkflowSpine } from "../spine.js";
import { RequesterPanel } from "./workspace.js";
import { toast } from "../toast.js";

const LEGAL_USERS = USERS.filter((u) => u.dept === "Legal");
const II = { display: "inline", verticalAlign: "-2px", marginRight: "4px" };
const money = (v, cur) => (v == null || v === "" ? "—" : fmt.money(Number(v), cur));

/* ---------------- shared bits ---------------- */
const RiskPill = ({ risk }) => !risk || !risk.severity
  ? html`<span class="tiny muted">not rated</span>`
  : html`<${Pill} tone=${RISK_TONE[risk.severity]}>${risk.severity}${risk.proposed ? " · proposed" : ""}</${Pill}>`;

const PrivPill = ({ m }) => html`<${Pill} tone=${{ Open: "gray", Restricted: "amber", Privileged: "red" }[m.privilege || "Open"]} dot=${m.privilege === "Privileged"}>${m.privilege || "Open"}</${Pill}>`;

const TargetChip = ({ m }) => {
  const v = targetVerdict(m);
  return html`<span class=${cx("tiny strong")} style=${`color:var(--${v.tone === "green" ? "success" : v.tone === "amber" ? "warning" : v.tone === "red" ? "danger" : "text-3"})`}>
    <${Icon} name=${v.icon} size=12 style=${II} />${v.label}
  </span>`;
};

/* ============================================================
   COUNTERPARTY PICKER (Phase 8) — master-record only, dedupe-first.
   ============================================================ */
function CounterpartyPicker({ value, onChange, viewer }) {
  const cps = useCollection("counterparties");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ legalName: "", jurisdiction: "", relationship: "Customer", entityType: "Company", registrationNo: "" });
  const picked = value ? cps.find((c) => c.id === value) : null;
  const matches = q.trim() ? searchCounterparties(q).slice(0, 6) : [];
  const dupe = adding && nf.legalName.trim() ? findCounterparty(nf.legalName) : null;

  if (picked) return html`<div class="row" style="gap:8px">
    <span class="tagchip"><${Icon} name="building" size=12 />${picked.legalName}<span class="tiny muted" style="margin-left:4px">· ${picked.relationship}</span></span>
    <button class="iconbtn" style="width:24px;height:24px" title="Clear" onClick=${() => onChange(null)}><${Icon} name="x" size=13 /></button>
  </div>`;

  return html`<div class="col" style="gap:8px">
    <${Input} placeholder="Search the counterparty master…" value=${q} onInput=${(e) => { setQ(e.target.value); setAdding(false); }} />
    ${matches.length > 0 && html`<div class="col" style="gap:2px">
      ${matches.map((c) => html`<button key=${c.id} class="docrow clickable" style="text-align:left" onClick=${() => { onChange(c.id); setQ(""); }}>
        <${Icon} name="building" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />
        <div style="flex:1;min-width:0"><div class="strong tiny">${c.legalName}</div><div class="tiny muted">${c.jurisdiction} · ${c.relationship}${(c.aliases || []).length ? " · aka " + c.aliases.join(", ") : ""}</div></div>
      </button>`)}
    </div>`}
    ${q.trim() && !matches.length && !adding && html`<div class="row" style="gap:8px">
      <span class="tiny muted">No match in the master.</span>
      <${Btn} size="sm" variant="soft" icon="plus" onClick=${() => { setAdding(true); setNf((s) => ({ ...s, legalName: q.trim() })); }}>New counterparty</${Btn}>
    </div>`}
    ${adding && html`<div class="card card--pad col" style="gap:10px">
      <span class="strong tiny">New counterparty (master record)</span>
      ${dupe && html`<div class="banner banner--warn" style="padding:8px 10px"><${Icon} name="alertTriangle" size=14 /><span class="tiny">Looks like <b>${dupe.legalName}</b> already exists — pick it instead of creating a duplicate.</span></div>`}
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Legal name *"><${Input} value=${nf.legalName} onInput=${(e) => setNf({ ...nf, legalName: e.target.value })} /></${Field}>
        <${Field} label="Jurisdiction"><${Input} value=${nf.jurisdiction} onInput=${(e) => setNf({ ...nf, jurisdiction: e.target.value })} placeholder="e.g. Saudi Arabia" /></${Field}>
        <${Field} label="Relationship"><select class="select" value=${nf.relationship} onChange=${(e) => setNf({ ...nf, relationship: e.target.value })}>${CP_RELATIONSHIPS.map((r) => html`<option key=${r}>${r}</option>`)}</select></${Field}>
        <${Field} label="Entity type"><select class="select" value=${nf.entityType} onChange=${(e) => setNf({ ...nf, entityType: e.target.value })}>${CP_ENTITY_TYPES.map((r) => html`<option key=${r}>${r}</option>`)}</select></${Field}>
        <${Field} label="Registration no."><${Input} value=${nf.registrationNo} onInput=${(e) => setNf({ ...nf, registrationNo: e.target.value })} /></${Field}>
      </div>
      <div class="row" style="gap:8px"><div class="spacer"></div>
        <${Btn} size="sm" variant="ghost" onClick=${() => setAdding(false)}>Cancel</${Btn}>
        <${Btn} size="sm" variant="primary" icon="check" onClick=${() => {
          const res = createCounterparty(nf, viewer.id);
          if (res.ok) { onChange(res.counterparty.id); setQ(""); setAdding(false); toast(res.existed ? "Matched to the existing master record" : "Counterparty added to the master"); }
          else toast(res.error, "error");
        }}>${dupe ? "Use existing" : "Add & select"}</${Btn}>
      </div>
    </div>`}
  </div>`;
}

/* ============================================================
   CREATE MATTER (Phase 7) — direct, or prefilled from a request.
   ============================================================ */
function CreateMatterModal({ fromRequest, onClose, onCreated }) {
  const viewer = useActiveUser();
  const r = fromRequest || null;
  const [f, setF] = useState(() => ({
    name: r ? r.title : "",
    practiceArea: r ? (r.__practice || "commercial") : "commercial",
    matterType: "",
    department: r ? (r.department || r.dept || DEPARTMENTS[0]) : DEPARTMENTS[0],
    counterpartyId: null,
    owner: r ? r.owner || viewer.id : viewer.id,
    collaborators: [],
    targetDate: r && r.dueDate ? String(r.dueDate).slice(0, 10) : "",
    value: r && r.value != null ? r.value : "",
    exposure: "",
    currency: (r && r.currency) || "USD",
    privilege: "Open",
    description: r ? (r.businessContext || r.description || "") : "",
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const types = matterTypesOf(f.practiceArea);
  const mt = f.matterType || types[0];
  const proposal = proposeRisk({ ...f, matterType: mt, exposure: Number(f.exposure) || 0 });
  const [err, setErr] = useState("");

  const submit = () => {
    const overrides = { ...f, matterType: mt, targetDate: f.targetDate || null, value: f.value === "" ? null : Number(f.value), exposure: f.exposure === "" ? null : Number(f.exposure) };
    const res = r
      ? convertRequestToMatter(r.id, overrides, viewer.id)
      : createMatter(overrides, viewer.id);
    if (!res.ok) { setErr(res.error + (res.existing ? " — " + res.existing : "")); return; }
    toast(`${res.id} created`);
    onClose();
    onCreated ? onCreated(res.id) : navigate("/matters/" + res.id);
  };

  return html`<${Modal} title=${r ? "Convert request to matter" : "New matter"} icon="folder" width=${640} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>${r ? "Create matter from " + r.id : "Create matter"}</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${r && html`<div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="inbox" size=15 />
        <div class="tiny"><b>Source request ${r.id}</b> — requester, department, context, counterparty and attachments carry forward. Review before creating; the request will link to the new matter.</div>
      </div>`}
      <${Field} label="Matter name *"><${Input} value=${f.name} onInput=${(e) => set("name", e.target.value)} placeholder="e.g. Customer Service Agreement — Acme" /></${Field}>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <${Field} label="Practice area *">
          <select class="select" value=${f.practiceArea} onChange=${(e) => setF((s) => ({ ...s, practiceArea: e.target.value, matterType: "" }))}>
            ${PRACTICE_AREAS.map((p) => html`<option key=${p.key} value=${p.key}>${p.label}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Matter type *">
          <select class="select" value=${mt} onChange=${(e) => set("matterType", e.target.value)}>
            ${types.map((t) => html`<option key=${t}>${t}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Requesting department">
          <select class="select" value=${f.department} onChange=${(e) => set("department", e.target.value)}>
            ${DEPARTMENTS.map((d) => html`<option key=${d}>${d}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Responsible lawyer *">
          <select class="select" value=${f.owner} onChange=${(e) => set("owner", e.target.value)}>
            ${LEGAL_USERS.map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Target date"><${Input} type="date" value=${f.targetDate} onInput=${(e) => set("targetDate", e.target.value)} /></${Field}>
        <${Field} label="Privilege">
          <select class="select" value=${f.privilege} onChange=${(e) => set("privilege", e.target.value)}>
            <option>Open</option><option>Restricted</option><option>Privileged</option>
          </select>
        </${Field}>
        <${Field} label="Estimated value"><${Input} type="number" value=${f.value} onInput=${(e) => set("value", e.target.value)} placeholder="0" /></${Field}>
        <${Field} label="Estimated exposure"><${Input} type="number" value=${f.exposure} onInput=${(e) => set("exposure", e.target.value)} placeholder="0" /></${Field}>
      </div>
      <${Field} label="Counterparty" hint="From the counterparty master — never free text.">
        <${CounterpartyPicker} value=${f.counterpartyId} onChange=${(v) => set("counterpartyId", v)} viewer=${viewer} />
      </${Field}>
      <${Field} label="Collaborators" hint="The responsible lawyer stays accountable; collaborators get access.">
        <div class="row wrap" style="gap:6px">
          ${LEGAL_USERS.filter((u) => u.id !== f.owner).map((u) => {
            const on = f.collaborators.includes(u.id);
            return html`<button key=${u.id} class=${cx("tagchip", on && "clickable")} style=${on ? "background:var(--brand-soft);border-color:var(--brand);color:var(--brand-600)" : ""}
              onClick=${() => set("collaborators", on ? f.collaborators.filter((x) => x !== u.id) : [...f.collaborators, u.id])}>
              ${u.name.split(" ")[0]}
            </button>`;
          })}
        </div>
      </${Field}>
      <${Field} label="Description / context"><${Textarea} rows=3 value=${f.description} onInput=${(e) => set("description", e.target.value)} /></${Field}>
      <div class="banner" style="background:var(--surface-2);border:1px solid var(--border)">
        <${Icon} name="sparkles" size=15 />
        <span class="tiny"><b>System-proposed risk:</b> ${proposal.severity} (${proposal.likelihood} × ${proposal.impact}) — ${proposal.basis}. Confirm or override it on the matter.</span>
      </div>
      ${err && html`<div class="modwarn"><${Icon} name="alertTriangle" size=14 /> ${err}</div>`}
    </div>
  </${Modal}>`;
}
export { CreateMatterModal };

/* ============================================================
   MATTER REGISTER + MY MATTERS (Phases 5/6)
   ============================================================ */
const QUEUE_CHIPS = [
  { key: "action", label: "Needs action" },
  { key: "overdue", label: "Overdue" },
  { key: "duesoon", label: "Due soon" },
  { key: "awaiting", label: "Awaiting external" },
  { key: "hold", label: "On hold" },
  { key: "done", label: "Recently completed" },
];
function MatterList() {
  const viewer = useActiveUser();
  const all = useCollection("matters");
  const tasks = useCollection("matterTasks");
  // Director / Lead land on the portfolio; individual lawyers on their queue.
  const [scope, setScope] = useState(() => (viewer.rbac === "head" || viewer.rbac === "lead" ? "all" : "mine"));
  const [chip, setChip] = useState("");
  const [q, setQ] = useState("");
  const [pa, setPa] = useState("");
  const [mt, setMt] = useState("");
  const [st, setSt] = useState("");
  const [own, setOwn] = useState("");
  const [dept, setDept] = useState("");
  const [risk, setRisk] = useState("");
  const [age, setAge] = useState("");
  const [sort, setSort] = useState("urgency");
  const [creating, setCreating] = useState(false);
  const [cpView, setCpView] = useState(null); // counterparty drawer

  // Privilege-aware base set — a Privileged matter simply does not exist here
  // for anyone not named on it. (Hooks run before any conditional return.)
  const visible = useMemo(() => filterVisible(viewer, all), [all, viewer]);
  const mine = visible.filter((m) => m.owner === viewer.id || (m.collaborators || []).includes(viewer.id));
  const base = scope === "mine" ? mine : visible;

  const openTaskCount = (m) => tasks.filter((t) => t.matterId === m.id && taskOpen(t) && t.due && new Date(t.due) < Date.now()).length;
  const rows = useMemo(() => {
    let out = base.filter((m) => {
      if (q) {
        const hay = `${m.id} ${m.name || m.title} ${counterpartyName(m.counterpartyId)} ${nameOf(m.owner)}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (pa && m.practiceArea !== pa) return false;
      if (mt && m.matterType !== mt) return false;
      if (st && m.status !== st) return false;
      if (own && m.owner !== own) return false;
      if (dept && (m.department || m.bu) !== dept) return false;
      if (risk && (!m.risk2 || m.risk2.severity !== risk)) return false;
      if (age && ageBandOf(matterAgeDays(m)).key !== age) return false;
      const v = targetVerdict(m);
      if (chip === "overdue" && v.key !== "Overdue") return false;
      if (chip === "duesoon" && v.key !== "Due soon") return false;
      if (chip === "awaiting" && m.status !== "Awaiting External") return false;
      if (chip === "hold" && m.status !== "On Hold") return false;
      if (chip === "done" && !(m.status === "Substantively Complete" || (m.status === "Closed" && m.closedAt && (Date.now() - new Date(m.closedAt)) < 30 * 86400000))) return false;
      if (chip === "action" && !(v.key === "Overdue" || v.key === "Due soon" || openTaskCount(m) > 0)) return false;
      if (!chip && !st && isTerminal(m.status) && m.status === "Archived") return false; // archived leaves normal views
      return true;
    });
    const urg = (m) => { const v = targetVerdict(m); return v.key === "Overdue" ? 0 : v.key === "Due soon" ? 1 : isTerminal(m.status) ? 3 : 2; };
    if (sort === "urgency") out.sort((a, b) => urg(a) - urg(b) || new Date(a.targetDate || "2999") - new Date(b.targetDate || "2999"));
    if (sort === "target") out.sort((a, b) => new Date(a.targetDate || "2999") - new Date(b.targetDate || "2999"));
    if (sort === "age") out.sort((a, b) => matterAgeDays(b) - matterAgeDays(a));
    if (sort === "updated") out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    if (sort === "risk") { const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 }; out.sort((a, b) => (rank[(a.risk || {}).severity] ?? 9) - (rank[(b.risk || {}).severity] ?? 9)); }
    return out;
  }, [base, q, pa, mt, st, own, dept, risk, age, chip, sort, tasks]);

  const active = base.filter((m) => !isTerminal(m.status) && m.status !== "Substantively Complete");
  const kpis = [
    { value: active.length, label: "Active matters" },
    { value: base.filter((m) => targetVerdict(m).key === "Overdue").length, label: "Overdue vs target" },
    { value: base.filter((m) => targetVerdict(m).key === "Due soon").length, label: "Due in 5 days" },
    { value: base.filter((m) => m.status === "Awaiting External").length, label: "Awaiting external" },
    { value: base.filter((m) => m.risk2 && (m.risk2.severity === "High" || m.risk2.severity === "Critical")).length, label: "High / critical risk" },
  ];
  const owners = [...new Set(visible.map((m) => m.owner))].filter(Boolean);
  const depts = [...new Set(visible.map((m) => m.department || m.bu))].filter(Boolean);

  // Matters are internal: requesters track their requests in My Requests.
  if (!isLegal(viewer)) return html`<div class="page"><${Empty} icon="lock" title="Matters are internal" text="Track the requests you raised in My Requests." /></div>`;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Matters" sub="The permanent record of legal work — portfolio, ownership, risk and outcomes."
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>New matter</${Btn}>`} />
    ${creating && html`<${CreateMatterModal} onClose=${() => setCreating(false)} />`}
    ${cpView && html`<${CounterpartyDrawer} cpId=${cpView} onClose=${() => setCpView(null)} viewer=${viewer} />`}

    <${StatStrip} stats=${kpis} />

    <div class="row wrap" style="gap:10px;margin-bottom:14px">
      <${Segmented} value=${scope} onChange=${setScope} options=${[
        { value: "mine", label: `My matters · ${mine.filter((m) => !isTerminal(m.status)).length}` },
        { value: "all", label: "All matters" },
      ]} />
      <div class="row wrap" style="gap:6px">
        ${QUEUE_CHIPS.map((c) => html`<button key=${c.key} class=${cx("tagchip", chip === c.key && "clickable")}
          style=${chip === c.key ? "background:var(--brand-soft);border-color:var(--brand);color:var(--brand-600);font-weight:600" : ""}
          onClick=${() => setChip(chip === c.key ? "" : c.key)}>${c.label}</button>`)}
      </div>
    </div>

    <div class="card" style="padding:0">
      <div class="modtoolbar">
        <div class="modtoolbar__search">
          <${Icon} name="search" size=15 />
          <input placeholder="Search id, name, counterparty, owner…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        </div>
        <select class="input input--sm" value=${pa} onChange=${(e) => { setPa(e.target.value); setMt(""); }}>
          <option value="">Practice: all</option>
          ${PRACTICE_AREAS.map((p) => html`<option key=${p.key} value=${p.key}>${p.label}</option>`)}
        </select>
        <select class="input input--sm" value=${mt} onChange=${(e) => setMt(e.target.value)}>
          <option value="">Type: all</option>
          ${(pa ? matterTypesOf(pa) : [...new Set(visible.map((m) => m.matterType))].filter(Boolean)).map((t) => html`<option key=${t}>${t}</option>`)}
        </select>
        <select class="input input--sm" value=${st} onChange=${(e) => setSt(e.target.value)}>
          <option value="">Status: all</option>
          ${MATTER_STATUSES.map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${own} onChange=${(e) => setOwn(e.target.value)}>
          <option value="">Owner: all</option>
          ${owners.map((u) => html`<option key=${u} value=${u}>${nameOf(u).split(" ")[0]}</option>`)}
        </select>
        <select class="input input--sm" value=${dept} onChange=${(e) => setDept(e.target.value)}>
          <option value="">Dept: all</option>
          ${depts.map((d) => html`<option key=${d}>${d}</option>`)}
        </select>
        <select class="input input--sm" value=${risk} onChange=${(e) => setRisk(e.target.value)}>
          <option value="">Risk: all</option>
          ${["Critical", "High", "Medium", "Low"].map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${age} onChange=${(e) => setAge(e.target.value)}>
          <option value="">Age: all</option>
          ${["0-7", "8-30", "31-60", "61-90", "90+"].map((b) => html`<option key=${b} value=${b}>${b} days</option>`)}
        </select>
        <select class="input input--sm" value=${sort} onChange=${(e) => setSort(e.target.value)}>
          <option value="urgency">Sort: urgency</option>
          <option value="target">Sort: target date</option>
          <option value="age">Sort: ageing</option>
          <option value="updated">Sort: recently updated</option>
          <option value="risk">Sort: risk</option>
        </select>
      </div>
      <div class="dense"><${DataTable} onRow=${(m) => navigate("/matters/" + m.id)} rows=${rows}
        empty=${html`<${Empty} icon="folder" title="No matters match" text="Clear a filter, or open the first matter." />`}
        columns=${[
          { key: "id", label: "ID", mono: true, width: "118px" },
          { key: "name", label: "Matter", render: (m) => html`<div class="wrapcell"><div class="cell-strong">${m.name || m.title}</div><div class="tiny muted">${m.matterType || m.type}</div></div>` },
          { key: "practiceArea", label: "Practice", width: "110px", render: (m) => html`<${Pill} tone=${practiceTone(m.practiceArea)}>${practiceLabel(m.practiceArea)}</${Pill}>` },
          { key: "department", label: "Dept", width: "96px", render: (m) => html`<span class="tiny">${m.department || m.bu || "—"}</span>` },
          { key: "counterpartyId", label: "Counterparty", width: "140px", render: (m) => m.counterpartyId
            ? html`<button class="tagchip" onClick=${(e) => { e.stopPropagation(); setCpView(m.counterpartyId); }}><${Icon} name="building" size=11 />${counterpartyName(m.counterpartyId)}</button>`
            : html`<span class="tiny muted">—</span>` },
          { key: "owner", label: "Owner", width: "60px", render: (m) => html`<${Avatar} name=${nameOf(m.owner)} size="sm" />` },
          { key: "status", label: "Status", width: "128px", render: (m) => html`<${Pill} tone=${MATTER_STATUS_TONE[m.status] || "gray"} dot=${true}>${m.status}</${Pill}>` },
          { key: "risk", label: "Risk", width: "104px", render: (m) => html`<${RiskPill} risk=${m.risk2} />` },
          { key: "targetDate", label: "Target", width: "118px", render: (m) => html`<${TargetChip} m=${m} />` },
          { key: "age", label: "Age", width: "82px", render: (m) => { const d = matterAgeDays(m); return html`<div><div class="tiny strong">${d}d</div><div class="tiny muted">${ageBandOf(d).label}</div></div>`; } },
          { key: "value", label: "Value / Exposure", align: "right", width: "128px", render: (m) => html`<div style="text-align:right"><div class="tiny strong">${money(m.value, m.currency)}</div><div class="tiny muted">${m.exposure != null ? "exp " + money(m.exposure, m.currency) : ""}</div></div>` },
        ]} /></div>
    </div>
  </div>`;
}

/* ============================================================
   COUNTERPARTY DRAWER (Phase 8) — the consolidated relationship view.
   ============================================================ */
function CounterpartyDrawer({ cpId, onClose, viewer }) {
  const cp = counterpartyById(cpId);
  useCollection("matters"); // subscribe
  if (!cp) return null;
  const related = filterVisible(viewer, counterpartyMatters(cpId));
  const open = related.filter((m) => !isTerminal(m.status));
  const hist = related.filter((m) => isTerminal(m.status));
  return html`<${Drawer} title=${cp.legalName} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Close</${Btn}>`}>
    <div class="col" style="gap:16px">
      <div class="row wrap" style="gap:8px">
        <${Pill} tone="blue">${cp.relationship}</${Pill}>
        <${Pill} tone="gray">${cp.entityType}</${Pill}>
        <span class="tiny muted">${cp.jurisdiction}${cp.registrationNo ? " · Reg " + cp.registrationNo : ""}</span>
      </div>
      ${(cp.aliases || []).length > 0 && html`<div class="tiny muted">Also known as: ${cp.aliases.join(", ")}</div>`}
      <div>
        <div class="fpop__lbl" style="margin-bottom:8px">Open matters · ${open.length}</div>
        ${open.length === 0 ? html`<span class="tiny muted">None open.</span>` : open.map((m) => html`<div key=${m.id} class="docrow clickable" onClick=${() => { onClose(); navigate("/matters/" + m.id); }}>
          <span class="mono tiny">${m.id}</span>
          <div style="flex:1;min-width:0"><div class="strong tiny ellipsis">${m.name || m.title}</div></div>
          <${Pill} tone=${MATTER_STATUS_TONE[m.status] || "gray"}>${m.status}</${Pill}>
        </div>`)}
      </div>
      <div>
        <div class="fpop__lbl" style="margin-bottom:8px">Historical · ${hist.length}</div>
        ${hist.length === 0 ? html`<span class="tiny muted">No closed matters.</span>` : hist.map((m) => html`<div key=${m.id} class="docrow clickable" onClick=${() => { onClose(); navigate("/matters/" + m.id); }}>
          <span class="mono tiny">${m.id}</span>
          <div style="flex:1;min-width:0"><div class="strong tiny ellipsis">${m.name || m.title}</div></div>
          <span class="tiny muted">${m.closedAt ? fmt.date(m.closedAt) : ""}</span>
        </div>`)}
      </div>
    </div>
  </${Drawer}>`;
}

/* ============================================================
   STATUS CONTROL (Phases 4/20) — valid transitions only; reasons captured;
   Close routes through the outcome workflow.
   ============================================================ */
function StatusControl({ m, viewer }) {
  const [asking, setAsking] = useState(null); // target status needing a reason
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const nexts = MATTER_TRANSITIONS[m.status] || [];
  const go = (to) => {
    if (to === "Closed") { setClosing(true); return; }
    if (m.status === "Closed" && to === "Active") { setAsking("Active"); return; } // reopen needs a reason
    if (TRANSITION_NEEDS_REASON.has(to)) { setAsking(to); return; }
    const res = setMatterStatus(m.id, to, viewer.id);
    res.ok ? toast("Status: " + to) : toast(res.error, "error");
  };
  return html`<${Fragment}>
    <div class="row wrap" style="gap:6px">
      ${nexts.map((to) => html`<${Btn} key=${to} size="sm" variant=${to === "Closed" ? "primary" : to === "Active" && m.status !== "Open" ? "primary" : "soft"}
        icon=${to === "Closed" ? "checkcircle" : to === "Active" ? "play" : to === "Archived" ? "database" : "arrowRight"}
        onClick=${() => go(to)}>${to === "Closed" ? "Close matter…" : to}</${Btn}>`)}
      ${nexts.length === 0 && html`<span class="tiny muted">Archived — historical record.</span>`}
    </div>
    ${asking && html`<${Modal} title=${(m.status === "Closed" ? "Reopen matter" : "Move to " + asking)} icon="workflow" width=${460} onClose=${() => setAsking(null)}
      footer=${html`<${Btn} onClick=${() => setAsking(null)}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${() => {
        const res = m.status === "Closed" && asking === "Active" ? reopenMatter(m.id, viewer.id, reason) : setMatterStatus(m.id, asking, viewer.id, reason);
        if (res.ok) { toast("Status: " + asking); setAsking(null); setReason(""); } else toast(res.error, "error");
      }}>Confirm</${Btn}>`}>
      <${Field} label="Reason *" hint="Recorded in the audit trail.">
        <${Input} value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder=${asking === "Awaiting External" ? "e.g. waiting on regulator response" : "why?"} />
      </${Field}>
    </${Modal}>`}
    ${closing && html`<${OutcomeModal} m=${m} viewer=${viewer} onClose=${() => setClosing(false)} />`}
  </${Fragment}>`;
}

/* ============================================================
   OUTCOME + CLOSURE (Phases 19/20) — a matter cannot close without it.
   ============================================================ */
function OutcomeModal({ m, viewer, onClose }) {
  const [o, setO] = useState({
    category: "", positionAchieved: "", conceded: [], held: [],
    externalCounsel: false, externalRef: "", externalCost: "", externalCurrency: m.currency || "USD",
    lessons: "", differently: "",
  });
  const set = (k, v) => setO((s) => ({ ...s, [k]: v }));
  const togglePos = (k, c) => setO((s) => ({ ...s, [k]: s[k].includes(c) ? s[k].filter((x) => x !== c) : [...s[k], c] }));
  // §4.7 — conceded/held are multi-selects from the clause list (chips).
  const ClausePick = ({ field }) => html`<div class="row wrap" style="gap:5px">
    ${CLAUSE_TYPES.map((c) => {
      const on = o[field].includes(c);
      return html`<button key=${c} class="tagchip" style=${on ? "background:var(--brand-soft);border-color:var(--brand);color:var(--brand-600);font-weight:600" : ""}
        onClick=${() => togglePos(field, c)}>${c}</button>`;
    })}
  </div>`;
  const missing = validateOutcome({ ...o, externalCost: o.externalCost === "" ? null : o.externalCost });
  const submit = () => {
    const res = closeMatter(m.id, { ...o, externalCost: o.externalCost === "" ? null : Number(o.externalCost) }, viewer.id);
    if (res.ok) { toast(m.id + " closed — outcome recorded"); onClose(); }
    else toast(res.missing ? "Missing: " + res.missing.join(", ") : res.error, "error");
  };
  return html`<${Modal} title="Close matter — outcome record" icon="checkcircle" width=${620} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${missing.length > 0} title=${missing.length ? "Missing: " + missing.join(", ") : ""} onClick=${submit}>Record outcome & close</${Btn}>`}>
    <p class="tiny muted" style="margin-top:0">A matter cannot close without this. Duration is calculated by the system (${matterAgeDays(m)} days so far).</p>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <${Field} label="Outcome category *">
        <select class="select" value=${o.category} onChange=${(e) => set("category", e.target.value)}>
          <option value="">Select…</option>${OUTCOME_CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Position achieved vs sought *">
        <select class="select" value=${o.positionAchieved} onChange=${(e) => set("positionAchieved", e.target.value)}>
          <option value="">Select…</option>${POSITION_LEVELS.map((p) => html`<option key=${p}>${p}</option>`)}
        </select>
      </${Field}>
    </div>
    <${Field} label="Key positions conceded" hint="Multi-select from the playbook clause list."><${ClausePick} field="conceded" /></${Field}>
    <${Field} label="Key positions held" hint="Multi-select from the playbook clause list."><${ClausePick} field="held" /></${Field}>
    <${Field} label="External counsel used"><${Toggle} on=${o.externalCounsel} onChange=${(v) => set("externalCounsel", v)} /></${Field}>
    ${o.externalCounsel && html`<div class="grid" style="grid-template-columns:2fr 1fr 1fr;gap:12px">
      <${Field} label="External counsel reference"><${Input} value=${o.externalRef} onInput=${(e) => set("externalRef", e.target.value)} placeholder="firm / engagement ref" /></${Field}>
      <${Field} label="Total cost *"><${Input} type="number" value=${o.externalCost} onInput=${(e) => set("externalCost", e.target.value)} /></${Field}>
      <${Field} label="Currency *">
        <select class="select" value=${o.externalCurrency} onChange=${(e) => set("externalCurrency", e.target.value)}>
          <option>USD</option><option>SAR</option><option>PKR</option><option>AED</option>
        </select>
      </${Field}>
    </div>`}
    <${Field} label="Lessons / precedent value" hint="Flagged for the knowledge base.">
      <${Textarea} rows=2 value=${o.lessons} onInput=${(e) => set("lessons", e.target.value)} />
    </${Field}>
    <${Field} label="Would we do this differently?">
      <${Textarea} rows=2 value=${o.differently} onInput=${(e) => set("differently", e.target.value)} />
    </${Field}>
    ${missing.length > 0 && html`<div class="banner banner--warn" style="margin-top:4px"><${Icon} name="alertTriangle" size=14 /><span class="tiny">Still needed: ${missing.join(", ")}.</span></div>`}
  </${Modal}>`;
}

/* ============================================================
   RISK PANEL (Phases 12/13) — proposal → confirm/override with reason.
   ============================================================ */
function RiskPanel({ m, viewer }) {
  const r = m.risk2 || null;
  const proposal = r && r.proposed ? r : proposeRisk(m);
  const [lk, setLk] = useState((r && r.likelihood) || proposal.likelihood);
  const [im, setIm] = useState((r && r.impact) || proposal.impact);
  const [reason, setReason] = useState("");
  const sev = riskSeverity(lk, im);
  const overriding = proposal && (lk !== proposal.likelihood || im !== proposal.impact);
  const confirmed = r && !r.proposed;
  return html`<div class="card card--pad col" style="gap:12px">
    <div class="row"><span class="strong">Risk assessment</span><div class="spacer"></div><${RiskPill} risk=${r} /></div>
    <div class="tiny muted">
      ${confirmed
        ? html`Confirmed by ${nameOf(r.confirmedBy)} · ${fmt.date(r.confirmedAt)}${r.override ? html`<div class="tiny" style="color:var(--warning);margin-top:3px"><${Icon} name="alertTriangle" size=11 style=${II} />Override — system proposed ${r.override.from.severity} (${r.override.from.likelihood} × ${r.override.from.impact}). Reason: ${r.override.reason}</div>` : ""}`
        : html`<b>System proposed:</b> ${proposal.severity} (${proposal.likelihood} × ${proposal.impact}) — ${proposal.basis || "rule-based"}`}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <${Field} label="Likelihood">
        <select class="select" value=${lk} onChange=${(e) => setLk(e.target.value)}>${LIKELIHOODS.map((l) => html`<option key=${l}>${l}</option>`)}</select>
      </${Field}>
      <${Field} label="Impact">
        <select class="select" value=${im} onChange=${(e) => setIm(e.target.value)}>${IMPACTS.map((i) => html`<option key=${i}>${i}</option>`)}</select>
      </${Field}>
    </div>
    <div class="row" style="gap:8px">
      <span class="tiny">Computed severity:</span>
      <${Pill} tone=${RISK_TONE[sev]}>${sev}</${Pill}>
      <span class="tiny muted">— always calculated, never typed</span>
    </div>
    ${overriding && html`<${Field} label="Override reason *" hint="You are departing from the system proposal — logged in the audit trail.">
      <${Input} value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="why the proposal is wrong here" />
    </${Field}>`}
    <div class="row"><div class="spacer"></div>
      <${Btn} size="sm" variant="primary" icon="check" onClick=${() => {
        const res = assessMatterRisk(m.id, lk, im, viewer.id, reason);
        res.ok ? toast("Risk confirmed: " + sev) : toast(res.error, "error");
      }}>${overriding ? "Override & confirm" : "Confirm rating"}</${Btn}>
    </div>
  </div>`;
}

/* ---------------- privilege panel (Phase 14) ---------------- */
function PrivilegePanel({ m, viewer }) {
  const mayEdit = canReassign(viewer); // Lead / Director control privilege
  const [named, setNamed] = useState(null); // editing buffer
  const list = named || m.namedAccess || [];
  return html`<div class="card card--pad col" style="gap:10px">
    <div class="row"><span class="strong">Privilege</span><div class="spacer"></div><${PrivPill} m=${m} /></div>
    ${mayEdit ? html`<${Fragment}>
      <select class="select" value=${m.privilege || "Open"} onChange=${(e) => {
        const res = setMatterPrivilege(m.id, e.target.value, m.namedAccess || [], viewer.id);
        res.ok ? toast("Privilege: " + e.target.value, "info", "lock") : toast(res.error, "error");
      }}>
        <option>Open</option><option>Restricted</option><option>Privileged</option>
      </select>
      ${(m.privilege === "Restricted" || m.privilege === "Privileged") && html`<div>
        <div class="tiny muted" style="margin-bottom:6px">Named access — only these people (plus the owner) can see this matter:</div>
        <div class="row wrap" style="gap:5px">
          ${LEGAL_USERS.map((u) => {
            const on = list.includes(u.id);
            return html`<button key=${u.id} class="tagchip" style=${on ? "background:var(--brand-soft);border-color:var(--brand);color:var(--brand-600)" : ""}
              onClick=${() => setNamed(on ? list.filter((x) => x !== u.id) : [...list, u.id])}>${u.name.split(" ")[0]}</button>`;
          })}
        </div>
        ${named && html`<div class="row" style="margin-top:8px"><div class="spacer"></div>
          <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { setMatterPrivilege(m.id, m.privilege, named, viewer.id); setNamed(null); toast("Named access updated"); }}>Save access</${Btn}>
        </div>`}
      </div>`}
    </${Fragment}>` : html`<div class="tiny muted"><${Icon} name="lock" size=11 style=${II} />${m.privilege === "Open" ? "Visible to authorised legal users." : "Access limited to named individuals."} Privilege is set by a Lead or the Director.</div>`}
  </div>`;
}

/* ---------------- tasks tab (Phase 11) ---------------- */
function TasksTab({ m, viewer }) {
  const tasks = useCollection("matterTasks").filter((t) => t.matterId === m.id);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: "", owner: viewer.id, due: "", dependsOn: "" });
  const durationOf = (t) => t.completedAt ? Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.createdAt)) / 86400000)) : null;
  const openTasks = tasks.filter(taskOpen);
  return html`<div class="col" style="gap:12px">
    <div class="row">
      <span class="strong">Tasks</span><span class="tiny muted" style="margin-left:8px">· ${openTasks.length} open</span>
      <div class="spacer"></div>
      <${Btn} size="sm" variant="primary" icon="plus" onClick=${() => setAdding(!adding)}>New task</${Btn}>
    </div>
    ${adding && html`<div class="card card--pad col" style="gap:10px">
      <div class="grid" style="grid-template-columns:2fr 1fr 1fr 1fr;gap:10px">
        <${Field} label="Task *"><${Input} value=${nf.name} onInput=${(e) => setNf({ ...nf, name: e.target.value })} placeholder="e.g. Review counterparty redlines" /></${Field}>
        <${Field} label="Owner *">
          <select class="select" value=${nf.owner} onChange=${(e) => setNf({ ...nf, owner: e.target.value })}>${LEGAL_USERS.map((u) => html`<option key=${u.id} value=${u.id}>${u.name.split(" ")[0]}</option>`)}</select>
        </${Field}>
        <${Field} label="Due"><${Input} type="date" value=${nf.due} onInput=${(e) => setNf({ ...nf, due: e.target.value })} /></${Field}>
        <${Field} label="Depends on">
          <select class="select" value=${nf.dependsOn} onChange=${(e) => setNf({ ...nf, dependsOn: e.target.value })}>
            <option value="">—</option>${tasks.map((t) => html`<option key=${t.id} value=${t.id}>${t.name.slice(0, 30)}</option>`)}
          </select>
        </${Field}>
      </div>
      <div class="row"><div class="spacer"></div>
        <${Btn} size="sm" variant="ghost" onClick=${() => setAdding(false)}>Cancel</${Btn}>
        <${Btn} size="sm" variant="primary" icon="check" onClick=${() => {
          const res = addMatterTask(m.id, { ...nf, dependsOn: nf.dependsOn || null, due: nf.due || null }, viewer.id);
          if (res.ok) { setAdding(false); setNf({ name: "", owner: viewer.id, due: "", dependsOn: "" }); toast("Task created"); } else toast(res.error, "error");
        }}>Add task</${Btn}>
      </div>
    </div>`}
    ${tasks.length === 0
      ? html`<${Empty} icon="checksquare" title="No tasks yet" text="Break the matter into owned, dated tasks." />`
      : html`<div class="tablewrap"><table class="table">
        <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th><th>Duration</th></tr></thead>
        <tbody>
          ${tasks.map((t) => {
            const overdue = taskOpen(t) && t.due && new Date(t.due) < Date.now();
            const dep = t.dependsOn ? tasks.find((x) => x.id === t.dependsOn) : null;
            const blockedByDep = dep && taskOpen(dep);
            return html`<tr key=${t.id}>
              <td style="max-width:340px">
                <div class=${cx("tiny strong", t.status === "Completed" && "muted")} style=${t.status === "Completed" ? "text-decoration:line-through" : ""}>${t.name}</div>
                ${dep && html`<div class="tiny muted"><${Icon} name="gitbranch" size=10 style=${II} />after: ${dep.name.slice(0, 40)}${blockedByDep ? " (open)" : ""}</div>`}
              </td>
              <td><span class="row" style="gap:6px"><${Avatar} name=${nameOf(t.owner)} size="xs" />${nameOf(t.owner).split(" ")[0]}</span></td>
              <td class=${cx("tiny", overdue && "strong")} style=${overdue ? "color:var(--danger)" : ""}>${t.due ? fmt.dateShort(t.due) : "—"}${overdue ? html` <${Icon} name="alertTriangle" size=11 style=${II} />` : ""}</td>
              <td>
                <select class="input input--sm" value=${t.status} onChange=${(e) => { const res = setTaskStatus(t.id, e.target.value, viewer.id); if (!res.ok) toast(res.error, "error"); }}>
                  ${TASK_STATUSES.map((s) => html`<option key=${s}>${s}</option>`)}
                </select>
              </td>
              <td class="tiny muted">${durationOf(t) != null ? durationOf(t) + "d" : "—"}</td>
            </tr>`;
          })}
        </tbody>
      </table></div>`}
  </div>`;
}

/* ---------------- documents tab (Phase 17) ---------------- */
function DocumentsTab({ m, viewer }) {
  const repo = useCollection("repository");
  const docs = repo.filter((d) => d.matterId === m.id || (m.sourceRequestId && d.requestId === m.sourceRequestId));
  const onFiles = (fileList) => {
    [...(fileList || [])].forEach((file) => {
      // documents belong to the matter and inherit its privilege via the matter link
      addItem("repository", {
        id: nextId("repository", "DOC-"), name: file.name, kind: "Matter document", source: "Upload",
        matterId: m.id, requestId: m.sourceRequestId || null, entityId: m.entityId || null,
        uploadedBy: viewer.id, uploadedAt: nowIso(), pages: null,
        sizeKb: Math.max(1, Math.round((file.size || 0) / 1024)),
        ocrStatus: "Not required", ocrConfidence: 1, srNo: null,
        storagePath: `/legal/matters/${m.id}/${file.name}`,
        driveLink: null, extractedFields: {},
      });
    });
    toast("Document attached to " + m.id);
  };
  return html`<div class="col" style="gap:12px">
    <div class="row">
      <span class="strong">Documents</span><span class="tiny muted" style="margin-left:8px">· ${docs.length}</span>
      <div class="spacer"></div>
      <label class="btn btn--soft btn--sm" style="cursor:pointer">
        <${Icon} name="upload" size=14 />Upload
        <input type="file" multiple style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.zip"
          onChange=${(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </label>
    </div>
    ${docs.length === 0
      ? html`<${Empty} icon="file" title="No documents" text="Uploads and carried-forward request attachments appear here. Access inherits the matter's privilege." />`
      : docs.map((d) => html`<div key=${d.id} class="docrow clickable" onClick=${() => navigate("/repository/" + d.id)}>
          <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="file" size=15 /></div>
          <div style="flex:1;min-width:0">
            <div class="strong tiny ellipsis">${d.name}</div>
            <div class="tiny muted">${d.kind}${d.sizeKb ? " · " + d.sizeKb + " KB" : ""} · ${personName(d.uploadedBy)} · ${d.uploadedAt ? fmt.rel(d.uploadedAt) : ""}</div>
          </div>
          ${d.requestId && !d.matterId && html`<${Pill} tone="gray">from ${d.requestId}</${Pill}>`}
          <${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)" }} />
        </div>`)}
  </div>`;
}

/* ---------------- related matters tab (Phase 16) ---------------- */
function RelatedTab({ m, viewer }) {
  const all = useCollection("matters");
  const visible = filterVisible(viewer, all);
  const [q, setQ] = useState("");
  const [rel, setRel] = useState("related");
  const linkedIds = new Set((m.relatedMatters || []).map((r) => r.id));
  const matches = q.trim() ? visible.filter((x) => x.id !== m.id && !linkedIds.has(x.id) && (`${x.id} ${x.name || x.title}`).toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  // Never reveal a restricted matter through a relationship: only render links
  // the viewer could see directly.
  const shown = (m.relatedMatters || []).filter((r) => visible.some((x) => x.id === r.id));
  return html`<div class="col" style="gap:14px">
    <div class="card card--pad col" style="gap:10px">
      <span class="strong tiny">Link a matter</span>
      <div class="row" style="gap:8px">
        <${Input} placeholder="Search matter id or name…" value=${q} onInput=${(e) => setQ(e.target.value)} style=${{ flex: 1 }} />
        <select class="input input--sm" value=${rel} onChange=${(e) => setRel(e.target.value)}>
          <option value="related">related</option><option value="arises from">arises from</option>
          <option value="supersedes">supersedes</option><option value="same counterparty">same counterparty</option>
        </select>
      </div>
      ${matches.map((x) => html`<div key=${x.id} class="docrow clickable" onClick=${() => { const res = linkMatters(m.id, x.id, rel, viewer.id); res.ok ? toast("Linked " + x.id) : toast(res.error, "error"); setQ(""); }}>
        <span class="mono tiny">${x.id}</span>
        <div style="flex:1;min-width:0"><div class="strong tiny ellipsis">${x.name || x.title}</div></div>
        <${Icon} name="link" size=13 style=${{ color: "var(--brand)" }} />
      </div>`)}
    </div>
    ${shown.length === 0
      ? html`<${Empty} icon="git" title="No related matters" text="Link matters that share a counterparty, dispute or transaction." />`
      : shown.map((r) => {
          const x = visible.find((v) => v.id === r.id);
          return html`<div key=${r.id} class="docrow">
            <div class="notif__ico" style="width:32px;height:32px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="folder" size=15 /></div>
            <div style="flex:1;min-width:0" class="clickable" onClick=${() => navigate("/matters/" + r.id)}>
              <div class="strong tiny">${r.id} — ${x.name || x.title}</div>
              <div class="tiny muted">${r.relation} · ${x.status}</div>
            </div>
            <button class="iconbtn" style="width:26px;height:26px" title="Remove link" onClick=${() => { unlinkMatters(m.id, r.id, viewer.id); toast("Unlinked"); }}><${Icon} name="x" size=14 /></button>
          </div>`;
        })}
  </div>`;
}

/* ---------------- timeline tab (Phases 18/24) ---------------- */
const AUDIT_ICON = { created: "plus", status: "workflow", risk: "shield", privilege: "lock", owner: "user", collaborators: "users", task: "checksquare", linked: "link", unlinked: "x", closed: "checkcircle", reopened: "refresh" };
function TimelineTab({ m }) {
  const events = [...(m.audit || [])].reverse();
  return html`<div class="col" style="gap:2px">
    ${events.length === 0 && html`<${Empty} icon="activity" title="No history yet" />`}
    ${events.map((e, i) => html`<div key=${i} class="feed__item" style="align-items:flex-start">
      <div class="notif__ico" style="width:30px;height:30px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name=${AUDIT_ICON[e.kind] || "dot"} size=14 /></div>
      <div style="flex:1;min-width:0">
        <div class="tiny strong">${e.kind === "status" ? `Status: ${e.from} → ${e.to}` : e.kind === "risk" ? `Risk: ${e.from} → ${e.to}` : e.kind === "privilege" ? `Privilege: ${e.from} → ${e.to}` : e.kind === "owner" ? `Owner: ${e.from} → ${e.to}` : e.detail || e.kind}</div>
        <div class="tiny muted">${e.by ? nameOf(e.by) : "System"} · ${e.at ? fmt.date(e.at) : ""}${e.reason ? " — " + e.reason : ""}</div>
      </div>
    </div>`)}
  </div>`;
}

/* ---------------- outcome tab (Phase 19) ---------------- */
function OutcomeTab({ m, viewer }) {
  const [closing, setClosing] = useState(false);
  if (m.outcome) {
    const o = m.outcome;
    const list = (v) => (Array.isArray(v) ? (v.length ? v.join(", ") : "—") : v || "—");
    const rows = [
      ["Outcome category", o.category], ["Position achieved", o.positionAchieved],
      ["Positions conceded", list(o.conceded)], ["Positions held", list(o.held)],
      ["External counsel", o.externalCounsel ? `Yes — ${o.externalRef || "ref n/a"} · ${money(o.externalCost, o.externalCurrency)}` : "No"],
      ["Duration", (o.durationDays != null ? o.durationDays : matterAgeDays(m)) + " days (system-calculated)"],
      ["Closed by", `${nameOf(o.closedBy)} · ${o.closedAt ? fmt.date(o.closedAt) : ""}`],
    ];
    return html`<div class="col" style="gap:14px">
      <div class="sheet__facts">${rows.map(([l, v]) => html`<div key=${l} class="sheet__fact"><div class="sheet__fl">${l}</div><div class="sheet__fv">${v}</div></div>`)}</div>
      ${(o.lessons || o.differently) && html`<div class="card card--pad col" style="gap:10px" >
        <div class="row"><span class="strong tiny">Lessons & precedent value</span><div class="spacer"></div><${Pill} tone="purple">flagged for knowledge base</${Pill}></div>
        ${o.lessons && html`<div class="tiny">${o.lessons}</div>`}
        ${o.differently && html`<div class="tiny muted"><b>Do differently:</b> ${o.differently}</div>`}
      </div>`}
    </div>`;
  }
  return html`<div class="col" style="gap:12px">
    <${Empty} icon="checkcircle" title="No outcome yet"
      text="The outcome record is captured at closure — category, position achieved, concessions, external counsel and lessons. A matter cannot close without it." />
    ${!isTerminal(m.status) && html`<div class="row center"><${Btn} variant="primary" icon="checkcircle" onClick=${() => setClosing(true)}>Close matter…</${Btn}></div>`}
    ${closing && html`<${OutcomeModal} m=${m} viewer=${viewer} onClose=${() => setClosing(false)} />`}
  </div>`;
}

/* ============================================================
   MATTER WORKSPACE (Phases 9/10)
   ============================================================ */
function MatterDetail({ id }) {
  const viewer = useActiveUser();
  const all = useCollection("matters");
  const tasks = useCollection("matterTasks");
  const requests = useCollection("requests");
  const m = all.find((x) => x.id === id);
  const [tab, setTab] = useState("overview");
  const [cpView, setCpView] = useState(null);

  // Privilege enforcement at the door: a matter the viewer cannot see is
  // indistinguishable from one that does not exist. Requesters never get in.
  // (All hooks above run unconditionally, so access changes never break render.)
  const vis = m ? visibilityOf(viewer, m) : null;
  if (!m || !isLegal(viewer) || vis !== "full") {
    return html`<div class="page">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/matters")}>Matters</${Btn}>
      <${Empty} icon="lock" title="Not found or no access" text="This matter does not exist, or you are not authorised to view it." />
    </div>`;
  }

  const linkedRequest = requests.find((r) => r.id === (m.sourceRequestId || m.requestId) || r.matterId === m.id) || null;
  const myTasks = tasks.filter((t) => t.matterId === m.id);
  const openTasks = myTasks.filter(taskOpen);
  const age = matterAgeDays(m);
  const mayManage = canReassign(viewer) || m.owner === viewer.id;

  const tabsCfg = [
    { key: "overview", label: "Overview", icon: "layers" },
    { key: "tasks", label: "Tasks", icon: "checksquare", count: openTasks.length || undefined },
    { key: "documents", label: "Documents", icon: "file" },
    { key: "risk", label: "Risk & Privilege", icon: "shield" },
    { key: "related", label: "Related", icon: "git", count: (m.relatedMatters || []).length || undefined },
    { key: "timeline", label: "Timeline", icon: "activity" },
    { key: "outcome", label: "Outcome", icon: "checkcircle" },
    { key: "flow", label: "Flow", icon: "workflow" },
    ...(linkedRequest ? [{ key: "requester", label: "Requester", icon: "user" }] : []),
  ];

  const facts = [
    ["Practice area", practiceLabel(m.practiceArea)],
    ["Matter type", m.matterType || m.type],
    ["Department", m.department || m.bu || "—"],
    ["Counterparty", m.counterpartyId ? counterpartyName(m.counterpartyId) : "—"],
    ["Opened", m.openedAt ? fmt.date(m.openedAt) : "—"],
    ["Target date", m.targetDate ? fmt.date(m.targetDate) : "—"],
    ["Age", `${age} days (${ageBandOf(age).label})`],
    ["Estimated value", money(m.value, m.currency)],
    ["Estimated exposure", money(m.exposure, m.currency)],
    ...(m.closedAt ? [["Closed", fmt.date(m.closedAt)]] : []),
  ];

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:12px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/matters")}>Matters</${Btn}>
    </div>

    <div class="pagehead" style="margin-bottom:14px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px">
          <span class="mono muted">${m.id}</span>
          <${Pill} tone=${MATTER_STATUS_TONE[m.status] || "gray"} dot=${true}>${m.status}</${Pill}>
          <${RiskPill} risk=${m.risk2} />
          ${m.privilege && m.privilege !== "Open" && html`<${PrivPill} m=${m} />`}
          <${TargetChip} m=${m} />
        </div>
        <div class="pagehead__title">${m.name || m.title}</div>
        <div class="row wrap" style="gap:14px;margin-top:8px">
          <span class="row tiny" style="gap:6px"><${Avatar} name=${nameOf(m.owner)} size="xs" /><b>${nameOf(m.owner)}</b><span class="muted">· responsible lawyer</span></span>
          ${(m.collaborators || []).length > 0 && html`<span class="row tiny muted" style="gap:6px"><${AvatarStack} names=${m.collaborators.map(nameOf)} size="xs" max=${4} />collaborators</span>`}
          ${m.sourceRequestId && html`<button class="facechip" onClick=${() => navigate("/workspace/" + m.sourceRequestId)}><${Icon} name="inbox" size=11 />from ${m.sourceRequestId}</button>`}
        </div>
      </div>
      <div class="pagehead__actions"><${StatusControl} m=${m} viewer=${viewer} /></div>
    </div>

    <div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0"><${Tabs} tabs=${tabsCfg} active=${tab} onChange=${setTab} /></div></div>

    ${tab === "flow" && html`<${WorkflowSpine} id=${m.id} showHeader=${false} />`}
    ${tab === "requester" && linkedRequest && html`<${RequesterPanel} requestId=${linkedRequest.id} viewer=${viewer.id} />`}
    ${tab === "tasks" && html`<div class="card card--pad"><${TasksTab} m=${m} viewer=${viewer} /></div>`}
    ${tab === "documents" && html`<div class="card card--pad"><${DocumentsTab} m=${m} viewer=${viewer} /></div>`}
    ${tab === "related" && html`<${RelatedTab} m=${m} viewer=${viewer} />`}
    ${tab === "timeline" && html`<div class="card card--pad"><${TimelineTab} m=${m} /></div>`}
    ${tab === "outcome" && html`<div class="card card--pad"><${OutcomeTab} m=${m} viewer=${viewer} /></div>`}
    ${tab === "risk" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${RiskPanel} m=${m} viewer=${viewer} />
      <div class="col" style="gap:16px">
        <${PrivilegePanel} m=${m} viewer=${viewer} />
        <div class="card card--pad col" style="gap:10px">
          <span class="strong">People</span>
          ${mayManage ? html`<${Field} label="Responsible lawyer (one owner)">
            <select class="select" value=${m.owner} onChange=${(e) => { const res = setMatterOwner(m.id, e.target.value, viewer.id); res.ok ? toast("Owner: " + nameOf(e.target.value)) : toast(res.error, "error"); }}>
              ${LEGAL_USERS.map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
            </select>
          </${Field}>` : html`<div class="row tiny" style="gap:6px"><${Avatar} name=${nameOf(m.owner)} size="xs" />${nameOf(m.owner)} · owner</div>`}
          <div>
            <div class="tiny muted" style="margin-bottom:6px">Collaborators</div>
            <div class="row wrap" style="gap:5px">
              ${LEGAL_USERS.filter((u) => u.id !== m.owner).map((u) => {
                const on = (m.collaborators || []).includes(u.id);
                return html`<button key=${u.id} class="tagchip" disabled=${!mayManage}
                  style=${on ? "background:var(--brand-soft);border-color:var(--brand);color:var(--brand-600)" : ""}
                  onClick=${() => mayManage && setMatterCollaborators(m.id, on ? (m.collaborators || []).filter((x) => x !== u.id) : [...(m.collaborators || []), u.id], viewer.id)}>${u.name.split(" ")[0]}</button>`;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>`}

    ${tab === "overview" && html`<div class="grid" style="grid-template-columns:1.1fr .9fr;gap:16px;align-items:start">
      <div class="col" style="gap:16px">
        ${(m.businessContext || m.description) && html`<div class="card card--pad col" style="gap:8px">
          <span class="strong">Business context</span>
          <div class="spine__desc">${m.businessContext || m.description}</div>
        </div>`}
        <div class="card card--pad">
          <span class="strong" style="display:block;margin-bottom:10px">Matter record</span>
          <div class="sheet__facts">
            ${facts.map(([l, v]) => html`<div key=${l} class="sheet__fact"><div class="sheet__fl">${l}</div><div class="sheet__fv">
              ${l === "Counterparty" && m.counterpartyId
                ? html`<button class="tagchip" onClick=${() => setCpView(m.counterpartyId)}><${Icon} name="building" size=11 />${v}</button>`
                : v}
            </div></div>`)}
          </div>
        </div>
        ${(m.relatedMatters || []).length > 0 && html`<div class="card card--pad col" style="gap:8px">
          <span class="strong">Related matters</span>
          ${m.relatedMatters.slice(0, 4).map((r) => html`<button key=${r.id} class="facechip" style="align-self:flex-start" onClick=${() => navigate("/matters/" + r.id)}><${Icon} name="folder" size=11 />${r.id} · ${r.relation}</button>`)}
        </div>`}
      </div>
      <div class="col" style="gap:16px">
        <div class="card card--pad col" style="gap:8px">
          <div class="row"><span class="strong">Open tasks</span><div class="spacer"></div><${Pill} tone=${openTasks.length ? "blue" : "gray"}>${openTasks.length}</${Pill}></div>
          ${openTasks.slice(0, 4).map((t) => html`<div key=${t.id} class="row tiny" style="gap:8px">
            <${Icon} name="checksquare" size=13 style=${{ color: "var(--text-3)", flex: "none" }} />
            <span style="flex:1" class="ellipsis">${t.name}</span>
            <span class=${cx("tiny", t.due && new Date(t.due) < Date.now() ? "strong" : "muted")} style=${t.due && new Date(t.due) < Date.now() ? "color:var(--danger)" : ""}>${t.due ? fmt.dateShort(t.due) : ""}</span>
          </div>`)}
          ${openTasks.length === 0 && html`<span class="tiny muted">Nothing open.</span>`}
          <button class="tiny" style="color:var(--brand);font-weight:600;text-align:left" onClick=${() => setTab("tasks")}>All tasks →</button>
        </div>
        <div class="card card--pad col" style="gap:8px">
          <span class="strong">Recent activity</span>
          ${[...(m.audit || [])].slice(-4).reverse().map((e, i) => html`<div key=${i} class="tiny" style="line-height:1.4">
            <b>${e.kind === "status" ? `${e.from} → ${e.to}` : e.detail || e.kind}</b>
            <span class="muted"> · ${e.by ? nameOf(e.by).split(" ")[0] : "System"} · ${e.at ? fmt.rel(e.at) : ""}</span>
          </div>`)}
          <button class="tiny" style="color:var(--brand);font-weight:600;text-align:left" onClick=${() => setTab("timeline")}>Full timeline →</button>
        </div>
        <${RiskPanel} m=${m} viewer=${viewer} />
      </div>
    </div>`}

    ${cpView && html`<${CounterpartyDrawer} cpId=${cpView} onClose=${() => setCpView(null)} viewer=${viewer} />`}
  </div>`;
}

export default function Matters({ id }) {
  return id ? html`<${MatterDetail} id=${id} key=${id} />` : html`<${MatterList} />`;
}
