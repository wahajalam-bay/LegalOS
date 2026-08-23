import { NavLink, Outlet } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { can } from "@/permissions/permissions";
import { ROLE_LABELS } from "@/domain/models/enums";

export function AppShell() {
  const { currentUser, users, setCurrentUserId } = useApp();

  const nav = [
    { to: "/", label: "Requests", end: true, show: true },
    { to: "/new", label: "New request", end: false, show: can(currentUser, "request.create") },
    { to: "/triage", label: "Triage", end: false, show: can(currentUser, "request.triage") },
  ].filter((n) => n.show);

  return (
    <div className="shell">
      <aside className="shell__side">
        <div className="brand">LegalOS<span className="brand__sub">Request Intake</span></div>
        <nav className="nav" aria-label="Primary">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav__link${isActive ? " is-active" : ""}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="shell__main">
        <header className="topbar">
          <span className="topbar__title">Module 1 — Request Intake &amp; Management</span>
          {/* Mock authentication: switch the acting identity (dev affordance). */}
          <label className="topbar__who">
            <span className="topbar__who-label">Signed in as</span>
            <select
              className="input input--sm"
              aria-label="Acting user"
              value={currentUser.id}
              onChange={(e) => setCurrentUserId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {ROLE_LABELS[u.role]}</option>
              ))}
            </select>
          </label>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
