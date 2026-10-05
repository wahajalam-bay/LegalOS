// SPEND-COMPLIANCE-SHARE-V1 — A BUSINESS-APPROVED SHARE, AND ITS LIMITS.
//
// WHY THIS POLICY EXISTS
// The Compliance spend registers and the Commercial contracts register are
// built from the SAME source rows, so every spend agreement is registered in
// both modules. Their documents were scoped `commercial`, because that is who
// cited them when scope was first recorded — so 163 of 199 Compliance records
// opened with an empty Documents tab while 323 documents sat correctly linked
// behind them.
//
// The business reviewed the evidence and approved sharing the documents
// classified C_SHARED_COMMERCIAL_COMPLIANCE. This suite is the standing proof
// that the approved share happened AND that it stopped exactly where it was
// told to.
//
// THE PART THAT MATTERS MOST is the second half. A bulk share is the easiest
// way in this codebase to widen something nobody meant to widen, so the
// negative cases are first-class: Commercial-only documents stay Commercial,
// historical/lineage documents stay out of ordinary Compliance hands,
// Litigation gains nothing, and a requester gains nothing.
//
//   node tests/m17-spend-sharing-policy.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const review = (() => {
  try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "spend-document-access-review.json"), "utf8")); }
  catch (e) { return null; }
})();

/* Representative documents, addressed by STABLE DRIVE ID rather than by name,
   so renaming a file in Drive can never move it between policy categories. */
const FIXTURES = {
  sharedLease: "1su3g8X9UbdwrZEexuNACHZKokePWf0cv",      // Lease agreement, approved share
  sharedAmendment: "1rx1aiWtHEaGUxu8xz7xqMRG2MqKaq0Zv",  // Lease amendment, approved share
  alreadyCompliance: "1Q-hCujXFVzDqJFOS1KKxwI0ezUXnUiWS", // already Compliance-readable
  commercialOnly: "1zrjXluyC6Xsa7CyDQE5fa6Q5Qjp_9x-D",   // NOT approved — stays Commercial
  commercialOnly2: "1QqoFmiij6vqSXz8bjecdLHJOdGh-nA9p",  // NOT approved — stays Commercial
  historicalOnly: "1HpPRxQZOMwPWd_oCq_BulTK9luPnSZQs",   // NOT approved — lineage only
  receiptOnly: "15HkoLKNqQLE2I_qzlKBXr0j4SBSbQS56",      // NOT approved — payment receipt
};

H.runSuite("m17-spend-sharing-policy — the approved share, and everything it must not touch", async (ctx) => {
  const { check } = ctx;
  const drive = require("../api/drive.js");
  const scope = require("../api/document-scope.js");
  await drive.ensureIndex();
  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));

  const may = (id, group) => {
    const f = byId.get(id);
    if (!f) return null;
    return scope.canAccessDocument(id, f, { [group]: "view" }, false).allow;
  };
  const rec = (id) => scope.load().byFile.get(id) || null;

  /* ---- 1. the policy was applied, and says who approved it -------------- */
  const applied = (() => {
    try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "spend-compliance-share-applied.json"), "utf8")); }
    catch (e) { return null; }
  })();
  check("the sharing policy was applied and recorded", !!applied && applied.applied === true,
    applied ? applied.policyId + ": " + applied.shared + " documents shared, approved by " + applied.approvedBy : "no applied record");
  check("the approved set matched the review before anything was written",
    !!applied && applied.approvedLinks === 297 && applied.approvedDocuments === 295,
    applied ? applied.approvedLinks + " links = " + applied.approvedDocuments + " distinct documents" : "-");
  check("the promotion diff widened Compliance only",
    !!applied && applied.diff.widened.compliance === applied.shared
    && applied.diff.widened.commercial === 0 && applied.diff.widened.litigation === 0 && applied.diff.widened.requester === 0,
    applied ? JSON.stringify(applied.diff.widened) : "-");
  check("nothing was narrowed and nothing was left unscoped",
    !!applied && Object.values(applied.diff.narrowed).every((n) => n === 0) && applied.diff.unscopedAfter === 0,
    applied ? "narrowed " + JSON.stringify(applied.diff.narrowed) + "  unscoped " + applied.diff.unscopedAfter : "-");

  /* ---- 2. ownership was NOT rewritten (§1/§10) -------------------------- */
  const shared = rec(FIXTURES.sharedLease);
  check("a shared document keeps its Commercial ownership",
    !!shared && (shared.allowedGroups || []).includes("commercial"),
    shared ? "allowedGroups=" + JSON.stringify(shared.allowedGroups) : "not scoped");
  check("...and gains Compliance only as an explicit SHARE",
    !!shared && (shared.sharedGroups || []).includes("compliance"),
    shared ? "sharedGroups=" + JSON.stringify(shared.sharedGroups) : "-");
  check("the share carries its policy, reason, approver and timestamp",
    !!shared && shared.sharePolicy && shared.sharePolicy.policyId === "SPEND-COMPLIANCE-SHARE-V1"
    && !!shared.sharePolicy.reason && !!shared.sharePolicy.approvedBy && !!shared.sharePolicy.approvedAt,
    shared && shared.sharePolicy ? shared.sharePolicy.policyId + " by " + shared.sharePolicy.approvedBy : "no sharePolicy");

  /* ---- 3. the approved documents are readable by BOTH ------------------- */
  for (const [label, id] of [["a lease agreement", FIXTURES.sharedLease], ["a lease amendment", FIXTURES.sharedAmendment]]) {
    check(label + " is readable by Compliance", may(id, "compliance") === true, id);
    check(label + " is still readable by Commercial", may(id, "commercial") === true, "ownership unchanged");
    check(label + " is NOT readable by Litigation", may(id, "litigation") === false, "no cross-module leak");
    check(label + " is NOT readable by a requester", may(id, "requester") === false, "no requester leak");
  }
  check("a document Compliance could already read is unchanged",
    may(FIXTURES.alreadyCompliance, "compliance") === true, FIXTURES.alreadyCompliance);

  /* ---- 4. WHERE THE SHARE STOPS ---------------------------------------- */
  for (const [label, id] of [["a Commercial-only lease document", FIXTURES.commercialOnly],
    ["a Commercial-only service document", FIXTURES.commercialOnly2]]) {
    check(label + " is still refused to Compliance", may(id, "compliance") === false, id);
    check(label + " is still readable by Commercial", may(id, "commercial") === true, "unchanged");
  }
  for (const [label, id] of [["a historical lease document", FIXTURES.historicalOnly],
    ["a payment receipt", FIXTURES.receiptOnly]]) {
    check(label + " stays out of ordinary Compliance access", may(id, "compliance") === false, id);
  }
  check("an administrator can still reach the documents ordinary Compliance cannot",
    scope.canAccessDocument(FIXTURES.historicalOnly, byId.get(FIXTURES.historicalOnly), {}, true).allow === true,
    "lineage remains reachable for Data Health");

  /* ---- 5. the share is exactly the approved set, no more ---------------- */
  if (review) {
    const approvedIds = new Set(review.links.filter((x) => x.recommendation === "C_SHARED_COMMERCIAL_COMPLIANCE").map((x) => x.fileId));
    const notApproved = review.links.filter((x) => x.recommendation !== "C_SHARED_COMMERCIAL_COMPLIANCE" && !approvedIds.has(x.fileId));
    const leaked = [...new Set(notApproved.map((x) => x.fileId))]
      .filter((id) => x_wasSharedByPolicy(rec(id)));
    check("no document outside the approved set was shared by this policy",
      leaked.length === 0,
      leaked.length ? leaked.slice(0, 5).join(", ") : [...new Set(notApproved.map((x) => x.fileId))].length + " unapproved documents, none shared");
    const missed = [...approvedIds].filter((id) => !x_wasSharedByPolicy(rec(id)) && may(id, "compliance") !== true);
    check("every approved document is now readable by Compliance",
      missed.length === 0, missed.length ? missed.slice(0, 5).join(", ") : approvedIds.size + " approved, all readable");
  } else {
    check("access review artifact present", false, "audit/spend-document-access-review.json missing");
  }

  /* ---- 6. the rest of the corpus did not move -------------------------- */
  const registers = require("../api/registers.js");
  const st = await registers.ensure();
  const d = scope.diff({ files: drive.indexFiles(), registers: st.registers });
  const stats = scope.stats();
  check("no document was widened WITHOUT an approval behind it",
    d.widened.length === 0,
    d.widened.slice(0, 3).map((w) => w.name + " gained " + w.gained.join("+")).join(" | ") || "none");
  check("the approved share is reported as approved, not as drift",
    d.widenedByPolicy.length === 295 && d.byPolicy["SPEND-COMPLIANCE-SHARE-V1"] === 295,
    JSON.stringify(d.byPolicy));
  check("every policy-widened document names who approved it and when",
    d.widenedByPolicy.every((w) => w.approvedBy && w.approvedByUserId && w.approvedAt),
    d.widenedByPolicy.length ? d.widenedByPolicy[0].approvedBy + " (" + d.widenedByPolicy[0].approvedByUserId + ") at " + d.widenedByPolicy[0].approvedAt : "-");
  check("nothing was narrowed by the share",
    d.narrowed.length === 0, d.narrowed.length + " narrowed");
  check("every document is still scoped", (stats.summary && stats.summary.withNoScope) === 0,
    stats.documents + " documents scoped");

  function x_wasSharedByPolicy(r) {
    return !!(r && r.sharePolicy && r.sharePolicy.policyId === "SPEND-COMPLIANCE-SHARE-V1");
  }
});
