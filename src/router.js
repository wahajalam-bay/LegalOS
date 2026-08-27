// Minimal hash router.
import { useState, useEffect } from "./core.js";

// Leadership lands on the executive overview; the operational dashboard keeps
// its own URL for the team that lives in it.
export function currentPath() {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/exec";
}

export function navigate(path) {
  // Writing the SAME hash fires no hashchange, so subscribers never re-run —
  // which stranded anyone signing in as the persona whose home is already the
  // current route (Director Legal lands on /exec, the boot route). The auth
  // state behind the route had changed even though the route had not, so nudge
  // the listeners explicitly.
  if (window.location.hash.replace(/^#/, "") === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = path;
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
export function parsePath(path) {
  const parts = path.split("/").filter(Boolean);
  return { base: "/" + (parts[0] || "dashboard"), id: parts[1] || null, sub: parts[2] || null };
}
