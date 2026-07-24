// Shared cross-cutting UI added by the additive sprint:
// work-category pills/chips (Feature 6) and company tag chips + editor (Feature 7).
import { html, cx, useState } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Chip, Modal, Btn, Field, Input } from "./ui.js";
import { getCollection, addItem, nextId } from "./store.js";
import { navigate } from "./router.js";
import { WORK_CATEGORIES, CATEGORY_TONE, COMPANIES, categoryOf } from "./data.js";

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
