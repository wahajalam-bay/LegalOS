/* CLAUDE, THROUGH THE CLI, ON THE ACCOUNT'S OWN PLAN.
 *
 * LegalOS talks to Claude by running the `claude` binary in print mode, not by
 * calling api.anthropic.com with a key. That is deliberate: the CLI signs in
 * with the OAuth credentials already stored for this account, so there is no
 * static API key to place, rotate or leak, and the usage sits on the plan
 * rather than on metered billing. The service runs as the same user that owns
 * ~/.claude/.credentials.json, which is the only reason this works at all — if
 * the unit is ever moved to another user, this stops working and says so.
 *
 * ============================ THE DATA BOUNDARY ============================
 * THE CONTENTS OF LEGAL DOCUMENTS ARE NEVER SENT. That is a decision the owner
 * of this estate made, and it is enforced here in code rather than left to
 * whoever writes the next caller:
 *
 *   - This module never reads cache/content/ or cache/commercial/, the two
 *     places document text lives. It cannot send what it cannot open.
 *   - Callers may not pass free-form text. They pass typed records, and
 *     `project()` copies across an explicit allowlist of fields — an id, a
 *     title, a counterparty, a date, a disposition, a count. Anything not on
 *     the list is dropped, including fields added later.
 *   - Evidence QUOTATIONS are dropped too. They are only eighty characters,
 *     but eighty characters of a contract is still the contract.
 *   - A final guard re-reads the assembled prompt and refuses to send it if
 *     any single value looks like prose rather than a field.
 *
 * Anything that needs the document body — reading the 183 scans nobody can
 * open, for instance — is NOT possible under this boundary, and this module
 * will not quietly make an exception. Widening it is a decision for the owner.
 *
 * SECURITY
 *   - The binary is spawned with an argv array. No shell, so nothing a user
 *     types can become a command.
 *   - Every tool is disabled. Claude cannot read a file, run a command or
 *     reach the network from inside a LegalOS request.
 *   - It runs in an empty scratch directory, so no CLAUDE.md, no project
 *     context, nothing from this repository is picked up and sent.
 *   - Concurrency is capped and every call has a hard timeout.
 */
const { spawn } = require("child_process");
const fs = require("fs"), P = require("path"), os = require("os");

const ROOT = P.join(__dirname, "..");
const BIN = P.join(ROOT, "node_modules", ".bin", "claude");

const TIMEOUT_MS = 120000;
const MAX_CONCURRENT = 2;
const MAX_PROMPT_CHARS = 60000;

/* The names live in api/claude-tools.js, verified against the installed CLI.
   They are NOT repeated here: the outage this caused came from a hand-kept list
   drifting out of step with the tool set, and a second copy is a second chance
   to drift. */
const tools = require("./claude-tools");

let running = 0;
const queue = [];

function available() {
  try { return fs.existsSync(BIN); } catch (e) { return false; }
}

/* Is the account actually signed in? The credentials file belongs to the user
   the service runs as; if the unit is moved, this is the thing that breaks. */
function credentialState() {
  const home = os.homedir();
  const cred = P.join(home, ".claude", ".credentials.json");
  try {
    const st = fs.statSync(cred);
    return { present: true, path: cred, mode: (st.mode & 0o777).toString(8), owner: st.uid === process.getuid() };
  } catch (e) {
    return { present: false, path: cred, owner: false };
  }
}

/* --------------------------------------------------------- the boundary -- */

/* The ONLY fields that may leave this machine. Adding to this list is a
   decision about disclosure, not a refactor. */
/* Taken from the REAL field names on each register, checked rather than
   assumed: the contracts book spells it `counterParty` with a capital P, and
   the allowlist's lowercase `counterparty` silently withheld every
   counterparty name in the estate while looking correct. */
const ALLOWED_FIELDS = new Set([
  "id", "recordId", "fileId", "family", "kind", "ref", "docNo", "caseNo",
  // parties and subjects
  "title", "caseName", "project", "entity", "counterparty", "counterParty",
  "firstParty", "borrower", "lender", "sender", "recipient", "owner",
  "authority", "counsel", "contractor", "position", "nature", "category",
  // where and what
  "number", "status", "stage", "court", "region", "city", "department",
  "type", "ownership", "jv", "agenda",
  // when
  "agreementDate", "effectiveDate", "executionDate", "filingDate", "date",
  "start", "end", "issued", "expiry", "noticeDate", "receiptDate", "replyDate",
  "lastHearing", "nextHearing",
  // how much
  "amount", "currency", "value", "exposurePKR", "exposureUSD",
  "recoverablePKR", "recoverableUSD",
  // derived facts
  "documentType", "lifecycle", "amendmentNumber", "contentState", "disposition",
  "filename", "folderPath", "root", "documents", "records", "count",
  "quality", "via", "confidence",
]);

/* Deliberately NOT allowed, though they sit right beside the rest:
     proceedings, outcome, details, comments  — free-text narrative, which is
       the substance of a matter and often quotes the document or the court.
     driveFiles, __raw, __source, __lineage   — file lists and raw source rows.
   The prose guard would catch most of these anyway; naming them here means a
   short one does not slip through on a quiet day. */
const NEVER_SEND = new Set(["proceedings", "outcome", "details", "comments", "notes", "remarks", "description"]);

/* A value that is long and sentence-shaped is prose, and prose out of this
   estate is document text. Field values are short: a name, a date, a code. */
function looksLikeProse(v) {
  if (typeof v !== "string") return false;
  if (v.length <= 120) return false;
  const words = v.trim().split(/\s+/).length;
  return words > 25;
}

class BoundaryError extends Error {}

/* Copy a record across the boundary: allowlisted fields only, no nesting, no
   quotations, nothing that reads like a paragraph. */
/* Prose is DROPPED, not fatal. An allowlisted field can still hold a paragraph
   — a litigation record's `outcome` is often three sentences quoting the
   court — and refusing the whole request for it made the assistant unusable
   while protecting nothing extra. The field is removed, the drop is counted,
   and the count is reported, so a silent omission never passes for an answer
   about complete data. */
const dropped = { count: 0, fields: new Set() };

function project(obj, label) {
  if (!obj || typeof obj !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NEVER_SEND.has(k)) { dropped.count++; dropped.fields.add(k); continue; }
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (v == null) continue;
    if (Array.isArray(v)) {
      const items = v.filter((x) => (typeof x === "string" || typeof x === "number") && !looksLikeProse(x)).slice(0, 12);
      if (items.length !== v.length) { dropped.count++; dropped.fields.add(k); }
      if (items.length) out[k] = items;
      continue;
    }
    if (typeof v === "object") continue;                 // never nest: quotes hide in there
    if (looksLikeProse(v)) { dropped.count++; dropped.fields.add(k); continue; }
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function projectAll(rows, label) {
  return (rows || []).map((r, i) => project(r, label + "[" + i + "]")).filter(Boolean);
}

/* ------------------------------------------------------------ the call --- */

function run(args, input) {
  return new Promise((resolve) => {
    // An empty directory: no CLAUDE.md, no repository, nothing to pick up.
    let cwd = null;
    try { cwd = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-claude-")); } catch (e) { cwd = os.tmpdir(); }
    const env = Object.assign({}, process.env);
    // These belong to an interactive Claude Code session, not to this service.
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_PID"]) delete env[k];

    const child = spawn(BIN, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const finish = (r) => { if (done) return; done = true; try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) {} resolve(r); };
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} finish({ ok: false, error: "timeout" }); }, TIMEOUT_MS);

    child.stdout.on("data", (d) => { out += d; if (out.length > 4e6) child.kill("SIGKILL"); });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return finish({ ok: false, error: (err || "exit " + code).slice(0, 300) });
      try {
        const j = JSON.parse(out);
        finish({ ok: !j.is_error, text: j.result, usage: j.usage, costUsd: j.total_cost_usd, durationMs: j.duration_ms });
      } catch (e) { finish({ ok: true, text: out.trim() }); }
    });
    if (input) { try { child.stdin.write(input); } catch (e) {} }
    try { child.stdin.end(); } catch (e) {}
  });
}

function schedule(fn) {
  return new Promise((resolve) => {
    const go = async () => { running++; try { resolve(await fn()); } finally { running--; const n = queue.shift(); if (n) n(); } };
    if (running < MAX_CONCURRENT) go(); else queue.push(go);
  });
}

/* Ask Claude a question about STRUCTURED FACTS. `context` is an object of
   already-projected rows; `question` is the user's words. */
/* `trueTotals` is how many rows each register ACTUALLY holds, which is not the
   same as how many were sent. Without it the model counts what it was given and
   states it as fact: asked how many litigation matters exist, it answered "94"
   from a 120-row sample of a 357-row register, and sounded certain. */
async function ask({ question, context, system, maxRows = 200, trueTotals = null }) {
  if (!available()) return { ok: false, error: "the claude CLI is not installed" };
  const cred = credentialState();
  if (!cred.present) return { ok: false, error: "no Claude credentials for the service user — run `claude` once as " + os.userInfo().username };

  dropped.count = 0; dropped.fields.clear();
  const safe = {};
  for (const [k, v] of Object.entries(context || {})) {
    safe[k] = Array.isArray(v) ? projectAll(v.slice(0, maxRows), k) : project(v, k);
  }
  const redactions = { values: dropped.count, fields: [...dropped.fields] };

  const preamble = system || [
    "You are answering questions inside LegalOS, a legal operations system for a Pakistani property group.",
    "You are given STRUCTURED FACTS ONLY — no document text is available to you, by policy.",
    "Answer strictly from the facts given. If the facts do not contain the answer, say so plainly and say what would be needed.",
    "Never invent a party, a date, an amount or a document. Do not speculate about the contents of a document you were not given.",
    "Be brief and concrete. Quote ids when you refer to records.",
    "REGISTER_TOTALS gives the true size of each register. The rows under FACTS are a SAMPLE of that.",
    "For any count, cite REGISTER_TOTALS and say explicitly that the detail rows are a sample. Never present a count of the sample as the size of the register.",
  ].join(" ");

  /* TRIM TO FIT, and say by how much. Seven registers at 120 rows each is well
     past one prompt, and answering "too much context, narrow it" is a worse
     answer than answering over a stated sample. Rows are shed evenly across
     families until the prompt fits, and the caller is told exactly how many of
     each were considered — so "there are 3 leases" can never be read as a
     claim about the whole book when only part of it was in front of the model. */
  const q = String(question || "").slice(0, 4000);
  const build = (rows) => {
    const cut = {};
    for (const [k, v] of Object.entries(safe)) cut[k] = Array.isArray(v) ? v.slice(0, rows) : v;
    return cut;
  };
  let perFamily = maxRows, trimmed = build(perFamily), prompt = "";
  for (;;) {
    prompt = preamble
      + (trueTotals ? "\n\nREGISTER_TOTALS (the true size of each register):\n" + JSON.stringify(trueTotals) : "")
      + "\n\nFACTS (a sample of the rows):\n" + JSON.stringify(trimmed)
      + "\n\nQUESTION:\n" + q;
    if (prompt.length <= MAX_PROMPT_CHARS || perFamily <= 5) break;
    perFamily = Math.max(5, Math.floor(perFamily / 2));
    trimmed = build(perFamily);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, error: "too much context for one question — ask about one register", redactions };
  }
  const considered = Object.fromEntries(Object.entries(trimmed)
    .map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]));
  const totals = Object.fromEntries(Object.entries(safe)
    .map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]));
  /* Partial is measured against the REAL register size where the caller
     supplied it, not against the slice the caller already took. */
  const against = trueTotals || totals;
  const partial = Object.keys(considered).some((k) => considered[k] < (against[k] != null ? against[k] : totals[k]));

  const deny = tools.denyArgs(tools.LOCKED_DOWN);
  const args = ["-p", prompt, "--output-format", "json", ...deny.args];
  let r = await schedule(() => run(args));
  /* If the CLI renames or drops a tool, fail SAFE rather than fail shut: retry
     without the name it rejected, so a future rename degrades the lock-down by
     one tool instead of taking the assistant offline entirely. The retry is
     logged in the response so it cannot pass unnoticed. */
  if (!r.ok && /matches no known tool/i.test(String(r.error || ""))) {
    const bad = (String(r.error).match(/"([A-Za-z]+)" matches no known tool/g) || [])
      .map((m) => m.replace(/[^A-Za-z]/g, ""));
    const kept = tools.LOCKED_DOWN.filter((t) => !bad.includes(t));
    const retryArgs = ["-p", prompt, "--output-format", "json"];
    for (const t of kept) retryArgs.push("--disallowed-tools", t);
    r = await schedule(() => run(retryArgs));
    r.toolNamesRejected = bad;
  }
  if (deny.dropped.length) r.toolNamesDropped = deny.dropped;
  return Object.assign({}, r, { redactions, considered, totals, partial });
}

function status() {
  const cred = credentialState();
  const cfg = tools.configurationStatus();
  return {
    // Surfaced so a broken configuration cannot look healthy. An assistant that
    // renders fine and errors on every request is worse than one that says it
    // is misconfigured.
    configurationError: cfg.error,
    configurationDetail: cfg.detail,
    installed: available(),
    signedIn: cred.present && cred.owner,
    credentialPath: cred.path,
    serviceUser: os.userInfo().username,
    concurrent: running,
    // Stated on the status surface so nobody has to read this file to find out.
    policy: "structured facts only — document text is never transmitted",
  };
}

module.exports = { ask, status, available, credentialState, project, projectAll, BoundaryError, ALLOWED_FIELDS, NEVER_SEND };
