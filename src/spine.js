// NORTH STAR — <WorkflowSpine /> : the component that finally shows the machine.
//
// Four zones, always visible and traversable, rendered from any Request / Matter
// / Contract id:
//
//   1 INPUT          where it came from
//   2 PROCESS        the stages — who holds the ball, and what is delayed
//   3 OUTPUT         what it produced, and where that lives
//   4 RELATIONSHIPS  everything connected, all click-through
//
// Embedded as the default "Flow" tab on the matter workspace, the contract
// workspace and the unified Legal Workspace.
import { html, cx, fmt, useState, useEffect, useMemo, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Status, Risk, Avatar, Progress, AICard, Empty, Modal, Field, Input } from "./ui.js";
import { navigate } from "./router.js";
import { useCollection, updateItem } from "./store.js";
import {
  nameOf, byId, categoryOf, subdivisionOf, BALL_LABEL, ACCESS_LABEL,
  riskGatesFor, entityName, toUsd,
} from "./data.js";
import { buildSpine } from "./flow.js";
import { tatAnalysis, tatLabel } from "./tat.js";
import { SubdivisionPill, CategoryPill, TatCell } from "./shared.js";

const ZONES = [
  { key: "input", n: 1, label: "Input", icon: "download", sub: "where it came from" },
  { key: "process", n: 2, label: "Process", icon: "workflow", sub: "who holds the ball" },
  { key: "output", n: 3, label: "Output", icon: "upload", sub: "what it produced" },
  { key: "relationships", n: 4, label: "Relationships", icon: "git", sub: "everything connected" },
];

const BALL_TONE = { legal: "blue", business: "amber", counterparty: "purple" };
const STATE_COLOR = { done: "var(--success)", active: "var(--brand)", blocked: "var(--danger)", pending: "var(--surface-3)" };

/* ---------------- zone shell ---------------- */
function Zone({ zone, right, children }) {
  return html`<section class="zone" id=${"zone-" + zone.key}>
    <div class="zone__head">
      <span class="zone__n">${zone.n}</span>
      <div class="zone__ico"><${Icon} name=${zone.icon} size=15 /></div>
      <div style="min-width:0">
        <div class="zone__title">${zone.label}</div>
        <div class="zone__sub">${zone.sub}</div>
      </div>
      <div class="spacer"></div>
      ${right}
    </div>
    <div class="zone__body">${children}</div>
  </section>`;
}

function KV({ label, children, mono }) {
  return html`<div class="kv">
    <div class="kv__l">${label}</div>
    <div class=${cx("kv__v", mono && "mono")}>${children}</div>
  </div>`;
}

/* ============================================================
   ZONE 1 — INPUT
   ============================================================ */
function InputZone({ spine }) {
  const { input, rec } = spine;
  const [openDoc, setOpenDoc] = useState(null);
  const money = (v) => (v == null ? "—" : fmt.moneyFull(v, rec.currency));

  return html`<${Zone} zone=${ZONES[0]}
    right=${html`<${Pill} tone=${rec.source === "portal" ? "purple" : "gray"} dot=${true}>${rec.source === "portal" ? "Requester portal" : "Internal intake"}</${Pill}>`}>
    <div class="spine__grid">
      <!-- the request form, as captured -->
      <div class="card card--pad col" style="gap:12px">
        <div class="row"><span class="strong">Request form</span><div class="spacer"></div><span class="tiny muted">as submitted</span></div>
        <div class="kvgrid">
          ${input.fields.map(([l, v]) => html`<${KV} key=${l} label=${l}>
            ${l === "Value" ? money(v)
              : /date/i.test(l) && v ? fmt.date(v)
              : l === "Category" ? html`<${CategoryPill} category=${v} />`
              : l === "Legal sub-division" ? html`<${SubdivisionPill} value=${v} />`
              : l === "Preliminary risk" ? html`<${Risk} level=${v} />`
              : (v == null || v === "" ? "—" : v)}
          </${KV}>`)}
        </div>
        ${input.description && html`<div class="spine__desc">${input.description}</div>`}
      </div>

      <div class="col" style="gap:14px">
        <!-- who asked -->
        ${input.requester && html`<div class="card card--pad col" style="gap:10px">
          <span class="strong">Requester</span>
          <div class="row" style="gap:10px">
            <${Avatar} name=${input.requester.name} size="md" />
            <div style="min-width:0"><div class="strong" style="font-size:13px">${input.requester.name}</div><div class="tiny muted">${input.requester.role}</div></div>
          </div>
        </div>`}

        <!-- the entity this belongs to -->
        ${input.entity && html`<div class="card card--pad col" style="gap:10px">
          <span class="strong">Company / entity</span>
          <div class="row clickable" style="gap:10px" onClick=${() => navigate("/companies/" + input.entity.id)}>
            <div class="notif__ico" style="width:32px;height:32px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="building" size=16 /></div>
            <div style="flex:1;min-width:0"><div class="strong" style="font-size:13px">${input.entity.name}</div><div class="tiny muted">${input.entity.type} · ${input.entity.jurisdiction}</div></div>
            <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
          </div>
        </div>`}

        <!-- the prior contract it attaches to -->
        ${input.parent && html`<div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Attaches to</span><div class="spacer"></div><${Pill} tone="indigo">prior contract</${Pill}></div>
          <div class="row clickable" style="gap:10px" onClick=${() => navigate("/contracts/" + input.parent.id)}>
            <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="file" size=15 /></div>
            <div style="flex:1;min-width:0"><div class="strong tiny">${input.parent.title}</div><div class="tiny muted">${input.parent.id} · ${input.parent.type} · ${fmt.money(input.parent.value, input.parent.currency)}</div></div>
            <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
          </div>
        </div>`}
      </div>
    </div>

    <!-- Sprint 4: what legal has asked the requester for, and what came back -->
    ${(input.requiredDocs || []).length > 0 && html`<div class="card card--pad col" style="gap:10px;margin-top:14px">
      <div class="row">
        <span class="strong">Documents requested from the requester</span>
        <div class="spacer"></div>
        ${(() => {
          const out = input.requiredDocs.filter((d) => d.status === "requested").length;
          return out > 0
            ? html`<${Pill} tone="amber">${out} outstanding</${Pill}>`
            : html`<${Pill} tone="green">all received</${Pill}>`;
        })()}
      </div>
      ${input.requiredDocs.map((d) => html`<div key=${d.id} class="row" style="gap:9px">
        <${Icon} name=${d.status === "received" ? "checkcircle" : "clock"} size=15
          style=${{ color: d.status === "received" ? "var(--success)" : "var(--warning)", flex: "none" }} />
        <div style="flex:1;min-width:0">
          <div class="tiny strong">${d.name}</div>
          <div class="tiny muted">
            ${d.status === "received"
              ? `received ${d.receivedAt ? fmt.rel(d.receivedAt) : ""}`
              : `asked ${d.requestedAt ? fmt.rel(d.requestedAt) : ""}${d.requestedBy ? " by " + nameOf(d.requestedBy) : ""} — waiting on the requester`}
          </div>
        </div>
        <${Pill} tone=${d.status === "received" ? "green" : "amber"}>${d.status}</${Pill}>
      </div>`)}
    </div>`}

    <!-- uploaded / scanned documents + what OCR and extraction pulled out -->
    <div class="card card--pad col" style="gap:12px;margin-top:14px">
      <div class="row">
        <span class="strong">Documents in</span>
        <div class="spacer"></div>
        <span class="tiny muted">${input.documents.length + (input.attachments || []).length} item${input.documents.length + (input.attachments || []).length === 1 ? "" : "s"}</span>
        <${Btn} variant="soft" size="sm" icon="plus" onClick=${() => navigate("/repository")}>Add document</${Btn}>
      </div>
      ${input.documents.length === 0 && (input.attachments || []).length === 0
        ? html`<div class="tiny muted" style="padding:4px 2px">No documents attached yet — add one in Intake & Repository and it flows straight into this record's Input zone.</div>`
        : html`<div class="col" style="gap:8px">
          ${input.documents.map((d) => html`<div key=${d.id} class="docrow clickable" onClick=${() => setOpenDoc(d)}>
            <div class="notif__ico" style="width:34px;height:34px;background:var(--surface-3);color:var(--text-2)"><${Icon} name=${d.source === "Scan" ? "scan" : "file"} size=16 /></div>
            <div style="flex:1;min-width:0">
              <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
              <div class="tiny muted">${d.kind} · ${d.source} · ${d.pages}p · Sr No ${d.srNo} · ${d.officeLocation}</div>
            </div>
            <${Pill} tone=${d.ocrConfidence >= 0.9 ? "green" : d.ocrConfidence >= 0.82 ? "amber" : "red"}>OCR ${Math.round(d.ocrConfidence * 100)}%</${Pill}>
            <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
          </div>`)}
          ${(input.attachments || []).map((a) => html`<div key=${a.id} class="docrow">
            <div class="notif__ico" style="width:34px;height:34px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="paperclip" size=15 /></div>
            <div style="flex:1;min-width:0"><div class="strong tiny">${a.name}</div><div class="tiny muted">${a.kind}${a.sizeKb ? " · " + a.sizeKb + " KB" : ""} · attached at Intake</div></div>
          </div>`)}
        </div>`}
    </div>

    ${openDoc && html`<${ExtractedModal} doc=${openDoc} onClose=${() => setOpenDoc(null)} />`}
  </${Zone}>`;
}

// Read-only view of a document's OCR-extracted fields (editing lives in /analyzer).
function ExtractedModal({ doc, onClose }) {
  const e = doc.extracted || {};
  const rows = [
    ["Parties", e.parties], ["Governing law", e.governingLaw], ["Term", e.term],
    ["Notice period", e.noticePeriod], ["Registration ref", e.registration], ["Title / deed ref", e.titleRef],
    ["Total value", e.totalValue != null ? fmt.moneyFull(e.totalValue, e.currency) : null],
    ["PPA value", e.ppaValue != null ? fmt.moneyFull(e.ppaValue, e.currency) : null],
    ["Land value", e.landValue != null ? fmt.moneyFull(e.landValue, e.currency) : null],
  ].filter((r) => r[1]);
  return html`<${Modal} title=${doc.name} icon="scan" width=${620} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Close</${Btn}><${Btn} variant="primary" icon="arrowRight" onClick=${() => { onClose(); navigate("/repository/" + doc.id); }}>Open in Repository</${Btn}>`}>
    <div class="col" style="gap:14px">
      <div class="row wrap" style="gap:8px">
        <${Pill} tone="gray">${doc.kind}</${Pill}><${Pill} tone="indigo">${doc.source}</${Pill}>
        <${Pill} tone=${doc.ocrConfidence >= 0.9 ? "green" : "amber"}>OCR ${Math.round(doc.ocrConfidence * 100)}%</${Pill}>
        <span class="tiny muted">Sr No ${doc.srNo}</span>
      </div>
      <div>
        <div class="tiny muted" style="font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Extracted fields</div>
        <div class="kvgrid">${rows.map(([l, v]) => html`<${KV} key=${l} label=${l}>${v}</${KV}>`)}</div>
      </div>
      ${(e.keyClauses || []).length > 0 && html`<div>
        <div class="tiny muted" style="font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Key clauses detected</div>
        <div class="col" style="gap:5px">${e.keyClauses.map((c, i) => html`<div key=${i} class="row" style="gap:7px"><${Icon} name="dot" size=13 style=${{ color: "var(--brand)" }} /><span class="tiny">${c}</span></div>`)}</div>
      </div>`}
      ${(e.flags || []).length > 0 && html`<div class="banner banner--warn"><${Icon} name="alertTriangle" size=15 /><span>${e.flags.join(" · ")}</span></div>`}
      ${doc.driveLink && html`<a class="row clickable" style="gap:8px;color:var(--brand);font-weight:600;font-size:12.5px" href=${doc.driveLink} target="_blank" rel="noreferrer"><${Icon} name="externalLink" size=14 />Open the file in Drive</a>`}
    </div>
  </${Modal}>`;
}

/* ============================================================
   ZONE 2 — PROCESS  (the spine's spine)
   ============================================================ */
function ProcessZone({ spine }) {
  const { stages, tat, rec } = spine;
  const activeIdx = Math.max(0, stages.findIndex((s) => s.state === "active" || s.state === "blocked"));
  const [sel, setSel] = useState(activeIdx);
  useEffect(() => { setSel(activeIdx); }, [activeIdx, spine.id]);
  const s = stages[Math.min(sel, stages.length - 1)] || stages[0];
  const gates = riskGatesFor(rec.risk);

  return html`<${Zone} zone=${ZONES[1]} right=${html`<${TatCell} tat=${tat} compact=${true} />`}>
    <!-- the TAT clock: auto-fixed, and how it has actually been consumed -->
    <div class=${cx("tatstrip", tat.status === "Delayed" && "tatstrip--bad", tat.status === "Due Today" && "tatstrip--warn")}>
      <div class="tatstrip__main">
        <div class="row" style="gap:8px;margin-bottom:6px">
          <${Icon} name="clock" size=15 />
          <span class="strong" style="font-size:13px">TAT ${tat.days} working days</span>
          <span class="tiny muted">auto-fixed · ${tat.basis}</span>
          <div class="spacer"></div>
          <span class="strong tiny">${tatLabel(tat)}</span>
        </div>
        <${Progress} value=${tat.pct} tone=${tat.status === "Delayed" ? "red" : tat.status === "Due Today" ? "amber" : "green"} />
        <div class="row" style="margin-top:6px">
          <span class="tiny muted">${tatAnalysis(tat)}</span>
          <div class="spacer"></div>
          ${tat.paused > 0 && html`<span class="tiny muted">clock paused while the ball sat outside legal</span>`}
        </div>
      </div>
      ${tat.status === "Delayed" && html`<div class="tatstrip__blame">
        <div class="tiny" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;opacity:.75">What is delayed</div>
        <div class="strong" style="font-size:13.5px;margin-top:3px">${tat.blockingStage}</div>
        <div class="tiny" style="margin-top:2px">${tat.overdueBy} working days over · ${tat.daysInStage}d in stage</div>
        ${tat.blockingOwner && html`<div class="row" style="gap:6px;margin-top:7px"><${Avatar} name=${nameOf(tat.blockingOwner)} size="sm" /><span class="tiny strong">${nameOf(tat.blockingOwner)} holds it</span></div>`}
      </div>`}
    </div>

    <!-- the stage rail: "you are here" -->
    <div class="rail">
      ${stages.map((st, i) => html`<button key=${st.name} class=${cx("rail__stage", `rail__stage--${st.state}`, i === sel && "sel")} onClick=${() => setSel(i)}>
        <div class="rail__bar" style=${`background:${STATE_COLOR[st.state]}`}></div>
        <div class="rail__top">
          <span class="rail__ico" style=${st.state === "pending" ? "" : `background:${STATE_COLOR[st.state]}1f;color:${STATE_COLOR[st.state]}`}>
            <${Icon} name=${st.state === "done" ? "check" : st.icon} size=12 />
          </span>
          ${(st.state === "active" || st.state === "blocked") && html`<span class="rail__here">you are here</span>`}
        </div>
        <div class="rail__name">${st.name}</div>
        <div class="rail__meta">${st.holderName}</div>
        <div class="row" style="gap:4px;margin-top:5px">
          <${Pill} tone=${BALL_TONE[st.ballWith]}>${BALL_LABEL[st.ballWith]}</${Pill}>
          ${st.state !== "pending" && html`<span class="tiny muted">${st.daysIn}d</span>`}
        </div>
      </button>`)}
    </div>

    <!-- the selected stage, in full -->
    <div class="card card--pad col" style="gap:14px;margin-top:14px">
      <div class="row wrap" style="gap:10px">
        <div class="notif__ico" style=${`width:34px;height:34px;background:${STATE_COLOR[s.state]}1f;color:${STATE_COLOR[s.state]}`}><${Icon} name=${s.icon} size=16 /></div>
        <div style="min-width:0">
          <div class="strong" style="font-size:14.5px">${s.name}</div>
          <div class="tiny muted">${s.role} · ${s.state === "done" ? "completed" : s.state === "pending" ? "not started" : s.state === "blocked" ? "blocked" : "in progress"}</div>
        </div>
        <div class="spacer"></div>
        <${Pill} tone=${BALL_TONE[s.ballWith]} dot=${true}>Ball with ${BALL_LABEL[s.ballWith]}</${Pill}>
        ${s.waitingOn && s.state === "blocked" && html`<${Pill} tone="red" dot=${true}>Waiting on ${BALL_LABEL[s.waitingOn] || s.waitingOn}</${Pill}>`}
      </div>

      <div class="kvgrid">
        <${KV} label="Accountable owner">${s.owner ? html`<div class="row" style="gap:7px"><${Avatar} name=${s.ownerName} size="sm" /><span>${s.ownerName}</span></div>` : "—"}</${KV}>
        <${KV} label="Holds the ball now">${s.holderName}</${KV}>
        <${KV} label="Entered">${s.enteredAt ? fmt.date(s.enteredAt) : "—"}</${KV}>
        <${KV} label="Exited">${s.exitedAt ? fmt.date(s.exitedAt) : s.state === "pending" ? "—" : "still open"}</${KV}>
        <${KV} label="Stage clock">${s.state === "pending" ? "—" : `${s.daysIn} working day${s.daysIn === 1 ? "" : "s"}`}</${KV}>
        <${KV} label="Status">${s.state === "blocked" ? html`<${Pill} tone="red">Blocked</${Pill}>` : s.state === "active" ? html`<${Pill} tone="blue">In progress</${Pill}>` : s.state === "done" ? html`<${Pill} tone="green">Done</${Pill}>` : html`<${Pill} tone="gray">Pending</${Pill}>`}</${KV}>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <div class="crit crit--in"><div class="crit__l"><${Icon} name="arrowRight" size=12 /> Entry criteria</div><div class="crit__t">${s.entry}</div></div>
        <div class="crit crit--out"><div class="crit__l"><${Icon} name="check" size=12 /> Exit criteria</div><div class="crit__t">${s.exit}</div></div>
      </div>

      <!-- risk-based depth on the review / approval gates (Workstream H) -->
      ${s.gate && html`<div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name=${s.gate.kind === "approval" ? "checksquare" : "eye"} size=16 />
        <div>
          <div class="strong tiny">${(rec.risk || "medium")[0].toUpperCase() + (rec.risk || "medium").slice(1)} risk → ${s.gate.depth}</div>
          <div class="tiny" style="margin-top:3px;opacity:.85">${s.gate.kind === "approval" ? "Chain: " : "Reviewers: "}${s.gate.people.join(" → ")}</div>
        </div>
      </div>`}

      <!-- artifacts produced at this stage -->
      <div>
        <div class="tiny muted" style="font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Artifacts produced here</div>
        <div class="col" style="gap:6px">
          ${s.artifacts.map((a, i) => html`<div key=${i} class=${cx("artrow", a.to && "clickable", a.kind === "planned" && "artrow--planned")}
            onClick=${a.to ? () => navigate(a.to) : null}>
            <${Icon} name=${a.kind === "planned" ? "circle" : a.kind === "doc" ? "file" : a.kind === "tracker" ? "database" : a.kind === "tat" ? "clock" : a.kind === "template" ? "template" : a.kind === "rounds" ? "gitbranch" : a.kind === "review" ? "checkcircle" : a.kind === "approval" ? "checksquare" : "paperclip"} size=14 />
            <div style="flex:1;min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.label}</div><div class="tiny muted">${a.meta}</div></div>
            ${a.to && html`<${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)" }} />`}
          </div>`)}
        </div>
      </div>
    </div>
  </${Zone}>`;
}

/* ============================================================
   ZONE 3 — OUTPUT
   ============================================================ */
function OutputZone({ spine }) {
  const { output, rec, contract } = spine;
  const cur = (contract && contract.currency) || rec.currency;
  return html`<${Zone} zone=${ZONES[2]}
    right=${output.extraction ? html`<${Pill} tone=${output.extraction.confidence >= 0.9 ? "green" : "amber"}>Extraction ${Math.round((output.extraction.confidence || 0) * 100)}%</${Pill}>` : null}>

    <!-- the three destinations: drive file · tracker row · physical record -->
    <div class="dest">
      <div class=${cx("dest__card", !output.driveLink && "dest__card--empty")}>
        <div class="dest__ico" style="background:var(--accent-soft);color:var(--accent-500)"><${Icon} name="externalLink" size=16 /></div>
        <div style="flex:1;min-width:0">
          <div class="dest__l">Drive / folder</div>
          ${output.driveLink
            ? html`<a class="dest__v" href=${output.driveLink} target="_blank" rel="noreferrer">Open the file →</a>
                   <div class="tiny muted mono" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${output.storagePath || ""}</div>`
            : html`<div class="dest__v muted">Not stored yet</div>`}
        </div>
      </div>
      <div class=${cx("dest__card", !output.trackerRow && "dest__card--empty")}>
        <div class="dest__ico" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name="grid" size=16 /></div>
        <div style="flex:1;min-width:0">
          <div class="dest__l">Tracker row</div>
          ${output.trackerRow
            ? html`<button class="dest__v" onClick=${() => navigate("/tracker")}>${output.trackerRow.id} →</button>
                   <div class="tiny muted" style="margin-top:2px">Sr No ${output.trackerRow.srNo}</div>`
            : html`<div class="dest__v muted">No tracker row yet</div>`}
        </div>
      </div>
      <div class=${cx("dest__card", !output.trackerRow && "dest__card--empty")}>
        <div class="dest__ico" style="background:var(--warning-bg);color:var(--warning)"><${Icon} name="database" size=16 /></div>
        <div style="flex:1;min-width:0">
          <div class="dest__l">Physical record</div>
          ${output.trackerRow
            ? html`<div class="dest__v">${output.trackerRow.physicalRecordRef}</div>
                   <div class="tiny muted" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${output.trackerRow.officeLocation}</div>`
            : html`<div class="dest__v muted">Not mapped</div>`}
        </div>
      </div>
    </div>

    <div class="spine__grid" style="margin-top:14px">
      <div class="col" style="gap:14px">
        <!-- documents out -->
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Documents out</span><div class="spacer"></div><span class="tiny muted">${output.drafts.length} draft · ${output.executed.length} executed</span></div>
          ${output.drafts.length === 0 && output.executed.length === 0
            ? html`<span class="tiny muted">Nothing produced yet — drafts appear here from the Drafting stage.</span>`
            : html`<div class="col" style="gap:6px">
                ${output.executed.map((d) => html`<div key=${d.id} class="docrow clickable" onClick=${() => navigate("/repository/" + d.id)}>
                  <div class="notif__ico" style="width:30px;height:30px;background:var(--success-bg);color:var(--success)"><${Icon} name="fileCheck" size=15 /></div>
                  <div style="flex:1;min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div><div class="tiny muted">Executed · ${d.pages}p</div></div>
                </div>`)}
                ${output.drafts.map((d) => html`<div key=${d.id} class="docrow clickable" onClick=${() => navigate("/repository/" + d.id)}>
                  <div class="notif__ico" style="width:30px;height:30px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="edit" size=15 /></div>
                  <div style="flex:1;min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div><div class="tiny muted">Draft · ${d.pages}p</div></div>
                </div>`)}
              </div>`}
        </div>

        <!-- obligations extracted at execution -->
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Obligations</span><div class="spacer"></div>
            ${output.obligations.filter((o) => o.status === "Overdue").length > 0 && html`<${Pill} tone="red">${output.obligations.filter((o) => o.status === "Overdue").length} overdue</${Pill}>`}
          </div>
          ${output.obligations.length === 0
            ? html`<span class="tiny muted">Obligations are extracted once the agreement is executed.</span>`
            : output.obligations.map((o) => html`<div key=${o.id} class="row" style="gap:9px;align-items:flex-start">
                <${Icon} name=${o.status === "Overdue" ? "alertTriangle" : "checksquare"} size=15 style=${{ color: o.status === "Overdue" ? "var(--danger)" : "var(--text-3)", flex: "none", marginTop: "2px" }} />
                <div style="flex:1;min-width:0">
                  <div class="tiny strong">${o.text}</div>
                  <div class="tiny muted">${o.basis} · ${fmt.until(o.due)} · ${nameOf(o.owner)}</div>
                </div>
                <${Pill} tone=${o.status === "Overdue" ? "red" : "gray"}>${o.status}</${Pill}>
              </div>`)}
        </div>
      </div>

      <div class="col" style="gap:14px">
        <!-- what this record feeds into the analytics the GC reads -->
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong">Feeds analytics</span><div class="spacer"></div><button class="tiny" style="color:var(--brand);font-weight:600" onClick=${() => navigate("/analyzer")}>Analyzer →</button></div>
          ${output.analytics.length === 0
            ? html`<span class="tiny muted">No monetary contribution recorded.</span>`
            : output.analytics.map(([l, v, c]) => html`<div key=${l} class="row" style="font-size:12.5px"><span class="muted">${l}</span><div class="spacer"></div><span class="strong">${fmt.moneyFull(v, c)}</span></div>`)}
          ${output.analytics.length > 0 && html`<div class="row" style="font-size:12.5px;padding-top:7px;border-top:1px solid var(--border)"><span class="muted">Portfolio (USD)</span><div class="spacer"></div><span class="strong">${fmt.money(toUsd(output.analytics[0][1], cur))}</span></div>`}
        </div>

        <!-- landed artifacts, by the stage that produced them -->
        <div class="card card--pad col" style="gap:10px">
          <span class="strong">Produced so far</span>
          ${output.artifacts.length === 0
            ? html`<span class="tiny muted">Nothing has landed yet.</span>`
            : output.artifacts.map((a, i) => html`<div key=${i} class=${cx("row", a.to && "clickable")} style="gap:8px" onClick=${a.to ? () => navigate(a.to) : null}>
                <span class="tag-dot" style="background:var(--success)"></span>
                <div style="flex:1;min-width:0"><div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.label}</div><div class="tiny muted">at ${a.stage}</div></div>
              </div>`)}
        </div>
      </div>
    </div>
  </${Zone}>`;
}

/* ============================================================
   ZONE 4 — RELATIONSHIPS
   ============================================================ */
function RelationshipsZone({ spine }) {
  const groups = spine.relationships;
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  return html`<${Zone} zone=${ZONES[3]} right=${html`<span class="tiny muted">${total} linked record${total === 1 ? "" : "s"}</span>`}>
    ${groups.length === 0
      ? html`<${Empty} icon="git" title="Nothing linked yet" text="Tag a company or attach a contract and the relationships appear here." />`
      : html`<div class="relgrid">
        ${groups.map((g) => html`<div key=${g.group} class="card card--pad col" style="gap:8px">
          <div class="row"><span class="strong tiny" style="text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">${g.group}</span><div class="spacer"></div><span class="tiny muted">${g.items.length}</span></div>
          ${g.items.map((it, i) => html`<div key=${i} class=${cx("relrow", it.to && "clickable")} onClick=${it.to ? () => navigate(it.to) : null}>
            <div class="notif__ico" style="width:28px;height:28px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name=${it.icon} size=14 /></div>
            <div style="flex:1;min-width:0">
              <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.label}</div>
              <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.meta}</div>
            </div>
            ${it.to && html`<${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />`}
          </div>`)}
        </div>`)}
      </div>`}
  </${Zone}>`;
}

/* ============================================================
   The component
   ============================================================ */
export function WorkflowSpine({ id, showHeader = true }) {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  // The requester roster resolves portal sign-ups (RQ-*) to real names.
  const requesters = useCollection("requesters");
  const [zone, setZone] = useState("input");

  const spine = useMemo(
    () => buildSpine(id, { requests, matters, contracts, repository, licenses, requesters }),
    [id, requests, matters, contracts, repository, licenses, requesters]
  );

  // Highlight the zone chip that is currently on screen.
  useEffect(() => {
    const els = ZONES.map((z) => document.getElementById("zone-" + z.key)).filter(Boolean);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setZone(vis.target.id.replace("zone-", ""));
    }, { root: document.querySelector(".content"), threshold: [0.15, 0.5] });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [spine && spine.id]);

  if (!spine) {
    return html`<${Empty} icon="search" title="Record not found" text="No request, matter or contract matches this id." />`;
  }

  const { rec, tat, request, matter, contract } = spine;
  const jump = (key) => {
    const el = document.getElementById("zone-" + key);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setZone(key);
  };

  return html`<div class="spine">
    ${showHeader && html`<div class="spine__head">
      <div style="min-width:0">
        <div class="row wrap" style="gap:8px;margin-bottom:7px">
          <span class="mono muted">${spine.id}</span>
          <${Status} value=${rec.status} />
          <${Risk} level=${rec.risk} />
          <${Pill} tone="gray">${rec.requestType}</${Pill}>
          ${rec.contractType && html`<${Pill} tone="indigo">${rec.contractType}</${Pill}>`}
          <${SubdivisionPill} item=${rec} />
        </div>
        <div class="spine__title">${rec.title}</div>
        <div class="tiny muted" style="margin-top:4px">
          ${entityName(rec.entityId)} · ${rec.counterparty || "—"}${rec.value ? " · " + fmt.moneyFull(rec.value, rec.currency) : ""}
        </div>
      </div>
      <div class="col" style="gap:8px;align-items:flex-end;flex:none">
        <${TatCell} tat=${tat} />
        <div class="row" style="gap:6px">
          ${request && html`<button class="facechip" onClick=${() => navigate("/workspace/" + request.id)}><${Icon} name="inbox" size=12 />${request.id}</button>`}
          ${matter && html`<button class="facechip" onClick=${() => navigate("/matters/" + matter.id)}><${Icon} name="folder" size=12 />${matter.id}</button>`}
          ${contract && html`<button class="facechip" onClick=${() => navigate("/contracts/" + contract.id)}><${Icon} name="file" size=12 />${contract.id}</button>`}
        </div>
      </div>
    </div>`}

    <!-- always-visible zone navigation -->
    <div class="zonenav">
      ${ZONES.map((z) => html`<button key=${z.key} class=${cx("zonenav__b", zone === z.key && "active")} onClick=${() => jump(z.key)}>
        <span class="zonenav__n">${z.n}</span>
        <${Icon} name=${z.icon} size=14 />
        <span class="zonenav__l">${z.label}</span>
      </button>`)}
      <div class="spacer"></div>
      <span class="tiny muted" style="padding-right:4px">${spine.stages.filter((s) => s.state === "done").length}/${spine.stages.length} stages complete</span>
    </div>

    <${InputZone} spine=${spine} />
    <${ProcessZone} spine=${spine} />
    <${OutputZone} spine=${spine} />
    <${RelationshipsZone} spine=${spine} />
  </div>`;
}

export default WorkflowSpine;
