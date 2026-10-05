const H = require("./_harness.js");
H.runSuite("litigation register, notices KPIs and the request picker", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_TMPB_PORT", portFallback: "5093", prefix: "legalos-tmpb-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const p = await H.asUser(browser, sb, H.USERS.director, ctx);

  await H.goHash(p, "/litigation");
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(9000);
  const lit = await p.evaluate(() => {
    const head = (document.querySelector(".pagehead") || {}).innerText || "";
    const body = (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " ");
    const th = [...document.querySelectorAll("table.table thead th")].map((n) => n.innerText.trim());
    const types = [...document.querySelectorAll("table.table tbody tr")]
      .map((r) => (r.children[2] || {}).innerText || "").map((x) => x.trim());
    return { head: head.replace(/\s+/g, " "), body: body.slice(0, 400), th, types: [...new Set(types)].slice(0, 8),
      overdue: (body.match(/\d+d overdue/g) || []).length,
      notrec: (body.match(/outcome not recorded/g) || []).length };
  });
  check("the page is titled Litigation, not the family name",
    /^Litigation\b/.test(lit.head) && !/Litigation & Disputes/.test(lit.head), lit.head.slice(0, 90));
  check("no case is typed 'Dispute' just because the source left it blank",
    !lit.types.includes("Dispute"), lit.types.join(" | "));
  check("the Next hearing column no longer shouts 'Nd overdue'",
    lit.overdue === 0, lit.overdue + " overdue badges");
  check("a hearing date that has gone by says the outcome is not recorded",
    lit.notrec > 0, lit.notrec + " rows");
  check("Filed is not a default column", !lit.th.includes("FILED"), lit.th.join(" | "));
  check("Court and City are offered as filters",
    /Court \/ forum|Court/.test(lit.body) && /City/.test(lit.body), lit.body.slice(0, 220));

  await H.goHash(p, "/m/notices");
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(9000);
  const not = await p.evaluate(() => ({
    kpis: [...document.querySelectorAll(".statkpi")].map((k) => k.innerText.replace(/\s+/g, " ").trim()),
    regsum: document.querySelectorAll(".regsum__i").length,
  }));
  check("the notices figures are proper KPI cards", not.kpis.length >= 6 && not.regsum === 0,
    not.kpis.join(" | ") + "  · regsum " + not.regsum);
  check("and they carry the Received / Sent bifurcation",
    not.kpis.some((k) => /Received/.test(k)) && not.kpis.some((k) => /\bSent\b/.test(k)), not.kpis.join(" | "));

  await H.goHash(p, "/contract-requests");
  await H.sleep(5000);
  const picker = await p.evaluate(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => /New (contract )?request/i.test(x.innerText));
    if (!b) return { err: "no New request button" };
    b.click();
    await new Promise((r) => setTimeout(r, 1200));
    const rows = [...document.querySelectorAll(".crfpick")].map((x) => x.innerText.replace(/\s+/g, " ").trim());
    return { rows };
  });
  check("the request picker names the agreement instead of numbering it",
    picker.rows && picker.rows.length >= 9 && !picker.rows.some((r) => /CRF-\d/.test(r)),
    (picker.rows || [picker.err]).join(" | "));
  check("and the NDA is one of the choices",
    (picker.rows || []).some((r) => /Non-Disclosure/i.test(r)), (picker.rows || []).join(" | "));
});
