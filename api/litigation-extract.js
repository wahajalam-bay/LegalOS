// READ THE COURT DOCUMENT SO LEGAL DOES NOT HAVE TO RETYPE IT.
//
// A plaint, petition, summons or order already states the case number, the
// court, the parties and the dates. Asking a lawyer to read those off the page
// and type them into a form is the manual work this is meant to remove.
//
// THREE RULES
//   1. NEVER FABRICATE. Every field returned was matched in the document text.
//      A field that could not be found is absent, not guessed — "not found" is
//      a useful answer and a plausible invention is not.
//   2. EVERY FIELD CARRIES ITS EVIDENCE: the value, the document it came from,
//      the snippet it was read out of, and a confidence. A prefilled field a
//      lawyer cannot check is worse than an empty one, because they will trust
//      it without looking.
//   3. CONFIDENCE DECIDES WHAT HAPPENS ON SCREEN, not what is stored. High
//      confidence may prefill; anything lower is offered as a suggestion the
//      lawyer accepts or rejects. Nothing here commits a value on its own.
//
// Extraction is deterministic and local. It runs on text pulled out by the same
// parsers the register depends on, so nothing is transmitted anywhere and the
// result is the same every time it runs. There is no model in this file.
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const HIGH = "high", REVIEW = "needs review";

/* ------------------------------------------------------------- text ------ */

/* Pull text out of whatever was uploaded. The parsers are the ones the parser
   gate already guarantees are present, so a missing one is a build failure
   rather than a silent empty extraction. */
function textFrom(filePath, name) {
  const ext = String(name || filePath).toLowerCase().match(/\.[a-z0-9]{2,5}$/);
  const e = ext ? ext[0] : "";
  try {
    if (e === ".pdf") {
      return cp.execSync("pdftotext -layout " + JSON.stringify(filePath) + " - 2>/dev/null || true",
        { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 }) || "";
    }
    if (e === ".docx") {
      const mammoth = require("mammoth");
      return ""; // handled by the async path below
    }
    if (e === ".txt") return fs.readFileSync(filePath, "utf8");
  } catch (err) { return ""; }
  return "";
}

async function textFromAsync(filePath, name) {
  const e = (String(name || filePath).toLowerCase().match(/\.[a-z0-9]{2,5}$/) || [""])[0];
  if (e === ".docx") {
    try {
      const mammoth = require("mammoth");
      const r = await mammoth.extractRawText({ path: filePath });
      return (r && r.value) || "";
    } catch (err) { return ""; }
  }
  if (e === ".doc") {
    try {
      const WordExtractor = require("word-extractor");
      const d = await new WordExtractor().extract(filePath);
      return (d && d.getBody()) || "";
    } catch (err) { return ""; }
  }
  return textFrom(filePath, name);
}

/* ------------------------------------------------------- field finding --- */

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* A match plus the words around it, so the screen can show WHERE a value came
   from. A value with no context cannot be checked at a glance. */
function evidence(text, index, len) {
  const from = Math.max(0, index - 60);
  const to = Math.min(text.length, index + len + 60);
  return squash(text.slice(from, to)).slice(0, 220);
}

function firstMatch(text, patterns) {
  for (const { re, conf, pick } of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const value = squash(pick ? pick(m) : m[1]);
    if (!value) continue;
    return { value, confidence: conf, snippet: evidence(text, m.index, m[0].length) };
  }
  return null;
}

/* Pakistani court references take several shapes: "C.S. No. 245/2026",
   "Suit No. 1123 of 2024", "W.P. 8890/2025", "F.I.R. No. 221/2023". Each is
   matched explicitly rather than by one loose pattern, because a loose pattern
   over a legal document finds section numbers and clause references. */
const CASE_NUMBER = [
  { re: /\b((?:C\.?\s?S|C\.?\s?M|W\.?\s?P|C\.?\s?P|R\.?\s?F\.?\s?A|F\.?\s?A\.?\s?O|I\.?\s?C\.?\s?A|Crl\.?\s?[A-Z]*)\.?\s*(?:No\.?\s*)?\d+[\/-]\s*(?:of\s*)?\d{2,4})/i, conf: HIGH },
  { re: /\b(?:Suit|Petition|Appeal|Application|Complaint)\s+No\.?\s*([0-9]+\s*(?:\/|of)\s*[0-9]{2,4})/i, conf: HIGH },
  { re: /\bCase\s+(?:No\.?|Number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\. ]{2,28})/i, conf: REVIEW },
];

const FIR_NUMBER = [
  { re: /\bF\.?\s?I\.?\s?R\.?\s*(?:No\.?)?\s*[:\-]?\s*([0-9]+\s*(?:\/|of)\s*[0-9]{2,4})/i, conf: HIGH },
];

/* Courts are named, not inferred. The list is the set of forum words that
   actually appear in Pakistani pleadings; anything else is left for the lawyer
   rather than approximated. */
const COURT = [
  { re: /\b((?:Honou?rable\s+)?(?:Supreme Court of Pakistan|Federal Shariat Court))/i, conf: HIGH },
  { re: /\b((?:Lahore|Islamabad|Sindh|Peshawar|Balochistan)\s+High\s+Court(?:\s+(?:of\s+)?[A-Z][a-z]+)?)/i, conf: HIGH },
  { re: /\b((?:Senior\s+)?Civil\s+(?:Judge|Court)[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
  { re: /\b(Additional\s+District\s+(?:and\s+Sessions\s+)?Judge[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
  { re: /\b(District\s+(?:and\s+Sessions\s+)?(?:Judge|Court)[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
  { re: /\b(Banking\s+Court(?:\s+No\.?\s*\d+)?[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
  { re: /\b(Consumer\s+(?:Protection\s+)?Court[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
  { re: /\b(Labour\s+(?:Court|Appellate Tribunal)[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
  { re: /\b(NIRC|National Industrial Relations Commission)\b/i, conf: REVIEW },
  { re: /\b(Rent\s+(?:Controller|Tribunal)[,\s]*(?:[A-Z][a-z]+)?)/i, conf: REVIEW },
];

const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
  "Peshawar", "Quetta", "Gujranwala", "Sialkot", "Hyderabad", "Bahawalpur", "Sargodha", "Sahiwal"];

/* Parties. Pleadings set them out either side of "VERSUS", which is a far
   safer signal than trying to name-match against a registry.
   The naive version of this read the line immediately before VERSUS and got
   "Plaintiff" -- because that line is the dotted role marker
   ("...........Plaintiff"), not the party. So each side is taken as a BLOCK and
   the role markers, dot leaders and address tails are stripped before the name
   is chosen. */
const ROLE_WORD = /^(?:the\s+)?(?:plaintiffs?|defendants?|petitioners?|respondents?|appellants?|complainants?|accused|applicants?)\.?$/i;

function cleanPartyLine(line) {
  return squash(line)
    .replace(/[\.\u2026]{2,}\s*(?:plaintiffs?|defendants?|petitioners?|respondents?|appellants?|complainants?|accused|applicants?)\s*\.?$/i, "")
    .replace(/[\.\u2026]{3,}.*$/, "")
    .replace(/\s*\((?:plaintiffs?|defendants?|petitioners?|respondents?|appellants?|complainants?)\)\s*$/i, "")
    .replace(/^(?:in the matter of|and)\s+/i, "")
    .replace(/[,\s]+$/, "")
    .trim();
}

/* A party name, not the street it trades from. Pleadings run
   "ZETA HOLDINGS (PRIVATE) LIMITED, having its office at ..." on one line, and
   the address is noise on a register row. */
const CORP_SUFFIX = /^(.*?\b(?:\(\s*(?:private|pvt|smc[- ]private)\s*\)\s*(?:limited|ltd)|private\s+limited|pvt\.?\s*ltd|limited|ltd|llc|llp|inc|corporation|& co\.?|and co\.?))\b/i;
const ADDRESS_WORD = /\b(?:road|street|avenue|plaza|floor|plot|block|house|office|tower|colony|town|gulberg|dha|phase|sector|market|mall|chowk|bazaar|scheme)\b/i;

/* A party name, not the street it trades from. Pleadings run
   "ZETA HOLDINGS (PRIVATE) LIMITED, having its office at ..." or just append
   the address after a comma, and an address on a register row is noise.
   Cut at the corporate suffix where there is one -- that is exact. Only fall
   back to cutting at an address-looking clause when there is not. The full
   original wording survives in the snippet either way, so nothing is lost. */
function trimAddress(name) {
  let v = squash(name)
    .replace(/,?\s*(?:having|with)\s+its\s+(?:registered\s+)?(?:office|address)\b.*$/i, "")
    .replace(/,?\s*(?:resident|residing)\s+(?:of|at)\b.*$/i, "")
    .replace(/,?\s*(?:through|rep(?:resented)?\s+by)\b.*$/i, "")
    .replace(/[,\s]+$/, "")
    .trim();
  const corp = CORP_SUFFIX.exec(v);
  if (corp) return corp[1].trim();
  const comma = v.indexOf(",");
  if (comma > 2 && ADDRESS_WORD.test(v.slice(comma))) return v.slice(0, comma).trim();
  return v;
}

function pickName(block, takeLast) {
  const lines = String(block).split(/\n/).map(cleanPartyLine)
    .filter((l) => l && l.length > 3 && !ROLE_WORD.test(l) && /[A-Za-z]{3}/.test(l));
  if (!lines.length) return "";
  /* Before VERSUS the party is the LAST real line; after it, the FIRST. */
  const line = takeLast ? lines[lines.length - 1] : lines[0];
  return trimAddress(line).slice(0, 200);
}

function parties(text) {
  const out = [];
  const m = /\b(?:VERSUS|VS\.?|V\/S)\b/i.exec(text);
  if (!m) return out;
  const before = text.slice(Math.max(0, m.index - 600), m.index);
  const after = text.slice(m.index + m[0].length, m.index + m[0].length + 600);
  const a = pickName(before, true);
  const b = pickName(after, false);

  /* Which side is which depends on the instrument: a writ has a petitioner and
     a respondent, a suit a plaintiff and a defendant. The document says which
     it is, so read that rather than defaulting. */
  const head = text.slice(0, 2500);
  const isWrit = /writ\s+petition|constitutional\s+petition|\bW\.?\s?P\b/i.test(text);
  const isAppeal = /\bappeal\b/i.test(text.slice(0, 1500));
  const isCriminal = /\bF\.?\s?I\.?\s?R\b|\baccused\b/i.test(head);
  const left = isWrit ? "Petitioner" : isAppeal ? "Appellant" : isCriminal ? "Complainant" : "Plaintiff";
  const right = isWrit ? "Respondent" : isAppeal ? "Respondent" : isCriminal ? "Accused" : "Defendant";
  const snip = evidence(text, m.index, m[0].length);
  if (a) out.push({ name: a, role: left, confidence: HIGH, snippet: snip });
  if (b) out.push({ name: b, role: right, confidence: HIGH, snippet: snip });
  return out;
}

/* Dates. Only dates that are LABELLED are taken: an unlabelled date in a
   pleading is as likely to be the date of an agreement being sued upon as the
   filing date, and guessing between them puts a wrong date on the record. */
const DATE_RE = "(\\d{1,2}[\\-/\\.\\s](?:\\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)[\\-/\\.\\s]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})";
const labelledDate = (labels, conf) => ({
  re: new RegExp("\\b(?:" + labels + ")\\b[^\\n]{0,40}?" + DATE_RE, "i"),
  conf, pick: (m) => m[1],
});

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/* DAY FIRST, AND BUILT IN UTC.
   Two ways this went wrong before, both of which put a wrong date on a live
   litigation record:
     - `new Date("04/02/2024")` is 2 APRIL in JavaScript. Pakistani filings are
       dd/mm/yyyy, so that is 4 February, and a hearing lands two months out.
     - constructing in local time and then calling toISOString shifts the date
       back a day on any negative-offset host, so 19-11-2026 was stored as the
       18th.
   The numeric form is therefore parsed explicitly, day first, and assembled
   with Date.UTC. Only an unambiguous month NAME is allowed to bypass that. */
function toIso(v) {
  const s = squash(v);
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;

  const named = s.match(/^(\d{1,2})[\-\/\.\s]([A-Za-z]{3,9})[\-\/\.\s](\d{2,4})$/);
  if (named) {
    const mm = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (mm) return build(named[1], mm, named[3]);
  }
  const numeric = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})$/);
  if (numeric) {
    const dd = Number(numeric[1]), mm = Number(numeric[2]);
    /* If the first number cannot be a day, the document is written month-first
       and we read it that way rather than producing an impossible date. */
    if (dd > 12 && mm <= 12) return build(dd, mm, numeric[3]);
    if (mm > 12 && dd <= 12) return build(mm, dd, numeric[3]);
    return build(dd, mm, numeric[3]);
  }
  return "";

  function build(d, m, y) {
    let yy = String(y);
    if (yy.length === 2) yy = (Number(yy) > 70 ? "19" : "20") + yy;
    const dt = new Date(Date.UTC(Number(yy), Number(m) - 1, Number(d)));
    if (isNaN(dt)) return "";
    /* Reject a rolled-over date (31 February becoming 3 March) instead of
       storing the rollover. */
    if (dt.getUTCDate() !== Number(d) || dt.getUTCMonth() !== Number(m) - 1) return "";
    return dt.toISOString().slice(0, 10);
  }
}

const CLAIM = [
  { re: /\b(?:claim(?:ed)?|suit|decree|recovery)\s+(?:amount|for|of)\s*(?:Rs\.?|PKR)?\s*([0-9][0-9,]{3,})/i, conf: REVIEW },
  { re: /\b(?:Rs\.?|PKR)\s*([0-9][0-9,]{5,})(?:\/-)?/i, conf: REVIEW },
];

/* What kind of instrument this is. Drives the case type and the workflow the
   case starts in, so it is matched on the document's own self-description. */
function documentKind(text) {
  const head = text.slice(0, 3000);
  const tests = [
    [/\bplaint\b/i, "Plaint"],
    [/\bsuit\s+for\b|\bsuit\s+no\b/i, "Plaint"],
    [/writ\s+petition|constitutional\s+petition/i, "Writ Petition"],
    [/\bsummons?\b/i, "Summons"],
    [/\bF\.?\s?I\.?\s?R\b/i, "FIR"],
    [/written\s+statement/i, "Written Statement"],
    [/\border\s+sheet\b|\border\b\s*$/im, "Court Order"],
    [/legal\s+notice/i, "Legal Notice"],
    [/\bappeal\b/i, "Appeal"],
    [/\bpetition\b/i, "Petition"],
    [/\bcomplaint\b/i, "Complaint"],
    [/\bapplication\b/i, "Application"],
  ];
  for (const [re, kind] of tests) if (re.test(head)) return kind;
  return "";
}

/* The case type taxonomy, mapped from what the document says. Suggestion only:
   the subject matter of a dispute is a legal characterisation and the lawyer
   confirms it. */
function suggestCaseType(text) {
  const t = text.slice(0, 6000).toLowerCase();
  if (/trademark|copyright|patent|infring|passing off/.test(t)) return "Intellectual Property";
  if (/f\.?i\.?r|bail|accused|criminal/.test(t)) return "Criminal";
  if (/non.?compete|employment|termination|wrongful dismissal|labour/.test(t)) return "Employment / Labour";
  if (/recovery of|decree for recovery|outstanding amount/.test(t)) return "Recovery";
  if (/possession|allotment|plot|booking|handover|developer/.test(t)) return "Property / Possession";
  if (/breach of contract|agreement dated|specific performance/.test(t)) return "Contractual";
  if (/consumer/.test(t)) return "Regulatory";
  return "";
}

/* ------------------------------------------------------------ extract ---- */

/**
 * Read a document and report what it actually says.
 * Returns { ok, documentKind, fields, parties, textChars, warnings }.
 * `fields` is { key: { value, confidence, snippet, source } } and a key is
 * ABSENT when the document does not state it.
 */
async function extractFromFile(filePath, name) {
  const text = await textFromAsync(filePath, name);
  return extractFromText(text, name);
}

function extractFromText(text, sourceName) {
  const warnings = [];
  if (!text || text.trim().length < 40) {
    /* A scan with no text layer is the common case in this estate. Saying so is
       the honest result: it tells the lawyer to type the fields rather than
       leaving them wondering why nothing was found. */
    return {
      ok: true, textChars: (text || "").length, documentKind: "", fields: {}, parties: [],
      warnings: ["No readable text in this document — it is most likely a scan. Nothing could be extracted; the fields are left for you to enter."],
    };
  }

  const fields = {};
  const put = (key, hit) => { if (hit && hit.value) fields[key] = Object.assign({ source: sourceName || "" }, hit); };

  put("caseNumber", firstMatch(text, CASE_NUMBER));
  put("firNumber", firstMatch(text, FIR_NUMBER));
  put("court", firstMatch(text, COURT));

  const cityHit = CITIES.map((c) => {
    const i = text.search(new RegExp("\\b" + c + "\\b", "i"));
    return i >= 0 ? { city: c, i } : null;
  }).filter(Boolean).sort((a, b) => a.i - b.i)[0];
  if (cityHit) fields.city = { value: cityHit.city, confidence: REVIEW, snippet: evidence(text, cityHit.i, cityHit.city.length), source: sourceName || "" };

  for (const [key, labels] of [
    ["filingDate", "instituted on|date of institution|filed on|filing date|date of filing"],
    ["nextHearing", "next date|next hearing|date of hearing|adjourned to|fixed for"],
    /* NOT a bare "dated": pleadings say "agreement dated 12-03-2023" far more
       often than they date an order, and reading that as the order date puts
       the contract's date on the case. */
    ["orderDate", "date of order|order dated|order is dated"],
    ["noticeDate", "notice dated|date of notice"],
    ["incidentDate", "date of occurrence|date of incident"],
  ]) {
    const hit = firstMatch(text, [labelledDate(labels, REVIEW)]);
    if (hit) {
      const iso = toIso(hit.value);
      if (iso) fields[key] = { value: iso, raw: hit.value, confidence: hit.confidence, snippet: hit.snippet, source: sourceName || "" };
    }
  }

  const claim = firstMatch(text, CLAIM);
  if (claim) {
    const n = Number(String(claim.value).replace(/,/g, ""));
    if (!isNaN(n) && n > 0) fields.claimAmount = { value: n, confidence: claim.confidence, snippet: claim.snippet, source: sourceName || "" };
  }

  const ps = parties(text);
  if (!ps.length) warnings.push("The parties could not be read — no “versus” line was found.");

  const kind = documentKind(text);
  const type = suggestCaseType(text);
  if (type) fields.caseType = { value: type, confidence: REVIEW, snippet: "", source: sourceName || "", suggestedOnly: true };

  /* A case title, built from the parties rather than invented. Only offered
     when both sides were read. */
  if (ps.length === 2) {
    fields.caseTitle = {
      value: (ps[0].name + " vs " + ps[1].name).slice(0, 200),
      confidence: REVIEW, snippet: ps[0].snippet, source: sourceName || "",
    };
  }

  return { ok: true, textChars: text.length, documentKind: kind, fields, parties: ps, warnings };
}

module.exports = { extractFromFile, extractFromText, textFromAsync, HIGH, REVIEW };
