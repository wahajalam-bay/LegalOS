// LegalOS entry point.
import { html, createRoot } from "./core.js";
import { useRoute, parsePath } from "./router.js";
import { Shell } from "./layout.js";
import { Empty } from "./ui.js";

import Dashboard from "./pages/dashboard.js";
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

const ROUTES = {
  "/dashboard": Dashboard,
  "/requests": Requests,
  "/matters": Matters,
  "/contracts": Contracts,
  "/reviews": Reviews,
  "/approvals": Approvals,
  "/negotiations": Negotiations,
  "/templates": Templates,
  "/clauses": Clauses,
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

function NotFound() {
  return html`<div class="page"><${Empty} icon="search" title="Page not found" text="This module isn't available yet." /></div>`;
}

function App() {
  const [path] = useRoute();
  const { base, id } = parsePath(path);
  const Page = ROUTES[base] || NotFound;
  return html`<${Shell} path=${path}><${Page} id=${id} path=${path} key=${base} /></${Shell}>`;
}

clearTimeout(window.__legalos_boot);
createRoot(document.getElementById("root")).render(html`<${App} />`);
