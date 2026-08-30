// Executive Dashboard.
import { html, fmt, cx } from "../core.js";
import { Icon } from "../icons.js";
import { Metric, Section, Btn, Avatar, Pill, Risk, Status, Progress, AICard } from "../ui.js";
import { Donut, AreaTrend, StackBar, HBars, Funnel } from "../charts.js";
import { navigate } from "../router.js";
import { DASH, AI_INSIGHTS, ACTIVITY, APPROVALS, CONTRACTS, REQUESTS, WORK_CATEGORIES, CATEGORY_TONE, categoryOf, licenseStatus, byId, nameOf, toUsd } from "../data.js";
import { useActiveUser } from "../rbac.js";
import { useCollection } from "../store.js";
import { unifiedRows, rowTat } from "../flow.js";
import { allReminders } from "../reminders.js";

const CAT_HEX = { red: "#dc2626", blue: "#1d6cb0", indigo: "#4338ca", amber: "#d97706", purple: "#7c3aed", green: "#16a34a", gray: "#64748b", orange: "#ea580c" };
const usdOf = (v, c) => toUsd(v, c);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function HeatMap() {
  const shade = (v) => {
    const a = 0.12 + (v / 100) * 0.78;
    return `rgba(13,122,63,${a.toFixed(2)})`;
  };
  return html`<div class="heat" style=${`grid-template-columns:118px repeat(${DASH.heatCols.length},1fr)`}>
    <div></div>
    ${DASH.heatCols.map((c) => html`<div key=${c} class="tiny muted center" style="aspect-ratio:auto;padding-bottom:2px">${c}</div>`)}
    ${DASH.heat.flatMap((r) => [
      html`<div key=${r.row} class="tiny" style="display:flex;align-items:center;color:var(--text-2);font-weight:500">${r.row}</div>`,
      ...r.vals.map((v, i) => html`<div key=${r.row + i} class="heat__cell" style=${`background:${shade(v)};color:${v > 55 ? "#fff" : "var(--brand-600)"}`}>${v}</div>`),
    ])}
  </div>`;
}

export default function Dashboard() {
  const viewer = useActiveUser();
  const k = DASH.kpis;
  const toneBg = { amber: "var(--warning-bg)", red: "var(--danger-bg)", blue: "var(--brand-soft)", purple: "var(--accent-soft)", green: "var(--success-bg)" };
  const toneFg = { amber: "var(--warning)", red: "var(--danger)", blue: "var(--brand)", purple: "var(--accent-500)", green: "var(--success)" };

  // Additive dashboard cards (Features 1, 2, 6) — read live so they stay accurate.
  const licenses = useCollection("licenses");
  const contractsLive = useCollection("contracts");
  const mattersLive = useCollection("matters");
  const requestsLive = useCollection("requests");
  const licAlerts = licenses.filter((l) => licenseStatus(l).key !== "Valid").sort((a, b) => licenseStatus(a).days - licenseStatus(b).days);
  const expiring90 = licenses.filter((l) => ["Expiring", "Critical"].includes(licenseStatus(l).key)).length;
  const licExpired = licenses.filter((l) => licenseStatus(l).key === "Expired").length;
  const totalValUsd = contractsLive.reduce((s, c) => s + usdOf(c.value || 0, c.currency), 0);
  const committedUsd = contractsLive.reduce((s, c) => s + usdOf((c.spendToDate || 0) + (c.committedSpend || 0), c.currency), 0);
  const overspend = contractsLive.filter((c) => (c.value || 0) && ((c.spendToDate || 0) + (c.committedSpend || 0)) > c.value).length;
  const catCounts = {};
  [...contractsLive, ...mattersLive, ...requestsLive].forEach((x) => { const cc = categoryOf(x); catCounts[cc] = (catCounts[cc] || 0) + 1; });
  const catData = WORK_CATEGORIES.map((cn) => ({ label: cn, value: catCounts[cn] || 0, color: CAT_HEX[CATEGORY_TONE[cn]] })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const nearExpiry = CONTRACTS.filter((c) => { const days = (new Date(c.expiry) - Date.now()) / 86400000; return days > 0 && days < 60; }).sort((a, b) => new Date(a.expiry) - new Date(b.expiry)).slice(0, 5);
  const pendingApprovals = APPROVALS.filter((a) => a.status === "pending").slice(0, 4);

  // Sprint 3: what is delayed (with the blocking stage) and which lifecycle
  // milestones are about to fire — both read live off the same engines.
  const repository = useCollection("repository");
  const ctx = { requests: requestsLive, matters: mattersLive, contracts: contractsLive, repository, licenses };
  const delayed = unifiedRows(requestsLive, mattersLive)
    .map((u) => ({ ...u.record, id: u.id, title: u.title, __tat: rowTat(u.record, ctx) }))
    .filter((r) => r.__tat.status === "Delayed")
    .sort((a, b) => b.__tat.overdueBy - a.__tat.overdueBy);
  const reminders = allReminders(contractsLive);

  return html`<div class="page fade-in">
    <div class="pagehead">
      <div class="pagehead__main">
        <div class="pagehead__title">${greeting()}, ${viewer.name.split(" ")[0]}</div>
        <div class="pagehead__sub">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · Here's the state of the legal function today.</div>
      </div>
      <div class="pagehead__actions">
        <${Btn} variant="ghost" icon="download">Export brief</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => navigate("/requests")}>New request</${Btn}>
      </div>
    </div>

    <div class="grid grid--kpi" style="margin-bottom:16px">
      <${Metric} label="Active Contracts" value=${fmt.num(k.activeContracts)} icon="file" tone="blue" trend="+6%" trendDir="up" foot=${html`${k.nearExpiry} nearing expiry`} onClick=${() => navigate("/contracts")} />
      <${Metric} label="Pending Reviews" value=${k.pendingReviews} icon="checkcircle" tone="amber" trend="-12%" trendDir="down" foot=${html`<span style="color:var(--danger)">2 breaching SLA</span>`} onClick=${() => navigate("/reviews")} />
      <${Metric} label="Avg. Turnaround" value=${html`${k.avgTat}<span style="font-size:15px;font-weight:600;color:var(--text-3)"> days</span>`} icon="clock" tone="green" trend="-29%" trendDir="down" foot="Fastest in 12 months" />
      <${Metric} label="Approvals Pending" value=${k.approvalsPending} icon="checksquare" tone="purple" trend="+3" trendDir="up" foot="2 high-value deals" onClick=${() => navigate("/approvals")} />
      <${Metric} label="Compliance Score" value=${html`${k.complianceScore}<span style="font-size:15px;font-weight:600;color:var(--text-3)">/100</span>`} icon="shield" tone="green" trend="+2" trendDir="up" foot="1 area non-compliant" onClick=${() => navigate("/compliance")} />
      <${Metric} label="Portfolio Value" value=${fmt.money(k.contractValue)} icon="dollar" tone="blue" trend="+14%" trendDir="up" foot="Total contracted value" />
      <${Metric} label="Licenses expiring ≤90d" value=${expiring90} icon="fileCheck" tone="amber" foot=${licExpired ? html`<span style="color:var(--danger)">${licExpired} expired</span>` : "All valid beyond 90 days"} onClick=${() => navigate("/licenses")} />
    </div>

    <!-- Sprint 3: what is actually delayed, and which lifecycles are about to fire -->
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <${Section} title="Delayed work" icon="alertTriangle"
        sub="past the auto-fixed TAT — with the stage that is holding it up"
        right=${html`<${Pill} tone=${delayed.length ? "red" : "green"}>${delayed.length} delayed</${Pill}>`} bodyClass="col">
        ${delayed.length === 0
          ? html`<div class="empty" style="padding:20px"><div>Nothing is past its turnaround allowance.</div></div>`
          : delayed.slice(0, 5).map((r) => html`<div key=${r.id} class="feed__item" style="cursor:pointer;align-items:center" onClick=${() => navigate("/workspace/" + r.id)}>
              <div class="notif__ico" style="width:30px;height:30px;background:var(--danger-bg);color:var(--danger)"><${Icon} name="alertTriangle" size=15 /></div>
              <div style="flex:1;min-width:0">
                <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</div>
                <div class="tiny muted">${r.id} · blocked at ${r.__tat.blockingStage} · ${r.__tat.blockingOwner ? nameOf(r.__tat.blockingOwner) : "unassigned"}</div>
              </div>
              <${Pill} tone="red">+${r.__tat.overdueBy}d</${Pill}>
            </div>`)}
        ${delayed.length > 5 && html`<button class="tiny" style="color:var(--brand);font-weight:600;text-align:left;padding:6px 2px" onClick=${() => navigate("/workspace")}>See all ${delayed.length} in the Legal Workspace →</button>`}
      </${Section}>

      <${Section} title="Lifecycle Reminders" icon="bell"
        sub="renewals, notice windows and extracted obligations"
        right=${html`<${Pill} tone=${reminders.some((r) => r.dueDays < 0) ? "red" : "amber"}>${reminders.length} live</${Pill}>`} bodyClass="col">
        ${reminders.length === 0
          ? html`<div class="empty" style="padding:20px"><div>No renewals or notice windows in the next 90 days.</div></div>`
          : reminders.slice(0, 5).map((r) => html`<div key=${r.id} class="feed__item" style="cursor:pointer;align-items:center" onClick=${() => navigate(r.path)}>
              <div class="notif__ico" style=${`width:30px;height:30px;background:${r.tone === "red" ? "var(--danger-bg)" : r.tone === "amber" ? "var(--warning-bg)" : "var(--brand-soft)"};color:${r.tone === "red" ? "var(--danger)" : r.tone === "amber" ? "var(--warning)" : "var(--brand)"}`}><${Icon} name=${r.icon} size=15 /></div>
              <div style="flex:1;min-width:0">
                <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</div>
                <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.detail}</div>
              </div>
              <span class=${cx("tiny strong", r.dueDays < 0 && "risk--critical")} style="width:66px;text-align:right">${r.dueDays < 0 ? Math.abs(r.dueDays) + "d past" : "in " + r.dueDays + "d"}</span>
            </div>`)}
        ${reminders.length > 5 && html`<button class="tiny" style="color:var(--brand);font-weight:600;text-align:left;padding:6px 2px" onClick=${() => navigate("/pipelines")}>See all ${reminders.length} reminders →</button>`}
      </${Section}>
    </div>

    <div class="grid" style="grid-template-columns:1.15fr 1.35fr 1fr;margin-bottom:16px">
      <${Section} title="Risk Distribution" sub="1,284 active contracts" icon="pie">
        <${Donut} data=${DASH.riskDist} centerValue=${fmt.num(DASH.riskDist.reduce((s, r) => s + r.value, 0))} centerLabel="Contracts" />
      </${Section}>
      <${Section} title="Turnaround Time" sub="Avg. days to execute · trending down" icon="activity"
        right=${html`<${Pill} tone="green" dot=${true}>Improving</${Pill}>`}>
        <${AreaTrend} data=${DASH.tatTrend} labels=${DASH.tatLabels} color="#22c55e" height=${210} />
      </${Section}>
      <div class="col" style="gap:16px">
        ${AI_INSIGHTS.slice(0, 2).map((ins, i) => html`<${AICard} key=${i} title=${ins.title}
          action=${html`<button class="tiny" style="color:var(--accent-600);font-weight:600">${ins.action} →</button>`}>${ins.text}</${AICard}>`)}
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1.4fr 1fr;margin-bottom:16px">
      <${Section} title="Contract Volume by Type" sub="New agreements per month" icon="barchart">
        <${StackBar} data=${DASH.volumeTrend} keys=${["NDA", "Vendor", "Employment"]} colors=${["#0d7a3f", "#27a96d", "#0891b2"]} height=${220} />
      </${Section}>
      <${Section} title="Request Pipeline" sub="Intake → Executed conversion" icon="filter">
        <div style="padding-top:8px"><${Funnel} data=${DASH.requestFunnel} /></div>
      </${Section}>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1.5fr;margin-bottom:16px">
      <${Section} title="Workload by Business Unit" sub="Active matters & contracts" icon="briefcase">
        <${HBars} data=${DASH.buWorkload} />
      </${Section}>
      <${Section} title="Department Activity Heatmap" sub="Legal demand intensity by BU × month" icon="grid">
        <${HeatMap} />
      </${Section}>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:16px">
      <${Section} title="License Alerts" icon="fileCheck" right=${html`<${Pill} tone=${licExpired ? "red" : "amber"}>${licAlerts.length} to action</${Pill}>`} bodyClass="col">
        ${licAlerts.length === 0 ? html`<div class="empty" style="padding:20px"><div>All licenses valid — nothing expiring.</div></div>`
          : licAlerts.slice(0, 5).map((l) => { const s = licenseStatus(l); const bg = s.tone === "red" ? "danger" : s.tone === "green" ? "success" : "warning"; return html`<div key=${l.id} class="feed__item" style="cursor:pointer;align-items:center" onClick=${() => navigate("/licenses")}>
            <div class="notif__ico" style=${`width:30px;height:30px;background:var(--${bg}-bg);color:var(--${bg})`}><${Icon} name="fileCheck" size=15 /></div>
            <div style="flex:1;min-width:0"><div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.name}</div><div class="tiny muted">${l.entity} · ${l.jurisdiction}</div></div>
            <${Pill} tone=${s.tone}>${fmt.until(l.expiryDate)}</${Pill}>
          </div>`; })}
      </${Section}>

      <${Section} title="Work by Category" sub="Contracts · matters · requests" icon="grid">
        ${catData.length ? html`<${HBars} data=${catData} format=${(v) => v + ""} />` : html`<div class="empty" style="padding:20px"><div>No categorized work yet.</div></div>`}
      </${Section}>

      <div class="col" style="gap:16px">
        <${AICard} title="Contract spend" action=${html`<button class="tiny" style="color:var(--accent-600);font-weight:600" onClick=${() => navigate("/contracts")}>View contracts →</button>`}>
          <b>${fmt.money(committedUsd)}</b> of <b>${fmt.money(totalValUsd)}</b> total contracted value is committed or spent (${totalValUsd ? Math.round((committedUsd / totalValUsd) * 100) : 0}%).${overspend ? html` <b>${overspend}</b> contract${overspend === 1 ? " is" : "s are"} over budget.` : ""}
        </${AICard}>
        <div class="card card--pad col" style="gap:10px">
          <div class="row"><span class="strong tiny">Portfolio burn</span><div class="spacer"></div><span class="tiny strong">${totalValUsd ? Math.round((committedUsd / totalValUsd) * 100) : 0}%</span></div>
          <${Progress} value=${totalValUsd ? Math.min(100, Math.round((committedUsd / totalValUsd) * 100)) : 0} tone=${overspend ? "amber" : ""} />
          <div class="tiny muted">Committed + spend across all contracts vs. total contracted value.</div>
        </div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1.1fr 1fr 1fr">
      <${Section} title="Recent Activity" icon="activity" right=${html`<button class="tiny muted hoverline">View all</button>`} bodyClass="col">
        ${ACTIVITY.slice(0, 7).map((a) => html`<div key=${a.id} class="feed__item">
          <div class="notif__ico" style=${`width:30px;height:30px;background:${toneBg[a.tone]};color:${toneFg[a.tone]}`}><${Icon} name=${a.icon} size=15 /></div>
          <div style="flex:1"><div class="feed__text"><b>${nameOf(a.user)}</b> ${a.action} <b>${a.target}</b> ${a.detail}</div><div class="feed__time">${fmt.rel(a.time)}</div></div>
        </div>`)}
      </${Section}>

      <${Section} title="Approvals Queue" icon="checksquare" right=${html`<${Pill} tone="amber">${pendingApprovals.length} pending</${Pill}>`} bodyClass="col">
        ${pendingApprovals.map((a) => html`<div key=${a.id} class="approval approval--pending" style="margin-bottom:10px;cursor:pointer" onClick=${() => navigate("/approvals")}>
          <div style="flex:1;min-width:0">
            <div class="strong" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.matter}</div>
            <div class="tiny muted">${a.type} · ${a.role}${a.amount ? " · " + fmt.money(a.amount, a.currency) : ""}</div>
          </div>
          <${Avatar} name=${nameOf(a.approver)} size="sm" />
        </div>`)}
        <${Btn} variant="ghost" size="sm" onClick=${() => navigate("/approvals")}>Review all approvals</${Btn}>
      </${Section}>

      <${Section} title="Upcoming Renewals" icon="refresh" right=${html`<${Pill} tone="red">${k.nearExpiry} soon</${Pill}>`} bodyClass="col">
        ${nearExpiry.map((c) => {
          const days = Math.round((new Date(c.expiry) - Date.now()) / 86400000);
          return html`<div key=${c.id} class="feed__item" style="cursor:pointer" onClick=${() => navigate("/contracts/" + c.id)}>
            <div style="flex:1;min-width:0">
              <div class="strong" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.title}</div>
              <div class="tiny muted">${c.counterparty} · ${fmt.money(c.value, c.currency)}${c.autoRenew ? " · auto-renews" : ""}</div>
            </div>
            <${Pill} tone=${days < 15 ? "red" : "amber"}>${days}d</${Pill}>
          </div>`;
        })}
      </${Section}>
    </div>
  </div>`;
}
