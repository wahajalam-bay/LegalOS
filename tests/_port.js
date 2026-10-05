// Which port a test suite is allowed to talk to.
//
// THE PROBLEM THIS EXISTS FOR
// Thirteen suites defaulted to `LEGALOS_PORT || "4600"`, and on this box :4600
// is the DEPLOYED SERVICE. They do not build a sandbox — they drive whatever
// answers. So `node tests/run-all.js`, with no arguments, ran the whole suite
// against production: creating requests, approving them, publishing, mutating
// real records. run-all's own comment noted the danger and then left the default
// as it was.
//
// The same family of mistake already cost a real person their login: a tool
// wrote to live state that nobody expected it to touch, and nothing said so.
//
// So: a test may not address the live port. Not by default, not by forgetting an
// environment variable, not by copying an old command out of a runbook. If you
// genuinely mean to drive the deployed instance, you have to say so out loud
// with LEGALOS_ALLOW_LIVE=1, and the refusal below tells you how.
const LIVE_PORT = "4600";
const DEFAULT_TEST_PORT = "4610";

function resolvePort(envName = "LEGALOS_PORT", fallback = DEFAULT_TEST_PORT) {
  const chosen = String(process.env[envName] || fallback);
  if (chosen !== LIVE_PORT) return chosen;
  if (process.env.LEGALOS_ALLOW_LIVE === "1") {
    console.error(`[tests] WARNING: driving the LIVE instance on :${LIVE_PORT} because LEGALOS_ALLOW_LIVE=1.`);
    return chosen;
  }
  console.error(
    `\n[tests] REFUSING to run against :${LIVE_PORT} — that is the deployed LegalOS service.\n` +
    `        These suites create, approve and publish real records, and some rotate passwords.\n` +
    `        Run them on their own port instead:\n\n` +
    `            ${envName}=${DEFAULT_TEST_PORT} node ${process.argv[1] || "tests/<suite>.js"}\n\n` +
    `        or just: node tests/run-all.js   (it boots its own server on :${DEFAULT_TEST_PORT})\n` +
    `        If you really do mean production, set LEGALOS_ALLOW_LIVE=1.\n`);
  process.exit(2);
}

module.exports = { resolvePort, LIVE_PORT, DEFAULT_TEST_PORT };
