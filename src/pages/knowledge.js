// Knowledge Base — playbooks, precedents, opinions, SOPs.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Chip, Section, AICard } from "../ui.js";
import { PageHead } from "../parts.js";
import { nameOf } from "../data.js";

const PLAYBOOKS = [
  { title: "Commercial Contracting Playbook", area: "Commercial · fallback positions", updated: "Updated 6d ago", icon: "briefcase" },
  { title: "Data Privacy Playbook", area: "GDPR · PDPL · PDPA", updated: "Updated 3d ago", icon: "shield" },
  { title: "Employment Playbook — GCC", area: "KSA · UAE labor law", updated: "Updated 12d ago", icon: "users" },
  { title: "M&A Diligence Playbook", area: "Corporate · transactions", updated: "Updated 20d ago", icon: "gavel" },
  { title: "Litigation & Disputes Playbook", area: "Pre-action · settlement", updated: "Updated 15d ago", icon: "scale" },
  { title: "Procurement & Vendor Playbook", area: "Sourcing · SLAs · risk", updated: "Updated 9d ago", icon: "clipboard" },
];
const OPINIONS = [
  { title: "Enforceability of 18-month non-compete under UAE law", who: "u8", date: "2 weeks ago" },
  { title: "Cross-border data transfer under Saudi PDPL", who: "u4", date: "1 month ago" },
  { title: "Liability caps in long-term energy PPAs", who: "u3", date: "3 weeks ago" },
  { title: "Board authority for Singapore capital raise", who: "u2", date: "5 days ago" },
];
const SOPS = [
  { title: "How to raise a legal request", cat: "Intake" },
  { title: "Contract approval matrix", cat: "Governance" },
  { title: "Clause fallback positions", cat: "Negotiation" },
  { title: "Signature & execution SOP", cat: "Execution" },
  { title: "Legal hold procedure", cat: "Litigation" },
  { title: "Records retention schedule", cat: "Compliance" },
];

export default function Knowledge() {
  const [q, setQ] = useState("");
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Knowledge Base" sub="Every playbook, precedent, opinion and SOP — searchable in natural language." />

    <div class="card card--pad" style="text-align:center;padding:32px 24px;margin-bottom:8px;background:linear-gradient(135deg,var(--brand-soft),var(--accent-soft))">
      <div class="metric__icon center" style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#0d7a3f,#0891b2);color:#fff;margin:0 auto 14px"><${Icon} name="sparkles" size=24 /></div>
      <div style="font-size:20px;font-weight:750;letter-spacing:-.02em">Ask the knowledge base</div>
      <div class="muted" style="margin:6px 0 16px">342 documents indexed · answers cite their source</div>
      <div class="inputgroup" style="max-width:620px;margin:0 auto"><${Icon} name="search" size=17 /><input class="input" style="height:44px;padding-left:40px" placeholder="What's our standard liability cap for SaaS vendors?" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <div class="row wrap center" style="gap:8px;margin-top:14px">
        ${["Standard SaaS liability cap?", "Non-compete rules in UAE", "Approval matrix for $2M deal", "PDPL data transfer requirements"].map((s) => html`<${Chip} key=${s} onClick=${() => setQ(s)}>${s}</${Chip}>`)}
      </div>
    </div>

    <div style="height:16px"></div>

    <${Section} title="Playbooks" icon="book" sub="Positions, fallbacks and standards by domain">
      <div class="grid grid--3">
        ${PLAYBOOKS.map((p) => html`<div key=${p.title} class="card card--hover card--pad clickable">
          <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand);margin-bottom:12px"><${Icon} name=${p.icon} size=18 /></div>
          <div class="strong" style="font-size:14px;margin-bottom:3px">${p.title}</div>
          <div class="tiny muted">${p.area}</div>
          <div class="tiny muted" style="margin-top:12px">${p.updated}</div>
        </div>`)}
      </div>
    </${Section}>

    <div style="height:16px"></div>

    <div class="grid grid--2">
      <${Section} title="Legal Opinions" icon="gavel" bodyClass="col">
        ${OPINIONS.map((o) => html`<div key=${o.title} class="feed__item clickable" style="align-items:center">
          <div class="notif__ico" style="width:34px;height:34px;background:var(--accent-soft);color:var(--accent-500)"><${Icon} name="fileCheck" size=16 /></div>
          <div style="flex:1"><div class="strong tiny">${o.title}</div><div class="tiny muted">${nameOf(o.who)} · ${o.date}</div></div>
          <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
        </div>`)}
      </${Section}>
      <${Section} title="SOPs & Guides" icon="clipboard">
        <div class="grid grid--2">
          ${SOPS.map((s) => html`<div key=${s.title} class="card card--pad clickable" style="padding:12px">
            <div class="row" style="gap:9px"><${Icon} name="clipboard" size=16 style=${{ color: "var(--text-3)" }} /><div style="min-width:0"><div class="strong tiny" style="line-height:1.3">${s.title}</div><div class="tiny muted">${s.cat}</div></div></div>
          </div>`)}
        </div>
      </${Section}>
    </div>
  </div>`;
}
