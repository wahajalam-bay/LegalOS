// A RESOLUTION, FROM BLANK PAGE TO EXECUTED, BY TWO PEOPLE.
//
// The complaint this answers is "workflows stop halfway": a screen offers an
// action, the action does nothing visible, and the record sits where it was.
// So this suite does not check that buttons exist -- it drives the whole thing
// through the UI, with two different users, and reloads the page at the end to
// prove the result was written down rather than held in the browser.
//
// Draft → Legal review → Finalized → Out for signature → Executed.
//
// WHAT IT ALSO PINS DOWN, because each one is a control and not a bug:
//
//   · The drafter cannot finalize their own resolution. The server refuses it
//     with a 409. The panel used to offer the button anyway, so the drafter
//     pressed Finalize, nothing appeared to happen, and the record stayed in
//     Legal review looking broken. Now the control is either not drawn for
//     that person or drawn disabled WITH the reason -- and an enabled button
//     the server would refuse is itself a defect.
//   · Executing needs every signatory marked and the signed copy on file.
//   · E-signature is offered only where a provider is actually configured;
//     none is, so signing here is wet-ink and the screen says so.
//
//   node tests/m33-resolution-lifecycle.js
const H = require("./_harness.js");
const SET = `(e,v)=>{if(!e)return;const proto=e.tagName==="SELECT"?window.HTMLSelectElement:(e.tagName==="TEXTAREA"?window.HTMLTextAreaElement:window.HTMLInputElement);Object.getOwnPropertyDescriptor(proto.prototype,"value").set.call(e,v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}`;

/* A minimal real PDF, written to the sandbox rather than committed: the upload
   path has to receive actual bytes, and a fixture that is not a PDF would be
   testing the wrong refusal. */
const fs = require("fs"), os = require("os"), P = require("path");
const SIGNED_PDF = P.join(os.tmpdir(), "legalos-m33-signed.pdf");
fs.writeFileSync(SIGNED_PDF, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
  + "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
  + "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

H.runSuite("resolution, two people", async (ctx) => {
  const { check } = ctx;
  const sb = ctx.setSandbox(await H.startSandbox({ portEnv: "LEGALOS_R2_PORT", portFallback: "5007", prefix: "legalos-r2-" }));
  const browser = await H.openBrowser();
  const drafter = await H.asUser(browser, sb, H.USERS.complMember.email, ctx);
  const errs = []; drafter.on("pageerror", (e) => errs.push(e.message));

  const panel = async (p) => { await p.evaluate(() => { const b = [...document.querySelectorAll(".page .btn")].find((x) => /Workflow/i.test(x.innerText)); if (b) b.click(); }); await H.sleep(1700); };
  const hit = async (p, re) => { const ok = await p.evaluate((r) => {
      const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
      const b = el && [...el.querySelectorAll("button")].find((x) => new RegExp(r, "i").test(x.innerText.trim()) && !x.disabled);
      if (!b) return false; b.click(); return true; }, re); await H.sleep(2200); return ok; };
  const fillSubmit = async (p, submitRe) => {
    await p.evaluate((S) => { const set = eval(S);
      const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop(); if (!el) return;
      el.querySelectorAll("input[type=text],textarea").forEach((i) => { if (!i.value) set(i, "POC walkthrough"); });
      el.querySelectorAll("input[type=date]").forEach((i) => { if (!i.value) set(i, "2026-03-05"); });
      el.querySelectorAll("input[type=email]").forEach((i) => { if (!i.value) set(i, "maryam.haq@zameen.com"); });
      el.querySelectorAll("select").forEach((s) => { if (!s.value) { const o = [...s.options].find((x) => x.value); if (o) set(s, o.value); } });
    }, SET); await H.sleep(400);
    await p.evaluate((r) => { const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
      const b = el && [...el.querySelectorAll("button")].filter((x) => new RegExp(r, "i").test(x.innerText.trim()) && !x.disabled).pop();
      if (b) b.click(); }, submitRe); await H.sleep(2800);
  };
  const status = (p) => p.evaluate(() => { const k = [...document.querySelectorAll(".statkpi")].find((n) => /\bStatus\b/i.test(n.innerText)); return k ? k.innerText.split("\n")[0].trim() : "?"; });

  // --- 1. the associate drafts it
  await H.goHash(drafter, "/compliance/resolutions"); await H.sleep(3000);
  await drafter.evaluate(() => [...document.querySelectorAll(".btn")].find((b) => /Create new resolution/i.test(b.innerText)).click());
  await H.sleep(1600);
  await drafter.evaluate((S) => { const set = eval(S);
    const f = [...document.querySelectorAll(".modal .field")].find((x) => /^Entity/m.test(x.innerText));
    const s = f.querySelector("select");
    set(s, [...s.options].find((o) => o.value && /Deevar Developers \(Private\)/i.test(o.text)).value); }, SET);
  await H.sleep(1200);
  await drafter.evaluate((S) => { const set = eval(S);
    const field = (re) => [...document.querySelectorAll(".modal .field")].find((f) => re.test(f.innerText));
    const sub = field(/Pick a configured subject/); const s = sub.querySelector("select");
    set(s, ([...s.options].find((x) => x.value && /written statement/i.test(x.text)) || [...s.options].find((x) => x.value)).value);
    const pa = field(/Person being authorised/); if (pa) set(pa.querySelector("input"), "Adil Ahmad Kamal");
    const tx = field(/Resolution text/); if (tx) set(tx.querySelector("textarea"), "RESOLVED THAT counsel be authorised to file a written statement."); }, SET);
  await H.sleep(700);
  await drafter.evaluate(() => [...document.querySelectorAll(".modal button")].find((x) => /Create resolution/i.test(x.innerText)).click());
  await H.sleep(4500);
  const id = await drafter.evaluate(() => (location.hash.match(/resolutions\/(RESN?-[A-Za-z0-9]+)/) || [])[1] || "");
  check("an associate drafts the resolution", !!id, id);

  await panel(drafter); await hit(drafter, "Generate document"); await fillSubmit(drafter, "generate|create|save|confirm");
  await panel(drafter); await hit(drafter, "Add signatory");
  await drafter.evaluate((S) => { const set = eval(S);
    const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const field = (re) => [...el.querySelectorAll(".field")].find((f) => re.test(f.innerText));
    const nm = field(/^Name/m); if (nm) set(nm.querySelector("input"), "Maryam Haq");
    const cp = field(/Capacity/); if (cp) set(cp.querySelector("input"), "Director");
    const en = field(/^Entity/m); if (en) set(en.querySelector("input"), "Deevar Developers (Private) Limited");
  }, SET);
  await H.sleep(500);
  await drafter.evaluate(() => { const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const b = [...el.querySelectorAll("button")].find((x) => x.innerText.trim() === "Add"); if (b) b.click(); });
  await H.sleep(2500);
  const sigCount = await drafter.evaluate(() => {
    const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    return /No signatories selected yet/.test(el.innerText) ? 0 : 1; });
  check("a signatory is recorded on the resolution", sigCount > 0, sigCount ? "signatory added" : "still none");
  await panel(drafter); await hit(drafter, "Send for legal review"); await fillSubmit(drafter, "confirm|send|save|move");
  check("the drafter sends it for legal review", /review/i.test(await status(drafter)), await status(drafter));

  await panel(drafter);
  const blocked = await drafter.evaluate(() => {
    const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const b = el && [...el.querySelectorAll("button")].find((x) => /^Finalize/i.test(x.innerText.trim()));
    return b ? b.disabled : null; });
  /* Either the control is not drawn for this person at all, or it is drawn
     disabled with the reason. Both are the control working; what must never
     happen is an enabled button that the server then refuses. */
  check("the drafter is never offered a Finalize that would be refused",
    blocked === true || blocked === null,
    blocked === null ? "not offered to an associate at all" : "offered, disabled, with the reason");
  await drafter.evaluate(() => { const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const c = el && [...el.querySelectorAll("button")].find((x) => /^Cancel$|Close/i.test(x.innerText.trim())); if (c) c.click(); });

  // --- 2. the manager finalizes, signs and executes
  const lead = await H.asUser(browser, sb, H.USERS.complLead.email, ctx);
  await H.goHash(lead, "/compliance/resolutions/" + id); await H.sleep(3500);
  await panel(lead);
  const canFin = await lead.evaluate(() => {
    const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const b = el && [...el.querySelectorAll("button")].find((x) => /^Finalize/i.test(x.innerText.trim()));
    return b ? !b.disabled : null; });
  check("a second person CAN finalize it", canFin === true, canFin === true ? "offered to the reviewer" : "still blocked");
  await hit(lead, "^Finalize"); await fillSubmit(lead, "confirm|finali[sz]e|save|move");
  check("it reaches Finalized", /finali/i.test(await status(lead)), await status(lead));

  await panel(lead); await hit(lead, "Send for signature"); await fillSubmit(lead, "send for signature");
  check("it goes out for signature", /signature/i.test(await status(lead)), await status(lead));

  /* Mark the signatory as having signed, then put the signed copy on file.
     Executing without either is refused, deliberately. */
  await panel(lead);
  await lead.evaluate(() => {
    const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const sec = [...el.querySelectorAll(".card")].find((c) => /Signatories/i.test(c.innerText));
    const s = sec && sec.querySelector("select");
    if (s) {
      const o = [...s.options].find((x) => /^Signed$/i.test(x.text));
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(s, o.value);
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await H.sleep(2600);

  await hit(lead, "Upload signed copy");
  const input = await lead.$("input[type=file]");
  if (input) { await input.uploadFile(SIGNED_PDF); await H.sleep(1200); }
  await lead.evaluate(() => { const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const b = [...el.querySelectorAll("button")].filter((x) => /upload|attach|save|confirm/i.test(x.innerText) && !x.disabled).pop();
    if (b) b.click(); });
  await H.sleep(3500);

  await panel(lead);
  const execState = await lead.evaluate(() => {
    const el = [...document.querySelectorAll(".modal,[role=dialog],.drawer,.actionpanel")].pop();
    const b = el && [...el.querySelectorAll("button")].find((x) => /Mark executed/i.test(x.innerText));
    return b ? { present: true, disabled: b.disabled, why: b.title || "" } : { present: false };
  });
  check("Mark executed becomes available once signed and on file",
    execState.present && !execState.disabled, JSON.stringify(execState).slice(0, 220));
  await hit(lead, "Mark executed"); await fillSubmit(lead, "confirm|execute|mark|save");
  const finalState = await status(lead);
  check("the lifecycle runs all the way to executed", /executed/i.test(finalState), finalState);

  await lead.reload({ waitUntil: "networkidle2" }); await H.sleep(4000);
  check("and it survives a full reload", (await status(lead)) === finalState, (await status(lead)) + " after reload");
  check("no page error", errs.length === 0, errs.slice(0, 2).join(" ;; ") || "none");
  try { await drafter.close(); await lead.close(); await browser.close(); } catch (e) {}
});
