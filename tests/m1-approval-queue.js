// Director's My Tasks surfaces "Awaiting my approval"; a Lead sees only their
// team's approvals; an Associate sees none.
const puppeteer = require("puppeteer-core");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:4600";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }

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
    const iso0 = new Date(2026, 5, 1).toISOString();
    const mk = (id, owner, extra) => Object.assign({
      id, title: "Approval " + id, requestType: "New", contractType: "Vendor MSA",
      requesterId: "u16", department: "Finance", channel: "internal", entityId: eid, risk: "high", priority: "High",
      owner, status: "Pending Approval", stage: "Approval", progress: 62,
      requestDate: iso0, tat: { days: 5, fixedAt: iso0, dueAt: iso0, basis: "x" }, stageLog: [], activity: [],
    }, extra || {});
    s.requests.unshift(
      mk("REQ-CMR", "u3"),                         // commercial (u3 lead's team)
      mk("REQ-LIT", "u17", { escalated: true }),    // litigation (David u6's team)
    );
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(300);

  // Director (u1) — sees BOTH, across the department
  await viewAs(p, "u1"); await go(p, "#/my-tasks");
  let t = await body(p);
  ok("Director's My Tasks has an 'Awaiting my approval' section", /Awaiting my approval/i.test(t));
  ok("Director sees the commercial approval", /REQ-CMR/.test(t));
  ok("Director sees the litigation approval", /REQ-LIT/.test(t));
  ok("Open items KPI is no longer 0 for the Director", !/\b0\s*\n?\s*Open items/i.test(t) && /REQ-CMR/.test(t));
  ok("escalated approval is flagged", /Escalated/i.test(t));
  await p.screenshot({ path: "proto13-director.png" });

  // Lead of Commercial (u3) — sees only their team's approval
  await viewAs(p, "u3"); await go(p, "#/my-tasks");
  t = await body(p);
  ok("Commercial Lead sees their team's approval (REQ-CMR)", /REQ-CMR/.test(t));
  ok("Commercial Lead does NOT see litigation's approval (REQ-LIT)", !/REQ-LIT/.test(t));

  // Associate (u5, member, no approval authority) — sees no approval queue
  await viewAs(p, "u5"); await go(p, "#/my-tasks");
  t = await body(p);
  ok("Associate has NO 'Awaiting my approval' section", !/Awaiting my approval/i.test(t));

  console.log("console errors:", errs.length, errs.slice(0, 6).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} approval-queue checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
