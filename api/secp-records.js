// SECP: THE DRIVE FOLDER TREE IS THE REGISTER.
//
// WHAT WAS WRONG. The module reported "0 recorded filings · 52 entities · 33
// compliance years" over a Drive estate holding 43 entities, 252 entity-year
// folders and 3,367 statutory documents. Nothing was missing from the source:
// the module was reading a legacy path written when this root was not yet
// shared with the service account, which derived a handful of years from board
// minutes found in the Resolutions folders. The real statutory tree was never
// turned into records at all.
//
// SO THE FOLDER IS THE RECORD. "Group Entities / Zameen Medallion (Private)
// Limited / CY 2024" is deterministic evidence that this company has a 2024
// compliance year, whether or not any spreadsheet says so. A tracker is not
// required and never was.
//
// THREE STATES, NEVER ONE. A Form 29 PDF in CY 2023 proves the company
// PREPARED a Form 29. It does not prove SECP received it. So every statutory
// item carries:
//
//   documentStatus         is the paper on file
//   filingStatus           is there evidence it was submitted
//   acknowledgementStatus  did the regulator confirm receipt
//
// Collapsing those into one "status" is how a register comes to claim
// compliance nobody can produce a receipt for.
const source = require("./secp-source");
const provenance = require("./drive-provenance");

/* ------------------------------------------------------------ period ----- */
/* The source writes "CY 2024". That wording is preserved verbatim: relabelling
   it FY would silently restate what the business filed. */
function parsePeriod(label) {
  const m = String(label || "").match(/^(CY|FY)\s*(\d{4})$/i);
  if (!m) return { periodType: null, complianceYear: null, sourcePeriodLabel: label || null };
  return { periodType: m[1].toUpperCase(), complianceYear: Number(m[2]), sourcePeriodLabel: label };
}

/* --------------------------------------------------------- entity type --- */
/* A single-member company holds no annual general meeting, so an SMC must
   never be shown as "AGM overdue". The rule lives here, once, rather than as a
   condition repeated in every screen that happens to render an AGM row. */
function entityTypeOf(name) {
  const n = String(name || "");
  if (/\bSMC\b|single\s*member/i.test(n)) return "SMC";
  if (/\(\s*private\s*\)|\bpvt\b|private limited/i.test(n)) return "PRIVATE_LIMITED";
  /* A company registered as "… Limited" with no private or single-member
     marker is a PUBLIC limited company -- Zameen REIT Management Company
     Limited is the group's one. It was falling through to OTHER, which left a
     public company with no AGM requirement at all. The registered name is the
     source here; nothing is inferred beyond what it states. */
  if (/(?:^|[^a-z])(limited|ltd)\.?\s*$/i.test(n.trim())) return "PUBLIC_LIMITED";
  return "OTHER";
}
/* An AGM is a members' meeting: a single member company has nobody to meet.
   Private and public limited companies both hold one. */
const agmApplies = (type) => type === "PRIVATE_LIMITED" || type === "PUBLIC_LIMITED";

/* --------------------------------------------------------- classifiers --- */
/* WHAT THIS ESTATE CALLS A SET OF ACCOUNTS.
   "Audited Financials FY 2023_Zameen Delta_20240514.pdf" is a set of audited
   financial statements, and the pattern below did not match it: it looked for
   "financial statement" (singular noun phrase) and the filing convention here
   writes "Financials". 48 entity-years reported "No source document" against
   accounts that were sitting in the folder, which is how a year holding 49
   files came to look as though it held none.

   AND "_" IS A WORD CHARACTER, so \b never fires next to it -- "Form 9_[...]"
   and "11_Form 28" defeat \bform\b entirely. That is the same boundary trap
   noted in secp-source.js, which once misfiled 216 documents; these patterns
   had it too. Every name is matched with separators normalised to spaces
   (see `nameOf`) rather than by trusting \b against this estate's filenames. */
const FS_RE = /audited financial|financial statement|audited account|annual account|signed account|\bfinancials\b|\bfs\b|balance sheet|profit and loss|statement of financial position/i;
const AGM_RE = /\bagm\b|annual general meeting/i;
/* WHICH PART OF THE MEETING A DOCUMENT IS.
   An AGM leaves a paper trail in a fixed order -- the board meets first, the
   members are given notice, the meeting is held and minuted, and where the
   company could not meet in time SECP is asked for a direction or an
   extension. Listing all of it as one undifferentiated "AGM" pile means a
   lawyer looking for the notice has to open documents until they find it.
   Ordered: the first match wins, so "Pre-AGM minutes" is tested before
   "minutes" and a direction ABOUT the AGM before the meeting itself. */
const AGM_KINDS = [
  ["AGM_DIRECTION", /direction|extension|delay|section\s*147|s\.?\s*147|request to secp/i],
  ["AGM_ATTENDANCE", /attendance|quorum|proxy/i],
  ["AGM_PRE_MINUTES", /pre[\s-]?agm/i],
  ["AGM_NOTICE", /notice|intimation/i],
  ["AGM_MINUTES", /minutes|proceeding/i],
];
const agmKindOf = (d) => {
  const n = nameOf(d);
  for (const [kind, re] of AGM_KINDS) if (re.test(n)) return kind;
  return "AGM_OTHER";
};
const ACK_RE = /acknowledg|\backn\b/i;
const SUBMIT_RE = /challan|receipt|\bfiled\b|submitted|submission|ezfile|e-?zfile/i;
/* Underscores and the like become spaces so the word-boundary anchors above
   mean what they read as. Nothing else about the name is changed. */
const nameOf = (d) => String((d && d.name) || "").replace(/[_\-]+/g, " ");

/* WHAT WAS ESTABLISHED BY READING THE DOCUMENTS, NOT THEIR NAMES.
   "Audited Accoutns FY 2022_Zameen SIgma.pdf" is a set of audited accounts
   that no filename pattern will ever match, because the filename is misspelt.
   tools/secp-cy-reconcile.js --probe reads such files through Drive's content
   index and records what they turned out to be; this loads that finding.

   The overlay only ever ADDS. A finding can establish that a file is a set of
   accounts; nothing here can establish that a file is not one, because the
   index answers for roughly six documents in ten and silence is not evidence.
   Absent or unreadable, the model behaves exactly as it does without it. */
const CONTENT_FINDINGS = (() => {
  try {
    const f = require("../cache/secp-content-findings.json");
    return (f && f.findings) || {};
  } catch (e) { return {}; }
})();
/* The Drive file id is `fileId` on the raw source document and `id` only after
   docOf() has mapped it; classification happens before that, so both are
   tried. Keying on the wrong one fails silently -- it simply finds nothing. */
const provenAccounts = (d) => {
  const id = d && (d.fileId || d.id);
  return !!(id && CONTENT_FINDINGS[id]
    && CONTENT_FINDINGS[id].disposition === "AUDITED_FINANCIAL_STATEMENTS");
};
const isFinancialStatement = (d) => FS_RE.test(nameOf(d)) || provenAccounts(d);

/* THE FORM CATALOGUE IS CONFIGURATION, NOT CODE.
   config/compliance-rules.json classifies each form as "annual" or "event":
   A, 9 and 19 are annual; 3, 7 and 29 are event-triggered. This file used to
   hardcode Form 29 as annual, which contradicted the configuration and pulled
   267 change-of-officer filings into annual compliance rows -- which is why
   the event register showed 6 records over an estate that evidences hundreds.
   A form the catalogue does not list is an event filing ("OTHER"), per the
   same configuration; no statutory rule is invented here. */
function formCatalogue() {
  let forms = [];
  try { forms = (require("../config/compliance-rules.json").secp || {}).forms || []; } catch (e) { forms = []; }
  const annual = forms.filter((f) => f.category === "annual").map((f) => String(f.code).toUpperCase());
  const event = forms.filter((f) => f.category === "event" && f.code !== "OTHER").map((f) => String(f.code).toUpperCase());
  const label = {};
  for (const f of forms) label[String(f.code).toUpperCase()] = f.label || ("Form " + f.code);
  return { annual: annual.length ? annual : ["A", "9", "19"], event, label };
}
const CATALOGUE = formCatalogue();
const ANNUAL_FORMS = CATALOGUE.annual;
const formLabel = (code) => CATALOGUE.label[String(code).toUpperCase()] || ("Form " + code);
const isAnnualForm = (code) => ANNUAL_FORMS.includes(String(code).toUpperCase());

/* A date the FILENAME states. Drive's created/modified time is never a filing,
   AGM or execution date, so an undated document stays undated. */
function eventDateOf(name) {
  const n = String(name || "");
  let m = n.match(/(?<![0-9])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?![0-9])/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = n.match(/(?<![0-9])(0?[1-9]|[12]\d|3[01])[.\-\/](0?[1-9]|1[0-2])[.\-\/](20\d{2})(?![0-9])/);
  if (m) return m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
  return null;
}

/* A stable id that survives a re-crawl: it is built from the entity key and the
   source folder, never from a position in an array. */
const yearId = (entityKey, label) => "SECPY-" + entityKey.replace(/[^a-z0-9]+/g, "-") + "-" + String(label || "").replace(/[^A-Za-z0-9]+/g, "");
/* The id must survive a re-crawl AND stay distinct. Slicing the last few
   characters of the grouping key dropped the form code, so Form 29 and Form 3
   filed on one date collapsed into a single id -- 94 collisions. The whole key
   is used, with a short digest appended so a long source path cannot make two
   different keys share a prefix. */
const eventId = (entityKey, groupKey) => {
  const slug = String(groupKey || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  let h = 5381;
  for (let i = 0; i < String(groupKey).length; i++) h = ((h * 33) ^ String(groupKey).charCodeAt(i)) >>> 0;
  return "SECPE-" + entityKey.replace(/[^a-z0-9]+/g, "-") + "-" + slug + "-" + h.toString(36);
};

/* `owner` is the record the document is being listed under -- the company and
   the compliance year. A document opened in the viewer has to be able to say
   whose it is and which year it belongs to without the reader inferring it
   from the folder path, so the record hands that down rather than the document
   being expected to know it. Optional: callers outside a year pass nothing and
   the fields are simply absent. */
function docOf(d, owner) {
  return {
    ...(owner ? {
      entity: owner.entity || null,
      entityKey: owner.entityKey || null,
      sourcePeriodLabel: owner.sourcePeriodLabel || null,
      complianceYear: owner.complianceYear != null ? owner.complianceYear : null,
    } : {}),
    id: d.fileId, name: d.name, folderPath: d.folderPath, mimeType: d.mimeType,
    webViewLink: d.webViewLink, modifiedTime: d.modifiedTime,
    form: d.form || null, category: d.category || null,
    submissionEvidence: !!d.submissionEvidence,
    /* Set where the caller has staged and dated the document. documentDate is
       read from the filename only -- modifiedTime is Drive's, and is never a
       legal date. */
    stage: d.stage || null,
    documentDate: d.documentDate || null,
    /* DRIVE IS THE SOURCE OF TRUTH. Normalization renames nothing: the exact
       filename, the exact path, and the folder / parent / root ids travel with
       every document so any row can be walked back to the file it came from. */
    ...provenance.forFile({ id: d.fileId, name: d.name, folderPath: d.folderPath, root: d.root, path: d.path, webViewLink: d.webViewLink }),
    /* Set when this file physically sits inside ANOTHER entity's folder. The
       Drive path is never rewritten to match the company it belongs to. */
    sourceLocationMismatch: !!d.sourceLocationMismatch,
    filedUnder: d.filedUnder || null,
  };
}

/* The Drive folder chain for an entity-year path:
     Entities data for secp filing / <Group|Non-Group> Entities / <entity> / CY nnnn
   Each level is reported by its own Drive id. Where a company is filed inside
   another company's folder the chain is longer; the ENTITY level is the one
   holding the year folder, and the group level is the one directly under the
   root, which is what Drive structurally says. */
function folderChain(path) {
  const seg = String(path || "").split(" / ").map((x) => x.trim()).filter(Boolean);
  const at = (n) => provenance.forFolderPath(seg.slice(0, n).join(" / "));
  const root = seg.length >= 1 ? at(1) : null;
  const group = seg.length >= 2 ? at(2) : null;
  const entity = seg.length >= 3 ? at(seg.length - 1) : null;
  const year = seg.length >= 4 ? at(seg.length) : null;
  return {
    rootFolderId: root ? (root.sourceRootId || root.sourceFolderId) : null,
    rootFolderName: root ? root.sourceFolderName : null,
    groupFolderId: group ? group.sourceFolderId : null,
    groupFolderName: group ? group.sourceFolderName : null,
    entityFolderId: entity ? entity.sourceFolderId : null,
    entityFolderName: entity ? entity.sourceFolderName : null,
    yearFolderId: year ? year.sourceFolderId : null,
    exactSourceFolderName: year ? year.sourceFolderName : (entity ? entity.sourceFolderName : null),
    fullDrivePath: String(path),
  };
}

/* THE ORDER A STATUTORY YEAR IS READ IN.
   A compliance year runs: the accounts are signed, the meeting adopts them,
   the forms are prepared from them, the forms are lodged, the regulator
   acknowledges. Presenting a year folder in crawl order puts the
   acknowledgement above the accounts it acknowledges. Within a stage, order is
   chronological on the date the DOCUMENT states; undated documents keep their
   stage and sort last within it, never promoted by Drive's upload time. */
const YEAR_STAGE = [
  ["FINANCIAL_STATEMENTS", (d) => isFinancialStatement(d)],
  ["AGM", (d) => AGM_RE.test(nameOf(d)) || d.category === "AGM"],
  ["FORM", (d) => !!d.form],
  ["SUBMISSION_EVIDENCE", (d) => d.submissionEvidence || SUBMIT_RE.test(nameOf(d))],
  ["ACKNOWLEDGEMENT", (d) => ACK_RE.test(nameOf(d))],
];
function stageOf(d) {
  /* An acknowledgement is submission evidence too, so the LAST matching stage
     wins -- otherwise every acknowledgement would sort as mere evidence. */
  let stage = "SUPPORTING", rank = 98;
  YEAR_STAGE.forEach(([name, test], i) => { if (test(d)) { stage = name; rank = i; } });
  return { stage, rank };
}
function orderWithinYear(docs) {
  return docs.map((d) => ({ d, ...stageOf(d), date: eventDateOf(d.name) }))
    .sort((a, b) => (a.rank - b.rank)
      || (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0)
      || String(a.d.name).localeCompare(String(b.d.name)))
    .map((x) => Object.assign(x.d, { stage: x.stage, documentDate: x.date }));
}

/* ------------------------------------------------- annual compliance ----- */
function annualCompliance() {
  const g = source.get() || {};
  const entities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});
  const out = [];

  for (const e of entities) {
    const docs = source.documentsFor(e.key) || [];
    const type = entityTypeOf(e.name);
    const byYear = new Map();
    for (const d of docs) {
      if (!d.year) continue;
      if (!byYear.has(d.year)) byYear.set(d.year, []);
      byYear.get(d.year).push(d);
    }

    for (const y of (e.years || [])) {
      const label = y.year;
      const period = parsePeriod(label);
      const yDocs = byYear.get(label) || [];
      /* What every document in this year belongs to, handed to docOf so the
         viewer can name the company and the year without guessing. */
      const owner = { entity: e.name, entityKey: e.key, sourcePeriodLabel: label,
        complianceYear: period.complianceYear };

      const fs = yDocs.filter((d) => isFinancialStatement(d));
      const agm = yDocs.filter((d) => AGM_RE.test(nameOf(d)) || d.category === "AGM");
      const acks = yDocs.filter((d) => ACK_RE.test(nameOf(d)));
      const submitted = yDocs.filter((d) => d.submissionEvidence || SUBMIT_RE.test(nameOf(d)));

      /* Forms are counted from what the FILENAME literally prints, never
         inferred from the folder. */
      const formsPresent = {};
      for (const d of yDocs) if (d.form) (formsPresent[d.form] = formsPresent[d.form] || []).push(docOf(d, owner));

      const forms = ANNUAL_FORMS.map((f) => ({
        form: "Form " + f,
        documentStatus: formsPresent[f] ? "AVAILABLE" : "NO_SOURCE_DOCUMENT",
        documents: formsPresent[f] || [],
        /* Submission is only claimed where a receipt, challan or
           acknowledgement exists for this year. */
        filingStatus: (formsPresent[f] && submitted.length) ? "EVIDENCE_OF_SUBMISSION" : "NOT_RECORDED",
      }));
      /* Event-triggered forms found in this year's folder are NOT annual
         requirements and must not appear as annual rows -- a Form 29 lodged in
         CY 2022 says an officer changed, not that an annual return was due
         four times. They are surfaced as a cross-reference to the event
         register, which is where they are actually recorded. */
      const eventFormsInYear = Object.keys(formsPresent).filter((f) => !isAnnualForm(f))
        .map((f) => ({ form: formLabel(f), documentCount: formsPresent[f].length, isEventFiling: true }));

      out.push({
        id: yearId(e.key, label),
        entity: e.name, entityKey: e.key, entityType: type,
        group: e.group,
        ...period,
        sourceFolder: (e.folderPath || "") + " / " + label,
        source: provenance.forFolderPath((e.folderPath || "") + " / " + label),
        /* THE WHOLE CHAIN, BY ID. root -> group -> entity -> year, each as the
           Drive folder id, so a record is never re-derived by reconstructing a
           path from names later. */
        ...folderChain((e.folderPath || "") + " / " + label),
        /* ONE OPERATIONAL RECORD, EVERY SOURCE FOLDER.
           Seventeen entity-years are backed by TWO folders in Drive, because
           two companies' estates are also filed inside another company's
           folder. That is one compliance year for the business, so it stays
           one record -- but no source folder is discarded for the record being
           singular: each is listed with its own Drive id and path. */
        sourceFolders: [...new Set(yDocs.map((d) => d.folderPath).filter(Boolean))]
          .map((fp) => {
            const pr = provenance.forFolderPath(fp);
            return { fullDrivePath: fp, sourceFolderId: pr ? pr.sourceFolderId : null, parentFolderId: pr ? pr.parentFolderId : null };
          }),
        financialStatements: {
          status: fs.length ? "AVAILABLE" : "NO_SOURCE_DOCUMENT",
          documents: fs.map((d) => docOf(d, owner)),
        },
        agm: {
          applicable: agmApplies(type),
          reason: agmApplies(type) ? null : "a single-member company holds no annual general meeting",
          status: !agmApplies(type) ? "NOT_APPLICABLE" : (agm.length ? "EVIDENCED" : "NO_SOURCE_DOCUMENT"),
          documents: agm.map((d) => ({ ...docOf(d, owner), agmKind: agmKindOf(d) })),
          sourceAgmYear: y.agmFY || null,
        },
        forms,
        eventFormsInYear,
        documentStatus: yDocs.length ? "AVAILABLE" : "NO_SOURCE_DOCUMENT",
        filingStatus: submitted.length ? "EVIDENCE_OF_SUBMISSION" : "NOT_RECORDED",
        acknowledgementStatus: acks.length ? "RECEIVED" : "NONE",
        dataCompleteness: yDocs.length ? "COMPLETE" : "INCOMPLETE_SOURCE",
        evidenceStatus: yDocs.length ? (submitted.length ? "DOCUMENTED_AND_SUBMITTED" : "DOCUMENTED") : "NO_DOCUMENT_ON_FILE",
        documentCount: yDocs.length,
        documents: orderWithinYear(yDocs).map((d) => docOf(d, owner)),
        origin: "SECP_SOURCE_DRIVE",
      });
    }
  }
  return out;
}

/* ---------------------------------------------------- event filings ------ */
/* Corporate actions and extraordinary meetings are not annual returns and must
   not be folded into a compliance year. They are their own records. */
/* EVENT-BASED FILINGS.
   An event filing is triggered by something the company did -- shares
   allotted, an officer changed, the registered office moved -- not by the
   calendar. Two rules follow from that, and the previous build broke both:

   1. It skipped every document inside a CY folder. But that is exactly where
      the company files them: the Form 29 for a 2022 director change sits in
      CY 2022. Excluding year folders hid almost the entire event estate.
   2. A statutory register is not a filing (Register of Members, Share
      Certificates), so those are never counted here.

   Copies do not inflate the register: one event is one record, keyed on the
   company, the form and the date the filename states, with every physical
   copy attached. Where the filename states no date, the source folder keeps
   the copies apart rather than a date being invented for them. */
function eventFilings() {
  const g = source.get() || {};
  const entities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});
  const EVENT_CATEGORIES = ["CORPORATE_ACTION", "EOGM", "SECP_NOTICE", "INCORPORATION"];
  const NEVER = ["REGISTER_OF_MEMBERS", "REGISTER_OF_DIRECTORS", "SHARE_CERTIFICATE", "PROVIDENT_FUND"];
  const out = [];

  for (const e of entities) {
    const type = entityTypeOf(e.name);
    const groups = new Map();

    for (const d of (source.documentsFor(e.key) || [])) {
      if (NEVER.includes(d.category)) continue;
      const code = d.form ? String(d.form).toUpperCase() : null;
      /* The form printed on the document outranks the folder it sits in. A
         Form 9 inside a "Share Transfer and Director Change" folder is still
         an annual return, and belongs to that year's annual record, not here. */
      if (code && isAnnualForm(code)) continue;
      const byForm = !!code;
      const byCategory = EVENT_CATEGORIES.includes(d.category);
      if (!byForm && !byCategory) continue;

      const eventType = byForm ? "FORM_FILING" : d.category;
      const date = eventDateOf(d.name);
      const key = [code || eventType, date || ("@" + d.folderPath)].join("|");
      let rec = groups.get(key);
      if (!rec) {
        groups.set(key, (rec = {
          id: eventId(e.key, key), entity: e.name, entityKey: e.key, entityType: type, group: e.group,
          eventType, form: code ? formLabel(code) : null, formCode: code,
          eventDate: date, complianceYear: d.year ? parsePeriod(d.year).complianceYear : null,
          sourcePeriodLabel: d.year || null, sourceFolder: d.folderPath,
          source: provenance.forFolderPath(d.folderPath),
          documentStatus: "AVAILABLE", filingStatus: "NOT_RECORDED", acknowledgementStatus: "NONE",
          dataCompleteness: date ? "COMPLETE" : "INCOMPLETE_SOURCE",
          evidenceStatus: "DOCUMENTED", documents: [], documentCount: 0,
          origin: "SECP_SOURCE_DRIVE",
        }));
      }
      /* An event filing's documents carry the same provenance a compliance
         year's do, so the viewer names the company and the year whichever
         register the reader arrived from. */
      rec.documents.push(docOf(d, { entity: e.name, entityKey: e.key,
        sourcePeriodLabel: rec.sourcePeriodLabel, complianceYear: rec.complianceYear }));
      if (d.submissionEvidence || SUBMIT_RE.test(nameOf(d))) { rec.filingStatus = "EVIDENCE_OF_SUBMISSION"; rec.evidenceStatus = "DOCUMENTED_AND_SUBMITTED"; }
      if (ACK_RE.test(nameOf(d))) rec.acknowledgementStatus = "RECEIVED";
    }
    for (const rec of groups.values()) { rec.documentCount = rec.documents.length; out.push(rec); }
  }

  out.sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || "") || String(a.entity).localeCompare(String(b.entity)));
  return out;
}

/* ------------------------------------------- entity statutory registers -- */
/* A Register of Members is a corporate record, not a filing. Counting it as one
   would inflate the filing figure with paperwork nobody submitted. */
const REGISTER_CATEGORIES = {
  REGISTER_OF_DIRECTORS: "Register of Directors",
  REGISTER_OF_MEMBERS: "Register of Members",
  SHARE_CERTIFICATE: "Share Certificates",
  PROVIDENT_FUND: "Provident Fund",
  INCORPORATION: "Incorporation documents",
  /* Entity-level statutory papers that belong to no single compliance year:
     EOBI registrations, company profiles, SECP show-cause notices and the
     correspondence around them, financial statements filed outside a year
     folder, and the entity's own resolutions. Without a home here they were 65
     real documents the module simply did not show. */
  ENTITY_LEVEL: "Entity records",
  CORRESPONDENCE: "SECP correspondence",
  FINANCIAL_STATEMENTS: "Financial statements (entity level)",
  RESOLUTION: "Resolutions & authorizations",
  SECP_NOTICE: "SECP notices & orders",
  AGM: "General meetings (entity level)",
  EOGM: "General meetings (entity level)",
  CORPORATE_ACTION: "Corporate actions (entity level)",
  FILING_YEAR: "Filing-year documents (unassigned)",
};
function statutoryRegisters() {
  const EVENTED = new Set(eventFilings().flatMap((e) => e.documents.map((d) => d.id)));
  const g = source.get() || {};
  const entities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});
  const out = [];
  for (const e of entities) {
    const byCat = new Map();
    for (const d of (source.documentsFor(e.key) || [])) {
      /* A document already belonging to a compliance year or an event filing is
         not also an entity-level record. */
      if (d.year) continue;
      if (["CORPORATE_ACTION", "EOGM", "SECP_NOTICE"].includes(d.category) && EVENTED.has(d.fileId)) continue;
      if (!REGISTER_CATEGORIES[d.category]) continue;
      if (!byCat.has(d.category)) byCat.set(d.category, []);
      byCat.get(d.category).push(d);
    }
    for (const [cat, docs] of byCat) {
      out.push({
        id: "SECPR-" + e.key.replace(/[^a-z0-9]+/g, "-") + "-" + cat,
        entity: e.name, entityKey: e.key, group: e.group,
        entityType: entityTypeOf(e.name),
        register: REGISTER_CATEGORIES[cat], category: cat,
        documentCount: docs.length,
        /* A statutory register is entity-level, so it has a company but no
           compliance year -- and says so by carrying none rather than a blank. */
        documents: docs.map((d) => docOf(d, { entity: e.name, entityKey: e.key })),
        /* A register is an entity-level folder in Drive; where its documents
           all share one folder, that folder is the record's source. */
        sourceFolder: [...new Set(docs.map((d) => d.folderPath))].length === 1 ? docs[0].folderPath : (e.folderPath || null),
        source: provenance.forFolderPath([...new Set(docs.map((d) => d.folderPath))].length === 1 ? docs[0].folderPath : (e.folderPath || null)),
        isFiling: false,
        origin: "SECP_SOURCE_DRIVE",
      });
    }
  }
  return out;
}

/* FUTURE OBLIGATIONS ARE NOT DRIVE HISTORY.
   Everything else in this file is source-backed: a record exists because a
   folder exists. These are the opposite -- nothing in Drive proves them,
   because they have not happened yet. They are computed from the statutory
   rules in config/compliance-rules.json (year end, the days allowed after it
   for the annual return and the AGM) and they are marked SYSTEM_GENERATED so
   no screen can present one beside a CY 2024 record as if Drive said so.

   The UI used to show "FY 2028 / FY 2027 / FY 2026" at the top of the
   statutory workspace -- a formula's output, sitting above ten years of real
   filings, reading exactly like source. They live in their own view now. */
function upcomingObligations(opts) {
  let rules = {};
  try { rules = (require("../config/compliance-rules.json").secp || {}); } catch (e) { rules = {}; }
  const endMonth = rules.financialYearEndMonth || 6;
  const endDay = rules.financialYearEndDay || 30;
  const arDays = rules.annualReturnDaysAfterYearEnd;
  const agmDays = rules.agmDaysAfterYearEnd;
  const forms = (rules.forms || []).filter((f) => f.category === "annual");

  const now = (opts && opts.now) ? new Date(opts.now) : new Date();
  /* The compliance year that has ENDED and is therefore now due. A year whose
     end has not arrived owes nothing yet, and is not listed. */
  const thisYearEnd = new Date(Date.UTC(now.getUTCFullYear(), endMonth - 1, endDay));
  const lastEndedYear = now >= thisYearEnd ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  const g = source.get() || {};
  const entities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});
  const annual = annualCompliance();
  const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  const out = [];
  for (const e of entities) {
    const type = entityTypeOf(e.name);
    const yearEnd = new Date(Date.UTC(lastEndedYear, endMonth - 1, endDay));
    const period = "CY " + lastEndedYear;
    /* If Drive already holds this compliance year, the obligation is not
       "upcoming" -- the company has started filing it. It is reported with
       what the source shows, rather than as a clean future item. */
    const existing = annual.find((r) => r.entityKey === e.key && r.sourcePeriodLabel === period);

    const items = forms.map((f) => ({
      requirement: f.label || ("Form " + f.code), formCode: String(f.code).toUpperCase(),
      statutoryDueDate: arDays != null ? addDays(yearEnd, arDays) : null,
      basis: arDays != null ? "config: annualReturnDaysAfterYearEnd = " + arDays + " days after year end" : "no due date configured",
      documentStatus: existing
        ? ((existing.forms.find((x) => x.form === (f.label || ("Form " + f.code))) || {}).documentStatus || "NO_SOURCE_DOCUMENT")
        : "NO_SOURCE_DOCUMENT",
    }));
    if (agmApplies(type)) {
      items.push({
        requirement: "Annual General Meeting", formCode: null,
        statutoryDueDate: agmDays != null ? addDays(yearEnd, agmDays) : null,
        basis: agmDays != null ? "config: agmDaysAfterYearEnd = " + agmDays + " days after year end" : "no due date configured",
        documentStatus: existing ? existing.agm.status : "NO_SOURCE_DOCUMENT",
      });
    }

    out.push({
      id: "SECPU-" + e.key.replace(/[^a-z0-9]+/g, "-") + "-" + lastEndedYear,
      entity: e.name, entityKey: e.key, entityType: type, group: e.group,
      complianceYear: lastEndedYear, sourcePeriodLabel: period, periodType: "CY",
      yearEnd: yearEnd.toISOString().slice(0, 10),
      agmApplicable: agmApplies(type),
      agmReason: agmApplies(type) ? null : "a single-member company holds no annual general meeting",
      requirements: items,
      outstanding: items.filter((i) => i.documentStatus !== "AVAILABLE").length,
      overdue: items.filter((i) => i.documentStatus !== "AVAILABLE" && i.statutoryDueDate && i.statutoryDueDate < now.toISOString().slice(0, 10)).length,
      sourceBacked: !!existing,
      sourceYearId: existing ? existing.id : null,
      // Never confusable with a Drive-backed record.
      origin: "SYSTEM_GENERATED",
      basis: "computed from config/compliance-rules.json; no Drive folder asserts this",
    });
  }
  out.sort((a, b) => (b.overdue - a.overdue) || String(a.entity).localeCompare(String(b.entity)));
  return out;
}

function summary() {
  const annual = annualCompliance();
  const events = eventFilings();
  const registers = statutoryRegisters();
  const g = source.get() || {};
  const entities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});
  return {
    entities: entities.length,
    groupEntities: entities.filter((e) => e.group === "group").length,
    nonGroupEntities: entities.filter((e) => e.group !== "group").length,
    entityYearRecords: annual.length,
    distinctYears: [...new Set(annual.map((a) => a.sourcePeriodLabel))].length,
    eventFilings: events.length,
    statutoryRegisters: registers.length,
    /* The number that may be called a FILING: an item with evidence it reached
       the regulator. Everything else is a document on file. */
    provenSubmissions: annual.filter((a) => a.filingStatus === "EVIDENCE_OF_SUBMISSION").length
      + events.filter((e) => e.filingStatus === "EVIDENCE_OF_SUBMISSION").length,
    /* Counted over the same population as provenSubmissions -- annual AND
       event. Counting one over both registers and the other over only annual
       made acknowledgements look scarcer than the filings they belong to. */
    acknowledgementsReceived: annual.filter((a) => a.acknowledgementStatus === "RECEIVED").length
      + events.filter((e) => e.acknowledgementStatus === "RECEIVED").length,
    yearsWithNoDocument: annual.filter((a) => a.documentStatus === "NO_SOURCE_DOCUMENT").length,
    documentsOnAnnualRecords: annual.reduce((a, r) => a + r.documentCount, 0),
    documentsOnEventFilings: events.reduce((a, r) => a + r.documentCount, 0),
    documentsOnRegisters: registers.reduce((a, r) => a + r.documentCount, 0),
    /* DISTINCT FILES, NOT THE SUM OF THE THREE ABOVE. An event filing's
       documents are the same Drive files as the compliance-year folder holding
       them, so the three counts overlap and adding them overstates the estate.
       This is the number of statutory files that exist. */
    /* Two numbers, because they answer two questions. `documents` is how many
       distinct INSTRUMENTS the estate holds -- what a reader can open, and what
       every drill-down counts. `physicalFiles` is how many files sit in Drive;
       the difference is the same instrument filed in more than one source
       folder. Reporting the file count under a "documents" label is what made
       the register say 3,367 over pages that add up to 3,150. */
    ...(() => {
      const ids = new Set(), logical = new Set();
      for (const coll of [annual, events, registers]) {
        for (const r of coll) for (const d of (r.documents || [])) {
          ids.add(d.fileId || d.id);
          logical.add(r.entityKey + "::" + String(d.name || "").trim().toLowerCase() + "|" + (d.size || 0));
        }
      }
      return { documents: logical.size, physicalFiles: ids.size,
        duplicateSourceCopies: ids.size - logical.size };
    })(),
    /* OUTSTANDING REQUIREMENTS, not companies and not every requirement.
       Two different mistakes lived under this one label. The overview printed
       the ENTITY count (43) where the rules raise requirements; and the raw
       requirement list (147) includes the 60 that Drive already holds the
       document for. What a Legal user means by "upcoming obligations" is the
       work still to do, which is what the entity register has always summed. */
    upcomingObligations: upcomingObligations().reduce((n, u) =>
      n + u.requirements.filter((i) => i.documentStatus !== "AVAILABLE").length, 0),
    upcomingRequirementsTotal: upcomingObligations()
      .reduce((n, u) => n + u.requirements.length, 0),
  };
}

module.exports = {
  upcomingObligations, annualCompliance, eventFilings, statutoryRegisters, summary, entityTypeOf, agmApplies, parsePeriod };
