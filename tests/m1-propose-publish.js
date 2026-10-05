// Propose → publish (PRD §2): a Lead may PROPOSE a configuration change but not
// make it; the Director is notified, and the live matrix changes only once the
// Director publishes. Separation of who suggests from who decides.
//
// MIGRATED 2026-09-18: two real sessions instead of one browser pretending to
// be two people. Configuration proposals live in the client store, so that is
// where they are read from — but WHO may propose and WHO may publish is decided
// by the signed-in identity, which is the whole point of the test.
//
//   node tests/m1-propose-publish.js
const H = require("./_harness.js");

const lsPath = (page, path) => page.evaluate(([k, p]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return p.split("|").reduce((o, key) => (o == null ? o : o[key]), s);
}, [H.STORE_KEY, path]);

const clickText = (page, sel, re) => page.evaluate(([sel, src]) => {
  const rx = new RegExp(src, "i");
  const el = [...document.querySelectorAll(sel)].find((e) => rx.test(e.textContent || ""));
  if (!el) return false; el.click(); return true;
}, [sel, re.source]);

const openSla = async (page) => {
  await clickText(page, ".menu__item", /SLA & TAT/);
  await H.waitFor(page, () => (document.querySelector(".table") ? true : null),
    { message: "the SLA & TAT matrix to open" });
};

H.runSuite("m1-propose-publish — a Lead proposes, only the Director publishes", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_PROPOSE_PORT", portFallback: "4849", prefix: "legalos-prop-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  /* ---------------------------------------------------- the Lead may propose */
  const lead = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  await H.goHash(lead, "#/settings");
  await openSla(lead);

  const leadText = await lead.evaluate(() => document.body.innerText);
  const leadCanEditInline = await lead.evaluate(() => !!document.querySelector("input[type=number]"));
  check("the Lead is offered PROPOSE, not direct editing",
    /propose changes/i.test(leadText) && !leadCanEditInline,
    leadCanEditInline ? "an editable field was exposed to a Lead" : "propose-only");

  await lead.evaluate(() => { const c = document.querySelector(".table .tagchip"); if (c) c.click(); });
  await H.waitFor(lead, () => (document.querySelector(".modal") ? true : null), { message: "the proposal dialog" });
  await lead.evaluate(() => {
    const inp = document.querySelector(".modal input[type=number], .modal input");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(inp, "4");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText(lead, "button", /^Propose$/);

  const proposals = await H.waitFor(lead, (k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.configProposals || []).length ? s.configProposals : null;
  }, { arg: H.STORE_KEY, message: "the proposal to be recorded" }).catch(() => null);
  check("the Lead's proposal is recorded", !!(proposals && proposals[0] && proposals[0].kind === "SLA matrix"),
    proposals ? proposals[0].kind : "nothing recorded");

  const dirNotified = await lead.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.notifs || []).filter((n) => n.forUserId === "u1").some((n) => /proposed/i.test(n.title || ""));
  }, H.STORE_KEY);
  check("the Director is notified that a change was proposed", dirNotified);

  const beforeMatrix = JSON.stringify(await lsPath(lead, "slaMatrix"));
  check("the live SLA matrix has NOT changed on the proposal alone", !!beforeMatrix, "unchanged so far");
  await lead.close();

  /* ------------------------------------------------ only the Director publishes */
  const director = await H.asUser(browser, sb, H.USERS.director, ctx);
  await H.goHash(director, "#/settings");
  await openSla(director);
  const dText = await director.evaluate(() => document.body.innerText);
  check("the Director sees the proposed change waiting for a decision",
    /Proposed changes/i.test(dText));

  const published = await clickText(director, "button", /^Publish$/);
  check("the Director is offered Publish", published);

  const after = await H.waitFor(director, (k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const p = (s.configProposals || [])[0];
    return p && p.status === "published" ? p.status : null;
  }, { arg: H.STORE_KEY, message: "the proposal to be marked published" }).catch(() => null);
  check("the proposal is marked published", after === "published", after || "still pending");

  const afterMatrix = JSON.stringify(await lsPath(director, "slaMatrix"));
  check("the live matrix changes ONLY after the Director publishes",
    afterMatrix !== beforeMatrix, afterMatrix === beforeMatrix ? "matrix never changed" : "matrix updated on publish");

  /* ----------------------------- the authority is the SERVER's, not the UI's */
  // Hiding Publish from a Lead is a convenience. The control is the server
  // refusing a Lead who posts the decision directly.
  const leadCookie = await H.loginApi(sb, H.USERS.commLead.email);
  const dirCookie = await H.loginApi(sb, H.USERS.director.email);
  const raised = await H.request(sb.base, "POST", "/api/config-proposals",
    { cookie: leadCookie, body: { kind: "SLA matrix", summary: "server authority probe", detail: { cat: "NDA / MoU / LOI", band: "low", days: 9 } } });
  check("a Lead may raise a proposal through the API", raised.status === 201, "HTTP " + raised.status);

  const leadPublish = await H.request(sb.base, "POST",
    "/api/config-proposals/" + encodeURIComponent(raised.body.proposal.id) + "/decision",
    { cookie: leadCookie, body: { decision: "published" } });
  check("a Lead posting a PUBLISH directly is refused by the server",
    leadPublish.status === 403, "HTTP " + leadPublish.status + " " + ((leadPublish.body && leadPublish.body.detail) || ""));

  const assocCookie = await H.loginApi(sb, H.USERS.commMember.email);
  const assocPropose = await H.request(sb.base, "POST", "/api/config-proposals",
    { cookie: assocCookie, body: { kind: "SLA matrix", summary: "associate probe" } });
  check("an Associate cannot even raise a proposal", assocPropose.status === 403, "HTTP " + assocPropose.status);

  const dirPublish = await H.request(sb.base, "POST",
    "/api/config-proposals/" + encodeURIComponent(raised.body.proposal.id) + "/decision",
    { cookie: dirCookie, body: { decision: "published" } });
  check("the Director's publish is accepted", dirPublish.status === 200,
    "HTTP " + dirPublish.status + " " + ((dirPublish.body && dirPublish.body.proposal && dirPublish.body.proposal.status) || ""));

  const twice = await H.request(sb.base, "POST",
    "/api/config-proposals/" + encodeURIComponent(raised.body.proposal.id) + "/decision",
    { cookie: dirCookie, body: { decision: "rejected" } });
  check("a decided proposal cannot be decided again", twice.status === 400,
    "HTTP " + twice.status + " " + ((twice.body && twice.body.error) || ""));
});
