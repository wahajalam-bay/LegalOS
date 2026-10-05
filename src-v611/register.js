// The register shell — one operational table experience for every record family.
//
// THE PROBLEM IT SOLVES
// Litigation stacked 357 cases on top of 255 notices; Compliance stacked
// licences, then 192 loans, then 914 resolutions, then 38 properties, all on one
// scrolling page. Two separate record families rendered one under another is not
// a register, it is a document. You cannot filter it, you cannot count it, and
// you cannot link anyone to what you are looking at.
//
// So: ONE workspace, register TABS, and exactly one register rendered at a time.
// Each tab configures its own columns, its own contextual filters and its own
// quick views, while sharing this shell — which is what keeps Cases and Legal
// Notices feeling like the same product rather than two different apps.
//
// Everything that defines "what am I looking at" lives in the URL (see
// router.js), so a filtered register is linkable, survives a refresh, and is
// what a dashboard drill-down actually navigates to.
import { html, cx, useState, useEffect, useMemo, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { toast } from "./toast.js";
import { Btn, Drawer } from "./ui.js";
import { DataTable } from "./parts.js";
import { RowActions, DeleteDialog, BulkDeleteDialog, BulkEditDialog, ArchiveDialog, RemovedRecords, removedToast, deleteEligibility } from "./rowdelete.js";
import { useQuery } from "./router.js";
import { useRegisterFilters, FilterSelect, ActiveChips } from "./filters.js";
import { SavedViews } from "./savedviews.js";

/* ------------------------------------------------------------ register tabs -- */

/* The workspace switcher. Real <button>s in a tablist, driven by the URL so the
   tab is bookmarkable and Back returns to the register you came from. */
export function RegisterTabs({ tabs, active, onChange, ariaLabel = "Registers" }) {
  const ref = useRef(null);
  // Arrow keys move between tabs, which is the expected tablist behaviour and
  // the reason this is not just a row of links.
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.id === active);
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n == null) return;
    e.preventDefault();
    onChange(tabs[n].id);
    const el = ref.current && ref.current.querySelectorAll("[role=tab]")[n];
    if (el) el.focus();
  };
  return html`<div class="regtabs" role="tablist" aria-label=${ariaLabel} ref=${ref} onKeyDown=${onKeyDown}>
    ${tabs.map((t) => html`<button key=${t.id} type="button" role="tab" id=${"regtab-" + t.id}
      aria-selected=${active === t.id ? "true" : "false"}
      aria-controls=${"regpanel-" + t.id}
      tabIndex=${active === t.id ? 0 : -1}
      class=${cx("regtab", active === t.id && "regtab--on")}
      onClick=${() => onChange(t.id)}>
      <span class="regtab__l">${t.label}</span>
      ${/* Some registers call it `count`, some `n`. Both mean the same thing and
            both were spelt in hand-rolled copies of this strip; accepting either
            is what let those copies be deleted. */ ""}
      ${(t.count != null ? t.count : t.n) != null
    && html`<span class="regtab__n">${Number(t.count != null ? t.count : t.n).toLocaleString()}</span>`}
    </button>`)}
  </div>`;
}

/* Hook for the tab itself: which register is showing, kept in ?view=. */
export function useRegisterTab(tabs, fallback) {
  const [query, patch] = useQuery();
  const ids = tabs.map((t) => t.id);
  const want = query.view;
  const active = ids.includes(want) ? want : (fallback || ids[0]);
  // Switching register clears the OTHER register's filters from the URL, so a
  // stale ?status= from Cases cannot silently narrow Legal Notices.
  const setActive = (id) => patch({ view: id });
  return [active, setActive];
}

/* ------------------------------------------------------------------- export -- */

// Same neutralisation as the tracker export: a cell that starts with =, +, -, @
// or a control character is a formula to Excel and Sheets, and they execute it
// on open. The record is untouched; only its spreadsheet representation is
// quoted. See SECURITY_AUDIT.md (SEC-003).
function csvCell(v) {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(name, columns, rows) {
  const cols = columns.filter((c) => c.key !== "__actions");
  const head = cols.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(c.csv ? c.csv(r) : (c.plain ? c.plain(r) : r[c.key]))).join(",")).join("\n");
  const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* -------------------------------------------------------- column preferences -- */

// Which columns a person wants to see is a per-viewer convenience, not shared
// state and not legal data, so it lives in this browser only. It can legitimately
// come back empty (private window, cleared storage), and the register must render
// correctly when it does — hence the try/catch and the fallback to "show all".
const COLKEY = "legalos.cols.";
function readCols(ns) { try { const v = localStorage.getItem(COLKEY + ns); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function writeCols(ns, v) { try { localStorage.setItem(COLKEY + ns, JSON.stringify(v)); } catch (e) { /* storage unavailable — preference is simply not remembered */ } }

/* ============================================================ REGISTER SHELL */

/*  rows        authorized records for this family (already permission-scoped)
    fields      filter definitions — see filters.js
    columns     [{key,label,render?,plain?,csv?,align,width,mono,essential}]
    views       [{id,label,filters}] — quick views are named filter states
    noun        ["case","cases"] for the result count
    ns          URL + storage namespace, unique per register              */
export function RegisterShell({
  rows, fields, columns, views = [], searchKeys = [], searchPlaceholder = "Search…",
  noun = ["record", "records"], ns, onRow, defaultSort = null, exportName,
  summary = null, emptyIcon = "inbox", tabId, afterBar = null, extraChips = null,
  savedViews = true, children = null, pinFirst = false, rowDelete = null, viewer = null,
  bulkEdit = null, archive = null, showArchived = false, onShowArchived = null,
}) {
  /* §91/§107 — ONE REMOVAL AFFORDANCE FOR EVERY REGISTER.
     A page opts in by passing `rowDelete`; it does not get to decide who may
     remove what, because that answer lives in rowdelete.js and must be the
     same in all twenty-odd registers. A register that passes nothing renders
     exactly as before, so a read-only or source-backed book is unaffected. */
  const [deleting, setDeleting] = useState(null);
  /* §101 — SELECTING SEVERAL ROWS AND REMOVING THEM TOGETHER.
     Selection lives in the shell rather than in DataTable, because a register
     that cannot remove anything has no business growing a checkbox column:
     the column appears only where the page passed `rowDelete`. */
  const [sel, setSel] = useState(() => new Set());
  const [bulk, setBulk] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(null);
  /* Selection is offered wherever the page gives the shell something to DO with
     a selection — remove, update or archive. A read-only book grows no
     checkboxes. */
  const selectable = !!(rowDelete || bulkEdit || archive);
  const f = useRegisterFilters({ rows, fields, searchKeys, ns, defaultSort });
  const [moreOpen, setMoreOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  /* WHAT A REGISTER SHOWS BY DEFAULT IS A DESIGN DECISION, NOT "ALL OF IT".
     Every column defined for a family used to be on screen at once, which is
     how the case book arrived at fifteen columns and a horizontal scrollbar at
     1366px — a raw database table rather than a register somebody reads. A
     column marked `secondary` is defined, sortable, exportable and one click
     away in the Columns menu, and simply not in the opening view.

     `null` means "nobody has chosen yet", which is deliberately distinct from
     `[]` ("show everything, I asked for that"): a person who turns every
     column on must not have it silently undone on their next visit. */
  const [chosen, setChosen] = useState(() => readCols(ns));
  const moreBtn = useRef(null);

  const primary  = fields.filter((x) => !x.advanced);
  const advanced = fields.filter((x) => x.advanced);
  // `columns` may be a function of the filter API, which is how a badge inside a
  // cell can narrow the register it sits in ("click High -> Risk = High")
  // without the page having to own filter state that belongs to this shell.
  // An analytics surface passes no columns at all and renders `children` instead.
  const allColumns = (typeof columns === "function" ? columns(f) : columns) || [];
  const defaultHidden = useMemo(() => allColumns.filter((c) => c.secondary).map((c) => c.key), [allColumns]);
  const hidden = chosen == null ? defaultHidden : chosen;
  const setHidden = (v) => setChosen(v);
  const shownColumns = useMemo(() => allColumns.filter((c) => c.essential || !hidden.includes(c.key)), [allColumns, hidden]);

  /* The action column is appended, never declared by the page — so it cannot
     be hidden from the Columns menu, reordered into the middle of the data, or
     exported into a spreadsheet as an empty column. */
  const tableColumns = useMemo(() => {
    if (!selectable) return shownColumns;
    const shownIds = f.filtered.map((r) => r.id);
    const allPicked = shownIds.length > 0 && shownIds.every((id) => sel.has(id));
    /* The select-all box acts on WHAT IS ON SCREEN, not on the whole register:
       a filtered view is the set the reader is looking at, and selecting 1,302
       contracts because they ticked a header while filtered to four is not what
       anybody means by "select all". */
    const selectCol = {
      key: "__sel", width: "34px", noExport: true,
      label: html`<input type="checkbox" class="chk" aria-label="Select every row shown"
        checked=${allPicked}
        onChange=${() => setSel(() => (allPicked ? new Set() : new Set(shownIds)))} />`,
      render: (r) => html`<input type="checkbox" class="chk"
        aria-label=${"Select " + ((rowDelete && rowDelete.labelOf && rowDelete.labelOf(r)) || r.id)}
        checked=${sel.has(r.id)}
        onClick=${(e) => e.stopPropagation()}
        onChange=${() => setSel((s0) => { const n = new Set(s0); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />`,
    };
    const actCol = { key: "__act", label: "", align: "right", width: "56px", noExport: true,
      render: (r) => html`<${RowActions} items=${[
        ...((rowDelete && rowDelete.actions && rowDelete.actions(r)) || []),
        ...(archive ? [r.archivedAt
          ? { label: "Bring back from archive", icon: "refresh", onClick: () => archive.onUnarchive(r) }
          : { label: "Archive", icon: "box", onClick: () => setArchiving([r]) }] : []),
        ...(rowDelete ? [{ label: "Remove", icon: "trash", danger: true, onClick: () => setDeleting(r) }] : []),
      ]} />` };
    return [selectCol, ...shownColumns, actCol];
  }, [shownColumns, rowDelete, archive, sel, f.filtered]);

  useEffect(() => { if (chosen != null) writeCols(ns, chosen); }, [chosen, ns]);

  const [one, many] = noun;
  const n = f.filtered.length, total = f.total;
  const countLabel = n === total
    ? `${total.toLocaleString()} ${total === 1 ? one : many}`
    : `${n.toLocaleString()} of ${total.toLocaleString()} ${many}`;

  const anyFilter = f.activeCount > 0 || !!f.q;

  return html`<div class="register" role="tabpanel" id=${tabId ? "regpanel-" + tabId : undefined}
      aria-labelledby=${tabId ? "regtab-" + tabId : undefined}>
    ${summary}

    <div class="regbar">
      <div class="regbar__search">
        <label class="sr-only" for=${"q-" + ns}>${searchPlaceholder}</label>
        <${Icon} name="search" size=15 />
        <input id=${"q-" + ns} class="regbar__input" type="search" placeholder=${searchPlaceholder}
          value=${f.q} onInput=${(e) => f.setQ(e.target.value)} />
      </div>

      ${primary.map((x) => html`<${FilterSelect} key=${x.key} label=${x.label}
        options=${f.options[x.key] || []} selected=${f.active[x.key] || []}
        onToggle=${(v) => f.toggle(x.key, v)} onClear=${() => f.clear(x.key)} />`)}

      ${advanced.length > 0 && html`<button type="button" ref=${moreBtn}
        class=${cx("fltbtn", f.advancedActive && "fltbtn--on")} onClick=${() => setMoreOpen(true)}>
        <${Icon} name="filter" size=13 /><span>More filters</span>
        ${f.advancedActive > 0 && html`<span class="fltbtn__n">${f.advancedActive}</span>`}
      </button>`}

      ${/* A register-specific control the page needs beside the filters — the
            Current Work "Include completed" toggle, for one. The prop was
            declared and then never rendered, so every caller that passed one
            got silence. */ ""}
      ${extraChips}

      <div class="spacer"></div>

      ${savedViews !== false && html`<${SavedViews} register=${ns} f=${f} fields=${fields}
        options=${f.options} hidden=${hidden} onApplyColumns=${setHidden} quickViews=${views} />`}
      ${allColumns.some((c) => !c.essential) && html`<div class="fltwrap">
        <button type="button" class="fltbtn" aria-expanded=${colsOpen ? "true" : "false"} aria-haspopup="true"
          onClick=${() => setColsOpen(!colsOpen)}><${Icon} name="columns" size=13 /><span>Columns</span></button>
        ${colsOpen && html`<${ColumnMenu} columns=${allColumns} hidden=${hidden} setHidden=${setHidden} onClose=${() => setColsOpen(false)} />`}
      </div>`}
      ${exportName && html`<${ExportMenu} name=${exportName} columns=${shownColumns} filtered=${f.filtered} all=${rows} anyFilter=${anyFilter} many=${many} />`}

      <span class="regcount" aria-live="polite">${countLabel}</span>
      ${/* ARCHIVED RECORDS STAY REACHABLE.
            Taking something off the working register is only safe if getting
            back to it is one click. The toggle appears only when something has
            actually been archived, so a register nobody has archived from is
            not carrying a control for an empty set. */ ""}
      ${archive && archive.archivedCount > 0 && html`<button type="button"
        class=${cx("fltbtn", showArchived && "fltbtn--on")}
        aria-pressed=${showArchived ? "true" : "false"}
        title=${showArchived ? "Back to the working register" : "Show the records taken off this register"}
        onClick=${() => onShowArchived && onShowArchived(!showArchived)}>
        ${(showArchived ? "Showing archived · " : "Archived · ") + archive.archivedCount}</button>`}
    </div>

    ${afterBar && afterBar(f)}

    <${ActiveChips} fields=${fields} active=${f.active} options=${f.options} q=${f.q}
      onClearQ=${() => f.setQ("")}
      onClear=${(k, v) => f.set(k, (f.active[k] || []).filter((x) => x !== v))}
      onClearAll=${f.clearAll} />

    <!-- An analytics surface (Reports, Pipelines) uses the same toolbar, chips,
         URL state and saved views, but renders its own body instead of a
         register table. One filter system, two presentations — rather than a
         second filter framework for pages that happen not to be registers. -->
    ${selectable && sel.size > 0 && html`<div class="bulkbar">
      <${Icon} name="checkcircle" size=15 />
      <span class="tiny strong">${sel.size + " selected"}</span>
      <div class="spacer"></div>
      <${Btn} size="sm" variant="ghost" onClick=${() => setSel(new Set())}>Clear selection</${Btn}>
      ${bulkEdit && html`<${Btn} size="sm" variant="primary" icon="edit"
        onClick=${() => setEditing(true)}>Update selected</${Btn}>`}
      ${archive && html`<${Btn} size="sm" icon="box"
        onClick=${() => setArchiving((rows || []).filter((r) => sel.has(r.id)))}>Archive selected</${Btn}>`}
      ${rowDelete && html`<${Btn} size="sm" variant="danger" icon="trash"
        onClick=${() => setBulk(true)}>Remove selected</${Btn}>`}
    </div>`}

    ${allColumns.length > 0
      ? html`<${DataTable} columns=${tableColumns} rows=${f.filtered} onRow=${onRow}
          pinFirst=${pinFirst}
          sort=${f.sort} onSort=${f.setSort}
          empty=${html`<div class="empty" style="padding:34px">
            <${Icon} name=${emptyIcon} size=32 />
            <div>${anyFilter ? `No ${many} match the current filters.` : `No ${many} in this register.`}</div>
            ${anyFilter && html`<${Btn} variant="ghost" size="sm" onClick=${f.clearAll}>Clear filters</${Btn}>`}
          </div>`} />`
      : (typeof children === "function" ? children(f) : children)}

    ${rowDelete && rowDelete.removed && rowDelete.removed.length ? html`<${RemovedRecords}
      rows=${rowDelete.removed} noun=${rowDelete.noun || one}
      labelOf=${rowDelete.labelOf} onRestore=${rowDelete.onRestore} />` : null}

    ${editing && html`<${BulkEditDialog}
      records=${(rows || []).filter((r) => sel.has(r.id))}
      fields=${bulkEdit.fields} noun=${bulkEdit.noun || one}
      labelOf=${(rowDelete && rowDelete.labelOf) || null}
      onApply=${(r, field, value) => bulkEdit.onApply(r, field, value)}
      onClose=${() => setEditing(false)}
      onDone=${({ changed, failed, field, value }) => {
        setEditing(false);
        toast(changed.length + " " + (bulkEdit.noun || one) + (changed.length === 1 ? "" : "s")
          + " updated" + (failed.length ? " · " + failed.length + " refused" : ""),
        failed.length ? "info" : "success", undefined,
        (changed.length && bulkEdit.onApply) ? { action: { label: "Undo", onClick: async () => {
          /* Each record goes back to the value IT held, not to one value for
             all of them — they did not start the same and must not end the
             same after an undo. */
          for (const c of changed) await bulkEdit.onApply(c.record, field, c.was == null ? "" : c.was);
          toast(changed.length + " reverted", "success");
          if (bulkEdit.onDone) bulkEdit.onDone();
        } } } : {});
        if (bulkEdit.onDone) bulkEdit.onDone();
      }} />`}

    ${archiving && archiving.length > 0 && html`<${ArchiveDialog}
      records=${archiving} noun=${archive.noun || one}
      labelOf=${(rowDelete && rowDelete.labelOf) || null}
      onArchive=${(r, reason) => archive.onArchive(r, reason)}
      onClose=${() => setArchiving(null)}
      onDone=${({ archived, failed }) => {
        setArchiving(null);
        setSel((s0) => { const n = new Set(s0); archived.forEach((r) => n.delete(r.id)); return n; });
        toast(archived.length + " " + (archive.noun || one) + (archived.length === 1 ? "" : "s") + " archived"
          + (failed.length ? " · " + failed.length + " refused" : ""),
        failed.length ? "info" : "success", undefined,
        archived.length ? { action: { label: "Undo", onClick: async () => {
          for (const r of archived) await archive.onUnarchive(r);
          toast(archived.length + " brought back", "success");
          if (archive.onDone) archive.onDone();
        } } } : {});
        if (archive.onDone) archive.onDone();
      }} />`}

    ${bulk && html`<${BulkDeleteDialog}
      records=${(rows || []).filter((r) => sel.has(r.id))} viewer=${viewer}
      noun=${rowDelete.noun || one}
      onDelete=${(r, reason) => rowDelete.onRemove(r, reason)}
      onClose=${() => setBulk(false)}
      onDone=${({ removed, failed }) => {
        setBulk(false);
        /* Only what actually went is deselected. Whatever was refused stays
           ticked, so the reader can see exactly what did not happen. */
        setSel((s0) => { const n = new Set(s0); removed.forEach((r) => n.delete(r.id)); return n; });
        const ids = removed.map((r) => r.id);
        toast(removed.length + " " + (rowDelete.noun || one) + (removed.length === 1 ? "" : "s") + " removed"
          + (failed.length ? " · " + failed.length + " refused" : ""),
        failed.length ? "info" : "success", undefined,
        (ids.length && rowDelete.onRestore) ? { action: { label: "Undo", onClick: async () => {
          for (const r of removed) await rowDelete.onRestore(r);
          toast(ids.length + " restored", "success");
          if (rowDelete.onDone) rowDelete.onDone();
        } } } : {});
        if (rowDelete.onDone) rowDelete.onDone();
      }} />`}

    ${deleting && (() => {
      const label = rowDelete.labelOf ? rowDelete.labelOf(deleting) : deleting.id;
      const elig = deleteEligibility(deleting, viewer, { noun: rowDelete.noun || one, native: !!rowDelete.native });
      return html`<${DeleteDialog} record=${deleting} title=${label} eligibility=${elig}
        onDelete=${(reason) => rowDelete.onRemove(deleting, reason)}
        onRequest=${(reason) => rowDelete.onRequest(deleting, label, reason)}
        onClose=${() => setDeleting(null)}
        onDone=${() => {
          if (elig.mode === "delete") {
            removedToast(label, rowDelete.onRestore ? () => rowDelete.onRestore(deleting) : null);
          }
          setDeleting(null);
          if (rowDelete.onDone) rowDelete.onDone();
        }} />`;
    })()}

    ${moreOpen && html`<${Drawer} title="More filters" width=400 onClose=${() => { setMoreOpen(false); if (moreBtn.current) moreBtn.current.focus(); }}
      footer=${html`<div class="row" style="gap:8px;width:100%">
        <${Btn} variant="ghost" onClick=${() => { advanced.forEach((x) => f.clear(x.key)); }}>Clear these</${Btn}>
        <div class="spacer"></div>
        <${Btn} variant="primary" onClick=${() => { setMoreOpen(false); if (moreBtn.current) moreBtn.current.focus(); }}>Done</${Btn}>
      </div>`}>
      <div class="col" style="padding:14px;gap:16px">
        ${advanced.map((x) => html`<div key=${x.key}>
          <div class="fldlabel">${x.label}</div>
          <div class="fltopts">
            ${(f.options[x.key] || []).slice(0, 40).map((o) => html`<label key=${o.value} class="fltopt">
              <input type="checkbox" checked=${(f.active[x.key] || []).includes(o.value)} onChange=${() => f.toggle(x.key, o.value)} />
              <span class="fltopt__l">${o.label}</span><span class="fltopt__c">${o.count.toLocaleString()}</span>
            </label>`)}
            ${(f.options[x.key] || []).length > 40 && html`<div class="tiny muted" style="padding:6px 2px">
              Showing the 40 most common of ${(f.options[x.key] || []).length} values — use search to narrow.</div>`}
          </div>
        </div>`)}
      </div>
    </${Drawer}>`}
  </div>`;
}


/* -------------------------------------------------------------- column menu -- */
function ColumnMenu({ columns, hidden, setHidden, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", d); document.addEventListener("keydown", k, true);
    const el = ref.current && ref.current.querySelector("input");
    if (el) el.focus();
    return () => { document.removeEventListener("mousedown", d); document.removeEventListener("keydown", k, true); };
  }, []);
  return html`<div class="fltpanel" ref=${ref} style="width:240px" role="group" aria-label="Show columns">
    <div class="fltpanel__list">
      ${columns.map((c) => html`<label key=${c.key} class=${cx("fltopt", c.essential && "fltopt--locked")}>
        <input type="checkbox" checked=${c.essential || !hidden.includes(c.key)} disabled=${!!c.essential}
          onChange=${() => setHidden(hidden.includes(c.key) ? hidden.filter((k) => k !== c.key) : hidden.concat(c.key))} />
        <span class="fltopt__l">${c.label}</span>
        ${c.essential && html`<span class="fltopt__c" title="This column identifies the record and cannot be hidden"><${Icon} name="lock" size=11 /></span>`}
      </label>`)}
    </div>
    <div class="fltpanel__foot">
      <button type="button" class="btn btn--ghost btn--sm" onClick=${() => setHidden([])}>Show all columns</button>
    </div>
  </div>`;
}

/* -------------------------------------------------------------- export menu -- */
/* Export follows what is on screen. Exporting the whole register while the user
   is looking at 23 of 357 rows is how filtered data quietly becomes a full data
   extract, so "everything" is a separate, labelled choice. Neither option can
   reach beyond `rows`, which the server already scoped to this user. */
function ExportMenu({ name, columns, filtered, all, anyFilter, many }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null); const btn = useRef(null);
  useEffect(() => {
    if (!open) return;
    const d = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") { setOpen(false); if (btn.current) btn.current.focus(); } };
    document.addEventListener("mousedown", d); document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("mousedown", d); document.removeEventListener("keydown", k, true); };
  }, [open]);
  if (!anyFilter) {
    return html`<button type="button" class="fltbtn" onClick=${() => downloadCsv(name, columns, all)}>
      <${Icon} name="download" size=13 /><span>Export</span></button>`;
  }
  return html`<div class="fltwrap" ref=${wrap}>
    <button type="button" ref=${btn} class="fltbtn" aria-expanded=${open ? "true" : "false"} aria-haspopup="true"
      onClick=${() => setOpen(!open)}><${Icon} name="download" size=13 /><span>Export</span><${Icon} name="chevronDown" size=13 /></button>
    ${open && html`<div class="fltpanel" style="width:260px">
      <div class="fltpanel__list">
        <button type="button" class="fltview" onClick=${() => { downloadCsv(name + "-filtered", columns, filtered); setOpen(false); }}>
          These ${filtered.length.toLocaleString()} ${many}<span class="tiny muted"> · current filters</span>
        </button>
        <button type="button" class="fltview" onClick=${() => { downloadCsv(name, columns, all); setOpen(false); }}>
          All ${all.length.toLocaleString()} ${many}<span class="tiny muted"> · everything you can access</span>
        </button>
      </div>
    </div>`}
  </div>`;
}

export { downloadCsv, csvCell };
