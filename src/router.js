// Minimal hash router.
import { useState, useEffect } from "./core.js";

export function currentPath() {
  const h = window.location.hash.replace(/^#/, "");
  return h || "/dashboard";
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

// path like "/matters/MAT-508" -> { base:"/matters", id:"MAT-508" }
export function parsePath(path) {
  const parts = path.split("/").filter(Boolean);
  return { base: "/" + (parts[0] || "dashboard"), id: parts[1] || null, sub: parts[2] || null };
}
