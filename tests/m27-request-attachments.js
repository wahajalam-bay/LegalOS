// A DOCUMENT ATTACHED TO A REQUEST IS A REAL DOCUMENT.
//
// WHAT THIS IS HOLDING IN PLACE
//
//   ATTACHMENTS WERE METADATA ONLY. A request carried {name, size, mime} and
//   the storage seam was left unimplemented, so the business could "attach" a
//   contract and it arrived in triage naming a file that existed only on the
//   requester's laptop. Nobody in Legal could open it.
//
//   THE BYTES LIVE ON THIS SERVER, NOT IN DRIVE. LegalOS holds drive.readonly
//   and never writes to the Drive estate. An intake attachment is evidence on a
//   request, not a filed document, so it is stored here until Legal decides
//   what it is.
//
//   AN ATTACHMENT IS NEVER MORE VISIBLE THAN ITS REQUEST. The person who raised
//   it and Legal may read it -- the same rule the request follows -- so it
//   survives triage and re-assignment without widening to anyone else.
//
//   WHAT THE BROWSER SAYS ABOUT A FILE IS A CLAIM. The type and the size are
//   checked again on the server; an executable is refused whatever it calls
//   itself.
//
//   node tests/m27-request-attachments.js
const H = require("./_harness.js");
const http = require("http");

/* The harness's request helper returns text; an attachment is bytes. */
function raw(base, path, cookie) {
  return new Promise((resolve) => {
    const u = new URL(base + path);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: {} };
    if (cookie) opts.headers.Cookie = "legalos_sess=" + cookie;
    const r = http.get(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks),
        type: res.headers["content-type"], disp: res.headers["content-disposition"] }));
    });
    r.on("error", () => resolve({ status: 0, buf: Buffer.alloc(0) }));
  });
}

H.runSuite("m27-request-attachments — a requester's document, readable end to end", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({
    portEnv: "LEGALOS_REQATT_PORT", portFallback: "4935", prefix: "legalos-reqatt-",
  }));
  const raiser = await H.loginApi(sb, H.USERS.complLead.email);
  const otherLegal = await H.loginApi(sb, H.USERS.litLead.email);

  /* ---- 1. raise a request and attach a document ------------------------- */
  const made = await H.request(sb.base, "POST", "/api/requests", {
    cookie: raiser,
    body: { title: "NDA review for Acme", type: "Contract review", source: "portal", channel: "portal" },
  });
  check("a request is raised", made.status === 201 && made.body.id, "HTTP " + made.status + " " + made.body.id);
  const id = made.body.id;

  const pdf = Buffer.from("%PDF-1.4\nrequester attachment body\n%%EOF");
  const up = await H.request(sb.base, "POST", "/api/requests/" + encodeURIComponent(id) + "/attachments", {
    cookie: raiser, body: { name: "Acme NDA.pdf", mime: "application/pdf", dataBase64: pdf.toString("base64") },
  });
  const att = up.body && up.body.attachment;
  check("a document can be attached to a request", up.status === 201 && !!att,
    "HTTP " + up.status + " " + (att ? att.id : JSON.stringify(up.body).slice(0, 90)));
  check("the stored file is measured, not taken on trust",
    att && att.size === pdf.length && /^[a-f0-9]{64}$/.test(att.sha256 || ""),
    att ? att.size + " bytes, sha256 " + String(att.sha256).slice(0, 12) + "…" : "-");
  check("the attachment records that LegalOS holds it, not Drive",
    att && att.storedBy === "legalos", att ? att.storedBy : "-");

  /* ---- 2. it reads back byte-for-byte, renderable in-app ---------------- */
  const back = await raw(sb.base, "/api/requests/" + id + "/attachments/" + att.id, raiser);
  check("the document reads back byte-for-byte",
    back.status === 200 && back.buf.equals(pdf),
    "HTTP " + back.status + " " + back.buf.length + "/" + pdf.length + " bytes");
  check("it is served with its own content type, to render in place",
    /application\/pdf/.test(back.type || "") && /inline/.test(back.disp || ""),
    back.type + " | " + back.disp);

  /* ---- 3. it travels with the request through triage -------------------- */
  const listed = await H.request(sb.base, "GET", "/api/requests", { cookie: raiser });
  const rec = ((listed.body || {}).requests || []).find((r) => r.id === id);
  check("the attachment travels on the request record",
    rec && (rec.attachments || []).length === 1 && rec.attachments[0].id === att.id,
    rec ? (rec.attachments || []).length + " attachment(s)" : "request missing");
  check("attaching is written into the request's history",
    rec && (rec.history || []).some((h) => /Document attached/i.test(h.action || "")),
    rec ? JSON.stringify((rec.history || []).slice(-1)[0] || {}) : "-");

  const handed = await raw(sb.base, "/api/requests/" + id + "/attachments/" + att.id, otherLegal);
  check("a different Legal principal can open it after hand-off",
    handed.status === 200 && handed.buf.equals(pdf),
    "HTTP " + handed.status + " " + handed.buf.length + " bytes — triage and re-assignment keep the document");

  /* ---- 4. the boundaries hold ------------------------------------------ */
  const anon = await raw(sb.base, "/api/requests/" + id + "/attachments/" + att.id, null);
  check("an unauthenticated read is refused", anon.status === 401 || anon.status === 403 || anon.status === 404,
    "HTTP " + anon.status);
  const ghost = await H.request(sb.base, "GET", "/api/requests/" + id + "/attachments/ATT-does-not-exist", { cookie: raiser });
  check("an unknown attachment is a 404, never an empty file", ghost.status === 404, "HTTP " + ghost.status);

  const exe = await H.request(sb.base, "POST", "/api/requests/" + encodeURIComponent(id) + "/attachments", {
    cookie: raiser, body: { name: "payload.exe", mime: "application/x-msdownload", dataBase64: "TVqQAAMAAAA=" },
  });
  check("an executable is refused whatever it calls itself", exe.status === 400,
    "HTTP " + exe.status + " — " + (exe.body && exe.body.error));

  const empty = await H.request(sb.base, "POST", "/api/requests/" + encodeURIComponent(id) + "/attachments", {
    cookie: raiser, body: { name: "nothing.pdf", mime: "application/pdf", dataBase64: "" },
  });
  check("an empty upload is refused", empty.status === 400, "HTTP " + empty.status);

  const noReq = await H.request(sb.base, "POST", "/api/requests/REQ-NOPE/attachments", {
    cookie: raiser, body: { name: "x.pdf", mime: "application/pdf", dataBase64: pdf.toString("base64") },
  });
  check("attaching to a request that does not exist is a 404", noReq.status === 404, "HTTP " + noReq.status);

  /* ---- 5. Drive is untouched ------------------------------------------- */
  /* The sandbox writes into its OWN copy of the app, so the live project's
     upload directory is deliberately not consulted here -- reading it would
     assert against the wrong tree. What matters is that the store keeps intake
     uploads under the app's own var/ directory and never in the Drive estate,
     and that it can report what it is holding. */
  const uploads = require("../api/request-uploads.js");
  const use = uploads.usage();
  check("intake uploads live under the app's own var/ directory, never in Drive",
    /var[\/\\]request-uploads$/.test(use.dir) && !/Drive|drive-index/.test(use.dir)
      && typeof use.files === "number" && typeof use.bytes === "number",
    use.dir + " — reports " + use.files + " file(s), " + use.bytes + " bytes");
  const sandboxUse = await H.request(sb.base, "GET", "/api/requests", { cookie: raiser });
  const stored = (((sandboxUse.body || {}).requests || []).find((r) => r.id === id) || {}).attachments || [];
  check("the sandbox that served this run is holding the uploaded bytes",
    stored.length === 1 && stored[0].size === pdf.length,
    stored.length ? stored[0].name + " " + stored[0].size + " bytes" : "none");

  /* ---- 6. the UI shows it to Legal ------------------------------------- */
  const browser = await H.openBrowser();
  try {
    const page = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await H.goHash(page, "/requests");
    await H.sleep(3200);
    /* Open the request the way the queue does, then WAIT for the sheet rather
       than sampling at a fixed moment -- the board renders cards before the
       request store has finished hydrating from the server. */
    let txt = "";
    for (let i = 0; i < 12; i++) {
      await page.evaluate((rid) => {
        if (document.querySelector(".sheet__panel")) return;
        const els = [...document.querySelectorAll("tr, .kcard, .card, div, button")];
        const hit = els.filter((n) => (n.innerText || "").includes(rid))
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length)[0];
        if (hit) hit.click();
      }, id);
      await H.sleep(700);
      txt = await page.evaluate(() => (document.querySelector(".sheet__panel") || document.body).innerText);
      if (/Acme NDA\.pdf/.test(txt)) break;
    }
    check("Legal sees the requester's document on the request",
      txt.includes("Acme NDA.pdf"), txt.includes("Acme NDA.pdf") ? "listed by name" : "not rendered");
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href*='/attachments/']")].map((a) => a.getAttribute("href")));
    check("the document has a real in-app address", links.length > 0, links[0] || "none");
    check("the request sheet renders without a script error", errs.length === 0,
      errs.slice(0, 2).join(" ;; ") || "none");
    try { await page.close(); } catch (e) { /* the verdict matters, not teardown */ }
  } finally {
    try { await browser.close(); } catch (e) { /* as above */ }
  }
});
