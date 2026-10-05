// Concurrency: what happens when two things arrive at once.
//
// The UI's double-click lock is not concurrency safety — it protects one
// browser. This exercises the SERVER: parallel request intake, parallel
// permission edits, overlapping Drive rebuilds, and reads taken while a rebuild
// is in flight.
//
//   node tests/m1-concurrency.js
const fs = require("fs");
const { reap, freePortSync } = require("./_reap.js");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let PORT = process.env.LEGALOS_CONC_PORT || "4731";
let BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

// `as` is a session cookie value; omitted means the dev-bypass identity.
const call = (method, route, body, as) => new Promise((resolve) => {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const headers = Object.assign({ "Content-Type": "application/json" }, data ? { "Content-Length": data.length } : {}, as ? { Cookie: "legalos_sess=" + as } : {});
  const req = http.request(BASE + route, { method, headers },
    (res) => { let s = ""; res.on("data", (d) => (s += d)); res.on("end", () => { let j = null; try { j = JSON.parse(s); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
  req.on("error", (e) => resolve({ status: 0, body: { error: String(e.message) } }));
  if (data) req.write(data);
  req.end();
});
const ping = () => new Promise((resolve) => {
  const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); });
  r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); });
});

const loginAs = (SANDBOX, email) => {
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1];
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ email, password: pw }));
    const rq = http.request(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); const sc = (res.headers["set-cookie"] || []).join(";"); const m = sc.match(/legalos_sess=([^;]+)/); resolve(m ? m[1] : null); });
    rq.on("error", () => resolve(null)); rq.write(data); rq.end();
  });
};

(async () => {
  /* Refuse to run against a server that is already listening.
     A leftover instance from a crashed run keeps the port; this run's server
     then fails to bind silently and every request goes to the STALE sandbox —
     which produces confident nonsense (duplicate record ids, an empty store,
     "not signed in") that reads exactly like a product bug. */
  await new Promise((resolve) => {
    const probe = http.get(BASE + "/api/health", (r) => {
      r.resume();
      if (r.statusCode === 200) {
        const moved = freePortSync();
        console.error("  HARNESS_PORT_IN_USE  port " + PORT + " is held by another process — continuing on free port " + moved);
        PORT = moved;
        BASE = `http://127.0.0.1:${PORT}`;
      }
      resolve();
    });
    probe.on("error", () => resolve());
    probe.setTimeout(1500, () => { probe.destroy(); resolve(); });
  });

  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-conc-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  // No dev bypass: `devBypassEmail` overrides the session cookie, which would
  // make every call run as the same person and silently invalidate the
  // revocation tests below. The cookie IS the identity here.
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  try { fs.unlinkSync(path.join(SANDBOX, "config", "requests.json")); } catch (e) {}
  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT, LEGALOS_DEV: "1" } });
  reap(server);   // stopped on every exit path, including a kill
  for (let i = 0; i < 40 && !(await ping()); i++) await w(400);
  if (!(await ping())) { console.error("server did not start"); process.exit(1); }

  const ADMIN = await loginAs(SANDBOX, "maryam.haq@zameen.com");
  if (!ADMIN) { console.error("could not establish an admin session"); process.exit(1); }
  // Every call defaults to the admin session unless another cookie is passed.
  const asAdmin = (m, r, b) => call(m, r, b, ADMIN);

  /* ---- 1. parallel request intake: unique ids, nothing lost ---- */
  console.log("1. Parallel request intake");
  const N = 40;
  const posts = Array.from({ length: N }, (_, i) =>
    asAdmin("POST", "/api/requests", { id: "CONC-SAME-ID", title: "concurrency fixture " + i, status: "Triage", department: "Finance", channel: "portal" }));
  const created = await Promise.all(posts);
  const ok = created.filter((r) => r.status === 201);
  const ids = ok.map((r) => r.body && r.body.id).filter(Boolean);
  check(`all ${N} parallel creates succeed`, ok.length === N, `${ok.length}/${N}`);
  check("every id is unique despite an identical requested id", new Set(ids).size === ids.length,
    `${new Set(ids).size} unique of ${ids.length}`);
  const listed = await asAdmin("GET", "/api/requests");
  const stored = (listed.body.requests || []).filter((r) => /concurrency fixture/.test(r.title || ""));
  check("no write was lost", stored.length === N, `${stored.length} stored of ${N}`);
  check("every stored record kept a distinct id", new Set(stored.map((r) => r.id)).size === stored.length);

  /* ---- 2. parallel permission edits on DIFFERENT groups of one user ---- */
  console.log("\n2. Parallel permission edits (lost-update check)");
  const users0 = (await asAdmin("GET", "/api/access/users")).body.users;
  const victim = users0.find((u) => u.id === "u12");
  const orig = { ...victim.groups };
  const [a, b] = await Promise.all([
    asAdmin("POST", "/api/access/user/u12", { groups: { litigation: "view" } }),
    asAdmin("POST", "/api/access/user/u12", { groups: { compliance: "full" } }),
  ]);
  const after = (await asAdmin("GET", "/api/access/users")).body.users.find((u) => u.id === "u12");
  check("both edits were accepted", a.status === 200 && b.status === 200, `${a.status}/${b.status}`);
  const bothApplied = after.groups.litigation === "view" && after.groups.compliance === "full";
  check("neither edit silently discarded the other", bothApplied,
    `litigation=${after.groups.litigation} compliance=${after.groups.compliance}`);
  const audit = (await asAdmin("GET", "/api/access/audit")).body.audit || [];
  const mine = audit.filter((x) => x.user === "u12").slice(0, 2);
  check("both changes produced audit entries", mine.length >= 2, String(mine.length));
  await asAdmin("POST", "/api/access/user/u12", { groups: orig });
  const restored = (await asAdmin("GET", "/api/access/users")).body.users.find((u) => u.id === "u12");
  check("the fixture user is restored", JSON.stringify(restored.groups) === JSON.stringify(orig));

  /* ---- 3. permission revocation reaches an ACTIVE caller ---- */
  console.log("\n3. Revocation during an active session");
  const canReadLit = async () => (await asAdmin("GET", "/api/registers/litigation?limit=1")).status;
  const u12before = await canReadLit();          // dev-bypass identity is maryam (super admin)
  check("the caller can read litigation to begin with", u12before === 200, String(u12before));
  // Revoke litigation from the ACTING identity (maryam, u1) and retry immediately.
  const m0 = (await asAdmin("GET", "/api/access/users")).body.users.find((u) => u.id === "u1");
  const mOrig = { ...m0.groups };
  await asAdmin("POST", "/api/access/user/u1", { groups: { litigation: "none" } });
  const afterRevoke = await canReadLit();
  check("the very next API call is refused after revocation", afterRevoke === 403, String(afterRevoke));
  await asAdmin("POST", "/api/access/user/u1", { groups: mOrig });
  const afterRestore = await canReadLit();
  check("restoring access takes effect immediately too", afterRestore === 200, String(afterRestore));

  /* ---- 4. deactivation reaches an ACTIVE caller (a different person) ---- */
  console.log("\n4. Deactivation during an active session");
  // Sign a second person in with real credentials so the admin can deactivate
  // THEM. Deactivating the acting admin is a separate (and now refused) case.
  const cookie = await loginAs(SANDBOX, "hasan.majeed@zameen.com");
  check("the second user signed in", !!cookie, "no session cookie");
  const victimReads = async () => (await call("GET", "/api/registers/litigation?limit=1", null, cookie)).status;
  check("that user can read their own team's register", (await victimReads()) === 200);

  const deact = await asAdmin("POST", "/api/access/user/u17", { status: "inactive" });
  check("the admin can deactivate another user", deact.status === 200, JSON.stringify(deact.body).slice(0, 90));
  const afterDeact = await call("GET", "/api/registers/litigation?limit=1", null, cookie);
  check("the deactivated user is refused on their very next call", afterDeact.status === 403, String(afterDeact.status));
  check("...with an explicit reason, not a generic error",
    (afterDeact.body || {}).error === "account_disabled", JSON.stringify(afterDeact.body || {}).slice(0, 80));
  await asAdmin("POST", "/api/access/user/u17", { status: "active" });
  check("reactivation restores access immediately", (await victimReads()) === 200);

  console.log("\n4b. Lockout guards");
  const selfOff = await asAdmin("POST", "/api/access/user/u1", { status: "inactive" });
  check("an administrator cannot deactivate their own account",
    selfOff.status === 400 && /your own account/i.test(JSON.stringify(selfOff.body)), JSON.stringify(selfOff.body).slice(0, 110));
  check("...and is still able to work afterwards", (await canReadLit()) === 200);

  /* ---- 5. overlapping Drive rebuilds ---- */
  console.log("\n5. Overlapping ingest / rebuild");
  const registers = require(path.join(SANDBOX, "api", "registers.js"));
  const before5 = await registers.ensure();
  const counts0 = Object.fromEntries(Object.entries(before5.registers || {}).map(([k, v]) => [k, v.length]));
  const [r1, r2, r3] = await Promise.all([registers.rebuild(true), registers.rebuild(true), registers.rebuild(true)]);
  const counts1 = Object.fromEntries(Object.entries((r1.registers) || {}).map(([k, v]) => [k, v.length]));
  check("three overlapping rebuilds return a coherent state", !!r1.registers && !!r2.registers && !!r3.registers);
  check("no family was emptied by the overlap", Object.keys(counts0).every((k) => (counts1[k] || 0) > 0 || counts0[k] === 0),
    JSON.stringify(counts1));
  check("all three callers observe the same snapshot",
    JSON.stringify(Object.keys(r1.registers).map((k) => r1.registers[k].length)) ===
    JSON.stringify(Object.keys(r2.registers).map((k) => r2.registers[k].length)), "r1 vs r2 differ");

  /* ---- 6. reads taken DURING a rebuild stay coherent ---- */
  console.log("\n6. Reads during a rebuild");
  // Drive the rebuild INSIDE THE SERVER (POST /api/registers/refresh) rather
  // than in this process: an in-process ingest parses workbooks synchronously
  // and would block this test's own event loop, which measures the harness
  // rather than the application.
  const refreshing = asAdmin("POST", "/api/registers/refresh");
  const reads = [];
  for (let i = 0; i < 15; i++) { reads.push(asAdmin("GET", "/api/registers/litigation?limit=3")); await w(120); }
  const during = await Promise.all(reads);
  const refreshed = await refreshing;
  check("the refresh itself completed", refreshed.status === 200, String(refreshed.status));
  const bad = during.filter((r) => r.status !== 200 || !r.body || !Array.isArray(r.body.records));
  check("every read during the rebuild succeeded", bad.length === 0, `${bad.length} bad of ${during.length}`);
  const totals = [...new Set(during.map((r) => r.body && r.body.total))];
  check("no read saw an empty or half-built register", !totals.includes(0) && !totals.includes(undefined),
    "totals seen: " + JSON.stringify(totals));
  check("readers saw ONE coherent snapshot, not a mixture", totals.length === 1,
    "distinct totals observed: " + JSON.stringify(totals));

  /* ---- cleanup ---- */
  try {
    const store = path.join(SANDBOX, "config", "requests.json");
    if (fs.existsSync(store)) fs.unlinkSync(store);
  } catch (e) {}
  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}

  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("SUITE ERROR:", e); process.exit(1); });
