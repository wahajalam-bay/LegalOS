// App shell: Sidebar · Topbar · Command Palette · Notifications · Copilot dock.
import { html, cx, fmt, useState, useEffect, useRef, useMemo, Fragment } from "./core.js";
import { useRegister } from "./live.js";
import { entitySlug, companyPath } from "./pages/companies.js";
import { Icon } from "./icons.js";
import { Avatar, Btn, Dropdown, MenuItem, Pill, Tabs } from "./ui.js";
import { NAV_GROUPS, NAV, NAV_FLAT, labelFor, REQUESTER_DOOR_PATHS } from "./nav.js";
import { complianceModule } from "./compliancemodules.js";
import { parseCompliancePath, registerReturnPath, useCrumbLeaf } from "./compliancenav.js";
import { navigate, parsePath, currentQuery } from "./router.js";
import { COMPANY, NOTIFICATIONS, USERS, CONTRACTS, MATTERS, COMPANIES, LICENSES, licenseStatus, byId, CONTRACT_TYPE_CODES, LEGAL_SUBDIVISIONS } from "./data.js";
import { getCollection, notifsFor, markNotifsRead, useCollection, useSession } from "./store.js";
import { allReminders } from "./reminders.js";
import { complianceAlerts } from "./compliancealerts.js";
import { api } from "./api.js";
import { TourOverlay, TourButton } from "./tour.js";
import { signOut, CREDENTIAL_GROUPS, isRequesterDoor, ZMark } from "./pages/login.js";
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

/* ---------------- Sidebar rail ----------------
   Collapsing the sidebar is a lasting preference (unlike the nav groups, which
   always start shut), so it is remembered per browser. */
const SIDEBAR_KEY = "legalos-sidebar-collapsed";
const readCollapsed = () => { try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch (e) { return false; } };
const writeCollapsed = (v) => { try { localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0"); } catch (e) {} };

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
  const acct = (useSession() || {}).account;
  return html`<${Dropdown} align="left" width=${280} drop="up" trigger=${html`<div class="sidebar__user">
    <${Avatar} name=${me.name} size="md" />
    <div class="sidebar__user-meta"><div class="sidebar__user-name">${me.name}</div><div class="sidebar__user-role">${me.role}</div></div>
    <${Icon} name="chevronDown" size=15 style=${{ color: "var(--sidebar-fg-dim)" }} />
  </div>`}>
    <div class="menu__label">View as — access follows the identity</div>
    ${acct && acct.admin && html`<${MenuItem} icon=${me.id === "admin" ? "check" : "shield"}
      onClick=${() => { setViewAs("admin"); navigate("/exec"); }}>
      <div style="min-width:0">
        <div style=${`font-weight:${me.id === "admin" ? 700 : 500}`}>${acct.name || "Administrator"}</div>
        <div class="tiny muted">System administrator — your own sign-in</div>
      </div>
    </${MenuItem}>`}
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
function Sidebar({ path, collapsed, onToggleRail, onClose }) {
  const me = useActiveUser();
  // The admin credential gets the View-As switcher in production too — it is
  // the account that exists to run and demonstrate the system.
  const acctAdmin = !!(((useSession() || {}).account || {}).admin);
  const mods = useCollection("modRequests");
  // Live badge: open items assigned to the active identity.
  const myOpen = mods.filter((r) => r.owner === me.id && r.status !== "Closed").length;

  /* THE RAIL REPORTS WHAT IS WAITING INSIDE EACH FAMILY.
     A navigation that looks identical whether there are nine overdue things or
     none is a list of links, not a table of contents for a live system: you had
     to open a family to find out whether it wanted you. Each family row now
     carries the count of records in it that need attention, read from the SAME
     endpoints those pages read — so the number on the rail and the number on
     the page are one figure, and clicking through always lands on exactly the
     records it counted.

     It is deliberately narrow. Only things a person can act on are counted —
     a hearing whose outcome nobody recorded, a licence past its date, a
     repayment that has gone by — never "how many records exist". And it is
     gated by canOpenPath, so an account that cannot open a family is not told
     how much work is in it. Where a count cannot be read the row simply
     carries none, which is the honest difference between "nothing to do" and
     "we could not ask". */
  const [attention, setAttention] = useState({});
  const canLit = canOpenPath(me, "/litigation");
  const canComp = canOpenPath(me, "/compliance");
  useEffect(() => {
    let alive = true;
    const next = {};
    const done = () => { if (alive) setAttention((prev) => ({ ...prev, ...next })); };
    const jobs = [];
    if (canLit) {
      jobs.push(api.litigation.causeList().then((d) => {
        const n = (d && d.counts && d.counts.pastDue) || 0;
        if (n) next.litigation = { n, alert: true };
      }, () => {}));
    }
    if (canComp) {
      jobs.push(Promise.all([
        api.compliance.licences().catch(() => null),
        api.compliance.loans().catch(() => null),
      ]).then(([li, lo]) => {
        const today = new Date().toISOString().slice(0, 10);
        const licences = ((li && li.licences) || []).filter((r) => r.expiry && r.expiry < today).length;
        const loans = ((lo && lo.loans) || []).filter((r) => r.current && r.current.repaymentDue
          && r.current.repaymentDue < today && !r.closed).length;
        const n = licences + loans;
        if (n) next.compliance = { n, alert: licences > 0 };
      }, () => {}));
    }
    Promise.all(jobs).then(done, done);
    return () => { alive = false; };
  }, [me.id, canLit, canComp]);

  const badgeFor = (it) => (it.badge === "myTasks" ? (myOpen || undefined) : it.badge);
  const sections = navForUser(me);

  /* THE MOST SPECIFIC ROW WINS.
     This compared `base === it.path`, which is only the FIRST segment, so every
     multi-segment destination was mis-marked: on /compliance/licenses the rail
     lit up "Overview" (base "/compliance") and the licence register — the page
     actually on screen — looked unvisited. With the families collapsed nobody
     saw it; open in the rail it is the difference between the nav telling you
     where you are and lying about it.
     A row is active when the route IS it or sits underneath it, and of the rows
     that qualify the longest one wins, so /compliance/licenses marks Licences
     and not the Overview it also sits under. */
  const here = String(path || "").split("?")[0].replace(/\/+$/, "") || "/";
  const covers = (p) => here === p || here.startsWith(p + "/");
  const bestMatch = sections
    .flatMap((sec) => sec.items.map((it) => it.path))
    .filter(covers)
    .sort((a, b) => b.length - a.length)[0] || null;
  /* A FAMILY ROW IS LIT BY THE PAGE YOU ARE ON INSIDE IT.
     The row addresses /g/<key>, which is never the route you are actually on
     once you are working in the family, so comparing addresses would leave the
     rail unlit on every register in the product. A family is current when the
     current page is one of its destinations. */
  const isActive = (it) => (it.__family
    ? it.__family.items.some((sub) => sub.path === bestMatch)
    : it.path === bestMatch);
  // The family row carries the attention of everything inside it, or a licence
  // expiring in nine days is invisible until you happen to open the register.
  const groupBadge = (sec) => {
    const live = attention[sec.key];
    return (live ? live.n : 0) + sec.items.reduce((n, it) => n + (Number(badgeFor(it)) || 0), 0);
  };
  const groupAlert = (sec) => !!(attention[sec.key] && attention[sec.key].alert) || sec.items.some((it) => it.alert);

  /* Navigation is the one thing that must never be mouse-only: it is on every
     route, and a keyboard user who cannot reach it cannot reach the product.
     These are real <button>s, and the active one reports aria-current so a
     screen reader announces where you are rather than only showing it. */
  const navItem = (it) => html`<button type="button" key=${it.path}
    class=${cx("nav__item", isActive(it) && "active")}
    title=${it.label}
    aria-current=${isActive(it) ? "page" : undefined}
    onClick=${() => navigate(it.path)}>
    <${Icon} name=${it.icon} size=17 />
    <span>${it.label}</span>
    ${badgeFor(it) && html`<span class=${cx("nav__badge", it.alert && "nav__badge--alert")}>${badgeFor(it)}</span>`}
  </button>`;

  return html`<aside class="sidebar">
    <div class="sidebar__brand">
      <${ZMark} className="sidebar__brand-logo" size=${30} />
      <div class="sidebar__brand-text">
        <div class="sidebar__brand-name">LegalOS</div>
        <div class="sidebar__brand-sub">Enterprise</div>
      </div>
      <button type="button" class="sidebar__close" onClick=${onClose} aria-label="Close navigation">
        <${Icon} name="x" size=18 />
      </button>
    </div>

    <${Dropdown} align="left" width=${220} trigger=${html`<div class="workspace">
      <div class="workspace__logo">${COMPANY.short}</div>
      <div class="workspace__meta"><div class="workspace__name">${COMPANY.name}</div><div class="workspace__type">All entities · Pakistan</div></div>
      <${Icon} name="chevronDown" size=15 style=${{ color: "var(--sidebar-fg-dim)" }} />
    </div>`}>
      ${/* EVERY ROW IN HERE OPENS SOMETHING (§100).
            The entities were plain text — six names nobody could click — under
            an "Add entity" that did nothing at all. Each one now opens that
            company's record, and the footer says where entities actually come
            from: they are read from the registers and the statutory root, not
            typed in here, so "Add entity" was offering something this system
            cannot do. */ ""}
      <div class="menu__label">Legal entities</div>
      ${COMPANY.entities.map((e) => html`<${MenuItem} key=${e} icon="building"
        onClick=${() => { const p = companyPath(e); navigate(p || "/companies"); }}>${e}</${MenuItem}>`)}
      <div class="menu__sep"></div>
      <${MenuItem} icon="grid" onClick=${() => navigate("/companies")}>All companies in the estate</${MenuItem}>
      <div class="tiny muted" style="padding:6px 12px 8px;line-height:1.4">
        Entities are read from the registers and the statutory root — there is nothing to add by hand here.
      </div>
    </${Dropdown}>

    <nav class="nav">
      ${collapsed
        // Rail: ONE icon per top-level entry. Nested rows stay hidden — a column
        // of 34 undifferentiated icons is not a navigation, it is a wall. A group
        // icon opens the sidebar on that group, so nothing becomes unreachable.
        ? sections.map((sec) => sec.section === null
            ? html`<div class="nav__section nav__section--rail nav__section--railbare" key="bare">${sec.items.map(navItem)}</div>`
            : html`<div class="nav__section nav__section--rail" key=${sec.section}>
                <button type="button" class=${cx("nav__item", sec.items.some(isActive) && "active")}
                  title=${sec.section} aria-label=${"Open " + sec.section}
                  onClick=${() => { setOpenMap((m) => ({ ...m, [sec.section]: true })); onToggleRail(); }}>
                  <${Icon} name=${sec.icon || "grid"} size=17 />
                  ${groupBadge(sec) > 0 && html`<span class=${cx("nav__dot", groupAlert(sec) && "nav__dot--alert")}></span>`}
                </button>
              </div>`)
        /* A FAMILY IS ONE ROW, AND ITS DESTINATIONS ARE TABS ON THE FAMILY PAGE.
           Expanding the families in the rail put every destination in the
           product on screen at once — thirty-odd rows, and the one you wanted
           was somewhere in the middle of a column you had to scroll. The rail
           carries the nine primary areas and nothing else; clicking a family
           opens it, and the family's own page carries its registers as a tab
           strip, which is where a set of sibling destinations belongs.
           Everything is still one click from the rail and two from anywhere. */
        : sections.map((sec) => sec.section === null
        // No header — the daily rows.
        ? html`<div class="nav__section nav__section--bare" key="bare">
            ${sec.items.map(navItem)}
          </div>`
        : html`<div class="nav__section nav__section--bare" key=${sec.section}>
            ${navItem({ path: "/g/" + sec.key, label: sec.section, icon: sec.icon || "grid",
              badge: groupBadge(sec) > 0 ? groupBadge(sec) : undefined,
              alert: groupAlert(sec), __family: sec })}
          </div>`)}
    </nav>

    <div class="sidebar__foot">
      <div class="sidebar__footrow">
        ${DEMO_PERSONAS || acctAdmin ? html`<${ViewAs} />` : html`<${UserChip} />`}
        <button type="button" class="sidebar__rail" onClick=${onToggleRail}
          title=${collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          aria-label=${collapsed ? "Expand the sidebar" : "Collapse the sidebar"}>
          <${Icon} name="panelLeft" size=17 />
        </button>
      </div>
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
    <${MenuItem} icon="arrowLeft" onClick=${signOut}>Sign out</${MenuItem}>
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
      title: `${l.name} — ${l.entity} ${s.key === "Expired"
        ? (Math.abs(s.days) <= 90 ? "expired " + Math.abs(s.days) + "d ago" : "expired on " + fmt.date(l.expiryDate))
        : "expires " + fmt.until(l.expiryDate)}`,
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

/* Compliance deadlines (Section 12) — loan repayments, SBP registration, lease
   and licence expiry, resolutions awaiting signature, SECP filings due.
   Fetched rather than read from a local collection because compliance data is
   server-derived, and generated ONLY from real dates on real records: nothing
   due means nothing raised. A failed fetch leaves the other feeds intact. */
function useComplianceAlerts(enabled) {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    // Ask ONCE whether this identity has Compliance at all. Belonging to Legal
    // is not the same as having the Compliance module, so firing the six data
    // requests unconditionally would make a litigation account log six 403s on
    // every page load.
    api.compliance.config().then(() => Promise.all([
      api.compliance.loans().catch(() => null),
      api.compliance.leases().catch(() => null),
      api.compliance.services().catch(() => null),
      api.compliance.licences().catch(() => null),
      api.compliance.resolutions().catch(() => null),
      api.compliance.secp.filings().catch(() => null),
    ])).then(([lo, le, sv, li, re, se]) => {
      if (!alive) return;
      setAlerts(complianceAlerts({
        loans: (lo && lo.loans) || [],
        leases: (le && le.leases) || [],
        services: (sv && sv.services) || [],
        licences: (li && li.licences) || [],
        resolutions: (re && re.native) || [],
        filings: (se && se.filings) || [],
      }));
    }).catch(() => { /* no Compliance access, or the module is unavailable: the other feeds stand */ });
    return () => { alive = false; };
  }, [enabled]);
  return alerts;
}

function NotifButton() {
  const me = useActiveUser();
  const live = useCollection("notifs"); // subscribes — sweeps and actions land here
  const [readLocal, setReadLocal] = useState(false);
  /* "Do you have COMPLIANCE access", not "are you on a legal team".
     The old test was `me.rbac === "head" || me.legalTeam`, which is true for
     every legal user — so a Commercial or Litigation account fetched the
     compliance alert feed on every page load and was correctly refused, leaving
     a 403 in the console of most users in the company. canOpenPath is the same
     predicate the sidebar and the direct-URL guard use, so the feed can never
     disagree with what the rest of the app shows. */
  const canSeeCompliance = canOpenPath(me, "/compliance");
  const compliance = useComplianceAlerts(canSeeCompliance);
  // Section 12 feeds addressed to the active identity, then the legacy feeds.
  const items = dedupeById([
    ...notifsFor(me).map((n) => ({ ...n, unread: readLocal ? false : n.unread })),
    ...(canSeeCompliance ? compliance.slice(0, 15).map((a) => ({
      id: a.id, type: "compliance", title: a.title, detail: a.detail,
      time: new Date().toISOString(), unread: readLocal ? false : (a.dueDays <= 7),
      tone: a.tone, icon: a.icon, path: a.path,
    })) : []),
    ...(canSeeCompliance ? [...portalNotifs(), ...lifecycleNotifs(), ...licenseNotifs(), ...NOTIFICATIONS].map((n) => ({ ...n, unread: readLocal ? false : n.unread })) : []),
  ]);
  const setItems = (updated) => { setReadLocal(true); markNotifsRead(); };
  const unread = items.filter((n) => n.unread).length;
  const toneBg = { amber: "var(--warning-bg)", red: "var(--danger-bg)", blue: "var(--brand-soft)", purple: "var(--accent-soft)", green: "var(--success-bg)" };
  const toneFg = { amber: "var(--warning)", red: "var(--danger)", blue: "var(--brand)", purple: "var(--accent-500)", green: "var(--success)" };
  /* The trigger is plain content: Dropdown wraps it in the button. Passing a
     <button> here nested one button inside another — invalid markup, and the
     outer control ended up with no accessible name because the icon carries no
     text. `label` is what a screen reader announces. */
  return html`<${Dropdown} width=${380} label=${unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    trigger=${html`<span class="iconbtn" title="Notifications"><${Icon} name="bell" size=18 />${unread > 0 && html`<span class="iconbtn__dot"></span>`}</span>`}>
    <div class="row" style="padding:6px 10px 10px">
      <span class="strong">Notifications</span>
      <span class="spacer"></span>
      <button class="tiny" style="color:var(--brand);font-weight:600" onClick=${(e) => { e.stopPropagation(); setItems(items.map((n) => ({ ...n, unread: false }))); }}>Mark all read</button>
    </div>
    <div style="max-height:400px;overflow-y:auto;margin:0 -6px">
      ${items.map((n) => { const dest = n.path || n.to; return html`<div key=${n.id} class=${cx("notif", n.unread && "notif--unread", dest && "clickable")}
        title=${dest ? "Open the record behind this" : null}
        onClick=${dest ? () => navigate(dest) : null}>
        <div class="notif__ico" style=${`background:${toneBg[n.tone]};color:${toneFg[n.tone]}`}><${Icon} name=${n.icon} size=16 /></div>
        <div style="flex:1"><div class="notif__text">${n.title}</div><div class="notif__time">${fmt.rel(n.time)}</div></div>
      </div>`; })}
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
  // Every destination, not just the pinned rail: the module hubs (Contract
  // Tracker, Compliance/Case registers, Templates, Project Documents…) live in
  // NAV_GROUPS, so fold them in — deduped by path — or the palette can't reach
  // the pages that hold the bulk of the Drive data.
  const navPaths = new Set();
  const navResults = [...NAV_FLAT, ...NAV_GROUPS.flatMap((g) => g.items)]
    .filter((i) => { if (navPaths.has(i.path)) return false; navPaths.add(i.path); return true; })
    .filter((i) => i.label.toLowerCase().includes(ql) && reachable(i.path))
    .map((i) => ({ group: "Navigate", label: i.label, icon: i.icon, path: i.path }));
  const actions = [
    { group: "Actions", label: "Raise a request to any Legal team", icon: "plus", path: "/raise" },
    { group: "Actions", label: "My Tasks — most urgent first", icon: "checksquare", path: "/my-tasks" },
    { group: "Actions", label: "Cost analysis & budget burn", icon: "dollar", path: "/costs" },
    { group: "Actions", label: "Master data admin", icon: "database", path: "/settings" },
    { group: "Actions", label: "New Legal Request", icon: "plus", path: "/workspace" },
    { group: "Actions", label: "Add or scan a document", icon: "scan", path: "/repository" },
    { group: "Actions", label: "Open the Commercial Contract Tracker", icon: "grid", path: "/tracker" },
    { group: "Actions", label: "Show delayed work", icon: "alertTriangle", path: "/workspace" },
    { group: "Actions", label: "Active PPAs and land values", icon: "building", path: "/analyzer" },
    { group: "Actions", label: "My pipeline / team load", icon: "columns", path: "/pipelines" },
    { group: "Actions", label: "Lifecycle reminders", icon: "bell", path: "/pipelines" },
    { group: "Actions", label: "Requester portal preview", icon: "user", path: "/portal" },
    { group: "Actions", label: "Upload contract for AI review", icon: "scan", path: "/reviews" },
    { group: "Actions", label: "Generate NDA from template", icon: "sparkles", path: "/templates" },
    { group: "Actions", label: "Ask the assistant", icon: "sparkles", path: "/assistant" },
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
  // Live register-backed searchables: group entities (→ their cross-module hub),
  // projects, and litigation cases. Cached hooks, so cheap on each keystroke.
  /* PERMISSION FIRST, THEN THE REQUEST.
     These three registers belong to Commercial and Litigation. The palette used
     to fetch all of them for everyone, so a Compliance-only account issued a
     cross-module request it had no entitlement for and collected a 403 on every
     page that renders the palette. `canOpenPath` is the same engine the nav and
     direct-URL refusal already use -- no second security model is introduced
     here, and the server-side refusal stays exactly as it is. */
  const canCommercial = reachable("/contracts");
  const canLitigation = reachable("/litigation");
  const cReg = useRegister("contracts", null, canCommercial);
  const lReg = useRegister("litigation", null, canLitigation);
  const pReg = useRegister("properties", null, canCommercial);
  const entityRows = useMemo(() => {
    const s = new Map();
    (cReg.rows || []).forEach((r) => r.entityName && s.set(entitySlug(r.entityName), r.entityName));
    (lReg.rows || []).forEach((r) => r.entity && !s.has(entitySlug(r.entity)) && s.set(entitySlug(r.entity), r.entity));
    return [...s.entries()];
  }, [cReg.rows, lReg.rows]);
  const projectRows = useMemo(() => [...new Set((pReg.rows || []).map((r) => r.project).filter(Boolean))], [pReg.rows]);
  const caseRows = useMemo(() => (lReg.rows || []).map((r) => r.caseName).filter(Boolean), [lReg.rows]);
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
    // The contract book is Director-only — its records must not even SURFACE
    // in search for anyone else (same rule as privileged matters above).
    ...(canOpenPath(me, "/contracts") ? liveContracts.map((c) => ({ group: "Contracts", label: `${c.id} · ${c.title}`, icon: "file", path: "/contracts/" + c.id })) : []),
    ...(canOpenPath(me, "/contracts") ? liveContracts.filter((c) => c.srNo).map((c) => ({ group: "Contracts", label: `Sr No ${c.srNo} · ${c.physicalRecordRef} · ${c.officeLocation}`, icon: "database", path: "/contracts/" + c.id })) : []),
    ...liveDocs.filter((d) => matterVisible(d.matterId)).map((d) => ({ group: "Documents", label: `${d.id} · ${d.name}`, icon: "scan", path: "/repository/" + d.id })),
    ...CONTRACT_TYPE_CODES.map((t) => ({ group: "Contract types", label: t, icon: "file", path: "/workspace" })),
    ...LEGAL_SUBDIVISIONS.map((s) => ({ group: "Legal sub-divisions", label: s, icon: "scale", path: "/workspace" })),
    ...companies.filter((c) => c.name).map((c) => ({ group: "Companies & entities", label: `${c.name} · ${c.jur || c.jurisdiction}`, icon: "building", path: companyPath(c.name) })),
    // Live register-backed searchables → their cross-module hubs / registers.
    ...entityRows.map(([sl, name]) => ({ group: "Companies & entities", label: name, icon: "building", path: "/companies/" + sl })),
    ...projectRows.map((n) => ({ group: "Projects", label: n, icon: "building", path: "/projects" })),
    ...caseRows.map((n) => ({ group: "Litigation", label: n, icon: "gavel", path: "/litigation" })),
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
function Topbar({ path, onSearch, onToggleTheme, theme, onMenu }) {
  const { base, id, sub } = parsePath(path);
  const me = useActiveUser();
  // /m/<moduleKey>/<recordId> — crumbs show the module label, then the record.
  const isModule = base === "/m";
  const modDef = isModule ? moduleByKey(id) : null;
  // /g/<key> is a module-family hub: the crumb is the family's proper name,
  // capitalised, with no dangling raw key — and never a link to bare /g.
  const isHub = base === "/g";
  const hubDef = isHub ? NAV_GROUPS.find((g) => g.key === id) : null;
  // /compliance/<module>[/<record>] — the crumb names the MODULE, then the
  // record, so the hierarchy reads Compliance & Licences > Loans > LON-XXXX
  // rather than repeating the family name.
  /* Compliance addresses are read by the SAME parser the router uses. They used
     to be split independently here, which is how /compliance/loan/<id> rendered
     the Overview while the crumb said "> loan": two files, two answers, no
     error. The parser also knows the deeper levels -- an entity's resolutions, a
     statutory year, a document -- which a three-segment split cannot express. */
  const compRoute = base === "/compliance" ? parseCompliancePath(path) : null;
  // What the page knows and the URL cannot: an entity's real name, a year's
  // label, a document's filename. Null until that page has loaded, and then the
  // crumb stops showing the raw key.
  const compLeafLabel = useCrumbLeaf(path);
  const compMod = compRoute && compRoute.mod ? compRoute.mod : null;
  const compLeaf = !compRoute ? null
    : compRoute.kind === "record" ? compRoute.recordId
      : compRoute.kind === "entity" ? compRoute.entityKey
        : compRoute.kind === "year" ? compRoute.yearId
          : compRoute.kind === "document" ? "Document" : null;

  const crumbLabel = compMod ? compMod.label
    : compRoute && compRoute.kind === "document" ? "Compliance & Licences"
      : isModule ? (modDef ? modDef.label : "Modules")
        : isHub ? (hubDef ? hubDef.label : "Modules") : labelFor(base);
  const crumbBase = compMod ? registerReturnPath(compMod, currentQuery())
    : compRoute && compRoute.kind === "document" ? "/compliance"
      : isModule ? "/m/" + id : isHub ? "/g/" + id : base;
  const leafId = compRoute ? (compLeafLabel || compLeaf) : isModule ? sub : isHub ? null : id;
  return html`<header class="topbar">
    <button type="button" class="topbar__menu" onClick=${onMenu} aria-label="Open navigation">
      <${Icon} name="menu" size=18 />
    </button>
    <!-- A page inside a module family gets Family → Page and a back control,
         so the hub is always one obvious step away. -->
    ${(() => { const base = "/" + String(path || "").split("/").filter(Boolean)[0];
      const p2 = String(path || "").split("/").filter(Boolean); const full2 = p2[1] ? "/" + p2[0] + "/" + p2[1] : base; const fam = NAV_GROUPS.find((g) => g.items.some((it) => it.path === base || it.path === full2));
      if (fam && crumbLabel === fam.label) return null;   // already on the family's own page
      return fam ? html`<button class="btn btn--ghost btn--sm" style="margin-right:10px;flex:none" title=${"Back to " + fam.label}
        onClick=${() => navigate(fam.items[0] ? fam.items[0].path : "/g/" + fam.key)}><${Icon} name="chevronLeft" size=14 />Back</button>` : null; })()}
    <div class="topbar__crumbs">
      <button type="button" class="crumbbtn clickable hoverline" onClick=${() => navigate(landingFor(me))}>${COMPANY.short}</button>
      <${Icon} name="chevronRight" size=14 />
      ${(() => { const base = "/" + String(path || "").split("/").filter(Boolean)[0];
        const p2 = String(path || "").split("/").filter(Boolean); const full2 = p2[1] ? "/" + p2[0] + "/" + p2[1] : base; const fam = NAV_GROUPS.find((g) => g.items.some((it) => it.path === base || it.path === full2));
        // A family whose landing page IS this page must not be rendered twice:
        // "Compliance & Licences > Compliance & Licences" reads as a bug.
        if (fam && crumbLabel === fam.label) return null;
        return fam ? html`<button type="button" class="crumbbtn clickable hoverline" onClick=${() => navigate(fam.items[0] ? fam.items[0].path : "/g/" + fam.key)}>${fam.label}</button><${Icon} name="chevronRight" size=14 />` : null; })()}
      ${leafId ? html`<button type="button" class="crumbbtn clickable hoverline" onClick=${() => navigate(crumbBase)}>${crumbLabel}</button>
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
// Emptied 2026-09-13: these were scripted replies quoting invented figures
// ("43 contracts are Critical", auto-renewals for Salesforce/Oracle) as if the
// copilot had read the portfolio. Nothing here was ever computed.

/* THE DOCK IS A DOOR, NOT AN ORACLE.
 *
 * This was a chat panel with an empty answer table behind it, so every
 * question — typed or picked from its own suggestions — produced the same
 * sentence: "I've reviewed the request across matters, contracts and the
 * clause library. I can summarize, compare versions, assess risk, draft from a
 * template…". It had reviewed nothing and could do none of those things. It
 * opened by claiming "I have full context on your matters, contracts and
 * clause library" over a hard-coded "Context: 1,284 contracts · 12 matters" —
 * the same invented figure this product removed from the dashboard.
 *
 * There is a real assistant at /assistant. It answers from record fields, it
 * says which registers it read and how much of each ("25 of 1252 contracts — a
 * sample, not the whole register"), and it refuses to guess at document
 * contents. The floating button now opens that, which is the one honest thing
 * a floating button can do.
 */
function CopilotDock() {
  const me = useActiveUser();
  if (!canOpenPath(me, "/assistant")) return null;
  return html`<button class="copilot-fab" onClick=${() => navigate("/assistant")}
    title="Ask the assistant — answers come from your records">
    <${Icon} name="sparkles" size=22 />
  </button>`;
}

/* ---------------- Family tabs ----------------
   THE FAMILY'S DESTINATIONS ARE TABS ON THE PAGE, NOT ROWS IN THE RAIL.
   Expanding every family in the sidebar put the whole product on screen at
   once: nine areas became thirty-odd rows, the rail scrolled, and the row you
   wanted was buried in a column you had to read. The rail carries one row per
   family; the family's real destinations sit here — a strip across the top of
   every page in the family, so the siblings of the page you are on are always
   visible and always one click away.

   It is the SAME list the rail used to expand (NAV_GROUPS), filtered through
   canOpenPath, so what a person can see and what they can open remain one
   rule. Longest-match decides which tab is current, or /compliance/licenses
   would light up the Overview it also sits under. */
function FamilyTabs({ path }) {
  const me = useActiveUser();
  const strip = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const here = String(path || "").split("?")[0].replace(/\/+$/, "") || "/";
  // The hub itself lists the family as tiles; it does not need the same list twice.
  const onHub = /^\/g\//.test(here);
  const fam = onHub ? null
    : NAV_GROUPS.find((g) => g.items.some((it) => here === it.path || here.startsWith(it.path + "/")));
  const items = fam ? fam.items.filter((it) => canOpenPath(me, it.path)) : [];
  const active = items
    .filter((it) => here === it.path || here.startsWith(it.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];

  /* ARROWS, BECAUSE THE STRIP SCROLLS.
     Litigation carries ten registers and Commercial five long names: on a 1366
     laptop the strip runs off the right-hand edge, and what was off it was
     unreachable without a horizontal trackpad gesture — which a mouse does not
     have. An arrow appears on a side ONLY when there is something that way, so
     it is never a control that does nothing, and it tells you at a glance that
     the row continues. It scrolls by most of a screenful, and the tab you are
     on is scrolled into view on arrival so the strip never opens showing a
     stretch of the family that does not include the page you are reading. */
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  };
  useEffect(() => {
    const el = strip.current;
    if (!el) return undefined;
    measure();
    const cur = el.querySelector('[aria-selected="true"]');
    if (cur && cur.scrollIntoView) {
      try { cur.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* older engine */ }
    }
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [here, items.length]);
  const scrollBy = (dir) => {
    const el = strip.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, Math.round(el.clientWidth * 0.7)), behavior: "smooth" });
  };

  if (!fam || items.length < 2 || !active) return null;
  const arrow = (dir, name, label) => html`<button type="button"
    class=${cx("famtabs__arrow", "famtabs__arrow--" + (dir < 0 ? "l" : "r"), !edges[dir < 0 ? "left" : "right"] && "is-off")}
    aria-label=${label} tabIndex=${edges[dir < 0 ? "left" : "right"] ? 0 : -1}
    aria-hidden=${edges[dir < 0 ? "left" : "right"] ? undefined : "true"}
    onClick=${() => scrollBy(dir)}><${Icon} name=${name} size=16 /></button>`;

  return html`<div class=${cx("famtabs", edges.left && "famtabs--l", edges.right && "famtabs--r")}>
    ${arrow(-1, "chevronLeft", "Show the registers to the left")}
    <div class="famtabs__strip" ref=${strip}>
      <${Tabs} ariaLabel=${fam.label} active=${active.path} onChange=${(p) => navigate(p)}
        tabs=${items.map((it) => ({ key: it.path, label: it.label, icon: it.icon }))} />
    </div>
    ${arrow(1, "chevronRight", "Show the registers to the right")}
  </div>`;
}

/* ---------------- Back to top ----------------
   A register is hundreds of rows long and the toolbar — filters, views, the
   search box — is all at the top of it. Without this, reading to the bottom of
   the litigation book and then wanting a different filter meant scrolling all
   the way back by hand. It appears only once there is something to go back up
   to, and it is a real button so a keyboard reaches it. */
function GoToTop() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = document.querySelector(".content");
    if (!el) return undefined;
    const onScroll = () => setOn(el.scrollTop > 600);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  if (!on) return null;
  return html`<button type="button" class="gotop" title="Back to the top"
    aria-label="Back to the top of the page"
    onClick=${() => { const el = document.querySelector(".content"); if (el) el.scrollTo({ top: 0, behavior: "smooth" }); }}>
    <${Icon} name="arrowUp" size=18 />
  </button>`;
}

export function Shell({ path, children }) {
  const [theme, setThemeState] = useState(getTheme());
  const [palette, setPalette] = useState(false);
  // Rail (wide screens) and drawer (narrow) are separate states: collapsing to a
  // rail is a preference, opening the drawer is a momentary action.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const toggleRail = () => setCollapsed((c) => { writeCollapsed(!c); return !c; });
  // Navigating on a phone must put the drawer away, or the page you just opened
  // is behind it.
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => { setTheme(theme); }, [theme]);
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return html`<div class=${cx("app", collapsed && "app--collapsed", drawer && "app--drawer")}>
    <${Sidebar} path=${path} collapsed=${collapsed} onToggleRail=${toggleRail} onClose=${() => setDrawer(false)} />
    <div class="app__scrim" onClick=${() => setDrawer(false)} aria-hidden="true"></div>
    <div class="main">
      <${Topbar} path=${path} theme=${theme}
        onMenu=${() => setDrawer((d) => !d)}
        onSearch=${() => setPalette(true)}
        onToggleTheme=${() => setThemeState(theme === "dark" ? "light" : "dark")} />
      <!-- The routed page is the main landmark: "skip to content" and a screen
           reader's landmark navigation both need it, and no route had one. -->
      <main class="content" id="main" tabIndex=${-1}><${FamilyTabs} path=${path} />${children}</main>
    </div>
    ${palette && html`<${CommandPalette} onClose=${() => setPalette(false)} />`}
    <${GoToTop} key=${path} />
    <${CopilotDock} />
    <${TourOverlay} />
    <${ToastHost} />
  </div>`;
}
