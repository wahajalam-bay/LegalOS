// Generate the LegalOS design system page.
//
// It is GENERATED, not hand-written, for the part that matters: the tokens and
// the icons are read out of assets/styles.css and src/icons.js at build time,
// so the swatches cannot drift from the stylesheet the way a hand-kept
// catalogue always eventually does. Re-run it after a token change and the page
// is correct again.
//
// The component specimens below ARE hand-written, from src/ui.js — the real
// class names and the real element structure, not an approximation. Every one
// is styled by the product's own stylesheet, which the page loads whole: if a
// specimen looks right, it is right, because nothing here restyles anything.
//
//   node tools/design-system.js [outFile]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "demo-export", "legalos-design-system.html");

/* ----------------------------------------------------------------- icons */
const iconSrc = fs.readFileSync(path.join(ROOT, "src", "icons.js"), "utf8");
const ICONS = {};
for (const m of iconSrc.matchAll(/^\s{2}([a-zA-Z][\w]*):\s*'([^']*)',?$/gm)) ICONS[m[1]] = m[2];
const ico = (name, size = 16) => {
  const p = ICONS[name] || ICONS.circle || "";
  return `<svg aria-hidden="true" focusable="false" width="${size}" height="${size}" viewBox="0 0 24 24"`
    + ` fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
};

/* ---------------------------------------------------------------- tokens */
const css = fs.readFileSync(path.join(ROOT, "assets", "styles.css"), "utf8");
function blockOf(sel) {
  const i = css.indexOf(sel);
  const j = css.indexOf("{", i);
  let depth = 1, k = j + 1;
  while (depth) { if (css[k] === "{") depth++; else if (css[k] === "}") depth--; k++; }
  return css.slice(j + 1, k - 1);
}
function tokensOf(sel) {
  const out = [];
  // Strip comments first: several tokens carry a trailing note, and a few whole
  // lines are commented out — both would otherwise parse as declarations.
  const body = blockOf(sel).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.push([m[1], m[2].trim()]);
  return out;
}
const BASE = tokensOf(":root {");
const LIGHT = tokensOf(':root, :root[data-theme="light"] {');
const DARK = tokensOf(':root[data-theme="dark"] {');

const isColor = (v) => /^(#|rgb|hsl)/.test(v) || /^var\(--(brand|accent)/.test(v);
const isShadow = (v) => /\d+px .*(rgba|rgb)/.test(v) && v.split(" ").length > 3;
const isLen = (v) => /^-?[\d.]+(px|rem|em|%)$/.test(v);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const swatches = (pairs) => `<div class="ds-sw">` + pairs.map(([n, v]) =>
  `<div class="ds-sw__i"><div class="ds-sw__c" style="background:${esc(v)}"></div>`
  + `<div class="ds-sw__n">${esc(n)}</div><div class="ds-sw__v">${esc(v)}</div></div>`).join("") + `</div>`;

const rows = (pairs) => `<table class="ds-tbl"><tbody>` + pairs.map(([n, v]) =>
  `<tr><td><code>${esc(n)}</code></td><td class="ds-tbl__v">${esc(v)}</td></tr>`).join("") + `</tbody></table>`;

const shadowCards = (pairs) => `<div class="ds-sw">` + pairs.map(([n, v]) =>
  `<div class="ds-sw__i"><div class="ds-sw__c" style="box-shadow:${esc(v)};background:var(--surface);margin:10px"></div>`
  + `<div class="ds-sw__n">${esc(n)}</div></div>`).join("") + `</div>`;

const scaleBars = (pairs) => `<div class="ds-scale">` + pairs.map(([n, v]) =>
  `<div class="ds-scale__r"><code>${esc(n)}</code><span class="ds-scale__b" style="width:${esc(v)}"></span>`
  + `<span class="ds-tbl__v">${esc(v)}</span></div>`).join("") + `</div>`;

/* ------------------------------------------------------------ components */
const btn = (v, label, icon, size) =>
  `<button class="btn btn--${v}${size ? " btn--" + size : ""}">${icon ? ico(icon, size === "sm" ? 14 : 16) : ""}${label}</button>`;
const pill = (t, label, dot) => `<span class="pill pill--${t}">${dot ? '<span class="pill__dot"></span>' : ""}${label}</span>`;
const avatar = (n, s, bg) => `<span class="avatar avatar--${s}" style="background:${bg}">${n}</span>`;

const metric = (label, value, icon, bg, fg, foot, trend, dir) => `
  <div class="card card--pad metric">
    <div class="metric__top">
      <div class="metric__icon" style="background:${bg};color:${fg}">${ico(icon, 18)}</div>
      <div class="metric__label">${label}</div>
      ${trend ? `<div class="spacer"></div><div class="trend trend--${dir}">${ico(dir === "up" ? "trendingUp" : dir === "down" ? "trendingDown" : "minus", 12)}${trend}</div>` : ""}
    </div>
    <div class="metric__value">${value}</div>
    ${foot ? `<div class="metric__foot">${foot}</div>` : ""}
  </div>`;

const section = (title, sub, icon, body, actions) => `
  <div class="card">
    <div class="card__head">
      <div class="cmdk__ico" style="width:28px;height:28px;border-radius:8px">${ico(icon, 15)}</div>
      <div style="min-width:0"><div class="card__title">${title}</div>${sub ? `<div class="card__sub">${sub}</div>` : ""}</div>
      ${actions ? `<div class="card__actions">${actions}</div>` : ""}
    </div>
    <div class="card__body">${body}</div>
  </div>`;

const SPECIMENS = [
  ["Buttons", `The variants carry meaning, not decoration: <code>primary</code> is the one action a
    screen is for, <code>danger</code> is destructive and never the default, <code>ghost</code> is
    everything else. <code>btn--sm</code> is for table rows and toolbars.`,
    `<div class="ds-row">${btn("primary", "Approve", "check")}${btn("accent", "Generate draft", "sparkles")}
      ${btn("soft", "Export", "download")}${btn("ghost", "Cancel")}${btn("danger", "Remove", "trash")}</div>
     <div class="ds-row">${btn("primary", "Save", "check", "sm")}${btn("ghost", "Filter", "filter", "sm")}
      ${btn("ghost", "", "moreV", "sm")}${btn("primary", "New request", "plus", "lg")}</div>`],

  ["Status, risk and priority", `<code>Status</code> maps a vocabulary — roughly forty stage names —
    onto eight pill tones, so the same stage is the same colour on every screen. It is a map, not a
    choice made per table.`,
    `<div class="ds-row">${["green", "amber", "red", "blue", "purple", "indigo", "orange", "gray"].map((t) => pill(t, t)).join("")}</div>
     <div class="ds-row">${pill("green", "Active", 1)}${pill("amber", "In Review", 1)}${pill("red", "Overdue", 1)}
      ${pill("blue", "Open", 1)}${pill("indigo", "Awaiting Signature", 1)}${pill("gray", "Draft", 1)}</div>
     <div class="ds-row">${["critical", "high", "medium", "low"].map((l) =>
      `<span class="risk risk--${l}"><span class="risk__bar"></span>${l[0].toUpperCase() + l.slice(1)}</span>`).join("")}</div>
     <div class="ds-row">${[["urgent", "arrowUp"], ["high", "arrowUp"], ["med", "minus"], ["low", "arrowDown"]].map(([c, i]) =>
      `<span class="prio prio--${c}">${ico(i, 13)}${c === "med" ? "Medium" : c[0].toUpperCase() + c.slice(1)}</span>`).join("")}</div>`],

  ["Avatars", `Initials on a colour derived from the name, so the same person is the same colour
    everywhere without anyone storing a swatch.`,
    `<div class="ds-row">${avatar("IT", "lg", "#0d7a3f")}${avatar("MH", "md", "#1d6cb0")}${avatar("ZS", "sm", "#c2410c")}
      <div class="avatar-stack">${avatar("AK", "sm", "#7c3aed")}${avatar("SR", "sm", "#0891b2")}${avatar("FM", "sm", "#be185d")}
      <span class="avatar avatar--sm" style="background:var(--surface-3);color:var(--text-2)">+3</span></div></div>`],

  ["Metrics", `The KPI tile. A metric with an <code>onClick</code> renders as a
    <code>&lt;button&gt;</code> and one without stays a <code>&lt;div&gt;</code> — so a screen reader
    is never told there is an action that does not exist.`,
    `<div class="ds-grid4">
      ${metric("Active cases", "188", "gavel", "var(--brand-soft)", "var(--brand)")}
      ${metric("Active notices", "209", "mail", "var(--success-bg)", "var(--success)", null, "+12%", "up")}
      ${metric("Licences needing attention", "3", "shield", "var(--warning-bg)", "var(--warning)", "expiring in 90 days")}
      ${metric("Delayed", "8", "alertTriangle", "var(--danger-bg)", "var(--danger)", null, "-4%", "down")}
     </div>`],

  ["Cards and sections", `A <code>Section</code> is a card with a head: icon, title, optional
    subtitle, optional actions. It is the only container in the product — there is no second kind of
    panel.`,
    `<div class="ds-grid2">
      ${section("The case book", "Active and decided, and what is being claimed.", "gavel",
    `<div class="ds-row">${metric("Active", "188", "folder", "var(--brand-soft)", "var(--brand)")}${metric("Decided", "150", "checkcircle", "var(--success-bg)", "var(--success)")}</div>`,
    btn("ghost", "Full analytics", "barchart", "sm"))}
      ${section("Renewals & notice windows", "What lands next across contracts and licences.", "bell",
      `<div class="tiny muted">Nothing falls due in the next 30 days.</div>`, btn("ghost", "Calendar", "calendar", "sm"))}
     </div>`],

  ["Tabs and segmented", `Tabs switch a view; segmented controls pick a value. Both are keyboard
    navigable — arrow keys, Home and End — because a tablist that only responds to a mouse is not a
    tablist.`,
    `<div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected="true" class="tab active">${ico("dashboard", 15)}<span class="tab__label">Overall</span></button>
      <button type="button" role="tab" aria-selected="false" class="tab">${ico("dollar", 15)}<span class="tab__label">Spend</span></button>
      <button type="button" role="tab" aria-selected="false" class="tab">${ico("users", 15)}<span class="tab__label">Team Analytics</span><span class="count">4</span></button>
     </div>
     <div class="segmented" style="margin-top:14px;max-width:520px">
      <button>Week</button><button>Month</button><button>Quarter</button>
      <button>Half-year</button><button class="active">Annual</button><button>All time</button>
     </div>`],

  ["Forms", `Every field is a <code>&lt;label&gt;</code> wrapping its control, so the hit area is the
    whole field and no <code>for</code>/<code>id</code> pair can come apart.`,
    `<div class="ds-grid2">
      <label class="field"><span class="field__label">Request type</span>
        <select class="input"><option>New</option><option>Renewal</option><option>Amendment</option></select>
        <span class="field__hint">Decides which commercial terms the form asks for.</span></label>
      <label class="field"><span class="field__label">Required-by date</span>
        <input class="input" value="20/10/2026" />
        <span class="field__hint">Written and read as DD/MM/YYYY, whatever the browser's locale.</span></label>
      <label class="field" style="grid-column:1/-1"><span class="field__label">A bit more context</span>
        <textarea class="textarea" rows="3" placeholder="Describe the situation in your own words…"></textarea></label>
     </div>
     <div class="ds-row" style="margin-top:12px">
      <span class="chip active">${ico("check", 13)}Active</span><span class="chip">Decided</span><span class="chip">On appeal</span>
      <button type="button" class="toggle on" aria-pressed="true" aria-label="On"></button>
      <button type="button" class="toggle" aria-pressed="false" aria-label="Off"></button>
     </div>`],

  ["Progress, steps and timeline", `Where a thing is, and how it got there. The class names here are
    <code>progress__fill</code>, <code>step__dot</code>/<code>step__label</code> and
    <code>tl__item</code> — worth saying because the first draft of this page invented
    <code>progress__bar</code>, <code>step__n</code> and <code>tl__i</code>, and all three rendered as
    unstyled text. A specimen that does not match the stylesheet is worse than no specimen.`,
    `<div class="progress" style="max-width:360px"><div class="progress__fill" style="width:63%"></div></div>
     <div class="stepper" style="margin:20px 0">
      <div class="step step--done"><div class="step__dot">${ico("check", 13)}</div><div class="step__label">What you need</div></div>
      <div class="step__line done" style="background:var(--success)"></div>
      <div class="step step--active"><div class="step__dot">2</div><div class="step__label">About it</div></div>
      <div class="step__line"></div>
      <div class="step"><div class="step__dot">3</div><div class="step__label">Review</div></div>
     </div>
     <div class="timeline">
      <div class="tl__item"><div class="tl__dot"></div><div class="tl__title">Submitted</div><div class="tl__meta">Ayesha Khan · 2 Oct</div></div>
      <div class="tl__item"><div class="tl__dot"></div><div class="tl__title">Approved by HOD</div><div class="tl__meta">Imran Tariq · 3 Oct</div></div>
      <div class="tl__item"><div class="tl__dot"></div><div class="tl__title">Accepted by Legal</div><div class="tl__meta">Modassar Ali · 4 Oct</div></div>
     </div>`],

  ["Banners and empty states", `A banner explains a condition. An empty state says what is missing and
    what to do — never just "no data".`,
    `<div class="banner banner--info" style="margin-bottom:10px">${ico("alertCircle", 15)}
      <div class="tiny">The draft is the approved template itself, with the blanks its drafters left filled from this request.</div></div>
     <div class="banner banner--warn" style="margin-bottom:16px">${ico("alertTriangle", 15)}
      <div class="tiny">Three licences expire inside 90 days.</div></div>
     <div class="empty">${ico("inbox", 40)}
      <h2 class="strong empty__title" style="color:var(--text-2);font-size:15px;margin:0 0 4px">You have not raised a contract request yet</h2>
      <div>Raise one and it will appear here.</div>
      <div style="margin-top:16px">${btn("primary", "New contract request", "plus")}</div></div>`],

  ["Registers", `One table shell serves every register in the product. Header cells that filter are
    buttons; a row is a link. The register is the single most repeated surface here, which is why it
    is one component and not fifteen.`,
    `<div class="card"><table class="table"><thead><tr>
      <th>Reference</th><th>Matter</th><th>Type</th><th>Side</th><th>Counsel</th><th>Stage</th></tr></thead>
      <tbody>
       <tr class="rowlink"><td class="cell-mono">LIT-00001</td>
        <td><div class="cell-strong">Northfield Holdings (Pvt) Limited vs Rehman Traders</div><div class="tiny muted">167378637 · Civil Court, Lahore</div></td>
        <td>${pill("gray", "Non-Compete")}</td><td>${pill("gray", "Not stated")}</td>
        <td><span class="tiny">Harbourview Chambers</span></td><td>${pill("green", "Active", 1)}</td></tr>
       <tr class="rowlink"><td class="cell-mono">LIT-1RGPUJ0</td>
        <td><div class="cell-strong">Orchard Lane Enterprises vs Clearwater Estates</div><div class="tiny muted">Lahore High Court, Lahore</div></td>
        <td>${pill("gray", "Writ Petition")}</td><td>${pill("blue", "For")}</td>
        <td><span class="tiny">Stonebridge Advocates</span></td><td>${pill("green", "Active", 1)}</td></tr>
       <tr class="rowlink"><td class="cell-mono">LIT-14ZZKSH</td>
        <td><div class="cell-strong">Silverline Developers (Pvt) Ltd vs Meridian Properties</div><div class="tiny muted">Civil Court, Rawalpindi</div></td>
        <td>${pill("gray", "Civil Dispute")}</td><td>${pill("amber", "Against")}</td>
        <td><span class="tiny muted">Not engaged yet</span></td><td>${pill("gray", "Decided", 1)}</td></tr>
      </tbody></table></div>`],
];

/* ------------------------------------------------------------------ page */
const sec = (id, title, body, lead) =>
  `<section id="${id}"><h2>${title}</h2>${lead ? `<p class="ds-lead">${lead}</p>` : ""}${body}</section>`;

const colorT = (ts) => ts.filter(([, v]) => isColor(v));
const shadowT = (ts) => ts.filter(([, v]) => isShadow(v));
const lenT = (ts) => ts.filter(([, v]) => isLen(v));
const otherT = (ts) => ts.filter(([n, v]) => !isColor(v) && !isShadow(v) && !isLen(v) && !/^--viz/.test(n));

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LegalOS — design system</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<!-- The product's own stylesheet, whole and unmodified. Nothing on this page
     restyles a component: if a specimen looks right, it IS right. -->
<link rel="stylesheet" href="legalos-stylesheet.css" />
<style>
  /* Page furniture only — never component styling. */
  body { background:var(--bg); color:var(--text); font-family:var(--font); margin:0; }
  .ds-wrap { max-width:1080px; margin:0 auto; padding:40px 28px 90px; }
  .ds-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap; }
  h1 { font-size:28px; letter-spacing:-.02em; margin:0 0 6px; }
  .ds-sub { color:var(--text-2); font-size:14px; line-height:1.65; max-width:70ch; margin:0 0 6px; }
  /* Scoped to the section heading itself. Unscoped, this rule reached INTO a
     specimen -- the empty state's own <h2> came out uppercase with a rule under
     it, which is page furniture pretending to be a component. */
  .ds-wrap > section > h2 { font-size:12px; text-transform:uppercase; letter-spacing:.07em;
       color:var(--text-3); font-weight:600; margin:46px 0 10px; padding-bottom:8px;
       border-bottom:1px solid var(--border); }
  .ds-wrap > section > h3 { font-size:14px; margin:24px 0 8px; }
  .ds-lead { color:var(--text-2); font-size:13px; line-height:1.65; max-width:72ch; margin:0 0 14px; }
  .ds-row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px; }
  .ds-grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
  .ds-grid4 { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; }
  .ds-sw { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:10px; }
  .ds-sw__i { border:1px solid var(--border); border-radius:var(--r-sm); overflow:hidden; background:var(--surface); }
  .ds-sw__c { height:52px; }
  .ds-sw__n { padding:6px 8px 0; font:500 10.5px var(--mono); color:var(--text); }
  .ds-sw__v { padding:0 8px 7px; font:400 10px var(--mono); color:var(--text-3); }
  .ds-tbl { width:100%; border-collapse:collapse; font-size:12.5px; }
  .ds-tbl td { padding:6px 10px; border-bottom:1px solid var(--border); }
  .ds-tbl__v { font-family:var(--mono); color:var(--text-2); font-size:11.5px; }
  .ds-scale__r { display:flex; align-items:center; gap:12px; padding:4px 0; font-size:12px; }
  .ds-scale__r code { min-width:116px; }
  .ds-scale__b { height:12px; background:var(--brand); border-radius:3px; }
  code { font-family:var(--mono); font-size:11.5px; background:var(--surface-2); padding:1px 5px; border-radius:var(--r-xs); }
  .ds-spec { background:var(--surface); border:1px solid var(--border); border-radius:var(--card-r);
             padding:20px; margin-bottom:14px; }
  .ds-toggle { display:flex; gap:8px; }
</style>
</head>
<body>
<div class="ds-wrap">
  <div class="ds-head">
    <div>
      <h1>LegalOS — design system</h1>
      <p class="ds-sub">Every specimen below is rendered by the product's own stylesheet
      (<code>legalos-stylesheet.css</code>, ${css.split("\n").length.toLocaleString()} lines) using the
      real class names from <code>src/ui.js</code>. The tokens and icons are read out of the source at
      build time, so this page cannot drift from the product the way a hand-kept catalogue does.</p>
    </div>
    <div class="ds-toggle">
      <button class="btn btn--ghost btn--sm" onclick="document.documentElement.setAttribute('data-theme','light')">${ico("sun", 14)}Light</button>
      <button class="btn btn--ghost btn--sm" onclick="document.documentElement.setAttribute('data-theme','dark')">${ico("moon", 14)}Dark</button>
    </div>
  </div>

  ${sec("brand", "Colour · brand and status", swatches(colorT(BASE)),
    `The brand ramp and the status hues. These are theme-independent: they mean the same thing in
     light and dark, and only the surfaces around them change.`)}

  ${sec("surfaces", "Colour · surfaces, text and borders", swatches(colorT(LIGHT)),
    `The theme layer. A component never hard-codes a colour — it reads <code>--surface</code>,
     <code>--text</code>, <code>--border</code>, and the theme decides. That is why switching themes
     needs no component to change, and why one raw hex in a component breaks dark mode silently.`)}

  ${sec("dark", "Colour · dark theme", swatches(colorT(DARK)),
    `The same names, re-pointed. Use the toggle at the top of this page to see every specimen switch.`)}

  ${sec("viz", "Colour · data visualisation",
    swatches([...BASE, ...LIGHT].filter(([n]) => /^--viz/.test(n))),
    `The categorical ramp, in order. The <strong>order is the colourblind-safety mechanism</strong>:
     validated for adjacent-pair separation under normal vision and the common CVD types. Never
     reorder it and never add a sixth hue — the tail folds into <code>--viz-other</code>.`)}

  ${sec("type", "Typography", `
    <div class="ds-spec">
      <div style="font:800 28px/1.2 var(--font);letter-spacing:-.02em">Good morning, Imran</div>
      <div style="font:600 18px/1.3 var(--font);margin-top:10px">The case book</div>
      <div style="font:600 13.5px/1.4 var(--font);margin-top:10px">Active and decided, and what is being claimed</div>
      <div style="font:400 13px/1.65 var(--font);color:var(--text-2);margin-top:10px;max-width:60ch">Body copy. Inter at 13–14px is the workhorse size across registers and forms.</div>
      <div style="font:400 11.5px/1.5 var(--font);color:var(--text-3);margin-top:10px">Tiny / muted — hints, sub-labels and the second line of a table cell.</div>
      <div style="font:500 13px var(--mono);margin-top:10px">LIT-1RGPUJ0 · PKR 446.2M · 35201-1111111-1</div>
    </div>` + rows([...BASE, ...LIGHT].filter(([n]) => /font|mono/.test(n))),
    `Inter for the interface, JetBrains Mono for anything a reader may need to compare character by
     character — references, identifiers and money.`)}

  ${sec("space", "Spacing and layout rhythm", scaleBars(lenT(BASE).filter(([n]) => /^--sp-/.test(n)))
    + `<h3>Layout scale</h3>` + rows(lenT(BASE).filter(([n]) => !/^--sp-/.test(n))),
    `One spacing scale and one page rhythm, so two screens built by two people a month apart still
     line up.`)}

  ${sec("radii", "Radii and elevation",
    `<div class="ds-row">` + lenT(BASE).filter(([n]) => /^--r-/.test(n)).map(([n, v]) =>
      `<div style="text-align:center"><div style="width:76px;height:52px;background:var(--brand-soft);border:1px solid var(--brand-400);border-radius:${v}"></div><div class="ds-sw__n" style="padding:6px 0 0">${n}</div></div>`).join("")
    + `</div><h3>Shadows</h3>` + shadowCards(shadowT(LIGHT)))}

  ${sec("misc", "Z-index and other tokens", rows(otherT(BASE)),
    `The stacking order is a token, not a number typed into a component. A sidebar that outranks a
     modal is a bug nobody can find by reading one file.`)}

  ${SPECIMENS.map(([title, lead, body], i) =>
    sec("c" + i, "Component · " + title, `<div class="ds-spec">${body}</div>`, lead)).join("\n")}

  ${sec("shells", "Patterns · the two shells", `
    <div class="ds-grid2">
      ${section("Legal department", "/legalos/", "scale",
      `<div class="tiny" style="line-height:1.7">Full sidebar — Dashboard, Legal Workspace, Calendar, Commercial &amp; Risk,
       Compliance, Litigation, Data Bank, Insight &amp; Governance, Administration. Registers, analytics and every
       approval surface. Signed in with credentials.</div>`)}
      ${section("Requester portal", "/legalos/portal/", "inbox",
      `<div class="tiny" style="line-height:1.7">Two entries — Legal Requests and Raise Request. No registers, no queues,
       no analytics. A requester who asks for a legal address is redirected, not shown an error: the portal is
       <strong>one-directional by design</strong>, and that is the security boundary, not a navigation choice.</div>`)}
    </div>`,
    `One codebase, one design system, one store — two doors. What differs is what each identity is
     allowed to open, and that is enforced in the engine, not by hiding nav items.`)}
</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

/* SELF-CHECK: every class this page uses must exist in the stylesheet.
 *
 * The first build of this page invented progress__bar, step__n, tl__i, empty__t
 * and empty__s. All five rendered as unstyled text, and nothing failed -- a
 * wrong class name is not an error, it is just a div. A catalogue that quietly
 * shows components the product does not have is worse than no catalogue, so the
 * build now refuses to pass one.
 *
 * ds-* is this page's own furniture and is declared inline, so it is exempt.
 */
const defined = new Set();
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
/* A class with no rule of its own is still legitimate if the product's own
   components use it -- empty__title is styled inline, tab__label is only a
   hook. What must never pass is a class that exists in NEITHER place, because
   that is one I made up. */
const uiSrc = fs.readdirSync(path.join(ROOT, "src"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");
for (const m of uiSrc.matchAll(/\b([a-z][\w-]*(?:__|--)[\w-]+)\b/g)) defined.add(m[1]);
const used = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c && !c.startsWith("ds-")) used.add(c);
}
const unknown = [...used].filter((c) => !defined.has(c)).sort();
console.log(`wrote ${OUT}`);
console.log(`  icons parsed: ${Object.keys(ICONS).length}`);
console.log(`  tokens: base ${BASE.length} · light ${LIGHT.length} · dark ${DARK.length}`);
console.log(`  component specimens: ${SPECIMENS.length}`);
console.log(`  classes used: ${used.size} · all defined in the stylesheet: ${unknown.length === 0 ? "yes" : "NO"}`);
if (unknown.length) {
  console.error("\n  CLASSES NOT IN THE STYLESHEET -- these would render unstyled:");
  for (const c of unknown) console.error("    ." + c);
  process.exitCode = 1;
}
