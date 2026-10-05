// MODULE 3 — CLAUSE LIBRARY. The source of approved drafting positions.
// Propose → Manager Review → HoD Approval → Published → Superseded/Retired.
// Only PUBLISHED clauses feed assembly and review; versions are never
// overwritten; improvement suggestions route through manager review to the
// Director — the library is never silently rewritten.
import { html, cx, fmt, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Empty, Drawer, Modal, Field, Input, Textarea, Tabs, Segmented } from "../ui.js";
import { PageHead, DataTable } from "../parts.js";
import { nameOf } from "../data.js";
import { navigate } from "../router.js";
import {
  useCollection, clauseById3, clauseCurrentVersion,
  proposeClause, advanceClauseStatus, newClauseVersion, retireClause,
  reviewSuggestion, publishSuggestion,
} from "../store.js";
import {
  CLAUSE_TYPES3, TIERS, TIER_TONE, CLAUSE_FLOW, CLAUSE_GATE, CLAUSE_STATUS_TONE,
  M3_JURISDICTIONS, M3_AGREEMENT_TYPES,
} from "../contracts3.js";
import { useActiveUser, isLegal } from "../rbac.js";
import { toast } from "../toast.js";

const RISKS = ["Low", "Medium", "High"];

function ProposeClauseModal({ onClose, viewer }) {
  const [f, setF] = useState({ type: CLAUSE_TYPES3[0], jurisdiction: "Any", agreementType: "Any", risk: "Medium", approvalRequired: "Lead", Preferred: "", Acceptable: "", Fallback: "", notes: "", guidance: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    const tiers = {};
    TIERS.forEach((t) => { if (f[t].trim()) tiers[t] = f[t].trim(); });
    const r = proposeClause({ ...f, tiers }, viewer.id);
    if (r.ok) { toast(r.id + " proposed — manager review next"); onClose(); } else toast(r.error, "error");
  };
  return html`<${Modal} title="Propose a clause" icon="library" width=${640} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="send" onClick=${submit}>Propose</${Btn}>`}>
    <div class="banner banner--info" style="margin-bottom:12px"><${Icon} name="alertCircle" size=15 /><span class="tiny">Proposed clauses are NOT authoritative until published: Proposed → Manager Review → Director approval → Published.</span></div>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:10px">
      <${Field} label="Clause type *"><select class="select" value=${f.type} onChange=${(e) => set("type", e.target.value)}>${CLAUSE_TYPES3.map((t) => html`<option key=${t}>${t}</option>`)}</select></${Field}>
      <${Field} label="Jurisdiction"><select class="select" value=${f.jurisdiction} onChange=${(e) => set("jurisdiction", e.target.value)}><option>Any</option>${M3_JURISDICTIONS.map((j) => html`<option key=${j}>${j}</option>`)}</select></${Field}>
      <${Field} label="Agreement type"><select class="select" value=${f.agreementType} onChange=${(e) => set("agreementType", e.target.value)}><option>Any</option>${M3_AGREEMENT_TYPES.map((t) => html`<option key=${t}>${t}</option>`)}</select></${Field}>
      <${Field} label="Risk level"><select class="select" value=${f.risk} onChange=${(e) => set("risk", e.target.value)}>${RISKS.map((r) => html`<option key=${r}>${r}</option>`)}</select></${Field}>
      <${Field} label="Deviation approval"><select class="select" value=${f.approvalRequired} onChange=${(e) => set("approvalRequired", e.target.value)}><option>None</option><option>Lead</option><option>HoD</option></select></${Field}>
    </div>
    ${TIERS.map((t) => html`<${Field} key=${t} label=${t + " position" + (t === "Preferred" ? " *" : "")}>
      <${Textarea} rows=2 value=${f[t]} onInput=${(e) => set(t, e.target.value)} placeholder=${t === "Preferred" ? "Our standard position — required" : "Optional " + t.toLowerCase() + " position"} />
    </${Field}>`)}
    <${Field} label="Drafting notes"><${Input} value=${f.notes} onInput=${(e) => set("notes", e.target.value)} placeholder="Why it says what it says; what to watch for" /></${Field}>
    <${Field} label="Negotiation guidance"><${Input} value=${f.guidance} onInput=${(e) => set("guidance", e.target.value)} placeholder="What to concede first; what is non-negotiable" /></${Field}>
  </${Modal}>`;
}

function NewVersionModal({ clause, viewer, onClose }) {
  const cv = clauseCurrentVersion(clause);
  const [f, setF] = useState({ Preferred: (cv.tiers || {}).Preferred || "", Acceptable: (cv.tiers || {}).Acceptable || "", Fallback: (cv.tiers || {}).Fallback || "", changeSummary: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return html`<${Modal} title=${"Publish new version — " + clause.id} icon="library" width=${640} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${() => {
      const tiers = {}; TIERS.forEach((t) => { if (f[t].trim()) tiers[t] = f[t].trim(); });
      const r = newClauseVersion(clause.id, { tiers, changeSummary: f.changeSummary || "Revised position" }, viewer.id);
      if (r.ok) { toast("v" + r.version + " published — v" + clause.currentVersion + " superseded (history kept)"); onClose(); } else toast(r.error, "error");
    }}>Publish v${(clause.versions || []).length + 1}</${Btn}>`}>
    <div class="banner banner--info" style="margin-bottom:12px"><${Icon} name="clock" size=15 /><span class="tiny">The current version is superseded, never overwritten — existing drafts keep pointing at the version they used.</span></div>
    ${TIERS.map((t) => html`<${Field} key=${t} label=${t}><${Textarea} rows=2 value=${f[t]} onInput=${(e) => set(t, e.target.value)} /></${Field}>`)}
    <${Field} label="Change summary *"><${Input} value=${f.changeSummary} onInput=${(e) => set("changeSummary", e.target.value)} placeholder="What changed and why" /></${Field}>
  </${Modal}>`;
}

function ClauseDetail({ id, onClose, viewer }) {
  useCollection("clauses3");
  const suggestions = useCollection("clauseSuggestions").filter((s) => s.clauseId === id);
  const c = clauseById3(id);
  const [tab, setTab] = useState("position");
  const [versioning, setVersioning] = useState(false);
  if (!c) return null;
  const cv = clauseCurrentVersion(c);
  const nexts = CLAUSE_FLOW[c.status] || [];
  const gateOk = (to) => { const g = CLAUSE_GATE[to]; return !g || (g === "lead" ? (viewer.rbac === "lead" || viewer.rbac === "head") : viewer.rbac === "head"); };
  const isHead = viewer.rbac === "head";
  return html`<${Drawer} title=${c.id} width=${620} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Close</${Btn}>
      ${nexts.filter(gateOk).map((to) => html`<${Btn} key=${to} variant=${to === "Published" ? "primary" : "soft"} icon=${to === "Published" ? "checkcircle" : "arrowRight"}
        onClick=${() => { const r = advanceClauseStatus(c.id, to, viewer.id); r.ok ? toast(c.id + " → " + to) : toast(r.error, "error"); }}>${to}</${Btn}>`)}
      ${c.status === "Published" && isHead && html`<${Btn} variant="primary" icon="plus" onClick=${() => setVersioning(true)}>New version</${Btn}>`}`}>
    ${versioning && html`<${NewVersionModal} clause=${c} viewer=${viewer} onClose=${() => setVersioning(false)} />`}
    <div class="col" style="gap:14px;padding:18px">
      <div class="row wrap" style="gap:8px">
        <${Pill} tone=${CLAUSE_STATUS_TONE[c.status]} dot=${true}>${c.status}</${Pill}>
        <${Pill} tone="blue">${c.type}</${Pill}>
        <${Pill} tone="gray">${c.jurisdiction}</${Pill}>
        <${Pill} tone=${c.risk === "High" ? "amber" : "gray"}>risk ${c.risk}</${Pill}>
        <span class="tiny muted">v${c.currentVersion} · deviation approval: ${c.approvalRequired}</span>
      </div>
      ${c.status !== "Published" && html`<div class="banner banner--warn" style="padding:8px 10px"><${Icon} name="alertTriangle" size=14 /><span class="tiny"><b>Not authoritative.</b> Only Published clauses feed drafting and review.</span></div>`}
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "position", label: "Positions", icon: "library" },
        { key: "versions", label: "Versions", icon: "clock", count: (c.versions || []).length },
        { key: "suggestions", label: "Proposals", icon: "sparkles", count: suggestions.filter((s) => s.status !== "Published" && s.status !== "Rejected").length || undefined },
        { key: "audit", label: "Audit", icon: "activity" },
      ]} />
      ${tab === "position" && html`<div class="col" style="gap:12px">
        ${TIERS.filter((t) => (cv.tiers || {})[t]).map((t) => html`<div key=${t}>
          <div class="row" style="margin-bottom:5px"><${Pill} tone=${TIER_TONE[t]}>${t}</${Pill}></div>
          <div class="doc" style="padding:14px 16px;font-size:12.5px;white-space:pre-wrap">${cv.tiers[t]}</div>
        </div>`)}
        ${cv.notes && html`<div class="tiny"><b>Drafting notes:</b> ${cv.notes}</div>`}
        ${cv.guidance && html`<div class="tiny"><b>Negotiation guidance:</b> ${cv.guidance}</div>`}
      </div>`}
      ${tab === "versions" && html`<div class="col" style="gap:8px">
        ${[...(c.versions || [])].reverse().map((v) => html`<div key=${v.v} class="docrow">
          <${Pill} tone=${v.status === "Published" ? "green" : v.status === "Superseded" ? "gray" : "blue"}>v${v.v}</${Pill}>
          <div style="flex:1;min-width:0">
            <div class="tiny strong">${v.changeSummary}</div>
            <div class="tiny muted">${v.status} · ${nameOf(v.author)}${v.approvedBy ? " · approved by " + nameOf(v.approvedBy) : ""}${v.effectiveAt ? " · " + fmt.date(v.effectiveAt) : ""}${v.supersededAt ? " · superseded " + fmt.date(v.supersededAt) : ""}</div>
          </div>
        </div>`)}
      </div>`}
      ${tab === "suggestions" && html`<div class="col" style="gap:8px">
        ${suggestions.length === 0 && html`<span class="tiny muted">No improvement proposals — lawyers suggest changes from the draft workspace.</span>`}
        ${suggestions.map((s) => html`<div key=${s.id} class="card card--pad col" style="gap:6px">
          <div class="row"><${Pill} tone=${s.status === "Published" ? "green" : s.status === "Rejected" ? "red" : "amber"}>${s.status}</${Pill}><div class="spacer"></div><span class="tiny muted">${nameOf(s.by)} · ${fmt.rel(s.at)}</span></div>
          <div class="tiny"><b>${s.tier}:</b> ${s.text.slice(0, 220)}</div>
          <div class="tiny muted">Reason: ${s.reason}</div>
          <div class="row" style="gap:6px">
            ${s.status === "Proposed" && (viewer.rbac === "lead" || viewer.rbac === "head") && html`<${Fragment}>
              <${Btn} size="sm" variant="ghost" onClick=${() => { reviewSuggestion(s.id, "reject", viewer.id); toast("Rejected"); }}>Reject</${Btn}>
              <${Btn} size="sm" variant="soft" icon="arrowRight" onClick=${() => { reviewSuggestion(s.id, "forward", viewer.id); toast("Forwarded to the Director"); }}>Manager review — forward</${Btn}>
            </${Fragment}>`}
            ${s.status === "Manager Reviewed" && isHead && html`<${Btn} size="sm" variant="primary" icon="checkcircle" onClick=${() => { const r = publishSuggestion(s.id, viewer.id); r.ok ? toast("Published as v" + r.version) : toast(r.error, "error"); }}>Publish as new version</${Btn}>`}
          </div>
        </div>`)}
      </div>`}
      ${tab === "audit" && html`<div class="col" style="gap:6px">
        ${[...(c.audit || [])].reverse().map((e, i) => html`<div key=${i} class="tiny"><b>${e.kind}</b>${e.from ? ` ${e.from} → ${e.to}` : ""} ${e.detail || ""} <span class="muted">· ${e.by ? nameOf(e.by) : "System"} · ${fmt.date(e.at)}</span></div>`)}
      </div>`}
    </div>
  </${Drawer}>`;
}

// The primary views the library is worked in — buttons, not a buried dropdown.
const PIPELINE = ["Proposed", "Manager Review", "HoD Approval"];
const VIEWS = [
  { key: "all", label: "All", match: () => true },
  { key: "published", label: "Published", match: (c) => c.status === "Published" },
  { key: "pipeline", label: "Approval pipeline", match: (c) => PIPELINE.includes(c.status) },
  { key: "fallback", label: "Has Fallback", match: (c) => !!(clauseCurrentVersion(c).tiers || {}).Fallback },
  { key: "archived", label: "Superseded / Retired", match: (c) => c.status === "Superseded" || c.status === "Retired" },
];

export default function Clauses() {
  const viewer = useActiveUser();
  const clauses = useCollection("clauses3");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [jur, setJur] = useState("");
  const [view, setView] = useState("all");
  const [open, setOpen] = useState(null);
  const [proposing, setProposing] = useState(false);
  if (!isLegal(viewer)) return html`<div class="page"><${Empty} icon="lock" title="The clause library is internal" /></div>`;

  const activeView = VIEWS.find((v) => v.key === view) || VIEWS[0];
  const rows = clauses.filter((c) =>
    activeView.match(c) &&
    (!q || (c.id + " " + c.type + " " + c.agreementType).toLowerCase().includes(q.toLowerCase())) &&
    (!type || c.type === type) && (!jur || c.jurisdiction === jur));

  // KPI cards double as view switches — the number is the filter.
  const kpi = (viewKey, value, label, tone) => html`<button type="button"
    class=${cx("statkpi", "statkpi--" + tone, "statkpi--click", view === viewKey && "statkpi--on")}
    aria-pressed=${view === viewKey ? "true" : "false"}
    onClick=${() => setView(view === viewKey ? "all" : viewKey)}
    title="Filter the library to these clauses">
    <div class="statkpi__n">${value}</div><div class="statkpi__l">${label}</div>
  </button>`;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Clause Library" sub="Approved, version-controlled positions — the source of truth for every draft and review."
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => setProposing(true)}>Propose clause</${Btn}>`} />
    ${proposing && html`<${ProposeClauseModal} viewer=${viewer} onClose=${() => setProposing(false)} />`}
    ${open && html`<${ClauseDetail} id=${open} viewer=${viewer} onClose=${() => setOpen(null)} />`}

    <div class="statkpis">
      ${kpi("published", clauses.filter((c) => c.status === "Published").length, "Published (authoritative)", "green")}
      ${kpi("pipeline", clauses.filter((c) => PIPELINE.includes(c.status)).length, "In the approval pipeline", "amber")}
      ${kpi("all", [...new Set(clauses.map((c) => c.type))].length, "Clause types covered", "blue")}
      ${kpi("fallback", clauses.filter((c) => (clauseCurrentVersion(c).tiers || {}).Fallback).length, "With a Fallback tier", "purple")}
    </div>

    <div class="row wrap" style="gap:10px;margin-bottom:14px">
      <${Segmented} value=${view} onChange=${setView}
        options=${VIEWS.map((v) => ({ value: v.key, label: v.key === "all" ? `All · ${clauses.length}` : v.label }))} />
    </div>

    <div class="card" style="padding:0">
      <div class="modtoolbar">
        <div class="modtoolbar__search"><${Icon} name="search" size=15 /><input placeholder="Search clauses…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <select class="input input--sm" value=${type} onChange=${(e) => setType(e.target.value)}><option value="">Type: all</option>${CLAUSE_TYPES3.map((t) => html`<option key=${t}>${t}</option>`)}</select>
        <select class="input input--sm" value=${jur} onChange=${(e) => setJur(e.target.value)}><option value="">Jurisdiction: all</option><option>Any</option>${M3_JURISDICTIONS.map((j) => html`<option key=${j}>${j}</option>`)}</select>
      </div>
      <div class="dense"><${DataTable} onRow=${(c) => setOpen(c.id)} rows=${rows}
        empty=${html`<${Empty} icon="library" title="No clauses match" text="Adjust the filters, or propose the first clause." />`}
        columns=${[
          { key: "id", label: "ID", mono: true, width: "92px" },
          { key: "type", label: "Clause", render: (c) => html`<div class="cell-strong">${c.type}</div><div class="tiny muted">${c.agreementType === "Any" ? "All agreements" : c.agreementType}</div>` },
          { key: "jurisdiction", label: "Jurisdiction", width: "110px" },
          { key: "tiers", label: "Tiers", width: "180px", render: (c) => { const t = clauseCurrentVersion(c).tiers || {}; return html`<div class="row wrap" style="gap:4px">${TIERS.filter((x) => t[x]).map((x) => html`<${Pill} key=${x} tone=${TIER_TONE[x]}>${x[0]}</${Pill}>`)}</div>`; } },
          { key: "risk", label: "Risk", width: "80px", render: (c) => html`<${Pill} tone=${c.risk === "High" ? "amber" : c.risk === "Medium" ? "blue" : "gray"}>${c.risk}</${Pill}>` },
          { key: "currentVersion", label: "Ver", width: "52px", render: (c) => html`<span class="tiny mono">v${c.currentVersion}</span>` },
          { key: "status", label: "Status", width: "130px", render: (c) => html`<${Pill} tone=${CLAUSE_STATUS_TONE[c.status]} dot=${true}>${c.status}</${Pill}>` },
          { key: "lastReviewedAt", label: "Reviewed", width: "104px", render: (c) => html`<span class="tiny muted">${c.lastReviewedAt ? fmt.dateShort(c.lastReviewedAt) : "—"}</span>` },
          { key: "createdBy", label: "Owner", width: "58px", render: (c) => html`<${Avatar} name=${nameOf(c.createdBy)} size="sm" />` },
        ]} /></div>
    </div>
  </div>`;
}
