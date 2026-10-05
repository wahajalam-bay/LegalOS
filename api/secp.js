// SECP filings -- statutory corporate compliance, organised by ENTITY and
// FINANCIAL YEAR.
//
// TWO THINGS TO BE CLEAR ABOUT, because they shape everything here:
//
//  1. SECP filings are NOT legal requests. They are not raised by a department
//     and routed to Legal; Legal identifies them because the Companies Act
//     requires them. So this module has its own lifecycle
//     (Identified/due -> Preparation -> Ready to file -> Filed -> Acknowledged)
//     and nothing here touches the request intake.
//
//  2. CORRECTED 2026-09-18 -- THERE *IS* A STATUTORY RECORD IN DRIVE. What is
//     written below was true when it was written: a crawl of the four roots the
//     service account could then see found no FY folder, no AGM folder and no
//     SECP folder. It was a statement about what was VISIBLE, and it has since
//     been overtaken. The root "Entities data for secp filing" is now shared and
//     holds 3,367 documents for 43 entities, filed by entity and by CALENDAR
//     year -- Forms A/9/19/21/29/45, AGM and EOGM papers, share certificates,
//     registers of members and directors, and SECP show-cause notices. It is
//     read by api/secp-source.js straight from the folder grammar, never by
//     matching filenames, and surfaced here as `statutory` on every entity.
//
//     THE RULE THAT SURVIVES THE CORRECTION: a form on file is still not a
//     filing. A Form 29 sitting in "CY 2023" proves the company prepared one; it
//     does not prove SECP received it. Only 53 of the 3,367 documents carry an
//     acknowledgement or receipt, so `formsOnRecord` and `submissionEvidence`
//     are counted and labelled separately, and neither is ever promoted into
//     "filed".
//
//     The older evidence layer described next remains, unchanged, alongside it:
//
//       * 39 pre- and post-AGM board minutes naming the entity and meeting date
//       * 7 board resolutions approving audited financial statements
//       * 4 of the group's own SECP forms (Zameen Media Form A; Daftarkhwan
//         Form A & 29), plus 4 third-party forms held for due diligence, which
//         are excluded because they are a counterparty's filings, not ours
//
//     So this module is seeded with what Drive PROVES and stays empty where it
//     proves nothing. A board minute proves a MEETING was held; it is not a
//     filing, and the two are labelled differently throughout so evidence is
//     never silently promoted into compliance. Any date shown carries its
//     source: "recorded" (Legal entered it) or "drive-evidence" (derived from a
//     document), never blended.
//
// What is derived from data rather than evidence is the OBLIGATION: which
// entities exist, what legal form each one has, and therefore which forms and
// whether an AGM apply. A Single Member Company has one member and holds no AGM
// -- so LegalOS must never show "AGM overdue" against an SMC. That rule lives in
// api/entities.js as data, and where two sources disagree about an entity's form
// the requirement is withheld rather than guessed.

const entities = require("./entities");
const secpSource = require("./secp-source");
const workflow = require("./workflow");
const complianceModel = require("./compliance-model");
const sources = require("./compliance-sources");

const cfg = () => (complianceModel.rules().secp || {});

/* ------------------------------------------------------- financial years */

// FY is a first-class field on every filing, never inferred from a filing date
// (PART 23). This helper only supplies the CHOICES; the value stored on a
// record is whatever Legal selected.
function financialYears(span) {
  const yEnd = cfg().financialYearEndMonth || 6;
  const now = new Date();
  // The FY label a date falls in, given a June year-end: 1 Jul 2025 - 30 Jun 2026 is FY 2026.
  const currentFY = now.getMonth() + 1 > yEnd ? now.getFullYear() + 1 : now.getFullYear();
  const back = span && span.back != null ? span.back : 6;
  const fwd = span && span.forward != null ? span.forward : 1;
  const out = [];
  for (let y = currentFY + fwd; y >= currentFY - back; y--) out.push("FY " + y);
  return { current: "FY " + currentFY, years: out };
}

function fyEndDate(fy) {
  const y = parseInt(String(fy).replace(/\D+/g, ""), 10);
  if (!y) return null;
  const m = cfg().financialYearEndMonth || 6;
  const d = cfg().financialYearEndDay || 30;
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  if (!iso) return null;
  const t = Date.parse(iso + "T00:00:00Z");
  if (isNaN(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ form catalogue */

function forms(category, entityType) {
  const all = cfg().forms || [];
  return all.filter((f) => {
    if (category && f.category !== category && f.code !== "OTHER") return false;
    if (entityType && Array.isArray(f.appliesTo) && !f.appliesTo.includes(entityType)) return false;
    return true;
  });
}

/* ------------------------------------------------------ obligations per FY */

// What an entity owes for a financial year, given its legal FORM. Returns the
// required forms and whether an AGM applies -- with `agm: false` meaning "does
// not apply", distinct from `agm: null` meaning "we could not determine the
// entity's legal form", which is never treated as an obligation.
function obligationsFor(entity, fy) {
  const req = (entity && entity.requirements) || {};
  const type = (entity && entity.type) || "UNKNOWN";
  const end = fyEndDate(fy);
  return {
    entityKey: entity ? entity.key : null,
    entityName: entity ? entity.name : null,
    entityType: type,
    entityTypeLabel: entity ? entity.typeLabel : null,
    financialYear: fy,
    yearEnd: end,
    agmApplicable: req.agm === undefined ? null : req.agm,
    agmDueBy: req.agm === true ? addDays(end, cfg().agmDaysAfterYearEnd || 120) : null,
    financialStatementsRequired: req.financialStatements === undefined ? null : req.financialStatements,
    annualForms: (req.annualForms || []).map((code) => {
      const meta = (cfg().forms || []).find((f) => f.code === code);
      return { code, label: (meta && meta.label) || ("Form " + code), dueBy: addDays(end, cfg().annualReturnDaysAfterYearEnd || 30) };
    }),
    note: req.note || null,
  };
}

/* ------------------------------------------------------------- filing rows */

const isSecp = (r) => r.type === "secpFiling";

function filings(filter) {
  let rows = workflow.list({ type: "secpFiling" });
  if (filter) {
    if (filter.entityKey) rows = rows.filter((r) => r.entityKey === filter.entityKey);
    if (filter.financialYear) rows = rows.filter((r) => r.fields.financialYear === filter.financialYear);
    if (filter.category) rows = rows.filter((r) => (r.fields.filingCategory || r.subtype) === filter.category);
  }
  return rows;
}

// Derived filing state. `overdue` is true only when a statutory due date has
// actually passed AND the filing is not yet filed -- never because a form is
// missing from a register we know to be empty.
function filingState(r, today) {
  const t = today || new Date().toISOString().slice(0, 10);
  const status = r.fields.filingStatus || "Identified / due";
  const filed = /^(filed|acknowledged)/i.test(status);
  const due = r.fields.statutoryDueDate || null;
  const overdue = !filed && !!due && due < t;
  const dueSoon = !filed && !!due && !overdue && due <= addDays(t, 30);
  return {
    status,
    filed,
    due,
    overdue,
    dueSoon,
    overdueReason: overdue ? (r.fields.overdueReason || null) : null,
    needsReason: overdue && !r.fields.overdueReason,
  };
}

/* ---------------------------------------------- per-entity annual picture */

// The annual compliance picture for one entity and one FY: what is required,
// what has been recorded, and what is therefore outstanding. Every "outstanding"
// item is an obligation the entity's legal form genuinely creates.
// Drive evidence for one entity, cached per crawl. Pre/post-AGM board minutes
// prove a meeting was HELD; a filing is a different thing, and the two are
// labelled separately so evidence is never mistaken for compliance.
let EVIDENCE = null;
let EVIDENCE_AT = 0;
function evidence() {
  const now = Date.now();
  if (EVIDENCE && now - EVIDENCE_AT < 60000) return EVIDENCE;
  try { EVIDENCE = sources.secpEvidence(); } catch (e) { EVIDENCE = []; }
  EVIDENCE_AT = now;
  return EVIDENCE;
}

// The AGM / financial-statement evidence that falls inside a financial year.
// A June year-end means FY 2026 runs 1 Jul 2025 - 30 Jun 2026.
function evidenceForYear(entityKey, fy) {
  const end = fyEndDate(fy);
  if (!end) return [];
  const start = addDays(end, -364);
  return evidence().filter((e) =>
    e.entityKey === entityKey && e.date && e.date >= start && e.date <= end);
}

function annualFor(entity, fy) {
  const ob = obligationsFor(entity, fy);
  const rows = filings({ entityKey: entity.key, financialYear: fy });
  const period = rows.find((r) => r.subtype === "period") || null;
  const formRows = rows.filter((r) => r.subtype === "annual");

  const byForm = new Map();
  for (const r of formRows) byForm.set(String(r.fields.form || "").toUpperCase(), r);

  const items = ob.annualForms.map((f) => {
    const rec = byForm.get(String(f.code).toUpperCase()) || null;
    return {
      form: f.code,
      label: f.label,
      dueBy: f.dueBy,
      record: rec ? { id: rec.id, status: rec.fields.filingStatus, filingDate: rec.fields.filingDate, acknowledgementRef: rec.fields.acknowledgementRef, documents: (rec.documents || []).length, drive: rec.drive } : null,
      state: rec ? filingState(rec) : { status: "Not recorded", filed: false, due: f.dueBy, overdue: false, dueSoon: false, notRecorded: true },
    };
  });

  // Where Legal has not recorded a date, fall back to what Drive PROVES -- and
  // say which it is, so a derived date is never mistaken for a recorded one.
  const ev = evidenceForYear(entity.key, fy);
  const agmDoc = ev.find((e) => e.kind === "agm_minutes");
  const fsDoc = ev.find((e) => e.kind === "fs_approval");
  const recordedAgm = period ? period.fields.agmDate || null : null;
  const recordedFs = period ? period.fields.financialStatementsDate || null : null;

  return {
    ...ob,
    financialStatementsDate: recordedFs || (fsDoc ? fsDoc.date : null),
    financialStatementsSource: recordedFs ? "recorded" : fsDoc ? "drive-evidence" : null,
    financialStatementsEvidence: !recordedFs && fsDoc ? fsDoc.file : null,
    // An AGM date is only meaningful where an AGM applies at all.
    agmDate: ob.agmApplicable === true ? (recordedAgm || (agmDoc ? agmDoc.date : null)) : null,
    agmSource: ob.agmApplicable !== true ? null : recordedAgm ? "recorded" : agmDoc ? "drive-evidence" : null,
    agmEvidence: ob.agmApplicable === true && !recordedAgm && agmDoc ? agmDoc.file : null,
    agmNotApplicable: ob.agmApplicable === false,
    // An AGM minute for an entity whose form says no AGM is required is a
    // contradiction worth showing rather than hiding.
    agmEvidenceDespiteNotRequired: ob.agmApplicable === false && agmDoc ? agmDoc.file : null,
    periodRecordId: period ? period.id : null,
    driveEvidence: ev.map((e) => ({ kind: e.kind, label: e.label, date: e.date, file: e.file })),
    forms: items,
    outstanding: items.filter((i) => !i.state.filed).length,
    overdue: items.filter((i) => i.state.overdue).length,
    recorded: items.filter((i) => i.record).length,
  };
}

/* ------------------------------------------------------------- entity view */

// Every entity that could owe SECP filings, with its recorded position. Foreign
// and partnership entities are included but flagged as out of scope, rather than
// silently dropped -- a compliance officer should be able to see WHY an entity
// has no filing obligations.
async function entityOverview(fy) {
  const all = await entities.list();
  const year = fy || financialYears().current;
  /* THE DRIVE-BACKED ESTATE, PER ENTITY.
     This row used to be built entirely from the LegalOS-native workflow and a
     generated FY calculation, so the Event filings column read "—" for every
     company while the tab beside it said 769, and Annual outstanding read "3"
     for everyone because it was a formula rather than anything Drive holds.
     One dataset: the statutory facts come from the same model the registers,
     the dashboard and the entity pages read. */
  const records = require("./secp-records");
  const byEntity = new Map();
  const bump = (k, field) => {
    if (!k) return;
    if (!byEntity.has(k)) byEntity.set(k, { years: 0, events: 0, registers: 0,
      docIds: new Set(), logical: new Set(),
      evidenced: 0, acknowledged: 0, firstCY: null, latestCY: null });
    byEntity.get(k)[field]++;
  };
  /* THE COMPANY'S DOCUMENTS ARE ITS DISTINCT FILES.
     These counts were added up across the populations, which both double-counts
     and under-counts: an event filing's documents are usually the same Drive
     files as the compliance-year folder holding them, and event documents were
     skipped entirely -- so Zameen REIT reported 144 files where its folders
     hold 150, and the 43 rows summed to 3,361 against an estate of 3,367. A
     file is counted once, for the company whose folders it sits in. */
  /* AND ONE INSTRUMENT IS ONE DOCUMENT.
     217 files across this estate are the same instrument filed in two source
     folders -- a company's Form A sitting in its own CY folder and again in
     the folder of the company whose estate holds it. The drill-down has always
     collapsed those to one logical document, so a register counting physical
     files reported 3,367 over pages that add up to 3,150. The register counts
     what the reader will be able to open: the instrument, with its copies kept
     as the administrative detail they are. */
  const identity = (d) => String(d.name || "").trim().toLowerCase() + "|" + (d.size || 0);
  const files = (k, docs) => {
    const e = byEntity.get(k);
    if (!e) return;
    for (const d of (docs || [])) {
      e.docIds.add(d.fileId || d.id);
      e.logical.add(identity(d));
    }
  };
  for (const r of records.annualCompliance()) {
    bump(r.entityKey, "years");
    const e = byEntity.get(r.entityKey);
    if (!e) continue;
    files(r.entityKey, r.documents);
    /* The first and last compliance year THIS company has -- companies were
       incorporated in different years, so the register must not imply a shared
       start. Read from the folders, never assumed. */
    if (r.complianceYear != null) {
      if (e.firstCY == null || r.complianceYear < e.firstCY) e.firstCY = r.complianceYear;
      if (e.latestCY == null || r.complianceYear > e.latestCY) e.latestCY = r.complianceYear;
    }
    if (r.filingStatus === "EVIDENCE_OF_SUBMISSION") e.evidenced++;
    if (r.acknowledgementStatus === "RECEIVED") e.acknowledged++;
  }
  for (const r of records.eventFilings()) { bump(r.entityKey, "events"); files(r.entityKey, r.documents); }
  for (const r of records.statutoryRegisters()) {
    bump(r.entityKey, "registers");
    files(r.entityKey, r.documents);
  }
  for (const e of byEntity.values()) {
    e.documents = e.logical.size;
    e.physicalFiles = e.docIds.size;
    e.duplicateSourceCopies = e.docIds.size - e.logical.size;
  }
  const upcoming = new Map(records.upcomingObligations().map((u) => [u.entityKey, u]));

  return all.map((e0) => {
    const e = e0;
    const inScope = e.type === "SMC" || e.type === "PRIVATE" || e.type === "PUBLIC";
    const rows = filings({ entityKey: e.key });
    const annual = inScope ? annualFor(e, year) : null;
    const events = rows.filter((r) => r.subtype === "event");
    const eventStates = events.map((r) => filingState(r));
    return {
      key: e.key,
      name: e.name,
      type: e.type,
      typeLabel: e.typeLabel,
      inScope,
      outOfScopeReason: inScope ? null : (e.requirements && e.requirements.note) || null,
      agmApplicable: e.requirements ? e.requirements.agm : null,
      financialYear: year,
      annualOutstanding: annual ? annual.outstanding : 0,
      annualOverdue: annual ? annual.overdue : 0,
      annualRecorded: annual ? annual.recorded : 0,
      agmDate: annual ? annual.agmDate : null,
      financialStatementsDate: annual ? annual.financialStatementsDate : null,
      driveEvidence: evidence().filter((e) => e.entityKey === e0.key).length,
      /* What the Drive estate actually holds for this company. */
      complianceYears: (byEntity.get(e0.key) || {}).years || 0,
      firstCY: (byEntity.get(e0.key) || {}).firstCY || null,
      latestCY: (byEntity.get(e0.key) || {}).latestCY || null,
      evidencedYears: (byEntity.get(e0.key) || {}).evidenced || 0,
      acknowledgedYears: (byEntity.get(e0.key) || {}).acknowledged || 0,
      statutoryDocuments: (byEntity.get(e0.key) || {}).documents || 0,
      statutoryPhysicalFiles: (byEntity.get(e0.key) || {}).physicalFiles || 0,
      duplicateSourceCopies: (byEntity.get(e0.key) || {}).duplicateSourceCopies || 0,
      statutoryRegisters: (byEntity.get(e0.key) || {}).registers || 0,
      /* Requirements the configured rules say are outstanding for the last
         ended compliance year. System-generated, and named as such so it is
         never read as something Drive asserts. */
      outstandingGenerated: (upcoming.get(e0.key) || {}).outstanding || 0,
      overdueGenerated: (upcoming.get(e0.key) || {}).overdue || 0,
      // The statutory record the company actually keeps, read from its own
      // folders. Counted, never interpreted: see the header.
      statutory: statutoryFor(e.key),
      // Event-triggered filings the Drive estate evidences, not the LegalOS queue.
      eventFilings: (byEntity.get(e0.key) || {}).events || 0,
      eventFilingsRecordedInLegalOS: events.length,
      eventOutstanding: eventStates.filter((s) => !s.filed).length,
      eventOverdue: eventStates.filter((s) => s.overdue).length,
      totalFilings: rows.length,
    };
  });
}

/* --------------------------------------------------- the statutory record */

// A summary of what "Entities data for secp filing" holds for one entity. Null
// when that entity has no folder there, so the caller can tell "nothing filed"
// from "we hold no folder for this company" — the two are not the same and the
// screen must not merge them.
function statutoryFor(entityKey) {
  let e = null;
  try { e = secpSource.byEntityKey(entityKey); } catch (err) { return null; }
  if (!e) return null;
  return {
    documents: e.documents,
    years: e.years.length,
    latestYear: e.years.length ? e.years[0].year : null,
    formsOnRecord: e.forms,
    submissionEvidence: e.submissionEvidence,
    group: e.group,
    folderPath: e.folderPath,
  };
}

// One entity's statutory folder, year by year, for the entity drill-down.
function statutoryDetail(entityKey) {
  let e = null;
  try { e = secpSource.byEntityKey(entityKey); } catch (err) { return null; }
  if (!e) return null;
  const docs = secpSource.documentsFor(entityKey);
  return {
    entity: { key: e.key, name: e.name, group: e.group, folderPath: e.folderPath },
    totals: { documents: e.documents, formsOnRecord: e.forms, submissionEvidence: e.submissionEvidence },
    categories: e.categories,
    years: e.years,
    documents: docs,
  };
}

/* ------------------------------------------------------- chronological view */

// One entity's whole SECP history, oldest first -- annual and event filings
// together, because the registers are separate but the history is one story
// (PART 29 / 31).
function entityTimeline(entityKey) {
  const rows = filings({ entityKey });
  const out = [];
  for (const r of rows) {
    const f = r.fields;
    const fy = f.financialYear || null;
    if (f.financialStatementsDate) out.push({ at: f.financialStatementsDate, kind: "financials", label: "Audited financial statements received", fy, recordId: r.id });
    if (f.agmDate) out.push({ at: f.agmDate, kind: "agm", label: "Annual General Meeting held", fy, recordId: r.id });
    if (r.subtype !== "period") {
      const name = f.form ? ("Form " + f.form) : "Filing";
      if (f.eventDate) out.push({ at: f.eventDate, kind: "event", label: (f.event || "Triggering event") + " - " + name, fy, recordId: r.id });
      if (f.statutoryDueDate) out.push({ at: f.statutoryDueDate, kind: "due", label: name + " statutory due date", fy, recordId: r.id });
      if (f.filingDate) out.push({ at: f.filingDate, kind: "filed", label: name + " filed with SECP", fy, recordId: r.id });
      if (f.acknowledgementRef) out.push({ at: f.filingDate || r.updatedAt.slice(0, 10), kind: "ack", label: name + " acknowledged (" + f.acknowledgementRef + ")", fy, recordId: r.id });
    }
    out.push({ at: r.createdAt.slice(0, 10), kind: "created", label: (r.subtype === "period" ? "Annual compliance record" : "Filing record") + " created in LegalOS", fy, recordId: r.id, origin: "legalos" });
  }
  // Drive-evidenced events belong in the same chronology, tagged so a board
  // minute is never read as a SECP filing.
  for (const e of evidence()) {
    if (e.entityKey !== entityKey || !e.date) continue;
    out.push({ at: e.date, kind: e.kind, label: e.label, fy: null, file: e.file, origin: "drive", proves: e.proves });
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/* ---------------------------------------------------------------- dashboard */

// Current operational workload, kept separate from history (PART 35). Every
// number here comes from filing records that exist; an empty register reports
// zero rather than an invented backlog.
async function dashboard(fy) {
  const year = fy || financialYears().current;
  const rows = filings({});
  const annual = rows.filter((r) => r.subtype === "annual");
  const events = rows.filter((r) => r.subtype === "event");
  const st = (r) => filingState(r);

  const ents = await entityOverview(year);
  /* ONE DATASET. The dashboard reads the same Drive-backed statutory model as
     the registers, the entity pages and the year detail. It used to count a
     separate board-minute derivation, which saw 33 compliance years over an
     estate of 250 entity-year folders -- so the headline and the register it
     linked to disagreed about the size of the same thing. */
  const records = require("./secp-records");
  const dy = records.annualCompliance();
  return {
    financialYear: year,
    // What Drive PROVES about statutory years, kept separate from what has been
    // FILED. A document on file is not a filing with SECP.
    driveYears: {
      total: dy.length,
      entities: new Set(dy.map((y) => y.entityKey)).size,
      financialYears: [...new Set(dy.map((y) => y.sourcePeriodLabel))].sort(),
      agmEvidenced: dy.filter((y) => y.agm && y.agm.status === "EVIDENCED").length,
      financialStatementsEvidenced: dy.filter((y) => y.financialStatements && y.financialStatements.status === "AVAILABLE").length,
      withRecordedFilings: dy.filter((y) => y.filingStatus === "EVIDENCE_OF_SUBMISSION").length,
      documents: dy.reduce((a, y) => a + (y.documentCount || 0), 0),
    },
    entities: { total: ents.length, inScope: ents.filter((e) => e.inScope).length, smc: ents.filter((e) => e.type === "SMC").length, private: ents.filter((e) => e.type === "PRIVATE").length },
    annual: {
      recorded: annual.length,
      outstanding: annual.filter((r) => !st(r).filed).length,
      overdue: annual.filter((r) => st(r).overdue).length,
      dueSoon: annual.filter((r) => st(r).dueSoon).length,
      filed: annual.filter((r) => st(r).filed).length,
    },
    event: {
      recorded: events.length,
      outstanding: events.filter((r) => !st(r).filed).length,
      overdue: events.filter((r) => st(r).overdue).length,
      dueSoon: events.filter((r) => st(r).dueSoon).length,
      filed: events.filter((r) => st(r).filed).length,
    },
    missingOverdueReason: rows.filter((r) => st(r).needsReason).length,
    empty: rows.length === 0,
    emptyNote: rows.length === 0
      ? "No filing has been recorded in LegalOS yet. Drive evidences " + dy.length +
        " compliance years across " + new Set(dy.map((y) => y.entityKey)).size +
        " entities, with " + dy.filter((y) => y.filingStatus === "EVIDENCE_OF_SUBMISSION").length +
        " carrying evidence that the filing reached SECP. A document on file is not a filing, so the rest stay 'Not evidenced' until a receipt or acknowledgement exists."
      : null,
  };
}

/* ------------------------------------------------------------------ create */

// Creating a filing is creating a FILING, never a request (PART 32).
function createFiling(who, perm, input) {
  const category = input && input.filingCategory === "event" ? "event"
    : input && input.filingCategory === "period" ? "period" : "annual";
  const fy = String((input && input.financialYear) || "").trim();
  if (!fy) { const e = new Error("no_fy"); e.code = 400; e.detail = "Select the financial year this filing belongs to."; throw e; }

  const known = new Set((cfg().forms || []).map((f) => String(f.code).toUpperCase()));
  const form = String((input && input.form) || "").toUpperCase();
  if (category !== "period" && form && !known.has(form)) {
    const e = new Error("bad_form"); e.code = 400;
    e.detail = "That SECP form is not in the configured catalogue. Add it to config/compliance-rules.json to make it selectable.";
    throw e;
  }

  return workflow.create(who, perm, {
    type: "secpFiling",
    subtype: category,
    parent: input.entityKey ? { kind: "entity", id: input.entityKey, label: input.entity || input.entityKey } : null,
    entity: input.entity || null,
    entityKey: input.entityKey || null,
    fields: {
      filingCategory: category,
      financialYear: fy,
      form: form || null,
      event: input.event || null,
      eventDate: input.eventDate || null,
      statutoryDueDate: input.statutoryDueDate || null,
      filingDate: input.filingDate || null,
      filingStatus: input.filingStatus || "Identified / due",
      overdueReason: input.overdueReason || null,
      authorizedFiler: input.authorizedFiler || null,
      ctcApplied: input.ctcApplied || null,
      acknowledgementRef: input.acknowledgementRef || null,
      linkedResolutionId: input.linkedResolutionId || null,
      financialStatementsDate: input.financialStatementsDate || null,
      agmDate: input.agmDate || null,
      notes: input.notes || null,
    },
  });
}

// Moving a filing's status. An overdue filing must carry a REASON, and the
// reason has to be one Legal actually chose -- the list is configuration, and
// LegalOS never picks one on their behalf (PART 36).
function setFilingStatus(who, perm, id, status, opts) {
  workflow.requireCap(perm, "compliance.filing.status");
  const rec = workflow.get(id);
  if (!rec || rec.type !== "secpFiling") { const e = new Error("not_found"); e.code = 404; throw e; }
  const allowed = cfg().filingStatuses || [];
  if (allowed.length && !allowed.includes(status)) {
    const e = new Error("bad_status"); e.code = 400;
    e.detail = "Unknown filing status. Configured statuses: " + allowed.join(", ");
    throw e;
  }
  const before = { filingStatus: rec.fields.filingStatus, overdueReason: rec.fields.overdueReason, filingDate: rec.fields.filingDate };

  const next = { ...rec.fields, filingStatus: status };
  if (opts && opts.filingDate) next.filingDate = String(opts.filingDate).slice(0, 40);
  if (opts && opts.acknowledgementRef) next.acknowledgementRef = String(opts.acknowledgementRef).slice(0, 200);
  if (opts && opts.overdueReason) {
    const reasons = cfg().overdueReasons || [];
    if (reasons.length && !reasons.includes(opts.overdueReason)) {
      const e = new Error("bad_reason"); e.code = 400;
      e.detail = "Choose one of the configured overdue reasons: " + reasons.join(", ");
      throw e;
    }
    next.overdueReason = opts.overdueReason;
  }

  const probe = { ...rec, fields: next };
  const stAfter = filingState(probe);
  if (stAfter.overdue && !next.overdueReason) {
    const e = new Error("reason_required"); e.code = 409;
    e.detail = "This filing is past its statutory due date. Record why it is overdue before changing its status.";
    throw e;
  }

  rec.fields = next;
  rec.updatedAt = new Date().toISOString();
  workflow.audit(who, "filing.status", rec, before, { filingStatus: status, overdueReason: next.overdueReason, filingDate: next.filingDate });
  workflow.save();
  return rec;
}

module.exports = {
  financialYears, fyEndDate, forms, obligationsFor, annualFor,
  entityOverview, entityTimeline, dashboard, filings, filingState,
  createFiling, setFilingStatus, cfg,
};

/* ------------------------------------------ compliance years from Drive */
//
// REMOVED: the board-minute derivation.
//
// This inferred a company's statutory years from pre/post-AGM minutes and
// resolutions approving audited accounts, because the SECP root was not yet
// shared with the service account and the module would otherwise have been
// empty. It saw 33 compliance years.
//
// The real statutory estate is now read directly from the Drive folder tree
// (api/secp-records.js): 43 entities and 250 entity-year folders. Keeping a
// second, narrower derivation alongside it meant the dashboard and the
// register it linked to disagreed about the size of the same thing. There is
// one dataset; every surface reads it.

module.exports.statutoryFor = statutoryFor;
module.exports.statutoryDetail = statutoryDetail;
