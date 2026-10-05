// Raise Request — the single window (FRD Section 14.2). Any authenticated user,
// from any business or Legal department, raises to any Legal team:
//   Step 1 select the target team → Step 2 module + sub-type → Step 3 the
//   common fields plus that module's request fields → submit → the request
//   enters the team's queue, is auto-assigned, and lands in My Requests.
// The requester's view of what they raised is status / stage / owner / TAT only.
import { html, cx, fmt, useState, useMemo, useEffect, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Field, Input, Textarea, Empty, Modal } from "../ui.js";
import { navigate } from "../router.js";
import { COMPANIES, entityName } from "../data.js";
import { LEGAL_TEAMS, teamShort, teamTone, masterList } from "../org.js";
import { MODULES, moduleByKey, modulesForTeam, subTypesOf, fieldOptions, slaFor, totalSla } from "../modules.js";
import { tatV2 } from "../tat2.js";
import { useCollection, useMasterData, raiseModuleRequest, addModCost, personName, getCollection, getFormConfig, personEmail } from "../store.js";
import { useActiveUser, isLegal, landingFor } from "../rbac.js";
import { isRequesterDoor } from "./login.js";
import { TatChip, EntityQuickAdd } from "./module.js";
import { toast } from "../toast.js";
import { api } from "../api.js";
import { RequestWizard } from "../portal/wizard.js";
import { NewRequest } from "./contractrequests.js";

function StepDots({ step }) {
  return html`<div class="raisedots">
    ${["Legal team", "Module & type", "Details", "Done"].map((l, i) => html`<div key=${l} class=${cx("raisedots__item", i < step && "done", i === step && "current")}>
      <span class="raisedots__n">${i < step ? html`<${Icon} name="check" size=11 />` : i + 1}</span>${l}
    </div>`)}
  </div>`;
}

function MyRequests({ viewer }) {
  const all = useCollection("modRequests");
  const mine = all
    .filter((r) => r.requestedById === viewer.id)
    .sort((a, b) => new Date(b.dateRaised) - new Date(a.dateRaised));
  if (!mine.length) return null;
  return html`<div class="card" style="padding:0">
    <div class="row" style="padding:14px 16px 4px">
      <span class="panel__title">My requests</span>
      <span class="tiny muted">— status, stage, owner and turnaround of what you raised; internal notes stay with the team</span>
    </div>
    <div class="tablewrap"><table class="table">
      <thead><tr><th>Ref</th><th>Request</th><th>Legal team</th><th>Stage</th><th>Owner</th><th>TAT</th></tr></thead>
      <tbody>${mine.map((r) => {
        const def = moduleByKey(r.moduleKey);
        return html`<tr key=${r.id} class="clickable" onClick=${() => navigate("/m/" + r.moduleKey + "/" + r.id)}>
          <td class="mono tiny">${r.id}</td>
          <td style="max-width:340px"><div class="ellipsis">${r.title}</div></td>
          <td><${Pill} tone=${teamTone(r.legalTeam)}>${teamShort(r.legalTeam)}</${Pill}></td>
          <td><${Pill} tone=${r.status === "Closed" ? "gray" : "blue"}>${r.stage}</${Pill}></td>
          <td>${personName(r.owner)}</td>
          <td><${TatChip} t=${tatV2(def, r)} /></td>
        </tr>`;
      })}</tbody>
    </table></div>
  </div>`;
}

/* A CONTRACT REQUEST IS ITS OWN FRONT DOOR (§17).
 *
 * The portal opened straight onto the generic legal-request wizard, so a
 * requester who needed an NDA — the single most common thing the business asks
 * Legal for — described it in prose, Legal read the prose, decided it was a
 * contract, and started the contract request by hand. The structured form the
 * lawyers approved was on the other side of a triage step it did not need.
 *
 * Both doors are offered, and the wizard is still underneath: "something else"
 * is the honest default for everything that is not an agreement, and nothing is
 * taken away from it.
 */
function ContractRequestDoor() {
  const [types, setTypes] = useState(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    let alive = true;
    api.crf.types().then((d) => alive && setTypes((d && d.types) || []), () => alive && setTypes([]));
    return () => { alive = false; };
  }, []);
  /* THE DOOR IS OFFERED WHILE THE SCHEMA IS STILL LOADING, AND IF IT FAILS.
     Hiding it until the type list answered meant it never appeared on the
     requester portal at all: a portal requester is anonymous to this server
     outside Cloudflare Access, so the schema call is refused and the most
     common request in the business silently lost its front door. The picker
     below says plainly when it cannot read the list; a blank panel where an
     action belongs says nothing. */
  const unavailable = types !== null && types.length === 0;
  return html`<div class="ppage" style="padding-bottom:0">
    <div class="pwiz" style="padding-bottom:0">
      <div class="card card--pad" style="margin-bottom:16px">
        <div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:260px">
            <div class="strong" style="font-size:15px">Do you need a contract or agreement drawn up?</div>
            <div class="tiny muted" style="margin-top:4px">
              Leases, service agreements, NDAs, joint ventures and the rest have a form of their own —
              it asks for the commercial terms Legal would otherwise have to come back and ask you for,
              and it routes straight to your HOD.
            </div>
          </div>
          <${Btn} variant="primary" icon="plus" disabled=${types === null}
            onClick=${() => setPicking(true)}>New contract request</${Btn}>
        </div>
        <div class="tiny muted" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          For anything else — advice, a notice, a dispute, a licence — use the form below.
        </div>
      </div>
    </div>
    ${picking && (unavailable
      ? html`<${Modal} title="New contract request" icon="plus" width=${560} onClose=${() => setPicking(false)}>
          <div class="tiny">The list of agreement types could not be read for this sign-in. Raise it with the
          form below and Legal will start the contract request — nothing is lost, it simply takes one more
          step. If this persists, it is the requester portal's connection to LegalOS, not your request.</div>
        </${Modal}>`
      : html`<${NewRequest} types=${types} onClose=${() => setPicking(false)} />`)}
  </div>`;
}

// Raise Request is role-aware (PRD §3.1). A BUSINESS requester never chooses a// Raise Request is role-aware (PRD §3.1). A BUSINESS requester never chooses a
// legal team/module — they get the plain-language front door that maps their
// words to a proposed category and drops the request into Legal's TRIAGE queue
// (the same RequestWizard the requester portal uses, feeding submitLegalRequest
// → `requests`). Legal staff keep the team-first module wizard (→ modRequests).
export default function Raise({ id }) {
  const viewer = useActiveUser();
  const requester = !isLegal(viewer);
  // Only business requesters raise a legal request (PRD §3.1). Legal personnel
  // view and work on requests per hierarchy — a bare /raise sends them back to
  // their landing (a module deep-link still opens that module's form, which is
  // legal work, not the request front door).
  useEffect(() => { if (!requester && !id) navigate(landingFor(viewer)); }, [requester, id]);

  if (requester) {
    const cfg = getFormConfig();
    const me = {
      name: viewer.name,
      email: viewer.email || personEmail(viewer.id),
      company: viewer.company || null,
      department: viewer.dept || null,
      unit: viewer.unit || null,
      source: viewer.source || null,
    };
    return html`<${Fragment}>
      <${ContractRequestDoor} />
      <${RequestWizard} cfg=${cfg} me=${me} stampId=${viewer.id} captureSource=${true}
        channel=${isRequesterDoor() ? "portal" : "internal"} />
    </${Fragment}>`;
  }
  if (id) return html`<${RaiseModule} id=${id} />`;
  return html`<div class="page"><${Empty} icon="lock" title="Raising is for business teams"
    text="You view and work on requests here — legal requests are raised by the business, then triaged and assigned to Legal." /></div>`;
}

function RaiseModule({ id }) {
  const md = useMasterData();
  const viewer = useActiveUser();
  // Deep link: /raise/<moduleKey> preselects team + module.
  const preDef = id ? moduleByKey(id) : null;

  const [step, setStep] = useState(preDef ? 2 : 0);
  const [teamKey, setTeamKey] = useState(preDef ? preDef.team : "");
  const [modKey, setModKey] = useState(preDef ? preDef.key : "");
  const [subType, setSubType] = useState("");
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState(viewer.dept === "Legal" ? "" : viewer.dept || "");
  const [entityId, setEntityId] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [driveLink, setDriveLink] = useState("");
  const [files, setFiles] = useState([]);
  const [fields, setFields] = useState({});
  const [estCost, setEstCost] = useState("");
  const [attribution, setAttribution] = useState("Legal operating budget");
  const [errors, setErrors] = useState([]);
  const [result, setResult] = useState(null);

  const def = moduleByKey(modKey);
  const reqFields = useMemo(() => (def ? def.fields.filter((f) => f.request) : []), [def]);
  const visibleReqFields = reqFields.filter((f) => !f.showIf || f.showIf(fields, { subType, fields }));

  const submit = () => {
    const payload = {
      moduleKey: modKey,
      title, subType: subType || null,
      requestingDept: dept || (viewer.dept === "Legal" ? "Legal" : viewer.dept) || "Operations",
      requestedBy: { name: viewer.name, designation: viewer.role, contact: viewer.email },
      requestedById: viewer.id,
      // Where it came from. A request raised on the business door carries that
      // channel all the way into Legal's triage queue, so the team can see it
      // arrived from the requester portal rather than from inside Legal.
      source: isRequesterDoor() ? "portal" : "app",
      entityId: entityId || null,
      priority,
      driveLink: driveLink || null,
      /* The record carries what is attached; the BYTES are uploaded to the
         server immediately below, against the request that was just created. */
      attachments: files.map((f, i) => ({ id: "ATT-" + (i + 1), name: f.name, sizeKb: Math.round(f.size / 1024) })),
      /* THE FILES THEMSELVES. The record describes them; these are uploaded by
         the store once the server has assigned the request its id, which is the
         only moment both the bytes and the id exist. */
      files,
      fields,
    };
    const r = raiseModuleRequest(payload);
    if (!r.ok) { setErrors(r.errors || ["could not submit"]); return; }
    if (estCost && Number(estCost) > 0) {
      addModCost(r.id, { type: "Other", estimated: Number(estCost), actual: null, currency: "PKR", attribution }, viewer.id);
    }
    setErrors([]);
    setResult(r);
    setStep(3);
    toast(r.id + " submitted — assigned to " + personName(r.record.owner));
  };

  const setF = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  return html`<div class="page">
    <div class="page__head">
      <div>
        <h2 class="page__title">Raise a Legal request</h2>
        <div class="page__sub">One front door for all three Legal teams. You are raising as <b>${viewer.name}</b> (${viewer.role}).</div>
      </div>
    </div>

    <${StepDots} step=${step} />

    ${step === 0 && html`<div class="raiseteams">
      ${LEGAL_TEAMS.map((t) => html`<div key=${t.key} class=${cx("raiseteam", teamKey === t.key && "active")}
        onClick=${() => { setTeamKey(t.key); setModKey(""); setStep(1); }}>
        <div class=${"raiseteam__ico raiseteam__ico--" + t.tone}><${Icon} name=${t.icon} size=20 /></div>
        <div class="raiseteam__name">${t.name}</div>
        <div class="raiseteam__fns">${t.functions.join(" · ")}</div>
        <div class="raiseteam__go">Select <${Icon} name="arrowRight" size=13 /></div>
      </div>`)}
    </div>`}

    ${step === 1 && html`<div class="card">
      <div class="row" style="margin-bottom:12px">
        <span class="strong">${teamShort(teamKey)} — pick the module</span>
        <span class="spacer"></span>
        <${Btn} size="sm" icon="arrowLeft" onClick=${() => setStep(0)}>Change team</${Btn}>
      </div>
      <div class="raisemods">
        ${modulesForTeam(teamKey).map((m) => html`<div key=${m.key} class=${cx("raisemod", modKey === m.key && "active")}
          onClick=${() => { setModKey(m.key); setSubType(""); setFields({}); setStep(2); }}>
          <${Icon} name=${m.icon} size=17 />
          <div>
            <div class="raisemod__name">${m.label}</div>
            <div class="tiny muted">${m.workflow.length} stages${m.slas && Object.keys(m.slas).length ? " · staged SLAs" : ""}</div>
          </div>
        </div>`)}
      </div>
    </div>`}

    ${step === 2 && def && html`<div class="card">
      <div class="row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <${Pill} tone=${teamTone(def.team)}>${teamShort(def.team)}</${Pill}>
        <span class="strong">${def.label}</span>
        <span class="spacer"></span>
        <${Btn} size="sm" icon="arrowLeft" onClick=${() => setStep(1)}>Change module</${Btn}>
      </div>

      <div class="modeditgrid">
        <${Field} label="Short subject *">
          <${Input} placeholder=${"What do you need? e.g. " + (def.noun === "contract request" ? "PPA for the new Jeddah project" : "…")} value=${title} onInput=${(e) => setTitle(e.target.value)} />
        </${Field}>
        <${Field} label=${def.subTypeLabel}>
          <select class="input" value=${subType} onChange=${(e) => setSubType(e.target.value)}>
            <option value="">Select…</option>
            ${subTypesOf(def, md).map((s) => html`<option key=${s}>${s}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Requesting department *">
          <select class="input" value=${dept} onChange=${(e) => setDept(e.target.value)}>
            <option value="">Select…</option>
            ${masterList(md, "requestingDepartments").map((s) => html`<option key=${s}>${s}</option>`)}
            <option value="Legal">Legal (inter-team)</option>
          </select>
        </${Field}>
        <${Field} label="Linked entity (registry)">
          <select class="input" value=${entityId} onChange=${(e) => setEntityId(e.target.value)}>
            <option value="">Select…</option>
            ${COMPANIES.filter((c) => c.type === "Group Entity").map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Priority">
          <select class="input" value=${priority} onChange=${(e) => setPriority(e.target.value)}>
            <option>Normal</option><option>High</option>
          </select>
        </${Field}>
        <${Field} label="Google Drive reference" hint="Link a folder or file — no re-uploading.">
          <${Input} placeholder="https://drive.google.com/…" value=${driveLink} onInput=${(e) => setDriveLink(e.target.value)} />
        </${Field}>
      </div>

      ${visibleReqFields.length > 0 && html`<div class="raisesep">${def.label} details</div>`}
      <div class="modeditgrid">
        ${visibleReqFields.map((f) => html`<${Field} key=${f.key} label=${f.label + (f.required ? " *" : "")} hint=${f.hint}>
          ${f.type === "select" ? html`<select class="input" value=${fields[f.key] || ""} onChange=${(e) => setF(f.key, e.target.value)}>
              <option value="">Select…</option>
              ${fieldOptions(f, md, { subType, fields }).map((o) => html`<option key=${o}>${o}</option>`)}
            </select>`
          : f.type === "entity" ? html`<div class="row" style="gap:6px">
              <select class="input" style="flex:1" value=${fields[f.key] || ""} onChange=${(e) => setF(f.key, e.target.value)}>
                <option value="">Select from the registry…</option>
                ${(getCollection("companies") || COMPANIES).map((c) => html`<option key=${c.id} value=${c.id}>${c.name} (${c.type}${(c.roles || []).length ? " — " + c.roles.join(", ") : ""})</option>`)}
              </select>
              <${EntityQuickAdd} viewer=${viewer} onCreated=${(id) => setF(f.key, id)} />
            </div>`
          : f.type === "record" ? html`<select class="input" value=${fields[f.key] || ""} onChange=${(e) => setF(f.key, e.target.value)}>
              <option value="">— none —</option>
              ${(getCollection("modRequests") || []).filter((r) => r.moduleKey === f.recordModule).map((r) => html`<option key=${r.id} value=${r.id}>${r.id} — ${r.title}</option>`)}
            </select>`
          : f.type === "textarea" ? html`<${Textarea} rows=3 value=${fields[f.key] || ""} onInput=${(e) => setF(f.key, e.target.value)} />`
          : f.type === "date" ? html`<${Input} type="date" value=${fields[f.key] || ""} onInput=${(e) => setF(f.key, e.target.value)} />`
          : f.type === "toggle" ? html`<select class="input" value=${fields[f.key] ? "Yes" : "No"} onChange=${(e) => setF(f.key, e.target.value === "Yes")}>
              <option>No</option><option>Yes</option>
            </select>`
          : (f.type === "number" || f.type === "money") ? html`<${Input} type="number" value=${fields[f.key] == null ? "" : fields[f.key]} onInput=${(e) => setF(f.key, e.target.value === "" ? null : Number(e.target.value))} />`
          : html`<${Input} value=${fields[f.key] || ""} onInput=${(e) => setF(f.key, e.target.value)} />`}
        </${Field}>`)}
      </div>

      <div class="raisesep">Attachments & cost</div>
      <div class="modeditgrid">
        <${Field} label="Supporting documents" hint="Reference documents at request stage.">
          <div class="raisefiles">
            ${files.map((f, i) => html`<span key=${i} class="raisefile"><${Icon} name="paperclip" size=12 /> ${f.name}
              <button onClick=${() => setFiles(files.filter((_, j) => j !== i))}><${Icon} name="x" size=11 /></button></span>`)}
            ${/* A REAL FILE, NOT ITS NAME.
                  This asked the requester to TYPE a filename and attached that
                  string. The request then arrived in Legal naming a document
                  that had never been uploaded -- which is why Preview and
                  Download on those attachments could not work. */ ""}
            <label class="btn btn--ghost btn--sm" style="cursor:pointer">
              <${Icon} name="upload" size=14 /> Attach
              <input type="file" multiple style="display:none"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                onChange=${(e) => {
    const picked = [...(e.target.files || [])];
    if (picked.length) setFiles([...files, ...picked]);
    e.target.value = "";
  }} />
            </label>
          </div>
        </${Field}>
        <${Field} label="Estimated cost (optional, PKR)" hint="Section 13 — refined by Legal at closure.">
          <${Input} type="number" value=${estCost} onInput=${(e) => setEstCost(e.target.value)} />
        </${Field}>
        <${Field} label="Cost attribution" hint="Whether this sits on Legal's budget or is recharged to you.">
          <select class="input" value=${attribution} onChange=${(e) => setAttribution(e.target.value)}>
            <option>Legal operating budget</option>
            <option>Recharged to requesting department</option>
          </select>
        </${Field}>
      </div>

      ${errors.length > 0 && html`<div class="modwarn" style="margin-top:10px">
        <${Icon} name="alertTriangle" size=14 /> ${errors.join(" · ")}
      </div>`}
      <div class="row" style="margin-top:16px">
        <span class="tiny muted">
          ${def.slas && Object.keys(def.slas).length
            ? "Stage SLAs apply — e.g. " + Object.entries(def.slas).slice(0, 2).map(([s, v]) => `${s}: ${typeof v === "number" ? v + "d" : "3–7d by template"}`).join(", ") + "."
            : "Turnaround is tracked from assignment, net of any time with other departments."}
        </span>
        <span class="spacer"></span>
        <${Btn} variant="primary" icon="send" onClick=${submit}>Submit to ${teamShort(def.team)}</${Btn}>
      </div>
    </div>`}

    ${step === 3 && result && html`<div class="card raisedone">
      <div class="raisedone__ico"><${Icon} name="checkcircle" size=26 /></div>
      <h3>Request ${result.id} is in the ${teamShort(result.record.legalTeam)} queue</h3>
      <p>Auto-assigned to <b>${personName(result.record.owner)}</b> per the team's rules. You will be notified on
      every stage change and at closure; track it any time under My Requests below.</p>
      <div class="row" style="gap:8px;justify-content:center">
        <${Btn} variant="primary" onClick=${() => navigate("/m/" + result.record.moduleKey + "/" + result.id)}>Open ${result.id}</${Btn}>
        <${Btn} icon="plus" onClick=${() => { setStep(0); setTeamKey(""); setModKey(""); setTitle(""); setFields({}); setResult(null); setFiles([]); }}>Raise another</${Btn}>
      </div>
    </div>`}

    <${MyRequests} viewer=${viewer} />
  </div>`;
}
