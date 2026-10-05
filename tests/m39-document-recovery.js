// A DOCUMENT WHOSE FILE WAS NEVER STORED, PUT RIGHT IN PLACE.
//
// Request attachments were once recorded as {name, size, mime} and nothing
// else. The filename rendered, the row said "On file", and Preview and Download
// could not work because there had never been a file — only the memory of one
// being chosen in a file picker. Three such rows existed in this deployment.
//
// The fix is not to hide those rows. A record that a document was attached is
// part of the request, and deleting the request to fix one would throw away the
// approvals attached to it. So:
//
//   the row says what is actually wrong, in words a requester can act on
//   the file can be restored IN PLACE, keeping the row's id and its category
//   the original state is kept on the record and on the history
//   a mandatory requirement is NOT satisfied by a row with no bytes
//
// That last one is the point. Counting a file-less row toward the checklist
// would be the original defect wearing a tick.
//
//   node tests/m39-document-recovery.js
const H = require("./_harness.js");

H.runSuite("a document whose file was never stored can be put right in place", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M39_PORT", portFallback: "4976", prefix: "legalos-m39-" }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  /* Reproduce the live condition exactly: a row that exists on the request
     with its bytes absent from storage. Attach a real file, then remove the
     stored blob -- which is the state the seeded rows are in. */
  const seeded = await p.evaluate(async () => {
    const j = await (await fetch("/api/requests", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Legacy attachment probe", category: "Contract Drafting / Review",
        description: "probe", requestedByEmail: "maryam.haq@zameen.com" }) })).json();
    const id = (j.request || j).id;
    const at = await (await fetch("/api/requests/" + id + "/attachments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Term Sheet.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        dataBase64: btoa("original bytes") }) })).json();
    return { id, att: at.attachment && at.attachment.id };
  });
  const fs = require("fs"), path = require("path");
  /* Documents live in a folder per request now; the blob is removed from there
     to reproduce a row whose file has gone. */
  const upDir = path.join(sb.dir, "var", "request-uploads", seeded.id);
  let wiped = 0;
  for (const f of (fs.existsSync(upDir) ? fs.readdirSync(upDir) : [])) {
    if (f.startsWith(seeded.att) && !f.endsWith(".json")) { fs.unlinkSync(path.join(upDir, f)); wiped++; }
  }
  check("the probe reproduces the live state — a row whose file is gone", wiped > 0, wiped + " blob removed");

  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(2500);
  const before = await p.evaluate(async (id) => {
    const j = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    const r = (j.requests || []).find((x) => x.id === id);
    const a = (r.attachments || [])[0];
    const res = await fetch("/api/requests/" + id + "/attachments/" + a.id);
    return { onFile: a.onFile, name: a.name, status: res.status };
  }, seeded.id);
  check("a row with no bytes reports itself as unavailable, and will not serve",
    before.onFile === false && before.status === 404,
    "onFile=" + before.onFile + " · HTTP " + before.status);

  const rec = await p.evaluate(async (id, attId) => {
    const bytes = btoa("real docx bytes for the recovered document".repeat(4));
    const res = await fetch("/api/requests/" + id + "/attachments/" + attId + "/replace", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Term Sheet.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", dataBase64: bytes }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, seeded.id, seeded.att);
  check("it can be re-uploaded in place", rec.status === 200, "HTTP " + rec.status + " " + (rec.body.error || ""));

  const after = await p.evaluate(async (id) => {
    const j = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    const r = (j.requests || []).find((x) => x.id === id);
    const a = (r.attachments || [])[0];
    const res = await fetch("/api/requests/" + id + "/attachments/" + a.id);
    return { id: a.id, onFile: a.onFile, version: a.version, recovered: a.recovered,
      count: (r.attachments || []).length, status: res.status, bytes: (await res.arrayBuffer()).byteLength,
      history: (r.history || []).map((h) => h.action) };
  }, seeded.id);
  check("the row keeps its identity — same id, still one attachment",
    after.id === seeded.att && after.count === 1, after.id + " · " + after.count + " attachment");
  check("and now serves the real bytes", after.status === 200 && after.bytes > 50,
    after.status + " · " + after.bytes + " bytes");
  check("the original row is remembered, not erased",
    !!after.recovered && after.recovered.hadBytes === false && after.recovered.originalName === "Term Sheet.docx",
    JSON.stringify(after.recovered || {}));
  check("and the recovery is on the request's history",
    after.history.some((h) => /found missing/i.test(h)), after.history.join(" · "));
  check("it is marked as a later version", after.version === 2, "v" + after.version);

  /* Break it again, to see what the screen says about a row whose file is
     gone. Every stored file for this request goes; the rows stay. */
  for (const f of (fs.existsSync(upDir) ? fs.readdirSync(upDir) : [])) {
    if (!f.endsWith(".json")) fs.unlinkSync(path.join(upDir, f));
  }

  /* AND THE REQUESTER CAN SEE WHAT TO DO ABOUT IT, on their own screen. */
  await p.evaluate((id) => { location.hash = "#/workspace/" + id; }, seeded.id);
  await H.sleep(9000);
  const card = await p.evaluate(() => {
    const c = [...document.querySelectorAll(".card")].find((x) => /Documents in/i.test(x.innerText));
    return c ? c.innerText.replace(/\s+/g, " ") : "(no documents card)";
  });
  check("the request page explains the problem in plain words, on the documents card",
    /original file was not stored/i.test(card) || /File unavailable/i.test(card),
    (card.match(/.{0,60}not stored.{0,40}/i) || card.match(/File unavailable/i) || [card.slice(0, 90)])[0]);

  /* A MANDATORY REQUIREMENT IS NOT MET BY A ROW WITH NO FILE. */
  const CR = require("../api/contract-requests.js");
  const withBroken = CR.assess({ type: "CRF-02", values: {}, attachments: [
    { docType: "Title Documents", name: "Title.pdf", onFile: true },
    { docType: "Floor Plan", name: "Plan.pdf", onFile: false }] });
  const fp = withBroken.attachments.find((x) => x.docType === "Floor Plan");
  check("a checklist item is not satisfied by an attachment with no file behind it",
    fp && fp.uploaded === false && fp.unavailable === true,
    JSON.stringify(fp || {}));
  check("and it says so, rather than reading as never attached",
    withBroken.problems.some((x) => x.field === "Floor Plan" && /never stored/.test(x.message)),
    (withBroken.problems.find((x) => x.field === "Floor Plan") || {}).message);

  check("no page error", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();
});
