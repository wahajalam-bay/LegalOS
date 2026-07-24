// Settings — org config, security/RBAC, integrations, AI.
import { html, cx, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Toggle, Field, Input, Section } from "../ui.js";
import { PageHead, DataTable } from "../parts.js";

const NAV = [
  { key: "general", label: "General", icon: "settings" },
  { key: "security", label: "Security & Access", icon: "lock" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "ai", label: "AI & Automation", icon: "sparkles" },
  { key: "integrations", label: "Integrations", icon: "share" },
  { key: "billing", label: "Billing", icon: "card" },
];

const ROLES = [
  { role: "General Counsel", users: 1, scope: "All entities · full access", perms: "Full" },
  { role: "Legal Director", users: 2, scope: "Assigned business units", perms: "Manage" },
  { role: "Senior Counsel", users: 2, scope: "Own matters + team", perms: "Edit" },
  { role: "Counsel", users: 3, scope: "Own matters", perms: "Edit" },
  { role: "Paralegal", users: 1, scope: "Assigned matters", perms: "Contribute" },
  { role: "Compliance Officer", users: 1, scope: "Compliance module", perms: "Manage" },
  { role: "Business Requester", users: 4, scope: "Own requests only", perms: "Request" },
];

const INTEGRATIONS = [
  { name: "DocuSign", desc: "E-signature & envelope tracking", icon: "edit", connected: true, color: "#f5be1a" },
  { name: "Salesforce", desc: "Sync deals & accounts", icon: "cpu", connected: true, color: "#00a1e0" },
  { name: "Slack", desc: "Approvals & alerts in channels", icon: "message", connected: true, color: "#611f69" },
  { name: "Google Drive", desc: "Document storage & sync", icon: "folder", connected: false, color: "#1fa463" },
  { name: "SAP Ariba", desc: "Procurement & vendor data", icon: "clipboard", connected: false, color: "#0faaff" },
  { name: "Microsoft 365", desc: "Word co-authoring & email", icon: "mail", connected: true, color: "#d83b01" },
];

function Toggler({ label, hint, on: initial }) {
  const [on, setOn] = useState(initial);
  return html`<div class="row" style="padding:12px 0;border-bottom:1px solid var(--border)">
    <div style="flex:1"><div class="strong" style="font-size:13.5px">${label}</div>${hint && html`<div class="tiny muted">${hint}</div>`}</div>
    <${Toggle} on=${on} onChange=${setOn} />
  </div>`;
}

export default function Settings() {
  const [sec, setSec] = useState("security");
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Settings" sub="Configure your organization, security posture, integrations and AI." />
    <div class="grid" style="grid-template-columns:220px 1fr;align-items:start">
      <div class="card" style="padding:8px;position:sticky;top:16px">
        ${NAV.map((n) => html`<div key=${n.key} class=${cx("menu__item")} style=${sec === n.key ? "background:var(--brand-soft);color:var(--brand-600)" : ""} onClick=${() => setSec(n.key)}>
          <${Icon} name=${n.icon} size=16 /><span style="font-weight:${sec === n.key ? 600 : 500}">${n.label}</span>
        </div>`)}
      </div>

      <div class="col" style="gap:16px">
        ${sec === "general" && html`<${Section} title="Organization" icon="building">
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
            <${Field} label="Organization name"><${Input} value="Northwind Global Holdings" /></${Field}>
            <${Field} label="Primary region"><select class="select"><option>Saudi Arabia</option><option>UAE</option><option>United Kingdom</option></select></${Field}>
            <${Field} label="Default currency"><select class="select"><option>USD</option><option>SAR</option><option>AED</option><option>GBP</option></select></${Field}>
            <${Field} label="Fiscal year start"><select class="select"><option>January</option><option>April</option></select></${Field}>
          </div>
          <div class="row" style="margin-top:18px"><${Btn} variant="primary" icon="save">Save changes</${Btn}></div>
        </${Section}>`}

        ${sec === "security" && html`<${Fragment}>
          <${Section} title="Authentication" icon="lock">
            <${Toggler} label="Single Sign-On (SSO)" hint="SAML 2.0 via Okta — enforced for all users" on=${true} />
            <${Toggler} label="Multi-Factor Authentication" hint="Required for privileged roles" on=${true} />
            <${Toggler} label="IP allowlist" hint="Restrict access to corporate networks" on=${false} />
            <${Toggler} label="Immutable audit log" hint="Every action recorded, tamper-evident" on=${true} />
          </${Section}>
          <div>
            <div class="row" style="margin-bottom:12px"><div class="card__title">Roles & permissions (RBAC)</div><div class="spacer"></div><${Btn} variant="ghost" size="sm" icon="plus">New role</${Btn}></div>
            <${DataTable} columns=${[
              { key: "role", label: "Role", render: (r) => html`<span class="cell-strong">${r.role}</span>` },
              { key: "users", label: "Users", align: "right" },
              { key: "scope", label: "Access scope", render: (r) => html`<span class="tiny muted">${r.scope}</span>` },
              { key: "perms", label: "Permission", render: (r) => html`<${Pill} tone=${r.perms === "Full" ? "purple" : r.perms === "Manage" ? "blue" : "gray"}>${r.perms}</${Pill}>` },
              { key: "x", label: "", align: "right", render: () => html`<button class="iconbtn rowactions"><${Icon} name="edit" size=15 /></button>` },
            ]} rows=${ROLES} />
          </div>
        </${Fragment}>`}

        ${sec === "notifications" && html`<${Section} title="Notifications" icon="bell">
          <${Toggler} label="Approval requests" hint="When your sign-off is required" on=${true} />
          <${Toggler} label="SLA breach warnings" hint="Before and when a review breaches SLA" on=${true} />
          <${Toggler} label="Contract expiry & renewals" hint="30/60/90-day reminders" on=${true} />
          <${Toggler} label="@mentions & comments" hint="When someone mentions you" on=${true} />
          <${Toggler} label="AI insights digest" hint="Daily summary of what needs attention" on=${false} />
          <${Toggler} label="Weekly executive report" hint="Emailed every Monday 8am" on=${true} />
        </${Section}>`}

        ${sec === "ai" && html`<${Section} title="AI & Automation" icon="sparkles">
          <div class="banner banner--info" style="margin-bottom:8px"><${Icon} name="lock" size=17 />All AI runs on your isolated tenant. No data trains external models.</div>
          <${Toggler} label="AI contract review" hint="Auto-extract terms & score risk on upload" on=${true} />
          <${Toggler} label="AI risk scoring on intake" hint="Pre-score every request" on=${true} />
          <${Toggler} label="Clause suggestions" hint="Recommend clauses from the library" on=${true} />
          <${Toggler} label="Auto-draft from templates" hint="Assemble first drafts automatically" on=${true} />
          <${Toggler} label="Deadline & delay prediction" hint="Forecast SLA breaches" on=${false} />
          <div style="margin-top:16px"><${Field} label="Reasoning model"><select class="select"><option>Claude Opus 4.8 (highest quality)</option><option>Claude Sonnet 5 (balanced)</option><option>Claude Haiku 4.5 (fastest)</option></select></${Field}></div>
        </${Section}>`}

        ${sec === "integrations" && html`<div class="grid grid--2">
          ${INTEGRATIONS.map((it) => html`<div key=${it.name} class="card card--pad">
            <div class="row" style="gap:12px">
              <div class="metric__icon" style=${`background:${it.color}1a;color:${it.color};width:40px;height:40px`}><${Icon} name=${it.icon} size=19 /></div>
              <div style="flex:1"><div class="strong">${it.name}</div><div class="tiny muted">${it.desc}</div></div>
              ${it.connected
                ? html`<${Pill} tone="green" dot=${true}>Connected</${Pill}>`
                : html`<${Btn} variant="ghost" size="sm">Connect</${Btn}>`}
            </div>
          </div>`)}
        </div>`}

        ${sec === "billing" && html`<${Section} title="Plan & billing" icon="card">
          <div class="card card--pad" style="background:linear-gradient(135deg,var(--brand-soft),var(--accent-soft));margin-bottom:16px">
            <div class="row"><div><div class="strong" style="font-size:16px">Enterprise</div><div class="tiny muted">Unlimited matters · 16 seats · SSO · audit</div></div><div class="spacer"></div><div style="text-align:right"><div style="font-size:22px;font-weight:750">$4,800<span class="tiny muted">/mo</span></div></div></div>
          </div>
          <div class="row"><span class="dim">Seats used</span><div class="spacer"></div><span class="strong">16 / 25</span></div>
          <div class="row" style="margin-top:18px"><${Btn} variant="ghost">Manage plan</${Btn}><${Btn} variant="ghost" icon="download" style="margin-left:8px">Invoices</${Btn}></div>
        </${Section}>`}
      </div>
    </div>
  </div>`;
}
