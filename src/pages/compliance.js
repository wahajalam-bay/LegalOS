// Compliance & Governance.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Status, Progress, Section } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { Donut, Gauge } from "../charts.js";
import { COMPLIANCE, nameOf } from "../data.js";

const STATUS_TONE = { Compliant: "green", "At Risk": "amber", "Non-Compliant": "red" };
const scoreTone = (s) => (s >= 85 ? "green" : s >= 70 ? "amber" : "red");

export default function Compliance() {
  const overall = Math.round(COMPLIANCE.reduce((s, c) => s + c.score, 0) / COMPLIANCE.length);
  const dist = [
    { label: "Compliant", value: COMPLIANCE.filter((c) => c.status === "Compliant").length, color: "#22c55e" },
    { label: "At Risk", value: COMPLIANCE.filter((c) => c.status === "At Risk").length, color: "#f59e0b" },
    { label: "Non-Compliant", value: COMPLIANCE.filter((c) => c.status === "Non-Compliant").length, color: "#ef4444" },
  ];
  const upcoming = [...COMPLIANCE].sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview)).slice(0, 5);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Compliance & Governance" sub="Regulatory posture across every region and framework — scored, owned and continuously monitored."
      actions=${html`<${Btn} variant="ghost" icon="download">Audit report</${Btn}><${Btn} variant="primary" icon="plus">New assessment</${Btn}>`} />

    <div class="grid" style="grid-template-columns:280px 1fr;align-items:stretch;margin-bottom:16px">
      <div class="card card--pad col center" style="gap:6px">
        <${Gauge} value=${overall} label="Overall compliance score" tone=${overall >= 85 ? "#22c55e" : "#f59e0b"} size=${180} />
        <div class="row" style="gap:6px"><span class="trend trend--up"><${Icon} name="trendingUp" size=12 /> +2</span><span class="tiny muted">vs. last quarter</span></div>
      </div>
      <div class="grid grid--3" style="align-content:start">
        <div class="card card--pad"><div class="metric__value" style="color:var(--success)">${dist[0].value}</div><div class="metric__label" style="margin-top:6px">Compliant areas</div></div>
        <div class="card card--pad"><div class="metric__value" style="color:var(--warning)">${dist[1].value}</div><div class="metric__label" style="margin-top:6px">At risk</div></div>
        <div class="card card--pad"><div class="metric__value" style="color:var(--danger)">${dist[2].value}</div><div class="metric__label" style="margin-top:6px">Non-compliant</div></div>
        <div style="grid-column:span 3">
          <${Section} title="Status distribution" icon="pie"><${Donut} data=${dist} size=${140} centerValue=${COMPLIANCE.length} centerLabel="Areas" /></${Section}>
        </div>
      </div>
    </div>

    <div class="card__title" style="margin-bottom:12px">Compliance areas</div>
    <div class="grid grid--3">
      ${COMPLIANCE.map((c) => html`<div key=${c.id} class="card card--hover card--pad">
        <div class="row" style="margin-bottom:12px">
          <div class="strong" style="font-size:14px">${c.area}</div>
          <div class="spacer"></div>
          <${Status} value=${c.status} />
        </div>
        <div class="row" style="gap:10px;margin-bottom:6px"><div style="flex:1"><${Progress} value=${c.score} tone=${scoreTone(c.score)} /></div><span class="strong">${c.score}</span></div>
        <div class="row" style="gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <${Avatar} name=${nameOf(c.owner)} size="sm" />
          <span class="tiny muted">${c.region}</span>
          <div class="spacer"></div>
          <span class="tiny muted">Review ${fmt.until(c.nextReview)}</span>
        </div>
      </div>`)}
    </div>

    <div style="height:16px"></div>
    <${Section} title="Upcoming reviews" icon="calendar" bodyClass="col">
      ${upcoming.map((c) => html`<div key=${c.id} class="feed__item" style="align-items:center">
        <div class="notif__ico" style=${`width:32px;height:32px;background:var(--${STATUS_TONE[c.status] === "green" ? "success" : STATUS_TONE[c.status] === "amber" ? "warning" : "danger"}-bg);color:var(--${STATUS_TONE[c.status] === "green" ? "success" : STATUS_TONE[c.status] === "amber" ? "warning" : "danger"})`}><${Icon} name="shield" size=15 /></div>
        <div style="flex:1"><div class="strong tiny">${c.area}</div><div class="tiny muted">${c.region} · owner ${nameOf(c.owner)}</div></div>
        <${Pill} tone=${STATUS_TONE[c.status]}>${c.score}/100</${Pill}>
        <span class="tiny muted" style="width:70px;text-align:right">${fmt.until(c.nextReview)}</span>
      </div>`)}
    </${Section}>
  </div>`;
}
