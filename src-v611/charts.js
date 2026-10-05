// Hand-built SVG charts — theme-aware, dependency-free.
import { html, cx, Fragment } from "./core.js";

/* ---------------- the categorical palette ----------------
   Derived from the app's own hue families and VALIDATED (not eyeballed) against
   both real surfaces — light #ffffff and dark #16221c:

     order   green → blue → orange → violet → magenta
     worst adjacent CVD ΔE      17.3 light · 15.9 dark   (target ≥ 8)
     worst adjacent normal ΔE   19.5 light · 19.3 dark   (floor ≥ 15)
     lightness band, chroma floor, contrast ≥ 3:1        all pass, both modes

   The previous array cycled ten hues including three near-identical greens
   (#0d7a3f / #10935a / #27a96d, ΔE 6.7) which a full-colour reader cannot tell
   apart — a hard fail. Teal was dropped from the categorical set because
   teal↔blue measure only ~10.7 normal-vision ΔE and that floor cannot be excused
   by secondary encoding; teal remains the app's accent for non-series use.
   Status hues (success/warning/danger) are reserved so a series never
   impersonates a status.

   Values are CSS custom properties so light/dark swap in one place
   (see assets/styles.css) — SVG paint attributes accept var().            */
export const CHART_COLORS = [
  "var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)",
];
// The de-emphasis grey the tail category wears. Never a sixth hue.
export const VIZ_OTHER = "var(--viz-other)";

/* Series colour by slot. Past the last slot it folds to "Other" rather than
   cycling — a generated 6th hue is indistinguishable under CVD, so the honest
   answer is to name the tail. Cap your series list at CHART_COLORS.length and
   aggregate the remainder. */
export const seriesColor = (i) => (i < CHART_COLORS.length ? CHART_COLORS[i] : VIZ_OTHER);

/* Fold a sorted [label, value] list to the palette's capacity, aggregating the
   tail into one "Other" slice so no chart ever needs a generated hue. */
export function foldSeries(entries, { max = CHART_COLORS.length, otherLabel = "Other" } = {}) {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  if (sorted.length <= max) return sorted.map(([label, value], i) => ({ label, value, color: seriesColor(i) }));
  const head = sorted.slice(0, max - 1).map(([label, value], i) => ({ label, value, color: seriesColor(i) }));
  const tail = sorted.slice(max - 1).reduce((s, [, v]) => s + v, 0);
  return [...head, { label: `${otherLabel} (${sorted.length - (max - 1)})`, value: tail, color: VIZ_OTHER }];
}

/* ---------- Donut ---------- */
export function Donut({ data, size = 168, thickness = 22, centerLabel, centerValue, onItem }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return html`<div class="row" style="gap:20px;align-items:center;flex-wrap:wrap">
    <div style=${`position:relative;width:${size}px;height:${size}px;flex:none`}>
      <!-- The ring is a picture of the legend beside it. Screen readers get the
           legend, which carries the same labels, values and drill-down actions
           as real buttons — nobody has to hit a 22px SVG arc. -->
      <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle cx=${c} cy=${c} r=${r} fill="none" stroke="var(--surface-3)" stroke-width=${thickness} />
        ${data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const el = html`<circle key=${i} cx=${c} cy=${c} r=${r} fill="none"
            stroke=${d.color || seriesColor(i)} stroke-width=${thickness}
            stroke-dasharray=${`${dash} ${circ - dash}`} stroke-dashoffset=${-offset}
            transform=${`rotate(-90 ${c} ${c})`} stroke-linecap="butt"
            onClick=${onItem ? () => onItem(d) : null}
            style=${`transition:stroke-dasharray .6s cubic-bezier(.16,1,.3,1)${onItem ? ";cursor:pointer" : ""}`}>
            <title>${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)</title>
          </circle>`;
          offset += dash;
          return el;
        })}
      </svg>
      <!-- The centre label sits ON TOP of the ring (position:absolute; inset:0).
           Without pointer-events:none it swallowed every click aimed at a
           segment, so the donut looked interactive (cursor:pointer, a title
           tooltip) but drilling down did nothing. Let clicks through to the
           SVG; nothing here is clickable itself. -->
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none">
        <div style="font-size:26px;font-weight:750;letter-spacing:-.02em">${centerValue}</div>
        <div class="muted tiny">${centerLabel}</div>
      </div>
    </div>
    <div class="col" style="gap:9px;flex:1;min-width:130px" role=${onItem ? "group" : undefined}
         aria-label=${onItem ? "Chart segments — activate one to filter" : undefined}>
      ${data.map((d, i) => {
        const pct = Math.round((d.value / total) * 100);
        const body = html`<${Fragment}>
          <span class="tag-dot" style=${`background:${d.color || seriesColor(i)}`}></span>
          <span style="font-size:12.5px;font-weight:500">${d.label}</span>
          <span class="spacer"></span>
          <span class="strong" style="font-size:12.5px">${d.value}</span>
          <span class="muted tiny" style="width:38px;text-align:right">${pct}%</span>
        <//>`;
        return onItem
          ? html`<button type="button" key=${i} class="row clickable chartlegend"
              style="gap:9px;border-radius:8px;padding:2px 4px"
              aria-label=${`${d.label}: ${d.value} (${pct}%) — filter to this`}
              onClick=${() => onItem(d)}>${body}</button>`
          : html`<div class="row" key=${i} style="gap:9px;border-radius:8px;padding:2px 4px">${body}</div>`;
      })}
    </div>
  </div>`;
}

/* ---------- Vertical bar chart ---------- */
export function BarChart({ data, height = 200, format = (v) => v, color = "#0d7a3f", onItem }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const pad = 26;
  return html`<div>
    <div style=${`display:flex;align-items:flex-end;gap:10px;height:${height}px;padding-top:10px`}>
      ${data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * (height - pad));
        return html`<div key=${i} class=${"col" + (onItem ? " clickable" : "")} style=${"flex:1;align-items:center;justify-content:flex-end;height:100%;gap:6px;min-width:0" + (onItem ? ";cursor:pointer" : "")}
          onClick=${onItem ? () => onItem(d) : null} title=${onItem ? "Open " + d.label : (d.label + ": " + format(d.value))}>
          <div class="tiny strong" style="color:var(--text-2)">${format(d.value)}</div>
          <div style=${`width:100%;max-width:46px;height:${h}px;border-radius:7px 7px 3px 3px;background:${d.color || `linear-gradient(180deg, ${color}, ${color}bb)`};transition:height .5s cubic-bezier(.16,1,.3,1)`}></div>
        </div>`;
      })}
    </div>
    <div style="display:flex;gap:10px;margin-top:8px">
      ${data.map((d, i) => html`<div key=${i} class="tiny muted" style="flex:1;text-align:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.label}</div>`)}
    </div>
  </div>`;
}

/* ---------- Grouped/stacked bar (segments) ---------- */
export function StackBar({ data, height = 200, keys, colors }) {
  const max = Math.max(...data.map((d) => keys.reduce((s, k) => s + (d[k] || 0), 0)), 1);
  const pad = 20;
  return html`<div>
    <div style=${`display:flex;align-items:flex-end;gap:12px;height:${height}px`}>
      ${data.map((d, i) => {
        const total = keys.reduce((s, k) => s + (d[k] || 0), 0);
        const th = (total / max) * (height - pad);
        return html`<div key=${i} class="col" style="flex:1;align-items:center;justify-content:flex-end;gap:5px;min-width:0">
          <div class="col" title=${d.label} style=${`width:100%;max-width:42px;height:${th}px;border-radius:6px;overflow:hidden;justify-content:flex-end`}>
            ${keys.map((k, ki) => html`<div key=${k} style=${`height:${((d[k] || 0) / total) * 100}%;background:${colors[ki]}`}></div>`)}
          </div>
          <div class="tiny muted" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.label}</div>
        </div>`;
      })}
    </div>
    <div class="row wrap" style="gap:14px;margin-top:12px;justify-content:center">
      ${keys.map((k, ki) => html`<div class="row" key=${k} style="gap:6px"><span class="tag-dot" style=${`background:${colors[ki]}`}></span><span class="tiny dim">${k}</span></div>`)}
    </div>
  </div>`;
}

/* ---------- Area / line trend ---------- */
export function AreaTrend({ data, height = 200, color = "#0d7a3f", format = (v) => v, labels }) {
  const w = 640;
  const h = height;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const max = Math.max(...data, 1) * 1.12;
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = (w - pad.l - pad.r) / (data.length - 1 || 1);
  const pts = data.map((v, i) => [pad.l + i * step, pad.t + (1 - (v - min) / range) * (h - pad.t - pad.b)]);
  // smooth path
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  const area = d + ` L ${pts[pts.length - 1][0]} ${h - pad.b} L ${pts[0][0]} ${h - pad.b} Z`;
  const gid = "g" + color.replace("#", "");
  return html`<div>
    <svg viewBox=${`0 0 ${w} ${h}`} width="100%" height=${h} preserveAspectRatio="none" style="overflow:visible"
      aria-hidden="true" focusable="false">
      <defs><linearGradient id=${gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color=${color} stop-opacity="0.28" />
        <stop offset="100%" stop-color=${color} stop-opacity="0.02" />
      </linearGradient></defs>
      ${[0.25, 0.5, 0.75].map((g) => html`<line key=${g} x1=${pad.l} x2=${w - pad.r} y1=${pad.t + g * (h - pad.t - pad.b)} y2=${pad.t + g * (h - pad.t - pad.b)} stroke="var(--border)" stroke-dasharray="3 4" />`)}
      <path d=${area} fill=${`url(#${gid})`} />
      <path d=${d} fill="none" stroke=${color} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${pts.map((p, i) => html`<circle key=${i} cx=${p[0]} cy=${p[1]} r="3" fill="var(--surface)" stroke=${color} stroke-width="2" />`)}
    </svg>
    ${labels && html`<div class="row" style="justify-content:space-between;margin-top:2px">${labels.map((l, i) => html`<span key=${i} class="tiny muted">${l}</span>`)}</div>`}
  </div>`;
}

/* ---------- Sparkline ---------- */
export function Spark({ data, color = "#0d7a3f", width = 90, height = 30, area = true }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2]);
  const d = "M " + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");
  const areaD = d + ` L ${width} ${height} L 0 ${height} Z`;
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} style="display:block"
    aria-hidden="true" focusable="false">
    ${area && html`<path d=${areaD} fill=${color} opacity="0.12" />`}
    <path d=${d} fill="none" stroke=${color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

/* ---------- Horizontal ranking bars ---------- */
export function HBars({ data, format = (v) => v, color = "#0d7a3f", onItem, gap = 12 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return html`<div class="col" style=${`gap:${gap}px`}>
    ${data.map((d, i) => {
      // A clickable bar is a control, so it is a button with a name that says
      // what activating it does — not a div you have to aim at.
      const body = html`<${Fragment}>
        <div class="row" style="margin-bottom:5px">
          <span style="font-size:12.5px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.label}</span>
          <span class="spacer"></span>
          <span class="strong tiny" style="flex:none">${format(d.value)}</span>
        </div>
        <div class="progress" style="height:8px"><div class="progress__fill" style=${`width:${(d.value / max) * 100}%;background:${d.color || color}`}></div></div>
      <//>`;
      return onItem
        ? html`<button type="button" key=${i} class="clickable chartbar"
            style="border-radius:8px;padding:3px 5px;margin:-3px -5px"
            aria-label=${`${d.label}: ${format(d.value)} — filter to this`}
            onClick=${() => onItem(d)}>${body}</button>`
        : html`<div key=${i}>${body}</div>`;
    })}
  </div>`;
}

/* ---------- Funnel ---------- */
export function Funnel({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return html`<div class="col" style="gap:8px">
    ${data.map((d, i) => {
      const w = (d.value / max) * 100;
      const conv = i === 0 ? 100 : Math.round((d.value / data[0].value) * 100);
      return html`<div key=${i} class="row" style="gap:12px" title=${`${d.label}: ${d.value}`}>
        <div style="width:120px;font-size:12.5px;font-weight:500;text-align:right;flex:none">${d.label}</div>
        <div style="flex:1;background:var(--surface-3);border-radius:7px;overflow:hidden">
          <div style=${`width:${w}%;background:${seriesColor(i)};padding:7px 12px;border-radius:7px;color:#fff;font-size:12px;font-weight:650;white-space:nowrap`}>${d.value}</div>
        </div>
        <div class="muted tiny" style="width:42px;flex:none">${conv}%</div>
      </div>`;
    })}
  </div>`;
}

/* ---------- Gauge (semicircle) ---------- */
export function Gauge({ value, max = 100, label, tone = "#22c55e", size = 160 }) {
  const pct = Math.min(1, value / max);
  const r = size / 2 - 12;
  const c = size / 2;
  const circ = Math.PI * r;
  return html`<div class="col center" style="gap:4px">
    <svg width=${size} height=${size / 2 + 16} viewBox=${`0 0 ${size} ${size / 2 + 16}`}
      aria-hidden="true" focusable="false">
      <path d=${`M 12 ${c} A ${r} ${r} 0 0 1 ${size - 12} ${c}`} fill="none" stroke="var(--surface-3)" stroke-width="12" stroke-linecap="round" />
      <path d=${`M 12 ${c} A ${r} ${r} 0 0 1 ${size - 12} ${c}`} fill="none" stroke=${tone} stroke-width="12" stroke-linecap="round"
        stroke-dasharray=${`${pct * circ} ${circ}`} style="transition:stroke-dasharray .7s cubic-bezier(.16,1,.3,1)" />
      <text x=${c} y=${c - 6} text-anchor="middle" style="font-size:28px;font-weight:750;fill:var(--text)">${value}</text>
    </svg>
    <div class="muted tiny">${label}</div>
  </div>`;
}
