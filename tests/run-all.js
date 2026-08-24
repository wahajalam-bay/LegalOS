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
const BASE = "http://localhost:4600/";

const ping = () => new Promise((resolve) => {
  const req = http.get(BASE, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on("error", () => resolve(false));
  req.setTimeout(1500, () => { req.destroy(); resolve(false); });
});

(async () => {
  const filter = (process.argv[2] || "").toLowerCase();
  const suites = fs.readdirSync(__dirname)
    .filter((f) => /^m\d.*\.js$/.test(f))
    .filter((f) => !filter || f.toLowerCase().includes(filter))
    .sort();
  if (!suites.length) { console.error("no suites match:", filter); process.exit(1); }

  // Boot the server if :4600 is not already answering.
  let server = null;
  if (!(await ping())) {
    server = spawn("node", ["server.js"], { cwd: ROOT, stdio: "ignore" });
    for (let i = 0; i < 20 && !(await ping()); i++) await new Promise((r) => setTimeout(r, 400));
    if (!(await ping())) { console.error("server failed to start on :4600"); process.exit(1); }
    console.log("server: started :4600 (will stop after the run)");
  } else {
    console.log("server: already running on :4600");
  }

  const results = [];
  for (const suite of suites) {
    process.stdout.write(`\n=== ${suite} ===\n`);
    const r = spawnSync("node", [path.join(__dirname, suite)], { cwd: __dirname, encoding: "utf8", timeout: 300000 });
    const out = (r.stdout || "") + (r.stderr || "");
    // show only the verdict lines to keep the scoreboard readable
    out.split("\n").filter((l) => /^(PASS|FAIL|FATAL|====|console errors)/.test(l)).forEach((l) => console.log(l));
    results.push({ suite, ok: r.status === 0 });
  }

  if (server) server.kill();
  console.log("\n============ SCOREBOARD ============");
  results.forEach((r) => console.log(`${r.ok ? "✔" : "✘"}  ${r.suite}`));
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} suite(s) FAILED` : "\nALL SUITES PASSED");
  process.exit(failed ? 1 : 0);
})();
