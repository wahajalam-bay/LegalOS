// PRD compliance fixes: notifications trio, Delivered state, category×priority
// + jurisdiction TAT, full-screen detail sheet, workload owner.
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
async function rec(p, id) { return p.evaluate((id) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return (s.requests || []).find((r) => r.id === id) || (s.matters || []).find((m) => m.id === id) || null; }, id); }
async function notifs(p, forUserId) { return p.evaluate((u) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return (s.notifs || []).filter((n) => n.forUserId === u); }, forUserId); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(500);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(500);

  // Seed matter-free assigned requests for u16 (requester), owner u3, PK + SA jurisdictions.
  await p.evaluate(() => {
    const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k));
    const eid = (s.requests[0] && s.requests[0].entityId) || null;
    const iso = new Date(2026, 0, 5).toISOString();
    const mk = (id, extra) => Object.assign({
      id, title: "NDA " + id, requestType: "New", contractType: "NDA / MoU / LOI",
      requesterId: "u16", requesterEmail: "klaus.werner@zameen.com", department: "Finance",
      channel: "internal", entityId: eid, risk: "medium", priority: "Medium",
      status: "Assigned", stage: "Assigned", owner: "u3", progress: 0,
      requesterOption: "We're entering into an agreement with someone",
      requestDate: iso, tat: { days: 3, fixedAt: iso, dueAt: iso, basis: "x" }, stageLog: [
        { stage: "Intake", enteredAt: iso, exitedAt: iso, owner: "u16", ballWith: "business" },
        { stage: "Triage", enteredAt: iso, exitedAt: null, owner: "u3", ballWith: "legal" },
      ], activity: [],
    }, extra);
    s.requests.unshift(mk("REQ-ADV"), mk("REQ-HOLD"), mk("REQ-DELV"));
    s.notifs = [];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(300);

  // ---- A) Full-screen detail sheet ----
  await viewAs(p, "u16"); await go(p, "#/my-requests");
  await p.evaluate(() => { const el = [...document.querySelectorAll(".mreq, .table tbody tr")].find((c) => /REQ-ADV/.test(c.textContent)); if (el) el.click(); });
  await wait(700);
  const sheet = await p.$(".sheet");
  ok("clicking a request opens a full-screen sheet", !!sheet);
  const st = await body(p);
  ok("sheet shows the full pipeline + details", /Pipeline — every step/i.test(st) && /Request details/i.test(st));
  ok("sheet covers the screen (large panel)", await p.evaluate(() => { const el = document.querySelector(".sheet__panel"); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 800 && r.height > 500; }));
  await p.screenshot({ path: "proto14-sheet.png" });
  await p.evaluate(() => { const b = document.querySelector(".sheet .iconbtn"); if (b) b.click(); }); await wait(300);

  // ---- B) status-change + delivery notifications on advance ----
  await viewAs(p, "u3"); await go(p, "#/workspace/REQ-ADV");
  await clickByText(p, ".spine button", "Advance to"); await wait(700);
  let nx = await notifs(p, "u16");
  ok("advancing fires a status-change notification to the requester", nx.some((n) => /update/i.test(n.title) && n.to === "/my-requests"));

  // walk REQ-DELV all the way → delivery notification + Delivered status
  // (the Approval step's button reads "Approve & move", not "Advance to")
  await go(p, "#/workspace/REQ-DELV");
  for (let i = 0; i < 10; i++) {
    const m = (await clickByText(p, ".spine button", "Advance to")) || (await clickByText(p, ".spine button", "Approve & move"));
    if (!m) break; await wait(550);
  }
  const delv = await rec(p, "REQ-DELV");
  ok("reaching the final stage sets status = Delivered", delv && delv.status === "Delivered");
  nx = await notifs(p, "u16");
  ok("delivery notification sent to the requester", nx.some((n) => /delivered/i.test(n.title)));

  // ---- C) Awaiting-requester hold notification ----
  await go(p, "#/workspace/REQ-HOLD");
  await clickByText(p, ".spine button", "Put on hold"); await wait(350);
  await p.evaluate(() => { const s = [...document.querySelectorAll(".spine select")].find((x) => /Waiting on/i.test(x.textContent)); if (s) { s.value = "business"; s.dispatchEvent(new Event("change", { bubbles: true })); } });
  await wait(150);
  await p.evaluate(() => { const bs = [...document.querySelectorAll(".spine button")].filter((x) => /Put on hold/i.test(x.textContent) && x.classList.contains("btn--primary")); if (bs[0]) bs[0].click(); });
  await wait(600);
  nx = await notifs(p, "u16");
  ok("putting on hold notifies the requester 'we need something from you'", nx.some((n) => /need something from you/i.test(n.title)));

  // (acknowledgement + category×priority TAT via a real wizard submit is covered
  //  by tests/m1-intake-submit.js — kept separate: driving the wizard is flaky here)
  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} compliance checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
