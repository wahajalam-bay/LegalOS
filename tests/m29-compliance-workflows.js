// THE WORKFLOWS A LEGAL USER ACTUALLY HAS TO COMPLETE.
//
// Each of these used to dead-end somewhere, and the failure was always the same
// shape: the status could be advanced but the facts the status exists to hold
// could not be entered.
//
//   THE DETAILS BLOCK WAS READ-ONLY. A renewal could be moved from Draft to
//   Submitted without anyone being able to record the submission date, the
//   authority's reference or the new licence number. The workflow advanced
//   while the record stayed empty.
//
//   The controls below are NOT bugs and must not be "fixed" away:
//     · the drafter of a resolution cannot approve it (separation of duties)
//     · a record cannot be executed while a signatory has not signed
//     · a record cannot be executed without the signed copy on file
//     · an executed record can no longer be rewritten
//   Each one is asserted here so a later change cannot quietly remove it.
//
//   node tests/m29-compliance-workflows.js
const H = require("./_harness.js");

H.runSuite("m29-compliance-workflows — renewal and resolution, end to end", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_WF_PORT", portFallback: "4961", prefix: "legalos-wf-",
  }));
  const drafter = await H.loginApi(sb, H.USERS.complLead.email);
  const reviewer = await H.loginApi(sb, H.USERS.director.email);
  const rec = (id, c) => H.request(sb.base, "GET", "/api/compliance/records/" + id, { cookie: c })
    .then((r) => (r.body || {}).record || {});
  const step = (id, to, c) => H.request(sb.base, "POST", "/api/compliance/records/" + id + "/transition", { cookie: c, body: { to } });

  /* ---- LICENCE RENEWAL -------------------------------------------------- */
  const lics = ((await H.request(sb.base, "GET", "/api/compliance/licences", { cookie: drafter })).body || {}).licences || [];
  const lic = lics[0];
  const ren = await H.request(sb.base, "POST", "/api/compliance/licences/" + encodeURIComponent(lic.id) + "/applications", {
    cookie: drafter, body: { fields: { applicationType: "renewal", authority: lic.authority,
      currentLicenceNumber: lic.number, currentExpiry: lic.expiry } } });
  const rid = (ren.body.record || {}).id;
  check("a renewal can be raised against a licence", !!rid, "HTTP " + ren.status + " " + rid);

  const filled = await H.request(sb.base, "PATCH", "/api/compliance/records/" + rid, {
    cookie: drafter, body: { fields: { submissionDate: "2026-09-10", applicationReference: "PCATP/REN/88",
      renewedLicenceNumber: "NEW-2026-777", newIssueDate: "2026-11-01", newExpiryDate: "2027-12-31",
      notes: "Submitted at the authority counter." } } });
  check("the facts of a renewal can actually be entered and persist",
    filled.status === 200 && filled.body.record.fields.renewedLicenceNumber === "NEW-2026-777"
      && filled.body.record.fields.submissionDate === "2026-09-10",
    JSON.stringify({ ref: filled.body.record.fields.applicationReference,
      submitted: filled.body.record.fields.submissionDate,
      newNo: filled.body.record.fields.renewedLicenceNumber }));
  const reread = await rec(rid, reviewer);
  check("another user reading the same renewal sees those facts",
    reread.fields.renewedLicenceNumber === "NEW-2026-777", reread.fields.renewedLicenceNumber);
  check("the edit is written to the audit trail with before and after",
    (reread.audit || []).some((a) => a.action === "record.updated" && a.before && a.after),
    (reread.audit || []).filter((a) => a.action === "record.updated").length + " update entries");
  const licAfter = ((await H.request(sb.base, "GET", "/api/compliance/licences/" + encodeURIComponent(lic.id), { cookie: drafter })).body || {}).licence;
  check("the renewal shows on the licence, which keeps its own period until granted",
    (licAfter.applications || []).some((a) => a.id === rid) && licAfter.expiry === lic.expiry,
    (licAfter.applications || []).length + " application(s); licence expiry still " + licAfter.expiry);

  /* ---- RESOLUTION ------------------------------------------------------- */
  const ents = ((await H.request(sb.base, "GET", "/api/compliance/entities", { cookie: drafter })).body || {}).entities || [];
  const ent = ents.find((e) => e.type === "PRIVATE");
  const made = await H.request(sb.base, "POST", "/api/compliance/resolutions", {
    cookie: drafter, body: { entityKey: ent.key, entity: ent.name, fields: {
      resolutionType: "Board Resolution", subject: "Opening or operating a bank account",
      templateKey: "bank-account", body: "RESOLVED THAT a bank account be opened…" } } });
  const id = (made.body.record || {}).id;
  check("a resolution is created from an approved template", !!id, id + " from template bank-account");

  const edited = await H.request(sb.base, "PATCH", "/api/compliance/records/" + id, {
    cookie: drafter, body: { fields: { body: "RESOLVED THAT a bank account be opened with Habib Bank Limited…" } } });
  check("the draft wording can be edited before execution",
    edited.status === 200 && /Habib Bank/.test(edited.body.record.fields.body),
    edited.body.record.fields.body.slice(0, 55) + "…");

  check("the drafter can submit it for review", (await step(id, "LEGAL_REVIEW", drafter)).status === 200, "-> LEGAL_REVIEW");
  const own = await step(id, "FINALIZED", drafter);
  check("the drafter CANNOT approve their own resolution",
    own.status === 409 && own.body.error === "sod", "HTTP 409 — separation of duties");
  check("a different reviewer can approve it",
    (await step(id, "FINALIZED", reviewer)).status === 200, "-> FINALIZED");

  await H.request(sb.base, "POST", "/api/compliance/records/" + id + "/signatories", {
    cookie: reviewer, body: { signatories: [{ name: "Ali Raza", email: "ali.raza@zameen.com", role: "Authorised director" }] } });
  check("it goes out for signature", (await step(id, "SIGNATURE", reviewer)).status === 200, "-> SIGNATURE");

  const early = await step(id, "EXECUTED", reviewer);
  check("it cannot be executed while a signatory has not signed",
    early.status === 409 && early.body.error === "signatures_outstanding", early.body.detail);

  await H.request(sb.base, "POST", "/api/compliance/records/" + id + "/signature/0",
    { cookie: reviewer, body: { status: "Signed", signedDate: "2026-09-22" } });
  const noDoc = await step(id, "EXECUTED", reviewer);
  check("it cannot be executed without the signed copy on file",
    noDoc.status === 409 && noDoc.body.error === "no_executed_document", noDoc.body.detail);

  const pdf = Buffer.from("%PDF-1.4 executed resolution\n%%EOF");
  const upl = await H.request(sb.base, "POST", "/api/compliance/records/" + id + "/documents", {
    cookie: reviewer, body: { kind: "executed", name: "Executed resolution.pdf",
      mimeType: "application/pdf", contentBase64: pdf.toString("base64") } });
  check("the signed copy can be uploaded", upl.status === 201 || upl.status === 200, "HTTP " + upl.status);

  await H.request(sb.base, "PATCH", "/api/compliance/records/" + id,
    { cookie: reviewer, body: { fields: { signatureMethod: "Wet signature", executionDate: "2026-09-22" } } });
  check("it executes once the signature and the signed copy are both in",
    (await step(id, "EXECUTED", reviewer)).status === 200, "-> EXECUTED");
  check("an executed resolution can no longer be rewritten",
    (await H.request(sb.base, "PATCH", "/api/compliance/records/" + id,
      { cookie: reviewer, body: { fields: { body: "tamper" } } })).status === 409, "HTTP 409 — locked");

  const fin = await rec(id, drafter);
  check("the drafter reopens it and the whole record is there",
    fin.status === "EXECUTED" && fin.fields.signatureMethod === "Wet signature"
      && (fin.signatories || []).length === 1 && (fin.signatories || [])[0].status === "Signed"
      && (fin.audit || []).length >= 8,
    fin.status + " · " + fin.fields.signatureMethod + " · signed by " + (fin.signatories || [])[0].name
      + " · " + (fin.audit || []).length + " audit entries");

  const all = (await H.request(sb.base, "GET", "/api/compliance/resolutions", { cookie: drafter })).body || {};
  check("the Drive-backed archive is untouched beside the new record",
    all.source >= 960 && (all.native || []).length >= 1,
    all.source + " source resolutions + " + (all.native || []).length + " raised in LegalOS");
});
