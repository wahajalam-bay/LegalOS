// Visual check for drafting a contract from an approved template, in a real
// browser, against an isolated sandbox: open a request, open the Documents
// tab, pick a template, read the coverage, generate the draft, and confirm it
// lands on the request. Page errors are captured as well as pixels, because a
// screenshot of a blank page still looks like a screenshot.
//
//   node tools/crf-draft-shots.js [outDir]
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_SHOT_PORT || "4763";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.argv[2] || path.join(os.tmpdir(), "legalos-crf-draft");
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (p) => p.evaluate(() => document.body.innerText);

(async () => {
  // puppeteer-core ships as ESM; this file is CommonJS like the rest of tools/.
  const puppeteer = (await import("puppeteer-core")).default;
  fs.mkdirSync(OUT, { recursive: true });
  const email = "imran.tariq@zameen.com";
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-crfdraft-"));
  spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs",
    "--exclude", "config/requests-deleted.json", "--exclude", "config/archived.json",
    "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = email;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";

  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  /* A RUN THAT DIES EARLY MUST NOT LEAVE ITS SERVER BEHIND. An exit before the
     kill() at the bottom left a sandbox server holding this port, and the next
     run silently talked to THAT sandbox -- serving an index.html three cache
     bumps out of date, so the app hung on "Loading LegalOS..." and every
     assertion read false for a reason unrelated to the code under test. */
  const shutdown = () => { try { server.kill(); } catch (e) { /* already gone */ } };
  process.on("exit", shutdown);
  process.on("uncaughtException", (e) => { console.error(e); shutdown(); process.exit(1); });
  const ping = () => new Promise((resolve) => {
    const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); });
    r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); });
  });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);

  // A FRESH PROFILE EVERY RUN. Without one Chrome reuses its HTTP cache
  // between runs on the same port, and kept serving an index.html that asked
  // for a src-v* module path three bumps old -- so the app hung on "Loading
  // LegalOS..." and every assertion below read false for a reason that had
  // nothing to do with the code under test.
  const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-chrome-"));
  const b = await puppeteer.launch({
    executablePath: process.env.CHROME || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-application-cache"],
    userDataDir: PROFILE,
    defaultViewport: { width: 1480, height: 1150 },
  });
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errs.push("CONSOLE: " + m.text().slice(0, 200)); });
  p.on("requestfailed", (r) => errs.push("REQFAILED: " + r.url()));
  p.on("response", (r) => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push("HTTP" + r.status() + ": " + r.url()); });

  await p.setCacheEnabled(false);
  await p.goto(BASE + "/#/login", { waitUntil: "networkidle2" });
  await w(2500);
  // With access.enforce off and a dev bypass identity the sandbox may already
  // consider us signed in, in which case there is no form to fill.
  const hasForm = await p.$('input[name="email"]');
  if (hasForm) {
    await p.type('input[name="email"]', email);
    await p.type('input[name="password"]', pw);
    await p.click('button[type="submit"]');
    await w(4000);
  }
  if (/Sign in with your LegalOS account/i.test(await text(p))) {
    console.error("sign-in failed; page said:\n" + (await text(p)).slice(0, 400));
    process.exit(1);
  }
  console.log("signed in as " + email + (hasForm ? " (form)" : " (dev bypass)"));

  // A request with enough on it to be worth drafting. Built through the API so
  // the browser part of this test is about the drafting screen, not about
  // re-typing a seven-step wizard.
  const call = (url, opts) => p.evaluate(async (u, o) => {
    const r = await fetch(u, Object.assign({ credentials: "same-origin" }, o || {},
      o && o.body ? { headers: { "content-type": "application/json" } } : {}));
    return { status: r.status, body: await r.json().catch(() => null) };
  }, url, opts);

  const made = await call(BASE + "/api/contract-requests",
    { method: "POST", body: JSON.stringify({ type: "CRF-02", department: "Administration" }) });
  const id = made.body && made.body.request && made.body.request.id;
  if (!id) { console.error("could not create a request", made); process.exit(1); }

  const SECTIONS = {
    entity: { entityName: "Zameen Media (Private) Limited", entityRole: "Lessee",
      entityAddress: "Plot 9, Sector H, Phase 2, DHA, Lahore", entitySignatory: "Imran Tariq",
      entitySignatoryDesignation: "Chief Legal Officer", entitySignatoryCnic: "35201-1234567-1" },
    lessors: [
      { name: "Shahid Hussain", parentage: "Ghulam Hussain", cnic: "35201-1111111-1", address: "House 4, Model Town, Lahore", rentSharePct: "50" },
      { name: "Farah Shahid", parentage: "Shahid Hussain", cnic: "35201-2222222-2", address: "House 4, Model Town, Lahore", rentSharePct: "30" },
      { name: "Usman Shahid", parentage: "Shahid Hussain", cnic: "35201-3333333-3", address: "House 9, Gulberg, Lahore", rentSharePct: "20" }],
    premises: { building: "Arfa Tower, 12 Ferozepur Road, Lahore", floorsUnits: "4th and 5th floors",
      area: "18,000 sq ft", use: "Corporate office", parking: "24 bays" },
    term: { years: 5, commencement: "2026-11-01", expiry: "2031-10-31", possessionDate: "2026-10-25", lockIn: "2 years" },
    rent: { monthlyRent: 4500000, taxTreatment: "Exclusive", dueDay: 5, escalationPct: "10", escalationAfterYears: 1 },
    deposit: { depositMonths: 3, depositAmount: 13500000, depositInstrument: "Pay Order" },
    execution: { executionPlace: "Lahore", executionDate: "2026-10-15", witness1Name: "Bilal Ahmed",
      witness1Cnic: "35201-9988776-5", witness2Name: "Sana Riaz", witness2Cnic: "35201-5544332-2" },
    disputes: { governingLaw: "Laws of Pakistan", forum: "Arbitration", seat: "Lahore", amicableDays: 30 },
  };
  for (const [section, value] of Object.entries(SECTIONS)) {
    await call(BASE + "/api/contract-requests/" + id, { method: "PATCH", body: JSON.stringify({ section, value }) });
  }
  console.log("request " + id + " populated\n");

  const shot = async (name) => { await p.screenshot({ path: path.join(OUT, name + ".png") }); };
  const seen = {};

  await p.goto(BASE + "/#/dashboard", { waitUntil: "networkidle2" });
  await p.goto(BASE + "/#/contract-requests/" + id, { waitUntil: "networkidle2" });
  await w(3000);

  // The Documents tab, where the drafting panel lives.
  // A request in Draft renders the WIZARD, and its Documents block is a
  // section on the page rather than a tab. Either way this lands on it.
  const clicked = await p.evaluate(() => {
    const t = [...document.querySelectorAll("button,[role=tab],.tab,a")].find((n) => /^\s*Documents\b/i.test(n.innerText || ""));
    if (t) { t.click(); return true; }
    const sec = document.getElementById("crfsec-attachments");
    if (sec) { sec.scrollIntoView(); return true; }
    return false;
  });
  await w(2000);
  await shot("01-documents-tab");
  seen.documentsTab = clicked;
  seen.draftPanel = /Contract draft/i.test(await text(p));

  // Open the drafting dialog.
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((n) => /Draft the contract|Draft again/i.test(n.innerText || ""));
    if (b) b.click();
  });
  await w(3500);
  await shot("02-template-picker");
  const t2 = await text(p);
  seen.dialogOpen = /Draft the contract/i.test(t2);
  seen.templatesListed = await p.evaluate(() => document.querySelectorAll(".tplrow").length);
  seen.suggestedShown = /Matching this request type/i.test(t2);

  // Pick the lease template and read the coverage it reports.
  await p.evaluate(() => {
    const r = [...document.querySelectorAll(".tplrow")]
      .find((n) => /Final Lease Agreement Draft/i.test(n.innerText || ""));
    if (r) r.click();
  });
  await w(4000);
  await shot("03-coverage");
  const t3 = await text(p);
  seen.coverage = (t3.match(/(\d+) of (\d+) fields filled/) || [])[0] || null;
  seen.filledRowsShown = await p.evaluate(() => document.querySelectorAll(".cvrow").length);
  seen.reasonsShown = /the request leaves this field blank|does not say what belongs here|fewer counterparties/i.test(t3);

  // Generate it.
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((n) => /^\s*Generate draft\s*$/i.test(n.innerText || ""));
    if (b) b.click();
  });
  await w(6000);
  await shot("04-generated");
  const t4 = await text(p);
  seen.toast = (t4.match(/Draft generated[^\n]*/) || [])[0] || null;
  seen.draftOnRequest = /\(DRAFT\)\.docx/i.test(t4);

  const docs = await call(BASE + "/api/contract-requests/" + id);
  const generated = ((docs.body || {}).documents || []).filter((d) => d.docType === "Generated Draft");
  seen.documentsOnRequest = generated.length;
  seen.documentName = generated[0] ? generated[0].name : null;
  seen.onFile = generated[0] ? generated[0].onFile : null;

  console.log("RESULT");
  for (const [k, v] of Object.entries(seen)) console.log("  " + k.padEnd(20), v);
  console.log("\npage errors: " + (errs.length ? "\n  " + errs.join("\n  ") : "none"));
  console.log("shots in " + OUT);

  await b.close();
  server.kill();
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });
  process.exit(errs.length ? 1 : 0);
})();
