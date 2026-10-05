/* THE SHARED LEGAL CALENDAR.
 *
 * Every dated obligation the department carries, in one place: hearings,
 * contract expiries, licence renewals, loan repayments, notice reply
 * deadlines, compliance filing dates and task due dates. Before this they were
 * seven lists on seven pages, and the only way to see a week was to open all
 * seven and hold it in your head.
 *
 * Two rules the whole file is built on:
 *
 *   1. NOTHING IS INVENTED. Every event carries the record it came from and
 *      the field that dated it. A meeting link is shown only where the record
 *      actually holds one; there is no placeholder URL anywhere in here.
 *   2. NOTHING IS FETCHED THAT THE VIEWER MAY NOT SEE. Each source is drawn
 *      from `useRegister`, which is already permission-gated, so a Compliance
 *      account builds a calendar out of compliance dates and never asks the
 *      server for the litigation book.
 */
import { html, cx, fmt, useMemo, useState } from "./core.js";
import { Icon } from "./icons.js";
import { DateInput } from "./ui.js";
import { useRegister } from "./live.js";
import { useCollection } from "./store.js";
import { useActiveUser, canOpenPath, filterVisible } from "./rbac.js";
import { unifiedRows, rowTat } from "./flow.js";

/* ------------------------------------------------------------- event kinds */

/* Colour is semantic, not decorative (§104): red is an adverse or missed
   obligation, amber is attention due, blue is workflow, green is settled. The
   kind also decides the icon and the words used in the legend, so one event
   type can never read as two different things on two screens. */
/* THE REMINDER CLASSES (§83).
 *
 * A contract expiry and a licence renewal are not the same obligation: they are
 * chased by different people, on different cycles, against different
 * authorities. They were one "Renewals & expiries" bucket, which made the
 * legend useless as a filter — the one thing a compliance lawyer wants is
 * "show me only the licences".
 *
 * Matter aging is deliberately NOT here. How long a case has been running is a
 * property of the case, not a thing that falls due on a date, and mixing it
 * into a reminder list is how a reminder list stops being actionable. It lives
 * on the litigation analytics tab, where it belongs. */
export const EVENT_KINDS = {
  hearing:    { label: "Litigation hearings", icon: "gavel",     tone: "red",    noun: "hearing" },
  deadline:   { label: "Compliance deadlines",icon: "shield",    tone: "amber",  noun: "filing deadline" },
  renewal:    { label: "Contract expiry & renewal", icon: "file", tone: "amber", noun: "contract expiry" },
  licence:    { label: "Licence renewals",    icon: "fileCheck", tone: "amber",  noun: "licence expiry" },
  repayment:  { label: "Loan repayments",     icon: "dollar",    tone: "blue",   noun: "repayment" },
  reply:      { label: "Notice replies",      icon: "mail",      tone: "amber",  noun: "reply deadline" },
  task:       { label: "Task due dates",      icon: "checkcircle", tone: "blue", noun: "task" },
  meeting:    { label: "Meetings",            icon: "users",     tone: "blue",   noun: "meeting" },
  review:     { label: "Scheduled reviews",   icon: "scan",      tone: "blue",   noun: "review" },
};
export const KIND_ORDER = ["hearing", "deadline", "licence", "renewal", "repayment", "reply", "task", "meeting", "review"];

/* ------------------------------------------------------------ date helpers */

export const isoOf = (d) => {
  if (!d) return "";
  if (typeof d === "string") return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : (isNaN(new Date(d)) ? "" : new Date(d).toISOString().slice(0, 10));
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
};
export const todayIso = () => {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const parseIso = (s) => new Date(s + "T00:00:00");
const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
// Weeks start on MONDAY: a Pakistani court week runs Monday to Friday, and a
// Sunday-first grid puts the working week across two rows.
export const startOfWeek = (iso) => { const d = parseIso(iso); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return isoOf(d); };
export const startOfMonth = (iso) => iso.slice(0, 8) + "01";
export const addMonths = (iso, n) => { const d = parseIso(startOfMonth(iso)); d.setMonth(d.getMonth() + n); return isoOf(d); };
export const monthLabel = (iso) => parseIso(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ------------------------------------------------------------- the sources */

const evt = (kind, date, title, detail, path, extra) => {
  const iso = isoOf(date);
  if (!iso) return null;
  return { kind, date: iso, title: title || "(untitled)", detail: detail || "", path: path || null, ...(extra || {}) };
};

/* Read every dated obligation this identity is entitled to see.
 *
 * `window` bounds the work: a register of 6,800 contracts produces 6,800
 * candidate dates and the grid only ever shows a month, so events outside the
 * asked-for range are dropped before anything is built rather than after. */
export function useLegalCalendar(fromIso, toIso) {
  const me = useActiveUser();
  const can = (p) => { try { return canOpenPath(me, p); } catch (e) { return false; } };
  const litOk = can("/litigation"), compOk = can("/compliance"), commOk = can("/contracts");

  const lit = useRegister("litigation", 0, litOk);
  const notices = useRegister("notices", 0, litOk);
  const licences = useRegister("licences", 0, compOk);
  const loans = useRegister("loans", 0, compOk);
  const contracts = useRegister("contracts", 0, commOk);
  const requests = useCollection("requests");
  const matters = useCollection("matters");

  const loading = (litOk && (lit.loading || notices.loading))
    || (compOk && (licences.loading || loans.loading))
    || (commOk && contracts.loading);

  const events = useMemo(() => {
    const out = [];
    const inRange = (e) => e && (!fromIso || e.date >= fromIso) && (!toIso || e.date <= toIso);
    const push = (e) => { if (inRange(e)) out.push(e); };

    /* HEARINGS. The case's own next-hearing date, plus every dated hearing in
       its recorded schedule — a case that has three listed dates should appear
       on three days, not only on the nearest one. */
    for (const c of (lit.rows || [])) {
      push(evt("hearing", c.nextHearing, c.title, [c.caseNo, c.court, c.counsel].filter(Boolean).join(" · "),
        "/litigation/" + encodeURIComponent(c.id), { recordId: c.id, entity: c.entity, closed: c.status === "Closed" }));
      for (const h of (c.caseHearings || [])) {
        if (isoOf(h.date) === isoOf(c.nextHearing)) continue;   // already listed above
        push(evt("hearing", h.date, c.title, [h.purpose, c.court].filter(Boolean).join(" · "),
          "/litigation/" + encodeURIComponent(c.id),
          { recordId: c.id, entity: c.entity, meetingLink: h.meetingLink || null, closed: c.status === "Closed" }));
      }
    }

    /* NOTICE REPLY DEADLINES. Only a notice that actually demands a response
       and has not been answered — a deadline on a replied notice is history. */
    for (const n of (notices.rows || [])) {
      if (n.replyDate) continue;
      push(evt("reply", n.replyDeadline, (n.details || n.category || "Legal notice").slice(0, 80),
        [n.sender, "→", n.recipient].filter(Boolean).join(" "),
        "/rec/notice/" + encodeURIComponent(n.id), { recordId: n.id, entity: n.entity }));
    }

    /* LICENCE RENEWALS — their own class, not folded in with contracts. */
    for (const l of (licences.rows || [])) {
      push(evt("licence", l.expiry, [l.authority, l.entity].filter(Boolean).join(" — ") || "Licence",
        ["Licence" + (l.number ? " " + l.number : ""), "expires"].join(" "),
        "/compliance/licenses/" + encodeURIComponent(l.id), { recordId: l.id, entity: l.entity }));
    }

    /* LOAN REPAYMENTS. */
    for (const l of (loans.rows || [])) {
      push(evt("repayment", l.repaymentDate, l.borrower || l.ref || "Loan",
        [l.lender && "from " + l.lender, l.amount ? fmt.money(l.amount, l.currency) : null].filter(Boolean).join(" · "),
        "/compliance/loans/" + encodeURIComponent(l.id), { recordId: l.id, entity: l.borrower }));
    }

    /* CONTRACT EXPIRIES. A concluded contract's expiry has already happened
       and is not an obligation; only live paper renews. */
    for (const c of (contracts.rows || [])) {
      if (/Terminated|Archived/i.test(c.status || "")) continue;
      push(evt("renewal", c.expiry, c.title, [c.counterparty, c.entityName].filter(Boolean).join(" · "),
        "/contracts/" + encodeURIComponent(c.id), { recordId: c.id, entity: c.entityName }));
    }

    /* TASK DUE DATES — the worklist's own committed dates, row-filtered to
       what this identity may see before anything is dated. */
    try {
      const vis = filterVisible(me, requests || []);
      const ctx = { requests: vis, matters, contracts: contracts.rows || [], repository: [], licenses: [], requesters: [] };
      for (const u of unifiedRows(vis, filterVisible(me, matters || []))) {
        const t = rowTat(u.record, ctx);
        if (!t || t.done || !t.dueAt) continue;
        push(evt("task", t.dueAt, u.title || u.id, [u.record.stage || u.record.status, u.record.owner && "owner " + u.record.owner].filter(Boolean).join(" · "),
          "/workspace/" + encodeURIComponent(u.id), { recordId: u.id }));
      }
    } catch (e) { /* the worklist is a bonus source; never let it break the calendar */ }

    out.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return out;
  }, [lit.rows, notices.rows, licences.rows, loans.rows, contracts.rows, requests, matters, fromIso, toIso, me && me.id]);

  return { events, loading, sources: { litigation: litOk, compliance: compOk, commercial: commOk } };
}

/* ------------------------------------------------------------- the grid UI */

/* One month or one week, as a real grid. `anchor` is any date inside the
   period; the caller owns it so Previous / Today / Next are the caller's
   buttons and the address bar can carry the period. */
export function CalendarGrid({ mode = "month", anchor, events = [], selected, onSelect, kinds }) {
  const today = todayIso();
  const first = mode === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));
  const weeks = mode === "week" ? 1 : Math.ceil((new Date(addMonths(anchor, 1)) - new Date(first)) / (7 * 86400000));
  const monthOf = startOfMonth(anchor).slice(0, 7);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (kinds && kinds.size && !kinds.has(e.kind)) continue;
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date).push(e);
    }
    return m;
  }, [events, kinds]);

  const cells = [];
  for (let i = 0; i < weeks * 7; i++) cells.push(addDays(first, i));

  return html`<div class="cal">
    <div class="cal__dow">${DOW.map((d) => html`<div key=${d} class="cal__dowc">${d}</div>`)}</div>
    <div class=${cx("cal__grid", mode === "week" && "cal__grid--week")}>
      ${cells.map((iso) => {
        const list = byDay.get(iso) || [];
        const outside = mode === "month" && iso.slice(0, 7) !== monthOf;
        const isToday = iso === today;
        return html`<button type="button" key=${iso}
          class=${cx("cal__day", outside && "cal__day--out", isToday && "cal__day--today", selected === iso && "cal__day--sel")}
          aria-current=${isToday ? "date" : undefined}
          aria-label=${`${fmt.date(iso)} — ${list.length} ${list.length === 1 ? "event" : "events"}`}
          onClick=${() => onSelect && onSelect(iso)}>
          <span class="cal__n">${Number(iso.slice(8, 10))}</span>
          <span class="cal__evs">
            ${/* The pill is clipped to its day (see .cal__grid); the full title
                  is on the tooltip, and in the day's list beside the grid. */ ""}
            ${list.slice(0, mode === "week" ? 8 : 3).map((e, i) => html`<span key=${i}
              title=${e.title + (e.detail ? " — " + e.detail : "")}
              class=${"cal__ev cal__ev--" + (EVENT_KINDS[e.kind] || {}).tone}>
              <${Icon} name=${(EVENT_KINDS[e.kind] || {}).icon || "circle"} size=10 />
              <span class="cal__evt">${e.title}</span></span>`)}
            ${list.length > (mode === "week" ? 8 : 3) && html`<span class="cal__more">+${list.length - (mode === "week" ? 8 : 3)} more</span>`}
          </span>
        </button>`;
      })}
    </div>
  </div>`;
}

/* ---------------------------------------------------------- jump to a date */

/* STEPPING A MONTH AT A TIME IS NOT NAVIGATION.
   The only way to reach a date was the ‹ › pair, one period per click: a
   hearing in March 2027 was six clicks away, and a date in a year you had not
   thought about was unreachable without counting. All three controls here are
   mouse-only operable and land on an exact date:
     · the month and the year are plain selects — open, click, you are there;
     · "Go to" takes a typed dd/mm/yyyy AND opens the browser's own date picker
       from its calendar button, so a specific day is two clicks with no typing.
   Picking a month lands on the 1st; picking a day SELECTS that day, so the
   agenda beside the grid is already showing it and nothing has to be scrolled
   to or hunted for. */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function CalendarJump({ anchor, onJump, years }) {
  const y = Number(String(anchor).slice(0, 4));
  const m = Number(String(anchor).slice(5, 7));
  /* The years OFFERED span the years the data covers, widened to at least two
     either side of the year on screen and filled in contiguously. Two failures
     this avoids: a list built only from what is loaded (the department
     calendar fetches one month at a time, so it would offer one year and be
     useless), and a list with holes, where a year with no hearings in it
     cannot be reached at all even though its neighbours can. */
  const known = (years || []).filter((n) => Number.isFinite(n));
  const lo = Math.min(y - 2, ...(known.length ? known : [y]));
  const hi = Math.max(y + 2, ...(known.length ? known : [y]));
  const list = [];
  for (let n = lo; n <= hi; n++) list.push(n);
  const go = (yy, mm) => onJump(`${yy}-${String(mm).padStart(2, "0")}-01`);
  return html`<div class="caljump">
    <select class="select caljump__sel" aria-label="Month" value=${String(m)}
      onChange=${(e) => go(y, Number(e.target.value))}>
      ${MONTH_NAMES.map((name, i) => html`<option key=${name} value=${String(i + 1)}>${name}</option>`)}
    </select>
    <select class="select caljump__sel caljump__sel--y" aria-label="Year" value=${String(y)}
      onChange=${(e) => go(Number(e.target.value), m)}>
      ${list.map((yy) => html`<option key=${yy} value=${String(yy)}>${yy}</option>`)}
    </select>
    <span class="caljump__go" title="Go to a specific date">
      <${DateInput} value=${anchor} aria-label="Go to date"
        onInput=${(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onJump(v, true); }} />
    </span>
  </div>`;
}

/* The years the events span — what CalendarJump should offer. */
export const yearsOf = (events) =>
  [...new Set((events || []).map((e) => Number(String(e.date).slice(0, 4))).filter(Boolean))]
    .sort((a, b) => a - b);

/* The legend doubles as the filter — a colour with no name is decoration. */
export function CalendarLegend({ events, kinds, onToggle }) {
  const counts = useMemo(() => {
    const m = {};
    for (const e of events) m[e.kind] = (m[e.kind] || 0) + 1;
    return m;
  }, [events]);
  const present = KIND_ORDER.filter((k) => counts[k]);
  if (!present.length) return null;
  return html`<div class="row wrap" style="gap:8px;align-items:center">
    ${present.map((k) => { const on = !kinds.size || kinds.has(k); const d = EVENT_KINDS[k];
      return html`<button key=${k} type="button" class=${cx("callegend", "callegend--" + d.tone, !on && "callegend--off")}
        aria-pressed=${on ? "true" : "false"} title=${`Show only ${d.label.toLowerCase()}`}
        onClick=${() => onToggle(k)}>
        <${Icon} name=${d.icon} size=12 /> ${d.label} <span class="callegend__n">${counts[k]}</span>
      </button>`; })}
    ${kinds.size > 0 && html`<button type="button" class="fltbtn" onClick=${() => onToggle(null)}>Show all</button>`}
  </div>`;
}

/* One day's events, written out. This is the half a lawyer reads. */
export function DayAgenda({ date, events, onOpen, emptyText }) {
  const list = events.filter((e) => e.date === date);
  if (!list.length) {
    return html`<div class="tiny muted" style="padding:14px 2px">${emptyText || `Nothing is due on ${fmt.date(date)}.`}</div>`;
  }
  return html`<div class="col" style="gap:0">
    ${list.map((e, i) => { const d = EVENT_KINDS[e.kind] || {};
      return html`<button key=${i} type="button" class="feed__item clickable" style="text-align:left;width:100%"
        onClick=${() => e.path && onOpen(e.path)}>
        <div class="row" style="gap:10px;align-items:center;width:100%">
          <span class=${"calpip calpip--" + d.tone}><${Icon} name=${d.icon || "circle"} size=13 /></span>
          <div style="flex:1;min-width:0">
            <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</div>
            <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${d.noun}${e.detail ? " · " + e.detail : ""}</div>
          </div>
          ${/* A MEETING LINK IS SHOWN ONLY WHERE THE RECORD HOLDS ONE.
                No placeholder, no constructed URL: if the source never captured
                a joining link there is nothing to click, and saying so is the
                honest answer. */ ""}
          ${e.meetingLink && html`<a class="fltbtn" href=${e.meetingLink} target="_blank" rel="noopener noreferrer"
            onClick=${(ev) => ev.stopPropagation()}><${Icon} name="externalLink" size=12 /> Join</a>`}
          <${Icon} name="chevronRight" size=14 />
        </div></button>`; })}
  </div>`;
}
