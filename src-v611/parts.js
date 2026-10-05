// Shared page building blocks.
import { html, cx, useState, useEffect, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, SearchInput, Chip } from "./ui.js";

export function PageHead({ title, sub, actions }) {
  // The title IS the page heading. It used to be a <div>, so no route exposed an
  // h1 at all and heading navigation — the first thing a screen-reader user
  // reaches for — had nothing to land on.
  return html`<div class="pagehead">
    <div class="pagehead__main">
      <h1 class="pagehead__title">${title}</h1>
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
// Rows are revealed in chunks rather than all at once.
//
// The contract book is 1,341 rows of ~10 cells, each cell holding pills,
// avatars and formatted values — roughly 20,000 DOM nodes built synchronously
// on one render. That is what makes a table feel broken rather than slow: the
// main thread is blocked while it happens, so nothing responds.
//
// Filtering and sorting still operate on the FULL row set upstream; only the
// painting is deferred. More rows appear automatically as the sentinel below
// the table scrolls into view, so it reads as an ordinary long table and needs
// no interaction.
const CHUNK = 120;

// `sort`/`onSort`: a column with `sortValue` (or a plain field key) renders a
// clickable header — first click sorts ascending, the second flips it.
/* `pinFirst` keeps the identifier column visible while the rest of a wide
   table scrolls under it. Used by the one register that is deliberately wider
   than the screen — see .tablewrap--pin. */
/* `keepHead`: when the register is empty, keep the column headings and put the
   empty state in the table body instead of replacing the whole table. A
   register that renders nothing at all does not say what it records — and the
   two registers that are created entirely inside LegalOS (Police Complaints,
   Government Authority Visits) start empty on a fresh install, so the first
   thing anyone sees of them was a sentence and no indication of what a record
   holds. Everything else here is Drive-backed and never empty, so this is
   opt-in rather than the default. */
export function DataTable({ columns, rows, onRow, empty, sort, onSort, pinFirst, keepHead }) {
  const [shown, setShown] = useState(CHUNK);
  const sentinel = useRef(null);

  // A new filter or sort means a different list — start again from the top,
  // or a narrowed search would inherit the previous scroll depth.
  useEffect(() => { setShown(CHUNK); }, [rows]);

  useEffect(() => {
    if (rows.length <= shown) return;
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setShown((n) => Math.min(n + CHUNK, rows.length));
      }
    }, { rootMargin: "400px" });   // start the next chunk before it is needed
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, shown]);

  if (!rows.length && empty && !keepHead) return empty;
  const visible = rows.length > shown ? rows.slice(0, shown) : rows;

  return html`<div class=${cx("tablewrap", pinFirst && "tablewrap--pin")}>
    <table class="table">
      <thead><tr>
        ${columns.map((c) => { const sortable = !!(onSort && (c.sortValue || c.sortKey));
          const active = sort && sort.key === c.key;
          const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
          // A sortable header is a control: wrap the label in a real button so it
          // can be tabbed to and activated, and report the sort direction rather
          // than only drawing an arrow.
          const dir = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
          return html`<th key=${c.key} class=${sortable ? "th--sort" : ""}
            aria-sort=${sortable ? dir : undefined}
            style=${cx(c.width && `width:${c.width}`) + (c.align ? `;text-align:${c.align}` : "")}>
            ${sortable
              ? html`<button type="button" class="th__sortbtn" onClick=${() => onSort(c.key)}
                  aria-label=${`Sort by ${c.label}` + (active ? ` (currently ${dir})` : "")}>${c.label}${arrow}</button>`
              : html`${c.label}${arrow}`}
          </th>`; })}
      </tr></thead>
      <tbody>
        ${!rows.length && empty && html`<tr><td colSpan=${columns.length}>${empty}</td></tr>`}
        ${visible.map((r, i) => html`<tr key=${r.id || i} class=${cx(onRow && "rowlink")}
          onClick=${onRow ? () => onRow(r) : null}
          tabIndex=${onRow ? 0 : undefined}
          role=${onRow ? "link" : undefined}
          aria-label=${onRow ? "Open record" : undefined}
          onKeyDown=${onRow ? ((e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRow(r); } }) : undefined}>
          ${columns.map((c) => html`<td key=${c.key} class=${cx(c.mono && "cell-mono")} style=${c.align ? `text-align:${c.align}` : ""}>
            ${c.render ? c.render(r, i) : r[c.key]}
          </td>`)}
        </tr>`)}
      </tbody>
    </table>
    ${rows.length > shown && html`<div ref=${sentinel} class="row center" style="padding:14px;gap:10px">
      <span class="tiny muted">Showing ${visible.length.toLocaleString()} of ${rows.length.toLocaleString()}</span>
      <button class="btn btn--ghost" onClick=${() => setShown((n) => Math.min(n + CHUNK * 4, rows.length))}>Show more</button>
      <button class="btn btn--ghost" onClick=${() => setShown(rows.length)}>Show all</button>
    </div>`}
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
// KPI strip — proper cards in the same visual language as the module-register
// KPIs (.modkpi): bordered card, left accent, tabular number, tiny label.
// stats: [{ value, label, trend?, trendDir?, tone? }] — tone is optional; when
// omitted the accent cycles so mixed strips still read as one system.
const KPI_TONES = ["blue", "green", "amber", "purple", "red", "gray"];
export function StatStrip({ stats }) {
  return html`<div class="statkpis">
    ${stats.map((s, i) => html`<div key=${i}
      class=${cx("statkpi", "statkpi--" + (s.tone || KPI_TONES[i % KPI_TONES.length]), s.onClick && "statkpi--link")}
      role=${s.onClick ? "button" : undefined} tabindex=${s.onClick ? 0 : undefined}
      aria-pressed=${s.onClick && s.active != null ? String(!!s.active) : undefined}
      title=${s.title || undefined}
      onClick=${s.onClick}
      onKeyDown=${s.onClick ? ((e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.onClick(); } }) : undefined}>
      <div class="statkpi__n">
        ${s.value}
        ${s.trend && html`<span class=${cx("trend", s.trendDir === "up" ? "trend--up" : s.trendDir === "down" ? "trend--down" : "trend--flat")}>${s.trend}</span>`}
      </div>
      <div class="statkpi__l">${s.label}</div>
    </div>`)}
  </div>`;
}
