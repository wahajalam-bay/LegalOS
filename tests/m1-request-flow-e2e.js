// One request, end to end: raised by the business, routed to the right expert,
// triaged, worked, held, approved under the value threshold, delivered — and
// every pair of hands that touched it belonging to a credentialled person.
//
// MIGRATED 2026-09-18. Isolated sandbox and a real session; the requester is a
// department persona (the old "u14" is on no roster); the build path is read
// from the served page instead of being hardcoded. Authority checks call the
// ENGINE directly on purpose — that is the point of them: the UI hiding a
// button proves nothing if the engine would accept the call.
//
//   node tests/m1-request-flow-e2e.js
const H = require("./_harness.js");

const REQUESTER = "dept-finance";

H.runSuite("m1-request-flow-e2e — one request, raised to delivered", async (ctx) => {
  const { check: ok } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_FLOW_PORT", portFallback: "4866", prefix: "legalos-fl-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const p = await H.asUser(browser, sb, H.USERS.director, ctx);

  const SRC = await p.evaluate(async (base) => {
    const html = await (await fetch(base + "/", { credentials: "include" })).text();
    const m = html.match(/(src-v\d+)\//);
    return m ? m[1] : null;
  }, sb.base);
  ok("the served build is discovered rather than hardcoded", !!SRC, SRC || "not found");

  /* Call a store function by NAME. The app ships a strict CSP without
     'unsafe-eval', so a helper that evaluates a source string cannot run in the
     page at all — and rightly so. Naming the function is clearer anyway. */
  const S = (fn, ...args) => p.evaluate(async ([SRC, name, a]) => {
    const St = await import("/" + SRC + "/store.js");
    if (typeof St[name] !== "function") return { ok: false, error: "store has no function " + name };
    return St[name](...a);
  }, [SRC, fn, args]);

  const readStoreFn = (fn, ...args) => S(fn, ...args);

  const BENCH = await p.evaluate(async (SRC) => (await import("/" + SRC + "/org.js")).ASSIGNABLE_BENCH, SRC);
  const notifsFor = (uid, id) => p.evaluate(([k, u, rid]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.notifs || []).filter((n) => n.forUserId === u && (!rid || (n.title || "").includes(rid)));
  }, [H.STORE_KEY, uid, id]);
  const reqOf = (id) => p.evaluate(([k, rid]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.requests || []).find((r) => r.id === rid) || null;
  }, [H.STORE_KEY, id]);

  /* -------------------------------- 1. raised, routed, acknowledged, flagged */
  const sub = await S("submitLegalRequest", {
    title: "Warehouse staff dismissal dispute", requestType: "New", entityId: "CO-19",
    requesterId: REQUESTER, natureOfMatter: "Labour Matters", subdivision: "Labour/Employment",
    category: "Dispute / Litigation", urgencyBand: "Important",
    description: "Terminated staff threatening tribunal claim.",
  });
  const id = sub.id;
  ok("it is submitted and gets a unique reference", sub.ok && /^REQ-/.test(id || ""), id);
  ok("it is routed to the labour expert, who is on the credential bench",
    sub.owner === H.USERS.litLead.id && BENCH.includes(sub.owner), String(sub.owner));
  ok("the requester is acknowledged", (await notifsFor(REQUESTER, id)).some((n) => /received/i.test(n.title)));
  const litNotes = await notifsFor(H.USERS.litLead.id, id);
  const commNotes = await notifsFor(H.USERS.commLead.id, id);
  ok("the litigation desk is told — and no other team's lead is",
    litNotes.length >= 1 && commNotes.length === 0,
    `litigation ${litNotes.length} · commercial ${commNotes.length}`);

  /* ------------------------------------------------- 2. triage, by its lead */
  const litLead = await H.asUser(browser, sb, H.USERS.litLead, ctx);
  await H.goHash(litLead, "#/triage/" + id);
  const panelText = await H.waitFor(litLead, (rid) => {
    const el = document.querySelector(".triage__panel");
    return el && (el.innerText || "").includes(rid) ? el.innerText : null;
  }, { arg: id, message: "the triage deep-link to select this request", timeout: 15000 }).catch(() => null);
  ok("a deep link opens the queue with THIS request selected", !!panelText);

  await litLead.select(".triage__panel select", H.USERS.litLead.id);
  await litLead.evaluate(() => {
    const b = [...document.querySelectorAll(".triage__panel button")].find((x) => /assign/i.test(x.textContent || ""));
    if (b) b.click();
  });
  const assigned = await H.waitFor(litLead, ([k, rid, owner]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === rid);
    return r && r.owner === owner && r.status === "Assigned" ? r : null;
  }, { arg: [H.STORE_KEY, id, H.USERS.litLead.id], message: "the request to be assigned", timeout: 12000 }).catch(() => null);
  ok("the lead assigns it within their own team", !!assigned, assigned ? assigned.status : "not assigned");

  await H.goHash(litLead, "#/triage");
  const left = await H.waitFor(litLead, (rid) => {
    const el = document.querySelector(".triage__panel");
    return !el || !(el.innerText || "").includes(rid) ? true : null;
  }, { arg: id, message: "the request to leave the triage queue", timeout: 12000 }).catch(() => null);
  ok("it leaves the triage queue once assigned", !!left);

  /* ------------------------------------------- 3. the owner works it forward */
  await H.goHash(litLead, "#/requests");
  const onBoard = await H.waitFor(litLead, (rid) => (document.body.innerText.includes(rid) ? true : null),
    { arg: id, message: "the request to appear on the owner's board", timeout: 12000 }).catch(() => null);
  ok("the owner sees it on their board", !!onBoard);
  await litLead.close();

  await S("advanceRequestStage", id, H.USERS.litLead.id);
  let r = await reqOf(id);
  ok("the owner advances it out of Assigned", r && r.stage !== "Assigned", r ? r.stage : "-");

  await S("holdRequest", id, "business", H.USERS.paralegal.id, "need the termination letter");
  r = await reqOf(id);
  ok("a hold parks the clock with the business", r && r.blockedOn === "business", r ? String(r.blockedOn) : "-");
  ok("the requester is told something is needed from them",
    (await notifsFor(REQUESTER, id)).some((n) => /need something/i.test(n.title)));
  await S("resumeRequest", id, H.USERS.paralegal.id);

  /* The PARALEGAL walks it up to the gate, so the person who asks for sign-off
     and the person who gives it are different people — which is the whole point
     of the round-trip check below. (The system correctly does not notify you of
     your own approval, so a single-actor walk would prove nothing.) */
  let guard = 0;
  while (r && r.stage !== "Approval" && guard++ < 8) {
    await S("advanceRequestStage", id, H.USERS.paralegal.id);
    r = await reqOf(id);
  }
  ok("it reaches the Approval gate", !!r && r.stage === "Approval", r ? r.stage : "-");
  ok("the person who sent it up for sign-off is recorded",
    !!r && r.approvalRequestedBy === H.USERS.paralegal.id,
    r ? String(r.approvalRequestedBy) : "-");

  /* ------------------------- 4. approval authority, enforced by the ENGINE */
  const paraTry = await S("advanceRequestStage", id, H.USERS.paralegal.id);
  ok("the engine blocks a non-approver at Approval — the UI cannot be bypassed",
    paraTry && paraTry.ok === false && /approval requires/i.test(paraTry.error || ""),
    paraTry ? String(paraTry.error) : "it was allowed");

  await S("updateItem", "requests", id, { value: 5000000 });
  const overThreshold = await S("advanceRequestStage", id, H.USERS.litLead.id);
  ok("the engine blocks a Lead above their value threshold",
    overThreshold && overThreshold.ok === false && /Director/i.test(overThreshold.error || ""),
    overThreshold ? String(overThreshold.error) : "it was allowed");
  await S("updateItem", "requests", id, { value: 250000 });

  const approver = await H.asUser(browser, sb, H.USERS.litLead, ctx);
  await H.goHash(approver, "#/requests");
  const panel = await H.waitFor(approver, (rid) => {
    const t = document.body.innerText;
    return /Awaiting my approval/i.test(t) && t.includes(rid) ? t : null;
  }, { arg: id, message: "the approval to appear in the lead's own panel", timeout: 15000 }).catch(() => null);
  ok("the approval sits in the lead's 'Awaiting my approval' panel", !!panel);

  await approver.evaluate((rid) => {
    const row = [...document.querySelectorAll(".myapprovals .docrow")].find((x) => (x.textContent || "").includes(rid));
    if (!row) return;
    const btn = [...row.querySelectorAll("button")].find((x) => /approve/i.test(x.textContent || ""));
    if (btn) btn.click();
  }, id);
  const signedOff = await H.waitFor(approver, ([k, rid]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const x = (s.requests || []).find((y) => y.id === rid);
    return x && x.stage !== "Approval" && x.status !== "Pending Approval" ? x : null;
  }, { arg: [H.STORE_KEY, id], message: "the lead's sign-off to move it past Approval", timeout: 12000 }).catch(() => null);
  ok("a Lead within threshold signs it off", !!signedOff, signedOff ? signedOff.stage : "still at Approval");
  /* Read it from the ASKER's own session, not the approver's. A notification
     that only exists in the browser of the person who raised it has not been
     delivered — which is exactly the bug this check now guards. */
  const asker = await H.asUser(browser, sb, H.USERS.paralegal, ctx);
  const askerNotes = await H.waitFor(asker, ([k, u, rid]) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    const hit = (st.notifs || []).filter((n) => n.forUserId === u && (n.title || "").includes(rid));
    return hit.length ? hit.map((n) => n.title) : null;
  }, { arg: [H.STORE_KEY, H.USERS.paralegal.id, id],
       message: "the approval notification to reach the person who asked for it", timeout: 15000 })
    .catch(() => null);
  ok("whoever sent it up hears the approval came through — in THEIR session",
    !!askerNotes && askerNotes.some((t) => /approved/i.test(t)),
    askerNotes ? askerNotes.join(" | ") : "the asker was never told");
  await asker.close();
  await approver.close();

  /* ------------------------------------------------------ 5. through to delivery */
  guard = 0;
  r = await reqOf(id);
  while (r && r.status !== "Delivered" && guard++ < 8) {
    const step = await S("advanceRequestStage", id, H.USERS.litLead.id);
    if (step && step.ok === false) await S("advanceRequestStage", id, H.USERS.director.id);
    r = await reqOf(id);
  }
  ok("the final stage is Delivered, and it is timestamped",
    !!r && r.status === "Delivered" && !!r.deliveredAt, r ? `${r.status} ${String(r.deliveredAt).slice(0, 10)}` : "-");
  ok("the requester gets the delivery notification",
    (await notifsFor(REQUESTER, id)).some((n) => /delivered/i.test(n.title)));

  /* ------------------------------------------- 6. it leaves the open board */
  await H.goHash(p, "#/requests");
  await H.sleep(900);
  const stillOnBoard = await p.evaluate((rid) =>
    [...document.querySelectorAll(".kanban .kcard")].some((c) => (c.textContent || "").includes(rid)), id);
  ok("a delivered request is off the open board lanes", !stillOnBoard);

  /* --------------------------------- 7. every hand on it was credentialled */
  const rec = await reqOf(id);
  const hands = {
    stageOwners: [...new Set(((rec && rec.stageLog) || []).map((x) => x.owner).filter(Boolean))],
    actors: [...new Set(((rec && rec.activity) || []).map((a) => a.by).filter(Boolean))],
  };
  const legalHands = (hands.stageOwners || []).filter((u) => u !== REQUESTER);
  const legalActors = (hands.actors || []).filter((u) => u !== REQUESTER);
  ok("every legal hand in the stage log belongs to the credential bench",
    legalHands.length > 0 && legalHands.every((u) => BENCH.includes(u)), JSON.stringify(legalHands));
  ok("every actor in the audit trail is credentialled, or the requester",
    legalActors.every((u) => BENCH.includes(u) || u === H.USERS.director.id), JSON.stringify(legalActors));
});
