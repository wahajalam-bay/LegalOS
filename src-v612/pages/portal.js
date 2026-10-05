// Requester Portal — the LEGAL-side view of the external app.
//
// Sprint 3 put a preview of the requester screen here. Sprint 4 promoted that
// into a real standalone application at /portal/ with its own shell, login and
// wizard. This route keeps its URL and becomes the department's operations view
// of that app: who is using it, what is arriving from where, what is waiting on
// a requester, and the integration contract for deploying it separately.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Avatar, Empty, Metric, Tabs, AICard } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { HBars, Donut, seriesColor, foldSeries } from "../charts.js";
import { navigate } from "../router.js";
import { useCollection, useFormConfig, personName, personEmail } from "../store.js";
import { nameOf, entityName, LEGAL_REQUEST_SCHEMA } from "../data.js";
import { rowTat } from "../flow.js";
import { TatCell } from "../shared.js";
import { unreadCount, senderName } from "../messages.js";

const CONTRACT_DOC = `submitLegalRequest(payload) -> { ok, id, record, tat, duplicates, owner }

Validates the payload, assigns the REQ- id, creates the unified
Request/Matter record, runs the counterparty/duplicate check,
auto-fixes the TAT (type x risk, or the per-nature routing default),
pre-loads the required-document checklist from the admin template,
turns portal attachments into repository documents, and drops the
record into Triage on the department side.

Seam: store.js  // portal <-> LegalOS API seam`;

const ENDPOINTS = `Today both apps share one store (and therefore localStorage),
which is what makes the round-trip live in a demo. Every call
already goes through src/store.js, so splitting the portal into
its own deployable means replacing those bodies with HTTP:

  submitLegalRequest      POST   /api/requests
  requesterView           GET    /api/requests?requester=:id
  addRequestAttachment    POST   /api/requests/:id/attachments
  requestRequiredDoc      POST   /api/requests/:id/required-docs
  fulfilRequiredDoc       PATCH  /api/requests/:id/required-docs/:docId
  postMessage             POST   /api/requests/:id/messages
  getFormConfig           GET    /api/form-config

Nothing in either UI changes.`;

export default function Portal() {
  const requests = useCollection("requests");
  const requesters = useCollection("requesters");
  const messages = useCollection("messages");
  const repository = useCollection("repository");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const cfg = useFormConfig();
  const [tab, setTab] = useState("activity");

  const ctx = { requests, matters, contracts, repository };
  const portal = useMemo(
    () => requests.filter((r) => r.channel === "portal").map((r) => ({ ...r, __tat: rowTat(r, ctx) })),
    [requests, matters, contracts, repository]
  );

  const unreadTotal = requests.reduce((n, r) => n + unreadCount(r.id, "u1", messages), 0);
  const outstanding = requests.reduce((n, r) => n + (r.requiredDocs || []).filter((d) => d.status === "requested").length, 0);
  const portalDocs = repository.filter((d) => d.source === "Requester upload").length;
  const published = !(cfg.branding && cfg.branding.published === false);

  const bySource = useMemo(() => {
    const m = new Map();
    portal.forEach((r) => { const k = r.source || "—"; m.set(k, (m.get(k) || 0) + 1); });
    // Nominal sources: one hue for every bar (length carries the magnitude).
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: seriesColor(0) }));
  }, [portal]);

  const byNature = useMemo(() => {
    const m = new Map();
    portal.forEach((r) => { const k = r.natureOfMatter || "—"; m.set(k, (m.get(k) || 0) + 1); });
    return foldSeries([...m.entries()]);
  }, [portal]);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Requester Portal"
      sub="The business-facing request form — a separate application, connected to LegalOS in real time."
      actions=${html`<${Btn} variant="ghost" icon="settings" onClick=${() => navigate("/settings")}>Configure the form</${Btn}>
        <a class="btn btn--primary" href="portal/" target="_blank" rel="noreferrer">
          <${Icon} name="externalLink" size=16 />Open the portal
        </a>`} />

    <div class=${cx("banner", published ? "banner--info" : "banner--warn")} style="margin-bottom:16px;align-items:flex-start">
      <${Icon} name=${published ? "globe" : "lock"} size=17 />
      <div style="flex:1;min-width:0">
        <div class="strong tiny">
          ${published ? "The form is published and accepting requests" : "The form is unpublished — requesters see a holding page"}
        </div>
        <div class="tiny" style="margin-top:3px;opacity:.9">
          Lives at <span class="mono">/portal/</span> with its own shell and login. Requesters see only their own
          submissions. Change what the form asks in <b>Settings → Request Form</b>.
        </div>
      </div>
      <${Btn} variant="soft" size="sm" icon="clipboard" onClick=${() => navigate("/workspace")}>Request Log</${Btn}>
    </div>

    <div class="grid grid--kpi" style="margin-bottom:18px">
      <${Metric} icon="inbox" tone="purple" label="Submitted via the portal" value=${portal.length}
        foot=${`${requests.length} requests in total`} onClick=${() => navigate("/workspace")} />
      <${Metric} icon="users" tone="blue" label="Registered requesters" value=${requesters.length}
        foot=${`${new Set(portal.map((r) => r.source)).size} sites active`} />
      <${Metric} icon="message" tone=${unreadTotal ? "amber" : "green"} label="Unread requester messages" value=${unreadTotal}
        foot=${unreadTotal ? "waiting on a legal reply" : "all threads answered"} />
      <${Metric} icon="paperclip" tone=${outstanding ? "red" : "green"} label="Documents outstanding" value=${outstanding}
        foot=${outstanding ? "asked for, not yet uploaded" : "nothing outstanding"} />
      <${Metric} icon="file" tone="green" label="Documents uploaded by requesters" value=${portalDocs}
        foot="landed in the repository" onClick=${() => navigate("/repository")} />
    </div>

    <div style="margin-bottom:16px">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "activity", label: "Portal activity", icon: "activity" },
        { key: "requesters", label: "Requesters", icon: "users", count: requesters.length },
        { key: "contract", label: "Integration contract", icon: "link" },
      ]} />
    </div>

    ${tab === "activity" && html`<div class="col" style="gap:16px">
      ${portal.length === 0
        ? html`<${Empty} icon="inbox" title="Nothing has come through the portal yet"
            text="Open the portal, sign in with any work email and submit a request — it lands in the To be assigned queue here immediately."
            action=${html`<a class="btn btn--primary" href="portal/" target="_blank" rel="noreferrer"><${Icon} name="externalLink" size=16 />Open the portal</a>`} />`
        : html`<${Fragment0}>
          <div class="grid" style="grid-template-columns:1fr 300px;gap:16px;align-items:start">
            <div class="card card--pad col" style="gap:12px">
              <div class="row"><span class="strong">Where requests are coming from</span><div class="spacer"></div><span class="tiny muted">captured at sign-in</span></div>
              <${HBars} data=${bySource} format=${(v) => v + (v === 1 ? " request" : " requests")} />
            </div>
            <div class="card card--pad col" style="gap:12px">
              <span class="strong">By nature of matter</span>
              <${Donut} data=${byNature} size=${152} thickness=${20} centerValue=${portal.length} centerLabel="requests" />
            </div>
          </div>

          <div class="card">
            <div class="card__head">
              <div style="min-width:0"><div class="card__title">Portal submissions</div><div class="card__sub">Click through to the record's flow and its requester thread</div></div>
            </div>
            <div class="card__body" style="padding:0">
              <div class="dense">
                <${DataTable} onRow=${(r) => navigate("/workspace/" + r.id)} rows=${portal}
                  columns=${[
                    { key: "id", label: "Request", mono: true, width: "94px" },
                    { key: "requestDate", label: "Raised", width: "96px", render: (r) => html`<span class="tiny strong">${fmt.dateShort(r.requestDate || r.created)}</span>` },
                    { key: "source", label: "Source", width: "170px", render: (r) => html`<span class="tiny strong">${r.source || "—"}</span>` },
                    { key: "requester", label: "Requester", width: "160px", render: (r) => html`<div class="row" style="gap:7px">
                        <${Avatar} name=${personName(r.requesterId || r.requester)} size="sm" />
                        <div style="min-width:0"><div class="tiny strong">${personName(r.requesterId || r.requester)}</div><div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.requesterEmail || personEmail(r.requesterId || r.requester) || "—"}</div></div>
                      </div>` },
                    { key: "natureOfMatter", label: "Nature", width: "126px", render: (r) => html`<${Pill} tone="gray">${r.natureOfMatter}</${Pill}>` },
                    { key: "title", label: "Request", render: (r) => html`<div class="wrapcell"><div class="cell-strong">${r.title}</div><div class="tiny muted">${entityName(r.entityId)}${r.contractType ? " · " + r.contractType : ""}</div></div>` },
                    { key: "status", label: "Stage", width: "112px", render: (r) => html`<${Status} value=${r.status} />` },
                    { key: "tat", label: "TAT", width: "156px", render: (r) => html`<${TatCell} tat=${r.__tat} />` },
                    /* This column was headed with an empty string, so a screen
                       reader announced the unread-message and awaiting-document
                       flags under no column at all. The header is short because
                       the cells are icons; it is not absent. */
                    { key: "flags", label: "Waiting on", width: "96px", render: (r) => { const u = unreadCount(r.id, "u1", messages); const a = (r.requiredDocs || []).filter((d) => d.status === "requested").length; return html`<div class="row" style="gap:4px;justify-content:flex-end">
                        ${u ? html`<span class="pflag pflag--new"><${Icon} name="message" size=11 />${u}</span>` : ""}
                        ${a ? html`<span class="pflag pflag--warn"><${Icon} name="paperclip" size=11 />${a}</span>` : ""}
                      </div>`; } },
                  ]} />
              </div>
            </div>
          </div>
        </${Fragment0}>`}
    </div>`}

    ${tab === "requesters" && html`<${DataTable} rows=${requesters}
      empty=${html`<${Empty} icon="users" title="No requesters yet" text="Anyone who signs into the portal is registered here." />`}
      columns=${[
        { key: "id", label: "ID", mono: true, width: "86px" },
        { key: "name", label: "Requester", render: (q) => html`<div class="row" style="gap:10px">
            <${Avatar} name=${q.name} size="md" />
            <div style="min-width:0"><div class="cell-strong">${q.name}</div><div class="tiny muted">${q.email}</div></div>
          </div>` },
        { key: "department", label: "Department", width: "150px" },
        { key: "source", label: "Raises from", render: (q) => html`<span class="tiny strong">${q.source || "—"}</span>` },
        { key: "requests", label: "Requests raised", align: "right", width: "130px", render: (q) => {
            const n = requests.filter((r) => (r.requesterId || r.requester) === (q.userId || q.id)).length;
            return html`<span class="strong">${n}</span>`;
          } },
        { key: "createdAt", label: "First seen", width: "112px", render: (q) => html`<span class="tiny muted">${fmt.date(q.createdAt)}</span>` },
      ]} />`}

    ${tab === "contract" && html`<div class="col" style="gap:16px">
      <${AICard} title="How the two apps talk">
        The portal is a <b>separate application</b> with its own entry point, shell and session. It imports
        the shared data contract from <span class="mono">/src</span> — the <span class="mono">LegalRequest</span> schema,
        <span class="mono">submitLegalRequest()</span>, the store slices and the chat bridge — so it can be split
        into its own deployable without a rewrite. For the prototype both apps share one store, which is
        what makes the round-trip live: a submission appears in Triage here instantly, and a reply or a
        document request flows straight back to the requester.
      </${AICard}>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <div class="card card--pad col" style="gap:10px">
          <div class="fpop__lbl">1 · Shared schema — data.js#LEGAL_REQUEST_SCHEMA</div>
          <div class="ocrbox">${Object.keys(LEGAL_REQUEST_SCHEMA).map((k) => `${k}: ${LEGAL_REQUEST_SCHEMA[k]}`).join("\n")}</div>
        </div>
        <div class="col" style="gap:16px">
          <div class="card card--pad col" style="gap:10px">
            <div class="fpop__lbl">2 · Submission handoff — store.js#submitLegalRequest</div>
            <div class="ocrbox">${CONTRACT_DOC}</div>
          </div>
          <div class="card card--pad col" style="gap:10px">
            <div class="fpop__lbl">3 · The network seam</div>
            <div class="ocrbox">${ENDPOINTS}</div>
          </div>
        </div>
      </div>

      <div class="card card--pad col" style="gap:10px">
        <div class="fpop__lbl">4 · Admin control</div>
        <div class="dim" style="font-size:12.5px;line-height:1.6">
          The portal reads its entire structure from the <span class="mono">formConfig</span> slice — nature options,
          the company list, the company × contract-type matrix, request types, required-document templates,
          routing and TAT defaults, and branding. Editing any of it in
          <b>Settings → Request Form</b> changes the live form with no code change and no deploy.
        </div>
        <div class="row" style="gap:8px;margin-top:4px">
          <${Btn} variant="soft" size="sm" icon="settings" onClick=${() => navigate("/settings")}>Open Request Form settings</${Btn}>
        </div>
      </div>
    </div>`}
  </div>`;
}

function Fragment0({ children }) { return children; }
