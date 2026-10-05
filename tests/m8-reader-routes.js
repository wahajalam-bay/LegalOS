// THE READER'S OWN FAILURE MODES.
//
// Four defects in this pipeline all shared one shape: the TOOLING's limitation
// was written down as a fact about the DOCUMENT. A rate limit became "this
// document cannot be read". A .docx sent to a page-reader became "no content".
// A photograph of a signed page sent to a text extractor became "unreadable".
//
// That is the most damaging kind of error here, because the output looks like
// diligence. Every check below exists to keep one of those from returning.
//
//   node tests/m8-reader-routes.js
const H = require("./_harness.js");
const fs = require("fs"), P = require("path"), cp = require("child_process"), os = require("os");

const ROOT = P.join(__dirname, "..");

/* A live CLI probe costs a real call on the same account as any reading pass
   that happens to be running, and a burst limit hit by the test would slow the
   reader down. So the two live checks below stand aside while a pass is in
   flight, and say so rather than reporting a pass they did not make. */
function readerRunning() {
  try {
    const out = cp.execSync("ps -eo cmd 2>/dev/null || true", { encoding: "utf8" });
    return /tools\/commercial-vision/.test(out);
  } catch (e) { return false; }
}

H.runSuite("m8-reader-routes — a tool's limits are never recorded as a document's", async (ctx) => {
  const { check } = ctx;

  /* ------------------------------------------- §14 tool names must be real */
  const tools = require("../api/claude-tools.js");
  check("the tool list is centralised, not copied per caller",
    Array.isArray(tools.KNOWN) && tools.KNOWN.length > 5, tools.KNOWN.join(","));
  check("MultiEdit is not treated as a tool — it never was",
    !tools.KNOWN.includes("MultiEdit"), "known: " + tools.KNOWN.join(","));
  check("SlashCommand is not treated as a tool",
    !tools.KNOWN.includes("SlashCommand"), "known: " + tools.KNOWN.join(","));

  const v = tools.validate(["Bash", "MultiEdit", "SlashCommand", "Read"]);
  check("an unknown tool name is identified rather than passed through",
    !v.ok && v.unknown.length === 2 && v.known.length === 2, JSON.stringify(v));

  const deny = tools.denyArgs(["Bash", "MultiEdit"]);
  check("one bad name cannot break the whole invocation — it is dropped and reported",
    deny.args.join(" ") === "--disallowed-tools Bash" && deny.dropped.join(",") === "MultiEdit",
    JSON.stringify(deny));

  const cfg = tools.configurationStatus();
  check("the configured deny-list is valid for this CLI",
    cfg.error === null, cfg.detail || "no unknown tool names");

  /* Probing the CLI was meant to stop the curated list drifting. It cannot, on
     the installed version: 2.1.278 accepts a deliberately invented name in a
     permission rule without complaint, so "the CLI accepted it" says nothing.
     What is worth asserting is that the probe KNOWS that — a probe that returns
     available:true for a name nobody implemented would make this suite certify
     a falsehood, which is worse than having no probe. */
  const live = readerRunning() ? { reason: "reader-busy" } : tools.probeName("MultiEdit");
  if (live.reason === "cli-not-installed" || live.reason === "reader-busy") {
    check("tool probing stood aside (" + live.reason + ")", true, "skipped, not asserted");
  } else if (live.reason === "cli-does-not-validate-tool-names") {
    check("the probe reports that this CLI cannot confirm a tool name, instead of guessing",
      live.available === null, live.detail || "");
  } else {
    check("where the CLI does validate, it rejects a name that does not exist",
      live.available === false, JSON.stringify(live));
  }

  /* -------------------------------- §15 a broken configuration is visible */
  const claude = require("../api/claude-cli.js");
  const st = claude.status();
  check("assistant status reports configuration health, not just availability",
    Object.prototype.hasOwnProperty.call(st, "configurationError"), JSON.stringify(st).slice(0, 120));
  check("with a valid configuration the error is null, not hidden",
    st.configurationError === null, String(st.configurationError));

  /* ------------------------------ §8 every file type reaches the right reader */
  const vision = P.join(ROOT, "tools", "commercial-vision.js");
  const src = fs.readFileSync(vision, "utf8");

  check("image documents are read as pages, not sent to a text extractor",
    /jpe\?g\|jfif\|png\|gif\|webp/.test(src) && /asPage/.test(src),
    "the image branch renames the file to a page and reads it");
  check("Office documents have their text extracted before reading",
    /mammoth/.test(src) && /word-extractor/.test(src),
    "docx via mammoth, legacy .doc via word-extractor");
  check("PDFs are rendered to page images",
    /pdftoppm/.test(src), "pdftoppm render step present");
  check("the last pages are always rendered, never only the first",
    /SKIM_LAST/.test(src) && /total - SKIM_LAST \+ 1/.test(src),
    "an unsigned draft and a signed agreement differ only at the execution block");
  check("workbooks are excluded from page reading — they are register sources",
    /xlsx\?\|tmp/.test(src), "workbook exclusion present");

  /* --------------- the extraction libraries must be DECLARED, not incidental */
  /* They once vanished because they were installed without being saved, and an
     unrelated npm install pruned them. Nothing failed loudly: twenty-three real
     contracts simply extracted to "". Declaring them is what makes npm keep
     them, so the declaration itself is the thing worth testing. */
  const pkg = JSON.parse(fs.readFileSync(P.join(ROOT, "package.json"), "utf8"));
  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  /* The assistant's CLI belongs here too. The same prune removed it, which would
     have taken the in-app assistant down while every other test stayed green. */
  for (const lib of ["mammoth", "word-extractor", "@anthropic-ai/claude-code"]) {
    check("`" + lib + "` is a declared dependency, so an unrelated install cannot prune it",
      !!deps[lib], deps[lib] || "NOT DECLARED");
    let loaded = true;
    if (lib === "@anthropic-ai/claude-code") {
      loaded = fs.existsSync(P.join(ROOT, "node_modules", ".bin", "claude"));
    } else {
      try { require(lib); } catch (e) { loaded = false; }
    }
    check("`" + lib + "` is actually installed", loaded, loaded ? "present" : "missing from node_modules");
  }

  const prep = fs.readFileSync(P.join(ROOT, "tools", "commercial-prepare.js"), "utf8");
  check("a missing extractor is its own outcome, never an empty document",
    /EXTRACTOR_MISSING/.test(prep) && /extractorMissing/.test(prep),
    "prepare reports EXTRACTOR_MISSING instead of falling through to OFFICE_EMPTY");
  check("the PDF text layer is tried before any page is rendered",
    /pdftotext/.test(prep) && prep.indexOf("pdftotext") < prep.indexOf("pdftoppm"),
    "text extraction precedes rendering, so only true scans cost a page read");

  /* ------------------------ a transient failure must never become a verdict */
  check("transient CLI failures are retried with backoff, not recorded as unreadable",
    /runClaudeWithRetry/.test(src) && /transient/.test(src),
    "retry wrapper present");
  check("the backoff outlasts a burst limit rather than a momentary blip",
    /Math\.min\(60000/.test(src), "backoff runs to about a minute");

  /* Nothing may be called unreadable while an untried route remains. */
  const recovery = (() => {
    try { return JSON.parse(fs.readFileSync(P.join(ROOT, "audit", "commercial-recovery.json"), "utf8")); }
    catch (e) { return []; }
  })();
  const wrongly = recovery.filter((r) => r.state === "CONTENT_UNREADABLE"
    && /exit 1|rate|timeout|no text could be extracted/i.test(String(r.cause || "")));
  check("no document is marked unreadable for a reason that is about the tooling",
    wrongly.length === 0,
    wrongly.slice(0, 3).map((r) => r.filename + ": " + r.cause).join(" | ") || "none");

  /* --------------------------- the reader really does read a rendered page */
  if (!fs.existsSync(P.join(ROOT, "node_modules", ".bin", "claude")) || readerRunning()) {
    check("live page-read stood aside (CLI unavailable or a reading pass is running)", true, "skipped, not asserted");
  } else {
    // A synthetic signed page: no real party, no real deal.
    const dir = fs.mkdtempSync(P.join(os.tmpdir(), "legalos-fixture-"));
    try {
      const ps = P.join(dir, "page.ps");
      fs.writeFileSync(ps, [
        "%!PS", "/Helvetica findfont 22 scalefont setfont",
        "72 720 moveto (LEASE AGREEMENT) show",
        "/Helvetica findfont 13 scalefont setfont",
        "72 690 moveto (between Northwind Holdings \\(Private\\) Limited and Blue Harbour Limited) show",
        "72 660 moveto (in respect of the Maple Court project.) show",
        "72 560 moveto (IN WITNESS WHEREOF the parties have executed this Agreement.) show",
        "72 520 moveto (Signed: ____A. Rahman____   Signed: ____S. Iqbal____) show",
        "showpage",
      ].join("\n"));
      let rendered = 0;
      try {
        cp.execSync("ps2pdf " + JSON.stringify(ps) + " " + JSON.stringify(P.join(dir, "d.pdf")) + " 2>/dev/null", { timeout: 60000 });
        cp.execSync("pdftoppm -r 140 -png " + JSON.stringify(P.join(dir, "d.pdf")) + " " + JSON.stringify(P.join(dir, "page")), { timeout: 60000, stdio: "ignore" });
        fs.unlinkSync(P.join(dir, "d.pdf"));
        rendered = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).length;
      } catch (e) { rendered = 0; }
      try { fs.unlinkSync(ps); } catch (e) {}

      if (!rendered) {
        check("live page-read skipped: no PostScript renderer on this host", true, "skipped");
      } else {
        const bin = P.join(ROOT, "node_modules", ".bin", "claude");
        const env = Object.assign({}, process.env);
        for (const k of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_ENTRYPOINT"]) delete env[k];
        let out = "";
        try {
          out = cp.execFileSync(bin, ["-p",
            'Read the page image(s) here. Reply with ONLY {"documentType":"","executed":true|false,"project":""}.',
            "--output-format", "json", "--add-dir", dir,
            "--allowed-tools", "Read", "--allowed-tools", "Glob", "--disallowed-tools", "Bash"],
          { cwd: dir, env, encoding: "utf8", timeout: 180000 });
        } catch (e) { out = ""; }
        const m = String(out).match(/\{[\s\S]*\}/);
        let facts = null;
        try { facts = JSON.parse(JSON.parse(out).result.match(/\{[\s\S]*\}/)[0]); } catch (e) { facts = null; }
        check("a rendered page with visible signatures reads as EXECUTED",
          !!facts && facts.executed === true, JSON.stringify(facts));
        check("the project named on the page is recovered",
          !!facts && /maple/i.test(String(facts.project || "")), JSON.stringify(facts && facts.project));
      }
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  }
});
