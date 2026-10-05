// WORKSTREAM A — the Unified Legal Workspace.
//
// The department's command surface. A legal request and its matter are ONE
// continuous object here: the row shows both faces, and opening it lands on the
// record's Flow (WorkflowSpine), not on a disconnected detail screen.
//
// Contracts, Compliance and Templating are LENSES on the same filtered dataset,
// so the GC operates everything from one place. The Browse lens implements the
// drill-down hierarchy: Company/Entity → Type of Contract → records → Flow.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Status, Risk, Priority, Progress, Empty, Metric, Segmented, Tabs, Field, Input, Chip } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { navigate, useQuery } from "../router.js";
import { RegisterShell } from "../register.js";
import { workspaceFields, workspaceSearchKeys, workspaceViews } from "../registerdefs.js";
import {
  useCollection, updateItem, addItem, nextId, nowIso, daysFromNow,
  getFormConfig, requestRequiredDoc, withdrawRequiredDoc, personName, personEmail,
  takeWorkspaceTarget,
} from "../store.js";
import { ChatThread, unreadCount } from "../messages.js";
import { RequesterCell, RequesterCard, requesterOf } from "../requester.js";
import { companyPath } from "./companies.js";
import {
  nameOf, byId, entityName, entityById, GROUP_ENTITIES, COMPANIES, categoryOf,
  subdivisionOf, CONTRACT_TYPE_CODES, LEGAL_SUBDIVISIONS, TEMPLATES, COMPLIANCE,
  licenseStatus, contractTypeMeta, toUsd,
} from "../data.js";
import {
  TatCell, SubdivisionPill, DestinationChips,
} from "../shared.js";
import { CategoryPill, TagChips } from "../shared.js";
import { unifiedRows, rowTat } from "../flow.js";
import { activeUser, useActiveUser, canOpenPath, filterVisible } from "../rbac.js";
import { tatAnalysis } from "../tat.js";
import { WorkflowSpine } from "../spine.js";
import { IntakeForm } from "../intake.js";

/* ONE VIEW, NOT FIVE LENSES.
 *
 * The workspace carried five lenses and three of them were empty or duplicate:
 *
 *   Compliance   rendered the COMPLIANCE seed array, which was emptied in
 *                September. An always-empty table behind a tab.
 *   Templating   rendered the TEMPLATES seed array, emptied at the same time,
 *                over a "generate into a record" panel that wrote a fabricated
 *                Drive link into a document row.
 *   Contracts /  two more views of the contract book, which has its own
 *   Browse       register with better filters and its own entity drill-down in
 *                Companies.
 *
 * What is left is CURRENT WORK: the department's live requests and matters as
 * one continuous record. Project Wise and Legal Requests are the other two
 * views, and they are sub-tabs of this surface rather than lenses inside it —
 * see WorkspaceHub in main.js.
 */

/* ============================================================
   Lens 1 — the unified worklist
   Columns exactly as the GC listed them:
   Request Date · Filed Matter · Requestee · Category · Company/Entity ·
   Due Date · TAT Analysis · TAT Status
   ============================================================ */
function Worklist({ rows, onOpen }) {
  // Header sorting on the identity columns. DataTable renders the arrow and
  // reports the click; the ordering is applied here so it operates on the full
  // filtered set, not just the painted rows.
  const [sort, setSort] = useState({ key: "requestDate", dir: "desc" });
  /* NO "FILED MATTER" COLUMN. Matters were retired as a concept (§3): the
     same piece of work was filed twice, once as a request and once as a
     matter, and the column spent most of its width saying "not filed". And no
     separate TAT ANALYSIS column — it said the same thing as TAT Status one
     column to its left, which is two of the eleven columns that pushed this
     table 103px past its container at 1366. */
  const SORT = {
    requestDate: (r) => new Date(r.requestDate || r.created || r.opened || 0).getTime(),
    id: (r) => String(r.__requestId || "").toLowerCase(),
  };
  const onSort = (key) => setSort((s) => (s.key === key
    ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key, dir: key === "requestDate" ? "desc" : "asc" }));
  const sorted = useMemo(() => {
    const f = SORT[sort.key];
    if (!f) return rows;
    const arr = [...rows].sort((a, b) => { const av = f(a), bv = f(b); return av < bv ? -1 : av > bv ? 1 : 0; });
    return sort.dir === "desc" ? arr.reverse() : arr;
  }, [rows, sort]);

  return html`<div class="dense"><${DataTable} onRow=${(r) => onOpen(r.id)} rows=${sorted} sort=${sort} onSort=${onSort}
    empty=${html`<${Empty} icon="inbox" title="Nothing matches these filters" text="Clear a filter or widen the date window." />`}
    columns=${[
      { key: "requestDate", label: "Request Date", width: "108px", sortKey: true, render: (r) => html`<div>
          <div class="tiny strong">${fmt.dateShort(r.requestDate || r.created || r.opened)}</div>
          <div class="tiny muted">${fmt.rel(r.requestDate || r.created || r.opened)}</div>
        </div>` },
      { key: "id", label: "Request", mono: true, width: "98px", sortKey: true, render: (r) => html`<div><div class="cell-mono strong">${r.__requestId || "—"}</div><div class="tiny muted">${r.__face === "matter" ? "triaged" : "intake"}</div></div>` },
      { key: "title", label: "Request / Matter", render: (r) => html`<div class="wrapcell">
          <div class="cell-strong">${r.title}</div>
          <div class="tiny muted">${r.requestType}${r.contractType ? " · " + r.contractType : ""} · ${r.counterparty || "—"}</div>
        </div>` },
      { key: "requester", label: "Requester", width: "150px", render: (r) => html`<${RequesterCell} record=${r} compact=${true} />` },
      { key: "category", label: "Category", render: (r) => html`<div class="col" style="gap:4px;align-items:flex-start"><${CategoryPill} item=${r} /><${SubdivisionPill} item=${r} /></div>` },
      { key: "entityId", label: "Company / Entity", width: "150px", render: (r) => html`<div class="col" style="gap:3px;align-items:flex-start">
          ${/* THE COMPANY REGISTER IS KEYED ON THE NORMALISED NAME, not on an
                internal entity id. Linking by id produced /companies/e4, which
                no company resolves to. */ ""}
          ${(() => { const name = entityName(r.entityId) || r.entityName || ""; const to = companyPath(name);
            return to
              ? html`<button class="tagchip" onClick=${(e) => { e.stopPropagation(); navigate(to); }}>
                  <${Icon} name="building" size=11 />${name}</button>`
              : html`<span class="tiny muted">No entity recorded</span>`; })()}
          <span class="tiny muted">${(entityById(r.entityId) || {}).jur || ""}</span>
        </div>` },
      { key: "owner", label: "Owner", width: "58px", render: (r) => html`<${Avatar} name=${nameOf(r.owner)} size="sm" />` },
      { key: "due", label: "Due Date", width: "96px", render: (r) => { const d = r.dueDate || r.due; const late = d && new Date(d) < Date.now(); return html`<div><div class=${cx("tiny strong", late && "risk--critical")}>${d ? fmt.dateShort(d) : "—"}</div><div class="tiny muted">${d ? fmt.until(d) : ""}</div></div>`; } },
      { key: "tatStatus", label: "Turnaround", width: "180px", render: (r) => html`<div>
          <${TatCell} tat=${r.__tat} />
          <div class="tiny muted">${r.__tat.days}d allowed · ${tatAnalysis(r.__tat)}</div>
        </div>` },
      /* THE OPERATIONAL COLUMNS A WORKLIST IS ASKED FOR (§74).
         Stage and Days late lead, because "where is it and how late" is the
         pair the worklist exists to answer and neither was on screen — the
         turnaround pill said Delayed without ever saying by how much. The
         business axes below it (line, vertical, region, project) and the
         requester's employee code are `secondary`, so they are one click away
         under Columns rather than making the default table unreadable. Every
         one reads a field the record already carries; none is a column over a
         value nobody fills in. */
      { key: "stage", label: "Stage", width: "132px", sortKey: true,
        render: (r) => (r.stage ? html`<${Pill} tone="blue">${r.stage}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
      { key: "late", label: "Days late", align: "right", width: "82px",
        render: (r) => { const t = r.__tat || {};
          return t.overdueBy > 0
            ? html`<span class="tiny strong risk--critical" title=${"Past its allowed turnaround by " + t.overdueBy + " working days"}>${t.overdueBy}d</span>`
            : html`<span class="tiny muted">—</span>`; } },
      /* PRIORITY AND STATUS ARE FILTERS, NOT COLUMNS, ON THIS TABLE.
         Both are on the record and both filter from the toolbar above. Added
         as columns they pushed the worklist 305px past a 1366 screen, which
         buys two values nobody sorts by at the cost of horizontally scrolling
         the one table the department reads every morning. */
    ]} /></div>`;
}

/* ============================================================
   The workspace
   ============================================================ */
function WorkspaceHome() {
  const [q, patchQ] = useQuery();
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  // Bound reactively, not read once: View-As changes the rendered identity, and
  // the privilege filter below must re-run when it does.
  const viewer = useActiveUser();
  const [intake, setIntake] = useState(false);
  /* CURRENT WORK MEANS CURRENT (§17).
     The worklist opened on every record the department had ever taken, so the
     first screen of "my work" was mostly finished work, and the delayed count
     underneath it was a fraction of a number nobody could act on. Completed
     records are one click away and never the default. */
  const [showDone, setShowDone] = useState(false);

  const ctx = { requests, matters, contracts, repository, licenses };

  /* ONE dataset: requests and matters unified into a single continuous record.
     PRIVILEGE IS ENFORCED HERE. §7.2 privilege tiers are an access rule, not a
     label: a Privileged matter must not surface for anyone not named on it, and
     Restricted excludes other teams. */
  const all = useMemo(() => filterVisible(viewer, unifiedRows(requests, matters).map((u) => ({
    ...u.record,
    id: u.id,
    title: u.title,
    __requestId: u.requestId,
    __matterId: u.matterId,
    __face: u.face,
    __tat: rowTat(u.record, ctx),
  }))), [requests, matters, contracts, repository, viewer]);

  const activeRows = useMemo(() => all.filter((r) => !r.__tat.done), [all]);
  const rows = showDone ? all : activeRows;
  const fields = useMemo(() => workspaceFields("worklist", { nameOf, entityName }), []);
  const delayed = activeRows.filter((r) => r.__tat.status === "Delayed");
  const dueToday = activeRows.filter((r) => r.__tat.status === "Due Today");
  /* AWAITING MY ACTION is only shown when it can be answered deterministically
     (§18): the record is open, it is mine, and the ball is on our side of the
     court. Where the flow cannot say whose turn it is, the tile is left out
     rather than shown with a number that means "probably". */
  const mine = activeRows.filter((r) => r.owner && viewer && r.owner === viewer.id
    && r.__tat.blockingBall !== "business" && r.__tat.blockingBall !== "counterparty");

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Legal Workspace"
      sub="The department's live work — a request and its matter are the same record, from intake to close."
      actions=${html`<${Btn} variant="ghost" icon="calendar" onClick=${() => navigate("/calendar")}>Calendar</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => setIntake(true)}>New request</${Btn}>`} />

    ${/* THE KPI ROW IS WHAT SOMEBODY CAN ACT ON (§18).
          "Filed as Matters" counted an internal filing step, "Contracts in
          Scope" repeated the contract register's own total, and "Portfolio
          Value" put a nine-figure number on a worklist — three tiles that
          nobody could do anything with, occupying the row above the work. */ ""}
    ${/* EVERY FIGURE OPENS THE WORK BEHIND IT (§28/§100).
          Three of these four were plain numbers: a reader could see that nine
          things were delayed and had no way to ask which nine — they went to
          the toolbar and rebuilt the filter by hand. The register below reads
          its filters from the URL (ns "wsp"), so each card sets exactly the
          filter the toolbar would, which is why the count on the card and the
          count on the register always agree. Clicking a card that is already
          on clears it, so a KPI is a toggle rather than a trap. */ ""}
    <${StatStrip} stats=${[
      { value: activeRows.length, label: "Active tasks", active: !showDone && !q.wsp_tat && !q.wsp_owner,
        onClick: () => { setShowDone(false); patchQ({ wsp_tat: null, wsp_owner: null }); },
        title: "Show only live work" },
      { value: delayed.length, label: "Delayed", tone: delayed.length ? "red" : "",
        active: q.wsp_tat === "Delayed",
        onClick: () => patchQ({ wsp_tat: q.wsp_tat === "Delayed" ? null : "Delayed", wsp_owner: null }),
        title: "Open the work that is past its fixed turnaround" },
      { value: dueToday.length, label: "Due today", tone: dueToday.length ? "amber" : "",
        active: q.wsp_tat === "Due Today",
        onClick: () => patchQ({ wsp_tat: q.wsp_tat === "Due Today" ? null : "Due Today", wsp_owner: null }),
        title: "Open the work whose turnaround runs out today" },
      { value: mine.length, label: "Awaiting my action",
        active: !!q.wsp_owner,
        onClick: () => patchQ({ wsp_owner: q.wsp_owner ? null : nameOf(viewer.id), wsp_tat: null }),
        title: "Open, assigned to you, and waiting on Legal rather than on the business" },
    ]} />

    <${RegisterShell}
      ns="wsp" rows=${rows}
      fields=${fields}
      views=${workspaceViews("worklist")}
      searchKeys=${workspaceSearchKeys("worklist")}
      searchPlaceholder="Search titles, counterparties, deed refs…"
      noun=${["record", "records"]}
      exportName="legal-workspace"
      extraChips=${html`<${Chip} active=${showDone} onClick=${() => setShowDone(!showDone)}
        title="Completed work is history; Current Work opens on what is still running">
        ${showDone ? "Showing completed too" : "Include completed"}</${Chip}>`}>
      ${(f) => html`<div>
        ${delayed.length > 0 && html`<div class="banner banner--warn" style="margin-bottom:14px;align-items:flex-start">
          <${Icon} name="alertTriangle" size=17 />
          <div style="flex:1;min-width:0">
            <div class="strong tiny">${delayed.length} record${delayed.length === 1 ? " is" : "s are"} past their fixed turnaround</div>
            <div class="tiny" style="margin-top:3px;opacity:.9">
              ${delayed.slice(0, 4).map((r) => `${r.id} — ${r.__tat.overdueBy}d over, blocked at ${r.__tat.blockingStage}`).join(" · ")}${delayed.length > 4 ? ` · +${delayed.length - 4} more` : ""}
            </div>
          </div>
          <${Btn} variant="soft" size="sm" onClick=${() => f.set("tat", ["Delayed"])}>Show only delayed</${Btn}>
        </div>`}
        <${Worklist} rows=${f.filtered} onOpen=${(id) => navigate("/workspace/" + id)} />
      </div>`}
    </${RegisterShell}>

    ${intake && html`<${IntakeForm} mode="internal" requesterId="u13" onClose=${() => setIntake(false)}
      onDone=${(res, open) => { if (open) navigate("/workspace/" + res.id); }} />`}
  </div>`;
}

/* ============================================================
   SPRINT 4 — the legal side of the requester bridge.
   The same chat thread the requester sees, plus the missing-document checklist
   legal drives. Rendered on the workspace record and on the matter workspace.
   ============================================================ */
export function RequesterPanel({ requestId, viewer = "u1" }) {
  const requests = useCollection("requests");
  const repository = useCollection("repository");
  const messages = useCollection("messages");
  const [ask, setAsk] = useState("");

  const r = requests.find((x) => x.id === requestId);
  if (!r) {
    return html`<${Empty} icon="user" title="No requester thread"
      text="This record was opened internally, so there is no requester to correspond with." />`;
  }

  const who = requesterOf(r);
  const requesterName = who.displayName;
  const requesterEmail = who.email;
  const docs = repository.filter((d) => d.requestId === r.id);
  const outstanding = (r.requiredDocs || []).filter((d) => d.status === "requested");
  const received = (r.requiredDocs || []).filter((d) => d.status === "received");
  const unread = unreadCount(r.id, viewer, messages);

  const templates = ((getFormConfig().requiredDocTemplates || {})[r.contractType] || [])
    .filter((t) => !(r.requiredDocs || []).some((d) => d.name === t));

  const askFor = (name) => { if (name && name.trim()) { requestRequiredDoc(r.id, name, viewer); setAsk(""); } };

  return html`<div class="grid" style="grid-template-columns:1fr 340px;gap:16px;align-items:start">
    <div class="card card--pad col" style="gap:12px">
      <div class="row">
        <span class="strong">Requester chat</span>
        <div class="spacer"></div>
        ${unread > 0 && html`<${Pill} tone="red">${unread} unread</${Pill}>`}
        <span class="tiny muted">with ${requesterName}${requesterEmail ? " · " + requesterEmail : ""}</span>
      </div>
      <div class="banner banner--info" style="padding:9px 12px;align-items:flex-start">
        <${Icon} name="alertCircle" size=15 />
        <span class="tiny">
          The requester sees this thread in their portal. Keep privileged analysis in the
          matter's internal notes — anything written here is visible to them.
        </span>
      </div>
      <${ChatThread} requestId=${r.id} viewer=${viewer} role="legal"
        counterpartLabel=${requesterName} compact=${true} height=${400} />
    </div>

    <div class="col" style="gap:14px">
      <!-- WHO RAISED IT (§21). Every field the request must retain, with the
           ones the intake did not capture named as missing rather than blank —
           and the department never standing in for a person's name. -->
      <div class="card card--pad col" style="gap:10px">
        <span class="strong">Where this came from</span>
        <${RequesterCard} record=${r} />
        <div class="kvgrid" style="grid-template-columns:1fr">
          <div class="kv"><div class="kv__l">Raised from</div><div class="kv__v">${r.source || "—"}</div></div>
          <div class="kv"><div class="kv__l">Nature of matter</div><div class="kv__v">${r.natureOfMatter || "—"}</div></div>
        </div>
      </div>

      <!-- the missing-document flow: legal asks, the requester is notified -->
      <div class="card card--pad col" style="gap:10px">
        <div class="row">
          <span class="strong">Documents from the requester</span>
          <div class="spacer"></div>
          ${outstanding.length > 0
            ? html`<${Pill} tone="amber">${outstanding.length} outstanding</${Pill}>`
            : html`<${Pill} tone="green">nothing outstanding</${Pill}>`}
        </div>

        ${(r.requiredDocs || []).length === 0 && html`<span class="tiny muted">Nothing requested yet.</span>`}

        ${(r.requiredDocs || []).map((d) => html`<div key=${d.id} class="row" style="gap:8px;align-items:flex-start">
          <${Icon} name=${d.status === "received" ? "checkcircle" : "clock"} size=15
            style=${{ color: d.status === "received" ? "var(--success)" : "var(--warning)", flex: "none", marginTop: "2px" }} />
          <div style="flex:1;min-width:0">
            <div class="tiny strong">${d.name}</div>
            <div class="tiny muted">
              ${d.status === "received"
                ? `received ${d.receivedAt ? fmt.rel(d.receivedAt) : ""}`
                : `asked ${d.requestedAt ? fmt.rel(d.requestedAt) : ""} — waiting on ${requesterName.split(" ")[0]}`}
            </div>
          </div>
          ${d.status === "requested"
            ? html`<button class="iconbtn" style="width:24px;height:24px" title="Withdraw the request"
                onClick=${() => withdrawRequiredDoc(r.id, d.id)}><${Icon} name="x" size=14 /></button>`
            : html`<${Pill} tone="green">✓</${Pill}>`}
        </div>`)}

        <div class="row" style="gap:7px;padding-top:10px;border-top:1px solid var(--border)">
          <input class="input" style="height:32px;font-size:12.5px" placeholder="Ask for a document…"
            value=${ask} onInput=${(e) => setAsk(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter") askFor(ask); }} />
          <${Btn} variant="primary" size="sm" icon="plus" onClick=${() => askFor(ask)} disabled=${!ask.trim()} />
        </div>
        ${templates.length > 0 && html`<div>
          <div class="tiny muted" style="margin-bottom:6px">Standard asks for a ${r.contractType} request:</div>
          <div class="row wrap" style="gap:5px">
            ${templates.slice(0, 6).map((t) => html`<button key=${t} class="tagchip" onClick=${() => askFor(t)}>
              <${Icon} name="plus" size=11 />${t}
            </button>`)}
          </div>
        </div>`}
      </div>

      <!-- what they have uploaded -->
      <div class="card card--pad col" style="gap:9px">
        <div class="row"><span class="strong">Uploaded by the requester</span><div class="spacer"></div><span class="tiny muted">${docs.length}</span></div>
        ${docs.length === 0
          ? html`<span class="tiny muted">Nothing uploaded through the portal yet.</span>`
          : docs.map((d) => html`<div key=${d.id} class="row clickable" style="gap:8px" onClick=${() => navigate("/repository/" + d.id)}>
              <${Icon} name="file" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />
              <div style="flex:1;min-width:0">
                <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
                <div class="tiny muted">${d.kind} · ${fmt.rel(d.uploadedAt)}</div>
              </div>
              <${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />
            </div>`)}
      </div>
    </div>
  </div>`;
}

/* ---------------- the record's Flow view ---------------- */
function RecordFlow({ id }) {
  const requests = useCollection("requests");
  const messages = useCollection("messages");
  const [tab, setTab] = useState("flow");

  // The requester thread hangs off the REQUEST id, whichever face we entered on.
  const req = requests.find((x) => x.id === id)
    || requests.find((x) => x.matterId === id)
    || null;
  const unread = req ? unreadCount(req.id, "u1", messages) : 0;
  const outstanding = req ? (req.requiredDocs || []).filter((d) => d.status === "requested").length : 0;

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:14px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/workspace")}>Legal Workspace</${Btn}>
    </div>

    ${req && html`<div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "flow", label: "Flow", icon: "workflow" },
        { key: "requester", label: "Requester", icon: "user", count: (unread + outstanding) || undefined },
      ]} />
    </div></div>`}

    ${tab === "requester" && req
      ? html`<${RequesterPanel} requestId=${req.id} viewer="u1" />`
      : html`<${WorkflowSpine} id=${id} />`}
  </div>`;
}

export default function Workspace({ id }) {
  return id ? html`<${RecordFlow} id=${id} /> ` : html`<${WorkspaceHome} />`;
}
