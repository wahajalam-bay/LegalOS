// UI primitives — the LegalOS component kit.
import { html, React, cx, fmt, colorFor, useState, useEffect, useRef, useMemo, useLayoutEffect } from "./core.js";
import { Icon } from "./icons.js";

/* ---------- Button ---------- */
export function Btn({ variant = "ghost", size, icon, iconRight, children, className, ...rest }) {
  return html`<button class=${cx("btn", `btn--${variant}`, size && `btn--${size}`, !children && "btn--icon", className)} ...${rest}>
    ${icon && html`<${Icon} name=${icon} size=${size === "sm" ? 14 : 16} />`}
    ${children}
    ${iconRight && html`<${Icon} name=${iconRight} size=${size === "sm" ? 14 : 16} />`}
  </button>`;
}

/* ---------- Card + Section ---------- */
export function Card({ hover, pad, className, children, ...rest }) {
  return html`<div class=${cx("card", hover && "card--hover", pad && "card--pad", className)} ...${rest}>${children}</div>`;
}

export function Section({ title, sub, icon, actions, right, className, bodyClass, children, noBody }) {
  return html`<div class=${cx("card", className)}>
    ${title && html`<div class="card__head">
      ${icon && html`<div class="cmdk__ico" style="width:28px;height:28px;border-radius:8px"><${Icon} name=${icon} size=15 /></div>`}
      <div style="min-width:0">
        <div class="card__title">${title}</div>
        ${sub && html`<div class="card__sub">${sub}</div>`}
      </div>
      ${(actions || right) && html`<div class="card__actions">${right || actions}</div>`}
    </div>`}
    ${noBody ? children : html`<div class=${cx("card__body", bodyClass)}>${children}</div>`}
  </div>`;
}

/* ---------- Metric ---------- */
export function Metric({ label, value, icon, tone = "blue", trend, trendDir, foot, onClick }) {
  const toneMap = {
    blue: ["var(--brand-soft)", "var(--brand)"],
    green: ["var(--success-bg)", "var(--success)"],
    amber: ["var(--warning-bg)", "var(--warning)"],
    red: ["var(--danger-bg)", "var(--danger)"],
    purple: ["var(--accent-soft)", "var(--accent-500)"],
  }[tone] || ["var(--brand-soft)", "var(--brand)"];
  // When it does something, it is a button; when it is just a figure, it stays a
  // div so screen readers are not told there is an action that does not exist.
  const Tag = onClick ? "button" : "div";
  return html`<${Tag} type=${onClick ? "button" : undefined}
    class=${cx("card card--pad metric", onClick && "card--hover clickable metricbtn")} onClick=${onClick}>
    <div class="metric__top">
      <div class="metric__icon" style=${`background:${toneMap[0]};color:${toneMap[1]}`}><${Icon} name=${icon} size=18 /></div>
      <div class="metric__label">${label}</div>
      ${trend != null && html`<div class="spacer"></div>
        <div class=${cx("trend", trendDir === "up" ? "trend--up" : trendDir === "down" ? "trend--down" : "trend--flat")}>
          <${Icon} name=${trendDir === "up" ? "trendingUp" : trendDir === "down" ? "trendingDown" : "minus"} size=12 />${trend}
        </div>`}
    </div>
    <div class="metric__value">${value}</div>
    ${foot && html`<div class="metric__foot">${foot}</div>`}
  </${Tag}>`;
}

/* ---------- Pill / Status ---------- */
export function Pill({ tone = "gray", dot, children, className }) {
  return html`<span class=${cx("pill", `pill--${tone}`, className)}>${dot && html`<span class="pill__dot"></span>`}${children}</span>`;
}

const STATUS_MAP = {
  // requests / matters
  "New": "blue", "Intake": "blue", "Triage": "purple",
  "In Review": "amber", "Under Review": "amber", "Legal Review": "amber", "Business Review": "amber",
  "Drafting": "purple", "Negotiation": "amber", "In Negotiation": "amber",
  "Pending Approval": "amber", "Approval": "amber", "Awaiting Signature": "indigo",
  "Approved": "green", "Executed": "green", "Active": "green", "Completed": "green", "Signed": "green", "Delivered": "green", "Categorised": "purple",
  "Rejected": "red", "On Hold": "amber", "Blocked": "red", "Overdue": "red",
  "Awaiting External": "purple", "Substantively Complete": "indigo",
  "Renewal": "indigo", "Expiring": "amber", "Expired": "red", "Terminated": "gray", "Archived": "gray",
  "Open": "blue", "Closed": "green", "Escalated": "red", "Draft": "gray",
  "Compliant": "green", "At Risk": "amber", "Non-Compliant": "red",
};
export function Status({ value }) {
  return html`<${Pill} tone=${STATUS_MAP[value] || "gray"} dot=${true}>${value}</${Pill}>`;
}

/* ---------- Risk ---------- */
export function Risk({ level }) {
  const l = (level || "").toLowerCase();
  const label = level ? level[0].toUpperCase() + level.slice(1) : "—";
  return html`<span class=${cx("risk", `risk--${l}`)}><span class="risk__bar"></span>${label}</span>`;
}

/* ---------- Priority ---------- */
export function Priority({ level }) {
  const map = { urgent: ["urgent", "arrowUp"], high: ["high", "arrowUp"], medium: ["med", "minus"], low: ["low", "arrowDown"] };
  const [cls, ic] = map[(level || "medium").toLowerCase()] || map.medium;
  return html`<span class=${cx("prio", `prio--${cls}`)}><${Icon} name=${ic} size=13 />${level ? level[0].toUpperCase() + level.slice(1) : "Medium"}</span>`;
}

/* ---------- Avatar ---------- */
export function Avatar({ name = "?", size = "md", color }) {
  const bg = color || colorFor(name);
  return html`<span class=${cx("avatar", `avatar--${size}`)} style=${`background:${bg}`} title=${name}>${fmt.initials(name)}</span>`;
}
export function AvatarStack({ names = [], max = 4, size = "sm" }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return html`<div class="avatar-stack">
    ${shown.map((n) => html`<${Avatar} key=${n} name=${n} size=${size} />`)}
    ${extra > 0 && html`<span class=${cx("avatar", `avatar--${size}`)} style="background:var(--surface-3);color:var(--text-2)">+${extra}</span>`}
  </div>`;
}

/* ---------- Tabs ---------- */
// `variant="pills"` renders the tabs as rounded filter buttons that wrap onto a
// second line rather than crushing long labels — used where there are many
// options with long names (e.g. the contract category row).
/* A tab strip. Real <button>s in a tablist with a roving tabindex and arrow-key
   navigation — these were clickable <div>s, so every tabbed surface in the app
   (record detail, settings, access, data health) was mouse-only. */
export function Tabs({ tabs, active, onChange, variant, ariaLabel }) {
  const ref = useRef(null);
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.key === active);
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n == null) return;
    e.preventDefault();
    onChange(tabs[n].key);
    const el = ref.current && ref.current.querySelectorAll('[role="tab"]')[n];
    if (el) el.focus();
  };
  return html`<div class=${cx("tabs", variant === "pills" && "tabs--pills")}
      role="tablist" aria-label=${ariaLabel || undefined} ref=${ref} onKeyDown=${onKeyDown}>
    ${tabs.map((t) => html`<button type="button" key=${t.key} role="tab"
      aria-selected=${active === t.key ? "true" : "false"}
      tabIndex=${active === t.key ? 0 : -1}
      class=${cx("tab", active === t.key && "active")} onClick=${() => onChange(t.key)}>
      ${t.icon && html`<${Icon} name=${t.icon} size=15 />`}<span class="tab__label">${t.label}</span>
      ${t.count != null && html`<span class="count">${t.count}</span>`}
    </button>`)}
  </div>`;
}

/* ---------- Segmented ---------- */
export function Segmented({ options, value, onChange }) {
  return html`<div class="segmented">
    ${options.map((o) => html`<button key=${o.value} class=${cx(value === o.value && "active")} onClick=${() => onChange(o.value)}>
      ${o.icon && html`<${Icon} name=${o.icon} size=14 />`}${o.label}
    </button>`)}
  </div>`;
}

/* ---------- Form ---------- */
export function Field({ label, hint, children }) {
  return html`<label class="field">${label && html`<span class="field__label">${label}</span>`}${children}${hint && html`<span class="field__hint">${hint}</span>`}</label>`;
}
/* DATES ARE WRITTEN AND READ AS DD/MM/YYYY.
 *
 * A native <input type="date"> renders in the BROWSER's locale, not the
 * document's: the same form showed 01/30/2026 to a reader in a US-locale Chrome
 * and 30/01/2026 to the person sitting next to them. On a legal register that
 * is not cosmetic -- 01/03 is either January or March depending on whose laptop
 * you are looking at, and a notice deadline read two months wrong is a missed
 * deadline. No attribute controls it, so this is a real field.
 *
 * WHAT IT IS AND IS NOT. What a user types and reads is DD/MM/YYYY, always.
 * What the field emits and receives is unchanged: the ISO yyyy-mm-dd string
 * every caller already stores, handed over as `e.target.value` so existing
 * handlers keep working untouched. The browser's own calendar is still one
 * click away, and what the calendar returns is displayed the same way.
 *
 * A partial entry emits nothing. Clearing the box emits "". Half a date is not
 * a date, and writing one away as the user types the third digit is how a
 * field ends up storing the 3rd of a month nobody chose.
 */
const pad2 = (n) => String(n).padStart(2, "0");
const isoToDmy = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
};
/* A real date, not merely four digits that parse. new Date("31/02/2026") is
   happily the 3rd of March; a register that accepts it records a day that did
   not exist. */
const dmyToIso = (t) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(t || "").trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || y < 1000) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return y + "-" + pad2(mo) + "-" + pad2(d);
};
// Digits only, re-slashed as they are typed, so the shape is never in doubt.
const maskDmy = (t) => {
  const d = String(t || "").replace(/[^\d]/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return d.slice(0, 2) + "/" + d.slice(2);
  return d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
};

export function DateInput({ value, onInput, onChange, id, disabled, ...rest }) {
  const [text, setText] = useState(isoToDmy(value));
  const [focused, setFocused] = useState(false);
  const picker = useRef(null);
  // While the box has focus its text is the user's; outside that the record wins,
  // so a value set elsewhere (a reset, a load) shows up here.
  useEffect(() => { if (!focused) setText(isoToDmy(value)); }, [value, focused]);

  const emit = (iso) => {
    const e = { target: { value: iso } };
    if (onInput) onInput(e);
    if (onChange) onChange(e);
  };
  const type = (raw) => {
    const t = maskDmy(raw);
    setText(t);
    if (t === "") { emit(""); return; }
    const iso = dmyToIso(t);
    if (iso) emit(iso);          // a complete, real date — nothing else is written
  };
  return html`<div class=${cx("dateinput", disabled && "dateinput--off")}>
    <input class="input" type="text" inputMode="numeric" id=${id} disabled=${disabled}
      placeholder="dd/mm/yyyy" maxLength=${10} value=${text} ...${rest}
      onFocus=${() => setFocused(true)}
      onBlur=${() => { setFocused(false); setText(isoToDmy(value)); }}
      onInput=${(e) => type(e.target.value)} />
    ${/* The browser's calendar, kept -- it is the fastest way to pick a date
          far from today. It is off-screen rather than styled, because a native
          date input cannot be made to render dd/mm/yyyy. */ ""}
    <input ref=${picker} type="date" class="dateinput__picker" tabIndex=${-1} aria-hidden="true"
      value=${/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : ""}
      onInput=${(e) => { setText(isoToDmy(e.target.value)); emit(e.target.value || ""); }} />
    <button type="button" class="dateinput__btn" disabled=${disabled}
      aria-label="Choose a date from the calendar"
      onClick=${() => {
    const el = picker.current;
    if (!el) return;
    if (el.showPicker) { try { el.showPicker(); return; } catch (err) { /* fall through */ } }
    el.focus(); el.click();
  }}><${Icon} name="calendar" size=15 /></button>
  </div>`;
}

export function Input(props) {
  // Every `<${Input} type="date">` in the app becomes the dd/mm/yyyy field
  // without its caller changing, which is most of them.
  if (props && props.type === "date") {
    const { type, ...rest } = props;
    return html`<${DateInput} ...${rest} />`;
  }
  return html`<input class="input" ...${props} />`;
}
export function Textarea(props) { return html`<textarea class="textarea" ...${props}></textarea>`; }
export function SearchInput({ value, onChange, placeholder = "Search…" }) {
  return html`<div class="inputgroup"><${Icon} name="search" size=15 /><input class="input" value=${value} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)} /></div>`;
}
export function Toggle({ on, onChange, disabled, label }) {
  // `disabled` is honoured so a surface with no backing engine can present a
  // switch that visibly cannot be flipped, rather than one that flips and does
  // nothing. `label` is the accessible name: the control renders no text, so
  // without one it announces as an anonymous button.
  return html`<button type="button" class=${cx("toggle", on && "on", disabled && "toggle--disabled")} disabled=${!!disabled}
    onClick=${disabled ? undefined : () => onChange(!on)} aria-pressed=${on} aria-disabled=${!!disabled}
    aria-label=${label || (on ? "On" : "Off")}></button>`;
}
export function Chip({ active, icon, children, onClick }) {
  return html`<button class=${cx("chip", active && "active")} onClick=${onClick}>${icon && html`<${Icon} name=${icon} size=14 />`}${children}</button>`;
}

/* ---------- Progress ---------- */
export function Progress({ value = 0, max = 100, tone }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return html`<div class="progress"><div class=${cx("progress__fill", tone && `progress__fill--${tone}`)} style=${`width:${pct}%`}></div></div>`;
}

/* ---------- Stepper ---------- */
export function Stepper({ steps, current }) {
  return html`<div class="stepper">
    ${steps.map((s, i) => {
      const state = i < current ? "done" : i === current ? "active" : "";
      return html`<${React.Fragment} key=${s}>
        ${i > 0 && html`<div class=${cx("step__line", i <= current && "done")} style=${i <= current ? "background:var(--success)" : ""}></div>`}
        <div class=${cx("step", state && `step--${state}`)}>
          <div class="step__dot">${i < current ? html`<${Icon} name="check" size=13 />` : i + 1}</div>
          <div class="step__label">${s}</div>
        </div>
      </${React.Fragment}>`;
    })}
  </div>`;
}

/* ---------- Timeline ---------- */
export function Timeline({ items }) {
  return html`<div class="timeline">
    ${items.map((it, i) => html`<div class="tl__item" key=${i}>
      <div class=${cx("tl__dot", it.tone && `tl__dot--${it.tone}`)}></div>
      <div class="tl__title">${it.title}</div>
      <div class="tl__meta">${it.meta}</div>
    </div>`)}
  </div>`;
}

/* ---------- Empty ---------- */
export function Empty({ icon = "inbox", title, text, action }) {
  // The title is a heading. On a page whose whole body is an empty state (a
  // route a user is not entitled to, a register with nothing in it) it is the
  // only heading there is, and without it heading navigation finds nothing.
  return html`<div class="empty"><${Icon} name=${icon} size=40 stroke=1.5 /><h2 class="strong empty__title" style="color:var(--text-2);font-size:15px;margin:0 0 4px">${title}</h2><div>${text}</div>${action && html`<div style="margin-top:16px">${action}</div>`}</div>`;
}

/* ---------- Modal ---------- */
/* ONE LADDER OF MODAL WIDTHS (§103).
 *
 * Call sites asked for twenty-five different widths between 220 and 980 — 620
 * here, 640 there, 660 next door — so no two dialogs in the product were the
 * same size and none of it was a decision. The requested width is snapped to
 * the nearest rung, which fixes every existing call site without touching any
 * of them: a focused action is small, a form is medium, a workspace is large.
 *
 * A caller that genuinely needs an exact width passes `exactWidth`. There is
 * one such case today (the document viewer, which sizes to the page it shows).
 */
const MODAL_WIDTHS = [420, 560, 680, 820, 980];
const snapWidth = (w) => MODAL_WIDTHS.reduce((best, x) =>
  (Math.abs(x - w) < Math.abs(best - w) ? x : best), MODAL_WIDTHS[0]);

export function Modal({ title, icon, children, footer, onClose, width = 560, exactWidth }) {
  width = exactWidth || snapWidth(Number(width) || 560);
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return html`<div class="overlay" onClick=${onClose}>
    <div class="modal" style=${`width:${width}px`} onClick=${(e) => e.stopPropagation()}>
      <div class="modal__head">
        ${icon && html`<div class="cmdk__ico"><${Icon} name=${icon} size=16 /></div>`}
        <div class="modal__title">${title}</div>
        <div class="spacer"></div>
        <button class="iconbtn" onClick=${onClose}><${Icon} name="x" size=18 /></button>
      </div>
      <div class="modal__body">${children}</div>
      ${footer && html`<div class="modal__foot">${footer}</div>`}
    </div>
  </div>`;
}

/* ---------- Drawer ---------- */
export function Drawer({ title, children, onClose, width = 440, footer }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return html`<div class="overlay" style="padding:0;align-items:stretch;justify-content:flex-end" onClick=${onClose}>
    <div class="drawer" style=${`width:${width}px`} onClick=${(e) => e.stopPropagation()}>
      <div class="modal__head">
        <div class="modal__title" style="font-size:15px">${title}</div>
        <div class="spacer"></div>
        <button class="iconbtn" onClick=${onClose}><${Icon} name="x" size=18 /></button>
      </div>
      <div style="flex:1;overflow-y:auto">${children}</div>
      ${footer && html`<div class="modal__foot">${footer}</div>`}
    </div>
  </div>`;
}

/* ---------- Dropdown menu ---------- */
export function Dropdown({ trigger, children, align = "right", width = 210, drop = "down", label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btn = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    if (!open) return;
    // Escape closes and hands focus back to what opened it, so a keyboard user
    // is never dropped at the top of the document.
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); if (btn.current) btn.current.focus(); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [open]);
  // A trigger anchored at the bottom of the viewport (e.g. the sidebar user
  // switcher) must open UPWARD, or the menu falls off the bottom edge.
  const vpos = drop === "up" ? "bottom:calc(100% + 6px)" : "top:calc(100% + 6px)";
  /* The trigger is a <button>. It used to be a <div onClick>, which made every
     dropdown in the app — the workspace switcher, the user menu, every
     three-dot row menu — reachable only with a mouse. */
  return html`<div ref=${ref} style="position:relative">
    <button type="button" ref=${btn} class="ddtrigger"
      aria-haspopup="menu" aria-expanded=${open ? "true" : "false"} aria-label=${label || undefined}
      onClick=${() => setOpen((o) => !o)}>${trigger}</button>
    ${open && html`<div class="menu" role="menu" style=${`position:absolute;${vpos};${align}:0;width:${width}px;max-height:70vh;overflow-y:auto;z-index:60`} onClick=${() => setOpen(false)}>${children}</div>`}
  </div>`;
}
export function MenuItem({ icon, danger, children, onClick }) {
  // A menu entry is a command, so it is a button — a three-dot menu whose items
  // can only be clicked is unusable without a mouse.
  return html`<button type="button" role="menuitem" class=${cx("menu__item", danger && "danger")}
    onClick=${onClick}>${icon && html`<${Icon} name=${icon} size=15 />`}${children}</button>`;
}

/* ---------- AI insight card ---------- */
export function AICard({ title, children, action }) {
  return html`<div class="ai-card"><div class="ai-card__inner">
    <div class="row" style="margin-bottom:10px">
      <span class="ai-badge"><${Icon} name="sparkles" size=12 /> AI Insight</span>
      <div class="spacer"></div>
      ${action}
    </div>
    ${title && html`<div class="strong" style="font-size:14px;margin-bottom:6px">${title}</div>`}
    <div class="dim" style="font-size:13px;line-height:1.55">${children}</div>
  </div></div>`;
}

/* ---------- Comment ---------- */
export function Comment({ author, time, text }) {
  return html`<div class="comment">
    <${Avatar} name=${author} size="md" />
    <div class="comment__body">
      <div class="comment__head"><span class="comment__author">${author}</span><span class="comment__time">${time}</span></div>
      <div class="comment__bubble comment__text">${text}</div>
    </div>
  </div>`;
}

/* ---------- Picker: a searchable menu that cannot be clipped ----------------
   WHY THIS EXISTS RATHER THAN A <datalist>
   The wizard's option lists are real estate data -- 60 courts, 28 case
   categories, 87 entities -- and a <datalist> shows the browser's own filtered
   list without ever telling the user how many options exist, without keyboard
   highlighting we control, and, on several browsers, without opening at all on
   a plain click. A lawyer who cannot see that there ARE 60 courts types a 61st.

   WHY position: fixed
   `.modal` is `overflow: hidden` and `.modal__body` is `overflow-y: auto`, so
   an absolutely-positioned menu is clipped at the first field. Fixed escapes
   both. The subtlety worth writing down: `.overlay` sets `backdrop-filter`,
   which makes it the containing block for fixed descendants -- normally that
   would break fixed positioning, but the overlay is `inset: 0`, so its padding
   box IS the viewport and viewport coordinates from getBoundingClientRect land
   correctly. Give the overlay an offset and this must be revisited.

   Escape closes the MENU. The Modal listens for Escape on `window` to close
   itself, so the handler stops propagation while the menu is open; otherwise
   dismissing a dropdown would throw away the half-filled case behind it. */
export function Picker({
  value, onChange, options, placeholder, allowCustom = true, disabled,
  status = "ok", onRetry, describe, inputId,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [box, setBox] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const all = (options || [])
    .map((o) => (typeof o === "string" ? { name: o } : (o || {})))
    .filter((o) => o && o.name);

  const matches = useMemo(() => {
    const t = String(q || "").trim().toLowerCase();
    if (!t) return all;
    const starts = [], contains = [];
    for (const o of all) {
      const n = String(o.name).toLowerCase();
      const al = (o.aliases || []).join(" ").toLowerCase();
      if (n.startsWith(t)) starts.push(o);
      else if (n.includes(t) || (al && al.includes(t))) contains.push(o);
    }
    return starts.concat(contains);
  }, [q, options]);

  const place = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const drop = below > 200 || below > r.top;
    setBox({
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      width: Math.max(180, Math.min(r.width, window.innerWidth - 16)),
      top: drop ? r.bottom + 4 : null,
      bottom: drop ? null : window.innerHeight - r.top + 4,
      max: Math.max(140, (drop ? below : r.top) - 16),
    });
  };

  useLayoutEffect(() => { if (open) place(); }, [open, q]);
  useEffect(() => {
    if (!open) return;
    const re = () => place();
    window.addEventListener("resize", re);
    window.addEventListener("scroll", re, true);
    const away = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => {
      window.removeEventListener("resize", re);
      window.removeEventListener("scroll", re, true);
      document.removeEventListener("mousedown", away);
    };
  }, [open]);

  /* Keep the highlighted row in view when arrowing through 60 courts. */
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (name) => { onChange(name); setQ(""); setOpen(false); };

  const onKey = (e) => {
    if (e.key === "Escape") {
      if (open) { e.stopPropagation(); e.preventDefault(); setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      const n = matches.length + (customRow ? 1 : 0);
      if (!n) return;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
      return;
    }
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (customRow && active === matches.length) commit(String(q).trim());
      else if (matches[active]) commit(matches[active].name);
      return;
    }
    if (e.key === "Tab") setOpen(false);
  };

  const typed = String(q || "").trim();
  const customRow = allowCustom && typed && !all.some((o) => String(o.name).toLowerCase() === typed.toLowerCase());

  /* LOADING, EMPTY AND FAILED ARE THREE DIFFERENT SENTENCES.
     A count of zero is a claim about the business. It is never how an outage
     is allowed to look. */
  const foot = status === "loading" ? "Loading…"
    : status === "failed" ? "Could not load"
      : describe ? describe(all.length) : (all.length + " option" + (all.length === 1 ? "" : "s"));

  return html`<div class="picker" ref=${wrapRef}>
    <div class="picker__control">
      <input class="input" ref=${inputRef} id=${inputId} type="text" autocomplete="off"
        role="combobox" aria-expanded=${open ? "true" : "false"} aria-autocomplete="list"
        disabled=${disabled || status === "loading"}
        placeholder=${status === "loading" ? "Loading…" : status === "failed" ? "Unavailable" : (placeholder || "")}
        value=${open ? q : (value || "")}
        onFocus=${() => { setQ(""); setActive(0); setOpen(true); }}
        onClick=${() => { if (!open) { setQ(""); setActive(0); setOpen(true); } }}
        onInput=${(e) => { setQ(e.target.value); setActive(0); setOpen(true); if (allowCustom) onChange(e.target.value); }}
        onKeyDown=${onKey} />
      ${value && !disabled && status === "ok" && html`<button type="button" class="picker__clear" aria-label="Clear"
        onClick=${() => { onChange(""); setQ(""); inputRef.current && inputRef.current.focus(); }}>×</button>`}
      <button type="button" class="picker__caret" tabIndex=${-1} aria-label="Show options"
        disabled=${disabled || status !== "ok"}
        onClick=${() => { setQ(""); setActive(0); setOpen((o) => !o); inputRef.current && inputRef.current.focus(); }}>▾</button>
    </div>

    <div class=${"picker__foot" + (status === "failed" ? " picker__foot--err" : "")}>
      ${foot}
      ${status === "failed" && onRetry && html` <button type="button" class="picker__retry" onClick=${onRetry}>Retry</button>`}
    </div>

    ${open && box && html`<div class="picker__menu" role="listbox" ref=${listRef} style=${
      "left:" + box.left + "px;width:" + box.width + "px;max-height:" + Math.min(300, box.max) + "px;"
      + (box.top != null ? "top:" + box.top + "px;" : "bottom:" + box.bottom + "px;")}>
      ${matches.length === 0 && !customRow && html`<div class="picker__none">${
        all.length === 0 ? "No options available" : "Nothing matches “" + typed + "”"}</div>`}
      ${/* MOUSEDOWN COMMITS, AND SO DOES CLICK.
            `onMouseDown` with preventDefault is what stops the input losing
            focus before the selection registers, so it has to stay. But it was
            the ONLY way to choose an option: anything that dispatches an
            ordinary click — assistive technology, a browser extension, a test
            — moved the highlight and set nothing, and the form then refused to
            save for a field the user could see filled in. `commit` is
            idempotent, so the second event is a no-op on the value. */ ""}
      ${matches.map((o, i) => html`<div key=${o.name} role="option" aria-selected=${o.name === value}
        class=${"picker__opt" + (i === active ? " is-active" : "") + (o.name === value ? " is-chosen" : "")}
        onMouseEnter=${() => setActive(i)}
        onMouseDown=${(e) => { e.preventDefault(); commit(o.name); }}
        onClick=${(e) => { e.preventDefault(); commit(o.name); }}>
        <span class="picker__name">${o.name}</span>
        ${o.type && html`<span class="picker__meta">${o.type}</span>`}
        ${o.n > 0 && html`<span class="picker__n">${o.n}</span>`}
        ${o.canonical === false && html`<span class="picker__meta">not in registry</span>`}
      </div>`)}
      ${customRow && html`<div role="option" aria-selected=${false}
        class=${"picker__opt picker__opt--new" + (active === matches.length ? " is-active" : "")}
        onMouseEnter=${() => setActive(matches.length)}
        onMouseDown=${(e) => { e.preventDefault(); commit(typed); }}
        onClick=${(e) => { e.preventDefault(); commit(typed); }}>
        Use “${typed}” — new to the register
      </div>`}
    </div>`}
  </div>`;
}
