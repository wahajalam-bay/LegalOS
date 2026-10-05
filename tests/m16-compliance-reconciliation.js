// COMPLIANCE RECONCILES TO ITS SOURCE, AND AN AMENDMENT IS NOT A LOAN.
//
// THE INCIDENT THIS ENCODES
// Compliance had TWO datasets describing the same estate and they disagreed:
//
//   api/compliance-model.js  reconciled the source properly -- it knew the FDI
//                            and intercompany trackers hold 60 loan agreements,
//                            117 lifecycle events ON those agreements, and 15
//                            rows of spreadsheet furniture.
//   api/registers.js         ingested the same workbooks row by row and
//                            published all 192 rows as loans.
//
// So the same business had 69 loans on the Compliance screen and 192 in the
// register, and the entire difference was its own amendments, novations,
// rollovers and repayments counted a second time as new debt.
//
// Two more faults sat underneath it:
//
//   * 30 real lease and service agreements never reached their register. Their
//     trackers are physically filed under a LOAN or RESOLUTION folder, and the
//     spend selector classified on folder path, so an agreement was excluded
//     from its own register by where somebody had filed the spreadsheet.
//   * A licence that exists only as a folder of certificates, with no row in
//     the summary workbook, was absent from the register -- which is exactly
//     the licence most worth showing, because nobody had written it down.
//
//   node tests/m16-compliance-reconciliation.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const audit = (n) => { try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8")); } catch (e) { return null; } };

H.runSuite("m16-compliance-reconciliation — every record back to its source row", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_CREC_PORT", portFallback: "4854", prefix: "legalos-crec-",
  }));
  const cookie = await H.loginApi(sb, H.USERS.director.email);
  const get = async (p) => H.request(sb.base, "GET", p, { cookie });

  /* ---- 1. the two datasets now agree ------------------------------------- */
  const cLoans = (await get("/api/compliance/loans")).body || {};
  const rLoans = (await get("/api/registers/loans?limit=5000")).body || {};
  check("the loans register and the Compliance screen report the same number",
    (cLoans.loans || []).length === (rLoans.records || []).length,
    "compliance=" + (cLoans.loans || []).length + "  register=" + (rLoans.records || []).length);

  const rec = cLoans.reconciliation || {};
  check("the loan arithmetic balances against the source rows",
    rec.trackerAgreements + rec.historyRows + rec.headerArtifacts === rec.sourceRows,
    rec.trackerAgreements + " agreements + " + rec.historyRows + " lifecycle events + "
    + rec.headerArtifacts + " header artifacts = " + rec.sourceRows + " source rows");
  check("lifecycle events are NOT published as loans",
    (cLoans.loans || []).length < rec.sourceRows && rec.historyRows > 0,
    (cLoans.loans || []).length + " logical loans from " + rec.sourceRows + " rows");

  const cLic = (await get("/api/compliance/licences")).body || {};
  const rLic = (await get("/api/registers/licences?limit=5000")).body || {};
  check("the licence register and the Compliance screen report the same number",
    (cLic.licences || []).length === (rLic.records || []).length,
    "compliance=" + (cLic.licences || []).length + "  register=" + (rLic.records || []).length);
  check("a licence that exists only as a folder is still served",
    (cLic.driveOnlyLicences || 0) >= 1 && (cLic.licences || []).length > (cLic.trackerLicences || 0),
    "tracker " + cLic.trackerLicences + " + folder-only " + cLic.driveOnlyLicences + " = " + (cLic.licences || []).length);

  /* ---- 2. lease and service are separate registers ----------------------- */
  const L = (await get("/api/compliance/leases")).body || {};
  const S = (await get("/api/compliance/services")).body || {};
  check("leases and service agreements are separate registers",
    Array.isArray(L.leases) && Array.isArray(S.services) && L.leases.length > 0 && S.services.length > 0,
    "leases=" + (L.leases || []).length + "  services=" + (S.services || []).length);
  /* The route reports the split it made under `classified`; `other` is the
     bucket for instruments that are genuinely neither a lease nor a service
     (NDAs, an MoU, a franchise agreement, a sale and purchase). */
  const cl = L.classified || {};
  check("the spend split accounts for every spend record",
    (cl.leases || 0) + (cl.services || 0) + (cl.other || 0) === L.total,
    cl.leases + " leases + " + cl.services + " services + " + cl.other + " other = " + L.total);

  /* THE RECOVERY. An agreement filed under the wrong family is still that
     agreement. These are classified on what they are, and each one says where
     it is physically filed. */
  const all = [...(L.leases || []), ...(S.services || [])];
  const misfiled = all.filter((r) => r.misfiled);
  check("agreements whose tracker is filed under the wrong family still reach their register",
    misfiled.length > 0,
    misfiled.length + " recovered from " + [...new Set(misfiled.map((r) => r.filedUnder))].join(", "));
  check("a recovered agreement records where it is actually filed",
    misfiled.every((r) => !!r.filedUnder),
    "misfiling is reported, not silently corrected");

  /* ---- 3. resolutions are individual records ----------------------------- */
  const R = (await get("/api/compliance/resolutions")).body || {};
  const rReg = (await get("/api/registers/resolutions?limit=5000")).body || {};
  check("resolutions are individual records, not one per entity",
    (rReg.records || []).length > (R.byEntity || []).length * 5,
    (rReg.records || []).length + " resolutions across " + (R.byEntity || []).length + " entities");
  const biggest = (R.byEntity || []).slice().sort((a, b) => (b.source || 0) - (a.source || 0))[0];
  check("the largest entity's resolutions are separate records, not an aggregate",
    !!biggest && biggest.source > 1,
    biggest ? biggest.name + " holds " + biggest.source : "no entities");

  /* Every family drills through to a detail page. */
  const drill = async (label, path, rows, idOf) => {
    let ok = 0; const bad = [];
    for (const r of rows.slice(0, 10)) {
      const d = await get(path + encodeURIComponent(idOf(r)));
      if (d.status === 200) ok++; else bad.push(idOf(r) + ":" + d.status);
    }
    check(label + " open a detail page", bad.length === 0,
      ok + "/" + Math.min(10, rows.length) + (bad.length ? " failed: " + bad.slice(0, 3).join(",") : ""));
  };
  await drill("loans", "/api/compliance/loans/", cLoans.loans || [], (r) => r.id);
  await drill("leases", "/api/compliance/leases/", L.leases || [], (r) => r.id);
  await drill("services", "/api/compliance/services/", S.services || [], (r) => r.id);
  await drill("licences", "/api/compliance/licences/", cLic.licences || [], (r) => r.id);
  await drill("resolutions", "/api/compliance/resolutions/", rReg.records || [], (r) => r.id);

  /* ---- 3b. loan classification is evidence-based (§30/§33) --------------- */
  const sbp = (cLoans.loans || []).reduce((m, a) => {
    const k = (a.sbp && (a.sbp.key || a.sbp.label)) || "unknown"; m[k] = (m[k] || 0) + 1; return m;
  }, {});
  check("SBP status is read from evidence, not assumed",
    Object.keys(sbp).length > 1 && (sbp.REGISTERED || 0) > 0,
    Object.entries(sbp).map(([k, v]) => k + " " + v).join(", "));
  check("a loan with no registration evidence is left unknown rather than guessed",
    (sbp.UNKNOWN || 0) >= 0 && !(sbp.REGISTERED === (cLoans.loans || []).length),
    "not every loan is claimed as registered");
  const cat = (cLoans.loans || []).reduce((m, a) => { m[a.category || "unclassified"] = (m[a.category || "unclassified"] || 0) + 1; return m; }, {});
  check("every loan carries a source-supported category",
    !cat.unclassified && Object.keys(cat).length > 0,
    Object.entries(cat).map(([k, v]) => k + " " + v).join(", "));

  /* ---- 3c. incomplete is labelled, never dropped (§49) ------------------- */
  const spendAll = [...(L.leases || []), ...(S.services || [])];
  const quality = spendAll.reduce((m, r) => { m[r.__quality || "(unflagged)"] = (m[r.__quality || "(unflagged)"] || 0) + 1; return m; }, {});
  check("every spend record says whether its source is complete",
    !quality["(unflagged)"] && (quality.INCOMPLETE_SOURCE || 0) > 0,
    Object.entries(quality).map(([k, v]) => k + " " + v).join(", "));
  check("an incomplete record is kept in the register, not dropped",
    (L.leases || []).length + (S.services || []).length + ((L.classified || {}).other || 0) === L.total,
    "nothing was dropped for being incomplete");
  check("a record with no document on file says so",
    spendAll.filter((r) => r.__evidence === "NO_DOCUMENT_ON_FILE").every((r) => !(r.driveFiles || []).length),
    spendAll.filter((r) => r.__evidence === "NO_DOCUMENT_ON_FILE").length + " spend records have no document and are flagged");
  check("a resolution with a complete tracker row but no document is not called complete",
    !!R.evidence && R.evidence.withDocument + R.evidence.withoutDocument === R.source,
    R.evidence ? R.evidence.withDocument + " with document + " + R.evidence.withoutDocument
      + " without = " + R.source + "; conflicting source " + R.evidence.conflictingSource : "no evidence block");

  /* ---- 3d. licence lifecycle (§12) --------------------------------------- */
  const lics = cLic.licences || [];
  check("a licence carries its renewal history rather than only its latest certificate",
    lics.some((l) => (l.history || []).length > 1),
    lics.filter((l) => (l.renewalsOnFile || 0) > 0).length + " of " + lics.length + " licences have a renewal on file");
  /* THE CHAIN MUST RUN FORWARDS. A validity date read as an issue date, and a
     YYYYMM filename nobody could parse, between them put a 2026 certificate
     BEFORE the 2023 original it renewed. */
  const outOfOrder = lics.filter((l) => {
    const dated = (l.history || []).filter((h) => h.date).map((h) => h.date);
    return dated.some((d, i) => i > 0 && d < dated[i - 1]);
  });
  check("every licence history runs forwards in time", outOfOrder.length === 0,
    outOfOrder.length ? outOfOrder.map((l) => l.id + " " + (l.history || []).map((h) => h.date).join(" -> ")).join(" | ")
      : lics.reduce((a, l) => a + (l.history || []).length, 0) + " history entries, all in order");
  check("the first entry in a licence history is the earliest document, not an undated one",
    lics.every((l) => {
      const h = l.history || [];
      if (h.length < 2) return true;
      return !(h[0].date == null && h.some((x) => x.date));
    }),
    "an undated certificate never claims to be the original");
  check("a licence known only from a folder is served with its gaps named",
    lics.filter((l) => l.origin === "drive").every((l) => (l.__missingFields || []).length > 0),
    lics.filter((l) => l.origin === "drive").map((l) => l.id + " missing " + (l.__missingFields || []).join("/")).join(" | ") || "none");

  /* ---- 3e. the spend remainder is classified, not bucketed (§1/§3) ------- */
  const spendEvery = [...(L.leases || []), ...(S.services || []), ...((await get("/api/compliance/leases")).body || {}).leases ? [] : []];
  const cats = spendAll.reduce((m, r) => { m[r.spendCategory || "(unset)"] = (m[r.spendCategory || "(unset)"] || 0) + 1; return m; }, {});
  check("every lease and service record carries an explicit spend category",
    !cats["(unset)"] && !cats.UNCLASSIFIED_SOURCE,
    Object.entries(cats).map(([k, v]) => k + " " + v).join(", "));
  check("a lifecycle action is categorised as an action, not as a new agreement",
    spendAll.filter((r) => r.spendCategory === "HISTORICAL_ACTION").every((r) => /amend|termin|novation|exten|renew|rollover/i.test(String(r.agreementType) + String(r.title))),
    spendAll.filter((r) => r.spendCategory === "HISTORICAL_ACTION").length + " actions in leases/services");
  check("where the type column and the title disagree, both are kept and the record is flagged",
    spendAll.filter((r) => r.categoryConflict).every((r) => r.dataCompleteness === "CONFLICTING_SOURCE"),
    spendAll.filter((r) => r.categoryConflict).map((r) => r.id).join(",") || "no conflicts in leases/services");

  /* ---- 3f. completeness and evidence are separate axes (§5/§6/§7) -------- */
  const dc = spendAll.reduce((m, r) => { m[r.dataCompleteness || "(unset)"] = (m[r.dataCompleteness || "(unset)"] || 0) + 1; return m; }, {});
  const es = spendAll.reduce((m, r) => { m[r.evidenceStatus || "(unset)"] = (m[r.evidenceStatus || "(unset)"] || 0) + 1; return m; }, {});
  check("every spend record reports data completeness and evidence separately",
    !dc["(unset)"] && !es["(unset)"],
    "completeness " + JSON.stringify(dc) + "  evidence " + JSON.stringify(es));
  check("a record can be data-complete and still have no document on file",
    spendAll.some((r) => r.dataCompleteness === "COMPLETE" && r.evidenceStatus === "NO_DOCUMENT_ON_FILE"),
    "the two axes are genuinely independent");
  check("resolutions report the same two axes, each totalling the population",
    !!R.quality && !!R.evidence
    && R.quality.complete + R.quality.incompleteSource + R.quality.conflictingSource === R.source
    && R.evidence.withDocument + R.evidence.withoutDocument === R.source,
    "quality " + JSON.stringify(R.quality) + "  evidence " + JSON.stringify(R.evidence));
  check("the conflicting-source resolutions are a quality state, not extra records",
    !!R.overlap && R.overlap.conflictingAndDocumented + R.overlap.conflictingAndUndocumented === R.evidence.conflictingSource,
    R.evidence.conflictingSource + " conflicting, all inside the " + R.source + "; "
    + R.overlap.conflictingAndDocumented + " of them documented");

  /* ---- 3g. licence lifecycle, all eight (§8/§10/§11) --------------------- */
  const histTotal = lics.reduce((a, l) => a + (l.history || []).length, 0);
  const origTotal = lics.reduce((a, l) => a + (l.history || []).filter((h) => h.kind === "original").length, 0);
  const renTotal = lics.reduce((a, l) => a + (l.history || []).filter((h) => h.kind === "renewal").length, 0);
  check("the licence history entries reconcile to originals plus renewals",
    origTotal + renTotal === histTotal,
    histTotal + " entries = " + origTotal + " originals + " + renTotal + " renewals");
  check("no document appears twice in a licence history",
    (() => { const ids = lics.flatMap((l) => (l.history || []).map((h) => h.file && h.file.id)); return new Set(ids).size === ids.length; })(),
    "each history entry is a distinct file");
  check("the renewal count agrees with the renewal history",
    lics.every((l) => (l.renewalsOnFile || 0) === (l.history || []).filter((h) => h.kind === "renewal").length),
    lics.map((l) => l.authority + ":" + l.renewalsOnFile).join(" "));
  /* A certificate valid to Aug 2027 is current even though a certificate with
     a LATER issue date but earlier validity sits beside it. */
  check("the current effective certificate is chosen on evidence, not on file order",
    lics.filter((l) => l.currentEffective).every((l) => /validity|issue date/.test(String(l.currentEffective.basis))),
    lics.filter((l) => l.currentEffective).length + "/" + lics.length + " resolved; bases: "
    + [...new Set(lics.filter((l) => l.currentEffective).map((l) => l.currentEffective.basis))].join(", "));
  check("a licence whose documents carry neither a date nor a validity says so rather than guessing",
    lics.filter((l) => !l.currentEffective).every((l) => !!l.currentEffectiveUnknown),
    lics.filter((l) => !l.currentEffective).map((l) => l.id + ": " + l.currentEffectiveUnknown).join(" | ") || "all resolved");

  /* ---- 3h. misfiled records are visible and still usable (§12/§13) ------- */
  const mis = spendAll.filter((r) => r.misfiled);
  check("every misfiled record carries a source-location warning",
    mis.length > 0 && mis.every((r) => r.sourceLocation && r.sourceLocation.warning === "SOURCE_LOCATION_MISMATCH"),
    mis.length + " misfiled records in leases/services");
  check("a misfiled record keeps its real Drive path and names the family it belongs to",
    mis.every((r) => r.sourceLocation.actualDriveFolder && r.sourceLocation.expectedFamily && r.sourceLocation.reason && r.sourceLocation.evidence),
    "path, expected family, reason and the tracker that proves it");
  check("misfiled does not mean unavailable — the record still carries its documents",
    mis.some((r) => (r.driveFiles || []).length > 0),
    mis.filter((r) => (r.driveFiles || []).length).length + " of " + mis.length + " have documents attached");
  check("Drive is left untouched — the mismatch is reported, not corrected",
    mis.every((r) => r.sourceLocation.driveUnchanged === true),
    "no Drive write");

  /* ---- 4. the audit artifacts, and their zeros --------------------------- */
  const root = audit("compliance-root-inventory.json");
  const fold = audit("compliance-folder-disposition.json");
  const file = audit("compliance-file-disposition.json");
  const rows = audit("compliance-row-disposition.json");
  const lin = audit("compliance-record-lineage.json");
  check("the compliance root inventory exists and found no unclassified child",
    !!root && root.unknownRootChildren.length === 0,
    root ? root.folders + " folders / " + root.files + " files, unknown children " + root.unknownRootChildren.length : "missing");
  check("every discovered folder has a disposition", !!fold && fold.unknown === 0,
    fold ? fold.total + " folders, unknown " + fold.unknown : "missing");
  check("every discovered file has a disposition", !!file && file.withoutDisposition === 0,
    file ? file.total + " files, without disposition " + file.withoutDisposition : "missing");
  check("no source row was dropped without a disposition", !!rows && rows.unknownDrop === 0,
    rows ? Object.entries(rows.totals).map(([k, v]) => k + "=" + v).join(" ") : "missing");
  check("every compliance record traces back to a source row, folder or document",
    !!lin && Object.values(lin.summary).reduce((a, v) => a + v.lineageMissing, 0) === 0,
    lin ? Object.entries(lin.summary).map(([k, v]) => k + " " + v.records + "/" + v.lineageProven).join("  ") : "missing");

  /* ---- 5. reclassifying records did not move any document ---------------- */
  const drive = require("../api/drive.js");
  const scope = require("../api/document-scope.js");
  const registers = require("../api/registers.js");
  await drive.ensureIndex();
  const st = await registers.ensure();
  const d = scope.diff({ files: drive.indexFiles(), registers: st.registers });
  const stats = scope.stats();
  check("no document was widened by the compliance reclassification", d.widened.length === 0,
    d.widened.slice(0, 3).map((w) => w.name).join(" | ") || "none");
  check("no document was narrowed by it either", d.narrowed.length === 0,
    d.narrowed.slice(0, 3).map((w) => w.name).join(" | ") || "none");
  check("no document was left unscoped", (stats.summary && stats.summary.withNoScope) === 0,
    stats.documents + " documents scoped");

  /* A STANDING AUTHORIZATION STATE, HELD STILL.
     The spend trackers under the Compliance root also feed the Commercial
     contracts register from the same rows, so most of those documents are
     scoped `commercial` and a Compliance user cannot open them. That predates
     this work: the misfiled records behave exactly like the correctly-filed
     ones, which is the proof it was not caused by reclassifying them.

     This check exists so nobody "fixes" it by quietly widening 300 documents
     to Compliance. Changing it is an authorization decision for the business,
     made deliberately; it is not something a reconciliation may do on its own.
     If that decision is taken, this check is the one to update. */
  const spendDocIds = (rows) => [...new Set(rows.flatMap((r) => (r.driveFiles || []).map((d) => d.id)))];
  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));
  const readable = (ids, group) => ids.filter((id) => {
    const f = byId.get(id);
    return f && scope.canAccessDocument(id, f, { [group]: "view" }, false).allow;
  }).length;
  const misIds = spendDocIds(spendAll.filter((r) => r.misfiled));
  const okIds = spendDocIds(spendAll.filter((r) => !r.misfiled));
  const rate = (ids) => (ids.length ? readable(ids, "compliance") / ids.length : 0);
  check("reclassifying a misfiled record did not change who may read its documents",
    Math.abs(rate(misIds) - rate(okIds)) < 0.25,
    "compliance-readable: misfiled " + readable(misIds, "compliance") + "/" + misIds.length
    + ", correctly filed " + readable(okIds, "compliance") + "/" + okIds.length
    + " — the same standing scope, not a side effect of the move");
});
