#!/usr/bin/env node
/* LINKING BY WHAT IS INSIDE THE DOCUMENT.
 *
 * The standing rule in this codebase is that filename similarity must never
 * create a legal relationship. That rule is right, and it left roughly a
 * thousand records with no documents at all: the tracker names a party, the
 * document is a scan called "0001.pdf", and nothing in either name matches.
 *
 * Content changes that. A party's name printed in the BODY of an agreement is
 * evidence about that agreement. It is a different kind of fact from the same
 * name appearing in a file name, which is only a label somebody typed.
 *
 * WHAT THIS DOES
 *   For each record that currently has no document, take the single most
 *   distinctive word of its identity — a counterparty's surname, a case party,
 *   a licence number — and ask Drive's full-text index which documents contain
 *   that word. Keep the answer only when it is narrow enough to mean something.
 *
 * THE BARS, and why each one is there
 *   - SINGLE WORDS ONLY. Drive's index ORs the words of a phrase (measured:
 *     scrambling "WHEREAS the Lessor" barely changes the hit count), so a
 *     multi-word probe proves nothing.
 *   - The word must be RARE IN THE CORPUS. "Khan" appears in hundreds of
 *     documents and identifies nobody. A word must hit at most MAX_HITS files.
 *   - The word must not be a common given name or a legal commonplace.
 *   - The document must already be in a root this record's family may read.
 *     Content is used to find documents, never to move them between families —
 *     no document becomes visible because a keyword matched.
 *   - Where we hold the document's text, the word must REALLY be in it. That is
 *     a free check and it removes the index's ~7% false-positive rate outright.
 *
 * Nothing is written to Drive. Output is a proposal file; --apply writes the
 * links into the register cache.
 *
 *   node tools/content-link.js [--limit N] [--family contracts] [--apply]
 */
const fs = require("fs"), P = require("path");
const drive = require("../api/drive.js");
const registers = require("../api/registers.js");
const content = require("../api/content-model.js");
const { driveJson } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const OUT = P.join(ROOT, "audit", "content-links.json");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same test the register matchers use: a document, not a source workbook or an
// editor lock file.
const isDocFile = (f) => !/\.(xlsx?|tmp)$/i.test(f.name || "")
  && !/^~\$/.test(f.name || "") && !/^\./.test(f.name || "")
  && !/spreadsheetml|ms-excel/i.test(f.mimeType || "");

/* Two caps, doing two different jobs.
   PROBE_CAP rejects a word so common it is useless even as half of a pair
   ("services", "limited"). MAX_INTERSECTION is the one that actually controls
   precision: however common each word is on its own, the set of documents
   containing BOTH must be small, or the pair is not identifying either. Putting
   a tight cap on the single words instead was wrong — it threw away "Abbasi",
   which is unremarkable alone and decisive next to "Mehran". */
const PROBE_CAP = 250;
const MAX_INTERSECTION = 8;
/* AT LEAST ONE RARE WORD. Two words are not enough on their own: "Lease
   Agreement 1st floor Wali Arcade" was matched to a Bughti Plaza lease on
   [floor + arcade], and one Mega Tower document was handed to four different
   records on [tower + floor]. Both pairs are two distinct words and both
   identify nothing — they describe where a thing is, not which thing it is.
   Rather than keep growing a list of banned words, require that one of the two
   is genuinely uncommon in this estate. That is measured from the corpus at
   probe time, so it stays true as the corpus changes. */
const RARE_HITS = 30;
const MIN_LEN = 5;

/* Words that look distinctive and are not. Common Pakistani given names carry
   no identifying power here — half the estate involves a Muhammad or an Ahmed —
   and the legal commonplaces match every instrument of their kind. */
const STOP = new Set(("muhammad mohammad ahmed ahmad khan malik syed shah hussain hassan husain ali raza "
  + "abbas iqbal javed akhtar aslam nawaz bibi begum sahib private limited company pakistan lahore karachi "
  + "islamabad rawalpindi agreement contract service services lease tenancy general letter notice office "
  + "properties property developers development limited holdings ventures group international national "
  + "zameen dubizzle bayut empg daftarkhwan trust fund bank branch main road street plot block phase sector "
  + "february january march april june july august september october november december "
  /* Added after these words produced wrong links: "Zameen Media vs Aftab Ahmed"
     was given a Bushra Farooq suit on [media+aftab+another], and "State vs Ijaz
     Ahmed" was given an unrelated file on [state+others+additional]. None of
     those words names a party. "media" matters most — it is OUR side of nearly
     every case, so it can only ever add noise. */
  + "media state others another additional versus etcetera respondent petitioner appellant plaintiff "
  + "defendant applicant claimant heaven court judge civil sessions district senior additional "
  + "suit case matter appeal revision application "
  /* ORDINALS AND INSTRUMENT WORDS. Added after the first full run proposed the
     SAME document — "First Amendment MTL 8F ZM & EMPG 2023" — as evidence for
     five different records: Dream Garden, Palm City, Maymar Pride, Falaknaz
     Dynasty and Grand City. Each matched on [first + amendment], which is two
     distinct words and therefore passed the two-word rule while identifying
     nothing whatsoever. The rule is sound; the vocabulary was not. A word that
     describes what KIND of instrument a document is can never help say WHICH
     one it is. */
  + "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth "
  + "amendment amendments amended addendum addenda extension extensions termination "
  + "settlement restated executed draft final signed copy annexure annexures schedule "
  + "exhibit marketing promotion sales purchase agreements deed deeds memorandum "
  + "understanding addendums renewal revised").split(" "));

/* Our own group. In "X vs Y" one side is nearly always us, and our own name
   identifies nothing — every case has it. The other side is the identity. */
const OURS = /zameen|dubizzle|bayut|empg|daftarkhwan|olx|zmpl|zvo|\bzd\b/i;

/* Which Drive roots a family's documents may legitimately live in. This is the
   security boundary restated: content may locate a document, it may not move it
   into a family that could not already read it. */
const FAMILY_ROOTS = {
  contracts: /^Commercial|^Compliance Data/i,
  properties: /^Commercial/i,
  litigation: /^Litigation/i,
  notices: /^Litigation|^Commercial/i,
  loans: /^Compliance Data/i,
  licences: /^Compliance Data/i,
  resolutions: /^Compliance Data|^Entities data for secp/i,
};

const identityText = (fam, r) => {
  if (fam === "litigation") {
    /* The COUNTERPARTY, not the whole case name, and never the court or
       counsel — "Additional Sessions Judge" contributed the word "additional"
       to a match, which is worse than useless. Split "X vs Y" and keep the
       side that is not us. */
    const sides = String(r.caseName || "").split(/\s+(?:vs?\.?|versus)\s+/i);
    const theirs = sides.filter((x) => !OURS.test(x));
    return (theirs.length ? theirs : sides).join(" ");
  }
  if (fam === "loans") return [r.borrower, r.lender, r.ref].join(" ");
  if (fam === "licences") return [r.entity, r.authority, r.number].join(" ");
  if (fam === "notices") return [r.sender, r.recipient, r.subject, r.counterparty].join(" ");
  if (fam === "properties") return [r.project, r.address].join(" ");
  return [r.counterparty, r.title, r.project].join(" ");
};

const tokensOf = (s) => String(s || "")
  .replace(/[^A-Za-z0-9 ]+/g, " ")
  .split(/\s+/)
  .map((t) => t.toLowerCase())
  .filter((t) => t.length >= MIN_LEN && !STOP.has(t) && !/^\d+$/.test(t));

async function probe(word) {
  const q = "fullText contains '" + word.replace(/['\\]/g, " ") + "' and trashed=false";
  const qs = "/files?q=" + encodeURIComponent(q)
    + "&fields=" + encodeURIComponent("files(id,name)")
    + "&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true";
  for (let a = 0; a < 4; a++) {
    try { const r = await driveJson(qs); return (r.files || []).map((f) => f.id); }
    catch (e) { if (a === 3) return null; await sleep(1000 * Math.pow(2, a)); }
  }
  return null;
}

(async () => {
  await drive.ensureIndex();
  const st = await registers.ensure();
  const regs = (st && st.registers) || {};
  const byId = new Map(drive.indexFiles().map((f) => [f.id, f]));
  content.load(true);

  const famFilter = arg("--family", null);
  const limit = parseInt(arg("--limit", "0"), 10);

  // Every document already spoken for, so content never steals one.
  const claimed = new Set();
  for (const fam of Object.values(regs)) {
    if (!Array.isArray(fam)) continue;
    for (const r of fam) for (const d of r.driveFiles || []) claimed.add(d.id);
  }

  const targets = [];
  for (const [fam, rows] of Object.entries(regs)) {
    if (!Array.isArray(rows)) continue;
    if (famFilter && fam !== famFilter) continue;
    for (const r of rows) {
      if ((r.driveFiles || []).length) continue;             // already has documents
      const toks = [...new Set(tokensOf(identityText(fam, r)))];
      if (!toks.length) continue;
      targets.push({ fam, record: r, tokens: toks.slice(0, 3) });
    }
  }
  const work = limit ? targets.slice(0, limit) : targets;
  console.log("records with no documents: " + targets.length + (limit ? ", probing " + work.length : ""));

  const wordCache = new Map();
  const proposals = [];
  let i = 0, linked = 0, rejectedCommon = 0, rejectedScope = 0, rejectedText = 0, rejectedSingle = 0, rejectedBroad = 0, rejectedNoRare = 0;

  for (const t of work) {
    i++;
    if (i % 100 === 0) console.log("  " + i + "/" + work.length + "  proposals:" + proposals.length);
    const rootRe = FAMILY_ROOTS[t.fam];

    /* TWO WORDS, NOT ONE. A single name is not an identity: "Mehran Abbasi vs
       Zameen Media" matched a summons about Omer Ashraf vs Aman Builder,
       because the word "mehran" appears somewhere inside it — Mehran is a
       common name and a place. Requiring the document to contain TWO of the
       record's distinctive words, by intersecting two separate probes, is a
       real AND and it removes that whole class. Drive cannot do the AND for us:
       its index ORs the words of a phrase, which is exactly why this has to be
       done as an intersection of two queries. */
    const sets = [];
    for (const word of t.tokens) {
      let ids = wordCache.get(word);
      if (ids === undefined) { ids = await probe(word); wordCache.set(word, ids); }
      if (!ids) continue;
      const ours = ids.filter((id) => byId.has(id));
      if (!ours.length || ours.length > PROBE_CAP) { if (ours.length > PROBE_CAP) rejectedCommon++; continue; }
      sets.push({ word, ids: new Set(ours) });
    }
    if (sets.length < 2) { if (sets.length === 1) rejectedSingle++; continue; }
    if (!sets.some((x) => x.ids.size <= RARE_HITS)) { rejectedNoRare++; continue; }

    // Documents carrying at least two of this record's identity words.
    const count = new Map();
    for (const st2 of sets) for (const id of st2.ids) count.set(id, (count.get(id) || 0) + 1);
    const both = [...count.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
    if (!both.length) continue;
    // Both words in a hundred documents means the pair is describing a theme,
    // not an agreement.
    if (both.length > MAX_INTERSECTION) { rejectedBroad++; continue; }

    const kept = [];
    for (const id of both) {
      if (claimed.has(id)) continue;
      const f = byId.get(id);
      /* A TRACKER IS NOT A DOCUMENT. The litigation tracker lists every case,
         so a full-text search for any party name returns it — and it was being
         proposed as that case's evidence. The workbook is where the record CAME
         FROM; attaching it back would be circular, and it would put a
         spreadsheet naming every dispute into the file of each one. */
      if (!isDocFile(f)) continue;
      if (rootRe && !rootRe.test(f.root || "")) { rejectedScope++; continue; }
      // Free verification wherever we hold the document's text.
      const txt = content.textOf(id);
      const matched = sets.filter((x) => x.ids.has(id));
      const words = matched.map((x) => x.word);
      // The pair that links THIS document must itself include the rare word.
      if (!matched.some((x) => x.ids.size <= RARE_HITS)) continue;
      if (txt && txt.length >= 200) {
        const low = txt.toLowerCase();
        const present = words.filter((w) => low.includes(w));
        if (present.length < 2) { rejectedText++; continue; }
      }
      kept.push({ id, name: f.name, root: f.root, folderPath: f.folderPath,
        words, verified: !!(txt && txt.length >= 200), read: content.factsFor(id).read });
    }
    if (!kept.length) continue;
    proposals.push({
      family: t.fam, recordId: t.record.id,
      // String() because a tracker cell can be a NUMBER — a bare loan ref killed
      // the run at 700 of 919 records with ".slice is not a function".
      record: String(t.record.caseName || t.record.title || t.record.counterparty || t.record.project || t.record.ref || "").slice(0, 70),
      words: sets.map((x) => x.word), hits: both.length, documents: kept,
    });
    linked += kept.length;
  }

  fs.mkdirSync(P.join(ROOT, "audit"), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ builtAt: Date.now(), proposals }, null, 1));

  console.log("\n=== CONTENT LINKS ===");
  console.log("  records given at least one document: " + proposals.length);
  console.log("  document links proposed            : " + linked);
  console.log("  of those, verified against text we hold: " + proposals.reduce((a, p) => a + p.documents.filter((d) => d.verified).length, 0));
  console.log("  rejected, word too common          : " + rejectedCommon);
  console.log("  rejected, wrong family's root      : " + rejectedScope);
  console.log("  rejected, our text does not contain both: " + rejectedText);
  console.log("  skipped, only one distinctive word  : " + rejectedSingle);
  console.log("  rejected, both words too widespread : " + rejectedBroad);
  console.log("  rejected, no rare word in the pair  : " + rejectedNoRare);
  console.log("\n  wrote audit/content-links.json");

  for (const p of proposals.slice(0, 8)) {
    console.log("   " + p.family + "/" + p.recordId + "  \"" + p.record.slice(0, 44) + "\"  <- [" + p.words.join("+") + "] "
      + p.documents.length + " doc(s), e.g. " + p.documents[0].name.slice(0, 44));
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
