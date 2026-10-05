/* A REMOVED REQUEST DOES NOT COME BACK BECAUSE A BROWSER STILL REMEMBERS IT.
 *
 * Every client keeps its own copy of the requests it raised, and on boot
 * `hydrateRequests()` re-pushes anything the server does not have. That exists
 * for a good reason -- a request raised while the server was unreachable must
 * not be stranded in one person's browser -- but it cannot tell "never
 * received" from "deliberately removed". So requests cleared from the server
 * reappeared on the register the next time anyone opened the app, and the only
 * way to notice was to look twice, hours apart.
 *
 * The id is remembered server-side instead, which is the only place the
 * question can be answered for every browser at once.
 *
 *   node tests/m49-deleted-stays-deleted.js
 */
const H = require("./_harness.js");

H.runSuite("a removed request stays removed", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M49_PORT", portFallback: "5094", prefix: "legalos-m49-" }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await H.asUser(browser, sb, H.USERS.commLead, ctx);

  const raise = (id, title) => page.evaluate(async (i, t) => {
    const r = await fetch("/api/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: i, title: t, category: "Contract Drafting / Review",
        description: "tombstone probe", channel: "portal" }) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, id: (j.request && j.request.id) || j.id || null, error: j.error || "" };
  }, id, title);

  const made = await raise("REQ-TOMBSTONE-1", "Raised, then removed");
  check("a request is raised and the server keeps it", made.status === 201 && made.id === "REQ-TOMBSTONE-1",
    "HTTP " + made.status + " · " + made.id);

  /* REMOVED THE WAY THE CLEANUP TOOLING REMOVES ONE: from outside the running
     server. The tooling is a separate process that edits the store on disk and
     records the id, while the service keeps serving -- so that is what is driven
     here. Requiring the server's module inside the TEST process and calling it
     would prove nothing about the server: it would be a second copy of the
     engine, reading its own state. (m38 made exactly that mistake and died on a
     null for sixty checks.) */
  const fs = require("fs");
  const path = require("path");
  const storePath = path.join(sb.dir, "config", "requests.json");
  const tombPath = path.join(sb.dir, "config", "requests-deleted.json");

  const before = JSON.parse(fs.readFileSync(storePath, "utf8")).requests || [];
  const kept = before.filter((x) => x.id !== "REQ-TOMBSTONE-1");
  check("the store holds it before removal, and loses it on removal",
    before.length - kept.length === 1, before.length + " → " + kept.length);
  fs.writeFileSync(storePath, JSON.stringify({ requests: kept }, null, 2));
  fs.writeFileSync(tombPath, JSON.stringify({ deleted: ["REQ-TOMBSTONE-1"] }, null, 2));

  /* THE RESURRECTION. A browser that still holds the request re-pushes it with
     the SAME id, exactly as hydrateRequests does on every boot. */
  const again = await raise("REQ-TOMBSTONE-1", "Raised, then removed");
  check("the RUNNING server refuses the re-push — no restart needed",
    again.status >= 400 && /deleted/i.test(again.error || ""),
    "HTTP " + again.status + " · " + (again.error || "(no error given)"));

  /* And refused properly: not quietly re-created under a fresh id, which would
     put the same request back on the register with a different number and be far
     harder to notice than an outright return. */
  const minted = (again.id || "");
  check("and no new id was minted for it", minted === "" || minted === "REQ-TOMBSTONE-1",
    minted ? "server returned " + minted : "nothing created");

  /* THE WHOLE SEQUENCE, THE WAY IT ACTUALLY HAPPENS: the store is edited and
     the id recorded while the service runs, then the service is restarted. The
     server keeps its requests in memory, so until it reloads it still SERVES the
     copy it had -- which is why the operational procedure restarts, and why this
     asserts the state after one rather than pretending a file edit is enough. */
  await sb.restart();
  /* Sessions do not survive the restart, so sign in again before asking the
     server anything. Without this the next calls answer 401 -- and a check
     looking for "refused" would pass on the wrong refusal, which is worse than
     failing: it would report the tombstone working when nothing had been
     tested at all. */
  await H.loginAs(page, sb, H.USERS.commLead);
  const afterRestart = await page.evaluate(async () => {
    const r = await fetch("/api/requests");
    const rows = (await r.json()).requests || [];
    return rows.filter((x) => /Raised, then removed/.test(x.title || "")).map((x) => x.id);
  });
  check("after the restart it is gone from the register", afterRestart.length === 0,
    afterRestart.length ? "still there as " + afterRestart.join(", ") : "gone");

  /* And STAYS gone: a browser opening the app now re-pushes it again, and is
     refused again. This is the check that would have caught the nine requests
     that came back. */
  const onceMore = await raise("REQ-TOMBSTONE-1", "Raised, then removed");
  const finalRows = await page.evaluate(async () => {
    const r = await fetch("/api/requests");
    const rows = (await r.json()).requests || [];
    return rows.filter((x) => /Raised, then removed/.test(x.title || "")).map((x) => x.id);
  });
  check("and a browser re-pushing it after the restart still cannot bring it back",
    onceMore.status === 400 && /deleted/i.test(onceMore.error || "") && finalRows.length === 0,
    "HTTP " + onceMore.status + " " + (onceMore.error || "") +
      " · register holds " + (finalRows.join(", ") || "none"));

  /* The retry this feature exists for still works: an id the server never saw
     is not tombstoned, so pushing it succeeds. */
  const stranded = await raise("REQ-NEVER-ARRIVED-1", "Raised while the server was unreachable");
  check("a request the server never received can still be pushed up",
    stranded.status === 201 && stranded.id === "REQ-NEVER-ARRIVED-1",
    "HTTP " + stranded.status + " · " + stranded.id);
});
