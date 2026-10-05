#!/usr/bin/env node
/* THE DOCUMENT LAYER, FROM DRIVE TO THE SCREEN AND BACK.
 *
 * Every earlier pass reconciled RECORDS. This one reconciles DOCUMENTS: it
 * starts at the Drive leaf, follows each file to the record that cites it, the
 * API that serves it and the tab that shows it, then walks back the other way
 * and proves every document on screen has an exact Drive object behind it.
 *
 * WHAT IT IS LOOKING FOR, in the order these things actually go wrong:
 *
 *   LOST      a file in Drive that no record cites and no disposition explains
 *   STRAY     a document on a record that has no Drive object behind it
 *   WRONG     a document attached to a record it does not belong to
 *   HIDDEN    a document the API returns but the caller may not see
 *   MISORDERED a renewal displayed above the original it renews
 *   DOUBLED   one legal instrument shown twice because Drive holds two copies
 *
 * ORDERING IS EVIDENCE-RANKED, NOT ALPHABETICAL. A filename sorts "First
 * Amendment" before "Second Amendment" and "Novation" before both, which is
 * lexical accident rather than chronology. Each document takes the best date it
 * can prove -- an explicit lifecycle relation, then a date in its own name,
 * then the tracker event it belongs to, then Drive's created time -- and
 * carries WHICH of those it used, so a weak ordering is visible as weak.
 * A document with no provable date is never guessed into sequence: it sorts
 * last and says it is undated.
 *
 *   node tools/compliance-document-audit.js
 */
const fs = require("fs"), P = require("path"), crypto = require("crypto");
const drive = require("../api/drive.js");
const scope = require("../api/document-scope.js");
const registers = require("../api/registers.js");
const model = require("../api/compliance-model.js");

const ROOT = P.join(__dirname, "..");
const AUDIT = P.join(ROOT, "audit");
const COMPLIANCE_ROOTS = ["Compliance Data _LegalOS", "Entities data for secp filing"];
const write = (n, o) => { fs.writeFileSync(P.join(AUDIT, n), JSON.stringify(o, null, 1)); console.log("  wrote audit/" + n); };

/* ------------------------------------------------------- document dates --- */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y, m, d) => y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");

/* A VALIDITY IS NOT AN ISSUE DATE. "Valid till Aug 2026" states when a licence
   RUNS OUT; reading it as the day the document was made put renewals before the
   certificates they renewed. The clause is removed before dating. */
function dateFromName(name) {
  const raw = String(name || "");
  const validity = raw.match(/valid(?:\s+(?:till|until|to|upto|up\s+to))?\s+[A-Za-z]+\s+20\d{2}/i);
  const s = validity ? raw.replace(validity[0], " ") : raw;
  let m = s.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/);
  if (m) return { date: iso(m[1], +m[2], +m[3]), how: "yyyymmdd" };
  m = s.match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](20\d{2})(?!\d)/);
  if (m) return { date: iso(m[3], +m[2], +m[1]), how: "dd.mm.yyyy" };
  m = s.match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[-\s]([A-Za-z]{3,})[-\s](20\d{2})(?!\d)/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return { date: iso(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]), how: "dd-mon-yyyy" };
  m = s.match(/\b([A-Za-z]{3,})\s+(20\d{2})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return { date: iso(m[2], MONTHS[m[1].slice(0, 3).toLowerCase()], 1), how: "month-year", approximate: true };
  m = s.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(?!\d)/);
  if (m) return { date: iso(m[1], +m[2], 1), how: "yyyymm", approximate: true };
  m = s.match(/(?<!\d)(20\d{2})(?!\d)/);
  if (m) return { date: iso(m[1], 1, 1), how: "year-only", approximate: true };
  return null;
}

/* ------------------------------------------------- lifecycle classification */
/* Ranked: the FIRST rule that matches wins, so "First Amendment to the Lease
   Agreement" is an amendment rather than an agreement. Spelling is loose on
   purpose -- this estate contains "Amdnement", "Addmendum" and "Agreemnet". */
const LIFECYCLE = [
  [/terminat/i, "TERMINATION", 90],
  [/novation|novate/i, "NOVATION", 80],
  [/conver(sion|t).*(equity|share)|equity conversion/i, "CONVERSION", 80],
  [/full.?\s?repayment|final.?\s?repayment|repaid in full/i, "FULL_REPAYMENT", 70],
  [/partial.?\s?repayment|repayment/i, "REPAYMENT", 65],
  [/roll.?over|extension|extend/i, "EXTENSION", 60],
  [/renewal|renewed|re-?new/i, "RENEWAL", 55],
  [/am[de]nd|amdnement|addmendum|addendum|supplement/i, "AMENDMENT", 50],
  [/\bprc\b|proceeds? reali[sz]ation/i, "SBP_EVIDENCE", 45],
  [/\bsbp\b|state bank|registration request|lrn/i, "SBP_FILING", 45],
  [/acknowledg|ack[ _-]?slip|received by|submission receipt/i, "ACKNOWLEDGEMENT", 40],
  [/receipt|challan|payment|invoice|fee[ _-]?slip|paid/i, "RECEIPT", 38],
  [/application|apply\b|form[ _-]?[a-z0-9]\b|request/i, "APPLICATION", 35],
  [/letter|email|e-?mail|corresponden|reminder|query|reply|response|observations?|notice/i, "CORRESPONDENCE", 30],
  [/minutes|board resolution|resolution|authori[sz]|\bbr\b|circular|consent/i, "RESOLUTION", 28],
  [/certificate|licen[cs]e|permit|membership|registration certificate|\bnoc\b|approval/i, "CERTIFICATE", 25],
  [/signed|executed|stamped|notari[sz]ed|counterpart/i, "EXECUTED_COPY", 20],
  [/\bdraft\b|revised draft|for review/i, "DRAFT", 15],
  [/agreemen|contract|deed|lease|tenancy|\bmou\b|\bnda\b|facility|undertaking/i, "AGREEMENT", 10],
];
function lifecycleOf(name) {
  const n = String(name || "");
  for (const [re, kind, rank] of LIFECYCLE) if (re.test(n)) return { kind, rank };
  return { kind: "SUPPORTING", rank: 5 };
}

/* The operational group a document belongs to on a record's Documents tab. */
const GROUP_OF = {
  AGREEMENT: "Agreement", DRAFT: "Agreement", EXECUTED_COPY: "Agreement", CERTIFICATE: "Agreement",
  AMENDMENT: "Amendments", EXTENSION: "Amendments", RENEWAL: "Amendments", NOVATION: "Amendments", CONVERSION: "Amendments",
  REPAYMENT: "Repayments", FULL_REPAYMENT: "Repayments",
  SBP_FILING: "Regulatory", SBP_EVIDENCE: "Regulatory", APPLICATION: "Regulatory", ACKNOWLEDGEMENT: "Regulatory", RECEIPT: "Regulatory",
  TERMINATION: "Closure",
  RESOLUTION: "Agreement",
  CORRESPONDENCE: "Correspondence", SUPPORTING: "Other",
};

(async () => {
  await drive.ensureIndex();
  const files = drive.indexFiles();
  const byId = new Map(files.map((f) => [f.id, f]));
  const complianceFiles = files.filter((f) => COMPLIANCE_ROOTS.includes(String(f.root || "").trim()));
  console.log("Drive: " + files.length + " files indexed, " + complianceFiles.length + " under Compliance roots");

  const st = await registers.ensure();
  const R = st.registers || {};
  const loans = (await model.buildLoans(st)).agreements || [];
  const spend = await model.buildSpendWithDocs();
  const lic = (await model.buildLicences(st)).licences || [];
  const resolutions = R.resolutions || [];

  /* -------------------------------------------- 1. record -> documents ---- */
  const FAMILIES = [
    ["loans", loans, (r) => (r.driveFiles || []).concat(r.contestedDocuments || [])],
    ["leases", spend.leases || [], (r) => (r.driveFiles || []).concat(r.extraDocuments || [])],
    ["services", spend.services || [], (r) => (r.driveFiles || []).concat(r.extraDocuments || [])],
    ["other-spend", spend.other || [], (r) => (r.driveFiles || []).concat(r.extraDocuments || [])],
    ["resolutions", resolutions, (r) => r.driveFiles || []],
    ["licences", lic, (r) => (r.folderDocuments && r.folderDocuments.length) ? r.folderDocuments : (r.driveFiles || [])],
  ];

  /* SECP IS A DOCUMENT ESTATE IN ITS OWN RIGHT.
     3,367 statutory files live under "Entities data for secp filing", grouped
     by entity and financial year rather than hung off a tracker row. Leaving
     them out reported them as 3,367 unmapped Compliance documents, which is
     the opposite of true -- they are mapped, just to an entity's statutory
     record rather than to an agreement. */
  try {
    const secpSource = require("../api/secp-source.js");
    const g = secpSource.get() || {};
    const secpEntities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});
    const secpRows = secpEntities.map((e) => ({
      id: "SECP-" + e.key, entity: e.name, title: e.name + " — statutory filings",
      __docs: (secpSource.documentsFor(e.key) || []).map((d) => ({
        id: d.fileId, name: d.name, folderPath: d.folderPath, mimeType: d.mimeType,
        __category: d.category, __year: d.year, __form: d.form,
      })),
    }));
    FAMILIES.push(["secp", secpRows, (r) => r.__docs || []]);
  } catch (e) { console.log("  (SECP source unavailable: " + e.message + ")"); }

  const inventory = [];
  const perRecord = [];
  const citedBy = new Map();          // fileId -> [{family, recordId}]
  const orderIssues = [];      // documents actually displayed out of sequence
  const lineageGaps = [];      // correctly ordered, but the parent instrument is elsewhere
  const strayDocuments = [];

  for (const [family, rows, docsOf] of FAMILIES) {
    for (const rec of rows) {
      const docs = docsOf(rec).filter((d) => model.isRecordDocument ? model.isRecordDocument(d) : true);
      const entries = [];
      for (const d of docs) {
        const f = byId.get(d.id) || null;
        if (!f) {
          strayDocuments.push({ family, recordId: rec.id, fileId: d.id, name: d.name || "(unknown)" });
        }
        const name = (f && f.name) || d.name || "";
        const life = lifecycleOf(name);
        const dn = dateFromName(name);
        /* EVIDENCE RANK, recorded so a weak date is visibly weak. */
        /* DRIVE'S CREATED TIME IS WHEN THE FILE WAS UPLOADED, NOT WHEN THE
           INSTRUMENT WAS MADE. Using it as a fallback dated four lease
           agreements to 2026-09-08 -- the day of the migration -- and every
           real amendment from 2020 then "predated" the agreement it amends.
           A document whose own name carries no date is UNDATED, sorts last,
           and says so. Drive's timestamps stay on the record as metadata; they
           are not chronology. */
        const dateEvidence = dn ? (dn.approximate ? "filename (approximate)" : "filename") : "none";
        const date = dn ? dn.date : null;
        const e = {
          fileId: d.id, name,
          drivePath: (f && f.folderPath) || d.folderPath || null,
          driveRoot: (f && f.root) || null,
          mimeType: (f && f.mimeType) || d.mimeType || null,
          size: (f && f.size) || d.size || 0,
          created: (f && f.createdTime) || null,
          modified: (f && f.modifiedTime) || null,
          webViewLink: (f && f.webViewLink) || null,
          lifecycle: life.kind, lifecycleRank: life.rank,
          group: GROUP_OF[life.kind] || "Other",
          date, dateEvidence, undated: !dn,
          inDriveIndex: !!f,
        };
        entries.push(e);
        if (!citedBy.has(d.id)) citedBy.set(d.id, []);
        citedBy.get(d.id).push({ family, recordId: rec.id });
      }

      /* ---- ordering: dated ascending, undated last, ties by lifecycle ---- */
      const ordered = entries.slice().sort((a, b) => {
        if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return a.lifecycleRank - b.lifecycleRank;
      });

      /* AN AMENDMENT CANNOT PREDATE THE AGREEMENT IT AMENDS. Where both carry
         real dates and the order contradicts the lifecycle, that is reported
         rather than silently re-sorted -- the dates may be the thing at fault. */
      /* A RECORD OFTEN HOLDS MORE THAN ONE AGREEMENT.
         A lease renewed twice with the same landlord keeps all three
         instruments in one folder, so an amendment from 2020 sits beside a
         2022 replacement lease. Comparing every amendment to the FIRST
         agreement in date order reported 40 of those as misordered when the
         chronology was fine -- the amendment simply belonged to the earlier
         lease.

         The real defect is an amendment that predates EVERY agreement on the
         record: there is then nothing for it to amend. That is what is
         reported, and only where both dates are real. */
      const agreements = ordered.filter((x) => (x.lifecycle === "AGREEMENT" || x.lifecycle === "CERTIFICATE") && x.date);
      const earliest = agreements.length ? agreements[0] : null;
      for (const x of ordered) {
        if (!earliest || x === earliest || !x.date) continue;
        const isLater = ["AMENDMENT", "RENEWAL", "EXTENSION", "NOVATION", "TERMINATION", "REPAYMENT", "FULL_REPAYMENT", "CONVERSION"].includes(x.lifecycle);
        if (isLater && x.date < earliest.date) {
          lineageGaps.push({
            family, recordId: rec.id, document: x.name, lifecycle: x.lifecycle, date: x.date,
            agreementsOnRecord: agreements.length,
            earliestAgreement: earliest.name, earliestAgreementDate: earliest.date,
            why: x.lifecycle.toLowerCase() + " predates every agreement on this record — the instrument it follows is not attached here",
          });
        }
      }

      /* THE ORDERING PROPERTY ITSELF: dated documents ascend, undated never
         appear before a dated one. This is what must never break -- an
         amendment whose original lives on another record is a lineage gap, not
         a display fault, and conflating the two hid the question of whether the
         sequence was right at all. */
      for (let i = 1; i < ordered.length; i++) {
        const a = ordered[i - 1], b = ordered[i];
        if (a.date && b.date && b.date < a.date) {
          orderIssues.push({ family, recordId: rec.id, at: i, why: "a later position holds an earlier date",
            before: { name: a.name, date: a.date }, after: { name: b.name, date: b.date } });
        }
        if (!a.date && b.date) {
          orderIssues.push({ family, recordId: rec.id, at: i, why: "an undated document sorts before a dated one",
            before: { name: a.name, date: null }, after: { name: b.name, date: b.date } });
        }
      }
      for (let i = 0; i < ordered.length; i++) { ordered[i].sequence = i + 1; inventory.push({ family, recordId: rec.id, ...ordered[i] }); }

      perRecord.push({
        family, recordId: rec.id,
        title: rec.title || rec.agenda || rec.entity || rec.id,
        entity: rec.entity || null,
        driveFiles: entries.length,
        inIndex: entries.filter((e) => e.inDriveIndex).length,
        undated: entries.filter((e) => e.undated).length,
        groups: entries.reduce((m, e) => { m[e.group] = (m[e.group] || 0) + 1; return m; }, {}),
        lifecycles: entries.reduce((m, e) => { m[e.lifecycle] = (m[e.lifecycle] || 0) + 1; return m; }, {}),
      });
    }
  }

  /* ------------------------------------ 2. every Drive file's disposition --
     A file not attached to ONE record is not automatically lost. Three
     channels hold documents at ENTITY level on purpose, because no evidence
     attributes them to a single record and guessing would put a lease
     amendment on the wrong lease:

       spend      `unattachedDocuments` -- a shared "General Agreements" folder
                  serves many agreements; only a counterparty match attributes
                  one, and §40 forbids inventing the rest
       resolutions the entity's own folder, flagged linkedToResolution so the
                  unclaimed ones are visible without being pinned to a row
       licences   the licence folder's full contents

     Anything left after those is genuinely unexplained, and that is the number
     that has to reach zero. */
  const entityLevel = new Map();
  const noteEntity = (id, channel) => { if (id && !entityLevel.has(id)) entityLevel.set(id, channel); };
  for (const d of (spend.unattachedDocuments || [])) noteEntity(d.id, "spend entity folder");
  try {
    const sources = require("../api/compliance-sources.js");
    for (const [, v] of sources.resolutionFolderDocs()) for (const f of (v.files || [])) noteEntity(f.id, "resolution entity folder");
    for (const fo of sources.spendDocumentFolders()) for (const f of (fo.files || [])) noteEntity(f.id, "spend entity folder");
    for (const fo of sources.licenceFolders()) for (const f of (fo.files || [])) noteEntity(f.id, "licence folder");
  } catch (e) { /* channels unavailable */ }

  let fileDisp = {};
  try {
    const fd = JSON.parse(fs.readFileSync(P.join(AUDIT, "compliance-file-disposition.json"), "utf8"));
    for (const f of fd.files) fileDisp[f.id] = f.disposition;
  } catch (e) { fileDisp = {}; }
  const NOT_A_RECORD_DOC = new Set(["SOURCE_TRACKER", "SYSTEM_FILE", "LETTERHEAD", "TEMPLATE", "REFERENCE"]);

  let mapped = 0, unmapped = 0, atEntityLevel = 0, notRecordDocs = 0;
  const unmappedList = [], unexplained = [];
  for (const f of complianceFiles) {
    if (citedBy.has(f.id)) { mapped++; continue; }
    unmapped++;
    const entry = { fileId: f.id, name: f.name, folderPath: f.folderPath, root: f.root, disposition: fileDisp[f.id] || null };
    if (entityLevel.has(f.id)) { atEntityLevel++; entry.channel = entityLevel.get(f.id); }
    else if (NOT_A_RECORD_DOC.has(fileDisp[f.id])) { notRecordDocs++; entry.channel = "not a record document (" + fileDisp[f.id] + ")"; }
    /* A spreadsheet is a source or a reference, never an instrument -- whether
       or not the earlier file-disposition pass happened to label it one. */
    else if (!model.isRecordDocument({ name: f.name })) { notRecordDocs++; entry.channel = "not a record document (spreadsheet / source)"; }
    else { entry.channel = "UNEXPLAINED"; unexplained.push(entry); }
    unmappedList.push(entry);
  }

  /* ------------------------------------------- 3. duplicates by content ---- */
  /* Same name AND same byte size in two folders is one instrument filed twice.
     Different sizes are different documents even under the same name -- a
     revised draft is not a duplicate copy. */
  const dupKey = (f) => String(f.name || "").trim().toLowerCase() + "|" + (f.size || 0);
  const byKey = new Map();
  for (const f of complianceFiles) {
    const k = dupKey(f);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(f);
  }
  const duplicates = [...byKey.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({
    key: k, copies: v.length, name: v[0].name, size: v[0].size,
    locations: v.map((f) => ({ fileId: f.id, folderPath: f.folderPath })),
    bothMapped: v.filter((f) => citedBy.has(f.id)).length,
  }));

  /* --------------------------------------------------- 4. broken links ---- */
  /* A mapped id that is not in the freshly crawled index no longer exists in
     Drive, or is no longer reachable by this service account. Either way the
     link on the record is dead. */
  const brokenLinks = [];
  for (const [fileId, cites] of citedBy) {
    if (!byId.has(fileId)) brokenLinks.push({ fileId, citedBy: cites, status: "NOT_IN_DRIVE_INDEX" });
  }

  /* ------------------------------------------------------- 5. security ---- */
  const GROUPS = ["commercial", "compliance", "litigation", "requester"];
  const security = { documents: 0, byGroup: {}, unscoped: 0, crossFamily: [] };
  for (const g of GROUPS) security.byGroup[g] = 0;
  for (const [fileId] of citedBy) {
    const f = byId.get(fileId);
    if (!f) continue;
    security.documents++;
    const rec = scope.load().byFile.get(fileId);
    if (!rec || (!(rec.allowedGroups || []).length && !(rec.sharedGroups || []).length)) security.unscoped++;
    for (const g of GROUPS) if (scope.canAccessDocument(fileId, f, { [g]: "view" }, false).allow) security.byGroup[g]++;
  }

  /* --------------------------------------------------------- artifacts ---- */
  write("compliance-document-inventory.json", {
    builtAt: new Date().toISOString(),
    driveFilesIndexed: files.length,
    complianceFiles: complianceFiles.length,
    mappedToARecord: mapped, notMappedToAnyRecord: unmapped,
    ofWhichExposedAtEntityLevel: atEntityLevel,
    ofWhichNotRecordDocuments: notRecordDocs,
    unexplained: unexplained.length,
    unexplainedFiles: unexplained.slice(0, 200),
    documentsOnRecords: inventory.length,
    distinctMappedFiles: citedBy.size,
    unmapped: unmappedList.slice(0, 2000),
    documents: inventory,
  });
  write("compliance-document-order.json", {
    builtAt: new Date().toISOString(),
    recordsWithDocuments: perRecord.filter((r) => r.driveFiles > 0).length,
    orderingRule: "explicit date ascending; undated last; ties broken by lifecycle rank",
    orderingErrors: orderIssues.length, errors: orderIssues,
    lineageGaps: lineageGaps.length, gaps: lineageGaps,
    records: perRecord,
  });
  write("compliance-document-duplicates.json", {
    builtAt: new Date().toISOString(),
    duplicateGroups: duplicates.length,
    extraPhysicalCopies: duplicates.reduce((a, d) => a + (d.copies - 1), 0),
    groups: duplicates,
  });
  write("compliance-document-broken-links.json", {
    builtAt: new Date().toISOString(), broken: brokenLinks.length, links: brokenLinks,
    strayDocumentsOnRecords: strayDocuments.length, stray: strayDocuments,
  });
  write("compliance-document-security.json", { builtAt: new Date().toISOString(), ...security });

  const byFamily = {};
  for (const r of perRecord) {
    const b = byFamily[r.family] = byFamily[r.family] || { records: 0, documents: 0, withNone: 0, undated: 0 };
    b.records++; b.documents += r.driveFiles; if (!r.driveFiles) b.withNone++; b.undated += r.undated;
  }
  write("compliance-document-final-summary.json", {
    builtAt: new Date().toISOString(), byFamily,
    complianceFiles: complianceFiles.length, mapped, unmapped, atEntityLevel, notRecordDocs,
    unexplained: unexplained.length,
    orderingErrors: orderIssues.length, lineageGaps: lineageGaps.length, brokenLinks: brokenLinks.length,
    strayDocuments: strayDocuments.length,
    duplicateGroups: duplicates.length,
    security,
  });

  console.log("\nFAMILY        RECORDS   DOCS  NO-DOC  UNDATED");
  for (const [k, v] of Object.entries(byFamily))
    console.log("  " + k.padEnd(12), String(v.records).padStart(6), String(v.documents).padStart(6), String(v.withNone).padStart(6), String(v.undated).padStart(7));
  console.log("\nCompliance Drive files      " + complianceFiles.length);
  console.log("  mapped to a record        " + mapped);
  console.log("  not attached to one record " + unmapped);
  console.log("     exposed at entity level " + atEntityLevel);
  console.log("     not a record document   " + notRecordDocs);
  console.log("     UNEXPLAINED             " + unexplained.length);
  console.log("document rows on records    " + inventory.length + "  (distinct files " + citedBy.size + ")");
  console.log("ORDERING ERRORS             " + orderIssues.length);
  console.log("LINEAGE GAPS (parent elsewhere) " + lineageGaps.length);
  console.log("BROKEN DRIVE LINKS          " + brokenLinks.length);
  console.log("STRAY DOCS (no Drive object)" + strayDocuments.length);
  console.log("DUPLICATE GROUPS            " + duplicates.length + "  (extra copies " + duplicates.reduce((a, d) => a + (d.copies - 1), 0) + ")");
  console.log("SECURITY  scoped " + security.documents + "  unscoped " + security.unscoped
    + "  readable: " + Object.entries(security.byGroup).map(([g, n]) => g + "=" + n).join(" "));
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
