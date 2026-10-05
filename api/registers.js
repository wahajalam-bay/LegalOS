// Turning the Drive trackers into module data.
//
// The document library answers "where is the file". This answers "what are the
// records" — the contracts, cases, licences and loans the legal team actually
// tracks, lifted out of ~20 hand-maintained spreadsheets and normalised into one
// shape per module.
//
// It is SYNONYM-DRIVEN rather than one mapping per file, because the trackers do
// not agree with each other: the same column is "Agreement Title" in one book,
// "Project Name" in another, "Contract Title" in a third. Declaring the field
// once with its aliases means a new tracker dropped into Drive is usually picked
// up with no code change — which is the point, since the team adds files, not
// commits.
//
// Everything here is READ-ONLY. Drive stays the system of record.
const fs = require("fs");
const path = require("path");
const { load, ROOT } = require("./config");
const { driveRaw } = require("./google");
const drive = require("./drive");
const sourceResolve = require("./source-resolve");
const xlsx = require("./xlsx");
/* Required LAZILY: entities.js requires registers.js back (for `ensure`), so a
   top-level require here would bind a half-built module during load -- the same
   cycle entities.js documents at its own top. Only the pure `entityKey`
   normaliser is used, and it is resolved at call time. */
const entities = { entityKey: (v) => require("./entities").entityKey(v) };

const CACHE_FILE = path.join(ROOT, "config", ".registers.json");
const MAX_BYTES = 26 * 1024 * 1024;   // a 19MB loan ledger is not a register
const MAX_SHEETS_PER_FILE = 60;

/* ---------------------------------------------------------------- families */

const FAMILIES = [
  {
    key: "contracts",
    label: "Contracts",
    match: (f) =>
      /spend\s*contract|ppa|finder|admin contracts|other contracts|contracts tracker|subsidiaries contracts/i.test(f.name) ||
      /spend contracts/i.test(f.folderPath || ""),
    // Sheets that are obviously not a register.
    skipSheet: (n) => /^(key|legend|instructions|notes)$/i.test(n.trim()),
    fields: {
      ref:          ["physical file no", "serial no", "sr no", "sr #", "no", "file no", "reference"],
      title:        ["agreement title", "project name", "contract title", "title", "agreement"],
      start:        ["start date", "commencement date", "effective date", "agreement date"],
      end:          ["end date", "expiry date", "expiry", "repayment term date", "termination date"],
      department:   ["department", "dept"],
      region:       ["region"],
      type:         ["agreement type", "contract type", "type", "nature"],
      firstParty:   ["first party", "company", "entity", "borrower issuer seller"],
      counterParty: ["counter party", "counterparty", "second party", "vendor", "parties", "lender subscriber"],
      city:         ["city"],
      value:        ["contract value pkr", "contract value", "value", "purchase price pkr", "amount pkr", "total loan amount"],
      status:       ["status", "expiry status", "licence status", "license status"],
      documents:    ["documents", "document", "agreements", "attachment"],
      owner:        ["email address", "email", "owner", "email category"],
    },
    required: ["title"],
    identity: ["title", "start", "end", "counterParty"],
    /* A SECOND WAY TO RECOGNISE THE SAME AGREEMENT.
       "Zameen Media PPA's" holds four contract workbooks, and the same contract
       appears in two families that number it differently — "First Amendment of
       Grand Square" is serial 1162 in Admin/Other and 231 in the Finder's Fee
       tracker. The identity above is a conjunction, so a single differing date
       keeps the two copies apart and the register carried both: 81 agreements
       listed twice, each with its own id and detail page.
       The DOCUMENTS column settles it. It lists the actual scanned filenames, so
       it is identical for two copies of one agreement and different for
       different agreements — four rows all titled "Services Agreement" starting
       the same day are told apart by it (LDA City Alpha Estate, Urban
       Developers, Maymar Housing), which is exactly the merge that must not
       happen. Used only when the column is substantial enough to mean something. */
    /* TWO ROWS THAT CITE NO DOCUMENT IN COMMON ARE NOT ONE CONTRACT.
       Executed instruments are the strongest identity evidence the estate has:
       if row A names three PDFs and row B names three different PDFs, there are
       six documents and two agreements, whatever the title column says. A row
       with no documents at all is not blocked — most of the register is like
       that, and blocking it would stop all deduplication. */
    compatible: (a, b, norm) => {
      const docs = (v) => new Set(String(v || "").split(/\.pdf|\.docx?/i)
        .map((x) => norm(x)).filter((x) => x && x.length > 6));
      const A = docs(a.documents), B = docs(b.documents);
      if (!A.size || !B.size) return true;
      for (const d of A) if (B.has(d)) return true;
      return false;
    },
    altIdentities: [
      { fields: ["title", "type", "documents"], requires: "documents", minLength: 12 },
      /* Within the Admin/Other pair — two 1,122-row copies of one master — the
         serial number is reliable, so a row with no documents column still has
         an identity. Checked before it was added: this rule merges exactly one
         group ("Premier One", serial 1119 in both) and causes no merge where the
         members disagree on any substantive field. It is deliberately narrow;
         serials are NOT comparable across the two workbook families, where the
         same agreement is 1162 in one and 231 in the other. */
      { fields: ["title", "ref", "type", "region"], requires: "ref", minLength: 1 },
      {
        fields: ["type", "start", "documents"], requires: "documents", minLength: 12,
        compatible: (a, b, norm) => {
          /* One title must contain the other. "Vehicle Lease Agreement"
             contains "Lease Agreement"; neither "…SF14" nor "…SF-11 (Square
             One)" contains the other, so those stay two contracts. */
          const ta = norm(a.title), tb = norm(b.title);
          if (!ta || !tb) return false;
          if (!(ta === tb || ta.includes(tb) || tb.includes(ta))) return false;
          /* And the counterparties must not contradict. A blank is not a
             contradiction: one workbook simply does not carry the column. */
          const ca = norm(a.counterParty), cb = norm(b.counterParty);
          if (ca && cb && !(ca === cb || ca.includes(cb) || cb.includes(ca))) return false;
          return true;
        },
      },
      /* THE SAME AGREEMENT, TITLED TWO WAYS.
         The two workbook families describe one contract differently -- "Vehicle
         Lease Agreement" carrying the counterparty against "Lease Agreement"
         with that column blank -- so neither the primary identity (which needs
         the titles to match) nor the title-based alternates above recognise
         them as one. What they share is the agreement type, the start date and
         the documents column, and a documents column naming the same scanned
         file is strong evidence.

         This was withdrawn once. Merging records MOVED DOCUMENT CITATIONS, and
         authorization was derived from those citations, so collapsing two rows
         silently changed who could open a file. That coupling is now gone:
         document access is recorded per document in config/document-scope.json
         and no longer depends on the record graph at all. Merging changes what
         the register shows and changes nobody's access.

         The guard is what keeps the merge itself honest. The key alone would
         also collapse "Lease Agreement SF14" into "Lease Agreement SF-11
         (Square One)" -- two units in one building sharing a type, a start date
         and a documents column. Measured: 8 pairs merge, 11 look-alikes stay
         apart. */
    ],
  },
  {
    key: "litigation",
    label: "Litigation",
    match: (f) => /litigation|case bifurcation|pending litigation|cause list/i.test(f.name),
    skipSheet: (n) => /^(key|legend|entity summary|casetype summary|forag)/i.test(n.trim()),
    fields: {
      caseName:      ["case name", "case title", "title"],
      caseNo:        ["case no", "case number", "sr no", "sr #"],
      /* The refund sheet of Zameen Pending Litigation has no case title at all.
         What it does have is the buyer, the project and the amount claimed —
         which is who the matter is against, what it is about and what is at
         stake. Unmapped, every one of those rows arrived identified only by
         "CPML" or "ZD" (the entity column) and counted as a case with no name.
         Capturing them does not invent a title; it stops the register throwing
         away the identity the source actually carries. */
      counterparty:  ["buyer name", "counterparty", "opposing party", "defendant", "respondent"],
      project:       ["project name", "project"],
      claimAmount:   ["refund amount", "claim amount", "amount claimed"],
      nature:        ["case nature", "case type", "nature"],
      court:         ["court", "forum"],
      status:        ["status"],
      proceedings:   ["proceedings", "brief description", "details"],
      entity:        ["entity", "entity cpml zd", "company"],
      lastHearing:   ["last hearing date", "last hearing"],
      nextHearing:   ["next date of hearing", "next hearing", "next date"],
      outcome:       ["outcome", "relief sought"],
      filingDate:    ["filing date", "case filed", "date of filing"],
      position:      ["company position", "for against", "position"],
      counsel:       ["law firm counsel", "counsel", "law firm", "advocate"],
      exposurePKR:   ["exposure pkr", "exposure"],
      exposureUSD:   ["exposure usd"],
      recoverablePKR:["recoverable pkr", "recoverable"],
      recoverableUSD:["recoverable usd"],
      legalCost:     ["legal cost incurred pkr", "legal cost incurred", "legal cost"],
      opinion:       ["opinion", "suggestion", "suggested action"],
    },
    required: ["caseName"],
    identity: ["caseName", "court", "filingDate"],
    /* A REFUND CLAIM IS IDENTIFIED BY WHO AND WHAT, NOT BY A CAUSE TITLE.
       The refund sheet has no case title, so every one of its rows failed the
       primary identity (title + court + filing date) with fewer than two parts
       filled, and was flagged WEAK IDENTITY — 25 rows whose buyer, project and
       amount the source states plainly. Buyer plus project is a real identity:
       it is what distinguishes one claim from another, and it is what a second
       copy of the same claim would agree on. */
    altIdentities: [
      { fields: ["counterparty", "project"], requires: "counterparty", minLength: 3 },
    ],
  },
  {
    key: "notices",
    label: "Legal notices",
    match: (f) => /notice|summons/i.test(f.name),
    skipSheet: (n) => /^(key|legend)$/i.test(n.trim()),
    fields: {
      ref:        ["sr no", "sr #", "no"],
      noticeDate: ["date of notice", "date of dispatch", "notice date", "date"],
      receiptDate:["date of receipt", "receipt date"],
      sender:     ["sender", "from"],
      recipient:  ["recepient", "recipient", "to"],
      category:   ["category", "type"],
      details:    ["details", "description", "subject"],
      status:     ["status"],
      replyDate:  ["date of reply", "reply date"],
      comments:   ["comments", "remarks"],
    },
    required: ["sender", "recipient", "details"],
    identity: ["noticeDate", "sender", "recipient", "details"],
  },
  {
    key: "licences",
    label: "Licences & permits",
    match: (f) => /licen[cs]e|permit/i.test(f.name) || /licen[cs]es? & approvals/i.test(f.folderPath || ""),
    skipSheet: (n) => /^(key|legend)$/i.test(n.trim()),
    fields: {
      entity:     ["entity", "company"],
      authority:  ["issuing authority", "authority", "regulator"],
      issued:     ["date of issuance ddmmyy", "date of issuance", "issue date", "issued"],
      expiry:     ["date of expiry ddmmyy", "date of expiry", "expiry date", "expiry"],
      number:     ["license no", "licence no", "permit no", "registration no"],
      status:     ["licence status", "license status", "status"],
      owner:      ["email", "email address", "owner"],
    },
    required: ["entity"],
  },
  {
    key: "loans",
    label: "Loans & financing",
    match: (f) => /loan/i.test(f.name) || /loan/i.test(f.folderPath || ""),
    fields: {
      ref:        ["lrn", "loan ref lrn", "loan ref", "no", "sr no"],
      borrower:   ["borrower", "borrower issuer seller"],
      lender:     ["lender current", "lender original", "lender", "lender subscriber"],
      amount:     ["total loan amount", "amount pkr", "amount"],
      currency:   ["currency"],
      interest:   ["interest", "rate"],
      agreementDate: ["main agreement date", "agreement date", "execution date"],
      repaymentDate: ["repayment term date", "repayment due after event", "repayment due"],
      term:       ["repayment term", "term"],
      status:     ["status", "status notes", "expiry status"],
      documents:  ["agreements", "documents"],
    },
    /* THREE DIFFERENT SHAPES LIVE IN THE LOAN WORKBOOKS, AND ONLY ONE OF THEM
       IS A LIST OF LOANS.
         · Inter Company Loans Tracker — one sheet per lending entity, each a
           proper table with a "Borrower / Issuer / Seller" column. Loans.
         · FDI_Loan_Tracker "Master Tracker" — one row per international loan,
           with a Borrower column. Loans.
         · FDI per-entity sheets and the OLX "Tracker" sheet — the amendment
           history of loans already listed above: Original Agreement, 1st
           Amendment, Novation, CURRENT STATUS. No Borrower column, because the
           borrower is printed once in the banner over the table.
       Read flat, that last group produced 132 "loans with no borrower". They
       are not loans at all; they are what happened to loans. The borrower is
       recovered from the banner (it is written there, in the workbook) and the
       rows are marked as events so they stop being counted as agreements. */
    sheetContext: ({ sheet, banner, lines }) => {
      const text = banner.join("  ");
      if (!text) return null;
      /* A sheet may stack several facilities, each under its own sub-banner:
           "Facility 2 — USD 250,000 Convertible Loan | Daftarkhwan Holdings
            Limited ← Online Classifieds Pakistan (SMC-Private) Limited"
         The arrow points from borrower to lender, so the borrower is the name
         to its left. Each facility's rows inherit its own borrower rather than
         the sheet's, which is how three different borrowers on one sheet stay
         three different borrowers. */
      const sections = [];
      for (const l of lines || []) {
        const fm = l.text.match(/^\s*(?:Facility|Loan)\s+\d+\s*[—–-][^|]*\|\s*(.+?)\s*(?:←|<-|from)\s*(.+?)\s*$/i);
        if (fm) {
          sections.push({ fromRow: l.row, fields: { borrower: fm[1].replace(/\s+/g, " ").trim() },
            evidence: { from: "facility banner", sheet, row: l.row, text: l.text.slice(0, 220) } });
        }
      }
      // "Borrower: Online Classifieds Pakistan (SMC-Pvt) Ltd  |  Lender: ..."
      let m = text.match(/Borrower\s*(?:\/[^:]*)?:\s*([^|]+?)(?:\s*\||$)/i);
      // "Zameen Venture One (Private) Limited — FCY Loan Detail", and the
      // shorter "Daftarkhwan — FCY / Convertible Loan Detail": a trading name
      // without "Limited" is still the borrower the sheet is about.
      if (!m) m = text.match(/^\s*([A-Z][^|]*?)\s*[—–-]\s*(?:FCY|FDI|Foreign|Convertible)/i);
      // "Online Classifieds Pakistan – Foreign Currency Loan Tracker"
      if (!m) m = text.match(/^\s*([A-Z][^|]*?)\s*[—–-]\s*Foreign Currency Loan Tracker/i);
      const borrower = m ? m[1].replace(/\s+/g, " ").trim() : "";
      /* An event log announces itself: its table is keyed on what happened,
         not on who borrowed. */
      const isEventLog = /\bEvent\b/i.test(text) || /Loan Detail|Amendment/i.test(text);
      if (!borrower && !isEventLog && !sections.length) return null;
      return {
        fields: borrower ? { borrower } : {},
        sections,
        rowKind: isEventLog ? "LOAN_EVENT" : null,
        evidence: { from: "sheet banner", sheet, text: text.slice(0, 220) },
      };
    },
    /* A sheet of SBP rollover findings is an analysis OF the loans, not a
       register of them; ingesting it would double-count every breach as a
       loan. It is classified and kept, not silently dropped. */
    skipSheet: (n) => /^(key|legend|summary|violations summary)$/i.test(n.trim()),
    required: ["borrower"],
  },
  {
    key: "resolutions",
    label: "Board resolutions",
    match: (f) => /resolution/i.test(f.name) || /resolutions/i.test(f.folderPath || ""),
    skipSheet: (n) => /^(key|legend)$/i.test(n.trim()),
    fields: {
      date:     ["date"],
      agenda:   ["agenda", "subject", "particulars"],
      docNo:    ["document no", "doc no", "resolution no"],
    },
    required: ["agenda"],
  },
  {
    key: "properties",
    label: "Project properties",
    match: (f) => /project properties|properties and documents/i.test(f.name),
    skipSheet: (n) => /^(key|legend)$/i.test(n.trim()),
    fields: {
      ref:        ["sr no"],
      project:    ["project name"],
      address:    ["property address"],
      city:       ["city"],
      entity:     ["group company"],
      ownership:  ["group company ownership"],
      jv:         ["joint venture"],
      value:      ["purchase price pkr", "purchase price"],
      start:      ["agreement to sell", "date of sale deed or allotment letter"],
      contractor: ["contractor"],
      status:     ["status"],
    },
    required: ["project"],
    // The properties tracker groups rows under a project: the name (and often
    // the company) appear once and the rows beneath are further properties of
    // that same project. Without carrying those down, 21 of 38 rows look
    // orphaned and get dropped.
    fillDown: ["project", "entity", "city", "jv", "ownership"],
  },
];

/* -------------------------------------------------------------- normalise */

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// Build header -> canonical-field lookup for one sheet.
function buildColumnMap(header, fields) {
  const map = {};
  const seen = new Set();
  const normHeader = header.map((h) => ({ raw: h, n: norm(h) }));
  for (const [field, aliases] of Object.entries(fields)) {
    for (const alias of aliases) {
      const a = norm(alias);
      // Exact first, then prefix — "status" should not steal "expiry status"
      // from a later field, so exact wins and each header is claimed once.
      let hit = normHeader.find((h) => h.n === a && !seen.has(h.raw));
      if (!hit) hit = normHeader.find((h) => h.n.startsWith(a + " ") && !seen.has(h.raw));
      if (hit) { map[field] = hit.raw; seen.add(hit.raw); break; }
    }
  }
  return map;
}

const isDate = (v) => v instanceof Date && !isNaN(v.getTime());

function cleanValue(v) {
  if (v == null) return "";
  if (isDate(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s+/g, " ").trim();
  return /^(n\/?a|-|--|nil|none|tbc|tbd)$/i.test(s) ? "" : s;
}

// Parse the FIRST number in a cell, not every digit in it.
//
// Stripping all non-digits looked harmless until a value cell turned out to
// hold two figures ("1,436,400" alongside "17,837,225" — rent plus
// maintenance). Concatenating their digits produced 1.4 QUADRILLION and threw
// the portfolio total into the billions of billions. Anchor on one number and
// leave anything ambiguous unparsed.
function toNumber(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const raw = String(v == null ? "" : v).trim();
  if (!raw) return null;
  const m = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ""));
  if (isNaN(n)) return null;
  // A cell that holds more than one figure is a composite the register cannot
  // resolve (a range, or two amounts). Reporting the first as if it were the
  // contract value would be a confident wrong answer, so record nothing.
  const numbers = raw.match(/-?\d[\d,]*(?:\.\d+)?/g) || [];
  if (numbers.length > 1) return null;
  return n;
}

/* A record's identity, derived from WHERE IT CAME FROM rather than from its
   position in an array: family prefix + a hash of (Drive file id, sheet name,
   row number). The same source row always yields the same id across ingests,
   restarts and re-orderings, so detail URLs survive and every record can be
   traced back to one cell range in one spreadsheet. */
const ID_PREFIX = {
  contracts: "CTR", litigation: "LIT", notices: "NTC",
  licences: "LIC", loans: "LON", resolutions: "RES", properties: "PRP",
};
function recordId(famKey, provenance, rowNo) {
  const basis = [provenance.fileId || provenance.file || "", provenance.sheet || "", rowNo == null ? "" : rowNo].join("|");
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = (Math.imul(h, 31) + basis.charCodeAt(i)) >>> 0;
  return (ID_PREFIX[famKey] || famKey.slice(0, 3).toUpperCase()) + "-" + h.toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

/* EVERY RAW ROW GETS A DISPOSITION.
   The ingest used to `continue` past rows it could not use, so the difference
   between "7,677 rows in Drive" and "2,896 records in the app" was an
   unexplained subtraction. Each raw row now ends in exactly one bucket, counted
   per (file, sheet), and the totals must reconcile. UNKNOWN_DROP must be 0. */
const DISPOSITIONS = [
  "INGESTED_RECORD",           // a normal record
  "INCOMPLETE_SOURCE_RECORD",  // substantive row, a required field blank in the SOURCE — kept
  "MERGED_DUPLICATE",          // collapsed into another row on an explicit identity
  "NOT_A_REGISTER_SHEET",      // the sheet is not this family's register at all
  "SKIPPED_SHEET",             // family.skipSheet said so (key/legend/summary tabs)
  "BLANK_ROW",                 // nothing in any mapped column
  "PADDING_ROW",               // only trivia (a stray 0) — spreadsheet filler
  "UNKNOWN_DROP",              // must stay at zero
];

function newLedger() {
  return { rows: [], add(provenance, family, disposition, count, detail) {
    if (!count) return;
    this.rows.push({
      fileId: provenance.fileId, file: provenance.file, sheet: provenance.sheet,
      family, disposition, count, detail: detail || null,
    });
  } };
}

const PARSER_VERSION = 3;

/* The field names a family maps, for reporting what a row actually carries. */
function cmapKeys(fam) { return fam.fields || {}; }

/* WHAT A SHEET SAYS ABOUT ITS OWN ROWS.
 *
 * A tracker is not always one table with one header. The FDI loan tracker is a
 * Master Tracker sheet — one row per loan, with a Borrower column — followed by
 * one sheet per borrower holding that borrower's amendment history. Those
 * detail sheets have no Borrower column, because the borrower is printed once
 * in the banner above the table: "Zameen Venture One (Private) Limited — FCY
 * Loan Detail".
 *
 * Read as a flat table, every one of those 132 rows is a loan with no borrower,
 * and that is what the register said: 132 incomplete records. They are not
 * incomplete. The answer is on the sheet, one row higher than the parser was
 * looking.
 *
 * So a family may declare `sheetContext`, which reads the rows ABOVE the header
 * and returns field values the rows inherit when their own column is blank. The
 * value is source-backed — it is read out of the workbook, not guessed — and
 * every row it fills records where it came from, so a reader can always see
 * that the borrower was taken from the sheet banner rather than a column.
 */
function readSheetContext(fam, sheetRows, headerRow, provenance) {
  if (!fam.sheetContext) return null;
  const rows = sheetRows || [];
  const line = (r) => (r || []).filter((c) => c != null && String(c).trim()).map(String).join(" | ");
  const banner = rows.slice(0, Math.max(0, headerRow)).map(line).filter(Boolean);
  /* SOME SHEETS HOLD SEVERAL TABLES, NOT ONE.
     The Daftarkhwan sheet is three facilities stacked vertically, each under
     its own sub-banner naming a different borrower, each with its own repeated
     header. A single sheet-level answer would put one borrower on all three.
     So the whole sheet is offered, as one-line strings with their 1-based row
     numbers, and a family may return `sections`: each row then inherits from
     the nearest section above it. */
  const lines = rows.map((r, i) => ({ row: i + 1, text: line(r) })).filter((x) => x.text);
  try {
    return fam.sheetContext({ sheet: provenance.sheet, banner, lines, file: provenance.file }) || null;
  } catch (e) { return null; }
}

/* The values in force at a given sheet row: the nearest section above it, over
   the sheet-wide defaults. */
function contextFor(ctx, rowNo) {
  if (!ctx) return null;
  let fields = ctx.fields || {};
  let evidence = ctx.evidence || null;
  for (const sec of ctx.sections || []) {
    if (rowNo != null && sec.fromRow <= rowNo) { fields = { ...fields, ...sec.fields }; evidence = sec.evidence || evidence; }
  }
  return { fields, evidence, rowKind: ctx.rowKind || null };
}

function mapRecords(records, header, fam, provenance, ledger, sheetCtx) {
  const cmap = buildColumnMap(header, fam.fields);
  // A sheet that matched almost nothing is not this kind of register.
  if (Object.keys(cmap).length < 2) {
    if (ledger) ledger.add(provenance, fam.key, "NOT_A_REGISTER_SHEET", records.length,
      "only " + Object.keys(cmap).length + " column(s) of this family matched the header");
    return [];
  }
  const out = [];
  const carried = {};
  let blank = 0, padding = 0, incomplete = 0, ingested = 0;

  for (const rec of records) {
    const row = {};
    const raw = {};
    for (const [field, col] of Object.entries(cmap)) {
      raw[col] = rec[col] == null ? "" : (rec[col] instanceof Date ? rec[col].toISOString() : rec[col]);
      row[field] = cleanValue(rec[col]);
    }

    // Grouped layouts leave the identifying columns blank on continuation rows.
    for (const field of fam.fillDown || []) {
      if (row[field] !== "" && row[field] != null) carried[field] = row[field];
      else if (carried[field] != null) { row[field] = carried[field]; row.__continued = true; }
    }

    for (const k of ["value", "amount", "exposurePKR", "exposureUSD", "recoverablePKR", "recoverableUSD", "legalCost", "ownership"]) {
      if (row[k] !== undefined && row[k] !== "") {
        const n = toNumber(row[k]);
        row[k] = n === null ? "" : n;
      }
    }

    // How much real content does this row carry? A bare 0 is spreadsheet filler,
    // not data — that is what the 689 trailing rows of the litigation Cause List
    // are, and they must NOT become records. A row with several populated
    // columns IS data, even when a required field is blank.
    const substantive = Object.keys(cmap).filter((f) => {
      const v = row[f];
      if (v === "" || v == null) return false;
      return !(typeof v === "number" ? v === 0 : /^0+(\.0+)?$/.test(String(v).trim()));
    }).length;

    /* Inherit what the sheet states about all of its rows, for any field the
       row itself leaves blank. Recorded, never silent. */
    const ctxHere = contextFor(sheetCtx, rec.__row);
    if (ctxHere) {
      for (const [k, v] of Object.entries(ctxHere.fields || {})) {
        if ((row[k] === "" || row[k] == null) && v) {
          row[k] = v;
          (row.__fromSheetContext = row.__fromSheetContext || []).push(k);
        }
      }
      if (row.__fromSheetContext) row.__sheetContextEvidence = ctxHere.evidence || null;
      if (ctxHere.rowKind) row.__rowKind = ctxHere.rowKind;
    }

    const missing = fam.required.filter((r) => row[r] === "" || row[r] == null);

    if (missing.length) {
      if (substantive >= 3) {
        // PRESERVE IT. A real row that the source left un-named still exists,
        // and dropping it is data loss. It is kept, flagged, and shown to data
        // stewards; no value is invented to fill the gap.
        row.__quality = "INCOMPLETE_SOURCE";
        row.__missingFields = missing;
        incomplete++;
      } else {
        if (substantive === 0) blank++; else padding++;
        continue;
      }
    } else {
      row.__quality = "COMPLETE";
      ingested++;
    }

    row.__source = provenance;
    row.__row = rec.__row || null;
    row.id = recordId(fam.key, provenance, row.__row);
    // Lineage (§6): where this record came from, and the untouched source cells
    // behind it, so a normalized value can always be checked against the sheet.
    row.__raw = raw;
    row.__lineage = {
      fileId: provenance.fileId, file: provenance.file, sheet: provenance.sheet,
      row: row.__row, ingestedAt: new Date().toISOString(), parser: PARSER_VERSION,
    };
    out.push(row);
  }

  if (ledger) {
    ledger.add(provenance, fam.key, "INGESTED_RECORD", ingested);
    ledger.add(provenance, fam.key, "INCOMPLETE_SOURCE_RECORD", incomplete, "a required field is blank in the source");
    ledger.add(provenance, fam.key, "BLANK_ROW", blank, "no mapped column holds a value");
    ledger.add(provenance, fam.key, "PADDING_ROW", padding, "only trivial values (e.g. a lone 0)");
  }
  return out;
}

// Where each register is read in the app. This is declared rather than
// inferred so the Knowledge Base screen in Settings can say, truthfully, which
// module is showing which tracker.
const SURFACES = {
  contracts:   { module: "Contracts",              route: "/contracts",  note: "The contract book \u2014 filters, KPIs, value and expiry." },
  litigation:  { module: "Litigation & Disputes",  route: "/litigation", note: "Cases, exposure, hearings and counsel." },
  notices:     { module: "Litigation & Disputes",  route: "/litigation", note: "Legal notices sent and received." },
  licences:    { module: "Compliance & Licences",  route: "/compliance", note: "Licences and permits, with expiry tracking." },
  resolutions: { module: "Compliance & Licences",  route: "/compliance", note: "Board resolutions by entity." },
  loans:       { module: "Compliance & Licences",  route: "/compliance", note: "Inter-company and FDI loan agreements." },
  properties:  { module: "Contracts",              route: "/contracts",  note: "Project properties, ownership and JV structure." },
};

/* ---------------------------------------------------------------- ingest */

let state = { builtAt: 0, building: false, registers: {}, sources: [], errors: [] };

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (raw && raw.registers) state = Object.assign(state, raw, { building: false });
  } catch (e) { /* first run */ }
  // Re-attach Drive files on every load. The matcher is cheap (it runs over the
  // already-warm Drive index, no network) and is the one place the linking logic
  // lives — re-running it here means a restart re-links the whole book with the
  // current matcher, so an improved matcher takes effect without a full Drive
  // re-ingest. Previous caches that predate driveFiles are covered by the same
  // pass.
  try {
    // Clear any cached driveFiles first so the CURRENT matcher logic is fully
    // authoritative — otherwise stale links from an older matcher survive a
    // restart (a record that no longer matches would keep its old documents).
    if (state.registers) for (const fam of Object.values(state.registers)) if (Array.isArray(fam)) for (const r of fam) if (r.driveFiles) r.driveFiles = [];
    const rows = state.registers && state.registers.contracts;
    if (rows && rows.length) attachDriveFiles(rows);
    const lit = state.registers && state.registers.litigation;
    if (lit && lit.length) attachLitigationDocs(lit);
    const nots = state.registers && state.registers.notices;
    if (nots && nots.length) attachNoticeDocs(nots);
    if (state.registers) { try { deriveNoticeDirection(state.registers); } catch (e) { /* a missing direction is not a build failure */ } }
    if (state.registers) attachComplianceDocs(state.registers);
    if (state.registers) {
      applyContentLinks(state.registers);
      applyCommercialReattach(state.registers);
      applyVisionPlacements(state.registers);
      const pruned = pruneSharedLinks(state.registers);
      dropEmptyDerivedResolutions(state.registers);
      // The restart path re-links from scratch, so it must re-prune too --
      // otherwise a restarted server hands back every template the build removed.
      // Its result is recorded as well: the prune ran on this path all along,
      // but Data Health read the count from the BUILD, so a restarted server
      // detached 785 files and reported none of it.
      const prunedTpl = pruneTemplateLibraryFiles(state.registers);
      /* The cached book was serialised BEFORE these were merged in, so the
         restart path has to merge them again -- otherwise a case raised in the
         app disappears from the register the next time the server restarts,
         which is the most alarming possible way for it to behave. */
      require("./litigation-cases").reload();
      const localCasesOnLoad = mergeLocalLitigationCases(state.registers);
      applyCaseOutcomes(state.registers);
      const localNoticesOnLoad = mergeLocalNotices(state.registers);
      /* RESOLVE FROM DRIVE ON THIS PATH TOO.
         This path deliberately CLEARS every driveFiles array and re-links the
         whole book with the current matchers, so that an improved matcher takes
         effect on a restart. That also wiped the nine notice documents the
         Drive resolver had found, because it was not one of the matchers being
         re-run: the build reported 22 notices with documents and the very next
         restart served 13. Same class of defect as the notice direction two
         blocks up — a register assembled one way on a cold build and another
         way on a warm start. It runs here, after the local records are merged,
         so tracker rows and rows raised in the app are treated alike. */
      const resolvedOnLoad = resolveMissingFromDriveToFixedPoint(state.registers);
      resolveConflictsFromDocument(state.registers);
      const matterClassesOnLoad = classifyMatters(state.registers);
      /* Same on the restart path — a state that survives only one of the two
         is a state that changes when the server bounces. */
      try { require("./archive").reload(); } catch (e) { /* no store yet */ }
      const archivedOnLoad = require("./archive").applyTo(state.registers);
      const documentStatesOnLoad = dispositionDocuments(state.registers);
      const qualityStatesOnLoad = finalQualityStates(state.registers);
      state.diagnostics = Object.assign({}, state.diagnostics, {
        templateFilesDetachedFromRecords: prunedTpl,
        litigationCasesRaisedInApp: localCasesOnLoad,
        noticesRecordedInApp: localNoticesOnLoad,
        resolvedFromDrive: resolvedOnLoad,
        matterClasses: matterClassesOnLoad,
        qualityStates: qualityStatesOnLoad,
        documentStates: documentStatesOnLoad,
        archived: archivedOnLoad,
      });
      // The restart path re-links the whole book, so it must also re-annotate.
      // Leaving it out here meant a restarted server served documents with no
      // content type at all until the next full ingest — the surface would be
      // there and simply empty, which reads as "we read nothing".
      annotateContent(state.registers);
      const stale = revalidateLinks(state.registers);
      const docClass = classifyDocuments(state.registers);
      // MERGE, do not replace. The row ledger (dispositions, reconciliation,
      // incomplete/conflict counts) is computed during a full ingest and
      // persisted; re-attaching documents on a restart must not wipe it, or
      // Data Health reads zero for everything until the next rebuild.
      state.diagnostics = Object.assign({}, state.diagnostics || {}, {
        prunedFuzzyLinks: pruned,
        staleLinksRemoved: stale.removed,
        documentDispositions: docClass.counts,
      }, linkDiagnostics(state.registers));
      state.documents = docClass.files;
      /* ONE CANONICAL STATE, ON DISK.
         This path deliberately re-links the whole book with the current
         matchers after the locally-raised records are merged in, so it ends up
         with a slightly MORE complete estate than the build that produced the
         cache — four more linked documents, in practice. It never wrote that
         back, so the file on disk and the estate being served disagreed, and
         any tool reading the file (the ledger, the reconciler) reported
         different numbers from the product. Persisting here means there is one
         answer: the next reader, whatever it is, sees what users see. */
      try { saveCache(); } catch (e) { /* a read-only disk must not fail the load */ }
    }
  } catch (e) { console.error("[registers] cache attach failed:", e.message); }
}

function saveCache() {
  try {
    // Atomic: a truncated cache loses the entire normalized book and the next
    // boot would serve an empty application until a full Drive re-ingest.
    const tmp = CACHE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({
      builtAt: state.builtAt, registers: state.registers, sources: state.sources,
      errors: state.errors, duplicates: state.duplicates, conflicts: state.conflicts,
      ledger: state.ledger, diagnostics: state.diagnostics,
      /* The gate's verdict is part of the book's provenance, not a detail of the
         process that built it. Left out of the cache, it vanished on the first
         restart: loadCache sets builtAt, ensure() then skips the rebuild, and
         Data Health showed no gate at all on a server that had been up for
         days. */
      parserGate: state.parserGate || null, degraded: state.degraded || null,
      lastDegradedIngest: state.lastDegradedIngest || null,
    }), { mode: 0o640 });
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) { console.error("[registers] cache write failed:", e.message); }
}

async function fetchFile(id) {
  const r = await driveRaw("/files/" + encodeURIComponent(id) + "?alt=media&supportsAllDrives=true");
  if (!r.ok) throw new Error("HTTP " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Every spreadsheet in the library, split into those a register claims and
// those nothing claims. The unclaimed list is the useful one: it is the
// material sitting in Drive that the OS is NOT reading.
function classify() {
  const idx = drive.indexFiles();
  const claimed = [];
  const unclaimed = [];
  for (const f of idx) {
    if (/^~\$/.test(f.name)) continue;
    if (!/\.xlsx?$/i.test(f.name) && !/spreadsheet/i.test(f.mimeType)) continue;
    const fams = FAMILIES.filter((fam) => fam.match(f));
    if (!fams.length) {
      unclaimed.push({ file: f.name, root: f.root, folder: f.folderPath, size: f.size || 0, reason: "no register pattern matches this file" });
    } else if ((f.size || 0) > MAX_BYTES) {
      unclaimed.push({ file: f.name, root: f.root, folder: f.folderPath, size: f.size || 0, reason: "larger than the " + Math.round(MAX_BYTES / 1048576) + "MB cap \u2014 treated as a ledger, not a register" });
    } else {
      claimed.push({ file: f, families: fams });
    }
  }
  return { claimed, unclaimed };
}

function candidates() {
  const idx = drive.indexFiles();
  const out = [];
  for (const f of idx) {
    // "~$Foo.xlsx" is Excel's lock file — a few hundred bytes of metadata left
    // behind by an open session, not a workbook. It is not a valid zip.
    if (/^~\$/.test(f.name)) continue;
    if (!/\.xlsx?$/i.test(f.name) && !/spreadsheet/i.test(f.mimeType)) continue;
    if ((f.size || 0) > MAX_BYTES) continue;
    const fams = FAMILIES.filter((fam) => fam.match(f));
    if (fams.length) out.push({ file: f, families: fams });
  }
  /* SOURCE PRECEDENCE IS A RULE, NOT AN ACCIDENT OF CRAWL ORDER.
     Where two workbooks record the same agreement and disagree, the register
     keeps the value it saw FIRST — so until now the canonical figure was
     decided by whatever order the Drive listing happened to return, and could
     change between builds without a single byte changing in Drive. The most
     recently maintained workbook is the one the team has been keeping up to
     date, so it goes first and its value is the one kept. Ties break on file
     id, so a rebuild over unchanged Drive always produces the same register. */
  out.sort((a, b) => {
    const t = (x) => Date.parse(x.file.modifiedTime || "") || 0;
    return t(b) - t(a) || String(a.file.id).localeCompare(String(b.file.id));
  });
  return out;
}

async function rebuild(force = false) {
  const cfg = load();
  if (state.building) return state;
  const ttl = (cfg.drive.refreshMinutes || 15) * 60 * 1000;
  if (!force && state.builtAt && Date.now() - state.builtAt < ttl) return state;

  /* THE READERS ARE A PRECONDITION, NOT A CONVENIENCE.
     A pruned extraction library once turned twenty-three real contracts into
     empty text without anything failing. So the candidate build is refused
     outright if a reader is missing: the last good dataset keeps being served,
     and `degraded` on the state says which reader went. Serving yesterday's
     complete registers beats promoting today's hollow ones. */
  const gate = require("./parser-gate").check();
  state.parserGate = gate;
  if (!gate.ok) {
    state.degraded = {
      since: state.degraded ? state.degraded.since : new Date().toISOString(),
      reason: "required document parser unavailable",
      detail: gate.detail,
      missing: gate.missing,
      servingBuiltAt: state.builtAt || null,
    };
    if (state.builtAt) return state;             // keep serving the last good build
    throw new (require("./parser-gate").ParserGateError)(gate);
  }
  state.degraded = null;

  state.building = true;
  const registers = {};
  const sources = [];
  const errors = [];
  const ledger = newLedger();            // every raw row's disposition
  for (const fam of FAMILIES) registers[fam.key] = [];

  try {
    await drive.ensureIndex();
    const list = candidates();
    for (const { file, families } of list) {
      let buf;
      try {
        buf = await fetchFile(file.id);
      } catch (e) {
        errors.push({ file: file.name, stage: "download", error: e.message });
        continue;
      }
      let wb;
      try {
        wb = xlsx.readWorkbook(buf, { maxSheets: MAX_SHEETS_PER_FILE });
      } catch (e) {
        errors.push({ file: file.name, stage: "parse", error: e.message });
        continue;
      }
      let added = 0;
      for (const sheet of wb.sheets) {
        if (!sheet.rows || !sheet.rows.length) continue;
        for (const fam of families) {
          const { header, records } = xlsx.toObjects(sheet.rows);
          const prov = {
            fileId: file.id, file: file.name, sheet: sheet.name,
            folder: file.folderPath, root: file.root, modified: file.modifiedTime,
          };
          if (fam.skipSheet && fam.skipSheet(sheet.name)) {
            ledger.add(prov, fam.key, "SKIPPED_SHEET", records.length, "sheet name matches this family's skip list");
            continue;
          }
          if (!header.length || !records.length) {
            ledger.add(prov, fam.key, "BLANK_ROW", records.length, "no header row detected");
            continue;
          }
          const sheetCtx = readSheetContext(fam, sheet.rows, xlsx.detectHeader(sheet.rows), prov);
          const mapped = mapRecords(records, header, fam, prov, ledger, sheetCtx);
          if (mapped.length) { registers[fam.key].push(...mapped); added += mapped.length; }
        }
      }
      sources.push({
        file: file.name, fileId: file.id, root: file.root, folder: file.folderPath,
        modified: file.modifiedTime, sheets: wb.sheets.length,
        families: families.map((f) => f.key), records: added,
      });
    }
    // ---- Deduplicate ----
    // The same register exists more than once in Drive: "Admin Contracts" and
    // "Other Contracts" overlap almost exactly, and several trackers have a
    // "(1)" copy alongside the original. Left alone the contracts register
    // roughly doubles, which would misstate every count on the page.
    //
    // Records are collapsed on a per-family identity, keeping the one from the
    // most recently modified file and remembering how many copies were seen and
    // where — so a duplicate is visible as provenance rather than silently
    // discarded.
    const duplicates = {};
    const conflicts = {};
    for (const fam of FAMILIES) {
      const rows = registers[fam.key] || [];
      if (!fam.identity || !rows.length) { duplicates[fam.key] = 0; conflicts[fam.key] = 0; continue; }
      const seen = new Map();
      const kept = [];
      let merged = 0, conflicted = 0;
      for (const r of rows) {
        const parts = fam.identity.map((f) => norm(r[f]));
        const filled = parts.filter(Boolean).length;
        // A TITLE ALONE IS NOT AN IDENTITY. "Project Promotion Agreement" with
        // no date and no counterparty describes dozens of separate instruments,
        // and merging them on that basis destroyed real contracts. Two or more
        // populated identity components are required before anything is
        // collapsed; anything weaker is kept as its own record and flagged.
        /* The alternative key is computed BEFORE the weak-identity test, not
           after it. Computing it after meant a row whose primary fields are
           sparse — "Project Promotion Agreement" with no dates and no
           counterparty — took the weak-identity exit and never reached the
           documents check, so twenty-nine agreements stayed duplicated despite
           naming exactly the same scanned files. A strong documents match is a
           perfectly good identity; it does not become a worse one because the
           date column happens to be blank. */
        const altEntries = [];
        for (const alt of (fam.altIdentities || [])) {
          const req = String(r[alt.requires] || "").trim();
          if (req.length >= (alt.minLength || 1)) {
            altEntries.push({ alt, key: "ALT" + alt.fields.join(",") + "|" + alt.fields.map((f) => norm(r[f])).join("|") });
          }
        }
        const altKeys = altEntries.map((e) => e.key);
        /* A KEY MAY BE A LOOK-ALIKE, SO A KEY MAY CARRY A GUARD.
           Identity by (type + start + documents) catches eight agreements
           recorded twice under different titles -- ref 95 "Vehicle Lease
           Agreement" and ref 137 "Lease Agreement" are one lease with one
           document between them. But the same key also collides on genuinely
           different agreements: "Lease Agreement SF14" and "Lease Agreement
           SF-11 (Square One)" are two units in one building, sharing a type, a
           start date and a documents column, and merging them would destroy a
           contract exactly as the four LDA City services agreements were once
           nearly destroyed. So an alt identity may carry `compatible`, and a
           match that fails it is not a match at all. */
        const altMatch = (() => {
          for (const e of altEntries) {
            const cand = seen.get(e.key);
            if (!cand) continue;
            if (e.alt.compatible && !e.alt.compatible(cand, r, norm)) continue;
            return { prev: cand, alt: e.alt };
          }
          return null;
        })();
        /* HAVING AN IDENTITY IS NOT THE SAME AS COLLIDING WITH ONE.
           The test asked "did this row match something?" — so a record with a
           perfectly good alternative identity that happens to be the only one
           of its kind was still flagged WEAK IDENTITY. A refund claim with a
           named buyer and a named project is identified; it simply has no
           duplicate. What makes an identity weak is having nothing to identify
           WITH, so the question is whether an alternative key could be built at
           all, not whether it found a partner. */
        if (filled < 2 && !altMatch && !altEntries.length) {
          r.__weakIdentity = true;
          /* §13 — an exhaustive statement, not a badge. What the row DOES
             carry is listed, because "weak identity" on its own tells a reader
             nothing about whether anything can be done. */
          const carried = Object.keys(cmapKeys(fam)).filter((f) => norm(r[f]))
            .reduce((o, f) => (o[f] = String(r[f]).slice(0, 60), o), {});
          r.__identityNote = {
            state: "IDENTITY_NOT_EVIDENCED_IN_SOURCE",
            detail: "The source row populates fewer than two of this register's identifying fields ("
              + (fam.identity || []).join(", ") + "), and the alternative identities this register accepts ("
              + (fam.altIdentities || []).map((a) => a.fields.join("+")).join(", ") + ") need a field this row "
              + "leaves blank. Everything the row does carry is listed below; the estate cannot be searched on "
              + "it because none of it names a party or an instrument.",
            populated: (fam.identity || []).filter((f) => norm(r[f])),
            carries: carried,
            /* §8 — the searches actually performed, so nobody repeats them.
               Every value the row carries was used as a search term against the
               whole Drive estate (file and folder names, all five roots) and
               against every other row in this register. */
            searchedBy: Object.keys(carried),
            searchedIn: "every file and folder name in all five Drive roots, and every other row in this register",
            searchOutcome: "No object in the estate carries any of these values in a way that identifies a party "
              + "or an instrument for this row.",
          };
          r.__quality = r.__quality === "INCOMPLETE_SOURCE" ? r.__quality : "WEAK_IDENTITY";
          /* Still registered under its documents key, so the NEXT copy of the
             same agreement recognises this one instead of adding a third.
             It must carry the same copy-tracking fields as any other kept row —
             without them the later match dereferences an undefined __alsoIn and
             takes the whole rebuild down. */
          r.__copies = 1; r.__alsoIn = [];
          for (const k of altKeys) if (!seen.has(k)) seen.set(k, r);
          kept.push(r);
          continue;
        }
        /* AN EMPTY KEY IS NOT A KEY.
           Where a row populates NONE of the primary identity fields, the joined
           key is "||" — and every other such row joins to exactly the same
           string. Letting those match collapsed eighteen separate refund claims
           into one record. A row with nothing in the primary identity is
           matched on its alternative identity or not at all. */
        const key = filled === 0 ? null : parts.join("|");
        /* A GUARD ON THE PRIMARY KEY, NOT ONLY ON THE ALTERNATIVES.
           `compatible` already protected the alternative identities, where a
           look-alike key was a known hazard. The primary key had no such
           protection, and it merges on title + type + dates — which is exactly
           what two different tenants leasing the same floor of the same
           building on the same day have in common. Forty-two contracts were
           being collapsed into twenty-one that way: each pair pointed at a
           completely different set of executed PDFs, and the register reported
           the survivor with the loser's documents listed as a "conflict".
           They were never one contract, so this is not conflict resolution —
           it is undoing a merge that should not have happened. */
        const primaryPrev = key == null ? null : seen.get(key);
        const primaryOk = primaryPrev && (!fam.compatible || fam.compatible(primaryPrev, r, norm));
        const prev = (primaryOk ? primaryPrev : null) || (altMatch && altMatch.prev) || null;
        if (primaryPrev && !primaryOk && !prev) {
          /* Distinct after all. Keep it as its own record and remember why, so
             the pair can be inspected rather than taken on trust. */
          r.__copies = 1; r.__alsoIn = [];
          r.__notMergedWith = { id: primaryPrev.id, reason: "documents are entirely different instruments" };
          for (const k of altKeys) if (!seen.has(k)) seen.set(k, r);
          kept.push(r); continue;
        }
        if (!prev) {
          r.__copies = 1; r.__alsoIn = [];
          if (key != null) seen.set(key, r);
          for (const k of altKeys) seen.set(k, r);
          kept.push(r); continue;
        }
        for (const k of altKeys) if (!seen.has(k)) seen.set(k, prev);

        // Same identity, two source rows. Record the copy, and where the two
        // disagree KEEP BOTH VALUES rather than letting the newer file silently
        // overwrite a figure someone may rely on.
        merged++;
        prev.__copies = (prev.__copies || 1) + 1;
        if (prev.__source && r.__source && prev.__source.file !== r.__source.file &&
            !prev.__alsoIn.includes(r.__source.file)) prev.__alsoIn.push(r.__source.file);

        /* ONE LOGICAL CONTRACT, EVERY SOURCE COPY KEPT.
           Deduplication collapses what the register SHOWS; it must not throw
           away where the rows came from. Each copy keeps its workbook, sheet,
           row and the id it used to have, so a merged record can be taken back
           apart, an old link can still be resolved, and Data Health can show
           "4 source copies" instead of a number nobody can check.
           The documents each copy cited are kept as lineage too -- as evidence
           of the relationship, NOT as an authorization input: what a person may
           open is recorded per document and no longer moves when records do. */
        prev.__sourceCopies = (prev.__sourceCopies || [Object.assign({
          legacyRecordId: prev.id, moduleFamily: fam.key,
          originalDocumentCitations: String(prev.documents || ""),
        }, prev.__source || {})]).concat([Object.assign({
          legacyRecordId: r.id, moduleFamily: fam.key,
          originalDocumentCitations: String(r.documents || ""),
        }, r.__source || {})]);
        prev.__legacyIds = [...new Set([...(prev.__legacyIds || []), r.id].filter(Boolean))];

        const differing = [];
        for (const f of Object.keys(r)) {
          if (f.startsWith("__") || f === "id" || f === "driveFiles") continue;
          /* A SERIAL NUMBER IS NOT A BUSINESS FACT.
             Each workbook numbers its own rows, and the two families number the
             same agreement differently — "First Amendment of Grand Square" is
             1162 in Admin/Other and 231 in the Finder's Fee tracker. Treating
             that as a conflicting value marked 584 of 1,059 records
             CONFLICTING_SOURCE on 1,311 instances, which buried the 226 real
             disagreements about documents, values and dates underneath it.
             The other serials are kept as lineage on __serials, where they
             belong, and the record is no longer called conflicted for having
             been numbered twice. */
          if (f === "ref") {
            const alt = String(r[f] || "").trim();
            if (alt && alt !== String(prev[f] || "").trim()) {
              prev.__serials = [...new Set([...(prev.__serials || [String(prev[f] || "").trim()].filter(Boolean)), alt])];
            }
            continue;
          }
          const a = r[f], b = prev[f];
          if (a === "" || a == null || b === "" || b == null) continue;
          if (String(a).trim() === String(b).trim()) continue;
          /* SPELLING IS NOT DISAGREEMENT.
             "Lease Agreement" / "Lease agreement", "Non-Disclosure" / "Non-
             Disclosure", "ZIMS Security Pvt. Ltd" with and without the closing
             full stop: one value typed twice by two people. Flagging those as a
             source conflict sends someone to compare two identical contracts,
             and it hides the differences that matter -- a start date two years
             apart, a first party that is a different company, a value that is
             double. Compared on a canonical form; both spellings are KEPT, and
             nothing in Drive or in the workbook is rewritten.
             Deliberately shallow: it folds case, punctuation and runs of
             whitespace and nothing else, so "Sahiwal" and "Bahawalpur" remain
             the conflict they are. */
          const canon = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          if (canon(a) === canon(b)) {
            prev.__spellingVariants = prev.__spellingVariants || {};
            prev.__spellingVariants[f] = [...new Set([...(prev.__spellingVariants[f] || [String(b)]), String(a)])];
            continue;
          }
          /* Both values are kept, and WHY one of them is canonical is recorded
             with them — otherwise "kept" reads as an arbitrary preference and
             nobody can tell whether the register is showing the current figure
             or a stale one. */
          differing.push({
            field: f, kept: b, alternative: a,
            from: (r.__source || {}).file, row: r.__row,
            keptFrom: (prev.__source || {}).file || null,
            keptModified: (prev.__source || {}).modified || null,
            alternativeModified: (r.__source || {}).modified || null,
            resolvedBy: "SOURCE_PRECEDENCE_MOST_RECENTLY_MODIFIED_WORKBOOK",
          });
        }
        if (differing.length) {
          conflicted++;
          prev.__conflicts = (prev.__conflicts || []).concat(differing);
          /* A RESOLVED DISAGREEMENT IS NOT AN OPEN ONE.
             Every one of these conflicts was decided — the canonical value came
             from the more recently maintained workbook, and the value that lost
             is kept beside it with both dates. Leaving the record marked
             CONFLICTING said the opposite: that somebody still has to choose.
             So the two ideas are now separate. The HISTORY of the disagreement
             lives on __conflicts and never goes away. The record's operational
             QUALITY reflects whether anything is still open.
             Precedence can only decide when the two sources are actually
             distinguishable. Where both workbooks carry the same modification
             time — or neither carries one — there is no rule to apply and the
             record stays CONFLICTING, because it genuinely is. */
          const decidable = differing.filter((c) => c.keptModified && c.alternativeModified
            && c.keptModified !== c.alternativeModified);
          const undecided = differing.filter((c) => !(c.keptModified && c.alternativeModified
            && c.keptModified !== c.alternativeModified));
          prev.__hadSourceConflict = true;
          prev.__sourceConflictFields = [...new Set((prev.__conflicts || []).map((c) => c.field))];
          /* SECOND TIER: THE EXECUTED DOCUMENT DECIDES A TERM.
             Where a record's linked document is an amendment, a renewal or an
             extension, and the two competing date ranges run in sequence, they
             are not a disagreement at all — they are the original term and the
             amended one. The instrument in force is the later of the two, so
             that becomes canonical and the original is kept as the prior term.
             Deliberately narrow: it requires an amending document AND ranges
             that actually follow one another. Two unrelated dates on the same
             contract are still a conflict. */
      const amending = /amend|addend|renew|extension|supplement/i.test(String(prev.documents || ""));
      const asDate = (v) => { const t = Date.parse(String(v).slice(0, 10)); return isNaN(t) ? null : t; };
      let stillOpen = undecided;
      /* TWO TERMS THAT ABUT ARE A RENEWAL, NOT A DISAGREEMENT.
         Where the second range begins within a week of the first one ending,
         the tracker has recorded the original term and its renewal — the same
         shape as the amendment case above, without the word "amendment" in the
         file name. The window is deliberately a week rather than a month: at
         that distance the two ranges are demonstrably continuous, which is what
         makes them one agreement rather than two values for one field. */
      const abutting = !amending && undecided.length;
      if ((amending || abutting) && undecided.length) {
        const st = undecided.find((c) => c.field === "start");
        const en = undecided.find((c) => c.field === "end");
        const ks = st && asDate(st.kept), as_ = st && asDate(st.alternative);
        const ke = en && asDate(en.kept), ae = en && asDate(en.alternative);
        const DAY = 86400000;
        const sequential = ks && as_ && ke && ae && as_ > ks && ae > ke && ae > as_
          && Math.abs(as_ - ke) <= (amending ? 35 : 7) * DAY;
        if (sequential) {
          prev.__priorTerm = { start: st.kept, end: en.kept, from: "the original agreement" };
          prev.start = st.alternative;
          prev.end = en.alternative;
          prev.__conflictResolution = {
            state: amending ? "RESOLVED_LATEST_AMENDMENT" : "RESOLVED_SUCCESSIVE_TERM",
            rule: amending ? "the amending instrument on file governs the term"
              : "the two terms are continuous, so the later one is the term in force",
            detail: "The two ranges run in sequence and the document on this record is an amendment, so the later "
              + "range is the term in force. The original term is kept as __priorTerm.",
          };
          stillOpen = undecided.filter((c) => c !== st && c !== en);
        }
      }
          if (stillOpen.length) {
            prev.__quality = "CONFLICTING_SOURCE";
            prev.__unresolvedConflicts = (prev.__unresolvedConflicts || []).concat(stillOpen.map((c) => ({
              field: c.field, kept: c.kept, alternative: c.alternative,
              keptFrom: c.keptFrom || null, alternativeFrom: c.from || null,
              /* Say precisely why the rules did not reach it, so the person who
                 picks it up knows what to open rather than starting over. */
              why: (c.keptFrom && c.from && c.keptFrom === c.from)
                ? "Both rows are in the same workbook, so neither recency nor source precedence separates them. "
                  + "They have to be compared against the executed document."
                : (!c.keptModified || !c.alternativeModified)
                  ? "At least one of the two workbooks carries no modification time, so recency cannot be applied."
                  : "Both workbooks were last modified at the same moment, so recency cannot decide between them.",
            })));
          } else if (prev.__quality !== "INCOMPLETE_SOURCE" && prev.__quality !== "CONFLICTING_SOURCE") {
            prev.__quality = undefined;
            /* A MORE SPECIFIC RULE ALREADY DECIDED — DO NOT OVERWRITE IT.
               Where the amending instrument or the successive-term rule closed
               the conflict, that is what resolved it, and saying "source
               precedence" instead loses the actual reason. Recency is the
               fallback, not the headline. */
            prev.__conflictResolution = prev.__conflictResolution || {
              state: "RESOLVED_BY_SOURCE_PRECEDENCE",
              rule: "the most recently modified workbook is canonical",
              fields: decidable.length,
              detail: "Both values are on file; the one shown comes from the workbook the team has kept up to date.",
            };
          }
        }
        if (ledger) ledger.add(r.__source || {}, fam.key, "MERGED_DUPLICATE", 1, "same identity as " + prev.id);
      }
      duplicates[fam.key] = merged;
      conflicts[fam.key] = conflicted;
      registers[fam.key] = kept;
    }

    // ---- Attach the scanned documents ----
    // The contracts tracker NAMES its documents (a filenames column) and the
    // same department's Drive folders HOLD them. Resolve each record against
    // the Drive index — by document filename first, then by the project's own
    // folder — so a contract carries links to its actual scanned copies.
    // Coverage is honest: the pre-2020 CPML-era scans were never uploaded, so
    // roughly 4 in 10 records resolve today and the rest stay empty rather
    // than guessing.
    attachDriveFiles(registers.contracts || []);
    attachLitigationDocs(registers.litigation || []);
    attachNoticeDocs(registers.notices || []);
    attachComplianceDocs(registers);
    applyContentLinks(registers);
    applyCommercialReattach(registers);
    applyVisionPlacements(registers);
    const prunedLinks = pruneSharedLinks(registers);
    dropEmptyDerivedResolutions(registers);
    const prunedTemplates = pruneTemplateLibraryFiles(registers);
    const localCases = mergeLocalLitigationCases(registers);
    applyCaseOutcomes(registers);
    const localNotices = mergeLocalNotices(registers);
    /* THE DIRECTION IS DERIVED ON EVERY PATH, NOT JUST THE CACHED ONE.
       This ran only where a saved register state is rehydrated, so on a COLD
       build — a fresh install, a cleared cache, any sandbox — not one notice
       carried a direction: the Received / Sent bifurcation that leads this
       register reported 0 and 0 against 255 notices, and the cut buttons
       filtered the whole book down to nothing. The same estate produced two
       different registers depending on which code path happened to assemble
       it. It runs here too, after the LegalOS-recorded notices are merged in,
       so rows raised in the app are read the same way as tracker rows. */
    try { deriveNoticeDirection(registers); } catch (e) { /* a missing direction is not a build failure */ }
    /* GO AND LOOK IN DRIVE FOR WHAT THE TRACKER LEFT BLANK (§20/§51/§70).
       Until this ran, a blank required column produced INCOMPLETE and the
       matter ended there — even where the estate held a folder named with the
       case's actual cause title. Anything resolved here is adopted from a real
       Drive object and records which one; anything that cannot be resolved is
       marked NOT_EVIDENCED_IN_SOURCE with what was searched for, which is a
       finding rather than a gap. */
    const resolvedFromDrive = resolveMissingFromDriveToFixedPoint(registers);
    /* Classify AFTER resolution, so a matter whose forum was recovered from
       Drive is judged on the recovered value. */
    const documentResolvedConflicts = resolveConflictsFromDocument(registers);
    const matterClasses = classifyMatters(registers);
    /* Archived records are stamped BEFORE quality and documents are counted,
       so an archived row is never reported as live work. */
    const archived = require("./archive").applyTo(registers);
    const documentStates = dispositionDocuments(registers);
    const qualityStates = finalQualityStates(registers);

    annotateContent(registers);
    const stale = revalidateLinks(registers);
    const linkStats = linkDiagnostics(registers);
    const docClass = classifyDocuments(registers);


    // Roll the ledger up so every raw row is accounted for.
    const byDisposition = {};
    const byFamilyDisposition = {};
    for (const e of ledger.rows) {
      byDisposition[e.disposition] = (byDisposition[e.disposition] || 0) + e.count;
      const f = (byFamilyDisposition[e.family] = byFamilyDisposition[e.family] || {});
      f[e.disposition] = (f[e.disposition] || 0) + e.count;
    }
    // MERGED_DUPLICATE is not a separate raw row — it is an already-counted
    // INGESTED_RECORD that later collapsed into another. Summing it here would
    // double-count, so the raw total excludes it and the record total subtracts
    // it. These two lines are the reconciliation the whole ledger exists for.
    const RAW_BUCKETS = ["INGESTED_RECORD", "INCOMPLETE_SOURCE_RECORD", "BLANK_ROW", "PADDING_ROW", "NOT_A_REGISTER_SHEET", "SKIPPED_SHEET", "UNKNOWN_DROP"];
    const rawRowsSeen = RAW_BUCKETS.reduce((a, k) => a + (byDisposition[k] || 0), 0);
    /* NOT EVERY RECORD COMES FROM A ROW.
       This equation assumed the register is exactly what the trackers say, so
       any record with no source row read as a discrepancy. Two kinds legitimately
       have none:

         FOLDER-DERIVED  a company that files in Drive without maintaining the
                         summary sheet still has resolutions -- Dubizzle Labs'
                         whole board history, and eight of Zameen Medallion's.
                         The folder is the source index; a spreadsheet is not
                         required before a record may exist.

         LEGALOS-NATIVE  a case raised here by the legal team. It was never
                         ingested from anywhere.

       Counting them makes the ledger reconcile because it is TRUE, not because
       the difference was hidden: each is counted from the records themselves and
       reported separately below. */
    const originCount = (pred) => FAMILIES.reduce((n, f) =>
      n + (registers[f.key] || []).filter(pred).length, 0);
    const folderDerivedRecords = originCount((r) => r && /_SOURCE_DRIVE$/.test(String(r.origin || "")));
    const nativeRecords = originCount((r) => r && (r.__sourceType === "LEGALOS_NATIVE" || r.__origin === "LEGALOS"));
    const reconciles = ((byDisposition.INGESTED_RECORD || 0) + (byDisposition.INCOMPLETE_SOURCE_RECORD || 0)
      - (byDisposition.MERGED_DUPLICATE || 0) + folderDerivedRecords + nativeRecords);
    const recordsOut = FAMILIES.reduce((n, f) => n + (registers[f.key] || []).length, 0);

    /* A DEGRADED INGEST MUST NOT OVERWRITE A HEALTHY REGISTER.
       The Drive index is protected from a throttled crawl, but the registers
       were not: when Drive answers with HTTP 429 the candidate list shrinks,
       fewer workbooks are read, and this rebuild produces a partial book —
       licences 7 -> 0, properties 38 -> 0, contracts 1,371 -> 1,060 — which was
       then SAVED over the good one. Whole modules go empty and nothing says
       why. If this pass came back materially smaller while Drive was unhealthy
       or workbooks failed to download, keep what we already had and report it. */
    const prevTotal = FAMILIES.reduce((n, f) => n + ((state.registers && state.registers[f.key]) || []).length, 0);
    const newTotal = FAMILIES.reduce((n, f) => n + (registers[f.key] || []).length, 0);
    const dstat = drive.status ? drive.status() : {};
    const driveUnhealthy = !!(dstat.degraded || dstat.unreadableFolders || dstat.error);
    const downloadFailures = errors.filter((e) => e.stage === "download" || e.stage === "parse").length;
    const lostAFamily = FAMILIES.some((f) => ((state.registers && state.registers[f.key]) || []).length > 0 && (registers[f.key] || []).length === 0);
    if (prevTotal > 0 && (newTotal < prevTotal * 0.95 || lostAFamily) && (driveUnhealthy || downloadFailures)) {
      state.building = false;
      state.lastDegradedIngest = {
        at: new Date().toISOString(), heldRecords: prevTotal, wouldHaveBeen: newTotal,
        driveUnhealthy, downloadFailures,
        reason: "ingest came back " + (prevTotal - newTotal) + " record(s) short while Drive was unhealthy — previous registers kept",
      };
      console.error("[registers] " + state.lastDegradedIngest.reason);
      return state;
    }

    /* The state object is replaced wholesale here, so anything set on it before
       the build must be carried across explicitly — the parser gate's verdict
       was silently dropped the first time. */
    state = { builtAt: Date.now(), building: false, registers, sources, errors, duplicates, conflicts,
      parserGate: gate, degraded: null,
      ledger: ledger.rows, documents: docClass.files, lastDegradedIngest: null,
      diagnostics: Object.assign({
        resolvedFromDrive, matterClasses, qualityStates, documentStates, documentResolvedConflicts, archived,
        prunedFuzzyLinks: prunedLinks,
        templateFilesDetachedFromRecords: prunedTemplates,
        litigationCasesRaisedInApp: localCases,
        noticesRecordedInApp: localNotices,
        staleLinksRemoved: stale.removed,
        documentDispositions: docClass.counts,
        rowDispositions: byDisposition,
        rowDispositionsByFamily: byFamilyDisposition,
        rawRowsSeen, recordsOut,
        expectedRecords: reconciles,
        // The two populations that have no source row, shown rather than absorbed.
        folderDerivedRecords, nativeRecords,
        reconciled: reconciles === recordsOut,
        unknownDrop: byDisposition.UNKNOWN_DROP || 0,
        incompleteRecords: FAMILIES.reduce((n, f) => n + (registers[f.key] || []).filter((r) => r.__quality === "INCOMPLETE_SOURCE").length, 0),
        conflictingRecords: FAMILIES.reduce((n, f) => n + (registers[f.key] || []).filter((r) => r.__quality === "CONFLICTING_SOURCE").length, 0),
        weakIdentityRecords: FAMILIES.reduce((n, f) => n + (registers[f.key] || []).filter((r) => r.__weakIdentity).length, 0),
      }, linkStats) };
    saveCache();
  } catch (e) {
    // A rebuild that THREW (Drive throttling, a network drop) leaves the previous
    // registers in place — which is right — but it must not do so silently, or
    // Data Health reports a healthy book that is quietly ageing. Record it the
    // same way a rejected degraded ingest is recorded.
    state.building = false;
    errors.push({ stage: "rebuild", error: e.message });
    state.errors = errors;
    const heldNow = FAMILIES.reduce((n, f) => n + ((state.registers && state.registers[f.key]) || []).length, 0);
    state.lastDegradedIngest = {
      at: new Date().toISOString(), heldRecords: heldNow, wouldHaveBeen: null,
      driveUnhealthy: true, downloadFailures: errors.length,
      reason: "ingest failed (" + String(e.message).slice(0, 120) + ") — previous registers kept",
    };
    console.error("[registers] rebuild failed:", e.message);
  }
  return state;
}

// Same stale-while-revalidate contract as the Drive index: never make a person
// wait for an ingest that reads twenty workbooks.
async function ensure() {
  const cfg = load();
  const ttl = (cfg.drive.refreshMinutes || 15) * 60 * 1000;
  if (!state.builtAt) return rebuild(true);
  if (Date.now() - state.builtAt > ttl && !state.building) {
    rebuild(true).catch((e) => console.error("[registers] background refresh:", e.message));
  }
  return state;
}

async function get(key) {
  const s = await ensure();
  /* RECONCILED ON READ, NOT ONLY ON BUILD.
     Merging cases raised in the app at build time loses a race that happens
     every time somebody raises one: reading the register kicks off a background
     rebuild, and if that rebuild is already past its own merge step when the
     case is written, it finishes afterwards and REPLACES the state the case was
     merged into. The case is saved, the author is looking at the register, and
     it is not there.
     The merge is idempotent -- it drops LegalOS-origin rows and re-adds them
     from the store -- so doing it here costs one pass over the family and makes
     the answer correct whatever the build happens to be doing. */
  if (key === "litigation" && s.registers && Array.isArray(s.registers.litigation)) {
    try { mergeLocalLitigationCases(s.registers); applyCaseOutcomes(s.registers); }
    catch (e) { /* a read must never fail because a raised case could not merge */ }
  }
  if (key === "notices" && s.registers && Array.isArray(s.registers.notices)) {
    try { mergeLocalNotices(s.registers); }
    catch (e) { /* likewise: a read must not fail because a notice could not merge */ }
  }
  /* THE LOAN AND LICENCE REGISTERS ARE RECONCILED ON READ TOO, and for a
     different reason: they are DERIVED, and a derived register must not be
     persisted beside the source it is derived from. Building it into the cache
     worked and then quietly broke, because the cache merges across rebuilds --
     the previous run's 69 logical loans merged into the next run's 192 raw
     rows and the document counts drifted between builds.

     So the cache keeps exactly one loans dataset: the 192 raw tracker rows,
     which is what the model reconciles from and what every attachment pass
     writes into. The 69 logical loans are computed here, on the way out.

     WHY THIS MATTERS AT ALL: the FDI and intercompany trackers hold 60 loan
     agreements, 117 lifecycle events on those agreements (amendments,
     novations, rollovers, repayments) and 15 rows of spreadsheet furniture.
     Publishing the sheet row by row put all 192 in the loans register, so the
     same business had 69 loans on the Compliance screen and 192 here, and the
     difference was its own amendments counted a second time as new debt. */
  if (key === "loans" || key === "licences") {
    try {
      const reconciled = await reconcileComplianceRead(key, s);
      if (reconciled) return reconciled;
    } catch (e) { /* a read must never fail because the model could not build */ }
  }
  return s.registers[key] || [];
}

/* Cached per build, because the model is not cheap and the register is read on
   every page. Keyed on the build stamp so a rebuild invalidates it. */
const COMPLIANCE_READ_CACHE = new Map();
async function reconcileComplianceRead(key, s) {
  const stamp = String((s && s.builtAt) || "") + "|" + key;
  if (COMPLIANCE_READ_CACHE.has(stamp)) return COMPLIANCE_READ_CACHE.get(stamp);
  const model = require("./compliance-model");
  let out = null;
  if (key === "loans") {
    const built = await model.buildLoans(s);
    out = (built && built.agreements && built.agreements.length) ? built.agreements : null;
  } else {
    const built = await model.buildLicences(s);
    out = (built && built.licences && built.licences.length) ? built.licences : null;
  }
  if (COMPLIANCE_READ_CACHE.size > 8) COMPLIANCE_READ_CACHE.clear();
  COMPLIANCE_READ_CACHE.set(stamp, out);
  return out;
}

async function summary() {
  const s = await ensure();
  return {
    builtAt: s.builtAt,
    counts: Object.fromEntries(FAMILIES.map((f) => [f.key, (s.registers[f.key] || []).length])),
    labels: Object.fromEntries(FAMILIES.map((f) => [f.key, f.label])),
    duplicates: s.duplicates || {},
    diagnostics: s.diagnostics || null,
    lastDegradedIngest: s.lastDegradedIngest || null,
    surfaces: SURFACES,
    sources: s.sources,
    errors: s.errors,
  };
}


// Normalised-name and folder-segment lookups over the Drive index, rebuilt on
// each ingest (the index may have changed under it).
const GENERIC_TITLES = new Set([
  "projectpromotionagreement", "servicesagreement", "consultancyagreement",
  "ppa", "memorandumofunderstanding", "settlementagreement", "firstamendment",
  "secondamendment", "thirdamendment", "leaseagreement", "terminationagreement",
  "findersfeeagreement", "jointventureagreement", "untitledagreement", "sa",
]);
/* Drive appends " (1)" to a duplicate upload, so the tracker's cited
   "Lease Agreement - Rawalpindi MALL 35-GF,FF SF.pdf" never equalled the stored
   "… SF (1).pdf" and the record fell through to guessing. The suffix is Drive's,
   not part of the document's name, so it is dropped before comparing. */
const normName = (v) => String(v == null ? "" : v).toLowerCase()
  .replace(/\.(pdf|docx?|xlsx?|jpe?g|jfif)$/i, "")
  .replace(/\s*\(\d{1,2}\)\s*$/, "")
  .replace(/[^a-z0-9]/g, "");

// Tokeniser for fuzzy document matching. Splits camelCase and letter/digit
// runs so "LeaseAgreement8thFloorMegatower" and "Lease Agreement 8th Floor Mega
// Tower" share tokens, drops the boilerplate words every contract carries, and
// keeps only tokens of length >= 3.
const DOC_STOP = new Set(("agreement agreements zameen media the and for of to pvt private limited ltd smc pdf docx doc xlsx first second third fourth fifth sixth amendment addendum extension termination letter deed dated final draft copy signed scan scanned document documents contract contracts tracker between with dev developments medallion vault").split(" "));
function docTokens(s) {
  return String(s == null ? "" : s)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|jpe?g|jfif)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    // A number is part of a property's name — "MALL 35" is not "SILK MALL", and
    // dropping the 35 made them the same document to this matcher. Two digits is
    // the shortest meaningful one (floor, phase, block, building number).
    .filter((t) => (t.length >= 3 || (t.length === 2 && /^\d+$/.test(t))) && !DOC_STOP.has(t));
}

/* Words that two unrelated documents share simply by being about property in
   Pakistan. They may still add to a score, but one of them can never be the
   evidence that links a record to a file: "rawalpindi" + "mall" gave a
   Rawalpindi lease the Silk Mall advertising addendum. A place is not a party. */
const WEAK_ANCHOR = new Set(("lahore karachi islamabad rawalpindi peshawar multan faisalabad quetta "
  + "sialkot gujranwala hyderabad bahawalpur sargodha abbottabad mardan gujrat sahiwal okara "
  + "cantt cantonment punjab sindh balochistan pakistan north south east west central "
  + "region zone phase block sector plot floor floors ground first second mezzanine "
  + "office offices building buildings plaza tower towers mall malls market road street "
  + "main branch city town area park heights residency residencia arcade centre center").split(" "));

/* Which Drive roots a COMMERCIAL contract's documents can live in.
   A contract's papers are filed under the commercial roots. They are not in
   Compliance Data and not in Litigation, and letting the matcher look there is
   how 74 contracts came to claim a board-minutes PDF out of
   "Compliance Data _LegalOS / Resolutions / Ztech …_Resolutions and
   Authorizations". That is wrong twice over: the Documents tab shows papers
   belonging to someone else's matter, and because document authorization treats
   a file cited by several families as readable by ANY of them, compliance
   material became readable with commercial access. */
const COMMERCIAL_ROOT_RE = /^Commercial[_\s]/i;

function attachDriveFiles(records) {
  // Exclude tracker spreadsheets and editor artefacts — they are the SOURCE, not
  // a contract's document, and a shared "000_Tracker.xlsx" was being attached to
  // dozens of contracts. isDocFile drops xlsx/~$/.tmp/dotfiles.
  const allDocs = drive.indexFiles().filter(isDocFile);
  const files = allDocs.filter((f) => COMMERCIAL_ROOT_RE.test(f.root || ""));
  if (!files.length || !records.length) return;
  /* A filename WRITTEN IN THE TRACKER is the source stating which document this
     is — evidence, not similarity — so it is honoured wherever the file lives.
     Half the lease records cite documents that sit under Spend Contracts, and
     scoping this lookup to the Commercial roots meant those citations resolved
     to nothing and the record fell through to the fuzzy stage, which handed it
     whatever Commercial file shared a word. Guessing is scoped; being told is
     not. */
  const byFname = new Map();
  for (const f of allDocs) {
    const n = normName(f.name);
    if (n && !byFname.has(n)) byFname.set(n, f);
  }
  const byFolderSeg = new Map();
  // Token index for fuzzy matching: file tokens, document frequency (for IDF),
  // and an inverted token -> file-index map.
  const fileTok = new Array(files.length);
  const df = new Map();
  const inv = new Map();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    for (const seg of String(f.folderPath || "").split(" / ")) {
      const k = normName(seg);
      if (k.length < 6) continue;
      if (!byFolderSeg.has(k)) byFolderSeg.set(k, []);
      const arr = byFolderSeg.get(k);
      // Was capped at 60 files per folder segment, which silently truncated the
      // documentary record of any well-populated project folder — the Documents
      // tab then showed a subset with no indication anything was missing. A
      // record's own folder is a deterministic link, so keep all of it; the
      // ceiling here only guards against a pathological folder.
      if (arr.length < 1000) arr.push(f);
    }
    const lastSeg = String(f.folderPath || "").split(" / ").slice(-1)[0] || "";
    const ts = new Set(docTokens(f.name + " " + lastSeg));
    fileTok[i] = ts;
    for (const t of ts) {
      df.set(t, (df.get(t) || 0) + 1);
      let a = inv.get(t); if (!a) inv.set(t, (a = [])); a.push(i);
    }
  }
  const segKeys = [...byFolderSeg.keys()];
  const N = files.length;
  const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
  const lite = (f, via, score) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0, folderPath: f.folderPath || "", webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "", via, score: score == null ? undefined : Math.round(score * 1000) / 1000 });

  for (const r of records) {
    const got = new Map();
    // 1) the documents column, split the way the cells are actually written
    for (const d of String(r.documents || "").split(/\s*\n\s*|(?<=\.pdf)\s+|(?<=\.PDF)\s+|(?<=\.docx)\s+/)) {
      const n = normName(d);
      if (!n) continue;
      const f = byFname.get(n);
      if (f && !got.has(f.id)) got.set(f.id, lite(f, "filename"));
    }
    // 2) the project's own folder in Drive. Matching runs on the PROJECT CORE —
    // the title minus its generic words — because "First Amendment of River
    // Courtyard" must find the River Courtyard folder, and must NOT match a
    // folder that is itself called "First Amendment" (there is one, full of
    // unrelated loan papers).
    const core = normName(String(r.title || "").replace(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|amendments?|addendums?|extension|termination|letter|agreement|deed|of|the|to|for|ppa)\b/gi, " "));
    if (core && core.length >= 8 && !GENERIC_TITLES.has(core)) {
      let cands = byFolderSeg.get(core);
      if (!cands) {
        /* Fall back to a folder whose name BEGINS with the project core, not
           merely contains it anywhere. `.includes()` let a short core match the
           tail of an unrelated folder — "ztech" found
           "…Ztech…_Resolutions and Authorizations" — and the record then took
           that whole folder. A prefix is the difference between "this is that
           project's folder" and "these two names share a word". */
        const k = segKeys.find((x) => x.startsWith(core) && x.length - core.length <= 24);
        if (k) cands = byFolderSeg.get(k);
      }
      // Everything in the record's OWN folder belongs to the record. This used
      // to stop at 40, so a project with more documents than that showed an
      // arbitrary 40 of them.
      for (const f of cands || []) {
        if (!got.has(f.id)) got.set(f.id, lite(f, "project-folder"));
      }
    }
    // 3) fuzzy token match against the whole index — this is what links the bulk
    // of the book, where the cited filename is mangled ("LeaseAgreement8thFloor…")
    // but shares distinctive words with the real Drive file. A file is accepted
    // only when it shares >= 2 tokens AND at least one is distinctive (appears in
    // <= 25 files) or it shares >= 3 tokens — so a stray common word never links
    // an unrelated document. Ranked by IDF weight, the strongest few are kept.
    /* If the source named its documents and we found them, we are done. Fuzzy
       matching exists for the records whose citation is mangled or missing; it
       has no business adding "close enough" files to a record whose documents
       the tracker already identified exactly. */
    const cited = [...got.values()].some((d) => d.via === "filename");
    if (!cited && got.size < 3) {
      const q = new Set([...docTokens(r.documents), ...docTokens(r.title)]);
      if (q.size) {
        const score = new Map(), shared = new Map(), anchor = new Map();
        for (const t of q) {
          const w = idf(t), rare = (df.get(t) || 0) <= 25;
          // An ANCHOR is a shared word that could only be this agreement's: rare
          // in the corpus, and not one of the place or building words every
          // property document carries.
          const anchors = rare && !WEAK_ANCHOR.has(t);
          for (const fi of inv.get(t) || []) {
            score.set(fi, (score.get(fi) || 0) + w);
            shared.set(fi, (shared.get(fi) || 0) + 1);
            if (anchors) anchor.set(fi, (anchor.get(fi) || 0) + 1);
          }
        }
        const ranked = [...score.entries()]
          .filter(([fi]) => (shared.get(fi) || 0) >= 2 && (anchor.get(fi) || 0) >= 1)
          .sort((a, b) => b[1] - a[1]);
        for (const [fi, sc] of ranked) {
          if (got.size >= 6) break;
          const f = files[fi];
          // Carry the match strength: when the same document is fuzzy-matched by
          // several records, the prune keeps it on the strongest one instead of
          // throwing it away everywhere.
          if (!got.has(f.id)) got.set(f.id, lite(f, "match", sc));
        }
      }
    }
    if (got.size) r.driveFiles = [...got.values()];
  }
}

// Attach the case-file set to each litigation record. A case's documents live in
// its own folder under the Litigation Drive root ("Litigation Files / Civil
// Disputes / <case>"), so the match is folder-level: the case name is scored
// against each folder (its leaf name + the files in it, IDF-weighted so a
// distinctive party name carries the match), and the whole winning folder's
// documents are attached. Scoped to the litigation root so a "Mall 35" case
// never pulls in the commercial Mall 35 contracts.
// Stop the group-company words too: a case with no folder of its own must not
// match an unrelated folder just because both say "Zameen.com" / "Zameen Media".
// After stripping these, a match rests on the actual party name (the plaintiff /
// opponent), so mismatches like "Muhammad Naveed vs Zameen.com" → "Aneel Malik
// Vs. Zameen.com" no longer happen.
const LIT_STOP = new Set(("vs versus etc others ors anr case suit court civil dispute matter petition application " +
  "zameen media com pvt private limited ltd smc zmpl group notice legal").split(" "));
// Common Pakistani GIVEN names — never enough on their own to link two people
// ("Muhammad Naveed" ≠ "Hassan Naveed Nawaz"). Surnames (muzammil, akhtar,
// rayyan…) are not here, so a lone surname still links.
const GIVEN_NAMES = new Set(("muhammad mohammad ahmed ahmad naveed ali khan hussain hassan hasan tariq saleem waqas imran usman bilal hamza faisal kamran adnan asad saad umar zeeshan farhan arslan junaid kashif nadeem shahid rizwan adeel atif waseem naeem javed abdul syed raza fahad danish sohail amir aamir asif rashid sajid tahir yasir haris haider").split(" "));
function attachLitigationDocs(records) {
  if (!records || !records.length) return;
  const files = drive.indexFiles().filter((f) => /^litigation/i.test(String(f.root || "")));
  if (!files.length) return;
  const lite = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0, folderPath: f.folderPath || "", webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "", via: "case-folder" });
  const byFolder = new Map();
  for (const f of files) { const k = f.folderPath || ""; if (!byFolder.has(k)) byFolder.set(k, []); byFolder.get(k).push(f); }
  const folders = [...byFolder.entries()].map(([path, fs]) => {
    const leaf = path.split(" / ").slice(-1)[0] || "";
    return {
      path, files: fs,
      // Party tokens from the FOLDER LEAF only (leaf names are "X Vs. Y") — used
      // to validate the match rests on a shared party, not on words inside files.
      leafTokens: new Set(docTokens(leaf).filter((t) => !LIT_STOP.has(t))),
      tokens: new Set(docTokens(leaf + " " + fs.map((x) => x.name).join(" ")).filter((t) => !LIT_STOP.has(t))),
    };
  });
  const df = new Map();
  for (const fo of folders) for (const t of fo.tokens) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => Math.log((folders.length + 1) / ((df.get(t) || 0) + 1)) + 1;
  // How many folder LEAVES contain each token — a token in only 1-3 leaves is a
  // distinctive party name (e.g. "muzammil"); one in many is common ("muhammad").
  const leafDf = new Map();
  for (const fo of folders) for (const t of fo.leafTokens) leafDf.set(t, (leafDf.get(t) || 0) + 1);
  /* AN EXACT NAME IS NOT A GUESS.
     The scoring below is deliberately conservative — it will not link on a
     common given name, because the loose alternative pairs "Zameen Media Vs.
     Sikandar Khan" with "Junaid Khan Vs Zameen Media". But that caution also
     refuses four folders whose leaf name is character-for-character the case
     name once punctuation is normalised. An exact full-name match rests on
     every word of both names agreeing, which is the opposite of a fuzzy link,
     so it is taken first and the scoring is not consulted. */
  const flat = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const byExactLeaf = new Map();
  for (const fo of folders) {
    const leaf = fo.path.split(" / ").slice(-1)[0] || "";
    const k = flat(leaf);
    if (k && !byExactLeaf.has(k)) byExactLeaf.set(k, fo);
  }

  /* A ONE-CHARACTER SPELLING VARIANT IS THE SAME PERSON — WHEN SOMETHING ELSE
     AGREES. "Tahir Anver" and "Tahir Anwer", "Aftab Ahmed" and "Aftab Ahmad",
     "Raza Husnain" and "Raza Hussain": the same matter typed twice by two
     people. The scoring below cannot see them, because it matches on exact
     tokens.

     The rule is deliberately narrow, because a lone near-miss is how wrong
     links get made: the varying word must be SUBSTANTIAL (5+ characters), it
     must differ by exactly one edit, and the two names must ALSO share a whole
     exact distinctive token. One corroborating word is the difference between
     "these are the same person spelt differently" and "these two names look a
     bit alike". */
  const lev1 = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };

  for (const r of records) {
    const exact = byExactLeaf.get(flat(r.caseName));
    if (exact) {
      const under = folders.filter((fo) => fo.path === exact.path || fo.path.startsWith(exact.path + " / "));
      r.driveFiles = under.flatMap((fo) => fo.files).map(lite);
      continue;
    }
    const q = docTokens(r.caseName).filter((t) => !LIT_STOP.has(t));
    if (!q.length) continue;
    /* SCORE EVERY FOLDER, THEN TAKE THE BEST ONE THAT ACTUALLY QUALIFIES.
       This used to pick the single highest-scoring folder and then test only
       that one against the acceptance rule — so a folder that scored well on
       file contents but shared no party name in its LEAF would win the scoring
       and then fail the test, and the correct folder further down the list was
       never looked at. "Khalid Mehmood Vs. ZAK and others" shares two exact
       party names with its case and was being blocked exactly this way.

       The acceptance rule is unchanged and just as strict; it is now applied
       to the candidates in score order rather than to one of them. */
    const scored = [];
    for (const fo of folders) {
      let score = 0;
      for (const t of q) if (fo.tokens.has(t)) score += idf(t);
      if (score > 0) scored.push({ fo, score });
    }
    if (!scored.length) continue;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].fo;
    // Accept on the FOLDER LEAF (the party names): a single DISTINCTIVE shared
    // token (in ≤3 leaves) is enough — so "Zameen v. M. Muzammil" links to
    // "ZMPL Vs. Muhammad Muzammil" on "muzammil" alone — while a common token
    // like "muhammad" needs a second shared token to count.
    /* EVERY FOLDER THAT QUALIFIES, NOT JUST THE BEST ONE.
       The same matter is filed twice in this estate under two categories —
       "Ahsan Fareed vs Zameen Media" sits under Employee Disputes AND under
       Severance Claims, and both folders hold part of the file. Taking only
       the higher-scoring one attached half the case and left the other folder
       looking like an orphan with no case.

       Both are that case's file, so both are attached. The acceptance rule is
       unchanged: each folder has to earn it on a distinctive party name in its
       own leaf. */
    const qualifying = [];
    for (const { fo } of scored) {
      const sl = [...q].filter((t) => fo.leafTokens.has(t));
      const solo = sl.some((t) => (leafDf.get(t) || 0) <= 2 && t.length >= 6 && !GIVEN_NAMES.has(t));
      if (solo || sl.length >= 2) qualifying.push(fo);
    }
    const chosen = qualifying[0] || null;
    const sharedLeaf = [...q].filter((t) => (chosen || best).leafTokens.has(t));
    // A lone shared token links only if it is a rare (≤2 leaves), substantial
    // (≥6 chars) word that is NOT a common given name — i.e. a surname/company
    // word. Two shared tokens always count.
    const strongSolo = sharedLeaf.some((t) => (leafDf.get(t) || 0) <= 2 && t.length >= 6 && !GIVEN_NAMES.has(t));
    /* The whole matched case folder is the case file — INCLUDING its
       subfolders. Folders were keyed by exact path, so "…/Ali Vs. ZMPL" and
       "…/Ali Vs. ZMPL/Annexures" were different groups and only the first could
       be matched; the annexures, applications and orders filed one level down
       were left belonging to nothing. A case folder is a case file all the way
       down. Slicing at 25 hid the rest of the record with nothing to say it had
       been cut. */
    if (qualifying.length) {
      const seen = new Set();
      const out = [];
      for (const qf of qualifying) {
        for (const fo of folders) {
          if (fo.path !== qf.path && !fo.path.startsWith(qf.path + " / ")) continue;
          for (const f of fo.files) { if (seen.has(f.id)) continue; seen.add(f.id); out.push(lite(f)); }
        }
      }
      r.driveFiles = out;
      continue;
    }

    /* Nothing matched on exact tokens. Try the corroborated near-spelling
       rule before giving up -- six folders in this estate are the same matter
       with one letter different in a surname. */
    /* Same rule as above: every folder that qualifies, not just the first.
       The same matter is filed twice under two categories in this estate, and
       a near-spelling match is no more likely to be unique than an exact one. */
    const nearFolders = [];
    for (const fo of folders) {
      const leafT = [...fo.leafTokens];
      const sharedExact = q.filter((t) => fo.leafTokens.has(t));
      if (!sharedExact.length) continue;
      const nearMiss = q.some((a) => a.length >= 5 && !fo.leafTokens.has(a)
        && leafT.some((b) => b.length >= 5 && lev1(a, b)));
      if (nearMiss) nearFolders.push(fo);
    }
    if (nearFolders.length) {
      const seen = new Set();
      const out = [];
      for (const nf of nearFolders) {
        for (const fo of folders) {
          if (fo.path !== nf.path && !fo.path.startsWith(nf.path + " / ")) continue;
          for (const f of fo.files) { if (seen.has(f.id)) continue; seen.add(f.id); out.push(lite(f)); }
        }
      }
      r.driveFiles = out;
    }
  }
}

/* Notices. The notice documents in Drive are named after the counterparty
   ("Legal Notice_Ali Amjad_DB 32_Refund Dispute.pdf"), so a notice row can be
   linked to its own PDF deterministically — the filename literally carries the
   party name. Deliberately strict: a file is attached only when it shares a
   DISTINCTIVE party token (>=5 characters, appearing in at most two files) with
   the notice's sender or recipient, and only to the single best-scoring notice.
   Drive currently holds a small fraction of the notices on the register; the
   rest legitimately have no document, and none is invented to fill the gap. */
/* WHICH WAY A NOTICE WENT.
 *
 * The notices trackers record a sender and a recipient and no direction, so
 * the register could not answer the first question anybody asks of it: is this
 * something we sent, or something served on us. A notice recorded in LegalOS
 * states its direction outright; the 255 tracker rows do not.
 *
 * So it is DERIVED — from the source's own sender and recipient columns,
 * matched against the group's entity registry. If one of our companies issued
 * it, it was Sent; if one of our companies received it, it was Received. A row
 * naming us on both sides, or on neither, is left as "Not recorded" rather
 * than assigned a side: an inter-company notice and a notice between two third
 * parties are both real, and guessing at them would put a wrong direction on
 * the register's primary filter.
 *
 * `directionBasis` travels with the row so the UI can say the value was read
 * off the parties rather than stated by the author.
 */
/* WHY A RECORD HAS NO DOCUMENT (§35/§36).
 *
 * Two thirds of the book carries its documents. The rest was simply blank,
 * which reads as a linking failure — and for most of them it is not. The goal
 * is not that every record has a file; it is that every record SAYS why it does
 * not, so nobody has to wonder whether the pipeline dropped something.
 *
 *   DOCUMENTS_LINKED                 the estate holds them and they are linked
 *   DOCUMENT_CITED_NOT_IN_ESTATE     the tracker names a file that is not in
 *                                    Drive — checked by name against all 6,846
 *                                    files, not assumed
 *   NO_DOCUMENT_CITED_IN_SOURCE      the tracker row names no document at all
 *   NATIVE_NO_DOCUMENT_EXPECTED      raised in the app; there is no source file
 *                                    to find and there never was
 */
function dispositionDocuments(registers) {
  const counts = {};
  let index = null;
  const norm = (v) => String(v || "").toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  try {
    index = new Set(drive.indexFiles().map((f) => norm(f.name)));
  } catch (e) { index = null; }

  for (const rows of Object.values(registers)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      let state, detail = null;
      if ((r.driveFiles || []).length) state = "DOCUMENTS_LINKED";
      else if (r.__origin === "LEGALOS") state = "NATIVE_NO_DOCUMENT_EXPECTED";
      else {
        const cite = String(r.documents || "").trim();
        if (!cite) state = "NO_DOCUMENT_CITED_IN_SOURCE";
        else {
          const names = cite.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
          /* Asked of the whole estate by name before being called absent. */
          const present = index ? names.filter((n) => index.has(norm(n))) : [];
          state = present.length ? "DOCUMENT_IN_ESTATE_NOT_LINKED" : "DOCUMENT_CITED_NOT_IN_ESTATE";
          detail = state === "DOCUMENT_CITED_NOT_IN_ESTATE"
            ? "The source names " + names.length + " document" + (names.length === 1 ? "" : "s")
              + " that no file in the Drive estate matches by name."
            : "Named in the source and present in Drive, but the matcher did not link it.";
          r.__citedDocuments = names.slice(0, 6);
        }
      }
      r.documentState = state;
      if (detail) r.documentStateDetail = detail;
      counts[state] = (counts[state] || 0) + 1;
    }
  }
  return counts;
}

/* THE EXECUTED DOCUMENT SETTLES A DISAGREEMENT BETWEEN TWO TRACKER ROWS.
 *
 * When two copies of one contract disagree, the record itself usually cites the
 * instrument they are both describing, and that instrument names the answer:
 *
 *   "Capitol Icon Mall Sahiwal PPA 200605.pdf"      Sahiwal, not Bahawalpur
 *   "Non-Disclosure Agreement_Zameen Media & Quaid Soft_20200909.pdf"
 *                                                    Zameen Media, not ZD
 *   "Fourth Amendment of Business Hub_20220901.pdf"  starts 2022-09-01
 *   "Lease Agreemnet_Zameen Developments and Naveed Shah_20210108.pdf"
 *                                                    Zameen Developments
 *
 * The rule is deliberately one-sided: a value is adopted only when it appears
 * in the document and the competing value does NOT. Where both appear, or
 * neither does, the document is not deciding anything and the conflict stands.
 * This is choosing between two values the source already offers, using the
 * instrument the source itself points at — not reading a fact out of a filename.
 */
function resolveConflictsFromDocument(registers) {
  let resolved = 0;
  const norm = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const DATEY = /^\d{4}-\d{2}-\d{2}/;

  /* A date appears in these filenames as 20220901, 200605 or 2022-09-01. */
  const dateForms = (v) => {
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return [];
    const [, y, mo, d] = m;
    return [y + mo + d, y.slice(2) + mo + d, y + "-" + mo + "-" + d, d + mo + y, d + "." + mo + "." + y];
  };

  const mentions = (hay, value) => {
    if (DATEY.test(String(value))) return dateForms(value).some((f) => hay.includes(f.toLowerCase()));
    const words = norm(value).split(" ").filter((w) => w.length >= 4);
    if (!words.length) return false;
    return words.every((w) => hay.includes(w));
  };

  for (const rows of Object.values(registers)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const open = r.__unresolvedConflicts;
      if (!open || !open.length) continue;
      const cite = String(r.documents || "");
      if (!cite.trim()) continue;
      const hay = cite.toLowerCase() + " " + norm(cite);
      const stillOpen = [];
      for (const c of open) {
        const keptIn = mentions(hay, c.kept);
        const altIn = mentions(hay, c.alternative);
        if (keptIn === altIn) { stillOpen.push(c); continue; }   // both, or neither — it decides nothing
        const winner = keptIn ? c.kept : c.alternative;
        r[c.field] = winner;
        (r.__documentResolved = r.__documentResolved || []).push({
          field: c.field, chose: winner, over: keptIn ? c.alternative : c.kept,
          document: cite.split(/\n|;/)[0].trim().slice(0, 120),
          rule: "the executed instrument this record cites names one of the two values and not the other",
        });
        resolved++;
      }
      /* A STATE DESCRIBES THE RECORD, NOT A FIELD.
         The document settles some fields and not others. Labelling the record
         RESOLVED_EXECUTED_DOCUMENT while it still had an open field put all six
         of them in the resolved bucket AND the ambiguous bucket — the same
         record counted twice, which is exactly how a ledger stops bridging.
         The field-level facts live on __documentResolved either way; the
         record's state is only "resolved by the document" when the document
         actually closed every one of them. */
      if (r.__documentResolved && r.__documentResolved.length && !stillOpen.length) {
        r.__conflictResolution = {
          state: "RESOLVED_EXECUTED_DOCUMENT",
          rule: "the executed instrument this record cites",
          fields: r.__documentResolved.map((x) => x.field),
          detail: "Both tracker values are kept on __conflicts; the one shown is the one the document names.",
        };
      }
      if (stillOpen.length) r.__unresolvedConflicts = stillOpen;
      else {
        delete r.__unresolvedConflicts;
        delete r.__quality;

      }
    }
  }
  return resolved;
}

/* THE FINAL QUALITY STATE OF EVERY RECORD (§27/§28/§45).
 *
 * "Incomplete", "Conflicting" and "Weak identity" describe what the INGEST ran
 * into. They do not describe where a record ended up, and after an exhaustive
 * source pass that is the only thing worth reporting: a record whose missing
 * value has been searched for across the whole estate and demonstrably is not
 * there is not "incomplete" in any useful sense — it is finished, and the
 * source is silent.
 *
 * So each record gets ONE operational state, and the ingest history stays
 * beside it rather than standing in for it:
 *
 *   COMPLETE                                   nothing missing, nothing open
 *   COMPLETE_WITH_SOURCE_GAP                   usable; a named field is absent
 *                                              from the estate and we say which
 *   RESOLVED_BY_SOURCE_PRECEDENCE              two sources disagreed; a stated
 *                                              rule decided, both values kept
 *   SOURCE_VALUE_NOT_EVIDENCED                 a required field is absent from
 *                                              the estate after a full search
 *   SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION   the estate offers more than
 *                                              one answer and no rule can pick
 *   LEGALOS_NATIVE                             raised in the app; Drive has no
 *                                              opinion about it and never will
 *
 * `hadSourceConflict`, `__conflicts`, `__notEvidenced` and `__identityNote` all
 * survive untouched. Nothing is hidden — the difference is that a resolved
 * disagreement stops being reported as an open one.
 */
const QUALITY = {
  COMPLETE: "COMPLETE",
  GAP: "COMPLETE_WITH_SOURCE_GAP",
  PRECEDENCE: "RESOLVED_BY_SOURCE_PRECEDENCE",
  NOT_EVIDENCED: "SOURCE_VALUE_NOT_EVIDENCED",
  AMBIGUOUS: "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION",
  NATIVE: "LEGALOS_NATIVE",
};

function finalQualityStates(registers) {
  const counts = {};
  for (const [famKey, rows] of Object.entries(registers)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      let state;
      if (r.__origin === "LEGALOS") state = QUALITY.NATIVE;
      else if (r.__unresolvedConflicts && r.__unresolvedConflicts.length) state = QUALITY.AMBIGUOUS;
      else if (r.__candidates && r.__candidates.length > 1) state = QUALITY.AMBIGUOUS;
      else if (r.__weakIdentity) state = QUALITY.NOT_EVIDENCED;
      else if (r.__notEvidenced && Object.keys(r.__notEvidenced).length) {
        /* A record is only "not evidenced" if what is absent was REQUIRED of
           it. Where the absent field is optional, the record is usable and the
           gap is a footnote on it, not its headline. */
        const fam = FAMILIES.find((f) => f.key === famKey);
        const required = new Set((fam && fam.required) || []);
        /* A NOTICE IS IDENTIFIED BY WHO SENT IT, TO WHOM, AND WHEN.
           "Details" is what it was about — useful, and not what makes the
           record usable. Treating a blank description as a missing identity
           reported 48 perfectly serviceable notices as unevidenced records. */
        if (famKey === "notices") required.delete("details");
        /* A matter that was never filed has no cause title to be missing — see
           classifyMatters. The finding stays on the record and explains itself;
           it is not a hole in the record's identity. */
        if (famKey === "litigation" && r.matterClass && r.matterClass !== "COURT_CASE") required.delete("caseName");
        state = Object.keys(r.__notEvidenced).some((f) => required.has(f)) ? QUALITY.NOT_EVIDENCED : QUALITY.GAP;
      } else if (r.__conflictResolution) state = QUALITY.PRECEDENCE;
      else if (r.__quality === "INCOMPLETE_SOURCE") state = QUALITY.NOT_EVIDENCED;
      else if (r.__quality === "CONFLICTING_SOURCE") state = QUALITY.AMBIGUOUS;
      else state = QUALITY.COMPLETE;
      r.qualityState = state;
      /* The ingest history, kept and clearly labelled as history. */
      if (r.__conflicts && r.__conflicts.length) r.hadSourceConflict = true;
      counts[state] = (counts[state] || 0) + 1;
      counts[famKey + ":" + state] = (counts[famKey + ":" + state] || 0) + 1;
    }
  }
  return counts;
}

/* WHAT KIND OF MATTER IS THIS, ACTUALLY? (§29)
 *
 * The litigation register was assembled from three trackers, and only one of
 * them is a list of court cases. The refund sheet of "Zameen Pending
 * Litigation" records buyer refund claims — most with the forum column left
 * empty because they were never filed anywhere — and a handful whose "forum"
 * is a police station. Carried into the main register they inflated Active
 * Cases, diluted Total Claims Value, and put police stations in the court
 * analysis beside the Lahore High Court.
 *
 * The class comes from what the row SAYS, not from which tracker it arrived in:
 *
 *   COURT_CASE              a real forum — a court, tribunal, or consumer forum
 *   POLICE_COMPLAINT        the forum is a police station or a police office
 *   REFUND_CLAIM_NOT_FILED  no forum at all, and a refund amount claimed
 *   PRE_LITIGATION_DISPUTE  no forum and no refund amount: a dispute on the
 *                           book that has not been filed
 *
 * Nothing moves stores and nothing loses lineage — the row keeps its workbook,
 * its sheet and its id. What changes is which register counts it.
 */
const POLICE_FORUM = /^(p\.?\s*s\.?\b|police|s\.?p\.?\s*office|d\.?s\.?p\.?\s*office|sho\b|thana\b)/i;
const COURT_FORUM = /court|tribunal|judge|magistrate|bench|forum|authority|ombuds|nccia|arbitrat/i;

let _resDates = null;
function readResolutionDates() {
  if (_resDates === null) {
    try {
      _resDates = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "resolution-dates.json"), "utf8")).records || {};
    } catch (e) { _resDates = {}; }
  }
  return _resDates;
}

function classifyMatters(registers) {
  const counts = {};
  for (const r of registers.litigation || []) {
    const forum = String(r.court || "").trim();
    let cls;
    if (POLICE_FORUM.test(forum)) cls = "POLICE_COMPLAINT";
    else if (forum && COURT_FORUM.test(forum)) cls = "COURT_CASE";
    else if (forum) cls = "COURT_CASE";                       // a named forum we do not recognise is still a forum
    else if (Number(r.claimAmount) > 0) cls = "REFUND_CLAIM_NOT_FILED";
    else cls = "PRE_LITIGATION_DISPUTE";
    /* A case raised in LegalOS is a court matter by construction — the intake
       asks for the court — so it is never demoted by a blank column. */
    if (r.__origin === "LEGALOS") cls = "COURT_CASE";
    /* A MATTER WITH A CAUSE TITLE IN THE LITIGATION ESTATE HAS BEEN FILED.
       Two refund rows carry no forum but their cause title was recovered from a
       case folder in the litigation root, or from a row in the cause list. Both
       are evidence of a filed suit that the refund sheet simply did not record
       a forum for — so the absence of a forum column does not make them
       unfiled. */
    const src = (r.__resolvedFromDrive || {}).caseName;
    if (src && /Drive case (folder|document)|another record in this register/.test(String(src.from || ""))) {
      cls = "COURT_CASE";
      r.__matterClassEvidence = src;
    }
    r.matterClass = cls;
    r.__matterClassBasis = r.__matterClassEvidence
      ? "no forum on the source row, but the matter has a cause title in the litigation estate ("
        + r.__matterClassEvidence.from + "), which evidences a filed suit"
      : forum
      ? "the forum recorded on the source row: \"" + forum + "\""
      : (cls === "REFUND_CLAIM_NOT_FILED"
        ? "the source row records a refund amount and no forum, so nothing was filed"
        : "the source row records no forum and no amount claimed");
    /* WHAT A MATTER MUST HAVE DEPENDS ON WHAT IT IS.
       The litigation family requires a caseName, which is right for a suit and
       meaningless for a refund claim nobody filed — there is no cause, so there
       is no cause title, and demanding one reported seventeen perfectly good
       claims as missing a value the estate could never hold. A refund claim is
       identified by who is claiming, on which project, for how much. */
    if (cls !== "COURT_CASE" && (r.__missingFields || []).includes("caseName")) {
      const identified = (r.counterparty || r.project || r.claimAmount);
      if (identified) {
        r.__missingFields = r.__missingFields.filter((f) => f !== "caseName");
        if (r.__notEvidenced && r.__notEvidenced.caseName) {
          /* Keep the finding, restate it as what it is: not a gap in the
             record, but the reason this kind of matter has no cause title. */
          r.__notEvidenced.caseName.reason = cls === "POLICE_COMPLAINT"
            ? "CASE_NOT_FILED_IN_COURT_POLICE_COMPLAINT"
            : "CASE_NOT_FILED_IN_COURT";
          r.__notEvidenced.caseName.appliesTo = cls;
        }
        if (!r.__missingFields.length) { delete r.__quality; delete r.__missingFields; }
      }
    }
    counts[cls] = (counts[cls] || 0) + 1;
  }
  return counts;
}

/* ------------------------------------------------- resolving from Drive */

/* For every record whose source left a required field blank, ask the Drive
   estate. Only litigation case titles are resolvable this way today — that is
   where the evidence demonstrably exists — and the shape is deliberately
   general so the next family can be added without a second mechanism. */
/* RUN TO A FIXED POINT.
 *
 * One pass of the resolver left the cold build and the warm start four
 * documents apart: the load path clears every link and re-attaches before
 * resolving, so it starts from a different place and finds a little more. Both
 * numbers bridged, but two different answers for one estate is exactly the kind
 * of drift this whole exercise exists to remove. The resolver is idempotent —
 * it skips anything already answered — so it is simply run until it stops
 * finding anything, and both paths land on the same estate. */
function resolveMissingFromDriveToFixedPoint(registers) {
  let total = null;
  for (let pass = 0; pass < 4; pass++) {
    const r = resolveMissingFromDrive(registers);
    const found = (r.resolved || 0) + (r.noticeDocs || 0) + (r.noticeSubjects || 0) + (r.lateResolved || 0);
    if (!total) total = Object.assign({ passes: 1 }, r);
    else {
      total.passes = pass + 1;
      for (const k of ["resolved", "noticeDocs", "noticeSubjects", "lateResolved"]) total[k] = (total[k] || 0) + (r[k] || 0);
      for (const k of ["notEvidenced", "noticeNotEvidenced", "lateExplained"]) total[k] = r[k];
    }
    if (!found) break;
  }
  return total;
}

function resolveMissingFromDrive(registers) {
  let resolved = 0, notEvidenced = 0;
  let index;
  try {
    index = [
      ...drive.indexFolders().map((f) => ({ ...f, kind: "folder" })),
      ...drive.indexFiles().map((f) => ({ ...f, kind: "file" })),
    ];
  } catch (e) { return { resolved: 0, notEvidenced: 0, error: e.message }; }

  for (const r of registers.litigation || []) {
    if (r.caseName || !(r.__missingFields || []).includes("caseName")) continue;
    /* The subject is whoever the matter is against. On the refund sheet that
       is the buyer; elsewhere it may be a named counterparty. */
    const subject = r.counterparty || r.buyer || "";
    /* LOOK IN THE OTHER TRACKERS BEFORE LOOKING IN DRIVE.
       The refund sheet and the cause list are two views of the same estate:
       "Waqas Amjad" appears on one as a buyer with no case title, and on the
       other as "Waqas Amjad vs Zameen Media & others". The cheapest, strongest
       evidence for a matter's name is another register already naming it. */
    /* ONE CANDIDATE IS AN ANSWER; THREE ARE A GUESS.
       Matching on the counterparty alone is not enough, because a person can be
       a party to several matters. "Khurram Shahzad" names three different cases
       in this register — he is the plaintiff in two and the defendant in a
       third — and adopting the first match would have put the wrong cause title
       on a refund claim and made it look verified. So every source is asked,
       the distinct answers are collected, and a title is adopted ONLY when the
       estate gives exactly one. Otherwise the candidates are recorded and a
       human decides. */
    const candidates = [];
    if (subject) {
      const want = sourceResolve.tokens(subject);
      if (want.length >= 2) {
        for (const other of registers.litigation || []) {
          if (other === r || !other.caseName) continue;
          const hay = new Set(sourceResolve.norm(other.caseName).split(" ").filter(Boolean));
          if (want.every((w) => hay.has(w))) {
            candidates.push({ value: other.caseName, evidence: { from: "another record in this register",
              recordId: other.id, sourceFile: (other.__source || {}).file || null,
              sourceSheet: (other.__source || {}).sheet || null, matchedOn: want.join(" + ") } });
          }
        }
      }
      const fromDrive = sourceResolve.caseTitleFor(subject, index);
      if (fromDrive) candidates.push(fromDrive);
    }
    /* THE SAME CASE, WRITTEN TWO WAYS, IS STILL ONE CASE.
       Comparing whole titles made "Shaukat Minhas vs Hammad Asghar & others"
       and "Shaukat Hussain Minhas vs Hammad Asghar & others" look like two
       different matters — they are one, recorded with and without a middle
       name. A cause title is two parties either side of "vs", so candidates are
       grouped on the PARTIES: same claimant, and at least one substantive word
       shared on the other side. That still keeps "Khurram Shahzad vs Platinum
       Construction" and "Azeem Zahid vs Khurram Shahzad" apart, because their
       claimants differ — which is the distinction that matters. */
    const sides = (t) => {
      const parts = String(t).split(/\bv\/?s\.?\b|\bversus\b/i);
      return { left: new Set(sourceResolve.tokens(parts[0] || "")),
        right: new Set(sourceResolve.tokens(parts.slice(1).join(" ") || "")) };
    };
    const shares = (a, b) => [...a].some((x) => b.has(x));
    const groups = [];
    for (const c of candidates) {
      const sc = sides(c.value);
      const g = groups.find((x) => shares(x.sides.left, sc.left) && (shares(x.sides.right, sc.right)
        || !x.sides.right.size || !sc.right.size));
      if (g) { g.members.push(c); if (c.value.length > g.pick.value.length) g.pick = c; }
      else groups.push({ sides: sc, members: [c], pick: c });
    }
    const distinct = groups.map((g) => g.pick);
    const hit = distinct.length === 1 ? distinct[0] : null;
    if (hit) {
      r.caseName = hit.value;
      r.__resolvedFromDrive = Object.assign({}, r.__resolvedFromDrive, { caseName: hit.evidence });
      r.__missingFields = (r.__missingFields || []).filter((f) => f !== "caseName");
      if (!r.__missingFields.length) { delete r.__quality; delete r.__missingFields; }
      resolved++;
      continue;
    }
    /* Nothing in the estate names this matter under that party. Before calling
       it absent, say what the row itself shows — because "no cause title" means
       different things depending on where the matter actually is. */
    if (distinct.length > 1) {
      r.__notEvidenced = Object.assign({}, r.__notEvidenced, {
        caseName: {
          reason: "NOT_EVIDENCED_IN_SOURCE",
          detail: distinct.length + " different matters in the estate name " + subject
            + ", so the source does not say which one this row is. Adopting any of them would be a guess.",
          searchedFor: subject,
          searchedIn: "this register and the Litigation & Dispute root",
        },
      });
      r.__candidates = distinct.map((c) => ({ name: c.value, from: c.evidence.from,
        recordId: c.evidence.recordId || null, driveId: c.evidence.driveId || null }));
      r.__matterKind = "AMBIGUOUS_PARTY_SEVERAL_MATTERS";
      notEvidenced++;
      continue;
    }
    const forum = String(r.court || "").trim();
    const POLICE = /^(p\.?\s*s\.?\b|police|s\.?p\.?\s*office|d\.?s\.?p\.?\s*office|sho\b)/i;
    let detail;
    if (!forum) {
      detail = "The tracker sheet carries no case-title column, and nothing in the litigation root names a cause for "
        + (subject || "this row") + ". The row records no forum either, so this is a refund claim that was never filed "
        + "in any court — there is no cause title to find.";
      r.__matterKind = "REFUND_CLAIM_NOT_FILED";
    } else if (POLICE.test(forum)) {
      detail = "The forum recorded is \"" + forum + "\" — a police station, not a court. This is a police complaint "
        + "rather than a filed suit, so it has a complaint reference and no cause title.";
      r.__matterKind = "POLICE_COMPLAINT";
    } else {
      /* A real court is named but the party did not resolve. Gather what the
         estate holds for that court so a reader has somewhere to start — as
         CANDIDATES, never adopted. Two matters in the same court are not the
         same matter, and choosing between them without a case number would be
         inventing the answer. */
      /* A candidate list is not an answer, so it may be searched on a single
         distinctive term — the city the forum sits in. (evidenceFor demands two
         tokens because it feeds ADOPTION, where one token is not an
         identification; here nothing is adopted.) */
      const city = forum.split(",").pop().trim().toLowerCase();
      const cands = city.length >= 4
        ? index.filter((o) => sourceResolve.CAUSE.test(o.name)
            && (o.name + " " + (o.folderPath || "")).toLowerCase().includes(city)
            && /Litigation/i.test(o.root || "")).slice(0, 5)
        : [];
      detail = "The source row leaves both case number and case name blank. It is at " + forum
        + (cands.length
          ? ", and the litigation root holds " + cands.length + " matter(s) in that forum — none of which the row "
            + "identifies, and choosing between them without a case number would be a guess."
          : ", and nothing in the litigation root names a matter in that forum.");
      r.__matterKind = "FILED_BUT_UNNAMED_IN_SOURCE";
      if (cands.length) {
        r.__candidates = cands.map((c) => ({ name: c.name, driveId: c.id, path: c.folderPath || null, kind: c.kind }));
      }
    }
    r.__notEvidenced = Object.assign({}, r.__notEvidenced, {
      caseName: {
        reason: "NOT_EVIDENCED_IN_SOURCE",
        detail,
        searchedFor: subject || (forum ? "matters at " + forum : null),
        searchedIn: "Litigation & Dispute root, folders and files, whole estate",
      },
    });
    notEvidenced++;
  }
  /* ---- Legal notices: find the notice document, then the subject (§23/§53) */
  const fileIndex = index.filter((o) => o.kind !== "folder");
  let noticeDocs = 0, noticeSubjects = 0, noticeNotEvidenced = 0;
  for (const r of registers.notices || []) {
    const needsDetails = (r.__missingFields || []).includes("details");
    const hasDoc = (r.driveFiles || []).length > 0;
    if (!needsDetails && hasDoc) continue;
    /* Search on the OTHER side. We are a party to every notice in the book, so
       our own name identifies nothing — see isOurOwn in source-resolve.js. */
    const other = [r.sender, r.recipient].find((x) => x && !sourceResolve.isOurOwn(x));
    /* First a notice or summons under that name; failing that, ANY paper in the
       litigation estate naming them — a hearing notice's subject is the matter
       it is about, and the matter's applications and suits name it. */
    const hit = other
      ? (sourceResolve.noticeDocumentFor(other, fileIndex) || sourceResolve.matterDocumentFor(other, fileIndex))
      : null;
    if (hit) {
      if (!hasDoc) {
        r.driveFiles = (r.driveFiles || []).concat([hit.file]);
        r.__resolvedFromDrive = Object.assign({}, r.__resolvedFromDrive, { document: hit.evidence });
        noticeDocs++;
      }
      /* The subject is adopted only when the file name carries something that
         actually describes the notice. Otherwise the document is linked and the
         column stays honestly empty — a pointer beats a guess (§72/§73). */
      /* Where the papers name the matter, that IS what the notice is about. */
      if (needsDetails && !hit.subject && hit.matter) {
        r.details = "Concerns " + hit.matter;
        r.__resolvedFromDrive = Object.assign({}, r.__resolvedFromDrive, {
          details: Object.assign({}, hit.evidence, { confidence: "from-the-matters-papers" }),
        });
        r.__missingFields = (r.__missingFields || []).filter((f) => f !== "details");
        if (!r.__missingFields.length) { delete r.__quality; delete r.__missingFields; }
        noticeSubjects++;
        continue;
      }
      if (needsDetails && hit.subject) {
        r.details = hit.subject;
        r.__resolvedFromDrive = Object.assign({}, r.__resolvedFromDrive, {
          details: Object.assign({}, hit.evidence, { confidence: hit.confidence }),
        });
        r.__missingFields = (r.__missingFields || []).filter((f) => f !== "details");
        if (!r.__missingFields.length) { delete r.__quality; delete r.__missingFields; }
        noticeSubjects++;
        continue;
      }
    }
    if (!needsDetails) continue;
    r.__notEvidenced = Object.assign({}, r.__notEvidenced, {
      details: {
        reason: "NOT_EVIDENCED_IN_SOURCE",
        detail: hit
          ? "The tracker left the Details column blank. The notice document is on file and is now linked, but its name "
            + "carries no description of the subject — open the document to read it."
          : (other
            ? "The tracker left the Details column blank, and no notice or summons in the litigation root names "
              + other + "."
            : "The tracker left the Details column blank, and both parties on the row are our own entities, so there "
              + "is no counterparty to search the estate with."),
        searchedFor: other || null,
        searchedIn: "Litigation & Dispute root, notice and summons documents",
      },
    });
    noticeNotEvidenced++;
  }

  /* ---- Anything still incomplete must say why (§51). ----
     Three records reached the end of the pipeline marked INCOMPLETE with no
     explanation at all, which is exactly the generic badge this work exists to
     remove. Each is now either resolved from what it carries, or told plainly
     what is absent and what was examined. */
  let lateResolved = 0, lateExplained = 0;
  for (const [famKey, rows] of Object.entries(registers)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (r.__quality !== "INCOMPLETE_SOURCE" || r.__notEvidenced || r.__identityNote) continue;
      const miss = r.__missingFields || [];

      /* A CONTRACT NAMES ITSELF IN THE DOCUMENT IT CITES.
         The title column is blank, but the tracker's own documents column says
         "Ideal Homes Faisalabad Service Agreement First Amendment". That is the
         source stating what the instrument is, in the same row. */
      if (miss.includes("title") && String(r.documents || "").trim()) {
        const cited = String(r.documents).split(/\n|;/)[0].replace(/\.(pdf|docx?|jpe?g|png)\b.*$/i, "").trim();
        if (cited.length >= 8) {
          r.title = cited;
          r.__resolvedFromDrive = Object.assign({}, r.__resolvedFromDrive, {
            title: { from: "the document this row cites", citation: cited, sourceFile: (r.__source || {}).file || null },
          });
          r.__missingFields = miss.filter((f) => f !== "title");
          if (!r.__missingFields.length) { delete r.__quality; delete r.__missingFields; }
          lateResolved++;
          continue;
        }
      }

      const carried = Object.entries(r)
        .filter(([k, v]) => !k.startsWith("__") && k !== "id" && k !== "driveFiles" && v !== "" && v != null)
        .reduce((o, [k, v]) => (o[k] = String(v).slice(0, 60), o), {});
      r.__notEvidenced = Object.assign({}, r.__notEvidenced, miss.reduce((o, f) => {
        o[f] = {
          reason: "NOT_EVIDENCED_IN_SOURCE",
          detail: "The source row leaves " + f + " blank and cites no document that states it. Everything the row "
            + "does carry is listed, and none of it names " + f + ".",
          searchedIn: "the row itself, the documents it cites, and the Drive root for this family",
          carries: carried,
        };
        return o;
      }, {}));
      lateExplained++;
    }
  }

  return { resolved, notEvidenced, noticeDocs, noticeSubjects, noticeNotEvidenced, lateResolved, lateExplained };
}

function deriveNoticeDirection(registers) {
  const rows = (registers && registers.notices) || [];
  if (!rows.length) return 0;
  let names = [];
  try {
    const R = registers || {};
    const seen = new Map();
    const add = (raw) => {
      const k = entities.entityKey(raw);
      if (!k || k.length < 4) return;
      if (!seen.has(k)) seen.set(k, true);
    };
    for (const r of R.resolutions || []) add(r.entity);
    for (const r of R.licences || []) add(r.entity);
    for (const r of R.loans || []) { add(r.borrower); }
    for (const r of R.properties || []) add(r.entity);
    for (const r of R.contracts || []) add(r.entityName);
    names = [...seen.keys()];
  } catch (e) { return 0; }
  if (!names.length) return 0;
  const isOurs = (raw) => {
    const k = entities.entityKey(raw);
    if (!k || k.length < 4) return false;
    return names.some((n) => n === k || k.includes(n) || n.includes(k));
  };
  let set = 0;
  for (const r of rows) {
    if (r.direction) continue;                       // stated by whoever recorded it
    const fromUs = isOurs(r.sender);
    const toUs = isOurs(r.recipient);
    if (fromUs && !toUs) { r.direction = "Sent"; r.directionBasis = "derived from the sender"; set++; }
    else if (toUs && !fromUs) { r.direction = "Received"; r.directionBasis = "derived from the recipient"; set++; }
    else if (fromUs && toUs) { r.direction = "Internal"; r.directionBasis = "both parties are group companies"; set++; }
  }
  return set;
}

function attachNoticeDocs(records) {
  if (!records || !records.length) return;
  const files = drive.indexFiles().filter((f) => isDocFile(f) && /legal notice|notices?$/i.test(String(f.folderPath || "")));
  if (!files.length) return;
  const NOTICE_STOP = new Set("legal notice notices summons dated final draft copy signed scan for the and vs versus".split(" "));
  const toks = (v) => new Set(docTokens(v).filter((t) => !NOTICE_STOP.has(t) && t.length >= 5));
  const fileToks = files.map((f) => toks(f.name));
  const df = new Map();
  for (const ts of fileToks) for (const t of ts) df.set(t, (df.get(t) || 0) + 1);

  // best notice per file, so one document never lands on several notices
  const claim = new Map();
  records.forEach((r, ri) => {
    const q = new Set([...toks(r.recipient), ...toks(r.sender), ...toks(r.details)]);
    if (!q.size) return;
    fileToks.forEach((ts, fi) => {
      let strong = 0;
      for (const t of q) if (ts.has(t) && (df.get(t) || 0) <= 2) strong++;
      if (!strong) return;
      const prev = claim.get(fi);
      if (!prev || strong > prev.strong) claim.set(fi, { ri, strong });
    });
  });
  for (const [fi, { ri }] of claim) {
    const r = records[ri];
    (r.driveFiles = r.driveFiles || []).push(liteFile("notice-file")(files[fi]));
  }
}

/* A document that a FUZZY token match put on many records at once is noise, not
   evidence: a legal file belongs to the matter it was filed under, and the same
   PDF turning up on a dozen unrelated contracts is a fabricated relationship of
   exactly the kind that must never reach a lawyer's screen. Deterministic links
   (the tracker named the file; the file sits in the record's own folder) are
   always kept — a shared folder legitimately serves several rows. Only the
   fuzzy "match" links are pruned, and only where the file is spread across more
   records than a real document could belong to. Every pruned link is counted. */
/* WHO IS ALLOWED TO HOLD THE SAME DOCUMENT.
   Document authorisation treats a file cited by several families as readable by
   any of them, so every extra holder widens who can open it. That makes sharing
   an access decision, not a cosmetic one, and it is decided on EVIDENCE:

     3  filename   the tracker names the file. The source itself says this
                   record holds this document, so several records may — that is
                   the source describing a genuinely shared instrument, and it
                   is the ONLY basis on which a document crosses a family.
     2  folder     a deterministic folder link (the case folder, the dated loan
                   folder, the project folder). Several rows can legitimately be
                   the same matter — an original suit and its appeal are two rows
                   and one case file; a project's approvals belong to both the
                   project record and the contract that cites them — so every
                   record that matched the folder keeps it, provided they all sit
                   in the same MODULE GROUP.

                   The boundary is the group, not the register family. Access is
                   decided per module group (commercial / litigation /
                   compliance), so two families inside one group sharing a
                   document widens access to nobody. Testing the family instead
                   was wrong and it cost real data: contracts and properties are
                   both commercial, and because a contract cited a ZD project's
                   approvals by name, SEVEN projects — Jade, Neo, Phoenix, Golf
                   View Rumanza, Downtown Rumanza, Boulevard Heights, Grande
                   Palladium — were stripped of every document they had.
     1  match      a token guess. Never more than one owner, and never across
                   families.

   The previous rule let a guess sit on two records and never looked across
   families at all, so one MEP works agreement was held by two contracts and
   four properties, and a PACRA rating mandate by contracts and loans. */
/* 3 the source names the file · 2 a deterministic folder · 1.5 proven from the
   document's own text · 1 a token guess.
   Content sits BELOW a folder link and ABOVE a name guess, and like a guess it
   gets exactly one owner: it is strong evidence that a document concerns a
   party, and not evidence that two records share the instrument. */
/* 3 the source names the file · 2 a deterministic folder · 1.8 the pages were
   read and corroborated · 1.5 proven from the document's own text · 1 a token
   guess. A reading sits just below a folder: it is strong evidence about the
   document, but the folder is where the business actually filed it. Like the
   other inferred tiers it gets exactly one owner. */
/* How strong is the claim that this record holds this document?
 *
 *   filename         3    the source cites the document by name
 *   content-reattach 3    a person or a read decided it, against the folder
 *   (folder)         2    the default: it lives in that record's folder
 *   pages-read       1.8  placed from what its pages showed
 *   content          1.5  placed from extracted text
 *   match            1    a guess from similarity
 *
 * content-reattach sits at the top deliberately. It is not a guess: it is the
 * outcome of reading the document and finding the folder wrong. Ranked below a
 * filename it lost every contest with a record that merely cites the file by
 * name, so a reattachment was applied and then silently pruned away — the
 * correction survived in the plan and vanished from the registers. */
const LINK_EVIDENCE = (via) => (via === "filename" ? 3
  : via === "content-reattach" ? 3
    : via === "pages-read" ? 1.8
      : via === "content" ? 1.5 : via === "match" ? 1 : 2);

/* Which module group each register family belongs to. Authorisation is decided
   per GROUP, so this is the boundary that matters when deciding whether two
   records may hold the same document. Kept in step with api/router.js. */
const FAMILY_GROUP = {
  contracts: "commercial", properties: "commercial",
  litigation: "litigation", notices: "litigation",
  licences: "compliance", loans: "compliance", resolutions: "compliance",
};

/* DOCUMENTS PLACED BY READING THEIR PAGES.
   tools/commercial-vision.js renders a document's first and last pages and
   reads them; tools/commercial-resolve.js keeps only those where the pages name
   a project we hold AT HIGH CONFIDENCE and at least one further fact — the
   entity, the counterparty, a unit reference or an agreement number — agrees.

   A project name on its own is deliberately not enough. A lease for Mall 35 and
   a promotion agreement for Mall 35 are different instruments, and attaching
   both to one record on the strength of the words "Mall 35" is the same
   over-claiming this codebase has repeatedly had to undo.

   Applied only to documents NOTHING else placed, so a citation or a folder
   always wins over a reading. */
function applyVisionPlacements(registers) {
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(ROOT, "audit", "commercial-vision-attach.json"), "utf8")); }
  catch (e) { return 0; }
  if (!Array.isArray(plan) || !plan.length) return 0;
  const props = registers.properties || [];
  if (!props.length) return 0;
  const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");

  const taken = new Set();
  for (const fam of Object.values(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) for (const d of r.driveFiles || []) taken.add(d.id);
  }

  let placed = 0;
  for (const p of plan) {
    if (taken.has(p.fileId)) continue;
    const f = drive.fileById(p.fileId);
    if (!f) continue;
    const rows = props.filter((r) => norm(r.project) === norm(p.toProject));
    if (!rows.length) continue;
    // One row carries it — the project's rows are duplicates of one project,
    // and hanging the same document on every row inflates every count.
    const row = rows[0];
    (row.driveFiles = row.driveFiles || []).push({
      id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0,
      folderPath: f.folderPath || "", webViewLink: f.webViewLink || "",
      modifiedTime: f.modifiedTime || "", via: "pages-read",
      readConfidence: p.confidence,
      corroboratedBy: (p.corroboration || []).map((x) => x.field),
    });
    taken.add(p.fileId);
    placed++;
  }
  return placed;
}

/* MISFILED PROJECT DOCUMENTS, PUT WHERE THEY BELONG.
   tools/commercial-reconcile.js reads the documents and finds papers sitting in
   the wrong project's folder: "20220118 PRIV Downtown Rumanza_Agreement to
   Sell" was filed under Zameen Ace Mall, as were a Zameen Jade sale agreement
   and its leaseback.

   Only one class is moved here, and it is deliberately narrow: the FILENAME and
   the DOCUMENT'S OWN TEXT must both name the same other project. That is two
   independent sources against the folder's one, which is the "clearly stronger
   deterministic evidence" bar. Everything else — a base draft copied between
   projects and half-edited, a specification mentioning another site — stays
   where it is and goes to a person, because it reads exactly like a misfiling
   and usually is not one.

   Drive is NOT touched. The document stays where the business filed it; only
   the LegalOS attachment moves, and the conflict record keeps both sides. */
function applyCommercialReattach(registers) {
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(ROOT, "audit", "commercial-reattach.json"), "utf8")); }
  catch (e) { return 0; }
  if (!Array.isArray(plan) || !plan.length) return 0;
  const props = registers.properties || [];
  if (!props.length) return 0;
  const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");

  const byFile = new Map();
  for (const p of plan) byFile.set(p.fileId, p);

  /* TAKE IT OFF THE WRONG PROJECT WHEREVER THE WRONG PROJECT HOLDS IT.
     This removal used to run over properties alone, so four Zameen Aurum tax
     documents were added to Aurum and left sitting on Zameen Ace Mall as well —
     because Ace Mall holds them through a CONTRACTS record. A reattachment that
     only adds is not a correction; it doubles the error. */
  const everyRecord = [];
  for (const arr of Object.values(registers)) {
    if (Array.isArray(arr)) for (const r of arr) everyRecord.push(r);
  }

  let moved = 0;
  for (const r of everyRecord) {
    const key = norm(r.project || r.title || "");
    if (!key) continue;
    const keep = [];
    for (const d of r.driveFiles || []) {
      const p = byFile.get(d.id);
      if (p && norm(p.fromProject) === key) { moved++; continue; }     // taken off the wrong project
      keep.push(d);
    }
    r.driveFiles = keep;
  }
  for (const r of props) {
    const key = norm(r.project);
    const have = new Set((r.driveFiles || []).map((d) => d.id));
    for (const p of plan) {
      if (norm(p.toProject) !== key || have.has(p.fileId)) continue;
      const f = drive.fileById(p.fileId);
      if (!f) continue;
      (r.driveFiles = r.driveFiles || []).push({
        id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0,
        folderPath: f.folderPath || "", webViewLink: f.webViewLink || "",
        modifiedTime: f.modifiedTime || "", via: "content-reattach",
        reattachedFrom: p.fromProject,
      });
      have.add(p.fileId);
    }
  }
  return moved;
}

/* CONTENT-PROVEN LINKS.
   tools/content-link.js asks Drive's full-text index which documents contain
   TWO of a record's identity words, verifies that against the document's own
   text wherever we hold it, and writes the surviving proposals to
   audit/content-links.json. This applies them.

   It runs LAST, and only onto records that still have nothing, so a link proven
   by a tracker citation or a folder is never displaced by one inferred from
   content. The evidence travels with the link as `words`, because "these two
   names both appear inside this document" is a claim a reader should be able to
   check rather than take on trust.

   Reading the proposals from a file rather than probing here is deliberate: the
   register build must not depend on the network, and a rebuild must produce the
   same book twice. */
function applyContentLinks(registers) {
  let file = null;
  try { file = JSON.parse(fs.readFileSync(path.join(ROOT, "audit", "content-links.json"), "utf8")); }
  catch (e) { return 0; }
  const byRecord = new Map();
  for (const p of file.proposals || []) byRecord.set(p.family + "/" + p.recordId, p);
  if (!byRecord.size) return 0;

  // Nothing may be claimed twice, so start from what is already spoken for.
  const taken = new Set();
  for (const fam of Object.values(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) for (const d of r.driveFiles || []) taken.add(d.id);
  }

  let applied = 0;
  for (const [famKey, rows] of Object.entries(registers)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if ((r.driveFiles || []).length) continue;
      const p = byRecord.get(famKey + "/" + r.id);
      if (!p) continue;
      const add = [];
      for (const d of p.documents || []) {
        if (taken.has(d.id)) continue;
        const f = drive.fileById(d.id);
        if (!f) continue;                                   // it left Drive since the probe
        taken.add(d.id);
        add.push({
          id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0,
          folderPath: f.folderPath || "", webViewLink: f.webViewLink || "",
          modifiedTime: f.modifiedTime || "", via: "content",
          words: d.words || [], contentVerified: !!d.verified,
        });
      }
      if (add.length) { r.driveFiles = add; applied += add.length; }
    }
  }
  return applied;
}

/* Tell every attached document what it IS and how we know.
   Two short fields, set once after all the matchers have run, rather than
   threaded through the five different places that build an attachment:

     ctype  what the document says it is, read from its text or from Google's
            OCR index — "LEASE", "LITIGATION", "RESOLUTION"…
     cread  how we read it: TEXT_EXTRACTED (we hold the words),
            SCAN_READ_VIA_INDEX (we know some words), NOT_READ.

   `cread` travels with `ctype` deliberately and must keep doing so. A type
   derived from a document we hold in full and a type derived from three words
   OCR'd out of a scan are not equally strong, and the screen has no way to say
   so unless the data does. */
function annotateContent(registers) {
  let typed = 0;
  let content = null;
  try { content = require("./content-model"); } catch (e) { return 0; }
  for (const fam of Object.values(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) for (const d of r.driveFiles || []) {
      const f = content.factsFor(d.id);
      d.cread = f.read;
      if (f.type) { d.ctype = f.type; typed++; }
    }
  }
  return typed;
}

/* A BLANK PRO-FORMA IS NOT A DOCUMENT OF A LIVE RECORD.
 *
 * The matchers link on filename and content, and a blank "Agreement to Sell"
 * for Zameen Quadrangle matches the Zameen Quadrangle property on every signal
 * a matcher has: the project name, the developer, the address, the clause
 * language. So it was attached. Twenty-seven of thirty-eight property records
 * carried template files among their documents -- the Quadrangle record showed
 * nine blank agreements among forty-nine -- and nothing on the screen said
 * which was a deal and which was stationery.
 *
 * That is the failure the brief names: no template pollution of the live
 * register. It is dangerous in a specific way, because a blank agreement looks
 * exactly like an executed one until someone opens it and reads the signature
 * block.
 *
 * What is NOT removed: an executed instrument that happens to be filed in the
 * template drawer. Those are real -- stamped, sealed, signed -- and the other
 * half of the same instruction says no executed contract may be lost in the
 * template library. They stay attached. Reference material stays too: a DHA
 * form or a published policy is context a person may want, and it does not
 * masquerade as this record's agreement.
 *
 * Nothing is deleted from Drive, and the template library keeps every one of
 * these files. This changes only what the live register presents as a record's
 * own documents.
 */
const tplLib = require("./template-library");
const NOT_A_RECORDS_OWN_DOCUMENT = tplLib.NOT_A_RECORDS_OWN_DOCUMENT;

/* CASES RAISED IN LEGALOS JOIN THE REGISTER THEY BELONG TO.
 *
 * The litigation register is built from the Drive trackers, and a case raised
 * in the app exists nowhere in them -- so without this it would be saved on the
 * server, correctly, and then be invisible in the one place a lawyer looks.
 *
 * Merged on EVERY build and on the restart path, because a rebuild reconstructs
 * the family from Drive and would otherwise drop them. They are marked with
 * `__origin` so the screen can say which rows came from the tracker and which
 * were typed here; the two are never made to look alike.
 *
 * Nothing is written back to Drive, and a tracker row always wins a collision:
 * if the same case later appears in the tracker, that is the authoritative copy.
 */
let localCaseStamp = "0:";

/* One money field off a case record, tolerating the older single-currency name.
   Returns "" rather than 0 for an unset figure: a blank exposure and a zero
   exposure are different statements, and summing them as the same number
   understates nothing but misreports how many cases have been assessed. */
function money(fin, key, legacyKey) {
  if (!fin) return "";
  for (const k of [key, legacyKey]) {
    if (!k) continue;
    const v = fin[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

/* THE DEPARTMENT'S OWN VERDICT, ON TOP OF THE TRACKER ROW.
   The Drive trackers carry a status column and sometimes a sentence about what
   happened; neither is a recorded outcome, and the product refuses to read a
   win out of either. What a lawyer records through "Record the decision" lives
   in config/case-outcomes.json and is laid over the register here — once, at
   the point the register is built, so the case page, the KPIs, the analytics
   and the CSV export all read exactly the same thing. */
function applyCaseOutcomes(registers) {
  try {
    const outcomes = require("./case-outcomes.js");
    outcomes.reload();
    return outcomes.applyTo((registers || {}).litigation || []);
  } catch (e) { return 0; }
}

function mergeLocalLitigationCases(registers) {
  let store;
  try { store = require("./litigation-cases"); } catch (e) { return { added: 0, skipped: "store unavailable" }; }
  const rows = registers.litigation;
  if (!Array.isArray(rows)) return { added: 0, skipped: "no litigation register" };
  let added = 0, supersededByTracker = 0;
  const norm2 = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  /* REBUILT FROM THE STORE, NOT PATCHED INTO IT.
     Skipping ids that were "already here" left ghosts: the register cache is
     written to disk with the merged rows in it, so a case that was later
     removed from the store came back on the next boot and, worse, its stale row
     blocked the real one from merging under the same id. Dropping every
     LegalOS-origin row first makes this idempotent -- run it once or five
     times, on a fresh build or a restored cache, and the register ends up
     matching the store exactly. */
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].__origin === "LEGALOS") rows.splice(i, 1);

  const fromTracker = new Set(rows.map((r) => norm2(r.caseName)).filter(Boolean));
  for (const c of store.list()) {
    /* The tracker is the source of truth. Once the same case has been written
       into it, the LegalOS copy stops being shown as a separate record --
       otherwise every case raised here would eventually appear twice. */
    if (fromTracker.has(norm2(c.title || c.caseName))) { supersededByTracker++; continue; }
    const us = (c.parties || []).find((x) => x.isUs);
    const them = (c.parties || []).find((x) => !x.isUs);
    rows.push({
      id: c.id,
      /* Mapped onto the register's own field names so a case raised here sits
         in the same columns as a tracker row. A native case that needed its own
         column set would fracture every filter, export and count. */
      caseName: c.title || c.caseName || "",
      caseNo: c.courtCaseNumber || "",
      nature: c.nature || c.caseType || "",
      court: (c.court && c.court.name) || "",
      status: c.status || "Open",
      proceedings: c.summary || "",
      entity: c.entity || (us && us.name) || "",
      filingDate: (c.dates && c.dates.filing) || "",
      nextHearing: (c.dates && c.dates.nextHearing) || "",
      lastHearing: (c.dates && c.dates.lastHearing) || "",
      position: (us && us.role) || "",
      counsel: (c.counsel && (c.counsel.lead || c.counsel.firm)) || "",
      /* Both currencies, because the imported rows carry both. `exposure` and
         `recovery` are the older single-currency names and are read as the PKR
         figure so a case raised before this change still reconciles. */
      exposurePKR: money(c.financial, "exposurePKR", "exposure"),
      exposureUSD: money(c.financial, "exposureUSD"),
      recoverablePKR: money(c.financial, "recoverablePKR", "recovery"),
      recoverableUSD: money(c.financial, "recoverableUSD"),
      /* Which of the four figures above was derived from the configured rate
         rather than entered by a person, so the screen can mark it. */
      converted: (c.financial && c.financial.converted) || null,
      /* The bills on this matter, so the record page can show them without a
         second fetch. */
      invoices: Array.isArray(c.invoices) ? c.invoices : [],
      /* Whether a conversion is even possible, so the screen can say
         "conversion pending" instead of silently showing one currency. */
      fx: (c.financial && c.financial.fx) || null,
      legalCost: (c.financial && c.financial.legalCost) === "" ? "" : (c.financial && c.financial.legalCost),
      opinion: c.outcome || "",
      counterParty: (them && them.name) || "",
      /* The module it was filed from, and the fields the litigation team
         benchmarks on. Carried onto the row so the filtered module views read
         them from the record instead of inferring them from its prose. */
      moduleKey: c.moduleKey || "cases",
      caseType: c.caseType || "",
      jurisdiction: (c.court && c.court.jurisdiction) || "",
      city: (c.court && c.court.city) || "",
      direction: c.direction || "",
      stage: c.stage || "",
      risk: c.risk || "",
      claimed: (c.financial && c.financial.claimed) === "" ? "" : (c.financial && c.financial.claimed),
      settlementPKR: (c.financial && c.financial.settlement) === "" ? "" : (c.financial && c.financial.settlement),
      reservePKR: (c.financial && c.financial.reserve) === "" ? "" : (c.financial && c.financial.reserve),
      expectedResolution: "",
      closedDate: c.closedAt || "",
      /* What "Mark decided" recorded, carried onto the register row so the
         lifecycle, the outcome and the reasoning travel with the case instead
         of living only on the detail page. */
      decisionDate: c.decisionDate || c.closedAt || "",
      outcomeSummary: c.outcomeSummary || "",
      finalNotes: c.finalNotes || "",
      motions: Array.isArray(c.motions) ? c.motions : [],
      parties: Array.isArray(c.parties) ? c.parties : [],
      deadlines: Array.isArray(c.deadlines) ? c.deadlines : [],
      timeline: Array.isArray(c.timeline) ? c.timeline : [],
      /* The operational record: every sitting, every open question, and the
         privileged notes — carried so the case page can run the matter rather
         than only describe it. */
      hearings: Array.isArray(c.hearings) ? c.hearings : [],
      informationRequests: Array.isArray(c.informationRequests) ? c.informationRequests : [],
      internalNotes: Array.isArray(c.internalNotes) ? c.internalNotes : [],
      priority: c.priority || "",
      counselDetail: c.counsel || null,
      links: c.links || {},
      dataQuality: c.dataQuality || "",
      caseDocuments: Array.isArray(c.documents) ? c.documents : [],
      /* Documents raised with the case are its own, not Drive-matched ones, so
         they are carried here rather than left for the attachment matcher. */
      driveFiles: (Array.isArray(c.documents) ? c.documents : [])
        .filter((d) => d.driveFileId)
        .map((d) => ({ id: d.driveFileId, name: d.name, folderPath: "", webViewLink: "", via: "raised-with-case" })),
      __origin: "LEGALOS",
      updatedBy: c.updatedBy || null, updatedAt: c.updatedAt || null,
      deletedAt: c.deletedAt || null, deletedBy: c.deletedBy || null,
      deletionReason: c.deletionReason || null,
      restoredAt: c.restoredAt || null, restoredBy: c.restoredBy || null,
      __sourceType: c.sourceType || "LEGALOS_NATIVE",
      __moduleKey: c.moduleKey || "cases",
      __raisedBy: c.createdBy || null,
      __raisedAt: c.createdAt || null,
      __copies: 1, __alsoIn: [],
      __source: { file: "raised in LegalOS", fileId: null, sheet: null },
    });
    added++;
  }
  /* A STAMP THE RESPONSE CACHE CAN SEE.
     The register endpoint caches serialized payloads keyed on the build
     timestamp, because a register only changes when an ingest promotes a new
     dataset. Raising a case breaks that assumption: it changes the rows without
     rebuilding, so the key stayed identical and every reader was handed the
     pre-creation payload from cache. The route logged 358 rows and returned
     357 — the case was saved, merged, and invisible.
     This stamp changes whenever the local case set does, so the cached payload
     is retired with it. */
  localCaseStamp = store.list().length + ":" + store.list()
    .reduce((acc, c) => (String(c.updatedAt || "") > acc ? String(c.updatedAt || "") : acc), "");
  return { added, supersededByTracker, held: store.count() };
}

/* NOTICES RECORDED IN LEGALOS JOIN THE NOTICES REGISTER.
 *
 * Same reasoning as the cases above, and the same failure it prevents: a
 * notice recorded through "New Legal Notice" was saved to the server and then
 * absent from the register the author was looking at, which from their side is
 * indistinguishable from not having saved at all.
 *
 * Mapped onto the register's own field names so a recorded notice sits in the
 * same columns as a tracker row, and marked `__origin: "LEGALOS"` so a reader
 * can always tell which rows came from Drive. Nothing is written to Drive.
 */
function mergeLocalNotices(registers) {
  let records;
  try { records = require("./module-records.js"); } catch (e) { return { added: 0, skipped: "store unavailable" }; }
  const rows = registers.notices;
  if (!Array.isArray(rows)) return { added: 0, skipped: "no notices register" };

  // Idempotent: drop what we added last time, then rebuild from the store.
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].__origin === "LEGALOS") rows.splice(i, 1);

  let added = 0;
  const held = records.list("notices");
  for (const rec of held) {
    const f = rec.fields || {};
    rows.push({
      id: rec.id,
      ref: "",
      noticeDate: f.noticeDate || "",
      receiptDate: f.receiptDate || "",
      sender: f.sender || "",
      recipient: f.recipient || "",
      category: f.category || "Legal Notice",
      details: f.details || "",
      status: f.status || "Pending",
      replyDate: "",
      comments: f.comments || "",
      /* What a notice has that a case does not, kept under its own names so the
         register can filter on them rather than re-reading the prose. */
      direction: f.direction || "",
      entity: f.entity || "",
      responseRequired: f.responseRequired || "",
      replyDeadline: f.replyDeadline || "",
      owner: f.owner || "",
      driveFiles: [],
      __origin: "LEGALOS",
      __sourceType: "LEGALOS_NATIVE",
      __raisedBy: rec.createdBy || null,
      __raisedAt: rec.createdAt || null,
      updatedBy: rec.updatedBy || null, updatedAt: rec.updatedAt || null,
      __copies: 1, __alsoIn: [],
      __source: { file: "recorded in LegalOS", fileId: null, sheet: null },
    });
    added++;
  }
  // Same cache-key problem the cases had: the response cache is keyed on the
  // build stamp, so without this a recorded notice is merged and then served
  // from a payload that predates it.
  return { added, held: held.length };
}

/* Read straight from the store, so the response cache is retired the moment a
   notice is recorded rather than on the next time the merge happens to run. */
function noticeStampNow() {
  let records;
  try { records = require("./module-records.js"); } catch (e) { return "0:"; }
  const held = records.list("notices");
  return held.length + ":" + held.reduce((acc, r) =>
    (String(r.updatedAt || r.createdAt || "") > acc ? String(r.updatedAt || r.createdAt || "") : acc), "");
}

function pruneTemplateLibraryFiles(registers) {
  const states = tplLib.states();
  if (!states.size) return { removed: 0, records: 0, skipped: "no template library on this host" };
  let removed = 0, touched = 0;
  const byState = {};
  for (const rows of Object.values(registers)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const keep = (r.driveFiles || []).filter((d) => {
        const st = states.get(d.id);
        if (!st || !NOT_A_RECORDS_OWN_DOCUMENT.has(st)) return true;
        byState[st] = (byState[st] || 0) + 1;
        removed++;
        return false;
      });
      if (keep.length !== (r.driveFiles || []).length) { r.driveFiles = keep; touched++; }
    }
  }
  return { removed, records: touched, byState };
}

/* A folder-derived resolution exists ONLY to carry the documents it was built
   from. If the shared-link pruner then awards its last document to a stronger
   claimant in another family -- a "Novation & Renewal" agreement filed in a
   resolutions folder is a contract, and the contracts register holds it on a
   filename match -- the record is left standing for nothing. Tracker-indexed
   records are never dropped this way: the business asserted those exist, and
   one with no document found is a real finding, not an artifact. */
function dropEmptyDerivedResolutions(registers) {
  const rows = registers.resolutions;
  if (!Array.isArray(rows)) return 0;
  let dropped = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && r.origin === "RESOLUTION_SOURCE_DRIVE" && !(r.driveFiles || []).length) { rows.splice(i, 1); dropped++; }
  }
  return dropped;
}

function pruneSharedLinks(registers) {
  // Pass 1 — every holder of every file, with the strength of its claim.
  const holders = new Map();
  for (const [famKey, fam] of Object.entries(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) for (const f of r.driveFiles || []) {
      if (!holders.has(f.id)) holders.set(f.id, []);
      holders.get(f.id).push({ famKey, record: r, rank: LINK_EVIDENCE(f.via), score: f.score || 0 });
    }
  }

  // Pass 2 — decide, per file, which records may keep it.
  const keep = new Map();                       // fileId -> Set of records
  for (const [id, hs] of holders) {
    if (hs.length === 1) continue;              // nothing to decide
    const top = Math.max(...hs.map((h) => h.rank));
    const best = hs.filter((h) => h.rank === top);
    if (top === 3) {
      // Cited by name. Every citing record keeps it; records that only guessed
      // at it do not. A citation is the source speaking, so it may cross a
      // group — that is the one case where the source itself says a document
      // belongs to two families.
      keep.set(id, new Set(best.map((h) => h.record)));
      continue;
    }
    if (top === 2) {
      /* A deterministic folder link. Keep every holder inside the single
         strongest module GROUP; drop other groups, because a case folder is not
         evidence about a contract. Ties go to the group claiming it most often —
         the folder belongs where its records are. */
      const perGroup = new Map();
      for (const h of best) {
        const g = FAMILY_GROUP[h.famKey] || h.famKey;
        perGroup.set(g, (perGroup.get(g) || 0) + 1);
      }
      const winGroup = [...perGroup.entries()].sort((a, b) => b[1] - a[1])[0][0];
      keep.set(id, new Set(best.filter((h) => (FAMILY_GROUP[h.famKey] || h.famKey) === winGroup).map((h) => h.record)));
      continue;
    }
    // A guess. Exactly one owner: the strongest claim, ties broken by score.
    const win = best.sort((a, b) => b.score - a.score)[0];
    keep.set(id, new Set([win.record]));
  }

  let pruned = 0;
  for (const fam of Object.values(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) {
      if (!r.driveFiles || !r.driveFiles.length) continue;
      const before = r.driveFiles.length;
      r.driveFiles = r.driveFiles.filter((f) => !keep.has(f.id) || keep.get(f.id).has(r));
      pruned += before - r.driveFiles.length;
    }
  }
  return pruned;
}

/* A link is only worth having while the file is still there.
   Drive moves on: documents get moved, renamed into another tree, or deleted.
   The register cache keeps its links across restarts, so without this a record
   goes on advertising a document that no longer exists and the Documents tab
   opens a dead reference. Stale links are removed and COUNTED, never silently
   left in place. */
function revalidateLinks(registers) {
  const st = drive.status ? drive.status() : {};
  // Only prune against an index we TRUST. A throttled or partial crawl comes
  // back smaller than reality, and pruning against it would delete links to
  // documents that are still sitting in Drive. When the index is degraded the
  // links are left exactly as they are and the fact is reported.
  if (st.degraded || st.unreadableFolders) {
    return { removed: 0, checked: 0, skipped: "drive index is degraded — links left untouched" };
  }
  const live = new Set(drive.indexFiles().map((f) => f.id));
  if (!live.size) return { removed: 0, checked: 0, skipped: "drive index is empty — nothing revalidated" };
  let removed = 0, checked = 0;
  for (const fam of Object.values(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) {
      if (!r.driveFiles || !r.driveFiles.length) continue;
      checked += r.driveFiles.length;
      const before = r.driveFiles.length;
      r.driveFiles = r.driveFiles.filter((f) => live.has(f.id));
      removed += before - r.driveFiles.length;
    }
  }
  return { removed, checked };
}

/* EVERY DRIVE FILE GETS A DISPOSITION.
   "839 documents are orphaned" is a finding, not an outcome. Each file in the
   estate is classified into exactly one bucket, so a document is either
   attached to a record, explained as shared/template/project material, or
   listed as genuinely unresolved for a steward to look at. Nothing is
   invisible, and nothing is attached to a record without evidence. */
const DOC_DISPOSITIONS = [
  "RECORD_DOCUMENT", "MULTI_RECORD_DOCUMENT", "PROJECT_DOCUMENT", "MODULE_DOCUMENT",
  "TEMPLATE", "REFERENCE", "SOURCE_TRACKER", "SYSTEM_FILE", "UNRESOLVED",
];

function classifyDocuments(registers) {
  const files = drive.indexFiles();
  // record links, by file id
  const linked = new Map();
  for (const [famKey, fam] of Object.entries(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) for (const f of r.driveFiles || []) {
      if (!linked.has(f.id)) linked.set(f.id, []);
      linked.get(f.id).push({ family: famKey, id: r.id, via: f.via });
    }
  }

  const out = [];
  const counts = {};
  const bump = (d) => { counts[d] = (counts[d] || 0) + 1; };

  /* The statutory root is classified from its own folder grammar, by the same
     module the reconciler uses. Without this, the two surfaces disagreed in
     public: tools/full-reconcile.js reported 0 unresolved while the Data Health
     page showed 3,323, because the fallback below only recognises the
     litigation/compliance/commercial roots and everything else drops through to
     UNRESOLVED. Two classifiers are a liability; one shared source of truth for
     this root is the point. */
  const secpDisp = new Map();
  try {
    for (const d of require("./secp-source").build().documents) {
      secpDisp.set(d.fileId, {
        disposition: "SECP_" + d.category,
        reason: "statutory file: " + d.entityName + (d.year ? " · " + d.year : "") + (d.form ? " · Form " + d.form : ""),
      });
    }
  } catch (e) { /* the statutory root may not be shared; the rest still classifies */ }

  for (const f of files) {
    const name = f.name || "";
    const folder = String(f.folderPath || "");
    const lowerFolder = folder.toLowerCase();
    const lowerName = name.toLowerCase();
    let disposition, reason;

    const links = linked.get(f.id) || [];
    if (/^~\$/.test(name) || /\.tmp$/i.test(name) || /^\./.test(name) || /desktop\.ini$/i.test(name)) {
      disposition = "SYSTEM_FILE"; reason = "editor lock file / OS artefact";
    } else if (/spreadsheetml|ms-excel/i.test(f.mimeType || "") || /\.xlsx?$/i.test(name)) {
      // A workbook is either a register this app reads, or a spreadsheet that
      // is not a legal register at all. Either way it is a SOURCE, not a
      // record's document.
      const claimed = FAMILIES.some((fam) => fam.match(f));
      disposition = "SOURCE_TRACKER";
      reason = claimed ? "ingested as a register source" : "spreadsheet; no register family claims it";
    } else if (links.length === 1) {
      disposition = "RECORD_DOCUMENT"; reason = "linked to " + links[0].id + " via " + links[0].via;
    } else if (links.length > 1) {
      disposition = "MULTI_RECORD_DOCUMENT";
      reason = "linked to " + links.length + " records (" + [...new Set(links.map((l) => l.via))].join(", ") + ")";
    } else if (secpDisp.has(f.id)) {
      ({ disposition, reason } = secpDisp.get(f.id));
    } else if (/template|standard form|format|specimen|draft form|precedent/.test(lowerFolder + " " + lowerName)) {
      disposition = "TEMPLATE"; reason = "template / precedent material";
    } else if (/zd projects|project properties|approvals|land docs|noc/.test(lowerFolder)) {
      disposition = "PROJECT_DOCUMENT"; reason = "project hierarchy: " + folder.split(" / ").slice(1, 3).join(" / ");
    } else if (/tracker|summary|master data|circular|policy|guideline|law|act\b|rules/.test(lowerFolder + " " + lowerName)) {
      disposition = "MODULE_DOCUMENT"; reason = "module-level material, not tied to one record";
    } else if (/litigation|compliance|commercial/i.test(String(f.root || ""))) {
      disposition = "REFERENCE"; reason = "filed under " + f.root + " but no record cites it";
    } else {
      disposition = "UNRESOLVED"; reason = "no record reference, no recognised folder role";
    }

    bump(disposition);
    out.push({
      id: f.id, name, mimeType: f.mimeType, size: f.size || 0,
      root: f.root, folderPath: folder, webViewLink: f.webViewLink || "",
      disposition, reason, records: links.map((l) => l.id),
    });
  }
  return { counts, files: out };
}

/* Everything the ingest could NOT place, counted rather than swallowed. This is
   what the diagnostics surface reads, so a mapping regression shows up as a
   number instead of as documents quietly vanishing from a Documents tab. */
function linkDiagnostics(registers) {
  const perFile = new Map();
  let records = 0, withDocs = 0, links = 0;
  for (const fam of Object.values(registers)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) {
      records++;
      const dfs = r.driveFiles || [];
      if (dfs.length) withDocs++;
      links += dfs.length;
      for (const f of dfs) perFile.set(f.id, (perFile.get(f.id) || 0) + 1);
    }
  }
  const docFiles = drive.indexFiles().filter(isDocFile);
  return {
    records, recordsWithDocuments: withDocs, recordsWithoutDocuments: records - withDocs,
    driveDocumentFiles: docFiles.length,
    documentsLinked: perFile.size,
    documentsUnlinked: docFiles.filter((f) => !perFile.has(f.id)).length,
    documentsOnMultipleRecords: [...perFile.values()].filter((n) => n > 1).length,
    totalLinks: links,
  };
}

/* ---- compliance & project document linking ----
   The commercial matcher above is tuned to the contract book. The compliance
   families (resolutions, loans, licences) and the ZD project properties are
   filed differently: one folder per entity / loan / authority / project, with
   the tracker spreadsheet sitting alongside the documents it lists. So the match
   is folder-level, scoped to the relevant Drive subtree, and it uses a LIGHTER
   tokeniser than docTokens — the commercial stop-list eats "zameen",
   "developments", "media", which are exactly the words that tell two entities
   apart here. */
const ENTITY_STOP = new Set("the and for of to pvt private limited ltd smc llc inc co company companies group holding holdings corp date".split(" "));
function nameTokens(s) {
  return String(s == null ? "" : s)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|jpe?g|jfif|png)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !ENTITY_STOP.has(t));
}
// A real document, not a tracker spreadsheet or an editor artefact.
function isDocFile(f) {
  const n = f.name || "";
  if (/^~\$/.test(n) || /\.tmp$/i.test(n) || /^\./.test(n) || /desktop\.ini$/i.test(n)) return false;
  if (/spreadsheetml|ms-excel/i.test(f.mimeType || "")) return false; // the trackers themselves
  return true;
}
const liteFile = (via) => (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || 0, folderPath: f.folderPath || "", webViewLink: f.webViewLink || "", modifiedTime: f.modifiedTime || "", via });

// Generic best-folder matcher: group the in-scope documents by a folder key,
// score each group's tokens against the record's identity text (IDF-weighted so
// a distinctive party/project name carries the match), attach the winning
// group's documents. Never clobbers a record that already resolved precisely.
function attachFolderDocs(records, opts) {
  if (!records || !records.length) return;
  const { scope, keyOf, textOf, tokenize = nameTokens, stop = new Set(), minShared = 2, cap = 30, via = "folder" } = opts;
  const files = drive.indexFiles().filter(scope).filter(isDocFile);
  if (!files.length) return;
  const lite = liteFile(via);
  const byKey = new Map();
  for (const f of files) { const k = keyOf(f); if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(f); }
  const groups = [...byKey.entries()].map(([key, fs]) => ({
    key, files: fs,
    tokens: new Set(tokenize((key.split(" / ").slice(-1)[0] || "") + " " + fs.map((x) => x.name).join(" ")).filter((t) => !stop.has(t))),
  }));
  const df = new Map();
  for (const g of groups) for (const t of g.tokens) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t) => Math.log((groups.length + 1) / ((df.get(t) || 0) + 1)) + 1;
  for (const r of records) {
    if (r.driveFiles && r.driveFiles.length) continue;
    const q = tokenize(textOf(r)).filter((t) => !stop.has(t));
    if (!q.length) continue;
    let best = null, bestScore = 0, bestShared = 0;
    for (const g of groups) {
      let score = 0, shared = 0;
      for (const t of q) if (g.tokens.has(t)) { score += idf(t); shared++; }
      if (score > bestScore) { bestScore = score; best = g; bestShared = shared; }
    }
    if (best && bestShared >= minShared) r.driveFiles = best.files.slice(0, cap).map(lite);
  }
}

// Resolutions resolve to the SINGLE numbered file in the entity's folder: the
// tracker sheet sits in the same Drive folder as "001_…", "002_…", so scope by
// the record's own provenance folder and match docNo → the file's leading
// number, falling back to an agenda-token match within that folder.
/* The company a resolution folder belongs to. The folder names the entity and
   then says what it holds -- "Zameen Axis(SMC-Pvt)Ltd_Resolutions &
   Authorizations", "TAAD-Resolutions & Authorizations" -- so the suffix is
   dropped and the remainder canonicalised through the entity registry. The
   folder name itself is never rewritten; this only decides what to DISPLAY. */
function entityFromResolutionFolder(name) {
  /* The folder is "<entity><separator><what it holds>", and what it holds is
     written in either order ("Resolutions & Authorizations", "Authorizations &
     Resolutions") and sometimes carries Drive's "(1)" copy suffix. Cutting at
     the first separator that introduces either word handles all of them,
     where a chain of trailing-suffix strips did not. */
  const raw = String(name || "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/[\s_-]+(and|&)?[\s_-]*(resolutions?|authorisations?|authorizations?)\b.*$/i, "")
    .replace(/[_\s-]+$/, "").trim();
  if (!raw) return null;
  try {
    const reg = require("./entities.js");
    const key = reg.entityKey(raw);
    const canon = reg.displayName ? reg.displayName(key) : null;
    return canon || raw;
  } catch (e) { return raw; }
}

/* ONE RESOLUTION, EVERY DOCUMENT THAT BELONGS TO IT.
   The tracker sheet sits in the same Drive folder as the resolutions it
   indexes ("001_…", "002_…"), so a record is scoped to its OWN provenance
   folder and matched on the register number the company assigned.
   Two things this used to get wrong:

   1. It looked only under "Compliance Data _LegalOS". But 47 resolution
      folders span TWO roots -- the other is each company's own SECP folder
      ("<entity>-Resolutions & Authorizations") -- so every resolution filed
      there resolved to no document at all. The record's own provenance folder
      already names its root; restricting by root on top of that only lost
      files.

   2. It attached the FIRST matching file and stopped. A resolution is rarely
      one PDF: there is the resolution, the board minute, the notice, the
      signed copy, the acknowledgement. Capping at one hid the rest.

   The number grammar is the company's, not ours: 002, 02, 99.1 (a sub-number)
   and 129A (a companion document) all belong to their resolution. */
function attachResolutionDocs(records) {
  if (!records || !records.length) return;
  const files = drive.indexFiles().filter((f) => /resolution/i.test(f.folderPath || "") && isDocFile(f));
  if (!files.length) return;
  const lite = liteFile("resolution");
  const prov = require("./drive-provenance.js");
  const byFolder = new Map();
  for (const f of files) { const k = f.folderPath || ""; if (!byFolder.has(k)) byFolder.set(k, []); byFolder.get(k).push(f); }
  // The leading register number, with its sub-number and letter variant.
  const leadNo = (name) => {
    const m = String(name).match(/^\s*0*(\d{1,4})(?:\.(\d{1,3}))?([A-Za-z])?\s*[\s_\-.]/);
    return m ? parseInt(m[1], 10) : null;
  };
  for (const r of records) {
    /* A folder-derived record already holds exactly the files it was built
       from. Running the tracker matcher over it re-attaches by agenda tokens
       and overwrites them -- that is how the record built from an unnumbered
       "Novation & Renewal" PDF came to cite the numbered 99.3 one instead,
       leaving its own source file mapped to nothing. */
    if (r.origin === "RESOLUTION_SOURCE_DRIVE") continue;
    const folder = r.__source && r.__source.folder;
    if (!folder) continue;
    // documents in the provenance folder or any subfolder of it
    let inFolder = byFolder.get(folder) || [];
    if (!inFolder.length) {
      inFolder = files.filter((f) => (f.folderPath || "") === folder || String(f.folderPath || "").startsWith(folder + " / "));
    }

    /* The source entity folder is structural truth. It is recorded verbatim,
       with its Drive ids, whatever the register chooses to display. */
    const sp = prov.forFolderPath(folder);
    if (sp) {
      /* The display entity is canonical; the SOURCE entity folder is kept
         verbatim beside it. "Zameen Axis(SMC-Pvt)Ltd_Resolutions &
         Authorizations" reads as "Zameen Axis" in the register and still
         reports the exact folder it came from. */
      r.entity = entityFromResolutionFolder(sp.sourceFolderName);
      r.sourceEntityFolder = sp.sourceFolderName;
      r.sourceFolderId = sp.sourceFolderId;
      r.sourceRootName = sp.sourceRootName;
      r.sourceRootId = sp.sourceRootId;
      r.parentFolderId = sp.parentFolderId;
      r.fullDrivePath = sp.fullDrivePath;
    }
    if (!inFolder.length) continue;

    const docNo = parseInt(r.docNo, 10);
    let hits = [];
    if (!isNaN(docNo)) hits = inFolder.filter((f) => leadNo(f.name) === docNo);
    if (!hits.length) {
      const q = nameTokens(r.agenda);
      if (q.length) {
        let best = null, bestShared = 0;
        for (const f of inFolder) {
          const ts = new Set(nameTokens(f.name));
          let sh = 0; for (const t of q) if (ts.has(t)) sh++;
          if (sh > bestShared) { bestShared = sh; best = f; }
        }
        if (best && bestShared >= 2) hits = [best];
      }
    }
    if (hits.length) r.driveFiles = hits.map(lite);
  }
}

// Legal notices are filed flat in one "Legal Notice" folder under the litigation
// root, named "Legal Notice_<party>_<subject>". A folder match can't tell them
// apart, so this is a FILE-level token match: the notice's counterparties and
// subject are scored against each notice file's name (IDF-weighted). Only ~30 of
// the 205 logged notices have an uploaded PDF, so most stay honestly unlinked.
// NOTE: notices are deliberately NOT auto-linked to their PDFs. Only ~30 of the
// 205 logged notices have an uploaded file, and the tracker's free-text subject
// does not share a dependable key with the filenames (both parties are usually
// "Zameen Media"), so every attempted match produced confident-wrong links —
// exactly the fabricated relationships the brief forbids. The 30 notice PDFs
// remain fully viewable through Precedents & Playbooks / Knowledge search.

/* Loans join their folder on the AGREEMENT DATE, which both sides state.
   The tracker writes "Loan Agreement dated 02-Sep-2020"; the folder is named
   "1. ZVO - EMPG Projects - Loan AED 3.6mil. [Loan Agreement dated 02.09.2020]"
   or "…_20131015". Same date, three spellings. Normalising all three to an ISO
   day turns what used to be a token-similarity guess into an exact join on a
   value the source itself wrote — which matters here, because these folders
   hold five near-identical AED 3.6m loans between the same two parties that
   differ ONLY by date. Token matching cannot tell them apart and was giving
   whole folders to the wrong drawdown. */
const LOAN_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function loanDates(s) {
  const out = new Set();
  const t = String(s == null ? "" : s);
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  for (const m of t.matchAll(/\b(\d{1,2})[-.\/ ]([A-Za-z]{3,9})[-.\/ ](\d{4})\b/g)) {
    const mo = LOAN_MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) out.add(iso(m[3], mo, m[1]));
  }
  for (const m of t.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/g)) {
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) out.add(iso(m[3], m[2], m[1]));
  }
  for (const m of t.matchAll(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g)) out.add(iso(m[1], m[2], m[3]));
  return out;
}

function attachLoanFolders(records) {
  if (!records || !records.length) return 0;
  const files = drive.indexFiles()
    .filter((f) => /loan/i.test(f.folderPath || "") && /^compliance/i.test(f.root || "") && isDocFile(f));
  if (!files.length) return 0;
  const lite = liteFile("loan-folder-date");

  /* Group by the LOAN folder — the highest segment that names a loan. Files
     deeper down ("00. Original Request", "Signed") belong to the same loan. */
  const byLoanFolder = new Map();
  for (const f of files) {
    const segs = String(f.folderPath || "").split(" / ");
    const i = segs.findIndex((x) => /loan/i.test(x) && loanDates(x).size);
    if (i < 0) continue;
    const key = segs.slice(0, i + 1).join(" / ");
    if (!byLoanFolder.has(key)) byLoanFolder.set(key, { key, name: segs[i], dates: loanDates(segs[i]), files: [] });
    byLoanFolder.get(key).files.push(f);
  }
  const groups = [...byLoanFolder.values()];
  // An index from day -> the folders bearing it, so an ambiguous day is visible
  // rather than silently resolved to whichever folder was seen first.
  const byDate = new Map();
  for (const g of groups) for (const d of g.dates) {
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(g);
  }

  let linked = 0;
  for (const r of records) {
    if (r.driveFiles && r.driveFiles.length) continue;
    const days = loanDates(r.agreementDate);
    if (!days.size) continue;
    let hits = [];
    for (const d of days) for (const g of byDate.get(d) || []) if (!hits.includes(g)) hits.push(g);
    if (hits.length > 1) {
      /* Two loans signed the same day. Break the tie only on the AMOUNT, which
         the folder also states ("AED 3.6 mil.", "PKR 6.5 bil"). If that does not
         separate them, leave the record unlinked: a document on the wrong
         drawdown is worse than a record with no document. */
      const cur = String(r.currency || "").toLowerCase();
      const amt = Number(r.amount) || 0;
      const scaled = amt >= 1e9 ? amt / 1e9 : amt >= 1e6 ? amt / 1e6 : amt;
      const unit = amt >= 1e9 ? /bil/i : amt >= 1e6 ? /mil/i : /./;
      const near = hits.filter((g) => {
        const n = g.name.toLowerCase();
        if (cur && !n.includes(cur)) return false;
        if (!unit.test(n)) return false;
        const nums = [...n.matchAll(/(\d+(?:\.\d+)?)\s*(?:mil|bil)/g)].map((m) => parseFloat(m[1]));
        return nums.some((v) => Math.abs(v - scaled) < 0.051);
      });
      if (near.length !== 1) continue;
      hits = near;
    }
    if (hits.length !== 1) continue;
    r.driveFiles = hits[0].files.map(lite);
    linked++;
  }
  return linked;
}

/* A PROJECT'S OWN FOLDER, matched by NAME rather than by score.
   The ZD Projects root names every folder after its project — "Boulevard
   Heights", "Zameen Jade", "Golf View Rumanza" — so there is nothing to infer.
   The token-scoring matcher that used to do this job left seven projects with
   no documents at all while a folder bearing each one's name sat in the root,
   because the best-scoring group for a two-word project is whichever folder
   happens to repeat those words most in its file names, not the folder called
   after it. Reading the folder name is both simpler and correct.

   ONE tolerated spelling difference: the tracker writes "Zameen Pheonix" and
   Drive writes "Zameen Phoenix". That is a transposition of two adjacent
   letters in a 14-character name, so it is accepted — the source disagrees with
   itself about the spelling and neither side is edited. Anything looser would
   start inventing matches, so this is limited to a single adjacent-letter swap. */
function transposedOnce(a, b) {
  if (a.length !== b.length || a.length < 8) return false;
  const d = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i);
  return d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]];
}

function attachProjectFolders(records) {
  if (!records || !records.length) return 0;
  const files = drive.indexFiles().filter((f) => /ZD Projects/i.test(f.root || "") && isDocFile(f));
  if (!files.length) return 0;
  const byFolder = new Map();
  for (const f of files) {
    const seg = String(f.folderPath || "").split(" / ")[1];
    if (!seg) continue;
    if (!byFolder.has(seg)) byFolder.set(seg, []);
    byFolder.get(seg).push(f);
  }
  // "Zameen Ace Homes (ZAH)" and "Zameen Vault_" are the same project as their
  // tidier spellings; strip the parenthetical and the trailing underscore.
  const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");
  const lite = liteFile("project-folder");

  let attached = 0;
  for (const r of records) {
    const key = norm(r.project);
    if (key.length < 6) continue;
    const mine = [];
    for (const [folder, fs2] of byFolder) {
      const fk = norm(folder);
      if (fk === key || fk.startsWith(key) || key.startsWith(fk) || transposedOnce(fk, key)) mine.push(...fs2);
    }
    if (!mine.length) continue;
    const have = new Set((r.driveFiles || []).map((d) => d.id));
    for (const f of mine) if (!have.has(f.id)) { (r.driveFiles = r.driveFiles || []).push(lite(f)); have.add(f.id); attached++; }
  }
  return attached;
}

/* PROJECT PROMOTION AGREEMENTS (PPAs).
   "Commercial_Zameen Media Contracts / Zameen Media PPA's / <region> /
   <project>" holds the agreements under which Zameen Media promotes a
   developer's project. The folders are named after the project — "Icon Valley
   Phase II- New Extension_", "Madison Square (Tipu Block)", "Marbella Drive" —
   and the contracts tracker has a record with that project as its title, so the
   join is the source naming the same thing twice.

   THE MOST SPECIFIC RECORD WINS. There are seventeen Icon Valley contracts; if
   every record whose title is a prefix of the folder took its documents, the
   generic "Icon Valley" row would swallow Phase II's file. So the longest
   matching title decides, and only records matching at that length keep it.
   Where the two spellings genuinely differ — "Al Madev II (Multan)" against a
   record called "Al Madev Complex I" — nothing is attached: Al Madev I and
   Al Madev II are different projects and guessing between them is exactly the
   error this rule exists to prevent. */
function attachPpaFolders(records) {
  if (!records || !records.length) return 0;
  const BRANCH = /Zameen Media PPA/i;
  const files = drive.indexFiles().filter((f) => BRANCH.test(f.folderPath || "") && isDocFile(f));
  if (!files.length) return 0;

  const byFolder = new Map();
  for (const f of files) {
    const segs = String(f.folderPath || "").split(" / ");
    const i = segs.findIndex((x) => BRANCH.test(x));
    // region is segs[i+1]; the project folder, when there is one, is segs[i+2]
    const proj = segs[i + 2];
    if (!proj) continue;                       // filed straight under a region
    const key = segs.slice(0, i + 3).join(" / ");
    if (!byFolder.has(key)) byFolder.set(key, { name: proj, files: [] });
    byFolder.get(key).files.push(f);
  }
  const norm = (v) => String(v || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]/g, "");
  /* The project's SIGNATURE: its name with the words that describe where or what
     it is removed, so "Al Madev Complex I" and the folder "Al Madev I (Multan)"
     reduce to the same string. Equality on this is what lets Al Madev I and
     Al Madev II be told apart — a prefix test cannot, because "almadevi" is a
     prefix of "almadevii" and would hand one project the other's file. */
  const sig = (v) => norm(String(v || "").replace(/\b(complex|project|tower|mall|multan|lahore|karachi|islamabad|rawalpindi|faisalabad|the)\b/gi, " "));
  const lite = liteFile("ppa-folder");

  let attached = 0;
  for (const [, grp] of byFolder) {
    const fk = norm(grp.name);
    const fsig = sig(grp.name);
    // An exact signature match is the strongest answer and settles the folder.
    // No minimum length is imposed here: equality is already decisive, and the
    // ten-character floor below (which exists to keep a SHORT name from
    // prefix-matching half the register) was silently skipping both Al Madev
    // folders — "almadevii" is nine characters — so two projects that name
    // themselves identically on both sides were never even compared.
    let cands = records.filter((r) => sig(r.title).length >= 7 && sig(r.title) === fsig);
    if (!cands.length) {
      if (fk.length < 10) continue;
      let bestLen = 0;
      cands = [];
      for (const r of records) {
        const tk = norm(r.title);
        if (tk.length < 10) continue;
        if (!fk.startsWith(tk) && !tk.startsWith(fk)) continue;
        const len = Math.min(tk.length, fk.length);
        if (len > bestLen) { bestLen = len; cands.length = 0; }
        if (len === bestLen) cands.push(r);
      }
    }
    if (!cands.length) continue;
    for (const r of cands) {
      const have = new Set((r.driveFiles || []).map((d) => d.id));
      for (const f of grp.files) if (!have.has(f.id)) { (r.driveFiles = r.driveFiles || []).push(lite(f)); have.add(f.id); attached++; }
    }
  }

  /* PPAs filed straight under a region, with no project folder of their own.
     These name their project in the FILE name — "PPA_RiverCourtyardTowerII_
     20220520.pdf", "River Hills IV_(Rawalpindi)_PPA_20200221.pdf" — so the
     record's title appearing inside the filename is the join. The title must be
     at least 12 characters once normalised, which is long enough that a
     containment cannot be coincidental. */
  const loose = files.filter((f) => String(f.folderPath || "").split(" / ").length === 3);
  for (const f of loose) {
    const fn = norm(f.name);
    let best = null, bestLen = 0;
    for (const r of records) {
      const tk = norm(r.title);
      /* A GENERIC TITLE IS NOT AN IDENTITY. Length alone is no protection:
         "thirdamendment" is fourteen characters and matched
         "ThirdAmendmentofGrandOrchard", "firstamendment" matched
         "FirstAmendmentV9mall", and a record literally called "Project
         Promotion Agreement" matched a file of that name belonging to somebody
         else's project. Ten wrong links, all from titles that describe what an
         instrument IS rather than which one it is. */
      if (tk.length < 12 || GENERIC_TITLES.has(tk) || !fn.includes(tk)) continue;
      if (tk.length > bestLen) { bestLen = tk.length; best = r; }
    }
    if (!best) continue;
    const have = new Set((best.driveFiles || []).map((d) => d.id));
    if (have.has(f.id)) continue;
    (best.driveFiles = best.driveFiles || []).push(lite(f));
    attached++;
  }
  return attached;
}

/* A PROJECT'S SALE DEEDS.
   "Commercial_Zameen Media Contracts / Zameen - Pakistan Contract Templates /
   Agreement to Sell & Sale Deeds" holds 324 documents in 24 folders, and each
   folder is named after a project: "Zameen Arx - Lahore", "ZD - Downtown
   Rumanza - Multan", "Zameen Vault-NSIT-Lahore". They are that project's sale
   agreements and their variants ("without GR" — without guaranteed return).

   None of them were reaching the product. The project matcher only looked
   inside the ZD Projects root, so Zameen Jade, Zameen Vault, Golf View Rumanza,
   Downtown Rumanza, Boulevard Heights, Grande Palladium and Zameen Pheonix all
   showed ZERO documents while their papers sat in a folder bearing their name.

   The join is the folder name containing the project name, which is the source
   labelling its own folder — not a similarity score. A project name must be at
   least 8 characters once normalised, so a short one cannot sweep up folders it
   does not own. */
function attachProjectSaleDeeds(records) {
  if (!records || !records.length) return 0;
  const BRANCH = /Agreement to Sell & Sale Deeds/i;
  const files = drive.indexFiles().filter((f) => BRANCH.test(f.folderPath || "") && isDocFile(f));
  if (!files.length) return 0;

  // Group by the PROJECT folder — the segment immediately under the branch.
  const byProject = new Map();
  for (const f of files) {
    const segs = String(f.folderPath || "").split(" / ");
    const i = segs.findIndex((x) => BRANCH.test(x));
    const proj = segs[i + 1];
    if (!proj) continue;                        // loose in the branch: not a project's
    if (!byProject.has(proj)) byProject.set(proj, []);
    byProject.get(proj).push(f);
  }
  const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const lite = liteFile("project-sale-deeds");

  let attached = 0;
  for (const r of records) {
    const key = norm(r.project);
    if (key.length < 8) continue;
    const mine = [];
    for (const [folder, fs2] of byProject) if (norm(folder).includes(key)) mine.push(...fs2);
    if (!mine.length) continue;
    const have = new Set((r.driveFiles || []).map((d) => d.id));
    for (const f of mine) if (!have.has(f.id)) { (r.driveFiles = r.driveFiles || []).push(lite(f)); have.add(f.id); attached++; }
  }
  return attached;
}

// Wire the compliance + project matchers over their Drive subtrees.
/* A RESOLUTION THE TRACKER NEVER INDEXED IS STILL A RESOLUTION.
   The register is built from each folder's summary sheet, so a company that
   files its resolutions in Drive without maintaining that sheet had no records
   at all -- Dubizzle Labs' entire board-resolution history and eight of Zameen
   Medallion's were invisible, 33 documents in total. The folder IS the source
   index; a spreadsheet is not required before a record may exist.

   These records are marked as folder-derived so nobody mistakes them for
   tracker-indexed ones, and they carry the same Drive provenance. */
function addUntrackedResolutions(records) {
  const prov = require("./drive-provenance.js");
  const lite = liteFile("resolution");
  /* Rebuilt from the folder every time, never accumulated: a stale one from a
     previous build would both duplicate and drift from the source. */
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i] && records[i].origin === "RESOLUTION_SOURCE_DRIVE") records.splice(i, 1);
  }
  const claimed = new Set();
  for (const r of records) for (const d of (r.driveFiles || [])) claimed.add(d.id || d.fileId);

  const files = drive.indexFiles()
    .filter((f) => /resolution/i.test(f.folderPath || "") && isDocFile(f) && !claimed.has(f.id));
  if (!files.length) return 0;

  /* One record per register number within a folder: the numbered document and
     any companion filed under the same number belong together. A document with
     no number of its own stands as its own record rather than being folded
     into a neighbour it may have nothing to do with. */
  const groups = new Map();
  for (const f of files) {
    const m = String(f.name).match(/^\s*0*(\d{1,4})(?:\.(\d{1,3}))?([A-Za-z])?\s*[\s_\-.]/);
    const num = m ? parseInt(m[1], 10) : null;
    const key = (f.folderPath || "") + "||" + (num == null ? "~" + f.id : num);
    if (!groups.has(key)) groups.set(key, { folder: f.folderPath || "", num, files: [] });
    groups.get(key).files.push(f);
  }

  let added = 0;
  for (const g of groups.values()) {
    const sp = prov.forFolderPath(g.folder);
    const lead = g.files.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))[0];
    const agenda = String(lead.name)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/^\s*\d{1,4}(\.\d{1,3})?[A-Za-z]?[\s_\-.]+/, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .replace(/[_]+/g, " ").trim();
    /* THE DATE IS IN THE FILE NAME, AND THE FILE NAME IS THE SOURCE.
       These records are derived from a document rather than a tracker row, so
       `date` was hard-coded null and all 32 counted as incomplete. But this
       estate names resolution documents to a firm convention — the date of the
       resolution, as YYYYMMDD, at the end:
           12_Meeting Minutes_..._Dubizzle Labs Letterhead 20260825.pdf
       Twenty-nine of the thirty-two carry one. It is read strictly (a real
       month and a real day, bounded, so a 9-digit serial is NOT mistaken for a
       date) and recorded as coming from the file name.
       Drive's own createdTime is deliberately NOT used as a fallback: that is
       when somebody uploaded the scan, which is not when the board resolved. */
    /* WHERE THE FILE NAME CARRIES NO DATE, THE DOCUMENT DOES.
       The remaining scans were rendered and read (tools/resolution-dates.js),
       which settled two of them — including one whose file name says
       "202508022" and whose first page says 22 August 2025. The document wins
       over the file name every time. */
    const fromDocument = (() => {
      const id = "RES-D-" + String(lead.id).slice(-8).toUpperCase();
      const hit = readResolutionDates()[id];
      if (!hit) return null;
      const iso = hit.documentDate || hit.meetingDate;
      if (!iso) return null;
      return { iso, from: hit.documentDate ? "the date printed on the document" : "the meeting date the document records",
        basis: hit.dateBasis || null, fileId: hit.source && hit.source.driveId, name: hit.source && hit.source.name };
    })();
    const dateFromName = fromDocument || (() => {
      for (const f of g.files) {
        const m = String(f.name).match(/(?:^|[^\d])(20\d{2})[-_. ]?(0[1-9]|1[0-2])[-_. ]?(0[1-9]|[12]\d|3[01])(?![\d])/);
        if (m) return { iso: m[1] + "-" + m[2] + "-" + m[3], from: f.name, fileId: f.id };
      }
      return null;
    })();
    records.push({
      id: "RES-D-" + String(lead.id).slice(-8).toUpperCase(),
      docNo: g.num,
      agenda: agenda || lead.name,
      date: dateFromName ? dateFromName.iso : null,
      __resolvedFromDrive: dateFromName
        ? { date: { from: dateFromName.from || "resolution document file name",
            driveId: dateFromName.fileId, name: dateFromName.name || dateFromName.from,
            basis: dateFromName.basis || null,
            state: fromDocument ? "DATE_EVIDENCED_FROM_DOCUMENT" : "DATE_EVIDENCED_FROM_FILE_NAME" } }
        : undefined,
      __notEvidenced: dateFromName ? undefined : {
        date: {
          reason: "NOT_EVIDENCED_IN_SOURCE",
          reasonCode: "RESOLUTION_DATE_NOT_EVIDENCED_IN_SOURCE",
          detail: "There is no tracker row for this resolution, its file name carries no date, and the document "
            + "itself has been rendered and read — no date is printed on it. Drive's own upload time is "
            + "deliberately not substituted: that is when the scan was filed, not when the board resolved.",
          searchedIn: "the file name, and every page of the document itself",
        },
      },
      entity: entityFromResolutionFolder(sp && sp.sourceFolderName),
      sourceEntityFolder: sp && sp.sourceFolderName,
      sourceFolderId: sp && sp.sourceFolderId,
      sourceRootName: sp && sp.sourceRootName,
      sourceRootId: sp && sp.sourceRootId,
      parentFolderId: sp && sp.parentFolderId,
      fullDrivePath: sp && sp.fullDrivePath,
      driveFiles: g.files.map(lite),
      // Says plainly where this record came from: the folder, not a tracker.
      origin: "RESOLUTION_SOURCE_DRIVE",
      /* The register's quality axis has three states and must total the
         population; a fourth value of its own left 32 records in none of them.
         A resolution whose document exists but whose tracker row does not IS
         an incomplete source -- there is no date, no agenda and no register
         number beyond what the filename states. The specific reason is kept
         beside it rather than encoded in the axis. */
      /* A FOLDER-DERIVED RESOLUTION IS NOT AUTOMATICALLY AN INCOMPLETE ONE.
         Having no tracker row is a provenance fact, recorded in sourceIndex —
         it is not a missing value. Once the agenda, entity and date are all
         read out of the estate there is nothing left absent, so the record is
         only incomplete where the date genuinely could not be found. */
      __quality: dateFromName ? undefined : "INCOMPLETE_SOURCE",
      __missingFields: dateFromName ? undefined : ["date"],
      sourceIndex: "NO_TRACKER_ROW",
      /* Provenance is the DOCUMENT itself, because that is what this record was
         ingested from. A record with no source file id cannot be audited. */
      __source: {
        folder: g.folder, root: sp && sp.sourceRootName,
        fileId: lead.id, file: lead.name, sheet: null,
        modified: lead.modifiedTime || "",
      },
    });
    added++;
  }

  /* ONE RESOLUTION, TWO FOLDERS, ONE RECORD (§5/§93).
     The same resolutions are filed twice in the estate — once under the
     company's statutory folder and once as a "(1)" copy in the Compliance
     Resolutions root. Read folder by folder that produced two records for one
     board resolution, under two spellings of the same company ("Dubizzle Labs"
     and "Dubizzle Labs(SMC-Pvt)Ltd"), which is a duplicate record count, not
     two decisions of the board.
     Collapsed on the DOCUMENT rather than the folder: the "(1)" suffix Drive
     adds to a second copy is stripped, so the two copies recognise each other.
     Both source folders are kept on the surviving record — nothing in Drive is
     touched and no provenance is lost. */
  const canon = (n) => String(n || "").replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\s*\(\d+\)\s*/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const seen = new Map();
  const kept = [];
  let collapsed = 0;
  for (const r of records) {
    /* ONLY the records this function just derived. `records` is the whole
       resolutions register, and tracker-backed rows legitimately share a
       document — one authority letter can authorise several matters — so
       collapsing on the document across the whole register destroyed 141 real
       resolutions the first time this ran. */
    if (r.origin !== "RESOLUTION_SOURCE_DRIVE") { kept.push(r); continue; }
    const lead = (r.driveFiles || [])[0] || {};
    /* Keyed on the company as well as the document: two companies can file a
       resolution with the same name and they are not the same decision. */
    /* The company, through the entity registry — which already knows that
       "Dubizzle Labs" and "Dubizzle Labs(SMC-Pvt)Ltd" are one company. Keying
       on the raw folder text left the two copies looking like two companies,
       which is how the duplicate survived. */
    let ent = "";
    try { ent = require("./entities").entityKey(r.entity || r.sourceEntityFolder || ""); } catch (e) { ent = canon(r.entity); }
    const key = (ent || canon(r.sourceEntityFolder)) + " :: " + canon(lead.name);
    if (!canon(lead.name)) { kept.push(r); continue; }
    const prev = seen.get(key);
    if (!prev) { seen.set(key, r); kept.push(r); continue; }
    collapsed++;
    (prev.__sourceFolders = prev.__sourceFolders || [{ path: prev.fullDrivePath, folderId: prev.sourceFolderId }])
      .push({ path: r.fullDrivePath, folderId: r.sourceFolderId });
    prev.__alsoFiledAs = [...new Set([...(prev.__alsoFiledAs || []), r.entity].filter(Boolean))];
    prev.__duplicateCopies = (prev.__duplicateCopies || 1) + 1;
    /* The other copy's files are evidence of the same decision, so they are
       kept on the record rather than thrown away with it. */
    for (const f of r.driveFiles || []) {
      if (!(prev.driveFiles || []).some((x) => x.id === f.id)) prev.driveFiles.push(f);
    }
  }
  if (collapsed) {
    records.length = 0;
    records.push(...kept);
    added -= collapsed;
  }
  return added;
}

function attachComplianceDocs(registers) {
  attachResolutionDocs(registers.resolutions || []);
  addUntrackedResolutions(registers.resolutions || []);
  // The exact date join first; the token matcher below only sees what it leaves.
  attachLoanFolders(registers.loans || []);
  attachFolderDocs(registers.loans || [], {
    scope: (f) => /loan/i.test(f.folderPath || "") && /^compliance/i.test(f.root || ""),
    keyOf: (f) => f.folderPath || "",
    textOf: (r) => [r.borrower, r.lender, r.ref, r.amount, r.currency].join(" "),
    minShared: 2, cap: 25, via: "loan-folder",
  });
  attachFolderDocs(registers.licences || [], {
    scope: (f) => /licen[cs]es? & approvals/i.test(f.folderPath || ""),
    keyOf: (f) => f.folderPath || "",
    textOf: (r) => [r.entity, r.authority, r.number].join(" "),
    minShared: 2, cap: 20, via: "licence-folder",
  });
  attachPpaFolders(registers.contracts || []);
  attachProjectFolders(registers.properties || []);
  /* AFTER the ZD Projects matcher, never before it. attachFolderDocs skips any
     record that already has documents, so running this first silently disabled
     it: Zameen Ace Homes swapped its 16 project files for its sale deeds
     instead of holding both. Sale deeds are an addition to a project's file,
     not a replacement for it. */
  attachProjectSaleDeeds(registers.properties || []);
}

loadCache();

// Reading coverage across the whole estate, for Data Health.
function contentReadSummary() {
  try {
    const content = require("./content-model");
    const sum = content.summary();
    const read = sum.byRead || {};
    const total = Object.values(read).reduce((a, b) => a + b, 0) || 0;
    return {
      total,
      textExtracted: read.TEXT_EXTRACTED || 0,
      scanReadViaIndex: read.SCAN_READ_VIA_INDEX || 0,
      notRead: read.NOT_READ || 0,
      byType: sum.byType || {},
      builtAt: sum.builtAt || 0,
    };
  } catch (e) { return null; }
}

/* The data-health picture, for the Administration → Data Health surface.
   Everything here is runtime truth: what was read, what was kept, what could
   not be placed, and what disagrees with itself. */
async function health() {
  const st = await ensure();
  const regs = st.registers || {};
  const rows = (k) => regs[k] || [];
  /* §44 — DATA HEALTH REPORTS WHERE RECORDS ENDED UP, NOT WHAT THE INGEST HIT.
     "Incomplete" and "Conflicting" used to be the headline numbers, which meant
     a disagreement decided by an approved precedence rule was reported for ever
     as though somebody still had to choose. The operational figures are now the
     two states that need a person — a value the estate does not hold, and an
     ambiguity no rule can settle — and the ingest history is reported beside
     them, plainly labelled as history. */
  const st8 = (k, v) => rows(k).filter((r) => r.qualityState === v).length;
  const families = FAMILIES.map((f) => ({
    key: f.key, label: f.label,
    records: rows(f.key).length,
    complete: st8(f.key, "COMPLETE"),
    completeWithGap: st8(f.key, "COMPLETE_WITH_SOURCE_GAP"),
    resolvedByPrecedence: st8(f.key, "RESOLVED_BY_SOURCE_PRECEDENCE"),
    notEvidenced: st8(f.key, "SOURCE_VALUE_NOT_EVIDENCED"),
    ambiguous: st8(f.key, "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION"),
    native: st8(f.key, "LEGALOS_NATIVE"),
    hadSourceConflict: rows(f.key).filter((r) => r.hadSourceConflict).length,
    /* Kept so nothing that reads this endpoint breaks, and so the ingest story
       stays auditable — but these are now HISTORY, not the operational state. */
    incomplete: rows(f.key).filter((r) => r.__quality === "INCOMPLETE_SOURCE").length,
    conflicting: rows(f.key).filter((r) => r.__quality === "CONFLICTING_SOURCE").length,
    weakIdentity: rows(f.key).filter((r) => r.__weakIdentity).length,
    withDocuments: rows(f.key).filter((r) => (r.driveFiles || []).length).length,
    dispositions: (st.diagnostics && st.diagnostics.rowDispositionsByFamily && st.diagnostics.rowDispositionsByFamily[f.key]) || {},
  }));
  const problems = [];
  for (const f of FAMILIES) {
    for (const r of rows(f.key)) {
      /* The work queue is what still needs a PERSON: a value the estate does
         not hold, or an ambiguity no rule can settle. A record resolved by
         precedence is not on it. */
      if (r.qualityState === "SOURCE_VALUE_NOT_EVIDENCED"
        || r.qualityState === "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION") {
        problems.push({
          id: r.id, family: f.key, quality: r.qualityState,
          qualityState: r.qualityState,
          notEvidenced: r.__notEvidenced || null,
          identityNote: r.__identityNote || null,
          unresolvedConflicts: r.__unresolvedConflicts || null,
          candidates: r.__candidates || null,
          missingFields: r.__missingFields || [],
          conflicts: (r.__conflicts || []).slice(0, 6),
          title: String(r.title || r.caseName || r.agenda || r.borrower || r.entity || r.project || r.recipient || "").slice(0, 90),
          source: r.__lineage || r.__source || null,
        });
      }
    }
  }
  const docs = st.documents || [];
  const byDisposition = {};
  for (const d of docs) byDisposition[d.disposition] = (byDisposition[d.disposition] || 0) + 1;
  /* The reader gate's verdict travels with the health picture, so "why is this
     data older than I expect" is answerable on the screen rather than in a log.
     A degraded build is not an outage: the last good dataset is still served. */
  /* Checked NOW, not remembered. A reader can be pruned while the process is
     up, and the cached book keeps being served from a state that was built when
     the reader was still there — so a stored verdict would say "ok" about a
     host that can no longer read a .doc. The check is a require.resolve and
     three `which` lookups, which is cheap enough to pay on every health read.
     The verdict recorded at build time is kept alongside it, because "the data
     was built by a healthy host" and "the host is healthy now" are different
     questions and Data Health needs both. */
  const liveGate = (() => { try { return require("./parser-gate").check(); } catch (e) { return null; } })();
  /* The template drawer, summarised for the screen. Two numbers matter to a
     person and neither is obvious from the register: how many executed
     instruments were found filed among the blank forms, and how many blank
     forms were taken off live records so they stop looking like deals. */
  const templateLibrary = (() => {
    try {
      const rows = tplLib.load().rows;
      if (!rows.length) return null;
      return {
        files: rows.length,
        byState: rows.reduce((m, r) => (m[r.classification] = (m[r.classification] || 0) + 1, m), {}),
        executedInstrumentsFound: rows.filter((r) => /^EXECUTED_/.test(r.classification)).length,
        unclassified: rows.filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS").length,
        detachedFromRecords: (st.diagnostics && st.diagnostics.templateFilesDetachedFromRecords) || null,
      };
    } catch (e) { return null; }
  })();

  return {    builtAt: st.builtAt,
    templateLibrary,
    parserGate: liveGate,
    parserGateAtLastBuild: st.parserGate || null,
    degraded: st.degraded || null,
    drive: drive.status(),
    diagnostics: st.diagnostics || {},
    families,
    sources: (st.sources || []).map((x) => ({ file: x.file, fileId: x.fileId, root: x.root, folder: x.folder, modified: x.modified, sheets: x.sheets, families: x.families, records: x.records })),
    errors: st.errors || [],
    lastDegradedIngest: st.lastDegradedIngest || null,
    // Identity integrity, for the steward: two roster rows claiming one login
    // would let one person inherit another's access, so it is surfaced rather
    // than resolved by guesswork.
    identityConflicts: (() => { try { return require("./identity").identityConflicts(); } catch (e) { return []; } })(),
    documentDispositions: byDisposition,
    /* WHAT WE HAVE ACTUALLY READ. Everything else on this page describes where
       documents SIT; this describes whether anyone has opened them. It belongs
       on Data Health precisely because the honest answer is partial — most of
       this estate is scanned paper and this machine has no OCR — and a number
       that says so is worth more than a page that quietly implies every
       document is understood. */
    contentRead: contentReadSummary(),
    unresolvedDocuments: docs.filter((d) => d.disposition === "UNRESOLVED").slice(0, 300),
    referenceDocuments: docs.filter((d) => d.disposition === "REFERENCE").length,
    problems: problems.slice(0, 1000),
    problemCount: problems.length,
  };
}


/* Merge newly raised cases into the register that is being served RIGHT NOW.
   Relying on a rebuild was not enough: `rebuild()` returns immediately if a
   build is already running, so a case raised while the book happened to be
   refreshing was saved to the server and then absent from the register the
   author was looking at -- indistinguishable, from their side, from not having
   saved at all. */
async function refreshLocalLitigationCases() {
  try { require("./litigation-cases").reload(); } catch (e) { /* no store yet */ }
  const st = await ensure();
  if (!st || !st.registers) return { added: 0 };
  const r = mergeLocalLitigationCases(st.registers);
  /* RE-APPLY THE RECORDED DECISIONS.
     mergeLocalLitigationCases rebuilds the LegalOS-origin rows from scratch,
     which is what makes it idempotent — and it also drops whatever was laid
     over the register after the last build. Recording a decision calls this to
     refresh, so without re-applying here the decision saved, the case page
     showed it, and the register, the KPIs and the analytics went on reporting
     the matter as active until the next full rebuild. */
  applyCaseOutcomes(st.registers);
  st.diagnostics = Object.assign({}, st.diagnostics, { litigationCasesRaisedInApp: r });
  return r;
}

module.exports = { rebuild, ensure, get, summary, classify, health, refreshLocalLitigationCases,
  localCaseStamp: () => localCaseStamp, localNoticeStamp: noticeStampNow,
  FAMILIES, SURFACES };
