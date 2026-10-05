// THE CAUSE LIST — what the team is in court for, this week and next.
//
// Two weeks side by side, because the question a litigation team asks on a
// Thursday afternoon is "what is coming", and the answer spans the weekend.
// Every row opens its case; the date is the only thing that decides what
// appears here, and it comes from the case, so there is nothing to refresh.
//
// It is deliberately NOT a register: no filters, no columns to configure, no
// export. It is a list of places to be.
import { html, cx, fmt, useState, useEffect, useMemo } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Section, Empty } from "./ui.js";
import { navigate, useQuery } from "./router.js";
import { api } from "./api.js";
import { useRegister } from "./live.js";
import { CalendarGrid, CalendarJump, DayAgenda, todayIso, startOfWeek, addMonths, monthLabel, yearsOf } from "./calendar.js";

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayName = (d) => DAY[new Date(d + "T00:00:00Z").getUTCDay()];

export function useCauseList() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.litigation.causeList().then(setD, setErr); }, []);
  return { data: d, error: err };
}

/* One week's hearings, grouped by the day they fall on -- a lawyer reads this
   as "Monday I am in three places", not as a flat list of twelve rows. */
function Week({ label, week, today, empty }) {
  const rows = (week && week.hearings) || [];
  const byDay = [];
  for (const h of rows) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === h.date) last.rows.push(h);
    else byDay.push({ date: h.date, rows: [h] });
  }
  return html`<${Section} title=${label} icon="calendar"
    sub=${week ? fmt.date(week.from) + " – " + fmt.date(week.to) + (rows.length ? " · " + rows.length + " hearing" + (rows.length === 1 ? "" : "s") : "") : ""}>
    ${rows.length === 0
    ? html`<div class="tiny muted">${empty}</div>`
    : html`<div class="col" style="gap:14px">
        ${byDay.map((g) => html`<div key=${g.date}>
          <div class="row" style="gap:8px;align-items:baseline;padding-bottom:4px">
            <span class="tiny strong">${dayName(g.date)}</span>
            <span class="tiny muted">${fmt.date(g.date)}</span>
            ${g.date === today && html`<${Pill} tone="indigo">Today</${Pill}>`}
          </div>
          <div class="col" style="gap:0">
            ${g.rows.map((h) => html`<button key=${h.id} type="button" class="feed__item clickable"
              style="text-align:left;width:100%"
              onClick=${() => navigate("/litigation/" + encodeURIComponent(h.id))}>
              <div class="row" style="gap:10px;align-items:center;width:100%">
                <div style="flex:1;min-width:0">
                  <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.caseName || h.caseNo || h.id}</div>
                  <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${[h.caseNo, h.entity, h.court].filter(Boolean).join(" · ")}</div>
                </div>
                ${h.counsel && html`<span class="tiny muted" style="flex:none">${h.counsel}</span>`}
                ${h.caseType && html`<${Pill} tone="gray">${h.caseType}</${Pill}>`}
                <${Icon} name="chevronRight" size=14 />
              </div></button>`)}
          </div>
        </div>`)}
      </div>`}
  </${Section}>`;
}

/* The whole thing: two weeks, and the hearings whose date has already gone by
   without anybody recording what happened. */
export function CauseList({ compact }) {
  const { data, error } = useCauseList();
  if (error) {
    return html`<${Section} title="Cause list" icon="calendar">
      <div class="tiny" style="color:var(--danger-text)">${error.message || "The cause list could not be read."}</div>
    </${Section}>`;
  }
  if (!data) return html`<div class="tiny muted" style="padding:16px 2px">Reading the cause list…</div>`;

  const w = data.weeks || {};
  const c = data.counts || {};
  if (compact) {
    const rows = (w.thisWeek && w.thisWeek.hearings) || [];
    return html`<${Section} title="This week in court" icon="calendar"
      sub=${rows.length ? rows.length + " hearing" + (rows.length === 1 ? "" : "s") + " between " + fmt.date(w.thisWeek.from) + " and " + fmt.date(w.thisWeek.to) : "Nothing listed this week."}
      actions=${html`<button type="button" class="fltbtn" onClick=${() => navigate("/m/causelist")}>Full cause list</button>`}>
      ${rows.length === 0
    ? html`<div class="tiny muted">No case has a hearing date inside this week.</div>`
    : html`<div class="col" style="gap:0">
          ${rows.slice(0, 6).map((h) => html`<button key=${h.id} type="button" class="feed__item clickable"
            style="text-align:left;width:100%" onClick=${() => navigate("/litigation/" + encodeURIComponent(h.id))}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <span class="tiny strong" style="width:92px;flex:none">${fmt.dateShort(h.date)}</span>
              <div style="flex:1;min-width:0">
                <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.caseName || h.caseNo}</div>
                <div class="tiny muted">${[h.entity, h.counsel].filter(Boolean).join(" · ")}</div></div>
              <${Icon} name="chevronRight" size=14 />
            </div></button>`)}
          ${rows.length > 6 && html`<div class="tiny muted" style="padding:8px 2px">
            and ${rows.length - 6} more this week.</div>`}
        </div>`}
    </${Section}>`;
  }

  return html`<div class="col" style="gap:16px">
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${Week} label="This week" week=${w.thisWeek} today=${data.today}
        empty="No case has a hearing date inside this week." />
      <${Week} label="Next week" week=${w.nextWeek} today=${data.today}
        empty="Nothing is listed for next week yet." />
    </div>

    ${c.pastDue > 0 && html`<${Section} title=${"Hearing dates that have passed (" + c.pastDue + ")"} icon="alertTriangle"
      sub="The date went by and the case still carries it as its next hearing. Either it was heard and nobody recorded the outcome, or it was adjourned and nobody moved the date.">
      <div class="col" style="gap:0">
        ${(data.pastDue.hearings || []).map((h) => html`<button key=${h.id} type="button" class="feed__item clickable"
          style="text-align:left;width:100%" onClick=${() => navigate("/litigation/" + encodeURIComponent(h.id))}>
          <div class="row" style="gap:10px;align-items:center;width:100%">
            <span class="tiny strong" style="width:92px;flex:none">${fmt.dateShort(h.date)}</span>
            <div style="flex:1;min-width:0">
              <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.caseName || h.caseNo}</div>
              <div class="tiny muted">${[h.caseNo, h.entity, h.counsel].filter(Boolean).join(" · ")}</div></div>
            <${Pill} tone="amber">Outcome not recorded</${Pill}>
            <${Icon} name="chevronRight" size=14 />
          </div></button>`)}
        ${c.pastDue > (data.pastDue.hearings || []).length && html`<div class="tiny muted" style="padding:8px 2px">
          Showing ${(data.pastDue.hearings || []).length} of ${c.pastDue}. The rest are in the case register.</div>`}
      </div>
    </${Section}>`}

    ${/* Honest about what the list is built from. A thin cause list over a
          register where most cases carry no date is not an empty week. */ ""}
    <div class="tiny muted">
      Built from the next-hearing date on each case — ${c.withDate} of ${c.total} cases carry one.
      Move a hearing and this list moves with it; there is nothing here to regenerate.
      Times are ${data.timezone}.
    </div>
  </div>`;
}

/* ============================================================
   THE CAUSE LIST AS A CALENDAR (§68)
   ============================================================
   The two-week list answered "what is coming", and only that. A litigation
   team also asks "what did we have on the 14th", "how heavy is March", and
   "move me forward a month" — none of which a fixed two-week list can answer.

   LEFT is the day you have selected, written out. RIGHT is the month (or the
   week) around it. Previous / Today / Next move the period, and the period and
   the selected day both live in the URL, so a day somebody is looking at is a
   link they can send.

   It is built from the SAME next-hearing dates the two-week list uses, plus
   every dated sitting in a case's recorded schedule — one source, so the
   calendar and the list can never disagree about when the team is in court.
*/

const shiftDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/* Every hearing the register knows about, as calendar events. A case with a
   recorded schedule contributes each dated sitting; a tracker row contributes
   the one date it carries. */
export function useHearingEvents() {
  const reg = useRegister("litigation");
  const events = useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (date, c, detail, extra) => {
      const d = date ? String(date).slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const k = c.id + "|" + d;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({
        kind: "hearing", date: d, title: c.title || c.caseNo || c.id,
        detail: detail || [c.caseNo, c.court, c.counsel].filter(Boolean).join(" · "),
        path: "/litigation/" + encodeURIComponent(c.id),
        recordId: c.id, entity: c.entity, closed: c.lifecycle === "Decided",
        ...(extra || {}),
      });
    };
    for (const c of (reg.rows || [])) {
      push(c.nextHearing, c);
      for (const h of (c.caseHearings || [])) {
        push(h.date, c, [h.purpose, c.court].filter(Boolean).join(" · "),
          { meetingLink: h.meetingLink || null, outcome: h.outcome || "" });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [reg.rows]);
  return { events, loading: reg.loading, count: (reg.rows || []).length };
}

export function CauseListCalendar() {
  const [q, patchQ] = useQuery();
  const today = todayIso();
  const mode = q.cal === "week" ? "week" : "month";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(q.on || "") ? q.on : today;
  const [day, setDay] = useState(anchor);
  const { events, loading, count } = useHearingEvents();
  const { data } = useCauseList();

  const setAnchor = (v) => patchQ({ on: v === today ? null : v }, { replace: true });
  const step = (n) => {
    const next = mode === "week" ? shiftDays(startOfWeek(anchor), n * 7) : addMonths(anchor, n);
    setAnchor(next);
    setDay(next);
  };

  const weekStart = startOfWeek(today);
  const thisWeek = events.filter((e) => e.date >= weekStart && e.date <= shiftDays(weekStart, 6));
  const pastDue = (data && data.counts && data.counts.pastDue) || 0;

  const periodLabel = mode === "week"
    ? fmt.date(startOfWeek(anchor)) + " – " + fmt.date(shiftDays(startOfWeek(anchor), 6))
    : monthLabel(anchor);

  return html`<div class="col" style="gap:14px">
    <div class="row wrap" style="gap:10px;align-items:center">
      <div class="calnav" role="group" aria-label="Calendar period">
        <button type="button" class="calnav__b" aria-label="Previous period" onClick=${() => step(-1)}>
          <${Icon} name="chevronLeft" size=15 /></button>
        <button type="button" class="calnav__b calnav__b--wide"
          onClick=${() => { setAnchor(today); setDay(today); }}>Today</button>
        <button type="button" class="calnav__b" aria-label="Next period" onClick=${() => step(1)}>
          <${Icon} name="chevronRight" size=15 /></button>
      </div>
      <div class="calnav" role="group" aria-label="Calendar view">
        ${["week", "month"].map((m) => html`<button key=${m} type="button"
          class=${cx("calnav__b calnav__b--wide", mode === m && "calnav__b--on")}
          aria-pressed=${mode === m ? "true" : "false"}
          onClick=${() => patchQ({ cal: m === "month" ? null : m }, { replace: true })}>
          ${m === "week" ? "Week" : "Month"}</button>`)}
      </div>
      <div class="strong" style="font-size:15px">${periodLabel}</div>
      ${/* Reach any month, or any single day, without stepping. Picking a day
            also SELECTS it, so the list beside the grid is already on it. */ ""}
      <${CalendarJump} anchor=${anchor} years=${yearsOf(events)}
        onJump=${(iso) => { setAnchor(iso); setDay(iso); }} />
      <div class="spacer"></div>
      <${Pill} tone=${thisWeek.length ? "indigo" : "gray"}>${thisWeek.length} this week</${Pill}>
      ${pastDue > 0 && html`<${Pill} tone="amber">${pastDue} outcome${pastDue === 1 ? "" : "s"} not recorded</${Pill}>`}
    </div>

    ${loading && !events.length
      ? html`<div class="card card--pad tiny muted" style="padding:40px;text-align:center">Reading the case register…</div>`
      : html`<div class="calsplit">
          <${CalendarGrid} mode=${mode} anchor=${anchor} events=${events}
            selected=${day} onSelect=${(iso) => setDay(iso)} />
          <div class="col" style="gap:14px">
            ${/* THIS WEEK STAYS (§59). The calendar answers "when is anything
                  listed"; this answers "where do I have to be between now and
                  Sunday", which is the question the team asks every Monday and
                  the one the old two-panel cause list existed to answer. What
                  went is "Next week" — a fixed second panel that could not
                  reach the week after it, which is precisely what the calendar
                  does better. Clicking a day here selects it on the calendar. */ ""}
            <${Section} title="This week in court" icon="calendar"
              sub=${thisWeek.length
                ? thisWeek.length + " hearing" + (thisWeek.length === 1 ? "" : "s") + " between "
                  + fmt.date(weekStart) + " and " + fmt.date(shiftDays(weekStart, 6))
                : "Nothing is listed between " + fmt.date(weekStart) + " and " + fmt.date(shiftDays(weekStart, 6)) + "."}
              actions=${thisWeek.length > 0 && html`<button type="button" class="fltbtn"
                onClick=${() => { setAnchor(today); setDay(today); }}>Go to today</button>`}>
              ${thisWeek.length === 0
                ? html`<div class="tiny muted" style="padding:10px 2px">No case carries a hearing date inside this week.</div>`
                : html`<div class="col" style="gap:0">
                    ${thisWeek.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((e, i) => html`<button
                      key=${i} type="button" class="feed__item clickable" style="text-align:left;width:100%"
                      onClick=${() => { setAnchor(e.date); setDay(e.date); }}>
                      <div class="row" style="gap:10px;align-items:center;width:100%">
                        <span class="tiny strong" style="width:86px;flex:none">${fmt.dateShort(e.date)}</span>
                        <div style="flex:1;min-width:0">
                          <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</div>
                          <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.detail || ""}</div>
                        </div>
                        <${Icon} name="chevronRight" size=14 />
                      </div></button>`)}
                    ${thisWeek.length > 8 && html`<div class="tiny muted" style="padding:8px 2px">
                      and ${thisWeek.length - 8} more this week — they are on the calendar.</div>`}
                  </div>`}
            </${Section}>
            <${Section} title=${fmt.date(day)} icon="calendar"
              sub=${day === today ? "Today" : null}>
              <${DayAgenda} date=${day} events=${events} onOpen=${(p) => navigate(p)}
                emptyText=${`No hearing is listed for ${fmt.date(day)}.`} />
            </${Section}>
            ${pastDue > 0 && html`<${Section} title=${"Outcome pending (" + pastDue + ")"} icon="alertTriangle"
              sub="The date went by and the case still carries it as its next hearing. Either it was heard and nobody recorded the outcome, or it was adjourned and nobody moved the date.">
              <div class="col" style="gap:0">
                ${((data && data.pastDue && data.pastDue.hearings) || []).slice(0, 8).map((h) => html`<button key=${h.id}
                  type="button" class="feed__item clickable" style="text-align:left;width:100%"
                  onClick=${() => navigate("/litigation/" + encodeURIComponent(h.id))}>
                  <div class="row" style="gap:10px;align-items:center;width:100%">
                    <span class="tiny strong" style="width:82px;flex:none">${fmt.dateShort(h.date)}</span>
                    <div style="flex:1;min-width:0">
                      <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.caseName || h.caseNo}</div>
                      <div class="tiny muted">${[h.caseNo, h.entity].filter(Boolean).join(" · ")}</div></div>
                    <${Icon} name="chevronRight" size=14 />
                  </div></button>`)}
              </div>
            </${Section}>`}
          </div>
        </div>`}

    <div class="tiny muted">
      Built from the next-hearing date on each case plus every dated sitting in its recorded schedule —
      ${(data && data.counts && data.counts.withDate) || 0} of ${count || ((data && data.counts && data.counts.total) || 0)} cases
      carry one. Move a hearing and this moves with it; there is nothing here to regenerate.
    </div>
  </div>`;
}
