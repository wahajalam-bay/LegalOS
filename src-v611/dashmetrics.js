/* THE DASHBOARD'S NUMBERS, COMPUTED FROM THE RECORDS.
 *
 * This file exists because the executive dashboard used to read most of its
 * headline figures out of a constant called DASH — 1,284 active contracts, a
 * turnaround of 3.4 days, a compliance score of 84, an eleven-point trend line
 * "down from 4.8 in January". None of it was measured. It was demo content
 * written before Drive was connected, and it survived long enough to be quoted
 * in a narrative paragraph addressed to the General Counsel.
 *
 * Every figure below is derived from live records, and where the source cannot
 * answer a question the answer is `null` — which the UI renders as a sentence
 * saying what is missing, never as a zero and never as an estimate.
 */
import { useMemo } from "./core.js";
import { useCollection } from "./store.js";
import { useRegister } from "./live.js";
import { useActiveUser, filterVisible } from "./rbac.js";
import { unifiedRows, rowTat } from "./flow.js";
import { lifecycleOf, claimTotals } from "./litigationmodel.js";

const iso = (d) => (d ? String(d).slice(0, 10) : "");
const monthOf = (d) => (d ? String(d).slice(0, 7) : "");
export const lastMonths = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1 - i));
  return d.toISOString().slice(0, 7);
});

/* A closed record's turnaround, in elapsed days from when it was raised to when
   it finished. Only records that HAVE both dates contribute; a mean over
   guessed dates is worse than a smaller honest sample. */
function turnaroundOf(r) {
  const start = r.requestDate || r.created || r.opened;
  const end = r.closedAt || r.completedAt || r.executedAt || (r.__tat && r.__tat.done ? r.updatedAt : null);
  if (!start || !end) return null;
  const d = Math.round((new Date(end) - new Date(start)) / 86400000);
  return d >= 0 ? d : null;
}

export function useWorkMetrics(period) {
  const me = useActiveUser();
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");

  return useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses: [], requesters: [] };
    const rows = filterVisible(me, unifiedRows(filterVisible(me, requests || []), filterVisible(me, matters || []))
      .map((u) => ({ ...u.record, id: u.id, title: u.title, __face: u.face, __tat: rowTat(u.record, ctx) })));

    const active = rows.filter((r) => !r.__tat.done);
    const done = rows.filter((r) => r.__tat.done);
    const delayed = active.filter((r) => r.__tat.status === "Delayed");
    const dueToday = active.filter((r) => r.__tat.status === "Due Today");
    const pending = active.filter((r) => r.__tat.blockingBall === "business" || r.__tat.blockingBall === "counterparty");

    /* AVERAGE TURNAROUND, MEASURED. Only finished work with both ends dated.
       `null` when there is not enough of it — which is the truthful answer for
       a department that has just moved onto the system, and infinitely better
       than the 3.4 days this used to assert. */
    const measured = done.map(turnaroundOf).filter((d) => d != null);
    const avgTat = measured.length ? Math.round((measured.reduce((s, d) => s + d, 0) / measured.length) * 10) / 10 : null;
    const committed = rows.length
      ? Math.round((rows.reduce((s, r) => s + (r.__tat.days || 0), 0) / rows.length) * 10) / 10 : null;

    /* ON TIME vs DELAYED, month by month — the §16 trend. A record counts in
       the month it FINISHED, and one that finished inside its allowance is on
       time. Months with no completed work are reported as having none, not as
       100% on time. */
    /* THE TREND FOLLOWS THE SLICER.
       This was hard-coded to the last twelve months, so picking Week, Month or
       Quarter changed the banner and the dated cards and left the chart showing
       a year regardless — which reads as a chart that is simply broken. The
       months now span the selected window: from the period's start to its end,
       inclusive, and the whole of the last twelve only when the window is
       genuinely open-ended (All time). A window shorter than a month still
       yields the one month it falls in, so the chart is never empty for a
       period that contains completed work. */
    const monthsBetween = (fromIso, toIso) => {
      const out = [];
      const a = new Date((fromIso || "").slice(0, 7) + "-01");
      const b = new Date((toIso || "").slice(0, 7) + "-01");
      if (isNaN(a) || isNaN(b) || a > b) return null;
      for (const d = new Date(a); d <= b; d.setMonth(d.getMonth() + 1)) out.push(d.toISOString().slice(0, 7));
      return out.length ? out.slice(-24) : null;
    };
    const months = (period && period.from)
      ? (monthsBetween(period.from, period.to || new Date().toISOString().slice(0, 10)) || lastMonths(12))
      : lastMonths(12);
    const trend = months.map((m) => {
      const inMonth = done.filter((r) => monthOf(r.closedAt || r.completedAt || r.executedAt || r.updatedAt) === m);
      const late = inMonth.filter((r) => r.__tat.overdueBy > 0).length;
      return { label: m.slice(5), month: m, total: inMonth.length, late, onTime: inMonth.length - late };
    });

    /* WORKLOAD BY PERSON and BY TEAM (§16) — OPEN TASKS, not "open records".
       The distinction matters: a person holding 40 finished matters is not
       loaded, and the old per-person chart counted exactly that. */
    const byPerson = new Map();
    const byTeam = new Map();
    for (const r of active) {
      const p = r.owner || "__unassigned";
      const t = r.legalTeam || r.subdivision || "Unassigned";
      if (!byPerson.has(p)) byPerson.set(p, { id: p, open: 0, delayed: 0, dueToday: 0 });
      const e = byPerson.get(p);
      e.open++;
      if (r.__tat.status === "Delayed") e.delayed++;
      if (r.__tat.status === "Due Today") e.dueToday++;
      byTeam.set(t, (byTeam.get(t) || 0) + 1);
    }

    const raisedInPeriod = period
      ? rows.filter((r) => period.coversStrict(iso(r.requestDate || r.created)))
      : rows;

    return {
      rows, active, done, delayed, dueToday, pending,
      avgTat, committedTat: committed, measuredCount: measured.length,
      trend,
      byPerson: [...byPerson.values()].sort((a, b) => b.open - a.open),
      byTeam: [...byTeam.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      raisedInPeriod,
      onTimePct: done.length ? Math.round(((done.length - done.filter((r) => r.__tat.overdueBy > 0).length) / done.length) * 100) : null,
    };
  }, [requests, matters, contracts, repository, me, period && period.id, period && period.from, period && period.to]);
}

/* The operational stock figures: what is live right now across the registers
   this identity can open. Everything here is "as at today" and deliberately
   NOT period-filtered — an active case is active whatever window you pick. */
export function useRegisterMetrics() {
  const lit = useRegister("litigation");
  const notices = useRegister("notices");
  const licences = useRegister("licences");
  const contracts = useRegister("contracts");

  return useMemo(() => {
    /* COURT MATTERS ONLY — the same population the Litigation register shows.
       The litigation book is assembled from three trackers and one of them is a
       list of buyer refund claims that were never filed, plus four complaints
       made at a police station. The register and its analytics already exclude
       them; this dashboard did not, so the executive view reported 203 active
       cases against the register's 187 and the two contradicted each other on
       the same screen-to-screen click. */
    const cases = (lit.rows || []).filter((c) => (c.matterClass || "COURT_CASE") === "COURT_CASE");
    const nots = notices.rows || [];
    const lics = licences.rows || [];
    const ctr = contracts.rows || [];
    const today = new Date().toISOString().slice(0, 10);

    /* ACTIVE NOTICES (§12): one that still demands something. A notice whose
       reply has gone out, or whose status the register calls resolved, is
       history — and headlining the lifetime total of 255 told a reader
       nothing they could act on. */
    const activeNotices = nots.filter((n) => !n.replyDate && !/resolv|closed|complete|withdraw/i.test(n.status || ""));

    /* LICENCES NEEDING ATTENTION (§12): expired, or expiring inside 90 days.
       Not a percentage score — see the note on compliance scoring in exec.js. */
    const licAttention = lics.filter((l) => l.expiry && l.expiry <= addDays(today, 90));
    const licExpired = lics.filter((l) => l.expiry && l.expiry < today);

    const liveContracts = ctr.filter((c) => !/Terminated|Archived|Expired/i.test(c.status || ""));

    return {
      cases, notices: nots, licences: lics, contracts: ctr,
      activeCases: cases.filter((c) => lifecycleOf(c) === "Active"),
      decidedCases: cases.filter((c) => lifecycleOf(c) === "Decided"),
      claims: claimTotals(cases),
      activeNotices, licAttention, licExpired,
      liveContracts,
      loading: lit.loading || notices.loading || licences.loading || contracts.loading,
    };
  }, [lit.rows, notices.rows, licences.rows, contracts.rows, lit.loading, notices.loading, licences.loading, contracts.loading]);
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
