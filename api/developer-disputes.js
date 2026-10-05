/* DEVELOPER DISPUTES, FROM THE TRACKER THE TEAM ACTUALLY KEEPS.
 *
 * The master reference is one workbook in Drive:
 *
 *   Litigation & Dispute - LegalOS / TRACKERS / Developer Disputes
 *
 * and the thing to understand about it is that the "Developer Matters" sheet
 * holds TWO TABLES SIDE BY SIDE, not one:
 *
 *   columns A-F   the legal matter   — Matter(s), Description, Latest Update,
 *                                      Action Required/Taken, Region,
 *                                      Responsibility.          13 rows.
 *   columns G-S   the project        — Sr, Group, Project Name, Structure,
 *                                      Contract Date, units, % sold,
 *                                      construction schedule vs actual,
 *                                      Status, Rental Status.   20 rows.
 *
 * They are different populations about different things: a matter is a dispute
 * Legal is running, a project row is the commercial health of a development.
 * Reading the sheet as one table produces 20 rows of which 7 have no matter and
 * 13 have no project figures -- which is exactly the "spreadsheet wall" the
 * brief says not to build. So both are read, kept apart, and joined on the
 * project name where the sheet itself supports the join.
 *
 * NOTHING IS INVENTED. Every field here exists in the workbook, and a blank in
 * the workbook stays blank. The dropdowns are the distinct values the tracker
 * actually contains, not a vocabulary written here.
 */
const { driveRaw } = require("./google.js");
const drive = require("./drive.js");
const xlsx = require("./xlsx");

const TRACKER_NAME = "Developer Disputes";
const TRACKER_FOLDER = /Litigation & Dispute - LegalOS \/ TRACKERS$/i;

/* The matter columns and the project columns, named as the sheet names them so
   a reader can put the screen beside the workbook and see the same words. */
const MATTER_COLS = ["Matter(s)", "Description", "Latest Update", "Action Required/Taken", "Region", "Responsibility"];
const PROJECT_COLS = ["Sr", "GROUP", "PROJECT NAME", "PROJECT STRUCTURE", "CONTRACT DATE",
  "Total Units In Project", "Unit Sold", "% Sold", "Construction Schedule as per PPA",
  "Actual Construction", "Status", "RENTAL STATUS", "Description of Units Sold"];

const str = (v) => String(v == null ? "" : v).trim();
const has = (o, cols) => cols.some((c) => str(o[c]) !== "");

let cache = { at: 0, data: null, error: null };
const TTL = 10 * 60 * 1000;

async function workbook() {
  const idx = await drive.ensureIndex();
  const f = idx.files.find((x) => x.name === TRACKER_NAME && TRACKER_FOLDER.test(x.folderPath || ""))
    || idx.files.find((x) => /^developer disputes/i.test(x.name) && /spreadsheet/i.test(x.mimeType || ""));
  if (!f) {
    const e = new Error("The Developer Disputes tracker is not in the indexed Drive.");
    e.code = "NO_TRACKER";
    throw e;
  }
  const res = await driveRaw("/files/" + encodeURIComponent(f.id) + "?alt=media&supportsAllDrives=true");
  const buf = Buffer.from(await res.arrayBuffer());
  return { file: f, wb: xlsx.readWorkbook(buf, { maxSheets: 12 }) };
}

/* A stable id. The tracker has no key column, so the id is derived from what
   identifies the row in the sheet -- the matter's name, or the project's name
   -- and NOT from its position, which would renumber every record the day
   somebody inserts a line. */
const slug = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function build() {
  const { file, wb } = await workbook();
  const sheet = wb.sheets.find((s) => /developer matters/i.test(s.name)) || wb.sheets[0];
  const { records } = xlsx.toObjects(sheet.rows);

  const matters = [];
  const projects = [];
  for (const r of records) {
    if (has(r, MATTER_COLS)) {
      const name = str(r["Matter(s)"]);
      matters.push({
        id: "DDM-" + (slug(name) || "row-" + r.__row),
        matter: name,
        description: str(r.Description),
        latestUpdate: str(r["Latest Update"]),
        actionRequired: str(r["Action Required/Taken"]),
        region: str(r.Region),
        responsibility: str(r.Responsibility),
        /* The sheet puts the matter and a project on the same line, so where
           the line carries both they are linked -- by the project's name,
           which is what the sheet itself uses. */
        projectName: str(r["PROJECT NAME"]),
        sourceRow: r.__row,
      });
    }
    if (has(r, PROJECT_COLS.filter((c) => c !== "Sr"))) {
      const pname = str(r["PROJECT NAME"]);
      projects.push({
        id: "DDP-" + (slug(pname) || "row-" + r.__row),
        sr: str(r.Sr),
        group: str(r.GROUP),
        projectName: pname,
        structure: str(r["PROJECT STRUCTURE"]),
        contractDate: str(r["CONTRACT DATE"]),
        totalUnits: str(r["Total Units In Project"]),
        unitsSold: str(r["Unit Sold"]),
        percentSold: str(r["% Sold"]),
        schedulePerPPA: str(r["Construction Schedule as per PPA"]),
        actualConstruction: str(r["Actual Construction"]),
        status: str(r.Status),
        rentalStatus: str(r["RENTAL STATUS"]),
        unitsSoldDescription: str(r["Description of Units Sold"]),
        sourceRow: r.__row,
      });
    }
  }

  /* Join, on the name the sheet uses. A matter with no project keeps none
     rather than being attached to the nearest one. */
  const byProject = new Map(projects.map((p) => [slug(p.projectName), p]));
  for (const m of matters) m.project = byProject.get(slug(m.projectName)) || null;

  /* The dropdowns ARE the tracker's own values -- every distinct one, in the
     order the sheet first uses them, so nothing is silently omitted. */
  const distinct = (rows, key) => {
    const seen = [];
    for (const r of rows) { const v = str(r[key]); if (v && !seen.includes(v)) seen.push(v); }
    return seen;
  };

  return {
    source: {
      file: file.name, fileId: file.id, folderPath: file.folderPath,
      sheet: sheet.name, readAt: new Date().toISOString(),
    },
    matters, projects,
    options: {
      region: distinct(matters, "region"),
      responsibility: distinct(matters, "responsibility"),
      group: distinct(projects, "group"),
      status: distinct(projects, "status"),
      rentalStatus: distinct(projects, "rentalStatus"),
      structure: distinct(projects, "structure"),
    },
  };
}

async function get(opts) {
  const force = opts && opts.force;
  if (!force && cache.data && Date.now() - cache.at < TTL) return cache.data;
  try {
    const data = await build();
    cache = { at: Date.now(), data, error: null };
    return data;
  } catch (e) {
    cache = { at: Date.now(), data: cache.data, error: e.message };
    if (cache.data) return cache.data;
    throw e;
  }
}

module.exports = { get, MATTER_COLS, PROJECT_COLS };
