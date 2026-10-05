/* NO PARSER, NO BUILD.
 *
 * Installing an image library once pruned `mammoth`, `word-extractor` and the
 * assistant's CLI from node_modules, because none of them had been saved to
 * package.json. Nothing failed. Twenty-three real contracts — employment
 * contracts, a bank cash-management SLA, a joint venture agreement — extracted
 * to the empty string, and every one of them would have been written down as a
 * document with no text layer.
 *
 * That is the worst shape a failure can take here: the pipeline stayed green
 * and quietly replaced real contracts with nothing.
 *
 * So the readers are now a PRECONDITION of building the dataset. If one is
 * missing the candidate build is refused, the last good dataset keeps being
 * served, and Data Health says which reader went and why the data is older than
 * it should be. A stale but honest register beats a fresh one full of holes.
 */
const fs = require("fs"), P = require("path");
const { execFileSync } = require("child_process");

const ROOT = P.join(__dirname, "..");

/* Each entry says what it reads, so a failure names the consequence rather than
   a package. "word-extractor is missing" means nothing to the person on call;
   "legacy .doc files cannot be read" tells them what breaks. */
const REQUIRED = [
  { id: "mammoth", kind: "node", reads: "Word .docx documents" },
  { id: "word-extractor", kind: "node", reads: "legacy Word .doc documents" },
  { id: "jimp", kind: "node", reads: "page images, for the reading pass" },
  { id: "pdftotext", kind: "bin", reads: "the text layer of PDFs" },
  { id: "pdftoppm", kind: "bin", reads: "PDF pages, rendered for visual reading" },
  { id: "pdfinfo", kind: "bin", reads: "PDF page counts" },
];

/* The assistant's CLI is required for the in-app assistant, not for building the
   dataset. Losing it must be visible, but it must NOT stop the registers being
   rebuilt — the two failures have different blast radii. */
const REQUIRED_FOR_ASSISTANT = [
  { id: "@anthropic-ai/claude-code", kind: "cli", reads: "the in-app assistant" },
];

function present(item) {
  try {
    if (item.kind === "node") { require.resolve(item.id, { paths: [ROOT] }); return true; }
    if (item.kind === "cli") return fs.existsSync(P.join(ROOT, "node_modules", ".bin", "claude"));
    execFileSync("which", [item.id], { stdio: "ignore" });
    return true;
  } catch (e) { return false; }
}

/* Cheap enough to call on every rebuild: a require.resolve and three `which`
   lookups. It is checked every time precisely because the failure mode is a
   dependency vanishing between builds. */
function check() {
  const missing = REQUIRED.filter((r) => !present(r));
  const assistantMissing = REQUIRED_FOR_ASSISTANT.filter((r) => !present(r));
  return {
    ok: missing.length === 0,
    missing: missing.map((m) => ({ id: m.id, reads: m.reads })),
    assistantDegraded: assistantMissing.length > 0,
    assistantMissing: assistantMissing.map((m) => ({ id: m.id, reads: m.reads })),
    checked: REQUIRED.length + REQUIRED_FOR_ASSISTANT.length,
    detail: missing.length
      ? "Cannot read: " + missing.map((m) => m.reads).join("; ")
        + ". Building now would record these documents as having no text."
      : null,
  };
}

/* Thrown by the rebuild rather than returned, so a caller cannot forget to look
   at it and promote a hollow dataset by accident. */
class ParserGateError extends Error {
  constructor(status) {
    super("PARSER_GATE: " + status.detail);
    this.name = "ParserGateError";
    this.status = status;
    this.degraded = true;
  }
}

module.exports = { check, REQUIRED, REQUIRED_FOR_ASSISTANT, ParserGateError };
