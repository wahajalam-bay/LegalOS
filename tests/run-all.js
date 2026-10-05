// LegalOS end-to-end test runner.
//
//   node tests/run-all.js            → run every suite
//   node tests/run-all.js m2         → run only suites whose name contains "m2"
//
// Self-contained: boots the prototype server on :4600 (unless one is already
// running), executes each suite in order, prints a scoreboard, kills the server
// it started, and exits non-zero if any suite fails. Suites drive a real headless
// Chrome (puppeteer-core) against the real app — no mocks.
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
/* On this box :4600 is the DEPLOYED SERVICE. The default used to be 4600, which
   meant `node tests/run-all.js` with no arguments pointed thirteen
   non-sandboxed suites at production — they create, approve and publish real
   records. The comment here used to warn about exactly that and then leave the
   default alone. It is now a safe port, and tests/_port.js refuses the live one
   outright unless LEGALOS_ALLOW_LIVE=1. */
const { resolvePort, LIVE_PORT } = require("./_port.js");
const PORT = resolvePort("LEGALOS_PORT");
const BASE = `http://localhost:${PORT}/`;

const ping = () => new Promise((resolve) => {
  const req = http.get(BASE, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on("error", () => resolve(false));
  req.setTimeout(1500, () => { req.destroy(); resolve(false); });
});

(async () => {
  const filter = (process.argv[2] || "").toLowerCase();
  const discovered = fs.readdirSync(__dirname).filter((f) => /^m\d.*\.js$/.test(f)).sort();

  /* A suite is RETIRED only by saying so in the file itself, with what replaced
     it. Nothing is skipped because of a port rule, a naming accident or a
     convenient exclusion list — a suite that does not run has to explain
     itself, in writing, in the file. */
  const retired = [];
  const active = [];
  for (const f of discovered) {
    const head = fs.readFileSync(path.join(__dirname, f), "utf8").slice(0, 2000);
    const m = head.match(/@retired\s+(.+)/);
    if (m) retired.push({ suite: f, reason: m[1].trim() });
    else active.push(f);
  }
  const suites = active.filter((f) => !filter || f.toLowerCase().includes(filter));
  const filteredOut = active.length - suites.length;

  console.log(`suites discovered: ${discovered.length}`);
  console.log(`  active:          ${active.length}`);
  console.log(`  retired:         ${retired.length}${retired.length ? " — " + retired.map((r) => r.suite + " (" + r.reason + ")").join("; ") : ""}`);
  if (filter) console.log(`  excluded by the "${filter}" filter: ${filteredOut}`);
  if (!suites.length) { console.error("no suites match:", filter); process.exit(1); }

  // Boot the server if the chosen port is not already answering.
  let server = null;
  if (!(await ping())) {
    server = spawn("node", ["server.js"], { cwd: ROOT, stdio: "ignore", env: { ...process.env, PORT } });
    for (let i = 0; i < 20 && !(await ping()); i++) await new Promise((r) => setTimeout(r, 400));
    if (!(await ping())) { console.error(`server failed to start on :${PORT}`); process.exit(1); }
    console.log(`server: started :${PORT} (will stop after the run)`);
  } else if (process.env.LEGALOS_ALLOW_LIVE === "1") {
    console.log(`server: already running on :${PORT} — adopting it (LEGALOS_ALLOW_LIVE=1)`);
  } else {
    console.error(`\n[tests] Something is ALREADY answering on :${PORT}, and this runner did not start it.`);
    console.error(`        Refusing to drive a server of unknown provenance — it may be a live or stale instance.`);
    console.error(`        Stop it, or pick another port:  LEGALOS_PORT=4620 node tests/run-all.js\n`);
    process.exit(2);
  }

  // Which build every suite is testing, recorded in the output.
  let buildUnderTest = null;
  try {
    // The HIGHEST version, not whichever one readdir happened to return first —
    // that reported v267 while v268 was the live build, which quietly mislabels
    // every result in the log.
    buildUnderTest = fs.readdirSync(ROOT)
      .filter((d) => /^src-v\d+$/.test(d))
      .sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10))
      .pop() || null;
  } catch (e) {}
  console.log(`build under test:  ${buildUnderTest || "unknown"}\n`);

  const results = [];
  let checksPassed = 0, checksTotal = 0;
  const suitesWithoutACheckCount = [];
  const timedOutEarly = (r) => !!(r.error && r.error.code === "ETIMEDOUT");
  for (const suite of suites) {
    process.stdout.write(`\n=== ${suite} ===\n`);
    // 300s was not enough for the browser suites -- m1-document-auth walks
    // every document against every persona and takes many minutes -- so the
    // runner killed them and scored them as FAILED. A timeout reported as a
    // failure is a lie about the code, and it trains you to ignore red.
    //
    // 2400s was not enough either, for exactly one suite. m1-control-disposition
    // exercises 1,768 distinct controls and re-navigates before each click so it
    // never clicks a stale handle; at roughly a second and a half apiece that is
    // three quarters of an hour of real work, and the runner killed it at forty
    // minutes every time. A killed suite reports NOTHING -- no checks, no clue
    // which control it died on -- so the cap was buying silence, not safety.
    // The suite now owns a 55-minute deadline and reports where it stopped; this
    // cap sits above it so the suite's own deadline is what fires. Raised for
    // the one suite that needs it rather than for all of them, because a blanket
    // three-hour cap would let a genuinely hung suite sit there for three hours.
    const SUITE_TIMEOUT_MS = /control-disposition/.test(suite) ? 3900000 : 2400000;
    const t0 = Date.now();
    const r = spawnSync("node", [path.join(__dirname, suite)], { cwd: __dirname, encoding: "utf8", timeout: SUITE_TIMEOUT_MS, env: { ...process.env, LEGALOS_PORT: PORT } });
    const secs = Math.round((Date.now() - t0) / 1000);
    const out = (r.stdout || "") + (r.stderr || "");
    /* Show the verdict lines. The filter used to be anchored at column zero
       while every suite prints its verdicts indented by two spaces, so a whole
       run could scroll past showing nothing but suite headers -- and a FAIL
       line was as invisible as a PASS. */
    /* A SUITE THAT FAILS MUST SAY WHY IN THIS LOG.
       runSuite exits non-zero when the browser reported page errors, even with
       every check passing -- and this filter dropped the "page errors (N):"
       block, so those suites appeared in the scoreboard as failures with not one
       line of explanation anywhere. The lines are indented under the heading, so
       keep the heading and the lines that follow it. */
    let inPageErrors = false;
    out.split("\n").forEach((l) => {
      if (/^\s*page errors \(/.test(l)) { inPageErrors = true; console.log(l); return; }
      if (inPageErrors) {
        if (/^\s{4}\S/.test(l)) { console.log(l); return; }
        inPageErrors = false;
      }
      if (/^\s*(PASS|FAIL|FATAL|====|console errors)/.test(l)) console.log(l);
    });
    /* Check-level totals. The scoreboard counted SUITES, so "34 passed" could
       hide a suite that ran one assertion and a suite that ran two hundred.
       Parsed from each suite's own summary line rather than recounted here. */
    const m = out.match(/(\d+)\s*\/\s*(\d+)\s+checks passed/);
    if (m) { checksPassed += parseInt(m[1], 10); checksTotal += parseInt(m[2], 10); }
    else if (!timedOutEarly(r)) suitesWithoutACheckCount.push(suite);
    const timedOut = r.error && r.error.code === "ETIMEDOUT";
    if (timedOut) console.log(`TIMED OUT after ${secs}s — not a code failure, the suite was killed`);
    if (r.status === 3) console.log("HARNESS ERROR — the suite never reached an assertion");
    results.push({ suite, ok: r.status === 0, code: r.status, secs, timedOut });
  }

  if (server) server.kill();
  console.log("\n============ SCOREBOARD ============");
  results.forEach((r) => console.log(`${r.ok ? "✔" : "✘"}  ${String(r.suite).padEnd(34)} ${String(r.secs) + "s"}${r.timedOut ? "  (TIMED OUT)" : ""}`));
  /* A HARNESS failure (exit 3) means the suite never got to make an assertion:
     the port was taken, the sandbox would not start, sign-in was unavailable.
     It is reported separately from a product failure, because the two call for
     completely different responses — but both make the run non-green. */
  const productFailed = results.filter((r) => !r.ok && r.code !== 3 && !r.timedOut);
  const harnessFailed = results.filter((r) => r.code === 3);
  const timedOut = results.filter((r) => r.timedOut);
  const executed = results.length;
  const unexpectedSkips = suites.length - executed;

  console.log("\n============== SUMMARY ==============");
  console.log(`  Suites discovered      ${discovered.length}`);
  console.log(`  Active                 ${active.length}`);
  console.log(`  Retired (declared)     ${retired.length}`);
  console.log(`  Executed               ${executed}`);
  console.log(`  Passed                 ${results.filter((r) => r.ok).length}`);
  console.log(`  Product failures       ${productFailed.length}${productFailed.length ? " — " + productFailed.map((r) => r.suite).join(", ") : ""}`);
  console.log(`  HARNESS failures       ${harnessFailed.length}${harnessFailed.length ? " — " + harnessFailed.map((r) => r.suite).join(", ") : ""}`);
  console.log(`  Timed out              ${timedOut.length}${timedOut.length ? " — " + timedOut.map((r) => r.suite).join(", ") : ""}`);
  console.log(`  Unexpected skips       ${unexpectedSkips}`);
  console.log(`  Build under test       ${buildUnderTest || "unknown"}`);
  console.log("");
  console.log(`  Total checks           ${checksTotal}`);
  console.log(`  Checks passed          ${checksPassed}`);
  console.log(`  Checks failed          ${checksTotal - checksPassed}`);
  if (suitesWithoutACheckCount.length) {
    /* A suite that reports no check count is not counted as zero -- that would
       quietly shrink the denominator and make the run look better than it is. */
    console.log(`  Suites not reporting a check count  ${suitesWithoutACheckCount.length} — ${suitesWithoutACheckCount.join(", ")}`);
  }

  const bad = productFailed.length + harnessFailed.length + timedOut.length + (unexpectedSkips > 0 ? 1 : 0);
  console.log(bad ? "\nRUN IS NOT GREEN" : "\nALL ACTIVE SUITES PASSED");
  process.exit(bad ? 1 : 0);
})();
