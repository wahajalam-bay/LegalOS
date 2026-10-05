// Tiny toast system — action feedback for every mutation in the OS.
// Module-level observable (same pattern as the tour): no context providers,
// works from any event handler including outside React.
import { html, cx, useState, useEffect } from "./core.js";
import { Icon } from "./icons.js";

let _items = [];
let _subs = new Set();
let _seq = 0;
const notify = () => _subs.forEach((fn) => fn(_items));

const dismiss = (id) => { _items = _items.filter((t) => t.id !== id); notify(); };

// opts.action = { label, onClick } puts one affordance in the toast — used by
// removals, where the fastest possible undo is the whole point. A toast that
// carries an action lingers longer, because the reader has to decide.
export function toast(msg, tone = "success", icon, opts = {}) {
  const id = ++_seq;
  const action = opts && opts.action && opts.action.label ? opts.action : null;
  _items = [..._items, { id, msg, tone, action, icon: icon || { success: "checkcircle", error: "alertTriangle", info: "bell" }[tone] || "checkcircle" }];
  notify();
  setTimeout(() => dismiss(id), action ? 9000 : 3600);
  return id;
}

export function ToastHost() {
  const [items, setItems] = useState(_items);
  useEffect(() => {
    const fn = (v) => setItems([...v]);
    _subs.add(fn);
    return () => _subs.delete(fn);
  }, []);
  if (!items.length) return null;
  return html`<div class="toasts">
    ${items.map((t) => html`<div key=${t.id} class=${cx("toast", "toast--" + t.tone, t.action && "toast--action")}>
      <${Icon} name=${t.icon} size=15 />
      <span>${t.msg}</span>
      ${t.action && html`<button type="button" class="toast__action" onClick=${async () => {
        dismiss(t.id);
        try { await t.action.onClick(); } catch (e) { toast(String((e && e.message) || e), "error"); }
      }}>${t.action.label}</button>`}
    </div>`)}
  </div>`;
}
