// The shared test harness. One sandbox model, one sign-in, one cleanup path.
//
// WHY THIS EXISTS
// Thirteen suites were written before LegalOS had authentication. They pointed a
// browser at a shared server, deleted `legalos-store-v1`, reloaded, and expected
// the app to re-seed itself. Once sign-in landed (2026-09-14) the app rendered
// the login page instead and wrote nothing, so every one of them died on
// `JSON.parse(null)` — and nobody saw it, because `run-all` defaulted to the
// live port and therefore nobody ran the whole suite. A third of the regression
// net had been dead for days while individual suites reported green.
//
// The rules this file encodes, each of them paid for:
//
//   * A suite owns its server. It copies the tree, starts its own instance on
//     its own port, and kills the process HANDLE it holds — never a pgrep
//     pattern, which matches the waiting shell itself and deadlocks.
//   * "Something answered" is not proof of anything. The sandbox stamps a random
//     id into its server's environment and /api/health echoes it back; any other
//     answer is a stale or foreign process and the run stops.
//   * Identity comes from signing in, never from writing a role into
//     localStorage. A test that grants itself permissions cannot catch an RBAC
//     regression, which is most of what these suites are for.
//   * Every wait is bounded and says what it was waiting for when it gives up.
//   * Cleanup runs on success, on failure, and on a signal.
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { resolvePort } = require("./_port.js");

const ROOT = path.join(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ errors */

/* A harness failure is not a product failure, and a runner that conflates them
   teaches you to ignore red. Anything thrown as HarnessError means the test
   never got the chance to make an assertion. */
class HarnessError extends Error {
  constructor(msg) { super(msg); this.name = "HarnessError"; this.harness = true; }
}

/* ------------------------------------------------------------- HTTP helper */

function request(base, method, route, { cookie, body, headers } = {}) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const h = Object.assign({},
      data ? { "Content-Type": "application/json", "Content-Length": data.length } : {},
      cookie ? { Cookie: "legalos_sess=" + cookie } : {},
      headers || {});
    const r = http.request(base + route, { method, headers: h }, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {}
        resolve({ status: res.statusCode, body: j, text: buf.toString("utf8"), headers: res.headers });
      });
    });
    r.on("error", (e) => resolve({ status: 0, body: null, text: String(e.message), headers: {} }));
    r.setTimeout(20000, () => { r.destroy(); resolve({ status: 0, body: null, text: "timeout", headers: {} }); });
    if (data) r.write(data);
    r.end();
  });
}

/* ------------------------------------------------------------------ sandbox */

/* Copy the app, start it on its own port, and hand back a handle that owns the
   process. `stop()` is idempotent and safe to call from a finally block. */
/* EVERY SANDBOX THIS PROCESS OWNS.
   A suite cleans up in finish(), but finish() only runs when the suite ends
   normally or throws. A run that is KILLED -- Ctrl-C, a CI timeout, the 120s
   cap on a shell tool -- dies without it, and the server it spawned survives
   as an orphan holding its port. The next run then finds that port squatted,
   refuses to start, exits in 0s having executed no checks, and gets reported
   as a product failure. That is exactly how five suites were misattributed.

   Every live sandbox is registered here and stopped on any exit path. */
const LIVE_SANDBOXES = new Set();
let reaperInstalled = false;

function stopAllSandboxes() {
  for (const h of [...LIVE_SANDBOXES]) {
    try { h.stop(); } catch (e) { /* teardown must never mask the real failure */ }
  }
  LIVE_SANDBOXES.clear();
  // Browser profiles are litter of exactly the same kind, and the reaper is the
  // one path that runs on a kill as well as a clean finish. The shim owns them
  // (see tests/_puppeteer.js) so every suite is covered, not just the ones that
  // go through openBrowser.
  try { require("./_puppeteer.js").cleanProfiles(); } catch (e) { /* best effort */ }
}

function installReaper() {
  if (reaperInstalled) return;
  reaperInstalled = true;
  // `exit` covers normal and error paths; the signals cover being killed.
  process.on("exit", stopAllSandboxes);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
    process.on(sig, () => {
      stopAllSandboxes();
      // Re-raise with the default disposition so the exit code stays honest.
      process.exit(sig === "SIGINT" ? 130 : 143);
    });
  }
  process.on("uncaughtException", (e) => {
    stopAllSandboxes();
    console.error("\n  HARNESS uncaught exception: " + (e && e.stack ? e.stack : e));
    process.exit(1);
  });
}

/* A port the OS says is free right now. Used when the suite's configured port
   is held by something this run does not own, so one stale process cannot stop
   an entire suite from executing. */
/* `listen` is ASYNCHRONOUS -- address() straight after it returns null. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(String(p)));
    });
  });
}

async function startSandbox({ portEnv, portFallback, prefix = "legalos-t-", enforceAuth = true, env = {} } = {}) {
  installReaper();
  let port = resolvePort(portEnv || "LEGALOS_PORT", portFallback);
  let base = `http://127.0.0.1:${port}`;

  /* A port that already answers belongs to someone else. Taking it would mean
     driving an unknown build; refusing outright would mean the suite executes
     no checks and looks like a product failure. Neither is acceptable, so the
     collision is reported loudly as a HARNESS condition and the sandbox moves
     to a port the OS says is free. The suite still runs, and still proves
     something. */
  const squatter = await probeHealth(base, 1500);
  if (squatter) {
    const moved = await freePort();
    console.error(
      `  HARNESS_PORT_IN_USE  port ${port} is already serving ` +
      `(sandbox=${squatter.sandbox || "unknown"}, pid=${squatter.pid || "?"}) — ` +
      `this run does not own it. Continuing on free port ${moved}.`);
    port = moved;
    base = `http://127.0.0.1:${port}`;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  /* A SANDBOX STARTS FROM THE BUILD, NOT FROM WHAT SOMEBODY DID IN THE APP TODAY.
     Every store below is written by the RUNNING application -- cases raised,
     retainers recorded, contract requests drafted, module records added, files
     uploaded. They are operational data, not fixtures, and copying them in made
     the suite's result depend on live usage: somebody recording a 250,000 PKR
     retainer through the UI made the litigation spend suite fail, because it
     asserts on the totals it created and got those plus one it had never heard
     of. `config/requests.json` was already excluded for exactly this reason; the
     rest had simply not bitten yet.
     Anything a suite needs, a suite creates. Drive-derived registers and the
     document-scope map are NOT excluded: those are the build's data, and the
     app is supposed to be tested against them. */
  const rs = spawnSync("rsync", ["-a",
    "--exclude", "node_modules",
    "--exclude", "config/.sessions.json",
    "--exclude", "config/workflow.json",
    "--exclude", "config/workflow-docs",
    "--exclude", "config/requests.json",
    "--exclude", "config/requests-deleted.json",
    "--exclude", "config/litigation-cases.json",
    "--exclude", "config/litigation-retainers.json",
    "--exclude", "config/contract-requests.json",
    "--exclude", "config/module-records.json",
    "--exclude", "config/deletion-requests.json",
    "--exclude", "config/request-docs",
    "--exclude", "var/request-uploads",
    "--exclude", "legalos/",
    ROOT + "/", dir + "/"]);
  if (rs.status !== 0) throw new HarnessError("could not copy the app into a sandbox: rsync exited " + rs.status);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));

  // Real credential sign-in, dev bypass off: identity is a session cookie, the
  // same as production. A suite that bypasses auth proves nothing about auth.
  const cfgPath = path.join(dir, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = !!enforceAuth;
  cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  const sandboxId = crypto.randomBytes(8).toString("hex");
  let server = spawn("node", ["server.js"], {
    cwd: dir, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env, PORT: String(port), LEGALOS_DEV: "1",
      LEGALOS_COOKIE_PATH: "/", LEGALOS_SANDBOX_ID: sandboxId },
  });
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d; if (serverLog.length > 20000) serverLog = serverLog.slice(-20000); });
  server.stderr.on("data", (d) => { serverLog += d; if (serverLog.length > 20000) serverLog = serverLog.slice(-20000); });
  let exited = null;
  server.on("exit", (code, sig) => { exited = sig || code; });

  const handle = {
    dir, base, port, sandboxId, server,
    get log() { return serverLog; },
    stopped: false,
    /* RESTART THE SERVER OVER THE SAME SANDBOX.
       Some things can only be proved across a restart: that a record persisted,
       that a store edited from outside is picked up, that a removal holds. The
       server caches its stores in memory, so editing a config file underneath it
       is not visible until it reloads -- which is exactly what the operational
       procedure does (edit, then restart the service). Suites used to spawn and
       re-spawn their own servers by hand to get at this; doing it here means the
       process handle is still the one we own, and stop() still kills it. */
    async restart() {
      try { handle.server.kill("SIGKILL"); } catch (e) {}
      await sleep(600);
      const next = spawn("node", ["server.js"], {
        cwd: dir, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env, PORT: String(port), LEGALOS_DEV: "1",
          LEGALOS_COOKIE_PATH: "/", LEGALOS_SANDBOX_ID: sandboxId },
      });
      next.stdout.on("data", (d) => { serverLog += d; });
      next.stderr.on("data", (d) => { serverLog += d; });
      handle.server = next;
      server = next;                        // so stop() kills the live one
      const until = Date.now() + 40000;
      while (Date.now() < until) {
        if (await probeHealth(base, 1200)) return handle;
        await sleep(400);
      }
      throw new HarnessError("the sandbox server did not come back after a restart");
    },
    stop() {
      if (handle.stopped) return;
      handle.stopped = true;
      // The process HANDLE we spawned — never a pattern search.
      try { server.kill("SIGTERM"); } catch (e) {}
      setTimeout(() => { try { server.kill("SIGKILL"); } catch (e) {} }, 1500).unref();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      LIVE_SANDBOXES.delete(handle);
    },
  };
  LIVE_SANDBOXES.add(handle);

  // Bounded wait for readiness, and a clear message when it never comes.
  const deadline = Date.now() + 40000;
  let health = null;
  while (Date.now() < deadline) {
    if (exited != null) {
      handle.stop();
      throw new HarnessError(`the sandbox server exited (${exited}) before it was ready.\n--- server output ---\n${serverLog.slice(-1500)}`);
    }
    health = await probeHealth(base, 1200);
    if (health) break;
    await sleep(350);
  }
  if (!health) {
    handle.stop();
    throw new HarnessError(`the sandbox server never became ready on ${base} within 40s.\n--- server output ---\n${serverLog.slice(-1500)}`);
  }

  // OWNERSHIP. The server answering must be the one we just started.
  if (health.sandbox !== sandboxId) {
    handle.stop();
    throw new HarnessError(
      `port ${port} is answering, but it is NOT this run's sandbox ` +
      `(expected ${sandboxId}, got ${health.sandbox || "no marker — an older build"}). Refusing to test it.`);
  }
  handle.build = health.build || null;

  // Clean up even if the suite is killed.
  const onSignal = () => { handle.stop(); process.exit(130); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("exit", () => handle.stop());

  return handle;
}

function probeHealth(base, timeoutMs) {
  return new Promise((resolve) => {
    const r = http.get(base + "/api/health", (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { resolve(null); }
      });
    });
    r.on("error", () => resolve(null));
    r.setTimeout(timeoutMs, () => { r.destroy(); resolve(null); });
  });
}

/* ---------------------------------------------------------------- identity */

/* The standard cast. Every role the product distinguishes, named by what it is
   for rather than by who happens to hold it, so a suite reads as a statement
   about permissions. These are roster accounts in a THROWAWAY sandbox — the
   harness sets their passwords inside the copy, and the copy is deleted. No
   live credential is used or needed. */
const USERS = {
  director:   { email: "maryam.haq@zameen.com",     id: "u1",  rbac: "head",      team: null,          label: "Director Legal (sees everything)" },
  commLead:   { email: "imran.tariq@zameen.com",    id: "u3",  rbac: "lead",      team: "commercial",  label: "Commercial lead (approval authority)" },
  commMember: { email: "ahmed.sardar@zameen.com",   id: "u5",  rbac: "member",    team: "commercial",  label: "Commercial associate (no approval authority)" },
  litLead:    { email: "salman.rashid@zameen.com",  id: "u6",  rbac: "lead",      team: "litigation",  label: "Litigation lead" },
  litMember:  { email: "salman.khan@zameen.com",    id: "u18", rbac: "member",    team: "litigation",  label: "Litigation associate" },
  complLead:  { email: "arsalan.sandhu@zameen.com", id: "u20", rbac: "lead",      team: "compliance",  label: "Compliance manager" },
  complMember:{ email: "sana.hurmat@zameen.com",    id: "u12", rbac: "member",    team: "compliance",  label: "Compliance associate" },
  paralegal:  { email: "ali.raza@zameen.com",       id: "u10", rbac: "paralegal", team: "commercial",  label: "Legal executive (paralegal)" },
};

/* Set a password INSIDE the sandbox and return it. The tool resolves its config
   from its own location, so running it with cwd=<sandbox> writes to the copy. */
function setPassword(sandboxDir, email) {
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email, "--password", "Test-Harness-Pw-1"],
    { cwd: sandboxDir, encoding: "utf8" });
  if (out.status !== 0) throw new HarnessError(`could not set a sandbox password for ${email}: ${(out.stderr || out.stdout || "").slice(0, 200)}`);
  return "Test-Harness-Pw-1";
}

/* Sign in over HTTP and return the session cookie (for API-level suites). */
async function loginApi(sb, email) {
  const password = setPassword(sb.dir, email);
  const r = await request(sb.base, "POST", "/api/auth/login", { body: { email, password } });
  const m = (r.headers["set-cookie"] || []).join(";").match(/legalos_sess=([^;]+)/);
  if (!m) throw new HarnessError(`sign-in failed for ${email}: HTTP ${r.status} ${(r.body && r.body.error) || r.text.slice(0, 120)}`);
  return m[1];
}

/* Sign in THROUGH THE REAL FORM, the way a person does, and prove it worked
   before the suite asserts anything else. A test that carries on after a failed
   sign-in reports the login page as a product bug. */
async function loginAs(page, sb, user) {
  const email = typeof user === "string" ? user : user.email;
  const password = setPassword(sb.dir, email);
  if (page.__ctx) page.__ctx.__onLoginScreen = true;
  await page.goto(sb.base + "/#/login", { waitUntil: "networkidle2", timeout: 45000 });
  await waitForSelector(page, 'input[name="email"]', { message: "the sign-in form never rendered" });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('input[name="email"], input[name="password"]')) el.value = "";
  });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  try { await expectAuthenticated(page, email); }
  finally { if (page.__ctx) page.__ctx.__onLoginScreen = false; }
  return { email, password };
}

/* Assert we are past the sign-in screen, with a bounded wait and a message that
   names what actually happened. */
async function expectAuthenticated(page, email) {
  const deadline = Date.now() + 25000;
  let last = "";
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({
      onLogin: /Welcome back|Sign in with your LegalOS account/i.test(document.body.innerText),
      err: (document.querySelector(".authbox__err, [role=alert], .alert") || {}).innerText || "",
      hasApp: !!document.querySelector(".sidebar, .topbar"),
    }));
    if (!st.onLogin && st.hasApp) return true;
    last = st.err || (st.onLogin ? "still on the sign-in screen" : "app shell never rendered");
    await sleep(400);
  }
  throw new HarnessError(`sign-in did not complete${email ? " for " + email : ""}: ${last.replace(/\s+/g, " ").trim()}`);
}

/* Who does the APP think is signed in? Read from the session endpoint, which is
   the server's answer, not the browser's opinion. */
async function currentUser(page, base) {
  return page.evaluate(async (b) => {
    const r = await fetch(b + "/api/auth/session", { credentials: "include" });
    if (!r.ok) return null;
    const j = await r.json();
    return j.user || j.account || null;
  }, base);
}

async function logout(page, base) {
  await page.evaluate(async (b) => {
    try { await fetch(b + "/api/auth/logout", { method: "POST", credentials: "include" }); } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
  }, base);
}

/* A page signed in as one user, in its OWN browser context.
   Several of these suites compare what different roles can see. Sharing one
   context would share one session cookie and one localStorage, so the second
   "user" would silently be the first — which is how the originals ended up
   switching identity by writing a user id into browser storage. */
async function asUser(browser, sb, user, ctx) {
  const bctx = await browser.createBrowserContext();
  const page = await bctx.newPage();
  if (ctx) watchPage(page, ctx);
  await loginAs(page, sb, user);
  const who = await currentUser(page, sb.base);
  const want = typeof user === "string" ? user : user.email;
  if (!who || (who.email || "").toLowerCase() !== want.toLowerCase()) {
    throw new HarnessError(`signed in as ${want} but the server says ${who ? who.email : "nobody"}`);
  }
  page.__context = bctx;
  page.close = (orig => async function () { try { await bctx.close(); } catch (e) {} })(page.close);
  return page;
}

/* The BUSINESS requester door (/portal/).
   Requesters are not on the legal roster and have no credential — the portal is
   a department picker by design. This is the supported requester entry, so a
   test uses it rather than inventing an identity. It grants no legal access:
   whatever it hands out, the server still refuses for legal surfaces. */
async function enterPortalAs(page, sb, department, ctx) {
  if (ctx) watchPage(page, ctx);
  /* A portal requester is anonymous to the SERVER here: the door hands out a
     department persona for the browser, and the verified identity that makes
     their API calls work comes from Cloudflare Access, which only exists in
     front of the deployed site. Their 401s are the expected answer in a
     sandbox, so they are not counted as faults on THIS page — every other page
     still reports them. */
  page.__expect401 = true;
  // The door is a separate DOCUMENT at /portal/, not the #/portal hash route —
  // isRequesterDoor() tests window.location.pathname. Visiting the hash route
  // lands on the marketing/sign-in page instead, with no department picker.
  await page.goto(sb.base + "/portal/", { waitUntil: "networkidle2", timeout: 45000 });
  await waitFor(page, () => (document.querySelectorAll(".reqcard, .popt, button").length ? true : null),
    { message: "the requester door to render" });
  const picked = await page.evaluate((dept) => {
    const el = [...document.querySelectorAll(".reqcard, .popt, button, .card")]
      .find((x) => new RegExp(dept, "i").test(x.textContent || ""));
    if (!el) return null;
    el.click();
    return (el.textContent || "").trim().slice(0, 60);
  }, department);
  if (!picked) throw new HarnessError(`the requester door offers no "${department}" department`);
  await waitFor(page, () => (/Raise|request/i.test(document.body.innerText) && !/Sign in to raise/i.test(document.body.innerText) ? true : null),
    { message: `the portal to open as ${department}`, timeout: 20000 });
  return picked;
}

/* Raise a request the way a business user actually does: through the portal
   wizard. Returns the new request id.

   NOTE ON THE ENVIRONMENT. A portal requester has no SERVER identity in a
   sandbox — the portal is designed to sit behind Cloudflare Access, which
   supplies it in production, and no test can forge a signed CF assertion. So
   the request lands in the requester's own store and its server round-trip is
   covered from the legal side instead, where a real session exists. */
async function raiseViaPortal(page, sb, { title = "Mutual NDA with Orbit before diligence", nature = /entering into an agreement/i } = {}) {
  await goHash(page, "#/raise");
  await waitFor(page, () => (document.querySelector("input[type=text], textarea") ? true : null),
    { message: "the request wizard to open" });

  const typeInto = async () => page.evaluate((t) => {
    const setV = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, "value").set;
      set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.querySelectorAll("input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=date]), textarea")
      .forEach((el) => { if (!el.value) setV(el, t); });
    document.querySelectorAll("select").forEach((sel) => {
      if (!sel.value && sel.options.length > 1) {
        sel.value = sel.options[1].value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }, title);

  const clickNext = async (re) => page.evaluate((src) => {
    const rx = new RegExp(src, "i");
    const b = [...document.querySelectorAll("button")].find((x) => rx.test(x.textContent || "") && !x.disabled);
    if (!b) return null; b.click(); return (b.textContent || "").trim();
  }, re.source);

  // 1. what it is
  await typeInto();
  if (!(await clickNext(/^continue$/))) throw new HarnessError("the wizard would not advance past the first step");

  // 2. the nature of the matter
  await waitFor(page, () => (document.querySelectorAll(".popt").length ? true : null),
    { message: "the nature-of-matter options" });
  const picked = await page.evaluate((src) => {
    const rx = new RegExp(src, "i");
    const el = [...document.querySelectorAll(".popt")].find((x) => rx.test(x.textContent || ""));
    if (!el) return null; el.click(); return (el.textContent || "").trim().slice(0, 50);
  }, nature.source);
  if (!picked) throw new HarnessError("the wizard offers no matching nature-of-matter option");

  // 3. the details, then submit — however many steps the wizard puts in between
  for (let i = 0; i < 5; i++) {
    await sleep(500);
    await typeInto();
    const clicked = await clickNext(/^(continue|review|submit)/);
    if (!clicked) break;
    if (/submit/i.test(clicked)) break;
  }

  const id = await waitFor(page, (k) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (st.requests || [])[0];
    return r && r.id ? r.id : null;
  }, { arg: STORE_KEY, message: "the wizard to create a request", timeout: 15000 });
  return id;
}

/* Which build the page is serving. Never hardcode a src-vNNN: every cache bust
   changes it, and a suite pinned to one starts failing for a reason that has
   nothing to do with what it tests. */
async function buildDir(page, base) {
  const src = await page.evaluate(async (b) => {
    const html = await (await fetch(b + "/", { credentials: "include" })).text();
    const m = html.match(/(src-v\d+)\//);
    return m ? m[1] : null;
  }, base);
  if (!src) throw new HarnessError("could not work out which build the server is serving");
  return src;
}

/* Call a function in one of the app's own ES modules, BY NAME.
   The app ships a strict CSP with no 'unsafe-eval', so a helper that evaluates
   a source string cannot run in the page — naming the function is both the only
   way and the clearer one. */
function appCall(page, src, moduleName, fnName, ...args) {
  return page.evaluate(async ([s, m, f, a]) => {
    const mod = await import("/" + s + "/" + m);
    if (typeof mod[f] !== "function") return { __missing: true, error: `${m} has no export ${f}` };
    return mod[f](...a);
  }, [src, moduleName, fnName, args]);
}

/* ------------------------------------------------------------------ waiting */

/* Every wait is bounded and explains itself. `await sleep(1100)` guesses; this
   states a condition and fails with what it was still seeing. */
async function waitFor(page, fn, { timeout = 15000, message = "condition", poll = 200, arg } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { last = await page.evaluate(fn, arg); if (last) return last; } catch (e) { last = "evaluate threw: " + e.message; }
    await sleep(poll);
  }
  throw new HarnessError(`timed out after ${timeout}ms waiting for ${message}` +
    (typeof last === "string" ? ` (last: ${last.slice(0, 160)})` : ""));
}

async function waitForSelector(page, sel, { timeout = 15000, message } = {}) {
  try { await page.waitForSelector(sel, { timeout }); }
  catch (e) { throw new HarnessError(`timed out after ${timeout}ms waiting for ${message || `selector ${sel}`}`); }
}

/* Navigate within the SPA and wait for the route to actually be the one asked
   for, instead of sleeping and hoping. */
async function goHash(page, hash, { timeout = 15000 } = {}) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await waitFor(page, (h) => (location.hash === h || location.hash === "#" + h.replace(/^#/, "")) ? location.hash : null,
    { arg: hash, timeout, message: `the route to become ${hash}` });
  // one frame for the render the hash change triggers
  await waitFor(page, () => (document.querySelector(".page, .sidebar") ? true : null),
    { timeout, message: "the page shell to render after navigation" });
}

/* ---------------------------------------------------------------- app state */

const STORE_KEY = "legalos-store-v2";

/* Read the persisted client store, with a real error when it is absent.
   `JSON.parse(localStorage.getItem(k))` returning null is how thirteen suites
   reported "Cannot read properties of null" and looked like application bugs. */
async function readStore(page, { required = true } = {}) {
  const s = await page.evaluate((k) => {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }, STORE_KEY);
  if (!s && required) {
    throw new HarnessError(
      `the client store (${STORE_KEY}) is not present. The app writes it only once a session ` +
      `has booted the workspace — check that sign-in succeeded and the app finished loading.`);
  }
  return s;
}

async function waitForStore(page, { timeout = 20000 } = {}) {
  await waitFor(page, (k) => {
    try { return localStorage.getItem(k) ? true : null; } catch (e) { return null; }
  }, { arg: STORE_KEY, timeout, message: `the client store ${STORE_KEY} to be written` });
  return readStore(page);
}

/* Seed a request through the SERVER, which is where requests now live
   (api/requests.js -> config/requests.json). Writing one into localStorage
   tests nothing: the store is hydrated from the server at boot and the browser
   copy would be overwritten. */
async function seedRequest(sb, cookie, payload) {
  const r = await request(sb.base, "POST", "/api/requests", { cookie, body: payload });
  if (r.status >= 300 || !(r.body && (r.body.ok || r.body.request))) {
    throw new HarnessError(`could not seed request ${payload && payload.id}: HTTP ${r.status} ${(r.body && r.body.error) || r.text.slice(0, 160)}`);
  }
  return r.body.request;
}

/* One request as the server holds it. */
async function getRequest(sb, cookie, id) {
  const r = await request(sb.base, "GET", "/api/requests", { cookie });
  return ((r.body && r.body.requests) || []).find((x) => x.id === id) || null;
}

/* ------------------------------------------------------------------ browser */

async function openBrowser() {
  const puppeteer = require("./_puppeteer.js");
  const exe = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
  if (!fs.existsSync(exe)) throw new HarnessError(`Chrome not found at ${exe}. Set CHROME=/path/to/chrome.`);
  // The profile directory and its removal are the shim's job, so the eleven
  // suites that launch their own browser get the same cleanup as this one.
  return puppeteer.launch({
    executablePath: exe,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000 },
  });
}

/* ------------------------------------------------------------- suite runner */

/* Wraps a suite so cleanup always happens, harness failures are labelled as
   such, and the exit code distinguishes them from product failures.
     0  every check passed
     1  a product assertion failed
     3  the harness could not run the test at all          */
function runSuite(name, body) {
  const results = [];
  const pageErrors = [];
  const check = (n, pass, detail) => {
    results.push({ name: n, pass: !!pass, detail: detail || "" });
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${n}${detail ? "  — " + detail : ""}`);
  };
  let sb = null;
  let browser = null;
  const ctx = {
    check, results, pageErrors,
    setSandbox: (s) => { sb = s; return s; },
    setBrowser: (b) => { browser = b; return b; },
  };

  (async () => {
    console.log(`\n=== ${name} ===`);
    await body(ctx);
  })().then(
    () => finish(null),
    (e) => finish(e)
  );

  function finish(err) {
    try { if (browser) browser.close(); } catch (e) {}
    try { if (sb) sb.stop(); } catch (e) {}
    // Chrome is being killed by the exit below, so its own cleanup never runs.
    try { require("./_puppeteer.js").cleanProfiles(); } catch (e) { /* best effort */ }
    const pass = results.filter((r) => r.pass).length;
    const fail = results.length - pass;

    if (err && err.harness) {
      console.log(`\n  HARNESS ERROR  ${err.message}`);
      console.log(`  ${pass}/${results.length} checks ran before the harness failed`);
      process.exit(3);
    }
    if (err) {
      console.log(`\n  FATAL  ${err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n         ") : err}`);
      process.exit(1);
    }
    if (pageErrors.length) {
      console.log(`\n  page errors (${pageErrors.length}):`);
      [...new Set(pageErrors)].slice(0, 6).forEach((e) => console.log("    " + String(e).slice(0, 160)));
    }
    console.log(`\n  ${pass}/${results.length} checks passed${fail ? `, ${fail} FAILED` : ""}`);
    if (fail) for (const r of results.filter((x) => !x.pass)) console.log("  FAILED: " + r.name + (r.detail ? "  — " + r.detail : ""));
    process.exit(fail || pageErrors.length ? 1 : 0);
  }
}

/* Attach page-error capture so a suite never has to remember to. */
function watchPage(page, ctx) {
  page.__ctx = ctx;
  /* These handlers run on Chrome's event loop, OUTSIDE any await, so anything
     they throw is an unhandled rejection that kills the whole node process —
     the suite dies mid-run with a puppeteer stack trace and no indication which
     assertion it was on. A ctx without `pageErrors` (any caller that is not
     runSuite) used to do exactly that. Collect into a local array the ctx may
     adopt, and never throw from a listener. */
  if (!Array.isArray(ctx.pageErrors)) ctx.pageErrors = [];
  const note = (line) => { try { ctx.pageErrors.push(line); } catch (e) { /* never throw from a listener */ } };
  page.on("pageerror", (e) => note("PAGEERROR: " + e.message));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (/favicon/i.test(u)) return;
    if (page.__expect401) return;
    /* A CANCELLED LOAD IS NOT A FAILED ONE.
       The document viewer renders a file in an iframe. Close it, or move to the
       next document, and the browser aborts the load it no longer needs --
       net::ERR_ABORTED, by design, on a request that was never going to be
       read. Two suites were failing on exactly that with every check passing.
       Every other network failure (refused, reset, DNS, timeout) still counts,
       because those mean the page asked for something it could not get. */
    const why = (r.failure() && r.failure().errorText) || "";
    if (/ERR_ABORTED/.test(why)) return;
    note("REQFAILED: " + why + " " + u.slice(0, 120));
  });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error") return;
    if (/favicon/i.test(t)) return;
    /* AN HTTP REFUSAL IS NOT A PAGE ERROR.
       Chrome logs "Failed to load resource: the server responded with a status
       of 404" for any non-2xx the page fetches, and that message carries no URL
       -- so it can neither be acted on nor told apart from a refusal the test
       deliberately provoked. Suites that PROVE a boundary by asking for
       something they may not have (m45 asserts that an unknown document id is a
       plain 404; m37 that a member cannot approve a deletion) were failing on
       the very refusal they exist to assert, with every check passing and no
       explanation printed anywhere.

       A page error is an uncaught exception or a request that failed at the
       network level -- both still reported above. Unexpected HTTP responses are
       caught where they can actually be named: m1-control-disposition listens on
       `response`, records STATUS + URL for every non-2xx while exercising all
       4,300 controls, and fails with the addresses. That is the net for this,
       and it is a better one than an anonymous console line.

       The sign-in screen's own 401 stays filtered for the same reason it always
       was, since it is noise even by the stricter reading. */
    if (/Failed to load resource/i.test(t)) return;
    if (/status of 401/.test(t) && (ctx.__onLoginScreen || page.__expect401)) return;
    note("CONSOLE: " + t);
  });
  return page;
}

module.exports = {
  HarnessError, ROOT, STORE_KEY, USERS,
  startSandbox, probeHealth, request,
  setPassword, loginApi, loginAs, logout, expectAuthenticated, currentUser, asUser, enterPortalAs, raiseViaPortal,
  waitFor, waitForSelector, goHash, sleep, buildDir, appCall,
  readStore, waitForStore, seedRequest, getRequest,
  openBrowser, runSuite, watchPage,
};
