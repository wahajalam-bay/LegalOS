// RecordWorkspace — the ONE full-page record detail shell for every non-contract
// Legal record (litigation case, licence, loan, resolution, property, notice).
// It mirrors the vetted Contract Workspace exactly: breadcrumb/back, header with
// ID + status/risk/type/category pills + title + party sub-line + actions, a
// lifecycle Stepper, tabs (Overview / Documents / Related / Timeline), and a
// two-column body with a right rail (record review, key facts, documents,
// source). Config-driven per kind so contracts, litigation, compliance,
// projects all feel like one Legal ERP. Contracts keep their own richer
// ContractWorkspace; this covers everything else identically.
import { html, cx, fmt, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Risk, Status, Tabs, Stepper, AICard, Timeline, Section } from "../ui.js";
import { PageHead } from "../parts.js";
import { navigate } from "../router.js";
import { useRegister, findByIdOrLegacy } from "../live.js";
import { normEntity } from "../graph.js";
import { LegalDocuments } from "../legaldocuments.js";
import { RaiseCase } from "../raisecase.js";
import { LogHearing } from "../loghearing.js";
import { RecordDecision } from "../recorddecision.js";
import { OUTCOME_TONE } from "../litigationmodel.js";
import { ModuleRecordOrigin } from "../modulerecordactions.js";
import { CaseActions, CasePanels, CaseLinks } from "../caseactions.js";
import { CaseInvoices } from "../caseinvoices.js";
import { invalidateRegister } from "../live.js";

const money = (v, cur) => (Number(v) > 0 ? fmt.money(v, cur || "PKR") : "");

/* A MONEY FIGURE, IN BOTH CURRENCIES.
   Exposure and Recoverable are carried in PKR and USD as separate columns, and
   a case raised in the app fills only the one the user typed -- so the card
   read "Recoverable PKR 10.0K" and said nothing about what that is in dollars,
   which is the figure anybody reporting upward needs. The server derives the
   missing side from the configured rate and records WHICH side it derived, so
   the entered figure leads and the derived one follows it, labelled with the
   rate it came from. A derived number is never allowed to look like one
   somebody entered. */
const bothMoney = (pkr, usd, cur, r) => {
  const has = (v) => Number(v) > 0;
  const conv = (r && r.converted) || null;
  const derived = new Set((conv && conv.fields) || []);
  const isDerived = (k) => derived.has(k);
  const parts = [];
  if (has(pkr)) parts.push({ t: fmt.money(pkr, cur || "PKR"), d: isDerived("exposurePKR") || isDerived("recoverablePKR") });
  if (has(usd)) parts.push({ t: fmt.money(usd, "USD"), d: isDerived("exposureUSD") || isDerived("recoverableUSD") });
  if (!parts.length) return "";
  parts.sort((a, b) => Number(a.d) - Number(b.d));
  const rate = conv ? " at PKR " + conv.pkrPerUsd + "/USD" + (conv.asOf ? " (" + conv.asOf + ")" : "") : "";
  const shown = parts.map((x, i) => (i === 0 ? x.t : " ≈ " + x.t + (x.d ? rate : ""))).join("");
  /* Only one currency AND no approved rate to convert with: say which it is,
     rather than leaving the reader to wonder whether the other figure is zero
     or simply absent. */
  const fx = (r && r.fx) || null;
  if (parts.length === 1 && fx && fx.available === false) return shown + " · conversion pending";
  return shown;
};
const dt = (v) => (v ? fmt.date(v) : "");
const closedish = (r) => /closed|disposed|settled|decided|withdraw|dismiss|complet/i.test((r.rawStatus || r.status || ""));

/* A case that came from the tracker has no event log, so its history is
   assembled from the two things that DO carry dates: the tracker's own
   columns, and the date each linked document was last touched in Drive. The
   documents are what actually happened -- a plaint, an order, a reply -- so
   they belong on the timeline beside the tracker's dates, newest first. No
   date is invented and no document is renamed. */
function trackerTimeline(r) {
  const dated = [], undated = [];
  const push = (at, e) => { if (at) dated.push({ at: String(at), e }); else undated.push(e); };
  if (r.filed) push(r.filed, { title: "Case filed", meta: fmt.date(r.filed), tone: "gray" });
  if (r.lastHearing) push(r.lastHearing, { title: "Last date of hearing", meta: fmt.date(r.lastHearing) });
  if (r.nextHearing) push(r.nextHearing, { title: "Next hearing", meta: fmt.date(r.nextHearing), tone: "red" });
  if (r.closedDate) push(r.closedDate, { title: "Closed", meta: fmt.date(r.closedDate), tone: "red" });
  for (const f of (r.driveFiles || [])) {
    if (!f || !f.name) continue;
    push(f.modifiedTime, { title: "Document on file", tone: "gray",
      meta: [f.name, f.modifiedTime && fmt.date(f.modifiedTime)].filter(Boolean).join(" · ") });
  }
  if (r.counsel && r.counsel !== "—") undated.push({ title: "Counsel engaged", meta: r.counsel });
  undated.push({ title: "Status", meta: r.rawStatus || r.status || "—", tone: "amber" });
  dated.sort((a, b) => b.at.localeCompare(a.at));
  return dated.map((d) => d.e).concat(undated);
}

// Per-kind configuration. `facts` are [label, value] pairs (value can be a fn).
const CFG = {
  litigation: {
    reg: "litigation", label: "Litigation case", icon: "gavel", back: ["/litigation", "Litigation"], catPill: "Litigation",
    title: (r) => r.caseName || r.title, party: (r) => [r.entity, r.court, money(r.exposure, r.currency)].filter(Boolean).join(" · "),
    typePill: (r) => r.type, stages: ["Filed", "In Progress", "Hearing", "Judgment", "Closed"], stageIdx: (r) => closedish(r) ? 4 : (r.nextHearing ? 2 : 1),
    entityOf: (r) => r.entity, primary: ["calendar", "Log hearing"],
    facts: [["Case no", (r) => r.caseNo], ["Nature", (r) => r.type], ["Court / forum", (r) => r.court], ["Entity", (r) => r.entity], ["Position", (r) => r.position], ["Counsel", (r) => (r.counsel && r.counsel !== "—" ? r.counsel : "")], ["Filed", (r) => dt(r.filed)], ["Last hearing", (r) => dt(r.lastHearing)], ["Next hearing", (r) => dt(r.nextHearing)], ["Exposure", (r) => bothMoney(r.exposurePKR != null && r.exposurePKR !== "" ? r.exposurePKR : r.exposure, r.exposureUSD, r.currency, r)],
      ["Recoverable", (r) => bothMoney(r.recoverablePKR != null && r.recoverablePKR !== "" ? r.recoverablePKR : r.recoverable, r.recoverableUSD, "PKR", r)]],
    review: (r) => `A ${String(r.type || "dispute").toLowerCase()} matter${r.court ? " before " + r.court : ""}${money(r.exposure, r.currency) ? " carrying exposure of " + money(r.exposure, r.currency) : ""}. ${r.nextHearing ? "Next hearing is " + fmt.date(r.nextHearing) + "." : "No next hearing is recorded."}`,
    summary: (r) => (r.proceedings || r.opinion) ? html`${r.proceedings || ""}${r.opinion ? html`<br /><br /><b>Opinion:</b> ${r.opinion}` : ""}` : null,
    /* A case raised in LegalOS has a REAL event log — who raised it, what was
       attached, every hearing and order since. Show that. A tracker row has
       none, so it keeps the timeline assembled from the dates it does carry. */
    timeline: (r) => ((r.caseTimeline || []).length
      ? r.caseTimeline.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).map((e) => ({
        title: e.kind, meta: [e.text, e.byName, fmt.date(e.occurredOn || e.at)].filter(Boolean).join(" · "),
        tone: /closed|deadline/i.test(e.kind) ? "red" : /raised|document/i.test(e.kind) ? "gray" : "amber",
      }))
      : trackerTimeline(r)),
  },
  licence: {
    reg: "licences", label: "Licence", icon: "shield", back: ["/compliance", "Compliance"], catPill: "Licence",
    title: (r) => (r.authority ? r.authority + " · " : "") + (r.entity || r.number || "Licence"), party: (r) => [r.entity, r.number].filter(Boolean).join(" · "),
    typePill: (r) => r.authority, stages: ["Applied", "Issued", "Valid", "Renewal due", "Expired"], stageIdx: (r) => { const d = r.daysToExpiry; return d == null ? 2 : d < 0 ? 4 : d < 90 ? 3 : 2; },
    entityOf: (r) => r.entity, primary: ["refresh", "Renew"],
    facts: [["Entity", (r) => r.entity], ["Authority", (r) => r.authority], ["Number", (r) => r.number], ["Status", (r) => r.status], ["Issued", (r) => dt(r.issued)], ["Expiry", (r) => dt(r.expiry)]],
    review: (r) => `${r.authority || "Licence"} for ${r.entity || "the entity"}. ${r.daysToExpiry == null ? "No expiry recorded." : r.daysToExpiry < 0 ? "Expired — renewal required." : r.daysToExpiry < 90 ? "Expiring within 90 days — schedule renewal." : "Valid."}`,
    timeline: (r) => [r.issued && { title: "Issued", meta: fmt.date(r.issued), tone: "gray" }, { title: "Status", meta: r.status || "—", tone: "amber" }, r.expiry && { title: "Expiry", meta: fmt.date(r.expiry), tone: (r.daysToExpiry != null && r.daysToExpiry < 90) ? "red" : "" }].filter(Boolean),
  },
  loan: {
    reg: "loans", label: "Loan", icon: "dollar", back: ["/compliance", "Compliance"], catPill: "Loan",
    title: (r) => (r.borrower || "Loan") + (r.lender ? " ← " + r.lender : ""), party: (r) => [r.ref, money(r.amount, r.currency)].filter(Boolean).join(" · "),
    typePill: (r) => r.currency || "Loan", stages: ["Agreed", "Disbursed", "Active", "Repaid"], stageIdx: (r) => /repaid|closed|settled|matured/i.test(r.status || "") ? 3 : 2,
    entityOf: (r) => r.borrower, primary: null,
    facts: [["Borrower", (r) => r.borrower], ["Lender", (r) => r.lender], ["Amount", (r) => money(r.amount, r.currency)], ["Reference", (r) => r.ref], ["Agreement date", (r) => dt(r.agreementDate)], ["Repayment", (r) => dt(r.repaymentDate)], ["Term", (r) => r.term], ["Interest", (r) => r.interest], ["Status", (r) => r.status]],
    review: (r) => `Loan${money(r.amount, r.currency) ? " of " + money(r.amount, r.currency) : ""} from ${r.lender || "the lender"} to ${r.borrower || "the borrower"}.`,
    timeline: (r) => [r.agreementDate && { title: "Agreement", meta: fmt.date(r.agreementDate), tone: "gray" }, { title: "Status", meta: r.status || "—", tone: "amber" }, r.repaymentDate && { title: "Repayment due", meta: fmt.date(r.repaymentDate), tone: "red" }].filter(Boolean),
  },
  resolution: {
    reg: "resolutions", label: "Resolution", icon: "checksquare", back: ["/compliance", "Compliance"], catPill: "Resolution",
    title: (r) => r.agenda || ("Resolution " + (r.docNo || "")), party: (r) => [r.entity, dt(r.date)].filter(Boolean).join(" · "),
    typePill: (r) => "Board resolution", stages: ["Proposed", "Passed", "Filed"], stageIdx: () => 1,
    entityOf: (r) => r.entity, primary: null,
    facts: [["Agenda", (r) => r.agenda], ["Document No", (r) => r.docNo], ["Entity", (r) => r.entity], ["Date", (r) => dt(r.date)]],
    review: (r) => `Board resolution for ${r.entity || "the entity"}${r.date ? " dated " + fmt.date(r.date) : ""}.`,
    timeline: (r) => [r.date && { title: "Passed", meta: fmt.date(r.date), tone: "gray" }].filter(Boolean),
  },
  property: {
    reg: "properties", label: "Property", icon: "building", back: ["/projects", "Project Documents"], catPill: "Property",
    title: (r) => r.project || r.address || "Property", party: (r) => [r.entity, r.city].filter(Boolean).join(" · "),
    typePill: (r) => "Project property", stages: ["Acquired", "Documented", "Active"], stageIdx: () => 2,
    entityOf: (r) => r.entity, primary: null,
    facts: [["Project", (r) => r.project], ["Entity", (r) => r.entity], ["City", (r) => r.city], ["Address", (r) => r.address], ["Ownership", (r) => (r.ownership != null && r.ownership !== "" ? String(r.ownership) : "")], ["JV", (r) => r.jv], ["Value", (r) => money(r.value, r.currency)], ["Contractor", (r) => r.contractor], ["Status", (r) => r.status]],
    review: (r) => `Property under ${r.project || "the project"}${r.city ? " in " + r.city : ""}, held by ${r.entity || "the entity"}.`,
    timeline: (r) => [r.start && { title: "Agreement / allotment", meta: fmt.date(r.start), tone: "gray" }, { title: "Status", meta: r.status || "—", tone: "amber" }].filter(Boolean),
  },
  notice: {
    reg: "notices", label: "Legal notice", icon: "mail", back: ["/litigation", "Litigation"], catPill: "Notice",
    title: (r) => (r.sender || "?") + " → " + (r.recipient || "?"), party: (r) => [r.category, dt(r.noticeDate)].filter(Boolean).join(" · "),
    typePill: (r) => r.category || "Notice", stages: ["Drafted", "Sent", "Reply awaited", "Resolved"], stageIdx: (r) => /resolv|closed|settled/i.test(r.status || "") ? 3 : (r.replyDate ? 3 : r.noticeDate ? 1 : 0),
    entityOf: (r) => r.recipient, primary: null,
    /* The last five are recorded here, not in the trackers, so they are blank
       on a tracker row and the `facts` filter drops them rather than printing
       an empty label. */
    facts: [["Direction", (r) => r.direction], ["Sender", (r) => r.sender], ["Recipient", (r) => r.recipient], ["Entity", (r) => r.entity], ["Category", (r) => r.category], ["Date on notice", (r) => dt(r.noticeDate)], ["Date received", (r) => dt(r.receiptDate)], ["Response required", (r) => r.responseRequired], ["Response deadline", (r) => dt(r.replyDeadline)], ["Reply date", (r) => dt(r.replyDate)], ["Owner", (r) => r.owner], ["Status", (r) => r.status], ["Details", (r) => r.details], ["Notes", (r) => r.comments]],
    review: (r) => `Legal notice${r.category ? " (" + r.category + ")" : ""} between ${r.sender || "—"} and ${r.recipient || "—"}.`,
    timeline: (r) => [r.noticeDate && { title: "Notice sent", meta: fmt.date(r.noticeDate), tone: "gray" }, r.receiptDate && { title: "Received", meta: fmt.date(r.receiptDate) }, r.replyDeadline && { title: "Response due", meta: fmt.date(r.replyDeadline), tone: "red" }, r.replyDate && { title: "Reply received", meta: fmt.date(r.replyDate) }, { title: "Status", meta: r.status || "—", tone: "amber" }].filter(Boolean),
  },
};
export const RECORD_KINDS = new Set(Object.keys(CFG));

export default function RecordWorkspace({ kind, id }) {
  const cfg = CFG[kind];
  const [nonce, setNonce] = useState(0);
  const reg = useRegister(cfg ? cfg.reg : "litigation", nonce);
  const [tab, setTab] = useState("overview");
  const [raising, setRaising] = useState(null);   // {type,id,label} when escalating into a case
  const [hearing, setHearing] = useState(false);
  const [deciding, setDeciding] = useState(false);
  if (!cfg) return html`<div class="page"><div class="empty" style="padding:44px">Unknown record type.</div></div>`;
  /* By id, or by an id this record used to have before it was merged. */
  const r = findByIdOrLegacy(reg.rows || [], id);
  if (reg.loading && !r) return html`<div class="page page--wide fade-in"><${PageHead} title=${cfg.label} sub="Loading from Drive…" /></div>`;
  if (!r) return html`<div class="page"><div class="row" style="margin-bottom:14px"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate(cfg.back[0])}>${cfg.back[1]}</${Btn}></div><div class="empty" style="padding:44px"><${Icon} name=${cfg.icon} size=34 /><div>${cfg.label} not found.</div></div></div>`;

  /* Documents filed WITH the case are not Drive files and would otherwise be
     invisible: the Documents tab reads driveFiles, and an upload has no Drive
     id. They are folded in here with a link that streams them back. */
  const uploads = (r.caseDocuments || []).filter((d) => d && d.uploadId && !d.driveFileId).map((d) => ({
    id: d.uploadId, name: d.name, mimeType: /\.pdf$/i.test(d.name || "") ? "application/pdf" : "",
    folderPath: "Raised with this case", webViewLink: "", size: 0,
    uploadUrl: "/api/litigation/upload/" + d.uploadId, via: "uploaded",
  }));
  const files = (r.driveFiles || []).concat(uploads);
  const facts = cfg.facts.map(([l, f]) => [l, f(r)]).filter(([, v]) => v != null && v !== "");
  const ent = cfg.entityOf(r);
  const summary = cfg.summary && cfg.summary(r);
  const tabs = [
    { key: "overview", label: "Overview", icon: "info" },
    { key: "documents", label: "Documents", icon: "file", count: files.length },
    /* WHAT THIS MATTER HAS COST, on the matter itself.
       Only for litigation, and only where the case is one LegalOS can hold
       invoices against -- a tracker row is a record of a case, not a ledger. */
    ...(kind === "litigation" && r.raisedInApp
      ? [{ key: "invoices", label: "Invoices", icon: "dollar", count: (r.invoices || []).length }]
      : []),
    { key: "timeline", label: "Timeline", icon: "activity" },
  ];

  return html`<div class="page page--wide fade-in">
    ${raising && html`<${RaiseCase} moduleKey="cases" moduleLabel="Litigation & Disputes" source=${raising}
      onClose=${() => setRaising(null)} onCreated=${() => { setRaising(null); invalidateRegister("litigation"); }} />`}
    ${hearing && html`<${LogHearing} caseId=${r.id} record=${r} onClose=${() => setHearing(false)}
      onDone=${() => { setHearing(false); invalidateRegister("litigation"); setNonce((n) => n + 1); }} />`}
    ${deciding && html`<${RecordDecision} caseId=${r.id} record=${r} onClose=${() => setDeciding(false)}
      onDone=${() => { setDeciding(false); invalidateRegister("litigation"); setNonce((n) => n + 1); }} />`}
    <div class="row" style="margin-bottom:14px"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate(cfg.back[0])}>${cfg.back[1]}</${Btn}></div>
    <div class="pagehead" style="margin-bottom:16px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px"><span class="mono muted">${r.id}</span>${r.status && html`<${Status} value=${r.status} />`}${r.risk && html`<${Risk} level=${r.risk} />`}${cfg.typePill(r) && html`<${Pill} tone="gray">${cfg.typePill(r)}</${Pill}>`}<${Pill} tone="blue">${cfg.catPill}</${Pill}></div>
        <h1 class="pagehead__title">${cfg.title(r)}</h1>
        <div class="pagehead__sub">${cfg.party(r)}</div>
      </div>
      <div class="pagehead__actions">
        <${Btn} variant="ghost" icon="download">Export</${Btn}>
        ${ent && html`<${Btn} variant="ghost" icon="building" onClick=${() => navigate("/companies/" + encodeURIComponent(normEntity(ent)))}>Entity</${Btn}>`}
        ${/* A notice that escalates should not be retyped as a case. This
              carries its parties, subject, dates and documents across. */
          kind === "notice" && html`<${Btn} variant="primary" icon="gavel"
            onClick=${() => setRaising({ type: "notice", id: r.id, label: "legal notice " + (r.ref || r.id) })}>Raise a case</${Btn}>`}
        ${/* A case must be runnable from its own page: heard, chased, amended
              and closed. Without these the register is a list nobody updates
              after the day the case opened. */
          kind === "litigation" && r.raisedInApp && html`<${CaseActions} record=${r} onChanged=${() => { invalidateRegister("litigation"); setNonce((n) => n + 1); }} />`}
        ${/* EVERY case can be decided, not only the one raised in this app.
              The tracker cases are read-only, so the decision is recorded as
              an overlay — see api/case-outcomes.js. Without this the whole
              book reported "outcome not recorded" and there was no action
              anywhere in the product that could change it. */ ""}
        ${kind === "litigation" && !r.raisedInApp && html`<${Fragment}>
          <${Btn} variant="ghost" icon="calendar" onClick=${() => setHearing(true)}>Log hearing</${Btn}>
          <${Btn} variant="primary" icon="gavel" onClick=${() => setDeciding(true)}>
            ${r.outcomeCode ? "Correct the decision" : "Record the decision"}</${Btn}>
        </${Fragment}>`}
        ${cfg.primary && kind !== "litigation" && kind !== "notice" && html`<${Btn} variant="primary" icon=${cfg.primary[0]}>${cfg.primary[1]}</${Btn}>`}
      </div>
    </div>

    <div class="card card--pad" style="margin-bottom:16px"><${Stepper} steps=${cfg.stages} current=${cfg.stageIdx(r)} /></div>

    <div class="card" style="margin-bottom:16px"><div style="padding:6px 18px 0"><${Tabs} active=${tab} onChange=${setTab} tabs=${tabs} /></div></div>

    <div class="grid" style="grid-template-columns:minmax(0,1fr) 330px;align-items:start;gap:16px">
      <div class="card"><div class="card__body">
        ${tab === "overview" && html`<div class="col" style="gap:16px">
          ${/* THE DECISION LEADS THE RECORD.
                A decided case showed a grey "Closed" pill in the header and
                nothing else: the result, the date it was given, what was
                decided, the order it came from and who recorded it were all on
                file and none of them was on the page. It is the single most
                reportable fact a litigation department holds, so it sits above
                the register details rather than behind an edit dialog. */ ""}
          ${kind === "litigation" && r.outcomeCode && html`<div class="card card--pad col" style="gap:12px">
            <div class="row" style="gap:10px;align-items:center">
              <${Icon} name="gavel" size=15 />
              <span class="strong" style="font-size:14px">Decision</span>
              <${Pill} tone=${OUTCOME_TONE[r.outcomeCode] || "gray"}>${r.outcomeCode}</${Pill}>
              <div class="spacer"></div>
              ${r.decisionDate && html`<span class="tiny muted">given ${fmt.date(r.decisionDate)}</span>`}
            </div>
            ${r.outcomeSummary && html`<div style="font-size:13px;line-height:1.55">${r.outcomeSummary}</div>`}
            <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px">
              ${r.judgmentRef && html`<div><div class="tiny muted">Judgment / order</div>
                <div class="strong" style="font-size:13px;margin-top:3px">${r.judgmentRef}</div></div>`}
              ${r.finalNotes && html`<div><div class="tiny muted">Final notes</div>
                <div style="font-size:13px;margin-top:3px;line-height:1.5">${r.finalNotes}</div></div>`}
            </div>
            <div class="tiny muted" style="border-top:1px solid var(--border);padding-top:9px">
              Recorded${r.outcomeRecordedBy ? " by " + r.outcomeRecordedBy : ""}${r.outcomeRecordedAt ? " on " + fmt.date(r.outcomeRecordedAt) : ""}.
              Nothing in LegalOS reads a result out of the tracker's status text — this was entered by a person.
            </div>
          </div>`}
          <div class="card card--pad">
            <div class="row" style="margin-bottom:14px"><div class="strong" style="font-size:14px">${cfg.label} details</div><div class="spacer"></div><span class="tiny muted">from the register</span></div>
            <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 20px">
              ${facts.map(([l, v]) => html`<div key=${l}><div class="tiny muted">${l}</div><div class="strong" style="font-size:13px;margin-top:3px;overflow-wrap:break-word">${v}</div></div>`)}
            </div>
          </div>
          ${summary && html`<${AICard} title="Summary">${summary}</${AICard}>`}

          ${/* A notice or a property that became litigation says so here, and
                links straight through to the matter. */
            kind !== "litigation" && html`<${CaseLinks} type=${kind === "notice" ? "notice" : kind} id=${r.id} />`}

          ${kind === "litigation" && html`<${CasePanels} record=${r}
            onChanged=${() => { invalidateRegister("litigation"); setNonce((n) => n + 1); }} />`}

          ${/* Parties, properly modelled. Litigation routinely has more than
                two sides, and a co-defendant squeezed into a free-text field is
                a party nobody can filter on. */
            (r.caseParties || []).length > 0 && html`<div class="card card--pad">
            <div class="strong" style="font-size:14px;margin-bottom:10px">Parties</div>
            ${r.caseParties.map((p, i) => html`<div key=${i} class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1"><div class="strong" style="font-size:13px">${p.name}</div>
                ${p.counsel && html`<div class="tiny muted">Counsel: ${p.counsel}</div>`}</div>
              <${Pill} tone=${p.isUs ? "blue" : "gray"}>${p.role}</${Pill}>
              ${p.isUs && html`<${Pill} tone="green">us</${Pill}>`}
            </div>`)}
          </div>`}

          ${/* Deadlines are objects, not dates buried in a note — nothing
                watches a plain date. */
            (r.caseDeadlines || []).length > 0 && html`<div class="card card--pad">
            <div class="strong" style="font-size:14px;margin-bottom:10px">Dates & deadlines</div>
            ${r.caseDeadlines.map((d, i) => {
              const days = Math.ceil((new Date(d.dueDate) - Date.now()) / 86400000);
              const tone = days < 0 ? "red" : days <= 14 ? "amber" : "gray";
              return html`<div key=${i} class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                <div style="flex:1"><div class="strong" style="font-size:13px">${d.kind}</div>
                  ${d.note && html`<div class="tiny muted">${d.note}</div>`}</div>
                <span class="tiny">${fmt.date(d.dueDate)}</span>
                <${Pill} tone=${tone}>${days < 0 ? Math.abs(days) + "d overdue" : days + "d"}</${Pill}>
              </div>`;
            })}
          </div>`}

          ${/* Where this case came from, and what it is still attached to. */
            r.raisedInApp && html`<div class="card card--pad">
            <div class="strong" style="font-size:14px;margin-bottom:8px">Origin</div>
            <div class="tiny muted">${kind === "notice" ? "Recorded" : "Raised"} in LegalOS${r.raisedBy && r.raisedBy.name ? " by " + r.raisedBy.name : ""}${r.raisedAt ? " on " + fmt.date(r.raisedAt) : ""}.
              The Drive tracker remains the system of record for imported ${kind === "notice" ? "notices" : "cases"}.</div>
            ${/* WHO CHANGED IT, AND WHO REMOVED IT.
                  A case that was deleted used to show only that it was raised
                  by somebody — the deletion, its author and its reason lived in
                  the audit log where nobody looking at the case would see them.
                  Deleting does not clear the creator; both are here. */ ""}
            ${r.updatedBy && r.updatedBy.name && html`<div class="tiny muted" style="margin-top:6px">
              Last updated by ${r.updatedBy.name}${r.updatedAt ? " on " + fmt.date(r.updatedAt) : ""}.</div>`}
            ${r.deletedAt && html`<div class="tiny" style="margin-top:8px;color:var(--danger-text)">
              <strong>Deleted</strong>${r.deletedBy && r.deletedBy.name ? " by " + r.deletedBy.name : ""} on ${fmt.date(r.deletedAt)}.
              ${r.deletionReason ? html`<div style="margin-top:2px">Reason: ${r.deletionReason}</div>` : null}</div>`}
            ${!r.deletedAt && r.restoredAt && html`<div class="tiny muted" style="margin-top:6px">
              Restored${r.restoredBy && r.restoredBy.name ? " by " + r.restoredBy.name : ""} on ${fmt.date(r.restoredAt)}${r.deletionReason ? html` — previously deleted: ${r.deletionReason}` : null}.</div>`}
            ${/* A notice recorded here can be taken off the register with a
                  reason, exactly as a case can. The audit behind it was built
                  and never wired to a screen, so a notice raised by mistake
                  stayed on the register for good. A tracker notice is not
                  offered this -- it belongs to the workbook. */ ""}
            ${kind === "notice" && !r.deletedAt && html`<div style="margin-top:10px">
              <${ModuleRecordOrigin} moduleKey="notices"
                record=${{ id: r.id, origin: "LEGALOS", createdBy: r.raisedBy }}
                label=${(r.sender || "?") + " → " + (r.recipient || "?")}
                onRequested=${() => { invalidateRegister("notices"); setNonce((n) => n + 1); }} />
            </div>`}
            ${/* §86 — business language. "Raised from an incomplete source" is
                  the pipeline describing itself; what the reader needs to know
                  is that the record has gaps and where they are. */ ""}
            ${r.dataQuality && r.dataQuality !== "COMPLETE" && html`<div class="tiny" style="color:var(--warning-text);margin-top:6px">
              ${r.dataQuality === "NEEDS_INFORMATION"
                ? "Some details on this record are still missing."
                : "Some details are missing — the register this came from did not fill them in."}</div>`}
            ${(() => { const L = r.caseLinks || {}; const kv = Object.entries(L).filter(([, v]) => v && (!Array.isArray(v) || v.length));
              return kv.length ? html`<div class="tiny muted" style="margin-top:6px">Linked to ${kv.map(([k, v]) => k.replace(/Id$/, "") + " " + (Array.isArray(v) ? v.join(", ") : v)).join(" · ")}</div>` : null; })()}
          </div>`}
        </div>`}
        ${tab === "documents" && html`<${LegalDocuments} files=${files} recordType=${kind} record=${r} />`}
        ${tab === "invoices" && html`<${CaseInvoices} record=${r}
          onChanged=${() => { invalidateRegister("litigation"); setNonce((n2) => n2 + 1); }} />`}
        ${tab === "timeline" && html`<${Section} title="Timeline" icon="activity" bodyClass="col"><${Timeline} items=${cfg.timeline(r)} /></${Section}>`}
      </div></div>

      <div class="col" style="gap:16px;position:sticky;top:16px">
        <${AICard} title=${cfg.label + " review"}>${cfg.review(r)}</${AICard}>
        <div class="card card--pad col" style="gap:12px">
          <span class="strong">Key facts</span>
          ${facts.slice(0, 9).map(([l, v]) => html`<div key=${l} class="row" style="font-size:12.5px;gap:12px"><span class="muted" style="flex:none">${l}</span><span class="spacer"></span><span class="strong" style="text-align:right;min-width:0;overflow-wrap:break-word">${v}</span></div>`)}
        </div>
        <div class="card card--pad col" style="gap:8px">
          <div class="row"><span class="strong">Documents</span><div class="spacer"></div><${Pill} tone=${files.length ? "indigo" : "gray"}>${files.length}</${Pill}></div>
          ${files.length ? html`<button class="tiny" style="color:var(--brand);font-weight:600;text-align:left;background:none;border:0;cursor:pointer" onClick=${() => setTab("documents")}>View ${files.length} document${files.length === 1 ? "" : "s"} →</button>` : html`<span class="tiny muted">No documents linked.</span>`}
        </div>
        ${r.__source && html`<div class="card card--pad col" style="gap:8px"><span class="strong">Source</span><div class="tiny muted" style="word-break:break-word">${(r.__source.file || "").replace(/\.xlsx?$/i, "")}${r.__source.sheet ? " · " + r.__source.sheet : ""}</div></div>`}
      </div>
    </div>
  </div>`;
}
