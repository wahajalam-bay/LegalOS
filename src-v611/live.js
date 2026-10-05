// The Drive registers, shaped for the modules that read them.
//
// The server emits neutral records (title/start/end/counterParty…). The modules
// were written against their own shapes long before Drive was connected. Rather
// than rewrite Contracts, Litigation and Compliance — and risk their filters,
// KPIs and drill-downs — the translation happens here, at the boundary.
//
// Everything produced here carries __live: true. The store never persists those
// (see store.js), so Drive stays authoritative and a stale copy can never
// linger in someone's browser.
import { api } from "./api.js";
import { hydrateLive } from "./store.js";
import { useState, useEffect } from "./core.js";
import { useActiveUser, canOpenPath } from "./rbac.js";
import { lifecycleOf, outcomeOf, positionOf, cityOf, ageBucket, filedYear } from "./litigationmodel.js";

const str = (v) => (v == null ? "" : String(v).trim());
// Mirrors the server's rule: one clean number, or nothing. A cell holding two
// figures is a composite this cannot resolve, and guessing produces a confident
// wrong number rather than an honest blank.
const num = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const raw = String(v == null ? "" : v).trim();
  const all = raw.match(/-?\d[\d,]*(?:\.\d+)?/g) || [];
  if (all.length !== 1) return 0;
  const n = parseFloat(all[0].replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

// A stable id for a Drive-derived record.
//
// The SERVER now mints this from (Drive file id, sheet, source row) — see
// registers.js recordId — so it is the single identity for a record across the
// dashboard, the register, the detail page and its documents. Use it whenever
// it is there.
//
// The local fallback below only runs for a record that predates the server id
// (an old cached payload). It is deliberately kept because it degrades to the
// array index, and an index-derived id SHIFTS whenever the tracker gains or
// loses a row — which is exactly the bug the server id fixes. Anything relying
// on the fallback is flagged by tools/data-audit.js rather than passing quietly.
/* Find a record by the id in the URL, or by an id it used to have.
   Deduplication collapses several source rows into one canonical record, and
   the ids the absorbed rows carried are still in circulation — in bookmarks, in
   emails, in someone's notes. Resolving them is the difference between "that
   contract moved" and "that contract is gone". */
export function findByIdOrLegacy(rows, id) {
  if (!id) return null;
  const list = rows || [];
  return list.find((x) => x.id === id)
    || list.find((x) => Array.isArray(x.legacyIds) && x.legacyIds.includes(id))
    || null;
}

/* NEWEST FIRST, IN AN ASCENDING SORT.
   The register sorts one key ascending, so "most recent" has to be a string
   that gets SMALLER as time moves on. Subtracting the timestamp from a fixed
   ceiling does that, zero-padded so it compares as text. A record with no
   timestamp sorts after the ones that have one rather than jumping to the top. */
const STAMP_CEIL = 1e14;
export function invStamp(at) {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return String(STAMP_CEIL).padStart(15, "0");
  return String(STAMP_CEIL - t).padStart(15, "0");
}

/* THE REGISTER'S LANDING KEY: what you raised here, then everything else.
 *
 * Both halves of this key MUST be the same width, and that is not a tidiness
 * preference -- it is the whole reason the key works.
 *
 * The register's comparator sorts text with `localeCompare(..., {numeric:true})`
 * so that "Case 2" comes before "Case 10". Numeric collation reads a run of
 * digits as ONE NUMBER, not character by character. The key used to be
 * "0" + invStamp(raisedAt) + … for a record raised here and a bare "1" + … for
 * a tracker row, which are digit runs of different LENGTHS -- so the collator
 * compared 98,209,751,664,558,098,209,792,000,000 against 1,098,215,753,600,000
 * and put the record somebody had just raised DEAD LAST, below the fold of a
 * 257-row register showing 120 at a time. It was not on the screen at all.
 * The "0"/"1" rank never survived the comparison.
 *
 * Padding the tracker branch to the same width restores it: equal-width digit
 * runs compare the same way numerically and lexicographically, so a leading 0
 * beats a leading 1 again. Build every landing key through here, so the two
 * branches cannot drift apart again.
 */
const RANK_PAD = "0".repeat(15);            // exactly invStamp's width
export function landingKey(raisedHere, raisedAt, ...tail) {
  return (raisedHere ? "0" + invStamp(raisedAt) : "1" + RANK_PAD) + tail.join("");
}

function idFor(prefix, rec, i) {
  if (rec && rec.id) return rec.id;
  const src = (rec && rec.__source) || {};
  const basis = [src.fileId || src.file || "", src.sheet || "", (rec && rec.__row) || i].join("|");
  let h = 0;
  for (let k = 0; k < basis.length; k++) h = (h * 31 + basis.charCodeAt(k)) >>> 0;
  return prefix + "-" + h.toString(36).toUpperCase().slice(0, 8);
}


/* A record the SOURCE left incomplete is still a real record. It is shown with
   a system display label in place of the missing field — never a value invented
   to fill the gap, and never written back to the source. `dataQuality` travels
   with the record so the UI can mark it and a steward can find it. */
const MISSING_LABEL = {
  caseName: "Case name missing in source",
  title: "Title missing in source",
  borrower: "Borrower missing in source",
  sender: "Sender missing in source",
  recipient: "Recipient missing in source",
  details: "Details missing in source",
  entity: "Entity missing in source",
  agenda: "Agenda missing in source",
};
const quality = (r) => ({
  dataQuality: r.__quality || "COMPLETE",
  missingFields: r.__missingFields || [],
  weakIdentity: !!r.__weakIdentity,
  sourceConflicts: r.__conflicts || [],
  lineage: r.__lineage || null,
});
// The label used in place of a field the source never filled in.
const labelFor = (r, field) => (r.__missingFields || []).includes(field) ? (MISSING_LABEL[field] || "Missing in source") : "";

const isoDate = (v) => {
  const s = str(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

// The trackers carry no risk column, so band it by contract value — the same
// rule the baked register already used, kept identical so the two agree.
function riskFor(value) {
  const v = num(value);
  if (v >= 10e9) return "critical";
  if (v >= 2e9) return "high";
  if (v >= 200e6) return "medium";
  return "low";
}

function statusFor(rec) {
  const raw = str(rec.status).toLowerCase();
  if (/terminat/.test(raw)) return "Terminated";
  if (/expir/.test(raw)) return "Expired";
  if (/pending|process/.test(raw)) return "Pending";
  if (/active|live|ongoing|current/.test(raw)) return "Active";
  const end = isoDate(rec.end);
  if (end) return new Date(end) < new Date() ? "Expired" : "Active";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Unknown";
}

// Which of the department's EXISTING work categories a contract belongs to,
// derived from where it was filed (the Drive root) and what the tracker calls
// it. Values come from WORK_CATEGORIES in data.js — the same vocabulary the
// Category filter and pills already use, so nothing new is invented.
function categoryFor(rec) {
  const src = rec.__source || {};
  const root = String(src.root || "").toLowerCase().trim();
  const type = String(rec.type || "").toLowerCase();
  // The Drive folder the legal EXPERTS filed a contract in IS its category — the
  // authoritative classification, not a guess from the agreement's title. The
  // knowledge base is one top-level folder per practice area
  // ("Commercial_Zameen Media Contracts", "Commercial_ZD Projects…",
  // "Compliance Data _LegalOS", "Litigation & Dispute - LegalOS"), so the root
  // folder decides. Everything the experts put in a Commercial_ drive is
  // Commercial — PPAs, finder's fee, leases, services and all — and nothing from
  // another drive leaks in.
  if (root.startsWith("commercial")) return "Commercial Contracts";
  if (root.startsWith("compliance")) return "Compliance";
  if (root.startsWith("litigation")) return "Litigation & Dispute";
  // Fallback only for a record with no recognised root: classify by type.
  if (/litigation|dispute|settlement|recovery suit/.test(type)) return "Litigation & Dispute";
  if (/lease|tenancy|ejar|conveyanc|sale of land|property|plot/.test(type)) return "Real Estate & Leasing";
  if (/employment|labour|labor/.test(type)) return "Labour Matters";
  if (/licen[cs]e|regulatory|compliance/.test(type)) return "Compliance";
  if (/shareholder|joint venture|board|resolution|incorporation/.test(type)) return "Corporate & Governance";
  if (/trademark|copyright|patent|\bip\b/.test(type)) return "Intellectual Property";
  if (/service|consultanc|cosultanc|maintenance|marketing|franchise|cash management|non-disclosure|supply/.test(type)) return "Admin Contracts";
  return "Commercial Contracts";
}

// One spelling per legal entity. The tracker writes the same company five ways
// ("Zameen Media Pvt", "Zameen Media (Pvt) Ltd", "Zameen Media (Private)
// Limited"…) — fold the suffix to a canonical form so the entity column, the
// filter options and the workload chart all agree on one name.
function canonEntity(raw) {
  let v = str(raw).replace(/\s+/g, " ").trim();
  if (!v || v === "-" || v === "—") return "";
  const flat = v.replace(/[(),.]/g, " ").replace(/\s+/g, " ").trim();
  const low = " " + flat.toLowerCase() + " ";
  let suffix = "";
  if (/\bsmc\b/.test(low)) suffix = " (SMC-Private) Limited";
  else if (/\b(pvt|privat[e]?)\b/.test(low)) suffix = " (Private) Limited";
  else if (/\b(ltd|limited)\b/.test(low)) suffix = " Limited";
  let base = flat
    .replace(/\b(smc[- ]?)?(pvt|privat[e]?)\b/gi, " ")
    .replace(/\b(ltd|limited)\b/gi, " ")
    .replace(/\bsmc\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  // An ALL-CAPS or all-lower spelling is the same entity typed loudly — fold
  // its case so it merges with the canonical row.
  if (base && (base === base.toUpperCase() || base === base.toLowerCase())) {
    base = base.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const out = base ? base + suffix : v;
  // Confirmed same-company pairs the suffix rule must not keep apart. The
  // canonical spelling is the register's dominant one (13 vs 4 for Dubizzle).
  const ALIASES = {
    "dubizzle labs (private) limited": "Dubizzle Labs (SMC-Private) Limited",
  };
  return ALIASES[out.toLowerCase()] || out;
}

export function adaptContracts(records) {
  return records.map((r, i) => {
    const status = statusFor(r);
    const docs = str(r.documents);
    return {
      id: idFor("DRV", r, i),
      /* The ids this record used to have, before the rows it was merged from
         were collapsed into one. A bookmark or an emailed link still carries
         one of them, so they travel with the record and the lookup resolves
         them rather than answering "not found" for a contract that is right
         there under a different id. */
      legacyIds: Array.isArray(r.__legacyIds) ? r.__legacyIds : [],
      sourceCopies: Array.isArray(r.__sourceCopies) ? r.__sourceCopies.length : 1,
      ...quality(r),
      title: str(r.title) || "(untitled agreement)",
      type: str(r.type) || "Agreement",
      contractType: str(r.type) || "Agreement",
      counterparty: str(r.counterParty) || str(r.firstParty) || "—",
      signatories: str(r.counterParty),
      handlerName: str(r.owner),
      status,
      stage: status === "Active" ? "Active" : status,
      risk: riskFor(r.value),
      currency: "PKR",
      value: num(r.value) || 0,
      start: isoDate(r.start),
      expiry: isoDate(r.end),
      city: str(r.city),
      region: str(r.region) || str(r.city),
      jurisdiction: "Pakistan",
      jur: "PK",
      dept: str(r.department),
      bu: str(r.department),
      category: categoryFor(r),
      // The tracker often signs under several entities in one cell — keep the
      // full list for filtering, the first for display.
      entityName: canonEntity(str(r.firstParty).split(/[,\n]/)[0]),
      entityNames: [...new Set(str(r.firstParty).split(/[,\n]/).map(canonEntity).filter(Boolean))],
      physicalRecord: str(r.ref),
      docFiles: docs ? docs.split(/[\n;]+|,(?=\s*[A-Za-z0-9])/).map((d) => d.trim()).filter(Boolean) : [],
      autoRenew: false,
      renewalNoticeDays: 0,
      // The scanned copies this record resolved to in the Drive knowledge base
      // — attached by the server at ingest (see api/registers.js).
      driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
      /* Why a record has no documents, so the panel can say so in words
         rather than implying the link failed (§15). */
      documentState: r.documentState || null,
      __citedDocuments: r.__citedDocuments || null,
      __live: true,
      __source: r.__source,
      __row: r.__row,
      __copies: r.__copies || 1,
      __alsoIn: r.__alsoIn || [],
    };
  });
}

export function adaptLitigation(records) {
  return records.map((r, i) => {
    const raw = str(r.status).toLowerCase();
    const open = !/complet|closed|disposed|withdraw|dismiss/.test(raw);
    const exposure = num(r.exposurePKR) || num(r.legalCost) || 0;
    return {
      /* A case raised in LegalOS already HAS a stable id, allocated by the
         server and printed on the screen the lawyer just came from. Re-deriving
         it here overwrote LIT-00001 with a content hash, so the detail page
         looked up an id that no longer existed and answered "not found" for a
         case that had just been created. Tracker rows carry no id of their own
         and keep the derived one. */
      id: (r.__origin === "LEGALOS" && r.id) ? r.id : idFor("DLIT", r, i),
      /* WHAT KIND OF MATTER THIS IS, carried through from the source
         classification so the register, the KPIs and the charts can all agree
         on which rows are court cases. A refund claim nobody filed and a
         complaint at a police station are real matters; they are simply not
         court litigation, and counting them as such overstated Active Cases
         and put "P.S Saddar Faisalabad" in the court analysis. */
      matterClass: r.matterClass || "COURT_CASE",
      matterClassBasis: r.__matterClassBasis || null,
      claimAmount: num(r.claimAmount) || 0,
      /* The identifying facts a refund claim actually has. The court register
         never needed them, so the adapter dropped them — and the Refund Claims
         register then showed a column of blanks for buyers the source names. */
      counterparty: str(r.counterparty) || "",
      project: str(r.project) || "",
      title: str(r.caseName) || labelFor(r, "caseName"),
      ...quality(r),
      caseNo: str(r.caseNo),
      /* AN UNSTATED NATURE IS NOT A "DISPUTE".
         This defaulted every row whose tracker left the nature column empty to
         the word "Dispute" — which is the name of a DIFFERENT register in this
         family (developer disputes, its own tracker, its own tab). So the case
         register showed dozens of rows typed as Disputes that are not disputes,
         the Case type filter offered a bucket that means "we do not know", and
         anyone comparing the two registers found the counts irreconcilable.
         The same words the rest of this adapter uses for an unfilled column. */
      type: str(r.nature) || "Not stated in source",
      status: open ? "Open" : "Closed",
      rawStatus: str(r.status),
      /* WHERE THE REGISTER LANDS. Three questions, in the order they matter:
         did I just add it, is it still live, and when am I next in court.
         Unsorted, the book comes back in tracker order, which put 149 closed
         cases at the top -- so the first screen of a litigation register was
         work that had already finished. This is the default sort key: live
         cases first, and within them the nearest hearing first, because the
         case you are next in court for is the one you are looking for.
         Completed cases keep their place at the end; nothing is hidden, and
         clicking any column header still sorts by that column instead.
         Records raised HERE sort above everything, newest first, so something
         just added is the first row rather than somewhere in 358. */
      landing: landingKey(r.__origin === "LEGALOS", r.__raisedAt,
        open ? "0" : "1", isoDate(r.nextHearing) || "9999-12-31"),
      risk: exposure >= 100e6 ? "high" : exposure >= 10e6 ? "medium" : "low",
      exposure,
      exposurePKR: num(r.exposurePKR),
      exposureUSD: num(r.exposureUSD),
      recoverable: num(r.recoverablePKR),
      /* Both sides of the recoverable figure, and which of the four the server
         derived from the configured rate. The card showed exposure in dollars
         and recoverable only in rupees because recoverableUSD stopped here --
         one of the two was being dropped on the way to the screen. */
      recoverablePKR: num(r.recoverablePKR),
      recoverableUSD: num(r.recoverableUSD),
      converted: r.converted || null,
      invoices: Array.isArray(r.invoices) ? r.invoices : [],
      fx: r.fx || null,
      legalCost: num(r.legalCost),
      currency: "PKR",
      counsel: str(r.counsel) || "—",
      court: str(r.court),
      /* An explicit jurisdiction wins over falling back to the court name.
         The fallback is right for tracker rows, which carry no jurisdiction
         column; it would be wrong to overwrite one the lawyer actually typed. */
      jurisdiction: str(r.jurisdiction) || str(r.court) || "Pakistan",
      entity: str(r.entity),
      position: str(r.position),
      proceedings: str(r.proceedings),
      opinion: str(r.opinion),
      outcome: str(r.outcome),
      /* WHAT "MARK DECIDED" RECORDED, carried through verbatim.
         A lifecycle and an outcome that a lawyer stated are facts; the prose
         classifier in litigationmodel.js is only the fallback for the
         thousands of tracker rows nobody will ever revisit. Dropping these
         here is what would make a case somebody had just closed reappear as
         Active with its result unread. */
      lifecycle: str(r.lifecycle),
      outcomeCode: str(r.outcomeCode),
      outcomeSummary: str(r.outcomeSummary),
      decisionDate: isoDate(r.decisionDate),
      finalNotes: str(r.finalNotes),
      /* Who recorded the decision and when — shown on the case so a reader can
         see the verdict has an author, not just a value. */
      judgmentRef: str(r.judgmentRef),
      outcomeRecordedBy: str(r.outcomeRecordedBy),
      outcomeRecordedAt: str(r.outcomeRecordedAt),
      filed: isoDate(r.filingDate),
      lastHearing: isoDate(r.lastHearing),
      nextHearing: isoDate(r.nextHearing),
      // Case files attached by the server from the Litigation Drive root.
      driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
      /* Why a record has no documents, so the panel can say so in words
         rather than implying the link failed (§15). */
      documentState: r.documentState || null,
      __citedDocuments: r.__citedDocuments || null,
      /* Carried through for cases raised in LegalOS. `moduleKey` is what makes
         a case appear in the module it was filed from instead of relying on a
         regex over its prose; the rest are the analytics fields the litigation
         team benchmarks on. Tracker rows simply have none of them. */
      moduleKey: str(r.moduleKey) || "",
      caseType: str(r.caseType) || "",
      settlement: num(r.settlementPKR),
      reserve: num(r.reservePKR),
      expectedResolution: isoDate(r.expectedResolution),
      closedDate: isoDate(r.closedDate) || isoDate(r.decisionDate),
      motions: Array.isArray(r.motions) ? r.motions : [],
      /* A case raised in LegalOS carries its own record: the real event
         timeline, the parties, the tracked deadlines and the documents filed
         with it. Tracker rows have none of these, and the detail page falls
         back to the dates it does have. */
      caseParties: Array.isArray(r.parties) ? r.parties : [],
      caseTimeline: Array.isArray(r.timeline) ? r.timeline : [],
      caseDeadlines: Array.isArray(r.deadlines) ? r.deadlines : [],
      caseDocuments: Array.isArray(r.caseDocuments) ? r.caseDocuments : [],
      caseLinks: r.links || {},
      caseHearings: Array.isArray(r.hearings) ? r.hearings : [],
      informationRequests: Array.isArray(r.informationRequests) ? r.informationRequests : [],
      internalNotes: Array.isArray(r.internalNotes) ? r.internalNotes : [],
      priority: str(r.priority),
      counselDetail: r.counselDetail || null,
      cityStated: str(r.city),
      courtCaseNumber: str(r.caseNo),
      stage: str(r.stage) || str(r.status) || "—",
      direction: str(r.direction),
      dataQuality: str(r.dataQuality),
      legacyIds: Array.isArray(r.__legacyIds) ? r.__legacyIds : [],
      sourceCopies: Array.isArray(r.__sourceCopies) ? r.__sourceCopies.length : 1,
      raisedInApp: r.__origin === "LEGALOS",
      /* The audit a reader needs on the record itself, not only in the log. */
      updatedBy: r.updatedBy || null, updatedAt: r.updatedAt || null,
      deletedAt: r.deletedAt || null, deletedBy: r.deletedBy || null,
      deletionReason: r.deletionReason || null,
      restoredAt: r.restoredAt || null, restoredBy: r.restoredBy || null,
      raisedBy: r.__raisedBy || null,
      __live: true,
      __source: r.__source,
    };
  }).map((c) => ({
    ...c,
    /* THE DERIVED MODEL, ATTACHED ONCE.
       Lifecycle, outcome, side, seat, age and filing year are asked for by the
       register's filters, the analytics tab, the dashboard and the record page.
       Deriving them here — in the one place a case is shaped — is what stops
       four screens quietly disagreeing about whether a matter is decided.
       `outcomeCode` (written by Mark Decided) always wins over the source's
       prose; nothing here infers a win from a status. */
    lifecycle: lifecycleOf(c),
    outcomeState: outcomeOf(c),
    forAgainst: positionOf(c),
    /* A case raised in LegalOS states its city; a tracker row does not carry
       one at all, so it is read out of the forum name (see cityOf). Stated
       beats derived, always. */
    city: str(c.cityStated) || cityOf(c),
    ageBucket: ageBucket(c),
    filedYear: filedYear(c),
  }));
}

export function adaptLicences(records) {
  return records.map((r, i) => {
    const expiry = isoDate(r.expiry);
    const days = expiry ? Math.round((new Date(expiry) - Date.now()) / 86400000) : null;
    return {
      id: idFor("DLIC", r, i),
      ...quality(r),
      entity: str(r.entity),
      authority: str(r.authority),
      number: str(r.number),
      issued: isoDate(r.issued),
      expiry,
      daysToExpiry: days,
      status: str(r.status) || (days == null ? "Unknown" : days < 0 ? "Expired" : days < 60 ? "Expiring" : "Valid"),
      owner: str(r.owner),
      driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
      /* Why a record has no documents, so the panel can say so in words
         rather than implying the link failed (§15). */
      documentState: r.documentState || null,
      __citedDocuments: r.__citedDocuments || null,
      __live: true,
      __source: r.__source,
    };
  });
}

// Which company a resolution belongs to.
//
// Prefer the FOLDER, not the filename: the resolutions live in one folder per
// entity ("Deevar Developers(Pvt)Ltd_Resolutions & Authorizations") while many
// of the workbooks inside are called nothing more than "00_Summary.xlsx". Using
// the filename produced entities called "000_Tracker" and "00_Summary".
function entityOf(src) {
  if (!src) return "Unattributed";
  const leaf = String(src.folder || "").split(" / ").pop() || "";
  const fromFolder = leaf
    .replace(/[_\s]*Resolutions?\s*(&|and)?\s*Authorizations?.*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  if (fromFolder && !/^resolutions?$/i.test(fromFolder)) return fromFolder;
  const fromFile = String(src.file || "")
    .replace(/^0*\s*Summary[ _-]*/i, "")
    .replace(/\s*\(\d+\)\.xlsx?$/i, "")
    .replace(/\.xlsx?$/i, "")
    .trim();
  return fromFile || "Unattributed";
}

export function adaptResolutions(records) {
  return records.map((r, i) => ({
    id: idFor("DRES", r, i),
    ...quality(r),
    date: isoDate(r.date),
    agenda: str(r.agenda),
    docNo: str(r.docNo),
    entity: entityOf(r.__source),
    driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
    __live: true,
    __source: r.__source,
  }));
}


export function adaptNotices(records) {
  return records.map((r, i) => ({
    id: idFor("DNOT", r, i),
    ...quality(r),
    noticeDate: isoDate(r.noticeDate),
    receiptDate: isoDate(r.receiptDate),
    sender: str(r.sender),
    recipient: str(r.recipient),
    category: str(r.category) || "Notice",
    details: str(r.details),
    status: str(r.status) || "—",
    replyDate: isoDate(r.replyDate),
    comments: str(r.comments),
    /* What a notice recorded in LegalOS carries and a tracker row does not.
       Passed through rather than dropped, or the register can filter on a
       direction the record page then refuses to show. */
    direction: str(r.direction) || "Not recorded",
    /* Whether the direction was STATED by whoever recorded the notice or READ
       OFF the parties by the server. A register that presents a derivation as
       a statement is one you cannot audit. */
    directionBasis: str(r.directionBasis),
    entity: str(r.entity),
    responseRequired: str(r.responseRequired),
    replyDeadline: isoDate(r.replyDeadline),
    owner: str(r.owner),
    /* Same provenance the cases carry, so the Origin card on the record page
       names who recorded the notice here and when, and the register can tell a
       recorded notice from a tracker row. */
    raisedInApp: r.__origin === "LEGALOS",
    raisedBy: r.__raisedBy || null,
    raisedAt: r.__raisedAt || null,
    /* Same rule as the case register: something recorded here is the first row,
       newest first, then the tracker's notices newest by their own date. */
    landing: landingKey(r.__origin === "LEGALOS", r.__raisedAt,
      invStamp(isoDate(r.noticeDate) ? isoDate(r.noticeDate) + "T00:00:00Z" : "")),
    updatedBy: r.updatedBy || null, updatedAt: r.updatedAt || null,
    // Every other adapter carries the linked Drive documents through; this one
    // dropped them, so a notice's Documents tab was empty even when the ingest
    // had matched its PDF.
    driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
    __live: true, __source: r.__source,
  })).sort((a, b) => (b.noticeDate || "").localeCompare(a.noticeDate || ""));
}

export function adaptLoans(records) {
  return records.map((r, i) => ({
    id: idFor("DLOAN", r, i),
    ...quality(r),
    ref: str(r.ref),
    borrower: str(r.borrower),
    lender: str(r.lender),
    amount: num(r.amount),
    currency: str(r.currency) || "PKR",
    interest: str(r.interest),
    term: str(r.term),
    agreementDate: isoDate(r.agreementDate),
    repaymentDate: isoDate(r.repaymentDate),
    status: str(r.status) || "—",
    driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
    __live: true, __source: r.__source,
  }));
}

export function adaptProperties(records) {
  return records.map((r, i) => ({
    id: idFor("DPROP", r, i),
    ...quality(r),
    project: str(r.project),
    address: str(r.address),
    city: str(r.city),
    entity: str(r.entity),
    ownership: str(r.ownership),
    jv: str(r.jv),
    value: num(r.value),
    start: isoDate(r.start),
    contractor: str(r.contractor),
    status: str(r.status),
    continued: !!r.__continued,
    driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    documentState: r.documentState || null,
    __citedDocuments: r.__citedDocuments || null,
    __live: true, __source: r.__source,
  }));
}

/* --------------------------- fetching --------------------------- */

const cache = new Map();

// One in-flight request per register, shared by every component that asks.
function fetchRegister(key) {
  if (!cache.has(key)) {
    cache.set(key, api.registers.list(key, { limit: 5000 })
      .then((r) => r.records || [])
      .catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

const ADAPTERS = {
  contracts: adaptContracts,
  litigation: adaptLitigation,
  licences: adaptLicences,
  resolutions: adaptResolutions,
  notices: adaptNotices,
  loans: adaptLoans,
  properties: adaptProperties,
};

// Read one register, adapted. Returns { rows, loading, error }.
/* Drop a register's cached promise so the next read goes back to the server.
   Without this a record created in the app cannot appear until a full reload:
   the cache is keyed by register name and holds the FIRST fetch forever. */
export function invalidateRegister(key) { cache.delete(key); }

/* `nonce` exists so a page can ask for the register again after it has changed
   something. It is not a timer: nothing refetches unless the page bumps it. */
/* `enabled` defaults to true so every existing caller is unchanged. Pass false
   and NO REQUEST IS MADE: the hook reports an empty, settled result.

   This exists because the global search palette fetched the Commercial
   contracts register on every page, for every user. A Compliance-only account
   is correctly refused by the server, so the palette produced a 403 and a
   console error on pages that have nothing to do with Commercial. The server
   was right; the caller was wrong. A client must not ask for a module the
   signed-in user cannot open -- not because the refusal is unsafe, but because
   asking at all is a bug. */
/* Which module each register belongs to. A register is only fetched for an
   account that can open the module it lives in -- checked HERE, once, rather
   than at each of the eight call sites, so a new screen cannot reintroduce the
   bug by forgetting to ask. */
const MODULE_OF_REGISTER = {
  contracts: "/contracts", properties: "/contracts",
  litigation: "/litigation", notices: "/litigation",
  licences: "/compliance", loans: "/compliance", resolutions: "/compliance",
};

export function useRegister(key, nonce, enabled = true) {
  /* PERMISSION FIRST, THEN THE REQUEST.
     The Reports, Copilot, Companies and Graph screens are reachable by an
     account with only Insight or Shared access, and every one of them pulled
     the Commercial and Litigation registers. The server refused each, exactly
     as it should, so a Compliance-only user collected four 403s and four
     console errors on pages they are entitled to be on. The server was right;
     asking at all was the bug.

     `canOpenPath` is the same engine the nav and the direct-URL refusal use,
     so nothing here is a second security model, and the server-side refusal is
     untouched. A register with no module mapping is left ungated. */
  const me = useActiveUser();
  const path = MODULE_OF_REGISTER[key] || null;
  let entitled = true;
  try { entitled = !path || !me || !me.id ? !path : canOpenPath(me, path); } catch (e) { entitled = true; }
  const allowed = enabled && entitled;

  const [state, setState] = useState(() =>
    (allowed ? { rows: null, loading: true, error: null } : { rows: null, loading: false, error: null, skipped: true }));
  useEffect(() => {
    if (!allowed) { setState({ rows: null, loading: false, error: null, skipped: true }); return undefined; }
    let alive = true;
    setState((s) => (s.loading ? s : { rows: s.rows, loading: true, error: null }));
    fetchRegister(key).then(
      (records) => {
        if (!alive) return;
        const adapt = ADAPTERS[key] || ((x) => x);
        setState({ rows: adapt(records), loading: false, error: null });
      },
      (e) => alive && setState({ rows: null, loading: false, error: e })
    );
    return () => { alive = false; };
  }, [key, nonce, allowed]);
  return state;
}

// Push the contracts register into the store so the existing Contracts module —
// its filters, KPI strip, table and workspace — sees Drive data with no change
// to any of that code.
let hydrated = false;
export async function hydrateContracts(attempt = 0) {
  if (hydrated) return;
  hydrated = true;
  try {
    const records = await fetchRegister("contracts");
    if (records && records.length) hydrateLive("contracts", adaptContracts(records));
  } catch (e) {
    // A failure here must leave the prototype's own seed data in place rather
    // than emptying the module.
    hydrated = false;
    // ...and it must not leave the page claiming "0 contracts" for the rest of
    // the session. The register is rebuilt from Drive on the server's first
    // read, so the boot request right after a restart can time out — and an
    // empty book shown as a confident zero is worse than a slow one. Retry with
    // backoff (5s, 10s, 20s, 40s) before giving up.
    if (attempt < 4) {
      const wait = 5000 * Math.pow(2, attempt);
      setTimeout(() => { hydrateContracts(attempt + 1); }, wait);
    }
  }
}

export function registerSummary() {
  return api.registers.summary();
}

// The Pakistan Contract Templates library — real Drive template documents,
// grouped by category. Fetched once (module-level cache) and shared, like the
// registers above. Returns { items, loading, error }; each item carries the
// Drive file id so it streams in-app through the same knowledge/file endpoint.
let _tplCache = null;
export function useTemplateLibrary() {
  const [state, setState] = useState({ items: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    if (!_tplCache) {
      _tplCache = api.knowledge.templates()
        .then((r) => r.items || [])
        .catch((e) => { _tplCache = null; throw e; });
    }
    _tplCache.then(
      (items) => alive && setState({ items, loading: false, error: null }),
      (e) => alive && setState({ items: null, loading: false, error: e })
    );
    return () => { alive = false; };
  }, []);
  return state;
}
