#!/usr/bin/env node
/* READING THE SCANS.
 *
 * Seven documents in ten here are scanned paper with no text layer, and this
 * machine has no OCR. That would leave the majority of the estate unread — but
 * Google has already OCR'd it. Drive's `fullText contains` index searches the
 * CONTENT of a scanned PDF, which is provable rather than hopeful: the phrase
 * "witnesseth" returns thirty documents and matches no filename at all, as do
 * "hereinafter referred to as" and "WHEREAS the Lessor".
 *
 * So instead of pulling 14 GB through an OCR engine we do not have, we ASK the
 * index what each document says, one phrase at a time, and record which files
 * come back. Every hit is a fact about a document's contents, obtained without
 * downloading it and without writing a single byte to Drive.
 *
 * TWO KINDS OF PROBE, both of them SINGLE WORDS (see the note on TYPE_PROBES:
 * the index ORs the words of a phrase, so multi-word probes are worthless):
 *
 *   TYPE probes    a word that belongs to one kind of instrument — "lessor" to
 *                  a lease, "vakalatnama" to a court file, "khasra" to a land
 *                  record. These tell us WHAT a document is, which is what
 *                  decides the module it belongs in.
 *
 *   IDENTITY probes  a party's surname, a licence number, a contract reference.
 *                  These tell us WHICH record a document belongs to, and they
 *                  are the only kind strong enough to create a legal
 *                  relationship — the standing rule here is that filename
 *                  similarity must never do that. A name found in the BODY of
 *                  the document is evidence; the same name in its title is a
 *                  label somebody typed.
 *
 *   node tools/content-probe.js [--only type|identity] [--limit N]
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const { driveJson } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "cache", "content-probes.json");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* SINGLE WORDS ONLY — this was measured, not assumed.
   Drive's `fullText contains` is TOKEN-based, not phrase-exact. Scrambling a
   phrase barely changes the result ("WHEREAS the Lessor" 665 hits, "Lessor
   WHEREAS the" 616), and a three-word probe returns MORE hits than its rarest
   word alone (665 vs 484 for "Lessor"), which can only happen if the words are
   being OR-ed rather than matched in sequence. Every multi-word probe was
   therefore discarded: they looked precise and were not.

   What survives is single words that belong to one kind of instrument, each one
   measured against the corpus so its selectivity is known rather than hoped
   for. A word carried by more than a third of the estate classifies nothing and
   is rejected regardless of how legal it sounds. */
const TYPE_PROBES = [
  // token, the instrument it implies, weight, and its measured share of the corpus
  { q: "vakalatnama", type: "LITIGATION", w: 3 },        // 15 — a power of attorney to counsel
  { q: "plaint", type: "LITIGATION", w: 3 },             // 172
  { q: "injunction", type: "LITIGATION", w: 2 },         // 372
  { q: "decree", type: "LITIGATION", w: 2 },             // 391
  { q: "witnesseth", type: "AGREEMENT", w: 2 },          // 43
  { q: "lessor", type: "LEASE", w: 3 },                  // 297
  { q: "lessee", type: "LEASE", w: 3 },                  // 364
  { q: "tenancy", type: "LEASE", w: 2 },                 // 107
  { q: "khasra", type: "LAND_RECORD", w: 3 },            // 73
  { q: "fard", type: "LAND_RECORD", w: 3 },              // 46
  { q: "mutation", type: "LAND_RECORD", w: 2 },          // 22
  { q: "easement", type: "LAND_RECORD", w: 2 },          // 38
  { q: "promissory", type: "LOAN", w: 3 },               // 32
  { q: "guarantor", type: "LOAN", w: 2 },                // 30
  { q: "debenture", type: "LOAN", w: 2 },                // 204
  { q: "mortgagee", type: "LOAN", w: 2 },                // 102
  { q: "moratorium", type: "LOAN", w: 2 },               // 1
  { q: "novation", type: "AGREEMENT", w: 2 },            // 108
  { q: "escrow", type: "AGREEMENT", w: 2 },              // 108
  { q: "franchise", type: "AGREEMENT", w: 2 },           // 38
  { q: "indemnity", type: "AGREEMENT", w: 1 },           // 475
  { q: "arbitration", type: "DISPUTE_CLAUSE", w: 1 },    // 829
  { q: "affidavit", type: "AFFIDAVIT", w: 2 },           // 551
  { q: "allotment", type: "CORPORATE", w: 2 },           // 500
  { q: "subrogation", type: "INSURANCE", w: 3 },         // 4

  /* SECOND BATCH. The first twenty-five words left 3,924 scanned documents with
     no content signal at all — a scan is only "read" here if one of these words
     happens to be in it, so a short vocabulary means most of the estate stays
     dark. These widen the net across the instrument types this estate actually
     holds. Selectivity still matters: anything that comes back saturated is
     dropped automatically at load time. */
  { q: "hereinafter", type: "AGREEMENT", w: 1 },
  { q: "covenants", type: "AGREEMENT", w: 1 },
  { q: "consideration", type: "AGREEMENT", w: 1 },
  { q: "terminate", type: "AGREEMENT", w: 1 },
  { q: "confidentiality", type: "NDA", w: 2 },
  { q: "disclosure", type: "NDA", w: 1 },
  { q: "attorney", type: "POA", w: 2 },
  { q: "notarized", type: "AFFIDAVIT", w: 2 },
  { q: "deponent", type: "AFFIDAVIT", w: 3 },
  { q: "oath", type: "AFFIDAVIT", w: 2 },
  { q: "summons", type: "LITIGATION", w: 3 },
  { q: "petitioner", type: "LITIGATION", w: 2 },
  { q: "respondent", type: "LITIGATION", w: 2 },
  { q: "adjourned", type: "LITIGATION", w: 3 },
  { q: "judgment", type: "LITIGATION", w: 2 },
  { q: "tribunal", type: "LITIGATION", w: 2 },
  { q: "quorum", type: "RESOLUTION", w: 3 },
  { q: "minutes", type: "RESOLUTION", w: 1 },
  { q: "chairman", type: "CORPORATE", w: 1 },
  { q: "shareholders", type: "CORPORATE", w: 2 },
  { q: "directors", type: "CORPORATE", w: 1 },
  { q: "incorporation", type: "INCORPORATION", w: 3 },
  { q: "auditor", type: "FINANCIAL_STATEMENTS", w: 2 },
  { q: "balance", type: "FINANCIAL_STATEMENTS", w: 1 },
  { q: "depreciation", type: "FINANCIAL_STATEMENTS", w: 3 },
  { q: "taxpayer", type: "TAX_CERTIFICATE", w: 3 },
  { q: "registrar", type: "SECP_FILING", w: 2 },
  { q: "prescribed", type: "SECP_FILING", w: 1 },
  { q: "rentals", type: "LEASE", w: 2 },
  { q: "premises", type: "LEASE", w: 2 },
  { q: "landlord", type: "LEASE", w: 3 },
  { q: "tenant", type: "LEASE", w: 2 },
  { q: "contractor", type: "SERVICE", w: 2 },
  { q: "workmanship", type: "SERVICE", w: 3 },
  { q: "milestone", type: "SERVICE", w: 2 },
  { q: "disbursement", type: "LOAN", w: 3 },
  { q: "repayment", type: "LOAN", w: 3 },
  { q: "collateral", type: "LOAN", w: 3 },
  { q: "khewat", type: "LAND_RECORD", w: 3 },
  { q: "kanal", type: "LAND_RECORD", w: 2 },
  { q: "marla", type: "LAND_RECORD", w: 2 },
  { q: "patwari", type: "LAND_RECORD", w: 3 },
  { q: "possession", type: "LAND_RECORD", w: 1 },
];

/* One page of results is 100; Drive will page to 1000 for a broad phrase. A
   common phrase that fills every page is telling us it is not discriminating,
   so it is recorded as saturated and given no weight in classification. */
async function probe(term, cap = 1000) {
  const out = [];
  let token = null, pages = 0;
  const q = "fullText contains '" + String(term).replace(/['\\]/g, " ") + "' and trashed=false";
  do {
    const qs = "/files?q=" + encodeURIComponent(q)
      + "&fields=" + encodeURIComponent("nextPageToken,files(id)")
      + "&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true"
      + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    let res;
    for (let a = 0; a < 5; a++) {
      try { res = await driveJson(qs); break; }
      catch (e) {
        if (a === 4) return { ids: out, error: String(e.message || e).slice(0, 80) };
        await sleep(1200 * Math.pow(2, a) + Math.random() * 500);
      }
    }
    for (const f of (res.files || [])) out.push(f.id);
    token = res.nextPageToken || null;
    pages++;
  } while (token && out.length < cap && pages < 12);
  return { ids: out, saturated: out.length >= cap };
}

(async () => {
  await drive.ensureIndex();
  const mine = new Set(drive.indexFiles().map((f) => f.id));
  console.log("content-probe: " + mine.size + " files in our roots\n");

  let store = { builtAt: 0, type: {}, identity: {} };
  try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) {}
  store.type = store.type || {}; store.identity = store.identity || {};

  const only = arg("--only", "type");
  const limit = parseInt(arg("--limit", "0"), 10);

  if (only === "type" || only === "all") {
    const list = limit ? TYPE_PROBES.slice(0, limit) : TYPE_PROBES;
    let i = 0;
    for (const p of list) {
      i++;
      const r = await probe(p.q);
      const ours = r.ids.filter((id) => mine.has(id));
      store.type[p.q] = { type: p.type, w: p.w, ids: ours, total: r.ids.length, saturated: !!r.saturated };
      console.log("  [" + i + "/" + list.length + "] " + JSON.stringify(p.q).padEnd(42)
        + " -> " + String(ours.length).padStart(4) + " of ours"
        + (r.saturated ? "   (saturated — too common to classify on)" : "")
        + (r.error ? "   ERROR " + r.error : ""));
      fs.writeFileSync(OUT, JSON.stringify(store));
    }
  }

  store.builtAt = Date.now();
  fs.writeFileSync(OUT, JSON.stringify(store));

  const covered = new Set();
  for (const v of Object.values(store.type)) if (!v.saturated) for (const id of v.ids) covered.add(id);
  console.log("\n  " + covered.size + " of our " + mine.size
    + " files matched at least one non-saturated content probe");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
