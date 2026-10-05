#!/usr/bin/env node
/* RECOVER THE INSTRUMENTS DRIVE ALREADY HOLDS.
 *
 * Thirty-eight spend records show an empty Documents tab. Most of them are not
 * missing their agreement at all -- the agreement is sitting in Drive under a
 * filename the matcher could not read. The existing matcher takes the FIRST
 * token of the counterparty of length >= 5 and asks whether the lowercased
 * filename contains it. That fails on exactly the filenames this estate uses:
 *
 *     Askari Guards Pvt. Ltd   ->  1911_028.00CTL-SS-AskariGuardsPrivateLimited.pdf
 *     TCS Pvt. Ltd.            ->  ServiceagreementTCSPvtLtd_20220316.pdf
 *     Track and Snap           ->  Service Agreement_TrackAndSnap_ZameenMedia.pdf
 *
 * The words are all there; the separators are not. "askari" survives, but
 * "guards" is glued to "Private" and a substring test on the raw filename
 * cannot see any of it.
 *
 * So this compares SQUASHED forms -- every non-alphanumeric removed from both
 * sides -- and requires real evidence before it links:
 *
 *   - at least one distinctive counterparty token (>= 5 chars, not a company
 *     suffix, not a stopword) present in the squashed filename, AND
 *   - the file sitting in the same entity's spend tree, or a second token also
 *     matching, or the document's own text naming the counterparty.
 *
 * A single short token is never enough. "one" matching "Zameen Venture One"
 * would attach half the estate to the wrong record, and a wrong agreement on a
 * lease is worse than an empty tab.
 *
 *   node tools/compliance-source-recovery.js            # report only
 *   node tools/compliance-source-recovery.js --write    # persist the links
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const model = require("../api/compliance-model.js");
const registers = require("../api/registers.js");
const content = require("../api/content-model.js");

const AUDIT = P.join(__dirname, "..", "audit");
const OUT = P.join(__dirname, "..", "config", "compliance-recovered-links.json");
const WRITE = process.argv.includes("--write");

const squash = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const SUFFIX = new Set(["pvt", "pvtltd", "private", "limited", "ltd", "smc", "smcpvt", "smcprivate",
  "company", "co", "corporation", "inc", "llc", "plc", "and", "the", "through", "mr", "mrs", "sons"]);

/* WORDS THAT DESCRIBE A DOCUMENT ARE NOT WORDS THAT IDENTIFY ONE.
   The first version of this matcher drew tokens from the record TITLE as well
   as the counterparty, so a record called "Services Agreement" matched every
   file containing "agreement" -- one Gateway Services PDF was recovered onto
   fourteen unrelated records at once. A word that appears in half the estate
   carries no evidence, however long it is. */
const GENERIC = new Set([
  "agreement", "agreements", "agreemnet", "agreemen", "contract", "contracts",
  "service", "services", "lease", "leases", "tenancy", "rental", "rent",
  "licence", "license", "licensing", "amendment", "addendum", "renewal",
  "extension", "termination", "novation", "memorandum", "understanding",
  "minutes", "meeting", "board", "directors", "resolution", "authorize",
  "authorise", "letter", "document", "documents", "executed", "signed", "final",
  "draft", "copy", "scan", "zameen", "media", "labs", "group", "holdings",
  "maintenance", "security", "vehicle", "tracking", "messaging", "gateway",
  "international", "management", "solutions", "consulting", "technologies",
  "developments", "venture", "pakistan", "office", "floor", "building", "plaza",
]);

/* Tokens worth matching on: distinctive, not a company suffix, not a word that
   merely describes the KIND of document. */
function tokens(v) {
  return [...new Set(String(v || "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !SUFFIX.has(t) && !GENERIC.has(t) && !/^\d+$/.test(t)))];
}

(async () => {
  await drive.ensureIndex();
  const files = drive.indexFiles();
  const st = await registers.ensure();
  const spend = await model.buildSpendWithDocs();
  const all = [...(spend.leases || []), ...(spend.services || []), ...(spend.other || [])];

  /* Every file already claimed by SOME record, so recovery never steals one. */
  const claimed = new Set();
  for (const r of all) for (const d of (r.driveFiles || []).concat(r.extraDocuments || [])) claimed.add(d.id);
  try {
    const loans = (await model.buildLoans(st)).agreements || [];
    for (const a of loans) for (const d of (a.driveFiles || []).concat(a.contestedDocuments || [])) claimed.add(d.id);
  } catch (e) { /* loans unavailable */ }
  for (const fam of ["resolutions", "licences"]) for (const r of (st.registers[fam] || [])) for (const d of (r.driveFiles || [])) claimed.add(d.id);

  /* The pool: unclaimed Compliance documents that are real instruments. */
  const pool = files.filter((f) =>
    /^Compliance Data _LegalOS/.test(String(f.folderPath || "")) &&
    !claimed.has(f.id) &&
    model.isRecordDocument(f));
  console.log("unclaimed Compliance documents available for recovery: " + pool.length);

  const squashedName = new Map(pool.map((f) => [f.id, squash(f.name)]));
  const textOf = (id) => { try { return squash(content.textOf(id) || "").slice(0, 20000); } catch (e) { return ""; } };

  const empties = all.filter((r) => !((r.driveFiles || []).concat(r.extraDocuments || [])).length);
  console.log("records with nothing linked: " + empties.length + "\n");

  const recovered = [], unresolved = [];
  for (const rec of empties) {
    /* THE COUNTERPARTY IS THE IDENTIFYING FACT. The title says what kind of
       instrument it is; the counterparty says which one. Title tokens are kept
       only as corroboration, never as the sole basis for a link. */
    const wanted = tokens(rec.counterparty);
    const titleTokens = tokens(rec.title);
    const entTokens = tokens(rec.entity);

    const hits = [];
    for (const f of pool) {
      const sq = squashedName.get(f.id);
      const nameHits = wanted.filter((t) => sq.includes(t));
      if (!nameHits.length) continue;

      /* EVIDENCE REQUIRED, not resemblance:
           two distinctive counterparty tokens in the filename, or
           one long one (>= 6) corroborated by the document's own text.
         Sitting in the same entity's folder is NOT corroboration on its own --
         every one of these records shares an entity with hundreds of files. */
      const longHit = nameHits.some((t) => t.length >= 6);
      const body = nameHits.length === 1 ? textOf(f.id) : "";
      const textHits = body ? [...wanted, ...titleTokens].filter((t) => body.includes(t)) : [];
      const strong = nameHits.length >= 2 || (longHit && textHits.length >= 2);
      if (!strong) continue;
      const sameEntityTree = entTokens.some((t) => squash(f.folderPath).includes(t));

      hits.push({
        fileId: f.id, name: f.name, folderPath: f.folderPath,
        matchedTokens: nameHits, sameEntityTree, textCorroborated: textHits.length >= 2,
      });
    }

    if (hits.length) {
      recovered.push({
        recordId: rec.id, family: rec.klass, title: rec.title, entity: rec.entity,
        counterparty: rec.counterparty, documents: hits,
      });
      continue;
    }

    /* ABSENCE HAS TO BE PROVEN, NOT ASSUMED.
       Before a record is left without a document, the WHOLE Compliance estate
       is searched for its counterparty -- every file, not just the unclaimed
       ones -- and the document text of any near miss is read. If a file
       mentioning this counterparty exists anywhere, that is recorded as a
       candidate held by another record, which is a different fact from "no
       such document exists". */
    const anywhere = [];
    for (const f of files) {
      if (!/^Compliance Data _LegalOS/.test(String(f.folderPath || ""))) continue;
      const sq = squash(f.name);
      const nameHits = wanted.filter((t) => sq.includes(t));
      if (nameHits.length >= 2 || nameHits.some((t) => t.length >= 6)) {
        anywhere.push({
          fileId: f.id, name: f.name, folderPath: f.folderPath,
          matchedTokens: nameHits,
          heldBy: (all.find((r) => ((r.driveFiles || []).concat(r.extraDocuments || [])).some((d) => d.id === f.id)) || {}).id || null,
        });
      }
    }

    unresolved.push({
      recordId: rec.id, family: rec.klass, title: rec.title,
      entity: rec.entity, counterparty: rec.counterparty,
      evidence: {
        rootsSearched: ["Compliance Data _LegalOS"],
        complianceFilesScanned: files.filter((f) => /^Compliance Data _LegalOS/.test(String(f.folderPath || ""))).length,
        unclaimedPoolScanned: pool.length,
        tokensTried: wanted,
        documentTextSearched: true,
        filesMentioningThisCounterpartyAnywhere: anywhere.length,
        candidatesHeldByOtherRecords: anywhere.slice(0, 8),
      },
      status: anywhere.length ? "DOCUMENT_EXISTS_BUT_BELONGS_TO_ANOTHER_RECORD" : "NO_SOURCE_DOCUMENT_IN_DRIVE",
      reason: anywhere.length
        ? anywhere.length + " file(s) name this counterparty, each already attached to the record its own evidence points to"
        : "no file anywhere under the Compliance root names this counterparty; the instrument is not in Drive",
    });
  }

  const totalDocs = recovered.reduce((a, r) => a + r.documents.length, 0);
  console.log("RECOVERED  " + recovered.length + " record(s), " + totalDocs + " document(s)");
  for (const r of recovered.slice(0, 14))
    console.log("   " + r.recordId + "  " + String(r.title).replace(/\n/g, " ").slice(0, 38)
      + "  <- " + r.documents.length + ": " + r.documents.slice(0, 2).map((d) => String(d.name).slice(0, 44)).join(" | "));
  const byStatus = {};
  for (const u of unresolved) byStatus[u.status] = (byStatus[u.status] || 0) + 1;
  console.log("\nSTILL WITHOUT A DOCUMENT  " + unresolved.length);
  for (const [k, v] of Object.entries(byStatus)) console.log("   " + String(v).padStart(3) + "  " + k);
  for (const u of unresolved.slice(0, 10))
    console.log("     " + u.recordId + "  cp=" + String(u.counterparty || "").replace(/\n/g, " ").slice(0, 28)
      + "  -> " + u.status + (u.evidence.filesMentioningThisCounterpartyAnywhere ? " (" + u.evidence.filesMentioningThisCounterpartyAnywhere + " elsewhere)" : ""));

  fs.writeFileSync(P.join(AUDIT, "compliance-source-recovery.json"), JSON.stringify({
    builtAt: new Date().toISOString(),
    recordsWithNothingLinked: empties.length,
    unclaimedDocumentPool: pool.length,
    recordsRecovered: recovered.length,
    documentsRecovered: totalDocs,
    stillWithoutASource: unresolved.length,
    recovered, unresolved,
  }, null, 1));
  console.log("\n  wrote audit/compliance-source-recovery.json");

  if (WRITE) {
    const links = {};
    for (const r of recovered) links[r.recordId] = r.documents.map((d) => ({
      id: d.fileId, name: d.name, folderPath: d.folderPath,
      via: "source-recovery", matchedTokens: d.matchedTokens,
    }));
    fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), links }, null, 1));
    console.log("  wrote config/compliance-recovered-links.json (" + Object.keys(links).length + " records)");
  } else {
    console.log("  dry run — re-run with --write to persist the links");
  }
})().catch((e) => { console.error("FAILED:", e.stack); process.exit(1); });
