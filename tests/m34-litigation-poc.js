// THE LITIGATION POC CHANGES, AS A LEGAL USER MEETS THEM.
//
// What this holds in place, and why each one was a defect rather than a
// preference:
//
//   DIRECTION was five values answering two different questions. "Criminal /
//   Police" is what KIND of matter it is -- the case category already records
//   that -- so picking it put a nature in a field that decides a side, and the
//   opening stage was then derived from a value that did not mean what it said.
//   Two remain. Every older spelling still resolves; nothing in the source was
//   rewritten.
//
//   THE WIZARD lost everything if the window closed. It now saves itself 1.5s
//   after typing stops, and flushes on pagehide. Deliberately NOT a
//   beforeunload prompt: that blocks the navigation until somebody answers it,
//   fires whether or not anything is unsaved, and hangs every automated journey
//   through the form. The work is saved rather than the user asked about it.
//
//   A NOTICE has an issuance date and a receiving date, and the gap between
//   them is what a limitation argument turns on. One field forced whoever typed
//   it to pick which they meant.
//
//   ADDING A HEARING left the old one standing, so a case showed two "Next
//   Hearing" deadlines with nothing to say which to turn up for. A case has one
//   next hearing; the date it replaces becomes the last hearing.
//
//   A CASE FILED WITHOUT ITS PLAINT had nowhere to put one -- documents could
//   be attached while raising a case and never afterwards.
//
//   FX IS NOT INVENTED. No approved rate source is configured, so an exposure
//   entered in rupees says "conversion pending" rather than showing a dollar
//   figure nobody can stand behind. Configure a rate and both appear, with the
//   rate and its date on the derived one.
//
//   THE CAUSE LIST is derived from the cases every time it is read. A copied
//   cause-list dataset starts disagreeing with the cases the first time a date
//   moves, and then nobody knows which to believe.
//
//   REMINDERS are derived too, and idempotent: the same reminder raised twice
//   is one notification. They go to whoever is responsible for the case, never
//   to whoever triggered the raise. Email is reported as unconfigured, never
//   faked.
//
//   node tests/m34-litigation-poc.js
const H = require("./_harness.js");
const store = require("../api/litigation-cases.js");

const SET = `(e,v)=>{if(!e)return;const proto=e.tagName==="SELECT"?window.HTMLSelectElement:(e.tagName==="TEXTAREA"?window.HTMLTextAreaElement:window.HTMLInputElement);Object.getOwnPropertyDescriptor(proto.prototype,"value").set.call(e,v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}`;

H.runSuite("litigation — the POC changes", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M34_PORT", portFallback: "5040", prefix: "legalos-m34-",
  }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const hash = () => p.evaluate(() => location.hash);
  const text = () => p.evaluate(() => document.body.innerText);

  /* ------------------------------------------------- the vocabulary ---- */

  check("a case is either For us or Against us",
    store.DIRECTIONS.length === 2 && store.DIRECTIONS.includes("For") && store.DIRECTIONS.includes("Against"),
    store.DIRECTIONS.join(" | "));
  check("every older direction still resolves to one of the two",
    store.canonDirection("We initiated") === "For"
      && store.canonDirection("Against us") === "Against"
      && store.canonDirection("Criminal / Police") === "Against",
    "old values map forward");
  check("a direction outside the vocabulary is refused, not silently dropped",
    store.canonDirection("Sideways") === "", "unrecognised resolves to nothing");

  check("the case-type list is the nine the business files under",
    store.CASE_TYPES.length === 9 && store.CASE_TYPES.includes("Writ Petitions")
      && store.CASE_TYPES.includes("ZD Project Cases") && !store.CASE_TYPES.includes("Commercial"),
    store.CASE_TYPES.join(" | "));
  check("historical case types map onto them rather than being refused",
    store.canonCaseType("Commercial") === "Civil Disputes"
      && store.canonCaseType("Employment / Labour") === "Severance Claims"
      && store.canonCaseType("Intellectual Property") === "IP Infringement",
    "old taxonomy resolves");
  check("a case is Pending or Completed, not five words for two states",
    store.STATUSES.join("|") === "Pending|Completed"
      && store.canonStatus("On Hold") === "Pending" && store.canonStatus("Closed") === "Completed",
    store.STATUSES.join(" | "));
  check("company position is the four a pleading uses",
    store.COMPANY_POSITIONS.join("|") === "Plaintiff|Defendant|Petitioner|Respondent",
    store.COMPANY_POSITIONS.join(" | "));

  /* ------------------------------------------------- the six modules ---- */

  for (const [label, route] of [
    ["Litigation", "/litigation"], ["Notices", "/m/notices"], ["IP Portfolio", "/m/ip"],
    ["Developer Disputes", "/m/developerDisputes"], ["Police Complaints", "/m/police"],
    ["Government Authority Visits", "/m/inspections"],
  ]) {
    await H.goHash(p, route);
    await H.sleep(2600);
    const t = await p.evaluate(() => (document.querySelector(".pagehead") || document.body).innerText);
    check(label + " is its own module and opens", !/not available|not found/i.test(t),
      t.replace(/\s+/g, " ").slice(0, 70));
  }
  await H.goHash(p, "/m/inspections");
  await H.sleep(2400);
  /* THE GENERIC COLUMNS ARE GONE; THE MODULE'S OWN LIFECYCLE IS NOT.
     This register was rendered by the generic workflow page, which carried TAT,
     a generic Stage and a Cost column on every module whether or not the module
     had any such thing — three columns that were empty on every row of this
     one. What replaced them is the visit's OWN named workflow (scheduled →
     conducted → remediation → book signed → closed), which is a fact about the
     visit, so a Stage column here is populated and worth its width.

     This check used to pass for the wrong reason: with no visits logged the
     table did not render at all, so there were no headers to fail on. The
     headings are kept on an empty register now, which is what exposed it. */
  const visit = await p.evaluate(() => ({
    cols: [...document.querySelectorAll("table.table thead th")].map((n) => n.innerText.trim()),
    stages: [...document.querySelectorAll(".fltbtn")].map((b) => b.innerText.trim()),
    rows: document.querySelectorAll("table.table tbody tr[class]").length,
  }));
  check("Government Authority Visits drops the generic TAT and Cost columns",
    !visit.cols.some((c) => /^TAT$|Cost/i.test(c)), visit.cols.join(" | "));
  /* The stage FILTERS only appear once something is logged — a filter row over
     an empty register is a row of controls that cannot change anything, and
     these two modules start empty by design. So the lifecycle is asserted
     wherever it is actually on screen: the filter row when there are records,
     the column heading when there are not. */
  check("and its Stage column is the visit's own lifecycle, not a generic one",
    visit.cols.some((c) => /^stage$/i.test(c))
      && (visit.rows === 0 || visit.stages.some((b) => /Book Signed \/ Certificate Issued/i.test(b))),
    `${visit.rows} row(s) · ` + (visit.stages.join(" | ") || "no stage filters (register is empty)"));

  /* ------------------------------------- developer disputes, from source */

  const dd = await p.evaluate(async () => {
    const r = await fetch("/api/litigation/developer-disputes", { headers: { accept: "application/json" } });
    return await r.json();
  });
  check("Developer Disputes is read from the team's own tracker",
    dd.source && /Developer Disputes/i.test(dd.source.file) && dd.matters.length > 0,
    dd.source ? dd.source.file + " / " + dd.source.sheet : "not read");
  check("its two tables are kept apart, not flattened into one",
    dd.matters.length !== dd.projects.length && dd.projects.length > dd.matters.length,
    dd.matters.length + " matters and " + dd.projects.length + " project rows");
  check("its dropdowns are the tracker's own values",
    (dd.options.status || []).includes("Very Critical") && (dd.options.group || []).length > 5,
    (dd.options.status || []).join(" / "));

  /* -------------------------------------------------- the cause list ---- */

  const cl = await p.evaluate(async () => {
    const r = await fetch("/api/litigation/cause-list", { headers: { accept: "application/json" } });
    return await r.json();
  });
  check("the cause list covers this week and next, Monday to Sunday in PKT",
    cl.weeks && cl.weeks.thisWeek.from && cl.weeks.nextWeek.from
      && new Date(cl.weeks.thisWeek.from + "T00:00:00Z").getUTCDay() === 1
      && /Karachi/.test(cl.timezone || ""),
    cl.weeks.thisWeek.from + "–" + cl.weeks.thisWeek.to + " then " + cl.weeks.nextWeek.from + "–" + cl.weeks.nextWeek.to);
  check("it is derived from the cases, so it counts only real dates",
    cl.counts && cl.counts.withDate > 0 && cl.counts.withDate <= cl.counts.total,
    cl.counts.withDate + " of " + cl.counts.total + " cases carry a hearing date");

  await H.goHash(p, "/m/causelist");
  await H.sleep(4000);
  const clBody = await text();
  /* THE CAUSE LIST IS A CALENDAR NOW.
     Two fixed weeks answered "what is coming" and only that. A litigation team
     also asks "what did we have on the 14th", "how heavy is March", and "move
     me forward a month" — none of which a fixed two-week list can answer. The
     list on the left is the selected day; the grid on the right is the period
     around it, and Previous / Today / Next move it. */
  const cal = await p.evaluate(() => ({
    grid: !!document.querySelector(".cal__grid"),
    days: document.querySelectorAll(".cal__day").length,
    controls: [...document.querySelectorAll(".calnav__b")].map((b) =>
      (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean),
  }));
  check("the cause list is a calendar, with a period you can move",
    cal.grid && cal.days >= 28
      && cal.controls.some((c) => /Today/i.test(c))
      && cal.controls.some((c) => /Previous/i.test(c))
      && cal.controls.some((c) => /Next/i.test(c))
      && cal.controls.some((c) => /^Week$/i.test(c)) && cal.controls.some((c) => /^Month$/i.test(c)),
    cal.days + " days · " + cal.controls.join(" / "));
  check("the screen says what the list is built from",
    /next-hearing date on each case/i.test(clBody), "provenance stated");
  const clickable = await p.evaluate(() => document.querySelectorAll(".feed__item.clickable").length);
  check("every hearing on it opens its case", clickable > 0, clickable + " hearings, each a link");

  await H.goHash(p, "/dashboard");
  await H.sleep(5000);
  check("this week's hearings are on the page the team lands on",
    /This week in court/i.test(await text()), "on the dashboard, no navigation needed");

  /* --------------------------------------------------- the reminders ---- */

  const rem = await p.evaluate(async () => {
    const r = await fetch("/api/litigation/reminders", { headers: { accept: "application/json" } });
    return await r.json();
  });
  check("reminders are derived from the state of the cases",
    rem.counts && rem.counts.total > 0, JSON.stringify(rem.counts));
  check("email is reported as unconfigured rather than pretended",
    rem.channels.email.available === false && /No Gmail connector/.test(rem.channels.email.detail),
    rem.channels.email.detail);
  check("a hearing years past is a gap in the history, not an alarm",
    rem.counts.outcomeMissingHistoric > 0 && rem.counts.outcomeDue < rem.counts.outcomeMissingHistoric,
    rem.counts.outcomeDue + " worth chasing, " + rem.counts.outcomeMissingHistoric + " historic");

  /* IDEMPOTENCE, ASSERTED ON WHAT IT ACTUALLY MEANS: the number of
     notifications on the bell does not move when the same reminders are raised
     again. It used to be asserted as "the first POST raises some and the
     second raises none", which stopped being true the moment the app began
     raising reminders on sign-in — by the time the test posts, the boot sweep
     has already raised them, and "0 then 0" is the correct behaviour rather
     than a regression. Counting the bell is the claim that survives. */
  const bell = async () => p.evaluate(async () => {
    const j = await (await fetch("/api/notifications", { headers: { accept: "application/json" } })).json();
    return (j.notifications || []).length;
  });
  const bellBefore = await bell();
  const raised1 = await p.evaluate(async () => (await (await fetch("/api/litigation/reminders",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()).raised);
  const bellMid = await bell();
  const raised2 = await p.evaluate(async () => (await (await fetch("/api/litigation/reminders",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()).raised);
  const bellAfter = await bell();
  check("raising the same reminders again adds nothing to the bell",
    bellMid === bellAfter && raised2 === 0,
    `${bellBefore} before, ${bellMid} after one raise (${raised1} new), ${bellAfter} after two (${raised2} new)`);
  const mine = await p.evaluate(async () => {
    const j = await (await fetch("/api/notifications", { headers: { accept: "application/json" } })).json();
    return (j.notifications || []).filter((n) => /hearing-due|outcome-due|witness/.test(n.kind || "")).length;
  });
  check("a reminder is not broadcast to whoever triggered it", mine === 0,
    "none on the Director's bell — these cases are not theirs");
  const lead = await H.asUser(browser, sb, H.USERS.litLead.email, ctx);
  const theirs = await lead.evaluate(async () => {
    const j = await (await fetch("/api/notifications", { headers: { accept: "application/json" } })).json();
    const r = (j.notifications || []).filter((n) => /hearing-due|outcome-due|witness/.test(n.kind || ""));
    return { n: r.length, to: r[0] && r[0].to };
  });
  check("it reaches the person responsible, and links to the case",
    theirs.n > 0 && /^\/litigation\//.test(theirs.to || ""), theirs.n + " on the litigation lead's bell");
  try { await lead.close(); } catch (e) { /* closing anyway */ }

  /* ------------------------------------------- a case, end to end ------- */

  const id = await p.evaluate(async () => {
    const r = await fetch("/api/litigation/cases", {
      method: "POST", headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        title: "POC journey case", caseType: "Non-Compete Matters", nature: "Civil Suit",
        direction: "For", entity: "Zameen Media (Private) Limited",
        court: { name: "Civil Court", city: "Lahore" },
        financial: { currency: "PKR", exposurePKR: 10000, recoverablePKR: 10000 },
        dates: { filing: "2026-09-22", nextHearing: "2026-09-23" },
      }),
    });
    const j = await r.json();
    return j.case ? j.case.id : null;
  });
  check("a case can be raised against the new vocabulary", !!id, id || "not created");

  await H.goHash(p, "/litigation/" + id);
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  const facts = await p.evaluate(() => {
    const c = [...document.querySelectorAll(".card")].find((x) => /Key facts/i.test(x.innerText));
    return c ? c.innerText.replace(/\s+/g, " ") : "";
  });
  check("an amount says its conversion is pending rather than inventing a rate",
    /conversion pending/i.test(facts) && !/\$/.test(facts),
    (facts.match(/Recoverable[^]{0,40}/) || ["?"])[0]);

  const hearingFields = await p.evaluate(() => {
    const b = [...document.querySelectorAll(".btn, button")].find((x) => /Add hearing/i.test(x.innerText));
    if (b) b.click();
    return null;
  });
  await H.sleep(2000);
  const fields = await p.evaluate(() =>
    [...document.querySelectorAll(".modal .field")].map((f) => f.innerText.split("\n")[0].trim()));
  check("the hearing form no longer asks for a judge nobody has to hand",
    fields.length > 0 && !fields.some((f) => /judge|bench/i.test(f)), fields.join(" | "));

  const thisHash = await p.evaluate(() => location.hash);

  await p.evaluate((S) => {
    const set = eval(S);
    set([...document.querySelectorAll(".modal input[type=date]")][0], "2026-09-30");
  }, SET);
  await H.sleep(500);
  await p.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((x) => /^Save$/i.test(x.innerText)).click());
  await H.sleep(3000);

  /* EVERY hearing form, not just the one that was screenshotted.
     There are two: the Add hearing sheet on a case raised here, and Log
     hearing on a case that came from the tracker. Both record the same fact
     about the same case, so dropping the field from one left the other still
     asking -- which is what the reviewer saw. This closes the class. */
  const trackerCase = await p.evaluate(async () => {
    const j = await (await fetch("/api/registers/litigation?limit=600",
      { headers: { accept: "application/json" } })).json();
    const r = (j.records || []).find((x) => x.__origin !== "LEGALOS");
    return r ? r.id : "";
  });
  if (trackerCase) {
    await H.goHash(p, "/litigation/" + trackerCase);
    await p.reload({ waitUntil: "networkidle2" });
    await H.sleep(7000);
    const opened = await p.evaluate(() => {
      const b = [...document.querySelectorAll(".btn, button")].find((x) => /Log hearing/i.test(x.innerText));
      if (!b) return false;
      b.click(); return true;
    });
    await H.sleep(2200);
    const f2 = await p.evaluate(() =>
      [...document.querySelectorAll(".modal .field")].map((f) => f.innerText.split("\n")[0].trim()));
    check("the OTHER hearing form does not ask for a judge either",
      opened && f2.length > 0 && !f2.some((x) => /judge|bench/i.test(x)),
      opened ? f2.join(" | ") : "Log hearing not offered on a tracker case");
    await p.evaluate(() => {
      const c = [...document.querySelectorAll(".modal .btn")].find((x) => /Cancel/i.test(x.innerText));
      if (c) c.click();
    });
    await H.sleep(800);
  }
  await H.goHash(p, thisHash.replace(/^#/, ""));
  await H.sleep(3000);
  await H.sleep(4000);
  const after = await p.evaluate(async (i) => {
    const j = await (await fetch("/api/litigation/cases/" + i, { headers: { accept: "application/json" } })).json();
    const c = j.case || j;
    return { next: (c.dates || {}).nextHearing, last: (c.dates || {}).lastHearing,
      nextDeadlines: (c.deadlines || []).filter((d) => d.kind === "Next Hearing").length };
  }, id);
  check("the hearing it replaces becomes the last date of hearing",
    after.last === "2026-09-23" && after.next === "2026-09-30",
    "next " + after.next + ", last " + after.last);
  check("and the case carries exactly one Next Hearing", after.nextDeadlines === 1,
    after.nextDeadlines + " Next Hearing deadline(s)");

  await p.evaluate(() => [...document.querySelectorAll(".btn, button")].find((x) => /^More/i.test(x.innerText)).click());
  await H.sleep(1200);
  const more = await p.evaluate(() =>
    [...document.querySelectorAll(".linkbtn, button")].map((b) => b.innerText.trim()).filter(Boolean));
  check("a document can be added to a case that already exists",
    more.some((m) => /Add document/i.test(m)), more.filter((m) => /Add|Assign/i.test(m)).join(" | "));

  /* -------------------------------------------- the intake wizard ------- */

  await H.goHash(p, "/litigation");
  await H.sleep(3000);
  /* "+ Add a case" — the register's primary action was renamed: "raise a case"
     reads like raising a dispute, which is what the business does TO us. */
  await p.evaluate(() => [...document.querySelectorAll(".btn")].find((x) => /add a case/i.test(x.innerText)).click());
  await H.sleep(2500);
  await p.evaluate(() => {
    const b = [...document.querySelectorAll(".modal .btn")].find((x) => /^Next$/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(1500);
  await p.evaluate((S) => {
    const set = eval(S);
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /Case title/i.test(x.innerText));
    set(f.querySelector("input"), "Autosave proof");
  }, SET);
  await H.sleep(4500);
  check("the wizard saves the draft by itself while you type",
    /Draft saved/i.test(await p.evaluate(() => document.querySelector(".modal").innerText)),
    "saved without anyone pressing Save draft");
  const onServer = await p.evaluate(async () => {
    const j = await (await fetch("/api/litigation/drafts", { headers: { accept: "application/json" } })).json();
    return /Autosave proof/.test(JSON.stringify(j));
  });
  check("and the draft is on the server, so closing the window cannot lose it", onServer, "persisted");

  const forum = await p.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      const b = [...document.querySelectorAll(".modal .btn")].find((x) => /^Next$/i.test(x.innerText));
      if (b) b.click();
    }
    return document.querySelector(".modal").innerText.replace(/\s+/g, " ");
  });
  await H.sleep(1600);
  const forumNow = await p.evaluate(() => document.querySelector(".modal").innerText.replace(/\s+/g, " "));
  check("the forum step no longer asks for Jurisdiction or Bench/judge",
    !/Jurisdiction/i.test(forumNow) && !/Bench \/ judge/i.test(forumNow),
    "both removed — jurisdiction still derives from the court");

  await p.evaluate(() => {
    const b = [...document.querySelectorAll(".modal .btn")].find((x) => /^Next$/i.test(x.innerText));
    if (b) b.click();
  });
  await H.sleep(1800);
  const dates = await p.evaluate(() => document.querySelector(".modal").innerText.replace(/\s+/g, " "));
  check("a notice has an issuance date and a receiving date",
    /Notice issuance date/i.test(dates) && /Notice receiving date/i.test(dates),
    "two dates, two headings");

  /* ------------------------------------------- invoices and spend ------- */

  const billId = await p.evaluate(async () => {
    const r = await fetch("/api/litigation/cases", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Spend journey", caseType: "Civil Disputes", nature: "Civil Suit",
        direction: "For", entity: "Zameen Media (Private) Limited", counsel: { firm: "Ahmed & Co" } }),
    });
    return (await r.json()).case.id;
  });
  const billed = await p.evaluate(async (i) => {
    const r = await fetch("/api/litigation/cases/" + i + "/invoices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceDate: "2026-09-01", invoiceNumber: "INV-3001", jeffiNo: "JEF-1",
        nature: "Case Fee", amount: 250000, currency: "PKR", amountPaid: 100000,
        paymentDate: "2026-09-15", issuingFirm: "Ahmed & Co" }),
    });
    const j = await r.json();
    return ((j.case && j.case.invoices) || []).slice(-1)[0];
  }, billId);
  check("payment % and outstanding are worked out from the figures",
    billed && billed.paymentPercent === 40 && billed.outstanding === 150000
      && billed.status === "Partially Paid",
    billed ? billed.paymentPercent + "% paid, " + billed.outstanding + " outstanding" : "not recorded");
  check("and the record says which figures were derived rather than stated",
    billed && billed.derived.paymentPercent === true && billed.derived.outstanding === true,
    JSON.stringify(billed && billed.derived));

  await p.evaluate(async () => {
    await fetch("/api/litigation/retainers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issuingFirm: "Ahmed & Co", invoiceNumber: "RET-1", dateReceived: "2026-08-01",
        amount: 600000, currency: "PKR", amountPaid: 600000, entity: "Zameen Media (Private) Limited" }),
    });
  });
  const spend = await p.evaluate(async () => await (await fetch("/api/litigation/spend")).json());
  check("case spend and retainer spend are reported apart, per currency",
    spend.totals.caseInvoices.PKR.invoiced === 250000 && spend.totals.retainers.PKR.invoiced === 600000,
    JSON.stringify(spend.totals));
  check("the firm's total includes its retainer, the case's does not",
    (spend.byCounsel.find((x) => x.key === "Ahmed & Co") || {}).byCurrency.PKR.invoiced === 850000
      && (spend.byCase[0] || {}).byCurrency.PKR.invoiced === 250000,
    "firm 850,000 · case 250,000");

  await H.goHash(p, "/litigation/" + billId);
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(7000);
  /* THE CASE'S OWN TABS, not the family strip above them. The litigation family
     carries an "Invoices & Spend" register of its own, and a selector that does
     not exclude the family strip clicks that instead and navigates off the case
     — asserting the page it just left. */
  const CASE_TABS = ".tab:not(.famtabs .tab), [role=tab]:not(.famtabs [role=tab])";
  const invTabs = await p.evaluate((sel) =>
    [...document.querySelectorAll(sel)].map((t) => t.innerText.replace(/\s+/g, " ").trim()), CASE_TABS);
  check("the case carries an Invoices tab", invTabs.some((t) => /Invoices/i.test(t)), invTabs.join(" | "));
  await p.evaluate((sel) => {
    const t = [...document.querySelectorAll(sel)].find((x) => /Invoices/i.test(x.innerText));
    if (t) t.click();
  }, CASE_TABS);
  await H.sleep(2000);
  check("and the invoice is on it, with its derived figures",
    /INV-3001/.test(await text()) && /Partially Paid/i.test(await text()), "shown on the case");

  /* ------------------------------------------- police complaints -------- */

  await H.goHash(p, "/m/police");
  await H.sleep(4500);
  const pcCols = await p.evaluate(() =>
    [...document.querySelectorAll("table.table thead th")].map((n) => n.innerText.trim()));
  check("a police complaint records which way it runs, and its diary number",
    pcCols.some((c) => /direction/i.test(c)) && pcCols.some((c) => /diary/i.test(c)), pcCols.join(" | "));
  check("there is no Section 154 CrPC field — every complaint is treated under it",
    !/154/.test(await text()), "absent by design");
  const pcBtns = await p.evaluate(() => [...document.querySelectorAll(".btn")].map((b) => b.innerText.trim()).filter(Boolean));
  /* Each module names what IT creates, so the button says Police Complaint --
     not "New complaint", and not "Raise a case". */
  check("a complaint can be raised, and the action names what it creates",
    pcBtns.some((b) => /new police complaint/i.test(b)) && !pcBtns.some((b) => /raise a case/i.test(b)),
    pcBtns.join(" | "));
  /* src/modules.js is an ES module the browser loads; it cannot be required
     from here, so the definition is read as source. */
  const modSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "modules.js"), "utf8");
  const policeBlock = modSrc.slice(modSrc.indexOf('key: "police"'), modSrc.indexOf('key: "notices"'));
  check("the workflow pauses for a 22-A / 22-B rather than closing the complaint",
    /Paused – 22-A \/ 22-B Proceedings/.test(policeBlock) && /Police Inquiry/.test(policeBlock),
    (policeBlock.match(/workflow: \[[^\]]*\]/) || ["not found"])[0].replace(/\s+/g, " ").slice(0, 170));
  check("and the petition is recorded on the complaint it came out of",
    ["s22Filed", "s22FilingDate", "s22Court", "s22CaseNo", "s22Outcome"]
      .every((k) => policeBlock.includes('key: "' + k + '"')),
    "filing date, court, case no. and order all on the record");

  /* --------------------------------------- spend and report, on screen -- */

  await H.goHash(p, "/litigation");
  await H.sleep(4000);
  /* EVERY FAMILY HAS ONE HOME, AND ONE PLACE THAT NAMES IT.
     The cause list, the invoice ledger and the report were tabs on this page,
     one row under a chip strip that named them too, under a sidebar group that
     named them a third time. They are modules now; the module nav names them
     once, and this page shows the cases. */
  /* WHERE THE REGISTER LANDS.
     Unsorted, the book came back in tracker order and the first screen of the
     litigation register was 149 closed cases -- work that had already
     finished. It lands on live cases, nearest hearing first, and hides none. */
  const firstScreen = await p.evaluate(() => {
    const heads = [...document.querySelectorAll("table.table thead th")].map((t) => t.innerText.trim().toUpperCase());
    const si = heads.findIndex((h) => h.startsWith("STATUS"));
    return [...document.querySelectorAll("table.table tbody tr")].slice(0, 12)
      .map((r) => { const c = r.querySelectorAll("td"); return si >= 0 && c[si] ? c[si].innerText.trim() : ""; });
  });
  check("the register lands on live cases, not on completed ones",
    firstScreen.length > 0 && firstScreen.every((st) => !/closed|completed/i.test(st)),
    firstScreen.slice(0, 6).join(", "));
  const totalShown = await p.evaluate(() => {
    const m = document.body.innerText.match(/([\d,]+)\s+cases/); return m ? m[1].replace(/,/g, "") : "";
  });
  check("and it hides nothing to do it", Number(totalShown) >= 358, totalShown + " cases still in the register");

  /* The FAMILY strip is where the family's registers belong — that is the whole
     point of it. What must not happen is the case register repeating them a
     second time in its own chrome, which is what this was written for. */
  const dupes = await p.evaluate(() => ({
    tabs: [...document.querySelectorAll(".regtab:not(.famtabs .regtab), [role=tab]:not(.famtabs [role=tab])")]
      .map((b) => b.innerText.replace(/\s+/g, " ").trim()).filter(Boolean),
    chips: document.querySelectorAll(".litmods, .litmod").length,
  }));
  check("the case register page repeats them neither as tabs nor as chips",
    !dupes.tabs.some((t) => /^(Cause List|Invoices & Spend|Analytics)/.test(t)) && dupes.chips === 0,
    (dupes.tabs.length ? dupes.tabs.join(" | ") : "no tab strip") + " · " + dupes.chips + " chips");
  await H.goHash(p, "/g/litigation");
  await H.sleep(5000);
  const litHub = await p.evaluate(() =>
    [...document.querySelectorAll(".nav__item, .hubcard, .hubtile, a, button")]
      .map((b) => b.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
  /* The labels moved with the product-integration pass: the cause list became a
     calendar, and "Reports" became Analytics because it answers questions
     across the whole family rather than only about cases. */
  const HUB_WANT = ["Litigation", "Cause List / Calendar", "Invoices & Spend", "Analytics"];
  check("the family hub carries every litigation destination, cause list and spend included",
    HUB_WANT.every((t) => litHub.some((x) => x.startsWith(t))),
    HUB_WANT.filter((t) => !litHub.some((x) => x.startsWith(t))).join(", ") || "all present");

  /* The addresses those tabs had still resolve, to the module that owns them.
     Set directly rather than through goHash: the redirect fires before the
     harness can observe the old address, which is the point of it. */
  await p.evaluate(() => { location.hash = "#/litigation?view=causelist"; });
  await H.sleep(3500);
  check("a saved ?view= link lands on the module that owns it",
    /\/m\/causelist/.test(await p.evaluate(() => location.hash)),
    await p.evaluate(() => location.hash));

  await H.goHash(p, "/m/spend");
  await H.sleep(4000);
  const spendBody = await text();
  check("the spend view keeps case invoices and firm retainers apart",
    /Case invoices/.test(spendBody) && /Retainers/.test(spendBody)
      && /not attributed to a case|never attributed to a case/i.test(spendBody),
    "shown apart, and it says why");
  const groups = await p.evaluate(() =>
    [...document.querySelectorAll(".card__title")].map((t) => t.innerText.trim()));
  check("spend answers by firm, entity, case, nature and payment status",
    ["By counsel", "By entity", "By case", "By nature", "By payment status"]
      .every((g) => groups.some((x) => x.startsWith(g))),
    groups.filter((g) => g.startsWith("By")).join(" | "));

  await H.goHash(p, "/m/report");
  await H.sleep(3500);
  await p.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => /Generate report/i.test(b.innerText)).click());
  await H.sleep(5000);
  const reported = await p.evaluate(() => ({
    visible: document.body.innerText.replace(/\s+/g, " "),
    draft: (document.querySelector("textarea") || {}).value || "",
  }));
  check("a report is assembled for a date range and previewed in the app",
    /Weekly litigation report/.test(reported.draft) && /What the records say/.test(reported.visible),
    (reported.draft.match(/\*\*Period:\*\*[^\n]{0,40}/) || ["no draft"])[0]);
  check("and it says what it was drawn from rather than asserting conclusions",
    /Assembled from the litigation register/i.test(reported.draft)
      && /nothing here is inferred/i.test(reported.draft),
    "provenance in the footer");
  const wasEdited = await p.evaluate(() => {
    const t = document.querySelector("textarea");
    if (!t) return false;
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
      .call(t, t.value + "\n\nAdded by the reviewer.");
    t.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  await H.sleep(900);
  check("the draft is a draft — editable, and marked once it has been touched",
    wasEdited && /Edited/.test(await text()), "a lawyer signs it off, not the generator");

  check("no page error anywhere in the litigation journey", errs.length === 0,
    errs.slice(0, 3).join(" ;; ") || "none");

  try { await p.close(); await browser.close(); } catch (e) { /* going away anyway */ }
});
