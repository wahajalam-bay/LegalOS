// WORKSTREAM G — per-individual pipelines + the GC's team overview.
//
// "Each individual, their pipeline." Every legal team member gets a kanban of
// THEIR records by lifecycle stage, with per-card TAT health and days-in-stage.
// The team view gives the GC load balance and delayed items per person.
// The lifecycle-reminder feed lives here too, grouped by owner.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Risk, Avatar, Progress, Empty, Metric, Segmented, Tabs } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { HBars, seriesColor } from "../charts.js";
import { navigate } from "../router.js";
import { useCollection } from "../store.js";
import { USERS, nameOf, byId, entityName, lifecyclePathFor, toUsd, BALL_LABEL } from "../data.js";
import { FilterBar, useFilters, applyFilters, TatCell, SubdivisionPill } from "../shared.js";
import { CategoryPill } from "../shared.js";
import { unifiedRows, rowTat, buildStages, currentStageOf } from "../flow.js";
import { tatAnalysis } from "../tat.js";
import { allReminders } from "../reminders.js";

// The legal department (business requesters are excluded from pipelines).
const LEGAL_TEAMS = ["Executive", "Commercial", "Corporate", "Litigation", "Compliance", "Operations"];
const legalTeam = () => USERS.filter((u) => LEGAL_TEAMS.includes(u.team));

const CAPACITY = { u1: 10, u2: 12, u3: 16, u4: 16, u5: 20, u6: 16, u7: 18, u8: 18, u9: 14, u10: 16, u11: 14, u12: 14 };
const capacityOf = (id) => CAPACITY[id] || 14;

/* ---------------- one person's card ---------------- */
function PipeCard({ r, onOpen }) {
  const t = r.__tat;
  return html`<div class="kcard" onClick=${() => onOpen(r.id)} style=${t.status === "Delayed" ? "border-color:color-mix(in srgb, var(--danger) 40%, transparent)" : ""}>
    <div class="kcard__top">
      <span class="kcard__id">${r.id}</span>
      <div class="spacer"></div>
      <${TatCell} tat=${t} compact=${true} />
    </div>
    <div class="kcard__title">${r.title}</div>
    <div class="kcard__meta">
      ${r.contractType && html`<${Pill} tone="indigo">${r.contractType}</${Pill}>`}
      <${Risk} level=${r.risk} />
    </div>
    <div class="kcard__foot">
      <span class="tiny muted"><${Icon} name="building" size=11 style=${{ display: "inline", verticalAlign: "-2px", marginRight: "3px" }} />${entityName(r.entityId)}</span>
      <div class="spacer"></div>
      <span class=${cx("tiny", t.daysInStage > t.days ? "risk--critical" : "muted")} style="font-weight:600">${t.daysInStage}d in stage</span>
    </div>
    ${t.status === "Delayed" && html`<div class="row" style="gap:5px;margin-top:8px;padding:6px 8px;background:var(--danger-bg);border-radius:7px">
      <${Icon} name="alertTriangle" size=12 style=${{ color: "var(--danger)", flex: "none" }} />
      <span class="tiny" style="color:var(--danger);font-weight:600">${t.overdueBy}d over · ${t.blockingStage}</span>
    </div>`}
  </div>`;
}

/* ---------------- an individual's pipeline (kanban by stage) ---------------- */
function IndividualPipeline({ userId, rows, onOpen }) {
  const mine = rows.filter((r) => r.owner === userId);
  // Union of the stage paths actually in play, in canonical order.
  const stages = useMemo(() => {
    const order = [];
    mine.forEach((r) => lifecyclePathFor(r.requestType).forEach((s) => { if (!order.includes(s)) order.push(s); }));
    const canonical = ["Intake", "Triage", "Commercial Review", "Legal Review", "Redlining", "Drafting", "Notice Drafting", "Negotiation", "Approval", "Signature", "Notice Served", "Executed", "Repository", "Closed"];
    return canonical.filter((s) => order.includes(s) && mine.some((r) => currentStageOf(r) === s));
  }, [rows, userId]);

  const u = byId(userId);
  const cap = capacityOf(userId);
  const load = Math.round((mine.length / cap) * 100);
  const delayed = mine.filter((r) => r.__tat.status === "Delayed");

  if (!mine.length) {
    return html`<div class="card card--pad">
      <div class="row" style="gap:11px">
        <${Avatar} name=${u.name} size="md" />
        <div style="flex:1;min-width:0"><div class="strong" style="font-size:13.5px">${u.name}</div><div class="tiny muted">${u.role}</div></div>
        <${Pill} tone="gray">no open work</${Pill}>
      </div>
    </div>`;
  }

  return html`<div class="col" style="gap:12px">
    <div class="card card--pad col" style="gap:11px">
      <div class="row" style="gap:11px">
        <${Avatar} name=${u.name} size="lg" />
        <div style="flex:1;min-width:0">
          <div class="strong" style="font-size:15px">${u.name}</div>
          <div class="tiny muted">${u.role} · ${u.team} · ${u.country}</div>
        </div>
        <div class="col" style="gap:4px;align-items:flex-end">
          <span class="strong" style="font-size:15px">${mine.length}/${cap}</span>
          <span class="tiny muted">open records</span>
        </div>
      </div>
      <div class="loadbar"><div style=${`width:${Math.min(100, load)}%;background:${load > 95 ? "var(--danger)" : load > 80 ? "var(--warning)" : "var(--success)"}`}></div></div>
      <div class="row">
        <span class="tiny muted">${load}% of capacity</span>
        <div class="spacer"></div>
        ${delayed.length > 0
          ? html`<span class="tiny strong" style="color:var(--danger)">${delayed.length} delayed · ${[...new Set(delayed.map((d) => d.__tat.blockingStage))].join(", ")}</span>`
          : html`<span class="tiny strong" style="color:var(--success)">all within TAT</span>`}
      </div>
    </div>

    <div class="kanban">
      ${stages.map((s) => {
        const cards = mine.filter((r) => currentStageOf(r) === s);
        const late = cards.filter((c) => c.__tat.status === "Delayed").length;
        return html`<div key=${s} class="kcol">
          <div class="kcol__head">
            <span class="kcol__dot" style=${`background:${late ? "var(--danger)" : "var(--brand)"}`}></span>
            <span class="kcol__title">${s}</span>
            <span class="kcol__count">${cards.length}</span>
            <div class="spacer"></div>
            ${late > 0 && html`<${Pill} tone="red">${late}</${Pill}>`}
          </div>
          <div class="kcol__list">
            ${cards.map((r) => html`<${PipeCard} key=${r.id} r=${r} onOpen=${onOpen} />`)}
          </div>
        </div>`;
      })}
    </div>
  </div>`;
}

/* ---------------- the GC's team overview ---------------- */
function TeamOverview({ rows, contracts, onPick }) {
  const team = legalTeam();
  const stats = team.map((u) => {
    const mine = rows.filter((r) => r.owner === u.id);
    const delayed = mine.filter((r) => r.__tat.status === "Delayed");
    const due = mine.filter((r) => r.__tat.status === "Due Today");
    const cap = capacityOf(u.id);
    return {
      u, count: mine.length, cap,
      load: cap ? Math.round((mine.length / cap) * 100) : 0,
      delayed: delayed.length,
      due: due.length,
      value: mine.reduce((s, r) => s + toUsd(r.value || 0, r.currency), 0),
      worst: delayed.sort((a, b) => b.__tat.overdueBy - a.__tat.overdueBy)[0] || null,
    };
  }).filter((s) => s.count > 0 || s.cap)
    .sort((a, b) => b.load - a.load);

  const overloaded = stats.filter((s) => s.load > 90);
  const headroom = stats.filter((s) => s.load < 60 && s.cap);
  // Nominal people, one hue — except over-capacity, which is a STATUS reading and
  // correctly wears the status colours (the load % beside each bar is the label).
  const loadBars = stats.filter((s) => s.count).map((s) => ({ label: s.u.name.split(" ")[0], value: s.count, color: s.load > 95 ? "var(--danger)" : s.load > 80 ? "var(--warning)" : seriesColor(0) }));
  const delayBars = stats.filter((s) => s.delayed).map((s, i) => ({ label: s.u.name.split(" ")[0], value: s.delayed, color: "#dc2626" }));

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: stats.filter((s) => s.count).length, label: "Team members with open work" },
      { value: rows.length, label: "Open records" },
      { value: stats.reduce((s, x) => s + x.delayed, 0), label: "Delayed across the team" },
      { value: overloaded.length, label: "Over 90% capacity" },
      { value: headroom.length, label: "With headroom" },
    ]} />

    ${overloaded.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
      <${Icon} name="users" size=17 />
      <div style="flex:1">
        <div class="strong tiny">Load is concentrated</div>
        <div class="tiny" style="margin-top:3px;opacity:.9">
          ${overloaded.map((s) => `${s.u.name} at ${s.load}% (${s.count}/${s.cap})`).join(" · ")}.
          ${headroom.length ? ` Headroom with ${headroom.slice(0, 2).map((s) => s.u.name.split(" ")[0]).join(" and ")}.` : ""}
        </div>
      </div>
    </div>`}

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <div class="card card--pad col" style="gap:12px">
        <span class="strong">Open records per person</span>
        <${HBars} data=${loadBars} format=${(v) => v + " records"} />
      </div>
      <div class="card card--pad col" style="gap:12px">
        <span class="strong">Delayed items per person</span>
        ${delayBars.length
          ? html`<${HBars} data=${delayBars} format=${(v) => v + " delayed"} color="#dc2626" />`
          : html`<div class="tiny muted" style="padding:12px 0">Nothing is past its fixed TAT right now.</div>`}
      </div>
    </div>

    <div class="card">
      <div class="card__head"><div class="card__title">Team pipeline overview</div><div class="card__sub">Click a row to open that person's pipeline</div></div>
      <div class="card__body" style="padding:0">
        <${DataTable} onRow=${(s) => onPick(s.u.id)} rows=${stats}
          columns=${[
            { key: "u", label: "Team member", render: (s) => html`<div class="row" style="gap:10px"><${Avatar} name=${s.u.name} size="md" /><div style="min-width:0"><div class="cell-strong">${s.u.name}</div><div class="tiny muted">${s.u.role}</div></div></div>` },
            { key: "team", label: "Desk", render: (s) => html`<span class="tiny">${s.u.team}</span>` },
            { key: "count", label: "Open", align: "right", width: "62px", render: (s) => html`<span class="strong">${s.count}</span>` },
            { key: "load", label: "Load", width: "150px", render: (s) => html`<div class="col" style="gap:4px">
                <div class="loadbar"><div style=${`width:${Math.min(100, s.load)}%;background:${s.load > 95 ? "var(--danger)" : s.load > 80 ? "var(--warning)" : "var(--success)"}`}></div></div>
                <span class="tiny muted">${s.count}/${s.cap} · ${s.load}%</span>
              </div>` },
            { key: "delayed", label: "Delayed", width: "78px", render: (s) => s.delayed ? html`<${Pill} tone="red">${s.delayed}</${Pill}>` : html`<span class="tiny muted">—</span>` },
            { key: "due", label: "Due today", width: "82px", render: (s) => s.due ? html`<${Pill} tone="amber">${s.due}</${Pill}>` : html`<span class="tiny muted">—</span>` },
            { key: "worst", label: "Worst blocker", render: (s) => s.worst
              ? html`<div class="wrapcell"><div class="tiny strong">${s.worst.__tat.overdueBy}d — ${s.worst.__tat.blockingStage}</div><div class="tiny muted">${s.worst.id} · ${s.worst.title.slice(0, 40)}${s.worst.title.length > 40 ? "…" : ""}</div></div>`
              : html`<span class="tiny muted">none</span>` },
            { key: "value", label: "Value owned", align: "right", render: (s) => html`<span class="strong">${fmt.money(s.value)}</span>` },
          ]} />
      </div>
    </div>
  </div>`;
}

/* ---------------- lifecycle reminders, grouped by owner ---------------- */
function RemindersView({ contracts }) {
  const reminders = useMemo(() => allReminders(contracts), [contracts]);
  const groups = useMemo(() => {
    const m = new Map();
    reminders.forEach((r) => {
      const k = r.owner || "unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [contracts]);

  const overdue = reminders.filter((r) => r.dueDays < 0);
  const autoRenew = reminders.filter((r) => r.autoRenew && r.kind === "notice");

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: reminders.length, label: "Live reminders" },
      { value: reminders.filter((r) => r.kind === "notice").length, label: "Notice windows" },
      { value: reminders.filter((r) => r.kind === "expiry").length, label: "Expiries" },
      { value: reminders.filter((r) => r.kind === "obligation").length, label: "Obligations" },
      { value: overdue.length, label: "Already past" },
    ]} />

    ${autoRenew.length > 0 && html`<div class="banner banner--warn" style="align-items:flex-start">
      <${Icon} name="refresh" size=17 />
      <div>
        <div class="strong tiny">${autoRenew.length} contract${autoRenew.length === 1 ? "" : "s"} will AUTO-RENEW unless notice is served</div>
        <div class="tiny" style="margin-top:3px;opacity:.9">${autoRenew.map((r) => r.recordId).join(" · ")}</div>
      </div>
    </div>`}

    ${reminders.length === 0
      ? html`<${Empty} icon="bell" title="No lifecycle reminders" text="Nothing is inside a notice window or expiring in the next 90 days." />`
      : groups.map(([owner, items]) => html`<div key=${owner} class="card">
        <div class="card__head">
          ${owner !== "unassigned" && html`<${Avatar} name=${nameOf(owner)} size="md" />`}
          <div style="min-width:0">
            <div class="card__title">${owner === "unassigned" ? "Unassigned" : nameOf(owner)}</div>
            <div class="card__sub">${items.length} reminder${items.length === 1 ? "" : "s"}</div>
          </div>
          <div class="card__actions">${items.filter((i) => i.dueDays < 0).length > 0 && html`<${Pill} tone="red">${items.filter((i) => i.dueDays < 0).length} past</${Pill}>`}</div>
        </div>
        <div class="card__body col" style="gap:6px">
          ${items.map((r) => html`<div key=${r.id} class="docrow clickable" onClick=${() => navigate(r.path)}>
            <div class="notif__ico" style=${`width:32px;height:32px;flex:none;background:${r.tone === "red" ? "var(--danger-bg)" : r.tone === "amber" ? "var(--warning-bg)" : "var(--brand-soft)"};color:${r.tone === "red" ? "var(--danger)" : r.tone === "amber" ? "var(--warning)" : "var(--brand)"}`}>
              <${Icon} name=${r.icon} size=15 />
            </div>
            <div style="flex:1;min-width:0">
              <div class="strong tiny">${r.title}</div>
              <div class="tiny muted">${r.detail}</div>
            </div>
            <${Pill} tone=${r.kind === "notice" ? "orange" : r.kind === "obligation" ? "indigo" : "gray"}>${r.kind}</${Pill}>
            <span class=${cx("tiny strong", r.dueDays < 0 && "risk--critical")} style="width:74px;text-align:right">${r.dueDays < 0 ? Math.abs(r.dueDays) + "d past" : "in " + r.dueDays + "d"}</span>
          </div>`)}
        </div>
      </div>`)}
  </div>`;
}

/* ============================================================
   The page
   ============================================================ */
export default function Pipelines() {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  const [tab, setTab] = useState("team");
  const [who, setWho] = useState("u10");
  const { filters, patch, toggle, clear } = useFilters("pipelines");

  const ctx = { requests, matters, contracts, repository, licenses };

  // Open work only — a pipeline is about what is moving.
  const rows = useMemo(() => unifiedRows(requests, matters)
    .map((u) => ({ ...u.record, id: u.id, title: u.title, __tat: rowTat(u.record, ctx) }))
    .filter((r) => !r.__tat.done), [requests, matters, contracts, repository]);

  const filtered = applyFilters(rows, filters, { searchKeys: ["title", "counterparty", "id", "contractType"] });

  const team = legalTeam();
  const withWork = team.filter((u) => rows.some((r) => r.owner === u.id));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Team Pipelines"
      sub="Each individual's pipeline by lifecycle stage, the load balance across the desk, and every lifecycle reminder in one feed."
      actions=${html`<${Btn} variant="ghost" icon="layers" onClick=${() => navigate("/workspace")}>Legal Workspace</${Btn}>`} />

    <div style="margin-bottom:16px">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "team", label: "Team overview", icon: "users" },
        { key: "individual", label: "Individual pipeline", icon: "columns", count: withWork.length },
        { key: "reminders", label: "Lifecycle reminders", icon: "bell", count: allReminders(contracts).length },
      ]} />
    </div>

    ${tab !== "reminders" && html`<${FilterBar} module="pipelines" filters=${filters} onPatch=${patch} onToggle=${toggle} onClear=${clear}
      dims=${["entities", "contractTypes", "subdivisions", "categories", "risks", "tatStatuses"]}
      dateFields=${[{ key: "dueDate", label: "Due date" }, { key: "requestDate", label: "Request date" }]}
      rows=${rows} placeholder="Search open work…" />`}

    ${tab === "team" && html`<${TeamOverview} rows=${filtered} contracts=${contracts} onPick=${(id) => { setWho(id); setTab("individual"); }} />`}

    ${tab === "individual" && html`<div class="col" style="gap:16px">
      <div class="lens">
        ${withWork.map((u) => {
          const mine = filtered.filter((r) => r.owner === u.id);
          const late = mine.filter((r) => r.__tat.status === "Delayed").length;
          return html`<button key=${u.id} class=${cx(who === u.id && "active")} onClick=${() => setWho(u.id)}>
            <${Avatar} name=${u.name} size="sm" />
            ${u.name.split(" ")[0]}
            <span class="drill__n">${mine.length}</span>
            ${late > 0 && html`<${Pill} tone="red">${late}</${Pill}>`}
          </button>`;
        })}
      </div>
      <${IndividualPipeline} userId=${who} rows=${filtered} onOpen=${(id) => navigate("/workspace/" + id)} />
    </div>`}

    ${tab === "reminders" && html`<${RemindersView} contracts=${contracts} />`}
  </div>`;
}
