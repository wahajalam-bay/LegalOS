// Filter-option authorization — a dropdown is a disclosure surface.
//
// A register that correctly refuses 403 can still leak through its FILTERS. If
// the option list, the facet counts, the autocomplete or the export are built
// from the global dataset and narrowed in the browser, then a Compliance-only
// user learns litigation counsel, case types, courts and entity names without
// ever seeing a row. This suite asserts the opposite: every option value, and
// every count beside it, comes from the SAME authorized rows the table shows.
//
// Method: for each persona, read the authorized universe straight from the API
// (which is the permission boundary), then open the real UI and compare every
// offered option against it. Anything the UI offers that the API would not
// return is a leak.
//
//   node tests/m1-filter-security.js
const puppeteer = require("./_puppeteer.js");
const { reap, freePortSync } = require("./_reap.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), P = require("path"), http = require("http");

const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const PORT = process.env.LEGALOS_FSEC_PORT || "4921";
let B = `http://127.0.0.1:${PORT}`;
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

// Real roster identities and their real module access.
const PERSONAS = [
  { key: "admin",      email: "maryam.haq@zameen.com",       groups: { commercial: "full", compliance: "full", litigation: "full" } },
  { key: "commercial", email: "ahmed.sardar@zameen.com",     groups: { commercial: "edit", compliance: "none", litigation: "none" } },
  { key: "compliance", email: "sana.hurmat@zameen.com",      groups: { commercial: "none", compliance: "edit", litigation: "none" } },
  { key: "litigation", email: "salman.khan@zameen.com",      groups: { commercial: "none", compliance: "none", litigation: "edit" } },
  { key: "viewonly",   email: "ali.raza@zameen.com",         groups: { commercial: "view", compliance: "none", litigation: "none" } },
];
const FAMILY_GROUP = {
  contracts: "commercial", properties: "commercial",
  litigation: "litigation", notices: "litigation",
  licences: "compliance", loans: "compliance", resolutions: "compliance",
};
// Each register surface: route, URL namespace, and the family it reads.
const SURFACES = [
  { route: "/contracts",                              ns: "ct",     family: "contracts",   label: "Contracts" },
  { route: "/litigation",                             ns: "cases",  family: "litigation",  label: "Litigation · Cases" },
  { route: "/m/notices",                ns: "notices", family: "notices",    label: "Litigation · Legal Notices" },
  { route: "/compliance/licenses",               ns: "lic",    family: "licences",    label: "Compliance · Licences",           compliance: "licences" },
  { route: "/compliance/loans",                  ns: "loan",   family: "loans",       label: "Compliance · Loans",              compliance: "loans" },
  { route: "/compliance/leases",                 ns: "lease",  family: "contracts",   label: "Compliance · Lease Agreements",   compliance: "leases" },
  { route: "/compliance/services",               ns: "svc",    family: "contracts",   label: "Compliance · Service Agreements", compliance: "services" },
  // The Resolutions register renders BOTH the Drive-sourced register and the
  // resolutions created in LegalOS, so its authorized set is the union of the
  // two — and its Entity options are derived from the source rows' Drive folder.
  { route: "/compliance/resolutions?rview=all",  ns: "res",    family: "resolutions", label: "Compliance · Resolutions",        compliance: "resolutions", unionWithFamily: true },
  { route: "/projects",                               ns: "prop",   family: "properties",  label: "Project Properties" },
];

const req = (method, route, { cookie } = {}) => new Promise((resolve) => {
  const r = http.request(B + route, { method, headers: cookie ? { Cookie: "legalos_sess=" + cookie } : {} }, (res) => {
    const chunks = [];
    res.on("data", (d) => chunks.push(d));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {}
      resolve({ status: res.statusCode, body: j });
    });
  });
  r.on("error", () => resolve({ status: 0, body: null }));
  r.end();
});

const loginAs = (SANDBOX, email) => {
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1];
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ email, password: pw }));
    const rq = http.request(B + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); const m = (res.headers["set-cookie"] || []).join(";").match(/legalos_sess=([^;]+)/); resolve({ cookie: m ? m[1] : null, pw }); });
    rq.on("error", () => resolve({ cookie: null, pw })); rq.write(data); rq.end();
  });
};

/* Option labels this codebase DEFINES (date presets, money and count buckets,
   expiry and validity buckets, the blank-value label). They are computed, never
   read from a record, so they are not disclosure. Enumerated deliberately: a
   regex here would eventually let a real value through. */
const DERIVED_LABELS = new Set([
  // filters.js — date presets
  "Today", "Tomorrow", "This week", "Next 7 days", "Next 30 days", "Next 90 days", "Overdue", "No date",
  "Last 7 days", "This month", "This quarter", "This year",
  /* registerdefs.js — the record-completeness labels. The ingest pipeline's own
     codes (INCOMPLETE_SOURCE and the rest) are pipeline vocabulary and were
     being shown verbatim in a filter called "Source quality" on six
     operational registers; these are the words that replaced them. They are
     defined in this codebase, not read out of a record, so they disclose
     nothing. */
  "Complete", "Missing information", "Sources disagree", "Identity uncertain", "Needs information",
  // filters.js — money buckets
  "Not quantified", "No exposure (0)", "< PKR 1M", "PKR 1M – 10M", "PKR 10M – 100M", "PKR 100M+",
  // filters.js — document-count buckets
  "Has documents", "No documents", "1+", "5+", "10+", "25+",
  // filters.js — the blank bucket
  "Not recorded",
  // registerdefs.js — contract / licence expiry buckets
  "Expired", "Expiring ≤ 30 days", "Expiring ≤ 90 days", "Expiring within a year",
  "Runs beyond a year", "No expiry recorded",
  "Expires ≤ 30 days", "Expires ≤ 60 days", "Expires ≤ 90 days", "Valid beyond 90 days",
  // registerdefs.js — licence validity
  "Valid", "Expiring soon", "Critical (≤ 30 days)",
  // registerdefs.js — notices reply, repository buckets, matters queue
  "Replied", "No reply recorded",
  "Linked to a tracker row", "Standalone", "Mapped", "Not mapped",
  "Has a Drive link", "No Drive link", "90%+", "85–89%", "Below 85%",
  "Has a parcel reference", "No parcel reference",
  "Needs action", "Overdue vs target", "Due soon", "Awaiting external", "On hold", "Recently completed",
  "0-7 days", "8-30 days", "31-60 days", "61-90 days", "90+ days",
  // compliancedefs.js — vocabulary the rebuilt Compliance registers define.
  // Every one is a label this codebase computes, never a value read out of a
  // record; the record values themselves are checked against the authorized
  // rows exactly as before.
  "International", "Intercompany / Group",
  "Tracker", "Drive only (no tracker row)", "Created in LegalOS", "Historical (Drive tracker)",
  "None", "In progress", "Completed",
  "Annual", "Event-based", "Annual period",
  "No signatories", "No signature required", "Partially signed", "Fully signed",
  "Not filed", "Pending upload", "Filed", "Upload failed",
  // config/compliance-rules.json — configured resolution vocabulary. Historical
  // rows carry no type of their own, so the register labels them with the type
  // their source sheet represents; it is an app-assigned label, not record data.
  "Board Resolution", "Partners Resolution", "Normal", "Urgent",
]);

let SANDBOX = null, server = null;

(async () => {
  SANDBOX = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-fsec-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/views.json", "--exclude", "legalos/", P.join(__dirname, "..") + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(P.join(__dirname, "..", "node_modules"), P.join(SANDBOX, "node_modules"));
  const cfgPath = P.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  // The dev bypass is OFF: a real session cookie is the identity, so each
  // persona is exercised exactly as production would see them.
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server);   // stopped on every exit path, including a kill
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  for (const p2 of PERSONAS) { const r = await loginAs(SANDBOX, p2.email); p2.cookie = r.cookie; p2.pw = r.pw; }
  check("a real session for every persona", PERSONAS.every((p2) => !!p2.cookie));

  /* ================================================================== 1 === */
  console.log("\n1. The register API is the boundary the options are built from");
  const universe = {};          // persona -> family -> rows (what the API will give them)
  const complianceUniverse = {};// persona -> compliance register -> derived rows

  /* The rows a persona may see on a surface. A Compliance register's boundary is
     the compliance API, not the raw ingest register — they legitimately differ
     (one licence is evidenced only by its Drive folder). Where a register renders
     both sets, the authorized universe is their union. */
  const authorizedFor = (persona, surface) => {
    const fam = surface.family ? universe[persona.key][surface.family] : null;
    if (!surface.compliance) return fam;
    const comp = complianceUniverse[persona.key][surface.compliance];
    if (!surface.unionWithFamily) return comp;
    if (comp === null || fam === null) return null;
    return fam.concat(comp);
  };
  for (const p2 of PERSONAS) {
    universe[p2.key] = {};
    for (const fam of Object.keys(FAMILY_GROUP)) {
      const r = await req("GET", `/api/registers/${fam}?limit=20000`, { cookie: p2.cookie });
      universe[p2.key][fam] = r.status === 200 ? (r.body.records || []) : null;   // null = refused
    }
    // The rebuilt Compliance registers read DERIVED rows from /api/compliance/*,
    // which is THEIR permission boundary. Fetch each persona's authorized set
    // from that API so row counts, options and exports are all judged against
    // the same rows the register is actually built from.
    complianceUniverse[p2.key] = {};
    for (const [key, field] of [["loans", "loans"], ["leases", "leases"], ["services", "services"],
      ["licences", "licences"], ["resolutions", "native"]]) {
      const r = await req("GET", `/api/compliance/${key}`, { cookie: p2.cookie });
      complianceUniverse[p2.key][key] = r.status === 200 ? (r.body[field] || []) : null;
    }
    const allowed = Object.entries(universe[p2.key]).filter(([, v]) => v !== null).map(([k]) => k);
    const expected = Object.entries(FAMILY_GROUP).filter(([, g]) => (p2.groups[g] || "none") !== "none").map(([k]) => k);
    check(`${p2.key}: API grants exactly the permitted families (${allowed.join(", ") || "none"})`,
      allowed.sort().join(",") === expected.sort().join(","),
      `got ${allowed.sort().join(",")} want ${expected.sort().join(",")}`);
  }

  /* ================================================================== 2 === */
  console.log("\n2. No server route hands out a filter-option universe");
  // Options are derived in the client from rows the server already scoped. Prove
  // there is no separate, ungated "give me all the values" endpoint.
  const probes = ["/api/registers/options", "/api/filters", "/api/registers/facets",
    "/api/registers/litigation/options", "/api/registers/values", "/api/suggest", "/api/autocomplete"];
  const openProbes = [];
  for (const path of probes) {
    const r = await req("GET", path, { cookie: PERSONAS.find((x) => x.key === "compliance").cookie });
    if (r.status === 200) openProbes.push(path + " -> 200");
  }
  check("no ungated filter-option / facet / autocomplete endpoint exists", openProbes.length === 0, openProbes.join(" | "));

  /* ================================================================== 3 === */
  console.log("\n3. Every option a restricted user is offered exists in their own rows");
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  let totalOptions = 0, leaks = [];
  const pageErrors = [];

  for (const p2 of PERSONAS) {
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    page.on("pageerror", (e) => pageErrors.push(p2.key + ": " + String(e.message).slice(0, 120)));
    await page.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(1800);
    await page.type('input[name="email"]', p2.email);
    await page.type('input[name="password"]', p2.pw);
    await page.click('button[type="submit"]'); await w(3500);

    for (const s of SURFACES) {
      const allowed = authorizedFor(p2, s);
      await page.goto(B + "/#" + s.route, { waitUntil: "networkidle2", timeout: 45000 });
      await w(1600);

      /* Collect every option in every DATA filter, with its facet count.
         The Columns, Views and Export menus live in the same toolbar but list
         column names, saved-view names and export scopes — structure, not
         records — so they are collected separately and checked separately. */
      const offered = await page.evaluate(async () => {
        const out = [];
        const btns = [...document.querySelectorAll(".regbar .fltwrap > .fltbtn")]
          .filter((b2) => !/^(columns|views|export)\b/i.test(b2.textContent.trim()));
        for (const btn of btns) {
          btn.click();
          await new Promise((r) => setTimeout(r, 260));
          const panel = document.querySelector(".fltpanel");
          if (panel) {
            const label = btn.textContent.trim();
            for (const row of panel.querySelectorAll(".fltopt")) {
              const l = row.querySelector(".fltopt__l"), c = row.querySelector(".fltopt__c");
              out.push({ filter: label, value: (l && l.textContent.trim()) || "",
                count: c ? parseInt(c.textContent.replace(/,/g, ""), 10) : null });
            }
          }
          btn.click();
          await new Promise((r) => setTimeout(r, 120));
        }
        return out;
      });

      if (allowed === null) {
        // Refused family: the register must offer NOTHING, not a narrowed list.
        if (offered.length > 0) {
          leaks.push(`${p2.key} @ ${s.label}: ${offered.length} options offered for a register they cannot read` +
            ` (e.g. ${offered.slice(0, 3).map((o) => o.filter + "=" + o.value).join(", ")})`);
        }
        totalOptions += offered.length;
        continue;
      }

      /* Permitted family: every offered value must be present in THEIR rows —
         as the APP sees them. The adapters compute display values from the raw
         columns (a contract's status is normalised to Active/Expired/Unknown,
         its category is derived from source and type), so comparing against the
         raw API payload flags computed labels as if they were leaked data.
         Build the haystack with the same adapter the page uses. */
      /* Every offered value must be present in THEIR rows — as the APP sees
         them. For a Compliance surface the rows already came from the
         compliance API above, so the haystack is built here in Node rather than
         re-fetched in the page (which would 403 for a persona that cannot read
         that module, and crash the sweep). Nested derived values are walked:
         a loan carries sbp:{label}, current:{repaymentDue}, balance:{...}. */
      let hay;
      if (s.compliance) {
        const out = new Set();
        const walk = (val, depth) => {
          if (val == null || depth > 3) return;
          if (typeof val === "string" || typeof val === "number") { out.add(String(val).trim()); return; }
          if (Array.isArray(val)) { for (const x of val) walk(x, depth + 1); return; }
          if (typeof val === "object") for (const x of Object.values(val)) walk(x, depth + 1);
        };
        for (const row of allowed) walk(row, 0);
        // Entity names on the Resolutions register are DERIVED from each source
        // row's Drive folder by the client adapter, so they must be gathered the
        // same way the page gathers them.
        if (s.unionWithFamily) {
          const extra = await page.evaluate(async (fam) => {
            const v = [...document.querySelectorAll("script")].map((x) => x.src).find((x) => /src-v\d+/.test(x));
            const ver = (v && v.match(/src-v\d+/) || ["src"])[0];
            const { api } = await import(`./${ver}/api.js`);
            const live = await import(`./${ver}/live.js`);
            const FN = { resolutions: "adaptResolutions", contracts: "adaptContracts", licences: "adaptLicences" };
            const recs = (await api.registers.list(fam, { limit: 20000 })).records || [];
            const o = new Set();
            for (const r of live[FN[fam]](recs)) for (const val of Object.values(r)) {
              if (typeof val === "string" || typeof val === "number") o.add(String(val).trim());
            }
            return [...o];
          }, s.family);
          for (const x of extra) out.add(x);
        }
        hay = out;
      } else {
        hay = new Set(await page.evaluate(async (fam) => {
          const v = [...document.querySelectorAll("script")].map((x) => x.src).find((x) => /src-v\d+/.test(x));
          const ver = (v && v.match(/src-v\d+/) || ["src"])[0];
          const { api } = await import(`./${ver}/api.js`);
          const live = await import(`./${ver}/live.js`);
          const FN = { contracts: "adaptContracts", litigation: "adaptLitigation", notices: "adaptNotices",
            licences: "adaptLicences", loans: "adaptLoans", resolutions: "adaptResolutions", properties: "adaptProperties" };
          const recs = (await api.registers.list(fam, { limit: 20000 })).records || [];
          const rows = live[FN[fam]](recs);
          const out = new Set();
          for (const r of rows) for (const val of Object.values(r)) {
            if (val == null) continue;
            if (typeof val === "string" || typeof val === "number") out.add(String(val).trim());
            else if (Array.isArray(val)) for (const x of val) if (typeof x === "string") out.add(x.trim());
          }
          return [...out];
        }, s.family));
      }
      for (const o of offered) {
        totalOptions++;
        const v = o.value;
        if (!v) continue;
        // A bucket / preset LABEL is a vocabulary this codebase defines, not a
        // value read out of a record, so it cannot disclose anything. Listed
        // explicitly rather than pattern-matched, so a real value can never be
        // waved through by a loose regex.
        if (DERIVED_LABELS.has(v)) continue;
        if (!hay.has(v)) leaks.push(`${p2.key} @ ${s.label} · ${o.filter}: "${v}" is not in any row they can read`);
      }
    }
    await page.close();
  }
  check(`${totalOptions} data-filter options across ${PERSONAS.length} personas × ${SURFACES.length} registers, 0 unauthorized`,
    leaks.length === 0, leaks.slice(0, 5).join(" | "));

  /* ================================================================== 4 === */
  console.log("\n4. Facet counts are computed from authorized rows only");
  const countLeaks = [];
  for (const p2 of PERSONAS.filter((x) => x.key !== "admin")) {
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(1600);
    await page.type('input[name="email"]', p2.email);
    await page.type('input[name="password"]', p2.pw);
    await page.click('button[type="submit"]'); await w(3500);
    for (const s of SURFACES) {
      const allowed = authorizedFor(p2, s);
      if (allowed === null) continue;
      await page.goto(B + "/#" + s.route, { waitUntil: "networkidle2" }); await w(1500);
      const info = await page.evaluate(async () => {
        const el = document.querySelector(".regcount");
        const total = el ? parseInt(el.textContent.replace(/,/g, "").match(/(\d+)(?!.*\d)/)[1], 10) : null;
        const btn = document.querySelector(".regbar .fltwrap > .fltbtn");
        let sum = null, label = "";
        if (btn) {
          label = btn.textContent.trim();
          btn.click(); await new Promise((r) => setTimeout(r, 300));
          const panel = document.querySelector(".fltpanel");
          if (panel) sum = [...panel.querySelectorAll(".fltopt__c")]
            .map((c) => parseInt(c.textContent.replace(/,/g, ""), 10)).filter(isFinite)
            .reduce((a, x) => a + x, 0);
          btn.click();
        }
        return { total, sum, label };
      });
      // A single-valued filter partitions the register: its counts must sum to
      // exactly the number of rows this user can see — no more.
      if (info.total != null && info.sum != null && info.sum > allowed.length) {
        countLeaks.push(`${p2.key} @ ${s.label} · ${info.label}: facets sum ${info.sum} > ${allowed.length} authorized rows`);
      }
    }
    await page.close();
  }
  check("no facet count exceeds the caller's authorized row count", countLeaks.length === 0, countLeaks.slice(0, 4).join(" | "));

  /* ================================================================== 5 === */
  console.log("\n5. Autocomplete / search suggestions");
  const TERMS = ["Zam", "ABC", "vs", "High", "a", "Ltd"];
  const acLeaks = [];
  {
    const compl = PERSONAS.find((x) => x.key === "compliance");
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(1600);
    await page.type('input[name="email"]', compl.email);
    await page.type('input[name="password"]', compl.pw);
    await page.click('button[type="submit"]'); await w(3500);
    // The litigation rows this user must never learn anything about.
    const litAdmin = universe.admin.litigation || [];
    const litOnly = new Set();
    for (const rec of litAdmin) for (const v of Object.values(rec)) {
      if (typeof v === "string" && v.trim().length > 3) litOnly.add(v.trim());
    }
    for (const rec of (universe.compliance.licences || []).concat(universe.compliance.loans || [], universe.compliance.resolutions || [])) {
      for (const v of Object.values(rec)) if (typeof v === "string") litOnly.delete(v.trim());
    }
    await page.goto(B + "/#/compliance/licenses", { waitUntil: "networkidle2" }); await w(1600);
    for (const t of TERMS) {
      const hits = await page.evaluate(async (term) => {
        const inp = document.querySelector(".regbar__input");
        if (!inp) return [];
        const setter = Object.getOwnPropertyDescriptor(inp.constructor.prototype, "value").set;
        setter.call(inp, term);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 700));
        return [...document.querySelectorAll(".table tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim().slice(0, 120));
      }, t);
      for (const h of hits) for (const secret of litOnly) {
        if (secret.length > 6 && h.includes(secret)) { acLeaks.push(`"${t}" surfaced litigation value "${secret.slice(0, 40)}"`); break; }
      }
    }
    await page.close();
  }
  check(`${TERMS.length} partial-term searches by a compliance-only user surfaced 0 litigation values`,
    acLeaks.length === 0, acLeaks.slice(0, 3).join(" | "));

  /* ================================================================== 6 === */
  console.log("\n6. A crafted URL filter is UI state, not authorization");
  {
    const compl = PERSONAS.find((x) => x.key === "compliance");
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(1600);
    await page.type('input[name="email"]', compl.email);
    await page.type('input[name="password"]', compl.pw);
    await page.click('button[type="submit"]'); await w(3500);
    const crafted = [
      "/litigation?cases_lifecycle=Active",
      "/litigation?cases_risk=high&cases_entity=Zameen%20Media",
      "/m/notices?notices_status=Pending",
      "/contracts?ct_status=Active&ct_entity=Zameen",
    ];
    const shown = [];
    for (const u of crafted) {
      await page.goto(B + "/#" + u, { waitUntil: "networkidle2" }); await w(1600);
      const rows = await page.evaluate(() => document.querySelectorAll(".table tbody tr").length);
      if (rows > 0) shown.push(u + " -> " + rows + " rows");
    }
    check("crafted filter URLs on unauthorized registers return no rows", shown.length === 0, shown.join(" | "));

    // And the API behind them still refuses.
    const direct = await req("GET", "/api/registers/litigation?limit=10&risk=high", { cookie: compl.cookie });
    check("the register API behind a crafted URL still answers 403", direct.status === 403, "status=" + direct.status);
    await page.close();
  }

  /* ================================================================== 7 === */
  console.log("\n7. Saved views carry criteria, never authority");
  {
    const compl = PERSONAS.find((x) => x.key === "compliance");
    const mk = await new Promise((resolve) => {
      const data = Buffer.from(JSON.stringify({ register: "cases", name: "Litigation I may not read", filters: { risk: ["high"] } }));
      const rq = http.request(B + "/api/views", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length, Cookie: "legalos_sess=" + compl.cookie } },
        (res) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => { let j = null; try { j = JSON.parse(Buffer.concat(c).toString()); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
      rq.on("error", () => resolve({ status: 0 })); rq.write(data); rq.end();
    });
    check("a restricted user may save criteria for a register they cannot read", mk.status === 201, "status=" + mk.status);
    const stillDenied = await req("GET", "/api/registers/litigation?limit=10", { cookie: compl.cookie });
    check("opening it restores no access — the register still answers 403", stillDenied.status === 403, "status=" + stillDenied.status);
  }

  /* ================================================================== 8 === */
  console.log("\n8. Export cannot widen scope");
  {
    const compl = PERSONAS.find((x) => x.key === "compliance");
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    // Capture what the export actually writes, without downloading a file.
    await page.evaluateOnNewDocument(() => {
      window.__csv = null;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (blob) { try { blob.text().then((t) => { window.__csv = t; }); } catch (e) {} return orig.apply(this, arguments); };
    });
    await page.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(1600);
    await page.type('input[name="email"]', compl.email);
    await page.type('input[name="password"]', compl.pw);
    await page.click('button[type="submit"]'); await w(3500);
    await page.goto(B + "/#/compliance/licenses", { waitUntil: "networkidle2" }); await w(1800);
    const csv = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll(".regbar .fltbtn")].find((x) => /export/i.test(x.textContent));
      if (!btn) return null;
      btn.click();
      await new Promise((r) => setTimeout(r, 500));
      const item = document.querySelector(".fltpanel .fltview");
      if (item) item.click();
      await new Promise((r) => setTimeout(r, 900));
      return window.__csv;
    });
    const lines = csv ? csv.trim().split("\n").length - 1 : 0;
    // The licence REGISTER is the boundary for what the licence export may
    // contain, and it is the compliance API — not the raw ingest register. The
    // two legitimately differ: one licence (Deevar's PEC) is evidenced only by
    // its Drive folder and has no row in the summary workbook, so the register
    // holds 8 where the workbook holds 7. Judging the export against the
    // workbook would report that real, authorized record as a leak.
    const authorized = (complianceUniverse.compliance.licences || []).length;
    check(`export wrote ${lines} rows, never more than the ${authorized} the user may read`,
      csv != null && lines <= authorized, `lines=${lines} authorized=${authorized}`);
    // And nothing from a register they cannot read.
    const litNames = new Set((universe.admin.litigation || []).map((r) => r.caseName).filter((x) => x && x.length > 8));
    const bled = csv ? [...litNames].filter((n) => csv.includes(n)) : [];
    check("the exported file contains no value from an unauthorized register", bled.length === 0, bled.slice(0, 2).join(" | "));
    await page.close();
  }

  /* ================================================================== 9 === */
  console.log("\n9. Cross-module isolation on a shared surface");
  {
    // /workspace and /reports read several datasets at once — the place where a
    // shared surface is most likely to mix authorized and unauthorized rows.
    const compl = PERSONAS.find((x) => x.key === "compliance");
    const page = await b.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(B + "/#/login", { waitUntil: "networkidle2" }); await w(1600);
    await page.type('input[name="email"]', compl.email);
    await page.type('input[name="password"]', compl.pw);
    await page.click('button[type="submit"]'); await w(3500);
    const litNames = (universe.admin.litigation || []).map((r) => r.caseName).filter((x) => x && x.length > 10);
    const found = [];
    for (const route of ["/workspace", "/reports", "/exec", "/tracker"]) {
      await page.goto(B + "/#" + route, { waitUntil: "networkidle2" }); await w(1800);
      const text = await page.evaluate(() => document.body.innerText);
      for (const n of litNames) if (text.includes(n)) { found.push(route + " shows \"" + n.slice(0, 40) + "\""); break; }
    }
    check("shared surfaces show no litigation record to a compliance-only user", found.length === 0, found.join(" | "));
    await page.close();
  }

  check("no page errors while exercising every persona", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  try { await b.close(); } catch (e) {}
  try { server.kill("SIGKILL"); } catch (e) {}
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n  ${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(async (e) => {
  console.error("SUITE ERROR", e);
  try { server && server.kill("SIGKILL"); } catch (x) {}
  try { SANDBOX && fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
});
