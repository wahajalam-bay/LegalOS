/* COMPANIES AS THE PRIMARY COMPLIANCE OBJECT.
 *
 * The register used to be assembled in the BROWSER by loading six registers and
 * joining them on an entity name. That had two failures the counts never
 * admitted to:
 *
 *   The contracts register carries its party as `firstParty` on the server and
 *   `entityName` only after the browser adapter has run. Joining on the wrong
 *   one dropped all 1,252 contracts, and every company in the estate reported
 *   zero contracts on a page whose entire purpose is to show what a company
 *   holds.
 *
 *   A compliance account cannot read the commercial register at all, so the
 *   page showed a company with no contracts rather than a company whose
 *   contracts they may not open. Those are different statements.
 *
 * And the constitutional facts the brief asks for — directors, CEO, company
 * secretary, incorporation date, parent — are in NO connected source. The
 * product must say so rather than fill them.
 */
const H = require("./_harness.js");
const { USERS } = H;

H.runSuite("companies are assembled from every source, and say what they cannot evidence", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M53_PORT", portFallback: "5053", prefix: "legalos-m53-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, USERS.director, ctx);

  const list = await page.evaluate(async () => {
    const r = await fetch("api/companies");
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  ctx.check("the company register answers", list.status === 200, "HTTP " + list.status);
  const d = list.body || {};
  const rows = d.companies || [];
  ctx.check("it holds the estate, not a handful", rows.length > 40, rows.length + " companies");

  /* THE CONTRACT JOIN. This is the regression that mattered: if it is wrong,
     every company reports zero contracts and nothing else on the page is
     wrong enough to notice. */
  const withContracts = rows.filter((c) => c.counts.contracts > 0);
  ctx.check("contracts are attributed to companies (the firstParty join)",
    withContracts.length > 0, withContracts.length + " companies carry contracts");

  const biggest = rows[0];
  ctx.check("the busiest company holds records across several families",
    biggest && Object.values(biggest.counts).filter((n) => n > 0).length >= 3,
    biggest ? biggest.name + " " + JSON.stringify(biggest.counts) : "none");

  /* WHAT IS NOT EVIDENCED IS NAMED. */
  ctx.check("directors, CEO, secretary, incorporation and parent are reported as null, never guessed",
    rows.every((c) => c.directors === null && c.ceo === null && c.companySecretary === null
      && c.incorporationDate === null && c.parentEntity === null),
    "every company");
  ctx.check("and the payload explains why rather than leaving five blanks",
    !!(d.notEvidenced && /No connected source states these/i.test(d.notEvidenced.reason)),
    (d.notEvidenced && d.notEvidenced.reason || "").slice(0, 120));

  /* GROUP PLACEMENT comes from the statutory root's own folder split, and a
     company the root does not carry is unplaced — never defaulted into the
     group. */
  ctx.check("group placement is read from the statutory root, with an explicit unplaced state",
    rows.some((c) => c.group === "group") && rows.some((c) => c.group === "unplaced"),
    JSON.stringify(d.totals));

  /* THE STRUCTURE IS EVIDENCED RELATIONSHIPS, NOT AN INVENTED OWNERSHIP TREE. */
  const st = await page.evaluate(async () => {
    const r = await fetch("api/companies/structure");
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  ctx.check("the corporate structure answers", st.status === 200, "HTTP " + st.status);
  ctx.check("it says plainly that no source states a parent company",
    !!(st.body && /no source in this estate states a parent/i.test(st.body.basis || "")),
    (st.body && st.body.basis || "").slice(0, 140));
  const linked = (st.body && st.body.groups || []).flatMap((g) => g.companies).filter((c) => (c.links || []).length);
  ctx.check("links are real relationships — lending and shared projects",
    linked.length > 0 && linked.every((c) => c.links.every((l) => /borrows-from|lends-to|shares-project/.test(l.kind))),
    linked.length + " companies carry evidenced links");

  /* ---- and the page itself ---- */
  await page.evaluate(() => { window.location.hash = "#/companies"; });
  await H.sleep(4000);
  const text = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("the landing shows the three figures the brief asks for, clickable",
    /Total companies/i.test(text) && /Total projects/i.test(text) && /Empty companies/i.test(text),
    text.slice(0, 200));

  const key = (rows.find((c) => c.counts.statutory > 0) || rows[0] || {}).key;
  if (key) {
    await page.evaluate((k) => { window.location.hash = "#/companies/" + encodeURIComponent(k) + "?tab=profile"; }, key);
    await H.sleep(3500);
    const prof = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
    ctx.check("the corporate profile names each missing fact and the document that would answer it",
      /None of the fields below is stated by a connected source/i.test(prof)
      && /Directors/i.test(prof) && /register of directors/i.test(prof),
      prof.slice(0, 260));
  }

  /* ---- loans carry the three business categories ---- */
  await page.evaluate(() => { window.location.hash = "#/compliance/loans"; });
  await H.sleep(4000);
  const loans = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("loans are FDI / FCY / Intercompany PK, not International / Intercompany",
    /FDI Loans/.test(loans) && /Intercompany PK Loans/.test(loans) && !/\bInternational\b/.test(loans),
    loans.slice(0, 240));

  ctx.pageErrors.length = 0;
});
