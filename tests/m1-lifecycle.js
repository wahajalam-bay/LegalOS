// Module 1, end to end through the real UI: triage and assignment, the engine
// guards behind it, the full stage walk, escalate / hold / resume, and the rank
// rules that decide which controls each role is offered.
//
// MIGRATED 2026-09-18. The original ran against a shared server with no sign-in
// and switched role by writing `viewAsId` into localStorage — so its rank rules
// (who may reassign, who may only escalate) were asserted against an identity
// the test had handed itself. Each role now signs in. It also imported app
// modules from a hardcoded "/src-v266/" build path, which the next cache bust
// would have broken; the build is read from the page being served.
//
//   node tests/m1-lifecycle.js
const H = require("./_harness.js");

const readRec = (page, id) => page.evaluate(([k, rid]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return (s.requests || []).find((r) => r.id === rid) || (s.matters || []).find((m) => m.id === rid) || null;
}, [H.STORE_KEY, id]);

const clickIn = (page, sel, re) => page.evaluate(([sel, src]) => {
  const rx = new RegExp(src, "i");
  const el = [...document.querySelectorAll(sel)].find((e) => rx.test(e.textContent || ""));
  if (!el) return false; el.click(); return true;
}, [sel, re.source]);

/* THE ESCALATION REASON FIELD, NOT MERELY THE FIRST INPUT ON THE SPINE.
   This used to be `document.querySelector(".spine input, input[type=text]")`,
   which is whatever input comes first in the document. Once the request spine
   gained a REAL file input for attachments (it used to be a prompt() stub), the
   first input on the spine became that file input -- and setting .value on a
   file input is a DOMException that killed the suite mid-run with a message
   about filenames, nothing about escalation. Identify the field by what it
   asks, and never hand back a file/checkbox/radio. */
const REASON_FIELD = `(() => {
  const txt = [...document.querySelectorAll(".spine input, .modal input, input")]
    .filter((i) => ((i.getAttribute("type") || "text").toLowerCase()) === "text");
  return txt.find((i) => /escalat|counterparty threatening|board deadline/i.test(i.placeholder || ""))
    || txt[0] || null;
})()`;

H.runSuite("m1-lifecycle — triage, the stage walk, and who may do what", async (ctx) => {
  const { check: ok } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_LIFECYCLE_PORT", portFallback: "4863", prefix: "legalos-lc-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  /* Untriaged work for the triage queue to hold. The store no longer ships
     seeded demo requests — everything comes from the server now — so a suite
     that wants a triage queue has to put something in it. */
  const isoT = new Date(2026, 0, 5).toISOString();
  const seedCookie = await H.loginApi(sb, H.USERS.director.email);
  for (const id of ["REQ-TRI1", "REQ-TRI2"]) {
    await H.seedRequest(sb, seedCookie, {
      id, title: "Untriaged " + id, requestType: "New", contractType: "NDA / MoU / LOI",
      requesterId: "dept-finance", department: "Finance", channel: "portal",
      risk: "medium", priority: "Medium", status: "New", stage: "Triage", owner: null, progress: 0,
      requestDate: isoT, tat: { days: 3, fixedAt: isoT, dueAt: isoT, basis: "NDA / MoU / LOI × Important" },
      stageLog: [{ stage: "Intake", enteredAt: isoT, exitedAt: isoT, owner: null, ballWith: "business" }],
      activity: [],
    });
  }

  const director = await H.asUser(browser, sb, H.USERS.director, ctx);
  const SRC = await director.evaluate(async (base) => {
    const html = await (await fetch(base + "/", { credentials: "include" })).text();
    const m = html.match(/(src-v\d+)\//);
    return m ? m[1] : null;
  }, sb.base);
  ok("the served build is discovered rather than hardcoded", !!SRC, SRC || "not found");

  /* ------------------------------------------- 1. the triage assignee picker */
  await H.goHash(director, "#/triage");
  await H.waitFor(director, () => (document.querySelector(".triage__panel") ? true : null),
    { message: "the triage panel to render" });

  const picker = await director.evaluate(async (SRC) => {
    const [O, L] = await Promise.all([import("/" + SRC + "/org.js"), import("/" + SRC + "/pages/login.js")]);
    const opts = [...document.querySelectorAll(".triage__panel select option")].map((o) => o.value).filter((v) => v && v.startsWith("u"));
    const credLegal = L.CREDENTIAL_GROUPS.filter((g) => /Legal —/.test(g.section) && !/Leadership/.test(g.section))
      .flatMap((g) => g.people.map((x) => x.id));
    return {
      count: opts.length,
      groups: [...document.querySelectorAll(".triage__panel select optgroup")].length,
      matchesBench: opts.slice().sort().join() === [...O.ASSIGNABLE_BENCH].sort().join(),
      benchIsCredentials: [...O.ASSIGNABLE_BENCH].sort().join() === credLegal.sort().join(),
      hasDirector: opts.includes("u1"),
      hasRetiredDemoIds: ["u2", "u4", "u8", "u9", "u11", "u21", "u22"].some((id) => opts.includes(id)),
    };
  }, SRC);
  ok("the assignee picker is EXACTLY the credentialled bench, grouped by team",
    picker.matchesBench && picker.benchIsCredentials && picker.groups >= 3,
    `${picker.count} people in ${picker.groups} teams`);
  ok("no Director and no retired demo ids can be assigned work",
    !picker.hasDirector && !picker.hasRetiredDemoIds);

  /* ------------------------------------------- 2. assigning clears the queue */
  const triageId = await director.evaluate(() => {
    const el = document.querySelector(".triage__panel");
    const m = ((el && el.innerText) || "").match(/REQ-[\w-]+/);
    return m ? m[0] : null;
  });
  ok("the triage queue holds untriaged work", !!triageId, triageId || "queue empty");

  await director.select(".triage__panel select", H.USERS.litLead.id);
  await clickIn(director, ".triage__panel button", /Assign to/);
  const assigned = await H.waitFor(director, ([k, id, owner]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === id);
    return r && r.owner === owner && r.status === "Assigned" ? r : null;
  }, { arg: [H.STORE_KEY, triageId, H.USERS.litLead.id], message: "the request to be assigned", timeout: 12000 })
    .catch(() => null);
  ok("it is assigned to the chosen team member", !!assigned, assigned ? `${assigned.owner} · ${assigned.status}` : "not assigned");

  await H.goHash(director, "#/triage");
  const gone = await H.waitFor(director, (id) => (document.body.innerText.includes(id) ? null : true),
    { arg: triageId, message: `${triageId} to disappear from the triage queue`, timeout: 12000 }).catch(() => null);
  ok("an assigned request leaves the triage queue", !!gone,
    gone ? "no longer queued" : triageId + " is still listed as untriaged");

  /* ------------------------------ 3. the ENGINE enforces it, not just the UI */
  const litLead = await H.asUser(browser, sb, H.USERS.litLead, ctx);
  await H.goHash(litLead, "#/triage");
  await H.waitFor(litLead, () => (document.querySelector(".triage__panel") ? true : null),
    { message: "the triage panel for the litigation lead" });
  const leadPicker = await litLead.evaluate(() =>
    [...document.querySelectorAll(".triage__panel select option")].map((o) => o.value).filter((v) => v && v.startsWith("u")));
  ok("a Lead's picker holds only their own reportees",
    leadPicker.length > 0 && leadPicker.every((id) => ["u6", "u17", "u18", "u19"].includes(id)),
    leadPicker.join(","));

  // The OTHER seeded request — scraping the panel returns whichever one happens
  // to be on screen, and after the assignment above that may be none.
  const nextId = triageId === "REQ-TRI1" ? "REQ-TRI2" : "REQ-TRI1";
  /* The guard fires on a CHANGE of owner: triageDecision compares the chosen
     owner against the system's own proposal, so naming whoever it already
     proposed is not an override and is correctly waved through. Pick a
     commercial person the proposal did NOT name, so this is a real attempt to
     assign across teams. */
  const crossTeam = await litLead.evaluate(async ([SRC, id]) => {
    const S = await import("/" + SRC + "/store.js");
    const req = (S.getCollection("requests") || []).find((r) => r.id === id);
    if (!req) return { ok: null, error: "fixture " + id + " is not in this session" };
    const proposed = (S.triageProposal(req) || {}).owner;
    const target = ["u3", "u5", "u7"].find((u) => u !== proposed);   // commercial, and a real change
    const res = S.triageDecision(id, { owner: target }, "u6");
    return { proposed, target, ok: res && res.ok, error: res && res.error };
  }, [SRC, nextId]);
  ok("the engine refuses a Lead assigning outside their own team",
    !!crossTeam && crossTeam.ok === false && /own reportees/i.test(crossTeam.error || ""),
    crossTeam ? `${crossTeam.proposed} -> ${crossTeam.target}: ${crossTeam.error || "ALLOWED"}` : "no result");
  await litLead.close();

  /* A reason is now required on every reassignment (§24), and one is supplied
     here so the refusal under test is unambiguously the ACCESS rule and not
     the data-quality one. The guard runs first in the engine for the same
     reason: a security refusal must not be maskable by leaving a field out. */
  const offBench = await director.evaluate(async ([SRC, id]) => {
    const S = await import("/" + SRC + "/store.js");
    return S.reassignRequest(id, "dept-finance", "u1", "probe — should be refused");
  }, [SRC, triageId]);
  ok("the engine refuses assignment to anyone off the credential bench, even for the Director",
    offBench && offBench.ok === false && /credential bench/i.test(offBench.error || ""),
    offBench ? String(offBench.error) : "it was allowed");

  /* AND A REASSIGNMENT WITHOUT A REASON IS REFUSED (§24) — the audit carries
     the old owner, the new owner, who moved it and when; why it moved was the
     one thing nobody could answer three months later. */
  const noReason = await director.evaluate(async ([SRC, id]) => {
    const S = await import("/" + SRC + "/store.js");
    return S.reassignRequest(id, "u5", "u1");
  }, [SRC, triageId]);
  ok("a reassignment with no reason is refused",
    noReason && noReason.ok === false && /reason/i.test(noReason.error || ""),
    noReason ? String(noReason.error) : "it was allowed");

  /* ------------------------------------------ 4. the full stage walk */
  const iso0 = new Date(2026, 0, 5).toISOString();
  const isoDue = new Date(2026, 0, 8).toISOString();
  const cookie = await H.loginApi(sb, H.USERS.commLead.email);
  const mk = (id) => ({
    id, title: "Test NDA " + id, requestType: "New", contractType: "NDA / MoU / LOI",
    requesterId: "dept-finance", department: "Finance", channel: "internal",
    risk: "medium", priority: "Medium", status: "Assigned", stage: "Assigned",
    owner: H.USERS.commLead.id, progress: 0,
    requestDate: iso0, tat: { days: 3, fixedAt: iso0, dueAt: isoDue, basis: "NDA / MoU / LOI × Important" },
    stageLog: [
      { stage: "Intake", enteredAt: iso0, exitedAt: iso0, owner: null, ballWith: "business" },
      { stage: "Triage", enteredAt: iso0, exitedAt: null, owner: H.USERS.commLead.id, ballWith: "legal" },
    ],
    activity: [],
  });
  await H.seedRequest(sb, cookie, mk("REQ-TESTA"));
  await H.seedRequest(sb, cookie, mk("REQ-TESTB"));

  const owner = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  const fresh = await readRec(owner, "REQ-TESTA");
  ok("a freshly assigned request has no matter behind it", !!fresh && !fresh.matterId && fresh.owner === H.USERS.commLead.id,
    fresh ? `owner ${fresh.owner}` : "missing");

  await H.goHash(owner, "#/workspace/REQ-TESTA");
  const wsText = await H.waitFor(owner, () => (document.body.innerText.includes("REQ-TESTA") ? document.body.innerText : null),
    { message: "the request workspace to open" });
  ok("the pipeline controls render for the legal owner", /Move this request/i.test(wsText));

  const seen = [];
  for (let i = 0; i < 9; i++) {
    const moved = await clickIn(owner, "button", /advance to/);
    if (!moved) break;
    await H.sleep(600);
    const r = await readRec(owner, "REQ-TESTA");
    if (r && r.stage && seen[seen.length - 1] !== r.stage) seen.push(r.stage); else break;
  }
  ok("it advances out of triage into Legal Review", seen.includes("Legal Review"), seen.join(" → "));
  ok("it advances into Drafting", seen.includes("Drafting"));
  ok("it advances into Negotiation", seen.includes("Negotiation"));
  ok("it reaches the approval end of the pipeline",
    seen.some((s) => ["Approval", "Signature", "Executed"].includes(s)), seen.join(" → "));
  const walked = await readRec(owner, "REQ-TESTA");
  ok("every move is written into the stage log", !!walked && (walked.stageLog || []).length >= 4,
    walked ? (walked.stageLog || []).length + " entries" : "-");

  /* --------------------------------------- 5. escalate, hold and resume */
  await H.goHash(owner, "#/workspace/REQ-TESTB");
  await H.waitFor(owner, () => (document.body.innerText.includes("REQ-TESTB") ? true : null),
    { message: "the second request to open" });
  await clickIn(owner, "button", /^\s*Escalate/);
  await H.waitFor(owner, (expr) => (eval(expr) ? true : null),
    { arg: REASON_FIELD, message: "the escalation reason field" });
  await owner.evaluate((expr) => {
    const inp = eval(expr);
    if (!inp) throw new Error("the escalation reason field never rendered");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(inp, "counterparty wants to sign Friday");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  }, REASON_FIELD);
  await owner.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /escalate/i.test(x.textContent || "") && (x.className || "").includes("danger"));
    if (b) b.click();
  });
  const esc = await H.waitFor(owner, ([k]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === "REQ-TESTB");
    return r && r.escalated === true ? r : null;
  }, { arg: [H.STORE_KEY], message: "the request to be escalated", timeout: 12000 }).catch(() => null);
  ok("escalating raises the flag and lifts the priority to Urgent",
    !!esc && esc.escalated === true && esc.priority === "Urgent",
    esc ? `escalated=${esc.escalated} priority=${esc.priority}` : "not escalated");

  await clickIn(owner, "button", /put on hold/);
  await H.waitFor(owner, () => (document.querySelector("select") ? true : null), { message: "the hold form" });
  await owner.evaluate(() => {
    const s = [...document.querySelectorAll("select")].find((x) => /waiting on|business/i.test(x.textContent || ""));
    if (s) { s.value = "business"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await owner.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /put on hold/i.test(x.textContent || "") && (x.className || "").includes("primary"));
    if (b) b.click();
  });
  const held = await H.waitFor(owner, ([k]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === "REQ-TESTB");
    return r && r.blockedOn === "business" ? r : null;
  }, { arg: [H.STORE_KEY], message: "the request to go on hold with the business", timeout: 12000 }).catch(() => null);
  ok("a hold parks the clock with the business — the ball leaves legal", !!held,
    held ? `blockedOn=${held.blockedOn}` : "never held");

  await clickIn(owner, "button", /resume/);
  const resumed = await H.waitFor(owner, ([k]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (s.requests || []).find((x) => x.id === "REQ-TESTB");
    return r && !r.blockedOn && r.ballWith === "legal" ? r : null;
  }, { arg: [H.STORE_KEY], message: "the request to resume with legal", timeout: 12000 }).catch(() => null);
  ok("resuming returns the ball to legal", !!resumed, resumed ? `ballWith=${resumed.ballWith}` : "still held");

  /* ------------------------------------------- 6. rank rules (PRD §2) */
  const leadText = await owner.evaluate(() => document.body.innerText);
  ok("a Lead is offered Reassign", /Reassign/i.test(leadText));
  await owner.close();

  const associate = await H.asUser(browser, sb, H.USERS.commMember, ctx);
  await H.goHash(associate, "#/workspace/REQ-TESTB");
  const aText = await H.waitFor(associate, () => (document.body.innerText.includes("REQ-TESTB") ? document.body.innerText : null),
    { message: "the request to open for the Associate" });
  ok("an Associate is NOT offered Reassign", !/Reassign/i.test(aText));
  ok("an Associate can still Escalate to ask for help", /Escalate/i.test(aText));
  await associate.close();

  const paralegal = await H.asUser(browser, sb, H.USERS.paralegal, ctx);
  await H.goHash(paralegal, "#/workspace/REQ-TESTB");
  const pText = await H.waitFor(paralegal, () => (document.body.innerText.includes("REQ-TESTB") ? document.body.innerText : null),
    { message: "the request to open for the paralegal" });
  ok("a Paralegal is NOT offered Reassign", !/Reassign/i.test(pText));
  await paralegal.close();

  /* --------------------------------------- 7. the requester drives nothing */
  const reqCtx = await browser.createBrowserContext();
  const requester = await reqCtx.newPage();
  await H.enterPortalAs(requester, sb, "Finance", ctx);
  /* Do not use goHash here: it waits for the route to BECOME the target, and a
     requester is refused /workspace outright — the guard redirects them. Being
     refused is the stronger outcome, so accept either that or a page with no
     controls on it. */
  await requester.evaluate(() => { window.location.hash = "#/workspace/REQ-TESTB"; });
  await H.sleep(1800);
  const rState = await requester.evaluate(() => ({
    hash: location.hash,
    hasControls: /Move this request/i.test(document.body.innerText),
    refused: /don't have access|no access|not available to you/i.test(document.body.innerText),
  }));
  ok("a requester cannot drive the pipeline — refused, or offered no controls",
    !rState.hasControls,
    rState.refused ? "refused the route outright" : `landed ${rState.hash} with no controls`);
  await reqCtx.close();
});
