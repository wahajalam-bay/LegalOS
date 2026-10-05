/* ASSET RECOVERY, FROM THE WORKBOOK THE HR/Legal team keeps.
 *
 *   Litigation & Dispute - LegalOS / Asset Recovery / Assets Recovery.xlsx
 *
 * 25 sheets, and they are FOUR DIFFERENT THINGS. Flattening them into one
 * table would put a percentage rollup in the same list as a person who has not
 * returned a laptop, so each sheet is dispositioned before anything is read
 * out of it:
 *
 *   RECOVERY      "Assets recovery <year>" — somebody left and the company's
 *                 property went with them. Purchase value, what was deducted,
 *                 whether it came back, and who took it back.
 *
 *   SETTLEMENT    "Negative Final Settlement <year>" — the leaver's final
 *                 settlement came out NEGATIVE: they owe the company. A
 *                 different debt from an unreturned laptop, tracked with a
 *                 show-cause date and what was received.
 *
 *   ESCALATION    Where recovery failed and it went to the police: a police
 *                 application date, an FIR date, a station and an accused.
 *                 These are the rows Legal actually runs.
 *
 *   SUMMARY       Percentage rollups ("203 / 230"). Computed views of the
 *                 sheets above, not records of anything, and they are NOT
 *                 loaded as matters — a summary row in a register of people is
 *                 a row nobody can open.
 *
 * COLUMN NAMES DRIFT BETWEEN YEARS and that is not an error to correct: 2020
 * says "Emp Names", 2025 says "Name of Employee", 2022 leads with a stray
 * "22578". The reader maps each year's own spelling onto one shape and keeps
 * the sheet and row it came from, so a figure on screen can always be walked
 * back to the cell it was read out of.
 */
const { driveRaw } = require("./google.js");
const drive = require("./drive.js");
const xlsx = require("./xlsx");

const WORKBOOK = /^Assets Recovery\.xlsx$/i;
const str = (v) => String(v == null ? "" : v).trim();
const num = (v) => {
  const s = str(v).replace(/[,\s]/g, "");
  if (!s || s === "-" || s === "--") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
};
const date = (v) => {
  const s = str(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = s && new Date(s);
  return d && !isNaN(d) && d.getUTCFullYear() > 1990 ? d.toISOString().slice(0, 10) : "";
};
const slug = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/* Every sheet gets a disposition. A sheet this list does not name is reported
   as UNDISPOSITIONED rather than being quietly skipped. */
function dispositionOf(name) {
  const n = str(name).toLowerCase();
  if (/^\s*assets? recovery\s*\d{4}/.test(n) || /^new assets recovery/.test(n)) return "RECOVERY";
  if (/negative final settlement/.test(n)) return "SETTLEMENT";
  if (/extra recovery/.test(n)) return "RECOVERY_EXTRA";
  if (/summary/.test(n)) return "SUMMARY";
  if (/^sheet13$/.test(n)) return "POLICE_APPLICATIONS";
  if (/^sheet(19|23)$/.test(n)) return "EMPTY";
  if (/^sheet(25|26)$/.test(n)) return "RECOVERY_TEMPLATE";
  return "UNDISPOSITIONED";
}

/* The first column whose header matches, since the header drifts by year. */
function pick(row, names) {
  for (const n of names) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase().trim() === n.toLowerCase()) {
        const v = row[k];
        if (str(v)) return v;
      }
    }
  }
  return "";
}
const YEAR = (name) => (str(name).match(/(20\d\d)/) || [])[1] || "";

let cache = { at: 0, data: null };
const TTL = 10 * 60 * 1000;

async function workbook() {
  const idx = await drive.ensureIndex();
  const f = idx.files.find((x) => WORKBOOK.test(x.name) && /Asset Recovery/i.test(x.folderPath || ""))
    || idx.files.find((x) => WORKBOOK.test(x.name));
  if (!f) { const e = new Error("The Assets Recovery workbook is not in the indexed Drive."); e.code = "NO_WORKBOOK"; throw e; }
  const res = await driveRaw("/files/" + encodeURIComponent(f.id) + "?alt=media&supportsAllDrives=true");
  const buf = Buffer.from(await res.arrayBuffer());
  return { file: f, wb: xlsx.readWorkbook(buf, { maxSheets: 40 }) };
}

function recoveryRow(r, sheet, year) {
  const name = str(pick(r, ["Name of Employee", "Emp Names", "Name", "Employee name"]));
  if (!name || /^[0-9]+$/.test(name)) return null;
  const assetValue = num(pick(r, ["Assets Purchase value", "Asset Purchase Value", "Asset Value", "Total Purchase Cost", "Assets value"]));
  const netForLegal = num(pick(r, ["Net (Value for Legal Department)", "Total Paybale to company", "Total Payable to company"]));
  const recoveredOn = date(pick(r, ["Date of recovery", "Recovery Date"]));
  const status = str(pick(r, ["Status of case", "Status"]));
  const action = str(pick(r, ["Action", "Assets Recovered"]));
  return {
    kind: "RECOVERY",
    id: "AR-" + year + "-" + (slug(name) || "row" + r.__row),
    year,
    employee: name,
    employeeCode: str(pick(r, ["E-Code", "E- Code", "Emp ID", "Emp No", "E Code"])),
    region: str(pick(r, ["Region"])),
    city: str(pick(r, ["City", "city", "c"])),
    department: str(pick(r, ["Department"])),
    director: str(pick(r, ["Director Name"])),
    complaintDate: date(pick(r, ["Complaint Date", "Date of Complaint", "Complaint date"])),
    leftOn: date(pick(r, ["LWD"])),
    separation: str(pick(r, ["Resigned/Terminated", "Resign/Termination"])),
    assetsName: str(pick(r, ["Assets Name"])),
    assetPurchaseValue: assetValue,
    payableToEmployee: num(pick(r, ["Total payable to employee", "Total Payable to Employee"])),
    netForLegal,
    /* What is still owed, as the sheet states it. Never derived here: these
       columns already net off deductions in ways that differ by year. */
    outstanding: netForLegal !== "" ? netForLegal : assetValue,
    status,
    action,
    recoveredOn,
    receivedBy: str(pick(r, ["Assets recieved by", "Asset Received By", "Assets Received By"])),
    legalActionRef: str(pick(r, ["Legal Action"])),
    showCauseDate: date(pick(r, ["Show Cause Date"])),
    policeApplicationDate: date(pick(r, ["Police application date"])),
    firDate: date(pick(r, ["FIR Date"])),
    personnelFileLink: str(pick(r, ["Link of Personnel File"])),
    comments: str(pick(r, ["Comments", "Personal Notes", "PERSONAL NOTES", "COMMENT"])),
    sourceSheet: sheet, sourceRow: r.__row,
  };
}

function settlementRow(r, sheet, year) {
  const name = str(pick(r, ["Name"]));
  if (!name || /^[0-9]+$/.test(name)) return null;
  const owed = num(pick(r, ["FS Negative Amount"]));
  const got = num(pick(r, ["Recieved Amount", "Received Amount"]));
  return {
    kind: "SETTLEMENT",
    id: "AS-" + year + "-" + (slug(name) || "row" + r.__row),
    year,
    employee: name,
    employeeCode: str(pick(r, ["Emp No"])),
    company: str(pick(r, ["Company"])),
    cnic: str(pick(r, ["CNIC"])),
    city: str(pick(r, ["City"])),
    region: str(pick(r, ["Region"])),
    department: str(pick(r, ["Department"])),
    joinedOn: date(pick(r, ["DOJ"])),
    resignedOn: date(pick(r, ["DOR"])),
    leftOn: date(pick(r, ["LWD"])),
    complaintDate: date(pick(r, ["Complaint date"])),
    negativeAmount: owed,
    receivedAmount: got,
    /* Both stated; the difference is computed only when both are present, and
       marked as computed so it is never mistaken for a source figure. */
    outstanding: (owed !== "" && got !== "") ? Math.round((owed - got) * 100) / 100
      : (owed !== "" ? owed : ""),
    outstandingDerived: owed !== "" && got !== "",
    showCauseDate: date(pick(r, ["Show Cause Date"])),
    status: str(pick(r, ["Status"])),
    recoveredOn: date(pick(r, ["Recovery Date"])),
    receivedBy: str(pick(r, ["Asset Received By"])),
    personnelFileLink: str(pick(r, ["Link of Personnel File"])),
    comments: str(pick(r, ["Personal Notes", "COMMENT"])),
    sourceSheet: sheet, sourceRow: r.__row,
  };
}

function policeRow(r, sheet) {
  const accused = str(pick(r, ["name of accused"]));
  if (!accused) return null;
  return {
    kind: "POLICE_APPLICATION",
    id: "AP-" + (slug(accused) || "row" + r.__row),
    applicant: str(pick(r, ["applicant"])),
    accused,
    policeStation: str(pick(r, ["ps"])),
    subDivision: str(pick(r, ["Sp m town"])),
    district: str(pick(r, ["District"])),
    sourceSheet: sheet, sourceRow: r.__row,
  };
}

async function build() {
  const { file, wb } = await workbook();
  const sheets = [];
  const matters = [];
  const settlements = [];
  const police = [];

  for (const sh of wb.sheets) {
    const disp = dispositionOf(sh.name);
    const { records } = xlsx.toObjects(sh.rows);
    const year = YEAR(sh.name);
    let taken = 0;
    if (disp === "RECOVERY" || disp === "RECOVERY_EXTRA" || disp === "RECOVERY_TEMPLATE") {
      for (const r of records) { const x = recoveryRow(r, sh.name, year); if (x) { matters.push(x); taken++; } }
    } else if (disp === "SETTLEMENT") {
      for (const r of records) {
        /* The 2026 sheet is a settlement sheet that ALSO carries the asset
           columns, so it is read as both rather than one of them being lost. */
        const s = settlementRow(r, sh.name, year); if (s) { settlements.push(s); taken++; }
        const a = recoveryRow(r, sh.name, year);
        if (a && a.assetPurchaseValue !== "") { matters.push(a); }
      }
    } else if (disp === "POLICE_APPLICATIONS") {
      for (const r of records) { const x = policeRow(r, sh.name); if (x) { police.push(x); taken++; } }
    }
    sheets.push({ name: sh.name, disposition: disp, rows: records.length, recordsTaken: taken });
  }

  /* Escalations are matters that actually went somewhere legal. */
  const escalations = matters.filter((m) =>
    m.policeApplicationDate || m.firDate || m.showCauseDate || m.legalActionRef
    || /police|fir/i.test(m.status || ""));

  const sum = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  const distinct = (rows, key) => {
    const out = [];
    for (const r of rows) { const v = str(r[key]); if (v && !out.includes(v)) out.push(v); }
    return out;
  };

  return {
    source: {
      file: file.name, fileId: file.id, folderPath: file.folderPath,
      sheets: sheets.length, readAt: new Date().toISOString(),
    },
    sheets,
    matters, settlements, police, escalations,
    counts: {
      matters: matters.length,
      settlements: settlements.length,
      escalations: escalations.length,
      policeApplications: police.length,
      undispositionedSheets: sheets.filter((s) => s.disposition === "UNDISPOSITIONED").length,
      assetValue: Math.round(sum(matters, "assetPurchaseValue")),
      outstandingSettlements: Math.round(sum(settlements, "outstanding")),
      recovered: matters.filter((m) => m.recoveredOn).length,
    },
    options: {
      year: [...new Set(matters.concat(settlements).map((m) => m.year).filter(Boolean))].sort(),
      region: distinct(matters, "region"),
      city: distinct(matters, "city"),
      department: distinct(matters, "department"),
      status: [...new Set(matters.map((m) => m.status).concat(settlements.map((s) => s.status)).filter(Boolean))],
    },
  };
}

async function get(opts) {
  if (!(opts && opts.force) && cache.data && Date.now() - cache.at < TTL) return cache.data;
  const data = await build();
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { get, dispositionOf };
