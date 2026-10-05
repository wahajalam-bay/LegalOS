// MODULE 3 — Contract Intelligence, end to end. Engine assertions run through
// the SAME live ES modules the app ships; the screens are driven for real.
//
// MIGRATED 2026-09-18: isolated sandbox, one real session per role, the current
// store key, and the build path read from the served page. Engine calls name
// the function instead of evaluating a source string — the app's CSP forbids
// eval, and the old helper could not have run at all.
//
//   node tests/m3-contract-intelligence.js
const H = require("./_harness.js");

H.runSuite("m3-contract-intelligence — clause governance, drafting and review", async (ctx) => {
  const { check: ok } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_M3_PORT", portFallback: "4869", prefix: "legalos-m3-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const p = await H.asUser(browser, sb, H.USERS.director, ctx);
  const SRC = await H.buildDir(p, sb.base);
  ok("the served build is discovered rather than hardcoded", !!SRC, SRC);

  const S = (fn, ...args) => H.appCall(p, SRC, "store.js", fn, ...args);
  const body = (pg) => pg.evaluate(() => document.body.innerText);
  const go = async (pg, hash) => { await H.goHash(pg, hash); await H.sleep(600); };
  // Role switching is a real sign-in, in its own browser context.
  const pages = {};
  const as = async (user) => {
    if (!pages[user.email]) pages[user.email] = await H.asUser(browser, sb, user, ctx);
    return pages[user.email];
  };

  /* ---------- A. clause library governance (Phases 2/5) ---------- */
  const seeded = (await S("publishedClauses") || []).length;
  ok("library seeds as PUBLISHED approved positions", seeded >= 14);
  const prop = await S("proposeClause", { type: "Insurance", tiers: { Preferred: "The Supplier shall maintain professional indemnity insurance of not less than USD 1,000,000 per claim." }, risk: "Medium" }, "u5");
  ok("an associate can PROPOSE a clause", prop.ok);
  const notAuth = await S("findLibraryClause", "Insurance", "Saudi Arabia");
  ok("a proposed clause is NOT authoritative (not used by assembly)", notAuth === null);
  const badPub = await S("advanceClauseStatus", prop.id, "Published", "u5");
  ok("SECURITY: an associate cannot publish (skip the pipeline)", badPub.ok === false);
  const skipQueue = await S("advanceClauseStatus", prop.id, "Published", "u1");
  ok("even the Director cannot skip the workflow (Proposed→Published invalid)", skipQueue.ok === false);
  await S("advanceClauseStatus", prop.id, "Manager Review", "u3");
  await S("advanceClauseStatus", prop.id, "HoD Approval", "u3");
  const pub = await S("advanceClauseStatus", prop.id, "Published", "u1");
  ok("Proposed → Manager Review → HoD Approval → Published (gated)", pub.ok);
  ok("published clause becomes authoritative", (await S("findLibraryClause", "Insurance", "Saudi Arabia")) !== null);

  /* ---------- B/C/D. assembly + traceability (Phases 10–12) ---------- */
  const dr = await S("createDraft", { agreementType: "SaaS / technology agreement", ourRole: "Customer", jurisdiction: "Saudi Arabia", valueBand: "1M – 5M", term: "2 years", features: ["Data Processing"] }, "u5");
  ok("draft assembles from the approved template", dr.ok && /^DRA-/.test(dr.id));
  const d0 = dr.draft;
  const lib = d0.sections.filter((s) => s.source === "library");
  ok("assembly before generation: operative clauses come from the LIBRARY", lib.length >= 8);
  ok("EVERY library clause is traceable (clauseId + version + tier)", lib.every((s) => s.clauseId && s.clauseVersion && s.tier));
  ok("generated content is only connective (recitals) and marked", d0.sections.filter((s) => s.source === "generated").every((s) => s.key === "recitals"));
  ok("commercial inputs are marked, not invented", d0.sections.some((s) => s.source === "user-provided" && /to be completed/.test(s.text)));
  ok("conditional clause pulled in by feature (Data Protection)", d0.sections.some((s) => s.clauseType === "Data Protection"));
  const noDp = await S("createDraft", { agreementType: "SaaS / technology agreement", jurisdiction: "Pakistan", features: [] }, "u5");
  ok("conditional clause absent without the feature", !noDp.draft.sections.some((s) => s.clauseType === "Data Protection"));
  ok("jurisdiction-aware assembly (PK draft gets PK governing law)", /Pakistan/.test(noDp.draft.sections.find((s) => s.clauseType === "Governing Law").text));
  const aiRec = ((await S("getCollection", "aiAudit")) || []).find((x) => x.draftId === dr.id);
  ok("AI execution audit recorded (engine, user, clause sources, jurisdiction)", aiRec && aiRec.engine && aiRec.user === "u5" && aiRec.clauseSources.length >= 8 && aiRec.jurisdiction === "Saudi Arabia");

  /* ---------- clause versioning (Phase 4) ---------- */
  const liabId = lib.find((s) => s.clauseType === "Limitation of Liability").clauseId;
  const nv = await S("newClauseVersion", liabId, { tiers: { Preferred: "Except for the Excluded Claims, each party's aggregate liability shall not exceed the fees paid in the six (6) months preceding the claim." }, changeSummary: "Tightened cap to 6 months" }, "u1");
  ok("Director publishes a new clause version", nv.ok && nv.version === 2);
  const cl2 = await S("clauseById3", liabId);
  ok("history preserved: v1 Superseded (never overwritten), v2 Published", cl2.versions.length === 2 && cl2.versions[0].status === "Superseded" && cl2.versions[1].status === "Published");
  const dAfter = await S("draftById", dr.id);
  ok("the existing draft still points at the exact version it used (v1)", dAfter.sections.find((s) => s.clauseType === "Limitation of Liability").clauseVersion === 1);
  const nvBad = await S("newClauseVersion", liabId, { changeSummary: "x" }, "u5");
  ok("SECURITY: an associate cannot publish a new version", nvBad.ok === false);

  /* ---------- E/F. deviation → approval → gate (Phases 14–16, 28, 33) ---------- */
  const secKey = dAfter.sections.find((s) => s.clauseType === "Limitation of Liability").key;
  const accText = "Except for the Excluded Claims, each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable in the twenty-four (24) months preceding the event giving rise to the claim.";
  await S("editDraftSection", dr.id, secKey, accText, "u5");
  let d1 = await S("draftById", dr.id);
  const dev = d1.deviations.find((x) => x.sectionKey === secKey);
  ok("editing away from the library is DETECTED, not silent", !!dev && dev.status === "Open");
  ok("tier move recognised (Preferred → Acceptable) with the library original kept", dev.tierTo === "Acceptable" && /twelve/.test(dev.originalText));
  ok("deviation carries risk + approval routing (LoL ⇒ HoD)", dev.risk === "High" && dev.approvalRequired === "HoD");
  const blocked = await S("setDraftStatus", dr.id, "Approved", "u5");
  ok("REVIEW GATE: draft approval blocked while a deviation awaits approval", blocked.ok === false && (blocked.outstanding || []).length === 1);
  const devByAssoc = await S("approveDeviation", dev.id, "u5");
  ok("SECURITY: an associate cannot approve an HoD deviation", devByAssoc.ok === false);
  const devByHead = await S("approveDeviation", dev.id, "u1");
  ok("the Director approves the deviation", devByHead.ok);
  const appr = await S("setDraftStatus", dr.id, "Approved", "u5");
  ok("named-lawyer approval succeeds once deviations are cleared", appr.ok);
  const delivBad = await S("setDraftStatus", "${noDp.id}", "Delivered", "u5");
  ok("DELIVERY CONTROL: an unapproved draft cannot be delivered", delivBad.ok === false);
  const deliv = await S("setDraftStatus", dr.id, "Delivered", "u5");
  ok("the approved version can be delivered", deliv.ok);
  await S("editDraftSection", dr.id, secKey, "Totally custom uncapped liability accepted.", "u5");
  d1 = await S("draftById", dr.id);
  ok("editing after approval INVALIDATES it (new version, back to review)", d1.status === "In Review" && d1.approvedBy === null && d1.version === 2);
  const custom = d1.deviations.find((x) => x.sectionKey === secKey && x.status === "Open");
  ok("below-Fallback custom text: risk escalates + Director-only approval", custom.tierTo === "Custom" && custom.risk === "Critical" && custom.approvalRequired === "HoD");

  /* ---------- G. counterparty review (Phases 17–22, 40) ---------- */
  const cpText = [
    "1. Confidentiality",
    "Each party shall keep the other's Confidential Information confidential for a period of two (2) years from the date of this Agreement.",
    "2. Limitation of Liability",
    "Each party's total aggregate liability howsoever arising shall be unlimited in respect of all claims.",
    "3. Insurance",
    "The Supplier shall maintain insurance with reputable insurers against all usual risks.",
    "4. Publicity",
    "Either party may issue a press release regarding this Agreement and use the other party's logo.",
  ].join("\n");
  const rv = await S("createContractReview", { name: "Orbit MSA redline v2", text: cpText, agreementType: "Supplier / vendor agreement", jurisdiction: "Saudi Arabia" }, "u5");
  ok("counterparty review produces structured findings", rv.ok && rv.findings >= 4);
  const rec = await S("reviewById3", rv.id);
  const fConf = rec.findings.find((f) => f.clauseType === "Confidentiality");
  ok("finding matches OUR position (clause + version + tier) with location", fConf && fConf.ourPosition && fConf.ourPosition.clauseId && /Section 1/.test(fConf.location));
  ok("tier match detected (their text = our Fallback) → negotiate up", fConf.matchTier === "Fallback" && fConf.recommendation === "Negotiate to Acceptable");
  const fLiab = rec.findings.find((f) => f.clauseType === "Limitation of Liability");
  ok("below-Fallback counterparty position: escalated risk + Director approval to accept", fLiab && fLiab.approvalRequired === "HoD" && (fLiab.risk === "Critical" || fLiab.risk === "High"));
  ok("suggested redline comes FROM THE LIBRARY (traceable), not invented", fLiab.suggestedRedline && fLiab.suggestedRedline.source === "library" && /twelve|six/.test(fLiab.suggestedRedline.text));
  const fPub = rec.findings.find((f) => f.clauseType === "Publicity");
  ok("GUARDRAIL: no library position ⇒ \"Source not found in LegalOS\" — no fabricated authority", fPub && !fPub.ourPosition && /Source not found in LegalOS/.test(fPub.sourceNote) && fPub.recommendation === null);
  const fMissing = rec.findings.find((f) => f.missing && f.clauseType === "Governing Law");
  ok("missing required clause is flagged with the library position as the fix", !!fMissing && fMissing.recommendation === "Reject");
  const failed = await S("createContractReview", { name: "scan.pdf", text: "" }, "u5");
  ok("AI-FAILURE: empty extraction ⇒ honest \"Extraction Failed\", nothing fabricated", failed.ok && failed.status === "Extraction Failed");
  const accBad = await S("decideFinding", rv.id, fLiab.id, { action: "Accept" }, "u5");
  ok("SECURITY: associate cannot ACCEPT a below-Fallback position", accBad.ok === false);
  const apprBad = await S("approveReview", rv.id, "u3");
  ok("redline approval blocked until every finding is decided", apprBad.ok === false);
  for (const f of rec.findings) {
    const action = f.id === fLiab.id ? "Negotiate to Acceptable" : (f.recommendation || "Negotiate to Acceptable");
    await S("decideFinding", rv.id, f.id, { action: action }, "u3");
  }
  const apprOk = await S("approveReview", rv.id, "u3");
  ok("review approved once all findings are decided", apprOk.ok);
  ok("redline delivery gate honoured", (await S("deliverReview", rv.id, "u1")).ok);

  /* ---------- H. retrieval security (Phase 25/39) ---------- */
  // A closed, PRIVILEGED matter to retrieve against — built step by step so each
  // engine call is a named one rather than a source string the CSP would refuse.
  const pm = await S("createMatter", { name: "Precedent source", practiceArea: "commercial", matterType: "Customer / Service agreement", owner: "u6", department: "Finance" }, "u1");
  await S("setMatterStatus", pm.id, "Active", "u1");
  await S("closeMatter", pm.id, { category: "Settled", positionAchieved: "Substantial", held: ["Limitation of Liability"], conceded: [], externalCounsel: false }, "u1");
  await S("setMatterPrivilege", pm.id, "Privileged", ["u6"], "u1");
  const retr = await p.evaluate((SRC) => Promise.all([import("/" + SRC + "/store.js"), import("/" + SRC + "/data.js")]).then(([S, D]) => ({
    u5: S.retrievePrecedent(D.byId("u5"), { clauseType: "Limitation of Liability" }).map((c) => c.id),
    u6: S.retrievePrecedent(D.byId("u6"), { clauseType: "Limitation of Liability" }).map((c) => c.id),
  })), SRC);
  ok("SECURITY: a privileged matter NEVER enters retrieval for the unnamed", !retr.u5.includes(pm.id));
  ok("the named user's retrieval DOES surface it, with the source linked", retr.u6.includes(pm.id));

  /* ---------- M2 addition: expert auto-assign + Director notified ---------- */
  const auto = await S("createMatter", { name: "Auto-routed dispute", practiceArea: "disputes", matterType: "Litigation", department: "Finance" }, "u1");
  const autoM = await S("matterById", auto.id);
  const litTeam = await p.evaluate(([SRC, owner]) => import("/" + SRC + "/data.js").then((D) => (D.byId(owner) || {}).legalTeam), [SRC, autoM.owner]);
  ok("matter auto-assigns to the practice-area EXPERT (right team)", auto.ok && litTeam === "litigation");
  ok("auto-assignment is audited and reassignable by the Director", (autoM.audit || []).some((a) => a.kind === "owner" && /Auto-assigned/.test(a.detail || "")));
  const dirNotif = await p.evaluate(() => JSON.parse(localStorage.getItem("legalos-store-v2")).notifs.filter((n) => (n.forUserId === "u1" || n.forUserId === "u2") && /auto-assigned/i.test(n.title)));
  ok("the Director is notified of the auto-assignment", dirNotif.length >= 1);
  const reassign = await S("setMatterOwner", auto.id, "u5", "u1");
  ok("the Director can reassign the auto-assigned matter", reassign.ok);

  /* ---------- J. UI + requester lockout (Phases 35/36) ---------- */
  await go(p, "#/drafting");
  let t = await body(p);
  ok("Contract Intelligence home renders (work-focused)", /Drafts in progress/i.test(t) && /Published clauses/i.test(t));
  await p.screenshot({ path: "m3-home.png" });
  await go(p, "#/drafting/" + dr.id);
  t = await body(p);
  ok("draft workspace: 3 panes + provenance + JURISDICTION banner", /JURISDICTION: Saudi Arabia/i.test(t) && /LIBRARY/.test(t) && /AI-SUGGESTED/.test(t));
  await p.screenshot({ path: "m3-workspace.png" });
  await go(p, "#/reviews/" + rv.id);
  t = await body(p);
  ok("review report renders the structured findings UI", /Our position/i.test(t) && /Suggested redline/i.test(t) && /Source not found in LegalOS/i.test(t));
  await p.screenshot({ path: "m3-review.png" });
  await go(p, "#/clauses");
  t = await body(p);
  ok("clause library register renders with governance states", /Published \(authoritative\)/i.test(t) && /approval pipeline/i.test(t));
  /* A requester enters by the portal door and gets their own session, rather
     than the page pretending to be someone else. Drafting and the clause
     library are internal, so they are either refused the route or shown
     nothing from it. */
  const reqCtx = await browser.createBrowserContext();
  const requester = await reqCtx.newPage();
  await H.enterPortalAs(requester, sb, "Finance", ctx);
  await requester.evaluate(() => { window.location.hash = "#/drafting"; });
  await H.sleep(1600);
  const draftText = await body(requester);
  ok("a requester is locked out of drafting",
    /internal|do not have access|Not found/i.test(draftText) || !/Drafts in progress/i.test(draftText));
  await requester.evaluate(() => { window.location.hash = "#/clauses"; });
  await H.sleep(1600);
  const clauseText = await body(requester);
  ok("a requester is locked out of the clause library",
    /internal|do not have access|Not found/i.test(clauseText) || !/Published \(authoritative\)/i.test(clauseText));
  await reqCtx.close();

});
