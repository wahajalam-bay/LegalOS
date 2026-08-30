// My Requests — the requester's own tracking view (PRD §3.5 "visible to
// Requester"). Uses the app's card design language (the same .kcard vocabulary
// as the Legal Requests board), showing ONLY requester-safe fields — status,
// submitted, expected turnaround and a plain status timeline. No internal legal
// content (category label, owner, priority, triage notes, risk).
import { html, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Status, Pill, Empty, Drawer, Timeline, Progress, Segmented } from "../ui.js";
import { PageHead } from "../parts.js";
import { useCollection, requestStages } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { byId } from "../data.js";
import { navigate } from "../router.js";
import { ChatThread, unreadCount } from "../messages.js";

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

    <div class="mreq__facts">
      <span class="mreq__fl">Counter party</span><span class="mreq__fv">${r.counterparty && r.counterparty !== "—" ? r.counterparty : "—"}</span>
      <span class="mreq__fl">Assignee (POC)</span><span class="mreq__fv">${personName(r.owner) || "Awaiting triage"}</span>
      <span class="mreq__fl">Request type</span><span class="mreq__fv">${r.requestType || r.type || r.contractType || "—"}</span>
    </div>

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
  // Horizontal: the stages read left-to-right as a journey, which is how someone
  // waiting thinks about it. The track scrolls inside itself on narrow screens
  // rather than crushing the labels.
  return html`<div class="rpipe rpipe--h">
    ${path.map((s, i) => {
      const state = doneAll || i < idx ? "done" : i === idx ? "current" : "upcoming";
      const at = stampFor(s);
      return html`<div key=${s} class=${"rpipe__step rpipe__step--" + state}>
        <div class="rpipe__rail">
          ${i > 0 && html`<div class="rpipe__line rpipe__line--before"></div>`}
          <div class="rpipe__dot">${state === "done" ? html`<${Icon} name="check" size=12 />` : ""}</div>
          ${i < path.length - 1 && html`<div class="rpipe__line"></div>`}
        </div>
        <div class="rpipe__body">
          <span class="rpipe__name">${stageLabel(s)}</span>
          ${state === "current" && !doneAll && html`<span class="rpipe__here">You are here</span>`}
          <div class="rpipe__sub">${STAGE_SUB[s] || ""}</div>
          ${at && html`<div class="rpipe__at">${fmt.date(at)}</div>`}
        </div>
      </div>`;
    })}
  </div>`;
}


/* The tabular view. Columns are the ones a requester actually tracks against:
   what it is, who it is with, who raised it, who in Legal holds it, what kind of
   request, and the turnaround. Every column sorts; the default is by turnaround
   so whatever is closest to its deadline is on top. */
const COLS = [
  { key: "title",        label: "Contract",       get: (r) => r.title || "—" },
  { key: "counterparty", label: "Counter party",  get: (r) => r.counterparty && r.counterparty !== "—" ? r.counterparty : "—" },
  { key: "requester",    label: "Requester",      get: (r) => personName(r.requesterId || r.requester) || r.requesterEmail || "—" },
  { key: "assignee",     label: "Assignee (POC)", get: (r) => personName(r.owner) || "Awaiting triage" },
  { key: "type",         label: "Request type",   get: (r) => r.requestType || r.type || r.contractType || "—" },
  { key: "tat",          label: "TAT",            get: (r) => tatDue(r) || 0 },
];

function personName(id) {
  if (!id) return null;
  const u = byId(id);
  return u ? u.name : null;
}
const tatDue = (r) => {
  const d = (r.tat && r.tat.dueAt) || r.dueDate || r.due || null;
  return d ? new Date(d).getTime() : null;
};
// Working days left, phrased for someone who is waiting rather than working it.
function tatCell(r) {
  const due = tatDue(r);
  if (!due) return html`<span class="muted">Set at triage</span>`;
  if (DONE.has(r.status)) return html`<span class="muted">${fmt.date(new Date(due))}</span>`;
  const days = Math.ceil((due - Date.now()) / 86400000);
  const tone = days < 0 ? "red" : days <= 2 ? "amber" : "green";
  const when = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `in ${days}d`;
  return html`<div class="col" style="gap:2px">
    <span class="cell-strong">${fmt.date(new Date(due))}</span>
    <${Pill} tone=${tone}>${when}</${Pill}>
  </div>`;
}

function RequestTable({ items, onOpen }) {
  const [sort, setSort] = useState({ key: "tat", dir: 1 });
  const col = COLS.find((c) => c.key === sort.key) || COLS[5];
  const rows = [...items].sort((a, b) => {
    const av = col.get(a), bv = col.get(b);
    // Anything without a turnaround yet sorts last rather than pretending to be urgent.
    if (sort.key === "tat") {
      const an = av || Infinity, bn = bv || Infinity;
      return (an - bn) * sort.dir;
    }
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sort.dir;
  });
  const head = (c) => html`<th key=${c.key} class="clickable"
    onClick=${() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}>
    ${c.label}${sort.key === c.key ? html`<${Icon} name=${sort.dir === 1 ? "chevronDown" : "chevronRight"} size=11 style=${{ marginLeft: "4px", verticalAlign: "-1px" }} />` : null}
  </th>`;
  return html`<div class="tablewrap dense"><table class="table">
    <thead><tr>${COLS.map(head)}<th>Status</th></tr></thead>
    <tbody>
      ${rows.map((r) => html`<tr key=${r.id} class="rowlink" onClick=${() => onOpen(r)}>
        <td class="wrapcell">
          <div class="cell-strong">${r.title}</div>
          <div class="tiny muted">${r.id} · submitted ${submittedAt(r) ? fmt.date(submittedAt(r)) : "—"}</div>
        </td>
        <td>${COLS[1].get(r)}</td>
        <td>${COLS[2].get(r)}</td>
        <td>${personName(r.owner) || html`<span class="muted">Awaiting triage</span>`}</td>
        <td>${COLS[4].get(r)}</td>
        <td>${tatCell(r)}</td>
        <td><${Status} value=${r.status} /></td>
      </tr>`)}
    </tbody>
  </table></div>`;
}

export default function MyRequests() {
  const viewer = useActiveUser();
  const requests = useCollection("requests");
  const [open, setOpen] = useState(null);
  // List first: a requester tracking several matters wants to scan them, and the
  // cards only really pay off once there are few enough to look at one by one.
  const [view, setView] = useState("list");
  // Drill down to just the open work or just the closed record.
  const [scope, setScope] = useState("all");

  const mine = requests
    .filter((r) => r.requesterId === viewer.id || (viewer.email && r.requesterEmail === viewer.email))
    .sort((a, b) => new Date(submittedAt(b) || 0) - new Date(submittedAt(a) || 0));
  const active = mine.filter((r) => !DONE.has(r.status));
  const done = mine.filter((r) => DONE.has(r.status));

  const stageItems = (r) => (r.stageLog || []).map((s) => ({
    title: s.stage, meta: s.enteredAt ? fmt.date(s.enteredAt) : "", tone: s.exitedAt ? "green" : "blue",
  }));

  return html`<div class="page">
    <${PageHead} title="Legal Requests" sub="Everything you've raised with Legal — track status and turnaround here."
      actions=${html`<${Segmented} value=${view} onChange=${setView}
          options=${[{ label: "List", value: "list", icon: "list" }, { label: "Cards", value: "cards", icon: "columns" }]} />
        <${Segmented} value=${scope} onChange=${setScope}
          options=${[{ label: "All", value: "all" }, { label: "Active", value: "active" }, { label: "Closed", value: "done" }]} />
        <${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>New request</${Btn}>`} />

    ${mine.length === 0
      ? html`<${Empty} icon="inbox" title="No requests yet"
          text="Raise your first legal request and you'll be able to track it here."
          action=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>Raise a request</${Btn}>`} />`
      : html`<div class="col" style="gap:22px">
          ${scope !== "done" && active.length > 0 && html`<div>
            <div class="panel__title" style="margin-bottom:12px">In progress <span class="tiny muted">· ${active.length}</span></div>
            ${view === "list"
              ? html`<${RequestTable} items=${active} onOpen=${setOpen} />`
              : html`<${Grid} items=${active} onOpen=${setOpen} />`}
          </div>`}
          ${scope !== "active" && done.length > 0 && html`<div>
            <div class="panel__title" style="margin-bottom:12px">Completed <span class="tiny muted">· ${done.length}</span></div>
            ${view === "list"
              ? html`<${RequestTable} items=${done} onOpen=${setOpen} />`
              : html`<${Grid} items=${done} onOpen=${setOpen} />`}
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
  // Ticket information: everything a requester would otherwise chase someone for.
  const facts = [
    ["Reference", r.id],
    ["Status", r.status || "—"],
    ["Current stage", friendlyStage(r)],
    ["Request type", r.requestType || r.type || r.contractType || "—"],
    ["Counter party", r.counterparty && r.counterparty !== "—" ? r.counterparty : "—"],
    ["Assignee (POC)", personName(r.owner) || "Awaiting triage"],
    ["Raised by", personName(r.requesterId || r.requester) || r.requesterEmail || "—"],
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

            <div>
              <div class="row" style="align-items:baseline;margin-bottom:10px">
                <div class="fpop__lbl">Messages with Legal</div>
                <div class="spacer"></div>
                <span class="tiny muted">respond to any questions here</span>
              </div>
              <${ChatThread} requestId=${r.id} viewer=${r.requesterId || r.requester} role="requester"
                counterpartLabel="the legal team" compact=${true} height=${300} />
            </div>
          </div>

          <div style="min-width:0">
            <div class="fpop__lbl" style="margin-bottom:12px">Pipeline — every step, and where it stands</div>
            <${RequesterPipeline} r=${r} />
            <div class="banner banner--info" style="align-items:flex-start;margin-top:16px">
              <${Icon} name="workflow" size=16 />
              <span class="tiny">Legal triages your request, confirms the owner and turnaround, and keeps you posted. You'll be notified at every step and asked if they need anything from you.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
