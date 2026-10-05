// Drive-driven source discovery for Compliance.
//
// The spreadsheets are not the only source. A fresh crawl of the Drive estate
// (3,476 files / 849 folders, all four shared roots, nothing truncated) shows
// that the FOLDERS AND FILENAMES themselves encode history the trackers never
// captured:
//
//   Zameen Group _PK Intercompany Loans /
//     10.Loan Agreement_Zameen Platinum & Zameen Venture One [Rs. 760 mil.]_20190404 /
//        Loan Agreement /      <- the original
//        First Amendment /     <- amendment 1
//        Second Amendment /    <- amendment 2  (increase in loan term)
//        Third Amendment /     <- amendment 3  (loan to equity conversion)
//
//   Zameen Group_Loan Agreements / Zameen Venture One (Private) Limited /
//     1. ZVO - EMPG Projects - Loan AED 3.6mil. [Loan Agreement dated 02.09.2020] /
//        00.1. Loan Agreement [AED 3,600,000]_..._20200902.pdf
//        00.2. 1st Loan Amendment [AED 3,600,000]_..._20211105.pdf
//        03. Registration Request [Loan Amendment]_...pdf
//        03.1. Registration Request [Loan Amendment]_... [RECEIVING].pdf   <- bank receipt
//        01. JS observations 02.10.2020.pdf                                <- authority query
//        02. Response to observations_20201005.pdf
//
// So amendments, rollovers, conversions to equity, novations, terminations, SBP
// registration submissions and authority correspondence all exist as real
// documents, with dates in the filename under a consistent convention.
//
// THE RULE THIS MODULE FOLLOWS: only deterministic evidence. A document becomes
// a dated lifecycle event when its filename says what it is and when; otherwise
// it stays an attached document with no asserted meaning, flagged
// INCOMPLETE_SOURCE. Nothing here infers a term, an amount or a date that the
// source does not literally contain.

const drive = require("./drive");
const entities = require("./entities");

/* ----------------------------------------------------------- date reading */

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const iso = (y, m, d) => y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");

// The group's filing convention is _YYYYMMDD, with "dated DD.MM.YYYY" and
// "DD.MM.YYYY" also in use. Anything else returns null rather than a guess.
function dateFromName(name) {
  const s = String(name || "");
  // NOTE the lookarounds rather than \b: the group's filing convention is
  // "name_20211105.pdf", and \b never matches between "_" and "2" because both
  // are word characters. Using \b here silently failed to date 391 of 464
  // documents and reported them as INCOMPLETE_SOURCE.
  let m = s.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/);
  if (m) return { date: iso(m[1], +m[2], +m[3]), how: "yyyymmdd" };
  m = s.match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[.\-/](0?[1-9]|1[0-2])[.\-/](20\d{2})(?!\d)/);
  if (m) return { date: iso(m[3], +m[2], +m[1]), how: "dd.mm.yyyy" };
  m = s.match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[-\s]([A-Za-z]{3,})[-\s](20\d{2})(?!\d)/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return { date: iso(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()] + 1, +m[1]), how: "dd-mon-yyyy" };
  m = s.match(/\b([A-Za-z]{3,})\s+(20\d{2})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return { date: iso(m[2], MONTHS[m[1].slice(0, 3).toLowerCase()] + 1, 1), how: "month-year", approximate: true };
  return null;
}

const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
function ordinalOf(text) {
  const s = String(text || "");
  let m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (m) return +m[1];
  m = s.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i);
  if (m) return ORDINALS[m[1].toLowerCase()];
  return null;
}

/* ------------------------------------------------------ document classifier */

// Ordered most-specific first: a filename containing both "amendment" and
// "registration request" is a registration request FOR an amendment, and the
// request is what the document IS.
const DOC_RULES = [
  { kind: "sbp_registration", label: "SBP registration request", re: /registration request|request for registration|request for the registration/i },
  { kind: "sbp_prc", label: "Proceeds realisation certificate", re: /\bPRC\b/ },
  { kind: "repayment", label: "Repayment request", re: /repayment|repaid|installments? of the loan/i },
  { kind: "withdrawal", label: "Withdrawal request", re: /withdraw/i },
  { kind: "conversion", label: "Conversion to equity", re: /loan to equity|equity conversion|conversion.{0,20}(equity|shares)|converted to shares/i },
  { kind: "novation", label: "Novation", re: /novat/i },
  { kind: "termination", label: "Termination", re: /terminat/i },
  { kind: "amendment", label: "Amendment", re: /amendment|amended and restated/i },
  { kind: "correspondence", label: "Authority correspondence", re: /observation|response to|query|queries|letter|email dated|reminder/i },
  { kind: "board_approval", label: "Board approval", re: /meeting minutes|minutes of meeting|board resolution|_s BR\b|\bBR -/i },
  { kind: "agreement", label: "Loan agreement", re: /loan agreement|convertible loan|facility agreement/i },
];

// A "[RECEIVING]" copy is the bank's stamped acknowledgement -- evidence the
// submission actually reached the authority, not merely that it was drafted.
const RECEIVING_RE = /\[\s*receiving\s*\]|receiving\b/i;

function classifyDoc(file, folderLeaf) {
  const name = String(file.name || "");
  const hay = name + " " + String(folderLeaf || "");
  for (const r of DOC_RULES) {
    if (r.re.test(name)) {
      return { kind: r.kind, label: r.label, ordinal: ordinalOf(name) || ordinalOf(folderLeaf), acknowledged: RECEIVING_RE.test(name) };
    }
  }
  // Fall back to the containing folder's name -- "First Amendment / <file>.docx".
  for (const r of DOC_RULES) {
    if (r.re.test(String(folderLeaf || ""))) {
      return { kind: r.kind, label: r.label, ordinal: ordinalOf(folderLeaf), acknowledged: RECEIVING_RE.test(name), viaFolder: true };
    }
  }
  return { kind: "supporting", label: "Supporting document", ordinal: null, acknowledged: false };
}

/* ------------------------------------------------- loan folder discovery */

// Every loan folder found in Drive, with the documents beneath it grouped into
// dated lifecycle events. `tracker` links it back to a spreadsheet row where the
// evidence is strong enough; where it is not, the folder is still returned and
// flagged, so nothing sits in Drive unaccounted for.
function loanFolders() {
  const files = drive.indexFiles();
  const out = new Map();

  for (const f of files) {
    const p = String(f.folderPath || "");
    const inFDI = /Zameen Group_Loan Agreements/.test(p);
    const inIC = /Zameen Group _PK Intercompany Loans/.test(p);
    if (!inFDI && !inIC) continue;

    const segs = p.split(" / ");
    // Depth of the loan-folder segment: root / tree / entity / LOAN [/ sub]
    const treeAt = segs.findIndex((s) => /Zameen Group_Loan Agreements|Zameen Group _PK Intercompany Loans/.test(s));
    const loanAt = treeAt + 2;
    if (segs.length <= loanAt) continue;
    const loanFolder = segs.slice(0, loanAt + 1).join(" / ");
    const leaf = segs[loanAt];
    // Spend-contract subtrees that happen to live under the loan root are not loans.
    if (/Spend Contracts|Subsidiaries Contracts|General Agreements|Lease Agreements/i.test(leaf)) continue;

    if (!out.has(loanFolder)) {
      out.set(loanFolder, {
        folderPath: loanFolder,
        name: leaf,
        entityFolder: segs[treeAt + 1] || null,
        /* Same taxonomy as the tracker-backed loans (see LOAN_CATEGORIES in
           compliance-model.js): the FDI folder tree is FDI lending, everything
           else under the loan root is intercompany. A Drive-only loan is
           never classified FCY here — that takes an explicit source marker,
           and a folder name is not one. */
        category: inFDI ? "fdi" : "intercompany",
        meta: parseLoanFolderName(leaf),
        files: [],
      });
    }
    out.get(loanFolder).files.push({
      id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0,
      folderPath: p, leaf: segs[segs.length - 1],
      webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "",
    });
  }

  for (const v of out.values()) v.events = eventsFromFiles(v.files, v.folderPath);
  return [...out.values()];
}

// "10.Loan Agreement_Zameen Platinum & Zameen Venture One [Rs. 760 mil.]_20190404"
// "1. ZVO - EMPG Projects - Loan AED 3.6mil. [Loan Agreement dated 02.09.2020]"
// "3. Zameen Media & Zameen UK_ Loan AED 3.6 m_20200515 [filed with JS] [Loan Repaid]"
function parseLoanFolderName(leaf) {
  const s = String(leaf || "");
  const serial = (s.match(/^\s*(\d{1,2})\s*[.\-]/) || [])[1] || null;
  const date = dateFromName(s);
  const amount = s.match(/\[?\s*(?:Rs\.?|PKR|AED|USD|EUR|GBP)\s*([\d,]+(?:\.\d+)?)\s*(bil|billion|mil|million|m|b|k)?\b/i);
  const ccy = (s.match(/\b(PKR|AED|USD|EUR|GBP)\b/i) || s.match(/\b(Rs)\.?/i) || [])[1];
  // Status markers the folder names carry verbatim.
  const markers = [];
  for (const m of s.matchAll(/\[([^\]]+)\]/g)) markers.push(m[1].trim());
  return {
    serial: serial ? +serial : null,
    date: date ? date.date : null,
    amountText: amount ? amount[0].replace(/^[\[\s]+/, "").trim() : null,
    currency: ccy ? (/^rs$/i.test(ccy) ? "PKR" : ccy.toUpperCase()) : null,
    markers,
    repaid: /\brepaid\b/i.test(s),
    withdrawn: /\bwithdrawn\b/i.test(s),
    filedWith: (s.match(/filed with ([A-Za-z ]+)/i) || [])[1] || null,
    notFiled: /\bnot filed\b/i.test(s),
  };
}

function eventsFromFiles(files, loanFolder) {
  const evs = [];
  for (const f of files) {
    const rel = String(f.folderPath).slice(loanFolder.length).replace(/^ \/ /, "");
    const folderLeaf = rel ? rel.split(" / ")[0] : "";
    const cls = classifyDoc(f, folderLeaf);
    const d = dateFromName(f.name) || (folderLeaf ? dateFromName(folderLeaf) : null);
    evs.push({
      kind: cls.kind,
      label: cls.label + (cls.ordinal ? " " + cls.ordinal : ""),
      ordinal: cls.ordinal,
      acknowledged: cls.acknowledged,
      date: d ? d.date : null,
      dateSource: d ? d.how : null,
      approximate: !!(d && d.approximate),
      // A document we can name but not date is preserved and flagged, never
      // dropped and never given an invented date (PART 22).
      quality: d ? "COMPLETE" : "INCOMPLETE_SOURCE",
      incomplete: d ? null : ["date"],
      subFolder: folderLeaf || null,
      file: { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, folderPath: f.folderPath, webViewLink: f.webViewLink, modifiedTime: f.modifiedTime },
      origin: "drive",
    });
  }
  return evs.sort((a, b) =>
    String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
    (a.ordinal || 99) - (b.ordinal || 99) ||
    String(a.file.name).localeCompare(String(b.file.name)));
}

/* --------------------------------------------------- loan folder matching */

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// Folder names use the group's in-house abbreviations ("ZVO - EMPG Projects",
// "DK & OLX PK"), while the trackers spell companies out. Each pair below is
// evidenced by the same company appearing under BOTH spellings elsewhere in the
// estate, so expanding them recovers real matches rather than inventing them.
// Anything not on this list is not expanded.
const ALIASES = [
  [/\bzvo\b/i, "zameen venture one"],
  [/\bzmpl\b/i, "zameen media"],
  [/\bzdpl\b/i, "zameen developments"],
  [/\bzd\b/i, "zameen developments"],
  [/\bzp\b/i, "zameen platinum"],
  [/\bdk pk\b/i, "daftarkhwan"],
  [/\bdk adgm\b/i, "daftarkhwan holdings"],
  [/\bdk\b/i, "daftarkhwan"],
  [/\bolx pk\b/i, "online classifieds pakistan"],
  [/\bolx\b/i, "online classifieds pakistan"],
  [/\bdg holdings\b/i, "dubbizle group holdings"],
];

// The searchable haystack for a folder: its own name plus the entity folder it
// sits in, with abbreviations expanded alongside (never instead of) the original.
function folderHaystack(fo) {
  let s = String(fo.name || "") + " " + String(fo.entityFolder || "");
  for (const [re, full] of ALIASES) if (re.test(s)) s += " " + full;
  return norm(s);
}

// Link a tracker row to its Drive folder. Matching is deterministic and
// conservative: the folder must agree with the row on BOTH parties, or on one
// party plus the agreement date. A single weak signal is not enough, because a
// wrong link here would attach one loan's amendments to another.
function matchFolderToLoan(loan, folders) {
  const bKey = entities.entityKey(loan.borrower);
  const lKey = entities.entityKey(loan.lender);
  const scored = [];

  for (const fo of folders) {
    if (fo.category !== loan.category) continue;
    const hay = folderHaystack(fo);
    let score = 0;
    const why = [];

    const hasB = bKey && hay.includes(norm(bKey));
    const hasL = lKey && hay.includes(norm(lKey));
    if (hasB) { score += 2; why.push("borrower in folder name"); }
    if (hasL) { score += 2; why.push("lender in folder name"); }

    const loanDate = loan.agreementDate || (loan.original && loan.original.agreementDate);
    // The master tracker itself flags one loan as "(as cited - verify)" because
    // the SBP registration letter cites a date one day off the agreement. Treat
    // dates within two days as the same agreement, and say so.
    const dayGap = (loanDate && fo.meta.date)
      ? Math.abs(Date.parse(loanDate) - Date.parse(fo.meta.date)) / 86400000 : null;
    const dateExact = dayGap === 0;
    const dateNear = dayGap != null && dayGap > 0 && dayGap <= 2;
    if (dateExact) { score += 3; why.push("agreement date matches"); }
    else if (dateNear) { score += 2; why.push("agreement date within " + dayGap + " day(s)"); }

    // Amount: compare the leading digits, so "Rs. 760 mil." matches 760000000.
    if (loan.principal && fo.meta.amountText) {
      const digits = String(fo.meta.amountText).replace(/[^\d]/g, "");
      const p = String(loan.principal);
      if (digits && (p.startsWith(digits) || digits.startsWith(p.slice(0, Math.max(2, digits.length))))) {
        score += 1; why.push("amount consistent");
      }
    }

    const strong = (hasB && hasL) || ((hasB || hasL) && (dateExact || dateNear));
    if (strong) scored.push({ folder: fo, score, why });
  }

  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  // Refuse an ambiguous tie: two folders equally well matched means we do not
  // actually know which one this loan is.
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { ambiguous: true, candidates: scored.slice(0, 4).map((s) => s.folder.folderPath) };
  }
  return { folder: scored[0].folder, score: scored[0].score, why: scored[0].why };
}

/* ------------------------------------------------------ licence discovery */

// Licence certificates carry their issue date in the filename, so a folder with
// several certificates IS the renewal chain. "valid till Aug 2026" / "Valid
// August 2027" also appear and are captured as stated validity.
function licenceFolders() {
  const files = drive.indexFiles().filter((f) => /Licenses & Approvals/i.test(f.folderPath || ""));
  const out = new Map();
  for (const f of files) {
    const segs = String(f.folderPath).split(" / ");
    const at = segs.findIndex((s) => /Licenses & Approvals/i.test(s));
    const leaf = segs[at + 1];
    if (!leaf) continue; // the summary workbook at tree root
    const key = segs.slice(0, at + 2).join(" / ");
    if (!out.has(key)) out.set(key, { folderPath: key, name: leaf, authority: (leaf.split(/[-_]/)[0] || "").trim(), files: [] });
    /* A VALIDITY DATE IS NOT THE DOCUMENT'S DATE.
       "Dubizzle Labs_PSEB Registration Certificate_Valid August 2027" was dated
       2027-08-01 -- the month the licence EXPIRES -- which put a 2026 renewal
       after a certificate that has not run out yet and inverted the chain. The
       validity clause is read first and removed before the document is dated. */
    const validity = f.name.match(/valid(?:\s+(?:till|until|to|upto|up\s+to))?\s+([A-Za-z]+\s+20\d{2})/i)
      || f.name.match(/\[\s*valid[^\]]*?([A-Za-z]+\s+20\d{2})\s*\]/i);
    const forDating = validity ? f.name.replace(validity[0], " ") : f.name;
    let d = dateFromName(forDating);
    /* The group also files by year and month alone: "RMC License_Zameen
       RMC_202606". Undated, that certificate sorted to the front and was
       labelled the ORIGINAL of a licence first issued in 2023. */
    if (!d) {
      const ym = forDating.match(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(?!\d)/);
      if (ym) d = { date: ym[1] + "-" + ym[2] + "-01", how: "yyyymm", approximate: true };
    }
    out.get(key).files.push({
      id: f.id, name: f.name, mimeType: f.mimeType, folderPath: f.folderPath,
      webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "",
      date: d ? d.date : null,
      dateApproximate: !!(d && d.approximate),
      validUntilText: validity ? validity[1] : null,
      kind: /renewal application|application/i.test(f.name) ? "application"
        : /renewal/i.test(f.name) ? "renewal"
          : /notification|extension/i.test(f.name) ? "authority_notice"
            : /certificate|licen[cs]e|membership|registration/i.test(f.name) ? "certificate"
              : "supporting",
      quality: d ? "COMPLETE" : "INCOMPLETE_SOURCE",
      subFolder: segs.slice(at + 2).join(" / ") || null,
      origin: "drive",
    });
  }
  for (const v of out.values()) {
    /* Undated documents sort LAST, not first. Sorting them to the front let a
       file nobody could date claim to be the original licence. */
    v.files.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
    // The renewal chain is the dated certificates in order. Two or more means
    // the licence has demonstrably been renewed.
    v.chain = v.files.filter((x) => x.kind === "certificate" || x.kind === "renewal");
    /* RENEWALS ARE COUNTED BY DOCUMENT, NOT BY DATED DOCUMENT.
       Counting `dated - 1` reported the PSEB licence as never renewed, because
       its renewal certificate carries only a validity ("Valid August 2027") and
       no issue date. A renewal you cannot date is still a renewal. */
    v.renewals = Math.max(0, v.chain.length - 1);
  }
  return [...out.values()];
}

/* --------------------------------------------------- SECP source evidence */

// There is NO SECP filing register in Drive -- a fresh crawl of all 849 folders
// found no FY folder, no AGM folder, no SECP folder and no "annual return"
// folder anywhere in the estate. That was verified, not assumed.
//
// But SECP-ADJACENT EVIDENCE does exist, and it is deterministic:
//
//   * 39 pre- and post-AGM board minutes name the entity and the meeting date,
//     which is direct evidence that an AGM was held that year.
//   * 7 resolutions approve audited financial statements, dating FS approval.
//   * A handful of the group's own SECP forms (Zameen Media Form A for annual
//     returns to 24.02.2020; Daftarkhwan "Form A & 29 updated Dec 21").
//
// So the SECP module is seeded with what Drive actually proves, and everything
// else stays prospective. An AGM minute proves a MEETING, not a FILING, and the
// two are labelled differently here so nobody reads one as the other.
function secpEvidence() {
  const files = drive.indexFiles();
  const out = [];

  const push = (f, kind, label, entityHint, extra) => {
    const d = dateFromName(f.name);
    out.push({
      kind, label,
      entity: entityHint || null,
      entityKey: entities.entityKey(entityHint),
      date: d ? d.date : null,
      dateApproximate: !!(d && d.approximate),
      quality: d ? "COMPLETE" : "INCOMPLETE_SOURCE",
      incomplete: d ? null : ["date"],
      file: { id: f.id, name: f.name, mimeType: f.mimeType, folderPath: f.folderPath, webViewLink: f.webViewLink || "" },
      origin: "drive",
      ...(extra || {}),
    });
  };

  // Entity is taken from the Resolutions folder the document sits in -- an
  // authoritative structural fact, not a guess from the filename.
  const entityOfPath = (p) => {
    const segs = String(p || "").split(" / ");
    const at = segs.findIndex((s) => /^Resolutions\s*$/i.test(s.trim()));
    if (at < 0 || !segs[at + 1]) return null;
    return segs[at + 1].replace(/_Resolutions.*$/i, "").replace(/\s*\(1\)\s*$/, "").trim();
  };

  for (const f of files) {
    const n = String(f.name || "");
    const p = String(f.folderPath || "");
    const ent = entityOfPath(p);

    if (/\bAGM\b/i.test(n)) {
      const post = /post-?AGM/i.test(n);
      push(f, "agm_minutes", (post ? "Post-AGM" : "Pre-AGM") + " board minutes", ent, {
        proves: "agm_held",
        note: "Board minutes recording an AGM. Evidence that a meeting took place; not itself a SECP filing.",
      });
      continue;
    }
    if (/audited financial statement|approval of audited FS|approve audited financial|financial statement/i.test(n) && /Resolutions/i.test(p)) {
      push(f, "fs_approval", "Board approval of financial statements", ent, {
        proves: "financial_statements_approved",
        note: "Board resolution approving audited financial statements.",
      });
      continue;
    }
    if (/\bform[\s_-]*(a|3|7|9|19|29)\b/i.test(n)) {
      // Only the group's own filings count. The Form A/9/3 copies inside the
      // Madison Square PPA folder are a DEVELOPER's due-diligence documents, not
      // ours, and must not be presented as group filings.
      const thirdParty = /Zameen Media PPA|Madison Square|Developer Docs/i.test(p);
      const form = (n.match(/\bform[\s_-]*(a|3|7|9|19|29)\b/i) || [])[1];
      push(f, thirdParty ? "third_party_form" : "secp_form",
        (thirdParty ? "Third-party " : "") + "SECP Form " + String(form).toUpperCase(),
        ent || entityFromLoanPath(p), {
          form: String(form).toUpperCase(),
          thirdParty,
          proves: thirdParty ? "counterparty_due_diligence" : "secp_form_on_file",
          note: thirdParty
            ? "A counterparty's own SECP form held for due diligence. Not a group filing."
            : "A SECP form belonging to a group entity, held in Drive.",
        });
    }
  }
  return out;
}

function entityFromLoanPath(p) {
  const segs = String(p || "").split(" / ");
  const at = segs.findIndex((s) => /Zameen Group_Loan Agreements|Zameen Group _PK Intercompany Loans/.test(s));
  return at >= 0 && segs[at + 1] ? segs[at + 1] : null;
}

/* ---------------------------------------------- lease / service documents */

// Lease and service agreement documents that live in Drive OUTSIDE the spend
// tracker -- e.g. "Dubizzle Labs / Lease Agreements" (23 files) sitting under
// the intercompany loan tree. They are real lease documents and should not be
// invisible just because the tracker does not list them.
function spendDocumentFolders() {
  const files = drive.indexFiles();
  const out = new Map();
  for (const f of files) {
    const p = String(f.folderPath || "");
    // "Subsidiaries Contracts" is included because two ZIMS security-guard
    // service agreements are filed there, under the LOAN tree. They are service
    // agreements wherever they happen to sit, and were the last two documents in
    // the estate that no record claimed.
    if (!/(Lease Agreements?|Spend Contracts|General Agreements|Subsidiaries Contracts)/i.test(p)) continue;
    const segs = p.split(" / ");
    const at = segs.findIndex((s) => /(Lease Agreements?|Spend Contracts|General Agreements|Subsidiaries Contracts)/i.test(s));
    const key = segs.slice(0, at + 1).join(" / ");
    const leaf = segs[at];
    if (!out.has(key)) {
      out.set(key, {
        folderPath: key,
        name: leaf,
        klass: /lease/i.test(leaf) ? "lease" : /general/i.test(leaf) ? "other" : "mixed",
        entityFolder: segs[at - 1] || null,
        files: [],
      });
    }
    const d = dateFromName(f.name);
    out.get(key).files.push({
      id: f.id, name: f.name, mimeType: f.mimeType, folderPath: p,
      webViewLink: f.webViewLink || "", date: d ? d.date : null,
      quality: d ? "COMPLETE" : "INCOMPLETE_SOURCE", origin: "drive",
    });
  }
  return [...out.values()];
}

/* ------------------------------------------------------ template registry */

// The approved template library, classified by which record family it serves.
// A Word document is NOT treated as an approved template merely because it is
// in the folder: drafts and works-in-progress are marked as such, from the
// evidence in their own name and path (PART 19).
const TEMPLATE_FAMILY = [
  { family: "lease", re: /lease|tenancy|leaseback/i },
  { family: "service", re: /service|consultancy|maintenance|logistics|marketplace|IT and PS|IT Services/i },
  { family: "loan", re: /loan|banking and finance|facility|convertible/i },
  { family: "resolution", re: /resolution|board|authorisation|authorization|minutes/i },
  { family: "licence", re: /licen[cs]e|permit/i },
  { family: "secp", re: /\bsecp\b|form [a39]|annual return/i },
  { family: "termination", re: /termination/i },
  { family: "nda", re: /non-disclosure|nda/i },
];

function templateRegistry() {
  const files = drive.indexFiles().filter((f) => /Pakistan Contract Templates/i.test(f.folderPath || ""));
  return files
    .filter((f) => !/^~\$/.test(f.name || "") && !/^\.|desktop\.ini$|\.tmp$/i.test(f.name || ""))
    .map((f) => {
      const segs = String(f.folderPath || "").split(" / ");
      const at = segs.findIndex((s) => /Pakistan Contract Templates/i.test(s));
      const category = (at >= 0 && segs[at + 1]) ? segs[at + 1] : "General";
      const hay = f.name + " " + category;
      const families = TEMPLATE_FAMILY.filter((t) => t.re.test(hay)).map((t) => t.family);
      // Status read from the source, not assumed. A file in a "00 Drafts"
      // folder or named [Draft] / work in progress is not an approved template.
      const draft = /\bdraft\b|\[draft\]|work in progress|preliminary|tracks\b/i.test(hay) || /00 Drafts/i.test(f.folderPath);
      const execution = /execution version|final|executed/i.test(hay);
      return {
        templateId: "TPL-" + String(f.id).slice(0, 10).toUpperCase(),
        driveFileId: f.id,
        name: f.name,
        category,
        families: families.length ? families : ["general"],
        folderPath: f.folderPath,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime || "",
        status: draft ? "DRAFT" : execution ? "EXECUTION_VERSION" : "AVAILABLE",
        approved: !draft,
        approvalEvidence: draft ? "Filed under a drafts folder or named as a draft"
          : execution ? "Named as an execution/final version"
            : "In the approved template library with no draft marker",
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/* -------------------------------------------------------------- letterheads */

// Entity letterheads: searched for across the whole estate. None exist, so
// resolution generation states "Letterhead not configured" rather than shipping
// a document that looks like it lost its branding.
function letterheads() {
  const hits = drive.indexFiles().filter((f) => /letterhead|letter\s?head/i.test((f.name || "") + " " + (f.folderPath || "")));
  // A document PRINTED ON letterhead is not a letterhead asset. The only match
  // in the estate is a Dubizzle Labs resolution whose filename notes it was
  // issued on letterhead -- treating that as a template would mean generating
  // future resolutions from someone else's signed minutes.
  const assets = hits.filter((f) => /^(letterhead|letter\s?head)\b/i.test(f.name || "") ||
    /letterheads?$/i.test(String(f.folderPath || "").split(" / ").pop() || ""));
  return {
    assets: assets.map((f) => ({ id: f.id, name: f.name, folderPath: f.folderPath })),
    mentions: hits.length,
    configured: assets.length > 0,
  };
}

module.exports = {
  dateFromName, ordinalOf, classifyDoc,
  loanFolders, parseLoanFolderName, matchFolderToLoan,
  licenceFolders, secpEvidence, spendDocumentFolders,
  templateRegistry, letterheads,
};

/* ------------------------------------------- entity folder documents */

// Every document sitting in an entity's Resolutions folder, keyed by entity.
// The ingest links a document to a specific resolution ROW only when the
// filename and the row agree; the rest are real documents belonging to a real
// company that no single row claimed. They are not noise and must not vanish —
// they are reachable through the entity, and counted in the reconciliation.
function resolutionFolderDocs() {
  const out = new Map();
  for (const f of drive.indexFiles()) {
    const p = String(f.folderPath || "");
    const m = p.match(/\/\s*Resolutions\s*\/\s*([^/]+?)(?:\s*\(\d+\))?\s*(?:\/|$)/i);
    if (!m) continue;
    const entityName = m[1].replace(/[_\s-]*Resolutions?\s*(&|and)?\s*Authoris?z?ations?.*$/i, "").trim();
    const key = entities.entityKey(entityName);
    if (!key) continue;
    if (!out.has(key)) out.set(key, { entityKey: key, entity: entityName, files: [] });
    out.get(key).files.push({
      id: f.id, name: f.name, mimeType: f.mimeType, folderPath: p,
      webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "",
    });
  }
  return out;
}

module.exports.resolutionFolderDocs = resolutionFolderDocs;
