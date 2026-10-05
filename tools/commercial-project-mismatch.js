#!/usr/bin/env node
/* THE FOLDER SAYS ONE PROJECT, THE DOCUMENT SAYS ANOTHER.
 *
 * Three files called "Base Draft.docx" sit in three different project folders.
 * The one under Mall 35 is a ZAMEEN PHOENIX agreement. The one under Zameen Neo
 * is a ZAMEEN JADE agreement. The one under Golf View Rumanza is a ZAMEEN AURUM
 * agreement. Every one of them was made by copying the previous project's file
 * and not changing the project details.
 *
 * For a blank precedent that is a drafting hazard: whoever fills it in inherits
 * the wrong developer and the wrong address. For an EXECUTED agreement it is
 * worse — "Samrina Boulevard_Project Sales Agr" is signed, stamped and binding,
 * and its running footer reads SAEEDA RESIDENCY while its opening line calls it
 * an IT Services Agreement when it is a project sales agreement.
 *
 * Neither is visible from the filename, the folder or the metadata. Only the
 * document's own words show it, which is why nothing before the read pass could
 * find them.
 *
 * WHAT THIS DOES NOT DO: it does not re-file anything. A mismatch is a fact
 * about the document, reported with both names, for a person to act on. Moving
 * a file in Drive is out of scope and out of bounds.
 *
 * AND IT REFUSES TO GUESS. The first version flagged 154 documents by comparing
 * two strings, and most were nonsense: the reader had put an ADDRESS in the
 * project field, so "Pearl One" and "Gulberg III, Lahore" were reported as
 * projects that disagreed with their folder, and "Rumanza Golf Community" was
 * reported against "Downtown Rumanza" although they are the same estate.
 *
 * A difference between two strings is not evidence of a misfiling. So the test
 * is now narrow and checkable: the document's stated project is a mismatch only
 * if it NAMES A DIFFERENT PROJECT THAT ACTUALLY EXISTS in this estate. An
 * address matches no project and is ignored; a real project name is decisive.
 *
 *   node tools/commercial-project-mismatch.js
 */
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const VISION = P.join(ROOT, "audit", "commercial-vision.json");
const OUT = P.join(ROOT, "audit", "commercial-project-mismatch.json");

const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return d; } };
const store = read(VISION, {});

/* Compare the way a person would: ignore punctuation, the "Zameen"/"ZD" prefix
   and the city suffix that folder names carry and documents do not. */
function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(zameen|zd|the|project|phase|ii|iii|iv|i)\b/g, " ")
    .replace(/\b(lahore|multan|rawalpindi|islamabad|karachi)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/* The project segment of a Commercial path. Under the templates root the
   project is deeper, because the library is grouped by document type first. */
function folderProject(folderPath) {
  const parts = String(folderPath || "").split(" / ");
  if (/Pakistan Contract Templates/.test(folderPath || "")) {
    // ... / Agreement to Sell & Sale Deeds / <project> / ...
    const i = parts.findIndex((p) => /Agreement to Sell|Sale Deeds|Leaseback/i.test(p));
    return i >= 0 && parts[i + 1] ? parts[i + 1] : (parts[2] || "");
  }
  return parts[1] || "";
}

/* Every project this estate actually has. NOT derived from folder names — that
   was the previous mistake, which let drawers like "Zameen Media PPA's" and
   "Construction Contracts - Misc" count as projects and so made every finding
   look like a contradiction. The authority is the project lineage, whose
   canonical names are the ones matched to tracker records. */
const LINEAGE = read(P.join(ROOT, "audit", "commercial-project-lineage.json"), []);
const KNOWN = new Map();
for (const p of LINEAGE) {
  for (const name of [p.canonicalProject, p.sourceFolder, p.sourceSpelling]) {
    const k = norm(name);
    if (k) KNOWN.set(k, p.canonicalProject || name);
  }
}
/* Whether a FOLDER names a project is a stricter question: only the canonical
   names count, so a drawer never passes. */
const PROJECT_FOLDERS = new Set(LINEAGE.map((p) => norm(p.sourceFolder)).filter(Boolean));
for (const p of LINEAGE) { const k = norm(p.canonicalProject); if (k) PROJECT_FOLDERS.add(k); }

const findings = [];
for (const id of Object.keys(store)) {
  const e = store[id];
  if (!e.facts || e.facts.unreadable) continue;
  const said = e.facts.project;
  if (!said) continue;
  const folder = folderProject(e.folderPath);
  if (!folder) continue;
  const a = norm(said), b = norm(folder);
  if (!a || !b) continue;
  if (a === b || a.includes(b) || b.includes(a)) continue;

  /* The decisive step: does what the document says name a real project here?
     If not, it is an address, a scheme, a society or a description, and it is
     no evidence at all that the document is in the wrong folder. */
  let named = KNOWN.get(a);
  if (!named) {
    for (const [k, v] of KNOWN) {
      if (k && a.length > 3 && (a === k || a.split(" ").join("") === k.split(" ").join(""))) { named = v; break; }
    }
  }
  if (!named) continue;
  if (norm(named) === b) continue;

  /* Is the FOLDER even making a project claim? A document sitting directly in
     "Zameen Media PPA's" or "Construction Contracts - Misc" is in a drawer, not
     a project folder, so the document naming a project contradicts nothing — it
     SUPPLIES the project the folder never stated. That is a different and much
     more useful finding than a misfiling, and conflating the two would invent
     errors out of documents that are merely unfiled. */
  const folderIsAProject = PROJECT_FOLDERS.has(b);

  findings.push({
    namesKnownProject: named,
    kind: folderIsAProject ? "CONTRADICTS_FOLDER" : "IDENTIFIES_UNFOLDERED_DOCUMENT",
    fileId: id,
    filename: e.filename,
    folderPath: e.folderPath,
    folderSays: folder,
    documentSays: said,
    entity: e.facts.entity || "",
    executed: e.facts.executed,
    /* An executed instrument naming the wrong project is a live defect in a
       binding document. A blank precedent is a hazard for the next draft. */
    severity: !folderIsAProject ? "FOLDER_MAKES_NO_PROJECT_CLAIM"
      : e.facts.executed === true ? "EXECUTED_DOCUMENT_NAMES_ANOTHER_PROJECT"
        : "PRECEDENT_CARRIES_ANOTHER_PROJECTS_DETAILS",
    draftMarkers: e.facts.draftMarkers || [],
    confidence: e.facts.confidence || "MEDIUM",
  });
}

findings.sort((a, b) => (a.severity < b.severity ? -1 : 1));
const summary = {
  documentsRead: Object.keys(store).length,
  withAProjectStated: Object.values(store).filter((e) => e.facts && e.facts.project).length,
  named: findings.length,
  note: "only counted where the document names another project that exists in this estate",
  contradictsFolder: findings.filter((f) => f.kind === "CONTRADICTS_FOLDER").length,
  executedMismatches: findings.filter((f) => f.severity.startsWith("EXECUTED")).length,
  precedentMismatches: findings.filter((f) => f.severity.startsWith("PRECEDENT")).length,
  identifiesUnfoldered: findings.filter((f) => f.kind === "IDENTIFIES_UNFOLDERED_DOCUMENT").length,
};
fs.writeFileSync(OUT, JSON.stringify({ summary, findings }, null, 1));

console.log(JSON.stringify(summary, null, 1));
for (const f of findings.filter((x) => x.kind === "CONTRADICTS_FOLDER")) {
  console.log("\n  " + (f.executed === true ? "EXECUTED " : "precedent") + "  " + f.filename.slice(0, 62));
  console.log("      folder says:   " + f.folderSays);
  console.log("      document says: " + f.documentSays + (f.entity ? "   (" + f.entity + ")" : ""));
}
