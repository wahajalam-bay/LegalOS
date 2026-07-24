// Reports & Analytics.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Metric, Section, Btn, Pill, Avatar, Segmented, Progress } from "../ui.js";
import { Donut, AreaTrend, StackBar, HBars, Funnel, BarChart, Gauge, Spark } from "../charts.js";
import { PageHead } from "../parts.js";
import { DASH, nameOf } from "../data.js";

const CATS = [
  { value: "ops", label: "Operations" },
  { value: "risk", label: "Risk" },
  { value: "productivity", label: "Productivity" },
  { value: "financial", label: "Financial" },
];

function RiskMatrix() {
  const cells = [
    [2, 5, 11, 18], [4, 9, 22, 14], [8, 19, 12, 6], [15, 24, 7, 3],
  ];
  const likelihood = ["Rare", "Possible", "Likely", "Frequent"];
  const impact = ["Low", "Medium", "High", "Critical"];
  const color = (r, c) => {
    const sev = r + c;
    if (sev >= 5) return "rgba(239,68,68,0.9)";
    if (sev >= 4) return "rgba(249,115,22,0.85)";
    if (sev >= 2) return "rgba(245,158,11,0.8)";
    return "rgba(34,197,94,0.8)";
  };
  return html`<div class="row" style="gap:12px;align-items:stretch">
    <div class="col center" style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:600;color:var(--text-3)">Likelihood →</div>
    <div style="flex:1">
      <div class="heat" style="grid-template-columns:repeat(4,1fr)">
        ${cells.map((row, ri) => row.map((v, ci) => html`<div key=${ri + "-" + ci} class="heat__cell" style=${`background:${color(3 - ri, ci)};color:#fff;aspect-ratio:1.9;font-size:13px`}>${v}</div>`))}
      </div>
      <div class="row" style="margin-top:6px">${impact.map((i) => html`<div key=${i} class="tiny muted" style="flex:1;text-align:center">${i}</div>`)}</div>
      <div class="tiny muted center" style="margin-top:2px">Impact →</div>
    </div>
  </div>`;
}

export default function Reports() {
  const [cat, setCat] = useState("ops");
  const lawyerData = DASH.lawyerLoad.map((l) => ({ label: nameOf(l.name).split(" ")[0], value: Math.round((l.assigned / l.capacity) * 100), color: l.assigned / l.capacity > 0.85 ? "#dc2626" : "#0d7a3f" }));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Reports & Analytics" sub="100+ operational, risk and financial views — built for the boardroom."
      actions=${html`<${Btn} variant="ghost" icon="calendar">Last 6 months</${Btn}><${Btn} variant="ghost" icon="download">Export PDF</${Btn}>`} />

    <div style="margin-bottom:18px"><${Segmented} value=${cat} onChange=${setCat} options=${CATS} /></div>

    ${cat === "ops" && html`<div class="col fade-in" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Avg. Review Time" value="1.8d" icon="clock" tone="green" trend="-22%" trendDir="down" />
        <${Metric} label="Avg. Approval Time" value="0.9d" icon="checksquare" tone="blue" trend="-15%" trendDir="down" />
        <${Metric} label="Requests / month" value="154" icon="inbox" tone="purple" trend="+18%" trendDir="up" />
        <${Metric} label="Self-serve rate" value="41%" icon="sparkles" tone="green" trend="+9%" trendDir="up" />
      </div>
      <div class="grid" style="grid-template-columns:1.5fr 1fr">
        <${Section} title="Contract Volume by Type" icon="barchart"><${StackBar} data=${DASH.volumeTrend} keys=${["NDA", "Vendor", "Employment"]} colors=${["#0d7a3f", "#27a96d", "#0891b2"]} height=${230} /></${Section}>
        <${Section} title="Request Pipeline" icon="filter"><div style="padding-top:8px"><${Funnel} data=${DASH.requestFunnel} /></div></${Section}>
      </div>
      <div class="grid grid--2">
        <${Section} title="Turnaround Trend" icon="activity"><${AreaTrend} data=${DASH.tatTrend} labels=${DASH.tatLabels} color="#22c55e" /></${Section}>
        <${Section} title="Workload by Business Unit" icon="briefcase"><${HBars} data=${DASH.buWorkload} /></${Section}>
      </div>
    </div>`}

    ${cat === "risk" && html`<div class="col" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Portfolio Risk Score" value="72/100" icon="shield" tone="amber" trend="-3" trendDir="down" />
        <${Metric} label="Critical Contracts" value="43" icon="alertTriangle" tone="red" trend="+5" trendDir="up" />
        <${Metric} label="High-Risk Clauses" value="128" icon="flag" tone="amber" trend="-8" trendDir="down" />
        <${Metric} label="Compliance Score" value="84/100" icon="checkcircle" tone="green" trend="+2" trendDir="up" />
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
        <${Section} title="Risk Distribution" icon="pie"><${Donut} data=${DASH.riskDist} centerValue="1,284" centerLabel="Contracts" /></${Section}>
        <${Section} title="Risk Matrix" icon="grid" sub="Contracts by likelihood × impact"><${RiskMatrix} /></${Section}>
        <${Section} title="Vendor Risk (top)" icon="briefcase"><${HBars} data=${[{ label: "ACWA Power", value: 92, color: "#ef4444" }, { label: "AWS", value: 78, color: "#f97316" }, { label: "STC", value: 71, color: "#f97316" }, { label: "Deloitte", value: 54, color: "#f59e0b" }, { label: "Microsoft", value: 28, color: "#22c55e" }]} format=${(v) => v + ""} /></${Section}>
      </div>
    </div>`}

    ${cat === "productivity" && html`<div class="col" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Matters Closed (mo)" value="86" icon="checkcircle" tone="green" trend="+12%" trendDir="up" />
        <${Metric} label="Avg. Lawyer Load" value="83%" icon="users" tone="amber" trend="+4%" trendDir="up" />
        <${Metric} label="AI Hours Saved" value=${fmt.num(DASH.kpis.aiSaved)} icon="sparkles" tone="purple" trend="+240" trendDir="up" />
        <${Metric} label="Automation Rate" value="37%" icon="zap" tone="blue" trend="+11%" trendDir="up" />
      </div>
      <div class="grid grid--2">
        <${Section} title="Lawyer Utilization" icon="users" sub="Assigned vs. capacity"><${HBars} data=${lawyerData} format=${(v) => v + "%"} /></${Section}>
        <${Section} title="Team Capacity" icon="target">
          <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px">
            ${DASH.lawyerLoad.map((l) => html`<div key=${l.name} class="card card--pad col center" style="gap:6px">
              <${Gauge} value=${Math.round((l.assigned / l.capacity) * 100)} label=${nameOf(l.name).split(" ")[0]} tone=${l.assigned / l.capacity > 0.85 ? "#ef4444" : "#22c55e"} size=${120} />
            </div>`)}
          </div>
        </${Section}>
      </div>
    </div>`}

    ${cat === "financial" && html`<div class="col" style="gap:16px">
      <div class="grid grid--kpi">
        <${Metric} label="Portfolio Value" value=${fmt.money(DASH.kpis.contractValue)} icon="dollar" tone="blue" trend="+14%" trendDir="up" />
        <${Metric} label="Renewal Value (90d)" value="$42M" icon="refresh" tone="amber" trend="+6%" trendDir="up" />
        <${Metric} label="Automation Savings" value="$3.2M" icon="zap" tone="green" trend="+28%" trendDir="up" />
        <${Metric} label="Outside Counsel Spend" value="$1.8M" icon="briefcase" tone="purple" trend="-9%" trendDir="down" />
      </div>
      <div class="grid grid--2">
        <${Section} title="Contract Value by Business Unit" icon="barchart"><${BarChart} data=${DASH.buWorkload.map((b) => ({ label: b.label.split(" ")[0], value: b.value * 380000 }))} format=${(v) => fmt.money(v)} /></${Section}>
        <${Section} title="Renewal Value Trend" icon="trendingUp"><${AreaTrend} data=${[18, 22, 19, 28, 34, 42]} labels=${["Feb", "Mar", "Apr", "May", "Jun", "Jul"]} color="#0d7a3f" /></${Section}>
      </div>
    </div>`}
  </div>`;
}
