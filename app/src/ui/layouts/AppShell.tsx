import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { isLegalRole } from "@/permissions/permissions";
import { ROLE_LABELS } from "@/domain/models/enums";
import { Icon } from "@/ui/icons";
import { Avatar } from "@/ui/components";
import { Dropdown, MenuItem } from "@/ui/overlays";
import { CommandPalette } from "@/ui/CommandPalette";
import { NotificationsBell } from "@/ui/notifications";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Persona switching ("View As") is a demo/testing tool, never a shipped
// production feature. It is OFF by default in a production build; it is available
// in local dev, when built with VITE_DEMO=1, or on any deploy via the "?demo"
// URL flag (so the hosted demo can showcase every role without real auth).
const hasDemoFlag = (() => {
  try { return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo"); }
  catch { return false; }
})();
const DEMO_MODE = import.meta.env.DEV || import.meta.env.VITE_DEMO === "1" || hasDemoFlag;

interface NavItem { to: string; label: string; icon: string; soon?: boolean }
const WORKSPACE: NavItem[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/requests", label: "Requests", icon: "inbox" },
  { to: "/matters", label: "Matters", icon: "folder", soon: true },
  { to: "/contracts", label: "Contracts", icon: "file", soon: true },
  { to: "/knowledge", label: "Knowledge", icon: "book", soon: true },
  { to: "/reports", label: "Reports", icon: "barchart", soon: true },
];
const ADMIN: NavItem[] = [{ to: "/settings", label: "Settings", icon: "settings", soon: true }];

const AREA_TITLE: Record<string, string> = {
  "": "Home", requests: "Requests", matters: "Matters", contracts: "Contracts",
  knowledge: "Knowledge", reports: "Reports", settings: "Settings",
};

export function AppShell() {
  const { currentUser, users, setCurrentUserId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const canRaise = !isLegalRole(currentUser.role); // raising a request is a requester action
  const area = location.pathname.split("/").filter(Boolean)[0] ?? "";
  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));

  const renderItem = (it: NavItem) => (
    <button key={it.to} type="button"
      className={cx("nav__item", isActive(it.to) && !it.soon && "active", it.soon && "is-disabled")}
      aria-disabled={it.soon} aria-current={isActive(it.to) && !it.soon ? "page" : undefined}
      onClick={() => { if (!it.soon) navigate(it.to); }}>
      <Icon name={it.icon} size={17} />
      <span>{it.label}</span>
      {it.soon && <span className="nav__soon">Soon</span>}
    </button>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <svg className="sidebar__brand-logo" viewBox="0 0 32 32" width={30} height={30} aria-hidden>
            <rect width="32" height="32" rx="8" fill="#0d7a3f" />
            <path d="M9 22V10h2.6c3 0 4.8 1.9 4.8 4.8v.2c0 2.9-1.8 4.8-4.8 4.8H11v2H9Zm9 0V10h2v10h5v2h-7Z" fill="white" />
          </svg>
          <div className="sidebar__brand-text">
            <div className="sidebar__brand-name">LegalOS</div>
            <div className="sidebar__brand-sub">Enterprise</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          <div className="nav__section">
            <div className="nav__label">Workspace</div>
            {WORKSPACE.map(renderItem)}
          </div>
          <div className="nav__section">
            <div className="nav__label">Administration</div>
            {ADMIN.map(renderItem)}
          </div>
        </nav>

        <div className="sidebar__foot">
          {DEMO_MODE ? (
            // Persona / "View As" switcher — DEMO & localhost only, never shipped to production.
            <Dropdown width={230} trigger={
              <button className="sidebar__user" style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", font: "inherit" }}>
                <Avatar name={currentUser.name} size="md" />
                <div className="sidebar__user-meta">
                  <div className="sidebar__user-name">{currentUser.name}</div>
                  <div className="sidebar__user-role">{ROLE_LABELS[currentUser.role]}</div>
                </div>
                <Icon name="chevronDown" size={15} />
              </button>
            }>
              <div className="menu__label">Signed in as (demo)</div>
              {users.map((u) => (
                <MenuItem key={u.id} icon={u.id === currentUser.id ? "check" : "user"} active={u.id === currentUser.id}
                  onClick={() => setCurrentUserId(u.id)}>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: u.id === currentUser.id ? 700 : 500 }}>{u.name}</div>
                    <div className="tiny muted" style={{ fontSize: 11 }}>{ROLE_LABELS[u.role]}</div>
                  </span>
                </MenuItem>
              ))}
            </Dropdown>
          ) : (
            <div className="sidebar__user" aria-label={`Signed in as ${currentUser.name}`}>
              <Avatar name={currentUser.name} size="md" />
              <div className="sidebar__user-meta">
                <div className="sidebar__user-name">{currentUser.name}</div>
                <div className="sidebar__user-role">{ROLE_LABELS[currentUser.role]}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <nav className="topbar__crumbs" aria-label="Breadcrumb">
            <button className="crumb-btn" onClick={() => navigate("/")}>LegalOS</button>
            <Icon name="chevronRight" size={14} />
            <button className="crumb-btn crumb-btn--current" onClick={() => navigate(area ? `/${area}` : "/")}>
              {AREA_TITLE[area] ?? "Home"}
            </button>
          </nav>
          <div className="topbar__spacer" />
          <button className="searchbtn" onClick={() => setPalette(true)} aria-label="Search (Command or Control K)">
            <Icon name="search" size={15} />
            <span>Search requests…</span>
            <kbd>⌘K</kbd>
          </button>
          {canRaise && (
            <button className="newbtn" onClick={() => navigate("/requests/new")}>
              <Icon name="plus" size={15} /><span>New</span>
            </button>
          )}
          <NotificationsBell />
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 2px" }} />
          <Dropdown align="right" width={230} up={false} trigger={
            <button className="avatar-trigger" aria-label="Account menu" style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0 }}>
              <Avatar name={currentUser.name} size="md" />
            </button>
          }>
            <div className="menu__label">{currentUser.name}</div>
            <div className="menu__label" style={{ marginTop: -6, fontWeight: 500, textTransform: "none" }}>{ROLE_LABELS[currentUser.role]}</div>
            <div className="menu__sep" />
            <MenuItem icon="inbox" onClick={() => navigate("/requests")}>{canRaise ? "My requests" : "Requests"}</MenuItem>
            {canRaise && <MenuItem icon="plus" onClick={() => navigate("/requests/new")}>New request</MenuItem>}
            <MenuItem icon="settings" onClick={() => navigate("/settings")}>Settings</MenuItem>
          </Dropdown>
        </header>
        <div className="content"><Outlet /></div>
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
