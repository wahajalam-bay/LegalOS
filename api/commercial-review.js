/* THE COMMERCIAL REVIEW QUEUE, and the decisions people make in it.
 *
 * Automation took the Commercial estate as far as the evidence safely allows.
 * What is left is genuinely ambiguous — a document whose body names one project
 * while it sits in another's folder, a precedent that reads as an executed
 * agreement — and those need a person.
 *
 * TWO THINGS THIS FILE EXISTS TO GUARANTEE:
 *
 * 1. A REVIEWER SHOULD NOT HAVE TO REDO THE INVESTIGATION. Every queue item
 *    carries both candidates, the evidence for each, why automation could not
 *    decide, and the Drive path — so the decision is a judgement, not a search.
 *
 * 2. A DECISION MUST STICK. It is written to config/commercial-decisions.json
 *    with the reviewer, the time and the reason, and every later reconciliation
 *    reads it and leaves that file alone. Weak automatic evidence disagreeing
 *    with a human decision is not grounds to ask again — that is how a review
 *    queue becomes a treadmill nobody trusts.
 *
 * Nothing here writes to Drive. A decision changes what LegalOS believes about
 * a document, never where the business filed it.
 */
const fs = require("fs"), P = require("path");
const { ROOT } = require("./config");

const QUEUE = P.join(ROOT, "audit", "commercial-review-queue.json");
const STORE = P.join(ROOT, "config", "commercial-decisions.json");

/* What a reviewer may conclude. Deliberately small: each maps to a disposition
   the reconciler already understands, so a decision cannot invent a state the
   rest of the system has no rule for. */
const DECISIONS = {
  ATTACH_TO_PROJECT: "attach the document to the named project",
  KEEP_CURRENT: "leave it attached where it is",
  MARK_TEMPLATE: "it is a precedent or standard form",
  MARK_EXECUTED_HISTORICAL: "an executed instrument retained for reference, not operational",
  MARK_NON_COMMERCIAL: "not a Commercial document at all",
  MARK_DRAFT_COPY: "a base draft copied from another project; its old text is expected",
};

function readStore() {
  try {
    const j = JSON.parse(fs.readFileSync(STORE, "utf8"));
    return { decisions: Array.isArray(j.decisions) ? j.decisions : [] };
  } catch (e) { return { decisions: [] }; }
}

function writeStore(s) {
  fs.mkdirSync(P.dirname(STORE), { recursive: true });
  // Written whole and atomically: a half-written decisions file would silently
  // lose every human judgement recorded before it.
  const tmp = STORE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
  fs.renameSync(tmp, STORE);
}

function queue() {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(QUEUE, "utf8")); } catch (e) { items = []; }
  const decided = new Map(readStore().decisions.map((d) => [d.fileId, d]));
  return items.map((i) => Object.assign({}, i, {
    decided: decided.has(i.fileId) ? decided.get(i.fileId) : null,
  }));
}

function summary() {
  const q = queue();
  const open = q.filter((i) => !i.decided);
  const byReason = {};
  for (const i of open) byReason[i.reason] = (byReason[i.reason] || 0) + 1;
  return { total: q.length, open: open.length, resolved: q.length - open.length, byReason };
}

function decide({ fileId, decision, project, reason, who }) {
  if (!fileId) return { error: "bad_request", detail: "No document was named." };
  if (!DECISIONS[decision]) return { error: "bad_request", detail: "Unknown decision: " + decision };
  if (decision === "ATTACH_TO_PROJECT" && !project) {
    return { error: "bad_request", detail: "Attaching requires the project to attach to." };
  }
  const items = queue();
  const item = items.find((i) => i.fileId === fileId);
  if (!item) return { error: "not_found", detail: "That document is not in the review queue." };

  const s = readStore();
  const entry = {
    fileId,
    filename: item.filename,
    drivePath: item.drivePath,
    decision,
    decisionMeaning: DECISIONS[decision],
    project: project || null,
    reason: String(reason || "").slice(0, 500),
    reviewer: (who && (who.email || who.name)) || "unknown",
    reviewerRole: (who && who.rbac) || null,
    decidedAt: new Date().toISOString(),
    // The evidence as it stood when the decision was taken, so a later reader
    // can see what the reviewer was actually looking at.
    evidenceAtDecision: {
      candidateA: item.candidateA, candidateB: item.candidateB,
      evidenceA: item.evidenceA, evidenceB: item.evidenceB,
      whyAutomationCouldNotDecide: item.whyAutomationCannotDecide,
    },
  };
  s.decisions = s.decisions.filter((d) => d.fileId !== fileId).concat([entry]);
  writeStore(s);
  return { ok: true, decision: entry };
}

const decisionFor = (fileId) => readStore().decisions.find((d) => d.fileId === fileId) || null;

module.exports = { queue, summary, decide, decisionFor, DECISIONS, STORE };
