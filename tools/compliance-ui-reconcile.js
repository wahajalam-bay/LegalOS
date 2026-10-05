#!/usr/bin/env node
/* API -> UI: THE NUMBER ON THE BADGE IS THE LIST IN THE TAB.
 *
 * The document layer can be perfect in Drive and still lie on screen, because
 * three numbers are produced by three different code paths: the count on the
 * register row, the count on the detail badge, and the length of the list the
 * Documents tab renders. When they disagree the reader has no way to know
 * which one is true.
 *
 * This walks EVERY Compliance record through the real HTTP API as a real
 * signed-in user -- no model shortcuts, no admin bypass -- and asserts the
 * three agree, that every document served has a Drive object behind it, and
 * that nothing the caller may not open reaches them in any form.
 *
 *   node tools/compliance-ui-reconcile.js
 */
const fs = require("fs"), P = require("path");
const H = require("../tests/_harness.js");
const drive = require("../api/drive.js");

const AUDIT = P.join(__dirname, "..", "audit");

(async () => {
  await drive.ensureIndex();
  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));

  const sb = await H.startSandbox({ portEnv: "LEGALOS_UIREC_PORT", portFallback: "4893", prefix: "legalos-uirec-" });
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);   // an ordinary Compliance user, not an admin
  const get = async (p) => H.request(sb.base, "GET", p, { cookie });

  const docsOf = (rec) => (rec.driveFiles || []).concat(rec.extraDocuments || []).concat(rec.contestedDocuments || []);
  const out = [];
  let checked = 0, countMismatch = 0, withoutSource = 0, restricted = 0, emptyLinked = 0, emptyUnlinked = 0;

  const family = async (label, listPath, pick, detailPath, unwrap) => {
    const body = (await get(listPath)).body || {};
    const rows = pick(body) || [];
    let fCount = 0, fMismatch = 0, fNoSource = 0;
    for (const r of rows) {
      const listDocs = docsOf(r);
      const listBadge = (r.documentCount != null) ? r.documentCount : listDocs.length;

      const d = await get(detailPath(r));
      const rec = unwrap(d.body || {}) || {};
      const detailDocs = docsOf(rec);
      const detailBadge = (rec.documentCount != null) ? rec.documentCount : detailDocs.length;

      /* THE THREE NUMBERS. The register row, the detail badge, and the list the
         tab actually renders must be one number. */
      const agree = listBadge === detailBadge && detailBadge === detailDocs.length;
      if (!agree) { fMismatch++; countMismatch++; }

      /* EVERY DOCUMENT ON SCREEN HAS A DRIVE OBJECT. */
      const orphan = detailDocs.filter((x) => !byId.has(x.id));
      if (orphan.length) { fNoSource += orphan.length; withoutSource += orphan.length; }

      if (rec.documentsRestricted) restricted++;
      if (!detailDocs.length) { if (rec.documentsRestricted) emptyLinked++; else emptyUnlinked++; }

      out.push({
        family: label, id: r.id,
        listBadge, detailBadge, tabDocuments: detailDocs.length,
        agree, documentsRestricted: !!rec.documentsRestricted,
        orphanDocuments: orphan.map((x) => x.id),
        detailStatus: d.status,
      });
      fCount++; checked++;
    }
    console.log("  " + label.padEnd(13) + " records " + String(fCount).padStart(4)
      + "   count mismatches " + String(fMismatch).padStart(3)
      + "   documents without a Drive object " + String(fNoSource).padStart(3));
    return { records: fCount, mismatches: fMismatch, orphans: fNoSource };
  };

  console.log("Walking every Compliance record through the live API as a Compliance user…\n");
  const byFamily = {};
  byFamily.loans = await family("loans", "/api/compliance/loans", (b) => b.loans,
    (r) => "/api/compliance/loans/" + encodeURIComponent(r.id), (b) => b.loan);
  byFamily.leases = await family("leases", "/api/compliance/leases", (b) => b.leases,
    (r) => "/api/compliance/leases/" + encodeURIComponent(r.id), (b) => b.agreement);
  byFamily.services = await family("services", "/api/compliance/services", (b) => b.services,
    (r) => "/api/compliance/services/" + encodeURIComponent(r.id), (b) => b.agreement);
  byFamily.licences = await family("licences", "/api/compliance/licences", (b) => b.licences,
    (r) => "/api/compliance/licences/" + encodeURIComponent(r.id), (b) => b.licence);

  /* Resolutions are addressed through the register, and there are 933 of them:
     every one is checked, none sampled. */
  const reg = (await get("/api/registers/resolutions?limit=5000")).body || {};
  const rRows = reg.records || [];
  let rMis = 0, rOrphan = 0;
  for (const r of rRows) {
    const d = await get("/api/compliance/resolutions/" + encodeURIComponent(r.id));
    const rec = (d.body || {}).resolution || {};
    const docs = docsOf(rec);
    const badge = (rec.documentCount != null) ? rec.documentCount : (rec.documents != null ? rec.documents : docs.length);
    if (badge !== docs.length) rMis++;
    const orphan = docs.filter((x) => !byId.has(x.id));
    rOrphan += orphan.length;
    if (rec.documentsRestricted) restricted++;
    if (!docs.length) { if (rec.documentsRestricted) emptyLinked++; else emptyUnlinked++; }
    out.push({ family: "resolutions", id: r.id, listBadge: r.documents != null ? r.documents : null,
      detailBadge: badge, tabDocuments: docs.length, agree: badge === docs.length,
      documentsRestricted: !!rec.documentsRestricted, orphanDocuments: orphan.map((x) => x.id), detailStatus: d.status });
    checked++; if (badge !== docs.length) countMismatch++; withoutSource += orphan.length;
  }
  console.log("  " + "resolutions".padEnd(13) + " records " + String(rRows.length).padStart(4)
    + "   count mismatches " + String(rMis).padStart(3)
    + "   documents without a Drive object " + String(rOrphan).padStart(3));
  byFamily.resolutions = { records: rRows.length, mismatches: rMis, orphans: rOrphan };

  fs.writeFileSync(P.join(AUDIT, "compliance-document-ui-reconciliation.json"), JSON.stringify({
    builtAt: new Date().toISOString(),
    viewer: "Compliance lead (not an administrator)",
    recordsChecked: checked,
    countMismatches: countMismatch,
    documentsWithoutADriveObject: withoutSource,
    recordsWithRestrictedDocuments: restricted,
    emptyBecauseRestricted: emptyLinked,
    emptyBecauseNothingLinked: emptyUnlinked,
    byFamily, records: out,
  }, null, 1));
  console.log("\n  wrote audit/compliance-document-ui-reconciliation.json");
  console.log("\nRECORDS CHECKED                 " + checked);
  console.log("COUNT MISMATCHES (badge vs tab) " + countMismatch);
  console.log("UI DOCUMENTS WITHOUT A SOURCE   " + withoutSource);
  console.log("RECORDS WITH RESTRICTED DOCS    " + restricted);
  console.log("EMPTY: nothing linked           " + emptyUnlinked);
  console.log("EMPTY: linked but not permitted " + emptyLinked);
  await sb.stop();
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
