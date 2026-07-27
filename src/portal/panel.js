// SPRINT 4 — the requester's own view: the Legal Requests module, user-scoped.
//
// Same mental model as the internal list, filtered to `requesterId === me`, and
// a REQUEST DETAIL built on a read-only, requester-facing rendering of the
// WorkflowSpine: where their request is, who has it (shown as "Legal team", never
// an individual's private notes), what is pending FROM THEM, their documents, and
// the chat thread.
import { html, cx, fmt, useState, useMemo, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import {
  Btn, Pill, Status, Avatar, Progress, Empty, Field, Input, Modal, Tabs, AICard, SearchInput,
} from "../ui.js";
import { DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import {
  useCollection, addRequestAttachment, useFormConfig,
} from "../store.js";
import {
  lifecyclePathFor, stageMeta, entityName, nameOf, BALL_LABEL,
} from "../data.js";
import { buildStages, currentStageOf } from "../flow.js";
import { computeTat, tatLabel } from "../tat.js";
import { ChatThread, unreadCount, threadFor } from "../messages.js";

/* ============================================================
   What the requester is allowed to see about progress.
   Internal stage names collapse into plain-language milestones, and the
   ball-holder is either "you" or "the legal team" — never internal detail.
   ============================================================ */
const PUBLIC_STAGE = {
  "Intake": "Submitted",
  "Triage": "Being assigned",
  "Commercial Review": "With your team for commercial sign-off",
  "Legal Review": "Under legal review",
  "Drafting": "Being drafted",
  "Redlining": "Being marked up",
  "Notice Drafting": "Notice being drafted",
  "Negotiation": "In negotiation with the counterparty",
  "Approval": "Awaiting internal approval",
  "Signature": "Out for signature",
  "Notice Served": "Notice served",
  "Executed": "Signed",
  "Repository": "Completed and filed",
  "Closed": "Closed",
};
const publicStage = (s) => PUBLIC_STAGE[s] || s;

// The requester-facing view of one stage.
function publicStages(rec, ctx) {
  const stages = buildStages(rec, ctx);
  return stages.map((s) => ({
    key: s.name,
    label: publicStage(s.name),
    state: s.state,
    withYou: s.ballWith === "business",
    withCounterparty: s.ballWith === "counterparty",
    enteredAt: s.enteredAt,
    exitedAt: s.exitedAt,
    daysIn: s.daysIn,
  }));
}

/* ============================================================
   The list — my requests
   ============================================================ */
export function MyRequests({ cfg, me, stampId, rows }) {
  const messages = useCollection("messages");
  const contracts = useCollection("contracts");
  const matters = useCollection("matters");
  const requests = useCollection("requests");
  const repository = useCollection("repository");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const [company, setCompany] = useState("all");
  const [nature, setNature] = useState("all");

  const ctx = { requests, matters, contracts, repository };
  const enriched = useMemo(() => rows.map((r) => {
    const stages = buildStages(r, ctx);
    const tat = computeTat(r, stages, new Date());
    const active = stages.find((s) => s.state === "active" || s.state === "blocked");
    return {
      ...r,
      __tat: tat,
      __stage: publicStage(currentStageOf(r)),
      __withYou: !!(active && active.ballWith === "business"),
      __unread: unreadCount(r.id, stampId, messages),
      __outstanding: (r.requiredDocs || []).filter((d) => d.status === "requested").length,
    };
  }), [rows, messages, contracts, matters, repository]);

  const isDone = (r) => /Approved|Completed|Rejected/.test(r.status || "");
  let view = enriched;
  if (status === "open") view = view.filter((r) => !isDone(r));
  if (status === "done") view = view.filter(isDone);
  if (company !== "all") view = view.filter((r) => r.company === company);
  if (nature !== "all") view = view.filter((r) => r.natureOfMatter === nature);
  if (q) {
    const s = q.toLowerCase();
    view = view.filter((r) => (r.title + " " + r.id + " " + (r.counterparty || "")).toLowerCase().includes(s));
  }
  view = [...view].sort((a, b) => new Date(b.requestDate || b.created) - new Date(a.requestDate || a.created));

  const needsMe = enriched.filter((r) => r.__outstanding > 0 || r.__withYou);
  const companies = (cfg.companies || []).filter((c) => c.enabled);
  const natures = (cfg.natures || []).filter((n) => n.enabled);

  return html`<div class="ppage">
    <div class="pwiz__head">
      <div style="min-width:0">
        <div class="pwiz__title">My requests</div>
        <div class="tiny muted">Everything you have raised with the legal team.</div>
      </div>
      <${Btn} variant="primary" icon="plus" onClick=${() => navigate("/new")}>New request</${Btn}>
    </div>

    <${StatStrip} stats=${[
      { value: enriched.length, label: "Total raised" },
      { value: enriched.filter((r) => !isDone(r)).length, label: "In progress" },
      { value: needsMe.length, label: "Waiting on me" },
      { value: enriched.reduce((n, r) => n + r.__unread, 0), label: "Unread replies" },
      { value: enriched.filter((r) => r.__tat.status === "Delayed").length, label: "Running late" },
    ]} />

    ${needsMe.length > 0 && html`<div class="banner banner--warn" style="margin-bottom:16px;align-items:flex-start">
      <${Icon} name="alertCircle" size=17 />
      <div style="flex:1;min-width:0">
        <div class="strong tiny">${needsMe.length} request${needsMe.length === 1 ? "" : "s"} need something from you</div>
        <div class="tiny" style="margin-top:3px;opacity:.9">
          ${needsMe.slice(0, 3).map((r) => `${r.id}${r.__outstanding ? ` — ${r.__outstanding} document${r.__outstanding === 1 ? "" : "s"} requested` : " — awaiting your input"}`).join(" · ")}
        </div>
      </div>
    </div>`}

    <div class="row wrap" style="gap:10px;margin-bottom:14px">
      <div style="width:250px"><${SearchInput} value=${q} onChange=${setQ} placeholder="Search my requests…" /></div>
      <div class="lens">
        ${[["open", "In progress"], ["done", "Completed"], ["all", "All"]].map(([k, l]) => html`<button key=${k}
          class=${cx(status === k && "active")} onClick=${() => setStatus(k)}>${l}</button>`)}
      </div>
      <select class="select" style="width:auto;min-width:170px" value=${company} onChange=${(e) => setCompany(e.target.value)}>
        <option value="all">All companies</option>
        ${companies.map((c) => html`<option key=${c.key} value=${c.key}>${c.label}</option>`)}
      </select>
      <select class="select" style="width:auto;min-width:170px" value=${nature} onChange=${(e) => setNature(e.target.value)}>
        <option value="all">All natures</option>
        ${natures.map((n) => html`<option key=${n.key} value=${n.key}>${n.label}</option>`)}
      </select>
    </div>

    <${DataTable} onRow=${(r) => navigate("/requests/" + r.id)} rows=${view}
      empty=${html`<${Empty} icon="inbox" title=${rows.length ? "Nothing matches those filters" : "You have not raised anything yet"}
        text=${rows.length ? "Try widening the filters." : "Raise your first request and follow it end to end."}
        action=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/new")}>New request</${Btn}>`} />`}
      columns=${[
        { key: "id", label: "Request ID", mono: true, width: "88px" },
        { key: "natureOfMatter", label: "Nature", width: "112px", render: (r) => html`<${Pill} tone="gray">${r.natureOfMatter}</${Pill}>` },
        { key: "company", label: "Company", width: "120px", render: (r) => html`<span class="tiny strong">${entityName(r.entityId)}</span>` },
        { key: "contractType", label: "Contract type", width: "132px", render: (r) => r.contractType ? html`<${Pill} tone="indigo">${r.contractType}</${Pill}>` : html`<span class="tiny muted">—</span>` },
        { key: "title", label: "Request", render: (r) => html`<div class="wrapcell">
            <div class="cell-strong">${r.title}</div>
            <div class="tiny muted">${r.counterparty && r.counterparty !== "—" ? r.counterparty : r.requestType}</div>
          </div>` },
        { key: "requestDate", label: "Raised", width: "84px", render: (r) => html`<span class="tiny strong">${fmt.dateShort(r.requestDate || r.created)}</span>` },
        { key: "dueDate", label: "Target", width: "84px", render: (r) => html`<div>
            <div class="tiny strong">${fmt.dateShort(r.__tat.dueAt)}</div>
            <div class="tiny muted">${r.__tat.days}d</div>
          </div>` },
        { key: "tat", label: "Status", width: "134px", render: (r) => html`<div class="col" style="gap:3px;align-items:flex-start">
            <span class=${cx("tatpill", `tatpill--${r.__tat.tone}`)}><span class="tatpill__dot"></span>${r.__tat.status}</span>
            <span class="tiny muted">${r.__stage}</span>
          </div>` },
        { key: "flags", label: "", width: "98px", render: (r) => html`<div class="row" style="gap:5px;justify-content:flex-end">
            ${r.__outstanding > 0 && html`<span class="pflag pflag--warn" title="Documents requested"><${Icon} name="paperclip" size=11 />${r.__outstanding}</span>`}
            ${r.__unread > 0 && html`<span class="pflag pflag--new" title="Unread messages"><${Icon} name="message" size=11 />${r.__unread}</span>`}
            ${r.__withYou && r.__outstanding === 0 && html`<span class="pflag pflag--warn" title="Waiting on you"><${Icon} name="clock" size=11 /></span>`}
          </div>` },
      ]} />
  </div>`;
}

/* ============================================================
   Upload modal — plain, and able to satisfy a specific ask
   ============================================================ */
function UploadModal({ requestId, requiredDoc, by, onClose }) {
  const [name, setName] = useState(requiredDoc ? requiredDoc.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() + ".pdf" : "");
  const [kind, setKind] = useState(requiredDoc ? requiredDoc.name : "Attachment");
  const submit = () => {
    if (!name.trim()) return;
    addRequestAttachment(requestId, { name: name.trim(), kind, sizeKb: 420 }, { by, requiredDocId: requiredDoc ? requiredDoc.id : null });
    onClose();
  };
  return html`<${Modal} title=${requiredDoc ? "Upload: " + requiredDoc.name : "Upload a document"} icon="upload" width=${520} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" onClick=${submit} disabled=${!name.trim()}>Upload</${Btn}>`}>
    <div class="col" style="gap:15px">
      ${requiredDoc && html`<div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="clipboard" size=17 />
        <div>
          <div class="strong tiny">Legal asked for this${requiredDoc.requestedAt ? " " + fmt.rel(requiredDoc.requestedAt) : ""}</div>
          <div class="tiny" style="margin-top:3px;opacity:.9">${requiredDoc.name}</div>
        </div>
      </div>`}
      <${Field} label="File name">
        <${Input} placeholder="e.g. board-resolution-signed.pdf" value=${name} onInput=${(e) => setName(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter") submit(); }} />
      </${Field}>
      <${Field} label="What is it?">
        <${Input} placeholder="e.g. Board resolution" value=${kind} onInput=${(e) => setKind(e.target.value)} />
      </${Field}>
      <div class="tiny muted">
        The file is saved against your request and appears on the legal team's side immediately.
      </div>
    </div>
  </${Modal}>`;
}

/* ============================================================
   The request detail — read-only requester-facing spine
   ============================================================ */
export function RequestDetail({ id, cfg, me, stampId }) {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const messages = useCollection("messages");
  const [tab, setTab] = useState("progress");
  const [upload, setUpload] = useState(null);

  const r = requests.find((x) => x.id === id);

  if (!r) {
    return html`<div class="ppage">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/requests")}>My requests</${Btn}>
      <${Empty} icon="search" title="Request not found" text="It may have been withdrawn." />
    </div>`;
  }
  // Scope guard: a requester only ever sees their own submissions.
  if ((r.requesterId || r.requester) !== stampId) {
    return html`<div class="ppage">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/requests")}>My requests</${Btn}>
      <${Empty} icon="lock" title="Not your request" text="You can only see requests you raised." />
    </div>`;
  }

  const ctx = { requests, matters, contracts, repository };
  const stages = publicStages(r, ctx);
  const tat = computeTat(r, buildStages(r, ctx), new Date());
  const activeIdx = Math.max(0, stages.findIndex((s) => s.state === "active" || s.state === "blocked"));
  const active = stages[activeIdx];
  const pct = Math.round(((activeIdx + 1) / stages.length) * 100);

  const docs = repository.filter((d) => d.requestId === r.id);
  const outstanding = (r.requiredDocs || []).filter((d) => d.status === "requested");
  const unread = unreadCount(r.id, stampId, messages);
  const thread = threadFor(r.id, messages);

  return html`<div class="ppage">
    <div class="row" style="margin-bottom:14px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/requests")}>My requests</${Btn}>
    </div>

    <div class="pwiz__head" style="margin-bottom:16px">
      <div style="min-width:0">
        <div class="row wrap" style="gap:8px;margin-bottom:7px">
          <span class="mono muted">${r.id}</span>
          <${Pill} tone="gray">${r.natureOfMatter}</${Pill}>
          ${r.contractType && html`<${Pill} tone="indigo">${r.contractType}</${Pill}>`}
          <span class=${cx("tatpill", `tatpill--${tat.tone}`)}><span class="tatpill__dot"></span>${tat.status}</span>
          ${r.routedManually && html`<${Pill} tone="amber">manual routing</${Pill}>`}
        </div>
        <div class="pwiz__title">${r.title}</div>
        <div class="tiny muted" style="margin-top:4px">
          ${entityName(r.entityId)}${r.counterparty && r.counterparty !== "—" ? " · " + r.counterparty : ""} ·
          raised ${fmt.date(r.requestDate || r.created)} from ${r.source || "—"}
        </div>
      </div>
      <${Btn} variant="soft" icon="upload" onClick=${() => setUpload({})}>Upload a document</${Btn}>
    </div>

    <!-- what is needed from them, first and loudest -->
    ${outstanding.length > 0 && html`<div class="pask">
      <div class="row" style="gap:11px;align-items:flex-start">
        <div class="metric__icon" style="width:38px;height:38px;background:var(--warning-bg);color:var(--warning);flex:none">
          <${Icon} name="alertCircle" size=19 />
        </div>
        <div style="flex:1;min-width:0">
          <div class="strong" style="font-size:14px">Legal needs ${outstanding.length} document${outstanding.length === 1 ? "" : "s"} from you</div>
          <div class="tiny muted" style="margin-top:2px">Your request cannot move forward until these arrive.</div>
          <div class="col" style="gap:7px;margin-top:12px">
            ${outstanding.map((d) => html`<div key=${d.id} class="docrow">
              <${Icon} name="clipboard" size=15 style=${{ color: "var(--warning)", flex: "none" }} />
              <div style="flex:1;min-width:0">
                <div class="strong tiny">${d.name}</div>
                <div class="tiny muted">asked ${d.requestedAt ? fmt.rel(d.requestedAt) : "recently"}</div>
              </div>
              <${Btn} variant="primary" size="sm" icon="upload" onClick=${() => setUpload({ requiredDoc: d })}>Upload</${Btn}>
            </div>`)}
          </div>
        </div>
      </div>
    </div>`}

    <div class="card" style="margin-bottom:16px">
      <div style="padding:6px 18px 0">
        <${Tabs} active=${tab} onChange=${setTab} tabs=${[
          { key: "progress", label: "Progress", icon: "workflow" },
          { key: "details", label: "What I asked for", icon: "inbox" },
          { key: "documents", label: "Documents", icon: "file", count: docs.length + (r.attachments || []).length },
          { key: "messages", label: "Messages", icon: "message", count: unread || thread.length || undefined },
        ]} />
      </div>
      <div class="card__body">
        ${tab === "progress" && html`<div class="col" style="gap:18px">
          <!-- headline: where it is and who has it -->
          <div class=${cx("pstatus", tat.status === "Delayed" && "pstatus--late")}>
            <div style="flex:1;min-width:0">
              <div class="tiny" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;opacity:.7">Right now</div>
              <div class="strong" style="font-size:16px;margin-top:3px">${active ? active.label : "Completed"}</div>
              <div class="tiny" style="margin-top:4px;opacity:.9">
                ${active && active.withYou
                  ? "Waiting on you — see the documents above."
                  : active && active.withCounterparty
                    ? "With the counterparty."
                    : "With the legal team — nothing needed from you."}
              </div>
            </div>
            <div style="flex:none;text-align:right">
              <div class="tiny" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;opacity:.7">Target</div>
              <div class="strong" style="font-size:15px;margin-top:3px">${fmt.date(tat.dueAt)}</div>
              <div class="tiny" style="margin-top:2px;opacity:.9">
                ${tat.status === "Delayed" ? `${tat.overdueBy} working day${tat.overdueBy === 1 ? "" : "s"} over` : tatLabel(tat)}
              </div>
            </div>
          </div>

          <div>
            <div class="row" style="margin-bottom:8px">
              <span class="strong tiny">Step ${activeIdx + 1} of ${stages.length}</span>
              <div class="spacer"></div>
              <span class="tiny muted">${pct}% through the process</span>
            </div>
            <${Progress} value=${pct} tone=${tat.status === "Delayed" ? "red" : active && active.withYou ? "amber" : "green"} />
          </div>

          <!-- the plain-language journey; no internal owners, no privileged notes -->
          <div class="ptrack">
            ${stages.map((s, i) => html`<div key=${s.key} class=${cx("ptrack__row", `ptrack__row--${s.state}`)}>
              <div class="ptrack__dot">
                ${s.state === "done" ? html`<${Icon} name="check" size=12 />` : i === activeIdx ? html`<span class="ptrack__pulse"></span>` : i + 1}
              </div>
              <div style="flex:1;min-width:0">
                <div class=${cx("ptrack__label", i === activeIdx && "strong")}>${s.label}</div>
                <div class="tiny muted">
                  ${s.state === "done"
                    ? `completed ${s.exitedAt ? fmt.dateShort(s.exitedAt) : ""}`
                    : i === activeIdx
                      ? `${s.daysIn} working day${s.daysIn === 1 ? "" : "s"} here${s.withYou ? " · needs you" : ""}`
                      : "not started"}
                </div>
              </div>
              ${i === activeIdx && html`<${Pill} tone=${s.withYou ? "amber" : "blue"}>${s.withYou ? "You" : s.withCounterparty ? "Counterparty" : "Legal team"}</${Pill}>`}
            </div>`)}
          </div>

          <div class="tiny muted">
            You are seeing the process and your part in it. Internal legal notes, risk assessments and
            privileged analysis stay inside LegalOS.
          </div>
        </div>`}

        ${tab === "details" && html`<div class="col" style="gap:16px">
          <div class="kvgrid">
            ${[
              ["Nature of matter", r.natureOfMatter],
              ["Company / entity", entityName(r.entityId)],
              ["Type of contract", r.contractType || "—"],
              ["Request type", r.requestType],
              ["Counterparty", r.counterparty && r.counterparty !== "—" ? r.counterparty : "—"],
              ["Value", r.value ? fmt.moneyFull(r.value, r.currency) : "—"],
              ["Raised on", fmt.date(r.requestDate || r.created)],
              ["Needed by", r.dueDate ? fmt.date(r.dueDate) : "no date given"],
              ["Committed target", fmt.date(tat.dueAt)],
              ["Turnaround", `${tat.days} working days`],
              ["Raised by", `${me.name} · ${me.email}`],
              ["Raised from", r.source || "—"],
            ].map(([l, v]) => html`<div key=${l} class="kv"><div class="kv__l">${l}</div><div class="kv__v">${v}</div></div>`)}
          </div>
          ${r.description && html`<div>
            <div class="fpop__lbl">What I asked for</div>
            <div class="spine__desc" style="margin-top:7px">${r.description}</div>
          </div>`}
          ${(r.requiredDocs || []).length > 0 && html`<div>
            <div class="fpop__lbl">Document checklist</div>
            <div class="col" style="gap:6px;margin-top:8px">
              ${r.requiredDocs.map((d) => html`<div key=${d.id} class="row" style="gap:8px">
                <${Icon} name=${d.status === "received" ? "checkcircle" : "circle"} size=15
                  style=${{ color: d.status === "received" ? "var(--success)" : "var(--warning)", flex: "none" }} />
                <span class="tiny" style="flex:1">${d.name}</span>
                ${d.status === "received"
                  ? html`<${Pill} tone="green">received</${Pill}>`
                  : html`<${Btn} variant="soft" size="sm" icon="upload" onClick=${() => setUpload({ requiredDoc: d })}>Upload</${Btn}>`}
              </div>`)}
            </div>
          </div>`}
        </div>`}

        ${tab === "documents" && html`<div class="col" style="gap:14px">
          <div class="row">
            <span class="strong">Documents on this request</span>
            <div class="spacer"></div>
            <${Btn} variant="soft" size="sm" icon="upload" onClick=${() => setUpload({})}>Upload</${Btn}>
          </div>
          ${docs.length === 0 && (r.attachments || []).length === 0
            ? html`<${Empty} icon="file" title="No documents yet" text="Anything you upload here goes straight to the legal team."
                action=${html`<${Btn} variant="primary" icon="upload" onClick=${() => setUpload({})}>Upload a document</${Btn}>`} />`
            : html`<div class="col" style="gap:7px">
                ${docs.map((d) => html`<div key=${d.id} class="docrow">
                  <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2);flex:none">
                    <${Icon} name="file" size=15 />
                  </div>
                  <div style="flex:1;min-width:0">
                    <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
                    <div class="tiny muted">${d.kind} · uploaded ${fmt.rel(d.uploadedAt)}${d.sizeKb ? " · " + d.sizeKb + " KB" : ""}</div>
                  </div>
                  ${d.driveLink && html`<a class="tagchip" href=${d.driveLink} target="_blank" rel="noreferrer"><${Icon} name="externalLink" size=11 />Open</a>`}
                </div>`)}
                ${(r.attachments || []).filter((a) => !docs.some((d) => d.name === a.name)).map((a) => html`<div key=${a.id} class="docrow">
                  <${Icon} name="paperclip" size=15 />
                  <div style="flex:1;min-width:0"><div class="strong tiny">${a.name}</div><div class="tiny muted">${a.kind} · attached at submission</div></div>
                </div>`)}
              </div>`}
        </div>`}

        ${tab === "messages" && html`<div class="col" style="gap:12px">
          <div class="banner banner--info" style="padding:10px 13px;align-items:flex-start">
            <${Icon} name="message" size=16 />
            <span class="tiny">
              Anything you write here goes to the lawyer handling your request, and their replies come
              back to this thread. Use it for questions and context — not for approvals.
            </span>
          </div>
          <${ChatThread} requestId=${r.id} viewer=${stampId} role="requester" counterpartLabel="the legal team" compact=${true} height=${380} />
        </div>`}
      </div>
    </div>

    ${upload && html`<${UploadModal} requestId=${r.id} requiredDoc=${upload.requiredDoc} by=${stampId} onClose=${() => setUpload(null)} />`}
  </div>`;
}

export default MyRequests;
