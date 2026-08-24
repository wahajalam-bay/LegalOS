// (1) triaged requests appear on their category's module register.
// (2) approval round-trip: whoever sent it to Approval is notified on the decision.
const puppeteer = require("puppeteer-core");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4600";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function clickByText(p, sel, text) { return p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent || "").toLowerCase().includes(text.toLowerCase())); if (el) { el.click(); return true; } return false; }, sel, text); }
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }
async function rec(p, id) { return p.evaluate((id) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return (s.requests || []).find((r) => r.id === id) || null; }, id); }
async function notifs(p, uid) { return p.evaluate((u) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return (s.notifs || []).filter((n) => n.forUserId === u); }, uid); }

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
    const mk = (id, cat, owner, extra) => Object.assign({
      id, title: cat + " item " + id, requestType: "New", contractType: "NDA / MoU / LOI",
      requesterId: "u16", department: "Finance", channel: "internal", entityId: eid, risk: "medium", priority: "Medium",
      category: cat, proposedCategory: cat, categoryConfirmed: true, owner,
      status: "In Review", stage: "Legal Review", progress: 33,
      requestDate: iso, tat: { days: 3, fixedAt: iso, dueAt: iso, basis: cat + " × Important" }, stageLog: [], activity: [],
    }, extra);
    s.requests.unshift(
      mk("REQ-CON", "Contract Drafting / Review", "u5"),
      mk("REQ-DIS", "Dispute / Litigation", "u17"),
      mk("REQ-IPX", "IP", "u19"),
      // approval round-trip case: owned by an associate, sitting at Negotiation
      mk("REQ-APR", "Contract Drafting / Review", "u5", { status: "Negotiation", stage: "Negotiation", progress: 55,
        stageLog: [{ stage: "Negotiation", enteredAt: iso, exitedAt: null, owner: "u5", ballWith: "counterparty" }] }),
    );
    s.notifs = [];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(300);

  // (1) module registers show the triaged requests
  await viewAs(p, "u3"); await go(p, "#/m/contracts");
  let t = await body(p);
  ok("Contracts desk shows the intake section", /From intake — assigned to this desk/i.test(t));
  ok("the contract request appears on the Contracts register", /REQ-CON/.test(t));
  await p.screenshot({ path: "proto15-contracts.png" });

  await viewAs(p, "u6"); await go(p, "#/m/cases");
  t = await body(p);
  ok("the dispute appears on the Case Handling register", /REQ-DIS/.test(t));

  await viewAs(p, "u6"); await go(p, "#/m/ip");
  t = await body(p);
  ok("the IP request appears on the IP Portfolio register", /REQ-IPX/.test(t));

  // (2) approval round-trip
  await viewAs(p, "u5"); await go(p, "#/workspace/REQ-APR");
  await clickByText(p, ".spine button", "Advance to"); await wait(700); // Negotiation → Approval
  let r = await rec(p, "REQ-APR");
  ok("associate sent it to Approval (approvalRequestedBy recorded)", r && r.stage === "Approval" && r.approvalRequestedBy === "u5");
  // now the lead approves it
  await viewAs(p, "u3"); await go(p, "#/workspace/REQ-APR");
  ok("lead sees the approve action", /Approve & move to/i.test(await body(p)));
  await clickByText(p, ".spine button", "Approve & move"); await wait(700);
  r = await rec(p, "REQ-APR");
  ok("approval moved it to Signature", r && r.stage === "Signature");
  const n5 = await notifs(p, "u5");
  ok("the approval decision goes BACK to whoever asked (u5 notified)", n5.some((x) => /approved/i.test(x.title)));
  console.log("   u5 notifs:", n5.map((x) => x.title).join(" | "));

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
