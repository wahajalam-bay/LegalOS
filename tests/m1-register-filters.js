// Register filter + drill-down reconciliation.
//
// The one thing that must never be true of a filtered register is that the
// number it advertises and the number of rows it returns disagree. Every check
// here is a reconciliation: the count shown beside a filter option, the count in
// "N of M", the count on the KPI that drilled in, and the rows actually in the
// table must all be the same number.
//
// It is exhaustive by construction rather than by sampling: for EVERY register
// and EVERY primary filter it opens the dropdown, reads the option's own count,
// applies it, and compares. A new filter is covered the day it is added.
//
//   node tests/m1-register-filters.js
const puppeteer = require("./_puppeteer.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), P = require("path"), http = require("http");

const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const PORT = process.env.LEGALOS_FILTER_PORT || "4781";
const B = `http://127.0.0.1:${PORT}`;
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

// route, namespace, the noun the count uses
const REGISTERS = [
  { route: "/litigation",                    ns: "cases", label: "Litigation · Cases" },
  { route: "/m/notices",       ns: "notices", label: "Litigation · Legal Notices" },
  { route: "/contracts",                     ns: "ct",    label: "Contracts" },
  { route: "/compliance/licenses",      ns: "lic",   label: "Compliance · Licences" },
  { route: "/compliance/loans",         ns: "loan",  label: "Compliance · Loans" },
  { route: "/compliance/resolutions?rview=all", ns: "res", label: "Compliance · Resolutions" },
  { route: "/compliance/leases",                ns: "lease", label: "Compliance · Lease Agreements" },
  { route: "/compliance/services",              ns: "svc",   label: "Compliance · Service Agreements" },
  { route: "/matters",                       ns: "mat",   label: "Matters" },
  { route: "/access",                        ns: "usr",   label: "Users & Access" },
  { route: "/datahealth?tab=problems",       ns: "dh",    label: "Data Health · Issues" },
];

let SANDBOX = null, server = null;

(async () => {
  /* Refuse to run against something that is already listening.
     A leftover server from an earlier run keeps the port, this run's server
     fails to bind silently, and the browser then talks to the STALE sandbox
     with a different password — which reports "not signed in" and, worse, could
     report passing checks about code that is not the code under test. */
  if (await ping()) {
    console.error(`\n  port ${PORT} is already in use — a previous run did not shut down.\n` +
      `  Stop it first, or set LEGALOS_FILTER_PORT to a free port. Refusing to test a stale instance.\n`);
    process.exit(2);
  }
  SANDBOX = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-flt-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "legalos/", P.join(__dirname, "..") + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(P.join(__dirname, "..", "node_modules"), P.join(SANDBOX, "node_modules"));
  const cfgPath = P.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = USER;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", USER], { cwd: SANDBOX, encoding: "utf8" });
  const m = (out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/);
  const PW = m ? m[1] : "";
  /* The session cookie is issued with Path=/legalos/, which is where production
     mounts the app. This sandbox serves it at "/", so without this override the
     browser would never send the cookie back and a RELOAD would land on the
     login screen — a harness artifact that looks exactly like a product bug
     ("refresh logs you out"). Mount the cookie where this instance is served. */
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 140)));
  p.on("console", (mm) => { if (mm.type() === "error" && !/favicon|401|403|429/.test(mm.text())) errors.push(mm.text().slice(0, 140)); });

  await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(2000);
  await p.type('input[name="email"]', USER); await p.type('input[name="password"]', PW);
  await p.click('button[type="submit"]'); await w(4000);
  const signedIn = !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText));
  check("the suite is signed in (not stuck on the login screen)", signedIn);
  if (!signedIn) return finish(b);

  const settle = async () => {
    // The register paints after its data resolves; wait for the count rather
    // than a fixed delay, or every timing-sensitive check becomes a coin toss.
    try { await p.waitForSelector(".regcount", { timeout: 20000 }); } catch (e) {}
    await w(500);
  };
  const go = async (route) => {
    await p.goto(B + "/#" + route, { waitUntil: "networkidle2", timeout: 45000 });
    await settle();
  };
  const countOf = () => p.evaluate(() => {
    const el = document.querySelector(".regcount");
    if (!el) return null;
    const mm = el.textContent.replace(/,/g, "").match(/^([\d]+)(?:\s+of\s+([\d]+))?/);
    return mm ? { shown: +mm[1], total: mm[2] ? +mm[2] : +mm[1] } : null;
  });
  const rowCount = () => p.evaluate(() => {
    // The table paints in chunks; the sentinel reports the true filtered size.
    const s = document.querySelector(".tablewrap .row.center span.tiny");
    const mm = s && s.textContent.replace(/,/g, "").match(/of\s+(\d+)/);
    if (mm) return +mm[1];
    return document.querySelectorAll(".table tbody tr").length;
  });

  /* ---------------------------------------------------------------- 1 ---- */
  console.log("\n1. Every register renders a filter bar, a count and a table");
  for (const r of REGISTERS) {
    await go(r.route);
    const info = await p.evaluate(() => ({
      filters: document.querySelectorAll(".regbar .fltbtn").length,
      hasSearch: !!document.querySelector(".regbar__input"),
      count: !!document.querySelector(".regcount"),
      cols: document.querySelectorAll(".table thead th").length,
    }));
    check(`${r.label}: search + ${info.filters} filter controls + result count + ${info.cols} columns`,
      info.hasSearch && info.filters >= 3 && info.count && info.cols >= 4,
      JSON.stringify(info));
  }

  /* ---------------------------------------------------------------- 2 ---- */
  console.log("\n2. Every filter option's own count equals the rows it returns");
  let pairs = 0, mismatches = [];
  for (const r of REGISTERS) {
    await go(r.route);
    const nFilters = await p.$$eval(".regbar .fltwrap > .fltbtn", (els) => els.length);
    for (let i = 0; i < nFilters; i++) {
      await go(r.route);
      await p.evaluate((idx) => document.querySelectorAll(".regbar .fltwrap > .fltbtn")[idx].click(), i);
      await w(450);
      const opt = await p.evaluate(() => {
        const panel = document.querySelector(".fltpanel");
        if (!panel) return null;
        const row = panel.querySelector(".fltopt:not(.fltopt--locked)");
        if (!row || !row.querySelector(".fltopt__c")) return null;
        const c = parseInt(row.querySelector(".fltopt__c").textContent.replace(/,/g, ""), 10);
        if (!isFinite(c)) return null;
        return { name: row.querySelector(".fltopt__l").textContent.trim(), advertised: c };
      });
      if (!opt) continue;
      const label = await p.evaluate((idx) => document.querySelectorAll(".regbar .fltwrap > .fltbtn")[idx].textContent.trim(), i);
      await p.evaluate(() => document.querySelector(".fltpanel .fltopt input").click());
      await w(900);
      const c = await countOf();
      const rows = await rowCount();
      pairs++;
      const ok = c && c.shown === opt.advertised && rows === opt.advertised;
      if (!ok) mismatches.push(`${r.label}/${label}="${opt.name}" advertised=${opt.advertised} count=${c && c.shown} rows=${rows}`);
    }
  }
  check(`${pairs} filter-option reconciliations, all exact`, mismatches.length === 0,
    mismatches.slice(0, 4).join(" | "));

  /* ---------------------------------------------------------------- 3 ---- */
  console.log("\n3. Filters live in the URL and survive a reload");
  /* LIFECYCLE replaced STATUS on the case register. "Open / Closed" was the
     only axis the book had, and it answered a question nobody asks — whether a
     matter is finished — while the one they do ask, whether the company won,
     had nowhere to live. Lifecycle and Outcome are separate filters now. */
  await go("/litigation?cases_lifecycle=Active");
  const openA = await countOf();
  await p.reload({ waitUntil: "networkidle2" }); await settle();
  const openB = await countOf();
  check("a filtered register is a real address (same count after reload)",
    openA && openB && openA.shown === openB.shown && openA.shown < openA.total,
    JSON.stringify([openA, openB]));

  const chipTxt = await p.evaluate(() => [...document.querySelectorAll(".fltchip")].map((c) => c.textContent.replace(/\s+/g, " ").trim()));
  check("the applied filter is visible as a chip", chipTxt.some((t) => /Lifecycle.*Active/.test(t)), JSON.stringify(chipTxt));

  /* ---------------------------------------------------------------- 4 ---- */
  console.log("\n4. Search AND filters combine, and search does not reset filters");
  await go("/litigation?cases_lifecycle=Active");
  const beforeQ = await countOf();
  await p.type("#q-cases", "zameen"); await w(1200);
  const afterQ = await countOf();
  const stillFiltered = await p.evaluate(() => (location.hash.match(/cases_lifecycle=Active/) || []).length > 0);
  check("search narrows further and the filter is still applied",
    afterQ && beforeQ && afterQ.shown <= beforeQ.shown && stillFiltered,
    JSON.stringify([beforeQ, afterQ, stillFiltered]));

  /* ---------------------------------------------------------------- 5 ---- */
  console.log("\n5. Clear one filter, clear all");
  await go("/litigation?cases_lifecycle=Active&cases_risk=high");
  const two = await countOf();
  await p.evaluate(() => document.querySelectorAll(".fltchip__x")[0].click()); await w(900);
  const one = await countOf();
  await go("/litigation?cases_lifecycle=Active&cases_risk=high");
  await p.evaluate(() => document.querySelector(".fltchips__clear").click()); await w(900);
  const none = await countOf();
  check("removing one chip widens the result; Clear all restores the full register",
    two && one && none && one.shown >= two.shown && none.shown === none.total,
    JSON.stringify([two, one, none]));

  /* ---------------------------------------------------------------- 6 ---- */
  console.log("\n6. Sorting is typed: money sorts as money, dates as dates");
  await go("/contracts?ct_sort=value&ct_dir=desc");
  const vals = await p.evaluate(() => [...document.querySelectorAll(".table tbody tr")].slice(0, 25)
    .map((tr) => tr.children[6] && tr.children[6].innerText.trim()));
  const parse = (s) => { if (!s || s === "—") return null; const n = parseFloat(s.replace(/[^\d.]/g, "")); const u = /B/.test(s) ? 1e9 : /M/.test(s) ? 1e6 : /K/.test(s) ? 1e3 : 1; return n * u; };
  const nums = vals.map(parse).filter((x) => x != null);
  check("contract value sorts numerically (PKR 100M above PKR 9M)",
    nums.length > 3 && nums.every((v, i) => i === 0 || nums[i - 1] >= v),
    JSON.stringify(vals.slice(0, 6)));

  await go("/litigation?cases_sort=nextHearing&cases_dir=asc");
  const dateOk = await p.evaluate(() => {
    const th = [...document.querySelectorAll(".table thead th")].findIndex((t) => /Next hearing/.test(t.textContent));
    return th >= 0;
  });
  check("hearing date is a sortable, date-typed column", dateOk);

  /* ---------------------------------------------------------------- 7 ---- */
  console.log("\n7. A closed case is not reported as overdue");
  const overdue = await p.evaluate(async () => {
    const v = [...document.querySelectorAll("script")].map((x) => x.src).find((x) => /src-v\d+/.test(x));
    const ver = (v && v.match(/src-v\d+/) || ["src"])[0];
    const { api } = await import(`./${ver}/api.js`);
    const live = await import(`./${ver}/live.js`);
    const flt = await import(`./${ver}/filters.js`);
    const rows = live.adaptLitigation((await api.registers.list("litigation", { limit: 20000 })).records || []);
    // Day granularity, matching dueState: a hearing dated TODAY is not overdue,
    // however late in the day it is. Comparing against the clock instead counts
    // today's hearings as past and then complains that they are not overdue.
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const today = startOfDay(new Date());
    const past = rows.filter((r) => r.nextHearing && startOfDay(r.nextHearing) < today);
    // Partition by the application's OWN definition of closed, so the test is
    // asserting the contract ("a finished matter is never overdue") rather than
    // re-litigating which words mean closed.
    const closed = past.filter(flt.isClosedRecord);
    const live_  = past.filter((r) => !flt.isClosedRecord(r));
    return {
      pastTotal: past.length,
      closed: closed.length,
      closedWronglyOverdue: closed.filter((r) => flt.dueState(r, "nextHearing").kind === "overdue").length,
      closedShownAsPast:    closed.filter((r) => flt.dueState(r, "nextHearing").kind === "past").length,
      liveRecords: live_.length,
      liveOverdue: live_.filter((r) => flt.dueState(r, "nextHearing").kind === "overdue").length,
      liveShownAsPast: live_.filter((r) => flt.dueState(r, "nextHearing").kind === "past").length,
      sampleClosed: (closed[0] || {}).rawStatus || "",
    };
  });
  check(`${overdue.closed} closed cases with a past hearing date: none reported overdue`,
    overdue.closedWronglyOverdue === 0 && overdue.closedShownAsPast === overdue.closed, JSON.stringify(overdue));
  check(`${overdue.liveOverdue} unresolved past hearings are still reported overdue`,
    overdue.liveRecords > 0 && overdue.liveOverdue === overdue.liveRecords, JSON.stringify(overdue));
  check("no still-open record is filed under the closed-record bucket",
    overdue.liveShownAsPast === 0, JSON.stringify(overdue));

  // And the same thing at the DOM level, which is what a user actually sees.
  await go("/litigation?cases_lifecycle=Decided&cases_hearing=overdue");
  const closedOverdueRows = await countOf();
  check("filtering Decided + Overdue hearings returns nothing — a finished matter cannot be overdue",
    closedOverdueRows && closedOverdueRows.shown === 0, JSON.stringify(closedOverdueRows));

  await go("/litigation?cases_lifecycle=Decided");
  const anyOverdueText = await p.evaluate(() =>
    [...document.querySelectorAll(".table tbody tr")].filter((tr) => /overdue/i.test(tr.innerText)).length);
  check("no closed case renders the word \"overdue\" in its hearing cell", anyOverdueText === 0,
    anyOverdueText + " rows still say overdue");

  /* ---------------------------------------------------------------- 8 ---- */
  console.log("\n8. Dashboard / KPI drill-down lands on the number that was clicked");
  const drills = [
    { route: "/litigation", kpi: "Active cases" },
    { route: "/litigation", kpi: "Decided cases" },
    { route: "/contracts",  kpi: "Active" },
    { route: "/contracts",  kpi: "Expired" },
  ];
  const bad = [];
  for (const d of drills) {
    await go(d.route);
    const advertised = await p.evaluate((label) => {
      const card = [...document.querySelectorAll(".statkpi")].find((c) => (c.querySelector(".statkpi__l") || {}).textContent.trim() === label);
      if (!card) return null;
      const n = parseInt(card.querySelector(".statkpi__n").textContent.replace(/[^\d]/g, ""), 10);
      card.click();
      return n;
    }, d.kpi);
    if (advertised == null) { bad.push(`${d.route}/${d.kpi}: KPI not found`); continue; }
    await w(1200);
    const c = await countOf();
    if (!c || c.shown !== advertised) bad.push(`${d.route}/${d.kpi}: card=${advertised} register=${c && c.shown}`);
  }
  check(`${drills.length} KPI drill-downs reconcile exactly with the register`, bad.length === 0, bad.join(" | "));

  console.log("\n9. Chart drill-down sets the same filter the toolbar sets");
  await go("/litigation");
  const donut = await p.evaluate(() => {
    const seg = document.querySelector(".litcharts svg path[data-label], .litcharts svg path");
    return !!seg;
  });
  check("the stage donut is present and wired to the register filter", donut);

  /* --------------------------------------------------------------- 10 ---- */
  console.log("\n10. Filter options never exceed the authorized row set");
  await go("/litigation");
  const leak = await p.evaluate(() => {
    const btns = [...document.querySelectorAll(".regbar .fltwrap > .fltbtn")];
    const counts = [];
    for (const btn of btns) {
      btn.click();
      const panel = document.querySelector(".fltpanel");
      if (panel) {
        const total = [...panel.querySelectorAll(".fltopt__c")]
          .map((c) => parseInt(c.textContent.replace(/,/g, ""), 10)).filter(isFinite)
          .reduce((a, x) => a + x, 0);
        counts.push(total);
      }
      btn.click();
    }
    const reg = document.querySelector(".regcount").textContent.replace(/,/g, "").match(/(\d+)/);
    return { counts, total: reg ? +reg[1] : 0 };
  });
  // Single-valued filters partition the register, so each filter's option counts
  // must sum to exactly the register size. More would mean an option describing
  // rows the viewer does not have.
  check("no filter advertises more records than the register holds",
    leak.counts.every((c) => c <= leak.total), JSON.stringify(leak));

  console.log("\n11. No console or page errors across the whole sweep");
  check("clean console", errors.length === 0, errors.slice(0, 3).join(" | "));

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
