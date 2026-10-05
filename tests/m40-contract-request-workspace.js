// THE CONTRACT REQUESTS WORKSPACE — information architecture, not CSS.
//
// This register was a database export. Eight equal cards, most of them reading
// zero, with the number and the label colliding into "1Drafts". Every filter on
// screen at once. Fourteen columns — one per field — which meant a horizontal
// scrollbar before the page had said anything, a request reference wrapped over
// three lines, and a fresh draft rendering as eleven dashes.
//
// What this suite holds in place:
//
//   SEVEN COLUMNS, each carrying a whole fact. A request is its reference AND
//   its type. A workflow is its stage AND what comes next. A legal owner is the
//   assignee AND the target AND the SLA. Three columns describing one thing is
//   three columns.
//
//   NO HORIZONTAL SCROLL at the widths this is used at. Not a preference — a
//   register you have to scroll sideways to read is one nobody reads.
//
//   ROLE-AWARE SUMMARY. A requester is not shown Legal's SLA metrics, which
//   they cannot act on; Legal is not shown "my drafts" at the top of a queue.
//
//   EMPTY DRAFTS SAY WHAT IS MISSING. "Parties incomplete", "0 / 5 required" —
//   a row of dashes tells the requester nothing about what is left to do.
//
//   node tests/m40-contract-request-workspace.js
const H = require("./_harness.js");

H.runSuite("the contract requests workspace", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M40_PORT", portFallback: "4970", prefix: "legalos-m40-" }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  // A few requests so the register has something to lay out.
  await p.evaluate(async () => {
    for (const t of ["CRF-04", "CRF-02", "CRF-01"]) {
      const r = await (await fetch("/api/contract-requests", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ type: t }) })).json();
      if (t === "CRF-02") {
        await fetch("/api/contract-requests/" + r.request.id, { method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section: "request", value: { requiredBy: "2026-11-01", priority: "Urgent",
            urgentReason: "x", requestType: "New", baseDraft: "Zameen Template", approvingHod: "a@b.c" } }) });
        await fetch("/api/contract-requests/" + r.request.id, { method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section: "entity", value: { entityName: "Zameen Developments (Private) Limited" } }) });
        await fetch("/api/contract-requests/" + r.request.id, { method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ section: "counterparties", value: [{ legalName: "XYZ Developers" }] }) });
      }
    }
  });

  for (const [w, hgt] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [430, 900]]) {
    await p.setViewport({ width: w, height: hgt });
    await p.goto(sb.base + "/#/contract-requests?crview=all", { waitUntil: "networkidle2" });
    await H.sleep(7000);
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const t = document.querySelector(".crftable");
      const cards = document.querySelector(".crfcards");
      return {
        pageScroll: de.scrollWidth > de.clientWidth + 1,
        tableScroll: t ? t.scrollWidth > t.clientWidth + 1 : null,
        tableShown: t ? getComputedStyle(t).display !== "none" : false,
        cardsShown: cards ? getComputedStyle(cards).display !== "none" : false,
        cols: [...document.querySelectorAll(".crfreg thead th")].map((x) => x.innerText.trim()).filter(Boolean),
        kpis: [...document.querySelectorAll(".crfcard")].map((x) => x.innerText.replace(/\s+/g, "|")),
        refWrapped: [...document.querySelectorAll(".crfref")].some((x) => x.getBoundingClientRect().height > 22),
      };
    });
    console.log("  " + w + "px  page-scroll=" + r.pageScroll + "  table-scroll=" + r.tableScroll
      + "  table=" + r.tableShown + " cards=" + r.cardsShown + "  ref-wrapped=" + r.refWrapped);
    if (w === 1366) {
      check("no horizontal scroll at 1366 — the width this is actually used at",
        !r.pageScroll && r.tableScroll === false, "page=" + r.pageScroll + " table=" + r.tableScroll);
      check("seven grouped columns, not fourteen fields", r.cols.length === 7, r.cols.join(" | "));
      check("the request reference stays on one line", !r.refWrapped);
      check("the KPI number and its label no longer collide",
        r.kpis.every((k) => /^\d+\|/.test(k)), r.kpis.slice(0, 3).join("  ·  "));
    }
    if (w === 1920) check("no horizontal scroll at 1920", !r.pageScroll && r.tableScroll === false);
    if (w === 1440) check("no horizontal scroll at 1440", !r.pageScroll && r.tableScroll === false);
    if (w === 1024) check("no horizontal scroll at 1024", !r.pageScroll && r.tableScroll === false,
      "page=" + r.pageScroll + " table=" + r.tableScroll);
    if (w === 430) check("on a phone it becomes cards, not a sideways table",
      r.cardsShown && !r.tableShown && !r.pageScroll, "cards=" + r.cardsShown + " table=" + r.tableShown);
  }

  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(sb.base + "/#/contract-requests?crview=all", { waitUntil: "networkidle2" });
  await H.sleep(7000);

  const sum = await p.evaluate(() => ({
    cards: document.querySelectorAll(".crfcard").length,
    tabs: [...document.querySelectorAll(".crftab")].map((t) => t.innerText.replace(/\s+/g, " ").trim()),
    filters: [...document.querySelectorAll(".crfbar2 select, .crfbar2 .fltbtn")].map((x) => x.innerText.trim() || x.getAttribute("aria-label")),
    search: (document.querySelector(".crfsearch .input") || {}).placeholder,
  }));
  check("at most five summary cards, not eight", sum.cards <= 5, sum.cards + " cards");
  check("role-aware view tabs are offered", sum.tabs.length >= 3, sum.tabs.join(" | "));
  check("one filter row, the rest behind More filters",
    sum.filters.length <= 4 && sum.filters.some((x) => /More filters/i.test(x || "")), sum.filters.join(" | "));
  check("the search placeholder is not truncated",
    /counterparty/.test(sum.search || ""), sum.search);

  const draft = await p.evaluate(() => {
    const tr = [...document.querySelectorAll(".crfreg tbody tr")]
      .find((x) => /Parties incomplete/.test(x.innerText));
    return tr ? tr.innerText.replace(/\s+/g, " ").trim() : "";
  });
  check("an empty draft says what is missing instead of printing dashes",
    /Parties incomplete/.test(draft) && /required/.test(draft) && !/—\s*—\s*—/.test(draft),
    draft.slice(0, 120));

  const filled = await p.evaluate(() => {
    const tr = [...document.querySelectorAll(".crfreg tbody tr")].find((x) => /XYZ Developers/.test(x.innerText));
    return tr ? tr.innerText.replace(/\s+/g, " ").trim() : "";
  });
  check("a populated row reads as one request, not fourteen cells",
    /Zameen Developments/.test(filled) && /XYZ Developers/.test(filled) && /Urgent/.test(filled),
    filled.slice(0, 130));

  /* Whichever cards this role is shown, pressing one has to scope the register.
     A card that states a number and does nothing is a decoration. */
  const before = await p.evaluate(() => location.hash);
  const pressed = await p.evaluate(() => {
    const k = document.querySelectorAll(".crfcard")[0];
    if (!k) return "";
    const label = k.innerText.replace(/\s+/g, " ").trim();
    k.click(); return label;
  });
  await H.sleep(1800);
  const after = await p.evaluate(() => location.hash);
  check("every summary card filters the register",
    !!pressed && after !== before && /cr(status|stage|sla)=/.test(after),
    pressed + " → " + after);

  /* And the requester's own view offers the buckets a requester acts on. */
  await p.goto(sb.base + "/#/contract-requests?crview=mine", { waitUntil: "networkidle2" });
  await H.sleep(6000);
  const mine = await p.evaluate(() =>
    [...document.querySelectorAll(".crfcard")].map((x) => x.innerText.replace(/\s+/g, " ").trim()));
  check("a requester's summary is their own work, not Legal's SLA metrics",
    mine.some((x) => /Draft/.test(x)) && mine.some((x) => /Returned to me/.test(x))
      && !mine.some((x) => /Overdue/.test(x)),
    mine.join("  ·  "));

  check("no page error", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
});
