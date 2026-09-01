// WORKSTREAM A — the Unified Legal Workspace.
//
// The department's command surface. A legal request and its matter are ONE
// continuous object here: the row shows both faces, and opening it lands on the
// record's Flow (WorkflowSpine), not on a disconnected detail screen.
//
// Contracts, Compliance and Templating are LENSES on the same filtered dataset,
// so the GC operates everything from one place. The Browse lens implements the
// drill-down hierarchy: Company/Entity → Type of Contract → records → Flow.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Status, Risk, Priority, Progress, Empty, Metric, Segmented, Tabs, Field, Input } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import {
  useCollection, updateItem, addItem, nextId, nowIso, daysFromNow,
  getFormConfig, requestRequiredDoc, withdrawRequiredDoc, personName, personEmail,
  takeWorkspaceTarget,
} from "../store.js";
import { ChatThread, unreadCount } from "../messages.js";
import {
  nameOf, byId, entityName, entityById, GROUP_ENTITIES, COMPANIES, categoryOf,
  subdivisionOf, CONTRACT_TYPE_CODES, LEGAL_SUBDIVISIONS, TEMPLATES, COMPLIANCE,
  licenseStatus, contractTypeMeta, toUsd,
} from "../data.js";
import {
  FilterBar, useFilters, applyFilters, TatCell, SubdivisionPill, DestinationChips,
} from "../shared.js";
import { CategoryPill, TagChips } from "../shared.js";
import { unifiedRows, rowTat } from "../flow.js";
import { activeUser, canOpenPath } from "../rbac.js";
import { tatAnalysis } from "../tat.js";
import { WorkflowSpine } from "../spine.js";
import { IntakeForm } from "../intake.js";

// The Contracts and Browse lenses render the executed book, which is
// Director-only — lensesFor() removes them for everyone else, and a saved
// lens pointing at them is clamped back to the worklist.
const LENSES = [
  { key: "worklist", label: "Worklist", icon: "inbox", hint: "requests + matters as one flow" },
  { key: "log", label: "Request Log", icon: "clipboard", hint: "every incoming request, auditable" },
  { key: "contracts", label: "Contracts", icon: "file", hint: "the executed book" },
  { key: "compliance", label: "Compliance", icon: "shield", hint: "regulatory posture" },
  { key: "templating", label: "Templating", icon: "template", hint: "generate from approved versions" },
  { key: "browse", label: "Browse", icon: "layers", hint: "entity → contract type → record" },
];

/* ============================================================
   SPRINT 6 of the brief — the Request Log.
   The department's complete, auditable record of every incoming request:
   source, requester, timestamps, stage, TAT, message and document counts, and a
   link into the matter. Portal submissions and internal intake side by side.
   ============================================================ */
function RequestLog({ rows, messages, repository }) {
  const counts = (r) => ({
    msgs: messages.filter((m) => m.requestId === r.id).length,
    docs: repository.filter((d) => d.requestId === r.id).length + (r.attachments || []).length,
    asks: (r.requiredDocs || []).filter((d) => d.status === "requested").length,
  });
  const portal = rows.filter((r) => r.channel === "portal");

  return html`<div class="col" style="gap:14px">
    <${StatStrip} stats=${[
      { value: rows.length, label: "Requests logged" },
      { value: portal.length, label: "Via the requester portal" },
      { value: rows.filter((r) => r.channel !== "portal").length, label: "Raised internally" },
      { value: rows.filter((r) => r.routedManually).length, label: "Awaiting manual routing" },
      { value: rows.reduce((n, r) => n + counts(r).asks, 0), label: "Documents outstanding" },
      { value: new Set(rows.map((r) => r.source).filter((s) => s && s !== "internal")).size, label: "Distinct sources" },
    ]} />

    <div class="dense">
      <${DataTable} onRow=${(r) => navigate("/workspace/" + r.id)} rows=${rows}
        empty=${html`<${Empty} icon="clipboard" title="No requests logged" text="Nothing matches the current filters." />`}
        columns=${[
          { key: "requestDate", label: "Logged", width: "104px", render: (r) => html`<div>
              <div class="tiny strong">${fmt.dateShort(r.requestDate || r.created)}</div>
              <div class="tiny muted">${fmt.rel(r.requestDate || r.created)}</div>
            </div>` },
          { key: "id", label: "Request", mono: true, width: "94px" },
          { key: "channel", label: "Channel", width: "104px", render: (r) => html`<${Pill} tone=${r.channel === "portal" ? "purple" : "gray"}>${r.channel === "portal" ? "Portal" : "Internal"}</${Pill}>` },
          { key: "source", label: "Source", width: "168px", render: (r) => html`<div class="wrapcell">
              <div class="tiny strong">${r.source && r.source !== "internal" ? r.source : "—"}</div>
              <div class="tiny muted">${r.natureOfMatter || "—"}</div>
            </div>` },
          { key: "requester", label: "Requester", width: "150px", render: (r) => { const q = r.requesterId || r.requester; return html`<div class="row" style="gap:7px">
              <${Avatar} name=${personName(q)} size="sm" />
              <div style="min-width:0">
                <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${personName(q)}</div>
                <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.requesterEmail || r.department || "—"}</div>
              </div>
            </div>`; } },
          { key: "title", label: "Request", render: (r) => html`<div class="wrapcell">
              <div class="cell-strong">${r.title}</div>
              <div class="tiny muted">${entityName(r.entityId)}${r.contractType ? " · " + r.contractType : ""} · ${r.requestType}</div>
            </div>` },
          { key: "stage", label: "Stage", width: "116px", render: (r) => html`<div class="col" style="gap:3px;align-items:flex-start">
              <${Status} value=${r.status} />
              <span class="tiny muted">${r.stage}</span>
            </div>` },
          { key: "tat", label: "TAT", width: "158px", render: (r) => html`<${TatCell} tat=${r.__tat} />` },
          { key: "msgs", label: "Msgs", width: "62px", align: "right", render: (r) => { const c = counts(r); return c.msgs ? html`<span class="pflag pflag--new"><${Icon} name="message" size=11 />${c.msgs}</span>` : html`<span class="tiny muted">—</span>`; } },
          { key: "docs", label: "Docs", width: "84px", align: "right", render: (r) => { const c = counts(r); return html`<div class="row" style="gap:4px;justify-content:flex-end">
              ${c.docs ? html`<span class="tagchip"><${Icon} name="paperclip" size=11 />${c.docs}</span>` : html`<span class="tiny muted">—</span>`}
              ${c.asks ? html`<span class="pflag pflag--warn" title="outstanding asks">${c.asks}</span>` : ""}
            </div>`; } },
          { key: "matterId", label: "Matter", width: "94px", render: (r) => r.matterId
            ? html`<button class="facechip" onClick=${(e) => { e.stopPropagation(); navigate("/matters/" + r.matterId); }}>${r.matterId}</button>`
            : html`<span class="tiny muted">not filed</span>` },
        ]} />
    </div>

    <div class="tiny muted">
      Every row is a logged request — portal submissions carry the site they were raised from and the
      requester's email. Clicking a row opens the record's flow; the Requester tab there holds the
      chat thread and the document checklist.
    </div>
  </div>`;
}

/* ============================================================
   Lens 1 — the unified worklist
   Columns exactly as the GC listed them:
   Request Date · Filed Matter · Requestee · Category · Company/Entity ·
   Due Date · TAT Analysis · TAT Status
   ============================================================ */
function Worklist({ rows, onOpen }) {
  return html`<${DataTable} onRow=${(r) => onOpen(r.id)} rows=${rows}
    empty=${html`<${Empty} icon="inbox" title="Nothing matches these filters" text="Clear a filter or widen the date window." />`}
    columns=${[
      { key: "requestDate", label: "Request Date", width: "104px", render: (r) => html`<span class="tiny strong">${fmt.dateShort(r.requestDate || r.created || r.opened)}</span>` },
      { key: "id", label: "Request", mono: true, width: "96px", render: (r) => html`<div><div class="cell-mono strong">${r.__requestId || "—"}</div><div class="tiny muted">${r.__face === "matter" ? "triaged" : "intake"}</div></div>` },
      { key: "matterId", label: "Filed Matter", mono: true, width: "96px", render: (r) => r.__matterId
        ? html`<button class="facechip" onClick=${(e) => { e.stopPropagation(); navigate("/matters/" + r.__matterId); }}>${r.__matterId}</button>`
        : html`<span class="tiny muted">not filed</span>` },
      { key: "title", label: "Request / Matter", render: (r) => html`<div class="wrapcell">
          <div class="cell-strong">${r.title}</div>
          <div class="tiny muted">${r.requestType}${r.contractType ? " · " + r.contractType : ""} · ${r.counterparty || "—"}</div>
        </div>` },
      { key: "requester", label: "Requestee", width: "128px", render: (r) => { const q = r.requesterId || r.requester; return q ? html`<div class="row" style="gap:7px"><${Avatar} name=${personName(q)} size="sm" /><div style="min-width:0"><div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${personName(q).split(" ")[0]}</div><div class="tiny muted">${r.department || r.dept || "—"}</div></div></div>` : html`<span class="tiny muted">—</span>`; } },
      { key: "category", label: "Category", render: (r) => html`<div class="col" style="gap:4px;align-items:flex-start"><${CategoryPill} item=${r} /><${SubdivisionPill} item=${r} /></div>` },
      { key: "entityId", label: "Company / Entity", width: "150px", render: (r) => html`<div class="col" style="gap:3px;align-items:flex-start">
          <button class="tagchip" onClick=${(e) => { e.stopPropagation(); navigate("/companies/" + r.entityId); }}><${Icon} name="building" size=11 />${entityName(r.entityId)}</button>
          <span class="tiny muted">${(entityById(r.entityId) || {}).jur || ""}</span>
        </div>` },
      { key: "owner", label: "Owner", width: "58px", render: (r) => html`<${Avatar} name=${nameOf(r.owner)} size="sm" />` },
      { key: "due", label: "Due Date", width: "96px", render: (r) => { const d = r.dueDate || r.due; const late = d && new Date(d) < Date.now(); return html`<div><div class=${cx("tiny strong", late && "risk--critical")}>${d ? fmt.dateShort(d) : "—"}</div><div class="tiny muted">${d ? fmt.until(d) : ""}</div></div>`; } },
      { key: "tatAnalysis", label: "TAT Analysis", width: "142px", render: (r) => html`<div>
          <div class="tiny strong">${r.__tat.days}d allowed</div>
          <div class="tiny muted">${tatAnalysis(r.__tat)}</div>
        </div>` },
      { key: "tatStatus", label: "TAT Status", width: "168px", render: (r) => html`<${TatCell} tat=${r.__tat} />` },
    ]} />`;
}

/* ============================================================
   Lens 2 — contracts (same filters, executed book)
   ============================================================ */
function ContractLens({ rows }) {
  return html`<${DataTable} onRow=${(c) => navigate("/contracts/" + c.id)} rows=${rows}
    empty=${html`<${Empty} icon="file" title="No contracts match" text="Widen the filters to see the book." />`}
    columns=${[
      { key: "srNo", label: "Sr No", width: "62px", mono: true },
      { key: "id", label: "ID", mono: true, width: "92px" },
      { key: "title", label: "Contract", render: (c) => html`<div class="wrapcell"><div class="cell-strong">${c.title}</div><div class="tiny muted">${c.counterparty} · ${c.contractType}</div></div>` },
      { key: "entityId", label: "Entity", width: "120px", render: (c) => html`<span class="tiny strong">${entityName(c.entityId)}</span>` },
      { key: "subdivision", label: "Sub-division", render: (c) => html`<${SubdivisionPill} item=${c} />` },
      { key: "value", label: "Value", align: "right", render: (c) => html`<span class="strong">${fmt.money(c.value, c.currency)}</span>` },
      { key: "risk", label: "Risk", render: (c) => html`<${Risk} level=${c.risk} />` },
      { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` },
      { key: "tat", label: "TAT Status", width: "160px", render: (c) => html`<${TatCell} tat=${c.__tat} />` },
      { key: "expiry", label: "Expiry", width: "94px", render: (c) => { const days = Math.round((new Date(c.expiry) - Date.now()) / 86400000); return html`<div><div class=${cx("tiny strong", days >= 0 && days < 60 && "risk--high", days < 0 && "risk--critical")}>${fmt.dateShort(c.expiry)}</div><div class="tiny muted">${days < 0 ? "expired" : days + "d"}</div></div>`; } },
    ]} />`;
}

/* ============================================================
   Lens 3 — compliance (regulatory posture, same bar)
   ============================================================ */
function ComplianceLens({ rows }) {
  return html`<${DataTable} rows=${rows}
    empty=${html`<${Empty} icon="shield" title="No compliance areas match" text="Adjust the sub-division or owner filter." />`}
    columns=${[
      { key: "id", label: "ID", mono: true, width: "78px" },
      { key: "area", label: "Area", render: (r) => html`<div class="cell-strong">${r.area}</div>` },
      { key: "subdivision", label: "Sub-division", render: (r) => html`<${SubdivisionPill} item=${r} />` },
      { key: "region", label: "Region" },
      { key: "owner", label: "Owner", render: (r) => html`<div class="row" style="gap:7px"><${Avatar} name=${nameOf(r.owner)} size="sm" /><span class="tiny">${nameOf(r.owner).split(" ")[0]}</span></div>` },
      { key: "score", label: "Score", width: "132px", render: (r) => html`<div class="row" style="gap:8px"><div style="flex:1"><${Progress} value=${r.score} tone=${r.score >= 85 ? "green" : r.score >= 70 ? "amber" : "red"} /></div><span class="tiny strong" style="width:26px">${r.score}</span></div>` },
      { key: "status", label: "Status", render: (r) => html`<${Status} value=${r.status} />` },
      { key: "nextReview", label: "Next review", render: (r) => html`<span class="tiny strong">${fmt.until(r.nextReview)}</span>` },
    ]} />`;
}

/* ============================================================
   Lens 4 — templating & auto-generation
   Generates a draft from an approved template version straight into a
   record's Drafting stage (Workstream H).
   ============================================================ */
function TemplatingLens({ rows }) {
  const [sel, setSel] = useState(null);
  const drafting = rows.filter((r) => /Draft|Review|Triage|Intake/.test(r.stage || r.status || ""));

  const generate = (tpl, rec) => {
    const version = (tpl.versions || []).filter((v) => v.status === "Approved").slice(-1)[0] || (tpl.versions || [])[0];
    const doc = {
      id: nextId("repository", "DOC-"),
      name: `${rec.title} — draft from ${tpl.title} ${version ? version.version : ""}.docx`,
      kind: "Draft", source: "Generated",
      contractId: rec.linkedContractId || null,
      entityId: rec.entityId, contractType: rec.contractType,
      jur: (entityById(rec.entityId) || {}).jur || "—",
      uploadedBy: rec.owner || "u5", uploadedAt: nowIso(),
      pages: 12, sizeKb: 340, stage: "Drafting",
      ocrStatus: "Not required", ocrConfidence: 1,
      srNo: null, physicalRecordRef: null, officeLocation: null,
      storagePath: `/legal/drafts/${rec.id}.docx`,
      driveLink: `https://drive.google.com/file/d/legalos-${rec.id.toLowerCase()}-draft/view`,
      ocrText: version ? version.body : "",
      extractedFields: {},
      templateId: tpl.id, templateVersion: version ? version.version : null,
      access: [{ userId: rec.owner || "u5", level: "edit" }, { userId: "u1", level: "comment" }],
    };
    addItem("repository", doc);
    updateItem("requests", rec.id, { stage: "Drafting", status: "Drafting" });
    setSel(null);
    navigate("/workspace/" + rec.id);
  };

  return html`<div class="grid" style="grid-template-columns:1fr 340px;gap:14px;align-items:start">
    <div class="card">
      <div class="card__head"><div class="card__title">Approved templates</div><div class="card__sub">Only approved versions can be generated from</div></div>
      <div class="card__body col" style="gap:6px">
        ${TEMPLATES.map((t) => {
          const approved = (t.versions || []).filter((v) => v.status === "Approved").slice(-1)[0];
          return html`<div key=${t.id} class=${cx("docrow", sel && sel.id === t.id && "clickable")} style=${sel && sel.id === t.id ? "border-color:var(--brand);background:var(--brand-soft)" : ""} onClick=${() => setSel(t)}>
            <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="template" size=15 /></div>
            <div style="flex:1;min-width:0">
              <div class="strong tiny">${t.title}</div>
              <div class="tiny muted">${t.category} · ${t.jurisdiction} · used ${t.usage}×</div>
            </div>
            ${approved ? html`<${Pill} tone="green">${approved.version}</${Pill}>` : html`<${Pill} tone="amber">no approved version</${Pill}>`}
          </div>`;
        })}
      </div>
    </div>
    <div class="card card--pad col" style="gap:12px">
      <span class="strong">Generate into a record</span>
      ${!sel
        ? html`<span class="tiny muted">Pick a template on the left, then choose the record to draft into. The draft lands in that record's Drafting stage and appears in its Output zone.</span>`
        : html`<div class="col" style="gap:10px">
            <div class="banner banner--info"><${Icon} name="template" size=15 /><span>${sel.title}</span></div>
            ${drafting.length === 0
              ? html`<span class="tiny muted">No records are currently at a stage that accepts a generated draft.</span>`
              : drafting.slice(0, 8).map((r) => html`<div key=${r.id} class="docrow clickable" onClick=${() => generate(sel, r)}>
                  <div style="flex:1;min-width:0"><div class="strong tiny">${r.title}</div><div class="tiny muted">${r.id} · ${r.stage} · ${nameOf(r.owner)}</div></div>
                  <${Icon} name="sparkles" size=15 style=${{ color: "var(--brand)" }} />
                </div>`)}
          </div>`}
    </div>
  </div>`;
}

/* ============================================================
   Lens 5 — drill-down browse (Workstream C)
   Company/Entity → Type of Contract → list → the record's Flow view.
   Every level respects the Master Filter Bar.
   ============================================================ */
function BrowseLens({ contracts }) {
  const [openEntity, setOpenEntity] = useState(null);
  const [openType, setOpenType] = useState(null);

  // Only entities that actually hold something in the filtered set.
  const byEntity = useMemo(() => {
    const m = new Map();
    contracts.forEach((c) => {
      const k = c.entityId || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c);
    });
    return [...m.entries()]
      .map(([id, items]) => ({ id, entity: entityById(id), items, value: items.reduce((s, x) => s + toUsd(x.value, x.currency), 0) }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [contracts]);

  if (!byEntity.length) return html`<${Empty} icon="layers" title="Nothing to browse" text="No records match the current filters." />`;

  return html`<div class="drill">
    ${byEntity.map((e) => {
      const isOpen = openEntity === e.id;
      const types = new Map();
      e.items.forEach((c) => {
        const k = c.contractType || "Unclassified";
        if (!types.has(k)) types.set(k, []);
        types.get(k).push(c);
      });
      const typeList = [...types.entries()].sort((a, b) => b[1].length - a[1].length);
      return html`<div key=${e.id}>
        <button class=${cx("drill__node", isOpen && "open")} onClick=${() => { setOpenEntity(isOpen ? null : e.id); setOpenType(null); }}>
          <${Icon} name=${isOpen ? "chevronDown" : "chevronRight"} size=15 />
          <div class="notif__ico" style="width:30px;height:30px;background:var(--brand-soft);color:var(--brand);flex:none"><${Icon} name="building" size=15 /></div>
          <div style="flex:1;min-width:0">
            <div class="panel__title">${e.entity ? e.entity.name : e.id}</div>
            <div class="tiny muted">${e.entity ? `${e.entity.type} · ${e.entity.jurisdiction}` : "—"} · ${typeList.length} contract type${typeList.length === 1 ? "" : "s"}</div>
          </div>
          <span class="tiny muted">${fmt.money(e.value)}</span>
          <span class="drill__n">${e.items.length}</span>
        </button>

        ${isOpen && html`<div class="drill__kids">
          ${typeList.map(([type, items]) => {
            const tOpen = openType === e.id + "|" + type;
            const meta = contractTypeMeta(type);
            return html`<div key=${type}>
              <button class=${cx("drill__node", tOpen && "open")} onClick=${() => setOpenType(tOpen ? null : e.id + "|" + type)}>
                <${Icon} name=${tOpen ? "chevronDown" : "chevronRight"} size=14 />
                <div class="notif__ico" style="width:26px;height:26px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name="file" size=13 /></div>
                <div style="flex:1;min-width:0">
                  <div class="strong tiny">${meta ? meta.name : type}</div>
                  <div class="tiny muted">${meta ? meta.subdivision : "—"}</div>
                </div>
                <span class="tiny muted">${fmt.money(items.reduce((s, x) => s + toUsd(x.value, x.currency), 0))}</span>
                <span class="drill__n">${items.length}</span>
              </button>
              ${tOpen && html`<div class="drill__kids">
                ${items.map((c) => html`<button key=${c.id} class="drill__node" onClick=${() => navigate("/contracts/" + c.id)}>
                  <div style="flex:1;min-width:0">
                    <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title}</div>
                    <div class="tiny muted">${c.id} · ${c.counterparty} · Sr No ${c.srNo}</div>
                  </div>
                  <${TatCell} tat=${c.__tat} compact=${true} />
                  <${Status} value=${c.status} />
                  <${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)" }} />
                </button>`)}
              </div>`}
            </div>`;
          })}
        </div>`}
      </div>`;
    })}
  </div>`;
}

/* ============================================================
   The workspace
   ============================================================ */
function WorkspaceHome() {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  const messages = useCollection("messages");
  // A one-shot target set by the Executive Overview or the Flow Map: open on a
  // given lens, already narrowed. Read once at mount so a later render cannot
  // re-apply it and fight the user's own filtering.
  const [target] = useState(() => takeWorkspaceTarget());
  const canBook = canOpenPath(activeUser(), "/contracts");
  const lenses = LENSES.filter((l) => canBook || (l.key !== "contracts" && l.key !== "browse"));
  const [lens, setLens] = useState(() => {
    const want = (target && target.lens) || "worklist";
    return lenses.some((l) => l.key === want) ? want : "worklist";
  });
  const [intake, setIntake] = useState(false);
  const { filters, patch, toggle, clear } = useFilters("workspace", (target && target.filters) || {}, { force: !!target });

  const ctx = { requests, matters, contracts, repository, licenses };

  // ONE dataset: requests and matters unified into a single continuous record.
  const unified = useMemo(() => unifiedRows(requests, matters).map((u) => ({
    ...u.record,
    id: u.id,
    title: u.title,
    __requestId: u.requestId,
    __matterId: u.matterId,
    __face: u.face,
    __tat: rowTat(u.record, ctx),
  })), [requests, matters, contracts, repository]);

  const contractRows = useMemo(() => contracts.map((c) => ({ ...c, __tat: rowTat(c, ctx) })), [contracts, repository]);

  // Every lens is the same filter set applied to its slice.
  const fWork = applyFilters(unified, filters, { searchKeys: ["title", "counterparty", "id", "requestType", "contractType"] });
  const fContracts = applyFilters(contractRows, filters, { searchKeys: ["title", "counterparty", "id", "contractType", "landRef", "physicalRecordRef"] });
  const fCompliance = applyFilters(COMPLIANCE, filters, { searchKeys: ["area", "region", "id"] });

  const delayed = fWork.filter((r) => r.__tat.status === "Delayed");
  const dueToday = fWork.filter((r) => r.__tat.status === "Due Today");

  // The Request Log is the request face only — every incoming request, logged.
  const logRows = useMemo(() => requests.map((r) => ({ ...r, __tat: rowTat(r, ctx) })), [requests, matters, contracts, repository]);
  const fLog = applyFilters(logRows, filters, { searchKeys: ["title", "id", "counterparty", "source", "requesterEmail", "natureOfMatter"] });

  const activeRows = lens === "contracts" || lens === "browse" ? fContracts : lens === "compliance" ? fCompliance : lens === "log" ? logRows : unified;
  const dims = lens === "compliance"
    ? ["subdivisions", "owners", "statuses"]
    : lens === "contracts" || lens === "browse"
      ? ["units", "departments", "entities", "contractTypes", "subdivisions", "categories", "owners", "statuses", "risks", "tatStatuses"]
      : ["units", "departments", "entities", "contractTypes", "subdivisions", "categories", "owners", "statuses", "risks", "tatStatuses"];
  const dateFields = lens === "compliance"
    ? [{ key: "nextReview", label: "Next review" }, { key: "lastReview", label: "Last review" }]
    : lens === "contracts" || lens === "browse"
      ? [{ key: "expiry", label: "Expiry" }, { key: "start", label: "Execution / start" }]
      : [{ key: "dueDate", label: "Due date" }, { key: "requestDate", label: "Request date" }];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Legal Workspace"
      sub="One surface for the whole department — a request and its matter are the same record, from intake to repository."
      actions=${html`<${Btn} variant="ghost" icon="grid" onClick=${() => navigate("/tracker")}>Tracker</${Btn}>
        <${Btn} variant="ghost" icon="scan" onClick=${() => navigate("/repository")}>Add document</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => setIntake(true)}>New request</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: fWork.length, label: "Live records" },
      { value: delayed.length, label: "Delayed", trend: delayed.length ? "▲" : "", trendDir: "up" },
      { value: dueToday.length, label: "Due today" },
      { value: fWork.filter((r) => r.__matterId).length, label: "Filed as matters" },
      { value: fContracts.length, label: "Contracts in scope" },
      { value: fmt.money(fContracts.reduce((s, c) => s + toUsd(c.value, c.currency), 0)), label: "Portfolio value" },
    ]} />

    <div style="margin-bottom:14px">
      <div class="lens">
        ${lenses.map((l) => html`<button key=${l.key} class=${cx(lens === l.key && "active")} onClick=${() => setLens(l.key)} title=${l.hint}>
          <${Icon} name=${l.icon} size=15 />${l.label}
        </button>`)}
      </div>
    </div>

    <${FilterBar} module=${"workspace-" + lens} filters=${filters} onPatch=${patch} onToggle=${toggle} onClear=${clear}
      dims=${dims} dateFields=${dateFields} rows=${activeRows}
      placeholder=${lens === "compliance" ? "Search areas…" : "Search titles, counterparties, deed refs…"} />

    ${delayed.length > 0 && lens === "worklist" && html`<div class="banner banner--warn" style="margin-bottom:14px;align-items:flex-start">
      <${Icon} name="alertTriangle" size=17 />
      <div style="flex:1;min-width:0">
        <div class="strong tiny">${delayed.length} record${delayed.length === 1 ? " is" : "s are"} past their fixed TAT</div>
        <div class="tiny" style="margin-top:3px;opacity:.9">
          ${delayed.slice(0, 4).map((r) => `${r.id} — ${r.__tat.overdueBy}d over, blocked at ${r.__tat.blockingStage}`).join(" · ")}${delayed.length > 4 ? ` · +${delayed.length - 4} more` : ""}
        </div>
      </div>
      <${Btn} variant="soft" size="sm" onClick=${() => toggle("tatStatuses", "Delayed")}>Show only delayed</${Btn}>
    </div>`}

    ${lens === "log" && html`<${RequestLog} rows=${fLog} messages=${messages} repository=${repository} />`}
    ${lens === "worklist" && html`<${Worklist} rows=${fWork} onOpen=${(id) => navigate("/workspace/" + id)} />`}
    ${lens === "contracts" && html`<${ContractLens} rows=${fContracts} />`}
    ${lens === "compliance" && html`<${ComplianceLens} rows=${fCompliance} />`}
    ${lens === "templating" && html`<${TemplatingLens} rows=${fWork} />`}
    ${lens === "browse" && html`<${BrowseLens} contracts=${fContracts} />`}

    ${intake && html`<${IntakeForm} mode="internal" requesterId="u13" onClose=${() => setIntake(false)}
      onDone=${(res, open) => { if (open) navigate("/workspace/" + res.id); }} />`}
  </div>`;
}

/* ============================================================
   SPRINT 4 — the legal side of the requester bridge.
   The same chat thread the requester sees, plus the missing-document checklist
   legal drives. Rendered on the workspace record and on the matter workspace.
   ============================================================ */
export function RequesterPanel({ requestId, viewer = "u1" }) {
  const requests = useCollection("requests");
  const repository = useCollection("repository");
  const messages = useCollection("messages");
  const [ask, setAsk] = useState("");

  const r = requests.find((x) => x.id === requestId);
  if (!r) {
    return html`<${Empty} icon="user" title="No requester thread"
      text="This record was opened internally, so there is no requester to correspond with." />`;
  }

  const requesterName = personName(r.requesterId || r.requester);
  const requesterEmail = r.requesterEmail || personEmail(r.requesterId || r.requester);
  const docs = repository.filter((d) => d.requestId === r.id);
  const outstanding = (r.requiredDocs || []).filter((d) => d.status === "requested");
  const received = (r.requiredDocs || []).filter((d) => d.status === "received");
  const unread = unreadCount(r.id, viewer, messages);

  const templates = ((getFormConfig().requiredDocTemplates || {})[r.contractType] || [])
    .filter((t) => !(r.requiredDocs || []).some((d) => d.name === t));

  const askFor = (name) => { if (name && name.trim()) { requestRequiredDoc(r.id, name, viewer); setAsk(""); } };

  return html`<div class="grid" style="grid-template-columns:1fr 340px;gap:16px;align-items:start">
    <div class="card card--pad col" style="gap:12px">
      <div class="row">
        <span class="strong">Requester chat</span>
        <div class="spacer"></div>
        ${unread > 0 && html`<${Pill} tone="red">${unread} unread</${Pill}>`}
        <span class="tiny muted">with ${requesterName}${requesterEmail ? " · " + requesterEmail : ""}</span>
      </div>
      <div class="banner banner--info" style="padding:9px 12px;align-items:flex-start">
        <${Icon} name="alertCircle" size=15 />
        <span class="tiny">
          The requester sees this thread in their portal. Keep privileged analysis in the
          matter's internal notes — anything written here is visible to them.
        </span>
      </div>
      <${ChatThread} requestId=${r.id} viewer=${viewer} role="legal"
        counterpartLabel=${requesterName} compact=${true} height=${400} />
    </div>

    <div class="col" style="gap:14px">
      <!-- who and where from -->
      <div class="card card--pad col" style="gap:10px">
        <span class="strong">Where this came from</span>
        <div class="kvgrid" style="grid-template-columns:1fr">
          <div class="kv"><div class="kv__l">Requester</div><div class="kv__v">${requesterName}</div></div>
          <div class="kv"><div class="kv__l">Email</div><div class="kv__v" style="overflow-wrap:anywhere">${requesterEmail || "—"}</div></div>
          <div class="kv"><div class="kv__l">Raised from</div><div class="kv__v">${r.source || "—"}</div></div>
          <div class="kv"><div class="kv__l">Channel</div><div class="kv__v">
            <${Pill} tone=${r.channel === "portal" ? "purple" : "gray"}>${r.channel === "portal" ? "Requester portal" : "Internal"}</${Pill}>
          </div></div>
          <div class="kv"><div class="kv__l">Nature of matter</div><div class="kv__v">${r.natureOfMatter || "—"}</div></div>
        </div>
      </div>

      <!-- the missing-document flow: legal asks, the requester is notified -->
      <div class="card card--pad col" style="gap:10px">
        <div class="row">
          <span class="strong">Documents from the requester</span>
          <div class="spacer"></div>
          ${outstanding.length > 0
            ? html`<${Pill} tone="amber">${outstanding.length} outstanding</${Pill}>`
            : html`<${Pill} tone="green">nothing outstanding</${Pill}>`}
        </div>

        ${(r.requiredDocs || []).length === 0 && html`<span class="tiny muted">Nothing requested yet.</span>`}

        ${(r.requiredDocs || []).map((d) => html`<div key=${d.id} class="row" style="gap:8px;align-items:flex-start">
          <${Icon} name=${d.status === "received" ? "checkcircle" : "clock"} size=15
            style=${{ color: d.status === "received" ? "var(--success)" : "var(--warning)", flex: "none", marginTop: "2px" }} />
          <div style="flex:1;min-width:0">
            <div class="tiny strong">${d.name}</div>
            <div class="tiny muted">
              ${d.status === "received"
                ? `received ${d.receivedAt ? fmt.rel(d.receivedAt) : ""}`
                : `asked ${d.requestedAt ? fmt.rel(d.requestedAt) : ""} — waiting on ${requesterName.split(" ")[0]}`}
            </div>
          </div>
          ${d.status === "requested"
            ? html`<button class="iconbtn" style="width:24px;height:24px" title="Withdraw the request"
                onClick=${() => withdrawRequiredDoc(r.id, d.id)}><${Icon} name="x" size=14 /></button>`
            : html`<${Pill} tone="green">✓</${Pill}>`}
        </div>`)}

        <div class="row" style="gap:7px;padding-top:10px;border-top:1px solid var(--border)">
          <input class="input" style="height:32px;font-size:12.5px" placeholder="Ask for a document…"
            value=${ask} onInput=${(e) => setAsk(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter") askFor(ask); }} />
          <${Btn} variant="primary" size="sm" icon="plus" onClick=${() => askFor(ask)} disabled=${!ask.trim()} />
        </div>
        ${templates.length > 0 && html`<div>
          <div class="tiny muted" style="margin-bottom:6px">Standard asks for a ${r.contractType} request:</div>
          <div class="row wrap" style="gap:5px">
            ${templates.slice(0, 6).map((t) => html`<button key=${t} class="tagchip" onClick=${() => askFor(t)}>
              <${Icon} name="plus" size=11 />${t}
            </button>`)}
          </div>
        </div>`}
      </div>

      <!-- what they have uploaded -->
      <div class="card card--pad col" style="gap:9px">
        <div class="row"><span class="strong">Uploaded by the requester</span><div class="spacer"></div><span class="tiny muted">${docs.length}</span></div>
        ${docs.length === 0
          ? html`<span class="tiny muted">Nothing uploaded through the portal yet.</span>`
          : docs.map((d) => html`<div key=${d.id} class="row clickable" style="gap:8px" onClick=${() => navigate("/repository/" + d.id)}>
              <${Icon} name="file" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />
              <div style="flex:1;min-width:0">
                <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
                <div class="tiny muted">${d.kind} · ${fmt.rel(d.uploadedAt)}</div>
              </div>
              <${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />
            </div>`)}
      </div>
    </div>
  </div>`;
}

/* ---------------- the record's Flow view ---------------- */
function RecordFlow({ id }) {
  const requests = useCollection("requests");
  const messages = useCollection("messages");
  const [tab, setTab] = useState("flow");

  // The requester thread hangs off the REQUEST id, whichever face we entered on.
  const req = requests.find((x) => x.id === id)
    || requests.find((x) => x.matterId === id)
    || null;
  const unread = req ? unreadCount(req.id, "u1", messages) : 0;
  const outstanding = req ? (req.requiredDocs || []).filter((d) => d.status === "requested").length : 0;

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:14px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/workspace")}>Legal Workspace</${Btn}>
    </div>

    ${req && html`<div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "flow", label: "Flow", icon: "workflow" },
        { key: "requester", label: "Requester", icon: "user", count: (unread + outstanding) || undefined },
      ]} />
    </div></div>`}

    ${tab === "requester" && req
      ? html`<${RequesterPanel} requestId=${req.id} viewer="u1" />`
      : html`<${WorkflowSpine} id=${id} />`}
  </div>`;
}

export default function Workspace({ id }) {
  return id ? html`<${RecordFlow} id=${id} /> ` : html`<${WorkspaceHome} />`;
}
