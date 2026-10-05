// Cross-page drill-down.
//
// Dashboards, the exec view, the org tree and the flow map all say "show me
// THESE records" and hand over to a register. That used to work by writing the
// legacy filter object into module-scoped state (or localStorage) and letting
// the destination pick it up — invisible, unlinkable, and impossible to get back
// to with the Back button.
//
// Now a drill-down is a URL. One translation lives here: the old dimension names
// map onto the register field keys, ids resolve to the names the filters
// actually hold, and `navigate` writes them into the hash. The destination needs
// no special case — it just reads its filters like any other visit.
import { navigate } from "./router.js";
import { nameOf, entityName } from "./data.js";

// legacy dimension -> register field key
const FIELD = {
  statuses: "status",
  tatStatuses: "tat",
  risks: "risk",
  categories: "category",
  contractTypes: "ctype",
  departments: "dept",
  cities: "city",
  stages: "stage",
};

/* Build the query for a register namespace from legacy-shaped filters.
   `owners` and `entities` arrive as ids; the filters hold display names, because
   that is what the option list shows and what a shared link should read as. */
export function drillQuery(ns, filters) {
  const q = {};
  const put = (key, vals) => {
    const list = [].concat(vals).filter((v) => v != null && v !== "");
    if (list.length) q[ns + "_" + key] = list.join("|");
  };
  for (const [k, v] of Object.entries(filters || {})) {
    if (v == null || (Array.isArray(v) && !v.length)) continue;
    if (k === "q") { if (v) q[ns + "_q"] = v; continue; }
    if (k === "owners") { put("owner", [].concat(v).map((id) => nameOf(id)).filter(Boolean)); continue; }
    if (k === "entities") { put("entity", [].concat(v).map((id) => entityName(id) || id).filter(Boolean)); continue; }
    // `subdivisions` has no equivalent on the new registers — the field does not
    // exist on these records, so it is dropped rather than silently ignored in a
    // filter that would match nothing.
    if (k === "subdivisions") continue;
    const nk = FIELD[k];
    if (nk) put(nk, v);
  }
  return q;
}

export function drillTo(path, ns, filters) {
  navigate(path, drillQuery(ns, filters));
}
