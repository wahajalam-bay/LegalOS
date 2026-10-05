// WHO MAY READ A DOCUMENT — decided explicitly, and written down.
//
// THE DEFECT THIS EXISTS TO FIX
// Authorization used to be derived live from the record graph: "a document is
// readable by whichever module groups cite it; if nothing cites it, fall back
// to its Drive root." That reads sensibly and is wrong in a way that only shows
// up when the record graph moves.
//
// Deduplicating eight contract pairs moved it. Merging two records dropped the
// documents column of the one that lost, so a file it cited became cited by
// NOBODY — and the no-citation fallback handed it to everyone with access to
// the Drive root it happened to sit in. Restoring that citation pulled three
// Compliance-root files the other way, out of Compliance's reach entirely.
// Neither change was intended, neither was reviewed, and both were invisible
// until a test that models the policy independently disagreed with the server.
//
// A record-identity decision must not be a security decision. So:
//
//   THE SCOPE IS PERSISTED, NOT DERIVED. Every document carries an explicit set
//   of groups that may read it. Merging records, re-running a matcher or
//   rebuilding the register changes citations freely and changes access not at
//   all.
//
//   IT IS SEEDED FROM TODAY'S EFFECTIVE ACCESS. The migration computes what the
//   old rule grants right now and freezes exactly that, so switching over is a
//   no-op by construction — and the diff report proves it rather than asserting
//   it.
//
//   THE FALLBACK IS THE SOURCE ROOT, NEVER "EVERYONE". A document with no
//   recorded scope is scoped to the root it is filed under; an unclassified
//   root is denied. Absence of information is never permission.
//
//   CROSS-MODULE SHARING IS EXPLICIT. A document readable by two groups says so
//   in `sharedGroups`, with a reason. It is never inferred from two records
//   happening to cite the same file.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "config", "document-scope.json");

/* The module group that owns each Drive root. Kept here so the root
   classification and the authorization that depends on it live together. */
function rootGroup(root) {
  const r = String(root || "").toLowerCase();
  if (r.startsWith("litigation")) return "litigation";
  if (r.startsWith("compliance")) return "compliance";
  if (r.startsWith("commercial")) return "commercial";
  /* SECP filings are corporate compliance and are shown on Compliance &
     Licences. Until this root was named it matched nothing, and an unnamed root
     is not neutral: every one of its 3,367 documents was denied to everyone but
     an administrator while the knowledge tree still listed their names. */
  if (r.startsWith("entities data for secp")) return "compliance";
  return null;
}

const FAMILY_GROUP = {
  contracts: "commercial", properties: "commercial",
  litigation: "litigation", notices: "litigation",
  licences: "compliance", loans: "compliance", resolutions: "compliance",
};

let cache = null, cacheMtime = 0;

function load() {
  try {
    const m = fs.statSync(FILE).mtimeMs;
    if (cache && m === cacheMtime) return cache;
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache = {
      builtAt: j.builtAt || null,
      byFile: new Map(Object.entries(j.documents || {})),
      summary: j.summary || null,
    };
    cacheMtime = m;
    return cache;
  } catch (e) {
    return cache || { builtAt: null, byFile: new Map(), summary: null };
  }
}

/* ------------------------------------------------------- the decision ---- */

/**
 * The ONE authorization function. Every document endpoint calls this — stream,
 * preview, download, metadata, search, tree, folder listing, counts.
 *
 * `groups` is the caller's effective permission map ({commercial:"edit", ...}).
 * `file` is the Drive index entry, used only for its root when no scope is
 * recorded; it is never trusted to widen anything.
 */
function canAccessDocument(fileId, file, groups, isAdmin) {
  if (isAdmin) return { allow: true, why: "administrator" };
  const lvl = (g) => (groups && groups[g]) || "none";

  const rec = load().byFile.get(fileId);
  if (rec) {
    /* An explicit deny outranks everything below it. */
    if (Array.isArray(rec.deniedGroups) && rec.deniedGroups.some((g) => lvl(g) !== "none")) {
      return { allow: false, why: "explicitly denied" };
    }
    const allowed = new Set([...(rec.allowedGroups || []), ...(rec.sharedGroups || [])]);
    if (allowed.size) {
      const hit = [...allowed].find((g) => lvl(g) !== "none");
      return hit ? { allow: true, why: "scope: " + [...allowed].join("+") }
        : { allow: false, why: "scope is " + [...allowed].join("+") };
    }
    /* A recorded document with an EMPTY scope is a migration bug, not an open
       door. Fall through to the root, and Data Health counts it. */
  }

  /* No recorded scope: the root it is filed under owns it. */
  const rg = rootGroup(file && file.root);
  if (rg) {
    return lvl(rg) !== "none"
      ? { allow: true, why: "source root: " + rg }
      : { allow: false, why: "source root: " + rg };
  }

  /* Unrecognised root, or no file at all. Default deny — every Drive root here
     maps to a module group, so reaching this means something unclassified
     appeared, and failing open would hand an unclassified corpus to everyone. */
  return { allow: false, why: "unclassified source — denied by default" };
}

/* ------------------------------------------------------------ migrate ---- */

/* What the OLD rule grants, computed exactly as it was written, so the new
   scope can be seeded from it and the switch-over can be proven to change
   nothing. */
function legacyGroupsFor(fileId, file, citedBy) {
  const linked = citedBy.get(fileId);
  if (linked && linked.size) return [...linked];
  const rg = rootGroup(file && file.root);
  return rg ? [rg] : [];
}

/**
 * Build the scope for every document in the Drive index and write it.
 * Seeded from the legacy rule's CURRENT result, so effective access is
 * unchanged at the moment of the switch. `citedBy` is the live record graph;
 * after this it never decides access again — it only explains it.
 */
function build({ files, registers, reason = "migration" }) {
  const citedBy = new Map();
  const citedRecords = new Map();
  for (const [famKey, rows] of Object.entries(registers || {})) {
    const grp = FAMILY_GROUP[famKey];
    if (!grp || !Array.isArray(rows)) continue;
    for (const r of rows) {
      for (const d of (r.driveFiles || [])) {
        if (!citedBy.has(d.id)) { citedBy.set(d.id, new Set()); citedRecords.set(d.id, []); }
        citedBy.get(d.id).add(grp);
        if (citedRecords.get(d.id).length < 20) citedRecords.get(d.id).push(famKey + ":" + r.id);
      }
    }
  }

  const prev = load().byFile;
  const documents = {};
  let fromRoot = 0, fromCitation = 0, unscoped = 0, kept = 0;

  for (const f of (files || [])) {
    const rg = rootGroup(f.root);
    const legacy = legacyGroupsFor(f.id, f, citedBy);
    const existing = prev.get(f.id);

    /* An existing scope is AUTHORITATIVE. Rebuilding must not silently
       re-derive it from a record graph that has since moved — that is the whole
       failure this replaces. Only new documents are seeded. */
    if (existing && Array.isArray(existing.allowedGroups) && existing.allowedGroups.length) {
      documents[f.id] = Object.assign({}, existing, {
        root: f.root || existing.root || "",
        citedByRecords: citedRecords.get(f.id) || [],   // evidence only
      });
      kept++;
      continue;
    }

    const allowedGroups = legacy.length ? legacy : (rg ? [rg] : []);
    if (!allowedGroups.length) unscoped++;
    else if (citedBy.has(f.id)) fromCitation++;
    else fromRoot++;

    documents[f.id] = {
      name: f.name || "",
      root: f.root || "",
      rootGroup: rg || null,
      allowedGroups,
      sharedGroups: [],
      deniedGroups: [],
      /* Why this document is readable by these groups, so an auditor is not
         reverse-engineering it from a matcher. */
      basis: legacy.length && citedBy.has(f.id)
        ? "seeded from the record citations in force at migration"
        : rg ? "source root" : "no classified source",
      citedByRecords: citedRecords.get(f.id) || [],
      setAt: new Date().toISOString(),
      setBy: reason,
    };
  }

  const summary = {
    builtAt: new Date().toISOString(),
    documents: Object.keys(documents).length,
    seededFromCitations: fromCitation,
    seededFromSourceRoot: fromRoot,
    keptFromPreviousScope: kept,
    withNoScope: unscoped,
    reason,
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ builtAt: summary.builtAt, summary, documents }, null, 1), "utf8");
  fs.renameSync(tmp, FILE);
  cache = null;
  return summary;
}

/* ---------------------------------------------------------- the gate ----- */

/**
 * Compare what the OLD citation rule grants against what the NEW recorded scope
 * grants, document by document. A migration that changes anybody's access is a
 * migration that needs explaining, so this is a gate rather than a report.
 */
function diff({ files, registers }) {
  const citedBy = new Map();
  for (const [famKey, rows] of Object.entries(registers || {})) {
    const grp = FAMILY_GROUP[famKey];
    if (!grp || !Array.isArray(rows)) continue;
    for (const r of rows) for (const d of (r.driveFiles || [])) {
      if (!citedBy.has(d.id)) citedBy.set(d.id, new Set());
      citedBy.get(d.id).add(grp);
    }
  }
  const scope = load().byFile;
  const widened = [], narrowed = [], unscoped = [], widenedByPolicy = [];
  for (const f of (files || [])) {
    const oldSet = new Set(legacyGroupsFor(f.id, f, citedBy));
    const rec = scope.get(f.id);
    const newSet = new Set(rec ? [...(rec.allowedGroups || []), ...(rec.sharedGroups || [])]
      : (rootGroup(f.root) ? [rootGroup(f.root)] : []));
    if (!newSet.size) { unscoped.push({ id: f.id, name: f.name, root: f.root }); continue; }
    const gained = [...newSet].filter((g) => !oldSet.has(g));
    const lost = [...oldSet].filter((g) => !newSet.has(g));
    if (gained.length) {
      /* AN APPROVED SHARE IS EXPLAINED WIDENING, NOT A DEFECT.
         This function measures the persisted scope against what the old
         citation rule WOULD have granted, and its job is to catch access that
         moved with nobody deciding it. A document carrying a sharePolicy moved
         because a named person approved it, on a recorded date, for a recorded
         reason -- so it is reported separately rather than counted as drift.
         Were it left in `widened`, the gate would stay red forever and the
         next real leak would arrive inside a number everyone had learned to
         ignore. Anything gained BEYOND what its policy approved still counts
         as unexplained. */
      const policy = rec && rec.sharePolicy;
      const approved = policy ? new Set(rec.sharedGroups || []) : null;
      const unapproved = approved ? gained.filter((g) => !approved.has(g)) : gained;
      const entry = { id: f.id, name: f.name, root: f.root, from: [...oldSet], to: [...newSet], gained };
      if (policy && !unapproved.length) {
        widenedByPolicy.push(Object.assign({}, entry, {
          policyId: policy.policyId, approvedBy: policy.approvedBy,
          approvedByUserId: policy.approvedByUserId || null, approvedAt: policy.approvedAt,
        }));
      } else {
        widened.push(unapproved.length === gained.length ? entry : Object.assign({}, entry, { gained: unapproved }));
      }
    }
    if (lost.length) narrowed.push({ id: f.id, name: f.name, root: f.root, from: [...oldSet], to: [...newSet], lost });
  }
  const byPolicy = {};
  for (const w of widenedByPolicy) byPolicy[w.policyId] = (byPolicy[w.policyId] || 0) + 1;
  return {
    checked: (files || []).length,
    widened, narrowed, unscoped,
    /* Business-approved sharing, kept out of the drift number on purpose. */
    widenedByPolicy, byPolicy,
    clean: widened.length === 0 && narrowed.length === 0 && unscoped.length === 0,
  };
}

const stats = () => {
  const c = load();
  return { builtAt: c.builtAt, documents: c.byFile.size, summary: c.summary };
};

module.exports = { canAccessDocument, build, diff, load, stats, rootGroup, FAMILY_GROUP, FILE };
