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
  // PKR is the default because every register in this system is Pakistani: the
  // contract book, litigation exposure, loans and property values all come out
  // of PKR trackers. Defaulting to USD rendered the whole portfolio with a "$"
  // in front of rupee figures — "$947.0M" for PKR 947M. Anything genuinely in
  // another currency passes it explicitly.
  money(n, currency = "PKR") {
    if (n == null) return "—";
    const abs = Math.abs(n);
    let val, suffix = "";
    if (abs >= 1e9) { val = n / 1e9; suffix = "B"; }
    else if (abs >= 1e6) { val = n / 1e6; suffix = "M"; }
    else if (abs >= 1e3) { val = n / 1e3; suffix = "K"; }
    else val = n;
    // ISO codes for the regional currencies: the ﷼ and د.إ glyphs are RTL and
    // get visually reordered mid-string ("118.0﷼M"), which misreads badly in
    // dense value columns. Matches moneyFull below.
    const sym = { USD: "$", EUR: "€", GBP: "£", SAR: "SAR ", AED: "AED ", PKR: "PKR " }[currency] || "PKR ";
    const num = suffix ? val.toFixed(val < 10 && suffix ? 1 : 1) : val.toLocaleString();
    return `${sym}${num}${suffix}`;
  },
  moneyFull(n, currency = "PKR") {
    const sym = { USD: "$", EUR: "€", GBP: "£", SAR: "SAR ", AED: "AED ", PKR: "PKR " }[currency] || "PKR ";
    return sym + (n || 0).toLocaleString();
  },
  num(n) { return (n || 0).toLocaleString(); },
  pct(n) { return `${n > 0 ? "+" : ""}${n}%`; },
  date(d) {
    // Real register records legitimately lack dates — render a dash, never crash.
    if (d == null) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!(dt instanceof Date) || isNaN(dt)) return "—";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  },
  dateShort(d) {
    // Real register records legitimately lack dates — render a dash, never crash.
    if (d == null) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!(dt instanceof Date) || isNaN(dt)) return "—";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  },
  rel(d) {
    // Real register records legitimately lack dates — render a dash, never crash.
    if (d == null) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!(dt instanceof Date) || isNaN(dt)) return "—";
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
    // Same guard as date/dateShort/rel. Without it a tracker cell that reads
    // "N/A" -- and several genuinely do -- rendered "NaNd overdue" on a record
    // page, which looks like a date the system has and has got wrong.
    if (d == null || d === "") return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (!(dt instanceof Date) || isNaN(dt)) return "—";
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
// Avatar/series colours. Every one is dark enough for WHITE initials to clear
// 4.5:1 on it — five of the originals sat between 3.7:1 and 4.4:1, which made
// avatar initials hard to read at 10px.
const PALETTE = ["#0d7a3f","#0f8753","#07809d","#04855d","#b16105","#db2777","#7c3aed","#1d6cb0","#dc2626","#4f800a","#c026d3","#c74b0a"];
export function colorFor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
