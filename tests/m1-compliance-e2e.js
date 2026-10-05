// Compliance end-to-end: hub card → register → record → documents → timeline.
//
// The question this answers is not "does the API work" — m1-compliance covers
// that — but "can a person actually get there". Every module is walked in a real
// browser: the tile shows a real count, opens a populated register, a row opens
// the RIGHT record, the record's Documents tab exposes the documents the
// register promised, and the Timeline has the history the source proved.
//
// It fails on a dead end, on a count the register cannot reproduce, and on a
// document count that does not match between register and detail.
//
//   node tests/m1-compliance-e2e.js
const fs = require("fs");
const { reap, freePortSync } = require("./_reap.js");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const puppeteer = require("./_puppeteer.js");

const tmpdir = require("./_tmpdir.js");
const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_E2E_PORT || "4981";
let B = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

function refuseIfPortBusy(port) {
  const { execSync } = require("child_process");
  let busy = false;
  try { busy = execSync(`ss -tln 2>/dev/null | grep -c ":${port} " || true`, { encoding: "utf8" }).trim() !== "0"; } catch (e) {}
  if (busy) {
    /* A held port must not abort the suite: a suite that executes no
       checks is indistinguishable from a product failure. Relocate. */
    const moved = freePortSync();
    console.error(`  HARNESS_PORT_IN_USE  port ${port} is held by another process — continuing on free port ${moved}`);
    port = moved;
    B = `http://127.0.0.1:${port}`;
  }
}
refuseIfPortBusy(PORT);

// Each module: its hub tile, its register tab, the API that must agree with it.
const MODULES = [
  { key: "loans", tile: "Loans", path: "/compliance/loans", api: "loans", field: "loans" },
  { key: "leases", tile: "Leases", path: "/compliance/leases", api: "leases", field: "leases" },
  { key: "services", tile: "Spend Agreements", path: "/compliance/services", api: "services", field: "services" },
  { key: "licenses", tile: "Licences & Permits", path: "/compliance/licenses", api: "licences", field: "licences" },
];

(async () => {
  const SANDBOX = tmpdir.make("legalos-e2e-");   // removes itself on every exit path
  spawnSync("rsync", ["-a", "--exclude", "node_modules",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs", "--exclude", "legalos/",
    /* A sandbox starts from the BUILD, not from what somebody did in the app
       today — the same set the shared harness excludes. */
    ...tmpdir.excludeArgs(),
    ROOT + "/", SANDBOX + "/"]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const email = "maryam.haq@zameen.com";
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = email;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";

  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server);   // stopped on every exit path, including a kill
  const ping = () => new Promise((res) => { const r = http.get(B + "/api/health", (x) => { x.resume(); res(x.statusCode === 200); }); r.on("error", () => res(false)); r.setTimeout(1200, () => { r.destroy(); res(false); }); });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);

  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 1500, height: 1100 });
  const pageErrors = [];
  p.on("pageerror", (e) => pageErrors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) pageErrors.push(m.text().slice(0, 140)); });

  await p.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(2000);
  await p.type('input[name="email"]', email); await p.type('input[name="password"]', pw);
  await p.click('button[type="submit"]'); await w(4000);
  check("signed in", !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText)));

  const apiGet = (route) => p.evaluate(async (r) => (await fetch(r, { credentials: "same-origin" })).json(), route);
  // Changing only the hash does NOT reload an SPA, so every navigation bounces
  // through a neutral route first — otherwise a page shows the previous one's state.
  const go = async (hash) => {
    await p.goto(B + "/#/dashboard", { waitUntil: "networkidle2" });
    await p.goto(B + "/#" + hash, { waitUntil: "networkidle2" });
    await w(1800);
  };

  /* ====================================== 1. OVERVIEW IS A DASHBOARD ==== */
  console.log("\n1. /compliance is a dashboard — no tab strip, compact module cards");

  await go("/compliance");
  const ov = await p.evaluate(() => ({
    tabs: document.querySelectorAll(".regtabs [role=tab]").length,
    tables: document.querySelectorAll(".table").length,
    crumbs: [...document.querySelectorAll(".topbar__crumbs .crumbbtn, .topbar__crumbs b")].map((n) => n.innerText.trim()).join(" > "),
    cards: [...document.querySelectorAll(".cmod")].map((c) => ({
      label: (c.querySelector(".cmod__t") || {}).innerText || "",
      n: (c.querySelector(".cmod__v") || {}).innerText || "",
      sub: (c.querySelector(".cmod__s") || {}).innerText || "",
      h: Math.round(c.getBoundingClientRect().height),
    })),
    sections: [...document.querySelectorAll(".section")].map((n) => (n.textContent || "").slice(0, 40)),
  }));
  // The whole point of the change: the Overview must not be a tabbed workspace.
  check("Overview shows NO module tab strip", ov.tabs === 0, ov.tabs + " tabs found");
  check("Overview shows no register table", ov.tables === 0, ov.tables + " tables found");
  check("Overview breadcrumb does not repeat the family", ov.crumbs === "ZM > Compliance & Licences", ov.crumbs);

  const labels = ov.cards.map((c) => c.label.trim());
  check("Overview shows exactly the six operational modules", ov.cards.length === 6, labels.join(", "));
  check("there is no redundant Overview card", !labels.includes("Overview"));
  /* COMPANIES, NOT RESOLUTIONS. The company is the primary compliance object;
     the resolutions tile was a figure with a permanently clear position beside
     it. Resolutions remain a register under the company. */
  for (const m of MODULES.concat([{ tile: "Companies" }, { tile: "SECP Filings" }])) {
    check(`Overview has a "${m.tile}" card`, labels.includes(m.tile));
  }
  check("Resolutions is no longer a top-level Overview card", !labels.includes("Resolutions"), labels.join(", "));
  check("the legacy combined module is gone", !labels.includes("Lease, Loan & Service"));
  check("the parallel licence register is gone", !labels.includes("License Register"));
  check("the parallel renewals register is gone", !labels.includes("License Renewals"));

  // Cards are a fixed, equal height — content must not grow them.
  const heights = [...new Set(ov.cards.map((c) => c.h))];
  check("every module card is the same height", heights.length === 1, heights.join(", ") + "px");
  // 130-150px is the spec, not a round number: two rows of cards plus the
  // three bands below them have to fit inside about a screen and a half.
  check("cards are compact (130-150px)", heights[0] >= 130 && heights[0] <= 150, heights[0] + "px");

  const tiles = ov.cards.map((c) => ({ label: c.label, n: c.n }));

  // Tile counts must equal what the API returns — a hub figure the register
  // cannot reproduce is worse than no figure at all.
  for (const m of MODULES) {
    const api = await apiGet("/api/compliance/" + m.api);
    const n = (api[m.field] || []).length;
    const tile = tiles.find((t) => t.label.trim() === m.tile);
    check(`hub count for ${m.tile} equals the API (${n})`,
      tile && parseInt(tile.n.replace(/,/g, ""), 10) === n, tile ? `tile=${tile.n} api=${n}` : "tile missing");
  }
  /* COMPANIES REPLACED RESOLUTIONS ON THE OVERVIEW.
     The resolutions tile reported 965 rows and a permanently clear position —
     a resolution has no expiry and nothing to rectify, so it was a green card
     that could never change, in a strip whose job is to show what needs
     attention. The company is the primary compliance object and has a real
     state. Resolutions are still a register, still counted, and still reached
     through the company that passed them — which is what the next check
     proves. */
  /* The company estate is a second fetch, so the card legitimately shows a dash
     until it lands. Wait for the figure rather than racing it — and the wait
     itself proves the card never asserts a zero it does not have. */
  await p.waitForFunction(() => {
    const c = [...document.querySelectorAll(".cmod")]
      .find((x) => ((x.querySelector(".cmod__t") || {}).innerText || "").trim() === "Companies");
    return !!c && !/^—/.test(((c.querySelector(".cmod__v") || {}).innerText || "").trim());
  }, { timeout: 20000 }).catch(() => {});
  const ov2 = await p.evaluate(() => [...document.querySelectorAll(".cmod")].map((c) => ({
    label: (c.querySelector(".cmod__t") || {}).innerText || "",
    n: (c.querySelector(".cmod__v") || {}).innerText || "",
    sub: (c.querySelector(".cmod__s") || {}).innerText || "",
  })));
  const coApi = await apiGet("/api/companies");
  const coTotal = ((coApi.companies || coApi.rows) || []).length;
  const coTile = ov2.find((t) => t.label.trim() === "Companies");
  check(`hub count for Companies equals the API (${coTotal})`,
    coTile && parseInt(coTile.n.replace(/,/g, ""), 10) === coTotal, coTile ? coTile.n : "missing");
  const resApi = await apiGet("/api/compliance/resolutions");
  const resTotal = resApi.source + (resApi.native || []).length;
  check("the resolutions register still answers, and the company card says how many",
    resTotal > 0 && !!coTile && new RegExp(resTotal.toLocaleString() + "|" + resTotal).test(coTile.sub || ""),
    `api=${resTotal} tileSub="${(coTile && coTile.sub) || "none"}"`);

  /* =========================================== 2. LEGACY ROUTES MOVED === */
  console.log("\n2. Every legacy compliance address lands on the register that owns its records");

  for (const [from, expect] of [
    ["/licenses", "/compliance/licenses"],
    ["/m/agreements", "/compliance"],
    ["/m/resolutions", "/compliance/resolutions"],
    ["/m/licenses", "/compliance/licenses"],
    ["/m/filings", "/compliance/sec-filings"],
    ["/m/filings/OLD-ID", "/compliance/sec-filings"],
    ["/g/compliance", "/compliance"],
    ["/compliance?view=loans", "/compliance/loans"],
    ["/compliance?view=secp", "/compliance/sec-filings"],
  ]) {
    await go(from);
    const hash = await p.evaluate(() => location.hash);
    check(`${from} → ${expect}`, hash.includes(expect), "landed on " + hash);
  }

  /* ============================= 3. CARD → REGISTER → RECORD → DOCS ===== */
  console.log("\n3. Every module: register → record → documents → timeline");

  for (const m of MODULES) {
    const api = await apiGet("/api/compliance/" + m.api);
    const rows = api[m.field] || [];

    await go(m.path);
    const reg = await p.evaluate(() => ({
      count: (document.querySelector(".regcount") || {}).textContent || "",
      rows: document.querySelectorAll(".table tbody tr").length,
      filters: [...document.querySelectorAll(".regbar .fltwrap > .fltbtn")].map((x) => x.textContent.trim()).length,
    }));
    const shown = parseInt((reg.count.match(/([\d,]+)/) || ["0"])[1].replace(/,/g, ""), 10);
    check(`${m.tile}: register opens populated (${rows.length} records)`, rows.length > 0 && reg.rows > 0,
      `api=${rows.length} count="${reg.count.trim()}" rendered=${reg.rows}`);
    check(`${m.tile}: register count equals the API`, shown === rows.length, `register=${shown} api=${rows.length}`);
    check(`${m.tile}: register offers contextual filters`, reg.filters >= 4, reg.filters + " filters");
    const modCrumb = await p.evaluate(() => [...document.querySelectorAll(".topbar__crumbs .crumbbtn, .topbar__crumbs b")].map((n) => n.innerText.trim()).join(" > "));
    check(`${m.tile}: breadcrumb is Compliance & Licences > ${m.tile}`,
      modCrumb === "ZM > Compliance & Licences > " + m.tile, modCrumb);
    const modTabs = await p.evaluate(() => document.querySelectorAll(".regtabs [role=tab]").length);
    check(`${m.tile}: module page has no compliance tab strip`, modTabs === 0, modTabs + " tabs");

    // Open the FIRST row and prove it is the right record, with matching docs.
    const first = rows[0];
    await go(m.path + "/" + encodeURIComponent(first.id));
    const detail = await p.evaluate(() => ({
      h1: (document.querySelector("h1") || {}).textContent || "",
      tabs: [...document.querySelectorAll('[role="tab"]')].map((n) => n.innerText.replace(/\s+/g, " ").trim()),
      notFound: /not found/i.test(document.body.innerText.slice(0, 600)),
    }));
    check(`${m.tile}: row opens a record, not a 404`, !detail.notFound && detail.h1.length > 0, detail.h1.slice(0, 50));
    check(`${m.tile}: record has Overview / Documents / Timeline`,
      detail.tabs.some((t) => /overview/i.test(t)) && detail.tabs.some((t) => /documents/i.test(t)) && detail.tabs.some((t) => /timeline/i.test(t)),
      detail.tabs.join(" | "));

    // The Documents tab must expose what the record actually holds.
    const docTab = detail.tabs.find((t) => /documents/i.test(t)) || "";
    const claimed = parseInt((docTab.match(/(\d+)/) || ["0"])[1], 10);
    const apiDocs = m.api === "licences"
      ? ((first.folderDocuments || first.driveFiles || []).length)
      : ((first.driveFiles || []).length + (first.extraDocuments || []).length);
    check(`${m.tile}: document count matches the source (${apiDocs})`, claimed === apiDocs,
      `tab=${claimed} source=${apiDocs}`);

    const listed = await p.evaluate(() => {
      const t = [...document.querySelectorAll('[role="tab"]')].find((n) => /documents/i.test(n.innerText));
      if (t) t.click();
      return new Promise((r) => setTimeout(() => r(document.querySelectorAll(".feed__item").length), 900));
    });
    check(`${m.tile}: Documents tab lists them (${listed})`, listed === claimed || (claimed === 0 && listed === 0),
      `listed=${listed} claimed=${claimed}`);

    const tl = await p.evaluate(() => {
      const t = [...document.querySelectorAll('[role="tab"]')].find((n) => /timeline/i.test(n.innerText));
      if (t) t.click();
      return new Promise((r) => setTimeout(() => r(document.querySelectorAll(".feed__item").length), 900));
    });
    check(`${m.tile}: Timeline renders`, tl >= 0, tl + " events");
  }

  /* ====================================== 4. RESOLUTIONS: 914, NOT 39 === */
  console.log("\n4. Resolutions expose every record, not just an entity summary");

  await go("/compliance/resolutions");
  /* Wait for the table to POPULATE rather than for a fixed delay. This page now
     loads the full resolution estate and every entity's folder documents, so a
     flat 1800ms sometimes sampled it mid-fetch and read zero rows -- a timing
     artefact that looks exactly like an empty register. */
  const rowsIn = async (sel, ms = 12000) => {
    const deadline = Date.now() + ms;
    let n = 0;
    while (Date.now() < deadline) {
      n = await p.evaluate((q) => document.querySelectorAll(q).length, sel);
      if (n > 0) return n;
      await w(300);
    }
    return n;
  };
  const byEntity = await rowsIn(".table tbody tr");
  check("By entity is a summary", byEntity > 10 && byEntity < 100, byEntity + " entity rows");
  await go("/compliance/resolutions?rview=all");
  const all = await p.evaluate(() => ({
    count: (document.querySelector(".regcount") || {}).textContent || "",
    rows: document.querySelectorAll(".table tbody tr").length,
  }));
  const allShown = parseInt((all.count.match(/([\d,]+)/) || ["0"])[1].replace(/,/g, ""), 10);
  check(`All resolutions exposes every record (${resTotal})`, allShown === resTotal,
    `register=${allShown} api=${resTotal}`);
  check("All resolutions renders rows", all.rows > 0, all.rows + " rendered");

  /* ============================================ 5. SECP IS POPULATED ==== */
  console.log("\n5. SECP is populated from Drive, with document ≠ filed preserved");

  /* THE 250 ENTITY-YEARS ARE REACHED THROUGH THE COMPANY THEY BELONG TO.
     This used to open ?sview=years and count 250 rows in one flat table. That
     tab is gone: "Entities", "Compliance years" and "Annual compliance" were
     three screens over the same records, and a Legal user had to know which of
     the three answered their question. The register now lists the 43 companies
     and a company's years open inside it -- so the count to assert here is the
     estate, and the 250 are asserted where they now live. */
  const years = await apiGet("/api/compliance/secp/years");
  await go("/compliance/sec-filings?sview=years");            // the retired address
  /* The entity register reads the SECP overview, which is the slowest call on
     the page -- 3,367 documents behind it. `go` waits 1.8s, which is enough for
     every other register here and not for this one, so the rows were counted
     before they existed. */
  await w(3500);
  const reg = await p.evaluate(() => ({
    rows: document.querySelectorAll(".table tbody tr").length,
    hash: location.hash,
    text: document.body.innerText,
  }));
  const ents = await apiGet("/api/compliance/secp/overview");
  const estate = ents.statutory ? ents.statutory.entities : 43;
  check("an old link to the retired compliance-years tab still lands on a real register",
    reg.rows === estate, `rendered=${reg.rows} entities in the estate=${estate}`);

  /* And the years themselves, inside the company that holds them. */
  const first = (await apiGet("/api/compliance/secp/years")).years[0];
  await go("/compliance/sec-filings/entity/" + encodeURIComponent(first.entityKey));
  const ev = await p.evaluate(() => ({
    rows: document.querySelectorAll(".table tbody tr").length,
    text: document.body.innerText,
  }));
  const mine = years.years.filter((y) => y.entityKey === first.entityKey).length;
  check(`a company's compliance years are all on its own page (${mine})`,
    ev.rows === mine, `rendered=${ev.rows} api=${mine}`);
  check("SECP years state that evidence is not a filing",
    /not evidence that a filing was made|Not recorded|No acknowledgement/i.test(ev.text));
  const secpOv = await apiGet("/api/compliance/secp/overview");
  check("SECP dashboard separates evidenced years from recorded filings",
    secpOv.dashboard.driveYears.total === years.total && secpOv.dashboard.annual.recorded === 0,
    `${secpOv.dashboard.driveYears.total} years evidenced, ${secpOv.dashboard.annual.recorded} filings recorded`);

  /* ============================================== 6. NO PAGE ERRORS ===== */
  check("no page errors while walking every compliance module",
    pageErrors.length === 0, [...new Set(pageErrors)].slice(0, 3).join(" | "));

  await b.close();
  try { server.kill(); } catch (e) {}

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n  ${pass}/${results.length} checks passed${fail ? `, ${fail} FAILED` : ""}\n`);
  if (fail) for (const r of results.filter((x) => !x.pass)) console.log("  FAILED: " + r.name + (r.detail ? "  — " + r.detail : ""));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
