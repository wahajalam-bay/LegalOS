/* RESOLVING A MISSING FACT FROM THE DRIVE ESTATE.
 *
 * A tracker row with a blank required column is not the same thing as a fact
 * that does not exist. The refund sheet of "Zameen Pending Litigation.xlsx" has
 * no Case Title column at all — but three of the buyers on it have a case
 * FOLDER in the litigation root, named with the real cause title:
 *
 *     Litigation Files / Civil Disputes / Iqra Aslam vs Zameen.com etc
 *
 * The answer was in Drive the whole time, one folder away from the row that was
 * being reported as incomplete. This module is the step that goes and looks.
 *
 * TWO RULES GOVERN EVERYTHING HERE.
 *
 *  1. EVIDENCE, NOT INFERENCE. A value is only adopted when a Drive object
 *     actually carries it. Nothing is composed out of fragments, nothing is
 *     guessed from a pattern, and a near-miss is not a match. Every value that
 *     is adopted records the file or folder it came from, so a reader can open
 *     the evidence and disagree.
 *
 *  2. SILENCE IS A FINDING. Where the estate genuinely does not carry the fact,
 *     the record is marked NOT_EVIDENCED_IN_SOURCE with what was searched for —
 *     which is a different and much more useful statement than "incomplete".
 */

const STOP = new Set(["the", "and", "etc", "vs", "v", "versus", "ltd", "limited", "pvt",
  "private", "smc", "company", "co", "mr", "mrs", "ms", "muhammad", "mohammad", "syed"]);

const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* The words that actually identify a person or a matter — long enough to mean
   something, and not one of the words every Pakistani corporate name contains.
   "Muhammad Nasir Malik" identifies on "nasir" and "malik", never on
   "muhammad", which would match several hundred unrelated files. */
function tokens(s) {
  return norm(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
}

/* A name that reads like a cause title: "X vs Y", "X Vs. Y", "Suit titled X". */
const CAUSE = /\bv\/?s\.?\b|\bversus\b/i;

/* ONE LETTER APART IS THE SAME PERSON.
 *
 * The refund tracker writes "Khawaja Zia Siddique"; the Drive folder is
 * "Khawaja Zia Siddiqui Vs ...". Insisting on an exact substring loses a match
 * that any reader would make instantly, and transliterated Urdu names vary this
 * way constantly — Siddique/Siddiqui, Ahmed/Ahmad, Naseer/Nasir.
 *
 * So a token may match within one edit, and only if it is long enough that one
 * edit still leaves it distinctive (six characters or more). "Khan" and "Shah"
 * must match exactly; they are four letters and differ from dozens of other
 * names by one. This is deliberately the narrowest tolerance that solves the
 * real cases — it is not a fuzzy search, and a two-letter difference is a
 * different name until a document says otherwise.
 */
function within1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

function tokenIn(want, hayTokens) {
  if (hayTokens.has(want)) return true;
  if (want.length < 6) return false;
  for (const h of hayTokens) if (h.length >= 6 && within1(want, h)) return true;
  return false;
}

/**
 * Find Drive objects whose name carries every identifying token of `subject`.
 * Folders rank above files, because a folder named after a case IS the case;
 * a file inside it may be one document of many.
 */
function evidenceFor(subject, index, opts = {}) {
  const want = tokens(subject);
  if (want.length < 2) return [];          // one token is not an identification
  const rootFilter = opts.root ? new RegExp(opts.root, "i") : null;
  const hits = [];
  for (const o of index) {
    if (rootFilter && !rootFilter.test(o.root || "")) continue;
    const hay = new Set(norm(o.name).split(" ").filter(Boolean));
    if (!want.every((w) => tokenIn(w, hay))) continue;
    hits.push(o);
  }
  return hits;
}

/**
 * The canonical cause title for a matter, taken from the Drive estate.
 *
 * Returns { value, evidence } or null. A title is only returned when the Drive
 * object reads like a cause — "A vs B" — because a folder called "Iqra Aslam"
 * tells us where the papers are, not what the case is called.
 */
function caseTitleFor(subject, index, opts = {}) {
  const hits = evidenceFor(subject, index, { root: "Litigation", ...opts });
  if (!hits.length) return null;
  // A folder that reads like a cause title is the best answer; then a file.
  const folders = hits.filter((h) => h.kind === "folder" && CAUSE.test(h.name));
  const files = hits.filter((h) => h.kind !== "folder" && CAUSE.test(h.name));
  const pick = folders[0] || files[0];
  if (!pick) return null;
  /* A file name carries the document type and often a date; the cause title is
     the part that reads like one. "Summon_Iqra Aslam vs. Zameen.com etc (1).pdf"
     yields "Iqra Aslam vs. Zameen.com etc". */
  let title = pick.name;
  if (pick.kind !== "folder") {
    title = title.replace(/\.[a-z0-9]{2,5}$/i, "");
    const seg = title.split(/[_]+/).find((x) => CAUSE.test(x)) || title;
    title = seg;
  }
  title = title.replace(/\s*\(\d+\)\s*$/, "").replace(/\s+/g, " ").trim();
  if (!CAUSE.test(title)) return null;
  return {
    value: title,
    evidence: {
      from: pick.kind === "folder" ? "Drive case folder" : "Drive case document",
      driveId: pick.id, name: pick.name, path: pick.folderPath || null, root: pick.root || null,
      matchedOn: tokens(subject).join(" + "),
      alsoSeen: hits.length - 1,
    },
  };
}

/* OUR OWN NAME IDENTIFIES NOTHING.
 *
 * Half the rows in the notices tracker have "Zameen Media (Pvt.) Ltd." in the
 * sender or recipient column, because we are a party to all of them. Searching
 * the estate on that produced a match against "Notice to the Shareholders for
 * the Annual General Meeting of Zameen Media" — a corporate meeting notice
 * filed with SECP, which has nothing to do with the legal notice on that row.
 *
 * A subject only identifies a matter if it is the OTHER side. */
const OURS = /\b(zameen|dubizzle|empg|olx|bayut|daftarkhwan|deevar|prop\.?pk|graana)\b/i;

function isOurOwn(name) {
  return OURS.test(String(name || ""));
}

/**
 * The notice or summons document in the estate that names this counterparty.
 * Restricted to the litigation root: an AGM notice in the SECP estate is a
 * corporate filing, not a legal notice, and must never be linked as one.
 */
function noticeDocumentFor(subject, index, opts = {}) {
  if (!subject || isOurOwn(subject)) return null;
  const hits = evidenceFor(subject, index, { root: "Litigation", ...opts })
    .filter((o) => o.kind !== "folder" && /notice|summon/i.test(o.name));
  if (!hits.length) return null;
  const pick = hits[0];
  /* The descriptive part of the file name — what the notice is ABOUT — is the
     segment that is neither the document type nor the party nor a date.
     It is recorded as coming from the file name, at stated confidence, because
     a name is a good pointer and not a legal fact (the document itself is). */
  const base = pick.name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_\d{8}(_\d+)?$/, "");
  const segs = base.split(/[_]+/).map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/^(legal ?notice|notice|summons?|summon)$/i.test(x))
    .filter((x) => !tokens(subject).some((t) => norm(x).includes(t)))
    /* A COURT IS NOT A SUBJECT, AND A FRAGMENT IS NOT A FACT.
       "Civil Judge Peshawar" says where the matter is, not what it is about,
       and "Con (1)" is a truncation artefact of a scanner. Either one written
       into the Details column would read as the notice's subject and be wrong.
       When nothing descriptive survives, the document is still linked — the
       reader opens it — and Details stays explicitly unevidenced. */
    .filter((x) => !/^(civil|consumer|sessions?|district|additional|high|supreme|magistrate)\b/i.test(x))
    .filter((x) => !/\b(court|judge|tribunal)\b/i.test(x))
    .filter((x) => !/^\d+$/.test(x))
    .filter((x) => x.replace(/[^a-z]/gi, "").length >= 5)
    .filter((x) => /\s/.test(x) || x.length >= 8);
  return {
    subject: segs.join(" — ") || null,
    confidence: segs.length ? "from-file-name" : "none",
    file: { id: pick.id, name: pick.name, path: pick.folderPath || null, root: pick.root || null,
      mimeType: pick.mimeType || null, modifiedTime: pick.modifiedTime || null },
    evidence: { from: "Drive notice document", driveId: pick.id, name: pick.name,
      path: pick.folderPath || null, matchedOn: tokens(subject).join(" + "), alsoSeen: hits.length - 1 },
  };
}

/* A HEARING NOTICE BELONGS TO A CASE, AND THE CASE HAS PAPERS.
 *
 * Half the notices with a blank Details column are hearing notices — and the
 * matter they belong to has a folder in the litigation root full of
 * applications, suits and cross-examinations naming the same counterparty:
 *
 *     "01- Application - Atta Gulzar Vs. ZMPL.pdf"
 *     "Suit - Khalid Mehmood Vs ZAK and others.pdf"
 *
 * Looking only for files called "notice" or "summons" missed all of it. This
 * searches the litigation estate for ANY document naming the counterparty, and
 * returns the matter it evidences — which is what the notice is about.
 */
function matterDocumentFor(subject, index, opts = {}) {
  if (!subject || isOurOwn(subject)) return null;
  const hits = evidenceFor(subject, index, { root: "Litigation", ...opts }).filter((o) => o.kind !== "folder");
  if (!hits.length) return null;
  /* The cause title, where one of the papers carries it — that is the matter
     this notice concerns, and it is a far better description than a file name. */
  const titled = hits.find((h) => CAUSE.test(h.name));
  let matter = null;
  if (titled) {
    const seg = titled.name.replace(/\.[a-z0-9]{2,5}$/i, "").split(/\s+-\s+|_/).find((x) => CAUSE.test(x));
    if (seg) matter = seg.replace(/\s*\(\d+\)\s*$/, "").replace(/\s+/g, " ").trim();
  }
  /* The folder the papers sit in is usually the case folder, and names it. */
  const folder = (hits[0].folderPath || "").split(" / ").pop();
  if (!matter && folder && CAUSE.test(folder)) matter = folder;
  const pick = titled || hits[0];
  return {
    matter,
    file: { id: pick.id, name: pick.name, path: pick.folderPath || null, root: pick.root || null,
      mimeType: pick.mimeType || null, modifiedTime: pick.modifiedTime || null },
    evidence: { from: "litigation case papers", driveId: pick.id, name: pick.name,
      path: pick.folderPath || null, matchedOn: tokens(subject).join(" + "), alsoSeen: hits.length - 1 },
  };
}

module.exports = { tokens, norm, evidenceFor, caseTitleFor, noticeDocumentFor, matterDocumentFor, isOurOwn, within1, CAUSE };
