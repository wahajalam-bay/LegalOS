// Navigation config — shared by sidebar, command palette, router.
// Sprint 6: the sidebar is organised around the three Legal teams (FRD Section 1).
// Modules of the OTHER teams stay visible — clicking one explains the row-level
// access rule — because knowing a queue exists is not the same as reading it.
import { LICENSES, licenseStatus, REQUESTS } from "./data.js";

// License badge = count needing attention (Expiring Soon / Critical / Expired).
const _licAlerts = LICENSES.map((l) => licenseStatus(l)).filter((s) => s.key !== "Valid");
const LICENSE_BADGE = _licAlerts.length;
const LICENSE_ALERT = _licAlerts.some((s) => s.key === "Expired" || s.key === "Critical");

export const NAV = [
  { section: "Overview", items: [
    { path: "/exec", label: "Executive Overview", icon: "star" },
    { path: "/flow-map", label: "How It Works", icon: "git" },
    { path: "/dashboard", label: "Operational Dashboard", icon: "dashboard" },
  ]},
  { section: "My Work", items: [
    { path: "/my-tasks", label: "My Tasks", icon: "checksquare", badge: "myTasks" },
    { path: "/raise", label: "Raise Request", icon: "plus" },
  ]},
  { section: "Litigation & Disputes", items: [
    { path: "/m/cases", label: "Case Handling", icon: "gavel" },
    { path: "/m/assetRecovery", label: "Asset Recovery", icon: "refresh" },
    { path: "/m/ip", label: "IP Portfolio", icon: "tag" },
    { path: "/m/developerDisputes", label: "Developer Disputes", icon: "building" },
    { path: "/m/police", label: "Police Complaints", icon: "alertTriangle" },
    { path: "/m/notices", label: "Notices", icon: "mail" },
    { path: "/m/inspections", label: "Govt Inspections", icon: "shield" },
  ]},
  { section: "Commercial & Risk", items: [
    { path: "/m/contracts", label: "Contracts", icon: "file" },
    { path: "/m/vetting", label: "Risk Vetting", icon: "checkcircle" },
    { path: "/tracker", label: "Contract Tracker", icon: "grid" },
  ]},
  { section: "Compliance", items: [
    { path: "/m/agreements", label: "Lease, Loan & Service", icon: "clipboard" },
    { path: "/m/resolutions", label: "Resolutions", icon: "checksquare" },
    { path: "/m/licenses", label: "License Renewals", icon: "fileCheck" },
    { path: "/m/secpFilings", label: "SECP Filings", icon: "briefcase" },
    { path: "/licenses", label: "License Register", icon: "database", badge: LICENSE_BADGE || undefined, alert: LICENSE_ALERT },
  ]},
  { section: "Shared", items: [
    { path: "/workspace", label: "Legal Workspace", icon: "layers", badge: REQUESTS.length },
    { path: "/repository", label: "Intake & Repository", icon: "scan" },
    { path: "/companies", label: "Entity Registry", icon: "building" },
    { path: "/templates", label: "Templates", icon: "template" },
    { path: "/clauses", label: "Clause Library", icon: "library" },
  ]},
  { section: "Insight & Governance", items: [
    { path: "/costs", label: "Cost Analysis", icon: "dollar" },
    { path: "/analyzer", label: "Data Analyzer", icon: "cpu" },
    { path: "/pipelines", label: "Team Pipelines", icon: "columns" },
    { path: "/reports", label: "Reports", icon: "barchart" },
  ]},
  { section: "Administration", items: [
    { path: "/portal", label: "Requester Portal", icon: "user" },
    { path: "/organization", label: "Organization", icon: "users" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ]},
];

export const NAV_FLAT = NAV.flatMap((s) => s.items);
export const labelFor = (path) => (NAV_FLAT.find((i) => path.startsWith(i.path)) || { label: "LegalOS" }).label;
