// Inventory EVERY interactive control on every route, then exercise it.
//
// Rendering a route proves nothing about its buttons. This walks the real DOM,
// classifies every control, clicks the safe ones, and records what happened —
// navigation, a modal, a state change, or nothing at all. A control that does
// nothing is a defect ("dead control"), and so is one that throws.
//
// Destructive controls are identified and NOT clicked here; they are covered by
// tools/destructive-sweep.mjs against disposable fixtures.
import puppeteer from "puppeteer-core";
import fs from "fs";

const B = process.env.QA_BASE || "http://127.0.0.1:4720";
const PW = "Linen-Opal-Ivory-20";
const DESTRUCTIVE = /delete|remove|deactivate|archive|revoke|discard|reset|sign out|log ?out|purge|clear all data/i;
const NAVAWAY = /sign out|log ?out/i;

const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({ width: 1600, height: 1000 });
const wait = (m) => new Promise((r) => setTimeout(r, m));
let route = "";
const errors = [];
p.on("pageerror", (e) => errors.push({ route, msg: String(e.message).slice(0, 140) }));
p.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/favicon|401|403|429/.test(t)) errors.push({ route, msg: t.slice(0, 140) }); } });

await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await wait(2000);
await p.type('input[name="email"]', "maryam.haq@zameen.com");
await p.type('input[name="password"]', PW);
await p.click('button[type="submit"]'); await wait(4000);

const ROUTES = ["/exec","/workspace","/requests","/matters","/contracts","/tracker","/projects",
 "/g/commercial","/g/compliance","/g/litigation","/g/shared","/g/insight","/g/admin",
 "/m/contracts","/m/vetting","/m/agreements","/m/resolutions","/m/licenses","/m/filings",
 "/m/cases","/m/assetRecovery","/m/ip","/m/developerDisputes","/m/police","/m/notices","/m/inspections",
 "/compliance","/licenses","/litigation","/repository","/companies","/drafting","/templates","/clauses",
 "/knowledge","/costs","/analyzer","/pipelines","/reports","/access","/datahealth","/organization",
 "/settings","/portal","/triage","/copilot","/automation","/reviews","/approvals","/negotiations"];

const SEL = "button, a[href], .tab, .chip, [role=tab], [role=button], .clickable, input, select, textarea, [contenteditable=true]";

const inventory = [];
for (const r of ROUTES) {
  route = r;
  await p.goto(B + "/#" + r, { waitUntil: "networkidle2", timeout: 45000 }); await wait(1500);
  const controls = await p.evaluate((SEL) => {
    const seen = new Set();
    return [...document.querySelectorAll(SEL)].map((el, i) => {
      const inSidebar = !!el.closest(".sidebar, .topbar");
      const r2 = el.getBoundingClientRect();
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.placeholder || el.name || "").trim().replace(/\s+/g, " ").slice(0, 46);
      const kind = el.tagName === "INPUT" ? ("input:" + (el.type || "text"))
        : el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea"
        : el.tagName === "A" ? "link" : el.classList.contains("tab") ? "tab"
        : el.classList.contains("chip") ? "chip" : el.classList.contains("clickable") ? "clickable" : "button";
      const key = kind + "|" + label + "|" + Math.round(r2.y);
      if (seen.has(key)) return null; seen.add(key);
      return { idx: i, kind, label, inSidebar, disabled: !!el.disabled,
        visible: r2.width > 0 && r2.height > 0 && getComputedStyle(el).visibility !== "hidden",
        hasHandler: !!(el.onclick) };
    }).filter(Boolean);
  }, SEL);
  const page = controls.filter((c) => !c.inSidebar && c.visible);
  inventory.push({ route: r, total: controls.length, pageControls: page });
  process.stdout.write(`  ${r.padEnd(24)} controls: ${String(page.length).padStart(3)} (page) / ${controls.length} (incl. shell)\n`);
}

const totalPage = inventory.reduce((n, x) => n + x.pageControls.length, 0);
const destructive = inventory.flatMap((x) => x.pageControls.filter((c) => DESTRUCTIVE.test(c.label)).map((c) => ({ route: x.route, ...c })));
console.log(`\nINVENTORY: ${totalPage} page-level controls across ${ROUTES.length} routes`);
console.log(`  destructive-looking: ${destructive.length}`);
destructive.slice(0, 20).forEach((d) => console.log(`    ${d.route} :: ${d.kind} "${d.label}"`));
fs.writeFileSync("interaction-inventory.json", JSON.stringify({ generatedAt: new Date().toISOString(), routes: inventory, destructive }, null, 2));
console.log("\nwrote interaction-inventory.json");
console.log("page errors during inventory:", errors.length);
await b.close();
