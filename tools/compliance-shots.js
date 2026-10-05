// Visual check for the Compliance workspace: every tab, in a real browser,
// against an isolated sandbox. Captures page errors as well as pixels, because
// a screenshot of a blank page still looks like a screenshot.
//
//   node tools/compliance-shots.js [outDir]
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_SHOT_PORT || "4761";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.argv[2] || path.join(os.tmpdir(), "legalos-shots");
const w = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const email = "maryam.haq@zameen.com";
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-shot-"));
  spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = email;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";

  // Cookie path "/" because the sandbox is served at the root, not under
  // /legalos/ — otherwise the browser never sends the session back and every
  // page renders as the signed-out landing screen.
  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  const ping = () => new Promise((resolve) => { const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); }); r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); }); });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);


  const b = await puppeteer.launch({
    executablePath: process.env.CHROME || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1480, height: 1150 },
  });
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errs.push("CONSOLE: " + m.text().slice(0, 180)); });

  // Sign in through the REAL form. Posting to /api/auth/login directly sets the
  // cookie but leaves the client's own identity state empty, so the app renders
  // the sign-in screen and every capture would be a screenshot of the login page.
  await p.setCacheEnabled(false);
  await p.goto(BASE + "/#/login", { waitUntil: "networkidle2" });
  await w(2000);
  await p.type('input[name="email"]', email);
  await p.type('input[name="password"]', pw);
  await p.click('button[type="submit"]');
  await w(4000);
  const signedIn = !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText));
  if (!signedIn) { console.error("sign-in failed"); process.exit(1); }
  console.log("signed in as " + email + "\n");

  const TABS = [
    ["overview", "#/compliance"],
    ["loans", "#/compliance/loans"],
    ["leases", "#/compliance/leases"],
    ["services", "#/compliance/services"],
    ["resolutions", "#/compliance/resolutions"],
    ["licenses", "#/compliance/licenses"],
    ["secp", "#/compliance/sec-filings"],
    ["hub-redirect", "#/g/compliance"],
    ["legacy-view-query", "#/compliance?view=loans"],
  ];
  for (const [name, hash] of TABS) {
    // Bounce through a neutral route: changing only the hash does NOT reload an
    // SPA, so without this every capture would show the previous tab's state.
    await p.goto(BASE + "/#/dashboard", { waitUntil: "networkidle2" });
    await p.goto(BASE + "/" + hash, { waitUntil: "networkidle2" });
    await w(2500);
    await p.screenshot({ path: path.join(OUT, "compliance-" + name + ".png") });
    const info = await p.evaluate(() => ({
      kpis: [...document.querySelectorAll(".metric,.ovmod,.regsum__i")].length,
      statstrip: [...document.querySelectorAll(".metric__value,.metric")].length,
      rows: document.querySelectorAll("tbody tr").length,
      heading: (document.querySelector("h1") || {}).textContent || "",
      firstKpis: [...document.querySelectorAll(".cmod")].slice(0, 9)
        .map((n) => n.innerText.replace(/\s+/g, " ").trim()).join("  |  "),
      filters: [...document.querySelectorAll(".fltbtn,.regbar select,.regbar button")]
        .map((n) => n.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 14).join(", "),
      controls: [...document.querySelectorAll("button")].map((n) => n.innerText.replace(/\s+/g, " ").trim())
        .filter((t) => /new filing|create|apply|open ezfile|export|views|columns/i.test(t)).join(", "),
      count: (document.querySelector(".regcount") || {}).textContent || "",
      crumbs: [...document.querySelectorAll(".topbar__crumbs .crumbbtn, .topbar__crumbs b")].map((n) => n.innerText.trim()).join(" > "),
      tabstrip: document.querySelectorAll(".regtabs [role=tab]").length,
      cardH: (() => { const c = document.querySelector(".cmod"); return c ? Math.round(c.getBoundingClientRect().height) : 0; })(),
      hash: location.hash,
      links: [...document.querySelectorAll("a[target=_blank]")]
        .map((n) => n.innerText.replace(/\s+/g, " ").trim() + " -> " + n.getAttribute("href")).slice(0, 4).join(" ; "),
    }));
    console.log(`\n  === ${name.toUpperCase()} ===  rows=${info.rows}  ${info.count}  [${info.hash}]`);
    console.log("    CRUMBS:   " + info.crumbs);
    console.log("    tab-strip items: " + info.tabstrip + (info.cardH ? "   card height: " + info.cardH + "px" : ""));
    if (info.firstKpis) console.log("    CARDS:    " + info.firstKpis.slice(0, 260));
    if (info.filters) console.log("    FILTERS:  " + info.filters.slice(0, 220));
    if (info.controls) console.log("    ACTIONS:  " + info.controls.slice(0, 160));
    if (info.links) console.log("    LINKS:    " + info.links.slice(0, 200));
  }
  console.log("\n" + (errs.length ? "PAGE ERRORS:\n  " + [...new Set(errs)].slice(0, 12).join("\n  ") : "no page errors on any tab"));
  console.log("screenshots: " + OUT);
  await b.close();
  try { server.kill(); } catch (e) {}
})().catch((e) => { console.error(e); process.exit(1); });
