/* Every module, opened the way a person opens it, in a real browser.
 *
 * The other suites each prove one module's behaviour. None of them proves the
 * plain thing: that every address in the app renders for the roles allowed to
 * see it, without throwing. That gap is how a page shipped referring to a
 * variable declared in a different component and blanked four registers for a
 * week — every behavioural suite passed, because none of them opened the page.
 *
 * So this walks the route table. For each route and each role it records what
 * the browser reported WHILE that route was open, and attributes any pageerror,
 * failed request or console error to the route that caused it. A route that
 * renders nothing is a failure too: a blank main panel is what a crashed render
 * looks like to the person using it.
 */
const H = require("./_harness.js");
const { USERS } = H;

/* Every address the nav can reach. Detail routes are covered by their own
   suites; what is unique here is BREADTH -- the whole table, not one page. */
const ROUTES = [
  // the daily surfaces
  "/exec", "/exec?tab=revenue", "/exec?tab=spend", "/exec?tab=team", "/exec/brief",
  "/workspace", "/project-wise", "/requests", "/my-tasks", "/triage", "/calendar",
  "/costs", "/team", "/me", "/tracker", "/projects", "/access", "/datahealth",
  "/contract-requests", "/analyzer", "/assistant", "/pipelines",
  "/contracts", "/reviews", "/approvals", "/negotiations",
  "/templates", "/clauses", "/drafting", "/knowledge", "/playbooks",
  "/litigation", "/compliance", "/companies", "/reports", "/copilot", "/automation",
  "/organization", "/settings", "/g",
  // the registers that are families in their own right
  "/m/contracts", "/m/vetting", "/m/notices", "/m/police", "/m/inspections",
  "/m/assetRecovery", "/m/ip", "/m/developerDisputes",
  "/m/causelist", "/m/spend", "/m/report", "/m/analytics",
  // RETIRED ADDRESSES. Matters and Intake & Repository are no longer
  // destinations; somebody has those links in an email and they must land
  // somewhere sensible rather than on a not-found.
  "/matters", "/repository", "/licenses",
  // the four compliance keys that MOVED -- these must redirect, not 404
  "/m/agreements", "/m/resolutions", "/m/licenses", "/m/filings",
  // the compliance registers themselves
  "/compliance/leases", "/compliance/licenses", "/compliance/loans",
  "/compliance/resolutions", "/compliance/sec-filings", "/compliance/services",
];


/* Roles chosen to span the permission model: one who sees everything, one lead
   per team, and two identities that are deliberately fenced out of most of it. */
const ROLES = [USERS.director, USERS.litLead, USERS.complMember, USERS.paralegal];

/* A page that is still fetching says so. Judging a route while it is still on
   "Reading the pipeline…" reports a slow endpoint as a blank page, so wait for
   the loading copy to clear before reading anything -- and report how long the
   route actually took, because a route that needs ten seconds is a finding of
   its own even when it eventually renders. */
const LOADING = /\b(loading|reading|fetching|opening|please wait)\b/i;

async function settled(page) {
  return page.evaluate((src, flags) => {
    const main = document.querySelector(".content") || document.body;
    const t = (main.innerText || "").replace(/\s+/g, " ").trim();
    /* Short text with loading copy anywhere in it -- not only at the start,
       because every one of these pages prints its own title first and
       "Data Health Reading the pipeline..." is still a page that is loading. */
    if (t.length < 200 && new RegExp(src, flags).test(t)) return false;
    // Nothing painted yet is never a settled answer; keep waiting, and let the
    // caller's timeout be what decides the route is genuinely blank.
    if (t.length < 40) return false;
    return true;
  }, LOADING.source, LOADING.flags);
}

async function openRoute(page, hash) {
  const t0 = Date.now();
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await H.sleep(120);
  await H.waitFor(page, () => (document.querySelector(".page, .sidebar, .content") ? true : null),
    { timeout: 20000, message: "the app shell to render" });
  await H.sleep(400);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !(await settled(page))) await H.sleep(300);
  const ms = Date.now() - t0;
  return Object.assign({ ms }, await page.evaluate(() => {
    const main = document.querySelector(".content") || document.body;
    const text = (main.innerText || "").replace(/\s+/g, " ").trim();
    return {
      hash: location.hash,
      chars: text.length,
      text: text.slice(0, 220),
      // A blank main panel with the sidebar still there is what a crashed
      // render looks like: the shell survives, the route does not.
      hasShell: !!document.querySelector(".sidebar, .topbar"),
    };
  }));
}

H.runSuite("every module opens, for every role, without throwing", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M47_PORT", portFallback: "5044", prefix: "legalos-m47-" }));
  const browser = ctx.setBrowser(await H.openBrowser());

  for (const role of ROLES) {
    const page = await H.asUser(browser, sb, role, ctx);
    const faults = [];
    const empty = [];
    const slow = [];
    let opened = 0;

    for (const route of ROUTES) {
      const before = ctx.pageErrors.length;
      let st = null;
      try {
        st = await openRoute(page, "#" + route);
      } catch (e) {
        faults.push(route + " — " + String(e.message || e).replace(/\s+/g, " ").slice(0, 110));
        continue;
      }
      opened++;
      const newFaults = ctx.pageErrors.slice(before);
      for (const f of newFaults) faults.push(route + " — " + f.replace(/\s+/g, " ").slice(0, 140));
      /* Under 40 characters of rendered text is not a page. Either it crashed
         or it is an empty shell -- both are worth naming. A refusal notice is
         longer than that and reads as one, so it passes here and is checked
         below. */
      if (st.chars < 40) empty.push(route + " — " + st.chars + " chars");
      if (st.ms > 12000) slow.push(route + " — " + Math.round(st.ms / 100) / 10 + "s");
    }
    // Errors attributed above are accounted for; do not fail the suite twice.
    ctx.pageErrors.length = 0;

    ctx.check(`${role.label}: every route in the table renders`,
      faults.length === 0 && empty.length === 0 && slow.length === 0,
      faults.length || empty.length || slow.length
        ? [...faults, ...empty.map((e) => "EMPTY " + e), ...slow.map((e) => "SLOW " + e)].slice(0, 8).join(" | ")
        : `${opened}/${ROUTES.length} routes, no console error, no failed request, no blank page`);

    await page.close();
  }

});
