// The Compliance modules, declared once.
//
// Routing, the sidebar, the breadcrumb and the Overview dashboard all read this
// list, so a module cannot exist in the navigation but not in the router, or
// carry one name in the menu and another in the crumb.
//
// Each module is its OWN PAGE at its own address. They are deliberately not tabs
// on the Overview: six major registers do not belong behind a horizontal strip,
// and mixing a dashboard with the operational registers it links to makes both
// worse. Overview is the dashboard; a module page is the register.
export const COMPLIANCE_MODULES = [
  {
    key: "loans", label: "Loans", icon: "dollar", path: "/compliance/loans",
    api: "loans", field: "loans", ns: "loan", detail: true,
    noun: ["loan agreement", "loan agreements"],
  },
  {
    key: "leases", label: "Leases", icon: "building", path: "/compliance/leases",
    api: "leases", field: "leases", ns: "lease", detail: true,
    noun: ["lease", "leases"],
  },
  {
    /* SPEND AGREEMENTS, not "Service Agreements". The tracker's own Agreement
       Type column splits this estate into service contracts, maintenance,
       supply, consultancy and a long tail -- calling the register after one of
       them made the other types look misfiled. Leases keep their own register
       because a lease is worked differently; everything else the group PAYS
       under is here. */
    key: "services", label: "Spend Agreements", icon: "settings", path: "/compliance/services",
    api: "services", field: "services", ns: "svc", detail: true,
    noun: ["spend agreement", "spend agreements"],
  },
  {
    key: "resolutions", label: "Resolutions", icon: "checksquare", path: "/compliance/resolutions",
    api: "resolutions", field: "native", ns: "res", detail: false,
    noun: ["resolution", "resolutions"],
  },
  {
    key: "licenses", label: "Licences & Permits", icon: "fileCheck", path: "/compliance/licenses",
    api: "licences", field: "licences", ns: "lic", detail: true,
    noun: ["licence", "licences"],
  },
  {
    key: "sec-filings", label: "SECP Filings", icon: "book", path: "/compliance/sec-filings",
    api: "secp", field: null, ns: "secp", detail: false,
    noun: ["filing", "filings"],
  },
];

export const complianceModule = (key) => COMPLIANCE_MODULES.find((m) => m.key === key) || null;

/* Every spelling of a module that has ever been navigated to, mapped to the one
 * canonical key.
 *
 * This is the bug that made the whole module feel broken: the registers sent a
 * row click to the SINGULAR segment -- /compliance/loan/LON-0RRG5T4 -- while the
 * router only knew the plural keys. `complianceModule("loan")` returned null, so
 * the router fell through to its last branch and rendered the OVERVIEW. The
 * address bar showed the record, the breadcrumb showed "> loan", and the page
 * showed the dashboard. Nothing errored, which is why it survived: the existing
 * end-to-end test navigated by URL instead of clicking a row, so it only ever
 * exercised the plural form.
 *
 * Both spellings resolve now, and the singular one redirects to the canonical
 * address so a shared link is always the good one. */
export const MODULE_ALIASES = {
  loan: "loans", loans: "loans",
  lease: "leases", leases: "leases",
  service: "services", services: "services",
  "service-agreement": "services", "service-agreements": "services",
  resolution: "resolutions", resolutions: "resolutions",
  licence: "licenses", licences: "licenses",
  license: "licenses", licenses: "licenses",
  "sec-filings": "sec-filings", secp: "sec-filings", filing: "sec-filings", filings: "sec-filings",
};

/* Resolve any module segment, canonical or legacy, to its module. */
export const resolveModule = (seg) => complianceModule(MODULE_ALIASES[String(seg || "").toLowerCase()] || "");

/* Is this segment a module under a different name than the canonical one? The
 * router uses this to redirect rather than render, so the URL people copy is
 * always the canonical one. */
export const isAliasSegment = (seg) => {
  const k = String(seg || "").toLowerCase();
  return !!MODULE_ALIASES[k] && MODULE_ALIASES[k] !== k;
};

// The old tabbed workspace addressed modules with ?view=<key>. Those links are
// in saved views, bookmarks and dashboards, so they resolve to the module page
// rather than breaking.
export const VIEW_TO_MODULE = {
  loans: "loans",
  leases: "leases",
  services: "services",
  resolutions: "resolutions",
  licences: "licenses",
  licenses: "licenses",
  secp: "sec-filings",
};

/* Is this record's status an ACTIVE one?
 *
 * `/active/i` matches "Inactive" — the substring is right there — so the naive
 * test reported 87 of 91 leases active when most of them are inactive and 68
 * have an end date in the past. Statuses in the spend trackers include
 * "Active", "Inactive", "Inactive/Ceased", "Terminated", "N/I", "Novated to
 * Medallion" and "Active/In renewel Process", so the negative has to be checked
 * first. */
export function isActiveStatus(status) {
  const s = String(status || "");
  if (!s.trim()) return false;
  if (/\binactive\b|\bnot active\b|\bceased\b|\bterminat/i.test(s)) return false;
  return /\bactive\b/i.test(s);
}


/* ============================================================
   COMPLIANCE HEALTH — the four states, defined once (§55).
   ============================================================

   The Overview used to lead each book with "87% clear". That is a ratio
   dressed as a rating: it tells a compliance lawyer nothing they can act on,
   it is not a figure any regulator recognises, and it hid the only question
   that matters — WHICH records, and what is wrong with them.

   These are the states the work is actually in. Every one of them is a count
   somebody can open, and the definition lives HERE so the Overview, the
   dashboard and each register cannot drift into meaning different things by
   "delayed".
*/
export const COMPLIANCE_STATES = [
  { key: "onTime", label: "On time", tone: "green",
    definition: "In force, and nothing falls due inside the next 90 days." },
  { key: "delayed", label: "Delayed", tone: "amber",
    definition: "Something is due inside 90 days, or an internal step is outstanding — a signature, an SBP registration, a filing to Drive." },
  { key: "rectified", label: "Rectified", tone: "blue",
    definition: "It lapsed and was put right: a renewal is evidenced on file after the expiry that preceded it." },
  { key: "expired", label: "Expired / not renewed", tone: "red",
    definition: "Past its date with no renewal evidenced." },
];
export const COMPLIANCE_STATE = Object.fromEntries(COMPLIANCE_STATES.map((s) => [s.key, s]));
