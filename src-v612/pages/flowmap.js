// SPRINT 5 / WORKSTREAM B — How It Works: the end-to-end flow map.
//
// Sprint 3 answered "show me the process, not the output" for a single record.
// This answers it for the whole department: one journey, nine stages, live counts,
// and every node click-through to that stage filtered in the Legal Workspace.
//
// Under each node: what goes IN, what the system DOES, what comes OUT. That is
// the same Input / Process / Output framing as the record spine, made visual at
// the system level.
//
// House style: plain English, no em dashes.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty } from "../ui.js";
import { navigate } from "../router.js";
import { useCollection, setWorkspaceTarget, useFormConfig } from "../store.js";
import { toUsd, licenseStatus } from "../data.js";
import { unifiedRows, rowTat, currentStageOf } from "../flow.js";
import { allReminders } from "../reminders.js";
import { drillTo } from "../drill.js";
import { startTour } from "../tour.js";

/* ---------------- the nine stages ---------------- */
// `count` receives the computed corpus; `go` sets a one-shot Workspace target.
const STAGES = [
  {
    key: "request", label: "Request raised", icon: "inbox", who: "Business",
    line: "Somebody in the business needs legal help and opens the portal.",
    input: "A need, in the requester's own words",
    action: "Guided form, duplicate check, entity and contract type captured",
    output: "A logged request with an owner queued",
    count: (c) => c.portal.length,
    unit: "raised in the portal",
    go: () => ({ lens: "log", filters: {} }),
  },
  {
    key: "triage", label: "Intake and triage", icon: "filter", who: "Legal",
    line: "Legal names the owner and the clock starts.",
    input: "The request and its attachments",
    action: "Turnaround fixed from contract type and risk, desk assigned",
    output: "A committed date nobody negotiates",
    count: (c) => c.byStage("Triage") + c.byStage("Intake"),
    unit: "in triage now",
    go: () => ({ lens: "worklist", filters: { statuses: ["New", "Triage"] } }),
  },
  {
    key: "draft", label: "Drafting", icon: "edit", who: "Legal",
    line: "The first draft comes from an approved template, not a blank page.",
    input: "The agreed position and the right template version",
    action: "Draft generated and attached to the record",
    output: "A draft with its template version recorded",
    count: (c) => c.byStage("Drafting"),
    unit: "being drafted",
    go: () => ({ lens: "worklist", filters: { statuses: ["Drafting"] } }),
  },
  {
    key: "review", label: "Review", icon: "eye", who: "Legal",
    line: "How deep the review goes is set by the risk tier, not by mood.",
    input: "The draft or the counterparty's paper",
    action: "Risk assessed, playbook deviations logged",
    output: "A reviewed position and a written deviation log",
    count: (c) => c.byStage("Legal Review") + c.byStage("Redlining"),
    unit: "under review",
    go: () => ({ lens: "worklist", filters: { statuses: ["In Review"] } }),
  },
  {
    key: "negotiate", label: "Negotiation", icon: "gitbranch", who: "Counterparty",
    line: "Every round in and out is recorded, clause by clause.",
    input: "Our draft and their redlines",
    action: "Rounds tracked with what changed and who moved",
    output: "An agreed final form, or a clear escalation",
    count: (c) => c.byStage("Negotiation"),
    unit: "in negotiation",
    go: () => ({ lens: "worklist", filters: { statuses: ["Negotiation", "In Negotiation"] } }),
  },
  {
    key: "approve", label: "Approval", icon: "checksquare", who: "Legal",
    line: "The approval chain is decided by the risk tier before anyone is asked.",
    input: "The final form",
    action: "Chain assembled by risk, drafter kept separate from approver",
    output: "A complete approval record",
    count: (c) => c.byStage("Approval"),
    unit: "awaiting approval",
    go: () => ({ lens: "worklist", filters: { statuses: ["Pending Approval"] } }),
  },
  {
    key: "sign", label: "Signature", icon: "fileCheck", who: "Both sides",
    line: "Signed counterparts are captured, not chased.",
    input: "The approved final form",
    action: "Executed counterpart uploaded and dated",
    output: "An executed agreement",
    count: (c) => c.byStage("Signature") + c.byStage("Executed"),
    unit: "at signature",
    go: () => ({ lens: "worklist", filters: { statuses: ["Awaiting Signature"] } }),
  },
  {
    key: "file", label: "Filed", icon: "database", who: "Legal",
    line: "It lands in three places at once so nothing is ever orphaned.",
    input: "The executed document",
    action: "Drive link saved, tracker row created, shelf location recorded",
    output: "A findable contract, digitally and physically",
    count: (c) => c.filed,
    unit: "filed with a Drive link",
    go: () => null, // goes to the repository instead
    to: "/repository",
  },
  {
    key: "watch", label: "Obligations and renewals", icon: "bell", who: "System",
    line: "The system watches the dates so no one has to remember them.",
    input: "Key dates and obligations from the signed contract",
    action: "Notice windows and renewals tracked, owners reminded",
    output: "A reminder before anything lapses",
    count: (c) => c.reminders,
    unit: "reminders live",
    go: () => null,
    to: "/pipelines",
  },
];

const BALL_TONE = { Business: "amber", Legal: "blue", Counterparty: "purple", "Both sides": "indigo", System: "green" };

export default function FlowMap() {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  const messages = useCollection("messages");
  const cfg = useFormConfig();
  const [sel, setSel] = useState("request");

  const corpus = useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses };
    const rows = unifiedRows(requests, matters).map((u) => ({ ...u.record, id: u.id, __tat: rowTat(u.record, ctx) }));
    const stageOf = new Map();
    rows.forEach((r) => { const s = currentStageOf(r); stageOf.set(s, (stageOf.get(s) || 0) + 1); });
    contracts.forEach((c) => { const s = currentStageOf(c); stageOf.set(s, (stageOf.get(s) || 0) + 1); });
    return {
      rows,
      portal: requests.filter((r) => r.channel === "portal"),
      byStage: (s) => stageOf.get(s) || 0,
      filed: contracts.filter((c) => c.driveLink && c.physicalRecordRef).length,
      reminders: allReminders(contracts).length,
      delayed: rows.filter((r) => r.__tat.status === "Delayed"),
      portfolio: contracts.reduce((s, c) => s + toUsd(c.value, c.currency), 0),
      messages: messages.length,
      docs: repository.length,
    };
  }, [requests, matters, contracts, repository, licenses, messages]);

  const open = (st) => {
    if (st.to) { navigate(st.to); return; }
    const t = st.go(corpus);
    if (t) { setWorkspaceTarget({ lens: t.lens }); drillTo("/workspace", "wsp", t.filters); }
    else navigate("/workspace");
  };

  const active = STAGES.find((s) => s.key === sel) || STAGES[0];

  return html`<div class="page flowpage fade-in">
    <header class="exec__head">
      <div class="exec__actions">
        <${Btn} variant="primary" icon="play" onClick=${() => startTour()}>Take the tour</${Btn}>
        <${Btn} variant="ghost" icon="dashboard" onClick=${() => navigate("/exec")}>Executive overview</${Btn}>
      </div>
    </header>

    <!-- the journey -->
    <section class="journey">
      ${STAGES.map((st, i) => {
        const count = st.count(corpus);
        return html`<${Frag} key=${st.key}>
          ${i > 0 && html`<div class="journey__link" aria-hidden="true"><${Icon} name="chevronRight" size=15 /></div>`}
          <button class=${cx("jnode", sel === st.key && "jnode--sel", count === 0 && "jnode--quiet")}
            onClick=${() => setSel(st.key)} onDoubleClick=${() => open(st)}>
            <span class="jnode__ico"><${Icon} name=${st.icon} size=15 /></span>
            <span class="jnode__count">${count}</span>
            <span class="jnode__label">${st.label}</span>
            <span class="jnode__unit">${st.unit}</span>
            <span class=${cx("jnode__who", `jnode__who--${BALL_TONE[st.who]}`)}>${st.who}</span>
          </button>
        </${Frag}>`;
      })}
    </section>

    <!-- the selected stage, in Input / Process / Output terms -->
    <section class="card card--pad jdetail">
      <div class="row wrap" style="gap:12px;margin-bottom:14px">
        <span class="jdetail__ico"><${Icon} name=${active.icon} size=18 /></span>
        <div style="min-width:0;flex:1">
          <div class="row wrap" style="gap:8px;align-items:center">
            <h2 class="exec__h2" style="margin:0">${active.label}</h2>
            <${Pill} tone=${BALL_TONE[active.who]}>${active.who} holds it</${Pill}>
            <span class="tiny muted">${active.count(corpus)} ${active.unit}</span>
          </div>
          <p class="exec__sub" style="margin-top:4px">${active.line}</p>
        </div>
        <${Btn} variant="soft" size="sm" iconRight="arrowRight" onClick=${() => open(active)}>
          ${active.to ? "Open the module" : "See what is here"}
        </${Btn}>
      </div>
      <div class="jio">
        ${[["Goes in", active.input, "download"], ["The system does", active.action, "cpu"], ["Comes out", active.output, "upload"]]
          .map(([l, t, ic]) => html`<div key=${l} class="jio__cell">
            <div class="jio__l"><${Icon} name=${ic} size=12 />${l}</div>
            <div class="jio__t">${t}</div>
          </div>`)}
      </div>
    </section>

    <!-- honest before and after -->
    <section class="exec__section">
      <div class="exec__sechead">
        <h2 class="exec__h2">What actually changed</h2>
        <span class="tiny muted">Three things a leader can check.</span>
      </div>
      <div class="ba">
        ${[
          {
            t: "One front door", icon: "inbox",
            before: "Requests arrived by email, chat and corridor conversation. Nothing had a single home, and the same job could be started twice.",
            after: `${corpus.portal.length} requests have come through the portal, each with the requester, their site and their attachments captured at the point of asking.`,
          },
          {
            t: "A turnaround that is fixed, not argued", icon: "clock",
            before: "Turnaround was agreed case by case and rarely written down, so nobody could say whether legal was slow or the business was late.",
            after: `Every request gets its date automatically from contract type and risk. ${corpus.delayed.length} item${corpus.delayed.length === 1 ? " is" : "s are"} late right now, and each one names the stage and the person holding it.`,
          },
          {
            t: "A contract you can find", icon: "database",
            before: "Signed contracts lived in folders, inboxes and filing cabinets. Renewals were discovered after the window had closed.",
            after: `${corpus.filed} contracts are filed with a Drive link, a tracker row and a shelf location, and ${corpus.reminders} reminders are already watching the dates.`,
          },
        ].map((c) => html`<div key=${c.t} class="ba__card">
          <div class="ba__head"><span class="ba__ico"><${Icon} name=${c.icon} size=15 /></span><span class="ba__t">${c.t}</span></div>
          <div class="ba__row ba__row--before">
            <span class="ba__tag">Before</span>
            <p>${c.before}</p>
          </div>
          <div class="ba__row ba__row--after">
            <span class="ba__tag ba__tag--on">Now</span>
            <p>${c.after}</p>
          </div>
        </div>`)}
      </div>
    </section>

    <!-- the two apps -->
    <section class="card card--pad col" style="gap:16px">
      <div>
        <h2 class="exec__h2">Two applications, one system of record</h2>
        <p class="exec__sub">
          The business uses its own application. Legal uses theirs. They share one contract and
          talk to each other as things happen, so neither side has to chase the other.
        </p>
      </div>
      <div class="twoapp">
        <div class="twoapp__box">
          <div class="twoapp__head"><${Icon} name="user" size=15 /><span>Requester portal</span></div>
          <div class="twoapp__sub">For the business</div>
          <ul class="twoapp__list">
            <li>Raise a request through a guided form</li>
            <li>See only your own requests and where they are</li>
            <li>Upload what legal asks for</li>
            <li>Message the lawyer handling it</li>
          </ul>
          <a class="twoapp__link" href="portal/" target="_blank" rel="noreferrer">Open the portal <${Icon} name="externalLink" size=12 /></a>
        </div>

        <div class="twoapp__bridge" aria-hidden="true">
          <div class="twoapp__wire"></div>
          <div class="twoapp__chip"><${Icon} name="refresh" size=12 />live both ways</div>
          <div class="twoapp__wire"></div>
        </div>

        <div class="twoapp__box twoapp__box--legal">
          <div class="twoapp__head"><${Icon} name="scale" size=15 /><span>LegalOS</span></div>
          <div class="twoapp__sub">For the legal department</div>
          <ul class="twoapp__list">
            <li>Every request lands in triage with a fixed date</li>
            <li>The full record: input, process, output, relationships</li>
            <li>Ask the requester for a document, chase nothing</li>
            <li>Tracker, analyzer, reminders and the audit log</li>
          </ul>
          <button class="twoapp__link" onClick=${() => navigate("/workspace")}>Open the workspace <${Icon} name="arrowRight" size=12 /></button>
        </div>
      </div>
      <div class="twoapp__foot">
        <div class="row wrap" style="gap:14px">
          ${[["One shared request format", "file"], ["One submission route", "arrowRight"], ["One message thread", "message"], ["One document store", "database"]]
            .map(([t, ic]) => html`<span key=${t} class="tagchip"><${Icon} name=${ic} size=11 />${t}</span>`)}
        </div>
        <span class="tiny muted">
          Legal controls what the portal asks for, from the list of companies to the documents
          required for each contract type, without anybody changing code.
        </span>
      </div>
    </section>
  </div>`;
}

// htm needs a component reference to group siblings without a wrapper element.
function Frag({ children }) { return children; }
