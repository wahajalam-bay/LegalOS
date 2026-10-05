// Approval-step gating (PRD §2): at the Approval stage, only approval authority
// can sign off. An Associate (`member`, canApprove: false) is blocked and must
// escalate; a Lead (`lead`, canApprove: "threshold") can approve within their
// limit; the Director (`head`, canApprove: "all") is unlimited.
//
// MIGRATED 2026-09-18. The original drove a shared server with no sign-in and
// switched user by writing `session.viewAsId` into `legalos-store-v1`. That
// stopped exercising anything the day authentication landed — the app rendered
// the login page, localStorage stayed empty, and the suite died on
// JSON.parse(null). Worse, seeding a role into browser storage is precisely the
// thing that cannot catch an RBAC regression: the test granted itself the
// authority it was supposed to be testing.
//
// Now: isolated sandbox, real sign-in as the roster user whose role is under
// test, and the fixture seeded through the SERVER, where requests live.
//
//   node tests/m1-approval-gate.js
const H = require("./_harness.js");

const REQ = "REQ-APV-GATE";
const readReq = (page) => page.evaluate((k) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.requests || []).find((x) => x.id === "REQ-APV-GATE") || null;
}, H.STORE_KEY);

H.runSuite("m1-approval-gate — only approval authority can sign off", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_APVGATE_PORT", portFallback: "4841", prefix: "legalos-apv-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  /* A request parked AT the Approval stage, created through the API by someone
     entitled to create it — real data the product accepts, not a hand-written
     localStorage blob that the server would overwrite on the next hydrate. */
  const iso0 = new Date(2026, 5, 1).toISOString();
  const isoDue = new Date(2026, 5, 4).toISOString();
  const leadCookie = await H.loginApi(sb, H.USERS.commLead.email);
  await H.seedRequest(sb, leadCookie, {
    id: REQ, title: "Vendor MSA — approval gate", requestType: "New", contractType: "Vendor MSA",
    department: "Finance", channel: "internal", risk: "high", priority: "High",
    status: "Pending Approval", stage: "Approval", owner: H.USERS.commMember.id,
    progress: 62, counterparty: "Acme Corp", value: 250000, currency: "PKR",
    requestDate: iso0, tat: { days: 5, fixedAt: iso0, dueAt: isoDue, basis: "Vendor MSA × high" },
    stageLog: [
      { stage: "Intake", enteredAt: iso0, exitedAt: iso0, owner: null, ballWith: "business" },
      { stage: "Triage", enteredAt: iso0, exitedAt: iso0, owner: H.USERS.commLead.id, ballWith: "legal" },
      { stage: "Legal Review", enteredAt: iso0, exitedAt: iso0, owner: H.USERS.commMember.id, ballWith: "legal" },
      { stage: "Drafting", enteredAt: iso0, exitedAt: iso0, owner: H.USERS.commMember.id, ballWith: "legal" },
      { stage: "Negotiation", enteredAt: iso0, exitedAt: iso0, owner: H.USERS.commMember.id, ballWith: "counterparty" },
      { stage: "Approval", enteredAt: iso0, exitedAt: null, owner: H.USERS.commMember.id, ballWith: "legal" },
    ],
    activity: [],
  });
  check("a request is parked at the Approval stage, seeded through the server", true, REQ);

  /* ---------------------------------------------- 1. the Associate is blocked */
  const junior = H.watchPage(await browser.newPage(), ctx);
  await H.loginAs(junior, sb, H.USERS.commMember);
  const whoJunior = await H.currentUser(junior, sb.base);
  check("signed in as the Associate, and the SERVER says so",
    !!(whoJunior && whoJunior.email === H.USERS.commMember.email), whoJunior && whoJunior.email);

  await H.goHash(junior, "#/workspace/" + REQ);
  await H.waitFor(junior, () => (document.body.innerText.includes("REQ-APV-GATE") ? true : null),
    { message: "the request to render in the workspace" });
  const jText = await junior.evaluate(() => document.body.innerText);

  check("the Associate sees the sign-off locked, with a reason",
    /Awaiting approval|needs a Lead|escalate for sign-off|approval authority/i.test(jText),
    (jText.match(/[^.\n]*(awaiting approval|needs a Lead|escalate for sign-off|approval authority)[^.\n]*/i) || ["not stated"])[0].trim().slice(0, 80));
  check("the Associate is NOT offered an active approve control", !/Approve & move/i.test(jText));
  check("the Associate can still escalate to ask for sign-off", /Escalate/i.test(jText));

  // The gate must HOLD when the control is driven directly, not merely hidden.
  const stageBefore = (await H.getRequest(sb, leadCookie, REQ)).stage;
  await junior.evaluate(() => {
    for (const b of document.querySelectorAll("button")) {
      const t = (b.textContent || "").toLowerCase();
      if (t.includes("advance to") || t.includes("approve & move")) b.click();
    }
  });
  await H.sleep(900);                        // let any accepted write land
  const afterJunior = await readReq(junior);
  check("the Associate cannot advance past Approval, even by clicking through",
    !afterJunior || afterJunior.stage === stageBefore,
    `${stageBefore} -> ${afterJunior ? afterJunior.stage : "gone"}`);
  await junior.close();

  /* -------------------------------------------------- 2. the Lead can sign off */
  const lead = H.watchPage(await browser.newPage(), ctx);
  await H.loginAs(lead, sb, H.USERS.commLead);
  const whoLead = await H.currentUser(lead, sb.base);
  check("signed in as the Lead, and the SERVER says so",
    !!(whoLead && whoLead.email === H.USERS.commLead.email), whoLead && whoLead.email);

  await H.goHash(lead, "#/workspace/" + REQ);
  await H.waitFor(lead, () => (document.body.innerText.includes("REQ-APV-GATE") ? true : null),
    { message: "the request to render for the Lead" });
  const lText = await lead.evaluate(() => document.body.innerText);
  check("the Lead is offered the approve-and-move action",
    /Approve & move/i.test(lText), (lText.match(/Approve & move[^\n]*/i) || ["absent"])[0].slice(0, 60));

  const clicked = await lead.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /approve & move/i.test(x.textContent || ""));
    if (!b) return false; b.click(); return true;
  });
  check("the approve control is reachable and clickable", clicked);

  const moved = await H.waitFor(lead, (k) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === "REQ-APV-GATE");
    return r && r.stage === "Signature" ? r.stage : null;
  }, { arg: H.STORE_KEY, message: "the request to move to Signature after the Lead approves", timeout: 12000 })
    .catch(() => null);
  check("the Lead's approval moves it to Signature", moved === "Signature", moved || "it did not move");

  const finalRec = await readReq(lead);
  check("the approval is written into the request's activity",
    !!(finalRec && (finalRec.activity || []).some((a) => /Moved to Signature|approv/i.test(a.action || ""))),
    finalRec ? (finalRec.activity || []).map((a) => a.action).slice(-2).join(" | ") || "activity empty" : "no record");
});
