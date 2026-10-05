#!/usr/bin/env node
/* READ THE SCANS. ALL PAGES. VISUALLY.
 *
 * "No text layer" means text EXTRACTION failed. It does not mean the document
 * cannot be read — a scanned lease is a picture of a lease, and a picture can
 * be looked at. This renders every page of a document to an image and has
 * Claude read the pages.
 *
 * ORDER OF ATTACK, strongest first, per file:
 *   1 text we already hold (deep read / recovery) — no need to look again
 *   2 render pages with pdftoppm, read them visually
 *   3 for Office files, hand the file itself over to be read
 * Everything else about the pipeline stays: Drive is never written to, the
 * downloaded file and every rendered page are destroyed when the call returns,
 * and only STRUCTURED FACTS are kept — never the document body.
 *
 * WHAT IT EXTRACTS, because these are the facts that decide a mapping:
 *   document type · agreement title · parties · entity · project · counterparty
 *   agreement / execution / effective dates · agreement and amendment numbers
 *   parent agreement · property or unit · AND whether the execution block
 *   actually carries signatures, which is the difference between a template and
 *   an instrument.
 *
 * SIGNATURES ARE THE POINT. A draft and an executed agreement read almost
 * identically until you look at the signature page. That is exactly what text
 * extraction cannot tell you and a rendered page can.
 *
 *   node tools/commercial-vision.js --targets unreadable|review|conflicts|all [--limit N]
 */
const fs = require("fs"), P = require("path"), cp = require("child_process"), os = require("os");
const drive = require("../api/drive.js");
const { driveRaw } = require("../api/google.js");
const reader = require("../api/claude-reader.js");

const ROOT = P.join(__dirname, "..");
const AUD = P.join(ROOT, "audit");
const OUT = P.join(AUD, "commercial-vision.json");
const BIN = P.join(ROOT, "node_modules", ".bin", "claude");

/* SKIM by default. Classification needs three things and they live in known
   places: what the document IS (title page), who it is between (first page or
   two), and whether it was signed (last page). Rendering all forty pages of a
   lease to learn those three facts costs about a minute a document and tells us
   little more. Full reading stays available with --mode full for documents
   where the middle matters. */
const SKIM_FIRST = 2;            // title, parties, recitals
const SKIM_LAST = 2;             // execution block, schedules
const MAX_PAGES_FULL = 40;
const RENDER_DPI = 140;          // legible for headings, stamps and signatures
const TIMEOUT_MS = 300000;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ASK = [
  "This directory holds ONE legal document from a Pakistani property group — either page images",
  "(the FIRST and LAST pages; the middle may be absent) or its extracted text (opening and closing).",
  "Identify the document from what is there, and judge execution from the LAST page or closing text.",
  "Reply with ONLY a JSON object and no prose:",
  '{"documentType":"","agreementTitle":"","parties":[],"entity":"","project":"","counterparty":"",',
  '"agreementDate":"","executionDate":"","effectiveDate":"","agreementNumber":"","amendmentNumber":null,',
  '"parentAgreement":"","propertyOrUnit":"","executed":null,"executionEvidence":"","draftMarkers":[],',
  '"documentFamily":"","confidence":"CONFIRMED|HIGH|MEDIUM|LOW","unreadable":false,"summary":""}',
  "documentType one of: SALE_DEED, PPA, LEASE, SERVICE, CONSTRUCTION, LOAN, NDA, MOU, JV, POA, LAND_RECORD,",
  "APPROVAL, RESOLUTION, LITIGATION, NOTICE, TEMPLATE, INVOICE, RECEIPT, CERTIFICATE, PLAN, OTHER.",
  "executed: true ONLY if you can SEE signatures, initials, a stamp or a completed execution block on a page.",
  "false if signature lines are blank, or the document shows draft markers, placeholders or [●].",
  "executionEvidence: name what you saw and on which page, e.g. 'two signatures and a company stamp on page 12'.",
  "draftMarkers: any of DRAFT watermark, blank signature block, placeholder text, track changes, version markers.",
  "summary: at most 20 words saying WHAT THE DOCUMENT IS. Never quote its commercial terms.",
  "Use only what you can actually see. Leave a field empty rather than guessing.",
  "If the pages are illegible, set unreadable true and leave the rest empty.",
  "Do not infer content from pages you were not shown; leave a field empty instead.",
].join(" ");

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

function runClaude(dir) {
  return new Promise((resolve) => {
    const args = ["-p", ASK, "--output-format", "json", "--add-dir", dir,
      "--allowed-tools", "Read", "--allowed-tools", "Glob",
      "--disallowed-tools", "Bash", "--disallowed-tools", "Write", "--disallowed-tools", "Edit",
      "--disallowed-tools", "WebFetch", "--disallowed-tools", "WebSearch", "--disallowed-tools", "Task"];
    const env = Object.assign({}, process.env);
    for (const k of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_PID"]) delete env[k];
    const child = cp.spawn(BIN, args, { cwd: dir, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} finish({ ok: false, error: "timeout" }); }, TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(t); finish({ ok: false, error: e.message }); });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) {
        return finish({ ok: false, error: ((err || "").trim() || (out || "").trim() || "exit " + code).slice(0, 300) });
      }
      try {
        const j = JSON.parse(out);
        finish({ ok: !j.is_error, text: j.result, costUsd: j.total_cost_usd });
      } catch (e) { finish({ ok: false, error: "unparseable CLI output" }); }
    });
    try { child.stdin.end(); } catch (e) {}
  });
}

const parseFacts = (t) => { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } };

/* The CLI returns a bare "exit 1" when several calls run at once and the plan
   rate-limits one of them. The same document succeeds on its own, so this is a
   transient condition and not a fact about the file — retrying with a growing
   pause recovers it. Without this, a rate limit was being recorded permanently
   as "this document could not be read". */
async function runClaudeWithRetry(dir, attempts = 5) {
  let last = null;
  for (let a = 0; a < attempts; a++) {
    const r = await runClaude(dir);
    if (r.ok) return r;
    last = r;
    const transient = /exit 1|timeout|429|rate|overloaded|unparseable|limit/i.test(String(r.error || ""));
    if (!transient) return r;
    /* Sustained reading trips a burst limit: 185 documents came back as a bare
       "exit 1" during one long run, and every one of them succeeded on its own
       afterwards. So the backoff has to be long enough to outlast the window —
       up to about a minute — rather than the few seconds that suffice for a
       one-off blip. */
    await sleep(Math.min(60000, 5000 * Math.pow(2, a)) + Math.random() * 3000);
  }
  return last;
}

async function readVisually(file) {
  const gate = reader.maySend(file, reader.config());
  if (!gate.ok) return { ok: false, error: gate.why, gated: true };
  const got = await fetchBytes(file.id);
  if (got.error) return { ok: false, error: got.error };

  const dir = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-vision-"));
  try {
    const ext = (file.name.match(/\.[a-z0-9]{1,5}$/i) || [".bin"])[0].toLowerCase();
    const src = P.join(dir, "src" + ext);
    fs.writeFileSync(src, got.buf);
    let pages = 0;

    if (/\.pdf$/i.test(ext)) {
      let total = 0;
      try {
        const info = cp.execSync("pdfinfo " + JSON.stringify(src) + " 2>/dev/null || true", { encoding: "utf8" });
        total = parseInt((info.match(/Pages:\s*(\d+)/) || [])[1] || "0", 10);
      } catch (e) {}
      /* Every page up to the cap. Past it, the first 30 and the LAST 8 — the
         execution block and the schedules live at the end, and a 200-page
         bundle that only ever shows its first pages is how a signed agreement
         gets mistaken for a draft. */
      const MODE = arg("--mode", "skim");
      let ranges;
      if (MODE === "full") {
        ranges = total > MAX_PAGES_FULL
          ? [[1, 30], [Math.max(31, total - 7), total]]
          : [[1, Math.max(total, 1)]];
      } else if (!total || total <= SKIM_FIRST + SKIM_LAST) {
        ranges = [[1, Math.max(total, 1)]];          // short enough to read whole
      } else {
        // The front for identity, the back for the signature. Never only the
        // front: an unsigned draft and an executed agreement are identical
        // until the execution block, which is always at the end.
        ranges = [[1, SKIM_FIRST], [total - SKIM_LAST + 1, total]];
      }
      for (const [a, b] of ranges) {
        try {
          cp.execSync("pdftoppm -r " + RENDER_DPI + " -png -f " + a + " -l " + b + " "
            + JSON.stringify(src) + " " + JSON.stringify(P.join(dir, "page")),
          { timeout: 240000, stdio: "ignore" });
        } catch (e) {}
      }
      fs.unlinkSync(src);
      pages = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).length;
      if (!pages) return { ok: false, error: "no page could be rendered" };
    }
    /* OFFICE FILES NEED THEIR TEXT FIRST. Handing a .docx over as itself
       returned nothing at all — pages 0, every field empty — because the file
       is a zip of XML, not something to look at. So Office documents are
       converted to text before being read, and where the deep read already
       holds that text we use it and skip the download entirely. */
    /* An IMAGE is already a page. Photographs of documents are common here —
       "WhatsApp Image 2026-07-13…" is somebody's photo of a signed page — and
       sending them down the Office text path asked a text extractor to parse a
       JPEG, which of course produced nothing. Look at it instead. */
    if (/\.(jpe?g|jfif|png|gif|webp)$/i.test(ext)) {
      const asPage = P.join(dir, "page-1" + (/\.png$/i.test(ext) ? ".png" : ".jpg"));
      fs.renameSync(src, asPage);
      pages = 1;
    } else if (!/\.pdf$/i.test(ext)) {
      let text = "";
      const cached = P.join(ROOT, "cache", "commercial", file.id + ".txt");
      try { text = fs.readFileSync(cached, "utf8"); } catch (e) { text = ""; }
      if (!text || text.length < 200) {
        try {
          if (/\.docx$/i.test(ext)) {
            const mammoth = require("mammoth");
            const r = await mammoth.extractRawText({ path: src });
            text = (r && r.value) || "";
          } else if (/\.doc$/i.test(ext)) {
            const WordExtractor = require("word-extractor");
            const doc = await new WordExtractor().extract(src);
            text = doc.getBody() || "";
          }
        } catch (e) { text = text || ""; }
      }
      try { fs.unlinkSync(src); } catch (e) {}
      if (!text || text.length < 120) return { ok: false, error: "no text could be extracted from the Office file" };
      /* Keep the head AND the tail: the execution block is at the end, and
         sending only the opening pages is how a signed agreement gets read as a
         draft. */
      const head = text.slice(0, 18000);
      const tail = text.length > 24000 ? "\n\n[...]\n\n" + text.slice(-6000) : "";
      fs.writeFileSync(P.join(dir, "document.txt"), head + tail);
      pages = 1;
    }

    const r = await runClaudeWithRetry(dir);
    if (!r.ok) return { ok: false, error: r.error };
    const facts = parseFacts(r.text);
    if (!facts) return { ok: false, error: "no structured facts returned" };
    if (typeof facts.summary === "string") facts.summary = facts.summary.split(/\s+/).slice(0, 25).join(" ");
    return { ok: true, facts, pagesRead: pages, costUsd: r.costUsd || 0 };
  } finally {
    // The document and every rendered page go, on every path.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await drive.ensureIndex();
  const sets = JSON.parse(fs.readFileSync(P.join(AUD, "commercial-sets.json"), "utf8"));
  const recovery = (() => { try { return JSON.parse(fs.readFileSync(P.join(AUD, "commercial-recovery.json"), "utf8")); } catch (e) { return []; } })();
  const queue = (() => { try { return JSON.parse(fs.readFileSync(P.join(AUD, "commercial-review-queue.json"), "utf8")); } catch (e) { return []; } })();
  const conflicts = (() => { try { return JSON.parse(fs.readFileSync(P.join(AUD, "commercial-conflicts.json"), "utf8")); } catch (e) { return []; } })();
  const templates = (() => { try { return JSON.parse(fs.readFileSync(P.join(AUD, "commercial-template-verification.json"), "utf8")); } catch (e) { return []; } })();

  const want = arg("--targets", "all");
  const ids = new Set();                       // insertion order IS the priority
  const add = (list) => list.forEach((x) => x && ids.add(x));

  /* PRIORITY: documents where reading CHANGES something.
     The first ordering put the 152 unreadable first, and 151 of those were
     already placed by their folder — so an hour of reading moved nothing. What
     moves the estate is the documents nothing has placed, the ones under
     dispute, and the precedents that may be executed. The unreadable-but-placed
     remainder is read last: worth knowing, but it changes no mapping. */
  const ctxAll = (() => { try { return JSON.parse(fs.readFileSync(P.join(AUD, "commercial-document-context.json"), "utf8")); } catch (e) { return []; } })();
  const unattached = ctxAll.filter((c) => !c.recordId).map((c) => c.fileId);

  if (want === "all") {
    add(queue.map((q) => q.fileId));                                              // 1 the review queue
    add(unattached);                                                              // 2 everything unplaced
    add(conflicts.map((c) => c.fileId));                                          // 3 contested attachments
    add(templates.filter((t) => t.verdict !== "TEMPLATE_CONFIRMED").map((t) => t.fileId)); // 4 maybe-executed precedents
    add(recovery.filter((r) => r.state === "CONTENT_UNREADABLE").map((r) => r.fileId));    // 5 the rest
  } else {
    if (want === "unreadable") add(recovery.filter((r) => r.state === "CONTENT_UNREADABLE").map((r) => r.fileId));
    if (want === "review") add(queue.map((q) => q.fileId));
    if (want === "unattached") add(unattached);
    if (want === "conflicts") add(conflicts.map((c) => c.fileId));
    if (want === "templates") add(templates.filter((t) => t.verdict !== "TEMPLATE_CONFIRMED").map((t) => t.fileId));
  }

  let store = {};
  try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { store = {}; }

  const limit = parseInt(arg("--limit", "0"), 10);
  const files = [...ids].map((id) => drive.fileById(id)).filter(Boolean)
    .filter((f) => !store[f.id])
    // A workbook is a register SOURCE the ingest already reads row by row, not a
    // document to be looked at; and the ~$ files are Word's owner locks.
    .filter((f) => !/\.(xlsx?|tmp)$/i.test(f.name || "") && !/^~\$/.test(f.name || ""));
  const work = limit ? files.slice(0, limit) : files;

  console.log("commercial-vision: " + ids.size + " target documents, " + Object.keys(store).length
    + " already read, " + work.length + " to do\n");

  /* FOUR AT A TIME. Each document is a download, a page render and a CLI call;
     serially that is roughly a minute each. Four in flight keeps the plan busy
     without turning the box into a render farm, and the store is written as
     results land so the run resumes wherever it stopped. */
  /* Two, not four. Four in flight produced bare "exit 1" failures that the same
     documents did not produce alone — the plan rate-limits concurrent calls,
     and a rate limit recorded as "unreadable" is a lie about the document. */
  const CONCURRENCY = 2;
  let read = 0, failed = 0, executedSeen = 0, cost = 0, done = 0;
  const next = { i: 0 };

  const worker = async () => {
    for (;;) {
      const i = next.i++;
      if (i >= work.length) return;
      const f = work[i];
      let r;
      try { r = await readVisually(f); } catch (e) { r = { ok: false, error: String(e.message).slice(0, 80) }; }
      // A breath between documents. Reading flat out is what tripped the limit.
      await sleep(1500 + Math.random() * 1500);
      done++;
      if (r.ok) {
        read++;
        cost += r.costUsd || 0;
        if (r.facts.executed === true) executedSeen++;
        store[f.id] = {
          fileId: f.id, filename: f.name, folderPath: f.folderPath,
          pagesRead: r.pagesRead, facts: r.facts, readAt: new Date().toISOString(), method: "vision-skim",
        };
        const fa = r.facts;
        console.log("  [" + done + "/" + work.length + "] " + String(fa.documentType || "?").padEnd(13)
          + (fa.executed === true ? "EXECUTED " : fa.executed === false ? "draft    " : "unknown  ")
          + String(fa.project || "").slice(0, 20).padEnd(22) + (f.name || "").slice(0, 40));
      } else {
        failed++;
        store[f.id] = { fileId: f.id, filename: f.name, folderPath: f.folderPath, error: r.error, readAt: new Date().toISOString(), method: "vision-skim" };
        console.log("  [" + done + "/" + work.length + "] FAILED " + String(r.error).slice(0, 44) + "  " + (f.name || "").slice(0, 36));
      }
      if (done % 5 === 0) fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(OUT, JSON.stringify(store, null, 1));

  console.log("\n=== VISION READ ===");
  console.log("  documents read visually : " + read);
  console.log("  failed                  : " + failed);
  console.log("  with visible signatures : " + executedSeen);
  if (cost) console.log("  plan usage              : $" + cost.toFixed(2) + " equivalent");
  console.log("  wrote audit/commercial-vision.json (structured facts only)");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
