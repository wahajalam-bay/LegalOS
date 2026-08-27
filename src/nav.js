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
  // NOT part of Overview, and not collapsible: `section: null` renders these
  // rows with no header, always visible. They sit here so the position reads the
  // same whether Overview is open or shut — directly under it either way.
  //
  // ONE row for the whole request flow. Triage is a STAGE of a legal request,
  // not a separate destination, and the page already leads with its "Awaiting
  // triage" count, so it has no row of its own (the /triage route still resolves
  // for links and for that tile). The row serves both audiences: legal staff get
  // the team queue, a requester gets their own requests (see main.js).
  { section: null, items: [
    { path: "/requests", label: "Legal Requests", icon: "inbox", badge: "myTasks" },
    { path: "/raise", label: "Raise Request", icon: "plus" },
  ]},
  // The three legal teams, in the order the department reads them.
  { section: "Commercial & Risk Mitigation", items: [
    { path: "/m/contracts", label: "Contract Review", icon: "file" },
    { path: "/m/vetting", label: "Risk Analysis", icon: "checkcircle" },
    { path: "/tracker", label: "Contract Tracker", icon: "grid" },
  ]},
  { section: "Compliance & Licences", items: [
    { path: "/m/agreements", label: "Lease, Loan & Service", icon: "clipboard" },
    { path: "/m/resolutions", label: "Resolutions", icon: "checksquare" },
    { path: "/m/licenses", label: "License Renewals", icon: "fileCheck" },
    { path: "/m/filings", label: "SECP Filings", icon: "book" },
    { path: "/licenses", label: "License Register", icon: "database", badge: LICENSE_BADGE || undefined, alert: LICENSE_ALERT },
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
  { section: "Shared", items: [
    { path: "/workspace", label: "Legal Workspace", icon: "layers", badge: REQUESTS.length },
    { path: "/matters", label: "Matters", icon: "folder" },
    { path: "/repository", label: "Intake & Repository", icon: "scan" },
    { path: "/companies", label: "Entity Registry", icon: "building" },
    { path: "/drafting", label: "Contract Intelligence", icon: "sparkles" },
    { path: "/templates", label: "Templates", icon: "template" },
    { path: "/clauses", label: "Clause Library", icon: "library" },
    { path: "/knowledge", label: "Precedents & Playbooks", icon: "book" },
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

/* What the requester portal (/portal/) is allowed to reach. It is a requesting
   surface: raise one, track your own, read how the process works. Everything
   else belongs to the legal mount at /legalos/. Shared by the router (which
   enforces it) and the command palette (which must not offer what the router
   would refuse). */
export const REQUESTER_DOOR_PATHS = new Set(["/login", "/raise", "/requests", "/my-requests", "/flow-map"]);

export const NAV_FLAT = NAV.flatMap((s) => s.items);
export const labelFor = (path) => (NAV_FLAT.find((i) => path.startsWith(i.path)) || { label: "LegalOS" }).label;
