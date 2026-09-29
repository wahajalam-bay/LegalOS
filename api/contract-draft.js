// Drafting a contract FROM the approved template, using the request's own data.
//
// WHY THIS EXISTS, AND WHAT CHANGED
//
// docgen.js states that the approved templates "contain no merge fields, so a
// filled template would mean LegalOS writing legal prose it invented", and on
// that basis it produces a term sheet rather than a contract. The first half of
// that sentence is true only in the narrow Word sense: none of the 413 files
// carries a MERGEFIELD. The documents themselves tell a different story. Of 60
// .docx templates sampled, 51 contain labelled blanks and 24 contain bracketed
// slots, written for a human to fill in by hand:
//
//     [●DEVELOPER], a [●private limited company] ... registered office at
//     [●ADDRESS], acting through its duly authorised representative [●NAME]
//
//     Unit Number: ___________________________
//     CNIC/NICOP:  ___________________________
//
// Those are merge fields in every sense that matters. Filling them is not
// writing legal prose -- the clause language is the approved template's, byte
// for byte, and this module never adds, removes or rewrites a word of it. It
// substitutes values into slots the drafters of the template deliberately left
// open, which is exactly what the person receiving the request does by hand
// today.
//
// THE HONEST BOUNDARY, restated for this module:
//
//   - Clause text is never generated, altered or reordered. Only slots are
//     touched, and only slots whose label this module can map to a field the
//     requester actually filled in.
//   - A slot we cannot map with confidence is LEFT EXACTLY AS IT WAS. It is
//     never guessed at and never quietly dropped. Every one is reported.
//   - Every generated document carries a coverage report: how many slots the
//     template has, how many were filled, and the label of each one that was
//     not. A draft that is 70% filled says so, on its face.
//
// So the answer to "does this form draft the contract" is now yes: the output
// is the approved form of agreement with the parties, addresses, signatories,
// CNICs, dates, term and commercial figures already in place. It is a draft for
// Legal to review and negotiate, not an executed contract -- but it is the real
// document, not a summary of one.

const JSZip = require("jszip");
const drive = require("./drive.js");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/* ------------------------------------------------------------ XML plumbing */

const unesc = (s) => String(s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A paragraph is the unit of work. Word splits a single visible phrase across
// any number of <w:t> runs -- a spell-check pass alone is enough to cut
// "[●ADDRESS]" into "[●ADDR" + "ESS]" -- so no placeholder can be found by
// looking at one run. Concatenating a paragraph's runs, matching against that,
// and mapping the match back onto the runs it spans is the only reliable way.
const PARA_RE = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const RUN_T_RE = /<w:t(\s[^>]*?)?>([\s\S]*?)<\/w:t>/g;

// Pull a paragraph apart into its text runs, recording for each one where its
// text sits in the concatenated string and where its raw bytes sit in the
// paragraph's XML. Both offsets are needed: slots are found in the text, edits
// are applied to the XML.
function runsOf(para) {
  const runs = [];
  let text = "";
  let m;
  RUN_T_RE.lastIndex = 0;
  while ((m = RUN_T_RE.exec(para))) {
    const inner = m[2];
    const t = unesc(inner);
    const rawStart = m.index + m[0].length - inner.length - "</w:t>".length;
    runs.push({
      attrs: m[1] || "",
      rawStart,
      rawEnd: rawStart + inner.length,
      textStart: text.length,
      textEnd: text.length + t.length,
      text: t,
    });
    text += t;
  }
  return { runs, text };
}

// Apply a set of {start, end, value} edits (offsets into the concatenated text)
// back onto the paragraph XML.
//
// The replacement goes wholly into the FIRST run the slot touches, and the
// slot's remnants are cut from the rest. That keeps the replacement in the
// formatting Word had already applied to the start of the placeholder -- which
// is what the template's author intended the filled value to look like -- and
// leaves every run the slot does not touch completely untouched.
function applyEdits(para, runs, edits) {
  // Per-run cuts, gathered first so a run touched by two slots is handled once.
  const perRun = new Map();
  for (const e of edits) {
    let first = true;
    for (const r of runs) {
      if (r.textEnd <= e.start || r.textStart >= e.end) continue;
      const from = Math.max(r.textStart, e.start) - r.textStart;
      const to = Math.min(r.textEnd, e.end) - r.textStart;
      if (!perRun.has(r)) perRun.set(r, []);
      perRun.get(r).push({ from, to, value: first ? e.value : "" });
      first = false;
    }
  }

  // Rewrite each affected run's text, then splice the new bytes into the
  // paragraph back-to-front so earlier offsets stay valid.
  const patches = [];
  for (const [r, cuts] of perRun) {
    cuts.sort((a, b) => b.from - a.from);
    let t = r.text;
    for (const c of cuts) t = t.slice(0, c.from) + c.value + t.slice(c.to);
    patches.push({ start: r.rawStart, end: r.rawEnd, xml: esc(t), run: r, text: t });
  }
  patches.sort((a, b) => b.start - a.start);

  let out = para;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.xml + out.slice(p.end);
    // A value that begins or ends with a space is lost unless the run says to
    // keep it. Word silently trims otherwise, which turns "Lahore on this 14
    // day" into "Lahore on this14 day".
    if (/^\s|\s$/.test(p.text) && !/xml:space=/.test(p.run.attrs)) {
      const tagStart = out.lastIndexOf("<w:t", p.start);
      if (tagStart >= 0) {
        const gt = out.indexOf(">", tagStart);
        if (gt > tagStart && gt < p.start) {
          out = out.slice(0, gt) + ' xml:space="preserve"' + out.slice(gt);
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ slot finding */

// The three shapes the template library actually uses.
//
//   [●DEVELOPER]  [•NAME]  [PROJECT NAME]  [●]  [------]   bracketed slots
//   ____________________                                   ruled blanks
//   ..........                                             dotted blanks
//
// A bracketed slot usually carries its own label. A ruled blank never does, so
// its label is whatever the line says immediately before it -- "CNIC/NICOP:
// ______" labels that blank as plainly as any merge field name would.
const BRACKET_RE = /\[\s*[●•*]?\s*([^\[\]\n]{0,80}?)\s*\]/g;
const RULE_RE = /_{3,}|\.{6,}/g;

// Bracketed text that is prose rather than a slot label. The templates use
// square brackets for optional drafting notes too ("[Draft]", "[Legal HO]"),
// and a sentence in brackets is not a field.
const NOT_A_SLOT = /^(draft|legal ho|sic|\d+|[ivxlc]+|note|optional|if any|as applicable)$/i;

function findSlots(text) {
  const slots = [];
  let m;

  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(text))) {
    const inner = (m[1] || "").trim();
    // "[●]" and "[------]" are anonymous slots -- real fields, but the label
    // has to come from the surrounding sentence.
    const anon = inner === "" || /^[-–—._●•*\s]+$/.test(inner);
    if (!anon && (NOT_A_SLOT.test(inner) || inner.length > 60)) continue;
    slots.push({
      kind: "bracket",
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      label: anon ? "" : inner,
      anon,
      ownLabel: !anon,
    });
  }

  RULE_RE.lastIndex = 0;
  while ((m = RULE_RE.exec(text))) {
    slots.push({
      kind: "rule",
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      label: "",
      anon: true,
      width: m[0].length,
    });
  }

  slots.sort((a, b) => a.start - b.start);

  // Drop overlaps -- a ruled blank inside a bracket is one slot, not two.
  let clean = [];
  for (const s of slots) {
    if (clean.length && s.start < clean[clean.length - 1].end) continue;
    clean.push(s);
  }

  // "[●] [PROJECT NAME]" IS ONE FIELD, NOT TWO.
  //
  // Where an anonymous bracket is followed immediately by a labelled one, the
  // second is not another slot -- it is the instruction for the first, telling
  // whoever fills the form what to put there. The templates use this
  // constantly: "[●] [NUMBER] commercial plots", "an area of [●] [DIMENSIONS]
  // square yards", "reserved exclusively for [●] [PURPOSE]". Treating them as
  // two slots wrote the project name in twice, side by side. They are merged
  // into a single slot spanning both, carrying the hint's label -- so the pair
  // is replaced by one value and the instruction disappears with it.
  const merged = [];
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i], b = clean[i + 1];
    if (a.kind === "bracket" && a.anon && b && b.kind === "bracket" && !b.anon
        && b.start - a.end <= 2) {
      merged.push({ kind: "bracket", start: a.start, end: b.end, raw: text.slice(a.start, b.end), label: b.label, anon: false, ownLabel: true });
      i++;
      continue;
    }
    merged.push(a);
  }
  clean = merged;

  // Give the anonymous ones a label from the text that precedes them. The
  // window stops at the previous slot so two blanks on one line do not both
  // claim the first label.
  for (let i = 0; i < clean.length; i++) {
    const s = clean[i];
    if (s.label) continue;
    const from = i > 0 ? clean[i - 1].end : 0;
    const before = text.slice(from, s.start);
    s.label = labelBefore(before);

    // Refusing every anonymous bracket was too blunt. "Mr. [●] S/o [●], holding
    // CNIC No. [●], resident of [●]" is labelled exactly as reliably as the
    // ruled version of the same block, and skipping it left a lease 42% filled
    // with its parties missing. What made the earlier version wrong was the
    // [●]+[HINT] pairing, which is now handled above. A prose label is trusted
    // here on the same terms as a ruled blank's -- and a label carrying no word
    // at all ("(", "-") can answer nothing, so it is not tried.
    // Two letters ANYWHERE, not two in a row -- "S/o" and "W/o" are labels, and
    // requiring consecutive letters threw away every parentage blank in a
    // lease's party block.
    if ((s.label.match(/[a-z]/ig) || []).length < 2) s.weak = true;
  }

  return clean;
}

// The label for a blank is the last thing said before it. "Father's/Husband's
// Name: ______" gives "Father's/Husband's Name"; "...at ______ on this" gives
// "at". Colons win over prepositions, and a run of words is cut to something
// short enough to match on.
function labelBefore(before) {
  const t = before.replace(/\s+/g, " ").replace(/\s+$/, "");
  if (!t) return "";
  const colon = t.lastIndexOf(":");
  if (colon >= 0 && t.length - colon < 60) {
    const seg = t.slice(colon + 1).trim();
    if (!seg) {
      const head = t.slice(0, colon);
      return head.slice(Math.max(0, head.lastIndexOf(".") + 1)).trim().slice(-60);
    }
  }
  // No colon: take the trailing few words, which is where "entered into at",
  // "on this", "day of" and "represented by" live.
  const words = t.split(" ").filter(Boolean);
  return words.slice(-6).join(" ").slice(-60);
}

/* ------------------------------------------------- the request's own values */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/* Grid sections that hold PARTIES rather than commercial line items. A row in
   one of these is a person or company on the other side of the agreement. */
const PARTY_GRIDS = ["lessors", "owners", "sellers", "allottees", "partners"];

/* An ISO date out of the form, written the way a contract writes one. */
const dateVal = (v) => {
  const t = (v === undefined || v === null) ? "" : String(v).trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return t;
  return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
};

const nonEmpty = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const s = (v) => (nonEmpty(v) ? String(v).trim() : "");

// Everything the form knows, flattened into the shape the slot resolvers ask
// questions of. Nothing is invented here: a field the requester left blank
// stays blank all the way through, and its slots go unfilled.
function contextOf(rec) {
  const v = (rec && rec.values) || {};
  const req = v.request || {};
  const ent = v.entity || {};
  const ex = v.execution || {};
  const dis = v.disputes || {};
  const notices = Array.isArray(v.notices) ? v.notices.filter(Boolean) : [];

  /* THE OTHER SIDE, WHEREVER THE FORM RECORDED IT.
     The common Counterparty grid is not the only place a request names the
     people on the other side. A lease request has its own Lessors grid, with a
     row per lessor carrying name, parentage, CNIC, address and rent share --
     which is exactly what a lease template's repeated lessor blocks ask for,
     and exactly what was being ignored while those blocks were filled from a
     single generic counterparty. Party grids are appended in the order the
     form asks for them and deduplicated by name, so a request that names its
     lessors both ways does not produce two of each. */
  const named = [];
  const seenName = new Set();
  const push = (row) => {
    const nm = s(row.legalName).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (nm && seenName.has(nm)) return;
    if (nm) seenName.add(nm);
    named.push(row);
  };
  for (const row of (Array.isArray(v.counterparties) ? v.counterparties.filter(Boolean) : [])) push(row);
  for (const key of PARTY_GRIDS) {
    for (const row of (Array.isArray(v[key]) ? v[key].filter(Boolean) : [])) {
      push({
        kind: s(row.kind) || "Individual",
        legalName: s(row.name) || s(row.legalName),
        parentage: s(row.parentage),
        cnic: s(row.cnic),
        signatoryCnic: s(row.signatoryCnic) || s(row.cnic),
        signatory: s(row.signatory) || s(row.name),
        address: s(row.address),
        contactEmail: s(row.email) || s(row.contactEmail),
        contactPhone: s(row.phone) || s(row.contactPhone),
      });
    }
  }
  const cps = named;

  const dateIso = s(ex.executionDate) || s(req.requiredBy);
  const d = dateIso ? new Date(dateIso + "T00:00:00") : null;
  const valid = d && !isNaN(d);

  // Anything the type-specific sections captured -- term, rent, fee, scope,
  // project name and so on. These vary by request type, so rather than naming
  // each one they are all made available by key and matched by label.
  const extra = {};
  for (const [k, val] of Object.entries(v)) {
    if (["request", "entity", "counterparties", "notices", "disputes", "execution", "special"].includes(k)) continue;
    if (val && typeof val === "object" && !Array.isArray(val)) Object.assign(extra, val);
  }

  return {
    rec, req, ent, ex, dis, cps, notices, extra,
    cp: cps[0] || {},
    date: valid ? {
      iso: dateIso,
      day: String(d.getDate()),
      dayOrdinal: ordinal(d.getDate()),
      month: MONTHS[d.getMonth()],
      year: String(d.getFullYear()),
      yy: String(d.getFullYear()).slice(-2),
      full: `${ordinal(d.getDate())} day of ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      readable: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    } : null,
    entityRole: s(ent.entityRole),
  };
}

function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return n + "th";
  return n + (["th", "st", "nd", "rd"][n % 10] || "th");
}

/* ------------------------------------------------------- which party is it */

// A template names its parties by role: the DEVELOPER, the LESSEE, Party B.
// Which side of the agreement Zameen is on is on the request (entityRole), so
// role words map to a side rather than being guessed at.
//
// When the paragraph gives no role at all, the slot is attributed to whichever
// party the paragraph last named. That is how these recitals are written --
// the party is introduced, then its address, then its signatory -- and where
// even that is absent the slot is left unfilled rather than attributed to a
// default.
// Every role word these templates use for either side of an agreement. Which
// side each one means is NOT fixed -- "Lessee" is us on one request and them on
// the next -- so the word is compared against the role the request says the
// Zameen entity holds, rather than being assigned a side here.
const ROLE_WORDS = /\b(developer|customer|client|contractor|consultant|vendor|supplier|lessor|lessee|landlord|tenant|owner|seller|purchaser|buyer|licensor|licensee|agent|partner|service\s+provider|disclosing\s+party|receiving\s+party|party\s*[abc]|first\s+part|second\s+part|third\s+part)\b/ig;

// Words that can only ever mean us.
const ENTITY_WORDS = /\b(zameen|party\s*a|first\s+part)\b/i;

function partyFor(ctx, label, paraText, slotStart) {
  const role = (ctx.entityRole || "").toLowerCase().replace(/\s+/g, " ").trim();
  const scope = paraText.slice(Math.max(0, slotStart - 220), slotStart) + " " + label;

  // The NEAREST role word wins, not the first one in the paragraph. A notices
  // table lists the Lessor's block and then the Lessee's; matching the first
  // role word in scope put the lessor's details under "Lessee — Attention of",
  // naming the counterparty as the party we are.
  let nearest = null, m;
  ROLE_WORDS.lastIndex = 0;
  while ((m = ROLE_WORDS.exec(scope))) nearest = m[0].toLowerCase().replace(/\s+/g, " ");

  if (nearest) {
    if (/^(party a|first part)$/.test(nearest)) return "entity";
    // "Lessee" on a request where the Zameen entity IS the Lessee is ours;
    // on one where it is the Lessor it is theirs.
    if (role && (role.includes(nearest) || nearest.includes(role))) return "entity";
    return "counterparty";
  }
  if (ENTITY_WORDS.test(scope)) return "entity";
  return null;
}

/* ---------------------------------------------------------- slot resolution */

// Label to value. Order matters -- the first pattern that matches wins, so the
// specific ones ("father's name", "signatory cnic") come before the general
// ones ("name", "cnic").
//
// Every resolver returns a string or "". An empty return means "the request
// does not answer this", and the slot is left as the template had it.
// A resolver marked `pid` produces a fact about ONE named person or company.
// Those are counted per document -- see nthCounterparty below.
const RESOLVERS = [
  // --- witnesses ---------------------------------------------------------
  // First, because these labels contain "CNIC" and "name" and would otherwise
  // be answered by the counterparty's.
  { re: /witness\s*(?:no\.?\s*)?1[^\d]*cnic|cnic[^\d]*witness\s*(?:no\.?\s*)?1/i, get: (c) => s(c.ex.witness1Cnic) },
  { re: /witness\s*(?:no\.?\s*)?2[^\d]*cnic|cnic[^\d]*witness\s*(?:no\.?\s*)?2/i, get: (c) => s(c.ex.witness2Cnic) },
  { re: /witness\s*(?:no\.?\s*)?1/i, get: (c) => s(c.ex.witness1Name) },
  { re: /witness\s*(?:no\.?\s*)?2/i, get: (c) => s(c.ex.witness2Name) },

  // --- dates -------------------------------------------------------------
  // The specific ones come first. "Estimated Completion Date" has to be tested
  // before anything matching a bare "date", or that slot takes the day of the
  // month -- which it did, and read as a completion date of the 15th.
  { kind: "date", re: /completion\s+date|handover\s+date|possession\s+date/i,
    get: (c) => dateVal(c.extra.possessionDate || c.extra.completionDate || c.extra.fitoutCompletion) },
  { kind: "date", re: /commencement|start\s+date/i, get: (c) => dateVal(c.extra.commencement || c.extra.startDate) },
  { kind: "date", re: /expiry|expiration|end\s+date/i, get: (c) => dateVal(c.extra.expiry || c.extra.endDate) },
  { kind: "date", re: /effective\s+date|execution\s+date|agreement\s+date|date\s+of\s+(this\s+)?agreement/i,
    get: (c) => (c.date ? c.date.full : "") },
  { kind: "date", re: /\b(day\s+of|month)\b/i, get: (c) => (c.date ? c.date.month : "") },
  // "...on this ___ day of ______ 20___": a blank following a literal 20 takes
  // two digits; a standalone [YEAR] takes all four.
  { kind: "date", re: /\b20\s*$/, get: (c) => (c.date ? c.date.yy : "") },
  { kind: "date", re: /^\s*year\s*$/i, get: (c) => (c.date ? c.date.year : "") },
  { kind: "date", re: /\bon\s+this\b/i, get: (c) => (c.date ? c.date.day : "") },
  { kind: "date", re: /^\s*dated?\s*$/i, get: (c) => (c.date ? c.date.readable : "") },

  // --- place of execution ------------------------------------------------
  { re: /entered\s+into\s+at|executed\s+at|made\s+at|\bat\s*$/i,
    get: (c) => s(c.ex.executionPlace) || s(c.dis.seat) },

  // --- the subject matter ------------------------------------------------
  // Ahead of the party block, because "Project address" and "Premises" both
  // contain words the party resolvers answer, and a generic /address/ rule
  // reached them first -- writing the counterparty's registered office in as
  // the address of the project.
  { re: /project\s+address|address\s+of\s+the\s+project|site\s+address/i, get: (c) => s(c.extra.projectAddress) },
  { re: /project\s*(name)?/i, get: (c) => s(c.extra.projectName) || s(c.extra.project) },
  { re: /demised|premises|property\s+address/i,
    get: (c) => s(c.extra.building) || s(c.extra.premises) || s(c.extra.propertyAddress) },
  { re: /building/i, get: (c) => s(c.extra.building) },
  { re: /floors?\s*\/?\s*units?|floor\b/i, get: (c) => s(c.extra.floorsUnits) },
  { re: /total\s+area/i, get: (c) => s(c.extra.totalArea) },
  { re: /\barea\b|square\s+(feet|yards|ft)|sq\.?\s*(ft|yds)/i, get: (c) => s(c.extra.area) || s(c.extra.totalArea) },
  { re: /parking/i, get: (c) => s(c.extra.parking) },
  { re: /permitted\s+use|\buse\b/i, get: (c) => s(c.extra.use) },
  { re: /unit\s*(number|no)|apartment\s+(number|no)|plot\s+(number|no)/i, get: (c) => s(c.extra.unit) || s(c.extra.unitNumber) },
  { re: /scope|services\s+to\s+be/i, get: (c) => s(c.extra.scope) || s(c.extra.services) },
  { re: /purpose/i, get: (c) => s(c.extra.purpose) || s(c.extra.use) },

  // --- money and term ----------------------------------------------------
  // "Rupees (in words)" is written out from the figure on the request rather
  // than left blank -- it is the same number, not a new fact.
  // "(PKR ___)" restates the figure just written out in words. It carries no
  // label of its own, so it reads back the amount resolved a moment earlier.
  { kind: "money", re: /^\W*(pkr|rs\.?)\W*$/i, get: (c, p, cp, st) => money(st.lastAmount) },
  { kind: "duration", re: /\bwithin\b|fail(ure)?\s+to|cure/i,
    get: (c) => (nonEmpty(c.extra.possessionFailureDays) ? String(c.extra.possessionFailureDays)
      : nonEmpty(c.extra.cureDays) ? String(c.extra.cureDays) : "") },
  { kind: "money", re: /in\s+words|rupees\s*\(/i, get: (c) => amountInWords(firstAmount(c)) },
  { kind: "money", re: /purchase\s+price|total\s+price|consideration|contract\s+value|sale\s+price/i,
    get: (c) => money(c.extra.value || c.extra.amount || c.extra.price || c.extra.totalValue) },
  { kind: "money", re: /monthly\s+rent|\brent\b/i, get: (c) => money(c.extra.monthlyRent || c.extra.rent) },
  { kind: "money", re: /security\s+deposit|\bdeposit\b/i, get: (c) => money(c.extra.depositAmount || c.extra.deposit || c.extra.securityDeposit) },
  { kind: "money", re: /advance\s+rent|\badvance\b/i, get: (c) => money(c.extra.advanceRentAmount || c.extra.advance) },
  { kind: "money", re: /allotment\s+charges/i, get: (c) => money(c.extra.allotmentCharges) },
  { kind: "money", re: /transfer\s+charges/i, get: (c) => money(c.extra.transferCharges) },
  { kind: "money", re: /maintenance/i, get: (c) => money(c.extra.maintenanceCharges) },
  { kind: "money", re: /cancellation\s+fee/i, get: (c) => money(c.extra.cancellationFee) },
  { kind: "percent", re: /escalation/i, get: (c) => pct(c.extra.escalationPct) },
  { kind: "percent", re: /down\s*payment/i, get: (c) => pct(c.extra.downPaymentPct) },
  { kind: "duration", re: /instal?ment/i, get: (c) => (nonEmpty(c.extra.instalmentMonths) ? String(c.extra.instalmentMonths) + " months" : "") },
  { re: /due\s+day|payable\s+on\s+the/i, get: (c) => (nonEmpty(c.extra.dueDay) ? ordinal(Number(c.extra.dueDay)) : "") },
  { re: /lock.?in/i, get: (c) => s(c.extra.lockIn) },
  { re: /rent.?free/i, get: (c) => s(c.extra.rentFreePeriod) },
  { re: /bank\s+account|account\s+(number|no|title)/i, get: (c) => s(c.extra.customerBankAccount) },
  { kind: "money", re: /fee|remuneration|charges/i, get: (c) => money(c.extra.fee || c.extra.amount) },
  { kind: "duration", re: /\bterm\b|duration|tenure|period\s+of/i,
    get: (c) => s(c.extra.term) || s(c.extra.servicePeriod) || s(c.extra.duration)
      || (nonEmpty(c.extra.years) ? String(c.extra.years) + " years" : "") },

  // --- dispute resolution ------------------------------------------------
  { re: /governing\s+law|laws?\s+of/i, get: (c) => s(c.dis.governingLaw) },
  { re: /arbitrat|forum|jurisdiction/i, get: (c) => s(c.dis.forum) },
  { re: /\bseat\b|venue/i, get: (c) => s(c.dis.seat) },
  { kind: "duration", re: /amicable|cure\s+period|cooling/i, get: (c) => (nonEmpty(c.dis.amicableDays) ? String(c.dis.amicableDays) : "") },

  // --- the parties -------------------------------------------------------
  { pid: "name", re: /^\s*(developer|customer|client|lessor|lessee|contractor|consultant|vendor|supplier|owner|seller|purchaser|buyer|licensor|licensee|company\s+name|legal\s+name|party\s*[abc])\s*$/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entityName) : s(cp.legalName)) },
  // A registration NUMBER is asked for with the same words as the form of the
  // company -- "Company Incorporation No." -- so the number is tested first.
  // Otherwise that slot takes the phrase "private limited company".
  { pid: "secp", re: /(incorporation|registration|company|firm|secp|form\s*c)\s*(no\.?|number|reg)/i,
    get: (c, p, cp) => s(cp.secpNo) },
  { pid: "constitution", re: /incorporat|constitut|a\s+\[?\s*private\s+limited/i,
    get: (c, p, cp) => (p === "entity" ? "private limited company" : constitutionOf(cp)) },

  // --- addresses ---------------------------------------------------------
  { pid: "address", re: /registered\s+office|registered\s+address|principal\s+office/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entityAddress) : s(cp.address)) },
  { pid: "address", re: /address|resident\s+of/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entityAddress) : s(cp.address)) },

  // --- people ------------------------------------------------------------
  { pid: "parentage", re: /father'?s|husband'?s|s\/o|d\/o|w\/o|parentage/i, get: (c, p, cp) => s(cp.parentage) },
  { pid: "designation", re: /designation/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entitySignatoryDesignation) : s(cp.signatoryDesignation)) },
  { pid: "signatory", re: /(authorised|authorized)\s+(representative|signatory)|represented\s+by|acting\s+through|signator/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entitySignatory) : s(cp.signatory)) },
  { pid: "cnic", re: /cnic|nicop|passport|identity\s+card/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entitySignatoryCnic) : s(cp.signatoryCnic) || s(cp.cnic)) },
  { pid: "ntn", re: /\bntn\b|strn|tax\s+number/i, get: (c, p, cp) => s(cp.ntn) },
  { pid: "secp", re: /secp|form\s*c\b|incorporation\s+number|registration\s+number/i, get: (c, p, cp) => s(cp.secpNo) },
  { pid: "name", re: /^\s*(mr\.?|mrs\.?|ms\.?|messrs\.?)\s*$|^\s*name\s*$|full\s+name/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entitySignatory) : s(cp.signatory) || s(cp.legalName)) },

  // --- contact -----------------------------------------------------------
  { pid: "email", re: /e-?mail/i, get: (c, p, cp) => (p === "entity" ? noticeEmail(c, "entity") : s(cp.contactEmail)) },
  // The form captures ONE number per counterparty. A residence line and an
  // office line are different facts, and writing the one number we hold into
  // both asserts something the request never said.
  { re: /residence|\(\s*office\s*\)|landline|\bfax\b/i, get: () => "" },
  { pid: "phone", re: /mobile|cell|telephone|phone|contact\s+number/i, get: (c, p, cp) => s(cp.contactPhone) },
  { pid: "attention", re: /attention|kind\s+attention|attn/i,
    get: (c, p, cp) => (p === "entity" ? s(c.ent.entitySignatory) : s(cp.contactPerson) || s(cp.signatory)) },
];

const pct = (v) => (nonEmpty(v) ? String(v).replace(/%\s*$/, "") + "%" : "");

function firstAmount(c) {
  const e = c.extra;
  return e.value || e.amount || e.price || e.totalValue || e.monthlyRent || e.allotmentCharges || e.depositAmount || "";
}

// Figures in words, in the numbering these documents actually use -- crore,
// lakh, thousand. Only ever applied to a figure the requester already entered,
// so this restates a number, it does not introduce one.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underHundred(n) {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "")).trim();
}

function underThousand(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? ONES[h] + " Hundred" : "", r ? underHundred(r) : ""].filter(Boolean).join(" ");
}

function amountInWords(v) {
  if (!nonEmpty(v)) return "";
  let n = Math.round(Number(String(v).replace(/[^\d.]/g, "")));
  if (!isFinite(n) || n <= 0) return "";
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(underThousand(crore) + " Crore");
  if (lakh) parts.push(underThousand(lakh) + " Lakh");
  if (thousand) parts.push(underThousand(thousand) + " Thousand");
  if (n) parts.push(underThousand(n));
  return parts.join(" ") + " Only";
}


function constitutionOf(cp) {
  const k = s(cp.kind).toLowerCase();
  if (!k) return "";
  if (k === "individual") return "";
  if (k === "private limited") return "private limited company";
  if (k === "public limited") return "public limited company";
  if (k === "partnership") return "registered partnership firm";
  if (k === "sole proprietorship") return "sole proprietorship";
  return "";
}

function noticeEmail(ctx, side) {
  const want = side === "entity" ? s(ctx.ent.entityName) : s(ctx.cp.legalName);
  const row = (ctx.notices || []).find((n) => want && s(n.party).toLowerCase().includes(want.toLowerCase().slice(0, 12)));
  return row ? s(row.email) : "";
}

function money(v) {
  if (!nonEmpty(v)) return "";
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  if (!isFinite(n) || !n) return s(v);
  return n.toLocaleString("en-PK");
}

// Resolve one slot against the request.
//
// Returns { value, reason }. An empty value always carries a reason, because
// "this slot is still blank" and "why it is still blank" are both things the
// person reviewing the draft needs to know.
/* WHAT SHAPE OF THING DOES THIS SLOT WANT?
 *
 * The words on either side of a blank say what KIND of value belongs in it,
 * quite apart from which field it is. "a rent-free period from ____" wants a
 * date; the label still contains the word "rent", and the rent resolver duly
 * wrote 4,500,000 into it. "possession of the Demised Premises to the Lessee
 * on ____" wants a date; "Premises" matched, and the building's address went
 * in. "within ____ days" wants a number of days, and got the address too.
 *
 * A trailing preposition is the tell, and it is reliable across these
 * templates. Once a slot is known to want a date, only the date resolvers may
 * answer it -- and if none of them fits, it is left blank rather than filled
 * by whichever noun happened to appear in the sentence.
 */
const MONTHS_RE = new RegExp("^\\s*[,.]?\\s*(" + MONTHS.join("|") + "|\\d{4})\\b", "i");

// "...a monthly rent of Rupees ____ (PKR ____)": a blank that follows the word
// Rupees takes the figure written out, the one that follows PKR takes the
// figure. Only ever applied to a number the requester already entered.
function inWordsIfAsked(val, label) {
  return (/\brupees$/i.test(String(label).trim()) && /^[\d,]+$/.test(val)) ? amountInWords(val) : val;
}

function shapeOf(label, after) {
  const tail = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b(on|from|until|till|upto|w\.e\.f\.?|dated|effective)$/.test(tail)) return "date";
  if (/\b(within|after|for a period of|period of|expiry of)$/.test(tail)
      || /^\s*[,.]?\s*(days?|months?|years?|weeks?)\b/i.test(after)) return "duration";
  if (/\b(rupees|pkr|rs\.?)$/.test(tail)) return "money";
  if (/^\s*[,.]?\s*(%|percent)\b/i.test(after)) return "percent";
  return null;
}

/* The template often prints the unit itself: "a total of ____ sq.ft.". The
   request stores "18,000 sq ft", so inserting it verbatim gives "18,000 sq ft
   sq.ft.". Where the template supplies the unit, the value gives it up. */
const UNIT_FAMILIES = [
  [/^\s*[,.]?\s*sq\.?\s*(ft|feet)/i, /\s*sq\.?\s*(ft|feet)\.?$/i],
  [/^\s*[,.]?\s*sq\.?\s*(yds|yards)/i, /\s*sq\.?\s*(yds|yards)\.?$/i],
  [/^\s*[,.]?\s*days?\b/i, /\s*days?$/i],
  [/^\s*[,.]?\s*months?\b/i, /\s*months?$/i],
  [/^\s*[,.]?\s*years?\b/i, /\s*years?$/i],
  [/^\s*[,.]?\s*(%|percent)/i, /\s*%$/],
];

function dedupeUnit(value, after) {
  for (const [inTemplate, inValue] of UNIT_FAMILIES) {
    if (inTemplate.test(after) && inValue.test(value)) {
      return value.replace(inValue, "").replace(/[,.]\s*$/, "").trim();
    }
  }
  return value;
}

// How close two occurrences of the same per-person field have to be before
// they count as two different people rather than one person mentioned twice.
const SIBLING_GAP = 3;

function resolve(ctx, slot, paraText, state) {
  const label = (slot.label || "").trim();
  if (!label) return { value: "", reason: "UNLABELLED_BLANK" };
  if (slot.weak) return { value: "", reason: "UNLABELLED_PLACEHOLDER" };

  // A paragraph that names no role at all still has to attribute its blanks to
  // somebody, and in these forms the pre-printed side is ours -- the blanks are
  // overwhelmingly the counterparty's to complete. Defaulting to `null` here
  // looked harmless but skipped the per-person counting below, which put the
  // first counterparty's name and CNIC into all three lessor blocks again.
  const party = partyFor(ctx, label, paraText, slot.start) || "counterparty";
  const after = paraText.slice(slot.end, slot.end + 28);
  const shape = shapeOf(label, after);

  // A date slot sitting immediately before a month or a year the template has
  // already printed -- "commencing on ____ August, 2020" -- cannot be filled
  // without producing nonsense, because the template's own month and year are
  // part of the sentence and are not ours to overwrite. It is flagged instead.
  if (shape === "date" && MONTHS_RE.test(after)) {
    return { value: "", reason: "DATE_SLOT_HAS_FIXED_MONTH_OR_YEAR_IN_TEMPLATE", party };
  }

  /* THE TEMPLATE'S OWN DEFINED TERM IS THE BEST LABEL THERE IS.
     "...a sum equal to four (4) months' Monthly Rent amounting to a total of
     Rupees ____ (PKR ____) as security (the "Security Deposit")" -- everything
     before the blank is about the rent, and the rent is what went in. What the
     blank actually holds is named straight after it, in the defined term the
     draftsman attached to it. Where one is present it is tried first, and the
     surrounding prose is only consulted if it answers nothing. */
  // A wider window than `after`: the defined term trails the whole phrase, past
  // the "(PKR ____)" restatement, not just the blank.
  const defined = (paraText.slice(slot.end, slot.end + 140)
    .match(/\(\s*(?:the\s+)?[“"']([^”"']{3,40})[”"']/) || [])[1];
  // Only for a slot that had no label of its own. Where the template labelled
  // the blank itself the label wins: "[●ADDRESS] (\u201CProject\u201D)" is the
  // project's ADDRESS, and letting the defined term answer put the project's
  // NAME there instead. A defined term next to a labelled blank names the
  // thing being described, not the value going in.
  if (defined && !slot.ownLabel && !slot.__viaDefined) {
    const via = resolve(ctx, { ...slot, label: defined, weak: false, __viaDefined: true }, paraText, state);
    // The words/figures convention is decided by the prose around THIS blank,
    // not by the defined term that answered it: "Rupees ____ (PKR ____)" still
    // wants the first in words even though both resolve via "Monthly Rent".
    if (via.value) return { ...via, value: inWordsIfAsked(via.value, label), party };
  }

  for (const r of RESOLVERS) {
    if (shape && r.kind !== shape) continue;
    if (!r.re.test(label)) continue;

    // A per-person fact on the counterparty side belongs to the Nth
    // counterparty, not to the first one every time.
    //
    // This template has three lessor blocks:
    //   Mr. ______ S/o ______, holding CNIC No. ______, resident of ______
    // repeated. Filling all three from counterparties[0] wrote one man's CNIC
    // under two other people's names -- a false statement about identifiable
    // individuals, in a document heading for signature. Each repeat now takes
    // the next counterparty on the request, and where the request does not
    // have one the block is left exactly as the template had it.
    // Sibling blocks sit together; a restatement sits far away. The three
    // lessor blocks are consecutive paragraphs of one recital, so the second
    // time "holding CNIC No. ____" appears two paragraphs later it is a
    // DIFFERENT lessor. The buyer's name on the signature page, twenty
    // paragraphs after the allottee section, is the SAME buyer -- and counting
    // that as a second counterparty blanked half the document.
    //
    // Proximity is what separates the two, and it is the template's own
    // layout rather than a guess about its meaning.
    let cp = ctx.cp;
    if (r.pid && party === "counterparty") {
      const last = state.lastPara[r.pid];
      const n = (last != null && state.para - last <= SIBLING_GAP)
        ? (state.seen[r.pid] = (state.seen[r.pid] || 1) + 1)
        : (state.seen[r.pid] = 1);
      state.lastPara[r.pid] = state.para;
      cp = ctx.cps[n - 1];
      if (!cp) {
        return { value: "", reason: "NO_COUNTERPARTY_" + n + "_ON_REQUEST" };
      }
    }

    let val = r.get(ctx, party, cp || {}, state) || "";
    if (val) {
      val = dedupeUnit(String(val), after);
      // "a monthly rent of Rupees ____ (PKR ____)" -- the first blank takes the
      // figure in words, the second the figure itself.
      if (r.kind === "money") {
        state.lastAmount = /^[\d,]+$/.test(val) ? val : state.lastAmount;
        val = inWordsIfAsked(val, label);
      }
      return { value: val, reason: null, party };
    }

    // A matched label whose field is empty has been answered -- by nothing.
    // Stop here rather than falling through to a looser pattern, which is how
    // a "Completion Date" slot ends up holding the day of the month.
    return { value: "", reason: "REQUEST_FIELD_EMPTY", party };
  }
  return { value: "", reason: shape ? "NO_" + shape.toUpperCase() + "_FIELD_FOR_LABEL" : "NO_MAPPING_FOR_LABEL" };
}

/* ------------------------------------------------------------- the drafting */

// Fill one part of the document (the body, a header or a footer).
function fillPart(xml, ctx, report, state) {
  return xml.replace(PARA_RE, (para) => {
    const { runs, text } = runsOf(para);
    if (!text.trim()) return para;
    state.para++;
    const slots = findSlots(text);
    if (!slots.length) return para;

    const edits = [];
    for (const slot of slots) {
      const { value, reason, party } = resolve(ctx, slot, text, state);
      const entry = {
        label: slot.label || "(unlabelled)",
        kind: slot.kind,
        context: contextLine(text, slot),
        party: party || null,
        reason: reason || null,
      };
      if (value) {
        // A ruled blank keeps its rule: the value is written onto the line so
        // the document still looks like the form it is, rather than collapsing
        // the layout. A bracketed slot is simply replaced.
        // A rule that runs to the end of its line is a form field, and keeping
        // the rest of the line preserves the look of the form. A rule in the
        // middle of a sentence -- "Mr. ______ S/o ______" -- is not, and
        // leaving the leftover underscores in mid-sentence reads as damage.
        const toEol = !/\S/.test(text.slice(slot.end));
        const out = (slot.kind === "rule" && toEol) ? padToRule(value, slot.width) : value;
        edits.push({ start: slot.start, end: slot.end, value: out });
        entry.value = value;
        report.filled.push(entry);
      } else {
        report.unfilled.push(entry);
      }
    }
    return edits.length ? applyEdits(para, runs, edits) : para;
  });
}

// Keep the underscores that the value does not cover, so a filled form still
// reads as a form and the eye can see the line it was written on.
function padToRule(value, width) {
  const rest = Math.max(0, (width || 0) - value.length - 1);
  return value + (rest > 2 ? " " + "_".repeat(rest) : "");
}

function contextLine(text, slot) {
  const from = Math.max(0, slot.start - 70);
  const to = Math.min(text.length, slot.end + 30);
  return (from > 0 ? "…" : "") + text.slice(from, to).replace(/\s+/g, " ").trim() + (to < text.length ? "…" : "");
}

/* --------------------------------------------------------------- the entry */

// Read one approved template out of Drive. Only ids that are in the crawled
// index resolve, so this cannot be pointed at an arbitrary file.
async function templateBuffer(fileId) {
  if (!drive.indexFiles().length) await drive.ensureIndex();
  const meta = drive.fileById(fileId);
  if (!meta) throw new Error("Template is not in the knowledge base");
  if (!/\.docx$/i.test(meta.name || "")) {
    throw new Error("Only .docx templates can be drafted from. " + meta.name + " is not one.");
  }
  return await new Promise((resolve, reject) => {
    let code = 200;
    drive.streamFile(fileId, {
      writeHead(c) { code = c; },
      end(b) {
        if (code === 200 && Buffer.isBuffer(b)) resolve(b);
        else reject(new Error("Drive returned " + code));
      },
    }).catch(reject);
  });
}

// Draft the contract: the approved template, with this request's values in it.
//
// Returns the .docx bytes and a coverage report. The report is not decoration
// -- it is how the reader knows which parts of the document are still the
// template's blanks, and it is shown in the UI and written into the document.
async function draft(rec, fileId) {
  const meta = drive.fileById(fileId) || {};
  const buf = await templateBuffer(fileId);
  const zip = await JSZip.loadAsync(buf);
  const ctx = contextOf(rec);
  const report = { filled: [], unfilled: [] };
  // Carried across every part of the document so a party block repeated in the
  // body and again in a footer is counted once, in reading order.
  const state = { seen: {}, lastPara: {}, para: 0 };

  // The body, plus headers and footers -- party names and dates live in those
  // too on several of these forms.
  // The body is processed first so that the counterparty counting above runs
  // in the order a reader meets the parties, not in whatever order JSZip
  // happens to list the parts.
  const parts = Object.keys(zip.files)
    .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
    .sort((a, b) => (a.includes("document") ? -1 : b.includes("document") ? 1 : a.localeCompare(b)));
  for (const name of parts) {
    const xml = await zip.file(name).async("string");
    zip.file(name, fillPart(xml, ctx, report, state));
  }

  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const total = report.filled.length + report.unfilled.length;
  return {
    buffer: out,
    filename: draftName(rec, meta),
    mime: DOCX_MIME,
    template: { id: fileId, name: meta.name || "", folderPath: meta.folderPath || "" },
    coverage: {
      slots: total,
      filled: report.filled.length,
      unfilled: report.unfilled.length,
      percent: total ? Math.round((report.filled.length / total) * 100) : 0,
    },
    filled: report.filled,
    unfilled: report.unfilled,
  };
}

// Report what WOULD be filled, without generating anything. This is what the
// UI shows before you commit, so the coverage is visible up front.
async function preview(rec, fileId) {
  const r = await draft(rec, fileId);
  delete r.buffer;
  return r;
}

function draftName(rec, meta) {
  const base = String(meta.name || "Draft").replace(/\.docx$/i, "")
    .replace(/[_\s]*(STANDARD\s*)?TEMPLATE[_\s]*/ig, " ").replace(/\s+/g, " ").trim();
  const cp = ((rec.values || {}).counterparties || [])[0] || {};
  const who = s(cp.legalName).replace(/[^\w\s-]/g, "").trim();
  return [rec.id, base, who ? "- " + who : "", "(DRAFT).docx"]
    .filter(Boolean).join(" ").replace(/\s+/g, " ");
}

/* --------------------------------------------- picking the right template */

// Which approved templates suit a request type. These point at the families
// that exist in the library rather than at named files, so a template added or
// renamed in Drive is picked up without a code change.
const TYPE_HINTS = {
  "CRF-01": /project\s*(promotion|sales)|\bPPA\b|IT\s*&?\s*project|classified|listing/i,
  "CRF-02": /lease|tenancy|rent/i,
  "CRF-03": /service\s*agree|services/i,
  "CRF-04": /land|agreement\s+to\s+sell|sale\s+deed|purchase/i,
  "CRF-05": /construction|works|contractor|turnkey/i,
  "CRF-06": /consultanc|advisor/i,
  "CRF-07": /architect|design|drawing/i,
  "CRF-08": /joint\s*venture|\bJV\b|partnership/i,
  "CRF-09": /agreement|\bMoU\b|letter\s+of\s+intent/i,
  "CRF-10": /non.?disclosure|\bNDA\b|confidential/i,
};

// The approved template library, as files. Restricted to .docx because a PDF
// or a scan has no slots to fill.
function libraryFiles() {
  return drive.indexFiles().filter((f) =>
    /Contract Templates/i.test(f.folderPath || "") && /\.docx$/i.test(f.name || ""));
}

function templatesFor(type) {
  const re = TYPE_HINTS[type];
  const all = libraryFiles();
  const hit = re ? all.filter((f) => re.test(f.name || "") || re.test(f.folderPath || "")) : [];
  return {
    matched: hit.map(brief),
    // Everything else stays available: the matcher is a shortcut to the likely
    // template, never a restriction on which one Legal may use.
    others: all.filter((f) => !hit.includes(f)).map(brief),
  };
}

const brief = (f) => ({ id: f.id, name: f.name, folderPath: f.folderPath || "", modifiedTime: f.modifiedTime || "" });

module.exports = { draft, preview, templatesFor, libraryFiles, findSlots, runsOf, contextOf, DOCX_MIME };
