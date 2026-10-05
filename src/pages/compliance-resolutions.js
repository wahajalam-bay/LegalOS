// Board Resolutions — organised ENTITY FIRST.
//
// The Drive already stores resolutions this way: 44 entity folders under
// Compliance Data _LegalOS / Resolutions, each holding that company's
// resolutions and authorisations. The UI follows the structure that exists
// rather than inventing a parallel one.
//
// Two views of one dataset: "By entity" is the summary a compliance officer
// actually reads, and picking a company hands over to the full register with
// that entity filtered — so the drill-down is never a second, disconnected page.
//
// "Create new resolution" makes a RESOLUTION, not a legal request. Legal writes
// these itself after receiving a business requirement; routing them through
// intake would misfile the work.
import { html, cx, fmt, useState, useMemo, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Modal, Field, Input, Textarea, Section, Pill, Status, Empty, AICard } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { qualityLabel } from "../registerdefs.js";
import { RegisterShell, RegisterTabs } from "../register.js";
import { useFilterLink } from "../filters.js";
import { navigate, useQuery } from "../router.js";
import { openRecord, registerReturnPath, useRecordTab, usePublishCrumbLeaf } from "../compliancenav.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { useResolutions, useEntities, useResolution, useResolutionEntity } from "../compliancedata.js";
import { useRegister } from "../live.js";
import { resolutionFields2, resolutionColumns2, resolutionViews2, resolutionSearchKeys2 } from "../compliancedefs.js";
import { ActionPanel, UnifiedTimeline, FieldGrid, Select, WorkflowStepper } from "../complianceui.js";
import { LegalDocuments } from "../legaldocuments.js";

const dash = (v) => (v == null || v === "" ? "—" : v);
const today = () => new Date().toISOString().slice(0, 10);

export function ResolutionRegister({ config }) {
  const live = useRegister("resolutions");           // historical rows from the tracker
  const native = useResolutions();                    // resolutions created in LegalOS
  const entities = useEntities();
  const [query, patch] = useQuery();
  const drill = useFilterLink("res");
  const [creating, setCreating] = useState(null);
  const [panelRecord, setPanelRecord] = useState(null);
  const sub = query.rview === "all" ? "all" : "entity";
  const caps = (config && config.capabilities) || {};

  const source = live.rows || [];
  const created = (native.data && native.data.native) || [];

  // One dataset: historical tracker rows and LegalOS-created resolutions in the
  // same register, each carrying its origin so nobody mistakes a 2019 import for
  // a resolution drafted here.
  const rows = useMemo(() => [
    ...created.map((r) => ({ ...r, agenda: r.fields && r.fields.subject, date: r.fields && r.fields.resolutionDate })),
    ...source.map((r) => ({ ...r, origin: "source" })),
  ], [created, source]);

  const groups = (native.data && native.data.byEntity) || [];
  const loading = live.loading || native.loading;

  if (loading && !rows.length) return html`<div class="tiny muted" style="padding:20px 2px">Reading resolutions…</div>`;

  const pendingSig = created.filter((r) => r.signature && (r.signature.key === "pending" || r.signature.key === "partial")).length;
  const executed = created.filter((r) => r.status === "EXECUTED").length;
  const notFiled = created.filter((r) => r.status === "EXECUTED" && r.drive && r.drive.status !== "FILED").length;

  const switcher = html`<div class="row" style="gap:6px;margin-bottom:12px;align-items:center">
    <button type="button" class=${cx("fltbtn", sub === "entity" && "fltbtn--on")}
      aria-pressed=${sub === "entity" ? "true" : "false"}
      onClick=${() => patch({ rview: "entity" })}>By entity</button>
    <button type="button" class=${cx("fltbtn", sub === "all" && "fltbtn--on")}
      aria-pressed=${sub === "all" ? "true" : "false"}
      onClick=${() => patch({ rview: "all" })}>All resolutions</button>
    <div class="spacer"></div>
    ${sub === "entity" && html`<span class="regcount">${rows.length.toLocaleString()} resolutions · ${groups.length} entities</span>`}
    ${caps["compliance.resolution.create"] && html`<${Btn} variant="primary" size="sm" icon="plus"
      onClick=${() => setCreating({ entityKey: "", entity: "" })}>Create new resolution</${Btn}>`}
  </div>`;

  return html`<div>
    <${StatStrip} stats=${[
      { value: rows.length, label: "Resolutions" },
      { value: groups.length, label: "Entities" },
      { value: created.length, label: "Created in LegalOS" },
      { value: pendingSig, label: "Awaiting signature", tone: pendingSig ? "amber" : "",
        onClick: () => patch({ rview: "all", res_sig: "Pending|Partially signed" }) },
      { value: executed, label: "Executed" },
      { value: notFiled, label: "Executed, not filed to Drive", tone: notFiled ? "amber" : "",
        onClick: () => patch({ rview: "all", res_drive: "Not filed|Pending upload" }) },
    ]} />

    ${switcher}

    ${sub === "entity" ? html`<div role="tabpanel" id="regpanel-resolutions" aria-labelledby="regtab-resolutions">
      ${groups.length === 0
        ? html`<${Empty} icon="checksquare" title="No resolutions" text="No resolution register was found." />`
        : html`<div class="tablewrap"><table class="table">
          <thead><tr>
            <th>Entity</th>
            <th style="text-align:right">Resolutions</th>
            <th style="text-align:right">Pending</th>
            <th style="text-align:right">Executed</th>
            <th>Latest</th><th style="width:150px" aria-label="Open"></th>
          </tr></thead>
          <tbody>
            ${groups.map((g) => {
              // Its OWN address. This used to re-filter the page you were
              // already on, which is why "Resolutions > Zameen Media" had no
              // back button, no crumb and no link you could send anyone.
              const open = () => navigate("/compliance/resolutions/entity/" + encodeURIComponent(g.key));
              return html`<tr key=${g.key} class="rowlink" tabIndex=${0} role="link"
                aria-label=${"Open the " + (g.source + g.native) + " resolutions for " + g.name}
                onClick=${open}
                onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
                <td><div class="cell-strong">${g.name}</div></td>
                <td style="text-align:right"><span class="strong">${(g.source + g.native).toLocaleString()}</span>
                  ${g.native > 0 && html`<span class="tiny muted"> (${g.native} in LegalOS)</span>`}</td>
                <td style="text-align:right">${g.pending ? html`<${Pill} tone="amber">${g.pending}</${Pill}>` : html`<span class="tiny muted">—</span>`}</td>
                <td style="text-align:right">${g.executed ? html`<${Pill} tone="green">${g.executed}</${Pill}>` : html`<span class="tiny muted">—</span>`}</td>
                <td><span class="tiny muted">${g.latest ? fmt.date(g.latest) : "—"}</span></td>
                <td><div class="row" style="gap:6px">
                  <span class="tiny" style="color:var(--brand);font-weight:600">View →</span>
                  ${caps["compliance.resolution.create"] && html`<button type="button" class="linkbtn tiny"
                    onClick=${(e) => { e.stopPropagation(); setCreating({ entityKey: g.key, entity: g.name }); }}>+ New</button>`}
                </div></td>
              </tr>`;
            })}
          </tbody>
        </table></div>`}
    </div>` : html`<${RegisterShell}
      tabId="resolutions" ns="res" rows=${rows}
      fields=${resolutionFields2}
      columns=${(f) => resolutionColumns2(f, {
        // The Docs chip goes to that resolution's documents, not to its front
        // page: a nested control that lands somewhere else than the row it sits
        // in is the whole point of having it.
        onOpen: (r) => openRecord("/compliance/resolutions/" + encodeURIComponent(r.id), { tab: "documents" }),
      })}
      views=${resolutionViews2} searchKeys=${resolutionSearchKeys2}
      searchPlaceholder="Search resolutions, entities, subjects…"
      noun=${["resolution", "resolutions"]}
      onRow=${(r) => openRecord("/compliance/resolutions/" + encodeURIComponent(r.id))}
      exportName="board-resolutions" emptyIcon="checksquare"
      defaultSort=${{ key: "date", dir: "desc" }} />`}

    ${creating && html`<${CreateResolutionModal} seed=${creating} config=${config}
      entities=${(entities.data && entities.data.entities) || []}
      onClose=${() => setCreating(null)}
      onDone=${(rec) => { setCreating(null); native.reload(); navigate("/compliance/resolutions/" + encodeURIComponent(rec.id)); }} />`}
    ${panelRecord && html`<${ActionPanel} recordId=${panelRecord} caps=${caps} config=${config}
      onClose=${() => setPanelRecord(null)} onChanged=${() => native.reload()} />`}
  </div>`;
}

/* ======================================================= CREATE RESOLUTION */

export function CreateResolutionModal({ seed, config, entities, onClose, onDone }) {
  const cfg = (config && config.resolutions) || {};
  const [entityKey, setEntityKey] = useState(seed.entityKey || "");
  const [f, setF] = useState({
    resolutionType: (cfg.types && cfg.types[0]) || "Board Resolution",
    subject: "",
    requestingDepartment: "",
    authorizedPerson: "",
    authorizedPersonDesignation: "",
    addressedTo: "",
    urgency: (cfg.urgency && cfg.urgency[0]) || "Normal",
    resolutionDate: today(),
    body: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  /* THE APPROVED TEMPLATES FOR THIS COMPANY'S LEGAL FORM, AND WHO MUST SIGN.
     Both come from the server, which reads them from configuration: a
     partnership is offered partners' wording and needs two partners, an SMC
     resolves through its sole member. The drafting flow never invents wording
     and never names a signatory in code. */
  const [tpl, setTpl] = useState({ templates: [], signatory: null, methods: [], entity: null });
  const [templateKey, setTemplateKey] = useState("");
  useEffect(() => {
    if (!entityKey) { setTpl({ templates: [], signatory: null, methods: [], entity: null }); setTemplateKey(""); return; }
    let alive = true;
    api.compliance.resolutionTemplates(entityKey).then(
      (r) => { if (alive) { setTpl(r || {}); setTemplateKey(""); } },
      () => { if (alive) setTpl({ templates: [], signatory: null, methods: [], entity: null }); }
    );
    return () => { alive = false; };
  }, [entityKey]);

  const ent = entities.find((e) => e.key === entityKey);

  /* Fill the approved wording with what this resolution is actually about.
     A placeholder with nothing to put in it is left visibly unfilled rather
     than quietly deleted -- an unfinished draft should look unfinished. */
  const generate = () => {
    const t = (tpl.templates || []).find((x) => x.key === templateKey);
    if (!t) return;
    const who = f.authorizedPerson || "[authorised person]";
    const body = String(t.body || "")
      .replace(/\{\{entity\}\}/g, (tpl.entity && tpl.entity.name) || (ent && ent.name) || "[entity]")
      .replace(/\{\{authority\}\}/g, f.addressedTo || "[authority]")
      .replace(/\{\{signatory\}\}/g, who);
    setF((d) => ({ ...d, body, subject: d.subject || t.subject || t.title,
      templateKey: t.key, templateTitle: t.title,
      legalForm: (tpl.entity && tpl.entity.legalForm) || null,
      signatoryRole: (tpl.signatory && tpl.signatory.role) || null }));
  };
  const lh = cfg.letterheads || {};
  const letterhead = lh.configured && lh.byEntity ? lh.byEntity[entityKey] : null;

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.createResolution({ entityKey, entity: ent ? ent.name : seed.entity, fields: f });
      toast("Resolution " + r.record.id + " created.", "success");
      onDone(r.record);
    } catch (e) { toast(e.message || "The resolution could not be created.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="Create new resolution" icon="checksquare" width=${700} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !entityKey || !f.subject.trim()} onClick=${go}>Create resolution</${Btn}>`}>
    <div class="col" style="gap:14px">
      <${Field} label="Entity" hint="The company passing the resolution.">
        <${Select} value=${entityKey} onChange=${setEntityKey} placeholder="— Select an entity —"
          options=${entities.map((e) => ({ value: e.key, label: e.name + " (" + e.typeLabel + ")" }))} />
      </${Field}>

      ${entityKey && (tpl.templates || []).length > 0 && html`<${Field} label="Approved template"
        hint=${"Only templates approved for a " + ((tpl.entity && tpl.entity.legalFormLabel) || "company") + " are offered."}>
        <div class="row" style="gap:8px">
          <div style="flex:1"><${Select} value=${templateKey} onChange=${setTemplateKey}
            placeholder="— Draft from scratch —"
            options=${tpl.templates.map((t) => ({ value: t.key, label: t.title }))} /></div>
          <${Btn} size="sm" variant="soft" icon="sparkles" disabled=${!templateKey} onClick=${generate}>Generate draft</${Btn}>
        </div>
      </${Field}>`}

      ${entityKey && tpl.signatory && html`<div class="tiny muted">
        <strong>Signature.</strong> A ${(tpl.entity && tpl.entity.legalFormLabel) || "company"} resolution is signed by
        ${tpl.signatory.minimum > 1 ? tpl.signatory.minimum + " " : ""}${tpl.signatory.role}${tpl.signatory.minimum > 1 ? "s" : ""}.
        ${tpl.signatory.note || ""}
        ${(tpl.methods || []).some((mm) => !mm.configured)
          ? " E-signature is not connected to LegalOS, so signing is by " +
            (tpl.methods || []).filter((mm) => mm.configured).map((mm) => mm.label.toLowerCase()).join(" or ") + "."
          : ""}
      </div>`}

      ${entityKey && html`<div class="tiny ${letterhead ? "muted" : ""}" style=${letterhead ? "" : "color:var(--warning-text)"}>
        ${letterhead
          ? "Letterhead: " + letterhead.name + " — applied automatically."
          : "Letterhead not configured for this entity. The draft will say so on its face rather than ship unbranded; add an approved letterhead asset in config/compliance-rules.json."}
      </div>`}

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Resolution type">
          <${Select} value=${f.resolutionType} onChange=${(v) => setF({ ...f, resolutionType: v })}
            options=${cfg.types || ["Board Resolution", "Partners Resolution"]} /></${Field}>
        <${Field} label="Urgency">
          <${Select} value=${f.urgency} onChange=${(v) => setF({ ...f, urgency: v })}
            options=${cfg.urgency || ["Normal", "Urgent"]} /></${Field}>
      </div>

      <${Field} label="Subject" hint="Pick a configured subject, or type your own below.">
        <${Select} value=${f.subject} onChange=${(v) => setF({ ...f, subject: v })} placeholder="— Select a subject —"
          options=${cfg.subjects || []} />
      </${Field}>
      <${Field} label="Subject (free text)"><${Input} value=${f.subject} onInput=${set("subject")} /></${Field}>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Addressed to / authority">
          <${Select} value=${f.addressedTo} onChange=${(v) => setF({ ...f, addressedTo: v })} placeholder="— None —"
            options=${cfg.authorities || []} /></${Field}>
        <${Field} label="Requesting department"><${Input} value=${f.requestingDepartment} onInput=${set("requestingDepartment")} /></${Field}>
        <${Field} label="Person being authorised"><${Input} value=${f.authorizedPerson} onInput=${set("authorizedPerson")} /></${Field}>
        <${Field} label="Designation / function"><${Input} value=${f.authorizedPersonDesignation} onInput=${set("authorizedPersonDesignation")} /></${Field}>
        <${Field} label="Resolution date"><${Input} type="date" value=${f.resolutionDate} onInput=${set("resolutionDate")} /></${Field}>
      </div>

      <${Field} label="Resolution text" hint="The operative wording. You can edit this later, before finalizing.">
        <${Textarea} rows=${6} value=${f.body} onInput=${set("body")}
          placeholder="RESOLVED THAT …" /></${Field}>
      <${Field} label="Notes"><${Textarea} rows=${2} value=${f.notes} onInput=${set("notes")} /></${Field}>

      <${AICard} title="What happens next">
        The resolution is created as a draft against this entity and appears in its register immediately.
        From there you generate the document, send it for legal review, finalize it, select signatories,
        collect wet or electronic signatures, mark it executed and record its Drive filing.
      </${AICard}>
    </div>
  </${Modal}>`;
}

/* ========================================================== ENTITY REGISTER */

/* One company's resolutions, at /compliance/resolutions/entity/<key>.
 *
 * "By entity" used to open a filtered copy of the page you were already on: no
 * heading, no crumb, no address to send anyone, and no way back except the
 * browser. An entity is a level in this hierarchy, so it is a page.
 *
 * It also shows what the register alone cannot: every document sitting in that
 * company's Drive resolutions folder, and which of them no resolution row
 * claims. Those unclaimed files are real — hiding them would misreport the
 * estate — so they are listed as what they are rather than attached to whatever
 * resolution happens to be nearest. */
export function ResolutionEntityPage({ entityKey, config }) {
  const { data, loading, error } = useResolutionEntity(entityKey);
  const [query, patch] = useQuery();
  const [tab, setTab] = useRecordTab("resolutions", query, patch);
  const [creating, setCreating] = useState(null);
  const entities = useEntities();
  const caps = (config && config.capabilities) || {};
  // Above the early returns — see compliance-document.js.
  usePublishCrumbLeaf(data && data.entity);

  if (error) return html`<div class="page page--wide fade-in">
    <${PageHead} title="Entity not found" />
    <${Empty} icon="alertTriangle" title="No resolutions for that entity"
      text=${error.message || "Nothing in the resolution register belongs to that entity key."}
      action=${html`<${Btn} variant="primary" onClick=${() => navigate("/compliance/resolutions")}>Resolutions</${Btn}>`} /></div>`;
  if (loading || !data) return html`<div class="page page--wide fade-in">
    <div class="tiny muted" style="padding:20px 2px">Reading the entity…</div></div>`;

  const rows = [...(data.native || []).map((r) => ({
    ...r, agenda: r.fields && r.fields.subject, date: r.fields && r.fields.resolutionDate, entity: data.entity,
  })), ...(data.source || [])];
  const docs = data.folderDocuments || [];

  const tabs = [
    { id: "resolutions", label: "Resolutions", count: rows.length },
    { id: "documents", label: "Folder documents", count: docs.length },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${data.entity}
      sub=${[data.entityType, rows.length + " resolution" + (rows.length === 1 ? "" : "s"),
        data.native.length ? data.native.length + " raised in LegalOS" : null].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate(registerReturnPath({ path: "/compliance/resolutions" }, query))}>Resolutions</${Btn}>
        ${caps["compliance.resolution.create"] && html`<${Btn} variant="primary" size="sm" icon="plus"
          onClick=${() => setCreating({ entityKey: data.entityKey, entity: data.entity })}>Create new resolution</${Btn}>`}` } />

    ${data.entityTypeConflict && html`<div class="tiny" style="color:var(--warning-text);margin-bottom:10px">
      Sources disagree about this entity's legal form, so its statutory requirements are withheld
      rather than guessed.</div>`}

    <${StatStrip} stats=${[
      { value: rows.length, label: "Resolutions" },
      { value: data.source.length, label: "From the source tracker" },
      { value: data.native.length, label: "Raised in LegalOS" },
      { value: docs.length, label: "Documents in the Drive folder" },
      { value: data.unclaimedDocuments, label: "Not claimed by any resolution",
        tone: data.unclaimedDocuments ? "amber" : "" },
    ]} />

    ${/* The shared tab strip, not a hand-rolled copy of it. The copy looked
          identical and behaved differently: no roving tabindex, so Tab walked
          through every tab instead of the selected one, and no arrow keys, so
          a keyboard user could not move between registers at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Entity resolutions" />

    ${tab === "resolutions" && (rows.length === 0
      ? html`<${Empty} icon="checksquare" title="No resolutions" text="This entity has no resolutions on record." />`
      : html`<${RegisterShell}
          tabId="res-entity" ns="rese" rows=${rows}
          fields=${resolutionFields2}
          columns=${(f) => resolutionColumns2(f, {
            onOpen: (r) => openRecord("/compliance/resolutions/" + encodeURIComponent(r.id), { tab: "documents" }),
          })}
          views=${resolutionViews2} searchKeys=${resolutionSearchKeys2}
          searchPlaceholder=${"Search " + data.entity + "'s resolutions…"}
          noun=${["resolution", "resolutions"]}
          onRow=${(r) => openRecord("/compliance/resolutions/" + encodeURIComponent(r.id))}
          exportName=${"resolutions-" + data.entityKey} emptyIcon="checksquare"
          defaultSort=${{ key: "date", dir: "desc" }} />`)}

    ${tab === "documents" && html`<${Section} title=${"Drive folder (" + docs.length + ")"} icon="folder"
      sub="Every file in this company's resolutions folder. A file no resolution claims is shown as exactly that — it is not attached to a nearby record to make the numbers look tidy.">
      ${docs.length === 0
        ? html`<${Empty} icon="folder" title="No folder documents" text="No Drive folder was matched to this entity." />`
        : html`<${LegalDocuments} files=${docs} recordType="resolution" />`}
    </${Section}>`}

    ${creating && html`<${CreateResolutionModal} seed=${creating} config=${config}
      entities=${(entities.data && entities.data.entities) || []}
      onClose=${() => setCreating(null)}
      onDone=${(rec) => { setCreating(null); navigate("/compliance/resolutions/" + encodeURIComponent(rec.id)); }} />`}
  </div>`;
}

/* ============================================================ RECORD DETAIL */

/* One resolution, at /compliance/resolutions/<id>.
 *
 * Two kinds of record share this page, and the page never pretends they are the
 * same thing. A LegalOS-drafted resolution has a workflow: review, signatories,
 * signatures, execution, Drive filing. A row imported from the source tracker
 * has a date, a subject and the documents Drive holds for it — and nothing else,
 * because nothing else was ever recorded. The read-only one says so on its face
 * instead of showing an empty signature panel that implies nobody signed. */
export function ResolutionDetail({ id, config }) {
  const { data, loading, error, reload } = useResolution(id);
  const [query, patch] = useQuery();
  const [tab, setTab] = useRecordTab("overview", query, patch);
  const [openRec, setOpenRec] = useState(null);
  const caps = (config && config.capabilities) || {};

  if (error) return html`<div class="page page--wide fade-in">
    <${PageHead} title="Resolution" />
    <${Empty} icon="alertTriangle" title="Resolution not found"
      text=${error.message || "No resolution has that reference."}
      action=${html`<${Btn} variant="primary"
        onClick=${() => navigate(registerReturnPath({ path: "/compliance/resolutions" }, query))}>Resolutions</${Btn}>`} /></div>`;
  if (loading || !data) return html`<div class="page page--wide fade-in">
    <div class="tiny muted" style="padding:20px 2px">Reading the resolution…</div></div>`;

  const r = data.resolution;
  const native = r.origin === "legalos";
  const f = r.fields || {};
  const docs = native ? (r.documents || []) : (r.driveFiles || []);
  const events = native ? (r.audit || []) : (r.timeline || []);

  const tabs = [
    { id: "overview", label: "Overview" },
    ...(native ? [{ id: "signatures", label: "Signatures" }, { id: "execution", label: "Execution" }] : []),
    { id: "documents", label: "Documents", count: docs.length },
    { id: "history", label: "History", count: events.length },
  ];

  const subject = f.subject || r.agenda || r.id;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${subject}
      sub=${[r.entity, native ? "Raised in LegalOS" : "From the source tracker",
        r.docNo != null ? "Resolution no. " + r.docNo : null].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate(registerReturnPath({ path: "/compliance/resolutions" }, query))}>Resolutions</${Btn}>
        ${r.entityKey && html`<${Btn} variant="ghost" icon="building"
          onClick=${() => navigate("/compliance/resolutions/entity/" + encodeURIComponent(r.entityKey))}>${r.entity}</${Btn}>`}
        ${native && html`<${Btn} variant="primary" icon="settings" onClick=${() => setOpenRec(r.id)}>Workflow</${Btn}>`}` } />

    <${StatStrip} stats=${[
      { value: r.id, label: "Resolution ID" },
      { value: (f.resolutionDate || r.date) ? fmt.date(f.resolutionDate || r.date) : "—", label: "Resolution date" },
      { value: native ? (r.statusLabel || r.status || "—") : "On record", label: "Status" },
      { value: docs.length, label: "Documents" },
      { value: native ? ((r.signature && r.signature.label) || "—") : "—", label: "Signature" },
    ]} />

    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Resolution record" />

    ${tab === "overview" && html`<div class="col" style="gap:16px">
      ${native && html`<${WorkflowStepper} record=${r} />`}
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <${Section} title="Resolution" icon="checksquare">
          <${FieldGrid} rows=${[
            ["Resolution ID", r.id],
            ["Entity", dash(r.entity)],
            ["Legal form", dash(r.entityType)],
            ["Resolution no.", dash(r.docNo)],
            ["Type", dash(f.resolutionType || (native ? "Board Resolution" : "Board / partners resolution"))],
            ["Subject", dash(subject)],
            ["Resolution date", (f.resolutionDate || r.date) ? fmt.date(f.resolutionDate || r.date) : "—"],
            ["Addressed to", dash(f.addressedTo)],
            ["Requesting department", dash(f.requestingDepartment)],
            ["Person authorised", dash(f.authorizedPerson)],
            ["Designation", dash(f.authorizedPersonDesignation)],
            ["Urgency", dash(f.urgency)],
          ]} />
        </${Section}>

        <${Section} title=${native ? "Record" : "Source"} icon=${native ? "activity" : "folder"}
          sub=${native
            ? "Raised in LegalOS. Its workflow position is live."
            : "Imported from the tracker. It is read-only here, and its lifecycle was never recorded — so this page does not show one."}>
          ${native
            ? html`<${FieldGrid} rows=${[
                ["Status", dash(r.statusLabel || r.status)],
                ["Created by", r.createdBy ? r.createdBy.name : "—"],
                ["Created", r.createdAt ? fmt.date(r.createdAt) : "—"],
                ["Last updated", r.updatedAt ? fmt.date(r.updatedAt) : "—"],
                ["Signature", (r.signature && r.signature.label) || "—"],
                ["Drive filing", (r.drive && r.drive.statusLabel) || (r.drive && r.drive.status) || "—"],
              ]} />`
            : html`<${FieldGrid} rows=${[
                ["Tracker file", (r.__source && r.__source.file) || "—"],
                ["Sheet", (r.__source && r.__source.sheet) || "—"],
                ["Row", r.__row != null ? String(r.__row) : "—"],
                ["Drive folder", (r.__source && r.__source.folder) || "—"],
                /* §85 — the ingest state in plain words. The code itself
                   (INCOMPLETE_SOURCE and the rest) belongs in Data Health,
                   which is where the lineage and the drop counts are. */
                ["Record completeness", qualityLabel(r.__quality) || "Complete"],
                ["Last read from the source", r.__lineage && r.__lineage.ingestedAt ? fmt.date(r.__lineage.ingestedAt) : "—"],
              ]} />`}
          ${r.entityConflict && html`<div class="tiny" style="color:var(--warning-text);padding-top:8px">
            The Drive folder and the workbook name disagree about which company this belongs to, so the
            entity shown is the folder's and the disagreement is recorded rather than resolved silently.</div>`}
        </${Section}>
      </div>

      ${f.body && html`<${Section} title="Operative wording" icon="file">
        <div class="tiny" style="white-space:pre-wrap;line-height:1.6">${f.body}</div>
      </${Section}>`}
      ${f.notes && html`<${Section} title="Notes" icon="message">
        <div class="tiny" style="white-space:pre-wrap;line-height:1.6">${f.notes}</div>
      </${Section}>`}
    </div>`}

    ${tab === "signatures" && html`<${Section} title="Signatures" icon="edit"
      sub="Who must sign, and who has. Managed from the workflow panel.">
      ${!(r.signature && r.signature.signatories && r.signature.signatories.length)
        ? html`<div class="tiny muted">No signatories have been set on this resolution yet.</div>`
        : html`<${FieldGrid} rows=${r.signature.signatories.map((s, i) =>
            [s.name || s.email || "Signatory " + (i + 1), (s.status || "Pending") + (s.signedDate ? " · " + fmt.date(s.signedDate) : "")])} />`}
      <div style="padding-top:10px"><${Btn} size="sm" icon="settings" onClick=${() => setOpenRec(r.id)}>Open workflow</${Btn}></div>
    </${Section}>`}

    ${tab === "execution" && html`<${Section} title="Execution and filing" icon="check">
      <${FieldGrid} rows=${[
        ["Workflow status", dash(r.statusLabel || r.status)],
        ["Executed", r.status === "EXECUTED" ? "Yes" : "Not yet"],
        ["Execution date", f.executionDate ? fmt.date(f.executionDate) : (r.status === "EXECUTED" ? "Not recorded" : "—")],
        ["Signed by", ((r.signature && r.signature.signatories) || []).length
          ? (r.signature.signatories || []).map((x) => x.name || x.email || x).join(", ")
          : (f.signatoryRole ? "Awaiting " + f.signatoryRole : "—")],
        ["Signature method", dash(f.signatureMethod || (r.signature && r.signature.method))],
        ["Drafted from template", dash(f.templateTitle)],
        ["Executed / stamped copy", f.stampedCopy ? f.stampedCopy : "Not attached"],
        ["Archived", f.archivedAt ? fmt.date(f.archivedAt) : "Not archived"],
        ["Drive filing", (r.drive && (r.drive.statusLabel || r.drive.status)) || "Not filed"],
        ["Filed by", r.drive && r.drive.by ? r.drive.by.name : "—"],
        ["Filed at", r.drive && r.drive.at ? fmt.date(r.drive.at) : "—"],
        ["Target folder", (r.drive && r.drive.folderPath) || (f.driveTarget || "—")],
      ]} />
      ${r.status === "EXECUTED" && !f.stampedCopy && html`<div class="banner banner--warn" style="align-items:flex-start;margin-top:10px">
        <${Icon} name="alertTriangle" size=15 />
        <div class="tiny"><strong>Executed, but no stamped copy is attached.</strong>
          The signed and stamped instrument is what the company can produce later; attach it before archiving.</div>
      </div>`}
      <div class="tiny muted" style="padding-top:8px">
        LegalOS holds a read-only Drive credential by design, so filing is recorded here as a tracked
        human step rather than performed automatically. Nothing is marked filed that a person did not file.
      </div>
      <div style="padding-top:10px"><${Btn} size="sm" icon="settings" onClick=${() => setOpenRec(r.id)}>Open workflow</${Btn}></div>
    </${Section}>`}

    ${tab === "documents" && html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip"
      sub="Open one to read it in LegalOS. Google Drive remains the source of truth.">
      ${docs.length === 0
        ? html`<${Empty} icon="paperclip"
            title=${r.documentsRestricted ? "No documents you can open" : "No documents"}
            text=${r.documentsRestricted
              ? "No Compliance-accessible documents are available for this resolution."
              : "No document in Drive is linked to this resolution."} />`
        : html`<${LegalDocuments} files=${docs} recordType="resolution" />`}
    </${Section}>`}

    ${tab === "history" && html`<${Section} title="History" icon="activity"
      sub=${native
        ? "Every step taken on this record, from the append-only audit trail."
        : "What the source and Drive record about this resolution. Nothing is inferred to fill the gaps."}>
      ${events.length === 0
        ? html`<div class="tiny muted">Nothing is recorded against this resolution beyond the row itself.</div>`
        : native
          ? html`<div class="col" style="gap:0">${events.map((a, i) => html`<div key=${a.id || i} class="feed__item">
              <div class="row" style="gap:10px;align-items:center;width:100%">
                <span class="tiny strong" style="flex:1;min-width:0">${(a.actor && a.actor.name) || "—"} · ${a.action}</span>
                <span class="tiny muted">${a.at ? fmt.rel(a.at) : ""}</span>
              </div></div>`)}</div>`
          : html`<${UnifiedTimeline} items=${events}
              onOpenDoc=${(file) => file && file.id && navigate("/compliance/document/" + encodeURIComponent(file.id))} />`}
    </${Section}>`}

    ${openRec && html`<${ActionPanel} recordId=${openRec} caps=${caps} config=${config}
      onClose=${() => setOpenRec(null)} onChanged=${reload} />`}
  </div>`;
}
