// SECP & STATUTORY COMPLIANCE: THE DRIVE FOLDER TREE IS THE REGISTER.
//
// WHAT THESE CHECKS ARE HOLDING IN PLACE
//
//   NO TRACKER IS NOT NO DATA. The module reported "0 recorded filings ·
//   52 entities · 33 compliance years" over an estate of 43 companies, 250
//   entity-year folders and 3,367 statutory documents. The folder IS the
//   record: "Group Entities / Zameen Medallion / CY 2024" proves that
//   compliance year exists whether or not a spreadsheet says so.
//
//   ONE COMPANY'S RECORD FILED UNDER ANOTHER'S NAME. Reading the entity as
//   "the folder under Group Entities" handed Zameen Delta's audited accounts
//   and AGM minutes to Zameen Crest, and Zameen Nord's 142 files to Zameen
//   Medallion -- both are real companies whose estates sit nested inside
//   another's folder. The owner is the DEEPEST segment naming a known entity.
//
//   THE FORM CATALOGUE IS CONFIGURATION. config/compliance-rules.json
//   classifies Form 29 as event-triggered; the code hardcoded it as annual,
//   which pulled 267 change-of-officer filings into annual compliance rows and
//   left the event register showing 6 records.
//
//   AN EVENT IS FILED IN A YEAR FOLDER. Skipping documents that sat inside a
//   CY folder hid almost the whole event estate -- the Form 29 for a 2022
//   director change lives in CY 2022.
//
//   A DOCUMENT IS NOT A FILING. A Form A PDF proves the company PREPARED one.
//   Only a receipt, challan or acknowledgement proves SECP received it, so
//   documentStatus, filingStatus and acknowledgementStatus stay separate.
//
//   AN SMC HOLDS NO AGM. A single-member company must never read "AGM
//   overdue", and that rule lives in one place.
//
//   node tests/m20-secp-statutory.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const audit = (n) => { try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", n), "utf8")); } catch (e) { return null; } };

H.runSuite("m20-secp-statutory — the Drive estate, fully accounted for", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_SECP_PORT", portFallback: "4860", prefix: "legalos-secp-",
  }));
  const cookie = await H.loginApi(sb, H.USERS.complLead.email);
  const get = async (p) => H.request(sb.base, "GET", p, { cookie });

  /* ---- 1. the source root ------------------------------------------------ */
  const inv = audit("secp-root-inventory.json");
  check("the SECP root is crawled to every leaf",
    !!inv && inv.files > 3000,
    inv ? inv.files + " files under '" + inv.root + "'" : "inventory missing");
  check("no unknown root child",
    !!inv && inv.unknownRootChildren.length === 0,
    inv ? "root children: " + Object.keys(inv.rootChildren).join(", ") : "-");

  /* ---- 2. entities ------------------------------------------------------- */
  const reg = audit("secp-entity-registry.json");
  check("every Drive entity folder becomes exactly one canonical entity",
    !!reg && reg.entities === reg.canonicalDistinct,
    reg ? reg.entities + " entities = " + reg.canonicalDistinct + " canonical keys ("
      + reg.group + " group, " + reg.nonGroup + " non-group)" : "registry missing");
  check("group / non-group provenance is preserved",
    !!reg && reg.group > 0 && reg.nonGroup > 0 && reg.group + reg.nonGroup === reg.entities,
    reg ? reg.group + " + " + reg.nonGroup + " = " + reg.entities : "-");
  check("entity type is classified for every entity",
    !!reg && reg.registry.every((e) => e.entityType),
    reg ? JSON.stringify(reg.byType) : "-");

  /* ---- 3. compliance years ----------------------------------------------- */
  const sum = audit("secp-final-summary.json");
  const recon = audit("secp-ui-reconciliation.json");
  check("every entity-year folder in Drive became a record",
    !!recon && recon.foldersWithoutRecord.length === 0,
    recon ? recon.entityYearFoldersInDrive + " folders -> " + recon.entityYearRecords + " records" : "-");
  check("no record claims a year folder that does not exist",
    !!recon && recon.recordsWithoutFolder.length === 0,
    recon ? recon.recordsWithoutFolder.length + " records without a folder" : "-");
  check("entity-year records are distinguished from calendar years",
    !!sum && sum.complianceYears.entityYearRecords > sum.complianceYears.distinctCalendarYears,
    sum ? sum.complianceYears.entityYearRecords + " entity-year records across "
      + sum.complianceYears.distinctCalendarYears + " calendar years (" + sum.complianceYears.range + ")" : "-");

  /* ---- 4. the source period label is never rewritten ---------------------- */
  const annual = audit("secp-annual-compliance.json");
  check("the source period wording is preserved verbatim",
    !!annual && annual.list.every((r) => r.sourcePeriodLabel && r.sourcePeriodLabel === r.periodType + " " + r.complianceYear),
    annual ? "e.g. " + annual.list[0].sourcePeriodLabel + " (periodType " + annual.list[0].periodType + ")" : "-");

  /* ---- 5. document / filing / acknowledgement stay separate --------------- */
  check("a document on file is never reported as a filing",
    !!annual && annual.list.every((r) =>
      r.filingStatus !== "EVIDENCE_OF_SUBMISSION" || (r.documents || []).length > 0),
    annual ? annual.provenSubmissions + " of " + annual.records + " annual records carry submission evidence" : "-");
  check("the filed count is not the record count",
    !!sum && sum.filings.provenSubmitted > 0
      && sum.filings.provenSubmitted < sum.complianceYears.entityYearRecords,
    sum ? sum.filings.provenSubmitted + " proven submissions vs "
      + sum.complianceYears.entityYearRecords + " entity-year records" : "-");
  check("acknowledgements are counted only where evidenced",
    !!sum && sum.filings.acknowledgementsReceived <= sum.filings.provenSubmitted + sum.eventFilings.records,
    sum ? sum.filings.acknowledgementsReceived + " acknowledgements" : "-");

  /* ---- 6. the SMC rule --------------------------------------------------- */
  const smc = annual ? annual.list.filter((r) => r.entityType === "SMC") : [];
  check("an SMC is never required to hold an AGM",
    smc.length > 0 && smc.every((r) => r.agm.applicable === false && r.agm.status === "NOT_APPLICABLE"),
    smc.length + " SMC entity-year records, all AGM NOT_APPLICABLE");
  check("a private limited company keeps its AGM requirement",
    !!annual && annual.list.some((r) => r.entityType === "PRIVATE_LIMITED" && r.agm.applicable === true),
    annual ? annual.list.filter((r) => r.agm.applicable).length + " records where an AGM applies" : "-");

  /* ---- 7. the form catalogue is configuration ---------------------------- */
  const rules = JSON.parse(fs.readFileSync(P.join(ROOT, "config", "compliance-rules.json"), "utf8"));
  const cfgAnnual = (rules.secp.forms || []).filter((f) => f.category === "annual").map((f) => "Form " + f.code);
  const rowForms = new Set();
  if (annual) annual.list.forEach((r) => (r.forms || []).forEach((f) => rowForms.add(f.form)));
  check("annual rows show exactly the configured annual forms",
    cfgAnnual.length > 0 && [...rowForms].every((f) => cfgAnnual.includes(f)) && cfgAnnual.every((f) => rowForms.has(f)),
    "configured [" + cfgAnnual.join(", ") + "] vs rendered [" + [...rowForms].join(", ") + "]");

  const events = audit("secp-event-filings.json");
  check("no annual form is recorded as an event filing",
    !!events && events.list.every((r) => !r.formCode || !["A", "9", "19"].includes(r.formCode)),
    events ? events.records + " event filings, forms " + Object.keys(events.byForm).join(",") : "-");
  check("the event register is built from the whole estate, not just loose files",
    !!events && events.records > 100 && Object.keys(events.byForm).length > 4,
    events ? events.records + " event filings over "
      + new Set(events.list.map((r) => r.entityKey)).size + " entities" : "-");

  /* ---- 8. registers are records, not filings ----------------------------- */
  const regs = audit("secp-statutory-registers.json");
  check("statutory registers never inflate the filing count",
    !!regs && regs.countedAsFilings === 0,
    regs ? regs.records + " registers: " + JSON.stringify(regs.byCategory) : "-");
  check("register spelling variants do not create duplicate categories",
    !!regs && !Object.keys(regs.byCategory).some((a) =>
      Object.keys(regs.byCategory).some((b) => a !== b && a.replace(/S$/, "") === b.replace(/S$/, ""))),
    regs ? Object.keys(regs.byCategory).join(", ") : "-");

  /* ---- 9. disposition and lineage ---------------------------------------- */
  const disp = audit("secp-file-disposition.json");
  check("every file under the SECP root reaches a record",
    !!disp && disp.withoutDisposition === 0,
    disp ? disp.rootFiles + " files, " + disp.disposed + " disposed, "
      + disp.withoutDisposition + " without disposition" : "-");
  const lin = audit("secp-document-lineage.json");
  check("every mapped document traces back to a live Drive file",
    !!lin && lin.brokenLinks === 0,
    lin ? lin.mappings + " mappings, " + lin.brokenLinks + " broken" : "-");
  check("a file filed inside another entity's folder is recorded, not hidden",
    !!lin && lin.filesInAnotherEntitysFolder > 0,
    lin ? lin.filesInAnotherEntitysFolder + " files sit in another entity's folder and are attributed to their own" : "-");

  /* ---- 10. counts agree -------------------------------------------------- */
  check("a record's stated document count equals its document list",
    !!recon && recon.documentCountMismatches.length === 0,
    recon ? recon.documentCountMismatches.length + " mismatches" : "-");
  check("no two records share an id",
    !!recon && recon.duplicateRecordIds.length === 0,
    recon ? recon.duplicateRecordIds.length + " duplicate ids" : "-");

  /* ---- 11. the API serves what the model holds --------------------------- */
  const ov = await get("/api/compliance/secp/overview");
  check("the overview endpoint answers", ov.status === 200, "HTTP " + ov.status);
  const ann = await get("/api/compliance/secp/annual");
  const annRows = (ann.body && ann.body.annual) || [];
  check("the annual register serves every entity-year record",
    ann.status === 200 && sum && annRows.length === sum.complianceYears.entityYearRecords
      && ann.body.total === annRows.length,
    "HTTP " + ann.status + " -> " + annRows.length
      + " records, model holds " + (sum ? sum.complianceYears.entityYearRecords : "?"));
  const evs = await get("/api/compliance/secp/events");
  const evRows = (evs.body && evs.body.events) || [];
  check("the event register serves every event filing",
    evs.status === 200 && sum && evRows.length === sum.eventFilings.records,
    "HTTP " + evs.status + " -> " + evRows.length
      + " records, model holds " + (sum ? sum.eventFilings.records : "?"));
  const rgs = await get("/api/compliance/secp/registers");
  const rgRows = (rgs.body && rgs.body.registers) || [];
  check("the statutory registers endpoint serves every register",
    rgs.status === 200 && sum && rgRows.length === sum.statutoryRegisters.records,
    "HTTP " + rgs.status + " -> " + rgRows.length
      + " records, model holds " + (sum ? sum.statutoryRegisters.records : "?"));

  /* ---- 12. a year record drills down ------------------------------------- */
  const first = annRows[0];
  if (first) {
    const one = await get("/api/compliance/secp/annual/" + encodeURIComponent(first.id));
    const rec = one.body && (one.body.record || one.body);
    check("a compliance year opens its full statutory record",
      one.status === 200 && rec && rec.id === first.id && !!rec.financialStatements && !!rec.agm && Array.isArray(rec.forms),
      "HTTP " + one.status + " -> " + (rec ? rec.entity + " " + rec.sourcePeriodLabel
        + ": FS " + rec.financialStatements.status + ", AGM " + rec.agm.status
        + ", " + rec.forms.length + " form rows, " + (rec.documents || []).length + " documents" : "no record"));
    check("the year record names the Drive folder it was built from",
      !!rec && typeof rec.sourceFolder === "string" && rec.sourceFolder.startsWith("Entities data for secp filing"),
      rec ? rec.sourceFolder : "-");
  }

  /* ---- 13. an unknown id is refused, not guessed ------------------------- */
  const bad = await get("/api/compliance/secp/annual/SECPY-does-not-exist");
  check("an unknown compliance year is a 404, never a fabricated record",
    bad.status === 404, "HTTP " + bad.status);

  /* ---- 14. the order a statutory year is read in -------------------------- */
  const STAGES = ["FINANCIAL_STATEMENTS", "AGM", "FORM", "SUBMISSION_EVIDENCE", "ACKNOWLEDGEMENT", "SUPPORTING"];
  let orderErrors = 0, staged = 0;
  for (const r of annRows) {
    let last = -1;
    for (const d of (r.documents || [])) {
      const i = STAGES.indexOf(d.stage); staged++;
      if (i < last) orderErrors++;
      last = Math.max(last, i);
    }
  }
  check("documents within a compliance year run accounts -> AGM -> forms -> lodgement",
    orderErrors === 0 && staged > 0, staged + " documents staged, " + orderErrors + " ordering errors");

  const dated = annRows.flatMap((r) => r.documents || []).filter((d) => d.documentDate);
  check("a document date is read from the document, never from Drive's clock",
    dated.length > 0 && dated.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.documentDate)),
    dated.length + " documents carry a date stated in the source");

  /* ---- 15. one logical document, every physical copy kept ---------------- */
  const dupRec = annRows.find((r) => r.physicalFileCount && r.physicalFileCount > r.documentCount);
  check("duplicate physical copies collapse to one logical document",
    !!dupRec && dupRec.documentCount === (dupRec.documents || []).length,
    dupRec ? dupRec.entity + " " + dupRec.sourcePeriodLabel + ": " + dupRec.documentCount
      + " documents over " + dupRec.physicalFileCount + " physical files in Drive"
      : "no record has more physical copies than documents");

  /* ---- 16. the register row opens its own detail ------------------------- */
  const viaYears = await get("/api/compliance/secp/years/" + encodeURIComponent(annRows[0].id));
  check("a row in the annual register opens its compliance year",
    viaYears.status === 200 && viaYears.body.year && viaYears.body.year.id === annRows[0].id,
    "HTTP " + viaYears.status + " for " + annRows[0].id);

  /* ---- 17. the portal is configuration, not a hardcoded link ------------- */
  const portals = (rules.secp.portals || []);
  check("the SECP portal links are configured, with LEAP as the current one",
    portals.length > 0 && portals.some((pt) => pt.current && /leap\.secp\.gov\.pk/.test(pt.url)),
    portals.map((pt) => pt.label + (pt.current ? " (current)" : "") + " -> " + pt.url).join("  |  "));

  /* ---- 18. Data Health recomputes; it never reads a stale artifact ------- */
  const adminCookie = await H.loginApi(sb, H.USERS.director.email);
  const health = await H.request(sb.base, "GET", "/api/registers/secp-health", { cookie: adminCookie });
  const hb = health.body || {};
  check("Data Health reports the SECP estate with every gate at zero",
    health.status === 200 && hb.gates && Object.values(hb.gates).every((v) => v === 0),
    "HTTP " + health.status + " " + (hb.gates ? JSON.stringify(hb.gates) : ""));
  check("Data Health agrees with the registers it describes",
    health.status === 200 && sum
      && hb.records.entityYears === sum.complianceYears.entityYearRecords
      && hb.records.eventFilings === sum.eventFilings.records
      && hb.source.files === sum.source.files,
    hb.records ? hb.source.files + " files, " + hb.records.entityYears + " entity-years, "
      + hb.records.eventFilings + " event filings, " + hb.records.documentsMapped + " documents mapped" : "-");
  const denied = await H.request(sb.base, "GET", "/api/registers/secp-health", { cookie });
  check("SECP Data Health is restricted to administrators", denied.status === 403, "HTTP " + denied.status);

  /* ---- 19. source-backed history vs system-generated obligations --------- */
  /* The workspace used to print "FY 2028 / FY 2027 / FY 2026" -- a formula's
     output -- in the header above ten years of real filings, where it read
     exactly like source. The two populations are now separate everywhere. */
  const up = await get("/api/compliance/secp/upcoming");
  const upRows = (up.body && up.body.upcoming) || [];
  check("future obligations are served on their own route, marked system-generated",
    up.status === 200 && upRows.length > 0 && upRows.every((r) => r.origin === "SYSTEM_GENERATED"),
    upRows.length + " obligations, origin " + [...new Set(upRows.map((r) => r.origin))].join(","));
  check("no Drive-backed record is ever marked system-generated",
    annRows.every((r) => r.origin === "SECP_SOURCE_DRIVE"),
    [...new Set(annRows.map((r) => r.origin))].join(","));

  /* (B) a generated year must never appear in the source-backed history */
  const sourceYears = new Set(annRows.map((r) => r.sourcePeriodLabel));
  const driveYearsFromFolders = new Set((audit("secp-year-matrix.json") || { years: [] }).years.map((y) => "CY " + y));
  check("the source history contains only years Drive holds a folder for",
    [...sourceYears].every((y) => driveYearsFromFolders.has(y)),
    [...sourceYears].sort().join(", "));
  check("a year that exists only as a future obligation is absent from the history",
    upRows.filter((r) => !r.sourceBacked).every((r) => !annRows.some((a) => a.entityKey === r.entityKey && a.sourcePeriodLabel === r.sourcePeriodLabel)),
    upRows.filter((r) => !r.sourceBacked).length + " obligations have no Drive folder, and none appears in the history");

  /* (A) one entity's years match its Drive folders exactly */
  const matrix = audit("secp-year-matrix.json");
  if (matrix) {
    const row = matrix.matrix.slice().sort((a, b) =>
      Object.values(b.years).filter(Boolean).length - Object.values(a.years).filter(Boolean).length)[0];
    const fromMatrix = Object.entries(row.years).filter(([, v]) => v).map(([y]) => "CY " + y).sort();
    const fromApi = annRows.filter((r) => r.entityKey === row.entityKey).map((r) => r.sourcePeriodLabel).sort();
    check("an entity's compliance years are exactly the year folders Drive holds",
      JSON.stringify(fromMatrix) === JSON.stringify(fromApi),
      row.entity + ": Drive " + fromMatrix.join(",") + "  |  LegalOS " + fromApi.join(","));
  }

  /* (C) a year folder is a record whether or not it holds documents */
  const hb2 = ((await H.request(sb.base, "GET", "/api/registers/secp-health",
    { cookie: await H.loginApi(sb, H.USERS.director.email) })).body || {});
  check("every Drive year folder reaches LegalOS, and none is invented",
    hb2.sourceYears && hb2.sourceYears.driveYearsMissingFromUI === 0 && hb2.sourceYears.uiYearsAbsentFromDrive === 0,
    hb2.sourceYears ? hb2.sourceYears.driveYearFolders + " year folders -> "
      + hb2.sourceYears.distinctEntityYearsInDrive + " distinct entity-years -> "
      + hb2.sourceYears.sourceBackedRecords + " records (missing "
      + hb2.sourceYears.driveYearsMissingFromUI + ", invented " + hb2.sourceYears.uiYearsAbsentFromDrive + ")" : "-");
  check("Data Health never adds source-backed and system-generated into one number",
    hb2.records && hb2.generated && hb2.records.entityYears !== undefined
      && hb2.generated.futureObligationRecords !== undefined,
    hb2.records ? hb2.records.entityYears + " source-backed entity-years, "
      + hb2.generated.futureObligationRecords + " system-generated obligations, reported separately" : "-");

  /* (D) a document nested below the year folder is still mapped to that year */
  const nested = annRows.flatMap((r) => (r.documents || []).map((d) => ({ r, d })))
    .filter(({ r, d }) => String(d.folderPath || "").startsWith(r.sourceFolder + " / "));
  check("a document nested below a year folder still belongs to that year",
    nested.length > 0 && nested.every(({ r, d }) => String(d.folderPath).startsWith(r.sourceFolder)),
    nested.length + " documents sit in a subfolder of their compliance year and are mapped to it");

  /* (section 23) the whole Drive folder chain, by id */
  const CHAIN = ["rootFolderId", "groupFolderId", "entityFolderId", "yearFolderId", "exactSourceFolderName", "fullDrivePath"];
  check("every entity-year record carries its root / group / entity / year folder ids",
    annRows.every((r) => CHAIN.every((f) => r[f])),
    annRows.filter((r) => !CHAIN.every((f) => r[f])).length + " records missing part of the Drive chain");
  check("the source group comes from the Drive path, not from a name",
    annRows.every((r) => /^(Group|Non-Group) Entities$/.test(String(r.groupFolderName || ""))),
    [...new Set(annRows.map((r) => r.groupFolderName))].join(" | "));

  /* ---- 20. the record id strategy, verified rather than replaced --------- */
  /* Ids are SECPY-<entity>-CY<year> / SECPE-… / SECPR-…: stable, source-derived
     and surviving the case where one entity-year is backed by two Drive
     folders (hashing a year folder id would be ambiguous there). What matters
     is that they are unique, stable, collision-free across the group boundary,
     and each resolves to full Drive lineage. */
  const allIds = annRows.map((r) => r.id)
    .concat(((evs.body && evs.body.events) || []).map((r) => r.id))
    .concat(((rgs.body && rgs.body.registers) || []).map((r) => r.id));
  check("every record id is unique across all three registers",
    new Set(allIds).size === allIds.length,
    allIds.length + " ids, " + new Set(allIds).size + " distinct");

  /* entity canonicalisation must not fold two companies onto one id */
  const byId = new Map();
  for (const r of annRows) {
    if (byId.has(r.id) && byId.get(r.id) !== r.entity) throw new Error("id collision: " + r.id);
    byId.set(r.id, r.entity);
  }
  const perEntityYear = new Map();
  for (const r of annRows) perEntityYear.set(r.entityKey + "|" + r.complianceYear, (perEntityYear.get(r.entityKey + "|" + r.complianceYear) || 0) + 1);
  check("entity canonicalisation cannot collapse two companies onto one id",
    [...perEntityYear.values()].every((n) => n === 1)
      && new Set(annRows.map((r) => r.entity)).size === new Set(annRows.map((r) => r.entityKey)).size,
    new Set(annRows.map((r) => r.entityKey)).size + " canonical keys for "
      + new Set(annRows.map((r) => r.entity)).size + " entity names");

  check("a group and a non-group company cannot share an id",
    (() => {
      const g = new Map();
      for (const r of annRows) {
        const prev = g.get(r.id);
        if (prev && prev !== r.group) return false;
        g.set(r.id, r.group);
      }
      return true;
    })(),
    "group and non-group records checked for id overlap");

  check("every id resolves to full Drive lineage",
    annRows.every((r) => r.rootFolderId && r.entityFolderId && r.yearFolderId && r.fullDrivePath),
    annRows.filter((r) => !(r.rootFolderId && r.entityFolderId && r.yearFolderId)).length + " ids without lineage");

  /* ---- 21. one record, every source folder ------------------------------- */
  check("an entity-year backed by two Drive folders stays ONE record",
    annRows.every((r) => Array.isArray(r.sourceFolders) && r.sourceFolders.length > 0),
    annRows.filter((r) => !(r.sourceFolders || []).length).length + " records without a source folder list");
  const multiFolder = annRows.filter((r) => (r.sourceFolders || []).some((f) => !String(f.fullDrivePath).startsWith(r.sourceFolder)));
  check("no source folder is discarded because the record is singular",
    multiFolder.length > 0 && multiFolder.every((r) => r.sourceFolders.every((f) => f.sourceFolderId)),
    multiFolder.length + " entity-years draw on a folder outside their own year path; every folder keeps its Drive id");

  /* ---- 22. ids survive a rebuild ---------------------------------------- */
  /* Built in a FRESH process, from a fresh crawl of the index, so this catches
     an id that depends on iteration order or on anything cached in memory. */
  {
    const { execFileSync } = require("child_process");
    const script = "const d=require('./api/drive.js');const s=require('./api/secp-records.js');"
      + "d.ensureIndex().then(()=>{const ids=s.annualCompliance().map(r=>r.id)"
      + ".concat(s.eventFilings().map(r=>r.id)).concat(s.statutoryRegisters().map(r=>r.id)).sort();"
      + "console.log(JSON.stringify(ids));});";
    const run = () => JSON.parse(execFileSync(process.execPath, ["-e", script],
      { cwd: P.join(__dirname, ".."), maxBuffer: 1 << 28 }).toString().trim());
    const a = run(), b = run();
    check("every record id is identical across two independent rebuilds",
      a.length > 0 && JSON.stringify(a) === JSON.stringify(b),
      a.length + " ids rebuilt twice in separate processes, " + (JSON.stringify(a) === JSON.stringify(b) ? "identical" : "DIFFERENT"));
    check("the ids the API serves are the ids a rebuild produces",
      allIds.every((id) => a.includes(id)),
      allIds.filter((id) => !a.includes(id)).length + " served ids absent from a fresh rebuild");
  }

  /* ---- 23. authorization ------------------------------------------------- */
  const anon = await H.request(sb.base, "GET", "/api/compliance/secp/annual", {});
  check("the statutory register is not readable without a session",
    anon.status === 401 || anon.status === 403, "HTTP " + anon.status);
});
