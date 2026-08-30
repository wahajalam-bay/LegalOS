// LegalOS entry point.
import { html, createRoot, useEffect } from "./core.js";
import { useRoute, parsePath, navigate } from "./router.js";
import { REQUESTER_DOOR_PATHS } from "./nav.js";
import { Shell } from "./layout.js";
import { Empty, Btn } from "./ui.js";

import Dashboard from "./pages/dashboard.js";
import TeamDashboard from "./pages/team.js";
import MyDashboard from "./pages/me.js";
import Requests from "./pages/requests.js";
import Matters from "./pages/matters.js";
import Contracts from "./pages/contracts.js";
import Reviews from "./pages/reviews.js";
import Approvals from "./pages/approvals.js";
import Negotiations from "./pages/negotiations.js";
import Templates from "./pages/templates.js";
import Clauses from "./pages/clauses.js";
import Knowledge from "./pages/knowledge.js";
import Litigation from "./pages/litigation.js";
import Compliance from "./pages/compliance.js";
import Reports from "./pages/reports.js";
import Copilot from "./pages/copilot.js";
import Automation from "./pages/automation.js";
import Organization from "./pages/organization.js";
import Settings from "./pages/settings.js";
import Licenses from "./pages/licenses.js";
import Companies from "./pages/companies.js";
// Sprint 3 modules
import Workspace from "./pages/workspace.js";
import Tracker from "./pages/tracker.js";
import RepositoryPage from "./pages/repository.js";
import Analyzer from "./pages/analyzer.js";
import Pipelines from "./pages/pipelines.js";
import Portal from "./pages/portal.js";
// Sprint 5 — the executive story
import Exec from "./pages/exec.js";
import FlowMap from "./pages/flowmap.js";
// Sprint 6 — the org architecture
import ModulePage from "./pages/module.js";
import Raise from "./pages/raise.js";
import MyRequests from "./pages/myrequests.js";
import Triage from "./pages/triage.js";
import Costs from "./pages/costs.js";
// Module 3 — Contract Intelligence
import Drafting from "./pages/drafting.js";
// The credential picker (sign-in / switch-view screen)
import Login, { isAuthed, isRequesterDoor } from "./pages/login.js";
import { runOrgSweeps, _bindRbac } from "./store.js";
import { activeUser, landingFor, filterVisible, useActiveUser, isLegal, canOpenPath } from "./rbac.js";
// Retrieval security: the store's precedent retrieval denies everything until
// the access layer is bound. Bind it at boot.
_bindRbac(filterVisible);

const ROUTES = {
  "/exec": Exec,
  "/flow-map": FlowMap,
  "/m": ModulePage,
  "/my-tasks": LegalRequests, // merged into Legal Requests (alias keeps old links/landings working)
  "/triage": Triage,
  "/raise": Raise,
  "/my-requests": LegalRequests, // retired nav entry; alias keeps old links working
  "/costs": Costs,
  "/dashboard": Dashboard,
  "/team": TeamDashboard,
  "/me": MyDashboard,
  "/workspace": Workspace,
  "/tracker": Tracker,
  "/repository": RepositoryPage,
  "/analyzer": Analyzer,
  "/pipelines": Pipelines,
  "/portal": Portal,
  "/requests": LegalRequests,
  "/matters": Matters,
  "/contracts": Contracts,
  "/reviews": Reviews,
  "/approvals": Approvals,
  "/negotiations": Negotiations,
  "/templates": Templates,
  "/clauses": Clauses,
  "/drafting": Drafting,
  "/login": Login,
  "/knowledge": Knowledge,
  "/litigation": Litigation,
  "/compliance": Compliance,
  "/reports": Reports,
  "/copilot": Copilot,
  "/automation": Automation,
  "/organization": Organization,
  "/settings": Settings,
  "/licenses": Licenses,
  "/companies": Companies,
};

// Legal Requests serves BOTH audiences from one nav entry and one URL: legal
// staff get the team queue, a requester gets their own requests (what used to be
// the separate "My Requests" item). The identity decides the view, so there is
// nothing to keep in sync between two menu entries.
function LegalRequests() {
  return isLegal(useActiveUser()) ? html`<${Requests} />` : html`<${MyRequests} />`;
}

// A page this identity may not open. Shown instead of the page — deliberately
// NOT a silent redirect, so the person can see that the address was refused
// rather than wondering why they landed somewhere else, and deliberately with no
// hint of the content behind it.
function NoAccess({ path }) {
  const me = useActiveUser();
  // Say WHY in the requester's own terms — "internal to Legal" is the honest
  // reason and stops them hunting for a link that does not exist. For legal
  // staff it is a privilege boundary, so name the escalation instead.
  const text = isLegal(me)
    ? `This page is not available for ${me.role || "your role"}. Ask the Legal Director if you need it.`
    : "This area is internal to the Legal department. From your home you can raise a legal request and follow your own requests end to end.";
  return html`<div class="page">
    <${Empty} icon="lock" title="You do not have access to this page" text=${text} />
    <div class="row" style="justify-content:center;margin-top:14px">
      <${Btn} onClick=${() => navigate(landingFor(me))}>Back to my home</${Btn}>
    </div>
  </div>`;
}

function NotFound() {
  return html`<div class="page"><${Empty} icon="search" title="Page not found" text="This module isn't available yet." /></div>`;
}

/* The requester portal (/portal/) is a REQUESTING surface, nothing else. The
   two invariants below are enforced in the router rather than by hiding links,
   because hiding a link is not enforcement — a typed hash would walk straight
   past it:

     1. it can only ever run as a REQUESTER identity. localStorage is shared
        with the root mount (same origin), so signing in as legal at /legalos/
        would otherwise carry that identity into the portal;
     2. it can only reach the requesting routes. Anything else is rewritten to
        Raise Request, so the address bar never claims a view the portal will
        not serve.

   /legalos/ stays the legal department's way in; /legalos/portal/ is the
   business's. */
// The allowlist lives in nav.js — see REQUESTER_DOOR_PATHS.

function App() {
  const [path] = useRoute();
  const { base, id } = parsePath(path);
  const door = isRequesterDoor();
  // Invariant 1 — the PORTAL never runs as a legal identity. The mounts share an
  // origin and therefore localStorage, so without this a legal sign-in at
  // /legalos/ carries into the portal and a General Counsel ends up looking at
  // the full legal shell under /portal/. Deliberately one-directional: the legal
  // mount simply never OFFERS a requester credential (login picks its roster
  // from the mount), so it needs no matching refusal — and refusing one there
  // would lock out the requester journeys the suites drive from the root.
  const wrongIdentity = door && isLegal(activeUser());
  // Invariant 2 — clamp the route to what the portal serves.
  const blocked = door && !wrongIdentity && isAuthed() && base !== "/login" && !REQUESTER_DOOR_PATHS.has(base);
  useEffect(() => { if (blocked) navigate("/raise"); }, [blocked]);

  // The credential picker renders bare — no shell until someone signs in. It
  // picks its own roster from the mount, so there is nothing to pass in.
  if (base === "/login" || !isAuthed() || wrongIdentity) {
    return html`<${Login} />`;
  }
  const effBase = blocked ? "/raise" : base;
  // Page-level access, enforced HERE and not merely by hiding the menu row: the
  // hash is user input, and every privileged page used to open for anyone who
  // typed it. Same rule the sidebar is built from (canOpenPath), so a visible
  // row is always openable and a hidden one is always refused.
  if (!canOpenPath(activeUser(), path)) {
    return html`<${Shell} path=${path}><${NoAccess} path=${path} key="noaccess" /></${Shell}>`;
  }
  const Page = ROUTES[effBase] || NotFound;
  return html`<${Shell} path=${path}><${Page} id=${id} path=${path} key=${effBase} /></${Shell}>`;
}

// Section 5.2 / 7.2 / 9 / 12 — renewal triggers, reminder buckets and SLA-breach
// notifications are system-generated. One idempotent sweep per boot.
try { runOrgSweeps(); } catch (e) {}

// A bare URL renders the landing route, so put that route in the address bar too:
// the URL should always say where you are, which matters when a link or a
// screenshot gets passed around. replaceState so this adds no history entry.
// Section 11 — the landing route is role-aware: legal staff land on My Tasks,
// management on the executive overview, business users on Raise Request.
if (!window.location.hash) {
  try { window.history.replaceState(null, "", "#" + landingFor(activeUser())); } catch (e) {}
}

clearTimeout(window.__legalos_boot);
createRoot(document.getElementById("root")).render(html`<${App} />`);
