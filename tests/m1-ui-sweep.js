// UI sweep: every route renders, every record resolves, nothing overflows.
//
// Three checks that must never regress together:
//   1. ROUTES    — every route renders with no console/page error, and invalid
//                  routes/ids degrade to an honest empty state.
//   2. RECORDS   — EVERY record (not a sample) has a stable id, is unique, keeps
//                  its documents through the adapter, and resolves to a detail.
//   3. RESPONSIVE— five viewports; nothing may overflow outside a scroller.
//
// Point it at a running instance:  QA_BASE=http://127.0.0.1:4720 QA_PW=... node tests/m1-ui-sweep.js
const puppeteer = require("./_puppeteer.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path0 = require("path");
const http0 = require("http");

/* SELF-CONTAINED by default: the suite stands up its own isolated instance and
   provisions its own credential. Pointing it at a shared server meant the
   password it set (in the repo) did not match the server it signed in to, and
   every later check then failed for the wrong reason — it reported four
   "broken" routes that were simply never signed in. Set QA_BASE to test an
   already-running instance, in which case QA_PW must match it. */
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const OWN_PORT = process.env.LEGALOS_UI_PORT || "4761";
const EXTERNAL = !!process.env.QA_BASE;
const B = process.env.QA_BASE || `http://127.0.0.1:${OWN_PORT}`;
let PW = process.env.QA_PW || "";
const USER = process.env.QA_USER || "maryam.haq@zameen.com";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

const ROUTES = ["/exec","/workspace","/requests","/matters","/contracts","/tracker","/projects",
 "/g/commercial","/g/compliance","/g/litigation","/g/shared","/g/insight","/g/admin",
 "/m/contracts","/m/vetting","/m/agreements","/m/resolutions","/m/licenses","/m/filings",
 "/m/cases","/m/assetRecovery","/m/ip","/m/developerDisputes","/m/police","/m/notices","/m/inspections",
 "/compliance","/licenses","/litigation","/repository","/companies","/drafting","/templates","/clauses",
 "/knowledge","/costs","/analyzer","/pipelines","/reports","/access","/datahealth","/organization",
 "/settings","/portal","/triage","/copilot","/automation","/reviews","/approvals","/negotiations"];
const BAD = ["/nonexistent-route","/rec/litigation/NOPE-123","/contracts/NOPE-123","/rec/badkind/x"];

let SANDBOX = null, server = null;
const ping = () => new Promise((resolve) => {
  const r = http0.get(B + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); });
  r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); });
});

(async () => {
  if (!EXTERNAL) {
  /* Refuse to run against a server that is already listening.
     A leftover instance from a crashed run keeps the port; this run's server
     then fails to bind silently and every request goes to the STALE sandbox —
     which produces confident nonsense (duplicate record ids, an empty store,
     "not signed in") that reads exactly like a product bug. */
  await new Promise((resolve) => {
    const probe = http0.get(B + "/api/health", (r) => {
      r.resume();
      if (r.statusCode === 200) {
        console.error("\n  port " + OWN_PORT + " is already in use — a previous run did not shut down.");
        console.error("  Stop it first. Refusing to test a stale instance.\n");
        process.exit(2);
      }
      resolve();
    });
    probe.on("error", () => resolve());
    probe.setTimeout(1500, () => { probe.destroy(); resolve(); });
  });

    SANDBOX = fs.mkdtempSync(path0.join(os.tmpdir(), "legalos-ui-"));
    const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
      "--exclude", "legalos/", path0.join(__dirname, "..") + "/", SANDBOX + "/"]);
    if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
    fs.symlinkSync(path0.join(__dirname, "..", "node_modules"), path0.join(SANDBOX, "node_modules"));
    const cfgPath = path0.join(SANDBOX, "config", "legalos.config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.access.enforce = false; cfg.access.devBypassEmail = USER;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    const out = spawnSync("node", ["tools/legalos-passwd.js", "set", USER], { cwd: SANDBOX, encoding: "utf8" });
    const m = (out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/);
    if (m) PW = m[1];
    server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT: OWN_PORT, LEGALOS_DEV: "1" } });
    for (let i = 0; i < 40 && !(await ping()); i++) await w(400);
    if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }
  }
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({ width: 1600, height: 1000 });
  let route = ""; const errors = [];
  p.on("pageerror", (e) => errors.push({ route, msg: String(e.message).slice(0, 120) }));
  p.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/favicon|401|403|429/.test(t)) errors.push({ route, msg: t.slice(0, 120) }); } });

  await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(2000);
  // Set this run's password rather than trusting a baked one: a stale literal
  // silently fails the login and every later check then fails for the wrong
  // reason (it reported 4 "broken" routes that were simply never signed in).
  await p.type('input[name="email"]', USER); await p.type('input[name="password"]', PW);
  await p.click('button[type="submit"]'); await w(4000);
  const ver = await p.evaluate(() => { const s = [...document.querySelectorAll("script")].map((x) => x.src).find((x) => /src-v\d+/.test(x)); return (s && s.match(/src-v\d+/) || ["src"])[0]; });
  console.log("  build:", ver, "\n");

  console.log("1. Routes render");
  let blank = 0;
  for (const r of ROUTES) {
    route = r;
    await p.goto(B + "/#" + r, { waitUntil: "networkidle2", timeout: 45000 }); await w(1200);
    const len = await p.evaluate(() => document.body.innerText.trim().length);
    if (len < 60) blank++;
  }
  check(`all ${ROUTES.length} routes render content`, blank === 0, blank + " blank");
  check("the sweep was signed in (not stuck on the login screen)",
    !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText)),
    "still on the login screen — the credential did not work");
  check("no console or page errors across the sweep", errors.length === 0, errors.slice(0, 3).map((e) => e.route + ": " + e.msg).join(" | "));

  console.log("\n2. Invalid routes and ids degrade honestly");
  for (const r of BAD) {
    route = r;
    await p.goto(B + "/#" + r, { waitUntil: "networkidle2", timeout: 40000 }); await w(1100);
    const t = await p.evaluate(() => document.body.innerText);
    check(`${r} shows an empty state, not a crash`, /not available yet|Page not found|Unknown record type|not found\.|do not have access/i.test(t));
  }

  console.log("\n3. Every record resolves and keeps its documents");
  const res = await p.evaluate(async (v) => {
    const api = (await import(`./${v}/api.js`)).api;
    const live = await import(`./${v}/live.js`);
    const rw = await import(`./${v}/pages/recordworkspace.js`);
    const KIND = { litigation: "litigation", notices: "notice", licences: "licence", loans: "loan", resolutions: "resolution", properties: "property" };
    const FN = { contracts: "adaptContracts", litigation: "adaptLitigation", notices: "adaptNotices", licences: "adaptLicences", loans: "adaptLoans", resolutions: "adaptResolutions", properties: "adaptProperties" };
    const t = { records: 0, adapted: 0, noId: 0, dup: 0, docLoss: 0, docsRaw: 0, docsUI: 0, resolvable: 0, kindMissing: 0 };
    const seen = new Set();
    for (const [key, fn] of Object.entries(FN)) {
      const r = await api.registers.list(key, { limit: 20000 });
      const raw = r.records || []; const ad = live[fn](raw);
      const byId = new Map(ad.map((x) => [x.id, x]));
      const rawById = new Map(raw.filter((x) => x.id).map((x) => [x.id, x]));
      if (KIND[key] && !rw.RECORD_KINDS.has(KIND[key])) t.kindMissing++;
      for (const a of ad) {
        if (!a || !a.id) { t.noId++; continue; }
        if (seen.has(a.id)) t.dup++; else seen.add(a.id);
        const src = rawById.get(a.id) || {};
        const nr = (src.driveFiles || []).length, na = (a.driveFiles || []).length;
        t.docsRaw += nr; t.docsUI += na; if (na !== nr) t.docLoss++;
        if (byId.get(a.id) === a) t.resolvable++;
      }
      t.records += raw.length; t.adapted += ad.length;
    }
    return t;
  }, ver);
  check("every record adapts", res.adapted === res.records, `${res.adapted}/${res.records}`);
  check("every record has a stable id", res.noId === 0, String(res.noId));
  check("no duplicate ids", res.dup === 0, String(res.dup));
  check("every record resolves to its detail", res.resolvable === res.records, `${res.resolvable}/${res.records}`);
  check("no documents lost in the adapters", res.docLoss === 0, String(res.docLoss));
  check("document totals survive source -> UI", res.docsRaw === res.docsUI, `${res.docsRaw} -> ${res.docsUI}`);
  check("every record kind has a detail config", res.kindMissing === 0, String(res.kindMissing));

  console.log("\n4. Responsive: nothing overflows outside a scroller");
  const VP = [["large desktop",1920,1080],["desktop",1440,900],["laptop",1280,800],["tablet",834,1112],["mobile",390,844]];
  const RR = ["/exec","/contracts","/litigation","/compliance","/access","/datahealth","/m/cases"];
  for (const [name, wd, ht] of VP) {
    await p.setViewport({ width: wd, height: ht });
    let worst = 0, where = "";
    for (const r of RR) {
      route = r;
      await p.goto(B + "/#" + r, { waitUntil: "networkidle2", timeout: 40000 }); await w(1100);
      const o = await p.evaluate(() => {
        const de = document.documentElement;
        const scrollable = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const c = getComputedStyle(n); if (c.overflowX === "auto" || c.overflowX === "scroll") return true; } return false; };
        let by = 0, what = "";
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
          if (cs.position === "fixed" || cs.position === "sticky") continue;
          if (scrollable(el)) continue;
          const r2 = el.getBoundingClientRect();
          const over = Math.round(r2.right - de.clientWidth);
          if (over > by && r2.width > 0) { by = over; what = String(el.className || el.tagName).slice(0, 30); }
        }
        return { page: de.scrollWidth - de.clientWidth, by, what };
      });
      if (o.page > 0 || o.by > 4) { if (o.by > worst) { worst = o.by; where = r + " " + o.what; } }
    }
    check(`${name} (${wd}px): no element overflows the viewport`, worst === 0, where + " +" + worst + "px");
  }

  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));
  await b.close();
  try { if (server) server.kill("SIGKILL"); } catch (e) {}
  try { if (SANDBOX) fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("SUITE ERROR:", e); process.exit(1); });
