#!/usr/bin/env node
/* THE FOOTER IS THE JOIN KEY.
 *
 * Every Zameen project promotion agreement carries the same two things on the
 * foot of every page:
 *
 *     recdza1Wwwg42kXD6                                      Jinnah Square
 *     ^ the CRM record id                                    ^ the project
 *
 * That is worth more than the filename, which numbers contracts ("617 Project
 * Promotion Agreement") and never names the project, and more than the folder,
 * which groups by region. It is an EXACT key into the trackers, printed on the
 * document itself by the system that issued it.
 *
 * These agreements are scans, so reading that line means looking at it. But the
 * line is one strip at the bottom of a page, not the page — about a twelfth of
 * it. So this renders only the strip, and tiles ten strips into one sheet with
 * an index number beside each, so ten documents are identified in one look
 * instead of ten.
 *
 * It harvests identity, not meaning. Whether an agreement was executed still
 * needs its signature page; this only says which project and which record the
 * document belongs to, which is the question the mapping actually turns on.
 *
 *   node tools/commercial-footers.js --batch b3 [--per 10]
 */
const fs = require("fs"), P = require("path"), cp = require("child_process");
const Jimp = require("jimp");

const WORK = "/tmp/claude-1010/-var-www-zameen-bse-reports/34a1514a-aa3b-4767-a703-cee43a2b5c1d/scratchpad/batches";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

const DPI = 150;
const STRIP_FRACTION = 0.14;   // bottom seventh: footer line plus the page number
const PAGE_H = Math.round(11 * DPI);
const PAGE_W = Math.round(8.5 * DPI);

(async () => {
  const batch = arg("--batch", null);
  if (!batch) { console.error("usage: --batch bN [--per 10]"); process.exit(2); }
  const per = parseInt(arg("--per", "10"), 10);
  const dir = P.join(WORK, batch);
  const manifest = JSON.parse(fs.readFileSync(P.join(dir, "manifest.json"), "utf8"));

  /* Only the page documents need this. Anything with extracted text already had
     its footer read as text. */
  const targets = manifest.filter((e) => e.kind === "PAGES" || e.kind === "IMAGE");
  console.error("footer strips for " + targets.length + " scanned documents");

  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const strips = [];

  for (const e of targets) {
    const page1 = fs.readdirSync(e.dir).filter((f) => /^page-1[-.]/.test(f)).sort()[0];
    if (!page1) continue;
    const src = P.join(e.dir, page1);
    try {
      const img = await Jimp.read(src);
      const h = Math.max(40, Math.round(img.bitmap.height * STRIP_FRACTION));
      const y = img.bitmap.height - h;
      const strip = img.clone().crop(0, y, img.bitmap.width, h);
      // A consistent width so the sheet lines up however the scans were sized.
      strip.resize(1100, Jimp.AUTO);
      strips.push({ n: e.n, filename: e.filename, img: strip });
    } catch (err) {
      console.error("  strip failed for #" + e.n + ": " + err.message);
    }
  }

  const sheets = [];
  for (let i = 0; i < strips.length; i += per) {
    const chunk = strips.slice(i, i + per);
    const labelH = 22, gap = 6;
    const totalH = chunk.reduce((n, s) => n + s.img.bitmap.height + labelH + gap, 0) + gap;
    const sheet = new Jimp(1120, totalH, 0xffffffff);
    let y = gap;
    for (const s of chunk) {
      sheet.print(font, 6, y, "#" + s.n + "  " + s.filename.slice(0, 84));
      y += labelH;
      sheet.composite(s.img, 10, y);
      y += s.img.bitmap.height + gap;
    }
    const out = P.join(dir, "footers-" + String(sheets.length + 1).padStart(2, "0") + ".jpg");
    await sheet.quality(82).writeAsync(out);
    sheets.push({ sheet: out, entries: chunk.map((c) => c.n) });
  }

  console.log(JSON.stringify({ batch, strips: strips.length, sheets }, null, 1));
})();
