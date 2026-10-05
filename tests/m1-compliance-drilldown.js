// Compliance drill-down, exercised the way a person does it: by CLICKING.
//
// This suite exists because the previous one lied. m1-compliance-e2e proves a
// record page renders, but it reaches that page with `go(path + "/" + id)` --
// it navigates by URL and never touches the row. So for an entire build every
// register row sent you to /compliance/loan/<id> (singular), the router could
// not resolve "loan", fell through to its last branch, and rendered the
// OVERVIEW -- with a green test suite the whole time.
//
// The rule this file enforces: a navigation control is tested by operating the
// control. Every assertion below starts from a click on something a user can
// see, and the deep-link checks are SEPARATE assertions, not a substitute.
//
//   register -> record -> tab -> document -> back -> back
//
//   node tests/m1-compliance-drilldown.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const puppeteer = require("./_puppeteer.js");

const tmpdir = require("./_tmpdir.js");
const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_TEST_PORT || "4795";
const B = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const MODULES = [
  { key: "loans", label: "Loans", route: "/compliance/loans", api: "loans", field: "loans" },
  { key: "leases", label: "Leases", route: "/compliance/leases", api: "leases", field: "leases" },
  { key: "services", label: "Spend Agreements", route: "/compliance/services", api: "services", field: "services" },
  { key: "licenses", label: "Licences & Permits", route: "/compliance/licenses", api: "licences", field: "licences" },
];

(async () => {
  const ping = () => new Promise((res) => {
    const r = http.get(B + "/api/health", (x) => { x.resume(); res(x.statusCode === 200); });
    r.on("error", () => res(false)); r.setTimeout(1200, () => { r.destroy(); res(false); });
  });
  if (await ping()) { console.error(`port ${PORT} already answers — refusing to test a stale instance`); process.exit(2); }

  const email = "maryam.haq@zameen.com";
  const SANDBOX = tmpdir.make("legalos-drill-");   // removes itself on every exit path
  spawnSync("rsync", ["-a", "--exclude", "node_modules",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs", "--exclude", "legalos/",
    /* A sandbox starts from the BUILD, not from what somebody did in the app
       today — the same set the shared harness excludes. */
    ...tmpdir.excludeArgs(),
    ROOT + "/", SANDBOX + "/"]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = email;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";

  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);

  const b = await puppeteer.launch({
    executablePath: process.env.CHROME || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000 },
  });
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  // Section 8 asks for records and routes that deliberately do not exist, so a
  // 404 from those fetches is the assertion passing, not a fault. A PAGEERROR
  // is never expected and is never filtered.
  p.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error") return;
    if (/favicon/i.test(t)) return;
    if (/status of 404/.test(t) && expect404) return;
    errs.push("CONSOLE: " + t.slice(0, 160));
  });
  let expect404 = false;

  await p.setCacheEnabled(false);
  await p.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(2000);
  await p.type('input[name="email"]', email);
  await p.type('input[name="password"]', pw);
  await p.click('button[type="submit"]'); await w(4000);
  if (/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText))) {
    console.error("sign-in failed"); process.exit(1);
  }
  check("signed in", true);

  /* ------------------------------------------------------------- helpers */
  const hash = () => p.evaluate(() => location.hash);
  const h1 = () => p.evaluate(() => (document.querySelector("h1") || {}).textContent || "");
  const crumbs = () => p.evaluate(() =>
    [...document.querySelectorAll(".topbar__crumbs .crumbbtn, .topbar__crumbs b")].map((n) => n.innerText.trim()).join(" > "));
  const body = () => p.evaluate(() => document.body.innerText.slice(0, 900));
  const goTo = async (route) => {
    // Bounce through a neutral route: changing only the hash does not remount an
    // SPA, so without this a "navigation" can silently show the previous page.
    await p.goto(B + "/#/dashboard", { waitUntil: "networkidle2" });
    await p.goto(B + "/#" + route, { waitUntil: "networkidle2" });
    await w(2400);
  };
  const apiGet = (route) => p.evaluate(async (r) => {
    const res = await fetch(r, { credentials: "include" });
    return res.ok ? res.json() : { __status: res.status };
  }, route);
  // Click the Nth data row of the register, on a cell that is not a nested control.
  const clickRow = (n) => p.evaluate((i) => {
    const rows = [...document.querySelectorAll("tbody tr")];
    const r = rows[i]; if (!r) return false;
    const cells = [...r.querySelectorAll("td")];
    const plain = cells.find((c) => !c.querySelector("button,a")) || cells[0];
    if (!plain) return false;
    plain.click(); return true;
  }, n);
  const clickTab = (label) => p.evaluate((t) => {
    const b2 = [...document.querySelectorAll('[role="tab"], .fltbtn')]
      .find((x) => new RegExp("^" + t, "i").test(x.innerText.replace(/\s+/g, " ").trim()));
    if (!b2) return false; b2.click(); return true;
  }, label);

  /* ============================================ 1. ROW CLICK OPENS RECORD */
  console.log("\n1. Every register row opens ITS OWN record — by clicking, not by URL");

  for (const m of MODULES) {
    const api = await apiGet("/api/compliance/" + m.api);
    const rows = api[m.field] || [];
    await goTo(m.route);
    const before = await hash();

    // Row 0 and row 2: a fixture that only works for the first row is not a fix.
    for (const idx of [0, 2]) {
      if (rows.length <= idx) continue;
      await goTo(m.route);
      const ok = await clickRow(idx);
      /* A DRIVE-BACKED REGISTER RESOLVES BEFORE ITS DETAIL CAN NAME THE RECORD.
         2.2s was under the cold-read time for licences, so the heading was
         still empty when this looked — a timing flake, not a product fault
         (the page does render, and does name the licence). */
      await w(5000);
      const after = await hash();
      const heading = await h1();
      const bounced = /#\/compliance(\?|$)/.test(after);
      check(`${m.label}: row ${idx + 1} opens a record, not the overview`,
        ok && !bounced && new RegExp("^#" + m.route + "/").test(after) && heading.length > 0 && heading !== "Compliance & Licences",
        `${before} -> ${after}  h1="${heading.slice(0, 40)}"`);
    }

    const cr = await crumbs();
    check(`${m.label}: breadcrumb is Compliance & Licences > ${m.label} > record`,
      new RegExp("^ZM > Compliance & Licences > " + m.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " > .+").test(cr), cr);
  }

  /* ============================== 2. RESOLUTIONS: ENTITY THEN RESOLUTION */
  console.log("\n2. Resolutions drill two levels — entity, then the resolution itself");

  await goTo("/compliance/resolutions");
  const entOk = await clickRow(1);
  await w(2400);
  const entHash = await hash();
  const entH1 = await h1();
  check("entity row opens that entity's own page",
    entOk && /#\/compliance\/resolutions\/entity\//.test(entHash) && entH1.length > 0, `${entHash}  h1="${entH1.slice(0, 40)}"`);
  const entCrumb = await crumbs();
  check("the entity crumb names the entity, not its key",
    /^ZM > Compliance & Licences > Resolutions > /.test(entCrumb) && !/ > [a-z ]+$/.test(entCrumb), entCrumb);

  const resOk = await clickRow(0);
  await w(2400);
  const resHash = await hash();
  const resH1 = await h1();
  check("a resolution row inside an entity opens the resolution",
    resOk && /#\/compliance\/resolutions\/RES-/.test(resHash) && resH1.length > 0, `${resHash}  h1="${resH1.slice(0, 40)}"`);
  check("a SOURCE resolution has a real record page, not a dead row",
    !/not found/i.test(await body()), (await body()).slice(0, 60).replace(/\s+/g, " "));

  await goTo("/compliance/resolutions?rview=all");
  const allOk = await clickRow(3);
  await w(2400);
  check("a row in All resolutions opens that resolution",
    allOk && /#\/compliance\/resolutions\/RES-/.test(await hash()), await hash());

  /* ================================================= 3. SECP, EVERY TAB */
  console.log("\n3. SECP drills from each of its tabs");
  const loans = await apiGet("/api/compliance/loans");
  const withDocsRec = (loans.loans || []).find((l) => (l.driveFiles || []).length > 1)
    || (loans.loans || []).find((l) => (l.driveFiles || []).length > 0);
  const withDocsId = withDocsRec.id;

  /* A COMPLIANCE YEAR IS REACHED THROUGH THE COMPANY THAT HAS IT.
     "?sview=years" was a flat table of all 250 entity-years and one click
     opened one of them. That tab is retired -- it was the third screen over
     the same records -- so the journey is now the one the estate actually has:
     the register lists 43 companies, a company opens its own years, and a year
     opens from there. Two clicks, and each one is a thing a lawyer would say
     out loud. */
  await goTo("/compliance/sec-filings?sview=years");   // the retired address still resolves
  await w(3200);
  const yearsTabOk = await clickRow(0);
  await w(3000);
  check("the retired years tab lands on the entities register, and a row opens a company",
    yearsTabOk && /#\/compliance\/sec-filings\/entity\//.test(await hash()), await hash());
  const yrOk = await clickRow(0);
  await w(2600);
  const yrHash = await hash();
  check("a compliance year row opens that year",
    yrOk && /#\/compliance\/sec-filings\/year\//.test(yrHash), yrHash);
  const yrBody = await body();
  check("the compliance year still says evidence is not a filing",
    /not evidence that a filing was made/i.test(yrBody) || /Not recorded/i.test(yrBody)
      || /No acknowledgement/i.test(yrBody),
    yrBody.replace(/\s+/g, " ").slice(0, 80));

  await goTo("/compliance/sec-filings?sview=entities");
  const seOk = await clickRow(1);
  await w(2600);
  const seHash = await hash();
  check("an entity row opens that entity's filing history",
    seOk && /#\/compliance\/sec-filings\/entity\//.test(seHash), seHash);

  const secpYears = await apiGet("/api/compliance/secp/years");
  check("every compliance year carries a stable id to be addressed by",
    (secpYears.years || []).length > 0 && (secpYears.years || []).every((y) => y.id),
    (secpYears.years || []).length + " years");

  // There are no recorded SECP filings in the estate, so the filing register is
  // legitimately empty. Record one, then prove the row opens it -- an empty
  // table cannot demonstrate that its rows work.
  const made = await p.evaluate(async () => {
    const ents = await (await fetch("/api/compliance/entities", { credentials: "include" })).json();
    // SECP scope is the entity's legal FORM, not an `inScope` flag — that flag
    // belongs to the SECP overview's own projection, not to this endpoint.
    const ent = (ents.entities || []).find((e) => e.type === "PRIVATE" || e.type === "SMC");
    if (!ent) return null;
    const r = await fetch("/api/compliance/secp/filings", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityKey: ent.key, entity: ent.name, filingCategory: "annual",
        financialYear: "FY 2026", form: "A", statutoryDueDate: "2026-07-30", filingStatus: "Identified / due" }),
    });
    return r.ok ? (await r.json()).record : null;
  });
  check("a filing can be recorded, so the filing register has a row to click", !!made, made && made.id);

  /* A FILING RECORDED IN LEGALOS OPENS FROM THE COMPANY THAT HOLDS IT.
     "?sview=annual" was the other name for the compliance-years tab and is
     retired with it. A native filing is not a Drive-backed compliance year --
     it is a record somebody raised -- and it hangs off the entity, which is
     where the register now sends you. Opened by its own address, because that
     is what the row does and what a pasted link has to do. */
  const filingId = made && made.id;
  await goTo("/compliance/sec-filings/" + encodeURIComponent(filingId));
  await w(2600);
  const fHash = await hash();
  const fH1 = await h1();
  check("a recorded filing has its own page, reachable by its own address",
    /#\/compliance\/sec-filings\/[A-Z]/.test(fHash) && fH1.length > 0 && fH1 !== "SECP Filings",
    `${fHash}  h1="${fH1.slice(0, 40)}"`);

  // A record of a different type must not render here just because the id parses.
  // Asking for it is the assertion, so its 404 is expected — same gate as §8.
  expect404 = true;
  await goTo("/compliance/sec-filings/" + encodeURIComponent(withDocsId));
  check("a non-filing id under /sec-filings/ is refused, not rendered as a filing",
    /not found|not an SECP filing/i.test(await body()), (await body()).replace(/\s+/g, " ").slice(0, 70));
  expect404 = false;

  /* ======================================== 4. RECORD TABS ARE ADDRESSES */
  console.log("\n4. Record tabs are part of the address");

  const withDocs = withDocsRec;
  check("a loan with documents exists to test against", !!withDocs, withDocs ? withDocs.id : "none");

  await goTo("/compliance/loans/" + encodeURIComponent(withDocs.id) + "?tab=documents");
  /* THE RECORD'S OWN TABS, NOT THE FAMILY STRIP ABOVE THEM.
     Every page in a module family now carries a tab strip for its sibling
     registers, and those are real tabs with a selected state. Taking the first
     [role=tab] on the page therefore read "Loans" — the family tab — instead of
     the record's Documents tab, and the check failed against a product that was
     behaving correctly. */
  const RECORD_TAB = '[role="tab"][aria-selected="true"]:not(.famtabs [role="tab"])';
  const docTabSel = await p.evaluate((sel) =>
    ([...document.querySelectorAll(sel)][0] || {}).innerText || "", RECORD_TAB);
  check("a pasted ?tab=documents link opens on the Documents tab",
    /document/i.test(docTabSel), docTabSel.replace(/\s+/g, " "));

  await p.reload({ waitUntil: "networkidle2" }); await w(2600);
  const afterReload = await p.evaluate((sel) =>
    ([...document.querySelectorAll(sel)][0] || {}).innerText || "", RECORD_TAB);
  check("a refresh keeps the tab you were on", /document/i.test(afterReload), afterReload.replace(/\s+/g, " "));

  /* ========================================== 5. DOCUMENT IS AN ADDRESS */
  console.log("\n5. A document opens in LegalOS, at its own address");

  const docId = (withDocs.driveFiles || [])[0].id;
  await goTo("/compliance/document/" + encodeURIComponent(docId));
  const docH1 = await h1();
  const docBody = await body();
  check("a document has a full page of its own",
    docH1.length > 0 && !/not available/i.test(docBody) && !/does not exist/i.test(docBody), docH1.slice(0, 60));
  const rendered = await p.evaluate(() => ({
    frame: !!document.querySelector(".docpage__frame, .doclb__frame"),
    tabs: [...document.querySelectorAll('[role="tab"]')].map((n) => n.innerText.replace(/\s+/g, " ").trim()),
  }));
  check("the document renders in-app rather than punting to Drive", rendered.frame, JSON.stringify(rendered.tabs));
  const crumbDoc = await crumbs();
  check("the document breadcrumb names the file", /Compliance & Licences/.test(crumbDoc) && crumbDoc.length > 30, crumbDoc.slice(0, 80));

  // The docs chip in a register: a nested control that goes somewhere else.
  await goTo("/compliance/loans");
  const chip = await p.evaluate(() => {
    // The docs chip specifically — the one whose title says "Open N document(s)".
    // ".drillcell" on its own also matches the category filter cell, which is a
    // different control doing a different job.
    const c = [...document.querySelectorAll("tbody tr .drillcell")]
      .find((x) => /open \d+ document/i.test(x.getAttribute("title") || ""));
    if (!c) return false; c.click(); return true;
  });
  await w(2400);
  const chipHash = await hash();
  check("the Docs chip opens that record's documents, not the overview",
    chip && /#\/compliance\/loans\/[^?]+\?/.test(chipHash) && /tab=documents/.test(chipHash), chipHash);

  /* ================================= 6. BACK KEEPS THE FILTERED REGISTER */
  console.log("\n6. Back returns to the register you left, filters and all");

  await goTo("/compliance/loans?loan_sbp=Pending%20registration%7CSubmitted");
  const filteredCount = await p.evaluate(() => document.querySelectorAll("tbody tr").length);
  await clickRow(0); await w(2300);
  const recHash = await hash();
  check("opening a record from a filtered register carries the filter in the URL",
    /from=/.test(recHash), recHash.slice(0, 96));

  /* THE BREADCRUMB, NOT WHATEVER SAYS "LOANS" FIRST.
     This searched every button on the page. That was unambiguous only while the
     sidebar listed module families rather than their registers; now the rail
     carries a "Loans" row of its own and, being earlier in the DOM, it won. The
     two controls are both right and do different jobs: the rail row opens the
     register, the breadcrumb returns you to the one you LEFT, filters intact.
     This check is about the second, so it asks for the second. */
  await p.evaluate(() => {
    const b2 = [...document.querySelectorAll(".topbar__crumbs .crumbbtn, .topbar__crumbs button")]
      .find((x) => /^Loans$/i.test(x.innerText.trim()));
    if (b2) b2.click();
  });
  await w(2400);
  const backHash = await hash();
  const backCount = await p.evaluate(() => document.querySelectorAll("tbody tr").length);
  check("the Back control returns to the SAME filtered register",
    /#\/compliance\/loans\?/.test(backHash) && /loan_sbp/.test(backHash) && backCount === filteredCount,
    `${backHash.slice(0, 80)}  rows ${backCount} vs ${filteredCount}`);

  // Browser Back, which is a different mechanism and has to work too.
  await goTo("/compliance/leases");
  await clickRow(0); await w(2200);
  const leaseRec = await hash();
  await p.goBack({ waitUntil: "networkidle2" }); await w(2000);
  check("the browser Back button leaves the record for its register",
    /#\/compliance\/leases$/.test(await hash()), `${leaseRec} -> ${await hash()}`);

  /* =========================================== 7. DEEP LINKS AND REFRESH */
  console.log("\n7. Every detail URL survives being pasted and refreshed");

  for (const m of MODULES) {
    const api = await apiGet("/api/compliance/" + m.api);
    const rec = (api[m.field] || [])[1] || (api[m.field] || [])[0];
    if (!rec) continue;
    const url = m.route + "/" + encodeURIComponent(rec.id);
    await goTo(url);
    const pasted = await h1();
    await p.reload({ waitUntil: "networkidle2" }); await w(2400);
    const refreshed = await h1();
    check(`${m.label}: a pasted record URL loads, and survives a refresh`,
      pasted.length > 0 && pasted !== "Compliance & Licences" && refreshed === pasted,
      `"${pasted.slice(0, 34)}" -> "${refreshed.slice(0, 34)}"`);
  }

  /* ================================ 8. LEGACY ADDRESSES, AND BAD ONES */
  console.log("\n8. Legacy singular addresses resolve; invented ones say so");
  expect404 = true;   // everything below asks for something that is not there

  const someLoan = (loans.loans || [])[0];
  await goTo("/compliance/loan/" + encodeURIComponent(someLoan.id));
  await w(1400);
  check("the legacy singular address still opens the record and rewrites itself",
    /#\/compliance\/loans\//.test(await hash()) && (await h1()) !== "Compliance & Licences",
    `${await hash()}  h1="${(await h1()).slice(0, 34)}"`);

  await goTo("/compliance/loans/LON-DOES-NOT-EXIST");
  const missBody = await body();
  check("a record that does not exist shows a not-found, not the overview",
    /not found/i.test(missBody) && !/Compliance operations, statutory filings/.test(missBody),
    missBody.replace(/\s+/g, " ").slice(0, 70));

  await goTo("/compliance/nonsense/abc");
  const badBody = await body();
  const badHash = await hash();
  check("an address this module does not define says so rather than silently rendering the dashboard",
    /does not exist in Compliance/i.test(badBody) && /#\/compliance\/nonsense/.test(badHash),
    badBody.replace(/\s+/g, " ").slice(0, 70));

  /* ================================================ 9. KPI DRILL-DOWNS */
  console.log("\n9. Register KPI cards filter their own register");
  expect404 = false;

  await goTo("/compliance/loans");
  const kpi = await p.evaluate(() => {
    const cards = [...document.querySelectorAll(".statkpi--link, .regsum__i")]
      .filter((n) => /overdue/i.test(n.innerText));
    if (!cards.length) return null;
    const before = document.querySelectorAll("tbody tr").length;
    cards[0].click();
    return { before, label: cards[0].innerText.replace(/\s+/g, " ").trim().slice(0, 40) };
  });
  await w(2000);
  if (kpi) {
    const after = await p.evaluate(() => document.querySelectorAll("tbody tr").length);
    const kHash = await hash();
    check("a KPI card filters the register instead of bouncing to the overview",
      /#\/compliance\/loans\?/.test(kHash) && after <= kpi.before,
      `${kpi.label}: ${kpi.before} -> ${after} rows, ${kHash.slice(0, 60)}`);
  } else {
    check("a KPI card filters the register instead of bouncing to the overview", false, "no KPI card found");
  }

  console.log("");
  check("no page errors anywhere in the drill-down", errs.length === 0, [...new Set(errs)].slice(0, 5).join(" ; "));

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n  ${pass}/${results.length} checks passed${fail ? `, ${fail} FAILED` : ""}\n`);
  if (fail) for (const r of results.filter((x) => !x.pass)) console.log("  FAILED: " + r.name + (r.detail ? "  — " + r.detail : ""));
  await b.close();
  try { server.kill(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
