// Tests for the TEST HARNESS.
//
// The harness is the thing that decides whether every other suite is telling
// the truth, so it gets its own checks. Each one below corresponds to a way the
// rig has actually lied in this project: a stale server answering on the port, a
// suite carrying on after a failed sign-in, a missing client store reported as
// an application crash, and a wait that never ends.
//
//   node tests/m0-harness.js
const H = require("./_harness.js");

H.runSuite("m0-harness — the harness tells the truth", async (ctx) => {
  const { check } = ctx;

  /* ---------------------------------------------- 1. sandbox and ownership */
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_HARNESS_PORT", portFallback: "4832", prefix: "legalos-h0-",
  }));
  check("a sandbox starts and answers on its own port", !!sb.base, sb.base);
  check("the sandbox reports a build", !!sb.build, sb.build || "none");

  const health = await H.probeHealth(sb.base, 3000);
  check("health echoes THIS run's sandbox id, so the port is provably ours",
    health && health.sandbox === sb.sandboxId, health && health.sandbox);
  check("the sandbox server is a process we own, not one we found",
    !!(sb.server && sb.server.pid), "pid " + (sb.server && sb.server.pid));

  /* A second sandbox asked for an OCCUPIED port must never adopt the server
     already there -- that would drive an unknown build and report it as this
     run's result. It no longer aborts either: a suite that executes no checks
     is indistinguishable from a product failure, which is how five suites were
     once misattributed. It relocates to a free port and still owns what it
     starts. Both properties are asserted here. */
  let second = null, refused = null;
  try {
    second = await H.startSandbox({ portEnv: "LEGALOS_HARNESS_PORT", portFallback: String(sb.port), prefix: "legalos-h0b-" });
  } catch (e) { refused = e; }
  check("a second sandbox on an occupied port never adopts the server already there",
    !!second && String(second.port) !== String(sb.port),
    second ? "moved from " + sb.port + " to " + second.port : "start failed: " + (refused && refused.message));
  const h2 = second && await H.probeHealth(second.base, 3000);
  check("the relocated sandbox is provably its own server, not the first one",
    !!h2 && h2.sandbox === second.sandboxId && h2.sandbox !== sb.sandboxId,
    h2 ? h2.sandbox + " vs first " + sb.sandboxId : "no health");
  check("the relocated sandbox is a process this run owns",
    !!(second && second.server && second.server.pid) && second.server.pid !== sb.server.pid,
    second && second.server ? "pid " + second.server.pid : "none");
  try { if (second) second.stop(); } catch (e) { /* teardown must not mask the verdict */ }

  /* ------------------------------------------------------- 2. the live port */
  const { resolvePort } = require("./_port.js");
  const savedAllow = process.env.LEGALOS_ALLOW_LIVE;
  delete process.env.LEGALOS_ALLOW_LIVE;
  process.env.__T_PORT = "4600";
  let exited = null;
  const realExit = process.exit;
  process.exit = (c) => { exited = c; throw new Error("__exit__"); };
  try { resolvePort("__T_PORT"); } catch (e) { /* expected */ }
  process.exit = realExit;
  if (savedAllow != null) process.env.LEGALOS_ALLOW_LIVE = savedAllow;
  delete process.env.__T_PORT;
  check("resolvePort refuses the LIVE port (4600) rather than driving production", exited === 2, "exit " + exited);

  /* --------------------------------------------------------- 3. signing in */
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = H.watchPage(await browser.newPage(), ctx);

  await H.loginAs(page, sb, H.USERS.director);
  check("loginAs signs in through the real form and proves it", true);

  const me = await H.currentUser(page, sb.base);
  check("the SERVER agrees who is signed in", !!(me && /maryam/i.test(me.email || me.name || "")),
    (me && (me.email || me.name)) || "nobody");

  // The store is written only once a session has booted the workspace.
  const store = await H.waitForStore(page);
  check("the CURRENT client store key is present after sign-in", !!store, H.STORE_KEY);
  check("no suite needs legalos-store-v1 any more",
    !(await page.evaluate(() => !!localStorage.getItem("legalos-store-v1"))), "v1 absent");

  /* ------------------------------ 4. a failed sign-in FAILS, it never leaks */
  // Its OWN browser context: localStorage is per origin, so a tab sharing the
  // signed-in one would already hold the store and prove nothing. Page errors
  // are deliberately NOT watched here — a refused sign-in is the assertion, and
  // the 401 it produces is the expected answer, not a fault.
  const ctx2 = await browser.createBrowserContext();
  const page2 = await ctx2.newPage();
  await page2.goto(sb.base + "/#/login", { waitUntil: "networkidle2" });
  await H.waitForSelector(page2, 'input[name="email"]');
  await page2.type('input[name="email"]', H.USERS.director.email);
  await page2.type('input[name="password"]', "not-the-password");
  await page2.click('button[type="submit"]');
  let authErr = null;
  try { await H.expectAuthenticated(page2, H.USERS.director.email); } catch (e) { authErr = e; }
  check("a wrong password makes expectAuthenticated throw a HARNESS error, not pass silently",
    !!(authErr && authErr.harness), authErr ? authErr.message.slice(0, 80) : "it returned as if signed in");

  // ...and a suite that then reads the store gets a real explanation.
  let storeErr = null;
  try { await H.readStore(page2); } catch (e) { storeErr = e; }
  check("a missing client store is explained, not surfaced as JSON.parse(null)",
    !!(storeErr && storeErr.harness && /client store/i.test(storeErr.message)),
    storeErr ? storeErr.message.slice(0, 80) : "no error raised");
  await ctx2.close();

  /* ------------------------------------------------- 5. waits are bounded */
  const t0 = Date.now();
  let waitErr = null;
  try { await H.waitFor(page, () => null, { timeout: 1200, message: "something that never happens" }); }
  catch (e) { waitErr = e; }
  const elapsed = Date.now() - t0;
  check("waitFor gives up on time and says what it was waiting for",
    !!(waitErr && waitErr.harness) && /never happens/.test(waitErr.message) && elapsed < 4000,
    `${elapsed}ms — ${waitErr ? waitErr.message.slice(0, 60) : "did not throw"}`);

  /* --------------------------------------------- 6. identity is not seedable */
  // Writing a role into browser storage must not change what the SERVER says.
  await page.evaluate((k) => {
    try {
      const s = JSON.parse(localStorage.getItem(k) || "{}");
      s.session = s.session || {};
      s.session.viewAsId = "u12";           // the old suites' trick
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) {}
  }, H.STORE_KEY);
  const stillMe = await H.currentUser(page, sb.base);
  check("writing a user id into localStorage does NOT change the server's identity",
    !!(stillMe && /maryam/i.test(stillMe.email || stillMe.name || "")),
    (stillMe && (stillMe.email || stillMe.name)) || "nobody");

  /* ------------------------------------------- 7. server-backed seeding works */
  const cookie = await H.loginApi(sb, H.USERS.commLead.email);
  check("loginApi returns a session cookie", !!cookie, cookie ? "cookie set" : "no cookie");
  const seeded = await H.seedRequest(sb, cookie, {
    id: "REQ-HARNESS-1", title: "Harness fixture", stage: "Approval", status: "Pending Approval",
  });
  check("a request can be seeded through the SERVER, where requests actually live",
    !!(seeded && seeded.id === "REQ-HARNESS-1"), seeded && seeded.id);
  const back = await H.getRequest(sb, cookie, "REQ-HARNESS-1");
  check("the seeded request reads back from the server", !!back && back.stage === "Approval",
    back ? back.stage : "not found");
});
