// Reports & Analytics — LIVE. Every number on this page is computed from the
// Drive registers (contracts, litigation, notices, licences, loans, resolutions,
// properties) and the template library, and every KPI/chart/table recomputes
// when the filter changes. Nothing here is hard-coded; the four category tabs are
// four lenses on the same live data. Drill-downs open the module behind the
// number. (This replaced a fully seeded DASH.* mock — same visual language, real
// data underneath.)
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Metric, Section, Btn, Pill, Segmented } from "../ui.js";
import { Donut, HBars, BarChart } from "../charts.js";
import { PageHead } from "../parts.js";
import { navigate } from "../router.js";
import { toUsd, entityName } from "../data.js";
import { useRegister, useTemplateLibrary } from "../live.js";
import { RegisterShell } from "../register.js";
import { reportFields, reportSearchKeys } from "../registerdefs.js";
import { isActiveStatus } from "../compliancemodules.js";

const CATS = [
  { value: "portfolio", label: "Portfolio" },
  { value: "litigation", label: "Litigation" },
  { value: "compliance", label: "Compliance" },
  { value: "projects", label: "Projects" },
];

const PALETTE = ["#0d7a3f", "#27a96d", "#0891b2", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
const tally = (rows, keyOf) => {
  const m = new Map();
  for (const r of rows) { const k = keyOf(r) || "—"; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const toChart = (pairs, cap = 8) => pairs.slice(0, cap).map(([label, value], i) => ({ label: String(label), value, color: PALETTE[i % PALETTE.length] }));

// The date window the filter selected, resolved to [from,to] (or null).
const inWin = (dateStr, win) => { if (!win) return true; if (!dateStr) return false; const t = new Date(dateStr).getTime(); return t >= win[0].getTime() && t <= win[1].getTime(); };
// Cross-cutting narrow for the non-contract families: entity + date window only
// (contract-specific dims like type/status don't apply to a court case or a loan,
// so they never silently zero those families out).
/* Entity and a date window are the only two things all SEVEN registers share, so
   they are what cuts across them. Each register supplies its own date field —
   a case has a filing date, a notice has a notice date, a licence has an expiry —
   because there is no single "date" column across a legal estate. */
function narrow(rows, ents, win, entityOf, dateOf) {
  return rows.filter((r) => (!ents.length || ents.includes(entityOf(r))) && (!win || inWin(dateOf(r), win)));
}
const DAYS_BACK = { p7: 7, p30: 30, p90: 90, p365: 365 };
// inWin takes [from, to].
function windowFromPreset(preset) {
  const n = DAYS_BACK[preset];
  if (!n) return null;
  return [new Date(Date.now() - n * 86400000), new Date()];
}

export default function Reports() {
  const [cat, setCat] = useState("portfolio");

  const C = useRegister("contracts");
  const L = useRegister("litigation");
  const N = useRegister("notices");
  const Li = useRegister("licences");
  const Lo = useRegister("loans");
  const R = useRegister("resolutions");
  const P = useRegister("properties");
  const T = useTemplateLibrary();

  const contracts = C.rows || [];
  const loading = C.loading || L.loading || Li.loading || Lo.loading || R.loading || P.loading;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Reports & Analytics"
      sub="Live across every register — filter once and every KPI, chart and table recomputes."
      actions=${html`<${Btn} variant="ghost" icon="download" onClick=${() => window.print()}>Export PDF</${Btn}>`} />

    <${RegisterShell}
      ns="rpt" rows=${contracts}
      fields=${reportFields({ entityName })}
      searchKeys=${reportSearchKeys}
      searchPlaceholder="Search contracts…"
      noun=${["contract", "contracts"]}
      exportName="reports-contracts">
      ${(f) => {
        // Contracts get the full filter set; the other six registers get the two
        // dimensions they all genuinely share — entity and a date window.
        const ents = f.active.entity || [];
        const win = windowFromPreset((f.active.start || [])[0]);
        const fC = f.filtered;
        const fL = narrow(L.rows || [], ents, win, (r) => r.entity, (r) => r.filingDate || r.nextHearing);
        const fN = narrow(N.rows || [], ents, win, (r) => r.recipient, (r) => r.noticeDate);
        const fLi = narrow(Li.rows || [], ents, win, (r) => r.entity, (r) => r.expiry);
        const fLo = narrow(Lo.rows || [], ents, win, (r) => r.borrower, (r) => r.agreementDate);
        const fR = narrow(R.rows || [], ents, win, (r) => r.entity, (r) => r.date);
        const fP = narrow(P.rows || [], ents, win, (r) => r.entity, (r) => r.start);
        const now = Date.now();
        const activeC = fC.filter((c) => isActiveStatus(c.status)).length;
        const expiredC = fC.filter((c) => /expired|terminated/i.test(c.status || "")).length;
        const expiring90 = fC.filter((c) => { const d = (new Date(c.expiry) - now) / 86400000; return d >= 0 && d <= 90; }).length;
        const liveValue = fC.filter((c) => !/expired|terminated|archived/i.test(c.status || "")).reduce((s2, c) => s2 + toUsd(c.value || 0, c.currency), 0);
        const openLit = fL.filter((c) => !/closed|settled|disposed|decided|withdrawn/i.test(c.status || "")).length;
        const licAtRisk = fLi.filter((l) => l.daysToExpiry != null && l.daysToExpiry < 90).length;
        const loanValuePkr = fLo.filter((l) => l.currency === "PKR" || !l.currency).reduce((s2, l) => s2 + (l.amount || 0), 0);
        const projectCount = new Set(fP.map((r) => r.project)).size;
        const projectDocs = (() => { const st = new Set(); fP.forEach((r) => (r.driveFiles || []).forEach((x) => st.add(x.id))); return st.size; })();
        const kpiBand = html`<div class="grid grid--kpi" style="margin-bottom:16px">
          <${Metric} label="Contracts" value=${fmt.num(fC.length)} icon="file" tone="blue" foot="in scope · click to open" onClick=${() => navigate("/contracts")} />
          <${Metric} label="Litigation cases" value=${fmt.num(fL.length)} icon="gavel" tone="purple" foot=${openLit + " open"} onClick=${() => navigate("/litigation")} />
          <${Metric} label="Legal notices" value=${fmt.num(fN.length)} icon="mail" tone="amber" foot="sent & received" onClick=${() => navigate("/m/notices")} />
          <${Metric} label="Licences" value=${fmt.num(fLi.length)} icon="shield" tone=${licAtRisk ? "red" : "green"} foot=${licAtRisk ? licAtRisk + " within 90d/expired" : "all valid"} onClick=${() => navigate("/compliance/licenses")} />
          <${Metric} label="Loans" value=${fmt.num(fLo.length)} icon="dollar" tone="blue" foot=${loanValuePkr ? fmt.money(loanValuePkr, "PKR") : "agreements"} onClick=${() => navigate("/compliance/loans")} />
          <${Metric} label="Resolutions" value=${fmt.num(fR.length)} icon="checksquare" tone="green" foot="board resolutions" onClick=${() => navigate("/compliance/resolutions")} />
          <${Metric} label="Properties" value=${fmt.num(fP.length)} icon="building" tone="purple" foot=${projectCount + " projects"} onClick=${() => navigate("/projects")} />
          <${Metric} label="Templates" value=${fmt.num((T.items || []).length)} icon="template" tone="blue" foot="contract library" onClick=${() => navigate("/templates")} />
        </div>`;
        return loading ? html`<div class="card card--pad center tiny muted" style="padding:48px;text-align:center">Loading live registers…</div>` : html`
    ${kpiBand}
    <div style="margin-bottom:16px"><${Segmented} value=${cat} onChange=${setCat} options=${CATS} /></div>

    ${cat === "portfolio" && html`<div class="col fade-in" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Contracts in scope" value=${fmt.num(fC.length)} icon="file" tone="blue" onClick=${() => navigate("/contracts")} />
        <${Metric} label="Active" value=${fmt.num(activeC)} icon="checkcircle" tone="green" onClick=${() => navigate("/tracker")} />
        <${Metric} label="Expiring ≤90d" value=${fmt.num(expiring90)} icon="clock" tone="amber" onClick=${() => navigate("/contracts")} />
        <${Metric} label="Live value (USD eq.)" value=${fmt.money(liveValue)} icon="dollar" tone="blue" />
      </div>
      <div class="grid" style="grid-template-columns:1.4fr 1fr">
        <${Section} title="Contracts by type" icon="barchart" sub=${fC.length + " in scope"}>
          <${BarChart} data=${toChart(tally(fC, (c) => c.contractType || c.type), 8)} format=${(v) => fmt.num(v)} /></${Section}>
        <${Section} title="By status" icon="pie">
          <${Donut} data=${toChart(tally(fC, (c) => c.status), 6)} size=${150} centerValue=${fmt.num(fC.length)} centerLabel="Contracts" /></${Section}>
      </div>
      <div class="grid grid--2">
        <${Section} title="Top entities (by count)" icon="building"><${HBars} data=${toChart(tally(fC, (c) => c.entityName), 8)} format=${(v) => fmt.num(v)} /></${Section}>
        <${Section} title="Top locations" icon="mapPin"><${HBars} data=${toChart(tally(fC.filter((c) => c.city), (c) => c.city), 8)} format=${(v) => fmt.num(v)} /></${Section}>
      </div>
    </div>`}

    ${cat === "litigation" && html`<div class="col fade-in" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Cases" value=${fmt.num(fL.length)} icon="gavel" tone="purple" onClick=${() => navigate("/litigation")} />
        <${Metric} label="Open" value=${fmt.num(openLit)} icon="alertTriangle" tone="amber" onClick=${() => navigate("/litigation")} />
        <${Metric} label="Legal notices" value=${fmt.num(fN.length)} icon="mail" tone="blue" onClick=${() => navigate("/litigation")} />
        <${Metric} label="Cases with documents" value=${fmt.num(fL.filter((c) => (c.driveFiles || []).length).length)} icon="paperclip" tone="green" />
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <${Section} title="Cases by status" icon="pie"><${Donut} data=${toChart(tally(fL, (c) => c.status), 6)} size=${150} centerValue=${fmt.num(fL.length)} centerLabel="Cases" /></${Section}>
        <${Section} title="Cases by court / forum" icon="barchart"><${HBars} data=${toChart(tally(fL.filter((c) => c.court), (c) => c.court), 8)} format=${(v) => fmt.num(v)} /></${Section}>
      </div>
      <${Section} title="Notices by category" icon="mail"><${BarChart} data=${toChart(tally(fN, (c) => c.category), 8)} format=${(v) => fmt.num(v)} /></${Section}>
    </div>`}

    ${cat === "compliance" && html`<div class="col fade-in" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Licences" value=${fmt.num(fLi.length)} icon="shield" tone=${licAtRisk ? "red" : "green"} onClick=${() => navigate("/compliance")} />
        <${Metric} label="Loans" value=${fmt.num(fLo.length)} icon="dollar" tone="blue" onClick=${() => navigate("/compliance")} />
        <${Metric} label="Loan value (PKR)" value=${loanValuePkr ? fmt.money(loanValuePkr, "PKR") : "—"} icon="trendingUp" tone="blue" />
        <${Metric} label="Resolutions" value=${fmt.num(fR.length)} icon="checksquare" tone="green" onClick=${() => navigate("/compliance")} />
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <${Section} title="Licences by status" icon="pie"><${Donut} data=${toChart(tally(fLi, (c) => c.status), 6)} size=${150} centerValue=${fmt.num(fLi.length)} centerLabel="Licences" /></${Section}>
        <${Section} title="Loans by lender" icon="barchart"><${HBars} data=${toChart(tally(fLo.filter((l) => l.lender), (l) => l.lender), 8)} format=${(v) => fmt.num(v)} /></${Section}>
      </div>
      <${Section} title="Resolutions by entity" icon="building" sub=${fR.length + " in scope"}><${HBars} data=${toChart(tally(fR, (c) => c.entity), 10)} format=${(v) => fmt.num(v)} /></${Section}>
    </div>`}

    ${cat === "projects" && html`<div class="col fade-in" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Projects" value=${fmt.num(projectCount)} icon="building" tone="purple" onClick=${() => navigate("/projects")} />
        <${Metric} label="Property records" value=${fmt.num(fP.length)} icon="grid" tone="blue" onClick=${() => navigate("/projects")} />
        <${Metric} label="Project documents" value=${fmt.num(projectDocs)} icon="paperclip" tone="green" />
        <${Metric} label="Cities" value=${fmt.num(new Set(fP.map((r) => r.city).filter(Boolean)).size)} icon="mapPin" tone="amber" />
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <${Section} title="Properties by city" icon="pie"><${Donut} data=${toChart(tally(fP.filter((r) => r.city), (r) => r.city), 6)} size=${150} centerValue=${fmt.num(fP.length)} centerLabel="Properties" /></${Section}>
        <${Section} title="Top projects (by documents)" icon="barchart">
          <${HBars} data=${(() => { const m = new Map(); fP.forEach((r) => { const s = m.get(r.project) || new Set(); (r.driveFiles || []).forEach((f) => s.add(f.id)); m.set(r.project, s); }); return toChart([...m.entries()].map(([k, s]) => [k, s.size]).sort((a, b) => b[1] - a[1]), 8); })()} format=${(v) => fmt.num(v)} /></${Section}>
      </div>
    </div>`}
    `;
      }}
    </${RegisterShell}>
  </div>`;
}
