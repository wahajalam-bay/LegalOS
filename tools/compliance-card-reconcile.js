#!/usr/bin/env node
/* THE CARDS ON TOP OF EVERY COMPLIANCE RECORD.
 *
 * The five tiles above a record are the first thing anyone reads and the least
 * likely thing anyone checks, because they look like decoration. They are not:
 * they are five independent reads of the record, each capable of disagreeing
 * with the detail panel two inches below it.
 *
 * This asserts, for EVERY Compliance record, that each card equals the field
 * it claims to summarise, that every count equals the length of the thing it
 * counts, and that a card never states a date the record itself calls unusable.
 *
 *   node tools/compliance-card-reconcile.js
 */
const fs = require("fs"), P = require("path");
const H = require("../tests/_harness.js");

const AUDIT = P.join(__dirname, "..", "audit");

(async () => {
  const sb = await H.startSandbox({ portEnv: "LEGALOS_CARD_PORT", portFallback: "4895", prefix: "legalos-card-" });
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);
  const get = async (p) => H.request(sb.base, "GET", p, { cookie });

  const issues = [];
  let checked = 0;
  const fail = (family, id, card, why, detail) => issues.push({ family, id, card, why, detail });

  /* ---------------------------------------------------------- agreements -- */
  for (const [kind, listPath, key] of [["lease", "/api/compliance/leases", "leases"], ["service", "/api/compliance/services", "services"]]) {
    const rows = ((await get(listPath)).body || {})[key] || [];
    for (const r of rows) {
      const d = ((await get("/api/compliance/" + key + "/" + encodeURIComponent(r.id))).body || {}).agreement || {};
      checked++;

      /* CARD 1 — rent / contract value */
      const cardValue = d.value != null ? d.value : (d.valueText || null);
      if (d.value == null && d.valueText == null && (r.value != null || r.valueText != null))
        fail(kind, r.id, "Rent / value", "the card has no value but the register row does", { row: r.value, detail: d.value });

      /* CARD 2/3 — start and expiry must equal the record, and must never
         state a date the record itself flagged unusable. */
      if ((d.start || null) !== (r.start || null))
        fail(kind, r.id, "Start date", "detail and register disagree", { register: r.start, detail: d.start });
      if (d.dateAnomaly && d.end)
        fail(kind, r.id, "Expiry", "an unusable source date is still being served as a usable expiry", { end: d.end, anomaly: d.dateAnomaly });
      if (!d.dateAnomaly && (d.end || null) !== (r.end || null))
        fail(kind, r.id, "Expiry", "detail and register disagree", { register: r.end, detail: d.end });

      /* CARD 4 — legal actions is a COUNT; it must equal what it counts. */
      const actions = (d.children || []).length;
      if (actions !== ((r.actionCount != null) ? r.actionCount : actions))
        fail(kind, r.id, "Legal actions", "the card count and the register count disagree", { register: r.actionCount, detail: actions });

      /* CARD 5 — status */
      if ((d.status || null) !== (r.status || null))
        fail(kind, r.id, "Status", "detail and register disagree", { register: r.status, detail: d.status });
    }
  }

  /* --------------------------------------------------------------- loans -- */
  const loans = ((await get("/api/compliance/loans")).body || {}).loans || [];
  for (const r of loans) {
    const d = ((await get("/api/compliance/loans/" + encodeURIComponent(r.id))).body || {}).loan || {};
    checked++;
    if ((d.principal != null ? d.principal : null) !== (r.principal != null ? r.principal : null))
      fail("loan", r.id, "Original principal", "detail and register disagree", { register: r.principal, detail: d.principal });

    const bal = d.balance || r.balance || {};
    const repayChildren = (d.children || []).filter((c) => c.type === "repayment").length;
    if (bal.repayments != null && bal.repayments !== repayChildren)
      fail("loan", r.id, "Repayments recorded", "the count does not equal the repayment records behind it", { card: bal.repayments, children: repayChildren });

    const amendments = (d.current && d.current.amendmentCount);
    if (amendments != null) {
      /* hydrateLoan's `timeline` already contains every event plus the
         LegalOS-native ones, so concatenating both counted each event twice. */
      const timeline = (d.timeline && d.timeline.length) ? d.timeline : (d.events || []);
      const evidenced = timeline.filter((e) => e.kind === "amendment" || e.kind === "rollover").length;
      if (amendments !== evidenced)
        fail("loan", r.id, "Amendments / rollovers", "the card claims amendments the timeline does not show", { card: amendments, timelineAmendments: evidenced });
    }
    if (d.sbp && !d.sbp.label) fail("loan", r.id, "SBP registration", "a status with no label", { sbp: d.sbp });
  }

  /* ------------------------------------------------------------ licences -- */
  const lics = ((await get("/api/compliance/licences")).body || {}).licences || [];
  for (const r of lics) {
    const d = ((await get("/api/compliance/licences/" + encodeURIComponent(r.id))).body || {}).licence || {};
    checked++;
    if ((d.issued || null) !== (r.issued || null))
      fail("licence", r.id, "Issued", "detail and register disagree", { register: r.issued, detail: d.issued });
    if ((d.expiry || null) !== (r.expiry || null))
      fail("licence", r.id, "Expiry", "detail and register disagree", { register: r.expiry, detail: d.expiry });
    const renewals = (d.history || []).filter((h) => h.kind === "renewal").length;
    if ((d.renewalsOnFile || 0) !== renewals)
      fail("licence", r.id, "Renewals on file", "the count does not equal the renewal history", { card: d.renewalsOnFile, history: renewals });
    /* A licence that cannot resolve a current certificate must say so rather
       than leaving the card to imply the newest file is in force. */
    if (!d.currentEffective && !d.currentEffectiveUnknown)
      fail("licence", r.id, "Current effective", "no current certificate and no reason given", {});
  }

  /* --------------------------------------------------------- resolutions -- */
  const reg = ((await get("/api/registers/resolutions?limit=5000")).body || {}).records || [];
  for (const r of reg) {
    const d = ((await get("/api/compliance/resolutions/" + encodeURIComponent(r.id))).body || {}).resolution || {};
    checked++;
    if ((d.date || null) !== (r.date || null))
      fail("resolution", r.id, "Resolution date", "detail and register disagree", { register: r.date, detail: d.date });
    const docs = (d.driveFiles || []).length;
    if (d.documentCount != null && d.documentCount !== docs)
      fail("resolution", r.id, "Documents", "the badge does not equal the list", { badge: d.documentCount, list: docs });
    if (!docs && d.evidenceStatus !== "NO_DOCUMENT_ON_FILE")
      fail("resolution", r.id, "Evidence", "no documents but the record does not say so", { evidenceStatus: d.evidenceStatus });
  }

  const byCard = {};
  for (const i of issues) byCard[i.family + " · " + i.card] = (byCard[i.family + " · " + i.card] || 0) + 1;
  fs.writeFileSync(P.join(AUDIT, "compliance-card-reconciliation.json"), JSON.stringify({
    builtAt: new Date().toISOString(), recordsChecked: checked,
    cardIssues: issues.length, byCard, issues: issues.slice(0, 300),
  }, null, 1));
  console.log("  wrote audit/compliance-card-reconciliation.json");
  console.log("\nRECORDS CHECKED   " + checked);
  console.log("CARD ISSUES       " + issues.length);
  for (const [k, v] of Object.entries(byCard).sort((a, b) => b[1] - a[1])) console.log("   " + String(v).padStart(4) + "  " + k);
  if (issues.length) for (const i of issues.slice(0, 6)) console.log("   e.g. " + i.family + " " + i.id + " [" + i.card + "] " + i.why + "  " + JSON.stringify(i.detail));
  await sb.stop();
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
