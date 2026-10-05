// Navigation config — shared by sidebar, command palette, router.
//
// The rail is the product's table of contents. It carries the nine primary
// areas and NOTHING ELSE: Dashboard, Legal Workspace, Calendar, Raise Request,
// then the six module families as one row each. A family's real destinations
// are TABS — on the family's own page (/g/<key>, as tiles with live counts)
// and, once you are inside it, as a strip across the top of every page in the
// family (FamilyTabs in layout.js). Expanding the families in the rail instead
// was tried and reverted: it turned nine rows into thirty-odd, the rail
// scrolled, and the destination you wanted was buried in a column you had to
// read. Sibling registers belong beside each other on the page, not stacked in
// the chrome.
import { LICENSES, licenseStatus, REQUESTS } from "./data.js";
import { COMPLIANCE_MODULES } from "./compliancemodules.js";

// License badge = count needing attention (Expiring Soon / Critical / Expired).
const _licAlerts = LICENSES.map((l) => licenseStatus(l)).filter((s) => s.key !== "Valid");
const LICENSE_BADGE = _licAlerts.length;
const LICENSE_ALERT = _licAlerts.some((s) => s.key === "Expired" || s.key === "Critical");

// The module families. /g/<key> renders these as tiles with live counts, the
// tab strip above every page in the family renders them as tabs, and the
// breadcrumb maps a page back to its family. One list, four readers.
export const NAV_GROUPS = [
  { key: "commercial", label: "Commercial & Risk Mitigation", icon: "file", items: [
    { path: "/contract-requests", label: "Contract Requests", icon: "inbox" },
    { path: "/m/contracts", label: "Contract Review", icon: "file" },
    { path: "/m/vetting", label: "Risk Analysis", icon: "checkcircle" },
    { path: "/tracker", label: "Commercial Contract Tracker", icon: "grid" },
    { path: "/projects", label: "Project Documents", icon: "building" },
  ]},
  /* COMPANIES IS THE PRIMARY COMPLIANCE OBJECT.
     Everything a compliance lawyer holds — projects, loans, licences, SECP
     filings, resolutions — belongs TO a company, and the register that used to
     lead this family (Resolutions) is one artefact of one company's year. The
     company is the umbrella record; Resolutions is reached through it and
     stays reachable as a global register from the Overview, which is where a
     cross-entity question actually starts.

     The five operational registers below come from compliancemodules.js, so
     navigation, routing and the breadcrumb are one definition and cannot
     drift. `count` names the compliance register a hub tile reports on; the
     figure is read from the API, never hardcoded. */
  { key: "compliance", label: "Compliance & Licences", icon: "shield", items: [
    { path: "/compliance", label: "Overview", icon: "shield" },
    { path: "/companies", label: "Companies", icon: "building" },
    ...COMPLIANCE_MODULES.filter((m) => m.key !== "resolutions").map((m) => ({
      path: m.path, label: m.label, icon: m.icon, count: m.key,
      ...(m.key === "licenses" ? { badge: LICENSE_BADGE || undefined, alert: LICENSE_ALERT } : {}),
    })),
  ]},
  /* ONE ENTRY PER KIND OF DISPUTE WORK.
     Litigation is court cases and nothing else: developer disputes, notices,
     trademarks and police complaints each have their own source, their own
     fields and their own register, and folding them into the case book is what
     made every count in this family wrong. Analytics is a destination in its
     own right rather than a button on one register, because the questions it
     answers ("how do we do against this firm", "how old is the book") span all
     of them. */
  { key: "litigation", label: "Litigation & Disputes", icon: "gavel", items: [
    { path: "/litigation", label: "Litigation", icon: "gavel" },
    { path: "/m/developerDisputes", label: "Disputes", icon: "building" },
    { path: "/m/causelist", label: "Cause List / Calendar", icon: "calendar" },
    { path: "/m/notices", label: "Notices", icon: "mail" },
    { path: "/m/ip", label: "PK IP Portfolio", icon: "tag" },
    { path: "/m/assetRecovery", label: "Asset Recovery", icon: "refresh" },
    { path: "/m/refundClaims", label: "Refund Claims", icon: "dollar" },
    { path: "/m/police", label: "Police Complaints", icon: "alertTriangle" },
    { path: "/m/inspections", label: "Government Authority Visits", icon: "shield" },
    { path: "/m/spend", label: "Invoices & Spend", icon: "dollar" },
    { path: "/m/analytics", label: "Analytics", icon: "barchart" },
  ]},
  /* THE DATA BANK — what Legal knows, as opposed to what Legal is doing.
     "Shared" said nothing about what was inside it, and its first entry was an
     Intake & Repository wizard over an empty collection: a document pipeline
     with no documents, which is the definition of a dead end. What is left is
     the reference estate — the executed contract corpus and the drafting
     material built on top of it. */
  { key: "shared", label: "Data Bank", icon: "library", items: [
    { path: "/contracts", label: "Contracts Repository", icon: "folder" },
    { path: "/drafting", label: "Contract Intelligence", icon: "sparkles" },
    { path: "/templates", label: "Templates", icon: "template" },
    { path: "/clauses", label: "Clause Library", icon: "library" },
    { path: "/playbooks", label: "Precedents & Playbooks", icon: "book" },
    { path: "/knowledge", label: "Knowledge Base", icon: "search" },
  ]},
  { key: "insight", label: "Insight & Governance", icon: "barchart", items: [
    { path: "/costs", label: "Cost Analysis", icon: "dollar" },
    { path: "/analyzer", label: "Data Analyzer", icon: "cpu" },
    { path: "/assistant", label: "Assistant", icon: "cpu" },
    { path: "/pipelines", label: "Team Pipelines", icon: "columns" },
    { path: "/reports", label: "Reports", icon: "barchart" },
  ]},
  { key: "admin", label: "Administration", icon: "settings", items: [
    { path: "/access", label: "Users & Access", icon: "users" },
    { path: "/datahealth", label: "Data Health", icon: "activity" },
    { path: "/portal", label: "Requester Portal", icon: "user" },
    { path: "/organization", label: "Organization", icon: "users" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ]},
];

export const NAV = [
  // No "Overview" group any more — each role has exactly ONE dashboard row
  // (canOpenPath shows each person only theirs), so a collapsible header over a
  // single item was pure ceremony. Headerless, always visible, top of the rail.
  { section: null, items: [
    { path: "/exec", label: "Dashboard", icon: "star" },
    { path: "/team", label: "Team Dashboard", icon: "star" },
    { path: "/me", label: "My Dashboard", icon: "star" },
  ]},
  /* THE DAILY SURFACES. `section: null` renders these with no header, always
     visible, so their position reads the same however the families below are
     opened or shut.

     MATTERS IS GONE. It was a generic container beside the real operational
     modules — the same work, filed twice, under a word that named no source,
     no register and no team. Work lives in the module that owns it; /matters
     still resolves and lands on the Legal Workspace so no saved link breaks.

     CONTRACTS is not here either: the contract book is the Data Bank's
     Contracts Repository, and a second row pointing at the same register is
     exactly the duplication this pass exists to remove. */
  { section: null, items: [
    // ONE surface for the legal team: the Legal Workspace hosts Current Work,
    // Project Wise and Legal Requests behind sub-tabs — see WorkspaceHub in
    // main.js. The standalone "Legal Requests" row below is hidden for legal
    // staff (rbac.navForUser) and kept for business requesters, whose whole
    // world is their own requests.
    { path: "/workspace", label: "Legal Workspace", icon: "layers" },
    { path: "/requests", label: "Legal Requests", icon: "inbox", badge: "myTasks" },
    /* ONE CALENDAR FOR THE DEPARTMENT. Hearings, task due dates, contract
       expiries, licence renewals and compliance deadlines are all dated
       obligations, and before this they were five lists on five pages with no
       way to see the week. */
    { path: "/calendar", label: "Calendar", icon: "calendar" },
    { path: "/raise", label: "Raise Request", icon: "plus" },
  ]},
  /* ONE ROW PER FAMILY.
     `section` names the family and `items` lists what is inside it. The
     sidebar renders the family as a single row addressed /g/<key>; the items
     are still the one definition the hub tiles, the family tab strip, the
     command palette and the breadcrumb all read, so none of them can drift
     apart, and each item is filtered through canOpenPath wherever it is
     rendered. A family whose own address you may not open never appears —
     visibility is decided by the family, not by whatever happens to sit
     inside it. */
  ...NAV_GROUPS.map((g) => ({
    section: g.label,
    /* The family's OWN gate: a section survives only if /g/<key> is openable.
       Gating it by "any one item inside is openable" showed a litigation
       associate the Commercial and Insight families they had never been able to
       open. A family is visible when you may open the family. */
    key: g.key,
    icon: g.icon,
    items: g.items,
  })),
];

/* What the requester portal (/portal/) is allowed to reach. It is a requesting
   surface: raise one, track your own, read how the process works. Everything
   else belongs to the legal mount at /legalos/. Shared by the router (which
   enforces it) and the command palette (which must not offer what the router
   would refuse). */
export const REQUESTER_DOOR_PATHS = new Set(["/login", "/raise", "/requests", "/my-requests"]);

export const NAV_FLAT = NAV.flatMap((s) => s.items);

/* THE MOST SPECIFIC ROW NAMES THE PAGE.
   This took the FIRST entry the path started with. That was harmless while
   NAV_FLAT held only top-level rows, but the families now list their real
   destinations, and "/compliance/licenses" starts with "/compliance" — so the
   breadcrumb would read "Overview" while the licence register was on screen.
   Longest match wins, and it has to be a path boundary: "/m/report" must not be
   named by "/m/reports". */
export const labelFor = (path) => {
  const here = String(path || "").split("?")[0].replace(/\/+$/, "");
  const hit = NAV_FLAT
    .filter((i) => here === i.path || here.startsWith(i.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!hit) return "LegalOS";
  /* A FAMILY'S OWN LANDING PAGE IS NAMED AFTER THE FAMILY.
     Compliance's landing row is called "Overview" — the right word in the rail,
     underneath "Compliance & Licences", and the wrong one in a breadcrumb, where
     it produced "ZM > Compliance & Licences > Overview" for a page whose name IS
     the family. The breadcrumb collapses the pair when the leaf and the family
     agree, so returning the family label here is what makes that work. */
  const fam = NAV_GROUPS.find((g) => g.items[0] && g.items[0].path === hit.path);
  return fam ? fam.label : hit.label;
};
