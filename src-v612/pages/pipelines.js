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
import { TatCell, SubdivisionPill } from "../shared.js";
import { RegisterShell } from "../register.js";
import { pipelineFields, pipelineSearchKeys, pipelineViews } from "../registerdefs.js";
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
        <div style="flex:1;min-width:0"><div class="panel__title">${u.name}</div><div class="tiny muted">${u.role}</div></div>
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

/* ---------------- on time vs delayed, on the CLOSED work ---------------- */

/* WHAT "ON TIME" MEANS HERE, AND WHY IT IS NOT THE TAT STATUS.
   computeTat deliberately forces a record that has reached its terminal stage
   to "On Track" — it has landed, so it cannot still be running late. Counting
   that as "finished on time" would report every closed record as on time and
   the rate would be 100% on every desk, for ever. So this compares the day the
   record ACTUALLY landed against the day it was due:

     · landed  — the date it entered its terminal stage, or the date the record
                 itself records as its close;
     · due     — the TAT due date fixed when the clock started.

   A record that carries neither is NOT counted as on time. It is counted as
   "no dates on file", said out loud on the card, because a rate computed over
   records whose outcome nobody recorded is a made-up number. */
function closedOutcomes(requests, matters, ctx) {
  const out = new Map();
  for (const u of unifiedRows(requests, matters)) {
    const rec = u.record;
    const stages = buildStages(rec, ctx);
    const t = rowTat(rec, ctx);
    if (!t.done) continue;                       // still open — the left card's business
    const owner = rec.owner;
    if (!owner) continue;
    const path = lifecyclePathFor(rec.requestType) || [];
    const terminal = path[path.length - 1];
    const landed = (stages.find((x) => x.name === terminal) || {}).enteredAt
      || rec.closedAt || rec.completedAt || rec.executedAt || null;
    const o = out.get(owner) || { owner, onTime: 0, late: 0, unknown: 0, worstBy: 0 };
    if (!landed || !t.dueAt) o.unknown += 1;
    else if (new Date(landed) <= new Date(t.dueAt)) o.onTime += 1;
    else {
      o.late += 1;
      const by = Math.round((new Date(landed) - new Date(t.dueAt)) / 86400000);
      if (by > o.worstBy) o.worstBy = by;
    }
    out.set(owner, o);
  }
  return [...out.values()];
}

/* One row per person: how much of their finished work landed on time, as a
   two-tone bar you can read across the team without doing arithmetic. */
function OnTimeCard({ stats, byOwner }) {
  const rows = stats
    .map((s) => ({ s, o: byOwner.get(s.u.id) }))
    .filter((x) => x.o && (x.o.onTime + x.o.late + x.o.unknown) > 0)
    .sort((a, b) => {
      const ra = a.o.onTime + a.o.late ? a.o.onTime / (a.o.onTime + a.o.late) : -1;
      const rb = b.o.onTime + b.o.late ? b.o.onTime / (b.o.onTime + b.o.late) : -1;
      return ra - rb;                            // the desk that needs looking at, first
    });
  const tot = rows.reduce((a, x) => ({
    onTime: a.onTime + x.o.onTime, late: a.late + x.o.late, unknown: a.unknown + x.o.unknown,
  }), { onTime: 0, late: 0, unknown: 0 });
  const judged = tot.onTime + tot.late;

  return html`<div class="card card--pad col" style="gap:12px">
    <div class="row" style="align-items:baseline;gap:8px">
      <span class="strong">Finished on time, per person</span>
      <div class="spacer"></div>
      ${judged > 0
        ? html`<span class="tiny strong">${Math.round((tot.onTime / judged) * 100)}% on time</span>
               <span class="tiny muted">${tot.onTime} of ${judged}</span>`
        : html`<span class="tiny muted">nothing closed yet</span>`}
    </div>
    ${rows.length === 0
      ? html`<div class="tiny muted" style="padding:12px 0">
          No work on this desk has been closed out yet, so there is nothing to judge on time
          or late. This counts closed records only — what is still running is on the left.
        </div>`
      : html`<div class="col" style="gap:12px">
          ${rows.map(({ s, o }) => {
            const j = o.onTime + o.late;
            const pct = j ? Math.round((o.onTime / j) * 100) : null;
            return html`<div key=${s.u.id} class="col" style="gap:5px">
              <div class="row" style="gap:8px;align-items:baseline">
                <span style="font-size:12.5px;font-weight:500">${s.u.name.split(" ")[0]}</span>
                <div class="spacer"></div>
                ${pct == null
                  ? html`<span class="tiny muted">no dates on file</span>`
                  : html`<span class="strong tiny">${pct}% on time</span>
                         <span class="tiny muted">${o.onTime} on time · ${o.late} late</span>`}
              </div>
              <div class="otbar" role="img"
                aria-label=${`${s.u.name}: ${o.onTime} finished on time, ${o.late} late` + (o.unknown ? `, ${o.unknown} with no dates on file` : "")}>
                ${o.onTime > 0 && html`<span class="otbar__on" style=${`flex:${o.onTime}`}></span>`}
                ${o.late > 0 && html`<span class="otbar__late" style=${`flex:${o.late}`}></span>`}
                ${o.unknown > 0 && html`<span class="otbar__unk" style=${`flex:${o.unknown}`}></span>`}
              </div>
              ${o.late > 0 && html`<span class="tiny muted">worst was ${o.worstBy}d past its due date</span>`}
            </div>`;
          })}
        </div>`}
    ${tot.unknown > 0 && html`<div class="tiny muted" style="border-top:1px solid var(--border);padding-top:9px">
      ${tot.unknown} closed record${tot.unknown === 1 ? "" : "s"} carry no close date or no due date, so
      ${tot.unknown === 1 ? "it is" : "they are"} not counted either way rather than being assumed on time.
    </div>`}
  </div>`;
}

/* ---------------- the GC's team overview ---------------- */
function TeamOverview({ rows, contracts, outcomes, onPick }) {
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
  /* THE OTHER HALF OF THE PICTURE. "Delayed items per person" was the same
     reading as the Delayed column two cards down and the red pill in the
     stat strip — the same number, three times, and all three about work that
     is STILL open. What nobody could answer from this page was the question a
     head of department actually asks: of the work this desk has finished, how
     much of it landed on time. That is `outcomes`, built from the CLOSED
     records and judged on when each one actually landed against its own due
     date — never on the TAT status, which forces a closed record to "On Track"
     whatever day it finished. */
  const byOwner = new Map((outcomes || []).map((o) => [o.owner, o]));

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: stats.filter((s) => s.count).length, label: "Team members with open work" },
      { value: rows.length, label: "Open tasks" },
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
        <span class="strong">Open tasks per person</span>
        <${HBars} data=${loadBars} format=${(v) => v + (v === 1 ? " task" : " tasks")} />
      </div>
      <${OnTimeCard} stats=${stats} byOwner=${byOwner} />
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
export default function Pipelines({ id }) {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  // Deep link: /pipelines/<userId> opens that person's pipeline directly —
  // owner names across the OS link here.
  const deepWho = id && /^u\d+$/.test(id) ? id : null;
  const [tab, setTab] = useState(deepWho ? "individual" : "team");
  const [who, setWho] = useState(deepWho || "u10");

  const ctx = { requests, matters, contracts, repository, licenses };

  // Open work only — a pipeline is about what is moving.
  const rows = useMemo(() => unifiedRows(requests, matters)
    .map((u) => ({ ...u.record, id: u.id, title: u.title, __tat: rowTat(u.record, ctx) }))
    .filter((r) => !r.__tat.done), [requests, matters, contracts, repository]);

  /* The finished work, which the rows above deliberately exclude. Kept out of
     `rows` so the pipeline, the load and the filters stay about what is moving
     — but the department still has to be able to see how the closed work
     landed, and that is what the on-time card reads. */
  const outcomes = useMemo(() => closedOutcomes(requests, matters, ctx),
    [requests, matters, contracts, repository, licenses]);

  const pipeFields = useMemo(() => pipelineFields({ nameOf, entityName }), []);
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

    ${tab !== "reminders"
      ? html`<${RegisterShell}
          ns="pipe" rows=${rows}
          fields=${pipeFields}
          views=${pipelineViews} searchKeys=${pipelineSearchKeys}
          searchPlaceholder="Search open work…"
          noun=${["open item", "open items"]}
          exportName="team-pipelines">
          ${(f) => html`<div>
            ${tab === "team" && html`<${TeamOverview} rows=${f.filtered} contracts=${contracts} outcomes=${outcomes} onPick=${(uid) => { setWho(uid); setTab("individual"); }} />`}
            ${tab === "individual" && html`<div class="col" style="gap:16px">
              <div class="lens">
                ${withWork.map((u) => {
                  const mine = f.filtered.filter((r) => r.owner === u.id);
                  const late = mine.filter((r) => r.__tat.status === "Delayed").length;
                  return html`<button key=${u.id} type="button" class=${cx(who === u.id && "active")}
                    aria-pressed=${who === u.id ? "true" : "false"} onClick=${() => setWho(u.id)}>
                    <${Avatar} name=${u.name} size="sm" />
                    ${u.name.split(" ")[0]}
                    <span class="drill__n">${mine.length}</span>
                    ${late > 0 && html`<${Pill} tone="red">${late}</${Pill}>`}
                  </button>`;
                })}
              </div>
              <${IndividualPipeline} userId=${who} rows=${f.filtered} onOpen=${(rid) => navigate("/workspace/" + rid)} />
            </div>`}
          </div>`}
        </${RegisterShell}>`
      : null}

    ${tab === "reminders" && html`<${RemindersView} contracts=${contracts} />`}
  </div>`;
}
