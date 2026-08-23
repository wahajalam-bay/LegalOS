import { NavLink, Outlet } from "react-router-dom";
import { useApp } from "@/state/AppContext";
import { can, isLegalRole } from "@/permissions/permissions";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function RequestsLayout() {
  const { currentUser } = useApp();
  const legal = isLegalRole(currentUser.role);

  const tabs = [
    { to: "/requests", label: "My Requests", end: true, show: true },
    { to: "/requests/all", label: "All Requests", end: false, show: can(currentUser, "request.viewAll") || can(currentUser, "request.viewTeam") },
    { to: "/requests/assigned", label: "Assigned to Me", end: false, show: legal },
    { to: "/requests/triage", label: "Triage", end: false, show: can(currentUser, "request.triage") },
  ].filter((t) => t.show);

  return (
    <div className="page">
      <nav className="subnav" aria-label="Requests views">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx("subnav__link", isActive && "is-active")}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
