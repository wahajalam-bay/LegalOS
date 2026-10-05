// CONTRACT REQUESTS — the Commercial → Legal intake workspace.
//
// This page was a database export: eight equal cards mostly reading zero, every
// filter permanently on screen, and a fourteen-column table that needed a
// horizontal scrollbar before it had said anything. A draft with nothing filled
// in rendered as eleven dashes, which tells the requester nothing about what is
// left to do.
//
// WHAT IT IS NOW
//   a role-aware summary — a requester is shown their own work, Legal is shown
//   the intake queue, and nobody is shown a metric they cannot act on
//   view tabs, so "mine" and "waiting on me" are places rather than filters
//   one row of primary filters; the rest behind More filters
//   EIGHT columns that group related facts instead of one column per field:
//   a request is its reference AND its type; a workflow is its stage AND
//   whether Finance is next; a legal owner is the assignee AND the target AND
//   the SLA. Three columns describing one thing is three columns.
//   empty drafts that say what is missing rather than printing dashes
//
// The business rules are untouched: everything here is read from the same
// summary the server computes.
import { html, cx, fmt, useState, useEffect, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Modal, Drawer } from "../ui.js";
import { PageHead } from "../parts.js";
import { navigate, useQuery } from "../router.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { useActiveUser } from "../rbac.js";
import { STATUS_TONE } from "./contractrequest.js";

/* Which buckets matter to whom. A requester has no action on an SLA that has
   not started, and Legal does not need "my drafts" at the top of their queue. */
const SUMMARY = {
  requester: [
    { label: "Draft", test: (r) => r.status === "Draft", set: { crstatus: "Draft" } },
    { label: "Awaiting approval", test: (r) => ["HOD Approval", "Finance Review"].includes(r.status), set: { crstage: "approval" } },
    { label: "Returned to me", test: (r) => r.status === "Returned to Requester", set: { crstatus: "Returned to Requester" }, urgent: true },
    { label: "With Legal", test: (r) => ["Legal Intake", "Accepted & Assigned", "In Drafting"].includes(r.status), set: { crstage: "legal" } },
    { label: "Closed", test: (r) => r.status === "Closed", set: { crstatus: "Closed" } },
  ],
  hod: [
    { label: "Awaiting my approval", test: (r) => r.status === "HOD Approval", set: { crstatus: "HOD Approval" }, urgent: true },
    { label: "Returned", test: (r) => r.status === "Returned to Requester", set: { crstatus: "Returned to Requester" } },
    { label: "Approved recently", test: (r) => ["Finance Review", "Legal Intake", "Accepted & Assigned", "In Drafting", "Closed"].includes(r.status), set: { crstage: "past-hod" } },
  ],
  finance: [
    { label: "Awaiting finance review", test: (r) => r.status === "Finance Review", set: { crstatus: "Finance Review" }, urgent: true },
    { label: "Returned", test: (r) => r.status === "Returned to Requester", set: { crstatus: "Returned to Requester" } },
    { label: "Approved", test: (r) => ["Legal Intake", "Accepted & Assigned", "In Drafting", "Closed"].includes(r.status), set: { crstage: "past-finance" } },
  ],
  legal: [
    { label: "Awaiting legal intake", test: (r) => r.status === "Legal Intake", set: { crstatus: "Legal Intake" }, urgent: true },
    { label: "Returned", test: (r) => r.status === "Returned to Requester", set: { crstatus: "Returned to Requester" } },
    { label: "Accepted / assigned", test: (r) => ["Accepted & Assigned", "In Drafting"].includes(r.status), set: { crstage: "accepted" } },
    { label: "SLA at risk", test: (r) => r.slaState === "at risk", set: { crsla: "at risk" } },
    { label: "Overdue", test: (r) => r.slaState === "overdue", set: { crsla: "overdue" }, urgent: true },
  ],
};

const STAGE_SETS = {
  approval: ["HOD Approval", "Finance Review"],
  legal: ["Legal Intake", "Accepted & Assigned", "In Drafting"],
  accepted: ["Accepted & Assigned", "In Drafting"],
  "past-hod": ["Finance Review", "Legal Intake", "Accepted & Assigned", "In Drafting", "Closed"],
  "past-finance": ["Legal Intake", "Accepted & Assigned", "In Drafting", "Closed"],
};

/* What a reader is, for this page. Somebody can be more than one thing -- a
   commercial lead raises requests AND approves them -- so the tabs decide what
   they are looking at rather than the role deciding for them. */
function rolesOf(viewer) {
  const legal = !!(viewer && ["head", "lead", "member", "paralegal"].includes(viewer.rbac)
    && String(viewer.dept || "Legal") === "Legal");
  const finance = !!(viewer && String(viewer.dept || "").toLowerCase() === "finance");
  return { legal, finance, requester: true };
}

export default function ContractRequests() {
  const [q, patch] = useQuery();
  const viewer = useActiveUser() || {};
  const me = String(viewer.email || "").toLowerCase();
  const roles = rolesOf(viewer);
  const [rows, setRows] = useState(null);
  const [types, setTypes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => { api.crf.list().then((d) => setRows(d.requests || []), () => setRows([])); }, []);
  useEffect(() => { api.crf.types().then((d) => setTypes(d.types || []), () => setTypes([])); }, []);

  if (!rows) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Contract Requests" />
      <div class="tiny muted" style="padding:20px 2px">Loading…</div></div>`;
  }

  const isMine = (r) => r.requesterEmail && String(r.requesterEmail).toLowerCase() === me;
  const waitingOnMe = (r) => (roles.legal && r.status === "Legal Intake")
    || (roles.finance && r.status === "Finance Review")
    || (String(r.approvingHod || "").toLowerCase() === me && r.status === "HOD Approval")
    || (isMine(r) && ["Draft", "Returned to Requester"].includes(r.status));

  /* The tabs a reader actually has. "All requests" only where they can see
     more than their own. */
  const tabs = [
    { key: "mine", label: "My requests", n: rows.filter(isMine).length },
    { key: "action", label: "Awaiting my action", n: rows.filter(waitingOnMe).length },
    ...(roles.legal ? [{ key: "intake", label: "Legal intake", n: rows.filter((r) => r.status === "Legal Intake").length },
      { key: "assigned", label: "Assigned to me", n: rows.filter((r) => r.assignee && viewer.name && r.assignee === viewer.name).length }] : []),
    ...(roles.legal || roles.finance ? [{ key: "all", label: "All requests", n: rows.length }] : []),
  ];
  const tab = tabs.some((t) => t.key === q.crview) ? q.crview
    : (roles.legal ? "action" : "mine");

  const inTab = (r) => (tab === "mine" ? isMine(r)
    : tab === "action" ? waitingOnMe(r)
      : tab === "intake" ? r.status === "Legal Intake"
        : tab === "assigned" ? (r.assignee && viewer.name && r.assignee === viewer.name)
          : true);

  const scope = rows.filter(inTab);
  const summaryFor = tab === "intake" || tab === "assigned" ? SUMMARY.legal
    : roles.legal && tab === "all" ? SUMMARY.legal
      : roles.finance && tab === "action" ? SUMMARY.finance
        : tab === "action" && String(viewer.rbac) === "lead" ? SUMMARY.hod
          : SUMMARY.requester;

  const f = {
    type: q.crtype || "", status: q.crstatus || "", dept: q.crdept || "",
    stage: q.crstage || "", priority: q.crprio || "", finance: q.crfin || "",
    docs: q.crdocs || "", assignee: q.crassignee || "", sla: q.crsla || "",
    entity: q.crentity || "", requester: q.crreq || "", hod: q.crhod || "",
    term: (q.crq || "").trim().toLowerCase(),
  };
  const shown = scope.filter((r) => {
    if (f.type && r.type !== f.type) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.stage && !(STAGE_SETS[f.stage] || []).includes(r.status)) return false;
    if (f.dept && r.department !== f.dept) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.finance === "yes" && !r.financeRequired) return false;
    if (f.finance === "no" && r.financeRequired) return false;
    if (f.docs === "missing" && r.attachmentsComplete) return false;
    if (f.docs === "complete" && !r.attachmentsComplete) return false;
    if (f.assignee && r.assignee !== f.assignee) return false;
    if (f.sla && r.slaState !== f.sla) return false;
    if (f.entity && r.entity !== f.entity) return false;
    if (f.requester && r.requester !== f.requester) return false;
    if (f.hod && r.approvingHod !== f.hod) return false;
    if (f.term && !(r.id + " " + (r.reference || "") + " " + r.requester + " "
      + r.counterparty + " " + r.entity).toLowerCase().includes(f.term)) return false;
    return true;
  });

  const FILTER_KEYS = ["crtype", "crstatus", "crdept", "crstage", "crprio", "crfin",
    "crdocs", "crassignee", "crsla", "crentity", "crreq", "crhod", "crq"];
  const clearAll = () => patch(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])));
  const chips = FILTER_KEYS.map((k) => [k, q[k]]).filter(([, v]) => v);
  const opts = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();

  const sel = (key, label, options) => html`<select class="input crfsel" aria-label=${label}
    value=${q[key] || ""} onChange=${(e) => patch({ [key]: e.target.value })}>
    <option value="">${label}</option>
    ${options.map((o) => { const v = o.value === undefined ? o : o.value;
    return html`<option key=${v} value=${v}>${o.label === undefined ? o : o.label}</option>`; })}
  </select>`;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Contract Requests" sub="Commercial → Legal contract intake"
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>New contract request</${Btn}>`} />

    ${creating && html`<${NewRequest} types=${types} onClose=${() => setCreating(false)} />`}
    ${more && html`<${MoreFilters} q=${q} patch=${patch} opts=${opts} onClose=${() => setMore(false)} />`}

    ${/* Four or five figures the reader can act on — not eight cards of zero. */ ""}
    <div class="crfsum" role="group" aria-label="Summary">
      ${summaryFor.map((k) => { const n = scope.filter(k.test).length;
    const on = Object.entries(k.set).every(([kk, vv]) => q[kk] === vv);
    return html`<button key=${k.label} type="button"
      class=${cx("crfcard", on && "crfcard--on", n === 0 && "crfcard--zero", k.urgent && n > 0 && "crfcard--act")}
      aria-pressed=${on ? "true" : "false"}
      onClick=${() => patch(Object.assign({ crstatus: "", crstage: "", crsla: "" }, on ? {} : k.set))}>
      <span class="crfcard__v">${n}</span>
      <span class="crfcard__l">${k.label}</span>
    </button>`; })}
    </div>

    <nav class="crftabs" aria-label="Views">
      ${tabs.map((t) => html`<button key=${t.key} type="button"
        class=${cx("crftab", tab === t.key && "crftab--on")}
        aria-current=${tab === t.key ? "page" : undefined}
        onClick=${() => patch({ crview: t.key })}>
        ${t.label}${t.n ? html`<span class="crftab__n">${t.n}</span>` : ""}
      </button>`)}
    </nav>

    <div class="crfbar2">
      <div class="crfsearch">
        <${Icon} name="search" size=15 />
        <input class="input" aria-label="Search contract requests"
          placeholder="Search ref, requester, counterparty, entity…"
          value=${f.term} onInput=${(e) => patch({ crq: e.target.value })} />
      </div>
      ${/* NAMED, NOT NUMBERED (§33). The schema id keys the form and belongs in
            the URL; it does not belong in a dropdown a requester reads. */ ""}
      ${sel("crtype", "Agreement type", types.map((t) => ({ value: t.key, label: t.label || t.short })))}
      ${sel("crstatus", "Status", opts("status"))}
      ${sel("crdept", "Department", opts("department"))}
      <button type="button" class=${cx("fltbtn", chips.length > 3 && "fltbtn--on")} onClick=${() => setMore(true)}>
        <${Icon} name="filter" size=13 /> More filters</button>
      <div class="spacer"></div>
      <span class="tiny muted">${shown.length} of ${scope.length}</span>
    </div>

    ${chips.length > 0 && html`<div class="row wrap" style="gap:6px;margin-bottom:10px">
      ${chips.map(([k, v]) => html`<button key=${k} type="button" class="chip"
        onClick=${() => patch({ [k]: "" })}>${v} <${Icon} name="x" size=11 /></button>`)}
      <button type="button" class="linkbtn tiny" onClick=${clearAll}>Clear all</button>
    </div>`}

    ${shown.length === 0
    ? html`<${Empty} icon="file" title=${tab === "mine" ? "You have not raised a contract request yet"
      : "Nothing here"} text=${tab === "action" ? "Nothing is waiting on you."
      : "Raise one and it appears here."} />`
    : html`<${Register} rows=${shown} />`}
  </div>`;
}

/* ------------------------------------------------------------ the register */

/* Eight columns, each carrying a whole fact rather than a field. Sticky first
   column so the reference stays put if somebody widens the table. */
function Register({ rows }) {
  const open = (r) => navigate("/contract-requests/" + r.id);
  return html`<${Fragment}>
    <div class="crftable">
      <table class="table crfreg">
        <thead><tr>
          <th class="crfreg__sticky">Request</th>
          <th>Parties</th>
          <th>Required by</th>
          <th>Workflow</th>
          <th>Legal owner</th>
          <th>Documents</th>
          <th class="crfreg__act"><span class="sr-only">Open</span></th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => html`<tr key=${r.id} class="rowlink" tabIndex=${0} role="link"
            aria-label=${"Open " + (r.reference || r.id)}
            onClick=${() => open(r)}
            onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r); } }}>
            <td class="crfreg__sticky">
              <div class="crfref">${r.reference || r.id}</div>
              <div class="tiny muted">${r.typeLabel} · ${r.type}</div>
            </td>
            <td><${Parties} r=${r} /></td>
            <td>
              <div class="tiny">${r.requiredBy ? fmt.date(r.requiredBy) : html`<span class="muted">Not set</span>`}</div>
              ${r.priority === "Urgent"
    ? html`<${Pill} tone="amber">Urgent</${Pill}>`
    : html`<span class="tiny muted">Standard</span>`}
            </td>
            <td><${Workflow} r=${r} /></td>
            <td><${Owner} r=${r} /></td>
            <td><${Docs} r=${r} /></td>
            <td class="crfreg__act"><span class="crfopen">${r.status === "Draft" ? "Continue" : "Open"} →</span></td>
          </tr>`)}
        </tbody>
      </table>
    </div>

    ${/* On a phone the same rows are cards. A fourteen-column table does not
          become usable by being scrolled sideways. */ ""}
    <div class="crfcards">
      ${rows.map((r) => html`<button key=${r.id} type="button" class="crfcardrow" onClick=${() => open(r)}>
        <div class="crfref">${r.reference || r.id}</div>
        <div class="tiny muted">${r.typeLabel} · ${r.type}</div>
        <div class="row wrap" style="gap:6px;margin-top:6px">
          <${Pill} tone=${STATUS_TONE[r.status] || "gray"} dot=${true}>${r.status}</${Pill}>
          ${r.priority === "Urgent" && html`<${Pill} tone="amber">Urgent</${Pill}>`}
        </div>
        <div class="tiny muted" style="margin-top:6px">
          ${r.counterparty || "Parties incomplete"} · ${r.requiredBy ? "required " + fmt.date(r.requiredBy) : "no date"}
        </div>
        <div class="tiny" style="margin-top:4px">${r.mandatoryDone}/${r.mandatoryTotal} required documents</div>
        <span class="crfopen">${r.status === "Draft" ? "Continue" : "Open"} →</span>
      </button>`)}
    </div>
  </${Fragment}>`;
}

/* A draft with nothing in it should say what is missing. Eleven dashes is a
   row that has told the requester nothing. */
function Parties({ r }) {
  if (!r.entity && !r.counterparty) {
    return html`<span class="tiny muted">Parties incomplete</span>`;
  }
  return html`<div class="tiny">${r.entity || "Entity not set"}</div>
    <div class="tiny muted">↔ ${r.counterparty || "Counterparty not set"}</div>`;
}

/* One workflow column. Stage, and what comes next -- three columns describing
   one thing is three columns. */
function Workflow({ r }) {
  const next = r.status === "HOD Approval" ? (r.financeRequired ? "Finance next" : "Legal next")
    : r.status === "Finance Review" ? "Legal next"
      : r.status === "Draft" ? (r.financeRequired ? "Finance will be required" : "Finance not required")
        : "";
  return html`<${Fragment}>
    <${Pill} tone=${STATUS_TONE[r.status] || "gray"} dot=${true}>${r.status}</${Pill}>
    ${next && html`<div class="tiny muted" style="margin-top:3px">${next}</div>`}
    ${r.escalated && html`<div class="tiny" style="color:var(--danger-text)">Escalated</div>`}
  </${Fragment}>`;
}

function Owner({ r }) {
  if (!r.assignee) return html`<span class="tiny muted">Not assigned</span>`;
  const tone = r.slaState === "overdue" ? "red" : r.slaState === "at risk" ? "amber" : "green";
  return html`<${Fragment}>
    <div class="tiny">${r.assignee}</div>
    ${r.targetDate && html`<div class="tiny muted">Target ${fmt.date(r.targetDate)}</div>`}
    ${r.slaStartedAt && html`<${Pill} tone=${tone}>${r.slaDays == null ? r.slaState
    : r.slaDays < 0 ? Math.abs(r.slaDays) + "d overdue" : r.slaDays + "d left"}</${Pill}>`}
  </${Fragment}>`;
}

function Docs({ r }) {
  const missing = r.mandatoryTotal - r.mandatoryDone;
  const tone = r.attachmentsComplete ? "green" : missing > 0 ? "red" : "gray";
  return html`<${Fragment}>
    <${Pill} tone=${tone}>${r.mandatoryDone} / ${r.mandatoryTotal} required</${Pill}>
    ${missing > 0 && html`<div class="tiny muted" style="margin-top:3px">${missing} missing</div>`}
    ${r.documents > r.mandatoryDone && html`<div class="tiny muted">${r.documents} attached</div>`}
  </${Fragment}>`;
}

/* --------------------------------------------------------------- dialogs -- */

function MoreFilters({ q, patch, opts, onClose }) {
  const sel = (key, label, options) => html`<div class="crfmf">
    <label class="fldlabel" for=${"mf-" + key}>${label}</label>
    <select class="input" id=${"mf-" + key} value=${q[key] || ""}
      onChange=${(e) => patch({ [key]: e.target.value })}>
      <option value="">Any</option>
      ${options.map((o) => { const v = o.value === undefined ? o : o.value;
    return html`<option key=${v} value=${v}>${o.label === undefined ? o : o.label}</option>`; })}
    </select>
  </div>`;
  return html`<${Drawer} title="More filters" width=400 onClose=${onClose}
    footer=${html`<div class="row" style="gap:8px;width:100%">
      <${Btn} variant="ghost" onClick=${() => patch({ crprio: "", crfin: "", crdocs: "", crassignee: "",
    crsla: "", crentity: "", crreq: "", crhod: "" })}>Clear these</${Btn}>
      <div class="spacer"></div><${Btn} variant="primary" onClick=${onClose}>Done</${Btn}>
    </div>`}>
    <div class="col" style="gap:14px;padding:14px">
      ${sel("crprio", "Priority", ["Standard", "Urgent"])}
      ${sel("crfin", "Finance required", [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }])}
      ${sel("crdocs", "Documents", [{ value: "missing", label: "Missing mandatory documents" },
    { value: "complete", label: "Complete" }])}
      ${sel("crsla", "SLA", ["on track", "at risk", "overdue", "not started"])}
      ${sel("crassignee", "Legal assignee", opts("assignee"))}
      ${sel("crentity", "Zameen entity", opts("entity"))}
      ${sel("crreq", "Requester", opts("requester"))}
      ${sel("crhod", "Approving HOD", opts("approvingHod"))}
    </div>
  </${Drawer}>`;
}

export function NewRequest({ types, onClose }) {
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.crf.create(type); onClose(); navigate("/contract-requests/" + r.request.id); }
    catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error"); setBusy(false); }
  };
  return html`<${Modal} title="New contract request" icon="plus" width=${720} onClose=${onClose}
    footer=${html`<${Fragment}><${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${!type || busy} onClick=${go}>Start request</${Btn}>
    </${Fragment}>`}>
    ${/* THE AGREEMENT IS NAMED, NOT NUMBERED (§33).
          "CRF-01", "CRF-02" are internal schema ids. A person raising a request
          for an NDA does not know, and should not have to learn, that the NDA
          is CRF-10 — and printing the codes in the picker made the list read
          as a form catalogue rather than as a question about what they need.
          The ids still key the schema and still key the reference sequence;
          they are simply not what the requester is asked to choose between. */ ""}
    <div class="tiny muted" style="margin-bottom:12px">Pick the agreement you need. The shared blocks are
      the same on every type; the commercial terms are the ones that type actually has.</div>
    <div class="col" style="gap:6px">
      ${/* AN EMPTY PICKER HAS TO SAY WHY. The list is fetched once when the
            page mounts and falls back to [] if that one call fails -- which it
            does if the server restarts under an open tab. The dialog then
            offered a heading, a paragraph and nothing to choose, giving no clue
            that anything had gone wrong or that reloading would fix it. */ ""}
      ${types.length === 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
        <${Icon} name="alertCircle" size=15 />
        <div class="tiny">The agreement types could not be loaded. This usually means the page was open
          while the server restarted — <strong>reload the page</strong> and the list will come back.</div>
      </div>`}
      ${types.map((t) => html`<button key=${t.key} type="button"
        class=${cx("crfpick", type === t.key && "crfpick--on")}
        aria-pressed=${type === t.key ? "true" : "false"} onClick=${() => setType(t.key)}>
        <span class="tiny strong">${t.label}</span>
      </button>`)}
    </div>
  </${Modal}>`;
}
