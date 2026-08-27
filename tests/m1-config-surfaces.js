// §2 config surfaces: requester chat, approval threshold, SLA editor, playbook editor, precedent nav.
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";  // Windows dev default
const BASE = `http://localhost:${process.env.LEGALOS_PORT || "4600"}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function clickText(p, sel, re) { return p.evaluate((sel, re) => { const rx = new RegExp(re, "i"); const el = [...document.querySelectorAll(sel)].find((e) => rx.test(e.textContent || "")); if (el) { el.click(); return true; } return false; }, sel, re.source); }
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }
async function ls(p, path) { return p.evaluate((path) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return path.split(".").reduce((o, k) => (o == null ? o : o[k]), s); }, path); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(500);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(500);
  await p.evaluate(() => {
    const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k));
    const eid = (s.requests[0] && s.requests[0].entityId) || null;
    const iso = new Date(2026, 0, 5).toISOString();
    s.requests.unshift(
      { id: "REQ-CHAT", title: "NDA — chat test", requestType: "New", contractType: "NDA / MoU / LOI", requesterId: "u16",
        department: "Finance", channel: "internal", entityId: eid, category: "Contract Drafting / Review", proposedCategory: "Contract Drafting / Review",
        status: "In Review", stage: "Legal Review", progress: 33, requestDate: iso, tat: { days: 3, fixedAt: iso, dueAt: iso, basis: "x" }, stageLog: [], activity: [] },
      { id: "REQ-BIG", title: "High-value JV — approval gate", requestType: "New", contractType: "Development / JV", requesterId: "u16",
        department: "Finance", channel: "internal", entityId: eid, value: 5000000, currency: "USD", risk: "high",
        category: "Contract Drafting / Review", proposedCategory: "Contract Drafting / Review",
        status: "Pending Approval", stage: "Approval", progress: 62, owner: "u5", requestDate: iso, tat: { days: 5, fixedAt: iso, dueAt: iso, basis: "x" },
        stageLog: [{ stage: "Approval", enteredAt: iso, exitedAt: null, owner: "u5", ballWith: "legal" }], activity: [] },
    );
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(300);

  // (1) requester can reply in-app
  await viewAs(p, "u16"); await go(p, "#/my-requests");
  await p.evaluate(() => { const el = [...document.querySelectorAll(".mreq")].find((c) => /REQ-CHAT/.test(c.textContent)); if (el) el.click(); });
  await wait(700);
  const t = await body(p);
  ok("requester sheet shows in-app Messages", /Messages with Legal/i.test(t));
  ok("requester sheet has a chat input", await p.evaluate(() => !!document.querySelector(".sheet .chatpanel__input textarea")));
  await p.evaluate(() => { const ta = document.querySelector(".sheet .chatpanel__input textarea"); if (ta) { ta.value = "Here is the counterparty's latest paper."; ta.dispatchEvent(new Event("input", { bubbles: true })); } });
  await wait(150);
  await p.evaluate(() => { const bs = [...document.querySelectorAll(".sheet .chatpanel__input button")]; if (bs[0]) bs[0].click(); });
  await wait(400);
  const msgs = await p.evaluate(() => (JSON.parse(localStorage.getItem("legalos-store-v1")).messages || []).filter((m) => m.requestId === "REQ-CHAT"));
  ok("requester's reply is posted to the thread", msgs.some((m) => m.role === "requester" && /counterparty/i.test(m.text)));

  // (2) approval threshold: lead blocked on high value, Director allowed
  await viewAs(p, "u3"); await go(p, "#/workspace/REQ-BIG");
  const leadTxt = await body(p);
  ok("Lead is blocked above threshold (no active approve)", !/Approve & move/i.test(leadTxt) && /threshold/i.test(leadTxt));
  await viewAs(p, "u1"); await go(p, "#/workspace/REQ-BIG");
  ok("Director CAN approve above threshold", /Approve & move to/i.test(await body(p)));

  // (3) SLA matrix editor — Director edits a cell inline
  await viewAs(p, "u1"); await go(p, "#/settings");
  await clickText(p, ".menu__item", /SLA & TAT/); await wait(600);
  ok("SLA matrix editor renders for the Director", /SLA & TAT matrix/i.test(await body(p)) && await p.evaluate(() => !!document.querySelector('input[type=number]')));
  await p.evaluate(() => { const inp = document.querySelector('input[type=number]'); if (inp) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(inp, "9"); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); } });
  await wait(400);
  const ndaEmergency = await ls(p, "slaMatrix.NDA (our template).Emergency");
  ok("editing a cell updates the live SLA matrix", ndaEmergency === 9);

  // (4) playbook editor — Director adds one
  await viewAs(p, "u1"); await go(p, "#/knowledge");
  const before = (await ls(p, "playbooks") || []).length;
  await clickText(p, "button", /Add playbook/); await wait(400);
  await p.evaluate(() => { const ins = [...document.querySelectorAll(".modal input, input")]; if (ins[0]) { ins[0].value = "Sanctions & Export Controls Playbook"; ins[0].dispatchEvent(new Event("input", { bubbles: true })); } });
  await wait(150);
  await clickText(p, "button", /Publish/); await wait(500);
  const after = (await ls(p, "playbooks") || []).length;
  ok("Director can publish a new playbook", after === before + 1);

  // (5) precedent/playbook KB is in the nav for legal
  await viewAs(p, "u5"); await go(p, "#/my-tasks");
  ok("Knowledge Base (Precedents & Playbooks) is in the sidebar", /Precedents & Playbooks/i.test(await body(p)));

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
