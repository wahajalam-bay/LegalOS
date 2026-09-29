// Document generation.
//
// WHAT THIS DOES AND DOES NOT DO -- worth stating plainly, because the honest
// boundary here is the whole point.
//
// The approved template library is real: 413 Word/PDF documents under the
// "Zameen - Pakistan Contract Templates" Drive tree, permission-scoped like any
// other document. LegalOS lets Legal pick one of those approved templates for an
// action, and generates a real .docx that carries:
//
//   - the parties, dates and terms already on the record (auto-populated from
//     the source data, so nobody retypes them and nobody mistypes them)
//   - the REVISED terms Legal entered for this action
//   - an explicit before/after of what is changing
//   - a citation of which approved template governs the clause language
//
// What it does NOT do is fabricate clause text or claim to have merged content
// into the approved template. Instead the generated document is an accurate,
// signable-quality draft term sheet, and the approved template stays attached
// to the record as the governing form. That distinction is stated on the face
// of the generated document, so nobody downstream mistakes one for the other.
//
// CORRECTION (29 Sep 2026) -- this header used to justify the term sheet on the
// ground that "those templates contain no merge fields, so a filled template
// would mean LegalOS writing legal prose it invented". That is true only of
// Word MERGEFIELDs. The documents themselves are full of blanks their drafters
// left for a human to complete -- of 60 .docx sampled, 51 carry ruled blanks
// and 24 carry bracketed slots ("[●DEVELOPER]", "CNIC/NICOP: ______", "a
// monthly rent of Rupees ___ (PKR ___)"). Filling those invents nothing.
//
// `api/contract-draft.js` does exactly that for contract requests: it returns
// the approved template with the request's parties, dates and terms in place,
// clause language untouched, and every blank it could not answer left as it
// was and reported with a reason. The term sheet below is still what the
// COMPLIANCE actions produce, and is still the right output for them -- a loan
// or licence action is a variation on an existing instrument, not a fresh
// agreement off a form. Don't repeat the old claim; it is not true of the
// library.

const zlib = require("zlib");
const crypto = require("crypto");

/* --------------------------------------------------------------- ZIP writer */

// A .docx is a ZIP of XML parts. Small enough to build directly rather than
// take a dependency for it.
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.data, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // version needed
    local.writeUInt16LE(0, 6);       // flags
    local.writeUInt16LE(8, 8);       // method: deflate
    local.writeUInt16LE(0, 10);      // time
    local.writeUInt16LE(0, 12);      // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, deflated);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(deflated.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + deflated.length;
  }

  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, cd, end]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/* ------------------------------------------------------------------- OOXML */

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
  // Strip control characters: they are not valid in XML 1.0 and would make the
  // .docx unopenable if they reached the document body from source data.
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

const para = (text, opts) => {
  const o = opts || {};
  const runProps = "<w:rPr>" +
    (o.bold ? "<w:b/>" : "") +
    (o.italic ? "<w:i/>" : "") +
    (o.size ? `<w:sz w:val="${o.size * 2}"/>` : "") +
    (o.color ? `<w:color w:val="${o.color}"/>` : "") +
    "</w:rPr>";
  const pProps = "<w:pPr>" +
    (o.align ? `<w:jc w:val="${o.align}"/>` : "") +
    (o.spaceBefore ? `<w:spacing w:before="${o.spaceBefore * 20}"/>` : "") +
    "</w:pPr>";
  return `<w:p>${pProps}<w:r>${runProps}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
};

const heading = (text) => para(text, { bold: true, size: 13, spaceBefore: 10 });

// A two-column table of label/value rows.
function table(rows) {
  const cell = (t, bold, w) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="20"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p></w:tc>`;
  const body = rows.map((r) => `<w:tr>${cell(r[0], true, 3000)}${cell(r[1] == null || r[1] === "" ? "-" : String(r[1]), false, 6000)}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:color="CCCCCC"/>`).join("")}</w:tblBorders>` +
    `</w:tblPr>${body}</w:tbl>`;
}

function docx(bodyXml) {
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    },
    { name: "word/document.xml", data: documentXml },
  ]);
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/* ---------------------------------------------------------- draft builders */

const money = (v, ccy) => (v == null || v === "" ? null : (ccy ? ccy + " " : "") + Number(v).toLocaleString());

// The provenance block that appears on every generated draft. It says where the
// content came from and what the reader is holding, so a draft term sheet is
// never mistaken for executed clause language.
function provenance(opts) {
  const out = [heading("Provenance")];
  const rows = [
    ["Generated by", "LegalOS"],
    ["Generated at", new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    ["Prepared by", opts.actor || "-"],
    ["Source record", opts.recordRef || "-"],
    ["Approved template", opts.template ? opts.template.name : "None selected"],
    ["Template location", opts.template ? opts.template.folderPath || "-" : "-"],
  ];
  out.push(table(rows));
  out.push(para(
    opts.template
      ? "This is a DRAFT prepared by LegalOS. The commercial terms below are populated from the record's source data and from the revised terms entered by Legal. The approved template named above governs the clause language and is attached to this record; LegalOS has not altered or reproduced its wording."
      : "This is a DRAFT prepared by LegalOS. No approved template was selected for this action, so no governing form is cited.",
    { italic: true, size: 9, spaceBefore: 6 }
  ));
  return out.join("");
}

// Loan amendment / novation / termination draft.
function loanActionDraft({ loan, action, template, actor, balance }) {
  const f = action.fields || {};
  const kindLabel = {
    amendment: "Amendment to Loan Agreement",
    rollover: "Rollover / Extension of Loan Agreement",
    novation: "Novation of Loan Agreement",
    termination: "Termination of Loan Agreement",
    conversion: "Conversion of Loan to Equity",
  }[action.subtype] || "Loan Action";

  const body = [];
  body.push(para(kindLabel.toUpperCase(), { bold: true, size: 16, align: "center" }));
  body.push(para(action.id + (loan.ref ? "  -  " + loan.ref : ""), { align: "center", size: 10, color: "666666" }));

  body.push(heading("Parties"));
  body.push(table([
    ["Borrower", loan.borrower],
    ["Lender", loan.lender],
    ["Group entity", loan.entity],
  ]));

  body.push(heading("Existing loan (as recorded)"));
  body.push(table([
    ["Loan record", loan.id],
    ["Loan reference / LRN", loan.refText || loan.ref],
    ["Category", loan.category === "international" ? "International" : "Intercompany / Group"],
    ["Original agreement date", (loan.original && loan.original.agreementDate) || loan.agreementDateText],
    ["Original principal", money(loan.principal, loan.currency)],
    ["Interest", loan.interest],
    ["Original repayment date", loan.original && loan.original.repaymentDue],
    ["Current effective repayment date", (loan.current && loan.current.repaymentDue) || "-"],
    ["Recorded amendments to date", loan.current ? String(loan.current.amendmentCount) : "0"],
    ["Repaid to date", balance && balance.repaid != null ? money(balance.repaid, loan.currency) : "-"],
    ["Outstanding principal", balance && balance.outstanding != null ? money(balance.outstanding, loan.currency) : "-"],
    ["SBP registration", loan.sbp ? loan.sbp.label : "-"],
    ["Status", loan.status],
  ]));

  body.push(heading("Revised terms"));
  const revised = [];
  if (f.amendmentType) revised.push(["Amendment type", f.amendmentType]);
  if (f.effectiveDate) revised.push(["Effective date", f.effectiveDate]);
  if (f.revisedRepaymentDate) revised.push(["Revised repayment date", f.revisedRepaymentDate]);
  if (f.revisedPrincipal != null && f.revisedPrincipal !== "") revised.push(["Revised principal", money(f.revisedPrincipal, f.revisedCurrency || loan.currency)]);
  if (f.revisedInterest) revised.push(["Revised interest / pricing", f.revisedInterest]);
  if (f.newLender) revised.push(["New lender", f.newLender]);
  if (f.newBorrower) revised.push(["New borrower", f.newBorrower]);
  if (f.terminationDate) revised.push(["Termination date", f.terminationDate]);
  if (f.reason) revised.push(["Reason", f.reason]);
  body.push(revised.length ? table(revised) : para("No revised terms have been entered for this action.", { italic: true }));

  // An explicit before/after, because a reader should not have to diff two
  // tables in their head to see what is actually changing.
  const changes = [];
  if (f.revisedRepaymentDate && loan.current && loan.current.repaymentDue && f.revisedRepaymentDate !== loan.current.repaymentDue)
    changes.push(["Repayment date", loan.current.repaymentDue + "  ->  " + f.revisedRepaymentDate]);
  if (f.revisedPrincipal != null && f.revisedPrincipal !== "" && Number(f.revisedPrincipal) !== loan.principal)
    changes.push(["Principal", money(loan.principal, loan.currency) + "  ->  " + money(f.revisedPrincipal, f.revisedCurrency || loan.currency)]);
  if (f.revisedInterest && f.revisedInterest !== loan.interest)
    changes.push(["Interest", (loan.interest || "-") + "  ->  " + f.revisedInterest]);
  if (f.newLender && f.newLender !== loan.lender)
    changes.push(["Lender", (loan.lender || "-") + "  ->  " + f.newLender]);
  if (changes.length) {
    body.push(heading("What changes"));
    body.push(table(changes));
  }

  if (f.notes) { body.push(heading("Notes")); body.push(para(f.notes)); }

  body.push(heading("Signatories"));
  const sigs = (action.signature && action.signature.signatories) || [];
  body.push(sigs.length
    ? table(sigs.map((s) => [s.name, [s.capacity, s.entity].filter(Boolean).join(", ") || "-"]))
    : para("No signatories have been selected yet.", { italic: true }));

  body.push(provenance({ actor, template, recordRef: loan.id + " / " + action.id }));
  return docx(body.join(""));
}

// Lease or service agreement action draft.
function agreementActionDraft({ agreement, action, template, actor, kindLabel }) {
  const f = action.fields || {};
  const body = [];
  body.push(para((kindLabel || "Agreement Action").toUpperCase(), { bold: true, size: 16, align: "center" }));
  body.push(para(action.id, { align: "center", size: 10, color: "666666" }));

  body.push(heading("Parties"));
  body.push(table([
    ["Group entity", agreement.entity],
    ["Counterparty", agreement.counterparty],
  ]));

  body.push(heading("Existing agreement (as recorded)"));
  body.push(table([
    ["Record", agreement.id],
    ["Title", agreement.title],
    ["Agreement type", agreement.agreementType],
    ["Physical file no.", agreement.fileNo],
    ["Start date", agreement.start],
    ["Expiry", agreement.end || agreement.endText],
    ["Value", agreement.value != null ? money(agreement.value, agreement.currency) : agreement.valueText],
    ["Department", agreement.department],
    ["City / region", [agreement.city, agreement.region].filter(Boolean).join(" / ")],
    ["Status", agreement.status],
  ]));

  body.push(heading("Revised terms"));
  const revised = [];
  if (f.actionType) revised.push(["Action type", f.actionType]);
  if (f.effectiveDate) revised.push(["Effective date", f.effectiveDate]);
  if (f.revisedExpiry) revised.push(["Revised expiry", f.revisedExpiry]);
  if (f.revisedRent != null && f.revisedRent !== "") revised.push(["Revised rent", money(f.revisedRent, "PKR")]);
  if (f.revisedValue != null && f.revisedValue !== "") revised.push(["Revised value", money(f.revisedValue, "PKR")]);
  if (f.revisedTerm) revised.push(["Revised term", f.revisedTerm]);
  if (f.revisedScope) revised.push(["Revised scope", f.revisedScope]);
  if (f.newLandlord) revised.push(["New landlord", f.newLandlord]);
  if (f.newTenant) revised.push(["New tenant", f.newTenant]);
  if (f.newProvider) revised.push(["New provider", f.newProvider]);
  if (f.terminationDate) revised.push(["Termination date", f.terminationDate]);
  if (f.reason) revised.push(["Reason", f.reason]);
  body.push(revised.length ? table(revised) : para("No revised terms have been entered for this action.", { italic: true }));

  if (f.notes) { body.push(heading("Notes")); body.push(para(f.notes)); }

  body.push(heading("Signatories"));
  const sigs = (action.signature && action.signature.signatories) || [];
  body.push(sigs.length
    ? table(sigs.map((s) => [s.name, [s.capacity, s.entity].filter(Boolean).join(", ") || "-"]))
    : para("No signatories have been selected yet.", { italic: true }));

  body.push(provenance({ actor, template, recordRef: agreement.id + " / " + action.id }));
  return docx(body.join(""));
}

// Board / partners resolution draft.
function resolutionDraft({ action, entity, template, actor, letterhead }) {
  const f = action.fields || {};
  const body = [];

  // Letterhead: applied only if a real configured asset exists. Otherwise the
  // draft says so on its face, rather than shipping an unbranded document that
  // looks like it was meant to have one.
  if (letterhead && letterhead.name) {
    body.push(para(entity ? entity.name : "", { bold: true, size: 14, align: "center" }));
    body.push(para("Letterhead: " + letterhead.name, { size: 8, align: "center", color: "888888" }));
  } else {
    body.push(para(entity ? entity.name : (action.entity || ""), { bold: true, size: 14, align: "center" }));
    body.push(para("No approved letterhead asset is configured for this entity - apply the entity letterhead before circulating.",
      { size: 8, align: "center", color: "B45309", italic: true }));
  }

  body.push(para((f.resolutionType || "Board Resolution").toUpperCase(), { bold: true, size: 15, align: "center", spaceBefore: 12 }));
  body.push(para(action.id, { align: "center", size: 10, color: "666666" }));

  body.push(heading("Particulars"));
  body.push(table([
    ["Entity", entity ? entity.name : action.entity],
    ["Entity type", entity ? entity.typeLabel : "-"],
    ["Resolution type", f.resolutionType],
    ["Subject", f.subject],
    ["Addressed to / authority", f.addressedTo],
    ["Requesting department", f.requestingDepartment],
    ["Person authorised", f.authorizedPerson],
    ["Designation", f.authorizedPersonDesignation],
    ["Urgency", f.urgency],
    ["Resolution date", f.resolutionDate],
  ]));

  body.push(heading("Resolved"));
  body.push(f.body
    ? para(f.body)
    : para("The resolution text has not been drafted yet.", { italic: true }));

  if (f.notes) { body.push(heading("Notes")); body.push(para(f.notes)); }

  body.push(heading("Signatories"));
  const sigs = (action.signature && action.signature.signatories) || [];
  body.push(sigs.length
    ? table(sigs.map((s) => [s.name, [s.capacity, s.entity].filter(Boolean).join(", ") || "-"]))
    : para("No signatories have been selected yet.", { italic: true }));

  body.push(provenance({ actor, template, recordRef: action.id }));
  return docx(body.join(""));
}

// Licence application / renewal draft.
function licenceApplicationDraft({ action, licence, template, actor, missing }) {
  const f = action.fields || {};
  const body = [];
  body.push(para((f.applicationType === "new" ? "LICENCE APPLICATION" : "LICENCE RENEWAL APPLICATION"), { bold: true, size: 16, align: "center" }));
  body.push(para(action.id, { align: "center", size: 10, color: "666666" }));

  body.push(heading("Applicant"));
  body.push(table([
    ["Entity", action.entity],
    ["Licence type", f.licenceType],
    ["Issuing authority", f.authority],
    ["Jurisdiction", f.jurisdiction],
    ["Purpose", f.purpose],
  ]));

  if (licence) {
    body.push(heading("Existing licence"));
    body.push(table([
      ["Record", licence.id],
      ["Licence number", licence.number],
      ["Issued", licence.issued],
      ["Expiry", licence.expiry],
      ["Status", licence.status],
    ]));
  }

  body.push(heading("Application"));
  body.push(table([
    ["Application reference", f.applicationReference],
    ["Application start", f.applicationStart],
    ["Required by", f.requiredDate],
    ["Submission date", f.submissionDate],
    ["Decision date", f.decisionDate],
    ["Portal status", f.portalStatus],
  ]));

  if (missing && missing.length) {
    body.push(heading("Outstanding requirements"));
    body.push(table(missing.map((m) => [m.label, m.detail || "Outstanding"])));
  }

  if (f.notes) { body.push(heading("Notes")); body.push(para(f.notes)); }
  body.push(provenance({ actor, template, recordRef: action.id }));
  return docx(body.join(""));
}

/* ------------------------------------------------------ template selection */

// Which approved templates are worth offering for a given action. This narrows
// the real 413-file library to plausible candidates; it never invents an entry,
// and Legal can always pick from the full list instead.
const TEMPLATE_HINTS = {
  "loanAction:amendment": /amendment|amended|first amendment|restated/i,
  "loanAction:rollover": /amendment|extension|rollover|restated/i,
  "loanAction:novation": /novation|assignment|transfer/i,
  "loanAction:termination": /termination|terminate|cancellation/i,
  "loanAction:conversion": /conversion|share|equity|subscription/i,
  "leaseAction:amendment": /lease|amendment|tenancy/i,
  "leaseAction:renewal": /lease|renewal|extension|tenancy/i,
  "leaseAction:termination": /termination|lease|surrender/i,
  "serviceAction:amendment": /service|amendment|consultancy/i,
  "serviceAction:renewal": /service|renewal|extension/i,
  "serviceAction:termination": /termination|service/i,
  "resolution:default": /resolution|board|authorisation|authorization|minutes/i,
  "licenceApplication:renewal": /licen[cs]e|permit|application|renewal/i,
  "licenceApplication:new": /licen[cs]e|permit|application/i,
};

function suggestTemplates(type, subtype, all) {
  const re = TEMPLATE_HINTS[type + ":" + subtype] || TEMPLATE_HINTS[type + ":default"];
  if (!re) return [];
  return all.filter((t) => re.test(t.name || "") || re.test(t.category || ""));
}

module.exports = {
  docx, zip, DOCX_MIME,
  loanActionDraft, agreementActionDraft, resolutionDraft, licenceApplicationDraft,
  suggestTemplates, TEMPLATE_HINTS,
};
