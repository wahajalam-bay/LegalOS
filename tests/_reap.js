// A SUITE MUST NEVER OUTLIVE THE SERVER IT STARTED.
//
// A suite that spawns its own server cleans it up on the way out — but only on
// the paths it thought about. A run that is KILLED (Ctrl-C, a CI timeout, a
// shell tool's time cap) dies without running any of them, and the server it
// spawned survives as an orphan holding its port.
//
// The next run then finds that port occupied, refuses to start, exits having
// executed no checks, and is reported as a PRODUCT failure. Five suites were
// misattributed exactly that way.
//
// reap(child) registers a spawned process to be stopped on every exit path.
// It uses the process HANDLE it was given — never a pattern search, which
// could match something this run does not own.
const net = require("net");

const CHILDREN = new Set();
let installed = false;

function stopAll() {
  for (const c of [...CHILDREN]) {
    try { c.kill("SIGTERM"); } catch (e) { /* teardown must not mask the failure */ }
  }
  CHILDREN.clear();
}

function install() {
  if (installed) return;
  installed = true;
  process.on("exit", stopAll);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
    process.on(sig, () => { stopAll(); process.exit(sig === "SIGINT" ? 130 : 143); });
  }
  process.on("uncaughtException", (e) => {
    stopAll();
    console.error("\n  uncaught exception: " + (e && e.stack ? e.stack : e));
    process.exit(1);
  });
}

function reap(child) {
  install();
  if (!child) return child;
  CHILDREN.add(child);
  child.on("exit", () => CHILDREN.delete(child));
  return child;
}

/* A port the OS says is free right now.
   A suite that aborts because its fixed port is held executes no checks, and a
   suite with no checks reads exactly like a product failure. Relocating keeps
   the suite honest: it still starts its OWN server and still proves something,
   and the collision is reported rather than swallowed. */
/* `listen` is ASYNCHRONOUS: calling address() straight after it returns null,
   so a synchronous version of this handed back "null.port" and threw at the
   exact moment it was needed -- when a port really was occupied. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(String(p)));
    });
  });
}

/* A synchronous variant, for the port guards that run inside plain functions.
   It asks the OS what is listening and picks a high port that is not, rather
   than binding -- binding cannot be done synchronously in node. */
function freePortSync() {
  const { execSync } = require("child_process");
  let inUse = "";
  try { inUse = execSync("ss -tln 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { inUse = ""; }
  for (let i = 0; i < 200; i++) {
    const p = 20000 + Math.floor(Math.random() * 20000);
    if (!new RegExp(":" + p + "\\b").test(inUse)) return String(p);
  }
  return String(20000 + Math.floor(Math.random() * 20000));
}

module.exports = { reap, stopAll, freePort, freePortSync };
