/* THE IP PORTFOLIO, FROM THE TRACKER THE TEAM KEEPS.
 *
 *   Litigation & Dispute - LegalOS / Pending Trademark Tracker (New)- Updated.xlsx
 *
 * Two sheets, and they are two populations rather than one list split in half:
 *
 *   "Ztech TMs"   marks owned by the group's own entities.        42 marks.
 *   "JV TMs"      marks owned through joint ventures, filed by a
 *                 different set of firms and answering to a
 *                 different owner.                                15 marks.
 *
 * They carry the same columns, so they are read into one register with the
 * PORTFOLIO recorded on each row -- a reader filtering to the group's own
 * marks must be able to, and merging the sheets without keeping which one a
 * mark came from would make that impossible.
 *
 * NOTHING IS INVENTED. Every field below is a column in that workbook. The
 * status vocabulary is the sheet's own (Filed / Publication / Registered, with
 * a sub-status underneath), not a lifecycle written here, and a blank stays
 * blank: "Priority" is empty on all 57 rows and is carried as empty rather
 * than being filled with a default.
 *
 * RENEWALS ARE NOT GUESSED. The tracker records no expiry date, so no renewal
 * reminder is raised from it. A trademark renewal is ten years from
 * registration in Pakistan, and computing that from a filing date would
 * produce a date that looks authoritative and is not. `renewal.basis` says so
 * on every record rather than the module quietly showing nothing.
 */
const { driveRaw } = require("./google.js");
const drive = require("./drive.js");
const xlsx = require("./xlsx");

const TRACKER = /^Pending Trademark Tracker/i;
const ROOT = /^Litigation & Dispute - LegalOS$/;

const str = (v) => String(v == null ? "" : v).trim();
const date = (v) => {
  const s = str(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = s && new Date(s);
  return d && !isNaN(d) ? d.toISOString().slice(0, 10) : "";
};
const slug = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

let cache = { at: 0, data: null };
const TTL = 10 * 60 * 1000;

async function workbook() {
  const idx = await drive.ensureIndex();
  const f = idx.files.find((x) => TRACKER.test(x.name) && ROOT.test(x.folderPath || ""))
    || idx.files.find((x) => TRACKER.test(x.name));
  if (!f) {
    const e = new Error("The trademark tracker is not in the indexed Drive.");
    e.code = "NO_TRACKER";
    throw e;
  }
  const res = await driveRaw("/files/" + encodeURIComponent(f.id) + "?alt=media&supportsAllDrives=true");
  const buf = Buffer.from(await res.arrayBuffer());
  return { file: f, wb: xlsx.readWorkbook(buf, { maxSheets: 12 }) };
}

/* Which sheet a mark came from, named for what it means rather than for the
   tab it sits on. */
const PORTFOLIO = { "Ztech TMs": "Group", "JV TMs": "Joint venture" };

async function build() {
  const { file, wb } = await workbook();
  const marks = [];
  const seen = new Set();

  for (const sheet of wb.sheets) {
    const portfolio = PORTFOLIO[sheet.name];
    if (!portfolio) continue;                     // summary tabs are not marks
    const { records } = xlsx.toObjects(sheet.rows);
    for (const r of records) {
      const name = str(r["Mark name"]);
      if (!name) continue;                        // a blank row is not a mark
      const fileNo = str(r["Off. file no."]);
      /* Identity is the official file number where the registry gave one --
         that is the registry's own key -- and the mark plus its class where it
         did not. Never the row number: inserting a line above would renumber
         every record below it. */
      let id = "IP-" + (fileNo ? slug(fileNo) : slug(name) + "-" + slug(r.Class));
      let n = 2;
      while (seen.has(id)) id = "IP-" + (fileNo ? slug(fileNo) : slug(name)) + "-" + (n++);
      seen.add(id);

      marks.push({
        id,
        portfolio,
        sourceSheet: sheet.name,
        markName: name,
        class: str(r.Class),
        officialFileNo: fileNo,
        filingDate: date(r["Filing date"]),
        officialRegNo: str(r["Off. reg. no."]),
        status: str(r.Status),
        subStatus: str(r["Sub-status"]),
        paymentStatus: str(r["Payment Status"]),
        owner: str(r.Owner),
        address: str(r.Address),
        firm: str(r.Firm),
        remarks: str(r.Remarks),
        priority: str(r.Priority),
        sourceRow: r.__row,
        /* THE TRACKER RECORDS NO EXPIRY. Said explicitly on the record so the
           renewals view can explain an empty list instead of looking broken,
           and so nobody mistakes silence for "nothing is due". */
        renewal: {
          expiryDate: "",
          basis: "The tracker records no expiry or renewal date for this mark.",
        },
      });
    }
  }

  const distinct = (key) => {
    const out = [];
    for (const m of marks) { const v = str(m[key]); if (v && !out.includes(v)) out.push(v); }
    return out;
  };

  /* What is actually happening to these marks, in the tracker's own words. */
  const counts = {
    total: marks.length,
    byPortfolio: {},
    byStatus: {},
    bySubStatus: {},
  };
  for (const m of marks) {
    counts.byPortfolio[m.portfolio] = (counts.byPortfolio[m.portfolio] || 0) + 1;
    if (m.status) counts.byStatus[m.status] = (counts.byStatus[m.status] || 0) + 1;
    if (m.subStatus) counts.bySubStatus[m.subStatus] = (counts.bySubStatus[m.subStatus] || 0) + 1;
  }

  return {
    source: {
      file: file.name, fileId: file.id, folderPath: file.folderPath,
      sheets: wb.sheets.filter((s) => PORTFOLIO[s.name]).map((s) => s.name),
      readAt: new Date().toISOString(),
    },
    marks,
    options: {
      status: distinct("status"),
      subStatus: distinct("subStatus"),
      owner: distinct("owner"),
      firm: distinct("firm"),
      portfolio: distinct("portfolio"),
      class: [...new Set(marks.map((m) => m.class).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
      paymentStatus: distinct("paymentStatus"),
    },
    counts,
    /* Renewals need an expiry date and the tracker has none. Stated once, here,
       so every surface says the same thing about it. */
    renewals: {
      available: false,
      /* THE SEARCH WAS DONE, AND IT CAME BACK EMPTY.
         Not "the tracker has no column" alone -- the whole connected Drive was
         searched for trademark registration certificates that would carry a
         real registration or expiry date, and every "registration certificate"
         in it is a tax, PSEB, trust or charge certificate for an SECP entity.
         There is no trademark certificate to read a date out of.

         A Pakistani mark runs ten years from REGISTRATION, so the date could
         be computed -- but from a FILING date it would be wrong for every mark
         that took years to register, and on screen it would look exactly as
         authoritative as a real one. Nothing is derived. */
      detail: "No expiry or renewal date is evidenced in the source. The tracker records filing "
        + "dates and status, and the connected Drive holds no trademark registration certificate to "
        + "read a registration or expiry date from — the search covered every root. A renewal date "
        + "is not computed from a filing date: for a mark that took years to register it would be "
        + "wrong, and it would look exactly as authoritative as a real one.",
      searchedForCertificates: true,
      due: [],
    },
  };
}

async function get(opts) {
  if (!(opts && opts.force) && cache.data && Date.now() - cache.at < TTL) return cache.data;
  try {
    const data = await build();
    cache = { at: Date.now(), data };
    return data;
  } catch (e) {
    if (cache.data) return cache.data;
    throw e;
  }
}

module.exports = { get };
