/* READING A DOCUMENT WITH CLAUDE — the gated exception.
 *
 * api/claude-cli.js sends structured facts and never a document body. This
 * module is the deliberate, narrow exception: it hands ONE document to Claude
 * so the things nothing else on this server can read — the 183 scans with no
 * text layer, the legacy .doc files — can finally be identified.
 *
 * Reading a scanned PDF means transmitting that PDF. There is no way around it
 * and this file does not pretend otherwise. So it is gated:
 *
 *   NOTHING IS SENT UNLESS ITS FOLDER IS ON THE ALLOWLIST.
 *   config/claude-reader.json, `allow: []`, empty by default. An empty list
 *   means this module transmits nothing at all, which is the state it ships in.
 *   Folders are added by a person who is entitled to decide that, not by code
 *   that found it convenient.
 *
 * HOW, given we use the CLI rather than the API. The document is downloaded to
 * a temporary directory of its own, Claude is given the Read tool scoped to
 * THAT DIRECTORY ONLY via --add-dir, and every other tool stays off. So Claude
 * can read the one file it was asked about and nothing else on this machine —
 * not the repository, not the caches, not another matter's papers. The
 * directory is destroyed when the call returns, whatever the outcome.
 *
 * WHAT COMES BACK is structured facts — type, parties, dates, project, parent
 * agreement — and those are all that is stored. The document's text is not
 * written to the cache, the logs or any audit artefact.
 */
const { spawn } = require("child_process");
const fs = require("fs"), P = require("path"), os = require("os");
const { load: loadConfig, ROOT } = require("./config");
const drive = require("./drive");
const { driveRaw } = require("./google");

const CONFIG = P.join(ROOT, "config", "claude-reader.json");
const BIN = P.join(ROOT, "node_modules", ".bin", "claude");
const OUT = P.join(ROOT, "cache", "claude-read.json");

const TIMEOUT_MS = 180000;
/* 150MB. The 30MB cap was about transfer cost, but on the vision path the
   document is never sent whole — its PAGES are rendered locally and only those
   images go — so a large scanned bundle is exactly what is worth reading, not
   skipping. A fully executed shareholder agreement was being refused at 31MB. */
const MAX_BYTES = 150 * 1024 * 1024;
const CONCURRENCY = 1;                   // one at a time: this is the sensitive path

function config() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    return { allow: Array.isArray(c.allow) ? c.allow : [], enabled: c.enabled !== false, note: c.note || "" };
  } catch (e) {
    return { allow: [], enabled: false, note: "no config/claude-reader.json — nothing may be sent" };
  }
}

/* A folder is allowed only by an EXPLICIT prefix match against the configured
   list. No wildcards, no "starts with Commercial". If someone wants a whole
   root they can say so by naming the root. */
function allowedFolder(folderPath, cfg) {
  const p = String(folderPath || "");
  return (cfg.allow || []).some((a) => a && p.startsWith(String(a)));
}

function maySend(file, cfg) {
  if (!cfg.enabled) return { ok: false, why: "document reading is disabled in config/claude-reader.json" };
  if (!cfg.allow.length) return { ok: false, why: "no folder is allowlisted — nothing may be transmitted" };
  if (!allowedFolder(file.folderPath, cfg)) return { ok: false, why: "this document's folder is not allowlisted" };
  if ((Number(file.size) || 0) > MAX_BYTES) return { ok: false, why: "larger than the " + Math.round(MAX_BYTES / 1e6) + "MB limit" };
  return { ok: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(id, attempt = 0) {
  const res = await driveRaw("/files/" + id + "?alt=media&supportsAllDrives=true");
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    if (attempt >= 4) return { error: "HTTP " + res.status };
    await sleep(1500 * Math.pow(2, attempt));
    return fetchBytes(id, attempt + 1);
  }
  if (!res.ok) return { error: "HTTP " + res.status };
  return { buf: Buffer.from(await res.arrayBuffer()) };
}

const ASK = [
  "Read the single document in this directory and identify it.",
  "Reply with ONLY a JSON object, no prose, using exactly these keys:",
  '{"documentType":"","lifecycle":"","parties":[],"entity":"","project":"",',
  '"agreementDate":"","effectiveDate":"","parentAgreement":"","amendmentNumber":null,',
  '"referenceNumbers":[],"summary":"","confidence":"HIGH|MEDIUM|LOW","unreadable":false}',
  "documentType is one of: SALE_DEED, PPA, LEASE, SERVICE, CONSTRUCTION, LOAN, NDA, MOU, JV, POA,",
  "LAND_RECORD, APPROVAL, RESOLUTION, SECP_FILING, LITIGATION, NOTICE, TEMPLATE, OTHER.",
  "lifecycle is one of: ORIGINAL, AMENDMENT, ADDENDUM, EXTENSION, RENEWAL, NOVATION, TERMINATION, SUPPLEMENT, ANNEXURE, SCHEDULE, UNKNOWN.",
  "summary must be at most 25 words and must describe WHAT THE DOCUMENT IS, never quote its terms.",
  "Use only what the document actually says. Leave a field empty rather than guessing.",
  "If the document cannot be read (a blank or illegible scan), set unreadable to true and leave the rest empty.",
].join(" ");

let running = 0;
function runClaude(dir) {
  return new Promise((resolve) => {
    const args = ["-p", ASK, "--output-format", "json", "--add-dir", dir,
      // Read only, and only inside the directory holding this one document.
      "--allowed-tools", "Read",
      "--disallowed-tools", "Bash", "--disallowed-tools", "Write", "--disallowed-tools", "Edit",
      "--disallowed-tools", "WebFetch", "--disallowed-tools", "WebSearch", "--disallowed-tools", "Task",
      "--disallowed-tools", "Glob", "--disallowed-tools", "Grep"];
    const env = Object.assign({}, process.env);
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_PID"]) delete env[k];
    const child = spawn(BIN, args, { cwd: dir, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} finish({ ok: false, error: "timeout" }); }, TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return finish({ ok: false, error: (err || "exit " + code).slice(0, 200) });
      try {
        const j = JSON.parse(out);
        finish({ ok: !j.is_error, text: j.result, usage: j.usage, costUsd: j.total_cost_usd });
      } catch (e) { finish({ ok: false, error: "unparseable CLI output" }); }
    });
    try { child.stdin.end(); } catch (e) {}
  });
}

/* Claude is asked for JSON and usually returns exactly that, but a fenced block
   or a stray sentence should not lose the whole read. */
function parseFacts(text) {
  const s = String(text || "");
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

async function readDocument(fileId) {
  const cfg = config();
  const file = drive.fileById(fileId);
  if (!file) return { ok: false, error: "not in the Drive index" };
  const gate = maySend(file, cfg);
  if (!gate.ok) return { ok: false, error: gate.why, gated: true };
  if (!fs.existsSync(BIN)) return { ok: false, error: "the claude CLI is not installed" };

  while (running >= CONCURRENCY) await sleep(400);
  running++;
  let dir = null;
  try {
    const got = await fetchBytes(fileId);
    if (got.error) return { ok: false, error: got.error };
    dir = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-read-"));
    const ext = (file.name.match(/\.[a-z0-9]{2,5}$/i) || [".pdf"])[0];
    // A neutral filename: the real one often states the answer, and the point
    // is to read the document rather than its label.
    fs.writeFileSync(P.join(dir, "document" + ext), got.buf);
    const r = await runClaude(dir);
    if (!r.ok) return { ok: false, error: r.error };
    const facts = parseFacts(r.text);
    if (!facts) return { ok: false, error: "no structured facts returned" };
    // Cap the summary here as well as in the prompt: an instruction is not a
    // guarantee, and this is the one field that could carry contract terms.
    if (typeof facts.summary === "string") facts.summary = facts.summary.split(/\s+/).slice(0, 30).join(" ");
    return {
      ok: true,
      fileId, filename: file.name, folderPath: file.folderPath,
      facts,
      source: "claude-read", readAt: new Date().toISOString(),
      usage: r.usage || null, costUsd: r.costUsd || null,
    };
  } finally {
    running--;
    // The document never outlives the call, on any path.
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  }
}

/* What WOULD be sent, and what would not, so folders can be chosen from real
   numbers instead of guessed at. Sends nothing. */
function preview(filter) {
  const cfg = config();
  const files = drive.indexFiles().filter(filter || (() => true));
  const byFolder = new Map();
  for (const f of files) {
    const key = String(f.folderPath || "").split(" / ").slice(0, 3).join(" / ");
    if (!byFolder.has(key)) byFolder.set(key, { folder: key, files: 0, allowed: 0, bytes: 0 });
    const e = byFolder.get(key);
    e.files++;
    e.bytes += Number(f.size) || 0;
    if (maySend(f, cfg).ok) e.allowed++;
  }
  return {
    config: { enabled: cfg.enabled, allow: cfg.allow },
    folders: [...byFolder.values()].sort((a, b) => b.files - a.files),
    totals: {
      files: files.length,
      wouldSend: files.filter((f) => maySend(f, cfg).ok).length,
    },
  };
}

function status() {
  const cfg = config();
  return {
    installed: fs.existsSync(BIN),
    enabled: cfg.enabled,
    allowlist: cfg.allow,
    transmitsDocuments: cfg.enabled && cfg.allow.length > 0,
    note: cfg.allow.length
      ? "Documents in the allowlisted folders ARE transmitted to Anthropic when read."
      : "Nothing is transmitted: no folder is allowlisted.",
  };
}

module.exports = { readDocument, preview, status, config, maySend, CONFIG };
