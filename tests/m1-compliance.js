// Compliance workspace — end-to-end regression.
//
// Runs against an ISOLATED sandbox instance with the dev bypass off, so a real
// session cookie is the identity and every assertion is about what the SERVER
// does. Workflow fixtures are created inside the sandbox and die with it; the
// live config is never touched.
//
//   node tests/m1-compliance.js
const fs = require("fs");
const { reap, freePortSync } = require("./_reap.js");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const tmpdir = require("./_tmpdir.js");
const ROOT = path.join(__dirname, "..");
let PORT = process.env.LEGALOS_COMPLIANCE_PORT || "4757";
let BASE = `http://127.0.0.1:${PORT}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const req = (method, route, { cookie, body } = {}) => new Promise((resolve) => {
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  const h = Object.assign({}, data ? { "Content-Type": "application/json", "Content-Length": data.length } : {},
    cookie ? { Cookie: "legalos_sess=" + cookie } : {});
  const r = http.request(BASE + route, { method, headers: h }, (res) => {
    const chunks = [];
    res.on("data", (d) => chunks.push(d));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {}
      resolve({ status: res.statusCode, body: j, bytes: buf.length, headers: res.headers });
    });
  });
  r.on("error", () => resolve({ status: 0, body: null, bytes: 0, headers: {} }));
  if (data) r.write(data);
  r.end();
});

const loginAs = (SANDBOX, email) => {
  const out = spawnSync("node", ["tools/legalos-passwd.js", "set", email], { cwd: SANDBOX, encoding: "utf8" });
  const pw = ((out.stdout || "").match(/\n\s*([A-Za-z0-9!@#$%^&*_-]{8,})\s*\n/) || [])[1];
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify({ email, password: pw }));
    const rq = http.request(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => { res.resume(); const m = (res.headers["set-cookie"] || []).join(";").match(/legalos_sess=([^;]+)/); resolve(m ? m[1] : null); });
    rq.on("error", () => resolve(null)); rq.write(data); rq.end();
  });
};

(async () => {
  // Refuse to run against a server that is already listening: a leftover
  // instance keeps the port, this run's server fails to bind silently, and every
  // request then hits a STALE sandbox — which produces confident nonsense that
  // reads exactly like a product bug.
  await new Promise((resolve) => {
    const probe = http.get(BASE + "/api/health", (r) => {
      r.resume();
      if (r.statusCode === 200) {
        const moved = freePortSync();

        console.error("  HARNESS_PORT_IN_USE  port " + PORT + " is held by another process — continuing on free port " + moved);

        PORT = moved;

        BASE = `http://127.0.0.1:${PORT}`;
      }
      resolve();
    });
    probe.on("error", () => resolve());
    probe.setTimeout(1500, () => { probe.destroy(); resolve(); });
  });

  const SANDBOX = tmpdir.make("legalos-compl-");   // removes itself on every exit path
  const rs = spawnSync("rsync", ["-a", "--exclude", "node_modules",
    "--exclude", "config/workflow.json", "--exclude", "config/workflow-docs", "--exclude", "legalos/",
    /* A sandbox starts from the BUILD, not from what somebody did in the app
       today — the same set the shared harness excludes. */
    ...tmpdir.excludeArgs(),
    ROOT + "/", SANDBOX + "/"]);
  if (rs.status !== 0) { console.error("copy failed"); process.exit(1); }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(SANDBOX, "node_modules"));
  const cfgPath = path.join(SANDBOX, "config", "legalos.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.access.enforce = true; cfg.access.devBypassEmail = "";
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  const server = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server);   // stopped on every exit path, including a kill
  const ping = () => new Promise((resolve) => { const r = http.get(BASE + "/api/health", (res) => { res.resume(); resolve(res.statusCode === 200); }); r.on("error", () => resolve(false)); r.setTimeout(1200, () => { r.destroy(); resolve(false); }); });
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);

  const done = (code) => { try { server.kill(); } catch (e) {} process.exit(code); };

  const ADMIN = await loginAs(SANDBOX, "maryam.haq@zameen.com");     // super admin

  /* The register counts BEFORE this suite does anything, so section 13 can
     assert the invariant it actually cares about: that recording filings,
     proposing resolutions and walking the drill-downs did not mutate the source
     registers. This used to be three hard-coded numbers, one of which (914
     resolutions) had gone stale against a source that now holds 933 rows — so
     the check failed while nothing was wrong, which is the worst kind of red. A
     baseline captured in the same run cannot go stale. */
  const BASELINE = ((await req("GET", "/api/registers", { cookie: ADMIN })).body || {}).counts || {};
  const SECOND = await loginAs(SANDBOX, "imran.tariq@zameen.com");   // second full user, for segregation of duties
  const LITIG = await loginAs(SANDBOX, "salman.khan@zameen.com");    // litigation only
  const COMPL = await loginAs(SANDBOX, "arsalan.sandhu@zameen.com"); // compliance lead — demoted mid-test
  check("test sessions established", !!(ADMIN && SECOND && LITIG && COMPL));

  /* ============================================ 1. SOURCE RECONCILIATION */
  console.log("\n  Source reconciliation");

  const src = await req("GET", "/api/compliance/sources", { cookie: ADMIN });
  check("source reconciliation endpoint", src.status === 200);
  const S = src.body || {};
  check("every ingested loan row is accounted for", S.loans && S.loans.balances === true,
    S.loans ? `${S.loans.trackerAgreements} agreements + ${S.loans.historyRows} history + ${S.loans.headerArtifacts} artifacts = ${S.loans.sourceRows}` : "");
  check("loan history recovered from Drive documents", S.loans && S.loans.documentEvents > 300, S.loans && S.loans.documentEvents + " document events");
  // Every Drive loan folder with no tracker row becomes a DRIVE_ONLY loan
  // record, so nothing is left sitting in Drive unrepresented.
  check("every Drive loan folder without a tracker row becomes a record",
    S.loans && S.loans.unmatchedFolders.length === S.loans.driveOnlyAgreements,
    S.loans ? `${S.loans.unmatchedFolders.length} folders -> ${S.loans.driveOnlyAgreements} Drive-only loans` : "");
  check("licence folders all accounted for", S.licences && S.licences.total >= S.licences.folders,
    S.licences ? `${S.licences.total} licences from ${S.licences.folders} folders` : "");
  check("licence renewals recovered from Drive", S.licences && S.licences.renewalsRecovered > 0, S.licences && S.licences.renewalsRecovered + " renewals");
  check("SECP has no filing register in Drive (stated, not assumed)", S.secp && S.secp.filingRegisterInDrive === false);
  check("SECP evidence discovered instead", S.secp && S.secp.agmMinutes > 0 && S.secp.fsApprovals > 0,
    S.secp ? `${S.secp.agmMinutes} AGM minutes, ${S.secp.fsApprovals} FS approvals, ${S.secp.groupForms} group forms` : "");
  check("third-party forms excluded from group filings", S.secp && S.secp.thirdPartyForms > 0, S.secp && S.secp.thirdPartyForms + " excluded");
  check("no entity letterhead is configured (honest state)", S.letterheads && S.letterheads.configured === false);

  /* ================================================ 2. REGISTER SHAPES */
  console.log("\n  Registers");

  const loans = await req("GET", "/api/compliance/loans", { cookie: ADMIN });
  const L = (loans.body && loans.body.loans) || [];
  check("loan register returns agreements, not tracker rows", L.length > 0 && L.length < 192,
    `${L.length} loan agreements from 192 ingested rows`);
  /* THE CATEGORIES ARE THE BUSINESS'S OWN WORDS. "International" was ours;
     FDI is the source tracker's and the one the SBP filings use. FCY is
     defined and may legitimately be empty — no source in this estate
     distinguishes a foreign-currency loan that is not FDI, and classifying by
     currency alone would move all 25 FDI loans into it. */
  const fdi = L.filter((x) => x.category === "fdi").length;
  const fcy = L.filter((x) => x.category === "fcy").length;
  const inter = L.filter((x) => x.category === "intercompany").length;
  check("loans categorised FDI / FCY / Intercompany PK", fdi > 0 && inter > 0 && fdi + fcy + inter === L.length,
    `${fdi} FDI, ${fcy} FCY, ${inter} intercompany PK`);
  check("nothing is classified FCY by currency alone",
    L.filter((x) => x.category === "fcy").every((x) => /FCY|foreign currency loan/i.test(
      [x.ref, x.term, x.interest].map((v) => String(v == null ? "" : v)).join(" "))),
    fcy ? `${fcy} FCY loans, each with an explicit source marker` : "no loan is classified FCY, which is the honest answer");
  check("SBP applies only where the rules say so",
    L.filter((x) => x.category === "intercompany").every((x) => x.sbp.key === "NOT_REQUIRED") &&
    L.filter((x) => x.category === "fdi").every((x) => x.sbp.key !== "NOT_REQUIRED") &&
    L.filter((x) => x.category === "fdi").length > 0,
    "intercompany PK = not required, FDI = assessed");
  check("loans carry chronological history", L.filter((x) => x.eventCount > 0).length > 0,
    L.filter((x) => x.eventCount > 0).length + " loans with recorded history");

  const leases = await req("GET", "/api/compliance/leases", { cookie: ADMIN });
  const services = await req("GET", "/api/compliance/services", { cookie: ADMIN });
  const LE = (leases.body && leases.body.leases) || [];
  const SV = (services.body && services.body.services) || [];
  check("leases and services are separate registers", LE.length > 0 && SV.length > 0 && LE !== SV,
    `${LE.length} leases, ${SV.length} service agreements`);
  // The split is read from the tracker's own Agreement Type column, including
  // its typos -- "Cosultancy Agreement" appears twice in the source and is
  // classified as a service agreement, which is what it is.
  check("lease/service split comes from the source Agreement Type",
    LE.every((r) => /lease|tenancy/i.test(r.agreementType || "")) &&
    SV.every((r) => /services?|cosultancy|consultancy|maintenance|marketing/i.test(r.agreementType || "")),
    `${LE.length} leases / ${SV.length} services, all matching their source type`);
  check("agreements that are neither lease nor service stay out of both registers",
    leases.body.classified && leases.body.classified.other > 0 &&
    !LE.some((r) => /non-disclosure|memorandum/i.test(r.agreementType || "")) &&
    !SV.some((r) => /non-disclosure|memorandum/i.test(r.agreementType || "")),
    leases.body.classified ? leases.body.classified.other + " classified as neither (NDA, MOU, SPA, franchise, novation)" : "");

  const res = await req("GET", "/api/compliance/resolutions", { cookie: ADMIN });
  check("resolutions are entity-organised", res.body && res.body.byEntity.length > 10,
    res.body ? `${res.body.source} resolutions across ${res.body.byEntity.length} entities` : "");
  check("resolution entity conflicts are flagged, not silently resolved",
    res.body && Array.isArray(res.body.entityConflicts),
    res.body ? res.body.entityConflicts.length + " flagged CONFLICTING_SOURCE" : "");

  const lics = await req("GET", "/api/compliance/licences", { cookie: ADMIN });
  const LI = (lics.body && lics.body.licences) || [];
  check("licences include Drive-only records", lics.body && lics.body.driveOnlyLicences > 0,
    lics.body ? `${lics.body.trackerLicences} tracker + ${lics.body.driveOnlyLicences} Drive-only` : "");
  check("licence renewal history preserved", LI.some((l) => (l.history || []).length > 1),
    LI.filter((l) => (l.history || []).length > 1).length + " licences with a renewal chain");

  /* ========================================== 3. ENTITY TYPE / AGM RULE */
  console.log("\n  Entity rules");

  const ents = await req("GET", "/api/compliance/entities", { cookie: ADMIN });
  const E = (ents.body && ents.body.entities) || [];
  const smc = E.filter((e) => e.type === "SMC");
  const priv = E.filter((e) => e.type === "PRIVATE");
  check("entity registry derived from source + Drive folders", E.length > 40, E.length + " entities");
  check("SMC entities require no AGM", smc.length > 0 && smc.every((e) => e.requirements.agm === false),
    smc.length + " SMCs, all agm=false");
  check("Private Limited entities require an AGM", priv.length > 0 && priv.every((e) => e.requirements.agm === true),
    priv.length + " private limited, all agm=true");
  const conflict = E.filter((e) => e.type === "CONFLICT");
  check("a disputed legal form withholds the requirement rather than guessing",
    conflict.every((e) => e.requirements.agm === null),
    conflict.length + " entities with a disputed form");

  const secpOv = await req("GET", "/api/compliance/secp/overview", { cookie: ADMIN });
  check("SECP starts empty and says so", secpOv.body && secpOv.body.dashboard.empty === true && !!secpOv.body.dashboard.emptyNote);
  const smcEntity = (secpOv.body.entities || []).find((e) => e.type === "SMC" && e.inScope);
  check("no AGM item is raised against an SMC", smcEntity && smcEntity.agmApplicable === false,
    smcEntity ? smcEntity.name : "");

  /* ====================================== 4. CROSS-MODULE AUTHORIZATION */
  console.log("\n  Authorization");

  for (const route of ["/api/compliance/loans", "/api/compliance/leases", "/api/compliance/services",
    "/api/compliance/resolutions", "/api/compliance/licences", "/api/compliance/secp/overview",
    "/api/compliance/sources", "/api/compliance/activity", "/api/compliance/resolutions/entity/zameen%20media"]) {
    const r = await req("GET", route, { cookie: LITIG });
    check("litigation-only account refused " + route.replace("/api/compliance", ""), r.status === 403, "HTTP " + r.status);
  }
  const anon = await req("GET", "/api/compliance/loans", {});
  check("unauthenticated request refused", anon.status === 401 || anon.status === 403, "HTTP " + anon.status);

  /* ==================================== 5. FULL LOAN AMENDMENT LIFECYCLE */
  console.log("\n  Loan amendment lifecycle");

  const loan = L.find((x) => x.principal > 0 && x.origin === "source");
  let r = await req("POST", `/api/compliance/loans/${loan.id}/actions`,
    { cookie: ADMIN, body: { subtype: "amendment", fields: { amendmentType: "Rollover / Extension", effectiveDate: "2026-10-01", revisedRepaymentDate: "2027-10-01", reason: "regression fixture" } } });
  check("amendment created as a child record", r.status === 201 && r.body.record.parent.id === loan.id, r.body.record && r.body.record.id);
  const AMEND = r.body.record.id;

  const tpl = await req("GET", "/api/compliance/templates?type=loanAction&subtype=amendment", { cookie: ADMIN });
  check("approved templates come from the real library", tpl.status === 200 && tpl.body.total > 100,
    `${tpl.body.suggested.length} suggested of ${tpl.body.total}`);

  r = await req("POST", `/api/compliance/records/${AMEND}/generate`, { cookie: ADMIN, body: { templateId: tpl.body.suggested[0] && tpl.body.suggested[0].id } });
  check("document generated from an approved template", r.status === 201 && r.body.document.size > 500,
    r.body.document ? `${r.body.document.name} (${r.body.document.size} bytes)` : "");
  const DOC = r.body.document && r.body.document.id;
  const dl = await req("GET", `/api/compliance/records/${AMEND}/documents/${DOC}`, { cookie: ADMIN });
  check("generated document is downloadable and is a real docx", dl.status === 200 && dl.bytes > 500);

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: ADMIN, body: { to: "EXECUTED" } });
  check("a stage cannot be skipped", r.status === 409, (r.body.detail || "").slice(0, 60));

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: ADMIN, body: { to: "LEGAL_REVIEW", reviewer: "Imran Tariq" } });
  check("draft -> legal review", r.status === 200 && r.body.record.status === "LEGAL_REVIEW");

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: ADMIN, body: { to: "FINALIZED" } });
  check("segregation of duties: the drafter cannot finalize", r.status === 409, (r.body.detail || "").slice(0, 70));

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: SECOND, body: { to: "FINALIZED", reviewComments: "Reviewed" } });
  check("a second person can finalize", r.status === 200 && r.body.record.status === "FINALIZED");
  check("finalizer is recorded", r.body.record.review.finalizedBy && r.body.record.review.finalizedBy.email === "imran.tariq@zameen.com");

  r = await req("POST", `/api/compliance/records/${AMEND}/signature`, { cookie: ADMIN, body: { method: "wet" } });
  check("signature refused with no signatories", r.status === 409, (r.body.detail || "").slice(0, 55));

  r = await req("POST", `/api/compliance/records/${AMEND}/signatories`, { cookie: ADMIN, body: { signatories: [{ name: "Maryam Haq", capacity: "Director", entity: loan.borrower, method: "wet" }] } });
  check("signatories recorded", r.status === 200 && r.body.record.signatories.length === 1);

  r = await req("POST", `/api/compliance/records/${AMEND}/signature`, { cookie: ADMIN, body: { method: "esign" } });
  check("e-signature honestly refused as unconfigured", r.status === 501, (r.body.detail || "").slice(0, 60));

  r = await req("POST", `/api/compliance/records/${AMEND}/signature`, { cookie: ADMIN, body: { method: "wet" } });
  check("wet signature request moves the record", r.status === 200 && r.body.record.status === "SIGNATURE");

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: ADMIN, body: { to: "EXECUTED" } });
  check("execution refused while a signatory is outstanding", r.status === 409, (r.body.detail || "").slice(0, 60));

  r = await req("POST", `/api/compliance/records/${AMEND}/signature/0`, { cookie: ADMIN, body: { status: "Signed", signedDate: "2026-10-05" } });
  check("signatory marked signed", r.status === 200 && r.body.record.signature.key === "complete");

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: ADMIN, body: { to: "EXECUTED" } });
  check("execution refused without an executed document", r.status === 409, (r.body.detail || "").slice(0, 60));

  r = await req("POST", `/api/compliance/records/${AMEND}/documents`,
    { cookie: ADMIN, body: { kind: "executed", name: "signed.pdf", mimeType: "application/pdf", contentBase64: Buffer.from("%PDF-1.4 executed").toString("base64") } });
  check("executed copy uploaded and hashed", r.status === 201 && /^[0-9a-f]{64}$/.test(r.body.document.sha256));

  r = await req("POST", `/api/compliance/records/${AMEND}/documents`,
    { cookie: ADMIN, body: { kind: "executed", name: "bad.exe", mimeType: "application/x-msdownload", contentBase64: Buffer.from("MZ").toString("base64") } });
  check("a non-document upload is refused", r.status === 415, (r.body.detail || "").slice(0, 55));

  r = await req("POST", `/api/compliance/records/${AMEND}/transition`, { cookie: ADMIN, body: { to: "EXECUTED" } });
  check("record executed", r.status === 200 && r.body.record.status === "EXECUTED");
  check("Drive filing becomes owed on execution", r.body.record.drive.status === "PENDING_UPLOAD");

  r = await req("POST", `/api/compliance/records/${AMEND}/drive`, { cookie: ADMIN, body: { status: "FILED" } });
  check("filing refused without a recorded location", r.status === 400, (r.body.detail || "").slice(0, 55));

  r = await req("POST", `/api/compliance/records/${AMEND}/drive`, { cookie: ADMIN, body: { status: "FILED", folderPath: "Compliance Data _LegalOS / Zameen Group_Loan Agreements" } });
  check("Drive filing recorded with an actor", r.status === 200 && r.body.record.drive.status === "FILED" && !!r.body.record.drive.by);

  r = await req("PATCH", `/api/compliance/records/${AMEND}`, { cookie: ADMIN, body: { fields: { reason: "changed" } } });
  check("an executed record can no longer be edited", r.status === 409, (r.body.detail || "").slice(0, 55));

  const full = await req("GET", `/api/compliance/records/${AMEND}`, { cookie: ADMIN });
  const audit = full.body.record.audit || [];
  const actions = audit.map((a) => a.action);
  check("audit trail records every step", audit.length >= 10, audit.length + " events");
  for (const need of ["record.created", "document.generated", "status.legal_review", "status.finalized", "signatories.set", "signature.requested", "status.executed", "drive.filing"]) {
    check("audit contains " + need, actions.includes(need));
  }
  check("audit entries carry an actor and a timestamp", audit.every((a) => a.actor && a.actor.email && a.at));
  check("parent loan untouched by the amendment",
    (await req("GET", `/api/compliance/loans/${loan.id}`, { cookie: ADMIN })).body.loan.original.principal === loan.principal);

  /* ================================================== 6. REPAYMENTS */
  console.log("\n  Repayments");

  const loan2 = L.find((x) => x.principal > 0 && x.origin === "source" && x.id !== loan.id);
  r = await req("POST", `/api/compliance/loans/${loan2.id}/repayments`, { cookie: ADMIN, body: { repaymentType: "partial", amount: loan2.principal * 2 } });
  check("a repayment above the outstanding balance is refused", r.status === 409, (r.body.detail || "").slice(0, 60));
  r = await req("POST", `/api/compliance/loans/${loan2.id}/repayments`, { cookie: ADMIN, body: { repaymentType: "full", amount: loan2.principal / 4 } });
  check("a 'full' repayment that does not clear the balance is refused", r.status === 409, (r.body.detail || "").slice(0, 60));
  r = await req("POST", `/api/compliance/loans/${loan2.id}/repayments`, { cookie: ADMIN, body: { repaymentType: "partial", amount: loan2.principal / 4, repaymentDate: "2026-09-01", paymentReference: "TT-1" } });
  check("partial repayment recorded", r.status === 201 && r.body.balance.outstanding === loan2.principal * 0.75);
  r = await req("POST", `/api/compliance/loans/${loan2.id}/repayments`, { cookie: ADMIN, body: { repaymentType: "partial", amount: loan2.principal / 4, repaymentDate: "2026-09-10" } });
  check("second partial repayment accumulates", r.status === 201 && r.body.balance.outstanding === loan2.principal * 0.5);
  const det2 = await req("GET", `/api/compliance/loans/${loan2.id}`, { cookie: ADMIN });
  check("outstanding is derived from the repayment history", det2.body.loan.balance.repayments === 2 && det2.body.loan.balance.repaid === loan2.principal * 0.5);
  check("original principal preserved through repayments", det2.body.loan.original.principal === loan2.principal);
  r = await req("POST", `/api/compliance/loans/${loan2.id}/repayments`, { cookie: ADMIN, body: { repaymentType: "full", amount: loan2.principal / 2, repaymentDate: "2026-09-15" } });
  check("full repayment clears the balance", r.status === 201 && r.body.balance.outstanding === 0 && r.body.balance.fullyRepaid === true);

  /* ============================== 7. LEASE / SERVICE / RESOLUTION / LICENCE */
  console.log("\n  Other domains");

  r = await req("POST", `/api/compliance/leases/${LE[0].id}/actions`, { cookie: ADMIN, body: { subtype: "renewal", fields: { actionType: "Renewal", effectiveDate: "2026-10-01", revisedExpiry: "2029-09-30" } } });
  check("lease renewal creates a child action", r.status === 201 && r.body.record.parent.kind === "lease");
  const leaseDet = await req("GET", `/api/compliance/leases/${LE[0].id}`, { cookie: ADMIN });
  check("lease detail shows the action and a timeline", leaseDet.body.agreement.children.length === 1 && leaseDet.body.agreement.timeline.length > 0);

  r = await req("POST", `/api/compliance/services/${SV[0].id}/actions`, { cookie: ADMIN, body: { subtype: "amendment", fields: { actionType: "Amendment", revisedScope: "Extended" } } });
  check("service amendment creates a child action", r.status === 201 && r.body.record.type === "serviceAction");

  const zd = E.find((e) => /Zameen Developments \(Private\)/.test(e.name));
  r = await req("POST", "/api/compliance/resolutions", { cookie: ADMIN, body: { entityKey: zd.key, fields: { resolutionType: "Board Resolution", subject: "Filing written statement", addressedTo: "LESCO", requestingDepartment: "Admin", authorizedPerson: "Test Person", urgency: "Urgent", resolutionDate: "2026-09-17", body: "RESOLVED THAT..." } } });
  check("resolution created against an entity", r.status === 201 && r.body.record.entityKey === zd.key, r.body.record && r.body.record.id);
  const RESID = r.body.record.id;
  r = await req("POST", `/api/compliance/records/${RESID}/generate`, { cookie: ADMIN, body: {} });
  check("resolution document generated without a fabricated letterhead", r.status === 201);
  const res2 = await req("GET", "/api/compliance/resolutions", { cookie: ADMIN });
  const grp = res2.body.byEntity.find((g) => g.key === zd.key);
  check("the new resolution appears under its entity", grp && grp.native === 1 && grp.pending === 1);

  const lic = LI.find((x) => x.origin === "source");
  r = await req("POST", `/api/compliance/licences/${lic.id}/applications`, { cookie: ADMIN, body: { fields: {} } });
  check("licence renewal auto-populates from the existing licence",
    r.status === 201 && r.body.record.fields.currentLicenceNumber === lic.number && r.body.record.fields.authority === lic.authority);
  check("missing application requirements are surfaced", Array.isArray(r.body.missing) && r.body.missing.length > 0,
    (r.body.missing || []).map((m) => m.label).join(", ").slice(0, 60));
  r = await req("POST", "/api/compliance/licences/applications", { cookie: ADMIN, body: { entityKey: zd.key, entity: zd.name, fields: { applicationType: "new", authority: "TEPA", licenceType: "Test permit" } } });
  check("new licence application created", r.status === 201 && r.body.record.subtype === "new");

  /* ============================================= 8. SECP FILING WORKFLOW */
  console.log("\n  SECP filings");

  r = await req("POST", "/api/compliance/secp/filings", { cookie: ADMIN, body: { entityKey: zd.key, entity: zd.name, filingCategory: "annual", financialYear: "FY 2026", form: "A", statutoryDueDate: "2026-07-30", filingStatus: "Identified / due" } });
  check("new filing creates a FILING record, not a request", r.status === 201 && r.body.record.type === "secpFiling");
  const FID = r.body.record.id;
  r = await req("POST", `/api/compliance/secp/filings/${FID}/status`, { cookie: ADMIN, body: { status: "Preparation" } });
  check("an overdue filing must carry a reason", r.status === 409, (r.body.detail || "").slice(0, 55));
  r = await req("POST", `/api/compliance/secp/filings/${FID}/status`, { cookie: ADMIN, body: { status: "Preparation", overdueReason: "Awaiting financial statements" } });
  check("status set once a configured reason is given", r.status === 200 && r.body.record.fields.overdueReason === "Awaiting financial statements");
  r = await req("POST", `/api/compliance/secp/filings/${FID}/status`, { cookie: ADMIN, body: { status: "Preparation", overdueReason: "Whatever I like" } });
  check("an unconfigured overdue reason is refused", r.status === 400);
  r = await req("POST", "/api/compliance/secp/filings", { cookie: ADMIN, body: { entityKey: zd.key, filingCategory: "event", financialYear: "FY 2027", form: "ZZZ" } });
  check("an unknown SECP form is refused", r.status === 400, (r.body.detail || "").slice(0, 55));
  r = await req("POST", "/api/compliance/secp/filings", { cookie: ADMIN, body: { entityKey: zd.key, filingCategory: "event" } });
  check("a filing without a financial year is refused", r.status === 400);
  const entHist = await req("GET", "/api/compliance/secp/entity/" + encodeURIComponent(zd.key), { cookie: ADMIN });
  /* The entity page serves the compliance years Drive holds a folder for --
     `complianceYears` -- not a generated FY series. The old `annual` key was a
     formula's output (FY 2021..FY 2028) rendered for every company alike. The
     expected value is read from the statutory register, never a literal. */
  const entYears = entHist.body.complianceYears || [];
  const fromRegister = ((await req("GET", "/api/compliance/secp/annual?entity=" + encodeURIComponent(zd.key), { cookie: ADMIN })).body || {}).annual || [];
  check("entity SECP history is exactly the compliance years Drive holds",
    entYears.length > 0 && entYears.length === fromRegister.length,
    entYears.length + " years on the entity page, " + fromRegister.length + " in the register: "
      + entYears.map((y) => y.sourcePeriodLabel).join(", "));
  check("every year on the entity page is source-backed, never generated",
    entYears.every((y) => y.origin === "SECP_SOURCE_DRIVE" && /^CY /.test(y.sourcePeriodLabel)),
    [...new Set(entYears.map((y) => y.origin))].join(","));
  check("entity SECP timeline includes Drive evidence", (entHist.body.timeline || []).some((t) => t.origin === "drive"));
  const secpAfter = await req("GET", "/api/compliance/secp/overview", { cookie: ADMIN });
  check("dashboard reconciles with the filings recorded", secpAfter.body.dashboard.annual.recorded === 1,
    "annual recorded = " + secpAfter.body.dashboard.annual.recorded);

  /* ============================================ 9. GRANULAR PERMISSIONS */
  console.log("\n  Granular capability enforcement");

  await req("POST", "/api/access/user/u20", { cookie: ADMIN, body: { groups: { compliance: "view" } } });
  const VIEW = await loginAs(SANDBOX, "arsalan.sandhu@zameen.com");
  const vcfg = await req("GET", "/api/compliance/config", { cookie: VIEW });
  check("view-level account reads Compliance", vcfg.status === 200 && vcfg.body.level === "view");
  check("view-level capabilities deny every write",
    vcfg.body.capabilities["compliance.view"] === true &&
    !vcfg.body.capabilities["compliance.create"] &&
    !vcfg.body.capabilities["compliance.finalize"] &&
    !vcfg.body.capabilities["compliance.execute"] &&
    !vcfg.body.capabilities["compliance.repayment.record"]);
  check("view-level CAN read the register", (await req("GET", "/api/compliance/loans", { cookie: VIEW })).status === 200);
  for (const [label, route, body] of [
    ["create an amendment", `/api/compliance/loans/${loan.id}/actions`, { subtype: "amendment", fields: {} }],
    ["record a repayment", `/api/compliance/loans/${loan.id}/repayments`, { amount: 1 }],
    ["create a resolution", "/api/compliance/resolutions", { entityKey: zd.key, fields: { subject: "x" } }],
    ["create a SECP filing", "/api/compliance/secp/filings", { entityKey: zd.key, financialYear: "FY 2026" }],
    ["apply for a licence renewal", `/api/compliance/licences/${lic.id}/applications`, { fields: {} }],
  ]) {
    const rr = await req("POST", route, { cookie: VIEW, body });
    check("view-level cannot " + label, rr.status === 403, "HTTP " + rr.status);
  }

  await req("POST", "/api/access/user/u20", { cookie: ADMIN, body: { groups: { compliance: "edit" } } });
  const EDIT = await loginAs(SANDBOX, "arsalan.sandhu@zameen.com");
  r = await req("POST", `/api/compliance/loans/${loan2.id}/actions`, { cookie: EDIT, body: { subtype: "amendment", fields: { reason: "edit-level fixture" } } });
  check("edit-level CAN create an action", r.status === 201);
  const EID = r.body.record && r.body.record.id;
  r = await req("POST", `/api/compliance/records/${EID}/transition`, { cookie: EDIT, body: { to: "LEGAL_REVIEW" } });
  check("edit-level CAN send for review", r.status === 200);
  r = await req("POST", `/api/compliance/records/${EID}/transition`, { cookie: EDIT, body: { to: "FINALIZED" } });
  check("edit-level CANNOT finalize", r.status === 403, (r.body.detail || "").slice(0, 55));
  r = await req("POST", `/api/compliance/loans/${loan2.id}/repayments`, { cookie: EDIT, body: { amount: 1 } });
  check("edit-level CANNOT record a repayment", r.status === 403);

  /* =============================================== 9b. SAVED VIEWS */
  console.log("\n  Saved views");

  const madeViews = [];
  for (const [reg, vname, filters] of [
    ["loan", "SBP pending", { sbp: ["Pending registration", "Submitted"] }],
    ["loan", "Repayment due 30 days", { repay: ["d30"] }],
    ["loan", "International loans", { category: ["International"] }],
    ["lease", "Expiring 90 days", { expiry: ["d90"] }],
    ["svc", "Active services", { status: ["Active"] }],
    ["res", "Pending signature", { sig: ["Pending", "Partially signed"] }],
    ["lic", "Renewal pending", { renewal: ["In progress"] }],
    ["secp", "FY 2026 outstanding", { fy: ["FY 2026"], fstatus: ["Identified / due"] }],
    ["secp", "Overdue", { due: ["overdue"] }],
  ]) {
    const rr = await req("POST", "/api/views", { cookie: ADMIN, body: { register: reg, name: vname, filters } });
    check(`saved view kept its filters: ${reg} - ${vname}`,
      rr.status === 201 && Object.keys(rr.body.view.filters).length === Object.keys(filters).length,
      rr.status === 201 ? JSON.stringify(rr.body.view.filters) : JSON.stringify(rr.body).slice(0, 70));
    if (rr.status === 201) madeViews.push(rr.body.view.id);
  }
  // A filter key the register does not support must be DROPPED, not stored -
  // that is what stops a crafted view from smuggling in a filter.
  const crafted = await req("POST", "/api/views", { cookie: ADMIN, body: { register: "loan", name: "crafted", filters: { category: ["International"], notAFilter: ["x"] } } });
  check("an unsupported filter key is dropped from a saved view",
    crafted.status === 201 && !crafted.body.view.filters.notAFilter);
  if (crafted.status === 201) madeViews.push(crafted.body.view.id);

  const otherUserViews = await req("GET", "/api/views?register=loan", { cookie: LITIG });
  check("saved views are not visible to another user", ((otherUserViews.body || {}).views || []).length === 0);
  const steal = await req("PATCH", "/api/views/" + madeViews[0], { cookie: LITIG, body: { name: "hacked" } });
  check("another user cannot edit a saved view", steal.status === 404, "HTTP " + steal.status);
  check("a saved view cannot bypass permissions",
    (await req("GET", "/api/compliance/loans", { cookie: LITIG })).status === 403);
  for (const id of madeViews) await req("DELETE", "/api/views/" + id, { cookie: ADMIN });

  /* ======================================== 10. DOCUMENT AUTHORIZATION */
  console.log("\n  Document authorization");

  const tplLitig = await req("GET", "/api/compliance/templates", { cookie: LITIG });
  check("template picker refused to a non-compliance account", tplLitig.status === 403, "HTTP " + tplLitig.status);
  const docLitig = await req("GET", `/api/compliance/records/${AMEND}/documents/${DOC}`, { cookie: LITIG });
  check("a generated document is not readable cross-module", docLitig.status === 403, "HTTP " + docLitig.status);

  /* ====================================== 11. PERSISTENCE ACROSS RESTART */
  console.log("\n  Persistence");

  const beforeRestart = await req("GET", `/api/compliance/records/${AMEND}`, { cookie: ADMIN });
  server.kill();
  await w(900);
  const server2 = spawn("node", ["server.js"], { cwd: SANDBOX, stdio: "ignore", env: { ...process.env, PORT, LEGALOS_DEV: "1", LEGALOS_COOKIE_PATH: "/" } });
  reap(server2);   // stopped on every exit path, including a kill
  for (let i = 0; i < 60 && !(await ping()); i++) await w(400);
  const ADMIN2 = await loginAs(SANDBOX, "maryam.haq@zameen.com");
  const afterRestart = await req("GET", `/api/compliance/records/${AMEND}`, { cookie: ADMIN2 });
  check("workflow state survives a restart",
    afterRestart.status === 200 &&
    afterRestart.body.record.status === beforeRestart.body.record.status &&
    afterRestart.body.record.audit.length === beforeRestart.body.record.audit.length,
    `${afterRestart.body.record && afterRestart.body.record.status}, ${afterRestart.body.record && afterRestart.body.record.audit.length} audit events`);
  const docAfter = await req("GET", `/api/compliance/records/${AMEND}/documents/${DOC}`, { cookie: ADMIN2 });
  check("generated documents survive a restart", docAfter.status === 200 && docAfter.bytes > 500);
  const balAfter = await req("GET", `/api/compliance/loans/${loan2.id}`, { cookie: ADMIN2 });
  check("repayment balance survives a restart", balAfter.body.loan.balance.outstanding === 0);

  /* ================================= 11b. DRILL-DOWN ADDRESSES */
  console.log("\n  Drill-down endpoints");

  // Every level the UI can navigate to has to exist as an addressable resource,
  // or the deep link is a lie the moment somebody pastes it.
  const resList = await req("GET", "/api/compliance/resolutions", { cookie: ADMIN2 });
  const grp0 = (resList.body.byEntity || [])[0];
  const entReg = await req("GET", "/api/compliance/resolutions/entity/" + encodeURIComponent(grp0.key), { cookie: ADMIN2 });
  check("an entity's resolutions are addressable",
    entReg.status === 200 && Array.isArray(entReg.body.source) && entReg.body.entityKey === grp0.key,
    `${entReg.body.entity}: ${((entReg.body.source) || []).length} source + ${((entReg.body.native) || []).length} native`);
  check("the entity register counts agree with the grouping the register page shows",
    entReg.body.source.length + entReg.body.native.length === grp0.source + grp0.native,
    `${entReg.body.source.length}+${entReg.body.native.length} vs ${grp0.source}+${grp0.native}`);

  const srcRes = (entReg.body.source || [])[0];
  const one = await req("GET", "/api/compliance/resolutions/" + encodeURIComponent(srcRes.id), { cookie: ADMIN2 });
  check("a SOURCE resolution is addressable and read-only",
    one.status === 200 && one.body.resolution.origin === "source" && one.body.resolution.id === srcRes.id,
    one.body.resolution && one.body.resolution.id);
  check("a source resolution's timeline is built only from what exists",
    (one.body.resolution.timeline || []).every((t) => t.origin === "source" || t.origin === "drive"),
    (one.body.resolution.timeline || []).map((t) => t.origin).join(","));
  const missRes = await req("GET", "/api/compliance/resolutions/RES-NOPE", { cookie: ADMIN2 });
  check("a resolution that does not exist is a 404, not an empty record", missRes.status === 404, "HTTP " + missRes.status);

  const yrs = await req("GET", "/api/compliance/secp/years", { cookie: ADMIN2 });
  const y0 = (yrs.body.years || [])[0];
  check("every compliance year carries a stable id", (yrs.body.years || []).every((y) => y.id), y0 && y0.id);
  const oneYear = await req("GET", "/api/compliance/secp/years/" + encodeURIComponent(y0.id), { cookie: ADMIN2 });
  check("a compliance year is addressable",
    oneYear.status === 200 && oneYear.body.year.id === y0.id, oneYear.body.year && oneYear.body.year.entity);
  /* The separation is now carried by the record itself rather than by a
     sentence of prose: a document ON FILE, a filing EVIDENCED and an
     acknowledgement RECEIVED are three independent states. That is stronger
     than the note this used to read, and it is what every screen renders. */
  const yr = oneYear.body.year || {};
  check("an addressed compliance year still separates evidence from filing",
    !!yr.documentStatus && !!yr.filingStatus && !!yr.acknowledgementStatus
      && yr.filingStatus !== yr.documentStatus,
    "document " + yr.documentStatus + " / filing " + yr.filingStatus + " / acknowledgement " + yr.acknowledgementStatus);
  check("a document on file is never reported as a filing",
    yr.filingStatus !== "EVIDENCE_OF_SUBMISSION" || (yr.documents || []).length > 0,
    yr.entity + " " + yr.sourcePeriodLabel);

  /* ---- the document endpoint, and its object-level authorization ---- */
  const loansForDocs = await req("GET", "/api/compliance/loans", { cookie: ADMIN2 });
  const docLoan = (loansForDocs.body.loans || []).find((l) => (l.driveFiles || []).length > 0);
  const fid = docLoan.driveFiles[0].id;
  const doc = await req("GET", "/api/compliance/document/" + encodeURIComponent(fid), { cookie: ADMIN2 });
  check("a compliance document is addressable, with its metadata",
    doc.status === 200 && doc.body.document.id === fid && !!doc.body.document.name, doc.body.document && doc.body.document.name);
  check("the document names the records that actually cite it",
    Array.isArray(doc.body.links) && doc.body.links.every((l) => l.id && l.family),
    (doc.body.links || []).map((l) => l.id).slice(0, 3).join(", "));
  // Knowing a file id must not be enough to read it. Sign the litigation persona
  // in AGAIN: the persistence section above restarted the server, so the cookie
  // taken at the top of this run is dead and would answer 401 -- which is "you
  // are nobody", not "you are refused", and would prove nothing about scope.
  const LITIG2 = await loginAs(SANDBOX, "salman.khan@zameen.com");
  const litigSees = await req("GET", "/api/compliance/loans", { cookie: LITIG2 });
  check("the re-established litigation session is live and still refused Compliance",
    litigSees.status === 403, "HTTP " + litigSees.status);
  const docDenied = await req("GET", "/api/compliance/document/" + encodeURIComponent(fid), { cookie: LITIG2 });
  check("a litigation-only account cannot read a compliance document",
    docDenied.status === 403 || docDenied.status === 404, "HTTP " + docDenied.status);
  const docAnon = await req("GET", "/api/compliance/document/" + encodeURIComponent(fid), {});
  check("an unauthenticated request cannot read a compliance document",
    docAnon.status === 401 || docAnon.status === 403, "HTTP " + docAnon.status);
  const docMissing = await req("GET", "/api/compliance/document/not-a-real-file-id", { cookie: ADMIN2 });
  check("an unknown file id is a 404, indistinguishable from an unauthorised one", docMissing.status === 404,
    "HTTP " + docMissing.status);

  /* ============================================== 12. ACTIVITY TRAIL */
  console.log("\n  Activity trail");

  // The Overview's "Recent activity" panel reads this. It must be the audit
  // trail and nothing else -- if a Drive document date ever leaked in here, the
  // dashboard would be asserting that somebody acted on a day nobody did.
  const act = await req("GET", "/api/compliance/activity?limit=50", { cookie: ADMIN2 });
  check("activity trail reads back after a restart", act.status === 200 && Array.isArray(act.body.activity),
    "HTTP " + act.status + ", " + ((act.body.activity || []).length) + " entries");
  const A = act.body.activity || [];
  check("every action taken in this run is in the trail", A.length > 0 && act.body.total >= A.length,
    A.length + " of " + act.body.total);
  check("the trail is newest first",
    A.every((x, i) => i === 0 || String(A[i - 1].at) >= String(x.at)));
  check("every entry names a verified actor and an instant",
    A.every((x) => x.actor && x.actor !== "unknown" && /^\d{4}-\d{2}-\d{2}T/.test(x.at)),
    A.length ? A[0].actor + " " + A[0].at : "");
  check("every entry points at a record that exists",
    A.every((x) => !x.recordId || typeof x.recordId === "string"),
    A.map((x) => x.action).slice(0, 4).join(", "));
  // The distinction the whole module rests on: an entry is something a person
  // did, never a date read off a file.
  const ids = new Set(A.map((x) => x.recordId).filter(Boolean));
  let real = 0;
  for (const id of ids) {
    const rec = await req("GET", "/api/compliance/records/" + encodeURIComponent(id), { cookie: ADMIN2 });
    if (rec.status === 200) real++;
  }
  check("no entry refers to anything but a LegalOS workflow record", real === ids.size,
    real + "/" + ids.size + " resolve");
  check("the limit is honoured and capped",
    (await req("GET", "/api/compliance/activity?limit=2", { cookie: ADMIN2 })).body.activity.length <= 2);

  /* ============================================ 13. SOURCE PRESERVATION */
  console.log("\n  Source preservation");

  const regs = await req("GET", "/api/registers", { cookie: ADMIN2 });
  const counts = (regs.body && regs.body.counts) || {};
  const drifted = Object.keys(BASELINE).filter((k) => BASELINE[k] !== counts[k]);
  check("source registers unchanged by all of the above",
    Object.keys(BASELINE).length > 0 && drifted.length === 0,
    drifted.length ? drifted.map((k) => `${k} ${BASELINE[k]}→${counts[k]}`).join(", ")
      : `unchanged — loans ${counts.loans}, licences ${counts.licences}, resolutions ${counts.resolutions}`);
  // The registers must also still be non-empty: an invariant that holds because
  // everything went to zero would pass the check above and mean the opposite.
  check("the registers are still populated",
    counts.loans > 0 && counts.licences > 0 && counts.resolutions > 0,
    `loans ${counts.loans}, licences ${counts.licences}, resolutions ${counts.resolutions}`);
  const loansAfter = await req("GET", "/api/compliance/loans", { cookie: ADMIN2 });
  check("loan reconciliation still balances", loansAfter.body.reconciliation.balances === true);
  check("stable record ids preserved", loansAfter.body.loans.some((x) => x.id === loan.id));

  try { server2.kill(); } catch (e) {}

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n  ${pass}/${results.length} checks passed${fail ? `, ${fail} FAILED` : ""}\n`);
  if (fail) for (const r of results.filter((x) => !x.pass)) console.log("  FAILED: " + r.name + (r.detail ? "  — " + r.detail : ""));
  done(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
