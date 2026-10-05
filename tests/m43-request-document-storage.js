// A REQUESTER'S DOCUMENT IS HELD BY LEGALOS, AND LEGAL CAN READ IT.
//
// What this replaces, in order of how badly it misled people:
//
//   The Raise form asked the requester to TYPE a filename and attached that
//   string. The Intake form was worse — it invented "Supporting-document-1.pdf"
//   at a made-up size. Either way the request reached Legal naming documents
//   that had never been uploaded.
//
//   Each upload was then echoed into the repository carrying a minted
//   drive.google.com URL for a file that has never been in Drive (the service
//   account is read-only there by design), plus OCR 0%, no page count and no
//   Sr No — fields a requester upload does not have. The same document appeared
//   twice on one card, once as fiction.
//
//   Storage was flat: var/request-uploads/<ATT-ID>.bin, no extension, no
//   metadata. Now it is a folder per request with the real extension and a
//   sidecar saying what the document is, who sent it and its checksum — so the
//   documents for one piece of work sit together and can be found on disk.
//
//   node tests/m43-request-document-storage.js
const H = require("./_harness.js");
const D = require("./_docx.js");
const fs = require("fs"); const path = require("path");

H.runSuite("documents are stored in LegalOS, structured, and Legal reads them", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M43_PORT", portFallback: "4960", prefix: "legalos-m43-" }));
  const browser = await H.openBrowser();
  const requester = await H.asUser(browser, sb, H.USERS.commLead.email, ctx);
  const errs = []; requester.on("pageerror", (e) => errs.push(e.message));

  const reqId = await requester.evaluate(async (email) => {
    const j = await (await fetch("/api/requests", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Storage layout probe", category: "Contract Drafting / Review",
        description: "probe", requestedByEmail: email }) })).json();
    return (j.request || j).id;
  }, H.USERS.commLead.email);

  const attId = await requester.evaluate(async (id, b64) => {
    const r = await (await fetch("/api/requests/" + id + "/attachments", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Final draft_Litigation feedback.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", dataBase64: b64 }) })).json();
    return r.attachment ? r.attachment.id : ("ERR " + (r.error || ""));
  }, reqId, D.docx(["Litigation feedback paragraph one"]).toString("base64"));
  check("the requester's document uploads", /^ATT-/.test(attId), attId);

  /* WHERE IT ACTUALLY LANDED. */
  const dir = path.join(sb.dir, "var", "request-uploads", reqId);
  const listed = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  check("it is stored on the LegalOS server, in a folder for its request",
    listed.some((f) => f.startsWith(attId) && f.endsWith(".docx")),
    reqId + "/ → " + listed.join(", "));
  check("with a sidecar saying what it is and who sent it",
    listed.includes(attId + ".json"), listed.filter((f) => /\.json$/.test(f)).join(", "));
  const meta = listed.includes(attId + ".json")
    ? JSON.parse(fs.readFileSync(path.join(dir, attId + ".json"), "utf8")) : {};
  check("and the record says LegalOS holds it, not Drive",
    meta.sourceType === "LEGALOS_UPLOAD" && meta.storedBy === "legalos" && !!meta.sha256,
    meta.sourceType + " · " + (meta.storedAt || ""));

  const noDrive = await requester.evaluate(async (id) => {
    const j = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    const r = (j.requests || []).find((x) => x.id === id) || {};
    return JSON.stringify(r).includes("drive.google.com");
  }, reqId);
  check("no fake Google Drive link is minted for it", noDrive === false, noDrive ? "a Drive URL is present" : "none");

  /* LEGAL READS IT FULLY — same file, no re-upload. */
  const legal = await H.asUser(browser, sb, H.USERS.litLead.email, ctx);
  const read = await legal.evaluate(async (id, a) => {
    const raw = await fetch("/api/requests/" + id + "/attachments/" + a);
    const rendered = await fetch("/api/requests/" + id + "/attachments/" + a + "/render");
    const t = await rendered.text();
    return { bytes: (await raw.arrayBuffer()).byteLength, render: rendered.status, readable: /paragraph one/i.test(t) };
  }, reqId, attId);
  check("Legal downloads the same file the requester uploaded", read.bytes > 200, read.bytes + " bytes");
  check("and reads it in full inside LegalOS", read.render === 200 && read.readable,
    read.render + " · " + (read.readable ? "document rendered" : "not readable"));

  await H.goHash(legal, "/workspace/" + reqId);
  await legal.reload({ waitUntil: "networkidle2" });
  await H.sleep(8000);
  const onScreen = await legal.evaluate(() => {
    /* The Documents card is where the request's documents live. The process
       zone separately lists what each STAGE produced, which is a different
       statement and belongs there. */
    const card = [...document.querySelectorAll(".card")]
      .find((c) => /Documents in/i.test(c.innerText));
    const text = card ? card.innerText.replace(/\s+/g, " ") : "";
    return {
      inCard: /Final draft_Litigation feedback\.docx/.test(text),
      timesInCard: (text.match(/Final draft_Litigation feedback\.docx/g) || []).length,
      ocrNoise: /OCR 0%/.test(text),
      srNoNoise: /Sr No/.test(text),
      canOpen: !!(card && [...card.querySelectorAll(".iconbtn")].some((b) => /Preview/i.test(b.title || ""))),
    };
  });
  check("Legal sees the requester's document on the request, listed once",
    onScreen.inCard && onScreen.timesInCard === 1, onScreen.timesInCard + " in the documents card");
  check("without the fabricated OCR / Sr No noise that came from the repository echo",
    !onScreen.ocrNoise && !onScreen.srNoNoise, "clean");
  check("and can open it from there", onScreen.canOpen, onScreen.canOpen ? "Preview offered" : "no Preview");

  try { await legal.close(); } catch (e) { /* done */ }
  check("no page error", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();
});
