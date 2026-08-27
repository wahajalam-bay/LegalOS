// THE FULL REQUEST FLOW, END TO END — one request driven from submission to
// delivery, with credential integrity asserted at every hand-off:
//   submit → expert + lead notified → triage (deep-link, lead assigns own
//   reportee) → owner's board → advance → hold/resume (TAT pause) → Approval
//   (engine blocks the associate AND above-threshold lead; lead signs off
//   within threshold) → Signature → … → Delivered → requester notified →
//   off the open queues → requester's tracking shows it complete.
// Every owner who ever touches the request must be on the credential bench.
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";  // Windows dev default
const BASE = `http://localhost:${process.env.LEGALOS_PORT || "4600"}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function clickByText(p, sel, text) { return p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent || "").toLowerCase().includes(text.toLowerCase())); if (el) { el.click(); return true; } return false; }, sel, text); }
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }
const S = (p, fn, ...args) => p.evaluate(new Function("...args", `return import("/src-v8/store.js").then((S) => (${fn})(S, ...args));`), ...args);
const reqOf = (p, id) => S(p, `(S, id) => (S.getCollection("requests") || []).find((r) => r.id === id) || null`, id);
const notifsFor = (p, uid, id) => p.evaluate((uid, id) => (JSON.parse(localStorage.getItem("legalos-store-v1")).notifs || []).filter((n) => n.forUserId === uid && (!id || (n.title || "").includes(id))), uid, id);

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1500, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(600);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(600);

  const BENCH = await p.evaluate(() => import("/src-v8/org.js").then((O) => O.ASSIGNABLE_BENCH));

  /* ---- 1) SUBMIT (requester u14) — routed to the labour expert, lead told ---- */
  const sub = await S(p, `(S) => S.submitLegalRequest({ title: "Warehouse staff dismissal dispute", requestType: "New", entityId: "CO-19", requesterId: "u14", natureOfMatter: "Labour Matters", subdivision: "Labour/Employment", category: "Dispute / Litigation", urgencyBand: "Important", description: "Terminated staff threatening tribunal claim." })`);
  const id = sub.id;
  ok("submitted with a unique reference", sub.ok && /^REQ-\d+/.test(id));
  ok("routed to the labour EXPERT on the credential bench (u6 — litigation lead)", sub.owner === "u6" && BENCH.includes(sub.owner));
  ok("requester acknowledged", (await notifsFor(p, "u14", id)).some((n) => /received/i.test(n.title)));
  ok("the litigation desk (u6) notified — and no other team lead", (await notifsFor(p, "u6", id)).length >= 1 && (await notifsFor(p, "u3", id)).length === 0);

  /* ---- 2) TRIAGE (David u6 — the correct lead) ---- */
  await viewAs(p, "u6"); await go(p, "#/triage/" + id);
  ok("deep-link opens the queue with THIS request selected", (await p.evaluate(() => (document.querySelector(".triage__panel") || {}).innerText || "")).includes(id));
  await p.select(".triage__panel select", "u6"); await wait(300);
  await clickByText(p, ".triage__panel button", "Assign"); await wait(700);
  let r = await reqOf(p, id);
  ok("lead assigned within his own team — status Assigned", r.owner === "u6" && r.status === "Assigned");
  ok("it LEFT the triage queue", !(await body(p)).includes(id) || !(await p.evaluate((x) => (document.querySelector(".triage__panel") || { innerText: "" }).innerText.includes(x), id)));

  /* ---- 3) OWNER'S BOARD (u17) + advance the pipeline ---- */
  await viewAs(p, "u6"); await go(p, "#/requests");
  ok("owner sees it on their board (Assigned lane)", (await body(p)).includes(id));
  await go(p, "#/workspace/" + id);
  await clickByText(p, ".spine button", "Advance to"); await wait(600); // → Legal Review
  r = await reqOf(p, id);
  ok("owner advanced Assigned → Legal Review", r.stage === "Legal Review");

  // hold pauses the clock; the requester is asked; resume returns the ball
  await S(p, `(S, id) => S.holdRequest(id, "business", "u10", "need the termination letter")`, id);
  r = await reqOf(p, id);
  ok("hold: ball with the business, clock paused", r.blockedOn === "business");
  ok("requester told 'we need something from you'", (await notifsFor(p, "u14", id)).some((n) => /need something/i.test(n.title)));
  await S(p, `(S, id) => S.resumeRequest(id, "u10")`, id);

  // advance to the Approval gate
  for (const stage of ["Notice Drafting", "Approval"]) {
    await S(p, `(S, id) => S.advanceRequestStage(id, "u10")`, id);
    r = await reqOf(p, id);
  }
  // Termination path: Intake→Triage→Legal Review→Notice Drafting→Approval… walk until Approval
  let guardCount = 0;
  while (r.stage !== "Approval" && guardCount++ < 6) { await S(p, `(S, id) => S.advanceRequestStage(id, "u10")`, id); r = await reqOf(p, id); }
  ok("reached the Approval gate", r.stage === "Approval");

  /* ---- 4) APPROVAL: engine-enforced authority ---- */
  const assocTry = await S(p, `(S, id) => S.advanceRequestStage(id, "u10")`, id);
  ok("ENGINE blocks a non-approver (paralegal) at Approval — no UI bypass possible", assocTry.ok === false && /approval requires/i.test(assocTry.error));
  await S(p, `(S, id) => S.updateItem("requests", id, { value: 5000000 })`, id);
  const leadHighTry = await S(p, `(S, id) => S.advanceRequestStage(id, "u6")`, id);
  ok("ENGINE blocks a lead ABOVE the value threshold", leadHighTry.ok === false && /Director/i.test(leadHighTry.error));
  await S(p, `(S, id) => S.updateItem("requests", id, { value: 250000 })`, id);
  // the lead approves inline from the merged page's approvals panel
  await viewAs(p, "u6"); await go(p, "#/requests");
  const panel = await body(p);
  ok("the approval sits in the lead's 'Awaiting my approval' panel", /Awaiting my approval/i.test(panel) && panel.includes(id));
  await p.evaluate((id) => { const row = [...document.querySelectorAll(".myapprovals .docrow")].find((x) => x.textContent.includes(id)); if (row) { const btn = [...row.querySelectorAll("button")].find((x) => /Approve/i.test(x.textContent)); if (btn) btn.click(); } }, id);
  await wait(700);
  r = await reqOf(p, id);
  ok("lead (within threshold) signed off — moved past Approval", r.stage !== "Approval" && r.status !== "Pending Approval");
  ok("whoever sent it up (u10) hears the approval came through", (await notifsFor(p, "u10", id)).some((n) => /approved/i.test(n.title)));

  /* ---- 5) run to DELIVERY ---- */
  guardCount = 0;
  while (!["Delivered"].includes((r || {}).status) && guardCount++ < 6) {
    const step = await S(p, `(S, id) => S.advanceRequestStage(id, "u10")`, id);
    if (!step.ok) { await S(p, `(S, id) => S.advanceRequestStage(id, "u6")`, id); }
    r = await reqOf(p, id);
  }
  ok("final stage = DELIVERED, with a timestamp", r.status === "Delivered" && !!r.deliveredAt);
  ok("requester gets the delivery notification", (await notifsFor(p, "u14", id)).some((n) => /delivered/i.test(n.title)));

  /* ---- 6) queues + requester tracking ---- */
  await go(p, "#/requests");
  const boardAfter = await p.evaluate((id) => [...document.querySelectorAll(".kanban .kcard")].some((c) => c.textContent.includes(id)), id);
  ok("delivered request is OFF the open board lanes", !boardAfter);
  await viewAs(p, "u14"); await go(p, "#/my-requests");
  const track = await body(p);
  ok("requester's tracking shows it complete", track.includes(id) && /Completed|Delivered/i.test(track));

  /* ---- 7) credential integrity across the WHOLE journey ---- */
  const hands = await S(p, `(S, id) => { const r = (S.getCollection("requests") || []).find((x) => x.id === id); return { stageOwners: [...new Set((r.stageLog || []).map((s) => s.owner).filter(Boolean))], actors: [...new Set((r.activity || []).map((a) => a.by).filter(Boolean))] }; }`, id);
  const legalHands = hands.stageOwners.filter((u) => u !== "u14");
  const legalActors = hands.actors.filter((u) => u !== "u14");
  ok("every LEGAL hand in the stage log is a credentialed bench member", legalHands.length > 0 && legalHands.every((u) => BENCH.includes(u)));
  ok("every actor in the audit trail is credentialed (or the requester)", legalActors.every((u) => BENCH.includes(u) || u === "u1" || u === "u2"));
  console.log("   stage owners:", JSON.stringify(hands.stageOwners), "actors:", JSON.stringify(hands.actors));

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} full-flow checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
