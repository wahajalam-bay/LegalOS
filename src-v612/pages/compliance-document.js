// One document, at its own address.
//
// A docs count, a document chip, a piece of SECP evidence and a timeline entry
// all lead here: /compliance/document/<fileId>. Before this, the only way to see
// a compliance document was a new browser tab pointed at Google Drive, which
// leaves the application entirely, carries no record context, and tells a
// permission-scoped user nothing about WHY they can see this file.
//
// The preview is the same in-app renderer the contracts workspace uses — PDF and
// Google files in a frame, images inline, .docx through mammoth, .xlsx through
// SheetJS — reused rather than reimplemented, so there is one document-rendering
// behaviour in this product and not two that drift.
//
// Where the source exposes no renderable bytes, this page says so and offers the
// Drive original. It never draws a placeholder that looks like a document.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Section, Pill, Empty } from "../ui.js";
import { PageHead } from "../parts.js";
import { RegisterTabs } from "../register.js";
import { navigate } from "../router.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { useComplianceDocument } from "../compliancedata.js";
import { usePublishCrumbLeaf } from "../compliancenav.js";
import { FieldGrid } from "../complianceui.js";
import { DocxView, XlsxView } from "./contracts.js";

const dash = (v) => (v == null || v === "" ? "—" : v);
const bytes = (n) => (n == null ? "—" : n < 1024 ? n + " B"
  : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB");

const kindOf = (mt, name) => {
  const m = (mt || "") + " " + (name || "");
  if (/pdf/i.test(m)) return "PDF";
  if (/wordprocessingml|msword|\.docx?\b/i.test(m)) return "Word document";
  if (/spreadsheetml|ms-excel|\.xlsx?\b/i.test(m)) return "Spreadsheet";
  if (/^image|\.(png|jpe?g|jfif|gif|webp)\b/i.test(m)) return "Image";
  if (/presentation|\.pptx?\b/i.test(m)) return "Presentation";
  if (/google-apps/i.test(m)) return "Google document";
  return "File";
};

export function ComplianceDocument({ fileId }) {
  const { data, loading, error } = useComplianceDocument(fileId);
  const [tab, setTab] = useState("preview");
  // Hoisted above the early returns: a hook that only runs once the fetch has
  // landed runs in a different order on the next render, which is React #310.
  usePublishCrumbLeaf(data && data.document && data.document.name);

  if (error) return html`<div class="page page--wide fade-in">
    <${PageHead} title="Document" />
    <${Empty} icon="alertTriangle" title="This document is not available to you"
      text=${"Either no document has this reference, or your access does not extend to it. "
        + "A document is readable when you may read a record that cites it, or the module it is filed under."}
      action=${html`<${Btn} variant="primary" onClick=${() => navigate("/compliance")}>Compliance overview</${Btn}>`} />
  </div>`;
  if (loading || !data) return html`<div class="page page--wide fade-in">
    <${PageHead} title="Document" />
    <div class="tiny muted" style="padding:20px 2px">Reading the document…</div></div>`;

  const d = data.document;
  const links = data.links || [];
  const folder = (d.folderPath || "").split(" / ");

  const copyLink = () => {
    const url = location.origin + location.pathname + "#/compliance/document/" + encodeURIComponent(d.id);
    try {
      navigator.clipboard.writeText(url);
      toast("Link to this document copied.", "success");
    } catch (e) { toast("Could not copy — the address is in the bar.", "error"); }
  };

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${d.name}
      sub=${[kindOf(d.mimeType, d.name), bytes(d.size), folder[folder.length - 1]].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft" onClick=${() => history.back()}>Back</${Btn}>
        <${Btn} variant="ghost" icon="link" onClick=${copyLink}>Copy link</${Btn}>
        <a class="btn btn--ghost" href=${api.knowledge.fileUrl(d.id)} download=${d.name}>
          <${Icon} name="download" size=16 /> Download</a>
        ${d.webViewLink && html`<a class="btn btn--ghost" href=${d.webViewLink} target="_blank" rel="noopener noreferrer">
          <${Icon} name="externalLink" size=16 /> Open in Drive</a>`}` } />

    <${RegisterTabs} ariaLabel="Document" active=${tab} onChange=${setTab}
      tabs=${[{ id: "preview", label: "Preview" }, { id: "details", label: "Details" },
    { id: "links", label: "Linked records", count: links.length }]} />

    ${tab === "preview" && html`<div class="docpage">
      <${DocPreview} d=${d} previewable=${data.previewable} />
    </div>`}

    ${tab === "details" && html`<${Section} title="Document" icon="file"
      sub="Google Drive remains the source of truth. LegalOS reads this file; it never alters it.">
      <${FieldGrid} rows=${[
        ["Filename", d.name],
        ["Type", kindOf(d.mimeType, d.name)],
        ["Media type", dash(d.mimeType)],
        ["Size", bytes(d.size)],
        ["Drive folder", dash(d.folderPath)],
        ["Drive root", dash(d.root)],
        ["Drive file id", d.id],
        ["Last modified in Drive", d.modifiedTime ? fmt.date(d.modifiedTime) : "—"],
        ["First seen in Drive", d.createdTime ? fmt.date(d.createdTime) : "—"],
      ]} />
      <div class="tiny muted" style="padding-top:10px">
        A Drive timestamp records when the FILE changed. It is not the date of the event the document
        describes, and nothing in Compliance treats it as one.
      </div>
    </${Section}>`}

    ${tab === "links" && html`<${Section} title=${"Records citing this document (" + links.length + ")"} icon="gitBranch"
      sub="Real citations only — a document that no record claims says so, rather than being attributed to whatever sits near it in Drive.">
      ${links.length === 0
        ? html`<div class="tiny muted" style="padding:4px 2px">
            No compliance record cites this file. It is readable because of the Drive folder it is
            filed under, not because a record attaches it.</div>`
        : html`<div class="col" style="gap:0">
          ${links.map((l) => html`<button key=${l.family + l.id} type="button" class="feed__item clickable"
            style="text-align:left;width:100%" disabled=${!l.prefix}
            onClick=${() => l.prefix && navigate(l.prefix + encodeURIComponent(l.id))}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <${Pill} tone="indigo">${l.label}</${Pill}>
              <span class="cell-mono tiny" style="flex:none">${l.id}</span>
              <span class="tiny" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.title}</span>
              ${l.prefix && html`<${Icon} name="chevronRight" size=14 />`}
            </div></button>`)}
        </div>`}
    </${Section}>`}
  </div>`;
}

/* The preview itself. Each branch is a real renderer; the last one is an honest
   refusal rather than a grey rectangle pretending to be a page. */
function DocPreview({ d, previewable }) {
  const mt = d.mimeType || "";
  const src = api.knowledge.fileUrl(d.id);

  if (/pdf|google-apps/.test(mt)) return html`<iframe src=${src} title=${d.name} class="docpage__frame"></iframe>`;
  if (/^image\//.test(mt)) return html`<div class="docpage__frame docpage__img">
    <img src=${src} alt=${d.name} /></div>`;
  if (/wordprocessingml|msword/.test(mt)) return html`<${DocxView} id=${d.id} name=${d.name} size=${d.size} />`;
  if (/spreadsheetml|ms-excel/.test(mt) || /\.xlsx?$/i.test(d.name || "")) {
    return html`<${XlsxView} id=${d.id} name=${d.name} size=${d.size} />`;
  }
  return html`<div class="docpage__frame docpage__none">
    <${Icon} name="file" size=30 />
    <div>No inline preview exists for ${mt || "this file type"}.</div>
    <div class="tiny muted">The file itself is intact in Drive — download it, or open the original.</div>
    <div class="row" style="gap:8px;justify-content:center">
      <a class="btn btn--primary btn--sm" href=${src} download=${d.name}>Download ${d.name}</a>
      ${d.webViewLink && html`<a class="btn btn--ghost btn--sm" href=${d.webViewLink} target="_blank" rel="noopener noreferrer">Open in Drive</a>`}
    </div>
  </div>`;
}
