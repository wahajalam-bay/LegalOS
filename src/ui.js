// UI primitives — the LegalOS component kit.
import { html, React, cx, fmt, colorFor, useState, useEffect, useRef } from "./core.js";
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
  return html`<div class=${cx("card card--pad metric", onClick && "card--hover clickable")} onClick=${onClick}>
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
  </div>`;
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
  "Approved": "green", "Executed": "green", "Active": "green", "Completed": "green", "Signed": "green",
  "Rejected": "red", "On Hold": "gray", "Blocked": "red", "Overdue": "red",
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
export function Tabs({ tabs, active, onChange }) {
  return html`<div class="tabs">
    ${tabs.map((t) => html`<div key=${t.key} class=${cx("tab", active === t.key && "active")} onClick=${() => onChange(t.key)}>
      ${t.icon && html`<${Icon} name=${t.icon} size=15 />`}${t.label}
      ${t.count != null && html`<span class="count">${t.count}</span>`}
    </div>`)}
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
export function Input(props) { return html`<input class="input" ...${props} />`; }
export function Textarea(props) { return html`<textarea class="textarea" ...${props}></textarea>`; }
export function SearchInput({ value, onChange, placeholder = "Search…" }) {
  return html`<div class="inputgroup"><${Icon} name="search" size=15 /><input class="input" value=${value} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)} /></div>`;
}
export function Toggle({ on, onChange }) {
  return html`<button class=${cx("toggle", on && "on")} onClick=${() => onChange(!on)} aria-pressed=${on}></button>`;
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
  return html`<div class="empty"><${Icon} name=${icon} size=40 stroke=1.5 /><div class="strong" style="color:var(--text-2);font-size:15px;margin-bottom:4px">${title}</div><div>${text}</div>${action && html`<div style="margin-top:16px">${action}</div>`}</div>`;
}

/* ---------- Modal ---------- */
export function Modal({ title, icon, children, footer, onClose, width = 560 }) {
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
export function Dropdown({ trigger, children, align = "right", width = 210, drop = "down" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  // A trigger anchored at the bottom of the viewport (e.g. the sidebar user
  // switcher) must open UPWARD, or the menu falls off the bottom edge.
  const vpos = drop === "up" ? "bottom:calc(100% + 6px)" : "top:calc(100% + 6px)";
  return html`<div ref=${ref} style="position:relative">
    <div onClick=${() => setOpen((o) => !o)}>${trigger}</div>
    ${open && html`<div class="menu" style=${`position:absolute;${vpos};${align}:0;width:${width}px;max-height:70vh;overflow-y:auto;z-index:60`} onClick=${() => setOpen(false)}>${children}</div>`}
  </div>`;
}
export function MenuItem({ icon, danger, children, onClick }) {
  return html`<div class=${cx("menu__item", danger && "danger")} onClick=${onClick}>${icon && html`<${Icon} name=${icon} size=15 />`}${children}</div>`;
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
