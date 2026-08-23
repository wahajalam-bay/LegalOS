// Knowledge Base — playbooks, precedents, opinions, SOPs.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Chip, Section, AICard, Modal, Field, Input } from "../ui.js";
import { PageHead } from "../parts.js";
import { nameOf } from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, proposeConfigChange } from "../store.js";
import { useActiveUser, canConfigure, canProposeConfig } from "../rbac.js";
import { toast } from "../toast.js";

// Editor for a playbook — the Director publishes directly; an AD proposes the
// change for the Director to publish (PRD §2).
function PlaybookEditor({ pb, viewer, onClose }) {
  const [title, setTitle] = useState(pb ? pb.title : "");
  const [area, setArea] = useState(pb ? pb.area : "");
  const publish = canConfigure(viewer);
  const save = () => {
    if (!title.trim()) { toast("A title is required", "error"); return; }
    if (publish) {
      if (pb) { updateItem("playbooks", pb.id, { title: title.trim(), area: area.trim(), updatedAt: nowIso() }); toast("Playbook published"); }
      else { addItem("playbooks", { id: nextId("playbooks", "PB-"), title: title.trim(), area: area.trim(), icon: "book", updatedAt: nowIso() }); toast("Playbook added"); }
    } else {
      proposeConfigChange("playbooks", (pb ? "Edit" : "New") + " playbook — " + title.trim(), { id: pb && pb.id, title: title.trim(), area: area.trim() }, viewer.id);
      toast("Proposed to the Director for publishing", "info");
    }
    onClose();
  };
  return html`<${Modal} title=${pb ? "Edit playbook" : "New playbook"} icon="book" width=${520} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon=${publish ? "check" : "send"} onClick=${save}>${publish ? "Publish" : "Propose to Director"}</${Btn}>`}>
    ${!publish && html`<div class="banner banner--info" style="margin-bottom:12px"><${Icon} name="alertCircle" size=15 /><span class="tiny">You can propose changes; the Director publishes them.</span></div>`}
    <${Field} label="Title *"><${Input} value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="e.g. Commercial Contracting Playbook" /></${Field}>
    <${Field} label="Area / scope"><${Input} value=${area} onInput=${(e) => setArea(e.target.value)} placeholder="e.g. Commercial · fallback positions" /></${Field}>
  </${Modal}>`;
}
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
  const viewer = useActiveUser();
  const playbooks = useCollection("playbooks");
  const [editing, setEditing] = useState(null); // { pb } | { pb: null } for new
  const canManage = canProposeConfig(viewer); // AD proposes, Director publishes
  const relTime = (iso) => (iso ? "Updated " + fmt.rel(iso) : "Standard");
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Knowledge Base" sub="Every playbook, precedent, opinion and SOP — searchable in natural language."
      actions=${canManage ? html`<${Btn} variant="primary" icon="plus" onClick=${() => setEditing({ pb: null })}>${canConfigure(viewer) ? "Add playbook" : "Propose playbook"}</${Btn}>` : null} />
    ${editing && html`<${PlaybookEditor} pb=${editing.pb} viewer=${viewer} onClose=${() => setEditing(null)} />`}

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
        ${playbooks.map((p) => html`<div key=${p.id || p.title} class=${cx("card card--hover card--pad", canManage && "clickable")}
          onClick=${canManage ? () => setEditing({ pb: p }) : null}>
          <div class="row" style="margin-bottom:12px">
            <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name=${p.icon || "book"} size=18 /></div>
            <div class="spacer"></div>
            ${canManage && html`<${Icon} name="edit" size=14 style=${{ color: "var(--text-3)" }} />`}
          </div>
          <div class="strong" style="font-size:14px;margin-bottom:3px">${p.title}</div>
          <div class="tiny muted">${p.area}</div>
          <div class="tiny muted" style="margin-top:12px">${relTime(p.updatedAt)}</div>
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
