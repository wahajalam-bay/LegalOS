// Minimal hash router, with query-string state.
//
// The hash carries BOTH the route and its view state:
//
//     #/litigation?view=notices&status=Pending&risk=High,Critical
//
// Register filters live here rather than in component state so that a filtered
// register is a real address: the browser's back button steps through filter
// changes, a link pastes into chat with the filter intact, a refresh keeps what
// you were looking at, and a dashboard drill-down is just a link. `currentPath`
// deliberately strips the query so every existing route lookup, `parsePath`
// caller and layout highlight keeps working unchanged.
import { useState, useEffect } from "./core.js";

function rawHash() {
  return window.location.hash.replace(/^#/, "");
}

// Leadership lands on the executive overview; the operational dashboard keeps
// its own URL for the team that lives in it.
export function currentPath() {
  const h = rawHash().split("?")[0];
  return h || "/exec";
}

// The query half of the hash, as a plain object. Values are decoded; a repeated
// key keeps the last one. Empty string values are dropped so `?risk=` is the
// same as no filter at all.
export function currentQuery() {
  const qs = rawHash().split("?").slice(1).join("?");
  const out = {};
  if (!qs) return out;
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const k = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
    const v = i === -1 ? "" : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "));
    if (k && v !== "") out[k] = v;
  }
  return out;
}

function buildHash(path, query) {
  const parts = Object.entries(query || {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  return path + (parts.length ? "?" + parts.join("&") : "");
}

export function navigate(path, query) {
  const next = buildHash(path, query);
  // Writing the SAME hash fires no hashchange, so subscribers never re-run —
  // which stranded anyone signing in as the persona whose home is already the
  // current route (Director Legal lands on /exec, the boot route). The auth
  // state behind the route had changed even though the route had not, so nudge
  // the listeners explicitly.
  if (rawHash() === next) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = next;
}

/* Go somewhere WITHOUT adding a history entry.
   A redirect that pushes is a Back trap: an old address redirects to the new
   one, Back returns to the old address, and the old address redirects forward
   again — so Back does nothing, forever. Every automatic rewrite in this app
   (a moved route, a legacy ?view=, a singular alias) replaces instead. */
export function redirect(path, query) {
  const hash = "#" + buildHash(path, query);
  if (window.location.hash === hash) return;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.replace(hash);
  }
}

/* Replace the query on the CURRENT route.
   `replace: true` uses history.replaceState so a burst of filter edits (typing
   in a search box) does not bury the previous page under fifty history entries;
   a deliberate filter change uses a normal push so Back undoes exactly one. */
export function setQuery(next, { replace = false } = {}) {
  const hash = "#" + buildHash(currentPath(), next);
  if (window.location.hash === hash) return;
  if (replace && window.history && window.history.replaceState) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
}

/* Read the current query and merge patches into it. Passing null/"" for a key
   removes it, which is what "clear this filter" means. */
export function useQuery() {
  const [q, setQ] = useState(currentQuery);
  useEffect(() => {
    const onChange = () => setQ(currentQuery());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const patch = (changes, opts) => {
    const merged = { ...currentQuery() };
    for (const [k, v] of Object.entries(changes || {})) {
      if (v == null || v === "") delete merged[k];
      else merged[k] = String(v);
    }
    setQuery(merged, opts);
  };
  return [q, patch];
}

export function useRoute() {
  const [path, setPath] = useState(currentPath());
  // A same-route nudge (see navigate) carries no new path, so setPath alone would
  // be a no-op and React would skip the render. This tick always changes, so the
  // subscriber re-runs and re-reads state that moved behind an unchanged route.
  const [, tick] = useState(0);
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      tick((n) => n + 1);
      const c = document.querySelector(".content");
      if (c) c.scrollTop = 0;
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [path, navigate];
}

// path like "/matters/MAT-508/flow" -> { base:"/matters", id:"MAT-508", sub:"flow" }
// A query string is not part of the path and is stripped before splitting, so
// "/litigation?view=notices" is still the "/litigation" route.
export function parsePath(path) {
  const parts = String(path || "").split("?")[0].split("/").filter(Boolean);
  return { base: "/" + (parts[0] || "dashboard"), id: parts[1] || null, sub: parts[2] || null };
}
