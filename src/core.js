// Core runtime — React + htm, no build step.
import React from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

// React (unlike Preact) requires `style` to be an object, not a string.
// This app is authored with string styles for ergonomics, so we transparently
// convert them at element-creation time.
function toStyleObject(str) {
  const obj = {};
  const decls = str.split(";");
  for (let i = 0; i < decls.length; i++) {
    const decl = decls[i];
    const c = decl.indexOf(":");
    if (c === -1) continue;
    let key = decl.slice(0, c).trim();
    const val = decl.slice(c + 1).trim();
    if (!key || !val) continue;
    if (!key.startsWith("--")) key = key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    obj[key] = val;
  }
  return obj;
}

function h(type, props, ...children) {
  if (props) {
    let p = props;
    let cloned = false;
    const clone = () => { if (!cloned) { p = Object.assign({}, props); cloned = true; } };
    // string style -> object
    if (typeof props.style === "string") { clone(); p.style = toStyleObject(props.style); }
    // class -> className (React); htmlFor
    if (props.class !== undefined && props.className === undefined) { clone(); p.className = props.class; delete p.class; }
    if (props.for !== undefined && props.htmlFor === undefined) { clone(); p.htmlFor = props.for; delete p.for; }
    props = p;
  }
  return React.createElement(type, props, ...children);
}

export const html = htm.bind(h);
export { React, createRoot };

export const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useLayoutEffect,
  createContext,
  useContext,
  Fragment,
} = React;

// tiny classnames helper
export function cx(...args) {
  return args
    .flat()
    .filter(Boolean)
    .filter((x) => typeof x === "string")
    .join(" ");
}

// number / currency formatting
export const fmt = {
  money(n, currency = "USD") {
    if (n == null) return "—";
    const abs = Math.abs(n);
    let val, suffix = "";
    if (abs >= 1e9) { val = n / 1e9; suffix = "B"; }
    else if (abs >= 1e6) { val = n / 1e6; suffix = "M"; }
    else if (abs >= 1e3) { val = n / 1e3; suffix = "K"; }
    else val = n;
    const sym = { USD: "$", EUR: "€", GBP: "£", SAR: "﷼", AED: "د.إ", PKR: "₨" }[currency] || "$";
    const num = suffix ? val.toFixed(val < 10 && suffix ? 1 : 1) : val.toLocaleString();
    return `${sym}${num}${suffix}`;
  },
  moneyFull(n, currency = "USD") {
    const sym = { USD: "$", EUR: "€", GBP: "£", SAR: "SAR ", AED: "AED ", PKR: "PKR " }[currency] || "$";
    return sym + (n || 0).toLocaleString();
  },
  num(n) { return (n || 0).toLocaleString(); },
  pct(n) { return `${n > 0 ? "+" : ""}${n}%`; },
  date(d) {
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  },
  dateShort(d) {
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  },
  rel(d) {
    const dt = typeof d === "string" ? new Date(d) : d;
    const diff = Date.now() - dt.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d ago`;
    return fmt.dateShort(dt);
  },
  until(d) {
    const dt = typeof d === "string" ? new Date(d) : d;
    const diff = dt.getTime() - Date.now();
    const days = Math.round(diff / 86400000);
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days < 30) return `in ${days}d`;
    return fmt.dateShort(dt);
  },
  initials(name) {
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  },
};

// deterministic color from a string (for avatars)
const PALETTE = ["#0d7a3f","#10935a","#0891b2","#059669","#d97706","#db2777","#7c3aed","#1d6cb0","#dc2626","#65a30d","#c026d3","#ea580c"];
export function colorFor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
