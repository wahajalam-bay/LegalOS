// MODULE 3 — CONTRACT INTELLIGENCE: home, Create Draft, and the Draft Workspace.
//
// Assembly before generation: a draft is built from the approved template
// structure + published library clauses. Every span of text carries provenance
// (LIBRARY / AI-SUGGESTED / USER-EDITED / COMMERCIAL INPUT / NO APPROVED
// SOURCE), deviations from library positions are detected and approval-routed,
// and nothing is deliverable without a named lawyer's explicit approval.
import { html, cx, fmt, useState, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Avatar, Empty, Modal, Field, Input, Textarea, Tabs, Segmented } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { nameOf, byId, USERS } from "../data.js";
import {
  useCollection, matterById,
  createDraft, draftById, editDraftSection, setDraftStatus, draftOutstanding,
  approveDeviation, retrievePrecedent, suggestClauseImprovement,
  clauseById3, clauseCurrentVersion, counterpartyName,
} from "../store.js";
import {
  SOURCE_KINDS, DRAFT_TONE, TIER_TONE,
  OUR_ROLES, VALUE_BANDS, DRAFT_FEATURES, M3_JURISDICTIONS, M3_AGREEMENT_TYPES,
  TEMPLATE_DEFS,
} from "../contracts3.js";
import { useActiveUser, isLegal, filterVisible, canReassign } from "../rbac.js";
import { CounterpartyPicker } from "./matters.js";
import { toast } from "../toast.js";

const II = { display: "inline", verticalAlign: "-2px", marginRight: "4px" };

/* Provenance badge (Phase 37) — label + icon, never colour alone. */
export function SourceBadge({ kind, small }) {
  const s = SOURCE_KINDS[kind] || SOURCE_KINDS.fixed;
  return html`<span class="srcbadge" data-kind=${kind} title=${s.hint}>
    <${Icon} name=${s.icon} size=${small ? 10 : 11} />${s.label}
  </span>`;
}
const DevTone = { Low: "gray", Medium: "blue", High: "amber", Critical: "red" };

/* ============================================================
   CREATE DRAFT (Phase 10)
   ============================================================ */
function CreateDraftModal({ onClose }) {
  const viewer = useActiveUser();
  const matters = filterVisible(viewer, useCollection("matters"));
  const [f, setF] = useState({ agreementType: M3_AGREEMENT_TYPES[0], ourRole: "Customer", counterpartyId: null, jurisdiction: "Saudi Arabia", valueBand: VALUE_BANDS[1], term: "1 year", features: [], matterId: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [err, setErr] = useState("");
  const submit = () => {
    const res = createDraft({ ...f, matterId: f.matterId || null }, viewer.id);
    if (!res.ok) { setErr(res.error); return; }
    toast(res.id + " assembled from the approved library");
    onClose(); navigate("/drafting/" + res.id);
  };
  return html`<${Modal} title="Create contract draft" icon="sparkles" width=${620} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="workflow" onClick=${submit}>Assemble draft</${Btn}>`}>
    <div class="banner banner--info" style="margin-bottom:14px;align-items:flex-start">
      <${Icon} name="checkcircle" size=15 />
      <span class="tiny">The draft is <b>assembled</b> from the approved template and PUBLISHED library clauses. Generation is used only for connective text — and is always marked AI-SUGGESTED.</span>
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <${Field} label="Agreement type *">
        <select class="select" value=${f.agreementType} onChange=${(e) => set("agreementType", e.target.value)}>
          ${M3_AGREEMENT_TYPES.map((t) => html`<option key=${t}>${t}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Our role">
        <select class="select" value=${f.ourRole} onChange=${(e) => set("ourRole", e.target.value)}>
          ${OUR_ROLES.map((r) => html`<option key=${r}>${r}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Jurisdiction / governing law *">
        <select class="select" value=${f.jurisdiction} onChange=${(e) => set("jurisdiction", e.target.value)}>
          ${M3_JURISDICTIONS.map((j) => html`<option key=${j}>${j}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Value band">
        <select class="select" value=${f.valueBand} onChange=${(e) => set("valueBand", e.target.value)}>
          ${VALUE_BANDS.map((v) => html`<option key=${v}>${v}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Term"><${Input} value=${f.term} onInput=${(e) => set("term", e.target.value)} placeholder="e.g. 2 years" /></${Field}>
      <${Field} label="Related matter">
        <select class="select" value=${f.matterId} onChange=${(e) => set("matterId", e.target.value)}>
          <option value="">—</option>
          ${matters.filter((m) => m.practiceArea).slice(0, 30).map((m) => html`<option key=${m.id} value=${m.id}>${m.id} · ${(m.name || m.title || "").slice(0, 40)}</option>`)}
        </select>
      </${Field}>
    </div>
    <${Field} label="Special features" hint="Conditional clauses are pulled in from the library.">
      <div class="row wrap" style="gap:6px">
        ${DRAFT_FEATURES.map((x) => {
          const on = f.features.includes(x);
          return html`<button key=${x} class="tagchip" style=${on ? "background:var(--brand-soft);border-color:var(--brand);color:var(--brand-600);font-weight:600" : ""}
            onClick=${() => set("features", on ? f.features.filter((y) => y !== x) : [...f.features, x])}>${x}</button>`;
        })}
      </div>
    </${Field}>
    <${Field} label="Counterparty" hint="From the master — never free text.">
      <${CounterpartyPicker} value=${f.counterpartyId} onChange=${(v) => set("counterpartyId", v)} viewer=${viewer} />
    </${Field}>
    ${err && html`<div class="modwarn"><${Icon} name="alertTriangle" size=14 /> ${err}</div>`}
  </${Modal}>`;
}

/* ============================================================
   HOME (Phase 31) — operational, not decorative.
   ============================================================ */
function DraftingHome() {
  const viewer = useActiveUser();
  const drafts = useCollection("drafts3");
  const reviews = useCollection("reviews3");
  const deviations = useCollection("deviations3");
  const suggestions = useCollection("clauseSuggestions");
  const templates = useCollection("templates3");
  const clauses = useCollection("clauses3");
  const [tab, setTab] = useState("work");
  const [creating, setCreating] = useState(false);
  if (!isLegal(viewer)) return html`<div class="page"><${Empty} icon="lock" title="Contract Intelligence is internal" text="Approved outputs reach you through your request." /></div>`;

  const openDrafts = drafts.filter((d) => d.status !== "Delivered" && d.status !== "Rejected");
  const openReviews = reviews.filter((r) => r.status === "Findings" || r.status === "Extraction Failed");
  const pendingDevs = deviations.filter((x) => x.status === "Open");
  const highRisk = pendingDevs.filter((x) => x.risk === "High" || x.risk === "Critical");
  const mayApprove = viewer.rbac === "lead" || viewer.rbac === "head";

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Contract Intelligence" sub="Drafting and review from the department's approved positions — assembly before generation, lawyers in control."
      actions=${html`<${Btn} variant="ghost" icon="upload" onClick=${() => navigate("/reviews")}>Review counterparty paper</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>Create draft</${Btn}>`} />
    ${creating && html`<${CreateDraftModal} onClose=${() => setCreating(false)} />`}

    <${StatStrip} stats=${[
      { value: openDrafts.length, label: "Drafts in progress" },
      { value: openReviews.length, label: "Reviews awaiting action" },
      { value: pendingDevs.length, label: "Deviations awaiting approval" },
      { value: highRisk.length, label: "High-risk deviations" },
      { value: clauses.filter((c) => c.status === "Published").length, label: "Published clauses" },
      { value: templates.filter((t) => t.status === "Published").length, label: "Approved templates" },
    ]} />

    <div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "work", label: "Work", icon: "workflow" },
        { key: "approvals", label: "Approvals", icon: "checksquare", count: (mayApprove ? pendingDevs.length + suggestions.filter((s) => s.status !== "Published" && s.status !== "Rejected").length : 0) || undefined },
        { key: "templates", label: "Templates", icon: "template" },
      ]} />
    </div></div>

    ${tab === "work" && html`<div class="grid" style="grid-template-columns:1.2fr .8fr;gap:16px;align-items:start">
      <div class="card" style="padding:0">
        <div class="row" style="padding:14px 16px 6px"><span class="panel__title">Drafts</span><div class="spacer"></div><${Pill} tone="blue">${drafts.length}</${Pill}></div>
        <div class="dense"><${DataTable} onRow=${(d) => navigate("/drafting/" + d.id)} rows=${drafts}
          empty=${html`<${Empty} icon="sparkles" title="No drafts yet" text="Create the first draft from the approved library." />`}
          columns=${[
            { key: "id", label: "ID", mono: true, width: "92px" },
            { key: "title", label: "Draft", render: (d) => html`<div class="wrapcell"><div class="cell-strong">${d.title}</div><div class="tiny muted">${d.jurisdiction} · ${d.ourRole || "—"}${d.matterId ? " · " + d.matterId : ""}</div></div>` },
            { key: "status", label: "Status", width: "126px", render: (d) => html`<${Pill} tone=${DRAFT_TONE[d.status] || "gray"} dot=${true}>${d.status}</${Pill}>` },
            { key: "dev", label: "Deviations", width: "96px", render: (d) => { const o = draftOutstanding(d).length; return o ? html`<${Pill} tone="amber">${o} open</${Pill}>` : html`<span class="tiny muted">—</span>`; } },
            { key: "owner", label: "By", width: "54px", render: (d) => html`<${Avatar} name=${nameOf(d.createdBy)} size="sm" />` },
          ]} /></div>
      </div>
      <div class="card" style="padding:0">
        <div class="row" style="padding:14px 16px 6px"><span class="panel__title">Counterparty reviews</span><div class="spacer"></div><${Pill} tone="purple">${reviews.length}</${Pill}></div>
        <div class="dense"><${DataTable} onRow=${() => navigate("/reviews")} rows=${reviews}
          empty=${html`<${Empty} icon="upload" title="No reviews yet" text="Upload counterparty paper to get a structured deviation report." />`}
          columns=${[
            { key: "id", label: "ID", mono: true, width: "92px" },
            { key: "name", label: "Document", render: (r) => html`<div class="wrapcell"><div class="cell-strong">${r.name}</div><div class="tiny muted">${r.agreementType || "—"} · ${(r.findings || []).length} findings</div></div>` },
            { key: "status", label: "Status", width: "136px", render: (r) => html`<${Pill} tone=${r.status === "Extraction Failed" ? "red" : r.status === "Redline Delivered" ? "green" : "amber"} dot=${true}>${r.status}</${Pill}>` },
          ]} /></div>
      </div>
    </div>`}

    ${tab === "approvals" && html`<div class="col" style="gap:16px">
      ${!mayApprove && html`<div class="banner banner--info"><${Icon} name="lock" size=15 /><span class="tiny">Deviation approvals are for Leads and the Director. Your submissions appear here once actioned.</span></div>`}
      <div class="card card--pad col" style="gap:8px">
        <div class="row"><span class="strong">Deviations awaiting approval</span><div class="spacer"></div><${Pill} tone=${pendingDevs.length ? "amber" : "gray"}>${pendingDevs.length}</${Pill}></div>
        ${pendingDevs.length === 0 && html`<span class="tiny muted">Nothing waiting.</span>`}
        ${pendingDevs.map((x) => html`<div key=${x.id} class="docrow">
          <${Pill} tone=${DevTone[x.risk]}>${x.risk}</${Pill}>
          <div style="flex:1;min-width:0" class="clickable" onClick=${() => navigate("/drafting/" + x.draftId)}>
            <div class="strong tiny">${x.clauseType} — Preferred → ${x.tierTo}</div>
            <div class="tiny muted">${x.draftId} · needs ${x.approvalRequired === "HoD" ? "Director" : "Lead"} · by ${nameOf(x.createdBy)}</div>
          </div>
          ${mayApprove && html`<${Fragment}>
            <${Btn} size="sm" variant="ghost" onClick=${() => { const r = approveDeviation(x.id, viewer.id, "Rejected"); r.ok ? toast("Deviation rejected") : toast(r.error, "error"); }}>Reject</${Btn}>
            <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { const r = approveDeviation(x.id, viewer.id, "Approved"); r.ok ? toast("Deviation approved") : toast(r.error, "error"); }}>Approve</${Btn}>
          </${Fragment}>`}
        </div>`)}
      </div>
      <div class="card card--pad col" style="gap:8px">
        <div class="row"><span class="strong">Clause improvement proposals</span><div class="spacer"></div>
          <${Btn} size="sm" variant="ghost" icon="library" onClick=${() => navigate("/clauses")}>Open the library</${Btn}></div>
        ${suggestions.filter((s) => s.status !== "Published" && s.status !== "Rejected").length === 0 && html`<span class="tiny muted">No proposals in flight — suggest improvements from any clause.</span>`}
        ${suggestions.filter((s) => s.status !== "Published" && s.status !== "Rejected").map((s) => html`<div key=${s.id} class="tiny">
          <b>${(clauseById3(s.clauseId) || {}).type}</b> · ${s.tier} — ${s.reason} <span class="muted">(${s.status}, ${nameOf(s.by)})</span>
        </div>`)}
      </div>
    </div>`}

    ${tab === "templates" && html`<div class="grid grid--2" style="gap:14px">
      ${templates.map((t) => html`<div key=${t.id} class="card card--pad col" style="gap:10px">
        <div class="row"><span class="strong">${t.label}</span><div class="spacer"></div><${Pill} tone="green" dot=${true}>${t.status}</${Pill}><span class="tiny muted">v${t.version}</span></div>
        <div class="tiny muted">${t.agreementType} · ${t.jurisdiction === "Any" ? "All jurisdictions" : t.jurisdiction}</div>
        <${TemplateStructure} tplKey=${t.key} />
      </div>`)}
    </div>`}
  </div>`;
}
// The approved structure, with each section's kind visible (Phase 9).
function TemplateStructure({ tplKey }) {
  const def = TEMPLATE_DEFS.find((t) => t.key === tplKey);
  if (!def) return null;
  return html`<div class="col" style="gap:3px">
    ${def.sections.map((s) => html`<div key=${s.key} class="row tiny" style="gap:8px">
      <span style="flex:1">${s.heading}</span>
      <${SourceBadge} kind=${s.kind === "library" || s.kind === "conditional" ? "library" : s.kind === "generated" ? "generated" : s.kind === "input" ? "user-provided" : "fixed"} small=${true} />
      ${s.kind === "conditional" && html`<span class="tiny muted">if ${s.feature}</span>`}
    </div>`)}
  </div>`;
}

/* ============================================================
   DRAFT WORKSPACE (Phases 13/16/28) — structure | document | intelligence.
   ============================================================ */
function DraftWorkspace({ id }) {
  const viewer = useActiveUser();
  useCollection("drafts3"); useCollection("deviations3"); useCollection("clauses3"); useCollection("matters");
  const d = draftById(id);
  const [selKey, setSelKey] = useState(null);
  const [editText, setEditText] = useState(null); // null = not editing
  const [suggesting, setSuggesting] = useState(false);
  const [sgReason, setSgReason] = useState("");
  const linkedMatterVisible = !d || !d.matterId || filterVisible(viewer, [matterById(d.matterId)].filter(Boolean)).length > 0;
  if (!d || !isLegal(viewer) || !linkedMatterVisible) {
    return html`<div class="page"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/drafting")}>Contract Intelligence</${Btn}>
      <${Empty} icon="lock" title="Not found or no access" /></div>`;
  }
  const sections = d.sections || [];
  const sec = sections.find((s) => s.key === selKey) || sections.find((s) => s.source === "library") || sections[0];
  const secDev = (d.deviations || []).find((x) => x.sectionKey === sec.key && x.status !== "Reverted");
  const clause = sec.clauseId ? clauseById3(sec.clauseId) : null;
  const cv = clause ? (clause.versions || []).find((v) => v.v === sec.clauseVersion) || clauseCurrentVersion(clause) : null;
  const outstanding = draftOutstanding(d);
  const precedent = clause ? retrievePrecedent(viewer, { clauseType: clause.type, counterpartyId: d.counterpartyId, jurisdiction: d.jurisdiction }) : [];
  const mayApproveDev = viewer.rbac === "lead" || viewer.rbac === "head";

  const save = () => {
    const r = editDraftSection(d.id, sec.key, editText, viewer.id);
    if (r.ok) { setEditText(null); toast("Saved" + ((d.deviations || []).some((x) => x.sectionKey === sec.key) ? "" : " — checked against the library")); }
    else toast(r.error, "error");
  };

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:12px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/drafting")}>Contract Intelligence</${Btn}>
    </div>
    <div class="pagehead" style="margin-bottom:14px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px">
          <span class="mono muted">${d.id}</span>
          <${Pill} tone=${DRAFT_TONE[d.status] || "gray"} dot=${true}>${d.status}</${Pill}>
          <span class="jurbadge"><${Icon} name="scale" size=12 />JURISDICTION: ${d.jurisdiction}</span>
          ${d.counterpartyId && html`<${Pill} tone="gray">${counterpartyName(d.counterpartyId)}</${Pill}>`}
          ${d.matterId && html`<button class="facechip" onClick=${() => navigate("/matters/" + d.matterId)}><${Icon} name="folder" size=11 />${d.matterId}</button>`}
          <span class="tiny muted">v${d.version} · template ${d.templateId}</span>
        </div>
        <h1 class="pagehead__title">${d.title}</h1>
      </div>
      <div class="pagehead__actions">
        ${d.status === "Draft" && html`<${Btn} variant="soft" icon="arrowRight" onClick=${() => { setDraftStatus(d.id, "In Review", viewer.id); toast("Submitted for review"); }}>Submit for review</${Btn}>`}
        ${(d.status === "In Review" || d.status === "Changes Required" || d.status === "Draft") && html`<${Btn} variant="primary" icon="checksquare"
          title=${outstanding.length ? outstanding.length + " deviation(s) awaiting approval" : "Approve the final output (named lawyer)"}
          onClick=${() => { const r = setDraftStatus(d.id, "Approved", viewer.id); r.ok ? toast("Final output approved") : toast(r.error, "error"); }}>Approve final</${Btn}>`}
        ${d.status === "Approved" && html`<${Btn} variant="primary" icon="send" onClick=${() => { const r = setDraftStatus(d.id, "Delivered", viewer.id); r.ok ? toast("Released for delivery") : toast(r.error, "error"); }}>Deliver</${Btn}>`}
      </div>
    </div>

    ${outstanding.length > 0 && html`<div class="banner banner--warn" style="margin-bottom:14px">
      <${Icon} name="alertTriangle" size=15 />
      <span class="tiny"><b>${outstanding.length} deviation${outstanding.length === 1 ? "" : "s"} awaiting approval</b> — the draft cannot be approved for delivery until ${outstanding.map((x) => x.clauseType).join(", ")} ${outstanding.length === 1 ? "is" : "are"} signed off.</span>
    </div>`}
    ${d.status === "Approved" && html`<div class="banner banner--info" style="margin-bottom:14px"><${Icon} name="checkcircle" size=15 /><span class="tiny">Approved by <b>${nameOf(d.approvedBy)}</b> · ${fmt.date(d.approvedAt)}. Any further edit reopens review.</span></div>`}

    <div class="draft3">
      <!-- LEFT: structure -->
      <div class="card" style="padding:8px">
        ${sections.map((s) => {
          const dev = (d.deviations || []).find((x) => x.sectionKey === s.key && x.status !== "Reverted");
          return html`<button key=${s.key} class=${cx("draft3__nav", sec.key === s.key && "active")} onClick=${() => { setSelKey(s.key); setEditText(null); }}>
            <div style="flex:1;min-width:0;text-align:left">
              <div class="tiny strong ellipsis">${s.heading}</div>
              <${SourceBadge} kind=${s.source} small=${true} />
            </div>
            ${dev && html`<span class="tag-dot" style=${`background:var(--${dev.status === "Approved" ? "success" : "warning"})`} title=${"Deviation " + dev.status}></span>`}
          </button>`;
        })}
      </div>

      <!-- CENTER: document -->
      <div class="card card--pad col" style="gap:12px;min-width:0">
        <div class="row wrap" style="gap:8px">
          <span class="strong">${sec.heading}</span>
          <${SourceBadge} kind=${sec.source} />
          ${sec.tier && html`<${Pill} tone=${TIER_TONE[sec.tier] || "gray"}>${sec.tier}</${Pill}>`}
          <div class="spacer"></div>
          ${editText == null
            ? html`<${Btn} size="sm" variant="soft" icon="edit" onClick=${() => setEditText(sec.text)}>Edit</${Btn}>`
            : html`<${Fragment}>
                <${Btn} size="sm" variant="ghost" onClick=${() => setEditText(null)}>Cancel</${Btn}>
                <${Btn} size="sm" variant="primary" icon="check" onClick=${save}>Save</${Btn}>
              </${Fragment}>`}
        </div>
        ${sec.source === "missing"
          ? html`<div class="banner banner--warn" style="align-items:flex-start"><${Icon} name="alertTriangle" size=15 /><span class="tiny"><b>Source not found in LegalOS.</b> ${sec.note} Propose the clause in the library — the system will not invent it.</span></div>`
          : editText == null
            ? html`<div class="doc" style="padding:18px 20px;font-size:13px;line-height:1.6;white-space:pre-wrap">${sec.text}</div>`
            : html`<${Textarea} rows=8 value=${editText} onInput=${(e) => setEditText(e.target.value)} style=${{ fontSize: "13px", lineHeight: "1.6" }} />`}
        ${sec.source === "user-edited" && sec.libraryText && html`<div>
          <div class="fpop__lbl" style="margin-bottom:6px">Library position (${sec.tier === "Custom" ? "departed from" : "for comparison"})</div>
          <div class="doc" style="padding:14px 16px;font-size:12.5px;opacity:.85;white-space:pre-wrap">${sec.libraryText}</div>
          <div class="row" style="margin-top:8px"><div class="spacer"></div>
            <${Btn} size="sm" variant="ghost" icon="refresh" onClick=${() => { editDraftSection(d.id, sec.key, sec.libraryText, viewer.id); toast("Reverted to the library position"); }}>Revert to library</${Btn}>
          </div>
        </div>`}
      </div>

      <!-- RIGHT: legal intelligence -->
      <div class="col" style="gap:12px;min-width:0">
        ${clause && cv && html`<div class="card card--pad col" style="gap:8px">
          <div class="row"><span class="strong tiny">Source</span><div class="spacer"></div><${SourceBadge} kind="library" small=${true} /></div>
          <div class="tiny">
            Clause <span class="mono">${clause.id}</span> · <${Pill} tone=${TIER_TONE[sec.tier] || "gray"}>${sec.tier || "Preferred"}</${Pill}> · v${sec.clauseVersion}
            ${cv.effectiveAt && html`<span class="muted"> · approved ${fmt.date(cv.effectiveAt)}</span>`}
          </div>
          <div class="tiny muted">${clause.type} · ${clause.jurisdiction} · risk ${clause.risk} · deviation approval: ${clause.approvalRequired}</div>
          ${cv.guidance && html`<div class="tiny" style="margin-top:4px"><b>Negotiation guidance:</b> ${cv.guidance}</div>`}
          ${cv.notes && html`<div class="tiny muted">${cv.notes}</div>`}
          <button class="tiny" style="color:var(--brand);font-weight:600;text-align:left" onClick=${() => navigate("/clauses")}>Open in the library →</button>
        </div>`}

        ${secDev && html`<div class="card card--pad col" style="gap:8px" data-dev=${secDev.id}>
          <div class="row"><span class="strong tiny">Deviation</span><div class="spacer"></div><${Pill} tone=${DevTone[secDev.risk]}>${secDev.risk}</${Pill}></div>
          <div class="tiny"><b>Preferred → ${secDev.tierTo}</b>${secDev.tierTo === "Custom" ? " (below Fallback)" : ""}</div>
          ${secDev.gap && secDev.gap.changed && html`<div class="tiny muted">
            ${secDev.gap.removed && secDev.gap.removed.length ? "− " + secDev.gap.removed.slice(0, 6).join(", ") : ""}
            ${secDev.gap.added && secDev.gap.added.length ? "  + " + secDev.gap.added.slice(0, 6).join(", ") : ""}
          </div>`}
          <div class="row" style="gap:6px">
            <${Pill} tone=${secDev.status === "Approved" ? "green" : secDev.status === "Rejected" ? "red" : "amber"} dot=${true}>${secDev.status}</${Pill}>
            <span class="tiny muted">needs ${secDev.approvalRequired === "HoD" ? "Director" : secDev.approvalRequired === "Lead" ? "Lead" : "no"} approval</span>
          </div>
          ${secDev.status === "Open" && mayApproveDev && html`<div class="row" style="gap:6px">
            <${Btn} size="sm" variant="ghost" onClick=${() => { const r = approveDeviation(secDev.id, viewer.id, "Rejected"); r.ok ? toast("Rejected — revert or renegotiate") : toast(r.error, "error"); }}>Reject</${Btn}>
            <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { const r = approveDeviation(secDev.id, viewer.id, "Approved"); r.ok ? toast("Deviation approved") : toast(r.error, "error"); }}>Approve deviation</${Btn}>
          </div>`}
          ${secDev.status === "Open" && !mayApproveDev && html`<span class="tiny muted">Waiting on ${secDev.approvalRequired === "HoD" ? "the Director" : "a Lead"}.</span>`}
        </div>`}

        ${clause && html`<div class="card card--pad col" style="gap:8px">
          <div class="row"><span class="strong tiny">Precedent</span><div class="spacer"></div><span class="tiny muted">${precedent.length} source${precedent.length === 1 ? "" : "s"}</span></div>
          ${precedent.length === 0 && html`<span class="tiny muted">Source not found in LegalOS — no prior decisions on ${clause.type}.</span>`}
          ${precedent.map((c, i) => html`<div key=${i} class="docrow clickable" onClick=${() => navigate(c.to)}>
            <${Pill} tone=${c.kind === "MATTER" ? "blue" : c.kind === "REVIEW" ? "purple" : "gray"}>${c.kind}</${Pill}>
            <div style="flex:1;min-width:0">
              <div class="tiny strong ellipsis">${c.id} · ${c.title}</div>
              <div class="tiny muted">${c.why}${c.jurMismatch ? " · ⚠ different jurisdiction" : ""}</div>
            </div>
          </div>`)}
        </div>`}

        ${clause && html`<div class="card card--pad col" style="gap:8px">
          <div class="row"><span class="strong tiny">Improve the library</span></div>
          ${!suggesting
            ? html`<${Btn} size="sm" variant="ghost" icon="sparkles" onClick=${() => setSuggesting(true)}>Suggest a clause improvement</${Btn}>`
            : html`<${Fragment}>
                <${Input} placeholder="Why should the library change?" value=${sgReason} onInput=${(e) => setSgReason(e.target.value)} />
                <div class="row" style="gap:6px"><div class="spacer"></div>
                  <${Btn} size="sm" variant="ghost" onClick=${() => setSuggesting(false)}>Cancel</${Btn}>
                  <${Btn} size="sm" variant="primary" icon="send" onClick=${() => {
                    const r = suggestClauseImprovement(clause.id, { tier: sec.tier === "Custom" ? "Preferred" : (sec.tier || "Preferred"), text: sec.text, reason: sgReason }, viewer.id);
                    r.ok ? toast("Proposed — manager review, then the Director publishes") : toast(r.error, "error");
                    setSuggesting(false); setSgReason("");
                  }}>Propose</${Btn}>
                </div>
              </${Fragment}>`}
          <span class="tiny muted">Proposals never change the library silently — manager review → Director publish.</span>
        </div>`}
      </div>
    </div>
  </div>`;
}

export default function Drafting({ id }) {
  return id ? html`<${DraftWorkspace} id=${id} key=${id} />` : html`<${DraftingHome} />`;
}
