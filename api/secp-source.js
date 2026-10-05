// The SECP source: "Entities data for secp filing".
//
// WHY THIS FILE EXISTS. api/secp.js was written when this Drive root was not
// shared with the service account, and it says so at the top: a crawl of the
// four visible roots found no FY folder, no AGM folder and no SECP folder, so
// the module was seeded only from board minutes it could find elsewhere. That
// was an honest statement of what was visible at the time. It is no longer
// true. The root is now shared, and it holds 3,367 documents filed by ENTITY
// and by CALENDAR YEAR — the statutory record the module was missing.
//
// Everything here is read from the FOLDER PATH, never guessed from a filename's
// resemblance to something else. The path states the entity and the year; the
// filename is used only to read a form number that is literally printed in it.
// A document is placed where the source put it, or it is left unplaced.
//
// THE ONE RULE THAT MATTERS MOST: a form on file is NOT a filing. A Form 29 PDF
// sitting in "CY 2023" proves the company prepared a Form 29. It does not prove
// SECP received it. Only an acknowledgement, challan or receipt is evidence of
// submission, and the two are counted separately and labelled differently all
// the way to the screen. Conflating them would let LegalOS report statutory
// compliance that nobody can show a receipt for.

const drive = require("./drive");
/* entities is required LAZILY, inside build(). At module scope it creates a
   cycle: registers.js calls loadCache() while it is still initialising, that
   path reaches this file, this file pulled in entities, and entities' own
   top-level `require("./registers")` then captured registers' half-built
   exports — permanently. The symptom was a 500 on the SECP page,
   "registers.ensure is not a function", from a module graph that looks
   perfectly acyclic on paper. By the time build() runs, every module is
   finished loading. */
const entityKey = (name) => require("./entities").entityKey(name);

const ROOT_RE = /^Entities data for secp filing\b/;

/* ------------------------------------------------------------- taxonomy */

// Folder categories, matched against the segments BELOW the entity. Order
// matters: the first match wins, so the specific patterns precede the general.
const CATEGORIES = [
  [/^CY\s*(\d{4})$/i,                            "FILING_YEAR"],
  [/annual general meeting\s*FY\s*(\d{4})/i,     "AGM"],
  [/extraordinary general meeting|^EOGM\b/i,     "EOGM"],
  [/share transfer|director change|change of director/i, "CORPORATE_ACTION"],
  /* "Share Certificates" is the usual wording, but three entities file the
     same folder as "Shareholders_ Certificates" / "Shareholder_s Certificates"
     — the underscore is Drive's substitution for an apostrophe. Matching only
     the contiguous phrase left those folders as generic ENTITY_LEVEL, so three
     share-certificate sets were held but not presented as the statutory
     register they are. */
  [/share ?holder[_'’]*s?[_'’]*\s*certificate|share certificate/i, "SHARE_CERTIFICATE"],
  /* An application to rectify a filed Form 3 is an event filing against the
     company, not a loose entity-level document. */
  [/data rectification|rectification of form/i,  "CORPORATE_ACTION"],
  [/register of members/i,                       "REGISTER_OF_MEMBERS"],
  [/register of directors/i,                     "REGISTER_OF_DIRECTORS"],
  [/resolutions?\s*(and|&)\s*authorizations?/i,  "RESOLUTION"],
  [/show cause notice|orders?$/i,                "SECP_NOTICE"],
  [/PF Trust|provident fund/i,                   "PROVIDENT_FUND"],
  [/financial statements?/i,                     "FINANCIAL_STATEMENTS"],
  [/incorporation|memorandum|articles/i,         "INCORPORATION"],
  [/correspondence/i,                            "CORRESPONDENCE"],
];

// Evidence that a document actually reached the regulator. Deliberately narrow.
const SUBMITTED_RE = /acknowledg|challan|(?<![a-z])receipt(?![a-z])|(?<![a-z])filed(?![a-z])|(?<![a-z])submitted(?![a-z])/i;
// A form number as PRINTED in the filename, e.g. "Form 29", "Form A", "Form 45".
/* "_" is a word character, so \bform never matches "015_Form 29" -- the same
   boundary trap that once misfiled 216 documents. Lookarounds, not \b. */
/* AND THE WORD IS SOMETIMES MISTYPED.
   "Fom A FY 2022", "Fomr A made upto 31.07.2023", "From 45" -- three Form A
   filings and a Form 45 that sit in Drive and were read as no form at all, so
   the years holding them reported "No source document" against a form the
   company had plainly filed. These are single-character slips of one word, not
   guesses about what a document might be: the spelling is tolerated ONLY when
   a real form code follows it, which is why "Fomr for Transfer of shares" --
   where "form" is the ordinary noun and no code follows -- is still not a form.
   "from" is a real English word, so it is accepted only at the start of a
   filename segment and only when a form code follows it directly. */
/* Longest first: with "fom" ahead of "fomr", "Fomr A" matched "fom" and read
   the leftover "r" as the form code -- a Form A filed as "Form r". */
const FORM_WORD_TYPOS = "(?:fomr|forn|fom|frm)";
/* A form code is "29", "A", or a suffixed variant like "3A" or "10B" -- those
   last were read as no form at all, so a Form 3A share transfer carried no
   form code anywhere in the estate.

   The separator is REQUIRED after a misspelling and optional only after the
   correct spelling. Without that, "Fomr for Transfer of shares" backtracked to
   "Fom" + "r" and invented a "Form r": the engine will always find a reading
   if one is permitted, so the misspellings are given no room to be creative. */
const FORM_CODE = "([0-9]{1,3}[A-Z]?|[A-Z])";
const FORM_RE = new RegExp(
  "(?<![A-Za-z0-9])(?:"
    + "form\\s*[-_ .]?\\s*" + FORM_CODE                      // correctly spelt
    + "|(?:" + FORM_WORD_TYPOS + "|(?<![a-z] )from)\\s*[-_ .]\\s*" + FORM_CODE  // a slip of the pen
    + ")(?![A-Za-z0-9])", "i");
/* Two capture groups, one meaning: whichever branch matched. */
const formCodeIn = (name) => { const m = String(name || "").match(FORM_RE); return m ? (m[1] || m[2]) : null; };

function classify(segsBelowEntity) {
  let category = null, year = null, fy = null;
  for (const seg of segsBelowEntity) {
    for (const [re, name] of CATEGORIES) {
      const m = seg.match(re);
      if (!m) continue;
      if (name === "FILING_YEAR") { year = "CY " + m[1]; if (!category) category = name; }
      else {
        if (name === "AGM" && m[1]) fy = "FY " + m[1];
        category = name;                       // a deeper, specific folder wins
      }
      break;
    }
  }
  return { category: category || "ENTITY_LEVEL", year, fy };
}

/* ------------------------------------------------------------ the model */

let CACHE = null;

function build() {
  const files = drive.indexFiles().filter((f) => ROOT_RE.test(f.folderPath || ""));
  const byEntity = new Map();
  const docs = [];

  /* WHICH COMPANY DOES THIS FILE BELONG TO.
     Normally the entity is the folder directly under Group/Non-Group. But the
     estate contains two companies filed inside another company's folder:

       Zameen Crest .../ CY 2024 / Zameen Delta (Private) Limited / CY 2019/...
       Zameen Medallion .../ Zameen Nord (SMC-Private) Limited /...

     Reading the entity as "the second segment" handed Zameen Delta's audited
     accounts and AGM minutes to Zameen Crest, and Zameen Nord's 71 files to
     Zameen Medallion -- one company's statutory record filed under another's
     name. Both are real entities with their own folders elsewhere, so the
     owner is the DEEPEST segment that names a known entity, and the misfiling
     is recorded rather than silently corrected: the file genuinely sits there
     in Drive, and Drive is not written to. */
  const known = new Set();
  for (const f of files) {
    const segs = String(f.folderPath || "").split(" / ");
    if (segs[2]) known.add(entityKey(segs[2]));
  }

  for (const f of files) {
    const segs = String(f.folderPath || "").split(" / ");
    const group = segs[1] || "";                 // Group Entities | Non-Group Entities
    if (!segs[2]) continue;                      // a file loose at the root, left unplaced
    let ownerIdx = 2;
    for (let i = 3; i < segs.length; i++) if (known.has(entityKey(segs[i]))) ownerIdx = i;
    const entityName = segs[ownerIdx];
    const filedUnder = ownerIdx === 2 ? null : segs.slice(0, ownerIdx).join(" / ");
    const below = segs.slice(ownerIdx + 1);
    const { category, year, fy } = classify(below);

    const form = formCodeIn(f.name);
    // Submission evidence is read from the filename only when it SAYS so.
    const submitted = SUBMITTED_RE.test(f.name);

    const key = entityKey(entityName);
    let e = byEntity.get(key);
    if (!e) {
      e = {
        key, name: entityName,
        /* Other spellings of this company seen in the source. The register
           shows one canonical entity; the variants are kept so a name a
           colleague searches for is still findable and nothing is lost. */
        aliases: [],
        group: /^non-group/i.test(group) ? "non-group" : "group",
        folderPath: segs.slice(0, ownerIdx + 1).join(" / "),
        years: new Map(), categories: new Map(),
        documents: 0, forms: 0, submissionEvidence: 0,
      };
      byEntity.set(key, e);
    }
    if (entityName !== e.name && !e.aliases.includes(entityName)) e.aliases.push(entityName);
    e.documents++;
    if (form) e.forms++;
    if (submitted) e.submissionEvidence++;
    e.categories.set(category, (e.categories.get(category) || 0) + 1);
    if (year) {
      let y = e.years.get(year);
      if (!y) e.years.set(year, (y = { year, documents: 0, forms: new Set(), agmFY: null, submissionEvidence: 0 }));
      y.documents++;
      if (form) y.forms.add(String(form).toUpperCase());
      if (fy) y.agmFY = fy;
      if (submitted) y.submissionEvidence++;
    }

    docs.push({
      fileId: f.id, name: f.name, folderPath: f.folderPath, mimeType: f.mimeType,
      webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "",
      entityKey: key, entityName, group: e.group,
      category, year, agmFY: fy, form,
      // Set when the file sits inside ANOTHER entity's folder in Drive.
      sourceLocationMismatch: !!filedUnder, filedUnder,
      // Named so no caller can read it as "this was filed".
      submissionEvidence: submitted,
    });
  }

  const list = [...byEntity.values()].map((e) => ({
    key: e.key, name: e.name, group: e.group, folderPath: e.folderPath, aliases: e.aliases,
    documents: e.documents, forms: e.forms, submissionEvidence: e.submissionEvidence,
    categories: Object.fromEntries(e.categories),
    years: [...e.years.values()]
      .sort((a, b) => String(b.year).localeCompare(String(a.year)))
      .map((y) => ({ year: y.year, documents: y.documents, forms: [...y.forms].sort(), agmFY: y.agmFY, submissionEvidence: y.submissionEvidence })),
  })).sort((a, b) => b.documents - a.documents);

  CACHE = {
    root: "Entities data for secp filing",
    entities: list,
    documents: docs,
    totals: {
      entities: list.length,
      documents: docs.length,
      placedInAYear: docs.filter((d) => d.year).length,
      formsOnRecord: docs.filter((d) => d.form).length,
      withSubmissionEvidence: docs.filter((d) => d.submissionEvidence).length,
    },
  };
  return CACHE;
}

const get = () => CACHE || build();
const byEntityKey = (k) => get().entities.find((e) => e.key === k) || null;
const documentsFor = (k, year) => get().documents
  .filter((d) => d.entityKey === k && (!year || d.year === year));

// Used by the reconciler so every file under this root carries a disposition
// that names what it IS, rather than falling into UNRESOLVED.
function dispositionFor(fileId) {
  const d = get().documents.find((x) => x.fileId === fileId);
  return d ? "SECP_" + d.category : null;
}

module.exports = { build, get, byEntityKey, documentsFor, dispositionFor, ROOT_RE, classify };
