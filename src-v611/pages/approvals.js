// APPROVALS — every approval in the system, one tab, end to end.
//
// Four queues, each wired to its real engine (nothing is display-only):
//   1. Requests at the Approval gate     → approve = advanceRequestStage (value-gated)
//   2. Contract-draft deviations          → approveDeviation (below-Fallback ⇒ Director)
//   3. Clause library pipeline            → advanceClauseStatus / publishSuggestion
//   4. Config proposals (SLA / playbooks) → publishConfigProposal (Director)
// Everything is scoped by the viewer's authority and links back to its record.
import { html, cx, fmt, useState, useEffect, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Avatar, Empty, Tabs } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { api } from "../api.js";
import { nameOf, byId } from "../data.js";
import {
  useCollection, personName,
  advanceRequestStage, approveDeviation, draftById,
  clauseById3, advanceClauseStatus, reviewSuggestion, publishSuggestion,
  publishConfigProposal, resolveConfigProposal,
} from "../store.js";
import { CLAUSE_GATE, CLAUSE_STATUS_TONE } from "../contracts3.js";
import { useActiveUser, isLegal, filterVisible, canApprove, canApproveValue, approvalLimitFor } from "../rbac.js";
import { toast } from "../toast.js";

const DevTone = { Low: "gray", Medium: "blue", High: "amber", Critical: "red" };

/* Compact embedded panel — ALL approvals, rendered inside the merged Legal
   Requests page (no separate tab). Same queues, same engines, condensed rows. */
export function ApprovalsInline({ viewer, requests }) {
  const deviations = useCollection("deviations3");
  const clauses = useCollection("clauses3");
  const suggestions = useCollection("clauseSuggestions");
  const proposals = useCollection("configProposals");
  const isHead = viewer.rbac === "head";
  const isLead = viewer.rbac === "lead" || isHead;

  const reqQueue = !canApprove(viewer) ? [] : filterVisible(viewer, requests)
    .filter((r) => (r.stage === "Approval" || r.status === "Pending Approval") && !["Closed", "Delivered"].includes(r.status))
    .filter((r) => isHead || (byId(r.owner) || {}).legalTeam === viewer.legalTeam)
    .sort((a, b) => (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0));
  const devQueue = isLead ? deviations.filter((x) => x.status === "Open") : [];
  const clauseQueue = isLead ? clauses.filter((c) => ["Proposed", "Manager Review", "HoD Approval"].includes(c.status)) : [];
  const sgQueue = isLead ? suggestions.filter((s) => s.status === "Proposed" || s.status === "Manager Reviewed") : [];
  const cfgQueue = isHead ? (proposals || []).filter((p) => p.status === "proposed") : [];
  /* Deletions are decided on the Approvals page, which loads them; this inline
     widget summarises the four queues it actually renders. Counting a fifth it
     has no data for is what crashed every page that embeds it. */
  const total = reqQueue.length + devQueue.length + clauseQueue.length + sgQueue.length + cfgQueue.length;
  if (!total) return null;

  return html`<div class="card myapprovals" style="padding:0;margin-bottom:16px;border-color:color-mix(in srgb, var(--brand) 30%, var(--border))">
    <div class="row" style="padding:14px 16px 8px;align-items:baseline">
      <span class="panel__title">Awaiting my approval</span>
      <span class="tiny muted" style="margin-left:8px">— every sign-off routed to your authority: requests, deviations, the clause library and configuration</span>
      <span class="spacer"></span><${Pill} tone="amber">${total}</${Pill}>
    </div>
    <div class="col" style="gap:2px;padding:0 10px 12px">
      ${reqQueue.map((r) => {
        const value = Number(r.value || 0);
        const may = canApproveValue(viewer, value);
        return html`<div key=${r.id} class="docrow">
          <${Pill} tone="blue">REQUEST</${Pill}>
          <div style="flex:1;min-width:0" class="clickable" onClick=${() => navigate("/workspace/" + r.id)}>
            <div class="strong tiny ellipsis">${r.id} — ${r.title}</div>
            <div class="tiny muted">owner ${personName(r.owner)}${value ? " · " + fmt.money(value, r.currency) : ""}${r.escalated ? " · ESCALATED" : ""}</div>
          </div>
          ${!may && html`<${Pill} tone="amber">Director only</${Pill}>`}
          ${may && html`<${Btn} size="sm" variant="primary" icon="checksquare" onClick=${() => { const res = advanceRequestStage(r.id, viewer.id); res.ok ? toast(r.id + " approved → " + res.stage) : toast(res.error, "error"); }}>Approve</${Btn}>`}
        </div>`;
      })}
      ${devQueue.map((x) => {
        const may = x.approvalRequired === "HoD" ? isHead : isLead;
        return html`<div key=${x.id} class="docrow">
          <${Pill} tone=${DevTone[x.risk]}>DEVIATION</${Pill}>
          <div style="flex:1;min-width:0" class="clickable" onClick=${() => navigate("/drafting/" + x.draftId)}>
            <div class="strong tiny ellipsis">${x.clauseType} — Preferred → ${x.tierTo}</div>
            <div class="tiny muted">${x.draftId} · ${x.risk} risk · needs ${x.approvalRequired === "HoD" ? "Director" : "Lead"}</div>
          </div>
          ${may && html`<${Fragment}>
            <${Btn} size="sm" variant="ghost" onClick=${() => { const r2 = approveDeviation(x.id, viewer.id, "Rejected"); r2.ok ? toast("Rejected") : toast(r2.error, "error"); }}>Reject</${Btn}>
            <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { const r2 = approveDeviation(x.id, viewer.id, "Approved"); r2.ok ? toast("Approved") : toast(r2.error, "error"); }}>Approve</${Btn}>
          </${Fragment}>`}
        </div>`;
      })}
      ${clauseQueue.map((c) => {
        const next = c.status === "Proposed" ? "Manager Review" : c.status === "Manager Review" ? "HoD Approval" : "Published";
        const gateOk = CLAUSE_GATE[next] === "head" ? isHead : isLead;
        return html`<div key=${c.id} class="docrow">
          <${Pill} tone="purple">CLAUSE</${Pill}>
          <div style="flex:1;min-width:0" class="clickable" onClick=${() => navigate("/clauses")}>
            <div class="strong tiny ellipsis">${c.id} — ${c.type} (${c.status})</div>
            <div class="tiny muted">proposed by ${nameOf(c.createdBy)}</div>
          </div>
          ${gateOk && html`<${Btn} size="sm" variant=${next === "Published" ? "primary" : "soft"} icon="arrowRight"
            onClick=${() => { const r2 = advanceClauseStatus(c.id, next, viewer.id); r2.ok ? toast(c.id + " → " + next) : toast(r2.error, "error"); }}>${next}</${Btn}>`}
        </div>`;
      })}
      ${sgQueue.map((s) => {
        const c = clauseById3(s.clauseId) || {};
        return html`<div key=${s.id} class="docrow">
          <${Pill} tone="purple">CLAUSE</${Pill}>
          <div style="flex:1;min-width:0">
            <div class="strong tiny ellipsis">Improvement — ${c.type} (${s.tier})</div>
            <div class="tiny muted">${s.reason} · ${nameOf(s.by)} · ${s.status}</div>
          </div>
          ${s.status === "Proposed" && isLead && html`<${Btn} size="sm" variant="soft" icon="arrowRight" onClick=${() => { reviewSuggestion(s.id, "forward", viewer.id); toast("Forwarded to the Director"); }}>Forward</${Btn}>`}
          ${s.status === "Manager Reviewed" && isHead && html`<${Btn} size="sm" variant="primary" icon="checkcircle" onClick=${() => { const r2 = publishSuggestion(s.id, viewer.id); r2.ok ? toast("Published as v" + r2.version) : toast(r2.error, "error"); }}>Publish</${Btn}>`}
        </div>`;
      })}
      ${cfgQueue.map((p) => html`<div key=${p.id} class="docrow">
        <${Pill} tone="blue">CONFIG</${Pill}>
        <div style="flex:1;min-width:0">
          <div class="strong tiny ellipsis">${p.summary}</div>
          <div class="tiny muted">${p.kind} · proposed by ${nameOf(p.by)} · ${fmt.rel(p.at)}</div>
        </div>
        <${Btn} size="sm" variant="ghost" onClick=${() => { resolveConfigProposal(p.id, "dismissed", viewer.id); toast("Dismissed"); }}>Dismiss</${Btn}>
        <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { const r2 = publishConfigProposal(p.id, viewer.id); r2.ok ? toast("Published") : toast(r2.error, "error"); }}>Publish</${Btn}>
      </div>`)}
    </div>
  </div>`;
}

export default function Approvals() {
  /* 5) DELETIONS. A record leaves a register only when the head of the team
        that owns its module approves. The server says which of these THIS
        reader may decide -- it will not let you approve your own request --
        so the button follows that rather than guessing from the role. */
  const [dels, setDels] = useState([]);
  const [delNonce, setDelNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.litigation.deletions("?status=Pending").then(
      (d) => { if (live) setDels(d.requests || []); },
      () => { if (live) setDels([]); });
    return () => { live = false; };
  }, [delNonce]);

  const viewer = useActiveUser();
  const requests = useCollection("requests");
  const deviations = useCollection("deviations3");
  const clauses = useCollection("clauses3");
  const suggestions = useCollection("clauseSuggestions");
  const proposals = useCollection("configProposals");
  const [tab, setTab] = useState("requests");
  if (!isLegal(viewer)) return html`<div class="page"><${Empty} icon="lock" title="Approvals are internal" /></div>`;

  const isHead = viewer.rbac === "head";
  const isLead = viewer.rbac === "lead" || isHead;

  // 1) Requests at the Approval gate — the approver's queue (team-scoped for
  //    leads, department-wide for the Director), escalated first.
  const reqQueue = filterVisible(viewer, requests)
    .filter((r) => (r.stage === "Approval" || r.status === "Pending Approval") && !["Closed", "Delivered"].includes(r.status))
    .filter((r) => isHead || (byId(r.owner) || {}).legalTeam === viewer.legalTeam)
    .sort((a, b) => (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0));

  // 2) Contract-draft deviations awaiting approval.
  const devQueue = deviations.filter((x) => x.status === "Open");

  // 3) Clause pipeline: clauses moving toward publication + improvement proposals.
  const clauseQueue = clauses.filter((c) => ["Proposed", "Manager Review", "HoD Approval"].includes(c.status));
  const sgQueue = suggestions.filter((s) => s.status === "Proposed" || s.status === "Manager Reviewed");

  // 4) Config proposals (SLA cells, playbooks) awaiting the Director.
  const cfgQueue = (proposals || []).filter((p) => p.status === "proposed");

  const total = reqQueue.length + devQueue.length + clauseQueue.length + sgQueue.length + cfgQueue.length;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Approvals" sub="Everything waiting on a sign-off — requests, deviations, the clause library and configuration — routed by authority." />

    <${StatStrip} stats=${[
      { value: reqQueue.length, label: "Requests at the gate", tone: "amber" },
      { value: devQueue.length, label: "Draft deviations", tone: "red" },
      { value: clauseQueue.length + sgQueue.length, label: "Clause pipeline", tone: "purple" },
      { value: cfgQueue.length, label: "Config proposals", tone: "blue" },
      { value: dels.length, label: "Deletions to decide", tone: "red" },
      { value: total, label: "Total awaiting action", tone: "green" },
    ]} />

    <div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "requests", label: "Requests", icon: "inbox", count: reqQueue.length || undefined },
        { key: "deviations", label: "Deviations", icon: "alertTriangle", count: devQueue.length || undefined },
        { key: "clauses", label: "Clause library", icon: "library", count: (clauseQueue.length + sgQueue.length) || undefined },
        { key: "config", label: "Configuration", icon: "settings", count: cfgQueue.length || undefined },
        { key: "deletions", label: "Deletions", icon: "alertTriangle", count: dels.length || undefined },
      ]} />
    </div></div>

    ${tab === "requests" && html`<div class="col" style="gap:10px">
      ${reqQueue.length === 0 && html`<${Empty} icon="checkcircle" title="No requests waiting" text="Work at the Approval stage lands here for sign-off." />`}
      ${reqQueue.map((r) => {
        const value = Number(r.value || 0);
        const may = canApproveValue(viewer, value);
        return html`<div key=${r.id} class="card card--pad row wrap" style="gap:12px;align-items:center">
          <span class="mono tiny">${r.id}</span>
          <div style="flex:1;min-width:200px" class="clickable" onClick=${() => navigate("/workspace/" + r.id)}>
            <div class="strong tiny">${r.title}</div>
            <div class="tiny muted">${r.department || r.dept || "—"} · owner ${personName(r.owner)}${value ? " · " + fmt.money(value, r.currency) : ""}</div>
          </div>
          ${r.escalated && html`<${Pill} tone="red" dot=${true}>Escalated</${Pill}>`}
          ${!may && canApprove(viewer) && html`<${Pill} tone="amber">above your ${fmt.money(approvalLimitFor(viewer), r.currency)} threshold</${Pill}>`}
          <${Btn} size="sm" variant="ghost" icon="workflow" onClick=${() => navigate("/workspace/" + r.id)}>Review</${Btn}>
          ${may && html`<${Btn} size="sm" variant="primary" icon="checksquare" onClick=${() => {
            const res = advanceRequestStage(r.id, viewer.id);
            res.ok ? toast(r.id + " approved → " + res.stage) : toast(res.error, "error");
          }}>Approve</${Btn}>`}
        </div>`;
      })}
    </div>`}

    ${tab === "deletions" && html`<div class="col" style="gap:10px">
      ${dels.length === 0 && html`<${Empty} icon="checkcircle" title="No deletions waiting"
        text="A record leaves a register only once the head of its team approves. Requests land here." />`}
      ${dels.map((d) => html`<div key=${d.id} class="card card--pad col" style="gap:10px">
        <div class="row wrap" style="gap:12px;align-items:center">
          <span class="mono tiny">${d.recordId}</span>
          <div style="flex:1;min-width:200px">
            <div class="strong tiny">${d.recordLabel}</div>
            <div class="tiny muted">${d.kind} · ${d.team} · asked by ${(d.requestedBy && d.requestedBy.name) || "—"}${d.requestedAt ? " on " + fmt.date(d.requestedAt) : ""}</div>
          </div>
          ${d.mine && html`<${Pill} tone="gray">your request</${Pill}>`}
          ${!d.canDecide && !d.mine && html`<${Pill} tone="amber">the head of ${d.team} decides this</${Pill}>`}
        </div>
        <div class="tiny" style="background:var(--surface-2);border-radius:var(--r-sm);padding:8px 10px">
          <span class="muted">Reason given:</span> ${d.reason}
        </div>
        ${d.canDecide && html`<div class="row" style="gap:8px">
          <div class="spacer"></div>
          <${Btn} size="sm" variant="ghost" icon="x" onClick=${async () => {
    const note = window.prompt("Why is this being refused? The reason stays on the record.");
    if (note == null) return;
    if (!note.trim()) { toast("A reason is required to refuse.", "error"); return; }
    try { await api.litigation.decideDeletion(d.id, false, note.trim()); toast("Refused. The record stays."); setDelNonce((n) => n + 1); }
    catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error"); }
  }}>Refuse</${Btn}>
          <${Btn} size="sm" variant="primary" icon="checksquare" onClick=${async () => {
    try {
      await api.litigation.decideDeletion(d.id, true, "");
      toast("Approved. " + d.recordLabel + " has left the active register.");
      setDelNonce((n) => n + 1);
    } catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error"); }
  }}>Approve deletion</${Btn}>
        </div>`}
        ${d.mine && html`<div class="tiny muted">You raised this, so somebody else has to decide it.</div>`}
      </div>`)}
    </div>`}

    ${tab === "deviations" && html`<div class="col" style="gap:10px">
      ${devQueue.length === 0 && html`<${Empty} icon="checkcircle" title="No deviations waiting" text="Edits away from the clause library queue here for approval." />`}
      ${devQueue.map((x) => {
        const d = draftById(x.draftId);
        const may = x.approvalRequired === "HoD" ? isHead : isLead;
        return html`<div key=${x.id} class="card card--pad row wrap" style="gap:12px;align-items:center">
          <${Pill} tone=${DevTone[x.risk]}>${x.risk}</${Pill}>
          <div style="flex:1;min-width:200px" class="clickable" onClick=${() => navigate("/drafting/" + x.draftId)}>
            <div class="strong tiny">${x.clauseType} — Preferred → ${x.tierTo}${x.tierTo === "Custom" ? " (below Fallback)" : ""}</div>
            <div class="tiny muted">${x.draftId}${d ? " · " + d.title : ""} · by ${nameOf(x.createdBy)} · needs ${x.approvalRequired === "HoD" ? "the Director" : "a Lead"}</div>
          </div>
          <${Btn} size="sm" variant="ghost" onClick=${() => navigate("/drafting/" + x.draftId)}>Open draft</${Btn}>
          ${may && html`<${Fragment}>
            <${Btn} size="sm" variant="ghost" onClick=${() => { const res = approveDeviation(x.id, viewer.id, "Rejected"); res.ok ? toast("Rejected") : toast(res.error, "error"); }}>Reject</${Btn}>
            <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { const res = approveDeviation(x.id, viewer.id, "Approved"); res.ok ? toast("Deviation approved") : toast(res.error, "error"); }}>Approve</${Btn}>
          </${Fragment}>`}
        </div>`;
      })}
    </div>`}

    ${tab === "clauses" && html`<div class="col" style="gap:10px">
      ${clauseQueue.length === 0 && sgQueue.length === 0 && html`<${Empty} icon="checkcircle" title="Clause pipeline is clear" text="Proposed clauses and improvement suggestions queue here on their way to publication." />`}
      ${clauseQueue.map((c) => {
        const next = c.status === "Proposed" ? "Manager Review" : c.status === "Manager Review" ? "HoD Approval" : "Published";
        const gateOk = CLAUSE_GATE[next] === "head" ? isHead : isLead;
        return html`<div key=${c.id} class="card card--pad row wrap" style="gap:12px;align-items:center">
          <span class="mono tiny">${c.id}</span>
          <${Pill} tone=${CLAUSE_STATUS_TONE[c.status]} dot=${true}>${c.status}</${Pill}>
          <div style="flex:1;min-width:180px" class="clickable" onClick=${() => navigate("/clauses")}>
            <div class="strong tiny">${c.type}</div>
            <div class="tiny muted">${c.jurisdiction} · proposed by ${nameOf(c.createdBy)}</div>
          </div>
          ${gateOk && html`<${Btn} size="sm" variant=${next === "Published" ? "primary" : "soft"} icon=${next === "Published" ? "checkcircle" : "arrowRight"}
            onClick=${() => { const res = advanceClauseStatus(c.id, next, viewer.id); res.ok ? toast(c.id + " → " + next) : toast(res.error, "error"); }}>${next}</${Btn}>`}
        </div>`;
      })}
      ${sgQueue.map((s) => {
        const c = clauseById3(s.clauseId) || {};
        return html`<div key=${s.id} class="card card--pad row wrap" style="gap:12px;align-items:center">
          <${Pill} tone="purple">${s.status}</${Pill}>
          <div style="flex:1;min-width:180px">
            <div class="strong tiny">Improvement — ${c.type} (${s.tier})</div>
            <div class="tiny muted">${s.reason} · ${nameOf(s.by)}</div>
          </div>
          ${s.status === "Proposed" && isLead && html`<${Fragment}>
            <${Btn} size="sm" variant="ghost" onClick=${() => { reviewSuggestion(s.id, "reject", viewer.id); toast("Rejected"); }}>Reject</${Btn}>
            <${Btn} size="sm" variant="soft" icon="arrowRight" onClick=${() => { reviewSuggestion(s.id, "forward", viewer.id); toast("Forwarded to the Director"); }}>Forward</${Btn}>
          </${Fragment}>`}
          ${s.status === "Manager Reviewed" && isHead && html`<${Btn} size="sm" variant="primary" icon="checkcircle"
            onClick=${() => { const res = publishSuggestion(s.id, viewer.id); res.ok ? toast("Published as v" + res.version) : toast(res.error, "error"); }}>Publish</${Btn}>`}
        </div>`;
      })}
    </div>`}

    ${tab === "config" && html`<div class="col" style="gap:10px">
      ${cfgQueue.length === 0 && html`<${Empty} icon="checkcircle" title="No configuration proposals" text="SLA and playbook changes proposed by ADs land here for the Director to publish." />`}
      ${!isHead && cfgQueue.length > 0 && html`<div class="banner banner--info"><${Icon} name="lock" size=15 /><span class="tiny">Configuration is published by the Director; your proposals appear here while they wait.</span></div>`}
      ${cfgQueue.map((p) => html`<div key=${p.id} class="card card--pad row wrap" style="gap:12px;align-items:center">
        <${Pill} tone="blue">${p.kind}</${Pill}>
        <div style="flex:1;min-width:180px">
          <div class="strong tiny">${p.summary}</div>
          <div class="tiny muted">proposed by ${nameOf(p.by)} · ${fmt.rel(p.at)}</div>
        </div>
        ${isHead && html`<${Fragment}>
          <${Btn} size="sm" variant="ghost" onClick=${() => { resolveConfigProposal(p.id, "dismissed", viewer.id); toast("Dismissed"); }}>Dismiss</${Btn}>
          <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { const res = publishConfigProposal(p.id, viewer.id); res.ok ? toast("Published") : toast(res.error, "error"); }}>Publish</${Btn}>
        </${Fragment}>`}
      </div>`)}
    </div>`}
  </div>`;
}
