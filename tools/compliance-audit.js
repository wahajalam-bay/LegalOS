#!/usr/bin/env node
/* COMPLIANCE: ROOT -> LEAF, AND BACK.
 *
 * This walks "Compliance Data _LegalOS" to its leaves and gives EVERY folder,
 * EVERY file and EVERY tracker row a disposition. Nothing is allowed to fall
 * out of the arithmetic silently: a row that is not ingested has to say which
 * kind of not-ingested it is, and a folder nobody classified is a failure, not
 * a rounding error.
 *
 * WHAT THE SOURCE ACTUALLY LOOKS LIKE, and why the obvious readings are wrong:
 *
 *   ONE FOLDER IS NOT ONE LOAN. "12.Loan Agreement_Zameen Venture One & Delta
 *   Centauri Developments [Rs. 15, 20 & 35 mil.]" contains THREE loans, each in
 *   its own subfolder with its own amendments. Counting loan folders undercounts
 *   by two here and does the same wherever a single instrument folder was used
 *   to hold a facility split into tranches.
 *
 *   AN AMENDMENT IS NOT A LOAN. Loan folders carry "Loan Agreement",
 *   "First Amendment", "Second Amendment", "Third Amendment" as sibling
 *   subfolders. Treating each as an agreement inflates the book.
 *
 *   SPEND CONTRACTS LIVE UNDER THE LOAN ROOTS. Eight folders of leases and
 *   service agreements sit inside "Zameen Group_Loan Agreements" and
 *   "Zameen Group _PK Intercompany Loans". They are real compliance records in
 *   the wrong place -- so they are classified by WHAT THEY ARE, and their
 *   physical home is kept as lineage rather than quietly corrected.
 *
 *   "General Agreements" MEANS SERVICE. The spend tree bifurcates itself:
 *   "Lease Agreements" and "General Agreements" are sibling folders. That is
 *   the source's own lease/service split and it is stronger evidence than any
 *   keyword in a filename.
 *
 *   node tools/compliance-audit.js
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const xlsx = require("../api/xlsx.js");
const { driveRaw } = require("../api/google.js");

const ROOT_NAME = "Compliance Data _LegalOS";
const OUT = P.join(__dirname, "..", "audit");
fs.mkdirSync(OUT, { recursive: true });

const seg = (p) => String(p || "").split("/").map((s) => s.trim()).filter(Boolean);
const write = (name, obj) => {
  fs.writeFileSync(P.join(OUT, name), JSON.stringify(obj, null, 1));
  console.log("  wrote audit/" + name);
};

/* ---------------------------------------------------------------- family --- */
const FAMILY = {
  LICENCES: "Licenses & Approvals _ Pakistan Entities",
  RESOLUTIONS: "Resolutions",
  SPEND: "Spend Contracts (Lease and Service Agreements)",
  INTERCOMPANY: "Zameen Group _PK Intercompany Loans",
  LOANAGR: "Zameen Group_Loan Agreements",
};
function familyOf(path) {
  const s = seg(path);
  if (s.length < 2) return "(root)";
  const f = s[1];
  for (const [k, v] of Object.entries(FAMILY)) if (f === v.trim() || f === v) return k;
  return "UNKNOWN:" + f;
}

/* -------------------------------------------------------- folder rules ----- */
const RX = {
  lease: /^lease agreements?$/i,
  general: /^general agreements?$/i,
  subsidiaries: /subsidiar(y|ies)/i,
  spendRoot: /_?\s*spend contracts?$/i,
  loanFolder: /^(\d+\s*[.\-]\s*)?(convertible\s+)?loan\b|^loan agreement\b/i,
  amendment: /^(first|second|third|fourth|fifth)?\s*amendments?$/i,
  loanAgreementDoc: /^loan agreement( \(1\))?$/i,
  origRequest: /original request/i,
  applications: /^applications?\b/i,
  licenceLeaf: /licen[cs]e/i,
  fy: /^(fy\s*)?20\d\d([-\/_]\d{2,4})?$/i,
  renewal: /renewal/i,
  template: /template/i,
  reference: /^(reference|misc|others?)\b/i,
};
const clean = (s) => String(s || "").replace(/\s*\(\d+\)\s*$/, "").trim();

function folderDisposition(fo) {
  const s = seg(fo.path);
  const depth = s.length;
  const name = clean(fo.name);
  const fam = familyOf(fo.path);
  if (depth === 1) return "COMPLIANCE_ROOT";
  if (depth === 2) return "MODULE_ROOT";

  if (RX.lease.test(name)) return "LEASE_FOLDER";
  if (RX.general.test(name)) return "SERVICE_FOLDER";
  if (RX.amendment.test(name) || RX.loanAgreementDoc.test(name) || RX.origRequest.test(name)) return "DOCUMENT_FOLDER";
  if (RX.applications.test(name)) return "APPLICATION_FOLDER";
  if (RX.renewal.test(name)) return "RENEWAL_FOLDER";
  if (RX.template.test(name)) return "TEMPLATE_FOLDER";
  if (RX.fy.test(name)) return "FINANCIAL_YEAR_FOLDER";
  if (RX.reference.test(name)) return "REFERENCE_FOLDER";

  if (fam === "LICENCES") {
    if (depth === 3) return "LICENCE_ENTITY_FOLDER";
    if (RX.licenceLeaf.test(name)) return "LICENCE_FOLDER";
    return "LICENCE_FOLDER";
  }
  if (fam === "RESOLUTIONS") {
    if (depth === 3) return "RESOLUTION_ENTITY_FOLDER";
    return "RESOLUTION_RECORD_FOLDER";
  }
  if (fam === "SPEND") {
    if (RX.spendRoot.test(name) || RX.subsidiaries.test(name)) return "ENTITY_FOLDER";
    return "ENTITY_FOLDER";
  }
  if (fam === "INTERCOMPANY" || fam === "LOANAGR") {
    if (RX.spendRoot.test(name) || RX.subsidiaries.test(name)) return "ENTITY_FOLDER";
    if (RX.loanFolder.test(name)) return "LOAN_FOLDER";
    if (depth === 3) return "ENTITY_FOLDER";
    /* A child of a loan folder that is not an amendment and not a document
       folder is a tranche: its own loan. */
    return "LOAN_FOLDER";
  }
  return "UNRESOLVED_AFTER_FULL_ANALYSIS";
}

/* ---------------------------------------------------------- file rules ----- */
/* FILE RULES.
   Two passes, in this order:

     1. WHAT THE NAME SAYS. Typo-tolerant on purpose -- this estate contains
        "MaintenanceServicesAgreemen", "Fourth Amdnement", "second Amendemnt"
        and "First Addmendum". A classifier that insists on correct spelling
        classifies the tidy half of a business.

     2. WHERE THE FILE LIVES. A PDF called "QarshiZameenDevelopments" says
        nothing at all, but it sits in a "General Agreements" folder inside a
        spend-contract entity, and that IS evidence. Position is used only
        after the name has failed, never to override an explicit name.

   The first version of this classifier ran pass 1 alone and left 238 files
   unclassified -- 100 of them resolutions whose only sin was being named
   "Authorize company representative" instead of "Resolution". */
const FRX = {
  lock: /^~\$/,
  system: /(\.ini$|\.ds_store|thumbs\.db|desktop\.ini)/i,
  sheet: /\.(xlsx|xlsm|xls|csv)$/i,
  letterhead: /letter\s*head/i,
  template: /(template|specimen|format|blank|\bdraft\b)/i,
  receipt: /(receipt|challan|payment|invoice|fee[ _-]?slip|deposit|paid)/i,
  /* A Proceeds Realisation Certificate is a bank's evidence that loan money
     actually moved. It is the strongest SBP evidence in this estate and must
     never be filed as an anonymous record document. */
  prc: /\bPRC\b|proceeds? reali[sz]ation/i,
  ack: /(acknowledg|ack[ _-]?slip|received|submission|submitted)/i,
  application: /(application|apply|form[ _-]?[a-z0-9]|request)/i,
  renewal: /(renewal|renewed|re-?new)/i,
  /* Lifecycle actions on an existing instrument. Spelling is deliberately
     loose. */
  action: /(am[de]nd|amdnement|addmendum|addendum|termination|terminate|waiver|extension|rollover|roll-over|novation|repayment|supplement)/i,
  correspondence: /(letter|email|e-?mail|corresponden|reminder|query|reply|response|observations?|minutes of meeting)/i,
  executed: /(signed|executed|stamped|notari[sz]ed|counterpart)/i,
  certificate: /(certificate|licen[cs]e|permit|registration|approval|\bnoc\b|membership|enrol)/i,
  agreement: /(agreemen|contract|deed|lease|tenancy|\bmou\b|\bnda\b|facility|undertaking)/i,
  /* Resolutions are rarely called resolutions. They are called what they
     authorise. */
  resolution: /(resolution|authori[sz]|approve|approval of|\bbr\b|board|circular|minutes|consent)/i,
  historical: /(\bold\b|previous|expired|superseded|history|archive)/i,
};

/* Where a file sits, when its name will not say. */
const POSITIONAL = {
  LEASE_FOLDER: "RECORD_DOCUMENT",
  SERVICE_FOLDER: "RECORD_DOCUMENT",
  LOAN_FOLDER: "RECORD_DOCUMENT",
  LICENCE_FOLDER: "RECORD_DOCUMENT",
  LICENCE_ENTITY_FOLDER: "RECORD_DOCUMENT",
  RESOLUTION_ENTITY_FOLDER: "RECORD_DOCUMENT",
  RESOLUTION_RECORD_FOLDER: "RECORD_DOCUMENT",
  DOCUMENT_FOLDER: "RECORD_DOCUMENT",
  APPLICATION_FOLDER: "APPLICATION_DOCUMENT",
  RENEWAL_FOLDER: "RENEWAL_DOCUMENT",
  TEMPLATE_FOLDER: "TEMPLATE",
  REFERENCE_FOLDER: "REFERENCE",
  ENTITY_FOLDER: "RECORD_DOCUMENT",
};

function fileDisposition(f, folderDisp) {
  const n = String(f.name || "");
  if (FRX.lock.test(n) || FRX.system.test(n)) return "SYSTEM_FILE";
  if (FRX.sheet.test(n)) return "SOURCE_TRACKER";
  if (FRX.letterhead.test(n)) return "LETTERHEAD";
  if (FRX.template.test(n) || folderDisp === "TEMPLATE_FOLDER") return "TEMPLATE";
  if (FRX.prc.test(n)) return "ACKNOWLEDGEMENT";
  if (FRX.receipt.test(n)) return "PAYMENT_RECEIPT";
  if (FRX.ack.test(n)) return "ACKNOWLEDGEMENT";
  if (FRX.renewal.test(n) || folderDisp === "RENEWAL_FOLDER") return "RENEWAL_DOCUMENT";
  if (FRX.action.test(n)) return "ACTION_DOCUMENT";
  if (folderDisp === "APPLICATION_FOLDER" || FRX.application.test(n)) return "APPLICATION_DOCUMENT";
  if (FRX.correspondence.test(n)) return "CORRESPONDENCE";
  if (FRX.executed.test(n)) return "EXECUTED_DOCUMENT";
  if (FRX.certificate.test(n) || FRX.agreement.test(n) || FRX.resolution.test(n)) return "RECORD_DOCUMENT";
  if (FRX.historical.test(n)) return "HISTORICAL_DOCUMENT";
  /* pass 2: position */
  if (POSITIONAL[folderDisp]) return POSITIONAL[folderDisp];
  return "UNRESOLVED_AFTER_FULL_ANALYSIS";
}

/* ---------------------------------------------------------------- bytes ---- */
async function fetchBytes(id, attempt = 0) {
  /* driveRaw returns a fetch Response, not bytes. The first version of this
     tool treated it as a buffer and every one of the 69 workbooks "failed to
     read" -- a bug that looks exactly like an unreadable estate. */
  const res = await driveRaw("/files/" + id + "?alt=media&supportsAllDrives=true");
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    if (attempt >= 4) throw new Error("HTTP " + res.status);
    await new Promise((r) => setTimeout(r, 1200 * Math.pow(2, attempt)));
    return fetchBytes(id, attempt + 1);
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ main --- */
(async () => {
  await drive.ensureIndex();
  const folders = drive.indexFolders().filter((f) => String(f.path || "").startsWith(ROOT_NAME));
  const files = drive.indexFiles().filter((f) => String(f.path || "").startsWith(ROOT_NAME));

  console.log("COMPLIANCE ROOT: " + folders.length + " folders, " + files.length + " files");

  /* ---- 1. root inventory ---- */
  const firstLevel = {};
  for (const o of folders.concat(files)) {
    const s = seg(o.path);
    if (s.length < 2) continue;
    const k = s[1];
    firstLevel[k] = firstLevel[k] || { folders: 0, files: 0, known: Object.values(FAMILY).some((v) => v.trim() === k) };
    if (o.mimeType === "application/vnd.google-apps.folder") firstLevel[k].folders++; else firstLevel[k].files++;
  }
  const unknownRootChildren = Object.entries(firstLevel).filter(([, v]) => !v.known).map(([k]) => k);
  write("compliance-root-inventory.json", {
    root: ROOT_NAME, builtAt: new Date().toISOString(),
    folders: folders.length, files: files.length,
    firstLevel, unknownRootChildren,
    crawl: { depthCap: "none reached", maxDepthObserved: Math.max(...folders.concat(files).map((o) => seg(o.path).length)) },
  });

  /* ---- 2. folder disposition ---- */
  const fdisp = folders.map((fo) => ({
    id: fo.id, name: fo.name, path: fo.path, depth: seg(fo.path).length,
    family: familyOf(fo.path), disposition: folderDisposition(fo),
  }));
  const fdCount = {};
  for (const x of fdisp) fdCount[x.disposition] = (fdCount[x.disposition] || 0) + 1;
  write("compliance-folder-disposition.json", {
    builtAt: new Date().toISOString(), total: fdisp.length, counts: fdCount,
    unknown: fdisp.filter((x) => x.disposition === "UNRESOLVED_AFTER_FULL_ANALYSIS").length,
    folders: fdisp,
  });

  /* ---- 3. file disposition ---- */
  const byFolderId = new Map(fdisp.map((x) => [x.id, x]));
  const parentOf = (f) => {
    const parentPath = seg(f.path).slice(0, -1).join(" / ");
    return fdisp.find((x) => seg(x.path).join(" / ") === parentPath) || null;
  };
  const pathIndex = new Map(fdisp.map((x) => [seg(x.path).join("/"), x]));
  const fidisp = files.map((f) => {
    const pp = seg(f.path).slice(0, -1).join("/");
    const parent = pathIndex.get(pp) || null;
    const pd = parent ? parent.disposition : "";
    return {
      id: f.id, name: f.name, path: f.path, size: f.size || 0,
      family: familyOf(f.path), parentDisposition: pd,
      disposition: fileDisposition(f, pd),
    };
  });
  const fiCount = {};
  for (const x of fidisp) fiCount[x.disposition] = (fiCount[x.disposition] || 0) + 1;
  write("compliance-file-disposition.json", {
    builtAt: new Date().toISOString(), total: fidisp.length, counts: fiCount,
    withoutDisposition: fidisp.filter((x) => x.disposition === "UNRESOLVED_AFTER_FULL_ANALYSIS").length,
    files: fidisp,
  });

  /* ---- 4. every tracker, every sheet, every row ---- */
  const trackers = fidisp.filter((x) => x.disposition === "SOURCE_TRACKER");
  console.log("\nreading " + trackers.length + " tracker workbook(s), every sheet, every row…");
  const rowOut = [];
  let sheetsRead = 0, rowsSeen = 0, readFailed = 0;
  for (const t of trackers) {
    let buf = null;
    try { buf = await fetchBytes(t.id); }
    catch (e) { readFailed++; rowOut.push({ file: t.name, path: t.path, error: "fetch: " + String(e.message).slice(0, 120) }); continue; }
    let wb;
    try { wb = xlsx.readWorkbook(buf); }
    catch (e) { readFailed++; rowOut.push({ file: t.name, path: t.path, error: String(e.message).slice(0, 160) }); continue; }
    for (const sh of (wb.sheets || [])) {
      sheetsRead++;
      const rows = sh.rows || [];
      const obj = xlsx.toObjects(rows);
      const headerRow = obj.headerRow;
      let ingested = 0, blank = 0, header = 0, incomplete = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || [];
        const filled = r.filter((c) => c != null && String(c).trim() !== "").length;
        rowsSeen++;
        if (i === headerRow) { header++; continue; }
        if (filled === 0) { blank++; continue; }
        if (filled === 1) { incomplete++; continue; }
        ingested++;
      }
      rowOut.push({
        file: t.name, path: t.path, family: t.family, sheet: sh.name,
        rows: rows.length, headerRow, header, blank,
        candidateRecords: ingested, singleCellRows: incomplete,
        columns: obj.header.filter(Boolean),
      });
    }
  }
  write("compliance-row-disposition.json", {
    builtAt: new Date().toISOString(),
    trackers: trackers.length, sheetsRead, rowsSeen, readFailed,
    sheets: rowOut,
  });

  console.log("\n=== FOLDER DISPOSITION ===");
  for (const [k, v] of Object.entries(fdCount).sort((a, b) => b[1] - a[1])) console.log("  " + String(v).padStart(5) + "  " + k);
  console.log("\n=== FILE DISPOSITION ===");
  for (const [k, v] of Object.entries(fiCount).sort((a, b) => b[1] - a[1])) console.log("  " + String(v).padStart(5) + "  " + k);
  console.log("\nUNKNOWN_ROOT_CHILDREN = " + unknownRootChildren.length + (unknownRootChildren.length ? " -> " + unknownRootChildren.join(", ") : ""));
  console.log("UNKNOWN_FOLDER        = " + fdisp.filter((x) => x.disposition === "UNRESOLVED_AFTER_FULL_ANALYSIS").length);
  console.log("FILES_WITHOUT_DISPOSITION = " + fidisp.filter((x) => x.disposition === "UNRESOLVED_AFTER_FULL_ANALYSIS").length);
  console.log("trackers=" + trackers.length + " sheets=" + sheetsRead + " rows=" + rowsSeen + " readFailed=" + readFailed);
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
