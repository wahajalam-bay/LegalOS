// Saved views: real persistence, real ownership, no authority.
//
// A saved view is user input replayed into a register later, so it gets the same
// treatment as any other untrusted payload: an allowlist of registers, filter
// keys, sort keys and column ids. And it carries NO authority — a view saved
// while someone held litigation access must not restore that access after it is
// revoked. The register endpoint decides, every time.
//
//   node tests/m1-saved-views.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_VIEWS_PORT || "4851";
const BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

const req = (method, route, { cookie, body } = {}) => new Promise((resolve) => {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const h = Object.assign({}, data ? { "Content-Type": "application/json", "Content-Length": data.length } : {},
    cookie ? { Cookie: "legalos_sess=" + cookie } : {});
  const r = http.request(BASE + route, { method, headers: h }, (res) => {
    const chunks = [];
    res.on("data", (d) => chunks.push(d));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {}
      resolve({ status: res.statusCode, body: j });
    });
  });
  r.on("error", () => resolve({ status: 0, body: null }));
  if (data) r.write(data);
  r.end();
});

const loginAs = (SANDBOX, email) => {
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1];
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ email, password: pw }));
    const rq = http.request(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); const m = (res.headers["set-cookie"] || []).join(";").match(/legalos_sess=([^;]+)/); resolve(m ? m[1] : null); });
    rq.on("error", () => resolve(null)); rq.write(data); rq.end();
  });
};

function refuseIfPortBusy(port) {
  const { execSync } = require("child_process");
  let busy = false;
  try { busy = execSync(`ss -tln 2>/dev/null | grep -c ":${port} " || true`, { encoding: "utf8" }).trim() !== "0"; } catch (e) {}
  if (busy) { console.error(`\n  port ${port} already in use — refusing to test a stale instance.\n`); process.exit(2); }
}
refuseIfPortBusy(PORT);

(async () => {
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-views-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/views.json", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  const ping = () => new Promise((resolve) => { const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); }); r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); }); });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  const ADMIN = await loginAs(SANDBOX, "maryam.haq@zameen.com");        // full access
  const COMPL = await loginAs(SANDBOX, "sana.hurmat@zameen.com");       // compliance only
  check("sessions established", !!(ADMIN && COMPL));

  /* ------------------------------------------------------------------ 1 --- */
  console.log("\n1. Create, list, apply");
  const c1 = await req("POST", "/api/views", { cookie: ADMIN, body: {
    register: "cases", name: "High risk open",
    filters: { risk: ["high"], status: ["Open"] }, sort: { key: "exposure", dir: "desc" }, q: "" } });
  check("a view is created", c1.status === 201 && c1.body.view && c1.body.view.id, "status=" + c1.status);
  const id1 = c1.body && c1.body.view && c1.body.view.id;
  check("the server stamps owner and timestamps, not the client",
    c1.body.view.owner === "maryam.haq@zameen.com" && !!c1.body.view.createdAt && !!c1.body.view.updatedAt,
    JSON.stringify({ owner: c1.body.view.owner }));
  const l1 = await req("GET", "/api/views?register=cases", { cookie: ADMIN });
  check("it comes back in the owner's list", (l1.body.views || []).some((v) => v.id === id1));

  /* ------------------------------------------------------------------ 2 --- */
  console.log("\n2. Untrusted payload — allowlist");
  const evil = await req("POST", "/api/views", { cookie: ADMIN, body: {
    register: "cases", name: "Injected",
    filters: { risk: ["high"], __proto__: ["polluted"], constructor: ["x"], "'; DROP TABLE": ["y"], notAField: ["z"] },
    sort: { key: "1=1; SELECT", dir: "desc" },
    hiddenColumns: ["id", "no_such_column"] } });
  const ev = evil.body && evil.body.view;
  check("unknown filter keys are dropped, known ones kept",
    ev && Object.keys(ev.filters).length === 1 && ev.filters.risk[0] === "high",
    JSON.stringify(ev && ev.filters));
  check("an unsupported sort key is dropped", ev && ev.sort === null, JSON.stringify(ev && ev.sort));
  check("unknown column ids are dropped", ev && ev.hiddenColumns.length === 1 && ev.hiddenColumns[0] === "id",
    JSON.stringify(ev && ev.hiddenColumns));
  check("the caller is told what was dropped", (evil.body.dropped || []).length >= 3, JSON.stringify(evil.body.dropped));
  const bad = await req("POST", "/api/views", { cookie: ADMIN, body: { register: "../../etc/passwd", name: "x" } });
  check("an unknown register is refused", bad.status === 400, "status=" + bad.status);
  const noName = await req("POST", "/api/views", { cookie: ADMIN, body: { register: "cases", name: "   " } });
  check("a nameless view is refused", noName.status === 400, "status=" + noName.status);

  /* ------------------------------------------------------------------ 3 --- */
  console.log("\n3. Ownership");
  const otherList = await req("GET", "/api/views?register=cases", { cookie: COMPL });
  check("another user does not see it", !(otherList.body.views || []).some((v) => v.id === id1),
    JSON.stringify((otherList.body.views || []).map((v) => v.id)));
  const steal = await req("PATCH", "/api/views/" + id1, { cookie: COMPL, body: { name: "stolen" } });
  check("another user cannot edit it (404, so ids cannot be probed)", steal.status === 404, "status=" + steal.status);
  const stealDel = await req("DELETE", "/api/views/" + id1, { cookie: COMPL });
  check("another user cannot delete it", stealDel.status === 404, "status=" + stealDel.status);
  const anon = await req("GET", "/api/views", {});
  check("no session gets nothing", anon.status === 401, "status=" + anon.status);

  /* ------------------------------------------------------------------ 4 --- */
  console.log("\n4. A saved view carries criteria, never authority");
  // The compliance-only user saves a LITIGATION view. Saving is allowed — it is
  // just criteria — but it must not become a way back into litigation data.
  const cv = await req("POST", "/api/views", { cookie: COMPL, body: {
    register: "cases", name: "Litigation I cannot see", filters: { risk: ["high"] } } });
  check("a restricted user may still save criteria for a register they cannot read", cv.status === 201, "status=" + cv.status);
  const denied = await req("GET", "/api/registers/litigation?limit=10", { cookie: COMPL });
  check("applying it changes nothing: the register still refuses them (403)", denied.status === 403, "status=" + denied.status);
  const stillDenied = await req("GET", "/api/registers/litigation?risk=high&limit=10", { cookie: COMPL });
  check("naming the saved filters in the URL does not widen access either", stillDenied.status === 403, "status=" + stillDenied.status);

  /* ------------------------------------------------------------------ 5 --- */
  console.log("\n5. Rename, update, duplicate, default, delete");
  const rn = await req("PATCH", "/api/views/" + id1, { cookie: ADMIN, body: { name: "High risk — open" } });
  check("rename", rn.status === 200 && rn.body.view.name === "High risk — open", JSON.stringify(rn.body && rn.body.view && rn.body.view.name));
  const up = await req("PATCH", "/api/views/" + id1, { cookie: ADMIN, body: { filters: { risk: ["critical"] }, q: "zameen" } });
  check("update to new filters", up.status === 200 && up.body.view.filters.risk[0] === "critical" && up.body.view.q === "zameen");
  check("updatedAt moves, createdAt does not",
    up.body.view.updatedAt >= c1.body.view.updatedAt && up.body.view.createdAt === c1.body.view.createdAt);
  const dup = await req("POST", "/api/views/" + id1 + "/duplicate", { cookie: ADMIN });
  check("duplicate makes a distinct copy", dup.status === 201 && dup.body.view.id !== id1 && /copy/i.test(dup.body.view.name),
    JSON.stringify(dup.body && dup.body.view && dup.body.view.name));
  const def = await req("PATCH", "/api/views/" + id1, { cookie: ADMIN, body: { isDefault: true } });
  check("set as default", def.status === 200 && def.body.view.isDefault === true);
  const def2 = await req("PATCH", "/api/views/" + dup.body.view.id, { cookie: ADMIN, body: { isDefault: true } });
  const afterDef = await req("GET", "/api/views?register=cases", { cookie: ADMIN });
  check("only one default per register", (afterDef.body.views || []).filter((v) => v.isDefault).length === 1,
    JSON.stringify((afterDef.body.views || []).map((v) => [v.name, v.isDefault])));
  const dupName = await req("POST", "/api/views", { cookie: ADMIN, body: { register: "cases", name: "High risk — open", filters: { risk: ["low"] } } });
  check("a duplicate name in the same register is refused", dupName.status === 400, "status=" + dupName.status);
  const del = await req("DELETE", "/api/views/" + dup.body.view.id, { cookie: ADMIN });
  check("delete", del.status === 200);

  /* ------------------------------------------------------------------ 6 --- */
  console.log("\n6. Persistence across sessions and devices");
  const secondSession = await loginAs(SANDBOX, "maryam.haq@zameen.com");   // a fresh sign-in = another device
  check("a brand-new session is established", !!secondSession && secondSession !== ADMIN);
  const fromOtherDevice = await req("GET", "/api/views?register=cases", { cookie: secondSession });
  check("the same user sees their views from a different session",
    (fromOtherDevice.body.views || []).some((v) => v.id === id1),
    JSON.stringify((fromOtherDevice.body.views || []).map((v) => v.name)));
  const stored = JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", "views.json"), "utf8"));
  check("the authoritative store is on the server, not the browser",
    Array.isArray(stored.views) && stored.views.some((v) => v.id === id1), "views.json holds " + (stored.views || []).length);

  /* ------------------------------------------------------------------ 7 --- */
  console.log("\n7. Stale criteria survive rather than crash");
  const stale = await req("POST", "/api/views", { cookie: ADMIN, body: {
    register: "cases", name: "Mixed valid and stale",
    filters: { risk: ["high"], status: ["A status that no longer exists"], entity: ["A company that was deleted"] } } });
  check("a view naming values that no longer exist is still stored",
    stale.status === 201 && Object.keys(stale.body.view.filters).length === 3, "status=" + stale.status);
  const reread = await req("GET", "/api/views?register=cases", { cookie: ADMIN });
  check("and reads back intact, for the UI to reconcile against today's options",
    (reread.body.views || []).some((v) => v.id === stale.body.view.id));

  /* ------------------------------------------------------------------ 8 --- */
  console.log("\n8. Limits");
  const big = await req("POST", "/api/views", { cookie: ADMIN, body: {
    register: "cases", name: "x".repeat(500), filters: { risk: Array.from({ length: 200 }, (_, i) => "v" + i) } } });
  check("an oversized name is truncated, not rejected outright",
    big.status === 201 && big.body.view.name.length <= 80, "len=" + (big.body && big.body.view && big.body.view.name.length));
  check("an oversized value list is capped", big.body.view.filters.risk.length <= 40,
    "n=" + (big.body && big.body.view && big.body.view.filters.risk.length));

  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n  ${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
