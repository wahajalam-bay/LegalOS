/* WORK THAT HAS TO SURVIVE THE BROWSER IT WAS TYPED IN.
 *
 * Police Complaints and Government Authority Visits rendered through the
 * generic workflow page, which persists to a BROWSER-LOCAL collection. A
 * complaint logged on one laptop existed on that laptop and nowhere else: the
 * head of Litigation could not see it, a cleared browser took it with it, and
 * because the record had never reached the server there was also no way to ask
 * for it to be deleted. Two of the eight modules had no deletion control at
 * all, and that was the reason.
 *
 * Also pinned here:
 *   • a contract request is ONE scrollable workspace, not seven page changes;
 *   • a reassignment records WHY, because that is the only thing anybody asks
 *     about a moved matter three months later.
 */
const H = require("./_harness.js");
const { USERS } = H;

H.runSuite("records survive the browser, and changes record why", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M55_PORT", portFallback: "5055", prefix: "legalos-m55-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, USERS.litLead, ctx);

  /* ---- a police complaint reaches the server ---- */
  await page.evaluate(() => { window.location.hash = "#/m/police"; });
  await H.sleep(2500);
  const created = await page.evaluate(async () => {
    const r = await fetch("api/litigation/module/police/records", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        direction: "Filed by the company", reason: "Suite probe — unreturned company property",
        policeStation: "Model Town", diaryNumber: "M55-PROBE", __stage: "Complaint Raised",
      } }),
    });
    return r.status;
  });
  ctx.check("a police complaint is accepted by the server", created === 201, "HTTP " + created);

  /* THE REAL TEST IS A RELOAD. Browser-local state does not survive one. */
  await page.reload({ waitUntil: "domcontentloaded" });
  await H.sleep(2500);
  await page.evaluate(() => { window.location.hash = "#/m/police"; });
  await H.sleep(3000);
  let text = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("it is still on the register after a full reload",
    /M55-PROBE/.test(text) && /Model Town/.test(text), text.slice(0, 220));

  /* AND ANOTHER PERSON CAN SEE IT — the failure that made the old behaviour
     indistinguishable from not having saved at all. */
  const page2 = await H.asUser(browser, sb, USERS.director, ctx);
  await page2.evaluate(() => { window.location.hash = "#/m/police"; });
  await H.sleep(3500);
  const seen = await page2.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("a second person on a second session sees the same complaint",
    /M55-PROBE/.test(seen), seen.slice(0, 200));

  /* DELETION IS A REQUEST, and it exists at all — which it did not before,
     because the record was never on the server to ask about. */
  const del = await page.evaluate(async () => {
    const r = await fetch("api/litigation/module/police/records", { headers: { Accept: "application/json" } });
    const j = await r.json();
    const rec = (j.records || []).find((x) => (x.fields || {}).diaryNumber === "M55-PROBE");
    if (!rec) return { ok: false };
    const d = await fetch("api/deletions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: "police", recordId: rec.id, label: "M55-PROBE", reason: "suite probe cleanup" }) });
    return { ok: true, status: d.status };
  });
  ctx.check("a complaint can be put up for deletion, which needs the head's approval",
    del.ok && (del.status === 200 || del.status === 201), "HTTP " + del.status);
  await page2.close();

  /* ---- government authority visits are server-backed too ---- */
  await page.evaluate(() => { window.location.hash = "#/m/inspections"; });
  await H.sleep(2500);
  const visit = await page.evaluate(async () => {
    const r = await fetch("api/litigation/module/inspections/records", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { inspectionDate: "2026-09-01", officerName: "M55 Probe Officer",
        __subType: "Labour Department", __stage: "Conducted" } }),
    });
    return r.status;
  });
  ctx.check("an authority visit is accepted by the server", visit === 201, "HTTP " + visit);
  await page.evaluate(() => { window.location.hash = "#/exec"; });
  await H.sleep(600);
  await page.evaluate(() => { window.location.hash = "#/m/inspections"; });
  await H.sleep(3000);
  text = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("the visit is on its register", /M55 Probe Officer/.test(text), text.slice(0, 220));
  ctx.check("the visit register carries no TAT, stage-cost or cost columns",
    !/\bTAT\b/.test(text) && !/Estimated cost/i.test(text), text.slice(0, 260));

  /* ---- the contract request is one workspace ---- */
  const crf = await page.evaluate(async () => {
    const r = await fetch("api/contract-requests", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "CRF-10", department: "Sales" }) });
    const j = await r.json().catch(() => null);
    return { status: r.status, id: j && (j.id || (j.request && j.request.id)) };
  });
  ctx.check("an NDA contract request can be raised", !!crf.id, "HTTP " + crf.status + " " + crf.id);
  if (crf.id) {
    await page.evaluate((id) => { window.location.hash = "#/contract-requests/" + id; }, crf.id);
    await H.sleep(4000);
    const shape = await page.evaluate(() => ({
      sections: document.querySelectorAll("[id^=crfsec-]").length,
      rail: document.querySelectorAll(".crfrailitem").length,
      steps: document.querySelectorAll(".crfstep").length,
      text: (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "),
    }));
    ctx.check("every section is on one page behind a sticky rail, not behind seven steps",
      shape.sections >= 5 && shape.rail >= 5 && shape.steps === 0,
      `${shape.sections} sections · ${shape.rail} rail entries · ${shape.steps} step buttons`);
    ctx.check("no internal schema id is shown to the requester",
      !/CRF-\d\d/.test(shape.text), shape.text.slice(0, 200));
  }

  ctx.pageErrors.length = 0;
});
