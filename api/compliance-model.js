// The compliance DOMAIN model, derived from the ingested source registers.
//
// The ingest reads spreadsheets faithfully: one source row in, one record out,
// with stable ids and lineage. That is correct for ingestion and wrong as a
// domain model, because the loan trackers are not one-row-per-loan.
//
// WHAT THE SOURCE ACTUALLY CONTAINS (audited — see COMPLIANCE_IMPLEMENTATION_REPORT.md):
//
//   FDI_Loan_Tracker.xlsx
//     - "Master Tracker" sheet  : 20 rows, one per international loan
//     - per-entity sheets       : 113 rows -- the ROLLOVER / REGISTRATION /
//                                 REPAYMENT history of those same loans, in
//                                 blocks separated by a repeated header row
//   OLX_Loan_Tracker.xlsx       : 19 rows -- the same history shape, 5 OLX loans
//   Inter Company Loans Tracker : 40 rows, one per intercompany loan
//
// So 192 ingested rows describe 60 loan agreements, 117 historical events and 15
// repeated header rows. Rendering all 192 as "loans" overstates the portfolio
// three-fold and hides the history the compliance team needs.
//
// This module derives the real shape. It does NOT rewrite the ingest: every
// source row keeps its id, its lineage and its documents, and every row stays
// reachable -- an event row through its parent loan's timeline, a header
// artifact through the data-health surface. Nothing is deleted to make a number
// look better.

const fs = require("fs");
const path = require("path");
const { ROOT } = require("./config");
const registers = require("./registers");
const entities = require("./entities");
const sources = require("./compliance-sources");

let RULES = null;
function rules() {
  if (RULES) return RULES;
  try { RULES = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "compliance-rules.json"), "utf8")); }
  catch (e) { RULES = { sbp: { byCategory: {} }, renewal: {}, secp: {} }; }
  return RULES;
}

/* -------------------------------------------------------------- row triage */

// A repeated header row: every cell equals its own column name. These are real
// rows in the spreadsheet (they separate the blocks) but they are not records.
function isHeaderArtifact(r) {
  const raw = r.__raw || {};
  const ks = Object.keys(raw);
  if (!ks.length) return false;
  return ks.every((k) => String(raw[k]).trim() === String(k).trim());
}

const SRC = {
  FDI_MASTER: "fdi-master",
  FDI_EVENTS: "fdi-events",
  OLX_EVENTS: "olx-events",
  INTERCOMPANY: "intercompany",
};

function sourceKind(r) {
  const file = String((r.__source && r.__source.file) || "");
  const sheet = String((r.__source && r.__source.sheet) || "");
  if (/^FDI_Loan_Tracker/i.test(file)) return sheet === "Master Tracker" ? SRC.FDI_MASTER : SRC.FDI_EVENTS;
  if (/^OLX_Loan_Tracker/i.test(file)) return SRC.OLX_EVENTS;
  if (/Inter Company Loans/i.test(file)) return SRC.INTERCOMPANY;
  return null;
}

/* --------------------------------------------------------------- SBP state */

// Read the registration state out of the tracker's own "Status / Notes" prose.
// The vocabulary below is matched against what the source actually says; text we
// do not recognise returns null, and the caller falls back to UNKNOWN rather
// than to a flattering guess.
const SBP = {
  NOT_REQUIRED: { key: "NOT_REQUIRED", label: "Not required" },
  PENDING: { key: "PENDING", label: "Pending registration" },
  SUBMITTED: { key: "SUBMITTED", label: "Submitted" },
  REGISTERED: { key: "REGISTERED", label: "Registered" },
  REJECTED: { key: "REJECTED", label: "Rejected / returned" },
  UNKNOWN: { key: "UNKNOWN", label: "Unknown - source missing" },
};

function sbpFromNote(note) {
  const s = String(note || "");
  if (!s.trim()) return null;
  if (/\breject|\breturned\b|\bdeclined\b/i.test(s)) return SBP.REJECTED;
  if (/\bnot registered\b|\bno LRN\b|\bnot on file\b/i.test(s)) return SBP.PENDING;
  // "Registration requested 22-Nov-2024" means submitted and not yet confirmed.
  // "Registered (request 27-Dec-2023)" means confirmed -- the word "registered"
  // stands alone rather than inside "registration requested".
  const registeredStandalone = /\bregistered\b/i.test(s.replace(/registration requested/ig, ""));
  if (/registration requested/i.test(s) && !registeredStandalone) return SBP.SUBMITTED;
  if (registeredStandalone) return SBP.REGISTERED;
  return null;
}

/* -------------------------------------------------------------- event kind */

// Classify a history row by what the tracker says happened. Every label here
// corresponds to wording that appears in the source; an unmatched row becomes a
// neutral "Rollover / extension", which is what an execution-date plus a new
// repayment-due date means in these trackers.
function classifyEvent(note, isFirst) {
  const s = String(note || "");
  if (/NOT REPAID|OVERDUE/i.test(s)) return { kind: "status", label: "Outstanding / overdue" };
  if (/\bREPAID\b/i.test(s)) return { kind: "repayment", label: "Repayment" };
  if (/\bwithdrawn\b/i.test(s)) return { kind: "termination", label: "Withdrawn" };
  if (/\bconver(t|sion)/i.test(s)) return { kind: "conversion", label: "Conversion" };
  if (/\bnovat/i.test(s)) return { kind: "novation", label: "Novation" };
  if (isFirst) return { kind: "origination", label: "Original agreement" };
  return { kind: "rollover", label: "Rollover / extension" };
}

/* ------------------------------------------------------------ date parsing */

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// The trackers write dates as "02-Sep-2020", "24 November 2020", "~18 Jun 2022",
// "31-May-2023 (request)", "15 Aug 2025" with a warning glyph, and ISO. Parse
// what we can and return null otherwise, so downstream code shows the original
// text rather than a wrong date.
function parseLooseDate(v) {
  if (v == null) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s || s === "-" || s === "—") return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo != null) return m[3] + "-" + String(mo + 1).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0");
  }
  m = s.match(/([A-Za-z]{3,})[-\s](\d{1,2}),?[-\s](\d{4})/);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo != null) return m[3] + "-" + String(mo + 1).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0");
  }
  return null;
}

/* --------------------------------------------------------- loan derivation */

// Split per-entity sheet rows into blocks. A repeated header row starts a new
// block; within a block the first row carries the loan reference and later rows
// inherit it (the spreadsheet leaves the cell blank to mean "same loan").
function blocksOf(rows) {
  const out = [];
  let cur = null;
  for (const r of rows) {
    if (isHeaderArtifact(r)) { cur = null; continue; }
    if (!cur) { cur = []; out.push(cur); }
    cur.push(r);
  }
  return out;
}

// Text the trackers use to mean "there is no LRN for this loan". These are NOT
// references and must never be used to join anything: "N/A - no registration
// records" appears against three different Daftarkhwan loans, so matching on it
// would attach one loan's history to another -- precisely the fabricated
// relationship the brief forbids. A placeholder therefore yields no reference at
// all, and the row falls through to the entity check below, which attaches only
// when it is unambiguous.
const PLACEHOLDER_REF = /^(n\/?a|not registered|no lrn|lrn not on file|lrn not legible|lrn\b.*verify|see sub-?heading|tbc|unknown)\b/i;

const cleanRef = (v) => {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  // "18-2-ZAMEEN ONE/117/11-2021 (digits partly illegible - verify)" -> base ref
  const base = s.replace(/\s*\(.*\)\s*$/, "").replace(/\s*—.*$/, "").trim();
  if (!base || PLACEHOLDER_REF.test(base)) return "";
  return base;
};

// An LRN is a structured number: "18-2-ZAMEEN ONE/98/11-2020". The entity label
// inside it is written inconsistently across sheets ("ZAMEEN [DEV]" vs
// "ZAMEEN [DEVELOPMENTS]", "OLX" vs "Online Classifieds Pakistan"), so joining
// on the literal string loses real matches. Join on the DIGIT GROUPS instead,
// which are the part that actually identifies the registration, and keep them as
// written so "04" never collides with "4".
function refKey(ref) {
  const groups = String(ref || "").match(/\d+/g);
  return groups && groups.length >= 2 ? groups.join("-") : "";
}

/* `stOverride` lets the register build hand its own in-flight state in.
   Without it this calls registers.ensure() and, when invoked FROM the register
   build, re-enters the build it is part of. The raw tracker rows are read from
   `loansSource` when present: once the served loans register holds the 69
   logical loans, the 192 source rows still have to be reachable, because they
   are what this function reconciles. */
async function buildLoans(stOverride) {
  const st = stOverride || await registers.ensure();
  const reg = (st && st.registers) || {};
  const all = reg.loans || [];

  const agreements = [];
  const artifacts = [];
  const eventsByRef = new Map();   // ref -> [event]
  const eventsBySheet = new Map(); // sheet -> [event]  (fallback linkage)

  // --- pass 1: the agreements themselves -----------------------------------
  for (const r of all) {
    if (isHeaderArtifact(r)) { artifacts.push(r); continue; }
    const kind = sourceKind(r);
    if (kind === SRC.FDI_MASTER) agreements.push(makeAgreement(r, "international"));
    else if (kind === SRC.INTERCOMPANY) agreements.push(makeAgreement(r, "intercompany"));
  }

  // --- pass 2: the history rows --------------------------------------------
  const histRows = all.filter((r) => {
    const k = sourceKind(r);
    return (k === SRC.FDI_EVENTS || k === SRC.OLX_EVENTS) && !isHeaderArtifact(r);
  });

  const bySheet = new Map();
  for (const r of histRows) {
    const k = (r.__source.file || "") + " :: " + (r.__source.sheet || "");
    if (!bySheet.has(k)) bySheet.set(k, []);
    bySheet.get(k).push(r);
  }

  for (const rows of bySheet.values()) {
    rows.sort((a, b) => (a.__row || 0) - (b.__row || 0));
    for (const block of blocksOf(rows)) {
      let blockRef = "";
      for (const r of block) {
        const raw = r.__raw || {};
        const kind = sourceKind(r);
        const ref = cleanRef(raw["Loan Ref / LRN"] != null ? raw["Loan Ref / LRN"] : raw["LRN"]);
        // A reference we cannot key on is not a reference. Bare "LRN" (all that
        // survives of "LRN - verify") must not become a join value.
        if (ref && refKey(ref)) blockRef = ref;
        const note = raw["Status / Notes"] || "";
        // The OLX tracker repeats the loan's ORIGINAL agreement date on every
        // row; only the repayment due date advances. Treating that constant as
        // the event date would date every rollover to 2020. Order those rows by
        // the date that actually moves.
        const constantDate = kind === SRC.OLX_EVENTS;
        const evDate = constantDate ? null : parseLooseDate(raw["Execution Date"] || raw["Agreement Date"]);
        const due = parseLooseDate(raw["Repayment Due (after event)"] || raw["Repayment Due"]);
        const cls = classifyEvent(note, false);
        const ev = {
          id: r.id,
          ref: blockRef || null,
          refKey: refKey(blockRef),
          kind: cls.kind,
          label: constantDate && cls.kind === "rollover" ? "Repayment date on record" : cls.label,
          date: evDate,
          dateText: constantDate ? null : (String(raw["Execution Date"] || raw["Agreement Date"] || "").trim() || null),
          repaymentDue: due,
          repaymentDueText: String(raw["Repayment Due (after event)"] || raw["Repayment Due"] || "").trim() || null,
          note: String(note).trim() || null,
          sbp: sbpFromNote(note),
          tracker: r.__source.file,
          sheet: r.__source.sheet,
          row: r.__row,
          source: r.__source,
          lineage: r.__lineage,
          /* A COPY, NOT THE REGISTER'S OWN ARRAY.
         This shared the array by reference, and attachSpendDocuments then
         pushed matched documents into it -- writing them straight back into
         registers.contracts. The security diff derives citations from those
         rows, so its answer changed depending on whether buildSpend had been
         called first: 16 documents read as widened AND narrowed inside Data
         Health and as neither from a standalone run. A gate whose result
         depends on call order is not a gate. */
      driveFiles: (r.driveFiles || []).slice(),
          origin: "source", // came from the spreadsheet, not from a LegalOS action
        };
        if (blockRef) {
          const k = refKey(blockRef) || blockRef;
          if (!eventsByRef.has(k)) eventsByRef.set(k, []);
          eventsByRef.get(k).push(ev);
        } else {
          const sk = r.__source.sheet || "?";
          if (!eventsBySheet.has(sk)) eventsBySheet.set(sk, []);
          eventsBySheet.get(sk).push(ev);
        }
      }
    }
  }

  // --- pass 3: attach history to its agreement -----------------------------
  // Index by structural reference key. Where two agreements share one key the
  // link is AMBIGUOUS -- the master tracker really does carry the same LRN twice
  // (one row is annotated "as cited - verify") -- so we attach to neither and
  // say so, rather than silently picking whichever was indexed last.
  const byRef = new Map();
  for (const a of agreements) {
    const k = refKey(a.ref);
    if (!k) continue;
    if (!byRef.has(k)) byRef.set(k, []);
    byRef.get(k).push(a);
  }

  let attached = 0;
  const orphanEvents = [];
  const ambiguous = [];
  for (const [k, evs] of eventsByRef) {
    const cands = byRef.get(k) || [];
    if (cands.length === 1) { cands[0].events.push.apply(cands[0].events, evs); attached += evs.length; }
    else {
      if (cands.length > 1) ambiguous.push({ refKey: k, agreements: cands.map((a) => a.id), events: evs.length });
      orphanEvents.push.apply(orphanEvents, evs);
    }
  }
  // Events whose block carried no usable reference: attach only when the sheet
  // maps to exactly ONE agreement, so we never guess a parent.
  for (const [sheet, evs] of eventsBySheet) {
    const cands = agreements.filter((a) => a.entityKey && a.entityKey === entities.entityKey(sheet));
    if (cands.length === 1) { cands[0].events.push.apply(cands[0].events, evs); attached += evs.length; }
    else orphanEvents.push.apply(orphanEvents, evs);
  }

  // --- pass 4: attach the DOCUMENT history discovered in Drive -------------
  // The trackers record rollovers as rows; Drive records them as documents, and
  // the two are complementary -- the intercompany loans have no event rows at
  // all, but their folders carry First/Second/Third Amendment subfolders. Both
  // are merged into one chronology, each event tagged with where it came from.
  let folders = [];
  try { folders = sources.loanFolders(); } catch (e) { folders = []; }
  const usedFolders = new Set();

  // A Drive folder holds ONE loan's documents, so it may be claimed by at most
  // one agreement. Matching each agreement independently attached the same
  // history to two records: the intercompany tracker has two Zameen Arcs loans
  // from Zameen Venture One, and both matched the "Rs. 30 mil." folder on
  // parties alone. Score every claim first, then award each folder to its single
  // best claimant -- and to NOBODY on a tie, because a tie means we cannot tell
  // which loan the documents belong to.
  const claims = new Map(); // folderPath -> [{ agreement, score, why }]
  for (const a of agreements) {
    const match = sources.matchFolderToLoan(a, folders);
    a.driveFolder = null;
    if (!match) continue;
    if (match.ambiguous) { a.driveFolder = { ambiguous: true, candidates: match.candidates }; continue; }
    const key = match.folder.folderPath;
    if (!claims.has(key)) claims.set(key, []);
    claims.get(key).push({ agreement: a, folder: match.folder, score: match.score, why: match.why });
  }

  const contestedFolders = [];
  for (const [folderPath, list] of claims) {
    list.sort((x, y) => y.score - x.score);
    if (list.length > 1 && list[0].score === list[1].score) {
      contestedFolders.push({
        folderPath,
        claimants: list.filter((c) => c.score === list[0].score).map((c) => c.agreement.id),
      });
      for (const c of list) {
        c.agreement.driveFolder = { contested: true, path: folderPath, name: c.folder.name,
          claimants: list.map((x) => x.agreement.id) };
        /* CONTESTED IS NOT A REASON TO HIDE THE PAPERWORK.
           Two tracker rows claim this one Drive folder with equal evidence, so
           neither can be given its 11 documents as its own -- the loan
           agreement, both amendments and the board minutes for a Rs. 30m
           facility. Attaching them to one would be a guess; attaching them to
           neither made them disappear from LegalOS entirely, which is worse.

           They are carried on EVERY claimant as `contestedDocuments`, held
           apart from `driveFiles` so nothing downstream treats them as settled,
           and naming the other claimants so the ambiguity is the first thing a
           reader sees rather than something they have to notice. */
        c.agreement.contestedDocuments = (c.folder.files || []).filter(isRecordDocument).map((f) => ({
          id: f.id, name: f.name, mimeType: f.mimeType, size: f.size,
          folderPath: f.folderPath, webViewLink: f.webViewLink,
          modifiedTime: f.modifiedTime, createdTime: f.createdTime,
          contestedWith: list.map((x) => x.agreement.id).filter((id) => id !== c.agreement.id),
          why: "this Drive folder is claimed by " + list.length + " loan records with equal evidence",
        }));
      }
      continue;
    }
    const win = list[0];
    usedFolders.add(folderPath);
    win.agreement.driveFolder = {
      path: folderPath,
      name: win.folder.name,
      matchedOn: win.why,
      markers: win.folder.meta.markers,
      ...(list.length > 1 ? { alsoClaimedBy: list.slice(1).map((c) => c.agreement.id) } : {}),
    };
    win.agreement.documentEvents = win.folder.events;

    /* EVERY FILE IN A LOAN'S OWN FOLDER BELONGS TO THAT LOAN.
       Documents were attached by matching tokens between the filename and the
       loan's borrower/lender/reference, which left 122 files sitting inside
       their own loan's folder attached to nothing: board minutes approving the
       facility, "First Amendment to Loan Agreement [PKR 860 mil.]", the equity
       conversion papers. A token matcher cannot see that "Meeting Minutes
       [increase in loan term to 30 june 24]" is about this loan; the folder
       can, because somebody filed it there deliberately.

       Containment in the matched folder IS the deterministic association §40
       asks for -- it is not a guess from a shared word or a nearby entity. */
    const own = new Set((win.agreement.driveFiles || []).map((f) => f.id));
    for (const f of (win.folder.files || [])) {
      if (own.has(f.id) || !isRecordDocument(f)) continue;
      (win.agreement.driveFiles = win.agreement.driveFiles || []).push({
        id: f.id, name: f.name, mimeType: f.mimeType, size: f.size,
        folderPath: f.folderPath, webViewLink: f.webViewLink,
        modifiedTime: f.modifiedTime, createdTime: f.createdTime,
        via: "loan-folder-contents",
      });
      own.add(f.id);
    }
    // Folder-name status markers are source evidence: "[Loan Repaid]",
    // "[WITHDRAWN]", "[filed with HBL]", "[not filed]".
    win.agreement.folderMarkers = win.folder.meta;
  }

  // --- pass 5: loans that exist in DRIVE but in no tracker -----------------
  // Nine loan folders match no spreadsheet row -- among them a withdrawn AED
  // 3.6m facility with 55 documents, a Deevar/Bayut loan and two convertible
  // loans. They are real agreements with real evidence, and leaving them out
  // would mean a clean-looking register that quietly ignores material sitting in
  // Drive. They are included and marked DRIVE_ONLY, with every field that has no
  // source left null rather than guessed.
  const driveOnly = [];
  const seenSig = new Map();
  // A CONTESTED folder is not an extra loan. It belongs to one of the two
  // agreements claiming it -- we simply cannot tell which -- so inventing a
  // third record for it would turn an unresolved question into a fake loan.
  const contestedPaths = new Set(contestedFolders.map((c) => c.folderPath));
  for (const fo of folders) {
    if (usedFolders.has(fo.folderPath) || contestedPaths.has(fo.folderPath)) continue;
    const rec = makeDriveOnlyAgreement(fo);
    // The same convertible loan appears under BOTH loan trees with different
    // document sets. We do not silently merge them -- we cannot tell from the
    // folders alone whether that is one loan filed twice or two counterpart
    // records -- so both are kept and cross-flagged for a human to resolve.
    const sig = [fo.category === "x" ? "" : "",
      String(rec.title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).sort().join(" ")].join("");
    const prior = seenSig.get(sig);
    if (prior) {
      rec.possibleDuplicateOf = prior.id;
      prior.possibleDuplicateOf = rec.id;
      rec.__quality = "DRIVE_ONLY_POSSIBLE_DUPLICATE";
      prior.__quality = "DRIVE_ONLY_POSSIBLE_DUPLICATE";
    } else seenSig.set(sig, rec);
    driveOnly.push(rec);
  }
  agreements.push(...driveOnly);

  // --- pass 6: derive current effective terms from the history -------------
  for (const a of agreements) finalise(a);

  const unmatchedFolders = folders
    .filter((f) => !usedFolders.has(f.folderPath) && !contestedPaths.has(f.folderPath))
    .map((f) => ({ folderPath: f.folderPath, name: f.name, category: f.category, documents: f.files.length }));

  return {
    agreements,
    loanFolders: folders.length,
    contestedFolders,
    unmatchedFolders,
    artifacts: artifacts.map((r) => ({ id: r.id, sheet: r.__source.sheet, row: r.__row, source: r.__source })),
    orphanEvents,
    ambiguous,
    reconciliation: {
      sourceRows: all.length,
      agreements: agreements.length,
      trackerAgreements: agreements.length - driveOnly.length,
      driveOnlyAgreements: driveOnly.length,
      historyRows: histRows.length,
      historyAttached: attached,
      historyUnattached: orphanEvents.length,
      historyAmbiguous: ambiguous.reduce((s, x) => s + x.events, 0),
      headerArtifacts: artifacts.length,
      contestedFolders: contestedFolders.length,
      // Every ingested spreadsheet row is accounted for as exactly one of:
      // a loan agreement, a history row, or a repeated header artifact. The
      // Drive-only loans are additional records with no spreadsheet row, so
      // they are counted separately and excluded from this identity.
      balances: (agreements.length - driveOnly.length) + histRows.length + artifacts.length === all.length,
    },
  };
}

// A loan known only from its Drive folder. Its id is derived deterministically
// from the Drive folder id-free path, so it is stable across rebuilds without
// colliding with a tracker-issued LON- id.
function makeDriveOnlyAgreement(fo) {
  const meta = fo.meta || {};
  // Parse the two parties ONLY from an explicit "X & Y" / "X and Y" separator.
  // An earlier version also split on "-", which turned
  // "Deevar - Bayut loan [AED 5,324,000]" into borrower "Deevar", lender
  // "Bayut loan" -- a confidently wrong party. Where the folder name does not
  // clearly name two parties, both stay null and the folder name is the title.
  const cleaned = String(fo.name)
    .replace(/^\s*\d{1,2}\s*[.\-]\s*/, "")      // leading serial "10."
    .replace(/\[[^\]]*\]/g, " ")                 // bracketed amounts/markers
    .replace(/\(\d+\)\s*$/, "")                  // Drive's "(1)" copy suffix
    .replace(/_/g, " ")                           // the group's underscore separator
    .replace(/(?<!\d)\d{8}(?!\d)/g, " ")          // trailing yyyymmdd stamps
    .replace(/\s*[-\u2013]\s*(convertible\s+)?loan\b.*$/i, "")  // trailing "- Convertible Loan"
    .replace(/^\s*(convertible\s+)?loan(\s+agreement)?\s*[-\u2013:]?\s*/i, "") // leading descriptor
    .replace(/\s+/g, " ")
    .trim();
  const split = cleaned.split(/\s+(?:&|and)\s+/i);
  const clean = (x) => String(x || "").replace(/^[\s_-]+|[\s_-]+$/g, "").trim();
  const parties = (split.length === 2 && clean(split[0]).length >= 2 && clean(split[1]).length >= 2)
    ? [null, clean(split[0]), clean(split[1])] : null;
  const hash = require("crypto").createHash("sha1").update(fo.folderPath).digest("hex").slice(0, 7).toUpperCase();
  return {
    id: "LON-D" + hash,
    // Drive appends "(1)" to a copied folder; it is not part of the name.
    title: String(fo.name).replace(/^\s*\d{1,2}\s*[.\-]\s*/, "").replace(/\s*\(\d+\)\s*$/, "").trim(),
    ref: null,
    refText: null,
    category: fo.category,
    categoryLabel: LOAN_CATEGORY_LABEL[fo.category] || "Uncategorised",
    // Parties are read from the folder name only when it clearly names two of
    // them; otherwise they stay null rather than half-guessed.
    borrower: parties ? parties[1].trim() : null,
    lender: parties ? parties[2].trim() : null,
    entity: fo.entityFolder || null,
    entityKey: entities.entityKey(fo.entityFolder),
    principal: null,
    principalText: meta.amountText || null,
    currency: meta.currency || null,
    interest: null,
    term: null,
    agreementDateText: null,
    agreementDate: meta.date || null,
    repaymentDateText: null,
    repaymentDate: null,
    sourceStatus: meta.withdrawn ? "Withdrawn" : meta.repaid ? "Repaid" : null,
    events: [],
    documentEvents: fo.events,
    driveFolder: { path: fo.folderPath, name: fo.name, matchedOn: ["discovered in Drive with no tracker row"], markers: meta.markers },
    folderMarkers: meta,
    driveFiles: fo.files,
    __source: { folder: fo.folderPath, file: null, sheet: null, root: "Compliance Data _LegalOS" },
    __lineage: { driveFolder: fo.folderPath, ingestedAt: new Date().toISOString(), parser: "drive-folder" },
    __quality: "DRIVE_ONLY",
    __missingFields: ["principal", "interest", "term", "loan reference"],
    origin: "drive",
  };
}

/* THE LOAN CATEGORIES THE BUSINESS USES (§48/§49).
 *
 *   FDI              foreign direct investment lending, from the FDI Loan
 *                    Tracker. "International" was our word for it; FDI is the
 *                    source's own, and it is the one the SBP filings use.
 *   INTERCOMPANY_PK  rupee lending between group companies, from the Inter
 *                    Company Loans Tracker.
 *   FCY              a foreign-currency loan that is NOT foreign direct
 *                    investment.
 *
 * FCY IS DEFINED AND CURRENTLY EMPTY, AND THAT IS DELIBERATE. Every loan in
 * the FDI tracker happens to be in AED or USD, so classifying by currency
 * alone would move all 25 of them into FCY and empty the FDI register — a
 * category boundary invented by this file rather than decided by the business.
 * A loan becomes FCY when a source says so (a tracker of its own, or an
 * explicit marker on the row), and until then the category reports zero and
 * says why. That is the difference between a taxonomy and a guess.
 */
const LOAN_CATEGORIES = [
  { key: "fdi", label: "FDI Loans", note: "Foreign direct investment lending, from the FDI Loan Tracker." },
  { key: "fcy", label: "FCY Loans", note: "Foreign-currency lending that is not foreign direct investment." },
  { key: "intercompany", label: "Intercompany PK Loans", note: "Rupee lending between group companies." },
];
const LOAN_CATEGORY_LABEL = Object.fromEntries(LOAN_CATEGORIES.map((c) => [c.key, c.label]));

/* An explicit FCY marker on the source row. Nothing infers it from currency. */
const FCY_RE = /\bFCY\b|foreign currency loan/i;
function loanCategory(r, fromTracker) {
  const raw = r.__raw || {};
  const hay = [r.ref, r.term, r.interest, raw["Loan Type"], raw["Category"], raw["Type"]]
    .map((v) => String(v == null ? "" : v)).join(" ");
  if (FCY_RE.test(hay)) return "fcy";
  return fromTracker;
}

function makeAgreement(r, category) {
  const ref = cleanRef(r.ref);
  return {
    id: r.id,
    title: [r.borrower, r.lender].filter(Boolean).join(" \u2190 ") || (ref || r.id),
    ref: ref || null,
    refText: r.ref != null ? String(r.ref) : null,
    /* fdi | fcy | intercompany — see LOAN_CATEGORIES. The legacy value
       "international" is still accepted by every reader for one build so a
       cached payload does not change meaning mid-upgrade. */
    category: loanCategory(r, category === "international" ? "fdi" : category),
    categoryLabel: LOAN_CATEGORY_LABEL[loanCategory(r, category === "international" ? "fdi" : category)] || "Uncategorised",
    borrower: r.borrower || null,
    lender: r.lender || null,
    entity: r.borrower || null, // the group company carrying the loan
    entityKey: entities.entityKey(r.borrower),
    principal: typeof r.amount === "number" ? r.amount : null,
    currency: r.currency || (category === "intercompany" ? "PKR" : null),
    interest: r.interest || null,
    term: r.term || null,
    agreementDateText: r.agreementDate || null,
    agreementDate: parseLooseDate(r.agreementDate),
    repaymentDateText: r.repaymentDate || null,
    repaymentDate: parseLooseDate(r.repaymentDate),
    sourceStatus: r.status || null,
    events: [],
    driveFiles: (r.driveFiles || []).slice(),
    __source: r.__source,
    __lineage: r.__lineage,
    __quality: r.__quality,
    origin: "source",
  };
}

// Compute ORIGINAL vs CURRENT EFFECTIVE terms from the event chain, plus the
// SBP position. Both are shown side by side in the UI: an amendment must never
// overwrite the original terms (PART 3.3 of the brief).
function finalise(a) {
  // Drive document events join the tracker rows in one chronology. They are a
  // DIFFERENT kind of evidence -- a document proves an instrument exists, a
  // tracker row states a term -- so each keeps its own `origin` and the UI
  // shows which is which rather than blending them into an undifferentiated list.
  if (a.documentEvents && a.documentEvents.length) {
    for (const d of a.documentEvents) {
      a.events.push({
        id: "DOC:" + d.file.id,
        ref: a.ref,
        kind: d.kind,
        label: d.label,
        date: d.date,
        dateText: d.date ? null : "date not in filename",
        repaymentDue: null,
        note: null,
        sbp: d.kind === "sbp_registration" ? (d.acknowledged ? SBP.REGISTERED : SBP.SUBMITTED) : null,
        acknowledged: d.acknowledged,
        ordinal: d.ordinal,
        quality: d.quality,
        driveFile: d.file,
        tracker: null,
        origin: "drive",
      });
    }
  }

  // Two trackers record the same rollovers for the OLX loans, so the same
  // repayment date can arrive twice. Collapse exact duplicates, keeping the
  // richer row (the one carrying a status note) and recording that a second
  // tracker corroborates it. Dates that merely differ by a few days are NOT
  // merged -- that is a real disagreement between two source trackers and the
  // compliance team should see both.
  const seen = new Map();
  const merged = [];
  for (const e of a.events) {
    const k = e.repaymentDue || ("row:" + e.id);
    const prev = seen.get(k);
    if (!prev) { seen.set(k, e); merged.push(e); continue; }
    const keep = (prev.note ? prev : (e.note ? e : prev));
    const drop = keep === prev ? e : prev;
    if (keep !== prev) { merged[merged.indexOf(prev)] = keep; seen.set(k, keep); }
    keep.corroboratedBy = (keep.corroboratedBy || []).concat([{ id: drop.id, tracker: drop.tracker }]);
  }
  a.events = merged;

  // Order by whichever date the row actually carries.
  const when = (e) => e.date || e.repaymentDue || "9999";
  a.events.sort((x, y) => String(when(x)).localeCompare(String(when(y))) || (x.row || 0) - (y.row || 0));

  // Only the earliest event in the whole chain is the original agreement; the
  // per-block "first row" is not, because one loan can span several blocks.
  const firstReal = a.events.find((e) => e.kind !== "status");
  if (firstReal && (firstReal.kind === "rollover" || firstReal.kind === "origination")) {
    firstReal.kind = "origination";
    firstReal.label = "Original agreement";
  }

  const dated = a.events.filter((e) => e.repaymentDue);
  a.original = {
    agreementDate: a.agreementDate || (firstReal && firstReal.date) || null,
    repaymentDue: (firstReal && firstReal.repaymentDue) || a.repaymentDate || null,
    principal: a.principal,
    currency: a.currency,
  };

  // Current effective repayment date = the latest one the history set. Where
  // there is no history, the agreement's own repayment date stands.
  const last = dated.length ? dated[dated.length - 1] : null;
  a.current = {
    repaymentDue: last ? last.repaymentDue : a.repaymentDate,
    repaymentDueText: last ? last.repaymentDueText : a.repaymentDateText,
    asOfEvent: last ? last.id : null,
    /* AMENDMENTS ARE AMENDMENTS AND ROLLOVERS. This counted `rollover` alone
       and ignored the 64 events the model itself classifies as `amendment`, so
       a loan amended twice reported none on a card labelled "Amendments on
       record". Novation and conversion stay out: they substitute a party or
       change the instrument's nature rather than vary its terms, and both
       remain visible in the timeline. */
    amendmentCount: a.events.filter((e) => e.kind === "amendment" || e.kind === "rollover").length,
    changed: !!(last && a.original.repaymentDue && last.repaymentDue !== a.original.repaymentDue),
  };

  // Lifecycle status. The tracker's own wording is preserved verbatim in
  // sourceStatus; `status` is the canonical state derived from it, so the
  // register can group and filter without flattening what the source said.
  const notes = a.events.map((e) => e.note || "").join(" | ");
  const srcStatus = String(a.sourceStatus || "");
  const both = notes + " | " + srcStatus;
  if (/converted to shares|converted as shares|conversion to equity/i.test(both)) a.status = "Converted to equity";
  else if (/NOT REPAID|OVERDUE/i.test(notes)) a.status = "Outstanding - overdue";
  else if (/\bREPAID\b/i.test(notes)) a.status = "Repaid";
  else if (/^\s*paid\s*$/i.test(srcStatus)) a.status = "Repaid";
  else if (/discarded|no amount dispersed/i.test(both)) a.status = "Discarded";
  else if (/withdrawn/i.test(both)) a.status = "Withdrawn";
  else if (/^\s*unpaid\s*\/\s*closed\s*$/i.test(srcStatus) || /^\s*closed\s*$/i.test(srcStatus)) a.status = "Closed";
  else if (/^\s*unpaid/i.test(srcStatus)) a.status = "Outstanding";
  else if (srcStatus) a.status = srcStatus;
  else a.status = "Active";

  a.closed = /repaid|withdrawn|closed|settled|converted|discarded/i.test(a.status);

  // SBP position: the most recent registration signal in the history, gated by
  // whether registration applies to this category at all.
  /* Keyed on the category, with the pre-rename key as a fallback: a payload
     cached before "international" became "fdi" must resolve to the same rule
     rather than silently losing its SBP position. */
  const byCat = (rules().sbp && rules().sbp.byCategory) || {};
  const cfg = byCat[a.category] || (a.category === "fdi" ? byCat.international : null) || {};
  if (cfg.applicable === false) {
    a.sbp = Object.assign({}, SBP.NOT_REQUIRED, { applicable: false, reason: cfg.reason || null });
  } else {
    const sig = [...a.events].reverse().find((e) => e.sbp);
    if (sig) a.sbp = Object.assign({}, sig.sbp, { applicable: true, asOf: sig.date, note: sig.note });
    else if (/not registered|no LRN|not on file|^N\/A/i.test(String(a.refText || "")))
      a.sbp = Object.assign({}, SBP.PENDING, { applicable: true, reason: "The tracker records no LRN for this loan." });
    else if (a.ref)
      a.sbp = Object.assign({}, SBP.REGISTERED, { applicable: true, reason: "An LRN is recorded against this loan in the master tracker." });
    else a.sbp = Object.assign({}, SBP.UNKNOWN, { applicable: true });
  }
  return a;
}

/* --------------------------------------------- leases & service agreements */

// The spend-contract trackers carry an explicit "Agreement Type" column, so the
// lease / service split is read from the source rather than guessed from titles.
const LEASE_RE = /\b(lease|tenancy)\b/i;
const SERVICE_RE = /\b(services?|consultancy|cosultancy|maintenance|digital marketing)\b/i;

/* THE SPEND CATEGORY, NAMED RATHER THAN LEFT AS "OTHER".
   199 spend records split 102 lease / 83 service and left 14 that are neither.
   Calling them "other" is not a classification, it is a refusal to make one:
   five are non-disclosure agreements, three are franchise and licensing
   instruments, two are memoranda of understanding, one is a sale and purchase,
   one is a bank cash-management mandate, and two are lifecycle actions on a
   lease that were filed as if they were agreements in their own right.

   These are read off the tracker's OWN "Agreement Type" column. Nothing is
   forced into lease or service to make the arithmetic tidier -- an NDA is not
   a service agreement and counting it as one would overstate the services
   book by five. */
const SPEND_CATEGORY = [
  [/non.?\s?disclosure|confidentialit/i, "NDA_CONFIDENTIALITY", "Non-disclosure / confidentiality"],
  [/franchise|licensing|hotel licensing/i, "FRANCHISE_AND_LICENSING", "Franchise and licensing"],
  [/memorandum of understanding|\bmou\b/i, "MEMORANDUM_OF_UNDERSTANDING", "Memorandum of understanding"],
  [/sale\s*&?\s*purchase|share purchase/i, "SALE_AND_PURCHASE", "Sale and purchase"],
  [/cash management|treasury|banking/i, "BANKING_AND_TREASURY", "Banking and treasury mandate"],
];

/* A lifecycle action on an agreement -- a termination, a novation, an
   amendment -- is not a new agreement. It is reported as HISTORICAL_ACTION and,
   where the parent is unambiguous, linked to it. */
const SPEND_ACTION_RE = /(amend|addendum|addend|extension|extend|renewal|renew|termination|terminate|novation|supplement|rollover)/i;

function spendCategory(r) {
  const type = String((r && r.agreementType) || "");
  const title = String((r && r.title) || "");
  if (SPEND_ACTION_RE.test(type)) return { key: "HISTORICAL_ACTION", label: "Lifecycle action on an agreement" };
  if (r && r.klass === "lease") return { key: "LEASE_AGREEMENT", label: "Lease agreement" };
  if (r && r.klass === "service") return { key: "SERVICE_AGREEMENT", label: "Service agreement" };

  const byType = SPEND_CATEGORY.find(([re]) => re.test(type));
  const byTitle = SPEND_CATEGORY.find(([re]) => re.test(title));
  /* WHEN THE TYPE COLUMN AND THE TITLE DISAGREE, KEEP BOTH.
     One record is typed "Franchise Agreement" and titled "Confidentiality
     Agreement". Silently preferring either one loses a real disagreement in
     the source, so the record is classified on its title -- the more specific
     statement -- and carries the conflict. */
  if (byType && byTitle && byType[1] !== byTitle[1]) {
    return {
      key: byTitle[1], label: byTitle[2],
      conflict: { field: "agreementType vs title", fromType: byType[1], fromTitle: byTitle[1], type, title },
    };
  }
  const hit = byType || byTitle;
  if (hit) return { key: hit[1], label: hit[2] };
  return { key: "UNCLASSIFIED_SOURCE", label: "Not classifiable from source" };
}

function agreementClass(typeText) {
  const t = String(typeText || "").trim();
  if (!t) return "other";
  if (LEASE_RE.test(t)) return "lease";
  if (SERVICE_RE.test(t)) return "service";
  return "other";
}

/* WHICH CONTRACT ROWS ARE COMPLIANCE SPEND CONTRACTS.
   Exported so Data Health asks the same question the register does -- two
   copies of this rule is how a reconciliation reports "balances: true" about a
   set it defined differently from the thing it is checking. */
/* A TRACKER IS NOT A DOCUMENT OF THE RECORD IT DESCRIBES.
   Sweeping a folder's contents onto a record pulled in the spreadsheets that
   define the register itself -- "00_Master Tracker - Spend Contracts - Zameen
   Media.xlsx" appeared in a lease's Documents tab alongside the lease. It is
   the SOURCE the record was read from, and the record already names it under
   Source. Ledgers, organograms and group-structure annexes are the same kind
   of thing: reference material, not instruments.

   Excluded from record documents; still inventoried, still reachable, still
   named as the record's source. */
function isRecordDocument(f) {
  const n = String((f && f.name) || "");
  if (/\.(xlsx|xlsm|xls|csv)$/i.test(n)) return false;
  if (/^~\$/.test(n)) return false;
  return true;
}

const COMPLIANCE_ROOT = "Compliance Data _LegalOS";
function isSpendRow(r) {
  const s = (r && r.__source) || {};
  const underCompliance = String(s.root || "").trim() === COMPLIANCE_ROOT
    || /^Compliance Data _LegalOS/.test(String(s.folder || ""));
  if (!underCompliance) return false;
  const named = /spend contracts|subsidiaries contracts/i.test(String(s.file || "") + " " + String(s.folder || ""));
  const raw = (r && r.__raw) || {};
  const shaped = ("Agreement Type" in raw) && (("First Party" in raw) || ("Counter Party" in raw));
  return named || shaped;
}

async function buildSpend(stOverride) {
  const st = stOverride || await registers.ensure();
  const all = (st && st.registers && st.registers.contracts) || [];

  /* A SPEND CONTRACT IS ONE BECAUSE OF WHAT IT IS, NOT WHERE IT IS FILED.
     Selecting on the folder path containing "Spend Contracts" lost 30 real
     agreements whose trackers sit in the wrong family: 20 Dubizzle Labs leases
     and services filed under Intercompany Loans, 6 ZVO subsidiary contracts
     filed under Loan Agreements, and 4 Zameen Medallion contracts filed under
     Resolutions. They were never wrong records -- they were correctly ingested
     and then excluded from their own register by their filing.

     So the test is now the tracker's own column signature, confined to the
     Compliance root. Misfiling is recorded on the record (`filedUnder`) and
     surfaced as contamination rather than silently corrected: the folder is
     still where the business keeps it, and moving it is a Drive change we do
     not make. */
  const spend = all.filter(isSpendRow);

  /* Which family the tracker physically lives in, so a misfiled agreement can
     be found again and counted as contamination. */
  const familyOfPath = (p) => {
    const parts = String(p || "").split("/").map((x) => x.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[1] : "";
  };

  const mk = (r) => {
    const raw = r.__raw || {};
    const typeText = String(raw["Agreement Type"] || "").trim();
    const endRaw = raw["End Date"];
    const ongoing = /ongoing/i.test(String(endRaw || ""));
    const rawValue = raw["Contract Value (PKR)"];
    return {
      id: r.id,
      title: raw["Agreement Title"] || r.title || null,
      agreementType: typeText || null,
      klass: agreementClass(typeText),
      entity: raw["First Party"] || r.entityName || null,
      entityKey: entities.entityKey(raw["First Party"] || r.entityName),
      counterparty: raw["Counter Party"] || raw["Parties"] || r.counterparty || null,
      department: raw["Department"] || null,
      region: raw["Region"] || null,
      city: raw["City"] || null,
      value: typeof rawValue === "number" ? rawValue : null,
      valueText: typeof rawValue === "number" ? null : (rawValue || null),
      currency: "PKR",
      start: parseLooseDate(raw["Start Date"]),
      end: ongoing ? null : parseLooseDate(endRaw),
      endText: ongoing ? "Ongoing" : (endRaw ? String(endRaw) : null),
      ongoing,
      status: String(raw["Status"] || "").trim() || null,
      fileNo: raw["Physical File No."] != null ? String(raw["Physical File No."]) : null,
      /* A COPY, NOT THE REGISTER'S OWN ARRAY.
         This shared the array by reference, and attachSpendDocuments then
         pushed matched documents into it -- writing them straight back into
         registers.contracts. The security diff derives citations from those
         rows, so its answer changed depending on whether buildSpend had been
         called first: 16 documents read as widened AND narrowed inside Data
         Health and as neither from a standalone run. A gate whose result
         depends on call order is not a gate. */
      driveFiles: (r.driveFiles || []).slice(),
      __source: r.__source,
      __lineage: r.__lineage,
      /* The family this agreement is physically filed under. Equal to the
         spend family for all but the 30 misfiled ones. */
      filedUnder: familyOfPath((r.__source && r.__source.folder) || ""),
      misfiled: familyOfPath((r.__source && r.__source.folder) || "")
        !== "Spend Contracts (Lease and Service Agreements)",
      origin: "source",
    };
  };

  const rows = spend.map(mk);

  /* AN INCOMPLETE RECORD IS KEPT AND LABELLED, NEVER DROPPED.
     A lease whose tracker row has no counterparty and no dates is still a
     lease the business signed; dropping it makes the register tidy and wrong.
     It stays, saying exactly what is missing. */
  /* A LEASE CANNOT EXPIRE BEFORE IT STARTS.
     Two tracker rows carry an end date earlier than their start -- one of them
     reads 31 December 1931 against a lease beginning in 2022, which the
     workbook itself stores that way (a 2-digit year typed into Excel and read
     as 1931). Left alone the screen computed "34599d overdue" and showed a
     confident expiry nobody should trust.

     The source value is PRESERVED and shown; what stops is treating it as a
     usable date. `end` is cleared so nothing downstream computes a countdown
     from it, `endSource` keeps exactly what the tracker said, and the record
     says why. We do not guess the intended year: 1931 could be 2031 or a
     mistyped 2023, and inventing one would be worse than reporting the
     contradiction. */
  for (const r of rows) {
    if (r.start && r.end && r.end < r.start) {
      r.endSource = r.end;
      r.endText = r.endText || r.end;
      r.end = null;
      r.dateAnomaly = "END_BEFORE_START";
      r.dateAnomalyDetail = "The tracker records an end date of " + r.endSource
        + ", which is before the start date of " + r.start + ". The source value is shown as recorded and is not used to calculate expiry.";
    }
  }

  for (const r of rows) {
    const missing = [];
    if (!r.counterparty) missing.push("counterparty");
    if (!r.start) missing.push("start date");
    if (!r.end && !r.ongoing) missing.push("end date");
    if (r.value == null && !r.valueText) missing.push("contract value");
    if (!r.status) missing.push("status");
    r.__missingFields = missing;
    /* DATA COMPLETENESS AND DOCUMENTARY EVIDENCE ARE DIFFERENT FACTS.
       A filled-in tracker row proves the spreadsheet is filled in. It proves
       nothing about whether the signed agreement is on file. They are reported
       on separate axes and never collapsed into one "quality" word again. */
    r.dataCompleteness = r.dateAnomaly ? "CONFLICTING_SOURCE"
      : (missing.length ? "INCOMPLETE_SOURCE" : "COMPLETE");
    r.__quality = r.dataCompleteness;          // retained for existing callers
    const cat = spendCategory(r);
    r.spendCategory = cat.key;
    r.spendCategoryLabel = cat.label;
    if (cat.conflict) {
      r.categoryConflict = cat.conflict;
      r.dataCompleteness = "CONFLICTING_SOURCE";
      r.__quality = "CONFLICTING_SOURCE";
    }

    /* A misfiled record keeps its real Drive location AND the family it
       belongs to, so the mismatch is a visible warning rather than the silent
       cause of a missing record. */
    if (r.misfiled) {
      r.sourceLocation = {
        warning: "SOURCE_LOCATION_MISMATCH",
        actualDriveFolder: (r.__source && r.__source.folder) || null,
        actualFamily: r.filedUnder || null,
        expectedFamily: "Spend Contracts (Lease and Service Agreements)",
        reason: "The tracker that defines this agreement is filed under "
          + (r.filedUnder || "another family") + ", not under the spend-contract family.",
        evidence: (r.__source && r.__source.file) || null,
        driveUnchanged: true,
      };
    }
  }


  /* AN AMENDMENT IS NOT A SECOND AGREEMENT.
     Four tracker rows describe a change to an agreement already in this list --
     an extension, a third amendment, a termination and a novation. Left as
     peers they read as four more contracts the business signed.

     The link is only made when it is UNAMBIGUOUS: same entity, same
     counterparty, exactly one candidate parent, and the parent starts no later
     than the action. Anything less stays a standalone record carrying
     `actionUnlinked`, because a wrong parent is worse than an honest orphan.
     Most of this estate's lifecycle history is at the document level, not the
     row level -- the amendments are PDFs inside the agreement's folder -- and
     those are already attached to the record they belong to. */
  const ACTION_RE = /(amend|addendum|addend|extension|extend|renewal|renew|termination|terminate|novation|supplement|rollover)/i;
  const kindOfAction = (t) => {
    const x = String(t || "");
    if (/terminat/i.test(x)) return "termination";
    if (/novation/i.test(x)) return "novation";
    if (/renew/i.test(x)) return "renewal";
    if (/exten/i.test(x)) return "extension";
    if (/amend|addend|supplement/i.test(x)) return "amendment";
    return "action";
  };
  const nk = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const r of rows) {
    const text = String(r.agreementType || "") + " " + String(r.title || "");
    if (!ACTION_RE.test(text)) continue;
    const cands = rows.filter((o) => o !== r
      && nk(o.entity) && nk(o.entity) === nk(r.entity)
      && nk(o.counterparty) && nk(o.counterparty) === nk(r.counterparty)
      && !ACTION_RE.test(String(o.agreementType || "") + " " + String(o.title || ""))
      && (!r.start || !o.start || o.start <= r.start));
    r.actionKind = kindOfAction(text);
    if (cands.length === 1) {
      r.parentAgreement = { id: cands[0].id, title: cands[0].title };
      r.isAction = true;
      (cands[0].actions = cands[0].actions || []).push({
        id: r.id, kind: r.actionKind, title: r.title, date: r.start || null,
      });
    } else {
      r.actionUnlinked = cands.length === 0 ? "no matching parent agreement in the register" : cands.length + " possible parents";
    }
  }

  const docStats = attachSpendDocuments(rows);
  return {
    leases: rows.filter((r) => r.klass === "lease"),
    services: rows.filter((r) => r.klass === "service"),
    other: rows.filter((r) => r.klass === "other"),
    total: rows.length,
    documents: docStats,
  };
}

/* Attach the spend-contract documents to the lease and service records.
 *
 * These documents were never attached by anything that belongs to them. They
 * appeared on records only because the CONTRACTS matcher was ranging across
 * every Drive root and picking them up — so a lease's papers reached the app
 * through the commercial register, filed against commercial contracts. Scoping
 * that matcher to the commercial roots (where a contract's papers actually live)
 * fixed the wrong attribution and left these 400-odd documents with no owner.
 * This gives them the right one.
 *
 * The structure Drive actually has:
 *
 *   Spend Contracts (Lease and Service Agreements)
 *     └ <Entity>_Spend Contracts
 *         ├ Lease Agreements      the entity's leases
 *         ├ General Agreements    the entity's service agreements
 *         └ <Subsidiary> / …      the same shape again
 *
 * There is no folder per agreement, so a document is placed by ENTITY first —
 * which is deterministic, because the entity is named on the record and in the
 * folder — and then by filename evidence within that entity. A file is awarded
 * to ONE record, the best-scoring one; sharing a PDF across several agreements
 * would assert relationships the source does not support. What no single record
 * earns stays with the entity as a spend-contract document, which is what it
 * genuinely is, rather than being dropped or spread around. */
function attachSpendDocuments(rows) {
  const drive = require("./drive");
  const files = drive.indexFiles().filter((f) =>
    /Spend Contracts|Lease Agreements?|General Agreements|Subsidiaries Contracts/i.test(f.folderPath || "")
    && !/\.(xlsx?|tmp)$/i.test(f.name) && !/^~\$/.test(f.name));
  if (!files.length) return { candidates: 0, attached: 0, entityLevel: 0 };

  const tok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((t) => t.length >= 3 && !SPEND_STOP.has(t));

  // Which entity folder a file sits under, and which class the folder implies.
  const fileMeta = files.map((f) => {
    const segs = String(f.folderPath || "").split(" / ");
    const entSeg = segs.find((x) => /_Spend Contracts|Subsidiaries Contracts/i.test(x)) || segs[segs.length - 1] || "";
    const entKey = entities.entityKey(entSeg.replace(/_.*$/, ""));
    const leafClass = /lease/i.test(segs[segs.length - 1] || "") ? "lease"
      : /general/i.test(segs[segs.length - 1] || "") ? "service" : null;
    return { f, entKey, leafClass, tokens: new Set(tok(f.name + " " + segs[segs.length - 1])) };
  });

  // Document frequency, so a distinctive word counts for more than a common one.
  const df = new Map();
  for (const m of fileMeta) for (const t of m.tokens) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => Math.log((fileMeta.length + 1) / ((df.get(t) || 0) + 1)) + 1;

  // Score every (record, file) pair, then award each file once, best first.
  const bids = [];
  for (const r of rows) {
    /* What NAMES this agreement: the counterparty, and any part of the title
       that is not boilerplate. The city is deliberately excluded — half these
       records are titled just "Lease Agreement", and matching on a city made a
       Rawalpindi lease from landlord "Zaheer Iqbal" adopt the Mall 35 and Silk
       Mall papers. A place two documents have in common is not evidence that
       they are the same agreement. */
    const strong = new Set([...tok(r.counterparty), ...tok(r.title)]);
    if (!strong.size) continue;
    for (const m of fileMeta) {
      // The entity has to agree. It is on the record and in the folder name, so
      // this is evidence, not a guess — and it stops a Zameen Media lease
      // adopting a Dubizzle Labs document that happens to share a word.
      if (m.entKey && r.entityKey && m.entKey !== r.entityKey) continue;
      let score = 0, shared = 0, anchored = false;
      for (const t of strong) {
        if (!m.tokens.has(t)) continue;
        score += idf(t); shared++;
        // An ANCHOR is a rare, substantial word — a party or property name.
        // Without one, the two names merely share vocabulary.
        if ((df.get(t) || 0) <= 4 && t.length >= 5) anchored = true;
      }
      if (!anchored || shared < 2) continue;
      if (m.leafClass && r.klass && m.leafClass !== r.klass) score *= 0.6;   // folder class disagrees
      bids.push({ score, fileId: m.f.id, file: m.f, record: r });
    }
  }
  bids.sort((a, b) => b.score - a.score);

  /* Anything a record already holds is spoken for. Those attachments came from
     a filename the tracker itself cites, which is the source saying so; this
     matcher only infers. An inference must never take a document away from, or
     duplicate, a document the source has already placed. */
  const taken = new Set();
  for (const r of rows) for (const d of r.driveFiles || []) taken.add(d.id);

  let attached = 0;
  for (const b of bids) {
    if (taken.has(b.fileId)) continue;                        // one document, one record
    taken.add(b.fileId);
    (b.record.driveFiles = b.record.driveFiles || []).push({
      id: b.file.id, name: b.file.name, mimeType: b.file.mimeType, size: b.file.size || 0,
      folderPath: b.file.folderPath || "", webViewLink: b.file.webViewLink || "",
      modifiedTime: b.file.modifiedTime || "", via: "spend-folder",
      score: Math.round(b.score * 1000) / 1000,
    });
    attached++;
  }

  // What no record earned belongs to its ENTITY's spend file. Saying so is the
  // honest disposition; calling it unresolved would be false, and attaching it
  // to a nearby agreement would be worse.
  const entityLevel = [];
  for (const m of fileMeta) {
    if (taken.has(m.f.id)) continue;
    entityLevel.push({ entityKey: m.entKey || null, fileId: m.f.id, name: m.f.name, folderPath: m.f.folderPath });
  }
  SPEND_ENTITY_DOCS = entityLevel;
  return { candidates: fileMeta.length, attached, entityLevel: entityLevel.length };
}

const SPEND_STOP = new Set(["agreement", "agreements", "lease", "service", "services", "contract",
  "contracts", "spend", "general", "limited", "private", "pvt", "ltd", "smc", "the", "and", "for",
  "of", "amendment", "first", "second", "third", "signed", "final", "copy", "scan", "pdf", "doc"]);

// The spend documents that belong to an entity rather than to one agreement.
let SPEND_ENTITY_DOCS = [];
function spendEntityDocuments() { return SPEND_ENTITY_DOCS; }

module.exports = {
  LOAN_CATEGORIES, LOAN_CATEGORY_LABEL,
  buildLoans, buildSpend, parseLooseDate, isHeaderArtifact,
  agreementClass, sbpFromNote, classifyEvent, rules, SBP, spendEntityDocuments,
};

/* --------------------------------------------------- licences + their history */

// Licence records from the summary workbook, with the RENEWAL CHAIN recovered
// from Drive. The certificates in each authority folder carry their issue date
// in the filename, so a folder holding three LCCI certificates dated 2022, and
// twice in 2026 IS the renewal history -- prior licence numbers and expiry dates
// are preserved as history rather than overwritten by the current row (PART 13/18.1).
async function buildLicences(stOverride) {
  const st = stOverride || await registers.ensure();
  const rows = (st && st.registers && st.registers.licences) || [];
  let folders = [];
  try { folders = sources.licenceFolders(); } catch (e) { folders = []; }

  const usedFolders = new Set();
  const out = rows.map((l) => {
    // Match on authority AND entity, both of which the folder name carries
    // ("LCCI - Zameen Developments (Pvt) Ltd"). Both must agree: several
    // entities hold an LCCI membership, so authority alone would cross-link them.
    const authKey = String(l.authority || "").toLowerCase().trim();
    const entKey = entities.entityKey(l.entity);
    const entMatch = (f) => {
      if (!entKey) return false;
      const folderEnt = entities.entityKey(String(f.name).replace(/^[A-Z]+\s*[-_]\s*/i, " "));
      return !!folderEnt && (folderEnt.includes(entKey) || entKey.includes(folderEnt));
    };
    // Authority AND entity must both agree -- several entities hold an LCCI
    // membership, so authority alone would cross-link them.
    let hit = folders.find((f) => {
      const n = String(f.name || "").toLowerCase();
      return authKey && n.includes(authKey) && entMatch(f);
    });
    // Fall back to entity alone, but ONLY when that entity holds exactly one
    // licence and exactly one folder matches it. The REIT licence is issued by
    // SECP but filed under "RMC_Zameen REIT Management Company", so the
    // authority string legitimately differs from the folder name.
    if (!hit && entKey) {
      const sameEntityLicences = rows.filter((x) => entities.entityKey(x.entity) === entKey);
      const cands = folders.filter(entMatch);
      if (sameEntityLicences.length === 1 && cands.length === 1) hit = cands[0];
    }
    if (hit) usedFolders.add(hit.folderPath);

    const chain = hit ? hit.chain : [];
    const history = chain.map((c, i) => ({
      sequence: i + 1,
      kind: i === 0 ? "original" : "renewal",
      label: i === 0 ? "Original licence on file" : "Renewal " + i,
      date: c.date,
      validUntilText: c.validUntilText,
      quality: c.quality,
      file: { id: c.id, name: c.name, folderPath: c.folderPath, webViewLink: c.webViewLink },
      origin: "drive",
    }));

    return {
      ...l,
      title: [l.authority, l.entity].filter(Boolean).join(" — "),
      entityKey: entKey,
      driveFolder: hit ? { path: hit.folderPath, name: hit.name } : null,
      // Everything in the folder, not just the certificates: applications,
      // authority notices, fee receipts and correspondence all belong to the
      // licence's Documents surface (PART 19).
      folderDocuments: hit ? hit.files : [],
      history,
      renewalsOnFile: hit ? hit.renewals : 0,
      origin: "source",
    };
  });

  // A licence folder with no row in the summary workbook is still a licence the
  // group holds -- Deevar's PEC licence is only evidenced in Drive. It is shown
  // as a record flagged DRIVE_ONLY rather than left invisible.
  const driveOnly = folders.filter((f) => !usedFolders.has(f.folderPath)).map((f) => {
    const authority = (String(f.name).match(/^([A-Za-z]+)/) || [])[1] || null;
    const entityName = String(f.name).replace(/^[A-Za-z]+\s*[-_]\s*/, "").replace(/\s*\(\d+\)\s*$/, "").replace(/_+$/, "").trim();
    const chain = f.chain || [];
    const hash = require("crypto").createHash("sha1").update(f.folderPath).digest("hex").slice(0, 7).toUpperCase();
    return {
      id: "LIC-D" + hash,
      title: [authority, entityName].filter(Boolean).join(" \u2014 "),
      entity: entityName || null,
      entityKey: entities.entityKey(entityName),
      authority,
      number: null, issued: chain.length ? chain[0].date : null, expiry: null, status: null,
      driveFolder: { path: f.folderPath, name: f.name },
      folderDocuments: f.files,
      history: chain.map((c, i) => ({
        sequence: i + 1, kind: i === 0 ? "original" : "renewal",
        label: i === 0 ? "Original licence on file" : "Renewal " + i,
        date: c.date, validUntilText: c.validUntilText, quality: c.quality,
        file: { id: c.id, name: c.name, folderPath: c.folderPath, webViewLink: c.webViewLink },
        origin: "drive",
      })),
      renewalsOnFile: f.renewals,
      driveFiles: f.files,
      __quality: "DRIVE_ONLY",
      __missingFields: ["licence number", "expiry date", "status"],
      origin: "drive",
    };
  });

  /* THE CURRENT EFFECTIVE CERTIFICATE, CHOSEN ON EVIDENCE.
     Not the newest file, not the last name alphabetically, not the last
     modified time -- all three are properties of the filing system rather than
     of the licence. The rule is:

       1. the certificate that is valid the longest, where a validity is stated
          (PSEB holds one valid to Aug 2026 and one to Aug 2027; the 2027 one
          is current even though it carries no issue date and the 2026 one does)
       2. otherwise the latest ISSUE date
       3. otherwise nothing is claimed -- `currentEffective` is null and the
          licence says why. */
  const MONTH_IX = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const validUntilIso = (t) => {
    const m = String(t || "").match(/([A-Za-z]{3,})\s+(20\d{2})/);
    if (!m) return null;
    const mo = MONTH_IX[m[1].slice(0, 3).toLowerCase()];
    return mo ? m[2] + "-" + String(mo).padStart(2, "0") + "-01" : null;
  };
  for (const l of out.concat(driveOnly)) {
    const h = (l.history || []).map((e) => ({ ...e, validUntilIso: validUntilIso(e.validUntilText) }));
    l.history = h;
    const withValidity = h.filter((e) => e.validUntilIso);
    let chosen = null, basis = null;
    if (withValidity.length) {
      chosen = withValidity.slice().sort((a, b) => a.validUntilIso.localeCompare(b.validUntilIso)).pop();
      basis = "longest stated validity";
    } else {
      const dated = h.filter((e) => e.date);
      if (dated.length) { chosen = dated[dated.length - 1]; basis = "latest issue date on file"; }
    }
    l.currentEffective = chosen ? {
      sequence: chosen.sequence, kind: chosen.kind, date: chosen.date || null,
      validUntilText: chosen.validUntilText || null, validUntil: chosen.validUntilIso || null,
      file: chosen.file, basis,
    } : null;
    if (!chosen) l.currentEffectiveUnknown = "no document on file carries an issue date or a stated validity";
    l.renewalsOnFile = h.filter((e) => e.kind === "renewal").length;
  }

  return {
    licences: out.concat(driveOnly),
    trackerLicences: out.length,
    driveOnlyLicences: driveOnly.length,
    folders: folders.length,
    unmatchedFolders: [],
  };
}

/* ---------------------------------------------- lease / service documents */

// Lease and service documents that live in Drive outside the spend tracker.
// They are attached to the matching tracker row where the counterparty is named
// in the filename; otherwise they are returned as unattached so the register can
// show that Drive holds material the tracker does not list.
async function buildSpendWithDocs() {
  const spend = await buildSpend();
  let folders = [];
  try { folders = sources.spendDocumentFolders(); } catch (e) { folders = []; }

  const all = [...spend.leases, ...spend.services, ...spend.other];

  /* A DOCUMENT THAT ALREADY BELONGS TO A RECORD IS NOT "EXTRA" FOR ANOTHER.
     This sweep exists to reach documents no record claimed. It started from an
     empty set, so a file PRECISELY attached to one agreement could still be
     swept onto a sibling as a folder extra.

     Where several agreements share a counterparty AND an entity -- the four
     Munawar Hussain head-office leases, one per floor -- the counterparty
     cannot separate them and entity affinity ties, so the whole folder landed
     on whichever record scored highest. The 2nd-and-3rd-floor tenancy and its
     fourth amendment appeared under the FIRST-floor agreement, which is how
     four agreements came to look like one.

     Seeding the set with everything already claimed leaves those documents on
     the record that genuinely matched them, and nothing is hidden: a file is
     only skipped here because it is already shown somewhere more precise. */
  const attachedIds = new Set();
  /* Matched on DOCUMENT IDENTITY, not file id. The estate holds the same
     document under two roots -- "…_20220830.pdf" and "…_20220830 (1).pdf" are
     one tenancy agreement filed twice -- so excluding by id alone let the
     second copy be swept onto a sibling record. The Drive copy suffix is
     stripped before comparing. */
  const docIdentity = (n) => String(n || "").toLowerCase()
    .replace(/\.[a-z0-9]+$/, "").replace(/\s*\(\d+\)\s*$/, "").replace(/[^a-z0-9]+/g, "");
  const attachedNames = new Set();
  for (const r of all) {
    for (const f of (r.driveFiles || [])) {
      if (!f) continue;
      if (f.id) attachedIds.add(f.id);
      if (f.name) attachedNames.add(docIdentity(f.name));
    }
  }

  /* THE FIRST LONG WORD OF A COUNTERPARTY IS NOT AN IDENTIFIER.
     This matched on `counterparty.split(...).filter(t => t.length >= 5)[0]`,
     which for a counterparty of "Zameen Crest" is "zameen" -- the group's own
     name, present in hundreds of filenames. One lease record collected 80
     documents that way: it had no documents of its own and every file in the
     spend tree with "zameen" in its name was attached to it, and to nothing
     else, because `find` stops at the first record that matches.

     Two changes. A token must be DISTINCTIVE: not the group name, not a legal
     suffix, not a word describing the kind of document. And the filename must
     carry enough of the counterparty to be evidence -- two tokens, or one long
     one -- compared with separators removed, because this estate writes
     "AskariGuardsPrivateLimited" as one word. */
  const SQ = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const NOT_IDENTIFYING = new Set([
    "zameen", "media", "labs", "group", "holdings", "dubizzle", "empg",
    "pvt", "pvtltd", "private", "limited", "ltd", "smc", "company", "through",
    "agreement", "agreements", "service", "services", "lease", "tenancy",
    "contract", "pakistan", "solutions", "developments", "venture", "management",
  ]);
  /* Only legal suffixes are dropped: the entity's real words are what make a
     folder path identifiable. */
  const ENTITY_SUFFIX = new Set(["pvt", "pvtltd", "private", "limited", "ltd", "smc", "smcpvt", "smcprivate", "company", "co"]);
  const entityFolderTokens = (v) => [...new Set(String(v || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !ENTITY_SUFFIX.has(t) && !/^\d+$/.test(t)))];
  const idTokens = (v) => [...new Set(String(v || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !NOT_IDENTIFYING.has(t) && !/^\d+$/.test(t)))];

  for (const fo of folders) {
    for (const f of fo.files) {
      if (!isRecordDocument(f)) continue;
      // Already shown on the record that precisely matched it.
      if (attachedIds.has(f.id) || attachedNames.has(docIdentity(f.name))) continue;
      const sq = SQ(f.name);
      let best = null;
      for (const r of all) {
        const toks = idTokens(r.counterparty);
        if (!toks.length) continue;
        const hits = toks.filter((t) => sq.includes(t));
        if (!hits.length) continue;
        /* Two distinctive tokens, or one of real length. */
        if (hits.length < 2 && !hits.some((t) => t.length >= 6)) continue;
        /* WHOSE FOLDER IS IT IN?
           Two records can share a counterparty -- the group holds an Askari
           Guards contract for Zameen Media AND one for Mall 35, and both files
           say "AskariGuards". The counterparty alone cannot separate them; the
           folder can, because each is filed under its own entity's spend tree.
           Entity affinity therefore outranks token length: without it the
           Zameen Media agreement was handed to the Mall 35 record and Zameen
           Media's own record showed nothing. */
        /* ENTITY AFFINITY USES A DIFFERENT VOCABULARY FROM COUNTERPARTY
           MATCHING. "Zameen" and "Media" identify nothing about a
           counterparty -- half the group is called that -- but they identify a
           FOLDER precisely: "Zameen Media_Spend Contracts" is not "Zameen
           Venture One". Excluding them from both jobs meant affinity could
           never fire for any Zameen entity, which is most of the estate.
           Every token of the entity name must appear, so "Zameen Media" does
           not match "Zameen Venture One". */
        const entToks = entityFolderTokens(r.entity);
        const entHit = entToks.length > 0 && entToks.every((t) => SQ(f.folderPath).includes(t));
        const score = hits.join("").length + hits.length + (entHit ? 100 : 0);
        if (!best || score > best.score) best = { record: r, score, hits, entHit };
      }
      if (best) {
        (best.record.extraDocuments = best.record.extraDocuments || []).push({
          ...f, viaFolder: fo.name, matchedOn: best.hits, matchedEntityFolder: !!best.entHit,
        });
        attachedIds.add(f.id);
      }
    }
  }

  const unattached = [];
  for (const fo of folders) for (const f of fo.files) if (!attachedIds.has(f.id)) unattached.push({ ...f, viaFolder: fo.name, folderKlass: fo.klass });

  /* "NO DOCUMENT ON FILE" IS DECIDED LAST.
     Computed inside buildSpend it was wrong for 6 records, because
     attachSpendDocuments and the folder matcher above both attach documents
     AFTER the rows are built -- so a record was flagged as having nothing on
     file and then given its file a moment later. A gap in the filing cabinet
     is a different problem from a gap in the spreadsheet, and it is only
     knowable once every attachment pass has finished. */
  for (const r of all) {
    const own = (r.driveFiles || []).length;
    const extra = (r.extraDocuments || []).length;
    r.documentsOnFile = own + extra;
    /* PARTIALLY_DOCUMENTED means the only documents reaching this record came
       from an entity folder sweep rather than from the agreement itself -- the
       record is evidenced, but not by its own filing. */
    r.evidenceStatus = !r.documentsOnFile ? "NO_DOCUMENT_ON_FILE"
      : (own ? "DOCUMENTED" : "PARTIALLY_DOCUMENTED");
    r.__evidence = r.evidenceStatus === "NO_DOCUMENT_ON_FILE" ? "NO_DOCUMENT_ON_FILE" : "DOCUMENT_ON_FILE";
  }

  return { ...spend, documentFolders: folders.length, unattachedDocuments: unattached };
}

module.exports.buildLicences = buildLicences;
module.exports.isSpendRow = isSpendRow;
module.exports.isRecordDocument = isRecordDocument;
module.exports.spendCategory = spendCategory;
module.exports.buildSpendWithDocs = buildSpendWithDocs;

/* ------------------------------------------------- resolution attribution */

// Which company a resolution belongs to. Two signals exist and they do not
// always agree:
//
//   * the Drive FOLDER the workbook is filed in
//       "Resolutions / Zameen Delta(Pvt)Ltd_Resolutions & Authorizations"
//   * the WORKBOOK FILENAME
//       "000 Summary - Zameen Delta (Private) Limited (1).xlsx"
//
// 734 of 914 agree outright. Of the rest, almost all are naming variants of the
// same company ("Zameen RMC Limited" for "Zameen REIT Management Company") or a
// generic filename ("000_Tracker.xlsx") that names no entity at all.
//
// But 13 are a REAL disagreement: Delta Centauri's summary workbook is filed in
// Downtownrise's folder. The folder is preferred, because it is the signal that
// is present and specific in every case -- and the conflict is FLAGGED rather
// than resolved silently, because picking a winner without saying so is how 13
// resolutions end up quietly attributed to the wrong company.
// Are these two strings the same company written differently? Three ways they
// legitimately can be, all of which appear in the source:
//   * identical once normalised                 "Zameen Delta(Pvt)Ltd" / "Zameen Delta (Private) Limited"
//   * one is a prefix of the other              "EDZD" / "EDZD Developers"
//   * one uses an acronym for the other's words "Zameen RMC Limited" / "Zameen REIT Management Company"
// Anything else is a real disagreement about which company a document belongs to.
function sameCompany(a, b) {
  const ka = entities.entityKey(a);
  const kb = entities.entityKey(b);
  if (!ka || !kb) return true;                      // nothing to disagree about
  if (ka === kb) return true;
  const ta = ka.split(" ");
  const tb = kb.split(" ");
  // Prefix: "edzd" vs "edzd developers".
  if (ta.every((t, i) => tb[i] === t) || tb.every((t, i) => ta[i] === t)) return true;

  // Acronym: strip the shared leading words, then check whether one side's
  // remaining initials spell the other side's remaining single token.
  const wordsOf = (s2) => String(s2 || "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter(Boolean);
  const wa = wordsOf(a);
  const wb = wordsOf(b);
  let i = 0;
  while (i < wa.length && i < wb.length && wa[i] === wb[i]) i++;
  const ra = wa.slice(i);
  const rb = wb.slice(i);
  const STOP = new Set(["private", "pvt", "limited", "ltd", "smc"]);
  const acro = (w) => w.filter((x) => !STOP.has(x)).map((x) => x[0]).join("");
  const firstReal = (w) => w.filter((x) => !STOP.has(x))[0] || "";
  if (ra.length && rb.length) {
    if (acro(ra) && acro(ra) === firstReal(rb)) return true;
    if (acro(rb) && acro(rb) === firstReal(ra)) return true;
  }
  return false;
}

function resolutionEntity(src) {
  const leaf = String((src && src.folder) || "").split(" / ").pop() || "";
  const folderName = leaf
    .replace(/[_\s-]*Resolutions?\s*(&|and)?\s*Authoris?z?ations?.*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  const fileName = String((src && src.file) || "")
    .replace(/^0*[_\s]*Summary[ _-]*/i, "")
    .replace(/^0*[_\s]*Tracker[ _-]*(Summary)?/i, "")
    .replace(/\s*\(\d+\)\.xlsx?$/i, "")
    .replace(/\.xlsx?$/i, "")
    .trim();

  const usableFolder = folderName && !/^resolutions?$/i.test(folderName) ? folderName : null;
  /* The file is a second signal about WHOSE resolution this is only when it is
     the tracker WORKBOOK -- "00_Tracker_Spend Contracts_Zameen Medallion.xlsx"
     names a company, and disagreeing with the folder is a real conflict.
     A record ingested straight from the folder cites the resolution DOCUMENT
     instead, and "12_Meeting Minutes_Authorised Hassan Majeed.pdf" asserts
     nothing about ownership. Treating it as a competing signal reported 32
     perfectly ordinary resolutions as CONFLICTING_SOURCE. */
  const isWorkbook = /\.(xlsx?|xlsm|csv)$/i.test(String((src && src.file) || ""));
  const usableFile = isWorkbook && fileName && !/^(tracker|summary)$/i.test(fileName) ? fileName : null;

  // A conflict only counts when BOTH signals name a company and they are
  // genuinely different companies, not two spellings of one.
  const conflict = !!(usableFolder && usableFile && !sameCompany(usableFolder, usableFile));

  return {
    name: usableFolder || usableFile || "Unattributed",
    folderName: usableFolder,
    fileName: usableFile,
    conflict,
    quality: conflict ? "CONFLICTING_SOURCE" : "COMPLETE",
  };
}

module.exports.resolutionEntity = resolutionEntity;
module.exports.sameCompany = sameCompany;
