// LegalDocuments — ONE shared, record-aware document manager used by every
// module's Documents tab (contracts, litigation, compliance, projects…). It
// takes the record's Drive-backed files and renders an enterprise DMS: search,
// record-aware category filters, file-type filter, count, metadata and
// per-document actions (preview in-app, open in Drive, download, copy link).
// Google Drive stays the source of truth — these reference the original files.
import { html, cx, fmt, useState } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Input } from "./ui.js";
import { api } from "./api.js";
import { DocViewerModal } from "./pages/contracts.js";
import { toast } from "./toast.js";

// Record-aware categories: first matching pattern on name+folder wins.
const CATS = {
  litigation: [["Notices", /notice|summons/i], ["Pleadings", /plaint|petition|\bsuit\b|written statement|rejoinder|\bws\b|appeal|application|pleading/i], ["Orders & Judgments", /order|judg|decree|verdict|ruling|disposal/i], ["Evidence", /evidence|affidavit|exhibit|document list/i], ["Hearings", /hearing|cause list|proceeding|minutes/i], ["Correspondence", /letter|email|correspond|reply|response|reminder/i], ["Settlement", /settle|compromis|withdraw/i], ["Case Summary", /summary|brief|synopsis|note/i]],
  contract: [["Executed", /executed|signed|final|counterpart/i], ["Amendments", /amend|addend|extension|renewal/i], ["Approvals", /approval|noc|sanction|authoriz/i], ["Annexures", /annex|schedul|appendix|exhibit/i], ["Correspondence", /letter|email|correspond/i], ["Draft", /draft|\bv\d/i]],
  licence: [["Certificate", /certificate|licen[cs]e|registration|permit/i], ["Application", /application|\bform\b|request/i], ["Renewal", /renew/i], ["Filing", /filing|return|submission|challan/i], ["Correspondence", /letter|response|query|reminder/i]],
  loan: [["Agreement", /agreement|\bloan\b/i], ["Amendments", /amend|addend/i], ["Resolutions", /resolution|minutes|board|partners/i], ["Registration", /registration|request|form/i], ["Correspondence", /letter|email|response/i]],
  resolution: [["Resolution", /resolution/i], ["Minutes", /minutes|meeting/i], ["Summary", /summary|tracker/i]],
  property: [["Title & Deeds", /title|deed|allotment|registry|mutation|sale deed/i], ["JV / Partnership", /jv|joint venture|partnership/i], ["Land Documents", /land|site plan|amalgam|\bnoc\b|approval|layout/i], ["Booking & Payment", /booking|payment|receipt|installment/i]],
  notice: [["Notice", /notice|summons/i], ["Reply", /reply|response/i]],
};
/* A SECP compliance year already knows what each of its documents is: the
   model stages every file as accounts, AGM, a form, evidence of submission or
   an acknowledgement. Running those through a filename regex threw that away
   and filed 14 of 16 statutory documents under "Other", which is not a
   category — it is the absence of one. Where the record states the stage, the
   record wins; the patterns below are for families that carry no stage. */
const SECP_STAGE = {
  FINANCIAL_STATEMENTS: "Financial statements",
  AGM: "AGM",
  FORM: "Annual forms",
  EVENT_FILING: "Event filings",
  SUBMISSION_EVIDENCE: "Filing evidence",
  ACKNOWLEDGEMENT: "Acknowledgements",
  CORRESPONDENCE: "Correspondence",
  SUPPORTING: "Supporting documents",
};
/* The parts of an annual general meeting, in the order the meeting runs. */
const AGM_KIND = {
  AGM_PRE_MINUTES: "Pre-AGM minutes",
  AGM_NOTICE: "Notice to members",
  AGM_MINUTES: "AGM minutes",
  AGM_ATTENDANCE: "Attendance & proxies",
  AGM_DIRECTION: "SECP direction & extensions",
  AGM_OTHER: "AGM — other",
};
function categorize(f, rt) {
  if (f.agmKind && AGM_KIND[f.agmKind]) return AGM_KIND[f.agmKind];
  if (f.stage && SECP_STAGE[f.stage]) return SECP_STAGE[f.stage];
  const hay = (f.name || "") + " " + (f.folderPath || "");
  for (const [label, re] of (CATS[rt] || [])) if (re.test(hay)) return label;
  return "Other";
}
const kindOf = (mt, name) => {
  const m = (mt || "") + " " + (name || "");
  if (/pdf/i.test(m)) return "PDF";
  if (/wordprocessingml|msword|\.docx?\b/i.test(m)) return "DOC";
  if (/spreadsheetml|ms-excel|\.xlsx?\b/i.test(m)) return "XLS";
  if (/^image|\.(png|jpe?g|jfif|gif)\b/i.test(m)) return "IMG";
  if (/presentation|\.pptx?\b/i.test(m)) return "PPT";
  return "FILE";
};

/* WHY THERE IS NOTHING HERE, IN BUSINESS ENGLISH (§15/§30).
 *
 * "No documents are currently linked to this record" reads like a fault in the
 * system, and for most of these records it is not one — the tracker names a
 * file the Drive estate has never held, or it names none at all. The reader
 * needs that difference: one is a gap in the archive, the other is a gap in
 * the tracker, and they are chased in different places.
 *
 * The technical disposition codes stay in Data Health. What appears here is a
 * sentence. */
function noDocumentsLine(record) {
  const state = record && record.documentState;
  if (state === "DOCUMENT_CITED_NOT_IN_ESTATE") {
    const cited = (record.__citedDocuments || []).filter(Boolean);
    return {
      title: "The source document is not in Drive",
      text: cited.length
        ? "The tracker names " + (cited.length === 1 ? "this document" : "these documents")
          + ", and no file in the Drive estate matches: " + cited.slice(0, 3).join(" · ")
          + (cited.length > 3 ? " and " + (cited.length - 3) + " more" : "") + "."
        : "The tracker names a document that the Drive estate does not hold.",
    };
  }
  if (state === "NO_DOCUMENT_CITED_IN_SOURCE") {
    return { title: "No document is cited in the source",
      text: "The tracker row names no document, and nothing in Drive is linked to this record." };
  }
  if (state === "NATIVE_NO_DOCUMENT_EXPECTED") {
    return { title: "No document expected",
      text: "This record was raised in LegalOS, so there is no source document in Drive to link." };
  }
  return { title: "No documents are linked to this record", text: "" };
}

export function LegalDocuments({ files, recordType = "contract", record = null }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState(-1);
  const all = (files || []).map((f) => ({ ...f, __cat: categorize(f, recordType), __kind: kindOf(f.mimeType, f.name) }));
  const catCounts = {};
  all.forEach((f) => { catCounts[f.__cat] = (catCounts[f.__cat] || 0) + 1; });
  /* Chips follow the order the year actually runs -- accounts, meeting, forms,
     lodgement, acknowledgement -- rather than whichever pile happens to be
     biggest. Anything the record did not stage keeps sorting by size. */
  const STAGE_ORDER = [...Object.values(AGM_KIND), ...Object.values(SECP_STAGE)];
  const rank = (c) => { const i = STAGE_ORDER.indexOf(c); return i === -1 ? 99 : i; };
  const cats = ["All", ...Object.keys(catCounts)
    .sort((a, b) => (rank(a) - rank(b)) || (catCounts[b] - catCounts[a]))];
  const ql = q.trim().toLowerCase();
  let rows = all.filter((f) => (cat === "All" || f.__cat === cat) && (!ql || (f.name + " " + f.folderPath).toLowerCase().includes(ql)));
  rows = [...rows].sort((a, b) => sort === "modified"
    ? String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""))
    : String(a.name || "").localeCompare(String(b.name || "")));

  if (!all.length) {
    const why = noDocumentsLine(record);
    return html`<div class="empty" style="padding:40px">
      <${Icon} name="paperclip" size=34 />
      <div>${why.title}</div>
      ${why.text && html`<div class="tiny muted" style="max-width:460px;margin-top:6px;line-height:1.5">${why.text}</div>`}
    </div>`;
  }

  const copyLink = (f) => { try { navigator.clipboard.writeText(location.origin + api.knowledge.fileUrl(f.id)); toast("Document link copied"); } catch (e) { toast("Could not copy link"); } };

  return html`<div class="col" style="gap:12px">
    <div class="row wrap" style="gap:8px;align-items:center">
      <div style="width:240px"><${Input} placeholder="Search documents…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <select class="select" style="width:auto" value=${sort} onChange=${(e) => setSort(e.target.value)}>
        <option value="name">Sort: Name</option><option value="modified">Sort: Modified</option>
      </select>
      <div class="spacer"></div>
      <span class="tiny muted">${rows.length}${rows.length !== all.length ? " of " + all.length : ""} document${all.length === 1 ? "" : "s"}</span>
    </div>
    <div class="row wrap" style="gap:6px">
      ${cats.map((c) => html`<button key=${c} class=${cx("chip", cat === c && "chip--active")} style="cursor:pointer" onClick=${() => setCat(c)}>${c}${c !== "All" ? " " + catCounts[c] : ""}</button>`)}
    </div>
    <div class="col" style="gap:2px">
      ${rows.map((f, i) => html`<div key=${f.id} class="feed__item" style="align-items:center">
        <div class="notif__ico clickable" style="width:32px;height:32px;background:var(--brand-soft);color:var(--brand)" onClick=${() => setView(i)}><${Icon} name="file" size=15 /></div>
        <div style="flex:1;min-width:0;cursor:pointer" onClick=${() => setView(i)}>
          <div class="strong tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
          <div class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.__cat} · ${(f.folderPath || "").split(" / ").slice(-1)[0]}${f.modifiedTime ? " · " + fmt.date(f.modifiedTime) : ""}${f.via === "content" && f.words && f.words.length ? " · linked on “" + f.words.join("” + “") + "” found in the text" : ""}</div>
        </div>
        ${/* What the DOCUMENT says it is, and how we know. The title is not
              decoration: a type read from the document's own words and a type
              read from a few keywords OCR'd out of a scan are different claims,
              and a reader deciding whether to trust this label is entitled to
              know which one they are looking at. */ ""}
        ${f.ctype && html`<${Pill} tone=${f.cread === "TEXT_EXTRACTED" ? "indigo" : "gray"}
          title=${f.cread === "TEXT_EXTRACTED"
    ? "Read from the document's own text"
    : "This document is a scan with no text layer. Its type comes from keywords found by Google's OCR index — a weaker signal than reading the text."}>
          ${String(f.ctype).replace(/_/g, " ").toLowerCase()}${f.cread === "TEXT_EXTRACTED" ? "" : " ?"}
        </${Pill}>`}
        <${Pill} tone="gray">${f.__kind}</${Pill}>
        <button class="iconbtn" title="Preview in-app" onClick=${() => setView(i)}><${Icon} name="eye" size=15 /></button>
        <a class="iconbtn" href=${api.knowledge.fileUrl(f.id)} target="_blank" rel="noopener" title="Download / open"><${Icon} name="download" size=15 /></a>
        ${f.webViewLink && html`<a class="iconbtn" href=${f.webViewLink} target="_blank" rel="noopener" title="Open in Google Drive"><${Icon} name="externalLink" size=15 /></a>`}
        <button class="iconbtn" title="Copy document link" onClick=${() => copyLink(f)}><${Icon} name="copy" size=15 /></button>
      </div>`)}
      ${rows.length === 0 && html`<div class="empty" style="padding:24px"><div>No documents match this filter.</div></div>`}
    </div>
    ${view >= 0 && rows[view] && html`<${DocViewerModal} c=${null} files=${rows} index=${view} onIndex=${setView} onClose=${() => setView(-1)} />`}
  </div>`;
}
