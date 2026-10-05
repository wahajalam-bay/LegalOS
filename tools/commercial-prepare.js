#!/usr/bin/env node
/* PREPARE PAGES FOR READING. NO MODEL CALL.
 *
 * commercial-vision.js did the whole job in one process: pick a document,
 * download it, render its pages, and spawn a Claude CLI to look at them. The
 * spawn is the expensive part — every document paid for a fresh agent's
 * start-up before it read a single page, and for 185 remaining documents that
 * is most of the cost for none of the value.
 *
 * So this half does everything EXCEPT the reading. It leaves a batch directory
 * of rendered pages and a manifest, and the reading is done directly by the
 * agent already in the conversation, which needs no start-up at all.
 *
 * The handling rules do not change because the caller changed:
 *   · Drive is read-only. Nothing here writes, renames or moves a source file.
 *   · The downloaded original is deleted the moment its pages are rendered.
 *   · Only rendered pages and extracted head/tail text live in the batch, and
 *     the batch is deleted by --clean once its facts have been recorded.
 *   · No document body is written to the manifest, the logs or the audit JSON.
 *
 *   node tools/commercial-prepare.js --limit 12 [--batch b1]
 *   node tools/commercial-prepare.js --clean b1
 */
const fs = require("fs"), P = require("path"), cp = require("child_process");
const drive = require("../api/drive.js");
const { driveRaw } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const AUD = P.join(ROOT, "audit");
const OUT = P.join(AUD, "commercial-vision.json");
const WORK = "/tmp/claude-1010/-var-www-zameen-bse-reports/34a1514a-aa3b-4767-a703-cee43a2b5c1d/scratchpad/batches";

const SKIM_FIRST = 2, SKIM_LAST = 2, RENDER_DPI = 140;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
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

/* Text we already hold, from the deep read or the recovery pass. If a document
   has been extracted once there is no reason to render it again — the head and
   tail of its text answer the same three questions the pages would. */
function heldText(fileId) {
  for (const f of ["commercial-deep-read.json", "commercial-recovery.json"]) {
    try {
      const j = JSON.parse(fs.readFileSync(P.join(ROOT, "cache", f), "utf8"));
      const e = Array.isArray(j) ? j.find((x) => x.fileId === fileId) : j[fileId];
      if (e && e.text && e.text.length > 400) return e.text;
    } catch (e) { /* not present */ }
  }
  return null;
}

const headTail = (t) => (t.length <= 14000 ? t : t.slice(0, 9000) + "\n\n[…middle omitted…]\n\n" + t.slice(-5000));

/* AN ABSENT LIBRARY IS NOT AN EMPTY DOCUMENT.
 *
 * Installing an image library once pruned mammoth and word-extractor from
 * node_modules, because they had been installed without being saved to
 * package.json. The next run extracted "" from twenty-three real contracts —
 * employment contracts, a bank cash-management SLA, a joint venture agreement —
 * and every one of them would have been written down as having no text layer.
 *
 * The document was fine. The shelf was empty. So a missing module is now its
 * own outcome, reported as EXTRACTOR_MISSING, and it never reaches the store as
 * a fact about the document. */
function extractorFor(name) {
  try {
    if (/\.docx$/i.test(name)) return { kind: "mammoth", mod: require("mammoth") };
    return { kind: "word-extractor", mod: require("word-extractor") };
  } catch (e) {
    return { kind: /\.docx$/i.test(name) ? "mammoth" : "word-extractor", missing: true, why: e.message };
  }
}

async function extractOffice(file, path) {
  const ex = extractorFor(file.name);
  if (ex.missing) {
    const err = new Error("EXTRACTOR_MISSING: " + ex.kind + " is not installed");
    err.extractorMissing = ex.kind;
    throw err;
  }
  try {
    if (ex.kind === "mammoth") {
      const r = await ex.mod.extractRawText({ path });
      return r && r.value ? r.value : "";
    }
    const doc = await new ex.mod().extract(path);
    return doc ? doc.getBody() : "";
  } catch (e) { return ""; }
}

(async () => {
  if (arg("--clean", null)) {
    const d = P.join(WORK, arg("--clean"));
    fs.rmSync(d, { recursive: true, force: true });
    console.log("removed " + d);
    return;
  }

  await drive.ensureIndex();
  const read = (f) => { try { return JSON.parse(fs.readFileSync(P.join(AUD, f), "utf8")); } catch (e) { return []; } };
  const recovery = read("commercial-recovery.json");
  const queue = read("commercial-review-queue.json");
  const conflicts = read("commercial-conflicts.json");
  const templates = read("commercial-template-verification.json");
  const ctxAll = read("commercial-document-context.json");

  const ids = new Set();
  const add = (l) => l.forEach((x) => x && ids.add(x));
  add(queue.map((q) => q.fileId));
  add(ctxAll.filter((c) => !c.recordId).map((c) => c.fileId));
  add(conflicts.map((c) => c.fileId));
  add(templates.filter((t) => t.verdict !== "TEMPLATE_CONFIRMED").map((t) => t.fileId));
  add(recovery.filter((r) => r.state === "CONTENT_UNREADABLE").map((r) => r.fileId));

  let store = {};
  try { store = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { store = {}; }

  const files = [...ids].map((id) => drive.fileById(id)).filter(Boolean)
    .filter((f) => !store[f.id])
    .filter((f) => !/\.(xlsx?|tmp)$/i.test(f.name || "") && !/^~\$/.test(f.name || ""));

  /* --files lets a caller re-try named documents that an earlier, stricter
     version refused — the size cap that rejected three executed agreements at
     31MB, and two renders that failed once. Retrying a refusal is not the same
     as reading it for the first time, and the store must not keep a stale
     "unreadable" for a document the current tooling can handle. */
  const only = arg("--files", null);
  const limit = parseInt(arg("--limit", "12"), 10);
  const work = only
    ? only.split(",").map((id) => drive.fileById(id.trim())).filter(Boolean)
    : files.slice(0, limit);
  const batch = arg("--batch", "b" + Date.now().toString(36));
  const dir = P.join(WORK, batch);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  console.error("remaining to read: " + files.length + " — preparing " + work.length + " into " + batch);

  const manifest = [];
  for (let i = 0; i < work.length; i++) {
    const f = work[i];
    const slot = P.join(dir, "d" + String(i + 1).padStart(2, "0"));
    fs.mkdirSync(slot, { recursive: true });
    const entry = {
      n: i + 1, fileId: f.id, filename: f.name, folderPath: f.folderPath,
      dir: slot, kind: null, pages: 0, note: null,
    };

    // 1 text we already hold beats rendering the same document again
    const held = heldText(f.id);
    if (held) {
      fs.writeFileSync(P.join(slot, "text.txt"), headTail(held));
      entry.kind = "TEXT_HELD"; entry.note = "extracted text, head and tail";
      manifest.push(entry); continue;
    }

    const got = await fetchBytes(f.id);
    if (got.error) { entry.kind = "FETCH_FAILED"; entry.note = got.error; manifest.push(entry); continue; }

    const ext = (f.name.match(/\.[a-z0-9]{2,5}$/i) || [".bin"])[0].toLowerCase();
    try {
      if (/\.(jpe?g|jfif|png|gif|webp|bmp|tiff?)$/i.test(ext)) {
        // A photograph of a document IS a page. Nothing to render.
        fs.writeFileSync(P.join(slot, "page-1" + (ext === ".jfif" ? ".jpg" : ext)), got.buf);
        entry.kind = "IMAGE"; entry.pages = 1;
      } else if (ext === ".pdf") {
        const pdf = P.join(slot, "src.pdf");
        fs.writeFileSync(pdf, got.buf);

        /* TEXT LAYER FIRST. A PDF with a text layer answers identity and
           execution from its own words, and reading those words costs a
           fraction of reading a picture of them. Rendering is for the scans
           that genuinely have nothing to extract — which is what "unreadable"
           was always supposed to mean. */
        let layer = "";
        try {
          layer = cp.execSync("pdftotext -layout " + JSON.stringify(pdf) + " - 2>/dev/null || true",
            { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
        } catch (e) { layer = ""; }
        if (layer && layer.replace(/\s/g, "").length > 600) {
          fs.writeFileSync(P.join(slot, "text.txt"), headTail(layer));
          try { fs.unlinkSync(pdf); } catch (e) {}
          entry.kind = "TEXT"; entry.note = "pdf text layer";
          manifest.push(entry); continue;
        }

        let total = 0;
        try {
          const info = cp.execSync("pdfinfo " + JSON.stringify(pdf) + " 2>/dev/null || true", { encoding: "utf8" });
          total = parseInt((info.match(/Pages:\s+(\d+)/) || [])[1] || "0", 10);
        } catch (e) { total = 0; }
        const wanted = new Set();
        for (let p = 1; p <= Math.min(SKIM_FIRST, total || SKIM_FIRST); p++) wanted.add(p);
        if (total) for (let p = Math.max(1, total - SKIM_LAST + 1); p <= total; p++) wanted.add(p);
        for (const p of [...wanted].sort((a, b) => a - b)) {
          try {
            cp.execSync("pdftoppm -r " + RENDER_DPI + " -f " + p + " -l " + p + " -jpeg -r " + RENDER_DPI
              + " " + JSON.stringify(pdf) + " " + JSON.stringify(P.join(slot, "page-" + p)),
            { timeout: 120000, stdio: "ignore" });
          } catch (e) { /* one bad page is not a bad document */ }
        }
        // The original never outlives its render.
        try { fs.unlinkSync(pdf); } catch (e) {}
        entry.kind = "PAGES"; entry.pages = fs.readdirSync(slot).filter((x) => /^page-/.test(x)).length;
        entry.totalPages = total;
        if (!entry.pages) { entry.kind = "RENDER_FAILED"; entry.note = "pdftoppm produced no page"; }
      } else if (/\.(docx?|rtf|odt)$/i.test(ext)) {
        const tmp = P.join(slot, "src" + ext);
        fs.writeFileSync(tmp, got.buf);
        let text = "";
        try {
          text = await extractOffice(f, tmp);
        } catch (err) {
          try { fs.unlinkSync(tmp); } catch (e2) {}
          if (err.extractorMissing) {
            entry.kind = "EXTRACTOR_MISSING";
            entry.note = err.extractorMissing + " is not installed — this says nothing about the document";
            manifest.push(entry); continue;
          }
          throw err;
        }
        try { fs.unlinkSync(tmp); } catch (e) {}
        if (text && text.trim().length > 200) {
          fs.writeFileSync(P.join(slot, "text.txt"), headTail(text));
          entry.kind = "TEXT"; entry.note = "extracted from " + ext;
        } else { entry.kind = "OFFICE_EMPTY"; entry.note = "no text layer in " + ext; }
      } else {
        entry.kind = "UNSUPPORTED"; entry.note = ext + " has no local reader";
      }
    } catch (e) {
      entry.kind = "PREPARE_ERROR"; entry.note = String(e.message || e).slice(0, 160);
    }
    manifest.push(entry);
  }

  fs.writeFileSync(P.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify({ batch, dir, prepared: manifest.length, remaining: files.length,
    byKind: manifest.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {}) }, null, 1));
  for (const e of manifest) {
    console.log("  " + String(e.n).padStart(2) + "  " + String(e.kind).padEnd(14)
      + String(e.pages || "").padStart(2) + "p  " + e.filename.slice(0, 74));
  }
})();
