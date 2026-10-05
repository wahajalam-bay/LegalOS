// Browser-side client for the LegalOS API.
//
// The base URL is derived from THIS module's own URL rather than from
// window.location. Both apps (LegalOS at /legalos/ and the requester portal at
// /legalos/portal/) import from the same src/ directory, so deriving from the
// page would send the portal's calls to /legalos/portal/api/ and 404. The
// module URL always points at <appRoot>/src*/api.js, so stripping the last two
// segments yields the app root under any mount point.
const API_BASE = (() => {
  try {
    const u = new URL(import.meta.url);
    return u.href.replace(/\/[^/]*\/[^/]*$/, "/") + "api/";
  } catch (e) {
    return "api/";
  }
})();

async function call(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: "same-origin",
    headers: Object.assign(
      { Accept: "application/json" },
      opts.body ? { "Content-Type": "application/json" } : {},
      opts.headers || {}
    ),
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { error: "bad_response", detail: text.slice(0, 200) }; }
  if (!res.ok) {
    const err = new Error(json.detail || json.error || "HTTP " + res.status);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export const api = {
  base: API_BASE,
  health: () => call("health"),
  securityHealth: () => call("health/security"),
  complianceReconciliation: () => call("registers/compliance-reconciliation"),
  /* Where every file under every SECP compliance year went, and the evidence
     behind each year that holds no accounts. */
  secpReconciliation: () => call("compliance/secp/reconciliation"),
  // Defects inside stored documents. Source quality, not application health.
  sourceQuality: () => call("registers/source-quality"),
  // Saved views — a user's named filter states, persisted server-side so they
  // follow the person rather than the browser.
  views: {
    list: (register) => call("views" + (register ? "?register=" + encodeURIComponent(register) : "")),
    create: (body) => call("views", { method: "POST", body }),
    update: (id, body) => call("views/" + encodeURIComponent(id), { method: "PATCH", body }),
    duplicate: (id) => call("views/" + encodeURIComponent(id) + "/duplicate", { method: "POST", body: {} }),
    remove: (id) => call("views/" + encodeURIComponent(id), { method: "DELETE" }),
  },
  // Compliance workspace: loans, leases, service agreements, resolutions,
  // licences and SECP filings, plus the workflow records Legal creates against
  // them. Every one of these is permission-gated on the server.
  compliance: {
    config: () => call("compliance/config"),
    entities: () => call("compliance/entities"),
    /* What the compliance estate currently owes somebody, and who it is routed
       to. GET reports; POST raises the in-app notifications (idempotent). */
    reminders: () => call("compliance/reminders"),
    raiseReminders: () => call("compliance/reminders", { method: "POST", body: {} }),
    sources: () => call("compliance/sources"),
    activity: (limit) => call("compliance/activity" + (limit ? "?limit=" + encodeURIComponent(limit) : "")),
    document: (id) => call("compliance/document/" + encodeURIComponent(id)),

    loans: () => call("compliance/loans"),
    loan: (id) => call("compliance/loans/" + encodeURIComponent(id)),
    loanAction: (id, body) => call("compliance/loans/" + encodeURIComponent(id) + "/actions", { method: "POST", body }),
    repayment: (id, body) => call("compliance/loans/" + encodeURIComponent(id) + "/repayments", { method: "POST", body }),

    leases: () => call("compliance/leases"),
    lease: (id) => call("compliance/leases/" + encodeURIComponent(id)),
    leaseAction: (id, body) => call("compliance/leases/" + encodeURIComponent(id) + "/actions", { method: "POST", body }),

    services: () => call("compliance/services"),
    service: (id) => call("compliance/services/" + encodeURIComponent(id)),
    serviceAction: (id, body) => call("compliance/services/" + encodeURIComponent(id) + "/actions", { method: "POST", body }),

    resolutions: () => call("compliance/resolutions"),
    resolution: (id) => call("compliance/resolutions/" + encodeURIComponent(id)),
    resolutionEntity: (key) => call("compliance/resolutions/entity/" + encodeURIComponent(key)),
    resolutionEntityDocuments: (key) => call("compliance/resolutions/entity/" + encodeURIComponent(key) + "/documents"),
    // Approved templates and the signatory rule for this entity's legal form.
    resolutionTemplates: (entityKey) => call("compliance/resolutions/templates?entity=" + encodeURIComponent(entityKey || "")),
    createResolution: (body) => call("compliance/resolutions", { method: "POST", body }),

    licences: () => call("compliance/licences"),
    licence: (id) => call("compliance/licences/" + encodeURIComponent(id)),
    licenceRenewal: (id, body) => call("compliance/licences/" + encodeURIComponent(id) + "/applications", { method: "POST", body }),
    // A LegalOS-held correction to a Drive-derived licence. Drive is untouched.
    editLicence: (id, fields, reason) => call("compliance/licences/" + encodeURIComponent(id), { method: "PATCH", body: { fields, reason } }),
    newLicence: (body) => call("compliance/licences/applications", { method: "POST", body }),

    secp: {
      overview: (fy) => call("compliance/secp/overview" + (fy ? "?fy=" + encodeURIComponent(fy) : "")),
      filings: (q) => call("compliance/secp/filings" + (q ? "?" + q : "")),
      createFiling: (body) => call("compliance/secp/filings", { method: "POST", body }),
      setStatus: (id, body) => call("compliance/secp/filings/" + encodeURIComponent(id) + "/status", { method: "POST", body }),
      entity: (key) => call("compliance/secp/entity/" + encodeURIComponent(key)),
      years: (q) => call("compliance/secp/years" + (q ? "?" + q : "")),
      year: (id) => call("compliance/secp/years/" + encodeURIComponent(id)),
      // The statutory estate built from the Drive folder tree: the entity-year
      // records, the event-triggered filings and the entity-level registers.
      annual: (q) => call("compliance/secp/annual" + (q ? "?" + q : "")),
      annualRecord: (id) => call("compliance/secp/annual/" + encodeURIComponent(id)),
      events: (q) => call("compliance/secp/events" + (q ? "?" + q : "")),
      registers: (q) => call("compliance/secp/registers" + (q ? "?" + q : "")),
      // System-generated future obligations — deliberately a separate call so
      // no screen can render them alongside Drive-backed history by accident.
      upcoming: (q) => call("compliance/secp/upcoming" + (q ? "?" + q : "")),
    },

    record: (id) => call("compliance/records/" + encodeURIComponent(id)),
    updateRecord: (id, body) => call("compliance/records/" + encodeURIComponent(id), { method: "PATCH", body }),
    transition: (id, body) => call("compliance/records/" + encodeURIComponent(id) + "/transition", { method: "POST", body }),
    signatories: (id, signatories) => call("compliance/records/" + encodeURIComponent(id) + "/signatories", { method: "POST", body: { signatories } }),
    requestSignature: (id, method) => call("compliance/records/" + encodeURIComponent(id) + "/signature", { method: "POST", body: { method } }),
    markSigned: (id, index, status, signedDate) => call("compliance/records/" + encodeURIComponent(id) + "/signature/" + index, { method: "POST", body: { status, signedDate } }),
    driveFiling: (id, body) => call("compliance/records/" + encodeURIComponent(id) + "/drive", { method: "POST", body }),
    attach: (id, body) => call("compliance/records/" + encodeURIComponent(id) + "/documents", { method: "POST", body }),
    generate: (id, body) => call("compliance/records/" + encodeURIComponent(id) + "/generate", { method: "POST", body }),
    documentUrl: (id, docId) => API_BASE + "compliance/records/" + encodeURIComponent(id) + "/documents/" + encodeURIComponent(docId),
    templates: (type, subtype) => call("compliance/templates?type=" + encodeURIComponent(type || "") + "&subtype=" + encodeURIComponent(subtype || "")),
    templateRegistry: (family) => call("compliance/templates/registry" + (family ? "?family=" + encodeURIComponent(family) : "")),
  },

  me: () => call("me"),
  // Credential sign-in. The session rides an HttpOnly cookie the browser
  // attaches on its own — nothing secret is ever readable from script.
  auth: {
    /* Sign in with Google. The browser never decides anything — it hands the
       ID token over and the server verifies it and applies the legal-team
       gate. `config` tells the login page whether to draw the button. */
    google: (credential) => call("auth/google", { method: "POST", body: { credential } }),
    config: () => call("auth/config"),
    login: (email, password) => call("auth/login", { method: "POST", body: { email, password } }),
    logout: () => call("auth/logout", { method: "POST" }),
    session: () => call("auth/session"),
  },
  // Users & Access management (admin-only endpoints, enforced server-side).
  /* The legal division chart: who heads each division, who is in it, who the
     points of contact are, and which matter categories route where. Read by
     anyone signed in (a requester has to be able to learn who their POC is);
     written only by an administrator. */
  /* Companies — the primary compliance object. One call assembles a company
     from every register the caller may read, plus the statutory estate; the
     server says which families it withheld rather than showing them as zero. */
  companies: {
    list: () => call("companies"),
    structure: () => call("companies/structure"),
    get: (key) => call("companies/" + encodeURIComponent(key)),
  },
  divisions: {
    list: () => call("divisions"),
    save: (payload) => call("divisions", { method: "POST", body: payload }),
  },
  access: {
    users: () => call("access/users"),
    roles: () => call("access/roles"),
    audit: () => call("access/audit"),
    updateUser: (id, patch) => call("access/user/" + encodeURIComponent(id), { method: "POST", body: patch }),
  },
  // Legal request intake. The requester portal POSTs here so the request exists
  // on the SERVER — which is what puts it in Legal's triage queue rather than
  // in one person's browser. The server scopes the GET: Legal reads the whole
  // queue, a requester reads only their own.
  /* ARCHIVING — off the working book, not deleted. Works for a record raised
     here and for a row that came out of a Drive workbook alike, because the
     state is an overlay rather than a column. */
  archive: {
    list: (family) => call("archive" + (family ? "?family=" + encodeURIComponent(family) : "")),
    add: (family, id, reason) => call("archive", { method: "POST", body: { family, id, reason } }),
    remove: (family, id) => call("archive/" + encodeURIComponent(family) + "/" + encodeURIComponent(id), { method: "DELETE" }),
  },
  requests: {
    list: (withDeleted) => call("requests" + (withDeleted ? "?deleted=1" : "")),
    create: (record) => call("requests", { method: "POST", body: record }),
    /* Withdraw a request you raised before anyone has picked it up. The server
       decides; a refusal comes back 409 with the reason to show. */
    remove: (id, reason) => call("requests/" + encodeURIComponent(id), { method: "DELETE", body: { reason } }),
    restore: (id) => call("requests/" + encodeURIComponent(id) + "/restore", { method: "POST", body: {} }),
    patch: (id, changes) => call("requests/" + encodeURIComponent(id), { method: "POST", body: changes }),
    /* A document attached to a request is stored on the LegalOS server -- never
       written to Drive -- and read back in-app through its own url. */
    /* What is ACTUALLY on the request, from the server -- the browser's own
       copy of a request can be stale. */
    attachments: (id) => call("requests/" + encodeURIComponent(id) + "/attachments"),
    attach: (id, file) => call("requests/" + encodeURIComponent(id) + "/attachments", { method: "POST", body: file }),
    /* Put the bytes back on a row that was recorded without them. */
    replaceAttachment: (id, attId, file) =>
      call("requests/" + encodeURIComponent(id) + "/attachments/" + encodeURIComponent(attId) + "/replace",
        { method: "POST", body: file }),
    /* Read a Word/Excel attachment in the app rather than downloading it. */
    attachmentRenderUrl: (id, attId) =>
      API_BASE + "requests/" + encodeURIComponent(id) + "/attachments/" + encodeURIComponent(attId) + "/render",
    attachmentUrl: (id, attId) =>
      API_BASE + "requests/" + encodeURIComponent(id) + "/attachments/" + encodeURIComponent(attId),
  },
  notifications: {
    list: () => call("notifications"),
    raise: (notifications) => call("notifications", { method: "POST", body: { notifications } }),
    markRead: () => call("notifications/read", { method: "POST" }),
  },
  configProposals: {
    list: () => call("config-proposals"),
    propose: (body) => call("config-proposals", { method: "POST", body }),
    decide: (id, decision) => call("config-proposals/" + encodeURIComponent(id) + "/decision", { method: "POST", body: { decision } }),
  },

  knowledge: {
    tree: () => call("knowledge/tree"),
    files: (folder, root) => call("knowledge/files?folder=" + encodeURIComponent(folder || "") + "&root=" + encodeURIComponent(root || "")),
    search: (q, limit = 60) => call("knowledge/search?q=" + encodeURIComponent(q || "") + "&limit=" + limit),
    // Which of THESE documents mention the phrase — Drive's own full-text index,
    // scoped to one contract's files.
    matches: (q, ids) => call("knowledge/matches?q=" + encodeURIComponent(q || "") + "&ids=" + encodeURIComponent((ids || []).slice(0, 40).join(","))),
    refresh: () => call("knowledge/refresh", { method: "POST" }),
    fileUrl: (id) => API_BASE + "knowledge/file/" + encodeURIComponent(id),
    // The Pakistan Contract Templates library — real Drive template documents,
    // grouped by category (the immediate subfolder). Powers /templates.
    templates: () => call("knowledge/templates"),
  },
  /* The Claude assistant. Answers over the registers this account may already
     read, from structured facts only — the bodies of documents are never sent,
     so it can tell you which leases expire in March and cannot tell you what
     clause 7 says. */
  /* The Commercial review queue — the documents automation deliberately would
     not decide, with the evidence a reviewer needs to decide them. */
  // Projects that exist only in Drive — a folder and documents, no tracker row.
  projectOnly: () => call("commercial/project-only"),

  commercialReview: {
    list: () => call("commercial/review"),
    decide: (fileId, decision, project, reason) =>
      call("commercial/review/decide", { method: "POST", body: { fileId, decision, project, reason } }),
  },

  assistant: {
    status: () => call("assistant/status"),
    // One record, summarised from its fields and its documents' metadata.
    record: (family, id, ask) => call("assistant/record", { method: "POST", body: { family, id, ask } }),
    readerStatus: () => call("assistant/reader/status"),
    ask: (question, families) => call("assistant/ask", {
      method: "POST",
      body: { question, families: families || "" },
    }),
  },

  // The trackers, normalised into records. These are what the Contracts,
  // Litigation and Compliance modules read instead of their seed data.
  registers: {
    summary: () => call("registers"),
    list: (key, { q = "", limit = 500, offset = 0 } = {}) =>
      call("registers/" + encodeURIComponent(key) +
        "?limit=" + limit + "&offset=" + offset + (q ? "&q=" + encodeURIComponent(q) : "")),
    refresh: () => call("registers/refresh", { method: "POST" }),
    coverage: () => call("registers/coverage"),
    health: () => call("registers/health"),
    // Which contracts have a scanned copy whose TEXT contains the phrase.
    docmatches: (q) => call("registers/docmatches?q=" + encodeURIComponent(q || "")),
  },

  /* Raising and running a litigation case. The Drive trackers stay the source
     of truth for everything already in them; this is how a case that starts
     here reaches the server instead of one person's browser.
     Every entry point uses these — there is no second creation path. */
  /* CONTRACT REQUESTS (CRF-01..09). The schema, the request and its documents.
     Uploads go as raw bytes with the metadata in headers, because base64 in a
     JSON body inflates a 20MB attachment to 27MB of string. */
  crf: {
    types: () => call("contract-requests/schema"),
    schema: (type) => call("contract-requests/schema?type=" + encodeURIComponent(type)),
    list: () => call("contract-requests"),
    create: (type, department) => call("contract-requests", { method: "POST", body: { type, department } }),
    get: (id) => call("contract-requests/" + encodeURIComponent(id)),
    patch: (id, section, value) => call("contract-requests/" + encodeURIComponent(id), { method: "PATCH", body: { section, value } }),
    changeType: (id, type, confirm) => call("contract-requests/" + encodeURIComponent(id) + "/type", { method: "POST", body: { type, confirm } }),
    submit: (id) => call("contract-requests/" + encodeURIComponent(id) + "/submit", { method: "POST", body: {} }),
    hod: (id, approve, comment) => call("contract-requests/" + encodeURIComponent(id) + "/hod", { method: "POST", body: { approve, comment } }),
    finance: (id, approve, comment) => call("contract-requests/" + encodeURIComponent(id) + "/finance", { method: "POST", body: { approve, comment } }),
    legalReturn: (id, body) => call("contract-requests/" + encodeURIComponent(id) + "/return", { method: "POST", body }),
    accept: (id, assignee, targetDate) => call("contract-requests/" + encodeURIComponent(id) + "/accept", { method: "POST", body: { assignee, targetDate } }),
    setTarget: (id, targetDate) => call("contract-requests/" + encodeURIComponent(id) + "/target", { method: "POST", body: { targetDate } }),
    escalate: (id, reason) => call("contract-requests/" + encodeURIComponent(id) + "/escalate", { method: "POST", body: { reason } }),
    deescalate: (id, note) => call("contract-requests/" + encodeURIComponent(id) + "/deescalate", { method: "POST", body: { note } }),
    setStatus: (id, status, note) => call("contract-requests/" + encodeURIComponent(id) + "/status", { method: "POST", body: { status, note } }),
    remarks: (id, remarks) => call("contract-requests/" + encodeURIComponent(id) + "/remarks", { method: "POST", body: { remarks } }),
    message: (id, text) => call("contract-requests/" + encodeURIComponent(id) + "/messages", { method: "POST", body: { text } }),
    documents: (id, history) => call("contract-requests/" + encodeURIComponent(id) + "/documents" + (history ? "?history=1" : "")),
    draftTemplates: (id) => call("contract-requests/" + encodeURIComponent(id) + "/draft-templates"),
    draftPreview: (id, templateId) => call("contract-requests/" + encodeURIComponent(id)
      + "/draft-preview?template=" + encodeURIComponent(templateId)),
    generateDraft: (id, templateId) => call("contract-requests/" + encodeURIComponent(id) + "/draft",
      { method: "POST", body: { templateId } }),
    removeDocument: (id, docId) => call("contract-requests/" + encodeURIComponent(id) + "/documents/" + encodeURIComponent(docId), { method: "DELETE", body: {} }),
    async uploadDocument(id, file, opts) {
      const o = opts || {};
      const res = await fetch(API_BASE + "contract-requests/" + encodeURIComponent(id) + "/documents", {
        method: "POST", credentials: "same-origin",
        headers: Object.assign({
          "content-type": file.type || "application/octet-stream",
          "x-filename": encodeURIComponent(file.name),
        }, o.docType ? { "x-doc-type": encodeURIComponent(o.docType) } : {},
        o.internal ? { "x-visibility": "INTERNAL_LEGAL" } : {},
        o.annexure ? { "x-annexure": encodeURIComponent(o.annexure) } : {},
        o.replacesId ? { "x-replaces": o.replacesId } : {}),
        body: file,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(body.detail || body.error || "upload failed"); e.payload = body; throw e; }
      return body;
    },
    docUrl: (docId, what) => API_BASE + "request-documents/" + encodeURIComponent(docId) + "/" + (what || "preview"),
    reconcile: () => call("request-documents/reconcile"),
  },

  litigation: {
    meta: () => call("litigation/meta"),
    list: () => call("litigation/cases"),
    get: (id) => call("litigation/cases/" + encodeURIComponent(id)),
    create: (body) => call("litigation/cases", { method: "POST", body }),
    patch: (id, body) => call("litigation/cases/" + encodeURIComponent(id), { method: "PATCH", body }),
    addEvent: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/events", { method: "POST", body }),
    close: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/close", { method: "POST", body }),
    reopen: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/reopen", { method: "POST", body }),
    /* THE DECISION. Works on every case, including the 357 that come from the
       Drive trackers and have no row in the case store — those had no way to
       record an outcome at all, which is why the whole book reported "outcome
       not recorded". Never inferred: this is the only writer of outcomeCode. */
    decision: (id) => call("litigation/cases/" + encodeURIComponent(id) + "/decision"),
    recordDecision: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/decision", { method: "POST", body }),
    clearDecision: (id) => call("litigation/cases/" + encodeURIComponent(id) + "/decision", { method: "DELETE" }),
    /* The operational services. Every one of these is the SAME server-side
       domain service the assistant calls — there is no UI-only shortcut. */
    addHearing: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/hearings", { method: "POST", body }),
    updateHearing: (id, hid, body) => call("litigation/cases/" + encodeURIComponent(id) + "/hearings/" + encodeURIComponent(hid), { method: "PATCH", body }),
    addDeadline: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/deadlines", { method: "POST", body }),
    completeDeadline: (id, did, body) => call("litigation/cases/" + encodeURIComponent(id) + "/deadlines/" + encodeURIComponent(did), { method: "PATCH", body }),
    addParty: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/parties", { method: "POST", body }),
    removeParty: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/remove-party", { method: "POST", body }),
    assignCounsel: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/counsel", { method: "POST", body }),
    /* Soft-delete with a reason; the creator and the history are kept. */
    deleteCase: (id, reason) => call("litigation/cases/" + encodeURIComponent(id) + "/delete", { method: "POST", body: { reason } }),
    restoreCase: (id) => call("litigation/cases/" + encodeURIComponent(id) + "/restore", { method: "POST", body: {} }),
    attachDocuments: (id, documents) => call("litigation/cases/" + encodeURIComponent(id) + "/documents", { method: "POST", body: { documents } }),
    ask: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/ask", { method: "POST", body }),
    respond: (id, askId, body) => call("litigation/cases/" + encodeURIComponent(id) + "/ask/" + encodeURIComponent(askId), { method: "POST", body }),
    addNote: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/notes", { method: "POST", body }),
    /* Which cases a contract, notice, request or project gave rise to. */
    bySource: (type, id) => call("litigation/by-source?type=" + encodeURIComponent(type) + "&id=" + encodeURIComponent(id)),
    duplicates: (body) => call("litigation/duplicates", { method: "POST", body }),
    prefill: (from, id) => call("litigation/prefill?from=" + encodeURIComponent(from) + "&id=" + encodeURIComponent(id)),
    /* What the team is in court for, this week and next. Derived from the
       cases every time it is asked for. */
    causeList: () => call("litigation/cause-list"),
    /* What is due across the register: hearings coming up, outcomes not
       recorded, witness lists. POST raises them as in-app notifications. */
    reminders: () => call("litigation/reminders"),
    /* Legal spend: case invoices and firm retainers, per currency. */
    /* The weekly report for a date range, with a draft assembled from the
       records. Nothing in it is inferred. */
    report: (from, to) => call("litigation/report?from=" + encodeURIComponent(from || "") + "&to=" + encodeURIComponent(to || "")),
    spend: (q) => call("litigation/spend" + (q ? "?" + new URLSearchParams(q).toString() : "")),
    retainers: () => call("litigation/retainers"),
    addRetainer: (body) => call("litigation/retainers", { method: "POST", body }),
    addInvoice: (id, body) => call("litigation/cases/" + encodeURIComponent(id) + "/invoices", { method: "POST", body }),
    raiseReminders: () => call("litigation/reminders", { method: "POST", body: {} }),
    /* The Developer Disputes tracker, as the team keeps it in Drive. */
    /* The trademark estate, from the tracker in the litigation root. */
    /* Records raised in LegalOS inside a tracker-backed module. */
    moduleRecords: (mod, withDeleted) => call("litigation/module/" + mod + "/records" + (withDeleted ? "?deleted=1" : "")),
    /* Remove YOUR OWN record, at an opening stage, with a reason. The server
       decides whether that is allowed — this is a request, not a permission. */
    removeModuleRecord: (mod, id, reason) =>
      call("litigation/module/" + mod + "/records/" + encodeURIComponent(id), { method: "DELETE", body: { reason } }),
    restoreModuleRecord: (mod, id) =>
      call("litigation/module/" + mod + "/records/" + encodeURIComponent(id) + "/restore", { method: "POST", body: {} }),
    createModuleRecord: (mod, fields) => call("litigation/module/" + mod + "/records", { method: "POST", body: { fields } }),
    updateModuleRecord: (mod, id, fields) => call("litigation/module/" + mod + "/records/" + encodeURIComponent(id), { method: "PATCH", body: { fields } }),
    /* DELETIONS ARE REQUESTS. Nothing here removes a record; it asks the head
       of that module's team to. See api/deletion-approvals.js. */
    deletions: (q) => call("deletions" + (q || "")),
    requestDeletion: (moduleKey, recordId, label, reason) =>
      call("deletions", { method: "POST", body: { module: moduleKey, recordId, label, reason } }),
    decideDeletion: (id, approve, note) =>
      call("deletions/" + encodeURIComponent(id) + "/decide", { method: "POST", body: { approve, note } }),
    withdrawDeletion: (id) =>
      call("deletions/" + encodeURIComponent(id) + "/withdraw", { method: "POST", body: {} }),
    /* Asset recovery: unreturned company property and negative final
       settlements, from the workbook in the litigation root. */
    /* Every item in the litigation Drive root and what became of it. */
    ledger: () => call("litigation/ledger"),
    assetRecovery: (refresh) => call("litigation/asset-recovery" + (refresh ? "?refresh=1" : "")),
    ipPortfolio: (refresh) => call("litigation/ip-portfolio" + (refresh ? "?refresh=1" : "")),
    developerDisputes: (refresh) => call("litigation/developer-disputes" + (refresh ? "?refresh=1" : "")),
    drafts: () => call("litigation/drafts"),
    saveDraft: (body) => call("litigation/drafts", { method: "POST", body }),
    dropDraft: (id) => call("litigation/drafts/" + encodeURIComponent(id), { method: "DELETE" }),
    uploadUrl: (uploadId) => API_BASE + "litigation/upload/" + encodeURIComponent(uploadId),
    /* The file goes up as RAW BYTES with the name in a header. The shared JSON
       body reader caps at 256KB, which a scanned petition passes on page two. */
    extract: async (file) => {
      const res = await fetch(API_BASE + "litigation/extract", {
        method: "POST", credentials: "same-origin",
        headers: { "x-filename": file.name, "content-type": "application/octet-stream" },
        body: file,
      });
      const j = await res.json().catch(() => ({ error: "bad_response" }));
      if (!res.ok) { const e = new Error(j.detail || j.error || "HTTP " + res.status); e.payload = j; throw e; }
      return j;
    },
  },
  mail: {
    status: () => call("mail/status"),
    log: () => call("mail/log"),
    verify: () => call("mail/verify", { method: "POST" }),
    send: (msg) => call("mail/send", { method: "POST", body: msg }),
  },
};

// The server is the authority on identity. This resolves once and is cached,
// so the shell can show WHO CLOUDFLARE SAYS YOU ARE alongside the prototype's
// View As switcher — the two are not the same thing and should not look it.
let principalPromise = null;
export function serverPrincipal() {
  if (!principalPromise) {
    principalPromise = api.me().then((r) => r.principal).catch(() => null);
  }
  return principalPromise;
}
