// Click every unique control and record what it actually did.
//
// Outcomes: navigated | modal | changed (DOM mutated) | inert (nothing happened)
// | error. "inert" is the interesting one — a visible, enabled control that does
// nothing is a dead control.
import puppeteer from "puppeteer-core";
import fs from "fs";

const B = process.env.QA_BASE || "http://127.0.0.1:4720";
const PW = "Linen-Opal-Ivory-20";
const SKIP = /sign out|log ?out|delete|remove|deactivate|archive|revoke|purge/i;
const inv = JSON.parse(fs.readFileSync("interaction-inventory.json", "utf8"));

const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage(); await p.setCacheEnabled(false);
await p.setViewport({ width: 1600, height: 1000 });
const wait = (m) => new Promise((r) => setTimeout(r, m));
let route = "", ctl = "";
const errors = [];
p.on("pageerror", (e) => errors.push({ route, ctl, msg: String(e.message).slice(0, 140) }));
p.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/favicon|401|403|429/.test(t)) errors.push({ route, ctl, msg: t.slice(0, 140) }); } });

await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await wait(2000);
await p.type('input[name="email"]', "maryam.haq@zameen.com");
await p.type('input[name="password"]', PW);
await p.click('button[type="submit"]'); await wait(4000);

const results = [];
for (const r of inv.routes) {
  route = r.route;
  // unique control identities on this route
  const uniq = [];
  const seen = new Set();
  for (const c of r.pageControls) {
    const k = c.kind + "|" + c.label;
    if (seen.has(k)) continue; seen.add(k);
    uniq.push(c);
  }
  let clicked = 0, inert = 0, nav = 0, modal = 0, changed = 0, skipped = 0, failed = 0;
  for (const c of uniq) {
    ctl = c.kind + ' "' + c.label + '"';
    if (SKIP.test(c.label)) { skipped++; results.push({ route: r.route, ...c, outcome: "SKIPPED_DESTRUCTIVE" }); continue; }
    if (c.disabled) { results.push({ route: r.route, ...c, outcome: "DISABLED" }); continue; }
    // (re)position on the route
    if (!p.url().includes(encodeURI(r.route)) ) { await p.goto(B + "/#" + r.route, { waitUntil: "networkidle2" }); await wait(900); }
    const out = await p.evaluate(async (kind, label, SELALL) => {
      const els = [...document.querySelectorAll(SELALL)].filter((el) => {
        if (el.closest(".sidebar, .topbar")) return false;
        const t = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.placeholder || el.name || "").trim().replace(/\s+/g, " ").slice(0, 46);
        return t === label;
      });
      if (!els.length) return { outcome: "GONE" };
      const el = els[0];
      const before = { html: document.body.innerHTML.length, hash: location.hash, modals: document.querySelectorAll(".modal,[role=dialog],.drawer").length };
      if (el.tagName === "INPUT" && /text|search|email|number/.test(el.type || "text")) {
        el.focus(); el.value = "qa"; el.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r2) => setTimeout(r2, 700));
        const changedNow = document.body.innerHTML.length !== before.html;
        el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true }));
        return { outcome: changedNow ? "CHANGED" : "INERT" };
      }
      if (el.tagName === "SELECT") {
        const o = [...el.options].find((x) => x.value && x.value !== el.value);
        if (!o) return { outcome: "NO_OPTIONS" };
        el.value = o.value; el.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r2) => setTimeout(r2, 800));
        return { outcome: document.body.innerHTML.length !== before.html ? "CHANGED" : "INERT" };
      }
      el.click();
      await new Promise((r2) => setTimeout(r2, 900));
      const after = { html: document.body.innerHTML.length, hash: location.hash, modals: document.querySelectorAll(".modal,[role=dialog],.drawer").length };
      if (after.hash !== before.hash) return { outcome: "NAVIGATED", to: after.hash };
      if (after.modals > before.modals) return { outcome: "MODAL" };
      if (after.html !== before.html) return { outcome: "CHANGED" };
      return { outcome: "INERT" };
    }, c.kind, c.label, "button, a[href], .tab, .chip, [role=tab], [role=button], .clickable, input, select, textarea").catch((e) => ({ outcome: "ERROR", msg: String(e.message).slice(0, 80) }));
    clicked++;
    if (out.outcome === "INERT") inert++;
    if (out.outcome === "NAVIGATED") nav++;
    if (out.outcome === "MODAL") modal++;
    if (out.outcome === "CHANGED") changed++;
    if (out.outcome === "ERROR") failed++;
    results.push({ route: r.route, kind: c.kind, label: c.label, ...out });
    // close any modal we opened
    if (out.outcome === "MODAL") { await p.keyboard.press("Escape"); await wait(400); }
    if (out.outcome === "NAVIGATED") { await p.goto(B + "/#" + r.route, { waitUntil: "networkidle2" }); await wait(800); }
  }
  console.log(`  ${r.route.padEnd(24)} unique ${String(uniq.length).padStart(3)} | nav ${nav} modal ${modal} changed ${changed} inert ${inert} skip ${skipped} err ${failed}`);
}
fs.writeFileSync("interaction-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), results, errors }, null, 2));
const by = (o) => results.filter((x) => x.outcome === o).length;
console.log("\nEXERCISED:", results.length);
console.log("  NAVIGATED", by("NAVIGATED"), "| MODAL", by("MODAL"), "| CHANGED", by("CHANGED"),
  "| INERT", by("INERT"), "| DISABLED", by("DISABLED"), "| SKIPPED", by("SKIPPED_DESTRUCTIVE"),
  "| GONE", by("GONE"), "| ERROR", by("ERROR"));
console.log("  runtime errors captured:", errors.length);
await b.close();
