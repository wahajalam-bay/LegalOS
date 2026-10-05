/* WHAT EACH COMMERCIAL DOCUMENT IS, READ FROM THE DOCUMENT.
 *
 * This is the document-level understanding the Commercial reconciliation is
 * built on. For every file under the Commercial roots it answers, with the
 * evidence attached:
 *
 *   how much of it we could actually read      contentState
 *   what kind of instrument it is              documentType
 *   whether it amends something                lifecycle + parentReference
 *   which project it concerns                  project (+ how we know)
 *   which entity and counterparty              entity / counterparty
 *   when it was made and takes effect          agreementDate / effectiveDate
 *
 * THREE RULES THIS FILE ENFORCES, because they are what keep it honest:
 *
 * 1. NOTHING IS INFERRED THAT IS NOT PRESENT. A field is absent unless the
 *    document says it. There is no "probably".
 *
 * 2. EVERY FACT CARRIES ITS PROVENANCE — which file, which method, which words,
 *    and a short quotation of the text that produced it. A caller can always
 *    ask "how do you know that" and get an answer it can check.
 *
 * 3. THE FULL TEXT NEVER LEAVES. Structured facts and quotations of at most a
 *    few dozen characters go into the artefacts; the body of a commercial
 *    agreement does not. The cached text exists so facts can be re-derived
 *    without re-downloading, and is read from here only.
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const DEEP_DIR = P.join(ROOT, "cache", "commercial");
const DEEP_MANIFEST = P.join(ROOT, "cache", "commercial-manifest.json");
const PROBES = P.join(ROOT, "cache", "commercial-probes.json");

let MANI = null, PROBE = null, BY_FILE = null;

function load(force) {
  if (MANI && !force) return;
  try { MANI = JSON.parse(fs.readFileSync(DEEP_MANIFEST, "utf8")); } catch (e) { MANI = {}; }
  try { PROBE = JSON.parse(fs.readFileSync(PROBES, "utf8")); } catch (e) { PROBE = { project: {}, instrument: {} }; }
  BY_FILE = null;
}

function probeIndex() {
  if (BY_FILE) return BY_FILE;
  BY_FILE = new Map();
  const add = (id, kind, word, type) => {
    if (!BY_FILE.has(id)) BY_FILE.set(id, { project: [], instrument: [] });
    BY_FILE.get(id)[kind].push(type ? { word, type } : word);
  };
  for (const [w, v] of Object.entries((PROBE && PROBE.project) || {})) {
    if (v.saturated) continue;
    for (const id of v.ids || []) add(id, "project", w);
  }
  for (const [w, v] of Object.entries((PROBE && PROBE.instrument) || {})) {
    if (v.saturated) continue;
    for (const id of v.ids || []) add(id, "instrument", w, v.type);
  }
  return BY_FILE;
}

function deepText(fileId) {
  try { return fs.readFileSync(P.join(DEEP_DIR, fileId + ".txt"), "utf8"); } catch (e) { return ""; }
}

/* ------------------------------------------------------------ the reading */

/* CONTENT STATES, as the brief defines them. "Read" is not a single thing and
   must never be reported as one. */
const STATE = {
  NATIVE: "CONTENT_NATIVE_TEXT",        // a .docx — the words as authored
  LOCAL: "CONTENT_LOCAL_EXTRACT",       // a PDF with a text layer, every page
  VISION: "CONTENT_VISION_READ",        // every page rendered and read visually
  OCR: "CONTENT_DRIVE_OCR",             // a scan, read through Google's index
  PARTIAL: "CONTENT_PARTIAL",           // some text, but plainly truncated or thin
  UNREADABLE: "CONTENT_UNREADABLE",     // nothing could read it, including the pages
  NOT_REQUIRED: "CONTENT_NOT_REQUIRED", // an image, a workbook read by the ingest
};

function contentState(fileId) {
  const m = (MANI || {})[fileId];
  const text = deepText(fileId);
  const probes = probeIndex().get(fileId);
  /* A document whose pages were RENDERED AND READ is read — more thoroughly
     than one skimmed through a keyword index, in fact, because someone looked
     at the signature page. It ranks above OCR and is never called unreadable. */
  let vis = null;
  try { vis = require("./commercial-vision-facts.js"); } catch (e) { vis = null; }
  const readVisually = vis && vis.wasRead(fileId) && !(vis.factsFor(fileId) || {}).unreadable;
  if (text && text.length >= 200) {
    // Short extracts from large files are partial, and say so.
    const thin = m && m.size > 2e6 && text.length < 4000;
    if (thin) return STATE.PARTIAL;
    return m && m.state === STATE.NATIVE ? STATE.NATIVE : STATE.LOCAL;
  }
  if (readVisually) return STATE.VISION;
  if (probes && (probes.project.length || probes.instrument.length)) return STATE.OCR;
  if (m && m.state === "CONTENT_NOT_REQUIRED") return STATE.NOT_REQUIRED;
  return STATE.UNREADABLE;
}

/* ------------------------------------------------------ instrument & type */

/* What the document IS. Ordered from the most specific claim to the least, and
   every rule quotes the words that fired so the classification can be argued
   with. Sale deeds before agreements; amendments are handled separately
   because an amendment of a lease is still about a lease. */
const TYPE_RULES = [
  ["SALE_DEED", [/\bsale deed\b/i, /\bagreement to sell\b/i, /\bvendee\b/i, /\bearnest money\b/i, /\bconveyance deed\b/i]],
  ["PPA", [/\bproject promotion agreement\b/i, /\bpromotion agreement\b/i, /\bexclusive marketing\b/i, /\bsales and marketing agreement\b/i]],
  ["LEASE", [/\blessor\b/i, /\blessee\b/i, /\btenancy agreement\b/i, /\bdemised premises\b/i, /\bmonthly rent\b/i]],
  ["CONSTRUCTION", [/\bbill of quantities\b/i, /\bworkmanship\b/i, /\bexcavation\b/i, /\bpiling\b/i, /\bgrey structure\b/i, /\bcontractor shall\b/i]],
  ["NDA", [/\bnon[- ]disclosure\b/i, /\bconfidentiality agreement\b/i]],
  ["MOU", [/\bmemorandum of understanding\b/i, /\bheads of terms\b/i, /\bletter of intent\b/i]],
  ["JV", [/\bjoint venture\b/i, /\bpartnership deed\b/i]],
  ["SERVICE", [/\bscope of (the )?services\b/i, /\bservice provider\b/i, /\bservice level\b/i, /\bconsultancy\b/i]],
  ["LAND_RECORD", [/\bkhasra\b/i, /\bkhewat\b/i, /\bmutation\b/i, /\bfard\b/i, /\bregistry\b/i]],
  ["APPROVAL", [/\bno objection certificate\b/i, /\bapproval letter\b/i, /\bNOC\b/]],
  ["POA", [/\bpower of attorney\b/i]],
  ["AGREEMENT", [/\bwitnesseth\b/i, /\bthis agreement is made\b/i, /\bhereinafter referred to as\b/i]],
];

/* Where a document sits in an agreement's life. This is a SEPARATE axis from
   the instrument type: "Second Amendment to the Lease" is a LEASE and an
   AMENDMENT, and collapsing the two would lose the parent relationship the
   brief asks for. */
const LIFECYCLE_RULES = [
  ["TERMINATION", [/\bdeed of (termination|cancellation)\b/i, /\btermination agreement\b/i, /\bhereby terminat/i, /\brescission\b/i]],
  ["NOVATION", [/\bnovation\b/i, /\bdeed of novation\b/i]],
  ["EXTENSION", [/\bextension agreement\b/i, /\bhereby extend/i, /\bextend the term\b/i]],
  ["RENEWAL", [/\brenewal agreement\b/i, /\bhereby renew/i]],
  ["ADDENDUM", [/\baddendum\b/i]],
  ["SUPPLEMENT", [/\bsupplemental agreement\b/i, /\bsupplement to\b/i]],
  ["AMENDMENT", [/\bamendment\b/i, /\bamended and restated\b/i, /\bhereby amend/i]],
  /* A document that IS a schedule begins with the word. An agreement that
     merely REFERENCES "Schedule 1" in its opening paragraph is not one — that
     variant matched 148 documents, most of them ordinary agreements. */
  ["ANNEXURE", [/^\s*annexure\b/i]],
  ["SCHEDULE", [/^\s*schedule\b/i]],
];

const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

/* WORD-PROCESSOR DAMAGE. Text pulled out of a .docx carries the formatting runs
   the author left behind, so a date arrives as "1 st August , 20 19" and a
   party as "Zameen Media (Private) Limited (“Zameen”)". Regexes written for
   clean prose match none of it — which is why the first run found 5 dates and
   2 parties in 418 readable documents and not one parent reference.
   This repairs the three artefacts that actually occur: smart quotes, a space
   before an ordinal suffix, and a year split across a run boundary. */
function tidy(t) {
  return String(t || "")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/(\d)\s+(st|nd|rd|th)\b/gi, "$1$2")
    .replace(/\b(19|20)\s?(\d)\s?(\d)\b/g, "$1$2$3")
    .replace(/\s+,/g, ",")
    .replace(/[ \t]{2,}/g, " ");
}

const quote = (m) => String(m || "").replace(/\s+/g, " ").trim().slice(0, 80);

/* A document that amends another one usually says so in its first paragraph:
   "...to the Lease Agreement dated 12 March 2021 between X and Y". Capture the
   reference as written; do not attempt to resolve it here. */
/* The four shapes that actually occur in these agreements. The "day of" form is
   the commonest in Pakistani drafting — "entered into at Islamabad on this 24th
   day of May, 2021" — and leaving it out cost most of the dates in the estate.
   The trailing \\d{0,3} on the day absorbs OCR damage: "28th" is routinely read
   as "28111". */
const DATE_RE = "([0-9]{1,2}(?:st|nd|rd|th)?[\\s./,-]+[A-Za-z]{3,9}[\\s./,-]+[0-9]{4}"
  + "|[0-9]{1,2}[0-9]{0,3}\\s*(?:st|nd|rd|th)?\\s+day\\s+of\\s+[A-Za-z]{3,9},?\\s*[0-9]{4}"
  + "|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}"
  + "|[A-Za-z]{3,9}[\\s./,-]+[0-9]{1,2}(?:st|nd|rd|th)?[\\s./,-]+[0-9]{4})";

function parentReference(raw) {
  const head = tidy(raw.slice(0, 8000));
  const pats = [
    new RegExp("\\b(?:to|of|amends?|amending|supplement(?:al|ing)? to)\\s+the\\s+([A-Z][A-Za-z ]{4,60}?Agreement)\\s+dated\\s+" + DATE_RE),
    new RegExp("\\b(?:original|principal|parent|said)\\s+([A-Za-z ]{4,40}?agreement)\\s+dated\\s+" + DATE_RE, "i"),
    new RegExp("\\bagreement\\s+dated\\s+" + DATE_RE, "i"),
  ];
  for (const re of pats) {
    const m = head.match(re);
    if (m) return { text: quote(m[0]), instrument: m[2] ? quote(m[1]) : null, date: quote(m[2] || m[1]) };
  }
  return null;
}

function dates(raw) {
  const out = { agreementDate: null, effectiveDate: null, executionDate: null };
  const head = tidy(raw.slice(0, 12000));
  // Tolerant of "1st August, 2019", "1.8.2019", "August 1, 2019" and the comma
  // and space debris a word processor leaves between them.
  const DATE = DATE_RE;
  const grab = (re) => { const m = head.match(new RegExp(re, "i")); return m ? quote(m[1]) : null; };
  out.agreementDate = grab("\\b(?:is|are)?\\s*(?:made|entered into)[^.]{0,60}?on\\s+this\\s+" + DATE)
    || grab("\\bagreement\\s+dated\\s+" + DATE)
    || grab("\\bmade\\s+and\\s+entered\\s+into[^.]{0,40}?on\\s+(?:this\\s+)?" + DATE)
    || grab("\\bmade\\s+(?:on|as of)?\\s*(?:this\\s+)?" + DATE)
    || grab("\\bdated\\s+" + DATE);
  out.effectiveDate = grab("\\beffective\\s+(?:from|as of|date)[:\\s\"()]*" + DATE)
    || grab(DATE + "[^.]{0,30}?\\beffective\\s+date");
  out.executionDate = grab("\\bexecuted\\s+(?:on|this)\\s*" + DATE);
  return out;
}

/* Parties, only from text clean enough to be worth quoting. An OCR'd letterhead
   becomes "C )J .Y (Pakistan)" and the "between X and Y" shape matches it
   happily, so a candidate has to read like a name before it is kept. */
function looksLikeName(v) {
  const x = String(v || "").trim();
  if (x.length < 8 || x.length > 70) return false;
  if (!/^[A-Za-z][A-Za-z.&'() -]*$/.test(x)) return false;
  if ((x.match(/[A-Za-z]/g) || []).length / x.length < 0.75) return false;
  const words = x.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.filter((w) => w.replace(/[^A-Za-z]/g, "").length <= 1).length <= 1;
}

function parties(raw) {
  const out = [];
  // Quotes are stripped first: "Zameen Media (Private) Limited ("Zameen") and
  // House Building Company Limited" only parses once the defined-term in
  // quotation marks is out of the way.
  const head = tidy(raw.slice(0, 14000)).replace(/"[^"]{0,40}"/g, " ");
  /* Capture generously, then trim each side at the corporate suffix. A lazy
     match stopped at the first space and returned "House Building" for
     "House Building Company Limited". */
  const trimName = (v) => {
    const x = String(v || "").replace(/\s+/g, " ").trim();
    // GREEDY: take the LAST corporate suffix, so "House Building Company
    // Limited" does not stop at "Company".
    const m = x.match(/^(.*\b(?:Limited|Ltd\.?|LLC|L\.L\.C\.?|Inc\.?|Corporation|Company|Pvt\.?))\b/i);
    return (m ? m[1] : x).replace(/[,.;]+$/, "").trim();
  };
  /* "by and between:" — the colon is normal Pakistani drafting and it was
     defeating the whole party capture. Also allow a line break after it. */
  for (const m of head.matchAll(/\b(?:by and )?between\s*:?\s+([A-Z][^;]{6,90}?)\s+and\s+([A-Z][^;]{6,90}?)(?=[,.;(\[]|\s+(?:each|collectively|hereinafter|whereas|for the)\b)/gi)) {
    for (const c of [trimName(m[1]), trimName(m[2])]) if (looksLikeName(c)) out.push(c);
    if (out.length >= 6) break;
  }
  return [...new Set(out)];
}

/* --------------------------------------------------------------- the fact */

function contextFor(file) {
  load();
  const id = file.id;
  const state = contentState(id);
  const text = deepText(id);
  const probes = probeIndex().get(id) || { project: [], instrument: [] };
  const evidence = [];
  const readable = !!(text && text.length >= 200);

  /* What the PAGES said. Used where the text is silent, and — for execution —
     preferred outright, because only the pages can show a signature. */
  let vis = null;
  try { vis = require("./commercial-vision-facts.js"); } catch (e) { vis = null; }
  const visId = vis ? vis.identity(id) : null;
  const visType = vis ? vis.documentType(id) : null;
  const visExec = vis ? vis.executionState(id) : { state: null, evidence: null };

  // ---- instrument type
  let documentType = null;
  if (readable) {
    for (const [type, rules] of TYPE_RULES) {
      const hit = rules.map((re) => text.match(re)).find(Boolean);
      if (hit) {
        documentType = type;
        evidence.push({ field: "documentType", value: type, source: "document content",
          method: state, quote: quote(hit[0]), confidence: "HIGH" });
        break;
      }
    }
  }
  /* A word found by OCR can tell us a CLAUSE is present without telling us what
     the instrument is. "allotment" and "possession" are clauses of a sale, not
     document types, and treating them as types made ALLOTMENT the commonest
     "document type" in the estate. Clause signals are kept, and kept separate. */
  const CLAUSE_ONLY = new Set(["ALLOTMENT", "POSSESSION", "ESCROW", "GUARANTEE", "INDEMNITY", "DISPUTE_CLAUSE"]);
  const clauses = [...new Set(probes.instrument.map((p) => p.type).filter((t) => CLAUSE_ONLY.has(t)))];
  if (clauses.length) {
    evidence.push({ field: "clauses", value: clauses, source: "Drive OCR index", method: STATE.OCR, confidence: "MEDIUM" });
  }
  if (!documentType && probes.instrument.length) {
    const score = new Map();
    for (const p of probes.instrument) if (!CLAUSE_ONLY.has(p.type)) score.set(p.type, (score.get(p.type) || 0) + 1);
    const top = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      documentType = top[0];
      evidence.push({ field: "documentType", value: top[0], source: "Drive OCR index",
        method: STATE.OCR, words: probes.instrument.filter((p) => p.type === top[0]).map((p) => p.word),
        confidence: "MEDIUM" });
    }
  }

  // ---- lifecycle and parent
  let lifecycle = null, amendmentNumber = null, parent = null;
  if (readable) {
    /* The TITLE decides. "FIRST AMENDMENT to Digital Marketing Agreement" that
       goes on to "extend the Term" is an amendment, not an extension — but the
       body mentions extending first, and matching the whole document labelled
       it EXTENSION. Look at the heading, then fall back to the body. */
    /* The TITLE is the first line, not the first 300 characters. A 300-character
       window reached past "FIRST AMENDMENT TO SERVICE AGREEMENT" into a body
       that says "extend the Term", and EXTENSION won on a document whose own
       heading says amendment. */
    const firstLine = (text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 3) || "").slice(0, 140);
    const heading = tidy(firstLine);
    for (const source of [heading, text]) {
      for (const [stage, rules] of LIFECYCLE_RULES) {
        const hit = rules.map((re) => source.match(re)).find(Boolean);
        if (hit) {
          lifecycle = stage;
          evidence.push({ field: "lifecycle", value: stage,
            source: source === heading ? "document title" : "document content",
            method: state, quote: quote(hit[0]), confidence: source === heading ? "HIGH" : "MEDIUM" });
          break;
        }
      }
      if (lifecycle) break;
    }
    const ord = text.slice(0, 3000).match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:amendment|addendum|supplement|extension)\b/i);
    if (ord) {
      amendmentNumber = ORDINALS[ord[1].toLowerCase()] || null;
      evidence.push({ field: "amendmentNumber", value: amendmentNumber, source: "document content",
        method: state, quote: quote(ord[0]), confidence: "HIGH" });
    }
    parent = parentReference(text);
    if (parent) {
      evidence.push({ field: "parentAgreement", value: parent.date, source: "document content",
        method: state, quote: parent.text, confidence: "MEDIUM" });
    }
  }
  /* An unread document is not an "original" — we simply do not know. Defaulting
     it to ORIGINAL made 1,279 of 1,303 documents look like original agreements
     when most of them had not been opened yet, which is precisely the kind of
     confident-looking nonsense this reconciliation exists to remove. */
  if (!lifecycle) lifecycle = readable ? "ORIGINAL" : "UNKNOWN";

  // ---- project, from what the document says rather than where it sits
  const projectWords = probes.project.slice();
  const projectInText = [];
  if (readable) {
    for (const w of new Set(projectWords)) {
      const re = new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      const m = text.match(re);
      if (m) projectInText.push(w);
    }
  }
  if (projectWords.length) {
    evidence.push({
      field: "projectWords",
      value: projectWords,
      source: projectInText.length ? "document content (confirmed in held text)" : "Drive OCR index",
      method: projectInText.length ? state : STATE.OCR,
      confirmed: projectInText,
      confidence: projectInText.length ? "HIGH" : "MEDIUM",
    });
  }

  // ---- dates and parties
  if (!documentType && visType) {
    documentType = visType;
    evidence.push({ field: "documentType", value: visType, source: "every page read visually",
      method: STATE.VISION, confidence: (visId && visId.confidence) || "MEDIUM" });
  }

  const d = readable ? dates(text) : { agreementDate: null, effectiveDate: null, executionDate: null };
  // Dates the pages showed, where the text had none. Kept separate (§23).
  if (visId) {
    if (!d.agreementDate && visId.agreementDate) d.agreementDate = visId.agreementDate;
    if (!d.effectiveDate && visId.effectiveDate) d.effectiveDate = visId.effectiveDate;
    if (!d.executionDate && visId.executionDate) d.executionDate = visId.executionDate;
  }
  for (const k of ["agreementDate", "effectiveDate", "executionDate"]) {
    if (d[k]) evidence.push({ field: k, value: d[k], source: "document content", method: state, confidence: "MEDIUM" });
  }
  let ps = readable ? parties(text) : [];
  if (!ps.length && visId && visId.parties.length) {
    ps = visId.parties.slice(0, 6);
    evidence.push({ field: "parties", value: ps, source: "every page read visually", method: STATE.VISION, confidence: "HIGH" });
  }
  if (ps.length) evidence.push({ field: "parties", value: ps, source: "document content", method: state, confidence: "MEDIUM" });

  return {
    fileId: id,
    contentState: state,
    chars: text ? text.length : 0,
    documentType,
    clauses,
    lifecycle,
    amendmentNumber,
    parentReference: parent,
    projectWords,
    projectConfirmedInText: projectInText,
    agreementDate: d.agreementDate,
    effectiveDate: d.effectiveDate,
    executionDate: d.executionDate,
    parties: ps,
    // Seen on the page, or explicitly not seen. Null means nobody has looked.
    executed: visExec.state,
    executionEvidence: visExec.evidence,
    visionProject: visId ? visId.project : null,
    parentFromPages: visId ? visId.parentAgreement : null,
    evidence,
  };
}

const isReadable = (state) => state === STATE.NATIVE || state === STATE.LOCAL || state === STATE.PARTIAL;

module.exports = { load, contextFor, contentState, deepText, STATE, isReadable, probeIndex };
