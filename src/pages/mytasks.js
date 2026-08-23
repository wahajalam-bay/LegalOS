// Single-Window Dashboard (FRD Section 11) — My Tasks is every legal user's
// day-to-day landing screen: all open items currently assigned to them, across
// every module, sorted by TAT / SLA urgency. Leads add their team's queue;
// the Department Head adds the aggregated cross-team view. All of it obeys the
// Section 14 row-level filter.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Avatar, Empty, Segmented } from "../ui.js";
import { navigate } from "../router.js";
import { USERS, entityName, byId } from "../data.js";
import { LEGAL_TEAMS, teamShort, teamTone, masterList } from "../org.js";
import { MODULES, moduleByKey } from "../modules.js";
import { tatV2, tatV2Label, urgencyOf } from "../tat2.js";
import { useCollection, useMasterData, personName } from "../store.js";
import { useActiveUser, filterVisible, visibilityOf } from "../rbac.js";
import { TatChip } from "./module.js";

const TONE = { Running: "green", Paused: "blue", Overdue: "red", Closed: "gray" };

export default function MyTasks() {
  const all = useCollection("modRequests");
  const md = useMasterData();
  const viewer = useActiveUser();

  // Which scopes can this identity switch between?
  const scopes = [{ key: "mine", label: "My tasks" }];
  if (viewer.rbac === "lead" || viewer.rbac === "head") scopes.push({ key: "team", label: viewer.rbac === "head" ? "All teams" : "Team queue" });
  if (viewer.rbac === "head") scopes.push({ key: "byTeam", label: "By team" });
  const [scope, setScope] = useState("mine");
  const [team, setTeam] = useState("");
  const [dept, setDept] = useState("");
  const [tstat, setTstat] = useState("");
  const [stageQ, setStageQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const visible = useMemo(() => filterVisible(viewer, all), [all, viewer]);

  const rows = useMemo(() => {
    let base = visible;
    if (scope === "mine") base = base.filter((r) => r.owner === viewer.id);
    // A lead's "team queue" is their own team; head's is everything (already filtered).
    if (scope === "team" && viewer.legalTeam) base = base.filter((r) => r.legalTeam === viewer.legalTeam);
    return base
      .map((r) => ({ r, def: moduleByKey(r.moduleKey), t: null }))
      .filter((x) => x.def)
      .map((x) => ({ ...x, t: tatV2(x.def, x.r) }))
      .filter((x) => (showClosed ? true : x.t.status !== "Closed"))
      .filter((x) => !team || x.r.legalTeam === team)
      .filter((x) => !dept || x.r.requestingDept === dept)
      .filter((x) => !tstat || x.t.status === tstat)
      .filter((x) => !stageQ || x.r.stage === stageQ)
      .sort((a, b) => urgencyOf(b.t) - urgencyOf(a.t));
  }, [visible, scope, team, dept, tstat, stageQ, showClosed, viewer]);

  // Legal requests (the intake → triage pipeline, `requests` slice) assigned to
  // this user also belong on their plate — My Tasks previously only listed
  // modRequests, so a request assigned in triage never showed up here.
  const legalRequests = useCollection("requests");
  const REQ_DONE = ["Closed", "Approved", "Delivered", "Executed"];
  const myReqs = useMemo(() => {
    let base = (legalRequests || []).filter((r) => r.owner);
    if (scope === "mine") base = base.filter((r) => r.owner === viewer.id);
    else if (scope === "team" && viewer.legalTeam) base = base.filter((r) => (byId(r.owner) || {}).legalTeam === viewer.legalTeam);
    if (!showClosed) base = base.filter((r) => !REQ_DONE.includes(r.status));
    return base.sort((a, b) => new Date((a.tat && a.tat.dueAt) || 0) - new Date((b.tat && b.tat.dueAt) || 0));
  }, [legalRequests, scope, viewer, showClosed]);

  const [kpi, setKpi] = useState("");
  const counts = {
    total: rows.length + myReqs.length,
    overdue: rows.filter((x) => x.t.status === "Overdue").length,
    near: rows.filter((x) => x.t.nearBreach).length,
    paused: rows.filter((x) => x.t.status === "Paused").length,
  };
  const stages = [...new Set(rows.map((x) => x.r.stage))];
  // The one-line answer to "where do I start?" — the most urgent open item.
  const first = rows.find((x) => x.t.status === "Overdue") || rows.find((x) => x.t.nearBreach);
  // KPI cards double as filters — click a number to see exactly those items.
  const shown = kpi === "overdue" ? rows.filter((x) => x.t.status === "Overdue")
    : kpi === "near" ? rows.filter((x) => x.t.nearBreach)
    : kpi === "paused" ? rows.filter((x) => x.t.status === "Paused")
    : rows;

  // For a business user this page is not the landing screen, but keep it honest.
  const isLegal = !!viewer.legalTeam || viewer.rbac === "head";

  return html`<div class="page">
    <div class="page__head">
      <div>
        <h2 class="page__title">My Tasks</h2>
        <div class="page__sub">
          ${isLegal
            ? `Everything assigned to ${viewer.name.split(" ")[0]}, across every module, most urgent first.`
            : "Your open requests across the Legal teams. Raise a new one from the Raise Request screen."}
        </div>
      </div>
      <${Btn} variant="primary" icon="plus" onClick=${() => navigate("/raise")}>Raise request</${Btn}>
    </div>

    <div class="modkpis">
      <div class=${cx("modkpi modkpi--blue", kpi === "" && "modkpi--active")} onClick=${() => setKpi("")}><div class="modkpi__n">${counts.total}</div><div class="modkpi__l">Open items</div></div>
      <div class=${cx("modkpi modkpi--red", kpi === "overdue" && "modkpi--active")} onClick=${() => setKpi(kpi === "overdue" ? "" : "overdue")}><div class="modkpi__n">${counts.overdue}</div><div class="modkpi__l">Overdue</div></div>
      <div class=${cx("modkpi modkpi--amber", kpi === "near" && "modkpi--active")} onClick=${() => setKpi(kpi === "near" ? "" : "near")}><div class="modkpi__n">${counts.near}</div><div class="modkpi__l">Near breach</div></div>
      <div class=${cx("modkpi modkpi--gray", kpi === "paused" && "modkpi--active")} onClick=${() => setKpi(kpi === "paused" ? "" : "paused")}><div class="modkpi__n">${counts.paused}</div><div class="modkpi__l">Paused with a dept</div></div>
    </div>

    ${first && !showClosed && html`<div class="focusline clickable" onClick=${() => navigate("/m/" + first.r.moduleKey + "/" + first.r.id)}>
      <${Icon} name="bolt" size=15 />
      <span><b>Start here:</b> ${first.r.id} — ${first.r.title}</span>
      <span class="spacer"></span>
      <${TatChip} t=${first.t} />
      <${Icon} name="arrowRight" size=14 />
    </div>`}

    ${myReqs.length > 0 && html`<div class="card" style="padding:0;margin-bottom:16px">
      <div class="row" style="padding:14px 16px 6px;align-items:baseline">
        <span class="panel__title">Legal requests assigned to me</span>
        <span class="tiny muted" style="margin-left:8px">— from the request intake pipeline</span>
        <span class="spacer"></span><${Pill} tone="green">${myReqs.length}</${Pill}>
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Ref</th><th>Request</th><th>Requesting dept</th><th>Stage</th><th>Expected</th></tr></thead>
        <tbody>
          ${myReqs.map((r) => html`<tr key=${r.id} class="clickable" onClick=${() => navigate("/workspace/" + r.id)}>
            <td class="mono tiny">${r.id}</td>
            <td style="max-width:360px"><div class="ellipsis" title=${r.title}>${r.title}</div></td>
            <td class="tiny">${r.department || "—"}</td>
            <td><${Pill} tone=${r.status === "Closed" ? "gray" : "blue"}>${r.stage || r.status}</${Pill}></td>
            <td class="tiny">${r.tat && r.tat.dueAt ? fmt.date(r.tat.dueAt) : "—"}</td>
          </tr>`)}
        </tbody>
      </table></div>
    </div>`}

    <div class="card" style="padding:0">
      <div class="modtoolbar">
        ${scopes.length > 1 && html`<${Segmented} options=${scopes.map((s) => ({ value: s.key, label: s.label }))} value=${scope} onChange=${setScope} />`}
        <span class="spacer"></span>
        ${viewer.rbac === "head" && html`<select class="input input--sm" value=${team} onChange=${(e) => setTeam(e.target.value)}>
          <option value="">Team: all</option>
          ${LEGAL_TEAMS.map((t) => html`<option key=${t.key} value=${t.key}>${t.short}</option>`)}
        </select>`}
        <select class="input input--sm" value=${dept} onChange=${(e) => setDept(e.target.value)}>
          <option value="">Dept: all</option>
          ${masterList(md, "requestingDepartments").map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${stageQ} onChange=${(e) => setStageQ(e.target.value)}>
          <option value="">Stage: all</option>
          ${stages.map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <select class="input input--sm" value=${tstat} onChange=${(e) => setTstat(e.target.value)}>
          <option value="">TAT: all</option>
          ${["Running", "Paused", "Overdue"].map((s) => html`<option key=${s}>${s}</option>`)}
        </select>
        <label class="row tiny muted" style="gap:6px;cursor:pointer">
          <input type="checkbox" checked=${showClosed} onChange=${(e) => setShowClosed(e.target.checked)} /> closed
        </label>
      </div>

      <div class="tablewrap">
        <table class="table">
          <thead><tr>
            <th>Ref</th><th>Matter</th><th>Module</th><th>Team</th><th>Requesting dept</th>
            ${scope !== "mine" && html`<th>Owner</th>`}
            <th>Stage</th><th>TAT</th>
          </tr></thead>
          <tbody>
            ${shown.map(({ r, def, t }) => html`<tr key=${r.id} class=${cx("clickable", "urgrow", "urgrow--" + t.status.toLowerCase())} onClick=${() => navigate("/m/" + r.moduleKey + "/" + r.id)}>
              <td class="mono tiny">${r.id}</td>
              <td style="max-width:320px"><div class="ellipsis" title=${r.title}>${r.title}</div>
                ${r.entityId && html`<div class="tiny muted">${entityName(r.entityId)}</div>`}</td>
              <td><span class="row" style="gap:6px"><${Icon} name=${def.icon} size=14 />${def.label}</span></td>
              <td><${Pill} tone=${teamTone(r.legalTeam)}>${teamShort(r.legalTeam)}</${Pill}></td>
              <td>${r.requestingDept}</td>
              ${scope !== "mine" && html`<td><span class="row" style="gap:7px"><${Avatar} name=${personName(r.owner)} size="xs" />${personName(r.owner)}</span></td>`}
              <td><${Pill} tone=${r.status === "Closed" ? "gray" : "blue"}>${r.stage}</${Pill}></td>
              <td><${TatChip} t=${t} /></td>
            </tr>`)}
          </tbody>
        </table>
        ${rows.length === 0 && html`<${Empty} icon="checkcircle"
          title=${myReqs.length ? "No module tasks" : "Nothing on your plate"}
          text=${myReqs.length ? "Your assigned legal requests are shown above." : (scope === "mine" ? "No open items are assigned to you right now." : "This queue is clear.")} />`}
      </div>
    </div>
  </div>`;
}
