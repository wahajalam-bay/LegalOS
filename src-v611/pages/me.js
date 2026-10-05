// MY DASHBOARD — the Associate's personal execution centre.
//
// Not a smaller copy of the Director or Team Lead view. It answers one question:
// "what do I need to do?" Everything here is scoped to the signed-in person —
// work they own — so no colleague's workload or performance appears.
import { html, cx, fmt, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Progress, Status } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { navigate } from "../router.js";
import { useCollection, setWorkspaceTarget } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { nameOf, subdivisionOf } from "../data.js";
import { LEGAL_TEAMS } from "../org.js";
import { unifiedRows, rowTat } from "../flow.js";
import { drillTo } from "../drill.js";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const daysTo = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

export default function MyDashboard() {
  const me = useActiveUser();
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  const team = LEGAL_TEAMS.find((t) => t.key === me.legalTeam);

  const m = useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses };
    const all = unifiedRows(requests, matters).map((u) => ({ ...u.record, id: u.id, __tat: rowTat(u.record, ctx) }));
    // THE scoping line: only what this person owns.
    const mine = all.filter((r) => r.owner === me.id);

    const open = mine.filter((r) => !r.__tat.done);
    const done = mine.filter((r) => r.__tat.done);
    const dueIn = (lo, hi) => open.filter((r) => {
      const d = r.__tat.dueAt ? daysTo(r.__tat.dueAt) : null;
      return d != null && d >= lo && d <= hi;
    });
    const overdue = open.filter((r) => r.__tat.status === "Delayed");
    const dueToday = dueIn(0, 0);
    const due7 = dueIn(0, 7);
    const due30 = dueIn(8, 30);
    const inReview = open.filter((r) => /review/i.test(r.status || r.stage || ""));
    // "Waiting on me" = the ball is with legal, i.e. it is mine to move.
    const waitingOnMe = open.filter((r) => (r.__tat.blockingBall || "legal") === "legal");
    const inSla = done.filter((r) => r.__tat.status !== "Delayed").length;
    const slaPct = done.length ? Math.round((inSla / done.length) * 100) : null;
    const tats = done.map((r) => r.__tat.elapsed).filter((n) => typeof n === "number");
    const avgTat = tats.length ? (tats.reduce((a, b) => a + b, 0) / tats.length).toFixed(1) : null;

    // Attention order: overdue first, then today, then the rest of the week.
    const attention = [...overdue, ...dueToday.filter((r) => !overdue.includes(r)),
      ...due7.filter((r) => !overdue.includes(r) && !dueToday.includes(r))].slice(0, 8);

    const byStage = (() => {
      const g = new Map();
      open.forEach((r) => { const k = r.stage || r.status || "Assigned"; g.set(k, (g.get(k) || 0) + 1); });
      return [...g.entries()].map(([stage, n]) => ({ stage, n })).sort((a, b) => b.n - a.n);
    })();

    return { mine, open, done, overdue, dueToday, due7, due30, inReview, waitingOnMe, slaPct, avgTat, attention, byStage };
  }, [requests, matters, contracts, repository, licenses, me.id]);

  const openMine = (extra) => {
    setWorkspaceTarget({ lens: "worklist" });
    drillTo("/workspace", "wsp", { owners: [me.id], ...(extra || {}) });
    navigate("/workspace");
  };
  const rowTone = (r) => r.__tat.status === "Delayed" ? "red"
    : (r.__tat.dueAt && daysTo(r.__tat.dueAt) <= 0) ? "amber" : "green";

  return html`<div class="page fade-in">
    <${PageHead} title=${`${greeting()}, ${me.name.split(" ")[0]}`}
      sub=${`Here's what needs your attention today${team ? " · " + team.short : ""}.`}
      actions=${html`<${Btn} variant="primary" icon="inbox" onClick=${() => openMine()}>Open my worklist</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: m.open.length, label: "My open work", tone: "blue", onClick: () => openMine() },
      { value: m.dueToday.length, label: "Due today", tone: "amber", onClick: () => openMine() },
      { value: m.overdue.length, label: "Overdue", tone: "red", onClick: () => openMine({ tatStatuses: ["Delayed"] }) },
      { value: m.waitingOnMe.length, label: "Waiting on me", title: "The ball is with Legal — yours to move", onClick: () => openMine() },
      { value: m.slaPct == null ? "—" : m.slaPct + "%", label: "SLA performance", tone: "green" },
      { value: m.due7.length, label: "Due next 7 days", onClick: () => openMine() },
      { value: m.inReview.length, label: "In review", tone: "purple" },
      { value: m.done.length, label: "Completed" },
    ]} />

    <section class="exec__split" style="margin-top:18px">
      <div class="card card--pad col" style="gap:12px">
        <div class="row">
          <div><h2 class="exec__h2">Needs attention</h2><p class="exec__sub">Overdue first, then due today, then the rest of this week.</p></div>
          <div class="spacer"></div>
          <div class="row" style="gap:6px">
            ${m.overdue.length > 0 && html`<${Pill} tone="red">${m.overdue.length} overdue</${Pill}>`}
            ${m.dueToday.length > 0 && html`<${Pill} tone="amber">${m.dueToday.length} due today</${Pill}>`}
            ${m.due7.length > 0 && html`<${Pill} tone="blue">${m.due7.length} this week</${Pill}>`}
          </div>
        </div>
        <div class="col" style="gap:8px">
          ${m.attention.map((r) => html`<button key=${r.id} class="cellbtn" style="width:100%"
            onClick=${() => navigate("/workspace/" + r.id)}>
            <div class="row" style="gap:10px;text-align:left">
              <span class="tag-dot" style=${`background:var(--${rowTone(r) === "red" ? "danger" : rowTone(r) === "amber" ? "warning" : "success"});flex:none`}></span>
              <div style="min-width:0;flex:1">
                <div class="tiny strong">${r.title}</div>
                <div class="tiny muted">${r.id} · ${subdivisionOf(r) || "—"} · ${r.stage || r.status}</div>
              </div>
              <span class=${cx("tiny strong", r.__tat.status === "Delayed" && "risk--critical")}>
                ${r.__tat.status === "Delayed" ? `+${Math.abs(r.__tat.remaining || 0)}d` : r.__tat.dueAt ? fmt.dateShort(r.__tat.dueAt) : "—"}
              </span>
            </div>
          </button>`)}
          ${m.attention.length === 0 && html`<${Empty} icon="check" title="Nothing needs you right now" text="No overdue work and nothing due this week." />`}
        </div>
      </div>

      <div class="card card--pad col" style="gap:14px">
        <div>
          <h2 class="exec__h2">My workflow</h2>
          <p class="exec__sub">Where my open work is sitting. Click a stage to open those items.</p>
        </div>
        <div class="col" style="gap:8px">
          ${m.byStage.map((s) => html`<button key=${s.stage} class="cellbtn" style="width:100%" onClick=${() => openMine()}>
            <div class="row" style="gap:10px">
              <span class="tiny strong" style="min-width:140px;text-align:left">${s.stage}</span>
              <div style="flex:1"><${Progress} value=${Math.round((s.n / (m.open.length || 1)) * 100)} /></div>
              <span class="tiny strong" style="width:26px;text-align:right">${s.n}</span>
            </div>
          </button>`)}
          ${m.byStage.length === 0 && html`<${Empty} icon="check" title="Nothing open" text="You have no open work assigned." />`}
        </div>
        <div class="row wrap" style="gap:14px;border-top:1px solid var(--border);padding-top:12px">
          <div><div class="tiny muted">Within SLA</div><div class="strong" style="font-size:17px">${m.slaPct == null ? "—" : m.slaPct + "%"}</div></div>
          <div><div class="tiny muted">Avg turnaround</div><div class="strong" style="font-size:17px">${m.avgTat == null ? "—" : m.avgTat + "d"}</div></div>
          <div><div class="tiny muted">Breached</div><div class="strong" style="font-size:17px">${m.overdue.length}</div></div>
        </div>
      </div>
    </section>

    <section class="exec__split exec__split--one" style="margin-top:16px">
      <div class="card card--pad col" style="gap:12px">
        <h2 class="exec__h2">Upcoming deadlines</h2>
        ${[["Today", m.dueToday], ["Next 7 days", m.due7.filter((r) => !m.dueToday.includes(r))], ["Next 30 days", m.due30]]
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => html`<div key=${label}>
            <div class="fpop__lbl" style="margin-bottom:6px">${label} · ${list.length}</div>
            <div class="col" style="gap:6px">
              ${list.slice(0, 5).map((r) => html`<button key=${r.id} class="cellbtn" style="width:100%" onClick=${() => navigate("/workspace/" + r.id)}>
                <div class="row" style="gap:10px;text-align:left">
                  <div style="min-width:0;flex:1"><div class="tiny strong">${r.title}</div><div class="tiny muted">${r.id} · ${r.stage || r.status}</div></div>
                  <span class="tiny muted">${r.__tat.dueAt ? fmt.dateShort(r.__tat.dueAt) : "—"}</span>
                </div>
              </button>`)}
            </div>
          </div>`)}
        ${m.dueToday.length === 0 && m.due7.length === 0 && m.due30.length === 0
          && html`<${Empty} icon="calendar" title="Nothing scheduled" text="No deadlines on your work in the next 30 days." />`}
      </div>

      <!-- The reminders card lived here; it was derived entirely from the
           contract book, which is Director-only — it must not even show on
           this dashboard. -->
    </section>
  </div>`;
}
