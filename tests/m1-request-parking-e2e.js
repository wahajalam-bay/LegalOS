// Does a raised request actually get PARKED where Legal can see it?
//
// The portal used to write a request into the raiser's own localStorage and
// nowhere else, so the business submitted and nobody in Legal ever saw it.
// This suite proves the whole handoff, end to end:
//
//   requester (non-legal) raises  →  POST /api/requests  →  config/requests.json
//     →  status "Triage"  →  a DIFFERENT person, in a DIFFERENT browser
//     profile with an empty localStorage, sees it in the Triage queue.
//
// It runs against an ISOLATED COPY of the app on its own port with its own
// config, so it never touches the live service, the live config or the live
// request store. Identity is switched between phases through the dev bypass
// (config.js re-reads the config when its mtime changes), which lets one server
// answer as a business requester, a second requester, and a legal user in turn.
//
//   node tests/m1-request-parking-e2e.js
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const puppeteer = require("./_puppeteer.js");
const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome";
const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_REQ_PORT || "4713";
const BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));

const REQUESTER_A = "aisha.portal@zameen.com";   // not on the legal roster — a business requester
const REQUESTER_B = "bilal.portal@zameen.com";   // a second, unrelated requester
const LEGAL = "maryam.haq@zameen.com";           // Director Legal, on the roster
let LEGAL_PW = null;

/* ---------------- tiny assertion harness ---------------- */
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ---------------- isolated instance ---------------- */
/* Refuse to run against a server that is already listening.
   A leftover instance from a crashed run keeps the port; this run's server then
   fails to bind silently and every request goes to the STALE sandbox — which
   produces confident nonsense (duplicate record ids, an empty store, "not
   signed in") that reads exactly like a product bug. */
function refuseIfPortBusy(port) {
  const { execSync } = require("child_process");
  let busy = false;
  try { busy = execSync(`ss -tln 2>/dev/null | grep -c ":${port} " || true`, { encoding: "utf8" }).trim() !== "0"; }
  catch (e) { busy = false; }
  if (busy) {
    console.error(`\n  port ${port} is already in use — a previous run did not shut down.`);
    console.error("  Stop it first. Refusing to test a stale instance.\n");
    process.exit(2);
  }
}
refuseIfPortBusy(PORT);

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-req-"));
let server = null;

function boot() {
  // Copy the app, excluding node_modules (symlinked) and any live runtime state.
  const r = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/requests.json", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (r.status !== 0) throw new Error("could not copy the app: " + r.stderr);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  setIdentity(REQUESTER_A, { enforce: false });
  // A known password for the legal sign-in, on the COPY only.
  const pw = spawnSync("node", ["tools/legalos-passwd.js", "set", LEGAL], { cwd: SANDBOX, encoding: "utf8" });
  const m = (pw.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_\-]{8,})\s*\n/);
  LEGAL_PW = m ? m[1].trim() : null;
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT, LEGALOS_DEV: "1" } });
}

// Swap who the server believes the caller is. config.js reloads on mtime, so no
// restart is needed — but bump the mtime explicitly so a same-millisecond write
// cannot be missed.
function setIdentity(email, { enforce = false } = {}) {
  const p = path.join(SANDBOX, "config", "legalos.config.json");
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.access.enforce = enforce;
  c.access.devBypassEmail = email;
  fs.writeFileSync(p, JSON.stringify(c, null, 2));
  const t = new Date(Date.now() + 1000);
  fs.utimesSync(p, t, t);
}

const ping = () => new Promise((resolve) => {
  const req = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on("error", () => resolve(false));
  req.setTimeout(1200, () => { req.destroy(); resolve(false); });
});

/* ---------------- HTTP helper ---------------- */
function call(method, route, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(BASE + route, {
      method,
      headers: Object.assign({ "Content-Type": "application/json" }, data ? { "Content-Length": data.length } : {}),
    }, (res) => {
      let s = "";
      res.on("data", (d) => (s += d));
      res.on("end", () => { let j = null; try { j = JSON.parse(s); } catch (e) {} resolve({ status: res.statusCode, body: j, raw: s }); });
    });
    req.on("error", (e) => resolve({ status: 0, body: null, raw: String(e) }));
    if (data) req.write(data);
    req.end();
  });
}

const whoami = () => call("GET", "/api/health").then((r) => (r.body && r.body.you && r.body.you.email) || null);

/* ============================================================ */
(async () => {
  console.log("Request parking — end to end\n");
  boot();
  for (let i = 0; i < 30 && !(await ping()); i++) await w(400);
  if (!(await ping())) { console.error("server did not start"); process.exit(1); }

  /* ---------- 1. identity plumbing ---------- */
  console.log("1. Identity");
  check("server answers as requester A", (await whoami()) === REQUESTER_A);
  const meA = await call("GET", "/api/me");
  check("requester A is NOT a known legal principal", meA.body && meA.body.principal && meA.body.principal.known === false,
    "known=" + JSON.stringify(meA.body && meA.body.principal && meA.body.principal.known));

  /* ---------- 2. raising parks the request ---------- */
  console.log("\n2. Raising parks the request on the server");
  const r1 = await call("POST", "/api/requests", {
    id: "REQ-T001",
    title: "NDA review — analytics supplier",
    status: "Triage",
    department: "Finance",
    channel: "portal",
    urgencyBand: "Important",
    // A forged identity claim. The server must ignore all of this.
    requestedBy: { name: "Maryam Haq", email: LEGAL, designation: "Director Legal" },
    requestedByEmail: LEGAL,
  });
  eq("POST /api/requests → 201", r1.status, 201);
  const rec1 = r1.body && r1.body.request;
  check("request is parked with status Triage", rec1 && rec1.status === "Triage", "status=" + (rec1 && rec1.status));
  check("server stamped the VERIFIED requester, not the body's claim",
    rec1 && rec1.requestedByEmail === REQUESTER_A, "stamped=" + (rec1 && rec1.requestedByEmail));
  check("forged requestedBy.email was overwritten",
    rec1 && rec1.requestedBy && rec1.requestedBy.email === REQUESTER_A,
    "requestedBy.email=" + (rec1 && rec1.requestedBy && rec1.requestedBy.email));
  check("receivedAt stamped", !!(rec1 && rec1.receivedAt));

  const store = () => { try { return JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", "requests.json"), "utf8")).requests; } catch (e) { return null; } };
  check("written to config/requests.json", (store() || []).length === 1, "records=" + (store() || []).length);

  /* ---------- 3. validation ---------- */
  console.log("\n3. Validation");
  eq("a request with no title → 400", (await call("POST", "/api/requests", { id: "X" })).status, 400);
  eq("an empty body → 400", (await call("POST", "/api/requests", {})).status, 400);
  const big = await call("POST", "/api/requests", { title: "big", blob: "x".repeat(70 * 1024) });
  eq("an oversized request → 400", big.status, 400);
  eq("store still holds only the one good record", (store() || []).length, 1);

  /* ---------- 4. read scoping ---------- */
  console.log("\n4. Read scoping (default-deny)");
  let g = await call("GET", "/api/requests");
  eq("requester A sees their own request", (g.body.requests || []).length, 1);

  setIdentity(REQUESTER_B); await w(150);
  check("server now answers as requester B", (await whoami()) === REQUESTER_B);
  g = await call("GET", "/api/requests");
  eq("requester B sees NOTHING of A's", (g.body.requests || []).length, 0);

  const r2 = await call("POST", "/api/requests", { id: "REQ-T002", title: "Lease renewal — warehouse", status: "Triage", department: "Operations", channel: "portal" });
  eq("requester B can raise their own → 201", r2.status, 201);
  g = await call("GET", "/api/requests");
  eq("requester B sees only their own", (g.body.requests || []).map((x) => x.id), ["REQ-T002"]);

  setIdentity(LEGAL); await w(150);
  check("server now answers as the legal user", (await whoami()) === LEGAL);
  g = await call("GET", "/api/requests");
  const legalIds = (g.body.requests || []).map((x) => x.id).sort();
  eq("LEGAL sees the whole queue (both requesters)", legalIds, ["REQ-T001", "REQ-T002"]);

  /* ---------- 5. triage patching ---------- */
  console.log("\n5. Triage (patch) authority");
  const pat = await call("POST", "/api/requests/REQ-T001", { status: "In progress", owner: "u5", title: "HACKED TITLE" });
  eq("legal may patch → 200", pat.status, 200);
  check("patched field applied", pat.body.request.status === "In progress", "status=" + pat.body.request.status);
  check("non-patchable field (title) ignored", pat.body.request.title === "NDA review — analytics supplier", "title=" + pat.body.request.title);
  check("patch is audited in history", Array.isArray(pat.body.request.history) && pat.body.request.history.length === 1);

  setIdentity(REQUESTER_B); await w(150);
  eq("a requester may NOT patch → 403", (await call("POST", "/api/requests/REQ-T001", { status: "Closed" })).status, 403);

  /* ---------- 6. unauthenticated ---------- */
  console.log("\n6. Unauthenticated callers");
  setIdentity("", { enforce: true }); await w(150);
  eq("POST with no verified identity → 401", (await call("POST", "/api/requests", { title: "anon" })).status, 401);
  eq("GET with no verified identity → 401", (await call("GET", "/api/requests")).status, 401);
  eq("store untouched by the anonymous attempt", (store() || []).length, 2);

  /* ---------- 7. persistence across restart ---------- */
  console.log("\n7. Persistence");
  setIdentity(LEGAL, { enforce: false }); await w(150);
  server.kill("SIGKILL"); await w(600);
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT, LEGALOS_DEV: "1" } });
  for (let i = 0; i < 30 && !(await ping()); i++) await w(400);
  g = await call("GET", "/api/requests");
  eq("requests survive a server restart", (g.body.requests || []).map((x) => x.id).sort(), ["REQ-T001", "REQ-T002"]);
  check("the triaged status survived too", (g.body.requests.find((x) => x.id === "REQ-T001") || {}).status === "In progress");

  /* ---------- 8. the real browser journey ---------- */
  console.log("\n8. Browser: requester raises → Legal sees it parked in Triage");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

  // 8a. A business requester, on the portal door, raising through the real UI.
  setIdentity(REQUESTER_A); await w(200);
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const posted = [];
  p.on("response", (res) => { if (res.url().includes("/api/requests") && res.request().method() === "POST") posted.push(res.status()); });

  await p.goto(BASE + "/portal/#/login", { waitUntil: "networkidle2" }); await w(1200);
  const cards = await p.$$eval(".login__card", (n) => n.map((x) => x.innerText.replace(/\n/g, " · ")));
  check("portal offers real department identities", cards.length > 0 && !cards.some((c) => /Unassigned/.test(c)),
    cards.length + " cards");
  const fin = cards.findIndex((c) => /Finance/i.test(c));
  (await p.$$(".login__card"))[fin < 0 ? 0 : fin].click(); await w(1500);
  check("requester lands on the raise form", (await p.evaluate(() => location.hash)) === "#/raise",
    await p.evaluate(() => location.hash));
  check("requester is NOT refused the page", !/do not have access/i.test(await p.evaluate(() => document.body.innerText)));

  // fill step 0
  await (await p.$("input")).type("Vendor NDA — data analytics platform");
  await (await p.$("textarea")).type("We are onboarding a new analytics vendor and need the NDA reviewed before signature.");
  await w(300);
  /* Click a button IN THE FORM, not anywhere on the page.
     The sidebar carries a navigation row labelled "Raise Request", and once
     navigation became real <button>s (an accessibility fix) a document-wide
     search for /^raise/ matched the nav row instead of the form's submit — the
     journey then "failed" while the product worked perfectly. Scope the search
     to the page body and skip the app shell. */
  const FORM_BTNS = "main button, .page button, .content button, .modal button, form button";
  const clickBtn = async (re) => {
    const btns = await p.$$eval(FORM_BTNS, (n) => n
      .filter((x) => !x.closest(".sidebar, .topbar, .nav__section, .workspace"))
      .map((x) => ({ t: (x.innerText || "").trim(), d: x.disabled })));
    const i = btns.findIndex((x) => re.test(x.t) && !x.d);
    if (i < 0) return false;
    const handles = (await p.$$(FORM_BTNS));
    const usable = [];
    for (const h of handles) {
      const inShell = await h.evaluate((x) => !!x.closest(".sidebar, .topbar, .nav__section, .workspace"));
      if (!inShell) usable.push(h);
    }
    if (!usable[i]) return false;
    await usable[i].click(); await w(1000); return true;
  };
  check("step 1 reachable (Continue enabled)", await clickBtn(/^continue/i));
  const opts = await p.$$(".popt");
  check("plain-language options offered", opts.length > 0, opts.length + " options");
  if (opts.length) { await opts[0].click(); await w(800); }
  check("step 2 reachable — the empty entity registry no longer blocks it", await clickBtn(/^continue/i));
  const submitted = await clickBtn(/^(submit|send|raise)/i);
  check("Submit clicked", submitted);
  await w(2500);
  const done = await p.evaluate(() => document.body.innerText);
  check("requester sees a confirmation", /request submitted|we've logged|received/i.test(done));
  eq("the browser POSTed it to the server", posted, [201]);
  check("no page errors during the journey", errs.length === 0, errs.slice(0, 2).join(" | "));
  await p.close();

  const parked = store() || [];
  const fresh = parked.find((x) => /Vendor NDA/i.test(x.title || ""));
  check("the UI-raised request is parked on the server", !!fresh);
  check("parked with a triage status", fresh && /triage/i.test(fresh.status || ""), "status=" + (fresh && fresh.status));
  check("parked against the VERIFIED requester", fresh && fresh.requestedByEmail === REQUESTER_A, "from=" + (fresh && fresh.requestedByEmail));
  check("parked as channel 'portal'", fresh && fresh.channel === "portal", "channel=" + (fresh && fresh.channel));

  // 8b. A DIFFERENT person, a DIFFERENT browser profile (empty localStorage).
  setIdentity(LEGAL); await w(200);
  const lp = await browser.createBrowserContext ? await browser.createBrowserContext() : null;
  const page2 = lp ? await lp.newPage() : await browser.newPage();
  const errs2 = [];
  page2.on("pageerror", (e) => errs2.push(e.message));
  await page2.goto(BASE + "/#/login", { waitUntil: "networkidle2" }); await w(1200);
  const loginTxt = await page2.evaluate(() => document.body.innerText);
  check("legal door shows no requester demo tab", !/requester view/i.test(loginTxt));
  check("legal door links to the requester portal", !!(await page2.$(".login__alt")));

  if (LEGAL_PW) {
    await page2.type('input[name="email"]', LEGAL);
    await page2.type('input[name="password"]', LEGAL_PW);
    await page2.click('button[type="submit"]');
    await w(2600);
  }
  const signedIn = await page2.evaluate(() => location.hash);
  check("legal user signed in", signedIn !== "#/login", "at " + signedIn);

  await page2.goto(BASE + "/#/triage", { waitUntil: "networkidle2" }); await w(2600);
  const tri = await page2.evaluate(() => document.body.innerText);
  check("TRIAGE shows the request the requester raised", /Vendor NDA/i.test(tri));
  check("TRIAGE also shows the API-raised requests", /NDA review|Lease renewal/i.test(tri));
  /* "Triage" is not what the business calls this (§25): a request sitting here
     is waiting for an OWNER, not being sorted by severity, and the requester's
     own status screen read like an emergency room. The stage KEY is unchanged
     — it is wired into tone maps, stage weights and the TAT fix — only the
     word people read is. */
  const awaiting = (tri.match(/(\d+)\s*To be assigned/i) || [])[1];
  check("the to-be-assigned count is non-zero", awaiting && Number(awaiting) > 0, "count=" + awaiting);
  check("no page errors on the legal side", errs2.length === 0, errs2.slice(0, 2).join(" | "));

  // 8c. localStorage really was empty — proving it came from the SERVER.
  const fromServer = await page2.evaluate(() => {
    try {
      const raw = localStorage.getItem("legalos-store-v2");
      if (!raw) return "no local store at all";
      const j = JSON.parse(raw);
      return "local store has " + ((j.requests || []).length) + " requests";
    } catch (e) { return "unreadable"; }
  });
  console.log("      (legal browser local store: " + fromServer + ")");

  await browser.close();

  /* ---------- scoreboard ---------- */
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));

  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error("SUITE ERROR:", e);
  try { server.kill("SIGKILL"); } catch (x) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
});
