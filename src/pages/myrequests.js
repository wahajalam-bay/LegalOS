// My Requests — the requester's own tracking view (PRD §3.5 "visible to
// Requester"). Uses the app's card design language (the same .kcard vocabulary
// as the Legal Requests board), showing ONLY requester-safe fields — status,
// submitted, expected turnaround and a plain status timeline. No internal legal
// content (category label, owner, priority, triage notes, risk).
import { html, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Status, Pill, Empty, Drawer, Timeline, Progress } from "../ui.js";
import { PageHead } from "../parts.js";
import { useCollection, requestStages } from "../store.js";
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

// Requester-facing labels for the FULL lifecycle path (no internal jargon), and a
// one-line "what happens here" so the requester understands each step.
const STAGE_LABEL = {
  "Intake": "Submitted", "Triage": "Received & categorised", "Commercial Review": "Business review",
  "Legal Review": "Legal review", "Drafting": "Drafting", "Redlining": "Drafting & redlining",
  "Notice Drafting": "Drafting the notice", "Negotiation": "Negotiation", "Approval": "Internal approval",
  "Signature": "Signature", "Notice Served": "Notice served", "Executed": "Completed",
  "Repository": "Filed & closed", "Closed": "Closed",
};
const STAGE_SUB = {
  "Intake": "Your request reached Legal", "Triage": "Legal set the category, owner and turnaround",
  "Commercial Review": "Business terms confirmed", "Legal Review": "Legal is reviewing the detail",
  "Drafting": "Preparing the document", "Redlining": "Marking up the paper",
  "Notice Drafting": "Preparing the notice", "Negotiation": "Agreeing terms with the other side",
  "Approval": "Sign-off from the approver", "Signature": "Getting it signed",
  "Notice Served": "Notice delivered", "Executed": "Signed and done",
  "Repository": "Stored on the record", "Closed": "Nothing further outstanding",
};
const stageLabel = (s) => STAGE_LABEL[s] || s;

// Friendly labels for the requester's own Layer-2 answers (their own inputs —
// safe to show back to them).
const L2_LABEL = {
  counterparty: "Counterparty", counterpartyType: "Counterparty type", paper: "Whose paper",
  term: "Contract term", existing: "Existing agreement?", linkedContract: "Existing contract",
  changeNature: "Nature of change", effectiveDate: "Effective date", question: "Question asked",
  decisionDeadline: "Decision deadline", decisionMaker: "Decision-maker", claimNature: "Nature of claim",
  deadlines: "Deadlines", correspondence: "Correspondence received?", jurisdiction: "Jurisdiction",
  regulator: "Regulator", activity: "Product / activity", assetNature: "Asset", jurisdictions: "Jurisdictions",
  filingUrgency: "Filing urgency", detail: "Details",
};

// The full pipeline, requester-safe: every stage of this request's lifecycle,
// with the current one highlighted — "where does it stand".
function RequesterPipeline({ r }) {
  const { path, idx } = requestStages(r);
  const doneAll = DONE.has(r.status) || r.progress === 100;
  const stampFor = (s) => {
    const hit = (r.stageLog || []).filter((x) => x.stage === s).pop();
    return hit && (hit.enteredAt || hit.at) ? (hit.enteredAt || hit.at) : null;
  };
  return html`<div class="rpipe">
    ${path.map((s, i) => {
      const state = doneAll || i < idx ? "done" : i === idx ? "current" : "upcoming";
      const at = stampFor(s);
      return html`<div key=${s} class=${"rpipe__step rpipe__step--" + state}>
        <div class="rpipe__rail">
          <div class="rpipe__dot">${state === "done" ? html`<${Icon} name="check" size=12 />` : state === "current" ? "" : ""}</div>
          ${i < path.length - 1 && html`<div class="rpipe__line"></div>`}
        </div>
        <div class="rpipe__body">
          <div class="rpipe__row">
            <span class="rpipe__name">${stageLabel(s)}</span>
            ${state === "current" && !doneAll && html`<span class="rpipe__here">You are here</span>`}
            <div class="spacer"></div>
            ${at && html`<span class="rpipe__at">${fmt.date(at)}</span>`}
          </div>
          <div class="rpipe__sub">${STAGE_SUB[s] || ""}</div>
        </div>
      </div>`;
    })}
  </div>`;
}

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

    ${open && html`<${RequestSheet} r=${open} onClose=${() => setOpen(null)} />`}
  </div>`;
}

// Full-screen detail — covers the screen and shows the whole request, fully
// structured in the app's design language: hero + progress, the details the
// requester gave, and the complete pipeline with where it stands.
function RequestSheet({ r, onClose }) {
  const done = DONE.has(r.status) || r.progress === 100;
  const l2 = r.layer2 || {};
  const l2rows = Object.keys(l2).filter((k) => l2[k]);
  const facts = [
    ["Reference", r.id],
    ["Submitted", submittedAt(r) ? fmt.date(submittedAt(r)) : "—"],
    ["Expected turnaround", r.tat && r.tat.dueAt ? fmt.date(r.tat.dueAt) : "Set at triage"],
    ["Needed by", r.dueDate ? fmt.date(r.dueDate) : "No date given"],
    ["Requesting department", r.department || "—"],
  ];
  return html`<div class="sheet" onClick=${onClose}>
    <div class="sheet__panel" onClick=${(e) => e.stopPropagation()}>
      <div class="sheet__bar">
        <span class="mono muted">${r.id}</span>
        <${Status} value=${r.status} />
        ${r.tat && r.tat.dueAt && !done && html`<${Pill} tone="blue">Expected ${fmt.date(r.tat.dueAt)}</${Pill}>`}
        ${r.escalated && html`<${Pill} tone="red" dot=${true}>Escalated</${Pill}>`}
        <div class="spacer"></div>
        <button class="iconbtn" onClick=${onClose} title="Close"><${Icon} name="x" size=18 /></button>
      </div>

      <div class="sheet__body">
        <div class="sheet__hero">
          <div class="sheet__title">${r.title}</div>
          ${r.requesterOption && html`<div class="mreq__what" style="margin-top:10px"><${Icon} name="message" size=12 />${r.requesterOption}</div>`}
          <div class="rphead" style="margin-top:16px">
            <div class="row" style="align-items:baseline;margin-bottom:7px">
              <span class="fpop__lbl">${done ? "Complete" : "In progress — " + friendlyStage(r)}</span>
              <div class="spacer"></div>
              <span class="rpipe__at" style="font-weight:700">${pctOf(r)}%</span>
            </div>
            <${Progress} value=${pctOf(r)} tone=${done ? "green" : "blue"} />
          </div>
        </div>

        <div class="sheet__grid">
          <div class="col" style="gap:20px;min-width:0">
            ${r.businessContext && html`<div>
              <div class="fpop__lbl">What you told us</div>
              <div class="spine__desc" style="margin-top:8px">${r.businessContext}</div>
            </div>`}

            <div>
              <div class="fpop__lbl" style="margin-bottom:10px">Request details</div>
              <div class="sheet__facts">
                ${facts.map(([l, v]) => html`<div key=${l} class="sheet__fact"><div class="sheet__fl">${l}</div><div class="sheet__fv">${v}</div></div>`)}
              </div>
              ${l2rows.length > 0 && html`<div class="sheet__facts" style="margin-top:10px">
                ${l2rows.map((k) => html`<div key=${k} class="sheet__fact"><div class="sheet__fl">${L2_LABEL[k] || k}</div><div class="sheet__fv">${l2[k]}</div></div>`)}
              </div>`}
              ${r.needByJustification && html`<div class="banner banner--warn" style="margin-top:12px;align-items:flex-start">
                <${Icon} name="alertTriangle" size=15 />
                <div><div class="strong tiny">Tighter than the standard turnaround</div><div class="tiny" style="margin-top:2px">${r.needByJustification}</div></div>
              </div>`}
            </div>

            <div class="banner banner--info" style="align-items:flex-start">
              <${Icon} name="workflow" size=16 />
              <span class="tiny">Legal triages your request, confirms the owner and turnaround, and keeps you posted here. You'll be notified at every step and asked if they need anything from you.</span>
            </div>
          </div>

          <div style="min-width:0">
            <div class="fpop__lbl" style="margin-bottom:12px">Pipeline — every step, and where it stands</div>
            <${RequesterPipeline} r=${r} />
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
