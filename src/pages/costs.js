// Cost Tracking & Analysis (FRD Section 13) — how much Legal spends, per team,
// per requesting department and per module; budget vs actual by period; the
// inspections year-over-year comparison; and a CSV export for Finance.
// Charts reuse the validated exec visualization system (RankBars / Meter /
// TableTwin) — one hue for nominal comparisons, colour only where it means something.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Empty, Segmented } from "../ui.js";
import { navigate } from "../router.js";
import { toUsd, entityName } from "../data.js";
import { LEGAL_TEAMS, teamShort, teamTone } from "../org.js";
import { MODULES, moduleByKey } from "../modules.js";
import { useCollection, personName } from "../store.js";
import { useActiveUser } from "../rbac.js";
import { RankBars, Meter, TableTwin } from "../execviz.js";

const money = (v) => "$" + Math.round(v).toLocaleString();

function windowFor(preset) {
  const now = new Date();
  if (preset === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (preset === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

export default function Costs() {
  const all = useCollection("modRequests");
  const budgets = useCollection("costBudgets");
  const viewer = useActiveUser();
  const [period, setPeriod] = useState("quarter");
  const [basis, setBasis] = useState("actual"); // actual | estimated

  // Only Legal (and the head) should read the cost book; a business head sees
  // what their own department generates.
  const scopeAll = viewer.rbac === "head" || !!viewer.legalTeam;

  const lines = useMemo(() => {
    const from = windowFor(period);
    const out = [];
    for (const r of all) {
      if (!scopeAll && r.requestingDept !== viewer.dept) continue;
      const when = new Date(r.closedAt || r.dateRaised);
      for (const c of r.costs || []) {
        const amount = basis === "actual" ? c.actual : (c.estimated != null ? c.estimated : c.actual);
        if (amount == null) continue;
        out.push({
          rec: r, cost: c,
          usd: toUsd(amount, c.currency),
          inWindow: when >= from,
        });
      }
    }
    return out;
  }, [all, period, basis, viewer]);

  const inWindow = lines.filter((l) => l.inWindow);
  const sumBy = (keyFn) => {
    const m = {};
    inWindow.forEach((l) => { const k = keyFn(l); m[k] = (m[k] || 0) + l.usd; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  };

  const byTeam = sumBy((l) => teamShort(l.rec.legalTeam));
  const byDept = sumBy((l) => l.rec.requestingDept);
  const byModule = sumBy((l) => (moduleByKey(l.rec.moduleKey) || {}).label || l.rec.moduleKey);
  const byType = sumBy((l) => l.cost.type);
  const total = inWindow.reduce((a, l) => a + l.usd, 0);
  const recharged = inWindow.filter((l) => l.cost.attribution === "Recharged to requesting department").reduce((a, l) => a + l.usd, 0);

  // Budget vs actual — quarterly team budgets; scale to the selected window.
  const scale = period === "month" ? 1 / 3 : period === "quarter" ? 1 : 4;
  const teamActual = Object.fromEntries(byTeam.map((x) => [x.label, x.value]));

  // Section 13.2 / 8.6 — inspections cost, current vs forthcoming year.
  const inspections = all.filter((r) => r.moduleKey === "inspections" && (r.fields || {}).costCurrentYear != null);
  const inspCur = inspections.reduce((a, r) => a + toUsd(r.fields.costCurrentYear, "PKR"), 0);
  const inspNext = inspections.reduce((a, r) => a + toUsd(r.fields.costForthcomingYear || r.fields.costCurrentYear, "PKR"), 0);

  const exportCsv = () => {
    const rows = [
      ["Record", "Module", "Legal team", "Requesting dept", "Cost type", "Estimated", "Actual", "Currency", "USD (actual/est)", "Vendor/payee", "Invoice", "Approved by", "Attribution", "Date"],
      ...lines.map((l) => [
        l.rec.id, (moduleByKey(l.rec.moduleKey) || {}).label, teamShort(l.rec.legalTeam), l.rec.requestingDept,
        l.cost.type, l.cost.estimated != null ? l.cost.estimated : "", l.cost.actual != null ? l.cost.actual : "",
        l.cost.currency, Math.round(l.usd), l.cost.vendorId ? entityName(l.cost.vendorId) : "",
        l.cost.invoiceNo || "", l.cost.approvedBy ? personName(l.cost.approvedBy) : "",
        l.cost.attribution || "", String(l.rec.closedAt || l.rec.dateRaised).slice(0, 10),
      ]),
    ];
    const csv = "﻿" + rows.map((r) => r.map((v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "legal-costs.csv";
    a.click();
  };

  return html`<div class="page">
    <div class="page__head">
      <div>
        <h2 class="page__title">Cost Analysis</h2>
        <div class="page__sub">
          ${scopeAll
            ? "Spend per module and per department, normalized to USD for comparison."
            : `What ${viewer.dept} generates in Legal cost or recharge.`}
        </div>
      </div>
      <div class="row" style="gap:8px">
        <${Segmented} options=${[{ value: "actual", label: "Actuals" }, { value: "estimated", label: "Estimates" }]} value=${basis} onChange=${setBasis} />
        <${Segmented} options=${[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} value=${period} onChange=${setPeriod} />
        <${Btn} icon="download" onClick=${exportCsv}>Export for Finance</${Btn}>
      </div>
    </div>

    <div class="modkpis">
      <div class="modkpi modkpi--blue"><div class="modkpi__n">${money(total)}</div><div class="modkpi__l">Legal cost this ${period}</div></div>
      <div class="modkpi modkpi--amber"><div class="modkpi__n">${money(recharged)}</div><div class="modkpi__l">Recharged to departments</div></div>
      <div class="modkpi modkpi--gray"><div class="modkpi__n">${money(total - recharged)}</div><div class="modkpi__l">On Legal's own budget</div></div>
      <div class="modkpi modkpi--green"><div class="modkpi__n">${inspNext <= inspCur ? "↓ " : "↑ "}${money(Math.abs(inspNext - inspCur))}</div><div class="modkpi__l">Inspections YoY ${inspNext <= inspCur ? "reduction" : "increase"}</div></div>
    </div>

    ${scopeAll && html`<div class="card">
      <div class="strong" style="font-size:13.5px;margin-bottom:4px">Budget vs actual — by Legal team</div>
      <div class="tiny muted" style="margin-bottom:12px">Quarterly budgets scaled to the selected window. The meter fills as the budget burns.</div>
      <div class="costmeters">
        ${LEGAL_TEAMS.map((t) => {
          const b = (budgets.find((x) => x.team === t.key) || {}).quarterUsd || 0;
          const scaled = b * scale;
          const a = teamActual[t.short] || 0;
          return html`<div key=${t.key}>
            <${Meter} value=${Math.round(a)} max=${Math.max(1, Math.round(scaled))}
              label=${t.short}
              soWhat=${`${money(a)} of ${money(scaled)} ${basis === "actual" ? "spent" : "committed"} — ${a > scaled ? "over budget" : Math.round((a / Math.max(1, scaled)) * 100) + "% used"}`}
              tone=${a > scaled ? "red" : a > scaled * 0.8 ? "amber" : "green"} />
          </div>`;
        })}
      </div>
    </div>`}

    <div class="costcols">
      <div class="card">
        <div class="strong" style="font-size:13.5px;margin-bottom:10px">Cost by requesting department</div>
        ${byDept.length ? html`<${RankBars} data=${byDept} format=${money} />` : html`<${Empty} icon="dollar" title="No cost lines" text="Nothing in this window." />`}
      </div>
      <div class="card">
        <div class="strong" style="font-size:13.5px;margin-bottom:10px">Cost by module</div>
        ${byModule.length ? html`<${RankBars} data=${byModule} format=${money} />` : html`<${Empty} icon="dollar" title="No cost lines" text="Nothing in this window." />`}
      </div>
    </div>

    <div class="costcols">
      <div class="card">
        <div class="strong" style="font-size:13.5px;margin-bottom:10px">Cost by type</div>
        ${byType.length ? html`<${RankBars} data=${byType} format=${money} />` : html`<div class="tiny muted">Nothing in this window.</div>`}
        <${TableTwin} rows=${byType.map((x) => [x.label, money(x.value)])} cols=${["Cost type", "USD"]} />
      </div>
      <div class="card">
        <div class="strong" style="font-size:13.5px;margin-bottom:4px">Compliance inspections — cost per office</div>
        <div class="tiny muted" style="margin-bottom:10px">Current year vs forthcoming year (Section 8.6). Green means the cost came down.</div>
        <div class="tablewrap"><table class="table table--tight">
          <thead><tr><th>Office</th><th>Type</th><th>Current yr</th><th>Next yr</th><th>Reduced</th></tr></thead>
          <tbody>${inspections.map((r) => html`<tr key=${r.id} class="clickable" onClick=${() => navigate("/m/inspections/" + r.id)}>
            <td>${r.fields.office}</td>
            <td class="tiny">${r.subType === "Labour Department" ? "Labour" : "Civil Defence"}</td>
            <td>${fmt.moneyFull(r.fields.costCurrentYear, "PKR")}</td>
            <td>${fmt.moneyFull(r.fields.costForthcomingYear || r.fields.costCurrentYear, "PKR")}</td>
            <td>${r.fields.costReduced
              ? html`<${Pill} tone="green">Yes</${Pill}>`
              : html`<${Pill} tone="gray">No</${Pill}>`}</td>
          </tr>`)}</tbody>
        </table></div>
      </div>
    </div>

    ${scopeAll && html`<div class="card" style="padding:0">
      <div class="row" style="padding:14px 16px 4px">
        <span class="strong" style="font-size:13.5px">Cost lines — ${basis}</span>
        <span class="tiny muted">— every entry carries vendor, invoice, sign-off and attribution</span>
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Record</th><th>Team</th><th>Type</th><th>Amount</th><th>USD</th><th>Vendor / payee</th><th>Invoice</th><th>Attribution</th></tr></thead>
        <tbody>${inWindow.slice(0, 30).map((l, i) => html`<tr key=${i} class="clickable" onClick=${() => navigate("/m/" + l.rec.moduleKey + "/" + l.rec.id)}>
          <td class="mono tiny">${l.rec.id}</td>
          <td><${Pill} tone=${teamTone(l.rec.legalTeam)}>${teamShort(l.rec.legalTeam)}</${Pill}></td>
          <td>${l.cost.type}</td>
          <td>${fmt.moneyFull(basis === "actual" ? l.cost.actual : (l.cost.estimated != null ? l.cost.estimated : l.cost.actual), l.cost.currency)}</td>
          <td>${money(l.usd)}</td>
          <td>${l.cost.vendorId ? entityName(l.cost.vendorId) : "—"}</td>
          <td class="mono tiny">${l.cost.invoiceNo || "—"}</td>
          <td class="tiny">${l.cost.attribution === "Recharged to requesting department" ? "Recharged" : "Legal budget"}</td>
        </tr>`)}</tbody>
      </table></div>
    </div>`}
  </div>`;
}
