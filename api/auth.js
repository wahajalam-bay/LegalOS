// Credential sign-in + server-side sessions.
//
// This is the app's OWN front door, layered inside Cloudflare Access. Access
// gates the domain; this gates the identity the app runs as. The two are
// deliberately independent: Access proves a person may reach the deployment,
// a credential proves which LegalOS account they hold. Neither replaces the
// other, and the origin is reachable directly by IP (see the workspace notes),
// so this layer assumes it can be attacked without Cloudflare in front.
//
// Accounts live in config/users.json — gitignored, never served (server.js
// denies /config/ outright). Only scrypt hashes are stored, never passwords.
// Sessions are opaque random tokens held server-side and handed to the browser
// as an HttpOnly cookie, so no script — ours or injected — can read them.
// Manage accounts with: node tools/legalos-passwd.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ROOT } = require("./config");
const { userByEmail, isAdmin } = require("./identity");

const USERS_PATH = path.join(ROOT, "config", "users.json");
const SESS_PATH = path.join(ROOT, "config", ".sessions.json");

const COOKIE = "legalos_sess";
// Session policy: a working day plus overtime, with an idle cut long enough to
// survive a meeting but not a forgotten unlocked laptop overnight.
const ABS_TTL_MS = 12 * 3600e3; // absolute: 12 hours from sign-in
const IDLE_TTL_MS = 60 * 60e3;  // idle: 60 minutes without any API activity
const MAX_SESSIONS_PER_ACCOUNT = 8;

// Lockout: 5 wrong passwords for one (address, account) pair inside 15 minutes
// locks that pair for 15 minutes. Keyed on both so one address hammering many
// accounts and many addresses hammering one account both trip it, while a
// colleague's typo never locks anyone else out.
const LOCK_AFTER = 5;
const LOCK_WINDOW_MS = 15 * 60e3;
const LOCK_MS = 15 * 60e3;

/* ---------------- accounts (config/users.json) ---------------- */
let acct = { list: [], mtime: -1 };
function loadAccounts() {
  let mtime = 0;
  try { mtime = fs.statSync(USERS_PATH).mtimeMs; } catch (e) { mtime = 0; }
  if (mtime === acct.mtime) return acct.list;
  let list = [];
  if (mtime) {
    try {
      const raw = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
      list = Array.isArray(raw.accounts) ? raw.accounts : [];
    } catch (e) {
      console.error("[auth] config/users.json is not valid JSON:", e.message);
      if (acct.mtime !== -1) return acct.list;
    }
  }
  acct = { list, mtime };
  return list;
}
function accountFor(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  return loadAccounts().find((a) => String(a.email || "").toLowerCase() === e && !a.disabled) || null;
}

/* ---------------- passwords (scrypt, no dependencies) ---------------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
function hashPassword(password, saltB64) {
  const salt = saltB64 ? Buffer.from(saltB64, "base64") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}
function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored || "").split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const want = Buffer.from(hashB64, "base64");
    const got = crypto.scryptSync(String(password), salt, want.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(got, want);
  } catch (e) { return false; }
}
// Verified against when the account does not exist, so a wrong email and a
// wrong password cost the same time — no account enumeration by stopwatch.
const DUMMY_HASH = hashPassword("timing-equalizer-" + Math.random());

/* ---------------- sessions ---------------- */
// token -> { account, createdAt, expiresAt, lastSeen, ip, ua }
const sessions = new Map();
(function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESS_PATH, "utf8"));
    const now = Date.now();
    for (const [tok, s] of Object.entries(raw || {})) {
      if (s && s.expiresAt > now && now - s.lastSeen < IDLE_TTL_MS) sessions.set(tok, s);
    }
  } catch (e) { /* first boot: no session file yet */ }
})();

let saveTimer = null;
function saveSessions() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(SESS_PATH, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
    } catch (e) { console.error("[auth] could not persist sessions:", e.message); }
  }, 1500);
}

function clientIp(req) {
  return String(req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "").slice(0, 64);
}

function parseCookies(req) {
  const out = {};
  const raw = String(req.headers.cookie || "");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function setSessionCookie(res, req, value, maxAgeSec) {
  const parts = [
    COOKIE + "=" + value,
    // The app lives under /legalos/ in production (nginx strips the prefix
    // before this server sees the path, but the BROWSER matches cookies against
    // the public URL). Scoped so no other dashboard on this origin receives it.
    "Path=" + (process.env.LEGALOS_COOKIE_PATH || "/legalos/"),
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + maxAgeSec,
  ];
  if (String(req.headers["x-forwarded-proto"] || "") === "https") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

// The session's live identity, or null. Sliding idle window: any authenticated
// touch extends it, throttled to one persisted write a minute.
function sessionFromReq(req) {
  const tok = parseCookies(req)[COOKIE];
  if (!tok) return null;
  const s = sessions.get(tok);
  if (!s) return null;
  const now = Date.now();
  if (now > s.expiresAt || now - s.lastSeen > IDLE_TTL_MS) {
    sessions.delete(tok);
    saveSessions();
    return null;
  }
  if (now - s.lastSeen > 60e3) { s.lastSeen = now; saveSessions(); }
  return s;
}

/* ---------------- lockout ---------------- */
const fails = new Map(); // "ip|email" -> { n, firstAt, lockedUntil }
function lockKey(req, email) { return clientIp(req) + "|" + String(email || "").toLowerCase(); }
function lockedFor(req, email) {
  const k = lockKey(req, email);
  const f = fails.get(k);
  if (!f) return 0;
  const now = Date.now();

  /* A PASSWORD RESET CLEARS THE LOCKOUT.
   *
   * Those failures were attempts against a password that no longer exists, so
   * holding them against the new one punishes the person for the admin's fix.
   * This is not hypothetical: a user was handed a stale password, retried it
   * until the lockout tripped, an administrator reset the password — and she
   * still could not sign in, now with a different error. The reset looked like
   * it had worked and had not.
   *
   * Only a reset that happened AFTER the failures started counts, so this can
   * never be used to wash away an attack in progress. */
  const acct = accountFor(email);
  const changedAt = acct && acct.updatedAt ? Date.parse(acct.updatedAt) : 0;
  if (changedAt && changedAt > f.firstAt) { fails.delete(k); return 0; }

  if (f.lockedUntil && now < f.lockedUntil) return Math.ceil((f.lockedUntil - now) / 60e3);
  if (now - f.firstAt > LOCK_WINDOW_MS) fails.delete(k);
  return 0;
}

/* Clear one account's lockout everywhere it is held (any source IP).
   Exported for an administrative unlock path; the ordinary remedy is simply to
   reset the password, which lockedFor() already treats as clearing the slate. */
function clearLockout(email) {
  const e = String(email || "").toLowerCase();
  let n = 0;
  for (const k of [...fails.keys()]) if (k.endsWith("|" + e)) { fails.delete(k); n++; }
  return n;
}
function recordFailure(req, email) {
  const k = lockKey(req, email);
  const now = Date.now();
  let f = fails.get(k);
  if (!f || now - f.firstAt > LOCK_WINDOW_MS) f = { n: 0, firstAt: now, lockedUntil: 0 };
  f.n += 1;
  if (f.n >= LOCK_AFTER) f.lockedUntil = now + LOCK_MS;
  fails.set(k, f);
  if (fails.size > 5000) fails.clear(); // memory guard; resets the slate, never grows unbounded
}

/* ---------------- the identity an account signs in AS ---------------- */
// Roster fields come from src/data.js at sign-in time (single source with the
// browser); the credential file only decides WHO may sign in and admin-ness.
function identityFor(account) {
  const email = String(account.email).toLowerCase();
  const roster = userByEmail(email);
  const admin = !!account.admin || isAdmin(email);
  const base = {
    id: roster ? roster.id : null,
    email,
    name: account.name || (roster && roster.name) || email.split("@")[0].replace(/[._]/g, " "),
    role: roster ? roster.role : admin ? "System Administrator" : "Requester",
    rbac: roster ? roster.rbac : admin ? "head" : "requester",
    legalTeam: roster ? (roster.legalTeam || null) : null,
    admin,
  };
  // Effective access from the permission engine — the single source the client
  // gate consults. Never throws the sign-in on a permissions hiccup.
  try { base.permissions = require("./permissions").effectiveFor(base); } catch (e) { base.permissions = null; }
  return base;
}

/* Where the Google client id comes from. An environment variable wins, so a
   deployment can set it without editing a file in the repo; otherwise the
   config file. Absent both, the button is simply not drawn. */
function googleConfig() {
  let fromFile = {};
  try { fromFile = (require("./config").load().auth || {}).google || {}; } catch (e) { fromFile = {}; }
  const clientId = String(process.env.LEGALOS_GOOGLE_CLIENT_ID || fromFile.clientId || "").trim();
  const domains = String(process.env.LEGALOS_GOOGLE_DOMAINS || (fromFile.domains || []).join(","))
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  /* An address the login page drops into the email box when the button cannot
     yet complete a real sign-in. It is a typing shortcut and nothing else — the
     password is still required and still checked here on the server. */
  const prefillEmail = String(fromFile.prefillEmail || "").trim().toLowerCase();
  return { enabled: !!clientId, clientId, domains, prefillEmail };
}

/* ---------------- route handlers ---------------- */
async function handle(req, res, route, json, readBody) {
  if (route === "auth/login") {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" }, req);
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      return json(res, 400, { error: "missing_fields", detail: "Enter both the email and the password." }, req);
    }

    const lockedMin = lockedFor(req, email);
    if (lockedMin) {
      return json(res, 429, { error: "locked", detail: "Too many failed attempts. Try again in about " + lockedMin + " minute" + (lockedMin === 1 ? "" : "s") + "." }, req);
    }

    const account = accountFor(email);
    const ok = account ? verifyPassword(password, account.hash) : (verifyPassword(password, DUMMY_HASH), false);
    if (!ok) {
      recordFailure(req, email);
      console.log("[auth] failed sign-in for", email, "from", clientIp(req));
      // One message for "no such account" and "wrong password" — telling an
      // attacker which emails exist is half their work done for them.
      return json(res, 401, { error: "bad_credentials", detail: "That email or password is not right." }, req);
    }

    fails.delete(lockKey(req, email));
    const who = identityFor(account);
    const now = Date.now();

    // Cap concurrent sessions per account — oldest goes first.
    const mine = [...sessions.entries()].filter(([, s]) => s.account.email === email)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    while (mine.length >= MAX_SESSIONS_PER_ACCOUNT) sessions.delete(mine.shift()[0]);

    const token = crypto.randomBytes(32).toString("base64url");
    const sess = { account: who, createdAt: now, expiresAt: now + ABS_TTL_MS, lastSeen: now, ip: clientIp(req), ua: String(req.headers["user-agent"] || "").slice(0, 200) };
    sessions.set(token, sess);
    saveSessions();
    setSessionCookie(res, req, token, Math.floor(ABS_TTL_MS / 1000));
    console.log("[auth] sign-in:", email, who.admin ? "(admin)" : "(" + who.rbac + ")", "from", sess.ip);
    return json(res, 200, { ok: true, account: who, session: { expiresAt: sess.expiresAt, idleMinutes: IDLE_TTL_MS / 60e3 } }, req);
  }

  /* ---- Sign in with Google ----
     Two questions, asked in order and never conflated:
       1. IS THIS REALLY THEM?  api/google-auth.js verifies the token against
          Google's published keys, our client id, and the expiry.
       2. MAY THEY USE LEGALOS?  Only the legal roster may. A verified Google
          identity that is not on it is refused — a real person, correctly
          identified, with no business here. Requesters use the portal.
     A refusal says which of the two failed, because "we could not verify you"
     and "you are not on the legal team" need different things done about them. */
  if (route === "auth/google") {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" }, req);
    const cfg = googleConfig();
    if (!cfg.enabled) {
      return json(res, 503, { error: "google_not_configured",
        detail: "Sign in with Google is not set up on this server." }, req);
    }
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const credential = String((body && body.credential) || "");
    if (!credential) return json(res, 400, { error: "missing_credential", detail: "No Google sign-in token was sent." }, req);

    let who2;
    try { who2 = await require("./google-auth").verifyIdToken(credential, cfg.clientId); }
    catch (e) {
      console.log("[auth] google verify failed:", e.message, "from", clientIp(req));
      return json(res, 401, { error: "google_unverified", detail: e.message }, req);
    }

    const email = who2.email;
    /* The workspace gate, where one is configured: a token from a personal
       gmail.com account is a valid Google identity and not a colleague. */
    if (cfg.domains.length) {
      const dom = email.split("@")[1] || "";
      if (!cfg.domains.includes(dom)) {
        console.log("[auth] google refused (domain):", email, "from", clientIp(req));
        return json(res, 403, { error: "domain_not_allowed",
          detail: "Sign in with a " + cfg.domains.join(" or ") + " account." }, req);
      }
    }

    /* THE LEGAL-TEAM GATE. The roster is the list of people who work in Legal;
       an account that is not on it gets the "Requester" identity, and a
       requester does not sign in here. */
    const roster = userByEmail(email);
    const admin = isAdmin(email);
    if (!roster && !admin) {
      console.log("[auth] google refused (not legal):", email, "from", clientIp(req));
      return json(res, 403, { error: "not_legal_team",
        detail: "LegalOS sign-in is limited to the Legal team. Your Google account was verified, but "
          + email + " is not on the legal roster." }, req);
    }

    const account = accountFor(email) || { email, name: who2.name || (roster && roster.name), admin };
    const who = identityFor(account);
    if (who.permissions && who.permissions.status === "inactive" && !who.admin) {
      return json(res, 403, { error: "deactivated", detail: "Your access has been deactivated." }, req);
    }

    const now = Date.now();
    const mine = [...sessions.entries()].filter(([, ss]) => ss.account.email === email)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    while (mine.length >= MAX_SESSIONS_PER_ACCOUNT) sessions.delete(mine.shift()[0]);

    const token = crypto.randomBytes(32).toString("base64url");
    const sess = { account: who, createdAt: now, expiresAt: now + ABS_TTL_MS, lastSeen: now,
      ip: clientIp(req), ua: String(req.headers["user-agent"] || "").slice(0, 200), via: "google" };
    sessions.set(token, sess);
    saveSessions();
    setSessionCookie(res, req, token, Math.floor(ABS_TTL_MS / 1000));
    console.log("[auth] google sign-in:", email, "(" + who.rbac + ") from", sess.ip);
    return json(res, 200, { ok: true, account: who,
      session: { expiresAt: sess.expiresAt, idleMinutes: IDLE_TTL_MS / 60e3 } }, req);
  }

  /* What the login page needs to decide whether to draw the Google button.
     The client id is public by design — it is in the button's own markup. */
  if (route === "auth/config") {
    const cfg = googleConfig();
    return json(res, 200, { google: { enabled: cfg.enabled, clientId: cfg.clientId || null,
      domains: cfg.domains, prefillEmail: cfg.prefillEmail || null } }, req);
  }

  if (route === "auth/logout") {
    if (req.method !== "POST") return json(res, 405, { error: "POST only" }, req);
    const tok = parseCookies(req)[COOKIE];
    if (tok && sessions.delete(tok)) saveSessions();
    setSessionCookie(res, req, "gone", 0);
    return json(res, 200, { ok: true }, req);
  }

  if (route === "auth/session") {
    const s = sessionFromReq(req);
    if (!s) return json(res, 401, { error: "no_session", detail: "Not signed in, or the session has expired." }, req);
    // Recompute effective access every revalidation so an admin's change reaches
    // a live session within one poll — no re-login or restart needed. An
    // account deactivated in the meantime is signed out here.
    try {
      const perms = require("./permissions").effectiveFor(s.account);
      s.account.permissions = perms;
      if (perms && perms.status === "inactive" && !s.account.admin) {
        sessions.delete(parseCookies(req)[COOKIE]); saveSessions();
        return json(res, 403, { error: "deactivated", detail: "Your access has been deactivated." }, req);
      }
    } catch (e) { /* keep prior perms */ }
    return json(res, 200, { ok: true, account: s.account, session: { expiresAt: s.expiresAt, idleMinutes: IDLE_TTL_MS / 60e3 } }, req);
  }

  return json(res, 404, { error: "unknown auth route" }, req);
}

module.exports = { handle, sessionFromReq, hashPassword, verifyPassword, identityFor, clearLockout };
