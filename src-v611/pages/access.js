// Administration → Users & Access. The admin surface over the permission engine
// (api/permissions.js). Every change here writes through the same engine that
// computes effective access at sign-in, so nav, pages, registers and dashboards
// all move together — no hardcoded admins, no frontend-only toggles.
import { html, cx, fmt, useState, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Section, Input, Tabs, Avatar } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { RegisterShell } from "../register.js";
import { api } from "../api.js";
import { toast } from "../toast.js";

const GROUP_LABEL = { commercial: "Commercial & Risk", compliance: "Compliance & Licences", litigation: "Litigation & Disputes", shared: "Shared", insight: "Insight & Reports", admin: "Administration" };
const LEVEL_TONE = { none: "gray", view: "blue", edit: "amber", full: "green" };
const levelPill = (lv) => html`<${Pill} tone=${LEVEL_TONE[lv] || "gray"}>${lv}</${Pill}>`;

export default function Access() {
  const [tab, setTab] = useState("users");
  const [data, setData] = useState(null);   // { users, roles, groups, levels }
  const [audit, setAudit] = useState([]);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null); // { groups, status, role }
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.access.users().then((r) => { setData(r); setErr(null); }, (e) => setErr(e));
  useEffect(() => { load(); api.access.audit().then((r) => setAudit(r.audit || []), () => {}); }, []);

  if (err) return html`<div class="page page--wide fade-in"><${PageHead} title="Users & Access" /><div class="empty" style="padding:44px"><${Icon} name="lock" size=34 /><div>${err.status === 403 ? "You do not have administrator access." : "Could not load access data."}</div></div></div>`;
  if (!data) return html`<div class="page page--wide fade-in"><${PageHead} title="Users & Access" sub="Loading…" /></div>`;

  const { users, roles, groups } = data;
  const open = users.find((u) => u.id === openId);
  const startEdit = (u) => { setOpenId(u.id); setDraft({ groups: { ...u.groups }, status: u.status, role: u.accessRole }); };
  const dirty = open && draft && (JSON.stringify(draft.groups) !== JSON.stringify(open.groups) || draft.status !== open.status);

  const applyRole = (roleKey) => { setSaving(true); api.access.updateUser(open.id, { role: roleKey }).then((r) => { toast("Role applied"); load().then(() => { const u = (r.user); if (u) setDraft({ groups: { ...u.groups }, status: u.status, role: u.accessRole }); }); }).finally(() => setSaving(false)); };
  const save = () => {
    setSaving(true);
    api.access.updateUser(open.id, { groups: draft.groups, status: draft.status }).then(
      (r) => { toast("Access updated for " + open.name); load(); api.access.audit().then((a) => setAudit(a.audit || []), () => {}); },
      () => toast("Could not save")
    ).finally(() => setSaving(false));
  };

  // Filters on the user register. Every option comes from the roster the server
  // returned, so an administrator sees exactly the values that exist.
  // There is no last-login field on the roster, so there is no last-login
  // filter — see TABLE_FILTER_AUDIT.md.
  const userFields = [
    { key: "status",  label: "Status",        type: "multi", get: (u) => (u.status === "active" ? "Active" : "Deactivated") },
    { key: "arole",   label: "Access role",   type: "multi", get: (u) => (roles.find((r) => r.key === u.accessRole) || {}).label || u.accessRole },
    { key: "team",    label: "Legal team",    type: "multi", get: (u) => (u.legalTeam ? GROUP_LABEL[u.legalTeam] : "") },
    { key: "modules", label: "Module access", type: "multi", multiValue: true,
      get: (u) => groups.filter((g) => u.groups[g] !== "none").map((g) => GROUP_LABEL[g]) },
    { key: "level",   label: "Access level",  type: "multi", multiValue: true,
      get: (u) => [...new Set(groups.map((g) => u.groups[g]).filter((lv) => lv && lv !== "none"))] },
    { key: "jobrole", label: "Job title",     type: "multi", get: (u) => u.role, advanced: true },
    { key: "dept",    label: "Department",    type: "multi", get: (u) => u.team, advanced: true },
    { key: "changed", label: "Last change",   type: "datePast", get: (u) => u.updatedAt, advanced: true },
  ];
  const userColumns = (f) => [
    { key: "name", label: "User", essential: true, sortValue: true, plain: (u) => u.name,
      render: (u) => html`<div class="row" style="gap:10px"><${Avatar} name=${u.name} size="sm" /><div><div class="cell-strong">${u.name}</div><div class="tiny muted">${u.role}</div></div></div>` },
    { key: "email", label: "Email", sortValue: true, plain: (u) => u.email,
      render: (u) => html`<span class="tiny muted">${u.email || "—"}</span>` },
    { key: "team", label: "Team", sortValue: true, plain: (u) => (u.legalTeam ? GROUP_LABEL[u.legalTeam] : ""),
      render: (u) => html`<span class="tiny">${u.legalTeam ? GROUP_LABEL[u.legalTeam] : "—"}</span>` },
    { key: "accessRole", label: "Access role", sortValue: true, plain: (u) => u.accessRole,
      render: (u) => html`<${Pill} tone=${u.accessRole === "superAdmin" ? "green" : "gray"}>${(roles.find((r) => r.key === u.accessRole) || {}).label || u.accessRole}</${Pill}>` },
    { key: "modules", label: "Modules", align: "center", sortAs: "number", sortValue: true, plain: (u) => u.moduleCount,
      render: (u) => html`<span class="tiny strong">${u.moduleCount}/6</span>` },
    { key: "status", label: "Status", sortValue: true, plain: (u) => u.status,
      render: (u) => html`<${Status} value=${u.status === "active" ? "Active" : "Inactive"} />` },
    { key: "updatedAt", label: "Last change", sortAs: "date", sortValue: true, plain: (u) => u.updatedAt || "",
      render: (u) => html`<span class="tiny muted">${u.updatedAt ? fmt.rel(u.updatedAt) : "—"}${u.updatedBy ? " · " + u.updatedBy : ""}</span>` },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Users & Access" sub="Role-based access with per-user overrides — the single permission engine behind navigation, pages, registers and dashboards." />
    <${StatStrip} stats=${[
      { value: users.length, label: "Users" },
      { value: users.filter((u) => u.accessRole === "superAdmin").length, label: "Super admins" },
      { value: users.filter((u) => u.status === "active").length, label: "Active" },
      { value: users.filter((u) => u.status !== "active").length, label: "Deactivated", tone: users.some((u) => u.status !== "active") ? "red" : undefined },
    ]} />
    <div style="margin-bottom:14px"><${Tabs} tabs=${[{ key: "users", label: "Users", icon: "users" }, { key: "matrix", label: "Access Matrix", icon: "grid" }, { key: "audit", label: "Access Audit", icon: "activity", count: audit.length }]} active=${tab} onChange=${setTab} /></div>

    ${tab === "users" && html`<div class="grid" style="grid-template-columns:${open ? "1fr 420px" : "1fr"};align-items:start;gap:16px">
      <div>
        <${RegisterShell}
          ns="usr" rows=${users}
          fields=${userFields} columns=${userColumns}
          views=${[
            { id: "deact", label: "Deactivated", filters: { status: "Deactivated" } },
            { id: "admins", label: "Administrators", filters: { modules: GROUP_LABEL.admin } },
            { id: "noaccess", label: "No module access", filters: { modules: "—" } },
          ]}
          searchKeys=${["name", "email", "accessRole", "team", "role"]}
          searchPlaceholder="Search users, emails, roles…"
          noun=${["user", "users"]}
          onRow=${startEdit}
          exportName="users-and-access" emptyIcon="users" />
      </div>
      ${open && draft && html`<div class="card card--pad col" style="gap:14px;position:sticky;top:16px">
        <div class="row" style="gap:10px"><${Avatar} name=${open.name} size="md" /><div style="flex:1"><div class="strong" style="font-size:15px">${open.name}</div><div class="tiny muted">${open.role} · ${open.email}</div></div><button class="iconbtn" onClick=${() => { setOpenId(null); setDraft(null); }}><${Icon} name="x" size=16 /></button></div>
        <div class="row" style="gap:8px;align-items:center"><span class="tiny muted">Status</span><div class="spacer"></div>
          <button class=${cx("chip", draft.status === "active" && "chip--active")} onClick=${() => setDraft({ ...draft, status: "active" })}>Active</button>
          <button class=${cx("chip", draft.status !== "active" && "chip--active")} onClick=${() => setDraft({ ...draft, status: "inactive" })}>Deactivated</button>
        </div>
        <div class="col" style="gap:6px">
          <div class="row"><span class="tiny muted">Apply a role template</span></div>
          <div class="row wrap" style="gap:6px">${roles.map((r) => html`<button key=${r.key} class=${cx("chip", open.accessRole === r.key && "chip--active")} onClick=${() => applyRole(r.key)} title="Reset access to this role">${r.label}</button>`)}</div>
        </div>
        <div class="col" style="gap:8px">
          <div class="strong tiny" style="text-transform:uppercase;letter-spacing:.04em">Module access (effective)</div>
          ${groups.map((g) => html`<div key=${g} class="row" style="gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
            <span class="tiny" style="flex:1">${GROUP_LABEL[g]}</span>
            <select class="select" style="width:120px" value=${draft.groups[g]} onChange=${(e) => setDraft({ ...draft, groups: { ...draft.groups, [g]: e.target.value } })}>
              ${(data.levels || ["none", "view", "edit", "full"]).map((lv) => html`<option key=${lv} value=${lv}>${lv}</option>`)}
            </select>
          </div>`)}
        </div>
        ${dirty && html`<div class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning)">
          <div class="tiny strong" style="margin-bottom:4px">Unsaved changes</div>
          ${groups.filter((g) => draft.groups[g] !== open.groups[g]).map((g) => html`<div key=${g} class="tiny">${GROUP_LABEL[g]}: ${open.groups[g]} → <b>${draft.groups[g]}</b></div>`)}
          ${draft.status !== open.status && html`<div class="tiny">Status: ${open.status} → <b>${draft.status}</b></div>`}
        </div>`}
        <div class="row" style="gap:8px"><div class="spacer"></div><${Btn} variant="ghost" size="sm" onClick=${() => setDraft({ groups: { ...open.groups }, status: open.status, role: open.accessRole })} disabled=${!dirty}>Reset</${Btn}><${Btn} variant="primary" size="sm" icon="check" onClick=${save} disabled=${!dirty || saving}>${saving ? "Saving…" : "Save access"}</${Btn}></div>
      </div>`}
    </div>`}

    ${tab === "matrix" && html`<${Section} title="Access Matrix" icon="grid" sub="Every user × module group; the level is the effective access." bodyClass="">
      <div style="overflow:auto"><table class="table"><thead><tr><th>User</th>${groups.map((g) => html`<th key=${g} style="text-align:center">${GROUP_LABEL[g].split(" ")[0]}</th>`)}</tr></thead>
      <tbody>${users.map((u) => html`<tr key=${u.id} class="clickable" onClick=${() => { setTab("users"); startEdit(u); }}><td><div class="cell-strong">${u.name}</div><div class="tiny muted">${(roles.find((r) => r.key === u.accessRole) || {}).label || u.accessRole}</div></td>
        ${groups.map((g) => html`<td key=${g} style="text-align:center">${levelPill(u.groups[g])}</td>`)}</tr>`)}</tbody></table></div>
    </${Section}>`}

    ${tab === "audit" && html`<${Section} title="Access Audit" icon="activity" sub=${audit.length + " change events — who changed whose access, and the before/after"} bodyClass="col">
      ${audit.length === 0 ? html`<div class="empty" style="padding:24px"><div>No access changes recorded yet.</div></div>` : audit.map((a, i) => {
        const u = users.find((x) => x.id === a.user);
        const changed = (a.before && a.after) ? GROUP_LABEL && Object.keys(a.after.groups || {}).filter((g) => (a.before.groups || {})[g] !== a.after.groups[g]) : [];
        return html`<div key=${i} class="feed__item" style="align-items:flex-start">
          <div class="notif__ico" style="width:30px;height:30px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="shield" size=14 /></div>
          <div style="flex:1;min-width:0">
            <div class="tiny strong">${(u ? u.name : a.user)} — ${a.before && a.after && a.before.status !== a.after.status ? "status " + a.before.status + " → " + a.after.status : "access updated"}</div>
            <div class="tiny muted">${fmt.dateTime ? fmt.dateTime(a.ts) : fmt.date(a.ts)} · by ${a.by}${a.reason ? " · " + a.reason : ""}</div>
            ${changed && changed.length ? html`<div class="tiny" style="margin-top:2px">${changed.map((g) => html`<span key=${g} style="margin-right:8px">${GROUP_LABEL[g]}: ${a.before.groups[g]} → <b>${a.after.groups[g]}</b></span>`)}</div>` : ""}
          </div>
        </div>`;
      })}
    </${Section}>`}
  </div>`;
}
