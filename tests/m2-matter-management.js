// @retired Matters was removed as a concept; the work lives in the Legal Workspace and the module registers (see m51-product-ia, m1-lifecycle)
//
// MODULE 2 — Matter Management, end to end.
//
// RETIRED. A "matter" was a generic container beside the real operational
// modules: the same piece of work filed twice, once as a request and once as a
// matter, under a word that named no source, no register and no owning team.
// The product-integration pass removed it as one of the nine primary areas —
// /matters now lands on the Legal Workspace so no saved link breaks, and there
// is no screen left for this suite to drive.
//
// What it used to prove has not been dropped:
//   • the request/matter record and its lifecycle   → m1-lifecycle.js
//   • privilege and row-level visibility            → m1-security.js,
//                                                     m1-rbac-matrix.js
//   • closure with a recorded outcome               → m54-litigation-model.js
//   • the retired address still resolving           → m51-product-ia.js
//
// The engine was exercised through the SAME live ES module the app runs, and
// the screens were driven for real.
//
// MIGRATED 2026-09-18: isolated sandbox, one real session per persona, the
// current store key, and the build path read from the served page instead of a
// hardcoded /src-vNNN/. Engine calls name the function rather than evaluating a
// source string — the app's CSP forbids eval, and rightly.
//
//   node tests/m2-matter-management.js
const H = require("./_harness.js");

H.runSuite("m2-matter-management — matters, risk, closure and privilege", async (ctx) => {
  const { check: ok } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M2_PORT", portFallback: "4867", prefix: "legalos-m2-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  const director = await H.asUser(browser, sb, H.USERS.director, ctx);
  const SRC = await H.buildDir(director, sb.base);
  ok("the served build is discovered rather than hardcoded", !!SRC, SRC);

  const S = (fn, ...args) => H.appCall(director, SRC, "store.js", fn, ...args);
  const asStore = (page, fn, ...args) => H.appCall(page, SRC, "store.js", fn, ...args);
  const lsGet = (page, sel) => page.evaluate(([k, s]) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    return s.split(".").reduce((o, key) => (o == null ? o : o[key]), st);
  }, [H.STORE_KEY, sel]);

  /* ------------------------------------------------ the register renders */
  await H.goHash(director, "#/matters");
  const regText = await H.waitFor(director, () => (/Matters/.test(document.body.innerText) ? document.body.innerText : null),
    { message: "the matters register to render" });
  ok("the register renders with the seeded matters", /COM-2026-0147/.test(regText));
  ok("it shows practice, status, risk, target and age",
    /Practice/i.test(regText) && /Target/i.test(regText) && /Age/i.test(regText));
  /* The scope toggle is text on the page; the QUEUES are now options on a
     filter control rather than chips, and option text does not appear in
     innerText. Read the control itself — same behaviour, current markup. */
  const scopes = await H.waitFor(director, () => {
    const t = document.body.innerText;
    return /My matters/i.test(t) && /All matters/i.test(t) ? t : null;
  }, { message: "the My Matters / All matters scope toggle", timeout: 12000 }).catch(() => null);
  ok("the My Matters / All matters scope toggle renders", !!scopes);

  /* The queues moved into the register's own filter bar, so their options
     exist only once that filter is opened — which is also the honest way to
     check them: open the control a person would click. */
  const hasQueueFilter = await H.waitFor(director, () => {
    const b = [...document.querySelectorAll(".fltbtn, button")].find((x) => /^\s*Queue/i.test(x.textContent || ""));
    if (!b) return null;
    b.click();
    return true;
  }, { message: "the Queue filter control", timeout: 12000 }).catch(() => null);
  ok("the register offers a Queue filter", !!hasQueueFilter);

  const queues = await H.waitFor(director, () => {
    const opts = [...document.querySelectorAll(".fltpanel")]
      .flatMap((m) => [...m.querySelectorAll("label, button, .menu__item, li, div")])
      .map((o) => (o.textContent || "").trim());
    return opts.some((o) => /needs action/i.test(o)) && opts.some((o) => /awaiting external/i.test(o)) ? opts : null;
  }, { message: "the Queue filter to offer Needs action and Awaiting external", timeout: 12000 }).catch(() => null);
  ok("the queue filter offers Needs action and Awaiting external", !!queues,
    queues ? queues.filter((o) => /needs action|awaiting external|overdue/i.test(o)).join(" · ").slice(0, 80) : "queues not offered");
  ok("a privileged matter is visible to the Director", /DIS-2026-0012/.test(regText));

  /* --------------------------------------------- creation and the id format */
  const created = await S("createMatter", {
    name: "Engine test NDA", practiceArea: "commercial", matterType: "Customer / Service agreement",
    owner: H.USERS.commMember.id, department: "Finance", exposure: 50000,
  }, H.USERS.director.id);
  ok("a matter can be created directly", created && created.ok, created && (created.error || created.id));
  ok("the matter id follows [CODE]-[YEAR]-[SEQ]", /^COM-\d{4}-\d{4}$/.test((created && created.id) || ""), created && created.id);
  const mid = created.id;

  const badType = await S("createMatter", { name: "x", practiceArea: "commercial", matterType: "Litigation", owner: H.USERS.commMember.id }, H.USERS.director.id);
  ok("a matter type must belong to its practice area", badType && badType.ok === false, badType && badType.error);

  /* ---------------------------------------------- the lifecycle state machine */
  const badT = await S("setMatterStatus", mid, "Archived", H.USERS.director.id);
  ok("an invalid transition Open→Archived is blocked", badT.ok === false, badT.error);
  const holdNoReason = await S("setMatterStatus", mid, "On Hold", H.USERS.director.id);
  ok("On Hold without a reason is blocked", holdNoReason.ok === false && /reason/i.test(holdNoReason.error || ""), holdNoReason.error);
  ok("Open→Active is allowed", (await S("setMatterStatus", mid, "Active", H.USERS.director.id)).ok);
  ok("Active→Awaiting External with a reason is allowed",
    (await S("setMatterStatus", mid, "Awaiting External", H.USERS.director.id, "waiting on regulator")).ok);
  ok("Awaiting External→Active is allowed", (await S("setMatterStatus", mid, "Active", H.USERS.director.id)).ok);

  const m1 = await S("matterById", mid);
  const audits = ((m1 && m1.audit) || []).map((a) => a.kind + (a.reason ? ":" + a.reason : ""));
  ok("every transition is audited, with the reason where one was given",
    audits.filter((a) => a.startsWith("status")).length >= 3 && audits.some((a) => a.includes("waiting on regulator")),
    audits.filter((a) => a.startsWith("status")).join(" · ").slice(0, 90));

  /* ------------------------------------------------- the risk matrix */
  const sev = await Promise.all([
    H.appCall(director, SRC, "matters2.js", "riskSeverity", "Likely", "Major"),
    H.appCall(director, SRC, "matters2.js", "riskSeverity", "Almost Certain", "Minor"),
    H.appCall(director, SRC, "matters2.js", "riskSeverity", "Likely", "Critical"),
    H.appCall(director, SRC, "matters2.js", "riskSeverity", "Rare", "Critical"),
    H.appCall(director, SRC, "matters2.js", "riskSeverity", "Possible", "Major"),
  ]);
  ok("the risk matrix matches the PRD §4.6 table",
    sev[0] === "Critical" && sev[1] === "Medium" && sev[2] === "Critical" && sev[3] === "Medium" && sev[4] === "High",
    sev.join(" / "));

  const overrideNoReason = await S("assessMatterRisk", mid, "Likely", "Major", H.USERS.commLead.id);
  ok("overriding the computed risk without a reason is blocked",
    overrideNoReason.ok === false && /override/i.test(overrideNoReason.error || ""), overrideNoReason.error);
  ok("overriding WITH a reason is accepted",
    (await S("assessMatterRisk", mid, "Likely", "Major", H.USERS.commLead.id, "counterparty litigious; exposure understated")).ok);
  const risk = (await S("matterById", mid)).risk2;
  ok("the stored risk is the system-computed severity, with the override recorded",
    risk && risk.severity === "Critical" && risk.proposed === false && risk.override && /litigious/.test(risk.override.reason),
    risk ? `${risk.severity} · proposed=${risk.proposed}` : "no risk");

  /* ------------------------------------------------------------- tasks */
  const noOwner = await S("addMatterTask", mid, { name: "orphan task" }, H.USERS.commMember.id);
  ok("a task with no owner is rejected", noOwner.ok === false, noOwner.error);
  const task = await S("addMatterTask", mid, { name: "Draft first cut", owner: H.USERS.commMember.id, due: new Date(Date.now() + 86400000).toISOString() }, H.USERS.commMember.id);
  ok("a task is created with a single owner", task.ok && task.task.owner === H.USERS.commMember.id);
  await S("setTaskStatus", task.task.id, "Completed", H.USERS.commMember.id);
  const doneTask = await director.evaluate(([k, tid]) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    return (st.matterTasks || []).find((x) => x.id === tid) || null;
  }, [H.STORE_KEY, task.task.id]);
  ok("completing a task stamps when it finished", !!(doneTask && doneTask.completedAt),
    doneTask ? String(doneTask.completedAt).slice(0, 10) : "not completed");

  /* -------------------------------------------------- related matters */
  ok("a matter cannot be linked to itself", (await S("linkMatters", mid, mid, "related", H.USERS.director.id)).ok === false);
  ok("two matters can be linked", (await S("linkMatters", mid, "COM-2026-0147", "same counterparty", H.USERS.director.id)).ok);
  const other = (await S("matterById", "COM-2026-0147")).relatedMatters || [];
  ok("the relationship is bidirectional", other.some((r) => r.id === mid), JSON.stringify(other.map((r) => r.id)));

  /* ----------------------------------------------- closure is outcome-gated */
  const closeEmpty = await S("closeMatter", mid, {}, H.USERS.commMember.id);
  ok("closing without an outcome is blocked, and names what is missing",
    closeEmpty.ok === false && (closeEmpty.missing || []).length >= 2, (closeEmpty.missing || []).join(", "));
  ok("the status route to Closed enforces the same outcome",
    (await S("setMatterStatus", mid, "Closed", H.USERS.commMember.id)).ok === false);
  ok("closing with a valid outcome succeeds",
    (await S("closeMatter", mid, { category: "Completed as requested", positionAchieved: "Substantial", externalCounsel: true, externalCost: 12000, externalCurrency: "USD", lessons: "Standard NDA acceptable." }, H.USERS.commMember.id)).ok);
  const closedM = await S("matterById", mid);
  ok("a closed matter carries its outcome, duration, close date and final risk",
    closedM.status === "Closed" && closedM.outcome && closedM.outcome.durationDays != null && !!closedM.closedAt && closedM.finalRisk === "Critical",
    `${closedM.status} · ${closedM.outcome && closedM.outcome.durationDays}d · ${closedM.finalRisk}`);
  ok("a closed matter cannot be closed twice",
    (await S("closeMatter", mid, { category: "Settled", positionAchieved: "Full" }, H.USERS.commMember.id)).ok === false);
  ok("Closed→Archived is allowed with a reason",
    (await S("setMatterStatus", mid, "Archived", H.USERS.commMember.id, "records retention")).ok);
  ok("an archived matter cannot silently return to active",
    (await S("setMatterStatus", mid, "Active", H.USERS.commMember.id, "x")).ok === false);

  /* ------------------------------------------------ the counterparty master */
  const cp1 = await S("createCounterparty", { legalName: "Zenith Logistics Ltd", jurisdiction: "KSA", relationship: "Supplier" }, H.USERS.director.id);
  const cp2 = await S("createCounterparty", { legalName: "ZENITH Logistics Limited" }, H.USERS.director.id);
  ok("Ltd and Limited resolve to ONE counterparty master record",
    cp1.ok && cp2.ok && cp2.existed === true && cp2.counterparty.id === cp1.counterparty.id,
    cp2 && cp2.counterparty ? cp2.counterparty.id : "no match");

  /* ----------------------------------------------- request → matter */
  /* A request to convert. The store no longer ships seeded demo requests —
     they come from the server — so the fixture is seeded there, with a
     free-text counterparty so the master-resolution below has something to
     resolve. */
  const iso = new Date(2026, 0, 5).toISOString();
  const convCookie = await H.loginApi(sb, H.USERS.director.email);
  await H.seedRequest(sb, convCookie, {
    id: "REQ-CONVERT", title: "Supply agreement — Zenith Logistics", requestType: "New",
    contractType: "Vendor MSA", department: "Procurement", channel: "internal",
    counterparty: "Zenith Logistics Ltd", category: "Contract Drafting / Review",
    proposedCategory: "Contract Drafting / Review", categoryConfirmed: true,
    status: "In Review", stage: "Legal Review", progress: 33, owner: H.USERS.commMember.id,
    requestDate: iso, tat: { days: 5, fixedAt: iso, dueAt: iso, basis: "Vendor MSA × Important" },
    stageLog: [], activity: [],
  });
  // Re-read the queue in this session so the store holds the new fixture.
  await asStore(director, "hydrateRequests");
  const reqId = await H.waitFor(director, (k) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (st.requests || []).find((x) => !x.matterId && x.counterparty && x.counterparty !== "—");
    return r ? r.id : null;
  }, { arg: H.STORE_KEY, message: "a convertible request to reach this session", timeout: 12000 }).catch(() => null);
  ok("there is a request available to convert", !!reqId, reqId || "none found");

  const conv = await S("convertRequestToMatter", reqId, {}, H.USERS.director.id);
  ok("a request converts into a matter", conv.ok && /-2026-/.test(conv.id || ""), conv.id || conv.error);
  const convM = await S("matterById", conv.id);
  ok("the conversion carries the department and the source request id",
    convM.sourceRequestId === reqId && !!convM.department, `${convM.department} · from ${convM.sourceRequestId}`);
  ok("the free-text counterparty is resolved against the master", !!convM.counterpartyId, String(convM.counterpartyId));
  const linkedBack = await director.evaluate(([k, rid]) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    const r = (st.requests || []).find((x) => x.id === rid);
    return r ? r.matterId : null;
  }, [H.STORE_KEY, reqId]);
  ok("the request links back to the matter", linkedBack === conv.id, String(linkedBack));
  const dup = await S("convertRequestToMatter", reqId, {}, H.USERS.director.id);
  ok("converting the same request twice is blocked at the store",
    dup.ok === false && dup.existing === conv.id, dup.error || String(dup.existing));

  /* ---------------------------------------------------- the workspace */
  await H.goHash(director, "#/matters/" + conv.id);
  const wsText = await H.waitFor(director, (cid) => (document.body.innerText.includes(cid) ? document.body.innerText : null),
    { arg: conv.id, message: "the matter workspace to open" });
  ok("the workspace shows the matter, its lawyer and the request it came from",
    /responsible lawyer/i.test(wsText) && new RegExp("from " + reqId).test(wsText));
  ok("the workspace tabs are all present",
    /Tasks/i.test(wsText) && /Documents/i.test(wsText) && /Risk & Privilege/i.test(wsText) && /Timeline/i.test(wsText) && /Outcome/i.test(wsText));
  await director.close();

  /* ------------------------------------------------------- PRIVILEGE */
  const associate = await H.asUser(browser, sb, H.USERS.commMember, ctx);
  await H.goHash(associate, "#/matters");
  const aReg = await H.waitFor(associate, () => (/Matters/.test(document.body.innerText) ? document.body.innerText : null),
    { message: "the register to render for the Associate" });
  ok("a privileged matter is ABSENT from an unauthorised register", !/DIS-2026-0012/.test(aReg));

  await associate.evaluate(() => { window.location.hash = "#/matters/DIS-2026-0012"; });
  await H.sleep(1600);
  const denied = await associate.evaluate(() => document.body.innerText);
  ok("direct URL access to a privileged matter is DENIED",
    /Not found or no access|do not have access/i.test(denied) && !/Orbit Ventures/.test(denied));

  const canSee = await associate.evaluate(async ([SRC, ids]) => {
    const [R, St, D] = await Promise.all([
      import("/" + SRC + "/rbac.js"), import("/" + SRC + "/store.js"), import("/" + SRC + "/data.js"),
    ]);
    const m = St.matterById("DIS-2026-0012");
    const out = {};
    for (const id of ids) out[id] = R.canSee(D.byId(id), m);
    return out;
  }, [SRC, [H.USERS.commMember.id, H.USERS.litLead.id, "u17", "dept-finance"]]);
  ok("the access layer lets the named users in and keeps everyone else out",
    canSee[H.USERS.commMember.id] === false && canSee[H.USERS.litLead.id] === true
    && canSee.u17 === true && canSee["dept-finance"] === false, JSON.stringify(canSee));

  const searchLeak = await associate.evaluate(async ([SRC, uid]) => {
    const [R, St, D] = await Promise.all([
      import("/" + SRC + "/rbac.js"), import("/" + SRC + "/store.js"), import("/" + SRC + "/data.js"),
    ]);
    return R.filterVisible(D.byId(uid), St.getCollection("matters")).some((m) => m.id === "DIS-2026-0012");
  }, [SRC, H.USERS.commMember.id]);
  ok("a privileged matter does not leak through search", searchLeak === false);
  await associate.close();

  const named = await H.asUser(browser, sb, H.USERS.litLead, ctx);
  await H.goHash(named, "#/matters/DIS-2026-0012");
  const namedText = await H.waitFor(named, () => (/Pre-action Legal Notice/i.test(document.body.innerText) ? true : null),
    { message: "the privileged matter to open for a named user", timeout: 15000 }).catch(() => null);
  ok("a named user can open the privileged matter", !!namedText);
  await named.close();

  /* ------------------------------------------------ requester isolation */
  const reqCtx = await browser.createBrowserContext();
  const requester = await reqCtx.newPage();
  await H.enterPortalAs(requester, sb, "Finance", ctx);
  await requester.evaluate(() => { window.location.hash = "#/matters"; });
  await H.sleep(1600);
  const rReg = await requester.evaluate(() => document.body.innerText);
  ok("a requester is locked out of the matters register",
    /internal to the Legal department|Matters are internal|do not have access/i.test(rReg) || !/COM-2026-0147/.test(rReg));

  requester.__expect401 = true;
  await requester.evaluate((cid) => { window.location.hash = "#/matters/" + cid; }, conv.id);
  await H.sleep(1600);
  const rOne = await requester.evaluate(() => document.body.innerText);
  ok("a requester cannot open a matter made from their own request",
    /do not have access|Not found or no access/i.test(rOne) || !/responsible lawyer/i.test(rOne));
  await reqCtx.close();

  /* --------------------------------------------------- creating from the UI */
  const lead = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  await H.goHash(lead, "#/matters");
  await H.waitFor(lead, () => ([...document.querySelectorAll("button")].some((x) => /New matter/i.test(x.textContent || "")) ? true : null),
    { message: "the New matter control" });
  await lead.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /New matter/i.test(x.textContent || ""));
    if (b) b.click();
  });
  await H.waitFor(lead, () => (document.querySelector(".modal input") ? true : null), { message: "the new-matter dialog" });
  await lead.evaluate(() => {
    const inp = document.querySelector(".modal input");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(inp, "UI-created lease review");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await lead.evaluate(() => {
    const b = [...document.querySelectorAll(".modal button")].find((x) => /Create matter/i.test(x.textContent || ""));
    if (b) b.click();
  });
  const uiMatter = await H.waitFor(lead, (k) => {
    const st = JSON.parse(localStorage.getItem(k) || "{}");
    return (st.matters || []).find((m) => (m.name || "").includes("UI-created")) || null;
  }, { arg: H.STORE_KEY, message: "the matter to be created from the screen", timeout: 12000 }).catch(() => null);
  ok("creating a matter from the screen works end to end",
    !!uiMatter && /^COM-\d{4}-\d{4}$/.test(uiMatter.id), uiMatter ? uiMatter.id : "not created");
});
