// R1.0 — MODULE 1: ASSISTED TRIAGE  (PRD §3.4)
//
// The legal-side intake screen. For every request the requester raised in plain
// language, the system PROPOSES a legal category, priority, SLA and assignee.
// The triaging lawyer sees the request as submitted, the proposal, similar past
// matters, conflict/sensitivity flags and an escalation check — then accepts in
// one click, or overrides with a reason (which is logged). "In the first
// release, triage will be assisted, not automated."
import { html, cx, fmt, useState, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Avatar, Field, Textarea, Empty } from "../ui.js";
import { navigate } from "../router.js";
import { USERS, byId, entityName } from "../data.js";
import { useActiveUser, canTriage } from "../rbac.js";
import { useCollection, triageProposal, triageContext, triageDecision, TRIAGE_CATEGORIES } from "../store.js";
import { toast } from "../toast.js";

const PRIORITIES = ["Urgent", "High", "Medium", "Low"];
const URG_TONE = { Emergency: "red", "Time-critical": "amber", Important: "blue", Routine: "gray" };
const PRIO_TONE = { Urgent: "red", High: "amber", Medium: "blue", Low: "gray" };
const nameOf = (uid) => (byId(uid) || {}).name || "Unassigned";
const LEGAL_USERS = USERS.filter((u) => u.dept === "Legal");

// Friendly labels for the requester's plain-language Layer-2 answers.
const L2_LABEL = {
  counterparty: "Counterparty", counterpartyType: "Counterparty type", paper: "Whose paper",
  term: "Term", existing: "Existing agreement", linkedContract: "Existing contract",
  changeNature: "Change", effectiveDate: "Effective date", question: "Question",
  decisionDeadline: "Decision deadline", decisionMaker: "Decision-maker", claimNature: "Claim",
  deadlines: "Deadlines", correspondence: "Notice received", jurisdiction: "Jurisdiction",
  regulator: "Regulator", activity: "Activity", assetNature: "Asset", jurisdictions: "Jurisdictions",
};

function Row({ label, children }) {
  return html`<div class="trow"><div class="trow__l">${label}</div><div class="trow__v">${children}</div></div>`;
}

function TriagePanel({ req, viewer }) {
  const proposal = useMemo(() => triageProposal(req), [req && req.id, req && req.status]);
  const ctx = useMemo(() => triageContext(req), [req && req.id]);
  const [mode, setMode] = useState("view"); // view | override
  // The panel is keyed by req.id in the parent, so it remounts per request and
  // this initial draft is always fresh — no reset effect needed.
  const [d, setD] = useState({ category: proposal.category, priority: proposal.priority, owner: proposal.owner, reason: "" });

  const layer2 = req.layer2 || {};
  const changed = d.category !== proposal.category || d.priority !== proposal.priority || d.owner !== proposal.owner;

  const accept = () => {
    const r = triageDecision(req.id, {}, viewer.id);
    if (r.ok) toast(`${req.id} triaged — ${proposal.category}, assigned to ${nameOf(proposal.owner)}`);
    else toast(r.error, "error");
  };
  const saveOverride = () => {
    const r = triageDecision(req.id, { category: d.category, priority: d.priority, owner: d.owner, reason: d.reason }, viewer.id);
    if (r.ok) { toast(`${req.id} triaged with override — logged`); setMode("view"); }
    else toast(r.error, "error");
  };

  return html`<div class="card card--pad col" style="gap:16px">
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-start">
      <div style="min-width:0;flex:1">
        <div class="mono tiny muted">${req.id}${req.channel === "portal" ? " · via requester portal" : ""}</div>
        <div class="strong" style="font-size:16px;margin-top:2px">${req.title}</div>
        <div class="tiny muted" style="margin-top:3px">
          ${req.requesterEmail || nameOf(req.requesterId)} · ${req.department || "—"}${req.entityId ? " · " + entityName(req.entityId) : ""}
        </div>
      </div>
      <${Pill} tone=${URG_TONE[proposal.urgencyBand] || "gray"}>${proposal.urgencyBand}</${Pill}>
    </div>

    ${proposal.escalate && html`<div class="banner banner--warn" style="align-items:flex-start">
      <${Icon} name="alertTriangle" size=17 />
      <div>
        <div class="strong tiny">Escalation — requested date is inside the SLA</div>
        <div class="tiny" style="margin-top:3px;opacity:.9">
          Needed by <b>${fmt.date(proposal.needByDate)}</b>, but the ${proposal.slaDays}-day SLA lands on
          <b>${fmt.date(proposal.slaDueAt)}</b>. This needs approval / a business justification (PRD §3.1).
        </div>
      </div>
    </div>`}

    <!-- AS SUBMITTED (plain language) -->
    <div>
      <div class="tsec">As submitted</div>
      <div class="col" style="gap:2px">
        <${Row} label="Best described as">${req.requesterOption || "—"}</${Row}>
        ${Object.keys(layer2).filter((k) => layer2[k]).map((k) => html`<${Row} key=${k} label=${L2_LABEL[k] || k}>${layer2[k]}</${Row}>`)}
        <${Row} label="Needed by">${req.dueDate ? fmt.date(req.dueDate) : "no date given"}</${Row}>
        <${Row} label="Attachments">${(req.attachments || []).length || "none"}</${Row}>
      </div>
      ${req.businessContext && html`<div class="tctx">${req.businessContext}</div>`}
    </div>

    <!-- SYSTEM PROPOSAL -->
    <div>
      <div class="tsec"><${Icon} name="sparkles" size=13 /> System proposal ${mode === "view" ? "" : "— overriding"}</div>
      ${mode === "view"
        ? html`<div class="tprop">
            <div class="tprop__cell"><div class="tprop__k">Legal category</div><div class="tprop__v">${proposal.category}</div></div>
            <div class="tprop__cell"><div class="tprop__k">Priority</div><div class="tprop__v"><${Pill} tone=${PRIO_TONE[proposal.priority]}>${proposal.priority}</${Pill}></div></div>
            <div class="tprop__cell"><div class="tprop__k">SLA (business days)</div><div class="tprop__v">${proposal.slaDays}d · due ${fmt.dateShort(proposal.slaDueAt)}</div></div>
            <div class="tprop__cell"><div class="tprop__k">Suggested assignee</div><div class="tprop__v row" style="gap:7px"><${Avatar} name=${nameOf(proposal.owner)} size="xs" />${nameOf(proposal.owner)}</div></div>
          </div>`
        : html`<div class="tprop">
            <div class="tprop__cell"><div class="tprop__k">Legal category</div>
              <select class="input input--sm" value=${d.category} onChange=${(e) => setD({ ...d, category: e.target.value })}>
                ${TRIAGE_CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}
              </select></div>
            <div class="tprop__cell"><div class="tprop__k">Priority</div>
              <select class="input input--sm" value=${d.priority} onChange=${(e) => setD({ ...d, priority: e.target.value })}>
                ${PRIORITIES.map((p) => html`<option key=${p}>${p}</option>`)}
              </select></div>
            <div class="tprop__cell"><div class="tprop__k">SLA (business days)</div><div class="tprop__v">${proposal.slaDays}d · auto</div></div>
            <div class="tprop__cell"><div class="tprop__k">Assignee</div>
              <select class="input input--sm" value=${d.owner || ""} onChange=${(e) => setD({ ...d, owner: e.target.value })}>
                ${LEGAL_USERS.map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
              </select></div>
          </div>
          <${Field} label=${"Reason for override" + (changed ? " (required)" : "")} hint="Logged against the request — the override history is what later trains automated triage.">
            <${Textarea} rows=2 placeholder="Why the proposal is being changed…" value=${d.reason} onInput=${(e) => setD({ ...d, reason: e.target.value })} />
          </${Field}>`}
    </div>

    <!-- CONTEXT: similar matters + flags -->
    ${(ctx.similar.length > 0 || ctx.flags.length > 0) && html`<div>
      <div class="tsec">Context</div>
      ${ctx.flags.map((fl, i) => html`<div key=${i} class=${cx("tflag", "tflag--" + fl.tone)}><${Icon} name="alertCircle" size=14 /> ${fl.text}</div>`)}
      ${ctx.similar.length > 0 && html`<div style="margin-top:8px">
        <div class="tiny muted" style="margin-bottom:5px">Similar past work</div>
        ${ctx.similar.map((s) => html`<div key=${s.id} class="tsim" onClick=${() => navigate((s.kind === "matter" ? "/workspace/" : "/requests/") + s.id)}>
          <span class="mono tiny strong">${s.id}</span>
          <span class="tiny" style="flex:1;min-width:0">${s.title}</span>
          <${Pill} tone=${s.status === "Closed" ? "gray" : "blue"}>${s.status}</${Pill}>
        </div>`)}
      </div>`}
    </div>`}

    <!-- ACTIONS -->
    <div class="row" style="gap:8px;padding-top:12px;border-top:1px solid var(--border)">
      ${mode === "view"
        ? html`<${Fragment}>
            <${Btn} variant="ghost" icon="edit" onClick=${() => setMode("override")}>Override…</${Btn}>
            <span class="spacer"></span>
            <${Btn} variant="primary" icon="check" onClick=${accept}>Accept proposal</${Btn}>
          </${Fragment}>`
        : html`<${Fragment}>
            <${Btn} variant="ghost" onClick=${() => setMode("view")}>Cancel</${Btn}>
            <span class="spacer"></span>
            <${Btn} variant="primary" icon="check" disabled=${changed && !d.reason.trim()} onClick=${saveOverride}>
              ${changed ? "Save override" : "Confirm (no change)"}
            </${Btn}>
          </${Fragment}>`}
    </div>
  </div>`;
}

export default function Triage() {
  const requests = useCollection("requests");
  const viewer = useActiveUser();
  const [selId, setSelId] = useState(null);

  const URG_RANK = { Emergency: 0, "Time-critical": 1, Important: 2, Routine: 3 };
  const queue = useMemo(() => (requests || [])
    .filter((r) => r.status === "Triage")
    .sort((a, b) => (URG_RANK[a.urgencyBand] ?? 2) - (URG_RANK[b.urgencyBand] ?? 2)
      || new Date(a.requestDate || a.created) - new Date(b.requestDate || b.created)), [requests]);

  // PRD §7.3 — triage & assignment is a Director / AD-Senior-Manager action.
  // (All hooks run above this gate so the hook order stays invariant.)
  if (!canTriage(viewer)) {
    return html`<div class="page"><${Empty} icon="lock" title="Triage is a lead's queue"
      text="Categorisation and assignment are done by the Director or an AD / Senior Manager. Your assigned work is under My Tasks." /></div>`;
  }

  const current = queue.find((r) => r.id === selId) || queue[0] || null;
  const escalated = queue.filter((r) => { const p = triageProposal(r); return p && p.escalate; }).length;

  return html`<div class="page page--wide">
    <div class="page__head">
      <div>
        <div class="row" style="gap:8px"><h2 class="page__title">Triage</h2><${Pill} tone="purple">Assisted</${Pill}></div>
        <div class="page__sub">System proposes category · priority · SLA · assignee. Accept in one click, or override with a reason — every override is logged.</div>
      </div>
    </div>

    <div class="modkpis">
      <div class="modkpi modkpi--blue"><div class="modkpi__n">${queue.length}</div><div class="modkpi__l">Awaiting triage</div></div>
      <div class="modkpi modkpi--red"><div class="modkpi__n">${escalated}</div><div class="modkpi__l">Escalation flagged</div></div>
    </div>

    ${queue.length === 0
      ? html`<${Empty} icon="check" title="Triage queue is clear" text="New requests raised through the portal land here for categorisation." />`
      : html`<div class="triage">
        <div class="triage__queue">
          ${queue.map((r) => {
            const p = triageProposal(r);
            return html`<button key=${r.id} class=${cx("tqrow", current && current.id === r.id && "active")} onClick=${() => setSelId(r.id)}>
              <div class="row" style="gap:6px">
                <span class="mono tiny strong">${r.id}</span>
                <span class="spacer"></span>
                ${p.escalate && html`<${Icon} name="alertTriangle" size=13 style=${{ color: "var(--danger)" }} />`}
                <${Pill} tone=${URG_TONE[p.urgencyBand] || "gray"}>${p.urgencyBand}</${Pill}>
              </div>
              <div class="tqrow__title">${r.title}</div>
              <div class="tiny muted">${p.category}</div>
            </button>`;
          })}
        </div>
        <div class="triage__panel">
          ${current && html`<${TriagePanel} req=${current} viewer=${viewer} key=${current.id} />`}
        </div>
      </div>`}
  </div>`;
}
