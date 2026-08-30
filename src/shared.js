// Shared cross-cutting UI:
//  • work-category pills/chips (Feature 6) and company tag chips + editor (Feature 7)
//  • the Master FilterBar (Sprint 3 / Workstream B) — built ONCE here and reused by
//    the Legal Workspace, Contracts, Compliance, Licenses, Reviews and the Tracker.
import { html, cx, fmt, useState, useEffect, useRef, useMemo } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Chip, Modal, Btn, Field, Input, SearchInput } from "./ui.js";
import { getCollection, addItem, nextId, saveView, viewsFor, loadLastFilters, saveLastFilters, removeItem } from "./store.js";
import { navigate } from "./router.js";
import {
  WORK_CATEGORIES, CATEGORY_TONE, COMPANIES, categoryOf, subdivisionOf,
  BUSINESS_UNITS, DEPARTMENTS, LEGAL_SUBDIVISIONS, SUBDIVISION_TONE,
  CONTRACT_TYPE_CODES, USERS, nameOf,
} from "./data.js";

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
export function companyById(id) {
  return (getCollection("companies") || COMPANIES).find((c) => c.id === id) || null;
}
export function companyName(id) {
  const c = companyById(id);
  return c ? c.name : id;
}

// Small muted chips with a building icon. Click → company view (default) or custom.
export function TagChips({ ids = [], onClick, size = "sm" }) {
  const comps = getCollection("companies") || COMPANIES;
  const list = ids.map((id) => comps.find((c) => c.id === id)).filter(Boolean);
  if (!list.length) return null;
  return html`<div class="row wrap" style="gap:6px">
    ${list.map((c) => html`<button key=${c.id} class="tagchip" onClick=${(e) => { e.stopPropagation(); onClick ? onClick(c) : navigate("/companies/" + c.id); }}>
      <${Icon} name="building" size=${size === "sm" ? 11 : 13} />${c.name}
    </button>`)}
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

export const EMPTY_FILTERS = {
  q: "",
  units: [], departments: [], entities: [], contractTypes: [], subdivisions: [],
  categories: [], owners: [], statuses: [], risks: [], tatStatuses: [],
  dateField: "", datePreset: "", dateFrom: "", dateTo: "",
  sortBy: "", sortDir: "desc",
};

export const RISK_TIERS = ["critical", "high", "medium", "low"];
export const TAT_STATUSES = ["On Track", "Due Today", "Delayed"];
export const DATE_PRESETS = [
  { key: "exp30", label: "Expiring ≤30d" },
  { key: "exp60", label: "Expiring ≤60d" },
  { key: "exp90", label: "Expiring ≤90d" },
  { key: "overdue", label: "Overdue" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
];

// How a row exposes each dimension. Falls back across legacy field names so the
// same bar works on requests, matters, contracts, licenses, reviews, compliance.
const ACC = {
  unit: (r) => r.unit || r.bu || null,
  department: (r) => r.department || r.dept || null,
  entity: (r) => r.entityId || null,
  contractType: (r) => r.contractType || null,
  subdivision: (r) => subdivisionOf(r),
  category: (r) => categoryOf(r),
  owner: (r) => r.owner || r.reviewer || r.lead || null,
  status: (r) => r.status || null,
  risk: (r) => (r.risk || "").toLowerCase() || null,
  tatStatus: (r) => (r.__tat && r.__tat.status) || null,
};
// Multi-select dimensions: [filter key, accessor key]. Entities also match the
// record's companyTags, so a counterparty filter catches tagged work too.
const DIM_PAIRS = [
  ["units", "unit"], ["departments", "department"], ["contractTypes", "contractType"],
  ["subdivisions", "subdivision"], ["categories", "category"], ["owners", "owner"],
  ["statuses", "status"], ["risks", "risk"], ["tatStatuses", "tatStatus"],
];

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Resolve a preset into a concrete [from, to] window on the chosen date field.
export function presetWindow(preset, now = new Date()) {
  const t0 = dayStart(now);
  const plus = (n) => new Date(t0.getTime() + n * 86400000);
  switch (preset) {
    case "exp30": return [t0, plus(30)];
    case "exp60": return [t0, plus(60)];
    case "exp90": return [t0, plus(90)];
    case "overdue": return [new Date(0), t0];
    case "month": return [new Date(t0.getFullYear(), t0.getMonth(), 1), new Date(t0.getFullYear(), t0.getMonth() + 1, 0, 23, 59, 59)];
    case "quarter": {
      const q = Math.floor(t0.getMonth() / 3);
      return [new Date(t0.getFullYear(), q * 3, 1), new Date(t0.getFullYear(), q * 3 + 3, 0, 23, 59, 59)];
    }
    default: return null;
  }
}

const SORTERS = {
  due: (r) => new Date(r.dueDate || r.due || r.sla || 0).getTime(),
  expiry: (r) => new Date(r.expiry || r.expiryDate || r.nextReview || 0).getTime(),
  value: (r) => Number(r.value || r.exposure || 0),
  tat: (r) => (r.__tat ? (r.__tat.remaining == null ? 0 : r.__tat.remaining) : 0),
  activity: (r) => new Date(r.updated || r.received || r.requestDate || r.created || r.opened || r.start || 0).getTime(),
  srNo: (r) => Number(r.srNo || 0),
  title: (r) => String(r.title || r.name || r.area || "").toLowerCase(),
};
export const SORT_OPTIONS = [
  { key: "due", label: "Due date" },
  { key: "tat", label: "TAT health" },
  { key: "value", label: "Value" },
  { key: "expiry", label: "Expiry" },
  { key: "activity", label: "Last activity" },
  { key: "srNo", label: "Sr No" },
  { key: "title", label: "Title" },
];

// The engine. `rows` may carry a precomputed `__tat` for TAT filtering/sorting.
export function applyFilters(rows, f, opts = {}) {
  const filters = { ...EMPTY_FILTERS, ...(f || {}) };
  const searchKeys = opts.searchKeys || ["title", "name", "area", "counterparty", "id", "landRef", "physicalRecordRef"];
  let out = rows;

  if (filters.q) {
    const q = filters.q.toLowerCase();
    out = out.filter((r) => searchKeys.map((k) => String(r[k] == null ? "" : r[k])).join(" ").toLowerCase().includes(q));
  }

  DIM_PAIRS.forEach(([key, acc]) => {
    const sel = filters[key];
    if (!sel || !sel.length) return;
    out = out.filter((r) => sel.includes(ACC[acc](r)));
  });

  // Entity/company: match the owning entity OR any company tag.
  if (filters.entities && filters.entities.length) {
    out = out.filter((r) => filters.entities.includes(r.entityId) || (r.companyTags || []).some((t) => filters.entities.includes(t)));
  }

  // Date window on whichever date field the module chose.
  const field = filters.dateField;
  if (field) {
    let win = presetWindow(filters.datePreset);
    if (!win && (filters.dateFrom || filters.dateTo)) {
      win = [filters.dateFrom ? dayStart(filters.dateFrom) : new Date(0), filters.dateTo ? new Date(new Date(filters.dateTo).setHours(23, 59, 59)) : new Date(8.64e15)];
    }
    if (win) {
      out = out.filter((r) => {
        const v = r[field];
        if (!v) return false;
        const t = new Date(v).getTime();
        return t >= win[0].getTime() && t <= win[1].getTime();
      });
    }
  }

  if (filters.sortBy && SORTERS[filters.sortBy]) {
    const s = SORTERS[filters.sortBy];
    const dir = filters.sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => { const av = s(a), bv = s(b); return av < bv ? -dir : av > bv ? dir : 0; });
  }
  return out;
}

export const activeFilterCount = (f) => {
  const filters = { ...EMPTY_FILTERS, ...(f || {}) };
  let n = 0;
  Object.keys(EMPTY_FILTERS).forEach((k) => {
    if (Array.isArray(filters[k])) n += filters[k].length;
  });
  if (filters.datePreset || filters.dateFrom || filters.dateTo) n += 1;
  if (filters.q) n += 1;
  return n;
};

/* ---------------- state hook: last-used set persists per module ----------------
   By default the user's last-used set wins over `initial`, so returning to a
   module feels like coming back to your own desk. Pass `{ force: true }` when
   `initial` is an explicit navigation intent (a deep link from the Executive
   Overview or the Flow Map) that must beat whatever was there before. */
export function useFilters(module, initial = {}, { force = false } = {}) {
  const [filters, setFilters] = useState(() => (force
    ? { ...EMPTY_FILTERS, ...(loadLastFilters(module) || {}), ...initial }
    : { ...EMPTY_FILTERS, ...initial, ...(loadLastFilters(module) || {}) }));
  useEffect(() => { saveLastFilters(module, filters); }, [module, filters]);
  const patch = (p) => setFilters((s) => ({ ...s, ...p }));
  const toggle = (key, value) => setFilters((s) => {
    const cur = s[key] || [];
    return { ...s, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
  });
  const clear = () => setFilters({ ...EMPTY_FILTERS, ...initial });
  return { filters, setFilters, patch, toggle, clear };
}

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
export function FilterBar({
  module, filters, onPatch, onToggle, onClear,
  dims = ["units", "departments", "entities", "contractTypes", "subdivisions", "categories", "owners", "statuses", "risks", "tatStatuses"],
  dateFields = [], rows = [], statuses, right, placeholder = "Search…",
  // Chip labels differ by page: "Status" means contract status on the tracker
  // and request status elsewhere. Override per page rather than globally.
  labels = {},
}) {
  const companies = getCollection("companies") || COMPANIES;
  const views = viewsFor(module);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");

  // Option counts come from the unfiltered set so the bar stays informative.
  const counts = useMemo(() => {
    const c = {};
    const bump = (v) => { if (v != null) c[v] = (c[v] || 0) + 1; };
    rows.forEach((r) => {
      bump(ACC.unit(r)); bump(ACC.department(r)); bump(ACC.contractType(r));
      bump(ACC.subdivision(r)); bump(ACC.category(r)); bump(ACC.owner(r));
      bump(ACC.status(r)); bump(ACC.risk(r)); bump(ACC.tatStatus(r));
      bump(r.entityId);
      (r.companyTags || []).forEach(bump);
    });
    return c;
  }, [rows]);

  const legalTeam = USERS.filter((u) => ["Executive", "Commercial", "Corporate", "Litigation", "Compliance", "Operations"].includes(u.team));
  const statusOpts = statuses || [...new Set(rows.map((r) => r.status).filter(Boolean))].sort();

  const DIMS = {
    units: () => html`<${Pop} key="units" label="All Units" icon="grid" count=${filters.units.length}>
      <${OptList} options=${optsOf(BUSINESS_UNITS)} selected=${filters.units} counts=${counts} onToggle=${(v) => onToggle("units", v)} /></${Pop}>`,
    departments: () => html`<${Pop} key="departments" label="All Departments" icon="users" count=${filters.departments.length}>
      <${OptList} options=${optsOf(DEPARTMENTS)} selected=${filters.departments} counts=${counts} onToggle=${(v) => onToggle("departments", v)} /></${Pop}>`,
    entities: () => html`<${Pop} key="entities" label="Company / Entity" icon="building" count=${filters.entities.length} width=${290}>
      <${OptList} searchable=${true} counts=${counts} options=${companies.map((c) => ({ value: c.id, label: `${c.name} · ${c.jur || c.jurisdiction}` }))} selected=${filters.entities} onToggle=${(v) => onToggle("entities", v)} /></${Pop}>`,
    contractTypes: () => html`<${Pop} key="contractTypes" label="Type of Contract" icon="file" count=${filters.contractTypes.length} width=${290}>
      <${OptList} searchable=${true} counts=${counts} options=${optsOf(CONTRACT_TYPE_CODES)} selected=${filters.contractTypes} onToggle=${(v) => onToggle("contractTypes", v)} /></${Pop}>`,
    subdivisions: () => html`<${Pop} key="subdivisions" label="Legal Sub-division" icon="scale" count=${filters.subdivisions.length} width=${280}>
      <${OptList} options=${optsOf(LEGAL_SUBDIVISIONS)} selected=${filters.subdivisions} counts=${counts} onToggle=${(v) => onToggle("subdivisions", v)} /></${Pop}>`,
    categories: () => html`<${Pop} key="categories" label="Category" icon="tag" count=${filters.categories.length} width=${280}>
      <${OptList} options=${optsOf(WORK_CATEGORIES)} selected=${filters.categories} counts=${counts} onToggle=${(v) => onToggle("categories", v)} /></${Pop}>`,
    owners: () => html`<${Pop} key="owners" label="Team member" icon="user" count=${filters.owners.length} width=${270}>
      <${OptList} searchable=${true} counts=${counts} options=${legalTeam.map((u) => ({ value: u.id, label: `${u.name} · ${u.team}` }))} selected=${filters.owners} onToggle=${(v) => onToggle("owners", v)} /></${Pop}>`,
    statuses: () => html`<${Pop} key="statuses" label=${labels.statuses || "Status"} icon="activity" count=${filters.statuses.length}>
      <${OptList} options=${optsOf(statusOpts)} selected=${filters.statuses} counts=${counts} onToggle=${(v) => onToggle("statuses", v)} /></${Pop}>`,
    risks: () => html`<${Pop} key="risks" label="Risk tier" icon="alertTriangle" count=${filters.risks.length} width=${200}>
      <${OptList} options=${RISK_TIERS.map((r) => ({ value: r, label: titleCase(r) }))} selected=${filters.risks} counts=${counts} onToggle=${(v) => onToggle("risks", v)} /></${Pop}>`,
    tatStatuses: () => html`<${Pop} key="tatStatuses" label="TAT status" icon="clock" count=${filters.tatStatuses.length} width=${210}>
      <${OptList} options=${optsOf(TAT_STATUSES)} selected=${filters.tatStatuses} counts=${counts} onToggle=${(v) => onToggle("tatStatuses", v)} /></${Pop}>`,
  };

  // Removable chips for everything currently narrowing the set.
  const chips = [];
  if (filters.q) chips.push({ label: `“${filters.q}”`, clear: () => onPatch({ q: "" }) });
  const chipFor = (key, value, label) => chips.push({ label, clear: () => onToggle(key, value) });
  filters.units.forEach((v) => chipFor("units", v, v));
  filters.departments.forEach((v) => chipFor("departments", v, v));
  filters.entities.forEach((v) => chipFor("entities", v, (companies.find((c) => c.id === v) || { name: v }).name));
  filters.contractTypes.forEach((v) => chipFor("contractTypes", v, v));
  filters.subdivisions.forEach((v) => chipFor("subdivisions", v, v));
  filters.categories.forEach((v) => chipFor("categories", v, v));
  filters.owners.forEach((v) => chipFor("owners", v, nameOf(v)));
  filters.statuses.forEach((v) => chipFor("statuses", v, v));
  filters.risks.forEach((v) => chipFor("risks", v, titleCase(v) + " risk"));
  filters.tatStatuses.forEach((v) => chipFor("tatStatuses", v, "TAT: " + v));
  if (filters.datePreset || filters.dateFrom || filters.dateTo) {
    const fl = (dateFields.find((d) => d.key === filters.dateField) || {}).label || filters.dateField;
    const pl = (DATE_PRESETS.find((p) => p.key === filters.datePreset) || {}).label
      || [filters.dateFrom, filters.dateTo].filter(Boolean).map((x) => fmt.dateShort(x)).join(" → ");
    chips.push({ label: `${fl}: ${pl}`, clear: () => onPatch({ datePreset: "", dateFrom: "", dateTo: "" }) });
  }

  return html`<div class="fbar">
    <div class="fbar__row">
      <div style="width:250px;flex:none"><${SearchInput} value=${filters.q} onChange=${(v) => onPatch({ q: v })} placeholder=${placeholder} /></div>
      ${dims.map((d) => (DIMS[d] ? DIMS[d]() : null))}

      ${dateFields.length > 0 && html`<${Pop} label=${labels.dates || "Dates & expiry"} icon="calendar" width=${280}
        count=${filters.datePreset || filters.dateFrom || filters.dateTo ? 1 : 0}>
        <div class="col" style="gap:10px">
          <${Field} label="Date field">
            <select class="select" value=${filters.dateField} onChange=${(e) => onPatch({ dateField: e.target.value })}>
              ${dateFields.map((f) => html`<option key=${f.key} value=${f.key}>${f.label}</option>`)}
            </select>
          </${Field}>
          <div>
            <div class="fpop__lbl">Quick presets</div>
            <div class="row wrap" style="gap:6px">
              ${DATE_PRESETS.map((p) => html`<button key=${p.key} class=${cx("chip", filters.datePreset === p.key && "active")} style="height:28px;font-size:11.5px"
                onClick=${() => onPatch({ datePreset: filters.datePreset === p.key ? "" : p.key, dateFrom: "", dateTo: "", dateField: filters.dateField || dateFields[0].key })}>${p.label}</button>`)}
            </div>
          </div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
            <${Field} label="From"><${Input} type="date" value=${filters.dateFrom} onInput=${(e) => onPatch({ dateFrom: e.target.value, datePreset: "", dateField: filters.dateField || dateFields[0].key })} /></${Field}>
            <${Field} label="To"><${Input} type="date" value=${filters.dateTo} onInput=${(e) => onPatch({ dateTo: e.target.value, datePreset: "", dateField: filters.dateField || dateFields[0].key })} /></${Field}>
          </div>
        </div>
      </${Pop}>`}

      <${Pop} label=${filters.sortBy ? "Sort: " + (SORT_OPTIONS.find((s) => s.key === filters.sortBy) || {}).label : "Sort"} icon="list" width=${230} count=${filters.sortBy ? 1 : 0}>
        <div class="col" style="gap:8px">
          <div class="fpop__list">
            ${SORT_OPTIONS.map((s) => html`<button key=${s.key} class=${cx("fopt", filters.sortBy === s.key && "active")} onClick=${() => onPatch({ sortBy: filters.sortBy === s.key ? "" : s.key })}>
              <span class="fopt__box">${filters.sortBy === s.key && html`<${Icon} name="check" size=11 />`}</span><span class="fopt__label">${s.label}</span>
            </button>`)}
          </div>
          <div class="row" style="gap:6px">
            <button class=${cx("chip", filters.sortDir === "asc" && "active")} style="flex:1;justify-content:center;height:30px" onClick=${() => onPatch({ sortDir: "asc" })}><${Icon} name="arrowUp" size=13 />Asc</button>
            <button class=${cx("chip", filters.sortDir === "desc" && "active")} style="flex:1;justify-content:center;height:30px" onClick=${() => onPatch({ sortDir: "desc" })}><${Icon} name="arrowDown" size=13 />Desc</button>
          </div>
        </div>
      </${Pop}>

      <${Pop} label="Saved views" icon="star" width=${260} count=${0}>
        <div class="col" style="gap:8px">
          <div class="fpop__list">
            ${views.length === 0 && html`<div class="tiny muted" style="padding:8px 4px">No saved views for this module yet.</div>`}
            ${views.map((v) => html`<div key=${v.id} class="fopt" style="cursor:default">
              <button class="fopt__label" style="text-align:left;background:none;border:0;color:inherit;font:inherit;cursor:pointer" onClick=${() => onPatch({ ...EMPTY_FILTERS, ...v.filters })}>${v.name}</button>
              <button class="iconbtn" style="width:22px;height:22px" title="Delete view" onClick=${() => removeItem("savedViews", v.id)}><${Icon} name="trash" size=13 /></button>
            </div>`)}
          </div>
          ${naming
            ? html`<div class="row" style="gap:6px">
                <input class="input" style="height:32px;font-size:12.5px" placeholder="View name…" value=${viewName} autoFocus=${true}
                  onInput=${(e) => setViewName(e.target.value)}
                  onKeyDown=${(e) => { if (e.key === "Enter" && viewName.trim()) { saveView(module, viewName.trim(), filters); setViewName(""); setNaming(false); } }} />
                <${Btn} variant="primary" size="sm" icon="check" onClick=${() => { if (viewName.trim()) { saveView(module, viewName.trim(), filters); setViewName(""); setNaming(false); } }} />
              </div>`
            : html`<${Btn} variant="soft" size="sm" icon="save" onClick=${() => setNaming(true)}>Save current filters</${Btn}>`}
        </div>
      </${Pop}>

      <div class="spacer"></div>
      ${right}
    </div>

    ${chips.length > 0 && html`<div class="fbar__chips">
      ${chips.map((c, i) => html`<span key=${i} class="fchip">${c.label}<button class="fchip__x" onClick=${c.clear} aria-label="Remove filter"><${Icon} name="x" size=11 /></button></span>`)}
      <button class="fbar__clear" onClick=${onClear}>Clear all</button>
    </div>`}
  </div>`;
}

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
