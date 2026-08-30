// THE LEGAL FUNCTION — the Director's hierarchical drill-down.
//
// Organisation -> Team -> Desk -> Owner -> Work item -> Current stage, by
// progressive disclosure: each level expands in place rather than navigating
// away, so the Director never loses the executive context. Every number is
// computed from the same unified rows the rest of the app uses; nothing here is
// estimated or illustrative.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Pill, Empty, Avatar, Progress } from "../ui.js";
import { navigate } from "../router.js";
import { useCollection, setWorkspaceTarget } from "../store.js";
import { nameOf, byId, subdivisionOf, USERS } from "../data.js";
import { LEGAL_TEAMS, teamOfSubdivision } from "../org.js";
import { unifiedRows, rowTat } from "../flow.js";
import { EMPTY_FILTERS } from "../shared.js";

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
const daysTo = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

// Health is a statement about overdue load, not a vibe: a team with nothing late
// is healthy, a team with more than a tenth of its open work late needs looking at.
function health(open, overdue) {
  if (!open) return { tone: "gray", label: "No open work" };
  const share = overdue / open;
  if (overdue === 0) return { tone: "green", label: "Healthy" };
  if (share <= 0.1) return { tone: "green", label: "Healthy" };
  if (share <= 0.25) return { tone: "amber", label: "Attention" };
  return { tone: "red", label: "At risk" };
}

export function useOrgTree() {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");

  return useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses };
    const rows = unifiedRows(requests, matters).map((u) => ({ ...u.record, id: u.id, __tat: rowTat(u.record, ctx) }));

    const summarise = (list) => {
      const open = list.filter((r) => !r.__tat.done);
      const done = list.filter((r) => r.__tat.done);
      const overdue = open.filter((r) => r.__tat.status === "Delayed");
      const inSla = done.filter((r) => r.__tat.status !== "Delayed").length;
      const tats = done.map((r) => r.__tat.elapsed).filter((n) => typeof n === "number");
      const due7 = open.filter((r) => r.__tat.dueAt && daysTo(r.__tat.dueAt) >= 0 && daysTo(r.__tat.dueAt) <= 7);
      return {
        rows: list, open, done, overdue, due7,
        sla: pct(inSla, done.length),
        avgTat: tats.length ? (tats.reduce((a, b) => a + b, 0) / tats.length).toFixed(1) : null,
      };
    };

    const teams = LEGAL_TEAMS.map((t) => {
      const members = USERS.filter((u) => u.legalTeam === t.key);
      const ids = new Set(members.map((u) => u.id));
      const list = rows.filter((r) => teamOfSubdivision(subdivisionOf(r)) === t.key || ids.has(r.owner));
      const s = summarise(list);

      // Desks inside the team, from the rows themselves — no invented structure.
      const deskNames = [...new Set(list.map((r) => subdivisionOf(r)).filter(Boolean))];
      const desks = deskNames.map((d) => ({ name: d, ...summarise(list.filter((r) => subdivisionOf(r) === d)) }))
        .sort((a, b) => b.open.length - a.open.length);

      const lead = members.find((u) => u.rbac === "lead") || null;
      const people = members.map((u) => ({ u, ...summarise(list.filter((r) => r.owner === u.id)) }))
        .sort((a, b) => b.open.length - a.open.length);

      return { ...t, ...s, desks, lead, people, health: health(s.open.length, s.overdue.length) };
    });

    // Where the whole function's open work is sitting.
    const byStage = (() => {
      const g = new Map();
      rows.filter((r) => !r.__tat.done).forEach((r) => {
        const k = r.__tat.blockingStage || r.stage || r.status || "Unassigned";
        g.set(k, (g.get(k) || 0) + 1);
      });
      return [...g.entries()].map(([stage, n]) => ({ stage, n })).sort((a, b) => b.n - a.n);
    })();

    // Bottlenecks, stated only where the data supports the statement.
    const facts = [];
    if (byStage[0]) facts.push(`${byStage[0].stage} is the largest queue — ${byStage[0].n} items.`);
    const worst = [...teams].filter((t) => t.open.length).sort((a, b) => b.overdue.length - a.overdue.length)[0];
    if (worst && worst.overdue.length) facts.push(`${worst.short} carries the most overdue work — ${worst.overdue.length} of ${worst.open.length} open.`);
    const loaded = teams.flatMap((t) => t.people).sort((a, b) => b.open.length - a.open.length)[0];
    if (loaded && loaded.open.length) facts.push(`${loaded.u.name} holds the most open work — ${loaded.open.length} items.`);

    return { rows, teams, byStage, facts, all: summarise(rows) };
  }, [requests, matters, contracts, repository, licenses]);
}

/* The tree itself. Three levels expand in place; the fourth (a work item) opens
   the existing record rather than duplicating it here. */
export function OrgTree({ tree }) {
  const [openTeam, setOpenTeam] = useState(null);
  const [openPerson, setOpenPerson] = useState(null);

  const openList = (filters) => {
    setWorkspaceTarget({ lens: "worklist", filters: { ...EMPTY_FILTERS, ...filters } });
    navigate("/workspace");
  };

  return html`<div class="col" style="gap:10px">
    ${tree.teams.map((t) => {
      const expanded = openTeam === t.key;
      return html`<div key=${t.key} class="orgnode">
        <button class=${cx("orgnode__head", expanded && "is-open")} onClick=${() => { setOpenTeam(expanded ? null : t.key); setOpenPerson(null); }}>
          <${Icon} name="chevronDown" size=14 class="orgnode__chev" />
          <span class="orgnode__ico"><${Icon} name=${t.icon} size=15 /></span>
          <div style="min-width:0;flex:1;text-align:left">
            <div class="orgnode__name">${t.short}</div>
            <div class="orgnode__sub">${t.lead ? "Team Lead: " + t.lead.name : "No lead assigned"} · ${t.people.length} people</div>
          </div>
          <div class="orgnode__nums">
            <span class="orgnode__n"><b>${t.open.length}</b> open</span>
            <span class=${cx("orgnode__n", t.overdue.length && "risk--critical")}><b>${t.overdue.length}</b> overdue</span>
            <span class="orgnode__n">${t.sla == null ? "—" : t.sla + "%"} SLA</span>
            <span class="orgnode__n">${t.avgTat == null ? "—" : t.avgTat + "d"}</span>
          </div>
          <${Pill} tone=${t.health.tone} dot=${true}>${t.health.label}</${Pill}>
        </button>

        ${expanded && html`<div class="orgnode__body">
          <div class="orgnode__cols">
            <div>
              <div class="fpop__lbl" style="margin-bottom:8px">Desks</div>
              <div class="col" style="gap:6px">
                ${t.desks.map((d) => html`<button key=${d.name} class="orgrow"
                  onClick=${() => openList({ subdivisions: [d.name] })}>
                  <span class="orgrow__name">${d.name}</span>
                  <span class="tiny muted">${d.open.length} open</span>
                  ${d.overdue.length > 0 && html`<${Pill} tone="red">${d.overdue.length} late</${Pill}>`}
                  <div style="flex:1;min-width:40px"><${Progress} value=${Math.round((d.open.length / (t.open.length || 1)) * 100)} /></div>
                </button>`)}
                ${t.desks.length === 0 && html`<span class="tiny muted">No desk-tagged work.</span>`}
              </div>
            </div>

            <div>
              <div class="fpop__lbl" style="margin-bottom:8px">Who is holding what</div>
              <div class="col" style="gap:6px">
                ${t.people.map((p) => {
                  const on = openPerson === p.u.id;
                  return html`<div key=${p.u.id}>
                    <button class=${cx("orgrow", on && "is-open")} onClick=${() => setOpenPerson(on ? null : p.u.id)}>
                      <${Avatar} name=${p.u.name} size="sm" />
                      <span class="orgrow__name">${p.u.name}</span>
                      <span class="tiny muted">${p.u.rbac === "lead" ? "Lead" : p.u.role}</span>
                      <div class="spacer"></div>
                      <span class="tiny"><b>${p.open.length}</b> open</span>
                      ${p.overdue.length > 0 && html`<${Pill} tone="red">${p.overdue.length}</${Pill}>`}
                      ${p.sla != null && html`<${Pill} tone=${p.sla >= 90 ? "green" : p.sla >= 75 ? "amber" : "red"}>${p.sla}%</${Pill}>`}
                    </button>
                    ${on && html`<div class="orgnode__work">
                      ${p.open.slice(0, 8).map((r) => html`<button key=${r.id} class="orgwork"
                        onClick=${() => navigate("/workspace/" + r.id)}>
                        <div style="min-width:0;flex:1;text-align:left">
                          <div class="tiny strong">${r.title}</div>
                          <div class="tiny muted">${r.id} · ${r.__tat.blockingStage || r.stage || r.status}${r.__tat.blockingBall && r.__tat.blockingBall !== "legal" ? " · ball with " + r.__tat.blockingBall : ""}</div>
                        </div>
                        <span class=${cx("tiny strong", r.__tat.status === "Delayed" && "risk--critical")}>
                          ${r.__tat.status === "Delayed" ? "+" + Math.abs(r.__tat.remaining || 0) + "d" : r.__tat.dueAt ? fmt.dateShort(r.__tat.dueAt) : "—"}
                        </span>
                      </button>`)}
                      ${p.open.length === 0 && html`<span class="tiny muted" style="padding:6px 10px">Nothing open.</span>`}
                    </div>`}
                  </div>`;
                })}
              </div>
            </div>
          </div>
        </div>`}
      </div>`;
    })}
  </div>`;
}
