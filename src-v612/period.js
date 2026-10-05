/* ONE ANALYTICS PERIOD, SHARED BY EVERY CHART (§9).
 *
 * Before this each analytics surface carried its own idea of "recently" —
 * some last-90-days, some year-to-date, some the whole book — so two numbers on
 * the same screen could be counting different windows and nothing said so.
 *
 * The period lives in the URL (`?period=` / `?from=` / `?to=`), which is what
 * makes a filtered dashboard a link somebody can send, a refresh that keeps
 * what you were looking at, and a Back button that steps through the windows
 * you tried.
 */
import { html, cx, fmt, useState } from "./core.js";
import { Icon } from "./icons.js";
import { useQuery } from "./router.js";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export const PERIODS = [
  { id: "week",    label: "Week",      days: 7 },
  { id: "month",   label: "Month",     days: 30 },
  { id: "quarter", label: "Quarter",   days: 91 },
  { id: "half",    label: "Half-year", days: 182 },
  { id: "year",    label: "Annual",    days: 365 },
  { id: "all",     label: "All time",  days: null },
  { id: "custom",  label: "Custom range", days: null },
];

/* Resolve the current period to a concrete window. `all` and an unset custom
   range both mean "no bound", which is reported as from=null so a caller can
   tell "everything" from "a window that happens to be wide". */
export function usePeriod() {
  const [q, patch] = useQuery();
  const id = PERIODS.some((p) => p.id === q.period) ? q.period : "year";
  const def = PERIODS.find((p) => p.id === id);
  let from = null, to = null;
  if (id === "custom") {
    from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || "") ? q.from : null;
    to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || "") ? q.to : null;
  } else if (def.days) {
    const d = startOfDay(); d.setDate(d.getDate() - def.days);
    from = iso(d);
    to = iso(startOfDay());
  }
  const label = id === "custom"
    ? (from || to ? `${from ? fmt.date(from) : "the beginning"} to ${to ? fmt.date(to) : "today"}` : "Custom range — pick dates")
    : def.label;

  return {
    id, from, to, label,
    set: (next) => patch({ period: next === "year" ? null : next, ...(next === "custom" ? {} : { from: null, to: null }) }),
    setRange: (f, t) => patch({ period: "custom", from: f || null, to: t || null }),
    /* Does a dated record fall inside the window? A record with NO date is
       included: excluding it would silently shrink every total, and "we hold
       412 contracts, 38 of which are undated" is the honest reading. */
    covers: (date) => {
      if (!from && !to) return true;
      const d = date ? String(date).slice(0, 10) : "";
      if (!d) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    },
    /* The strict version, for a chart that is genuinely counting events in a
       window (requests raised this quarter) rather than describing a stock. */
    coversStrict: (date) => {
      if (!from && !to) return !!date;
      const d = date ? String(date).slice(0, 10) : "";
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    },
  };
}

export function PeriodSelector({ period, compact }) {
  const [openCustom, setOpenCustom] = useState(period.id === "custom");
  return html`<div class="row wrap" style="gap:8px;align-items:center">
    <div class="calnav" role="group" aria-label="Analytics period">
      ${PERIODS.filter((p) => p.id !== "custom").map((p) => html`<button key=${p.id} type="button"
        class=${cx("calnav__b calnav__b--wide", period.id === p.id && "calnav__b--on")}
        aria-pressed=${period.id === p.id ? "true" : "false"}
        onClick=${() => { period.set(p.id); setOpenCustom(false); }}>${p.label}</button>`)}
      <button type="button" class=${cx("calnav__b calnav__b--wide", period.id === "custom" && "calnav__b--on")}
        aria-pressed=${period.id === "custom" ? "true" : "false"}
        onClick=${() => { setOpenCustom(true); period.set("custom"); }}>
        <${Icon} name="calendar" size=13 /> Custom</button>
    </div>
    ${openCustom && html`<div class="row" style="gap:6px;align-items:center">
      <label class="sr-only" for="period-from">From</label>
      <input id="period-from" class="input" type="date" style="height:var(--field-h);width:150px"
        value=${period.from || ""} onChange=${(e) => period.setRange(e.target.value, period.to)} />
      <span class="tiny muted">to</span>
      <label class="sr-only" for="period-to">To</label>
      <input id="period-to" class="input" type="date" style="height:var(--field-h);width:150px"
        value=${period.to || ""} onChange=${(e) => period.setRange(period.from, e.target.value)} />
    </div>`}
    ${!compact && html`<span class="tiny muted">${period.id === "all"
      ? "Everything on the books"
      : "Dated figures cover " + period.label.toLowerCase() + (period.from ? " — since " + fmt.date(period.from) : "") + ". Stock figures (what is open now) are as at today."}</span>`}
  </div>`;
}
