/* TWO RULES THAT APPLY TO EVERY MODULE, CHECKED IN EVERY MODULE.
 *
 * 1. What you just added is the first row you see.
 *    A record raised in LegalOS is merged into a register that already holds
 *    hundreds of tracker rows. Appended, it arrives below the fold of a
 *    register nobody scrolls, and the only thing the person who raised it can
 *    conclude is that it did not save. The IP portfolio and Developer Disputes
 *    were each fixed for this one page at a time, and the litigation register
 *    carries a `landing` sort key for it -- which is exactly why it is worth
 *    checking the rest rather than assuming.
 *
 * 2. A date is written and read as dd/mm/yyyy.
 *    A native <input type="date"> renders in the BROWSER's locale, so the same
 *    form shows mm/dd/yyyy to one person and dd/mm/yyyy to the next, and 03/07
 *    is two different days depending on who is looking. Every date field in the
 *    app goes through one control; this proves it, in the forms, rather than
 *    trusting that no page slipped a raw input in.
 *
 *   node tests/m48-new-on-top-and-dates.js
 */
const H = require("./_harness.js");

/* Each module: how the UI actually creates its record, and the address that
   lists it. The endpoint matters -- a case goes to the case store and a notice
   to the module-record store, and posting a case to the wrong one produces a
   record that is saved, real, and in a register nobody is looking at. */
const MODULES = [
  { key: "cases", via: "case", page: "/litigation", label: "Litigation cases",
    fields: (m) => ({ title: m, caseType: "Civil Disputes", status: "Pending", moduleKey: "cases" }) },
  { key: "cases", via: "case", page: "/m/cases", label: "Case Handling",
    fields: (m) => ({ title: m, caseType: "Civil Disputes", status: "Pending", moduleKey: "cases" }) },
  { key: "notices", via: "module", page: "/m/notices", label: "Notices",
    fields: (m) => ({ direction: "Received", sender: m, recipient: "Zameen",
      category: "Legal Notice", details: m, status: "Pending", noticeDate: "2026-09-24" }) },
  { key: "ip", via: "module", page: "/m/ip", label: "IP portfolio",
    fields: (m) => ({ markName: m, class: "42", status: "Filed" }) },
  { key: "developerDisputes", via: "module", page: "/m/developerDisputes", label: "Developer Disputes",
    fields: (m) => ({ matter: m, project: m, status: "Open" }) },
];

/* Every form worth opening for a date field, and how to get to it. */
const DATE_FORMS = [
  /* "+ Add a case". "Raise a case" read like raising a dispute — which is what
     the business does TO us; what a litigation associate does here is record a
     matter that already exists. */
  { page: "/litigation",    open: "Add a case",           what: "adding a case" },
  { page: "/m/notices",     open: "New Legal Notice",     what: "recording a notice" },
  { page: "/matters",       open: null,                   what: "the matters workspace" },
  { page: "/compliance/licenses", open: null,             what: "the licence register" },
];

async function create(page, m, fields) {
  return page.evaluate(async (via, k, f) => {
    const url = via === "case" ? "/api/litigation/cases" : "/api/litigation/module/" + k + "/records";
    const body = via === "case" ? f : { fields: f };
    const r = await fetch(url, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, id: (j.record && j.record.id) || (j.case && j.case.id) || j.id || null,
      err: (j.errors || []).join("; ") || j.error || j.detail || "" };
  }, m.via, m.key, fields);
}

/* Load the register and read the first row of its table. Registers pull from
   Drive, so give the fetch room and re-read until the table has rows. */
async function firstRow(page, route) {
  await page.evaluate((h) => { window.location.hash = h; }, "#" + route);
  await page.reload({ waitUntil: "networkidle2" });
  const deadline = Date.now() + 30000;
  let seen = "";
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const rows = document.querySelectorAll("table.table tbody tr");
      return { n: rows.length, first: rows[0] ? rows[0].innerText.replace(/\s+/g, " ").trim() : "" };
    });
    if (st.n > 0) { seen = st.first; break; }
    await H.sleep(700);
  }
  return seen;
}

H.runSuite("what you just added is on top, and dates are dd/mm/yyyy", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M48_PORT", portFallback: "5048", prefix: "legalos-m48-" }));
  const browser = ctx.setBrowser(await H.openBrowser());

  /* The Director can open every module, so one identity covers the whole table
     and a failure is never "this role could not see it". */
  const page = await H.asUser(browser, sb, H.USERS.director, ctx);

  /* ------------------------------------------------ 1. new goes on top ---- */
  for (const m of MODULES) {
    const marker = "ZZTOP " + m.key + " " + Math.random().toString(36).slice(2, 8).toUpperCase();
    const made = await create(page, m, m.fields(marker));
    if (made.status !== 201 && made.status !== 200) {
      check(`${m.label}: a record can be raised`, false, `HTTP ${made.status} ${made.err}`);
      continue;
    }
    const row = await firstRow(page, m.page);
    check(`${m.label}: the record just raised is the FIRST row of ${m.page}`,
      row.includes(marker), row ? row.slice(0, 90) : "the register rendered no rows at all");
  }

  /* POLICE COMPLAINTS AND GOVERNMENT AUTHORITY VISITS ARE SERVER-BACKED NOW.
     They used to render through the generic workflow page, which persists to a
     BROWSER-LOCAL collection: a complaint logged on one laptop existed on that
     laptop and nowhere else, the head of Litigation could not see it, and a
     cleared browser took it with it. This exercises them the way the form
     does — through the module-record API — because that is where the record
     goes. Raising one through the old local store is precisely what must NOT
     put a row on this register any more. */
  for (const w of [
    { key: "police", page: "/m/police", label: "Police complaints",
      fields: (m) => ({ direction: "Filed by the company", reason: "Fraud",
        complainant: m, accused: "Unknown", policeStation: m, __stage: "Complaint Raised" }) },
    { key: "inspections", page: "/m/inspections", label: "Government authority visits",
      /* ONE canonical Entity / Office field, and it is required: a visit that
         does not say who was visited is not a record of anything. */
      fields: (m) => ({ entity: m, officerName: m, officerDesignation: "Inspector",
        inspectionDate: "2026-09-24", irregularities: "None", __stage: "Conducted" }) },
  ]) {
    const marker = "ZZTOP " + w.key + " " + Math.random().toString(36).slice(2, 8).toUpperCase();
    await page.evaluate((h) => { window.location.hash = h; }, "#" + w.page);
    await H.sleep(2500);
    const made = await page.evaluate(async (key, fields) => {
      const r = await fetch("/api/litigation/module/" + key + "/records", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const j = await r.json().catch(() => null);
      return { ok: r.status === 201, status: r.status,
        id: (j && j.record && j.record.id) || null,
        errors: (j && (j.errors || [j.detail].filter(Boolean))) || [] };
    }, w.key, w.fields(marker));
    if (!made.ok) { check(`${w.label}: a record can be raised`, false, `HTTP ${made.status} ${made.errors.join("; ")}`); continue; }
    /* Re-enter the page so it re-reads the server, which is the whole point:
       the record has to exist somewhere a reload can find it. */
    await page.evaluate(() => { window.location.hash = "#/exec"; });
    await H.sleep(600);
    await page.evaluate((h) => { window.location.hash = h; }, "#" + w.page);
    await H.sleep(2600);
    const body = await page.evaluate(() =>
      ((document.querySelector(".content") || document.body).innerText || "").replace(/\s+/g, " "));
    check(`${w.label}: the record just raised is on ${w.page} after re-reading the server`,
      body.includes(marker), body ? body.slice(0, 120) : "the register rendered nothing");
  }


  /* ---------------------------------------------- 2. dd/mm/yyyy dates ---- */
  for (const f of DATE_FORMS) {
    await page.evaluate((h) => { window.location.hash = h; }, "#" + f.page);
    await page.reload({ waitUntil: "networkidle2" });
    await H.sleep(4000);
    if (f.open) {
      const clicked = await page.evaluate((label) => {
        const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === label);
        if (!b) return false;
        b.click();
        return true;
      }, f.open);
      if (!clicked) { check(`${f.what}: the form opens`, false, `no "${f.open}" control`); continue; }
      await H.sleep(1500);
    }
    const st = await page.evaluate(() => {
      // The control renders a text box with a dd/mm/yyyy placeholder plus an
      // off-screen native picker. A raw date field would be neither.
      const wrapped = document.querySelectorAll(".dateinput input[type=text]").length;
      const raw = [...document.querySelectorAll("input[type=date]")]
        .filter((i) => !i.closest(".dateinput")).length;
      const placeholders = [...document.querySelectorAll(".dateinput input[type=text]")]
        .map((i) => i.placeholder);
      return { wrapped, raw, placeholders: [...new Set(placeholders)] };
    });
    check(`${f.what}: no raw browser-locale date field is on the page`,
      st.raw === 0, st.raw ? st.raw + " raw <input type=date> outside the control" : "none");
    if (st.wrapped > 0) {
      check(`${f.what}: every date field asks for dd/mm/yyyy`,
        st.placeholders.every((p) => p === "dd/mm/yyyy"),
        st.wrapped + " field(s), placeholders: " + st.placeholders.join(", "));
    }
  }

  /* And it round-trips: typed as dd/mm/yyyy, stored as the ISO date, redisplayed
     as dd/mm/yyyy. A field that accepts the format and stores the wrong day is
     worse than one that never accepted it. */
  await page.evaluate((h) => { window.location.hash = h; }, "#/m/notices");
  await page.reload({ waitUntil: "networkidle2" });
  await H.sleep(6000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "New Legal Notice");
    if (b) b.click();
  });
  await H.sleep(1500);
  const trip = await page.evaluate(async () => {
    const box = document.querySelector(".dateinput input[type=text]");
    if (!box) return { err: "no date field on the notice form" };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    box.focus();
    setter.call(box, "07/03/2027");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const shown = box.value;
    box.blur();
    await new Promise((r) => setTimeout(r, 400));
    const picker = box.closest(".dateinput").querySelector("input[type=date]");
    return { shown, afterBlur: box.value, iso: picker ? picker.value : "" };
  });
  check("a date typed as 07/03/2027 is the 7th of March, and stays that way",
    !trip.err && trip.shown === "07/03/2027" && trip.iso === "2027-03-07" && trip.afterBlur === "07/03/2027",
    trip.err || `typed "${trip.shown}" → stored "${trip.iso}" → redisplayed "${trip.afterBlur}"`);
});
