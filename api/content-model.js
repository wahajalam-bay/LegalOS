/* WHAT EACH DOCUMENT ACTUALLY SAYS.
 *
 * Until now every classification in LegalOS came from a folder path and a file
 * name. This module is the first that reads the documents themselves, and it
 * fuses the only two ways of doing that which exist on this machine:
 *
 *   TEXT_EXTRACTED       tools/content-index.js downloaded the file, pulled its
 *                        text out locally (pdftotext / docx) and cached it. We
 *                        hold the real words, so phrases can be matched exactly.
 *
 *   SCAN_READ_VIA_INDEX  the file is scanned paper with no text layer, and this
 *                        box has no OCR. Google's Drive index has already OCR'd
 *                        it, so tools/content-probe.js asked that index which
 *                        documents contain each of a set of measured, single
 *                        words. We know some of what the document says, not all.
 *
 *                        HOW ACCURATE, measured against 791 documents whose text
 *                        we hold: recall 91%, precision ~93%. The raw precision
 *                        looked like 67% until the disagreements were checked by
 *                        downloading the documents WHOLE — 11 of 14 turned out
 *                        to be the index being right and our own extract being
 *                        partial, because we read the first 8 pages and these
 *                        are 15-to-36-page leases whose "lessee" sits on page
 *                        20. So this is good supporting evidence and is used as
 *                        such; it is NEVER on its own enough to assert that a
 *                        document belongs to a record.
 *
 *   NOT_READ             an image, a legacy .doc, a file too large, or one the
 *                        fetch failed on. We have not read it and do not pretend
 *                        to have.
 *
 * The distinction is carried all the way out to the screen. A type derived from
 * the full text and a type derived from three OCR'd keywords are not the same
 * claim, and a reader is entitled to know which one they are looking at.
 *
 * SECURITY — READ THIS BEFORE USING contentModule().
 * The module a document's CONTENT suggests is used for sorting and labelling
 * only. It must never widen who can open the file. Authorisation stays where it
 * was: the Drive root's module group, plus the records that cite the document.
 * If content routing were allowed to move a document into another family, a
 * lease clause in a litigation bundle would hand the whole bundle to the
 * commercial team — the standing rule here is that no document becomes visible
 * because it was moved between families.
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const DIR = P.join(ROOT, "cache", "content");
const MANIFEST = P.join(ROOT, "cache", "content-manifest.json");
const PROBES = P.join(ROOT, "cache", "content-probes.json");

let MANI = null, PROBE = null, TEXT_CACHE = new Map();

function load(force) {
  if (MANI && !force) return;
  try { MANI = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch (e) { MANI = {}; }
  try { PROBE = JSON.parse(fs.readFileSync(PROBES, "utf8")); } catch (e) { PROBE = { type: {} }; }
}

/* The cached text of one document, or "" if we never got any. Kept in a small
   LRU because the register build asks for the same handful repeatedly and the
   whole corpus would be far too much to hold. */
function textOf(fileId) {
  load();
  if (TEXT_CACHE.has(fileId)) return TEXT_CACHE.get(fileId);
  let t = "";
  try { t = fs.readFileSync(P.join(DIR, fileId + ".txt"), "utf8"); } catch (e) { t = ""; }
  if (TEXT_CACHE.size > 400) TEXT_CACHE.clear();
  TEXT_CACHE.set(fileId, t);
  return t;
}

/* ------------------------------------------------- type, from the real text */

/* These run against text we HOLD, so unlike the Drive index they are true
   phrase matches and can be as specific as the instrument itself. Order is
   significance, not preference: a document can satisfy several, and all of them
   are reported with the phrase that fired. */
const TEXT_RULES = [
  /* Added after reading the 648 documents whose text we hold but which matched
     nothing. They were not unidentifiable — they were ordinary corporate
     paperwork with no rule written for them: SECP's own eServices printouts,
     digitally certified extracts, auditor consents, tax certificates and bank
     mandates. Patterns are kept tolerant of OCR damage ("BANK ALFAL1H"), which
     is why they anchor on the parts that survive scanning: URLs, headings and
     registration lines. */
  ["SECP_FILING", [/eservices\.secp\.gov\.pk/i, /XFDLControllerServlet/i]],
  ["SECP_CERTIFIED_EXTRACT", [/digital\s+certified\s+(list of company officers|company profile|form)/i, /tracking id[:\s]*\d{5,}/i]],
  ["FINANCIAL_STATEMENTS", [/auditor'?s?\s+report/i, /we have audited the annexed/i, /financial statements? for the (period|year)/i, /statement of financial position/i]],
  /* The consent letters arrive on the auditor's letterhead and say "consent"
     further down the page, so the two have to be required together across the
     whole document rather than adjacently. */
  ["AUDITOR_CONSENT", [/consent\s+(letter|to act)[\s\S]{0,80}auditor/i, /auditor'?s?\s+consent/i, /chartered accountants[\s\S]{0,6000}\bconsent\b/i]],
  ["TAX_CERTIFICATE", [/type of person[\s\S]{0,60}\bcompany\b/i, /national tax number/i, /\bNTN\b[\s\S]{0,40}certificate/i]],
  ["BANK_MANDATE", [/account opening/i, /\bbank\b[\s\S]{0,60}\bmandate\b/i, /operation of (the )?bank account/i]],
  ["LITIGATION", [/\bin the court of\b/i, /\bvakalatnama\b/i, /\bplaint\b/i, /\border sheet\b/i, /\bwritten statement\b/i, /\bcivil judge\b/i, /\bstay application\b/i]],
  ["RESOLUTION", [/\bresolved that\b/i, /\bboard resolution\b/i, /\bcertified true copy of the resolution\b/i]],
  ["SECP_FILING", [/securities and exchange commission of pakistan/i, /\bform\s*(?:29|45|a|9|21|19)\b[^.]{0,40}\b(?:filed|filing|annual return)\b/i, /\bcompanies act,?\s*2017\b/i]],
  ["STATUTORY_REGISTER", [/\bregister of members\b/i, /\bregister of directors\b/i, /\bcorporate unique identification number\b/i]],
  ["SHARE_CERTIFICATE", [/\bshare certificate\b/i, /\bequity shares of (?:rs|pkr)/i]],
  ["LEASE", [/\blessor\b[\s\S]{0,400}\blessee\b/i, /\btenancy agreement\b/i, /\bmonthly rent\b/i, /\brent free period\b/i, /\bdemised premises\b/i]],
  ["SERVICE", [/\bscope of (?:the )?services\b/i, /\bservice provider\b/i, /\bservice level\b/i]],
  ["LOAN", [/\bloan agreement\b/i, /\bpromissory note\b/i, /\bborrower\b[\s\S]{0,300}\blender\b/i, /\bprincipal amount\b/i]],
  ["NOTICE", [/\blegal notice\b/i, /\bnotice to vacate\b/i, /\bcease and desist\b/i]],
  ["LAND_RECORD", [/\bkhasra\b/i, /\bfard\b/i, /\bmutation\b/i, /\bsale deed\b/i, /\bregistry\b/i]],
  ["NDA", [/\bnon[- ]disclosure\b/i, /\bconfidentiality agreement\b/i]],
  ["POA", [/\bpower of attorney\b/i]],
  ["AFFIDAVIT", [/\baffidavit\b/i]],
  ["APPROVAL", [/\bno objection certificate\b/i, /\bnoc\b/i, /\bapproval letter\b/i]],
  ["INCORPORATION", [/\bmemorandum of association\b/i, /\barticles of association\b/i, /\bcertificate of incorporation\b/i]],
  ["AGREEMENT", [/\bwitnesseth\b/i, /\bthis agreement is made\b/i, /\bhereinafter referred to as\b/i]],
];

/* Facts worth lifting out of a document we can actually read. Each is quoted
   back with the text that produced it so a reader can check it rather than
   trust it. */
function harvest(text) {
  const out = { dates: [], amounts: [], refs: [], parties: [] };
  const t = text.slice(0, 14000);
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi)) {
    out.dates.push(m[0]);
    if (out.dates.length >= 8) break;
  }
  for (const m of t.matchAll(/\b(?:Rs\.?|PKR|USD|AED|EUR|GBP)\s?\.?\s?([\d,]{4,})\b/gi)) {
    out.amounts.push(m[0].replace(/\s+/g, " "));
    if (out.amounts.length >= 8) break;
  }
  // Pakistani corporate/tax identifiers, and court case numbers.
  for (const re of [/\bCUIN[:\s]*([0-9]{5,9})\b/gi, /\bNTN[:\s]*([0-9-]{6,15})\b/gi,
    /\b(?:C\.?M\.?|F\.?A\.?O\.?|R\.?F\.?A\.?|W\.?P\.?)\s*No\.?\s*([0-9]{1,6}\/[0-9]{2,4})/gi,
    /\bsuit no\.?\s*([0-9]{1,6}[^\s,;]{0,8})/gi]) {
    for (const m of t.matchAll(re)) { out.refs.push(m[0].replace(/\s+/g, " ").trim()); if (out.refs.length >= 8) break; }
  }
  /* Party names, but only where the text is clean enough to trust. A scan's OCR
     turns a letterhead into "C )J .Y (Pakistan)", and the "between X and Y"
     shape happily matches that — it produced four parties across four hundred
     documents and the one worth looking at was noise. A candidate must read
     like a name: mostly letters, at least two words, and no stray bracket or
     lone-character debris. Better to extract nothing than to put rubbish in an
     audit artefact that a person is meant to rely on. */
  const looksLikeName = (v) => {
    const x = String(v).trim();
    if (x.length < 8 || x.length > 60) return false;
    if (!/^[A-Za-z][A-Za-z.&'() -]*$/.test(x)) return false;
    const letters = (x.match(/[A-Za-z]/g) || []).length;
    if (letters / x.length < 0.75) return false;              // punctuation soup
    const words = x.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    if (words.filter((w) => w.replace(/[^A-Za-z]/g, "").length <= 1).length > 1) return false;
    return true;
  };
  for (const m of t.matchAll(/\bbetween\s+([A-Z][A-Za-z.&()' -]{4,60}?)\s+(?:and|AND)\s+([A-Z][A-Za-z.&()' -]{4,60}?)[\s,.]/g)) {
    for (const cand of [m[1], m[2]]) if (looksLikeName(cand)) out.parties.push(cand.trim());
    if (out.parties.length >= 6) break;
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

/* ------------------------------------------------------- the per-file facts */

let PROBE_BY_FILE = null;
function probeIndex() {
  load();
  if (PROBE_BY_FILE) return PROBE_BY_FILE;
  PROBE_BY_FILE = new Map();
  for (const [word, v] of Object.entries((PROBE && PROBE.type) || {})) {
    // A saturated probe matched a thousand files across all of Drive. It tells
    // us nothing about any one of them.
    if (v.saturated) continue;
    for (const id of v.ids || []) {
      if (!PROBE_BY_FILE.has(id)) PROBE_BY_FILE.set(id, []);
      PROBE_BY_FILE.get(id).push({ word, type: v.type, w: v.w });
    }
  }
  return PROBE_BY_FILE;
}

function factsFor(fileId) {
  load();
  const m = MANI[fileId];
  const text = textOf(fileId);

  if (text && text.length >= 200) {
    const types = [];
    for (const [type, rules] of TEXT_RULES) {
      for (const re of rules) {
        const hit = text.match(re);
        if (hit) { types.push({ type, evidence: hit[0].replace(/\s+/g, " ").slice(0, 60) }); break; }
      }
    }
    return {
      read: "TEXT_EXTRACTED",
      method: (m && m.method) || "pdftotext",
      chars: text.length,
      type: types.length ? types[0].type : null,
      alsoLooksLike: types.slice(1, 4).map((x) => x.type),
      evidence: types.slice(0, 4).map((x) => x.type + ": " + JSON.stringify(x.evidence)),
      facts: harvest(text),
    };
  }

  const hits = probeIndex().get(fileId) || [];
  if (hits.length) {
    const score = new Map();
    for (const h of hits) score.set(h.type, (score.get(h.type) || 0) + h.w);
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
    return {
      read: "SCAN_READ_VIA_INDEX",
      method: "drive-fulltext-ocr",
      chars: 0,
      type: ranked[0][0],
      alsoLooksLike: ranked.slice(1, 3).map((x) => x[0]),
      // Naming the words is the whole point: this is a weaker claim than the
      // branch above and the reader must be able to see why.
      evidence: ["words found in the scan: " + hits.map((h) => h.word).join(", ")],
      facts: { dates: [], amounts: [], refs: [], parties: [] },
    };
  }

  return {
    read: "NOT_READ",
    method: (m && m.method) || "never-attempted",
    chars: 0, type: null, alsoLooksLike: [],
    evidence: [m && m.method === "SCAN_NO_TEXT_LAYER"
      ? "scanned, and no content probe matched it"
      : "not readable on this machine (" + ((m && m.method) || "not attempted") + ")"],
    facts: { dates: [], amounts: [], refs: [], parties: [] },
  };
}

/* The module a document's content points at. SORTING ONLY — see the security
   note at the top of this file. */
const TYPE_MODULE = {
  LITIGATION: "litigation", NOTICE: "litigation",
  LEASE: "compliance", SERVICE: "compliance", LOAN: "compliance",
  RESOLUTION: "compliance", SECP_FILING: "compliance", STATUTORY_REGISTER: "compliance",
  SHARE_CERTIFICATE: "compliance", INCORPORATION: "compliance",
  SECP_CERTIFIED_EXTRACT: "compliance", AUDITOR_CONSENT: "compliance", FINANCIAL_STATEMENTS: "compliance",
  TAX_CERTIFICATE: "compliance", BANK_MANDATE: "compliance",
  LAND_RECORD: "commercial", APPROVAL: "commercial", AGREEMENT: "commercial",
  NDA: "commercial", POA: "commercial", AFFIDAVIT: null, DISPUTE_CLAUSE: null, INSURANCE: null,
};
const contentModule = (type) => TYPE_MODULE[type] || null;

function summary() {
  load();
  const byRead = {}, byType = {};
  const ids = new Set([...Object.keys(MANI), ...probeIndex().keys()]);
  for (const id of ids) {
    const f = factsFor(id);
    byRead[f.read] = (byRead[f.read] || 0) + 1;
    if (f.type) byType[f.type] = (byType[f.type] || 0) + 1;
  }
  return { files: ids.size, byRead, byType, builtAt: (PROBE && PROBE.builtAt) || 0 };
}

const wasRead = (fileId) => factsFor(fileId).read !== "NOT_READ";

module.exports = { load, textOf, factsFor, summary, contentModule, wasRead, TYPE_MODULE };
