/* PRECEDENTS & PLAYBOOKS.
 *
 * The department's written positions, as opposed to the Knowledge Base, which
 * is the document estate in Drive. Two things live here and both are real:
 *
 *   PLAYBOOKS   — maintained by Legal (the Director publishes, an Associate
 *                 Director proposes). A playbook is a NAME over a set of
 *                 positions, so opening one shows the published clause-library
 *                 positions it covers rather than a card that leads nowhere.
 *   PRECEDENT   — what has actually been agreed before: every deviation from a
 *                 library position that was formally approved, with who
 *                 approved it and on which draft. This is the only thing in
 *                 LegalOS entitled to the word "approved", and a clause that
 *                 merely differs from the standard is never shown as one.
 */
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Empty, Chip } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { nameOf } from "../data.js";
import { useCollection, publishedClauses, clauseById3, clauseCurrentVersion } from "../store.js";
import { useActiveUser, canConfigure, canProposeConfig } from "../rbac.js";
import { PlaybookEditor } from "./knowledge.js";

/* Which clause positions a playbook covers. The match is on the playbook's own
   `area` wording against the clause title and risk tier — declared here as
   data so a new playbook picks its positions up without a code change, and so
   a playbook that matches nothing says so rather than showing an empty card
   with no explanation. */
const AREA_TERMS = (pb) => String(pb.area || "" + " " + pb.title).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);

function clausesFor(pb, clauses) {
  const terms = AREA_TERMS(pb);
  const title = String(pb.title || "").toLowerCase();
  return clauses.filter((c) => {
    const v = clauseCurrentVersion(c) || {};
    const hay = (c.type + " " + (v.notes || "") + " " + (v.guidance || "")).toLowerCase();
    if (terms.some((t) => hay.includes(t))) return true;
    // "Commercial Contracting" is the general book: it owns every position that
    // no more specific playbook claims.
    return /commercial contracting/.test(title);
  });
}

function PlaybookPanel({ pb, clauses, onClose }) {
  const mine = clausesFor(pb, clauses);
  return html`<${Section} title=${pb.title} icon=${pb.icon || "book"} sub=${pb.area}
    actions=${html`<${Btn} size="sm" variant="ghost" icon="x" onClick=${onClose}>Close</${Btn}>`}>
    ${mine.length === 0
      ? html`<div class="tiny muted">No published clause position is filed under this playbook yet.
          Positions are published in the <button type="button" class="linkbtn tiny"
          onClick=${() => navigate("/clauses")}>Clause Library</button>.</div>`
      : html`<div class="col" style="gap:10px">
          ${mine.map((c) => { const v = clauseCurrentVersion(c) || {};
            return html`<div key=${c.id} class="card card--pad">
              <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
                <button type="button" class="cell-strong linkbtn" onClick=${() => navigate("/clauses")}>${c.type}</button>
                <${Pill} tone=${c.risk === "High" ? "red" : c.risk === "Medium" ? "amber" : "gray"}>${c.risk} risk</${Pill}>
                <div class="spacer"></div>
                <span class="tiny muted">deviation approved by: ${c.approvalRequired || "—"}</span>
              </div>
              ${["Preferred", "Acceptable", "Fallback"].map((tier) => (v.tiers && v.tiers[tier]
                ? html`<div key=${tier} style="margin-bottom:6px">
                    <div class="tiny strong" style="color:var(--text-2)">${tier}</div>
                    <div class="tiny" style="line-height:1.55">${v.tiers[tier]}</div>
                  </div>` : null))}
              ${v.guidance && html`<div class="tiny muted" style="margin-top:6px;line-height:1.5">
                <strong>Negotiating guidance.</strong> ${v.guidance}</div>`}
            </div>`; })}
        </div>`}
  </${Section}>`;
}

export default function Playbooks() {
  const viewer = useActiveUser();
  const playbooks = useCollection("playbooks");
  const deviations = useCollection("deviations3");
  const drafts = useCollection("drafts3");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState("playbooks");
  const canManage = canProposeConfig(viewer);
  const clauseRows = useCollection("clauses3");
  const clauses = useMemo(() => publishedClauses(), [clauseRows]);

  /* PRECEDENT IS APPROVED DEVIATION, AND NOTHING ELSE.
     A draft whose wording differs from the library is a deviation; it becomes
     precedent only once somebody with the authority signs it off. Filtering on
     status here is what keeps "we have done this before" from meaning "somebody
     once typed this". */
  const approved = (deviations || []).filter((d) => d.status === "Approved");
  const pending = (deviations || []).filter((d) => d.status !== "Approved" && d.status !== "Rejected");

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Precedents & Playbooks"
      sub="The department's published positions, and every deviation from them that has actually been approved."
      actions=${canManage ? html`<${Btn} variant="primary" icon="plus" onClick=${() => setEditing({ pb: null })}>
        ${canConfigure(viewer) ? "Add playbook" : "Propose playbook"}</${Btn}>` : null} />
    ${editing && html`<${PlaybookEditor} pb=${editing.pb} viewer=${viewer} onClose=${() => setEditing(null)} />`}

    <${StatStrip} stats=${[
      { value: playbooks.length, label: "Playbooks", onClick: () => setTab("playbooks") },
      { value: clauses.length, label: "Published positions", onClick: () => navigate("/clauses"),
        title: "Open the Clause Library" },
      { value: approved.length, label: "Approved deviations", onClick: () => setTab("precedent"),
        title: "The precedent set" },
      { value: pending.length, label: "Deviations awaiting a decision", tone: pending.length ? "amber" : "",
        onClick: () => setTab("precedent") },
    ]} />

    <div class="row wrap" style="gap:8px;margin:4px 0 14px">
      ${[["playbooks", "Playbooks"], ["precedent", "Precedent — approved deviations"]].map(([id, label]) =>
        html`<${Chip} key=${id} active=${tab === id} onClick=${() => setTab(id)}>${label}</${Chip}>`)}
    </div>

    ${tab === "playbooks" && html`<div class="col" style="gap:16px">
      <div class="grid grid--3">
        ${playbooks.map((p) => html`<button type="button" key=${p.id || p.title}
          class=${cx("card card--hover card--pad clickable cardbtn", open === p.id && "card--on")}
          aria-expanded=${open === p.id ? "true" : "false"}
          onClick=${() => setOpen(open === p.id ? null : p.id)}>
          <div class="row" style="margin-bottom:12px">
            <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name=${p.icon || "book"} size=18 /></div>
            <div class="spacer"></div>
            <${Pill} tone="gray">${clausesFor(p, clauses).length} positions</${Pill}>
          </div>
          <div class="strong" style="font-size:14px;margin-bottom:3px">${p.title}</div>
          <div class="tiny muted">${p.area}</div>
          <div class="tiny muted" style="margin-top:12px">${p.updatedAt ? "Updated " + fmt.rel(p.updatedAt) : "Standard position"}</div>
        </button>`)}
      </div>
      ${open && html`<${PlaybookPanel} pb=${playbooks.find((p) => p.id === open)} clauses=${clauses}
        onClose=${() => setOpen(null)} />`}
      ${canManage && html`<div class="tiny muted">Select a playbook to see the positions it covers.
        Use <strong>Add playbook</strong> above to ${canConfigure(viewer) ? "publish" : "propose"} a new one.</div>`}
    </div>`}

    ${tab === "precedent" && html`<${Section} title="Approved deviations" icon="checkcircle"
      sub="A position we have formally agreed to move off, with the draft it was agreed on and who approved it.">
      ${approved.length === 0
        ? html`<${Empty} icon="checkcircle" title="No deviation has been approved yet"
            text="When a draft moves off a library position and that move is approved, it is recorded here as precedent. Nothing is treated as precedent merely because the wording differs." />`
        : html`<div class="col" style="gap:0">
            ${approved.map((d) => { const c = clauseById3(d.clauseId); const dr = (drafts || []).find((x) => x.id === d.draftId);
              return html`<button key=${d.id} type="button" class="feed__item clickable" style="text-align:left;width:100%"
                onClick=${() => dr && navigate("/drafting/" + dr.id)}>
                <div class="row" style="gap:10px;align-items:center;width:100%">
                  <span class="calpip calpip--green"><${Icon} name="checkcircle" size=13 /></span>
                  <div style="flex:1;min-width:0">
                    <div class="tiny strong">${(c && c.type) || d.clauseType || "Clause"} · Preferred → ${d.tierTo}</div>
                    <div class="tiny muted">${[dr && dr.title, d.resolvedBy && "approved by " + nameOf(d.resolvedBy),
                      d.resolvedAt && fmt.date(d.resolvedAt)].filter(Boolean).join(" · ")}</div>
                  </div>
                  <${Icon} name="chevronRight" size=14 />
                </div></button>`; })}
          </div>`}
    </${Section}>`}
  </div>`;
}
