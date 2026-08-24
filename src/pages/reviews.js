// MODULE 3 — COUNTERPARTY CONTRACT REVIEW (Phases 17–22).
// Upload → extraction → clause identification (confidence-marked) → playbook
// comparison → STRUCTURED DEVIATION REPORT (clause · our position · gap · risk ·
// recommendation · suggested redline · approval) → lawyer decisions → approval
// → redline delivered. Extraction failures are shown honestly, never papered
// over; positions with no published library clause say "Source not found in
// LegalOS" instead of inventing authority.
import { html, cx, fmt, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Avatar, Empty, Modal, Field, Input, Textarea } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { nameOf } from "../data.js";
import { navigate } from "../router.js";
import {
  useCollection, createContractReview, reviewById3, decideFinding, approveReview, deliverReview,
  retrievePrecedent, counterpartyName,
} from "../store.js";
import { M3_AGREEMENT_TYPES, M3_JURISDICTIONS, TIER_TONE } from "../contracts3.js";
import { SourceBadge } from "./drafting.js";
import { CounterpartyPicker } from "./matters.js";
import { useActiveUser, isLegal, filterVisible } from "../rbac.js";
import { toast } from "../toast.js";

const RiskTone = { Low: "gray", Medium: "blue", High: "amber", Critical: "red" };
const ConfTone = { High: "green", Medium: "blue", Low: "amber", None: "gray" };
const STATUS_TONE = { "Extraction Failed": "red", "Findings": "amber", "Approved": "green", "Redline Delivered": "green" };

function UploadModal({ onClose, viewer }) {
  const matters = filterVisible(viewer, useCollection("matters"));
  const [f, setF] = useState({ name: "", text: "", agreementType: M3_AGREEMENT_TYPES[0], jurisdiction: "Saudi Arabia", counterpartyId: null, matterId: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const onFile = (file) => {
    set("name", file.name);
    if (/\.(txt|md)$/i.test(file.name)) {
      const rd = new FileReader();
      rd.onload = () => set("text", String(rd.result || ""));
      rd.readAsText(file);
    } else {
      // The prototype has no PDF/DOCX parser — never fabricate content: leave
      // the text empty so the review lands honestly as "Extraction Failed"
      // unless the lawyer pastes the text.
      toast("Cannot extract " + file.name.split(".").pop().toUpperCase() + " in the prototype — paste the text, or submit to record an extraction failure", "info");
    }
  };
  const submit = () => {
    const r = createContractReview(f, viewer.id);
    if (r.ok) { toast(r.status === "Extraction Failed" ? r.id + " logged — extraction failed" : r.id + " — " + r.findings + " findings"); onClose(); navigate("/reviews/" + r.id); }
    else toast(r.error, "error");
  };
  return html`<${Modal} title="Review counterparty paper" icon="upload" width=${680} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="workflow" onClick=${submit}>Extract & compare to playbook</${Btn}>`}>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <${Field} label="Document name *"><${Input} value=${f.name} onInput=${(e) => set("name", e.target.value)} placeholder="e.g. Vendor MSA — Orbit redline v2" /></${Field}>
      <${Field} label="Upload file" hint=".txt is extracted; other formats need pasted text.">
        <label class="btn btn--soft btn--sm" style="cursor:pointer;align-self:flex-start">
          <${Icon} name="upload" size=14 />Choose file
          <input type="file" accept=".txt,.md,.pdf,.docx" style="display:none" onChange=${(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
        </label>
      </${Field}>
      <${Field} label="Agreement type"><select class="select" value=${f.agreementType} onChange=${(e) => set("agreementType", e.target.value)}>${M3_AGREEMENT_TYPES.map((t) => html`<option key=${t}>${t}</option>`)}</select></${Field}>
      <${Field} label="Jurisdiction"><select class="select" value=${f.jurisdiction} onChange=${(e) => set("jurisdiction", e.target.value)}>${M3_JURISDICTIONS.map((j) => html`<option key=${j}>${j}</option>`)}</select></${Field}>
      <${Field} label="Related matter">
        <select class="select" value=${f.matterId} onChange=${(e) => set("matterId", e.target.value)}>
          <option value="">—</option>
          ${matters.filter((m) => m.practiceArea).slice(0, 30).map((m) => html`<option key=${m.id} value=${m.id}>${m.id}</option>`)}
        </select>
      </${Field}>
    </div>
    <${Field} label="Counterparty"><${CounterpartyPicker} value=${f.counterpartyId} onChange=${(v) => set("counterpartyId", v)} viewer=${viewer} /></${Field}>
    <${Field} label="Document text" hint="The extracted text the engine will classify and compare.">
      <${Textarea} rows=8 value=${f.text} onInput=${(e) => set("text", e.target.value)} placeholder="Paste the counterparty draft here…" />
    </${Field}>
  </${Modal}>`;
}

/* One structured finding — the exact PRD shape (Phase 20). */
function Finding({ r, f, viewer }) {
  const dec = (r.decisions || {})[f.id];
  const [note, setNote] = useState("");
  const precedent = f.clauseType ? retrievePrecedent(viewer, { clauseType: f.clauseType, counterpartyId: r.counterpartyId, jurisdiction: r.jurisdiction }) : [];
  const act = (action) => {
    const res = decideFinding(r.id, f.id, { action, note }, viewer.id);
    res.ok ? toast(f.clauseType + ": " + action) : toast(res.error, "error");
  };
  return html`<div class="card card--pad col" style="gap:10px">
    <div class="row wrap" style="gap:8px">
      <span class="strong">${f.clauseType}</span>
      <${Pill} tone=${RiskTone[f.risk]}>RISK ${f.risk}</${Pill}>
      <${Pill} tone=${ConfTone[f.confidence]}>${f.confidence === "Low" ? "⚠ LOW CONFIDENCE" : f.confidence + " confidence"}</${Pill}>
      ${f.missing && html`<${Pill} tone="red" dot=${true}>MISSING FROM DOCUMENT</${Pill}>`}
      ${f.jurWarning && html`<${Pill} tone="amber" dot=${true}>⚠ jurisdiction mismatch</${Pill}>`}
      <div class="spacer"></div>
      <span class="tiny muted">${f.location}</span>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div class="fpop__lbl" style="margin-bottom:5px">Counterparty text</div>
        ${f.actualText
          ? html`<div class="doc" style="padding:12px 14px;font-size:12px;white-space:pre-wrap;max-height:160px;overflow:auto">${f.actualText}</div>`
          : html`<div class="tiny muted" style="padding:12px 0">Not present in the document.</div>`}
      </div>
      <div>
        <div class="row" style="margin-bottom:5px"><span class="fpop__lbl">Our position</span><div class="spacer"></div>${f.ourPosition && html`<${SourceBadge} kind="library" small=${true} />`}</div>
        ${f.ourPosition
          ? html`<div class="doc" style="padding:12px 14px;font-size:12px;white-space:pre-wrap;max-height:160px;overflow:auto">${f.ourPosition.text}</div>
              <div class="tiny muted" style="margin-top:4px">Clause <span class="mono">${f.ourPosition.clauseId}</span> · Preferred · v${f.ourPosition.version}</div>`
          : html`<div class="banner banner--warn" style="padding:8px 10px"><${Icon} name="alertTriangle" size=13 /><span class="tiny">${f.sourceNote || "Source not found in LegalOS."}</span></div>`}
      </div>
    </div>

    ${f.gap && f.gap.changed && html`<div class="tiny"><b>Gap:</b> ${f.gap.note ? f.gap.note + " " : ""}${(f.gap.removed || []).length ? "Missing from theirs: " + f.gap.removed.slice(0, 8).join(", ") + ". " : ""}${(f.gap.added || []).length ? "They add: " + f.gap.added.slice(0, 8).join(", ") + "." : ""}</div>`}
    ${f.matchTier && html`<div class="tiny"><b>Match:</b> their text equals our <${Pill} tone=${TIER_TONE[f.matchTier]}>${f.matchTier}</${Pill}> position.</div>`}

    <div class="row wrap" style="gap:10px">
      ${f.recommendation
        ? html`<span class="tiny"><b>Recommendation:</b> <${Pill} tone=${f.recommendation === "Accept" ? "green" : f.recommendation === "Reject" ? "red" : "amber"}>${f.recommendation}</${Pill}></span>`
        : html`<span class="tiny muted">No recommendation — no approved position to compare against.</span>`}
      <span class="tiny"><b>Approval:</b> ${f.approvalRequired === "None" ? "not required" : (f.approvalRequired === "HoD" ? "Director" : "Lead") + " required to accept"}</span>
    </div>

    ${f.suggestedRedline && html`<div>
      <div class="row" style="margin-bottom:5px"><span class="fpop__lbl">Suggested redline</span><div class="spacer"></div><${SourceBadge} kind="library" small=${true} /></div>
      <div class="doc" style="padding:12px 14px;font-size:12px;white-space:pre-wrap;border-left:3px solid var(--brand)">${f.suggestedRedline.text}</div>
    </div>`}

    ${precedent.length > 0 && html`<div class="col" style="gap:5px">
      <span class="fpop__lbl">Precedent (${precedent.length})</span>
      ${precedent.slice(0, 3).map((c, i) => html`<div key=${i} class="row tiny clickable" style="gap:7px" onClick=${() => navigate(c.to)}>
        <${Pill} tone=${c.kind === "MATTER" ? "blue" : "purple"}>${c.kind}</${Pill}>
        <span class="ellipsis" style="flex:1">${c.id} — ${c.why}${c.jurMismatch ? " · ⚠ different jurisdiction" : ""}</span>
      </div>`)}
    </div>`}

    <div class="row wrap" style="gap:8px;padding-top:8px;border-top:1px solid var(--border)">
      ${dec
        ? html`<span class="tiny"><b>Decision:</b> <${Pill} tone=${dec.action === "Accept" ? "green" : dec.action === "Reject" ? "red" : "amber"}>${dec.action}</${Pill}> by ${nameOf(dec.by)} · ${fmt.rel(dec.at)}${dec.note ? " — " + dec.note : ""}</span>`
        : html`<${Fragment}>
            <${Input} placeholder="Decision note (optional)" value=${note} onInput=${(e) => setNote(e.target.value)} style=${{ flex: 1, minWidth: "160px" }} />
            ${["Accept", "Negotiate to Acceptable", "Negotiate to Fallback", "Reject"].map((a) => html`<${Btn} key=${a} size="sm"
              variant=${a === (f.recommendation || "") ? "primary" : "soft"} onClick=${() => act(a)}>${a}</${Btn}>`)}
          </${Fragment}>`}
    </div>
  </div>`;
}

function ReviewDetail({ id }) {
  const viewer = useActiveUser();
  useCollection("reviews3");
  const r = reviewById3(id);
  if (!r || !isLegal(viewer)) return html`<div class="page"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/reviews")}>Reviews</${Btn}><${Empty} icon="lock" title="Not found or no access" /></div>`;
  const undecided = (r.findings || []).filter((f) => !(r.decisions || {})[f.id]);
  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:12px"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/reviews")}>Reviews</${Btn}></div>
    <div class="pagehead" style="margin-bottom:14px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px">
          <span class="mono muted">${r.id}</span>
          <${Pill} tone=${STATUS_TONE[r.status] || "gray"} dot=${true}>${r.status}</${Pill}>
          <span class="jurbadge"><${Icon} name="scale" size=12 />JURISDICTION: ${r.jurisdiction || "—"}</span>
          ${r.counterpartyId && html`<${Pill} tone="gray">${counterpartyName(r.counterpartyId)}</${Pill}>`}
          ${r.matterId && html`<button class="facechip" onClick=${() => navigate("/matters/" + r.matterId)}><${Icon} name="folder" size=11 />${r.matterId}</button>`}
        </div>
        <div class="pagehead__title">${r.name}</div>
        <div class="tiny muted" style="margin-top:4px">${r.agreementType || "—"} · uploaded by ${nameOf(r.uploadedBy)} · ${fmt.date(r.uploadedAt)}</div>
      </div>
      <div class="pagehead__actions">
        ${r.status === "Findings" && html`<${Btn} variant="primary" icon="checksquare"
          title=${undecided.length ? undecided.length + " finding(s) still need a decision" : "Approve the redline (named lawyer)"}
          onClick=${() => { const res = approveReview(r.id, viewer.id); res.ok ? toast("Redline approved") : toast(res.error, "error"); }}>Approve redline</${Btn}>`}
        ${r.status === "Approved" && html`<${Btn} variant="primary" icon="send" onClick=${() => { const res = deliverReview(r.id, viewer.id); res.ok ? toast("Redline released") : toast(res.error, "error"); }}>Deliver redline</${Btn}>`}
      </div>
    </div>

    ${r.status === "Extraction Failed" && html`<${Empty} icon="alertTriangle" title="Extraction failed"
      text="No text could be extracted from this document. Nothing was fabricated — re-upload as .txt or paste the text to run the comparison." />`}

    ${r.status !== "Extraction Failed" && html`<${Fragment}>
      ${r.approvedBy && html`<div class="banner banner--info" style="margin-bottom:14px"><${Icon} name="checkcircle" size=15 /><span class="tiny">Approved by <b>${nameOf(r.approvedBy)}</b> · ${fmt.date(r.approvedAt)}</span></div>`}
      ${undecided.length > 0 && html`<div class="banner banner--warn" style="margin-bottom:14px"><${Icon} name="alertTriangle" size=15 /><span class="tiny"><b>${undecided.length} of ${(r.findings || []).length} findings</b> still need a lawyer's decision before the redline can be approved.</span></div>`}
      <div class="col" style="gap:14px">
        ${(r.findings || []).map((f) => html`<${Finding} key=${f.id} r=${r} f=${f} viewer=${viewer} />`)}
        ${(r.findings || []).length === 0 && html`<${Empty} icon="checkcircle" title="No findings" text="No recognisable clauses were identified in the document." />`}
      </div>
    </${Fragment}>`}
  </div>`;
}

export default function Reviews({ id }) {
  const viewer = useActiveUser();
  const reviews = useCollection("reviews3");
  const [uploading, setUploading] = useState(false);
  if (id) return html`<${ReviewDetail} id=${id} key=${id} />`;
  if (!isLegal(viewer)) return html`<div class="page"><${Empty} icon="lock" title="Contract review is internal" /></div>`;
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Counterparty Review" sub="Upload their paper — get a structured deviation report against our approved playbook, never just a summary."
      actions=${html`<${Btn} variant="primary" icon="upload" onClick=${() => setUploading(true)}>Review counterparty paper</${Btn}>`} />
    ${uploading && html`<${UploadModal} viewer=${viewer} onClose=${() => setUploading(false)} />`}
    <${StatStrip} stats=${[
      { value: reviews.length, label: "Reviews" },
      { value: reviews.filter((r) => r.status === "Findings").length, label: "Awaiting decisions" },
      { value: reviews.filter((r) => r.status === "Approved" || r.status === "Redline Delivered").length, label: "Approved redlines" },
      { value: reviews.filter((r) => r.status === "Extraction Failed").length, label: "Extraction failures" },
    ]} />
    <div class="card" style="padding:0"><div class="dense"><${DataTable} onRow=${(r) => navigate("/reviews/" + r.id)} rows=${reviews}
      empty=${html`<${Empty} icon="upload" title="No reviews yet" text="Upload a counterparty draft to compare it against the playbook." />`}
      columns=${[
        { key: "id", label: "ID", mono: true, width: "92px" },
        { key: "name", label: "Document", render: (r) => html`<div class="wrapcell"><div class="cell-strong">${r.name}</div><div class="tiny muted">${r.agreementType || "—"} · ${r.jurisdiction || "—"}</div></div>` },
        { key: "findings", label: "Findings", width: "150px", render: (r) => { const n = (r.findings || []).length; const dec = Object.keys(r.decisions || {}).length; return n ? html`<span class="tiny strong">${dec}/${n} decided</span>` : html`<span class="tiny muted">—</span>`; } },
        { key: "status", label: "Status", width: "150px", render: (r) => html`<${Pill} tone=${STATUS_TONE[r.status] || "gray"} dot=${true}>${r.status}</${Pill}>` },
        { key: "uploadedBy", label: "By", width: "54px", render: (r) => html`<${Avatar} name=${nameOf(r.uploadedBy)} size="sm" />` },
      ]} /></div></div>
  </div>`;
}
