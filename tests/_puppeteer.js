// puppeteer-core, loadable from CommonJS.
//
// puppeteer-core ships as an ES module ("type": "module"), so `require()` of it
// throws ERR_REQUIRE_ESM. Every browser-driven suite here is CommonJS and did
// exactly that, so all twelve of them — and the thirteen that depend on the
// shared harness — died on their first line, in under two seconds, before a
// single assertion ran. A whole class of UI, accessibility and RBAC coverage was
// dark, and the scoreboard reported it as twenty-five product failures.
//
// The library did nothing wrong; it moved to ESM, which callers are expected to
// follow. Dynamic import() is available inside CommonJS, so the fix is to defer
// the load rather than rewrite twenty-five suites as modules.
//
// The shim keeps the call sites identical — `puppeteer.launch({...})` still
// works — because a mechanical edit across twenty-five test files is a good way
// to introduce a subtle difference in one of them.
const fs = require("fs");
const os = require("os");
const path = require("path");

let loaded = null;

async function core() {
  if (!loaded) {
    const m = await import("puppeteer-core");
    loaded = m.default || m;
  }
  return loaded;
}

/* THE BROWSER PROFILE IS OURS TO DELETE.
 *
 * Puppeteer makes a temp profile per launch and removes it when the browser
 * closes — but these suites end with process.exit(), and several call
 * browser.close() without awaiting it, so Chrome is killed before it can clean
 * up. A profile is ~85MB and eleven suites launch their own browser, so one
 * full run leaked about a gigabyte. A day of runs left 503 of them and 4GB in
 * /tmp; the box reached 100% and a regression died mid-flight on ENOSPC, which
 * reads as a dozen unrelated suites failing rather than as a full disk.
 *
 * Fixed HERE rather than in each suite: every one of them already goes through
 * this shim, so they all get it without eleven near-identical edits — which is
 * the same reasoning that put the ESM workaround here in the first place.
 * A caller that passes its own userDataDir keeps it and cleans up itself.
 */
const PROFILES = new Set();
let hooked = false;

function sweep() {
  for (const dir of PROFILES) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
  PROFILES.clear();
}

function hook() {
  if (hooked) return;
  hooked = true;
  process.on("exit", sweep);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
    process.on(sig, () => { sweep(); process.exit(sig === "SIGINT" ? 130 : 143); });
  }
}

module.exports = {
  // `launch` is the only entry point these suites use; the grep that established
  // that is worth repeating before adding anything here.
  launch: async (opts) => {
    const o = Object.assign({}, opts);
    if (!o.userDataDir) {
      o.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "legalos-chrome-"));
      PROFILES.add(o.userDataDir);
      hook();
    }
    return (await core()).launch(o);
  },
  core,
  /* Exposed so the harness can clear profiles at the same moment it reaps
     sandboxes, rather than waiting for the process to exit. */
  cleanProfiles: sweep,
};
