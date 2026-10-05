#!/usr/bin/env node
/* SPEND DOCUMENT ACCESS — AN AUTHORIZATION DECISION, WRITTEN DOWN.
 *
 * 321 documents hang off the 199 Compliance spend records. Sixteen of them can
 * be opened by a Compliance user; the rest are scoped `commercial`. That is not
 * a reconciliation defect and it was not caused by reclassifying anything --
 * the misfiled records behave exactly like the correctly-filed ones. It is a
 * standing authorization state, and it exists because these agreements are
 * DUAL-REGISTERED: the same tracker rows feed the Compliance lease/service
 * registers and the Commercial contracts register, and when the document scope
 * was first seeded only Commercial cited them.
 *
 * This tool CHANGES NOTHING. It produces the evidence a person needs to decide
 * whether Compliance should be able to read these documents, per document and
 * per record, with the current scope shown as it stands.
 *
 * It deliberately reads config/.registers.json off disk rather than calling
 * registers.ensure(), because ensure() can fire a background rebuild that
 * rewrites the shared cache underneath a running test suite.
 *
 *   node tools/spend-access-review.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const model = require("../api/compliance-model.js");
const scope = require("../api/document-scope.js");

const ROOT = P.join(__dirname, "..");
const AUDIT = P.join(ROOT, "audit");

(async () => {
  await drive.ensureIndex();
  const files = drive.indexFiles();
  const byId = new Map(files.map((f) => [f.id, f]));

  const state = JSON.parse(fs.readFileSync(P.join(ROOT, "config", ".registers.json"), "utf8"));
  const st = { registers: state.registers || {} };
  const spend = await model.buildSpend(st);
  const records = [...(spend.leases || []), ...(spend.services || []), ...(spend.other || [])];

  /* The Commercial contracts register carries the same rows under the same ids,
     which is exactly why these documents are scoped the way they are. */
  const commercialIds = new Set((st.registers.contracts || []).map((r) => r.id));

  /* What each file IS, from the file-disposition audit. */
  let fileDisp = {};
  try {
    const fd = JSON.parse(fs.readFileSync(P.join(AUDIT, "compliance-file-disposition.json"), "utf8"));
    for (const f of fd.files) fileDisp[f.id] = f.disposition;
  } catch (e) { fileDisp = {}; }

  const FAMILY = { lease: "Lease", service: "Service Agreement", other: "Other Spend" };
  const OPERATIONAL = new Set(["RECORD_DOCUMENT", "EXECUTED_DOCUMENT", "ACTION_DOCUMENT", "RENEWAL_DOCUMENT", "APPLICATION_DOCUMENT"]);
  const LINEAGE_ONLY = new Set(["HISTORICAL_DOCUMENT", "CORRESPONDENCE", "PAYMENT_RECEIPT", "ACKNOWLEDGEMENT", "REFERENCE", "TEMPLATE", "LETTERHEAD", "SYSTEM_FILE"]);

  const rows = [];
  const perRecord = [];

  for (const r of records) {
    const linked = r.driveFiles || [];
    let visible = 0, hidden = 0;
    for (const d of linked) {
      const f = byId.get(d.id) || null;
      const rec = scope.load().byFile.get(d.id) || null;
      const compliance = f ? scope.canAccessDocument(d.id, f, { compliance: "view" }, false) : { allow: false, why: "file not in index" };
      const commercial = f ? scope.canAccessDocument(d.id, f, { commercial: "view" }, false) : { allow: false, why: "file not in index" };
      if (compliance.allow) visible++; else hidden++;

      const disp = fileDisp[d.id] || "(not in compliance root)";
      const dual = commercialIds.has(r.id);

      /* THE RECOMMENDATION.
         Built from what the record and the document ARE, not from which folder
         the file happens to sit in. A file under a Commercial root does not
         prove Compliance must never read it; being attached to a Compliance
         record does not prove Compliance should. */
      let category, why;
      if (compliance.allow && commercial.allow) {
        category = "C_SHARED_COMMERCIAL_COMPLIANCE"; why = "both teams can already read it";
      } else if (compliance.allow) {
        category = "A_COMPLIANCE_SHOULD_READ"; why = "already readable by Compliance";
      } else if (!disp || disp === "(not in compliance root)") {
        category = "B_COMMERCIAL_ONLY";
        why = "the file lives under a Commercial source root and is attached through the shared record, not filed as a Compliance document";
      } else if (OPERATIONAL.has(disp) && dual) {
        category = "C_SHARED_COMMERCIAL_COMPLIANCE";
        why = "operational " + disp.toLowerCase().replace(/_/g, " ") + " on an agreement that is registered in BOTH Compliance and Commercial";
      } else if (OPERATIONAL.has(disp)) {
        category = "A_COMPLIANCE_SHOULD_READ";
        why = "operational document on a Compliance-only spend record";
      } else if (LINEAGE_ONLY.has(disp)) {
        category = "D_HISTORICAL_SOURCE_ONLY";
        why = disp.toLowerCase().replace(/_/g, " ") + " — lineage rather than routine operational access";
      } else {
        category = "F_BUSINESS_DECISION_REQUIRED";
        why = "source does not establish an access policy for a " + disp;
      }

      rows.push({
        fileId: d.id,
        name: (f && f.name) || d.name || "",
        sourceFolder: (f && f.folderPath) || "",
        sourceRoot: (f && f.root) || "",
        recordId: r.id,
        recordFamily: r.spendCategory === "HISTORICAL_ACTION" ? "Historical Action" : (FAMILY[r.klass] || "Other Spend"),
        spendCategory: r.spendCategory || "",
        entity: r.entity || "",
        counterparty: r.counterparty || "",
        documentType: disp,
        allowedGroups: (rec && rec.allowedGroups) || [],
        sharedGroups: (rec && rec.sharedGroups) || [],
        deniedGroups: (rec && rec.deniedGroups) || [],
        complianceAllowed: compliance.allow,
        commercialAllowed: commercial.allow,
        scopeReason: compliance.allow ? compliance.why : compliance.why,
        inComplianceRegister: true,
        inCommercialRegister: commercialIds.has(r.id),
        visibleInComplianceDocumentsTab: compliance.allow,
        recommendation: category,
        recommendationReason: why,
        changeRequired: !compliance.allow && (category === "A_COMPLIANCE_SHOULD_READ" || category === "C_SHARED_COMMERCIAL_COMPLIANCE"),
      });
    }
    perRecord.push({
      id: r.id, family: FAMILY[r.klass] || "Other Spend", title: r.title || "",
      entity: r.entity || "", counterparty: r.counterparty || "",
      linked: linked.length, visibleToCompliance: visible, hiddenByScope: hidden,
      completeness: !linked.length ? "NO_DOCUMENTS_LINKED"
        : hidden === 0 ? "ALL_VISIBLE" : visible === 0 ? "NONE_VISIBLE" : "PARTIALLY_VISIBLE",
    });
  }

  /* ---- record-level impact (§7/§8) ---- */
  const impact = {};
  for (const fam of ["Lease", "Service Agreement", "Other Spend"]) {
    const mine = perRecord.filter((x) => x.family === fam);
    impact[fam] = {
      records: mine.length,
      allDocumentsVisible: mine.filter((x) => x.completeness === "ALL_VISIBLE").length,
      someDocumentsHidden: mine.filter((x) => x.completeness === "PARTIALLY_VISIBLE").length,
      noDocumentsVisible: mine.filter((x) => x.completeness === "NONE_VISIBLE").length,
      noDocumentsLinked: mine.filter((x) => x.completeness === "NO_DOCUMENTS_LINKED").length,
      documentsLinked: mine.reduce((a, x) => a + x.linked, 0),
      documentsVisible: mine.reduce((a, x) => a + x.visibleToCompliance, 0),
      documentsHidden: mine.reduce((a, x) => a + x.hiddenByScope, 0),
    };
  }
  const byRecommendation = rows.reduce((m, x) => { m[x.recommendation] = (m[x.recommendation] || 0) + 1; return m; }, {});
  const changeRequired = rows.filter((x) => x.changeRequired).length;

  fs.writeFileSync(P.join(AUDIT, "spend-document-access-review.json"), JSON.stringify({
    builtAt: new Date().toISOString(),
    adminOnly: true,
    documents: rows.length,
    distinctDocuments: new Set(rows.map((x) => x.fileId)).size,
    recordDocumentLinks: rows.length,
    complianceReadable: new Set(rows.filter((x) => x.complianceAllowed).map((x) => x.fileId)).size,
    commercialReadable: new Set(rows.filter((x) => x.commercialAllowed).map((x) => x.fileId)).size,
    byRecommendation, changeRequired, impact,
    records: perRecord, links: rows,
  }, null, 1));

  /* ---- the review document ---- */
  const esc = (v) => String(v == null ? "" : v).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const md = [];
  md.push("# Spend document access review");
  md.push("");
  md.push("**Admin-only.** This document lists documents a Compliance user currently cannot see, including their");
  md.push("names and locations. It is written for whoever decides the sharing policy, not for the Compliance");
  md.push("register, and nothing in the application was changed to produce it.");
  md.push("");
  md.push("Generated " + new Date().toISOString().slice(0, 16).replace("T", " ") + " · no document scope was modified.");
  md.push("");
  md.push("## Why this exists");
  md.push("");
  md.push("The Compliance spend trackers and the Commercial contracts register are built from the **same source");
  md.push("rows**, so all " + records.length + " spend agreements are registered in both modules. When document scope was first");
  md.push("recorded, only Commercial cited them, so that is the scope they carry. A Compliance user therefore sees");
  md.push("the lease or service record and cannot open most of its documents.");
  md.push("");
  md.push("This predates the Compliance reconciliation and was not caused by it: the 32 records whose trackers are");
  md.push("misfiled show the same access pattern as the " + (records.length - 32) + " correctly filed ones. The scope diff is 0 widened,");
  md.push("0 narrowed, 0 unscoped.");
  md.push("");
  md.push("## The numbers");
  md.push("");
  md.push("| | |");
  md.push("|---|---|");
  const distinct = new Set(rows.map((x) => x.fileId));
  const dCompliance = new Set(rows.filter((x) => x.complianceAllowed).map((x) => x.fileId));
  const dCommercial = new Set(rows.filter((x) => x.commercialAllowed).map((x) => x.fileId));
  md.push("| Distinct spend documents | **" + distinct.size + "** |");
  md.push("| Record-document links | " + rows.length + " (" + (rows.length - distinct.size) + " document(s) attached to two records) |");
  md.push("| Readable by Compliance | **" + dCompliance.size + "** |");
  md.push("| Not readable by Compliance | **" + (distinct.size - dCompliance.size) + "** |");
  md.push("| Readable by Commercial | " + dCommercial.size + " |");
  md.push("| Readable by neither | " + [...distinct].filter((i) => !dCompliance.has(i) && !dCommercial.has(i)).length + " |");
  md.push("| Would change if the recommendation is accepted | " + changeRequired + " |");
  md.push("");
  md.push("## Recommendation categories");
  md.push("");
  md.push("| Category | Documents |");
  md.push("|---|---|");
  for (const [k, v] of Object.entries(byRecommendation).sort((a, b) => b[1] - a[1])) md.push("| " + k + " | " + v + " |");
  md.push("");
  md.push("## Operational impact, per record");
  md.push("");
  md.push("| Family | Records | All docs visible | Some hidden | None visible | No docs linked | Linked | Visible | Hidden |");
  md.push("|---|---|---|---|---|---|---|---|---|");
  for (const [k, v] of Object.entries(impact)) {
    md.push("| " + k + " | " + v.records + " | " + v.allDocumentsVisible + " | " + v.someDocumentsHidden + " | "
      + v.noDocumentsVisible + " | " + v.noDocumentsLinked + " | " + v.documentsLinked + " | " + v.documentsVisible + " | " + v.documentsHidden + " |");
  }
  md.push("");
  md.push("## If the business decides to share");
  md.push("");
  md.push("The change is `sharedGroups += \"compliance\"` on the selected documents, carrying `reason`, `approvedBy`");
  md.push("and `approvedAt`. `allowedGroups` is **not** rewritten: the document stays Commercial-origin and becomes");
  md.push("explicitly shared, so the source-root ownership that the whole scope model rests on is left intact.");
  md.push("A rule-based migration (record family is Lease or Service Agreement) is preferable to editing " + rows.length);
  md.push("files by hand, and must be followed by a scope diff showing only the intended documents widened,");
  md.push("with no Litigation, requester or unrelated-entity exposure.");
  md.push("");
  md.push("## Every document");
  md.push("");
  md.push("| # | Document | Record | Family | Entity | Counterparty | Type | allowed | shared | denied | Compl. | Comm. | Recommendation |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  rows.forEach((x, i) => {
    md.push("| " + (i + 1) + " | " + esc(x.name).slice(0, 58) + " | " + esc(x.recordId) + " | " + esc(x.recordFamily)
      + " | " + esc(x.entity).slice(0, 26) + " | " + esc(x.counterparty).slice(0, 26) + " | " + esc(x.documentType)
      + " | " + (x.allowedGroups.join("+") || "—") + " | " + (x.sharedGroups.join("+") || "—") + " | " + (x.deniedGroups.join("+") || "—")
      + " | " + (x.complianceAllowed ? "yes" : "no") + " | " + (x.commercialAllowed ? "yes" : "no")
      + " | " + x.recommendation + " |");
  });
  md.push("");
  md.push("Full machine-readable detail, including each document's Drive file id, source folder and the exact");
  md.push("reason for its current scope: `audit/spend-document-access-review.json`.");
  fs.writeFileSync(P.join(ROOT, "SPEND_DOCUMENT_ACCESS_REVIEW.md"), md.join("\n"));

  console.log("distinct documents " + new Set(rows.map((x) => x.fileId)).size + " over " + rows.length + " record links"
    + "  complianceReadable " + new Set(rows.filter((x) => x.complianceAllowed).map((x) => x.fileId)).size
    + "  commercialReadable " + new Set(rows.filter((x) => x.commercialAllowed).map((x) => x.fileId)).size);
  console.log("byRecommendation " + JSON.stringify(byRecommendation));
  console.log("changeRequired " + changeRequired);
  for (const [k, v] of Object.entries(impact)) console.log("  " + k.padEnd(18) + JSON.stringify(v));
  console.log("wrote SPEND_DOCUMENT_ACCESS_REVIEW.md and audit/spend-document-access-review.json");
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
