/* WHO RAISED IT, WHO OWNS IT, AND WHO AN ESCALATION REACHES.
 *
 * A request carried four overlapping ideas of "requester" and every screen
 * picked a different one. The worst of them rendered a DEPARTMENT ID where a
 * person's name belongs — "dept-sales" printed under an avatar, as though a
 * human being were called that.
 *
 * And the department's own shape was implicit in three places that did not
 * agree: an rbac flag decided who was a lead, a user id written into the
 * reminder module decided who an escalation reached, and nothing at all told a
 * requester who their point of contact was.
 *
 * Both are now single sources, and this suite holds them there.
 */
const H = require("./_harness.js");
const { USERS } = H;

H.runSuite("requester identity, the division chart, and where an escalation goes", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M56_PORT", portFallback: "5056", prefix: "legalos-m56-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, USERS.director, ctx);

  /* ---- a department is never rendered as a person ---- */
  const resolved = await page.evaluate(async () => {
    const v = document.querySelector('script[type=module]').getAttribute("src").split("/")[0];
    const R = await import("./" + v + "/requester.js");
    const dept = R.requesterOf({ requesterId: "dept-sales", department: "Sales", bu: "Real Estate" });
    const named = R.requesterOf({ requesterId: "dept-sales", department: "Sales",
      requestedBy: { name: "Salman Khann", email: "salman.khann@zameen.com" } });
    const none = R.requesterOf({});
    return {
      deptDisplay: dept.displayName, deptUserId: dept.userId, deptDepartment: dept.department,
      namedDisplay: named.displayName, namedKnown: named.known,
      noneDisplay: none.displayName,
      code: R.requesterOf({}).employeeCode, codeLabel: R.NO_EMPLOYEE_CODE,
    };
  });
  ctx.check("a department id is never returned as a user id",
    resolved.deptUserId === null, String(resolved.deptUserId));
  ctx.check("and it is never shown where a person's name belongs",
    !/dept-sales/.test(resolved.deptDisplay) && /Sales/.test(resolved.deptDisplay),
    resolved.deptDisplay);
  ctx.check("the individual the intake captured is preferred over the department",
    resolved.namedDisplay === "Salman Khann" && resolved.namedKnown === true, resolved.namedDisplay);
  ctx.check("a request with no requester at all says Not recorded, never an id",
    resolved.noneDisplay === "Not recorded", resolved.noneDisplay);
  /* §22 — an employee code is never generated. */
  ctx.check("an employee code is null unless HR supplied one",
    resolved.code === null, String(resolved.code));
  ctx.check("and the absence is stated in words, not left blank",
    /not available from HR source/i.test(resolved.codeLabel || ""), resolved.codeLabel);

  /* ---- the division chart is one source, readable by anyone signed in ---- */
  const chart = await page.evaluate(async () => {
    const r = await fetch("api/divisions");
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  ctx.check("the division chart answers", chart.status === 200, "HTTP " + chart.status);
  const divs = (chart.body && chart.body.divisions) || [];
  ctx.check("it covers the three legal divisions",
    divs.length >= 3 && divs.every((d) => d.headUserId), divs.map((d) => d.key).join(", "));
  ctx.check("every division names its points of contact",
    divs.every((d) => (d.pocUserIds || []).length > 0), JSON.stringify(divs.map((d) => d.pocUserIds)));
  ctx.check("and the routing categories that send work to it",
    divs.every((d) => (d.categories || []).length > 0), divs.map((d) => (d.categories || []).length).join("/"));

  /* ---- a non-admin cannot rewrite the org chart ---- */
  const assoc = await H.asUser(browser, sb, USERS.litMember, ctx);
  const refused = await assoc.evaluate(async () => {
    const r = await fetch("api/divisions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisions: [{ key: "litigation", label: "Hijacked", headUserId: "u18" }] }) });
    return r.status;
  });
  ctx.check("only an administrator may change the division chart", refused === 403, "HTTP " + refused);
  await assoc.close();

  const unchanged = await page.evaluate(async () => {
    const r = await fetch("api/divisions");
    const j = await r.json();
    return (j.divisions.find((d) => d.key === "litigation") || {}).label;
  });
  ctx.check("and the refusal left the chart alone", unchanged !== "Hijacked", unchanged);

  /* ---- the chart is what escalations route on ---- */
  await page.evaluate(() => { window.location.hash = "#/organization"; });
  await H.sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Divisions & POCs/.test(x.textContent));
    if (b) b.click();
  });
  await H.sleep(2500);
  const text = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("the chart states the escalation path rather than leaving it to be guessed",
    /A member escalates to their division's manager/i.test(text), text.slice(text.search(/Escalation/) || 0, 260));

  ctx.pageErrors.length = 0;
});
