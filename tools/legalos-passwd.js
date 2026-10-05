#!/usr/bin/env node
// Credential management for LegalOS sign-in (config/users.json).
//
//   node tools/legalos-passwd.js seed                 one account per roster member + the admin;
//                                                     writes config/INITIAL-CREDENTIALS.md (skips accounts that exist)
//   node tools/legalos-passwd.js list                 accounts on file
//   node tools/legalos-passwd.js set <email> [opts]   create account / reset password (prints the new password ONCE)
//        --admin            grant admin (full access, View-As switcher)
//        --name "Full Name" display name for non-roster accounts
//        --password "..."   use this password instead of generating one
//   node tools/legalos-passwd.js sync                 re-label handout rows that no longer work
//   node tools/legalos-passwd.js revoke <email>       disable the account and kill its sessions
//   node tools/legalos-passwd.js sessions             live sessions (email, age, last seen, ip)
//
// Passwords are never stored — only scrypt hashes. The initial-credentials file
// is for handing out once; delete it after distribution.
const fs = require("fs");
const path = require("path");
const { hashPassword, verifyPassword } = require("../api/auth");
const { listRoster } = require("../api/identity");

const ROOT = path.join(__dirname, "..");
const USERS_PATH = path.join(ROOT, "config", "users.json");
const SESS_PATH = path.join(ROOT, "config", ".sessions.json");
const CRED_PATH = path.join(ROOT, "config", "INITIAL-CREDENTIALS.md");

const ADMIN = { email: "muhammad.ashhad@bayut.sa", name: "Muhammad Ashhad", admin: true };

// Word-built passwords: readable over a call, typeable on a phone, and with the
// scrypt hashing + login lockout behind them, strong enough for an internal
// tool that also sits behind Cloudflare Access. ~31 bits from words + digits.
const WORDS = ("amber anchor apex aspen atlas badge basil beacon birch bloom bolt breeze bronze cedar chart cliff cobalt comet coral crane crest " +
  "dawn delta drift dune ember falcon fern flint forge frost gale garnet glade grove harbor hazel indigo iris ivory jade juniper " +
  "keel kite lagoon lark ledge lilac linen lotus lumen maple marble meadow mesa mint moss north oasis ochre onyx opal orchid " +
  "otter palm pearl pine plume prism quarry quill raven reef ridge river rowan saffron sage salt sierra slate sonnet spark spruce " +
  "summit swift tamar teal thorn tide topaz trail tulip umber vale velvet vista walnut willow winter wren zephyr zenith")
  .split(/\s+/).filter((w) => /^[a-z]+$/.test(w));
const cap = (w) => w[0].toUpperCase() + w.slice(1);
function generatePassword(words = 3) {
  const crypto = require("crypto");
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  const chosen = [];
  while (chosen.length < words) {
    const w = pick();
    if (!chosen.includes(w)) chosen.push(w);
  }
  return chosen.map(cap).join("-") + "-" + String(crypto.randomInt(10, 100));
}

function loadFile() {
  try { return JSON.parse(fs.readFileSync(USERS_PATH, "utf8")); }
  catch (e) { return { accounts: [] }; }
}
function saveFile(data) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

function upsert(data, email, fields) {
  const e = email.trim().toLowerCase();
  let a = data.accounts.find((x) => String(x.email).toLowerCase() === e);
  if (!a) { a = { email: e, createdAt: new Date().toISOString() }; data.accounts.push(a); }
  Object.assign(a, fields, { updatedAt: new Date().toISOString() });
  delete a.disabled;
  return a;
}

/* Keep config/INITIAL-CREDENTIALS.md in step with reality.
 *
 * This is the bug that locked a real person out. `seed` wrote that file on day
 * one; `set` then rotated seven passwords over the following days and NEVER
 * touched it. The file went on listing day-one passwords with nothing to say it
 * was lying, so the obvious thing to do -- open the handout list, read out the
 * password -- produced "That email or password is not right", for a live user,
 * with the app working perfectly.
 *
 * A record that can silently disagree with the system it describes is worse
 * than no record. Every rotation now rewrites that account's row. */
function recordCredential(email, password, extra) {
  const e = String(email).toLowerCase();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const roster = listRoster();
  const who = roster.find((u) => String(u.email || "").toLowerCase() === e) || {};
  const name = (extra && extra.name) || who.name || e.split("@")[0];
  const role = who.role || (extra && extra.admin ? "System Administrator (admin)" : "—");
  const row = `| ${name} | ${e} | \`${password}\` | ${role} | ${stamp} |`;

  const HEAD = [
    "# LegalOS — sign-in credentials",
    "",
    "Hand each line to its owner, then DELETE THIS FILE.",
    "Rotate any time: `node tools/legalos-passwd.js set <email>` — this file is rewritten on every rotation.",
    "Check it still matches reality: `node tools/legalos-passwd.js list`.",
    "",
    "| Name | Email | Password | Role | Set |",
    "|---|---|---|---|---|",
  ];

  let rows = [];
  if (fs.existsSync(CRED_PATH)) {
    const existing = fs.readFileSync(CRED_PATH, "utf8").split("\n");
    rows = existing.filter((l) => /^\|/.test(l) && !/^\|\s*(Name|-+)/.test(l) && !/^\|---/.test(l));
    // Rows written before this file carried a "Set" column get one, so the
    // table stays rectangular instead of quietly misaligning.
    rows = rows.map((l) => (l.split("|").length === 6 ? l.replace(/\s*\|\s*$/, " | (before rotation tracking) |") : l));
  }
  rows = rows.filter((l) => !new RegExp("\\|\\s*" + e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\|", "i").test(l));
  rows.push(row);
  fs.writeFileSync(CRED_PATH, HEAD.concat(rows, [""]).join("\n"), { mode: 0o600 });
}

const [, , cmd, ...args] = process.argv;
const flag = (name) => {
  const i = args.indexOf("--" + name);
  return i === -1 ? null : args[i + 1] || true;
};

if (cmd === "seed") {
  const data = loadFile();
  const made = [];
  const roster = listRoster().filter((u) => u.email);
  for (const u of roster) {
    if (data.accounts.some((a) => String(a.email).toLowerCase() === u.email.toLowerCase() && !a.disabled)) continue;
    const pw = generatePassword(3);
    upsert(data, u.email, { hash: hashPassword(pw) });
    made.push({ email: u.email, name: u.name, role: u.role, password: pw });
  }
  if (!data.accounts.some((a) => String(a.email).toLowerCase() === ADMIN.email && !a.disabled)) {
    const pw = generatePassword(4);
    upsert(data, ADMIN.email, { hash: hashPassword(pw), admin: true, name: ADMIN.name });
    made.push({ email: ADMIN.email, name: ADMIN.name, role: "System Administrator (admin)", password: pw });
  }
  saveFile(data);
  if (!made.length) { console.log("Nothing to do — every account already exists."); process.exit(0); }
  const lines = [
    "# LegalOS — initial sign-in credentials",
    "",
    "Generated " + new Date().toISOString().slice(0, 16).replace("T", " ") + ". Hand each line to its owner, then DELETE THIS FILE.",
    "Passwords can be rotated any time: `node tools/legalos-passwd.js set <email>`.",
    "",
    "| Name | Email | Password | Role |",
    "|---|---|---|---|",
    ...made.map((m) => `| ${m.name} | ${m.email} | \`${m.password}\` | ${m.role} |`),
    "",
  ];
  fs.writeFileSync(CRED_PATH, lines.join("\n"), { mode: 0o600 });
  console.log("Created " + made.length + " account(s).");
  for (const m of made) console.log("  " + m.email.padEnd(32) + " " + m.password);
  console.log("\nPlaintext list written to config/INITIAL-CREDENTIALS.md — delete it after handing out.");

} else if (cmd === "list") {
  const data = loadFile();
  if (!data.accounts.length) return console.log("No accounts. Run: node tools/legalos-passwd.js seed");
  // Read the handout file back and CHECK it, rather than trusting it. A stale
  // row is invisible otherwise -- it looks exactly like a good one.
  const handout = new Map();
  if (fs.existsSync(CRED_PATH)) {
    for (const line of fs.readFileSync(CRED_PATH, "utf8").split("\n")) {
      const m = line.match(/^\|[^|]*\|\s*([^|\s]+@[^|\s]+)\s*\|\s*`([^`]+)`/);
      if (m) handout.set(m[1].toLowerCase(), m[2]);
    }
  }
  let stale = 0;
  for (const a of data.accounts) {
    const e = String(a.email).toLowerCase();
    const listed = handout.get(e);
    let note = "";
    if (listed == null) note = "  ·  not in INITIAL-CREDENTIALS.md";
    else if (verifyPassword(listed, a.hash)) note = "  ·  handout password OK";
    else { note = "  ·  *** HANDOUT PASSWORD IS STALE — rotate or re-issue ***"; stale++; }
    console.log((a.disabled ? "[disabled] " : "") + a.email + (a.admin ? "  (admin)" : "") + (a.name ? "  — " + a.name : "") + note);
  }
  if (stale) {
    console.log("\n" + stale + " account(s) have a handout password that no longer works.");
    console.log("Anyone reading config/INITIAL-CREDENTIALS.md for those will be told the wrong thing.");
    console.log("Fix each with: node tools/legalos-passwd.js set <email>");
  }

} else if (cmd === "set") {
  const email = args.find((a) => !a.startsWith("--") && a.includes("@"));
  if (!email) { console.error("Usage: set <email> [--admin] [--name \"X\"] [--password \"Y\"]"); process.exit(1); }
  const pw = typeof flag("password") === "string" ? flag("password") : generatePassword(3);
  const data = loadFile();
  const fields = { hash: hashPassword(pw) };
  if (flag("admin")) fields.admin = true;
  if (typeof flag("name") === "string") fields.name = flag("name");
  upsert(data, email, fields);
  saveFile(data);
  recordCredential(email, pw, fields);
  console.log("Password set for " + email.toLowerCase() + (fields.admin ? " (admin)" : "") + ":");
  console.log("  " + pw);
  console.log("(stored only as a hash; the handout row in config/INITIAL-CREDENTIALS.md has been updated)");

} else if (cmd === "sync") {
  /* Make the handout file stop lying, without disturbing anybody.
   *
   * A row whose password no longer works is REPLACED by a label saying so —
   * not by a new password, because rotating a credential somebody may already
   * be using is a disruption nobody asked for. An account with no row at all
   * gets one that says it was never recorded. Afterwards the file contains
   * only statements that are true. */
  const data = loadFile();
  const lines = fs.existsSync(CRED_PATH) ? fs.readFileSync(CRED_PATH, "utf8").split("\n") : [];
  const listed = new Map();
  for (const line of lines) {
    const m = line.match(/^\|\s*([^|]*?)\s*\|\s*([^|\s]+@[^|\s]+)\s*\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|/);
    if (m) listed.set(m[2].toLowerCase(), { name: m[1], password: m[3], role: m[4] });
  }
  const roster = listRoster();
  const rows = [];
  let fixed = 0, missing = 0;
  for (const a of data.accounts) {
    const e = String(a.email).toLowerCase();
    const who = roster.find((u) => String(u.email || "").toLowerCase() === e) || {};
    const rec = listed.get(e);
    const name = (rec && rec.name) || a.name || who.name || e.split("@")[0];
    const role = (rec && rec.role) || who.role || (a.admin ? "System Administrator (admin)" : "—");
    const set = String(a.updatedAt || a.createdAt || "").slice(0, 16).replace("T", " ");
    if (rec && verifyPassword(rec.password, a.hash)) {
      rows.push(`| ${name} | ${e} | \`${rec.password}\` | ${role} | ${set} |`);
    } else if (rec) {
      rows.push(`| ${name} | ${e} | **ROTATED — this password no longer works** | ${role} | ${set} |`);
      fixed++;
    } else {
      rows.push(`| ${name} | ${e} | **never recorded here** | ${role} | ${set} |`);
      missing++;
    }
  }
  const HEAD = [
    "# LegalOS — sign-in credentials",
    "",
    "Hand each line to its owner, then DELETE THIS FILE.",
    "Rotate: `node tools/legalos-passwd.js set <email>` — this file is rewritten on every rotation.",
    "Check it still matches reality: `node tools/legalos-passwd.js list`.",
    "Re-label rows that have gone stale: `node tools/legalos-passwd.js sync`.",
    "",
    "| Name | Email | Password | Role | Set |",
    "|---|---|---|---|---|",
  ];
  fs.writeFileSync(CRED_PATH, HEAD.concat(rows, [""]).join("\n"), { mode: 0o600 });
  console.log(`Rewrote ${rows.length} row(s): ${fixed} re-labelled as rotated, ${missing} marked never-recorded.`);
  if (fixed || missing) console.log("Those accounts need a fresh password issued: node tools/legalos-passwd.js set <email>");

} else if (cmd === "revoke") {
  const email = (args[0] || "").trim().toLowerCase();
  if (!email) { console.error("Usage: revoke <email>"); process.exit(1); }
  const data = loadFile();
  const a = data.accounts.find((x) => String(x.email).toLowerCase() === email);
  if (!a) { console.error("No such account."); process.exit(1); }
  a.disabled = true;
  a.updatedAt = new Date().toISOString();
  saveFile(data);
  // Kill live sessions too — revocation that waits for expiry is not revocation.
  try {
    const sess = JSON.parse(fs.readFileSync(SESS_PATH, "utf8"));
    let n = 0;
    for (const [tok, s] of Object.entries(sess)) {
      if (s && s.account && String(s.account.email).toLowerCase() === email) { delete sess[tok]; n++; }
    }
    fs.writeFileSync(SESS_PATH, JSON.stringify(sess), { mode: 0o600 });
    console.log("Disabled " + email + " and removed " + n + " live session(s).");
    if (n) console.log("NOTE: the running server holds sessions in memory — restart legalos to force them out immediately.");
  } catch (e) { console.log("Disabled " + email + " (no session file)."); }

} else if (cmd === "sessions") {
  try {
    const sess = JSON.parse(fs.readFileSync(SESS_PATH, "utf8"));
    const rows = Object.values(sess).sort((a, b) => b.lastSeen - a.lastSeen);
    if (!rows.length) return console.log("No persisted sessions.");
    const ago = (t) => Math.round((Date.now() - t) / 60e3) + "m ago";
    for (const s of rows) console.log(s.account.email.padEnd(32) + " signed in " + ago(s.createdAt) + ", last seen " + ago(s.lastSeen) + ", from " + (s.ip || "?"));
  } catch (e) { console.log("No persisted sessions."); }

} else {
  console.log("Commands: seed | list | set <email> [--admin|--name|--password] | revoke <email> | sessions");
  process.exit(cmd ? 1 : 0);
}
