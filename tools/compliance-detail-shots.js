// Record-detail visual check: open a real loan, lease, service agreement and
// licence and confirm each renders its Overview / Documents / Timeline.
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { spawn, spawnSync } = require("child_process");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_SHOT_PORT || "4771";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.argv[2] || path.join(os.tmpdir(), "legalos-detail-shots");
const w = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const email = "maryam.haq@zameen.com";
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-dshot-"));
  spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = email;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";

  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  const ping = () => new Promise((r2) => { const r = http.get(BASE + "/api/health", (res) => { res.resume(); r2(res.statusCode === 200); }); r.on("error", () => r2(false)); r.setTimeout(1200, () => { r.destroy(); r2(false); }); });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);

  // Pick REAL record ids at run time. Hardcoding one is how a suite ends up
  // testing a record that no longer exists after a rebuild.
  const get = (route) => new Promise((res) => http.get(BASE + route, { headers: {} }, (r) => {
    const c = []; r.on("data", (d) => c.push(d)); r.on("end", () => { try { res(JSON.parse(Buffer.concat(c).toString())); } catch (e) { res(null); } });
  }).on("error", () => res(null)));

  const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"], defaultViewport: { width: 1480, height: 1200 } });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errs.push("CONSOLE: " + m.text().slice(0, 160)); });

  await p.goto(BASE + "/#/login", { waitUntil: "networkidle2" }); await w(2000);
  await p.type('input[name="email"]', email); await p.type('input[name="password"]', pw);
  await p.click('button[type="submit"]'); await w(4000);

  const pick = async (route, key) => {
    const j = await p.evaluate(async (r) => (await fetch(r, { credentials: "same-origin" })).json(), "/api/compliance/" + route);
    return j && j[key] && j[key][0] ? j[key][0].id : null;
  };
  const loanId = await pick("loans", "loans");
  const leaseId = await pick("leases", "leases");
  const svcId = await pick("services", "services");
  const licId = await pick("licences", "licences");

  for (const [name, hash] of [
    ["loan", "#/compliance/loan/" + encodeURIComponent(loanId)],
    ["lease", "#/compliance/lease/" + encodeURIComponent(leaseId)],
    ["service", "#/compliance/service/" + encodeURIComponent(svcId)],
    ["licence", "#/compliance/licence/" + encodeURIComponent(licId)],
  ]) {
    await p.goto(BASE + "/#/dashboard", { waitUntil: "networkidle2" });
    await p.goto(BASE + "/" + hash, { waitUntil: "networkidle2" });
    await w(2200);
    await p.screenshot({ path: path.join(OUT, "detail-" + name + ".png") });
    const info = await p.evaluate(() => ({
      h1: (document.querySelector("h1") || {}).textContent || "",
      tabs: [...document.querySelectorAll('[role="tab"]')].map((n) => n.innerText.replace(/\s+/g, " ").trim()).join(" | "),
      kpis: [...document.querySelectorAll(".metric")].slice(0, 6).map((n) => n.innerText.replace(/\s+/g, " ").trim()).join("  ·  "),
      actions: [...document.querySelectorAll("button")].map((n) => n.innerText.replace(/\s+/g, " ").trim()).filter((t) => /^\+|record repayment|apply for/i.test(t)).join(", "),
      sections: [...document.querySelectorAll(".section")].map((n) => {
        const t = (n.querySelector(".section__t,.section__title,h2,h3,strong") || {}).innerText || "";
        return t.trim();
      }).filter(Boolean).slice(0, 8).join(" | "),
      body: document.body.innerText.replace(/\s+/g, " ").slice(0, 900),
    }));
    console.log(`\n  === ${name.toUpperCase()} ===  ${info.h1}`);
    console.log("    TABS:     " + info.tabs);
    console.log("    KPI:      " + info.kpis.slice(0, 200));
    if (info.actions) console.log("    ACTIONS:  " + info.actions);
    if (info.sections) console.log("    SECTIONS: " + info.sections.slice(0, 200));
    console.log("    BODY:     " + (info.body || "").slice(0, 700));
    // Timeline tab
    const tl = await p.evaluate(() => {
      const t = [...document.querySelectorAll('[role="tab"]')].find((n) => /timeline/i.test(n.innerText));
      if (t) t.click(); return !!t;
    });
    if (tl) { await w(1500);
      const n = await p.evaluate(() => document.querySelectorAll(".feed__item").length);
      console.log("    TIMELINE: " + n + " events");
      await p.screenshot({ path: path.join(OUT, "detail-" + name + "-timeline.png") });
    }
  }
  console.log("\n" + (errs.length ? "PAGE ERRORS:\n  " + [...new Set(errs)].slice(0, 10).join("\n  ") : "no page errors on any record detail"));
  await b.close(); try { server.kill(); } catch (e) {}
})().catch((e) => { console.error(e); process.exit(1); });
