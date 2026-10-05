/* THE PRODUCT'S TABLE OF CONTENTS.
 *
 * The navigation was reorganised around the nine primary areas: Dashboard,
 * Legal Workspace, Calendar, and six module families — one rail row each,
 * with their registers as tabs on the family's own pages.
 * Two kinds of regression are worth a suite of their own:
 *
 *   A ROW THAT LEADS NOWHERE. Every destination in the rail must render. A nav
 *   entry pointing at a route that was renamed is the cheapest possible bug and
 *   the most embarrassing one.
 *
 *   A RETIRED ADDRESS THAT 404s. Matters and Intake & Repository were removed
 *   as destinations. Somebody has those links in an email. They must land
 *   somewhere sensible, not on "Page not found".
 */
const H = require("./_harness.js");
const { USERS } = H;

/* Every destination the rail can reach, as a person reaches it. */
const NAV_DESTINATIONS = [
  ["/workspace", /Legal Workspace/i],
  ["/project-wise", /Project Wise/i],
  ["/calendar", /Legal Calendar/i],
  ["/contract-requests", /Contract Request/i],
  ["/m/contracts", /Contract Review/i],
  ["/m/vetting", /Risk Analysis/i],
  ["/tracker", /Contract Tracker/i],
  ["/projects", /Project Documents/i],
  ["/compliance", /Compliance/i],
  ["/companies", /Companies/i],
  ["/compliance/loans", /Loans/i],
  ["/compliance/leases", /Leases/i],
  ["/compliance/services", /Spend Agreements/i],
  ["/compliance/licenses", /Licences/i],
  ["/compliance/sec-filings", /SECP/i],
  ["/litigation", /Litigation/i],
  ["/m/developerDisputes", /Disputes/i],
  ["/m/causelist", /Cause List/i],
  ["/m/notices", /Notices/i],
  ["/m/ip", /IP Portfolio/i],
  ["/m/assetRecovery", /Asset Recovery/i],
  ["/m/police", /Police Complaints/i],
  ["/m/inspections", /Government Authority Visits/i],
  ["/m/spend", /Invoices|spend/i],
  ["/m/analytics", /Litigation Analytics/i],
  ["/contracts", /Contract/i],
  ["/drafting", /Contract Intelligence|Drafting/i],
  ["/templates", /Templates/i],
  ["/clauses", /Clause Library/i],
  ["/playbooks", /Precedents & Playbooks/i],
  ["/knowledge", /Knowledge Base/i],
];

/* Addresses that were RETIRED as destinations. Each must resolve to the
   surface that owns the work now — never to a not-found. */
const RETIRED = [
  ["/matters", /Legal Workspace|Current Work/i, "the Legal Workspace"],
  ["/repository", /Contract/i, "the contracts register"],
  ["/licenses", /Licences/i, "the compliance licence register"],
];

async function open(page, hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await H.sleep(300);
  const deadline = Date.now() + 14000;
  let txt = "";
  while (Date.now() < deadline) {
    txt = await page.evaluate(() => ((document.querySelector(".content") || document.body).innerText || "").replace(/\s+/g, " ").trim());
    if (txt.length > 60 && !/^\s*(loading|reading|opening)/i.test(txt)) break;
    await H.sleep(250);
  }
  return txt;
}

H.runSuite("the navigation leads somewhere, and retired addresses still land", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M51_PORT", portFallback: "5051", prefix: "legalos-m51-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, USERS.director, ctx);

  const bad = [];
  for (const [route, expect] of NAV_DESTINATIONS) {
    const before = ctx.pageErrors.length;
    const txt = await open(page, "#" + route);
    const errs = ctx.pageErrors.slice(before);
    if (errs.length) bad.push(route + " threw: " + errs[0].slice(0, 90));
    else if (txt.length < 60) bad.push(route + " rendered " + txt.length + " chars");
    else if (!expect.test(txt)) bad.push(route + " did not look like itself: " + txt.slice(0, 70));
  }
  ctx.pageErrors.length = 0;
  ctx.check("every destination in the rail renders and looks like itself",
    bad.length === 0, bad.length ? bad.slice(0, 5).join(" | ") : NAV_DESTINATIONS.length + " destinations");

  for (const [route, expect, lands] of RETIRED) {
    const txt = await open(page, "#" + route);
    ctx.check(`${route} still lands — on ${lands}`,
      expect.test(txt) && !/Page not found/i.test(txt), txt.slice(0, 110));
  }
  ctx.pageErrors.length = 0;

  /* THE RAIL IS THE TABLE OF CONTENTS; THE FAMILY'S PAGES ARE TABS.
     Both arrangements have been tried. Expanding every family in the rail put
     the whole product in the sidebar — thirty-odd rows to read — so the rail
     carries one row per family and the family's registers are a tab strip
     across the top of every page inside it. This asserts both halves: the rail
     stays short, and from a page in the family every sibling is on screen. */
  await open(page, "#/litigation");
  const rail = await page.evaluate(() => ({
    text: (document.querySelector(".sidebar") || document.body).innerText.replace(/\s+/g, " "),
    rows: document.querySelectorAll(".sidebar .nav__item").length,
    tabs: [...document.querySelectorAll(".famtabs .tab")].map((t) => (t.innerText || "").trim()),
  }));
  ctx.check("the rail carries the families, not every register underneath them",
    rail.rows <= 12 && /Litigation & Disputes/.test(rail.text) && !/Notices/.test(rail.text),
    rail.rows + " rows: " + rail.text.slice(0, 200));
  ctx.check("the Litigation family lists its modules as tabs on its pages",
    rail.tabs.includes("Notices") && rail.tabs.includes("Cause List / Calendar")
      && rail.tabs.includes("PK IP Portfolio"),
    rail.tabs.join(" | "));

  ctx.check("Matters is gone from the rail", !/\bMatters\b/.test(rail.text), rail.text.slice(0, 200));
  ctx.check("Shared has become the Data Bank",
    /Data Bank/.test(rail.text) && !/Intake & Repository/.test(rail.text), rail.text.slice(0, 220));

  /* THE CALENDAR IS REAL, not a placeholder: it has to carry dated events out
     of the registers and move a month when asked. */
  const cal = await open(page, "#/calendar");
  ctx.check("the calendar renders the week/month controls and a legend",
    /Week/.test(cal) && /Month/.test(cal) && /Today/.test(cal), cal.slice(0, 160));
  const moved = await page.evaluate(async () => {
    const prev = location.hash;
    const b = [...document.querySelectorAll(".calnav__b")].find((x) => /Next period/i.test(x.getAttribute("aria-label") || ""));
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 600));
    return { prev, now: location.hash };
  });
  ctx.check("moving the calendar period writes it into the URL",
    moved.now !== moved.prev && /on=/.test(moved.now), moved.prev + " -> " + moved.now);
});
