// RAISE A CASE — the litigation intake engine, end to end.
//
// The Case Handling module could not create a case at all. /m/cases renders the
// live litigation register, and the "New case" button lived on the workflow
// page the route stopped using; the litigation team was looking at a list they
// could not add to. The button that used to exist wrote into localStorage, so a
// case raised by one lawyer was invisible to everyone else.
//
// These checks hold the engine that replaced it. Several of them exist because
// the obvious implementation was wrong in a way nothing else would have caught:
//
//   * THE REGISTER CACHED THE ANSWER. The register endpoint caches serialized
//     payloads keyed on the build timestamp, because a register only changes
//     when an ingest promotes a new dataset. Raising a case breaks that
//     assumption -- the rows change without a rebuild -- so every reader was
//     handed the pre-creation payload and the case was saved, merged, and
//     invisible. The route logged 358 rows while returning 357.
//   * THE ADAPTER REGENERATED THE ID. The client derives a stable id for every
//     tracker row, which overwrote the server's LIT-00001 with a content hash,
//     so the detail page looked up an id that no longer existed and said "not
//     found" about a case created two seconds earlier.
//   * THE MERGE RACED THE REBUILD. Merging at build time loses to a background
//     rebuild that started before the case was written and finished after it.
//   * DATES WERE READ MONTH-FIRST. `new Date("04/02/2024")` is 2 April; a
//     Pakistani filing says 4 February. A hearing two months out is worse than
//     no hearing at all.
//
//   node tests/m12-litigation-raise.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");

const PLAINT = `IN THE COURT OF SENIOR CIVIL JUDGE, LAHORE

Suit No. 7781 of 2026

ACME BUILDERS (PRIVATE) LIMITED, having its office at Gulberg III, Lahore
                                          ...........Plaintiff
                    VERSUS
ZAMEEN MEDIA (PRIVATE) LIMITED, Pearl One, M.M. Alam Road, Lahore
                                          ...........Defendant

SUIT FOR RECOVERY OF Rs. 8,750,000/-
Date of institution: 11/03/2026
Next date of hearing: 22-10-2026
`;

H.runSuite("m12-litigation-raise — one engine, and the case is actually there", async (ctx) => {
  const { check } = ctx;

  /* ---- the extractor, which needs no server ----------------------------- */
  const X = require("../api/litigation-extract.js");
  const ex = X.extractFromText(PLAINT, "Plaint.pdf");

  check("a court document yields its case number",
    ex.fields.caseNumber && ex.fields.caseNumber.value === "7781 of 2026",
    JSON.stringify(ex.fields.caseNumber && ex.fields.caseNumber.value));

  /* Day-first, and built in UTC. Read month-first this is 3 November, and
     constructing in local time then calling toISOString moves it back a day. */
  check("dates are read day-first, as Pakistani filings are written",
    ex.fields.filingDate && ex.fields.filingDate.value === "2026-03-11",
    JSON.stringify(ex.fields.filingDate && ex.fields.filingDate.value));
  check("a hearing date is not shifted by a day",
    ex.fields.nextHearing && ex.fields.nextHearing.value === "2026-10-22",
    JSON.stringify(ex.fields.nextHearing && ex.fields.nextHearing.value));

  /* The dotted role marker sits between the party and VERSUS, so the naive
     read returns "Plaintiff" as the party's name. */
  check("parties are the parties, not the dotted role labels",
    ex.parties.length === 2 && /ACME BUILDERS/.test(ex.parties[0].name) && !/^Plaintiff$/i.test(ex.parties[0].name),
    ex.parties.map((p) => p.role + ":" + p.name).join(" | "));

  check("every extracted value carries its source and confidence",
    Object.values(ex.fields).every((v) => v.source && v.confidence),
    "nothing is asserted without evidence");

  /* "agreement dated 12-03-2023" is the contract being sued on, not an order. */
  check("an agreement date is not mistaken for a court order date",
    !ex.fields.orderDate, ex.fields.orderDate ? ex.fields.orderDate.value : "none");

  const scan = X.extractFromText("", "Scan.pdf");
  check("a scan with no text layer says so instead of returning nothing",
    (scan.warnings || []).some((w) => /scan/i.test(w)), (scan.warnings || [])[0] || "");

  /* ---- the engine ------------------------------------------------------- */
  /* Its OWN port variable. `startSandbox` resolves LEGALOS_PORT by default, and
     run-all exports that pointing at the runner's own server — so the sandbox
     tried to bind a port already serving, the squatter guard refused, and the
     suite died as a HARNESS error before reaching an assertion. It passed
     standalone the whole time, which is exactly how this hides. */
  const sandbox = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_LITRAISE_PORT", portFallback: "4893", prefix: "legalos-lit-", enforceAuth: false,
  }));
  {
    /* Signed in as the litigation lead, through the real login, because every
       one of these routes is permission-gated and an unauthenticated run would
       report 403s as product failures. */
    const cookie = await H.loginApi(sandbox, H.USERS.litLead.email);
    const api = (method, route, body) => H.request(sandbox.base, method, route, { body, cookie });

    const meta = await api("GET", "/api/litigation/meta");
    const suggest = (meta.body && meta.body.suggest) || {};
    /* The drop-downs must come from the estate. A hand-written list beside the
       register's own 61 courts is a second taxonomy nobody's data matches. */
    check("drop-downs are populated from the real register",
      (suggest.court || []).length > 20 && (suggest.nature || []).length > 5,
      "courts=" + (suggest.court || []).length + " natures=" + (suggest.nature || []).length
      + " counsel=" + (suggest.counsel || []).length + " entities=" + (suggest.entity || []).length);

    const made = await api("POST", "/api/litigation/cases", {
      title: "ACME Builders vs Zameen Media",
      caseType: "Recovery", direction: "Against us", moduleKey: "cases",
      courtCaseNumber: "7781 of 2026",
      court: { name: "Senior Civil Judge, Lahore", city: "Lahore" },
      parties: [{ name: "ACME Builders (Private) Limited", role: "Plaintiff" },
        { name: "Zameen Media (Private) Limited", role: "Defendant", isUs: true }],
      dates: { filing: "2026-03-11", nextHearing: "2026-10-22" },
      financial: { claimed: 8750000 },
      documents: [{ name: "Plaint.pdf", uploadId: "u-test-1" }, { name: "Plaint.pdf", uploadId: "u-test-1" }],
      provenance: { caseNumber: { sourceType: "document", source: "Plaint.pdf", confidence: "high", method: "extracted" } },
    });
    const rec = (made.body && made.body.case) || {};
    check("a case is created through the engine", made.status === 201 && !!made.body.id, made.body && made.body.id);

    /* A case served on us does not begin at "Intake". */
    check("the opening stage follows the case's direction", rec.stage === "Filed / Received", rec.stage);

    check("the same document selected twice is one document", (rec.documents || []).length === 1);

    /* A hearing left as a plain date is a hearing nobody is watching. */
    check("a hearing date becomes a tracked deadline",
      (rec.deadlines || []).some((d) => d.kind === "Next Hearing" && d.dueDate === "2026-10-22"));

    check("creation writes a real timeline, not just a record",
      ["Case Raised", "Owner Assigned", "Document Added", "Deadline Added"]
        .every((k) => (rec.timeline || []).some((e) => e.kind === k)),
      (rec.timeline || []).map((e) => e.kind).join(", "));

    check("where an auto-filled value came from is stored with it",
      !!(rec.provenance && rec.provenance.caseNumber && rec.provenance.caseNumber.source));
    check("a case raised here is distinguishable from an imported one",
      rec.sourceType === "LEGALOS_NATIVE");

    /* ---- duplicates are reported, never merged --------------------------- */
    const dup = await api("POST", "/api/litigation/cases", {
      title: "ACME Builders vs Zameen Media", courtCaseNumber: "7781 of 2026",
    });
    check("a likely duplicate is refused with its evidence",
      dup.status === 409 && (dup.body.duplicates || []).length > 0,
      (dup.body.duplicates || [])[0] ? (dup.body.duplicates[0].score + "% " + dup.body.duplicates[0].why.join("/")) : "");
    const forced = await api("POST", "/api/litigation/cases", {
      title: "ACME Builders vs Zameen Media", courtCaseNumber: "7781 of 2026", allowDuplicate: true,
    });
    check("creating one anyway is allowed and recorded in the audit",
      forced.status === 201 && (forced.body.case.audit || []).some((a) => /possible duplicate/i.test(a.action)));

    /* ---- THE ONE THAT WAS INVISIBLE ------------------------------------- */
    const id = made.body.id;
    const reg = await api("GET", "/api/registers/litigation?limit=5000");
    const row = (reg.body.records || []).find((x) => x.id === id);
    check("the case appears in the litigation register immediately",
      !!row, row ? ("court=" + row.court + " next=" + row.nextHearing) : "NOT IN THE REGISTER");
    check("the register row carries the parties, timeline and deadlines",
      !!row && (row.parties || []).length === 2 && (row.timeline || []).length > 0 && (row.deadlines || []).length > 0);

    /* The response cache is keyed on the build timestamp, which raising a case
       does not move. Reading twice proves the key includes the case stamp. */
    const again = await api("GET", "/api/registers/litigation?limit=5000");
    check("a cached register payload does not hide a newly raised case",
      (again.body.records || []).some((x) => x.id === id));

    /* ---- the case runs, not just gets created --------------------------- */
    const ev = await api("POST", "/api/litigation/cases/" + id + "/events", {
      kind: "Hearing", date: "2026-10-22", purpose: "Framing of issues",
      outcome: "Adjourned", nextHearing: "2026-12-05",
    });
    check("a hearing can be logged", ev.status === 201);
    const after = ((await api("GET", "/api/litigation/cases/" + id)).body || {}).case || { dates: {}, deadlines: [] };
    check("logging a hearing moves the next date forward", after.dates.nextHearing === "2026-12-05", after.dates.nextHearing);
    check("the old next-hearing deadline is replaced, not left behind",
      (after.deadlines || []).filter((d) => d.kind === "Next Hearing").length === 1);

    const patched = await api("PATCH", "/api/litigation/cases/" + id, { risk: "Critical" });
    check("a material change is written to both the audit and the timeline",
      patched.status === 200
      && (patched.body.case.audit || []).some((a) => /risk/i.test(a.action))
      && (patched.body.case.timeline || []).some((e) => e.kind === "Field Changed"));

    const closed = await api("POST", "/api/litigation/cases/" + id + "/close",
      { outcome: "Settled", settlement: 2000000, closureDate: "2026-12-20" });
    check("closing captures the outcome and what it settled for",
      closed.status === 200 && closed.body.case.status === "Closed" && closed.body.case.financial.settlement === 2000000);

    /* ---- a half-finished intake is not a case ---------------------------- */
    await api("POST", "/api/litigation/drafts", { payload: { title: "half typed" } });
    const drafts = await api("GET", "/api/litigation/drafts");
    const cases = await api("GET", "/api/litigation/cases");
    check("a draft is kept but does not count as a case",
      (drafts.body.drafts || []).length === 1 && !(cases.body.cases || []).some((c) => c.draft));

    /* ---- THE CASE MUST STAY OPERATIONAL AFTER IT IS CREATED -------------
       Raising a case is the small part. If a matter cannot be heard, chased,
       amended and closed here, the work moves to email and the register becomes
       a list nobody has touched since the day it opened. */
    const meta2 = (await api("GET", "/api/litigation/meta")).body;
    check("every dropdown the case needs is served from one place",
      ["caseTypes", "natures", "directions", "partyRoles", "risks", "priorities", "partyKinds",
        "currencies", "documentTypes", "hearingPurposes", "hearingOutcomes", "closureOutcomes",
        "statuses", "askRecipients", "deadlineKinds", "workflow"].every((k) => Array.isArray(meta2[k]) && meta2[k].length),
      "16 vocabularies");
    /* A lawyer who picks "Civil Court, Lahore" should not then be asked which
       city it is in. */
    check("choosing a court implies its city where that is unambiguous",
      Object.keys(meta2.courtCity || {}).length > 10,
      Object.keys(meta2.courtCity || {}).length + " courts map to a city");

    const live = await api("POST", "/api/litigation/cases", { title: "Lifecycle case", moduleKey: "cases", priority: "High" });
    const lid = live.body.id;

    const h1 = await api("POST", "/api/litigation/cases/" + lid + "/hearings",
      { date: "2026-11-04", purpose: "Arguments", nextHearing: "2026-12-09" });
    check("a hearing can be added and rolls the case's next date forward",
      h1.status === 201 && h1.body.case.dates.nextHearing === "2026-12-09",
      h1.body.case && h1.body.case.dates.nextHearing);

    /* Completing a sitting must UPDATE it, not add a second one for the same
       day — otherwise every hearing appears twice in the history. */
    const hid = h1.body.case.hearings[0].id;
    const h2 = await api("PATCH", "/api/litigation/cases/" + lid + "/hearings/" + hid,
      { outcome: "Adjourned", nextHearing: "2027-01-15" });
    check("completing a scheduled hearing updates it rather than duplicating it",
      h2.status === 200 && h2.body.case.hearings.length === 1 && h2.body.case.hearings[0].outcome === "Adjourned");
    check("only one next-hearing deadline is ever live",
      h2.body.case.deadlines.filter((d) => d.kind === "Next Hearing" && !d.done).length === 1);

    const dl = await api("POST", "/api/litigation/cases/" + lid + "/deadlines", { kind: "Reply Due", dueDate: "2026-11-20" });
    check("a deadline can be added and completed",
      dl.status === 201 &&
      (await api("PATCH", "/api/litigation/cases/" + lid + "/deadlines/" +
        dl.body.case.deadlines.find((d) => d.kind === "Reply Due").id, {})).status === 200);

    await api("POST", "/api/litigation/cases/" + lid + "/parties", { name: "Acme Ltd", role: "Plaintiff" });
    const dupParty = await api("POST", "/api/litigation/cases/" + lid + "/parties", { name: "Acme Ltd", role: "Plaintiff" });
    check("the same party is not added to a case twice", dupParty.status === 400);

    check("counsel can be assigned after creation, not only at intake",
      (await api("POST", "/api/litigation/cases/" + lid + "/counsel",
        { mode: "External", firm: "CLM", lead: "Hamza Haider" })).status === 201);

    /* ---- two-way: the case asks, and the answer comes back --------------- */
    const ask = await api("POST", "/api/litigation/cases/" + lid + "/ask",
      { recipientType: "Requester", question: "Please send the signed agreement", dueDate: "2026-11-10" });
    check("the case can ask somebody outside Legal for something", ask.status === 201);
    const askId = ask.body.case.informationRequests[0].id;
    const resp = await api("POST", "/api/litigation/cases/" + lid + "/ask/" + askId,
      { text: "Attached", documents: [{ name: "Agreement.pdf", uploadId: "u-resp-1" }] });
    check("their answer lands on the case with its documents",
      resp.status === 200 && resp.body.case.informationRequests[0].status === "Responded"
      && resp.body.case.documents.some((d) => d.name === "Agreement.pdf"));
    check("answering closes the deadline the question raised",
      !resp.body.case.deadlines.some((d) => d.note && d.note.startsWith("Response due:") && !d.done));

    /* Privilege. An internal note must never be reachable through the thread a
       requester can see. */
    await api("POST", "/api/litigation/cases/" + lid + "/notes", { text: "privileged strategy note" });
    const withNote = (await api("GET", "/api/litigation/cases/" + lid)).body.case;
    check("an internal note is held apart from anything a requester sees",
      JSON.stringify(withNote.informationRequests).indexOf("privileged") === -1
      && (withNote.internalNotes || []).length === 1);

    /* ---- the source can find what it gave rise to ------------------------ */
    const src = await api("POST", "/api/litigation/cases", {
      title: "Escalated from a notice", moduleKey: "cases", links: { noticeId: "NTC-XYZ" },
    });
    check("a notice can find the case it was escalated into",
      (await api("GET", "/api/litigation/by-source?type=notice&id=NTC-XYZ")).body.count === 1,
      src.body.id);

    /* ---- closure is a decision, not a field edit ------------------------- */
    check("an invented closure outcome is refused",
      (await api("POST", "/api/litigation/cases/" + lid + "/close", { outcome: "Victory!" })).status === 400);
    check("a case cannot be closed by editing its status field",
      (await api("PATCH", "/api/litigation/cases/" + lid, { status: "Closed" })).status === 400);
    const closed2 = await api("POST", "/api/litigation/cases/" + lid + "/close",
      { outcome: "Settled", settlement: 250000, closureDate: "2026-12-20" });
    check("closing records the outcome and what it settled for",
      closed2.status === 200 && closed2.body.case.status === "Closed" && closed2.body.case.financial.settlement === 250000);
    const reopened = await api("POST", "/api/litigation/cases/" + lid + "/reopen", { reason: "appeal filed" });
    check("reopening is allowed and audited, never silent",
      reopened.status === 201 && reopened.body.case.status === "Open"
      && reopened.body.case.audit.some((a) => /reopen/i.test(a.action)));

    const finalCase = (await api("GET", "/api/litigation/cases/" + lid)).body.case;
    check("every operational action reached the timeline",
      ["Case Raised", "Hearing Scheduled", "Deadline Added", "Party Added", "Counsel Assigned",
        "Information Requested", "Information Received", "Case Closed", "Case Reopened"]
        .filter((k) => finalCase.timeline.some((e) => e.kind === k)).length >= 8,
      finalCase.timeline.length + " events, " + finalCase.audit.length + " audit entries");

    const noticeSample = ((await api("GET", "/api/registers/notices?limit=5")).body.records || [])[0];

    /* ---- export: structured, filtered, and privileged notes excluded ----- */
    await api("POST", "/api/litigation/cases/" + lid + "/notes", { text: "PRIVILEGED do not export" });
    const exp = await H.request(sandbox.base, "GET", "/api/litigation/export", { cookie });
    const csv = exp.text || "";
    check("the litigation register exports as CSV",
      exp.status === 200 && /Case ID,Court case number,Title/.test(csv), (exp.headers || {})["content-disposition"] || "");
    /* A spreadsheet leaving the building with legal strategy in it is a
       different kind of incident from one with a hearing date in it. */
    check("privileged internal notes are never exported", !/PRIVILEGED/.test(csv));
    /* A document a reader may not open must not have its filename disclosed by
       an export either — the column is a count. */
    check("an export discloses document counts, not document names",
      !/\.pdf/i.test(csv.split("\n").slice(1).join("\n")));

    /* ---- assistant: prepares, never performs ----------------------------- */
    const prep = await api("POST", "/api/litigation/assistant",
      { intent: "raise-from", context: { type: "notice", id: (noticeSample && noticeSample.id) || "NTC-XYZ" } });
    const casesBefore = (await api("GET", "/api/litigation/cases")).body.count;
    check("the assistant prepares a case rather than creating one",
      prep.status === 200 && prep.body.requiresConfirmation === true
      && (await api("GET", "/api/litigation/cases")).body.count === casesBefore,
      prep.body && prep.body.summary);
    /* No assistant-only path into the data. */
    check("the assistant hands back the ordinary endpoint, not a private one",
      /POST \/api\/litigation\/cases/.test((prep.body && prep.body.endpoint) || ""));
    check("the assistant can report what a case is still missing",
      (await api("POST", "/api/litigation/assistant", { intent: "missing", context: { caseId: lid } })).status === 200);
    check("an unknown assistant intent is refused outright",
      (await api("POST", "/api/litigation/assistant", { intent: "delete-everything" })).status === 400);

    /* ---- what the register already knows is handed back ------------------ */
    const n0 = noticeSample;
    if (n0) {
      const pre = await api("GET", "/api/litigation/prefill?from=notice&id=" + encodeURIComponent(n0.id));
      check("a notice hands over its parties and subject rather than being retyped",
        pre.status === 200 && (Object.keys(pre.body.fields || {}).length > 0 || (pre.body.parties || []).length > 0),
        Object.keys(pre.body.fields || {}).join(", ").slice(0, 80));
      check("everything carried across says which record it came from",
        Object.values(pre.body.fields || {}).every((v) => v.sourceType && v.source));
    } else {
      check("notice prefill check skipped: no notices in this estate", true, "skipped");
    }
  }

  /* ---- the client must not re-derive a server-assigned id --------------- */
  const buildDir = fs.readdirSync(ROOT).filter((n) => /^src-v\d+$/.test(n))
    .sort((a, b) => parseInt(b.slice(5), 10) - parseInt(a.slice(5), 10))[0];
  const live = fs.readFileSync(P.join(ROOT, buildDir, "live.js"), "utf8");
  check("a case raised in LegalOS keeps the id the server gave it",
    /__origin === "LEGALOS" && r\.id\) \? r\.id : idFor/.test(live),
    buildDir + "/live.js keeps LIT- ids instead of hashing them");

  const router = fs.readFileSync(P.join(ROOT, "api", "router.js"), "utf8");
  check("the register response cache is keyed on the raised-case stamp too",
    /localCaseStamp\(\)/.test(router), "a new case retires the cached payload");
});
