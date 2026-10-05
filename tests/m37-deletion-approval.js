// NOTHING LEAVES A REGISTER BECAUSE ONE PERSON DECIDED IT SHOULD.
//
// A deletion is raised with a reason, sits against the record it names, and
// takes effect only when the HEAD of the team that owns that module approves.
// Three controls make that mean something, and this suite exists for them:
//
//   the requester cannot approve their own       — otherwise the approval is a
//                                                  formality performed on
//                                                  oneself
//   a member cannot approve at all               — a register anyone can empty
//                                                  is not a register
//   a lead decides only for their OWN team       — the compliance manager does
//                                                  not clear litigation's book
//
// And the thing that is easiest to get wrong and worst to get wrong: while the
// request is pending, the record is STILL THERE. A screen that hides it early
// has deleted it without approval and merely not written it down.
//
//   node tests/m37-deletion-approval.js
const H = require("./_harness.js");

H.runSuite("a deletion is a request, decided by the head", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M37_PORT", portFallback: "4978", prefix: "legalos-m37-",
  }));
  const browser = await H.openBrowser();

  // The associate raises the record and asks for it to go.
  const member = await H.asUser(browser, sb, H.USERS.litMember.email, ctx);
  const errs = [];
  member.on("pageerror", (e) => errs.push(e.message));

  const made = await member.evaluate(async () => {
    const r = await (await fetch("/api/litigation/module/ip/records", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { markName: "Deletion approval probe", class: "35", status: "Filed" } }),
    })).json();
    return r.record ? r.record.id : "";
  });
  check("a record exists to ask about", /^IPN-/.test(made), made || "not created");

  const post = (page, url, body) => page.evaluate(async (u, b) => {
    const res = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, url, body);

  /* ------------------------------------------- a reason is required ----- */

  const noReason = await post(member, "/api/deletions", { module: "ip", recordId: made, label: "probe" });
  check("a deletion cannot be asked for without a reason", noReason.status === 400,
    "HTTP " + noReason.status + " — " + JSON.stringify(noReason.body.errors || []));

  const raised = await post(member, "/api/deletions",
    { module: "ip", recordId: made, label: "Deletion approval probe", reason: "Raised in error — duplicate" });
  check("with a reason it is raised, and lands as Pending",
    raised.status === 201 && raised.body.request && raised.body.request.status === "Pending",
    "HTTP " + raised.status + " — " + ((raised.body.request || {}).status || JSON.stringify(raised.body.errors || [])));
  const delId = (raised.body.request || {}).id || "";

  check("and it is routed to the team that owns the module",
    (raised.body.request || {}).team === "litigation", (raised.body.request || {}).team);

  /* -------------------------- THE RECORD IS STILL THERE, UNTIL DECIDED -- */

  const stillLive = await member.evaluate(async (id) => {
    const j = await (await fetch("/api/litigation/module/ip/records", { headers: { accept: "application/json" } })).json();
    return (j.records || []).some((r) => r.id === id);
  }, made);
  check("asking does NOT remove it — it is still on the register", stillLive,
    stillLive ? "still there, as it must be" : "GONE before anyone approved");

  const dupe = await post(member, "/api/deletions",
    { module: "ip", recordId: made, label: "probe", reason: "asking twice" });
  check("a second request for the same record is refused", dupe.status === 400,
    "HTTP " + dupe.status);

  /* ------------------------------------------- who may NOT decide ------- */

  const selfApprove = await post(member, "/api/deletions/" + delId + "/decide", { approve: true });
  check("the person who asked cannot approve their own deletion", selfApprove.status === 403,
    "HTTP " + selfApprove.status + " — " + JSON.stringify(selfApprove.body.errors || []));

  const stillLive2 = await member.evaluate(async (id) => {
    const j = await (await fetch("/api/litigation/module/ip/records", { headers: { accept: "application/json" } })).json();
    return (j.records || []).some((r) => r.id === id);
  }, made);
  check("and the refused self-approval changed nothing", stillLive2, "still on the register");

  const wrongLead = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
  const crossTeam = await post(wrongLead, "/api/deletions/" + delId + "/decide", { approve: true });
  check("the head of another team cannot decide it", crossTeam.status === 403,
    "HTTP " + crossTeam.status + " — " + JSON.stringify(crossTeam.body.errors || []));
  try { await wrongLead.close(); } catch (e) { /* done */ }

  /* ------------------------------------------- the head decides --------- */

  const head = await H.asUser(browser, sb, H.USERS.litLead.email, ctx);
  const queue = await head.evaluate(async () =>
    await (await fetch("/api/deletions?status=Pending", { headers: { accept: "application/json" } })).json());
  const mineToDecide = (queue.requests || []).find((r) => r.id === delId);
  check("it appears in the head's queue, marked as theirs to decide",
    !!mineToDecide && mineToDecide.canDecide === true,
    mineToDecide ? "canDecide=" + mineToDecide.canDecide : "not in the queue");
  check("the head can see the reason they are being asked to accept",
    !!mineToDecide && /duplicate/i.test(mineToDecide.reason || ""), (mineToDecide || {}).reason);

  const ok = await post(head, "/api/deletions/" + delId + "/decide", { approve: true });
  check("the head approves it", ok.status === 200 && ok.body.request.status === "Approved",
    "HTTP " + ok.status + " — " + ((ok.body.request || {}).status || JSON.stringify(ok.body.errors || [])));

  const after = await head.evaluate(async (id) => {
    const live = await (await fetch("/api/litigation/module/ip/records", { headers: { accept: "application/json" } })).json();
    const all = await (await fetch("/api/litigation/module/ip/records?deleted=1", { headers: { accept: "application/json" } })).json();
    const kept = (all.records || []).find((r) => r.id === id);
    return {
      live: (live.records || []).some((r) => r.id === id),
      deleted: !!(kept && kept.deletedAt),
      author: kept && kept.createdBy && kept.createdBy.name,
      why: kept && kept.deletionReason,
      audit: kept ? (kept.audit || []).map((a) => a.action).join(",") : "",
    };
  }, made);
  check("NOW it leaves the active register", !after.live, after.live ? "still live" : "gone");
  check("nothing is destroyed — the record, its author and the reason stay on file",
    after.deleted && !!after.author && /duplicate/i.test(after.why || "") && /deleted/.test(after.audit),
    JSON.stringify(after));

  const twice = await post(head, "/api/deletions/" + delId + "/decide", { approve: true });
  check("a decided request cannot be decided again", twice.status === 400, "HTTP " + twice.status);

  /* ------------------------------------------- a refusal keeps it ------- */

  const second = await member.evaluate(async () => {
    const r = await (await fetch("/api/litigation/module/ip/records", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { markName: "Refusal probe", class: "9", status: "Filed" } }),
    })).json();
    return r.record.id;
  });
  const raised2 = await post(member, "/api/deletions",
    { module: "ip", recordId: second, label: "Refusal probe", reason: "not needed" });
  const id2 = raised2.body.request.id;
  const bareRefusal = await post(head, "/api/deletions/" + id2 + "/decide", { approve: false });
  check("a refusal has to say why", bareRefusal.status === 400, "HTTP " + bareRefusal.status);
  const refused = await post(head, "/api/deletions/" + id2 + "/decide",
    { approve: false, note: "This matter is still live — keep it." });
  check("the head can refuse, and the record stays",
    refused.status === 200 && refused.body.request.status === "Rejected",
    (refused.body.request || {}).status);
  const survived = await head.evaluate(async (id) => {
    const j = await (await fetch("/api/litigation/module/ip/records", { headers: { accept: "application/json" } })).json();
    return (j.records || []).some((r) => r.id === id);
  }, second);
  check("a refused deletion leaves the record exactly where it was", survived, "still on the register");

  /* ------------------------------------------- the screen, not the API -- */

  const third = await member.evaluate(async () => {
    const r = await (await fetch("/api/litigation/module/ip/records", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { markName: "Screen probe mark", class: "42", status: "Filed" } }),
    })).json();
    return r.record.id;
  });
  await H.goHash(member, "/m/ip");
  await member.reload({ waitUntil: "networkidle2" });
  await H.sleep(8000);
  const firstRow = await member.evaluate(() => {
    const r = document.querySelector("table.table tbody tr");
    return r ? r.innerText.replace(/\s+/g, " ").trim() : "";
  });
  check("a record raised here is the FIRST row, not the last of 57",
    /Screen probe mark/.test(firstRow), firstRow.slice(0, 70));

  await H.goHash(member, "/m/ip/" + third);
  await member.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  const offers = await member.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  check("its page offers to REQUEST a deletion, not to delete",
    /Request deletion/.test(offers) && !/\bDelete\b(?! )/.test(offers.replace(/Request deletion/g, "")),
    /Request deletion/.test(offers) ? "asks" : "no action offered");

  await member.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Request deletion/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(1600);
  await member.evaluate(() => {
    const ta = document.querySelector(".modal textarea");
    const s = Object.getOwnPropertyDescriptor(ta.constructor.prototype, "value").set;
    s.call(ta, "Screen probe — please remove"); ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await H.sleep(400);
  await member.evaluate(() => {
    const b = [...document.querySelectorAll(".modal .btn")].find((x) => /Send for approval/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(4000);
  await member.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  const marked = await member.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  check("after asking, the page says a decision is pending rather than pretending it went",
    /awaiting the head's approval/i.test(marked), marked.slice(0, 80));

  await H.goHash(head, "/approvals?tab=deletions");
  await head.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  await head.evaluate(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((x) => /Deletion/i.test(x.innerText));
    if (t) t.click();
  });
  await H.sleep(2500);
  const queueText = await head.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  check("the head's Approvals page lists it with the reason and an Approve control",
    /Screen probe mark/.test(queueText) && /please remove/i.test(queueText) && /Approve deletion/.test(queueText),
    /Screen probe mark/.test(queueText) ? "listed" : "absent from the queue");

  /* ------------------------------------------- the approval cannot be skipped */

  const bypass = await member.evaluate(async (id) => {
    const res = await fetch("/api/litigation/module/ip/records/" + id, {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "going round the approval" }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, third);
  check("the old direct-delete endpoint refuses, and says to raise a request",
    bypass.status === 409 && /approval/i.test(JSON.stringify(bypass.body)),
    "HTTP " + bypass.status + " — " + (bypass.body.error || ""));

  const caseBypass = await member.evaluate(async () => {
    const j = await (await fetch("/api/registers/litigation?limit=50", { headers: { accept: "application/json" } })).json();
    const own = (j.records || []).find((r) => r.__origin === "LEGALOS");
    if (!own) return { skipped: true };
    const res = await fetch("/api/litigation/cases/" + own.id + "/delete", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "going round the approval" }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
  check("and so does the case one",
    caseBypass.skipped || (caseBypass.status === 409 && /approval/i.test(JSON.stringify(caseBypass.body))),
    caseBypass.skipped ? "no case raised in app to try it on" : "HTTP " + caseBypass.status);

  const survivedBypass = await member.evaluate(async (id) => {
    const j = await (await fetch("/api/litigation/module/ip/records", { headers: { accept: "application/json" } })).json();
    return (j.records || []).some((r) => r.id === id);
  }, third);
  check("the record the bypass aimed at is untouched", survivedBypass, "still on the register");

  check("no page error", errs.length === 0, errs.slice(0, 3).join(" | "));
  try { await head.close(); } catch (e) { /* done */ }
  await browser.close();
});
