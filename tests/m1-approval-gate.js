// Approval-step gating (PRD §2): at the Approval stage, only approval authority
// (Lead within threshold / Director) can sign off; juniors are blocked and must
// escalate.
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
async function rec(p, id) { return p.evaluate((id) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return (s.requests || []).find((r) => r.id === id) || null; }, id); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(500);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(500);
  // seed a matter-free request sitting AT the Approval stage
  await p.evaluate(() => {
    const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k));
    const eid = (s.requests[0] && s.requests[0].entityId) || null;
    const iso0 = new Date(2026, 5, 1).toISOString(); const isoDue = new Date(2026, 5, 4).toISOString();
    s.requests.unshift({
      id: "REQ-APV", title: "Vendor MSA — approval gate demo", requestType: "New", contractType: "Vendor MSA",
      requesterId: "u16", department: "Finance", channel: "internal", entityId: eid, risk: "high", priority: "High",
      status: "Pending Approval", stage: "Approval", owner: "u5", progress: 62, counterparty: "Acme Corp",
      requestDate: iso0, tat: { days: 5, fixedAt: iso0, dueAt: isoDue, basis: "Vendor MSA × high" },
      stageLog: [
        { stage: "Intake", enteredAt: iso0, exitedAt: iso0, owner: "u16", ballWith: "business" },
        { stage: "Triage", enteredAt: iso0, exitedAt: iso0, owner: "u3", ballWith: "legal" },
        { stage: "Legal Review", enteredAt: iso0, exitedAt: iso0, owner: "u5", ballWith: "legal" },
        { stage: "Drafting", enteredAt: iso0, exitedAt: iso0, owner: "u5", ballWith: "legal" },
        { stage: "Negotiation", enteredAt: iso0, exitedAt: iso0, owner: "u5", ballWith: "counterparty" },
        { stage: "Approval", enteredAt: iso0, exitedAt: null, owner: "u5", ballWith: "legal" },
      ], activity: [],
    });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(400);

  // Associate (u5, member — no approval authority): blocked
  await viewAs(p, "u5"); await go(p, "#/workspace/REQ-APV");
  let t = await body(p);
  ok("junior at Approval sees the locked sign-off (cannot approve)", /Awaiting approval|needs a Lead|escalate for sign-off/i.test(t));
  ok("junior does NOT see an active 'Approve & move' button", !/Approve & move/i.test(t));
  ok("junior still has Escalate to ask for approval", /Escalate/i.test(t));
  await p.screenshot({ path: "proto11-junior.png" });
  // try clicking advance — should not move
  const before = (await rec(p, "REQ-APV")).stage;
  await clickByText(p, ".spine button", "Advance to"); await wait(400);
  await clickByText(p, ".spine button", "Approve & move"); await wait(400);
  ok("junior cannot advance past Approval", (await rec(p, "REQ-APV")).stage === before);

  // Lead (u3, threshold approval): can approve
  await viewAs(p, "u3"); await go(p, "#/workspace/REQ-APV");
  t = await body(p);
  ok("Lead sees an 'Approve & move to Signature' action", /Approve & move to Signature/i.test(t));
  await p.screenshot({ path: "proto11-lead.png" });
  await clickByText(p, ".spine button", "Approve & move"); await wait(600);
  const after = await rec(p, "REQ-APV");
  ok("Lead approval moves it to Signature", after && after.stage === "Signature");
  ok("approval logged in activity", after && (after.activity || []).some((a) => /Moved to Signature/i.test(a.action || "")));

  console.log("console errors:", errs.length, errs.slice(0, 6).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} approval-gate checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
