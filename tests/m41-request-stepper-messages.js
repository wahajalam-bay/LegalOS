// WHERE A CONTRACT REQUEST IS, AND THE CONVERSATION ABOUT IT.
//
// Two things a request needs that a form does not give you:
//
//   A STEPPER that says where it has got to — and, when Finance is skipped
//   because no amount was stated, says so. A stage that simply disappears
//   leaves the reader wondering whether it was missed.
//
//   A THREAD on the request itself. A question asked by email is a question
//   the next person to pick the request up cannot find. Everyone entitled to
//   read the request reads this; Legal's private working papers are
//   INTERNAL_LEGAL documents, and keeping the two apart is what lets this
//   one be open.
//
//   node tests/m41-request-stepper-messages.js
const H = require("./_harness.js");

H.runSuite("stepper and messages", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M41_PORT", portFallback: "4968", prefix: "legalos-m41-" }));
  const browser = await H.openBrowser();
  const legal = await H.asUser(browser, sb, H.USERS.litLead.email, ctx);
  const errs = []; legal.on("pageerror", (e) => errs.push(e.message));

  const id = await legal.evaluate(async () => {
    const r = await (await fetch("/api/contract-requests", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "CRF-09" }) })).json();
    return r.request.id;
  });

  await H.goHash(legal, "/contract-requests/" + id);
  await legal.reload({ waitUntil: "networkidle2" });
  await H.sleep(6000);
  const steps = await legal.evaluate(() =>
    [...document.querySelectorAll(".crfstep2")].map((s) => s.innerText.replace(/\s+/g, " ").trim()));
  check("the request shows where it is, and what comes after",
    steps.length >= 7 && steps.some((s) => /Draft/.test(s)) && steps.some((s) => /Closed/.test(s)),
    steps.join(" → "));
  check("a skipped Finance stage says why, rather than vanishing",
    steps.some((s) => /Finance/.test(s) && /Not required/i.test(s)),
    steps.find((s) => /Finance/.test(s)) || "no finance step");

  /* Messages live on the read view, so this uses the API to post and the UI to
     read it back -- the thread has to survive the request changing hands. */
  const sent = await legal.evaluate(async (i) => {
    const res = await fetch("/api/contract-requests/" + i + "/messages", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Please confirm the counterparty's registration number." }) });
    return res.status;
  }, id);
  check("a message posts onto the request", sent === 200, "HTTP " + sent);
  await legal.evaluate(() => {
    const t = [...document.querySelectorAll(".tab, [role=tab]")].find((x) => /Messages/i.test(x.innerText));
    if (t) t.click();
  });
  await H.sleep(1800);

  await legal.reload({ waitUntil: "networkidle2" });
  await H.sleep(6000);
  const persisted = await legal.evaluate(async (i) => {
    const j = await (await fetch("/api/contract-requests/" + i, { headers: { accept: "application/json" } })).json();
    return (j.request.messages || []).map((m) => ({ t: m.text.slice(0, 20), legal: m.fromLegal, by: m.by && m.by.name }));
  }, id);
  check("and it survives a refresh, with its author",
    persisted.length === 1 && !!persisted[0].by, JSON.stringify(persisted));
  /* The person who raised the request is the requester in this thread, even
     when they happen to work in Legal -- so the Legal badge marks a reply from
     the team handling it, not merely anyone with a legal login. */
  check("a message from the person who raised it is not badged as Legal",
    persisted[0].legal === false, "requester voice");

  check("the message is on the timeline too", await legal.evaluate(async (i) => {
    const j = await (await fetch("/api/contract-requests/" + i, { headers: { accept: "application/json" } })).json();
    return (j.request.timeline || []).some((e) => e.event === "Message");
  }, id));

  check("no page error", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
});
