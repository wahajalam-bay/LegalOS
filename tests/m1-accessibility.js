// Keyboard and accessible-name sweep, per route, with evidence.
//
// The earlier UI pass reported "758 secondary clickables remain mouse-first"
// and called it a practical pass. That number is only useful if it is measured
// the same way every time and attributed to a route, so this suite:
//
//   1. classifies EVERY element that looks interactive on every main route,
//   2. names the ones a keyboard cannot reach, with their tag and class, so the
//      fix is a specific component rather than a global tabindex sprinkle,
//   3. checks icon-only controls actually have an accessible name,
//   4. drives the real keyboard: Tab into the filter bar, Space to toggle an
//      option, Escape to close, focus returns to the trigger,
//   5. checks focus is VISIBLE, not merely present.
//
// It is a measurement, not a WCAG certification, and it says so.
//
//   node tests/m1-accessibility.js
const puppeteer = require("./_puppeteer.js");
const { reap, freePort } = require("./_reap.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), P = require("path"), http = require("http");

const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
let PORT = process.env.LEGALOS_A11Y_PORT || "4801";
let B = `http://127.0.0.1:${PORT}`;
const USER = "maryam.haq@zameen.com";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};
const ping = () => new Promise((res) => {
  const r = http.get(B + "/api/health", (x) => { x.resume(); res(x.statusCode === 200); });
  r.on("error", () => res(false)); r.setTimeout(1200, () => { r.destroy(); res(false); });
});

const ROUTES = [
  "/exec", "/workspace", "/requests?rv=list", "/matters", "/contracts",
  "/litigation", "/m/notices",
  "/compliance", "/compliance/licenses", "/compliance/loans",
  "/compliance/resolutions?rview=all", "/compliance/leases",
  "/compliance/services", "/compliance/sec-filings",
  "/tracker", "/projects", "/knowledge", "/repository", "/templates", "/clauses",
  "/reports", "/costs", "/access", "/datahealth?tab=problems", "/organization",
  "/settings", "/companies", "/triage", "/approvals", "/reviews",
];

let SANDBOX = null, server = null;

/* Injected into the page: classify everything that looks interactive. */
const SCAN = function () {
  const NATIVE = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "OPTION", "LABEL"]);
  const focusable = (el) => {
    if (el.disabled) return false;
    if (el.tagName === "A") return el.hasAttribute("href");
    if (NATIVE.has(el.tagName)) return true;
    const ti = el.getAttribute("tabindex");
    return ti != null && +ti >= 0;
  };
  const out = { total: 0, native: 0, ariaFocusable: 0, containerWithChildActions: 0, mouseOnly: [], unnamed: [], roles: {} };
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    /* An aria-hidden subtree is explicitly not exposed to assistive technology.
       A decorative chart marked aria-hidden, whose drill-down is duplicated by
       a real button list beside it, is a mouse shortcut on a picture — not a
       control a keyboard user is missing. Counting the SVG arcs would report a
       barrier that the legend already removes. */
    if (el.closest("[aria-hidden='true']")) continue;
    const looksClickable = cs.cursor === "pointer";
    const isNative = NATIVE.has(el.tagName) && !(el.tagName === "A" && !el.hasAttribute("href"));
    /* Only INTERACTIVE roles make an element a control. A role="tablist",
       "tabpanel" or "group" is a container that describes structure; counting
       those as keyboard-unreachable controls inflates the number with elements
       that should never be focusable in the first place. */
    const INTERACTIVE_ROLES = new Set(["button", "link", "menuitem", "menuitemcheckbox", "menuitemradio",
      "tab", "checkbox", "radio", "switch", "option", "treeitem", "slider", "spinbutton", "combobox", "textbox", "searchbox"]);
    const hasRole = INTERACTIVE_ROLES.has(el.getAttribute("role"));
    if (!looksClickable && !isNative && !hasRole) continue;
    // A <label> wrapping a checkbox is the checkbox's own hit area, not a
    // separate control; the input inside it is what gets counted.
    if (el.tagName === "LABEL" && el.querySelector("input")) continue;
    // Containers that merely inherit the pointer cursor from a clickable
    // ancestor are not controls in their own right.
    if (!isNative && !hasRole && el.parentElement) {
      const pc = getComputedStyle(el.parentElement);
      if (pc.cursor === "pointer") continue;
    }
    out.total++;
    if (isNative) out.native++;
    else if (focusable(el)) out.ariaFocusable++;
    else if (el.querySelector("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")) {
      /* CONTAINER WITH CHILD ACTIONS. A card or row that is clickable as a
         mouse convenience but holds its own focusable controls is not a
         barrier: the keyboard path exists inside it. This is a disposition,
         not an excuse — the child control must do the same thing, which is why
         these are counted separately rather than ignored. */
      out.containerWithChildActions++;
    }
    else {
      out.mouseOnly.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).split(/\s+/).slice(0, 3).join(".")) || "",
        text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
      });
    }
    const r = el.getAttribute("role"); if (r) out.roles[r] = (out.roles[r] || 0) + 1;
    // Accessible name for anything that IS a control
    if (isNative || hasRole) {
      const name = (el.getAttribute("aria-label") || el.getAttribute("title") ||
        (el.getAttribute("aria-labelledby") ? "ref" : "") ||
        (el.innerText || "").trim() || el.getAttribute("alt") || el.getAttribute("placeholder") || "").trim();
      const isControl = el.tagName === "BUTTON" || el.getAttribute("role") === "button" ||
        (el.tagName === "A" && el.hasAttribute("href")) || el.tagName === "INPUT" || el.tagName === "SELECT";
      if (isControl && !name) {
        // an <input> named by a wrapping or associated <label> is fine
        if (el.tagName === "INPUT" || el.tagName === "SELECT") {
          const id = el.getAttribute("id");
          if (el.closest("label") || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`))) continue;
        }
        out.unnamed.push({ tag: el.tagName.toLowerCase(), cls: (String(el.className || "")).split(/\s+/).slice(0, 2).join("."), html: el.outerHTML.slice(0, 70) });
      }
    }
  }
  return out;
};

(async () => {
  /* A held port must not abort the suite: a suite that executes no checks
     is indistinguishable from a product failure. Report and relocate. */
  if (await ping()) {
    const moved = await freePort();
    console.error(`  HARNESS_PORT_IN_USE  port ${PORT} is held by another process — continuing on free port ${moved}`);
    PORT = moved;
    B = `http://127.0.0.1:${PORT}`;
  }
  SANDBOX = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-a11y-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "legalos/", P.join(__dirname, "..") + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(P.join(__dirname, "..", "node_modules"), P.join(SANDBOX, "node_modules"));
  const cfgPath = P.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = USER;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", USER], { cwd: SANDBOX, encoding: "utf8" });
  const PW = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server);   // stopped on every exit path, including a kill
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({ width: 1600, height: 1000 });
  await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(2000);
  await p.type('input[name="email"]', USER); await p.type('input[name="password"]', PW);
  await p.click('button[type="submit"]'); await w(4000);
  const signedIn = !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText));
  check("signed in", signedIn);
  if (!signedIn) return finish(b);

  /* ------------------------------------------------- per-route inventory -- */
  console.log("\n1. Interactive-element inventory, per route");
  const perRoute = [];
  let totals = { total: 0, native: 0, aria: 0, containers: 0, mouseOnly: 0, unnamed: 0 };
  const mouseOnlyIndex = new Map(), unnamedIndex = new Map();
  for (const r of ROUTES) {
    await p.goto(B + "/#" + r, { waitUntil: "networkidle2", timeout: 45000 }); await w(1300);
    const s = await p.evaluate(SCAN);
    perRoute.push({ route: r, ...s });
    totals.total += s.total; totals.native += s.native; totals.aria += s.ariaFocusable;
    totals.containers += s.containerWithChildActions;
    totals.mouseOnly += s.mouseOnly.length; totals.unnamed += s.unnamed.length;
    for (const m of s.mouseOnly) {
      const k = m.tag + "." + m.cls;
      if (!mouseOnlyIndex.has(k)) mouseOnlyIndex.set(k, { count: 0, routes: new Set(), sample: m.text });
      const e = mouseOnlyIndex.get(k); e.count++; e.routes.add(r);
    }
    for (const u of s.unnamed) {
      const k = u.tag + "." + u.cls;
      if (!unnamedIndex.has(k)) unnamedIndex.set(k, { count: 0, routes: new Set(), sample: u.html });
      const e = unnamedIndex.get(k); e.count++; e.routes.add(r);
    }
    console.log(`     ${r.padEnd(42)} ${String(s.total).padStart(4)} ctrl · ${String(s.native).padStart(4)} native · ${String(s.containerWithChildActions).padStart(3)} container · ${String(s.mouseOnly.length).padStart(3)} mouse-only · ${String(s.unnamed.length).padStart(2)} unnamed`);
  }
  console.log(`\n     TOTAL  ${totals.total} interactive elements across ${ROUTES.length} routes`);
  console.log(`            ${totals.native} native · ${totals.aria} role+tabindex · ${totals.containers} containers with child actions · ${totals.mouseOnly} mouse-only · ${totals.unnamed} unnamed`);

  if (mouseOnlyIndex.size) {
    console.log("\n     Mouse-only, grouped by component:");
    [...mouseOnlyIndex.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 25)
      .forEach(([k, v]) => console.log(`       ${String(v.count).padStart(4)}×  ${k.padEnd(44)} ${[...v.routes].length} route(s)  "${v.sample}"`));
  }
  if (unnamedIndex.size) {
    console.log("\n     Controls with no accessible name:");
    [...unnamedIndex.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20)
      .forEach(([k, v]) => console.log(`       ${String(v.count).padStart(4)}×  ${k.padEnd(44)} ${v.sample}`));
  }

  check("no mouse-only interactive elements remain", totals.mouseOnly === 0,
    totals.mouseOnly + " still keyboard-unreachable");
  check("every control has an accessible name", totals.unnamed === 0,
    totals.unnamed + " unnamed");

  /* ------------------------------------------------------- real keyboard -- */
  console.log("\n2. The filter bar is operable by keyboard alone");
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(2000);
  const kb = await p.evaluate(() => {
    const btn = document.querySelector(".regbar .fltwrap > .fltbtn");
    if (!btn) return null;
    btn.focus();
    return { focused: document.activeElement === btn, id: btn.id || "", expanded: btn.getAttribute("aria-expanded") };
  });
  check("a filter trigger takes focus and reports aria-expanded", kb && kb.focused && kb.expanded === "false", JSON.stringify(kb));

  await p.keyboard.press("Enter"); await w(500);
  const opened = await p.evaluate(() => ({
    open: !!document.querySelector(".fltpanel"),
    expanded: document.querySelector(".regbar .fltwrap > .fltbtn").getAttribute("aria-expanded"),
    focusInside: !!(document.querySelector(".fltpanel") && document.querySelector(".fltpanel").contains(document.activeElement)),
  }));
  check("Enter opens the panel and moves focus into it", opened.open && opened.expanded === "true" && opened.focusInside, JSON.stringify(opened));

  // Space on a checkbox option toggles the filter — native behaviour, no ARIA state to drift.
  const before = await p.evaluate(() => location.hash);
  await p.evaluate(() => { const i = document.querySelector(".fltpanel .fltopt input"); i.focus(); });
  await p.keyboard.press("Space"); await w(800);
  const after = await p.evaluate(() => location.hash);
  check("Space on an option applies the filter", before !== after, before + " -> " + after);

  await p.keyboard.press("Escape"); await w(500);
  const closed = await p.evaluate(() => ({
    open: !!document.querySelector(".fltpanel"),
    focusBack: document.activeElement === document.querySelector(".regbar .fltwrap > .fltbtn"),
  }));
  check("Escape closes the panel and returns focus to its trigger", !closed.open && closed.focusBack, JSON.stringify(closed));

  console.log("\n3. Register tabs follow the tablist pattern");
  /* The IP portfolio, not Litigation: every family in Litigation & Disputes is
     now its own module reached from the switcher, so the litigation page
     deliberately carries no tab strip. The modules that DO have one all render
     the shared RegisterTabs, which is what this pattern check is about -- the
     hand-rolled copies that skipped roving tabindex and arrow keys are gone. */
  await p.goto(B + "/#/m/ip", { waitUntil: "networkidle2" }); await w(4000);
  const tabs = await p.evaluate(() => {
    const list = document.querySelector('[role="tablist"]');
    if (!list) return null;
    const t = [...list.querySelectorAll('[role="tab"]')];
    return { n: t.length, roving: t.filter((x) => x.getAttribute("tabindex") === "0").length,
             selected: t.filter((x) => x.getAttribute("aria-selected") === "true").length };
  });
  check("tablist with exactly one selected tab and roving tabindex",
    tabs && tabs.n >= 2 && tabs.roving === 1 && tabs.selected === 1, JSON.stringify(tabs));
  const before3 = await p.evaluate(() =>
    (document.querySelector('[role="tab"][aria-selected="true"]') || {}).innerText || "");
  await p.evaluate(() => document.querySelector('[role="tab"][tabindex="0"]').focus());
  await p.keyboard.press("ArrowRight"); await w(1200);
  const after3 = await p.evaluate(() => ({
    selected: (document.querySelector('[role="tab"][aria-selected="true"]') || {}).innerText || "",
    focusedIsTab: document.activeElement.getAttribute("role") === "tab",
  }));
  check("ArrowRight moves to the next register",
    after3.selected !== before3 && after3.focusedIsTab,
    before3.replace(/\s+/g, " ") + " -> " + after3.selected.replace(/\s+/g, " "));

  console.log("\n4. Table rows are keyboard-operable");
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(2200);
  const rowA11y = await p.evaluate(() => {
    const tr = document.querySelector(".table tbody tr.rowlink");
    if (!tr) return null;
    return { tabindex: tr.getAttribute("tabindex"), role: tr.getAttribute("role"), label: tr.getAttribute("aria-label") };
  });
  check("a record row is focusable and announced as a link",
    rowA11y && rowA11y.tabindex === "0" && rowA11y.role === "link" && !!rowA11y.label, JSON.stringify(rowA11y));

  console.log("\n5. Focus is visible, not merely present");
  const ring = await p.evaluate(() => {
    const btn = document.querySelector(".regbar .fltwrap > .fltbtn");
    btn.focus();
    const cs = getComputedStyle(btn);
    return { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow };
  });
  const visible = (ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth) > 0) || (ring.boxShadow && ring.boxShadow !== "none");
  check("a focused control paints a visible focus indicator", visible, JSON.stringify(ring));

  console.log("\n6. Chips have removable controls with real labels");
  /* LIFECYCLE replaced STATUS on the case register: whether a matter is
     finished and whether the company won are different facts, and "Open /
     Closed" was the only axis the book had. */
  await p.goto(B + "/#/litigation?cases_lifecycle=Active&cases_risk=high", { waitUntil: "networkidle2" }); await w(2200);
  const chips = await p.evaluate(() => [...document.querySelectorAll(".fltchip__x")].map((x) => ({
    tag: x.tagName.toLowerCase(), label: x.getAttribute("aria-label") || "" })));
  check("every filter chip has a labelled remove button",
    chips.length >= 2 && chips.every((c) => c.tag === "button" && /Remove filter/.test(c.label)), JSON.stringify(chips));

  // Write the machine-readable evidence next to the report.
  fs.writeFileSync(P.join(__dirname, "..", "ACCESSIBILITY_DATA.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    routes: perRoute.map((r) => ({ route: r.route, total: r.total, native: r.native,
      ariaFocusable: r.ariaFocusable, containerWithChildActions: r.containerWithChildActions,
      mouseOnly: r.mouseOnly.length, unnamed: r.unnamed.length, roles: r.roles })),
    totals,
    mouseOnlyByComponent: [...mouseOnlyIndex.entries()].map(([k, v]) => ({ component: k, count: v.count, routes: [...v.routes], sample: v.sample })).sort((a, b) => b.count - a.count),
    unnamedByComponent: [...unnamedIndex.entries()].map(([k, v]) => ({ component: k, count: v.count, routes: [...v.routes], sample: v.sample })).sort((a, b) => b.count - a.count),
  }, null, 2));
  console.log("\n  evidence written to ACCESSIBILITY_DATA.json");

  await finish(b);
})().catch(async (e) => {
  console.error("SUITE ERROR", e);
  try { server && server.kill("SIGKILL"); } catch (x) {}
  try { SANDBOX && fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
});

async function finish(b) {
  try { await b.close(); } catch (e) {}
  try { server && server.kill("SIGKILL"); } catch (e) {}
  try { SANDBOX && fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n  ${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
}
