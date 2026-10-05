/* MODULES WHOSE RECORDS LEGAL CREATES, HELD ON THE SERVER.
 *
 * Police Complaints and Government Authority Visits have no tracker in Drive —
 * nobody keeps a workbook of police complaints — so every record in them is
 * created here. They were rendered by the generic workflow page, which writes
 * to a browser-local collection: a complaint logged on one laptop existed on
 * that laptop and nowhere else, the head of Litigation could not see it, and a
 * cleared browser took it with it. That is not persistence, and a register
 * nobody else can read is not a register.
 *
 * Both now read and write api/module-records.js, which is the same store the IP
 * and Developer Disputes modules already use: the record is on the server, it
 * carries who created it and when, deleting it needs the head of the team's
 * approval, and a deleted record can be restored with its history intact.
 *
 * The FIELDS, the workflow and the columns still come from the module
 * definition in modules.js — one definition, so what the form asks for and
 * what the register shows cannot drift apart.
 */
import { html, cx, fmt, useState, useEffect, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Section, Empty, Modal, Field, Input, Textarea, Toggle, DateInput, Picker } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { navigate, useQuery } from "../router.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { moduleByKey } from "../modules.js";
import { useActiveUser } from "../rbac.js";
import { useRegister } from "../live.js";
import { RequestDeletion } from "../modulerecordactions.js";
import { RowActions, DeleteDialog, BulkDeleteDialog, BulkEditDialog, ArchiveDialog, RemovedRecords, removedToast, deleteEligibility } from "../rowdelete.js";

/* WHAT TO CALL A ROW WHEN YOU TALK ABOUT IT.
 *
 * A confirmation and a toast have to name the thing being removed, and naming
 * it after the first column is how you get "Filed by the company removed" —
 * true of nine rows out of ten and therefore useless. Prefer a field that
 * actually identifies this one record (a party, a reference, a station), fall
 * back to the module's noun and the record id, which is never wrong. */
const IDENTIFYING = ["complainant", "accused", "title", "name", "party", "subject",
  "reference", "ref", "caseNo", "policeStation", "authority", "department", "vendor", "counterparty"];

function rowLabel(def, rec) {
  const f = (rec && rec.fields) || {};
  for (const k of IDENTIFYING) {
    const v = f[k];
    if (v && String(v).trim() && String(v).trim() !== "—") return String(v).trim();
  }
  for (const c of def.columns || []) {
    const v = f[c];
    /* A column that repeats across the register is a category, not a name. */
    if (v && String(v).trim().length > 3 && !/^(yes|no|open|closed|pending)$/i.test(String(v).trim())) return String(v).trim();
  }
  const noun = def.noun || "record";
  return noun.charAt(0).toUpperCase() + noun.slice(1) + " " + (rec && rec.id ? rec.id : "");
}

/* ------------------------------------------------------------- server data */

function useModuleRecords(mkey, nonce) {
  const [s, setS] = useState({ rows: null, removed: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setS((x) => ({ ...x, loading: true }));
    /* Both lists in one pass: the register, and what has been removed from it.
       Asking for them separately meant a restore could land while the live
       list was still in flight and the two would disagree on screen. */
    api.litigation.moduleRecords(mkey, true).then(
      (r) => {
        if (!alive) return;
        const all = r.records || [];
        setS({ rows: all.filter((x) => !x.deletedAt), removed: all.filter((x) => x.deletedAt), loading: false, error: null });
      },
      (e) => alive && setS({ rows: null, removed: [], loading: false, error: e }));
    return () => { alive = false; };
  }, [mkey, nonce]);
  return s;
}

/* The litigation module's own option lists — entities, authorities, statuses —
   so an "Entity / Office" picker offers the canonical companies rather than a
   free-text box that produces a new spelling every time. */
function useLitMeta() {
  const [m, setM] = useState(null);
  useEffect(() => { let a = true; api.litigation.meta().then((x) => a && setM(x), () => a && setM({})); return () => { a = false; }; }, []);
  return m || {};
}

/* ------------------------------------------------------------- the editor */

const visible = (f, rec) => (typeof f.showIf === "function" ? !!f.showIf(f, rec) : true);

function FieldInput({ f, value, onChange, meta }) {
  const set = (v) => onChange(f.key, v);
  if (f.type === "textarea") {
    return html`<${Textarea} rows=${3} value=${value || ""} onInput=${(e) => set(e.target.value)} />`;
  }
  if (f.type === "select") {
    const opts = f.options || (f.from && meta.lists && meta.lists[f.from] ? meta.lists[f.from].options : []) || [];
    return html`<${Picker} options=${opts} value=${value || ""} allowCustom=${false}
      placeholder="Select…" onChange=${set} />`;
  }
  if (f.type === "entity") {
    const opts = (meta.lists && meta.lists.entities && meta.lists.entities.options) || [];
    return html`<${Picker} options=${opts} value=${value || ""} allowCustom=${true}
      placeholder="Select a company…" onChange=${set} />`;
  }
  if (f.type === "date") return html`<${DateInput} value=${value || ""} onInput=${(e) => set(e.target.value)} />`;
  if (f.type === "toggle") return html`<${Toggle} on=${!!value} label=${f.label} onChange=${(v) => set(v)} />`;
  if (f.type === "number" || f.type === "money") {
    return html`<${Input} type="number" value=${value == null ? "" : value} onInput=${(e) => set(e.target.value)} />`;
  }
  return html`<${Input} value=${value || ""} onInput=${(e) => set(e.target.value)} />`;
}

function RecordSheet({ def, record, meta, onClose, onDone }) {
  const editing = !!record;
  const [f, setF] = useState(() => ({ ...(record ? record.fields : {}) }));
  const [stage, setStage] = useState((record && record.fields && record.fields.__stage) || (def.workflow || [])[0] || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((d) => ({ ...d, [k]: v }));
  const pseudo = { fields: f };

  const groups = useMemo(() => {
    const m = new Map();
    for (const fd of (def.fields || [])) {
      const g = fd.group || "Details";
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(fd);
    }
    return [...m.entries()];
  }, [def]);

  const save = async () => {
    const missing = (def.fields || []).filter((x) => x.required && visible(x, pseudo) && !String(f[x.key] || "").trim());
    if (missing.length) { setErr("Required: " + missing.map((x) => x.label).join(", ")); return; }
    setBusy(true); setErr("");
    try {
      const payload = { ...f, __stage: stage };
      if (editing) await api.litigation.updateModuleRecord(def.key, record.id, payload);
      else await api.litigation.createModuleRecord(def.key, payload);
      toast(editing ? "Record updated." : (def.createLabel || "Record") + " saved.", "success");
      onDone();
    } catch (e) { setErr((e.payload && e.payload.detail) || e.message || "Could not save."); setBusy(false); }
  };

  return html`<${Modal} title=${editing ? "Edit " + (def.noun || "record") : (def.createLabel || "New record")}
    icon=${def.icon || "plus"} width=${820} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${save}>${busy ? "Saving…" : "Save"}</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      ${def.workflow && def.workflow.length > 1 && html`<${Field} label="Stage"
        hint="Where this record has got to. It is the module's own workflow, not a generic one.">
        <${Picker} options=${def.workflow} value=${stage} allowCustom=${false} onChange=${setStage} />
      </${Field}>`}
      ${def.subTypeLabel && html`<${Field} label=${def.subTypeLabel}>
        <${Picker} allowCustom=${true}
          options=${def.subTypes || ((meta.lists && meta.lists[def.subTypesFrom] && meta.lists[def.subTypesFrom].options) || [])}
          value=${f.__subType || ""} onChange=${(v) => set("__subType", v)} placeholder="Select…" />
      </${Field}>`}
      ${groups.map(([g, fields]) => {
        const shown = fields.filter((x) => visible(x, pseudo));
        if (!shown.length) return null;
        return html`<div key=${g}>
          ${groups.length > 1 && html`<div class="tiny strong" style="margin-bottom:8px;color:var(--text-2)">${g}</div>`}
          <div class="modeditgrid">
            ${shown.map((fd) => html`<${Field} key=${fd.key} label=${fd.label + (fd.required ? " *" : "")} hint=${fd.hint}>
              <${FieldInput} f=${fd} value=${f[fd.key]} onChange=${set} meta=${meta} />
            </${Field}>`)}
          </div>
        </div>`;
      })}
    </div>
  </${Modal}>`;
}

/* ------------------------------------------------------------- the page */

const cellOf = (col, r) => {
  if (col === "owner") return (r.createdBy && r.createdBy.name) || "—";
  if (col === "stage") return (r.fields && r.fields.__stage) || "—";
  if (col === "subType") return (r.fields && r.fields.__subType) || "—";
  if (col === "entityId") return (r.fields && (r.fields.entity || r.fields.entityFiling || r.fields.entityAgainst)) || "—";
  if (col.startsWith("fields.")) { const k = col.slice(7); const v = r.fields && r.fields[k];
    return v === true ? "Yes" : v === false ? "No" : (v || "—"); }
  return r[col] || "—";
};
const labelOf = (def, col) => {
  if (col === "owner") return "Raised by";
  if (col === "stage") return "Stage";
  if (col === "subType") return def.subTypeLabel || "Type";
  if (col === "entityId") return "Entity / Office";
  if (col.startsWith("fields.")) {
    const fd = (def.fields || []).find((x) => x.key === col.slice(7));
    return fd ? fd.label : col.slice(7);
  }
  return col;
};

export default function NativeModule({ mkey, id }) {
  const def = moduleByKey(mkey);
  const me = useActiveUser();
  const [nonce, setNonce] = useState(0);
  const { rows, removed, loading, error } = useModuleRecords(mkey, nonce);
  /* COMPLAINTS THAT CAME OUT OF A TRACKER, NOT OUT OF THIS FORM (§14).
     Police Complaints is a module whose records are created here — but four
     complaints are recorded on the litigation trackers, identified by a forum
     that is a police station rather than a court. They were being counted as
     court cases. They are source-backed rows and must not be copied into this
     store (that would fork them from Drive), so they are shown here, beside the
     records raised in the app, and marked for what they are. */
  const litReg = useRegister("litigation", nonce, mkey === "police");
  const sourceBacked = mkey === "police"
    ? (litReg.rows || []).filter((r) => r.matterClass === "POLICE_COMPLAINT")
    : [];
  const meta = useLitMeta();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [bulk, setBulk] = useState(false);
  const [editing2, setEditing2] = useState(false);
  const [archiving, setArchiving] = useState(null);
  const [archivedRows, setArchivedRows] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archNonce, bumpArch] = useState(0);
  useEffect(() => {
    let alive = true;
    api.archive.list(mkey).then((r) => alive && setArchivedRows((r && r.records) || []), () => {});
    return () => { alive = false; };
  }, [mkey, archNonce]);
  const [q, patchQ] = useQuery();
  const [search, setSearch] = useState("");

  if (!def) return html`<div class="page"><${Empty} icon="inbox" title="Unknown module" /></div>`;

  const reload = () => setNonce((n) => n + 1);
  /* §101 — selection lives here and not in DataTable, because a register that
     cannot remove anything has no business growing a checkbox column. */
  const selected = sel;
  const toggleOne = (id) => setSel((s0) => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const archivedIdSet = new Set((archivedRows || []).map((a) => a.id));
  /* ARCHIVED RECORDS LEAVE THE COUNTS TOO.
     Taking something off the register but still counting it in "Records" and
     "Open" is the worst of both: it is not in the work and it is still in the
     number somebody reports. `all` is the working population; the archived set
     is reached through the toggle and counted there. */
  const every = rows || [];
  const all = showArchived ? every.filter((r) => archivedIdSet.has(r.id))
    : every.filter((r) => !archivedIdSet.has(r.id));
  const stageOf = (r) => (r.fields && r.fields.__stage) || (def.workflow || [])[0] || "—";
  const openStages = new Set((def.workflow || []).slice(0, -1));
  const open = all.filter((r) => openStages.has(stageOf(r)));
  const paused = all.filter((r) => /paused/i.test(stageOf(r)));
  const needle = search.trim().toLowerCase();
  const shown = all.filter((r) => {
    if (q.stage && stageOf(r) !== q.stage) return false;
    if (!needle) return true;
    return JSON.stringify(r.fields || {}).toLowerCase().includes(needle);
  });

  /* Archived records leave the working register and the counts; the toggle
     brings exactly those back into view. */
  const archivedIds = new Set(archivedRows.map((a) => a.id));
  const allShownIds = shown.map((r) => r.id);
  const allPicked = allShownIds.length > 0 && allShownIds.every((id) => selected.has(id));
  const cols = [{
    key: "__sel", width: "34px",
    label: html`<input type="checkbox" class="chk" aria-label="Select every row shown"
      checked=${allPicked}
      onChange=${() => setSel(() => (allPicked ? new Set() : new Set(allShownIds)))} />`,
    render: (r) => html`<input type="checkbox" class="chk" aria-label=${"Select " + rowLabel(def, r)}
      checked=${selected.has(r.id)}
      onClick=${(e) => e.stopPropagation()}
      onChange=${() => toggleOne(r.id)} />`,
  }, ...(def.columns || []).map((c) => ({
    key: c, label: labelOf(def, c),
    render: (r) => html`<span class=${c === (def.columns || [])[0] ? "cell-strong" : "tiny"}>${cellOf(c, r)}</span>`,
  }))];
  cols.push({
    key: "__act", label: "", align: "right", width: "56px",
    /* ONE MENU, NOT A ROW OF BUTTONS (§92). Two permanent buttons per row read
       as chrome and crowd the data; a single overflow control keeps the table
       readable and still puts Edit and Remove one click away. It is a real
       button in the tab order, so this is reachable without a mouse and exists
       on a touch screen — a hover-only action does not. */
    render: (r) => html`<${RowActions} items=${[
      { label: "Edit", icon: "edit", onClick: () => setEditing(r) },
      archivedIds.has(r.id)
        ? { label: "Bring back from archive", icon: "refresh",
            onClick: async () => { await api.archive.remove(mkey, r.id); bumpArch((n) => n + 1); toast("Brought back", "success"); } }
        : { label: "Archive", icon: "box", onClick: () => setArchiving([r]) },
      { label: "Remove", icon: "trash", danger: true, onClick: () => setDeleting(r) },
    ]} />`,
  });

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${def.label}
      sub=${[def.cadenceNote, "Records are held in LegalOS and visible to the whole Litigation team — there is no workbook for this module."].filter(Boolean).join(" ")}
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>${def.createLabel || "New record"}</${Btn}>`} />

    ${error && html`<div class="banner banner--warn" style="margin-bottom:14px">
      <${Icon} name="alertTriangle" size=15 />
      <span class="tiny">${error.message || "The register could not be read."}</span></div>`}

    ${/* A CONTROL OVER AN EMPTY REGISTER IS A CONTROL THAT DOES NOTHING.
          These two modules are the only ones in the product that start with no
          records at all — nobody keeps a workbook of police complaints — so on
          a fresh install the page offered a search box, four stage filters and
          a row of KPIs that could not change anything, above a table with no
          rows. The KPIs still report (nought complaints IS the answer) but
          stop pretending to filter, and the filter row is replaced by one line
          saying there is nothing to filter yet. Everything comes back the
          moment the first record is logged. */ ""}
    <${StatStrip} stats=${[
      { value: all.length, label: "Records", active: !q.stage,
        onClick: all.length ? () => patchQ({ stage: null }) : undefined },
      { value: open.length, label: "Open",
        onClick: open.length ? () => patchQ({ stage: null }) : undefined },
      ...(paused.length ? [{ value: paused.length, label: "Paused — 22-A / 22-B proceedings", tone: "amber",
        onClick: () => patchQ({ stage: (def.workflow || []).find((w) => /paused/i.test(w)) }) }] : []),
      { value: all.filter((r) => !openStages.has(stageOf(r))).length, label: "Closed" },
    ]} />

    ${all.length === 0
      ? html`<div class="tiny muted" style="margin-bottom:12px">
          ${"Nothing is logged yet, so there is nothing to search or filter. Use "}
          ${def.createLabel || "the button above"}${" to record the first " + (def.noun || "record") + "."}</div>`
      : html`<div class="row wrap" style="gap:8px;margin-bottom:12px;align-items:center">
          <div style="width:280px"><${Input} placeholder="Search records…" value=${search}
            onInput=${(e) => setSearch(e.target.value)} /></div>
          ${(def.workflow || []).map((w) => html`<button key=${w} type="button"
            class=${cx("fltbtn", q.stage === w && "fltbtn--on")}
            onClick=${() => patchQ({ stage: q.stage === w ? null : w })}>${w}</button>`)}
          <div class="spacer"></div>
          ${archivedRows.length > 0 && html`<button type="button"
            class=${cx("fltbtn", showArchived && "fltbtn--on")}
            aria-pressed=${showArchived ? "true" : "false"}
            onClick=${() => setShowArchived(!showArchived)}>
            ${(showArchived ? "Showing archived · " : "Archived · ") + archivedRows.length}</button>`}
          <span class="tiny muted">${shown.length} of ${all.length}</span>
        </div>`}

    ${/* §101 — the bar appears only when something is selected, states the
          number plainly, and sits directly above the rows it refers to. */ ""}
    ${selected.size > 0 && html`<div class="bulkbar">
      <${Icon} name="checkcircle" size=15 />
      <span class="tiny strong">${selected.size + " selected"}</span>
      <div class="spacer"></div>
      <${Btn} size="sm" variant="ghost" onClick=${() => setSel(new Set())}>Clear selection</${Btn}>
      <${Btn} size="sm" variant="primary" icon="edit" onClick=${() => setEditing2(true)}>Update selected</${Btn}>
      <${Btn} size="sm" icon="box"
        onClick=${() => setArchiving(all.filter((r) => sel.has(r.id)))}>Archive selected</${Btn}>
      <${Btn} size="sm" variant="danger" icon="trash" onClick=${() => setBulk(true)}>Remove selected</${Btn}>
    </div>`}

    ${loading && !rows
      ? html`<div class="card card--pad tiny muted" style="padding:40px;text-align:center">Reading the register…</div>`
      : html`<${DataTable} rows=${shown} columns=${cols} keepHead onRow=${(r) => setEditing(r)}
          empty=${html`<${Empty} icon=${def.icon || "inbox"}
            title=${all.length ? "Nothing matches this filter" : "No " + (def.noun || "record") + " has been logged yet"}
            text=${all.length ? "Clear the stage filter or the search." : "Use " + (def.createLabel || "the button above") + " to record the first one."} />`} />`}

    ${sourceBacked.length > 0 && html`<${Section} title=${"From the litigation trackers (" + sourceBacked.length + ")"}
      icon="alertTriangle"
      sub="Complaints recorded on a litigation tracker whose forum is a police station, not a court. They stay in their source workbook — this is where they are counted.">
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Complainant</th><th>Police station</th><th>Project</th>
          <th style="text-align:right">Amount</th><th>Status</th></tr></thead>
        <tbody>${sourceBacked.map((r) => html`<tr key=${r.id}>
          <td><div class="cell-strong">${r.counterparty || "—"}</div>
            <div class="tiny muted">${r.entity || ""}</div></td>
          <td><span class="tiny">${r.court || "—"}</span></td>
          <td><span class="tiny">${r.project || "—"}</span></td>
          <td style="text-align:right"><span class="tiny">${Number(r.claimAmount) > 0 ? fmt.money(Number(r.claimAmount), "PKR") : "—"}</span></td>
          <td><span class="tiny">${r.status || "—"}</span></td>
        </tr>`)}</tbody>
      </table></div>
    </${Section}>`}

    ${/* §99 — what this register has removed, and the way back. A footnote,
          not a tab: removed records are not part of the working register. */ ""}
    <${RemovedRecords} rows=${removed} noun=${def.noun || "record"}
      labelOf=${(r) => rowLabel(def, r)}
      onRestore=${async (r) => {
        await api.litigation.restoreModuleRecord(mkey, r.id);
        toast(rowLabel(def, r) + " restored", "success");
        reload();
      }} />

    ${/* Update one field across the whole selection. The stage list comes from
          the module's own workflow, so the values offered are the ones this
          register actually uses. */ ""}
    ${editing2 && html`<${BulkEditDialog}
      records=${all.filter((r) => sel.has(r.id))} noun=${def.noun || "record"}
      labelOf=${(r) => rowLabel(def, r)}
      fields=${[
        { key: "__stage", label: "Stage", options: def.workflow || [] },
        ...(def.fields || []).filter((fd) => fd.type === "select" && (fd.options || []).length)
          .slice(0, 4).map((fd) => ({ key: fd.key, label: fd.label, options: fd.options })),
      ]}
      onApply=${async (r, field, value) => {
        await api.litigation.updateModuleRecord(mkey, r.id, { ...(r.fields || {}), [field]: value });
      }}
      onClose=${() => setEditing2(false)}
      onDone=${({ changed, failed, field }) => {
        setEditing2(false);
        toast(changed.length + " " + (def.noun || "record") + (changed.length === 1 ? "" : "s") + " updated"
          + (failed.length ? " · " + failed.length + " refused" : ""),
        failed.length ? "info" : "success", undefined,
        changed.length ? { action: { label: "Undo", onClick: async () => {
          for (const c of changed) {
            await api.litigation.updateModuleRecord(mkey, c.record.id,
              { ...(c.record.fields || {}), [field]: c.was == null ? "" : c.was });
          }
          toast(changed.length + " reverted", "success"); reload();
        } } } : {});
        reload();
      }} />`}

    ${archiving && archiving.length > 0 && html`<${ArchiveDialog}
      records=${archiving} noun=${def.noun || "record"} labelOf=${(r) => rowLabel(def, r)}
      onArchive=${async (r, reason) => { await api.archive.add(mkey, r.id, reason); }}
      onClose=${() => setArchiving(null)}
      onDone=${({ archived, failed }) => {
        setArchiving(null);
        setSel((s0) => { const n = new Set(s0); archived.forEach((r) => n.delete(r.id)); return n; });
        toast(archived.length + " " + (def.noun || "record") + (archived.length === 1 ? "" : "s") + " archived"
          + (failed.length ? " · " + failed.length + " refused" : ""),
        failed.length ? "info" : "success", undefined,
        archived.length ? { action: { label: "Undo", onClick: async () => {
          for (const r of archived) await api.archive.remove(mkey, r.id);
          toast(archived.length + " brought back", "success"); bumpArch((n) => n + 1);
        } } } : {});
        bumpArch((n) => n + 1);
      }} />`}

    ${bulk && html`<${BulkDeleteDialog}
      records=${all.filter((r) => selected.has(r.id))} viewer=${me} noun=${def.noun || "record"}
      onDelete=${(r, reason) => api.litigation.removeModuleRecord(mkey, r.id, reason)}
      onClose=${() => setBulk(false)}
      onDone=${({ removed, failed }) => {
        setBulk(false);
        /* Only the rows that actually went are deselected — whatever was left
           behind stays selected, so the reader can see exactly what did not. */
        setSel((s0) => { const n = new Set(s0); removed.forEach((r) => n.delete(r.id)); return n; });
        const ids = removed.map((r) => r.id);
        toast(removed.length + " " + (def.noun || "record") + (removed.length === 1 ? "" : "s") + " removed"
          + (failed.length ? " · " + failed.length + " refused" : ""), failed.length ? "info" : "success", undefined,
          ids.length ? { action: { label: "Undo", onClick: async () => {
            for (const id of ids) await api.litigation.restoreModuleRecord(mkey, id);
            toast(ids.length + " restored", "success"); reload();
          } } } : {});
        reload();
      }} />`}

    ${creating && html`<${RecordSheet} def=${def} meta=${meta}
      onClose=${() => setCreating(false)} onDone=${() => { setCreating(false); reload(); }} />`}
    ${editing && html`<${RecordSheet} def=${def} record=${editing} meta=${meta}
      onClose=${() => setEditing(null)} onDone=${() => { setEditing(null); reload(); }} />`}
    ${/* DELETION IS A REQUEST, not an act. The head of Litigation decides; the
          record stays on the register until they do. Same rule as every other
          module — these two simply had no way to ask, because the records were
          never on the server to begin with. */ ""}
    ${/* ONE DIALOG, THREE OUTCOMES (§93/§96). Your own record at an opening
          stage you remove yourself, with a reason, softly. Somebody else's — or
          one that has moved on — still goes to the head of the team, which is
          the rule this module already had. The dialog decides which by asking
          rowdelete.js, so no register can invent its own answer, and the
          SERVER decides again on the way in: this is a request, not a
          permission. */ ""}
    ${deleting && (() => {
      const elig = deleteEligibility(deleting, me, { noun: def.noun || "record" });
      const label = rowLabel(def, deleting);
      return html`<${DeleteDialog} record=${deleting} title=${label} eligibility=${elig}
        onDelete=${async (reason) => { await api.litigation.removeModuleRecord(mkey, deleting.id, reason); }}
        onRequest=${async (reason) => { await api.litigation.requestDeletion(mkey, deleting.id, label || deleting.id, reason); }}
        onClose=${() => setDeleting(null)}
        onDone=${() => {
          const wasId = deleting.id;
          if (elig.mode === "delete") {
            /* §98 — the undo lives in the toast, because that is where the
               reader already is. Restoring is the server's restore(), so the
               record comes back with its history intact, not as a new row. */
            removedToast(label, async () => { await api.litigation.restoreModuleRecord(mkey, wasId); reload(); });
          } else {
            toast("Sent for approval. Nothing is removed until the head approves.", "success");
          }
          setDeleting(null); reload();
        }} />`;
    })()}
  </div>`;
}
