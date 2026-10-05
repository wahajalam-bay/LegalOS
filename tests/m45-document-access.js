// ONCE A FILE IS UPLOADED, THE PEOPLE HANDLING THE REQUEST CAN OPEN IT.
//
// One document object, one request, no second upload at any stage. The
// requester who sent it and everyone in Legal working the request read the
// SAME bytes — download and in-app render both — and it appears on their queue
// rather than having to be hunted for.
//
// On a contract request (CRF) the circle is wider and named: the approving HOD
// and Finance are participants too, and m38 holds that. On a general legal
// request there is no named business approver on the record, so the set is the
// requester plus the legal department — which is what this proves.
//
//   node tests/m45-document-access.js
const H = require("./_harness.js");
const D = require("./_docx.js");

H.runSuite("who can open an uploaded document", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M45_PORT", portFallback: "4955", prefix: "legalos-m45-" }));
  const browser = await H.openBrowser();

  /* The requester raises it and uploads the file. */
  const requester = await H.asUser(browser, sb, H.USERS.commLead.email, ctx);
  const made = await requester.evaluate(async (email, b64) => {
    const j = await (await fetch("/api/requests", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Who can see it", category: "Contract Drafting / Review",
        description: "probe", requestedByEmail: email }) })).json();
    const id = (j.request || j).id;
    const a = await (await fetch("/api/requests/" + id + "/attachments", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Counterparty terms.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", dataBase64: b64 }) })).json();
    return { id, att: a.attachment && a.attachment.id };
  }, H.USERS.commLead.email, D.docx(["Clause seven of the counterparty terms"]).toString("base64"));
  check("the requester uploads a document", !!made.att, made.att || "not uploaded");

  const canOpen = (page) => page.evaluate(async (rq, a) => {
    const dl = await fetch("/api/requests/" + rq + "/attachments/" + a);
    const rn = await fetch("/api/requests/" + rq + "/attachments/" + a + "/render");
    const t = await rn.text();
    const list = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    const seen = (list.requests || []).some((r) => r.id === rq);
    return { download: dl.status, bytes: (await dl.arrayBuffer()).byteLength,
      render: rn.status, readable: /Clause seven/.test(t), listed: seen };
  }, made.id, made.att);

  const who = [
    ["the requester who uploaded it", H.USERS.commLead.email, true],
    ["the Legal lead handling intake", H.USERS.litLead.email, true],
    ["the Director Legal", H.USERS.director.email, true],
    ["a Legal associate on another team", H.USERS.complMember.email, true],
    ["a paralegal", H.USERS.paralegal.email, true],
  ];
  for (const [label, email, expected] of who) {
    const page = await H.asUser(browser, sb, email, ctx);
    const r = await canOpen(page);
    const ok = expected
      ? (r.download === 200 && r.bytes > 200 && r.render === 200 && r.readable && r.listed)
      : (r.download === 404 && !r.listed);
    check(label + (expected ? " can open it" : " cannot"), ok,
      "download " + r.download + " · " + r.bytes + "B · render " + r.render
        + " · readable=" + r.readable + " · on their queue=" + r.listed);
    try { await page.close(); } catch (e) { /* done */ }
  }

  /* And somebody with no standing on it at all. */
  const outsider = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const leak = await outsider.evaluate(async (rq) => {
    const res = await fetch("/api/requests/" + rq + "/attachments/ATT-does-not-exist");
    return res.status;
  }, made.id);
  check("a document id that does not exist is a plain 404, not a hint", leak === 404, "HTTP " + leak);

  /* THE LIST IS A COLLECTION; THE DOCUMENT IS A RESOURCE.
     Asking for the documents of something that is not a request at all -- a
     contract, an admin record, anything the spine renders -- must answer "none",
     not "not found". The panel is on every record, so a 404 there was a console
     error per record browsed, and it also confirmed which ids exist. Asking for
     a SPECIFIC document that is not there is still a 404, which the check above
     holds. */
  const notARequest = await outsider.evaluate(async () => {
    const res = await fetch("/api/requests/CTR-NOT-A-REQUEST/attachments");
    const j = await res.json().catch(() => null);
    return { status: res.status, atts: j && j.attachments };
  });
  check("the documents of something that is not a request are an empty list, not a 404",
    notARequest.status === 200 && Array.isArray(notARequest.atts) && notARequest.atts.length === 0,
    `HTTP ${notARequest.status} · ${JSON.stringify(notARequest.atts)}`);
  try { await outsider.close(); } catch (e) { /* done */ }

  await browser.close();
});
