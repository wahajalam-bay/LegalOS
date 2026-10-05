// THE LITIGATION CASE API.
//
// Every door into case creation — manual, from a legal request, from a notice,
// from a contract, from an uploaded court document, or the assistant — comes
// through here and then through the one engine in litigation-cases.js. A
// creation path per entry point is how two cases raised in the same week end up
// with different fields populated and a register nobody can count.
//
// PERMISSIONS ARE ENFORCED HERE, NOT BY HIDING BUTTONS. Reading the litigation
// book needs the litigation group; creating or changing a case needs `edit` or
// better on it. A viewer who guesses a case id gets a 403, not a record.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const store = require("./litigation-cases");
const extract = require("./litigation-extract");

const UPLOAD_DIR = path.join(__dirname, "..", "config", "case-uploads");
const MAX_UPLOAD = 25 * 1024 * 1024;     // a court PDF, not a video

/* ------------------------------------------------------------ helpers ---- */

/* The shared readBody is JSON-only and capped at 256KB, which is right for
   every other route and far too small for a scanned petition. Uploads get
   their own reader with its own ceiling, and read RAW bytes: base64 in JSON
   would inflate a 20MB scan by a third for no benefit. */
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("the file is larger than " + Math.round(limit / 1e6) + "MB")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const clean = (v, max = 300) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const canon = (v) => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* A field the client can render as "auto-filled from X, confidence Y". The
   shape is uniform whatever the source, so the wizard has one way to show
   provenance rather than one per entry point. */
const field = (value, sourceType, sourceId, sourceLabel, confidence) => ({
  value, sourceType, sourceId: sourceId || null, source: sourceLabel || "", confidence: confidence || "high",
});

/* ------------------------------------------------------------ prefill ---- */

/* WHAT LEGALOS ALREADY KNOWS, HANDED BACK SO NOBODY RETYPES IT.
   Each branch reads a record the team has already filled in and returns the
   case fields it implies, every one carrying where it came from. */
async function prefill(from, id, registers) {
  const out = { source: { type: from, id }, fields: {}, parties: [], documents: [], links: {}, warnings: [] };
  const put = (k, v, label, conf) => { if (v !== "" && v != null) out.fields[k] = field(v, from, id, label, conf || "high"); };

  if (from === "notice") {
    const rows = await registers.get("notices");
    const n = rows.find((r) => r.id === id);
    if (!n) { out.warnings.push("That notice could not be found."); return out; }
    const label = "Legal notice " + (n.ref || n.id);
    put("title", [n.sender, n.recipient].filter(Boolean).join(" vs ") || clean(n.details, 120), label);
    put("summary", clean(n.details, 4000), label);
    put("entity", clean(n.sender, 200), label);
    out.links.noticeId = n.id;
    out.fields.direction = field("Against", from, id, label, "needs review");
    if (n.noticeDate) put("noticeDate", n.noticeDate, label);
    if (n.sender) out.parties.push({ name: clean(n.sender, 200), role: "Claimant", confidence: "high", source: label });
    if (n.recipient) out.parties.push({ name: clean(n.recipient, 200), role: "Respondent", confidence: "high", source: label });
    for (const d of (n.driveFiles || [])) out.documents.push({ name: d.name, driveFileId: d.id, source: "notice", kind: "Legal Notice" });
    return out;
  }

  if (from === "contract") {
    const rows = await registers.get("contracts");
    const c = rows.find((r) => r.id === id);
    if (!c) { out.warnings.push("That contract could not be found."); return out; }
    const label = "Contract " + (c.ref || c.id);
    put("title", clean(c.title, 200) + (c.counterParty ? " — dispute with " + clean(c.counterParty, 80) : ""), label, "needs review");
    put("entity", clean(c.firstParty, 200), label);
    put("caseType", "Contractual", label, "needs review");
    if (c.value) out.fields.claimed = field(Number(c.value) || "", from, id, label, "needs review");
    out.links.contractId = c.id;
    if (c.firstParty) out.parties.push({ name: clean(c.firstParty, 200), role: "Plaintiff", isUs: true, confidence: "high", source: label });
    if (c.counterParty) out.parties.push({ name: clean(c.counterParty, 200), role: "Defendant", confidence: "high", source: label });
    /* Documents are OFFERED, never attached wholesale. A contract can carry
       dozens of files and only a few belong on the case. */
    for (const d of (c.driveFiles || []).slice(0, 40)) out.documents.push({ name: d.name, driveFileId: d.id, source: "contract", suggested: true });
    return out;
  }

  if (from === "request") {
    let reqs = [];
    try { reqs = require("./requests").list() || []; } catch (e) { reqs = []; }
    const r = (Array.isArray(reqs) ? reqs : (reqs.requests || [])).find((x) => x.id === id);
    if (!r) { out.warnings.push("That request could not be found."); return out; }
    const label = "Legal request " + r.id;
    put("title", clean(r.title, 200), label);
    put("summary", clean(r.description || r.details, 4000), label);
    put("entity", clean(r.entity || r.entityId, 200), label);
    out.links.requestId = r.id;
    if (r.counterparty) out.parties.push({ name: clean(r.counterparty, 200), role: "Defendant", confidence: "needs review", source: label });
    for (const d of (r.attachments || [])) out.documents.push({ name: d.name || d, driveFileId: d.id || null, source: "request" });
    return out;
  }

  if (from === "case") {
    const c = store.get(id);
    if (!c) { out.warnings.push("That case could not be found."); return out; }
    out.links.caseIds = [c.id];
    put("entity", c.entity, "Case " + c.id);
    if (c.counsel && c.counsel.lead) out.fields.counselLead = field(c.counsel.lead, from, id, "Case " + c.id, "needs review");
    return out;
  }

  out.warnings.push("Unknown source.");
  return out;
}

/* THE DROP-DOWNS COME FROM THE ESTATE, NOT FROM A LIST SOMEBODY TYPED HERE.
   The litigation register already holds 61 courts, 24 case natures, 23 counsel
   and 37 entities that this business actually uses. Hard-coding a tidy
   alternative beside them would be a second taxonomy: the lawyer picks
   "Employee Dispute" from a list we invented, and it never matches the 40 rows
   already filed under it.
   So every suggestion list is derived from the real register, ordered by how
   often each value occurs, with the canonical vocabulary folded in behind so a
   brand-new estate is not left with empty menus. */
async function suggestions(registers) {
  const tally = { court: new Map(), nature: new Map(), status: new Map(), position: new Map(), counsel: new Map(), entity: new Map(), city: new Map(), jurisdiction: new Map() };
  const add = (bag, v) => {
    const s = clean(v, 160);
    if (!s || s.length < 2) return;
    const k = canon(s);
    if (!k) return;
    const cur = tally[bag].get(k);
    if (cur) cur.n++; else tally[bag].set(k, { name: s, n: 1 });
  };

  try {
    for (const r of await registers.get("litigation")) {
      add("court", r.court); add("nature", r.nature); add("status", r.status);
      add("position", r.position); add("entity", r.entity);
      add("city", r.city); add("jurisdiction", r.jurisdiction);
      /* Counsel columns hold several names separated by slashes and commas.
         Split them, or the menu offers "Hamza Haider / CLM" as one firm. */
      for (const c of String(r.counsel || "").split(/[,/;]|\band\b/)) add("counsel", c);
    }
  } catch (e) { /* the register may not be built yet */ }

  /* Cases raised here count too, so a court used once in the app is offered the
     next time rather than being typed again. */
  for (const c of store.list()) {
    add("court", c.court && c.court.name); add("city", c.court && c.court.city);
    add("jurisdiction", c.court && c.court.jurisdiction);
    add("nature", c.nature); add("entity", c.entity);
    add("counsel", (c.counsel && c.counsel.lead) || ""); add("counsel", (c.counsel && c.counsel.firm) || "");
    for (const p of (c.parties || [])) add("position", p.role);
  }

  /* The register has no city or jurisdiction column, but its court names carry
     both: "Civil Court, Lahore", "Lahore High Court". Reading the city out of
     the court name uses real data rather than shipping a list of Pakistani
     cities that may not be where this business litigates. */
  const CITY_WORDS = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
    "Peshawar", "Quetta", "Gujranwala", "Sialkot", "Hyderabad", "Bahawalpur", "Sargodha",
    "Sahiwal", "Sukkur", "Abbottabad", "Mardan", "Gujrat", "Sheikhupura", "Okara"];
  for (const { name } of tally.court.values()) {
    for (const c of CITY_WORDS) if (new RegExp("\\b" + c + "\\b", "i").test(name)) add("city", c);
  }

  const out = {};
  for (const [bag, m] of Object.entries(tally)) {
    out[bag] = [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name);
  }
  /* The canonical vocabulary goes behind what the estate actually uses, so
     nothing is missing on a fresh install and nothing invented outranks the
     real thing. */
  const behind = (list, extra) => list.concat(extra.filter((x) => !list.some((y) => canon(y) === canon(x))));
  out.nature = behind(out.nature, store.NATURES);
  out.position = behind(out.position, store.PARTY_ROLES);
  out.status = behind(out.status, ["Open", "In Progress", "Pending", "Completed", "Closed"]);
  return out;
}

/* WHICH CITY A COURT SITS IN, read out of the court names themselves.
   "Civil Court, Lahore" and "Lahore High Court" both name their city; asking
   the lawyer to retype it is exactly the duplicated typing this module exists
   to remove. A court whose name matches two cities is left alone rather than
   guessed. */
async function courtCityMap(registers) {
  const CITY = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan",
    "Peshawar", "Quetta", "Gujranwala", "Sialkot", "Hyderabad", "Bahawalpur", "Sargodha",
    "Sahiwal", "Sukkur", "Abbottabad", "Mardan", "Gujrat", "Sheikhupura", "Okara"];
  const map = {};
  const seen = new Set();
  const consider = (name) => {
    const n = clean(name, 160);
    if (!n || seen.has(canon(n))) return;
    seen.add(canon(n));
    const hits = CITY.filter((c) => new RegExp("\\b" + c + "\\b", "i").test(n));
    if (hits.length === 1) map[n] = hits[0];      // unambiguous only
  };
  try { for (const r of await registers.get("litigation")) consider(r.court); } catch (e) { /* not built */ }
  for (const c of store.list()) consider(c.court && c.court.name);
  return map;
}

/* ------------------------------------------------------------- handle ---- */

async function handle(ctx) {
  const { req, res, route, json, readBody, who, me, registers, level } = ctx;
  const mayWrite = level === "edit" || level === "full";
  const deny = () => json(res, 403, { error: "forbidden", detail: "Raising or changing a case needs edit access to Litigation." }, req);

  /* ---- vocabularies and suggestions, for the wizard ---- */
  if (route === "litigation/meta" && req.method === "GET") {
    /* EVERY MENU COMES FROM ONE SERVICE. When this route answered 404 the
       wizard rendered "0 entities in the register" beside a register holding
       37 of them, so the response now carries a STATUS per list and the client
       is required to tell loading, empty and failed apart. */
    const opts = require("./litigation-options");
    let payload;
    try {
      payload = await opts.optionsFor({ registers, level, mayWrite });
    } catch (e) {
      return json(res, 503, {
        ok: false, error: "options_unavailable",
        detail: "The litigation option lists could not be built: " + String((e && e.message) || e).slice(0, 200),
      }, req);
    }
    const names = (k) => (payload.lists[k] ? payload.lists[k].options.map((o) => (typeof o === "string" ? o : o.name)) : []);
    return json(res, 200, Object.assign({
      ok: true,
      lists: payload.lists,
      registerStatus: payload.registerStatus,
      canCreate: mayWrite,
      /* Back-compatible flat arrays. Existing callers (the case edit panel, the
         assistant) keep working while the wizard moves to `lists`. */
      caseTypes: store.CASE_TYPES, natures: names("categories"), directions: store.DIRECTIONS,
      partyRoles: names("positions"), risks: store.RISKS, deadlineKinds: store.DEADLINE_KINDS,
      motionTypes: store.MOTION_TYPES, motionOutcomes: store.MOTION_OUTCOMES,
      workflow: store.WORKFLOW, modules: store.MODULES,
      priorities: store.PRIORITIES, partyKinds: store.PARTY_KINDS,
      currencies: store.CURRENCIES, documentTypes: store.DOCUMENT_TYPES,
      hearingPurposes: store.HEARING_PURPOSES, hearingOutcomes: store.HEARING_OUTCOMES,
      closureOutcomes: store.CLOSURE_OUTCOMES, statuses: store.STATUSES,
      askRecipients: store.ASK_RECIPIENTS,
      /* Court -> city and court -> jurisdiction, derived from the court names
         the estate actually uses, so picking a forum fills in what that forum
         already tells us. */
      courtCity: (payload.lists.courts ? payload.lists.courts.options : []).reduce((m, c) => {
        if (c.city) m[c.name] = c.city; return m;
      }, {}),
      courtMeta: (payload.lists.courts ? payload.lists.courts.options : []).reduce((m, c) => {
        m[c.name] = { city: c.city || "", jurisdiction: c.jurisdiction || "", courtType: c.courtType || "" }; return m;
      }, {}),
      /* The benchmark family for each category, DERIVED here so the wizard can
         show how a case will be grouped without asking a second question. */
      families: (payload.lists.categories ? payload.lists.categories.options : []).reduce((m, c) => {
        m[c.name] = opts.familyOf(c.name); return m;
      }, {}),
      suggest: {
        court: names("courts"), nature: names("categories"), entity: names("entities"),
        counsel: names("counsel"), position: names("positions"), city: names("cities"),
        jurisdiction: names("jurisdictions"), status: store.STATUSES,
      },
    }), req);
  }

  /* ---- the weekly report -------------------------------------------------
     Assembled from the records for a date range. Nothing in it is inferred:
     every line traces to a case, a hearing or an invoice already on file, and
     a lawyer edits it before it is anything but a draft. */
  if (route === "litigation/report" && req.method === "GET") {
    const report = require("./litigation-report.js");
    const u = new URL(req.url, "http://x");
    const all = store.listAll ? store.listAll() : [];
    const native = Array.isArray(all) ? all : (all.cases || []);
    const st = await registers.ensure();
    const regRows = (st.registers && st.registers.litigation) || [];
    /* Both populations: the cases raised in LegalOS carry hearings and
       invoices, the imported rows carry the dates. A report over one of them
       is a report about half the estate. */
    const byId = new Map(regRows.map((r) => [r.id, r]));
    for (const c of native) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c });
    const built = report.build([...byId.values()], {
      from: u.searchParams.get("from"), to: u.searchParams.get("to"),
    });
    return json(res, 200, { ...built, draft: report.draft(built) }, req);
  }

  /* ---- legal spend -------------------------------------------------------
     Case invoices and firm retainers, reported per currency and never added
     across them. */
  if (route === "litigation/spend" && req.method === "GET") {
    const spend = require("./litigation-spend.js");
    const u = new URL(req.url, "http://x");
    const q = (k) => u.searchParams.get(k) || null;
    const all = store.listAll ? store.listAll() : [];
    const cases = Array.isArray(all) ? all : (all.cases || []);
    return json(res, 200, spend.analytics(cases, {
      from: q("from"), to: q("to"), entity: q("entity"), counsel: q("counsel"),
      caseId: q("case"), nature: q("nature"), status: q("status"),
    }), req);
  }

  if (route === "litigation/retainers") {
    const spend = require("./litigation-spend.js");
    if (req.method === "GET") return json(res, 200, { retainers: spend.listRetainers() }, req);
    if (req.method === "POST") {
      if (!mayWrite) return deny();
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = spend.addRetainer(body || {}, who);
      return json(res, r.error ? 400 : 201, r, req);
    }
  }

  /* ---- what is due, and raising it ---------------------------------------
     Derived from the cases every time. GET reports; POST raises the in-app
     notifications (idempotent, so it can be called freely). */
  if (route === "litigation/reminders" && (req.method === "GET" || req.method === "POST")) {
    const reminders = require("./litigation-reminders.js");
    const st = await registers.ensure();
    const rows = (st.registers && st.registers.litigation) || [];
    if (req.method === "GET") return json(res, 200, reminders.due(rows), req);
    if (!mayWrite) return deny();
    return json(res, 200, reminders.raise(rows, who.email), req);
  }

  /* ---- the cause list ----------------------------------------------------
     Derived live from the next-hearing date on every case, never stored. A
     copied cause-list dataset starts disagreeing with the cases the first time
     a date moves, and then nobody knows which one to turn up for. */
  if (route === "litigation/cause-list" && req.method === "GET") {
    const causeList = require("./cause-list.js");
    const st = await registers.ensure();
    const rows = (st.registers && st.registers.litigation) || [];
    return json(res, 200, causeList.build(rows), req);
  }

  /* ---- records Legal raises in a tracker-backed module -------------------
     The workbook stays the workbook; these live in LegalOS and are merged into
     the register carrying origin LEGALOS, so a reader can always tell which
     rows came from Drive and which were raised here. */
  {
    const mr = route.match(/^litigation\/module\/([a-zA-Z]+)\/records(?:\/([A-Za-z0-9-]+))?(?:\/([a-z]+))?$/);
    if (mr) {
      const records = require("./module-records.js");
      const [, moduleKey, recId, action] = mr;
      if (req.method === "GET") {
        const u = new URL(req.url, "http://x");
        return json(res, 200, { records: records.list(moduleKey,
          { withDeleted: u.searchParams.get("deleted") === "1" }) }, req);
      }
      if (!mayWrite) return deny();
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const b = body || {};
      if (req.method === "POST" && !recId) {
        const r = records.create(moduleKey, b.fields || b, me);
        return json(res, 201, r, req);
      }
      if (req.method === "PATCH" && recId) {
        const r = records.update(recId, b.fields || b, me);
        return json(res, r.error ? 404 : 200, r, req);
      }
      if (req.method === "POST" && recId && action === "restore") {
        const r = records.restore(recId, me);
        return json(res, r.error ? 400 : 200, r, req);
      }
      /* YOUR OWN MISTAKE IS YOURS TO UNDO; EVERYTHING ELSE GOES TO THE HEAD.
         This refused every DELETE outright, so a person who mistyped a police
         complaint thirty seconds earlier had to ask the head of Litigation to
         approve removing it. That is the right rule for somebody else's record,
         or for one that has moved on — it is ceremony for a draft you raised
         and nobody has touched.

         So: the author may remove their OWN record while it is still at an
         opening stage, and it is a soft delete — `deletedAt`, who removed it
         and why are written onto the record, it leaves the active register,
         and `restore` brings it back whole. Anything else still answers 409
         and still names the approval route. The decision is made here, on the
         server, from the stored record — never from what the browser claims. */
      if (req.method === "DELETE" && recId) {
        /* The body was already read above, for every method in this block. A
           second readBody() waits on a stream that has already ended, so the
           request simply hung — the dialog sat on "Working…" for ever and no
           error was ever raised, which is the worst shape a failure can take. */
        const reason = String((b && b.reason) || "").trim();
        const rec = records.get ? records.get(recId) : null;
        if (!rec) return json(res, 404, { error: "not found" }, req);

        const owner = rec.createdBy || {};
        const mine = (owner.id && me && owner.id === me.id)
          || (owner.email && me && me.email && String(owner.email).toLowerCase() === String(me.email).toLowerCase());
        const stage = String((rec.fields && (rec.fields.__stage || rec.fields.status)) || "").trim();
        const OPENING = /^(|draft|new|raised|open|pending|complaint raised|inspection scheduled|scheduled|conducted|filed)$/i;
        const early = OPENING.test(stage);

        if (!mine) {
          return json(res, 409, { error: "approval_required",
            detail: "This record was raised by someone else. It leaves the register only when the head of its team approves — raise a deletion request at POST /api/deletions." }, req);
        }
        if (!early) {
          return json(res, 409, { error: "approval_required",
            detail: "This record has moved to \"" + stage + "\". Past the opening stage it leaves the register only when the head of its team approves — raise a deletion request at POST /api/deletions." }, req);
        }
        if (!reason) {
          return json(res, 400, { error: "invalid", errors: ["a reason is required"] }, req);
        }
        const r = records.remove(recId, reason, me);
        /* The register is rebuilt from the store on the next read, so the row
           is gone the moment the page refetches — no rebuild call needed. */
        return json(res, r.error ? 400 : 200, r, req);
      }
    }
  }

  /* ---- the root ledger ---------------------------------------------------
     Every item in the litigation Drive root, resolved to a source family, the
     record it became and the screen it can be reached on. Technical: it lives
     in Data Health, not on an operational screen. */
  if (route === "litigation/ledger" && req.method === "GET") {
    const ledger = require("./litigation-ledger.js");
    return json(res, 200, await ledger.build(registers), req);
  }

  /* ---- asset recovery, from the workbook in Drive ------------------------ */
  if (route === "litigation/asset-recovery" && req.method === "GET") {
    const ar = require("./asset-recovery.js");
    try {
      const u = new URL(req.url, "http://x");
      return json(res, 200, await ar.get({ force: u.searchParams.get("refresh") === "1" }), req);
    } catch (e) {
      return json(res, e.code === "NO_WORKBOOK" ? 404 : 500,
        { error: e.code === "NO_WORKBOOK" ? "no_workbook" : "read_failed", detail: e.message }, req);
    }
  }

  /* ---- the IP portfolio, from the trademark tracker in Drive ------------ */
  if (route === "litigation/ip-portfolio" && req.method === "GET") {
    const ip = require("./ip-portfolio.js");
    try {
      const u = new URL(req.url, "http://x");
      return json(res, 200, await ip.get({ force: u.searchParams.get("refresh") === "1" }), req);
    } catch (e) {
      return json(res, e.code === "NO_TRACKER" ? 404 : 500,
        { error: e.code === "NO_TRACKER" ? "no_tracker" : "read_failed", detail: e.message }, req);
    }
  }

  /* ---- developer disputes, from the tracker in Drive --------------------
     Its own route because it is its own module with its own shape: the
     workbook holds legal matters AND project health as two tables, and the
     case model has nothing to say about "% sold" or "rental status". */
  if (route === "litigation/developer-disputes" && req.method === "GET") {
    const dd = require("./developer-disputes.js");
    try {
      const url = new URL(req.url, "http://x");
      const data = await dd.get({ force: url.searchParams.get("refresh") === "1" });
      return json(res, 200, data, req);
    } catch (e) {
      return json(res, e.code === "NO_TRACKER" ? 404 : 500, {
        error: e.code === "NO_TRACKER" ? "no_tracker" : "read_failed",
        detail: e.message,
      }, req);
    }
  }

  /* ---- read a court document and report what it says ---- */
  if (route === "litigation/extract" && req.method === "POST") {
    if (!mayWrite) return deny();
    const name = clean(req.headers["x-filename"] || "document", 200);
    let buf;
    try { buf = await readRaw(req, MAX_UPLOAD); } catch (e) { return json(res, 413, { error: e.message }, req); }
    if (!buf || !buf.length) return json(res, 400, { error: "no file received" }, req);
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    /* Content-addressed, so uploading the same document twice is one stored
       file and one document on the case rather than two. */
    const uploadId = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
    const ext = (name.match(/\.[A-Za-z0-9]{2,5}$/) || [""])[0].toLowerCase();
    const dest = path.join(UPLOAD_DIR, uploadId + ext);
    try { if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf); } catch (e) { return json(res, 500, { error: "the upload could not be stored" }, req); }
    let result;
    try { result = await extract.extractFromFile(dest, name); }
    catch (e) { result = { ok: false, error: String(e.message || e).slice(0, 200), fields: {}, parties: [], warnings: [] }; }
    return json(res, 200, Object.assign({ uploadId, name, bytes: buf.length }, result), req);
  }

  /* ---- what LegalOS already knows about a source record ---- */
  if (route === "litigation/prefill" && req.method === "GET") {
    const u = new URL(req.url, "http://x");
    const from = clean(u.searchParams.get("from"), 20);
    const id = clean(u.searchParams.get("id"), 120);
    if (!from || !id) return json(res, 400, { error: "from and id are required" }, req);
    return json(res, 200, await prefill(from, id, registers), req);
  }

  /* ---- would this be a duplicate? ---- */
  if (route === "litigation/duplicates" && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    let tracker = [];
    try { tracker = await registers.get("litigation"); } catch (e) { tracker = []; }
    return json(res, 200, { duplicates: store.findPossibleDuplicates(body || {}, tracker) }, req);
  }

  /* ---- drafts: an intake half-done must survive leaving the page ---- */
  if (route === "litigation/drafts") {
    if (req.method === "GET") return json(res, 200, { drafts: store.listDrafts(who && who.email) }, req);
    if (req.method === "POST") {
      if (!mayWrite) return deny();
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = store.saveDraft(body, who, me);
      return json(res, r.error ? 400 : 200, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }
  const dm = route.match(/^litigation\/drafts\/([A-Za-z0-9\-]+)$/);
  if (dm && req.method === "DELETE") {
    if (!mayWrite) return deny();
    const r = store.deleteDraft(dm[1]);
    return json(res, r.error ? 404 : 200, r, req);
  }

  /* ---- export ----
     Structured fields only. Internal notes are privileged and are NOT exported:
     a spreadsheet leaving the building with legal strategy in it is a different
     kind of incident from a spreadsheet with a hearing date in it. */
  if (route === "litigation/export" && req.method === "GET") {
    const u = new URL(req.url, "http://x");
    const q = clean(u.searchParams.get("q"), 120).toLowerCase();
    const wantStatus = clean(u.searchParams.get("status"), 40);
    const wantRisk = clean(u.searchParams.get("risk"), 40);

    let rows = [];
    try { rows = await registers.get("litigation"); } catch (e) { rows = []; }
    rows = rows.filter((r) => {
      if (wantStatus && String(r.status || "") !== wantStatus) return false;
      if (wantRisk && String(r.risk || "") !== wantRisk) return false;
      if (q && !JSON.stringify(r).toLowerCase().includes(q)) return false;
      return true;
    });

    const COLS = [
      ["Case ID", (r) => r.id],
      ["Court case number", (r) => r.caseNo || ""],
      ["Title", (r) => r.caseName || ""],
      ["Type", (r) => r.caseType || ""],
      ["Nature", (r) => r.nature || ""],
      ["Status", (r) => r.status || ""],
      ["Stage", (r) => r.stage || ""],
      ["Risk", (r) => r.risk || ""],
      ["Priority", (r) => r.priority || ""],
      ["Entity", (r) => r.entity || ""],
      ["Court", (r) => r.court || ""],
      ["City", (r) => r.city || ""],
      ["Counsel", (r) => r.counsel || ""],
      ["Filed", (r) => r.filingDate || ""],
      ["Next hearing", (r) => r.nextHearing || ""],
      ["Exposure (PKR)", (r) => r.exposurePKR === "" ? "" : r.exposurePKR],
      ["Exposure (USD)", (r) => r.exposureUSD === "" ? "" : r.exposureUSD],
      ["Recoverable (PKR)", (r) => r.recoverablePKR === "" ? "" : r.recoverablePKR],
      ["Recoverable (USD)", (r) => r.recoverableUSD === "" ? "" : r.recoverableUSD],
      ["Source", (r) => (r.__origin === "LEGALOS" ? "Raised in LegalOS" : "Imported from tracker")],
      /* A count, not the names: a document a reader may not open must not have
         its filename disclosed by an export. */
      ["Documents", (r) => (r.driveFiles || []).length],
    ];
    const esc = (v) => {
      const t = String(v == null ? "" : v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const csv = [COLS.map((c) => esc(c[0])).join(",")]
      .concat(rows.map((r) => COLS.map((c) => esc(c[1](r))).join(",")))
      .join("\r\n");
    const body = Buffer.from("\ufeff" + csv, "utf8");   // BOM so Excel reads UTF-8
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="litigation-cases.csv"',
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    return res.end(body);
  }

  /* ---- assistant ----
     The assistant PREPARES an action and hands it back for confirmation. It
     does not create, alter or close anything itself: the client confirms and
     then calls the ordinary endpoints above, which are the same domain services
     the UI uses. There is no assistant-only path into the data, and no
     natural-language sentence can mutate a case on its own. */
  if (route === "litigation/assistant" && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const b = body || {};
    const intent = clean(b.intent, 40);
    const ctx = b.context || {};

    if (intent === "raise-from") {
      if (!mayWrite) return deny();
      const pre = await prefill(clean(ctx.type, 20), clean(ctx.id, 120), registers);
      const proposed = {};
      const needs = [];
      for (const [k, v] of Object.entries(pre.fields || {})) {
        if (String(v.confidence || "").toLowerCase() === "high") proposed[k] = v.value;
      }
      for (const k of ["title", "entity"]) if (!proposed[k]) needs.push(k);
      if (!proposed.nature) needs.push("case category");
      return json(res, 200, {
        action: "createCase",
        endpoint: "POST /api/litigation/cases",
        /* Prepared, not performed. */
        requiresConfirmation: true,
        proposed: Object.assign({ moduleKey: "cases", links: pre.links }, proposed),
        parties: pre.parties, documents: pre.documents,
        missing: needs, warnings: pre.warnings,
        summary: "Prepared a case from " + clean(ctx.type, 20) + " " + clean(ctx.id, 60)
          + ". " + Object.keys(proposed).length + " field(s) filled from that record"
          + (needs.length ? "; still needs " + needs.join(", ") : "") + ".",
      }, req);
    }

    if (intent === "missing") {
      const c = store.get(clean(ctx.caseId, 40));
      if (!c) return json(res, 404, { error: "not found" }, req);
      const missing = [];
      if (!c.court || !c.court.name) missing.push("court");
      if (!c.courtCaseNumber) missing.push("court case number");
      if (!(c.parties || []).length) missing.push("parties");
      if (!c.risk) missing.push("risk");
      if (!c.nature) missing.push("case category");
      if (!(c.ownership && c.ownership.owner)) missing.push("owner");
      return json(res, 200, {
        action: "report", requiresConfirmation: false, caseId: c.id,
        missing, dataQuality: c.dataQuality,
        summary: missing.length ? "Still missing: " + missing.join(", ") + "." : "Nothing essential is missing.",
      }, req);
    }

    if (intent === "deadlines") {
      const soon = [];
      const horizon = Date.now() + 30 * 86400000;
      for (const c of store.list()) {
        for (const d of (c.deadlines || [])) {
          if (d.done || !d.dueDate) continue;
          const t = new Date(d.dueDate).getTime();
          if (!isNaN(t) && t <= horizon) soon.push({ caseId: c.id, title: c.title, kind: d.kind, dueDate: d.dueDate });
        }
      }
      soon.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return json(res, 200, {
        action: "report", requiresConfirmation: false, deadlines: soon,
        summary: soon.length ? soon.length + " deadline(s) in the next 30 days." : "No deadlines in the next 30 days.",
      }, req);
    }

    if (intent === "add-hearing") {
      if (!mayWrite) return deny();
      const c = store.get(clean(ctx.caseId, 40));
      if (!c) return json(res, 404, { error: "not found" }, req);
      return json(res, 200, {
        action: "addHearing",
        endpoint: "POST /api/litigation/cases/" + c.id + "/hearings",
        requiresConfirmation: true,
        proposed: { date: clean(ctx.date, 40), purpose: clean(ctx.purpose, 200), court: (c.court && c.court.name) || "" },
        summary: "Prepared a hearing for " + c.id + ". Confirm to record it.",
      }, req);
    }

    return json(res, 400, { error: "unknown intent", known: ["raise-from", "missing", "deadlines", "add-hearing"] }, req);
  }

  /* ---- the cases themselves ---- */
  if (route === "litigation/cases") {
    if (req.method === "GET") return json(res, 200, { cases: store.list(), count: store.count() }, req);
    if (req.method === "POST") {
      if (!mayWrite) return deny();
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      let tracker = [];
      try { tracker = await registers.get("litigation"); } catch (e) { tracker = []; }
      const r = store.createCase(body || {}, who, me, {
        allowDuplicate: !!(body && body.allowDuplicate),
        duplicateNote: body && body.duplicateNote,
        trackerRows: tracker,
      });
      if (r.error === "possible_duplicate") return json(res, 409, r, req);
      if (r.error) return json(res, 400, r, req);
      if (body && body.draftId) store.deleteDraft(body.draftId);
      /* Merge it into the register being served right now. A full rebuild is
         not used: rebuild() returns early when a build is already running, so a
         case raised during a refresh would save and then be missing from the
         register its author is looking at. */
      try { await registers.refreshLocalLitigationCases(); } catch (e) { /* saved either way */ }
      return json(res, 201, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  /* ---- THE DECISION ON A CASE.
     Separate from `close` because `close` only works on a case that lives in
     the case store, and 357 of the 358 cases on this register come from the
     Drive trackers and are read-only. The decision is recorded as an overlay
     keyed by case id — the tracker row is untouched — and it is the ONLY thing
     in the product that makes a case report as won. Nothing is inferred.

     For a case that IS in the store the same call also closes it there, so a
     lawyer has one action and the two representations cannot disagree. ---- */
  const decm = route.match(/^litigation\/cases\/([A-Za-z0-9\-]+)\/decision$/);
  if (decm) {
    const outcomes = require("./case-outcomes.js");
    if (req.method === "GET") return json(res, 200, { decision: outcomes.get(decm[1]) }, req);
    if (req.method === "POST") {
      if (!mayWrite) return deny();
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = outcomes.record(decm[1], body || {}, who, me);
      if (r.error) return json(res, 400, r, req);
      /* A case the store owns is closed there too, with the same words, so the
         case page and the register tell one story. A tracker case has no store
         row and the overlay is the whole record. */
      if (store.get(decm[1])) {
        const CODE_TO_CLOSURE = { "Successful / Won": "Won", "Adverse / Lost": "Lost", "Settled": "Settled",
          "Withdrawn": "Withdrawn", "Dismissed": "Dismissed", "Partial / Other": "Other" };
        const closure = CODE_TO_CLOSURE[(body || {}).outcomeCode];
        if (closure) {
          try { store.closeCase(decm[1], { outcome: closure, decisionDate: (body || {}).decisionDate,
            outcomeSummary: (body || {}).summary, notes: (body || {}).notes }, who, me); } catch (e) {}
        }
      }
      try { await registers.refreshLocalLitigationCases(); } catch (e) {}
      return json(res, 201, r, req);
    }
    if (req.method === "DELETE") {
      if (!mayWrite) return deny();
      const r = outcomes.clear(decm[1], who, me);
      if (!r.error) { try { await registers.refreshLocalLitigationCases(); } catch (e) {} }
      return json(res, r.error ? 404 : 200, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  const cm = route.match(/^litigation\/cases\/([A-Za-z0-9\-]+)$/);
  if (cm) {
    const rec = store.get(cm[1]);
    if (!rec || rec.draft) return json(res, 404, { error: "not found" }, req);
    if (req.method === "GET") return json(res, 200, { case: rec }, req);
    if (req.method === "PATCH" || req.method === "POST") {
      if (!mayWrite) return deny();
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
      const r = store.patchCase(cm[1], body || {}, who, me);
      if (!r.error) { try { await registers.refreshLocalLitigationCases(); } catch (e) {} }
      return json(res, r.error ? (r.error === "not found" ? 404 : 400) : 200, r, req);
    }
    return json(res, 405, { error: "method not allowed" }, req);
  }

  const em = route.match(/^litigation\/cases\/([A-Za-z0-9\-]+)\/events$/);
  if (em && req.method === "POST") {
    if (!mayWrite) return deny();
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const r = store.addEvent(em[1], body || {}, who, me);
    if (!r.error) { try { await registers.refreshLocalLitigationCases(); } catch (e) {} }
    return json(res, r.error ? (r.error === "not found" ? 404 : 400) : 201, r, req);
  }

  /* ---- operational mutations: hearings, deadlines, parties, counsel,
         documents and the two-way information thread. Each one is a domain
         service; the route only authorises, parses and reports. ---- */
  const op = route.match(/^litigation\/cases\/([A-Za-z0-9\-]+)\/([a-z\-]+)$/);
  if (op && req.method === "POST" && !["close", "events"].includes(op[2])) {
    if (!mayWrite) return deny();
    const [, caseId, what] = op;
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const b = body || {};
    let r;
    switch (what) {
      case "hearings": r = store.addHearing(caseId, b, who, me); break;
      case "deadlines": r = store.addDeadline(caseId, b, who, me); break;
      case "parties": r = store.addParty(caseId, b, who, me); break;
      case "counsel": r = store.assignCounsel(caseId, b, who, me); break;
      case "documents": r = store.attachDocument(caseId, b.documents || b, who, me); break;
      case "invoices": r = store.addInvoice(caseId, b, who, me); break;
      case "ask": r = store.requestInformation(caseId, b, who, me); break;
      case "notes": r = store.addInternalNote(caseId, b, who, me); break;
      case "reopen": r = store.reopenCase(caseId, b, who, me); break;
      /* DELETION IS NOT AN ACTION ANYONE TAKES HERE.
         A case leaves the active register only once the head of Litigation &
         Disputes has approved a deletion request. This endpoint stays so the
         refusal is explicit -- removing it would 404 and read as a bug -- and
         so the approval cannot be skipped by calling the API directly.
         The approved delete runs in api/deletion-approvals.js, in process,
         against the same store function. */
      case "delete":
        return json(res, 409, {
          error: "approval_required",
          detail: "A case leaves the register only when the head of its team approves. Raise a deletion request at POST /api/deletions.",
        }, req);
      case "restore": r = store.restoreCase(caseId, who, me); break;
      case "remove-party": r = store.removeParty(caseId, b.name, b.role, who, me); break;
      default: return json(res, 404, { error: "unknown case action", action: what }, req);
    }
    if (!r.error) { try { await registers.refreshLocalLitigationCases(); } catch (e) {} }
    return json(res, r.error ? (r.error === "not found" ? 404 : 400) : 201, r, req);
  }

  /* Completing a scheduled hearing, or a deadline, rather than adding another. */
  const sub = route.match(/^litigation\/cases\/([A-Za-z0-9\-]+)\/(hearings|deadlines|ask)\/([A-Za-z0-9\-]+)$/);
  if (sub && (req.method === "POST" || req.method === "PATCH")) {
    if (!mayWrite) return deny();
    const [, caseId, kind, subId] = sub;
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const r = kind === "hearings" ? store.updateHearing(caseId, subId, body || {}, who, me)
      : kind === "deadlines" ? store.completeDeadline(caseId, subId, body || {}, who, me)
        : store.respondInformation(caseId, subId, body || {}, who, me);
    if (!r.error) { try { await registers.refreshLocalLitigationCases(); } catch (e) {} }
    return json(res, r.error ? (r.error === "not found" ? 404 : 400) : 200, r, req);
  }

  /* Cases that point back at a source record, so a contract, notice or request
     can show its litigation without keeping its own copy of the link. */
  if (route === "litigation/by-source" && req.method === "GET") {
    const u = new URL(req.url, "http://x");
    const type = clean(u.searchParams.get("type"), 20);
    const id = clean(u.searchParams.get("id"), 120);
    const key = { notice: "noticeId", contract: "contractId", request: "requestId", project: "projectId", entity: "entityId" }[type];
    if (!key || !id) return json(res, 400, { error: "type and id are required" }, req);
    const hits = store.list().filter((c) => c.links && c.links[key] === id)
      .map((c) => ({ id: c.id, title: c.title, status: c.status, stage: c.stage, risk: c.risk, nextHearing: c.dates && c.dates.nextHearing }));
    return json(res, 200, { cases: hits, count: hits.length }, req);
  }

  const km = route.match(/^litigation\/cases\/([A-Za-z0-9\-]+)\/close$/);
  if (km && req.method === "POST") {
    if (!mayWrite) return deny();
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const r = store.closeCase(km[1], body || {}, who, me);
    if (!r.error) { try { await registers.refreshLocalLitigationCases(); } catch (e) {} }
    return json(res, r.error ? (r.error === "not found" ? 404 : 400) : 200, r, req);
  }

  /* An uploaded document, streamed back so the Documents tab can show it. */
  const um = route.match(/^litigation\/upload\/([a-f0-9]{6,32})(\.[A-Za-z0-9]{2,5})?$/);
  if (um && req.method === "GET") {
    const base = um[1] + (um[2] || "");
    let file = path.join(UPLOAD_DIR, base);
    if (!fs.existsSync(file)) {
      const found = (fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []).find((f) => f.startsWith(um[1]));
      if (!found) return json(res, 404, { error: "not found" }, req);
      file = path.join(UPLOAD_DIR, found);
    }
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".pdf" ? "application/pdf"
      : ext === ".png" ? "image/png" : /\.jpe?g$/.test(ext) ? "image/jpeg"
        : ext === ".txt" ? "text/plain; charset=utf-8" : "application/octet-stream";
    res.writeHead(200, { "content-type": type, "content-disposition": "inline", "cache-control": "private, max-age=300" });
    return fs.createReadStream(file).pipe(res);
  }

  return json(res, 404, { error: "unknown litigation route", route }, req);
}

module.exports = { handle, prefill, UPLOAD_DIR };
