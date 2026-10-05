// Compliance addressing: ONE parser, used by the router AND the breadcrumb.
//
// They used to parse the path separately, and that is precisely how the module
// broke. A register row navigated to the singular segment,
// `/compliance/loan/LON-0RRG5T4`; the router asked `complianceModule("loan")`,
// got null, fell through to its last branch and rendered the OVERVIEW; the
// breadcrumb did its own split and rendered the raw segment, "> loan". So the
// address bar said one thing, the crumb said another, and the page showed a
// third. Nothing threw, so nothing caught it.
//
// Now there is one grammar and one function that reads it. If the router and the
// crumb ever disagree again it is because this file is wrong, not because two
// files drifted.
//
//   /compliance                                   overview
//   /compliance/<module>                          register
//   /compliance/<module>/<recordId>               record
//   /compliance/resolutions/entity/<entityKey>    an entity's resolutions
//   /compliance/sec-filings/entity/<entityKey>    an entity's filing history
//   /compliance/sec-filings/year/<yearId>         one statutory year
//   /compliance/document/<fileId>                 one document, full view
//
// Anything else is `unknown` — and unknown renders a not-found, never the
// overview. Silently redirecting an unrecognised child route to the dashboard is
// what hid this bug for a whole build.
import { useState, useEffect } from "./core.js";
import { navigate, currentQuery, currentPath } from "./router.js";
import { complianceModule, resolveModule, MODULE_ALIASES } from "./compliancemodules.js";

const seg = (path, i) => {
  const parts = String(path || "").split("?")[0].split("/").filter(Boolean);
  return parts[i] == null ? null : decodeURIComponent(parts[i]);
};

export function parseCompliancePath(path) {
  const a = seg(path, 1), b = seg(path, 2), c = seg(path, 3);

  if (!a) return { kind: "overview" };

  if (a === "document") {
    return b ? { kind: "document", fileId: b } : { kind: "unknown", path };
  }

  const key = MODULE_ALIASES[String(a).toLowerCase()];
  const mod = key ? complianceModule(key) : resolveModule(a);
  if (!mod) return { kind: "unknown", path, segment: a };

  // The singular spellings still resolve, but they redirect: a link somebody
  // copies out of the address bar should be the canonical one.
  const canonical = key === String(a).toLowerCase() ? null
    : mod.path + (b ? "/" + encodeURIComponent(b) : "") + (c ? "/" + encodeURIComponent(c) : "");

  if (!b) return { kind: "register", mod, canonical };

  if (b === "entity" && (mod.key === "resolutions" || mod.key === "sec-filings")) {
    return c ? { kind: "entity", mod, entityKey: c, canonical } : { kind: "unknown", path };
  }
  if (b === "year" && mod.key === "sec-filings") {
    return c ? { kind: "year", mod, yearId: c, canonical } : { kind: "unknown", path };
  }
  // A third segment under a record is not an address this module defines.
  if (c) return { kind: "unknown", path };

  return { kind: "record", mod, recordId: b, canonical };
}

/* ------------------------------------------------------- return-to-register */

/* Opening a record carries the register's own state along in `from=`, so Back
   lands on the SAME filtered, searched, sorted register rather than a bare one.
   It rides in the URL rather than in memory because that is the only version
   that survives a refresh, a pasted link and a browser Back. */
export function openRecord(path, extra) {
  const qs = Object.entries(currentQuery() || {})
    .filter(([k]) => k !== "from")
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
    .join("&");
  const params = { ...(extra || {}) };
  if (qs) params.from = qs;
  const tail = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
  navigate(path + (tail ? "?" + tail : ""));
}

/* A record tab is part of the address, so "open this loan's Documents" is a
   link, a refresh keeps the tab you were on, and the Docs chip in a register can
   land you directly on the document list instead of the record's front page. */
export function useRecordTab(defaultTab, query, patch) {
  const tab = (query && query.tab) || defaultTab;
  return [tab, (id) => patch({ tab: id === defaultTab ? null : id }, { replace: true })];
}

/* Where Back goes from a record. The register it came from, wearing the filters
   it was wearing — or the plain register when the record was reached by a
   pasted link, which is the honest fallback rather than a guess. */
export function registerReturnPath(mod, query) {
  const from = query && query.from;
  return mod.path + (from ? "?" + from : "");
}

export function backToRegister(mod, query) {
  navigate(registerReturnPath(mod, query));
}

/* -------------------------------------------------------------- breadcrumbs */

/* The crumb trail for any compliance address. `leaf` is what the page knows and
   the URL does not — a loan's borrower, a document's filename — so the trail can
   read "Loans > Zameen Venture One" instead of "Loans > LON-0RRG5T4".
   Returns [{label, path|null}]; the last entry has no path. */
export function complianceCrumbs(path, leaf, query) {
  const r = parseCompliancePath(path);
  const root = { label: "Compliance & Licences", path: "/compliance" };
  const reg = r.mod ? { label: r.mod.label, path: registerReturnPath(r.mod, query) } : null;

  if (r.kind === "overview") return [{ label: root.label, path: null }];
  if (r.kind === "register") return [root, { label: r.mod.label, path: null }];
  if (r.kind === "record") return [root, reg, { label: leaf || r.recordId, path: null }];
  if (r.kind === "entity") {
    return [root, reg, { label: leaf || r.entityKey, path: null }];
  }
  if (r.kind === "year") return [root, reg, { label: leaf || r.yearId, path: null }];
  if (r.kind === "document") return [root, { label: "Document", path: null }, { label: leaf || r.fileId, path: null }];
  return [root, { label: "Not found", path: null }];
}

/* ------------------------------------------------------------- crumb leaves */

/* The URL can only carry a KEY. "zameen venture one" is what the API needs and
   exactly not what a person should read at the end of a breadcrumb — but the
   page that fetched the record is the only thing that knows its real name, and
   the topbar renders before that fetch returns.
 *
 * So a page publishes its leaf label once it has one, and the crumb picks it up.
 * It is keyed by path, so a stale label from the previous record can never be
 * shown against this one — the crumb falls back to the key rather than lying.
 * A record id (LON-0RRG5T4) is already the right leaf and publishes nothing. */
let LEAF = { path: null, label: null };
const LEAF_EVENT = "legalos:crumbleaf";

export function setCrumbLeaf(label) {
  const path = currentPath();
  if (LEAF.path === path && LEAF.label === label) return;
  LEAF = { path, label: label || null };
  try { window.dispatchEvent(new CustomEvent(LEAF_EVENT)); } catch (e) { /* no window in a test harness */ }
}

/* Publish `label` as this page's crumb leaf for as long as the page is mounted. */
export function usePublishCrumbLeaf(label) {
  useEffect(() => {
    if (label) setCrumbLeaf(label);
  }, [label]);
}

export function useCrumbLeaf(path) {
  const read = () => (LEAF.path === path ? LEAF.label : null);
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    on();
    window.addEventListener(LEAF_EVENT, on);
    window.addEventListener("hashchange", on);
    return () => { window.removeEventListener(LEAF_EVENT, on); window.removeEventListener("hashchange", on); };
  }, [path]);
  return v;
}
