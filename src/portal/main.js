// SPRINT 4 — the Requester Portal: standalone entry point.
//
// A SEPARATE app with its own shell (no legal sidebar, no internal modules) that
// imports the SHARED data contract from ../ — the LegalRequest schema,
// submitLegalRequest(), the store slices and the chat bridge. For the prototype
// both apps share the same store, which is what makes the round-trip live:
//
//   requester submits → submitLegalRequest() → LegalOS Legal Workspace (Triage)
//   → legal asks for a doc / replies → status + messages flow back here
//
// The single network boundary is documented in store.js (`// portal ↔ LegalOS
// API seam`); swapping localStorage for a real backend touches nothing here.
import { html, cx, createRoot, useState, useEffect, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Dropdown, MenuItem } from "../ui.js";
import { useRoute, parsePath, navigate } from "../router.js";
import {
  useFormConfig, getPortalSession, clearPortalSession, requesterById,
  useCollection, requesterStampId,
} from "../store.js";
import { unreadTotal } from "../messages.js";
import { LoginScreen } from "./auth.js";
import { RequestWizard } from "./wizard.js";
import { MyRequests, RequestDetail } from "./panel.js";

/* ---------------- theme (portal default comes from admin branding) ---------------- */
const THEME_KEY = "legalos-portal-theme";
function initialTheme(cfg) {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
  } catch (e) {}
  return (cfg.branding && cfg.branding.themeDefault) || "light";
}
function applyTheme(t) {
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  document.documentElement.dataset.theme = t;
}

/* ---------------- the requester shell ---------------- */
function Shell({ cfg, me, theme, onTheme, onSignOut, unread, children }) {
  const brand = cfg.branding || {};
  return html`<div class="pshell">
    <header class="ptop">
      <div class="ptop__brand" onClick=${() => navigate("/requests")}>
        <span class="ptop__logo">${brand.logoText || "NW"}</span>
        <span style="min-width:0">
          <span class="ptop__name">${brand.name || "Legal Requests"}</span>
          <span class="ptop__sub">Requester portal</span>
        </span>
      </div>

      <nav class="ptop__nav">
        <button class=${cx("ptop__link", window.location.hash.startsWith("#/requests") && "active")} onClick=${() => navigate("/requests")}>
          <${Icon} name="inbox" size=15 />My requests
          ${unread > 0 && html`<span class="pbadge">${unread}</span>`}
        </button>
        <button class=${cx("ptop__link", window.location.hash.startsWith("#/new") && "active")} onClick=${() => navigate("/new")}>
          <${Icon} name="plus" size=15 />New request
        </button>
      </nav>

      <div class="spacer"></div>

      <button class="iconbtn" title="Toggle theme" onClick=${() => onTheme(theme === "dark" ? "light" : "dark")}>
        <${Icon} name=${theme === "dark" ? "sun" : "moon"} size=18 />
      </button>

      <${Dropdown} width=${250} trigger=${html`<button class="ptop__me">
        <${Avatar} name=${me.name} size="md" />
        <span class="ptop__me-meta">
          <span class="ptop__me-name">${me.name}</span>
          <span class="ptop__me-sub">${me.source || me.department || "—"}</span>
        </span>
        <${Icon} name="chevronDown" size=15 />
      </button>`}>
        <div class="menu__label">Signed in as</div>
        <div style="padding:2px 12px 8px">
          <div class="strong tiny">${me.email}</div>
          <div class="tiny muted" style="margin-top:2px">${me.department || "—"}${me.source ? " · " + me.source : ""}</div>
        </div>
        <div class="menu__sep"></div>
        <${MenuItem} icon="inbox" onClick=${() => navigate("/requests")}>My requests</${MenuItem}>
        <${MenuItem} icon="plus" onClick=${() => navigate("/new")}>New request</${MenuItem}>
        <div class="menu__sep"></div>
        <${MenuItem} icon="logout" danger=${true} onClick=${onSignOut}>Sign out</${MenuItem}>
      </${Dropdown}>
    </header>

    <main class="pmain">${children}</main>

    <footer class="pfoot">
      <span class="tiny muted">
        ${brand.name || "Legal Requests"} · a separate application, connected to LegalOS in real time.
      </span>
      <div class="spacer"></div>
      <a class="tiny" style="color:var(--brand);font-weight:600;text-decoration:none" href="/#/workspace" target="_blank" rel="noreferrer">
        Open LegalOS (legal team view) ↗
      </a>
    </footer>
  </div>`;
}

/* ---------------- unpublished state (admin publish/preview toggle) ---------------- */
function NotPublished({ cfg }) {
  return html`<div class="pshell">
    <main class="pmain">
      <div class="card card--pad col center" style="gap:14px;max-width:520px;margin:60px auto;text-align:center">
        <div class="metric__icon" style="width:52px;height:52px;background:var(--warning-bg);color:var(--warning)">
          <${Icon} name="lock" size=24 />
        </div>
        <div class="strong" style="font-size:17px">The request form is not published yet</div>
        <div class="dim" style="font-size:13px;line-height:1.6">
          Legal has the form in draft. It will open here as soon as they publish it from
          LegalOS → Settings → Request Form.
        </div>
      </div>
    </main>
  </div>`;
}

/* ---------------- app ---------------- */
function PortalApp() {
  const cfg = useFormConfig();
  const requesters = useCollection("requesters");
  const requests = useCollection("requests");
  const messages = useCollection("messages");
  const [path] = useRoute();
  const [session, setSession] = useState(() => getPortalSession());
  const [theme, setTheme] = useState(() => initialTheme(cfg));

  useEffect(() => { applyTheme(theme); }, [theme]);

  const me = session ? requesterById(session.requesterId) : null;

  // A stale session (store reset, requester removed) must not lock the app.
  useEffect(() => { if (session && !me) { clearPortalSession(); setSession(null); } }, [session, me]);

  if (cfg.branding && cfg.branding.published === false) return html`<${NotPublished} cfg=${cfg} />`;

  if (!session || !me) {
    return html`<${LoginScreen} cfg=${cfg} theme=${theme} onTheme=${setTheme}
      onSignedIn=${(s) => { setSession(s); navigate("/requests"); }} />`;
  }

  const stampId = requesterStampId(me);
  const mine = requests.filter((r) => (r.requesterId || r.requester) === stampId);
  const unread = unreadTotal(mine.map((r) => r.id), stampId, messages);

  const { base, id } = parsePath(path);
  let view;
  if (base === "/new") view = html`<${RequestWizard} cfg=${cfg} me=${me} stampId=${stampId} />`;
  else if (base === "/requests" && id) view = html`<${RequestDetail} id=${id} cfg=${cfg} me=${me} stampId=${stampId} />`;
  else view = html`<${MyRequests} cfg=${cfg} me=${me} stampId=${stampId} rows=${mine} />`;

  return html`<${Shell} cfg=${cfg} me=${me} theme=${theme} onTheme=${setTheme} unread=${unread}
    onSignOut=${() => { clearPortalSession(); setSession(null); navigate("/requests"); }}>
    ${view}
  </${Shell}>`;
}

clearTimeout(window.__legalos_boot);
createRoot(document.getElementById("root")).render(html`<${PortalApp} />`);
