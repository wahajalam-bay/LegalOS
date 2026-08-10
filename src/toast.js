// Tiny toast system — action feedback for every mutation in the OS.
// Module-level observable (same pattern as the tour): no context providers,
// works from any event handler including outside React.
import { html, cx, useState, useEffect } from "./core.js";
import { Icon } from "./icons.js";

let _items = [];
let _subs = new Set();
let _seq = 0;
const notify = () => _subs.forEach((fn) => fn(_items));

export function toast(msg, tone = "success", icon) {
  const id = ++_seq;
  _items = [..._items, { id, msg, tone, icon: icon || { success: "checkcircle", error: "alertTriangle", info: "bell" }[tone] || "checkcircle" }];
  notify();
  setTimeout(() => {
    _items = _items.filter((t) => t.id !== id);
    notify();
  }, 3600);
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
    ${items.map((t) => html`<div key=${t.id} class=${cx("toast", "toast--" + t.tone)}>
      <${Icon} name=${t.icon} size=15 />
      <span>${t.msg}</span>
    </div>`)}
  </div>`;
}
