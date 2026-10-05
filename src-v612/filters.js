// Register filtering — one engine and one set of controls for every register.
//
// WHY THIS IS SHARED
// Before this, each register grew its own filter UX: litigation filtered from
// chart clicks into four useState hooks, contracts had a different chip row,
// compliance had none. Same product, three interaction models, and no register
// could be linked to in a filtered state. This module is the single definition
// of what a filter IS, so a new register is a config object rather than a new
// interaction model.
//
// THE RULES (kept deliberately boring and consistent):
//   • Different filters AND together.      Risk AND Status AND Entity
//   • Values inside one filter OR together. Risk = High OR Critical
//   • Search ANDs with all of them, and never resets them.
//
// WHERE OPTIONS COME FROM
// Always from the rows handed in — never a hardcoded vocabulary. Two reasons.
// A list that includes stages the register has never contained is a lie about
// the data. And because the rows a user receives are already narrowed by the
// server's permission scope, deriving options from them means a restricted user
// cannot learn which entities, counsel or case types exist in records they are
// not allowed to read. The filter list leaks nothing the table does not.
import { html, cx, useState, useEffect, useMemo, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { useQuery } from "./router.js";

/* ------------------------------------------------------------------ values -- */

// Multi-values ride in the URL joined by "|" — legal register values (stages,
// entities, counsel, case types) contain commas and spaces far more often than
// pipes, so this survives round-tripping where a comma would not.
const SEP = "|";
export const packVals = (arr) => (arr && arr.length ? arr.join(SEP) : "");
export const unpackVals = (s) => (s ? String(s).split(SEP).filter(Boolean) : []);

// What a record "is" for a field, as a display string. Null/blank/placeholder
// all collapse to one honest bucket rather than several look-alike empties.
export const BLANK = "—";

/* Some facts are genuinely many-valued for one record: the module groups a user
   can reach, the entities a contract is signed under. Such a field returns an
   array, and the record matches if ANY of its values is selected — which is the
   same OR-within-a-filter rule everything else follows. */
export function valuesOf(row, field) {
  if (!field.multiValue) return [valueOf(row, field)];
  const raw = typeof field.get === "function" ? field.get(row) : row[field.key];
  const arr = (Array.isArray(raw) ? raw : [raw])
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter((v) => v && v !== "—" && v !== "-");
  return arr.length ? [...new Set(arr)] : [BLANK];
}

export function valueOf(row, field) {
  const raw = typeof field.get === "function" ? field.get(row) : row[field.key];
  if (raw == null) return BLANK;
  const s = String(raw).trim();
  return !s || s === "—" || s === "-" ? BLANK : s;
}

/* ------------------------------------------------------------- date helpers -- */

const DAY = 86400000;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export function parseDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
}

/* Is this record still operationally live?
   This exists because "date < today" is NOT the same as "overdue". A case
   closed in 2023 with a final hearing date in 2023 was showing "527d overdue"
   in the register, which is not a fact about the case — the hearing happened
   and the matter ended. A date only becomes a missed obligation when the record
   still requires action. Anything the source records as closed, resolved,
   completed, withdrawn, decided, dismissed or settled is finished. */
const CLOSED_RE = /\b(closed|complete|completed|resolved|resolve|withdrawn|disposed|decided|dismissed|settled|concluded|finalised|finalized|expired|terminated|cancelled|canceled)\b/i;
export function isClosedRecord(row) {
  if (!row) return false;
  const bits = [row.status, row.rawStatus, row.stage, row.state, row.disposition];
  return bits.some((b) => b && CLOSED_RE.test(String(b)));
}

/* The three states a dated obligation can be in, used by both the filter and
   the cell renderer so the register and its filters can never disagree. */
export function dueState(row, dateField) {
  const d = parseDate(typeof dateField === "function" ? dateField(row) : row[dateField]);
  if (!d) return { kind: "none", date: null, days: null };
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  if (days >= 0) return { kind: "upcoming", date: d, days };
  // In the past. Only a record that still needs action can be overdue.
  return { kind: isClosedRecord(row) ? "past" : "overdue", date: d, days };
}

export const DATE_PRESETS = [
  { value: "today",    label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  /* "This week" is the horizon a lawyer plans against, and "next 7 days" is
     not the same thing on a Thursday. It runs to the end of the working week
     (Friday), which is what the courts and the business both mean by it. */
  { value: "thisweek", label: "This week" },
  { value: "d7",       label: "Next 7 days" },
  { value: "d30",      label: "Next 30 days" },
  { value: "d90",      label: "Next 90 days" },
  { value: "overdue",  label: "Overdue" },
  { value: "none",     label: "No date" },
];
export const PAST_PRESETS = [
  { value: "p7",   label: "Last 7 days" },
  { value: "p30",  label: "This month" },
  { value: "p90",  label: "This quarter" },
  { value: "p365", label: "This year" },
  { value: "none", label: "No date" },
];

function matchDatePreset(row, field, preset) {
  const st = dueState(row, field.get || field.key);
  if (preset === "none") return st.kind === "none";
  if (st.kind === "none") return false;
  if (preset === "overdue") return st.kind === "overdue";
  const d = st.days;
  switch (preset) {
    case "today":    return d === 0;
    case "tomorrow": return d === 1;
    case "thisweek": {
      if (d < 0) return false;
      const dow = new Date().getDay();                 // 0 Sun … 6 Sat
      const toFriday = dow === 0 ? 5 : Math.max(0, 5 - dow);
      return d <= toFriday;
    }
    case "d7":       return d >= 0 && d <= 7;
    case "d30":      return d >= 0 && d <= 30;
    case "d90":      return d >= 0 && d <= 90;
    case "p7":       return d <= 0 && d >= -7;
    case "p30":      return d <= 0 && d >= -30;
    case "p90":      return d <= 0 && d >= -90;
    case "p365":     return d <= 0 && d >= -365;
    default:         return true;
  }
}

/* ------------------------------------------------------------ numeric ranges -- */

// Money buckets in PKR, the currency every register in this system is kept in.
// "No exposure" means the source recorded a zero — a record with NO figure is a
// separate, honest bucket, because treating "unknown" as "nil" would understate
// the book.
export const MONEY_BUCKETS = [
  { value: "none", label: "Not quantified", test: (n) => n == null },
  { value: "zero", label: "No exposure (0)", test: (n) => n === 0 },
  { value: "lt1m", label: "< PKR 1M",        test: (n) => n > 0 && n < 1e6 },
  { value: "1to10m",   label: "PKR 1M – 10M",   test: (n) => n >= 1e6 && n < 1e7 },
  { value: "10to100m", label: "PKR 10M – 100M", test: (n) => n >= 1e7 && n < 1e8 },
  { value: "gt100m",   label: "PKR 100M+",      test: (n) => n >= 1e8 },
];
export const COUNT_BUCKETS = [
  { value: "has",  label: "Has documents", test: (n) => n > 0 },
  { value: "none", label: "No documents",  test: (n) => !n },
  { value: "c1",   label: "1+",  test: (n) => n >= 1 },
  { value: "c5",   label: "5+",  test: (n) => n >= 5 },
  { value: "c10",  label: "10+", test: (n) => n >= 10 },
  { value: "c25",  label: "25+", test: (n) => n >= 25 },
];

function numOf(row, field) {
  const raw = typeof field.get === "function" ? field.get(row) : row[field.key];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

/* ----------------------------------------------------------------- comparators */

// Sorting that respects what a column MEANS. "PKR 100M" and "PKR 9M" sort
// correctly as numbers; hearing dates sort as dates; everything else sorts as
// text. A blank always sorts last regardless of direction, because an empty
// cell is not "the smallest value", it is the absence of one.
function comparator(field, dir) {
  const sign = dir === "desc" ? -1 : 1;
  const kind = field.sortAs || (field.type === "money" || field.type === "count" ? "number"
    : field.type === "date" || field.type === "datePast" ? "date" : "text");
  return (a, b) => {
    let av, bv;
    if (kind === "number") { av = numOf(a, field); bv = numOf(b, field); }
    else if (kind === "date") {
      av = parseDate(typeof field.get === "function" ? field.get(a) : a[field.key]);
      bv = parseDate(typeof field.get === "function" ? field.get(b) : b[field.key]);
      av = av && av.getTime(); bv = bv && bv.getTime();
    } else {
      av = valueOf(a, field); bv = valueOf(b, field);
      if (av === BLANK) av = null;
      if (bv === BLANK) bv = null;
    }
    const aEmpty = av == null, bEmpty = bv == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;          // blanks last, both directions
    if (bEmpty) return -1;
    if (kind === "text") return sign * String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return sign * (av - bv);
  };
}

/* ====================================================================== ENGINE */

/* fields: [{ key, label, type, get?, advanced?, presets?, buckets? }]
     type: "multi" | "date" | "datePast" | "money" | "count"
   searchKeys: [key | fn]
   ns: URL namespace so two registers on one page never collide ("c" / "n"). */
export function useRegisterFilters({ rows, fields, searchKeys = [], ns = "", defaultSort = null }) {
  const [query, patch] = useQuery();
  const p = (k) => (ns ? ns + "_" + k : k);

  const q = query[p("q")] || "";
  const sortKey = query[p("sort")] || (defaultSort && defaultSort.key) || "";
  const sortDir = query[p("dir")] || (defaultSort && defaultSort.dir) || "asc";

  // Active selections, read straight off the URL.
  const active = useMemo(() => {
    const out = {};
    for (const f of fields) {
      const v = query[p(f.key)];
      if (v) out[f.key] = unpackVals(v);
    }
    return out;
  }, [query, fields]);

  const activeCount = Object.keys(active).length;
  const advancedActive = fields.filter((f) => f.advanced && active[f.key]).length;

  // Option lists with live counts, derived from the authorized rows only.
  const options = useMemo(() => {
    const out = {};
    for (const f of fields) {
      if (f.type === "money")  { out[f.key] = (f.buckets || MONEY_BUCKETS).map((b) => ({ value: b.value, label: b.label, count: rows.filter((r) => b.test(numOf(r, f))).length })); continue; }
      if (f.type === "count")  { out[f.key] = (f.buckets || COUNT_BUCKETS).map((b) => ({ value: b.value, label: b.label, count: rows.filter((r) => b.test(numOf(r, f) || 0)).length })); continue; }
      if (f.type === "bucket") {
        out[f.key] = (f.options || []).map((o) => ({ value: o.value, label: o.label, count: rows.filter((r) => f.custom(r, o.value)).length }));
        continue;
      }
      if (f.type === "date" || f.type === "datePast") {
        const presets = f.presets || (f.type === "date" ? DATE_PRESETS : PAST_PRESETS);
        out[f.key] = presets.map((pr) => ({ value: pr.value, label: pr.label, count: rows.filter((r) => matchDatePreset(r, f, pr.value)).length }));
        continue;
      }
      const counts = new Map();
      for (const r of rows) for (const v of valuesOf(r, f)) counts.set(v, (counts.get(v) || 0) + 1);
      out[f.key] = [...counts.entries()]
        .sort((a, b) => (a[0] === BLANK) - (b[0] === BLANK) || b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .map(([value, count]) => ({ value, label: value === BLANK ? "Not recorded" : value, count }));
    }
    return out;
  }, [rows, fields]);

  const matchesField = (row, f, vals) => {
    // A "bucket" field owns its own rule — licence expiry, for instance, is a
    // calendar fact and must not borrow the record-is-still-live logic that
    // hearing dates use.
    if (f.type === "bucket") return vals.some((v) => f.custom(row, v));
    if (f.type === "money" || f.type === "count") {
      const buckets = f.buckets || (f.type === "money" ? MONEY_BUCKETS : COUNT_BUCKETS);
      const n = f.type === "count" ? (numOf(row, f) || 0) : numOf(row, f);
      return vals.some((v) => { const b = buckets.find((x) => x.value === v); return b ? b.test(n) : true; });
    }
    if (f.type === "date" || f.type === "datePast") return vals.some((v) => matchDatePreset(row, f, v));
    const rv = valuesOf(row, f);
    return vals.some((v) => rv.includes(v));
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = rows;
    // Filters first (cheap equality) then search (string building) — on 1,341
    // contracts that is a measurable difference per keystroke.
    for (const f of fields) {
      const vals = active[f.key];
      if (!vals || !vals.length) continue;
      out = out.filter((r) => matchesField(r, f, vals));
    }
    if (ql) {
      out = out.filter((r) => searchKeys.map((k) => (typeof k === "function" ? k(r) : r[k]) || "").join(" ").toLowerCase().includes(ql));
    }
    if (sortKey) {
      const f = fields.find((x) => x.key === sortKey) || { key: sortKey };
      out = out.slice().sort(comparator(f, sortDir));
    }
    return out;
  }, [rows, fields, active, q, sortKey, sortDir, searchKeys]);

  const api = {
    q,
    setQ: (v) => patch({ [p("q")]: v }, { replace: true }),   // typing must not spam history
    active, activeCount, advancedActive, options, filtered,
    total: rows.length,
    sort: sortKey ? { key: sortKey, dir: sortDir } : null,
    setSort: (key) => patch({ [p("sort")]: key, [p("dir")]: sortKey === key && sortDir === "asc" ? "desc" : "asc" }),
    set: (key, vals) => patch({ [p(key)]: packVals(vals) }),
    toggle: (key, val) => {
      const cur = active[key] || [];
      patch({ [p(key)]: packVals(cur.includes(val) ? cur.filter((v) => v !== val) : cur.concat(val)) });
    },
    clear: (key) => patch({ [p(key)]: "" }),
    clearAll: () => {
      const wipe = { [p("q")]: "" };
      for (const f of fields) wipe[p(f.key)] = "";
      patch(wipe);
    },
    /* Restore a SAVED view: filters, search and sort in one URL change, so Back
       undoes the whole restoration rather than three-quarters of it. Criteria
       only — the register endpoint still decides which rows this user may see,
       so a view saved under wider permissions simply returns less. */
    applySaved: (saved) => {
      const next = { [p("q")]: (saved && saved.q) || "" };
      for (const f2 of fields) next[p(f2.key)] = "";
      for (const [k, v] of Object.entries((saved && saved.filters) || {})) {
        if (fields.some((f2) => f2.key === k)) next[p(k)] = packVals([].concat(v));
      }
      if (saved && saved.sort && saved.sort.key) {
        next[p("sort")] = saved.sort.key;
        next[p("dir")] = saved.sort.dir === "desc" ? "desc" : "asc";
      } else { next[p("sort")] = ""; next[p("dir")] = ""; }
      patch(next);
    },
    // A quick view is nothing but a named filter state — never a second dataset.
    applyView: (view) => {
      const wipe = { [p("q")]: "" };
      for (const f of fields) wipe[p(f.key)] = "";
      for (const [k, v] of Object.entries(view || {})) wipe[p(k)] = packVals([].concat(v));
      patch(wipe);
    },
    matchesView: (view) => {
      const keys = Object.keys(view || {});
      if (keys.length !== Object.keys(active).length) return false;
      return keys.every((k) => { const want = [].concat(view[k]); const got = active[k] || []; return want.length === got.length && want.every((v) => got.includes(v)); });
    },
  };
  return api;
}

/* A chart, KPI or dashboard tile that drills into a register needs to SET a
   filter without owning the register's data. Because filter state is the URL,
   that is all this needs to be: the same namespaced keys, no rows required. */
export function useFilterLink(ns = "") {
  const [query, patch] = useQuery();
  const p = (k) => (ns ? ns + "_" + k : k);
  const active = (key) => unpackVals(query[p(key)]);
  return {
    active,
    has: (key, val) => active(key).includes(val),
    set: (key, vals) => patch({ [p(key)]: packVals([].concat(vals)) }),
    toggle: (key, val) => {
      const cur = active(key);
      patch({ [p(key)]: packVals(cur.includes(val) ? cur.filter((v) => v !== val) : cur.concat(val)) });
    },
    clear: (key) => patch({ [p(key)]: "" }),
    // Reset the whole register: the KPI that means "everything" must clear the
    // filters too, or the tile advertises 1,371 while the table shows 6.
    clearAll: (fields) => {
      const wipe = { [p("q")]: "" };
      for (const f of fields || []) wipe[p(f.key || f)] = "";
      patch(wipe);
    },
  };
}

/* ==================================================================== CONTROLS */

/* A filter dropdown.
   Built out of a real <button> trigger and real <input type="checkbox"> rows,
   NOT a div soup with role="option". That choice is the accessibility strategy:
   checkboxes are focusable, toggle on Space, announce their checked state and
   their label, and work with every assistive technology without a line of ARIA
   state management that could drift out of sync with what is rendered. */
export function FilterSelect({ label, options, selected = [], onToggle, onClear, width = 260, searchable }) {
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState("");
  const wrap = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); if (trigger.current) trigger.current.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    // Move focus into the panel so a keyboard user lands where the choices are.
    const t = setTimeout(() => {
      const el = panel.current && panel.current.querySelector("input,button");
      if (el) el.focus();
    }, 0);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); clearTimeout(t); };
  }, [open]);

  const n = selected.length;
  const showSearch = searchable != null ? searchable : (options || []).length > 8;
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle.toLowerCase())) : options;
  const id = "flt-" + label.replace(/\W+/g, "-").toLowerCase();

  return html`<div class="fltwrap" ref=${wrap}>
    <button type="button" ref=${trigger} id=${id + "-btn"}
      class=${cx("fltbtn", n && "fltbtn--on")}
      aria-expanded=${open ? "true" : "false"} aria-haspopup="true" aria-controls=${id + "-panel"}
      onClick=${() => setOpen(!open)}>
      <span>${label}</span>
      ${n > 0 && html`<span class="fltbtn__n">${n}</span>`}
      <${Icon} name="chevronDown" size=13 />
    </button>
    ${open && html`<div class="fltpanel" id=${id + "-panel"} role="group" aria-labelledby=${id + "-btn"} ref=${panel} style=${`width:${width}px`}>
      ${showSearch && html`<div class="fltpanel__search">
        <label class="sr-only" for=${id + "-q"}>Search ${label} options</label>
        <input id=${id + "-q"} class="input input--sm" type="search" placeholder=${"Search " + label.toLowerCase() + "…"}
          value=${needle} onInput=${(e) => setNeedle(e.target.value)} />
      </div>`}
      <div class="fltpanel__list">
        ${shown.length === 0 && html`<div class="tiny muted" style="padding:10px 12px">No matching options</div>`}
        ${shown.map((o) => html`<label key=${o.value} class="fltopt">
          <input type="checkbox" checked=${selected.includes(o.value)} onChange=${() => onToggle(o.value)} />
          <span class="fltopt__l">${o.label}</span>
          <span class="fltopt__c">${o.count != null ? o.count.toLocaleString() : ""}</span>
        </label>`)}
      </div>
      ${n > 0 && html`<div class="fltpanel__foot">
        <button type="button" class="btn btn--ghost btn--sm" onClick=${() => { onClear(); }}>Clear ${label.toLowerCase()}</button>
      </div>`}
    </div>`}
  </div>`;
}

/* The chips under the toolbar. Every active filter is visible here — an applied
   filter that only shows inside a closed dropdown is how people end up staring
   at 3 of 357 rows convinced the data is missing. */
export function ActiveChips({ fields, active, options, onClear, onClearAll, q, onClearQ }) {
  const entries = fields.filter((f) => active[f.key] && active[f.key].length);
  if (!entries.length && !q) return null;
  const labelFor = (f, v) => {
    const o = (options[f.key] || []).find((x) => x.value === v);
    return o ? o.label : v;
  };
  return html`<div class="fltchips" role="region" aria-label="Active filters">
    ${q && html`<span class="fltchip">
      <span class="fltchip__k">Search</span><span class="fltchip__v">${q}</span>
      <button type="button" class="fltchip__x" aria-label=${'Clear search "' + q + '"'} onClick=${onClearQ}>✕</button>
    </span>`}
    ${entries.map((f) => active[f.key].map((v) => html`<span key=${f.key + v} class="fltchip">
      <span class="fltchip__k">${f.label}</span><span class="fltchip__v">${labelFor(f, v)}</span>
      <button type="button" class="fltchip__x" aria-label=${"Remove filter " + f.label + ": " + labelFor(f, v)}
        onClick=${() => onClear(f.key, v)}>✕</button>
    </span>`))}
    <button type="button" class="fltchips__clear" onClick=${onClearAll}>Clear all</button>
  </div>`;
}
