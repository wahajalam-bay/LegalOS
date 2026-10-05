// Fold every exported screen into ONE browsable HTML file.
//
// The naive way is to concatenate the exports. That ships the 4,269-line
// stylesheet seventeen times — about 6MB of duplicate CSS — so the stylesheet
// goes in ONCE here and each screen contributes only its rendered body.
//
// Each view is wrapped in its own container and all but one are display:none.
// That matters more than it looks: these screens have fixed-position chrome (a
// sidebar, a topbar), and seventeen fixed sidebars stacked in one document
// would be seventeen sidebars. Hidden containers take their fixed children out
// with them, so exactly one shell is ever laid out.
//
//   node tools/combine-views.js [srcDir] [outFile]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = process.argv[2] || path.join(ROOT, "demo-export");
const OUT = process.argv[3] || path.join(SRC, "legalos-all-views.html");

const TITLES = {
  dashboard: "Executive dashboard", workspace: "Legal workspace", calendar: "Calendar",
  "contract-requests": "Contract requests", tracker: "Contract tracker",
  contracts: "Contracts repository", templates: "Template library", clauses: "Clause library",
  litigation: "Litigation register", causelist: "Cause list", notices: "Notices register",
  spend: "Invoices & spend", compliance: "Compliance & licences", companies: "Companies",
  reports: "Reports", raise: "Raise a request", requests: "My requests",
};
const ORDER = ["dashboard", "workspace", "calendar", "contract-requests", "tracker", "contracts",
  "templates", "clauses", "litigation", "causelist", "notices", "spend", "compliance",
  "companies", "reports", "raise", "requests"];

const files = fs.readdirSync(SRC).filter((f) => /^legalos-(platform|requester)-.*\.html$/.test(f));
const views = files.map((f) => {
  const m = f.match(/^legalos-(platform|requester)-(.+)\.html$/);
  return { file: f, surface: m[1], key: m[2], title: TITLES[m[2]] || m[2] };
}).sort((a, b) => {
  if (a.surface !== b.surface) return a.surface === "platform" ? -1 : 1;
  return ORDER.indexOf(a.key) - ORDER.indexOf(b.key);
});

if (!views.length) { console.error("no exported views in " + SRC); process.exit(1); }

const bodyOf = (html) => {
  const i = html.indexOf("<body");
  const open = html.indexOf(">", i) + 1;
  const close = html.lastIndexOf("</body>");
  let b = html.slice(open, close);
  // The per-file footer banner is replaced by this file's own chrome.
  b = b.replace(/<div data-demo-banner=""[\s\S]*?<\/div>/, "");
  // The font <link> and the inlined <style> are hoisted to the document head
  // once; left in place they would be repeated once per view.
  b = b.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, "");
  return b;
};

let css = null;
const parts = [];
for (const v of views) {
  const html = fs.readFileSync(path.join(SRC, v.file), "utf8");
  if (css === null) {
    const m = html.match(/<style>([\s\S]*?)<\/style>/);
    css = m ? m[1] : "";
  }
  parts.push({ ...v, body: bodyOf(html).replace(/<style>[\s\S]*?<\/style>/g, "") });
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const label = (s) => (s === "platform" ? "Legal department" : "Requester portal");

let lastSurface = null;
const nav = parts.map((p, i) => {
  const head = p.surface !== lastSurface ? `<span class="av-grp">${label(p.surface)}</span>` : "";
  lastSurface = p.surface;
  return head + `<button class="av-tab${i === 0 ? " on" : ""}" data-go="${p.key}-${p.surface}">${esc(p.title)}</button>`;
}).join("");

const bodies = parts.map((p, i) => `<div class="av-view${i === 0 ? " on" : ""}" id="v-${p.key}-${p.surface}">${p.body}</div>`).join("\n");

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LegalOS — all views</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<!--
  LegalOS — every exported screen in one file.
  Built by tools/combine-views.js from the standalone exports.
  The product stylesheet appears ONCE below and is shared by all ${parts.length} views.
-->
<style>${css}</style>
<style>
  /* This file's own chrome. Namespaced av-* so it cannot collide with the
     product's classes, and it is the only CSS here that is not the product's. */
  .av-view { display: none; }
  .av-view.on { display: block; }
  .av-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
    background: var(--brand-600); color: #fff; display: flex; align-items: center; gap: 4px;
    padding: 6px 10px; overflow-x: auto; font-family: var(--font); box-shadow: 0 -6px 18px rgba(0,0,0,.18); }
  .av-bar::-webkit-scrollbar { height: 5px; }
  .av-bar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.3); border-radius: 3px; }
  .av-grp { font-size: 9.5px; text-transform: uppercase; letter-spacing: .09em; opacity: .62;
    padding: 0 8px 0 12px; white-space: nowrap; align-self: center; }
  .av-grp:first-child { padding-left: 2px; }
  .av-tab { background: transparent; border: 0; color: rgba(255,255,255,.80); font: 500 11.5px var(--font);
    padding: 6px 11px; border-radius: 999px; white-space: nowrap; cursor: pointer; }
  .av-tab:hover { background: rgba(255,255,255,.12); color: #fff; }
  .av-tab.on { background: #fff; color: var(--brand-600); font-weight: 650; }
  /* Keep the product's own fixed footers clear of the switcher. */
  body { padding-bottom: 46px; }
</style>
</head>
<body>
${bodies}
<nav class="av-bar" aria-label="Views">${nav}</nav>
<script>
  (function () {
    var bar = document.querySelector('.av-bar');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('.av-tab');
      if (!b) return;
      var id = b.getAttribute('data-go');
      document.querySelectorAll('.av-view').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + id); });
      document.querySelectorAll('.av-tab').forEach(function (t) { t.classList.toggle('on', t === b); });
      window.scrollTo(0, 0);
      if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    });
    // Deep-linkable: #litigation-platform opens that view directly.
    var want = location.hash.slice(1);
    if (want) { var t = bar.querySelector('[data-go="' + want + '"]'); if (t) t.click(); }
  })();
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, out);
const mb = (Buffer.byteLength(out) / 1048576).toFixed(2);
const naive = parts.reduce((a, p) => a + fs.statSync(path.join(SRC, p.file)).size, 0) / 1048576;
console.log(`wrote ${OUT}`);
console.log(`  views: ${parts.length} (${parts.filter((p) => p.surface === "platform").length} legal, ${parts.filter((p) => p.surface === "requester").length} requester)`);
console.log(`  size: ${mb} MB  (concatenating the exports would be ${naive.toFixed(2)} MB)`);
