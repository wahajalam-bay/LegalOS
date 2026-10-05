// Verified email -> the person LegalOS knows, and what they may do.
//
// The roster stays single-sourced in src/data.js so the browser and the server
// can never disagree about who someone is. That file is an ES module written
// for the browser, so it is parsed rather than imported: the USERS array is
// lifted out literally and evaluated. It is our own source, not user input.
const fs = require("fs");
const path = require("path");
const { ROOT, load } = require("./config");

const DATA_FILE = path.join(ROOT, "src", "data.js");

let roster = { users: [], loadedAt: 0, mtime: 0 };

function extractArray(source, name) {
  const start = source.indexOf("export const " + name + " = [");
  if (start === -1) return null;
  const open = source.indexOf("[", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

function loadRoster() {
  let mtime = 0;
  try { mtime = fs.statSync(DATA_FILE).mtimeMs; } catch (e) { return roster; }
  if (roster.users.length && mtime === roster.mtime) return roster;
  try {
    const src = fs.readFileSync(DATA_FILE, "utf8");
    const literal = extractArray(src, "USERS");
    if (!literal) throw new Error("USERS array not found in src/data.js");
    const users = new Function("return " + literal)();
    roster = { users: Array.isArray(users) ? users : [], loadedAt: Date.now(), mtime };
  } catch (e) {
    console.error("[identity] could not read the roster:", e.message);
  }
  return roster;
}

// Email matching is case-insensitive and whitespace-trimmed, so MARYAM.HAQ@…,
// maryam.haq@… and Maryam.Haq@… are one person, deterministically.
const normEmail = (e) => String(e || "").trim().toLowerCase();

function usersByEmail(email) {
  const e = normEmail(email);
  if (!e) return [];
  const { users } = loadRoster();
  return users.filter((u) => normEmail(u.email) === e);
}

function userByEmail(email) {
  const hits = usersByEmail(email);
  return hits.length ? hits[0] : null;
}

/* Two roster rows claiming one login is an identity conflict. Picking the first
   would silently hand someone another person's access, so the conflict is
   reported and the caller is refused rather than guessed at. */
function identityConflicts() {
  const { users } = loadRoster();
  const byEmail = new Map();
  for (const u of users) {
    const e = normEmail(u.email);
    if (!e) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push({ id: u.id, name: u.name });
  }
  return [...byEmail.entries()].filter(([, v]) => v.length > 1).map(([email, claimants]) => ({ email, claimants }));
}

// What the server will vouch for. The browser may still run its View As
// switcher for demonstration, but every /api answer is scoped to THIS user.
function isAdmin(email) {
  const admins = (load().access.admins || []).map((a) => String(a).toLowerCase().trim());
  return admins.includes(String(email || "").toLowerCase().trim());
}

function principalFor(email) {
  const admin = isAdmin(email);
  const claimants = usersByEmail(email);

  // IDENTITY CONFLICT — fail closed. Never choose between two people.
  if (claimants.length > 1) {
    return {
      email, known: false, provisioned: false, admin: false, id: null,
      name: "", role: "Identity conflict", rbac: null, legalTeam: null,
      canReadKnowledge: false, identityConflict: claimants.map((c) => c.id),
      denyReason: "two roster records claim this login address",
    };
  }
  const u = claimants[0] || null;

  // DISABLED — an account turned off in Users & Access is refused even though
  // Cloudflare authenticated the person. Authentication is not authorization.
  if (u) {
    let status = "active";
    try { status = (require("./permissions").effectiveFor({ id: u.id, rbac: u.rbac, legalTeam: u.legalTeam, admin }) || {}).status || "active"; }
    catch (e) { /* engine unavailable — fall through as active */ }
    if (status !== "active" && !admin) {
      return {
        email: u.email, known: true, provisioned: true, disabled: true, admin: false,
        id: u.id, name: u.name, role: u.role, rbac: u.rbac, legalTeam: u.legalTeam || null,
        canReadKnowledge: false, denyReason: "this LegalOS account is deactivated",
      };
    }
  }

  // An administrator who is also on the legal roster keeps their real role and
  // simply gains admin rights; one who is not gets access without being
  // presented as a member of the legal team.
  if (admin && !u) {
    return {
      email,
      known: true,
      provisioned: true,
      admin: true,
      id: null,
      name: email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Administrator",
      role: "System administrator",
      rbac: "head",
      legalTeam: null,
      dept: "IT / Systems",
      canReadKnowledge: true,
    };
  }

  if (!u) {
    return {
      email,
      known: false,
      // NOT PROVISIONED. Cloudflare proved who they are; LegalOS has never heard
      // of them. They are not a legal user and get no legal data — the only
      // thing an unprovisioned identity may do is raise a request and read its
      // own, which is the business requester surface. Everything else is denied
      // in the router, and the identity is listed in Data Health so an
      // administrator can provision or refuse it deliberately.
      provisioned: false,
      // An authenticated @zameen.com address that is not on the legal roster is
      // a business requester: they may raise work and see their own, nothing more.
      id: null,
      name: email ? email.split("@")[0].replace(/[._]/g, " ") : "",
      role: "Requester",
      rbac: "requester",
      legalTeam: null,
      canReadKnowledge: false,
    };
  }
  return {
    email: u.email,
    known: true,
    provisioned: true,
    admin,
    id: u.id,
    name: u.name,
    role: u.role,
    rbac: u.rbac,
    legalTeam: u.legalTeam || null,
    dept: u.dept || "",
    // The knowledge base is legal-department material. A business requester
    // authenticating through Access does not get the document library.
    canReadKnowledge: admin || !!(u.legalTeam || u.rbac === "head" || u.rbac === "lead"),
  };
}

function rosterSummary() {
  const { users } = loadRoster();
  return { count: users.length, withEmail: users.filter((u) => u.email).length };
}

// The full roster, for tooling (tools/legalos-passwd.js seeds one credential
// per roster member). Read-only view of src/data.js USERS.
function listRoster() { return loadRoster().users.slice(); }

module.exports = { principalFor, userByEmail, usersByEmail, identityConflicts, rosterSummary, isAdmin, listRoster, normEmail };
