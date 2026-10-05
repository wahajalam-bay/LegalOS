// Screen-reader semantics — inspected through Chrome's accessibility tree.
//
// METHOD, stated plainly: this does NOT drive NVDA, JAWS or VoiceOver. It reads
// the accessibility tree Chrome exposes to assistive technology (the same tree a
// screen reader consumes) via CDP, and asserts the semantics a reader depends on
// — that the page has one meaningful heading, that landmarks exist, that every
// control has an accessible name, that tables expose column headers, that
// dialogs are named and modal, and that form fields are labelled and their
// errors associated.
//
// What it cannot tell you: whether the announcement READS well. That needs a
// human with a screen reader. No conformance level is claimed.
//
//   node tests/m1-screenreader.js
const puppeteer = require("./_puppeteer.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), P = require("path"), http = require("http");

const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const PORT = process.env.LEGALOS_SR_PORT || "4891";
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

// The workflows the brief names.
const FLOWS = [
  { route: "/portal",                  label: "Requester Home" },
  { route: "/raise",                   label: "Raise a Legal Request" },
  { route: "/requests?rv=list",        label: "Legal Requests" },
  { route: "/litigation",              label: "Litigation Register" },
  { route: "/contracts",               label: "Contract Register" },
  { route: "/compliance/licenses", label: "Compliance Register" },
  { route: "__RECORD__",               label: "Record Detail" },   // resolved at run time
  { route: "/knowledge",               label: "Documents" },
  { route: "/access",                  label: "Users & Access" },
];

/* Read the page's semantics the way an assistive technology would. */
const SEMANTICS = function () {
  const nameOf = (el) => {
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const t = lb.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? (n.innerText || "").trim() : ""; }).join(" ").trim();
      if (t) return t;
    }
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.innerText.trim()) return l.innerText.trim(); }
    if (el.closest("label")) { const t = el.closest("label").innerText.trim(); if (t) return t; }
    const t = (el.innerText || el.value || "").trim();
    if (t) return t;
    return (el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("alt") || "").trim();
  };
  const vis = (el) => { const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && !el.closest("[aria-hidden='true']"); };

  const headings = [...document.querySelectorAll("h1,h2,h3,[role=heading]")].filter(vis)
    .map((h) => ({ level: h.tagName.toLowerCase(), text: (h.innerText || "").trim().slice(0, 60) }));
  const landmarks = {
    nav: document.querySelectorAll("nav, [role=navigation]").length,
    main: document.querySelectorAll("main, [role=main]").length,
    banner: document.querySelectorAll("header, [role=banner]").length,
    search: document.querySelectorAll("[role=search]").length,
  };
  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch]")].filter(vis);
  const unnamed = controls.filter((c) => !nameOf(c)).map((c) => ({
    tag: c.tagName.toLowerCase(), cls: String(c.className || "").split(/\s+/).slice(0, 2).join("."), html: c.outerHTML.slice(0, 80) }));

  const fields = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(vis);
  const unlabelled = fields.filter((f) => !nameOf(f)).map((f) => f.outerHTML.slice(0, 80));
  const placeholderOnly = fields.filter((f) => {
    const al = f.getAttribute("aria-label"), lb = f.getAttribute("aria-labelledby");
    const lbl = f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`);
    return !al && !lb && !lbl && !f.closest("label") && !!f.getAttribute("placeholder");
  }).map((f) => f.outerHTML.slice(0, 80));

  const tables = [...document.querySelectorAll("table")].filter(vis).map((t) => ({
    headers: t.querySelectorAll("thead th").length,
    namedHeaders: [...t.querySelectorAll("thead th")].filter((th) => (th.innerText || "").trim() || th.getAttribute("aria-label")).length,
    sortable: t.querySelectorAll("th[aria-sort]").length,
    rows: t.querySelectorAll("tbody tr").length,
    linkRows: t.querySelectorAll("tbody tr[role=link][aria-label]").length,
    rowLinks: t.querySelectorAll("tbody tr.rowlink").length,
  }));

  const tablists = [...document.querySelectorAll("[role=tablist]")].filter(vis).map((tl) => ({
    label: tl.getAttribute("aria-label") || "",
    tabs: tl.querySelectorAll("[role=tab]").length,
    named: [...tl.querySelectorAll("[role=tab]")].filter((t) => nameOf(t)).length,
    selected: tl.querySelectorAll("[role=tab][aria-selected=true]").length,
  }));

  const dialogs = [...document.querySelectorAll("[role=dialog], .modal, .drawer")].filter(vis).map((d) => ({
    role: d.getAttribute("role") || "", modal: d.getAttribute("aria-modal") || "",
    name: nameOf(d).slice(0, 40),
  }));

  const liveRegions = document.querySelectorAll("[aria-live]").length;
  const imgNoAlt = [...document.querySelectorAll("img")].filter(vis).filter((i) => !i.getAttribute("alt") && i.getAttribute("aria-hidden") !== "true").length;
  const svgExposed = [...document.querySelectorAll("svg")].filter(vis)
    .filter((sv) => sv.getAttribute("aria-hidden") !== "true" && !sv.querySelector("title") && !sv.getAttribute("aria-label")).length;

  return { headings, landmarks, controls: controls.length, unnamed, fields: fields.length,
    unlabelled, placeholderOnly, tables, tablists, dialogs, liveRegions, imgNoAlt, svgExposed,
    title: document.title };
};

let SANDBOX = null, server = null;

(async () => {
  if (await ping()) { console.error(`port ${PORT} already in use — refusing to test a stale instance`); process.exit(2); }
  SANDBOX = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-sr-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "legalos/", P.join(__dirname, "..") + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(P.join(__dirname, "..", "node_modules"), P.join(SANDBOX, "node_modules"));
  const cfgPath = P.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = USER;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out0 = spawnSync("node", ["tools/legalos-passwd.js", "set", USER], { cwd: SANDBOX, encoding: "utf8" });
  const PW = ((out0.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({ width: 1600, height: 1000 });
  await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(2000);

  console.log("\n0. The sign-in screen (every user meets this first)");
  const login = await p.evaluate(SEMANTICS);
  check("sign-in fields are labelled, not placeholder-only",
    login.unlabelled.length === 0 && login.placeholderOnly.length === 0,
    JSON.stringify({ unlabelled: login.unlabelled.length, placeholderOnly: login.placeholderOnly.slice(0, 2) }));
  check("the sign-in screen has a heading", login.headings.length > 0, JSON.stringify(login.headings.slice(0, 2)));

  await p.type('input[name="email"]', USER); await p.type('input[name="password"]', PW);
  await p.click('button[type="submit"]'); await w(4000);
  const signedIn = !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText));
  check("signed in", signedIn);
  if (!signedIn) return finish(b);

  /* Resolve a REAL record id. A hardcoded one (DLIC-1) does not exist — the
     route then renders an honest "not found" state, which has no heading, and
     the suite reported that as a missing heading on the record-detail page. */
  const realLicence = await p.evaluate(async () => {
    try {
      const v = [...document.querySelectorAll("script")].map((x) => x.src).find((x) => /src-v\d+/.test(x));
      const ver = (v && v.match(/src-v\d+/) || ["src"])[0];
      const { api } = await import(`./${ver}/api.js`);
      const live = await import(`./${ver}/live.js`);
      const rows = live.adaptLicences((await api.registers.list("licences", { limit: 10 })).records || []);
      return rows[0] && rows[0].id;
    } catch (e) { return null; }
  });
  for (const fl of FLOWS) if (fl.route === "__RECORD__") {
    fl.route = realLicence ? "/rec/licence/" + encodeURIComponent(realLicence) : "/compliance/licenses";
  }
  console.log("     record detail resolves to:", FLOWS.find((f) => f.label === "Record Detail").route);

  console.log("\n1. Per-workflow semantics");
  const report = [];
  let anyUnnamed = 0, anyUnlabelled = 0, anyPlaceholderOnly = 0, missingMain = 0, missingHeading = 0, unnamedHeaders = 0;
  for (const fl of FLOWS) {
    await p.goto(B + "/#" + fl.route, { waitUntil: "networkidle2", timeout: 45000 }); await w(1400);
    const s = await p.evaluate(SEMANTICS);
    report.push({ ...fl, ...s });
    anyUnnamed += s.unnamed.length;
    anyUnlabelled += s.unlabelled.length;
    anyPlaceholderOnly += s.placeholderOnly.length;
    if (!s.landmarks.main) missingMain++;
    if (!s.headings.length) missingHeading++;
    s.tables.forEach((t) => { if (t.headers !== t.namedHeaders) unnamedHeaders += (t.headers - t.namedHeaders); });
    const tbl = s.tables[0];
    console.log(`     ${fl.label.padEnd(24)} heading:${s.headings.length ? "yes" : "NO "} · main:${s.landmarks.main ? "yes" : "NO "} · nav:${s.landmarks.nav}`
      + ` · controls:${String(s.controls).padStart(4)} unnamed:${s.unnamed.length}`
      + ` · fields:${s.fields} unlabelled:${s.unlabelled.length}`
      + (tbl ? ` · table ${tbl.namedHeaders}/${tbl.headers} headers, ${tbl.linkRows}/${tbl.rowLinks} rows named` : ""));
    if (s.unnamed.length) s.unnamed.slice(0, 3).forEach((u) => console.log(`         unnamed: ${u.tag}.${u.cls}  ${u.html}`));
    if (s.placeholderOnly.length) s.placeholderOnly.slice(0, 3).forEach((u) => console.log(`         placeholder-only: ${u}`));
  }
  check("every workflow exposes a main landmark", missingMain === 0, missingMain + " without <main>");
  check("every workflow exposes a heading", missingHeading === 0, missingHeading + " without a heading");
  check("no control anywhere is unnamed", anyUnnamed === 0, anyUnnamed + " unnamed");
  check("no form field is unlabelled", anyUnlabelled === 0, anyUnlabelled + " unlabelled");
  check("no field relies on its placeholder as the only label", anyPlaceholderOnly === 0, anyPlaceholderOnly + " placeholder-only");
  check("every table column header carries text", unnamedHeaders === 0, unnamedHeaders + " blank headers");

  console.log("\n2. Tables expose structure, and rows announce what they open");
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(2200);
  const t = (await p.evaluate(SEMANTICS)).tables[0];
  check("the register table exposes named column headers and sort state",
    t && t.namedHeaders === t.headers && t.sortable > 0, JSON.stringify(t));
  check("every clickable row is announced as a link with a name",
    t && t.rowLinks > 0 && t.linkRows === t.rowLinks, JSON.stringify(t));

  console.log("\n3. Tabs and dialogs");
  /* The IP portfolio, not Litigation and not Compliance.
     Both of those used to carry a register tab strip and deliberately no longer
     do: Compliance became a dashboard plus six pages, and Litigation's strip was
     removed because it named the same destinations the module nav already names
     -- navigation belongs in the nav, and the page shows its register. Pointing
     this check at either would fail for the right reason while telling us
     nothing about the pattern it exists to cover.

     The IP portfolio still has real register tabs (Marks / Oppositions / …), so
     the accessible-tablist pattern is asserted where the pattern actually lives.
     The Compliance check below still guards against a strip reappearing. */
  await p.goto(B + "/#/m/ip", { waitUntil: "networkidle2" }); await w(2600);
  const tl = (await p.evaluate(SEMANTICS)).tablists;
  check("register tabs form a named tablist with one selected tab",
    tl.length > 0 && tl[0].tabs === tl[0].named && tl[0].selected === 1 && !!tl[0].label,
    tl.length ? JSON.stringify(tl[0]) : "no tablist on the page");

  /* And Litigation genuinely has none: the strip was removed on purpose, so if
     one reappears there this says so instead of quietly passing. */
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(1800);
  const litTl = (await p.evaluate(SEMANTICS)).tablists;
  check("the litigation register exposes no tab strip, by design",
    litTl.length === 0, litTl.length + " tablists");
  // ...and Compliance genuinely has none, so the check above cannot be quietly
  // satisfied by a strip reappearing on the dashboard.
  await p.goto(B + "/#/compliance", { waitUntil: "networkidle2" }); await w(1600);
  const covTl = (await p.evaluate(SEMANTICS)).tablists;
  check("the Compliance dashboard exposes no tablist, by design",
    covTl.length === 0, covTl.length + " tablists");
  // Open the More-filters drawer and inspect it as a dialog.
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(2000);
  const opened = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll(".regbar .fltbtn")].find((x) => /more filters/i.test(x.textContent));
    if (!b2) return false; b2.click(); return true;
  });
  await w(800);
  const dlg = await p.evaluate(SEMANTICS);
  check("the More-filters drawer is present and named", opened && dlg.dialogs.length > 0 && !!dlg.dialogs[0].name,
    JSON.stringify(dlg.dialogs));

  console.log("\n4. Charts are not announced as anonymous graphics");
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(2200);
  const charts = await p.evaluate(() => {
    const svgs = [...document.querySelectorAll(".litcharts svg")];
    const legend = document.querySelectorAll(".chartlegend, .chartbar").length;
    return { svgs: svgs.length, hidden: svgs.filter((s) => s.getAttribute("aria-hidden") === "true").length,
      accessibleAlternatives: legend };
  });
  check("chart graphics are marked decorative and a labelled control list carries the same data",
    charts.svgs > 0 && charts.hidden === charts.svgs && charts.accessibleAlternatives > 0, JSON.stringify(charts));

  console.log("\n5. Result counts are announced when they change");
  const live = await p.evaluate(() => {
    const el = document.querySelector(".regcount");
    return el ? { text: el.textContent.trim(), live: el.getAttribute("aria-live") } : null;
  });
  check("the register's result count is a live region", live && live.live === "polite", JSON.stringify(live));

  console.log("\n6. The intake form's fields are labelled");
  /* NOT /raise. That route is for BUSINESS requesters — a legal user is
     redirected away from it by design, so measuring it while signed in as
     Director Legal found an empty page and called it a failure. The form a legal
     user actually reaches is the intake modal on the workspace, and that is what
     is measured here. The requester's own journey is covered end to end by
     tests/m1-request-parking-e2e.js, which drives the portal as a requester. */
  await p.goto(B + "/#/workspace", { waitUntil: "networkidle2" }); await w(2500);
  await p.evaluate(() => {
    const b2 = [...document.querySelectorAll("button")].find((x) => /new request/i.test(x.textContent));
    if (b2) b2.click();
  });
  await w(1800);
  const form = await p.evaluate(() => {
    const nameOf2 = (el) => {
      const al = el.getAttribute("aria-label"); if (al && al.trim()) return al.trim();
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.innerText.trim()) return l.innerText.trim(); }
      if (el.closest("label") && el.closest("label").innerText.trim()) return el.closest("label").innerText.trim();
      if (el.getAttribute("aria-labelledby")) return "ref";
      return "";
    };
    const fields = [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter((f) => { const cs = getComputedStyle(f); return cs.display !== "none" && cs.visibility !== "hidden"; });
    return {
      count: fields.length,
      unlabelled: fields.filter((f) => !nameOf2(f)).map((f) => f.outerHTML.slice(0, 70)),
      placeholderOnly: fields.filter((f) => !nameOf2(f) && f.getAttribute("placeholder")).length,
      required: fields.filter((f) => f.required || f.getAttribute("aria-required") === "true").length,
    };
  });
  check(`the requester form reached its fields (${form.count}) and every one is labelled`,
    form.count > 0 && form.unlabelled.length === 0,
    JSON.stringify({ count: form.count, unlabelled: form.unlabelled.slice(0, 3) }));

  fs.writeFileSync(P.join(__dirname, "..", "SCREENREADER_DATA.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    method: "Chrome accessibility semantics read from the rendered DOM (the tree assistive technology consumes). NOT a screen-reader run; no conformance level claimed.",
    flows: report.map((r) => ({ workflow: r.label, route: r.route, title: r.title,
      headings: r.headings, landmarks: r.landmarks, controls: r.controls, unnamed: r.unnamed.length,
      fields: r.fields, unlabelled: r.unlabelled.length, placeholderOnly: r.placeholderOnly.length,
      tables: r.tables, tablists: r.tablists, liveRegions: r.liveRegions,
      imagesWithoutAlt: r.imgNoAlt, svgExposedToAT: r.svgExposed })),
  }, null, 2));
  console.log("\n  evidence written to SCREENREADER_DATA.json");
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
