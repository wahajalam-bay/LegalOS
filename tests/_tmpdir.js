// A temp sandbox directory that removes itself.
//
// Three suites here predate the shared harness and build their own sandbox with
// mkdtempSync + rsync. None of them deleted it, so every full run left ~360MB
// of copies of the application in /tmp. On its own that is untidy; combined with
// the browser profiles that leaked the same way (see _puppeteer.js) it took the
// box to 100% and a regression died mid-flight on ENOSPC — which surfaces as a
// dozen unrelated suites failing, not as "the disk is full".
//
// Lives here rather than in _harness.js because those three suites deliberately
// do not depend on the harness, and rather than in each of them because three
// copies of a cleanup hook is three chances to get one subtly wrong.
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIRS = new Set();
let hooked = false;

function sweep() {
  for (const d of DIRS) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
  DIRS.clear();
}

function hook() {
  if (hooked) return;
  hooked = true;
  process.on("exit", sweep);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
    process.on(sig, () => { sweep(); process.exit(sig === "SIGINT" ? 130 : 143); });
  }
}

/* Make a temp directory that is deleted when this process ends, however it
   ends. Same signature as the mkdtempSync call it replaces. */
function make(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  DIRS.add(dir);
  hook();
  return dir;
}

/* THE STORES A SANDBOX MUST NOT INHERIT.
   Everything here is written by the RUNNING application — requests raised,
   cases and retainers recorded, contract requests drafted, files uploaded. It is
   operational data, not fixtures, and copying it in makes a suite's result
   depend on whatever somebody did in the live app that day: a 250,000 PKR
   retainer recorded through the UI failed the litigation spend suite, which
   asserts the totals it created and got those plus one it had never heard of.
   Kept here so the standalone suites and the harness exclude the same set. */
const RUNTIME_EXCLUDES = [
  "config/.sessions.json",
  "config/requests.json",
  "config/requests-deleted.json",
  "config/litigation-cases.json",
  "config/litigation-retainers.json",
  "config/contract-requests.json",
  "config/module-records.json",
  "config/deletion-requests.json",
  "config/request-docs",
  "var/request-uploads",
];

/* The rsync arguments for those, ready to splice into an argv list. */
const excludeArgs = () => RUNTIME_EXCLUDES.flatMap((p) => ["--exclude", p]);

module.exports = { make, sweep, RUNTIME_EXCLUDES, excludeArgs };
