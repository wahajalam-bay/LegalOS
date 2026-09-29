/* THE CONTRACT REQUEST ROUTES, and the document endpoints that serve real bytes.
 *
 * Every decision -- whether a request is complete, who may approve it, whether
 * a reader may see a document -- is taken in the engine and the document store.
 * These routes do dispatch and status codes, nothing else.
 */
const fs = require("fs");
const path = require("path");
const CR = require("./contract-requests.js");
const DOCS = require("./request-documents.js");
const S = require("./crf-schemas.js");
const DRAFT = require("./contract-draft.js");

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("the file is larger than " + Math.round(limit / 1e6) + "MB")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}


/* Rendering somebody else's document is rendering somebody else's markup, so
   the converter's output is stripped to text-level tags. No script, no style,
   no iframe, no event handler, no external reference -- and the page it is
   served in declares a CSP that forbids all of them a second time. */
const esc = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ALLOWED = /^(p|br|b|strong|i|em|u|s|sup|sub|h1|h2|h3|h4|h5|h6|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|code|hr|span|div|img)$/i;

/* THE PICTURES IN THE DOCUMENT ARE PART OF THE DOCUMENT.
   A site plan pasted into a Word file is often the only drawing anybody has, so
   stripping images would hand the reader a page of captions. Images survive --
   but ONLY as embedded data, never as a URL: a remote src is a way to phone
   home from inside somebody else's document, and the page's CSP allows
   `img-src data:` and nothing else, so anything remote would fail anyway. */
function keepImgAttrs(attrs) {
  const src = /\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs || "");
  const url = src ? (src[2] || src[3] || "") : "";
  if (!/^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(url)) return null;
  const alt = /\salt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs || "");
  const altText = alt ? esc(alt[2] || alt[3] || "") : "";
  return '<img src="' + url.replace(/"/g, "") + '" alt="' + altText + '">';
}

function sanitise(html) {
  return String(html || "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input|button)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|input)[^>]*\/?>/gi, "")
    .replace(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, tag, attrs) => {
      if (!ALLOWED.test(tag)) return "";
      if (/^img$/i.test(tag) && !m.startsWith("</")) return keepImgAttrs(attrs) || "";
      /* Every other attribute is dropped: nothing else the converter emits is
         needed to read the document, and an href or an onclick is a way in. */
      void attrs;
      return m.startsWith("</") ? "</" + tag.toLowerCase() + ">" : "<" + tag.toLowerCase() + ">";
    })
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

const code = (r) => (r.error === "not found" ? 404
  : r.error === "forbidden" ? 403
    : r.error === "locked" ? 409
      : r.error === "confirm_required" ? 409
        : r.error === "incomplete" ? 422
          : r.error ? 400 : 200);

/* Attachments on a contract request are request-documents. The engine keeps a
   light copy on the record so validation can check the checklist without
   loading the store; the bytes live in exactly one place. */
function syncAttachments(rec, viewer) {
  const docs = DOCS.list(rec.id, viewer, { kind: "contract" });
  rec.attachments = docs.map((d) => ({
    id: d.id, docType: d.attachmentRequirementType || "Other Attachment",
    name: d.originalFilename, annexure: d.annexureRef,
    size: d.size, mimeType: d.mimeType, version: d.version,
    uploadedBy: d.uploadedBy, uploadedAt: d.uploadedAt,
    onFile: DOCS.resolves(d),
  }));
  return rec;
}

/* RENDER A DOCUMENT FOR READING IN THE APP.
 *
 * Shared by contract-request documents and legacy request attachments, because
 * "preview" should mean the same thing and be exactly as safe wherever the file
 * came from. The converter's output is stripped to text-level tags and served
 * in a page that forbids script, style, frames and any external reference.
 *
 * A file that will not convert returns a page saying so -- never an error --
 * because failing the request would take Download away with the preview.
 */
async function renderDocument(res, filePath, name, mimeType) {
  const send = (html5, csp) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    });
    res.end(html5);
  };
  const shell = (bodyHtml, csp) => "<!doctype html><html><head><meta charset='utf-8'>"
    + "<meta http-equiv='Content-Security-Policy' content=\"" + csp + "\">"
    + "<title>" + esc(name) + "</title><style>"
    + "body{font:14px/1.7 -apple-system,Segoe UI,Roboto,sans-serif;color:#18211c;margin:0;padding:26px 30px;background:#fff}"
    + "h1,h2,h3{line-height:1.3}table{border-collapse:collapse;margin:10px 0;font-size:12.5px}"
    + "td,th{border:1px solid #d7e0da;padding:4px 7px;text-align:left}"
    + "img{max-width:100%}pre{white-space:pre-wrap;font:12.5px/1.6 ui-monospace,monospace}"
    + ".na{color:#6b7d72}</style></head><body>" + bodyHtml + "</body></html>";
  const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
  try {
    let bodyHtml = "";
    if (/wordprocessingml|msword/.test(mimeType) || /\.docx?$/i.test(name)) {
      const mammoth = require("mammoth");
      /* Pictures inside the document come through as embedded data, so a site
         plan or a signature block is READ here rather than described. */
      const out = await mammoth.convertToHtml({ path: filePath }, {
        convertImage: mammoth.images.imgElement((image) =>
          image.read("base64").then((buf) => ({ src: "data:" + image.contentType + ";base64," + buf }))),
      });
      bodyHtml = sanitise(out.value || "") || "<p class='na'>This document has no readable text.</p>";
    } else if (/presentationml|ms-powerpoint/.test(mimeType) || /\.pptx?$/i.test(name)) {
      /* A deck reads as its slides. The package is a zip like any other Office
         file, so the existing reader opens it and the slide text comes out in
         order -- which is what somebody approving a proposal needs. */
      const xlsx = require("./xlsx");
      const entries = xlsx.unzip(fs.readFileSync(filePath), (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
      const slides = Object.keys(entries)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => (parseInt(a.replace(/\D+/g, ""), 10) - parseInt(b.replace(/\D+/g, ""), 10)));
      bodyHtml = slides.map((k, i) => {
        const xml = entries[k].toString("utf8");
        const text = (xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [])
          .map((m2) => esc(m2.replace(/<\/?a:t>/g, ""))).filter(Boolean);
        return "<h2>Slide " + (i + 1) + "</h2>" + (text.length
          ? "<ul>" + text.map((t) => "<li>" + t + "</li>").join("") + "</ul>"
          : "<p class='na'>No text on this slide.</p>");
      }).join("") || "<p class='na'>This presentation has no readable slides.</p>";
    } else if (/spreadsheetml|ms-excel/.test(mimeType) || /\.xlsx?$/i.test(name)) {
      const xlsx = require("./xlsx");
      const wb = xlsx.readWorkbook(fs.readFileSync(filePath), { maxSheets: 12 });
      bodyHtml = (wb.sheets || []).map((sh) => {
        const body = (sh.rows || []).slice(0, 400).map((row) => "<tr>"
          + (row || []).slice(0, 40).map((c) => "<td>" + esc(c == null ? "" : String(c)) + "</td>").join("")
          + "</tr>").join("");
        return "<h2>" + esc(sh.name) + "</h2><table>" + body + "</table>";
      }).join("") || "<p class='na'>This workbook has no readable sheets.</p>";
    } else if (/^text\//.test(mimeType)) {
      bodyHtml = "<pre>" + esc(fs.readFileSync(filePath, "utf8").slice(0, 400000)) + "</pre>";
    } else {
      bodyHtml = "<p class='na'>This format cannot be shown here. Download it to open it.</p>";
    }
    return send(shell(bodyHtml, CSP), CSP);
  } catch (e) {
    const why = esc(String(e.message || e).slice(0, 160));
    const csp = "default-src 'none'; style-src 'unsafe-inline'";
    return send(shell("<div style='font-weight:700;margin-bottom:6px'>This document cannot be shown here</div>"
      + "<p class='na'>The file is stored and can be downloaded — it just could not be converted for "
      + "reading in the browser. Use Download to open it in its own application.</p>"
      + "<p class='na'>Reason: " + why + "</p>", csp), csp);
  }
}

async function handle(ctx) {
  const { req, res, route, json, readBody, me } = ctx;

  /* ---------------------------------------------------- the schema ------- */
  if (route === "contract-requests/schema" && req.method === "GET") {
    const u = new URL(req.url, "http://x");
    const type = u.searchParams.get("type");
    if (type) {
      if (!S.CRF_TYPES.some((t) => t.key === type)) return json(res, 404, { error: "unknown type" }, req);
      return json(res, 200, S.schemaFor(type), req);
    }
    return json(res, 200, { types: S.CRF_TYPES, steps: S.STEPS, statuses: S.STATUSES }, req);
  }

  /* ---------------------------------------------------- the register ----- */
  if (route === "contract-requests" && req.method === "GET") {
    const all = CR.read().requests;
    const rows = all
      .filter((r) => CR.permissionsFor(r, me).view)
      .map((r) => CR.summarise(r));
    return json(res, 200, { requests: rows, total: rows.length }, req);
  }

  if (route === "contract-requests" && req.method === "POST") {
    let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const r = CR.create((b || {}).type, me, (b || {}).department);
    return json(res, r.error ? 400 : 201, r, req);
  }

  /* ------------------------------------------- one request, and actions -- */
  const m = route.match(/^contract-requests\/([A-Za-z0-9-]+)(?:\/([a-z-]+))?(?:\/([A-Za-z0-9-]+))?$/);
  if (m) {
    const [, id, action, sub] = m;
    const rec = CR.byId(id);
    if (!rec) return json(res, 404, { error: "not found" }, req);
    const perms = CR.permissionsFor(rec, me);
    if (!perms.view) return json(res, 404, { error: "not found" }, req);   // existence hiding

    if (req.method === "GET" && !action) {
      syncAttachments(rec, me);
      const a = CR.assess(rec);
      return json(res, 200, {
        request: rec,
        schema: S.schemaFor(rec.type),
        assessment: a,
        summary: CR.summarise(rec),
        permissions: perms,
        documents: DOCS.list(rec.id, me, { kind: "contract" }).map((d) => ({
          id: d.id, name: d.originalFilename, docType: d.attachmentRequirementType || "Other Attachment",
          annexure: d.annexureRef, mimeType: d.mimeType, size: d.size, version: d.version,
          uploadedBy: d.uploadedBy, uploadedAt: d.uploadedAt, visibility: d.visibility,
          onFile: DOCS.resolves(d), previewable: DOCS.PREVIEWABLE.test(d.mimeType),
        })),
      }, req);
    }

    /* ------------------------------------------------ drafting the contract */

    /* WHICH APPROVED TEMPLATES FIT THIS REQUEST.
       The matched list is a shortcut to the likely form, not a restriction:
       the whole library is returned alongside it, because the request type is
       a good guess at the right template and never a ruling on it. */
    if (req.method === "GET" && action === "draft-templates") {
      return json(res, 200, Object.assign({ type: rec.type }, DRAFT.templatesFor(rec.type)), req);
    }

    /* WHAT WOULD BE FILLED, WITHOUT GENERATING ANYTHING.
       Shown before the draft is made, so the coverage -- and every slot the
       request cannot answer -- is visible up front rather than discovered in
       a Word document. */
    if (req.method === "GET" && action === "draft-preview") {
      const tpl = new URL(req.url, "http://x").searchParams.get("template") || "";
      if (!tpl) return json(res, 400, { error: "a template is required" }, req);
      try {
        return json(res, 200, await DRAFT.preview(rec, tpl), req);
      } catch (e) { return json(res, 400, { error: e.message }, req); }
    }

    /* GENERATE IT, and put it on the request as a document.
       The draft is stored through the same document store as everything else,
       so it is versioned, permissioned and downloadable exactly like an
       uploaded file -- and REQUEST_SHARED, because a draft the requester
       cannot see is a draft they cannot check. */
    if (req.method === "POST" && action === "draft") {
      if (!perms.edit && !perms.legalActions) {
        return json(res, 409, { error: "locked", detail: "This request cannot be drafted from at its current stage." }, req);
      }
      let b; try { b = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const tpl = String((b || {}).templateId || "");
      if (!tpl) return json(res, 400, { error: "a template is required" }, req);

      let out;
      try { out = await DRAFT.draft(rec, tpl); }
      catch (e) { return json(res, 400, { error: e.message }, req); }

      const stored = DOCS.put({
        requestId: rec.id, requestKind: "contract",
        originalFilename: out.filename,
        mimeType: out.mime,
        attachmentRequirementType: "Generated Draft",
        visibility: "REQUEST_SHARED",
      }, out.buffer, me);
      if (stored.error) return json(res, 400, stored, req);

      CR.log(rec, "Draft Generated", me,
        out.template.name + " — " + out.coverage.filled + " of " + out.coverage.slots + " fields filled");
      CR.write();

      return json(res, 201, {
        document: {
          id: stored.document.id, name: stored.document.originalFilename,
          mimeType: stored.document.mimeType, size: stored.document.size,
          version: stored.document.version,
        },
        template: out.template,
        coverage: out.coverage,
        filled: out.filled,
        unfilled: out.unfilled,
      }, req);
    }

    if (req.method === "GET" && action === "documents") {
      const withHistory = new URL(req.url, "http://x").searchParams.get("history") === "1";
      const list = withHistory ? DOCS.history(rec.id, me) : DOCS.list(rec.id, me, { kind: "contract" });
      return json(res, 200, { documents: list.map((d) => ({
        id: d.id, name: d.originalFilename, docType: d.attachmentRequirementType || "Other Attachment",
        annexure: d.annexureRef, mimeType: d.mimeType, size: d.size, version: d.version,
        replacesId: d.replacesId, supersededById: d.supersededById,
        uploadedBy: d.uploadedBy, uploadedAt: d.uploadedAt, removedAt: d.removedAt,
        onFile: DOCS.resolves(d), previewable: DOCS.PREVIEWABLE.test(d.mimeType),
      })) }, req);
    }

    /* ---------------------------------------------- document upload ------ */
    if (req.method === "POST" && action === "documents") {
      /* TWO WAYS A DOCUMENT ARRIVES, and they are not the same document.
         The requester attaches evidence while the request is theirs to edit.
         Legal attaches working papers once it has the request -- those are
         INTERNAL_LEGAL and the store refuses them to the requester, so a
         file note does not travel back to the person it is about. */
      const asInternal = String(req.headers["x-visibility"] || "") === "INTERNAL_LEGAL";
      if (asInternal && !perms.legalActions) {
        return json(res, 403, { error: "forbidden", detail: "Only Legal can add an internal document." }, req);
      }
      if (!asInternal && !perms.edit) return json(res, 409, { error: "locked", detail: "This request cannot be edited at its current stage." }, req);
      const h = req.headers;
      let buf;
      try { buf = await readRaw(req, DOCS.MAX_BYTES); }
      catch (e) { return json(res, 413, { error: e.message }, req); }
      const r = DOCS.put({
        requestId: rec.id, requestKind: "contract",
        originalFilename: decodeURIComponent(String(h["x-filename"] || "document")),
        mimeType: String(h["content-type"] || ""),
        attachmentRequirementType: decodeURIComponent(String(h["x-doc-type"] || "")) || null,
        annexureRef: decodeURIComponent(String(h["x-annexure"] || "")) || null,
        replacesId: String(h["x-replaces"] || "") || null,
        visibility: asInternal ? "INTERNAL_LEGAL" : "REQUEST_SHARED",
      }, buf, me);
      if (r.error) return json(res, r.error === "too_large" ? 413 : 400, r, req);
      CR.log(rec, r.document.replacesId ? "Document Replaced"
    : asInternal ? "Internal Document Added" : "Document Uploaded", me,
        (r.document.attachmentRequirementType || "Other Attachment") + " — " + r.document.originalFilename
          + " (v" + r.document.version + ")");
      syncAttachments(rec, me);
      CR.write();
      return json(res, 201, { document: r.document, summary: CR.summarise(rec) }, req);
    }

    if (req.method === "DELETE" && action === "documents" && sub) {
      if (!perms.edit) return json(res, 409, { error: "locked", detail: "Documents are locked with the request at this stage." }, req);
      const doc = DOCS.byId(sub);
      if (!doc || doc.requestId !== rec.id || !DOCS.canAccess(me, doc)) return json(res, 404, { error: "not found" }, req);
      const r = DOCS.remove(sub, me);
      if (r.error) return json(res, 400, r, req);
      CR.log(rec, "Document Removed", me, doc.originalFilename);
      syncAttachments(rec, me);
      CR.write();
      return json(res, 200, { ok: true, summary: CR.summarise(rec) }, req);
    }

    /* ------------------------------------------------------ mutations ---- */
    let body = {};
    if (req.method !== "GET") {
      try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    }
    let r = null;
    if (req.method === "PATCH" && !action) r = CR.patch(id, body, me);
    else if (req.method === "POST" && action === "type") r = CR.changeType(id, body, me);
    else if (req.method === "POST" && action === "submit") r = CR.submit(id, me);
    else if (req.method === "POST" && action === "hod") r = CR.hodDecide(id, body, me);
    else if (req.method === "POST" && action === "finance") r = CR.financeDecide(id, body, me);
    else if (req.method === "POST" && action === "return") r = CR.legalReturn(id, body, me);
    else if (req.method === "POST" && action === "accept") r = CR.accept(id, body, me);
    else if (req.method === "POST" && action === "target") r = CR.setTargetDate(id, body, me);
    else if (req.method === "POST" && action === "escalate") r = CR.escalate(id, body, me);
    else if (req.method === "POST" && action === "deescalate") r = CR.deescalate(id, body, me);
    else if (req.method === "POST" && action === "status") r = CR.setStatus(id, body, me);
    else if (req.method === "POST" && action === "remarks") r = CR.setRemarks(id, body, me);
    else if (req.method === "POST" && action === "messages") r = CR.addMessage(id, body, me);
    if (r) {
      if (!r.error && r.request) r.summary = CR.summarise(r.request);
      return json(res, code(r), r, req);
    }
    return json(res, 405, { error: "method_not_allowed" }, req);
  }

  /* ------------------------------------------ the document endpoints ----- */
  const dm = route.match(/^request-documents\/([A-Za-z0-9-]+)\/(preview|download|metadata|render)$/);
  if (dm && req.method === "GET") {
    const [, docId, what] = dm;
    const r = DOCS.open(docId, me);
    /* 404 and not 403: a 403 on a document id confirms the document exists. */
    if (r.error === "not found") return json(res, 404, { error: "not found" }, req);
    if (r.error === "unavailable") {
      return json(res, 410, { error: "unavailable",
        detail: "This document's file is not in storage. It has to be uploaded again." }, req);
    }
    const d = r.document;
    if (what === "metadata") {
      return json(res, 200, { document: {
        id: d.id, name: d.originalFilename, mimeType: d.mimeType, size: d.size,
        checksum: d.checksum, version: d.version, uploadedBy: d.uploadedBy,
        uploadedAt: d.uploadedAt, docType: d.attachmentRequirementType,
        annexure: d.annexureRef, sourceType: d.sourceType, onFile: true,
      } }, req);
    }
    /* READ IT IN THE APP, NOT IN WORD.
       A Word or Excel attachment is the commonest thing on a contract request,
       and making an approver download one to find out what they are approving
       is how a decision gets taken without reading the document. Both are
       converted to sanitised HTML here -- the same readers the rest of LegalOS
       uses -- and served as a self-contained page with no script of any kind. */
    if (what === "render") return renderDocument(res, r.file, d.originalFilename, d.mimeType);

    const disp = what === "download"
      ? 'attachment; filename="' + d.originalFilename.replace(/["\\]/g, "") + '"'
      : "inline";
    res.writeHead(200, {
      "content-type": d.mimeType,
      "content-length": d.size,
      "content-disposition": disp,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    return fs.createReadStream(r.file).pipe(res);
  }

  /* Which stored documents cannot be served -- Data Health, not an app screen. */
  if (route === "request-documents/reconcile" && req.method === "GET") {
    if (!DOCS.isLegalUser(me) && !me.admin) return json(res, 403, { error: "forbidden" }, req);
    return json(res, 200, DOCS.reconcile(), req);
  }

  return json(res, 404, { error: "unknown contract-request route", route }, req);
}

module.exports = { handle, renderDocument };
