// Staged load test against the LegalOS API.
//
// Drives the endpoints that actually carry a page: the registers behind the
// dashboards and tables, the document-bearing payloads, request intake and the
// permission surface. It runs against an ISOLATED instance, never the live
// service, and it does not hammer Google Drive — production serves these from
// the normalized register cache, which is exactly what is being measured.
//
//   node tools/load-test.js                  (1,5,10,25,50 virtual users)
//   node tools/load-test.js --max 100        (adds a 100-user stage)
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_LOAD_PORT || "4741";
const BASE = `http://127.0.0.1:${PORT}`;
const MAXARG = process.argv.indexOf("--max");
const MAXVU = MAXARG > -1 ? Number(process.argv[MAXARG + 1]) : 50;
const STAGES = [1, 5, 10, 25, 50, 100].filter((n) => n <= MAXVU);
const w = (ms) => new Promise((r) => setTimeout(r, ms));

const ENDPOINTS = [
  { name: "registers summary (dashboard)", path: "/api/registers" },
  { name: "litigation register",           path: "/api/registers/litigation?limit=500" },
  { name: "contracts register (page)",     path: "/api/registers/contracts?limit=100" },
  { name: "contracts register (full)",     path: "/api/registers/contracts?limit=5000" },
  { name: "register search",               path: "/api/registers/contracts?limit=100&q=lease" },
  { name: "notices register",              path: "/api/registers/notices?limit=500" },
  { name: "legal requests",                path: "/api/requests" },
  { name: "effective permissions",         path: "/api/access/me" },
  { name: "identity",                      path: "/api/me" },
];

function once(pathname, cookie) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = http.get(BASE + pathname, { headers: cookie ? { Cookie: "legalos_sess=" + cookie, "Accept-Encoding": "gzip" } : {} }, (res) => {
      let bytes = 0;
      res.on("data", (d) => { bytes += d.length; });
      res.on("end", () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6, bytes }));
    });
    req.on("error", () => resolve({ status: 0, ms: Number(process.hrtime.bigint() - t0) / 1e6, bytes: 0 }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: -1, ms: 30000, bytes: 0 }); });
  });
}
const pct = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]; };

(async () => {
  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-load-"));
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

  // one signed-in identity for every virtual user
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", "maryam.haq@zameen.com"], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1];
  const cookie = await new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ email: "maryam.haq@zameen.com", password: pw }));
    const rq = http.request(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); const m = (res.headers["set-cookie"] || []).join(";").match(/legalos_sess=([^;]+)/); resolve(m ? m[1] : null); });
    rq.on("error", () => resolve(null)); rq.write(data); rq.end();
  });
  if (!cookie) { console.error("could not sign in"); process.exit(1); }

  // warm the register cache so stage 1 is not measuring a cold Drive read
  await once("/api/registers", cookie);
  await once("/api/registers/contracts?limit=5000", cookie);

  const rss0 = process.memoryUsage().rss;
  const report = [];
  console.log(`LegalOS load test — ${new Date().toISOString()}`);
  console.log(`dataset: 3,134 records across 7 registers; endpoints: ${ENDPOINTS.length}\n`);

  for (const ep of ENDPOINTS) {
    console.log(`── ${ep.name}`);
    console.log("   VU   reqs   ok   err    p50     p95     p99     max    RPS   payload");
    for (const vu of STAGES) {
      const perVU = 6;
      const t0 = Date.now();
      const runs = [];
      for (let v = 0; v < vu; v++) {
        runs.push((async () => {
          const rows = [];
          for (let i = 0; i < perVU; i++) rows.push(await once(ep.path, cookie));
          return rows;
        })());
      }
      const rows = (await Promise.all(runs)).flat();
      const secs = (Date.now() - t0) / 1000;
      const ms = rows.map((r) => r.ms);
      const ok = rows.filter((r) => r.status === 200).length;
      const err = rows.length - ok;
      const bytes = Math.round(rows.reduce((n, r) => n + r.bytes, 0) / rows.length);
      const rec = { endpoint: ep.name, path: ep.path, vu, requests: rows.length, ok, err,
        p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), p99: Math.round(pct(ms, 99)),
        max: Math.round(Math.max(...ms)), rps: +(rows.length / secs).toFixed(1), avgBytes: bytes,
        statuses: [...new Set(rows.map((r) => r.status))] };
      report.push(rec);
      console.log(`  ${String(vu).padStart(3)}  ${String(rec.requests).padStart(5)}  ${String(ok).padStart(4)} ${String(err).padStart(5)}  ${String(rec.p50).padStart(5)}ms ${String(rec.p95).padStart(5)}ms ${String(rec.p99).padStart(5)}ms ${String(rec.max).padStart(5)}ms ${String(rec.rps).padStart(6)}  ${(bytes / 1024).toFixed(0)}KB`);
    }
    console.log("");
  }

  // concurrent writes (request intake) at the top stage
  const topVU = STAGES[STAGES.length - 1];
  console.log(`── request intake (write) @ ${topVU} concurrent`);
  const t0 = Date.now();
  const writes = await Promise.all(Array.from({ length: topVU }, (_, i) => new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ title: "LOAD-FIXTURE " + i, status: "Triage", department: "Finance", channel: "portal" }));
    const s0 = process.hrtime.bigint();
    const rq = http.request(BASE + "/api/requests", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length, Cookie: "legalos_sess=" + cookie } },
      (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, id: j && j.id, ms: Number(process.hrtime.bigint() - s0) / 1e6 }); }); });
    rq.on("error", () => resolve({ status: 0, ms: 0 })); rq.write(data); rq.end();
  })));
  const wms = writes.map((x) => x.ms);
  const wok = writes.filter((x) => x.status === 201).length;
  const ids = writes.map((x) => x.id).filter(Boolean);
  console.log(`   ${writes.length} writes | ok ${wok} | unique ids ${new Set(ids).size} | p50 ${Math.round(pct(wms, 50))}ms | p95 ${Math.round(pct(wms, 95))}ms | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  report.push({ endpoint: "request intake (POST)", vu: topVU, requests: writes.length, ok: wok, err: writes.length - wok,
    p50: Math.round(pct(wms, 50)), p95: Math.round(pct(wms, 95)), p99: Math.round(pct(wms, 99)), max: Math.round(Math.max(...wms)),
    uniqueIds: new Set(ids).size });

  const rss1 = process.memoryUsage().rss;
  const summary = {
    generatedAt: new Date().toISOString(), stages: STAGES, endpoints: ENDPOINTS.length,
    totalRequests: report.reduce((n, r) => n + r.requests, 0),
    totalErrors: report.reduce((n, r) => n + r.err, 0),
    harnessRssDeltaMB: +((rss1 - rss0) / 1048576).toFixed(1),
    rows: report,
  };
  fs.writeFileSync(path.join(ROOT, "load-results.json"), JSON.stringify(summary, null, 2));
  console.log(`\ntotal ${summary.totalRequests} requests, ${summary.totalErrors} errors — wrote load-results.json`);

  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  process.exit(summary.totalErrors ? 1 : 0);
})().catch((e) => { console.error("LOAD TEST FAILED:", e); process.exit(1); });
