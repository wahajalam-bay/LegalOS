#!/usr/bin/env node
/* WHERE DOES THIS AMENDMENT'S AGREEMENT LIVE?
 *
 * Nineteen lifecycle documents sit on a record whose own agreements all
 * postdate them -- a 2020 amendment filed against a lease signed in 2022. The
 * instrument each one varies is real; it is simply on a different record,
 * because the tracker keeps each lease period as its own row.
 *
 * This looks for that parent using evidence a person would accept: the same
 * internal entity, the same counterparty, and an agreement signed BEFORE the
 * amendment. It links only when exactly one candidate survives.
 *
 * WHAT IT WILL NOT DO. It will not pick the closest match, or the only match
 * "near enough", or fall back to title similarity. A lifecycle action attached
 * to the wrong lease is worse than one left honestly unattached, because it
 * changes what a lawyer believes the terms are. Anything short of a single
 * unambiguous candidate is recorded as such and left alone.
 *
 *   node tools/compliance-lineage-resolve.js
 */
const fs = require("fs"), P = require("path");
const registers = require("../api/registers.js");
const model = require("../api/compliance-model.js");

const AUDIT = P.join(__dirname, "..", "audit");
const nk = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

(async () => {
  const gaps = JSON.parse(fs.readFileSync(P.join(AUDIT, "compliance-document-order.json"), "utf8")).gaps || [];
  const st = await registers.ensure();
  const spend = await model.buildSpendWithDocs();
  const all = [...(spend.leases || []), ...(spend.services || []), ...(spend.other || [])];
  const byId = new Map(all.map((r) => [r.id, r]));

  const out = [];
  const tally = {};
  for (const g of gaps) {
    const child = byId.get(g.recordId);
    if (!child) {
      out.push({ ...g, status: "NO_PARENT_REQUIRED", why: "the record is not a spend agreement" });
      tally.NO_PARENT_REQUIRED = (tally.NO_PARENT_REQUIRED || 0) + 1;
      continue;
    }

    /* Candidates: another record, same entity, same counterparty, holding an
       agreement signed on or before the child's date. */
    const candidates = all.filter((r) => {
      if (r.id === child.id) return false;
      if (!nk(r.entity) || nk(r.entity) !== nk(child.entity)) return false;
      if (!nk(r.counterparty) || nk(r.counterparty) !== nk(child.counterparty)) return false;
      return r.start && r.start <= g.date;
    });

    let status, why, parent = null;
    if (candidates.length === 1) {
      parent = candidates[0];
      status = "CONFIRMED_PARENT";
      why = "exactly one earlier agreement with the same entity and counterparty";
    } else if (candidates.length > 1) {
      /* Several successive leases with the same landlord. The nearest earlier
         one is the likely parent, but "likely" is not a link. */
      status = "PROBABLE_PARENT_NOT_OPERATIONAL";
      why = candidates.length + " earlier agreements share this entity and counterparty; the source does not say which was varied";
    } else {
      status = "SOURCE_ONLY_CHILD";
      why = "no earlier agreement with this entity and counterparty exists in the register — the instrument it varies is not in LegalOS";
    }

    tally[status] = (tally[status] || 0) + 1;
    out.push({
      family: g.family, childRecordId: g.recordId, document: g.document,
      relationship: g.lifecycle, effectiveDate: g.date,
      entity: child.entity || null, counterparty: child.counterparty || null,
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 5).map((c) => ({ id: c.id, title: c.title, start: c.start })),
      parentRecordId: parent ? parent.id : null,
      parentTitle: parent ? parent.title : null,
      parentStart: parent ? parent.start : null,
      status, why,
    });
  }

  fs.writeFileSync(P.join(AUDIT, "compliance-document-lineage-gaps.json"), JSON.stringify({
    builtAt: new Date().toISOString(),
    gaps: out.length,
    byStatus: tally,
    unresolved: out.filter((x) => !x.status).length,
    resolutionRule: "same internal entity AND same counterparty AND an agreement starting on or before the child's date; linked only when exactly one candidate survives",
    detail: out,
  }, null, 1));
  console.log("  wrote audit/compliance-document-lineage-gaps.json");
  console.log("\nLINEAGE GAPS  " + out.length);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log("   " + String(v).padStart(4) + "  " + k);
  console.log("   " + String(out.filter((x) => !x.status).length).padStart(4) + "  UNRESOLVED");
  for (const x of out.filter((x) => x.status === "CONFIRMED_PARENT").slice(0, 6))
    console.log("     link: " + x.childRecordId + " " + x.relationship + " " + x.effectiveDate + "  ->  " + x.parentRecordId + " (" + x.parentStart + ")");
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
