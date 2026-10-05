// Two things a triaged request must do:
//   (1) appear on the module register for its category — the desk that owns it;
//   (2) close the approval loop — whoever sent it up for sign-off is told the
//       decision, rather than having to go and look.
//
// MIGRATED 2026-09-18: isolated sandbox, real sign-in per persona, fixtures
// seeded through the server. The original switched user by writing viewAsId
// into localStorage, so its "the Lead sees it / the Associate does not" claims
// were never tested against a real session.
//
//   node tests/m1-module-sorting.js
const H = require("./_harness.js");

const notifsFor = (page, uid) => page.evaluate(([k, u]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.notifs || []).filter((n) => n.forUserId === u).map((n) => n.title);
}, [H.STORE_KEY, uid]);

const readReq = (page, id) => page.evaluate(([k, rid]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.requests || []).find((r) => r.id === rid) || null;
}, [H.STORE_KEY, id]);

H.runSuite("m1-module-sorting — triaged work reaches its desk, decisions come back", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_MODSORT_PORT", portFallback: "4852", prefix: "legalos-ms-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  const iso = new Date(2026, 0, 5).toISOString();
  const mk = (id, cat, owner, extra) => Object.assign({
    id, title: cat + " item " + id, requestType: "New", contractType: "NDA / MoU / LOI",
    department: "Finance", channel: "internal", risk: "medium", priority: "Medium",
    category: cat, proposedCategory: cat, categoryConfirmed: true, owner,
    status: "In Review", stage: "Legal Review", progress: 33,
    requestDate: iso, tat: { days: 3, fixedAt: iso, dueAt: iso, basis: cat + " × Important" },
    stageLog: [], activity: [],
  }, extra || {});

  const seed = await H.loginApi(sb, H.USERS.director.email);
  await H.seedRequest(sb, seed, mk("REQ-CON", "Contract Drafting / Review", H.USERS.commMember.id));
  await H.seedRequest(sb, seed, mk("REQ-DIS", "Dispute / Litigation", H.USERS.litLead.id));
  await H.seedRequest(sb, seed, mk("REQ-IPX", "IP", H.USERS.litMember.id));
  await H.seedRequest(sb, seed, mk("REQ-APR", "Contract Drafting / Review", H.USERS.commMember.id, {
    status: "Negotiation", stage: "Negotiation", progress: 55,
    stageLog: [{ stage: "Negotiation", enteredAt: iso, exitedAt: null, owner: H.USERS.commMember.id, ballWith: "counterparty" }],
  }));
  check("four triaged requests are seeded across three desks", true, "contracts · dispute · IP · one for approval");

  const seeModule = async (page, hash, want) => {
    await H.goHash(page, hash);
    return H.waitFor(page, (id) => (document.body.innerText.includes(id) ? document.body.innerText : null),
      { arg: want, message: `${want} to appear on ${hash}`, timeout: 15000 }).catch(async () =>
      page.evaluate(() => document.body.innerText));
  };

  /* --------------------------------------- (1) each request reaches its desk */
  const lead = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  const cText = await seeModule(lead, "#/m/contracts", "REQ-CON");
  check("the Contracts desk shows its intake section",
    /From intake — assigned to this desk/i.test(cText));
  check("the contract request appears on the Contracts register", /REQ-CON/.test(cText));
  await lead.close();

  const litLead = await H.asUser(browser, sb, H.USERS.litLead, ctx);
  const dText = await seeModule(litLead, "#/m/cases", "REQ-DIS");
  check("the dispute appears on the Case Handling register", /REQ-DIS/.test(dText));
  const iText = await seeModule(litLead, "#/m/ip", "REQ-IPX");
  check("the IP request appears on the IP Portfolio register", /REQ-IPX/.test(iText));
  await litLead.close();

  /* -------------------------------------------- (2) the approval round-trip */
  const associate = await H.asUser(browser, sb, H.USERS.commMember, ctx);
  await H.goHash(associate, "#/workspace/REQ-APR");
  await H.waitFor(associate, () => (document.body.innerText.includes("REQ-APR") ? true : null),
    { message: "the request to open for its owner" });
  await associate.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /advance to/i.test(x.textContent || ""));
    if (b) b.click();
  });
  const sent = await H.waitFor(associate, ([k]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === "REQ-APR");
    return r && r.stage === "Approval" ? r : null;
  }, { arg: [H.STORE_KEY], message: "the request to reach Approval", timeout: 12000 }).catch(() => null);
  check("the Associate can send their own work up for approval",
    !!sent && sent.stage === "Approval", sent ? sent.stage : "it never advanced");
  check("who asked for approval is recorded on the request",
    !!sent && sent.approvalRequestedBy === H.USERS.commMember.id,
    sent ? String(sent.approvalRequestedBy) : "not recorded");
  await associate.close();

  const approver = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  await H.goHash(approver, "#/workspace/REQ-APR");
  const aText = await H.waitFor(approver, () => (document.body.innerText.includes("REQ-APR") ? document.body.innerText : null),
    { message: "the request to open for the Lead" });
  check("the Lead is offered the approve action", /Approve & move to/i.test(aText));
  await approver.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /approve & move/i.test(x.textContent || ""));
    if (b) b.click();
  });
  const approved = await H.waitFor(approver, ([k]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === "REQ-APR");
    return r && r.stage === "Signature" ? r : null;
  }, { arg: [H.STORE_KEY], message: "the approval to move it to Signature", timeout: 12000 }).catch(() => null);
  check("approval moves it to Signature", !!approved, approved ? approved.stage : "it did not move");

  const backToAsker = await notifsFor(approver, H.USERS.commMember.id);
  check("the decision goes BACK to whoever asked for it",
    backToAsker.some((t) => /approved/i.test(t || "")),
    backToAsker.length ? backToAsker.join(" | ").slice(0, 90) : "nobody was told");
});
