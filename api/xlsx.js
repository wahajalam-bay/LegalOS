// A minimal .xlsx reader — zero dependencies.
//
// npm cannot run on this box, so rather than pull in a spreadsheet library this
// parses the format directly. An .xlsx is a ZIP of XML parts, and Node's zlib
// can inflate them:
//
//   xl/workbook.xml          sheet names, in order
//   xl/sharedStrings.xml     the string table cells refer to by index
//   xl/styles.xml            number formats — the ONLY way to tell 45123 from a date
//   xl/worksheets/sheetN.xml the cells themselves
//
// Scope is deliberately narrow: read values out of machine-written workbooks.
// No formulas (we read cached values), no charts, no writing.
const fs = require("fs");
const zlib = require("zlib");

/* ------------------------------- ZIP ------------------------------- */

// Read the central directory and return { name -> Buffer } for the entries asked
// for. Only the parts we need are inflated, so a 20MB workbook with one big
// sheet costs one inflate, not twenty.
function unzip(buf, wanted) {
  // End of Central Directory: scan back from the tail for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip (no end-of-central-directory)");

  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  // ZIP64: the 32-bit fields saturate on large archives and the real values live
  // in the ZIP64 record. Without this a big workbook reads as empty.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x07064b50) {
        const z64 = Number(buf.readBigUInt64LE(i + 8));
        if (buf.readUInt32LE(z64) === 0x06064b50) {
          count = Number(buf.readBigUInt64LE(z64 + 32));
          cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
        }
        break;
      }
    }
  }

  const out = {};
  let p = cdOffset;
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (!wanted(name)) continue;

    // The local header repeats the name/extra with its OWN lengths — they differ
    // from the central directory's, so the data offset must be read from here.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    try {
      out[name] = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    } catch (e) {
      out[name] = Buffer.alloc(0);
    }
  }
  return out;
}

/* ------------------------------- XML ------------------------------- */

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
function decode(s) {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENT[m])
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// The shared string table. Each <si> may be one <t> or a run of them (<r><t>),
// which is how Excel stores a cell with mixed formatting — concatenate the run
// or the text comes back truncated at the first style change.
function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    let text = "";
    const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tre.exec(inner))) text += t[1];
    out.push(decode(text));
  }
  return out;
}

// Which style indexes mean "this number is a date". Built-in ids 14-22 and 45-47
// are date/time formats; custom ones are detected by their format string.
function parseDateStyles(xml) {
  const dateXf = new Set();
  if (!xml) return dateXf;
  const customDate = new Set();
  const nre = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let n;
  while ((n = nre.exec(xml))) {
    const code = decode(n[2]).toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
    if (/[ymdhs]/.test(code) && !/^[#0.,%\s]*$/.test(code)) customDate.add(n[1]);
  }
  const block = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!block) return dateXf;
  const xre = /<xf\b[^>]*>/g;
  let x, i = 0;
  while ((x = xre.exec(block[1]))) {
    const id = (x[0].match(/numFmtId="(\d+)"/) || [])[1];
    if (id !== undefined) {
      const num = parseInt(id, 10);
      if ((num >= 14 && num <= 22) || (num >= 45 && num <= 47) || customDate.has(id)) dateXf.add(i);
    }
    i++;
  }
  return dateXf;
}

// Excel's epoch is 1899-12-30: it believes 1900 was a leap year, and offsetting
// the epoch by a day is the conventional way to absorb that.
function serialToDate(n) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0 || n > 80000) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function colToIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared, dateXf) {
  const rows = [];
  if (!xml) return rows;
  // The attribute capture MUST be lazy. With a greedy [^>]* a self-closing
  // "<row r="5"/>" lets the * swallow the slash, the pattern then matches the
  // ">" branch and runs on to the NEXT row's </row> — silently eating a row.
  const rre = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let r;
  while ((r = rre.exec(xml))) {
    const inner = r[2] || "";
    const cells = [];
    // Same trap as rows, and far more damaging: an empty-but-styled cell is
    // written "<c r="B5" s="3"/>", and a greedy attribute capture consumed the
    // slash and then ran on to the NEXT cell's </c>. The following cell was
    // swallowed, its value attributed to the wrong column, and a shared-string
    // cell lost its t="s" so its index was emitted as a bare number.
    const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cre.exec(inner))) {
      const attrs = c[1] || "";
      const body = c[2] || "";
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/t="([^"]+)"/) || [])[1] || "n";
      const style = parseInt((attrs.match(/s="(\d+)"/) || [])[1], 10);
      const idx = ref ? colToIndex(ref) : cells.length;

      let value = null;
      if (type === "inlineStr") {
        let text = "";
        const tre = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let t;
        while ((t = tre.exec(body))) text += t[1];
        value = decode(text);
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/);
        if (v) {
          const raw = decode(v[1]);
          if (type === "s") value = shared[parseInt(raw, 10)] ?? "";
          else if (type === "str" || type === "e") value = raw;
          else if (type === "b") value = raw === "1";
          else {
            const num = parseFloat(raw);
            value = isNaN(num) ? raw : num;
            if (!isNaN(style) && dateXf.has(style)) {
              const d = serialToDate(num);
              if (d) value = d;
            }
          }
        }
      }
      while (cells.length < idx) cells.push(null);
      cells[idx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/* ------------------------------ public ------------------------------ */

// Read a workbook into { sheets: [{ name, rows }] }.
// `only` optionally limits which sheets are parsed, by name or predicate.
function readWorkbook(pathOrBuffer, { only = null, maxSheets = 400 } = {}) {
  const buf = Buffer.isBuffer(pathOrBuffer) ? pathOrBuffer : fs.readFileSync(pathOrBuffer);
  const parts = unzip(buf, (n) =>
    n === "xl/workbook.xml" || n === "xl/sharedStrings.xml" || n === "xl/styles.xml" ||
    n === "xl/_rels/workbook.xml.rels" || n.startsWith("xl/worksheets/")
  );

  const wbXml = parts["xl/workbook.xml"] ? parts["xl/workbook.xml"].toString("utf8") : "";
  const relsXml = parts["xl/_rels/workbook.xml.rels"] ? parts["xl/_rels/workbook.xml.rels"].toString("utf8") : "";
  const shared = parseSharedStrings(parts["xl/sharedStrings.xml"] && parts["xl/sharedStrings.xml"].toString("utf8"));
  const dateXf = parseDateStyles(parts["xl/styles.xml"] && parts["xl/styles.xml"].toString("utf8"));

  // rId -> worksheet part. Sheet order and names come from workbook.xml, but the
  // FILE each one lives in is only knowable through the relationships part —
  // sheet1.xml is not necessarily the first sheet.
  const relTarget = {};
  const rre = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let rl;
  while ((rl = rre.exec(relsXml))) relTarget[rl[1]] = rl[2].replace(/^\/?xl\//, "").replace(/^\.\//, "");

  const sheets = [];
  const sre = /<sheet\b([^>]*)\/?>/g;
  let s, n = 0;
  while ((s = sre.exec(wbXml)) && n < maxSheets) {
    const attrs = s[1];
    const name = decode((attrs.match(/name="([^"]*)"/) || [])[1] || "");
    const rid = (attrs.match(/r:id="([^"]+)"/) || [])[1];
    if (!name) continue;
    n++;
    if (only && !(typeof only === "function" ? only(name) : [].concat(only).includes(name))) {
      sheets.push({ name, rows: null, skipped: true });
      continue;
    }
    const target = relTarget[rid] || ("worksheets/sheet" + n + ".xml");
    const key = "xl/" + target;
    const xml = parts[key] ? parts[key].toString("utf8") : "";
    sheets.push({ name, rows: parseSheet(xml, shared, dateXf) });
  }
  return { sheets };
}

// Find the header row: within the first `scan` rows, the one with the most
// non-empty text cells. These trackers put titles, legends and merged banners
// above the real header, so row 1 is usually wrong.
function detectHeader(rows, scan = 10) {
  let best = -1, bestCount = 1;
  for (let i = 0; i < Math.min(scan, rows.length); i++) {
    const count = (rows[i] || []).filter((c) => typeof c === "string" && c.trim()).length;
    if (count > bestCount) { bestCount = count; best = i; }
  }
  return best;
}

// Turn a sheet into objects keyed by header name.
function toObjects(rows, { headerRow = null, minFilled = 2 } = {}) {
  if (!rows || !rows.length) return { header: [], records: [], headerRow: -1 };
  const hr = headerRow == null ? detectHeader(rows) : headerRow;
  if (hr < 0) return { header: [], records: [], headerRow: -1 };
  const header = (rows[hr] || []).map((c) => (c == null ? "" : String(c).replace(/\s+/g, " ").trim()));
  const cols = header.map((h, i) => ({ h, i })).filter((x) => x.h);
  const records = [];
  for (let i = hr + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const filled = cols.filter((c) => row[c.i] != null && String(row[c.i]).trim() !== "").length;
    if (filled < minFilled) continue;
    const obj = {};
    for (const c of cols) {
      const v = row[c.i];
      obj[c.h] = v == null ? "" : v;
    }
    obj.__row = i + 1;
    records.push(obj);
  }
  return { header: cols.map((c) => c.h), records, headerRow: hr };
}

module.exports = { readWorkbook, toObjects, detectHeader, serialToDate, unzip };
