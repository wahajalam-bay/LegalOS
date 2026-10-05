// RAISING A REQUEST WITH A DOCUMENT ACTUALLY STORES THE DOCUMENT.
//
// The record used to travel to the server on its own, carrying a description of
// each attachment — a name and a size — and nothing else. The server stored the
// description, the screen rendered it, and the first person to press Preview
// found out there had never been a file. Every attachment on every live request
// read NO BYTES.
//
// The browser holds the real File objects only at the moment the form is
// submitted, and the server assigns the request id only after the create
// resolves — so the upload has to happen in that order, in one flow. It does
// now, and the placeholder row no longer rides along beside the real one.
//
//   node tests/m44-request-upload-path.js
const H = require("./_harness.js");
const D = require("./_docx.js");

H.runSuite("the request-creation path stores the file", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M44_PORT", portFallback: "4957", prefix: "legalos-m44-" }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  const b64 = D.docx(["Feedback compliance paragraph one"]).toString("base64");

  /* Drive the store the way the forms do: a record plus the real File objects. */
  const out = await p.evaluate(async (data) => {
    const mod = await import("/src/store.js");
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "Feedback-compliance.docx",
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const res = mod.submitLegalRequest({
      requestType: "New", title: "Store path probe", category: "Contract Drafting / Review",
      description: "probe", department: "Sales", entityId: "CO-1", requesterId: "u13",
      attachments: [{ name: file.name, sizeKb: Math.round(file.size / 1024), kind: file.type }],
      files: [file],
    });
    await new Promise((r) => setTimeout(r, 4000));
    return { ok: res.ok, id: res.id, errors: res.errors };
  }, b64);
  check("the request is created through the store", out.ok === true, out.id || JSON.stringify(out.errors));

  const state = await p.evaluate(async () => {
    const j = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    const rows = [];
    for (const r of (j.requests || [])) for (const a of (r.attachments || []))
      rows.push({ req: r.id, att: a.id, name: a.name, onFile: a.onFile, bytes: a.bytes });
    return rows;
  });
  console.log("  server attachments:", JSON.stringify(state));
  const mine = state.find((x) => /Feedback-compliance/.test(x.name || ""));
  check("and its document reaches the server WITH the bytes",
    !!mine && mine.onFile === true && mine.bytes > 200,
    mine ? mine.name + " · onFile=" + mine.onFile + " · " + mine.bytes + "B" : "no attachment on the server");

  if (mine && mine.onFile) {
    const read = await p.evaluate(async (rq, a) => {
      const dl = await fetch("/api/requests/" + rq + "/attachments/" + a);
      const rn = await fetch("/api/requests/" + rq + "/attachments/" + a + "/render");
      const t = await rn.text();
      return { bytes: (await dl.arrayBuffer()).byteLength, render: rn.status, readable: /paragraph one/i.test(t) };
    }, mine.req, mine.att);
    check("it downloads and is read in the app", read.bytes > 200 && read.render === 200 && read.readable,
      read.bytes + " bytes · render " + read.render + " · readable=" + read.readable);
  }

  check("no page error", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();
});
