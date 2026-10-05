// SPRINT 5 — executive-grade chart primitives.
//
// Built to the data-viz method rather than to taste:
//   • form first — a single current value is a STAT TILE, not a one-bar chart
//   • nominal categories take ONE hue (bar length already encodes the value;
//     colouring bars by their own value burns the identity channel)
//   • part-to-whole is capped and folded, never cycled past the palette
//   • every value is reachable without hover (direct labels + legend values),
//     hover only enhances
//   • thin marks, 4px rounded data-ends on the baseline, hairline recessive grid,
//     a 2px surface gap between adjacent fills
//   • text wears text tokens, never the series colour
//
// The palette lives in assets/styles.css as --viz-1..5 (+ --viz-other) and is
// validated in both themes — see the note at the top of charts.js.
import { html, cx, fmt, useState } from "./core.js";
import { Icon } from "./icons.js";
import { seriesColor, VIZ_OTHER } from "./charts.js";

/* ============================================================
   Sparkline — a single series, so no legend. Slot 1, 2px line,
   endpoint marked with a 2px surface ring.
   ============================================================ */
export function Spark({ data = [], width = 108, height = 34, tone }) {
  if (data.length < 2) return null;
  const color = tone || seriesColor(0);
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / range) * (height - 8)]);
  const d = "M " + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");
  const last = pts[pts.length - 1];
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} style="display:block;overflow:visible" aria-hidden="true">
    <path d=${d} fill="none" stroke=${color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
    <circle cx=${last[0]} cy=${last[1]} r="3" fill=${color} stroke="var(--surface)" stroke-width="2" />
  </svg>`;
}

/* ============================================================
   HeroTile — the CEO number. Value, a plain-English "so what",
   an optional delta chip and an optional sparkline.
   No naked numbers: `soWhat` is required by convention.
   ============================================================ */
export function HeroTile({ label, value, unit, soWhat, delta, deltaDir, spark, icon, onClick, wide }) {
  const dirClass = deltaDir === "up" ? "trend--up" : deltaDir === "down" ? "trend--down" : "trend--flat";
  return html`<div class=${cx("hero", wide && "hero--wide", onClick && "hero--link")}
    onClick=${onClick} role=${onClick ? "button" : null} tabIndex=${onClick ? 0 : null}
    onKeyDown=${onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : null}>
    <div class="hero__top">
      ${icon && html`<span class="hero__ico"><${Icon} name=${icon} size=15 /></span>`}
      <span class="hero__label">${label}</span>
      ${onClick && html`<${Icon} name="chevronRight" size=14 style=${{ color: "var(--text-3)", flex: "none", marginLeft: "auto" }} />`}
    </div>
    <div class="hero__figure">
      <span class="hero__value">${value}</span>
      ${unit && html`<span class="hero__unit">${unit}</span>`}
    </div>
    <div class="hero__foot">
      <span class="hero__sowhat">${soWhat}</span>
      <div class="spacer"></div>
      ${delta != null && html`<span class=${cx("trend", dirClass)} style="flex:none">
        <${Icon} name=${deltaDir === "up" ? "trendingUp" : deltaDir === "down" ? "trendingDown" : "minus"} size=12 />${delta}
      </span>`}
    </div>
    ${spark && spark.length > 1 && html`<div class="hero__spark"><${Spark} data=${spark} width=${wide ? 220 : 132} /></div>`}
  </div>`;
}

/* ============================================================
   RankBars — magnitude across NOMINAL categories.
   One hue for every bar. Values are direct-labelled so nothing
   depends on hover, and the whole set reads without a legend.
   ============================================================ */
export function RankBars({ data = [], format = (v) => v, note, emphasiseTop, onRow }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [hover, setHover] = useState(-1);
  if (!data.length) return html`<div class="tiny muted" style="padding:10px 2px">Nothing to chart yet.</div>`;
  return html`<div class="col" style="gap:11px">
    ${data.map((d, i) => {
      // Emphasis: the leader keeps slot 1, the rest recede. Used only when the
      // story is "this one is the biggest", never as a value ramp.
      const color = emphasiseTop ? (i === 0 ? seriesColor(0) : VIZ_OTHER) : (d.color || seriesColor(0));
      return html`<div key=${d.label} class=${cx("rankbar", onRow && "rankbar--link")}
        onMouseEnter=${() => setHover(i)} onMouseLeave=${() => setHover(-1)}
        onClick=${onRow ? () => onRow(d) : null}
        title=${`${d.label}: ${format(d.value)}`}>
        <div class="rankbar__head">
          <span class="rankbar__label">${d.label}</span>
          <span class="spacer"></span>
          <span class="rankbar__value">${format(d.value)}</span>
        </div>
        <div class="rankbar__track">
          <div class="rankbar__fill" style=${`width:${Math.max(1.5, (d.value / max) * 100)}%;background:${color};opacity:${hover === -1 || hover === i ? 1 : 0.55}`}></div>
        </div>
      </div>`;
    })}
    ${note && html`<div class="tiny muted">${note}</div>`}
  </div>`;
}

/* ============================================================
   ShareDonut — part-to-whole, at a glance only.
   Capped by the caller (use charts.js#foldSeries) so it never needs a
   generated hue. The legend carries the exact value AND the share, so close
   slices are compared as numbers rather than by angle.
   ============================================================ */
export function ShareDonut({ data, size = 170, thickness = 20, centerValue, centerLabel, format = (v) => v, onSlice }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const [hover, setHover] = useState(-1);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  // A 2px surface gap between adjacent fills, expressed in arc length.
  const gap = data.length > 1 ? 2 : 0;
  let offset = 0;

  if (!data.length) return html`<div class="tiny muted" style="padding:10px 2px">Nothing to chart yet.</div>`;

  return html`<div class="row" style="gap:18px;align-items:center;flex-wrap:wrap">
    <div style=${`position:relative;width:${size}px;height:${size}px;flex:none`}>
      <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${centerLabel || "share"}>
        <circle cx=${c} cy=${c} r=${r} fill="none" stroke="var(--surface-3)" stroke-width=${thickness} />
        ${data.map((d, i) => {
          const dash = Math.max(0, (d.value / total) * circ - gap);
          const el = html`<circle key=${d.label} cx=${c} cy=${c} r=${r} fill="none"
            stroke=${d.color || seriesColor(i)} stroke-width=${thickness}
            stroke-dasharray=${`${dash} ${circ - dash}`} stroke-dashoffset=${-offset}
            transform=${`rotate(-90 ${c} ${c})`} stroke-linecap="butt"
            opacity=${hover === -1 || hover === i ? 1 : 0.5}
            style="transition:opacity .14s" />`;
          offset += (d.value / total) * circ;
          return el;
        })}
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none">
        <div class="donut__value">${centerValue}</div>
        <div class="tiny muted">${centerLabel}</div>
      </div>
    </div>
    <div class="col" style="gap:8px;flex:1;min-width:170px">
      ${data.map((d, i) => html`<div key=${d.label} class="row"
        onMouseEnter=${() => setHover(i)} onMouseLeave=${() => setHover(-1)}
        title=${`${d.label}: ${format(d.value)} (${Math.round((d.value / total) * 100)}%)`}
        onClick=${onSlice ? () => onSlice(d, i) : null}
        role=${onSlice ? "button" : null}
        style=${`gap:9px;cursor:${onSlice ? "pointer" : "default"};opacity:${hover === -1 || hover === i ? 1 : 0.55};transition:opacity .14s`}>
        <span class="tag-dot" style=${`background:${d.color || seriesColor(i)}`}></span>
        <span class="viz__legend">${d.label}</span>
        <span class="spacer"></span>
        ${/* The figures are on hover and behind "Show the numbers" — printing them
             here as well just crowds the chart. */ null}
        ${hover === i && html`<span class="viz__legendval">${format(d.value)}</span>`}
      </div>`)}
    </div>
  </div>`;
}

/* ============================================================
   Meter — a single ratio against a limit. Same-ramp track, not a 2-slice pie.
   ============================================================ */
export function Meter({ value, max = 100, label, soWhat, tone }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === "warning" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : tone === "good" ? "var(--success)" : seriesColor(0);
  return html`<div class="col" style="gap:7px">
    <div class="row">
      <span class="tiny muted">${label}</span>
      <div class="spacer"></div>
      <span class="strong" style="font-size:13px">${Math.round(pct)}%</span>
    </div>
    <div class="rankbar__track"><div class="rankbar__fill" style=${`width:${Math.max(1.5, pct)}%;background:${color}`}></div></div>
    ${soWhat && html`<span class="tiny muted">${soWhat}</span>`}
  </div>`;
}

/* ============================================================
   TableTwin — the WCAG-clean equivalent of any chart above.
   Every exec chart ships one so no value is colour-only or hover-only.
   ============================================================ */
export function TableTwin({ rows = [], cols = ["Category", "Value"], format = (v) => v, open: initial = false }) {
  const [open, setOpen] = useState(initial);
  if (!rows.length) return null;
  return html`<div class="col" style="gap:8px">
    <button class="viz__twin" onClick=${() => setOpen((o) => !o)} aria-expanded=${open}>
      <${Icon} name=${open ? "chevronDown" : "chevronRight"} size=13 />
      ${open ? "Hide the numbers" : "Show the numbers"}
    </button>
    ${open && html`<table class="viz__table">
      <thead><tr>${cols.map((c, i) => html`<th key=${c} style=${i ? "text-align:right" : ""}>${c}</th>`)}</tr></thead>
      <tbody>
        ${rows.map((r) => html`<tr key=${r.label}>
          <td>${r.label}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${format(r.value)}</td>
        </tr>`)}
      </tbody>
    </table>`}
  </div>`;
}
