// Security regression: the boundary, not the buttons.
//
// Every check here asserts what the SERVER does. A hidden nav row proves
// nothing; the API returning 403/404 is the control. Runs against an isolated
// instance with the dev bypass off, so a real session cookie is the identity.
//
//   node tests/m1-security.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_SEC_PORT || "4752";
const BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

const req = (method, route, { cookie, body, headers } = {}) => new Promise((resolve) => {
  const data = body ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body)) : null;
  const h = Object.assign({}, headers || {}, data ? { "Content-Type": "application/json", "Content-Length": data.length } : {},
    cookie ? { Cookie: "legalos_sess=" + cookie } : {});
  const r = http.request(BASE + route, { method, headers: h }, (res) => {
    const chunks = [];
    res.on("data", (d) => chunks.push(d));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {}
      resolve({ status: res.statusCode, body: j, bytes: buf.length, headers: res.headers });
    });
  });
  r.on("error", () => resolve({ status: 0, body: null, bytes: 0, headers: {} }));
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
        console.error("\n  port " + PORT + " is already in use — a previous run did not shut down.");
        console.error("  Stop it first. Refusing to test a stale instance.\n");
        process.exit(2);
      }
      resolve();
    });
    probe.on("error", () => resolve());
    probe.setTimeout(1500, () => { probe.destroy(); resolve(); });
  });

  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-sec-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT, LEGALOS_DEV: "1" } });
  const ping = () => new Promise((resolve) => { const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); }); r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); }); });
  for (let i = 0; i < 40 && !(await ping()); i++) await w(400);

  const ADMIN = await loginAs(SANDBOX, "maryam.haq@zameen.com");       // super admin
  const COMPL = await loginAs(SANDBOX, "sana.hurmat@zameen.com");      // compliance only
  const LITIG = await loginAs(SANDBOX, "salman.khan@zameen.com");      // litigation only
  check("test sessions established", !!(ADMIN && COMPL && LITIG));

  // a real document id from each team's material
  const lit = await req("GET", "/api/registers/litigation?limit=20", { cookie: ADMIN });
  /* A wide page on purpose: the first 20 contract records are all Compliance
     spend agreements, every one of them shared with Compliance by the approved
     policy, so a narrow page contains no Commercial-only document to test with. */
  const con = await req("GET", "/api/registers/contracts?limit=400", { cookie: ADMIN });
  const litFile = ((lit.body.records || []).find((r) => (r.driveFiles || []).length) || {}).driveFiles?.[0];

  /* THE CONTRACT FIXTURE MUST BE COMMERCIAL-ONLY.
     This used to take the first contract document it found, which is fine only
     while every contract document belongs to Commercial alone. It no longer
     does: SPEND-COMPLIANCE-SHARE-V1 explicitly shares 295 spend agreements with
     Compliance on the Director's approval, and the first contract record with
     documents is one of them -- so "compliance cannot download a contract
     document" failed by describing an approved share as a leak.

     Weakening the assertion would have been the wrong repair. The claim worth
     protecting is that a Compliance user cannot reach a document belonging to
     Commercial ALONE, so the fixture now skips anything shared with
     compliance and the test keeps its teeth. */
  const scopeTable = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", "document-scope.json"), "utf8")).documents || {}; }
    catch (e) { return {}; }
  })();
  const sharedWithCompliance = (id) => {
    const r = scopeTable[id];
    if (!r) return false;
    return [...(r.allowedGroups || []), ...(r.sharedGroups || [])].includes("compliance");
  };
  const conFile = (con.body.records || [])
    .flatMap((r) => r.driveFiles || [])
    .find((f) => f && f.id && !sharedWithCompliance(f.id));
  check("found a litigation and a Commercial-only contract document to test with", !!(litFile && conFile),
    conFile ? "contract fixture: " + String(conFile.name).slice(0, 48) : "no Commercial-only contract document found in the page scanned");

  /* ---------------- 1. module authorization (server-side) ---------------- */
  console.log("\n1. Module authorization");
  for (const [who, cookie, allow, deny] of [
    ["compliance-only", COMPL, ["licences", "resolutions", "loans"], ["litigation", "contracts", "notices", "properties"]],
    ["litigation-only", LITIG, ["litigation", "notices"], ["contracts", "licences", "resolutions", "properties"]],
  ]) {
    for (const fam of allow) {
      const r = await req("GET", `/api/registers/${fam}?limit=1`, { cookie });
      check(`${who} may read ${fam}`, r.status === 200, String(r.status));
    }
    for (const fam of deny) {
      const r = await req("GET", `/api/registers/${fam}?limit=1`, { cookie });
      check(`${who} is refused ${fam}`, r.status === 403, String(r.status));
    }
  }

  /* ---------------- 2. document authorization (IDOR) ---------------- */
  console.log("\n2. Document authorization — knowing an id is not access");
  check("compliance-only cannot download a LITIGATION document",
    (await req("GET", "/api/knowledge/file/" + litFile.id, { cookie: COMPL })).status === 404);
  check("compliance-only cannot download a CONTRACT document",
    (await req("GET", "/api/knowledge/file/" + conFile.id, { cookie: COMPL })).status === 404);
  check("litigation-only CAN download its own team's document",
    (await req("GET", "/api/knowledge/file/" + litFile.id, { cookie: LITIG })).status === 200);
  check("litigation-only cannot download a CONTRACT document",
    (await req("GET", "/api/knowledge/file/" + conFile.id, { cookie: LITIG })).status === 404);
  check("an administrator can download both",
    (await req("GET", "/api/knowledge/file/" + litFile.id, { cookie: ADMIN })).status === 200 &&
    (await req("GET", "/api/knowledge/file/" + conFile.id, { cookie: ADMIN })).status === 200);
  check("an unauthorised document is indistinguishable from a missing one",
    (await req("GET", "/api/knowledge/file/" + litFile.id, { cookie: COMPL })).status ===
    (await req("GET", "/api/knowledge/file/does-not-exist-at-all", { cookie: COMPL })).status);

  /* ---------------- 3. search and tree must not leak existence ---------------- */
  console.log("\n3. Search and folder tree respect module access");
  const sC = await req("GET", "/api/knowledge/search?q=vs", { cookie: COMPL });
  const sA = await req("GET", "/api/knowledge/search?q=vs", { cookie: ADMIN });
  check("search returns fewer results for a restricted user than for an admin",
    (sC.body.results || []).length < (sA.body.results || []).length,
    `${(sC.body.results || []).length} vs ${(sA.body.results || []).length}`);
  const tC = await req("GET", "/api/knowledge/tree", { cookie: COMPL });
  const tA = await req("GET", "/api/knowledge/tree", { cookie: ADMIN });
  const rootsC = (tC.body.roots || []).map((r) => r.name);
  check("the folder tree hides roots the caller may not read",
    rootsC.length < (tA.body.roots || []).length && !rootsC.some((n) => /^litigation/i.test(n)),
    JSON.stringify(rootsC));

  /* ---------------- 4. privilege escalation ---------------- */
  console.log("\n4. Privilege escalation");
  check("an ordinary user cannot grant themselves admin",
    (await req("POST", "/api/access/user/u18", { cookie: LITIG, body: { groups: { admin: "full" } } })).status === 403);
  check("...nor apply a superAdmin role to themselves",
    (await req("POST", "/api/access/user/u18", { cookie: LITIG, body: { role: "superAdmin" } })).status === 403);
  check("...nor deactivate the Director",
    (await req("POST", "/api/access/user/u1", { cookie: LITIG, body: { status: "inactive" } })).status === 403);
  const after = await req("GET", "/api/access/users", { cookie: ADMIN });
  const u18 = (after.body.users || []).find((u) => u.id === "u18");
  check("their effective access is unchanged", u18 && u18.groups.admin === "none" && u18.status === "active",
    JSON.stringify(u18 && u18.groups));

  /* ---------------- 5. admin-only surfaces ---------------- */
  console.log("\n5. Admin-only surfaces");
  for (const [route, label] of [["/api/access/users", "user list"], ["/api/access/audit", "audit log"], ["/api/registers/health", "Data Health"]]) {
    check(`${label} is refused to a non-admin`, (await req("GET", route, { cookie: LITIG })).status === 403);
    check(`${label} is available to an admin`, (await req("GET", route, { cookie: ADMIN })).status === 200);
  }

  /* ---------------- 6. unauthenticated ---------------- */
  console.log("\n6. Unauthenticated and forged identity");
  for (const route of ["/api/registers/litigation", "/api/access/users", "/api/registers/health", "/api/requests", "/api/me"]) {
    check(`${route} refuses an anonymous caller`, (await req("GET", route)).status === 401);
  }
  check("a plaintext Cloudflare email header grants nothing",
    (await req("GET", "/api/registers/litigation", { headers: { "Cf-Access-Authenticated-User-Email": "maryam.haq@zameen.com" } })).status === 401);
  check("a forged Access JWT grants nothing",
    (await req("GET", "/api/registers/litigation", { headers: { "Cf-Access-Jwt-Assertion": "forged.jwt.value" } })).status === 401);

  /* ---------------- 7. mass assignment ---------------- */
  console.log("\n7. Mass assignment");
  const forged = await req("POST", "/api/requests", { cookie: LITIG, body: {
    title: "SEC-FIXTURE mass assignment", status: "Triage",
    requestedByEmail: "maryam.haq@zameen.com", requestedBy: { name: "Maryam Haq" },
    receivedAt: "1999-01-01T00:00:00.000Z", source: "portal", __quality: "COMPLETE",
  } });
  check("the request was accepted", forged.status === 201, String(forged.status));
  const rec = forged.body && forged.body.request;
  check("a forged requester identity is overwritten by the verified caller",
    rec && rec.requestedByEmail === "salman.khan@zameen.com", rec && rec.requestedByEmail);
  check("a forged arrival time is ignored", rec && rec.receivedAt !== "1999-01-01T00:00:00.000Z");
  check("internal `__` fields are stripped from the client payload", rec && rec.__quality === undefined);

  /* ---------------- 8. HTTP methods and headers ---------------- */
  console.log("\n8. HTTP methods and security headers");
  check("a state-changing route rejects GET",
    [404, 405, 403].includes((await req("GET", "/api/access/user/u18", { cookie: ADMIN })).status));
  const page = await req("GET", "/");
  const h = page.headers || {};
  check("X-Content-Type-Options is set", h["x-content-type-options"] === "nosniff");
  check("Referrer-Policy is set", !!h["referrer-policy"]);
  check("clickjacking is prevented", h["x-frame-options"] === "DENY" && /frame-ancestors 'none'/.test(h["content-security-policy"] || ""));
  check("a Content-Security-Policy is served", !!h["content-security-policy"]);
  check("CSP forbids arbitrary object/base/form targets",
    /object-src/.test(h["content-security-policy"] || "") && /base-uri 'self'/.test(h["content-security-policy"] || ""));
  check("no CORS wildcard is advertised", !h["access-control-allow-origin"]);
  check("API responses are not cacheable by a shared cache",
    (await req("GET", "/api/me", { cookie: ADMIN })).headers["cache-control"] === "no-store");

  /* ---------------- 9. cookie flags ---------------- */
  console.log("\n9. Session cookie");
  const raw = await new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ email: "maryam.haq@zameen.com", password: "definitely-wrong" }));
    const rq = http.request(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); resolve((res.headers["set-cookie"] || []).join(";")); });
    rq.on("error", () => resolve("")); rq.write(data); rq.end();
  });
  check("a failed login sets no session cookie", !/legalos_sess=[^;]+/.test(raw) || /legalos_sess=;/.test(raw), raw.slice(0, 60));
  const okLogin = await new Promise((resolve) => {
    const out = spawnSync("node", ["tools/legalos-passwd.js", "set", "ali.raza@zameen.com"], { cwd: SANDBOX, encoding: "utf8" });
    const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1];
    const data = Buffer.from(JSON.stringify({ email: "ali.raza@zameen.com", password: pw }));
    const rq = http.request(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); resolve((res.headers["set-cookie"] || []).join(";")); });
    rq.on("error", () => resolve("")); rq.write(data); rq.end();
  });
  check("the session cookie is HttpOnly", /HttpOnly/i.test(okLogin));
  check("the session cookie is SameSite", /SameSite/i.test(okLogin), okLogin.slice(0, 90));
  check("the session cookie is path-scoped to the app", /Path=\/[^;]*/i.test(okLogin));

  /* ---------------------------------------------------------------------
     10. The handout credential list must never claim a password that fails.

     This is a real lockout, not a hypothetical. `seed` wrote
     config/INITIAL-CREDENTIALS.md on day one; `set` then rotated several
     passwords over the following days and never touched that file. It went on
     listing day-one passwords with nothing to say it was lying, so reading a
     password out of it produced "That email or password is not right" for a
     live user while the app was working perfectly. A credential record that can
     silently disagree with the system it describes is worse than none.
     --------------------------------------------------------------------- */
  console.log("\n10. The handout credential list tells the truth");
  {
    const { verifyPassword } = require(path.join(SANDBOX, "api", "auth.js"));
    const credPath = path.join(SANDBOX, "config", "INITIAL-CREDENTIALS.md");
    const usersPath = path.join(SANDBOX, "config", "users.json");
    if (!fs.existsSync(credPath)) {
      check("no handout file on disk — nothing can go stale", true, "config/INITIAL-CREDENTIALS.md absent");
    } else {
      const accounts = (JSON.parse(fs.readFileSync(usersPath, "utf8")).accounts) || [];
      const byEmail = new Map(accounts.map((a) => [String(a.email).toLowerCase(), a]));
      const claimed = [];
      for (const line of fs.readFileSync(credPath, "utf8").split("\n")) {
        const m = line.match(/^\|[^|]*\|\s*([^|\s]+@[^|\s]+)\s*\|\s*`([^`]+)`/);
        if (m) claimed.push({ email: m[1].toLowerCase(), password: m[2] });
      }
      const stale = claimed.filter((c) => {
        const a = byEmail.get(c.email);
        return !a || !verifyPassword(c.password, a.hash);
      });
      check("every password the handout file states actually works",
        stale.length === 0,
        stale.length ? stale.map((x) => x.email).join(", ") + " — run: node tools/legalos-passwd.js sync"
          : claimed.length + " stated password(s), all verified");
      // A row for an account that no longer exists is the same class of lie.
      const orphans = claimed.filter((c) => !byEmail.has(c.email));
      check("the handout file names no account that does not exist",
        orphans.length === 0, orphans.map((x) => x.email).join(", ") || "none");
    }
  }

  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  const pass = results.filter((x) => x.pass).length;
  const fail = results.filter((x) => !x.pass);
  console.log(`\n${"=".repeat(60)}\n  ${pass}/${results.length} checks passed`);
  if (fail.length) { console.log("\n  FAILED:"); fail.forEach((f) => console.log("   ✗ " + f.name + (f.detail ? "  — " + f.detail : ""))); }
  console.log("=".repeat(60));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("SUITE ERROR:", e); process.exit(1); });
