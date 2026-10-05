#!/usr/bin/env node
/* SECP RECONCILIATION -- Drive estate <-> LegalOS records, both directions.
 *
 * Emits the machine-readable audit trail for the statutory module. It asserts
 * rather than describes: every file under the SECP root must reach a record,
 * every record must name the folder it was built from, and the counts a screen
 * prints must equal the counts the model holds.
 *
 * It stores metadata and lineage only -- never document bodies.
 *
 *   node tools/secp-reconcile.js
 */
const fs = require("fs");
const path = require("path");
const drive = require("../api/drive.js");
const source = require("../api/secp-source.js");
const records = require("../api/secp-records.js");

const ROOT = "Entities data for secp filing";
const OUT = path.join(__dirname, "..", "audit");
const YEAR_RE = /^(CY|FY)\s*((19|20)\d{2})$/i;
const seg = (p) => String(p || "").split(" / ").map((x) => x.trim()).filter(Boolean);
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
  return name;
};

(async () => {
  await drive.ensureIndex();
  fs.mkdirSync(OUT, { recursive: true });

  const files = drive.indexFiles().filter((f) => String(f.folderPath || "").startsWith(ROOT));
  const annual = records.annualCompliance();
  const events = records.eventFilings();
  const registers = records.statutoryRegisters();
  const g = source.get() || {};
  const entities = Array.isArray(g.entities) ? g.entities : Object.values(g.entities || {});

  /* -- 1. root inventory ---------------------------------------------------- */
  const rootChildren = {}, depths = {}, mimes = {};
  for (const f of files) {
    const s = seg(f.folderPath);
    if (s[1]) rootChildren[s[1]] = (rootChildren[s[1]] || 0) + 1;
    depths[s.length] = (depths[s.length] || 0) + 1;
    mimes[f.mimeType || "unknown"] = (mimes[f.mimeType || "unknown"] || 0) + 1;
  }
  write("secp-root-inventory.json", {
    root: ROOT, files: files.length, rootChildren,
    unknownRootChildren: Object.keys(rootChildren).filter((k) => !/^(Group|Non-Group) Entities$/i.test(k)),
    pathDepths: depths, mimeTypes: mimes, generatedAt: new Date().toISOString(),
  });

  /* -- 2. entity registry --------------------------------------------------- */
  const registry = entities.map((e) => ({
    key: e.key, name: e.name, group: e.group, entityType: (/\bSMC\b|single\s*member/i.test(e.name) ? "SMC" : /\(\s*private\s*\)|\bpvt\b/i.test(e.name) ? "PRIVATE_LIMITED" : "OTHER"),
    sourceFolder: e.folderPath, documents: e.documents,
    complianceYears: annual.filter((r) => r.entityKey === e.key).length,
    eventFilings: events.filter((r) => r.entityKey === e.key).length,
    statutoryRegisters: registers.filter((r) => r.entityKey === e.key).length,
  })).sort((a, b) => a.name.localeCompare(b.name));
  write("secp-entity-registry.json", {
    entities: registry.length,
    group: registry.filter((e) => e.group === "group").length,
    nonGroup: registry.filter((e) => e.group === "non-group").length,
    canonicalDistinct: new Set(registry.map((e) => e.key)).size,
    byType: registry.reduce((a, e) => ((a[e.entityType] = (a[e.entityType] || 0) + 1), a), {}),
    registry,
  });

  /* -- 3. entity x year matrix ---------------------------------------------- */
  const years = [...new Set(annual.map((r) => r.complianceYear))].filter(Boolean).sort();
  const matrix = registry.map((e) => {
    const row = { entity: e.name, entityKey: e.key, entityType: e.entityType, group: e.group, years: {} };
    for (const y of years) {
      const r = annual.find((a) => a.entityKey === e.key && a.complianceYear === y);
      row.years[y] = !r ? null : {
        folder: true, documents: r.documentCount,
        financialStatements: r.financialStatements.status,
        agm: r.agm.status, agmApplicable: r.agm.applicable,
        forms: r.forms.filter((f) => f.documentStatus === "AVAILABLE").map((f) => f.form),
        filingStatus: r.filingStatus, acknowledgementStatus: r.acknowledgementStatus,
      };
    }
    return row;
  });
  write("secp-year-matrix.json", { years, entities: matrix.length, entityYearRecords: annual.length, matrix });

  /* -- 4. file disposition -------------------------------------------------- */
  const placed = new Map();
  const put = (d, where, id) => {
    if (!placed.has(d.id)) placed.set(d.id, { name: d.name, folderPath: d.folderPath, placements: [] });
    placed.get(d.id).placements.push({ register: where, recordId: id });
  };
  annual.forEach((r) => (r.documents || []).forEach((d) => put(d, "annual-compliance", r.id)));
  events.forEach((r) => (r.documents || []).forEach((d) => put(d, "event-filing", r.id)));
  registers.forEach((r) => (r.documents || []).forEach((d) => put(d, "statutory-register", r.id)));
  const undisposed = files.filter((f) => !placed.has(f.id)).map((f) => ({ id: f.id, name: f.name, folderPath: f.folderPath }));
  write("secp-file-disposition.json", {
    rootFiles: files.length, disposed: placed.size, withoutDisposition: undisposed.length,
    inMultipleRegisters: [...placed.values()].filter((v) => v.placements.length > 1).length,
    undisposed,
    disposition: [...placed.entries()].map(([id, v]) => ({ fileId: id, name: v.name, folderPath: v.folderPath, placements: v.placements })),
  });

  /* -- 5,6,7. the three registers ------------------------------------------- */
  const strip = (r) => ({ ...r, documents: (r.documents || []).map((d) => ({ id: d.id, name: d.name, folderPath: d.folderPath, mimeType: d.mimeType })) });
  write("secp-annual-compliance.json", {
    records: annual.length,
    provenSubmissions: annual.filter((r) => r.filingStatus === "EVIDENCE_OF_SUBMISSION").length,
    acknowledgements: annual.filter((r) => r.acknowledgementStatus === "RECEIVED").length,
    withoutDocuments: annual.filter((r) => r.documentCount === 0).length,
    agmNotApplicable: annual.filter((r) => !r.agm.applicable).length,
    list: annual.map(strip),
  });
  write("secp-event-filings.json", {
    records: events.length, dated: events.filter((r) => r.eventDate).length,
    undated: events.filter((r) => !r.eventDate).length,
    provenSubmissions: events.filter((r) => r.filingStatus === "EVIDENCE_OF_SUBMISSION").length,
    byForm: events.reduce((a, r) => ((a[r.formCode || r.eventType] = (a[r.formCode || r.eventType] || 0) + 1), a), {}),
    list: events.map(strip),
  });
  write("secp-statutory-registers.json", {
    records: registers.length,
    byCategory: registers.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {}),
    countedAsFilings: registers.filter((r) => r.isFiling).length,
    list: registers.map(strip),
  });

  /* -- 8. document lineage: every record back to a real Drive folder -------- */
  const byId = new Map(files.map((f) => [f.id, f]));
  const lineage = [], broken = [], misfiled = [];
  const known = new Set(entities.map((e) => e.key));
  const { entityKey } = require("../api/entities.js");
  for (const [kind, list] of [["annual-compliance", annual], ["event-filing", events], ["statutory-register", registers]]) {
    for (const r of list) {
      for (const d of (r.documents || [])) {
        const f = byId.get(d.id);
        if (!f) { broken.push({ register: kind, recordId: r.id, fileId: d.id, name: d.name }); continue; }
        const s = seg(f.folderPath);
        let ownerIdx = 2;
        for (let i = 3; i < s.length; i++) if (known.has(entityKey(s[i]))) ownerIdx = i;
        if (ownerIdx !== 2) misfiled.push({ register: kind, recordId: r.id, fileId: d.id, name: f.name, filedUnder: s.slice(0, ownerIdx).join(" / "), belongsTo: s[ownerIdx] });
        lineage.push({ register: kind, recordId: r.id, fileId: d.id, folderPath: f.folderPath, root: ROOT });
      }
    }
  }
  write("secp-document-lineage.json", {
    mappings: lineage.length, brokenLinks: broken.length, broken,
    filesInAnotherEntitysFolder: misfiled.length,
    misfiledSample: misfiled.slice(0, 40),
  });

  /* -- 9. source <-> record reconciliation, both directions ----------------- */
  const folderYears = new Set();
  for (const f of files) {
    const s = seg(f.folderPath);
    if (!s[2]) continue;
    let oi = 2;
    for (let i = 3; i < s.length; i++) if (known.has(entityKey(s[i]))) oi = i;
    if (s[oi + 1] && YEAR_RE.test(s[oi + 1])) folderYears.add(s[oi] + "||" + s[oi + 1]);
  }
  const recordYears = new Set(annual.map((r) => r.entity + "||" + r.sourcePeriodLabel));
  const recon = {
    entityYearFoldersInDrive: folderYears.size,
    entityYearRecords: annual.length,
    foldersWithoutRecord: [...folderYears].filter((k) => !recordYears.has(k)),
    recordsWithoutFolder: [...recordYears].filter((k) => !folderYears.has(k)),
    documentCountMismatches: [...annual, ...events, ...registers]
      .filter((r) => r.documentCount !== (r.documents || []).length)
      .map((r) => ({ recordId: r.id, stated: r.documentCount, actual: (r.documents || []).length })),
    duplicateRecordIds: (() => {
      const seen = new Map();
      for (const r of [...annual, ...events, ...registers]) seen.set(r.id, (seen.get(r.id) || 0) + 1);
      return [...seen.entries()].filter(([, v]) => v > 1).map(([id, n]) => ({ id, n }));
    })(),
  };
  write("secp-ui-reconciliation.json", recon);

  /* -- 10. summary ---------------------------------------------------------- */
  const summary = {
    generatedAt: new Date().toISOString(),
    source: { root: ROOT, files: files.length, rootChildren: Object.keys(rootChildren) },
    entities: { total: registry.length, group: registry.filter((e) => e.group === "group").length, nonGroup: registry.filter((e) => e.group === "non-group").length },
    complianceYears: { entityYearRecords: annual.length, distinctCalendarYears: years.length, range: years.length ? years[0] + "-" + years[years.length - 1] : null },
    eventFilings: { records: events.length, dated: events.filter((r) => r.eventDate).length },
    statutoryRegisters: { records: registers.length },
    filings: {
      provenSubmitted: annual.filter((r) => r.filingStatus === "EVIDENCE_OF_SUBMISSION").length + events.filter((r) => r.filingStatus === "EVIDENCE_OF_SUBMISSION").length,
      acknowledgementsReceived: annual.filter((r) => r.acknowledgementStatus === "RECEIVED").length + events.filter((r) => r.acknowledgementStatus === "RECEIVED").length,
    },
    gates: {
      UNKNOWN_ROOT_CHILDREN: Object.keys(rootChildren).filter((k) => !/^(Group|Non-Group) Entities$/i.test(k)).length,
      FILES_WITHOUT_DISPOSITION: undisposed.length,
      ENTITY_YEAR_FOLDERS_WITHOUT_RECORD: recon.foldersWithoutRecord.length,
      RECORDS_WITHOUT_FOLDER: recon.recordsWithoutFolder.length,
      BROKEN_DRIVE_LINKS: broken.length,
      DOCUMENT_COUNT_MISMATCH: recon.documentCountMismatches.length,
      DUPLICATE_RECORD_IDS: recon.duplicateRecordIds.length,
    },
  };
  write("secp-final-summary.json", summary);

  const pass = Object.values(summary.gates).every((v) => v === 0);
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nGATES: " + (pass ? "ALL PASS" : "FAILURES PRESENT"));
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
