/* THE TOOL NAMES, IN ONE PLACE, VERIFIED.
 *
 * The Claude CLI refuses an entire invocation if a single tool name in a
 * permission rule does not exist — "Permission deny rule MultiEdit matches no
 * known tool". Two stale names in one deny-list therefore broke EVERY assistant
 * request, and the failure was invisible from the outside: the screen rendered,
 * the routes answered, and every answer was an error. The source looked
 * correctly locked down the whole time.
 *
 * So tool names live here, once, and every caller uses this module:
 *
 *   KNOWN        the names this CLI actually accepts
 *   LOCKED_DOWN  everything a server-side call must refuse
 *   validate()   which configured names are wrong, checked at startup
 *   denyArgs()   argv for a call, with only names that exist
 *
 * The rule this enforces: a configuration mistake must FAIL LOUDLY and must not
 * take the feature down. An unknown name is dropped from the arguments, and the
 * fact that it was dropped is reported — so the lock-down degrades by exactly
 * one tool and an administrator can see why, instead of every request dying.
 */
const { execFileSync } = require("child_process");
const fs = require("fs"), P = require("path");

const ROOT = P.join(__dirname, "..");
const BIN = P.join(ROOT, "node_modules", ".bin", "claude");

/* MultiEdit and SlashCommand are NOT tools and must never reappear here.
   NOTE: this list is curated, and on the CLI installed today it CANNOT be
   verified by probing — see probeName below, which found that version 2.1.278
   accepts "NotARealTool" in a permission rule without complaint. The version
   that caused the outage did validate names and refused the whole invocation.
   So the CLI's tolerance is not something to rely on: it varies by version, and
   this list plus validate() is the defence that does not. */
const KNOWN = [
  "Bash", "Read", "Write", "Edit", "NotebookEdit",
  "Glob", "Grep", "WebFetch", "WebSearch", "Task", "TodoWrite",
];

/* Everything a LegalOS server call must refuse. A web request reaches this
   process; nothing it triggers may touch the disk or the network. */
const LOCKED_DOWN = KNOWN.slice();

/* Names a caller asked for that this CLI does not know. Cheap: pure comparison,
   no process spawned, so it is safe to call on every request. */
function validate(names) {
  const bad = (names || []).filter((n) => !KNOWN.includes(n));
  return { ok: bad.length === 0, unknown: bad, known: (names || []).filter((n) => KNOWN.includes(n)) };
}

/* Ask the CLI itself whether it knows a name — WITH A NEGATIVE CONTROL.
 *
 * The obvious probe is to pass the name in a permission rule and see whether the
 * CLI complains. That works only if the CLI complains about anything, and the
 * installed version does not: it accepts "NotARealTool" as happily as "Bash".
 * A probe that cannot fail proves nothing, and one that reports "available" for
 * a name nobody has ever implemented is worse than no probe at all, because a
 * test built on it passes while asserting a falsehood.
 *
 * So every probe first asks about a name that certainly does not exist. If the
 * CLI accepts that too, the probe reports that this CLI does not validate names
 * and declines to answer, rather than guessing. */
const CONTROL_NAME = "ZzNotARealToolZz";

function probeRaw(name) {
  try {
    const out = execFileSync(BIN, ["-p", "hi", "--output-format", "json", "--disallowed-tools", name],
      { encoding: "utf8", timeout: 120000, env: Object.assign({}, process.env, { CLAUDECODE: "" }) });
    return /matches no known tool/i.test(out) ? "rejected" : "accepted";
  } catch (e) {
    const text = String((e && (e.stdout || e.stderr || e.message)) || "");
    if (/matches no known tool/i.test(text)) return "rejected";
    return "inconclusive";
  }
}

function probeName(name) {
  if (!fs.existsSync(BIN)) return { available: null, reason: "cli-not-installed" };
  const control = probeRaw(CONTROL_NAME);
  if (control !== "rejected") {
    return {
      available: null,
      reason: "cli-does-not-validate-tool-names",
      detail: "this CLI accepted " + CONTROL_NAME + ", so accepting a name proves nothing about it",
    };
  }
  const r = probeRaw(name);
  if (r === "inconclusive") return { available: null, reason: "probe-inconclusive" };
  return { available: r === "accepted" };
}

/* argv fragments for a locked-down call, plus what was dropped. */
function denyArgs(names) {
  const v = validate(names || LOCKED_DOWN);
  const args = [];
  for (const n of v.known) args.push("--disallowed-tools", n);
  return { args, dropped: v.unknown };
}

/* The admin-visible health of the configuration. This is what stops a broken
   assistant from looking healthy. */
function configurationStatus() {
  const v = validate(LOCKED_DOWN);
  return {
    installed: fs.existsSync(BIN),
    toolNamesConfigured: LOCKED_DOWN.length,
    unknownToolNames: v.unknown,
    error: v.ok ? null : "ASSISTANT_CONFIGURATION_ERROR",
    detail: v.ok ? null
      : "These tool names do not exist and would be refused by the CLI: " + v.unknown.join(", "),
  };
}

module.exports = { KNOWN, LOCKED_DOWN, validate, denyArgs, probeName, configurationStatus };
