// TEAM DASHBOARD — the Team Lead's command centre.
//
// Scoped to ONE team and nothing else. A lead answers a different question from
// the Director: not "how is the legal function performing" but "what is
// happening in MY team, who is holding it, where is it stuck, what is overdue,
// and what lands next". Every number here is computed from rows that belong to
// the lead's own team, so no other desk's work can appear.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Progress, Avatar } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { navigate } from "../router.js";
import { useCollection, setWorkspaceTarget } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { nameOf, byId, subdivisionOf, USERS } from "../data.js";
import { LEGAL_TEAMS, teamOfSubdivision } from "../org.js";
import { unifiedRows, rowTat } from "../flow.js";
import { allReminders } from "../reminders.js";
import { EMPTY_FILTERS } from "../shared.js";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const dayLeft = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

export default function TeamDashboard() {
  const me = useActiveUser();
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");

  const teamKey = me.legalTeam || "commercial";
  const team = LEGAL_TEAMS.find((t) => t.key === teamKey) || LEGAL_TEAMS[0];

  const m = useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses };
    const all = unifiedRows(requests, matters).map((u) => ({ ...u.record, id: u.id, __tat: rowTat(u.record, ctx) }));
    // THE scoping line: a row belongs to this team if its desk maps to the team,
    // or its owner sits on the team. Nothing else reaches this page.
    const members = USERS.filter((u) => u.legalTeam === teamKey);
    const memberIds = new Set(members.map((u) => u.id));
    const rows = all.filter((r) => teamOfSubdivision(subdivisionOf(r)) === teamKey || memberIds.has(r.owner));

    const open = rows.filter((r) => !r.__tat.done);
    const done = rows.filter((r) => r.__tat.done);
    const overdue = open.filter((r) => r.__tat.status === "Delayed");
    const withinSla = done.filter((r) => r.__tat.status !== "Delayed").length;
    const slaPct = done.length ? Math.round((withinSla / done.length) * 100) : null;
    const turnarounds = done.map((r) => r.__tat.elapsed).filter((n) => typeof n === "number");
    const avgTat = turnarounds.length ? (turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length).toFixed(1) : null;
    const dueIn = (days) => open.filter((r) => {
      const d = r.__tat.dueAt ? dayLeft(r.__tat.dueAt) : null;
      return d != null && d >= 0 && d <= days;
    });
    const pendingReview = open.filter((r) => /review/i.test(r.status || r.stage || ""));

    // Per-member load — the lead's core question of "who is carrying what".
    const perMember = members.map((u) => {
      const mine = rows.filter((r) => r.owner === u.id);
      const mineOpen = mine.filter((r) => !r.__tat.done);
      const mineDone = mine.filter((r) => r.__tat.done);
      const mineLate = mineOpen.filter((r) => r.__tat.status === "Delayed");
      const inSla = mineDone.filter((r) => r.__tat.status !== "Delayed").length;
      return {
        u, open: mineOpen.length, overdue: mineLate.length, completed: mineDone.length,
        sla: mineDone.length ? Math.round((inSla / mineDone.length) * 100) : null,
      };
    }).sort((a, b) => b.open - a.open);

    // Where the team's work is piling up.
    const byStage = (() => {
      const g = new Map();
      open.forEach((r) => { const k = r.__tat.blockingStage || r.stage || r.status || "Unassigned"; g.set(k, (g.get(k) || 0) + 1); });
      return [...g.entries()].map(([stage, n]) => ({ stage, n })).sort((a, b) => b.n - a.n);
    })();

    // Reminders, narrowed to contracts this team owns.
    const teamContracts = contracts.filter((c) => teamOfSubdivision(subdivisionOf(c)) === teamKey || memberIds.has(c.owner));
    const reminders = allReminders(teamContracts, new Date()).slice(0, 6);

    return { rows, open, overdue, slaPct, avgTat, pendingReview, due7: dueIn(7), perMember, byStage, reminders, members, done };
  }, [requests, matters, contracts, repository, licenses, teamKey]);

  const openTeamList = (extra) => {
    setWorkspaceTarget({ lens: "worklist", filters: { ...EMPTY_FILTERS, subdivisions: [], owners: m.members.map((u) => u.id), ...(extra || {}) } });
    navigate("/workspace");
  };
  const bottleneck = m.byStage[0];

  return html`<div class="page fade-in">
    <${PageHead} title=${`${greeting()}, ${me.name.split(" ")[0]}`}
      sub=${`${team.short} · here's the state of your team today.`}
      actions=${html`<${Btn} variant="ghost" icon="columns" onClick=${() => navigate("/pipelines")}>Team pipelines</${Btn}>
        <${Btn} variant="primary" icon="inbox" onClick=${() => openTeamList()}>Open team worklist</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: m.open.length, label: "Team open work", tone: "blue", onClick: () => openTeamList() },
      { value: m.overdue.length, label: "Overdue", tone: "red", onClick: () => openTeamList({ tatStatuses: ["Delayed"] }) },
      { value: m.slaPct == null ? "—" : m.slaPct + "%", label: "SLA performance", tone: "green", title: "Completed inside the agreed turnaround" },
      { value: m.avgTat == null ? "—" : m.avgTat, label: "Avg turnaround (days)", tone: "purple" },
      { value: m.pendingReview.length, label: "Pending review", tone: "amber", onClick: () => openTeamList() },
      { value: m.due7.length, label: "Due next 7 days", onClick: () => openTeamList() },
      { value: m.done.length, label: "Completed", title: "Closed team work" },
    ]} />

    <section class="exec__split" style="margin-top:18px">
      <div class="card card--pad col" style="gap:14px">
        <div>
          <h2 class="exec__h2">Team performance</h2>
          <p class="exec__sub">Who is carrying what, and how it is landing against the agreed turnaround.</p>
        </div>
        <${DataTable} rows=${m.perMember}
          onRow=${(r) => openTeamList({ owners: [r.u.id] })}
          empty=${html`<${Empty} icon="users" title="No one assigned yet" text="Work assigned to this team will show its owners here." />`}
          columns=${[
            { key: "member", label: "Member", render: (r) => html`<div class="row" style="gap:8px"><${Avatar} name=${r.u.name} size="sm" /><div style="min-width:0"><div class="tiny strong">${r.u.name}</div><div class="tiny muted">${r.u.role}</div></div></div>` },
            { key: "open", label: "Open", align: "right", render: (r) => html`<span class="strong">${r.open}</span>` },
            { key: "overdue", label: "Overdue", align: "right", render: (r) => html`<span class=${cx("strong", r.overdue && "risk--critical")}>${r.overdue}</span>` },
            { key: "completed", label: "Completed", align: "right", render: (r) => html`<span class="tiny">${r.completed}</span>` },
            { key: "sla", label: "SLA", align: "right", render: (r) => r.sla == null ? html`<span class="tiny muted">—</span>` : html`<${Pill} tone=${r.sla >= 90 ? "green" : r.sla >= 75 ? "amber" : "red"}>${r.sla}%</${Pill}>` },
          ]} />
      </div>

      <div class="card card--pad col" style="gap:14px">
        <div>
          <h2 class="exec__h2">Where the work is sitting</h2>
          <p class="exec__sub">${bottleneck ? `Most of it is held at ${bottleneck.stage}.` : "Nothing open right now."}</p>
        </div>
        <div class="col" style="gap:8px">
          ${m.byStage.slice(0, 8).map((s) => html`<button key=${s.stage} class="cellbtn" style="width:100%"
            onClick=${() => openTeamList()}>
            <div class="row" style="gap:10px">
              <span class="tiny strong" style="min-width:150px;text-align:left">${s.stage}</span>
              <div style="flex:1"><${Progress} value=${Math.round((s.n / (m.open.length || 1)) * 100)} tone=${s === bottleneck ? "amber" : ""} /></div>
              <span class="tiny strong" style="width:28px;text-align:right">${s.n}</span>
            </div>
          </button>`)}
          ${m.byStage.length === 0 && html`<${Empty} icon="check" title="Nothing open" text="Your team has no open work." />`}
        </div>
      </div>
    </section>

    <section class="exec__split" style="margin-top:16px">
      <div class="card card--pad col" style="gap:12px">
        <div class="row">
          <div><h2 class="exec__h2">Delayed work</h2><p class="exec__sub">Past the agreed turnaround, with the stage holding it.</p></div>
          <div class="spacer"></div>
          <${Pill} tone=${m.overdue.length ? "red" : "green"}>${m.overdue.length} delayed</${Pill}>
        </div>
        <div class="col" style="gap:8px">
          ${m.overdue.slice(0, 6).map((r) => html`<button key=${r.id} class="cellbtn" style="width:100%"
            onClick=${() => navigate("/workspace/" + r.id)}>
            <div class="row" style="gap:10px;text-align:left">
              <${Icon} name="alertTriangle" size=15 style=${{ color: "var(--danger)", flex: "none" }} />
              <div style="min-width:0;flex:1">
                <div class="tiny strong">${r.title}</div>
                <div class="tiny muted">${r.id} · blocked at ${r.__tat.blockingStage || "—"} · ${nameOf(r.owner)}</div>
              </div>
              <span class="tiny strong risk--critical">+${Math.abs(r.__tat.remaining || 0)}d</span>
            </div>
          </button>`)}
          ${m.overdue.length === 0 && html`<${Empty} icon="check" title="Nothing delayed" text="Every open item is inside its agreed window." />`}
        </div>
      </div>

      <div class="card card--pad col" style="gap:12px">
        <div class="row">
          <div><h2 class="exec__h2">Lifecycle reminders</h2><p class="exec__sub">Renewals and notice windows on your team's contracts.</p></div>
          <div class="spacer"></div>
          <${Pill} tone="blue">${m.reminders.length} live</${Pill}>
        </div>
        <div class="col" style="gap:8px">
          ${m.reminders.map((r, i) => html`<button key=${i} class="cellbtn" style="width:100%"
            onClick=${() => r.contractId && navigate("/contracts/" + r.contractId)}>
            <div class="row" style="gap:10px;text-align:left">
              <${Icon} name="bell" size=15 style=${{ color: "var(--warning)", flex: "none" }} />
              <div style="min-width:0;flex:1">
                <div class="tiny strong">${r.title}</div>
                <div class="tiny muted">${r.detail || r.note || ""}</div>
              </div>
            </div>
          </button>`)}
          ${m.reminders.length === 0 && html`<${Empty} icon="bell" title="Nothing upcoming" text="No renewal or notice windows on your team's contracts." />`}
        </div>
      </div>
    </section>
  </div>`;
}
