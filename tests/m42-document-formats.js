// EVERY FORMAT A REQUESTER ATTACHES OPENS IN THE APP.
//
// The viewer used to say "Preview not available for this format — Word, Excel
// and PowerPoint files download rather than render in the browser." That is an
// approver being asked to decide on a document they have not read, and it was
// the commonest format on a request.
//
// Now the server converts and the app shows: Word (with the pictures inside it),
// Excel, PowerPoint, text, images and PDF. The converted page is stripped to
// text-level tags and served under `default-src 'none'`, so reading somebody
// else's document cannot run anything. Images survive ONLY as embedded data —
// a remote src would be a way to phone home from inside a document.
//
// A file that genuinely cannot be converted returns a page saying so, with
// Download still working. The answer to "we cannot render this" is never "so
// you cannot see it".
//
//   node tests/m42-document-formats.js
const H = require("./_harness.js");
const D = require("./_docx.js");

H.runSuite("every format opens in the app", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M42_PORT", portFallback: "4965", prefix: "legalos-m42-" }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  const reqId = await p.evaluate(async () => {
    const j = await (await fetch("/api/requests", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Every format probe", category: "Contract Drafting / Review",
        description: "probe", requestedByEmail: "maryam.haq@zameen.com" }) })).json();
    return (j.request || j).id;
  });

  const put = async (name, mime, buf) => p.evaluate(async (id, n, m, b64) => {
    const r = await (await fetch("/api/requests/" + id + "/attachments", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: n, mime: m, dataBase64: b64 }) })).json();
    return r.attachment ? r.attachment.id : ("ERR " + (r.error || ""));
  }, reqId, name, mime, buf.toString("base64"));

  const FILES = [
    ["Final draft_Litigation feedback.docx", D.MIME, D.docx(["Litigation feedback paragraph one"]), /paragraph one/i, "Word"],
    ["Site plan.docx", D.MIME, D.docxWithImage("Site plan below"), /<img src="data:image\/png;base64,/, "Word with a picture"],
    ["Commercial deck.pptx", D.MIME_PPTX, D.pptx(["Commercial proposal", "Fee schedule attached"]), /Fee schedule attached/, "PowerPoint"],
    ["Notes.txt", "text/plain", Buffer.from("Plain note about the lease."), /Plain note about the lease/, "text"],
    ["Scan.png", "image/png", D.PNG_1PX, null, "image"],
    ["Contract.pdf", "application/pdf", Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>"), null, "PDF"],
  ];

  for (const [name, mime, buf, expect, label] of FILES) {
    const id = await put(name, mime, buf);
    if (!/^ATT-/.test(id)) { check(label + " uploads", false, id); continue; }
    if (expect) {
      const r = await p.evaluate(async (rq, a) => {
        const res = await fetch("/api/requests/" + rq + "/attachments/" + a + "/render");
        return { status: res.status, text: await res.text() };
      }, reqId, id);
      check(label + " is READ in LegalOS, not downloaded",
        r.status === 200 && expect.test(r.text) && !/<script/i.test(r.text),
        r.status + " · " + (expect.test(r.text) ? "content rendered" : r.text.slice(0, 90)));
    } else {
      const r = await p.evaluate(async (rq, a) => {
        const res = await fetch("/api/requests/" + rq + "/attachments/" + a);
        return { status: res.status, type: res.headers.get("content-type"), bytes: (await res.arrayBuffer()).byteLength };
      }, reqId, id);
      check(label + " is served inline for the viewer",
        r.status === 200 && r.bytes > 0, r.status + " · " + r.type + " · " + r.bytes + " bytes");
    }
  }

  /* And in the actual UI: press Preview, get the document. */
  await H.goHash(p, "/workspace/" + reqId);
  await p.reload({ waitUntil: "networkidle2" });
  await H.sleep(8000);
  const opened = await p.evaluate(async () => {
    const b = [...document.querySelectorAll(".iconbtn")].find((x) => /Preview/i.test(x.title || ""));
    if (!b) return { found: false };
    b.click();
    await new Promise((r) => setTimeout(r, 2500));
    const sheet = document.querySelector(".sheet__body");
    return { found: true, iframe: !!(sheet && sheet.querySelector("iframe, img")),
      says: sheet ? sheet.innerText.replace(/\s+/g, " ").slice(0, 80) : "" };
  });
  check("pressing Preview in the app opens the document",
    opened.found && opened.iframe && !/not available/i.test(opened.says),
    opened.found ? (opened.iframe ? "opened in-app" : opened.says) : "no Preview control");

  check("no page error", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();
});
