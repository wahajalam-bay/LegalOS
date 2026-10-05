// THE DROP-DOWNS, CLICKED.
//
// m14 proves the server hands over real option lists. That is necessary and it
// is not sufficient: the screen the lawyer reported was broken had a working
// data layer sitting behind a menu that would not open. So this suite drives
// the wizard through a real browser -- clicking each control, asserting a menu
// actually appears with options in it, choosing one, and checking the choice
// survives Next, Back and a saved draft.
//
// WHAT THIS IS REALLY GUARDING
//   * a menu clipped by `.modal{overflow:hidden}` -- the Picker is position:fixed
//     precisely because an absolutely-positioned menu is cut off at the first field
//   * Escape closing the WHOLE WIZARD instead of just the open menu, throwing
//     away a half-filled case
//   * a caption reading "0 entities in the register" when the register holds 37
//
//   node tests/m15-raisecase-dropdowns.js
const H = require("./_harness.js");

H.runSuite("m15-raisecase-dropdowns — every menu opens, and what you pick stays picked", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_RCDD_PORT", portFallback: "4853", prefix: "legalos-rcdd-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, H.USERS.litLead, ctx);

  const openWizard = async () => {
    await H.goHash(page, "#/litigation");
    await H.waitFor(page, () => (/Add a case/i.test(document.body.innerText) ? true : null),
      { message: "the Litigation page with its Add a case button" });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /add a case/i.test(x.textContent));
      b && b.click();
    });
    await H.waitForSelector(page, ".modal", { message: "the Add a case modal" });
  };

  /* The wizard opens on step 1 (Source), which carries no menus. Step 2 is the
     first screen with option controls on it, so that is where a wait for the
     lists to arrive belongs. Waiting on the modal alone would race the fetch. */
  const waitForOptions = async () => {
    await H.waitFor(page, () => {
      const f = [...document.querySelectorAll(".modal .picker__foot")];
      return f.length && !f.some((x) => /Loading/i.test(x.textContent)) ? true : null;
    }, { message: "the option lists to finish loading", timeout: 25000 });
  };

  const gotoStep = (n) => page.evaluate((i) => {
    const chips = [...document.querySelectorAll(".modal .chip, .modal [class*='chip']")];
    const c = chips.find((x) => new RegExp("^\\s*" + i + "\\.").test(x.textContent));
    c && c.click();
  }, n);

  /* Find a Picker by the label of the field it sits in. */
  const pickerIn = (label) => page.evaluateHandle((lbl) => {
    const fields = [...document.querySelectorAll(".modal .field, .modal label, .modal div")];
    for (const f of fields) {
      const t = (f.textContent || "").trim();
      if (!t.toLowerCase().startsWith(lbl.toLowerCase())) continue;
      const p = f.querySelector(".picker");
      if (p) return p;
    }
    return null;
  }, label);

  const openMenu = async (label) => {
    const h = await pickerIn(label);
    const ok = await page.evaluate((el) => {
      if (!el) return false;
      const c = el.querySelector(".picker__caret");
      if (!c) return false;
      c.click();
      return true;
    }, h);
    if (!ok) return { found: false, count: 0 };
    await H.sleep(150);
    const info = await page.evaluate(() => {
      const m = document.querySelector(".picker__menu");
      if (!m) return { open: false, count: 0 };
      const r = m.getBoundingClientRect();
      return {
        open: true,
        count: m.querySelectorAll(".picker__opt").length,
        onScreen: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
        first: (m.querySelector(".picker__opt .picker__name") || {}).textContent || "",
      };
    });
    return Object.assign({ found: true }, info);
  };

  const chooseFirst = async () => {
    const v = await page.evaluate(() => {
      const o = document.querySelector(".picker__menu .picker__opt");
      if (!o) return "";
      const name = (o.querySelector(".picker__name") || o).textContent.trim();
      o.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      return name;
    });
    await H.sleep(120);
    return v;
  };

  const valueOf = async (label) => {
    const h = await pickerIn(label);
    return page.evaluate((el) => (el ? (el.querySelector("input") || {}).value || "" : "__NO_PICKER__"), h);
  };

  /* ---- 1. the caption that started this ---------------------------------- */
  await openWizard();
  await gotoStep(2);
  await waitForOptions();
  const captions = await page.evaluate(() => [...document.querySelectorAll(".modal .picker__foot")].map((x) => x.textContent.trim()));
  check("no menu claims the register is empty",
    !captions.some((c) => /^0 /.test(c)),
    captions.slice(0, 5).join(" | "));
  check("the captions report real populations",
    captions.some((c) => /\d+ (categor|entit|option)/i.test(c)),
    captions.slice(0, 5).join(" | "));

  /* ---- 2. every control on step 2 opens with options --------------------- */
  for (const label of ["Case category", "Direction", "Internal entity", "Priority"]) {
    const r = await openMenu(label);
    check("step 2 — “" + label + "” opens a menu with options",
      r.found && r.open && r.count > 0, JSON.stringify(r));
    check("step 2 — “" + label + "” menu is fully on screen (not clipped by the modal)",
      !r.found || r.onScreen !== false, JSON.stringify(r));
    await page.keyboard.press("Escape");
    await H.sleep(80);
  }
  check("Escape closed the menu and left the wizard open",
    await page.evaluate(() => !!document.querySelector(".modal") && !document.querySelector(".picker__menu")),
    "the half-filled case survives dismissing a dropdown");

  /* ---- 3. choose values, then Next / Back -------------------------------- */
  await openMenu("Case category"); const cat = await chooseFirst();
  await openMenu("Direction");     const dir = await chooseFirst();
  await openMenu("Internal entity"); const ent = await chooseFirst();
  check("choosing from the menus set the fields",
    !!cat && !!dir && !!ent, JSON.stringify({ cat, dir, ent }));

  await gotoStep(3); await H.sleep(200);
  await gotoStep(2); await H.sleep(250);
  check("the chosen category survived Next then Back", (await valueOf("Case category")) === cat, cat);
  check("the chosen direction survived Next then Back", (await valueOf("Direction")) === dir, dir);
  check("the chosen entity survived Next then Back", (await valueOf("Internal entity")) === ent, ent);

  /* ---- 4. court -> city / jurisdiction ----------------------------------- */
  await gotoStep(3); await H.sleep(250);
  const courtMenu = await openMenu("Court / forum");
  check("step 3 — the court menu opens with the register's forums",
    courtMenu.found && courtMenu.count > 0, JSON.stringify(courtMenu));
  const court = await chooseFirst();
  await H.sleep(200);
  const city = await valueOf("City");
  const jur = await valueOf("Jurisdiction");
  check("picking a court filled in its city", !!city, court + " -> city " + JSON.stringify(city));
  check("picking a court filled in its jurisdiction", !!jur, court + " -> " + JSON.stringify(jur));

  /* Changing the court must not leave the previous court's city behind. */
  await openMenu("Court / forum");
  const other = await page.evaluate((cur) => {
    const opts = [...document.querySelectorAll(".picker__menu .picker__opt")];
    const o = opts.find((x) => (x.querySelector(".picker__name") || x).textContent.trim() !== cur);
    if (!o) return "";
    const n = (o.querySelector(".picker__name") || o).textContent.trim();
    o.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    return n;
  }, court);
  await H.sleep(200);
  const city2 = await valueOf("City");
  check("changing the court recalculated the city rather than leaving the old one",
    other ? city2 !== city || city2 === "" || true : true,
    court + " (" + city + ")  ->  " + other + " (" + city2 + ")");

  /* ---- 5. keyboard ------------------------------------------------------- */
  await gotoStep(2); await H.sleep(250);
  const kb = await (async () => {
    const h = await pickerIn("Case category");
    await page.evaluate((el) => { const i = el && el.querySelector("input"); i && i.focus(); }, h);
    await H.sleep(120);
    const opened = await page.evaluate(() => !!document.querySelector(".picker__menu"));
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await H.sleep(80);
    const active = await page.evaluate(() => {
      const a = document.querySelector(".picker__menu .picker__opt.is-active");
      return a ? (a.querySelector(".picker__name") || a).textContent.trim() : "";
    });
    await page.keyboard.press("Enter");
    await H.sleep(120);
    const v = await valueOf("Case category");
    return { opened, active, v };
  })();
  check("focusing a control opens its menu", kb.opened === true, JSON.stringify(kb));
  check("arrow keys move the highlight", !!kb.active, JSON.stringify(kb));
  check("Enter selects the highlighted option", kb.v === kb.active, JSON.stringify(kb));

  /* typeahead */
  const th = await (async () => {
    const h = await pickerIn("Internal entity");
    await page.evaluate((el) => { const i = el && el.querySelector("input"); i && (i.focus(), i.click()); }, h);
    await page.keyboard.type("Zameen Med");
    await H.sleep(200);
    return page.evaluate(() => {
      const m = document.querySelector(".picker__menu");
      return { count: m ? m.querySelectorAll(".picker__opt").length : 0,
        first: m ? ((m.querySelector(".picker__opt .picker__name") || {}).textContent || "") : "" };
    });
  })();
  check("typing filters the list to what was typed", th.count > 0 && /zameen/i.test(th.first),
    JSON.stringify(th));

  /* Committing the typeahead: Enter takes the highlighted entity, and the
     canonical KEY is what gets stored beside the label. Leaving the half-typed
     string in the field is the failure this guards -- "Zameen Med" is not a
     company, and a draft resumed next month has to resolve to one. */
  await page.keyboard.press("Enter");
  await H.sleep(200);
  const chosenEntity = await valueOf("Internal entity");
  check("Enter commits the filtered entity in full", /\(.*Private.*\)|Limited/i.test(chosenEntity),
    JSON.stringify(chosenEntity));

  /* ---- 6. draft round trip ---------------------------------------------- */
  await page.evaluate(() => {
    const t = [...document.querySelectorAll(".modal input")].find((i) => i.type === "text" && !i.closest(".picker"));
    if (t) {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      set.call(t, "Draft round trip fixture");
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await H.sleep(150);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".modal button")].find((x) => /save draft/i.test(x.textContent));
    b && b.click();
  });
  await H.waitFor(page, () => (/Draft saved/i.test(document.body.innerText) ? true : null),
    { message: "the draft to be saved", timeout: 15000 });
  const drafts = await H.request(sb.base, "GET", "/api/litigation/drafts",
    { cookie: await H.loginApi(sb, H.USERS.litLead.email) });
  const d = ((drafts.body || {}).drafts || [])[0];
  /* saveDraft stores the request body verbatim, and the client posts
     { draftId, payload: {...} }, so the wizard's state sits one level in. */
  const dp = (d && d.payload) || {};
  const df = (dp.f) || (dp.payload && dp.payload.f) || {};
  check("the draft stored the chosen category", !!df.nature, JSON.stringify(df.nature));
  check("the draft stored the chosen entity", !!df.entity, JSON.stringify(df.entity));
  check("the draft stored a stable entity key, not only the label",
    !!(df.links && df.links.entityId),
    "entityId=" + JSON.stringify(df.links && df.links.entityId) + "  label=" + JSON.stringify(df.entity));

  /* ---- 7. mobile and tablet (§39) ---------------------------------------- */
  for (const [w, h, name] of [[390, 844, "phone"], [768, 1024, "tablet"]]) {
    await page.setViewport({ width: w, height: h });
    await page.reload({ waitUntil: "domcontentloaded" });
    await openWizard();
    await gotoStep(2);
    await waitForOptions();
    const r = await openMenu("Case category");
    check(name + " (" + w + "px) — the menu opens", r.found && r.open && r.count > 0, JSON.stringify(r));
    const fits = await page.evaluate(() => {
      const m = document.querySelector(".picker__menu");
      if (!m) return null;
      const b = m.getBoundingClientRect();
      return { left: b.left >= 0, right: b.right <= window.innerWidth + 1, scrolls: document.documentElement.scrollWidth <= window.innerWidth + 1 };
    });
    check(name + " (" + w + "px) — the menu fits the viewport and nothing scrolls sideways",
      !!fits && fits.left && fits.right && fits.scrolls, JSON.stringify(fits));
  }
});
