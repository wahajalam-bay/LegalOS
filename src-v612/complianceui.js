// Shared workflow UI for the Compliance workspace.
//
// One set of components serves loans, leases, service agreements, resolutions,
// licences and SECP filings, because they share one lifecycle:
//
//   DRAFT -> LEGAL REVIEW -> FINALIZED -> SIGNATURE -> EXECUTED -> DRIVE FILING
//
// Two rules run through all of it:
//
//  * Every control that appears does something. A button is rendered only when
//    the server has told us the caller holds the capability AND the record is in
//    a stage where the action is legal. Anything else is absent, or present and
//    disabled with the reason stated -- never present and inert.
//
//  * Nothing here decides access. `caps` comes from the server; the server
//    re-checks on every call. The UI hides what would be refused, it does not
//    grant anything.
import { html, cx, fmt, useState, useEffect, useMemo } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Modal, Field, Input, Textarea, Section, Pill, Status, Stepper, Empty, AICard } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";
/* Who is looking. Used only to say, before the click, which controls this
   person cannot use -- never to grant anything: the server re-checks. */
import { useActiveUser } from "./rbac.js";

const dash = (v) => (v == null || v === "" ? "—" : v);
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------- select input */

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return html`<select class="input" value=${value == null ? "" : value}
    onChange=${(e) => onChange(e.target.value)} ...${rest}>
    ${placeholder ? html`<option value="">${placeholder}</option>` : ""}
    ${options.map((o) => {
      const v = typeof o === "string" ? o : o.value;
      const l = typeof o === "string" ? o : o.label;
      return html`<option key=${v} value=${v}>${l}</option>`;
    })}
  </select>`;
}

/* ---------------------------------------------------------- lifecycle chrome */

const FLOW = ["DRAFT", "LEGAL_REVIEW", "FINALIZED", "SIGNATURE", "EXECUTED"];
const FLOW_LABEL = ["Draft", "Legal review", "Finalized", "Signature", "Executed"];

export function WorkflowStepper({ record }) {
  if (record.status === "CANCELLED") {
    return html`<div class="row" style="gap:8px;align-items:center;padding:8px 2px">
      <${Pill} tone="red">Cancelled</${Pill}>
      <span class="tiny muted">This action was cancelled and is kept for the audit trail.</span></div>`;
  }
  const i = Math.max(0, FLOW.indexOf(record.status));
  return html`<${Stepper} steps=${FLOW_LABEL} current=${i} />`;
}

/* ------------------------------------------------------------ action buttons */

// The one place that decides which workflow control is offered. It answers a
// single question per control: is this legal right now, for this person, on this
// record? If not, the control is not drawn.
export function workflowActions(record, caps, me, config) {
  const st = record.status;
  const out = [];
  const sigs = record.signatories || [];
  const signedAll = sigs.length > 0 && sigs.every((s) => s.status === "Signed" || s.status === "Not required");
  const hasExecutedDoc = (record.documents || []).some((d) => d.kind === "executed");

  if (st === "DRAFT" && caps["compliance.document.generate"]) out.push({ id: "generate", label: "Generate document", icon: "file" });
  if (st === "DRAFT" && caps["compliance.review"]) out.push({ id: "review", label: "Send for legal review", icon: "send", to: "LEGAL_REVIEW" });
  if (st === "LEGAL_REVIEW" && caps["compliance.document.generate"]) out.push({ id: "generate", label: "Regenerate document", icon: "file" });
  if (st === "LEGAL_REVIEW" && caps["compliance.finalize"]) {
    /* SEPARATION OF DUTIES, SAID BEFORE THE CLICK RATHER THAN AFTER IT.
       The server refuses to let the drafter finalize their own document, and
       it is right to. But this panel was still drawing the button, so the
       drafter pressed Finalize, got a 409, and the record sat in Legal review
       looking as though the workflow had stopped working. The refusal is now
       part of the control: the button is present, so the path to finalizing
       stays legible, and it is disabled with the reason -- the same pattern
       "Mark executed" already uses for unsigned signatories.

       This mirrors the server rule; it does not replace it. The server remains
       the thing that enforces it, on verified identity. */
    const drafter = ((record.review && record.review.createdBy) || record.createdBy || {}).email || null;
    const sodOn = !(config && config.workflow && config.workflow.segregationOfDuties === false);
    const iDrafted = !!(sodOn && drafter && me && me.email && drafter === me.email);
    out.push({
      id: "finalize", label: "Finalize", icon: "check", to: "FINALIZED",
      disabled: iDrafted,
      disabledReason: "You drafted this. Someone else has to finalize it — that separation is the control.",
    });
  }
  if (st === "LEGAL_REVIEW" && caps["compliance.edit"]) out.push({ id: "back", label: "Return to draft", icon: "arrowLeft", to: "DRAFT" });
  if (st === "FINALIZED" && caps["compliance.signature.request"]) out.push({ id: "signature", label: "Send for signature", icon: "edit" });
  if (st === "SIGNATURE" && caps["compliance.signature.upload"]) out.push({ id: "upload", label: "Upload signed copy", icon: "upload" });
  if (st === "SIGNATURE" && caps["compliance.execute"]) {
    out.push({
      id: "execute", label: "Mark executed", icon: "checkCircle", to: "EXECUTED",
      // Present but disabled, with the reason, so the path to executing is
      // legible rather than mysterious.
      disabled: !signedAll || !hasExecutedDoc,
      disabledReason: !sigs.length ? "Add signatories first."
        : !signedAll ? "Every signatory must be marked signed, declined or not required."
          : "Upload the signed copy before marking this executed.",
    });
  }
  if (st === "EXECUTED" && caps["compliance.drive.file"]) out.push({ id: "drive", label: "Record Drive filing", icon: "folder" });
  if (st !== "EXECUTED" && st !== "CANCELLED" && caps["compliance.edit"]) out.push({ id: "cancel", label: "Cancel action", icon: "x", to: "CANCELLED", danger: true });
  return out;
}

/* ============================================================ RECORD PANEL */

/* The full workflow surface for one child action -- its stage, its documents,
   its signatories, its Drive filing state and its audit trail. Used by every
   compliance family. */
export function ActionPanel({ recordId, onClose, onChanged, caps, config }) {
  const me = useActiveUser();
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  /* Editing the record's own fields. The workflow refuses an edit once a
     record is executed, so the control is not offered there either. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});

  const load = () => api.compliance.record(recordId).then(
    (r) => { setRec(r.record); setErr(null); },
    (e) => setErr(e.message || "Could not load the record.")
  );
  useEffect(() => { load(); }, [recordId]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.record) setRec(r.record);
      if (okMsg) toast(okMsg, "success");
      if (onChanged) onChanged();
    } catch (e) {
      // The server's refusal text is the explanation. Showing our own generic
      // message here would hide the actual reason (a missing capability, a
      // segregation-of-duties block, an unsigned signatory).
      toast(e.message || "That action could not be completed.", "error");
    } finally { setBusy(false); }
  };

  if (err) return html`<${Modal} title="Action" icon="alertTriangle" onClose=${onClose}>
    <div class="tiny" style="color:var(--danger-text)">${err}</div></${Modal}>`;
  if (!rec) return html`<${Modal} title="Loading…" icon="clock" onClose=${onClose}><div class="tiny muted">Reading the action…</div></${Modal}>`;

  const actions = workflowActions(rec, caps || {}, me, config);
  const run = (a) => {
    if (a.disabled) return;
    if (a.id === "generate") return setModal("generate");
    if (a.id === "signature") return setModal("signature");
    if (a.id === "upload") return setModal("upload");
    if (a.id === "drive") return setModal("drive");
    if (a.to) return act(() => api.compliance.transition(rec.id, { to: a.to }), "Moved to " + (config.workflowStatuses[a.to] || a.to) + ".");
  };

  return html`<${Modal} title=${rec.id + " · " + (rec.subtype || rec.type)} icon="activity" width=${860} onClose=${onClose}
    footer=${html`<div class="row" style="gap:8px;width:100%;align-items:center">
      <span class="tiny muted">${rec.parent ? rec.parent.label : ""}</span>
      <div class="spacer"></div>
      ${actions.map((a) => html`<${Btn} key=${a.id} variant=${a.danger ? "ghost" : (a.id === "execute" || a.id === "finalize" ? "primary" : "ghost")}
        icon=${a.icon} disabled=${busy || a.disabled}
        title=${a.disabled ? a.disabledReason : a.label}
        onClick=${() => run(a)}>${a.label}</${Btn}>`)}
    </div>`}>
    <div class="col" style="gap:14px">
      <${WorkflowStepper} record=${rec} />
      ${actions.some((a) => a.disabled) && html`<div class="tiny" style="color:var(--warning-text)">
        ${actions.filter((a) => a.disabled).map((a) => a.disabledReason).join(" ")}</div>`}

      <${Section} title="Details" icon="info" bodyClass="col"
        actions=${caps["compliance.edit"] && rec.status !== "EXECUTED" && rec.status !== "CANCELLED"
          && html`<${Btn} size="sm" variant="ghost" icon=${editing ? "x" : "edit"}
            onClick=${() => { setEditing((v) => !v); setDraft({}); }}>${editing ? "Cancel" : "Edit"}</${Btn}>`}>
        ${editing
          ? html`<${DetailsEdit} rec=${rec} draft=${draft} setDraft=${setDraft} busy=${busy}
              onSave=${() => act(() => api.compliance.updateRecord(rec.id, { fields: draft }), "Details saved.")
                .then(() => { setEditing(false); setDraft({}); })} />`
          : html`<${FieldGrid} rows=${Object.entries(rec.fields || {}).filter(([, v]) => v != null && v !== "")
              .map(([k, v]) => [labelize(k), String(v)])} />`}
        ${!editing && rec.status === "EXECUTED" && html`<div class="tiny muted" style="padding-top:8px">
          This record is executed. Its details are locked — record a new action rather than rewriting history.
        </div>`}
      </${Section}>

      <${ReviewBlock} rec=${rec} />
      <${SignatoryBlock} rec=${rec} caps=${caps} config=${config} busy=${busy}
        onSet=${(list) => act(() => api.compliance.signatories(rec.id, list), "Signatories updated.")}
        onMark=${(i, s) => act(() => api.compliance.markSigned(rec.id, i, s), "Signature status updated.")} />
      <${DocumentBlock} rec=${rec} />
      <${DriveBlock} rec=${rec} config=${config} />
      <${AuditBlock} rec=${rec} />
    </div>

    ${modal === "generate" && html`<${GenerateModal} rec=${rec} onClose=${() => setModal(null)}
      onDone=${(r) => { setRec(r.record); setModal(null); if (onChanged) onChanged(); }} />`}
    ${modal === "signature" && html`<${SignatureModal} rec=${rec} config=${config} onClose=${() => setModal(null)}
      onDone=${(r) => { setRec(r.record); setModal(null); if (onChanged) onChanged(); }} />`}
    ${modal === "upload" && html`<${UploadModal} rec=${rec} kind="executed" onClose=${() => setModal(null)}
      onDone=${(r) => { setRec(r.record); setModal(null); if (onChanged) onChanged(); }} />`}
    ${modal === "drive" && html`<${DriveFilingModal} rec=${rec} onClose=${() => setModal(null)}
      onDone=${(r) => { setRec(r.record); setModal(null); if (onChanged) onChanged(); }} />`}
  </${Modal}>`;
}

/* EDIT THE FIELDS THIS RECORD ACTUALLY HAS.
   The Details block was read-only, so a renewal could be moved from Draft to
   Submitted without anyone being able to record the submission date, the new
   licence number or the authority's reference -- the workflow advanced while
   the facts it exists to hold stayed empty. Dates render as date inputs and
   long text as a textarea; everything else is a plain field. */
const DATE_FIELD = /(date|expiry|start|at)$/i;
const LONG_FIELD = /^(body|notes|purpose|missingItems)$/;

function DetailsEdit({ rec, draft, setDraft, busy, onSave }) {
  const keys = FIELD_ORDER[rec.type] || Object.keys(rec.fields || {});
  const val = (k) => (draft[k] !== undefined ? draft[k] : (rec.fields && rec.fields[k] != null ? String(rec.fields[k]) : ""));
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  return html`<div class="col" style="gap:10px">
    <div class="modeditgrid">
      ${keys.map((k) => html`<${Field} key=${k} label=${labelize(k)}>
        ${LONG_FIELD.test(k)
          ? html`<textarea class="input" rows="5" id=${"wf-" + k} value=${val(k)} onInput=${set(k)}></textarea>`
          : html`<input class="input" id=${"wf-" + k} type=${DATE_FIELD.test(k) ? "date" : "text"}
              value=${val(k)} onInput=${set(k)} />`}
      </${Field}>`)}
    </div>
    <div class="row" style="gap:8px">
      <${Btn} variant="primary" icon="check" disabled=${busy || !Object.keys(draft).length}
        onClick=${onSave}>${busy ? "Saving…" : "Save details"}</${Btn}>
      <span class="tiny muted" style="align-self:center">Saved on the server and written to this record's history.</span>
    </div>
  </div>`;
}

/* The order these read best in, per record type. Anything not listed still
   appears — the list is presentation, not a filter. */
const FIELD_ORDER = {
  licenceApplication: ["applicationType", "authority", "licenceType", "currentLicenceNumber", "currentExpiry",
    "applicationStart", "applicationReference", "submissionDate", "decisionDate",
    "renewedLicenceNumber", "newIssueDate", "newExpiryDate", "portalStatus", "requiredDate", "notes"],
  resolution: ["resolutionType", "subject", "addressedTo", "authorizedPerson", "authorizedPersonDesignation",
    "requestingDepartment", "urgency", "resolutionDate", "signatureMethod", "executionDate",
    "stampedCopy", "driveTarget", "body", "notes"],
  secpFiling: ["form", "financialYear", "statutoryDueDate", "filingDate", "filingStatus", "overdueReason",
    "authorizedFiler", "acknowledgementRef", "notes"],
};

const labelize = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

export function FieldGrid({ rows }) {
  if (!rows.length) return html`<div class="tiny muted">Nothing recorded yet.</div>`;
  return html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:2px 24px">
    ${rows.map(([l, v]) => html`<div key=${l} class="row" style="gap:12px;padding:7px 2px;border-bottom:1px solid var(--border);align-items:baseline">
      <div class="tiny muted" style="width:150px;flex:none">${l}</div>
      <div class="tiny" style="flex:1;word-break:break-word">${v}</div></div>`)}
  </div>`;
}

function ReviewBlock({ rec }) {
  const r = rec.review || {};
  return html`<${Section} title="Legal review" icon="check" bodyClass="col">
    <${FieldGrid} rows=${[
      ["Draft created by", r.createdBy ? r.createdBy.name : "—"],
      ["Draft created at", r.createdAt ? fmt.date(r.createdAt) : "—"],
      ["Reviewer", dash(r.reviewer)],
      ["Review status", dash(r.reviewStatus)],
      ["Review comments", dash(r.reviewComments)],
      ["Finalized by", r.finalizedBy ? r.finalizedBy.name : "—"],
      ["Finalized at", r.finalizedAt ? fmt.date(r.finalizedAt) : "—"],
    ]} />
  </${Section}>`;
}

/* ------------------------------------------------------------- signatories */

function SignatoryBlock({ rec, caps, config, busy, onSet, onMark }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", capacity: "", entity: rec.entity || "", method: "wet" });
  const sigs = rec.signatories || [];
  const canEdit = caps["compliance.edit"] && rec.status !== "EXECUTED" && rec.status !== "CANCELLED";
  const canMark = caps["compliance.signature.upload"] && rec.status !== "EXECUTED";

  const add = () => {
    if (!draft.name.trim()) return;
    onSet([...sigs, { ...draft, status: "Not sent" }]);
    setDraft({ name: "", capacity: "", entity: rec.entity || "", method: "wet" });
    setAdding(false);
  };

  return html`<${Section} title="Signatories" icon="users"
    sub=${rec.signature && rec.signature.label ? rec.signature.label : null}
    actions=${canEdit ? html`<${Btn} size="sm" icon="plus" onClick=${() => setAdding(!adding)}>Add signatory</${Btn}>` : null}
    bodyClass="col">
    ${sigs.length === 0 && html`<div class="tiny muted">No signatories selected yet.</div>`}
    ${sigs.map((s, i) => html`<div key=${i} class="feed__item" style="align-items:center">
      <div style="flex:1;min-width:0">
        <div class="tiny strong">${s.name}</div>
        <div class="tiny muted">${[s.capacity, s.entity, s.method === "esign" ? "E-signature" : "Wet / ink"].filter(Boolean).join(" · ")}</div>
      </div>
      ${s.signedDate ? html`<span class="tiny muted">${fmt.dateShort(s.signedDate)}</span>` : ""}
      ${canMark
        ? html`<${Select} value=${s.status} onChange=${(v) => onMark(i, v)} disabled=${busy}
            options=${config.signatureStatuses || ["Not sent", "Pending", "Signed", "Declined", "Not required"]} />`
        : html`<${Pill} tone=${s.status === "Signed" ? "green" : s.status === "Declined" ? "red" : "gray"}>${s.status}</${Pill}>`}
    </div>`)}
    ${adding && html`<div class="col" style="gap:8px;padding:10px;background:var(--surface-3);border-radius:8px">
      <${Field} label="Name"><${Input} value=${draft.name} onInput=${(e) => setDraft({ ...draft, name: e.target.value })} /></${Field}>
      <${Field} label="Capacity / role"><${Input} value=${draft.capacity} onInput=${(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="Director, Authorised signatory…" /></${Field}>
      <${Field} label="Entity"><${Input} value=${draft.entity} onInput=${(e) => setDraft({ ...draft, entity: e.target.value })} /></${Field}>
      <${Field} label="Signature method"><${Select} value=${draft.method} onChange=${(v) => setDraft({ ...draft, method: v })}
        options=${[{ value: "wet", label: "Wet / ink signature" }, { value: "esign", label: "E-signature" }]} /></${Field}>
      <div class="row" style="gap:8px"><${Btn} variant="primary" size="sm" onClick=${add}>Add</${Btn}>
        <${Btn} size="sm" onClick=${() => setAdding(false)}>Cancel</${Btn}></div>
    </div>`}
  </${Section}>`;
}

/* --------------------------------------------------------------- documents */

function DocumentBlock({ rec }) {
  const docs = rec.documents || [];
  const KIND = { generated: "Generated draft", executed: "Executed copy", supporting: "Supporting", correspondence: "Correspondence", acknowledgement: "Acknowledgement" };
  return html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip" bodyClass="col">
    ${rec.template && html`<div class="tiny muted" style="padding:2px 2px 8px">
      Approved template: <strong>${rec.template.name}</strong>${rec.template.folderPath ? " · " + rec.template.folderPath : ""}</div>`}
    ${docs.length === 0 && html`<div class="tiny muted">No documents yet.</div>`}
    ${docs.map((d) => html`<a key=${d.id} class="feed__item clickable" style="align-items:center;text-decoration:none;color:inherit"
      href=${api.compliance.documentUrl(rec.id, d.id)} download=${d.name}>
      <div class="notif__ico" style="width:30px;height:30px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="file" size=14 /></div>
      <div style="flex:1;min-width:0">
        <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
        <div class="tiny muted">${KIND[d.kind] || d.kind} · ${Math.max(1, Math.round((d.size || 0) / 1024))} KB · ${d.uploadedBy ? d.uploadedBy.name : ""} · ${fmt.date(d.uploadedAt)}</div>
      </div>
      <${Icon} name="download" size=15 />
    </a>`)}
  </${Section}>`;
}

/* ------------------------------------------------------------ Drive filing */

function DriveBlock({ rec, config }) {
  const d = rec.drive || {};
  const cfg = (config.integrations && config.integrations.drivePortalUpload) || {};
  return html`<${Section} title="Drive filing" icon="folder" bodyClass="col">
    <${FieldGrid} rows=${[
      ["Filing status", { NOT_FILED: "Not filed", PENDING_UPLOAD: "Pending upload", FILED: "Filed", UPLOAD_FAILED: "Upload failed" }[d.status] || "Not filed"],
      ["Drive folder", dash(d.folderPath)],
      ["Drive file id", dash(d.fileId)],
      ["Recorded by", d.by ? d.by.name : "—"],
      ["Recorded at", d.at ? fmt.date(d.at) : "—"],
      ["Note", dash(d.note)],
    ]} />
    <div class="tiny muted" style="padding-top:6px">${cfg.reason || "LegalOS holds a read-only Drive credential, so filing is recorded here and performed in Drive by a person."}</div>
  </${Section}>`;
}

/* ---------------------------------------------------------------- audit */

function AuditBlock({ rec }) {
  const audit = rec.audit || [];
  return html`<${Section} title=${"Audit trail (" + audit.length + ")"} icon="activity" bodyClass="col">
    ${audit.length === 0 && html`<div class="tiny muted">No audit events.</div>`}
    ${audit.slice().reverse().map((a) => html`<div key=${a.id} class="feed__item" style="align-items:flex-start">
      <div class="notif__ico" style="width:26px;height:26px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name="dot" size=12 /></div>
      <div style="flex:1;min-width:0">
        <div class="tiny strong">${a.action}</div>
        <div class="tiny muted">${a.actor ? a.actor.name : "unknown"} · ${fmt.date(a.at)}</div>
        ${(a.before || a.after) && html`<div class="tiny muted" style="word-break:break-word">
          ${a.before ? "before: " + summarise(a.before) + "  " : ""}${a.after ? "after: " + summarise(a.after) : ""}</div>`}
      </div>
    </div>`)}
  </${Section}>`;
}

const summarise = (o) => {
  try {
    const s = JSON.stringify(o);
    return s.length > 160 ? s.slice(0, 160) + "…" : s;
  } catch (e) { return ""; }
};

/* ==================================================== document generation */

export function GenerateModal({ rec, onClose, onDone }) {
  const [tpl, setTpl] = useState(null);
  const [list, setList] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.compliance.templates(rec.type, rec.subtype).then(setList, () => setList({ suggested: [], all: [], total: 0 }));
  }, [rec.type, rec.subtype]);

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.generate(rec.id, { templateId: tpl || null });
      toast("Draft generated.", "success");
      onDone(r);
    } catch (e) { toast(e.message || "The document could not be generated.", "error"); }
    finally { setBusy(false); }
  };

  const options = list ? (showAll ? list.all : list.suggested) : [];
  return html`<${Modal} title="Generate document" icon="file" width=${620} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="file" disabled=${busy || !list} onClick=${go}>Generate draft</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${!list && html`<div class="tiny muted">Reading the approved template library…</div>`}
      ${list && html`<div class="col" style="gap:10px">
        <${Field} label="Approved template"
          hint=${"From the approved library (" + list.total + " documents you can access). The template governs the clause language; LegalOS does not rewrite it."}>
          <${Select} value=${tpl || ""} onChange=${setTpl} placeholder="— No template selected —"
            options=${options.map((t) => ({ value: t.id, label: t.category + " · " + t.name }))} />
        </${Field}>
        ${!showAll && list.suggested.length > 0 && html`<button type="button" class="linkbtn tiny" onClick=${() => setShowAll(true)}>
          Showing ${list.suggested.length} templates suggested for this action — show all ${list.total}</button>`}
        ${!showAll && list.suggested.length === 0 && html`<div class="tiny" style="color:var(--warning-text)">
          No approved template matches this action type.
          <button type="button" class="linkbtn tiny" onClick=${() => setShowAll(true)}>Browse all ${list.total}</button>
          — or generate without one.</div>`}
      </div>`}
      <${AICard} title="What gets generated">
        A draft in Word format carrying this record's real parties, dates and terms, the revised terms entered
        for this action, and an explicit before/after of what changes. It cites the approved template above
        rather than reproducing its wording, and it is attached to this action as a document.
      </${AICard}>
    </div>
  </${Modal}>`;
}

/* ====================================================== signature request */

export function SignatureModal({ rec, config, onClose, onDone }) {
  const esign = (config.integrations && config.integrations.esign) || {};
  const [method, setMethod] = useState("wet");
  const [busy, setBusy] = useState(false);
  const sigs = rec.signatories || [];

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.requestSignature(rec.id, method);
      toast(method === "wet" ? "Marked as sent for wet signature." : "Signature requested.", "success");
      onDone(r);
    } catch (e) { toast(e.message || "The signature request failed.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="Send for signature" icon="edit" width=${560} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="send" disabled=${busy || !sigs.length || (method === "esign" && !esign.configured)}
        onClick=${go}>Send for signature</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${!sigs.length && html`<div class="tiny" style="color:var(--warning-text)">Add at least one signatory first.</div>`}
      <${Field} label="Signature method">
        <div class="col" style="gap:8px">
          <label class="row" style="gap:8px;align-items:center;cursor:pointer">
            <input type="radio" name="sigmethod" checked=${method === "wet"} onChange=${() => setMethod("wet")} />
            <span class="tiny"><strong>Wet / ink signature</strong> — circulate for physical signing, then upload the scanned executed copy.</span>
          </label>
          <label class="row" style="gap:8px;align-items:center;cursor:${esign.configured ? "pointer" : "not-allowed"}">
            <input type="radio" name="sigmethod" checked=${method === "esign"} disabled=${!esign.configured} onChange=${() => setMethod("esign")} />
            <span class="tiny"><strong>E-signature</strong>
              ${esign.configured
                ? html` — ${esign.provider}`
                : html` — <span style="color:var(--warning-text)">${esign.label || "E-signature integration not configured"}</span>`}</span>
          </label>
        </div>
      </${Field}>
      ${method === "esign" && !esign.configured && html`<div class="tiny muted">
        No e-signature provider is configured, so nothing would be sent. Use wet signature, or ask an
        administrator to configure a provider. The rest of this workflow is unaffected.</div>`}
      <div class="tiny muted">${sigs.length} signator${sigs.length === 1 ? "y" : "ies"} will be marked pending.</div>
    </div>
  </${Modal}>`;
}

/* ============================================================ file upload */

export function UploadModal({ rec, kind = "supporting", onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const go = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const buf = await file.arrayBuffer();
      // Chunked so a large file does not blow the argument limit of
      // String.fromCharCode when converting to base64.
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      const r = await api.compliance.attach(rec.id, {
        kind, name: file.name, mimeType: file.type || "application/pdf", contentBase64: btoa(bin),
      });
      toast("Document attached.", "success");
      onDone(r);
    } catch (e) { setErr(e.message || "The upload failed."); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title=${kind === "executed" ? "Upload signed copy" : "Attach document"} icon="upload" width=${520} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="upload" disabled=${busy || !file} onClick=${go}>Upload</${Btn}>`}>
    <div class="col" style="gap:12px">
      <${Field} label="File" hint="PDF, Word or image, up to 25 MB.">
        <input class="input" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange=${(e) => setFile(e.target.files && e.target.files[0])} />
      </${Field}>
      ${kind === "executed" && html`<div class="tiny muted">
        This becomes the record's executed document. The generated draft is kept — nothing is replaced.</div>`}
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
    </div>
  </${Modal}>`;
}

/* ========================================================= Drive filing */

export function DriveFilingModal({ rec, onClose, onDone }) {
  const [status, setStatus] = useState("FILED");
  const [folderPath, setFolderPath] = useState(rec.drive && rec.drive.folderPath || suggestedFolder(rec));
  const [fileId, setFileId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.driveFiling(rec.id, { status, folderPath, fileId, note });
      toast("Drive filing recorded.", "success");
      onDone(r);
    } catch (e) { toast(e.message || "That could not be recorded.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="Record Drive filing" icon="folder" width=${580} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${go}>Record</${Btn}>`}>
    <div class="col" style="gap:12px">
      <div class="tiny muted">LegalOS holds a <strong>read-only</strong> Drive credential by design, so it cannot upload and
        does not pretend to. File the executed document in Drive, then record here where it went — who
        recorded it and when becomes part of the audit trail.</div>
      <${Field} label="Filing status">
        <${Select} value=${status} onChange=${setStatus} options=${[
          { value: "FILED", label: "Filed in Drive" },
          { value: "PENDING_UPLOAD", label: "Pending upload" },
          { value: "UPLOAD_FAILED", label: "Upload failed" },
          { value: "NOT_FILED", label: "Not filed" },
        ]} />
      </${Field}>
      <${Field} label="Drive folder path" hint="The existing folder this belongs in. LegalOS does not restructure Drive.">
        <${Input} value=${folderPath} onInput=${(e) => setFolderPath(e.target.value)} />
      </${Field}>
      <${Field} label="Drive file id" hint="Optional — lets the link be verified later.">
        <${Input} value=${fileId} onInput=${(e) => setFileId(e.target.value)} />
      </${Field}>
      <${Field} label="Note"><${Textarea} rows=${2} value=${note} onInput=${(e) => setNote(e.target.value)} /></${Field}>
    </div>
  </${Modal}>`;
}

// The folder a document belongs in, based on the parent's own Drive location.
// Suggested only -- the person confirms it, because LegalOS must adapt to the
// existing hierarchy rather than assert one.
function suggestedFolder(rec) {
  if (rec.parent && rec.parent.driveFolder) return rec.parent.driveFolder;
  if (rec.type === "resolution" && rec.entity) return "Compliance Data _LegalOS / Resolutions / " + rec.entity;
  if (rec.type === "loanAction") return "Compliance Data _LegalOS / Zameen Group_Loan Agreements";
  if (rec.type === "licenceApplication") return "Compliance Data _LegalOS / Licenses & Approvals _ Pakistan Entities";
  return "";
}

/* ================================================== unified timeline view */

// One chronology per record, with each entry showing WHERE it came from: a
// spreadsheet row, a Drive document, or an action taken in LegalOS. Blending
// them without saying which is which is how a document gets mistaken for a term.
export function UnifiedTimeline({ items, onOpenRecord, onOpenDoc }) {
  if (!items || !items.length) return html`<${Empty} icon="activity" title="No history recorded" text="Nothing in the source or in LegalOS dates this record yet." />`;
  const ORIGIN = {
    source: { label: "Tracker", tone: "gray" },
    drive: { label: "Drive", tone: "amber" },
    legalos: { label: "LegalOS", tone: "indigo" },
  };
  return html`<div class="col" style="gap:0">
    ${items.map((e, i) => {
      const o = ORIGIN[e.origin] || ORIGIN.source;
      const clickable = e.recordId || (e.driveFile || e.file);
      const open = () => {
        if (e.recordId && onOpenRecord) return onOpenRecord(e.recordId);
        if ((e.driveFile || e.file) && onOpenDoc) return onOpenDoc(e.driveFile || e.file);
      };
      const inner = html`<div class="row" style="gap:10px;align-items:flex-start;width:100%">
        <div class="tiny muted" style="width:92px;flex:none;padding-top:2px">${e.date ? fmt.dateShort(e.date) : "date unknown"}</div>
        <div style="flex:1;min-width:0">
          <div class="tiny strong">${e.label}</div>
          ${e.note && html`<div class="tiny muted" style="word-break:break-word">${e.note}</div>`}
          ${(e.driveFile || e.file) && html`<div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${(e.driveFile || e.file).name}</div>`}
          ${e.amount != null && html`<div class="tiny">${(e.currency ? e.currency + " " : "") + Number(e.amount).toLocaleString()}</div>`}
          ${e.repaymentDue && html`<div class="tiny muted">repayment due ${fmt.dateShort(e.repaymentDue)}</div>`}
        </div>
        ${e.quality === "INCOMPLETE_SOURCE" && html`<${Pill} tone="amber" title="The source does not state a date for this document">Undated</${Pill}>`}
        <${Pill} tone=${o.tone}>${o.label}</${Pill}>
      </div>`;
      return clickable
        ? html`<button key=${i} type="button" class="feed__item clickable" style="text-align:left;width:100%" onClick=${open}>${inner}</button>`
        : html`<div key=${i} class="feed__item">${inner}</div>`;
    })}
  </div>`;
}
