// Settings — org config, security/RBAC, integrations, AI, and (Sprint 4) the
// end-to-end control panel for the requester portal's request form.
import { html, cx, fmt, useState, useEffect, Fragment } from "../core.js";
import { api } from "../api.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Toggle, Field, Input, Section, Tabs, Modal } from "../ui.js";
import { PageHead, DataTable } from "../parts.js";
import { useFormConfig, updateFormConfig, resetFormConfig, resetDemo } from "../store.js";
import {
  useSlaMatrix, updateSlaCell, resetSlaMatrix, SLA_BANDS,
  useCollection, proposeConfigChange, publishConfigProposal, resolveConfigProposal,
} from "../store.js";
import { canConfigure, canProposeConfig } from "../rbac.js";
import { toast } from "../toast.js";
import KnowledgeBaseSettings from "./kbsettings.js";
import { navigate } from "../router.js";
import { startTour } from "../tour.js";
import {
  CONTRACT_TYPE_CODES, CONTRACT_REQUEST_TYPES, LEGAL_SUBDIVISIONS,
  GROUP_ENTITIES, USERS, contractTypeMeta, COMPANY,
} from "../data.js";
// Sprint 6 — administrable master data + the published permission matrix.
import { useMasterData, updateMasterList, resetMasterData } from "../store.js";
import { MASTER_TABLES, PERMISSION_MATRIX, LEGAL_TEAMS } from "../org.js";
import { useActiveUser } from "../rbac.js";

const NAV = [
  { key: "general", label: "General", icon: "settings" },
  // PRD §3.6 — the SLA / TAT matrix, Director-editable, AD-proposable.
  { key: "sla", label: "SLA & TAT", icon: "clock" },
  // Sprint 6 — the FRD Section 2 master tables, administrable end to end.
  { key: "masterdata", label: "Master Data", icon: "database" },
  // What the OS has taken from Drive, module by module, and what it has not.
  { key: "knowledge", label: "Knowledge base", icon: "library" },
  { key: "access", label: "Access & Visibility", icon: "shield" },
  // Sprint 4 — legal controls the requester portal's form from here, end to end.
  { key: "requestform", label: "Request Form", icon: "inbox" },
  { key: "demo", label: "Presentation mode", icon: "play" },
  { key: "security", label: "Security & Access", icon: "lock" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "ai", label: "AI & Automation", icon: "sparkles" },
  { key: "integrations", label: "Integrations", icon: "share" },
  { key: "billing", label: "Billing", icon: "card" },
];

// PRD §2 personas — the five roles the OS is built around.
const ROLES = [
  { role: "Director Legal", users: 2, scope: "All entities · full access + config + approvals", perms: "Full" },
  { role: "AD / Senior Manager", users: 4, scope: "Own portfolio + reportees · approve within threshold", perms: "Manage" },
  { role: "AM / Associate", users: 10, scope: "Own + collaborating work · drafting & precedent", perms: "Edit" },
  { role: "Paralegal / Legal Executive", users: 2, scope: "Assigned tasks + contract register · no privileged", perms: "Contribute" },
  { role: "Requester", users: 8, scope: "Own requests only · non-privileged", perms: "Request" },
];

// Google Drive is the one LIVE backend integration — the service account that
// indexes the legal knowledge base. Its state is read from /api/health at render
// time, never hardcoded. The rest are illustrative placeholders for a future
// rollout and are labelled as such, so the panel never claims a connection that
// does not exist.
const INTEGRATIONS = [
  { name: "Google Drive", desc: "Knowledge base — document storage & full-text sync", icon: "folder", color: "#1fa463", live: "drive" },
  { name: "DocuSign", desc: "E-signature & envelope tracking", icon: "edit", color: "#f5be1a", demo: true },
  { name: "Salesforce", desc: "Sync deals & accounts", icon: "cpu", color: "#00a1e0", demo: true },
  { name: "Slack", desc: "Approvals & alerts in channels", icon: "message", color: "#611f69", demo: true },
  { name: "Microsoft 365", desc: "Word co-authoring & email", icon: "mail", color: "#d83b01", demo: true },
  { name: "SAP Ariba", desc: "Procurement & vendor data", icon: "clipboard", color: "#0faaff", demo: true },
];

/* ============================================================
   SPRINT 4 — "Request Form": end-to-end control of the requester portal.

   Everything here writes to the `formConfig` store slice, which the portal reads
   its ENTIRE structure from — so an edit on this screen changes the live form
   with no code change and no deploy.
   ============================================================ */
function RequestFormAdmin() {
  const cfg = useFormConfig();
  const [tab, setTab] = useState("flow");
  const [newCompany, setNewCompany] = useState("");
  const [newDoc, setNewDoc] = useState({ type: "", name: "" });

  const natures = cfg.natures || [];
  const companies = cfg.companies || [];
  const matrix = cfg.companyContractTypes || {};
  const branding = cfg.branding || {};

  /* ---- writers ---- */
  const patchNature = (key, patch) =>
    updateFormConfig({ natures: natures.map((n) => (n.key === key ? { ...n, ...patch } : n)) });
  const patchCompany = (key, patch) =>
    updateFormConfig({ companies: companies.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const addCompany = () => {
    const label = newCompany.trim();
    if (!label) return;
    const key = label.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 16);
    if (companies.some((c) => c.key === key)) return;
    updateFormConfig({
      companies: [...companies, { key, label, entityId: GROUP_ENTITIES[0].id, enabled: true }],
      companyContractTypes: { ...matrix, [key]: [] },
    });
    setNewCompany("");
  };
  // The cell toggle is the whole point of the matrix: it decides which contract
  // types the portal offers at Step 3 for that company.
  const toggleCell = (companyKey, type) => {
    const cur = matrix[companyKey] || [];
    const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
    updateFormConfig({ companyContractTypes: { ...matrix, [companyKey]: next } });
  };
  const toggleRequestType = (t) => {
    const cur = cfg.requestTypes || [];
    updateFormConfig({ requestTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  };
  const patchDocTemplate = (type, list) =>
    updateFormConfig({ requiredDocTemplates: { ...(cfg.requiredDocTemplates || {}), [type]: list } });
  const patchRouting = (nature, patch) =>
    updateFormConfig({ routing: { ...(cfg.routing || {}), [nature]: { ...((cfg.routing || {})[nature] || {}), ...patch } } });
  const patchBranding = (patch) => updateFormConfig({ branding: { ...branding, ...patch } });

  const enabledTypes = [...new Set(Object.values(matrix).flat())];
  const docTypes = enabledTypes.length ? enabledTypes : CONTRACT_TYPE_CODES;

  return html`<${Fragment}>
    <!-- publish state + live link -->
    <div class="card card--pad" style="margin-bottom:16px">
      <div class="row wrap" style="gap:14px">
        <div class="metric__icon" style=${`width:40px;height:40px;background:${branding.published ? "var(--success-bg)" : "var(--warning-bg)"};color:${branding.published ? "var(--success)" : "var(--warning)"}`}>
          <${Icon} name=${branding.published ? "globe" : "lock"} size=19 />
        </div>
        <div style="flex:1;min-width:0">
          <div class="strong" style="font-size:14px">
            ${branding.published ? "The request form is live" : "The request form is in draft"}
          </div>
          <div class="tiny muted" style="margin-top:2px">
            ${branding.published
              ? "Requesters can sign in and submit. Everything below changes the live form immediately."
              : "Requesters see a holding page until you publish."}
          </div>
        </div>
        <a class="btn btn--ghost" href="portal/" target="_blank" rel="noreferrer">
          <${Icon} name="externalLink" size=16 />${branding.published ? "Open the portal" : "Preview the portal"}
        </a>
        <${Btn} variant=${branding.published ? "ghost" : "primary"} icon=${branding.published ? "lock" : "globe"}
          onClick=${() => patchBranding({ published: !branding.published })}>
          ${branding.published ? "Unpublish" : "Publish"}
        </${Btn}>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <${Tabs} active=${tab} onChange=${setTab} tabs=${[
        { key: "flow", label: "Nature & companies", icon: "layers" },
        { key: "matrix", label: "Contract-type matrix", icon: "grid" },
        { key: "docs", label: "Required documents", icon: "clipboard" },
        { key: "routing", label: "Routing & TAT", icon: "workflow" },
        { key: "branding", label: "Branding", icon: "star" },
      ]} />
    </div>

    ${tab === "flow" && html`<${Fragment}>
      <${Section} title="Nature of Matter" icon="layers"
        sub="Step 1 of the requester's form. Disable an option to hide it; clear 'full flow' to capture it and route it manually.">
        <div class="col" style="gap:8px">
          ${natures.map((n) => html`<div key=${n.key} class="docrow">
            <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name=${n.icon} size=15 /></div>
            <div style="flex:1;min-width:0">
              <div class="strong tiny">${n.label}</div>
              <div class="tiny muted">${n.blurb || "—"}</div>
            </div>
            <div class="col" style="gap:3px;align-items:center;width:96px;flex:none">
              <span class="tiny muted">Full flow</span>
              <${Toggle} on=${!!n.fullFlow} onChange=${(v) => patchNature(n.key, { fullFlow: v })} />
            </div>
            <div class="col" style="gap:3px;align-items:center;width:78px;flex:none">
              <span class="tiny muted">Shown</span>
              <${Toggle} on=${!!n.enabled} onChange=${(v) => patchNature(n.key, { enabled: v })} />
            </div>
          </div>`)}
        </div>
        <div class="tiny muted" style="margin-top:12px">
          Natures without a full flow still create a complete request record — flagged
          <b>routed manually</b> so nothing is lost.
        </div>
      </${Section}>

      <${Section} title="Companies & entities" icon="building"
        sub="Step 2 of the form. Each option maps to an entity in the registry so requests land on the right books.">
        <div class="col" style="gap:8px">
          ${companies.map((c) => html`<div key=${c.key} class="docrow">
            <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name="building" size=15 /></div>
            <div style="flex:1;min-width:0">
              <${Input} value=${c.label} onInput=${(e) => patchCompany(c.key, { label: e.target.value })} />
              <div class="tiny muted" style="margin-top:3px">key <span class="mono">${c.key}</span> · ${(matrix[c.key] || []).length} contract types mapped</div>
            </div>
            <div style="width:200px;flex:none">
              <select class="select" value=${c.entityId} onChange=${(e) => patchCompany(c.key, { entityId: e.target.value })}>
                ${GROUP_ENTITIES.map((e) => html`<option key=${e.id} value=${e.id}>${e.name} · ${e.jur}</option>`)}
              </select>
            </div>
            <div class="col" style="gap:3px;align-items:center;width:74px;flex:none">
              <span class="tiny muted">Shown</span>
              <${Toggle} on=${!!c.enabled} onChange=${(v) => patchCompany(c.key, { enabled: v })} />
            </div>
          </div>`)}
        </div>
        <div class="row" style="gap:8px;align-items:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="flex:1"><${Field} label="Add a company option">
            <${Input} placeholder="e.g. Dubizzle UAE" value=${newCompany}
              onInput=${(e) => setNewCompany(e.target.value)}
              onKeyDown=${(e) => { if (e.key === "Enter") addCompany(); }} />
          </${Field}></div>
          <${Btn} variant="soft" icon="plus" onClick=${addCompany}>Add</${Btn}>
        </div>
      </${Section}>

      <${Section} title="Request types" icon="file" sub="Offered at Step 4 for Contracts requests.">
        <div class="row wrap" style="gap:8px">
          ${CONTRACT_REQUEST_TYPES.map((t) => html`<button key=${t} class=${cx("chip", (cfg.requestTypes || []).includes(t) && "active")}
            onClick=${() => toggleRequestType(t)}>
            <${Icon} name=${(cfg.requestTypes || []).includes(t) ? "checkcircle" : "plus"} size=14 />${t}
          </button>`)}
        </div>
      </${Section}>
    </${Fragment}>`}

    ${tab === "matrix" && html`<${Section} title="Company × Contract-Type matrix" icon="grid"
      sub="This decides exactly which contract types appear at Step 3 for each company. Click a cell to toggle it — the portal picks it up immediately."
      right=${html`<span class="tiny muted">${enabledTypes.length} of ${CONTRACT_TYPE_CODES.length} types in use</span>`}>
      <div class="matrix">
        <table>
          <thead>
            <tr>
              <th>Contract type</th>
              ${companies.map((c) => html`<th key=${c.key} style="max-width:96px;white-space:normal">${c.label}${!c.enabled ? html`<div class="tiny muted" style="font-weight:500;text-transform:none;letter-spacing:0">hidden</div>` : ""}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${CONTRACT_TYPE_CODES.map((t) => {
              const meta = contractTypeMeta(t);
              return html`<tr key=${t}>
                <td>
                  <div class="strong tiny">${meta ? meta.name : t}</div>
                  <div class="tiny muted">${meta ? meta.subdivision : "—"}</div>
                </td>
                ${companies.map((c) => {
                  const on = (matrix[c.key] || []).includes(t);
                  return html`<td key=${c.key}>
                    <button class=${cx("mcell", on && "on")} title=${`${on ? "Remove" : "Add"} ${t} for ${c.label}`}
                      onClick=${() => toggleCell(c.key, t)}>
                      ${on && html`<${Icon} name="check" size=12 />`}
                    </button>
                  </td>`;
                })}
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      <div class="tiny muted" style="margin-top:12px">
        A company with no types mapped tells the requester so and suggests raising it as Advice.
      </div>
    </${Section}>`}

    ${tab === "docs" && html`<${Section} title="Required-document templates" icon="clipboard"
      sub="Pre-loads the missing-document checklist when a request of this contract type arrives, so legal starts from a real ask list.">
      <div class="col" style="gap:10px">
        ${docTypes.map((t) => {
          const list = (cfg.requiredDocTemplates || {})[t] || [];
          return html`<div key=${t} class="card card--pad col" style="gap:9px">
            <div class="row">
              <span class="strong tiny">${(contractTypeMeta(t) || {}).name || t}</span>
              <div class="spacer"></div>
              <span class="tiny muted">${list.length} document${list.length === 1 ? "" : "s"}</span>
            </div>
            <div class="row wrap" style="gap:6px">
              ${list.map((d, i) => html`<span key=${i} class="fchip">${d}
                <button class="fchip__x" onClick=${() => patchDocTemplate(t, list.filter((_, j) => j !== i))}><${Icon} name="x" size=11 /></button>
              </span>`)}
              ${list.length === 0 && html`<span class="tiny muted">Nothing required — falls back to "Supporting documentation".</span>`}
            </div>
            <div class="row" style="gap:8px">
              <input class="input" style="height:32px;font-size:12.5px" placeholder="Add a required document…"
                value=${newDoc.type === t ? newDoc.name : ""}
                onInput=${(e) => setNewDoc({ type: t, name: e.target.value })}
                onKeyDown=${(e) => {
                  if (e.key === "Enter" && newDoc.name.trim()) {
                    patchDocTemplate(t, [...list, newDoc.name.trim()]);
                    setNewDoc({ type: "", name: "" });
                  }
                }} />
              <${Btn} variant="soft" size="sm" icon="plus" onClick=${() => {
                if (newDoc.type === t && newDoc.name.trim()) {
                  patchDocTemplate(t, [...list, newDoc.name.trim()]);
                  setNewDoc({ type: "", name: "" });
                }
              }}>Add</${Btn}>
            </div>
          </div>`;
        })}
      </div>
    </${Section}>`}

    ${tab === "routing" && html`<${Section} title="Routing & turnaround defaults" icon="workflow"
      sub="Where each nature lands and how long it gets. Contracts derive both from the contract type × risk matrix; the others use these defaults.">
      <div class="col" style="gap:10px">
        ${natures.map((n) => {
          const r = (cfg.routing || {})[n.key] || {};
          const isContracts = n.key === "Contracts";
          return html`<div key=${n.key} class="card card--pad col" style="gap:10px">
            <div class="row">
              <div class="notif__ico" style="width:30px;height:30px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name=${n.icon} size=14 /></div>
              <span class="strong tiny">${n.label}</span>
              <div class="spacer"></div>
              ${isContracts && html`<${Pill} tone="blue">derived from type × risk</${Pill}>`}
            </div>
            ${isContracts
              ? html`<div class="tiny muted">${r.note || "Sub-division, owner and TAT all come from the contract type and its risk tier."}</div>`
              : html`<div class="grid" style="grid-template-columns:1fr 1fr 110px;gap:12px">
                  <${Field} label="Legal sub-division">
                    <select class="select" value=${r.subdivision || ""} onChange=${(e) => patchRouting(n.key, { subdivision: e.target.value })}>
                      ${LEGAL_SUBDIVISIONS.map((s) => html`<option key=${s}>${s}</option>`)}
                    </select>
                  </${Field}>
                  <${Field} label="Default owner">
                    <select class="select" value=${r.owner || ""} onChange=${(e) => patchRouting(n.key, { owner: e.target.value })}>
                      ${USERS.slice(0, 12).map((u) => html`<option key=${u.id} value=${u.id}>${u.name} · ${u.role}</option>`)}
                    </select>
                  </${Field}>
                  <${Field} label="TAT (days)">
                    <${Input} type="number" value=${r.tatDays == null ? "" : r.tatDays}
                      onInput=${(e) => patchRouting(n.key, { tatDays: e.target.value === "" ? null : Number(e.target.value) })} />
                  </${Field}>
                </div>`}
          </div>`;
        })}
      </div>
    </${Section}>`}

    ${tab === "branding" && html`<${Section} title="Portal branding" icon="star" sub="What requesters see at the top of the form.">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
        <${Field} label="Portal name"><${Input} value=${branding.name || ""} onInput=${(e) => patchBranding({ name: e.target.value })} /></${Field}>
        <${Field} label="Logo initials" hint="Two or three characters."><${Input} value=${branding.logoText || ""} onInput=${(e) => patchBranding({ logoText: e.target.value.slice(0, 3) })} /></${Field}>
        <${Field} label="Tagline"><${Input} value=${branding.tagline || ""} onInput=${(e) => patchBranding({ tagline: e.target.value })} /></${Field}>
        <${Field} label="Default theme">
          <select class="select" value=${branding.themeDefault || "light"} onChange=${(e) => patchBranding({ themeDefault: e.target.value })}>
            <option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </${Field}>
      </div>
      <div class="card card--pad" style="margin-top:16px;background:var(--surface-2)">
        <div class="tiny muted" style="margin-bottom:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Preview</div>
        <div class="row" style="gap:12px">
          <span class="plogin__logo" style="width:38px;height:38px;font-size:14px">${branding.logoText || "NW"}</span>
          <div style="min-width:0">
            <div class="strong" style="font-size:15px">${branding.name || "Legal Requests"}</div>
            <div class="tiny muted">${branding.tagline || "—"}</div>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:18px;gap:8px">
        <${Btn} variant="ghost" icon="refresh" onClick=${() => resetFormConfig()}>Reset the whole form to defaults</${Btn}>
      </div>
    </${Section}>`}
  </${Fragment}>`;
}

/* ---------------- Sprint 5: demo reset ----------------
   Returns the store to the seeded state so a walkthrough always opens on the
   same, presentation-perfect numbers. Clears the derived UI state too (saved
   filters, the portal session, the tour flag), otherwise a stale filter makes
   the first screen of a demo look wrong. */
function DemoReset() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  return html`<${Section} title="Presentation mode" icon="play"
    sub="Reset the data to its seeded state before showing the system to an audience.">
    <div class="col" style="gap:14px">
      <div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="alertCircle" size=17 />
        <div>
          <div class="strong tiny">What a reset does</div>
          <div class="tiny" style="margin-top:3px;opacity:.9">
            Restores the seeded requests, matters, contracts, documents, licences and form
            configuration, and clears saved filters, the portal session and the tour flag.
            Anything created during a demo is discarded.
          </div>
        </div>
      </div>

      ${done && html`<div class="banner banner--info"><${Icon} name="checkcircle" size=16 />
        <span class="tiny">Reset. The system is back to its seeded state.</span></div>`}

      <div class="row wrap" style="gap:8px">
        ${confirming
          ? html`<${Fragment}>
              <${Btn} variant="danger" icon="refresh" onClick=${() => { resetDemo(); setConfirming(false); setDone(true); }}>
                Yes, reset the data
              </${Btn}>
              <${Btn} variant="ghost" onClick=${() => setConfirming(false)}>Cancel</${Btn}>
            </${Fragment}>`
          : html`<${Btn} variant="ghost" icon="refresh" onClick=${() => { setConfirming(true); setDone(false); }}>Reset to the seeded demo data</${Btn}>`}
        <div class="spacer"></div>
        <${Btn} variant="soft" icon="play" onClick=${() => startTour()}>Start the guided tour</${Btn}>
        <${Btn} variant="soft" icon="star" onClick=${() => navigate("/exec")}>Open the executive overview</${Btn}>
      </div>

      <div class="tiny muted">
        For a five minute walkthrough: open the executive overview, take the tour, and finish on
        the executive brief. Keep the requester portal open in a second tab to show the round trip.
      </div>
    </div>
  </${Section}>`;
}

/* ---------------- Sprint 6: Master Data admin (FRD Section 2) ----------------
   Configured once, reused across all modules — add / rename / deactivate, never
   hard-coded. Deactivating keeps history intact: old records still display the
   value; new forms stop offering it. */
function MasterDataAdmin() {
  const md = useMasterData();
  const [table, setTable] = useState(MASTER_TABLES[0].key);
  const [draft, setDraft] = useState("");
  const items = md[table] || [];
  const set = (items2) => updateMasterList(table, items2);

  return html`<${Section} title="Master data" icon="database"
    sub="The Section 2 registry: every dropdown across all thirteen modules reads these lists live — an edit here changes the forms immediately."
    actions=${html`<${Btn} size="sm" icon="refresh" onClick=${() => { if (confirm("Reset ALL master tables to the seeded defaults?")) resetMasterData(); }}>Reset defaults</${Btn}>`}>
    <div class="grid" style="grid-template-columns:250px 1fr;gap:16px;align-items:start">
      <div class="card" style="padding:6px">
        ${MASTER_TABLES.map((t) => html`<button type="button" key=${t.key} class="menu__item" style=${table === t.key ? "background:var(--brand-soft);color:var(--brand-600);font-weight:600" : ""}
          onClick=${() => setTable(t.key)}>
          <span style="flex:1">${t.label}</span>
          <span class="tiny muted">${(md[t.key] || []).filter((x) => x.active !== false).length}</span>
        </button>`)}
      </div>
      <div class="card card--pad">
        <div class="strong" style="margin-bottom:10px">${(MASTER_TABLES.find((t) => t.key === table) || {}).label}</div>
        ${items.map((it, i) => html`<div key=${i} class="row mdrow">
          <${Input} value=${it.value} onInput=${(e) => set(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <${Pill} tone=${it.active !== false ? "green" : "gray"}>${it.active !== false ? "Active" : "Deactivated"}</${Pill}>
          <${Btn} size="sm" onClick=${() => set(items.map((x, j) => (j === i ? { ...x, active: x.active === false } : x)))}>
            ${it.active !== false ? "Deactivate" : "Reactivate"}
          </${Btn}>
        </div>`)}
        <div class="row" style="gap:8px;margin-top:12px">
          <${Input} placeholder="Add a value…" value=${draft} onInput=${(e) => setDraft(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter" && draft.trim()) { set([...items, { value: draft.trim(), active: true }]); setDraft(""); } }} />
          <${Btn} variant="primary" icon="plus" onClick=${() => { if (draft.trim()) { set([...items, { value: draft.trim(), active: true }]); setDraft(""); } }}>Add</${Btn}>
        </div>
        <div class="tiny muted" style="margin-top:10px">
          Deactivate rather than delete — records that already carry the value keep displaying it; new requests stop offering it.
        </div>
      </div>
    </div>
  </${Section}>`;
}

/* ---------------- Sprint 6: Access & visibility (FRD Section 14) ---------------- */
function AccessAdmin() {
  const me = useActiveUser();
  return html`<${Fragment}>
    <${Section} title="The principle" icon="shield"
      sub="Raising a request to a team and viewing that team's data are different permissions. Anyone can raise to any team; viewing is narrow and row-level.">
      <div class="banner banner--info" style="margin-bottom:12px">
        <${Icon} name="lock" size=17 />
        Row-level security keys on two fields every record already carries: <b>Legal Team</b> (owning team) and
        <b> Requesting Department</b> (originating department). Cross-team search runs through the same filter — it is never a bypass.
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Role</th><th>Raise to any team</th><th>View own raised requests</th><th>View own team's full queue</th><th>View other Legal teams</th></tr></thead>
        <tbody>${PERMISSION_MATRIX.map((r) => html`<tr key=${r.role}>
          <td class="cell-strong">${r.role}</td>
          <td><${Pill} tone="green">${r.raise}</${Pill}></td>
          <td>${r.own}</td>
          <td>${/^No/.test(r.queue) ? html`<${Pill} tone="gray">No</${Pill}>` : r.queue}</td>
          <td>${/^No/.test(r.other) ? html`<${Pill} tone="gray">No</${Pill}>` : html`<${Pill} tone="amber">${r.other}</${Pill}>`}</td>
        </tr>`)}</tbody>
      </table></div>
    </${Section}>
    <${Section} title="Team membership" icon="users" sub="Each session carries the user's Legal team (if any) and business department — the two claims the filter reads.">
      <div class="grid grid--3" style="gap:12px">
        ${LEGAL_TEAMS.map((t) => html`<div key=${t.key} class="card card--pad">
          <div class="strong" style="margin-bottom:8px">${t.name}</div>
          ${USERS.filter((u) => u.legalTeam === t.key).map((u) => html`<div key=${u.id} class="row" style="gap:8px;padding:4px 0">
            <${Avatar} name=${u.name} size="sm" />
            <div style="flex:1;min-width:0"><div style="font-size:13px">${u.name}</div><div class="tiny muted">${u.role}</div></div>
            ${u.rbac === "lead" && html`<${Pill} tone="purple">Lead</${Pill}>`}
          </div>`)}
        </div>`)}
      </div>
      <div class="tiny muted" style="margin-top:12px">
        You are currently viewing as <b>${me.name}</b>. Switch identities from the sidebar footer to watch the queues,
        search results and landing screen change with the role. Internal fields (risk notes, internal review comments)
        are flagged team-internal in the module registry and are excluded even from a requester's own-request view.
      </div>
    </${Section}>
  </${Fragment}>`;
}

// PRD §3.6 SLA matrix editor + §2 propose→publish. Director edits inline and
// publishes; an AD proposes changes the Director then reviews here.
function SlaAdmin() {
  const viewer = useActiveUser();
  const matrix = useSlaMatrix();
  const proposals = useCollection("configProposals");
  const publish = canConfigure(viewer);       // Director
  const propose = canProposeConfig(viewer) && !publish; // AD
  const [draft, setDraft] = useState(null);    // AD propose modal: {cat, band, days}
  const cats = Object.keys(matrix || {});
  const pending = (proposals || []).filter((p) => p.status === "proposed" && p.kind === "SLA matrix");

  return html`<${Fragment}>
    <${Section} title="SLA & TAT matrix" icon="clock"
      sub="Business days by legal category × business urgency. The clock runs on working days per jurisdiction and pauses while the ball is with the requester.">
      ${!publish && html`<div class="banner banner--info" style="margin-bottom:12px"><${Icon} name="alertCircle" size=15 /><span class="tiny">${propose ? "You can propose changes; the Director publishes them." : "Read-only — SLA configuration is a leadership control."}</span></div>`}
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Category</th>${SLA_BANDS.map((b) => html`<th key=${b} style="text-align:center">${b}</th>`)}</tr></thead>
        <tbody>
          ${cats.map((cat) => html`<tr key=${cat}>
            <td class="tiny strong" style="max-width:280px">${cat}</td>
            ${SLA_BANDS.map((band) => {
              const v = (matrix[cat] || {})[band];
              return html`<td key=${band} style="text-align:center">
                ${publish
                  ? html`<input class="input input--sm" type="number" min="0" style="width:58px;text-align:center"
                      value=${v == null ? "" : v} onChange=${(e) => updateSlaCell(cat, band, e.target.value)} />`
                  : html`<button class=${cx("tagchip", propose && "clickable")} onClick=${propose ? () => setDraft({ cat, band, days: v == null ? 1 : v }) : null}>${v === 0 ? "Same day" : v == null ? "—" : v + "d"}</button>`}
              </td>`;
            })}
          </tr>`)}
        </tbody>
      </table></div>
      ${publish && html`<div class="row" style="margin-top:14px"><div class="spacer"></div><${Btn} variant="ghost" icon="refresh" onClick=${() => { resetSlaMatrix(); toast("SLA matrix reset to the standard"); }}>Reset to standard</${Btn}></div>`}
    </${Section}>

    ${publish && pending.length > 0 && html`<${Section} title=${"Proposed changes · " + pending.length} icon="sparkles" sub="Changes an AD has submitted for your sign-off.">
      <div class="col" style="gap:8px">
        ${pending.map((p) => html`<div key=${p.id} class="row" style="gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
          <${Icon} name="clock" size=15 style=${{ color: "var(--text-3)" }} />
          <div style="flex:1;min-width:0"><div class="tiny strong">${p.summary}</div><div class="tiny muted">Proposed ${fmt.rel(p.at)}</div></div>
          <${Btn} size="sm" variant="ghost" onClick=${() => { resolveConfigProposal(p.id, "dismissed", viewer.id); toast("Dismissed"); }}>Dismiss</${Btn}>
          <${Btn} size="sm" variant="primary" icon="check" onClick=${() => { publishConfigProposal(p.id, viewer.id); toast("Published"); }}>Publish</${Btn}>
        </div>`)}
      </div>
    </${Section}>`}

    ${draft && html`<${Modal} title="Propose an SLA change" icon="clock" width=${420} onClose=${() => setDraft(null)}
      footer=${html`<${Btn} onClick=${() => setDraft(null)}>Cancel</${Btn}><${Btn} variant="primary" icon="send" onClick=${() => { proposeConfigChange("SLA matrix", `${draft.cat} · ${draft.band} → ${draft.days}d`, draft, viewer.id); toast("Proposed to the Director", "info"); setDraft(null); }}>Propose</${Btn}>`}>
      <div class="tiny muted" style="margin-bottom:10px">${draft.cat} · ${draft.band}</div>
      <${Field} label="Proposed working days"><${Input} type="number" value=${draft.days} onInput=${(e) => setDraft({ ...draft, days: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></${Field}>
    </${Modal}>`}
  </${Fragment}>`;
}

export default function Settings() {
  const [sec, setSec] = useState("security");
  // Live backend status for the integrations panel (Google Drive is real).
  const [health, setHealth] = useState(null);
  useEffect(() => { let on = true; api.health().then((h) => on && setHealth(h)).catch(() => {}); return () => { on = false; }; }, []);
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Settings" sub="Configure your organization, security posture, integrations and AI." />
    <div class="grid" style="grid-template-columns:220px 1fr;align-items:start">
      <div class="card" style="padding:8px;position:sticky;top:16px">
        ${NAV.map((n) => html`<button type="button" key=${n.key} class=${cx("menu__item", sec === n.key && "menu__item--on")}
          aria-current=${sec === n.key ? "page" : undefined}
          style=${sec === n.key ? "background:var(--brand-soft);color:var(--brand-600)" : ""} onClick=${() => setSec(n.key)}>
          <${Icon} name=${n.icon} size=16 /><span style="font-weight:${sec === n.key ? 600 : 500}">${n.label}</span>
        </button>`)}
      </div>

      <div class="col" style="gap:16px">
        ${sec === "sla" && html`<${SlaAdmin} />`}
        ${sec === "masterdata" && html`<${MasterDataAdmin} />`}
        ${sec === "knowledge" && html`<${KnowledgeBaseSettings} />`}
        ${sec === "access" && html`<${AccessAdmin} />`}
        ${sec === "requestform" && html`<${RequestFormAdmin} />`}
        ${sec === "demo" && html`<${DemoReset} />`}

        ${/* THE ORGANISATION IS READ, NOT CHOSEN.
              This offered a Primary region of Saudi Arabia, UAE or United
              Kingdom and a Default currency of USD, SAR, AED or GBP — for a
              Pakistani group whose every register is in rupees. PKR was not
              even on the list. Under them sat a Save button that saved nothing.
              What the product actually runs on is stated instead, read from the
              same places the registers read. */ ""}
        ${sec === "general" && html`<${Section} title="Organization" icon="building">
          <div class="kvgrid" style="grid-template-columns:1fr 1fr">
            <div class="kv"><div class="kv__l">Organization</div><div class="kv__v">${COMPANY.name}</div></div>
            <div class="kv"><div class="kv__l">Legal entities on the roster</div>
              <div class="kv__v">${(GROUP_ENTITIES || []).length}</div></div>
            <div class="kv"><div class="kv__l">Currency</div>
              <div class="kv__v">PKR — the currency every register states its figures in</div></div>
            <div class="kv"><div class="kv__l">Other currencies in the source</div>
              <div class="kv__v">USD and AED appear on some agreements. They are reported apart and never
                added to the rupee totals — no connected source carries an approved rate.</div></div>
          </div>
          <div class="tiny muted" style="margin-top:14px">
            None of this is a preference. The organisation, its entities and the currencies come from the
            registers and the statutory root; changing them here would change a label without changing a
            record, which is why there is nothing to save on this page.
          </div>
        </${Section}>`}

        ${sec === "security" && html`<${Fragment}>
          ${/* SECURITY POSTURE IS NOT A ROW OF DECORATIVE SWITCHES.
                These four were the most dangerous thing on the page: "Single
                Sign-On (SSO) — SAML 2.0 via Okta, enforced for all users" shown
                ON, "Multi-Factor Authentication — required for privileged
                roles" shown ON, over `useState` that reset on reload and
                configured nothing. There is no Okta and no MFA; a reader was
                being told the estate was protected by controls that do not
                exist. What IS true is stated below, and it is verifiable. */ ""}
          <${Section} title="Authentication" icon="lock">
            <div class="banner banner--warn" style="align-items:flex-start;margin-bottom:12px">
              <${Icon} name="alertTriangle" size=15 />
              <div class="tiny">This panel used to show SSO, MFA and an IP allowlist switched on. None of
                them exists. They were switches that saved nothing and configured nothing — and a security
                posture nobody can verify is worse than none at all.</div>
            </div>
            ${[["Credential sign-in, verified server-side", true,
                "Every request carries a session the server checks. The browser is never trusted with identity."],
               ["Sessions expire", true,
                "Twelve hours, or sixty minutes idle. Signing out ends the session immediately."],
               ["Per-page and per-record authorisation", true,
                "One rule decides both what the navigation offers and what the router opens; the server refuses the rest."],
               ["Audit trail on every record change", true,
                "Who did it, when, and why where a reason is required. Held with the record, not in a separate log."],
               ["Single Sign-On", false, "Not configured. Sign-in is by credential."],
               ["Multi-factor authentication", false, "Not configured."],
               ["IP allowlist", false, "Not configured. The origin is reachable from outside the corporate network."],
            ].map(([t, on, d]) => html`<div key=${t} class="row" style="padding:12px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1"><div class="panel__title">${t}</div><div class="tiny muted">${d}</div></div>
              <${Pill} tone=${on ? "green" : "gray"} dot=${on}>${on ? "In force" : "Not configured"}</${Pill}>
            </div>`)}
          </${Section}>
          <div>
            <div class="row" style="margin-bottom:12px"><div class="card__title">Roles & permissions (RBAC)</div><div class="spacer"></div><${Btn} variant="ghost" size="sm" icon="users"
              onClick=${() => navigate("/access")}>Manage in Users & Access</${Btn}></div>
            <${DataTable} columns=${[
              { key: "role", label: "Role", render: (r) => html`<span class="cell-strong">${r.role}</span>` },
              { key: "users", label: "Users", align: "right" },
              { key: "scope", label: "Access scope", render: (r) => html`<span class="tiny muted">${r.scope}</span>` },
              { key: "perms", label: "Permission", render: (r) => html`<${Pill} tone=${r.perms === "Full" ? "purple" : r.perms === "Manage" ? "blue" : "gray"}>${r.perms}</${Pill}>` },

            ]} rows=${ROLES} />
          </div>
        </${Fragment}>`}

        ${/* A SWITCH THAT CONTROLS NOTHING IS WORSE THAN NO SWITCH (§100).
              These six were `useState` and nothing else: flipping one changed a
              pixel, persisted nowhere and reached no code. Two of them promised
              email — "Emailed every Monday 8am" — from a system with no mail
              connection, so a head of department could switch on a weekly
              report that would never arrive and never know. What LegalOS
              actually raises is in-app, it is described here, and where a
              channel is not connected the page says so. */ ""}
        ${sec === "notifications" && html`<${Section} title="Notifications" icon="bell">
          <div class="tiny muted" style="margin-bottom:12px">
            What LegalOS raises today, and where it raises it. These are not preferences yet — the
            reminders below are generated for the person who owns the work, and shown on the bell in
            the top bar.
          </div>
          ${[["Hearing outcomes", "A hearing date passes with no outcome recorded — the owner is reminded, and after seven days the line manager is told too."],
             ["Compliance and licence dates", "Repayments, expiries and renewals falling due, routed to the record's owner or, where it has none, to the division head."],
             ["Approvals", "Raised to whoever holds the authority for that value, on the request itself."],
             ["Contract expiry and renewal", "Notice windows and expiries on the live contract book."]].map(([t, d]) => html`
            <div key=${t} class="row" style="padding:12px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1"><div class="panel__title">${t}</div><div class="tiny muted">${d}</div></div>
              <${Pill} tone="green" dot=${true}>In-app</${Pill}>
            </div>`)}
          <div class="banner" style="align-items:flex-start;margin-top:14px">
            <${Icon} name="alertCircle" size=15 />
            <div class="tiny"><strong>Email is not connected.</strong> No mailbox is configured for LegalOS,
              so nothing here is emailed and no digest or weekly report is sent. Everything above appears on
              the bell in the top bar and on the record it belongs to.</div>
          </div>
        </${Section}>`}

        ${/* WHAT THE AI ACTUALLY IS, AND WHAT IT IS NOT.
              Five toggles here claimed features that do not exist — auto-extract
              on upload, risk scoring on intake, delay prediction — and none of
              them was wired to anything: they were `useState`, reset on reload.
              Under them sat a "Reasoning model" selector offering "Claude Opus
              4.8", which is not a model, for a choice this product does not
              make: the assistant runs through the Claude CLI installed on this
              host and uses whatever that is configured with. */ ""}
        ${sec === "ai" && html`<${Section} title="AI & Automation" icon="sparkles">
          <div class="banner banner--info" style="margin-bottom:12px"><${Icon} name="lock" size=17 />
            Structured record facts only. The assistant is sent fields — parties, dates, types, statuses and
            counts — and never the contents of a document.</div>
          <div class="row" style="padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1"><div class="panel__title">Register assistant</div>
              <div class="tiny muted">Answers questions about the registers you can open, states which ones it
                read and how much of each, and refuses to guess at what a document says.</div></div>
            <${Btn} size="sm" variant="ghost" onClick=${() => navigate("/assistant")}>Open</${Btn}>
          </div>
          <div class="row" style="padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1"><div class="panel__title">Record review notes</div>
              <div class="tiny muted">The short review on a case, contract or notice page, assembled from that
                record's own fields.</div></div>
            <${Pill} tone="green" dot=${true}>On</${Pill}>
          </div>
          <div class="tiny muted" style="margin-top:14px">
            There is nothing to configure here. The model is whatever the Claude CLI on this host is set to;
            LegalOS does not choose one, and the extraction, intake-scoring and delay-prediction switches that
            used to sit on this page were not connected to anything.
          </div>
        </${Section}>`}

        ${sec === "integrations" && (() => {
          const d = health && health.config && health.config.drive;
          const driveOn = !!(d && d.serviceAccountPresent && d.folderConfigured);
          const driveDetail = driveOn && health.drive
            ? `${(health.drive.fileCount || 0).toLocaleString()} files indexed · ${(health.drive.roots || []).length} folders`
            : null;
          return html`<div class="col" style="gap:12px">
            <div class="tiny muted">Google Drive is a live backend connection — the legal knowledge base. The others are illustrative placeholders for a future rollout.</div>
            <div class="grid grid--2">
              ${INTEGRATIONS.map((it) => {
                const isDrive = it.live === "drive";
                const status = isDrive
                  ? (!health ? html`<span class="tiny muted">Checking…</span>`
                      : driveOn ? html`<${Pill} tone="green" dot=${true}>Connected</${Pill}>`
                        : html`<${Btn} variant="ghost" size="sm">Connect</${Btn}>`)
                  : html`<${Pill} tone="gray">Demo</${Pill}>`;
                return html`<div key=${it.name} class="card card--pad">
                  <div class="row" style="gap:12px">
                    <div class="metric__icon" style=${`background:${it.color}1a;color:${it.color};width:40px;height:40px`}><${Icon} name=${it.icon} size=19 /></div>
                    <div style="flex:1;min-width:0"><div class="strong">${it.name}</div><div class="tiny muted">${(isDrive && driveDetail) || it.desc}</div></div>
                    ${status}
                  </div>
                </div>`;
              })}
            </div>
          </div>`;
        })()}

        ${/* NO INVENTED COMMERCIAL TERMS (§99).
              This printed a plan nobody sells — "Enterprise · Unlimited matters
              · 16 seats · SSO · audit · $4,800/mo", "Seats used 16 / 25" — over
              two buttons that did nothing, in a system that has no billing
              relationship, no seat model and no price. It also said "matters",
              a concept this product removed. What IS real is the roster: the
              accounts that exist and who is active, which Users & Access owns
              and which is the only seat question anybody here can answer. */ ""}
        ${sec === "billing" && html`<${Section} title="Plan & billing" icon="card">
          <div class="banner" style="align-items:flex-start;margin-bottom:14px">
            <${Icon} name="alertCircle" size=15 />
            <div class="tiny">
              <strong>LegalOS is not billed through this system.</strong> There is no plan, seat count or
              price to show here — it runs on the group's own infrastructure. The figures that used to sit
              on this page were written by hand and described a product that does not exist.
            </div>
          </div>
          <div class="row"><span class="dim">Accounts on the roster</span><div class="spacer"></div>
            <span class="strong">${(USERS || []).length}</span></div>
          <div class="tiny muted" style="margin-top:6px">Who they are, what each may open and which are active
            is managed in Users ${"&"} Access — that is the only seat question this system can answer.</div>
          <div class="row" style="margin-top:18px">
            <${Btn} variant="ghost" icon="users" onClick=${() => navigate("/access")}>Open Users ${"&"} Access</${Btn}></div>
        </${Section}>`}
      </div>
    </div>

  </div>`;
}
