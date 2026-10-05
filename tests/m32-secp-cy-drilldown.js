// ENTITY → CY → FILING → DOCUMENT, CLICKED THE WAY A LAWYER CLICKS IT.
//
// The reconciliation (m31) proves the model knows where every document is.
// This proves a person can reach it. The rule being held here is simple and it
// was being broken everywhere: NO STATUS WITHOUT ACCESSIBLE EVIDENCE.
//
//   "Submission evidenced" asserted a receipt exists and offered no way to see
//   it. "A, 9, 19" was plain text. "49" was a dead number. A reader could see
//   that a document existed and had no route to it anywhere on the screen.
//
// AND THE VIEWING HAPPENS HERE. A Legal user must not have to leave LegalOS and
// authenticate against Drive to read a register they are already cleared for,
// so every document opens in the in-app viewer; "Open in Drive" is provenance,
// not the workflow.
//
// The journey is walked on a Private Limited, an SMC, a Public Limited and a
// non-group company, because the four have different obligations and it is the
// legal form that decides what the screen should even offer.
//
//   node tests/m32-secp-cy-drilldown.js
const H = require("./_harness.js");
const records = require("../api/secp-records.js");

/* One company per legal form and per source group, chosen from the model so the
   suite follows the estate rather than a hardcoded name that may be renamed. */
function subjects() {
  const years = records.annualCompliance();
  const rich = (y) => y.documentCount > 3 && y.forms.some((f) => f.documentStatus === "AVAILABLE");
  const pick = (pred) => years.find((y) => pred(y) && rich(y)) || years.find(pred);
  const out = [];
  const add = (label, y) => { if (y && !out.some((o) => o.y.id === y.id)) out.push({ label, y }); };
  add("Private Limited", pick((y) => y.entityType === "PRIVATE_LIMITED"));
  add("SMC", pick((y) => y.entityType === "SMC"));
  add("Public Limited", pick((y) => y.entityType === "PUBLIC_LIMITED"));
  add("Non-group", pick((y) => y.group !== "group"));
  return out;
}

H.runSuite("SECP entity → CY → document", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M32_PORT", portFallback: "4983", prefix: "legalos-m32-",
  }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const hash = () => p.evaluate(() => location.hash);
  const text = () => p.evaluate(() => document.body.innerText);

  for (const { label, y } of subjects()) {
    /* ---- the year table: every cell is a door to its own evidence */
    await H.goHash(p, "/compliance/sec-filings/entity/" + encodeURIComponent(y.entityKey));
    await H.sleep(3000);
    const cells = await p.evaluate(() => document.querySelectorAll("table.table td .linkish").length);
    check(label + ": forms and counts in the year table are controls, not text",
      cells > 0, y.entity + " — " + cells + " clickable cells");

    const jumped = await p.evaluate(() => {
      const b = document.querySelector('table.table td .linkish[data-open="documents"]');
      if (!b) return false;
      b.click();
      return true;
    });
    check(label + ": a document count opens that year's documents", jumped, jumped ? "clicked" : "no count to click");
    await H.sleep(2600);
    check(label + ": …and lands on the documents tab",
      /\/year\//.test(await hash()) && /tab=documents/.test(await hash()), (await hash()).slice(-46));

    const cats = await p.evaluate(() => [...document.querySelectorAll(".chip")].map((c) => c.innerText.trim()));
    check(label + ": documents are grouped by what they are, not dumped in one list",
      cats.length > 1 && !cats.every((c) => /^All|^Other/.test(c)), cats.slice(0, 6).join(" | "));

    /* ---- a document opens inside LegalOS */
    const opened = await p.evaluate(() => {
      const b = document.querySelector(".feed__item [title='Preview in-app']")
        || document.querySelector(".feed__item .notif__ico.clickable");
      if (!b) return false;
      b.click();
      return true;
    });
    check(label + ": a document can be previewed from the list", opened, opened ? "opened" : "nothing to open");
    await H.sleep(5500);
    const rendered = await p.evaluate(() => {
      const el = document.querySelector(".doclb__panel");
      if (!el) return "no viewer";
      if (el.querySelector("iframe, embed, object, img, canvas")) return "renders the file";
      const t = el.innerText.replace(/\s+/g, " ").trim();
      return t.length > 400 ? "renders text" : "THIN: " + t.slice(0, 120);
    });
    check(label + ": the document renders INSIDE LegalOS", !/^no viewer|^THIN/.test(rendered), rendered);
    /* A document with no provenance is a file, not a record: the reader has to
       be able to see whose it is and where it came from without closing the
       viewer to find out. */
    const prov = await p.evaluate(() => {
      const el = document.querySelector(".doclb__prov");
      return el ? el.innerText.replace(/\s+/g, " ").trim() : "MISSING";
    });
    check(label + ": the viewer states the category, the company, the year and the source path",
      /Category:/.test(prov) && /Entity:/.test(prov) && /Compliance year:/.test(prov) && /Source:/.test(prov),
      prov.slice(0, 150));
    const routes = await p.evaluate(() =>
      [...document.querySelectorAll(".doclb__bar .iconbtn")].map((b) => b.title));
    check(label + ": Drive is offered for provenance, not as the only way in",
      routes.some((t) => /Drive/i.test(t)), routes.join(" | "));
    check(label + ": …without leaving the tool", /\/year\//.test(await hash()), "still on the compliance year");
    await p.keyboard.press("Escape");
    await H.sleep(800);
  }

  /* ---- the statuses on one year, each opening its own evidence */
  const y = subjects()[0].y;
  await H.goHash(p, "/compliance/sec-filings/year/" + encodeURIComponent(y.id));
  await H.sleep(2800);
  const live = await p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")].filter((n) => n.getAttribute("role") === "button")
      .map((n) => n.innerText.replace(/\s+/g, " ").trim()));
  check("a status backed by evidence is clickable", live.length >= 2, live.join("  |  "));

  /* A status with NOTHING behind it must not pretend to be a door. */
  const dead = await p.evaluate(() =>
    [...document.querySelectorAll(".statkpi")]
      .filter((n) => /No source document|Not recorded|No acknowledgement/i.test(n.innerText))
      .every((n) => n.getAttribute("role") !== "button"));
  check("a status with no evidence behind it is not a dead link", dead,
    "empty states do not pretend to open something");

  await H.goHash(p, "/compliance/sec-filings/year/" + encodeURIComponent(y.id) + "?tab=forms");
  await H.sleep(2200);
  const formOpened = await p.evaluate(() => {
    const r = [...document.querySelectorAll("table.table tbody tr")].find((x) => /Open →/.test(x.innerText));
    if (!r) return false;
    r.click();
    return true;
  });
  check("a form on file opens from the forms table", formOpened, formOpened ? "row is actionable" : "no openable form");
  await H.sleep(1800);
  check("opening a form reveals the actual documents behind it",
    /document[s]? on file/i.test(await text()), "documents listed under the form");

  /* The counts on the year page and the year's own record must agree. */
  const shown = await p.evaluate(() => {
    const k = [...document.querySelectorAll(".statkpi")].find((n) => /Documents/i.test(n.innerText));
    const t = [...document.querySelectorAll(".regtab")].find((n) => /Documents/i.test(n.innerText));
    return { kpi: (k || {}).innerText || "", tab: (t || {}).innerText || "" };
  });
  check("the year's document count is the same number wherever it appears",
    shown.kpi.replace(/\D/g, "") === shown.tab.replace(/\D/g, ""),
    shown.kpi.replace(/\s+/g, " ").trim() + "  /  " + shown.tab.replace(/\s+/g, " ").trim());

  /* ---- the meeting, broken into the parts a lawyer asks for by name */
  const withAgm = records.annualCompliance().find((r) => (r.agm.documents || []).length >= 3);
  if (withAgm) {
    await H.goHash(p, "/compliance/sec-filings/year/" + encodeURIComponent(withAgm.id) + "?tab=agm");
    await H.sleep(2600);
    const parts = await p.evaluate(() => [...document.querySelectorAll(".chip")].map((c) => c.innerText.trim()));
    check("the AGM is broken into its parts, not one undifferentiated pile",
      parts.some((c) => /Notice to members/i.test(c)) && parts.some((c) => /AGM minutes/i.test(c)),
      parts.join(" | "));
  }
  const smc = records.annualCompliance().find((r) => r.entityType === "SMC");
  if (smc) {
    await H.goHash(p, "/compliance/sec-filings/year/" + encodeURIComponent(smc.id) + "?tab=agm");
    await H.sleep(2200);
    check("a single member company is told it holds no AGM, not shown an empty one",
      /no AGM is required|holds no annual general meeting/i.test(await text()),
      "the screen says why, rather than showing nothing");
  }

  /* ---- and the working, for whoever has to defend the absence -------------
     A lawyer sees "not found in source" on the compliance screen. Data Health
     carries the reason: how many files that year holds, what each of them
     turned out to be, and how many folders were walked to establish it. */
  const dp = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  await H.goHash(dp, "/datahealth?tab=secp");
  await H.sleep(3200);
  const dhText = await dp.evaluate(() => document.body.innerText);
  check("the reconciliation is in the product, not only in a report file",
    /Entity-years reconciled/i.test(dhText) && /Files given a disposition/i.test(dhText),
    "Data Health carries it");
  const listed = await dp.evaluate(() => document.querySelectorAll("table.table tbody tr").length);
  const noAccounts = records.annualCompliance()
    .filter((y) => y.financialStatements.status === "NO_SOURCE_DOCUMENT").length;
  check("every year without accounts is named, not summarised away",
    listed === noAccounts, listed + " listed against " + noAccounts + " in the model");
  check("and each says what its folder DOES hold",
    /reference document|supporting document|correspondence|form/i.test(dhText),
    "dispositions shown per year");
  try { await dp.close(); } catch (e) { /* closing anyway */ }

  check("no page error anywhere in the drilldown", errs.length === 0,
    errs.slice(0, 3).join(" ;; ") || "none");

  try { await p.close(); await browser.close(); } catch (e) { /* going away anyway */ }
});
