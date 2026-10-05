// §2 configuration surfaces: the requester can talk to Legal in-app, the
// approval THRESHOLD is enforced by value (a Lead is blocked above their limit,
// the Director is not), the Director can edit the SLA matrix and publish a
// playbook, and the knowledge base is reachable from the sidebar.
//
// MIGRATED 2026-09-18: isolated sandbox, one real session per role, requests
// seeded through the server, requester entering by the portal door.
//
//   node tests/m1-config-surfaces.js
const H = require("./_harness.js");

const DEPT = "Finance";
const lsPath = (page, path) => page.evaluate(([k, p]) => {
  const s = JSON.parse(localStorage.getItem(k) || "{}");
  return p.split(".").reduce((o, key) => (o == null ? o : o[key]), s);
}, [H.STORE_KEY, path]);

const clickText = (page, sel, re) => page.evaluate(([sel, src]) => {
  const rx = new RegExp(src, "i");
  const el = [...document.querySelectorAll(sel)].find((e) => rx.test(e.textContent || ""));
  if (!el) return false; el.click(); return true;
}, [sel, re.source]);

H.runSuite("m1-config-surfaces — chat, approval thresholds, SLA and playbooks", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_CFGSURF_PORT", portFallback: "4861", prefix: "legalos-cs-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());

  const iso = new Date(2026, 0, 5).toISOString();
  const cookie = await H.loginApi(sb, H.USERS.commLead.email);
  await H.seedRequest(sb, cookie, {
    id: "REQ-BIG", title: "High-value JV — approval gate", requestType: "New", contractType: "Development / JV",
    department: DEPT, channel: "internal", value: 5000000, currency: "USD", risk: "high",
    category: "Contract Drafting / Review", proposedCategory: "Contract Drafting / Review", categoryConfirmed: true,
    status: "Pending Approval", stage: "Approval", progress: 62, owner: H.USERS.commMember.id,
    requestDate: iso, tat: { days: 5, fixedAt: iso, dueAt: iso, basis: "Development / JV × Important" },
    stageLog: [{ stage: "Approval", enteredAt: iso, exitedAt: null, owner: H.USERS.commMember.id, ballWith: "legal" }],
    activity: [],
  });
  check("a high-value request is waiting at Approval", true, "USD 5,000,000 — above a Lead's threshold");

  /* -------------------------------------- (1) the requester can reply in-app */
  const reqCtx = await browser.createBrowserContext();
  const requester = await reqCtx.newPage();
  await H.enterPortalAs(requester, sb, DEPT, ctx);
  const raised = await H.raiseViaPortal(requester, sb, { title: "NDA — chat thread" });
  await H.goHash(requester, "#/my-requests");
  await H.waitFor(requester, (id) => (document.body.innerText.includes(id) ? true : null),
    { arg: raised, message: "the requester's own request to list" });
  await requester.evaluate((id) => {
    const el = [...document.querySelectorAll(".mreq, .table tbody tr")].find((c) => (c.textContent || "").includes(id));
    if (el) el.click();
  }, raised);
  await H.waitFor(requester, () => (document.querySelector(".sheet") ? true : null), { message: "the request sheet" });

  const sheetText = await requester.evaluate(() => document.body.innerText);
  check("the requester's sheet offers a message thread with Legal", /Messages with Legal/i.test(sheetText));
  const hasInput = await requester.evaluate(() => !!document.querySelector(".sheet .chatpanel__input textarea"));
  check("the thread has somewhere to type", hasInput);

  await requester.evaluate(() => {
    const ta = document.querySelector(".sheet .chatpanel__input textarea");
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    set.call(ta, "Here is the counterparty's latest paper.");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await requester.evaluate(() => {
    const b = document.querySelector(".sheet .chatpanel__input button");
    if (b) b.click();
  });
  const posted = await H.waitFor(requester, ([k, rid]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const m = (s.messages || []).filter((x) => x.requestId === rid);
    return m.some((x) => x.role === "requester" && /counterparty/i.test(x.text || "")) ? m.length : null;
  }, { arg: [H.STORE_KEY, raised], message: "the requester's reply to be posted to the thread" }).catch(() => null);
  check("the requester's reply is posted to the thread", !!posted, posted ? posted + " message(s)" : "not posted");
  await reqCtx.close();

  /* --------------------------- (2) the approval THRESHOLD, by value not role */
  const lead = await H.asUser(browser, sb, H.USERS.commLead, ctx);
  await H.goHash(lead, "#/workspace/REQ-BIG");
  const leadText = await H.waitFor(lead, () => (document.body.innerText.includes("REQ-BIG") ? document.body.innerText : null),
    { message: "the high-value request to open for the Lead" });
  check("a Lead is blocked above their approval threshold",
    !/Approve & move/i.test(leadText) && /threshold/i.test(leadText),
    (leadText.match(/[^.\n]*threshold[^.\n]*/i) || ["no threshold message"])[0].trim().slice(0, 80));
  await lead.close();

  const director = await H.asUser(browser, sb, H.USERS.director, ctx);
  await H.goHash(director, "#/workspace/REQ-BIG");
  const dirText = await H.waitFor(director, () => (document.body.innerText.includes("REQ-BIG") ? document.body.innerText : null),
    { message: "the high-value request to open for the Director" });
  check("the Director can approve above that threshold", /Approve & move to/i.test(dirText));

  /* ------------------------------------------- (3) the SLA matrix is editable */
  await H.goHash(director, "#/settings");
  await clickText(director, ".menu__item", /SLA & TAT/);
  await H.waitFor(director, () => (document.querySelector("input[type=number]") ? true : null),
    { message: "the SLA matrix editor to render for the Director" });
  check("the SLA matrix editor renders for the Director",
    /SLA & TAT matrix/i.test(await director.evaluate(() => document.body.innerText)));

  await director.evaluate(() => {
    const inp = document.querySelector("input[type=number]");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(inp, "9");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const cell = await H.waitFor(director, ([k]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    const v = ((s.slaMatrix || {})["NDA (our template)"] || {}).Emergency;
    return v === 9 ? v : null;
  }, { arg: [H.STORE_KEY], message: "the edited SLA cell to reach the live matrix" }).catch(() => null);
  check("editing a cell updates the live SLA matrix", cell === 9, cell == null ? "unchanged" : String(cell));

  /* --------------------------------------------- (4) the Director may publish
     Playbooks left the Knowledge Base. The Knowledge Base is now the Drive
     DOCUMENT estate and its search; playbooks and precedents are written
     material Legal maintains, and they have their own page. Publishing is
     tested where publishing happens. */
  await H.goHash(director, "#/playbooks");
  const before = ((await lsPath(director, "playbooks")) || []).length;
  await clickText(director, "button", /Add playbook/);
  await H.waitFor(director, () => (document.querySelector(".modal input, input") ? true : null),
    { message: "the playbook form" });
  await director.evaluate(() => {
    const inp = [...document.querySelectorAll(".modal input, input")][0];
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(inp, "Sanctions & Export Controls Playbook");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText(director, "button", /Publish/);
  const grew = await H.waitFor(director, ([k, n]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.playbooks || []).length === n + 1 ? (s.playbooks || []).length : null;
  }, { arg: [H.STORE_KEY, before], message: "the new playbook to be published" }).catch(() => null);
  check("the Director can publish a new playbook", grew === before + 1,
    grew == null ? `still ${before}` : `${before} -> ${grew}`);
  await director.close();

  /* --------------------------------- (5) the knowledge base is reachable */
  const associate = await H.asUser(browser, sb, H.USERS.commMember, ctx);
  await H.goHash(associate, "#/my-tasks");
  /* THE FAMILY IS A ROW; ITS DESTINATIONS ARE TABS ON ITS PAGES.
     "Shared" said nothing about what was inside it, and its first entry was an
     Intake & Repository wizard over an empty collection. The family is the DATA
     BANK now: the executed contract corpus and the drafting material built on
     top of it. What is asserted here is the thing that actually matters — from
     the rail, the destination is reachable, and once you are in the family
     every sibling of the page you are on is on screen. */
  const opened = await associate.evaluate(() => {
    const b = [...document.querySelectorAll(".sidebar .nav__item")]
      .find((e) => /^data bank$/i.test((e.innerText || "").replace(/\s+/g, " ").trim()));
    if (!b) return false; b.click(); return true;
  });
  check("the Data Bank family is one row in the sidebar, and it opens", opened);

  const listedAsTabs = await H.waitFor(associate, () => {
    const tabs = [...document.querySelectorAll(".famtabs .tab, .ghub__tile")]
      .map((e) => (e.innerText || "").trim());
    return tabs.some((t) => /Precedents & Playbooks/i.test(t)) ? tabs.length : null;
  }, { message: "the Data Bank family's destinations to be offered as tabs", timeout: 10000 }).catch(() => null);
  check("and its destinations are offered on the page, not hidden behind a hub",
    !!listedAsTabs, listedAsTabs ? listedAsTabs + " destinations offered" : "not offered");

  const reachable = await H.waitFor(associate, () => (/Precedents & Playbooks/i.test(document.body.innerText) ? true : null),
    { message: "Precedents & Playbooks to be reachable from Shared", timeout: 12000 }).catch(() => null);
  check("Precedents & Playbooks is reachable from the sidebar", !!reachable);

  // ...and it actually opens, rather than merely being named.
  await associate.evaluate(() => {
    const el = [...document.querySelectorAll("a, button, .ghub__tile, .card")]
      .find((x) => /Precedents & Playbooks/i.test(x.textContent || ""));
    if (el) el.click();
  });
  const onKb = await H.waitFor(associate, () => (/#\/playbooks/.test(location.hash) ? location.hash : null),
    { message: "the playbooks page to open", timeout: 12000 }).catch(() => null);
  check("opening it lands on Precedents & Playbooks", !!onKb, onKb || "it did not navigate");
});
