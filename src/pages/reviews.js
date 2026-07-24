// Reviews — AI-assisted contract review queue + overlap detection (Feature 3).
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Risk, Pill, Status, Tabs, Drawer, AICard } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { REVIEWS, nameOf } from "../data.js";
import { navigate } from "../router.js";
import { CategoryChips, CategoryPill, TagChips, matchCategories, companyName } from "../shared.js";
import { computeOverlaps, reviewOverlapMap } from "../overlaps.js";

const ISSUES = [
  { t: "Liability cap set at 0.5× fees — below playbook standard (1×).", r: "high" },
  { t: "Cross-border data transfer safeguards underspecified (no SCCs referenced).", r: "high" },
  { t: "Auto-renewal with 60-day opt-out — exposure noted.", r: "medium" },
  { t: "Missing Force Majeure and Anti-Bribery clauses.", r: "medium" },
];

const KIND_ICON = { review: "checkcircle", matter: "folder", negotiation: "gitbranch" };

export default function Reviews() {
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(null);
  const [cats, setCats] = useState([]);
  const toggleCat = (c) => setCats((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const overdue = (r) => new Date(r.sla) < Date.now() && r.status === "In Review";

  const ovMap = reviewOverlapMap();
  const overlaps = computeOverlaps();

  const tabs = [
    { key: "all", label: "All", count: REVIEWS.length },
    { key: "In Review", label: "In Review", count: REVIEWS.filter((r) => r.status === "In Review").length },
    { key: "Completed", label: "Completed", count: REVIEWS.filter((r) => r.status === "Completed").length },
  ];
  const rows = (tab === "all" ? REVIEWS : REVIEWS.filter((r) => r.status === tab)).filter((r) => matchCategories(r, cats));
  const openOv = open ? (ovMap[open.id] || []) : [];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Reviews" sub="AI reads every agreement first — extracting terms, scoring risk and flagging gaps before a lawyer opens it."
      actions=${html`<${Btn} variant="primary" icon="scan">Upload for review</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: REVIEWS.filter((r) => r.status === "In Review").length, label: "In review" },
      { value: REVIEWS.filter(overdue).length, label: "Breaching SLA", trend: "!", trendDir: "up" },
      { value: "1.8d", label: "Avg. review time", trend: "-22%", trendDir: "down" },
      { value: REVIEWS.filter((r) => r.status === "Completed").length, label: "Completed this week" },
      { value: overlaps.length, label: "Overlaps detected", trend: overlaps.length ? "▲" : undefined, trendDir: "up" },
    ]} />

    ${overlaps.length ? html`<div style="margin-bottom:16px"><${AICard} title="Review overlaps detected">
      I found <b>${overlaps.length} compan${overlaps.length === 1 ? "y" : "ies"}</b> with multiple open items running in parallel: ${overlaps.map((o, i) => html`<span key=${o.companyId}>${i ? ", " : ""}<b>${companyName(o.companyId)}</b> (${o.items.length})</span>`)}. Coordinate these so positions and terms stay consistent across teams.
    </${AICard}></div>` : ""}

    <div style="margin-bottom:14px"><${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} /></div>
    <div class="row wrap" style="gap:8px;margin-bottom:16px"><${CategoryChips} selected=${cats} onToggle=${toggleCat} /></div>

    <${DataTable} onRow=${setOpen} columns=${[
      { key: "id", label: "ID", mono: true, width: "84px" },
      { key: "title", label: "Document", render: (r) => html`<div class="cell-strong">${r.title}</div><div class="tiny muted">${r.contract || "Third-party paper"}</div>` },
      { key: "category", label: "Category", render: (r) => html`<${CategoryPill} item=${r} />` },
      { key: "reviewer", label: "Reviewer", render: (r) => html`<div class="row" style="gap:8px"><${Avatar} name=${nameOf(r.reviewer)} size="sm" /><span class="tiny">${nameOf(r.reviewer).split(" ")[0]}</span></div>` },
      { key: "risk", label: "Risk", render: (r) => html`<${Risk} level=${r.risk} />` },
      { key: "flagged", label: "AI Flags", render: (r) => html`<${Pill} tone=${r.flagged > 5 ? "red" : "amber"}><${Icon} name="sparkles" size=12 /> ${r.flagged} issues</${Pill}>` },
      { key: "overlap", label: "Overlap", render: (r) => (ovMap[r.id] && ovMap[r.id].length) ? html`<${Pill} tone="amber" dot=${true}>${ovMap[r.id].length} overlap</${Pill}>` : html`<span class="tiny muted">—</span>` },
      { key: "status", label: "Status", render: (r) => html`<${Status} value=${r.status} />` },
      { key: "sla", label: "SLA", render: (r) => html`<span class=${cx("tiny", overdue(r) ? "risk--critical" : "")} style="font-weight:600;padding:2px 7px;border-radius:6px">${fmt.until(r.sla)}</span>` },
    ]} rows=${rows} empty=${html`<div class="empty"><${Icon} name="checkcircle" size=36 /><div>No reviews match these filters.</div></div>`} />

    ${open && html`<${Drawer} title=${open.id} width=${460} onClose=${() => setOpen(null)}
      footer=${html`<${Btn} variant="ghost">Return to business</${Btn}><${Btn} variant="primary" icon="check">Approve review</${Btn}>`}>
      <div class="col" style="gap:18px;padding:20px">
        <div>
          <div class="row wrap" style="gap:8px;margin-bottom:8px"><${Status} value=${open.status} /><${Risk} level=${open.risk} /><${CategoryPill} item=${open} /></div>
          <div style="font-size:17px;font-weight:700">${open.title}</div>
          <div class="tiny muted" style="margin-top:2px">${open.contract || "Third-party paper"} · reviewer ${nameOf(open.reviewer)}</div>
        </div>

        ${(open.companyTags || []).length ? html`<div><div class="tiny muted" style="margin-bottom:6px;font-weight:600">Company tags</div><${TagChips} ids=${open.companyTags} /></div>` : ""}

        ${openOv.length ? html`<div class="card card--pad col" style="gap:10px;border-color:var(--warning)">
          <div class="row" style="gap:8px"><${Icon} name="gitbranch" size=16 style=${{ color: "var(--warning)" }} /><span class="strong tiny">Overlaps — ${openOv.length} related open item${openOv.length === 1 ? "" : "s"}</span></div>
          <div class="tiny muted">Same company/counterparty as this review. Open to coordinate:</div>
          <div class="row wrap" style="gap:6px">
            ${openOv.map((it) => html`<button key=${it.kind + it.id} class="tagchip" onClick=${() => navigate(it.path)}><${Icon} name=${KIND_ICON[it.kind] || "file"} size=12 />${it.kind} · ${it.id}</button>`)}
          </div>
        </div>` : ""}

        <${AICard} title="AI review complete">I analyzed the document and flagged <b>${open.flagged} issues</b> across liability, data protection and termination. Overall risk: <b>${open.risk}</b>. Recommended focus areas below.</${AICard}>
        <div class="col" style="gap:10px">
          <span class="strong tiny" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">Flagged issues</span>
          ${ISSUES.slice(0, open.flagged > 4 ? 4 : Math.max(2, open.flagged)).map((iss, i) => html`<div key=${i} class="card card--pad" style="padding:12px">
            <div class="row" style="gap:8px;margin-bottom:8px"><span class="risk__bar" style=${`background:${iss.r === "high" ? "var(--danger)" : "var(--warning)"};height:16px`}></span><${Risk} level=${iss.r} /></div>
            <div class="tiny" style="line-height:1.5">${iss.t}</div>
            <div class="row" style="gap:8px;margin-top:10px"><${Btn} variant="soft" size="sm" icon="check">Accept fix</${Btn}><${Btn} variant="ghost" size="sm">Dismiss</${Btn}></div>
          </div>`)}
        </div>
      </div>
    </${Drawer}>`}
  </div>`;
}
