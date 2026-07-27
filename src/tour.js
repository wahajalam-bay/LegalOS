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
  {
    route: "/exec",
    target: ".exec__heroes",
    title: "One page, the whole function",
    caption: "This is the legal department in four numbers: what it looks after, how fast it moves, how much of the work now comes through one door, and how much of the waiting was never legal's.",
  },
  {
    route: "/flow-map",
    target: ".journey",
    title: "Every request travels this path",
    caption: "Nine stages from a business request to a filed contract. The counts are live, so this is not a diagram of intent, it is where the work actually is right now.",
  },
  {
    route: "/portal",
    target: ".grid--kpi",
    title: "The business has its own front door",
    caption: "Requests come in through a separate application built for the business. They see their own requests and nothing else. No more email, no more chasing.",
    aside: "The portal is a second app at /portal/. Open it in another tab to see the requester's side.",
  },
  {
    route: "/workspace/REQ-2050",
    target: ".zonenav",
    title: "One record, the whole story",
    caption: "Input, process, output and relationships on a single record. You can see who is holding it right now, what it is waiting on, and everything it touches.",
    fallback: { route: "/workspace", target: ".table" },
  },
  {
    route: "/workspace/REQ-2050",
    target: "#zone-process .tatstrip",
    title: "Turnaround is fixed, and enforced",
    caption: "The clock is set automatically from the type of work and its risk, and it pauses when the ball is not with legal. When something is late, the system names the stage and the person.",
    scrollTo: "#zone-process",
    fallback: { route: "/workspace", target: ".table" },
  },
  {
    route: "/tracker",
    target: ".grid--kpi",
    title: "Every contract in one grid",
    caption: "Value, expiry, the renewal notice window, the Drive link and the shelf the paper copy sits on. Editable in place, and every row opens its full history.",
  },
  {
    route: "/analyzer",
    target: ".card",
    title: "The numbers are read, not typed",
    caption: "Property purchase values, land values and licence types are extracted from the documents themselves, so the portfolio view is a by-product of filing rather than a data-entry job.",
  },
  {
    route: "/pipelines",
    target: ".tabs",
    title: "Nothing expires quietly",
    caption: "Each lawyer has their own pipeline, the department has a load balance, and every renewal and notice window has a reminder against a named owner.",
  },
  {
    route: "/exec",
    target: ".exec__note",
    title: "That is the whole loop",
    caption: "A business request becomes a governed contract, filed and watched, with a record of who held it and for how long. The brief on this page is the one-pager to forward.",
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
      if (step.route && currentPath() !== step.route) navigate(step.route);
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
