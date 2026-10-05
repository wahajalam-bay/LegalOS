// THE SECP SCREEN AS A LEGAL USER HAS TO NAVIGATE IT.
//
// The data behind SECP was correct before any of this ran; the structure over
// it was not. Seven tabs covered five things -- "Entities", "Compliance years"
// and "Annual compliance" were three doors onto the same 250 entity-year
// records -- the overview opened on a paragraph of prose above figures that
// went nowhere, and no column could be sorted.
//
// What this suite holds in place:
//   · five tabs, and the two retired ones still resolve rather than 404
//   · the overview is a set of doors: every KPI is clickable
//   · Drive's own bifurcations (Group/Non-group, legal form) are ON the screen
//   · one register, every column sortable, filters in the URL, chips to undo
//   · entity -> compliance year -> filing -> document works end to end
//   · documents are split by the category Drive filed them under
//
// AND THE BIFURCATION THE POC ASKED FOR, WHICH IS NOT A FILTER MENU:
//   · Group / Non-group and Private / SMC / Public are ON the overview
//   · Partnerships and Foreign/Offshore are their own branches, never mixed
//     into the company-filing population and never given an AGM or a Form A
//   · Drive-backed CY history never mixes with future generated obligations
//   · every count, the search and the export follow the selected branch
//   · the branch survives the drill-down, and Back restores it
//
// AND THAT THE SCREENS AGREE ABOUT THE NUMBERS. Every figure here overlapped
// with another one somewhere: the estate has 3,367 distinct statutory files but
// summing the three populations gave 3,451 because an event filing's documents
// ARE the compliance-year folder's documents; "Upcoming obligations" counted 43
// companies in the tab and 147 requirements in the KPI. Two screens in one tool
// must not disagree about one number, so the totals are asserted against the
// source, not against each other.
//
//   node tests/m30-secp-information-architecture.js
const H = require("./_harness.js");

H.runSuite("SECP information architecture", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M30_PORT", portFallback: "4978", prefix: "legalos-m30-",
  }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));

  const nrows = () => p.evaluate(() => document.querySelectorAll("table.table tbody tr").length);
  const hash = () => p.evaluate(() => location.hash);
  const text = () => p.evaluate(() => document.body.innerText);

  /* ------------------------------------------------------ the source totals */

  const records = require("../api/secp-records.js");
  const sum = records.summary();
  const distinct = (() => {
    const ids = new Set();
    for (const coll of [records.annualCompliance(), records.eventFilings(), records.statutoryRegisters()]) {
      for (const r of coll) for (const d of (r.documents || [])) ids.add(d.id);
    }
    return ids.size;
  })();
  /* `documents` is DISTINCT INSTRUMENTS, deduplicated within a company; the
     three per-population counts overlap (an event filing's documents are the
     compliance year's documents) and also double-count the same instrument
     filed in two source folders. So the estate total is below both the summed
     figure and the distinct-file count, and `physicalFiles` is the file count. */
  check("the estate's document total is distinct instruments, not the sum of three overlapping counts",
    sum.physicalFiles === distinct
      && sum.documents <= sum.physicalFiles
      && sum.documents < sum.documentsOnAnnualRecords + sum.documentsOnEventFilings + sum.documentsOnRegisters,
    sum.documents + " instruments across " + sum.physicalFiles + " files, against "
      + (sum.documentsOnAnnualRecords + sum.documentsOnEventFilings + sum.documentsOnRegisters) + " summed");
  /* "Upcoming obligations" carried two wrong numbers before this. The overview
     printed 43 -- the COMPANY count -- and then 147, the raw requirement list,
     which includes the 60 the company has already filed the document for. The
     number a Legal user means is the work still to do. */
  const allReqs = records.upcomingObligations().reduce((n, u) => n + u.requirements.length, 0);
  const reqs = records.upcomingObligations().reduce((n, u) =>
    n + u.requirements.filter((i) => i.documentStatus !== "AVAILABLE").length, 0);
  check("an upcoming obligation is a requirement still owed — not a company, and not one already met",
    sum.upcomingObligations === reqs && reqs !== sum.entities && reqs < allReqs,
    reqs + " still owed, of " + allReqs + " requirements across " + sum.entities + " companies");

  /* ------------------------------------------------------------- the tabs */

  await H.goHash(p, "/compliance/sec-filings?sview=overview");
  await H.sleep(3200);
  const tabs = await p.evaluate(() =>
    [...document.querySelectorAll(".fltbtn")].map((b) => b.innerText.trim()).slice(0, 6));
  check("five tabs, not seven",
    tabs.filter((t) => /Compliance years|Annual compliance/i.test(t)).length === 0
      && tabs.some((t) => /Entities & filing history/i.test(t)),
    tabs.join(" | "));
  const upcomingTab = tabs.find((t) => /Upcoming/i.test(t)) || "";
  check("the tab and the source agree on how many obligations there are",
    upcomingTab.includes(String(reqs)), upcomingTab);

  for (const retired of ["years", "annual"]) {
    await H.goHash(p, "/compliance/sec-filings?sview=" + retired);
    await H.sleep(1600);
    const rows = await nrows();
    check("an old link to the retired '" + retired + "' tab still lands somewhere real",
      rows > 0, rows + " rows");
  }

  /* ---------------------------------------------------------- the overview */

  await H.goHash(p, "/compliance/sec-filings?sview=overview");
  await H.sleep(2600);
  const kpis = await p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].map((n) => n.innerText.replace(/\s+/g, " ").trim()));
  check("the overview opens on figures, not on prose", kpis.length >= 6, kpis.join("  |  "));
  const clickable = await p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].filter((n) => n.getAttribute("role") === "button").length);
  check("every KPI is a door", clickable === kpis.length, clickable + " of " + kpis.length);
  check("the KPI reports the estate's real document total",
    kpis.some((k) => k.includes(sum.documents.toLocaleString())),
    kpis.find((k) => /Statutory documents/i.test(k)) || "missing");
  const head = (await text()).slice(0, 900);
  check("the AI explanation is no longer the first thing on the page",
    !/What these numbers are/i.test(head), "moved below the figures");
  const body = await text();
  check("the AI explanation is still on the page, underneath",
    /What these numbers are/i.test(body), "kept at the foot");
  check("Drive's Group / Non-group split is visible without opening a filter menu",
    /Group entities/i.test(body) && /Non-group entities/i.test(body), "on screen");
  check("legal form is bifurcated Private / SMC / Public only",
    /Private limited/i.test(body) && /Single member company/i.test(body) && /Public limited/i.test(body)
      && !/\bForeign\b/.test(body.split("Legal form")[1] || "").valueOf(),
    "three forms, no Foreign or Unknown card");

  // a KPI takes you to the register it counts
  await p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].find((n) => /Event filings/i.test(n.innerText)).click());
  await H.sleep(1800);
  check("clicking a KPI opens the register it counts", /sview=event/.test(await hash()), await hash());

  /* ---------------------------------------------------------- the register */

  await H.goHash(p, "/compliance/sec-filings?sview=entities");
  await H.sleep(2600);
  const all = await nrows();
  check("the register lists the Drive estate", all === sum.entities, all + " rows");
  const heads = await p.evaluate(() =>
    [...document.querySelectorAll("table.table thead th .thsort")].map((b) => b.innerText.trim()));
  check("every data column is sortable", heads.length === 10, heads.join(" | "));

  await p.evaluate(() =>
    [...document.querySelectorAll(".thsort")].find((b) => /documents/i.test(b.innerText)).click());
  await H.sleep(900);
  check("sort state travels in the URL", /esort=docs/.test(await hash()) && /edir=desc/.test(await hash()), await hash());
  const col = () => p.evaluate(() => [...document.querySelectorAll("table.table tbody tr")]
    .map((r) => parseInt(r.children[8].innerText.replace(/\D/g, ""), 10) || 0));
  const desc = await col();
  check("a count column opens biggest-first — nobody sorts to find the zeroes",
    desc[0] >= desc[desc.length - 1] && desc[0] > 0, desc.slice(0, 3).join(",") + " … " + desc.slice(-2).join(","));
  await p.evaluate(() =>
    [...document.querySelectorAll(".thsort")].find((b) => /documents/i.test(b.innerText)).click());
  await H.sleep(800);
  const asc = await col();
  check("clicking the same column again reverses it", asc[0] <= asc[asc.length - 1],
    asc.slice(0, 3).join(",") + " … " + asc.slice(-2).join(","));

  await H.goHash(p, "/compliance/sec-filings?sview=entities&group=group&form=SMC");
  await H.sleep(2000);
  const filtered = await nrows();
  check("a filtered register is a link somebody can send", filtered > 0 && filtered < all,
    filtered + " of " + all + " for group + SMC");
  const chips = await p.evaluate(() =>
    [...document.querySelectorAll(".fltbtn--on")].map((b) => b.innerText.trim()));
  check("what is filtering the register is shown as chips",
    chips.some((c) => /Group entities/i.test(c)) && chips.some((c) => /Single member/i.test(c)),
    chips.filter((c) => /✕/.test(c)).join(" | "));
  await p.evaluate(() =>
    [...document.querySelectorAll(".fltbtn--on")].find((b) => /Group entities/i.test(b.innerText)).click());
  await H.sleep(900);
  check("a chip removes its own filter and nothing else",
    !/group=group/.test(await hash()) && /form=SMC/.test(await hash()), await hash());

  await H.goHash(p, "/compliance/sec-filings?sview=entities&eq=deevar");
  await H.sleep(1800);
  const found = await p.evaluate(() => [...document.querySelectorAll("table.table tbody tr td:first-child .cell-strong")]
    .map((c) => c.innerText.trim()));
  check("search narrows the register", found.length > 0 && found.every((n) => /deevar/i.test(n)),
    found.join(", ").slice(0, 80));

  /* ------------------------------ entity -> year -> filing -> document */

  await p.evaluate(() => document.querySelector("table.table tbody tr").click());
  await H.sleep(2800);
  check("the whole row opens the company", /\/entity\//.test(await hash()), await hash());

  const etabs = () => p.evaluate(() =>
    [...document.querySelectorAll(".regtab")].map((b) => b.innerText.replace(/\s+/g, " ").trim()));
  const et = await etabs();
  check("the company is a workspace, not a six-section scroll", et.length === 6, et.join(" | "));
  const ekpis = await p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].map((n) => n.innerText.replace(/\s+/g, " ").trim()));
  check("years covered reads as a range, not a count",
    ekpis.some((k) => /\d{4}.\d{4}/.test(k)), ekpis.find((k) => /Years covered/i.test(k)) || "missing");

  const docKpi = ekpis.find((k) => /Documents/i.test(k)) || "";
  const docTab = et.find((t) => /Documents/i.test(t)) || "";
  check("the company's document count is the same number in both places",
    docKpi.replace(/\D/g, "") === docTab.replace(/\D/g, ""), docKpi + " / " + docTab);

  const years = await p.evaluate(() =>
    [...document.querySelectorAll("table.table tbody tr td:first-child")].map((c) => c.innerText.trim()));
  check("filing history reads newest first", years.length > 1 && years[0] > years[years.length - 1],
    years.join(" "));

  await p.evaluate(() => document.querySelector("table.table tbody tr").click());
  await H.sleep(2600);
  check("a compliance year opens its own page", /\/year\//.test(await hash()), await hash());
  await p.goBack();
  await H.sleep(2200);

  const clickTab = (re) => p.evaluate((r) => {
    const b = [...document.querySelectorAll(".regtab")].find((x) => new RegExp(r, "i").test(x.innerText));
    if (!b) throw new Error("no tab matching " + r);
    b.click();
  }, re);
  await clickTab("Documents");
  await H.sleep(1800);
  const sections = await p.evaluate(() =>
    [...document.querySelectorAll(".card__title")].map((n) => n.innerText.trim()).filter(Boolean));
  check("documents are split by the category Drive filed them under",
    sections.length >= 2 && sections.some((t) => /register/i.test(t)), sections.slice(0, 5).join(" | "));
  const files = await p.evaluate(() => document.querySelectorAll(".feed__item.clickable").length);
  check("every document is clickable", files > 0, files + " files");

  await p.evaluate(() => document.querySelector(".feed__item.clickable").click());
  await H.sleep(6000);
  const viewer = await p.evaluate(() => !!document.querySelector(".doclb__panel"));
  check("a document opens IN the app, not as a Drive redirect",
    viewer && /\/entity\//.test(await p.evaluate(() => location.hash)).valueOf() !== false,
    viewer ? "rendered in-app, still on the entity page" : "no viewer");
  const rendered = await p.evaluate(() => {
    const el = document.querySelector(".doclb__panel");
    if (!el) return "no viewer";
    if (el.querySelector("iframe, embed, object, img, canvas")) return "renders the file";
    const t = el.innerText.replace(/\s+/g, " ").trim();
    return t.length > 400 ? "renders text (" + t.length + " chars)" : "THIN: " + t.slice(0, 140);
  });
  check("the document itself renders, rather than offering a download",
    !/^no viewer|^THIN/.test(rendered), rendered);

  /* ------------------------------------------------------- the bifurcation */

  await H.goHash(p, "/compliance/sec-filings?sview=entities");
  await H.sleep(2400);
  const scopes = await p.evaluate(() =>
    [...document.querySelectorAll("#secp-ent-scope option")].map((o) => o.textContent.trim()));
  check("scope offers the branches as branches, not as a filter",
    scopes.some((o) => /In-scope SECP/i.test(o)) && scopes.some((o) => /Foreign/i.test(o))
      && scopes.some((o) => /Partnership/i.test(o)) && scopes.some((o) => /All known/i.test(o)),
    scopes.join(" | "));
  check("the register defaults to the company-filing population, not everything",
    (await nrows()) === sum.entities, (await nrows()) + " rows");

  const kpiStrip = () => p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].map((n) => n.innerText.replace(/\s+/g, " ").trim()));
  const unfiltered = await kpiStrip();
  check("the register carries counts of its own", unfiltered.length === 7, unfiltered.join("  |  "));
  const numOf = (ks, re) => parseInt((ks.find((k) => re.test(k)) || "0").replace(/\D/g, ""), 10);
  check("the register's document total is the estate's, to the file",
    numOf(unfiltered, /Documents/i) === sum.documents,
    numOf(unfiltered, /Documents/i) + " against " + sum.documents);

  await H.goHash(p, "/compliance/sec-filings?sview=entities&group=group");
  await H.sleep(1800);
  const grouped = await kpiStrip();
  check("choosing a branch recalculates every count, not just the row total",
    numOf(grouped, /Documents/i) < numOf(unfiltered, /Documents/i)
      && numOf(grouped, /Entity-year/i) < numOf(unfiltered, /Entity-year/i),
    numOf(grouped, /Documents/i) + " documents for Group, against " + numOf(unfiltered, /Documents/i) + " for all");

  await H.goHash(p, "/compliance/sec-filings?sview=entities&escope=partnership");
  await H.sleep(1800);
  const pbody = await text();
  check("a partnership owes SECP nothing, and is shown owing nothing rather than having filed nothing",
    /SECP company filing: not applicable/i.test(pbody) && /Form A/i.test(pbody), "stated on screen");
  const pcols = await p.evaluate(() =>
    [...document.querySelectorAll("table.table thead th")].map((n) => n.innerText.trim()));
  check("an out-of-scope branch drops the filing columns instead of filling them with dashes",
    pcols.length === 3, pcols.join(" | "));

  await H.goHash(p, "/compliance/sec-filings?sview=entities&escope=foreign");
  await H.sleep(1600);
  const foreign = await nrows();
  check("foreign / offshore is its own branch, outside the default population",
    foreign > 0 && foreign < sum.entities, foreign + " entities");

  await H.goHash(p, "/compliance/sec-filings?sview=entities&group=group&form=SMC&eq=zameen");
  await H.sleep(1800);
  const hits = await p.evaluate(() => [...document.querySelectorAll("table.table tbody tr")]
    .map((r) => ({ n: r.children[0].innerText, f: r.children[1].innerText.trim() })));
  check("search searches inside the branch, never across it",
    hits.length > 0 && hits.every((x) => /zameen/i.test(x.n) && /single member/i.test(x.f) && /Group/.test(x.n)),
    hits.length + " hits, every one group + SMC");

  const exportBtn = await p.evaluate(() =>
    !!([...document.querySelectorAll("button")].find((b) => /Export this branch/i.test(b.innerText))));
  check("export offers the branch on screen, not the whole estate", exportBtn, "export is branch-scoped");

  await H.goHash(p, "/compliance/sec-filings?sview=entities&group=group&form=PUBLIC&cyfrom=2022&cyto=2026");
  await H.sleep(2000);
  await p.evaluate(() => document.querySelector("table.table tbody tr").click());
  await H.sleep(2600);
  check("the branch travels into the company", /from=/.test(await hash()), (await hash()).slice(-70));
  await p.evaluate(() => {
    const b = [...document.querySelectorAll(".page button")].find((x) => /All entities|SECP filings/i.test(x.innerText));
    if (!b) throw new Error("no back button on the entity page");
    b.click();
  });
  await H.sleep(2200);
  const back = await hash();
  check("Back restores the branch that was left, not a reset register",
    /group=group/.test(back) && /form=PUBLIC/.test(back) && /cyfrom=2022/.test(back), back.slice(-70));

  /* Drive-backed history and generated future work must never share a table. */
  const thisYear = new Date().getFullYear();
  const historical = records.annualCompliance().filter((r) => r.complianceYear > thisYear + 1);
  check("no generated future year is sitting in the Drive-backed CY history",
    historical.length === 0,
    historical.length ? historical.slice(0, 3).map((r) => r.sourcePeriodLabel).join(", ") : "history is Drive folders only");

  check("no page error anywhere in the SECP experience", errs.length === 0,
    errs.slice(0, 3).join(" ;; ") || "none");

  try { await p.close(); await browser.close(); } catch (e) { /* the browser is going away anyway */ }
});
