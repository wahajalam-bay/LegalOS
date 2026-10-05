// Shared cross-cutting UI: work-category pills/chips, company tag chips and
// editor, the sub-division pill, the TAT cell and destination chips.
//
// The Master FilterBar used to live here too. Every register now uses the shared
// register shell (register.js) over the filter engine (filters.js), with state in
// the URL and saved views on the server, so the old component and its
// localStorage-backed `useFilters` were removed rather than left as a second,
// parallel way to filter the same data.
import { html, cx, useState, useEffect, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Chip, Modal, Btn, Field, Input } from "./ui.js";
import { getCollection, addItem, nextId } from "./store.js";
import { navigate } from "./router.js";
import {
  WORK_CATEGORIES, CATEGORY_TONE, COMPANIES, categoryOf, subdivisionOf,
  SUBDIVISION_TONE,
  nameOf, entityName,
} from "./data.js";
import { companyPath } from "./pages/companies.js";

/* ---------- Categories (Feature 6) ---------- */
export function CategoryPill({ item, category }) {
  const cat = category || (item && categoryOf(item));
  if (!cat) return null;
  return html`<${Pill} tone=${CATEGORY_TONE[cat] || "gray"}>${cat}</${Pill}>`;
}

// Multi-select chip row. `selected` is an array of category names.
export function CategoryChips({ selected = [], onToggle }) {
  return html`<div class="row wrap" style="gap:8px">
    ${WORK_CATEGORIES.map((c) => html`<${Chip} key=${c} active=${selected.includes(c)} onClick=${() => onToggle(c)}>${c}</${Chip}>`)}
  </div>`;
}

// Filter predicate — combines with existing filters. Empty selection = pass-all.
export function matchCategories(item, selected) {
  if (!selected || !selected.length) return true;
  return selected.includes(categoryOf(item));
}

/* ---------- Company tags (Feature 7) ---------- */

// Small muted chips with a building icon. Click → company view (default) or custom.
export function TagChips({ ids = [], onClick, size = "sm" }) {
  const comps = getCollection("companies") || COMPANIES;
  const list = ids.map((id) => comps.find((c) => c.id === id)).filter(Boolean);
  if (!list.length) return null;
  return html`<div class="row wrap" style="gap:6px">
    ${list.map((c) => { const to = companyPath(c.name);
      /* A company with no resolvable name has no page to open, so the chip is
         rendered as a label rather than as a button that goes nowhere. */
      if (!onClick && !to) return html`<span key=${c.id} class="tagchip" style="cursor:default">
        <${Icon} name="building" size=${size === "sm" ? 11 : 13} />${c.name || "Unnamed entity"}</span>`;
      return html`<button key=${c.id} class="tagchip" onClick=${(e) => { e.stopPropagation(); onClick ? onClick(c) : navigate(to); }}>
        <${Icon} name="building" size=${size === "sm" ? 11 : 13} />${c.name}
      </button>`; })}
  </div>`;
}

// Searchable multi-select over the registry + inline "create new company".
export function TagEditor({ ids = [], onClose, onSave }) {
  const [sel, setSel] = useState([...ids]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState("");
  const comps = getCollection("companies") || COMPANIES;
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const filtered = comps.filter((c) => !q || (c.name + " " + (c.aliases || []).join(" ")).toLowerCase().includes(q.toLowerCase()));
  const createNew = () => {
    const name = creating.trim();
    if (!name) return;
    const id = nextId("companies", "CO-");
    addItem("companies", { id, name, aliases: [], jurisdiction: "—", type: "Counterparty" });
    setSel((s) => [...s, id]);
    setCreating("");
    setQ("");
  };
  return html`<${Modal} title="Edit company tags" icon="building" width=${540} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${() => { onSave(sel); onClose(); }}>Save tags</${Btn}>`}>
    <div class="col" style="gap:14px">
      <${Field} label="Search companies"><${Input} placeholder="Search registry…" value=${q} onInput=${(e) => setQ(e.target.value)} /></${Field}>
      <div class="col" style="gap:6px;max-height:260px;overflow-y:auto">
        ${filtered.length === 0 && html`<div class="tiny muted" style="padding:6px 2px">No matches in the registry.</div>`}
        ${filtered.map((c) => html`<div key=${c.id} class="row clickable" style="gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:9px;background:${sel.includes(c.id) ? "var(--brand-soft)" : "transparent"}" onClick=${() => toggle(c.id)}>
          <div class="notif__ico" style="width:28px;height:28px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="building" size=15 /></div>
          <div style="flex:1;min-width:0"><div class="strong tiny">${c.name}</div><div class="tiny muted">${c.type} · ${c.jurisdiction}</div></div>
          ${sel.includes(c.id) ? html`<${Icon} name="checkcircle" size=17 style=${{ color: "var(--brand)" }} />` : html`<${Icon} name="plus" size=16 style=${{ color: "var(--text-3)" }} />`}
        </div>`)}
      </div>
      <div class="row" style="gap:8px;align-items:flex-end;padding-top:6px;border-top:1px solid var(--border)">
        <div style="flex:1"><${Field} label="Create new company"><${Input} placeholder="e.g. New Counterparty LLC" value=${creating} onInput=${(e) => setCreating(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); createNew(); } }} /></${Field}></div>
        <${Btn} variant="soft" icon="plus" onClick=${createNew}>Add</${Btn}>
      </div>
    </div>
  </${Modal}>`;
}

/* ============================================================
   WORKSTREAM B — the Master Filter Bar
   One primitive, reused everywhere. A module declares which dimensions it
   wants (`dims`) and which date fields make sense for its rows (`dateFields`);
   everything else — chips, presets, sorting, saved views, last-used
   persistence — comes for free.
   ============================================================ */



// How a row exposes each dimension. Falls back across legacy field names so the
// same bar works on requests, matters, contracts, licenses, reviews, compliance.
const ACC = {
  unit: (r) => r.unit || r.bu || null,
  department: (r) => r.department || r.dept || null,
  entity: (r) => r.entityId || r.entityName || null,
  contractType: (r) => r.contractType || null,
  subdivision: (r) => subdivisionOf(r),
  category: (r) => categoryOf(r),
  owner: (r) => r.owner || r.reviewer || r.lead || null,
  status: (r) => r.status || null,
  risk: (r) => (r.risk || "").toLowerCase() || null,
  tatStatus: (r) => (r.__tat && r.__tat.status) || null,
  region: (r) => r.region || null,
  city: (r) => r.city || null,
};
// Multi-select dimensions: [filter key, accessor key]. Entities also match the
// record's companyTags, so a counterparty filter catches tagged work too.
const DIM_PAIRS = [
  ["units", "unit"], ["departments", "department"], ["contractTypes", "contractType"],
  ["subdivisions", "subdivision"], ["categories", "category"], ["owners", "owner"],
  ["statuses", "status"], ["risks", "risk"], ["tatStatuses", "tatStatus"],
  ["regions", "region"], ["cities", "city"],
];

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Resolve a preset into a concrete [from, to] window on the chosen date field.

const SORTERS = {
  due: (r) => new Date(r.dueDate || r.due || r.sla || 0).getTime(),
  expiry: (r) => new Date(r.expiry || r.expiryDate || r.nextReview || 0).getTime(),
  value: (r) => Number(r.value || r.exposure || 0),
  tat: (r) => (r.__tat ? (r.__tat.remaining == null ? 0 : r.__tat.remaining) : 0),
  activity: (r) => new Date(r.updated || r.received || r.requestDate || r.created || r.opened || r.start || 0).getTime(),
  srNo: (r) => Number(r.srNo || 0),
  entity: (r) => String(entityName(r.entityId) || r.company || "").toLowerCase(),
  title: (r) => String(r.title || r.name || r.area || "").toLowerCase(),
};

// The engine. `rows` may carry a precomputed `__tat` for TAT filtering/sorting.


/* ---------------- state hook: last-used set persists per module ----------------
   By default the user's last-used set wins over `initial`, so returning to a
   module feels like coming back to your own desk. Pass `{ force: true }` when
   `initial` is an explicit navigation intent (a deep link from the Executive
   Overview or the Flow Map) that must beat whatever was there before. */

/* ---------------- a popover that does NOT close on selection ---------------- */
function Pop({ label, icon, count, width = 250, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  return html`<div ref=${ref} style="position:relative">
    <button class=${cx("fbtn", (count > 0 || open) && "active")} onClick=${() => setOpen((o) => !o)}>
      ${icon && html`<${Icon} name=${icon} size=14 />`}
      <span>${label}</span>
      ${count > 0 && html`<span class="fbtn__n">${count}</span>`}
      <${Icon} name="chevronDown" size=13 />
    </button>
    ${open && html`<div class="fpop" style=${`width:${width}px`}>${children}</div>`}
  </div>`;
}

// Multi-select option list with a search box + counts.
function OptList({ options, selected = [], onToggle, searchable, counts }) {
  const [q, setQ] = useState("");
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return html`<div class="col" style="gap:6px">
    ${searchable && html`<input class="input" style="height:32px;font-size:12.5px" placeholder="Search…" value=${q} onInput=${(e) => setQ(e.target.value)} />`}
    <div class="fpop__list">
      ${list.length === 0 && html`<div class="tiny muted" style="padding:8px 4px">No matches.</div>`}
      ${list.map((o) => html`<button key=${o.value} class=${cx("fopt", selected.includes(o.value) && "active")} onClick=${() => onToggle(o.value)}>
        <span class="fopt__box">${selected.includes(o.value) && html`<${Icon} name="check" size=11 />`}</span>
        <span class="fopt__label">${o.label}</span>
        ${counts && counts[o.value] != null && html`<span class="fopt__n">${counts[o.value]}</span>`}
      </button>`)}
    </div>
  </div>`;
}

const optsOf = (arr) => arr.map((x) => ({ value: x, label: x }));
const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * FilterBar — the one filter surface.
 *
 * @param module      persistence key ("workspace", "tracker", "licenses"…)
 * @param filters     state from useFilters()
 * @param onPatch     (partial) => void
 * @param onToggle    (key, value) => void
 * @param onClear     () => void
 * @param dims        which dimensions to render, in order. Default: all.
 * @param dateFields  [{key,label}] date fields this module can window on
 * @param rows        unfiltered rows — used for option counts
 * @param statuses    module-specific status list
 * @param right       extra actions (export, view toggles…)
 */

/* ---------------- small shared presenters used across the new modules ---------------- */
export function SubdivisionPill({ item, value }) {
  const s = value || subdivisionOf(item);
  if (!s) return null;
  return html`<${Pill} tone=${SUBDIVISION_TONE[s] || "gray"}>${s}</${Pill}>`;
}

// The TAT Status cell: On Track / Due Today / Delayed (+days, +blocking stage).
export function TatCell({ tat, compact }) {
  if (!tat) return html`<span class="tiny muted">—</span>`;
  const tone = tat.tone;
  return html`<div class="col" style="gap:2px;align-items:flex-start">
    <span class=${cx("tatpill", `tatpill--${tone}`)}>
      <span class="tatpill__dot"></span>${tat.status}${tat.status === "Delayed" ? ` +${tat.overdueBy}d` : ""}
    </span>
    ${!compact && tat.status === "Delayed" && tat.blockingStage && html`<span class="tiny" style="color:var(--danger);font-weight:600">
      blocked at ${tat.blockingStage}${tat.blockingOwner ? " · " + nameOf(tat.blockingOwner).split(" ")[0] : ""}
    </span>`}
  </div>`;
}

// Drive link + physical record + tracker row — the three destinations, inline.
export function DestinationChips({ rec }) {
  if (!rec) return null;
  return html`<div class="row wrap" style="gap:6px">
    ${rec.driveLink && html`<a class="tagchip" href=${rec.driveLink} target="_blank" rel="noreferrer" onClick=${(e) => e.stopPropagation()}><${Icon} name="externalLink" size=11 />Drive</a>`}
    ${rec.physicalRecordRef && html`<span class="tagchip"><${Icon} name="database" size=11 />${rec.physicalRecordRef}</span>`}
    ${rec.srNo && html`<span class="tagchip"><${Icon} name="hash" size=11 />Sr ${rec.srNo}</span>`}
  </div>`;
}
