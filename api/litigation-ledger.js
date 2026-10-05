/* THE LITIGATION ROOT LEDGER.
 *
 * Every item in
 *
 *   Litigation & Dispute - LegalOS
 *
 * resolved to something: a source family, the record it became, and the screen
 * it can be reached on. The point is not the totals — it is that nothing in
 * the root is unaccounted for, and that where something IS unaccounted for the
 * ledger says so in words rather than by omission.
 *
 * WHY A FOLDER MAY NOT REACH A CASE, and why that is sometimes correct:
 *
 *   The case-folder matcher is deliberately conservative. It links on a
 *   distinctive party name, with common given names excluded, because the
 *   loose alternative produces confident wrong answers: matching on shared
 *   tokens alone pairs "Zameen Media Vs. Sikandar Khan" with "Junaid Khan Vs
 *   Zameen Media", which are different people in different cases. A wrong
 *   document on a case is worse than a missing one — somebody acts on it.
 *
 *   And some folders are not litigation at all. A trademark opposition filed
 *   under "IP Infringment" belongs to the IP portfolio; third-party material
 *   filed for reference belongs to nobody. Those are dispositioned as what
 *   they are rather than forced onto the nearest case.
 */
const drive = require("./drive.js");

const ROOT = "Litigation & Dispute - LegalOS";
const str = (v) => String(v == null ? "" : v).trim();

/* A folder that is plainly not a court case, recognised from what it says it
   is. Conservative: only patterns that name a non-litigation instrument. */
const NOT_A_CASE = [
  [/\bopposition\b.*\bclass\b|\bopposition\b.*\bin class\b/i, "IP_OPPOSITION",
    "A trademark opposition. It belongs to the IP portfolio, not to the case register."],
  [/\bobjections?\b/i, "IP_OBJECTION",
    "An objection filed on a trademark application. IP, not litigation."],
  [/^wapda employees/i, "THIRD_PARTY",
    "A third party's matter kept here for reference. It is not the group's case."],
];

function classifyFolder(leaf) {
  for (const [re, kind, why] of NOT_A_CASE) if (re.test(leaf)) return { kind, why };
  return null;
}

async function build(registers) {
  const idx = await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};
  const lit = regs.litigation || [];
  const notices = regs.notices || [];

  const files = idx.files.filter((f) => String(f.folderPath || "").startsWith(ROOT));

  /* Which folder paths reached a case. */
  const linked = new Map();
  for (const c of lit) {
    for (const f of (c.driveFiles || [])) {
      if (!linked.has(f.folderPath)) linked.set(f.folderPath, []);
      linked.get(f.folderPath).push(c.id);
    }
  }
  const noticeLinked = new Set();
  for (const n of notices) for (const f of (n.driveFiles || [])) noticeLinked.add(f.folderPath);

  /* ---- first-level children of the root ---- */
  const firstLevel = new Map();
  for (const f of files) {
    const rest = String(f.folderPath).slice(ROOT.length).replace(/^ \/ /, "");
    const key = rest ? rest.split(" / ")[0] : "(root file) " + f.name;
    if (!firstLevel.has(key)) firstLevel.set(key, { name: key, files: 0 });
    firstLevel.get(key).files++;
  }
  const FAMILY = {
    "Asset Recovery": { family: "Asset Recovery", route: "/m/assetRecovery",
      source: "Assets Recovery.xlsx — 25 sheets, read as recovery matters, negative settlements and police applications" },
    "Litigation Files": { family: "Litigation cases", route: "/litigation",
      source: "Case folders; their documents attach to the canonical case register" },
    TRACKERS: { family: "Trackers", route: "/litigation",
      source: "Case, notice and developer-dispute trackers" },
    "(root file) Litigation Tracker_.xlsx": { family: "Litigation cases", route: "/litigation",
      source: "The master case register — 'Cause List' sheet" },
    "(root file) Pending Trademark Tracker (New)- Updated.xlsx": { family: "IP Portfolio", route: "/m/ip",
      source: "The trademark estate — 'Ztech TMs' and 'JV TMs'" },
  };
  const rootChildren = [...firstLevel.values()].map((c) => ({
    ...c,
    ...(FAMILY[c.name] || { family: null, route: null, source: null }),
    resolved: !!FAMILY[c.name],
  }));

  /* ---- every case folder under Litigation Files ---- */
  const caseFolderPaths = [...new Set(files
    .map((f) => {
      const m = String(f.folderPath).match(/^(.*\/ Litigation Files \/ [^/]+ \/ [^/]+)/);
      return m ? m[1] : null;
    })
    .filter(Boolean))];

  const caseFolders = caseFolderPaths.map((path) => {
    const parts = path.split(" / ");
    const leaf = parts[parts.length - 1];
    const sourceCategory = parts[parts.length - 2];
    const under = files.filter((f) => f.folderPath === path || String(f.folderPath).startsWith(path + " / "));
    const caseIds = [...new Set(
      [...linked.entries()]
        .filter(([p]) => p === path || p.startsWith(path + " / "))
        .flatMap(([, ids]) => ids)
    )];
    if (caseIds.length) {
      return { path, leaf, sourceCategory, files: under.length,
        disposition: "MATCHED", caseIds,
        detail: "Its documents are on " + (caseIds.length === 1 ? "case " + caseIds[0] : caseIds.length + " cases") + "." };
    }
    /* A folder holding nothing is not an unmatched case file — there is
       nothing in it to attach to anything. */
    if (!under.length) {
      return { path, leaf, sourceCategory, files: 0,
        disposition: "EMPTY_FOLDER", caseIds: [],
        detail: "The folder exists in Drive and holds no files. Nothing to attach." };
    }
    const cls = classifyFolder(leaf);
    if (cls) {
      return { path, leaf, sourceCategory, files: under.length,
        disposition: cls.kind, caseIds: [], detail: cls.why };
    }
    return { path, leaf, sourceCategory, files: under.length,
      disposition: "NO_MATCHING_CASE", caseIds: [],
      detail: "No case in any tracker matches this folder on a distinctive party name. "
        + "Either the matter is not in the trackers, or the folder is named differently from the case. "
        + "It is not attached to a nearby case: a wrong document on a case is worse than a missing one." };
  });

  /* ---- every file: did it reach a record? ---- */
  const fileRows = files.map((f) => {
    const p = f.folderPath || "";
    let disposition = "UNRESOLVED";
    let where = null;
    if (linked.has(p)) { disposition = "ON_A_CASE"; where = "/litigation"; }
    else if (noticeLinked.has(p)) { disposition = "ON_A_NOTICE"; where = "/m/notices"; }
    else if (/\/ TRACKERS$/.test(p) || /\/ TRACKERS \//.test(p)) { disposition = "TRACKER_SOURCE"; where = null; }
    else if (/\/ Asset Recovery/.test(p)) { disposition = "TRACKER_SOURCE"; where = "/m/assetRecovery"; }
    else if (p === ROOT) { disposition = "TRACKER_SOURCE"; where = null; }
    else if (/Litigation Files/.test(p)) {
      const cf = caseFolders.find((c) => p === c.path || p.startsWith(c.path + " / "));
      disposition = cf ? cf.disposition : "UNRESOLVED";
      where = cf && cf.disposition === "MATCHED" ? "/litigation" : null;
    }
    return { id: f.id, name: f.name, folderPath: p, disposition, route: where };
  });

  const count = (rows, key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});

  return {
    root: ROOT,
    builtAt: new Date().toISOString(),
    totals: {
      files: files.length,
      rootChildren: rootChildren.length,
      rootChildrenUnresolved: rootChildren.filter((c) => !c.resolved).length,
      caseFolders: caseFolders.length,
      caseFoldersMatched: caseFolders.filter((c) => c.disposition === "MATCHED").length,
      caseFoldersWithoutCase: caseFolders.filter((c) => c.disposition === "NO_MATCHING_CASE").length,
      caseFoldersEmpty: caseFolders.filter((c) => c.disposition === "EMPTY_FOLDER").length,
      filesOnARecord: fileRows.filter((f) => /ON_A_/.test(f.disposition)).length,
      filesUnresolved: fileRows.filter((f) => f.disposition === "UNRESOLVED").length,
      cases: lit.length,
      casesWithDocuments: lit.filter((c) => (c.driveFiles || []).length).length,
    },
    byDisposition: {
      caseFolders: count(caseFolders, "disposition"),
      files: count(fileRows, "disposition"),
    },
    rootChildren,
    caseFolders,
    /* Only the ones a reader has to do something about; the full list is large
       and the matched ones are not interesting. */
    unmatchedCaseFolders: caseFolders.filter((c) => c.disposition !== "MATCHED"),
  };
}

module.exports = { build };
