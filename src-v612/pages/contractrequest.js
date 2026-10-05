// ONE CONTRACT REQUEST — the wizard while it is the requester's, the review
// view once it is somebody else's.
//
// The same record renders four ways because four people need different things
// from it: the requester fills it in, the HOD decides on it, Finance decides on
// the money, and Legal takes it in. None of them sees a different record and
// none of them re-uploads a document.
import { html, cx, fmt, useState, useEffect, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Section, Empty, Field, Input, Modal, Tabs, DateInput } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { createDraft } from "../store.js";
import { M3_AGREEMENT_TYPES, M3_JURISDICTIONS } from "../contracts3.js";
import { CrfField, CrfGrid } from "../crf/fields.js";
import { visibleFields, isBlank } from "../crf/rules.js";
import { useAutosave, SaveBadge, Attachments, DocRow, STEP_LABELS } from "../crf/wizard.js";

const STATUS_TONE = {
  Draft: "gray", Submitted: "blue", "HOD Approval": "amber", "Finance Review": "amber",
  "Legal Intake": "indigo", "Returned to Requester": "red", "Accepted & Assigned": "green",
  "In Drafting": "purple", Closed: "green", "HOD Rejected": "red",
};

export default function ContractRequest({ id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [nonce, setNonce] = useState(0);
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState("overview");
  const [local, setLocal] = useState({});

  const reload = () => api.crf.get(id).then((x) => { setD(x); setLocal(x.request.values || {}); },
    (e) => setErr((e.payload && e.payload.detail) || e.message || "This request could not be opened."));
  useEffect(() => { reload(); }, [id, nonce]);

  const editable = !!(d && d.permissions && d.permissions.edit);
  const { save, saveState, error: saveErr, flushNow } = useAutosave(id, editable);

  if (err) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Contract request" />
      <${Empty} icon="alertTriangle" title="Not found, or not yours to read" text=${err}
        action=${html`<${Btn} variant="primary" onClick=${() => navigate("/contract-requests")}>Contract requests</${Btn}>`} />
    </div>`;
  }
  if (!d) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Contract request" />
      <div class="tiny muted" style="padding:20px 2px">Opening…</div></div>`;
  }

  const { request: r, schema, assessment: a, permissions: perms, documents, summary } = d;
  const setSection = (key, value) => { setLocal((v) => Object.assign({}, v, { [key]: value })); save(key, value); };
  const problemsFor = (secKey) => a.problems.filter((p) => p.section === secKey);

  /* Only the requester filling it in gets the stepper. Everyone else reads. */
  const wizard = editable;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${schema.label}
      sub=${[r.id, r.legal.reference, summary.department].filter(Boolean).join(" · ")}
      actions=${html`<${Fragment}>
        ${wizard && html`<${SaveBadge} state=${saveState} error=${saveErr} />`}
        <${Btn} variant="ghost" icon="arrowLeft" onClick=${() => navigate("/contract-requests")}>All requests</${Btn}>
      </${Fragment}>`} />

    <div class="row wrap" style="gap:8px;margin-bottom:12px;align-items:center">
      <${Pill} tone=${STATUS_TONE[r.status] || "gray"} dot=${true}>${r.status}</${Pill}>
      ${summary.priority === "Urgent" && html`<${Pill} tone="red">Urgent</${Pill}>`}
      ${r.escalated && html`<${Pill} tone="red" dot=${true}>Escalated</${Pill}>`}
      ${a.financeRequired && html`<${Pill} tone="amber">Finance review required</${Pill}>`}
      ${a.deviations.length > 0 && html`<${Pill} tone="purple">${a.deviations.length} non-standard term${a.deviations.length === 1 ? "" : "s"}</${Pill}>`}
      <${Pill} tone=${summary.attachmentsComplete ? "green" : "red"}>
        ${summary.mandatoryDone} / ${summary.mandatoryTotal} mandatory documents</${Pill}>
      ${summary.slaStartedAt && html`<${Pill} tone=${summary.slaState === "overdue" ? "red" : summary.slaState === "at risk" ? "amber" : "green"}>
        SLA ${summary.slaState}${summary.targetDate ? " · target " + fmt.date(summary.targetDate) : ""}</${Pill}>`}
    </div>

    ${(r.returns || []).length > 0 && r.status === "Returned to Requester" && html`<div class="card card--pad"
      style="border-color:var(--danger);background:var(--danger-bg);margin-bottom:14px">
      <div class="strong tiny" style="margin-bottom:6px">Returned — this is what is needed</div>
      ${(() => { const last = r.returns[r.returns.length - 1]; return html`<div class="tiny">
        ${last.comment && html`<div style="margin-bottom:6px">${last.comment}</div>`}
        ${(last.missingFields || []).length > 0 && html`<div>Fields: ${last.missingFields.join(", ")}</div>`}
        ${(last.missingDocuments || []).length > 0 && html`<div>Documents: ${last.missingDocuments.join(", ")}</div>`}
        <div class="muted" style="margin-top:6px">Returned by ${(last.by && last.by.name) || "Legal"} on ${fmt.date(last.at)}</div>
      </div>`; })()}
    </div>`}

    ${/* WHERE THIS REQUEST IS, for everybody -- the requester filling it in as
          much as the approver deciding on it. */ ""}
    <${Stepper} r=${r} a=${a} />

    ${wizard
    ? html`<${Wizard} r=${r} schema=${schema} a=${a} values=${local} documents=${documents}
        step=${step} setStep=${setStep} setSection=${setSection} problemsFor=${problemsFor}
        onChanged=${() => { flushNow(); setNonce((n) => n + 1); }} />`
    : html`<${ReadView} d=${d} tab=${tab} setTab=${setTab} onChanged=${() => setNonce((n) => n + 1)} />`}
  </div>`;
}

/* ------------------------------------------------------- ONE WORKSPACE (§34)
 *
 * This was a seven-step wizard: Request, Parties, Commercial Terms, Legal
 * Terms, Attachments, Special Terms, Review, each one replacing the last. A
 * contract request is not a checkout flow. The person filling it in is
 * assembling a coherent picture of a deal, they move back and forth while they
 * do it, and a step that hides the other six makes that six page changes and a
 * lot of guessing about what is still outstanding.
 *
 * It is now ONE SCROLLABLE WORKSPACE with a sticky section rail. Every section
 * is on the page, in order; the rail says where you are, how many problems
 * each section still has, and jumps to it. Nothing is hidden, nothing is
 * gated, and "what is left to do" is answerable without navigating.
 */
function SectionRail({ sections, active, onJump }) {
  return html`<nav class="crfrail" aria-label="Request sections">
    ${sections.map((s) => html`<button key=${s.key} type="button"
      class=${cx("crfrailitem", active === s.key && "crfrailitem--on", s.problems && "crfrailitem--bad")}
      aria-current=${active === s.key ? "true" : undefined}
      onClick=${() => onJump(s.key)}>
      <span class="crfrailitem__l">${s.label}</span>
      ${s.problems > 0
        ? html`<span class="crfrailitem__b" title=${s.problems + " item" + (s.problems === 1 ? "" : "s") + " need attention"}>${s.problems}</span>`
        : html`<${Icon} name="check" size=12 style=${{ color: "var(--success)" }} />`}
    </button>`)}
  </nav>`;
}

function Wizard({ r, schema, a, values, documents, step, setStep, setSection, problemsFor, onChanged }) {
  /* The rail's entries, in the order the page renders them. `attachments` and
     `review` are not schema sections — they are rendered by their own
     components — so they are declared here rather than invented in the loop. */
  const blocks = [
    ...schema.sections.map((sec) => ({ kind: "schema", key: sec.key, label: sec.label, sec,
      problems: a.problems.filter((p) => p.section === sec.key).length })),
    { kind: "attachments", key: "attachments", label: "Documents",
      problems: a.problems.filter((p) => p.section === "attachments").length },
    { kind: "review", key: "review", label: "Review & submit", problems: 0 },
  ];
  const [active, setActive] = useState(blocks[0] ? blocks[0].key : "");

  /* WHERE YOU ARE, read from the page rather than from a step counter. The
     rail highlights whichever section is nearest the top of the viewport, so
     scrolling and clicking agree about the answer. */
  useEffect(() => {
    const el = document.querySelector(".content");
    if (!el) return undefined;
    const on = () => {
      let best = null, bestTop = Infinity;
      for (const b of blocks) {
        const node = document.getElementById("crfsec-" + b.key);
        if (!node) continue;
        const top = Math.abs(node.getBoundingClientRect().top - 120);
        if (top < bestTop) { bestTop = top; best = b.key; }
      }
      if (best) setActive(best);
    };
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [schema.key, blocks.length]);

  const jump = (key) => {
    const node = document.getElementById("crfsec-" + key);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(key);
  };

  return html`<div class="crfwork">
    <${SectionRail} sections=${blocks} active=${active} onJump=${jump} />
    <div class="col" style="gap:14px;min-width:0">
      <${TypeSwitch} r=${r} schema=${schema} onChanged=${onChanged} />
      ${blocks.map((b) => {
        if (b.kind === "attachments") {
          /* THE FORM DRAFTS THE CONTRACT, not just the read-only view of it.
             The drafting panel first went on the Documents tab of ReadView --
             which a request in Draft never reaches, because its author is
             still in this wizard. That put the feature everywhere except the
             screen the person filling the form is looking at. */
          const drafts = documents.filter((x) => x.docType === "Generated Draft");
          return html`<div key=${b.key} id=${"crfsec-" + b.key} class="col" style="gap:14px">
            <${DraftSection} r=${r} perms=${{ edit: true }} drafts=${drafts} onChanged=${onChanged} />
            <${Attachments} req=${r} docs=${documents.filter((x) => x.docType !== "Generated Draft")}
              assessment=${a} editable=${true} onChanged=${onChanged} />
          </div>`;
        }
        if (b.kind === "review") {
          return html`<div key=${b.key} id=${"crfsec-" + b.key}>
            <${Review} a=${a} setStep=${jump} r=${r} schema=${schema} onChanged=${onChanged} />
          </div>`;
        }
        const sec = b.sec;
        const scope = sec.grid ? null : (values[sec.key] || {});
        const probs = problemsFor(sec.key);
        return html`<div key=${b.key} id=${"crfsec-" + b.key}>
          <${Section} title=${sec.label} sub=${sec.hint} icon="file">
            ${sec.grid
              ? html`<${CrfGrid} columns=${sec.fields} rows=${values[sec.key] || []} problems=${probs}
                  noun=${sec.label} idPrefix=${sec.key}
                  onChange=${(rows) => setSection(sec.key, rows)} />`
              : html`<div class="crf__grid">
                  ${visibleFields(sec, scope).map((f) => html`<${CrfField} key=${f.key} f=${f}
                    value=${scope[f.key]} scope=${scope} allValues=${values} idPrefix=${sec.key}
                    problem=${probs.find((p) => p.field === f.key)}
                    onChange=${(v) => setSection(sec.key, Object.assign({}, scope, { [f.key]: v }))} />`)}
                </div>`}
          </${Section}>
        </div>`;
      })}

      <div class="crfbar">
        <span class="tiny muted">${a.ok
          ? "Everything this request needs is filled in."
          : a.problems.length + " item" + (a.problems.length === 1 ? "" : "s") + " still need attention — the rail marks which sections."}</span>
        <div class="spacer"></div>
        <${SubmitBtn} r=${r} a=${a} onChanged=${onChanged} />
      </div>
    </div>
  </div>`;
}

function SubmitBtn({ r, a, onChanged }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.crf.submit(r.id); toast("Submitted for approval", "success"); onChanged(); }
    catch (e) {
      const n = (e.payload && e.payload.problems || []).length;
      toast(n ? n + " items still need attention" : ((e.payload && e.payload.errors || []).join(" · ") || e.message), "error");
      onChanged();
    }
    setBusy(false);
  };
  return html`<${Btn} variant="primary" icon="check" disabled=${busy || !a.ok} onClick=${go}>
    ${busy ? "Submitting…" : a.ok ? "Submit request" : a.problems.length + " items need attention"}</${Btn}>`;
}

/* The review step: what is wrong, grouped, and every line jumps to its step. */
function Review({ a, setStep, r, schema }) {
  const bySection = {};
  for (const p of a.problems) (bySection[p.sectionLabel] = bySection[p.sectionLabel] || []).push(p);
  const stepOf = (secKey) => secKey;

  return html`<div class="col" style="gap:14px">
    <div class=${cx("card", "card--pad")} style=${a.ok ? "border-color:var(--success)" : "border-color:var(--danger)"}>
      <div class="row" style="gap:10px;align-items:center">
        <${Icon} name=${a.ok ? "checkcircle" : "alertTriangle"} size=20
          style=${{ color: a.ok ? "var(--success)" : "var(--danger)" }} />
        <div>
          <div class="strong">${a.ok ? "Ready to submit" : a.problems.length + " item" + (a.problems.length === 1 ? "" : "s") + " need attention"}</div>
          <div class="tiny muted">${a.financeRequired
    ? "Finance review is required because this request states an amount."
    : "No finance review is required — no amount has been stated."}</div>
        </div>
      </div>
    </div>

    ${!a.ok && Object.entries(bySection).map(([label, list]) => html`<div key=${label} class="card card--pad col" style="gap:6px">
      <div class="strong tiny">${label}</div>
      ${list.map((p, i) => html`<button key=${i} type="button" class="crfjump"
        onClick=${() => setStep(stepOf(p.section))}>
        <${Icon} name="alertCircle" size=12 /> ${p.label} ${p.message}
        <span class="spacer"></span><span class="tiny muted">Go to step ${stepOf(p.section)}</span>
      </button>`)}
    </div>`)}

    ${a.deviations.length > 0 && html`<${Section} title=${"Non-standard terms (" + a.deviations.length + ")"} icon="alertTriangle"
      sub="Legal sees these as a list. Special terms are mandatory because of them.">
      ${a.deviations.map((v, i) => html`<div key=${i} class="crfdev">
        <span class="tiny strong">${v.label}</span>
        <span class="tiny muted">standard: ${v.standardValue}</span>
        <${Icon} name="arrowRight" size=12 />
        <span class="tiny" style="color:var(--danger-text)">${v.selectedValue}</span>
      </div>`)}
    </${Section}>`}
  </div>`;
}

export { STATUS_TONE };

/* ------------------------------------------- the view everyone else gets -- */

/* Legal must not have to read a giant raw form, and the HOD must not have to
   navigate away to find out what was attached. Both get a summary, the terms,
   the deviations, the checklist and the documents on one screen -- and the
   actions their role actually has. */
/* PREPARE FIRST DRAFT (§31).
 *
 * ASSEMBLY, NOT GENERATION. The draft is built from an APPROVED template
 * structure and the PUBLISHED clause positions in the library; the only thing
 * written by the system is the connective recital, and that is marked as such
 * in the draft. Where the library holds no approved position for a section,
 * the draft says so and leaves the section empty — a gap a lawyer can see is
 * worth more than plausible text they might not check.
 *
 * NOTHING IS SENT. The output is a draft linked to this request, at status
 * Draft, requiring a named lawyer's approval before it is deliverable. There
 * is no path from this button to a counterparty.
 */
function PrepareDraft({ r, schema, onClose, onDone }) {
  const TYPE_MAP = {
    "CRF-10": "NDA",
    "CRF-03": "Customer / Service agreement",
    "CRF-06": "Customer / Service agreement",
    "CRF-07": "Customer / Service agreement",
    "CRF-01": "SaaS / technology agreement",
  };
  const suggested = TYPE_MAP[r.type] || "";
  const [agreementType, setAgreementType] = useState(suggested);
  const [jurisdiction, setJurisdiction] = useState("Pakistan");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const v = r.values || {};
  const counterpartyName = (v.counterparty && (v.counterparty.name || v.counterparty.legalName))
    || (v.parties && v.parties[0] && v.parties[0].name) || "";

  const go = () => {
    setBusy(true); setErr("");
    const res = createDraft({
      agreementType, jurisdiction,
      ourRole: "Customer",
      counterpartyName,
      /* The link back. A draft that does not know which request produced it is
         a document with no provenance, and the request is the only place the
         approved commercial terms live. */
      crfId: r.id,
    }, "u1");
    setBusy(false);
    if (!res || !res.ok) { setErr((res && res.error) || "The draft could not be assembled."); return; }
    toast("First draft assembled from the approved template — review it before anything leaves the building.", "success");
    onDone(res.id || (res.draft && res.draft.id));
  };

  return html`<${Modal} title="Prepare first draft" icon="sparkles" width=${660} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !agreementType} onClick=${go}>
        ${busy ? "Assembling…" : "Assemble draft"}</${Btn}>`}>
    <div class="col" style="gap:14px">
      <div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="alertCircle" size=15 />
        <div class="tiny">
          The draft is <strong>assembled</strong> from an approved template and the published clause
          positions — it is not written by a model. Where the library has no approved position the section
          is left empty and says so. It is created as a <strong>Draft</strong>, linked to this request, and
          a named lawyer has to approve it before it is deliverable. Nothing is sent to anyone.
        </div>
      </div>
      <${Field} label="Which approved template?"
        hint=${suggested ? "Suggested from the request type. Change it if the request is really something else." : "This request type has no default template — choose the closest approved one."}>
        <select class="input" value=${agreementType} onChange=${(e) => setAgreementType(e.target.value)}>
          <option value="">— select a template —</option>
          ${M3_AGREEMENT_TYPES.map((t) => html`<option key=${t} value=${t} selected=${agreementType === t}>${t}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Governing law" hint="Decides which published positions are used.">
        <select class="input" value=${jurisdiction} onChange=${(e) => setJurisdiction(e.target.value)}>
          ${M3_JURISDICTIONS.map((j) => html`<option key=${j} value=${j} selected=${jurisdiction === j}>${j}</option>`)}
        </select>
      </${Field}>
      ${counterpartyName && html`<div class="tiny muted">Counterparty on the request: <strong>${counterpartyName}</strong></div>`}
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
    </div>
  </${Modal}>`;
}


/* DRAFT THE CONTRACT ITSELF, from the approved template and this request.
 *
 * This is not the clause-position assembler above. It takes one of the 413
 * approved templates in the Drive library and fills the blanks its drafters
 * left -- "[●DEVELOPER]", "CNIC/NICOP: ______", "a monthly rent of Rupees ___
 * (PKR ___)" -- with the parties, dates and terms on this request. The clause
 * language is the template's, unchanged; only the blanks are touched.
 *
 * The coverage is shown BEFORE anything is generated, and every blank the
 * request cannot answer is listed with the reason. A draft that is two-thirds
 * filled says so, on this screen and on the document.
 */
const WHY = {
  REQUEST_FIELD_EMPTY: "the request leaves this field blank",
  NO_MAPPING_FOR_LABEL: "no field on this request matches this blank",
  NO_DATE_FIELD_FOR_LABEL: "the request holds no date for this",
  NO_MONEY_FIELD_FOR_LABEL: "the request holds no amount for this",
  NO_DURATION_FIELD_FOR_LABEL: "the request holds no period for this",
  NO_PERCENT_FIELD_FOR_LABEL: "the request holds no percentage for this",
  UNLABELLED_PLACEHOLDER: "the template does not say what belongs here",
  UNLABELLED_BLANK: "the template does not say what belongs here",
  DATE_SLOT_HAS_FIXED_MONTH_OR_YEAR_IN_TEMPLATE: "the template prints its own month and year beside this blank",
};
const whyOf = (x) => WHY[x] || (/^NO_COUNTERPARTY_(\d+)_ON_REQUEST$/.test(x)
  ? "the request names fewer counterparties than the template has party blocks"
  : "not filled");

function DraftFromTemplate({ r, onClose, onDone }) {
  const [lib, setLib] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [prev, setPrev] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.crf.draftTemplates(r.id)
      .then(setLib).catch((e) => setErr(e.message || "The template library could not be read."));
  }, [r.id]);

  useEffect(() => {
    if (!sel) { setPrev(null); return; }
    setLoading(true); setErr("");
    api.crf.draftPreview(r.id, sel)
      .then((p) => { setPrev(p); setLoading(false); })
      .catch((e) => { setErr((e.payload && e.payload.error) || e.message); setPrev(null); setLoading(false); });
  }, [sel, r.id]);

  const match = (t) => !q || (t.name || "").toLowerCase().includes(q.toLowerCase());
  const matched = ((lib && lib.matched) || []).filter(match);
  const others = ((lib && lib.others) || []).filter(match);

  const generate = async () => {
    setBusy(true);
    try {
      const out = await api.crf.generateDraft(r.id, sel);
      toast("Draft generated — " + out.coverage.filled + " of " + out.coverage.slots
        + " fields filled from this request.", "success");
      onDone();
    } catch (e) {
      toast((e.payload && e.payload.error) || e.message, "error");
      setBusy(false);
    }
  };

  // No "suggested" pill per row: these sit under a heading that already says
  // they match, and repeating it on all 66 of them is noise.
  const row = (t) => html`<button type="button" key=${t.id}
    class=${cx("tplrow", sel === t.id && "tplrow--on")} onClick=${() => setSel(t.id)}>
    <${Icon} name=${sel === t.id ? "checkcircle" : "file"} size=14 />
    <span class="tplrow__n">${t.name.replace(/\.docx$/i, "")}</span>
  </button>`;

  return html`<${Modal} title="Draft the contract" icon="file" width=${860} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${!sel || busy || loading || !prev}
        onClick=${generate}>${busy ? "Drafting…" : "Generate draft"}</${Btn}>`}>
    <div class="col" style="gap:14px">
      <div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="alertCircle" size=15 />
        <div class="tiny">
          The draft is the <strong>approved template itself</strong>, with the blanks its drafters left
          filled from this request. No clause is written, altered or reordered — anything this request
          cannot answer is left exactly as the template has it, and listed below. It is a first draft for
          Legal to review, and nothing is sent to anyone.
        </div>
      </div>

      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      ${!lib && !err && html`<div class="tiny muted">Reading the template library…</div>`}

      ${lib && html`<div class="draftgrid">
        <div class="col" style="gap:8px;min-width:0">
          <${Input} placeholder="Search the approved templates…" value=${q}
            onInput=${(e) => setQ(e.target.value)} />
          <div class="tplbox">
            ${matched.length > 0 && html`<div class="tiny muted tplhead">Matching this request type</div>`}
            ${matched.map((t) => row(t))}
            ${others.length > 0 && html`<div class="tiny muted tplhead">Every other approved template</div>`}
            ${others.map((t) => row(t))}
            ${matched.length + others.length === 0 && html`<div class="tiny muted" style="padding:10px">
              No .docx template matches that search.</div>`}
          </div>
        </div>

        <div class="col" style="gap:10px;min-width:0">
          ${!sel && html`<div class="tiny muted">Pick a template to see what this request can fill in it.</div>`}
          ${loading && html`<div class="tiny muted">Reading the template…</div>`}
          ${prev && html`<${Fragment}>
            <div>
              <div class="row" style="justify-content:space-between;align-items:baseline">
                <strong class="tiny">${prev.coverage.filled} of ${prev.coverage.slots} fields filled</strong>
                <span class="tiny muted">${prev.coverage.percent}%</span>
              </div>
              <div class="cvbar"><div class="cvbar__on" style=${"width:" + prev.coverage.percent + "%"}></div></div>
            </div>
            <div class="cvlist">
              <div class="tiny muted tplhead">Filled from this request</div>
              ${prev.filled.map((f, i) => html`<div key=${"f" + i} class="cvrow">
                <span class="cvrow__l">${f.label}</span>
                <span class="cvrow__v">${f.value}</span>
              </div>`)}
              ${prev.filled.length === 0 && html`<div class="tiny muted" style="padding:6px 0">
                Nothing on this request matches this template's blanks.</div>`}
              <div class="tiny muted tplhead">Left for Legal to complete (${prev.unfilled.length})</div>
              ${prev.unfilled.slice(0, 60).map((f, i) => html`<div key=${"u" + i} class="cvrow">
                <span class="cvrow__l">${f.label}</span>
                <span class="cvrow__v muted">${whyOf(f.reason)}</span>
              </div>`)}
              ${prev.unfilled.length > 60 && html`<div class="tiny muted" style="padding:6px 0">
                …and ${prev.unfilled.length - 60} more.</div>`}
            </div>
          </${Fragment}>`}
        </div>
      </div>`}
    </div>
  </${Modal}>`;
}


/* The drafting panel on the Documents tab. It sits with the documents because
   that is what it produces -- a draft on the request, versioned and readable
   exactly like anything else attached to it. */
function DraftSection({ r, perms, drafts, onChanged }) {
  const [open, setOpen] = useState(false);
  const can = perms.edit || perms.legalActions;
  return html`<${Section} title=${"Contract draft (" + drafts.length + ")"} icon="fileCheck"
    sub="The approved template, filled from this request."
    actions=${can && html`<${Btn} icon="sparkles" onClick=${() => setOpen(true)}>
      ${drafts.length ? "Draft again" : "Draft the contract"}</${Btn}>`}>
    ${open && html`<${DraftFromTemplate} r=${r} onClose=${() => setOpen(false)}
      onDone=${() => { setOpen(false); onChanged(); }} />`}
    ${drafts.length === 0 && html`<div class="tiny muted">
      ${can ? "No draft yet. Drafting fills an approved template's blanks with the parties, dates and terms on this request — the clause language stays the template's."
    : "No draft has been generated for this request."}</div>`}
    ${drafts.map((doc) => html`<${DocRow} key=${doc.id} d=${doc} editable=${false}
      reqId=${r.id} full=${true} onRemoved=${onChanged} />`)}
  </${Section}>`;
}

function ReadView({ d, tab, setTab, onChanged }) {
  const { request: r, schema, assessment: a, permissions: perms, documents, summary } = d;
  const v = r.values || {};
  const tabs = [
    { key: "overview", label: "Overview", icon: "info" },
    { key: "terms", label: "Commercial Terms", icon: "file" },
    { key: "documents", label: "Documents", icon: "paperclip", count: documents.length },
    { key: "approvals", label: "Approvals", icon: "checksquare", count: (r.approvals || []).length || undefined },
    { key: "messages", label: "Messages", icon: "mail", count: (r.messages || []).length || undefined },
    { key: "timeline", label: "Timeline", icon: "activity" },
  ];
  const fact = (k, val) => (isBlank(val) ? null : html`<div class="row" style="gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
    <div class="tiny muted" style="width:170px;flex:none">${k}</div>
    <div class="tiny" style="flex:1;word-break:break-word">${val}</div></div>`);

  return html`<${Fragment}>
    <div class="card" style="margin-bottom:14px"><div style="padding:6px 18px 0">
      <${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Contract request" />
    </div></div>

    ${/* FINANCE GETS A FINANCE SCREEN. Asked to approve an amount, they should
          be reading the amounts -- not scrolling a drafting form to find them. */ ""}
    ${tab === "overview" && perms.financeDecide && html`<${Section} title="What Finance is approving" icon="dollar"
      sub="Every figure this request states, and where it states it.">
      <div class="crf__grid">
        ${(a.financeFields || []).map((x, i) => html`<div key=${i} class="crf__f">
          <span class="tiny muted">${x.section} · ${x.field}</span>
          <span class="strong" style="font-size:15px">${/^[\d., ]+$/.test(String(x.value))
    ? "PKR " + Number(String(x.value).replace(/[, ]/g, "")).toLocaleString() : String(x.value)}</span>
        </div>`)}
      </div>
      <div class="tiny muted" style="padding-top:10px">
        ${(a.financeFields || []).length} monetary field${(a.financeFields || []).length === 1 ? "" : "s"} —
        this is why the request was routed to Finance. Nobody chose it.</div>
    </${Section}>`}

    ${tab === "overview" && html`<div class="grid" style="grid-template-columns:1fr 340px;gap:16px;align-items:start">
      <div class="col" style="gap:14px">
        <${Section} title="Request summary" icon="info">
          ${fact("Type", schema.label)}
          ${fact("Legal reference", r.legal.reference)}
          ${fact("Requester", summary.requester)}
          ${fact("Department", summary.department)}
          ${fact("Required by", summary.requiredBy && fmt.date(summary.requiredBy))}
          ${fact("Priority", summary.priority)}
          ${fact("Approving HOD", summary.approvingHod)}
          ${fact("Zameen entity", summary.entity + (v.entity && v.entity.entityRole ? " — " + v.entity.entityRole : ""))}
          ${fact("Counterparty", summary.counterparty)}
          ${fact("Finance review", a.financeRequired ? "Required — " + a.financeFields.map((f) => f.field).join(", ") : "Not required")}
        </${Section}>

        ${a.deviations.length > 0 && html`<${Section} title=${"Non-standard terms (" + a.deviations.length + ")"}
          icon="alertTriangle" sub="Where this request departs from the agreed position.">
          ${a.deviations.map((x, i) => html`<div key=${i} class="crfdev">
            <span class="tiny strong">${x.sectionLabel} — ${x.label}</span>
            <span class="tiny muted">standard: ${x.standardValue}</span>
            <${Icon} name="arrowRight" size=12 />
            <span class="tiny" style="color:var(--danger-text)">${x.selectedValue}</span>
          </div>`)}
        </${Section}>`}

        ${!isBlank((v.special || {}).specialTerms) && html`<${Section} title="Special terms" icon="edit">
          <div class="tiny" style="white-space:pre-wrap;line-height:1.7">${v.special.specialTerms}</div>
        </${Section}>`}

        ${a.problems.length > 0 && html`<${Section} title=${"Missing evidence (" + a.problems.length + ")"} icon="alertCircle"
          sub="What this request still does not state or attach.">
          ${a.problems.slice(0, 40).map((p, i) => html`<div key=${i} class="tiny" style="padding:3px 0">
            <span class="muted">${p.sectionLabel}</span> — ${p.label} ${p.message}</div>`)}
        </${Section}>`}
      </div>

      <div class="col" style="gap:14px">
        <${Section} title="Attachments" icon="paperclip"
          sub=${summary.mandatoryDone + " of " + summary.mandatoryTotal + " mandatory complete"}>
          ${(a.attachments || []).map((x) => html`<div key=${x.docType} class="row" style="gap:8px;padding:4px 0;align-items:center">
            <${Icon} name=${x.uploaded ? "checkcircle" : "alertCircle"} size=14
              style=${{ color: x.uploaded ? "var(--success)" : "var(--danger)" }} />
            <span class="tiny" style="flex:1">${x.docType}</span>
            <span class="tiny muted">${x.uploaded ? "uploaded" : "missing"}</span>
          </div>`)}
          <div class="tiny muted" style="padding-top:8px">
            <button type="button" class="linkbtn tiny" onClick=${() => setTab("documents")}>
              Open all ${documents.length} document${documents.length === 1 ? "" : "s"}</button>
          </div>
        </${Section}>
        <${Actions} d=${d} onChanged=${onChanged} />
      </div>
    </div>`}

    ${tab === "terms" && html`<div class="col" style="gap:14px">
      ${schema.sections.filter((s) => s.step === 3 || s.step === 4).map((sec) => {
    const val = v[sec.key];
    if (isBlank(val)) return null;
    return html`<${Section} key=${sec.key} title=${sec.label} icon="file">
      ${sec.grid
    ? html`<div class="tiny">${(val || []).map((row, i) => html`<div key=${i} class="crfrow">
        <span class="crfrow__n">${i + 1}</span>
        ${sec.fields.filter((f) => !isBlank(row[f.key])).map((f) => html`<span key=${f.key} class="crfrow__c">
          <span class="muted">${f.label}:</span> ${Array.isArray(row[f.key]) ? row[f.key].length + " entries" : String(row[f.key])}</span>`)}
      </div>`)}</div>`
    : sec.fields.filter((f) => !isBlank(val[f.key])).map((f) => fact(f.label,
      Array.isArray(val[f.key]) ? val[f.key].join(", ") : String(val[f.key])))}
    </${Section}>`;
  })}
    </div>`}

    ${tab === "documents" && (() => {
    const shared = documents.filter((x) => x.visibility !== "INTERNAL_LEGAL" && x.docType !== "Generated Draft");
    const drafts = documents.filter((x) => x.docType === "Generated Draft");
    const internal = documents.filter((x) => x.visibility === "INTERNAL_LEGAL");
    return html`<div class="col" style="gap:14px">
      <div class="tiny muted">One upload, one request — every authorised approver and Legal user reads
        these same files, and nothing is uploaded twice.</div>
      <${DraftSection} r=${r} perms=${perms} drafts=${drafts} onChanged=${onChanged} />
      <${Section} title=${"Documents from requester (" + shared.length + ")"} icon="paperclip">
        ${shared.length === 0 && html`<div class="tiny muted">Nothing attached.</div>`}
        ${shared.map((doc) => html`<${DocRow} key=${doc.id} d=${doc} editable=${false}
          reqId=${r.id} full=${true} onRemoved=${onChanged} />`)}
      </${Section}>
      ${/* Legal's own working papers. The store refuses these to the requester,
            so a file note does not travel back to the person it is about. */ ""}
      ${perms.legalActions && html`<${Section} title=${"Legal working documents (" + internal.length + ")"}
        icon="lock" sub="Internal to Legal — the requester does not see these."
        actions=${html`<${InternalUpload} reqId=${r.id} onDone=${onChanged} />`}>
        ${internal.length === 0 && html`<div class="tiny muted">Nothing internal yet.</div>`}
        ${internal.map((doc) => html`<${DocRow} key=${doc.id} d=${doc} editable=${false}
          reqId=${r.id} full=${true} onRemoved=${onChanged} />`)}
      </${Section}>`}
    </div>`;
  })()}

    ${tab === "approvals" && html`<${Section} title="Approval history" icon="checksquare">
      ${(r.approvals || []).length === 0 && html`<div class="tiny muted">No decision has been taken yet.</div>`}
      ${(r.approvals || []).map((ap, i) => html`<div key=${i} class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <${Pill} tone=${/approved/i.test(ap.decision) ? "green" : "red"}>${ap.stage} ${ap.decision}</${Pill}>
        <div style="flex:1;min-width:0">
          <div class="tiny strong">${(ap.by && ap.by.name) || "—"}</div>
          ${ap.comment && html`<div class="tiny muted" style="white-space:pre-wrap">${ap.comment}</div>`}
        </div>
        <span class="tiny muted">${fmt.date(ap.at)}</span>
      </div>`)}
      ${(r.returns || []).map((rt, i) => html`<div key=${"r" + i} class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <${Pill} tone="amber">Legal returned</${Pill}>
        <div style="flex:1;min-width:0">
          <div class="tiny strong">${(rt.by && rt.by.name) || "Legal"}</div>
          <div class="tiny muted">${[rt.comment, (rt.missingFields || []).join(", "), (rt.missingDocuments || []).join(", ")].filter(Boolean).join(" · ")}</div>
        </div>
        <span class="tiny muted">${fmt.date(rt.at)}</span>
      </div>`)}
    </${Section}>`}

    ${tab === "messages" && html`<${Messages} r=${r} onChanged=${onChanged} />`}

    ${tab === "timeline" && html`<${Section} title="Timeline" icon="activity">
      ${(r.timeline || []).slice().reverse().map((e) => html`<div key=${e.id} class="row" style="gap:10px;padding:7px 0;border-bottom:1px solid var(--border);align-items:baseline">
        <span class="tiny strong" style="width:180px;flex:none">${e.event}</span>
        <div style="flex:1;min-width:0">
          ${e.detail && html`<div class="tiny">${e.detail}</div>`}
          ${(e.changes || []).slice(0, 6).map((c, i) => html`<div key=${i} class="tiny muted">
            ${c.field}: ${String(c.from == null || c.from === "" ? "—" : c.from).slice(0, 40)} → ${String(c.to == null || c.to === "" ? "—" : c.to).slice(0, 40)}</div>`)}
        </div>
        <span class="tiny muted" style="white-space:nowrap">${e.byName || "—"} · ${fmt.date(e.at)}</span>
      </div>`)}
    </${Section}>`}
  </${Fragment}>`;
}

/* The actions this reader actually has. The server decides; this renders. */
function Actions({ d, onChanged }) {
  const { request: r, permissions: perms, assessment: a, schema } = d;
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast(ok, "success"); setOpen(""); onChanged(); }
    catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || (e.payload && e.payload.detail) || e.message, "error"); }
    setBusy(false);
  };
  const any = perms.hodDecide || perms.financeDecide || perms.legalActions || perms.deescalate;
  if (!any) return html`<${Section} title="Actions" icon="lock">
    <div class="tiny muted">This request is not waiting on you.</div></${Section}>`;

  return html`<${Section} title="Actions" icon="checksquare"
    sub=${perms.hodDecide ? "You are the approving HOD for this request."
    : perms.financeDecide ? "Finance review — this request states an amount."
      : "Legal actions."}>
    ${open === "return" && html`<${ReturnDialog} r=${r} a=${a} onClose=${() => setOpen("")} onDone=${onChanged} />`}
    ${open === "accept" && html`<${AcceptDialog} r=${r} onClose=${() => setOpen("")} onDone=${onChanged} />`}
    ${open === "draft" && html`<${PrepareDraft} r=${r} schema=${schema} onClose=${() => setOpen("")}
      onDone=${(draftId) => { setOpen(""); onChanged(); if (draftId) navigate("/drafting/" + draftId); }} />`}
    ${open === "comment" && html`<${CommentDialog} title=${perms.hodDecide ? "Reject or return" : "Return to requester"}
      onClose=${() => setOpen("")}
      onSubmit=${(c) => run(() => (perms.hodDecide ? api.crf.hod(r.id, false, c) : api.crf.finance(r.id, false, c)), "Returned to the requester")} />`}
    ${open === "escalate" && html`<${CommentDialog} title="Escalate to the Head of Legal"
      onClose=${() => setOpen("")}
      onSubmit=${(c) => run(() => api.crf.escalate(r.id, c), "Escalated")} />`}

    <div class="col" style="gap:8px">
      ${perms.hodDecide && html`<${Fragment}>
        <${Btn} variant="primary" icon="check" disabled=${busy}
          onClick=${() => run(() => api.crf.hod(r.id, true, ""), a.financeRequired ? "Approved — routed to Finance" : "Approved — routed to Legal")}>
          Approve${a.financeRequired ? " → Finance" : " → Legal"}</${Btn}>
        <${Btn} variant="ghost" icon="x" onClick=${() => setOpen("comment")}>Reject / return</${Btn}>
      </${Fragment}>`}
      ${perms.financeDecide && html`<${Fragment}>
        <${Btn} variant="primary" icon="check" disabled=${busy}
          onClick=${() => run(() => api.crf.finance(r.id, true, ""), "Finance approved — routed to Legal")}>
          Approve → Legal</${Btn}>
        <${Btn} variant="ghost" icon="x" onClick=${() => setOpen("comment")}>Return with a comment</${Btn}>
      </${Fragment}>`}
      ${perms.legalActions && html`<${Fragment}>
        ${r.status === "Legal Intake" && html`<${Btn} variant="primary" icon="checksquare"
          onClick=${() => setOpen("accept")}>Accept & assign</${Btn}>`}
        <${Btn} variant="ghost" icon="mail" onClick=${() => setOpen("return")}>Return for information</${Btn}>
        ${!r.escalated && html`<${Btn} variant="ghost" icon="alertTriangle" onClick=${() => setOpen("escalate")}>Escalate</${Btn}>`}
        ${r.status === "Accepted & Assigned" && html`<${Btn} variant="ghost" icon="edit"
          onClick=${() => run(() => api.crf.setStatus(r.id, "In Drafting", ""), "Moved to drafting")}>Move to drafting</${Btn}>`}
        ${/* §31 — PREPARE FIRST DRAFT. Offered once the request has been
              accepted, because a draft assembled from a request nobody has
              checked is a draft of the wrong thing. */ ""}
        ${["Accepted & Assigned", "In Drafting"].includes(r.status) && html`<${Btn} variant="ghost" icon="sparkles"
          onClick=${() => setOpen("draft")}>Prepare first draft</${Btn}>`}
        ${["Accepted & Assigned", "In Drafting"].includes(r.status) && html`<${Btn} variant="ghost" icon="check"
          onClick=${() => run(() => api.crf.setStatus(r.id, "Closed", ""), "Closed")}>Close</${Btn}>`}
      </${Fragment}>`}
      ${perms.deescalate && html`<${Btn} variant="ghost" icon="check"
        onClick=${() => run(() => api.crf.deescalate(r.id, ""), "Escalation cleared")}>
        Clear escalation</${Btn}>`}
    </div>
  </${Section}>`;
}

function CommentDialog({ title, onClose, onSubmit }) {
  const [c, setC] = useState("");
  return html`<${Modal} title=${title} icon="edit" width=${560} onClose=${onClose}
    footer=${html`<${Fragment}><${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${!c.trim()} onClick=${() => onSubmit(c.trim())}>Send</${Btn}>
    </${Fragment}>`}>
    <${Field} label="Comment *" hint="The requester reads this, and it stays on the record.">
      <textarea class="input" rows="4" value=${c} onInput=${(e) => setC(e.target.value)}></textarea>
    </${Field}>
  </${Modal}>`;
}

/* Legal returns for something NAMED. Ticking the missing documents off the
   request's own checklist means the requester is told exactly what to attach. */
function ReturnDialog({ r, a, onClose, onDone }) {
  const [docs, setDocs] = useState([]);
  const [fields, setFields] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const missing = (a.attachments || []).filter((x) => !x.uploaded).map((x) => x.docType);
  const all = [...new Set(missing.concat((a.attachments || []).map((x) => x.docType)))];
  const go = async () => {
    setBusy(true);
    try {
      await api.crf.legalReturn(r.id, { missingDocuments: docs,
        missingFields: fields.split(",").map((s) => s.trim()).filter(Boolean), comment });
      toast("Returned to the requester", "success"); onClose(); onDone();
    } catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error"); setBusy(false); }
  };
  return html`<${Modal} title="Return for information" icon="mail" width=${620} onClose=${onClose}
    footer=${html`<${Fragment}><${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || (!docs.length && !fields.trim())}
        onClick=${go}>Return to requester</${Btn}></${Fragment}>`}>
    <div class="tiny muted" style="margin-bottom:10px">Say what is missing. The requester sees exactly this.</div>
    <${Field} label="Missing documents">
      <div class="col" style="gap:4px">
        ${all.map((t) => html`<label key=${t} class="fltopt">
          <input type="checkbox" checked=${docs.includes(t)}
            onChange=${() => setDocs(docs.includes(t) ? docs.filter((x) => x !== t) : docs.concat(t))} />
          <span class="fltopt__l">${t}</span>
          ${missing.includes(t) && html`<span class="fltopt__c">not attached</span>`}
        </label>`)}
      </div>
    </${Field}>
    <${Field} label="Missing fields" hint="Comma separated"><${Input} value=${fields} onInput=${(e) => setFields(e.target.value)} /></${Field}>
    <${Field} label="Comment"><textarea class="input" rows="3" value=${comment} onInput=${(e) => setComment(e.target.value)}></textarea></${Field}>
  </${Modal}>`;
}

/* Accepting is where the SLA starts, so it cannot happen without the two
   things that make a target mean anything. */
function AcceptDialog({ r, onClose, onDone }) {
  const [assignee, setAssignee] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.crf.accept(r.id, assignee, target); toast("Accepted — SLA starts now", "success"); onClose(); onDone(); }
    catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error"); setBusy(false); }
  };
  return html`<${Modal} title="Accept & assign" icon="checksquare" width=${560} onClose=${onClose}
    footer=${html`<${Fragment}><${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !assignee.trim() || !target}
        onClick=${go}>Accept & assign</${Btn}></${Fragment}>`}>
    <div class="tiny muted" style="margin-bottom:10px">The SLA starts when this is accepted — not at submission,
      and not while it was moving through the requester's own approvals.</div>
    <${Field} label="Assignee *"><${Input} value=${assignee} onInput=${(e) => setAssignee(e.target.value)} /></${Field}>
    <${Field} label="Target date *"><${DateInput} value=${target} onInput=${(e) => setTarget(e.target.value)} /></${Field}>
  </${Modal}>`;
}

/* CHANGING THE REQUEST TYPE WHILE IT IS STILL A DRAFT.
   The commercial terms of a lease mean nothing on a joint venture, so they are
   discarded -- but never silently. The server refuses the change until the
   caller has been told exactly how many sections of answers would go. */
function TypeSwitch({ r, schema, onChanged }) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [pick, setPick] = useState("");
  const [warn, setWarn] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) api.crf.types().then((d) => setTypes(d.types || []), () => setTypes([])); }, [open]);

  const go = async (confirm) => {
    setBusy(true);
    try {
      await api.crf.changeType(r.id, pick, confirm);
      toast("Request type changed", "success"); setOpen(false); setWarn(null); onChanged();
    } catch (e) {
      if (e.payload && e.payload.error === "confirm_required") setWarn(e.payload.dropped || []);
      else toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error");
    }
    setBusy(false);
  };

  return html`<${Fragment}>
    <div class="row" style="gap:10px;align-items:center;padding:2px">
      ${/* THE TYPE IS NAMED, NOT NUMBERED (§33). "This is a CRF-01 request"
            is an internal schema id read out to the business. The id still
            exists and still keys the schema; it is simply not what a requester
            is shown. */ ""}
      <span class="tiny muted">This is a ${(schema && schema.label) || "contract"} request.</span>
      <button type="button" class="linkbtn tiny" onClick=${() => setOpen(true)}>Change request type</button>
    </div>
    ${open && html`<${Modal} title="Change request type" icon="refresh" width=${680}
      onClose=${() => { setOpen(false); setWarn(null); }}
      footer=${html`<${Fragment}>
        <${Btn} onClick=${() => { setOpen(false); setWarn(null); }}>Cancel</${Btn}>
        <${Btn} variant="primary" icon="check" disabled=${!pick || pick === r.type || busy}
          onClick=${() => go(!!warn)}>${warn ? "Change and discard those answers" : "Change type"}</${Btn}>
      </${Fragment}>`}>
      ${warn && html`<div class="card card--pad" style="border-color:var(--danger);background:var(--danger-bg);margin-bottom:12px">
        <div class="tiny strong" style="margin-bottom:4px">This will discard ${warn.length} section${warn.length === 1 ? "" : "s"} of answers</div>
        <div class="tiny">${warn.join(", ")}</div>
        <div class="tiny muted" style="margin-top:6px">The shared blocks — request, entity, counterparty,
          disputes, notices, execution — are kept. Your attachments are kept.</div>
      </div>`}
      <div class="col" style="gap:6px">
        ${types.map((t) => html`<button key=${t.key} type="button"
          class=${cx("crfpick", pick === t.key && "crfpick--on")}
          aria-pressed=${pick === t.key ? "true" : "false"}
          onClick=${() => { setPick(t.key); setWarn(null); }}>
          <span class="mono tiny strong">${t.key}</span><span class="tiny">${t.label}</span>
          ${t.key === r.type && html`<span class="tiny muted">current</span>`}
        </button>`)}
      </div>
    </${Modal}>`}
  </${Fragment}>`;
}

/* Legal attaching a working paper. It is not the requester's document and it
   never becomes one -- the store classifies it INTERNAL_LEGAL and refuses it
   to everybody outside Legal, whoever the request belongs to. */
function InternalUpload({ reqId, onDone }) {
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      await api.crf.uploadDocument(reqId, file, { docType: "Legal working document", internal: true });
      toast("Added — internal to Legal", "success"); onDone();
    } catch (ex) { toast((ex.payload && ex.payload.detail) || ex.message, "error"); }
    setBusy(false);
  };
  return html`<label class="btn btn--ghost btn--sm" style="cursor:pointer">
    <${Icon} name="plus" size=13 /> ${busy ? "Adding…" : "Add internal document"}
    <input type="file" style="display:none" disabled=${busy} onChange=${go} />
  </label>`;
}

/* WHERE THE REQUEST IS, AND WHAT IS LEFT.
   Finance is skipped when no amount is stated, and a stage that simply vanishes
   leaves the reader wondering whether it was missed. It says so instead. */
function Stepper({ r, a }) {
  const ORDER = ["Draft", "HOD Approval", "Finance Review", "Legal Intake",
    "Accepted & Assigned", "In Drafting", "Closed"];
  const LABEL = { "Draft": "Draft", "HOD Approval": "HOD", "Finance Review": "Finance",
    "Legal Intake": "Legal intake", "Accepted & Assigned": "Accepted", "In Drafting": "In drafting", "Closed": "Closed" };
  const returned = r.status === "Returned to Requester";
  const hereIdx = returned ? 0 : ORDER.indexOf(r.status);
  const hodDone = (r.approvals || []).some((x) => x.stage === "HOD" && x.decision === "Approved");
  const finDone = (r.approvals || []).some((x) => x.stage === "Finance" && x.decision === "Approved");

  return html`<div class="crfstepper" role="list" aria-label="Where this request is">
    ${ORDER.map((st, i) => {
    const skipped = st === "Finance Review" && !a.financeRequired;
    const done = skipped ? false
      : st === "HOD Approval" ? hodDone
        : st === "Finance Review" ? finDone
          : hereIdx > i;
    const here = !returned && st === r.status;
    const note = st === "HOD Approval" && hodDone
      ? "Approved by " + (((r.approvals || []).find((x) => x.stage === "HOD") || {}).by || {}).name
      : st === "Finance Review" && skipped ? "Not required — no amount stated"
        : st === "Finance Review" && finDone ? "Approved"
          : st === "Accepted & Assigned" && r.legal.assignee ? r.legal.assignee
            : here ? "Here now" : "";
    return html`<div key=${st} role="listitem"
      class=${cx("crfstep2", here && "crfstep2--on", done && "crfstep2--done", skipped && "crfstep2--skip")}>
      <span class="crfstep2__dot">${done ? html`<${Icon} name="check" size=11 />` : skipped ? "–" : i + 1}</span>
      <span class="crfstep2__l">${LABEL[st]}</span>
      ${note && html`<span class="crfstep2__n">${note}</span>`}
    </div>`;
  })}
    ${returned && html`<div role="listitem" class="crfstep2 crfstep2--back">
      <span class="crfstep2__dot"><${Icon} name="arrowLeft" size=11 /></span>
      <span class="crfstep2__l">Returned to requester</span>
      <span class="crfstep2__n">Here now</span>
    </div>`}
  </div>`;
}

/* The conversation about this request, on the request. Everybody who may read
   the request reads this thread -- Legal's private notes are internal
   documents, which is what keeps this one open. */
function Messages({ r, onChanged }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.crf.message(r.id, text.trim()); setText(""); onChanged(); }
    catch (e) { toast((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message, "error"); }
    setBusy(false);
  };
  const list = r.messages || [];
  return html`<${Section} title=${"Messages (" + list.length + ")"} icon="mail"
    sub="Everyone handling this request reads this. Legal's private working papers are internal documents, not messages.">
    <div class="col" style="gap:10px">
      ${list.length === 0 && html`<div class="tiny muted">No messages yet.</div>`}
      ${list.map((m) => html`<div key=${m.id} class=${cx("crfmsg", m.fromLegal && "crfmsg--legal")}>
        <div class="row" style="gap:8px;align-items:baseline">
          <span class="tiny strong">${(m.by && m.by.name) || "—"}</span>
          ${m.fromLegal && html`<${Pill} tone="indigo">Legal</${Pill}>`}
          <div class="spacer"></div>
          <span class="tiny muted">${fmt.date(m.at)}</span>
        </div>
        <div class="tiny" style="white-space:pre-wrap;margin-top:4px">${m.text}</div>
      </div>`)}
      <div class="row" style="gap:8px;align-items:flex-end;margin-top:4px">
        <div style="flex:1">
          <label class="fldlabel" for="crf-msg">Write a message</label>
          <textarea class="input" id="crf-msg" rows="2" value=${text}
            onInput=${(e) => setText(e.target.value)}></textarea>
        </div>
        <${Btn} variant="primary" icon="check" disabled=${busy || !text.trim()} onClick=${send}>Send</${Btn}>
      </div>
    </div>
  </${Section}>`;
}
