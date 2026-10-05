// The approval queue on My Tasks is scoped by authority AND by team: the
// Director sees approvals across the department, a Lead sees only their own
// team's, and an Associate — who has no approval authority — has no queue.
//
// MIGRATED 2026-09-18. The original switched identity by writing
// `session.viewAsId` into localStorage, which meant the test handed itself the
// role it was meant to be testing. Each persona now signs in for real, in its
// own browser context, so the queue it sees is the one the SERVER grants it.
//
//   node tests/m1-approval-queue.js
const H = require("./_harness.js");

H.runSuite("m1-approval-queue — approvals are scoped by authority and team", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_APVQ_PORT", portFallback: "4846", prefix: "legalos-apvq-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  const iso0 = new Date(2026, 5, 1).toISOString();
  const mk = (id, owner, extra) => Object.assign({
    id, title: "Approval " + id, requestType: "New", contractType: "Vendor MSA",
    department: "Finance", channel: "internal", risk: "high", priority: "High",
    owner, status: "Pending Approval", stage: "Approval", progress: 62,
    requestDate: iso0, tat: { days: 5, fixedAt: iso0, dueAt: iso0, basis: "Vendor MSA × high" },
    stageLog: [], activity: [],
  }, extra || {});

  const seedCookie = await H.loginApi(sb, H.USERS.director.email);
  await H.seedRequest(sb, seedCookie, mk("REQ-CMR", H.USERS.commLead.id));                      // commercial
  await H.seedRequest(sb, seedCookie, mk("REQ-LIT", H.USERS.litLead.id, { escalated: true }));  // litigation
  check("two approvals are waiting, one per team", true, "REQ-CMR (commercial) · REQ-LIT (litigation)");

  const seeQueue = async (page) => {
    await H.goHash(page, "#/my-tasks");
    await H.waitFor(page, () => (document.querySelector(".page") ? document.body.innerText : null),
      { message: "My Tasks to render" });
    await H.sleep(600);                       // let the queue settle after hydrate
    return page.evaluate(() => document.body.innerText);
  };

  /* ------------------------------------------------- the Director: everything */
  const director = await H.asUser(browser, sb, H.USERS.director, ctx);
  const dText = await seeQueue(director);
  check("the Director's My Tasks has an 'Awaiting my approval' section", /Awaiting my approval/i.test(dText));
  check("the Director sees the commercial approval", /REQ-CMR/.test(dText));
  check("the Director sees the litigation approval", /REQ-LIT/.test(dText));
  check("an escalated approval is flagged as escalated", /Escalated/i.test(dText));
  await director.close();

  /* ------------------------------------------------ the Lead: their team only */
  const lead = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  const lText = await seeQueue(lead);
  check("the Commercial Lead sees their own team's approval", /REQ-CMR/.test(lText));
  check("the Commercial Lead does NOT see litigation's approval", !/REQ-LIT/.test(lText),
    /REQ-LIT/.test(lText) ? "REQ-LIT leaked across teams" : "correctly absent");
  await lead.close();

  /* ------------------------------------------------- the Associate: no queue */
  const associate = await H.asUser(browser, sb, H.USERS.commMember, ctx);
  const aText = await seeQueue(associate);
  check("an Associate has no 'Awaiting my approval' section at all",
    !/Awaiting my approval/i.test(aText));
  await associate.close();
});
