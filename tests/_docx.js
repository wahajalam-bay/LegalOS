// A REAL .docx, built here, for tests that need the converter exercised.
//
// Uploading 512 arbitrary bytes named ".docx" tests the error path, not the
// reader. This writes the smallest valid Word package -- a zip carrying
// [Content_Types].xml, the package relationships and one document part -- with
// stored (uncompressed) entries, so no zip library is needed.
function u16(v) { return Buffer.from([v & 255, (v >> 8) & 255]); }
function u32(v) { return Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]); }

const TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (const x of b) c = TABLE[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

function zip(files) {
  const parts = []; const central = []; let off = 0;
  for (const [name, body] of files) {
    const nb = Buffer.from(name); const db = Buffer.from(body); const c = crc32(db);
    const local = Buffer.concat([Buffer.from([80, 75, 3, 4]), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(c), u32(db.length), u32(db.length), u16(nb.length), u16(0), nb, db]);
    central.push(Buffer.concat([Buffer.from([80, 75, 1, 2]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(c), u32(db.length), u32(db.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nb]));
    parts.push(local); off += local.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.concat([Buffer.from([80, 75, 5, 6]), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(off), u16(0)]);
  return Buffer.concat([...parts, cd, end]);
}

const NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const CT_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

function docx(paragraphs) {
  const body = [].concat(paragraphs).map((t) =>
    "<w:p><w:r><w:t>" + String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</w:t></w:r></w:p>").join("");
  return zip([
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="' + NS_CT
      + '"><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="' + CT_MAIN + '"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="' + NS_REL
      + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
      + ' Target="word/document.xml"/></Relationships>'],
    ["word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="' + NS_W + '"><w:body>' + body + "</w:body></w:document>"],
  ]);
}

/* The same, with a picture in it — a 1x1 PNG is enough to prove the image
   survives the converter and the sanitiser and reaches the reader. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

function docxWithImage(text) {
  const body = "<w:p><w:r><w:t>" + String(text) + "</w:t></w:r></w:p>"
    + '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData'
    + ' uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill>'
    + '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId5"/>'
    + "</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>";
  return zip([
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="' + NS_CT
      + '"><Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="png" ContentType="image/png"/>'
      + '<Override PartName="/word/document.xml" ContentType="' + CT_MAIN + '"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="' + NS_REL
      + '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
      + ' Target="word/document.xml"/></Relationships>'],
    ["word/_rels/document.xml.rels", '<?xml version="1.0"?><Relationships xmlns="' + NS_REL
      + '"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'
      + ' Target="media/image1.png"/></Relationships>'],
    ["word/media/image1.png", PNG_1PX],
    ["word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="' + NS_W + '"><w:body>' + body + "</w:body></w:document>"],
  ]);
}

/* The smallest readable .pptx: one slide carrying one line of text. */
function pptx(lines) {
  const txt = [].concat(lines).map((t) =>
    '<a:p><a:r><a:t>' + String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</a:t></a:r></a:p>").join("");
  const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  return zip([
    ["[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="' + NS_CT
      + '"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ["_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="' + NS_REL + '"></Relationships>'],
    ["ppt/slides/slide1.xml", '<?xml version="1.0"?><p:sld xmlns:p="' + NS_P + '" xmlns:a="' + NS_A
      + '"><p:cSld><p:spTree><p:sp><p:txBody>' + txt + "</p:txBody></p:sp></p:spTree></p:cSld></p:sld>"],
  ]);
}

const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

module.exports = { docx, docxWithImage, pptx, zip, MIME, MIME_PPTX, PNG_1PX };
