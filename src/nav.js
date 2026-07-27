// Navigation config — shared by sidebar, command palette, router.
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
  { section: "Legal Work", items: [
    // The unified command surface sits at the top of Legal Work (Workstream A).
    { path: "/workspace", label: "Legal Workspace", icon: "layers", badge: REQUESTS.length },
    { path: "/tracker", label: "Contract Tracker", icon: "grid" },
    { path: "/repository", label: "Intake & Repository", icon: "database" },
    { path: "/requests", label: "Legal Requests", icon: "inbox", badge: 14 },
    { path: "/matters", label: "Matters", icon: "folder", badge: 12 },
    { path: "/contracts", label: "Contracts", icon: "file" },
    { path: "/reviews", label: "Reviews", icon: "checkcircle", badge: 4 },
    { path: "/approvals", label: "Approvals", icon: "checksquare", badge: 5, alert: true },
    { path: "/negotiations", label: "Negotiations", icon: "gitbranch" },
    { path: "/companies", label: "Companies & Entities", icon: "building" },
  ]},
  { section: "Content", items: [
    { path: "/templates", label: "Templates", icon: "template" },
    { path: "/clauses", label: "Clause Library", icon: "library" },
    { path: "/knowledge", label: "Knowledge Base", icon: "book" },
  ]},
  { section: "Risk & Governance", items: [
    { path: "/licenses", label: "Licenses", icon: "fileCheck", badge: LICENSE_BADGE || undefined, alert: LICENSE_ALERT },
    { path: "/litigation", label: "Litigation", icon: "scale" },
    { path: "/compliance", label: "Compliance", icon: "shield" },
    { path: "/reports", label: "Reports", icon: "barchart" },
  ]},
  { section: "Intelligence & Automation", items: [
    { path: "/analyzer", label: "Data Analyzer", icon: "cpu" },
    { path: "/pipelines", label: "Team Pipelines", icon: "columns" },
    { path: "/copilot", label: "AI Copilot", icon: "sparkles" },
    { path: "/automation", label: "Workflow Builder", icon: "workflow" },
  ]},
  { section: "Administration", items: [
    { path: "/portal", label: "Requester Portal", icon: "user" },
    { path: "/organization", label: "Organization", icon: "building" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ]},
];

export const NAV_FLAT = NAV.flatMap((s) => s.items);
export const labelFor = (path) => (NAV_FLAT.find((i) => path.startsWith(i.path)) || { label: "LegalOS" }).label;
