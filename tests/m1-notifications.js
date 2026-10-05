// PRD §3.7 — the requester is TOLD what is happening: a status change when
// their request moves, a delivery notice when it completes, and a clear "we
// need something from you" when it goes on hold waiting for them. Plus the
// full-screen detail sheet they read it all in.
//
// MIGRATED 2026-09-18. Legal actions now run in a real signed-in session; the
// requester side enters through the /portal/ door, which is the supported
// requester entry (they are not on the legal roster and hold no credential).
// The original wrote `viewAsId` into localStorage for both, which meant it never
// touched authentication at all.
//
//   node tests/m1-notifications.js
const H = require("./_harness.js");

const DEPT = "Finance";
const DEPT_ID = "dept-finance";

const notifsFor = (page, uid) => page.evaluate(([k, u]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.notifs || []).filter((n) => n.forUserId === u).map((n) => ({ title: n.title, to: n.to }));
}, [H.STORE_KEY, uid]);

const readReq = (page, id) => page.evaluate(([k, rid]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.requests || []).find((r) => r.id === rid) || null;
}, [H.STORE_KEY, id]);

H.runSuite("m1-notifications — the requester is told what is happening", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_NOTIF_PORT", portFallback: "4854", prefix: "legalos-nt-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  const iso = new Date(2026, 0, 5).toISOString();
  const mk = (id) => ({
    id, title: "NDA " + id, requestType: "New", contractType: "NDA / MoU / LOI",
    requesterId: DEPT_ID, department: DEPT, channel: "portal", risk: "medium", priority: "Medium",
    status: "Assigned", stage: "Assigned", owner: H.USERS.commLead.id, progress: 0,
    requesterOption: "We're entering into an agreement with someone",
    requestDate: iso, tat: { days: 3, fixedAt: iso, dueAt: iso, basis: "NDA / MoU / LOI × Important" },
    stageLog: [
      { stage: "Intake", enteredAt: iso, exitedAt: iso, owner: null, ballWith: "business" },
      { stage: "Triage", enteredAt: iso, exitedAt: null, owner: H.USERS.commLead.id, ballWith: "legal" },
    ],
    activity: [],
  });

  const cookie = await H.loginApi(sb, H.USERS.commLead.email);
  for (const id of ["REQ-ADV", "REQ-HOLD", "REQ-DELV"]) await H.seedRequest(sb, cookie, mk(id));
  check("three requests are assigned to legal, raised by a business department", true, DEPT);

  /* ------------------------------------- A) the requester's detail sheet
     The requester raises one through the wizard, which is their real journey.
     A portal requester has no server session in a sandbox — Cloudflare Access
     supplies that in production and a signed CF assertion cannot be forged — so
     this half is the client experience, and the server round-trip is asserted
     from the legal session below. */
  const reqCtx = await browser.createBrowserContext();
  const requester = await reqCtx.newPage();
  await H.enterPortalAs(requester, sb, DEPT, ctx);
  const raised = await H.raiseViaPortal(requester, sb, { title: "Mutual NDA with Orbit before diligence" });
  check("a business user can raise a request through the portal wizard", !!raised, raised);

  await H.goHash(requester, "#/my-requests");
  await H.waitFor(requester, (id) => (document.body.innerText.includes(id) ? true : null),
    { arg: raised, message: "the requester's own request to appear in their list", timeout: 20000 });
  await requester.evaluate((id) => {
    const el = [...document.querySelectorAll(".mreq, .table tbody tr")].find((c) => (c.textContent || "").includes(id));
    if (el) el.click();
  }, raised);
  await H.waitFor(requester, () => (document.querySelector(".sheet") ? true : null),
    { message: "the full-screen detail sheet to open" });
  check("clicking a request opens a full-screen sheet", true);

  const sheetText = await requester.evaluate(() => document.body.innerText);
  check("the sheet shows the whole pipeline and the request details",
    /Pipeline — every step/i.test(sheetText) && /Request details/i.test(sheetText));
  const big = await requester.evaluate(() => {
    const el = document.querySelector(".sheet__panel");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 800 && r.height > 500;
  });
  check("the sheet actually covers the screen rather than being a small dialog", big);
  await requester.evaluate(() => { const b = document.querySelector(".sheet .iconbtn"); if (b) b.click(); });

  /* -------------------------------- B) status change and delivery notices */
  const legal = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  await H.goHash(legal, "#/workspace/REQ-ADV");
  await H.waitFor(legal, () => (document.body.innerText.includes("REQ-ADV") ? true : null),
    { message: "the request to open for its owner" });
  await legal.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /advance to/i.test(x.textContent || ""));
    if (b) b.click();
  });
  const statusNote = await H.waitFor(legal, ([k, u]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const hit = (s.notifs || []).filter((n) => n.forUserId === u).find((n) => /update/i.test(n.title || ""));
    return hit || null;
  }, { arg: [H.STORE_KEY, DEPT_ID], message: "a status-change notification for the requester", timeout: 12000 })
    .catch(() => null);
  check("advancing a request tells the requester it moved",
    !!statusNote, statusNote ? statusNote.title : "no notification raised");
  check("that notification points at the requester's own list",
    !!statusNote && statusNote.to === "/my-requests", statusNote ? String(statusNote.to) : "-");

  // Walk one all the way to the end. Past Approval the control reads
  // "Approve & move", not "Advance to".
  await H.goHash(legal, "#/workspace/REQ-DELV");
  await H.waitFor(legal, () => (document.body.innerText.includes("REQ-DELV") ? true : null),
    { message: "the delivery request to open" });
  for (let i = 0; i < 12; i++) {
    const moved = await legal.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .find((x) => /advance to|approve & move/i.test(x.textContent || "") && !x.disabled);
      if (!b) return false; b.click(); return true;
    });
    if (!moved) break;
    await H.sleep(500);
  }
  const delivered = await readReq(legal, "REQ-DELV");
  check("reaching the final stage marks the request Delivered",
    !!delivered && delivered.status === "Delivered", delivered ? delivered.status : "missing");
  const delivNotes = await notifsFor(legal, DEPT_ID);
  check("a delivery notification reaches the requester",
    delivNotes.some((n) => /delivered/i.test(n.title || "")),
    delivNotes.map((n) => n.title).slice(-3).join(" | ") || "none");

  /* ------------------------------------------ C) "we need something from you" */
  await H.goHash(legal, "#/workspace/REQ-HOLD");
  await H.waitFor(legal, () => (document.body.innerText.includes("REQ-HOLD") ? true : null),
    { message: "the request to put on hold" });
  await legal.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /put on hold/i.test(x.textContent || ""));
    if (b) b.click();
  });
  await H.waitFor(legal, () => (document.querySelector("select") ? true : null), { message: "the hold form" });
  await legal.evaluate(() => {
    const s = [...document.querySelectorAll("select")].find((x) => /waiting on|business/i.test(x.textContent || ""));
    if (s) { s.value = "business"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await legal.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => /put on hold/i.test(x.textContent || "") && (x.className || "").includes("primary"));
    if (b) b.click();
  });
  const holdNote = await H.waitFor(legal, ([k, u]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const hit = (s.notifs || []).filter((n) => n.forUserId === u).find((n) => /need something from you/i.test(n.title || ""));
    return hit || null;
  }, { arg: [H.STORE_KEY, DEPT_ID], message: "a hold notification addressed to the requester", timeout: 12000 })
    .catch(() => null);
  check("putting a request on hold tells the requester what is needed from them",
    !!holdNote, holdNote ? holdNote.title : "the requester was never told");
});
