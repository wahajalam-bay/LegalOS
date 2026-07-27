// NORTH STAR — the workflow-spine model.
//
// The GC's complaint was that the portal showed only OUTPUTS. This module turns
// any Request / Matter / Contract record into the four traversable zones:
//
//   INPUT         where it came from — form fields, documents (+ OCR/extracted
//                 fields), the entity, the prior contract, the requester
//   PROCESS       the ordered lifecycle stages: status, accountable owner (who
//                 holds the ball NOW), entry/exit criteria, in/out timestamps,
//                 the stage TAT clock, and the artifacts the stage produced
//   OUTPUT        drafts, executed documents, obligations, the repository entry,
//                 the drive link, the tracker row, and the analytics it feeds
//   RELATIONSHIPS everything connected, every item click-through
//
// Pure model code — no React. spine.js renders what this returns.
import {
  LIFECYCLE_PATHS, lifecyclePathFor, stageMeta, STAGE_META, riskGatesFor,
  entityById, entityName, nameOf, byId, subdivisionOf, categoryOf,
  REVIEWS, APPROVALS, LITIGATION, TEMPLATES, contractTypeMeta,
} from "./data.js";
import { computeTat, fixTat, workingDaysBetween, addWorkingDays } from "./tat.js";

// Request types whose linked contract is a PRE-EXISTING contract being worked
// on (rather than one this request will produce).
export const ATTACHING_TYPES = new Set(["Amendment", "Revision", "Extension", "Termination"]);

// An actor is either an internal user (u*) or a portal requester (RQ-*). This
// module stays pure — no store import — so the requester roster arrives via ctx.
function actorName(id, ctx = {}) {
  if (!id) return "Unassigned";
  if (String(id).startsWith("RQ-")) {
    const r = (ctx.requesters || []).find((x) => x.id === id);
    return r ? r.name : id;
  }
  return nameOf(id);
}
function actorRole(id, ctx = {}) {
  if (!id) return "";
  if (String(id).startsWith("RQ-")) {
    const r = (ctx.requesters || []).find((x) => x.id === id);
    return r ? `${r.department || "Business"}${r.source ? " · " + r.source : ""}` : "Requester";
  }
  return (byId(id) || {}).role || "";
}

/* ---------------- identity: one record, two faces ---------------- */
// A legal request and its matter are the SAME continuous object (Workstream A).
// `resolveRecord` accepts any of the three ids and returns the whole cluster.
export function resolveRecord(id, ctx = {}) {
  const requests = ctx.requests || [];
  const matters = ctx.matters || [];
  const contracts = ctx.contracts || [];

  let request = requests.find((r) => r.id === id) || null;
  let matter = matters.find((m) => m.id === id) || null;
  let contract = contracts.find((c) => c.id === id) || null;

  // Walk the links so any entry point resolves the full cluster.
  if (request && !matter && request.matterId) matter = matters.find((m) => m.id === request.matterId) || null;
  if (matter && !request) request = requests.find((r) => r.id === matter.requestId || r.matterId === matter.id) || null;
  if (!contract) {
    const linked = (request && request.linkedContractId) || null;
    if (linked) contract = contracts.find((c) => c.id === linked) || null;
  }
  if (contract && !request) request = requests.find((r) => r.linkedContractId === contract.id) || null;

  const primary = request || matter || contract;
  if (!primary) return null;
  const kind = request ? "request" : matter ? "matter" : "contract";
  return { id, kind, primary, request, matter, contract };
}

// The unified worklist: one row per logical record. A request that has been
// triaged into a matter appears ONCE, carrying both faces.
export function unifiedRows(requests = [], matters = []) {
  const rows = requests.map((r) => {
    const matter = r.matterId ? matters.find((m) => m.id === r.matterId) : matters.find((m) => m.requestId === r.id);
    return {
      key: r.id,
      id: r.id,
      requestId: r.id,
      matterId: matter ? matter.id : r.matterId || null,
      request: r,
      matter: matter || null,
      // The working face wins for status/owner once a matter exists.
      title: r.title,
      face: matter ? "matter" : "request",
      record: matter ? { ...r, ...pickMatterFace(matter) } : r,
    };
  });
  // Matters opened directly (no intake request) are first-class rows too.
  const claimed = new Set(rows.map((x) => x.matterId).filter(Boolean));
  matters.forEach((m) => {
    if (claimed.has(m.id)) return;
    if (m.requestId && requests.some((r) => r.id === m.requestId)) return;
    rows.push({ key: m.id, id: m.id, requestId: null, matterId: m.id, request: null, matter: m, title: m.title, face: "matter", record: m });
  });
  return rows;
}
// Fields where the matter (working face) supersedes the request (intake face).
function pickMatterFace(m) {
  return { status: m.status, stage: m.stage, owner: m.owner, progress: m.progress, risk: m.risk, priority: m.priority };
}

/* ---------------- PROCESS: the stage rail ---------------- */
// Nominal weight per stage (relative effort) — used to distribute a record's
// elapsed span across its completed stages so every record has coherent
// in/out timestamps even without an explicit stageLog.
const STAGE_WEIGHT = {
  "Intake": 1, "Triage": 1, "Commercial Review": 3, "Legal Review": 5, "Drafting": 4,
  "Redlining": 3, "Notice Drafting": 2, "Negotiation": 7, "Approval": 3, "Signature": 2,
  "Notice Served": 1, "Executed": 1, "Repository": 1, "Closed": 1,
};
const weightOf = (s) => STAGE_WEIGHT[s] || 2;

// Board/lifecycle status → stage, for records that predate the stage field.
const STATUS_STAGE = {
  "New": "Intake", "Intake": "Intake", "Open": "Triage", "Triage": "Triage",
  "In Review": "Legal Review", "Under Review": "Legal Review", "Legal Review": "Legal Review",
  "Business Review": "Commercial Review", "Escalated": "Legal Review",
  "Drafting": "Drafting", "Negotiation": "Negotiation", "In Negotiation": "Negotiation",
  "Pending Approval": "Approval", "Approval": "Approval", "Awaiting Signature": "Signature",
  "Approved": "Executed", "Executed": "Executed", "Signed": "Executed", "Active": "Repository",
  "Completed": "Repository", "Closed": "Closed", "Expiring": "Repository", "Renewal": "Repository",
  "Terminated": "Closed", "Archived": "Closed",
};

// Two signals can disagree — an explicit `stage` and the board `status`. This
// matters for stores written before the stage field existed: the merge backfills
// `stage` from the seed while the user's `status` has moved on. Take whichever
// is FURTHER along, so the record is never shown as less progressed than it is.
export function currentStageOf(rec = {}) {
  const path = lifecyclePathFor(rec.requestType);
  const last = path.length - 1;
  if (rec.progress === 100) return path[last];

  // Resolve each signal independently — a stage value that happens to be a key
  // in STATUS_STAGE must not shadow the status reading.
  const idxOf = (name) => (name && path.includes(name) ? path.indexOf(name) : -1);
  const fromStage = Math.max(idxOf(rec.stage), idxOf(STATUS_STAGE[rec.stage]));
  const fromStatus = idxOf(STATUS_STAGE[rec.status]);

  const idx = Math.max(fromStage, fromStatus);
  if (idx >= 0) return path[idx];
  return path[Math.min(1, last)];
}

// The resolved stage list: state, owner, ball, criteria, clock, artifacts.
export function buildStages(rec = {}, ctx = {}, now = new Date()) {
  const path = lifecyclePathFor(rec.requestType);
  const current = currentStageOf(rec);
  const idx = Math.max(0, path.indexOf(current));
  const gates = riskGatesFor(rec.risk);

  const startIso = rec.requestDate || rec.created || rec.opened || rec.start || now.toISOString();
  const start = new Date(startIso).getTime();
  const nowMs = now.getTime();
  const span = Math.max(86400000, nowMs - start);

  // Distribute the elapsed span across the completed stages by weight, so the
  // current stage's entry time (and therefore days-in-stage) is deterministic.
  const upto = path.slice(0, idx + 1).map(weightOf);
  const totalW = upto.reduce((s, w) => s + w, 0) || 1;
  const doneW = upto.slice(0, idx).reduce((s, w) => s + w, 0);
  const doneSpan = span * (doneW / totalW);

  const explicit = new Map((rec.stageLog || []).map((s) => [s.stage, s]));
  let cursor = start;

  return path.map((name, i) => {
    const meta = stageMeta(name);
    const state = i < idx ? "done" : i === idx ? (rec.blockedOn ? "blocked" : "active") : "pending";

    let enteredAt = null, exitedAt = null;
    const ex = explicit.get(name);
    if (ex) {
      enteredAt = ex.enteredAt || null;
      exitedAt = ex.exitedAt || null;
      if (enteredAt) cursor = new Date(enteredAt).getTime();
      if (exitedAt) cursor = new Date(exitedAt).getTime();
    } else if (i < idx) {
      const slice = doneSpan * (weightOf(name) / (doneW || 1));
      enteredAt = new Date(cursor).toISOString();
      cursor += slice;
      exitedAt = new Date(cursor).toISOString();
    } else if (i === idx) {
      enteredAt = new Date(start + doneSpan).toISOString();
      exitedAt = null;
    }

    // Accountability has two distinct readings and the spine shows both:
    //   ballWith / holderName — who HOLDS it at this stage (drives the TAT pause:
    //                           legal is not charged for time it cannot spend)
    //   owner / ownerName     — the accountable internal owner either way
    const ballWith = (ex && ex.ballWith) || meta.ball;
    const owner = (ex && ex.owner) || ownerForStage(name, rec, gates);
    const requester = rec.requesterId || rec.requester;
    const holderName = ballWith === "counterparty" ? (rec.counterparty || "Counterparty")
      : ballWith === "business" ? (requester ? actorName(requester, ctx) : (rec.department || rec.dept || "Business"))
      : (owner ? nameOf(owner) : "Legal");
    const daysIn = enteredAt ? workingDaysBetween(enteredAt, exitedAt || now) : 0;

    return {
      name,
      icon: meta.icon,
      state,
      role: meta.role,
      owner,
      ownerName: owner ? actorName(owner, ctx) : "—",
      ballWith,
      holderName,
      waitingOn: state === "blocked" ? rec.blockedOn : (state === "active" ? ballWith : null),
      entry: meta.entry,
      exit: meta.exit,
      enteredAt,
      exitedAt,
      daysIn,
      artifacts: artifactsForStage(name, rec, ctx, meta),
      // Risk-based depth is surfaced on the review/approval gates (Workstream H).
      gate: name === "Legal Review" ? { kind: "review", depth: gates.depth, people: gates.reviewers }
        : name === "Approval" ? { kind: "approval", depth: `${gates.approvers.length}-step chain for ${(rec.risk || "medium").toLowerCase()} risk`, people: gates.approvers.map(nameOf) }
        : null,
    };
  });
}

function ownerForStage(name, rec, gates) {
  if (name === "Intake") return rec.requesterId || rec.requester || null;
  if (name === "Commercial Review") return rec.requesterId || rec.requester || null;
  if (name === "Approval") return gates.approvers[gates.approvers.length - 1];
  if (name === "Signature" || name === "Negotiation") return rec.owner || null;
  return rec.owner || null;
}

// What each stage actually produced — seeded meta plus real linked records.
function artifactsForStage(name, rec, ctx, meta) {
  const out = [];
  const docs = (ctx.repository || []).filter((d) => d.contractId && (d.contractId === rec.id || d.contractId === rec.linkedContractId));
  const contract = ctx.contract || null;

  if (name === "Intake") {
    (rec.attachments || []).forEach((a) => out.push({ label: a.name, kind: "file", meta: `${a.kind || "Attachment"} · ${a.sizeKb || "—"} KB` }));
    docs.filter((d) => d.source === "Upload" || d.source === "Scan").slice(0, 2).forEach((d) => out.push({ label: d.name, kind: "doc", to: "/repository/" + d.id, meta: `${d.source} · OCR ${Math.round((d.ocrConfidence || 0) * 100)}%` }));
  }
  if (name === "Triage" && rec.tat) out.push({ label: `TAT fixed — ${rec.tat.days} working days`, kind: "tat", meta: rec.tat.basis });
  if (name === "Negotiation" && contract && (contract.rounds || []).length) {
    out.push({ label: `${contract.rounds.length} negotiation rounds`, kind: "rounds", to: "/negotiations", meta: `Latest: ${contract.rounds[contract.rounds.length - 1].versionLabel}` });
  }
  if (name === "Legal Review") {
    (ctx.reviews || REVIEWS).filter((r) => r.contract === (rec.linkedContractId || rec.id) || r.title === rec.title).slice(0, 2)
      .forEach((r) => out.push({ label: r.title, kind: "review", to: "/reviews", meta: `${r.flagged} AI flags · ${r.status}` }));
  }
  if (name === "Drafting" || name === "Redlining" || name === "Notice Drafting") {
    const tpl = templateFor(rec);
    if (tpl) out.push({ label: `${tpl.title} ${tpl.version ? "v" + tpl.version : ""}`, kind: "template", to: "/templates", meta: "Approved template version used" });
  }
  if (name === "Approval") {
    // Match the approvals queue on shared title tokens (no fuzzy AI needed).
    const toks = String(rec.title || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
    (ctx.approvals || APPROVALS)
      .filter((a) => { const m = String(a.matter || "").toLowerCase(); return toks.some((w) => m.includes(w)); })
      .slice(0, 2)
      .forEach((a) => out.push({ label: `${a.type} — ${a.role}`, kind: "approval", to: "/approvals", meta: a.status }));
  }
  if (name === "Repository" || name === "Executed") {
    docs.slice(0, 3).forEach((d) => out.push({ label: d.name, kind: "doc", to: "/repository/" + d.id, meta: `Sr No ${d.srNo} · ${d.officeLocation}` }));
    if (contract) out.push({ label: "Tracker row " + contract.id, kind: "tracker", to: "/tracker", meta: `Sr No ${contract.srNo} · ${contract.physicalRecordRef}` });
  }
  // Fall back to the stage's nominal artifact names so pending stages still
  // tell the GC what the stage WILL produce.
  if (!out.length) meta.artifacts.forEach((a) => out.push({ label: a, kind: "planned", meta: "Produced at this stage" }));
  return out;
}

function templateFor(rec) {
  const ct = rec.contractType || "";
  const map = {
    "NDA / MoU / LOI": "T-01", "Vendor MSA": "T-06", "Employment": "T-04",
    "Ejar Lease": "T-07", "Tenancy": "T-07", "License": "T-01",
    "Development / JV": "T-11", "Marketing & Listing": "T-02", "SLA": "T-02",
    "Construction": "T-02", "PPA": "T-07", "SPA": "T-02", "Land / Plot Purchase": "T-07",
    "Musataha": "T-07", "Off-plan / Wafi": "T-07", "Brokerage & Agency": "T-02",
  };
  return TEMPLATES.find((t) => t.id === map[ct]) || null;
}

/* ---------------- the whole spine ---------------- */
// ctx: { requests, matters, contracts, repository, licenses, companies, reviews, approvals }
export function buildSpine(id, ctx = {}, now = new Date()) {
  const cluster = resolveRecord(id, ctx);
  if (!cluster) return null;
  const { request, matter, contract, primary, kind } = cluster;

  // The record the spine reasons over: intake fields from the request, working
  // state from the matter, executed reality from the contract.
  const rec = {
    ...(contract || {}),
    ...(request || {}),
    ...(matter ? pickMatterFace(matter) : {}),
    id: primary.id,
    title: primary.title,
    requestType: (request && request.requestType) || (contract && contract.requestType) || (matter && matter.requestType) || "New",
    contractType: (request && request.contractType) || (contract && contract.contractType) || (matter && matter.contractType) || null,
  };
  if (!rec.tat) rec.tat = fixTat(rec, rec.requestDate || rec.created || rec.opened || rec.start);

  const stages = buildStages(rec, { ...ctx, contract }, now);
  const tat = computeTat(rec, stages, now);
  const entity = entityById(rec.entityId) || null;
  // Documents reach a record two ways: attached to its contract, or uploaded by
  // the requester against the request itself (Sprint 4 portal uploads).
  const reqIds = [request && request.id, matter && matter.requestId, rec.id].filter(Boolean);
  const docs = (ctx.repository || []).filter((d) =>
    d.contractId === rec.id ||
    (rec.linkedContractId && d.contractId === rec.linkedContractId) ||
    (contract && d.contractId === contract.id) ||
    (d.requestId && reqIds.includes(d.requestId)));

  return {
    id: primary.id,
    kind,
    rec,
    request, matter, contract,
    stages,
    tat,
    entity,
    input: buildInput(rec, { request, contract, entity, docs }, ctx),
    output: buildOutput(rec, { contract, docs, stages }, ctx),
    relationships: buildRelationships(rec, { request, matter, contract, entity, docs }, ctx),
  };
}

/* ---------------- zone 1: INPUT ---------------- */
function buildInput(rec, { request, contract, entity, docs }, ctx) {
  const requester = rec.requesterId || rec.requester;
  // "Prior contract it attaches to". For an Amendment/Revision/Extension/
  // Termination the linked contract IS the thing being worked on, so that is
  // what it attaches to; otherwise walk up the contract family to the parent.
  const find = (id) => (ctx.contracts || []).find((c) => c.id === id) || null;
  const parent = ATTACHING_TYPES.has(rec.requestType) && rec.linkedContractId
    ? find(rec.linkedContractId)
    : (contract && contract.parentContractId ? find(contract.parentContractId) : null);
  return {
    // The request-form fields, exactly as captured.
    fields: [
      ["Request date", rec.requestDate || rec.created || rec.opened || rec.start],
      ["Request type", rec.requestType],
      ["Type of contract", rec.contractType || "—"],
      ["Category", categoryOf(rec)],
      ["Legal sub-division", subdivisionOf(rec)],
      ["Company / entity", entity ? entity.name : "—"],
      ["Requesting department", rec.department || rec.dept || "—"],
      ["Business unit", rec.unit || rec.bu || "—"],
      ["Counterparty", rec.counterparty || "—"],
      ["Value", rec.value],
      ["Due date (business need)", rec.dueDate || rec.due],
      ["Preliminary risk", rec.riskPreliminary || rec.risk],
      ["Source", rec.source === "portal" ? "Requester portal (external form)" : "Internal"],
    ],
    description: rec.description || rec.aiSummary || "",
    requester: requester ? { id: requester, name: actorName(requester, ctx), role: actorRole(requester, ctx) } : null,
    // Uploaded / scanned documents with what OCR + extraction pulled out.
    documents: docs.map((d) => ({
      id: d.id, name: d.name, kind: d.kind, source: d.source, pages: d.pages,
      ocrStatus: d.ocrStatus, ocrConfidence: d.ocrConfidence,
      extracted: d.extractedFields || {}, driveLink: d.driveLink,
      srNo: d.srNo, officeLocation: d.officeLocation,
      requestId: d.requestId || null,
      uploadedByEmail: d.uploadedByEmail || null,
    })),
    attachments: rec.attachments || [],
    // Sprint 4 — the missing-document checklist legal is waiting on.
    requiredDocs: rec.requiredDocs || [],
    // Prior contract this attaches to (amendment / revision / extension).
    parent: parent ? { id: parent.id, title: parent.title, type: parent.contractType, value: parent.value, currency: parent.currency } : null,
    entity,
  };
}

/* ---------------- zone 3: OUTPUT ---------------- */
function buildOutput(rec, { contract, docs, stages }, ctx) {
  const executed = docs.filter((d) => /executed|signed|counterpart|deed|certificate/i.test(d.name));
  const drafts = docs.filter((d) => /draft|variation|redline/i.test(d.name));
  const obligations = contract && contract.extractedFields ? (contract.extractedFields.obligations || []) : [];
  const landed = stages.filter((s) => s.state === "done").flatMap((s) => s.artifacts.filter((a) => a.kind !== "planned").map((a) => ({ ...a, stage: s.name })));

  return {
    drafts, executed, obligations, artifacts: landed,
    // The repository / drive / tracker triple — nothing is orphaned.
    repositoryEntry: docs[0] || null,
    driveLink: (contract && contract.driveLink) || (docs[0] && docs[0].driveLink) || null,
    storagePath: (contract && contract.storagePath) || (docs[0] && docs[0].storagePath) || null,
    trackerRow: contract ? { id: contract.id, srNo: contract.srNo, physicalRecordRef: contract.physicalRecordRef, officeLocation: contract.officeLocation } : null,
    // What this record contributes to the analytics the GC reads.
    analytics: contract ? [
      ["Portfolio value", contract.value, contract.currency],
      ["PPA value", contract.ppaValue, contract.currency],
      ["Land value", contract.landValue, contract.currency],
      ["Spend to date", contract.spendToDate, contract.currency],
    ].filter((a) => a[1] != null && a[1] !== 0) : [],
    extraction: contract ? { fields: contract.extractedFields || {}, confidence: contract.extractionConfidence } : (docs[0] ? { fields: docs[0].extractedFields || {}, confidence: docs[0].ocrConfidence } : null),
  };
}

/* ---------------- zone 4: RELATIONSHIPS ---------------- */
function buildRelationships(rec, { request, matter, contract, entity, docs }, ctx) {
  const tags = rec.companyTags || [];
  const contracts = ctx.contracts || [];
  const items = [];
  const push = (group, icon, label, meta, to) => items.push({ group, icon, label, meta, to });

  if (entity) push("Entity", "building", entity.name, `${entity.type} · ${entity.jurisdiction}`, "/companies/" + entity.id);
  tags.filter((t) => t !== (entity || {}).id).forEach((t) => {
    const c = entityById(t);
    if (c) push("Counterparties & entities", "building", c.name, `${c.type} · ${c.jurisdiction}`, "/companies/" + c.id);
  });

  const requester = rec.requesterId || rec.requester;
  if (requester) push("People", "user", actorName(requester, ctx), "Requester · " + actorRole(requester, ctx), null);
  if (rec.owner) push("People", "user", nameOf(rec.owner), "Legal owner · " + byId(rec.owner).role, null);

  if (request) push("This record", "inbox", request.id, "Intake face — legal request", "/workspace/" + request.id);
  if (matter) push("This record", "folder", matter.id, "Working face — matter", "/matters/" + matter.id);
  if (contract) {
    const verb = { Amendment: "amended", Revision: "revised", Extension: "extended", Termination: "terminated" }[rec.requestType];
    const label = verb && rec.linkedContractId === contract.id
      ? "Subject contract — being " + verb
      : "Contract face — the executed agreement";
    push("This record", "file", contract.id, label, "/contracts/" + contract.id);
  }

  if (contract && contract.parentContractId) {
    const p = contracts.find((c) => c.id === contract.parentContractId);
    if (p) push("Contract family", "gitbranch", p.title, "Parent contract · " + p.id, "/contracts/" + p.id);
  }
  contracts.filter((c) => c.parentContractId === (contract ? contract.id : null)).forEach((ch) => push("Contract family", "gitbranch", ch.title, "Child · " + ch.id, "/contracts/" + ch.id));

  // Sibling work touching the same counterparties (the overlap signal).
  const siblings = contracts.filter((c) => c.id !== (contract || {}).id && (c.companyTags || []).some((t) => tags.includes(t)));
  siblings.slice(0, 5).forEach((c) => push("Related contracts", "file", c.title, `${c.id} · ${c.contractType} · ${c.status}`, "/contracts/" + c.id));

  (ctx.matters || []).filter((m) => m.id !== (matter || {}).id && (m.companyTags || []).some((t) => tags.includes(t)))
    .slice(0, 4).forEach((m) => push("Related matters", "folder", m.title, `${m.id} · ${m.status}`, "/matters/" + m.id));

  (ctx.licenses || []).filter((l) => (l.companyTags || []).some((t) => tags.includes(t)) || l.linkedContractId === (contract || {}).id)
    .slice(0, 5).forEach((l) => push("Licenses & permits", "fileCheck", l.name, `${l.authority} · ${l.jurisdiction}`, "/licenses"));

  const tpl = templateFor(rec);
  if (tpl) push("Templates used", "template", tpl.title, "v" + tpl.version + " · approved", "/templates");

  if (contract && (contract.rounds || []).length) push("Negotiations", "gitbranch", `${contract.rounds.length} rounds`, "Latest: " + contract.rounds[contract.rounds.length - 1].versionLabel, "/negotiations");

  (ctx.reviews || REVIEWS).filter((r) => r.contract === (contract || {}).id).forEach((r) => push("Reviews", "checkcircle", r.title, `${r.flagged} flags · ${r.status}`, "/reviews"));

  const gates = riskGatesFor(rec.risk);
  gates.approvers.forEach((a) => push("Approval chain", "checksquare", nameOf(a), byId(a).role, "/approvals"));

  LITIGATION.filter((l) => (l.companyTags || []).some((t) => tags.includes(t))).forEach((l) => push("Litigation", "scale", l.title, `${l.id} · ${l.stage}`, "/litigation"));

  // The physical record — the hard copy behind the digital file.
  if (contract) push("Physical record", "database", contract.physicalRecordRef, `Sr No ${contract.srNo} · ${contract.officeLocation}`, "/tracker");
  docs.forEach((d) => push("Documents", "file", d.name, `${d.kind} · Sr No ${d.srNo}`, "/repository/" + d.id));

  // Group into the ordered panel the spine renders.
  const groups = [];
  items.forEach((it) => {
    let g = groups.find((x) => x.group === it.group);
    if (!g) { g = { group: it.group, items: [] }; groups.push(g); }
    if (!g.items.some((x) => x.label === it.label && x.meta === it.meta)) g.items.push(it);
  });
  return groups;
}

/* ---------------- helpers used by lists ---------------- */
// The TAT verdict for a row, without building the whole spine (cheap for tables).
export function rowTat(rec, ctx = {}, now = new Date()) {
  const stages = buildStages(rec, ctx, now);
  return computeTat(rec, stages, now);
}

export { addWorkingDays, workingDaysBetween };
