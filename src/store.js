// Lightweight reactive store — shared, persisted collections so "create" works
// across the app without a backend. Seeds from data.js, persists to localStorage.
import { useState, useEffect } from "./core.js";
import { REQUESTS, MATTERS, CONTRACTS, LICENSES, COMPANIES, TEMPLATES } from "./data.js";

const LS_KEY = "legalos-store-v1";

// Fresh seed snapshot. New slices are added here; the merge below is
// backward-compatible so an existing (older-shape) localStorage never crashes.
function seed() {
  return {
    requests: [...REQUESTS],
    matters: [...MATTERS],
    contracts: [...CONTRACTS],
    licenses: [...LICENSES],
    companies: [...COMPANIES],
    templates: [...TEMPLATES],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// Defensive merge:
//  • missing slice  → seed it (this is how old stores gain new modules)
//  • present slice  → keep the user's records; for records that also exist in
//    the seed (by id), backfill any NEW fields the record predates (spend,
//    companyTags, category, rounds…). User-created records are left untouched.
//  • unknown slices the user had are preserved (forward-compat).
function mergeState(loaded) {
  const base = seed();
  if (!loaded || typeof loaded !== "object") return base;
  const out = {};
  for (const key of Object.keys(base)) {
    const slice = loaded[key];
    if (!Array.isArray(slice)) { out[key] = base[key]; continue; }
    const seedById = new Map(base[key].map((r) => [r && r.id, r]));
    out[key] = slice.map((rec) => {
      if (!rec || typeof rec !== "object") return rec;
      const s = seedById.get(rec.id);
      if (!s) return rec; // user-created record → as-is
      const merged = { ...rec };
      for (const f of Object.keys(s)) if (merged[f] === undefined) merged[f] = s[f];
      return merged;
    });
  }
  for (const key of Object.keys(loaded)) if (!(key in out)) out[key] = loaded[key];
  return out;
}

let state = mergeState(load());

const listeners = new Set();
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function emit() { listeners.forEach((l) => l()); persist(); }

export function addItem(name, item) { state = { ...state, [name]: [item, ...(state[name] || [])] }; emit(); }
export function updateItem(name, id, patch) {
  state = { ...state, [name]: (state[name] || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) };
  emit();
}
export function getCollection(name) { return state[name] || []; }
export function resetStore() { state = seed(); emit(); }

export function useCollection(name) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state[name] || [];
}

export function nextId(name, prefix) {
  const nums = (state[name] || [])
    .map((x) => parseInt(String(x.id).replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return prefix + (max + 1);
}

export const nowIso = () => new Date().toISOString();
export const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();
