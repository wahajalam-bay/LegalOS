// DELETING A RECORD IS A REQUEST, DECIDED BY THE HEAD OF ITS TEAM.
//
// Nothing leaves a register because one person decided it should. Pressing
// Delete here does not delete: it asks, with a reason, and the record stays
// exactly where it was -- marked, so nobody works on something on its way out
// -- until the head of the team that owns the module approves.
//
// TWO RULES, both about what the record IS:
//
//   Only a record raised HERE can be deleted. A row that came out of a Drive
//   workbook is the workbook's; LegalOS reads it and must not pretend to remove
//   it, because the next read would bring it straight back.
//
//   A reason is required to ASK, and the head can refuse. Who created it is
//   kept either way -- nothing here erases authorship.
//
// The server decides who may approve (api/deletion-approvals.js); this screen
// only ever asks.
import { html, useState, useEffect, Fragment } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Modal, Field } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";

const NOUN = {
  ip: "IP matter",
  developerDisputes: "dispute",
  notices: "legal notice",
  cases: "case",
  police: "police complaint",
  inspections: "authority visit",
};

export function RequestDeletion({ moduleKey, id, name, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const noun = NOUN[moduleKey] || "record";
  const go = async () => {
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setBusy(true); setErr("");
    try {
      await api.litigation.requestDeletion(moduleKey, id, name || id, reason.trim());
      toast("Sent for approval. Nothing is removed until the head approves.", "success");
      onDone();
    } catch (e) {
      setErr((e.payload && e.payload.errors && e.payload.errors.join(" · "))
        || (e.payload && e.payload.detail) || e.message || "It could not be sent.");
      setBusy(false);
    }
  };
  return html`<${Modal} title=${"Request deletion of this " + noun} icon="alertTriangle" width=${620} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${go}>${busy ? "Sending…" : "Send for approval"}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-bottom:10px">
      <div class="tiny strong">${err}</div></div>`}
    <div class="tiny" style="line-height:1.7;padding-bottom:10px">
      <strong>${name || id}</strong> stays on the register until the head of this team approves.
      They see your reason and can refuse. If they approve, the record leaves the active register and
      nothing is destroyed: the record, who raised it, who asked for it to go and why all stay on file.
      The Drive tracker is not touched.
    </div>
    <${Field} label="Reason *" hint="Why this should be removed. The head reads this, and it stays on the record.">
      <textarea class="input" rows="3" value=${reason}
        onInput=${(e) => setReason(e.target.value)}
        placeholder="e.g. Raised in error — duplicate"></textarea>
    </${Field}>
  </${Modal}>`;
}

/* The provenance line and the action that goes with it. Rendered only for a
   record LegalOS owns, so a tracker row shows where it came from and no action.
   If a deletion is already waiting on a decision, it says so instead of
   offering to ask again. */
export function ModuleRecordOrigin({ moduleKey, record, label, onRequested }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [nonce, setNonce] = useState(0);
  const isNative = !!(record && record.origin === "LEGALOS");
  const rid = record && record.id;
  useEffect(() => {
    if (!isNative || !rid) return;
    let live = true;
    api.litigation.deletions("?status=Pending&module=" + encodeURIComponent(moduleKey))
      .then((d) => { if (live) setPending((d.requests || []).find((r) => r.recordId === rid) || null); },
        () => { if (live) setPending(null); });
    return () => { live = false; };
  }, [isNative, rid, moduleKey, nonce]);

  if (!isNative) return null;
  const by = record.createdBy && (record.createdBy.name || record.createdBy.email);
  return html`<${Fragment}>
    ${open && html`<${RequestDeletion} moduleKey=${moduleKey} id=${record.id} name=${label}
      onClose=${() => setOpen(false)}
      ${/* Asking is not going. The record is still here, so the page stays
            here too and simply re-reads whether a decision is pending. */ ""}
      onDone=${() => { setOpen(false); setNonce((n) => n + 1); onRequested && onRequested(); }} />`}
    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
      <span class="tiny muted">Raised in LegalOS${by ? " by " + by : ""}. Not in the tracker.</span>
      <div class="spacer"></div>
      ${pending
    ? html`<${Pill} tone="amber" dot=${true}>Deletion awaiting the head's approval</${Pill}>`
    : html`<button type="button" class="linkbtn tiny" style="background:none;border:0;cursor:pointer;color:var(--danger)"
        onClick=${() => setOpen(true)}><${Icon} name="x" size=13 /> Request deletion</button>`}
    </div>
  </${Fragment}>`;
}
