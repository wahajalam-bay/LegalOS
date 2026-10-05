// Feature 3 — deterministic overlap detection (no AI/fuzzy matching).
// An overlap = 2+ OPEN items (reviews / matters / negotiations) that share a
// company tag or the same underlying contract.
import { getCollection } from "./store.js";
import { REVIEWS } from "./data.js";

export function openItems() {
  const reviews = REVIEWS.filter((r) => r.status === "In Review").map((r) => ({ kind: "review", id: r.id, title: r.title, tags: r.companyTags || [], contract: r.contract || null, path: "/reviews" }));
  const matters = (getCollection("matters") || []).filter((m) => m.progress < 100).map((m) => ({ kind: "matter", id: m.id, title: m.title, tags: m.companyTags || [], contract: null, path: "/matters/" + m.id }));
  const negs = (getCollection("contracts") || []).filter((c) => c.status === "In Negotiation").map((c) => ({ kind: "negotiation", id: c.id, title: c.title, tags: c.companyTags || [], contract: c.id, path: "/negotiations" }));
  return [...reviews, ...matters, ...negs];
}

// [{ companyId, items:[...] }] — companies with 2+ open items touching them.
export function computeOverlaps() {
  const items = openItems();
  const byCompany = {};
  items.forEach((it) => (it.tags || []).forEach((t) => { (byCompany[t] = byCompany[t] || []).push(it); }));
  return Object.keys(byCompany)
    .filter((cid) => byCompany[cid].length >= 2)
    .map((cid) => ({ companyId: cid, items: byCompany[cid] }));
}

// Sibling open items overlapping a given review (deduped, excludes itself).
export function overlapItemsForReview(reviewId) {
  const map = new Map();
  computeOverlaps().forEach((o) => {
    if (!o.items.some((it) => it.kind === "review" && it.id === reviewId)) return;
    o.items.forEach((sib) => {
      if (sib.kind === "review" && sib.id === reviewId) return;
      map.set(sib.kind + sib.id, { ...sib, companyId: o.companyId });
    });
  });
  return [...map.values()];
}

// { reviewId: [siblingItems] } for fast per-row lookup on the Reviews list.
export function reviewOverlapMap() {
  const out = {};
  computeOverlaps().forEach((o) => {
    o.items.filter((it) => it.kind === "review").forEach((it) => {
      out[it.id] = out[it.id] || [];
      o.items.forEach((sib) => { if (!(sib.kind === "review" && sib.id === it.id)) out[it.id].push({ ...sib, companyId: o.companyId }); });
    });
  });
  return out;
}
