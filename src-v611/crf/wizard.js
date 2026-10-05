// THE CONTRACT REQUEST WIZARD.
//
// Seven steps, drawn from the schema the server serves. Nothing about any of
// the nine request types is written here: the sections, the fields, which are
// required, what is conditional and which documents are mandatory all arrive
// as data, which is why a lease and a joint venture are the same component.
//
// AUTOSAVE is per section and immediate. A commercial request is half an hour
// of somebody's afternoon, and the old failure -- typing into a form that was
// never persisted -- is the one thing this must not do. The state of the save
// is always on screen: Saving…, Saved, or Save failed with the reason.
import { html, cx, fmt, useState, useEffect, useRef, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Modal, Field, Input } from "../ui.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { CrfField, CrfGrid } from "./fields.js";
import { visibleFields, isBlank } from "./rules.js";

const STEP_LABELS = ["Request", "Parties", "Commercial Terms", "Legal Terms", "Attachments", "Special Terms", "Review"];

/* ------------------------------------------------------------- autosave -- */

function useAutosave(requestId, editable) {
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const queue = useRef({});
  const timer = useRef(null);
  const flush = async () => {
    const pending = queue.current; queue.current = {};
    const keys = Object.keys(pending);
    if (!keys.length) return;
    setSaveState("saving"); setError("");
    try {
      for (const k of keys) await api.crf.patch(requestId, k, pending[k]);
      setSaveState("saved");
    } catch (e) {
      setSaveState("failed");
      setError((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message || "the change was not saved");
    }
  };
  const save = (section, value) => {
    if (!editable) return;
    queue.current[section] = value;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  /* A change still in the queue when the page goes away is written now. */
  useEffect(() => {
    const go = () => { if (Object.keys(queue.current).length) flush(); };
    window.addEventListener("pagehide", go);
    return () => { window.removeEventListener("pagehide", go); go(); };
  }, [requestId]);
  return { save, saveState, error, flushNow: flush };
}

function SaveBadge({ state, error }) {
  if (state === "saving") return html`<span class="crf__save"><${Icon} name="refresh" size=12 /> Saving…</span>`;
  if (state === "saved") return html`<span class="crf__save crf__save--ok"><${Icon} name="check" size=12 /> Saved</span>`;
  if (state === "failed") return html`<span class="crf__save crf__save--bad" role="alert">
    <${Icon} name="alertTriangle" size=12 /> Save failed — ${error || "try again"}</span>`;
  return null;
}

/* ---------------------------------------------------------- attachments -- */

function Attachments({ req, docs, assessment, editable, onChanged }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const pending = useRef(null);

  const pick = (docType, replacesId) => {
    pending.current = { docType, replacesId };
    if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); }
  };
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const { docType, replacesId } = pending.current || {};
    setBusy(docType || file.name); setErr("");
    try {
      await api.crf.uploadDocument(req.id, file, { docType, replacesId });
      toast(file.name + " attached", "success");
      onChanged();
    } catch (ex) {
      setErr((ex.payload && ex.payload.errors && ex.payload.errors.join(" · ")) || ex.message || "the upload failed");
    }
    setBusy("");
  };

  const byType = (t) => docs.filter((d) => (d.docType || "Other Attachment") === t);
  const others = docs.filter((d) => !(assessment.attachments || []).some((a) => a.docType === d.docType));

  return html`<div class="col" style="gap:14px">
    <input ref=${fileRef} type="file" style="display:none" onChange=${onFile} aria-hidden="true" tabIndex=${-1} />
    ${err && html`<div class="crf__err" role="alert">${err}</div>`}
    <div class="tiny muted">These documents travel with this request and are visible to the
      authorised approvers and Legal users handling it. You do not upload them again at any stage.</div>

    <div class="card card--pad col" style="gap:10px">
      <div class="row"><span class="strong">Mandatory documents</span><div class="spacer"></div>
        <${Pill} tone=${(assessment.attachments || []).every((a) => a.uploaded) ? "green" : "amber"}>
          ${(assessment.attachments || []).filter((a) => a.uploaded).length} / ${(assessment.attachments || []).length} complete
        </${Pill}></div>
      ${(assessment.attachments || []).map((a) => {
    const mine = byType(a.docType);
    return html`<div key=${a.docType} class="crfdoc">
      <${Icon} name=${a.uploaded ? "checkcircle" : "alertCircle"} size=15
        style=${{ color: a.uploaded ? "var(--success)" : "var(--danger)", flex: "none" }} />
      <div style="flex:1;min-width:0">
        <div class="tiny strong">${a.docType}</div>
        ${mine.length
    ? mine.map((d) => html`<${DocRow} key=${d.id} d=${d} editable=${editable}
            onReplace=${() => pick(a.docType, d.id)} onRemoved=${onChanged} reqId=${req.id} />`)
    : html`<div class="tiny muted">Missing</div>`}
      </div>
      ${editable && html`<${Btn} size="sm" variant="ghost" icon="plus" disabled=${busy === a.docType}
        onClick=${() => pick(a.docType, null)}>${busy === a.docType ? "Uploading…" : "Attach"}</${Btn}>`}
    </div>`;
  })}
    </div>

    <div class="card card--pad col" style="gap:10px">
      <div class="row"><span class="strong">Other documents</span><div class="spacer"></div>
        ${editable && html`<${Btn} size="sm" variant="ghost" icon="plus"
          onClick=${() => pick("Other Attachment", null)}>Add document</${Btn}>`}</div>
      ${others.length === 0 && html`<div class="tiny muted">Nothing else attached.</div>`}
      ${others.map((d) => html`<${DocRow} key=${d.id} d=${d} editable=${editable}
        onReplace=${() => pick(d.docType, d.id)} onRemoved=${onChanged} reqId=${req.id} full=${true} />`)}
    </div>
  </div>`;
}

/* One document. "On file" is shown only where the server confirmed the bytes
   come back -- a row that cannot be served says so instead of claiming to be
   fine and failing when somebody clicks it. */
export function DocRow({ d, editable, onReplace, onRemoved, reqId, full }) {
  const [viewing, setViewing] = useState(false);
  const remove = async () => {
    try { await api.crf.removeDocument(reqId, d.id); toast("Removed"); onRemoved(); }
    catch (e) { toast((e.payload && e.payload.detail) || e.message, "error"); }
  };
  return html`<${Fragment}>
    ${viewing && html`<${DocViewer} d=${d} onClose=${() => setViewing(false)} />`}
    <div class="crfdoc__row">
      <${Icon} name="file" size=13 style=${{ color: "var(--text-3)", flex: "none" }} />
      <span class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</span>
      ${d.version > 1 && html`<${Pill} tone="gray">v${d.version}</${Pill}>`}
      ${d.onFile
    ? html`<${Pill} tone="green">On file</${Pill}>`
    : html`<${Pill} tone="red">File unavailable — needs re-upload</${Pill}>`}
      <div class="spacer"></div>
      ${full && html`<span class="tiny muted" style="white-space:nowrap">
        ${(d.uploadedBy && d.uploadedBy.name) || "—"}${d.uploadedAt ? " · " + fmt.date(d.uploadedAt) : ""}</span>`}
      ${d.onFile && html`<${Fragment}>
        <button type="button" class="linkbtn tiny" onClick=${() => setViewing(true)}>Preview</button>
        <a class="linkbtn tiny" href=${api.crf.docUrl(d.id, "download")} download=${d.name}>Download</a>
      </${Fragment}>`}
      ${/* Replace only where there is something to replace it with. Rendering
            the control without a handler would be a button that does nothing. */ ""}
      ${editable && onReplace && html`<${Fragment}>
        <button type="button" class="linkbtn tiny" onClick=${onReplace}>Replace</button>
        <button type="button" class="linkbtn tiny" style="color:var(--danger)" onClick=${remove}>Remove</button>
      </${Fragment}>`}
    </div>
  </${Fragment}>`;
}

/* Rendered in-app. The endpoint is same-origin and cookie-authenticated, so
   the browser carries the session and nobody is asked to sign in again. */
export function DocViewer({ d, onClose }) {
  const src = api.crf.docUrl(d.id, "preview");
  /* EVERYTHING OPENS HERE — image, PDF, Word, Excel, PowerPoint, text, and the
     pictures inside a Word file. Anything the server genuinely cannot convert
     comes back as a page saying so with Download still working, so there is no
     format that simply refuses to be looked at. */
  const body = /pdf/.test(d.mimeType)
    ? html`<iframe class="crfview" src=${src} title=${d.name}></iframe>`
    : /^image\//.test(d.mimeType)
      ? html`<img class="crfview" src=${src} alt=${d.name} style="object-fit:contain" />`
      : html`<iframe class="crfview" src=${api.crf.docUrl(d.id, "render")} title=${d.name}
          sandbox="allow-same-origin"></iframe>`;

  return html`<${Modal} title=${d.name} icon="file" width=${980} onClose=${onClose}
    footer=${html`<${Fragment}>
      <span class="tiny muted">${d.mimeType} · ${Math.max(1, Math.round((d.size || 0) / 1024))} KB
        ${d.version > 1 ? " · version " + d.version : ""}</span>
      <div class="spacer"></div>
      <a class="btn btn--ghost btn--sm" href=${api.crf.docUrl(d.id, "download")} download=${d.name}>Download</a>
      <${Btn} onClick=${onClose}>Close</${Btn}>
    </${Fragment}>`}>
    ${body}
  </${Modal}>`;
}

export { useAutosave, SaveBadge, Attachments, STEP_LABELS };
