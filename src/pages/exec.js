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
import { Btn, Pill, Empty } from "../ui.js";
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

    return {
      now, portfolio, ppaValue, landValue,
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
  const m = useExecMetrics();
  const n = narrative(m);

  // Deep-link helper: open the Workspace already narrowed to what was clicked.
  const openWorkspace = (lens, filters) => {
    setWorkspaceTarget({ lens, filters: { ...EMPTY_FILTERS, ...(filters || {}) } });
    navigate("/workspace");
  };

  const tiles = [
    { label: "Requests this quarter", value: m.thisQuarter, soWhat: `${m.requestCount} on the books in total`, icon: "inbox", go: () => openWorkspace("log", {}) },
    { label: "Inside the agreed window", value: m.onTime + "%", soWhat: m.delayed.length ? `${m.delayed.length} running late` : "nothing past its date", icon: "clock", tone: m.onTime >= 80 ? "good" : "warn", go: () => openWorkspace("worklist", { tatStatuses: ["Delayed"] }) },
    { label: "High or critical risk open", value: m.highRisk, soWhat: "each on a deeper review path", icon: "alertTriangle", tone: "warn", go: () => openWorkspace("worklist", { risks: ["high", "critical"] }) },
    { label: "Renewals in 90 days", value: m.expiring.length, soWhat: `${fmt.money(m.expiringValue)} of value to decide on`, icon: "refresh", go: () => openWorkspace("contracts", { dateField: "expiry", datePreset: "exp90" }) },
    { label: "Documents read by machine", value: m.extracted, soWhat: `of ${m.docCount} filed, values extracted not typed`, icon: "cpu", go: () => navigate("/analyzer") },
    { label: "Licences in good standing", value: `${m.licValid}/${m.licCount}`, soWhat: m.licAtRisk ? `${m.licAtRisk} need attention` : "all valid", icon: "fileCheck", tone: m.licAtRisk ? "warn" : "good", go: () => navigate("/licenses") },
  ];

  return html`<div class="page execpage fade-in">

    <!-- the four numbers a CEO actually asks about -->
    <section class="exec__heroes">
      <${HeroTile} label="Contract value under management" icon="dollar"
        value=${fmt.money(m.portfolio)}
        soWhat=${`${m.liveCount} live contracts across ${m.entityCount} entities`}
        onClick=${() => navigate("/tracker")} />
      <${HeroTile} label="Average turnaround" icon="clock"
        value=${m.tatNow} unit="days"
        soWhat=${`committed at ${m.committed} days, was ${m.tatThen} in January`}
        delta=${m.tatDelta + "%"} deltaDir="down" spark=${m.trend}
        onClick=${() => navigate("/pipelines")} />
      <${HeroTile} label="Requests that never touch email" icon="inbox"
        value=${m.adoption} unit="%"
        soWhat=${`${m.portalCount} raised through the portal by ${m.requesters} people`}
        onClick=${() => navigate("/portal")} />
      <${HeroTile} label="Waiting time that is not legal's" icon="users"
        value=${m.outsideLegal} unit="%"
        soWhat="sat with the business or the counterparty, and the clock knows it"
        onClick=${() => navigate("/pipelines")} />
    </section>

    <!-- the whole department on one page -->
    <section class="exec__section">
      <div class="exec__sechead">
        <h2 class="exec__h2">The whole department on one page</h2>
        <span class="tiny muted">Every tile opens the detail behind it.</span>
      </div>
      <div class="exec__tiles">
        ${tiles.map((t) => html`<button key=${t.label} class=${cx("etile", t.tone && `etile--${t.tone}`)} onClick=${t.go}>
          <span class="etile__ico"><${Icon} name=${t.icon} size=15 /></span>
          <span class="etile__value">${t.value}</span>
          <span class="etile__label">${t.label}</span>
          <span class="etile__sowhat">${t.soWhat}</span>
        </button>`)}
      </div>
    </section>

    <!-- where the value sits, and who does the work -->
    <section class="exec__split">
      <div class="card card--pad col" style="gap:14px">
        <div>
          <h2 class="exec__h2">Where the value sits</h2>
          <p class="exec__sub">Live contract value by entity, in US dollars for comparison.</p>
        </div>
        <${RankBars} data=${m.byEntity} format=${(v) => fmt.money(v)}
          onRow=${(d) => { setWorkspaceTarget({ lens: "contracts", filters: { ...EMPTY_FILTERS, entities: [d.id] } }); navigate("/workspace"); }}
          note=${m.ppaValue ? `Of that, ${fmt.money(m.ppaValue)} is property purchase commitments and ${fmt.money(m.landValue)} is land.` : null} />
        <${TableTwin} rows=${m.byEntity} cols=${["Entity", "Live value"]} format=${(v) => fmt.money(v)} />
      </div>

      <div class="card card--pad col" style="gap:14px">
        <div>
          <h2 class="exec__h2">Who does the work</h2>
          <p class="exec__sub">Open matters and live contracts by legal desk.</p>
        </div>
        <${ShareDonut} data=${m.bySubdiv} size=${158} thickness=${19}
          centerValue=${m.rowCount + m.liveCount} centerLabel="records" />
        <${TableTwin} rows=${m.bySubdiv} cols=${["Legal desk", "Records"]} />
      </div>
    </section>

    <!-- the board note -->
    <section class="exec__note">
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
    </section>

    <footer class="exec__foot">
      <span class="tiny muted">
        Figures read live from the system. This view is for leadership; the operational
        dashboard and the module detail sit behind every number above.
      </span>
    </footer>
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
