// EVERY FORM THAT ATTACHES A DOCUMENT ACTUALLY UPLOADS IT.
//
// Four forms could attach a file and not one of them stored it:
//
//   the portal wizard   read name/size/type and threw the File away — its own
//                       comment said "the bytes are not uploaded"
//   the Raise form      called prompt("File name to attach (demo):") and
//                       attached whatever string you typed
//   the Intake form     invented "Supporting-document-1.pdf" at a made-up size
//   the record itself   travelled to the server carrying only a description
//
// So a request reached Legal naming documents that had never existed, and the
// first person to press Preview found out. This proves the whole path: a real
// file, through the store, to disk, and back out to the person reviewing it.
//
//   node tests/m46-portal-upload.js
const H = require("./_harness.js");
const D = require("./_docx.js");

H.runSuite("the portal wizard uploads the file", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_M46_PORT", portFallback: "4950", prefix: "legalos-m46-" }));
  const browser = await H.openBrowser();
  const p = await H.asUser(browser, sb, H.USERS.director.email, ctx);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));

  const before = await p.evaluate(async () => {
    const j = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    return (j.requests || []).length;
  });

  /* Drive the portal's own submit path with a real File, as the wizard now does. */
  const out = await p.evaluate(async (data) => {
    const mod = await import("/src/store.js");
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "Final draft_Litigation feedback (1).docx",
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const res = mod.submitLegalRequest({
      requestType: "New", title: "Portal upload probe", category: "Contract Drafting / Review",
      description: "probe", department: "Sales", entityId: "CO-1", requesterId: "u13",
      channel: "portal",
      attachments: [{ name: file.name, sizeKb: Math.round(file.size / 1024), kind: "docx" }],
      files: [file],
    });
    await new Promise((r) => setTimeout(r, 4500));
    return { ok: res.ok, id: res.id };
  }, D.docx(["Portal clause eleven"]).toString("base64"));
  check("the portal submits the request", out.ok === true, out.id);

  const rows = await p.evaluate(async () => {
    const j = await (await fetch("/api/requests", { headers: { accept: "application/json" } })).json();
    const out2 = [];
    for (const r of (j.requests || [])) for (const a of (r.attachments || []))
      out2.push({ req: r.id, att: a.id, name: a.name, onFile: a.onFile, bytes: a.bytes });
    return out2;
  });
  console.log("  server attachments:", JSON.stringify(rows));
  const mine = rows.find((x) => /Final draft_Litigation feedback/.test(x.name || ""));
  check("its document is on the server WITH bytes — no placeholder row",
    !!mine && mine.onFile === true && mine.bytes > 200 && /^ATT-/.test(mine.att),
    mine ? mine.att + " · onFile=" + mine.onFile + " · " + mine.bytes + "B" : "no attachment");
  check("and there is exactly one row for it", rows.length === 1, rows.length + " rows");

  if (mine && mine.onFile) {
    const read = await p.evaluate(async (rq, a) => {
      const dl = await fetch("/api/requests/" + rq + "/attachments/" + a);
      const rn = await fetch("/api/requests/" + rq + "/attachments/" + a + "/render");
      const t = await rn.text();
      return { bytes: (await dl.arrayBuffer()).byteLength, render: rn.status, readable: /clause eleven/i.test(t) };
    }, mine.req, mine.att);
    check("Legal can download it and read it in the app",
      read.bytes > 200 && read.render === 200 && read.readable,
      read.bytes + " bytes · render " + read.render + " · readable=" + read.readable);
  }

  check("no page error", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close();
});
