// The generic module surface — one page renders any of the thirteen org-architecture
// modules from the registry spec (src/modules.js). Sprint 7 makes it fully
// operational: two-column detail (work + rail), two-way comments, document
// attachments, owner reassignment, source-group inputs for the owning
// department (§8.2), direct full-field logging for legal staff, stage pipeline
// strips, and module quick actions. Row-level visibility (§14) gates everything.
import { html, cx, fmt, useState, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Field, Input, Textarea, Modal, Empty, Avatar, Toggle } from "../ui.js";
import { navigate } from "../router.js";
import { USERS, byId, entityName, COMPANIES } from "../data.js";
import { teamShort, teamTone, masterList } from "../org.js";
import { moduleByKey, subTypesOf, fieldOptions, workflowOf, slaFor, riskGateMissing, filingStatusOf } from "../modules.js";
import { tatV2, tatV2Label, urgencyOf } from "../tat2.js";
import {
  useCollection, useMasterData, modRequestById, personName, getCollection,
  advanceStage, startHold, endHold, updateModFields, addHearing, addModCost,
  generateAutoResponse, raiseModuleRequest, postModComment, addModAttachment,
  removeModAttachment, reassignOwner, setModPriority, setModDriveLink, logModVersion,
  markResolutionUploaded, scheduleNextInspection, addCompanyEntity,
  markFiled, useFilingSchedule, upsertFilingScheduleRow,
} from "../store.js";
import { useActiveUser, visibilityOf, canBrowseModule, stripInternal, canEditGroup, teamMembers } from "../rbac.js";
import { RankBars } from "../execviz.js";
import { toast } from "../toast.js";

export function TatChip({ t }) {
  if (!t) return null;
  return html`<span class=${cx("tatchip", "tatchip--" + t.status.toLowerCase())}>
    <span class="tatchip__dot"></span>${tatV2Label(t)}
  </span>`;
}

const fmtSize = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1000)) + " KB");

/* ---------------- field rendering ---------------- */
function fieldValue(f, rec) {
  const v = (rec.fields || {})[f.key];
  if (v == null || v === "") return "—";
  if (f.type === "entity") return entityName(v) || v;
  if (f.type === "user") return personName(v);
  if (f.type === "date") return fmt.date(v);
  if (f.type === "toggle") return v ? "Yes" : "No";
  if (f.type === "money") return fmt.moneyFull(v, (rec.fields || {}).currency === "USD" ? "USD" : (rec.fields || {}).currency === "SAR" ? "SAR" : "PKR");
  if (f.type === "record") {
    // Cross-module link (e.g. a filing's underlying resolution) — clickable.
    const linked = (getCollection("modRequests") || []).find((r) => r.id === v);
    return html`<a class="reclink" onClick=${(e) => { e.stopPropagation(); navigate("/m/" + (linked ? linked.moduleKey : f.recordModule) + "/" + v); }}>
      <${Icon} name="link" size=12 /> ${v}${linked ? " — " + linked.title : ""}
    </a>`;
  }
  return String(v);
}

/* Registry quick-add — the Section 2 registry grows from inside the flow. */
export function EntityQuickAdd({ onCreated, viewer }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", type: "Counterparty", jurisdiction: "Pakistan", roles: [] });
  const ROLES = ["Lessor", "Lender", "Service Provider", "Developer", "Vendor/Payee", "External Counsel", "JV Partner", "Media Partner"];
  return html`<${Fragment}>
    <button type="button" class="entityadd" title="Add to the Counterparty / Entity Registry" onClick=${() => setOpen(true)}>
      <${Icon} name="plus" size=13 />
    </button>
    ${open && html`<${Modal} title="Add to the Entity Registry" icon="building" width=${520} onClose=${() => setOpen(false)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setOpen(false)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          const r = addCompanyEntity(f, viewer && viewer.id);
          if (r.ok) {
            toast(r.existed ? f.name + " already in the registry — selected" : f.name + " added to the registry");
            setOpen(false);
            onCreated && onCreated(r.id);
            setF({ name: "", type: "Counterparty", jurisdiction: "Pakistan", roles: [] });
          } else toast(r.error, "error");
        }}>Add & select</${Btn}>
      </${Fragment}>`}>
      <p class="tiny muted" style="margin-top:0">Registered once, selected everywhere — never re-typed (FRD Section 2).</p>
      <${Field} label="Name *"><${Input} value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} /></${Field}>
      <div class="modeditgrid">
        <${Field} label="Type">
          <select class="input" value=${f.type} onChange=${(e) => setF({ ...f, type: e.target.value })}>
            <option>Counterparty</option><option>Vendor</option>
          </select>
        </${Field}>
        <${Field} label="Jurisdiction">
          <select class="input" value=${f.jurisdiction} onChange=${(e) => setF({ ...f, jurisdiction: e.target.value })}>
            ${["Pakistan", "Saudi Arabia", "UAE", "United Kingdom", "United States", "Singapore"].map((j) => html`<option key=${j}>${j}</option>`)}
          </select>
        </${Field}>
      </div>
      <${Field} label="Registry roles">
        <div class="rolechips">
          ${ROLES.map((r) => html`<button type="button" key=${r} class=${cx("rolechip", f.roles.includes(r) && "active")}
            onClick=${() => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] })}>${r}</button>`)}
        </div>
      </${Field}>
    </${Modal}>`}
  </${Fragment}>`;
}

function FieldInput({ f, value, onChange, md, rec, viewer }) {
  if (f.type === "select") {
    const opts = fieldOptions(f, md, rec);
    return html`<select class="input" value=${value || ""} onChange=${(e) => onChange(e.target.value)}>
      <option value="">—</option>
      ${opts.map((o) => html`<option key=${o} value=${o}>${o}</option>`)}
    </select>`;
  }
  if (f.type === "entity") {
    const companies = getCollection("companies") || COMPANIES;
    return html`<div class="row" style="gap:6px">
      <select class="input" style="flex:1" value=${value || ""} onChange=${(e) => onChange(e.target.value)}>
        <option value="">—</option>
        ${companies.map((c) => html`<option key=${c.id} value=${c.id}>${c.name} (${c.type})</option>`)}
      </select>
      <${EntityQuickAdd} viewer=${viewer} onCreated=${(id) => onChange(id)} />
    </div>`;
  }
  if (f.type === "user") {
    return html`<select class="input" value=${value || ""} onChange=${(e) => onChange(e.target.value)}>
      <option value="">—</option>
      ${USERS.filter((u) => u.dept === "Legal").map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
    </select>`;
  }
  if (f.type === "record") {
    const recs = (getCollection("modRequests") || []).filter((r) => r.moduleKey === f.recordModule);
    return html`<select class="input" value=${value || ""} onChange=${(e) => onChange(e.target.value)}>
      <option value="">— none —</option>
      ${recs.map((r) => html`<option key=${r.id} value=${r.id}>${r.id} — ${r.title}</option>`)}
    </select>`;
  }
  if (f.type === "toggle") return html`<${Toggle} on=${!!value} onChange=${(v) => onChange(v)} />`;
  if (f.type === "textarea") return html`<${Textarea} rows=3 value=${value || ""} onInput=${(e) => onChange(e.target.value)} />`;
  if (f.type === "date") return html`<${Input} type="date" value=${value ? String(value).slice(0, 10) : ""} onInput=${(e) => onChange(e.target.value)} />`;
  if (f.type === "number" || f.type === "money") return html`<${Input} type="number" value=${value == null ? "" : value} onInput=${(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />`;
  return html`<${Input} value=${value || ""} onInput=${(e) => onChange(e.target.value)} />`;
}

/* ---------------- column cells ---------------- */
function cellFor(col, rec, def) {
  const f = rec.fields || {};
  if (col === "subType") return rec.subType || "—";
  if (col === "entityId") return rec.entityId ? entityName(rec.entityId) : "—";
  if (col === "counterpartyId") return f.counterpartyId ? entityName(f.counterpartyId) : "—";
  if (col === "templateType") return f.templateType ? f.templateType.replace(" Template", "") : "—";
  if (col === "requestingDept") return rec.requestingDept || "—";
  if (col === "owner") return html`<span class="row" style="gap:7px"><${Avatar} name=${personName(rec.owner)} size="xs" />${personName(rec.owner)}</span>`;
  if (col === "stage") return html`<${Pill} tone=${rec.status === "Closed" ? "gray" : "blue"}>${rec.stage}</${Pill}>`;
  if (col === "tat") return html`<${TatChip} t=${tatV2(def, rec)} />`;
  if (col === "title") return rec.title;
  if (col === "urgencyCol") return f.urgency ? html`<${Pill} tone=${f.urgency === "Urgent" ? "red" : "gray"}>${f.urgency}</${Pill}>` : "—";
  if (col === "authorityCol") return f.authority || "—";
  if (col === "renewalDueCol") return f.renewalDue ? fmt.until(f.renewalDue) : "—";
  if (col === "nextHearingCol") {
    const next = nextHearing(rec);
    return next ? fmt.until(next) : "—";
  }
  if (col === "recoveredCol") return f.totalRecovered != null ? fmt.moneyFull(f.totalRecovered, "PKR") : "—";
  if (col === "costYoYCol") {
    if (f.costCurrentYear == null) return "—";
    const arrow = f.costReduced ? "↓" : (f.costForthcomingYear > f.costCurrentYear ? "↑" : "→");
    return `${fmt.money(f.costCurrentYear, "PKR")} ${arrow} ${fmt.money(f.costForthcomingYear || f.costCurrentYear, "PKR")}`;
  }
  if (col === "filingDueCol") return f.dueDate ? html`<span>${fmt.dateShort(f.dueDate)} <span class="tiny muted">${fmt.until(f.dueDate)}</span></span>` : "—";
  if (col === "filingStatusCol") {
    const s = filingStatusOf(rec);
    return html`<${Pill} tone=${s.tone}>${s.key}</${Pill}>`;
  }
  if (col.startsWith("fields.")) {
    const key = col.slice(7);
    const fd = (def.fields || []).find((x) => x.key === key);
    return fd ? fieldValue(fd, rec) : (f[key] == null ? "—" : String(f[key]));
  }
  return "—";
}
function headFor(col, def) {
  const map = {
    subType: def.subTypeLabel || "Type", entityId: "Entity", counterpartyId: "Counterparty",
    templateType: "Template", requestingDept: "Requesting Dept", owner: "Owner", stage: "Stage",
    tat: "TAT", title: "Matter", urgencyCol: "Urgency", authorityCol: "Authority",
    renewalDueCol: "Renewal Due", nextHearingCol: "Next Hearing", recoveredCol: "Recovered",
    costYoYCol: "Cost YoY", filingDueCol: "Statutory Due", filingStatusCol: "Filing Status",
  };
  if (map[col]) return map[col];
  if (col.startsWith("fields.")) {
    const fd = (def.fields || []).find((x) => x.key === col.slice(7));
    return fd ? fd.label.replace(/ \(PKR\)/, "") : col.slice(7);
  }
  return col;
}
function nextHearing(rec) {
  const dates = (rec.hearings || []).map((h) => h.nextDate).filter(Boolean).sort();
  const future = dates.filter((x) => new Date(x) >= new Date(Date.now() - 86400000));
  return future[0] || dates[dates.length - 1] || null;
}

/* ---------------- access panel ---------------- */
function AccessDenied({ def, viewer }) {
  return html`<div class="page">
    <div class="access-card">
      <div class="access-card__ico"><${Icon} name="lock" size=22 /></div>
      <h3>${def ? def.label : "This module"} is ${def ? teamShort(def.team) : "another team"}'s queue</h3>
      <p>You are viewing as <b>${viewer.name}</b> (${viewer.role}). Row-level security keeps each Legal
      team's queue private: you can always <b>raise</b> a request to this team, and you can track your
      own requests under My Requests — but browsing another team's data needs that team's membership.</p>
      <div class="row" style="gap:8px;justify-content:center">
        <${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise" + (def ? "/" + def.key : ""))}>Raise a request to this team</${Btn}>
        <${Btn} icon="user" onClick=${() => navigate("/raise")}>My requests</${Btn}>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   REGISTER
   ============================================================ */
function ResolutionsReport({ rows }) {
  // Section 6.4 — resolutions by requesting department, filterable by urgency.
  const [urgency, setUrgency] = useState("All");
  const [days, setDays] = useState(90);
  const cutoff = Date.now() - days * 86400000;
  const inWindow = rows.filter((r) => new Date(r.dateRaised) >= cutoff)
    .filter((r) => urgency === "All" || (r.fields || {}).urgency === urgency);
  const byDept = {};
  inWindow.forEach((r) => { byDept[r.requestingDept] = (byDept[r.requestingDept] || 0) + 1; });
  const entries = Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  return html`<div class="card modreport">
    <div class="row" style="gap:10px;flex-wrap:wrap">
      <div>
        <div class="strong" style="font-size:13.5px">Resolutions by requesting department</div>
        <div class="tiny muted">Who generates the volume — last ${days} days${urgency !== "All" ? ", " + urgency.toLowerCase() + " only" : ""}.</div>
      </div>
      <span class="spacer"></span>
      <select class="input input--sm" value=${urgency} onChange=${(e) => setUrgency(e.target.value)}>
        ${["All", "Urgent", "Normal"].map((o) => html`<option key=${o}>${o}</option>`)}
      </select>
      <select class="input input--sm" value=${days} onChange=${(e) => setDays(Number(e.target.value))}>
        <option value=30>30 days</option><option value=90>90 days</option><option value=365>12 months</option>
      </select>
    </div>
    ${entries.length
      ? html`<${RankBars} data=${entries} format=${(v) => v + (v === 1 ? " request" : " requests")} />`
      : html`<div class="tiny muted" style="padding:14px 0">No resolutions in this window.</div>`}
  </div>`;
}

/* ---------------- Filing Module 8.3 — Filings by Entity ----------------
   Every group entity has its own set of statutory filings; this board shows
   all forms due / overdue / filed for each entity in one place, so nothing is
   missed across the group. Calendar entries that have not generated a record
   yet appear as ghost chips. Click an entity to filter the register. */
function FilingsByEntity({ rows, active, onPick, viewer, def }) {
  const schedule = useFilingSchedule();
  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState({ entityId: "", formType: "Form A — Annual Return", nextDue: "", authorizedPerson: "" });
  const md = useMasterData();

  const entities = [...new Set([
    ...rows.map((r) => r.entityId).filter(Boolean),
    ...schedule.filter((s) => s.active !== false).map((s) => s.entityId),
  ])];
  const weight = { Overdue: 0, "Due Soon": 1, "Not Due": 2, Filed: 3 };

  const perEntity = entities.map((eid) => {
    const recs = rows.filter((r) => r.entityId === eid)
      .map((r) => ({ r, s: filingStatusOf(r) }))
      .sort((a, b) => weight[a.s.key] - weight[b.s.key]);
    // Calendar rows with no live record yet (outside the 30-day window).
    const upcoming = schedule.filter((s) => s.active !== false && s.entityId === eid &&
      !rows.some((r) => r.subType === s.formType && String((r.fields || {}).dueDate || "").slice(0, 10) === String(s.nextDue).slice(0, 10)));
    const overdue = recs.filter((x) => x.s.key === "Overdue").length;
    const dueSoon = recs.filter((x) => x.s.key === "Due Soon").length;
    return { eid, recs, upcoming, overdue, dueSoon };
  }).sort((a, b) => (b.overdue - a.overdue) || (b.dueSoon - a.dueSoon));

  const isCompliance = viewer.rbac === "head" || viewer.legalTeam === def.team;

  return html`<div class="card filingsboard">
    <div class="row" style="margin-bottom:4px;flex-wrap:wrap">
      <div>
        <div class="strong" style="font-size:13.5px">Filings by entity</div>
        <div class="tiny muted">All forms due, overdue or filed per entity — nothing missed across the group (8.3). Click an entity to filter.</div>
      </div>
      <span class="spacer"></span>
      ${isCompliance && html`<${Btn} size="sm" icon="calendar" onClick=${() => setAdding(true)}>Calendar entry</${Btn}>`}
    </div>
    ${perEntity.map(({ eid, recs, upcoming, overdue, dueSoon }) => html`<div key=${eid} class=${cx("fbe", active === eid && "fbe--active")}>
      <button class="fbe__entity" onClick=${() => onPick(eid)}>
        <${Icon} name="building" size=13 />
        <span>${entityName(eid)}</span>
        ${overdue > 0 && html`<${Pill} tone="red">${overdue} overdue</${Pill}>`}
        ${!overdue && dueSoon > 0 && html`<${Pill} tone="amber">${dueSoon} due soon</${Pill}>`}
        ${!overdue && !dueSoon && html`<${Pill} tone="green">on track</${Pill}>`}
      </button>
      <div class="fbe__chips">
        ${recs.map(({ r, s }) => html`<button key=${r.id} class=${"fbechip fbechip--" + s.tone}
          title=${r.title + " — " + s.detail} onClick=${() => navigate("/m/filings/" + r.id)}>
          <span class="fbechip__dot"></span>${(r.subType || "").split(" — ")[0]} · ${s.key === "Filed" ? "Filed" : s.detail}
        </button>`)}
        ${upcoming.map((s) => html`<span key=${s.formType + s.nextDue} class="fbechip fbechip--ghost" title=${"On the calendar — the record generates 30 days before " + fmt.date(s.nextDue)}>
          ${s.formType.split(" — ")[0]} · due ${fmt.until(s.nextDue)}
        </span>`)}
      </div>
    </div>`)}
    ${adding && html`<${Modal} title="Filing calendar entry" icon="calendar" width=${560} onClose=${() => setAdding(false)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setAdding(false)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          if (!row.entityId || !row.nextDue) { toast("Entity and due date are required", "error"); return; }
          upsertFilingScheduleRow({ ...row, frequency: "Annual", nextDue: new Date(row.nextDue).toISOString() }, viewer.id);
          toast("Calendar updated — the record will generate 30 days before the due date");
          setAdding(false);
        }}>Save entry</${Btn}>
      </${Fragment}>`}>
      <p class="tiny muted" style="margin-top:0">Maintained by Compliance. The system generates the filing record automatically
      once the due date comes within 30 days (Filing Module 8.2) — a date already inside the window generates immediately.</p>
      <div class="modeditgrid">
        <${Field} label="Entity *">
          <select class="input" value=${row.entityId} onChange=${(e) => setRow({ ...row, entityId: e.target.value })}>
            <option value="">Select…</option>
            ${(getCollection("companies") || COMPANIES).filter((c) => c.type === "Group Entity" && c.jur === "PK").map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>
        </${Field}>
        <${Field} label="SECP form">
          <select class="input" value=${row.formType} onChange=${(e) => setRow({ ...row, formType: e.target.value })}>
            ${masterList(md, "secpFormTypes").map((s) => html`<option key=${s}>${s}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Next statutory due date *"><${Input} type="date" value=${row.nextDue} onInput=${(e) => setRow({ ...row, nextDue: e.target.value })} /></${Field}>
        <${Field} label="Authorized person to file"><${Input} value=${row.authorizedPerson} onInput=${(e) => setRow({ ...row, authorizedPerson: e.target.value })} /></${Field}>
      </div>
    </${Modal}>`}
  </div>`;
}

/* The stage pipeline strip — where the work sits right now; click to filter. */
function StageStrip({ def, enriched, active, onPick }) {
  const path = [...new Set([...def.workflow, ...(def.renewalWorkflow || [])])];
  const open = enriched.filter((x) => x.t.status !== "Closed");
  const byStage = Object.fromEntries(path.map((s) => [s, open.filter((x) => x.r.stage === s)]));
  return html`<div class="stagestrip">
    ${def.workflow.map((s) => {
      const items = byStage[s] || [];
      const overdue = items.some((x) => x.t.status === "Overdue");
      return html`<button key=${s} class=${cx("stagestrip__cell", active === s && "active", !items.length && "empty")}
        onClick=${() => onPick(active === s ? "" : s)} title=${s}>
        <span class=${cx("stagestrip__n", overdue && "overdue")}>${items.length}</span>
        <span class="stagestrip__label">${s}</span>
      </button>`;
    })}
  </div>`;
}

/* Direct create — legal staff log a record with the FULL field set (a notice
   received, an inspection, a case), not just the requester-facing subset. */
function DirectCreate({ def, md, viewer, onClose }) {
  const [title, setTitle] = useState("");
  const [subType, setSubType] = useState("");
  const [dept, setDept] = useState("");
  const [entityId, setEntityId] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [driveLink, setDriveLink] = useState("");
  const [fields, setFields] = useState({});
  const [err, setErr] = useState("");
  const setF = (k, v) => setFields((d) => ({ ...d, [k]: v }));

  const groups = [];
  const seen = new Set();
  for (const f of def.fields) {
    const g = f.group || "Details";
    if (!seen.has(g)) { seen.add(g); groups.push(g); }
  }

  const create = () => {
    if (!title.trim()) { setErr("a short subject is required"); return; }
    const res = raiseModuleRequest({
      moduleKey: def.key, title, subType: subType || null,
      requestingDept: dept || "Legal",
      requestedBy: { name: viewer.name, designation: viewer.role, contact: viewer.email },
      requestedById: viewer.id,
      entityId: entityId || null, priority, driveLink: driveLink || null,
      owner: owner || undefined,
      fields,
    });
    if (!res.ok) { setErr((res.errors || []).join(" · ")); return; }
    toast(`${res.id} logged — assigned to ${personName(res.record.owner)}`);
    onClose();
    navigate("/m/" + def.key + "/" + res.id);
  };

  return html`<${Modal} title=${"Log a " + def.noun + " — full record"} icon=${def.icon} width=${780} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" onClick=${create}>Create ${def.noun}</${Btn}>
    </${Fragment}>`}>
    <div class="modeditgrid">
      <${Field} label="Short subject *"><${Input} value=${title} onInput=${(e) => setTitle(e.target.value)} /></${Field}>
      <${Field} label=${def.subTypeLabel}>
        <select class="input" value=${subType} onChange=${(e) => setSubType(e.target.value)}>
          <option value="">Select…</option>
          ${subTypesOf(def, md).map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Requesting department">
        <select class="input" value=${dept} onChange=${(e) => setDept(e.target.value)}>
          <option value="">Legal (logged internally)</option>
          ${masterList(md, "requestingDepartments").map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Linked entity">
        <div class="row" style="gap:6px">
          <select class="input" style="flex:1" value=${entityId} onChange=${(e) => setEntityId(e.target.value)}>
            <option value="">—</option>
            ${(getCollection("companies") || COMPANIES).filter((c) => c.type === "Group Entity").map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>
        </div>
      </${Field}>
      <${Field} label="Owner">
        <select class="input" value=${owner} onChange=${(e) => setOwner(e.target.value)}>
          <option value="">Auto-assign (least loaded)</option>
          ${teamMembers(def.team).map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Priority">
        <select class="input" value=${priority} onChange=${(e) => setPriority(e.target.value)}>
          <option>Normal</option><option>High</option>
        </select>
      </${Field}>
      <${Field} label="Google Drive reference"><${Input} placeholder="https://drive.google.com/…" value=${driveLink} onInput=${(e) => setDriveLink(e.target.value)} /></${Field}>
    </div>
    ${groups.map((g) => {
      const fs = def.fields.filter((f) => (f.group || "Details") === g)
        .filter((f) => !f.showIf || f.showIf(fields, { subType, fields }));
      if (!fs.length) return null;
      return html`<div key=${g}>
        <div class="raisesep">${g}</div>
        <div class="modeditgrid">
          ${fs.map((f) => html`<${Field} key=${f.key} label=${f.label} hint=${f.hint}>
            <${FieldInput} f=${f} md=${md} rec=${{ subType, fields }} viewer=${viewer} value=${fields[f.key]} onChange=${(v) => setF(f.key, v)} />
          </${Field}>`)}
        </div>
      </div>`;
    })}
    ${err && html`<div class="modwarn"><${Icon} name="alertTriangle" size=14 /> ${err}</div>`}
  </${Modal}>`;
}

function Register({ def, rows, md, viewer }) {
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("");
  const [stage, setStage] = useState("");
  const [tstat, setTstat] = useState("");
  const [dept, setDept] = useState("");
  const [ent, setEnt] = useState("");
  const [creating, setCreating] = useState(false);

  const enriched = useMemo(() => rows.map((r) => ({ r, t: tatV2(def, r) })), [rows]);
  const stages = [...new Set([...def.workflow, ...(def.renewalWorkflow || []), ...Object.values(def.flows || {}).flat()])];

  const filtered = enriched.filter(({ r, t }) => {
    if (q && !(r.title + " " + r.id + " " + JSON.stringify(r.fields || {})).toLowerCase().includes(q.toLowerCase())) return false;
    if (sub && r.subType !== sub) return false;
    if (stage && r.stage !== stage) return false;
    if (tstat && t.status !== tstat) return false;
    if (dept && r.requestingDept !== dept) return false;
    if (ent && r.entityId !== ent) return false;
    return true;
  }).sort((a, b) => urgencyOf(b.t) - urgencyOf(a.t));

  const open = enriched.filter((x) => x.t.status !== "Closed");
  // Filings are measured against the statutory calendar, not just the TAT clock.
  const kpis = def.report === "byEntity"
    ? [
        { label: "Open filings", n: open.length, tone: "blue" },
        { label: "Overdue vs statute", n: rows.filter((r) => filingStatusOf(r).key === "Overdue").length, tone: "red" },
        { label: "Due in 30 days", n: rows.filter((r) => filingStatusOf(r).key === "Due Soon").length, tone: "amber" },
        { label: "Filed", n: rows.filter((r) => filingStatusOf(r).key === "Filed").length, tone: "gray" },
      ]
    : [
        { label: "Open", n: open.length, tone: "blue" },
        { label: "Overdue", n: open.filter((x) => x.t.status === "Overdue").length, tone: "red" },
        { label: "Paused with a dept", n: open.filter((x) => x.t.status === "Paused").length, tone: "amber" },
        { label: "Closed", n: enriched.length - open.length, tone: "gray" },
      ];

  return html`<div class="page">
    <div class="page__head">
      <div>
        <div class="row" style="gap:8px">
          <h2 class="page__title">${def.label}</h2>
          <${Pill} tone=${teamTone(def.team)}>${teamShort(def.team)}</${Pill}>
        </div>
        <div class="page__sub">${def.tatNote || def.cadenceNote || `${def.workflow.length}-stage workflow · TAT net of intra-dept holds`}</div>
      </div>
      <${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>New ${def.noun}</${Btn}>
    </div>

    <div class="modkpis">
      ${kpis.map((k) => html`<div key=${k.label} class=${"modkpi modkpi--" + k.tone}>
        <div class="modkpi__n">${k.n}</div><div class="modkpi__l">${k.label}</div>
      </div>`)}
    </div>

    ${def.report === "byDepartment" && html`<${ResolutionsReport} rows=${rows} />`}
    ${def.report === "byEntity" && html`<${FilingsByEntity} rows=${rows} active=${ent} onPick=${(id) => setEnt(ent === id ? "" : id)} viewer=${viewer} def=${def} />`}

    <div class="card" style="padding:0">
      <${StageStrip} def=${def} enriched=${enriched} active=${stage} onPick=${setStage} />
      <div class="modtoolbar">
        <div class="modtoolbar__search">
          <${Icon} name="search" size=15 />
          <input placeholder="Search ${def.label.toLowerCase()}…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        </div>
        <select class="input input--sm" value=${sub} onChange=${(e) => setSub(e.target.value)}>
          <option value="">${def.subTypeLabel}: all</option>
          ${subTypesOf(def, md).map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${stage} onChange=${(e) => setStage(e.target.value)}>
          <option value="">Stage: all</option>
          ${stages.map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${tstat} onChange=${(e) => setTstat(e.target.value)}>
          <option value="">TAT: all</option>
          ${["Running", "Paused", "Overdue", "Closed"].map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${dept} onChange=${(e) => setDept(e.target.value)}>
          <option value="">Dept: all</option>
          ${masterList(md, "requestingDepartments").map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
      </div>
      <div class="tablewrap">
        <table class="table">
          <thead><tr>
            <th>Ref</th>
            ${def.columns.map((c) => html`<th key=${c}>${headFor(c, def)}</th>`)}
          </tr></thead>
          <tbody>
            ${filtered.map(({ r }) => html`<tr key=${r.id} class="clickable" onClick=${() => navigate("/m/" + def.key + "/" + r.id)}>
              <td class="mono tiny">${r.id}</td>
              ${def.columns.map((c) => html`<td key=${c}>${cellFor(c, r, def)}</td>`)}
            </tr>`)}
          </tbody>
        </table>
        ${filtered.length === 0 && html`<${Empty} icon="inbox" title="Nothing matches" text="Adjust the filters, or log the first one." />`}
      </div>
    </div>
    ${creating && html`<${DirectCreate} def=${def} md=${md} viewer=${viewer} onClose=${() => setCreating(false)} />`}
  </div>`;
}

/* ============================================================
   DETAIL
   ============================================================ */
function WorkflowRail({ def, rec, viewer, statusOnly }) {
  const path = workflowOf(def, rec);
  const idx = path.indexOf(rec.stage);
  const t = tatV2(def, rec);
  const onHold = !!t.hold;
  const next = idx >= 0 && idx < path.length - 1 ? path[idx + 1] : null;
  const gateMissing = next ? riskGateMissing(def, rec, next) : [];
  const stampFor = (s) => {
    const hit = (rec.stageLog || []).filter((x) => x.stage === s).pop();
    return hit ? hit.at : null;
  };
  const [err, setErr] = useState("");

  return html`<div class="card">
    <div class="row" style="gap:8px;margin-bottom:12px">
      <span class="strong" style="font-size:13.5px">Workflow${rec.flow === "renewal" ? " — renewal path" : ""}</span>
      <span class="spacer"></span>
      ${!statusOnly && rec.status !== "Closed" && html`<${Btn} size="sm" variant="primary" icon="arrowRight"
        onClick=${() => {
          const r = advanceStage(rec.id, viewer.id);
          setErr(r.ok ? "" : r.error);
          if (r.ok) toast(r.closed ? rec.id + " closed" : "Moved to " + r.stage);
        }}>
        ${next ? "Move to " + next : "Close"}
      </${Btn}>`}
    </div>
    ${err && html`<div class="modwarn"><${Icon} name="alertTriangle" size=14 /> ${err}</div>`}
    ${!err && !statusOnly && gateMissing.length > 0 && html`<div class="modwarn modwarn--soft">
      <${Icon} name="shield" size=14 /> Risk Assessment gate: ${gateMissing.length} field${gateMissing.length > 1 ? "s" : ""} required before ${next}.
    </div>`}
    ${onHold && html`<div class="modhold-banner">
      <${Icon} name="clock" size=14 />
      TAT paused — with <b>${t.hold.dept}</b> (${t.hold.reason}) since ${fmt.dateShort(t.hold.start)}. The clock resumes when the file is received back.
      ${!statusOnly && html`<${Btn} size="sm" onClick=${() => { endHold(rec.id, viewer.id); toast("Received back from " + t.hold.dept + " — clock running"); }}>Receive back</${Btn}>`}
    </div>`}
    <div class="modrail">
      ${path.map((s, i) => {
        const at = stampFor(s);
        const sla = slaFor(def, rec, s);
        return html`<div key=${s} class=${cx("modrail__step", i < idx && "done", i === idx && (rec.status === "Closed" ? "done" : "current"))}>
          <div class="modrail__dot">${i < idx || rec.status === "Closed" ? html`<${Icon} name="check" size=11 />` : i + 1}</div>
          <div class="modrail__label">${s}</div>
          <div class="modrail__meta">${at ? fmt.dateShort(at) : sla != null ? `SLA ${sla}d` : ""}</div>
        </div>`;
      })}
    </div>
  </div>`;
}

function TatBreakdown({ def, rec }) {
  const t = tatV2(def, rec);
  return html`<div class="card">
    <div class="strong" style="font-size:13.5px;margin-bottom:10px">Turnaround — actual legal working time</div>
    <div class="tatgrid tatgrid--rail">
      <div><div class="tatgrid__n">${t.gross}d</div><div class="tatgrid__l">Gross since assignment</div></div>
      <div><div class="tatgrid__n" style="color:var(--brand)">− ${t.held}d</div><div class="tatgrid__l">Paused with other depts</div></div>
      <div><div class="tatgrid__n">${t.reported}d</div><div class="tatgrid__l">Reported TAT</div></div>
      <div><div class="tatgrid__n">${t.sla != null ? t.sla + "d" : "—"}</div><div class="tatgrid__l">SLA budget</div></div>
    </div>
    <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
      <${TatChip} t=${t} />
      ${t.stageSla != null && html`<span class="tiny muted">Stage: ${t.stageAge}d of ${t.stageSla}d${t.stageBreached ? " — breached" : ""}</span>`}
      ${t.nearBreach && html`<${Pill} tone="amber">Near breach</${Pill}>`}
    </div>
  </div>`;
}

function HoldsPanel({ rec, md, viewer, statusOnly }) {
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const holds = rec.holds || [];
  const active = holds.find((h) => !h.end);
  return html`<div class="card">
    <div class="row" style="margin-bottom:8px">
      <span class="strong" style="font-size:13.5px">Intra-dept holds</span>
      <span class="spacer"></span>
      ${!statusOnly && !active && rec.status !== "Closed" && html`<${Btn} size="sm" icon="share" onClick=${() => setOpen(true)}>Share with a department</${Btn}>`}
    </div>
    ${holds.length === 0 && html`<div class="tiny muted">Never left legal — the clock has run uninterrupted.</div>`}
    ${holds.map((h) => html`<div key=${h.id} class=${cx("modholdrow", !h.end && "modholdrow--open")}>
      <${Icon} name=${h.end ? "checkcircle" : "clock"} size=15 />
      <div style="flex:1">
        <div style="font-size:13px"><b>${h.dept}</b> — ${h.reason}</div>
        <div class="tiny muted">Sent by ${personName(h.sender)} · ${fmt.dateShort(h.start)} ${h.end ? "→ " + fmt.dateShort(h.end) : "→ still out"}</div>
      </div>
      ${!h.end && html`<${Pill} tone="blue">Clock paused</${Pill}>`}
    </div>`)}
    ${open && html`<${Modal} title="Share with another department" icon="share" onClose=${() => setOpen(false)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setOpen(false)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          const r = startHold(rec.id, { dept, reason }, viewer.id);
          if (r.ok) { setOpen(false); setDept(""); setReason(""); setErr(""); toast("TAT paused — with " + dept, "info", "clock"); } else setErr(r.error);
        }}>Pause TAT & send</${Btn}>
      </${Fragment}>`}>
      <p class="tiny muted" style="margin-top:0">The TAT clock pauses while the file sits with them, and the hold is recorded
      against a structured reason — so a department that consistently causes one kind of delay shows up in the data.</p>
      <${Field} label="Department">
        <select class="input" value=${dept} onChange=${(e) => setDept(e.target.value)}>
          <option value="">Select…</option>
          ${masterList(md, "requestingDepartments").map((o) => html`<option key=${o}>${o}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Hold reason (standard list)">
        <select class="input" value=${reason} onChange=${(e) => setReason(e.target.value)}>
          <option value="">Select…</option>
          ${masterList(md, "holdReasons").map((o) => html`<option key=${o}>${o}</option>`)}
        </select>
      </${Field}>
      ${err && html`<div class="modwarn">${err}</div>`}
    </${Modal}>`}
  </div>`;
}

/* People & ownership — the rail card that makes the record actionable. */
function PeoplePanel({ def, rec, viewer, statusOnly }) {
  const canManage = !statusOnly && (viewer.rbac === "lead" || viewer.rbac === "head");
  const [editDrive, setEditDrive] = useState(false);
  const [drive, setDrive] = useState(rec.driveLink || "");
  return html`<div class="card modpeople">
    <div class="strong" style="font-size:13.5px;margin-bottom:10px">People & routing</div>
    <div class="modpeople__row">
      <${Avatar} name=${personName(rec.owner)} size="sm" />
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${personName(rec.owner)}</div>
        <div class="tiny muted">Current owner</div>
      </div>
      ${canManage && html`<select class="input input--sm" value=${rec.owner || ""} title="Reassign"
        onChange=${(e) => {
          const r = reassignOwner(rec.id, e.target.value, viewer.id);
          if (r.ok) toast("Reassigned to " + personName(e.target.value));
        }}>
        ${teamMembers(def.team).map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
      </select>`}
    </div>
    <div class="modpeople__row">
      <${Avatar} name=${rec.requestedBy ? rec.requestedBy.name : personName(rec.requestedById)} size="sm" />
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${rec.requestedBy ? rec.requestedBy.name : personName(rec.requestedById)}</div>
        <div class="tiny muted">${rec.requestedBy ? rec.requestedBy.designation : "Requester"} · ${rec.requestingDept}</div>
      </div>
    </div>
    <div class="modpeople__meta">
      <div><span class="modfield__label">Priority</span>
        ${statusOnly
          ? html`<div class="modfield__value">${rec.priority}</div>`
          : html`<select class="input input--sm" value=${rec.priority} onChange=${(e) => { setModPriority(rec.id, e.target.value, viewer.id); toast("Priority: " + e.target.value, "info", "flag"); }}>
              <option>Normal</option><option>High</option>
            </select>`}
      </div>
      <div><span class="modfield__label">Linked entity</span><div class="modfield__value">${rec.entityId ? entityName(rec.entityId) : "—"}</div></div>
      <div><span class="modfield__label">Date raised</span><div class="modfield__value">${fmt.date(rec.dateRaised)}</div></div>
      <div><span class="modfield__label">Contact</span><div class="modfield__value ellipsis" title=${rec.requestedBy ? rec.requestedBy.contact : ""}>${rec.requestedBy ? rec.requestedBy.contact : "—"}</div></div>
    </div>
    <div class="modpeople__drive">
      ${rec.driveLink
        ? html`<a href=${rec.driveLink} target="_blank" rel="noopener" class="row" style="gap:6px;color:var(--brand-600);font-size:12.5px;font-weight:600">
            <${Icon} name="externalLink" size=14 /> Google Drive folder</a>`
        : html`<span class="tiny muted">No Drive reference</span>`}
      ${!statusOnly && html`<button class="iconbtn" title="Edit Drive link" onClick=${() => setEditDrive(true)}><${Icon} name="edit" size=13 /></button>`}
    </div>
    ${editDrive && html`<${Modal} title="Google Drive reference" icon="link" onClose=${() => setEditDrive(false)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setEditDrive(false)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          const r = setModDriveLink(rec.id, drive, viewer.id);
          if (r.ok) toast(drive.trim() ? "Drive reference saved" : "Drive reference removed", "info", "link");
          setEditDrive(false);
        }}>Save</${Btn}>
      </${Fragment}>`}>
      <${Field} label="Folder or file link" hint="Phase 1 integration — a reference, no data sync.">
        <${Input} value=${drive} onInput=${(e) => setDrive(e.target.value)} />
      </${Field}>
    </${Modal}>`}
  </div>`;
}

/* Attachments — both sides manage documents on the record. */
function AttachmentsPanel({ rec, viewer, statusOnly }) {
  const atts = rec.attachments || [];
  const pick = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.onchange = () => {
      [...(inp.files || [])].forEach((f) => {
        const r = addModAttachment(rec.id, { name: f.name, size: f.size, type: f.type }, viewer.id);
        if (r.ok) toast(f.name + " attached");
      });
    };
    inp.click();
  };
  return html`<div class="card modatts">
    <div class="row" style="margin-bottom:8px">
      <span class="strong" style="font-size:13.5px">Documents</span>
      <span class="spacer"></span>
      <${Btn} size="sm" icon="upload" onClick=${pick}>Attach</${Btn}>
    </div>
    ${atts.length === 0 && html`<div class="tiny muted">Nothing attached yet. Both the team and the requester can attach here.</div>`}
    ${atts.map((a) => html`<div key=${a.id} class="modatt">
      <div class="modatt__ico"><${Icon} name="file" size=14 /></div>
      <div style="flex:1;min-width:0">
        <div class="ellipsis" style="font-size:12.5px;font-weight:600" title=${a.name}>${a.name}</div>
        <div class="tiny muted">${a.size ? fmtSize(a.size) + " · " : ""}${personName(a.by)} · ${fmt.dateShort(a.at)}</div>
      </div>
      ${(!statusOnly || a.by === viewer.id) && html`<button class="iconbtn" title="Remove"
        onClick=${() => { removeModAttachment(rec.id, a.id, viewer.id); toast(a.name + " removed", "info", "trash"); }}>
        <${Icon} name="x" size=13 /></button>`}
    </div>`)}
  </div>`;
}

/* Comments — the two-way conversation on the record; internal notes stay team-side. */
function CommentsPanel({ rec, viewer, statusOnly }) {
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const comments = [...(rec.comments || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const send = () => {
    const r = postModComment(rec.id, { text, internal: statusOnly ? false : internal }, viewer.id);
    if (r.ok) { setText(""); toast(internal && !statusOnly ? "Internal note added" : "Comment posted"); }
  };
  return html`<div class="card modcomments">
    <div class="row" style="margin-bottom:10px">
      <span class="strong" style="font-size:13.5px">Conversation</span>
      <span class="tiny muted">— ${statusOnly ? "replies go straight to the owning lawyer" : "the requester sees everything not marked internal"}</span>
    </div>
    ${comments.length === 0 && html`<div class="tiny muted" style="margin-bottom:10px">No messages yet.</div>`}
    ${comments.map((c) => {
      const u = byId(c.by) || {};
      const mine = c.by === viewer.id;
      return html`<div key=${c.id} class=${cx("modcomment", mine && "modcomment--mine", c.internal && "modcomment--internal")}>
        <${Avatar} name=${personName(c.by)} size="sm" />
        <div class="modcomment__body">
          <div class="row" style="gap:6px">
            <span class="modcomment__who">${personName(c.by)}</span>
            ${c.internal && html`<${Pill} tone="gray" className="modfield__src">internal</${Pill}>`}
            <span class="tiny muted">${fmt.rel(c.at)}</span>
          </div>
          <div class="modcomment__text">${c.text}</div>
        </div>
      </div>`;
    })}
    ${rec.status !== "Closed" && html`<div class="modcomments__input">
      <${Textarea} rows=2 placeholder=${statusOnly ? "Reply to the legal team…" : "Message the requester, or add an internal note…"}
        value=${text} onInput=${(e) => setText(e.target.value)}
        onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <div class="row" style="gap:10px">
        ${!statusOnly && html`<label class="row tiny muted" style="gap:5px;cursor:pointer">
          <input type="checkbox" checked=${internal} onChange=${(e) => setInternal(e.target.checked)} /> internal note
        </label>`}
        <span class="spacer"></span>
        <${Btn} size="sm" variant="primary" icon="send" onClick=${send}>Post</${Btn}>
      </div>
    </div>`}
  </div>`;
}

/* Module-specific quick actions in the rail. */
function QuickActions({ def, rec, viewer, statusOnly }) {
  if (statusOnly) return null;
  const f = rec.fields || {};
  const actions = [];
  if (def.key === "resolutions" && !f.uploadedToTracker && /Finalize|Upload|Closed/.test(rec.stage)) {
    actions.push({
      icon: "upload", label: "Confirm tracker upload",
      hint: "Stamps date + link on the record",
      run: () => {
        const link = prompt("Resolutions Tracker link (optional):", f.trackerLink || "https://drive.google.com/resolutions-tracker");
        markResolutionUploaded(rec.id, link, viewer.id);
        toast("Marked uploaded to the Resolutions Tracker");
      },
    });
  }
  if (def.key === "inspections" && rec.status === "Closed") {
    actions.push({
      icon: "refresh", label: rec.subType === "Labour Department" ? "Schedule next (bi-annual)" : "Schedule next (annual)",
      hint: "Creates the next cycle, costs rolled forward",
      run: () => {
        const r = scheduleNextInspection(rec.id, viewer.id);
        if (r.ok) { toast(r.id + " scheduled"); navigate("/m/inspections/" + r.id); }
      },
    });
  }
  if (def.versionLog && rec.status !== "Closed") {
    actions.push({
      icon: "copy", label: "Log a draft version",
      hint: "Appends to the version log",
      run: () => {
        const note = prompt("What changed in this draft?", "Counterparty markups folded in");
        if (note != null) { const r = logModVersion(rec.id, note, viewer.id); if (r.ok) toast("Draft v" + r.v + " logged"); }
      },
    });
  }
  if (def.key === "filings" && !f.filingDate && rec.status !== "Closed") {
    actions.push({
      icon: "check", label: "Mark filed with SECP",
      hint: "Stamps today's date + SRN, moves the stage",
      run: () => {
        const srn = prompt("SECP SRN / challan number (optional):", "");
        if (srn === null) return;
        const r = markFiled(rec.id, { srn: srn.trim() }, viewer.id);
        if (r.ok) toast("Filed with SECP — status is now Filed");
      },
    });
  }
  if (def.key === "filings" && f.filingDate && !f.ctcApplied) {
    actions.push({
      icon: "fileCheck", label: "Mark CTC applied",
      hint: "Certified true copy requested from SECP",
      run: () => { updateModFields(rec.id, { ctcApplied: true }, viewer.id); toast("CTC marked as applied"); },
    });
  }
  if (!actions.length) return null;
  return html`<div class="card">
    <div class="strong" style="font-size:13.5px;margin-bottom:8px">Quick actions</div>
    ${actions.map((a) => html`<button key=${a.label} class="quickaction" onClick=${a.run}>
      <${Icon} name=${a.icon} size=15 />
      <span style="flex:1;text-align:left"><div>${a.label}</div><div class="tiny muted">${a.hint}</div></span>
      <${Icon} name="chevronRight" size=14 />
    </button>`)}
  </div>`;
}

function FieldGroups({ def, rec, md, viewer, statusOnly }) {
  const [editGroup, setEditGroup] = useState(null);
  const [draft, setDraft] = useState({});
  const groups = [];
  const seen = new Set();
  for (const f of def.fields) {
    const g = f.group || "Details";
    if (!seen.has(g)) { seen.add(g); groups.push(g); }
  }
  const visible = (f) => {
    if (statusOnly && f.internal) return false;
    if (f.showIf && !f.showIf(rec.fields || {}, rec)) return false;
    return true;
  };
  const srcTone = { HR: "purple", Admin: "amber", Legal: "green" };

  return html`<${Fragment}>
    ${groups.map((g) => {
      const groupFields = def.fields.filter((f) => (f.group || "Details") === g);
      const fs = groupFields.filter(visible);
      if (!fs.length) return null;
      // §8.2 — the department that owns a source group maintains it, even
      // from a status-only view.
      const editable = canEditGroup(viewer, def, groupFields) && rec.status !== "Closed";
      return html`<div key=${g} class="card">
        <div class="row" style="margin-bottom:10px">
          <span class="strong" style="font-size:13.5px">${g}</span>
          ${groupFields.some((f) => f.source) &&
            html`<span class="tiny muted">— maintained by ${groupFields.find((f) => f.source).source}</span>`}
          <span class="spacer"></span>
          ${editable && html`<${Btn} size="sm" icon="edit" onClick=${() => { setEditGroup(g); setDraft({ ...(rec.fields || {}) }); }}>Edit</${Btn}>`}
        </div>
        <div class="modfields">
          ${fs.map((f) => html`<div key=${f.key} class=${cx("modfield", f.type === "textarea" && "modfield--long")}>
            <div class="modfield__label">
              ${f.label}
              ${f.source && html`<${Pill} tone=${srcTone[f.source] || "gray"} className="modfield__src">${f.source}</${Pill}>`}
              ${f.internal && html`<${Icon} name="lock" size=11 style=${{ opacity: 0.5 }} />`}
            </div>
            <div class=${cx("modfield__value", f.type === "textarea" && "modfield__value--long")}>${fieldValue(f, rec)}</div>
          </div>`)}
        </div>
      </div>`;
    })}
    ${editGroup && html`<${Modal} title=${"Edit — " + editGroup} icon="edit" width=${640} onClose=${() => setEditGroup(null)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setEditGroup(null)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          const keys = def.fields.filter((f) => (f.group || "Details") === editGroup)
            .filter((f) => !(statusOnly && f.internal))
            .map((f) => f.key);
          const patch = {};
          keys.forEach((k) => { if (draft[k] !== (rec.fields || {})[k]) patch[k] = draft[k]; });
          if (Object.keys(patch).length) { updateModFields(rec.id, patch, viewer.id); toast(editGroup + " updated"); }
          setEditGroup(null);
        }}>Save</${Btn}>
      </${Fragment}>`}>
      <div class="modeditgrid">
        ${def.fields.filter((f) => (f.group || "Details") === editGroup)
          .filter((f) => !(statusOnly && f.internal))
          .filter((f) => !f.showIf || f.showIf(draft, rec))
          .map((f) => html`<${Field} key=${f.key} label=${f.label} hint=${f.hint}>
            <${FieldInput} f=${f} md=${md} rec=${rec} viewer=${viewer} value=${draft[f.key]} onChange=${(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
          </${Field}>`)}
      </div>
    </${Modal}>`}
  </${Fragment}>`;
}

function HearingsPanel({ def, rec, md, viewer, statusOnly }) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState({ date: "", type: "", attendedBy: "", outcome: "", nextDate: "" });
  const hearings = [...(rec.hearings || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const next = nextHearing(rec);
  return html`<div class="card">
    <div class="row" style="margin-bottom:8px">
      <span class="strong" style="font-size:13.5px">Hearing log</span>
      ${next && html`<${Pill} tone=${new Date(next) - Date.now() < 5 * 86400000 ? "amber" : "gray"}>Next action ${fmt.until(next)}</${Pill}>`}
      <span class="spacer"></span>
      ${!statusOnly && html`<${Btn} size="sm" icon="plus" onClick=${() => setOpen(true)}>Log hearing</${Btn}>`}
    </div>
    ${hearings.length === 0 && html`<div class="tiny muted">No hearings logged yet.</div>`}
    ${hearings.length > 0 && html`<div class="tablewrap"><table class="table table--tight">
      <thead><tr><th>Date</th><th>Type</th><th>Attended by</th><th>Outcome / order</th><th>Next hearing</th></tr></thead>
      <tbody>${hearings.map((x) => html`<tr key=${x.id}>
        <td>${fmt.date(x.date)}</td><td>${x.type}</td><td>${x.attendedBy}</td>
        <td style="max-width:340px">${x.outcome}</td>
        <td>${x.nextDate ? fmt.date(x.nextDate) : "—"}</td>
      </tr>`)}</tbody>
    </table></div>`}
    ${open && html`<${Modal} title="Log a hearing" icon="calendar" onClose=${() => setOpen(false)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setOpen(false)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          if (!h.date || !h.type) return;
          addHearing(rec.id, h, viewer.id);
          toast("Hearing logged" + (h.nextDate ? " — next " + fmt.dateShort(h.nextDate) : ""));
          setOpen(false); setH({ date: "", type: "", attendedBy: "", outcome: "", nextDate: "" });
        }}>Save hearing</${Btn}>
      </${Fragment}>`}>
      <div class="modeditgrid">
        <${Field} label="Hearing date"><${Input} type="date" value=${h.date} onInput=${(e) => setH({ ...h, date: e.target.value })} /></${Field}>
        <${Field} label="Hearing type">
          <select class="input" value=${h.type} onChange=${(e) => setH({ ...h, type: e.target.value })}>
            <option value="">Select…</option>
            ${masterList(md, "hearingTypes").map((o) => html`<option key=${o}>${o}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Attended by"><${Input} placeholder="Internal / external counsel" value=${h.attendedBy} onInput=${(e) => setH({ ...h, attendedBy: e.target.value })} /></${Field}>
        <${Field} label="Next hearing date"><${Input} type="date" value=${h.nextDate} onInput=${(e) => setH({ ...h, nextDate: e.target.value })} /></${Field}>
      </div>
      <${Field} label="Outcome / order"><${Textarea} rows=2 value=${h.outcome} onInput=${(e) => setH({ ...h, outcome: e.target.value })} /></${Field}>
    </${Modal}>`}
  </div>`;
}

function AutoResponsePanel({ rec, viewer, statusOnly }) {
  const [msg, setMsg] = useState("");
  const draft = (rec.fields || {}).autoResponseDraft;
  if (statusOnly) return null;
  return html`<div class="card">
    <div class="row" style="margin-bottom:8px">
      <span class="strong" style="font-size:13.5px">Standard response</span>
      <span class="tiny muted">— detects the notice type and drafts the matching reply for review</span>
      <span class="spacer"></span>
      <${Btn} size="sm" icon="sparkles" onClick=${() => {
        const r = generateAutoResponse(rec.id, viewer.id);
        setMsg(r.ok ? "" : r.error);
        if (r.ok) toast("Standard response drafted — review before sending");
      }}>
        ${draft ? "Regenerate" : "Generate auto-response"}
      </${Btn}>
    </div>
    ${msg && html`<div class="modwarn">${msg}</div>`}
    ${draft
      ? html`<pre class="modresponse">${draft}</pre>`
      : html`<div class="tiny muted">No draft yet. Citizen-portal, cease-and-desist, defamation and standard legal notices have stored templates.</div>`}
  </div>`;
}

function CostsPanel({ rec, md, viewer, statusOnly }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState({ type: "", estimated: null, actual: null, currency: "PKR", vendorId: "", invoiceNo: "", approvedBy: "", attribution: "Legal operating budget" });
  if (statusOnly) return null;
  const costs = rec.costs || [];
  const sum = (k, cur) => costs.filter((x) => x.currency === cur).reduce((a, x) => a + (x[k] || 0), 0);
  return html`<div class="card">
    <div class="row" style="margin-bottom:8px">
      <span class="strong" style="font-size:13.5px">Cost lines</span>
      <span class="tiny muted">— Section 13: estimated at raise, actuals at closure or per invoice</span>
      <span class="spacer"></span>
      <${Btn} size="sm" icon="plus" onClick=${() => setOpen(true)}>Add cost</${Btn}>
    </div>
    ${costs.length === 0 && html`<div class="tiny muted">No costs recorded on this record.</div>`}
    ${costs.length > 0 && html`<div class="tablewrap"><table class="table table--tight">
      <thead><tr><th>Type</th><th>Estimated</th><th>Actual</th><th>Vendor / payee</th><th>Invoice</th><th>Approved by</th><th>Attribution</th></tr></thead>
      <tbody>${costs.map((x) => html`<tr key=${x.id}>
        <td>${x.type}</td>
        <td>${x.estimated != null ? fmt.moneyFull(x.estimated, x.currency) : "—"}</td>
        <td>${x.actual != null ? fmt.moneyFull(x.actual, x.currency) : html`<span class="muted tiny">pending</span>`}</td>
        <td>${x.vendorId ? entityName(x.vendorId) : "—"}</td>
        <td class="mono tiny">${x.invoiceNo || "—"}</td>
        <td>${x.approvedBy ? personName(x.approvedBy) : "—"}</td>
        <td class="tiny">${x.attribution === "Recharged to requesting department" ? "Recharged → " + rec.requestingDept : "Legal budget"}</td>
      </tr>`)}</tbody>
    </table></div>
    <div class="tiny muted" style="margin-top:8px">
      Totals — PKR est ${fmt.moneyFull(sum("estimated", "PKR"), "PKR")}, actual ${fmt.moneyFull(sum("actual", "PKR"), "PKR")};
      USD est ${fmt.moneyFull(sum("estimated", "USD"), "USD")}, actual ${fmt.moneyFull(sum("actual", "USD"), "USD")}.
    </div>`}
    ${open && html`<${Modal} title="Record a cost" icon="dollar" width=${620} onClose=${() => setOpen(false)}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => setOpen(false)}>Cancel</${Btn}>
        <${Btn} variant="primary" onClick=${() => {
          if (!c.type) return;
          addModCost(rec.id, c, viewer.id);
          toast("Cost line recorded");
          setOpen(false);
        }}>Save cost</${Btn}>
      </${Fragment}>`}>
      <div class="modeditgrid">
        <${Field} label="Cost type">
          <select class="input" value=${c.type} onChange=${(e) => setC({ ...c, type: e.target.value })}>
            <option value="">Select…</option>
            ${masterList(md, "costTypes").map((o) => html`<option key=${o}>${o}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Currency">
          <select class="input" value=${c.currency} onChange=${(e) => setC({ ...c, currency: e.target.value })}>
            <option>PKR</option><option>USD</option>
          </select>
        </${Field}>
        <${Field} label="Estimated cost"><${Input} type="number" value=${c.estimated == null ? "" : c.estimated} onInput=${(e) => setC({ ...c, estimated: e.target.value === "" ? null : Number(e.target.value) })} /></${Field}>
        <${Field} label="Actual cost"><${Input} type="number" value=${c.actual == null ? "" : c.actual} onInput=${(e) => setC({ ...c, actual: e.target.value === "" ? null : Number(e.target.value) })} /></${Field}>
        <${Field} label="Vendor / payee (registry)">
          <div class="row" style="gap:6px">
            <select class="input" style="flex:1" value=${c.vendorId} onChange=${(e) => setC({ ...c, vendorId: e.target.value })}>
              <option value="">—</option>
              ${(getCollection("companies") || COMPANIES).filter((x) => x.type === "Vendor").map((x) => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
            </select>
            <${EntityQuickAdd} viewer=${viewer} onCreated=${(id) => setC({ ...c, vendorId: id })} />
          </div>
        </${Field}>
        <${Field} label="Invoice / reference no"><${Input} value=${c.invoiceNo} onInput=${(e) => setC({ ...c, invoiceNo: e.target.value })} /></${Field}>
        <${Field} label="Cost approved by">
          <select class="input" value=${c.approvedBy} onChange=${(e) => setC({ ...c, approvedBy: e.target.value })}>
            <option value="">—</option>
            ${USERS.filter((u) => u.rbac === "head" || u.rbac === "lead").map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Cost attribution">
          <select class="input" value=${c.attribution} onChange=${(e) => setC({ ...c, attribution: e.target.value })}>
            <option>Legal operating budget</option>
            <option>Recharged to requesting department</option>
          </select>
        </${Field}>
      </div>
    </${Modal}>`}
  </div>`;
}

function ActivityPanel({ rec }) {
  const items = [...(rec.activity || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  return html`<div class="card">
    <div class="strong" style="font-size:13.5px;margin-bottom:10px">Activity log — who did what, and when</div>
    <div class="modactivity">
      ${items.map((a, i) => html`<div key=${i} class="modactivity__row">
        <div class="modactivity__dot"></div>
        <div style="flex:1">
          <div style="font-size:13px">${a.action}${a.internal ? html` <${Pill} tone="gray" className="modfield__src">internal</${Pill}>` : null}</div>
          <div class="tiny muted">${a.by ? personName(a.by) + " · " : ""}${fmt.date(a.at)} ${new Date(a.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
        </div>
      </div>`)}
    </div>
  </div>`;
}

function Detail({ def, id, md, viewer }) {
  const rec0 = modRequestById(id);
  if (!rec0) return html`<div class="page"><${Empty} icon="search" title="Not found" text="This record does not exist." /></div>`;
  const vis = visibilityOf(viewer, rec0);
  if (!vis) return html`<${AccessDenied} def=${def} viewer=${viewer} />`;
  const statusOnly = vis === "status";
  const rec = statusOnly ? stripInternal(def, rec0) : rec0;
  const t = tatV2(def, rec0);

  return html`<div class="page page--wide">
    <div class="page__head" style="align-items:flex-start">
      <div style="min-width:0">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="mono tiny muted clickable hoverline" onClick=${() => navigate("/m/" + def.key)}>${def.label}</span>
          <span class="mono tiny muted">/ ${rec.id}</span>
        </div>
        <h2 class="page__title" style="margin-top:2px">${rec.title}</h2>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          <${Pill} tone=${teamTone(def.team)}>${teamShort(def.team)}</${Pill}>
          ${rec.subType && html`<${Pill} tone="gray">${rec.subType}</${Pill}>`}
          ${rec.priority !== "Normal" && html`<${Pill} tone="red">${rec.priority}</${Pill}>`}
          <${TatChip} t=${t} />
          ${def.key === "filings" && (() => { const s = filingStatusOf(rec); return html`<${Pill} tone=${s.tone}>${s.key} — ${s.detail}</${Pill}>`; })()}
          ${statusOnly && html`<${Pill} tone="amber">Requester view — status only</${Pill}>`}
        </div>
      </div>
    </div>

    ${statusOnly && html`<div class="modnote">
      <${Icon} name="lock" size=14 />
      You raised this request, so you see its status, stage, owner and turnaround — and you can reply,
      attach documents, and keep your department's own fields current. The team's internal notes,
      risk assessment and cost lines are not part of this view.
    </div>`}

    <div class="moddetail">
      <div class="moddetail__main">
        <${WorkflowRail} def=${def} rec=${rec0} viewer=${viewer} statusOnly=${statusOnly} />
        ${def.hearings && html`<${HearingsPanel} def=${def} rec=${rec0} md=${md} viewer=${viewer} statusOnly=${statusOnly} />`}
        ${def.autoResponse && html`<${AutoResponsePanel} rec=${rec0} viewer=${viewer} statusOnly=${statusOnly} />`}
        <${FieldGroups} def=${def} rec=${rec} md=${md} viewer=${viewer} statusOnly=${statusOnly} />
        ${def.key === "resolutions" && (() => {
          // Filing Module 8.1 — filings cite the resolution that triggered them;
          // show the reverse link so the paper trail reads both ways.
          const linked = (getCollection("modRequests") || []).filter((r) => r.moduleKey === "filings" && (r.fields || {}).linkedResolutionId === rec.id);
          if (!linked.length) return null;
          return html`<div class="card">
            <div class="strong" style="font-size:13.5px;margin-bottom:8px">SECP filings triggered by this resolution</div>
            ${linked.map((r) => {
              const s = filingStatusOf(r);
              return html`<div key=${r.id} class="row clickable hoverline" style="gap:10px;padding:6px 0;font-size:13px" onClick=${() => navigate("/m/filings/" + r.id)}>
                <span class="mono tiny muted">${r.id}</span><span>${r.title}</span>
                <span class="spacer"></span><${Pill} tone=${s.tone}>${s.key}</${Pill}>
              </div>`;
            })}
          </div>`;
        })()}
        ${(rec.versions || []).length > 0 && html`<div class="card">
          <div class="strong" style="font-size:13.5px;margin-bottom:8px">Draft version log</div>
          ${rec.versions.map((v) => html`<div key=${v.v} class="row" style="gap:10px;padding:5px 0;font-size:13px">
            <${Pill} tone="gray">v${v.v}</${Pill}> <span>${v.note}</span>
            <span class="spacer"></span><span class="tiny muted">${personName(v.by)} · ${fmt.dateShort(v.at)}</span>
          </div>`)}
        </div>`}
        <${CostsPanel} rec=${rec} md=${md} viewer=${viewer} statusOnly=${statusOnly} />
        <${CommentsPanel} rec=${rec} viewer=${viewer} statusOnly=${statusOnly} />
        ${!statusOnly && html`<${ActivityPanel} rec=${rec} />`}
      </div>
      <aside class="moddetail__rail">
        <${TatBreakdown} def=${def} rec=${rec0} />
        <${PeoplePanel} def=${def} rec=${rec0} viewer=${viewer} statusOnly=${statusOnly} />
        <${QuickActions} def=${def} rec=${rec0} viewer=${viewer} statusOnly=${statusOnly} />
        <${HoldsPanel} rec=${rec0} md=${md} viewer=${viewer} statusOnly=${statusOnly} />
        <${AttachmentsPanel} rec=${rec} viewer=${viewer} statusOnly=${statusOnly} />
      </aside>
    </div>
  </div>`;
}

/* ============================================================
   ENTRY — /m/<moduleKey>[/<recordId>]
   ============================================================ */
export default function ModulePage({ id, path }) {
  const all = useCollection("modRequests");
  const md = useMasterData();
  const viewer = useActiveUser();
  const parts = (path || "").split("/").filter(Boolean); // ["m", key, recId?]
  const key = parts[1];
  const recId = parts[2] || null;
  const def = moduleByKey(key);
  if (!def) return html`<div class="page"><${Empty} icon="search" title="Unknown module" text="This module is not in the registry." /></div>`;

  if (recId) return html`<${Detail} def=${def} id=${recId} md=${md} viewer=${viewer} key=${recId} />`;

  if (!canBrowseModule(viewer, def)) return html`<${AccessDenied} def=${def} viewer=${viewer} />`;
  const rows = all.filter((r) => r.moduleKey === def.key);
  // Keyed by module — otherwise React reuses the Register instance across
  // /m/* routes and one module's filters leak into the next.
  return html`<${Register} key=${def.key} def=${def} rows=${rows} md=${md} viewer=${viewer} />`;
}
