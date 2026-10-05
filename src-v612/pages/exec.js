/* THE DASHBOARD.
 *
 * Four analytics tabs — Overall, Revenue, Spend, Team — over one shared period
 * selector, so two numbers on the same screen are never counting different
 * windows without saying so.
 *
 * WHAT WAS REMOVED, AND WHY (§11):
 *
 *   Compliance score      A number out of 100 computed as "valid licences ÷
 *                         all licences". It looked like a regulator's rating
 *                         and was arithmetic over one register. Replaced by
 *                         the states a compliance lawyer actually works in —
 *                         on time, delayed, rectified, expired — each of which
 *                         opens the records behind it.
 *   Board resolutions     A lifetime count of minutes filed since 2014.
 *   Loans & financing     A lifetime count of loan agreements.
 *                         Neither is something a leader decides anything from,
 *                         and both are one click away in Compliance.
 *   Portfolio value       Shown twice, once including concluded contracts and
 *                         once excluding them, under two different labels.
 *   The DASH constants    Turnaround "3.4 days, down from 4.8 in January", a
 *                         1,284 contract count, an eleven-point trend line and
 *                         a narrative paragraph quoting all of it to the
 *                         General Counsel. Every one of those numbers was
 *                         written by hand before Drive was connected. The
 *                         turnaround is now MEASURED from completed work, and
 *                         says so when there is not enough of it to measure.
 *
 * And what leads the page instead (§12): ACTIVE work. Active cases, active
 * notices, licences needing attention, active tasks. A dashboard headlining
 * lifetime totals tells you how long the company has existed.
 */
import { html, cx, fmt, useState, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Modal, Progress, Section, Metric } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { useActiveUser } from "../rbac.js";
import { useRegister } from "../live.js";
import { useOrgTree, OrgTree } from "./orgtree.js";
import { navigate, useQuery } from "../router.js";
import { CauseList } from "../causelist.js";
import { useCollection } from "../store.js";
import { nameOf, COMPANY, entityName } from "../data.js";
import { Donut, HBars, BarChart, AreaTrend } from "../charts.js";
import { RankBars, ShareDonut, TableTwin } from "../execviz.js";
import { allReminders } from "../reminders.js";
import { usePeriod, PeriodSelector } from "../period.js";
import { useWorkMetrics, useRegisterMetrics, lastMonths } from "../dashmetrics.js";
import { useLeases, useServices, useLicences } from "../compliancedata.js";
import { api } from "../api.js";
import { OUTCOME_TONE, outcomeOf, byLawFirm } from "../litigationmodel.js";

const PALETTE = ["#0d7a3f", "#1d6cb0", "#ea580c", "#6d28d9", "#db2777", "#0891b2", "#b45309"];
const tint = (rows) => rows.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));

const TABS = [
  { id: "overall", label: "Overall", icon: "dashboard" },
  { id: "spend", label: "Spend", icon: "dollar" },
  { id: "team", label: "Team Analytics", icon: "users" },
];

/* A figure the source cannot support. Shown as a sentence, never as a zero —
   "0" and "we have no way of knowing" are different answers and a reader must
   be able to tell them apart (§14). */
function Band({ title, sub, right }) {
  return html`<div class="dashband">
    <span class="dashband__t">${title}</span>
    ${sub && html`<span class="tiny muted" style="margin-left:10px">${sub}</span>`}
    ${right && html`<${Fragment}><div class="spacer"></div>${right}</${Fragment}>`}
  </div>`;
}

/* ===================================================================== OVERALL */

function OverallTab({ work, reg, period }) {
  const contracts = useCollection("contracts");
  const reminders = useMemo(() => allReminders(reg.contracts || []), [reg.contracts]);
  const firms = useMemo(() => byLawFirm(reg.cases || []).slice(0, 6), [reg.cases]);

  const live = reg.liveContracts;
  const expiring90 = live.filter((c) => {
    const d = (new Date(c.expiry) - Date.now()) / 86400000;
    return d >= 0 && d <= 90;
  });
  const portfolio = live.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);

  const outcomes = useMemo(() => {
    const m = new Map();
    for (const c of reg.decidedCases) { const o = outcomeOf(c); m.set(o, (m.get(o) || 0) + 1); }
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  }, [reg.decidedCases]);

  return html`<${Fragment}>
    ${/* §12 — ACTIVE WORK LEADS. Every tile is a count of something running
          now, and every one of them opens the records behind it. */ ""}
    <${StatStrip} stats=${[
      { value: reg.activeCases.length, label: "Active cases",
        onClick: () => navigate("/litigation", { cases_lifecycle: "Active" }) },
      { value: reg.activeNotices.length, label: "Active notices",
        title: "Notices still awaiting a reply or a resolution",
        onClick: () => navigate("/m/notices") },
      { value: reg.licAttention.length, label: "Licences needing attention",
        tone: reg.licExpired.length ? "red" : reg.licAttention.length ? "amber" : "",
        title: "Expired, or expiring inside 90 days",
        onClick: () => navigate("/compliance/licenses", { lic_expiry: "d90" }) },
      { value: work.active.length, label: "Active tasks",
        onClick: () => navigate("/workspace") },
      { value: work.delayed.length, label: "Delayed", tone: work.delayed.length ? "red" : "",
        onClick: () => navigate("/workspace", { wsp_tat: "Delayed" }) },
    ]} />

    <${Band} title="Contracts portfolio" />
    <div class="grid grid--4" style="margin-bottom:16px">
      ${/* "ACTIVE" IS THE WORD THE BUSINESS USES.
            The register's own status value is Active, the filter this card
            navigates to is ct_status=Active, and every other surface says
            active — only these two cards said "live", which left the reader
            wondering whether it meant something different from the status they
            filter on. It did not. */ ""}
      <${Metric} label="Active contracts" value=${fmt.num(live.length)} icon="file" tone="blue"
        onClick=${() => navigate("/contracts", { ct_status: "Active" })} />
      <${Metric} label="Total revenue" value=${fmt.money(portfolio, "PKR")} icon="dollar" tone="green"
        foot="active contracts"
        onClick=${() => navigate("/contracts")} />
      <${Metric} label="Expiring in 90 days" value=${expiring90.length} icon="refresh"
        tone=${expiring90.length ? "amber" : "blue"}
        foot=${expiring90.length ? fmt.money(expiring90.reduce((s, c) => s + (Number(c.value) || 0), 0), "PKR") + " up for renewal" : "nothing renews this quarter"}
        onClick=${() => navigate("/contracts", { ct_expiry: "d90" })} />
      <${Metric} label="Contract requests open" value=${work.active.filter((r) => /contract/i.test(r.category || "")).length}
        icon="inbox" tone="purple" foot="in drafting, review or approval"
        onClick=${() => navigate("/contract-requests")} />
    </div>

    <${Band} title="Litigation & disputes" />
    <div class="grid grid--2" style="margin-bottom:16px;align-items:start">
      <${Section} title="The case book" icon="gavel"
        sub="Active and decided, and what is being claimed."
        actions=${html`<${Btn} size="sm" variant="ghost" icon="barchart"
          onClick=${() => navigate("/m/analytics")}>Full analytics</${Btn}>`}>
        <${StatStrip} stats=${[
          { value: reg.activeCases.length, label: "Active cases",
            onClick: () => navigate("/litigation", { cases_lifecycle: "Active" }) },
          { value: reg.decidedCases.length, label: "Decided cases",
            onClick: () => navigate("/litigation", { cases_lifecycle: "Decided" }) },
          /* It opens the cases the total is built from — the two figures beside
             it already did, and a money figure a reader cannot get behind is
             the one they most want to get behind. */
          { value: reg.claims.pkr ? fmt.money(reg.claims.pkr, "PKR") : "—",
            label: `Total claims value (${reg.claims.quantified} of ${reg.claims.total} quantified)`,
            onClick: () => navigate("/litigation", { cases_claim: "1to10m|10to100m|gt100m" }),
            /* The USD line under this card is gone. The point it made still
               matters — rupee and dollar claims are not added, because no
               source states a rate — so it lives here, on hover, rather than
               taking three lines of the page to say it. */
            title: `Claimed, in the currency the source states${reg.claims.usd > 0 ? ". A further " + fmt.money(reg.claims.usd, "USD") + " is claimed in US dollars and is totalled separately — no source states a conversion rate" : ""}. Opens the cases that carry a figure.` },
        ]} />
      </${Section}>
      <${Section} title="Outcomes on decided cases" icon="pie" sub="click a slice to open those cases">
        ${outcomes.length
          ? html`<div class="row center" style="min-height:190px">
              <${Donut} data=${tint(outcomes)} size=${156} centerValue=${reg.decidedCases.length} centerLabel="decided"
                onItem=${(d) => navigate("/litigation", { cases_outcome: d.label })} /></div>`
          : html`<div class="tiny muted" style="padding:20px 2px">No case has been decided yet.</div>`}
      </${Section}>
    </div>

    <${Band} title="Legal & regulatory compliance" />
    <div class="grid grid--2" style="margin-bottom:16px;align-items:start">
      <${ComplianceStates} reg=${reg} />
      <${Section} title="Renewals & notice windows" icon="bell"
        sub="What lands next, across contracts and licences."
        actions=${html`<${Btn} size="sm" variant="ghost" icon="calendar"
          onClick=${() => navigate("/calendar")}>Calendar</${Btn}>`} bodyClass="col">
        ${reminders.length === 0
          ? html`<div class="tiny muted" style="padding:16px 2px">No renewal or notice window falls in the next 90 days.</div>`
          : reminders.slice(0, 6).map((r) => html`<button type="button" key=${r.id} class="feed__item clickable"
              style="align-items:center" onClick=${() => r.path && navigate(r.path)}>
              <span class=${"calpip calpip--" + (r.tone === "red" ? "red" : "amber")}>
                <${Icon} name=${r.icon || "bell"} size=13 /></span>
              <div style="flex:1;min-width:0">
                <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</div>
                <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.detail || ""}</div>
              </div>
              ${r.dueDays != null && html`<${Pill} tone=${r.tone || "amber"}>
                ${r.dueDays < 0 ? Math.abs(r.dueDays) + "d past" : "in " + r.dueDays + "d"}</${Pill}>`}
            </button>`)}
      </${Section}>
    </div>

    <${Band} title="In court this week" />
    <div style="margin-bottom:22px"><${CauseList} compact=${true} /></div>

    <${Band} title="Needs attention" />
    <div class="grid grid--2" style="margin-bottom:22px;align-items:start">
      <${Section} title="Delayed work" icon="alertTriangle"
        sub="past the agreed turnaround, with the stage holding it up"
        right=${html`<${Pill} tone=${work.delayed.length ? "red" : "green"}>${work.delayed.length} delayed</${Pill}>`}
        bodyClass="col">
        ${work.delayed.length === 0
          ? html`<div class="tiny muted" style="padding:16px 2px">Nothing is past its turnaround allowance.</div>`
          : work.delayed.slice(0, 6).map((r) => html`<button type="button" key=${r.id} class="feed__item clickable"
              style="align-items:center" onClick=${() => navigate("/workspace/" + r.id)}>
              <span class="calpip calpip--red"><${Icon} name="alertTriangle" size=13 /></span>
              <div style="flex:1;min-width:0">
                <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</div>
                <div class="tiny muted">${r.id} · blocked at ${r.__tat.blockingStage || "—"}${r.__tat.blockingOwner ? " · " + nameOf(r.__tat.blockingOwner) : ""}</div>
              </div>
              <${Pill} tone="red">+${r.__tat.overdueBy}d</${Pill}>
            </button>`)}
      </${Section}>
      <${Section} title="Outside counsel" icon="briefcase"
        sub="The firms carrying the most matters right now."
        actions=${html`<${Btn} size="sm" variant="ghost" icon="barchart"
          onClick=${() => navigate("/m/analytics")}>Firm analysis</${Btn}>`}>
        ${firms.length
          ? html`<${HBars} data=${firms.map((f) => ({ label: f.firm, value: f.cases.length }))} gap=${9}
              format=${(v) => v + " matter" + (v === 1 ? "" : "s")}
              onItem=${(d) => navigate("/litigation", { cases_counsel: d.label })} />`
          : html`<div class="tiny muted">No counsel is recorded on any case.</div>`}
      </${Section}>
    </div>
  </${Fragment}>`;
}

/* COMPLIANCE HEALTH IN THE STATES A LAWYER WORKS IN (§55).
   "84 / 100" was a ratio of one register dressed as a rating. These four are
   conditions a person can act on, each opening its own records. */
function ComplianceStates({ reg }) {
  const today = new Date().toISOString().slice(0, 10);
  const in90 = (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10); })();
  const lics = reg.licences || [];
  const expired = lics.filter((l) => l.expiry && l.expiry < today);
  const dueSoon = lics.filter((l) => l.expiry && l.expiry >= today && l.expiry <= in90);
  const onTime = lics.filter((l) => l.expiry && l.expiry > in90);
  const noDate = lics.filter((l) => !l.expiry);

  const state = (label, items, tone, q, note) => ({ label, items, tone, q, note });
  const states = [
    state("On time", onTime, "green", { lic_expiry: "valid90" }, "valid beyond 90 days"),
    state("Delayed", dueSoon, "amber", { lic_expiry: "d90" }, "inside the renewal window"),
    state("Expired / not renewed", expired, "red", { lic_expiry: "overdue" }, "past expiry with no renewal recorded"),
    state("No expiry recorded", noDate, "gray", { lic_expiry: "none" }, "the source states no expiry date"),
  ];

  return html`<${Section} title="Licence position" icon="shield"
    sub="Every state opens the licences in it. There is no score: a ratio of one register is not a compliance rating."
    actions=${html`<${Btn} size="sm" variant="ghost" icon="arrowRight"
      onClick=${() => navigate("/compliance")}>Compliance</${Btn}>`}>
    <div class="col" style="gap:8px">
      ${states.map((s) => html`<button key=${s.label} type="button" class="staterow"
        aria-label=${`${s.items.length} licences ${s.label.toLowerCase()} — open them`}
        onClick=${() => navigate("/compliance/licenses", s.q)}>
        <span class=${"statedot statedot--" + s.tone}></span>
        <span class="staterow__l">${s.label}</span>
        <span class="staterow__s">${s.note}</span>
        <span class="staterow__n">${s.items.length}</span>
      </button>`)}
    </div>
    ${lics.length === 0 && html`<div class="tiny muted" style="padding-top:8px">
      No licence register is available to you.</div>`}
  </${Section}>`;
}

/* ===================================================================== REVENUE */

/* REVENUE AND SPEND ARE DIFFERENT BOOKS (§13).
   The commercial contract register is the revenue side: what the group has
   agreed to be paid. The compliance spend trackers are the other side: what
   the group has agreed to pay. They were previously totalled together into one
   "portfolio value", which is a number with no meaning. */
function SpendTab({ period }) {
  const leases = useLeases();
  const services = useServices();
  const [spend, setSpend] = useState(null);
  const [spendErr, setSpendErr] = useState(null);

  useMemo(() => {
    const q = {};
    if (period.from) q.from = period.from;
    if (period.to) q.to = period.to;
    api.litigation.spend(q).then(setSpend, setSpendErr);
    return null;
  }, [period.from, period.to]);

  const agreements = [
    ...((leases.data && leases.data.leases) || []),
    ...((services.data && services.data.services) || []),
  ];
  const inPeriod = agreements.filter((a) => period.covers(a.start));
  const committed = inPeriod.reduce((s, a) => s + (Number(a.value) || 0), 0);
  const noValue = inPeriod.filter((a) => !Number(a.value));

  const totals = (spend && spend.totals) || {};
  const cur = (b) => Object.entries(b || {});
  const legalBilled = cur(totals.caseInvoices).concat(cur(totals.retainers))
    .reduce((acc, [c, v]) => { acc[c] = acc[c] || { invoiced: 0, paid: 0, outstanding: 0 };
      acc[c].invoiced += v.invoiced || 0; acc[c].paid += v.paid || 0; acc[c].outstanding += v.outstanding || 0; return acc; }, {});

  return html`<${Fragment}>
    <${StatStrip} stats=${[
      { value: fmt.money(committed, "PKR"), label: "Contractual spend committed",
        title: "The face value of the group's lease and service agreements",
        onClick: () => navigate("/compliance/services") },
      { value: inPeriod.length, label: "Spend agreements",
        onClick: () => navigate("/compliance/leases") },
      { value: Object.entries(legalBilled).map(([c, v]) => fmt.money(v.invoiced, c)).join(" · ") || "—",
        label: "Legal cost billed", onClick: () => navigate("/m/spend") },
      { value: Object.entries(legalBilled).map(([c, v]) => fmt.money(v.outstanding, c)).join(" · ") || "—",
        label: "Legal cost outstanding",
        tone: Object.values(legalBilled).some((v) => v.outstanding > 0) ? "amber" : "",
        onClick: () => navigate("/m/spend") },
    ]} />

    <${Band} title="Spend agreements" sub="leases and service contracts — what the group has committed to pay" />
    ${/* "Committed vs actual" is gone. Half of it was a figure this deployment
          cannot produce — actual spend lives in the finance ledger, which is
          not connected — so the card spent more room explaining an absence than
          it did showing the commitment. The commitment itself is on the cards
          above and in the agreements themselves. */ ""}
    <div style="margin-bottom:16px">
      <${Section} title="Spend by agreement type" icon="barchart" sub="click a type to open those agreements">
        <${SpendByType} rows=${inPeriod} />
      </${Section}>
    </div>

    <${Band} title="Legal cost" sub="the spend LegalOS itself records — outside counsel, and the disbursements booked against a matter" />
    <${LegalCost} spend=${spend} err=${spendErr} />
  </${Fragment}>`;
}

function SpendByType({ rows }) {
  const data = useMemo(() => {
    const m = new Map();
    for (const r of rows) { const k = r.agreementType || r.klass || "Not stated"; m.set(k, (m.get(k) || 0) + (Number(r.value) || 0)); }
    return [...m.entries()].map(([label, value]) => ({ label, value })).filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [rows]);
  if (!data.length) return html`<div class="tiny muted">No spend agreement in this period states a value.</div>`;
  return html`<${HBars} data=${data} gap=${9} format=${(v) => fmt.money(v, "PKR")}
    onItem=${() => navigate("/compliance/services")} />`;
}

/* §15 — the legal cost subcategories. Claims and exposure are deliberately
   absent: they are what somebody is asking for, not what the company paid. */
export const LEGAL_COST_CATEGORIES = [
  "Stamp / Stamp Paper",
  "Registration",
  "Litigation",
  "Other approved legal cost",
];

function LegalCost({ spend, err }) {
  if (err) {
    return html`<${Section} title="Legal cost" icon="dollar">
      <div class="tiny" style="color:var(--danger-text)">${err.message || "The legal spend ledger could not be read."}</div>
    </${Section}>`;
  }
  if (!spend) return html`<div class="card card--pad tiny muted" style="padding:30px;text-align:center">Reading the legal spend ledger…</div>`;

  const byCat = new Map(LEGAL_COST_CATEGORIES.map((c) => [c, { invoiced: {}, count: 0 }]));
  for (const i of (spend.invoices || [])) {
    /* An invoice booked against a MATTER is litigation cost unless it has been
       categorised otherwise. Nothing is guessed from the amount or the firm. */
    const cat = LEGAL_COST_CATEGORIES.includes(i.costCategory) ? i.costCategory : "Litigation";
    const e = byCat.get(cat);
    e.count++;
    e.invoiced[i.currency || "PKR"] = (e.invoiced[i.currency || "PKR"] || 0) + (Number(i.amount) || 0);
  }
  for (const r of (spend.retainers || [])) {
    const e = byCat.get("Other approved legal cost");
    e.count++;
    e.invoiced[r.currency || "PKR"] = (e.invoiced[r.currency || "PKR"] || 0) + (Number(r.amount) || 0);
  }

  const firms = (spend.byCounsel || []).slice(0, 8);

  return html`<div class="grid grid--2" style="margin-bottom:16px;align-items:start">
    <${Section} title="Legal cost by category" icon="tag"
      sub="Exposure and claims are not legal cost and are not counted here — they are what the other side is asking for.">
      <div class="col" style="gap:8px">
        ${LEGAL_COST_CATEGORIES.map((c) => { const e = byCat.get(c); const money = Object.entries(e.invoiced);
          return html`<button key=${c} type="button" class="staterow" onClick=${() => navigate("/m/spend")}
            aria-label=${`${c}: ${e.count} entries`}>
            <span class="statedot statedot--blue"></span>
            <span class="staterow__l">${c}</span>
            <span class="staterow__s">${e.count ? e.count + " entr" + (e.count === 1 ? "y" : "ies") : "nothing recorded under this category yet"}</span>
            <span class="staterow__n">${money.length ? money.map(([cc, v]) => fmt.money(v, cc)).join(" · ") : "—"}</span>
          </button>`; })}
      </div>
    </${Section}>
    <${Section} title="Legal cost by firm" icon="briefcase"
      sub="Case invoices and firm retainers together — that is what keeping a firm costs."
      actions=${html`<${Btn} size="sm" variant="ghost" icon="arrowRight" onClick=${() => navigate("/m/spend")}>Ledger</${Btn}>`}>
      ${firms.length
        ? html`<${DataTable} rows=${firms} onRow=${() => navigate("/m/spend")} columns=${[
            { key: "key", label: "Firm", render: (g) => html`<div class="cell-strong">${g.key || "Not recorded"}</div>` },
            { key: "figures", label: "Billed", align: "right", render: (g) => html`<div class="col" style="gap:2px">
                ${Object.entries(g.byCurrency || {}).map(([c, v]) => html`<span key=${c} class="tiny">
                  <strong>${fmt.money(v.invoiced, c)}</strong>${v.outstanding > 0
                    ? html` · <span style="color:var(--warning-text)">${fmt.money(v.outstanding, c)} outstanding</span>` : ""}</span>`)}
              </div>` },
          ]} empty=${html`<div class="empty" style="padding:24px">No legal invoice has been recorded.</div>`} />`
        : html`<div class="tiny muted" style="padding:16px 2px">
            No outside-counsel invoice or retainer has been recorded yet. Add them from the
            <button type="button" class="linkbtn tiny" onClick=${() => navigate("/m/spend")}>invoice ledger</button>.</div>`}
    </${Section}>
  </div>`;
}

/* ======================================================================== TEAM */

function TeamTab({ work }) {
  const trend = work.trend.filter((t) => t.total > 0);
  const anyTrend = trend.length > 0;

  /* ON-TIME DELIVERY, FROM THE SAME SERIES THE CHART BELOW DRAWS.
     Computed off `work.trend` rather than recounted from the worklist, because
     two figures on one screen that count "finished on time" in two different
     ways will disagree eventually, and the reader has no way to tell which is
     wrong. A month with nothing completed contributes nothing — it is not a
     100% month, and averaging the monthly percentages would let a quiet month
     with one item outweigh a busy one, so this is completed-on-time over
     completed-in-total across the whole window. */
  const delivered = trend.reduce((a, t) => a + (t.total || 0), 0);
  const deliveredOnTime = trend.reduce((a, t) => a + (t.onTime || 0), 0);
  const onTimePct = delivered ? Math.round((deliveredOnTime / delivered) * 100) : null;

  return html`<${Fragment}>
    ${/* §16 — every tile is a task state somebody can work through. The old
          per-person "open records" and "delayed items" charts counted records
          rather than tasks, so a lawyer holding forty closed matters read as
          the most loaded person in the department. */ ""}
    <${StatStrip} stats=${[
      { value: work.avgTat == null ? "—" : work.avgTat + "d", label: "Average turnaround",
        title: work.avgTat == null
          ? "Not enough completed work with both a start and an end date to measure"
          : `Measured across ${work.measuredCount} completed items` },
      /* Blank, not "0%", when nothing has been completed: those are different
         answers and a reader must be able to tell them apart. */
      { value: onTimePct == null ? "—" : onTimePct + "%", label: "On-time delivery",
        tone: onTimePct == null ? "" : onTimePct >= 80 ? "green" : onTimePct >= 50 ? "amber" : "red",
        title: onTimePct == null
          ? "Nothing has been completed in this window, so there is nothing to measure against"
          : `${deliveredOnTime} of ${delivered} completed within their turnaround` },
      { value: work.active.length, label: "Active tasks", onClick: () => navigate("/workspace") },
      /* THE SAME WORKSPACE, FILTERED (§28). Delayed already opened it; Pending
         and Due today were plain numbers, so a reader could see that four
         things were waiting on somebody else and had no way to ask which. */
      { value: work.pending.length, label: "Pending — waiting on someone else",
        onClick: () => navigate("/workspace", { wsp_status: "Pending" }),
        title: "Open, and the ball is with the business or the counterparty" },
      { value: work.dueToday.length, label: "Due today", tone: work.dueToday.length ? "amber" : "",
        onClick: () => navigate("/workspace", { wsp_tat: "Due Today" }),
        title: "Open the work whose turnaround runs out today" },
      { value: work.delayed.length, label: "Delayed", tone: work.delayed.length ? "red" : "",
        onClick: () => navigate("/workspace", { wsp_tat: "Delayed" }) },
    ]} />

    ${work.avgTat == null && html`<div class="banner banner--info" style="margin-bottom:16px;align-items:flex-start">
      <${Icon} name="alertCircle" size=15 />
      <div class="tiny">Average turnaround is measured from completed work that carries both a start and a
        completion date. There is not enough of it yet, so no figure is shown — the number that used to sit
        here (3.4 days, "down from 4.8 in January") was written by hand before any of this was connected.</div>
    </div>`}

    <div class="grid grid--2" style="margin-bottom:16px;align-items:start">
      <${Section} title="On time vs delayed" icon="activity"
        sub="Completed work by the month it finished. A month with nothing completed is shown as empty, not as 100%. The months are broken out below the chart — the worklist filters on what is still running, so there is nothing to open a finished month into.">
        ${anyTrend
          ? html`<div>
              ${/* NO DRILL HERE, AND THE REASON IS SAID OUT LOUD.
                    Every other chart on this page opens the records behind it.
                    This one counts work by the month it was COMPLETED, and the
                    worklist has no "completed in August" filter to open — its
                    date filters are forward-looking (due today, this week,
                    overdue). Wiring a click to one of those would set a filter
                    that matches different records than the bar counted, which
                    is worse than not offering the click. The month-by-month
                    breakdown underneath is the answer instead. */ ""}
              <${BarChart} data=${trend.map((t) => ({ label: t.label, value: t.total }))} height=${170}
                format=${(v) => v} />
              <div class="col" style="gap:4px;margin-top:12px">
                ${trend.slice(-6).map((t) => html`<div key=${t.month} class="row" style="gap:10px;align-items:center">
                  <span class="tiny" style="width:42px">${t.label}</span>
                  <div style="flex:1"><${Progress} value=${t.total ? Math.round((t.onTime / t.total) * 100) : 0}
                    tone=${t.late ? "amber" : ""} /></div>
                  <span class="tiny strong" style="width:110px;text-align:right">${t.onTime} on time · ${t.late} late</span>
                </div>`)}
              </div>
            </div>`
          : html`<div class="tiny muted" style="padding:20px 2px">
              No work has been completed in the last twelve months, so there is no trend to plot yet.</div>`}
      </${Section}>

      <${Section} title="Workload by person" icon="users"
        sub="OPEN tasks per person — not records held, which counted finished work as load.">
        ${work.byPerson.length
          ? html`<${DataTable} rows=${work.byPerson.slice(0, 12)}
              onRow=${(p) => (p.id !== "__unassigned" ? navigate("/workspace", { wsp_owner: nameOf(p.id) }) : navigate("/workspace"))}
              columns=${[
                { key: "id", label: "Person", render: (p) => html`<div class="cell-strong">
                    ${p.id === "__unassigned" ? "Unassigned" : nameOf(p.id)}</div>` },
                { key: "open", label: "Open tasks", align: "right", render: (p) => html`<span class="strong">${p.open}</span>` },
                { key: "dueToday", label: "Due today", align: "right", render: (p) => html`<span class="tiny">${p.dueToday || "—"}</span>` },
                { key: "delayed", label: "Delayed", align: "right",
                  render: (p) => (p.delayed ? html`<${Pill} tone="red">${p.delayed}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
              ]} empty=${html`<div class="empty" style="padding:24px">Nothing is open.</div>`} />`
          : html`<div class="tiny muted" style="padding:20px 2px">No open task is assigned to anyone.</div>`}
      </${Section}>
    </div>

    <${Section} title="Workload by team" icon="layers" sub="open tasks per legal desk — click to open that desk's work">
      ${work.byTeam.length
        ? html`<${HBars} data=${work.byTeam} gap=${9} format=${(v) => v + " open"}
            onItem=${() => navigate("/workspace")} />`
        : html`<div class="tiny muted">No open task carries a team.</div>`}
    </${Section}>
  </${Fragment}>`;
}

/* ======================================================================= SHELL */

function ExecOverview() {
  const viewer = useActiveUser();
  const [q, patchQ] = useQuery();
  const tab = TABS.some((t) => t.id === q.tab) ? q.tab : "overall";
  const period = usePeriod();
  const work = useWorkMetrics(period);
  const reg = useRegisterMetrics();

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${`${greet}, ${String(viewer.name || "").split(" ")[0]}`}
      sub="The legal function at a glance — what is running, what is owed, and what it costs."
      actions=${html`<${Btn} variant="ghost" icon="calendar" onClick=${() => navigate("/calendar")}>Calendar</${Btn}>
        <${Btn} variant="ghost" icon="download" onClick=${() => navigate("/exec/brief")}>One-page brief</${Btn}>`} />

    <div class="dashtabs" role="tablist" aria-label="Dashboard analytics">
      ${TABS.map((t) => html`<button key=${t.id} role="tab" aria-selected=${tab === t.id}
        class=${cx("dashtab", tab === t.id && "on")}
        onClick=${() => patchQ({ tab: t.id === "overall" ? null : t.id })}>
        <${Icon} name=${t.icon} size=15 /> ${t.label}</button>`)}
    </div>

    <div class="row wrap" style="gap:12px;align-items:center;margin:0 0 16px">
      <${PeriodSelector} period=${period} />
    </div>

    ${reg.loading && !reg.contracts.length
      ? html`<div class="card card--pad tiny muted" style="padding:44px;text-align:center">Reading the registers…</div>`
      : tab === "spend" ? html`<${SpendTab} period=${period} />`
      : tab === "team" ? html`<${TeamTab} work=${work} />`
      : html`<${OverallTab} work=${work} reg=${reg} period=${period} />`}

    <footer class="exec__foot">
      <span class="tiny muted">
        Every figure on this page is read from the live registers and the department's own records.
        Where a figure cannot be evidenced from a connected source it says so rather than showing a number.
      </span>
    </footer>
  </div>`;
}

/* ============================================================
   The printable one-page brief. Monochrome safe, no interactive chrome.
   ============================================================ */
const BRIEF_STAGES = [
  ["Request", "The business raises it in the portal"],
  ["To be assigned", "Owner named, turnaround fixed"],
  ["Draft", "Generated from an approved template"],
  ["Review", "Depth set by the risk tier"],
  ["Sign", "Executed counterpart captured"],
  ["File", "Repository, Drive link, physical record"],
  ["Watch", "Obligations and renewal reminders"],
];

function ExecBrief() {
  const period = usePeriod();
  const work = useWorkMetrics(period);
  const reg = useRegisterMetrics();
  const portfolio = reg.liveContracts.reduce((s, c) => s + (Number(c.value) || 0), 0);

  return html`<div class="page brief fade-in">
    <div class="brief__chrome noprint">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/exec")}>Dashboard</${Btn}>
      <div class="spacer"></div>
      <span class="tiny muted">One page. Prints clean in black and white.</span>
      <${Btn} variant="primary" size="sm" icon="download" onClick=${() => window.print()}>Print or save as PDF</${Btn}>
    </div>

    <article class="brief__sheet">
      <header class="brief__head">
        <div>
          <div class="brief__kicker">${COMPANY.name} · Legal</div>
          <h1 class="brief__title">The legal function, on one system</h1>
        </div>
        <div class="brief__asof">as at ${fmt.date(new Date())}</div>
      </header>

      <p class="brief__lede">
        Every legal request from the business enters through one front door, gets a turnaround fixed by the
        type of work and its risk, and is traceable from that first request to a signed contract that is
        filed, indexed and watched for renewal.
      </p>

      <section class="brief__metrics">
        ${[
          [String(reg.activeCases.length), "Active cases", `${reg.decidedCases.length} decided`],
          [String(work.active.length), "Active tasks", `${work.delayed.length} past their agreed date`],
          [fmt.money(portfolio, "PKR"), "Total revenue", `${reg.liveContracts.length} active contracts`],
          [work.avgTat == null ? "Not yet measurable" : work.avgTat + " days", "Average turnaround",
            work.avgTat == null ? "too little completed work to measure" : `across ${work.measuredCount} completed items`],
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
            <li>One front door, and every request keeps the person and department that raised it.</li>
            <li>Turnaround is set automatically from the type of work and its risk.</li>
            <li>Every record shows who holds it, for how long, and what is late.</li>
            <li>Contracts, licences and hearings share one calendar of dated obligations.</li>
          </ul>
        </div>
      </section>

      <footer class="brief__foot">
        Figures read live from the system on the date shown. Where a figure is not evidenced by a connected
        source it is named as such rather than estimated.
      </footer>
    </article>
  </div>`;
}

export default function Exec({ id }) {
  return id === "brief" ? html`<${ExecBrief} />` : html`<${ExecOverview} />`;
}
