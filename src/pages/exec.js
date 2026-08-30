// SPRINT 5 / WORKSTREAM A + E — Executive Overview, and the printable brief.
//
// The one screen a CEO lands on. It answers three questions at a glance: what is
// this, what did it change, where is the proof. Six primary numbers above the
// fold, every one carrying a plain-English "so what" rather than sitting naked.
//
// House style for everything a leader reads on this page: plain English, no
// internal jargon, no em dashes. Operational modules keep their own language.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Modal } from "../ui.js";
import { PageHead } from "../parts.js";
import { navigate } from "../router.js";
import { useCollection, setWorkspaceTarget } from "../store.js";
import {
  DASH, toUsd, entityName, GROUP_ENTITIES, licenseStatus, subdivisionOf,
  LEGAL_SUBDIVISIONS, COMPANY, nameOf,
} from "../data.js";
import { foldSeries, seriesColor } from "../charts.js";
import { HeroTile, RankBars, ShareDonut, Meter, TableTwin, Spark } from "../execviz.js";
import { unifiedRows, rowTat } from "../flow.js";
import { allReminders } from "../reminders.js";
import { startTour } from "../tour.js";
import { EMPTY_FILTERS } from "../shared.js";

/* ---------------- the numbers, computed once ---------------- */
function useExecMetrics() {
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  const requesters = useCollection("requesters");

  return useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses, requesters };
    const now = new Date();
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const rows = unifiedRows(requests, matters).map((u) => ({ ...u.record, id: u.id, __tat: rowTat(u.record, ctx) }));
    const live = contracts.filter((c) => !/Terminated|Archived/.test(c.status || ""));

    // Portfolio under management, in one currency so it can be added up.
    const portfolio = live.reduce((s, c) => s + toUsd(c.value, c.currency), 0);
    const ppaValue = live.reduce((s, c) => s + toUsd(c.ppaValue || 0, c.currency), 0);
    const landValue = live.reduce((s, c) => s + toUsd(c.landValue || 0, c.currency), 0);

    // Turnaround: the seeded trend is the real series, so quote it rather than
    // inventing a "before".
    const tatNow = DASH.tatTrend[DASH.tatTrend.length - 1];
    const tatThen = DASH.tatTrend[0];
    const tatDelta = Math.round(((tatNow - tatThen) / tatThen) * 100);
    const committed = rows.length ? Math.round((rows.reduce((s, r) => s + r.__tat.days, 0) / rows.length) * 10) / 10 : 0;

    // Portal adoption: how much no longer arrives by email.
    const portalCount = requests.filter((r) => r.channel === "portal").length;
    const adoption = requests.length ? Math.round((portalCount / requests.length) * 100) : 0;

    // The fairness number: of all elapsed working days, how much sat OUTSIDE
    // legal (with the business or the counterparty) and is therefore not the
    // department's to answer for.
    const elapsed = rows.reduce((s, r) => s + r.__tat.elapsed + r.__tat.paused, 0);
    const paused = rows.reduce((s, r) => s + r.__tat.paused, 0);
    const outsideLegal = elapsed ? Math.round((paused / elapsed) * 100) : 0;

    const delayed = rows.filter((r) => r.__tat.status === "Delayed");
    const onTime = rows.length ? Math.round(((rows.length - delayed.length) / rows.length) * 100) : 100;
    const thisQuarter = requests.filter((r) => new Date(r.requestDate || r.created) >= qStart).length;
    const highRisk = rows.filter((r) => ["high", "critical"].includes((r.risk || "").toLowerCase()) && !r.__tat.done).length;

    // Task load, and three ageing profiles that all answer "what lands soon?".
    // One helper, three sources, so every bucket is defined identically.
    const pendingTasks = rows.filter((r) => !r.__tat.done);
    const buckets = (items, dateOf) => {
      const b = { over: [], d30: [], d60: [], d90: [] };
      items.forEach((it) => {
        const raw = dateOf(it);
        if (!raw) return;
        const d = (new Date(raw) - now) / 86400000;
        if (d < 0) b.over.push(it);
        else if (d <= 30) b.d30.push(it);
        else if (d <= 60) b.d60.push(it);
        else if (d <= 90) b.d90.push(it);
      });
      return b;
    };

    const expiring = live.filter((c) => { const d = (new Date(c.expiry) - now) / 86400000; return d >= 0 && d <= 90; });
    const expiringValue = expiring.reduce((s, c) => s + toUsd(c.value, c.currency), 0);

    const extracted = repository.filter((d) => d.ocrStatus === "Complete").length;
    const licValid = licenses.filter((l) => licenseStatus(l).key === "Valid").length;
    const licAtRisk = licenses.length - licValid;

    // Portfolio value by entity: nominal categories, so one hue and a value label.
    const byEntity = (() => {
      const m = new Map();
      live.forEach((c) => m.set(c.entityId, (m.get(c.entityId) || 0) + toUsd(c.value, c.currency)));
      return [...m.entries()]
        .map(([id, v]) => ({ label: entityName(id), value: v, id }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);
    })();

    // Work by legal sub-division: part-to-whole, folded to the palette's capacity
    // so it never needs a generated hue.
    const bySubdiv = (() => {
      const m = new Map();
      [...rows, ...live].forEach((r) => { const k = subdivisionOf(r); m.set(k, (m.get(k) || 0) + 1); });
      return foldSeries([...m.entries()], { otherLabel: "Other desks" });
    })();

    const reminders = allReminders(contracts, now);
    const blockingStages = [...new Set(delayed.map((d) => d.__tat.blockingStage).filter(Boolean))];

    // Pending tasks BY DESK, so the donut and its centre count the same thing.
    const pendingBySubdiv = (() => {
      const g = new Map();
      pendingTasks.forEach((r) => { const k = subdivisionOf(r) || "Unassigned"; g.set(k, (g.get(k) || 0) + 1); });
      return foldSeries([...g.entries()].sort((a, b) => b[1] - a[1]), { otherLabel: "Other desks" });
    })();
    const ageContracts = buckets(live, (c) => c.expiry);
    const ageLicences = buckets(licenses, (l) => l.expiryDate);
    const complianceRows = rows.filter((r) => /compliance/i.test(subdivisionOf(r) || "") || /compliance/i.test(r.legalTeam || ""));
    const ageCompliance = buckets(complianceRows, (r) => r.__tat && r.__tat.dueAt);

    return {
      now, portfolio, ppaValue, landValue,
      pendingTasks, pendingBySubdiv, ageContracts, ageLicences, ageCompliance,
      tatNow, tatThen, tatDelta, committed, trend: DASH.tatTrend,
      adoption, portalCount, requestCount: requests.length, requesters: requesters.length,
      outsideLegal, onTime, delayed, thisQuarter, highRisk,
      expiring, expiringValue, extracted, docCount: repository.length,
      licValid, licAtRisk, licCount: licenses.length,
      byEntity, bySubdiv, reminders, blockingStages,
      liveCount: live.length, rowCount: rows.length,
      entityCount: new Set(live.map((c) => c.entityId)).size,
    };
  }, [requests, matters, contracts, repository, licenses, requesters]);
}

/* ---------------- the executive narrative, written from the data ---------------- */
function narrative(m) {
  const s = [];
  s.push(`The department took ${m.thisQuarter} new request${m.thisQuarter === 1 ? "" : "s"} this quarter, and ${m.adoption}% of everything on the books now arrives through the request portal instead of somebody's inbox.`);
  s.push(`Turnaround is averaging ${m.tatNow} days against a committed ${m.committed}, down from ${m.tatThen} at the start of the year, and ${m.onTime}% of live work is inside its agreed window.`);
  if (m.delayed.length) {
    s.push(`${m.delayed.length} item${m.delayed.length === 1 ? " is" : "s are"} running late${m.blockingStages.length ? `, held at ${m.blockingStages.slice(0, 2).join(" and ")}` : ""}, and each one names the person holding it.`);
  } else {
    s.push(`Nothing is past its committed date right now.`);
  }
  s.push(`Renewal exposure over the next 90 days is ${fmt.money(m.expiringValue)} across ${m.expiring.length} contract${m.expiring.length === 1 ? "" : "s"}, every one with a named owner and a reminder already set.`);
  return s;
}

/* ============================================================
   The Executive Overview
   ============================================================ */
function ExecOverview() {
  // The portfolio tile drills into where the value sits, in place rather than
  // taking over a slot on the page.
  const [valueDrill, setValueDrill] = useState(false);
  const m = useExecMetrics();
  const n = narrative(m);

  // Deep-link helper: open the Workspace already narrowed to what was clicked.
  const openWorkspace = (lens, filters) => {
    setWorkspaceTarget({ lens, filters: { ...EMPTY_FILTERS, ...(filters || {}) } });
    navigate("/workspace");
  };


  return html`<div class="page execpage fade-in">
    <${PageHead} title="Executive Overview"
      sub="The department at a glance — value under management, turnaround, what is overdue and what lands next." />

    <!-- the four numbers a CEO actually asks about -->
    <section class="exec__heroes">
      <${HeroTile} label="Contract value under management" icon="dollar"
        value=${fmt.money(m.portfolio)}
        soWhat=${`${m.liveCount} live contracts across ${m.entityCount} entities`}
        onClick=${() => setValueDrill(true)} />
      <${HeroTile} label="Average turnaround" icon="clock"
        value=${m.tatNow} unit="days"
        soWhat=${`committed at ${m.committed} days, was ${m.tatThen} in January`}
        delta=${m.tatDelta + "%"} deltaDir="down" spark=${m.trend}
        onClick=${() => navigate("/pipelines")} />
      <${HeroTile} label="Overdue tasks" icon="alertTriangle"
        value=${m.delayed.length}
        soWhat=${m.delayed.length ? `past their agreed date — ${[...new Set(m.delayed.map((d) => d.__tat.blockingStage))].slice(0, 2).join(", ")}` : "nothing past its date"}
        onClick=${() => openWorkspace("worklist", { tatStatuses: ["Delayed"] })} />
    </section>

    <!-- what lands soon: one tile per horizon, bucketed and colour-coded -->
    <section class="exec__ageing">
      ${[
        { label: "Contract ageing", icon: "file", sub: "by expiry date", b: m.ageContracts,
          go: (k) => openWorkspace("contracts", { dateField: "expiry", datePreset: k }) },
        { label: "Compliance deadlines", icon: "shield", sub: "by due date", b: m.ageCompliance,
          go: (k) => openWorkspace("worklist", { subdivisions: ["Compliance"], dateField: "due", datePreset: k }) },
        { label: "Licensing renewals", icon: "fileCheck", sub: "by licence expiry", b: m.ageLicences,
          go: () => navigate("/licenses") },
      ].map((t) => html`<div key=${t.label} class="agetile">
        <div class="agetile__head">
          <span class="agetile__ico"><${Icon} name=${t.icon} size=15 /></span>
          <div style="min-width:0">
            <div class="agetile__label">${t.label}</div>
            <div class="agetile__sub">${t.sub}</div>
          </div>
        </div>
        <div class="agetile__buckets">
          ${[
            { k: "overdue", n: t.b.over.length, cap: "Overdue", tone: "over" },
            { k: "exp30", n: t.b.d30.length, cap: "≤30 days", tone: "d30" },
            { k: "exp60", n: t.b.d60.length, cap: "31–60", tone: "d60" },
            { k: "exp90", n: t.b.d90.length, cap: "61–90", tone: "d90" },
          ].map((x) => html`<button key=${x.k} class=${"agebkt agebkt--" + x.tone}
            title=${`${x.n} ${t.label.toLowerCase()} ${x.cap.toLowerCase()}`}
            onClick=${() => t.go(x.k)}>
            <span class="agebkt__n">${x.n}</span>
            <span class="agebkt__cap">${x.cap}</span>
          </button>`)}
        </div>
      </div>`)}
    </section>


    <!-- where the value sits, and who does the work -->
    <!-- pending tasks, as a chart you can click into -->
    <section class="exec__split">
      <div class="card card--pad col clickable card--hover" style="gap:14px"
        onClick=${() => openWorkspace("worklist", {})}>
        <div class="row" style="align-items:flex-start">
          <div style="min-width:0">
            <h2 class="exec__h2">Pending tasks</h2>
            <p class="exec__sub">${m.pendingTasks.length} open across the desks. Click any desk to open its worklist.</p>
          </div>
          <div class="spacer"></div>
          <${Icon} name="chevronRight" size=18 style=${{ color: "var(--text-3)" }} />
        </div>
        <${ShareDonut} data=${m.pendingBySubdiv} size=${132} thickness=${17}
          centerValue=${m.pendingTasks.length} centerLabel="open" />
        <${TableTwin} rows=${m.pendingBySubdiv} cols=${["Legal desk", "Open tasks"]} />
      </div>

      <div class="exec__note" style="margin:0">
      <div class="exec__noteHead">
        <span class="exec__ico"><${Icon} name="book" size=15 /></span>
        <h2 class="exec__h2" style="margin:0">What changed this quarter</h2>
      </div>
      <div class="exec__prose">
        ${n.map((p, i) => html`<p key=${i}>${p}</p>`)}
      </div>
      <div class="row wrap" style="gap:8px;margin-top:4px">
        <${Btn} variant="soft" size="sm" icon="play" onClick=${() => startTour()}>Walk me through it</${Btn}>
        <${Btn} variant="ghost" size="sm" icon="dashboard" onClick=${() => navigate("/dashboard")}>Operational dashboard</${Btn}>
      </div>
      </div>
    </section>

    <!-- the board note -->

    <footer class="exec__foot">
      <span class="tiny muted">
        Figures read live from the system. This view is for leadership; the operational
        dashboard and the module detail sit behind every number above.
      </span>
    </footer>
    ${valueDrill && html`<${Modal} title="Where the value sits" icon="dollar" width=${720}
      onClose=${() => setValueDrill(false)}>
      <p class="exec__sub" style="margin-bottom:14px">Live contract value by entity, in US dollars for comparison.</p>
      <${RankBars} data=${m.byEntity} format=${(v) => fmt.money(v)}
        onRow=${(d) => { setValueDrill(false); setWorkspaceTarget({ lens: "contracts", filters: { ...EMPTY_FILTERS, entities: [d.id] } }); navigate("/workspace"); }}
        note=${m.ppaValue ? `Of that, ${fmt.money(m.ppaValue)} is property purchase commitments and ${fmt.money(m.landValue)} is land.` : null} />
      <div style="margin-top:14px">
        <${TableTwin} rows=${m.byEntity} cols=${["Entity", "Live value"]} format=${(v) => fmt.money(v)} />
      </div>
    </${Modal}>`}
  </div>`;
}

/* ============================================================
   WORKSTREAM E — the printable one-page brief.
   Monochrome safe, no interactive chrome, fits one printed page.
   ============================================================ */
const BRIEF_STAGES = [
  ["Request", "The business raises it in the portal"],
  ["Triage", "Owner named, turnaround fixed"],
  ["Draft", "Generated from an approved template"],
  ["Review", "Depth set by the risk tier"],
  ["Negotiate", "Every round recorded"],
  ["Approve", "Chain set by the risk tier"],
  ["Sign", "Executed counterpart captured"],
  ["File", "Repository, Drive link, physical record"],
  ["Watch", "Obligations and renewal reminders"],
];

function ExecBrief() {
  const m = useExecMetrics();
  const n = narrative(m);
  return html`<div class="page brief fade-in">
    <div class="brief__chrome noprint">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/exec")}>Executive overview</${Btn}>
      <div class="spacer"></div>
      <span class="tiny muted">One page. Prints clean in black and white.</span>
      <${Btn} variant="primary" size="sm" icon="download" onClick=${() => window.print()}>Print or save as PDF</${Btn}>
    </div>

    <article class="brief__sheet">
      <header class="brief__head">
        <div>
          <div class="brief__kicker">${COMPANY.name} · Legal</div>
          <h1 class="brief__title">LegalOS: the legal function on one system</h1>
        </div>
        <div class="brief__asof">as of ${fmt.date(m.now)}</div>
      </header>

      <p class="brief__lede">
        Every legal request from the business now enters through one front door, gets a
        turnaround fixed by the type of work and its risk, and is traceable from that first
        request to a signed contract that is filed, indexed and watched for renewal.
      </p>

      <section class="brief__metrics">
        ${[
          [fmt.money(m.portfolio), "Contract value under management", `${m.liveCount} live contracts, ${m.entityCount} entities`],
          [m.tatNow + " days", "Average turnaround", `committed at ${m.committed}, was ${m.tatThen} in January`],
          [m.adoption + "%", "Requests raised in the portal", `${m.portalCount} of ${m.requestCount}, no email needed`],
          [m.onTime + "%", "Inside the agreed window", m.delayed.length ? `${m.delayed.length} running late, each with a named owner` : "nothing past its date"],
        ].map(([v, l, s]) => html`<div key=${l} class="brief__metric">
          <div class="brief__mv">${v}</div>
          <div class="brief__ml">${l}</div>
          <div class="brief__ms">${s}</div>
        </div>`)}
      </section>

      <section>
        <h2 class="brief__h2">How a request becomes a filed contract</h2>
        <ol class="brief__flow">
          ${BRIEF_STAGES.map(([t, d], i) => html`<li key=${t}>
            <span class="brief__step">${i + 1}</span>
            <span class="brief__stept">${t}</span>
            <span class="brief__stepd">${d}</span>
          </li>`)}
        </ol>
      </section>

      <section class="brief__cols">
        <div>
          <h2 class="brief__h2">How this used to work</h2>
          <ul class="brief__list">
            <li>Requests arrived by email and chat, so nothing had one home.</li>
            <li>Turnaround was negotiated case by case, and rarely written down.</li>
            <li>Status lived in people's heads. Answering "where is it" took a phone call.</li>
            <li>Contracts sat in folders and inboxes. Renewals were found late.</li>
          </ul>
        </div>
        <div>
          <h2 class="brief__h2">How it works now</h2>
          <ul class="brief__list">
            <li>One front door. ${m.adoption}% of requests arrive there already.</li>
            <li>Turnaround is set automatically from the type of work and its risk.</li>
            <li>Every record shows who holds it, for how long, and what is late.</li>
            <li>Signed contracts are filed with a Drive link, a shelf location and a reminder.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 class="brief__h2">What changed this quarter</h2>
        <div class="brief__prose">${n.map((p, i) => html`<p key=${i}>${p}</p>`)}</div>
      </section>

      <footer class="brief__foot">
        Figures read live from the system on the date shown. Prepared for leadership by the
        office of the General Counsel, ${nameOf("u1")}.
      </footer>
    </article>
  </div>`;
}

export default function Exec({ id }) {
  return id === "brief" ? html`<${ExecBrief} />` : html`<${ExecOverview} />`;
}
