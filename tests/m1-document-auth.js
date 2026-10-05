// Document & knowledge authorization — EVERY document, EVERY persona.
//
// The knowledge bypass (SEC-001) was P0: the registers were gated but the
// documents behind them were not, so a Compliance-only account downloaded a
// litigation case file in full. Fixing it is not enough — the fix has to be
// proven across the whole corpus, not on one contract and one case.
//
// So this suite asks every persona for EVERY file in the Drive index and
// compares the answer against an expectation derived INDEPENDENTLY from the
// register data and the Drive roots, not from the server's own code path.
// It then attacks the metadata surfaces separately, because a filename is
// information: search, tree, folder listing, template library and content
// matching each get their own leak test.
//
//   node tests/m1-document-auth.js
const fs = require("fs");
const { reap, freePort } = require("./_reap.js");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let PORT = process.env.LEGALOS_DOC_PORT || "4811";
let BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};

const agent = new http.Agent({ keepAlive: true, maxSockets: 12 });

const req = (method, route, { cookie } = {}) => new Promise((resolve) => {
  const h = cookie ? { Cookie: "legalos_sess=" + cookie } : {};
  const r = http.request(BASE + route, { method, headers: h, agent }, (res) => {
    const chunks = []; let len = 0;
    res.on("data", (d) => { len += d.length; if (chunks.length < 40) chunks.push(d); });
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {}
      resolve({ status: res.statusCode, body: j, bytes: len, headers: res.headers });
    });
  });
  r.on("error", () => resolve({ status: 0, body: null, bytes: 0, headers: {} }));
  r.end();
});

/* Status only — the body is abandoned as soon as the headers arrive, so asking
   for 3,476 documents four times over does not mean downloading 14 GB. */
const statusOnly = (route, cookie) => new Promise((resolve) => {
  const r = http.request(BASE + route, { method: "GET", headers: cookie ? { Cookie: "legalos_sess=" + cookie } : {}, agent },
    (res) => { const s = res.statusCode; res.destroy(); resolve(s); });
  r.on("error", () => resolve(0));
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

// The same root -> module mapping the product uses, restated here so the test
// has its own definition of the truth rather than importing the implementation.
const rootGroup = (root) => {
  const r = String(root || "").toLowerCase();
  if (r.startsWith("litigation")) return "litigation";
  if (r.startsWith("compliance")) return "compliance";
  if (r.startsWith("commercial")) return "commercial";
  // The statutory root. SECP filings are corporate compliance and are shown on
  // Compliance & Licences / SEC Filings, so the compliance group owns them.
  if (r.startsWith("entities data for secp")) return "compliance";
  return null;
};
const FAMILY_GROUP = {
  contracts: "commercial", properties: "commercial",
  litigation: "litigation", notices: "litigation",
  licences: "compliance", loans: "compliance", resolutions: "compliance",
};

(async () => {
  const ping = () => new Promise((resolve) => { const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); }); r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); }); });
  /* A held port must not abort the suite: a suite that executes no checks
     is indistinguishable from a product failure. Report and relocate. */
  if (await ping()) {
    const moved = await freePort();
    console.error(`  HARNESS_PORT_IN_USE  port ${PORT} is held by another process — continuing on free port ${moved}`);
    PORT = moved;
    BASE = `http://127.0.0.1:${PORT}`;
  }

  const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-doc-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json", "--exclude", "legalos/", ROOT + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server);   // stopped on every exit path, including a kill
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  /* ---- personas, from the real roster (no invented identities) ---------- */
  const P = {
    admin:      { email: "maryam.haq@zameen.com",   groups: { commercial: "full", compliance: "full", litigation: "full", admin: "full" }, isAdmin: true },
    commercial: { email: "ahmed.sardar@zameen.com", groups: { commercial: "edit", compliance: "none", litigation: "none", admin: "none" } },
    compliance: { email: "sana.hurmat@zameen.com",  groups: { commercial: "none", compliance: "edit", litigation: "none", admin: "none" } },
    litigation: { email: "salman.khan@zameen.com",  groups: { commercial: "none", compliance: "none", litigation: "edit", admin: "none" } },
  };
  for (const k of Object.keys(P)) P[k].cookie = await loginAs(SANDBOX, P[k].email);
  check("four sessions established (admin + one per module)", Object.values(P).every((p) => !!p.cookie));

  /* ---- build the expectation INDEPENDENTLY -------------------------------- */
  const idx = JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", ".drive-index.json"), "utf8"));
  const allFiles = idx.files || [];
  const st = JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", ".registers.json"), "utf8"));
  const linkedGroups = new Map();        // fileId -> Set(module group)
  for (const [fam, rows] of Object.entries(st.registers || {})) {
    const g = FAMILY_GROUP[fam];
    if (!g || !Array.isArray(rows)) continue;
    for (const r of rows) for (const f of r.driveFiles || []) {
      if (!linkedGroups.has(f.id)) linkedGroups.set(f.id, new Set());
      linkedGroups.get(f.id).add(g);
    }
  }
  /* THE EXPECTATION MUST MODEL THE POLICY THAT IS ACTUALLY IN FORCE.
     This used to derive the expected answer from CITATIONS -- whichever module
     registers cited a document could read it, otherwise its source root
     decided. That was the old rule, and it agreed with reality only because the
     persisted scope had been SEEDED from it. The first deliberate divergence --
     295 spend documents explicitly shared with Compliance under
     SPEND-COMPLIANCE-SHARE-V1 -- was reported as 295 authorization failures by
     a test that was itself out of date.

     So the expectation is now built from config/document-scope.json, which is
     where authorization actually lives. It stays INDEPENDENT of the
     application: the file is read directly and the rule reimplemented here,
     rather than calling canAccessDocument, which would only prove that
     function agrees with itself.

     Citations are still read, but only to check the multi-module claim below;
     they no longer decide who may read anything. */
  const scopeTable = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(SANDBOX, "config", "document-scope.json"), "utf8")).documents || {}; }
    catch (e) { return {}; }
  })();
  const mayRead = (file, persona) => {
    if (persona.isAdmin) return true;
    const lvl = (g) => persona.groups[g] || "none";
    const rec = scopeTable[file.id];
    if (rec) {
      /* An explicit deny outranks everything, including a share. */
      if ((rec.deniedGroups || []).some((g) => lvl(g) !== "none")) return false;
      const allowed = new Set([...(rec.allowedGroups || []), ...(rec.sharedGroups || [])]);
      if (allowed.size) return [...allowed].some((g) => lvl(g) !== "none");
    }
    const rg = rootGroup(file.root);
    if (rg) return lvl(rg) !== "none";
    return false;                        // unclassified source: deny
  };

  const multi = [...linkedGroups.entries()].filter(([, s]) => s.size > 1);
  console.log(`\n  corpus: ${allFiles.length} files · ${linkedGroups.size} cited by a record · ${multi.length} cited across more than one module`);
  const byRoot = {};
  for (const f of allFiles) byRoot[f.root || "(none)"] = (byRoot[f.root || "(none)"] || 0) + 1;
  Object.entries(byRoot).forEach(([k, v]) => console.log(`          ${String(v).padStart(5)}  ${k}  ->  ${rootGroup(k) || "UNCLASSIFIED"}`));

  /* ================================================================== 1 === */
  console.log("\n1. EVERY document, EVERY persona — status must match the policy");
  for (const [name, persona] of Object.entries(P)) {
    if (persona.isAdmin) continue;
    let checked = 0, wrongAllow = [], wrongDeny = [];
    const CONC = 10;
    let cursor = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (cursor < allFiles.length) {
        const f = allFiles[cursor++];
        const expectAllow = mayRead(f, persona);
        const s = await statusOnly("/api/knowledge/file/" + encodeURIComponent(f.id), persona.cookie);
        checked++;
        if (expectAllow && s === 404) wrongDeny.push(`${f.name} (${f.root}) -> 404`);
        if (!expectAllow && s !== 404) wrongAllow.push(`${f.name} (${f.root}) -> ${s}`);
      }
    }));
    check(`${name}: ${checked} documents, 0 readable that policy forbids`,
      wrongAllow.length === 0, wrongAllow.slice(0, 3).join(" | "));
    check(`${name}: 0 documents wrongly withheld`,
      wrongDeny.length === 0, wrongDeny.slice(0, 3).join(" | "));
  }

  /* ================================================================== 2 === */
  console.log("\n2. Multi-module documents follow the stated rule");
  // THE RULE: a document cited by a record you may read is part of that record's
  // file, so any citing module grants it. Asserted here rather than assumed.
  let multiOk = 0, multiBad = [];
  for (const [fid, groups] of multi.slice(0, 200)) {
    const f = allFiles.find((x) => x.id === fid);
    if (!f) continue;
    for (const [name, persona] of Object.entries(P)) {
      if (persona.isAdmin) continue;
      const shouldSee = [...groups].some((g) => (persona.groups[g] || "none") !== "none");
      const s = await statusOnly("/api/knowledge/file/" + encodeURIComponent(fid), persona.cookie);
      const ok = shouldSee ? s !== 404 : s === 404;
      if (ok) multiOk++; else multiBad.push(`${name} ${f.name} groups=${[...groups]} -> ${s}`);
    }
  }
  check(`${multiOk} multi-module document checks follow "any citing module grants it"`,
    multiBad.length === 0, multiBad.slice(0, 3).join(" | "));

  /* ================================================================== 3 === */
  console.log("\n3. Search returns no metadata for documents the caller cannot open");
  const TERMS = ["a", "agreement", "case", "vs", "zameen", "legal", "notice", "the", "contract", "court"];
  for (const [name, persona] of Object.entries(P)) {
    if (persona.isAdmin) continue;
    let hits = 0, leaked = [];
    for (const q of TERMS) {
      const r = await req("GET", `/api/knowledge/search?q=${encodeURIComponent(q)}&limit=200`, { cookie: persona.cookie });
      for (const res of (r.body && r.body.results) || []) {
        hits++;
        const f = allFiles.find((x) => x.id === res.id) || { id: res.id, root: res.root };
        if (!mayRead(f, persona)) leaked.push(`q="${q}" -> ${res.name || res.id}`);
      }
    }
    check(`${name}: ${hits} search hits over ${TERMS.length} broad terms, 0 unauthorized`,
      leaked.length === 0, leaked.slice(0, 3).join(" | "));
  }

  /* ================================================================== 4 === */
  console.log("\n4. Tree and folder listings do not reveal other modules' matter names");
  for (const [name, persona] of Object.entries(P)) {
    if (persona.isAdmin) continue;
    const t = await req("GET", "/api/knowledge/tree", { cookie: persona.cookie });
    const roots = ((t.body && t.body.roots) || []).map((r) => r.name);
    const badRoots = roots.filter((r) => { const g = rootGroup(r); return g && (persona.groups[g] || "none") === "none"; });
    check(`${name}: tree lists only permitted roots (${roots.length}: ${roots.join(", ") || "none"})`,
      badRoots.length === 0, badRoots.join(" | "));
    /* An UNCLASSIFIED root must not be listed to anyone either. This check used
       to read `g && …`, so a root matching no module group fell straight
       through and was never examined — which is exactly how the statutory root
       came to be advertised, with its folder names and file counts, to every
       legal user while every one of its documents was denied. An unknown corpus
       is the one you can say least about, so it is the last one to expose. */
    const unclassified = roots.filter((r) => !rootGroup(r));
    check(`${name}: tree lists no unclassified root`,
      unclassified.length === 0, unclassified.join(" | ") || "none");
    const folders = ((t.body && t.body.folders) || []).map((f) => f.name);
    const badFolders = folders.filter((fn) => !roots.some((r) => String(fn).startsWith(r)));
    check(`${name}: ${folders.length} folder names, none from a root they cannot read`,
      badFolders.length === 0, badFolders.slice(0, 3).join(" | "));

    // Ask directly for a folder belonging to another module.
    const foreign = allFiles.find((f) => { const g = rootGroup(f.root); return g && (persona.groups[g] || "none") === "none"; });
    if (foreign) {
      const fr = await req("GET", `/api/knowledge/files?folder=${encodeURIComponent(foreign.folderPath || "")}&root=${encodeURIComponent(foreign.root || "")}`, { cookie: persona.cookie });
      const got = ((fr.body && fr.body.files) || []).length;
      check(`${name}: naming another module's folder directly returns 0 files`, got === 0, got + " files returned");
    }
  }

  /* ================================================================== 5 === */
  console.log("\n5. Content matching filters BEFORE it answers");
  for (const [name, persona] of Object.entries(P)) {
    if (persona.isAdmin) continue;
    const foreignIds = allFiles.filter((f) => !mayRead(f, persona)).slice(0, 30).map((f) => f.id);
    if (!foreignIds.length) continue;
    const r = await req("GET", `/api/knowledge/matches?q=agreement&ids=${foreignIds.join(",")}`, { cookie: persona.cookie });
    const checked = (r.body && r.body.checked) || 0;
    const matches = ((r.body && r.body.matches) || []).length;
    check(`${name}: content matching on 30 unauthorized ids checks 0 and returns 0`,
      checked === 0 && matches === 0, `checked=${checked} matches=${matches}`);
  }

  /* ================================================================== 6 === */
  console.log("\n6. The template library is scoped like every other document");
  const tplByPersona = {};
  for (const [name, persona] of Object.entries(P)) {
    const r = await req("GET", "/api/knowledge/templates", { cookie: persona.cookie });
    const items = (r.body && r.body.items) || [];
    tplByPersona[name] = items.length;
    const leaked = items.filter((it) => { const f = allFiles.find((x) => x.id === it.id); return f && !mayRead(f, persona); });
    check(`${name}: template list has 0 entries the caller cannot open (${items.length} listed)`,
      leaked.length === 0, leaked.slice(0, 2).map((x) => x.name).join(" | "));
  }
  check("templates live under the commercial root, so only commercial access lists them",
    tplByPersona.commercial > 0 && tplByPersona.compliance === 0 && tplByPersona.litigation === 0,
    JSON.stringify(tplByPersona));

  /* ================================================================== 7 === */
  console.log("\n7. Unauthorized and missing are indistinguishable");
  const foreignForCompliance = allFiles.find((f) => !mayRead(f, P.compliance));
  const missing = await req("GET", "/api/knowledge/file/" + encodeURIComponent("this-id-does-not-exist-000"), { cookie: P.compliance.cookie });
  const denied = await req("GET", "/api/knowledge/file/" + encodeURIComponent(foreignForCompliance.id), { cookie: P.compliance.cookie });
  check("a document that is forbidden and one that does not exist answer identically",
    missing.status === denied.status && missing.status === 404 &&
    JSON.stringify(missing.body) === JSON.stringify(denied.body),
    `missing=${missing.status}${JSON.stringify(missing.body)} denied=${denied.status}${JSON.stringify(denied.body)}`);

  // Timing: a constant-time guarantee is not claimed, but the two must not be
  // separable by an obvious order-of-magnitude difference.
  const timeIt = async (id) => { const t0 = Date.now(); for (let i = 0; i < 12; i++) await statusOnly("/api/knowledge/file/" + encodeURIComponent(id), P.compliance.cookie); return (Date.now() - t0) / 12; };
  const tMissing = await timeIt("this-id-does-not-exist-000");
  const tDenied = await timeIt(foreignForCompliance.id);
  const ratio = Math.max(tMissing, tDenied) / Math.max(1, Math.min(tMissing, tDenied));
  check(`response time does not separate them (missing ${tMissing.toFixed(1)}ms vs forbidden ${tDenied.toFixed(1)}ms)`,
    ratio < 5, `ratio ${ratio.toFixed(1)}x`);

  /* ================================================================== 8 === */
  console.log("\n8. Caches are not shared across callers");
  // Warm every cache as the administrator first, then ask as a restricted user.
  await req("GET", "/api/knowledge/search?q=vs&limit=200", { cookie: P.admin.cookie });
  await req("GET", "/api/knowledge/tree", { cookie: P.admin.cookie });
  await req("GET", "/api/registers/litigation?limit=5000", { cookie: P.admin.cookie });
  const adminSearch = await req("GET", "/api/knowledge/search?q=vs&limit=200", { cookie: P.admin.cookie });
  const complSearch = await req("GET", "/api/knowledge/search?q=vs&limit=200", { cookie: P.compliance.cookie });
  const aN = ((adminSearch.body || {}).results || []).length;
  const cN = ((complSearch.body || {}).results || []).length;
  const cLeak = ((complSearch.body || {}).results || []).filter((r) => { const f = allFiles.find((x) => x.id === r.id); return f && !mayRead(f, P.compliance); });
  check(`a warmed admin search (${aN} hits) is not replayed to a restricted caller (${cN} hits, 0 unauthorized)`,
    cLeak.length === 0, cLeak.slice(0, 3).map((x) => x.name).join(" | "));
  const adminReg = await req("GET", "/api/registers/litigation?limit=5000", { cookie: P.admin.cookie });
  const complReg = await req("GET", "/api/registers/litigation?limit=5000", { cookie: P.compliance.cookie });
  check("a warmed register response is not replayed across permission scopes",
    adminReg.status === 200 && complReg.status === 403,
    `admin=${adminReg.status} compliance=${complReg.status}`);

  /* ================================================================== 9 === */
  console.log("\n9. 403 for a module, 404 for a document — applied consistently");
  const famFor = { litigation: "litigation", notices: "litigation", contracts: "commercial", properties: "commercial", licences: "compliance", loans: "compliance", resolutions: "compliance" };
  const mism = [];
  for (const [name, persona] of Object.entries(P)) {
    if (persona.isAdmin) continue;
    for (const [fam, grp] of Object.entries(famFor)) {
      const allowed = (persona.groups[grp] || "none") !== "none";
      const r = await statusOnly(`/api/registers/${fam}?limit=10`, persona.cookie);
      const want = allowed ? 200 : 403;
      if (r !== want) mism.push(`${name}/${fam} -> ${r} (want ${want})`);
    }
  }
  check(`${Object.keys(famFor).length * 3} register endpoints: 200 when permitted, 403 when not`,
    mism.length === 0, mism.slice(0, 4).join(" | "));

  /* ================================================================= 10 === */
  console.log("\n10. An unauthenticated caller gets nothing at all");
  const anonFile = await statusOnly("/api/knowledge/file/" + encodeURIComponent(allFiles[0].id), null);
  const anonSearch = await req("GET", "/api/knowledge/search?q=a", {});
  const anonTree = await req("GET", "/api/knowledge/tree", {});
  const anonTpl = await req("GET", "/api/knowledge/templates", {});
  check("no session: file, search, tree and templates all refuse",
    anonFile === 401 && anonSearch.status === 401 && anonTree.status === 401 && anonTpl.status === 401,
    `file=${anonFile} search=${anonSearch.status} tree=${anonTree.status} templates=${anonTpl.status}`);

  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n  ${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
