// My Tasks shows OPEN work only — completed and closed requests drop off — and
// an escalation records when it happened, who raised it and why.
//
// MIGRATED 2026-09-18: real sign-in, server-seeded fixtures, bounded waits.
//
//   node tests/m1-mytasks-escalation.js
const H = require("./_harness.js");

H.runSuite("m1-mytasks-escalation — closed work drops off, escalation is dated", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_MYTASKS_PORT", portFallback: "4847", prefix: "legalos-myt-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  const iso0 = new Date(2026, 5, 1).toISOString();
  const base = (id, extra) => Object.assign({
    id, title: "Task " + id, requestType: "New", contractType: "NDA / MoU / LOI",
    department: "HR", channel: "internal", risk: "medium", priority: "High",
    owner: H.USERS.commLead.id, requestDate: iso0,
    tat: { days: 3, fixedAt: iso0, dueAt: iso0, basis: "NDA × medium" }, stageLog: [], activity: [],
  }, extra);

  const cookie = await H.loginApi(sb, H.USERS.commLead.email);
  await H.seedRequest(sb, cookie, base("REQ-OPEN", { status: "In Review", stage: "Legal Review", progress: 33 }));
  await H.seedRequest(sb, cookie, base("REQ-DONE1", { status: "Completed", stage: "Repository", progress: 100 }));
  await H.seedRequest(sb, cookie, base("REQ-DONE2", { status: "Closed", stage: "Repository", progress: 100 }));
  check("one open and two finished requests are assigned to the same person", true,
    "REQ-OPEN open · REQ-DONE1 completed · REQ-DONE2 closed");

  const page = await H.asUser(browser, sb, H.USERS.commLead, ctx);

  /* ------------------------------------------------- finished work drops off */
  await H.goHash(page, "#/my-tasks");
  const t = await H.waitFor(page, () => (document.body.innerText.includes("REQ-OPEN") ? document.body.innerText : null),
    { message: "My Tasks to list the open request" });
  check("the open request assigned to me shows in My Tasks", /REQ-OPEN/.test(t));
  check("a Completed request does NOT show in My Tasks", !/REQ-DONE1/.test(t));
  check("a Closed request does NOT show in My Tasks", !/REQ-DONE2/.test(t));

  /* ----------------------------------------------- escalation records itself */
  await H.goHash(page, "#/workspace/REQ-OPEN");
  await H.waitFor(page, () => (document.body.innerText.includes("REQ-OPEN") ? true : null),
    { message: "the request workspace to open" });

  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^\s*Escalate/i.test(x.textContent || ""));
    if (!b) return false; b.click(); return true;
  });
  check("an Escalate control is offered on an open request", opened);

  /* THE ESCALATION REASON FIELD, NOT MERELY THE FIRST INPUT ON THE SPINE.
     `.spine input` is whatever comes first in the document, and once the spine
     gained a REAL file input for attachments (it was a prompt() stub before)
     that became the file input -- where setting .value is a DOMException about
     filenames that killed the suite with no mention of escalation. Identify the
     field by what it asks for, and never return a file/checkbox/radio.
     m1-lifecycle had the same line and the same failure. */
  const REASON_FIELD = `(() => {
    const txt = [...document.querySelectorAll(".spine input, .modal input, input")]
      .filter((i) => ((i.getAttribute("type") || "text").toLowerCase()) === "text");
    return txt.find((i) => /escalat|counterparty threatening|board deadline|regulator/i.test(i.placeholder || ""))
      || txt[0] || null;
  })()`;
  await H.waitFor(page, (expr) => (eval(expr) ? true : null),
    { arg: REASON_FIELD, message: "the escalation reason field" });
  await page.evaluate((expr) => {
    const inp = eval(expr);
    if (!inp) throw new Error("the escalation reason field never rendered");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(inp, "regulator deadline Friday");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }, REASON_FIELD);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => /escalate/i.test(x.textContent || "") && (x.className || "").includes("danger"))
      || [...document.querySelectorAll(".modal button, .spine button")].reverse()
        .find((x) => /escalate/i.test(x.textContent || ""));
    if (b) b.click();
  });

  /* The notice is ONE line: "Escalated <when> (<date>) by <who> — <why>".
     Matching "Escalated" anywhere in the page would hit the red status PILL
     instead and pass without the timestamp ever rendering — a false green the
     first version of this check walked straight into. */
  const notice = await H.waitFor(page, () => {
    const line = document.body.innerText.split("\n")
      .map((l) => l.trim())
      .find((l) => /^Escalated\b/i.test(l) && /regulator deadline Friday/i.test(l));
    return line || null;
  }, { message: "the escalation notice line (Escalated <when> by <who> — <why>)", timeout: 12000 }).catch(() => null);

  check("the escalation records the reason it was raised for",
    !!notice && /regulator deadline Friday/.test(notice), notice ? notice.slice(0, 90) : "no notice line");
  check("the escalation records WHEN it happened, on the same notice",
    !!notice && /(ago|just now|20\d\d)/i.test(notice),
    notice ? (notice.match(/^Escalated[^(]*\([^)]*\)/i) || [notice])[0].slice(0, 70) : "never escalated");
  check("the escalation records WHO raised it",
    !!notice && /\bby\s+\S/i.test(notice), notice ? (notice.match(/by [^—]+/i) || ["not named"])[0].trim().slice(0, 40) : "-");
});
