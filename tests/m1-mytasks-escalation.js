// Closed/completed drops off My Tasks; escalation shows WHEN it was escalated.
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
    const base = (id, extra) => Object.assign({
      id, title: "Task " + id, requestType: "New", contractType: "NDA / MoU / LOI",
      requesterId: "u16", department: "HR", channel: "internal", entityId: eid, risk: "medium", priority: "High",
      owner: "u3", requestDate: iso0, tat: { days: 3, fixedAt: iso0, dueAt: iso0, basis: "x" }, stageLog: [], activity: [],
    }, extra);
    s.requests.unshift(
      base("REQ-OPEN", { status: "In Review", stage: "Legal Review", progress: 33 }),
      base("REQ-DONE1", { status: "Completed", stage: "Repository", progress: 100 }),
      base("REQ-DONE2", { status: "Closed", stage: "Repository", progress: 100 }),
    );
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: "networkidle2" }); await wait(300);

  // My Tasks as u3 — only the OPEN one shows; the completed/closed drop off
  await viewAs(p, "u3"); await go(p, "#/my-tasks");
  const t = await body(p);
  ok("open assigned request shows in My Tasks", /REQ-OPEN/.test(t));
  ok("Completed request does NOT show in My Tasks", !/REQ-DONE1/.test(t));
  ok("Closed request does NOT show in My Tasks", !/REQ-DONE2/.test(t));
  await p.screenshot({ path: "proto12-mytasks.png" });

  // Escalate the open one and confirm the timestamp line renders
  await go(p, "#/workspace/REQ-OPEN");
  await clickByText(p, ".spine button", "Escalate"); await wait(350);
  await p.evaluate(() => { const inp = document.querySelector(".spine input"); if (inp) { inp.value = "regulator deadline Friday"; inp.dispatchEvent(new Event("input", { bubbles: true })); } });
  await wait(150);
  await p.evaluate(() => { const bs = [...document.querySelectorAll(".spine button")].filter((x) => /Escalate/i.test(x.textContent) && x.classList.contains("btn--danger")); if (bs[0]) bs[0].click(); });
  await wait(600);
  const t2 = await body(p);
  ok("shows WHEN it was escalated (timestamp + who + reason)", /Escalated .*(ago|202)/i.test(t2) && /regulator deadline Friday/i.test(t2));
  await p.evaluate(() => { const el = document.getElementById("zone-process"); if (el) el.scrollIntoView(); });
  await wait(500);
  await p.screenshot({ path: "proto12-escalated.png" });

  console.log("console errors:", errs.length, errs.slice(0, 6).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
