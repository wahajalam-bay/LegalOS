// MODULE 2 — Matter Management: full end-to-end QA (PRD Phases 32/33).
// Engine tests run through the SAME live ES module the app uses (dynamic import
// of /src/store.js inside the page), UI tests drive the real screens.
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";  // Windows dev default
const BASE = `http://localhost:${process.env.LEGALOS_PORT || "4600"}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }
const S = (p, fn, ...args) => p.evaluate(new Function("...args", `return import("/src/store.js").then((S) => (${fn})(S, ...args));`), ...args);

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(600);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(600);

  /* ---------- register + seeds ---------- */
  await viewAs(p, "u1"); await go(p, "#/matters");
  let t = await body(p);
  ok("register renders with seeded Module 2 matters", /COM-2026-0147/.test(t) && /Matters/.test(t));
  ok("register shows practice / status / risk / target / age columns", /Practice/i.test(t) && /Target/i.test(t) && /Age/i.test(t));
  ok("My Matters scope + queue chips render", /My matters/i.test(t) && /Needs action/i.test(t) && /Awaiting external/i.test(t));
  ok("Privileged matter visible to the Director", /DIS-2026-0012/.test(t));
  await p.screenshot({ path: "m2-register.png" });

  /* ---------- matter id + direct create (engine) ---------- */
  const created = await S(p, `(S) => S.createMatter({ name: "Engine test NDA", practiceArea: "commercial", matterType: "Customer / Service agreement", owner: "u5", department: "Finance", exposure: 50000 }, "u1")`);
  ok("direct create returns ok", created && created.ok);
  ok("Matter ID follows [CODE]-[YEAR]-[SEQ]", /^COM-\d{4}-\d{4}$/.test(created.id || ""));
  const badType = await S(p, `(S) => S.createMatter({ name: "x", practiceArea: "commercial", matterType: "Litigation", owner: "u5" }, "u1")`);
  ok("matter type must belong to the practice area", badType && badType.ok === false);
  const mid = created.id;

  /* ---------- lifecycle state machine ---------- */
  const badT = await S(p, `(S, id) => S.setMatterStatus(id, "Archived", "u1")`, mid);
  ok("invalid transition Open→Archived is blocked", badT.ok === false);
  const holdNoReason = await S(p, `(S, id) => S.setMatterStatus(id, "On Hold", "u1")`, mid);
  ok("On Hold without a reason is blocked", holdNoReason.ok === false && /reason/i.test(holdNoReason.error));
  const act = await S(p, `(S, id) => S.setMatterStatus(id, "Active", "u1")`, mid);
  ok("Open→Active allowed", act.ok);
  const ae = await S(p, `(S, id) => S.setMatterStatus(id, "Awaiting External", "u1", "waiting on regulator")`, mid);
  ok("Active→Awaiting External with reason allowed", ae.ok);
  const backActive = await S(p, `(S, id) => S.setMatterStatus(id, "Active", "u1")`, mid);
  ok("Awaiting External→Active allowed", backActive.ok);
  const audits = await S(p, `(S, id) => (S.matterById(id).audit || []).map((a) => a.kind + (a.reason ? ":" + a.reason : ""))`, mid);
  ok("every transition is audited (with reason where given)", audits.filter((a) => a.startsWith("status")).length >= 3 && audits.some((a) => a.includes("waiting on regulator")));

  /* ---------- risk matrix + override ---------- */
  const sev = await p.evaluate(() => import("/src/matters2.js").then((M) => [M.riskSeverity("Likely", "Major"), M.riskSeverity("Almost Certain", "Minor"), M.riskSeverity("Likely", "Critical"), M.riskSeverity("Rare", "Critical"), M.riskSeverity("Possible", "Major")]));
  ok("risk matrix matches Aug-2026 PRD §4.6 (Critical/Medium/Critical/Medium/High)", sev[0] === "Critical" && sev[1] === "Medium" && sev[2] === "Critical" && sev[3] === "Medium" && sev[4] === "High");
  const overrideNoReason = await S(p, `(S, id) => S.assessMatterRisk(id, "Likely", "Major", "u3")`, mid);
  ok("overriding the system proposal without a reason is blocked", overrideNoReason.ok === false && /override/i.test(overrideNoReason.error));
  const overridden = await S(p, `(S, id) => S.assessMatterRisk(id, "Likely", "Major", "u3", "counterparty litigious; exposure understated")`, mid);
  ok("override with reason confirms computed severity", overridden.ok);
  const risk = await S(p, `(S, id) => S.matterById(id).risk2`, mid);
  ok("risk stored as confirmed, severity system-computed (Critical)", risk && risk.severity === "Critical" && risk.proposed === false && risk.override && /litigious/.test(risk.override.reason));

  /* ---------- tasks ---------- */
  const noOwner = await S(p, `(S, id) => S.addMatterTask(id, { name: "orphan task" }, "u5")`, mid);
  ok("a task without an owner is rejected", noOwner.ok === false);
  const task = await S(p, `(S, id) => S.addMatterTask(id, { name: "Draft first cut", owner: "u5", due: new Date(Date.now()+86400000).toISOString() }, "u5")`, mid);
  ok("task created with single owner", task.ok && task.task.owner === "u5");
  await S(p, `(S, tid) => S.setTaskStatus(tid, "Completed", "u5")`, task.task.id);
  const doneTask = await p.evaluate((tid) => JSON.parse(localStorage.getItem("legalos-store-v1")).matterTasks.find((x) => x.id === tid), task.task.id);
  ok("completing a task stamps completedAt (duration system-derived)", !!doneTask.completedAt);

  /* ---------- related matters ---------- */
  const selfLink = await S(p, `(S, id) => S.linkMatters(id, id, "related", "u1")`, mid);
  ok("self-link rejected", selfLink.ok === false);
  const link = await S(p, `(S, id) => S.linkMatters(id, "COM-2026-0147", "same counterparty", "u1")`, mid);
  ok("link created", link.ok);
  const other = await S(p, `(S) => S.matterById("COM-2026-0147").relatedMatters`);
  ok("relationship is bidirectional", other.some((r) => r.id === mid));

  /* ---------- closure: outcome-gated ---------- */
  const closeEmpty = await S(p, `(S, id) => S.closeMatter(id, {}, "u5")`, mid);
  ok("closure without outcome is BLOCKED and names what is missing", closeEmpty.ok === false && (closeEmpty.missing || []).length >= 2);
  const viaStatus = await S(p, `(S, id) => S.setMatterStatus(id, "Closed", "u5")`, mid);
  ok("status route to Closed also enforces the outcome", viaStatus.ok === false);
  const closed = await S(p, `(S, id) => S.closeMatter(id, { category: "Completed as requested", positionAchieved: "Substantial", externalCounsel: true, externalCost: 12000, externalCurrency: "USD", lessons: "Standard NDA acceptable." }, "u5")`, mid);
  ok("closure with a valid outcome succeeds", closed.ok);
  const closedM = await S(p, `(S, id) => S.matterById(id)`, mid);
  ok("closed matter carries outcome + duration + closedAt + final risk", closedM.status === "Closed" && closedM.outcome && closedM.outcome.durationDays != null && !!closedM.closedAt && closedM.finalRisk === "Critical");
  const again = await S(p, `(S, id) => S.closeMatter(id, { category: "Settled", positionAchieved: "Full" }, "u5")`, mid);
  ok("a closed matter cannot be closed again", again.ok === false);
  const arch = await S(p, `(S, id) => S.setMatterStatus(id, "Archived", "u5", "records retention")`, mid);
  ok("Closed→Archived allowed with reason", arch.ok);
  const backFromArchive = await S(p, `(S, id) => S.setMatterStatus(id, "Active", "u5", "x")`, mid);
  ok("archived matter cannot silently return to active", backFromArchive.ok === false);

  /* ---------- counterparty master ---------- */
  const cp1 = await S(p, `(S) => S.createCounterparty({ legalName: "Zenith Logistics Ltd", jurisdiction: "KSA", relationship: "Supplier" }, "u1")`);
  const cp2 = await S(p, `(S) => S.createCounterparty({ legalName: "ZENITH Logistics Limited" }, "u1")`);
  ok("counterparty dedupe: Ltd vs Limited resolves to ONE master record", cp1.ok && cp2.ok && cp2.existed === true && cp2.counterparty.id === cp1.counterparty.id);

  /* ---------- request → matter conversion ---------- */
  const reqId = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("legalos-store-v1")); const r = (s.requests || []).find((x) => !x.matterId && x.counterparty && x.counterparty !== "—"); return r && r.id; });
  const conv = await S(p, `(S, rid) => S.convertRequestToMatter(rid, {}, "u1")`, reqId);
  ok("request converts to a matter", conv.ok && /-2026-/.test(conv.id));
  const convM = await S(p, `(S, id) => S.matterById(id)`, conv.id);
  ok("conversion carries requester/department/context + source request id", convM.sourceRequestId === reqId && !!convM.department);
  ok("conversion resolves free-text counterparty against the MASTER", !!convM.counterpartyId);
  const linked = await p.evaluate((rid) => JSON.parse(localStorage.getItem("legalos-store-v1")).requests.find((r) => r.id === rid).matterId, reqId);
  ok("request links back to the matter", linked === conv.id);
  const dup = await S(p, `(S, rid) => S.convertRequestToMatter(rid, {}, "u1")`, reqId);
  ok("duplicate conversion is BLOCKED at the store", dup.ok === false && dup.existing === conv.id);

  /* ---------- UI: workspace ---------- */
  await go(p, "#/matters/" + conv.id);
  t = await body(p);
  ok("matter workspace shows id/status/owner/source request", t.includes(conv.id) && /responsible lawyer/i.test(t) && new RegExp("from " + reqId).test(t));
  ok("workspace tabs present (tasks/documents/risk/related/timeline/outcome)", /Tasks/i.test(t) && /Documents/i.test(t) && /Risk & Privilege/i.test(t) && /Timeline/i.test(t) && /Outcome/i.test(t));
  await p.screenshot({ path: "m2-workspace.png" });

  /* ---------- PRIVILEGE (Phases 14/32) ---------- */
  // u5 (commercial associate, NOT named) must not see DIS-2026-0012 (Privileged, litigation)
  await viewAs(p, "u5"); await go(p, "#/matters");
  t = await body(p);
  ok("SECURITY: privileged matter ABSENT from unauthorized register", !/DIS-2026-0012/.test(t));
  await go(p, "#/matters/DIS-2026-0012");
  t = await body(p);
  ok("SECURITY: direct URL access to privileged matter DENIED", /Not found or no access/i.test(t) && !/Orbit Ventures/.test(t));
  const canSee5 = await p.evaluate(() => Promise.all([import("/src/rbac.js"), import("/src/store.js"), import("/src/data.js")]).then(([R, S, D]) => {
    const m = S.matterById("DIS-2026-0012");
    return { u5: R.canSee(D.byId("u5"), m), u6: R.canSee(D.byId("u6"), m), u17: R.canSee(D.byId("u17"), m), u16: R.canSee(D.byId("u16"), m) };
  }));
  ok("SECURITY: access layer — named users yes, others no", canSee5.u5 === false && canSee5.u6 === true && canSee5.u17 === true && canSee5.u16 === false);
  // search: the palette source is filterVisible — verify the same gate excludes it
  const searchLeak = await p.evaluate(() => Promise.all([import("/src/rbac.js"), import("/src/store.js"), import("/src/data.js")]).then(([R, S, D]) =>
    R.filterVisible(D.byId("u5"), S.getCollection("matters")).some((m) => m.id === "DIS-2026-0012")));
  ok("SECURITY: privileged matter does NOT appear in search results", searchLeak === false);
  // named user u6 CAN open it
  await viewAs(p, "u6"); await go(p, "#/matters/DIS-2026-0012");
  ok("named user opens the privileged matter", /Pre-action Legal Notice/i.test(await body(p)));

  /* ---------- requester isolation (Phase 23) ---------- */
  await viewAs(p, "u16"); await go(p, "#/matters");
  t = await body(p);
  ok("requester is locked out of the register", /Matters are internal/i.test(t));
  await go(p, "#/matters/" + conv.id);
  ok("requester cannot open a matter converted from their own request", /Not found or no access/i.test(await body(p)));
  const reqSees = await p.evaluate((id) => Promise.all([import("/src/rbac.js"), import("/src/store.js"), import("/src/data.js")]).then(([R, S, D]) => R.canSee(D.byId("u16"), S.matterById(id))), conv.id);
  ok("requester gains no matter visibility via requesterId", reqSees === false);

  /* ---------- UI create (Scenario 2 via screen) ---------- */
  await viewAs(p, "u3"); await go(p, "#/matters");
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /New matter/i.test(x.textContent)); if (b) b.click(); });
  await wait(500);
  await p.evaluate(() => {
    const setVal = (el, v) => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    const inp = document.querySelector(".modal input");
    if (inp) setVal(inp, "UI-created lease review");
  });
  await wait(200);
  await p.evaluate(() => { const b = [...document.querySelectorAll(".modal button")].find((x) => /Create matter/i.test(x.textContent)); if (b) b.click(); });
  await wait(900);
  const uiMatter = await p.evaluate(() => JSON.parse(localStorage.getItem("legalos-store-v1")).matters.find((m) => (m.name || "").includes("UI-created")));
  ok("UI create-matter works end to end", !!uiMatter && /^COM-\d{4}-\d{4}$/.test(uiMatter.id));

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} Module 2 checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
