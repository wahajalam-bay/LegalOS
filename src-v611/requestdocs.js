// DOCUMENTS ON A LEGAL REQUEST.
//
// A requester attaching a contract to their request is how most legal work
// actually starts. Attachments used to be metadata only -- a name and a size --
// so the request arrived in triage naming a file nobody could open. The bytes
// are now stored on the LegalOS server and read back through this component, by
// the requester who raised it and by whoever in Legal is working it.
//
// The file is never written to Google Drive. Drive is the system of record for
// documents Legal already holds; an intake attachment is evidence on a request,
// and stays here until Legal decides what it is.
import { html, useState, useEffect, fmt, Fragment } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Empty } from "./ui.js";
import { api } from "./api.js";

const MAX_MB = 25;
const KIND = {
  "application/pdf": "PDF",
  "image/png": "Image", "image/jpeg": "Image", "image/gif": "Image", "image/webp": "Image",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-powerpoint": "Slides",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "Slides",
  "text/plain": "Text", "text/csv": "CSV",
};
const sizeText = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

/* Read the file in the browser and send it as base64. The server checks the
   type and the size again -- what the browser says about a file is a claim,
   not a fact. */
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("The file could not be read."));
    fr.onload = () => {
      const s = String(fr.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.readAsDataURL(file);
  });
}

export function RequestDocuments({ request, canAttach = true, onChanged, title = "Documents" }) {
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  /* THE SERVER SAYS WHAT IS ON THIS REQUEST.
     This read the browser's own copy of the request, which can be stale: it
     went on drawing attachment rows after the server no longer had them, so
     Preview opened and answered not_found. The list is fetched here, and
     re-fetched after every upload, removal and recovery. */
  const [atts, setAtts] = useState(null);
  const [nonce, setNonce] = useState(0);
  const reqId = request && request.id;
  useEffect(() => {
    if (!reqId) { setAtts([]); return undefined; }
    let live = true;
    api.requests.attachments(reqId).then(
      (d) => { if (live) setAtts((d && d.attachments) || []); },
      () => { if (live) setAtts([]); });
    return () => { live = false; };
  }, [reqId, nonce]);
  const refresh = () => { setNonce((n) => n + 1); onChanged && onChanged(); };

  const onPick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setErr("");
    for (const f of files) {
      if (f.size > MAX_MB * 1024 * 1024) { setErr(`"${f.name}" is larger than ${MAX_MB} MB.`); continue; }
      try {
        const dataBase64 = await readAsBase64(f);
        await api.requests.attach(request.id, { name: f.name, mime: f.type, dataBase64 });
      } catch (x) {
        setErr((x && x.message) || `"${f.name}" could not be attached.`);
      }
    }
    setBusy(false);
    refresh();
  };

  const urlFor = (a) => api.requests.attachmentUrl(request.id, a.id);

  /* RESTORE THE FILE IN PLACE. The row keeps its id and its place on the
     request, so nothing that referenced it breaks and no approval is lost --
     the only thing that changes is that the document can now be opened. */
  const onRecover = async (att, file) => {
    if (!file) return;
    setRecovering(att.id); setErr("");
    try {
      const dataBase64 = await readAsBase64(file);
      await api.requests.replaceAttachment(request.id, att.id, { name: file.name, mime: file.type, dataBase64 });
    } catch (x) {
      setErr((x && (x.payload && x.payload.error)) || (x && x.message) || `"${file.name}" could not be uploaded.`);
    }
    setRecovering("");
    refresh();
  };

  return html`<div class="col" style="gap:10px">
    <div class="row" style="align-items:center;gap:8px">
      <div class="tiny strong">${title}${atts && atts.length ? ` (${atts.length})` : ""}</div>
      <div class="spacer"></div>
      ${canAttach && html`<label class="btn btn--ghost btn--sm" style="cursor:pointer">
        <${Icon} name="paperclip" size=14 /> ${busy ? "Attaching…" : "Attach document"}
        <input type="file" multiple style="display:none" onChange=${onPick} disabled=${busy}
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" />
      </label>`}
    </div>

    ${err && html`<div class="tiny" style="color:var(--danger)">${err}</div>`}

    ${atts === null
      ? html`<div class="tiny muted" style="padding:6px 2px">Loading documents…</div>`
      : atts.length === 0
      ? html`<${Empty} icon="paperclip" title="No documents attached"
          text=${canAttach
            ? "Attach the contract, correspondence or supporting paper and Legal will see it with the request."
            : "Nothing has been attached to this request."} />`
      : html`<div class="col" style="gap:0">
          ${atts.map((a) => html`<div key=${a.id} class="feed__item" style="align-items:center;gap:10px">
            <${Icon} name="fileText" size=15 />
            <div style="flex:1;min-width:0">
              <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</div>
              ${a.onFile === false && html`<div class="tiny" style="color:var(--danger-text);white-space:normal">
                This attachment was recorded previously, but the original file was not stored.
                Re-upload the document to make it available to approvers and Legal.</div>`}
              <div class="tiny muted">
                ${KIND[a.mime] || "Document"} · ${sizeText(a.size || 0)}
                ${a.uploadedByName || a.uploadedBy ? " · " + (a.uploadedByName || a.uploadedBy) : ""}
                ${a.uploadedAt ? " · " + fmt.date(String(a.uploadedAt).slice(0, 10)) : ""}
              </div>
            </div>
            ${/* "ON FILE" ONLY WHERE THE BYTES COME BACK.
                  Attachments seeded before uploads were durable carry a name, a
                  size and nothing to serve. Shown as normal rows they gave a
                  Preview that 404s and a Download the browser reports as "file
                  wasn't available on site". The row is kept -- that a document
                  was attached is part of the request -- and it says what is
                  actually wrong, with the way to put it right. */ ""}
            ${a.onFile === false
              ? html`<${Fragment}>
                  <${Pill} tone="red">File unavailable</${Pill}>
                  ${canAttach && html`<label class="btn btn--ghost btn--sm" style="cursor:pointer">
                    <${Icon} name="refresh" size=13 /> ${recovering === a.id ? "Uploading…" : "Re-upload file"}
                    <input type="file" style="display:none" disabled=${!!recovering}
                      onChange=${(e) => onRecover(a, e.target.files && e.target.files[0])}
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" />
                  </label>`}
                </${Fragment}>`
              : html`<${Fragment}>
                  <${Pill} tone="gray" title="Held by LegalOS — not written to Google Drive">On file</${Pill}>
                  <button type="button" class="iconbtn" title="Preview in LegalOS"
                    onClick=${() => setPreview(a)}><${Icon} name="eye" size=15 /></button>
                  <a class="iconbtn" href=${urlFor(a)} download=${a.name} title="Download"><${Icon} name="download" size=15 /></a>
                </${Fragment}>`}
          </div>`)}
        </div>`}

    ${preview && html`<div class="sheet" onClick=${() => setPreview(null)}>
      <div class="sheet__panel" onClick=${(e) => e.stopPropagation()}>
        <div class="sheet__bar">
          <span class="tiny strong">${preview.name}</span>
          <div class="spacer"></div>
          <a class="btn btn--ghost btn--sm" href=${urlFor(preview)} download=${preview.name}>Download</a>
          <button class="iconbtn" onClick=${() => setPreview(null)} title="Close"><${Icon} name="x" size=18 /></button>
        </div>
        <div class="sheet__body" style="padding:0">
          ${/* EVERYTHING OPENS HERE. An image is shown, a PDF is framed, and
                every Office format is converted on the server and read in place
                -- pictures inside the document included. Nobody is sent away to
                download a file in order to find out what it says. */ ""}
          ${/^image\//.test(preview.mime)
            ? html`<img src=${urlFor(preview)} alt=${preview.name} style="max-width:100%;display:block;margin:0 auto" />`
            : /pdf/.test(preview.mime)
              ? html`<iframe src=${urlFor(preview)} title=${preview.name}
                  style="width:100%;height:78vh;border:0"></iframe>`
              : html`<iframe src=${api.requests.attachmentRenderUrl(request.id, preview.id)}
                  title=${preview.name} sandbox="allow-same-origin"
                  style="width:100%;height:78vh;border:0;background:#fff"></iframe>`}
        </div>
      </div>
    </div>`}
  </div>`;
}
