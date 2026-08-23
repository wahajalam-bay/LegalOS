// My Requests — the requester's own tracking view (PRD §3.5 "visible to
// Requester"). Uses the app's card design language (the same .kcard vocabulary
// as the Legal Requests board), showing ONLY requester-safe fields — status,
// submitted, expected turnaround and a plain status timeline. No internal legal
// content (category label, owner, priority, triage notes, risk).
import { html, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Status, Pill, Empty, Drawer, Timeline } from "../ui.js";
import { PageHead } from "../parts.js";
import { useCollection } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { navigate } from "../router.js";

const submittedAt = (r) => r.requestDate || r.created || r.dateRaised || null;
const DONE = new Set(["Approved", "Delivered", "Closed", "Executed", "Completed"]);
const II = { display: "inline", verticalAlign: "-2px", marginRight: "4px" };

function RequestCard({ r, onOpen }) {
  const expected = r.tat && r.tat.dueAt ? r.tat.dueAt : null;
  return html`<div class="kcard" style="cursor:pointer" onClick=${() => onOpen(r)}>
    <div class="kcard__top">
      <span class="kcard__id">${r.id}</span>
      <div class="spacer"></div>
      <${Status} value=${r.status} />
    </div>
    <div class="kcard__title">${r.title}</div>
    ${r.requesterOption && html`<div class="kcard__meta"><${Pill} tone="gray">${r.requesterOption}</${Pill}></div>`}
    <div class="kcard__foot" style="margin-top:12px">
      <span class="tiny muted"><${Icon} name="calendar" size=12 style=${II} />${submittedAt(r) ? fmt.date(submittedAt(r)) : "—"}</span>
      <div class="spacer"></div>
      ${expected
        ? html`<span class="tiny" style="color:var(--text-3)"><${Icon} name="clock" size=12 style=${II} />Expected ${fmt.date(expected)}</span>`
        : html`<span class="tiny muted">Awaiting triage</span>`}
    </div>
  </div>`;
}

const Grid = ({ items, onOpen }) => html`<div class="mreqgrid">
  ${items.map((r) => html`<${RequestCard} key=${r.id} r=${r} onOpen=${onOpen} />`)}
</div>`;

export default function MyRequests() {
  const viewer = useActiveUser();
  const requests = useCollection("requests");
  const [open, setOpen] = useState(null);

  const mine = requests
    .filter((r) => r.requesterId === viewer.id || (viewer.email && r.requesterEmail === viewer.email))
    .sort((a, b) => new Date(submittedAt(b) || 0) - new Date(submittedAt(a) || 0));
  const active = mine.filter((r) => !DONE.has(r.status));
  const done = mine.filter((r) => DONE.has(r.status));

  const stageItems = (r) => (r.stageLog || []).map((s) => ({
    title: s.stage, meta: s.enteredAt ? fmt.date(s.enteredAt) : "", tone: s.exitedAt ? "green" : "blue",
  }));

  return html`<div class="page">
    <${PageHead} title="My Requests" sub="Everything you've raised with Legal — track status and turnaround here."
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>New request</${Btn}>`} />

    ${mine.length === 0
      ? html`<${Empty} icon="inbox" title="No requests yet"
          text="Raise your first legal request and you'll be able to track it here."
          action=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>Raise a request</${Btn}>`} />`
      : html`<div class="col" style="gap:22px">
          ${active.length > 0 && html`<div>
            <div class="panel__title" style="margin-bottom:12px">In progress <span class="tiny muted">· ${active.length}</span></div>
            <${Grid} items=${active} onOpen=${setOpen} />
          </div>`}
          ${done.length > 0 && html`<div>
            <div class="panel__title" style="margin-bottom:12px">Completed <span class="tiny muted">· ${done.length}</span></div>
            <${Grid} items=${done} onOpen=${setOpen} />
          </div>`}
        </div>`}

    ${open && html`<${Drawer} title=${open.id} onClose=${() => setOpen(null)}
      footer=${html`<${Btn} variant="ghost" onClick=${() => setOpen(null)}>Close</${Btn}>`}>
      <div class="col" style="gap:16px">
        <div class="row wrap" style="gap:8px"><${Status} value=${open.status} />
          ${open.tat && open.tat.dueAt && html`<${Pill} tone="blue">Expected ${fmt.date(open.tat.dueAt)}</${Pill}>`}</div>
        <div>
          <div style="font-size:17px;font-weight:700;letter-spacing:-.01em">${open.title}</div>
          ${open.requesterOption && html`<div class="tiny muted" style="margin-top:3px">${open.requesterOption}</div>`}
        </div>
        ${open.businessContext && html`<div>
          <div class="fpop__lbl">What you told us</div>
          <div class="spine__desc" style="margin-top:6px">${open.businessContext}</div>
        </div>`}
        <div>
          <div class="fpop__lbl" style="margin-bottom:8px">Progress</div>
          ${(open.stageLog || []).length
            ? html`<${Timeline} items=${stageItems(open)} />`
            : html`<div class="tiny muted">Submitted — waiting for Legal to triage.</div>`}
        </div>
        <div class="banner banner--info" style="align-items:flex-start">
          <${Icon} name="workflow" size=16 />
          <span class="tiny">Legal triages your request, confirms the owner and turnaround, and keeps you posted here. You'll be asked if they need anything from you.</span>
        </div>
      </div>
    </${Drawer}>`}
  </div>`;
}
