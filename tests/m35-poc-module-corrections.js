// THE FIVE POC CORRECTIONS, IN THE PRODUCT.
//
// Each one was a case of a module borrowing another module's data or another
// module's form:
//
//   IP PORTFOLIO was a filter over litigation cases whose text mentioned IP —
//   a list of infringement LAWSUITS, which is a different thing from the
//   trademark estate, and it left the actual 57-mark tracker in Drive unread.
//   (I had also reported that tracker as missing; the Drive index was stale.)
//
//   NOTICES offered "Raise a case". A notice has an issuer, a direction and a
//   reply deadline, and no forum, cause number or hearing — the litigation
//   intake form asks for all of those and records none of these.
//
//   DEVELOPER DISPUTES said "Raise a case" for a commercial matter that may
//   never reach a court.
//
//   GOVERNMENT AUTHORITY VISITS asked for the entity twice: a "Linked entity"
//   select over a runtime collection that is empty on a fresh session, and an
//   "Office / Entity" select over seven hardcoded sites. One field, over the
//   73 entities the group actually has.
//
//   DELETING A CASE kept nothing. The record now leaves the active register
//   and keeps its author, its history and its documents — and a deletion needs
//   a reason, because "deleted by X" says something was removed and nothing
//   about whether it should have been.
//
//   node tests/m35-poc-module-corrections.js
const H = require("./_harness.js");

const SETV = `(e,v)=>{if(!e)return;const proto=e.tagName==="SELECT"?window.HTMLSelectElement:(e.tagName==="TEXTAREA"?window.HTMLTextAreaElement:window.HTMLInputElement);Object.getOwnPropertyDescriptor(proto.prototype,"value").set.call(e,v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}`;

H.runSuite("POC module corrections", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M35_PORT", portFallback: "4971", prefix: "legalos-m35-",
  }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const text = () => p.evaluate(() => document.body.innerText);
  const btns = () => p.evaluate(() => [...document.querySelectorAll(".btn")].map((b) => b.innerText.trim()).filter(Boolean));
  const fields = () => p.evaluate(() =>
    [...document.querySelectorAll(".modal .field")].map((f) => f.innerText.split("\n")[0].trim()));
  const selects = () => p.evaluate(() =>
    [...document.querySelectorAll(".modal select")].map((s) => [...s.options].map((o) => o.text).join("/")));
  const rows = () => p.evaluate(() => document.querySelectorAll("table.table tbody tr").length);

  /* ---------------------------------------------- 1. IP PORTFOLIO ------- */

  await H.goHash(p, "/m/ip");
  await H.sleep(7000);
  const ipRows = await rows();
  check("IP Portfolio is the trademark estate, not IP lawsuits",
    ipRows >= 57, ipRows + " marks");
  const ipCols = await p.evaluate(() =>
    [...document.querySelectorAll("table.table thead th")].map((n) => n.innerText.trim()));
  check("its columns are the tracker's, not a court case's",
    ipCols.some((c) => /FILE NO/i.test(c)) && ipCols.some((c) => /SUB-STATUS/i.test(c))
      && !ipCols.some((c) => /EXPOSURE|COURT|STAGE/i.test(c)),
    ipCols.join(" | "));
  const ipBtns = await btns();
  check("it creates an IP matter, not a case",
    ipBtns.some((b) => /New IP Matter/i.test(b)) && !ipBtns.some((b) => /Raise a case/i.test(b)),
    ipBtns.join(" | "));
  await p.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => /New IP Matter/i.test(b.innerText)).click());
  await H.sleep(2000);
  const ipFields = await fields();
  check("the IP form is the tracker's columns",
    ipFields.some((f) => /Mark name/i.test(f)) && ipFields.some((f) => /Official file no/i.test(f))
      && !ipFields.some((f) => /Court|Exposure|Forum/i.test(f)),
    ipFields.join(" | "));
  check("and its dropdowns are the tracker's values",
    (await selects()).some((o) => /Filed/.test(o) && /Registered/.test(o) && /Publication/.test(o)),
    "status list from the workbook");
  await p.evaluate((S) => {
    const set = eval(S);
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /Mark name/i.test(x.innerText));
    set(f.querySelector("input"), "POC proof mark");
  }, SETV);
  await H.sleep(600);
  await p.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((b) => /Create IP matter/i.test(b.innerText)).click());
  await H.sleep(3500);
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  check("a new IP matter persists through a reload",
    /POC proof mark/.test(await text()), "on the register after reload");

  /* A ROW THAT OPENS. The register is only half the module -- the mark has to
     have its own page, at its own address, that survives being refreshed. */
  const ipId = await p.evaluate(async () => {
    const j = await (await fetch("/api/litigation/module/ip/records",
      { headers: { accept: "application/json" } })).json();
    const r = (j.records || []).find((x) => (x.fields || {}).markName === "POC proof mark");
    return r ? r.id : "";
  });
  check("the new mark is addressable", !!ipId, ipId || "no id");
  if (ipId) {
    await H.goHash(p, "/m/ip/" + encodeURIComponent(ipId));
    await p.reload({ waitUntil: "networkidle2" });
    await H.sleep(7000);
    check("it opens on its own page and stays there through a refresh",
      /POC proof mark/.test(await text()), ipId);
  }

  /* ---------------------------------------------- 2. NOTICES ------------ */

  await H.goHash(p, "/m/notices");
  await H.sleep(6000);
  const nBtns = await btns();
  check("Notices creates a notice, not a case",
    nBtns.some((b) => /New Legal Notice/i.test(b)) && !nBtns.some((b) => /Raise a case/i.test(b)),
    nBtns.join(" | "));
  await p.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => /New Legal Notice/i.test(b.innerText)).click());
  await H.sleep(2200);
  const nFields = await fields();
  check("the notice form asks what a notice actually has",
    nFields.some((f) => /Direction/i.test(f)) && nFields.some((f) => /Date received/i.test(f))
      && nFields.some((f) => /Response required/i.test(f)) && !nFields.some((f) => /Court|Forum/i.test(f)),
    nFields.join(" | "));
  check("its category and status are the register's own values, not invented ones",
    (await selects()).some((o) => /Legal Notice/.test(o) && /Government Notice/.test(o)),
    "read off the 255 notices already on file");
  await p.evaluate((S) => {
    const set = eval(S);
    const f = (re) => [...document.querySelectorAll(".modal .field")].find((x) => re.test(x.innerText));
    set(f(/Issuer/).querySelector("input"), "POC proof issuer");
    set(f(/Recipient/).querySelector("input"), "Zameen Media (Private) Limited");
    set(f(/^Entity/m).querySelector("input"), "Zameen Media (Private) Limited");
    /* Dated, so the register sorts it where a notice recorded today belongs --
       and so the record page has a response deadline to state.
       TYPED AS A PERSON TYPES IT: dd/mm/yyyy. Every date field in the app is now
       that one control, and it only emits a value for a date it can parse -- so
       an ISO string typed into the box is not a date at all, it is ten
       characters it rejects. This used to set "2026-12-31", store nothing, and
       then fail on a record page that was correctly omitting an empty fact. */
    set(f(/Notice date/).querySelector("input"), "22/09/2026");
    set(f(/Response deadline/).querySelector("input"), "31/12/2026");
    set(f(/^Owner/m).querySelector("input"), "Maryam Haq");
  }, SETV);
  await H.sleep(600);
  await p.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((b) => /Record notice/i.test(b.innerText)).click());
  await H.sleep(3500);
  const savedNotice = await p.evaluate(async () => {
    const j = await (await fetch("/api/litigation/module/notices/records")).json();
    return (j.records || [])[0] || null;
  });
  check("the notice persists with its direction, its dates and its author",
    savedNotice && savedNotice.fields.sender === "POC proof issuer"
      && savedNotice.fields.direction && savedNotice.createdBy && savedNotice.createdBy.name,
    savedNotice ? savedNotice.fields.direction + ", by " + savedNotice.createdBy.name : "not saved");

  /* A NOTICE THAT SAVES BUT NEVER COMES BACK IS A NOTICE NOBODY RECORDED.
     The register is built from the Drive trackers, so without an explicit
     merge a notice recorded here was written to the server and then absent
     from the one screen its author was looking at. */
  const inRegister = await p.evaluate(async () => {
    const j = await (await fetch("/api/registers/notices?limit=2000",
      { headers: { accept: "application/json" } })).json();
    return (j.records || []).find((r) => r.sender === "POC proof issuer") || null;
  });
  check("the recorded notice is IN the notices register, marked as recorded here",
    inRegister && inRegister.__origin === "LEGALOS",
    inRegister ? inRegister.id + " " + inRegister.__origin : "saved but absent from the register");

  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(8000);
  check("and on the notices module after a reload, not only in the API",
    /POC proof issuer/.test(await text()), "on the register after reload");

  /* The register moved out of the litigation workspace onto its own module
     page. It has to arrive with its filters, not with a search box. */
  const nBar = await p.evaluate(() =>
    [...document.querySelectorAll(".fltbtn")].map((b) => b.innerText.replace(/\s+/g, " ").trim()).join(" | "));
  check("the notices module renders the real register filter bar",
    /More filters/.test(nBar) && /Status/.test(nBar) && /Notice type/.test(nBar), nBar.slice(0, 160));
  await p.evaluate(() => {
    const b = [...document.querySelectorAll(".fltbtn")].find((x) => /More filters/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(1500);
  const nAdv = await p.evaluate(() => {
    const d = document.querySelector(".drawer, [class*=drawer]");
    return d ? [...d.querySelectorAll(".fldlabel")].map((n) => n.innerText.trim()).join(" | ") : "NO DRAWER";
  });
  /* Direction, Entity and Notice date were promoted out of the "More filters"
     drawer: direction is the FIRST question anybody asks of a notice — did
     this come to us, or did we send it — and it was behind a button on a
     register of 255 rows. What remains in the drawer is the long tail. */
  check("and the register filters on what a notice has, not only on what a tracker has",
    /response required/i.test(nAdv) && /response deadline/i.test(nAdv)
      && /owner/i.test(nAdv) && /recipient/i.test(nAdv), nAdv);

  if (inRegister) {
    await H.goHash(p, "/rec/notice/" + encodeURIComponent(inRegister.id));
    await p.reload({ waitUntil: "networkidle2" });
    await H.sleep(7000);
    const nBody = await text();
    check("its record page states the direction, the entity, the response and who recorded it",
      /Direction/.test(nBody) && /Response required/.test(nBody) && /Response deadline/.test(nBody)
        && /Recorded in LegalOS/.test(nBody),
      nBody.replace(/\s+/g, " ").slice(0, 60));
  }

  /* --------------------------------- 3. GOVERNMENT AUTHORITY VISITS ----- */

  await H.goHash(p, "/m/inspections");
  await H.sleep(5000);
  check("the visit action says what it creates",
    (await btns()).some((b) => /Log a Visit/i.test(b)), (await btns()).join(" | "));
  await p.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => /Log a Visit/i.test(b.innerText)).click());
  await H.sleep(2500);
  const gFields = await fields();
  check("there is one entity field, not two",
    gFields.filter((f) => /\bentit|office \//i.test(f)).length === 1,
    gFields.filter((f) => /\bentit|office \//i.test(f)).join(" | "));
  await p.evaluate(() => {
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /\bentit/i.test(x.innerText));
    const i = f && f.querySelector("input");
    if (i) { i.focus(); i.click(); }
  });
  await H.sleep(900);
  const entOpts = await p.evaluate(() => document.querySelectorAll(".picker__opt, [role=option]").length);
  check("the entity dropdown is the whole group registry", entOpts > 40, entOpts + " entities offered");
  const gText = await p.evaluate(() => document.querySelector(".modal").innerText);
  check("TAT, Stage and Cost are gone from the form",
    !/\bTAT\b/.test(gText) && !/Consultancy Fee/i.test(gText) && !/Cost per Office/i.test(gText),
    "absent");

  /* THE WHOLE JOURNEY, NOT THE FORM.
     A form that validates and a record that exists are different claims. This
     logs a visit against a real entity and then RELOADS the page, because the
     point of the change is where the record lives: government-authority visits
     used to persist to a browser-local collection, so a visit logged on one
     laptop existed on that laptop and nowhere else and the head of Litigation
     could not see it. It is server-backed now, which means a reload has to
     find it — and the form no longer carries a generic "Subject" field, so the
     visit is identified by the entity and officer the module actually asks
     for. */
  const VISIT = "POC proof officer " + Date.now();
  await p.evaluate((S, officer) => {
    const set = eval(S);
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /Inspecting Officer Name/i.test(x.innerText));
    if (f) set(f.querySelector("input"), officer);
  }, SETV, VISIT);
  await p.evaluate(() => {
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /\bentit/i.test(x.innerText));
    const i = f && f.querySelector("input");
    if (i) { i.focus(); i.click(); }
  });
  await H.sleep(900);
  const pickedEntity = await p.evaluate(() => {
    const o = document.querySelector(".picker__opt, [role=option]");
    if (!o) return "";
    const t = o.innerText.trim(); o.click(); return t;
  });
  await H.sleep(700);
  await p.evaluate(() => [...document.querySelectorAll(".modal .btn")]
    .find((b) => /^(Log|Create|Save|Raise)/i.test(b.innerText.trim())).click());
  await H.sleep(3000);
  check("the visit is logged against a real entity from the registry",
    !!pickedEntity, pickedEntity || "no entity was offered");

  /* THE RELOAD IS THE TEST. Browser-local state does not survive one. */
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(6000);
  await H.goHash(p, "/m/inspections");
  await H.sleep(4000);
  const afterReload = await text();
  check("the visit is on the register after a full reload, not only in the toast",
    afterReload.includes(VISIT), afterReload.replace(/\s+/g, " ").slice(0, 140));

  /* AND ANOTHER PERSON SEES IT — the failure that made the old behaviour
     indistinguishable from not having saved at all. */
  const onServer = await p.evaluate(async (officer) => {
    const r = await fetch("/api/litigation/module/inspections/records", { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => null);
    return ((j && j.records) || []).some((x) => JSON.stringify(x.fields || {}).includes(officer));
  }, VISIT);
  check("and it is on the SERVER, where the rest of the team can read it", onServer,
    onServer ? "held in module-records" : "not on the server");

  /* ---------------------------------------- 4. DEVELOPER DISPUTES ------- */

  await H.goHash(p, "/m/developerDisputes");
  await H.sleep(6000);
  const dBtns = await btns();
  check("Developer Disputes raises a dispute, not a case",
    dBtns.some((b) => /Raise a Dispute/i.test(b)) && !dBtns.some((b) => /Raise a case/i.test(b)),
    dBtns.join(" | "));
  await p.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => /Raise a Dispute/i.test(b.innerText)).click());
  await H.sleep(2000);
  const dFields = await fields();
  check("the dispute form has no court fields, because a dispute has no court yet",
    dFields.some((f) => /^Matter/i.test(f)) && dFields.some((f) => /Project/i.test(f))
      && !dFields.some((f) => /Court|Forum|Case no/i.test(f)),
    dFields.join(" | "));
  check("and its dropdowns are the tracker's own",
    (await selects()).some((o) => /Very Critical/.test(o)), "status list from the workbook");

  /* Raised, then followed to its own page. A dispute that only exists in the
     modal it was typed into is not a dispute the team can work. */
  await p.evaluate((S) => {
    const set = eval(S);
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /^Matter/i.test(x.innerText));
    set(f.querySelector("input, textarea"), "POC proof dispute");
  }, SETV);
  await H.sleep(600);
  await p.evaluate(() => [...document.querySelectorAll(".modal .btn")]
    .find((b) => /^(Raise|Create|Save)/i.test(b.innerText.trim())).click());
  await H.sleep(3500);
  const ddId = await p.evaluate(async () => {
    const j = await (await fetch("/api/litigation/module/developerDisputes/records",
      { headers: { accept: "application/json" } })).json();
    const r = (j.records || []).find((x) => /POC proof dispute/.test(JSON.stringify(x.fields || {})));
    return r ? r.id : "";
  });
  check("raising a dispute produces a record with an id", !!ddId, ddId || "not saved");
  if (ddId) {
    await H.goHash(p, "/m/developerDisputes/" + encodeURIComponent(ddId));
    await p.reload({ waitUntil: "networkidle2" });
    await H.sleep(7000);
    check("the dispute opens on its own page and survives a refresh",
      /POC proof dispute/.test(await text()), ddId);
  }

  /* ---------------------------------------------- 5. CASE DELETION ------ */

  const author = await H.asUser(browser, sb, H.USERS.litMember.email, ctx);
  const caseId = await author.evaluate(async () => {
    const r = await fetch("/api/litigation/cases", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Deletion audit proof", caseType: "Civil Disputes",
        nature: "Civil Suit", direction: "For", entity: "Zameen Media (Private) Limited" }),
    });
    return (await r.json()).case.id;
  });
  try { await author.close(); } catch (e) { /* done with it */ }

  /* DELETION GOES THROUGH THE HEAD OF THE TEAM. THIS USED TO BE ONE CLICK.
     What follows used to drive the old direct-delete: POST .../delete with a
     reason, a "Delete case" item behind More, done. That was replaced -- nothing
     leaves a register because one person decided it should -- and this block was
     left asserting the behaviour that had been removed, so it contradicted
     m37-deletion-approval, which asserts the replacement. Two suites cannot both
     be right about the same endpoint.

     m37 owns the CONTROLS (self-approval, cross-team, a member who may not
     decide, the record staying put while it is pending). What is asserted here
     is what m37 does not cover and what this suite exists for: that the AUDIT
     survives the change -- who asked, who approved, why, and that deleting never
     loses who created the thing. */
  const refused = await p.evaluate(async (i) => {
    const r = await fetch("/api/litigation/cases/" + i + "/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "trying the old way" }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, caseId);
  check("the one-click delete is refused, and says to raise a request instead",
    refused.status === 409 && /deletion request|approval/i.test(JSON.stringify(refused.body)),
    "HTTP " + refused.status + " — " + JSON.stringify(refused.body).slice(0, 110));

  await H.goHash(p, "/litigation/" + caseId);
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  check("the Origin panel names who raised it",
    /Raised in LegalOS by Salman Khan/.test(await text()), "creator on the record");

  /* The ASKER is not the approver. A deletion raised and decided by the same
     person is an approval performed on oneself, and the engine refuses it (403)
     -- which m37 asserts deliberately. So the litigation associate who raised
     the case asks, and the Director decides. */
  const asker = await H.asUser(browser, sb, H.USERS.litMember.email, ctx);
  const asked = await asker.evaluate(async (i) => {
    const r = await fetch("/api/deletions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "cases", recordId: i, label: "Deletion audit proof",
        reason: "Raised in error during the POC walkthrough" }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, caseId);
  try { await asker.close(); } catch (e) { /* done with it */ }
  check("a deletion is ASKED for, with a reason, and waits",
    asked.status === 201 && asked.body.request && asked.body.request.status === "Pending",
    "HTTP " + asked.status + " — " + ((asked.body.request || {}).status || JSON.stringify(asked.body.errors || [])));

  const stillThere = await p.evaluate(async (i) =>
    !!((await (await fetch("/api/litigation/cases/" + i)).json()).case || {}).id, caseId);
  check("while it is pending the case is still on the register", stillThere, "still there");

  /* The litigation HEAD decides it. `p` is the Director, who is head of the
     department and may decide for any team. */
  const decided = await p.evaluate(async (d) => {
    const r = await fetch("/api/deletions/" + d + "/decide", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, asked.body.request && asked.body.request.id);
  check("the head approves it and only then does it go",
    decided.status === 200 && decided.body.request && decided.body.request.status === "Approved",
    "HTTP " + decided.status + " — " + ((decided.body.request || {}).status || ""));

  const audit = await p.evaluate(async (i) => {
    const c = (await (await fetch("/api/litigation/cases/" + i)).json()).case || {};
    return { by: c.deletedBy && c.deletedBy.name, at: c.deletedAt, why: c.deletionReason,
      creator: c.createdBy && c.createdBy.name,
      onTimeline: (c.timeline || []).filter((e) => /Deleted/i.test(e.kind || "")).length };
  }, caseId);
  check("the deletion records who, when and why", !!(audit.at && /Raised in error/.test(audit.why || "")),
    (audit.by || "—") + " — " + (audit.why || "no reason recorded"));
  check("and deleting does not lose who created it",
    audit.creator === "Salman Khan", "still created by " + audit.creator);
  check("the deletion is on the case's own timeline", audit.onTimeline > 0,
    audit.onTimeline + " deletion event(s)");

  const restored = await p.evaluate(async (i) => {
    await fetch("/api/litigation/cases/" + i + "/restore", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const c = (await (await fetch("/api/litigation/cases/" + i)).json()).case || {};
    return { deletedAt: c.deletedAt, keptWhy: c.deletionReason, by: c.restoredBy && c.restoredBy.name };
  }, caseId);
  check("a restore brings it back and keeps that it was once deleted",
    !restored.deletedAt && restored.keptWhy && restored.by,
    "restored by " + restored.by + ", reason kept on the record");

  check("no page error anywhere in the five corrections", errs.length === 0,
    errs.slice(0, 3).join(" ;; ") || "none");

  try { await p.close(); await browser.close(); } catch (e) { /* going away anyway */ }
});
