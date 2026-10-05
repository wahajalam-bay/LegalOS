#!/usr/bin/env node
/* READ THE UNDATED RESOLUTION SCANS AND FIND THE DATE (§23-§25).
 *
 * A handful of folder-derived resolutions carry no date in their file name and
 * no text layer in the PDF. The date of a board resolution is a legal fact and
 * it is printed on the document, so the pages are rendered and read.
 *
 * DRIVE'S OWN createdTime / modifiedTime ARE NOT USED as the resolution date.
 * They record when somebody uploaded a scan, which is not when the board
 * resolved, and substituting one for the other would put a fabricated legal
 * date on a statutory record. They stay as source metadata and nothing more.
 *
 *   node tools/resolution-dates.js
 */
const fs = require("fs"), P = require("path"), cp = require("child_process"), os = require("os");
const { driveRaw } = require("../api/google.js");

const ROOT = P.join(__dirname, "..");
const BIN = P.join(ROOT, "node_modules", ".bin", "claude");
const OUT = P.join(ROOT, "config", "resolution-dates.json");
const TIMEOUT_MS = 240000;

const ASK = [
  "The PNG files in this directory are the rendered pages of one scanned corporate document",
  "(a board resolution, meeting minutes, or an authority letter) of a Pakistani company.",
  "Read every page image. Return ONE JSON object and nothing else:",
  '{"documentDate":"YYYY-MM-DD","meetingDate":"YYYY-MM-DD","dateBasis":"","subject":"","company":"","legible":true}',
  "RULES:",
  "- documentDate is the date printed ON the document (the date it was passed, signed or issued).",
  "- meetingDate is the date of the meeting the document records, if it states one.",
  "- dateBasis: say in a few words where on the page you read the date.",
  "- If a date is not printed anywhere, leave it empty. Never infer a date from a file name or a guess.",
  "- If the scan is too poor to read, set legible=false.",
].join(" ");

function askClaude(dir) {
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
      if (code !== 0) return finish({ ok: false, error: ((err || "").trim() || "exit " + code).slice(0, 200) });
      try { const j = JSON.parse(out); finish({ ok: !j.is_error, text: j.result }); }
      catch (e) { finish({ ok: false, error: "unparseable CLI output" }); }
    });
    try { child.stdin.end(); } catch (e) {}
  });
}
const parseFacts = (t) => { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } };

(async () => {
  const st = JSON.parse(fs.readFileSync(P.join(ROOT, "config", ".registers.json"), "utf8"));
  const targets = (st.registers.resolutions || []).filter((r) =>
    String(r.id || "").startsWith("RES-D-") && !r.date);
  console.log("undated folder-derived resolutions: " + targets.length);

  let out = {};
  try { out = JSON.parse(fs.readFileSync(OUT, "utf8")).records || {}; } catch (e) {}

  for (const r of targets) {
    if (out[r.id] && out[r.id].documentDate) continue;
    const f = (r.driveFiles || [])[0];
    if (!f) continue;
    const dir = fs.mkdtempSync(P.join(os.tmpdir(), "res-"));
    try {
      const res = await driveRaw("/files/" + f.id + "?alt=media&supportsAllDrives=true");
      if (!res.ok) { out[r.id] = { error: "HTTP " + res.status }; continue; }
      const src = P.join(dir, "src.pdf");
      fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
      try {
        cp.execSync("pdftoppm -r 150 -png -f 1 -l 4 " + JSON.stringify(src) + " " + JSON.stringify(P.join(dir, "page")),
          { timeout: 180000, stdio: "ignore" });
      } catch (e) {}
      fs.unlinkSync(src);
      const pages = fs.readdirSync(dir).filter((x) => x.endsWith(".png"));
      if (!pages.length) { out[r.id] = { error: "no page could be rendered" }; continue; }
      const a = await askClaude(dir);
      if (!a.ok) { out[r.id] = { error: a.error }; continue; }
      const facts = parseFacts(a.text) || {};
      out[r.id] = {
        documentDate: facts.documentDate || null, meetingDate: facts.meetingDate || null,
        dateBasis: facts.dateBasis || null, subject: facts.subject || null,
        legible: facts.legible !== false, pages: pages.length,
        source: { driveId: f.id, name: f.name, path: r.fullDrivePath || null },
      };
      console.log("  " + f.name.slice(0, 56) + "  ->  " + (facts.documentDate || facts.meetingDate || "(no date printed)"));
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
    fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), records: out }, null, 1));
  }
  fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), records: out }, null, 1));
  const dated = Object.values(out).filter((x) => x.documentDate || x.meetingDate).length;
  console.log("  dated from the document: " + dated + " of " + Object.keys(out).length);
  console.log("  wrote config/resolution-dates.json");
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
