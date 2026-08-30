// Organization — people, teams, business units, entities.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Tabs } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { USERS, BUSINESS_UNITS, DEPARTMENTS, COUNTRIES, COMPANY } from "../data.js";

const BU_META = {
  "Real Estate": { icon: "building", color: "#10935a", matters: 198 },
  "Technology": { icon: "cpu", color: "#0d7a3f", matters: 312 },
  "Retail": { icon: "tag", color: "#6d28d9", matters: 112 },
  "Logistics": { icon: "briefcase", color: "#0891b2", matters: 154 },
  "Energy": { icon: "zap", color: "#d97706", matters: 132 },
  "Financial Services": { icon: "dollar", color: "#1d6cb0", matters: 176 },
};

export default function Organization() {
  const [tab, setTab] = useState("people");
  // This page is the LEGAL organisation. Business requesters keep their portal
  // access — they can raise and track requests — but they are not Zameen legal
  // staff, so they do not appear in the org structure.
  const STAFF = USERS.filter((u) => u.legalTeam || u.rbac === "head");
  const teams = [...new Set(STAFF.map((u) => u.team))];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Organization" sub="People, teams, business units and legal entities — the structure LegalOS routes work across."
      actions=${html`<${Btn} variant="ghost" icon="upload">Import</${Btn}><${Btn} variant="primary" icon="plus">Invite user</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: STAFF.length, label: "Legal staff" },
      { value: COMPANY.entities.length, label: "Legal entities" },
      { value: BUSINESS_UNITS.length, label: "Business units" },
      { value: COUNTRIES.length, label: "Countries" },
    ]} />
    <div style="margin-bottom:16px"><${Tabs} active=${tab} onChange=${setTab} tabs=${[
      { key: "people", label: "People", icon: "users", count: STAFF.length },
      { key: "teams", label: "Teams", icon: "briefcase", count: teams.length },
      { key: "units", label: "Business Units", icon: "grid", count: BUSINESS_UNITS.length },
      { key: "entities", label: "Entities", icon: "building", count: COMPANY.entities.length },
    ]} /></div>

    ${tab === "people" && html`<${DataTable} columns=${[
      { key: "name", label: "Name", render: (u) => html`<div class="row" style="gap:10px"><${Avatar} name=${u.name} size="md" /><div><div class="cell-strong">${u.name}</div><div class="tiny muted">${u.email}</div></div></div>` },
      { key: "role", label: "Role" },
      { key: "team", label: "Team", render: (u) => html`<${Pill} tone="gray">${u.team}</${Pill}>` },
      { key: "country", label: "Country", render: (u) => html`<span class="tiny"><${Icon} name="mapPin" size=13 style=${{ display: "inline", verticalAlign: "-2px", marginRight: "4px", color: "var(--text-3)" }} />${u.country}</span>` },
      { key: "x", label: "", align: "right", render: () => html`<button class="iconbtn rowactions"><${Icon} name="more" size=16 /></button>` },
    ]} rows=${STAFF} />`}

    ${tab === "teams" && html`<div class="grid grid--3">
      ${teams.map((t) => { const members = STAFF.filter((u) => u.team === t); return html`<div key=${t} class="card card--hover card--pad">
        <div class="row" style="margin-bottom:12px"><div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name="users" size=18 /></div><div class="spacer"></div><${Pill} tone="gray">${members.length}</${Pill}></div>
        <div class="strong" style="font-size:15px;margin-bottom:12px">${t}</div>
        <div class="row wrap" style="gap:0">${members.map((m) => html`<div key=${m.id} style="margin-left:-6px"><${Avatar} name=${m.name} size="sm" /></div>`)}</div>
      </div>`; })}
    </div>`}

    ${tab === "units" && html`<div class="grid grid--3">
      ${BUSINESS_UNITS.map((b) => { const m = BU_META[b] || { icon: "grid", color: "#0d7a3f", matters: 0 }; return html`<div key=${b} class="card card--hover card--pad">
        <div class="row" style="margin-bottom:14px"><div class="metric__icon" style=${`background:${m.color}1a;color:${m.color}`}><${Icon} name=${m.icon} size=18 /></div></div>
        <div class="strong" style="font-size:15px;margin-bottom:2px">${b}</div>
        <div class="tiny muted">${m.matters} active matters & contracts</div>
        <div class="row" style="gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)"><span class="tiny muted">Lead counsel</span><div class="spacer"></div><${Avatar} name=${(STAFF.filter((u) => u.rbac === "lead")[(b.length) % STAFF.filter((u) => u.rbac === "lead").length] || STAFF[0]).name} size="sm" /></div>
      </div>`; })}
    </div>`}

    ${tab === "entities" && html`<div class="grid grid--3">
      ${COMPANY.entities.map((e, i) => html`<div key=${e} class="card card--hover card--pad">
        <div class="row" style="margin-bottom:14px"><div class="metric__icon" style="background:var(--accent-soft);color:var(--accent-500)"><${Icon} name="building" size=18 /></div><div class="spacer"></div><${Pill} tone="green" dot=${true}>Active</${Pill}></div>
        <div class="strong" style="font-size:15px;margin-bottom:2px">${e}</div>
        <div class="tiny muted">${COUNTRIES[i] || "Global"} · legal entity</div>
        <div class="row" style="gap:14px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)"><div><div class="strong tiny">${40 + i * 13}</div><div class="tiny muted">contracts</div></div><div><div class="strong tiny">${3 + i}</div><div class="tiny muted">matters</div></div></div>
      </div>`)}
    </div>`}
  </div>`;
}
