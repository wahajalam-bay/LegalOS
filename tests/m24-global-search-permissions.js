// THE CLIENT MUST NOT ASK FOR A MODULE IT CANNOT READ.
//
// WHAT THIS IS HOLDING IN PLACE
//
//   A Compliance-only account issued a cross-module request for the Commercial
//   contracts register on every page. The server refused it, correctly, with a
//   403 -- and then the boot path retried it four times with backoff, so the
//   console carried an error for a register that account can never read.
//
//   The server was right. The CALLER was wrong. The fix is not to widen
//   permissions, not to silence the 403, and not to build a second security
//   model in React: it is to consult the permission engine the nav and the
//   direct-URL refusal already use, and skip the request.
//
//   The subtle part was WHERE. Firing at module load ran on the LOGIN SCREEN,
//   before anyone was signed in, so the default identity passed the check and
//   the module latched its "already hydrated" flag. The entitlement is not
//   knowable until a real identity exists, so the fetch is driven from inside
//   the app, keyed on the signed-in user.
//
//   The server-side refusal is untouched and still tested here: frontend
//   hygiene is not the security boundary.
//
//   node tests/m24-global-search-permissions.js
const H = require("./_harness.js");

/* Registers that belong to a module, and the permission group each needs. */
const CROSS_MODULE = /\/api\/registers\/(contracts|litigation|properties|notices)\b/;

async function watch(page) {
  const seen = { requests: [], failures: [], console: [] };
  page.on("request", (r) => {
    const u = r.url();
    if (CROSS_MODULE.test(u)) seen.requests.push(u.split("/api/")[1].split("?")[0]);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) seen.failures.push(r.status() + " " + (r.url().split("/api/")[1] || r.url()).split("?")[0]);
  });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) seen.console.push(m.text().slice(0, 120)); });
  return seen;
}

H.runSuite("m24-global-search-permissions — no unauthorized cross-module request", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_GSP_PORT", portFallback: "4893", prefix: "legalos-gsp-",
  }));
  const browser = await H.openBrowser();

  try {
    /* ---- 1. a Compliance-only account asks for nothing it cannot read ----- */
    {
      const p = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
      const seen = await watch(p);
      for (const route of ["/compliance", "/compliance/loans", "/compliance/sec-filings", "/mytasks"]) {
        await H.goHash(p, route);
        await H.sleep(2200);
      }
      check("a Compliance-only account makes NO cross-module register request",
        seen.requests.length === 0,
        seen.requests.length ? [...new Set(seen.requests)].join(", ") : "none");
      check("a Compliance-only account collects no failing request",
        seen.failures.length === 0,
        seen.failures.length ? [...new Set(seen.failures)].join(" ; ") : "none");
      check("an expected restriction produces no console error",
        seen.console.length === 0,
        seen.console.length ? seen.console.slice(0, 2).join(" ;; ") : "none");

      /* results must not name a module the account cannot open */
      const txt = await p.evaluate(() => document.body.innerText);
      check("no Commercial or Litigation register content reaches the page",
        !/Contract Tracker|contract book/i.test(txt),
        "checked the rendered page for cross-module register content");

        /* Every screen that pulls a register, not only the search palette.
         Reports, Copilot, Companies and Graph are reachable on Insight or
         Shared access alone, and each pulled the Commercial and Litigation
         registers -- four 403s and four console errors on pages this account
         is entitled to be on. */
      for (const route of ["/reports", "/copilot", "/companies", "/graph", "/contracts", "/litigation", "/tracker", "/projects"]) {
        await H.goHash(p, route);
        await H.sleep(1600);
      }
      check("no page pulls a register from a module this account cannot open",
        seen.requests.length === 0,
        seen.requests.length ? [...new Set(seen.requests)].join(", ") : "none across every register-backed screen");
      check("no page produces a failing request for this account",
        seen.failures.length === 0,
        seen.failures.length ? [...new Set(seen.failures)].join(" ; ") : "none");

    /* ---- 2. the server is still the boundary --------------------------- */
      const cookie = await H.loginApi(sb, H.USERS.complLead.email);
      const direct = await H.request(sb.base, "GET", "/api/registers/contracts?limit=5", { cookie });
      check("the server still refuses the register directly, whatever the client does",
        direct.status === 403,
        "HTTP " + direct.status + " — frontend hygiene is not the security boundary");
      try { await p.close(); } catch (e) { /* the verdict matters, not teardown */ }
    }

    /* ---- 3. an entitled account still gets its own module ---------------- */
    {
      const p = await H.asUser(browser, sb, H.USERS.commLead.email, ctx);
      const seen = await watch(p);
      await H.goHash(p, "/contracts");
      await H.sleep(4000);
      const counts = { "/contracts": await p.evaluate(() => document.querySelectorAll("table tbody tr").length) };
      for (const route of ["/litigation", "/companies"]) {
        await H.goHash(p, route); await H.sleep(2400);
        counts[route] = await p.evaluate(() => document.querySelectorAll("table tbody tr").length);
      }
      check("an entitled account still reads every register it is entitled to",
        counts["/contracts"] > 0 && counts["/litigation"] > 0 && seen.failures.length === 0,
        JSON.stringify(counts) + "; registers fetched: " + [...new Set(seen.requests)].join(",")
          + "; failures: " + ([...new Set(seen.failures)].join(" ; ") || "none"));
      check("gating the caller did not break the module it gates",
        seen.console.length === 0,
        seen.console.slice(0, 2).join(" ;; ") || "none");
      try { await p.close(); } catch (e) { /* as above */ }
    }

    /* ---- 4. an administrator is not blocked by the gate ------------------ */
    {
      const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
      const seen = await watch(p);
      await H.goHash(p, "/contracts");
      await H.sleep(4000);
      const rows = await p.evaluate(() => document.querySelectorAll("table tbody tr").length);
      check("an administrator reads every module they are entitled to",
        rows > 0 && seen.failures.length === 0,
        rows + " rows rendered; failures: " + ([...new Set(seen.failures)].join(" ; ") || "none"));
      try { await p.close(); } catch (e) { /* as above */ }
    }

    /* ---- 5. the gate follows the ENGINE, not a guess about the role ------ */
    /* The roster's litigation and commercial leads hold `full` on every group,
       so reading Compliance is legitimate for them and asserting a refusal
       would be asserting a bug. The account that is genuinely restricted is
       the Compliance lead, who holds `commercial: none` -- which is why the
       contracts register is the one request that must never be made. This
       check reads the effective permissions rather than assuming them. */
    {
      const cookie = await H.loginApi(sb, H.USERS.complLead.email);
      const s = (await H.request(sb.base, "GET", "/api/auth/session", { cookie })).body || {};
      const u = s.user || s.account || s;
      const groups = (u.permissions && u.permissions.groups) || {};
      check("the restricted account really is restricted in the engine",
        groups.commercial === "none" && groups.compliance === "full",
        JSON.stringify(groups));
      const refused = await H.request(sb.base, "GET", "/api/registers/contracts?limit=5", { cookie });
      const allowed = await H.request(sb.base, "GET", "/api/compliance/secp/annual", { cookie });
      check("the server refuses the group at `none` and serves the group at `full`",
        refused.status === 403 && allowed.status === 200,
        "contracts HTTP " + refused.status + ", statutory register HTTP " + allowed.status);
    }

    /* ---- 6. a litigation account works without failing requests ---------- */
    {
      const p = await H.asUser(browser, sb, H.USERS.litLead.email, ctx);
      const seen = await watch(p);
      await H.goHash(p, "/litigation");
      await H.sleep(2600);
      check("a Litigation account collects no failing request",
        seen.failures.length === 0,
        [...new Set(seen.failures)].join(" ; ") || "none");
      try { await p.close(); } catch (e) { /* as above */ }
    }
  } finally {
    try { await browser.close(); } catch (e) { /* as above */ }
  }
});
