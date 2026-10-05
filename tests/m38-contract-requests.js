// THE CONTRACT REQUEST MODULE — nine forms, one engine, one document set.
//
// What this suite is really protecting:
//
//   THE RULES ARE NOT THE REQUESTER'S JUDGEMENT. Finance review is decided by
//   whether the request states an amount. A deviation is decided by comparing
//   the answer with the position the requirements state. Both are computed on
//   the server, so a browser that thinks otherwise cannot submit around them.
//
//   THE SLA STARTS AT ACCEPTANCE. A clock started at submission measures the
//   requester's own approval chain and reports it as Legal's turnaround.
//
//   A DOCUMENT BELONGS TO THE REQUEST. The requester uploads once; the HOD,
//   Finance and Legal read the same object. The failure this replaces was an
//   attachment row with a name, a size and no bytes -- a Preview that 404s and
//   a Download the browser calls "file wasn't available on site".
//
//   NOTHING LEAKS. A person outside a request gets 404 for its documents, not
//   403 -- a 403 on a document id confirms the document exists.
//
//   node tests/m38-contract-requests.js
const H = require("./_harness.js");

H.runSuite("contract requests, every requester-facing agreement type", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M38_PORT", portFallback: "4979", prefix: "legalos-m38-",
  }));
  const browser = await H.openBrowser();
  const legal = await H.asUser(browser, sb, H.USERS.litLead.email, ctx);
  const errs = [];
  legal.on("pageerror", (e) => errs.push(e.message));

  const post = async (page, url, body) => {
    for (let i = 0; i < 3; i++) {
      try {
        return await page.evaluate(async (u, b) => {
          const res = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
          return { status: res.status, body: await res.json().catch(() => ({})) };
        }, url, body);
      } catch (e) { await H.sleep(1200); }
    }
    throw new Error("could not post to " + url);
  };
  /* A fetch issued while the SPA happens to be navigating is aborted by the
     browser, not refused by the server. One retry after the page settles keeps
     the suite measuring the product rather than the timing of a click. */
  const get = async (page, url) => {
    for (let i = 0; i < 3; i++) {
      try {
        return await page.evaluate(async (u) => {
          const res = await fetch(u, { headers: { accept: "application/json" } });
          return { status: res.status, body: await res.json().catch(() => ({})) };
        }, url);
      } catch (e) { await H.sleep(1200); }
    }
    throw new Error("could not read " + url + " — the page kept navigating");
  };

  /* --------------------------------------------- every type exists ------ */

  /* TEN, since the NDA became a type of its own. It is the most frequently
     requested agreement in most departments and it was filed under "Other",
     which buried it behind a free-text description Legal had to read to find
     out what it was — and asked the requester eight questions (consideration,
     deliverables, payment terms) that an NDA does not have. */
  const schema = await get(legal, "/api/contract-requests/schema");
  check("every requester-facing agreement type is defined, in one schema layer",
    (schema.body.types || []).length === 10,
    (schema.body.types || []).map((t) => t.key).join(", "));

  const shapes = [];
  for (const t of (schema.body.types || [])) {
    const s = await get(legal, "/api/contract-requests/schema?type=" + t.key);
    const sec = s.body.sections || [];
    shapes.push({
      key: t.key,
      sections: sec.length,
      fields: sec.reduce((n, x) => n + (x.fields || []).length, 0),
      grids: sec.filter((x) => x.grid).length,
      docs: (s.body.requiredAttachments || []).length,
      steps: [...new Set(sec.map((x) => x.step))].length,
    });
  }
  shapes.forEach((s) => console.log("    " + s.key + "  " + String(s.fields).padStart(3) + " fields · "
    + s.sections + " sections · " + s.grids + " grids · " + s.docs + " mandatory documents"));
  check("each type carries its own commercial terms on top of the shared blocks",
    shapes.every((s) => s.fields > 40 && s.sections >= 9),
    shapes.map((s) => s.key + ":" + s.fields).join(" "));
  /* EACH CHECKLIST IS ITS OWN, and the test says that rather than demanding a
     minimum length. An NDA needs proof of who the counterparty is and nothing
     else; a construction agreement needs eight documents. Asserting "at least
     two" would be asking the NDA schema to require a document nobody needs,
     which is exactly the kind of invented requirement this product is meant
     not to have. What matters is that no two types share a checklist. */
  const lists = shapes.map((s) => s.key + "=" + s.docs);
  check("each type carries its own mandatory attachment checklist",
    shapes.every((s) => s.docs >= 1) && new Set(shapes.map((s) => s.docs)).size > 1,
    lists.join(" "));
  check("every type uses repeatable grids rather than free text for its lists",
    shapes.every((s) => s.grids >= 2), shapes.map((s) => s.key + ":" + s.grids).join(" "));

  /* -------------------------------------------- the failure paths -------- */

  const made = await post(legal, "/api/contract-requests", { type: "CRF-02" });
  const id = made.body.request.id;
  check("a draft is created with a stable id", /^CR-[0-9A-F]+$/.test(id), id);

  let sub = await post(legal, "/api/contract-requests/" + id + "/submit", {});
  check("an empty request will not submit", sub.status === 422,
    "HTTP " + sub.status + " — " + ((sub.body.problems || []).length) + " problems");

  const patch = (section, value) => legal.evaluate(async (u, s, v) => {
    const res = await fetch(u, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: s, value: v }) });
    return res.status;
  }, "/api/contract-requests/" + id, section, value);

  await patch("request", { requiredBy: "2026-12-01", priority: "Urgent", requestType: "New",
    baseDraft: "Zameen Template", approvingHod: "imran.tariq@zameen.com" });
  let cur = await get(legal, "/api/contract-requests/" + id);
  check("choosing Urgent makes its reason mandatory",
    cur.body.assessment.problems.some((p) => p.field === "urgentReason"), "urgent reason demanded");

  await patch("request", { requiredBy: "2026-12-01", priority: "Urgent", urgentReason: "Handover booked",
    requestType: "New", baseDraft: "Zameen Template", approvingHod: "imran.tariq@zameen.com" });
  await patch("counterparties", [{ kind: "Partnership", legalName: "Ali & Sons", address: "Lahore",
    signatory: "Ali", signatoryCnic: "1", signingAuthority: "Partners", contactEmail: "a@b.c", contactPhone: "1" }]);
  cur = await get(legal, "/api/contract-requests/" + id);
  check("a Partnership counterparty is asked for its SECP number and partners",
    cur.body.assessment.problems.some((p) => p.field === "secpNo")
    && cur.body.assessment.problems.some((p) => p.field === "partners"),
    "conditional counterparty fields demanded");

  await patch("lessors", [{ name: "Ali" }]);
  cur = await get(legal, "/api/contract-requests/" + id);
  check("an incomplete grid row is reported by row number",
    cur.body.assessment.problems.some((p) => p.section === "lessors" && p.row === 0),
    (cur.body.assessment.problems.find((p) => p.section === "lessors") || {}).message);

  check("and mandatory documents are demanded by type, not by count",
    cur.body.assessment.problems.filter((p) => p.section === "attachments").length === 3,
    cur.body.assessment.problems.filter((p) => p.section === "attachments").map((p) => p.label).join(", "));

  /* -------------------------------------------- deviation + finance ------ */

  const c6 = await post(legal, "/api/contract-requests", { type: "CRF-06" });
  const id6 = c6.body.request.id;
  await legal.evaluate(async (u) => {
    const send = (s, v) => fetch(u, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: s, value: v }) });
    await send("consultancyTerms", { ip: "Client" });
    await send("consultancyFee", { rate: "", quantity: "" });
  }, "/api/contract-requests/" + id6);
  let a6 = (await get(legal, "/api/contract-requests/" + id6)).body.assessment;
  check("holding a stated standard is not a deviation, and no money means no Finance",
    a6.deviations.length === 0 && a6.financeRequired === false,
    a6.deviations.length + " deviations, finance=" + a6.financeRequired);

  await legal.evaluate(async (u) => {
    const send = (s, v) => fetch(u, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: s, value: v }) });
    await send("consultancyTerms", { ip: "Consultant" });
    await send("consultancyFee", { rate: "500000", quantity: "1" });
  }, "/api/contract-requests/" + id6);
  a6 = (await get(legal, "/api/contract-requests/" + id6)).body.assessment;
  const dv = a6.deviations.find((d) => d.field === "ip");
  check("changing it stores the standard, the choice and the flag",
    !!dv && dv.standardValue === "Client" && dv.selectedValue === "Consultant" && dv.isDeviation === true,
    JSON.stringify(dv || {}));
  check("Special Terms become mandatory because of the deviation",
    a6.problems.some((p) => p.section === "special"), "special terms demanded");
  check("stating a fee makes Finance review required, without anyone deciding it",
    a6.financeRequired === true, a6.financeFields.map((f) => f.field).join(", "));

  /* -------------------------------------------- documents, end to end ---- */

  const upload = (page, reqId, name, type, mime) => page.evaluate(async (u, n, t, m) => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => 32 + (i % 90)));
    const res = await fetch(u, { method: "POST",
      headers: { "content-type": m, "x-filename": encodeURIComponent(n), "x-doc-type": encodeURIComponent(t) },
      body: bytes });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, "/api/contract-requests/" + reqId + "/documents", name, type, mime);

  const u1 = await upload(legal, id, "Title.pdf", "Title Documents", "application/pdf");
  check("an upload stores real bytes and reports them on file",
    u1.status === 201 && u1.body.document && u1.body.document.size > 0,
    "HTTP " + u1.status + " · " + ((u1.body.document || {}).size || 0) + " bytes");

  const docId = u1.body.document.id;
  const served = await legal.evaluate(async (u) => {
    const res = await fetch(u);
    return { status: res.status, bytes: (await res.arrayBuffer()).byteLength,
      type: res.headers.get("content-type"), disp: res.headers.get("content-disposition") };
  }, "/api/request-documents/" + docId + "/download");
  check("downloading it returns the actual file with the right headers",
    served.status === 200 && served.bytes === 256 && /pdf/.test(served.type || "")
    && /attachment; filename=/.test(served.disp || ""),
    served.status + " · " + served.bytes + " bytes · " + served.type + " · " + served.disp);

  const prev = await legal.evaluate(async (u) => {
    const res = await fetch(u);
    return { status: res.status, bytes: (await res.arrayBuffer()).byteLength, disp: res.headers.get("content-disposition") };
  }, "/api/request-documents/" + docId + "/preview");
  check("and previewing it serves the same bytes inline",
    prev.status === 200 && prev.bytes === 256 && /inline/.test(prev.disp || ""),
    prev.status + " · " + prev.bytes + " · " + prev.disp);

  await upload(legal, id, "Lessor-CNIC.pdf", "Lessor CNICs", "application/pdf");
  await upload(legal, id, "Floor-Plan.pdf", "Floor Plan", "application/pdf");
  const after = await get(legal, "/api/contract-requests/" + id);
  check("the checklist is satisfied by TYPE, so three documents close three items",
    after.body.summary.mandatoryDone === 3 && after.body.summary.attachmentsComplete === true,
    after.body.summary.mandatoryDone + "/" + after.body.summary.mandatoryTotal);
  check("every stored document reports that its bytes resolve",
    (after.body.documents || []).every((d) => d.onFile === true),
    (after.body.documents || []).map((d) => d.name + "=" + d.onFile).join(", "));

  /* -------------------------------------------- a stranger gets 404 ------ */

  const stranger = await H.asUser(browser, sb, H.USERS.complMember.email, ctx);
  const leak = await stranger.evaluate(async (d) => {
    const out = {};
    for (const what of ["download", "preview", "metadata"]) {
      const res = await fetch("/api/request-documents/" + d + "/" + what);
      out[what] = res.status;
    }
    const r = await fetch("/api/contract-requests", { headers: { accept: "application/json" } });
    out.ids = ((await r.json()).requests || []).map((x) => x.id);
    return out;
  }, docId);
  check("an unrelated user gets 404 for the bytes, the preview AND the metadata",
    leak.download === 404 && leak.preview === 404 && leak.metadata === 404,
    JSON.stringify(leak));
  /* A draft belongs to its author until it is submitted -- so somebody else's
     unfinished request is not in anybody's queue, Legal's included. Submitted
     ones legitimately are, which is why this names the draft rather than
     counting rows. */
  check("and this unsubmitted draft is in nobody else's register",
    !leak.ids.includes(id) && !leak.ids.includes(id6),
    leak.ids.length + " requests visible to them, none of them these drafts");
  try { await stranger.close(); } catch (e) { /* done */ }

  /* -------------------------------------------- the browser journey ------ */

  await H.goHash(legal, "/contract-requests");
  await legal.reload({ waitUntil: "networkidle2" });
  await H.sleep(6000);
  /* The register's own layout is held in m40 (the workspace suite). What
     matters here is that this module's requests reach it and open from it. */
  const reg = await legal.evaluate(() => ({
    rows: document.querySelectorAll(".crfreg tbody tr, .crfcardrow").length,
    refs: [...document.querySelectorAll(".crfref")].map((x) => x.innerText.trim()),
  }));
  check("the requests this module created are on the register",
    reg.rows > 0 && reg.refs.length > 0, reg.rows + " rows");

  const opened = await legal.evaluate(() => {
    const tr = document.querySelector(".crfreg tbody tr");
    if (!tr) return "";
    tr.click(); return "clicked";
  });
  await H.sleep(2500);
  check("and a row opens its request", opened === "clicked"
    && /#\/contract-requests\/CR-/.test(await legal.evaluate(() => location.hash)),
    await legal.evaluate(() => location.hash));

  await H.goHash(legal, "/contract-requests/" + id);
  await legal.reload({ waitUntil: "networkidle2" });
  await H.sleep(6000);
  /* ONE SCROLLABLE WORKSPACE, NOT SEVEN PAGE CHANGES.
     A contract request is a picture of a deal being assembled, and the person
     filling it in moves back and forth constantly; a step that hides the other
     six made that six page changes and a lot of guessing about what was still
     outstanding. Every section is on the page, in order, behind a sticky rail
     that says where you are and how many problems each section still has. */
  const wiz = await legal.evaluate(() => ({
    sections: [...document.querySelectorAll("[id^=crfsec-]")].length,
    rail: [...document.querySelectorAll(".crfrailitem")].map((s) => s.innerText.replace(/\s+/g, " ").trim()),
    steps: [...document.querySelectorAll(".crfstep")].length,
    save: !!document.querySelector(".crf__save, .crfbar"),
  }));
  check("the request opens as one scrollable workspace, not a seven-step wizard",
    wiz.sections >= 5 && wiz.steps === 0,
    `${wiz.sections} sections on the page · ${wiz.steps} step buttons`);
  check("a sticky section rail names every section and where you are",
    wiz.rail.length === wiz.sections && wiz.rail.some((r) => /Documents/i.test(r)),
    wiz.rail.join(" · "));

  await legal.evaluate(() => {
    const el = document.getElementById("crfsec-attachments");
    if (el) el.scrollIntoView();
  });
  await H.sleep(2500);
  const docsTab = await legal.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  check("the attachment checklist shows what is uploaded and what is missing",
    /3 \/ 3 complete/.test(docsTab) && /Title Documents/.test(docsTab), "checklist rendered");
  check("and it says the documents travel with the request",
    /travel with this request/.test(docsTab), "stated to the requester");

  /* ------------------------------------------- changing type in draft --- */

  /* The seven-step wizard is one scrollable workspace now; "go to the Request
     section" is a scroll, not a step change. */
  await legal.evaluate(() => {
    const el = document.getElementById("crfsec-request");
    if (el) el.scrollIntoView();
    const r = [...document.querySelectorAll(".crfrailitem")].find((x) => /Request/.test(x.innerText));
    if (r) r.click();
  });
  await H.sleep(1500);
  await legal.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Change request type/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(1800);
  await legal.evaluate(() => {
    const b = [...document.querySelectorAll(".crfpick")].find((x) => /CRF-08/.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(600);
  await legal.evaluate(() => {
    const b = [...document.querySelectorAll(".modal .btn")].find((x) => /^Change type/i.test(x.innerText.trim()));
    if (b) b.click();
  });
  await H.sleep(3500);
  const warned = await legal.evaluate(() => {
    const m = document.querySelector(".modal");
    return m ? m.innerText.replace(/\s+/g, " ") : "";
  });
  check("changing type warns which answers would be discarded, rather than dropping them silently",
    /discard \d+ section/i.test(warned), (warned.match(/discard[^.]{0,60}/i) || ["no warning"])[0]);

  const beforeType = await get(legal, "/api/contract-requests/" + id);
  check("and nothing has changed until it is confirmed",
    beforeType.body.request.type === "CRF-02", beforeType.body.request.type);

  await legal.evaluate(() => {
    const b = [...document.querySelectorAll(".modal .btn")].find((x) => /discard those answers/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(3000);
  const afterType = await get(legal, "/api/contract-requests/" + id);
  check("confirming changes the type and keeps the shared blocks and the documents",
    afterType.body.request.type === "CRF-08"
    && !!(afterType.body.request.values.request || {}).requiredBy
    && (afterType.body.documents || []).length === 3,
    afterType.body.request.type + " · " + (afterType.body.documents || []).length + " documents kept");
  check("the type change is on the timeline with what it discarded",
    (afterType.body.request.timeline || []).some((e) => e.event === "Request Type Changed"),
    "recorded");

  /* ------------------- ONE DOCUMENT, THROUGH EVERY STAGE, IN THE BROWSER -- */

  /* The requester is the Commercial lead here; the HOD is named on the request,
     Finance is a Finance-department user, and Legal is the litigation lead. */
  const reqr = await H.asUser(browser, sb, H.USERS.commLead.email, ctx);
  const jid = await reqr.evaluate(async () => {
    const r = await (await fetch("/api/contract-requests", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "CRF-02" }) })).json();
    return r.request.id;
  });
  await reqr.evaluate(async (u, hodEmail) => {
    const send = (sec, v) => fetch(u, { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: sec, value: v }) });
    await send("request", { requiredBy: "2026-12-01", priority: "Standard", requestType: "New",
      baseDraft: "Zameen Template", approvingHod: hodEmail });
    await send("entity", { entityName: "Zameen Media (Private) Limited", entityRole: "Lessee",
      entityAddress: "Lahore", entitySignatory: "A Signer", entitySignatoryDesignation: "Director",
      entitySignatoryCnic: "35201-0000000-1" });
    await send("counterparties", [{ kind: "Individual", legalName: "Ali Raza", parentage: "s/o X",
      cnic: "35201-1111111-1", address: "Lahore", signatory: "Ali Raza", signatoryCnic: "35201-1111111-1",
      signingAuthority: "Self", contactEmail: "ali@x.com", contactPhone: "0300" }]);
    await send("lessors", [{ name: "Ali Raza", parentage: "s/o X", cnic: "35201-1111111-1",
      address: "Lahore", rentSharePct: "100" }]);
    await send("premises", { building: "Mega Tower", floorsUnits: "3rd", area: "5000", use: "Office" });
    await send("term", { years: "5", commencement: "2026-12-01", expiry: "2031-11-30", possessionDate: "2026-11-15" });
    await send("rent", { monthlyRent: "400000", taxTreatment: "Exclusive", dueDay: "5",
      escalationPct: "10", escalationAfterYears: "1" });
    await send("deposit", { depositMonths: "3", depositAmount: "1200000", depositInstrument: "Pay Order" });
    await send("leaseTermination", { lessorNotice: "3 months", lesseeNotice: "3 months", cureDays: "30" });
    await send("disputes", { governingLaw: "Laws of Pakistan", forum: "Arbitration", seat: "Lahore", amicableDays: "30" });
    await send("notices", [{ party: "Zameen Media", attention: "Legal", email: "legal@zameen.com", address: "Lahore" },
      { party: "Ali Raza", attention: "Ali", email: "ali@x.com", address: "Lahore" }]);
  }, "/api/contract-requests/" + jid, H.USERS.commMember.email);

  const up = (page, name, type, mime) => page.evaluate(async (u, n, t, m) => {
    const bytes = new Uint8Array(Array.from({ length: 512 }, (_, i) => 65 + (i % 26)));
    const res = await fetch(u, { method: "POST",
      headers: { "content-type": m, "x-filename": encodeURIComponent(n), "x-doc-type": encodeURIComponent(t) },
      body: bytes });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, "/api/contract-requests/" + jid + "/documents", name, type, mime);

  const docx = await up(reqr, "Lease Term Sheet.docx", "Title Documents",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await up(reqr, "Lessor CNIC.pdf", "Lessor CNICs", "application/pdf");
  await up(reqr, "Floor Plan.png", "Floor Plan", "image/png");
  const journeyDoc = docx.body.document.id;
  check("the requester attaches a DOCX, a PDF and an image", !!journeyDoc,
    journeyDoc || (docx.body.error || "upload failed"));

  const readable = (page, docId) => page.evaluate(async (d) => {
    const out = {};
    for (const what of ["preview", "download"]) {
      const res = await fetch("/api/request-documents/" + d + "/" + what);
      out[what] = { status: res.status, bytes: (await res.arrayBuffer()).byteLength };
    }
    return out;
  }, docId);

  let r1 = await readable(reqr, journeyDoc);
  check("the requester can preview and download it", r1.preview.status === 200 && r1.download.bytes === 512,
    "preview " + r1.preview.status + " · download " + r1.download.bytes + " bytes");
  await reqr.reload({ waitUntil: "networkidle2" });
  await H.sleep(2500);
  r1 = await readable(reqr, journeyDoc);
  check("and after a refresh, still", r1.download.status === 200 && r1.download.bytes === 512,
    r1.download.bytes + " bytes");

  const sJ = await post(reqr, "/api/contract-requests/" + jid + "/submit", {});
  check("the request submits and routes to the HOD",
    sJ.status === 200 && sJ.body.request.status === "HOD Approval" && sJ.body.financeRequired === true,
    (sJ.body.request || {}).status + " · finance=" + sJ.body.financeRequired);

  const hodPage = await H.asUser(browser, sb, H.USERS.commMember.email, ctx);
  const hodSees = await get(hodPage, "/api/contract-requests/" + jid);
  check("the HOD opens the SAME request and sees all three documents",
    (hodSees.body.documents || []).length === 3
    && (hodSees.body.documents || []).every((x) => x.onFile),
    (hodSees.body.documents || []).map((x) => x.name).join(", "));
  const rH = await readable(hodPage, journeyDoc);
  check("and can preview and download the requester's file without a re-upload",
    rH.preview.status === 200 && rH.download.bytes === 512, rH.download.bytes + " bytes");
  check("the HOD is shown whether the mandatory set is complete",
    hodSees.body.summary.mandatoryDone === 3 && hodSees.body.summary.mandatoryTotal === 3,
    hodSees.body.summary.mandatoryDone + "/" + hodSees.body.summary.mandatoryTotal);

  const hA = await post(hodPage, "/api/contract-requests/" + jid + "/hod", { approve: true });
  check("the HOD approves and it routes to Finance because rent was stated",
    hA.status === 200 && hA.body.request.status === "Finance Review", (hA.body.request || {}).status);

  const finPage = await H.asUser(browser, sb, H.USERS.paralegal.email, ctx);
  /* The paralegal is not Finance; the finance decision must refuse them. */
  const notFin = await post(finPage, "/api/contract-requests/" + jid + "/finance", { approve: true });
  check("somebody who is not Finance cannot take the finance decision", notFin.status === 403,
    "HTTP " + notFin.status);
  try { await finPage.close(); } catch (e) { /* done */ }

  /* Finance is decided by a Finance-department identity; the Director may also
     act, which is how this environment's roster can exercise the stage. */
  const dir = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const finSees = await get(dir, "/api/contract-requests/" + jid);
  check("Finance opens the same request and the same documents",
    (finSees.body.documents || []).length === 3, (finSees.body.documents || []).length + " documents");
  const fA = await post(dir, "/api/contract-requests/" + jid + "/finance", { approve: true });
  /* THE REFERENCE IS NAMED, NOT NUMBERED (§33). It used to read
     "LGL-CRF02-2026-0001" — an internal schema id printed on the one string the
     business quotes back at us in emails. It carries the agreement type's short
     NAME now, so a lease reads LGL-LEASE-2026-0001; the sequence is still keyed
     on the schema id, so the numbering did not restart. */
  check("Finance approves and it reaches Legal with a reference that names the agreement",
    fA.status === 200 && fA.body.request.status === "Legal Intake"
    && /^LGL-[A-Z0-9]{2,8}-\d{4}-\d{4}$/.test(fA.body.request.legal.reference)
    && !/^LGL-CRF\d/.test(fA.body.request.legal.reference),
    (fA.body.request || {}).status + " · " + ((fA.body.request || {}).legal || {}).reference);
  const refFirst = fA.body.request.legal.reference;

  const rL = await readable(legal, journeyDoc);
  check("Legal opens the same document object and it serves",
    rL.preview.status === 200 && rL.download.bytes === 512, rL.download.bytes + " bytes");

  const ret = await post(legal, "/api/contract-requests/" + jid + "/return",
    { missingDocuments: ["Floor Plan"], comment: "The floor plan is illegible — send a clearer one." });
  check("Legal returns it naming what is needed", ret.status === 200
    && ret.body.request.status === "Returned to Requester", (ret.body.request || {}).status);

  const backWith = await get(reqr, "/api/contract-requests/" + jid);
  check("the requester gets it back with the original documents intact",
    (backWith.body.documents || []).length === 3
    && (backWith.body.request.returns || []).length === 1,
    (backWith.body.documents || []).length + " documents, 1 return recorded");

  const replaced = await reqr.evaluate(async (u, old) => {
    const bytes = new Uint8Array(Array.from({ length: 700 }, (_, i) => 48 + (i % 40)));
    const res = await fetch(u, { method: "POST",
      headers: { "content-type": "image/png", "x-filename": encodeURIComponent("Floor Plan v2.png"),
        "x-doc-type": encodeURIComponent("Floor Plan"), "x-replaces": old },
      body: bytes });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, "/api/contract-requests/" + jid + "/documents",
  (backWith.body.documents.find((x) => x.docType === "Floor Plan") || {}).id);
  check("replacing a document makes a version, it does not erase the first",
    replaced.status === 201 && replaced.body.document.version === 2 && !!replaced.body.document.replacesId,
    "v" + ((replaced.body.document || {}).version));

  const hist = await get(reqr, "/api/contract-requests/" + jid + "/documents?history=1");
  check("and both versions are still on file",
    (hist.body.documents || []).filter((x) => x.docType === "Floor Plan").length === 2,
    (hist.body.documents || []).length + " documents in the history");

  const re2 = await post(reqr, "/api/contract-requests/" + jid + "/submit", {});
  check("it resubmits", re2.status === 200, (re2.body.request || {}).status);
  await post(hodPage, "/api/contract-requests/" + jid + "/hod", { approve: true });
  await post(dir, "/api/contract-requests/" + jid + "/finance", { approve: true });
  const back = await get(legal, "/api/contract-requests/" + jid);
  check("Legal sees the current version, and the reference did not change",
    back.body.request.legal.reference === refFirst
    && (back.body.documents || []).length === 3
    && (back.body.documents || []).some((x) => x.name === "Floor Plan v2.png"),
    back.body.request.legal.reference);

  const slaBefore = back.body.summary.slaStartedAt;
  const acc = await post(legal, "/api/contract-requests/" + jid + "/accept",
    { assignee: "Salman Rashid", targetDate: "2026-10-30" });
  check("the SLA was not running before acceptance, and starts at it",
    !slaBefore && acc.status === 200 && !!acc.body.request.slaStartedAt,
    "before=" + (slaBefore || "not started") + " → " + acc.body.request.slaStartedAt);

  const finalDocs = await readable(legal, journeyDoc);
  check("the very first document the requester uploaded still serves at the end",
    finalDocs.download.status === 200 && finalDocs.download.bytes === 512,
    finalDocs.download.bytes + " bytes, same object throughout");

  /* ------------------------------------------- messages on the request -- */

  const reqMsg = await post(reqr, "/api/contract-requests/" + jid + "/messages",
    { text: "Can we still move the commencement date?" });
  check("the requester can ask a question on the request itself", reqMsg.status === 200,
    "HTTP " + reqMsg.status);
  const legalMsg = await post(legal, "/api/contract-requests/" + jid + "/messages",
    { text: "Yes — send the revised term sheet and we will redraft." });
  check("and Legal answers on the same thread", legalMsg.status === 200, "HTTP " + legalMsg.status);

  const thread = await get(reqr, "/api/contract-requests/" + jid);
  const msgs = thread.body.request.messages || [];
  check("both are on the request, each with its author",
    msgs.length === 2 && msgs.every((m) => m.by && m.by.name),
    msgs.map((m) => (m.by || {}).name).join(" / "));
  check("the reply from Legal is marked as Legal's, the requester's is not",
    msgs[0].fromLegal === false && msgs[1].fromLegal === true,
    msgs.map((m) => (m.fromLegal ? "Legal" : "requester")).join(" → "));
  check("and the exchange is on the timeline",
    (thread.body.request.timeline || []).filter((e) => e.event === "Message").length === 2,
    "recorded twice");

  /* WHO THE THREAD IS OPEN TO. Everyone in this environment's roster is in the
     Legal department, and Legal reads a submitted request — that is the intake
     desk. So the boundary that matters is proved against the identities that
     sit outside it: a business requester from another department, and Finance
     before the request is routed to them. */
  const engineMsg = require("../api/contract-requests.js");
  /* THE RECORD COMES FROM THE SANDBOX, NOT FROM THE REPO'S OWN STORE.
     This used to be `engineMsg.byId(jid)`. The engine required here runs in the
     TEST process and reads the repository's config; the request under test was
     created by the server running in the sandbox and was written to the
     sandbox's config. So byId returned null, every time, and the next line read
     .status off it and killed the suite after 60-odd passing checks -- which is
     why this always looked like a failure somewhere in the message thread.
     `permissionsFor` is a pure function of the record, so hand it the record the
     API just returned and the boundary is asserted against the real thing. */
  const rec = (thread.body && thread.body.request) || null;
  check("the request the permission boundary is checked against is the real one",
    !!(rec && rec.id === jid), rec ? rec.id : "no record came back from the API");
  const stranger2 = { email: "someone.else@zameen.com", name: "Someone Else", rbac: "requester", dept: "Sales" };
  check("a business requester who is not on this request cannot post to its thread",
    engineMsg.permissionsFor(rec, stranger2).view === false, "no view, no post");
  check("but its own requester can",
    engineMsg.permissionsFor(rec, { email: H.USERS.commLead.email, rbac: "lead", dept: "Legal" }).view === true,
    "participant");

  try { await reqr.close(); await hodPage.close(); await dir.close(); } catch (e) { /* done */ }

  /* ------------------------- in-app preview, and internal documents ------ */

  /* A REAL Word file. Built in Node, where a zip is easy to get exactly right,
     and handed to the browser as bytes -- so what is under test is the
     converter and the endpoint, not a zip writer written inside a page. */
  const realDocxBytes = (() => {
    const u16 = (v) => Buffer.from([v & 255, (v >> 8) & 255]);
    const u32 = (v) => Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const table = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const files = [
      ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
      ["_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ["word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Lease term sheet clause one</w:t></w:r></w:p></w:body></w:document>'],
    ];
    const parts = []; const central = []; let off = 0;
    for (const [name, body] of files) {
      const nb = Buffer.from(name); const db = Buffer.from(body); const c = crc(db);
      const local = Buffer.concat([Buffer.from([80, 75, 3, 4]), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c), u32(db.length), u32(db.length), u16(nb.length), u16(0), nb, db]);
      central.push(Buffer.concat([Buffer.from([80, 75, 1, 2]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c), u32(db.length), u32(db.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nb]));
      parts.push(local); off += local.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.concat([Buffer.from([80, 75, 5, 6]), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(off), u16(0)]);
    return Buffer.concat([...parts, cd, end]).toString("base64");
  })();

  const realDocx = await legal.evaluate(async (u, b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const res = await fetch(u, { method: "POST",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x-filename": encodeURIComponent("Real Lease.docx"),
        "x-doc-type": encodeURIComponent("Legal working document"),
        /* The request has been accepted by now, so the requester is correctly
           locked out of it. Legal may still file its own working papers, which
           is the path this uses to put a real Word file in front of the
           converter. */
        "x-visibility": "INTERNAL_LEGAL" },
      body: bytes });
    const j = await res.json().catch(() => ({}));
    return j.document ? j.document.id : ("ERR " + res.status + " " + (j.error || ""));
  }, "/api/contract-requests/" + jid + "/documents", realDocxBytes);
  check("a real Word file uploads", /^RDOC-/.test(realDocx), realDocx);

  const rendered = await legal.evaluate(async (d) => {
    const res = await fetch("/api/request-documents/" + d + "/render");
    const t = await res.text();
    return { status: res.status, type: res.headers.get("content-type"),
      csp: res.headers.get("content-security-policy"), len: t.length,
      hasScript: /<script/i.test(t), readable: /clause one/i.test(t) };
  }, realDocx);
  check("a Word attachment is read inside LegalOS — its words, with no script in the page",
    rendered.status === 200 && /text\/html/.test(rendered.type || "") && rendered.readable
    && !rendered.hasScript && /default-src 'none'/.test(rendered.csp || ""),
    rendered.status + " · words rendered=" + rendered.readable + " · " + (rendered.csp || "no csp"));

  /* A file that will not convert must not take Download away with it. */
  const bad = await legal.evaluate(async (d) => {
    const res = await fetch("/api/request-documents/" + d + "/render");
    const dl = await fetch("/api/request-documents/" + d + "/download");
    return { render: res.status, text: await res.text(), download: dl.status };
  }, journeyDoc);
  check("a document that cannot be converted says so and still downloads",
    bad.render === 200 && /cannot be shown here/i.test(bad.text) && bad.download === 200,
    "render " + bad.render + " · download " + bad.download + " · says: "
      + ((bad.text.match(/cannot be shown here/i) || ["no message"])[0]));

  const internalUp = await legal.evaluate(async (u) => {
    const bytes = new Uint8Array(64).fill(70);
    const res = await fetch(u, { method: "POST",
      headers: { "content-type": "application/pdf", "x-filename": encodeURIComponent("Legal file note.pdf"),
        "x-doc-type": encodeURIComponent("Legal working document"), "x-visibility": "INTERNAL_LEGAL" },
      body: bytes });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, "/api/contract-requests/" + jid + "/documents");
  check("Legal can add a working document of its own",
    internalUp.status === 201 && internalUp.body.document.visibility === "INTERNAL_LEGAL",
    (internalUp.body.document || {}).visibility || internalUp.body.error);

  /* WHO AN INTERNAL DOCUMENT IS FOR.
     Everyone signed in to this environment is in the Legal department, and a
     Legal user is entitled to Legal's working papers -- so the rule is proved
     against the identities that actually matter: a business requester from
     another department, and Finance. Both are refused; Legal is not. */
  const ruleCheck = require("../api/request-documents.js");
  const doc = { id: "probe", requestId: jid, requestKind: "contract", visibility: "INTERNAL_LEGAL" };
  const parts = { requesterEmail: "adeel.khalid@zameen.com", hodEmail: "hod@zameen.com",
    financeRequired: true, reachedApproval: true, reachedFinance: true, reachedLegal: true };
  const business = { email: "adeel.khalid@zameen.com", rbac: "requester", dept: "Sales" };
  const financeUser = { email: "fin@zameen.com", rbac: "member", dept: "Finance" };
  const legalUser = { email: "salman.rashid@zameen.com", rbac: "lead", legalTeam: "litigation", dept: "Legal" };
  check("a Legal working document is refused to the business requester who raised the request",
    ruleCheck.canAccess(business, doc, parts) === false, "refused");
  check("and to Finance", ruleCheck.canAccess(financeUser, doc, parts) === false, "refused");
  check("while the requester's own documents still reach both",
    ruleCheck.canAccess(business, { ...doc, visibility: "REQUEST_SHARED" }, parts) === true
    && ruleCheck.canAccess(financeUser, { ...doc, visibility: "REQUEST_SHARED" }, parts) === true,
    "request-shared reaches the workflow");
  check("and Legal reads its own working papers", ruleCheck.canAccess(legalUser, doc, parts) === true);

  check("no page error anywhere in the module", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
});
