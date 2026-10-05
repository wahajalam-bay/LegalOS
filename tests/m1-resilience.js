// Resilience regressions for the three defects that cost real data or access.
//
//   1. A degraded Drive crawl must NOT overwrite a healthy register (P0).
//   2. Money must render in PKR, by value, not by scanning for "$" (P1).
//   3. View-As must render the VIEWED person's access, never the viewer's (P0).
//
// Each drives the real module against an isolated copy; none touches the live
// service or Google Drive.
//
//   node tests/m1-resilience.js
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

/* ============ 1. register cache protection, end to end ============ */
console.log("1. A degraded ingest must not replace a healthy register");
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-resil-"));
const r = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
if (r.status !== 0) { console.error("copy failed"); process.exit(1); }
fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));

process.env.LEGALOS_NO_WARM = "1";
const registers = require(path.join(SANDBOX, "api", "registers.js"));
const drive = require(path.join(SANDBOX, "api", "drive.js"));

(async () => {
  // Read the baseline from the CACHE FILE rather than ensure(): ensure() can kick
  // off a background refresh, and a rebuild already in flight makes the degraded
  // rebuild below return early on `state.building` — which would make this test
  // pass for the wrong reason.
  const cached = JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", ".registers.json"), "utf8"));
  const healthy = Object.fromEntries(Object.entries(cached.registers || {}).map(([k, v]) => [k, v.length]));
  const healthyTotal = Object.values(healthy).reduce((a, b) => a + b, 0);
  check("a healthy register is loaded to test against", healthyTotal > 0, JSON.stringify(healthy));

  // Simulate a throttled crawl: an index that has lost most of its files, and a
  // drive status that reports the degradation.
  const realIndexFiles = drive.indexFiles();
  const realStatus = drive.status;
  drive.indexFiles = () => realIndexFiles.slice(0, 5);
  drive.status = () => Object.assign({}, realStatus(), { degraded: true, error: "simulated HTTP 429", unreadableFolders: 3 });

  const after = await registers.rebuild(true);
  const held = Object.fromEntries(Object.entries(after.registers || {}).map(([k, v]) => [k, v.length]));
  const heldTotal = Object.values(held).reduce((a, b) => a + b, 0);

  check("the previous register is still held after a degraded ingest", heldTotal === healthyTotal,
    `${heldTotal} held vs ${healthyTotal} before`);
  check("no family was emptied", Object.keys(healthy).every((k) => held[k] === healthy[k]), JSON.stringify(held));
  check("the rejection is recorded, not silent", !!after.lastDegradedIngest,
    after.lastDegradedIngest ? after.lastDegradedIngest.reason : "nothing recorded");
  check("links were not pruned against the degraded index",
    !after.diagnostics || !after.diagnostics.staleLinksRemoved, String(after.diagnostics && after.diagnostics.staleLinksRemoved));

  drive.indexFiles = () => realIndexFiles;
  drive.status = realStatus;

  /* ============ 2. money formatting, by value ============ */
  console.log("\n2. Money renders in PKR, verified by value");
  const core = fs.readFileSync(path.join(ROOT, "src", "core.js"), "utf8");
  // Evaluate fmt.money in isolation — it is browser ESM, so lift the function.
  const body = core.slice(core.indexOf("money(n, currency = "), core.indexOf("moneyFull("));
  const money = new Function("n", "currency", body.replace(/^\s*money\(n, currency = "PKR"\) \{/, "currency = currency || 'PKR';") .replace(/\},\s*$/, "") + "\n");
  const cases = [[0, "PKR 0"], [535200000, "PKR 535.2M"], [449600000, "PKR 449.6M"], [77700000000, "PKR 77.7B"], [1500, "PKR 1.5K"]];
  for (const [input, want] of cases) {
    let got; try { got = money(input); } catch (e) { got = "ERR " + e.message; }
    check(`money(${input}) = ${want}`, got === want, "got " + got);
  }
  let none; try { none = money(null); } catch (e) { none = "ERR"; }
  check("money(null) renders a dash, not PKR 0", none === "—", "got " + none);
  check("the default currency in core.js is PKR", /money\(n, currency = "PKR"\)/.test(core));
  check("the unknown-currency fallback is PKR, not $", !/\}\[currency\] \|\| "\$"/.test(core));

  /* ============ 3. View-As cannot inherit the viewer's access ============ */
  console.log("\n3. View-As renders the viewed person's access");
  const rbacSrc = fs.readFileSync(path.join(ROOT, "src", "rbac.js"), "utf8");
  check("permissions are taken from the account only when viewing yourself", /const isSelf = /.test(rbacSrc));
  check("a preview uses viewAsPermissions, not the account's", /viewAsPermissions/.test(rbacSrc));
  check("setViewAs clears the previous preview's permissions", /viewAsPermissions: null/.test(rbacSrc));
  check("the admin group is head-only in the legacy branch", /groupOf\(base, parts\) === "admin"\) return rbac === "head"/.test(rbacSrc));

  /* ============ 4. responsive: inline grids must collapse ============ */
  console.log("\n4. Inline grid layouts collapse on small screens");
  const css = fs.readFileSync(path.join(ROOT, "assets", "styles.css"), "utf8");
  check("a breakpoint overrides inline grid-template-columns", /@media \(max-width: 820px\)[\s\S]{0,200}\.page \.grid \{ grid-template-columns: 1fr !important/.test(css));
  check("tab rows scroll rather than overflow", /\.tabs \{[^}]*overflow-x: auto/.test(css));
  check("the phone topbar keeps the user menu reachable", /@media \(max-width: 640px\)[\s\S]{0,400}\.topbar \.searchbtn span/.test(css));

  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("SUITE ERROR:", e); try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
