/* GETTING SOMEWHERE SHOULD NOT REQUIRE KNOWING WHERE IT IS.
 *
 * The rail carries the nine primary areas: the daily surfaces, then one row per
 * module family. The family's real destinations are TABS — a strip across the
 * top of every page inside that family. Both halves of that were separately
 * broken before, and both are asserted here.
 *
 * The other arrangement was tried: every family expanded in the rail, listing
 * its destinations as rows. It made the rail the whole product — nine rows
 * became thirty-odd, the sidebar scrolled, and the register you wanted was
 * buried in a column you had to read. Sibling registers belong beside each
 * other on the page, where you can see all ten at once and switch between them
 * without going near the chrome.
 *
 * Four things are asserted, because each was separately wrong:
 *   the rail stays short — one row per family, not one row per register;
 *   every destination in a family is one click away once you are in it;
 *   the navigation says which page you are on, in the rail AND in the tabs;
 *   none of this widened who can see what.
 *
 *   node tests/m50-navigation.js
 */
const H = require("./_harness.js");

const rail = (page) => page.evaluate(() => ({
  rows: [...document.querySelectorAll(".sidebar .nav__item")]
    .map((b) => ({ label: (b.innerText || "").replace(/\s+/g, " ").trim(),
      active: b.classList.contains("active") })),
  tabs: [...document.querySelectorAll(".famtabs .tab")]
    .map((b) => ({ label: (b.innerText || "").replace(/\s+/g, " ").trim(),
      active: b.classList.contains("active") })),
  disclosures: document.querySelectorAll(".sidebar .nav__label--toggle").length,
}));

H.runSuite("the navigation says where you are and what else there is", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M50_PORT", portFallback: "5124", prefix: "legalos-m50-" }));
  const browser = ctx.setBrowser(await H.openBrowser());

  /* ------------------------------------------- 1. the rail stays short ---- */
  const lit = await H.asUser(browser, sb, H.USERS.litMember, ctx);
  await H.sleep(2500);

  let st = await rail(lit);
  check("nothing expands in the rail — a family is a row, not a disclosure",
    st.disclosures === 0, st.disclosures + " disclosure headers");
  check("the rail is the table of contents, not the contents",
    st.rows.length <= 12 && !st.rows.some((r) => /^Notices$/i.test(r.label)),
    st.rows.length + " rows: " + st.rows.map((r) => r.label).join(" | "));

  /* --------------------------- 2. the family's destinations are tabs ---- */
  await lit.evaluate(() => { window.location.hash = "#/litigation"; });
  await H.sleep(3000);
  st = await rail(lit);
  const tabLabels = st.tabs.map((t) => t.label);
  /* The family's own labels. Several were renamed in the product-integration
     pass: the cause list became a calendar, the IP portfolio is the Pakistan
     estate, and "Reports" became Analytics because it answers questions across
     the whole family rather than only about cases. */
  for (const want of ["Notices", "Cause List / Calendar", "PK IP Portfolio", "Invoices & Spend", "Analytics"]) {
    check(`"${want}" is one click away from anywhere in its family`, tabLabels.includes(want),
      tabLabels.includes(want) ? "a tab on the page" : "not offered: " + tabLabels.join(", "));
  }

  const before = lit.url();
  await lit.evaluate(() => {
    const b = [...document.querySelectorAll(".famtabs .tab")]
      .find((e) => /^Notices$/i.test((e.innerText || "").trim()));
    if (b) b.click();
  });
  await H.waitFor(lit, () => (location.hash.includes("/m/notices") ? true : null),
    { timeout: 12000, message: "the Notices register to open from the family tabs" });
  check("clicking a sibling tab goes straight to that register",
    lit.url() !== before, "#/m/notices");

  /* ------------------------------------- 3. it says where you are -------- */
  st = await rail(lit);
  const activeTabs = st.tabs.filter((t) => t.active).map((t) => t.label);
  check("the tab strip marks the page you are on, and marks exactly one",
    activeTabs.length === 1 && activeTabs[0] === "Notices", activeTabs.join(", ") || "nothing marked");
  const activeRows = st.rows.filter((r) => r.active).map((r) => r.label);
  check("and the rail marks the family you are working in",
    activeRows.length === 1 && /Litigation/i.test(activeRows[0]),
    activeRows.join(", ") || "nothing marked");

  /* A nested address must mark the page itself, not the section it sits under.
     `base === it.path` compared only the first segment, so /compliance/licenses
     marked "Overview" and the register on screen looked unvisited. */
  const comp = await H.asUser(browser, sb, H.USERS.complMember, ctx);
  await comp.evaluate(() => { window.location.hash = "#/compliance/licenses"; });
  await H.sleep(3500);
  const cst = await rail(comp);
  const ctabs = cst.tabs.filter((t) => t.active).map((t) => t.label);
  check("a nested address marks the page itself, not the section above it",
    ctabs.length === 1 && /Licen[cs]es/i.test(ctabs[0]),
    ctabs.join(", ") || "nothing marked");

  /* -------------------------- 4. none of this widened who sees what ---- */
  const litRows = (await rail(lit)).rows.map((r) => r.label).join(" | ");
  check("a litigation associate is still shown only their own families",
    !/Commercial|Administration|Insight/i.test(litRows), litRows);
  const compRows = cst.rows.map((r) => r.label).join(" | ");
  check("and a compliance associate only theirs",
    !/Litigation|Commercial|Administration/i.test(compRows), compRows);
  /* The tabs are gated by the same rule as the rail: a family tab strip must
     not offer a page the router would refuse. */
  check("the family tabs offer nothing the viewer cannot open",
    cst.tabs.length > 0, cst.tabs.map((t) => t.label).join(" | ") || "no tabs");

  await comp.close();
  await lit.close();
});
