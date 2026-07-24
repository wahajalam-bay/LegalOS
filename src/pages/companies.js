// Companies — registry + single-company "extract everything" view (Feature 7).
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Risk, Status, Tabs, AICard } from "../ui.js";
import { PageHead, Toolbar, DataTable, StatStrip } from "../parts.js";
import { CategoryPill } from "../shared.js";
import { navigate } from "../router.js";
import { useCollection } from "../store.js";
import { REVIEWS, LITIGATION, nameOf } from "../data.js";

const usd = (v, c) => (c === "USD" ? v : v * 0.27);
const TYPE_TONE = { Counterparty: "blue", Vendor: "purple", "Group Entity": "green", Client: "indigo" };

// Everything tagged to a company, across every module.
function gather(id, contracts, matters, requests) {
  const has = (r) => (r.companyTags || []).includes(id);
  return {
    contracts: contracts.filter(has),
    matters: matters.filter(has),
    requests: requests.filter(has),
    reviews: REVIEWS.filter(has),
    litigation: LITIGATION.filter(has),
  };
}

function CompanyList() {
  const companies = useCollection("companies");
  const contracts = useCollection("contracts");
  const matters = useCollection("matters");
  const requests = useCollection("requests");
  const licenses = useCollection("licenses");
  const [q, setQ] = useState("");
  const rows = companies.filter((c) => !q || (c.name + " " + (c.aliases || []).join(" ") + " " + c.type).toLowerCase().includes(q.toLowerCase()));
  const countFor = (id) => {
    const g = gather(id, contracts, matters, requests);
    const lic = licenses.filter((l) => (l.companyTags || []).includes(id)).length;
    return g.contracts.length + g.matters.length + g.requests.length + g.reviews.length + g.litigation.length + lic;
  };

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Companies" sub="Every counterparty, vendor and group entity — tag records and pull all related work in one view."
      actions=${html`<${Btn} variant="primary" icon="plus" onClick=${() => navigate("/companies/CO-01")}>Open a company</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: companies.length, label: "Companies" },
      { value: companies.filter((c) => c.type === "Counterparty").length, label: "Counterparties" },
      { value: companies.filter((c) => c.type === "Vendor").length, label: "Vendors" },
      { value: companies.filter((c) => c.type === "Group Entity").length, label: "Group entities" },
    ]} />
    <div style="width:280px;margin-bottom:14px"><${Toolbar} search=${q} onSearch=${setQ} /></div>
    <${DataTable} onRow=${(c) => navigate("/companies/" + c.id)} columns=${[
      { key: "name", label: "Company", render: (c) => html`<div class="row" style="gap:10px"><div class="notif__ico" style=${`width:32px;height:32px;background:var(--surface-3);color:var(--text-2)`}><${Icon} name="building" size=16 /></div><div><div class="cell-strong">${c.name}</div><div class="tiny muted">${(c.aliases || []).join(", ") || "—"}</div></div></div>` },
      { key: "type", label: "Type", render: (c) => html`<${Pill} tone=${TYPE_TONE[c.type] || "gray"}>${c.type}</${Pill}>` },
      { key: "jurisdiction", label: "Jurisdiction" },
      { key: "records", label: "Tagged records", align: "right", render: (c) => html`<span class="strong">${countFor(c.id)}</span>` },
    ]} rows=${rows} empty=${html`<div class="empty"><${Icon} name="building" size=36 /><div>No companies in the registry yet.</div></div>`} />
  </div>`;
}

function RecordList({ items, render, empty, onRow }) {
  if (!items.length) return html`<div class="empty" style="padding:26px"><${Icon} name="inbox" size=32 /><div>${empty}</div></div>`;
  return html`<div class="col" style="gap:2px">${items.map((r) => html`<div key=${r.id} class="feed__item clickable" style="align-items:center" onClick=${() => onRow(r)}>${render(r)}<${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} /></div>`)}</div>`;
}

function CompanyDetail({ id }) {
  const companies = useCollection("companies");
  const contracts = useCollection("contracts");
  const matters = useCollection("matters");
  const requests = useCollection("requests");
  const licenses = useCollection("licenses");
  const [tab, setTab] = useState("contracts");
  const c = companies.find((x) => x.id === id);
  if (!c) return html`<div class="page"><${Btn} icon="arrowLeft" onClick=${() => navigate("/companies")}>Companies</${Btn}><div class="empty">Company not found.</div></div>`;

  const g = gather(id, contracts, matters, requests);
  const lic = licenses.filter((l) => (l.companyTags || []).includes(id));
  const totalVal = g.contracts.reduce((s, x) => s + usd(x.value || 0, x.currency), 0);
  const totalSpend = g.contracts.reduce((s, x) => s + usd(x.spendToDate || 0, x.currency), 0);
  const openMatters = g.matters.filter((m) => m.progress < 100).length;

  const tabs = [
    { key: "contracts", label: "Contracts", icon: "file", count: g.contracts.length },
    { key: "matters", label: "Matters", icon: "folder", count: g.matters.length },
    { key: "requests", label: "Requests", icon: "inbox", count: g.requests.length },
    { key: "reviews", label: "Reviews", icon: "checkcircle", count: g.reviews.length },
    { key: "litigation", label: "Litigation", icon: "scale", count: g.litigation.length },
    { key: "licenses", label: "Licenses", icon: "shield", count: lic.length },
  ];

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:14px"><${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/companies")}>Companies</${Btn}></div>
    <div class="pagehead" style="margin-bottom:16px">
      <div class="pagehead__main">
        <div class="row" style="gap:8px;margin-bottom:8px"><div class="notif__ico" style="width:34px;height:34px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="building" size=18 /></div><${Pill} tone=${TYPE_TONE[c.type] || "gray"}>${c.type}</${Pill}><span class="tiny muted">${c.jurisdiction}</span></div>
        <div class="pagehead__title">${c.name}</div>
        ${(c.aliases || []).length ? html`<div class="pagehead__sub">Also known as: ${c.aliases.join(", ")}</div>` : ""}
      </div>
    </div>

    <${StatStrip} stats=${[
      { value: g.contracts.length, label: "Contracts" },
      { value: fmt.money(totalVal), label: "Total value" },
      { value: fmt.money(totalSpend), label: "Spend to date" },
      { value: openMatters, label: "Open matters" },
      { value: g.reviews.length, label: "Reviews" },
      { value: g.litigation.length, label: "Litigation" },
      { value: lic.length, label: "Licenses" },
    ]} />

    ${c.riskNote ? html`<div style="margin-bottom:16px"><${AICard} title="Relationship note">${c.riskNote}</${AICard}></div>` : ""}

    <div class="card">
      <div style="padding:6px 18px 0"><${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} /></div>
      <div class="card__body">
        ${tab === "contracts" && html`<${RecordList} items=${g.contracts} empty="No contracts tagged to this company." onRow=${(r) => navigate("/contracts/" + r.id)}
          render=${(r) => html`<div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="file" size=15 /></div><div style="flex:1;min-width:0"><div class="strong tiny">${r.title}</div><div class="tiny muted">${r.id} · ${r.type} · ${fmt.money(r.value, r.currency)}</div></div><${Risk} level=${r.risk} /><${Status} value=${r.status} />`} />`}
        ${tab === "matters" && html`<${RecordList} items=${g.matters} empty="No matters tagged to this company." onRow=${(r) => navigate("/matters/" + r.id)}
          render=${(r) => html`<div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="folder" size=15 /></div><div style="flex:1;min-width:0"><div class="strong tiny">${r.title}</div><div class="tiny muted">${r.id} · ${r.type}</div></div><${CategoryPill} item=${r} /><${Status} value=${r.status} />`} />`}
        ${tab === "requests" && html`<${RecordList} items=${g.requests} empty="No requests tagged to this company." onRow=${() => navigate("/requests")}
          render=${(r) => html`<div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="inbox" size=15 /></div><div style="flex:1;min-width:0"><div class="strong tiny">${r.title}</div><div class="tiny muted">${r.id} · ${r.type}</div></div><${Status} value=${r.status} />`} />`}
        ${tab === "reviews" && html`<${RecordList} items=${g.reviews} empty="No reviews tagged to this company." onRow=${() => navigate("/reviews")}
          render=${(r) => html`<div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="checkcircle" size=15 /></div><div style="flex:1;min-width:0"><div class="strong tiny">${r.title}</div><div class="tiny muted">${r.id} · ${r.flagged} AI flags</div></div><${Risk} level=${r.risk} /><${Status} value=${r.status} />`} />`}
        ${tab === "litigation" && html`<${RecordList} items=${g.litigation} empty="No litigation tagged to this company." onRow=${() => navigate("/litigation")}
          render=${(r) => html`<div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="scale" size=15 /></div><div style="flex:1;min-width:0"><div class="strong tiny">${r.title}</div><div class="tiny muted">${r.id} · ${r.stage} · ${fmt.money(r.exposure, r.currency)} exposure</div></div><${Status} value=${r.status} />`} />`}
        ${tab === "licenses" && html`<${RecordList} items=${lic} empty="No licenses tagged to this company." onRow=${() => navigate("/licenses")}
          render=${(r) => html`<div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2)"><${Icon} name="shield" size=15 /></div><div style="flex:1;min-width:0"><div class="strong tiny">${r.name}</div><div class="tiny muted">${r.authority} · ${r.jurisdiction}</div></div><span class="tiny muted">${fmt.until(r.expiryDate)}</span>`} />`}
      </div>
    </div>
  </div>`;
}

export default function Companies({ id }) {
  return id ? html`<${CompanyDetail} id=${id} />` : html`<${CompanyList} />`;
}
