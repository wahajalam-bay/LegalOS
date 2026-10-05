// THE POC FEEDBACK, AS PRODUCT BEHAVIOUR.
//
// Each check here corresponds to something the legal team asked for after
// using the tool, and each one failed before this work:
//
//   SECP entities were classified by guessing at names, so the group's one
//   public limited company (Zameen REIT Management Company Limited) fell
//   through to "other" and was given no AGM requirement at all. The registered
//   name in the Drive folder is the source; nothing is inferred beyond it.
//
//   A partnership was being offered a company's annual filing requirements.
//
//   The compliance-year views had no way to ask "what happened between 2023
//   and 2024" -- the range is now URL-backed so a filtered view can be shared.
//
//   The portal button pointed at the retired eServices path.
//
//   A licence could not be corrected in LegalOS, and a renewal had no
//   lifecycle of its own -- its stage was visible only by opening the
//   underlying record.
//
//   A resolution had to be typed from nothing. Approved templates now come
//   from configuration, filtered by the entity's legal form, and the signature
//   rule follows that form: a partnership signs through its partners, a single
//   member company through its sole member. No person is hardcoded.
//
//   node tests/m28-poc-feedback.js
const H = require("./_harness.js");

H.runSuite("m28-poc-feedback — the POC feedback, implemented", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_POCFB_PORT", portFallback: "4951", prefix: "legalos-pocfb-",
  }));
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);
  const get = (p) => H.request(sb.base, "GET", p, { cookie });

  /* ---- 1. entity cleanup and legal form -------------------------------- */
  const annual = ((await get("/api/compliance/secp/annual")).body || {}).annual || [];
  const forms = annual.reduce((a, r) => ((a[r.entityType] = (a[r.entityType] || 0) + 1), a), {});
  check("every SECP entity-year carries a real legal form",
    !forms.OTHER && !forms.UNKNOWN && !forms.CONFLICT, JSON.stringify(forms));
  const rmc = annual.find((r) => /REIT Management Company Limited/i.test(r.entity));
  check("a company registered as \"… Limited\" is a public limited company",
    rmc && rmc.entityType === "PUBLIC_LIMITED" && rmc.agm.applicable === true,
    rmc ? rmc.entity + " -> " + rmc.entityType + ", AGM applies " + rmc.agm.applicable : "not in the estate");
  check("a single member company is still never asked for an AGM",
    annual.filter((r) => r.entityType === "SMC").every((r) => r.agm.applicable === false),
    annual.filter((r) => r.entityType === "SMC").length + " SMC entity-years");

  const ents = ((await get("/api/compliance/entities")).body || {}).entities || [];
  const part = ents.find((e) => e.type === "PARTNERSHIP");
  check("a partnership is not given a company's annual filing requirements",
    !!part && ((part.requirements || {}).annualForms || []).length === 0,
    part ? part.name + " -> " + JSON.stringify((part.requirements || {}).annualForms) : "no partnership in the registry");

  /* ---- 2. Drive grouping is preserved ---------------------------------- */
  check("Group and Non-group survive as source-backed structure",
    [...new Set(annual.map((r) => r.group))].sort().join(",") === "group,non-group",
    [...new Set(annual.map((r) => r.group))].join(", "));

  /* ---- 3. history is Drive's, futures are labelled --------------------- */
  const up = ((await get("/api/compliance/secp/upcoming")).body || {}).upcoming || [];
  check("Drive history and generated obligations never mix",
    annual.every((r) => r.origin === "SECP_SOURCE_DRIVE")
      && up.length > 0 && up.every((u) => u.origin === "SYSTEM_GENERATED"),
    annual.length + " Drive-backed, " + up.length + " system-generated");

  /* ---- 4. the portal -------------------------------------------------- */
  const rules = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "config", "compliance-rules.json"), "utf8"));
  check("the SECP portal action is the LEAP login",
    /^https:\/\/leap\.secp\.gov\.pk\/#\/user\/login$/.test(rules.secp.portal.url),
    rules.secp.portal.url);

  /* ---- 5. licence correction, with a reason ---------------------------- */
  const lics = ((await get("/api/compliance/licences")).body || {}).licences || [];
  const lic = lics[0];
  const was = lic.number;
  const edit = await H.request(sb.base, "PATCH", "/api/compliance/licences/" + encodeURIComponent(lic.id), {
    cookie, body: { fields: { number: "REISSUED/2026/7", renewalStatus: "Submitted" },
      reason: "authority reissued the certificate" },
  });
  const merged = edit.body && edit.body.licence;
  check("an authorised user can correct a licence in LegalOS",
    edit.status === 200 && merged.number === "REISSUED/2026/7", "HTTP " + edit.status + " -> " + (merged || {}).number);
  check("the correction keeps the old value, the user, the time and the reason",
    merged && merged.edited && merged.edited.number
      && merged.edited.number.from === was && merged.edited.number.by && merged.edited.number.at
      && merged.edited.number.reason === "authority reissued the certificate",
    merged && merged.edited ? JSON.stringify(merged.edited.number) : "no provenance");
  check("a lineage field cannot be edited",
    (edit.body.refused || []).length === 0
      && (await H.request(sb.base, "PATCH", "/api/compliance/licences/" + encodeURIComponent(lic.id),
        { cookie, body: { fields: { driveFiles: "nope" }, reason: "x" } })).body.refused.includes("driveFiles"),
    "driveFiles refused");
  // put it back so the suite leaves nothing behind
  await H.request(sb.base, "PATCH", "/api/compliance/licences/" + encodeURIComponent(lic.id),
    { cookie, body: { fields: { number: "", renewalStatus: "" }, reason: "test cleanup" } });

  /* ---- 6. renewal is a lifecycle, not a field -------------------------- */
  const ren = await H.request(sb.base, "POST", "/api/compliance/licences/" + encodeURIComponent(lic.id) + "/applications", {
    cookie, body: { fields: { applicationType: "renewal", authority: lic.authority,
      currentLicenceNumber: lic.number, currentExpiry: lic.expiry, applicationStart: "2026-09-01" } },
  });
  check("a renewal application can be raised against a licence",
    (ren.status === 201 || ren.status === 200) && ren.body.record,
    "HTTP " + ren.status + " " + ((ren.body.record || {}).id || ""));
  const after = ((await get("/api/compliance/licences/" + encodeURIComponent(lic.id))).body || {}).licence;
  check("the renewal appears on the licence it renews",
    after && (after.applications || []).some((a) => a.id === (ren.body.record || {}).id),
    (after && after.applications ? after.applications.length : 0) + " application(s) on the licence");
  check("the licence keeps its existing period until the renewal completes",
    after && after.expiry === lic.expiry, "expiry still " + (after || {}).expiry);

  /* ---- 7. resolutions draft from approved templates -------------------- */
  const byForm = {};
  for (const e of ents.filter((x) => ["PRIVATE", "SMC", "PARTNERSHIP"].includes(x.type)).slice(0, 12)) {
    if (byForm[e.type]) continue;
    const r = await get("/api/compliance/resolutions/templates?entity=" + encodeURIComponent(e.key));
    byForm[e.type] = r.body || {};
  }
  check("approved templates are offered per legal form, not one list for everyone",
    Object.keys(byForm).length >= 2
      && Object.values(byForm).every((b) => (b.templates || []).length > 0),
    Object.entries(byForm).map(([k, v]) => k + "=" + (v.templates || []).length).join(", "));
  check("a partnership resolves through its partners",
    !byForm.PARTNERSHIP || (byForm.PARTNERSHIP.signatory && /partner/i.test(byForm.PARTNERSHIP.signatory.role)
      && byForm.PARTNERSHIP.signatory.minimum >= 2),
    byForm.PARTNERSHIP ? JSON.stringify(byForm.PARTNERSHIP.signatory) : "no partnership");
  check("a single member company resolves through its sole member",
    !byForm.SMC || (byForm.SMC.signatory && /sole member/i.test(byForm.SMC.signatory.role)),
    byForm.SMC ? JSON.stringify(byForm.SMC.signatory) : "no SMC");
  const anyForm = Object.values(byForm)[0] || {};
  check("an unconnected e-signature provider is declared, not implied",
    (anyForm.methods || []).some((mm) => mm.key === "esign" && mm.configured === false)
      && (anyForm.methods || []).some((mm) => mm.configured === true),
    (anyForm.methods || []).map((mm) => mm.key + ":" + mm.configured).join(", "));
  check("no signatory is named in code — the rule is a role from configuration",
    Object.values(byForm).every((b) => !b.signatory || !/[A-Z][a-z]+ [A-Z][a-z]+/.test(b.signatory.role)),
    Object.values(byForm).map((b) => (b.signatory || {}).role).join(" | "));
});
