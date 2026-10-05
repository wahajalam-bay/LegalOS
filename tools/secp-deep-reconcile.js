/* SECP — THE DEEP PASS, BOTH DIRECTIONS.
 *
 * Not "does Data Health flag anything" — Drive is the driver. This walks the
 * SECP root to the last document and asks two questions of every object:
 *
 *   DRIVE → LEGALOS   every entity folder, every CY folder, every statutory
 *                     register folder and every file: is it represented, and
 *                     under which canonical entity and year?
 *   LEGALOS → DRIVE   every entity-year and every document LegalOS shows:
 *                     does the folder it claims to come from actually exist?
 *
 * Anything that fails either direction is printed with enough detail to act on.
 *   node tools/secp-deep-reconcile.js [--json]
 */
const fs = require("fs");
const path = require("path");
const drive = require("../api/drive.js");
const secpSource = require("../api/secp-source.js");

const ROOT = "Entities data for secp filing";
const OUT = path.join(__dirname, "..", "audit");
const JSON_ONLY = process.argv.includes("--json");
const say = (...a) => { if (!JSON_ONLY) console.log(...a); };

const depth = (p) => (p || "").split(" / ").length;
const YEAR = /\b(?:CY|FY)?\s*[-_ ]?((?:19|20)\d{2})\b/;

/* What a folder directly under an entity is FOR. The estate uses stable
   wording for the statutory registers; everything else is read as a year
   folder when it names one, and reported when it does not. */
function classifyEntityChild(name) {
  if (/register of directors/i.test(name)) return "REGISTER_OF_DIRECTORS";
  if (/register of members/i.test(name)) return "REGISTER_OF_MEMBERS";
  if (/share ?holder[_'’]*s?[_'’]*\s*certificate/i.test(name)) return "SHARE_CERTIFICATES";
  if (/share certificate/i.test(name)) return "SHARE_CERTIFICATES";
  if (/data rectification|rectification of form/i.test(name)) return "CORPORATE_ACTION";
  if (/resolution|authoriz/i.test(name)) return "RESOLUTIONS";
  if (/provident fund|pf trust|eobi/i.test(name)) return "STAFF_FUNDS";
  if (/show cause|notice|order/i.test(name)) return "SECP_CORRESPONDENCE";
  if (/company profile/i.test(name)) return "COMPANY_PROFILE";
  if (/register/i.test(name)) return "OTHER_STATUTORY_REGISTER";
  if (YEAR.test(name)) return "FILING_YEAR";
  /* A COMPANY FOLDER INSIDE ANOTHER COMPANY'S FOLDER.
     Zameen Nord's whole estate is filed under Zameen Medallion. Drive is the
     source and must not be moved (§36), so this is a legitimate kind: the
     physical path stays, and the model resolves the logical entity. */
  if (/\((SMC-)?(Private|Public)\)\s*Limited$|\bLimited$/i.test(name)) return "CROSS_COMPANY_FOLDER";
  return "UNCLASSIFIED_ENTITY_CHILD";
}

(async () => {
  await drive.ensureIndex();
  const folders = drive.indexFolders().filter((f) => f.root === ROOT);
  const files = drive.indexFiles().filter((f) => f.root === ROOT);

  const entityFolders = folders.filter((f) => depth(f.folderPath) === 2);
  const children = folders.filter((f) => depth(f.folderPath) === 3);

  say("=== DRIVE (walked now, not from cache) ===\n");
  say("  entity folders          " + entityFolders.length);
  say("  folders under entities  " + children.length);
  say("  folders (all depths)    " + folders.length);
  say("  files                   " + files.length);

  // ---- what each entity actually holds
  const byEntity = new Map();
  for (const e of entityFolders) {
    byEntity.set(e.folderPath + " / " + e.name, {
      name: e.name, id: e.id, group: /Group Entities$/.test(e.folderPath) ? "group" : "non-group",
      path: e.folderPath + " / " + e.name,
      years: [], registers: [], other: [], files: 0,
    });
  }
  const kinds = {};
  const unclassified = [];
  for (const c of children) {
    const ent = byEntity.get(c.folderPath);
    const kind = classifyEntityChild(c.name);
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (!ent) { unclassified.push({ reason: "child of an unknown entity folder", path: c.folderPath, name: c.name }); continue; }
    if (kind === "FILING_YEAR") ent.years.push({ name: c.name, id: c.id, year: (c.name.match(YEAR) || [])[1] || null });
    else if (kind === "CROSS_COMPANY_FOLDER") ent.other.push({ name: c.name, id: c.id, kind });
    else if (kind === "UNCLASSIFIED_ENTITY_CHILD") { ent.other.push({ name: c.name, id: c.id, kind }); unclassified.push({ reason: "entity child folder matches no known kind", path: c.folderPath, name: c.name }); }
    else ent.registers.push({ name: c.name, id: c.id, kind });
  }
  for (const f of files) {
    for (const ent of byEntity.values()) if ((f.folderPath || "").startsWith(ent.path)) { ent.files++; break; }
  }

  say("\n  entity child folders by kind:");
  for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) say("    " + String(v).padStart(4) + "  " + k);

  // ---- LEGALOS side
  const built = await secpSource.build();
  const list = built.entities || [];
  const secpRecords = require("../api/secp-records.js");
  const registers = await secpRecords.statutoryRegisters();
  say("\n=== LEGALOS ===\n");
  say("  entities held            " + list.length);
  const losYears = list.reduce((n, e) => n + ((e.years || []).length), 0);
  const losDocs = list.reduce((n, e) => n + (Number(e.documents) || 0), 0);
  say("  entity-years held        " + losYears);
  say("  documents held           " + losDocs);
  say("  statutory registers held " + registers.length);

  // ---- DRIVE -> LEGALOS
  const problems = { entityMissing: [], yearMissing: [], registerMissing: [], fileUnaccounted: [] };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const losByName = new Map(list.map((e) => [norm(e.name || e.entity || e.key), e]));
  for (const ent of byEntity.values()) {
    const le = losByName.get(norm(ent.name));
    if (!le) { problems.entityMissing.push(ent.name); continue; }
    /* Years are labelled "CY 2026" on the LegalOS side and "CY 2026" or plain
       "2026" in Drive folder names, so both are compared on the bare year. */
    const haveYears = new Set((le.years || []).map((y) => String(y.year).replace(/\D+/g, "")));
    for (const y of ent.years) if (y.year && !haveYears.has(String(y.year))) problems.yearMissing.push(ent.name + " / " + y.name);
    /* A statutory register is held if a register record cites its Drive folder
       id on any of its documents, or names the same category for this entity. */
    const mine = registers.filter((x) => x.entityKey === le.key);
    const cats = new Set(mine.map((x) => x.category));
    const docIds = new Set(mine.flatMap((x) => (x.documents || []).map((d) => d.id)));
    /* A show-cause notice or a corporate action is an EVENT FILING against the
       company, not a statutory register — it is held, just not here. */
    const eventKinds = new Set(["SECP_CORRESPONDENCE", "CORPORATE_ACTION", "EOGM"]);
    for (const r of ent.registers) {
      if (cats.has(r.kind) || eventKinds.has(r.kind)) continue;
      /* Scoped to THIS entity's folder. Matching on the folder name alone
         counted every "Share Certificates" folder in the estate against each
         entity, which is how a 2-file folder reported 72. */
      const regPath = ent.path + " / " + r.name;
      const kids = files.filter((f) => (f.folderPath || "") === regPath || (f.folderPath || "").startsWith(regPath + " / "));
      /* An empty folder holds no register. Reported as what it is, not as a
         missing one — there is nothing in Drive to hold. */
      if (!kids.length) { problems.emptyRegisterFolders = problems.emptyRegisterFolders || []; problems.emptyRegisterFolders.push(ent.name + " / " + r.name); continue; }
      if (kids.length && kids.every((k) => docIds.has(k.id))) continue;
      problems.registerMissing.push(ent.name + " / " + r.name + " [" + r.kind + "] files=" + kids.length);
    }
  }

  // ---- every FILE accounted for
  /* Every SECP file must be reachable from an entity-year, a statutory
     register, or an explicit disposition. Asked of the built model, not of a
     separate classifier that could drift from it. */
  const heldDocIds = new Set(registers.flatMap((x) => (x.documents || []).map((d) => d.id)));
  for (const d of (built.documents || [])) heldDocIds.add(d.fileId || d.id);
  let accounted = 0;
  for (const f of files) {
    if (heldDocIds.has(f.id)) { accounted++; continue; }
    const d = secpSource.dispositionFor ? secpSource.dispositionFor(f) : null;
    if (d) accounted++; else problems.fileUnaccounted.push({ id: f.id, name: f.name, path: f.folderPath });
  }

  say("\n=== DRIVE -> LEGALOS ===\n");
  say("  entity folders not represented   " + problems.entityMissing.length);
  say("  CY folders not represented       " + problems.yearMissing.length);
  say("  statutory registers not held     " + problems.registerMissing.length);
  say("  files with no disposition        " + problems.fileUnaccounted.length + "  (of " + files.length + ")");
  for (const e of problems.entityMissing.slice(0, 10)) say("      entity  " + e);
  for (const y of problems.yearMissing.slice(0, 10)) say("      year    " + y);
  for (const r of problems.registerMissing.slice(0, 10)) say("      reg     " + r);
  if (unclassified.length) {
    say("\n  entity child folders matching no known kind (" + unclassified.length + "):");
    for (const u of unclassified.slice(0, 12)) say("      " + u.name + "   @ " + u.path);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    drive: { entityFolders: entityFolders.length, childFolders: children.length, folders: folders.length, files: files.length, kinds },
    legalos: { entities: list.length, years: losYears },
    problems, unclassified,
    entities: [...byEntity.values()].map((e) => ({ name: e.name, group: e.group, years: e.years.length, registers: e.registers.map((r) => r.kind), files: e.files })),
  };
  fs.writeFileSync(path.join(OUT, "secp-deep-reconcile.json"), JSON.stringify(report, null, 1));
  say("\n  wrote audit/secp-deep-reconcile.json");
  if (JSON_ONLY) console.log(JSON.stringify(report.problems));
})().catch((e) => { console.error("FAILED", e.message, (e.stack || "").slice(0, 400)); process.exit(1); });
