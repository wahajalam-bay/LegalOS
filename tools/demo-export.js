// Export LegalOS as standalone demo HTML — one file per screen, openable
// anywhere, plus the design tokens on their own.
//
// WHY A CAPTURE AND NOT THE FILES THEMSELVES
// index.html and portal/index.html are eight-line SPA shells: an import map, a
// stylesheet link and an empty <div id="root">. Handing those over shows a
// loading spinner and nothing else, because every pixel of this product is
// rendered by JS at runtime. So this drives the real app in a real browser,
// waits for the screen to settle, then freezes the rendered DOM with the
// stylesheet and images folded in and the scripts taken out. What comes out is
// what the screen actually looks like, as one self-contained file.
//
//   node tools/demo-export.js [outDir]
//
// THE TWO SURFACES ARE TWO DOORS TO ONE CODEBASE. /legalos/ is the legal
// department's; /legalos/portal/ is the requester's, and it is a REQUESTING
// surface only. They are captured under their own identities for that reason --
// a requester's screen must be captured as a requester, or it would show the
// legal shell and misrepresent the product.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.LEGALOS_EXPORT_PORT || "4771";
const BASE = `http://127.0.0.1:${PORT}`;
const REDACTED = process.argv.includes("--redact");
const OUT = (process.argv.filter((a) => !a.startsWith("--"))[2])
  || path.join(ROOT, "demo-export", REDACTED ? "redacted" : "");
const w = (ms) => new Promise((r) => setTimeout(r, ms));

/* Who sees what. The legal screens are captured as the Head of Commercial
   Contracts (a full legal identity); the portal as a Requester, who by design
   cannot see the legal shell at all. */
const SURFACES = [
  {
    key: "platform", email: "imran.tariq@zameen.com", prefix: "",
    label: "LegalOS — legal department",
    screens: [
      ["dashboard", "#/dashboard", "Executive dashboard"],
      ["workspace", "#/requests", "Legal workspace"],
      ["calendar", "#/calendar", "Calendar"],
      ["contract-requests", "#/contract-requests", "Contract requests queue"],
      ["tracker", "#/tracker", "Commercial contract tracker"],
      ["contracts", "#/contracts", "Contracts repository"],
      ["templates", "#/templates", "Template library"],
      ["clauses", "#/clauses", "Clause library"],
      ["litigation", "#/litigation", "Litigation register"],
      ["causelist", "#/m/causelist", "Cause list"],
      ["notices", "#/m/notices", "Notices register"],
      ["spend", "#/m/spend", "Invoices & spend"],
      ["compliance", "#/compliance", "Compliance & licences"],
      ["companies", "#/companies", "Companies"],
      ["reports", "#/reports", "Reports"],
    ],
  },
  {
    key: "requester", email: "zara.shahid@zameen.com", prefix: "portal/",
    label: "LegalOS — requester portal",
    screens: [
      ["raise", "#/raise", "Raise a legal request"],
      ["requests", "#/requests", "My requests"],
      /* NOT #/contract-requests. A requester who asks for it is redirected to
         Raise Request -- the contract-request QUEUE is the legal department's
         screen, and the portal is one-directional by design. Capturing it here
         produced a byte-for-byte copy of the Raise screen under a filename
         claiming to be something else. The requester portal has two screens,
         and that is the product, not a gap in the export. */
    ],
  },
];

function passwordFor(dir, email) {
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: dir, encoding: "utf8" });
  return ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1] || "";
}

function sandboxFor(email) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-export-"));
  spawnSync("rsync", ["-a", "--exclude", "node_modules", "--exclude", "config/.sessions.json",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs",
    "--exclude", "legalos/", "--exclude", "demo-export/", ROOT + "/", dir + "/"]);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  const cfgPath = path.join(dir, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = false;
  cfg.access.devBypassEmail = email;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return dir;
}

async function serve(dir) {
  const server = spawn("node", ["server.js"], { cwd: dir, stdio: "ignore",
    env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  const ping = () => new Promise((res) => {
    const r = http.get(BASE + "/api/health", (x) => { x.resume(); res(x.statusCode === 200); });
    r.on("error", () => res(false)); r.setTimeout(1200, () => { r.destroy(); res(false); });
  });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);
  return server;
}


/* PSEUDONYMISE THE REGISTERS.
 *
 * The faithful export is the right artefact for showing the product inside the
 * department. It is the wrong artefact to send anywhere else: the litigation
 * register alone carries 120 live cases, each naming the opposing party and the
 * counsel on it. Those are identifiable people in active disputes, and a design
 * demo is not a reason to put them in a file that will be forwarded.
 *
 * This swaps the identity-bearing cells for stable pseudonyms and leaves
 * everything else -- dates, stages, pills, counts, layout, the whole visual
 * system -- exactly as rendered. The structure of the screen is the point of
 * the demo; the names never were.
 *
 * It is scoped by SELECTOR, not by trying to recognise a name in free text:
 * .cell-strong is the record's title, and the law-firm drill cell is counsel.
 * Guessing which words are names would be the unreliable way to do this.
 *
 * Deterministic, so the same case is the same pseudonym on every screen.
 */
const REDACT = () => {
  const ORGS = ["Northfield Holdings (Pvt) Limited", "Rehman Traders", "Clearwater Estates",
    "Silverline Developers (Pvt) Ltd", "Harbour & Co", "Meridian Properties",
    "Blue Ridge Associates", "Cardinal Textiles (Pvt) Ltd", "Orchard Lane Enterprises"];
  const PEOPLE = ["A. Mahmood", "S. Qureshi", "R. Bhatti", "N. Chaudhry", "T. Siddiqui",
    "K. Nawaz", "F. Abbas", "H. Raza", "M. Iqbal", "Z. Yousaf"];
  const FIRMS = ["Ashton & Partners", "Camden Law Associates", "Pine & Gale", "Rowan Legal",
    "Harbourview Chambers", "Stonebridge Advocates", "Larkspur & Co"];

  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const pick = (pool, seed) => pool[hash(seed) % pool.length];

  document.querySelectorAll(".cell-strong").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (!t) return;
    const sep = (t.match(/\s+(vs\.?|Vs\.?|versus)\s+/i) || [])[0];
    if (sep) {
      const [a, b] = t.split(sep);
      el.textContent = pick(ORGS, a) + sep + (/\s/.test((b || "").trim()) ? pick(ORGS, b || "b") : pick(PEOPLE, b || "b"));
    } else {
      el.textContent = pick(ORGS, t);
    }
  });

  // "123456789 · Civil Court, Lahore" -- the case number goes, the court stays:
  // a court is not personal data and the column reads as nonsense without one.
  document.querySelectorAll(".tiny.muted").forEach((el) => {
    const t = el.textContent || "";
    if (/\d{5,}/.test(t)) el.textContent = t.replace(/\d{5,}/g, (d) => String(100000000 + (hash(d) % 899999999)));
  });

  document.querySelectorAll('[title="Filter by law firm"], [title="Filter by counsel"]').forEach((el) => {
    const t = (el.textContent || "").trim();
    if (!t || t === "—" || /not engaged/i.test(t)) return;
    const span = el.querySelector("span") || el;
    span.textContent = pick(FIRMS, t);
  });
  return true;
};

/* Freeze the page: stylesheet folded in, images folded in, scripts taken out.
   The scripts have to go -- left in place they would boot a second copy of the
   app over the snapshot and replace everything with a spinner. */
const FREEZE = async (cssText, note) => {
  const dataUri = async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const b = await r.blob();
      return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
    } catch (e) { return null; }
  };

  for (const img of [...document.querySelectorAll("img")]) {
    const d = await dataUri(img.src);
    if (d) img.src = d; else img.remove();
  }
  // Background images declared inline (avatars, logos set from JS).
  for (const el of [...document.querySelectorAll("[style*='url(']")]) {
    const m = el.getAttribute("style").match(/url\(["']?([^"')]+)["']?\)/);
    if (!m) continue;
    const d = await dataUri(new URL(m[1], location.href).href);
    if (d) el.setAttribute("style", el.getAttribute("style").replace(m[1], d));
  }

  document.querySelectorAll("script, link[rel='stylesheet'], link[rel='preconnect'], link[rel='modulepreload']")
    .forEach((n) => n.remove());

  const style = document.createElement("style");
  style.textContent = cssText;
  document.head.appendChild(style);

  // The font still comes off Google Fonts; the token stack falls back to the
  // system UI face offline, which is why --font lists one.
  const font = document.createElement("link");
  font.rel = "stylesheet";
  font.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(font);

  // Nothing in a frozen page can be clicked, and saying so beats a reader
  // deciding the product is broken.
  const b = document.createElement("div");
  b.setAttribute("data-demo-banner", "");
  b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#063d24;color:#fff;"
    + "font:500 11.5px/1.5 Inter,system-ui,sans-serif;padding:7px 14px;text-align:center;letter-spacing:.01em";
  b.textContent = note;
  document.body.appendChild(b);

  document.querySelectorAll("[data-theme]").forEach((n) => n.removeAttribute("data-theme"));
  return true;
};

(async () => {
  const puppeteer = (await import("puppeteer-core")).default;
  fs.mkdirSync(OUT, { recursive: true });
  const css = fs.readFileSync(path.join(ROOT, "assets", "styles.css"), "utf8");
  const written = [];

  for (const surface of SURFACES) {
    const dir = sandboxFor(surface.email);
    surface.password = passwordFor(dir, surface.email);
    const server = await serve(dir);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-exp-chrome-"));
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      userDataDir: profile,
      defaultViewport: { width: 1500, height: 1000 },
    });
    const p = await browser.newPage();
    await p.setCacheEnabled(false);

    /* SIGN IN THROUGH THE REAL FORM.
       The first version of this trusted access.devBypassEmail and captured
       whatever came back. What came back was the SIGN-IN SCREEN -- all seven
       exports were the same landing page wearing four different filenames, and
       the only reason it was caught is that a dashboard and a register came out
       the same size. Posting to /api/auth/login directly is no better: it sets
       the cookie but leaves the client's own identity state empty, so the app
       renders the sign-in screen anyway. */
    await p.goto(BASE + "/" + surface.prefix, { waitUntil: "networkidle2" });
    await w(2500);

    /* THE TWO DOORS SIGN IN DIFFERENTLY, and the capture has to use the door a
       real person uses. The legal door is email + password. The requester door
       is a passwordless picker of departments -- "no passwords for now", says
       the screen -- so there is no form to fill there, and typing into one that
       does not exist is why the first three requester exports came out as the
       sign-in screen. */
    if (await p.$('input[name="email"]')) {
      await p.type('input[name="email"]', surface.email);
      await p.type('input[name="password"]', surface.password);
      await p.click('button[type="submit"]');
      await w(5000);
    } else {
      const entered = await p.evaluate(() => {
        const card = document.querySelector(".login__card");
        if (!card) return false;
        card.click();
        return (card.querySelector(".login__who") || {}).textContent || true;
      });
      if (!entered) { console.error(`  could not find a requester card on the ${surface.key} door`); }
      await w(5000);
    }

    for (const [name, hash, title] of surface.screens) {
      // Bounce through a neutral route first: changing only the hash does not
      // reload an SPA, so without this every capture is the previous screen.
      await p.goto(BASE + "/" + surface.prefix, { waitUntil: "networkidle2" });
      await p.goto(BASE + "/" + surface.prefix + hash, { waitUntil: "networkidle2" });
      await w(4000);

      /* A capture that is really the sign-in screen is worse than no capture,
         because it looks like a deliverable. Refuse it. */
      const body = await p.evaluate(() => document.body.innerText);
      if (/Sign in to raise a legal request|Sign in with your LegalOS account|Run the legal function on one system/i.test(body)) {
        console.error(`\n  REFUSING ${surface.key}/${name}: this is the sign-in screen, not the app.`);
        process.exitCode = 1;
        continue;
      }

      const note = `${surface.label} · ${title} — static export, ${new Date().toISOString().slice(0, 10)}. `
        + "Rendered screen frozen to HTML; nothing here is interactive.";
      if (REDACTED) await p.evaluate(REDACT);
      await p.evaluate(FREEZE, css, REDACTED ? note.replace("static export", "static export, names pseudonymised") : note);

      const html = "<!doctype html>\n<!--\n  " + surface.label + " — " + title + "\n"
        + "  Exported from the running app by tools/demo-export.js.\n"
        + "  Self-contained: stylesheet and images inlined, scripts removed.\n-->\n"
        + (await p.evaluate(() => document.documentElement.outerHTML));

      const file = path.join(OUT, `legalos-${surface.key}-${name}.html`);
      fs.writeFileSync(file, html);
      written.push([file, Buffer.byteLength(html)]);
      console.log(`  ${surface.key}/${name.padEnd(18)} ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  ${title}`);
    }

    await browser.close();
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }

  console.log(`\n${written.length} file(s) in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
