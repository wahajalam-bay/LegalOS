// My Requests — the requester's own tracking view (PRD §3.5 "visible to
// Requester"). Uses the app's card design language (the same .kcard vocabulary
// as the Legal Requests board), showing ONLY requester-safe fields — status,
// submitted, expected turnaround and a plain status timeline. No internal legal
// content (category label, owner, priority, triage notes, risk).
import { html, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Status, Pill, Empty, Drawer, Timeline, Progress } from "../ui.js";
import { PageHead } from "../parts.js";
import { useCollection } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { navigate } from "../router.js";

const submittedAt = (r) => r.requestDate || r.created || r.dateRaised || null;
const DONE = new Set(["Approved", "Delivered", "Closed", "Executed", "Completed"]);
const II = { display: "inline", verticalAlign: "-2px", marginRight: "4px" };

// Status → the same tone the rest of the app uses → the accent colour token.
const STATUS_TONE = {
  "New": "blue", "Intake": "blue", "Triage": "purple", "Assigned": "blue",
  "In Review": "amber", "Legal Review": "amber", "Business Review": "amber",
  "Drafting": "purple", "Negotiation": "amber", "Pending Approval": "amber", "Approval": "amber",
  "Awaiting Signature": "indigo", "Approved": "green", "Executed": "green", "Completed": "green",
  "Signed": "green", "Active": "green", "Closed": "green", "Delivered": "green",
};
const TONE_COLOR = {
  green: "var(--success)", amber: "var(--warning)", red: "var(--danger)",
  blue: "var(--brand)", purple: "var(--accent-500)", indigo: "var(--accent-500)", gray: "var(--text-3)",
};
const accentOf = (r) => TONE_COLOR[STATUS_TONE[r.status] || STATUS_TONE[r.stage] || "gray"] || "var(--text-3)";

// Requester-safe lifecycle progress — how far along, no internal detail.
const STATUS_PCT = {
  "New": 6, "Intake": 6, "Triage": 16, "Assigned": 26, "In Review": 42, "Legal Review": 42,
  "Business Review": 42, "Drafting": 56, "Negotiation": 70, "Pending Approval": 82, "Approval": 82,
  "Awaiting Signature": 92, "Signature": 92, "Approved": 100, "Executed": 100, "Completed": 100,
  "Repository": 100, "Signed": 100, "Active": 100, "Closed": 100, "Delivered": 100,
};
const pctOf = (r) => (typeof r.progress === "number" && r.progress > 0 ? r.progress : (STATUS_PCT[r.stage] ?? STATUS_PCT[r.status] ?? 10));

// A friendly, plain-language read on where it is (no internal stage jargon).
const FRIENDLY = {
  "Triage": "Received — with Legal", "Assigned": "With Legal — getting started",
  "Legal Review": "Under legal review", "In Review": "Under legal review", "Business Review": "Under review",
  "Drafting": "Drafting in progress", "Negotiation": "In negotiation",
  "Approval": "Awaiting approval", "Pending Approval": "Awaiting approval",
  "Signature": "Awaiting signature", "Awaiting Signature": "Awaiting signature",
  "Executed": "Completed", "Repository": "Completed", "Completed": "Completed",
  "Approved": "Completed", "Closed": "Completed",
};
const friendlyStage = (r) => FRIENDLY[r.stage] || FRIENDLY[r.status] || "Submitted — awaiting triage";

function RequestCard({ r, onOpen }) {
  const expected = r.tat && r.tat.dueAt ? r.tat.dueAt : null;
  const done = DONE.has(r.status);
  const overdue = expected && !done && new Date(expected) < Date.now();
  const pct = pctOf(r);
  const accent = accentOf(r);
  return html`<div class="mreq" style=${`--mreq-accent:${accent}`} onClick=${() => onOpen(r)}>
    <div class="mreq__top">
      <span class="mreq__id">${r.id}</span>
      <div class="spacer"></div>
      <${Status} value=${r.status} />
    </div>
    <div class="mreq__title">${r.title}</div>
    ${r.requesterOption && html`<div class="mreq__what"><${Icon} name="message" size=12 />${r.requesterOption}</div>`}

    <div class="mreq__prog">
      <div class="mreq__proghead">
        <span class="mreq__stage">${done ? html`<${Icon} name="checkcircle" size=12 style=${{ ...II, color: "var(--success)" }} />` : ""}${friendlyStage(r)}</span>
        <div class="spacer"></div>
        <span class="mreq__pct">${pct}%</span>
      </div>
      <${Progress} value=${pct} tone=${done ? "green" : overdue ? "red" : "blue"} />
    </div>

    <div class="mreq__foot">
      <span class="tiny muted"><${Icon} name="calendar" size=12 style=${II} />Submitted ${submittedAt(r) ? fmt.date(submittedAt(r)) : "—"}</span>
      <div class="spacer"></div>
      ${done
        ? html`<span class="tiny" style="color:var(--success);font-weight:600"><${Icon} name="check" size=12 style=${II} />Done</span>`
        : expected
          ? html`<span class="tiny" style=${`font-weight:600;color:${overdue ? "var(--danger)" : "var(--text-2)"}`}><${Icon} name="clock" size=12 style=${II} />${overdue ? "Overdue — due " : "Expected "}${fmt.date(expected)}</span>`
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
