// Record 360 — the universal FULL-SCREEN record page. Open it for ANY record (a
// case, contract, licence, loan, resolution, property, notice) and it takes over
// the screen with proper tabs: Overview, Related (entity-joined, recursive),
// Documents (opens the in-app viewer), and Timeline where dates exist. One
// component, every module. Not a half-screen drawer — a full page experience.
import { html, cx, fmt, useState, useEffect } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Status, Section, AICard, Timeline, Stepper } from "./ui.js";
import { navigate } from "./router.js";
import { api } from "./api.js";
import { useLegalGraph, ENTITY_OF, normEntity } from "./graph.js";
import { DocViewerModal } from "./pages/contracts.js";

const KMETA = {
  contract:   { icon: "file",        label: "Contract",        title: (r) => r.title || r.id },
  litigation: { icon: "gavel",       label: "Litigation case", title: (r) => r.caseName || r.title },
  notice:     { icon: "mail",        label: "Legal notice",    title: (r) => (r.sender || "?") + " → " + (r.recipient || "?") },
  licence:    { icon: "shield",      label: "Licence",         title: (r) => (r.authority ? r.authority + " · " : "") + (r.entity || r.number || "Licence") },
  loan:       { icon: "dollar",      label: "Loan",            title: (r) => (r.borrower || "Loan") + (r.lender ? " ← " + r.lender : "") },
  resolution: { icon: "checksquare", label: "Resolution",      title: (r) => r.agenda || ("Resolution " + (r.docNo || "")) },
  property:   { icon: "building",    label: "Property",        title: (r) => r.project || r.address || "Property" },
};
/* A MONEY FIGURE, IN BOTH CURRENCIES.
   The register carries PKR and USD as separate columns, and a case raised in
   the app fills only the one the user typed -- so "Recoverable" read
   "PKR 10.0K" and stopped there, which is not what anybody reporting upward
   needs. The server derives the missing side from the configured rate and says
   which side it derived (`converted`), so the figure somebody actually entered
   leads and the derived one follows it, marked as derived. Neither is
   presented as the other. */
function bothCurrencies(pkr, usd, currency, r) {
  const has = (v) => v != null && v !== "" && Number(v) !== 0;
  const conv = (r && r.converted) || null;
  const derived = new Set((conv && conv.fields) || []);
  const parts = [];
  if (has(pkr)) parts.push({ text: fmt.money(pkr, currency || "PKR"), derived: derived.has("exposurePKR") || derived.has("recoverablePKR") });
  if (has(usd)) parts.push({ text: fmt.money(usd, "USD"), derived: derived.has("exposureUSD") || derived.has("recoverableUSD") });
  if (!parts.length) return "";
  /* The entered figure first; the converted one after it, in a lighter weight
     with the rate it came from. */
  parts.sort((a, b) => Number(a.derived) - Number(b.derived));
  const rate = conv ? " at PKR " + conv.pkrPerUsd + "/USD" + (conv.asOf ? ", " + conv.asOf : "") : "";
  return parts.map((x, i) => (i === 0 ? x.text : " (≈ " + x.text + (x.derived ? rate : "") + ")")).join("");
}

const FIELDS = {
  contract: [["Contract", "title"], ["Type", (r) => r.contractType || r.type], ["Status", "status"], ["Counterparty", "counterparty"], ["Entity", "entityName"], ["Value", (r) => r.value ? fmt.money(r.value, r.currency) : ""], ["Start", "start"], ["Expiry", "expiry"], ["City", "city"], ["Region", "region"], ["Physical record", "physicalRecordRef"]],
  litigation: [["Case", "caseName"], ["Case No", "caseNo"], ["Court / forum", "court"], ["Status", (r) => r.rawStatus || r.status], ["Nature", (r) => r.nature || r.type], ["Position", "position"], ["Entity", "entity"], ["Counsel", "counsel"], ["Filed", (r) => r.filed || r.filingDate], ["Last hearing", "lastHearing"], ["Next hearing", "nextHearing"], ["Exposure", (r) => bothCurrencies(r.exposurePKR != null && r.exposurePKR !== "" ? r.exposurePKR : r.exposure, r.exposureUSD, r.currency, r)],
    ["Recoverable", (r) => bothCurrencies(r.recoverablePKR != null && r.recoverablePKR !== "" ? r.recoverablePKR : r.recoverable, r.recoverableUSD, r.recoverableCurrency || r.currency, r)]],
  notice: [["Sender", "sender"], ["Recipient", "recipient"], ["Category", "category"], ["Date", "noticeDate"], ["Reply date", "replyDate"], ["Status", "status"], ["Details", "details"]],
  licence: [["Entity", "entity"], ["Authority", "authority"], ["Number", "number"], ["Status", "status"], ["Issued", "issued"], ["Expiry", "expiry"]],
  loan: [["Borrower", "borrower"], ["Lender", "lender"], ["Amount", (r) => r.amount ? fmt.money(r.amount, r.currency) : ""], ["Reference", "ref"], ["Agreement date", "agreementDate"], ["Repayment", "repaymentDate"], ["Term", "term"], ["Interest", "interest"], ["Status", "status"]],
  resolution: [["Agenda", "agenda"], ["Document No", "docNo"], ["Entity", "entity"], ["Date", "date"]],
  property: [["Project", "project"], ["Entity", "entity"], ["City", "city"], ["Address", "address"], ["Ownership", (r) => (r.ownership != null && r.ownership !== "") ? r.ownership : ""], ["JV", "jv"], ["Value", (r) => r.value ? fmt.money(r.value, r.currency) : ""], ["Contractor", "contractor"], ["Status", "status"]],
};
const FAM_HUB = { contract: "/contracts", litigation: "/litigation", notice: "/litigation", licence: "/compliance", loan: "/compliance", resolution: "/compliance", property: "/projects" };
const val = (r, spec) => (typeof spec === "function" ? spec(r) : r[spec]);
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

// A lifecycle stepper per kind — the same visual spine the contract workspace
// uses, so every record reads uniformly. Returns { steps, current } or null.
function stepFor(kind, r) {
  if (kind === "litigation") {
    const closed = /closed|disposed|settled|decided|withdraw|dismiss|complet/i.test((r.rawStatus || r.status || ""));
    return { steps: ["Filed", "In Progress", "Hearing", "Judgment", "Closed"], current: closed ? 4 : (r.nextHearing ? 2 : 1) };
  }
  if (kind === "licence") {
    const d = r.daysToExpiry;
    return { steps: ["Applied", "Issued", "Valid", "Renewal due", "Expired"], current: d == null ? 2 : d < 0 ? 4 : d < 90 ? 3 : 2 };
  }
  if (kind === "loan") {
    const done = /repaid|closed|settled|matured/i.test(r.status || "");
    return { steps: ["Agreed", "Disbursed", "Active", "Repaid"], current: done ? 3 : 2 };
  }
  if (kind === "contract") {
    const s = (r.status || "").toLowerCase();
    const cur = /expired|terminated/.test(s) ? 7 : /active/.test(s) ? 6 : /sign/.test(s) ? 5 : /approv/.test(s) ? 4 : /negoti/.test(s) ? 3 : /draft/.test(s) ? 2 : /review/.test(s) ? 1 : 6;
    return { steps: ["Request", "Review", "Drafting", "Negotiation", "Approval", "Signature", "Active", "Renewal"], current: cur };
  }
  if (kind === "notice") {
    return { steps: ["Drafted", "Sent", "Reply awaited", "Resolved"], current: /resolv|closed|settled/i.test(r.status || "") ? 3 : (r.replyDate ? 3 : r.noticeDate ? 1 : 0) };
  }
  return null;
}

/* SOURCE QUALITY, FETCHED ONCE AND SHARED.
 *
 * Defects live in the stored documents, not in the records, so the map is keyed
 * by Drive file id and loaded lazily the first time any 360 opens. The endpoint
 * is restricted to Legal and administrators; for anyone else the request fails
 * and the map stays empty, which is exactly right — an ordinary reader should
 * not be shown parser findings about a contract they are simply reading. */
let SQ_MAP = null;          // fileId -> [{ type, severity, evidence, explanation }]
let SQ_PENDING = null;
function loadSourceQuality() {
  if (SQ_MAP) return Promise.resolve(SQ_MAP);
  if (!SQ_PENDING) {
    SQ_PENDING = api.sourceQuality().then((r) => {
      SQ_MAP = new Map((r.rows || []).map((x) => [x.fileId, x]));
      return SQ_MAP;
    }, () => { SQ_MAP = new Map(); return SQ_MAP; });
  }
  return SQ_PENDING;
}

const SEV_TONE = { HIGH: "red", MEDIUM: "amber", LOW: undefined };
/* Said for a lawyer, not for a parser. The issue TYPE is shown, the evidence is
   shown, and nothing about how it was detected is. */
const ISSUE_LABEL = {
  SOURCE_DOCUMENT_CONFLICT: "Conflicting project reference",
  MISSING_SIGNATURE: "Missing signature",
  BLANK_SCHEDULE: "Blank schedule",
  JURISDICTION_STAMP_MISMATCH: "Stamp jurisdiction mismatch",
  MISFILED_DRAFT_CONTENT: "Draft carries another project's details",
  EXECUTION_ISSUE: "Execution inconsistency",
  EMPTY_SOURCE_FILE: "Stored file is empty",
  NOT_A_DOCUMENT: "Not a document",
};

export function Record360({ kind, rec, onClose }) {
  const [stack, setStack] = useState([{ kind, rec }]);
  const cur = stack[stack.length - 1];
  const [tab, setTab] = useState("overview");
  const [doc, setDoc] = useState(null);
  const { relatedByParty } = useLegalGraph();
  const [sq, setSq] = useState(null);
  useEffect(() => { let live = true; loadSourceQuality().then((m) => { if (live) setSq(m); }); return () => { live = false; }; }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !doc) (stack.length > 1 ? setStack(stack.slice(0, -1)) : onClose()); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stack, doc]);

  const drill = (k, r) => { setStack([...stack, { kind: k, rec: r }]); setTab("overview"); };
  const back = () => (stack.length > 1 ? setStack(stack.slice(0, -1)) : onClose());

  const meta = KMETA[cur.kind] || KMETA.contract;
  const rel = relatedByParty(cur.kind, cur.rec);
  const files = cur.rec.driveFiles || [];
  const issueFor = (id) => (sq && sq.get(id)) || null;
  const flagged = files.map((f) => issueFor(f.id)).filter(Boolean);
  const worst = flagged.some((r) => r.severity === "HIGH") ? "HIGH"
    : flagged.some((r) => r.severity === "MEDIUM") ? "MEDIUM" : flagged.length ? "LOW" : null;
  const relGroups = ["contract", "litigation", "notice", "licence", "loan", "resolution", "property"]
    .map((k) => ({ k, items: (rel.groups[k] || []).filter((x) => !(k === cur.kind && x === cur.rec)) }))
    .filter((g) => g.items.length);
  const relCount = relGroups.reduce((s, g) => s + g.items.length, 0);
  const hasTimeline = cur.kind === "litigation" && (cur.rec.filed || cur.rec.lastHearing || cur.rec.nextHearing);

  /* NO "RELATED" TAB (§88).
     "Related" is not a kind of information — it is a relationship between this
     record and others, and a tab of that name made a reader open it to find
     out whether there was anything there at all. Every record page in the
     product now reads the same way: Overview, Documents, Timeline, and the
     module's own workflow. The related records have not gone anywhere; they
     are a section AT THE BOTTOM OF THE OVERVIEW, where they are visible
     without a decision, with the count in their own heading. */
  const tabs = [
    { key: "overview", label: "Overview", icon: "info" },
    { key: "documents", label: "Documents", icon: "paperclip", count: files.length },
    ...(hasTimeline ? [{ key: "timeline", label: "Timeline", icon: "activity" }] : []),
  ];
  if (!tabs.find((t) => t.key === tab)) setTab("overview");

  const fields = (FIELDS[cur.kind] || []).map(([lbl, spec]) => [lbl, val(cur.rec, spec)]).filter(([, v]) => v != null && v !== "");
  const entRaw = ENTITY_OF[cur.kind] && ENTITY_OF[cur.kind](cur.rec);

  return html`<div class="r360">
    <div class="r360__bar">
      <button class="iconbtn" onClick=${back} title=${stack.length > 1 ? "Back (Esc)" : "Close (Esc)"}><${Icon} name=${stack.length > 1 ? "arrowLeft" : "x"} size=18 /></button>
      <div class="notif__ico" style="width:34px;height:34px;background:var(--brand-soft);color:var(--brand);flex:none"><${Icon} name=${meta.icon} size=17 /></div>
      <div style="flex:1;min-width:0">
        <div class="strong" style="font-size:15.5px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${meta.title(cur.rec)}</div>
        <div class="tiny muted">${meta.label}${entRaw ? " · " + entRaw : ""}</div>
      </div>
      ${worst && html`<${Pill} tone=${SEV_TONE[worst]} title="Some stored documents on this record have source issues">Source quality: review required</${Pill}>`}
      ${cur.rec.status && html`<${Status} value=${cur.rec.status} />`}
      ${entRaw && html`<button class="btn btn--ghost btn--sm" onClick=${() => { onClose(); navigate("/companies/" + encodeURIComponent(normEntity(entRaw))); }}><${Icon} name="building" size=14 /> Entity hub</button>`}
      <button class="btn btn--ghost btn--sm" onClick=${() => { onClose(); navigate(FAM_HUB[cur.kind] || "/"); }}>Open register</button>
    </div>
    ${(() => { const st = stepFor(cur.kind, cur.rec); return st ? html`<div class="r360__stepper"><${Stepper} steps=${st.steps} current=${st.current} /></div>` : null; })()}
    <div class="r360__tabs">
      ${tabs.map((t) => html`<div key=${t.key} class=${cx("tab", tab === t.key && "active")} onClick=${() => setTab(t.key)}>
        <${Icon} name=${t.icon} size=15 /><span class="tab__label">${t.label}</span>${t.count != null ? html`<span class="count">${t.count}</span>` : ""}
      </div>`)}
    </div>
    <div class="r360__body">
      <div class="r360__inner">
        ${tab === "overview" && flagged.length > 0 && html`<div style="margin-bottom:14px">
          <${Section} title="Source quality" icon="alertTriangle" bodyClass="col"
            sub="Issues found in the stored documents themselves. The files are unchanged and can be opened from the Documents tab.">
            ${[...new Set(flagged.flatMap((r) => r.issues.map((i) => i.type)))].map((t) => html`<div key=${t} class="row" style="gap:8px;align-items:baseline;padding:3px 0">
              <${Pill} tone=${SEV_TONE[(flagged.flatMap((r) => r.issues).find((i) => i.type === t) || {}).severity]}>${ISSUE_LABEL[t] || t}</${Pill}>
              <span class="tiny muted">${flagged.filter((r) => r.issues.some((i) => i.type === t)).length} document${flagged.filter((r) => r.issues.some((i) => i.type === t)).length === 1 ? "" : "s"}</span>
            </div>`)}
            <div class="tiny muted" style="padding-top:6px">
              These are defects in what was signed and filed. LegalOS records them and does not alter the
              document, its terms, its execution or its schedules.
            </div>
          </${Section}>
        </div>`}
        ${tab === "overview" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:8px 28px;align-items:start">
          ${fields.map(([lbl, v]) => html`<div key=${lbl} class="row" style="gap:12px;padding:9px 2px;border-bottom:1px solid var(--border);align-items:baseline">
            <div class="tiny muted" style="width:130px;flex:none">${lbl}</div>
            <div class="tiny" style="flex:1;color:var(--text);word-break:break-word">${isDate(v) ? fmt.date(v) : String(v)}</div>
          </div>`)}
          ${cur.rec.__source && html`<div class="row" style="gap:12px;padding:9px 2px;align-items:baseline;grid-column:1/-1">
            <div class="tiny muted" style="width:130px;flex:none">Source</div>
            <div class="tiny" style="flex:1;color:var(--text-3);word-break:break-word">${(cur.rec.__source.folder || "") + " / " + (cur.rec.__source.file || "")}</div>
          </div>`}
          ${cur.kind === "litigation" && (cur.rec.proceedings || cur.rec.opinion) && html`<div style="grid-column:1/-1;margin-top:12px">
            <${AICard} title="Case summary">${cur.rec.proceedings || ""}${cur.rec.opinion ? html`<br /><br /><b>Opinion:</b> ${cur.rec.opinion}` : ""}</${AICard}>
          </div>`}

          ${/* The related records, on the Overview where they belong. Rendered
                only when there ARE some — an empty "No related records" panel
                on every record is a question nobody asked. */ ""}
          ${relCount > 0 && html`<div style="grid-column:1/-1;margin-top:18px" class="col">
          <div class="tiny muted" style="margin-bottom:10px">Other records involving ${rel.name || "this counterparty"}. Click any record to open its own 360.</div>
          ${relGroups.map((g) => html`<${Section} key=${g.k} title=${KMETA[g.k].label + "s (" + g.items.length + ")"} icon=${KMETA[g.k].icon} bodyClass="col">
            ${g.items.slice(0, 40).map((r, i) => html`<div key=${i} class="feed__item clickable" style="align-items:center" onClick=${() => drill(g.k, r)}>
              <div class="notif__ico" style="width:30px;height:30px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name=${KMETA[g.k].icon} size=14 /></div>
              <div style="flex:1;min-width:0"><div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${KMETA[g.k].title(r)}</div>
              <div class="tiny muted">${[r.status, r.date && fmt.date(r.date), r.expiry && "exp " + fmt.date(r.expiry)].filter(Boolean).join(" · ")}</div></div>
              ${(r.driveFiles || []).length ? html`<${Pill} tone="indigo">${r.driveFiles.length} doc${r.driveFiles.length === 1 ? "" : "s"}</${Pill}>` : ""}
              <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
            </div>`)}
            ${g.items.length > 40 && html`<div class="tiny muted" style="padding:6px 4px">… and ${g.items.length - 40} more</div>`}
          </${Section}>`)}
          </div>`}
        </div>`}

        ${tab === "documents" && (files.length ? html`<${Section} title=${"Documents (" + files.length + ")"} icon="paperclip" sub="Click any to view in-app" bodyClass="col">
          ${files.map((f, i) => html`<div key=${f.id} class="feed__item clickable" style="align-items:center" onClick=${() => setDoc({ files, i })}>
            <div class="notif__ico" style="width:30px;height:30px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="file" size=14 /></div>
            <div style="flex:1;min-width:0"><div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
            <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(f.folderPath || "").split(" / ").slice(-1)[0]}</div>
            ${issueFor(f.id) && html`<div class="tiny" style="color:var(--amber-600, var(--text-2));margin-top:2px">
              ${issueFor(f.id).issues.map((i) => html`<div key=${i.type}>⚠ ${ISSUE_LABEL[i.type] || i.type} — ${i.evidence}</div>`)}
            </div>`}</div>
            ${issueFor(f.id) && html`<${Pill} tone=${SEV_TONE[issueFor(f.id).severity]}>Source issue</${Pill}>`}
            <span class="tiny muted">${(f.mimeType || "").split(/[/.]/).pop().slice(0, 10).toUpperCase()}</span>
            <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
          </div>`)}
        </${Section}>` : html`<div class="empty" style="padding:44px"><${Icon} name="paperclip" size=34 /><div>No documents linked to this record.</div></div>`)}

        ${tab === "timeline" && html`<${Section} title="Timeline" icon="activity" bodyClass="col">
          <${Timeline} items=${[
            cur.rec.filed && { title: "Case filed", meta: fmt.date(cur.rec.filed), tone: "gray" },
            cur.rec.counsel && cur.rec.counsel !== "—" && { title: "Counsel engaged", meta: cur.rec.counsel, tone: "" },
            cur.rec.lastHearing && { title: "Last hearing", meta: fmt.date(cur.rec.lastHearing), tone: "" },
            { title: "Status", meta: cur.rec.rawStatus || cur.rec.status || "—", tone: "amber" },
            cur.rec.nextHearing && { title: "Next hearing", meta: fmt.date(cur.rec.nextHearing), tone: "red" },
          ].filter(Boolean)} />
        </${Section}>`}
      </div>
    </div>
    ${doc && html`<${DocViewerModal} c=${null} files=${doc.files} index=${doc.i} onIndex=${(i) => setDoc({ ...doc, i })} onClose=${() => setDoc(null)} />`}
  </div>`;
}
