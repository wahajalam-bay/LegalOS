/* LEGAL DIVISIONS, THEIR PEOPLE, AND WHERE WORK ROUTES.
 *
 * Until now the department's shape was implicit: a lead was whoever had rbac
 * "lead" on the right team, an escalation went to a user id written into a
 * reminder module, and a requester was never told who their point of contact
 * was. Three different files each knew a bit of the org chart and none of them
 * agreed.
 *
 * This is the one place that answers:
 *
 *   WHO RUNS a division          — the head, and the managers under them
 *   WHO IS IN IT                 — members, and which of them are POCs
 *   WHERE A REQUEST GOES         — routing rules from matter category to
 *                                  division
 *   WHO AN ESCALATION GOES TO    — the line manager of whoever is holding it
 *
 * THE SEED IS NOT INVENTED. Every person named below is already on the roster
 * in src/data.js with the job title used here; nothing adds a colleague who
 * does not exist. The file is editable by an administrator, and every change is
 * audited.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "legal-divisions.json");

/* The department as it actually stands, taken from the roster's own job
   titles. A deployment that reorganises edits the file; nothing here is
   hardcoded into a screen. */
const SEED = {
  version: 1,
  divisions: [
    {
      key: "litigation",
      label: "Litigation & Disputes",
      headUserId: "u6",                       // Salman Rashid — AD Legal, Head of Litigation & Disputes
      managerUserIds: ["u17"],                // Hasan Majeed — Senior Manager
      memberUserIds: ["u18", "u19", "u26"],
      pocUserIds: ["u6", "u17"],
      categories: ["Litigation", "Dispute", "Notice", "Recovery", "Police Complaint", "IP"],
    },
    {
      key: "commercial",
      label: "Commercial & Risk Mitigation",
      headUserId: "u3",                       // Imran Tariq Mir — Head of Commercial Contracts
      managerUserIds: ["u7"],                 // Modassar Ali — Assistant Manager
      memberUserIds: ["u5", "u10"],
      pocUserIds: ["u3", "u7"],
      categories: ["Contract Drafting / Review", "Contract", "Vetting", "Commercial", "NDA", "Lease"],
    },
    {
      key: "compliance",
      label: "Compliance & Licences",
      headUserId: "u20",                      // Arsalan Sandhu — Manager Compliance
      managerUserIds: [],
      memberUserIds: ["u12"],
      pocUserIds: ["u20", "u12"],
      categories: ["Compliance", "Licence", "Licensing", "SECP", "Resolution", "Filing"],
    },
  ],
  /* The person every division escalates PAST. One name, because there is one
     General Counsel, and an escalation chain that loops is not a chain. */
  directorUserId: "u1",
  audit: [],
};

let cache = null;
function read() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch (e) { cache = JSON.parse(JSON.stringify(SEED)); write(); }
  if (!Array.isArray(cache.divisions)) cache = JSON.parse(JSON.stringify(SEED));
  return cache;
}
function write() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}

const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 200);
const ids = (v) => (Array.isArray(v) ? v.map((x) => clean(x, 40)).filter(Boolean) : []);

function list() {
  const c = read();
  return { divisions: c.divisions, directorUserId: c.directorUserId, version: c.version };
}

function byKey(key) { return read().divisions.find((d) => d.key === key) || null; }

/* Which division a person belongs to. Checked head-first so a head who is also
   listed as a member resolves once. */
function divisionOfUser(userId) {
  const uid = clean(userId, 40);
  if (!uid) return null;
  for (const d of read().divisions) {
    if (d.headUserId === uid) return d;
    if ((d.managerUserIds || []).includes(uid)) return d;
    if ((d.memberUserIds || []).includes(uid)) return d;
  }
  return null;
}

/* WHO AN ESCALATION GOES TO.
 *
 * One step up, never to everybody: a member escalates to their manager if the
 * division has one and otherwise to the head; a manager escalates to the head;
 * a head escalates to the Director. A person who is in no division escalates to
 * the Director, because somebody has to own it and the alternative is nobody.
 *
 * Returns null when the escalation would point at the person themselves, which
 * is how the caller avoids raising a reminder somebody sends to themselves.
 */
function lineManagerFor(userId) {
  const uid = clean(userId, 40);
  const c = read();
  const d = divisionOfUser(uid);
  if (!d) return uid === c.directorUserId ? null : c.directorUserId;
  if ((d.memberUserIds || []).includes(uid)) {
    const mgr = (d.managerUserIds || [])[0];
    if (mgr && mgr !== uid) return mgr;
    return d.headUserId && d.headUserId !== uid ? d.headUserId : c.directorUserId;
  }
  if ((d.managerUserIds || []).includes(uid)) {
    return d.headUserId && d.headUserId !== uid ? d.headUserId : c.directorUserId;
  }
  if (d.headUserId === uid) return c.directorUserId === uid ? null : c.directorUserId;
  return c.directorUserId;
}

/* The head responsible for a division, and the head responsible for a matter
   CATEGORY where no owner has been assigned yet (§54). */
function headOfDivision(key) { const d = byKey(key); return d ? d.headUserId : read().directorUserId; }

function routeCategory(category) {
  const t = clean(category, 120).toLowerCase();
  if (!t) return null;
  for (const d of read().divisions) {
    if ((d.categories || []).some((c) => t.includes(String(c).toLowerCase()) || String(c).toLowerCase().includes(t))) return d;
  }
  return null;
}

/* The POCs a requester may be shown for a division. Restricted to that division
   (§23): offering the whole department as a possible contact is how a requester
   ends up chasing somebody who has never seen their request. */
function pocsFor(key) {
  const d = byKey(key);
  if (!d) return [];
  const set = (d.pocUserIds || []).slice();
  if (d.headUserId && !set.includes(d.headUserId)) set.push(d.headUserId);
  return set;
}

function save(body, who) {
  const c = read();
  const b = body || {};
  if (!Array.isArray(b.divisions)) return { error: "invalid", errors: ["divisions must be a list"] };
  const next = b.divisions.map((d) => {
    const existing = c.divisions.find((x) => x.key === d.key) || {};
    return {
      key: clean(d.key, 40) || existing.key,
      label: clean(d.label, 120) || existing.label || "",
      headUserId: clean(d.headUserId, 40),
      managerUserIds: ids(d.managerUserIds),
      memberUserIds: ids(d.memberUserIds),
      pocUserIds: ids(d.pocUserIds),
      categories: (Array.isArray(d.categories) ? d.categories : []).map((x) => clean(x, 80)).filter(Boolean),
    };
  }).filter((d) => d.key);
  if (!next.length) return { error: "invalid", errors: ["at least one division is required"] };

  const before = JSON.stringify(c.divisions);
  c.divisions = next;
  if (b.directorUserId) c.directorUserId = clean(b.directorUserId, 40);
  c.audit = (c.audit || []).concat([{
    at: new Date().toISOString(),
    by: (who && (who.email || who.name)) || null,
    action: "divisions updated",
    before: before.slice(0, 4000),
  }]).slice(-200);
  if (!write()) return { error: "the divisions could not be saved" };
  return { ok: true, ...list() };
}

module.exports = {
  list, byKey, save, divisionOfUser, lineManagerFor, headOfDivision, routeCategory, pocsFor, SEED,
};
