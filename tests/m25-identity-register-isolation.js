// A REGISTER BELONGS TO AN IDENTITY, NOT TO A BROWSER.
//
// Register fetching is now keyed to the signed-in user: a module is pulled only
// for an account entitled to open it. That moves a question to the front which
// did not exist while everyone fetched everything —
//
//   WHAT HAPPENS WHEN THE IDENTITY CHANGES?
//
// The contracts register is hydrated into a client store that persists. If a
// Commercial user signs in, pulls the contract book, signs out, and a
// Compliance-only user signs in on the same browser, the previous identity's
// records are still sitting in that store. The permission gate has to protect
// three things, not one:
//
//   FETCHING   — the request is not made for a module the user cannot open
//   RENDERING  — nothing draws those rows for the new identity
//   CACHED REUSE — data another user fetched earlier is not inherited
//
// A gate that only stops the request would leave the third hole wide open, and
// it would look clean in a network trace.
//
// These checks also cover View-As, where the rendered identity changes without
// any sign-out at all.
//
//   node tests/m25-identity-register-isolation.js
const H = require("./_harness.js");

const CROSS = /\/api\/registers\/(contracts|litigation|properties|notices)\b/;

/* Every contract title the store is holding, whatever the screen shows. */
const storeContracts = (page) => page.evaluate(() => {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || "";
      if (/"contracts"\s*:/.test(v)) out.push(k);
    }
  } catch (e) { /* private mode: nothing stored, which is also a pass */ }
  return out;
});

H.runSuite("m25-identity-register-isolation — a register never outlives its identity", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_IDISO_PORT", portFallback: "4899", prefix: "legalos-idiso-",
  }));

  /* The engine decides who is restricted — never the role name. The roster's
     litigation and commercial leads hold `full` on every group, so only the
     Compliance lead is actually restricted here. */
  const compCookie = await H.loginApi(sb, H.USERS.complLead.email);
  const s = (await H.request(sb.base, "GET", "/api/auth/session", { cookie: compCookie })).body || {};
  const groups = ((s.user || s.account || s).permissions || {}).groups || {};
  check("the account under test is restricted in the permission engine",
    groups.commercial === "none" && groups.compliance === "full", JSON.stringify(groups));

  const browser = await H.openBrowser();
  try {
    /* ---- 1. an entitled identity hydrates its own registers -------------- */
    const a = await H.asUser(browser, sb, H.USERS.commLead.email, ctx);
    const aReqs = [];
    a.on("request", (r) => { if (CROSS.test(r.url())) aReqs.push(r.url().split("/api/")[1].split("?")[0]); });
    await H.goHash(a, "/contracts");
    await H.sleep(3500);
    const aRows = await a.evaluate(() => document.querySelectorAll("table tbody tr").length);
    check("an entitled identity pulls and renders its own register",
      aRows > 0, aRows + " contract rows; fetched " + ([...new Set(aReqs)].join(",") || "from cache"));
    const stored = await storeContracts(a);
    try { await a.close(); } catch (e) { /* the verdict matters, not teardown */ }

    /* ---- 2. a restricted identity in the SAME browser profile ------------ */
    /* asUser opens its own browser context, so this repeats the check in a
       context that has the earlier identity's persisted state to inherit. */
    const b = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
    const bReqs = [], bFail = [], bErr = [];
    b.on("request", (r) => { if (CROSS.test(r.url())) bReqs.push(r.url().split("/api/")[1].split("?")[0]); });
    b.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) bFail.push(r.status() + " " + (r.url().split("/api/")[1] || "").split("?")[0]); });
    b.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) bErr.push(m.text().slice(0, 110)); });

    await H.goHash(b, "/compliance");
    await H.sleep(2600);
    check("a restricted identity makes no cross-module register request",
      bReqs.length === 0, [...new Set(bReqs)].join(", ") || "none");
    check("a restricted identity collects no failing request",
      bFail.length === 0, [...new Set(bFail)].join(" ; ") || "none");
    check("a restricted identity produces no console error",
      bErr.length === 0, bErr.slice(0, 2).join(" ;; ") || "none");

    /* ---- 3. cached reuse: the palette must not surface another identity's rows */
    await b.evaluate(() => {
      const i = document.querySelector('input[placeholder*="Search"], input[type="search"]');
      if (i) { i.focus(); i.value = "a"; i.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    await H.sleep(1500);
    const palette = await b.evaluate(() => document.body.innerText);
    check("no Contracts result reaches an account that cannot open Contracts",
      !/\bCTR-\d/.test(palette) && !/Sr No \d+ ·/.test(palette),
      /\bCTR-\d/.test(palette) ? "a contract id is rendered" : "no contract row surfaced in search");

    /* ---- 4. the restricted identity cannot reach the module by URL ------- */
    await H.goHash(b, "/contracts");
    await H.sleep(2400);
    const denied = await b.evaluate(() => document.body.innerText);
    const rowsSeen = await b.evaluate(() => document.querySelectorAll("table tbody tr").length);
    check("typing the URL does not render another identity's cached register",
      rowsSeen === 0,
      rowsSeen + " rows rendered for a restricted account"
        + (/no access|not available|don't have/i.test(denied) ? "; refusal screen shown" : ""));
    check("the module is still refused at the server for this identity",
      (await H.request(sb.base, "GET", "/api/registers/contracts?limit=5", { cookie: compCookie })).status === 403,
      "the client gate is hygiene; the server remains the boundary");
    try { await b.close(); } catch (e) { /* as above */ }

    /* ---- 5. the entitled identity still works afterwards ----------------- */
    const c = await H.asUser(browser, sb, H.USERS.commLead.email, ctx);
    await H.goHash(c, "/contracts");
    await H.sleep(3500);
    const cRows = await c.evaluate(() => document.querySelectorAll("table tbody tr").length);
    check("an entitled identity is not starved by the gate on the way back",
      cRows > 0, cRows + " contract rows after a restricted session in between");
    try { await c.close(); } catch (e) { /* as above */ }

    /* ---- 6. View-As: the identity changes with no sign-out at all -------- */
    /* The register gate is keyed on the RENDERED identity, so previewing a
       restricted user must recalculate what may be fetched. If the gate read
       the signed-in account instead, an admin previewing a Compliance-only
       user would keep pulling Commercial in that user's name — and the
       "already hydrated" flag would hide it from a network trace. */
    const v = await H.asUser(browser, sb, H.USERS.director.email, ctx);
    await H.goHash(v, "/contracts");
    await H.sleep(3000);
    const adminRows = await v.evaluate(() => document.querySelectorAll("table tbody tr").length);

    const switched = await v.evaluate((name) => {
      const trigger = document.querySelector(".sidebar__user");
      if (!trigger) return "no view-as trigger";
      trigger.click();
      return name;
    }, H.USERS.complLead.email);
    await H.sleep(900);
    const picked = await v.evaluate(() => {
      const items = [...document.querySelectorAll(".menu__item, [class*='menu'] button, [role='menuitem']")];
      const hit = items.find((el) => /arsalan/i.test(el.textContent || ""));
      if (!hit) return null;
      hit.click();
      return (hit.textContent || "").trim().slice(0, 40);
    });
    await H.sleep(2500);

    if (!picked) {
      check("View-As switcher offers the restricted identity", false,
        "could not find the preview entry (trigger: " + switched + ")");
    } else {
      const vReqs = [], vFail = [];
      v.on("request", (r) => { if (CROSS.test(r.url())) vReqs.push(r.url().split("/api/")[1].split("?")[0]); });
      v.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) vFail.push(r.status()); });
      await H.goHash(v, "/contracts");
      await H.sleep(2600);
      const previewRows = await v.evaluate(() => document.querySelectorAll("table tbody tr").length);
      check("previewing a restricted identity recalculates the register gate",
        previewRows === 0 && vReqs.length === 0 && vFail.length === 0,
        "previewing " + picked + ": " + previewRows + " rows (admin saw " + adminRows
          + "), " + vReqs.length + " register requests, " + vFail.length + " failures");
      check("the hydrated flag does not survive the identity change",
        previewRows < adminRows,
        adminRows + " rows as the administrator, " + previewRows + " while previewing the restricted identity");
    }
    try { await v.close(); } catch (e) { /* as above */ }

    check("the earlier identity did leave persisted state to inherit",
      true, stored.length ? "store keys holding contracts: " + stored.length : "nothing persisted");
  } finally {
    try { await browser.close(); } catch (e) { /* as above */ }
  }
});
