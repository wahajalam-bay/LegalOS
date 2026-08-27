// Propose → publish config workflow (PRD §2): an AD proposes an SLA change; the
// Director is notified and publishes it, and only then does the matrix change.
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
async function ls(p, path) { return p.evaluate((path) => { const s = JSON.parse(localStorage.getItem("legalos-store-v1") || "{}"); return path.split("|").reduce((o, k) => (o == null ? o : o[k]), s); }, path); }
async function openSla(p) { await clickText(p, ".menu__item", /SLA & TAT/); await wait(600); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(500);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(500);

  // AD (u3, Commercial lead) proposes a change
  await viewAs(p, "u3"); await go(p, "#/settings"); await openSla(p);
  const t = await body(p);
  ok("AD sees propose banner (not inline edit)", /propose changes/i.test(t) && await p.evaluate(() => !document.querySelector('input[type=number]')));
  // click the first proposable cell (a tagchip), fill modal, propose
  await p.evaluate(() => { const c = document.querySelector(".table .tagchip"); if (c) c.click(); });
  await wait(400);
  await p.evaluate(() => { const inp = document.querySelector(".modal input[type=number], .modal input"); if (inp) { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(inp, "4"); inp.dispatchEvent(new Event("input", { bubbles: true })); } });
  await wait(150);
  await clickText(p, "button", /^Propose$/); await wait(500);
  const props = await ls(p, "configProposals");
  ok("AD's proposal is recorded", Array.isArray(props) && props.length >= 1 && props[0].kind === "SLA matrix");
  const dirNotifs = await p.evaluate(() => (JSON.parse(localStorage.getItem("legalos-store-v1")).notifs || []).filter((n) => n.forUserId === "u1"));
  ok("Director is notified of the proposal", dirNotifs.some((n) => /proposed/i.test(n.title)));
  const beforeMatrix = JSON.stringify(await ls(p, "slaMatrix"));

  // Director (u1) reviews and publishes
  await viewAs(p, "u1"); await go(p, "#/settings"); await openSla(p);
  ok("Director sees the proposed changes panel", /Proposed changes/i.test(await body(p)));
  await clickText(p, "button", /^Publish$/); await wait(600);
  const after = await ls(p, "configProposals");
  ok("proposal marked published", after && after[0] && after[0].status === "published");
  ok("matrix changed only AFTER the Director published", JSON.stringify(await ls(p, "slaMatrix")) !== beforeMatrix);

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
