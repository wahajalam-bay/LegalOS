// Minimal hash router.
import { useState, useEffect } from "./core.js";

// Leadership lands on the executive overview; the operational dashboard keeps
// its own URL for the team that lives in it.
export function currentPath() {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/exec";
}

export function navigate(path) {
  window.location.hash = path;
}

export function useRoute() {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
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
