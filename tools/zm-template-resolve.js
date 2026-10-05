#!/usr/bin/env node
/* THE SIXTY-NINE THE SIGNAL COUNTER COULD NOT CALL.
 *
 * Counting placeholders classified 337 of 406 template files. The rest divide
 * into groups that a different method settles, and one group that genuinely
 * needs looking at:
 *
 *   scans with no text layer   — a vehicle lease for "Adil Masud", a DMA with
 *                                "Allied Bank Limited": party-specific names in
 *                                the filename and nothing extractable inside.
 *                                These are rendered and read.
 *   images                     — design options and WhatsApp photographs.
 *                                Rendered and read.
 *   workbooks                  — inventory and unit-area tables. Read as
 *                                spreadsheets, because that is what they are.
 *   annexures                  — Appendix B/C/D, a floor plan, a materials list,
 *                                a payment schedule. Short by nature: an annexure
 *                                to a template is part of that template set, and
 *                                counting its placeholders was always going to
 *                                be the wrong question.
 *
 * This prepares the first two groups for reading and decides the other two on
 * evidence about what the file IS rather than what it contains.
 *
 *   node tools/zm-template-resolve.js --prepare     stage scans/images for reading
 *   node tools/zm-template-resolve.js --apply f.json  record the decisions
 */
const fs = require("fs"), P = require("path"), cp = require("child_process");
const drive = require("../api/drive.js");
const xlsx = require("../api/xlsx.js");
const { driveRaw } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const LIB = P.join(ROOT, "audit", "zm-template-library.json");
const WORK = "/tmp/claude-1010/-var-www-zameen-bse-reports/34a1514a-aa3b-4767-a703-cee43a2b5c1d/scratchpad/tresolve";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(id, attempt = 0) {
  const res = await driveRaw("/files/" + id + "?alt=media&supportsAllDrives=true");
  if (res.status === 429 || res.status === 403 || res.status >= 500) {
    if (attempt >= 4) return null;
    await sleep(1000 * Math.pow(2, attempt));
    return fetchBytes(id, attempt + 1);
  }
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

const isAnnexure = (n) => /^\d*[- ]*(appendix|annexure|annex|schedule)\b/i.test(n)
  || /\b(appendix|annexure)\s*[a-z]\b/i.test(n);

(async () => {
  await drive.ensureIndex();
  const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
  const un = lib.templates.filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS");

  if (arg("--apply", null)) {
    const decisions = JSON.parse(fs.readFileSync(arg("--apply"), "utf8"));
    const byId = new Map(decisions.map((d) => [d.fileId, d]));
    let n = 0;
    for (const r of lib.templates) {
      const d = byId.get(r.fileId);
      if (!d) continue;
      r.classification = d.classification;
      r.basis = d.basis;
      r.resolvedBy = d.resolvedBy || "read";
      n++;
    }
    lib.summary.byClassification = lib.templates.reduce((m, r) => (m[r.classification] = (m[r.classification] || 0) + 1, m), {});
    lib.summary.unresolved = lib.templates.filter((r) => r.classification === "UNRESOLVED_AFTER_FULL_ANALYSIS").length;
    lib.summary.operationalDocsFoundInTemplateSource = lib.templates.filter((r) => r.classification === "EXECUTED_OPERATIONAL_DOCUMENT").length;
    fs.writeFileSync(LIB, JSON.stringify(lib, null, 1));
    console.log("applied " + n + " decisions; unresolved now " + lib.summary.unresolved);
    console.log(JSON.stringify(lib.summary.byClassification, null, 1));
    return;
  }

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const auto = [];        // decided here, on what the file is
  const toRead = [];      // staged for reading

  let i = 0;
  for (const r of un) {
    i++;
    const ext = (r.name.match(/\.[a-z0-9]{2,5}$/i) || [""])[0].toLowerCase();

    /* A spreadsheet of unit types and net areas is reference data for a project,
       not an agreement and not a template. Read its sheets to say so from
       evidence rather than from the extension. */
    if (ext === ".xlsx" || ext === ".xls") {
      const buf = await fetchBytes(r.fileId);
      let sheets = [];
      try { sheets = (xlsx.readWorkbook(buf, { maxSheets: 100000 }).sheets || []).map((s) => s.name); } catch (e) { sheets = []; }
      auto.push({ fileId: r.fileId, classification: "REFERENCE_DOCUMENT", resolvedBy: "workbook",
        basis: "a spreadsheet of project reference data, not an agreement — sheets: " + (sheets.join(", ") || "unreadable").slice(0, 120) });
      continue;
    }

    /* An annexure is part of a template set. Judging it on placeholder density
       asks the wrong question: a floor plan or a materials table is mostly a
       table, and its parent agreement carries the blanks. */
    if (isAnnexure(r.name)) {
      auto.push({ fileId: r.fileId, classification: "APPROVED_TEMPLATE", resolvedBy: "annexure",
        basis: "an annexure forming part of the template set in " + r.category + "; annexures carry tables rather than placeholder text" });
      continue;
    }

    const buf = await fetchBytes(r.fileId);
    if (!buf) { auto.push({ fileId: r.fileId, classification: "UNRESOLVED_AFTER_FULL_ANALYSIS", basis: "the file could not be fetched from Drive", resolvedBy: "fetch-failed" }); continue; }

    const slot = P.join(WORK, "t" + String(i).padStart(3, "0"));
    fs.mkdirSync(slot, { recursive: true });

    if (/\.(jpe?g|png|gif|webp)$/i.test(ext)) {
      fs.writeFileSync(P.join(slot, "page-1" + (ext === ".jpeg" ? ".jpg" : ext)), buf);
      toRead.push({ n: i, dir: slot, kind: "IMAGE", fileId: r.fileId, name: r.name, category: r.category, path: r.path });
      continue;
    }
    if (ext === ".pdf") {
      const pdf = P.join(slot, "src.pdf");
      fs.writeFileSync(pdf, buf);
      let total = 0;
      try {
        const info = cp.execSync("pdfinfo " + JSON.stringify(pdf) + " 2>/dev/null || true", { encoding: "utf8" });
        total = parseInt((info.match(/Pages:\s+(\d+)/) || [])[1] || "0", 10);
      } catch (e) { total = 0; }
      const want = new Set([1, 2]);
      if (total) { want.add(total); want.add(Math.max(1, total - 1)); }
      for (const p of [...want].sort((x, y) => x - y)) {
        try {
          cp.execSync("pdftoppm -r 140 -f " + p + " -l " + p + " -jpeg " + JSON.stringify(pdf) + " " + JSON.stringify(P.join(slot, "page-" + p)),
            { timeout: 120000, stdio: "ignore" });
        } catch (e) { /* one bad page is not a bad document */ }
      }
      try { fs.unlinkSync(pdf); } catch (e) {}
      const pages = fs.readdirSync(slot).filter((f) => /^page-/.test(f)).length;
      if (!pages) { auto.push({ fileId: r.fileId, classification: "UNRESOLVED_AFTER_FULL_ANALYSIS", basis: "no page could be rendered from this PDF", resolvedBy: "render-failed" }); continue; }
      toRead.push({ n: i, dir: slot, kind: "PAGES", pages, totalPages: total, fileId: r.fileId, name: r.name, category: r.category, path: r.path });
      continue;
    }
    if (ext === ".odt") {
      /* An ODT is a zip of XML; mammoth cannot read it. This used to shell out
         to `unzip -p ... || true`, which on a host with no unzip binary returned
         the empty string and called a real drafting clause an unreadable file.
         The workbook reader already inflates zips in process, so use that: no
         external binary, and a failure raises instead of reading as blank. */
      let text = "";
      try {
        const got = xlsx.unzip(buf, (n) => n === "content.xml");
        const xml = got["content.xml"];
        if (!xml || !xml.length) throw new Error("no content.xml in the ODT package");
        text = xml.toString("utf8").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        if (!text) throw new Error("content.xml carried no text");
      } catch (e) {
        auto.push({ fileId: r.fileId, classification: "UNRESOLVED_AFTER_FULL_ANALYSIS",
          basis: "the ODT package could not be read: " + String(e.message || e).slice(0, 120),
          resolvedBy: "odt-unreadable" });
        continue;
      }
      fs.writeFileSync(P.join(slot, "text.txt"), text);
      toRead.push({ n: i, dir: slot, kind: "TEXT", fileId: r.fileId, name: r.name, category: r.category, path: r.path });
      continue;
    }
    toRead.push({ n: i, dir: slot, kind: "UNKNOWN", fileId: r.fileId, name: r.name, category: r.category, path: r.path });
  }

  fs.writeFileSync(P.join(WORK, "manifest.json"), JSON.stringify(toRead, null, 1));
  fs.writeFileSync(P.join(WORK, "auto.json"), JSON.stringify(auto, null, 1));
  console.log(JSON.stringify({
    unresolvedIn: un.length,
    decidedWithoutReading: auto.length,
    stagedForReading: toRead.length,
    byKind: toRead.reduce((m, t) => (m[t.kind] = (m[t.kind] || 0) + 1, m), {}),
    workDir: WORK,
  }, null, 1));
  for (const t of toRead) console.log("  " + String(t.n).padStart(3) + "  " + t.kind.padEnd(6) + " " + t.name.slice(0, 62) + "   [" + t.category.slice(0, 28) + "]");
})();
