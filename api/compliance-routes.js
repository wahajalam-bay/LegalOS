// HTTP surface for the Compliance workspace.
//
// Every handler here takes the caller's EFFECTIVE compliance level, computed by
// api/permissions.js from the verified session, and passes it to the workflow
// engine, which refuses anything the level does not grant. The browser is never
// asked what the user may do; it is only told, so it can hide controls that
// would fail anyway.

const registers = require("./registers");
const model = require("./compliance-model");
const workflow = require("./workflow");
const secp = require("./secp");
const overrides = require("./compliance-overrides");
const entities = require("./entities");
const docgen = require("./docgen");
const drive = require("./drive");
const sources = require("./compliance-sources");

/* ------------------------------------------------------------------ helpers */

const fail = (res, json, req, e) => {
  const code = e && e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
  return json(res, code, {
    error: (e && e.message) || "error",
    detail: (e && e.detail) || "Something went wrong and nothing was changed.",
    ...(e && e.capability ? { capability: e.capability } : {}),
  }, req);
};

// Attach the LegalOS-native children and balance to a source-derived loan.
function hydrateLoan(loan) {
  const children = workflow.childrenOf(loan.id);
  const balance = workflow.outstandingFor(loan);
  // LegalOS actions join the source history in ONE chronological timeline, each
  // tagged with where it came from, so a 2019 spreadsheet row and a 2026 native
  // amendment sit in the same story without pretending to be the same kind of
  // thing (PART 55).
  const nativeEvents = children.map((c) => ({
    id: c.id,
    kind: c.type === "repayment" ? "repayment" : (c.subtype || "action"),
    label: (c.type === "repayment"
      ? (c.fields.repaymentType === "full" ? "Full repayment" : "Partial repayment")
      : (c.subtype || "action").replace(/^\w/, (m) => m.toUpperCase())) + " - " + workflow.STATUS_LABEL[c.status],
    date: c.fields.effectiveDate || c.fields.repaymentDate || c.createdAt.slice(0, 10),
    note: c.fields.reason || c.fields.notes || null,
    amount: c.fields.amount != null ? c.fields.amount : null,
    currency: c.fields.currency || null,
    status: c.status,
    recordId: c.id,
    documents: (c.documents || []).length,
    origin: "legalos",
  }));

  return {
    ...loan,
    balance,
    children: children.map(slimRecord),
    timeline: [...loan.events, ...nativeEvents].sort((a, b) =>
      String(a.date || "9999").localeCompare(String(b.date || "9999"))),
  };
}

// The shape a record takes in a list: enough to render a row, not the full
// document set.
function slimRecord(r) {
  return {
    id: r.id, type: r.type, subtype: r.subtype, status: r.status,
    statusLabel: workflow.STATUS_LABEL[r.status] || r.status,
    parent: r.parent, entity: r.entity, entityKey: r.entityKey,
    fields: r.fields,
    documents: (r.documents || []).length,
    signature: workflow.signatureState(r),
    signatureMethod: r.signature ? r.signature.method : null,
    drive: r.drive,
    createdAt: r.createdAt, createdBy: r.createdBy, updatedAt: r.updatedAt,
    review: r.review,
    template: r.template,
    origin: "legalos",
  };
}

function fullRecord(r) {
  return {
    ...slimRecord(r),
    documents: r.documents || [],
    signatories: (r.signature && r.signature.signatories) || [],
    audit: workflow.auditFor(r.id),
  };
}

/* ---------------------------------------------- caller-aware documents ----
   WHAT WENT WRONG HERE
   These routes returned every linked document's NAME, TYPE and DRIVE PATH to
   whoever asked, and counted documents by what was LINKED rather than by what
   the caller may open. Streaming a file was correctly refused, so nothing
   could be read -- but before the Spend sharing policy a Compliance user could
   see the names of 199 lease documents they had no access to, and every
   "Documents (n)" badge counted files they could not open.

   A filename is not harmless: "Settlement agreement — Zameen Media and Arbab"
   discloses the existence of a settlement to a team with no right to know of
   it. So documents are filtered through the SAME authorization function the
   file endpoint uses, and counts are derived from what survives.

   `documentsRestricted` is a BOOLEAN on purpose. It lets the screen say "no
   documents you can access" rather than "no documents", which are different
   facts a lawyer needs told apart -- without disclosing how many are hidden or
   what they are. Administrators get the numbers; ordinary callers get the
   boolean. */
function documentGate(me) {
  let groups = {};
  let isAdmin = !!me.admin;
  try {
    const eff = require("./permissions").effectiveFor({ id: me.id, rbac: me.rbac, legalTeam: me.legalTeam, admin: me.admin });
    groups = (eff && eff.groups) || {};
    isAdmin = isAdmin || groups.admin === "full";
  } catch (e) { groups = {}; }

  const drive = require("./drive");
  const docScope = require("./document-scope");
  let index = null;
  const fileOf = (d) => {
    if (!index) { index = new Map(); try { for (const f of drive.indexFiles()) index.set(f.id, f); } catch (e) { /* empty */ } }
    return index.get(d.id) || d;
  };
  let isRecordDocument = () => true;
  try { isRecordDocument = require("./compliance-model").isRecordDocument; } catch (e) { /* default */ }
  const visible = (d) => {
    if (!d || !d.id) return false;
    /* The source spreadsheet a record was read from is not one of its
       documents, whoever is asking. */
    if (!isRecordDocument(d)) return false;
    try { return docScope.canAccessDocument(d.id, fileOf(d), groups, isAdmin).allow; }
    catch (e) { return false; }
  };

  /* ONE INSTRUMENT, ONE ROW.
     The same signed lease is filed in two folders, and the same board minute
     is kept under both a subsidiary and its parent. Rendered literally that
     put 82 identical rows in front of Legal across 41 records -- the same
     document, twice, with nothing to say which to open.

     Identical copies are collapsed into ONE logical document carrying its
     physical copies. Nothing is deleted and nothing is hidden: every Drive id
     and path travels with the row, so provenance is one click away.

     TWO RULES THIS KEEPS
       - Grouping happens AFTER the permission filter, never before, so a copy
         the caller may not open cannot become the one they are shown, and can
         never contribute to their count.
       - Identity is name AND byte size. A draft and its executed version differ
         in bytes and stay two documents; collapsing them would hide a
         signature. */
  const identity = (f) => String(f.name || "").trim().toLowerCase() + "|" + (f.size || 0);

  return {
    isAdmin,
    filter(files) {
      const linked = Array.isArray(files) ? files : [];
      const allowed = linked.filter(visible);

      const groups = new Map();
      for (const f of allowed) {
        const k = identity(f);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(f);
      }
      const documents = [...groups.values()].map((copies) => {
        const canonical = copies[0];          // authorised by construction
        if (copies.length === 1) return canonical;
        return Object.assign({}, canonical, {
          physicalCopies: copies.length,
          sourceCopies: copies.map((c) => ({
            id: c.id, folderPath: c.folderPath || null, webViewLink: c.webViewLink || null,
          })),
        });
      });

      return {
        documents,
        /* The count a reader sees is the number of INSTRUMENTS, not the number
           of files on a disk. Physical copies are administrative detail. */
        documentCount: documents.length,
        physicalFileCount: allowed.length,
        documentsRestricted: linked.length > 0 && allowed.length === 0,
        ...(isAdmin ? { linkedCount: linked.length, withheldCount: linked.length - allowed.length } : {}),
      };
    },
  };
}

/* Apply the gate to one record, replacing its document arrays in place. */
function gateRecord(gate, rec) {
  if (!rec || typeof rec !== "object") return rec;
  /* SECP records carry their files on `documents`, every other family on
     `driveFiles`. Gating only the latter left statutory documents unfiltered
     and their counts at zero -- the filter silently did nothing on the one
     family with 3,367 files in it. */
  const primaryKey = Array.isArray(rec.driveFiles) ? "driveFiles"
    : (Array.isArray(rec.documents) ? "documents" : "driveFiles");
  const own = gate.filter(rec[primaryKey] || []);
  const extra = gate.filter(rec.extraDocuments || []);
  /* CONTESTED DOCUMENTS ARE STILL DOCUMENTS ON THE SCREEN.
     Two loans claim one Drive folder, so its 15 files are carried on both and
     shown on both. They were excluded from the count while being included in
     the list, so the badge read 4 and the tab rendered 19 -- the drift §42
     exists to prevent. They are counted, and they are permission-filtered like
     everything else: being contested is a statement about which record owns
     them, not about who may read them. */
  const contested = gate.filter(rec.contestedDocuments || []);
  const total = own.documentCount + extra.documentCount + contested.documentCount;
  const physical = own.physicalFileCount + extra.physicalFileCount + contested.physicalFileCount;
  const out = Object.assign({}, rec, {
    [primaryKey]: own.documents,
    documentCount: total,
    physicalFileCount: physical,
    duplicateSourceCopies: physical - total,
    documentsRestricted: (own.documentsRestricted || extra.documentsRestricted || contested.documentsRestricted)
      && total === 0,
  });
  if (rec.extraDocuments) out.extraDocuments = extra.documents;
  if (rec.contestedDocuments) out.contestedDocuments = contested.documents;

  /* THE STAGES ARE DOCUMENTS TOO.
     A SECP compliance year carries its files four more times over -- under
     financialStatements, agm, each annual form and each event filing -- and
     only the primary array was being gated. Two consequences, both visible on
     screen: a document the reader is not cleared for was still listed under
     its stage, and the same instrument filed in two source folders counted
     twice, so a year showing 8 logical documents opened a "Financial
     statements (2)" tab holding one document twice over. The stages go through
     the same gate, so they carry the same logical documents, with the physical
     copies kept as metadata on each. */
  const gateList = (list) => (Array.isArray(list) ? gate.filter(list).documents : list);
  if (rec.financialStatements) {
    out.financialStatements = { ...rec.financialStatements, documents: gateList(rec.financialStatements.documents) };
  }
  if (rec.agm) out.agm = { ...rec.agm, documents: gateList(rec.agm.documents) };
  if (Array.isArray(rec.forms)) {
    out.forms = rec.forms.map((f) => {
      const docs = gateList(f.documents);
      return { ...f, documents: docs,
        /* A form whose only copies the reader may not see is not "on file" TO
           THEM. Reporting it as available while showing nothing is how a status
           and its evidence come apart. */
        documentStatus: (docs && docs.length) ? f.documentStatus : "NO_SOURCE_DOCUMENT" };
    });
  }
  if (gate.isAdmin) {
    out.linkedDocumentCount = (rec[primaryKey] || []).length + (rec.extraDocuments || []).length + (rec.contestedDocuments || []).length;
    out.withheldDocumentCount = out.linkedDocumentCount - out.documentCount;
  }
  return out;
}

/* -------------------------------------------------------------------- main */

async function handle(req, res, route, query, ctx) {
  const { json, readBody, me, perm } = ctx;
  const sub = route.replace(/^compliance\/?/, "");

  /* ------------------------------------------------------------- config */

  if (sub === "config" && req.method === "GET") {
    const rules = model.rules();
    // Capabilities are returned so the UI can hide what would be refused. The
    // server still enforces every one of them.
    const caps = {};
    for (const c of Object.keys(workflow.CAPS)) caps[c] = workflow.can(perm, c);
    return json(res, 200, {
      level: perm,
      capabilities: caps,
      integrations: rules.integrations || {},
      secp: {
        forms: (rules.secp && rules.secp.forms) || [],
        overdueReasons: (rules.secp && rules.secp.overdueReasons) || [],
        filingStatuses: (rules.secp && rules.secp.filingStatuses) || [],
        portal: (rules.secp && rules.secp.portal) || null,
        // SECP moved filing from eServices/eZfile to LEAP. Both are served so
        // the register can still point at the portal a historical filing was
        // actually lodged through.
        portals: (rules.secp && rules.secp.portals) || [],
        financialYears: secp.financialYears(),
      },
      resolutions: rules.resolutions || {},
      licences: rules.licences || {},
      renewal: rules.renewal || {},
      workflowStatuses: workflow.STATUS_LABEL,
      signatureStatuses: workflow.SIG_STATUS,
      driveStates: workflow.DRIVE_STATES,
      /* Whether the drafter of a document may finalize it. The UI needs this to
         disable Finalize WITH THE REASON rather than offering a button that the
         server will refuse -- which is what left a resolution sitting in Legal
         review looking as though the workflow had broken. The server still
         enforces the rule; this only lets the screen say so in advance. */
      workflow: { segregationOfDuties: (rules.workflow || {}).segregationOfDuties !== false },
    }, req);
  }

  if (sub === "entities" && req.method === "GET") {
    return json(res, 200, { entities: await entities.list() }, req);
  }

  /* ------------------------------------------------- expiry reminders (§54)
     GET  reports what the estate currently owes somebody and WHO it is routed
          to, without raising anything.
     POST raises them. Idempotent — the notification id is (recipient, kind,
          record, date), so calling it on every page load writes one row per
          real obligation and never a duplicate. */
  if (sub === "reminders" && (req.method === "GET" || req.method === "POST")) {
    const reminders = require("./compliance-reminders");
    /* A POST inside the throttle window costs nothing: the ids are idempotent
       so there is nothing to raise, and the three model builds below are what
       made this expensive. Answer before doing them. */
    if (req.method === "POST" && reminders.recentlyRaised()) {
      return json(res, 200, reminders.lastResult(), req);
    }
    const [loans, spend, licences] = await Promise.all([
      model.buildLoans(), model.buildSpend(), model.buildLicences(),
    ]);
    const books = {
      licences: (licences && licences.licences) || [],
      leases: (spend && spend.leases) || [],
      services: (spend && spend.services) || [],
      loans: (loans && loans.agreements) || [],
    };
    if (req.method === "GET") return json(res, 200, reminders.due(books), req);
    return json(res, 200, await reminders.raiseThrottled(books, me.email), req);
  }

  /* ------------------------------------------------------------- loans */

  if (sub === "loans" && req.method === "GET") {
    const gate = documentGate(me);
    const built = await model.buildLoans();
    return json(res, 200, {
      loans: built.agreements.map((a) => {
        const bal = workflow.outstandingFor(a);
        const kids = workflow.childrenOf(a.id);
        return Object.assign(gateRecord(gate, a), {
          events: undefined,
          eventCount: a.events.length,
          balance: bal,
          actionCount: kids.filter((k) => k.type !== "repayment").length,
          repaymentCount: kids.filter((k) => k.type === "repayment").length,
        });
      }),
      reconciliation: built.reconciliation,
      unlinkedHistory: built.orphanEvents.length,
      ambiguous: built.ambiguous,
    }, req);
  }

  let m = sub.match(/^loans\/([^/]+)$/);
  if (m && req.method === "GET") {
    const built = await model.buildLoans();
    const loan = built.agreements.find((a) => a.id === decodeURIComponent(m[1]));
    if (!loan) return json(res, 404, { error: "not_found" }, req);
    return json(res, 200, { loan: gateRecord(documentGate(me), hydrateLoan(loan)) }, req);
  }

  m = sub.match(/^loans\/([^/]+)\/actions$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const built = await model.buildLoans();
    const loan = built.agreements.find((a) => a.id === decodeURIComponent(m[1]));
    if (!loan) return json(res, 404, { error: "not_found" }, req);
    try {
      const rec = workflow.create(me, perm, {
        type: "loanAction",
        subtype: body.subtype,
        parent: { kind: "loan", id: loan.id, label: loan.borrower || loan.id, ref: loan.ref },
        entity: loan.borrower, entityKey: loan.entityKey,
        fields: body.fields || {},
      });
      return json(res, 201, { record: fullRecord(rec) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^loans\/([^/]+)\/repayments$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const built = await model.buildLoans();
    const loan = built.agreements.find((a) => a.id === decodeURIComponent(m[1]));
    if (!loan) return json(res, 404, { error: "not_found" }, req);
    try {
      const out = workflow.recordRepayment(me, perm, loan, body || {});
      return json(res, 201, { record: fullRecord(out.rec), balance: out.balance }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  /* ------------------------------------------------- leases & services */

  if ((sub === "leases" || sub === "services") && req.method === "GET") {
    const gate = documentGate(me);
    const spend = await model.buildSpendWithDocs();
    const rows = sub === "leases" ? spend.leases : spend.services;
    return json(res, 200, {
      [sub]: rows.map((r) => Object.assign(gateRecord(gate, r), {
        actionCount: workflow.childrenOf(r.id).length,
      })),
      total: spend.total,
      classified: { leases: spend.leases.length, services: spend.services.length, other: spend.other.length },
      documentFolders: spend.documentFolders,
      unattachedDocuments: spend.unattachedDocuments.length,
    }, req);
  }

  m = sub.match(/^(leases|services)\/([^/]+)$/);
  if (m && req.method === "GET") {
    const spend = await model.buildSpendWithDocs();
    const rows = m[1] === "leases" ? spend.leases : spend.services;
    const rec = rows.find((r) => r.id === decodeURIComponent(m[2]));
    if (!rec) return json(res, 404, { error: "not_found" }, req);
    const kids = workflow.childrenOf(rec.id);
    return json(res, 200, {
      agreement: Object.assign(gateRecord(documentGate(me), rec), {
        children: kids.map(slimRecord),
        timeline: buildAgreementTimeline(rec, kids),
      }),
    }, req);
  }

  m = sub.match(/^(leases|services)\/([^/]+)\/actions$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const spend = await model.buildSpendWithDocs();
    const rows = m[1] === "leases" ? spend.leases : spend.services;
    const rec = rows.find((r) => r.id === decodeURIComponent(m[2]));
    if (!rec) return json(res, 404, { error: "not_found" }, req);
    try {
      const created = workflow.create(me, perm, {
        type: m[1] === "leases" ? "leaseAction" : "serviceAction",
        subtype: body.subtype,
        parent: { kind: m[1] === "leases" ? "lease" : "service", id: rec.id, label: rec.title || rec.id },
        entity: rec.entity, entityKey: rec.entityKey,
        fields: body.fields || {},
      });
      return json(res, 201, { record: fullRecord(created) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  /* ------------------------------------------------------- resolutions */

  if (sub === "resolutions" && req.method === "GET") {
    const st = await registers.ensure();
    const raw = (st.registers && st.registers.resolutions) || [];
    // Entity is DERIVED here, from the Drive folder and the workbook filename,
    // with a genuine disagreement flagged rather than silently resolved.
    const source = raw.map((r) => {
      const e = model.resolutionEntity(r.__source);
      const docs = (r.driveFiles || []).length;
      /* A resolution with no document on file is not COMPLETE evidence of a
         resolution. Twenty of them were labelled complete because the tracker
         row was complete -- which says the spreadsheet is filled in, not that
         the board minute exists. The two are tracked separately. */
      /* TWO AXES, NEVER ONE WORD.
         `dataCompleteness` describes the SOURCE ROW: is it filled in, and do
         the folder and the workbook agree about whose resolution it is.
         `evidenceStatus` describes the FILING CABINET: is the signed minute
         actually on file. A row can be perfectly complete and have no minute
         behind it, and collapsing the two into one "quality" field is how 20
         resolutions with no document came to be labelled COMPLETE.
         The two are independent: all 13 conflicting-source rows are also
         documented, and a record may carry one, both, or neither state. */
      return {
        ...r,
        entity: e.name,
        entityKey: entities.entityKey(e.name),
        entityConflict: e.conflict ? e : null,
        documentsOnFile: docs,
        dataCompleteness: e.conflict ? "CONFLICTING_SOURCE" : (r.__quality || "COMPLETE"),
        evidenceStatus: docs ? "DOCUMENTED" : "NO_DOCUMENT_ON_FILE",
        __evidence: docs ? "DOCUMENT_ON_FILE" : "NO_DOCUMENT_ON_FILE",
        __quality: e.conflict ? "CONFLICTING_SOURCE" : r.__quality,
      };
    });
    const native = workflow.list({ type: "resolution" });
    return json(res, 200, {
      source: source.length,
      /* Reported on two axes that each total the population, plus the overlap
         so the reader never has to guess whether a quality state is a separate
         set of records. */
      evidence: {
        total: source.length,
        withDocument: source.filter((r) => r.evidenceStatus === "DOCUMENTED").length,
        withoutDocument: source.filter((r) => r.evidenceStatus === "NO_DOCUMENT_ON_FILE").length,
        conflictingSource: source.filter((r) => r.dataCompleteness === "CONFLICTING_SOURCE").length,
      },
      quality: {
        total: source.length,
        complete: source.filter((r) => r.dataCompleteness === "COMPLETE").length,
        incompleteSource: source.filter((r) => r.dataCompleteness === "INCOMPLETE_SOURCE").length,
        conflictingSource: source.filter((r) => r.dataCompleteness === "CONFLICTING_SOURCE").length,
      },
      overlap: {
        conflictingAndDocumented: source.filter((r) => r.dataCompleteness === "CONFLICTING_SOURCE" && r.evidenceStatus === "DOCUMENTED").length,
        conflictingAndUndocumented: source.filter((r) => r.dataCompleteness === "CONFLICTING_SOURCE" && r.evidenceStatus === "NO_DOCUMENT_ON_FILE").length,
        rule: "dataCompleteness and evidenceStatus are independent; each totals the population on its own, and a record carries exactly one value on each axis",
      },
      native: native.map(slimRecord),
      byEntity: groupResolutionsByEntity(source, native, sources.resolutionFolderDocs()),
      entityConflicts: source.filter((r) => r.entityConflict).map((r) => ({
        id: r.id, folderName: r.entityConflict.folderName, fileName: r.entityConflict.fileName,
      })),
    }, req);
  }

  /* THE APPROVED TEMPLATES, AND WHO MUST SIGN.
     Both are configuration. The drafting flow offers only templates approved
     for this entity's legal form, and the signatory ROLE comes from that form —
     a partnership resolves through its partners, a single member company
     through its sole member. No person is hardcoded. */
  m = sub.match(/^resolutions\/templates$/);
  if (m && req.method === "GET") {
    let rcfg = {};
    try { rcfg = require("../config/compliance-rules.json").resolutions || {}; } catch (e) { rcfg = {}; }
    const key = query.get("entity");
    const ent = key ? await entities.byKey(key) : null;
    const form = ent ? ent.type : null;
    const items = ((rcfg.templates && rcfg.templates.items) || [])
      .filter((t) => !form || !t.forms || t.forms.includes(form));
    const sig = ((rcfg.signatories && rcfg.signatories.byLegalForm) || {})[form] || null;
    return json(res, 200, {
      entity: ent ? { key: ent.key, name: ent.name, legalForm: ent.type, legalFormLabel: ent.typeLabel } : null,
      templates: items,
      signatory: sig,
      methods: (rcfg.signatories && rcfg.signatories.methods) || [],
      types: rcfg.types || [],
      subjects: rcfg.subjects || [],
      authorities: rcfg.authorities || [],
    }, req);
  }

  if (sub === "resolutions" && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try {
      const ent = body.entityKey ? await entities.byKey(body.entityKey) : null;
      const rec = workflow.create(me, perm, {
        type: "resolution",
        subtype: "board",
        parent: ent ? { kind: "entity", id: ent.key, label: ent.name } : null,
        entity: ent ? ent.name : body.entity || null,
        entityKey: ent ? ent.key : body.entityKey || null,
        fields: body.fields || {},
      });
      return json(res, 201, { record: fullRecord(rec) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  /* ---- one entity's resolutions, and one resolution ----------------------
     Both levels of the drill-down are real addresses. "By entity" used to open
     a FILTERED COPY of the same page, and a source resolution had no detail at
     all -- clicking one did nothing, and clicking a LegalOS one opened a
     slide-over that no URL could reach. */

  m = sub.match(/^resolutions\/entity\/([^/]+)$/);
  if (m && req.method === "GET") {
    const key = decodeURIComponent(m[1]);
    const resGate = documentGate(me);
    const st3 = await registers.ensure();
    const all = (st3.registers && st3.registers.resolutions) || [];
    const mine = all.filter((r) => {
      const e = model.resolutionEntity(r.__source);
      return entities.entityKey(e.name) === key;
    }).map((r) => {
      const e = model.resolutionEntity(r.__source);
      return Object.assign(gateRecord(resGate, r), {
        entity: e.name, entityKey: key, origin: "source",
        entityConflict: e.conflict ? e : null,
        documents: gateRecord(resGate, r).documentCount,
      });
    });
    const native = workflow.list({ type: "resolution" }).filter((r) => r.entityKey === key);
    const ent = await entities.byKey(key);
    const fd = sources.resolutionFolderDocs().get(key);
    const claimed = new Set();
    for (const r of mine) for (const f of r.driveFiles || []) claimed.add(f.id);
    return json(res, 200, {
      entity: ent ? ent.name : (mine[0] && mine[0].entity) || (fd && fd.entity) || key,
      entityKey: key,
      entityType: ent ? ent.typeLabel : null,
      entityTypeConflict: ent ? ent.typeConflict || null : null,
      source: mine,
      native: native.map(slimRecord),
      // Folder documents that no resolution row claims are still REAL documents
      // sitting in this entity's folder; hiding them would misreport the estate.
      /* The entity folder listing names files too, so it is gated like the
         rest: an unlinked document in a Compliance folder is still a document
         somebody may not be entitled to see. */
      folderDocuments: fd ? resGate.filter(fd.files).documents.map((f) => Object.assign(
        { ...f, linkedToResolution: claimed.has(f.id) },
        require("./resolution-documents").describe(f, ent && ent.name))) : [],
      /* The entity's resolution register, grouped by what each document is,
         instead of one flat list of 201 filenames. */
      bifurcation: fd ? require("./resolution-documents").bifurcate(
        resGate.filter(fd.files).documents, ent && ent.name) : null,
      unclaimedDocuments: fd ? resGate.filter(fd.files).documents.filter((f) => !claimed.has(f.id)).length : 0,
    }, req);
  }

  m = sub.match(/^resolutions\/([^/]+)$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    // A LegalOS-drafted resolution first -- it is the live record.
    const rec = workflow.get(id);
    if (rec && rec.type === "resolution") {
      return json(res, 200, { resolution: { ...fullRecord(rec), origin: "legalos" } }, req);
    }
    // Otherwise a row from the source tracker. It is read-only, and says so.
    const st4 = await registers.ensure();
    const row = ((st4.registers && st4.registers.resolutions) || []).find((r) => r.id === id);
    if (!row) return json(res, 404, { error: "not_found", detail: "No resolution with that id." }, req);
    const e = model.resolutionEntity(row.__source);
    const key = entities.entityKey(e.name);
    const ent = key ? await entities.byKey(key) : null;
    const oneGate = documentGate(me);
    return json(res, 200, {
      resolution: Object.assign(gateRecord(oneGate, row), {
        origin: "source",
        /* The same two axes the list reports. Twenty resolutions arrived here
           with no documents and no statement about it, so the record looked
           merely empty rather than evidenced-or-not. */
        /* Each document says what it IS -- minutes, authorisation, AGM,
           board resolution -- with its register number, date and subject read
           from the name the company gave it. */
        documents: gateRecord(oneGate, row).driveFiles.map((f) =>
          Object.assign({}, f, require("./resolution-documents").describe(f, e && e.name))),
        documentsOnFile: gateRecord(oneGate, row).documentCount,
        evidenceStatus: gateRecord(oneGate, row).documentCount ? "DOCUMENTED" : "NO_DOCUMENT_ON_FILE",
        dataCompleteness: (e && e.conflict) ? "CONFLICTING_SOURCE" : (row.__quality || "COMPLETE"),
        entity: e.name, entityKey: key,
        entityType: ent ? ent.typeLabel : null,
        entityConflict: e.conflict ? e : null,
        documents: gateRecord(oneGate, row).documentCount,
        // The chronology a source resolution genuinely has: its own date, and
        // each document Drive holds for it. Nothing is invented to fill a tab.
        timeline: [
          row.date ? { kind: "resolution", label: "Resolution recorded in the source tracker",
            date: String(row.date).slice(0, 10), origin: "source" } : null,
          /* The timeline names each document, so it is built from the
             authorized set -- a filtered Documents tab beside a timeline that
             still lists every filename would disclose exactly what the filter
             was there to withhold. */
          ...gateRecord(oneGate, row).driveFiles.map((f) => ({
            kind: "document", label: f.name, date: (f.modifiedTime || "").slice(0, 10) || null,
            origin: "drive", file: f,
          })),
        ].filter(Boolean).sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999"))),
      }),
    }, req);
  }

  // Every document in one entity's Drive resolutions folder, with whether a
  // specific resolution row claimed it.
  m = sub.match(/^resolutions\/entity\/([^/]+)\/documents$/);
  if (m && req.method === "GET") {
    const key = decodeURIComponent(m[1]);
    const st2 = await registers.ensure();
    const src = (st2.registers && st2.registers.resolutions) || [];
    const linked = new Set();
    for (const r of src) for (const f of r.driveFiles || []) linked.add(f.id);
    const fd = sources.resolutionFolderDocs().get(key);
    if (!fd) return json(res, 404, { error: "not_found" }, req);
    return json(res, 200, {
      entity: fd.entity, entityKey: fd.entityKey,
      documents: fd.files.map((f) => ({ ...f, linkedToResolution: linked.has(f.id) })),
      total: fd.files.length,
      unlinked: fd.files.filter((f) => !linked.has(f.id)).length,
    }, req);
  }

  /* ---------------------------------------------------------- licences */

  if (sub === "licences" && req.method === "GET") {
    const gate = documentGate(me);
    const built = await model.buildLicences();
    return json(res, 200, {
      licences: built.licences.map((l) => {
        const apps = workflow.list({ type: "licenceApplication", parentId: l.id });
        /* A licence's history entries each name a document, so the history is
           filtered by the same gate as the document list -- otherwise the
           chain discloses certificates the caller may not open. */
        const gated = gateRecord(gate, l);
        const allowedIds = new Set([
          ...(gated.driveFiles || []),
          ...gate.filter(l.folderDocuments || []).documents,
        ].map((f) => f.id));
        /* A LegalOS-held correction is merged over the Drive-derived record.
           Drive is untouched; the original value travels with the record. */
        return overrides.apply("licence", Object.assign(gated, {
          /* PRESERVE ABSENCE. Only a folder-only licence HAS folderDocuments;
             the register column reads `folderDocuments || driveFiles`, so
             setting an empty array here is truthy and collapsed the Docs count
             to zero for all seven tracker licences. An empty array and a
             missing field are different facts and this column depends on the
             difference. */
          ...(l.folderDocuments ? { folderDocuments: gate.filter(l.folderDocuments).documents } : {}),
          history: (l.history || []).filter((h) => !h.file || allowedIds.has(h.file.id) || gate.isAdmin),
          applications: apps.map(slimRecord),
          applicationCount: apps.length,
        }));
      }),
      trackerLicences: built.trackerLicences,
      driveOnlyLicences: built.driveOnlyLicences,
      folders: built.folders,
      newApplications: workflow.list({ type: "licenceApplication" })
        .filter((a) => !a.parent || a.parent.kind !== "licence").map(slimRecord),
    }, req);
  }

  m = sub.match(/^licences\/([^/]+)$/);
  if (m && req.method === "GET") {
    const built = await model.buildLicences();
    const lic = built.licences.find((l) => l.id === decodeURIComponent(m[1]));
    if (!lic) return json(res, 404, { error: "not_found" }, req);
    const apps = workflow.list({ type: "licenceApplication", parentId: lic.id });
    /* One gate for the whole response: the document list, the renewal history
       and the timeline all describe the same files, so filtering one and not
       the others would put the names straight back in the payload. */
    const licGate = documentGate(me);
    /* GATE THE HISTORY AGAINST WHAT IS ACTUALLY SERVED.
       A licence's documents come from its FOLDER, not from driveFiles, so
       filtering the renewal chain against driveFiles alone emptied the history
       of a licence whose certificates all live in the folder -- leaving
       "Renewals on file: 1" above a history showing none. */
    const licAllowed = new Set([
      ...licGate.filter(lic.driveFiles || []).documents,
      ...licGate.filter(lic.folderDocuments || []).documents,
    ].map((f) => f.id));
    const licHistory = (lic.history || []).filter((h) => !h.file || licAllowed.has(h.file.id) || licGate.isAdmin);
    return json(res, 200, {
      licence: overrides.apply("licence", Object.assign(gateRecord(licGate, lic), {
        ...(lic.folderDocuments ? { folderDocuments: licGate.filter(lic.folderDocuments).documents } : {}),
        history: licHistory,
        applications: apps.map(slimRecord),
        // History = the Drive-evidenced renewal chain plus every LegalOS
        // application, in one chronology.
        timeline: [
          ...licHistory.map((h) => ({ date: h.date, label: h.label, kind: h.kind, file: h.file, origin: "drive" })),
          ...apps.map((a) => ({
            date: a.fields.applicationStart || a.createdAt.slice(0, 10),
            label: (a.subtype === "new" ? "New licence application" : "Renewal application") + " - " + (workflow.STATUS_LABEL[a.status] || a.status),
            kind: "application", recordId: a.id, origin: "legalos",
          })),
        ].sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999"))),
      })),
      editableFields: overrides.EDITABLE.licence,
    }, req);
  }

  /* CORRECT A LICENCE IN LEGALOS, WITHOUT TOUCHING DRIVE.
     The tracker is sometimes wrong or behind -- a mistyped number, a renewal
     granted last week. The correction is stored as an overlay and merged when
     the record is served; the source keeps saying what it says, the original
     value travels with the record, and every field records who changed it. */
  /* PATCH only. Accepting POST here shadowed `POST /licences/applications`
     -- the collection route that raises a NEW licence application -- because
     "applications" matched as a licence id, was looked up, and 404'd. An edit
     is a PATCH; the collection routes keep POST to themselves. */
  m = sub.match(/^licences\/([^/]+)$/);
  if (m && req.method === "PATCH") {
    try { workflow.requireCap(perm, "compliance.edit"); }
    catch (e) { return fail(res, json, req, e); }
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const id = decodeURIComponent(m[1]);
    const built = await model.buildLicences();
    const target = built.licences.find((l) => l.id === id);
    if (!target) return json(res, 404, { error: "not_found" }, req);
    let result;
    /* The record as the SOURCE has it, captured before the overlay is applied,
       so "what it was" is the Drive-derived value and not a previous edit. */
    try { result = overrides.set("licence", id, (body && body.fields) || {}, me, body && body.reason, target); }
    catch (e) { return json(res, e.status || 400, { error: e.message }, req); }
    const merged = overrides.apply("licence", gateRecord(documentGate(me), target));
    return json(res, 200, { licence: merged, ...result }, req);
  }

  m = sub.match(/^licences\/([^/]+)\/applications$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    const st = await registers.ensure();
    const lic = ((st.registers && st.registers.licences) || []).find((l) => l.id === decodeURIComponent(m[1]));
    if (!lic) return json(res, 404, { error: "not_found" }, req);
    try {
      // Auto-populate from the existing licence so nobody retypes it (PART 16.2).
      const rec = workflow.create(me, perm, {
        type: "licenceApplication",
        subtype: "renewal",
        parent: { kind: "licence", id: lic.id, label: [lic.authority, lic.entity].filter(Boolean).join(" - ") },
        entity: lic.entity, entityKey: entities.entityKey(lic.entity),
        fields: {
          applicationType: "renewal",
          licenceType: lic.authority || null,
          authority: lic.authority || null,
          currentLicenceNumber: lic.number || null,
          currentExpiry: lic.expiry || null,
          applicationStart: (body.fields && body.fields.applicationStart) || new Date().toISOString().slice(0, 10),
          ...(body.fields || {}),
        },
      });
      return json(res, 201, { record: fullRecord(rec), missing: missingForApplication(rec, lic) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  if (sub === "licences/applications" && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try {
      const rec = workflow.create(me, perm, {
        type: "licenceApplication",
        subtype: "new",
        parent: null,
        entity: body.entity || null,
        entityKey: body.entityKey || entities.entityKey(body.entity),
        fields: { applicationType: "new", ...(body.fields || {}) },
      });
      return json(res, 201, { record: fullRecord(rec), missing: missingForApplication(rec, null) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  /* -------------------------------------------------------------- SECP */

  if (sub === "secp/overview" && req.method === "GET") {
    const fy = query.get("fy") || null;
    /* THE STATUTORY ESTATE, COUNTED FROM THE FOLDERS THAT PROVE IT.
       The card reported "0 recorded filings · 33 compliance years" over a Drive
       tree holding 252 entity-year folders and 3,367 statutory documents: it
       was reading a legacy path that derived a handful of years from board
       minutes, written when this root was not yet shared.

       Record existence, document existence and PROVEN SUBMISSION are reported
       as three separate numbers. A Form 29 on file is not a Form 29 filed, and
       one figure covering both would claim compliance nobody can evidence. */
    const records = require("./secp-records");
    const gate = documentGate(me);
    const statutory = records.summary();
    return json(res, 200, {
      dashboard: await secp.dashboard(fy),
      entities: await secp.entityOverview(fy),
      financialYears: secp.financialYears(),
      statutory,
      headline: {
        entities: statutory.entities,
        groupEntities: statutory.groupEntities,
        nonGroupEntities: statutory.nonGroupEntities,
        entityYearRecords: statutory.entityYearRecords,
        eventFilings: statutory.eventFilings,
        statutoryRegisters: statutory.statutoryRegisters,
        documents: statutory.documents,
        physicalFiles: statutory.physicalFiles,
        duplicateSourceCopies: statutory.duplicateSourceCopies,
        upcomingObligations: statutory.upcomingObligations,
        provenSubmissions: statutory.provenSubmissions,
        acknowledgementsReceived: statutory.acknowledgementsReceived,
        /* THIS KEY WAS WRITTEN TWICE AND THE SECOND ONE WON.
           A later `documents:` in the same object literal silently replaced the
           estate total with a gate.filter() over every document in the estate
           FLATTENED INTO ONE LIST -- and that gate collapses copies by filename,
           so two different companies each holding a file called
           "Form A_2023.pdf" became one document. The landing page read 3,077
           where the register, the entity pages and the reconciliation all read
           3,150. Deduplication is only meaningful WITHIN a company, which is
           what records.summary() does and why its figure is the one kept.

           What the gate is for is still answered, under a name that says what
           it is: how many of those documents THIS reader may open. */
        documentsVisibleToYou: (() => {
          const perEntity = new Map();
          const add = (r) => {
            if (!perEntity.has(r.entityKey)) perEntity.set(r.entityKey, []);
            perEntity.get(r.entityKey).push(...(r.documents || []));
          };
          records.annualCompliance().forEach(add);
          records.eventFilings().forEach(add);
          records.statutoryRegisters().forEach(add);
          let n = 0;
          for (const docs of perEntity.values()) n += gate.filter(docs).documentCount;
          return n;
        })(),
      },
    }, req);
  }

  /* ---- the statutory registers built from the Drive tree ---------------- */
  if (sub === "secp/annual" && req.method === "GET") {
    const records = require("./secp-records");
    const gate = documentGate(me);
    const ent = query.get("entity"), yr = query.get("year"), grp = query.get("group");
    let rows = records.annualCompliance();
    if (ent) rows = rows.filter((r) => r.entityKey === ent);
    if (yr) rows = rows.filter((r) => r.sourcePeriodLabel === yr || String(r.complianceYear) === String(yr));
    if (grp) rows = rows.filter((r) => r.group === grp);
    return json(res, 200, { annual: rows.map((r) => gateRecord(gate, r)), total: rows.length }, req);
  }

  m = sub.match(/^secp\/annual\/([^/]+)$/);
  if (m && req.method === "GET") {
    const records = require("./secp-records");
    const rec = records.annualCompliance().find((r) => r.id === decodeURIComponent(m[1]));
    if (!rec) return json(res, 404, { error: "not_found" }, req);
    return json(res, 200, { record: gateRecord(documentGate(me), rec) }, req);
  }

  if (sub === "secp/events" && req.method === "GET") {
    const records = require("./secp-records");
    const gate = documentGate(me);
    const ent = query.get("entity");
    let rows = records.eventFilings();
    if (ent) rows = rows.filter((r) => r.entityKey === ent);
    return json(res, 200, { events: rows.map((r) => gateRecord(gate, r)), total: rows.length }, req);
  }

  /* Future statutory obligations. Kept on their own route, never merged into
     the Drive-backed registers, so nothing can present a computed 2027 due
     date beside a CY 2024 folder as though both came from the source. */
  /* ---- the compliance-year reconciliation --------------------------------
     Where every file under every CY folder went, and -- for a year that holds
     no accounts -- the evidence that somebody looked. "No source document" is
     a conclusion only once the folder has been walked to its leaves and the
     ambiguous files read; this is that working, so the claim can be checked
     rather than taken on trust. Built by tools/secp-cy-reconcile.js. */
  if (sub === "secp/reconciliation" && req.method === "GET") {
    let matrix = null;
    try { matrix = require("../cache/secp-cy-reconciliation.json"); } catch (e) { matrix = null; }
    if (!matrix) {
      return json(res, 200, {
        built: false,
        detail: "No reconciliation has been run. node tools/secp-cy-reconcile.js --probe",
      }, req);
    }
    let findings = {};
    try { findings = require("../cache/secp-content-findings.json"); } catch (e) { findings = {}; }
    const without = matrix.matrix.filter((m) => m.financialStatements === 0);
    return json(res, 200, {
      built: true,
      builtAt: matrix.builtAt,
      probed: !!matrix.probed,
      totals: matrix.totals,
      contentFindings: {
        builtAt: findings.builtAt || null,
        filesProbed: findings.filesProbed || 0,
        probeWords: findings.probeWords || [],
        threshold: findings.threshold || null,
        recovered: Object.values(findings.findings || {}),
      },
      /* Named, so a reader can go and look at the folder themselves. */
      yearsWithoutAccounts: without.map((m) => ({
        entity: m.entity, entityKey: m.entityKey, cy: m.cy,
        sourceGroup: m.sourceGroup, totalFiles: m.totalFiles,
        sourceFolders: m.sourceFolders, dispositions: m.dispositions,
      })),
    }, req);
  }

  if (sub === "secp/upcoming" && req.method === "GET") {
    const records = require("./secp-records");
    const ent = query.get("entity");
    let rows = records.upcomingObligations();
    if (ent) rows = rows.filter((r) => r.entityKey === ent);
    return json(res, 200, {
      upcoming: rows, total: rows.length,
      origin: "SYSTEM_GENERATED",
      basis: "Computed from the statutory rules in config/compliance-rules.json. No Drive folder asserts these.",
    }, req);
  }

  if (sub === "secp/registers" && req.method === "GET") {
    const records = require("./secp-records");
    const gate = documentGate(me);
    const ent = query.get("entity");
    let rows = records.statutoryRegisters();
    if (ent) rows = rows.filter((r) => r.entityKey === ent);
    return json(res, 200, { registers: rows.map((r) => gateRecord(gate, r)), total: rows.length }, req);
  }

  /* One entity's statutory folder — "Entities data for secp filing" — year by
     year. Read straight from the folder grammar, so it says what the company
     actually holds. Permission is the module's own: this route sits inside the
     compliance router and is reached only by a principal already admitted to
     Compliance & Licences, so it adds no new surface of its own. */
  m = sub.match(/^secp\/statutory\/([^/]+)$/);
  if (m && req.method === "GET") {
    const detail = secp.statutoryDetail(decodeURIComponent(m[1]));
    if (!detail) return json(res, 404, { error: "no statutory folder is held for this entity" }, req);
    return json(res, 200, detail, req);
  }

  // Statutory years evidenced by documents in Drive, with what each one proves.
  /* ---- one compliance year -----------------------------------------------
     A derived year is a record with an address, not a table row. It still says
     what it is: evidence that events happened, never proof that a filing went
     in. The recorded filings for the same (entity, FY) are attached so the two
     can be compared on one page instead of guessed at across two tabs. */
  m = sub.match(/^secp\/years\/([^/]+)$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    /* ONE DATASET. The list and the detail both resolve against the Drive-backed
       statutory model. The detail used to look in secp.derivedYears() -- the
       legacy board-minute derivation -- so every row in the register linked to
       a 404 and the page rendered against an undefined year. That derivation is
       gone; an id this model does not know is a 404, not a fallback into a
       second, differently-shaped dataset. */
    const statutory = require("./secp-records").annualCompliance().find((x) => x.id === id);
    if (statutory) {
      /* Drive-backed history and LegalOS-native filings are ONE statutory
         history for this company-year, so the filings recorded here are
         attached rather than left on a separate tab to be reconciled by eye.
         Neither population overwrites the other. */
      const recordedHere = workflow.list({ type: "secpFiling" })
        .filter((r) => r.entityKey === statutory.entityKey
          && String(r.fields.financialYear || "").includes(String(statutory.complianceYear)));
      const events = require("./secp-records").eventFilings()
        .filter((e) => e.entityKey === statutory.entityKey && e.complianceYear === statutory.complianceYear);
      const gate = documentGate(me);
      return json(res, 200, {
        year: {
          ...gateRecord(gate, statutory),
          eventFilings: events.map((e) => gateRecord(gate, e)),
          recorded: recordedHere.map((r) => ({ ...slimRecord(r), state: secp.filingState(r) })),
        },
      }, req);
    }
    return json(res, 404, { error: "not_found", detail: "No compliance year with that id." }, req);
  }

  /* ---- one document ------------------------------------------------------
     A document chip, a docs count and an evidence link all lead here, so a
     document is an address like anything else. Object-level authorization is
     the SAME predicate the knowledge surface uses (ctx.visible) -- knowing a
     file id is not permission to read it -- and an unauthorised file is
     reported exactly like a missing one. */
  m = sub.match(/^document\/([^/]+)$/);
  if (m && req.method === "GET") {
    const id = decodeURIComponent(m[1]);
    await drive.ensureIndex();
    const meta = drive.fileById(id);
    if (!meta || !(await ctx.visible(meta))) return json(res, 404, { error: "not_found" }, req);
    // Which compliance records cite this file. Real links only: a document that
    // nothing cites says so rather than being attributed to a nearby record.
    const st5 = await registers.ensure();
    const regs = (st5.registers) || {};
    const links = [];
    const FAM = [
      ["loans", "Loan", "/compliance/loans/"],
      ["licences", "Licence", "/compliance/licenses/"],
      ["resolutions", "Resolution", "/compliance/resolutions/"],
      ["contracts", "Agreement", null],
    ];
    for (const [famKey, label, prefix] of FAM) {
      for (const r of regs[famKey] || []) {
        if ((r.driveFiles || []).some((f) => f.id === id)) {
          links.push({ family: famKey, label, id: r.id, prefix,
            title: r.title || r.borrower || r.authority || r.agenda || r.id });
        }
      }
    }
    return json(res, 200, {
      document: {
        id: meta.id, name: meta.name, mimeType: meta.mimeType, size: meta.size,
        folderPath: meta.folderPath, root: meta.root,
        webViewLink: meta.webViewLink, modifiedTime: meta.modifiedTime, createdTime: meta.createdTime,
      },
      links,
      // Honest about what we can and cannot render without asking for bytes.
      previewable: /pdf|google-apps|^image\/|wordprocessingml|spreadsheetml|ms-excel|msword/.test(meta.mimeType || ""),
    }, req);
  }

  if (sub === "secp/years" && req.method === "GET") {
    const ent = query.get("entity");
    const fy = query.get("fy");
    /* Folder-backed compliance years are the estate; the board-minute
       derivation is kept alongside as the older, narrower evidence it is. */
    const records = require("./secp-records");
    let rows = records.annualCompliance();
    if (ent) rows = rows.filter((y) => y.entityKey === ent);
    if (fy) rows = rows.filter((y) => y.sourcePeriodLabel === fy || String(y.complianceYear) === String(fy));
    const gate = documentGate(me);
    return json(res, 200, {
      years: rows.map((r) => gateRecord(gate, r)), total: rows.length,
    }, req);
  }

  if (sub === "secp/filings" && req.method === "GET") {
    const rows = secp.filings({
      entityKey: query.get("entity") || null,
      financialYear: query.get("fy") || null,
      category: query.get("category") || null,
    });
    return json(res, 200, {
      filings: rows.map((r) => ({ ...slimRecord(r), state: secp.filingState(r) })),
    }, req);
  }

  if (sub === "secp/filings" && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try {
      const rec = secp.createFiling(me, perm, body || {});
      return json(res, 201, { record: fullRecord(rec) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^secp\/filings\/([^/]+)\/status$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try {
      const rec = secp.setFilingStatus(me, perm, decodeURIComponent(m[1]), body.status, body);
      return json(res, 200, { record: fullRecord(rec), state: secp.filingState(rec) }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^secp\/entity\/([^/]+)$/);
  if (m && req.method === "GET") {
    const key = decodeURIComponent(m[1]);
    const ent = await entities.byKey(key);
    if (!ent) return json(res, 404, { error: "not_found" }, req);
    /* THE ENTITY'S COMPLIANCE YEARS ARE THE FOLDERS DRIVE HOLDS.
       This route used to build the entity's history from
       secp.financialYears() -- a formula returning FY 2021..FY 2028 -- so
       every company's page opened on generated years, with generated
       deadlines, whatever its actual Drive estate contained. A company with
       ten CY folders and 83 statutory documents showed the same eight
       synthetic rows as one with none.

       The source-backed history, the statutory registers and the event
       filings now come from the Drive model. Future obligations are still
       served, on their own key, marked system-generated. */
    const records = require("./secp-records");
    const gate = documentGate(me);
    const mine = (r) => r.entityKey === ent.key;
    const sourceYears = records.annualCompliance().filter(mine)
      .sort((a, b) => b.complianceYear - a.complianceYear)
      .map((r) => gateRecord(gate, r));
    return json(res, 200, {
      entity: ent,
      /* Where this company sits in Drive, verbatim. */
      source: sourceYears.length ? {
        rootFolderName: sourceYears[0].rootFolderName, rootFolderId: sourceYears[0].rootFolderId,
        groupFolderName: sourceYears[0].groupFolderName, groupFolderId: sourceYears[0].groupFolderId,
        entityFolderName: sourceYears[0].entityFolderName, entityFolderId: sourceYears[0].entityFolderId,
      } : null,
      complianceYears: sourceYears,
      statutoryRegisters: records.statutoryRegisters().filter(mine).map((r) => gateRecord(gate, r)),
      /* Newest first, and undated events last rather than first: an event with
         no date in Drive is not an event that happened in year zero. */
      eventFilings: records.eventFilings().filter(mine)
        .sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || "")
          || (b.complianceYear || 0) - (a.complianceYear || 0))
        .map((r) => gateRecord(gate, r)),
      upcoming: records.upcomingObligations().filter(mine),
      // The LegalOS-native filings raised against this company.
      events: secp.filings({ entityKey: ent.key, category: "event" })
        .map((r) => ({ ...slimRecord(r), state: secp.filingState(r) })),
      timeline: secp.entityTimeline(ent.key),
    }, req);
  }

  /* ------------------------------------------------------------ activity */

  // The Overview's "Recent activity" panel. This is the APPEND-ONLY AUDIT TRAIL
  // and nothing else: every row is something a named person did inside LegalOS,
  // at a recorded time. Document dates from Drive are deliberately NOT mixed in
  // here -- a document dated 12 March is not somebody doing something on 12
  // March, and the whole Compliance model rests on keeping those apart. When
  // nobody has acted yet the list is empty, and the panel says so.
  if (sub === "activity" && req.method === "GET") {
    try { workflow.requireCap(perm, "compliance.view"); }
    catch (e) { return fail(res, json, req, e); }
    // URLSearchParams, like every other route here -- `query.limit` is undefined
    // and silently fell back to 8, so ?limit=50 returned 8 and ?limit=2 also 8.
    const limit = Math.max(1, Math.min(50, parseInt(query.get("limit"), 10) || 8));
    const MODULE = {
      loanAction: { path: "/compliance/loans", noun: "loan" },
      repayment: { path: "/compliance/loans", noun: "loan" },
      leaseAction: { path: "/compliance/leases", noun: "lease" },
      serviceAction: { path: "/compliance/services", noun: "service agreement" },
      resolution: { path: "/compliance/resolutions", noun: "resolution" },
      licenceApplication: { path: "/compliance/licenses", noun: "licence" },
      secpFiling: { path: "/compliance/sec-filings", noun: "SECP filing" },
    };
    const VERB = {
      "record.created": "created",
      "record.updated": "updated",
      "signatories.set": "set the signatories on",
      "signature.requested": "requested signature on",
      "signature.updated": "recorded a signature on",
      "document.attached": "attached a document to",
      "drive.filing": "updated the Drive filing position of",
      "repayment.recorded": "recorded a repayment against",
    };
    const entries = workflow.auditAll();
    const rows = entries
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, limit)
      .map((a) => {
        const rec = a.recordId ? workflow.get(a.recordId) : null;
        const mod = MODULE[a.recordType] || null;
        const verb = a.action.startsWith("status.")
          ? "moved " + (mod ? "a " + mod.noun + " action" : "a record") + " to " +
            (workflow.STATUS_LABEL[(a.after && a.after.status) || ""] || a.action.slice(7))
          : (VERB[a.action] || a.action);
        const parent = rec && rec.parent ? rec.parent : null;
        return {
          id: a.id,
          at: a.at,
          actor: (a.actor && a.actor.name) || "unknown",
          action: a.action,
          verb,
          recordId: a.recordId,
          recordType: a.recordType,
          subject: parent ? parent.label : (rec && rec.entity) || null,
          href: mod ? (parent && parent.id && /loans|leases|services|licenses/.test(mod.path)
            ? mod.path + "/" + encodeURIComponent(parent.id)
            : mod.path) : null,
        };
      });
    return json(res, 200, { activity: rows, total: entries.length }, req);
  }

  /* --------------------------------------------------- workflow records */

  m = sub.match(/^records\/([^/]+)$/);
  if (m && req.method === "GET") {
    const rec = workflow.get(decodeURIComponent(m[1]));
    if (!rec) return json(res, 404, { error: "not_found" }, req);
    return json(res, 200, { record: fullRecord(rec) }, req);
  }
  if (m && (req.method === "PATCH" || req.method === "POST")) {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try { return json(res, 200, { record: fullRecord(workflow.update(me, perm, decodeURIComponent(m[1]), body || {})) }, req); }
    catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/transition$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try { return json(res, 200, { record: fullRecord(workflow.transition(me, perm, decodeURIComponent(m[1]), body.to, body)) }, req); }
    catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/signatories$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try { return json(res, 200, { record: fullRecord(workflow.setSignatories(me, perm, decodeURIComponent(m[1]), body.signatories)) }, req); }
    catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/signature$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try { return json(res, 200, { record: fullRecord(workflow.requestSignature(me, perm, decodeURIComponent(m[1]), body.method)) }, req); }
    catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/signature\/(\d+)$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try { return json(res, 200, { record: fullRecord(workflow.markSigned(me, perm, decodeURIComponent(m[1]), m[2], body.status, body.signedDate)) }, req); }
    catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/drive$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try { return json(res, 200, { record: fullRecord(workflow.setDriveFiling(me, perm, decodeURIComponent(m[1]), body.status, body)) }, req); }
    catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/documents$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try {
      const out = workflow.attachDocument(me, perm, decodeURIComponent(m[1]), body || {});
      return json(res, 201, { record: fullRecord(out.rec), document: out.doc }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  m = sub.match(/^records\/([^/]+)\/documents\/([^/]+)$/);
  if (m && req.method === "GET") {
    const got = workflow.readDocument(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (!got) return json(res, 404, { error: "not_found" }, req);
    res.writeHead(200, {
      "Content-Type": got.entry.mimeType,
      "Content-Length": got.buffer.length,
      "Content-Disposition": 'attachment; filename="' + got.entry.name.replace(/[^\w.\- ]+/g, "_") + '"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    return res.end(got.buffer);
  }

  /* ------------------------------------------------- document generation */

  m = sub.match(/^records\/([^/]+)\/generate$/);
  if (m && req.method === "POST") {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }, req); }
    try {
      workflow.requireCap(perm, "compliance.document.generate");
      const rec = workflow.get(decodeURIComponent(m[1]));
      if (!rec) return json(res, 404, { error: "not_found" }, req);
      if (rec.status !== "DRAFT" && rec.status !== "LEGAL_REVIEW") {
        return json(res, 409, { error: "wrong_stage",
          detail: "A document can only be generated while the action is a draft or in review. This one is " +
            (workflow.STATUS_LABEL[rec.status] || rec.status).toLowerCase() + "." }, req);
      }
      const out = await generateFor(rec, body, me, ctx);
      const att = workflow.attachDocument(me, perm, rec.id, {
        kind: "generated",
        name: out.name,
        mimeType: docgen.DOCX_MIME,
        contentBase64: out.buffer.toString("base64"),
        templateFileId: out.template ? out.template.id : null,
      });
      // Remember which approved template governs this action.
      att.rec.template = out.template
        ? { id: out.template.id, name: out.template.name, folderPath: out.template.folderPath, category: out.template.category }
        : null;
      workflow.audit(me, "document.generated", att.rec, null, { template: att.rec.template, document: att.doc.id });
      workflow.save();
      return json(res, 201, { record: fullRecord(att.rec), document: att.doc }, req);
    } catch (e) { return fail(res, json, req, e); }
  }

  /* ---------------------------------------------------------- templates */

  if (sub === "templates" && req.method === "GET") {
    // Uses the SAME visibility predicate as the rest of the knowledge library,
    // so the template list can never reveal a document the caller could not open.
    const all = await visibleTemplates(ctx);
    const type = query.get("type") || "";
    const subtype = query.get("subtype") || "";
    const suggested = docgen.suggestTemplates(type, subtype, all);
    return json(res, 200, {
      total: all.length,
      suggested: suggested.slice(0, 40),
      all: all.slice(0, 500),
    }, req);
  }

  /* -------------------------------------------------- source re-discovery */

  // The Drive reconciliation: what exists in Drive vs what LegalOS accounts for.
  // Admin-visible proof that no compliance material is stranded.
  if (sub === "sources" && req.method === "GET") {
    const loans = await model.buildLoans();
    const lic = await model.buildLicences();
    const spend = await model.buildSpendWithDocs();
    const ev = sources.secpEvidence();
    const tpl = sources.templateRegistry();
    return json(res, 200, {
      loans: {
        sourceRows: loans.reconciliation.sourceRows,
        agreements: loans.reconciliation.agreements,
        trackerAgreements: loans.reconciliation.trackerAgreements,
        driveOnlyAgreements: loans.reconciliation.driveOnlyAgreements,
        historyRows: loans.reconciliation.historyRows,
        historyAttached: loans.reconciliation.historyAttached,
        historyUnattached: loans.reconciliation.historyUnattached,
        headerArtifacts: loans.reconciliation.headerArtifacts,
        balances: loans.reconciliation.balances,
        driveFolders: loans.loanFolders,
        unmatchedFolders: loans.unmatchedFolders,
        documentEvents: loans.agreements.reduce((n, a) => n + ((a.documentEvents || []).length), 0),
      },
      licences: { total: lic.licences.length, tracker: lic.trackerLicences, driveOnly: lic.driveOnlyLicences, folders: lic.folders,
        renewalsRecovered: lic.licences.reduce((n, l) => n + (l.renewalsOnFile || 0), 0) },
      spend: { total: spend.total, leases: spend.leases.length, services: spend.services.length, other: spend.other.length,
        documentFolders: spend.documentFolders, unattachedDocuments: spend.unattachedDocuments.length },
      secp: {
        evidenceDocuments: ev.length,
        agmMinutes: ev.filter((e) => e.kind === "agm_minutes").length,
        fsApprovals: ev.filter((e) => e.kind === "fs_approval").length,
        groupForms: ev.filter((e) => e.kind === "secp_form").length,
        thirdPartyForms: ev.filter((e) => e.kind === "third_party_form").length,
        filingRegisterInDrive: false,
      },
      templates: { total: tpl.length, approved: tpl.filter((t) => t.approved).length, drafts: tpl.filter((t) => !t.approved).length },
      letterheads: (() => { const lh = sources.letterheads(); return { assets: lh.assets.length, mentionedInDocuments: lh.mentions, configured: lh.configured }; })(),
      drive: drive.status(),
    }, req);
  }

  if (sub === "templates/registry" && req.method === "GET") {
    const all = sources.templateRegistry();
    const family = query.get("family") || "";
    return json(res, 200, {
      total: all.length,
      templates: (family ? all.filter((t) => t.families.includes(family)) : all).slice(0, 500),
    }, req);
  }

  return json(res, 404, { error: "unknown compliance route", route: sub }, req);
}

/* ---------------------------------------------------------------- support */

async function visibleTemplates(ctx) {
  await drive.ensureIndex();
  const out = [];
  for (const f of drive.indexFiles()) {
    if (!/Pakistan Contract Templates/i.test(f.folderPath || "")) continue;
    if (/^~\$/.test(f.name || "") || /^\.|desktop\.ini$|\.tmp$/i.test(f.name || "")) continue;
    if (ctx.visible && !(await ctx.visible(f))) continue;
    const segs = String(f.folderPath || "").split(" / ");
    const at = segs.findIndex((s) => /Pakistan Contract Templates/i.test(s));
    out.push({
      id: f.id, name: f.name, mimeType: f.mimeType, folderPath: f.folderPath || "",
      category: (at >= 0 && segs[at + 1]) ? segs[at + 1] : "General",
    });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

async function generateFor(rec, body, me, ctx) {
  const actor = (me && (me.name || me.email)) || "LegalOS user";
  let template = null;
  if (body && body.templateId) {
    const all = await visibleTemplates(ctx);
    template = all.find((t) => t.id === body.templateId) || null;
    if (!template) {
      const e = new Error("template_not_found"); e.code = 404;
      e.detail = "That template is not in the approved library, or you do not have access to it.";
      throw e;
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (rec.type === "loanAction") {
    const built = await model.buildLoans();
    const loan = built.agreements.find((a) => a.id === (rec.parent && rec.parent.id));
    if (!loan) { const e = new Error("parent_missing"); e.code = 409; e.detail = "The parent loan could not be read."; throw e; }
    return {
      buffer: docgen.loanActionDraft({ loan, action: rec, template, actor, balance: workflow.outstandingFor(loan) }),
      name: rec.id + " " + (rec.subtype || "action") + " draft " + stamp + ".docx",
      template,
    };
  }

  if (rec.type === "leaseAction" || rec.type === "serviceAction") {
    const spend = await model.buildSpend();
    const rows = rec.type === "leaseAction" ? spend.leases : spend.services;
    const agreement = rows.find((r) => r.id === (rec.parent && rec.parent.id));
    if (!agreement) { const e = new Error("parent_missing"); e.code = 409; e.detail = "The parent agreement could not be read."; throw e; }
    return {
      buffer: docgen.agreementActionDraft({
        agreement, action: rec, template, actor,
        kindLabel: (rec.type === "leaseAction" ? "Lease " : "Service agreement ") + (rec.subtype || "action"),
      }),
      name: rec.id + " " + (rec.subtype || "action") + " draft " + stamp + ".docx",
      template,
    };
  }

  if (rec.type === "resolution") {
    const ent = rec.entityKey ? await entities.byKey(rec.entityKey) : null;
    const lh = model.rules().resolutions && model.rules().resolutions.letterheads;
    const letterhead = lh && lh.configured && lh.byEntity ? lh.byEntity[rec.entityKey] : null;
    return {
      buffer: docgen.resolutionDraft({ action: rec, entity: ent, template, actor, letterhead }),
      name: rec.id + " resolution draft " + stamp + ".docx",
      template,
    };
  }

  if (rec.type === "licenceApplication") {
    const st = await registers.ensure();
    const lic = rec.parent && rec.parent.kind === "licence"
      ? ((st.registers && st.registers.licences) || []).find((l) => l.id === rec.parent.id) : null;
    return {
      buffer: docgen.licenceApplicationDraft({ action: rec, licence: lic, template, actor, missing: missingForApplication(rec, lic) }),
      name: rec.id + " application " + stamp + ".docx",
      template,
    };
  }

  const e = new Error("not_generatable"); e.code = 400;
  e.detail = "No document template exists for this record type.";
  throw e;
}

// What the application is still missing. Derived from what the record actually
// holds -- LegalOS does not invent an authority's requirements (PART 17.3), it
// only reports the fields and documents its own form asks for.
function missingForApplication(rec, licence) {
  const f = rec.fields || {};
  const out = [];
  const need = (key, label) => { if (!f[key]) out.push({ kind: "field", key, label }); };
  need("authority", "Issuing authority");
  need("licenceType", "Licence type");
  if (f.applicationType === "new") { need("purpose", "Purpose"); need("jurisdiction", "Jurisdiction"); }
  else { need("currentLicenceNumber", "Current licence number"); need("currentExpiry", "Current expiry"); }
  if (!(rec.documents || []).length) out.push({ kind: "document", key: "supporting", label: "Supporting documents", detail: "None attached" });
  if (!f.applicationReference && /submitted|under review|approved/i.test(String(f.portalStatus || "")))
    out.push({ kind: "field", key: "applicationReference", label: "Application reference", detail: "Required once submitted" });
  return out;
}

function buildAgreementTimeline(rec, kids) {
  const t = [];
  if (rec.start) t.push({ date: rec.start, kind: "origination", label: "Agreement start", origin: "source" });
  if (rec.end) t.push({ date: rec.end, kind: "expiry", label: "Agreement expiry", origin: "source" });
  else if (rec.ongoing) t.push({ date: null, kind: "expiry", label: "Ongoing - no end date recorded", origin: "source" });
  for (const c of kids) {
    t.push({
      date: c.fields.effectiveDate || c.createdAt.slice(0, 10),
      kind: c.subtype || "action",
      label: (c.subtype || "action").replace(/^\w/, (x) => x.toUpperCase()) + " - " + (workflow.STATUS_LABEL[c.status] || c.status),
      recordId: c.id,
      origin: "legalos",
    });
  }
  return t.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
}

function groupResolutionsByEntity(source, native, folderDocs) {
  const m = new Map();
  const touch = (name) => {
    const key = entities.entityKey(name);
    if (!key) return null;
    if (!m.has(key)) m.set(key, { key, name: name || key, source: 0, native: 0, pending: 0, executed: 0, latest: null });
    const e = m.get(key);
    if (name && String(name).length > String(e.name).length) e.name = name;
    return e;
  };
  for (const r of source) {
    const e = touch(r.entity); if (!e) continue;
    e.source++;
    if (r.date && (!e.latest || r.date > e.latest)) e.latest = r.date;
  }
  for (const r of native) {
    const e = touch(r.entity); if (!e) continue;
    e.native++;
    if (r.status === "EXECUTED") e.executed++; else e.pending++;
    const d = r.fields.resolutionDate || r.createdAt.slice(0, 10);
    if (d && (!e.latest || d > e.latest)) e.latest = d;
  }
  // Every document in the entity's Drive resolutions folder, and how many of
  // them no single resolution row claimed. Those are real documents belonging to
  // a real company; they are reachable here rather than stranded.
  if (folderDocs) {
    const linked = new Set();
    for (const r of source) for (const f of r.driveFiles || []) linked.add(f.id);
    for (const e of m.values()) {
      const fd = folderDocs.get(e.key);
      e.folderDocuments = fd ? fd.files.length : 0;
      e.unlinkedDocuments = fd ? fd.files.filter((f) => !linked.has(f.id)).length : 0;
    }
  }
  return [...m.values()].sort((a, b) => (b.source + b.native) - (a.source + a.native));
}

module.exports = { handle };
