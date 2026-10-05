// Saved views control — a user's named filter states.
//
// The store is the SERVER (api/views.js). Nothing here is authoritative: a view
// carries filter criteria only, so applying one sets the register's filters and
// the register API then decides, as it always does, which rows this person may
// see today. A view saved while someone held litigation access shows nothing
// after that access is removed — the criteria survive, the authority does not.
//
// Stale criteria are kept, not discarded. If a saved view names a status the
// register no longer has, or an entity that has gone, the rest of the view still
// applies and the user is told which parts no longer match anything.
import { html, cx, useState, useEffect, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { Btn } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";

export function useSavedViews(register) {
  const [views, setViews] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const load = () => api.views.list(register).then(
    (r) => { setViews(r.views || []); setLoaded(true); },
    () => { setViews([]); setLoaded(true); }        // unavailable is not fatal
  );
  useEffect(() => { load(); }, [register]);
  return { views, loaded, reload: load };
}

/* Which saved criteria no longer match anything in the register the user can
   actually see? Reported, never silently dropped. */
export function staleCriteria(view, options) {
  const out = [];
  for (const [key, vals] of Object.entries((view && view.filters) || {})) {
    const known = (options && options[key]) || null;
    if (!known) { out.push({ key, values: vals, reason: "filter no longer exists" }); continue; }
    const gone = vals.filter((v) => !known.some((o) => o.value === v));
    if (gone.length) out.push({ key, values: gone, reason: "no longer present in this register" });
  }
  return out;
}

export function SavedViews({ register, f, fields, options, hidden, onApplyColumns, quickViews = [] }) {
  const { views, reload } = useSavedViews(register);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [busy, setBusy] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);
  const nameInput = useRef(null);

  useEffect(() => {
    if (!open) return;
    const d = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setOpen(false); setNaming(false); setRenaming(null); } };
    const k = (e) => { if (e.key === "Escape") { setOpen(false); setNaming(false); setRenaming(null); if (btn.current) btn.current.focus(); } };
    document.addEventListener("mousedown", d);
    document.addEventListener("keydown", k, true);
    return () => { document.removeEventListener("mousedown", d); document.removeEventListener("keydown", k, true); };
  }, [open]);
  useEffect(() => { if (naming && nameInput.current) nameInput.current.focus(); }, [naming]);

  // The filter state as it stands right now, ready to be saved.
  const currentState = () => ({
    register,
    filters: Object.fromEntries(fields.filter((x) => (f.active[x.key] || []).length).map((x) => [x.key, f.active[x.key]])),
    q: f.q || "",
    sort: f.sort || null,
    hiddenColumns: hidden || [],
  });

  const applyView = (v) => {
    const stale = staleCriteria(v, options);
    f.applySaved({ filters: v.filters, q: v.q, sort: v.sort });
    if (onApplyColumns) onApplyColumns(v.hiddenColumns || []);
    setOpen(false);
    if (stale.length) {
      const labelOf = (k) => (fields.find((x) => x.key === k) || {}).label || k;
      toast("Applied “" + v.name + "”. Some saved criteria no longer apply: "
        + stale.map((s) => labelOf(s.key)).join(", "));
    }
  };

  const save = () => {
    const nm = name.trim();
    if (!nm) return;
    setBusy(true);
    api.views.create({ ...currentState(), name: nm }).then(
      (r) => { toast("Saved view “" + nm + "”"); setName(""); setNaming(false); reload();
               if (r.dropped && r.dropped.length) toast(r.dropped.length + " unsupported criteria were not saved."); },
      (e) => toast(e.message || "Could not save the view")
    ).finally(() => setBusy(false));
  };

  const overwrite = (v) => {
    setBusy(true);
    api.views.update(v.id, currentState()).then(
      () => { toast("“" + v.name + "” updated to the current filters"); reload(); },
      (e) => toast(e.message || "Could not update the view")
    ).finally(() => setBusy(false));
  };
  const rename = (v, nm) => {
    if (!nm.trim() || nm.trim() === v.name) { setRenaming(null); return; }
    setBusy(true);
    api.views.update(v.id, { name: nm.trim() }).then(
      () => { setRenaming(null); reload(); },
      (e) => toast(e.message || "Could not rename the view")
    ).finally(() => setBusy(false));
  };
  const setDefault = (v) => {
    setBusy(true);
    api.views.update(v.id, { isDefault: !v.isDefault }).then(
      () => { toast(v.isDefault ? "No longer the default" : "“" + v.name + "” is now your default here"); reload(); },
      (e) => toast(e.message || "Could not set the default")
    ).finally(() => setBusy(false));
  };
  const duplicate = (v) => { setBusy(true); api.views.duplicate(v.id).then(() => reload(), (e) => toast(e.message || "Could not duplicate")).finally(() => setBusy(false)); };
  const remove = (v) => { setBusy(true); api.views.remove(v.id).then(() => { toast("Deleted “" + v.name + "”"); reload(); }, (e) => toast(e.message || "Could not delete")).finally(() => setBusy(false)); };

  const active = quickViews.find((v) => f.matchesView(v.filters));
  const anyFilter = Object.keys(f.active).length > 0 || !!f.q;
  const label = active ? active.label : (views.length ? "Views" : "Views");

  return html`<div class="fltwrap" ref=${wrap}>
    <button type="button" ref=${btn} class=${cx("fltbtn", (active || views.some((v) => v.isDefault)) && "fltbtn--on")}
      aria-expanded=${open ? "true" : "false"} aria-haspopup="true"
      onClick=${() => setOpen(!open)}>
      <${Icon} name="eye" size=13 /><span>${label}</span>
      ${views.length > 0 && html`<span class="fltbtn__n">${views.length}</span>`}
      <${Icon} name="chevronDown" size=13 />
    </button>
    ${open && html`<div class="fltpanel" style="width:300px" role="group" aria-label="Views">
      ${quickViews.length > 0 && html`<div class="fltpanel__list">
        <div class="fltpanel__label">Standard views</div>
        ${quickViews.map((v) => html`<button key=${v.id} type="button"
          class=${cx("fltview", active && active.id === v.id && "fltview--on")}
          onClick=${() => { f.applyView(v.filters); setOpen(false); }}>${v.label}</button>`)}
      </div>`}

      <div class="fltpanel__list" style="border-top:1px solid var(--border)">
        <div class="fltpanel__label">My saved views</div>
        ${views.length === 0 && html`<div class="tiny muted" style="padding:6px 10px 10px">
          None yet. Filter the register, then save it here — your views follow you to any device.</div>`}
        ${views.map((v) => html`<div key=${v.id} class="svrow">
          ${renaming === v.id
            ? html`<input class="input input--sm" defaultValue=${v.name} autoFocus
                onKeyDown=${(e) => { if (e.key === "Enter") rename(v, e.target.value); if (e.key === "Escape") setRenaming(null); }}
                onBlur=${(e) => rename(v, e.target.value)} aria-label=${"Rename " + v.name} />`
            : html`<button type="button" class="svrow__apply" onClick=${() => applyView(v)}
                title=${"Apply " + v.name}>
                ${v.isDefault && html`<${Icon} name="star" size=12 />`}
                <span class="svrow__name">${v.name}</span>
              </button>`}
          <${ViewMenu} v=${v} busy=${busy} anyFilter=${anyFilter}
            onOverwrite=${() => overwrite(v)} onRename=${() => setRenaming(v.id)}
            onDuplicate=${() => duplicate(v)} onDefault=${() => setDefault(v)} onDelete=${() => remove(v)} />
        </div>`)}
      </div>

      <div class="fltpanel__foot">
        ${naming
          ? html`<div class="row" style="gap:6px">
              <input ref=${nameInput} class="input input--sm" placeholder="Name this view…" value=${name}
                aria-label="Name for the saved view"
                onInput=${(e) => setName(e.target.value)}
                onKeyDown=${(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setNaming(false); setName(""); } }} />
              <${Btn} variant="primary" size="sm" onClick=${save} disabled=${busy || !name.trim()}>Save</${Btn}>
            </div>`
          : html`<div class="row" style="gap:6px">
              <button type="button" class="btn btn--ghost btn--sm" disabled=${!anyFilter}
                title=${anyFilter ? "Save the current filters as a named view" : "Apply a filter first"}
                onClick=${() => setNaming(true)}><${Icon} name="plus" size=13 /> Save current filters</button>
              <div class="spacer"></div>
              <button type="button" class="btn btn--ghost btn--sm" onClick=${() => { f.clearAll(); setOpen(false); }}>All records</button>
            </div>`}
      </div>
    </div>`}
  </div>`;
}

function ViewMenu({ v, busy, anyFilter, onOverwrite, onRename, onDuplicate, onDefault, onDelete }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const d = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setConfirm(false); } };
    document.addEventListener("mousedown", d);
    return () => document.removeEventListener("mousedown", d);
  }, [open]);
  return html`<div class="svrow__menu" ref=${ref}>
    <button type="button" class="iconbtn iconbtn--sm" aria-label=${"Actions for " + v.name}
      aria-expanded=${open ? "true" : "false"} aria-haspopup="menu"
      onClick=${() => setOpen(!open)}><${Icon} name="moreV" size=14 /></button>
    ${open && html`<div class="menu svmenu" role="menu">
      <button type="button" role="menuitem" class="menu__item" disabled=${busy || !anyFilter}
        onClick=${() => { onOverwrite(); setOpen(false); }}>Update to current filters</button>
      <button type="button" role="menuitem" class="menu__item" onClick=${() => { onRename(); setOpen(false); }}>Rename</button>
      <button type="button" role="menuitem" class="menu__item" onClick=${() => { onDuplicate(); setOpen(false); }}>Duplicate</button>
      <button type="button" role="menuitem" class="menu__item" onClick=${() => { onDefault(); setOpen(false); }}>
        ${v.isDefault ? "Remove as default" : "Set as default"}</button>
      <div class="menu__sep"></div>
      ${confirm
        ? html`<button type="button" role="menuitem" class="menu__item danger"
            onClick=${() => { onDelete(); setOpen(false); setConfirm(false); }}>Delete “${v.name}” — confirm</button>`
        : html`<button type="button" role="menuitem" class="menu__item danger"
            onClick=${() => setConfirm(true)}>Delete…</button>`}
    </div>`}
  </div>`;
}
