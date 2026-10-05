// DEVELOPER DISPUTES.
//
// Built from the tracker the team actually keeps:
//   Litigation & Dispute - LegalOS / TRACKERS / Developer Disputes
//
// That workbook holds TWO tables on one sheet -- the legal matters Legal is
// running, and the commercial health of each development -- and this page keeps
// them apart for the same reason the reader does: they answer different
// questions. The register is the matters. A project's figures are shown on the
// matter they belong to, and on their own tab, because "% sold" is not a fact
// about a dispute.
//
// Every field here is a column in that workbook. Nothing is derived, scored or
// invented, and a blank in the tracker is shown as a blank rather than filled
// in with a guess.
import { html, cx, fmt, useState, useEffect, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Empty, Input, Field, Modal } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { IntakeDesk } from "../intakedesk.js";
import { useQuery, navigate } from "../router.js";
import { api } from "../api.js";
import { RegisterTabs } from "../register.js";
import { ModuleRecordOrigin } from "../modulerecordactions.js";
import { RowActions, DeleteDialog, RemovedRecords, removedToast, deleteEligibility } from "../rowdelete.js";
import { useActiveUser } from "../rbac.js";
import { toast } from "../toast.js";
import { byId } from "../data.js";

/* The tracker's own status words, and how worried each one is. The vocabulary
   is the sheet's; only the colour is ours. */
const STATUS_TONE = {
  "Very Critical": "red", Critical: "red", Unsatisfactory: "amber",
  "Needs Improvement": "amber", Satisfactory: "green",
};

const dash = (v) => (v == null || String(v).trim() === "" ? html`<span class="tiny muted">—</span>` : v);

/* WHO OWNS THIS MODULE, RESOLVED RATHER THAN TYPED.
   The tracker's "Responsibility" column says "Legal", "Aquisition" or a
   person's name, which is a function and not a user. The module has a named
   owner on the Litigation bench; he is looked up by id from the directory, so
   his name and email live in one place and a change there moves everywhere. */
const OWNER_ID = "u26";
const moduleOwner = () => byId(OWNER_ID) || null;

export default function DeveloperDisputes({ id }) {
  const [q, patch] = useQuery();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [rereading, setRereading] = useState(false);
  const [lastRead, setLastRead] = useState(null);
  const [native, setNative] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [creating, setCreating] = useState(false);
  const me = useActiveUser();
  /* Both lists in one read (§99): the disputes raised here, and the ones that
     have been removed from the register but not destroyed. */
  const loadNative = () => api.litigation.moduleRecords("developerDisputes", true)
    .then((r) => {
      const all = r.records || [];
      setNative(all.filter((x) => !x.deletedAt));
      setRemoved(all.filter((x) => x.deletedAt));
    }, () => { setNative([]); setRemoved([]); });
  const load = () => api.litigation.developerDisputes().then(setD, (e) => setErr(e));
  useEffect(() => { load(); loadNative(); }, []);

  if (err) {
    return html`<div class="page page--wide fade-in">
      <${PageHead} title="Developer Disputes" />
      <${Empty} icon="alertTriangle" title="The tracker could not be read"
        text=${(err.payload && err.payload.detail) || err.message
          || "The Developer Disputes workbook is not in the indexed Drive."} />
    </div>`;
  }
  if (!d) {
    return html`<div class="page page--wide fade-in">
      <${PageHead} title="Developer Disputes" />
      <div class="tiny muted" style="padding:20px 2px">Reading the tracker…</div></div>`;
  }

  /* THE TRACKER'S MATTERS, PLUS THE ONES RAISED HERE.
     A dispute raised in LegalOS carries origin LEGALOS so nobody has to guess
     which rows came out of the workbook. The workbook is not written to. */
  /* RAISED HERE GOES ON TOP, newest first -- appended to the end, a dispute
     just raised sat below thirteen tracker rows and read as unsaved. */
  const matters = native.slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((r) => ({
      ...r.fields, id: r.id, origin: "LEGALOS",
      createdBy: r.createdBy, createdAt: r.createdAt,
      project: null,
    })).concat(d.matters || []);
  const projects = d.projects || [];
  /* A DISPUTE RAISED HERE OPENS LIKE ANY OTHER.
     The detail view read the tracker alone, so a dispute raised in LegalOS
     appeared on the register and then said "Not in the tracker" when its own
     row was clicked. It reads the merged list the register showed. */
  if (id) return html`<${DisputeDetail} matters=${matters} d=${d} id=${id} />`;

  const tab = q.ddtab || "disputes";
  const status = q.ddstatus || "";
  const group = q.ddgroup || "";
  const region = q.ddregion || "";
  const term = (q.ddq || "").trim().toLowerCase();
  const set = (o) => patch(o);

  const rows = matters.filter((m) => {
    const st = (m.project && m.project.status) || "";
    const gp = (m.project && m.project.group) || "";
    if (status && st !== status) return false;
    if (group && gp !== group) return false;
    if (region && m.region !== region) return false;
    if (term && !(m.matter + " " + m.description + " " + m.projectName + " " + m.latestUpdate).toLowerCase().includes(term)) return false;
    return true;
  });

  const count = (s) => matters.filter((m) => m.project && m.project.status === s).length;
  const chips = [
    term && { label: "Search: " + term, clear: { ddq: "" } },
    status && { label: status, clear: { ddstatus: "" } },
    group && { label: group, clear: { ddgroup: "" } },
    region && { label: region, clear: { ddregion: "" } },
  ].filter(Boolean);

  const tabs = [
    { id: "disputes", label: "Disputes", n: matters.length },
    { id: "projects", label: "Project status", n: projects.length },
    { id: "source", label: "Source" },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Developer Disputes"
      sub="Matters with developers on CPML projects, from the team's own tracker."
      ${/* A CONTROL HAS TO SAY IT HEARD YOU.
            Re-reading the tracker usually produces the same 13 matters, so the
            page did not visibly change and pressing the button looked exactly
            like pressing a broken one. It now disables and relabels while the
            read is in flight, and afterwards says when the tracker was last
            read — so "nothing changed" reads as an answer rather than a
            failure. */ ""}
      actions=${html`<div class="row" style="gap:10px;align-items:center">
        ${lastRead && html`<span class="tiny muted">Read ${fmt.rel(lastRead)}</span>`}
        <${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>Raise a Dispute</${Btn}>
        <${Btn} variant="ghost" icon="refresh" disabled=${rereading}
          onClick=${async () => {
    setRereading(true);
    try { const fresh = await api.litigation.developerDisputes(true); setD(fresh); setLastRead(new Date().toISOString()); }
    catch (e) { setErr(e); }
    finally { setRereading(false); }
  }}>${rereading ? "Re-reading…" : "Re-read tracker"}</${Btn}>
      </div>`} />

    ${/* REQUESTS TRIAGED TO THIS DESK BELONG ON THIS DESK.
          This register used to be a filtered slice of the case register rendered
          by ModuleLive, which shows the intake desk above the table. Moving it
          onto its own page kept the tracker and lost the desk: a legal request
          routed here by triage was assigned, owned and invisible -- it appeared
          on nobody's register. IntakeDesk renders nothing when there is no
          intake, so this costs an empty desk nothing. */ ""}
    <${IntakeDesk} moduleKey="developerDisputes" label="Developer Disputes" />

    ${/* Clickable, because a count that does not take you to what it counted is
          a decoration. Each one filters the register below it. */ ""}
    <${StatStrip} stats=${[
    { value: matters.length, label: "Disputes", onClick: () => set({ ddtab: "disputes", ddstatus: "", ddgroup: "", ddregion: "" }) },
    { value: count("Very Critical") + count("Critical"), label: "Critical", tone: "red",
      onClick: () => set({ ddtab: "disputes", ddstatus: "Critical" }) },
    { value: count("Needs Improvement") + count("Unsatisfactory"), label: "Needs improvement", tone: "amber",
      onClick: () => set({ ddtab: "disputes", ddstatus: "Needs Improvement" }) },
    { value: count("Satisfactory"), label: "Satisfactory", onClick: () => set({ ddtab: "disputes", ddstatus: "Satisfactory" }) },
    { value: projects.length, label: "Projects tracked", onClick: () => set({ ddtab: "projects" }) },
    { value: (d.options.group || []).length, label: "Developer groups", onClick: () => set({ ddtab: "projects" }) },
  ]} />

    ${/* The shared tab strip. The hand-rolled copies that used to be here
          looked identical and behaved differently: no roving tabindex, so Tab
          walked through every tab rather than the selected one, and no arrow
          keys, so a keyboard user could not move between tabs at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${(id) => set({ ddtab: id })} ariaLabel="Developer disputes" />

    ${tab === "disputes" && html`<div class="col" style="gap:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px"><${Input} value=${q.ddq || ""} placeholder="Search disputes…"
          aria-label="Search disputes" onChange=${(v) => set({ ddq: v })} /></div>
        ${[["ddstatus", "Status", d.options.status], ["ddgroup", "Developer group", d.options.group],
    ["ddregion", "Region", d.options.region]].map(([k, label, opts]) => html`
          <div key=${k} style="width:190px"><${Field} label=${label}>
            <select class="input" value=${q[k] || ""} onChange=${(e) => set({ [k]: e.target.value })}>
              <option value="">All</option>
              ${(opts || []).map((o) => html`<option key=${o} value=${o} selected=${q[k] === o}>${o}</option>`)}
            </select></${Field}></div>`)}
      </div>
      ${chips.length > 0 && html`<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
        <span class="tiny muted">Filtered by</span>
        ${chips.map((c, i) => html`<button key=${i} type="button" class="fltbtn fltbtn--on"
          onClick=${() => set(c.clear)}>${c.label} ✕</button>`)}
        <button type="button" class="fltbtn"
          onClick=${() => set({ ddq: "", ddstatus: "", ddgroup: "", ddregion: "" })}>Clear all</button>
      </div>`}
      <div class="tiny muted">${rows.length} of ${matters.length} shown</div>
      ${rows.length === 0
    ? html`<${Empty} icon="building" title="No dispute matches" text="Clear a filter to widen the register." />`
    : html`<div class="tablewrap"><table class="table">
        <thead><tr><th>Matter</th><th>Issue</th><th>Project</th><th>Developer group</th>
          <th>Region</th><th>Responsibility</th><th>Status</th><th style="width:56px" aria-label="Row actions"></th></tr></thead>
        <tbody>${rows.map((m) => html`<tr key=${m.id} class="rowlink" tabIndex=${0} role="link"
          aria-label=${"Open " + m.matter}
          onClick=${() => navigate("/m/developerDisputes/" + encodeURIComponent(m.id))}
          onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/m/developerDisputes/" + encodeURIComponent(m.id)); } }}>
          <td><div class="cell-strong">${m.matter}</div></td>
          <td><span class="tiny">${dash(m.description)}</span></td>
          <td><span class="tiny">${dash(m.projectName)}</span></td>
          <td><span class="tiny">${dash(m.project && m.project.group)}</span></td>
          <td><span class="tiny">${dash(m.region)}</span></td>
          <td><span class="tiny">${dash(m.responsibility)}</span></td>
          <td>${m.project && m.project.status
    ? html`<${Pill} tone=${STATUS_TONE[m.project.status] || "gray"}>${m.project.status}</${Pill}>`
    : dash("")}</td>
          ${/* §92 — the same row menu as every other register. A tracker row
                offers only Open, because LegalOS does not own it; a dispute
                raised here can also be removed, and rowdelete.js decides
                which of the two it is. */ ""}
          <td style="text-align:right"><${RowActions} items=${[
            { label: "Open", icon: "arrowRight",
              onClick: () => navigate("/m/developerDisputes/" + encodeURIComponent(m.id)) },
            ...(m.origin === "LEGALOS"
              ? [{ label: "Remove", icon: "trash", danger: true, onClick: () => setDeleting(m) }]
              : []),
          ]} /></td>
        </tr>`)}</tbody>
      </table></div>`}

      ${/* §99 — what this register has removed, and the way back. */ ""}
      <${RemovedRecords} rows=${removed} noun="dispute"
        labelOf=${(r) => (r.fields && (r.fields.matter || r.fields.description)) || r.id}
        onRestore=${async (r) => {
          await api.litigation.restoreModuleRecord("developerDisputes", r.id);
          toast(((r.fields && r.fields.matter) || "Dispute") + " restored", "success");
          loadNative();
        }} />
    </div>`}

    ${deleting && (() => {
      const label = deleting.matter || deleting.description || deleting.id;
      const elig = deleteEligibility(deleting, me, { noun: "dispute" });
      return html`<${DeleteDialog} record=${deleting} title=${label} eligibility=${elig}
        onDelete=${(reason) => api.litigation.removeModuleRecord("developerDisputes", deleting.id, reason)}
        onRequest=${(reason) => api.litigation.requestDeletion("developerDisputes", deleting.id, label, reason)}
        onClose=${() => setDeleting(null)}
        onDone=${() => {
          const wasId = deleting.id;
          if (elig.mode === "delete") {
            removedToast(label, async () => {
              await api.litigation.restoreModuleRecord("developerDisputes", wasId); loadNative();
            });
          } else {
            toast("Sent for approval. Nothing is removed until the head approves.", "success");
          }
          setDeleting(null); loadNative();
        }} />`;
    })()}

    ${tab === "projects" && html`<${Section} title=${"Project status (" + projects.length + ")"} icon="building"
      sub="The commercial position of each development, exactly as the tracker records it.">
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Sr</th><th>Group</th><th>Project</th><th>Structure</th><th>Contract date</th>
          <th style="text-align:right">Units</th><th style="text-align:right">Sold</th><th style="text-align:right">% sold</th>
          <th>Schedule (PPA)</th><th>Actual</th><th>Status</th><th>Rental status</th></tr></thead>
        <tbody>${projects.map((pj) => html`<tr key=${pj.id}>
          <td><span class="tiny muted">${dash(pj.sr)}</span></td>
          <td><span class="tiny">${dash(pj.group)}</span></td>
          <td><div class="cell-strong">${dash(pj.projectName)}</div>
            ${pj.unitsSoldDescription && html`<div class="tiny muted">${pj.unitsSoldDescription}</div>`}</td>
          <td><span class="tiny">${dash(pj.structure)}</span></td>
          <td><span class="tiny">${dash(pj.contractDate)}</span></td>
          <td style="text-align:right"><span class="tiny">${dash(pj.totalUnits)}</span></td>
          <td style="text-align:right"><span class="tiny">${dash(pj.unitsSold)}</span></td>
          <td style="text-align:right"><span class="tiny">${dash(pj.percentSold)}</span></td>
          <td><span class="tiny">${dash(pj.schedulePerPPA)}</span></td>
          <td><span class="tiny">${dash(pj.actualConstruction)}</span></td>
          <td>${pj.status ? html`<${Pill} tone=${STATUS_TONE[pj.status] || "gray"}>${pj.status}</${Pill}>` : dash("")}</td>
          <td><span class="tiny">${dash(pj.rentalStatus)}</span></td>
        </tr>`)}</tbody>
      </table></div>
    </${Section}>`}

    ${creating && html`<${NewDisputeModal} options=${d.options} projects=${d.projects}
      onClose=${() => setCreating(false)} onDone=${() => { setCreating(false); loadNative(); }} />`}

    ${tab === "source" && html`<div class="col" style="gap:16px">
      <${Section} title="Responsible" icon="user"
        sub="Who runs this module, resolved from the Legal directory — not a name typed into this page.">
        ${(() => {
    const o = moduleOwner();
    if (!o) return html`<div class="tiny muted">No owner is configured for this module.</div>`;
    const lead = byId("u6");
    return html`<div class="tiny" style="line-height:1.9">
            <div><span class="muted">Owner:</span> <strong>${o.name}</strong> — ${o.role}</div>
            <div><span class="muted">Contact:</span> ${o.email}</div>
            ${lead && html`<div><span class="muted">Reports to:</span> ${lead.name} — ${lead.role}</div>`}
          </div>`;
  })()}
      </${Section}>
      <${Section} title="Source" icon="folder"
      sub="Where every figure on this page came from.">
      <div class="tiny" style="line-height:1.8">
        <div><span class="muted">Workbook:</span> <strong>${d.source.file}</strong></div>
        <div><span class="muted">Sheet:</span> ${d.source.sheet}</div>
        <div><span class="muted">Drive path:</span> ${d.source.folderPath}</div>
        <div><span class="muted">Read at:</span> ${d.source.readAt}</div>
      </div>
      <div class="tiny muted" style="padding-top:10px">
        LegalOS reads this workbook; it does not write to it. Editing a dispute here
        is not yet supported, because the tracker is still the place the team maintains
        — changing it in two places is how two versions of the truth start.
      </div>
      </${Section}>
    </div>`}
  </div>`;
}


/* RAISING A DEVELOPER DISPUTE.
   Not a court case. A developer dispute is a commercial matter with a project,
   a developer group and a status the tracker defines -- it has no forum, no
   cause number and no hearing, and it may never become litigation at all.
   Raising one through the litigation intake form would ask for all of those
   and record none of these. The fields and dropdowns below are the tracker's. */
function NewDisputeModal({ options, projects, onClose, onDone }) {
  const [f, setF] = useState({
    matter: "", description: "", latestUpdate: "", actionRequired: "",
    region: "", responsibility: "", projectName: "", status: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target ? e.target.value : e }));
  const save = async () => {
    if (!f.matter.trim()) { setErr("The matter's name is required."); return; }
    setBusy(true); setErr("");
    try { await api.litigation.createModuleRecord("developerDisputes", f); onDone(); }
    catch (e) { setErr(e.message || "The dispute could not be saved."); setBusy(false); }
  };
  const sel = (k, label, opts) => html`<${Field} label=${label}>
    <select class="input" value=${f[k]} onChange=${set(k)}>
      <option value="">—</option>
      ${(opts || []).map((o) => html`<option key=${o} value=${o} selected=${f[k] === o}>${o}</option>`)}
    </select></${Field}>`;
  return html`<${Modal} title="Raise a dispute" icon="building" width=${740} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !f.matter.trim()}
        onClick=${save}>Raise dispute</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      <div class="tiny muted">A developer dispute is a commercial matter, not a court case — there is
        no forum or cause number here. If it later becomes litigation, raise the case in Litigation and
        the two stay linked rather than becoming one record. Fields and dropdowns are the tracker's own.</div>
      <div class="modeditgrid">
        <${Field} label="Matter *"><${Input} value=${f.matter} onInput=${set("matter")} /></${Field}>
        <${Field} label="Issue"><${Input} value=${f.description} onInput=${set("description")}
          placeholder="e.g. Delay in construction" /></${Field}>
        ${(() => {
    const names = [...new Set((projects || []).map((x) => x.projectName).filter(Boolean))];
    return html`<${Field} label="Project">
            <select class="input" value=${f.projectName} onChange=${set("projectName")}>
              <option value="">—</option>
              ${names.map((n) => html`<option key=${n} value=${n} selected=${f.projectName === n}>${n}</option>`)}
            </select></${Field}>`;
  })()}
        ${sel("status", "Status", options.status)}
        ${sel("region", "Region", options.region)}
        ${sel("responsibility", "Responsibility", options.responsibility)}
      </div>
      <${Field} label="Latest update"><textarea class="input" rows="3" value=${f.latestUpdate}
        onInput=${set("latestUpdate")}></textarea></${Field}>
      <${Field} label="Action required / taken"><textarea class="input" rows="2" value=${f.actionRequired}
        onInput=${set("actionRequired")}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

/* One dispute: what it is, what is being done, and the project behind it. */
function DisputeDetail({ matters, d, id }) {
  const m = (matters || d.matters || []).find((x) => x.id === id);
  if (!m) {
    return html`<div class="page page--wide fade-in">
      <${PageHead} title="Developer dispute" />
      <${Empty} icon="alertTriangle" title="Not in the tracker"
        text="No dispute in the workbook has that reference."
        action=${html`<${Btn} variant="primary" onClick=${() => navigate("/m/developerDisputes")}>Developer Disputes</${Btn}>`} />
    </div>`;
  }
  const pj = m.project;
  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${m.matter}
      sub=${[m.projectName, m.region, m.responsibility].filter(Boolean).join(" · ")}
      actions=${html`<${Btn} variant="ghost" icon="arrowLeft"
        onClick=${() => navigate("/m/developerDisputes")}>Developer Disputes</${Btn}>`} />

    ${/* Raised here, so it can be taken off the register with a reason. A row
          from the workbook cannot be, and shows no action. */ ""}
    <${ModuleRecordOrigin} moduleKey="developerDisputes" record=${m} label=${m.matter} />

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${Section} title="The dispute" icon="alertTriangle">
        <div class="tiny" style="line-height:1.9">
          <div><span class="muted">Issue:</span> <strong>${m.description || "—"}</strong></div>
          <div><span class="muted">Region:</span> ${m.region || "—"}</div>
          <div><span class="muted">Responsibility:</span> ${m.responsibility || "—"}</div>
        </div>
        ${m.latestUpdate && html`<div style="padding-top:10px">
          <div class="tiny muted">Latest update</div>
          <div class="tiny" style="line-height:1.6;white-space:pre-wrap">${m.latestUpdate}</div></div>`}
        ${m.actionRequired && html`<div style="padding-top:10px">
          <div class="tiny muted">Action required / taken</div>
          <div class="tiny" style="line-height:1.6;white-space:pre-wrap">${m.actionRequired}</div></div>`}
      </${Section}>

      ${pj
    ? html`<${Section} title=${"Project — " + pj.projectName} icon="building"
          sub="The development this dispute is about.">
          <div class="tiny" style="line-height:1.9">
            <div><span class="muted">Developer group:</span> <strong>${pj.group || "—"}</strong></div>
            <div><span class="muted">Structure:</span> ${pj.structure || "—"}</div>
            <div><span class="muted">Contract date:</span> ${pj.contractDate || "—"}</div>
            <div><span class="muted">Units:</span> ${pj.unitsSold || "—"} sold of ${pj.totalUnits || "—"}${pj.percentSold ? " (" + pj.percentSold + ")" : ""}</div>
            <div><span class="muted">Construction — per PPA:</span> ${pj.schedulePerPPA || "—"}</div>
            <div><span class="muted">Construction — actual:</span> ${pj.actualConstruction || "—"}</div>
            <div><span class="muted">Rental status:</span> ${pj.rentalStatus || "—"}</div>
            <div class="row" style="gap:8px;align-items:center;padding-top:4px"><span class="muted">Status:</span>
              ${pj.status ? html`<${Pill} tone=${STATUS_TONE[pj.status] || "gray"}>${pj.status}</${Pill}>` : "—"}</div>
          </div>
          ${pj.unitsSoldDescription && html`<div class="tiny muted" style="padding-top:8px">${pj.unitsSoldDescription}</div>`}
        </${Section}>`
    : html`<${Section} title="Project" icon="building">
          <div class="tiny muted">The tracker records no project figures against this matter.</div>
        </${Section}>`}
    </div>

    <${Section} title="Source" icon="folder">
      <div class="tiny muted">Row ${m.sourceRow} of “${d.source.sheet}” in ${d.source.file}
        — ${d.source.folderPath}</div>
    </${Section}>
  </div>`;
}
