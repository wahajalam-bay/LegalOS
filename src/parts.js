// Shared page building blocks.
import { html, cx, useState } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, SearchInput, Chip } from "./ui.js";

export function PageHead({ title, sub, actions }) {
  return html`<div class="pagehead">
    <div class="pagehead__main">
      <div class="pagehead__title">${title}</div>
      ${sub && html`<div class="pagehead__sub">${sub}</div>`}
    </div>
    ${actions && html`<div class="pagehead__actions">${actions}</div>`}
  </div>`;
}

// Toolbar with search + filter chips
export function Toolbar({ search, onSearch, chips, active, onChip, right }) {
  return html`<div class="row wrap" style="gap:10px;margin-bottom:16px">
    ${onSearch != null && html`<div style="width:280px"><${SearchInput} value=${search} onChange=${onSearch} /></div>`}
    ${chips && chips.map((c) => html`<${Chip} key=${c.value} active=${active === c.value} onClick=${() => onChip(c.value)}>${c.label}${c.count != null ? html` · ${c.count}` : ""}</${Chip}>`)}
    <div class="spacer"></div>
    ${right}
  </div>`;
}

// Generic data table. columns: [{key,label,render(row),align,width,mono}]
export function DataTable({ columns, rows, onRow, empty }) {
  if (!rows.length && empty) return empty;
  return html`<div class="tablewrap">
    <table class="table">
      <thead><tr>
        ${columns.map((c) => html`<th key=${c.key} style=${cx(c.width && `width:${c.width}`) + (c.align ? `;text-align:${c.align}` : "")}>${c.label}</th>`)}
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => html`<tr key=${r.id || i} class=${cx(onRow && "rowlink")} onClick=${onRow ? () => onRow(r) : null}>
          ${columns.map((c) => html`<td key=${c.key} class=${cx(c.mono && "cell-mono")} style=${c.align ? `text-align:${c.align}` : ""}>
            ${c.render ? c.render(r) : r[c.key]}
          </td>`)}
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

// Simple sortable/filterable state hook
export function useFilter(rows, keys) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const filtered = rows.filter((r) => {
    if (!q) return true;
    const hay = keys.map((k) => String(r[k] || "")).join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  return { q, setQ, tab, setTab, filtered };
}

// Stat strip (small inline KPIs above a table)
export function StatStrip({ stats }) {
  return html`<div class="row wrap" style="gap:28px;margin-bottom:18px;padding:2px 2px">
    ${stats.map((s, i) => html`<div key=${i}>
      <div class="stat-inline"><b>${s.value}</b>${s.trend && html`<span class=${cx("trend", s.trendDir === "up" ? "trend--up" : s.trendDir === "down" ? "trend--down" : "trend--flat")}>${s.trend}</span>`}</div>
      <div class="muted tiny" style="margin-top:2px">${s.label}</div>
    </div>`)}
  </div>`;
}
