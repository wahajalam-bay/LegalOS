// THE SECP WORKSPACE ON SCREEN.
//
// WHAT THESE CHECKS ARE HOLDING IN PLACE
//
//   THE TABS COUNTED THE WRONG POPULATION. "Annual filings" and "Event-based
//   filings" counted only filings raised inside LegalOS, of which there are
//   none, so a Drive estate of 250 entity-year records, 769 event filings and
//   130 statutory registers rendered as "0" beside a card reading "0 recorded
//   filings · 52 entities · 33 compliance years".
//
//   THE REGISTER LINKED TO A 404. The list was served from the Drive-backed
//   model while the detail route still resolved against the legacy
//   board-minute derivation, so every row opened an undefined year and the
//   page threw on it.
//
//   LOADING, FAILED AND EMPTY ARE THREE DIFFERENT THINGS. Rendering all three
//   as a bare table is how "nothing here" gets shown over an estate of 3,367
//   documents.
//
//   A SEARCH THAT MATCHES EVERYTHING IS NOT A SEARCH. Every annual record
//   carries a row per configured form whether or not the document exists, so
//   searching "Form 9" returned all 250 records including the years holding no
//   Form 9 at all.
//
//   node tests/m21-secp-workspace.js
const H = require("./_harness.js");

const setInput = (page, id, text) => page.evaluate((i, t) => {
  const el = document.getElementById(i);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, t);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, id, text);
const rowCount = (page) => page.evaluate(() => document.querySelectorAll("table.table tbody tr").length);

H.runSuite("m21-secp-workspace — the statutory estate, on screen", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_SECPUI_PORT", portFallback: "4873", prefix: "legalos-secpui-",
  }));
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);
  const model = {
    annual: ((await H.request(sb.base, "GET", "/api/compliance/secp/annual", { cookie })).body || {}).annual || [],
    events: ((await H.request(sb.base, "GET", "/api/compliance/secp/events", { cookie })).body || {}).events || [],
    registers: ((await H.request(sb.base, "GET", "/api/compliance/secp/registers", { cookie })).body || {}).registers || [],
    /* The companies the register lists -- the estate's own count, not a number
       typed into this file. */
    entities: (((await H.request(sb.base, "GET", "/api/compliance/secp/overview", { cookie })).body || {}).entities || [])
      .filter((e) => e.statutory),
  };

  const browser = await H.openBrowser();
  const page = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));

  try {
    /* ---- 1. the tab strip counts the estate, not an empty native register -- */
    await H.goHash(page, "/compliance/sec-filings?sview=overview");
    /* WAIT FOR THE COUNTS, DO NOT GUESS HOW LONG THEY TAKE.
       This slept 2500ms and then read the strip. The counts are three separate
       Drive-backed reads, so on a loaded machine the strip was asserted while
       two of them were still in flight and the suite reported a missing count as
       a missing register. Wait for all three to arrive, with a bound -- a count
       that never comes still fails, and now it fails for the real reason. */
    const wantCounts = [model.entities.length, model.events.length, model.registers.length];
    const strip = await H.waitFor(page, (want) => {
      const s = [...document.querySelectorAll(".fltbtn")].map((b) => b.innerText.trim()).join("  |  ");
      return want.every((n) => s.includes("(" + n + ")")) ? s : null;
    }, { arg: wantCounts, timeout: 30000, message: "the tab strip to report every count" })
      .catch(() => page.evaluate(() => [...document.querySelectorAll(".fltbtn")].map((b) => b.innerText.trim()).join("  |  ")));
    /* FIVE TABS, NOT SEVEN. "Compliance years" and "Annual compliance" were two
       names for the same entity-year records and "Entities" a third way in, so
       the three collapsed into one "Entities & filing history" workspace: the
       company is the row and its 250 years open inside it. The strip therefore
       counts COMPANIES where it used to count entity-years, and the estate's
       event filings and registers keep their own tabs. */
    check("the tab strip reports the Drive-backed estate",
      strip.includes("(" + model.entities.length + ")")
        && strip.includes("(" + model.events.length + ")")
        && strip.includes("(" + model.registers.length + ")"),
      strip);
    check("no tab reads zero over a populated register",
      !/\((0)\)/.test(strip), strip);

    /* ---- 2. each register renders its own rows ---------------------------- */
    for (const [view, expected] of [["entities", model.entities.length], ["event", model.events.length], ["registers", model.registers.length]]) {
      await H.goHash(page, "/compliance/sec-filings?sview=" + view);
      await H.sleep(2500);
      const n = await rowCount(page);
      check("the " + view + " register renders every record it holds",
        n === expected, n + " rows rendered, model holds " + expected);
    }

    /* ---- 3. search reaches the form and the document name -----------------
       This used to run against the retired "Annual compliance" tab. The
       capability it was protecting -- that search reads the FORM and the
       DOCUMENT NAMES a record holds, not just the columns on screen -- now
       lives on the event register, so that is where it is asserted. */
    await H.goHash(page, "/compliance/sec-filings?sview=event");
    await H.sleep(2500);
    const allEvents = await rowCount(page);
    await setInput(page, "secp-ev-q", "Form 29");
    await H.sleep(1200);
    const form29 = await rowCount(page);
    check("searching a form finds only the filings that are one",
      form29 > 0 && form29 < allEvents,
      allEvents + " filings -> " + form29 + " are a Form 29");

    await setInput(page, "secp-ev-q", "Affidavit");
    await H.sleep(1200);
    const byDoc = await rowCount(page);
    check("a document name is searchable, not only the rendered columns",
      byDoc > 0, byDoc + " filings hold a document named that");

    await setInput(page, "secp-ev-q", "zzzz-no-such-thing");
    await H.sleep(1200);
    const none = await rowCount(page);
    check("a search that matches nothing returns nothing, not everything",
      none === 0, none + " rows");

    /* ---- 4. a register row opens its compliance year ---------------------- */
    const rich = model.annual.slice().sort((a, b) => b.documentCount - a.documentCount)[0];
    for (const tab of ["overview", "accounts", "agm", "forms", "evidence", "documents", "timeline"]) {
      await H.goHash(page, "/compliance/sec-filings/year/" + encodeURIComponent(rich.id) + "?tab=" + tab);
      await H.sleep(1100);
      const txt = await page.evaluate(() => document.body.innerText);
      check("the " + tab + " tab of a compliance year renders",
        !/Compliance year not found/i.test(txt) && txt.includes(rich.entity),
        txt.replace(/\s+/g, " ").slice(0, 90));
    }

    /* ---- 5. an SMC is never shown an AGM requirement ---------------------- */
    const smc = model.annual.find((r) => r.entityType === "SMC");
    await H.goHash(page, "/compliance/sec-filings/year/" + encodeURIComponent(smc.id) + "?tab=agm");
    await H.sleep(1400);
    const smcTxt = await page.evaluate(() => document.body.innerText);
    check("a single member company is never asked for an AGM",
      /No AGM is required/i.test(smcTxt) && !/AGM overdue/i.test(smcTxt),
      smc.entity + ": " + (/No AGM is required/i.test(smcTxt) ? "shows 'No AGM is required'" : smcTxt.slice(0, 120)));

    /* ---- 6. the portal links are the configured ones ---------------------- */
    await H.goHash(page, "/compliance/sec-filings?sview=overview");
    await H.sleep(2000);
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")]
      .map((a) => a.href).filter((h) => /secp\.gov\.pk/.test(h)));
    check("the current SECP portal (LEAP) is linked",
      links.some((h) => /leap\.secp\.gov\.pk/.test(h)),
      links.join("  |  ") || "no SECP portal link rendered");

    /* ---- 7. the entity page is Drive-backed, not generated ---------------- */
    /* Every company's page used to open on FY 2021..FY 2028 from a formula,
       with generated deadlines, whatever its Drive estate held -- a company
       with ten CY folders looked identical to one with none. */
    const key = model.annual[0].entityKey;
    await H.goHash(page, "/compliance/sec-filings/entity/" + encodeURIComponent(key));
    await H.sleep(2800);
    const ent = await page.evaluate(() => document.body.innerText);
    check("an entity opens on the compliance years Drive holds for it",
      /Compliance years \(\d+\)/.test(ent) && /CY 20\d\d/.test(ent),
      (ent.match(/Compliance years \(\d+\)/) || ["not found"])[0]);
    check("no generated financial year appears in an entity's history",
      !/FY 202[6789]/.test(ent),
      /FY 202[6789]/.test(ent) ? "a generated FY row is rendered" : "none");
    check("the entity names its Drive source group and folder",
      /Source group/.test(ent) && /(Group|Non-Group) Entities/.test(ent),
      (ent.match(/Source group[\s\S]{0,70}/) || ["not found"])[0].replace(/\s+/g, " "));
    /* They are their own TABS on the entity now rather than sections stacked
       down one page -- the guarantee is the same one: a register is never
       counted as a filing, and an event filing never as annual compliance. */
    check("statutory registers and event filings are kept their own thing",
      /Statutory registers\s*\(?\d+\)?/.test(ent) && /Event filings\s*\(?\d+\)?/.test(ent),
      [(ent.match(/Statutory registers\s*\(?\d+\)?/) || [])[0],
        (ent.match(/Event filings\s*\(?\d+\)?/) || [])[0]].join("  |  "));

    /* ---- 8. upcoming obligations are separated and labelled --------------- */
    await H.goHash(page, "/compliance/sec-filings?sview=upcoming");
    /* Same race as the tab strip: this view is computed from the statutory rules
       over the whole estate, and 2600ms was not enough on a loaded machine. The
       suite then reported "0 entities with an upcoming obligation" beside a tab
       that said 87 -- a contradiction that was the measurement, not the page.
       Wait for it to render, and fail on the timeout if it truly never does. */
    await H.waitFor(page, () => {
      const t = document.body.innerText;
      return (/System-generated/i.test(t) || document.querySelectorAll("table.table tbody tr").length > 0) ? t : null;
    }, { timeout: 30000, message: "the upcoming-obligations view to render" }).catch(() => null);
    const upTxt = await page.evaluate(() => document.body.innerText);
    check("the upcoming view says plainly that it is not a Drive record",
      /System-generated/i.test(upTxt) && /not a Drive record/i.test(upTxt),
      (upTxt.match(/System-generated[^.]*\./) || ["not found"])[0].replace(/\s+/g, " ").slice(0, 120));
    const upRows = await rowCount(page);
    check("the upcoming view lists the configured obligations",
      upRows > 0, upRows + " entities with an upcoming obligation");

    /* ---- 9. the entity register shows what Drive holds --------------------- */
    await H.goHash(page, "/compliance/sec-filings?sview=entities");
    await H.sleep(2600);
    const entRows = await rowCount(page);
    const entTxt = await page.evaluate(() => document.body.innerText);
    check("the entity register defaults to the companies Drive holds a folder for",
      entRows === new Set(model.annual.map((r) => r.entityKey)).size,
      entRows + " rows, " + new Set(model.annual.map((r) => r.entityKey)).size + " companies in the Drive estate");
    check("companies absent from Drive are explained, not silently dropped",
      /no folder under the SECP source root/i.test(entTxt),
      (entTxt.match(/LegalOS knows[^.]*\./) || ["not found"])[0].replace(/\s+/g, " ").slice(0, 140));

    /* ---- 10. the Compliance overview card reports the real estate --------- */
    /* `headline` is a sibling of `dashboard` in the overview response, not a
       field inside it. Reading it as SE.headline made every statutory figure
       undefined, so the card fell back to the legacy board-minute derivation
       and printed "33 entity-year records · 52 entities · 0 filings" over an
       estate of 43 companies and 250 entity-year folders. */
    await H.goHash(page, "/compliance");
    await H.sleep(3000);
    /* innerText puts a newline between a card's number and its label, so the
       comparison is made on whitespace-normalised text. */
    const card = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    check("the Compliance overview card shows the real statutory estate",
      card.includes(model.annual.length + " entity-year records")
        && card.includes(model.events.length + " event filings"),
      "model holds " + model.annual.length + " entity-years / " + model.events.length + " events — card reads: "
        + (card.match(/SECP Filings[\s\S]{0,120}/) || ["not found"])[0]);
    for (const stale of ["0 recorded filings", "33 compliance years", "52 entities"]) {
      check("the card no longer reads \"" + stale + "\"",
        !new RegExp(stale, "i").test(card), new RegExp(stale, "i").test(card) ? "STILL PRESENT" : "absent");
    }

    /* ---- 11. nothing threw ------------------------------------------------ */
    check("the workspace renders without a script error",
      errs.length === 0, errs.slice(0, 2).join(" ;; ") || "none");
  } finally {
    try { await page.close(); await browser.close(); } catch (e) { /* the suite's verdict matters, not teardown */ }
  }
});
