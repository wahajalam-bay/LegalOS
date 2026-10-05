// RESOLUTIONS, BIFURCATED BY WHAT EACH DOCUMENT ACTUALLY IS.
//
// The 42 entity folders hold 850 files in one flat list, and LegalOS showed
// them that way: an undifferentiated pile per entity. But the filenames carry a
// real grammar the company has used consistently --
//
//     010_Authorise_Arman Yousuf_Zameen Crest [Zameen Vault]_20250312.pdf
//     ^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^
//     no.  subject                                            date
//
// 800 of 806 documents carry the number, 790 carry the date. That is a register,
// not a folder of scans, and it can be read as one.
//
// THE WORD-BOUNDARY TRAP, AGAIN. A first pass classified 216 documents as
// "other" including every file named "015_AGM minutes_...". `\bAGM` does not
// match "015_AGM" because "_" is a word character, so there is no boundary
// between them -- the same failure this codebase already documents for date
// parsing. Every rule below uses an explicit (?<![A-Za-z0-9]) lookbehind.

/* Ordered: the first match wins, so an AGM minute is an AGM minute rather than
   a generic set of meeting minutes. */
const TYPES = [
  [/pre-?\s?agm/i, "PRE_AGM_MINUTES", "Pre-AGM minutes"],
  [/post-?\s?agm/i, "POST_AGM_MINUTES", "Post-AGM minutes"],
  [/(?<![a-z0-9])agm(?![a-z0-9])|annual general meeting/i, "AGM_MINUTES", "AGM minutes"],
  [/(?<![a-z0-9])eogm(?![a-z0-9])|extraordinary general meeting/i, "EOGM_MINUTES", "EOGM minutes"],
  [/board resolution|(?<![a-z0-9])br(?![a-z0-9])/i, "BOARD_RESOLUTION", "Board resolution"],
  [/minutes of meeting|meeting\s*minutes|minutes_|extract.*minutes|(?<![a-z0-9])mom(?![a-z0-9])/i, "MEETING_MINUTES", "Minutes of meeting"],
  [/authori[sz]e|authori[sz]ation|authority letter|authorise/i, "AUTHORIZATION", "Authorisation"],
  [/approve|approval/i, "APPROVAL", "Approval"],
  [/certificate/i, "CERTIFICATE", "Certificate"],
  [/resolution/i, "RESOLUTION", "Resolution"],
];

/* What the resolution is ABOUT, from the same filename. These are the subjects
   this business actually passes resolutions on; anything else keeps its own
   wording rather than being forced into a bucket. */
const SUBJECTS = [
  [/bank account|account opening/i, "BANKING"],
  [/share transfer|share allot|shareholding|share capital/i, "SHARES"],
  [/director|ceo|secretary|appoint|resign/i, "OFFICERS"],
  [/loan|facility|borrow|credit limit/i, "FINANCING"],
  [/immovable property|purchase of property|land|plot/i, "PROPERTY"],
  [/secp|registrar|registration of group/i, "REGULATORY"],
  [/court|litigation|fia|legal proceeding|vakalat/i, "LITIGATION"],
  [/financial statement|audited account|auditor/i, "ACCOUNTS"],
  [/franchise|licen[cs]e|trademark/i, "COMMERCIAL"],
  [/represent|attorney|power of attorney|signator/i, "REPRESENTATION"],
];

const clean = (v) => String(v || "").replace(/\s*\(\d+\)\s*(?=\.[A-Za-z0-9]+$)/, "").replace(/\.[A-Za-z0-9]+$/, "").trim();

/* THE FOLDER IS THE DEFAULT, NOT "SUPPORTING".
   154 documents matched no type keyword -- "002_Bank account opening_Deevar
   Developers_20180201", "006_Share transfer_...". They are named after what
   the board RESOLVED, which is why no type word appears: the company does not
   write "resolution" on a resolution. Calling them supporting documents filed
   a fifth of the register as miscellanea. Inside a Resolutions & Authorisations
   folder, a numbered, dated, subject-named document is a resolution. */
function classify(name, opts) {
  const n = clean(name);
  for (const [re, key, label] of TYPES) if (re.test(n)) return { documentType: key, documentTypeLabel: label };
  const inResolutionFolder = !opts || opts.inResolutionFolder !== false;
  const looksRegistered = /^\d{1,3}[_ .-]/.test(n);
  if (inResolutionFolder && looksRegistered) return { documentType: "RESOLUTION", documentTypeLabel: "Resolution" };
  return { documentType: "SUPPORTING", documentTypeLabel: "Supporting document" };
}

function subjectOf(name) {
  const n = clean(name);
  for (const [re, key] of SUBJECTS) if (re.test(n)) return key;
  return null;
}

/* THE REGISTER NUMBER, AS THE COMPANY ACTUALLY WRITES IT.
   The grammar is richer than a plain integer and reading it as one loses real
   structure:

     002_...     zero-padded
     02 _...     the same number, padded differently and space-separated
     99.1_...    a SUB-NUMBER -- three lease documents filed under resolution 99
     0129A_...   malformed

   Truncating to the leading integer made 99.1/99.2/99.3 look like three
   duplicates of 99, and made "02" collide with "002". The number and the
   sub-number are parsed separately, the printed form is kept verbatim, and
   anything that does not parse is flagged rather than coerced. */
function numberOf(name) {
  const n = clean(name);
  const m = n.match(/^(\d{1,4})(?:\.(\d{1,3}))?([A-Za-z])?\s*[_ .-]/);
  if (!m) return { number: null, subNumber: null, variant: null, printed: null, malformed: false };
  /* "129A_Minutes of Meeting" is not a malformed 129 -- the letter marks a
     companion document filed under that resolution, so it sorts directly
     after 129 rather than being reported as a clash. */
  const printed = m[1] + (m[2] != null ? "." + m[2] : "") + (m[3] || "");
  return { number: Number(m[1]), subNumber: m[2] != null ? Number(m[2]) : null, variant: m[3] ? m[3].toUpperCase() : null, printed, malformed: false };
}

/* The date printed in the filename. Nothing is inferred from Drive's
   timestamps: those record when a file was uploaded, not when a board met. */
function dateOf(name) {
  const m = clean(name).match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : null;
}

/* The human subject line: the filename with the number, the entity and the
   date stripped, so a list reads as resolutions rather than as filenames. */
/* WHAT THE RESOLUTION IS ABOUT, WITH THE REDUNDANCY STRIPPED.
   804 of 806 filenames end in a Drive copy suffix "(1)", and 681 repeat the
   entity name that the folder already states. Both are noise in a list where
   every row belongs to the same company: the reader wants "Loan from parent
   [PKR 2 bil.]", not "004_Loan from parent [PKR 2 bil.]_Zameen Media_20161125
   (1).pdf". The stored filename is never rewritten -- only what is displayed. */
function titleOf(name, entity) {
  let n = clean(name)
    .replace(/^\d{1,4}(\.\d{1,3})?[A-Za-z]*[_ .-]+/, "")
    .replace(/[_ ]*(?<!\d)20\d{6}(?!\d).*$/, "")
    .replace(/[_]+/g, " ")
    .trim();
  if (entity) {
    const ent = String(entity).replace(/\s*\((SMC-)?P(riva|v)te?\)?\s*(Limited|Ltd)?\.?/i, "").trim();
    for (const part of ent.split(/\s+/)) {
      if (part.length >= 4) n = n.replace(new RegExp("\\s*" + part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "ig"), " ");
    }
  }
  return n.replace(/\s{2,}/g, " ").replace(/^[\s_\-]+|[\s_\-]+$/g, "").trim() || clean(name);
}

/* Enrich one Drive file with everything the filename proves. */
function describe(file, entity) {
  const name = (file && file.name) || "";
  const t = classify(name, { inResolutionFolder: /Resolutions/i.test(String((file && file.folderPath) || "")) });
  const num = numberOf(name);
  return {
    ...t,
    resolutionNumber: num.number,
    resolutionSubNumber: num.subNumber,
    resolutionVariant: num.variant,
    resolutionRef: num.printed,
    numberMalformed: num.malformed,
    documentDate: dateOf(name),
    subjectCategory: subjectOf(name),
    displayTitle: titleOf(name, entity),
    isTracker: /\.(xlsx|xlsm|xls|csv)$/i.test(name),
  };
}

/* The bifurcation for one entity's folder: counts per document type, so the
   screen can group instead of listing 201 files. */
function bifurcate(files, entity) {
  const out = { total: 0, byType: {}, bySubject: {}, numbered: 0, dated: 0, documents: [] };
  for (const f of files || []) {
    const d = describe(f, entity);
    if (d.isTracker) continue;
    out.total++;
    out.byType[d.documentType] = (out.byType[d.documentType] || 0) + 1;
    if (d.subjectCategory) out.bySubject[d.subjectCategory] = (out.bySubject[d.subjectCategory] || 0) + 1;
    if (d.resolutionNumber != null) out.numbered++;
    if (d.documentDate) out.dated++;
    out.documents.push({ id: f.id, name: f.name, folderPath: f.folderPath, webViewLink: f.webViewLink, ...d });
  }
  /* SORTED THE WAY THE COMPANY NUMBERED THEM.
     A resolution register runs 001, 002, 003 -- that is the order the business
     keeps it in and the order Drive shows, because the numbers are zero-padded.
     Sub-numbers sit under their parent (99, 99.1, 99.2). Anything unnumbered
     sorts last on its date; undated last of all, never invented into sequence. */
  out.documents.sort((a, b) => {
    const an = a.resolutionNumber, bn = b.resolutionNumber;
    if (an != null && bn != null && an !== bn) return an - bn;
    if (an != null && bn == null) return -1;
    if (an == null && bn != null) return 1;
    const as = a.resolutionSubNumber || 0, bs = b.resolutionSubNumber || 0;
    if (as !== bs) return as - bs;
    const av = a.resolutionVariant || "", bv = b.resolutionVariant || "";
    if (av !== bv) return av.localeCompare(bv);
    if (a.documentDate && b.documentDate) return a.documentDate.localeCompare(b.documentDate);
    if (a.documentDate && !b.documentDate) return -1;
    if (!a.documentDate && b.documentDate) return 1;
    return 0;
  });

  /* Two documents sharing one register number is a source anomaly worth
     showing, not smoothing over: the register either has a gap or a clash. */
  const seen = new Map();
  for (const doc of out.documents) {
    if (doc.resolutionNumber == null) continue;
    const k = doc.resolutionRef;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(doc);
  }
  /* Two documents sharing one register number. Whether that is one event filed
     twice (019 "Minutes of first annual general meeting" / 019 "AGM minutes")
     or two real authorisations that reuse a number (053 "[Afzal Hayat for FIR
     against Hassan Maalik]" / 053 "[... against Waqar Yasir]") cannot be
     settled from the filename, and guessing would merge two separate legal
     acts. The shared number and whether the dates agree are reported; the
     reader decides. Both documents always stay listed. */
  out.duplicateNumbers = [...seen.entries()].filter(([, v]) => v.length > 1).map(([ref, docs]) => {
    const sameDate = docs.every((x) => x.documentDate && x.documentDate === docs[0].documentDate);
    for (const x of docs) { x.numberShared = true; x.numberSharedWith = docs.filter((y) => y !== x).map((y) => y.name); }
    return { ref, count: docs.length, sameDate, documents: docs.map((x) => ({ name: x.name, title: x.displayTitle, date: x.documentDate })) };
  });
  out.malformedNumbers = out.documents.filter((d) => d.numberMalformed).map((d) => d.name);
  out.unnumbered = out.documents.filter((d) => d.resolutionNumber == null).length;
  return out;
}

module.exports = { describe, bifurcate, classify, numberOf, dateOf, subjectOf, titleOf, TYPES, SUBJECTS };
