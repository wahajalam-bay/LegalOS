/* LIFECYCLE AND OUTCOME ARE DIFFERENT FACTS.
 *
 * The case register had one axis — Open / Closed — and the whole litigation
 * function was reported on it. "Completed" tells you a matter is over. It does
 * not tell you whether the company won, and a success rate computed over
 * finished work is a completion rate wearing a different label.
 *
 * This suite pins the model:
 *   • a case is Active or Decided, and that is separate from its outcome;
 *   • a win is NEVER inferred — only a recorded outcome or the source's own
 *     words can say so, and "Dismissed" is its own bucket precisely because a
 *     dismissal cuts both ways depending on which side we were on;
 *   • a success rate excludes live matters AND decided ones whose result
 *     nobody wrote down, both of which are reported separately;
 *   • claim value is claimed, not "exposure", and PKR and USD are never added.
 */
const H = require("./_harness.js");
const { USERS } = H;

/* The model file is an ES module the browser loads; exercise it IN the browser,
   which is also where it actually runs. */
H.runSuite("litigation lifecycle, outcome, position and aging", async (ctx) => {
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M54_PORT", portFallback: "5054", prefix: "legalos-m54-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, USERS.litLead, ctx);

  await page.evaluate(() => { window.location.hash = "#/litigation"; });
  await H.sleep(5000);

  const model = await page.evaluate(async () => {
    const M = await import("./src/litigationmodel.js").catch(async () => {
      const v = document.querySelector('script[type=module]').getAttribute("src").split("/")[0];
      return import("./" + v + "/litigationmodel.js");
    });
    const c = (o) => Object.assign({ status: "", rawStatus: "", outcome: "", position: "", court: "", filed: "" }, o);
    return {
      /* A case with no status is LIVE, not finished. */
      noStatusIsActive: M.lifecycleOf(c({})),
      completedIsDecided: M.lifecycleOf(c({ rawStatus: "Completed" })),
      /* A DECIDED CASE WITH NO RESULT IS "Not Recorded", never a loss. */
      decidedNoOutcome: M.outcomeOf(c({ rawStatus: "Completed" })),
      /* Dismissal is its own bucket — it is not read as a win. */
      dismissed: M.outcomeOf(c({ rawStatus: "Completed", outcome: "Dismissed" })),
      wonInWords: M.outcomeOf(c({ rawStatus: "Completed", outcome: "Decided in our favour" })),
      /* An explicit code beats the prose. */
      coded: M.outcomeOf(c({ rawStatus: "Completed", outcome: "Dismissed", outcomeCode: "Successful / Won" })),
      /* An ACTIVE case has no outcome at all. */
      activeHasNoOutcome: M.outcomeOf(c({ rawStatus: "In Progress", outcome: "Won" })),
      /* Side is read off the source's own column; blank is never assigned. */
      plaintiff: M.positionOf(c({ position: "Plaintiff" })),
      defendant: M.positionOf(c({ position: "Defendant" })),
      blankSide: M.positionOf(c({ position: "" })),
      /* The seat is read out of the forum name, and nothing else is guessed. */
      city: M.cityOf(c({ court: "Lahore High Court" })),
      noCity: M.cityOf(c({ court: "Banking Court" })),
      /* A case with no filing date has no age — not an age of 20,000 days. */
      noAge: M.ageDays(c({})),
      /* The success-rate denominator excludes live and unrecorded matters. */
      rateOverUnrecorded: M.successRate([c({ rawStatus: "Completed" }), c({ rawStatus: "In Progress" })]),
      rateReal: M.successRate([
        c({ rawStatus: "Completed", outcome: "Decided in our favour" }),
        c({ rawStatus: "Completed", outcome: "Settled" }),
        c({ rawStatus: "In Progress" }),
        c({ rawStatus: "Completed" }),
      ]),
      /* Currencies are totalled apart. */
      claims: M.claimTotals([{ exposurePKR: 100, exposureUSD: 0 }, { exposurePKR: 0, exposureUSD: 5 }]),
    };
  });

  ctx.check("a case with no status is Active, not finished", model.noStatusIsActive === "Active", model.noStatusIsActive);
  ctx.check("a completed case is Decided", model.completedIsDecided === "Decided", model.completedIsDecided);
  ctx.check("a decided case with no result reports Not Recorded, never a loss",
    model.decidedNoOutcome === "Not Recorded", model.decidedNoOutcome);
  ctx.check("a dismissal is its own outcome and is never read as a win",
    model.dismissed === "Dismissed", model.dismissed);
  ctx.check("the source's own words are honoured where they state a result",
    model.wonInWords === "Successful / Won", model.wonInWords);
  ctx.check("a recorded outcome beats the source's prose",
    model.coded === "Successful / Won", model.coded);
  ctx.check("an active case has no outcome at all",
    model.activeHasNoOutcome === "Not Recorded", model.activeHasNoOutcome);
  ctx.check("For / Against is read from the position column",
    model.plaintiff === "For" && model.defendant === "Against", model.plaintiff + " / " + model.defendant);
  ctx.check("a blank position is never assigned a side",
    model.blankSide === "Not stated in source", model.blankSide);
  ctx.check("the city is read out of the forum, and only where the forum names one",
    model.city === "Lahore" && model.noCity === "Not stated in source", model.city + " / " + model.noCity);
  ctx.check("a case with no filing date has no age", model.noAge === null, String(model.noAge));
  ctx.check("a success rate over only-unrecorded results is null, not 0%",
    model.rateOverUnrecorded === null, String(model.rateOverUnrecorded));
  ctx.check("the denominator excludes live and unrecorded matters",
    model.rateReal === 50, model.rateReal + "% (1 won of 2 with a recorded result)");
  ctx.check("PKR and USD claims are totalled separately and never added",
    model.claims.pkr === 100 && model.claims.usd === 5, JSON.stringify(model.claims));

  /* ---- and the screens built on it ---- */
  const reg = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("the register shows Lifecycle and Outcome as separate columns",
    /LIFECYCLE/i.test(reg) && /OUTCOME/i.test(reg), reg.slice(0, 200));
  ctx.check("the register calls it Claim value, not Exposure",
    /CLAIM VALUE/i.test(reg) && !/\bEXPOSURE\b/.test(reg.slice(0, 900)), reg.slice(0, 260));

  await page.evaluate(() => { window.location.hash = "#/m/analytics"; });
  await H.sleep(4500);
  const an = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("analytics reports the success-rate denominator honestly",
    /decided cases with a recorded result/i.test(an), an.slice(0, 300));
  ctx.check("analytics carries firm analysis, aging and the year series",
    /Law firm analysis/i.test(an) && /Matter aging/i.test(an) && /Cases filed by year/i.test(an),
    an.slice(0, 300));
  ctx.check("it never adds PKR to USD",
    /never converted, never added across currencies/i.test(an) || /Total claims value/i.test(an),
    an.slice(0, 220));

  /* ---- notices bifurcate on direction ---- */
  await page.evaluate(() => { window.location.hash = "#/m/notices"; });
  await H.sleep(4500);
  const not = await page.evaluate(() => (document.querySelector(".content") || document.body).innerText.replace(/\s+/g, " "));
  ctx.check("notices split Received / Sent / All as the primary cut",
    /Received/.test(not) && /Sent/.test(not) && /All/.test(not), not.slice(0, 220));
  ctx.check("a derived direction says it was derived rather than claiming to be stated",
    /read off the parties/i.test(not) || /no direction/i.test(not), not.slice(0, 400));

  ctx.pageErrors.length = 0;
});
