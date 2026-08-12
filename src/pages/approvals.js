// Approvals — multi-level approval engine.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Status, Stepper, Section } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { APPROVALS, nameOf, byId } from "../data.js";

export default function Approvals() {
  const [items, setItems] = useState(APPROVALS);
  const decide = (id, status) => setItems((it) => it.map((a) => a.id === id ? { ...a, status } : a));
  const pending = items.filter((a) => a.status === "pending");
  const decided = items.filter((a) => a.status !== "pending");

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Approvals" sub="Sequential, parallel and conditional approval chains — with delegation and automatic escalation." />
    <${StatStrip} stats=${[
      { value: pending.length, label: "Awaiting decision" },
      { value: items.filter((a) => a.status === "approved").length, label: "Approved this week", trend: "+4", trendDir: "up" },
      { value: items.filter((a) => a.status === "rejected").length, label: "Rejected" },
      { value: "0.9d", label: "Avg. approval time", trend: "-15%", trendDir: "down" },
    ]} />

    <div class="grid" style="grid-template-columns:1fr 340px;align-items:start;margin-top:4px">
      <${Section} title="Awaiting your decision" icon="checksquare" right=${html`<${Pill} tone="amber">${pending.length} pending</${Pill}>`} bodyClass="col">
        ${pending.length === 0 && html`<div class="empty"><${Icon} name="checkcircle" size=36 /><div>All caught up — no approvals pending.</div></div>`}
        ${pending.map((a) => html`<div key=${a.id} class="approval approval--pending" style="margin-bottom:12px">
          <div class="notif__ico" style="width:38px;height:38px;background:var(--warning-bg);color:var(--warning)"><${Icon} name="checksquare" size=17 /></div>
          <div style="flex:1;min-width:0">
            <div class="panel__title">${a.matter}</div>
            <div class="tiny muted">${a.type} · ${a.role}${a.amount ? " · " + fmt.money(a.amount, a.currency) : ""} · requested ${fmt.rel(a.requested)}</div>
          </div>
          <div class="row" style="gap:8px">
            <${Avatar} name=${nameOf(a.requestedBy)} size="sm" />
            <${Btn} variant="danger" size="sm" onClick=${() => decide(a.id, "rejected")}>Reject</${Btn}>
            <${Btn} variant="primary" size="sm" icon="check" onClick=${() => decide(a.id, "approved")}>Approve</${Btn}>
          </div>
        </div>`)}
      </${Section}>

      <${Section} title="Approval chain" icon="gitbranch" sub=${pending[0] ? pending[0].matter : "—"}>
        ${pending[0] ? html`<div class="col" style="gap:18px">
          <div style="overflow-x:auto"><${Stepper} steps=${["Requested", "Legal Review", "Finance", pending[0].role, "Executed"]} current=${3} /></div>
          <div class="banner banner--warn"><${Icon} name="clock" size=17 />Sequential · escalates to GC after 12h SLA breach.</div>
          <div class="col" style="gap:10px">
            ${["Legal Review — approved", "Finance — approved", pending[0].role + " — pending"].map((s, i) => html`<div key=${i} class="row" style="gap:9px">
              <div class="notif__ico" style=${`width:28px;height:28px;background:${i < 2 ? "var(--success-bg)" : "var(--warning-bg)"};color:${i < 2 ? "var(--success)" : "var(--warning)"}`}><${Icon} name=${i < 2 ? "check" : "clock"} size=14 /></div>
              <span class="tiny">${s}</span>
            </div>`)}
          </div>
        </div>` : html`<div class="empty" style="padding:20px"><div>No active chain.</div></div>`}
      </${Section}>
    </div>

    <div style="margin-top:22px">
      <div class="card__title" style="margin-bottom:12px">Recent decisions</div>
      <${DataTable} columns=${[
        { key: "matter", label: "Matter", render: (a) => html`<div class="cell-strong">${a.matter}</div>` },
        { key: "type", label: "Type", render: (a) => html`<${Pill} tone="gray">${a.type}</${Pill}>` },
        { key: "amount", label: "Amount", align: "right", render: (a) => html`<span class="strong">${a.amount ? fmt.money(a.amount, a.currency) : "—"}</span>` },
        { key: "approver", label: "Approver", render: (a) => html`<div class="row" style="gap:8px"><${Avatar} name=${nameOf(a.approver)} size="sm" /><span class="tiny">${a.role}</span></div>` },
        { key: "status", label: "Decision", render: (a) => html`<${Status} value=${a.status === "approved" ? "Approved" : a.status === "rejected" ? "Rejected" : "Pending Approval"} />` },
        { key: "requested", label: "When", render: (a) => html`<span class="tiny muted">${fmt.rel(a.requested)}</span>` },
      ]} rows=${decided} empty=${html`<div class="empty" style="padding:30px">No decisions yet.</div>`} />
    </div>
  </div>`;
}
