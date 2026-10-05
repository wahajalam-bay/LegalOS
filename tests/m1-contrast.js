// Contrast audit — real WCAG ratios, measured on the rendered page.
//
// NOT a WCAG certification. This computes the WCAG 2.1 contrast ratio between
// the COMPUTED colour of real text and the colour actually painted behind it,
// walking up for the first non-transparent background the way a browser does.
// It covers what the tooling can see: it cannot judge whether a label reads
// well, and it does not test images or gradients.
//
// Thresholds (WCAG 2.1 AA): 4.5:1 for normal text, 3.0:1 for large text
// (>=24px, or >=18.66px when bold), 3.0:1 for UI component boundaries.
//
//   node tests/m1-contrast.js
const puppeteer = require("./_puppeteer.js");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), os = require("os"), P = require("path"), http = require("http");

const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const PORT = process.env.LEGALOS_CONTRAST_PORT || "4881";
const B = `http://127.0.0.1:${PORT}`;
const USER = "maryam.haq@zameen.com";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${!pass && detail ? "  — " + detail : ""}`);
};
const ping = () => new Promise((res) => {
  const r = http.get(B + "/api/health", (x) => { x.resume(); res(x.statusCode === 200); });
  r.on("error", () => res(false)); r.setTimeout(1200, () => { r.destroy(); res(false); });
});

const ROUTES = ["/exec", "/workspace", "/matters", "/contracts", "/litigation",
  "/m/notices", "/compliance", "/compliance/licenses",
  "/compliance/loans", "/compliance/leases", "/compliance/sec-filings",
  "/tracker", "/repository", "/templates", "/knowledge", "/reports", "/costs",
  "/access", "/datahealth?tab=problems", "/settings", "/organization", "/triage",
  "/approvals", "/pipelines", "/analyzer", "/licenses", "/clauses", "/companies"];

/* Injected: measure every text node's contrast against what is painted behind. */
const MEASURE = function () {
  const parseRGB = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (fg, bg) => ({            // composite a translucent colour onto its backdrop
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  const allRGB = (s) => {
    const out = [];
    const re = /rgba?\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(String(s)))) {
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      out.push({ r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 });
    }
    return out;
  };
  /* The first ancestor that actually paints, like the compositor does.
     A GRADIENT has no single background-color — computed backgroundColor is
     transparent, so a naive walk falls straight through a dark gradient to the
     white page behind it and reports white-on-white at 1:1. (That is exactly
     what happened for the sidebar, which paints a gradient: 16 perfectly legible
     styles were reported as failures.) Gradients are resolved to their colour
     STOPS and the sample is judged against the worst of them — a conservative
     bound rather than a guess. */
  const backdrop = (el) => {
    let node = el, acc = null;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const c = parseRGB(cs.backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (c.a >= 1) return { colors: [acc] }; }
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        const stops = allRGB(cs.backgroundImage).filter((x) => x.a > 0);
        if (stops.length) {
          return { colors: stops.map((st) => (acc ? over(acc, st) : st)), gradient: true };
        }
      }
      node = node.parentElement;
    }
    const htmlBg = parseRGB(getComputedStyle(document.documentElement).backgroundColor);
    const base = htmlBg && htmlBg.a > 0 ? htmlBg : { r: 255, g: 255, b: 255, a: 1 };
    return { colors: [acc ? over(acc, base) : base] };
  };

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
    // Only elements that render their OWN text.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own.length) continue;
    const text = own.map((n) => n.textContent.trim()).join(" ").slice(0, 40);
    const fg = parseRGB(cs.color);
    if (!fg) continue;
    const back = backdrop(el);
    // Judge against the WORST backdrop the element can sit on.
    let r = Infinity, bg = back.colors[0];
    for (const cand of back.colors) {
      const eff2 = fg.a < 1 ? over(fg, cand) : fg;
      const rr = ratio(eff2, cand);
      if (rr < r) { r = rr; bg = cand; }
    }
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const cls = (String(el.className || "").split(/\s+/).slice(0, 3).join(".")) || el.tagName.toLowerCase();
    const key = cls + "|" + cs.color + "|" + Math.round(size) + "|" + weight;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cls, tag: el.tagName.toLowerCase(), text, color: cs.color,
      bg: "rgb(" + Math.round(bg.r) + ", " + Math.round(bg.g) + ", " + Math.round(bg.b) + ")",
      onGradient: !!back.gradient,
      size: Math.round(size * 10) / 10, weight, large, ratio: Math.round(r * 100) / 100, need, pass: r >= need });
  }
  return out;
};

let SANDBOX = null, server = null;

(async () => {
  if (await ping()) { console.error(`port ${PORT} already in use — refusing to test a stale instance`); process.exit(2); }
  SANDBOX = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-contrast-"));
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "legalos/", P.join(__dirname, "..") + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(P.join(__dirname, "..", "node_modules"), P.join(SANDBOX, "node_modules"));
  const cfgPath = P.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false; cfg.access.devBypassEmail = USER;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const out0 = spawnSync("node", ["tools/legalos-passwd.js", "set", USER], { cwd: SANDBOX, encoding: "utf8" });
  const PW = ((out0.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";
  server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore",
    env: { ...process.env, PORT, HOST: "127.0.0.1", LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(500);
  if (!(await ping())) { console.error("the test instance did not start"); process.exit(1); }

  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage(); await p.setCacheEnabled(false);
  await p.setViewport({ width: 1600, height: 1000 });
  await p.goto(B + "/#/login", { waitUntil: "networkidle2", timeout: 60000 }); await w(2000);

  // The sign-in screen first — it is the one page every user sees.
  const loginSamples = await p.evaluate(MEASURE);
  await p.type('input[name="email"]', USER); await p.type('input[name="password"]', PW);
  await p.click('button[type="submit"]'); await w(4000);
  const signedIn = !/Sign in with your LegalOS account/i.test(await p.evaluate(() => document.body.innerText));
  check("signed in", signedIn);
  if (!signedIn) return finish(b);

  console.log("\n1. Contrast across every main route (WCAG 2.1 AA: 4.5:1 normal, 3.0:1 large)");
  const all = new Map();
  const add = (route, rows) => rows.forEach((r) => {
    const key = r.cls + "|" + r.color + "|" + r.size + "|" + r.weight;
    if (!all.has(key)) all.set(key, { ...r, routes: new Set() });
    all.get(key).routes.add(route);
  });
  add("/login", loginSamples);
  for (const r of ROUTES) {
    await p.goto(B + "/#" + r, { waitUntil: "networkidle2", timeout: 45000 }); await w(1100);
    add(r, await p.evaluate(MEASURE));
  }
  const samples = [...all.values()];
  const failures = samples.filter((s) => !s.pass);
  console.log(`     ${samples.length} distinct text styles measured across ${ROUTES.length + 1} routes`);
  console.log(`     ${samples.length - failures.length} pass · ${failures.length} below threshold`);
  if (failures.length) {
    console.log("\n     Below threshold:");
    failures.sort((a, b) => a.ratio - b.ratio).forEach((f) => console.log(
      `       ${String(f.ratio).padStart(5)}:1  (needs ${f.need})  ${f.size}px/${f.weight}  ${f.cls.padEnd(34)} "${f.text}"  ${[...f.routes][0]}`));
  }
  check("every measured text style meets its WCAG AA threshold", failures.length === 0,
    failures.length + " below threshold");

  console.log("\n2. Status is never carried by colour alone");
  await p.goto(B + "/#/litigation", { waitUntil: "networkidle2" }); await w(2000);
  const badges = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".pill, .status, .risk, .tag, [class*='risk--'], [class*='pill--']")) {
      const t = (el.innerText || "").trim();
      out.push({ cls: String(el.className || "").slice(0, 40), hasText: t.length > 0, text: t.slice(0, 24) });
    }
    return out;
  });
  const textless = badges.filter((x) => !x.hasText);
  check(`${badges.length} status/risk indicators all carry a text label, not colour alone`,
    textless.length === 0, textless.slice(0, 4).map((x) => x.cls).join(" | "));

  console.log("\n3. Focus indicator is visible against its own background");
  const focusRing = await p.evaluate(() => {
    const parseRGB = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
    const el = document.querySelector(".regbar .fltbtn") || document.querySelector("button");
    if (!el) return null;
    el.focus();
    const cs = getComputedStyle(el);
    const ring = parseRGB(cs.outlineColor) || parseRGB((cs.boxShadow.match(/rgba?\([^)]+\)/) || [])[0] || "");
    let bgEl = el, bg = null;
    while (bgEl && !bg) { const c = parseRGB(getComputedStyle(bgEl).backgroundColor); if (c && c.a > 0) bg = c; bgEl = bgEl.parentElement; }
    if (!ring || !bg) return { measured: false, outline: cs.outlineStyle, width: cs.outlineWidth, shadow: cs.boxShadow.slice(0, 60) };
    return { measured: true, ratio: Math.round(ratio(ring, bg) * 100) / 100,
      outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
  });
  check("the focus indicator reaches 3:1 against its background",
    focusRing && focusRing.measured && focusRing.ratio >= 3.0,
    JSON.stringify(focusRing));

  fs.writeFileSync(P.join(__dirname, "..", "CONTRAST_DATA.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    method: "WCAG 2.1 relative-luminance ratio, computed colour vs first painted ancestor background, on the rendered page",
    thresholds: { normalText: 4.5, largeText: 3.0, note: "large = >=24px, or >=18.66px at weight >=700" },
    routes: ROUTES.length + 1,
    measured: samples.length,
    failing: failures.length,
    samples: samples.map((s) => ({ component: s.cls, tag: s.tag, sample: s.text, color: s.color,
      fontSize: s.size, fontWeight: s.weight, large: s.large, ratio: s.ratio, required: s.need,
      pass: s.pass, routes: [...s.routes].slice(0, 6) })).sort((a, b) => a.ratio - b.ratio),
  }, null, 2));
  console.log("\n  evidence written to CONTRAST_DATA.json");
  await finish(b);
})().catch(async (e) => {
  console.error("SUITE ERROR", e);
  try { server && server.kill("SIGKILL"); } catch (x) {}
  try { SANDBOX && fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
});

async function finish(b) {
  try { await b.close(); } catch (e) {}
  try { server && server.kill("SIGKILL"); } catch (e) {}
  try { SANDBOX && fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) {}
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n  ${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
}
