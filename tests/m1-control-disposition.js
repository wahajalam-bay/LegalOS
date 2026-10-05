// Control inventory reconciliation — every control ends in exactly one bucket.
//
// The previous pass reported "1,387 inventoried, 706 unique exercised" and left
// the remaining 681 unexplained, which reads as 681 ignored. It also recorded
// 482 controls as GONE: the sweep captured element handles up front and clicked
// them later, by which time React had re-rendered and the handle was stale. A
// control that went stale was never actually exercised, so counting it as
// covered was wrong.
//
// This suite fixes both. Controls are identified by a STABLE KEY
// (route + kind + label), not by a live handle; each unique key is exercised by
// re-navigating and re-querying immediately before the click. Downloads are
// caught by instrumenting URL.createObjectURL, so an export that writes a file
// without touching the DOM is proven rather than written off as inert.
//
// Every inventoried control ends in exactly one disposition. UNCLASSIFIED must
// be 0 — that is the check.
//
//   node tests/m1-control-disposition.js
const puppeteer = require("./_puppeteer.js");
const { reap, freePort } = require("./_reap.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), P = require("path"), http = require("http");

const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
let PORT = process.env.LEGALOS_CTRL_PORT || "4821";
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

const ROUTES = ["/exec","/workspace","/requests?rv=list","/matters","/contracts","/tracker","/projects",
 "/repository","/analyzer","/pipelines","/reports","/licenses",
 "/g/commercial","/g/compliance","/g/litigation","/g/shared","/g/insight","/g/admin",
 "/m/contracts","/m/vetting","/m/agreements","/m/resolutions","/m/licenses","/m/filings",
 "/m/cases","/m/assetRecovery","/m/ip","/m/developerDisputes","/m/police","/m/notices","/m/inspections",
 "/compliance","/compliance/licenses","/compliance/loans","/compliance/resolutions?rview=all","/compliance/leases", "/compliance/services", "/compliance/sec-filings",
 "/licenses","/litigation","/m/notices","/repository","/companies","/drafting","/templates","/clauses",
 "/knowledge","/costs","/analyzer","/pipelines","/reports","/access","/datahealth?tab=problems","/organization",
 "/settings","/portal","/triage","/copilot","/automation","/reviews","/approvals","/negotiations"];

// Never clicked here. Destructive actions belong on disposable fixtures.
const DESTRUCTIVE = /delete|remove|deactivate|archive|revoke|discard|reset|sign out|log ?out|purge|clear all data/i;

let SANDBOX = null, server = null;

/* Inventory: every control on the page, with a stable key and its state. */
const INVENTORY = function () {
  const SEL = "button, a[href], [role=tab], [role=button], [role=menuitem], input, select, textarea, [contenteditable=true], .clickable[onclick], .tab, .chip";
  const out = [];
  const shell = (el) => !!el.closest(".sidebar, .topbar, .workspace, .nav__section");
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.closest("[aria-hidden='true']")) continue;
    const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") ||
      el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const kind = el.tagName === "INPUT" ? "input:" + (el.type || "text")
      : el.tagName === "SELECT" ? "select"
      : el.tagName === "TEXTAREA" ? "textarea"
      : el.getAttribute("role") === "tab" ? "tab"
      : el.tagName === "A" ? "link" : "button";
    out.push({
      kind, label,
      cls: String(el.className || "").split(/\s+/).slice(0, 2).join("."),
      shell: shell(el),
      disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true"),
    });
  }
  return out;
};

(async () => {
  /* A port held by something this run does not own must not abort the suite:
     a suite that executes no checks is indistinguishable from a product
     failure, which is how five suites were misattributed. Report it and move
     to a free port -- the suite still starts and owns its own server. */
  if (await ping()) {
    const moved = await freePort();
    console.error(`  HARNESS_PORT_IN_USE  port ${PORT} is held by another process — continuing on free port ${moved}`);
    PORT = moved;
    B = `http://127.0.0.1:${PORT}`;
  }
  SANDBOX = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-ctrl-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "legalos/", P.join(__dirname, "..") + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(P.join(__dirname, "..", "node_modules"), P.join(SANDBOX, "node_modules"));
  const cfgPath = P.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = USER;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out0 = spawnSync("node", ["tools/legalos-passwd.js", "set", USER], { cwd: SANDBOX, encoding: "utf8" });
  const PW = ((out0.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server);   // stopped on every exit path, including a kill
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({ width: 1600, height: 1000 });
  const pageErrors = [];
  p.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 140)));
  /* NAME THE REQUEST THAT FAILED.
     The console text for a failed fetch is "Failed to load resource: the server
     responded with a status of 404" and nothing else, so three broken endpoints
     and one broken endpoint hit three times are the same three lines. That is a
     failure nobody can act on. The response listener carries the URL, so record
     it and let the console line be reported only when we have no URL for it. */
  const badResponses = new Map();          // "404 /api/thing" -> times seen
  p.on("response", (r) => {
    try {
      const st = r.status();
      if (st < 400 || [401, 403, 429].includes(st)) return;
      const u = r.url().replace(/^https?:\/\/[^/]+/, "");
      if (/favicon/i.test(u)) return;
      const k = st + " " + u.slice(0, 120);
      badResponses.set(k, (badResponses.get(k) || 0) + 1);
    } catch (e) { /* never throw from a listener */ }
  });
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|401|403|429/.test(t)) return;
    // The URL-carrying listener above reports these, with the address.
    if (/Failed to load resource/.test(t)) return;
    pageErrors.push(t.slice(0, 140));
  });

  // Catch file downloads: the export controls build a Blob and click a link,
  // which changes nothing in the DOM. Without this they look dead.
  await p.evaluateOnNewDocument(() => {
    window.__downloads = 0;
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (...a) { window.__downloads++; return orig.apply(this, a); };
  });

  await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(2000);
  await p.type('input[name="email"]', USER); await p.type('input[name="password"]', PW);
  await p.click('button[type="submit"]'); await w(4000);
  const signedIn = !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText));
  check("signed in", signedIn);
  if (!signedIn) return finish(b);

  /* A single settle for BOTH phases. When these drifted apart (1100ms for the
     inventory, 700ms for the exercise) the exercise phase queried /workspace and
     /contracts before their tables had painted, and recorded hundreds of
     reachable sort and filter controls as "not reachable with current data" —
     understating coverage and overstating the gap. */
  /* Wait until the page has actually STOPPED CHANGING, rather than sleeping for
     a fixed 1.1s and hoping. This runs once per control — about 1,200 times —
     so a blind sleep here was roughly 22 minutes of the suite's runtime and was
     what pushed it past the run-all ceiling. It is also the kind of wait that
     is wrong in both directions: too long on a fast page, too short on a slow
     one. The condition is the same guarantee, measured instead of assumed. */
  const settle = async () => {
    try {
      await p.waitForFunction(
        () => document.querySelector(".regcount, .table tbody tr, .kanban, .empty, .modkpi, .statkpi") != null
              || document.body.innerText.trim().length > 400,
        { timeout: 12000 });
    } catch (e) { /* a route with none of these still gets the stability wait below */ }
    try {
      // Two consecutive frames with an unchanged DOM size and text length.
      await p.waitForFunction(() => {
        const sig = document.querySelectorAll("*").length + ":" + document.body.innerText.length;
        const w = window.__settleSig;
        window.__settleSig = sig;
        if (w === sig) { window.__settleSig = null; return true; }
        return false;
      }, { polling: 120, timeout: 6000 });
    } catch (e) { /* a page that never stops animating falls through */ }
  };
  /* Go to a route with its page state RESET.
     page.goto() to a URL that differs only in the hash does not reload a
     single-page app, so component state survives. That mattered: exercising a
     route's search box types "zz" into it, which filters the list to nothing —
     and every control examined afterwards on that route was then genuinely
     absent from the DOM and recorded as "not reachable with current data". It
     accounted for 465 controls, 365 of them on /templates alone.
     Bouncing through a neutral route first unmounts the previous page
     component, which discards its useState, and is far cheaper than a full
     browser reload for every one of ~1,500 controls. */
  const goRoute = async (r) => {
    await p.evaluate(() => {
      window.location.hash = "#/exec";
      /* The older FilterBar (used by /workspace, /tracker, /reports, …) keeps
         its filters in localStorage, so unmounting the component is not enough —
         a filter set while exercising one control would still be applied to the
         next. Drop the remembered filters and column preferences; the session
         cookie is HttpOnly and unaffected. */
      try {
        for (const k of Object.keys(localStorage)) {
          if (/^legalos[-.](filters|cols)/i.test(k) || /^legalos\.cols\./i.test(k) || /lastFilters/i.test(k)) localStorage.removeItem(k);
        }
      } catch (e) { /* storage unavailable */ }
    });
    // domcontentloaded + the stability wait above, rather than networkidle2 —
    // networkidle2 adds a fixed 500ms silence window per navigation, and
    // settle() already proves the page rendered.
    await p.goto(B + "/#" + r, { waitUntil: "domcontentloaded", timeout: 45000 });
    await settle();
  };

  /* ---------------------------------------------------- 1. inventory ------ */
  console.log("\n1. Inventory");
  const inventory = [];                       // one entry per rendered instance
  for (const r of ROUTES) {
    await goRoute(r);
    const items = await p.evaluate(INVENTORY);
    items.forEach((it) => inventory.push({ ...it, route: r }));
  }
  const pageControls = inventory.filter((c) => !c.shell);
  const shellControls = inventory.filter((c) => c.shell);
  console.log(`     ${inventory.length} control instances across ${ROUTES.length} routes`);
  console.log(`       ${pageControls.length} page-level · ${shellControls.length} shell chrome (sidebar/topbar, repeated per route)`);

  // A behaviour group is one distinct control: same route, same kind, same label.
  const keyOf = (c) => `${c.route}|${c.kind}|${c.label}`;
  const groups = new Map();
  for (const c of pageControls) {
    const k = keyOf(c);
    if (!groups.has(k)) groups.set(k, { ...c, key: k, instances: 0 });
    groups.get(k).instances++;
  }
  console.log(`     ${groups.size} unique behaviour groups · ${pageControls.length - groups.size} further instances of those groups`);

  /* ---------------------------------------------------- 2. exercise ------- */
  console.log("\n2. Exercising every unique behaviour group (re-queried immediately before each click)");
  const disp = {};
  const bump = (d) => { disp[d] = (disp[d] || 0) + 1; };
  const bugs = [];
  let done = 0;

  const byRoute = new Map();
  for (const g of groups.values()) {
    if (!byRoute.has(g.route)) byRoute.set(g.route, []);
    byRoute.get(g.route).push(g);
  }

  /* A BOUNDED SWEEP THAT SAYS WHERE IT STOPPED.
     This suite walks every control on every route and re-navigates before each
     click, so it is legitimately slow -- but it ran past the runner's 2400s cap
     and was KILLED, which produced no checks, no scoreboard line worth reading
     and no clue which control it was on. A suite that cannot finish must still
     report; being killed from the outside is the one outcome that tells you
     nothing.
     So it now owns its own deadline, comfortably inside the runner's cap, and
     on hitting it stops exercising and reports: the route and control it was
     on, and how many groups it never reached. Those are dispositioned as
     NOT_REACHED_BEFORE_DEADLINE rather than silently dropped, so the arithmetic
     still balances. Progress is written to a file as it goes, because the
     runner captures stdout and shows it only when the suite ends -- during a
     forty-minute sweep there is otherwise nothing to watch. */
  /* 50 minutes, inside the runner's 65. Twenty-five was not enough: the sweep
     grew to 1,773 control groups and under a full regression run (a browser
     suite before it, the register rebuilding behind it) it got through about
     1,500 of them before the deadline and honestly reported 275 unexercised.
     Reporting that beat being killed with no output at all, but the point is to
     finish, so the budget now matches the work. It is still bounded, and still
     names the control it stopped on. */
  const DEADLINE_MS = Number(process.env.CTRL_DEADLINE_MS || 3000000);
  const startedAt = Date.now();
  const PROGRESS = process.env.CTRL_PROGRESS || "/tmp/legalos-control-sweep.progress";
  let currentTarget = null, deadlineHit = false;
  const noteProgress = () => {
    try {
      fs.writeFileSync(PROGRESS, JSON.stringify({
        at: new Date().toISOString(),
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
        done, total: groups.size,
        current: currentTarget,
      }) + "\n");
    } catch (e) { /* progress reporting must never fail the run */ }
  };

  for (const [route, gs] of byRoute) {
    for (const g of gs) {
      if (deadlineHit) { g.disposition = "NOT_REACHED_BEFORE_DEADLINE"; bump(g.disposition); continue; }
      if (Date.now() - startedAt > DEADLINE_MS) {
        deadlineHit = true;
        console.log(`\n     DEADLINE after ${Math.round((Date.now() - startedAt) / 1000)}s`
          + ` — stopped while exercising route ${g.route}, control "${g.label}" (${g.kind}).`
          + ` ${done} of ${groups.size} groups exercised.`);
        g.disposition = "NOT_REACHED_BEFORE_DEADLINE"; bump(g.disposition); continue;
      }
      currentTarget = { route: g.route, label: g.label, kind: g.kind };
      done++;
      if (done % 25 === 0) { console.log(`     ...${done}/${groups.size}`); noteProgress(); }
      if (g.disabled) { g.disposition = "DISABLED_BY_DESIGN"; bump(g.disposition); continue; }
      if (DESTRUCTIVE.test(g.label)) { g.disposition = "DESTRUCTIVE_NOT_CLICKED_HERE"; bump(g.disposition); continue; }

      await goRoute(route);
      const before = await p.evaluate((gg) => {
  const rowSig = () => {
    const rows = [...document.querySelectorAll(".table tbody tr")].slice(0, 6);
    return rows.map((r) => (r.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)).join("~");
  };
        const SEL = "button, a[href], [role=tab], [role=button], [role=menuitem], input, select, textarea, [contenteditable=true], .clickable[onclick], .tab, .chip";
        const norm = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 60);
        let alreadyOn = false;
        /* A link that opens a new tab acts somewhere this page cannot watch.
           It still has to point at something: an empty or "#" href is not a
           control that works elsewhere, it is a control that works nowhere. */
        let opensNewTab = false;
        for (const el of document.querySelectorAll(SEL)) {
          if (el.closest(".sidebar, .topbar, .workspace, .nav__section")) continue;
          if (norm(el) !== gg.label) continue;
          if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
            const href = (el.getAttribute("href") || "").trim();
            if (href && href !== "#") opensNewTab = true;
          }
          // The control already represents the current state: the selected tab,
          // the active view, the applied filter. Clicking it again correctly
          // does nothing — that is not a dead control.
          if (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true" ||
              el.getAttribute("aria-current") || /(^|\s)(active|regtab--on|fltbtn--on|statkpi--on|fltview--on|drillcell--on|is-on)(\s|$)/.test(el.className || "")) {
            alreadyOn = true;
          }
          break;
        }
        // Does this route have anything to act on? A filter over an empty
        // register cannot change what is displayed, however correct it is.
        const rows = document.querySelectorAll(".table tbody tr, .kcol__list > *, .feed__item").length;
        const zeroish = /\b0 (of )?\d*\s*(record|result|case|contract|request|notice|licence|license|resolution|propert|loan|matter)/i.test(document.body.innerText)
          || /^0$|\bno (records|results|matters|requests|cases|contracts)\b/i.test(document.body.innerText);
        return {
          url: location.hash, len: document.body.innerHTML.length,
          modal: document.querySelectorAll(".overlay, .modal, .drawer, .fltpanel").length,
          dl: window.__downloads || 0, alreadyOn, opensNewTab, rows, zeroish, rowSig: rowSig(),
        };
      }, g);
      // Re-query by the same stable key, in the page, and click in the same tick.
      const clicked = await p.evaluate((gg) => {
        const SEL = "button, a[href], [role=tab], [role=button], [role=menuitem], input, select, textarea, [contenteditable=true], .clickable[onclick], .tab, .chip";
        const norm = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 60);
        const kindOf = (el) => el.tagName === "INPUT" ? "input:" + (el.type || "text")
          : el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea"
          : el.getAttribute("role") === "tab" ? "tab" : el.tagName === "A" ? "link" : "button";
        for (const el of document.querySelectorAll(SEL)) {
          if (el.closest(".sidebar, .topbar, .workspace, .nav__section")) continue;
          if (kindOf(el) !== gg.kind || norm(el) !== gg.label) continue;
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          if (gg.kind.startsWith("input:") || gg.kind === "textarea") {
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
            setter.call(el, gg.kind === "input:search" || gg.kind === "input:text" ? "zz" : el.value);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            return "typed";
          }
          if (gg.kind === "select") {
            if (el.options.length > 1) { el.selectedIndex = Math.min(1, el.options.length - 1); el.dispatchEvent(new Event("change", { bubbles: true })); return "changed"; }
            return "single-option";
          }
          // MUST stay identical to the sig() in the "after" evaluate below — if
          // the two drift, every control looks changed and the suite goes green
          // for the wrong reason.
          const sig = (x) => [x.getAttribute("aria-pressed"), x.getAttribute("aria-expanded"),
            x.getAttribute("aria-selected"), x.getAttribute("aria-current"),
            x.getAttribute("aria-label"), x.getAttribute("aria-busy"),
            (x.closest("th") || {}).getAttribute ? x.closest("th").getAttribute("aria-sort") : null,
            x.disabled ? "disabled" : "enabled",
            (x.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
            x.className].join("|");
          window.__sigBefore = sig(el);
          window.__sigEl = el;
          el.click();
          return "clicked";
        }
        return "not-found";
      }, g);

      if (clicked === "not-found") {
        // The control was inventoried on this route but is not present on a
        // fresh load: it depends on state this pass does not reach (an open
        // panel, a selected row, a fixture that does not exist).
        g.disposition = "CONDITIONAL_NOT_REACHABLE_WITH_CURRENT_DATA"; bump(g.disposition); continue;
      }
      if (clicked === "single-option") { g.disposition = "NOT_CONFIGURED_FEATURE"; bump(g.disposition); continue; }

      await w(650);
      const after = await p.evaluate(() => {
  const rowSig = () => {
    const rows = [...document.querySelectorAll(".table tbody tr")].slice(0, 6);
    return rows.map((r) => (r.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40)).join("~");
  };
        /* The signature must include what the control SAYS and whether it is
           still usable. Without those two, "Re-read Drive" — which relabels
           itself to "Re-reading..." and disables while the crawl runs — looked
           dead: its className and aria attributes never move, and the ~12
           characters it adds to the page are under the 40-character redraw
           threshold. It was reported as the suite's only BUG when the control
           works correctly. A control that acknowledges the click by changing
           its own label has plainly done something. */
        const sig = (x) => [x.getAttribute("aria-pressed"), x.getAttribute("aria-expanded"),
          x.getAttribute("aria-selected"), x.getAttribute("aria-current"),
          x.getAttribute("aria-label"), x.getAttribute("aria-busy"),
          (x.closest("th") || {}).getAttribute ? x.closest("th").getAttribute("aria-sort") : null,
          x.disabled ? "disabled" : "enabled",
          (x.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
          x.className].join("|");
        // A switch or a toggle flips its own state and almost nothing else: the
        // page's markup length barely moves, so size alone reports it as dead.
        let selfChanged = false;
        try {
          if (window.__sigEl && window.__sigEl.isConnected) selfChanged = sig(window.__sigEl) !== window.__sigBefore;
          else if (window.__sigEl) selfChanged = true;   // re-rendered away entirely
        } catch (e) {}
        window.__sigEl = null;
        return {
          url: location.hash, len: document.body.innerHTML.length,
          modal: document.querySelectorAll(".overlay, .modal, .drawer, .fltpanel").length,
          dl: window.__downloads || 0, selfChanged, rowSig: rowSig(),
        };
      });
      const moved = after.url !== before.url;
      const redrew = Math.abs(after.len - before.len) > 40;
      const opened = after.modal !== before.modal;
      const downloaded = after.dl > before.dl;
      const reordered = before.rowSig !== after.rowSig;
      if (moved || redrew || opened || downloaded || after.selfChanged || reordered) {
        g.disposition = "UNIQUE_CONTROL_TESTED";
        g.effect = moved ? "navigated" : opened ? "opened a panel" : downloaded ? "produced a download"
          : redrew ? "changed the view" : reordered ? "reordered the table" : "toggled its own state";
        bump(g.disposition);
      } else if (before.opensNewTab) {
        /* A link with target="_blank" and a real href DOES something -- it just
           does it in a tab this page cannot see. "Open the portal" points at
           portal/index.html, which exists and loads; reporting it as a dead
           control is the checker measuring the wrong window, not the product
           failing. The href is still required to be non-empty, so a
           target="_blank" with nowhere to go is still a bug. */
        g.disposition = "OPENS_IN_NEW_TAB"; bump(g.disposition);
        g.effect = "opens in a new tab";
      } else if (before.alreadyOn) {
        // Re-selecting what is already selected is correct behaviour.
        g.disposition = "ALREADY_IN_THIS_STATE"; bump(g.disposition);
      } else if (before.rows === 0 || before.zeroish) {
        // Nothing on the route to filter, sort or narrow.
        g.disposition = "NO_DATA_TO_ACT_ON"; bump(g.disposition);
      } else {
        g.disposition = "BUG";
        bump(g.disposition);
        bugs.push(`${route} · ${g.kind} "${g.label}"`);
      }
    }
  }

  /* ---------------------------------------------------- 3. reconcile ------ */
  console.log("\n3. Reconciliation");
  const duplicates = pageControls.length - groups.size;
  const total = pageControls.length;
  const accounted = Object.values(disp).reduce((a, x) => a + x, 0) + duplicates;
  const rows = [
    ["UNIQUE_CONTROL_TESTED", disp.UNIQUE_CONTROL_TESTED || 0],
    ["DUPLICATE_INSTANCE_OF_TESTED_CONTROL", duplicates],
    ["CONDITIONAL_NOT_REACHABLE_WITH_CURRENT_DATA", disp.CONDITIONAL_NOT_REACHABLE_WITH_CURRENT_DATA || 0],
    ["DISABLED_BY_DESIGN", disp.DISABLED_BY_DESIGN || 0],
    ["NOT_CONFIGURED_FEATURE", disp.NOT_CONFIGURED_FEATURE || 0],
    ["DESTRUCTIVE_NOT_CLICKED_HERE", disp.DESTRUCTIVE_NOT_CLICKED_HERE || 0],
    ["ALREADY_IN_THIS_STATE", disp.ALREADY_IN_THIS_STATE || 0],
    ["NO_DATA_TO_ACT_ON", disp.NO_DATA_TO_ACT_ON || 0],
    ["BUG", disp.BUG || 0],
    ["NOT_REACHED_BEFORE_DEADLINE", disp.NOT_REACHED_BEFORE_DEADLINE || 0],
  ];
  for (const [k, v] of rows) console.log(`     ${String(v).padStart(5)}  ${k}`);
  console.log(`     ${String(accounted).padStart(5)}  accounted for, of ${total} page-level control instances`);
  console.log(`     ${String(total - accounted).padStart(5)}  UNCLASSIFIED`);

  check(`every one of ${total} page-level controls has a disposition (UNCLASSIFIED = 0)`,
    total - accounted === 0, (total - accounted) + " unclassified");
  /* A partial sweep must not read as a clean one. Stopping at the deadline is
     better than being killed -- it reports where it got to -- but it is still
     incomplete coverage, and the gate should say so rather than bank the
     controls it did manage to reach. */
  check("the sweep exercised every control group within its deadline",
    !deadlineHit,
    deadlineHit
      ? `stopped at the deadline with ${disp.NOT_REACHED_BEFORE_DEADLINE || 0} group(s) unexercised`
        + (currentTarget ? `, on ${currentTarget.route} "${currentTarget.label}"` : "")
      : `${groups.size} groups, no deadline hit`);
  check(`${disp.UNIQUE_CONTROL_TESTED || 0} unique controls produced an observable effect; 0 dead controls`,
    (disp.BUG || 0) === 0, bugs.slice(0, 6).join(" | "));
  const bad = [...badResponses.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => k + (n > 1 ? ` (x${n})` : ""));
  check("no page errors while exercising every control",
    pageErrors.length === 0 && bad.length === 0,
    [...pageErrors.slice(0, 3), ...bad.slice(0, 6)].join(" | ") || "clean");

  fs.writeFileSync(P.join(__dirname, "..", "CONTROL_DISPOSITION.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    routes: ROUTES.length,
    instances: { total: inventory.length, page: pageControls.length, shell: shellControls.length },
    uniqueBehaviourGroups: groups.size,
    dispositions: Object.fromEntries(rows),
    unclassified: total - accounted,
    bugs,
    groups: [...groups.values()].map((g) => ({ route: g.route, kind: g.kind, label: g.label,
      instances: g.instances, disposition: g.disposition, effect: g.effect || "" })),
  }, null, 2));
  console.log("\n  evidence written to CONTROL_DISPOSITION.json");
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
