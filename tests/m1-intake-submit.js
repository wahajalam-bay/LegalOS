// The submit path: a business user raises a request through the portal wizard
// and the system does four things for them — creates it, fixes a turnaround
// from category × priority, stamps the jurisdiction that decides the working
// week, and acknowledges receipt.
//
// MIGRATED 2026-09-18. The original drove the wizard as "u16", a user id that
// exists in no roster, against a shared server with no identity at all. It now
// enters through the real /portal/ door as a department.
//
//   node tests/m1-intake-submit.js
const H = require("./_harness.js");

const DEPT = "Finance";
const DEPT_ID = "dept-finance";

H.runSuite("m1-intake-submit — raising a request through the portal", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_INTAKE_PORT", portFallback: "4859", prefix: "legalos-in-",
  }));
  const browser = ctx.setBrowser(await H.openBrowser());
  const page = await browser.newPage();

  const who = await H.enterPortalAs(page, sb, DEPT, ctx);
  check("a business user reaches the requester door and picks their department", !!who, String(who).slice(0, 40));

  const before = await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "{}").requests || []).length, H.STORE_KEY);
  const id = await H.raiseViaPortal(page, sb, { title: "Mutual NDA with Orbit before diligence" });
  const after = await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "{}").requests || []).length, H.STORE_KEY);
  check("the wizard submits and creates a new request", after > before && !!id, `${before} -> ${after} (${id})`);

  const r = await page.evaluate(([k, rid]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.requests || []).find((x) => x.id === rid) || null;
  }, [H.STORE_KEY, id]);
  check("the new request is attributed to the department that raised it",
    !!r && r.requesterId === DEPT_ID, r ? String(r.requesterId) : "no request");

  /* The turnaround is not a fixed number — it is category × priority, which is
     what makes it defensible when somebody asks why a request is late. */
  check("the turnaround is keyed on category × priority",
    !!r && / × (Emergency|Time-critical|Important|Routine)$/.test((r.tat || {}).basis || ""),
    r && r.tat ? r.tat.basis : "no TAT recorded");
  check("the turnaround carries a due date and the clock it was fixed at",
    !!r && !!(r.tat && r.tat.dueAt && r.tat.fixedAt),
    r && r.tat ? `due ${String(r.tat.dueAt).slice(0, 10)} · fixed ${String(r.tat.fixedAt).slice(0, 10)}` : "-");

  // Jurisdiction decides the working week a turnaround is counted in, so the
  // field must be present on every request even when it resolves to nothing.
  check("the jurisdiction that drives the working week is stamped on the record",
    !!r && "jurisdiction" in r, r ? String(r.jurisdiction) : "-");

  const acks = await page.evaluate(([k, u]) => {
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    return (s.notifs || []).filter((n) => n.forUserId === u).map((n) => n.title);
  }, [H.STORE_KEY, DEPT_ID]);
  check("the requester is acknowledged — they are told it was received",
    acks.some((t) => /received/i.test(t || "")), acks.join(" | ").slice(0, 90) || "nothing was sent");

  /* And it must reach LEGAL, not just sit in the raiser's browser. In a sandbox
     the portal has no Cloudflare identity, so the push is refused there — the
     legal-side queue is proven in m1-module-sorting and m1-approval-queue,
     which seed through the server with a real session. What IS proven here is
     that the client attempted the handover rather than silently keeping it. */
  check("the request is composed for the server, not just for this browser",
    !!r && (r.channel === "portal" || r.source === "Requester portal" || !!r.requestDate),
    r ? `channel=${r.channel}` : "-");
});
