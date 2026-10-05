/* WHAT THE PRODUCT CLAIMS, AND IN WHOSE WORDS.
 *
 * Two classes of defect this suite exists to catch, both of which shipped:
 *
 *   A NUMBER NOBODY MEASURED. The executive dashboard read most of its
 *   headline figures out of a constant called DASH — 1,284 active contracts, a
 *   turnaround of "3.4 days, down from 4.8 in January", a compliance score of
 *   84 — written by hand before Drive was connected and then quoted in a
 *   narrative paragraph addressed to the General Counsel. Every figure must now
 *   either be computed or say it cannot be.
 *
 *   PIPELINE VOCABULARY ON AN OPERATIONAL SCREEN. "INCOMPLETE_SOURCE",
 *   "Triage", "2765d overdue". None of those are words a lawyer uses, and two
 *   of them actively mislead: a licence that lapsed in 2018 is expired, not
 *   two thousand days late.
 */
const H = require("./_harness.js");
const { USERS } = H;

async function open(page, hash, ms) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await H.sleep(ms || 3000);
  return page.evaluate(() => ((document.querySelector(".content") || document.body).innerText || "").replace(/\s+/g, " ").trim());
}

H.runSuite("no invented numbers, and no pipeline vocabulary on a legal screen", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M52_PORT", portFallback: "5052", prefix: "legalos-m52-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, USERS.director, ctx);

  /* ---- the dashboard's fabricated figures are gone ---- */
  const dash = await open(page, "#/exec", 4500);
  ctx.check("the dashboard no longer quotes the hand-written turnaround trend",
    !/down from 4\.8/.test(dash) && !/3\.4 days/.test(dash), dash.slice(0, 200));
  ctx.check("no synthetic compliance score is presented as a rating",
    !/Compliance score/i.test(dash) && !/\/100/.test(dash), dash.slice(0, 200));
  ctx.check("the dashboard leads with ACTIVE work, not lifetime totals",
    /Active cases/i.test(dash) && /Active notices/i.test(dash) && /Active tasks/i.test(dash),
    dash.slice(0, 220));
  ctx.check("board resolutions and loans are no longer executive headline cards",
    !/Board resolutions/i.test(dash) && !/Loans & financing/i.test(dash), dash.slice(0, 220));

  /* ---- revenue: earned revenue is never derived from contract value ---- */
  const rev = await open(page, "#/exec?tab=revenue", 4500);
  ctx.check("actual revenue earned says it is not evidenced rather than showing a number",
    /NOT EVIDENCED/i.test(rev) && /finance source not connected/i.test(rev), rev.slice(0, 260));
  ctx.check("contractual revenue is still stated, so the gap is visible not total",
    /Contractual revenue value/i.test(rev), rev.slice(0, 200));

  /* ---- spend: contractual vs actual, and legal cost is not exposure ---- */
  const spend = await open(page, "#/exec?tab=spend", 4500);
  ctx.check("spend distinguishes what is committed from what is evidenced",
    /Contractual spend/i.test(spend) && /NOT EVIDENCED/i.test(spend), spend.slice(0, 240));
  ctx.check("legal cost is broken into its approved categories",
    /Stamp/i.test(spend) && /Registration/i.test(spend) && /Litigation/i.test(spend), spend.slice(0, 300));
  ctx.check("claims and exposure are excluded from legal cost, and it says so",
    /not legal cost/i.test(spend), spend.slice(spend.search(/not legal cost/i) - 90, spend.search(/not legal cost/i) + 60));

  /* ---- team: turnaround is measured, or honestly absent ---- */
  const team = await open(page, "#/exec?tab=team", 4500);
  const measured = /Measured across \d+ completed/i.test(team) || /not enough completed work/i.test(team)
    || /Average turnaround/i.test(team);
  ctx.check("average turnaround is measured from completed work, or named as unmeasurable",
    measured, team.slice(0, 240));
  ctx.check("workload is counted in OPEN TASKS, not records held",
    /Open tasks/i.test(team) || /Workload by person/i.test(team), team.slice(0, 240));

  /* ---- expiry language ---- */
  const lic = await open(page, "#/compliance/licenses", 4500);
  ctx.check("a lapsed licence reads as Expired, not as a four-digit day count",
    !/\d{4}d overdue/.test(lic) && !/\b\d{3,}d ago\b/.test(lic), lic.slice(0, 300));
  ctx.check("a licence with no expiry says so in words",
    !/Expiry — —/.test(lic), lic.slice(0, 200));

  /* ---- the register filter speaks business, not ingest ---- */
  ctx.check("the completeness filter is not called Source quality",
    !/Source quality/i.test(lic), lic.slice(0, 260));
  ctx.check("no raw ingest code is on the licence register",
    !/INCOMPLETE_SOURCE|CONFLICTING_SOURCE|WEAK_IDENTITY/.test(lic), lic.slice(0, 260));

  /* ---- triage is called what the business calls it ---- */
  const ws = await open(page, "#/workspace", 4000);
  ctx.check("the workspace KPI row is actionable and free of vanity totals",
    /Active tasks/i.test(ws) && !/Portfolio value/i.test(ws) && !/Filed as matters/i.test(ws),
    ws.slice(0, 240));

  ctx.pageErrors.length = 0;
});
