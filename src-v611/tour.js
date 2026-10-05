// SPRINT 5 / WORKSTREAM C — the guided tour.
//
// A CEO does not explore software, they are told a story. This drives the app for
// the viewer: nine steps, each one navigating, waiting for the target to exist,
// spotlighting it and captioning it in one sentence.
//
// No new dependency. The spotlight is a single positioned box with a very large
// outer box-shadow, which dims everything except the cutout. Navigation reuses the
// existing router.
//
// Data-safe by design: if a step's target is missing (an empty filter, a record
// that is not in this store) the step still shows its caption centred, so the
// narrative never dead-ends.
import { html, cx, useState, useEffect, useRef } from "./core.js";
import { Icon } from "./icons.js";
import { Btn } from "./ui.js";
import { navigate, currentPath } from "./router.js";
import { getCollection, createDraft } from "./store.js";
import { activeUser } from "./rbac.js";

// The draft-workspace stop needs a draft to stand on. Reuse one if it exists,
// otherwise assemble a demo NDA from the approved library (which is itself a
// demonstration of Module 3).
let _tourDraftId = null;
function ensureTourDraft() {
  const existing = (getCollection("drafts3") || [])[0];
  if (existing) return (_tourDraftId = existing.id);
  if (_tourDraftId) return _tourDraftId;
  const res = createDraft({ agreementType: "NDA", ourRole: "Customer", jurisdiction: "Saudi Arabia", features: [] }, activeUser().id);
  return (_tourDraftId = res.ok ? res.id : null);
}

/* ---------------- a tiny observable so any screen can start the tour ---------------- */
let _state = { open: false, step: 0 };
const _subs = new Set();
const _emit = () => _subs.forEach((f) => f());

export function startTour(at = 0) { _state = { open: true, step: at }; _emit(); }
export function stopTour() {
  _state = { open: false, step: 0 };
  try { localStorage.setItem("legalos-tour-seen", "1"); } catch (e) {}
  _emit();
}
export function tourSeen() {
  try { return localStorage.getItem("legalos-tour-seen") === "1"; } catch (e) { return false; }
}
function useTourState() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    _subs.add(f);
    return () => _subs.delete(f);
  }, []);
  return _state;
}

/* ---------------- the script ----------------
   Each step: where to go, what to highlight, and one sentence of narration.
   `prep` runs before navigating, for steps that need the destination narrowed. */
const STEPS = [
  /* ---------------- MODULE 1 — Request Intake & Management ---------------- */
  {
    route: "/triage",
    target: ".triage__panel",
    title: "Assisted triage, not automated",
    caption: "The system proposes the legal category, priority, SLA (from the category × urgency matrix, in business days per jurisdiction) and an assignee based on workload and past matters of this type. A human accepts in one click — or overrides, and every override is logged with its reason.",
  },
  {
    route: "/requests",
    target: ".kanban",
    title: "The pipeline is visible",
    caption: "Every request sits in a lane — New, Triage, Assigned, Review, Drafting, Negotiation, Approval. Nothing is invisible until it is urgent any more, and a request that needs deep work converts to a Module 2 matter without losing its identity.",
  },
  {
    route: "/workspace/REQ-2050",
    target: ".m1actions",
    title: "The lifecycle actually moves",
    caption: "Advance stage by stage, put the clock on hold when the ball leaves Legal (the SLA pauses automatically), escalate with a logged reason, reassign down the hierarchy, and close. Approval is value-gated: a Lead signs off within threshold, above it only the Director can.",
    scrollTo: "#zone-process",
    fallback: { route: "/workspace/REQ-2050", target: ".zonenav" },
  },
  {
    route: "/my-tasks",
    target: ".myapprovals",
    title: "Approvals land on the approver's plate",
    caption: "Matters at the Approval gate queue on the Director's My Tasks — escalated items first — and whoever sent the work up hears back the moment it is signed off. Requesters get acknowledgement, status-change and delivery notifications automatically.",
    fallback: { route: "/my-tasks", target: ".modkpis" },
  },

  /* ---------------- MODULE 2 — Matter Management ---------------- */
  {
    route: "/matters",
    target: ".statkpis",
    title: "Module 2 — the Matter is the permanent record",
    caption: "The whole portfolio: practice area, owner, status, risk, target and aging, with My Matters and work queues (needs action, overdue, awaiting external). New matters auto-route to the practice-area expert; the Director is notified and can reassign.",
  },
  {
    route: "/matters/DIS-2026-0012",
    target: ".pagehead",
    title: "One matter, everything attached",
    caption: "Owner and collaborators, a real lifecycle state machine (invalid moves blocked, reasons captured), likelihood × impact risk that the system proposes and a human confirms, tasks with single owners, documents, related matters — and closure is impossible without a structured outcome. Every change lands in an immutable audit trail.",
    aside: "This matter is PRIVILEGED: for anyone not named on it, it does not exist — not in the register, not in search, not in AI retrieval.",
    fallback: { route: "/matters", target: ".table" },
  },

  /* ---------------- MODULE 3 — Contract Intelligence ---------------- */
  {
    route: "/clauses",
    target: ".statkpis",
    title: "Module 3 — the clause library is the source of truth",
    caption: "Approved positions in three tiers — Preferred, Acceptable, Fallback — each with drafting notes and negotiation guidance. Changes travel Proposed → Manager Review → Director publish; old versions are superseded, never overwritten, so history holds.",
  },
  {
    route: "/drafting",
    target: ".statkpis",
    title: "Assembly before generation",
    caption: "A draft is assembled from the approved template structure and published library clauses — generation is used only for connective text, and it is always marked AI-SUGGESTED. This is not an AI contract generator; it is the department's own positions, applied.",
  },
  {
    route: () => "/drafting/" + ensureTourDraft(),
    target: ".draft3",
    title: "Every clause knows where it came from",
    caption: "Structure, document, and legal intelligence side by side. Click any clause: its library source, version, tier and negotiation guidance. Edit away from the library and the deviation is detected, risk-rated and routed for approval — nothing is deliverable until a named lawyer approves.",
    aside: "The jurisdiction banner never leaves the screen, and below-Fallback deviations need the Director.",
    fallback: { route: "/drafting", target: ".statkpis" },
  },
  {
    route: "/reviews",
    target: ".statkpis",
    title: "Counterparty paper gets a deviation report, not a summary",
    caption: "Upload their draft: clauses are identified with visible confidence, compared to the playbook, and returned as structured findings — their text, our position, the gap, the risk, a recommendation and a library-sourced redline. Where no approved position exists, the system says \"Source not found in LegalOS\" instead of inventing one.",
  },

  /* ---------------- the loop ---------------- */
  {
    route: "/exec",
    target: ".exec__heroes",
    title: "Request → Matter → Contract — one connected system",
    caption: "A plain-language request becomes a governed matter, drafted from approved positions, reviewed against the playbook, approved by name, and closed with an outcome that feeds the precedent the next lawyer retrieves. That is the institutional memory the department was missing.",
  },
];

export const TOUR_LENGTH = STEPS.length;

/* ---------------- geometry ---------------- */
const PAD = 8;
function rectOf(sel) {
  if (!sel) return null;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2, el };
}

// Wait for a selector to exist, with a ceiling so a missing target never hangs.
function waitFor(sel, ms = 1400) {
  return new Promise((resolve) => {
    if (!sel) return resolve(null);
    const t0 = Date.now();
    const tick = () => {
      const r = rectOf(sel);
      if (r) return resolve(r);
      if (Date.now() - t0 > ms) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/* ---------------- the overlay ---------------- */
export function TourOverlay() {
  const st = useTourState();
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const idx = Math.max(0, Math.min(st.step, STEPS.length - 1));
  const step = STEPS[idx];
  const liveRef = useRef(null);

  // Drive the app to the step's destination, then find the target.
  useEffect(() => {
    if (!st.open) return;
    let cancelled = false;
    setReady(false);
    setRect(null);

    (async () => {
      if (step.prep) { try { step.prep(); } catch (e) {} }
      // A route may be computed at run time (e.g. the seeded demo draft).
      let route = null;
      try { route = typeof step.route === "function" ? step.route() : step.route; } catch (e) {}
      if (route && currentPath() !== route) navigate(route);
      // Let the route mount before measuring.
      await new Promise((r) => setTimeout(r, 240));
      if (cancelled) return;

      let target = step.target;
      let r = await waitFor(target);

      // Data-safe: fall back to a route that definitely has content.
      if (!r && step.fallback) {
        navigate(step.fallback.route);
        await new Promise((res) => setTimeout(res, 260));
        if (cancelled) return;
        target = step.fallback.target;
        r = await waitFor(target);
      }

      if (cancelled) return;
      if (r) {
        const scrollSel = step.scrollTo || target;
        const el = document.querySelector(scrollSel);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          await new Promise((res) => setTimeout(res, 340));
        }
        if (cancelled) return;
        setRect(rectOf(target));
      }
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [st.open, idx]);

  // Keep the spotlight glued to the target while the page moves.
  useEffect(() => {
    if (!st.open || !ready) return;
    const sync = () => setRect((prev) => (prev ? rectOf(step.target) || prev : prev));
    const c = document.querySelector(".content");
    window.addEventListener("resize", sync);
    if (c) c.addEventListener("scroll", sync, { passive: true });
    return () => { window.removeEventListener("resize", sync); if (c) c.removeEventListener("scroll", sync); };
  }, [st.open, ready, idx]);

  // Keyboard control.
  useEffect(() => {
    if (!st.open) return;
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); stopTour(); }
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [st.open, idx]);

  if (!st.open) return null;

  const next = () => (idx >= STEPS.length - 1 ? stopTour() : startTour(idx + 1));
  const prev = () => startTour(Math.max(0, idx - 1));

  // Place the caption card near the target without covering it, and keep it on screen.
  const vw = window.innerWidth, vh = window.innerHeight;
  const CARD_W = Math.min(430, vw - 32);
  let cardStyle;
  if (rect) {
    const below = rect.top + rect.height + 16;
    const fitsBelow = below + 210 < vh;
    const top = fitsBelow ? below : Math.max(16, rect.top - 226);
    const left = Math.min(Math.max(16, rect.left), vw - CARD_W - 16);
    cardStyle = `top:${Math.round(top)}px;left:${Math.round(left)}px;width:${CARD_W}px`;
  } else {
    cardStyle = `top:50%;left:50%;transform:translate(-50%,-50%);width:${CARD_W}px`;
  }

  return html`<div class="tour" role="dialog" aria-modal="true" aria-label=${`Tour step ${idx + 1} of ${STEPS.length}`}>
    ${rect
      ? html`<div class="tour__spot" style=${`top:${Math.round(rect.top)}px;left:${Math.round(rect.left)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px`}></div>`
      : html`<div class="tour__scrim"></div>`}

    <div class="tour__card" style=${cardStyle} ref=${liveRef}>
      <div class="tour__top">
        <span class="tour__step">Step ${idx + 1} of ${STEPS.length}</span>
        <div class="spacer"></div>
        <button class="tour__x" onClick=${stopTour} aria-label="End the tour"><${Icon} name="x" size=16 /></button>
      </div>
      <div class="tour__title">${step.title}</div>
      <p class="tour__caption">${step.caption}</p>
      ${step.aside && html`<div class="tour__aside"><${Icon} name="alertCircle" size=14 /><span>${step.aside}</span></div>`}
      <div class="tour__bar">
        ${STEPS.map((s, i) => html`<span key=${i} class=${cx("tour__pip", i === idx && "on", i < idx && "done")}></span>`)}
      </div>
      <div class="tour__foot">
        <button class="tour__skip" onClick=${stopTour}>Skip the tour</button>
        <div class="spacer"></div>
        ${idx > 0 && html`<${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${prev}>Back</${Btn}>`}
        <${Btn} variant="primary" size="sm" iconRight=${idx >= STEPS.length - 1 ? "check" : "arrowRight"} onClick=${next}>
          ${idx >= STEPS.length - 1 ? "Finish" : "Next"}
        </${Btn}>
      </div>
      <div class="tour__hint">Use the arrow keys, or Escape to leave.</div>
    </div>
  </div>`;
}

/* ---------------- the persistent affordance ----------------
   Lives in the topbar rather than floating over the page: it is always reachable
   from every screen, and it never covers data the way a second floating button
   would. */
export function TourButton() {
  const st = useTourState();
  if (st.open) return null;
  return html`<button class="tourbtn" onClick=${() => startTour()} title="Take the guided tour">
    <${Icon} name="play" size=13 /><span class="tourbtn__t">Tour</span>
  </button>`;
}
