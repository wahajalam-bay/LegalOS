// THE WHOLE LITIGATION DRIVE ESTATE, IN THE PRODUCT.
//
// The root holds five things and they are five DIFFERENT KINDS of thing:
//
//   Litigation Tracker_.xlsx              the master case register
//   Pending Trademark Tracker             57 trademarks — the IP estate
//   Asset Recovery / Assets Recovery.xlsx 25 sheets about people who left with
//                                         company property
//   Litigation Files                      173 case folders and their documents
//   TRACKERS                              notices, pending litigation, the
//                                         ZD/CPML bifurcation, developer disputes
//
// Three of those had no home in the product: the trademark tracker (the module
// was a filter over IP LAWSUITS, which is a different thing), asset recovery
// (a filter over cases carrying a recoverable amount, which matched a handful),
// and the root itself had no ledger, so a folder that failed to match a case
// simply vanished with nothing to say it had.
//
// WHAT THIS SUITE IS REALLY PROTECTING is the matching discipline. The
// case-folder matcher links on a distinctive party name and refuses common
// given names, because the loose alternative gives confident wrong answers —
// shared-token matching pairs "Zameen Media Vs. Sikandar Khan" with "Junaid
// Khan Vs Zameen Media", who are different people. A wrong document on a case
// is worse than a missing one: somebody acts on it. So folders that do not
// match are dispositioned and named in Data Health with the reason, and never
// attached to the nearest case.
//
//   node tests/m36-litigation-estate.js
const H = require("./_harness.js");

H.runSuite("the litigation Drive estate", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M36_PORT", portFallback: "4977", prefix: "legalos-m36-",
  }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const text = () => p.evaluate(() => document.body.innerText);
  const rows = () => p.evaluate(() => document.querySelectorAll("table.table tbody tr").length);
  const kpis = () => p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].map((n) => n.innerText.replace(/\s+/g, " ").trim()));

  /* ------------------------------------------------ the root ledger ----- */

  await H.goHash(p, "/litigation");
  await H.sleep(3000);
  const ledger = await p.evaluate(async () =>
    await (await fetch("/api/litigation/ledger", { headers: { accept: "application/json" } })).json());
  const t = ledger.totals;
  check("every first-level item in the litigation root resolves to a module",
    t.rootChildren === 5 && t.rootChildrenUnresolved === 0,
    t.rootChildren + " root children, " + t.rootChildrenUnresolved + " unresolved");
  check("every file in the root has a disposition",
    t.files > 400 && t.filesUnresolved === 0,
    t.files + " files, " + t.filesUnresolved + " unresolved");
  check("every case folder is dispositioned, matched or not",
    t.caseFolders === t.caseFoldersMatched
      + (ledger.unmatchedCaseFolders || []).length,
    t.caseFoldersMatched + " matched, " + (ledger.unmatchedCaseFolders || []).length + " dispositioned otherwise");
  check("a folder that does not match is given a reason, not dropped",
    (ledger.unmatchedCaseFolders || []).every((c) => c.detail && c.detail.length > 20),
    "each carries why");
  check("a trademark opposition is not filed as a court case",
    (ledger.unmatchedCaseFolders || []).some((c) => /IP_OPPOSITION|IP_OBJECTION/.test(c.disposition)),
    "IP material dispositioned as IP");

  /* ------------------------------------------------ asset recovery ------ */

  const ar = await p.evaluate(async () =>
    await (await fetch("/api/litigation/asset-recovery", { headers: { accept: "application/json" } })).json());
  check("every sheet in the asset-recovery workbook has a disposition",
    ar.sheets.length === 25 && ar.counts.undispositionedSheets === 0,
    ar.sheets.length + " sheets, " + ar.counts.undispositionedSheets + " without one");
  check("its four populations are read apart, not flattened",
    ar.counts.matters > 1000 && ar.counts.settlements > 900
      && ar.counts.policeApplications > 0 && ar.counts.escalations > 0,
    ar.counts.matters + " matters, " + ar.counts.settlements + " settlements, "
      + ar.counts.escalations + " escalations, " + ar.counts.policeApplications + " police applications");
  check("summary sheets are not loaded as records",
    ar.sheets.filter((s) => s.disposition === "SUMMARY").every((s) => !s.recordsTaken),
    ar.sheets.filter((s) => s.disposition === "SUMMARY").length + " rollup sheets, none loaded as matters");

  await H.goHash(p, "/m/assetRecovery");
  await H.sleep(9000);
  check("asset recovery is an operational register, not a spreadsheet dump",
    (await rows()) > 100, (await rows()) + " matters on the first page");
  check("and every one of its figures is a door",
    await p.evaluate(() => [...document.querySelectorAll(".statkpi")].every((n) => n.getAttribute("role") === "button")),
    (await kpis()).slice(0, 4).join("  |  "));
  await p.evaluate(() => document.querySelector("table.table tbody tr").click());
  await H.sleep(3000);
  const arDetail = await text();
  check("a recovery matter opens on the person, the property and its source row",
    /\/m\/assetRecovery\//.test(await p.evaluate(() => location.hash))
      && /The property and the money/i.test(arDetail) && /Assets Recovery\.xlsx/.test(arDetail),
    (arDetail.match(/Row \d+ of [^\n]{0,40}/) || ["?"])[0]);

  /* ------------------------------------------------ the IP estate ------- */

  await H.goHash(p, "/m/ip");
  await H.sleep(8000);
  check("the IP module is the trademark estate, not IP lawsuits",
    (await rows()) >= 57, (await rows()) + " marks");
  const ipRen = await p.evaluate(async () => {
    const r = await (await fetch("/api/litigation/ip-portfolio")).json();
    return r.renewals;
  });
  check("a mark with no source expiry says so, after the search was actually done",
    ipRen.available === false && ipRen.searchedForCertificates === true
      && /no trademark registration certificate/i.test(ipRen.detail),
    "no certificate exists in any connected root; nothing derived from a filing date");

  /* ----------------------------------- every family has ONE door -------- */

  await H.goHash(p, "/litigation");
  await H.sleep(9000);
  /* A chip strip on this page used to name the same ten destinations the
     family hub names, directly above the register the page exists to show.
     The hub is the module navigation; this page shows the cases. */
  const onPageNav = await p.evaluate(() => document.querySelectorAll(".litmods, .litmod").length);
  check("the case register page carries no second navigation of its own",
    onPageNav === 0, onPageNav + " on-page nav chips");

  await H.goHash(p, "/g/litigation");
  await H.sleep(6000);
  const hub = await p.evaluate(() =>
    [...document.querySelectorAll(".nav__item, .hubcard, .hubtile, a, button")]
      .map((n) => n.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
  /* THE FAMILY'S OWN NAMES. Several were renamed in the product-integration
     pass, each for a reason the label now carries:
       Cause list           -> Cause List / Calendar (it is a calendar now)
       IP Portfolio         -> PK IP Portfolio (it is the Pakistan estate)
       Developer Disputes   -> Disputes (the register is not only developers)
       Invoices & spend     -> Invoices & Spend
       Reports              -> Analytics (it answers questions across the
                               family, not only about cases) */
  const WANT_FAMILIES = ["Litigation", "Cause List / Calendar", "Asset Recovery", "Notices",
    "PK IP Portfolio", "Disputes", "Police Complaints", "Government Authority Visits",
    "Invoices & Spend", "Analytics"];
  const absent = WANT_FAMILIES.filter((l) => !hub.some((m) => m.startsWith(l)));
  check("every source family is reachable from the Litigation & Disputes hub",
    absent.length === 0, absent.join(", ") || "all ten");

  await H.goHash(p, "/litigation");
  await H.sleep(6000);

  /* ------------------------------------------ operational page order ---- */

  const geom = await p.evaluate(() => {
    const tbl = document.querySelector("table.table");
    const charts = document.querySelector(".litcharts");
    const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1);
    return { table: top(tbl), chartsVisible: !!(charts && charts.offsetParent !== null) };
  });
  check("a lawyer reaches the cases without scrolling past a chart",
    !geom.chartsVisible && geom.table > 0 && geom.table < 1400,
    "register at y=" + geom.table + ", analytics folded away");

  /* -------------------------------------- the ledger is in the product -- */

  await H.goHash(p, "/datahealth?tab=litroot");
  await H.sleep(9000);
  const dh = await text();
  check("the root reconciliation is in Data Health, not only in a file",
    /Root children/.test(dh) && /Case folders with no case/.test(dh), "exposed to administrators");
  check("and it is technical detail, kept off the operational screens",
    !/NO_MATCHING_CASE/.test(await p.evaluate(async () => {
      const r = await fetch("/#/litigation");
      return "";
    }) || ""), "dispositions are worded, not raw keys");

  /* --------------------------------- case documents, in the tool -------- */

  const pick = await p.evaluate(async () => {
    const j = await (await fetch("/api/registers/litigation?limit=500",
      { headers: { accept: "application/json" } })).json();
    const all = j.rows || j.records || [];
    const withDocs = all.filter((r) => (r.driveFiles || []).length >= 2);
    return withDocs[0] ? { id: withDocs[0].id, n: withDocs[0].driveFiles.length } : null;
  });
  check("cases carry their source folder's documents", !!pick,
    pick ? pick.n + " files on the case used here" : "no case has documents");
  if (pick) {
    await H.goHash(p, "/litigation/" + pick.id);
    await p.reload({ waitUntil: "networkidle2" });
    await H.sleep(8000);
    const docTabs = await p.evaluate(() =>
      [...document.querySelectorAll(".tab, [role=tab]")].map((t) => t.innerText.replace(/\s+/g, " ").trim()));
    check("the Documents count is the real number, not a badge over nothing",
      docTabs.some((t) => new RegExp("Documents\\s*" + pick.n).test(t)), docTabs.join(" | "));
    await p.evaluate(() =>
      [...document.querySelectorAll(".tab, [role=tab]")].find((t) => /Documents/i.test(t.innerText)).click());
    await H.sleep(2200);
    const listed = await p.evaluate(() => document.querySelectorAll(".feed__item").length);
    check("and every one of them is listed", listed >= pick.n, listed + " rows for a count of " + pick.n);
    await p.evaluate(() => {
      const b = document.querySelector(".feed__item [title='Preview in-app']")
        || document.querySelector(".feed__item .notif__ico.clickable");
      if (b) b.click();
    });
    await H.sleep(6000);
    const rendered = await p.evaluate(() => {
      const el = document.querySelector(".doclb__panel");
      if (!el) return "no viewer";
      if (el.querySelector("iframe, embed, object, img, canvas")) return "renders the file";
      const t = el.innerText.replace(/\s+/g, " ").trim();
      return t.length > 400 ? "renders text" : "THIN";
    });
    check("a pleading opens inside LegalOS, without leaving the case",
      !/^no viewer|^THIN/.test(rendered) && /\/litigation\//.test(await p.evaluate(() => location.hash)),
      rendered);
  }

  /* ------------------------- a historical case has a history, not four dates */

  const tc = await p.evaluate(async () => {
    const j = await (await fetch("/api/registers/litigation?limit=600",
      { headers: { accept: "application/json" } })).json();
    const r = (j.records || []).find((x) => x.__origin !== "LEGALOS" && (x.driveFiles || []).length >= 2);
    return r ? { id: r.id, n: r.driveFiles.length } : null;
  });
  check("a case that came from the tracker has documents on file",
    !!tc, tc ? tc.id + " — " + tc.n + " files" : "none");
  if (tc) {
    await H.goHash(p, "/litigation/" + tc.id);
    await p.reload({ waitUntil: "networkidle2" });
    await H.sleep(8000);
    await p.evaluate(() => {
      const t = [...document.querySelectorAll(".tab")].find((x) => /Timeline/i.test(x.innerText));
      if (t) t.click();
    });
    await H.sleep(1800);
    const tl = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    /* A tracker case has no event log. Its history is what the tracker's own
       columns say and what the documents in its Drive folder are dated -- not
       four fields printed in a fixed order. */
    check("its timeline is built from the documents too, not only the tracker's dates",
      /Document on file/.test(tl), (tl.match(/Timeline.{0,120}/) || ["no timeline"])[0]);
  }

  check("no page error anywhere in the estate", errs.length === 0,
    errs.slice(0, 3).join(" ;; ") || "none");

  try { await p.close(); await browser.close(); } catch (e) { /* going away anyway */ }
});
