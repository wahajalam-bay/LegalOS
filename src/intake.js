// The ONE intake form.
//
// Workstream J: the internal Legal Workspace and the external requester portal
// render this same component over the same canonical LegalRequest schema, and
// both submit through store.js#submitLegalRequest. When the standalone
// requester app is built it renders this form (or its own markup) against the
// same payload shape — nothing on the department side has to change.
import { html, cx, fmt, useState, useMemo } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Modal, Field, Input, Textarea, Pill, AICard, Risk, Avatar } from "./ui.js";
import { submitLegalRequest, duplicateCheck, getCollection } from "./store.js";
import {
  CONTRACT_REQUEST_TYPES, CONTRACT_TYPE_CODES, WORK_CATEGORIES, LEGAL_SUBDIVISIONS,
  BUSINESS_UNITS, DEPARTMENTS, GROUP_ENTITIES, COMPANIES, USERS, nameOf,
  inferCategory, inferSubdivision, lifecyclePathFor, entityById,
} from "./data.js";
import { tatDaysFor } from "./tat.js";

const RISKS = ["low", "medium", "high", "critical"];

// Request types that attach to an existing contract.
const NEEDS_PARENT = new Set(["Amendment", "Revision", "Extension", "Termination"]);

export function IntakeForm({ mode = "internal", requesterId = "u13", onClose, onDone }) {
  const contracts = getCollection("contracts");
  const companies = getCollection("companies") || COMPANIES;
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [f, setF] = useState({
    requestType: "New",
    contractType: "",
    title: "",
    entityId: (GROUP_ENTITIES[0] || {}).id || "CO-22",
    counterparty: "",
    department: mode === "portal" ? (USERS.find((u) => u.id === requesterId) || {}).team || DEPARTMENTS[0] : DEPARTMENTS[0],
    unit: BUSINESS_UNITS[0],
    dueDate: "",
    value: "",
    riskPreliminary: "medium",
    description: "",
    linkedContractId: "",
    category: "",
    subdivision: "",
    attachments: [],
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const category = f.category || inferCategory({ type: f.contractType, title: f.title });
  const subdivision = f.subdivision || inferSubdivision({ contractType: f.contractType, title: f.title, category });
  const path = lifecyclePathFor(f.requestType);

  // The TAT the engine WILL fix on triage — shown up front so nobody negotiates it.
  const previewTat = tatDaysFor(f.contractType || "default", f.riskPreliminary, f.requestType);

  // Live duplicate / counterparty check against the open queue.
  const dupes = useMemo(
    () => duplicateCheck({ counterparty: f.counterparty, entityId: f.entityId, linkedContractId: f.linkedContractId || null }),
    [f.counterparty, f.entityId, f.linkedContractId]
  );

  const entityContracts = contracts.filter((c) => c.entityId === f.entityId);
  const canSubmit = f.title.trim() && f.requestType && f.entityId;

  const submit = () => {
    const res = submitLegalRequest({
      requestType: f.requestType,
      contractType: f.contractType || null,
      title: f.title,
      category,
      subdivision,
      entityId: f.entityId,
      companyTags: [f.entityId],
      department: f.department,
      unit: f.unit,
      dueDate: f.dueDate ? new Date(f.dueDate + "T00:00:00").toISOString() : undefined,
      requesterId,
      description: f.description,
      attachments: f.attachments,
      linkedContractId: f.linkedContractId || null,
      riskPreliminary: f.riskPreliminary,
      counterparty: f.counterparty,
      value: f.value ? Number(String(f.value).replace(/[^0-9.]/g, "")) : null,
      source: mode === "portal" ? "portal" : "internal",
    });
    if (!res.ok) { setResult({ errors: res.errors }); return; }
    setResult(res);
    setStep(2);
  };

  const addFile = () => {
    const n = f.attachments.length + 1;
    set("attachments", [...f.attachments, { name: `Supporting-document-${n}.pdf`, sizeKb: 420 + n * 130, kind: "Attachment" }]);
  };

  /* ---------- step 2: the receipt (proves the round-trip) ---------- */
  if (step === 2 && result && result.ok) {
    return html`<${Modal} title="Request submitted" icon="checkcircle" width=${580} onClose=${() => { onDone && onDone(result); onClose(); }}
      footer=${html`<${Btn} variant="ghost" onClick=${() => { onDone && onDone(result); onClose(); }}>Close</${Btn}>
        <${Btn} variant="primary" icon="arrowRight" onClick=${() => { onDone && onDone(result, true); onClose(); }}>Open the flow</${Btn}>`}>
      <div class="col" style="gap:16px">
        <div class="banner banner--info" style="align-items:flex-start">
          <${Icon} name="checkcircle" size=18 />
          <div>
            <div class="strong tiny">${result.id} created and dropped into Triage</div>
            <div class="tiny" style="margin-top:3px;opacity:.85">
              The department sees it in the Legal Workspace immediately${mode === "portal" ? "; you will see status changes in your portal" : ""}.
            </div>
          </div>
        </div>
        <div class="kvgrid">
          <div class="kv"><div class="kv__l">Request id</div><div class="kv__v mono">${result.id}</div></div>
          <div class="kv"><div class="kv__l">TAT auto-fixed</div><div class="kv__v">${result.tat.days} working days</div></div>
          <div class="kv"><div class="kv__l">TAT basis</div><div class="kv__v">${result.tat.basis}</div></div>
          <div class="kv"><div class="kv__l">Due by (TAT)</div><div class="kv__v">${fmt.date(result.tat.dueAt)}</div></div>
          <div class="kv"><div class="kv__l">Routed to</div><div class="kv__v">${nameOf(result.owner)}</div></div>
          <div class="kv"><div class="kv__l">Sub-division</div><div class="kv__v">${subdivision}</div></div>
        </div>
        ${result.duplicates.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
          <${Icon} name="alertTriangle" size=17 />
          <div>
            <div class="strong tiny">${result.duplicates.length} possible duplicate${result.duplicates.length === 1 ? "" : "s"} on the same counterparty / contract</div>
            ${result.duplicates.map((d) => html`<div key=${d.id} class="tiny" style="margin-top:3px;opacity:.9">${d.id} — ${d.title} (${d.reason})</div>`)}
          </div>
        </div>`}
      </div>
    </${Modal}>`;
  }

  /* ---------- step 0: what kind of request ---------- */
  /* ---------- step 1: the canonical fields ---------- */
  return html`<${Modal} title=${mode === "portal" ? "Submit a legal request" : "New legal request"} icon="inbox" width=${640} onClose=${onClose}
    footer=${step === 0
      ? html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" iconRight="arrowRight" onClick=${() => setStep(1)}>Continue</${Btn}>`
      : html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(0)}>Back</${Btn}>
        <${Btn} variant="primary" icon="check" onClick=${submit} disabled=${!canSubmit}>Submit request</${Btn}>`}>

    ${step === 0 ? html`<div class="col" style="gap:18px">
      <div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="sparkles" size=18 />
        <div>
          <div class="strong tiny">Pick the request type — it presets the lifecycle path</div>
          <div class="tiny" style="margin-top:3px;opacity:.85">Turnaround is fixed automatically from type × risk. It is never negotiated at intake.</div>
        </div>
      </div>
      <${Field} label="What kind of request is this?">
        <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
          ${CONTRACT_REQUEST_TYPES.map((t) => html`<button key=${t} class=${cx("chip", f.requestType === t && "active")} style="justify-content:flex-start;height:38px" onClick=${() => set("requestType", t)}>
            <${Icon} name=${f.requestType === t ? "checkcircle" : "file"} size=15 />${t}
          </button>`)}
        </div>
      </${Field}>
      <${Field} label="Type of contract" hint="The KSA / PK contract-type register. Leave blank for advice-only requests.">
        <select class="select" value=${f.contractType} onChange=${(e) => set("contractType", e.target.value)}>
          <option value="">— none / advice only —</option>
          ${CONTRACT_TYPE_CODES.map((c) => html`<option key=${c} value=${c}>${c}</option>`)}
        </select>
      </${Field}>
      <div class="card card--pad col" style="gap:8px">
        <div class="tiny muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em">Lifecycle path for ${f.requestType}</div>
        <div class="row wrap" style="gap:5px">
          ${path.map((s, i) => html`<${Fragment0} key=${s}>
            <span class="tagchip">${s}</span>${i < path.length - 1 && html`<${Icon} name="chevronRight" size=12 style=${{ color: "var(--text-3)" }} />`}
          </${Fragment0}>`)}
        </div>
      </div>
    </div>` : html`<div class="col" style="gap:16px">
      <div class="row wrap" style="gap:8px">
        <${Pill} tone="blue">${f.requestType}</${Pill}>
        ${f.contractType && html`<${Pill} tone="indigo">${f.contractType}</${Pill}>`}
        <div class="spacer"></div>
        <span class="tiny muted">Canonical LegalRequest schema</span>
      </div>

      <${Field} label="Request title"><${Input} placeholder=${`e.g. ${f.contractType || "Legal advice"} — counterparty name`} value=${f.title} onInput=${(e) => set("title", e.target.value)} /></${Field}>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Company / entity">
          <select class="select" value=${f.entityId} onChange=${(e) => set("entityId", e.target.value)}>
            ${GROUP_ENTITIES.map((c) => html`<option key=${c.id} value=${c.id}>${c.name} · ${c.jur}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Counterparty"><${Input} placeholder="e.g. Retal Urban Development Co." value=${f.counterparty} onInput=${(e) => set("counterparty", e.target.value)} /></${Field}>
        <${Field} label="Requesting department">
          <select class="select" value=${f.department} onChange=${(e) => set("department", e.target.value)}>${DEPARTMENTS.map((d) => html`<option key=${d}>${d}</option>`)}</select>
        </${Field}>
        <${Field} label="Business unit">
          <select class="select" value=${f.unit} onChange=${(e) => set("unit", e.target.value)}>${BUSINESS_UNITS.map((b) => html`<option key=${b}>${b}</option>`)}</select>
        </${Field}>
        <${Field} label="Category" hint="Auto-suggested; override if needed.">
          <select class="select" value=${category} onChange=${(e) => set("category", e.target.value)}>${WORK_CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}</select>
        </${Field}>
        <${Field} label="Legal sub-division" hint="Auto-suggested from the contract type.">
          <select class="select" value=${subdivision} onChange=${(e) => set("subdivision", e.target.value)}>${LEGAL_SUBDIVISIONS.map((c) => html`<option key=${c}>${c}</option>`)}</select>
        </${Field}>
        <${Field} label="Business need-by date" hint="Informational — the TAT clock is authoritative.">
          <${Input} type="date" value=${f.dueDate} onInput=${(e) => set("dueDate", e.target.value)} />
        </${Field}>
        <${Field} label=${`Estimated value (${(entityById(f.entityId) || {}).jur === "PK" ? "PKR" : (entityById(f.entityId) || {}).jur === "UAE" ? "AED" : "SAR"})`}>
          <${Input} placeholder="e.g. 4600000" value=${f.value} onInput=${(e) => set("value", e.target.value)} />
        </${Field}>
      </div>

      <${Field} label="Preliminary risk" hint="Legal re-scores this at triage; it drives review depth and the approval chain.">
        <div class="row wrap" style="gap:8px">
          ${RISKS.map((r) => html`<button key=${r} class=${cx("chip", f.riskPreliminary === r && "active")} onClick=${() => set("riskPreliminary", r)}><${Risk} level=${r} /></button>`)}
        </div>
      </${Field}>

      ${NEEDS_PARENT.has(f.requestType) && html`<${Field} label="Attaches to which existing contract?" hint="Links this request to its parent in the Relationships zone.">
        <select class="select" value=${f.linkedContractId} onChange=${(e) => set("linkedContractId", e.target.value)}>
          <option value="">— select the prior contract —</option>
          ${entityContracts.map((c) => html`<option key=${c.id} value=${c.id}>${c.id} · ${c.title}</option>`)}
        </select>
      </${Field}>`}

      <${Field} label="What do you need?"><${Textarea} rows=3 placeholder="Describe the commercial background, key terms and what is driving the deadline…" value=${f.description} onInput=${(e) => set("description", e.target.value)} /></${Field}>

      <${Field} label="Attachments" hint="Files are carried into the Intake stage and appear in the record's Input zone.">
        <div class="col" style="gap:6px">
          ${f.attachments.map((a, i) => html`<div key=${i} class="docrow">
            <${Icon} name="paperclip" size=15 />
            <div style="flex:1;min-width:0"><div class="strong tiny">${a.name}</div><div class="tiny muted">${a.sizeKb} KB</div></div>
            <button class="iconbtn" style="width:24px;height:24px" onClick=${() => set("attachments", f.attachments.filter((_, j) => j !== i))}><${Icon} name="x" size=14 /></button>
          </div>`)}
          <${Btn} variant="soft" size="sm" icon="upload" onClick=${addFile}>Attach a document</${Btn}>
        </div>
      </${Field}>

      ${dupes.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
        <${Icon} name="alertTriangle" size=17 />
        <div>
          <div class="strong tiny">Already open on this counterparty / contract</div>
          ${dupes.slice(0, 3).map((d) => html`<div key=${d.id} class="tiny" style="margin-top:3px;opacity:.9">${d.id} — ${d.title} · ${d.status} · ${nameOf(d.owner)} (${d.reason})</div>`)}
        </div>
      </div>`}

      <${AICard} title="What happens on submit">
        TAT is auto-fixed at <b>${previewTat} working days</b> (${f.contractType || "default"} × ${f.riskPreliminary}); the record lands in
        <b>Triage</b> on the <b>${subdivision}</b> desk, and the duplicate/counterparty check runs against the open queue.
        Nothing here is manually negotiable.
      </${AICard}>

      ${result && result.errors && html`<div class="banner banner--warn"><${Icon} name="alertCircle" size=16 /><span>${result.errors.join(" · ")}</span></div>`}
    </div>`}
  </${Modal}>`;
}

// htm needs a component reference for a keyed fragment wrapper.
function Fragment0({ children }) { return children; }

export default IntakeForm;
