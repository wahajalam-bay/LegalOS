// R1.0 — MODULE 1: REQUEST INTAKE  (PRD §3.1)
//
// The plain-language front door. The requester describes what they need in
// their own words and picks the option that best describes it; the system maps
// that to a PROPOSED legal category and drops the request into Legal's triage
// queue. The requester never chooses a legal team, module, or contract type —
// "the requester should not need to know what kind of legal assistance they
// need" (PRD §3.1).
//
//   0  What do you need help with?   (prominent free text + business context)
//   1  Which best describes this?    (plain-language option → mapped category,
//                                      then the conditional Layer-2 fields,
//                                      urgency, needed-by, who it's for, files)
//   2  Review & submit               → submitLegalRequest() → Triage
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Field, Input, Textarea, Stepper, AICard, Empty } from "../ui.js";
import { navigate } from "../router.js";
import { submitLegalRequest, duplicateCheck, useCollection, triageSlaDays } from "../store.js";
import { entityById, PORTAL_SOURCES, DEPARTMENTS, BUSINESS_UNITS } from "../data.js";

// Business days (Fri/Sat weekend, per KSA/PK) from today to a date.
const bizDaysUntil = (iso) => {
  if (!iso) return Infinity;
  const t = new Date(iso + "T00:00:00"); const d = new Date(); d.setHours(0, 0, 0, 0);
  let n = 0; while (d < t) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 5 && w !== 6) n++; }
  return n;
};

const STEP_LABELS = ["What you need", "About it", "Review"];

// PRD §3.1 business-urgency bands (the requester's view). Anything outside the
// standard SLA is flagged for approval on the legal side.
const URGENCY = [
  { key: "Routine", icon: "circle", risk: "low", priority: "Low", blurb: "No particular deadline" },
  { key: "Important", icon: "flag", risk: "medium", priority: "Medium", blurb: "Matters, not blocking" },
  { key: "Time-critical", icon: "clock", risk: "high", priority: "High", blurb: "A deadline is near" },
  { key: "Emergency", icon: "zap", risk: "critical", priority: "Urgent", blurb: "Blocking / same-day" },
];

// PRD §3 Layer-2 — the plain-language options and the legal category each maps
// to (invisible to the requester), with the conditional fields to reveal.
const OPTIONS = [
  {
    key: "agreement", icon: "file",
    label: "We're entering into an agreement with someone",
    category: "Contract Drafting / Review", requestType: "New", nature: "Contracts",
    layer2: [
      { key: "counterparty", label: "Who is the counterparty?", type: "text", placeholder: "e.g. Retal Urban Development Co." },
      { key: "counterpartyType", label: "Counterparty type", type: "select", options: ["Customer", "Supplier / Vendor", "Partner / JV", "Government", "Other"] },
      { key: "paper", label: "Whose paper is it on?", type: "select", options: ["Our paper", "Their paper", "Not sure yet"] },
      { key: "term", label: "Contract term / duration", type: "text", placeholder: "e.g. 2 years" },
      { key: "existing", label: "Is there an existing agreement with them?", type: "select", options: ["No", "Yes"] },
    ],
  },
  {
    key: "change", icon: "refresh",
    label: "We need to change or end an existing agreement",
    category: "Amendment / Renewal / Termination", requestType: "Amendment", nature: "Contracts",
    layer2: [
      { key: "linkedContract", label: "Which existing contract? (name or reference)", type: "text", placeholder: "e.g. CTR-1185 or 'ACWA PPA'" },
      { key: "changeNature", label: "What is the change?", type: "select", options: ["Amendment", "Renewal", "Extension", "Termination", "Not sure"] },
      { key: "effectiveDate", label: "Effective date of the change", type: "date" },
    ],
  },
  {
    key: "advice", icon: "help",
    label: "We need advice on whether we can do something",
    category: "Legal Opinion / Advisory", requestType: "New", nature: "Advisory",
    layer2: [
      { key: "question", label: "What is the question you need answered?", type: "textarea", placeholder: "Can we…?" },
      { key: "decisionDeadline", label: "Decision deadline", type: "date" },
      { key: "decisionMaker", label: "Who is the decision-maker?", type: "text" },
    ],
  },
  {
    key: "dispute", icon: "alertTriangle",
    label: "Someone is threatening or has commenced action",
    category: "Dispute / Litigation", requestType: "New", nature: "Dispute",
    layer2: [
      { key: "counterparty", label: "Who is the other side?", type: "text" },
      { key: "claimNature", label: "Nature of the claim / threat", type: "textarea" },
      { key: "deadlines", label: "Any deadlines? (e.g. respond by)", type: "text" },
      { key: "correspondence", label: "Have you received a notice / correspondence?", type: "select", options: ["No", "Yes"] },
    ],
  },
  {
    key: "compliance", icon: "shield",
    label: "We need to check if something is allowed",
    category: "Regulatory / Compliance", requestType: "New", nature: "Compliance",
    layer2: [
      { key: "jurisdiction", label: "Jurisdiction", type: "select", options: ["Pakistan", "Saudi Arabia", "UAE", "Other"] },
      { key: "regulator", label: "Regulator involved (if known)", type: "text" },
      { key: "activity", label: "Product or activity concerned", type: "textarea" },
    ],
  },
  {
    key: "ip", icon: "tag",
    label: "We need to protect something we've created",
    category: "IP", requestType: "New", nature: "IP",
    layer2: [
      { key: "assetNature", label: "What are we protecting?", type: "select", options: ["Trademark / Brand", "Copyright / Content", "Domain", "Invention / Patent", "Other"] },
      { key: "jurisdictions", label: "Jurisdictions", type: "text", placeholder: "e.g. Pakistan, KSA" },
    ],
  },
  {
    key: "other", icon: "more",
    label: "Something else",
    category: "Triage required", requestType: "New", nature: "Other",
    layer2: [],
  },
];

/* a big selectable option card */
function OptionCard({ active, icon, title, sub, badge, onClick }) {
  return html`<button class=${cx("popt", active && "popt--on")} onClick=${onClick}>
    ${icon && html`<span class="popt__ico"><${Icon} name=${icon} size=17 /></span>`}
    <span style="flex:1;min-width:0;text-align:left">
      <span class="popt__title">${title}</span>
      ${sub && html`<span class="popt__sub">${sub}</span>`}
    </span>
    ${badge}
    ${active && html`<${Icon} name="checkcircle" size=18 style=${{ color: "var(--brand)", flex: "none" }} />`}
  </button>`;
}

function Fragment0({ children }) { return children; }

// captureSource: when true (in-app "Raise Request"), the wizard also captures the
// "Where are you raising this from?" context (company/entity · site · department ·
// business unit) — the same details the standalone portal collects at sign-in.
export function RequestWizard({ cfg, me, stampId, captureSource }) {
  const requests = useCollection("requests");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);

  const companies = (cfg.companies || []).filter((c) => c.enabled);
  const myCompany = companies.find((c) => c.key === me.company) || null;

  const [f, setF] = useState({
    title: "", context: "",
    option: "",
    layer2: {},
    urgency: "Important",
    dueDate: "",
    justification: "",
    entityKey: myCompany ? myCompany.key : (companies[0] ? companies[0].key : ""),
    source: me.source || PORTAL_SOURCES[0],
    department: me.department || DEPARTMENTS[0],
    unit: me.unit || BUSINESS_UNITS[0],
    files: [],
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setL2 = (k, v) => setF((s) => ({ ...s, layer2: { ...s.layer2, [k]: v } }));

  const opt = OPTIONS.find((o) => o.key === f.option) || null;
  const entityCfg = companies.find((c) => c.key === f.entityKey) || null;
  const entity = entityCfg ? entityById(entityCfg.entityId) : null;
  const urgencyCfg = URGENCY.find((u) => u.key === f.urgency) || URGENCY[1];
  // PRD §3.1 — a needed-by date tighter than the standard turnaround needs a
  // business justification (which routes for approval on the legal side).
  const slaDays = opt ? triageSlaDays(opt.category, f.urgency) : null;
  const tight = !!(f.dueDate && slaDays != null && bizDaysUntil(f.dueDate) < slaDays);

  const dupes = useMemo(
    () => duplicateCheck({ counterparty: (f.layer2 || {}).counterparty, entityId: entityCfg ? entityCfg.entityId : null, linkedContractId: null }),
    [f.layer2, entityCfg && entityCfg.key, requests]
  );

  const addFile = (name) => {
    const n = f.files.length + 1;
    set("files", [...f.files, { name: name || `Supporting-document-${n}.pdf`, sizeKb: 260 + n * 140, kind: "Attachment" }]);
  };

  const canContinue = () => {
    if (step === 0) return !!f.title.trim() && !!f.context.trim();
    if (step === 1) return !!f.option && !!entityCfg && (!tight || !!f.justification.trim());
    return true;
  };

  const submit = () => {
    if (!opt) { setErrors(["please choose the option that best describes your request"]); return; }
    const res = submitLegalRequest({
      title: f.title,
      description: f.context,
      businessContext: f.context,
      // proposed legal category — the requester never sees this label
      category: opt.category,
      proposedCategory: opt.category,
      requesterOption: opt.label,
      requestType: opt.requestType,
      natureOfMatter: opt.nature,
      layer2: f.layer2,
      urgencyBand: f.urgency,
      priority: urgencyCfg.priority,
      riskPreliminary: urgencyCfg.risk,
      needByTight: tight,
      needByJustification: tight ? f.justification : null,
      counterparty: (f.layer2 || {}).counterparty || "",
      entityId: entityCfg ? entityCfg.entityId : null,
      companyTags: entityCfg ? [entityCfg.entityId] : [],
      company: entityCfg ? entityCfg.key : (me.company || null),
      department: f.department || me.department,
      unit: f.unit || me.unit,
      dueDate: f.dueDate ? new Date(f.dueDate + "T00:00:00").toISOString() : undefined,
      requesterId: stampId,
      requesterEmail: me.email,
      attachments: f.files,
      channel: captureSource ? "internal" : "portal",
      source: f.source || me.source,
    });
    if (!res.ok) { setErrors(res.errors); return; }
    setResult(res);
  };

  /* ---------------- confirmation ---------------- */
  if (result && result.ok) {
    return html`<div class="ppage">
      <div class="card card--pad col" style="gap:18px;max-width:660px;margin:0 auto">
        <div class="col center" style="gap:12px;text-align:center">
          <div class="metric__icon" style="width:52px;height:52px;background:var(--success-bg);color:var(--success)">
            <${Icon} name="checkcircle" size=26 />
          </div>
          <div class="strong" style="font-size:19px">Request submitted</div>
          <div class="dim" style="font-size:13px">The legal team can see it now. Track it any time from <b>My requests</b>.</div>
        </div>
        <div class="pconfirm">
          <div class="kv"><div class="kv__l">Your tracking ID</div><div class="kv__v mono" style="font-size:15px">${result.id}</div></div>
          <div class="kv"><div class="kv__l">Turnaround</div><div class="kv__v">${result.tat.days} working days</div></div>
          <div class="kv"><div class="kv__l">Target date</div><div class="kv__v">${fmt.date(result.tat.dueAt)}</div></div>
          <div class="kv"><div class="kv__l">Urgency</div><div class="kv__v">${f.urgency}</div></div>
          <div class="kv"><div class="kv__l">Raised for</div><div class="kv__v">${entity ? entity.name : (me.source || "—")}</div></div>
        </div>
        <div class="banner banner--info" style="align-items:flex-start">
          <${Icon} name="workflow" size=17 />
          <div>
            <div class="strong tiny">What happens next</div>
            <div class="tiny" style="margin-top:3px;opacity:.9">
              Legal triages your request, confirms the category and owner, and starts the clock.
              You don't need to know the legal category — that's their job. If they need a document
              from you it will appear on your request here.
            </div>
          </div>
        </div>
        ${result.duplicates.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
          <${Icon} name="alertTriangle" size=17 />
          <div>
            <div class="strong tiny">Heads-up — similar requests are already open</div>
            ${result.duplicates.map((d) => html`<div key=${d.id} class="tiny" style="margin-top:3px;opacity:.9">${d.id} — ${d.title}</div>`)}
          </div>
        </div>`}
        <div class="row" style="gap:8px">
          <${Btn} variant="ghost" onClick=${() => navigate("/raise")}>Raise another</${Btn}>
          <div class="spacer"></div>
          <${Btn} variant="primary" iconRight="arrowRight"
            onClick=${() => navigate(captureSource ? "/my-requests" : "/requests/" + result.id)}>
            ${captureSource ? "Track my requests" : "Open " + result.id}
          </${Btn}>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- the wizard ---------------- */
  return html`<div class="ppage">
    <div class="pwiz">
      <div class="pwiz__head">
        <div style="min-width:0">
          <div class="pwiz__title">New legal request</div>
          <div class="tiny muted">Raised for ${me.source || me.department} · ${me.email}</div>
        </div>
        <${Btn} variant="ghost" size="sm" onClick=${() => navigate("/requests")}>Cancel</${Btn}>
      </div>

      <div class="card card--pad" style="margin-bottom:16px">
        <${Stepper} steps=${STEP_LABELS} current=${step} />
      </div>

      <div class="card card--pad col" style="gap:18px">
        ${step === 0 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">What do you need help with?</div>
            <div class="pwiz__hint">In your own words — you don't need to know the legal category. Just tell us what's going on.</div>
          </div>
          <${Input} placeholder="e.g. We're signing a deal with a new supplier and need it checked"
            value=${f.title} onInput=${(e) => set("title", e.target.value)} style=${{ fontSize: "16px", padding: "13px 14px" }} />
          <${Field} label="A bit more context" hint="What is the commercial objective? Who is the counterparty? What has been agreed so far?">
            <${Textarea} rows=5 placeholder="Describe the situation in your own words…"
              value=${f.context} onInput=${(e) => set("context", e.target.value)} />
          </${Field}>
        </${Fragment0}>`}

        ${step === 1 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">Which best describes this?</div>
            <div class="pwiz__hint">Pick the closest one — legal will confirm the exact categorisation. There's no wrong answer.</div>
          </div>
          <div class="pgrid">
            ${OPTIONS.map((o) => html`<${OptionCard} key=${o.key} icon=${o.icon} title=${o.label}
              active=${f.option === o.key}
              onClick=${() => { set("option", o.key); }} />`)}
          </div>

          ${opt && opt.layer2.length > 0 && html`<div class="col" style="gap:14px">
            <div class="raisesep">A few details</div>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
              ${opt.layer2.map((fld) => html`<${Field} key=${fld.key} label=${fld.label} hint=${fld.hint}
                style=${{ gridColumn: fld.type === "textarea" ? "1 / -1" : "auto" }}>
                ${fld.type === "select"
                  ? html`<select class="select" value=${(f.layer2 || {})[fld.key] || ""} onChange=${(e) => setL2(fld.key, e.target.value)}>
                      <option value="">Select…</option>
                      ${fld.options.map((o) => html`<option key=${o}>${o}</option>`)}
                    </select>`
                  : fld.type === "textarea"
                    ? html`<${Textarea} rows=3 placeholder=${fld.placeholder || ""} value=${(f.layer2 || {})[fld.key] || ""} onInput=${(e) => setL2(fld.key, e.target.value)} />`
                    : fld.type === "date"
                      ? html`<${Input} type="date" value=${(f.layer2 || {})[fld.key] || ""} onInput=${(e) => setL2(fld.key, e.target.value)} />`
                      : html`<${Input} placeholder=${fld.placeholder || ""} value=${(f.layer2 || {})[fld.key] || ""} onInput=${(e) => setL2(fld.key, e.target.value)} />`}
              </${Field}>`)}
            </div>
          </div>`}

          ${opt && captureSource && html`<div class="col" style="gap:14px">
            <div class="raisesep">Where are you raising this from?</div>
            <div class="tiny muted" style="margin-top:-6px">Captured with every request so legal knows the entity and site it came from.</div>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
              <${Field} label="Company / entity">
                <select class="select" value=${f.entityKey} onChange=${(e) => set("entityKey", e.target.value)}>
                  <option value="">Select…</option>
                  ${companies.map((c) => html`<option key=${c.key} value=${c.key}>${c.label}</option>`)}
                </select>
              </${Field}>
              <${Field} label="Site / office">
                <select class="select" value=${f.source} onChange=${(e) => set("source", e.target.value)}>
                  ${PORTAL_SOURCES.map((s) => html`<option key=${s}>${s}</option>`)}
                </select>
              </${Field}>
              <${Field} label="Your department">
                <select class="select" value=${f.department} onChange=${(e) => set("department", e.target.value)}>
                  ${DEPARTMENTS.map((d) => html`<option key=${d}>${d}</option>`)}
                </select>
              </${Field}>
              <${Field} label="Business unit">
                <select class="select" value=${f.unit} onChange=${(e) => set("unit", e.target.value)}>
                  ${BUSINESS_UNITS.map((bu) => html`<option key=${bu}>${bu}</option>`)}
                </select>
              </${Field}>
            </div>
          </div>`}

          ${opt && html`<div class="col" style="gap:14px">
            <div class="raisesep">How urgent, and who's it for</div>
            <${Field} label="How urgent is this?">
              <div class="row wrap" style="gap:8px">
                ${URGENCY.map((u) => html`<button key=${u.key} class=${cx("chip", f.urgency === u.key && "active")} onClick=${() => set("urgency", u.key)}>
                  <${Icon} name=${u.icon} size=14 />${u.key}
                </button>`)}
              </div>
              <div class="tiny muted" style="margin-top:6px">${urgencyCfg.blurb}. Anything outside the standard turnaround is confirmed with Legal.</div>
            </${Field}>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
              <${Field} label="Needed by" hint="Legal confirms the committed date on triage.">
                <${Input} type="date" value=${f.dueDate} onInput=${(e) => set("dueDate", e.target.value)} />
              </${Field}>
              ${!captureSource && companies.length > 0 && html`<${Field} label="Who is this for?" hint="Your business entity — auto-filled where we know it.">
                <select class="select" value=${f.entityKey} onChange=${(e) => set("entityKey", e.target.value)}>
                  <option value="">Select…</option>
                  ${companies.map((c) => html`<option key=${c.key} value=${c.key}>${c.label}</option>`)}
                </select>
              </${Field}>`}
            </div>
            ${tight && html`<div class="col" style="gap:8px">
              <div class="banner banner--warn" style="align-items:flex-start">
                <${Icon} name="alertTriangle" size=17 />
                <div>
                  <div class="strong tiny">That date is tighter than the standard turnaround (${slaDays} working days)</div>
                  <div class="tiny" style="margin-top:3px;opacity:.9">A short justification is required — Legal reviews expedite requests for approval.</div>
                </div>
              </div>
              <${Field} label="Business justification *" hint="Why is this needed faster than normal?">
                <${Textarea} rows=2 placeholder="e.g. Counterparty's board approval lapses on the 15th…" value=${f.justification} onInput=${(e) => set("justification", e.target.value)} />
              </${Field}>
            </div>`}

            <${Field} label="Attach documents" hint="Drafts, quotes, correspondence — anything legal will need.">
              <div class="col" style="gap:7px">
                ${f.files.map((a, i) => html`<div key=${i} class="docrow">
                  <${Icon} name="paperclip" size=15 />
                  <div style="flex:1;min-width:0"><div class="strong tiny">${a.name}</div><div class="tiny muted">${a.kind} · ${a.sizeKb} KB</div></div>
                  <button class="iconbtn" style="width:24px;height:24px" onClick=${() => set("files", f.files.filter((_, j) => j !== i))}><${Icon} name="x" size=14 /></button>
                </div>`)}
                <${Btn} variant="soft" size="sm" icon="upload" onClick=${() => addFile()}>Attach a file</${Btn}>
              </div>
            </${Field}>
            ${dupes.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
              <${Icon} name="alertTriangle" size=17 />
              <div>
                <div class="strong tiny">There may already be an open request on this</div>
                ${dupes.slice(0, 3).map((d) => html`<div key=${d.id} class="tiny" style="margin-top:3px;opacity:.9">${d.id} — ${d.title} (${d.status})</div>`)}
                <div class="tiny" style="margin-top:3px;opacity:.75">Carry on if yours is different — legal will link them.</div>
              </div>
            </div>`}
          </div>`}
        </${Fragment0}>`}

        ${step === 2 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">Check it over</div>
            <div class="pwiz__hint">This is exactly what the legal team will receive. They decide the legal categorisation.</div>
          </div>
          <div class="pconfirm">
            <div class="kv"><div class="kv__l">What you need</div><div class="kv__v">${f.title || "—"}</div></div>
            <div class="kv"><div class="kv__l">Best described as</div><div class="kv__v">${opt ? opt.label : "—"}</div></div>
            ${opt && opt.layer2.filter((fl) => (f.layer2 || {})[fl.key]).map((fl) => html`<div key=${fl.key} class="kv">
              <div class="kv__l">${fl.label}</div><div class="kv__v">${(f.layer2 || {})[fl.key]}</div></div>`)}
            <div class="kv"><div class="kv__l">Urgency</div><div class="kv__v">${f.urgency}</div></div>
            <div class="kv"><div class="kv__l">Needed by</div><div class="kv__v">${f.dueDate ? fmt.date(f.dueDate) : "no date given"}</div></div>
            <div class="kv"><div class="kv__l">Raised for</div><div class="kv__v">${entity ? entity.name : "—"}</div></div>
            <div class="kv"><div class="kv__l">Attachments</div><div class="kv__v">${f.files.length || "none"}</div></div>
            <div class="kv"><div class="kv__l">Raised by</div><div class="kv__v">${me.name} · ${me.email}</div></div>
          </div>
          ${f.context && html`<div class="spine__desc">${f.context}</div>`}
          <${AICard} title="What happens on submit">
            Your request lands in the legal team's <b>triage queue</b> with the details above.
            A lawyer confirms the legal category, owner and turnaround, then starts the clock.
            You'll be notified at each step and never have to figure out the legal category yourself.
          </${AICard}>
          ${errors.length > 0 && html`<div class="banner banner--warn"><${Icon} name="alertCircle" size=16 /><span class="tiny">${errors.join(" · ")}</span></div>`}
        </${Fragment0}>`}

        <div class="row" style="gap:8px;padding-top:6px;border-top:1px solid var(--border)">
          ${step > 0
            ? html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(step - 1)}>Back</${Btn}>`
            : html`<${Btn} variant="ghost" onClick=${() => navigate("/requests")}>Cancel</${Btn}>`}
          <div class="spacer"></div>
          ${step === 2
            ? html`<${Btn} variant="primary" icon="check" onClick=${submit}>Submit request</${Btn}>`
            : html`<${Btn} variant="primary" iconRight="arrowRight" disabled=${!canContinue()} onClick=${() => setStep(step + 1)}>Continue</${Btn}>`}
        </div>
      </div>
    </div>
  </div>`;
}

export default RequestWizard;
