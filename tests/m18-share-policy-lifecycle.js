// A SHARE CAN BE TAKEN BACK.
//
// SPEND-COMPLIANCE-SHARE-V1 widened 295 documents to Compliance on a named
// person's approval. A share that cannot be revoked is not a policy, it is a
// one-way door — and the first time someone needs to undo one it must not be
// a hand-edit of 295 scope records under time pressure.
//
// This proves the whole lifecycle on FIXTURE data. It never touches the live
// policy or the live scope file: it builds a scope table in memory, applies a
// share to it, revokes it, and checks the decision at each step through the
// one authorization function the application actually uses.
//
// WHAT IT PINS DOWN
//   - a share grants Compliance and takes nothing from Commercial
//   - revoking it puts Compliance back exactly where it was
//   - revocation NEVER touches allowedGroups, so the owning team is unaffected
//   - an explicit deny outranks a share, before and after
//   - the policy id is stable, so re-applying is a no-op rather than a second
//     policy record
//
//   node tests/m18-share-policy-lifecycle.js
const H = require("./_harness.js");

const POLICY = "SPEND-COMPLIANCE-SHARE-V1";

/* The share and its revocation, as pure functions over a scope record. These
   mirror tools/spend-compliance-share.js: add to sharedGroups, never to
   allowedGroups, and record who approved it. */
function share(rec, actor, at) {
  const sg = Array.isArray(rec.sharedGroups) ? rec.sharedGroups.slice() : [];
  if ((rec.deniedGroups || []).includes("compliance")) return { rec, skipped: "explicit deny" };
  if (sg.includes("compliance")) return { rec, skipped: "already shared" };
  sg.push("compliance");
  return {
    rec: Object.assign({}, rec, {
      sharedGroups: sg,
      sharePolicy: { policyId: POLICY, approvedBy: actor, approvedByUserId: "u1", approvedAt: at },
    }),
  };
}
function revoke(rec) {
  if (!rec.sharePolicy || rec.sharePolicy.policyId !== POLICY) return rec;
  const out = Object.assign({}, rec, {
    sharedGroups: (rec.sharedGroups || []).filter((g) => g !== "compliance"),
  });
  delete out.sharePolicy;
  return out;
}

H.runSuite("m18-share-policy-lifecycle — an approved share can be granted and taken back", async (ctx) => {
  const { check } = ctx;
  const scope = require("../api/document-scope.js");

  /* A fixture file under a Commercial root, owned by Commercial. Nothing here
     exists in Drive; the decision function only needs the record and the root. */
  const file = { id: "FIXTURE-SHARE-1", name: "fixture-lease.pdf", root: "Commercial_Zameen Media Contracts" };
  let rec = { name: file.name, root: file.root, rootGroup: "commercial", allowedGroups: ["commercial"], sharedGroups: [], deniedGroups: [] };

  /* The authorization function reads the persisted table, so the fixture is
     injected into that table for the duration of the check and removed after.
     Nothing is written to disk. */
  const table = scope.load().byFile;
  const put = (r) => table.set(file.id, r);
  const may = (group) => scope.canAccessDocument(file.id, file, { [group]: "view" }, false).allow;

  put(rec);
  check("before sharing, Commercial can read the document", may("commercial") === true, "owner");
  check("before sharing, Compliance cannot", may("compliance") === false, "not shared yet");
  check("before sharing, Litigation cannot", may("litigation") === false, "unrelated module");

  const applied = share(rec, "maryam.haq@zameen.com", new Date().toISOString());
  rec = applied.rec; put(rec);
  check("after sharing, Compliance can read it", may("compliance") === true, "sharedGroups=" + JSON.stringify(rec.sharedGroups));
  check("after sharing, Commercial still can", may("commercial") === true, "ownership untouched");
  check("after sharing, Litigation still cannot", may("litigation") === false, "the share names one group");
  check("sharing did not alter ownership", JSON.stringify(rec.allowedGroups) === JSON.stringify(["commercial"]),
    "allowedGroups=" + JSON.stringify(rec.allowedGroups));
  check("the share records the policy and its approver",
    rec.sharePolicy.policyId === POLICY && !!rec.sharePolicy.approvedBy && !!rec.sharePolicy.approvedAt,
    rec.sharePolicy.policyId + " by " + rec.sharePolicy.approvedBy);

  /* Re-applying is a no-op under the SAME stable policy id. */
  const again = share(rec, "maryam.haq@zameen.com", new Date().toISOString());
  check("re-applying the same policy is a no-op, not a second policy record",
    again.skipped === "already shared" && rec.sharedGroups.filter((g) => g === "compliance").length === 1,
    "sharedGroups=" + JSON.stringify(rec.sharedGroups));

  /* ---- REVOCATION ---- */
  rec = revoke(rec); put(rec);
  check("after revoking, Compliance is denied again", may("compliance") === false, "sharedGroups=" + JSON.stringify(rec.sharedGroups));
  check("after revoking, Commercial is unaffected", may("commercial") === true, "the owner never depended on the share");
  check("revocation removed the share, not the ownership",
    JSON.stringify(rec.allowedGroups) === JSON.stringify(["commercial"]) && !rec.sharePolicy,
    "allowedGroups=" + JSON.stringify(rec.allowedGroups) + " sharePolicy=" + (rec.sharePolicy ? "present" : "removed"));
  check("revoking twice is safe", JSON.stringify(revoke(rec)) === JSON.stringify(rec), "idempotent");

  /* ---- AN EXPLICIT DENY OUTRANKS A SHARE ---- */
  let denied = { name: "fixture-denied.pdf", root: file.root, rootGroup: "commercial",
    allowedGroups: ["commercial"], sharedGroups: [], deniedGroups: ["compliance"] };
  const dFile = { id: "FIXTURE-SHARE-2", name: denied.name, root: denied.root };
  table.set(dFile.id, denied);
  const dMay = (g) => scope.canAccessDocument(dFile.id, dFile, { [g]: "view" }, false).allow;
  check("a document that explicitly denies Compliance refuses it", dMay("compliance") === false, "deny in force");
  const attempt = share(denied, "maryam.haq@zameen.com", new Date().toISOString());
  check("a bulk share will not override an explicit deny",
    attempt.skipped === "explicit deny", "the migration skips and reports it rather than bypassing");
  check("...and the deny still holds afterwards", dMay("compliance") === false, "deny retains precedence");

  table.delete(file.id);
  table.delete(dFile.id);
  check("the fixtures were removed and the live scope table is untouched",
    !table.has(file.id) && !table.has(dFile.id), "no live policy was modified by this suite");

  /* The live policy is still in force -- this suite must never have disturbed it. */
  const drive = require("../api/drive.js");
  await drive.ensureIndex();
  const registers = require("../api/registers.js");
  const st = await registers.ensure();
  const d = scope.diff({ files: drive.indexFiles(), registers: st.registers });
  check("the live SPEND-COMPLIANCE-SHARE-V1 policy is still applied and still explained",
    d.widened.length === 0 && (d.byPolicy || {})[POLICY] > 0,
    "unexplained " + d.widened.length + ", by policy " + JSON.stringify(d.byPolicy));
});
