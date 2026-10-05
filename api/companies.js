/* COMPANIES — the primary compliance object.
 *
 * Everything a compliance lawyer holds belongs TO a company: its projects, its
 * loans, its licences, its statutory filings, its resolutions, its contracts
 * and its litigation. Until now those lived in six registers joined in the
 * browser, one register at a time, which meant a compliance account could not
 * see a company's contracts (it may not read the commercial register) and the
 * page silently showed a company with none.
 *
 * This assembles the company record on the SERVER, from every source at once,
 * and the route then trims it to what the caller may see. The counts a person
 * is shown and the records they can open are therefore the same set.
 *
 * WHAT IS EVIDENCED, AND WHAT IS NOT.
 * The sources are trackers and a Drive folder tree. They evidence the legal
 * FORM of a company (from its registered name), its group/non-group placement
 * (from the statutory root's own two top-level folders), its statutory years,
 * its AGM obligation, and every operational record filed against it.
 *
 * They do NOT state a company's directors by name, its CEO, its company
 * secretary, its incorporation date or its parent. Those are asked for and
 * they are not in any connected source, so this reports them as NOT EVIDENCED
 * and points at the documents that would answer them (a register of directors
 * is a real filed document; its contents are a PDF, not a column). Filling
 * them with plausible values would put invented officers on a statutory record.
 */
const registers = { get ensure() { return require("./registers").ensure; } };

const str = (v) => String(v == null ? "" : v).trim();

/* WHAT THE STATUTORY REGISTERS SAY, read once and cached.
   Written by tools/secp-officers-extract.js from the .docx registers in the
   statutory root. Absent (a fresh checkout, or the extract not yet run) the
   company simply reports these as not evidenced, exactly as before — a missing
   file must not take the companies page down with it. */
/* CURRENT OFFICERS, FROM THE FILING CHRONOLOGY — NOT THE NEWEST FILENAME.
 *
 * Form 29 records CHANGES: a person appointed, a person ceased. So the current
 * chief executive is not "whoever the most recent form mentions" — that form
 * might be recording their departure. It is the person most recently appointed
 * to the office with no later cessation against them.
 *
 * Events are gathered from every Form 29 read for the company, ordered by the
 * date the form itself gives (falling back to the filing date in the file
 * name), and the office is resolved by walking that order. Where two filings
 * give the same date and disagree, nobody is named — a coin toss is not
 * evidence.
 */
let _f29 = null;
function form29For(key) {
  if (_f29 === null) {
    try {
      const raw = JSON.parse(require("fs").readFileSync(
        require("path").join(__dirname, "..", "config", "form29-officers.json"), "utf8"));
      _f29 = raw.entities || {};
    } catch (e) { _f29 = {}; }
  }
  return _f29[key] || null;
}

/* THE OFFICER TIMELINE (§21).
 *
 * All 267 Form 29 filings have now been read, not just the newest few, so the
 * estate can say who held an office BEFORE the person holding it today. Events
 * are deduplicated on person + event + date, because the same change is often
 * filed twice (a CTC and a DCTC of the same form).
 */
function officeHistoryFrom(f29, office) {
  if (!f29) return [];
  const seen = new Set();
  const out = [];
  for (const f of f29.filings || []) {
    for (const o of f.officers || []) {
      if (o.office !== office) continue;
      const when = o.date || f.formDate || f.filedOn || "";
      const k = [String(o.name).toLowerCase(), (o.event || "").toLowerCase(), when].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: o.name, event: o.event || null, when: when || null,
        source: { driveId: f.fileId, name: f.name } });
    }
  }
  return out.sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

function currentOfficeFrom(f29, office) {
  if (!f29) return null;
  const events = [];
  for (const f of f29.filings || []) {
    for (const o of f.officers || []) {
      if (o.office !== office) continue;
      events.push({
        name: o.name, event: (o.event || "").toLowerCase(),
        when: o.date || f.formDate || f.filedOn || "",
        source: { driveId: f.fileId, name: f.name, page: o.page || null, filedOn: f.filedOn || null },
      });
    }
  }
  if (!events.length) return null;
  events.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  /* Walk forward: an appointment sets the holder, a cessation of the holder
     clears it. What survives the walk is who holds the office now. */
  let holder = null;
  for (const e of events) {
    if (/ceas|resign|remov/.test(e.event)) { if (holder && holder.name === e.name) holder = null; continue; }
    holder = { name: e.name, since: e.when || null, source: e.source };
  }
  return holder;
}

let _officers = null;
function officersFor(key) {
  if (_officers === null) {
    try {
      const raw = JSON.parse(require("fs").readFileSync(
        require("path").join(__dirname, "..", "config", "secp-officers.json"), "utf8"));
      _officers = raw.entities || {};
    } catch (e) { _officers = {}; }
  }
  if (_officers[key]) return _officers[key];
  /* The company registry and the statutory root spell some names differently,
     so fall back to a normalised match before giving up. */
  const n = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const want = n(key);
  for (const [k, v] of Object.entries(_officers)) {
    if (n(k) === want || n(v.entity) === want) return v;
  }
  return null;
}
const NOT_EVIDENCED = null;   // a field no connected source states

function key(name) { return require("./entities").entityKey(name); }

/* The statutory root's own two top-level folders are the only source in the
   estate that says whether a company is inside the group. Anything the root
   does not carry is reported as unplaced rather than assumed to be either. */
function groupPlacement() {
  const m = new Map();
  try {
    for (const e of require("./secp-source").build().entities) {
      m.set(e.key, { group: e.group, folderPath: e.folderPath, documents: e.documents,
        forms: e.forms, categories: e.categories || {}, years: e.years || [] });
    }
  } catch (e) { /* the statutory root may not be shared; placement is then unknown */ }
  return m;
}

/* Build the whole index once. Each company carries its records by family, plus
   the provenance of everything asserted about it. */
async function index() {
  const st = await registers.ensure();
  const R = (st && st.registers) || {};
  const placement = groupPlacement();
  let types = new Map();
  try {
    const list = await require("./entities").list();
    for (const e of (list.entities || list || [])) types.set(e.key, e);
  } catch (e) { /* the registry is a bonus; the index stands without it */ }

  const m = new Map();
  let pendingNotices = [];
  const get = (raw) => {
    const name = str(raw);
    const k = key(name);
    if (!k || k.length < 3) return null;
    let c = m.get(k);
    if (!c) {
      c = { key: k, name, aliases: new Set([name]),
        contracts: [], litigation: [], notices: [], licences: [], loans: [], resolutions: [], properties: [] };
      m.set(k, c);
    }
    c.aliases.add(name);
    if (name.length > c.name.length) c.name = name;   // the fullest registered spelling
    return c;
  };

  /* THE CONTRACT REGISTER NAMES ITS PARTY "firstParty", NOT "entityName".
     `entityName` is created by the BROWSER adapter (live.js canonEntity); the
     server rows have never carried it. Reading it here produced an empty key
     for all 1,252 contracts, every one of them was dropped, and every company
     in the estate showed zero contracts — on a page whose whole purpose is to
     show what a company holds. A tracker row often signs under several
     entities in one cell, so each named party is attributed, which is what the
     register itself means by that column. */
  for (const r of R.contracts || []) {
    const parties = str(r.firstParty).split(/[,\n]/).map(str).filter(Boolean);
    const seen = new Set();
    for (const p of (parties.length ? parties : [str(r.entityName)])) {
      const c = get(p);
      if (c && !seen.has(c.key)) { seen.add(c.key); c.contracts.push(r); }
    }
  }
  for (const r of R.litigation || []) { const c = get(r.entity); if (c) c.litigation.push(r); }
  /* A NOTICE ATTACHES TO A COMPANY WE ALREADY KNOW, AND NEVER CREATES ONE.
     A notice names two parties and usually only one of them is ours: the other
     is a developer, a bank or a private individual. Attributing by name alone
     added 57 "companies" to the estate, every one of them a counterparty on a
     single notice. So notices are matched against the companies the identity
     sources have already established — the contract, litigation, licence,
     loan, resolution and property registers, plus the statutory root — and a
     notice between two outside parties simply attaches to neither. */
  const attach = (raw, fam, rec) => {
    const k = key(str(raw));
    if (!k || k.length < 3) return false;
    const c = m.get(k);
    if (!c) return false;
    c[fam].push(rec);
    return true;
  };
  pendingNotices = (R.notices || []);
  for (const r of R.licences || []) { const c = get(r.entity); if (c) c.licences.push(r); }
  for (const r of R.loans || []) { const c = get(r.borrower); if (c) c.loans.push(r); }
  for (const r of R.resolutions || []) { const c = get(r.entity); if (c) c.resolutions.push(r); }
  for (const r of R.properties || []) { const c = get(r.entity); if (c) c.properties.push(r); }
  /* Notices are attached only after every identity source has been read, so
     "do we know this company" is answered against the full set rather than
     against whatever happened to be loaded first. */
  for (const r of pendingNotices) {
    if (!attach(r.entity, "notices", r)) {
      if (!attach(r.recipient, "notices", r)) attach(r.sender, "notices", r);
    }
  }

  /* A company that files with SECP and holds nothing else is still a company —
     eight of them are known only from the statutory root, and leaving them out
     meant LegalOS held 276 statutory documents for a company it would not
     admit existed. */
  for (const [k, p] of placement) { if (!m.has(k)) { const c = get(p.folderPath.split("/").pop()); if (c) c.key = k; } }

  return { companies: [...m.values()], placement, types, registers: R };
}

/* The public shape of one company. `counts` is what the landing page ranks on;
   the record arrays stay on the server unless a detail is asked for. */
function shape(c, placement, types) {
  const p = placement.get(c.key) || null;
  const t = types.get(c.key) || null;
  const off = officersFor(c.key);
  const f29 = form29For(c.key);
  const ceo = currentOfficeFrom(f29, "Chief Executive");
  const secretary = currentOfficeFrom(f29, "Company Secretary");
  const docIds = new Set();
  for (const fam of ["contracts", "litigation", "notices", "licences", "loans", "resolutions", "properties"]) {
    for (const r of c[fam]) for (const f of (r.driveFiles || [])) if (f && f.id) docIds.add(f.id);
  }
  const projects = [...new Set(c.properties.map((r) => str(r.project)).filter(Boolean))];
  const counts = {
    contracts: c.contracts.length, litigation: c.litigation.length, notices: c.notices.length,
    licences: c.licences.length, loans: c.loans.length, resolutions: c.resolutions.length,
    properties: c.properties.length, projects: projects.length,
    documents: docIds.size + ((p && p.documents) || 0),
    statutory: (p && p.documents) || 0,
  };
  const records = counts.contracts + counts.litigation + counts.notices + counts.licences
    + counts.loans + counts.resolutions + counts.properties;

  return {
    key: c.key,
    name: c.name,
    aliases: [...c.aliases].filter((a) => a !== c.name),
    /* THE LEGAL FORM, read from the registered name — the only statement about
       a company that the sources genuinely make. */
    type: t ? t.type : "UNKNOWN",
    /* The SAME string entities.js uses for an undetermined form. Two spellings
       of one label (an em dash here, a hyphen there) produced two options in
       the Company type filter for the same thing. */
    typeLabel: t ? t.typeLabel : require("./entities").TYPES.UNKNOWN.label,
    typeConflict: t ? t.typeConflict || null : null,
    /* GROUP OR NOT, read from the statutory root's own folder split. A company
       the root does not carry is "unplaced", never defaulted into the group. */
    group: p ? p.group : "unplaced",
    statutoryFolder: p ? p.folderPath : null,
    statutoryYears: p ? (p.years || []).map((y) => y.year) : [],
    /* WHAT THE STATUTORY FOLDERS EVIDENCE about the company's officers —
       documents, not names. A register of directors is a filed PDF; its
       contents are not a column in any tracker. */
    officerEvidence: {
      registerOfDirectors: (p && p.categories && p.categories.REGISTER_OF_DIRECTORS) || 0,
      registerOfMembers: (p && p.categories && p.categories.REGISTER_OF_MEMBERS) || 0,
      agmPapers: (p && p.categories && p.categories.AGM) || 0,
      shareCertificates: (p && p.categories && p.categories.SHARE_CERTIFICATE) || 0,
      corporateActions: (p && p.categories && p.categories.CORPORATE_ACTION) || 0,
    },
    /* READ OUT OF THE STATUTORY REGISTERS THEMSELVES.
       This block used to be five flat NOT_EVIDENCEDs, on the stated grounds
       that "a register of directors is a filed PDF". That was not true: 91 of
       the 102 registers in the statutory root are .docx, and they state the
       directors, their appointment and resignation dates, the members, and the
       company's Corporate Unique Identification Number in plain text. Nobody
       had opened them. tools/secp-officers-extract.js now does, and what
       follows is what those documents say — never an inference from a name.

       CEO and company secretary are still not evidenced, and for a reason that
       can now be stated precisely rather than assumed: the registers of
       directors record only directorships, and the 267 Form 29 filings (which
       do carry those offices) are scanned images with no text layer. */
    directors: (off && off.currentOfficers && off.currentOfficers.length)
      ? off.currentOfficers.map((o) => ({ name: o.name, role: o.role, appointed: o.appointed, source: o.source }))
      : NOT_EVIDENCED,
    directorHistory: (off && off.officers && off.officers.length) ? off.officers.length : 0,
    cuin: (off && off.cuin) || NOT_EVIDENCED,
    /* Read off the Form 29 scans — see tools/form29-officers.js. Where the
       filings for a company have been read and name nobody, the field carries
       the fact that they WERE read, which is a different answer from silence. */
    ceo: ceo ? { name: ceo.name, since: ceo.since, source: ceo.source } : NOT_EVIDENCED,
    ceoState: ceo ? "CEO_EVIDENCED"
      : (f29 && (f29.filings || []).length ? "CEO_NOT_EVIDENCED_AFTER_FORM29_REVIEW" : NOT_EVIDENCED),
    companySecretary: secretary ? { name: secretary.name, since: secretary.since, source: secretary.source } : NOT_EVIDENCED,
    companySecretaryState: secretary ? "COMPANY_SECRETARY_EVIDENCED"
      : (f29 && (f29.filings || []).length ? "COMPANY_SECRETARY_NOT_EVIDENCED_AFTER_FORM29_REVIEW" : NOT_EVIDENCED),
    form29Reviewed: f29 ? (f29.filings || []).length : 0,
    /* Who held these offices before — read out of the same filings. */
    officerHistory: f29 ? {
      ceo: officeHistoryFrom(f29, "Chief Executive"),
      companySecretary: officeHistoryFrom(f29, "Company Secretary"),
      directors: officeHistoryFrom(f29, "Director"),
    } : null,
    incorporationDate: NOT_EVIDENCED,
    /* §10 — EVERY COMPANY ENDS WITH A STATED POSITION ON EVERY FIELD.
       A blank cell says nothing about whether anybody looked. These say, for
       each fact, whether it is evidenced, whether it does not apply, or that
       the source was reviewed and is silent — and name what was reviewed. */
    sourceCoverage: (() => {
      const hasStatutory = !!p;
      const regs = (p && p.categories) || {};
      const mk = (state, detail) => ({ state, detail });
      return {
        directors: (off && off.currentOfficers && off.currentOfficers.length)
          ? mk("EVIDENCED", (off.currentOfficers.length) + " serving, from the register of directors")
          : (regs.REGISTER_OF_DIRECTORS
            ? mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", "The register of directors was read and names nobody currently serving.")
            : mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", hasStatutory
              ? "This company's statutory folder holds no register of directors."
              : "This company has no statutory folder in the SECP root — it is known from operational sources only.")),
        ceo: ceo ? mk("EVIDENCED", "From Form 29, by filing chronology")
          : (f29 && (f29.filings || []).length
            ? mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", "All " + f29.filings.length + " Form 29 filing(s) were rendered and read; none names a chief executive.")
            : mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", hasStatutory
              ? "No Form 29 is filed in this company's statutory folder."
              : "This company has no statutory folder in the SECP root.")),
        companySecretary: secretary ? mk("EVIDENCED", "From Form 29, by filing chronology")
          : (f29 && (f29.filings || []).length
            ? mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", "All " + f29.filings.length + " Form 29 filing(s) were rendered and read; none names a company secretary.")
            : mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", hasStatutory
              ? "No Form 29 is filed in this company's statutory folder."
              : "This company has no statutory folder in the SECP root.")),
        cuin: (off && off.cuin) ? mk("EVIDENCED", "Printed on this company's statutory registers")
          : mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", hasStatutory
            ? "No register in this company's statutory folder prints a CUIN."
            : "This company has no statutory folder in the SECP root."),
        parentEntity: (off && off.parents && off.parents.length)
          ? mk("EVIDENCED", "The corporate member still holding shares, from the register of members")
          : (regs.REGISTER_OF_MEMBERS
            ? mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", "The register of members was read and shows no corporate member — the shares are held by individuals.")
            : mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", hasStatutory
              ? "This company's statutory folder holds no register of members."
              : "This company has no statutory folder in the SECP root.")),
        incorporationDate: mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW",
          "No certificate of incorporation is filed in the statutory root for this company."),
        agmApplies: (t && t.requirements)
          ? (t.requirements.agm === false
            ? mk("NOT_APPLICABLE", "A single-member company holds no annual general meeting.")
            : mk("EVIDENCED", "Follows from the legal form in the registered name."))
          : mk("NOT_EVIDENCED_AFTER_SOURCE_REVIEW", "The legal form could not be determined from the registered name."),
      };
    })(),
    /* The parent is the corporate member the register of members shows still
       holding shares. Where two do, both are named — a joint venture has two
       parents and picking one would be a fabrication. */
    parentEntity: (off && off.parents && off.parents.length)
      ? (off.parents.length === 1 ? off.parents[0].name : off.parents.map((x) => x.name).join(" · "))
      : NOT_EVIDENCED,
    parentEvidence: (off && off.parents && off.parents.length) ? off.parents : null,
    /* A PARENT THAT IS NOT IN THIS REGISTRY IS NOT A BROKEN LINK.
       Six of the group's parents are foreign holding companies — Zameen Limited
       (UK), EMPG Holdings, EMPG Projects Holdings, EMPG Classifieds (PK)
       Holdings, Dubizzle Group Holdings, OLX Middle East Holdings B.V. They sit
       above the Pakistani companies and have no SECP folder because they are
       not registered in Pakistan. The register of members names them, so the
       relationship is evidenced; they are simply outside the estate this system
       holds, and saying so is better than showing an unresolved parent. */
    parentIsOutsideEstate: (off && off.parents && off.parents.length)
      ? !off.parents.some((x) => placement.has(require("./entities").entityKey(x.name)))
      : null,
    /* The AGM obligation IS derivable: it follows from the legal form, and the
       due date follows from the financial year end plus the configured window.
       `agm: false` means it does not apply (a single-member company holds no
       AGM); `null` means the form could not be determined. */
    agmApplies: t && t.requirements ? t.requirements.agm : null,
    statutoryNote: t && t.requirements ? t.requirements.note : null,
    projects,
    counts,
    records,
    /* AN EMPTY COMPANY holds nothing operational at all: no contract, no
       licence, no loan, no case, no resolution, no property. It may still have
       a statutory folder, which is exactly why "empty" is worth counting —
       a company that files and does nothing else is either dormant or a gap. */
    empty: records === 0,
  };
}

async function list() {
  const { companies, placement, types } = await index();
  const rows = companies.map((c) => shape(c, placement, types))
    .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name));
  const projects = new Set();
  for (const r of rows) for (const p of r.projects) projects.add(p);
  return {
    companies: rows,
    totals: {
      companies: rows.length,
      projects: projects.size,
      empty: rows.filter((r) => r.empty).length,
      group: rows.filter((r) => r.group === "group").length,
      nonGroup: rows.filter((r) => r.group === "non-group").length,
      unplaced: rows.filter((r) => r.group === "unplaced").length,
    },
    /* WHAT IS NOT HERE, said once rather than as eight blank fields. */
    notEvidenced: {
      fields: ["ceo", "companySecretary", "incorporationDate"],
      reason: "The registers of directors and members have been read and state the directors, the members and the company's CUIN — those are populated from the documents. They do not record a chief executive or a company secretary, and the Form 29 filings that would (267 of them) are scanned images with no text layer, so those two offices cannot be read without OCR. No incorporation date is stated in any connected source. LegalOS does not infer an officer, a date or a parent from a name.",
    },
  };
}

async function detail(k) {
  const { companies, placement, types } = await index();
  const c = companies.find((x) => x.key === k);
  if (!c) return null;
  const base = shape(c, placement, types);
  const p = placement.get(c.key) || null;
  /* THE COMPANIES THIS ONE IS TIED TO, ON THE COMPANY.
     The structure endpoint has always known these; the detail did not carry
     them, so a company page could not answer "does this have subsidiaries" —
     the question §36 asks — without the reader going to another screen and
     finding the row again. Same edges, same evidence, computed by the same
     function, so the two views cannot disagree.

     They are RELATED companies, not subsidiaries: no source in this estate
     states ownership, and calling an intercompany lender a parent would be an
     assertion about share capital made from a loan agreement. The page says so
     rather than dressing it up as a group tree. */
  let related = [];
  try {
    const st = await structure();
    const me = (st.groups || []).flatMap((g) => g.companies).find((x) => x.key === c.key);
    related = (me && me.links) || [];
  } catch (e) { related = []; }
  return {
    ...base,
    related,
    statutory: p ? { folderPath: p.folderPath, documents: p.documents, forms: p.forms, years: p.years, categories: p.categories } : null,
    records: {
      contracts: c.contracts, litigation: c.litigation, notices: c.notices,
      licences: c.licences, loans: c.loans, resolutions: c.resolutions, properties: c.properties,
    },
  };
}

/* THE CORPORATE STRUCTURE, BUILT ONLY FROM EVIDENCED RELATIONSHIPS.
 *
 * No source states a parent company, so this is NOT an ownership tree and does
 * not pretend to be one. What the sources do evidence is:
 *
 *   PLACEMENT   the statutory root files a company under Group Entities or
 *               Non-Group Entities. That is the group's own filing decision.
 *   LENDING     an intercompany loan names a borrower and a lender, both group
 *               companies. That is a real, dated, documented relationship.
 *   PROJECTS    two companies appearing on the same project are related through
 *               it, and the project register says so.
 *
 * The tree is therefore Group / Non-Group / Unplaced at the top, companies
 * beneath, and each company's evidenced links listed against it with the
 * record that evidences them. Every edge can be opened.
 */
async function structure() {
  const { companies, placement, types, registers: R } = await index();
  const rows = companies.map((c) => shape(c, placement, types));
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const links = new Map();      // key -> [{kind, otherKey, otherName, detail, ref}]
  const push = (a, b, kind, detail, ref) => {
    if (!a || !b || a === b) return;
    if (!links.has(a)) links.set(a, []);
    const other = byKey.get(b);
    links.get(a).push({ kind, otherKey: b, otherName: other ? other.name : b, detail, ref });
  };

  for (const l of (R.loans || [])) {
    const b = key(l.borrower), d = key(l.lender);
    if (!b || !d || !byKey.has(b) || !byKey.has(d)) continue;
    push(b, d, "borrows-from", "Loan" + (l.ref ? " " + l.ref : ""), l.id);
    push(d, b, "lends-to", "Loan" + (l.ref ? " " + l.ref : ""), l.id);
  }
  /* OWNERSHIP, FROM THE REGISTER OF MEMBERS (§37/§38).
     The structure graph was built only from intercompany lending and shared
     projects, because at the time nothing in the estate stated ownership. The
     registers of members have now been read and they do state it, so a real
     parent → subsidiary edge belongs on this graph. It is kept as its own kind
     so nobody mistakes "lends to" for "owns".
     A parent outside the managed estate — Zameen Limited (UK), the EMPG and
     Dubizzle holding companies — is carried as an external node rather than
     dropped, which is what stops a subsidiary looking like an orphan. */
  const external = new Map();
  for (const r of rows) {
    if (!r.parentEntity) continue;
    for (const pn of String(r.parentEntity).split(" · ")) {
      const pk = key(pn);
      if (byKey.has(pk)) {
        push(r.key, pk, "owned-by", "Register of members", null);
        push(pk, r.key, "owns", "Register of members", null);
      } else {
        if (!external.has(pk)) external.set(pk, { key: pk, name: pn, external: true, subsidiaries: [] });
        external.get(pk).subsidiaries.push({ key: r.key, name: r.name });
        push(r.key, pk, "owned-by-external", "Register of members — parent is outside the managed estate", null);
      }
    }
  }

  const byProject = new Map();
  for (const p of (R.properties || [])) {
    const pr = str(p.project); const k = key(p.entity);
    if (!pr || !k || !byKey.has(k)) continue;
    if (!byProject.has(pr)) byProject.set(pr, new Set());
    byProject.get(pr).add(k);
  }
  for (const [project, set] of byProject) {
    const ks = [...set];
    if (ks.length < 2) continue;
    for (const a of ks) for (const b of ks) push(a, b, "shares-project", project, null);
  }

  const bucket = (g) => rows.filter((r) => r.group === g)
    .map((r) => ({ ...r, links: (links.get(r.key) || []).slice(0, 12) }))
    .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name));

  return {
    groups: [
      { key: "group", label: "Group Entities", companies: bucket("group") },
      { key: "non-group", label: "Non-Group Entities", companies: bucket("non-group") },
      { key: "unplaced", label: "Not placed by the statutory root", companies: bucket("unplaced") },
    ],
    /* External parents are returned as their own node list: they own companies
       in this estate but are not in it, so they belong on the tree without
       pretending to be managed entities. */
    externalParents: [...external.values()].sort((a, b) => b.subsidiaries.length - a.subsidiaries.length),
    ownership: {
      edges: rows.filter((r) => r.parentEntity).length,
      inEstate: rows.filter((r) => r.parentEntity && !r.parentIsOutsideEstate).length,
      outsideEstate: rows.filter((r) => r.parentIsOutsideEstate).length,
      basis: "The register of members in each company's statutory folder, read from the document.",
    },
    basis: "Placement is the statutory root's own Group / Non-Group folder split. Ownership comes from the register of members and is shown as owns / owned by; the other links are evidenced relationships — intercompany lending and shared projects — and are not ownership.",
  };
}

module.exports = { list, detail, structure, index };
