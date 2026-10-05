// Notifications, server-held.
//
// notifyUser() wrote into the browser's own state and nowhere else. So when a
// Lead approved a request, the "your request was approved" notification was
// written into the LEAD's browser, addressed to the paralegal who asked — and
// the paralegal's browser never saw it. The same was true of every other
// notification the system raises: request received, we need something from you,
// delivered, escalated, config change proposed. Each one was addressed to
// somebody and delivered to nobody.
//
// Third instance of the same void in this codebase (requests and configuration
// proposals were the others), fixed the same way: the server holds them, the
// SERVER decides who may read one, and a client can only read what is addressed
// to it.
const fs = require("fs");
const path = require("path");
const { principalFor } = require("./identity");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "notifications.json");
const MAX_RECORDS = 5000;
const MAX_PER_CALL = 50;

let cache = null;

function read() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")).notifications || []; }
  catch (e) { cache = []; }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ notifications: cache }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}

/* What this caller may read: what is addressed to THEM.
   Identity is the verified session's roster id — never a query parameter, or
   anyone could read anyone's queue by guessing an id. */
function list(email) {
  const me = principalFor(email);
  if (!me || !me.known || !me.id) return { notifications: [] };
  return { notifications: read().filter((n) => n.forUserId === me.id) };
}

/* Raise notifications. The client composes them (it knows the domain event);
   the server records who actually raised them. A notification addressed to
   nobody is dropped rather than stored. */
function create(payload, email) {
  const me = principalFor(email);
  if (!me || !me.known) return { error: "forbidden" };

  const incoming = Array.isArray(payload && payload.notifications) ? payload.notifications : [];
  if (!incoming.length) return { error: "nothing to raise" };
  if (incoming.length > MAX_PER_CALL) return { error: "too many notifications in one call" };

  const l = read();
  const now = new Date().toISOString();
  const made = [];
  const known = new Set(l.map((n) => n.id));
  for (const n of incoming) {
    if (!n || !n.forUserId || !n.title) continue;
    // Deterministic ids let the same event be raised twice without duplicating,
    // which matters because the client also keeps its own optimistic copy.
    const id = String(n.id || `${n.forUserId}-${n.kind || "note"}-${n.ref || ""}-${now}`);
    if (known.has(id)) continue;
    known.add(id);
    const rec = {
      id,
      forUserId: String(n.forUserId).slice(0, 40),
      title: String(n.title).slice(0, 300),
      body: String(n.body || "").slice(0, 1000),
      tone: String(n.tone || "blue").slice(0, 20),
      icon: String(n.icon || "bell").slice(0, 30),
      to: n.to ? String(n.to).slice(0, 200) : null,
      ref: n.ref ? String(n.ref).slice(0, 60) : null,
      kind: n.kind ? String(n.kind).slice(0, 40) : null,
      unread: true,
      // Server-owned: who raised it, and when it actually arrived.
      raisedBy: me.id || null,
      raisedByName: me.name || email || null,
      at: now,
    };
    l.unshift(rec);
    made.push(rec);
  }
  if (l.length > MAX_RECORDS) l.length = MAX_RECORDS;
  if (!made.length) return { error: "no addressable notification in the payload" };
  if (!write()) return { error: "could not save" };
  return { ok: true, created: made.length, notifications: made };
}

/* Mark everything addressed to this caller as read. A caller can only ever
   change the state of their own queue. */
function markRead(email) {
  const me = principalFor(email);
  if (!me || !me.known || !me.id) return { error: "forbidden" };
  let n = 0;
  for (const rec of read()) if (rec.forUserId === me.id && rec.unread) { rec.unread = false; n++; }
  if (n && !write()) return { error: "could not save" };
  return { ok: true, marked: n };
}

module.exports = { list, create, markRead };
