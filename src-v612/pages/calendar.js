/* THE LEGAL CALENDAR — one page for every dated obligation.
 *
 * Week and Month, Previous / Today / Next, and a day panel that writes out
 * what is actually due. The period and the selected day live in the URL, so a
 * calendar somebody links to opens on the same week they were looking at.
 */
import { html, cx, fmt, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Section, Empty } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { navigate, useQuery } from "../router.js";
import {
  useLegalCalendar, CalendarGrid, CalendarJump, CalendarLegend, DayAgenda, yearsOf,
  todayIso, startOfWeek, startOfMonth, addMonths, monthLabel, EVENT_KINDS, KIND_ORDER,
} from "../calendar.js";

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export default function CalendarPage() {
  const [q, patchQ] = useQuery();
  const today = todayIso();
  const mode = q.cal === "week" ? "week" : "month";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(q.on || "") ? q.on : today;
  const [day, setDay] = useState(anchor);
  const [kinds, setKinds] = useState(() => new Set());

  // The fetch window is the grid's window plus a fortnight of slack, so the
  // "+N more" counts and the totals always agree with what is on screen.
  const from = mode === "week" ? addDays(startOfWeek(anchor), -7) : addDays(startOfMonth(anchor), -14);
  const to = mode === "week" ? addDays(startOfWeek(anchor), 14) : addDays(addMonths(anchor, 1), 14);
  const { events, loading, sources } = useLegalCalendar(from, to);

  const setAnchor = (iso) => patchQ({ on: iso === today ? null : iso }, { replace: true });
  const step = (n) => setAnchor(mode === "week" ? addDays(startOfWeek(anchor), n * 7) : addMonths(anchor, n));
  const setMode = (m) => patchQ({ cal: m === "month" ? null : m }, { replace: true });
  const toggleKind = (k) => setKinds((s) => {
    if (k == null) return new Set();
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const shown = kinds.size ? events.filter((e) => kinds.has(e.kind)) : events;
  const weekStart = startOfWeek(today), weekEnd = addDays(weekStart, 6);
  const thisWeek = shown.filter((e) => e.date >= weekStart && e.date <= weekEnd);
  const todays = shown.filter((e) => e.date === today);
  // "Passed" is an obligation whose date has gone by and which nothing has
  // closed out — the only overdue this page claims.
  const passed = shown.filter((e) => e.date < today && !e.closed);

  const periodLabel = mode === "week"
    ? fmt.date(startOfWeek(anchor)) + " – " + fmt.date(addDays(startOfWeek(anchor), 6))
    : monthLabel(anchor);

  const none = !loading && events.length === 0;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Legal Calendar"
      sub="Hearings, renewals, repayments, reply deadlines and task dates — every dated obligation in one week."
      actions=${html`<${Fragment}>
        <div class="calnav" role="group" aria-label="Calendar period">
          <button type="button" class="calnav__b" aria-label="Previous period" onClick=${() => step(-1)}>
            <${Icon} name="chevronLeft" size=15 /></button>
          <button type="button" class="calnav__b calnav__b--wide" onClick=${() => setAnchor(today)}>Today</button>
          <button type="button" class="calnav__b" aria-label="Next period" onClick=${() => step(1)}>
            <${Icon} name="chevronRight" size=15 /></button>
        </div>
        <div class="calnav" role="group" aria-label="Calendar view">
          ${["week", "month"].map((m) => html`<button key=${m} type="button"
            class=${cx("calnav__b calnav__b--wide", mode === m && "calnav__b--on")}
            aria-pressed=${mode === m ? "true" : "false"} onClick=${() => setMode(m)}>
            ${m === "week" ? "Week" : "Month"}</button>`)}
        </div>
      </${Fragment}>`} />

    <${StatStrip} stats=${[
      { value: todays.length, label: "Due today",
        onClick: () => { setAnchor(today); setDay(today); }, title: "Jump to today" },
      { value: thisWeek.length, label: "This week",
        onClick: () => { setMode("week"); setAnchor(today); }, title: "Show this week" },
      { value: passed.length, label: "Date passed, not closed out", tone: passed.length ? "red" : "",
        title: "Obligations whose date has gone by with nothing recorded against them" },
      { value: shown.length, label: mode === "week" ? "In this fortnight" : "In this period" },
    ]} />

    <div class="row wrap" style="gap:10px;align-items:center;margin:2px 0 12px">
      <div class="strong" style="font-size:15px">${periodLabel}</div>
      ${/* Any month, any day, one click — see CalendarJump. */ ""}
      <${CalendarJump} anchor=${anchor} years=${yearsOf(events)}
        onJump=${(iso) => { setAnchor(iso); setDay(iso); }} />
      <div class="spacer"></div>
      <${CalendarLegend} events=${events} kinds=${kinds} onToggle=${toggleKind} />
    </div>

    ${loading && !events.length
      ? html`<div class="card card--pad tiny muted" style="padding:44px;text-align:center">Reading the registers…</div>`
      : none
        ? html`<${Empty} icon="calendar" title="No dated obligations in this period"
            text="Nothing in the registers you can open carries a date between ${fmt.date(from)} and ${fmt.date(to)}." />`
        : html`<div class="calsplit">
            <${CalendarGrid} mode=${mode} anchor=${anchor} events=${events} kinds=${kinds}
              selected=${day} onSelect=${(iso) => setDay(iso)} />
            <${Section} title=${fmt.date(day)} icon="calendar"
              sub=${day === today ? "Today" : null}>
              <${DayAgenda} date=${day} events=${shown} onOpen=${(p) => navigate(p)} />
            </${Section}>
          </div>`}

    ${/* WHAT THIS CALENDAR IS BUILT FROM. A thin calendar over registers the
          viewer cannot open is not a quiet month, and saying which sources are
          in play is the difference between the two. */ ""}
    <div class="tiny muted" style="margin-top:14px">
      Built from ${[
        sources.litigation && "hearings and notice replies",
        sources.compliance && "licence expiries and loan repayments",
        sources.commercial && "contract expiries",
        "your own task due dates",
      ].filter(Boolean).join(", ")}.
      Dates come from the records themselves — move a hearing and this moves with it.
      A joining link appears only where the record holds one.
    </div>
  </div>`;
}
