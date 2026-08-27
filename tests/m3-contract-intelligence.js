// MODULE 3 — Contract Intelligence: full end-to-end QA (PRD Phases 39–43),
// plus the Module 2 expert auto-assignment addition. Engine assertions run
// through the SAME live ES modules the app ships (dynamic import in-page).
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";  // Windows dev default
const BASE = `http://localhost:${process.env.LEGALOS_PORT || "4600"}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const errs = [];
const ok = (n, c) => { results.push(!!c); console.log((c ? "PASS " : "FAIL ") + n); };
const body = (p) => p.evaluate(() => document.body.innerText);
async function viewAs(p, uid) { await p.evaluate((uid) => { const k = "legalos-store-v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.session = s.session || {}; s.session.viewAsId = uid; localStorage.setItem(k, JSON.stringify(s)); }, uid); }
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.reload({ waitUntil: "networkidle2" }); await wait(1100); }
const S = (p, fn, ...args) => p.evaluate(new Function("...args", `return import("/src-v8/store.js").then((S) => (${fn})(S, ...args));`), ...args);

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 }); await wait(600);
  await p.evaluate(() => localStorage.removeItem("legalos-store-v1"));
  await p.reload({ waitUntil: "networkidle2" }); await wait(600);
  await viewAs(p, "u1"); await go(p, "#/drafting");

  /* ---------- A. clause library governance (Phases 2/5) ---------- */
  const seeded = await S(p, `(S) => S.publishedClauses().length`);
  ok("library seeds as PUBLISHED approved positions", seeded >= 14);
  const prop = await S(p, `(S) => S.proposeClause({ type: "Insurance", tiers: { Preferred: "The Supplier shall maintain professional indemnity insurance of not less than USD 1,000,000 per claim." }, risk: "Medium" }, "u5")`);
  ok("an associate can PROPOSE a clause", prop.ok);
  const notAuth = await S(p, `(S) => S.findLibraryClause("Insurance", "Saudi Arabia")`);
  ok("a proposed clause is NOT authoritative (not used by assembly)", notAuth === null);
  const badPub = await S(p, `(S, id) => S.advanceClauseStatus(id, "Published", "u5")`, prop.id);
  ok("SECURITY: an associate cannot publish (skip the pipeline)", badPub.ok === false);
  const skipQueue = await S(p, `(S, id) => S.advanceClauseStatus(id, "Published", "u1")`, prop.id);
  ok("even the Director cannot skip the workflow (Proposed→Published invalid)", skipQueue.ok === false);
  await S(p, `(S, id) => S.advanceClauseStatus(id, "Manager Review", "u3")`, prop.id);
  await S(p, `(S, id) => S.advanceClauseStatus(id, "HoD Approval", "u3")`, prop.id);
  const pub = await S(p, `(S, id) => S.advanceClauseStatus(id, "Published", "u1")`, prop.id);
  ok("Proposed → Manager Review → HoD Approval → Published (gated)", pub.ok);
  ok("published clause becomes authoritative", (await S(p, `(S) => S.findLibraryClause("Insurance", "Saudi Arabia")`)) !== null);

  /* ---------- B/C/D. assembly + traceability (Phases 10–12) ---------- */
  const dr = await S(p, `(S) => S.createDraft({ agreementType: "SaaS / technology agreement", ourRole: "Customer", jurisdiction: "Saudi Arabia", valueBand: "1M – 5M", term: "2 years", features: ["Data Processing"] }, "u5")`);
  ok("draft assembles from the approved template", dr.ok && /^DRA-/.test(dr.id));
  const d0 = dr.draft;
  const lib = d0.sections.filter((s) => s.source === "library");
  ok("assembly before generation: operative clauses come from the LIBRARY", lib.length >= 8);
  ok("EVERY library clause is traceable (clauseId + version + tier)", lib.every((s) => s.clauseId && s.clauseVersion && s.tier));
  ok("generated content is only connective (recitals) and marked", d0.sections.filter((s) => s.source === "generated").every((s) => s.key === "recitals"));
  ok("commercial inputs are marked, not invented", d0.sections.some((s) => s.source === "user-provided" && /to be completed/.test(s.text)));
  ok("conditional clause pulled in by feature (Data Protection)", d0.sections.some((s) => s.clauseType === "Data Protection"));
  const noDp = await S(p, `(S) => S.createDraft({ agreementType: "SaaS / technology agreement", jurisdiction: "Pakistan", features: [] }, "u5")`);
  ok("conditional clause absent without the feature", !noDp.draft.sections.some((s) => s.clauseType === "Data Protection"));
  ok("jurisdiction-aware assembly (PK draft gets PK governing law)", /Pakistan/.test(noDp.draft.sections.find((s) => s.clauseType === "Governing Law").text));
  const aiRec = await S(p, `(S, id) => (S.getCollection("aiAudit") || []).find((x) => x.draftId === id)`, dr.id);
  ok("AI execution audit recorded (engine, user, clause sources, jurisdiction)", aiRec && aiRec.engine && aiRec.user === "u5" && aiRec.clauseSources.length >= 8 && aiRec.jurisdiction === "Saudi Arabia");

  /* ---------- clause versioning (Phase 4) ---------- */
  const liabId = lib.find((s) => s.clauseType === "Limitation of Liability").clauseId;
  const nv = await S(p, `(S, id) => S.newClauseVersion(id, { tiers: { Preferred: "Except for the Excluded Claims, each party's aggregate liability shall not exceed the fees paid in the six (6) months preceding the claim." }, changeSummary: "Tightened cap to 6 months" }, "u1")`, liabId);
  ok("Director publishes a new clause version", nv.ok && nv.version === 2);
  const cl2 = await S(p, `(S, id) => S.clauseById3(id)`, liabId);
  ok("history preserved: v1 Superseded (never overwritten), v2 Published", cl2.versions.length === 2 && cl2.versions[0].status === "Superseded" && cl2.versions[1].status === "Published");
  const dAfter = await S(p, `(S, id) => S.draftById(id)`, dr.id);
  ok("the existing draft still points at the exact version it used (v1)", dAfter.sections.find((s) => s.clauseType === "Limitation of Liability").clauseVersion === 1);
  const nvBad = await S(p, `(S, id) => S.newClauseVersion(id, { changeSummary: "x" }, "u5")`, liabId);
  ok("SECURITY: an associate cannot publish a new version", nvBad.ok === false);

  /* ---------- E/F. deviation → approval → gate (Phases 14–16, 28, 33) ---------- */
  const secKey = dAfter.sections.find((s) => s.clauseType === "Limitation of Liability").key;
  const accText = "Except for the Excluded Claims, each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable in the twenty-four (24) months preceding the event giving rise to the claim.";
  await S(p, `(S, id, k, t) => S.editDraftSection(id, k, t, "u5")`, dr.id, secKey, accText);
  let d1 = await S(p, `(S, id) => S.draftById(id)`, dr.id);
  const dev = d1.deviations.find((x) => x.sectionKey === secKey);
  ok("editing away from the library is DETECTED, not silent", !!dev && dev.status === "Open");
  ok("tier move recognised (Preferred → Acceptable) with the library original kept", dev.tierTo === "Acceptable" && /twelve/.test(dev.originalText));
  ok("deviation carries risk + approval routing (LoL ⇒ HoD)", dev.risk === "High" && dev.approvalRequired === "HoD");
  const blocked = await S(p, `(S, id) => S.setDraftStatus(id, "Approved", "u5")`, dr.id);
  ok("REVIEW GATE: draft approval blocked while a deviation awaits approval", blocked.ok === false && (blocked.outstanding || []).length === 1);
  const devByAssoc = await S(p, `(S, id) => S.approveDeviation(id, "u5")`, dev.id);
  ok("SECURITY: an associate cannot approve an HoD deviation", devByAssoc.ok === false);
  const devByHead = await S(p, `(S, id) => S.approveDeviation(id, "u1")`, dev.id);
  ok("the Director approves the deviation", devByHead.ok);
  const appr = await S(p, `(S, id) => S.setDraftStatus(id, "Approved", "u5")`, dr.id);
  ok("named-lawyer approval succeeds once deviations are cleared", appr.ok);
  const delivBad = await S(p, `(S) => S.setDraftStatus("${noDp.id}", "Delivered", "u5")`);
  ok("DELIVERY CONTROL: an unapproved draft cannot be delivered", delivBad.ok === false);
  const deliv = await S(p, `(S, id) => S.setDraftStatus(id, "Delivered", "u5")`, dr.id);
  ok("the approved version can be delivered", deliv.ok);
  await S(p, `(S, id, k) => S.editDraftSection(id, k, "Totally custom uncapped liability accepted.", "u5")`, dr.id, secKey);
  d1 = await S(p, `(S, id) => S.draftById(id)`, dr.id);
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
  const rv = await S(p, `(S, t) => S.createContractReview({ name: "Orbit MSA redline v2", text: t, agreementType: "Supplier / vendor agreement", jurisdiction: "Saudi Arabia" }, "u5")`, cpText);
  ok("counterparty review produces structured findings", rv.ok && rv.findings >= 4);
  const rec = await S(p, `(S, id) => S.reviewById3(id)`, rv.id);
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
  const failed = await S(p, `(S) => S.createContractReview({ name: "scan.pdf", text: "" }, "u5")`);
  ok("AI-FAILURE: empty extraction ⇒ honest \"Extraction Failed\", nothing fabricated", failed.ok && failed.status === "Extraction Failed");
  const accBad = await S(p, `(S, id, f) => S.decideFinding(id, f, { action: "Accept" }, "u5")`, rv.id, fLiab.id);
  ok("SECURITY: associate cannot ACCEPT a below-Fallback position", accBad.ok === false);
  const apprBad = await S(p, `(S, id) => S.approveReview(id, "u3")`, rv.id);
  ok("redline approval blocked until every finding is decided", apprBad.ok === false);
  for (const f of rec.findings) {
    const action = f.id === fLiab.id ? "Negotiate to Acceptable" : (f.recommendation || "Negotiate to Acceptable");
    await S(p, `(S, id, fid, a) => S.decideFinding(id, fid, { action: a }, "u3")`, rv.id, f.id, action);
  }
  const apprOk = await S(p, `(S, id) => S.approveReview(id, "u3")`, rv.id);
  ok("review approved once all findings are decided", apprOk.ok);
  ok("redline delivery gate honoured", (await S(p, `(S, id) => S.deliverReview(id, "u1")`, rv.id)).ok);

  /* ---------- H. retrieval security (Phase 25/39) ---------- */
  await S(p, `(S) => { const m = S.createMatter({ name: "Precedent source", practiceArea: "commercial", matterType: "Customer / Service agreement", owner: "u6", department: "Finance" }, "u1"); S.setMatterStatus(m.id, "Active", "u1"); S.closeMatter(m.id, { category: "Settled", positionAchieved: "Substantial", held: ["Limitation of Liability"], conceded: [], externalCounsel: false }, "u1"); S.setMatterPrivilege(m.id, "Privileged", ["u6"], "u1"); window.__pm = m.id; }`);
  const retr = await p.evaluate(() => Promise.all([import("/src-v8/store.js"), import("/src-v8/data.js")]).then(([S, D]) => ({
    u5: S.retrievePrecedent(D.byId("u5"), { clauseType: "Limitation of Liability" }).map((c) => c.id),
    u6: S.retrievePrecedent(D.byId("u6"), { clauseType: "Limitation of Liability" }).map((c) => c.id),
  })));
  ok("SECURITY: a privileged matter NEVER enters retrieval for the unnamed", !retr.u5.includes(await p.evaluate(() => window.__pm)));
  ok("the named user's retrieval DOES surface it, with the source linked", retr.u6.includes(await p.evaluate(() => window.__pm)));

  /* ---------- M2 addition: expert auto-assign + Director notified ---------- */
  await S(p, `(S) => { S.getCollection && null; }`);
  const auto = await S(p, `(S) => S.createMatter({ name: "Auto-routed dispute", practiceArea: "disputes", matterType: "Litigation", department: "Finance" }, "u1")`);
  const autoM = await S(p, `(S, id) => S.matterById(id)`, auto.id);
  const litTeam = await p.evaluate((owner) => import("/src-v8/data.js").then((D) => (D.byId(owner) || {}).legalTeam), autoM.owner);
  ok("matter auto-assigns to the practice-area EXPERT (right team)", auto.ok && litTeam === "litigation");
  ok("auto-assignment is audited and reassignable by the Director", (autoM.audit || []).some((a) => a.kind === "owner" && /Auto-assigned/.test(a.detail || "")));
  const dirNotif = await p.evaluate(() => JSON.parse(localStorage.getItem("legalos-store-v1")).notifs.filter((n) => (n.forUserId === "u1" || n.forUserId === "u2") && /auto-assigned/i.test(n.title)));
  ok("the Director is notified of the auto-assignment", dirNotif.length >= 1);
  const reassign = await S(p, `(S, id) => S.setMatterOwner(id, "u5", "u1")`, auto.id);
  ok("the Director can reassign the auto-assigned matter", reassign.ok);

  /* ---------- J. UI + requester lockout (Phases 35/36) ---------- */
  await viewAs(p, "u1"); await go(p, "#/drafting");
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
  await viewAs(p, "u16"); await go(p, "#/drafting");
  ok("REQUESTER lockout: drafting is internal", /internal/i.test(await body(p)));
  await go(p, "#/clauses");
  ok("REQUESTER lockout: clause library is internal", /internal/i.test(await body(p)));

  console.log("console errors:", errs.length, errs.slice(0, 8).join(" | "));
  const pass = results.filter(Boolean).length;
  console.log(`\n==== ${pass}/${results.length} Module 3 checks passed ====`);
  await b.close();
  process.exit(pass === results.length && errs.length === 0 ? 0 : 2);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
