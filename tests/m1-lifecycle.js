// Module 1 — FULL end-to-end, production-usable, driven through the real UI.
// Covers: request lifecycle advance (incl. MATTER-BACKED records — the reported
// "not moving" bug), escalate, hold(SLA pause)/resume, reassign, close, and the
// PRD §2 rank rules + small persona bench in the pickers.
const puppeteer = require("puppeteer-core");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4600";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function clickByText(p, sel, text) { return p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent || "").toLowerCase().includes(text.toLowerCase())); if (el) { el.click(); return true; } return false; }, sel, text); }
async function primaryClick(p, textRe) { return p.evaluate((re) => { const rx = new RegExp(re, "i"); const bs = [...document.querySelectorAll(".spine button")].filter((b) => rx.test(b.textContent) && b.classList.contains("btn--primary")); if (bs[0]) { bs[0].click(); return true; } return false; }, textRe.source); }
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }
async function rec(p, id) { return p.evaluate((id) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return (s.requests || []).find((r) => r.id === id) || (s.matters || []).find((m) => m.id === id) || null; }, id); }
// stage the spine currently shows (matter face wins) for a given id
async function shownStage(p, id) { return p.evaluate((id) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); const req = (s.requests || []).find((r) => r.id === id); const m = req && req.matterId ? (s.matters || []).find((x) => x.id === req.matterId) : (s.matters || []).find((x) => x.id === id); return { reqStage: req && req.stage, reqStatus: req && req.status, matterStage: m && m.stage, matterStatus: m && m.status }; }, id); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1100 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(600);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(600);

  // persona-sized picker check on the REAL triage screen
  await viewAs(p, "u1"); await go(p, "#/triage");
  const optCount = await p.evaluate(() => [...document.querySelectorAll(".triage__panel select option")].filter((o) => o.value && o.value.startsWith("u")).length);
  ok("assignee picker is a small persona bench (<=6), not the whole dept", optCount > 0 && optCount <= 6);
  console.log("   assignee options:", optCount);

  // Inject genuinely matter-free, already-triaged requests (what a freshly raised
  // + assigned Module 1 request looks like) so each sub-test owns a clean record.
  await p.evaluate(() => {
    const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k));
    const eid = (s.requests[0] && s.requests[0].entityId) || null;
    const iso0 = new Date(2026, 0, 5).toISOString(); const isoDue = new Date(2026, 0, 8).toISOString();
    const mk = (id) => ({
      id, title: "Test NDA " + id, requestType: "New", contractType: "NDA / MoU / LOI",
      requesterId: "u16", requesterEmail: "klaus.werner@northwind.com", department: "Finance",
      channel: "internal", entityId: eid, risk: "medium", priority: "Medium",
      status: "Assigned", stage: "Assigned", owner: "u3", progress: 0,
      requestDate: iso0, tat: { days: 3, fixedAt: iso0, dueAt: isoDue, basis: "NDA / MoU / LOI × medium" },
      stageLog: [
        { stage: "Intake", enteredAt: iso0, exitedAt: iso0, owner: "u16", ballWith: "business" },
        { stage: "Triage", enteredAt: iso0, exitedAt: null, owner: "u3", ballWith: "legal" },
      ], activity: [],
    });
    s.requests.unshift(mk("REQ-TESTA"), mk("REQ-TESTB"));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(400);

  // ---- A) FRESH REQUEST (no matter): walk EVERY stage via the button ----
  const id = "REQ-TESTA";
  let r = await rec(p, id);
  ok("fresh request is matter-free + assigned", r && !r.matterId && r.owner === "u3");
  await viewAs(p, "u3"); await go(p, "#/workspace/" + id);
  ok("pipeline controls render for the legal owner", /Move this request/i.test(await body(p)));
  const seen = [];
  for (let i = 0; i < 9; i++) {
    const moved = await clickByText(p, ".spine button", "Advance to");
    if (!moved) break;
    await wait(600);
    r = await rec(p, id);
    if (r && r.stage && seen[seen.length - 1] !== r.stage) seen.push(r.stage); else break;
  }
  console.log("   fresh-request walk:", seen.join(" → "));
  ok("advanced past triage → Legal Review", seen.includes("Legal Review"));
  ok("advanced into Drafting", seen.includes("Drafting"));
  ok("advanced into Negotiation", seen.includes("Negotiation"));
  ok("reached Approval/Signature/Executed", seen.some((s) => ["Approval", "Signature", "Executed"].includes(s)));
  ok("stageLog grew per move", r && (r.stageLog || []).length >= 4);
  await p.screenshot({ path: "proto10-fresh.png" });

  // ---- B) MATTER-BACKED record (the reported bug): must ALSO move ----
  await viewAs(p, "u5");
  const mrec = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); const req = (s.requests || []).find((r) => r.matterId); return req ? { id: req.id, matterId: req.matterId } : null; });
  if (mrec) {
    await go(p, "#/workspace/" + mrec.id);
    const before = await shownStage(p, mrec.id);
    const moved = await clickByText(p, ".spine button", "Advance to");
    await wait(700);
    const after = await shownStage(p, mrec.id);
    console.log("   matter-backed:", mrec.id, "matter", before.matterStage, "→", after.matterStage);
    ok("matter-backed record advances (matter face moves)", moved && after.matterStage && after.matterStage !== before.matterStage);
    ok("request face mirrors the matter's new status", after.reqStatus && after.reqStatus !== before.reqStatus);
  } else { ok("matter-backed record present to test", false); ok("(mirror) skipped", true); }

  // ---- C) escalate / hold / resume on a clean mid-pipeline request ----
  const idB = "REQ-TESTB";
  await viewAs(p, "u3"); await go(p, "#/workspace/" + idB);
  await clickByText(p, ".spine button", "Escalate"); await wait(350);
  await p.evaluate(() => { const inp = document.querySelector(".spine input"); if (inp) { inp.value = "counterparty wants to sign Friday"; inp.dispatchEvent(new Event("input", { bubbles: true })); } });
  await wait(150);
  await p.evaluate(() => { const bs = [...document.querySelectorAll(".spine button")].filter((x) => /Escalate/i.test(x.textContent) && x.classList.contains("btn--danger")); if (bs[0]) bs[0].click(); });
  await wait(600);
  r = await rec(p, idB);
  ok("escalation flag + Urgent priority", r && r.escalated === true && r.priority === "Urgent");

  await go(p, "#/workspace/" + idB);
  await clickByText(p, ".spine button", "Put on hold"); await wait(350);
  await p.evaluate(() => { const s = [...document.querySelectorAll(".spine select")].find((x) => /Waiting on/i.test(x.textContent)); if (s) { s.value = "business"; s.dispatchEvent(new Event("change", { bubbles: true })); } });
  await wait(150);
  await primaryClick(p, /Put on hold/); await wait(600);
  r = await rec(p, idB);
  ok("hold pauses with the business (ball leaves legal)", r && r.blockedOn === "business");
  await clickByText(p, ".spine button", "Resume"); await wait(600);
  r = await rec(p, idB);
  ok("resume returns ball to legal", r && !r.blockedOn && r.ballWith === "legal");

  // ---- D) RANK RULES (PRD §2) ----
  await viewAs(p, "u3"); await go(p, "#/workspace/" + idB); // u3 = Lead
  ok("Lead SEES Reassign", /Reassign/i.test(await body(p)));
  await viewAs(p, "u5"); await go(p, "#/workspace/" + idB); // u5 = Associate (member)
  const assocBody = await body(p);
  ok("Associate does NOT see Reassign", !/Reassign/i.test(assocBody));
  ok("Associate STILL sees Escalate (ask for help)", /Escalate/i.test(assocBody));
  await viewAs(p, "u10"); await go(p, "#/workspace/" + idB); // u10 = Paralegal
  const paraBody = await body(p);
  ok("Paralegal does NOT see Reassign", !/Reassign/i.test(paraBody));

  // ---- E) requester sees no controls ----
  await viewAs(p, "u16"); await go(p, "#/workspace/" + idB);
  ok("requester sees NO pipeline controls", !/Move this request/i.test(await body(p)));

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
