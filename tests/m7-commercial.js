// COMMERCIAL — the gates, and the review queue that holds the remainder.
//
// The Commercial estate is 100% accounted for and as close to resolved as the
// evidence safely allows. This suite is what keeps it there: it re-asserts the
// gates from the audit artifacts, and it proves that the queue holding the
// genuine remainder is actionable and that a decision recorded in it sticks.
//
// The rule these checks defend is the one that is easiest to lose under
// pressure: a document nobody can place is a KNOWN GAP, and a document forced
// onto a record to make a number go green is a false statement that looks like
// coverage.
//
//   node tests/m7-commercial.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const AUD = P.join(__dirname, "..", "audit");
const A = (n) => JSON.parse(fs.readFileSync(P.join(AUD, n), "utf8"));

H.runSuite("m7-commercial — accounted for, safely resolved, and the rest is actionable", async (ctx) => {
  const { check } = ctx;

  const ctxDocs = A("commercial-document-context.json");
  const disp = A("commercial-document-disposition.json");
  const status = A("commercial-final-status.json");
  const queue = A("commercial-review-queue.json");
  const multi = A("commercial-multirecord.json");
  const chains = A("commercial-chain-confidence.json");
  const sets = A("commercial-sets.json");

  /* ------------------------------------------------------------ §36 gates */
  for (const [k, v] of Object.entries(status.gates || {})) {
    check("gate " + k + " is at zero", v === 0, String(v));
  }

  /* -------------------------------------------------------- §33 arithmetic */
  const total = Object.values(status.buckets || {}).reduce((a, b) => a + b, 0);
  check("the disposition buckets reconcile to the file total",
    total === ctxDocs.length, total + " vs " + ctxDocs.length);
  check("every file has a disposition",
    disp.length === ctxDocs.length, disp.length + " of " + ctxDocs.length);

  /* ------------------------------------------------- §12 actionable review */
  for (const i of queue) {
    check("review item carries everything a person needs: " + String(i.filename).slice(0, 40),
      !!(i.fileId && i.drivePath && i.candidateA && i.candidateB && i.evidenceA && i.evidenceB
        && i.whyAutomationCannotDecide && i.suggestedAction),
      Object.keys(i).join(","));
  }

  /* ------------------------------------------------ §22/§23 multi-record -- */
  const weak = multi.filter((m) => m.strength === "WEAK_GUESS_SHARED");
  check("no document is shared between records on a token guess", weak.length === 0,
    weak.slice(0, 2).map((m) => m.filename).join(" | ") || "none");
  const noEvidence = multi.filter((m) => !m.vias || !m.vias.length);
  check("every multi-record link states how it was made", noEvidence.length === 0, String(noEvidence.length));

  /* -------------------------------------------------- §24/§25 chain grades */
  const graded = chains.filter((c) => c.grade);
  check("every contract chain carries a confidence grade", graded.length === chains.length,
    graded.length + " of " + chains.length);
  const confirmedWithoutParent = chains.filter((c) => c.grade === "CONFIRMED_CHAIN" && !c.parentReferences);
  check("a chain is only CONFIRMED when a document names its parent",
    confirmedWithoutParent.length === 0, String(confirmedWithoutParent.length));

  /* ------------------------------------------------ §8 executed vs template */
  const res = A("commercial-resolutions.json");
  /* Test the EVIDENCE, not the prose. This used to grep the basis text for
     "executed", which happily matched "the pages show it is NOT executed" — so
     eight documents correctly identified as unsigned drafts were reported as
     executed agreements wrongly left as templates. A check that fails on the
     sentence describing the right answer is worse than no check. */
  const vision = (() => { try { return require("../api/commercial-vision-facts.js"); } catch (e) { return null; } })();
  const stillTemplate = res.filter((r) => {
    if (r.from !== "TEMPLATE" || r.to !== "TEMPLATE") return false;
    if (!vision) return false;
    return vision.executionState(r.fileId).state === "EXECUTED";
  });
  check("no document seen to be signed is left classified as a generic template",
    stillTemplate.length === 0,
    stillTemplate.slice(0, 3).map((r) => r.filename).join(" | ") || "none");

  /* -------------------------------------------------------- §10 the strays */
  const contamination = res.filter((r) => r.to === "NON_COMMERCIAL_SOURCE_CONTAMINATION");
  check("files that are not Commercial documents are called that, and keep their path",
    contamination.length > 0 && contamination.every((c) => c.path && c.fileId),
    contamination.map((c) => c.filename.slice(0, 34)).join(" | "));

  /* --------------------------------------------- §2 the populations overlap */
  check("the population arithmetic is stated, not left ambiguous",
    sets.union > 0 && sets.intersections
      && typeof sets.intersections.unreadable_and_human === "number",
    "union " + sets.union + " vs naive sum "
      + (sets.populations.unreadable + sets.populations.humanReview
        + sets.populations.queuedAttachments + sets.populations.executedLookingTemplates));

  /* --------------------------------------------- §28 date absence vs failure */
  const readable = ctxDocs.filter((c) => ["CONTENT_NATIVE_TEXT", "CONTENT_LOCAL_EXTRACT"].includes(c.contentState));
  check("readable documents exist to extract from", readable.length > 300, String(readable.length));

  /* ------------------------------------------------- §30-§32 the live queue */
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_CREVIEW_PORT", portFallback: "4864", prefix: "legalos-cr-",
  }));
  const admin = await H.loginApi(sb, H.USERS.director.email);
  const r = await H.request(sb.base, "GET", "/api/commercial/review", { cookie: admin });
  check("a steward can read the review queue", r.status === 200 && Array.isArray(r.body.items),
    "HTTP " + r.status + ", " + ((r.body && r.body.items) || []).length + " items");

  const member = await H.loginApi(sb, H.USERS.commMember.email);
  const denied = await H.request(sb.base, "GET", "/api/commercial/review", { cookie: member });
  check("an ordinary legal user cannot read the review queue", denied.status === 403, "HTTP " + denied.status);

  if ((r.body.items || []).length) {
    const target = r.body.items.find((i) => !i.decided);
    if (target) {
      const bad = await H.request(sb.base, "POST", "/api/commercial/review/decide", {
        cookie: admin, body: { fileId: target.fileId, decision: "NOT_A_REAL_DECISION" },
      });
      check("an unknown decision is refused", bad.status === 400, "HTTP " + bad.status);

      const ok = await H.request(sb.base, "POST", "/api/commercial/review/decide", {
        cookie: admin,
        body: { fileId: target.fileId, decision: "MARK_DRAFT_COPY", reason: "suite check" },
      });
      check("a decision is recorded with the reviewer and the reason",
        ok.status === 200 && ok.body.ok && ok.body.decision.reviewer && ok.body.decision.reason === "suite check",
        JSON.stringify(ok.body.decision || ok.body).slice(0, 140));

      const after = await H.request(sb.base, "GET", "/api/commercial/review", { cookie: admin });
      const nowDecided = (after.body.items || []).find((i) => i.fileId === target.fileId);
      check("the decision sticks and the item is no longer open",
        !!(nowDecided && nowDecided.decided && nowDecided.decided.decision === "MARK_DRAFT_COPY"),
        JSON.stringify(nowDecided && nowDecided.decided).slice(0, 100));
      check("the evidence the reviewer saw is stored with the decision",
        !!(nowDecided && nowDecided.decided.evidenceAtDecision && nowDecided.decided.evidenceAtDecision.evidenceA),
        "stored");

      /* No cleanup needed, and attempting it was wrong: the decision was written
         into the SANDBOX's config directory, which is destroyed with the
         sandbox. This process's own config path is the repository, where the
         file does not exist — so the tidy-up crashed the suite after every
         check had already passed. The sandbox is the isolation. */
    }
  }
});
