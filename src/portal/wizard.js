// SPRINT 4 — the guided request flow.
//
//   1  Nature of Matter    (only `fullFlow` natures continue; the rest are
//                           captured and flagged for manual routing)
//   2  Company / Entity     (Contracts only)
//   3  Type of Contract     (ONLY the types mapped to the chosen company)
//   4  Request type & details + document uploads
//   5  Review & submit      → submitLegalRequest()
//
// Every option on every step is read from `formConfig`, so an admin edit in
// LegalOS → Settings → Request Form changes this form with no code change.
import { html, cx, fmt, useState, useMemo, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Field, Input, Textarea, Stepper, Risk, AICard, Empty } from "../ui.js";
import { navigate } from "../router.js";
import {
  useFormConfig, contractTypesFor, submitLegalRequest, duplicateCheck,
  useCollection, getCollection,
} from "../store.js";
import {
  contractTypeMeta, entityById, entityName, CONTRACT_TYPE_CODES, nameOf,
} from "../data.js";
import { tatDaysFor } from "../tat.js";

const STEP_LABELS = ["Nature", "Company", "Contract type", "Details", "Review"];
const CURRENCIES = ["SAR", "PKR", "AED", "USD", "GBP", "EUR"];
const NEEDS_PARENT = new Set(["Amendment", "Revision", "Extension", "Termination"]);

/* ---------------- a big selectable option card ---------------- */
function OptionCard({ active, icon, title, sub, badge, onClick, disabled }) {
  return html`<button class=${cx("popt", active && "popt--on", disabled && "popt--off")} onClick=${disabled ? null : onClick} disabled=${!!disabled}>
    ${icon && html`<span class="popt__ico"><${Icon} name=${icon} size=17 /></span>`}
    <span style="flex:1;min-width:0;text-align:left">
      <span class="popt__title">${title}</span>
      ${sub && html`<span class="popt__sub">${sub}</span>`}
    </span>
    ${badge}
    ${active && html`<${Icon} name="checkcircle" size=18 style=${{ color: "var(--brand)", flex: "none" }} />`}
  </button>`;
}

export function RequestWizard({ cfg, me, stampId }) {
  const requests = useCollection("requests");
  const contracts = useCollection("contracts");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);

  const natures = (cfg.natures || []).filter((n) => n.enabled);
  const companies = (cfg.companies || []).filter((c) => c.enabled);
  const requestTypes = cfg.requestTypes || ["New"];

  const [f, setF] = useState({
    nature: "",
    company: me.company && companies.some((c) => c.key === me.company) ? me.company : "",
    contractType: "",
    requestType: requestTypes[0] || "New",
    title: "", description: "", counterparty: "",
    value: "", currency: "SAR",
    dueDate: "",
    linkedContractId: "",
    files: [],
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const natureCfg = natures.find((n) => n.key === f.nature) || null;
  const isContracts = !!(natureCfg && natureCfg.fullFlow);

  // Step 3 reads the admin-controlled matrix — this is the whole point.
  const mappedTypes = useMemo(() => (f.company ? contractTypesFor(f.company) : []), [f.company, cfg]);
  const companyCfg = companies.find((c) => c.key === f.company) || null;
  const entity = companyCfg ? entityById(companyCfg.entityId) : null;

  // Currency follows the entity's jurisdiction unless the requester overrides it.
  useEffect(() => {
    if (!entity) return;
    const cur = { KSA: "SAR", PK: "PKR", UAE: "AED" }[entity.jur] || "USD";
    setF((s) => ({ ...s, currency: cur }));
  }, [entity && entity.id]);

  const entityContracts = useMemo(
    () => (companyCfg ? contracts.filter((c) => c.entityId === companyCfg.entityId) : []),
    [companyCfg && companyCfg.key, contracts]
  );

  const requiredDocs = useMemo(() => {
    const t = (cfg.requiredDocTemplates || {});
    return (t[f.contractType] || t.default || []).slice();
  }, [f.contractType, cfg]);

  const previewTat = f.nature && (cfg.routing || {})[f.nature] && (cfg.routing || {})[f.nature].tatDays
    ? (cfg.routing || {})[f.nature].tatDays
    : tatDaysFor(f.contractType || "default", "medium", f.requestType);

  const dupes = useMemo(
    () => duplicateCheck({ counterparty: f.counterparty, entityId: companyCfg ? companyCfg.entityId : null, linkedContractId: f.linkedContractId || null }),
    [f.counterparty, f.linkedContractId, companyCfg && companyCfg.key, requests]
  );

  const addFile = (name, kind) => {
    const n = f.files.length + 1;
    set("files", [...f.files, { name: name || `Supporting-document-${n}.pdf`, sizeKb: 280 + n * 160, kind: kind || "Attachment" }]);
  };

  /* ---------------- step gating ---------------- */
  // For a non-Contracts nature we skip straight from step 0 to the details step.
  const nextFrom = (s) => {
    if (s === 0) return isContracts ? 1 : 3;
    if (s === 1) return 2;
    if (s === 2) return 3;
    return 4;
  };
  const backFrom = (s) => {
    if (s === 3) return isContracts ? 2 : 0;
    if (s === 4) return 3;
    return Math.max(0, s - 1);
  };
  const canContinue = () => {
    if (step === 0) return !!f.nature;
    if (step === 1) return !!f.company;
    if (step === 2) return !!f.contractType;
    if (step === 3) return !!f.title.trim() && !!f.description.trim();
    return true;
  };

  const submit = () => {
    const res = submitLegalRequest({
      // canonical LegalRequest payload
      requestType: f.requestType,
      contractType: isContracts ? f.contractType || null : null,
      title: f.title,
      entityId: companyCfg ? companyCfg.entityId : null,
      companyTags: companyCfg ? [companyCfg.entityId] : [],
      department: me.department,
      unit: me.unit,
      dueDate: f.dueDate ? new Date(f.dueDate + "T00:00:00").toISOString() : undefined,
      requesterId: stampId,
      requesterEmail: me.email,
      description: f.description,
      attachments: f.files,
      linkedContractId: f.linkedContractId || null,
      riskPreliminary: "medium",
      counterparty: f.counterparty,
      value: f.value ? Number(String(f.value).replace(/[^0-9.]/g, "")) : null,
      currency: f.currency,
      // Sprint 4 additions
      channel: "portal",
      source: me.source,
      natureOfMatter: f.nature,
      company: f.company || me.company || null,
    });
    if (!res.ok) { setErrors(res.errors); return; }
    setResult(res);
  };

  /* ---------------- confirmation ---------------- */
  if (result && result.ok) {
    const manual = result.record.routedManually;
    return html`<div class="ppage">
      <div class="card card--pad col" style="gap:18px;max-width:660px;margin:0 auto">
        <div class="col center" style="gap:12px;text-align:center">
          <div class="metric__icon" style="width:52px;height:52px;background:var(--success-bg);color:var(--success)">
            <${Icon} name="checkcircle" size=26 />
          </div>
          <div class="strong" style="font-size:19px">Request submitted</div>
          <div class="dim" style="font-size:13px">
            The legal team can see it now. Track it any time from <b>My requests</b>.
          </div>
        </div>

        <div class="pconfirm">
          <div class="kv"><div class="kv__l">Your tracking ID</div><div class="kv__v mono" style="font-size:15px">${result.id}</div></div>
          <div class="kv"><div class="kv__l">Turnaround</div><div class="kv__v">${result.tat.days} working days</div></div>
          <div class="kv"><div class="kv__l">Target date</div><div class="kv__v">${fmt.date(result.tat.dueAt)}</div></div>
          <div class="kv"><div class="kv__l">Nature</div><div class="kv__v">${f.nature}</div></div>
          ${isContracts && html`<div class="kv"><div class="kv__l">Contract type</div><div class="kv__v">${f.contractType}</div></div>`}
          <div class="kv"><div class="kv__l">Raised from</div><div class="kv__v">${me.source || "—"}</div></div>
        </div>

        ${manual
          ? html`<div class="banner banner--warn" style="align-items:flex-start">
              <${Icon} name="alertCircle" size=17 />
              <div>
                <div class="strong tiny">${f.nature} requests are routed manually for now</div>
                <div class="tiny" style="margin-top:3px;opacity:.9">
                  Your request has been logged in full and a lawyer will pick it up and come back to you.
                  Nothing is lost — you can still upload documents and message the team on it.
                </div>
              </div>
            </div>`
          : html`<div class="banner banner--info" style="align-items:flex-start">
              <${Icon} name="workflow" size=17 />
              <div>
                <div class="strong tiny">What happens next</div>
                <div class="tiny" style="margin-top:3px;opacity:.9">
                  Legal triages it, confirms the owner and starts the clock. If they need a document
                  from you, it appears on your request and you will see it flagged here.
                </div>
              </div>
            </div>`}

        ${(result.record.requiredDocs || []).length > 0 && html`<div>
          <div class="fpop__lbl">Documents legal will likely ask for</div>
          <div class="col" style="gap:5px;margin-top:6px">
            ${result.record.requiredDocs.map((d) => html`<div key=${d.id} class="row" style="gap:8px">
              <${Icon} name=${d.status === "received" ? "checkcircle" : "circle"} size=14 style=${{ color: d.status === "received" ? "var(--success)" : "var(--text-3)" }} />
              <span class="tiny">${d.name}</span>
            </div>`)}
          </div>
          <div class="tiny muted" style="margin-top:8px">You can upload these now from the request page.</div>
        </div>`}

        ${result.duplicates.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
          <${Icon} name="alertTriangle" size=17 />
          <div>
            <div class="strong tiny">Heads-up — similar requests are already open</div>
            ${result.duplicates.map((d) => html`<div key=${d.id} class="tiny" style="margin-top:3px;opacity:.9">${d.id} — ${d.title}</div>`)}
          </div>
        </div>`}

        <div class="row" style="gap:8px">
          <${Btn} variant="ghost" onClick=${() => navigate("/requests")}>My requests</${Btn}>
          <div class="spacer"></div>
          <${Btn} variant="primary" iconRight="arrowRight" onClick=${() => navigate("/requests/" + result.id)}>
            Open ${result.id}
          </${Btn}>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- the wizard ---------------- */
  // Non-Contracts natures show a 3-dot stepper (Nature → Details → Review).
  const shownSteps = isContracts ? STEP_LABELS : [STEP_LABELS[0], STEP_LABELS[3], STEP_LABELS[4]];
  const shownIndex = isContracts ? step : (step === 0 ? 0 : step === 3 ? 1 : 2);

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
        <${Stepper} steps=${shownSteps} current=${shownIndex} />
      </div>

      <div class="card card--pad col" style="gap:18px">
        ${step === 0 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">What is this about?</div>
            <div class="pwiz__hint">Pick the nature of the matter — it decides who picks it up and how fast.</div>
          </div>
          <div class="pgrid">
            ${natures.map((n) => html`<${OptionCard} key=${n.key} icon=${n.icon} title=${n.label} sub=${n.blurb}
              active=${f.nature === n.key}
              badge=${!n.fullFlow ? html`<${Pill} tone="amber">manual routing</${Pill}>` : null}
              onClick=${() => { set("nature", n.key); if (n.key !== f.nature) { set("contractType", ""); } }} />`)}
          </div>
          ${natureCfg && !natureCfg.fullFlow && html`<div class="banner banner--info" style="align-items:flex-start">
            <${Icon} name="alertCircle" size=17 />
            <div>
              <div class="strong tiny">The guided flow for ${natureCfg.label} is coming soon</div>
              <div class="tiny" style="margin-top:3px;opacity:.9">
                You can still submit it now — we capture the details, log it with the legal team and a
                lawyer routes it manually. Nothing is lost.
              </div>
            </div>
          </div>`}
        </${Fragment0}>`}

        ${step === 1 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">Which company is this for?</div>
            <div class="pwiz__hint">The entity that will sign the paper. It decides which contract types you see next.</div>
          </div>
          <div class="pgrid">
            ${companies.map((c) => {
              const e = entityById(c.entityId);
              const n = (cfg.companyContractTypes || {})[c.key] || [];
              return html`<${OptionCard} key=${c.key} icon="building" title=${c.label}
                sub=${e ? `${e.jurisdiction} · ${n.length} contract types available` : `${n.length} contract types available`}
                active=${f.company === c.key}
                onClick=${() => { set("company", c.key); set("contractType", ""); set("linkedContractId", ""); }} />`;
            })}
          </div>
        </${Fragment0}>`}

        ${step === 2 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">What kind of contract?</div>
            <div class="pwiz__hint">
              These are the types available for <b>${companyCfg ? companyCfg.label : "this company"}</b>.
              Legal maintains this list.
            </div>
          </div>
          ${mappedTypes.length === 0
            ? html`<${Empty} icon="file" title="No contract types configured"
                text=${`Legal has not mapped any contract types to ${companyCfg ? companyCfg.label : "this company"} yet. Pick another company, or submit as Advice and we will route it.`} />`
            : html`<div class="pgrid">
                ${mappedTypes.map((t) => {
                  const meta = contractTypeMeta(t);
                  return html`<${OptionCard} key=${t} icon="file" title=${meta ? meta.name : t}
                    sub=${meta ? meta.subdivision : null}
                    active=${f.contractType === t}
                    onClick=${() => set("contractType", t)} />`;
                })}
              </div>`}
        </${Fragment0}>`}

        ${step === 3 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">Tell us what you need</div>
            <div class="pwiz__hint">The more context you give, the fewer questions come back to you.</div>
          </div>

          ${isContracts && html`<${Field} label="Is this new paper, or a change to something existing?">
            <div class="row wrap" style="gap:8px">
              ${requestTypes.map((t) => html`<button key=${t} class=${cx("chip", f.requestType === t && "active")}
                onClick=${() => set("requestType", t)}>
                <${Icon} name=${f.requestType === t ? "checkcircle" : "file"} size=14 />${t}
              </button>`)}
            </div>
          </${Field}>`}

          <${Field} label="Give it a short title">
            <${Input} placeholder=${isContracts && f.contractType ? `e.g. ${f.contractType} — counterparty name` : "e.g. Can we use this logo in a campaign?"}
              value=${f.title} onInput=${(e) => set("title", e.target.value)} />
          </${Field}>

          <${Field} label="What do you need, and why now?" hint="Background, key terms, and what is driving the deadline.">
            <${Textarea} rows=4 placeholder="Describe the deal or question in your own words…"
              value=${f.description} onInput=${(e) => set("description", e.target.value)} />
          </${Field}>

          <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
            ${isContracts && html`<${Field} label="Counterparty" hint="Leave blank if not agreed yet.">
              <${Input} placeholder="e.g. Retal Urban Development Co." value=${f.counterparty} onInput=${(e) => set("counterparty", e.target.value)} />
            </${Field}>`}
            <${Field} label="Needed by" hint="Legal confirms the committed date on triage.">
              <${Input} type="date" value=${f.dueDate} onInput=${(e) => set("dueDate", e.target.value)} />
            </${Field}>
            ${isContracts && html`<${Field} label="Estimated value">
              <${Input} placeholder="e.g. 4600000" value=${f.value} onInput=${(e) => set("value", e.target.value)} />
            </${Field}>`}
            ${isContracts && html`<${Field} label="Currency">
              <select class="select" value=${f.currency} onChange=${(e) => set("currency", e.target.value)}>
                ${CURRENCIES.map((c) => html`<option key=${c}>${c}</option>`)}
              </select>
            </${Field}>`}
          </div>

          ${isContracts && NEEDS_PARENT.has(f.requestType) && html`<${Field}
            label=${`Which existing contract are you ${({ Amendment: "amending", Revision: "revising", Extension: "extending", Termination: "terminating" })[f.requestType]}?`}
            hint="Optional — but it lets legal see the history straight away.">
            <select class="select" value=${f.linkedContractId} onChange=${(e) => set("linkedContractId", e.target.value)}>
              <option value="">— I'm not sure / not listed —</option>
              ${entityContracts.map((c) => html`<option key=${c.id} value=${c.id}>${c.id} · ${c.title}</option>`)}
            </select>
          </${Field}>`}

          <${Field} label="Attach documents" hint="Drafts, deeds, quotes, approvals — anything legal will need.">
            <div class="col" style="gap:7px">
              ${f.files.map((a, i) => html`<div key=${i} class="docrow">
                <${Icon} name="paperclip" size=15 />
                <div style="flex:1;min-width:0"><div class="strong tiny">${a.name}</div><div class="tiny muted">${a.kind} · ${a.sizeKb} KB</div></div>
                <button class="iconbtn" style="width:24px;height:24px" onClick=${() => set("files", f.files.filter((_, j) => j !== i))}>
                  <${Icon} name="x" size=14 />
                </button>
              </div>`)}
              <div class="row wrap" style="gap:8px">
                <${Btn} variant="soft" size="sm" icon="upload" onClick=${() => addFile()}>Attach a file</${Btn}>
                ${requiredDocs.slice(0, 3).map((d) => html`<${Btn} key=${d} variant="ghost" size="sm" icon="plus"
                  onClick=${() => addFile(d.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() + ".pdf", d)}>${d}</${Btn}>`)}
              </div>
            </div>
          </${Field}>

          ${requiredDocs.length > 0 && html`<div class="banner banner--info" style="align-items:flex-start">
            <${Icon} name="clipboard" size=17 />
            <div>
              <div class="strong tiny">For a ${f.contractType || f.nature} request, legal usually needs:</div>
              <div class="tiny" style="margin-top:3px;opacity:.9">${requiredDocs.join(" · ")}</div>
              <div class="tiny" style="margin-top:3px;opacity:.75">Attach what you have now — you can add the rest later.</div>
            </div>
          </div>`}

          ${dupes.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
            <${Icon} name="alertTriangle" size=17 />
            <div>
              <div class="strong tiny">There is already an open request on this</div>
              ${dupes.slice(0, 3).map((d) => html`<div key=${d.id} class="tiny" style="margin-top:3px;opacity:.9">${d.id} — ${d.title} (${d.status})</div>`)}
              <div class="tiny" style="margin-top:3px;opacity:.75">Carry on if yours is different — legal will link them.</div>
            </div>
          </div>`}
        </${Fragment0}>`}

        ${step === 4 && html`<${Fragment0}>
          <div>
            <div class="pwiz__q">Check it over</div>
            <div class="pwiz__hint">This is exactly what the legal team will receive.</div>
          </div>
          <div class="pconfirm">
            <div class="kv"><div class="kv__l">Nature of matter</div><div class="kv__v">${f.nature}</div></div>
            ${isContracts && html`<div class="kv"><div class="kv__l">Company / entity</div><div class="kv__v">${companyCfg ? companyCfg.label : "—"}</div></div>`}
            ${isContracts && html`<div class="kv"><div class="kv__l">Type of contract</div><div class="kv__v">${f.contractType || "—"}</div></div>`}
            ${isContracts && html`<div class="kv"><div class="kv__l">Request type</div><div class="kv__v">${f.requestType}</div></div>`}
            <div class="kv"><div class="kv__l">Title</div><div class="kv__v">${f.title || "—"}</div></div>
            ${isContracts && html`<div class="kv"><div class="kv__l">Counterparty</div><div class="kv__v">${f.counterparty || "—"}</div></div>`}
            ${isContracts && html`<div class="kv"><div class="kv__l">Value</div><div class="kv__v">${f.value ? fmt.moneyFull(Number(String(f.value).replace(/[^0-9.]/g, "")), f.currency) : "—"}</div></div>`}
            <div class="kv"><div class="kv__l">Needed by</div><div class="kv__v">${f.dueDate ? fmt.date(f.dueDate) : "no date given"}</div></div>
            <div class="kv"><div class="kv__l">Attachments</div><div class="kv__v">${f.files.length || "none"}</div></div>
            <div class="kv"><div class="kv__l">Raised by</div><div class="kv__v">${me.name} · ${me.email}</div></div>
            <div class="kv"><div class="kv__l">Raised from</div><div class="kv__v">${me.source || "—"}</div></div>
          </div>
          ${f.description && html`<div class="spine__desc">${f.description}</div>`}
          <${AICard} title="What happens on submit">
            The request is created with turnaround fixed at <b>${previewTat} working days</b>${
              isContracts && f.contractType ? html` (${f.contractType} × medium risk)` : ""
            }, logged against <b>${companyCfg ? companyCfg.label : me.company || "your entity"}</b>, and lands in the
            legal team's triage queue with your email and site stamped on it.
          </${AICard}>
          ${errors.length > 0 && html`<div class="banner banner--warn"><${Icon} name="alertCircle" size=16 /><span class="tiny">${errors.join(" · ")}</span></div>`}
        </${Fragment0}>`}

        <div class="row" style="gap:8px;padding-top:6px;border-top:1px solid var(--border)">
          ${step > 0
            ? html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(backFrom(step))}>Back</${Btn}>`
            : html`<${Btn} variant="ghost" onClick=${() => navigate("/requests")}>Cancel</${Btn}>`}
          <div class="spacer"></div>
          ${step === 4
            ? html`<${Btn} variant="primary" icon="check" onClick=${submit}>Submit request</${Btn}>`
            : html`<${Btn} variant="primary" iconRight="arrowRight" disabled=${!canContinue()} onClick=${() => setStep(nextFrom(step))}>Continue</${Btn}>`}
        </div>
      </div>
    </div>
  </div>`;
}

// htm needs a component reference to group siblings without a wrapper element.
function Fragment0({ children }) { return children; }

export default RequestWizard;
