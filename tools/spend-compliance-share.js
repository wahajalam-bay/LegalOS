#!/usr/bin/env node
/* SPEND-COMPLIANCE-SHARE-V1 — a business-approved authorization change.
 *
 * The Compliance spend registers and the Commercial contracts register are
 * built from the SAME source rows, so all 199 spend agreements are registered
 * in both modules. Their documents were scoped `commercial`, because that is
 * who cited them when scope was first recorded. The consequence was that 163
 * of 199 Compliance records opened with an empty Documents tab.
 *
 * The business reviewed SPEND_DOCUMENT_ACCESS_REVIEW.md and approved sharing
 * the documents classified C_SHARED_COMMERCIAL_COMPLIANCE. This applies that
 * decision and nothing else.
 *
 * WHAT IT DOES NOT DO
 *   - It does not rewrite `allowedGroups`. The documents stay Commercial-owned
 *     and become explicitly SHARED. Re-owning them would destroy the
 *     source-root ownership the whole scope model rests on.
 *   - It does not touch the 5 B_COMMERCIAL_ONLY or the 5
 *     D_HISTORICAL_SOURCE_ONLY documents.
 *   - It never overrides an explicit deny. A deliberate deny outranks a bulk
 *     share, and any it finds are reported rather than bypassed.
 *
 * COUNTING, SAID PLAINLY: the review approved 297 record-document LINKS, which
 * are 295 DISTINCT documents -- two documents hang off two records each, both
 * approved. Scope is per document, so 295 documents change. Both numbers are
 * asserted; if either moves, this refuses to run.
 *
 *   node tools/spend-compliance-share.js              # dry run + security diff
 *   node tools/spend-compliance-share.js --apply      # atomic promotion
 *   node tools/spend-compliance-share.js --apply --by someone@example.com
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const scope = require("../api/document-scope.js");

const ROOT = P.join(__dirname, "..");
const SCOPE_FILE = P.join(ROOT, "config", "document-scope.json");
const REVIEW = P.join(ROOT, "audit", "spend-document-access-review.json");

const POLICY_ID = "SPEND-COMPLIANCE-SHARE-V1";
const REASON = "Operational Spend agreement used by both Commercial and Compliance";
const APPROVED_CATEGORY = "C_SHARED_COMMERCIAL_COMPLIANCE";
const EXPECT_LINKS = 297;
const EXPECT_DOCUMENTS = 295;

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes("--apply");
/* NO DEFAULT APPROVER, EVER.
   This first shipped defaulting to the Director Legal's account, which would
   have written a named person into an audit trail as having approved something
   they were never asked about. An audit record naming the wrong actor is worse
   than no record: it is a false one. The actor must be supplied and must be a
   real LegalOS user with authority over document access. */
const BY = arg("--by", null);

/* The actor must exist, be active, and hold admin authority -- resolved to a
   STABLE USER ID, not a display name, so renaming a person cannot orphan the
   audit trail. */
function resolveActor(raw) {
  if (!raw) return { error: "missing" };
  const identity = require("../api/identity.js");
  let roster = [];
  try { roster = identity.listRoster() || []; } catch (e) { roster = []; }
  const norm = (v) => String(v || "").trim().toLowerCase();
  const hit = roster.find((u) => norm(u.email) === norm(raw) || norm(u.id) === norm(raw));
  if (!hit) return { error: "unknown", detail: "'" + raw + "' is not a LegalOS user" };

  let access = {};
  try { access = require("../config/access.json"); } catch (e) { access = {}; }
  const entry = (access.users || {})[hit.id] || {};
  const groups = entry.groups || entry || {};
  const adminLevel = groups.admin || "none";
  if (adminLevel !== "full") {
    return { error: "unauthorised", detail: hit.name + " (" + hit.id + ") holds admin:" + adminLevel
      + " — managing document access requires admin:full" };
  }
  return {
    approvedByUserId: hit.id,
    approvedByDisplay: hit.name,
    approvedByEmail: hit.email,
    approvedByRole: entry.role || hit.role || null,
  };
}

(async () => {
  /* The actor is checked BEFORE anything else, so a run that cannot be
     attributed never even builds a candidate. */
  const actor = resolveActor(BY);
  if (actor.error === "missing") {
    console.error("Missing required approval actor.");
    console.error("Run with:  --by <authorized LegalOS administrator email or user id>");
    console.error("The approver is written into the audit trail and is never defaulted.");
    process.exit(4);
  }
  if (actor.error) {
    console.error("Approval actor rejected: " + actor.error);
    console.error("  " + (actor.detail || ""));
    process.exit(4);
  }
  console.log("approval actor: " + actor.approvedByDisplay + " <" + actor.approvedByEmail + "> ("
    + actor.approvedByUserId + ", " + (actor.approvedByRole || "admin") + ")");

  const review = JSON.parse(fs.readFileSync(REVIEW, "utf8"));

  /* ---- 1. resolve the approved set by STABLE ID, never by name ---------- */
  const approvedLinks = review.links.filter((x) => x.recommendation === APPROVED_CATEGORY);
  const approved = [...new Set(approvedLinks.map((x) => x.fileId))];

  /* ---- 2. refuse to run on a drifted set (§5) --------------------------- */
  const problems = [];
  if (approvedLinks.length !== EXPECT_LINKS) problems.push("approved links are " + approvedLinks.length + ", expected " + EXPECT_LINKS);
  if (approved.length !== EXPECT_DOCUMENTS) problems.push("approved distinct documents are " + approved.length + ", expected " + EXPECT_DOCUMENTS);
  const inTwoCategories = (() => {
    const m = new Map();
    for (const x of review.links) { if (!m.has(x.fileId)) m.set(x.fileId, new Set()); m.get(x.fileId).add(x.recommendation); }
    return [...m.entries()].filter(([, v]) => v.size > 1).map(([k]) => k);
  })();
  if (inTwoCategories.length) problems.push(inTwoCategories.length + " document(s) appear in more than one recommendation category");
  const duplicateLinks = approvedLinks.length - approved.length;
  if (duplicateLinks !== 2) problems.push("duplicate link relationships are " + duplicateLinks + ", expected 2");
  if (problems.length) {
    console.error("REFUSING TO RUN — the approved set has drifted:");
    for (const p of problems) console.error("  - " + p);
    console.error("Re-run tools/spend-access-review.js and have the changed set re-approved.");
    process.exit(2);
  }
  console.log("approved set verified: " + EXPECT_LINKS + " links = " + EXPECT_DOCUMENTS + " distinct documents");

  /* ---- 3. build the candidate ------------------------------------------ */
  const current = JSON.parse(fs.readFileSync(SCOPE_FILE, "utf8"));
  const docs = current.documents || {};
  const now = new Date().toISOString();

  let shared = 0, alreadyShared = 0, denyConflict = 0, notScoped = 0;
  const denyConflicts = [], missing = [];
  const candidate = JSON.parse(JSON.stringify(docs));

  for (const id of approved) {
    const rec = candidate[id];
    if (!rec) { notScoped++; missing.push(id); continue; }
    const denied = Array.isArray(rec.deniedGroups) ? rec.deniedGroups : [];
    /* AN EXPLICIT DENY OUTRANKS A BULK SHARE. */
    if (denied.includes("compliance")) {
      denyConflict++;
      denyConflicts.push({ fileId: id, name: rec.name, deniedGroups: denied });
      continue;
    }
    const sg = Array.isArray(rec.sharedGroups) ? rec.sharedGroups.slice() : [];
    if (sg.includes("compliance")) { alreadyShared++; continue; }   // idempotent
    sg.push("compliance");
    candidate[id] = Object.assign({}, rec, {
      sharedGroups: sg,
      /* allowedGroups and deniedGroups are carried through untouched. */
      sharePolicy: {
        policyId: POLICY_ID,
        reason: REASON,
        approvedByUserId: actor.approvedByUserId,
        approvedBy: actor.approvedByEmail,
        approvedByDisplay: actor.approvedByDisplay,
        approvedAt: now,
        category: APPROVED_CATEGORY,
      },
    });
    shared++;
  }

  /* ---- 4. security diff: CURRENT vs CANDIDATE (§6) ---------------------- */
  await drive.ensureIndex();
  const files = drive.indexFiles();
  const byId = new Map(files.map((f) => [f.id, f]));
  const GROUPS = ["commercial", "compliance", "litigation", "requester"];

  const decide = (table, id, group) => {
    const f = byId.get(id);
    const rec = table[id];
    if (!rec) return false;
    const lvl = (g) => (g === group ? "view" : "none");
    const denied = rec.deniedGroups || [];
    if (denied.some((g) => lvl(g) !== "none")) return false;
    const allowed = new Set([...(rec.allowedGroups || []), ...(rec.sharedGroups || [])]);
    if (allowed.size) return [...allowed].some((g) => lvl(g) !== "none");
    const rg = scope.rootGroup(f && f.root);
    return rg ? lvl(rg) !== "none" : false;
  };

  const widened = {}, narrowed = {};
  for (const g of GROUPS) { widened[g] = []; narrowed[g] = []; }
  for (const id of Object.keys(docs)) {
    for (const g of GROUPS) {
      const before = decide(docs, id, g);
      const after = decide(candidate, id, g);
      if (!before && after) widened[g].push(id);
      if (before && !after) narrowed[g].push(id);
    }
  }
  const unscopedAfter = Object.values(candidate).filter((r) => !(r.allowedGroups || []).length && !(r.sharedGroups || []).length && !r.rootGroup).length;

  console.log("\n=== CANDIDATE ===");
  console.log("  would share      : " + shared);
  console.log("  already shared   : " + alreadyShared + "   (idempotent)");
  console.log("  deny conflicts   : " + denyConflict);
  console.log("  not scoped       : " + notScoped);
  console.log("\n=== SECURITY DIFF (current -> candidate) ===");
  for (const g of GROUPS) console.log("  widened to " + g.padEnd(11) + widened[g].length + "    narrowed " + narrowed[g].length);
  console.log("  unscoped after   : " + unscopedAfter);

  const expected = widened.compliance.length === shared
    && widened.commercial.length === 0 && widened.litigation.length === 0 && widened.requester.length === 0
    && GROUPS.every((g) => narrowed[g].length === 0) && unscopedAfter === 0;
  console.log("\n  diff matches the approved policy: " + expected);
  if (denyConflicts.length) {
    console.log("\n  DENY CONFLICTS (left untouched, deny retains precedence):");
    for (const d of denyConflicts.slice(0, 10)) console.log("    " + d.fileId + "  " + String(d.name).slice(0, 60) + "  denied=" + d.deniedGroups.join("+"));
  }
  if (missing.length) console.log("\n  approved but not present in scope: " + missing.length);

  const result = {
    policyId: POLICY_ID, reason: REASON, approvedAt: now,
    approvedByUserId: actor.approvedByUserId, approvedBy: actor.approvedByEmail,
    approvedByDisplay: actor.approvedByDisplay, approvedByRole: actor.approvedByRole,
    approvedLinks: approvedLinks.length, approvedDocuments: approved.length,
    shared, alreadyShared, denyConflict, notScoped,
    denyConflicts, missing,
    diff: {
      widened: Object.fromEntries(GROUPS.map((g) => [g, widened[g].length])),
      narrowed: Object.fromEntries(GROUPS.map((g) => [g, narrowed[g].length])),
      unscopedAfter,
      matchesPolicy: expected,
    },
    applied: false,
  };

  if (!APPLY) {
    fs.writeFileSync(P.join(ROOT, "audit", "spend-compliance-share-plan.json"), JSON.stringify(result, null, 1));
    console.log("\nDRY RUN — nothing was written. Plan: audit/spend-compliance-share-plan.json");
    console.log("Promote with:  node tools/spend-compliance-share.js --apply");
    return;
  }

  if (!expected) {
    console.error("\nREFUSING TO PROMOTE — the security diff does not match the approved policy.");
    process.exit(3);
  }

  /* ---- 5. atomic promotion (§8) ---------------------------------------- */
  const summary = Object.assign({}, current.summary || {}, {
    lastPolicy: {
      policyId: POLICY_ID, reason: REASON, approvedAt: now, documentsShared: shared,
      approvedLinks: approvedLinks.length, approvedDocuments: approved.length,
      approvedByUserId: actor.approvedByUserId, approvedBy: actor.approvedByEmail,
      approvedByDisplay: actor.approvedByDisplay,
      commercialOnlyExclusions: review.byRecommendation.B_COMMERCIAL_ONLY || 0,
      historicalOnlyExclusions: review.byRecommendation.D_HISTORICAL_SOURCE_ONLY || 0,
    },
  });
  const tmp = SCOPE_FILE + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ builtAt: current.builtAt, summary, documents: candidate }, null, 1), "utf8");
  fs.renameSync(tmp, SCOPE_FILE);
  result.applied = true;
  result.effectiveDocumentsShared = shared + alreadyShared;
  /* KEEP THE ORIGINAL APPLICATION RECORD.
     A second, idempotent run shares 0 documents -- writing that over the audit
     turned "295 documents shared by Maryam Haq" into "0 documents shared",
     which is the opposite of what an audit trail is for. The first application
     is preserved and later runs are appended as re-runs. */
  const APPLIED = P.join(ROOT, "audit", "spend-compliance-share-applied.json");
  let prior = null;
  try { prior = JSON.parse(fs.readFileSync(APPLIED, "utf8")); } catch (e) { prior = null; }
  if (prior && prior.applied) {
    prior.reruns = (prior.reruns || []).concat([{
      at: now, by: actor.approvedByEmail, shared, alreadyShared, denyConflict,
    }]);
    prior.effectiveDocumentsShared = shared + alreadyShared;
    fs.writeFileSync(APPLIED, JSON.stringify(prior, null, 1));
  } else {
    fs.writeFileSync(APPLIED, JSON.stringify(result, null, 1));
  }
  console.log("\nPROMOTED atomically. " + shared + " document(s) now explicitly shared with Compliance.");
  console.log("Audit: audit/spend-compliance-share-applied.json");
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
