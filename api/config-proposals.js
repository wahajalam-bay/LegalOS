// Configuration proposals, server-held.
//
// PRD §2 separates who SUGGESTS a configuration change from who DECIDES it: a
// Lead proposes, the Director publishes. That only means anything if the
// proposal actually reaches the Director — and it did not. Proposals lived in
// `configProposals` inside the proposer's own localStorage, so a Lead proposing
// on their laptop produced a record that existed for exactly one person, on one
// machine, in one browser profile. The Director never saw it. The notification
// raised alongside it was written to the same private store, so that did not
// travel either.
//
// This is the same void the requester portal had before api/requests.js, and it
// is fixed the same way: the client composes the proposal, the SERVER stamps who
// raised it from the verified session, and the server decides who may publish.
// Authority is enforced here, not in the browser — a Lead posting a "publish"
// directly is refused exactly as the hidden button would have refused them.
const fs = require("fs");
const path = require("path");
const { principalFor } = require("./identity");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "config-proposals.json");
const MAX_RECORDS = 500;
const MAX_RECORD_BYTES = 64 * 1024;

let cache = null;

function read() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")).proposals || []; }
  catch (e) { cache = []; }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    // Atomic: a half-written file would lose every proposal on the next read.
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ proposals: cache }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}

/* Roles, from the same table the client reads (src/org.js):
     lead -> config: "propose"      may raise a proposal
     head -> config: true           may publish or reject one              */
function authority(email) {
  const me = principalFor(email);
  const rbac = (me && me.rbac) || "";
  return {
    id: (me && me.id) || null,
    name: (me && me.name) || email || "unknown",
    rbac,
    mayPropose: rbac === "lead" || rbac === "head",
    mayDecide: rbac === "head",
  };
}

function list(email) {
  // Every legal principal may SEE the proposal queue — a proposal nobody can
  // see is the bug this module exists to fix. Deciding is separately gated.
  const me = principalFor(email);
  if (!me || !me.known) return { error: "forbidden" };
  return { proposals: read() };
}

function create(payload, email) {
  const who = authority(email);
  if (!who.mayPropose) return { error: "forbidden", detail: "Proposing a configuration change needs Lead authority." };
  if (!payload || !payload.kind || !payload.summary) return { error: "a proposal needs a kind and a summary" };

  const l = read();
  const id = "CP-" + String(l.length + 1).padStart(3, "0") + "-" + Date.now().toString(36).slice(-4).toUpperCase();
  const rec = {
    id,
    kind: String(payload.kind).slice(0, 60),
    summary: String(payload.summary).slice(0, 300),
    detail: payload.detail || null,
    // Server-owned. A client cannot claim someone else raised this.
    by: who.id,
    byName: who.name,
    byEmail: email || null,
    at: new Date().toISOString(),
    status: "proposed",
  };
  if (Buffer.byteLength(JSON.stringify(rec), "utf8") > MAX_RECORD_BYTES) return { error: "proposal is too large" };

  l.unshift(rec);
  if (l.length > MAX_RECORDS) l.length = MAX_RECORDS;
  if (!write()) return { error: "could not save the proposal" };
  return { ok: true, proposal: rec };
}

/* Publish or reject. The decision is the Director's alone, and the server says
   so — the UI hiding the button is a convenience, never the control. */
function decide(id, decision, email) {
  const who = authority(email);
  if (!who.mayDecide) return { error: "forbidden", detail: "Only the Director may publish or reject a configuration change." };
  const d = String(decision || "").toLowerCase();
  if (d !== "published" && d !== "rejected") return { error: "decision must be published or rejected" };

  const l = read();
  const p = l.find((x) => x.id === id);
  if (!p) return { error: "not_found" };
  if (p.status !== "proposed") return { error: "already_decided", detail: `This proposal is already ${p.status}.` };

  p.status = d;
  p.decidedBy = who.id;
  p.decidedByName = who.name;
  p.decidedAt = new Date().toISOString();
  if (!write()) return { error: "could not record the decision" };
  return { ok: true, proposal: p };
}

module.exports = { list, create, decide };
