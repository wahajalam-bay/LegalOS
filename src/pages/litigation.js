// Litigation & Disputes.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Pill, Status, Drawer, Timeline, AICard, Section } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { Donut, HBars } from "../charts.js";
import { LITIGATION, nameOf } from "../data.js";

export default function Litigation() {
  const [open, setOpen] = useState(null);
  const openCases = LITIGATION.filter((l) => l.status === "Open");
  const totalExposure = LITIGATION.filter((l) => l.status === "Open").reduce((s, l) => s + (l.currency === "USD" ? l.exposure : l.exposure * 0.27), 0);
  const nextH = LITIGATION.filter((l) => l.nextHearing).sort((a, b) => new Date(a.nextHearing) - new Date(b.nextHearing))[0];

  const byStage = ["Discovery", "Mediation", "Tribunal", "Pleadings", "Response"].map((s, i) => ({ label: s, value: LITIGATION.filter((l) => l.stage === s).length, color: ["#0d7a3f", "#10935a", "#27a96d", "#d97706", "#6d28d9"][i] })).filter((x) => x.value);
  const byType = [...new Set(LITIGATION.map((l) => l.type))].map((t) => ({ label: t, value: LITIGATION.filter((l) => l.type === t).length }));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Litigation & Disputes" sub="Track cases, exposure, hearings and outside counsel across every jurisdiction."
      actions=${html`<${Btn} variant="primary" icon="plus">Open case</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: openCases.length, label: "Open cases" },
      { value: fmt.money(totalExposure), label: "Total exposure", trend: "▲", trendDir: "up" },
      { value: nextH ? fmt.until(nextH.nextHearing) : "—", label: "Next hearing" },
      { value: LITIGATION.filter((l) => l.status === "Closed").length, label: "Closed this quarter" },
    ]} />

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <${Section} title="Cases by Stage" icon="pie"><${Donut} data=${byStage} centerValue=${LITIGATION.length} centerLabel="Cases" /></${Section}>
      <${Section} title="Cases by Type" icon="barchart"><${HBars} data=${byType} format=${(v) => v + " case" + (v > 1 ? "s" : "")} /></${Section}>
    </div>

    <${DataTable} onRow=${setOpen} columns=${[
      { key: "id", label: "ID", mono: true, width: "76px" },
      { key: "title", label: "Case", render: (l) => html`<div class="cell-strong">${l.title}</div><div class="tiny muted">${l.type} · ${l.jurisdiction}</div>` },
      { key: "stage", label: "Stage", render: (l) => html`<${Pill} tone="blue">${l.stage}</${Pill}>` },
      { key: "risk", label: "Risk", render: (l) => html`<${Risk} level=${l.risk} />` },
      { key: "exposure", label: "Exposure", align: "right", render: (l) => html`<span class="strong">${fmt.money(l.exposure, l.currency)}</span>` },
      { key: "counsel", label: "Counsel", render: (l) => html`<span class="tiny">${l.counsel}</span>` },
      { key: "lead", label: "Lead", render: (l) => html`<${Avatar} name=${nameOf(l.lead)} size="sm" />` },
      { key: "status", label: "Status", render: (l) => html`<${Status} value=${l.status} />` },
      { key: "nextHearing", label: "Next hearing", render: (l) => html`<span class=${cx("tiny strong", l.nextHearing && new Date(l.nextHearing) - Date.now() < 10 * 86400000 && "risk--high")}>${l.nextHearing ? fmt.until(l.nextHearing) : "—"}</span>` },
    ]} rows=${LITIGATION} />

    ${open && html`<${Drawer} title=${open.id} width=${470} onClose=${() => setOpen(null)}
      footer=${html`<${Btn} variant="ghost" icon="paperclip">Documents</${Btn}><${Btn} variant="primary" icon="calendar">Log hearing</${Btn}>`}>
      <div class="col" style="gap:18px;padding:20px">
        <div>
          <div class="row" style="gap:8px;margin-bottom:8px"><${Pill} tone="blue">${open.stage}</${Pill}><${Status} value=${open.status} /><${Risk} level=${open.risk} /></div>
          <div style="font-size:17px;font-weight:700;line-height:1.3">${open.title}</div>
          <div class="tiny muted" style="margin-top:3px">${open.type} · ${open.jurisdiction}</div>
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
          ${[["Exposure", fmt.moneyFull(open.exposure, open.currency)], ["Outside counsel", open.counsel], ["Lead", nameOf(open.lead)], ["Filed", fmt.date(open.filed)], ["Next hearing", open.nextHearing ? fmt.date(open.nextHearing) : "—"], ["Stage", open.stage]].map(([l, v]) => html`<div key=${l}><div class="tiny muted">${l}</div><div class="strong" style="font-size:13px;margin-top:2px">${v}</div></div>`)}
        </div>
        <${AICard} title="Case summary">A ${open.type.toLowerCase()} matter in ${open.jurisdiction} at the <b>${open.stage}</b> stage. Estimated exposure <b>${fmt.money(open.exposure, open.currency)}</b>. ${open.stage === "Mediation" ? "A settlement window is open — recommend evaluating a structured settlement before the next date." : "Recommend confirming the evidence bundle is complete ahead of the next hearing."}</${AICard}>
        <${Section} title="Timeline" icon="activity" bodyClass="col">
          <${Timeline} items=${[
            { title: "Case filed", meta: fmt.date(open.filed), tone: "gray" },
            { title: "Outside counsel engaged", meta: open.counsel, tone: "" },
            { title: `Entered ${open.stage}`, meta: "Current stage", tone: "amber" },
            { title: "Next hearing", meta: open.nextHearing ? fmt.date(open.nextHearing) : "TBD", tone: "red" },
          ]} />
        </${Section}>
      </div>
    </${Drawer}>`}
  </div>`;
}
