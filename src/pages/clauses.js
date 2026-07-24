// Clause Library + AI clause generator.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Pill, Status, Progress, Drawer, Input, Chip, AICard } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { CLAUSES, nameOf } from "../data.js";

const CLAUSE_TEXT = "Except for the Excluded Claims, each party's aggregate liability arising out of or in connection with this Agreement, whether in contract, tort (including negligence) or otherwise, shall not exceed an amount equal to one hundred percent (100%) of the total fees paid or payable under this Agreement in the twelve (12) months immediately preceding the event giving rise to the claim.";

export default function Clauses() {
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState(null);
  const [prompt, setPrompt] = useState("");
  const cats = ["All", ...new Set(CLAUSES.map((c) => c.category))];
  const mostUsed = [...CLAUSES].sort((a, b) => b.usage - a.usage)[0];
  let rows = CLAUSES.filter((c) => cat === "All" || c.category === cat);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Clause Library" sub="Approved, version-controlled clauses — the building blocks of every agreement." />

    <div class="ai-card" style="margin-bottom:18px"><div class="ai-card__inner">
      <div class="row" style="gap:10px;margin-bottom:12px"><span class="ai-badge"><${Icon} name="sparkles" size=12 /> AI Clause Generator</span></div>
      <div class="row" style="gap:10px">
        <div style="flex:1"><${Input} placeholder="Describe the clause you need — e.g. 'mutual indemnity capped at 2× fees, carve-out for IP'" value=${prompt} onInput=${(e) => setPrompt(e.target.value)} /></div>
        <${Btn} variant="gradient" icon="sparkles">Generate</${Btn}>
      </div>
      <div class="row wrap" style="gap:8px;margin-top:12px">
        ${["Arbitration", "Confidentiality", "Force Majeure", "Data Processing", "Non-Compete"].map((s) => html`<${Chip} key=${s} icon="plus" onClick=${() => setPrompt(s)}>${s}</${Chip}>`)}
      </div>
    </div></div>

    <${StatStrip} stats=${[
      { value: CLAUSES.length, label: "Clauses" },
      { value: CLAUSES.filter((c) => c.status === "Approved").length, label: "Approved" },
      { value: CLAUSES.filter((c) => c.status === "In Review").length, label: "In review" },
      { value: mostUsed.title, label: "Most used" },
    ]} />

    <div class="row wrap" style="gap:8px;margin-bottom:16px">
      ${cats.map((c) => html`<${Chip} key=${c} active=${cat === c} onClick=${() => setCat(c)}>${c}</${Chip}>`)}
    </div>

    <${DataTable} onRow=${setOpen} columns=${[
      { key: "id", label: "ID", mono: true, width: "72px" },
      { key: "title", label: "Clause", render: (c) => html`<div class="cell-strong">${c.title}</div><div class="tiny muted">${c.category}</div>` },
      { key: "jurisdiction", label: "Jurisdiction" },
      { key: "risk", label: "Risk", render: (c) => html`<${Risk} level=${c.risk} />` },
      { key: "usage", label: "Usage", width: "150px", render: (c) => html`<div class="row" style="gap:8px"><div style="flex:1"><${Progress} value=${c.usage} max=${350} /></div><span class="tiny muted" style="width:34px">${c.usage}</span></div>` },
      { key: "owner", label: "Owner", render: (c) => html`<${Avatar} name=${nameOf(c.owner)} size="sm" />` },
      { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` },
      { key: "updated", label: "Updated", render: (c) => html`<span class="tiny muted">${fmt.rel(c.updated)}</span>` },
    ]} rows=${rows} />

    ${open && html`<${Drawer} title=${open.id} width=${480} onClose=${() => setOpen(null)}
      footer=${html`<${Btn} variant="ghost" icon="copy">Duplicate</${Btn}><${Btn} variant="primary" icon="plus">Insert into contract</${Btn}>`}>
      <div class="col" style="gap:16px;padding:20px">
        <div>
          <div class="row" style="gap:8px;margin-bottom:8px"><${Pill} tone="blue">${open.category}</${Pill}><${Status} value=${open.status} /><${Risk} level=${open.risk} /></div>
          <div style="font-size:17px;font-weight:700">${open.title}</div>
          <div class="tiny muted" style="margin-top:2px">${open.jurisdiction} · used ${open.usage} times · owner ${nameOf(open.owner)}</div>
        </div>
        <div class="doc" style="padding:20px 22px;font-size:13px">${CLAUSE_TEXT}</div>
        <${AICard} title="Generate a variant"><b>Stricter:</b> lower the cap to 0.5× with no supercap. <b>Looser:</b> raise to 2× fees with a data-breach carve-out. Tell me which and I'll draft it.</${AICard}>
      </div>
    </${Drawer}>`}
  </div>`;
}
