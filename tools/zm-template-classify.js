#!/usr/bin/env node
/* IS IT A TEMPLATE, OR A CONTRACT SOMEONE FILED IN THE TEMPLATE DRAWER?
 *
 * 413 files sit under "Zameen - Pakistan Contract Templates". The folder name is
 * not evidence: the earlier Commercial pass already found executed, signed
 * agreements stored there — a Google advertising agreement stamped by Google's
 * legal department, two executed HBFC digital marketing instruments, a ready-mix
 * supply contract under company seals.
 *
 * So each file is read and judged on what it actually says. The signals are
 * deliberately blunt and countable, because the expensive judgement should be
 * spent on the genuinely ambiguous few rather than on the 300 that announce
 * themselves.
 *
 * WHAT MAKES A TEMPLATE
 *   placeholder tokens — [●], [•], ____, XXXX, "[DATE]", "[NAME]"
 *   an execution block whose name, CNIC and date lines are empty
 *   no counterparty anywhere in the body
 *
 * WHAT MAKES AN INSTRUMENT
 *   a named counterparty in the opening recital
 *   a real execution date rather than "___ day of ____ 20__"
 *   a stamp serial, a registration number, an e-stamp id
 *
 * Where the two disagree, or neither fires, the file is left UNRESOLVED for a
 * person to read rather than guessed at — which is the whole point of having the
 * category.
 *
 * Text only, and only enough of it: the first and last few thousand characters
 * decide all three questions. No document body is written to the artefact.
 *
 *   node tools/zm-template-classify.js [--limit N]
 */
const fs = require("fs"), P = require("path"), cp = require("child_process");
const drive = require("../api/drive.js");
const { driveRaw } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const T_ROOT = "Commercial_Zameen Media Contracts / Zameen - Pakistan Contract Templates";
const OUT = P.join(ROOT, "audit", "zm-template-library.json");
const TMP = "/tmp/claude-1010/-var-www-zameen-bse-reports/34a1514a-aa3b-4767-a703-cee43a2b5c1d/scratchpad/tmpl";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(id, attempt = 0) {
  const res = await driveRaw("/files/" + id + "?alt=media&supportsAllDrives=true");
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    if (attempt >= 4) return null;
    await sleep(1000 * Math.pow(2, attempt));
    return fetchBytes(id, attempt + 1);
  }
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function extract(name, buf, dir) {
  const ext = (name.match(/\.[a-z0-9]{2,5}$/i) || [""])[0].toLowerCase();
  const tmp = P.join(dir, "f" + ext);
  fs.writeFileSync(tmp, buf);
  try {
    if (ext === ".docx" || ext === ".odt") {
      const mammoth = require("mammoth");
      const r = await mammoth.extractRawText({ path: tmp });
      return { text: (r && r.value) || "", how: "mammoth" };
    }
    if (ext === ".doc") {
      const WordExtractor = require("word-extractor");
      const d = await new WordExtractor().extract(tmp);
      return { text: (d && d.getBody()) || "", how: "word-extractor" };
    }
    if (ext === ".pdf") {
      const out = cp.execSync("pdftotext -layout " + JSON.stringify(tmp) + " - 2>/dev/null || true",
        { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
      return { text: out || "", how: "pdftotext" };
    }
    return { text: "", how: "no-text-route" };
  } catch (e) {
    return { text: "", how: "extract-failed", error: String(e.message || e).slice(0, 120) };
  } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

/* Countable signals. Each returns how many times it fired, so a classification
   can be explained by the numbers behind it rather than asserted. */
function signals(text, file) {
  const t = text || "";
  const head = t.slice(0, 6000), tail = t.slice(-6000);
  const count = (re) => (t.match(re) || []).length;
  return {
    chars: t.length,
    placeholders: count(/\[●\]|\[•\]|\[\s*(date|name|month|year|amount|party|insert)[^\]]{0,20}\]/gi),
    blankRules: count(/_{5,}/g),
    blankDayForm: count(/on this\s*_+\s*day of|day of\s*_+\s*,?\s*20\s*_+/gi),
    xPlaceholder: count(/\bXXXX+\b|\bTBD\b|\bTBC\b/g),
    witnessBlank: count(/CNIC\s*\/?\s*(NICOP)?\s*:?\s*_{3,}|Name\s*:?\s*_{3,}/gi),
    eStamp: count(/e-?stamp|PB-[A-Z]{3}-[0-9A-F]{8,}|stamp\s*(paper|serial)/gi),
    registration: count(/registration no|registry no|reg\s*#|document no\.?\s*\d{3}-\d{4}/gi),
    realDate: count(/\b(on|dated|entered into)\b[^.\n]{0,40}\b\d{1,2}(st|nd|rd|th)?\s+(day of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(19|20)\d{2}/gi),
    signedWords: count(/IN WITNESS WHEREOF|SIGNED\s+(and|by)|duly executed/gi),
    clauseList: count(/^\s*\d+\.\s+[A-Z][A-Za-z ]{4,40}$/gm),
    isWipFolder: /work in progress|\[wip\]/i.test(file.path || ""),
    isClauseFile: /standard clauses/i.test(file.name || ""),
    isPolicyFile: /privacy policy|terms of use|terms and conditions/i.test(file.name || ""),
    isNocFile: /^NOC\b/i.test(file.name || ""),
  };
}

function classify(s, file) {
  if (!s.chars) return { klass: "UNRESOLVED_AFTER_FULL_ANALYSIS", why: "no text could be extracted" };
  if (s.isClauseFile && s.clauseList >= 5) {
    return { klass: "STANDARD_CLAUSE_LIBRARY", why: "a numbered list of " + s.clauseList + " clause headings, not an agreement between parties" };
  }
  const templateish = s.placeholders + s.blankRules + s.blankDayForm + s.xPlaceholder + s.witnessBlank;
  const instrumentish = s.eStamp + s.registration + s.realDate;

  /* A real execution date AND a stamp or registration, with no blanks to speak
     of, is an instrument wherever it is filed.

     The conjunction has to be spelled out. Summing the three signals and asking
     for two let a document with NO stamp and NO registration qualify on a date
     matched twice -- and the message then announced "a registration number"
     that was not there, because it inferred the reason from `eStamp` being
     falsy rather than from what actually fired. The one document this caught,
     an undertaking on the Medallion account, had been read page by page and
     recorded as unexecuted with a blank signature line. */
  const sealed = s.eStamp + s.registration;
  if (sealed >= 1 && s.realDate >= 1 && templateish <= 2) {
    return { klass: "EXECUTED_OPERATIONAL_DOCUMENT",
      why: "carries a real execution date and " + (s.eStamp ? "a stamp reference" : "a registration number") + " with no placeholder fields" };
  }
  if (instrumentish >= 1 && s.realDate >= 1 && templateish <= 8) {
    return { klass: "EXECUTED_PRECEDENT_SAMPLE", why: "a completed, dated example retained as a precedent" };
  }
  if (s.isWipFolder && templateish > 0) {
    return { klass: "WORK_IN_PROGRESS_TEMPLATE", why: "unfinished draft in a folder marked work in progress" };
  }
  if (s.isPolicyFile) {
    return { klass: "REFERENCE_DOCUMENT", why: "a published policy or terms document rather than an agreement between two parties" };
  }
  if (templateish >= 3) {
    return { klass: /\bdraft\b/i.test(file.name || "") ? "DRAFT_TEMPLATE" : "APPROVED_TEMPLATE",
      why: templateish + " placeholder or blank-field markers and no execution evidence" };
  }
  if (s.isNocFile) return { klass: "APPROVED_TEMPLATE", why: "an NOC pro-forma" };
  if (templateish >= 1) {
    return { klass: "DRAFT_TEMPLATE", why: "some blank fields, but too few markers to call it a finished template" };
  }
  return { klass: "UNRESOLVED_AFTER_FULL_ANALYSIS", why: "neither placeholders nor execution evidence — needs a person to read it" };
}

(async () => {
  await drive.ensureIndex();
  fs.mkdirSync(TMP, { recursive: true });
  const inv = JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "zm-contracts-root-inventory.json"), "utf8"));
  let files = inv.files.filter((f) => f.path.startsWith(T_ROOT + " / "))
    .filter((f) => !/^~\$/.test(f.name) && !/\.tmp$/i.test(f.name));
  const limit = parseInt(arg("--limit", "0"), 10);
  if (limit) files = files.slice(0, limit);

  const vision = (() => { try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "commercial-vision.json"), "utf8")); } catch (e) { return {}; } })();

  const rows = [];
  let n = 0;
  for (const f of files) {
    n++;
    if (n % 40 === 0) console.error("  " + n + "/" + files.length);
    const buf = await fetchBytes(f.id);
    let text = "", how = "fetch-failed";
    if (buf) { const r = await extract(f.name, buf, TMP); text = r.text; how = r.how; }
    const s = signals(text, f);
    let c = classify(s, f);

    /* A document already READ page by page in the earlier pass outranks any
       signal count: if someone looked at the signature block, that is better
       evidence than counting underscores. */
    const v = vision[f.id];
    if (v && v.facts && v.facts.executed === true) {
      c = { klass: "EXECUTED_OPERATIONAL_DOCUMENT", why: "read page by page and seen executed: " + String(v.facts.executionEvidence || "").slice(0, 140) };
    } else if (v && v.facts && v.facts.executed === false) {
      /* Reading outranks counting in BOTH directions. This clause used to carry
         `&& !/EXECUTED/.test(c.klass)`, which meant a signal-counted EXECUTED
         verdict could never be overturned by someone having looked at the
         signature block and found it blank -- precisely the case where the
         count is wrong and the reading is right. Four agreements were filed as
         executed on that basis, each with an empty execution block. */
      const dated = /\b(execution version|final)\b/i.test(f.name || "");
      c = /EXECUTED/.test(c.klass)
        ? { klass: "DRAFT_TEMPLATE",
            why: "a complete, party-specific agreement whose execution block was read and found blank"
              + (dated ? " despite the filename" : "") + ": " + String(v.facts.executionEvidence || "").slice(0, 120) }
        : (c.klass === "UNRESOLVED_AFTER_FULL_ANALYSIS"
            ? { klass: "APPROVED_TEMPLATE", why: "read page by page and seen unexecuted: " + String(v.facts.executionEvidence || "").slice(0, 120) }
            : c);
    }

    const segs = f.path.split(" / ");
    rows.push({
      fileId: f.id, name: f.name, path: f.path,
      category: segs[2] || "(directly under Templates)",
      subPath: segs.slice(3, -1).join(" / "),
      mimeType: f.mimeType, size: f.size, modifiedTime: f.modifiedTime,
      extractedBy: how, textChars: s.chars,
      classification: c.klass, basis: c.why,
      signals: s,
      readVisually: !!v,
    });
  }

  const byClass = rows.reduce((m, r) => (m[r.classification] = (m[r.classification] || 0) + 1, m), {});
  const byCategory = {};
  for (const r of rows) {
    byCategory[r.category] = byCategory[r.category] || { files: 0, classes: {} };
    byCategory[r.category].files++;
    byCategory[r.category].classes[r.classification] = (byCategory[r.category].classes[r.classification] || 0) + 1;
  }
  const summary = {
    templateFiles: rows.length,
    byClassification: byClass,
    operationalDocsFoundInTemplateSource: rows.filter((r) => r.classification === "EXECUTED_OPERATIONAL_DOCUMENT").length,
    unresolved: rows.filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS").length,
    noTextExtracted: rows.filter((r) => !r.textChars).length,
    categories: Object.keys(byCategory).length,
  };
  fs.writeFileSync(OUT, JSON.stringify({ summary, byCategory, templates: rows }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
})();
