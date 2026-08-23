// My Requests — the requester's own tracking view (PRD §3.5 "visible to
// Requester"). A business requester sees ONLY what they raised, with status,
// submitted date, expected turnaround and a plain status timeline. No internal
// legal content (category label, owner, triage notes, risk) is shown.
import { html, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Status, Pill, Empty, Drawer, Timeline } from "../ui.js";
import { PageHead } from "../parts.js";
import { useCollection } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { navigate } from "../router.js";

const submittedAt = (r) => r.requestDate || r.created || r.dateRaised || null;

export default function MyRequests() {
  const viewer = useActiveUser();
  const requests = useCollection("requests");
  const [open, setOpen] = useState(null);

  const mine = requests
    .filter((r) => r.requesterId === viewer.id || (viewer.email && r.requesterEmail === viewer.email))
    .sort((a, b) => new Date(submittedAt(b) || 0) - new Date(submittedAt(a) || 0));

  const stageItems = (r) =>
    (r.stageLog || []).map((s) => ({
      title: s.stage,
      meta: s.enteredAt ? fmt.date(s.enteredAt) : "",
      tone: s.exitedAt ? "green" : "blue",
    }));

  return html`<div class="page">
    <${PageHead} title="My Requests" sub="Everything you've raised with Legal — track status and turnaround here."
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>New request</${Btn}>`} />

    ${mine.length === 0
      ? html`<${Empty} icon="inbox" title="No requests yet"
          text="Raise your first legal request and you'll be able to track it here."
          action=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>Raise a request</${Btn}>`} />`
      : html`<div class="card" style="padding:0">
          <div class="tablewrap"><table class="table">
            <thead><tr>
              <th style="width:96px">Ref</th><th>What you need</th><th style="width:130px">Status</th>
              <th style="width:120px">Submitted</th><th style="width:130px">Expected</th>
            </tr></thead>
            <tbody>
              ${mine.map((r) => html`<tr key=${r.id} class="clickable" onClick=${() => setOpen(r)}>
                <td class="mono tiny">${r.id}</td>
                <td style="max-width:420px"><div class="ellipsis strong">${r.title}</div>
                  ${r.requesterOption && html`<div class="tiny muted ellipsis">${r.requesterOption}</div>`}</td>
                <td><${Status} value=${r.status} /></td>
                <td class="tiny">${submittedAt(r) ? fmt.date(submittedAt(r)) : "—"}</td>
                <td class="tiny">${r.tat && r.tat.dueAt ? fmt.date(r.tat.dueAt) : "—"}</td>
              </tr>`)}
            </tbody>
          </table></div>
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
