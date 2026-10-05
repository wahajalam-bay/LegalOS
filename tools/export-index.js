// Generate the contact sheet for demo-export/.
//
// Generated from the DIRECTORY rather than hand-written, because the first
// version of this page was hand-written against six files and the export then
// grew to seventeen — a hand-kept index starts lying the moment the thing it
// indexes changes.
//
//   node tools/export-index.js [dir]
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || path.join(__dirname, "..", "demo-export");
const REDACTED = path.basename(DIR) === "redacted";

const TITLES = {
  dashboard: ["Executive dashboard", "KPI strip, contracts portfolio, case book, outcomes donut"],
  workspace: ["Legal workspace", "The queue the department works out of"],
  calendar: ["Calendar", "Hearings, renewals and notice windows"],
  "contract-requests": ["Contract requests", "The intake queue, and the drafting panel"],
  tracker: ["Contract tracker", "Commercial contracts, filtered and drilled"],
  contracts: ["Contracts repository", "The executed book"],
  templates: ["Template library", "413 approved templates from Drive"],
  clauses: ["Clause library", "Approved positions by topic"],
  litigation: ["Litigation register", "The register shell — filters, drill cells, 338 cases"],
  causelist: ["Cause list", "What is listed, and when"],
  notices: ["Notices register", "Served and received"],
  spend: ["Invoices & spend", "Outside counsel cost"],
  compliance: ["Compliance & licences", "Module overview and licence position"],
  companies: ["Companies", "43 entities and their statutory position"],
  reports: ["Reports", "Standing reports across the department"],
  raise: ["Raise a legal request", "Three-step wizard, plus the contract-request door"],
  requests: ["My requests", "What the requester can follow end to end"],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kb = (f) => Math.round(fs.statSync(path.join(DIR, f)).size / 1024);

const views = fs.readdirSync(DIR)
  .filter((f) => /^legalos-(platform|requester)-.*\.html$/.test(f))
  .map((f) => { const m = f.match(/^legalos-(platform|requester)-(.+)\.html$/); return { f, surface: m[1], key: m[2] }; });

const card = (href, title, sub, meta) =>
  `<a class="card" href="${esc(href)}"><div class="card__t">${esc(title)}</div>`
  + `<div class="card__s">${sub}</div>${meta ? `<div class="card__m">${esc(meta)}</div>` : ""}</a>`;

const group = (surface) => views.filter((v) => v.surface === surface)
  .sort((a, b) => Object.keys(TITLES).indexOf(a.key) - Object.keys(TITLES).indexOf(b.key))
  .map((v) => { const [t, s] = TITLES[v.key] || [v.key, ""]; return card(v.f, t, esc(s), kb(v.f) + " KB"); }).join("");

const up = REDACTED ? "../" : "";
const has = (f) => fs.existsSync(path.join(DIR, f));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LegalOS — demo exports${REDACTED ? " (pseudonymised)" : ""}</title>
<link rel="stylesheet" href="${up}legalos-design-tokens.css" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  /* Nothing but the exported token sheet is loaded here. If this page looks
     like LegalOS, the tokens are carrying the design. */
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:var(--font); }
  .wrap { max-width:1020px; margin:0 auto; padding:var(--sp-10) var(--sp-6) var(--sp-12); }
  h1 { font-size:26px; letter-spacing:-.02em; margin:0 0 var(--sp-2); }
  .lead { color:var(--text-2); font-size:14px; line-height:1.65; margin:0 0 var(--sp-6); max-width:70ch; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-3);
       margin:var(--sp-8) 0 var(--sp-3); font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(236px,1fr)); gap:var(--sp-3); }
  a.card { display:block; padding:var(--sp-4); background:var(--surface); border:1px solid var(--border);
           border-radius:var(--card-r); text-decoration:none; color:inherit; box-shadow:var(--shadow-xs); }
  a.card:hover { border-color:var(--brand); box-shadow:var(--shadow-md); }
  .card__t { font-weight:600; font-size:13.5px; margin-bottom:3px; }
  .card__s { font-size:12px; color:var(--text-3); line-height:1.5; }
  .card__m { font:400 10.5px var(--mono); color:var(--text-3); margin-top:6px; opacity:.8; }
  .hero { display:block; padding:var(--sp-5); background:var(--brand-600); color:#fff;
          border-radius:var(--card-r); text-decoration:none; box-shadow:var(--shadow-md); }
  .hero__t { font-weight:700; font-size:16px; margin-bottom:4px; }
  .hero__s { font-size:12.5px; line-height:1.6; opacity:.86; }
  .note { border-left:3px solid var(--${REDACTED ? "success" : "warning"});
          background:var(--${REDACTED ? "success" : "warning"}-bg); color:var(--text);
          padding:var(--sp-3) var(--sp-4); border-radius:var(--r-sm); font-size:13px;
          line-height:1.65; margin:var(--sp-4) 0 0; }
  .tag { font:600 10.5px var(--mono); color:var(--brand); border:1px solid var(--brand);
         padding:3px 9px; border-radius:var(--r-full); vertical-align:middle; margin-left:9px; }
  code { font-family:var(--mono); font-size:12px; background:var(--surface-2); padding:1px 5px; border-radius:var(--r-xs); }
</style>
</head>
<body>
<div class="wrap">
  <h1>LegalOS — demo exports${REDACTED ? ' <span class="tag">PSEUDONYMISED</span>' : ""}</h1>
  <p class="lead">Each file is one screen of the running product, frozen to standalone HTML with the
  stylesheet and images folded in and the scripts taken out. Open any of them directly in a browser —
  no server, no build. Nothing is interactive: they are what the screen looks like, not a working copy.</p>

  ${has("legalos-all-views.html") ? `<a class="hero" href="legalos-all-views.html">
    <div class="hero__t">▸ All ${views.length} views in one file</div>
    <div class="hero__s">Every screen below, switchable from a bar along the bottom. The stylesheet is
    included once rather than ${views.length} times, so it is ${kb("legalos-all-views.html") > 1024 ? (kb("legalos-all-views.html") / 1024).toFixed(1) + " MB" : kb("legalos-all-views.html") + " KB"} instead of 7 MB. Deep-linkable:
    <code style="background:rgba(255,255,255,.14);color:#fff">#litigation-platform</code>.</div></a>` : ""}

  <h2>Legal department · <code>/legalos/</code></h2>
  <div class="grid">${group("platform")}</div>

  <h2>Requester portal · <code>/legalos/portal/</code></h2>
  <div class="grid">${group("requester")}</div>
  ${REDACTED ? "" : `<p class="note" style="border-left-color:var(--info);background:var(--info-bg)">
  <strong>Two screens, not more.</strong> The requester portal is a requesting surface only — it is
  deliberately one-directional. A requester who asks for a legal address is redirected rather than
  shown an error, so there is no third screen to capture. The cut-down sidebar in these files is the
  product working, not a broken export.</p>`}

  <h2>Design system and styles</h2>
  <div class="grid">
    ${has(path.join(up, "legalos-design-system.html")) || fs.existsSync(path.join(DIR, up, "legalos-design-system.html"))
    ? card(up + "legalos-design-system.html", "Design system", "Tokens, every component specimen, light and dark — rendered by the product's own stylesheet") : ""}
    ${card(up + "legalos-design-tokens.css", "Design tokens", "124 declarations — structure, light theme, dark theme")}
    ${card(up + "legalos-stylesheet.css", "Full stylesheet", "The product's complete CSS, 4,269 lines, verbatim")}
  </div>

  ${REDACTED
    ? `<h2>What is changed in this set</h2>
  <p class="note"><strong>Case titles, case numbers and counsel names are pseudonyms.</strong>
  Everything else is the product exactly as it renders — stages, dates, counts, filters, layout, every
  token. Court names are kept, because a court is not personal data and the column reads as nonsense
  without one. The mapping is deterministic, so the same case is the same pseudonym on every screen.</p>`
    : `<h2>Before you send these anywhere</h2>
  <p class="note"><strong>The files in this folder carry real matter data.</strong> The litigation
  register alone names live cases, their opposing parties and the counsel on them. That is fine inside
  Legal and not fine in a deck that gets forwarded.<br /><br />
  <strong><a href="redacted/index.html" style="color:inherit">Use the redacted set</a></strong> for
  anything leaving the department: identical screens, identical design, with case titles, case numbers
  and counsel replaced by stable pseudonyms.</p>`}

  <p class="lead" style="margin-top:var(--sp-6);font-size:12.5px;color:var(--text-3)">
  Rebuild any of this: <code>node tools/demo-export.js [--redact]</code> ·
  <code>node tools/combine-views.js</code> · <code>node tools/design-system.js</code> ·
  <code>node tools/export-index.js</code></p>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, "index.html"), html);
console.log(`wrote ${path.join(DIR, "index.html")} — ${views.length} views indexed`);
