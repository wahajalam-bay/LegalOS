// LegalOS entry point.
import { html, createRoot, useEffect } from "./core.js";
import { useRoute, parsePath, navigate, redirect } from "./router.js";
import { REQUESTER_DOOR_PATHS } from "./nav.js";
import { Shell } from "./layout.js";
import { Empty, Btn } from "./ui.js";
import { Icon } from "./icons.js";
import { hydrateContracts } from "./live.js";
import { api } from "./api.js";

import TeamDashboard from "./pages/team.js";
import MyDashboard from "./pages/me.js";
import Requests from "./pages/requests.js";
import CalendarPage from "./pages/calendar.js";
import Playbooks from "./pages/playbooks.js";
import LitigationAnalytics from "./pages/litanalytics.js";
import NativeModule from "./pages/modulenative.js";
import Contracts from "./pages/contracts.js";
import Reviews from "./pages/reviews.js";
import Approvals from "./pages/approvals.js";
import Negotiations from "./pages/negotiations.js";
import Templates from "./pages/templates.js";
import Clauses from "./pages/clauses.js";
import Knowledge from "./pages/knowledge.js";
import GroupHub from "./pages/group.js";
import Litigation from "./pages/litigation.js";
import Compliance from "./pages/compliance.js";
import Reports from "./pages/reports.js";
import Automation from "./pages/automation.js";
import Organization from "./pages/organization.js";
import Settings from "./pages/settings.js";
import Licenses from "./pages/licenses.js";
import Companies from "./pages/companies.js";
// Sprint 3 modules
import Workspace from "./pages/workspace.js";
import ProjectWise from "./pages/projectwise.js";
import Tracker from "./pages/tracker.js";
import Projects from "./pages/projects.js";
import RepositoryPage from "./pages/repository.js";
import Analyzer from "./pages/analyzer.js";
import Assistant from "./pages/assistant.js";
import Pipelines from "./pages/pipelines.js";
import Portal from "./pages/portal.js";
// Sprint 5 — the executive story
import Exec from "./pages/exec.js";
// Sprint 6 — the org architecture
import ModulePage from "./pages/module.js";
import ModuleLive, { MODULE_LIVE_KEYS } from "./pages/modulelive.js";
import DeveloperDisputes from "./pages/developerdisputes.js";
import IpPortfolio from "./pages/ipportfolio.js";
import { CauseListPage, LegalSpendPage, LitigationReportPage } from "./pages/litmodulepages.js";
import ContractRequests from "./pages/contractrequests.js";
import ContractRequest from "./pages/contractrequest.js";
import AssetRecovery from "./pages/assetrecovery.js";
import RefundClaims from "./pages/refundclaims.js";
import RecordWorkspace from "./pages/recordworkspace.js";
import Access from "./pages/access.js";
import DataHealth from "./pages/datahealth.js";
import Raise from "./pages/raise.js";
import MyRequests from "./pages/myrequests.js";
import Triage from "./pages/triage.js";
import Costs from "./pages/costs.js";
// Module 3 — Contract Intelligence
import Drafting from "./pages/drafting.js";
// The credential picker (sign-in / switch-view screen)
import Login, { isAuthed, isRequesterDoor, startSessionWatch } from "./pages/login.js";
import { runOrgSweeps, _bindRbac, hydrateRequests, hydrateConfigProposals, hydrateNotifications } from "./store.js";
import { activeUser, landingFor, filterVisible, useActiveUser, isLegal, canOpenPath } from "./rbac.js";
// Retrieval security: the store's precedent retrieval denies everything until
// the access layer is bound. Bind it at boot.
_bindRbac(filterVisible);

/* Addresses that moved when Compliance became six registers.
   "Lease, Loan & Service" was one combined family and is now three; the /m/*
   compliance module pages held fabricated demo records, were emptied in
   September, and opened to nothing. Rather than leave dead ends — or break the
   deep links that dashboards, the analyzer and the flow map still hold — each
   old address lands on the register that now owns its records. */
const COMPLIANCE_MOVED = {
  "/licenses": "/compliance/licenses",
  "/m/agreements": "/compliance",
  "/m/resolutions": "/compliance/resolutions",
  "/m/licenses": "/compliance/licenses",
  "/m/filings": "/compliance/sec-filings",
};
function MovedToCompliance({ path }) {
  const parts = String(path || "").split("?")[0].split("/").filter(Boolean);
  // Match the longest address first, so "/m/resolutions/<id>" falls back to
  // "/m/resolutions" rather than missing entirely.
  const to = COMPLIANCE_MOVED["/" + parts.join("/")]
    || COMPLIANCE_MOVED["/" + parts.slice(0, 2).join("/")]
    || COMPLIANCE_MOVED["/" + parts.slice(0, 1).join("/")]
    || "/compliance";
  useEffect(() => { redirect(to); }, [to]);
  return html`<div class="page fade-in"><div class="tiny muted" style="padding:22px 2px">Opening the compliance register…</div></div>`;
}

const ROUTES = {
  "/exec": Exec,
  // /m/<key>: register-backed keys render the live module page; the rest keep
  // the workflow ModulePage. Compliance keys have MOVED to their own registers.
  "/m": function ModuleRoute({ id, path }) {
    const key = String(path || "").split("/").filter(Boolean)[1] || "";
    if (COMPLIANCE_MOVED["/m/" + key]) return html`<${MovedToCompliance} path=${path} />`;
    /* Developer Disputes is built from its own tracker in Drive, not from the
       case register, so it is its own page rather than a filtered view of
       litigation cases -- which is what it used to be, and why it showed
       unrelated matters. */
    /* The IP portfolio is its own tracker in Drive, not a slice of the case
       register — which is what /m/ip used to be, and why it showed unrelated
       litigation matters instead of trademarks. */
    /* Asset recovery is its own workbook — 25 sheets about people who left
       with company property — not a slice of the case register. */
    /* The cause list, the invoice ledger and the weekly report are families in
       their own right, like Asset Recovery and the IP portfolio. They were tabs
       on the litigation workspace, one row below a switcher that already named
       them; each now has its own address. */
    if (key === "causelist") return html`<${CauseListPage} />`;
    /* Litigation analytics is a destination, not a button on the register:
       the questions it answers -- how we do against a firm, how old the book
       is, what we are exposed to -- span cases, disputes and notices, so it
       cannot live inside any one of them. */
    if (key === "analytics") return html`<${LitigationAnalytics} />`;
    /* POLICE COMPLAINTS AND GOVERNMENT AUTHORITY VISITS have no workbook in
       Drive -- nobody keeps a spreadsheet of police complaints -- so every
       record in them is created here. They used to render through the generic
       workflow page, which persists to a BROWSER-LOCAL collection: a complaint
       logged on one laptop existed on that laptop and nowhere else, and the
       head of Litigation could not see it. They are now server-backed like
       every other module. */
    if (key === "police" || key === "inspections") {
      const rest = String(path || "").split("/").filter(Boolean).slice(2).join("/");
      return html`<${NativeModule} mkey=${key} id=${rest ? decodeURIComponent(rest) : null} />`;
    }
    /* REFUND CLAIMS — matters on the litigation trackers that were never filed
       in any court. Their own register, so the court book counts court cases. */
    if (key === "refundClaims") return html`<${RefundClaims} />`;
    if (key === "spend") return html`<${LegalSpendPage} />`;
    if (key === "report") return html`<${LitigationReportPage} />`;
    if (key === "assetRecovery") {
      const rest = String(path || "").split("/").filter(Boolean).slice(2).join("/");
      return html`<${AssetRecovery} id=${rest ? decodeURIComponent(rest) : null} />`;
    }
    if (key === "ip") {
      const rest = String(path || "").split("/").filter(Boolean).slice(2).join("/");
      return html`<${IpPortfolio} id=${rest ? decodeURIComponent(rest) : null} />`;
    }
    if (key === "developerDisputes") {
      /* `id` from the router is the segment after /m, which IS the module key
         here -- passing it through opened the detail view for a record called
         "developerDisputes" and every visit landed on "Not in the tracker".
         The record id is the segment after the key, or nothing. */
      const rest = String(path || "").split("/").filter(Boolean).slice(2).join("/");
      return html`<${DeveloperDisputes} id=${rest ? decodeURIComponent(rest) : null} />`;
    }
    return MODULE_LIVE_KEYS.has(key)
      ? html`<${ModuleLive} mkey=${key} />`
      : html`<${ModulePage} id=${id} path=${path} />`;
  },
  "/my-tasks": WorkspaceHub, // legal ICs land here → Legal Requests sub-tab of the workspace
  "/triage": Triage,
  "/raise": Raise,
  "/my-requests": WorkspaceHub, // retired nav entry; alias keeps old links working
  "/costs": Costs,
  "/calendar": CalendarPage,
  "/playbooks": Playbooks,
  // The old Operational Dashboard address renders the merged Dashboard.
  "/dashboard": Exec,
  "/team": TeamDashboard,
  "/me": MyDashboard,
  "/workspace": WorkspaceHub,
  "/project-wise": WorkspaceHub,
  "/tracker": Tracker,
  "/projects": Projects,
  "/access": Access,
  "/datahealth": DataHealth,
  // Shared full-page record detail for every non-contract Legal record:
  // /rec/<kind>/<id> (licence, loan, resolution, property, notice, litigation).
  "/rec": function RecRoute({ path }) {
    const parts = String(path || "").split("/").filter(Boolean); // ["rec", kind, id...]
    return html`<${RecordWorkspace} kind=${parts[1]} id=${decodeURIComponent(parts.slice(2).join("/"))} />`;
  },
  /* The Commercial -> Legal intake. One route for the register, one for a
     request; the request renders as a wizard or a review view depending on
     whose it is right now. */
  "/contract-requests": function CrfRoute({ path }) {
    const rest = String(path || "").split("/").filter(Boolean).slice(1).join("/");
    return rest ? html`<${ContractRequest} id=${decodeURIComponent(rest)} />` : html`<${ContractRequests} />`;
  },
  /* INTAKE & REPOSITORY IS GONE (§28). It was a five-step OCR pipeline over an
     EMPTY collection: a wizard that scanned nothing, extracted nothing and
     filed nothing, sitting at the top of the shared surfaces. The executed
     contract corpus it claimed to hold is the contract register, which is
     where the address now lands. */
  "/repository": function RetiredRepository() {
    useEffect(() => { redirect("/contracts"); }, []);
    return html`<div class="page fade-in"><div class="tiny muted" style="padding:22px 2px">Opening the contracts repository…</div></div>`;
  },
  "/analyzer": Analyzer,
  "/assistant": Assistant,
  "/pipelines": Pipelines,
  "/portal": Portal,
  "/requests": WorkspaceHub,
  /* MATTERS IS RETIRED (§3). A "matter" was a generic container beside the
     real operational modules — the same piece of work, filed twice, under a
     word that named no source, no register and no owning team. Work lives in
     the module that owns it and in the Legal Workspace that lists it. The
     address still resolves so nothing anybody saved breaks. */
  "/matters": function RetiredMatters({ id }) {
    useEffect(() => { redirect(id ? "/workspace/" + encodeURIComponent(id) : "/workspace"); }, [id]);
    return html`<div class="page fade-in"><div class="tiny muted" style="padding:22px 2px">Opening the Legal Workspace…</div></div>`;
  },
  "/contracts": Contracts,
  "/reviews": Reviews,
  "/approvals": Approvals,
  "/negotiations": Negotiations,
  "/templates": Templates,
  "/clauses": Clauses,
  "/drafting": Drafting,
  "/login": Login,
  "/knowledge": Knowledge,
  "/g": GroupHub,
  "/litigation": Litigation,
  "/compliance": Compliance,
  "/reports": Reports,
  /* THE COPILOT WORKSPACE IS RETIRED (§99).
     It was a full page promising six capabilities — draft, review, compare
     versions, assess risk, search the knowledge base, recommend an approver —
     over an empty answer table. Every prompt, including its own six examples,
     returned one sentence: "I have live context across the contract book, open
     matters, the clause library and your playbooks. I can draft, review,
     compare, assess risk, or recommend the next action." It could do none of
     them, and the grounding line underneath counted "matters", a concept this
     product removed.

     The Assistant is the real thing: it answers from record fields, says which
     registers it read and how much of each, and refuses to guess at what a
     document says. The address still resolves so nothing anybody saved
     breaks. */
  "/copilot": function RetiredCopilot() {
    useEffect(() => { redirect("/assistant"); }, []);
    return html`<div class="page fade-in"><div class="tiny muted" style="padding:22px 2px">Opening the assistant…</div></div>`;
  },
  "/automation": Automation,
  "/organization": Organization,
  "/settings": Settings,
  "/licenses": MovedToCompliance,   // one licence surface: the compliance register
  "/companies": Companies,
};

// Legal Workspace is now ONE surface for the legal team, hosting two sub-tabs:
//   • Current Work   — the worklist (workspace.js)
//   • Legal Requests — the request board / queue (requests.js)
// The tabs are path-driven so each is deep-linkable and the browser's back/
// forward buttons work: "Current Work" is /workspace, "Legal Requests" is
// /requests (also reached via the legacy /my-tasks and /my-requests landings).
//
// A business requester is unchanged: they have one surface — their own requests
// — with no worklist and no tabs. And a deep-linked workspace record
// (/workspace/<id>) opens that record directly, not the tabbed hub.
function WorkspaceHub({ id, path }) {
  const me = useActiveUser();
  if (!isLegal(me)) return html`<${MyRequests} />`;
  if (id) return html`<${Workspace} id=${id} />`;
  const base = "/" + (String(path || "").split("?")[0].split("/").filter(Boolean)[0] || "");
  /* THREE VIEWS, ONE SURFACE (§17). Each is its own address, so it is
     deep-linkable and the browser's Back button steps between them. */
  const TABS = [
    { id: "work", label: "Current Work", icon: "layers", path: "/workspace" },
    { id: "project", label: "Project Wise", icon: "grid", path: "/project-wise" },
    { id: "requests", label: "Legal Requests", icon: "inbox", path: "/requests" },
  ];
  const on = base === "/project-wise" ? "project"
    : (base === "/requests" || base === "/my-tasks" || base === "/my-requests") ? "requests" : "work";
  return html`<div class="wshub">
    <div class="wshub__tabs" role="tablist">
      ${TABS.map((t) => html`<button key=${t.id} role="tab" aria-selected=${on === t.id}
        class=${"wshub__tab" + (on === t.id ? " on" : "")}
        onClick=${() => navigate(t.path)}><${Icon} name=${t.icon} size=15 /> ${t.label}</button>`)}
    </div>
    <div class="wshub__body">
      ${on === "requests" ? html`<${Requests} key="req" />`
        : on === "project" ? html`<${ProjectWise} key="pw" />`
        : html`<${Workspace} key="ws" />`}
    </div>
  </div>`;
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
  /* THE DASHBOARDS ARE NOT A PRIVILEGE BOUNDARY, THEY ARE A ROUTING RULE.
     Each role has exactly ONE dashboard, so the Director opening /me was told
     "this page is not available for Director Legal — ask the Legal Director if
     you need it": the product telling the head of the department to ask
     herself for permission she already has. A refused dashboard says which one
     is yours; everything else keeps the escalation. */
  const DASHBOARDS = { "/me": "My Dashboard", "/team": "Team Dashboard", "/exec": "the executive dashboard" };
  const here = String(path || "").split("?")[0].replace(/\/+$/, "");
  const home = landingFor(me);
  const text = DASHBOARDS[here] && isLegal(me)
    ? `Each role has one dashboard, and ${DASHBOARDS[here]} is not yours — yours is ${DASHBOARDS[home] || home}.`
    : isLegal(me)
      ? (me.rbac === "head"
        ? `This page is not available for ${me.role || "your role"}.`
        : `This page is not available for ${me.role || "your role"}. Ask the Legal Director if you need it.`)
      : "This area is internal to the Legal department. From your home you can raise a legal request and follow your own requests end to end.";
  return html`<div class="page">
    ${/* A ROUTING RULE IS NOT A LOCKED DOOR. "You do not have access to this
          page" over "yours is the executive dashboard" reads as a permission
          failure for something that is simply somebody else's screen. */ ""}
    <${Empty} icon=${DASHBOARDS[here] ? "star" : "lock"}
      title=${DASHBOARDS[here] ? "That is another role's dashboard" : "You do not have access to this page"}
      text=${text} />
    <div class="row" style="justify-content:center;margin-top:14px">
      <${Btn} onClick=${() => navigate(home)}>${DASHBOARDS[here] ? "Open my dashboard" : "Back to my home"}</${Btn}>
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

/* PERMISSION FIRST, THEN THE REQUEST.
   The Commercial contracts register is fetched only for an account that can
   open Commercial. This runs from inside the app, keyed on the signed-in
   identity, because the entitlement is not knowable at module load: boot
   happens on the login screen, where there is no user yet.

   `canOpenPath` is the same engine the nav and direct-URL refusal already use,
   so no second security model is introduced here, and the server's own 403
   stays exactly where it is -- the client simply stops asking for a module it
   is not entitled to. */
/* One sweep per tab — see the note inside. */
let remindersSwept = false;
function HydrateWhenEntitled() {
  const me = useActiveUser();
  useEffect(() => {
    if (!me || !me.id) return;
    try { if (canOpenPath(me, "/contracts")) hydrateContracts(); } catch (e) { /* never block render */ }
    /* THE DATED OBLIGATIONS RAISE THEMSELVES (§54/§70).
       Both reminder engines are DERIVED and IDEMPOTENT: the state of the
       records decides what is due, every time they are asked, and the
       notification id is (recipient, kind, record, date), so raising the same
       thing twice writes one row. That is what makes this safe to do on
       sign-in rather than needing a scheduler this deployment does not have.
       ONCE PER TAB, AND AFTER THE PAGE HAS PAINTED. The compliance sweep
       rebuilds the loan, spend and licence models; firing it on every identity
       change put three model builds in front of whatever the person was
       actually trying to open, and a statutory page that rendered in two
       seconds took six. The server throttles it as well, because a burst of
       sign-ins is the same sweep however many tabs ask for it. */
    if (!remindersSwept) {
      remindersSwept = true;
      setTimeout(() => {
        try {
          if (canOpenPath(me, "/litigation")) api.litigation.raiseReminders().catch(() => {});
        } catch (e) { /* a reminder that cannot be raised must never break a page */ }
        try {
          if (canOpenPath(me, "/compliance")) api.compliance.raiseReminders().catch(() => {});
        } catch (e) { /* likewise */ }
      }, 4000);
    }
  }, [me && me.id, me && me.permissions]);
  return null;
}

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
  return html`<${Shell} path=${path}><${HydrateWhenEntitled} /><${Page} id=${id} path=${path} key=${effBase} /></${Shell}>`;
}

// Section 5.2 / 7.2 / 9 / 12 — renewal triggers, reminder buckets and SLA-breach
// notifications are system-generated. One idempotent sweep per boot.
try { runOrgSweeps(); } catch (e) {}

// Session maintenance: revalidate the server session on boot, every few
// minutes, and on tab focus; a dead session drops back to the sign-in screen.
try { startSessionWatch(); } catch (e) {}

// A bare URL renders the landing route, so put that route in the address bar too:
// the URL should always say where you are, which matters when a link or a
// screenshot gets passed around. replaceState so this adds no history entry.
// Section 11 — the landing route is role-aware: legal staff land on My Tasks,
// management on the executive overview, business users on Raise Request.
if (!window.location.hash) {
  try { window.history.replaceState(null, "", "#" + landingFor(activeUser())); } catch (e) {}
}

clearTimeout(window.__legalos_boot);
// Pull the contracts register out of Drive and into the store. It is fired once
// at boot and deliberately NOT awaited: the app renders immediately from its
// seed data and the real records swap in when they arrive, so a slow Drive read
// can never hold up first paint. A failure leaves the seeds in place.
/* The contracts register is pulled in from <App>, once a real signed-in
   identity exists -- see hydrateWhenEntitled below. Firing it here ran at the
   LOGIN screen, before anyone was signed in, so the default identity passed
   the entitlement check, the module latched `hydrated`, and a Compliance-only
   account was left with a 403 it could never retry past. */

// Pull the server-held request intake in. This is what makes the requester
// portal real on every screen: a request raised by the business at
// /legalos/portal/ is on the server, so it appears in the legal team's Triage
// queue here rather than only in the raiser's own browser. Not awaited — the
// queue fills in as soon as it lands.
try { hydrateRequests(); } catch (e) {}
try { hydrateConfigProposals(); } catch (e) {}
try { hydrateNotifications(); } catch (e) {}

createRoot(document.getElementById("root")).render(html`<${App} />`);
