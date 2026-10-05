/* LITIGATION ANALYTICS — the questions the case register cannot answer.
 *
 * Every figure here is clickable and every click lands on the SAME filtered
 * case register, because a number a reader cannot get behind is a decoration.
 * The filters it sets are the register's own (`cases_*`), so the count on the
 * chart and the count on the register always reconcile.
 *
 * Two honesty rules run through the page:
 *   • PKR and USD are totalled separately and never added. The trackers carry
 *     both and no rate, and an invented conversion produces a confident wrong
 *     number rather than an admitted gap.
 *   • A success rate is computed over DECIDED cases with a RECORDED result.
 *     Live matters and decided-but-unrecorded ones are reported as their own
 *     figures, not folded into the denominator where they would quietly drag
 *     every firm's number toward zero.
 */
import { html, cx, fmt, useState, useMemo, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Empty, Chip } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { navigate } from "../router.js";
import { useRegister } from "../live.js";
import { Donut, HBars, BarChart, foldSeries } from "../charts.js";
import { drillTo } from "../drill.js";
import { api } from "../api.js";
import {
  lifecycleOf, outcomeOf, OUTCOMES, OUTCOME_TONE, positionOf, POSITIONS, cityOf,
  claimTotals, recoverableTotals, AGE_BUCKETS, ageBucket, byLawFirm, successRate,
  countBy, filedYear,
} from "../litigationmodel.js";

/* Open the case register with one of ITS filters already set. The namespace is
   "cases" — the same one litigation.js gives RegisterShell — so this is the
   register's own state, not a second filtering model. */
const open = (key, value) => {
  const q = {};
  q["cases_" + key] = Array.isArray(value) ? value.join("|") : String(value);
  navigate("/litigation", q);
};

const PALETTE = ["#0d7a3f", "#1d6cb0", "#ea580c", "#6d28d9", "#db2777", "#0891b2", "#b45309"];
const tint = (rows) => rows.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));

function Money({ t, label }) {
  if (!t.pkr && !t.usd) return html`<span class="tiny muted">Not quantified in source</span>`;
  return html`<div class="col" style="gap:2px">
    ${t.pkr > 0 && html`<span class="strong">${fmt.money(t.pkr, "PKR")}</span>`}
    ${t.usd > 0 && html`<span class="strong">${fmt.money(t.usd, "USD")}</span>`}
    <span class="tiny muted">${t.quantified} of ${t.total} ${label} carry a figure</span>
  </div>`;
}

export default function LitigationAnalytics() {
  const reg = useRegister("litigation");
  /* COURT MATTERS ONLY (§13/§15/§30).
     Every figure on this page — success rate, court analysis, matter aging,
     law-firm performance — is a statement about litigation. Seventeen refund
     claims that were never filed and four complaints made at a police station
     were being counted in all of it: they inflated Active Cases, and a police
     station appeared in the court analysis beside the Lahore High Court. They
     keep their own registers; this page reads the court book. */
  const rows = (reg.rows || []).filter((r) => (r.matterClass || "COURT_CASE") === "COURT_CASE");
  const [firmSort, setFirmSort] = useState("cases");
  /* SUCCESS AGAINST COST. A success rate on its own says which firm wins; it
     does not say what the wins cost, and those are two different questions a
     head of department has to put together by hand. Spend comes from the same
     ledger /m/spend reads — invoices billed against a case plus the firm's own
     retainers — so the two pages cannot disagree. It is fetched separately
     because it is not in the case register; a refusal or a failure leaves the
     cost columns saying so rather than showing a zero. */
  const [spend, setSpend] = useState(undefined);
  useEffect(() => { let a = true;
    api.litigation.spend({}).then((d) => a && setSpend(d), () => a && setSpend(null));
    return () => { a = false; }; }, []);
  const costOf = useMemo(() => {
    const m = new Map();
    for (const g of ((spend || {}).byCounsel || [])) m.set(String(g.key || g.label || "").trim(), g);
    return m;
  }, [spend]);

  const m = useMemo(() => {
    const active = rows.filter((c) => lifecycleOf(c) === "Active");
    const decided = rows.filter((c) => lifecycleOf(c) === "Decided");

    /* CASES FILED BY YEAR, and the year-on-year move. Only years the source
       actually dates: a case with no filing date is counted once, under
       "Filing date not recorded", rather than being dropped so the totals stop
       adding up. */
    const years = countBy(rows, (c) => filedYear(c)).sort((a, b) => a.label.localeCompare(b.label));
    const recent = years.slice(-8);
    const undated = rows.filter((c) => !filedYear(c)).length;
    const yoy = (() => {
      if (recent.length < 2) return null;
      const [prev, last] = [recent[recent.length - 2], recent[recent.length - 1]];
      if (!prev.value) return null;
      return { year: last.label, prev: prev.label, pct: Math.round(((last.value - prev.value) / prev.value) * 100), from: prev.value, to: last.value };
    })();

    const outcomes = OUTCOMES
      .map((label) => ({ label, value: decided.filter((c) => outcomeOf(c) === label).length }))
      .filter((o) => o.value > 0);
    const sides = POSITIONS.map((label) => ({ label, value: rows.filter((c) => positionOf(c) === label).length })).filter((s) => s.value);
    /* The same three positions, with what happened to each — built with the
       SAME outcome reader the firm table uses, so the two tables on this page
       cannot classify the same case differently. */
    const sideRows = POSITIONS.map((side) => {
      const mine = rows.filter((c) => positionOf(c) === side);
      const dec = mine.filter((c) => lifecycleOf(c) === "Decided");
      const by = (o) => dec.filter((c) => outcomeOf(c) === o).length;
      const won = by("Successful / Won"), adverse = by("Adverse / Lost"), unrecorded = by("Not Recorded");
      return { side, total: mine.length,
        active: mine.filter((c) => lifecycleOf(c) === "Active").length,
        decided: dec.length, won, adverse,
        other: dec.length - won - adverse - unrecorded, unrecorded,
        rate: successRate(mine), claims: claimTotals(mine) };
    }).filter((r) => r.total > 0);

    const aging = AGE_BUCKETS.map((b) => ({
      ...b, active: active.filter((c) => ageBucket(c) === b.id).length,
      decided: decided.filter((c) => ageBucket(c) === b.id).length,
    }));
    const unaged = rows.filter((c) => ageBucket(c) == null).length;

    return {
      active, decided, years, recent, undated, yoy, outcomes, sides, sideRows, aging, unaged,
      claims: claimTotals(rows), activeClaims: claimTotals(active), recoverable: recoverableTotals(rows),
      byEntity: countBy(rows, (c) => c.entity).slice(0, 10),
      byType: countBy(rows, (c) => c.type).slice(0, 10),
      byCourt: countBy(rows, (c) => c.court).slice(0, 10),
      byCity: countBy(rows, (c) => c.city).filter((x) => x.label !== "Not stated in source").slice(0, 10),
      firms: byLawFirm(rows),
      rate: successRate(rows),
      noResult: decided.filter((c) => outcomeOf(c) === "Not Recorded").length,
    };
  }, [rows]);

  if (reg.loading && !rows.length) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Litigation Analytics" />
      <div class="card card--pad tiny muted" style="padding:44px;text-align:center">Reading the case register…</div></div>`;
  }
  if (!rows.length) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Litigation Analytics" />
      <${Empty} icon="barchart" title="No cases to analyse"
        text="The case register is empty for your access. Analytics is built from the same records the register shows." /></div>`;
  }

  const billedOf = (f) => {
    const g = costOf.get(f.firm);
    if (!g) return 0;
    return Object.values(g.byCurrency || {}).reduce((sum, v) => sum + (v.invoiced || 0), 0);
  };
  const firms = [...m.firms].sort((a, b) => (firmSort === "rate"
    ? (b.successRate == null ? -1 : b.successRate) - (a.successRate == null ? -1 : a.successRate)
    : firmSort === "claims" ? b.claims.pkr - a.claims.pkr
    : firmSort === "cost" ? billedOf(b) - billedOf(a)
    : b.cases.length - a.cases.length));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Litigation Analytics"
      sub="The shape of the book — how it arrived, how it is going, and who is running it."
      actions=${html`<${Btn} variant="ghost" icon="gavel" onClick=${() => navigate("/litigation")}>Case register</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: m.active.length, label: "Active cases", onClick: () => open("lifecycle", "Active") },
      { value: m.decided.length, label: "Decided cases", onClick: () => open("lifecycle", "Decided") },
      { value: m.rate == null ? "—" : m.rate + "%", label: "Success rate, decided cases with a recorded result",
        title: "Successful / Won ÷ every decided case whose result is recorded. Active and unrecorded cases are excluded." },
      { value: m.noResult, label: "Decided, outcome not recorded", tone: m.noResult ? "amber" : "",
        onClick: () => open("outcome", "Not Recorded"),
        title: "A finished matter whose result nobody wrote down" },
    ]} />

    <div class="grid grid--2" style="margin-bottom:16px">
      <${Section} title="Total claims value" icon="dollar"
        sub="What is being claimed, in the currency the source states it in. Never converted, never added across currencies.">
        <div class="col" style="gap:12px">
          <div><div class="tiny muted">Whole book</div><${Money} t=${m.claims} label="cases" /></div>
          <div><div class="tiny muted">Active cases only</div><${Money} t=${m.activeClaims} label="active cases" /></div>
          <div><div class="tiny muted">Recoverable</div><${Money} t=${m.recoverable} label="cases" /></div>
        </div>
      </${Section}>

      <${Section} title="Cases filed by year" icon="barchart"
        sub=${m.yoy
          ? `${m.yoy.year} is ${m.yoy.pct > 0 ? "up" : m.yoy.pct < 0 ? "down" : "level"}${m.yoy.pct ? " " + Math.abs(m.yoy.pct) + "%" : ""} on ${m.yoy.prev} — ${m.yoy.from} to ${m.yoy.to} cases.`
          : "Click a year to filter the register."}>
        ${m.recent.length
          ? html`<${BarChart} data=${m.recent} height=${180} onItem=${(d) => open("year", d.label)} />`
          : html`<div class="tiny muted">No case in the register carries a filing date.</div>`}
        ${m.undated > 0 && html`<div class="tiny muted" style="margin-top:10px">
          ${m.undated} case${m.undated === 1 ? "" : "s"} carry no filing date in the source and are not in this chart.</div>`}
      </${Section}>
    </div>

    <div class="grid grid--3" style="margin-bottom:16px">
      <${Section} title="Active vs decided" icon="pie" sub="click to filter">
        <div class="row center" style="min-height:200px">
          <${Donut} data=${tint([{ label: "Active", value: m.active.length }, { label: "Decided", value: m.decided.length }])}
            size=${160} centerValue=${rows.length} centerLabel="cases"
            onItem=${(d) => open("lifecycle", d.label)} />
        </div>
      </${Section}>
      <${Section} title="Outcome" icon="pie" sub="decided cases only — click to filter">
        ${m.outcomes.length
          ? html`<div class="row center" style="min-height:200px">
              <${Donut} data=${tint(m.outcomes)} size=${160} centerValue=${m.decided.length} centerLabel="decided"
                onItem=${(d) => open("outcome", d.label)} /></div>`
          : html`<div class="tiny muted">No case has been decided yet.</div>`}
      </${Section}>
      ${/* THE SAME CUT, AS FIGURES. A pie says which slice is bigger and
            nothing else — and "For" and "Against" are not two shades of one
            thing: a case we brought and a case brought against us are read
            completely differently when they are won, lost or settled. The
            table under the chart carries the outcome split per side, which is
            what a reader actually takes away from this page. */ ""}
      <${Section} title="For vs against" icon="pie"
        sub="whether the company brought the matter or is answering it">
        <div class="row center" style="min-height:200px">
          <${Donut} data=${tint(m.sides)} size=${160} centerValue=${rows.length} centerLabel="cases"
            onItem=${(d) => open("forag", d.label)} />
        </div>
      </${Section}>
    </div>

    <${Section} title="For and against, in figures" icon="grid"
      sub="The same cut as the chart above, with what happened to each side. Click any row to open the register on it.">
      <${DataTable} onRow=${(r) => open("forag", r.side)} rows=${m.sideRows} columns=${[
        { key: "side", label: "Position", render: (r) => html`<div class="cell-strong">${r.side === "Not stated in source" ? "Not stated" : r.side}</div>
          <div class="tiny muted">${r.side === "For" ? "the company brought it" : r.side === "Against" ? "the company is answering it" : "the source does not say which"}</div>` },
        { key: "total", label: "Cases", align: "right", render: (r) => html`<span class="strong">${r.total}</span>` },
        { key: "active", label: "Active", align: "right", render: (r) => html`<span class="tiny">${r.active || "—"}</span>` },
        { key: "decided", label: "Decided", align: "right", render: (r) => html`<span class="tiny">${r.decided || "—"}</span>` },
        { key: "won", label: "Successful", align: "right", render: (r) => html`<span class="tiny strong" style="color:var(--success-text)">${r.won || "—"}</span>` },
        { key: "adverse", label: "Adverse", align: "right", render: (r) => html`<span class="tiny strong" style="color:var(--danger-text)">${r.adverse || "—"}</span>` },
        { key: "other", label: "Settled / other", align: "right", render: (r) => html`<span class="tiny">${r.other || "—"}</span>` },
        { key: "unrecorded", label: "Outcome not recorded", align: "right",
          render: (r) => html`<span class=${cx("tiny", r.unrecorded && "strong")} style=${r.unrecorded ? "color:var(--warning-text)" : ""}>${r.unrecorded || "—"}</span>` },
        { key: "rate", label: "Success rate", align: "right",
          render: (r) => (r.rate == null
            ? html`<span class="tiny muted" title="No decided matter on this side has a recorded result">—</span>`
            : html`<${Pill} tone=${r.rate >= 60 ? "green" : r.rate >= 35 ? "amber" : "red"}>${r.rate}%</${Pill}>`) },
        { key: "claims", label: "Claims value", align: "right",
          render: (r) => (r.claims.pkr || r.claims.usd
            ? html`<span class="tiny strong">${[r.claims.pkr && fmt.money(r.claims.pkr, "PKR"), r.claims.usd && fmt.money(r.claims.usd, "USD")].filter(Boolean).join(" · ")}</span>`
            : html`<span class="tiny muted">—</span>`) },
      ]} empty=${html`<div class="empty" style="padding:24px">No case records a position.</div>`} />
    </${Section}>

    <div style="height:16px"></div>

    ${/* MATTER AGING (§73). Active is measured to today, decided to its own
          decision date, so a matter that ran four years and closed does not
          keep aging after it finished. */ ""}
    <${Section} title="Matter aging" icon="clock"
      sub="Active matters are aged from filing to today; decided ones from filing to the decision. Click a bucket to open it.">
      <div class="agebuckets">
        ${m.aging.map((b) => html`<button key=${b.id} type="button" class="agebucket"
          aria-label=${`${b.label}: ${b.active} active, ${b.decided} decided`}
          onClick=${() => open("age", b.label)}>
          <span class="agebucket__n">${b.active + b.decided}</span>
          <span class="agebucket__l">${b.label}</span>
          <span class="agebucket__s">${b.active} active · ${b.decided} decided</span>
        </button>`)}
      </div>
      ${m.unaged > 0 && html`<div class="tiny muted" style="margin-top:10px">
        ${m.unaged} case${m.unaged === 1 ? "" : "s"} carry no filing date, so they cannot be aged.</div>`}
    </${Section}>

    <div style="height:16px"></div>

    ${/* LAW FIRM ANALYSIS (§72). The success-rate denominator excludes active
          matters and decided ones with no recorded result — both are shown as
          their own columns so the reader can see what the rate is NOT built on. */ ""}
    <${Section} title="Law firm analysis" icon="briefcase"
      sub="Success rate is Won ÷ decided-with-a-recorded-result — active matters and unrecorded outcomes are excluded from it and shown separately. Billed is what the firm has invoiced against its matters plus its own retainers, so the rate can be read against what it cost."
      actions=${html`<div class="row" style="gap:6px">
        ${[["cases", "Most matters"], ["rate", "Success rate"], ["claims", "Claim value"], ["cost", "Billed"]].map(([id, label]) =>
          html`<${Chip} key=${id} active=${firmSort === id} onClick=${() => setFirmSort(id)}>${label}</${Chip}>`)}
      </div>`}>
      <${DataTable} onRow=${(r) => open("counsel", r.firm)} rows=${firms.slice(0, 25)} columns=${[
        { key: "firm", label: "Law firm / counsel", render: (r) => html`<div class="cell-strong">${r.firm}</div>
          <div class="tiny muted">${r.cases.length} matter${r.cases.length === 1 ? "" : "s"}</div>` },
        { key: "active", label: "Active", align: "right", render: (r) => html`<span class="tiny">${r.active}</span>` },
        { key: "decided", label: "Decided", align: "right", render: (r) => html`<span class="tiny">${r.decided}</span>` },
        { key: "won", label: "Successful", align: "right", render: (r) => html`<span class="tiny strong" style="color:var(--success-text)">${r.won || "—"}</span>` },
        { key: "adverse", label: "Adverse", align: "right", render: (r) => html`<span class="tiny strong" style="color:var(--danger-text)">${r.adverse || "—"}</span>` },
        { key: "other", label: "Settled / other", align: "right", render: (r) => html`<span class="tiny">${r.other || "—"}</span>` },
        { key: "unrecorded", label: "Outcome not recorded", align: "right",
          render: (r) => html`<span class=${cx("tiny", r.unrecorded && "strong")} style=${r.unrecorded ? "color:var(--warning-text)" : ""}>${r.unrecorded || "—"}</span>` },
        { key: "successRate", label: "Success rate", align: "right",
          render: (r) => (r.successRate == null
            ? html`<span class="tiny muted" title="No decided matter with a recorded result">—</span>`
            : html`<${Pill} tone=${r.successRate >= 60 ? "green" : r.successRate >= 35 ? "amber" : "red"}>${r.successRate}%</${Pill}>`) },
        { key: "claims", label: "Claims value", align: "right",
          render: (r) => (r.claims.pkr || r.claims.usd
            ? html`<span class="tiny strong">${[r.claims.pkr && fmt.money(r.claims.pkr, "PKR"), r.claims.usd && fmt.money(r.claims.usd, "USD")].filter(Boolean).join(" · ")}</span>`
            : html`<span class="tiny muted">—</span>`) },
        /* WHAT THE RATE COST. Invoices billed against the firm's matters plus
           the firm's own retainers, from the same ledger as Invoices & Spend.
           Currencies stay apart, as everywhere else on this page. */
        { key: "cost", label: "Billed", align: "right", render: (r) => {
          if (spend === undefined) return html`<span class="tiny muted">…</span>`;
          if (spend === null) return html`<span class="tiny muted" title="The spend ledger could not be read">n/a</span>`;
          const g = costOf.get(r.firm);
          if (!g) return html`<span class="tiny muted" title="No invoice or retainer is recorded against this firm">—</span>`;
          const parts = Object.entries(g.byCurrency || {})
            .filter(([, v]) => v.invoiced > 0)
            .map(([ccy, v]) => fmt.money(v.invoiced, ccy));
          return parts.length
            ? html`<span class="tiny strong">${parts.join(" · ")}</span>`
            : html`<span class="tiny muted">—</span>`;
        } },
        { key: "paid", label: "Paid", align: "right", render: (r) => {
          const g = costOf.get(r.firm);
          if (spend == null || !g) return html`<span class="tiny muted">—</span>`;
          const parts = Object.entries(g.byCurrency || {})
            .filter(([, v]) => v.paid > 0).map(([ccy, v]) => fmt.money(v.paid, ccy));
          return parts.length ? html`<span class="tiny">${parts.join(" · ")}</span>` : html`<span class="tiny muted">—</span>`;
        } },
      ]} empty=${html`<div class="empty" style="padding:30px">No counsel is recorded on any case.</div>`} />
      ${spend === null && html`<div class="tiny muted" style="margin-top:10px">
        The spend ledger could not be read for your access, so the Billed and Paid columns are
        blank rather than zero — no invoice figure is being asserted here.</div>`}
    </${Section}>

    <div style="height:16px"></div>

    <div class="grid grid--2">
      <${Section} title="Company breakdown" icon="building" sub="cases per group entity — click to filter">
        <${HBars} data=${m.byEntity} gap=${9} format=${(v) => v + " case" + (v === 1 ? "" : "s")}
          onItem=${(d) => open("entity", d.label)} />
      </${Section}>
      <${Section} title="Case type" icon="tag" sub="click a type to filter">
        <${HBars} data=${m.byType} gap=${9} format=${(v) => v + " case" + (v === 1 ? "" : "s")}
          onItem=${(d) => open("type", d.label)} />
      </${Section}>
      <${Section} title="Court / forum" icon="gavel" sub="click a forum to filter">
        <${HBars} data=${m.byCourt} gap=${9} format=${(v) => v + " case" + (v === 1 ? "" : "s")}
          onItem=${(d) => open("court", d.label)} />
      </${Section}>
      <${Section} title="City" icon="mapPin"
        sub="Read from the forum name — the litigation trackers carry no city column. Cases whose forum names no city are not shown.">
        ${m.byCity.length
          ? html`<${HBars} data=${m.byCity} gap=${9} format=${(v) => v + " case" + (v === 1 ? "" : "s")}
              onItem=${(d) => open("city", d.label)} />`
          : html`<div class="tiny muted">No forum in the register names a recognised city.</div>`}
      </${Section}>
    </div>
  </div>`;
}
