#!/usr/bin/env node
/* WHICH PROJECT DOES THIS SCAN TALK ABOUT?
 *
 * Seven Commercial documents in ten are scanned paper with no text layer, and
 * this machine has no OCR. Google's Drive index has already OCR'd them, so this
 * asks that index, one project name at a time, which documents mention it.
 *
 * The result is the fact the reconciliation actually needs: not "this file is
 * in the Marbella folder" (a label somebody typed) but "the words 'Marbella
 * Drive' appear inside this document" — evidence about the document itself.
 *
 * TWO VOCABULARIES, kept apart on purpose:
 *
 *   PROJECT tokens   distinctive names taken from the trackers and the folder
 *                    tree — marbella, rumanza, quadrangle, madev. These carry
 *                    IDENTITY and may support a mapping.
 *
 *   INSTRUMENT tokens  words that say what KIND of document this is — novation,
 *                    addendum, khasra, allotment. These carry TYPE and must
 *                    never map a document to a record on their own.
 *
 * Generic words are excluded from both. Drive's index ORs the words of a
 * phrase, so every probe is a single word; and a word that comes back attached
 * to a large share of the estate is recorded as saturated and given no weight.
 *
 *   node tools/commercial-probe.js [--limit N]
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const { driveJson } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "cache", "commercial-probes.json");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Distinctive project names present in the Commercial estate. Every one of
   these was taken from a tracker row or a folder name, then filtered to words
   that name a PLACE OR SCHEME rather than describe a document. */
const PROJECT_TOKENS = ("aurum bahria barki beach boulevard broadway chester clifton courtyard deepwell "
  + "downtown enclave florence gujrat gulberg haripur heights hills ivory jehlum jinnah kingcrete "
  + "madev madison marbella medallion meezban mehran murree orchard orchards palladium pheonix phoenix "
  + "platinium premier prestige quadrangle regent resmark rockland rumanza saddar samrina sinaco "
  + "spanish tetra tomorrow valley vault verde villas vista zulekha opal jade arx neo ace quadrangle "
  + "silk icon").split(" ");

/* What KIND of instrument. Deliberately excludes "agreement", "amendment",
   "first", "project", "company" and the rest of the boilerplate the brief
   forbids matching on. */
const INSTRUMENT_TOKENS = [
  ["novation", "NOVATION"], ["addendum", "ADDENDUM"], ["supplemental", "SUPPLEMENT"],
  ["rescission", "TERMINATION"], ["surrender", "TERMINATION"],
  ["khasra", "LAND_RECORD"], ["khewat", "LAND_RECORD"], ["mutation", "LAND_RECORD"],
  ["allotment", "ALLOTMENT"], ["possession", "POSSESSION"],
  ["earnest", "SALE_DEED"], ["conveyance", "SALE_DEED"], ["vendee", "SALE_DEED"], ["vendor", "SALE_DEED"],
  ["promotion", "PPA"], ["marketing", "PPA"], ["brokerage", "PPA"], ["commission", "PPA"],
  ["nondisclosure", "NDA"], ["confidential", "NDA"],
  ["escrow", "ESCROW"], ["guarantee", "GUARANTEE"], ["indemnify", "INDEMNITY"],
  ["arbitrator", "DISPUTE_CLAUSE"], ["jurisdiction", "DISPUTE_CLAUSE"],
  ["lessor", "LEASE"], ["lessee", "LEASE"], ["tenancy", "LEASE"],
  ["contractor", "CONSTRUCTION"], ["workmanship", "CONSTRUCTION"], ["excavation", "CONSTRUCTION"],
  ["piling", "CONSTRUCTION"], ["geotechnical", "CONSTRUCTION"],
];

async function probe(term, cap = 1000) {
  const out = [];
  let token = null, pages = 0;
  const q = "fullText contains '" + String(term).replace(/['\\]/g, " ") + "' and trashed=false";
  do {
    const qs = "/files?q=" + encodeURIComponent(q)
      + "&fields=" + encodeURIComponent("nextPageToken,files(id)")
      + "&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true"
      + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    let res = null;
    for (let a = 0; a < 5; a++) {
      try { res = await driveJson(qs); break; }
      catch (e) { if (a === 4) return { ids: out, error: String(e.message || e).slice(0, 60) }; await sleep(1200 * Math.pow(2, a)); }
    }
    for (const f of (res.files || [])) out.push(f.id);
    token = res.nextPageToken || null;
    pages++;
  } while (token && out.length < cap && pages < 12);
  return { ids: out, saturated: out.length >= cap };
}

(async () => {
  await drive.ensureIndex();
  const commercial = new Set(drive.indexFiles().filter((f) => /^Commercial/.test(f.root || "")).map((f) => f.id));
  console.log("commercial-probe: " + commercial.size + " Commercial files\n");

  let store = { builtAt: 0, project: {}, instrument: {} };
  try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) {}
  store.project = store.project || {}; store.instrument = store.instrument || {};

  const limit = parseInt(arg("--limit", "0"), 10);
  const projects = limit ? PROJECT_TOKENS.slice(0, limit) : PROJECT_TOKENS;
  let i = 0;
  for (const t of projects) {
    i++;
    if (store.project[t]) continue;
    const r = await probe(t);
    const ours = r.ids.filter((id) => commercial.has(id));
    store.project[t] = { ids: ours, total: r.ids.length, saturated: !!r.saturated };
    console.log("  project [" + i + "/" + projects.length + "] " + t.padEnd(14) + " -> " + String(ours.length).padStart(4)
      + " Commercial files" + (r.saturated ? "  (saturated)" : ""));
    fs.writeFileSync(OUT, JSON.stringify(store));
  }
  i = 0;
  for (const [t, type] of INSTRUMENT_TOKENS) {
    i++;
    if (store.instrument[t]) continue;
    const r = await probe(t);
    const ours = r.ids.filter((id) => commercial.has(id));
    store.instrument[t] = { type, ids: ours, total: r.ids.length, saturated: !!r.saturated };
    console.log("  instrument [" + i + "/" + INSTRUMENT_TOKENS.length + "] " + t.padEnd(14) + " -> " + String(ours.length).padStart(4)
      + (r.saturated ? "  (saturated)" : ""));
    fs.writeFileSync(OUT, JSON.stringify(store));
  }

  store.builtAt = Date.now();
  fs.writeFileSync(OUT, JSON.stringify(store));
  const covered = new Set();
  for (const v of Object.values(store.project)) if (!v.saturated) for (const id of v.ids) covered.add(id);
  for (const v of Object.values(store.instrument)) if (!v.saturated) for (const id of v.ids) covered.add(id);
  console.log("\n  " + covered.size + " of " + commercial.size + " Commercial files carry at least one probed word");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
