// App shell: Sidebar · Topbar · Command Palette · Notifications · Copilot dock.
import { html, cx, fmt, useState, useEffect, useRef, Fragment } from "./core.js";
import { Icon } from "./icons.js";
import { Avatar, Btn, Dropdown, MenuItem, Pill } from "./ui.js";
import { NAV, NAV_FLAT, labelFor, REQUESTER_DOOR_PATHS } from "./nav.js";
import { navigate, parsePath } from "./router.js";
import { COMPANY, NOTIFICATIONS, USERS, CONTRACTS, MATTERS, COMPANIES, LICENSES, licenseStatus, byId, CONTRACT_TYPE_CODES, LEGAL_SUBDIVISIONS } from "./data.js";
import { getCollection, notifsFor, markNotifsRead, useCollection } from "./store.js";
import { allReminders } from "./reminders.js";
import { TourOverlay, TourButton } from "./tour.js";
import { signOut, CREDENTIAL_GROUPS, isRequesterDoor } from "./pages/login.js";
import { senderName } from "./messages.js";
// Sprint 6 — the org architecture: View As, RBAC-filtered search, team modules.
import { useActiveUser, setViewAs, landingFor, filterVisible, navForUser, canOpenPath } from "./rbac.js";

// The View-As persona switcher is a demo/testing affordance only. It appears
// when running locally (or with ?personas=1); a production build uses the real
// SSO identity and never shows the switcher.
const DEMO_PERSONAS = (() => {
  try {
    // Never on the requester portal: that surface is for requesting, and
    // switching identity from it is exactly what must not be possible — not
    // even on a local build.
    if (isRequesterDoor()) return false;
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || /[?&]personas=1/.test(location.search);
  } catch (e) { return false; }
})();
import { teamShort, RBAC_ROLES } from "./org.js";
import { moduleByKey } from "./modules.js";
import { ToastHost } from "./toast.js";

/* ---------------- Theme ---------------- */
export function getTheme() { return localStorage.getItem("legalos-theme") || "light"; }
export function setTheme(t) {
  localStorage.setItem("legalos-theme", t);
  document.documentElement.dataset.theme = t;
}

/* ---------------- View As (FRD Section 14 demo affordance) ----------------
   The prototype has no real login; this switcher swaps the active identity and
   the whole app — landing, queues, badges, search, notifications — obeys that
   identity's row-level visibility. */
// ONE roster: the switcher lists exactly the credential views from the login
// screen — same people, same labels — so the sidebar can never drift from the
// sign-in screen or from the assignment bench.
function ViewAs() {
  const me = useActiveUser();
  return html`<${Dropdown} align="left" width=${280} drop="up" trigger=${html`<div class="sidebar__user">
    <${Avatar} name=${me.name} size="md" />
    <div class="sidebar__user-meta"><div class="sidebar__user-name">${me.name}</div><div class="sidebar__user-role">${me.role}</div></div>
    <${Icon} name="chevronDown" size=15 style=${{ color: "var(--sidebar-fg-dim)" }} />
  </div>`}>
    <div class="menu__label">View as — access follows the identity</div>
    ${CREDENTIAL_GROUPS.flatMap((g) => g.people).map((pp) => {
      const u = byId(pp.id);
      if (!u) return null;
      return html`<${MenuItem} key=${pp.id} icon=${me.id === pp.id ? "check" : "user"}
        onClick=${() => { setViewAs(pp.id); navigate(landingFor(u)); }}>
        <div style="min-width:0">
          <div style=${`font-weight:${me.id === pp.id ? 700 : 500}`}>${u.name}</div>
          <div class="tiny muted">${pp.view}</div>
        </div>
      </${MenuItem}>`;
    })}
    <div class="menu__sep"></div>
    <${MenuItem} icon="settings" onClick=${() => navigate("/settings")}>Settings</${MenuItem}>
    <${MenuItem} icon="arrowLeft" onClick=${signOut}>Sign out — switch identity</${MenuItem}>
  </${Dropdown}>`;
}

/* ---------------- Sidebar ---------------- */
function Sidebar({ path, collapsed }) {
  const { base } = parsePath(path);
  const me = useActiveUser();
  const mods = useCollection("modRequests");
  // Live badge: open items assigned to the active identity.
  const myOpen = mods.filter((r) => r.owner === me.id && r.status !== "Closed").length;
  const badgeFor = (it) => (it.badge === "myTasks" ? (myOpen || undefined) : it.badge);
  const isActive = (it) => (it.path.startsWith("/m/") ? path.startsWith(it.path) : base === it.path);

  const sections = navForUser(me);
  // EVERY group starts collapsed on every page load — deliberately not
  // remembered, and the group holding the current page is not forced open, so
  // arriving at the page always shows the same compact nav.
  const [openMap, setOpenMap] = useState({});
  const isOpen = (sec) => !!openMap[sec.section];
  const toggle = (name) => setOpenMap((m) => ({ ...m, [name]: !m[name] }));
  // A closed group must still surface what needs attention, or a licence alert
  // silently disappears behind a chevron.
  const groupBadge = (sec) => sec.items.reduce((n, it) => n + (Number(badgeFor(it)) || 0), 0);
  const groupAlert = (sec) => sec.items.some((it) => it.alert);

  const navItem = (it) => html`<div key=${it.path}
    class=${cx("nav__item", isActive(it) && "active")}
    onClick=${() => navigate(it.path)}>
    <${Icon} name=${it.icon} size=17 />
    <span>${it.label}</span>
    ${badgeFor(it) && html`<span class=${cx("nav__badge", it.alert && "nav__badge--alert")}>${badgeFor(it)}</span>`}
  </div>`;

  return html`<aside class="sidebar">
    <div class="sidebar__brand">
      <svg class="sidebar__brand-logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0d7a3f"/><path d="M9 22V10h2.6c3 0 4.8 1.9 4.8 4.8v.2c0 2.9-1.8 4.8-4.8 4.8H11v2H9Zm9 0V10h2v10h5v2h-7Z" fill="white"/></svg>
      <div class="sidebar__brand-text">
        <div class="sidebar__brand-name">LegalOS</div>
        <div class="sidebar__brand-sub">Enterprise</div>
      </div>
    </div>

    <${Dropdown} align="left" width=${220} trigger=${html`<div class="workspace">
      <div class="workspace__logo">${COMPANY.short}</div>
      <div class="workspace__meta"><div class="workspace__name">${COMPANY.name}</div><div class="workspace__type">All entities · Global</div></div>
      <${Icon} name="chevronDown" size=15 style=${{ color: "var(--sidebar-fg-dim)" }} />
    </div>`}>
      <div class="menu__label">Legal entities</div>
      ${COMPANY.entities.map((e) => html`<${MenuItem} key=${e} icon="building">${e}</${MenuItem}>`)}
      <div class="menu__sep"></div>
      <${MenuItem} icon="plus">Add entity</${MenuItem}>
    </${Dropdown}>

    <nav class="nav">
      ${sections.map((sec) => sec.section === null
        // No header, never collapsible — the request row.
        ? html`<div class="nav__section nav__section--bare" key="bare">
            ${sec.items.map(navItem)}
          </div>`
        : html`<div class="nav__section" key=${sec.section}>
            <button type="button" class=${cx("nav__label", "nav__label--toggle", isOpen(sec) && "is-open")}
              aria-expanded=${isOpen(sec) ? "true" : "false"}
              onClick=${() => toggle(sec.section)}>
              <${Icon} name="chevronDown" size=13 />
              <span class="nav__label-text">${sec.section}</span>
              ${!isOpen(sec) && groupBadge(sec) > 0 && html`<span
                class=${cx("nav__badge", groupAlert(sec) && "nav__badge--alert")}>${groupBadge(sec)}</span>`}
            </button>
            ${isOpen(sec) && html`<div class="nav__items">${sec.items.map(navItem)}</div>`}
          </div>`)}
    </nav>

    <div class="sidebar__foot">
      ${DEMO_PERSONAS ? html`<${ViewAs} />` : html`<${UserChip} />`}
    </div>
  </aside>`;
}

// Production identity chip — no inline persona switching; identity changes go
// through the credential screen (Sign out → pick another view).
function UserChip() {
  const me = useActiveUser();
  // On the requester portal the only action is leaving: Settings is a legal
  // configuration surface, and the sign-out copy must not advertise identity
  // switching the portal does not offer (it returns to the requester roster).
  const door = isRequesterDoor();
  return html`<${Dropdown} align="left" width=${240} drop="up" trigger=${html`<div class="sidebar__user">
    <${Avatar} name=${me.name} size="md" />
    <div class="sidebar__user-meta"><div class="sidebar__user-name">${me.name}</div><div class="sidebar__user-role">${me.role}</div></div>
    <${Icon} name="chevronDown" size=15 style=${{ color: "var(--sidebar-fg-dim)" }} />
  </div>`}>
    ${!door && html`<${MenuItem} icon="settings" onClick=${() => navigate("/settings")}>Settings</${MenuItem}>`}
    <${MenuItem} icon="arrowLeft" onClick=${signOut}>${door ? "Sign out" : "Sign out — switch identity"}</${MenuItem}>
  </${Dropdown}>`;
}

/* ---------------- Notifications panel ---------------- */
// Auto license alerts (Feature 1) — derived on mount, keyed by licenseId+status
// so reloading never stacks duplicates.
function licenseNotifs() {
  const licenses = getCollection("licenses") || LICENSES;
  return licenses
    .map((l) => ({ l, s: licenseStatus(l) }))
    .filter((x) => x.s.key !== "Valid")
    .sort((a, b) => a.s.days - b.s.days)
    .map(({ l, s }) => ({
      id: "lic-" + l.id + "-" + s.key,
      type: "license",
      title: `${l.name} — ${l.entity} ${s.key === "Expired" ? "expired " + Math.abs(s.days) + "d ago" : "expires " + fmt.until(l.expiryDate)}`,
      time: new Date().toISOString(),
      unread: true,
      tone: s.key === "Expired" ? "red" : "amber",
      icon: s.key === "Expired" ? "alertTriangle" : "clock",
    }));
}
// Lifecycle reminders (Workstream G) — renewals, notice windows and extracted
// obligations, deduped by record+milestone exactly like the license alerts.
function lifecycleNotifs() {
  const contracts = getCollection("contracts") || CONTRACTS;
  return allReminders(contracts).slice(0, 12).map((r) => ({
    id: r.id,
    type: "lifecycle",
    title: r.title,
    time: new Date().toISOString(),
    unread: r.dueDays <= 7,
    tone: r.tone,
    icon: r.icon,
    path: r.path,
  }));
}
// Sprint 4 — portal traffic: new submissions, requester replies and documents
// that came back. Deduped by event id like the other feeds.
function portalNotifs() {
  const requests = getCollection("requests") || [];
  const messages = getCollection("messages") || [];
  const out = [];

  requests.filter((r) => r.channel === "portal").slice(0, 6).forEach((r) => {
    out.push({
      id: "portal-new-" + r.id,
      type: "portal",
      title: `${r.id} raised in the portal — ${r.title}`,
      time: r.requestDate || r.created,
      unread: r.status === "Triage" || r.status === "New",
      tone: "purple",
      icon: "inbox",
      path: "/workspace/" + r.id,
    });
  });

  // Requester messages the legal side has not read.
  messages
    .filter((m) => m.role === "requester" && !(m.readBy || []).includes("u1"))
    .slice(0, 8)
    .forEach((m) => {
      const r = requests.find((x) => x.id === m.requestId);
      out.push({
        id: "portal-msg-" + m.id,
        type: "portal",
        title: `${senderName(m.from)} replied on ${m.requestId}${r ? " — " + r.title : ""}`,
        time: m.at,
        unread: true,
        tone: "blue",
        icon: "message",
        path: "/workspace/" + m.requestId,
      });
    });

  // Documents legal asked for that have now arrived.
  requests.forEach((r) => {
    (r.requiredDocs || []).filter((d) => d.status === "received" && d.receivedAt).slice(0, 2).forEach((d) => {
      out.push({
        id: "portal-doc-" + d.id,
        type: "portal",
        title: `${d.name} received on ${r.id}`,
        time: d.receivedAt,
        unread: false,
        tone: "green",
        icon: "checkcircle",
        path: "/workspace/" + r.id,
      });
    });
  });

  return out.sort((a, b) => new Date(b.time) - new Date(a.time));
}
function dedupeById(arr) {
  const seen = new Set();
  return arr.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

function NotifButton() {
  const me = useActiveUser();
  const live = useCollection("notifs"); // subscribes — sweeps and actions land here
  const [readLocal, setReadLocal] = useState(false);
  // Section 12 feeds addressed to the active identity, then the legacy feeds.
  const items = dedupeById([
    ...notifsFor(me).map((n) => ({ ...n, unread: readLocal ? false : n.unread })),
    ...(me.rbac === "head" || me.legalTeam ? [...portalNotifs(), ...lifecycleNotifs(), ...licenseNotifs(), ...NOTIFICATIONS].map((n) => ({ ...n, unread: readLocal ? false : n.unread })) : []),
  ]);
  const setItems = (updated) => { setReadLocal(true); markNotifsRead(); };
  const unread = items.filter((n) => n.unread).length;
  const toneBg = { amber: "var(--warning-bg)", red: "var(--danger-bg)", blue: "var(--brand-soft)", purple: "var(--accent-soft)", green: "var(--success-bg)" };
  const toneFg = { amber: "var(--warning)", red: "var(--danger)", blue: "var(--brand)", purple: "var(--accent-500)", green: "var(--success)" };
  return html`<${Dropdown} width=${380} trigger=${html`<button class="iconbtn"><${Icon} name="bell" size=18 />${unread > 0 && html`<span class="iconbtn__dot"></span>`}</button>`}>
    <div class="row" style="padding:6px 10px 10px">
      <span class="strong">Notifications</span>
      <span class="spacer"></span>
      <button class="tiny" style="color:var(--brand);font-weight:600" onClick=${(e) => { e.stopPropagation(); setItems(items.map((n) => ({ ...n, unread: false }))); }}>Mark all read</button>
    </div>
    <div style="max-height:400px;overflow-y:auto;margin:0 -6px">
      ${items.map((n) => html`<div key=${n.id} class=${cx("notif", n.unread && "notif--unread", n.path && "clickable")}
        onClick=${n.path ? () => navigate(n.path) : null}>
        <div class="notif__ico" style=${`background:${toneBg[n.tone]};color:${toneFg[n.tone]}`}><${Icon} name=${n.icon} size=16 /></div>
        <div style="flex:1"><div class="notif__text">${n.title}</div><div class="notif__time">${fmt.rel(n.time)}</div></div>
      </div>`)}
    </div>
  </${Dropdown}>`;
}

/* ---------------- Command Palette ---------------- */
function CommandPalette({ onClose }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  const ql = q.toLowerCase();
  const me = useActiveUser();
  // The palette must not offer a destination this identity or this surface
  // cannot open. On the requester portal that is the door allowlist; elsewhere
  // it is the same role filter the sidebar uses, so a requester's palette can
  // no longer list the executive overview.
  const door = isRequesterDoor();
  // Offer nothing this identity cannot open. The Actions list is hand-written and
  // points at pages outside the nav (/copilot, /reviews, /my-tasks), so it needs
  // the page gate itself, not just the nav paths — otherwise the palette shows a
  // shortcut that lands on "you do not have access".
  const reachable = (p) => (door ? REQUESTER_DOOR_PATHS.has(p) : canOpenPath(me, p));
  const navResults = NAV_FLAT
    .filter((i) => i.label.toLowerCase().includes(ql) && reachable(i.path))
    .map((i) => ({ group: "Navigate", label: i.label, icon: i.icon, path: i.path }));
  const actions = [
    { group: "Actions", label: "Raise a request to any Legal team", icon: "plus", path: "/raise" },
    { group: "Actions", label: "My Tasks — most urgent first", icon: "checksquare", path: "/my-tasks" },
    { group: "Actions", label: "Cost analysis & budget burn", icon: "dollar", path: "/costs" },
    { group: "Actions", label: "Master data admin", icon: "database", path: "/settings" },
    { group: "Actions", label: "New Legal Request", icon: "plus", path: "/workspace" },
    { group: "Actions", label: "Add or scan a document", icon: "scan", path: "/repository" },
    { group: "Actions", label: "Open the Contract Tracker", icon: "grid", path: "/tracker" },
    { group: "Actions", label: "Show delayed work", icon: "alertTriangle", path: "/workspace" },
    { group: "Actions", label: "Active PPAs and land values", icon: "building", path: "/analyzer" },
    { group: "Actions", label: "My pipeline / team load", icon: "columns", path: "/pipelines" },
    { group: "Actions", label: "Lifecycle reminders", icon: "bell", path: "/pipelines" },
    { group: "Actions", label: "Requester portal preview", icon: "user", path: "/portal" },
    { group: "Actions", label: "Upload contract for AI review", icon: "scan", path: "/reviews" },
    { group: "Actions", label: "Generate NDA from template", icon: "sparkles", path: "/templates" },
    { group: "Actions", label: "Ask AI Copilot", icon: "robot", path: "/copilot" },
  ].filter((a) => a.label.toLowerCase().includes(ql) && reachable(a.path));
  // Search live store collections so records created in-session are findable.
  const companies = getCollection("companies") || COMPANIES;
  const liveContracts = getCollection("contracts") || CONTRACTS;
  const liveRequests = getCollection("requests") || [];
  const liveDocs = getCollection("repository") || [];
  // Cross-team search obeys the Section 14 row-level filter — it is the same
  // gate as the queues, never a bypass. Matters are privilege-filtered here
  // too (Module 2 §14): a Privileged matter must NOT surface in search for
  // anyone who is not named on it.
  const liveMods = filterVisible(me, getCollection("modRequests") || []);
  const liveMatters = filterVisible(me, getCollection("matters") || MATTERS);
  // A document attached to a matter inherits that matter's privilege — it must
  // not surface in search when the matter itself would not.
  const matterVisible = (mid) => !mid || liveMatters.some((m) => m.id === mid) ;
  const entities = [
    ...liveMods.map((r) => {
      const d = moduleByKey(r.moduleKey);
      return { group: "Team modules", label: `${r.id} · ${r.title}`, icon: d ? d.icon : "folder", path: "/m/" + r.moduleKey + "/" + r.id };
    }),
    // Every record routes to its Flow view — the spine is the destination.
    ...liveRequests.map((r) => ({ group: "Requests & matters", label: `${r.id} · ${r.title}`, icon: "inbox", path: "/workspace/" + r.id })),
    ...liveMatters.map((m) => ({ group: "Requests & matters", label: `${m.id} · ${m.title}`, icon: "folder", path: "/matters/" + m.id })),
    ...liveContracts.map((c) => ({ group: "Contracts", label: `${c.id} · ${c.title}`, icon: "file", path: "/contracts/" + c.id })),
    ...liveContracts.filter((c) => c.srNo).map((c) => ({ group: "Contracts", label: `Sr No ${c.srNo} · ${c.physicalRecordRef} · ${c.officeLocation}`, icon: "database", path: "/contracts/" + c.id })),
    ...liveDocs.filter((d) => matterVisible(d.matterId)).map((d) => ({ group: "Documents", label: `${d.id} · ${d.name}`, icon: "scan", path: "/repository/" + d.id })),
    ...CONTRACT_TYPE_CODES.map((t) => ({ group: "Contract types", label: t, icon: "file", path: "/workspace" })),
    ...LEGAL_SUBDIVISIONS.map((s) => ({ group: "Legal sub-divisions", label: s, icon: "scale", path: "/workspace" })),
    ...companies.map((c) => ({ group: "Companies & entities", label: `${c.name} · ${c.jur || c.jurisdiction}`, icon: "building", path: "/companies/" + c.id })),
  ].filter((e) => e.label.toLowerCase().includes(ql)).slice(0, 40);

  const results = [...actions, ...navResults, ...(ql ? entities : [])];
  const groups = [...new Set(results.map((r) => r.group))];

  const go = (r) => { navigate(r.path); onClose(); };
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === "Enter" && results[active]) go(results[active]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, results]);

  let idx = -1;
  return html`<div class="overlay" onClick=${onClose}>
    <div class="cmdk" onClick=${(e) => e.stopPropagation()}>
      <div class="cmdk__input">
        <${Icon} name="search" size=19 style=${{ color: "var(--text-3)" }} />
        <input ref=${inputRef} placeholder="Search or run a command…" value=${q} onInput=${(e) => { setQ(e.target.value); setActive(0); }} />
        <span class="kbd">ESC</span>
      </div>
      <div class="cmdk__list">
        ${results.length === 0 && html`<div class="empty" style="padding:30px"><div>No results for "${q}"</div></div>`}
        ${groups.map((g) => html`<div key=${g}>
          <div class="cmdk__group">${g}</div>
          ${results.filter((r) => r.group === g).map((r) => {
            idx++;
            const my = idx;
            return html`<div key=${r.label} class=${cx("cmdk__item", active === my && "active")}
              onMouseEnter=${() => setActive(my)} onClick=${() => go(r)}>
              <div class="cmdk__ico"><${Icon} name=${r.icon} size=16 /></div>
              <span>${r.label}</span>
            </div>`;
          })}
        </div>`)}
      </div>
    </div>
  </div>`;
}

/* ---------------- Topbar ---------------- */
function Topbar({ path, onSearch, onToggleTheme, theme }) {
  const { base, id, sub } = parsePath(path);
  const me = useActiveUser();
  // /m/<moduleKey>/<recordId> — crumbs show the module label, then the record.
  const isModule = base === "/m";
  const modDef = isModule ? moduleByKey(id) : null;
  const crumbLabel = isModule ? (modDef ? modDef.label : "Modules") : labelFor(base);
  const crumbBase = isModule ? "/m/" + id : base;
  const leafId = isModule ? sub : id;
  return html`<header class="topbar">
    <div class="topbar__crumbs">
      <span class="clickable hoverline" onClick=${() => navigate("/dashboard")}>${COMPANY.short}</span>
      <${Icon} name="chevronRight" size=14 />
      ${leafId ? html`<span class="clickable hoverline" onClick=${() => navigate(crumbBase)}>${crumbLabel}</span>
        <${Icon} name="chevronRight" size=14 /><b>${leafId}</b>`
        : html`<b>${crumbLabel}</b>`}
    </div>
    <div class="topbar__spacer"></div>
    <button class="searchbtn" onClick=${onSearch}>
      <${Icon} name="search" size=15 />
      <span>Search matters, contracts, clauses…</span>
      <kbd>⌘K</kbd>
    </button>
    <button class="newbtn" title="Raise a legal request" onClick=${() => navigate("/raise")}>
      <${Icon} name="plus" size=15 /><span>New</span>
    </button>
    <${TourButton} />
    <button class="iconbtn" title="Toggle theme" onClick=${onToggleTheme}><${Icon} name=${theme === "dark" ? "sun" : "moon"} size=18 /></button>
    <${NotifButton} />
    <div style="width:1px;height:24px;background:var(--border);margin:0 2px"></div>
    <${Avatar} name=${me.name} size="md" />
  </header>`;
}

/* ---------------- Copilot dock ---------------- */
const CANNED = [
  { q: /risk|risky|exposure/i, a: "Across the active portfolio, 43 contracts are **Critical** and 168 **High** risk. The largest single exposure is the ACWA Power PPA (SAR 48M) — its termination-for-convenience and change-in-law clauses are still open. Want me to open that matter?" },
  { q: /renew|expir/i, a: "23 contracts expire within 30 days; 3 will **auto-renew** (Salesforce, Oracle NetSuite, Adobe CC) at a combined +$310K uplift. I can draft opt-out notices for all three." },
  { q: /nda/i, a: "I can generate a Mutual NDA from template T-01 (v4.2). Based on the counterparty jurisdiction I'll insert the right governing-law and confidentiality-term clauses. Shall I pre-fill it?" },
  { q: /summar/i, a: "Here's the 20-second read: 37 reviews are pending (2 breaching SLA today), 12 approvals await sign-off, and the Neom Solar PPA is the critical path this week. TAT is trending down to 3.4 days — a 29% improvement YoY." },
  { q: /workload|capacity|balance/i, a: "Sarah Chen is at 90% capacity (18/20) and owns 4 of the 5 highest-risk matters. Tom Bennett has headroom (12/18). I'd recommend reassigning the Deloitte SOW and Adobe renewal to rebalance." },
];
function respond(text) {
  const hit = CANNED.find((c) => c.q.test(text));
  return hit ? hit.a : "I've reviewed the request across matters, contracts and the clause library. I can summarize, compare versions, assess risk, draft from a template, or recommend an approver — tell me which and I'll take it from here.";
}
function mdBold(t) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith("**") ? html`<b key=${i}>${p.slice(2, -2)}</b>` : p);
}

function CopilotDock({ open, onClose }) {
  const [msgs, setMsgs] = useState([
    { role: "ai", text: "Hi — I'm your Legal Copilot. I have full context on your matters, contracts and clause library. What can I do?" },
  ]);
  const [input, setInput] = useState("");
  const scRef = useRef(null);
  useEffect(() => { if (scRef.current) scRef.current.scrollTop = scRef.current.scrollHeight; }, [msgs, open]);
  const send = (text) => {
    const t = (text || input).trim();
    if (!t) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setTimeout(() => setMsgs((m) => [...m, { role: "ai", text: respond(t) }]), 480);
  };
  const suggestions = ["Summarize what needs my attention", "Which renewals are at risk?", "Assess portfolio risk", "Rebalance the team's workload"];

  return html`<${Fragment}>
    ${open && html`<div class="copilot-panel">
      <div class="modal__head" style="background:linear-gradient(135deg,var(--brand-soft),var(--accent-soft))">
        <div class="metric__icon" style="background:linear-gradient(135deg,#0d7a3f,#0891b2);color:#fff"><${Icon} name="sparkles" size=17 /></div>
        <div><div class="modal__title" style="font-size:14px">Legal Copilot</div><div class="tiny muted">Context: 1,284 contracts · 12 matters</div></div>
        <div class="spacer"></div>
        <button class="iconbtn" onClick=${onClose}><${Icon} name="x" size=18 /></button>
      </div>
      <div class="chat" ref=${scRef}>
        ${msgs.map((m, i) => html`<div key=${i} class=${cx("msg", `msg--${m.role}`)}>
          ${m.role === "ai" && html`<div class="metric__icon" style="width:28px;height:28px;flex:none;background:var(--accent-soft);color:var(--accent-500)"><${Icon} name="sparkles" size=14 /></div>`}
          <div class="msg__bubble">${mdBold(m.text)}</div>
        </div>`)}
      </div>
      <div style="padding:0 12px 8px">
        <div class="suggest">${suggestions.map((s) => html`<button key=${s} onClick=${() => send(s)}>${s}</button>`)}</div>
      </div>
      <div class="chat__input">
        <textarea class="textarea" rows=1 placeholder="Ask anything…" style="min-height:38px;max-height:100px" value=${input}
          onInput=${(e) => setInput(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
        <${Btn} variant="primary" icon="send" onClick=${() => send()} />
      </div>
    </div>`}
    <button class="copilot-fab" onClick=${() => open ? onClose() : onClose(true)} title="AI Copilot">
      <${Icon} name=${open ? "chevronDown" : "sparkles"} size=22 />
    </button>
  </${Fragment}>`;
}

/* ---------------- Shell ---------------- */
export function Shell({ path, children }) {
  const [theme, setThemeState] = useState(getTheme());
  const [palette, setPalette] = useState(false);
  const [copilot, setCopilot] = useState(false);

  useEffect(() => { setTheme(theme); }, [theme]);
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return html`<div class="app">
    <${Sidebar} path=${path} />
    <div class="main">
      <${Topbar} path=${path} theme=${theme}
        onSearch=${() => setPalette(true)}
        onToggleTheme=${() => setThemeState(theme === "dark" ? "light" : "dark")} />
      <div class="content">${children}</div>
    </div>
    ${palette && html`<${CommandPalette} onClose=${() => setPalette(false)} />`}
    <${CopilotDock} open=${copilot} onClose=${(v) => setCopilot(v === true)} />
    <${TourOverlay} />
    <${ToastHost} />
  </div>`;
}
