/* THE CONTRACT REQUEST ENGINE.
 *
 * One object, nine forms. Everything that decides whether a request is
 * complete, whether Finance is involved, what counts as a deviation and who
 * may move it happens HERE, on the server, from the schemas in crf-schemas.js.
 * The browser renders and warns; it never rules.
 *
 * THE LIFECYCLE
 *   Draft -> Submitted -> HOD Approval -> [Finance Review] -> Legal Intake
 *         -> Accepted & Assigned -> In Drafting -> Closed
 *   with Returned to Requester, HOD Rejected and Escalated across it.
 *
 * THREE RULES THAT ARE NOT THE REQUESTER'S JUDGEMENT
 *
 *   FINANCE.    Any field marked financeTrigger carrying a value makes Finance
 *               Review required. Nobody is asked to decide whether their own
 *               request involves money.
 *
 *   DEVIATION.  A field with a standard position that holds something else is
 *               a deviation: recorded with both values, and Special Terms
 *               becomes mandatory. A default that is only a label is decoration.
 *
 *   SLA.        Starts at Accepted & Assigned and nowhere earlier. A clock that
 *               starts at submission measures the requester's own approval
 *               chain and calls it Legal's turnaround.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const S = require("./crf-schemas.js");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "contract-requests.json");
const MAX = 20000;

const now = () => new Date().toISOString();
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 4000);

let state = null;
function read() {
  if (state) return state;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    state = { requests: raw.requests || [], sequences: raw.sequences || {} };
  } catch (e) { state = { requests: [], sequences: {} }; }
  return state;
}
function write() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}
function reload() { state = null; return read(); }

const actor = (u) => (u ? { id: u.id || null, name: u.name || null, email: u.email || null } : null);
const byId = (id) => read().requests.find((r) => r.id === id) || null;

/* ------------------------------------------------------------ the rules -- */

/* Walk every field of every section that is VISIBLE given the current answers,
   and hand back one decision per field. One pass serves validation, the finance
   rule and the deviation list, so the three can never disagree about which
   fields were in play. */
function walk(rec) {
  const schema = S.schemaFor(rec.type);
  const out = { problems: [], financeFields: [], deviations: [], visible: [] };
  const values = rec.values || {};

  for (const sec of schema.sections) {
    const scope = sec.grid ? null : values[sec.key] || {};

    if (sec.grid) {
      const rows = Array.isArray(values[sec.key]) ? values[sec.key] : [];
      if ((sec.minRows || 0) > rows.length) {
        out.problems.push({ section: sec.key, sectionLabel: sec.label, field: sec.key,
          label: sec.label, message: "needs at least " + sec.minRows + " row" + (sec.minRows === 1 ? "" : "s") });
      }
      rows.forEach((row, i) => {
        for (const f of sec.fields) {
          if (f.showIf && !S.evalCond(f.showIf, row)) continue;
          out.visible.push(sec.key + "[" + i + "]." + f.key);
          const v = row[f.key];
          const need = f.required || (f.requiredIf && S.evalCond(f.requiredIf, row));
          if (need && S.isBlank(v)) {
            out.problems.push({ section: sec.key, sectionLabel: sec.label, row: i, field: f.key,
              label: f.label, message: "is required in row " + (i + 1) });
          }
          if (f.type === "subgrid") {
            const sub = Array.isArray(v) ? v : [];
            if (need && sub.length === 0) {
              out.problems.push({ section: sec.key, sectionLabel: sec.label, row: i, field: f.key,
                label: f.label, message: "needs at least one entry in row " + (i + 1) });
            }
            sub.forEach((sr, j) => (f.columns || []).forEach((c) => {
              if (c.required && S.isBlank(sr[c.key])) {
                out.problems.push({ section: sec.key, sectionLabel: sec.label, row: i, field: f.key,
                  label: f.label + " — " + c.label, message: "is required in entry " + (j + 1) });
              }
            }));
          }
          if (f.financeTrigger && !S.isBlank(v) && Number(v) !== 0) {
            out.financeFields.push({ section: sec.label, field: f.label, value: v });
          }
        }
      });
      continue;
    }

    for (const f of sec.fields) {
      if (f.showIf && !S.evalCond(f.showIf, scope)) continue;
      out.visible.push(sec.key + "." + f.key);
      const v = scope[f.key];
      const need = f.required || (f.requiredIf && S.evalCond(f.requiredIf, scope));
      if (need && S.isBlank(v) && f.type !== "auto") {
        out.problems.push({ section: sec.key, sectionLabel: sec.label, field: f.key,
          label: f.label, message: "is required" });
      }
      if (f.type === "subgrid") {
        const sub = Array.isArray(v) ? v : [];
        sub.forEach((sr, j) => (f.columns || []).forEach((c) => {
          if (c.required && S.isBlank(sr[c.key])) {
            out.problems.push({ section: sec.key, sectionLabel: sec.label, field: f.key,
              label: f.label + " — " + c.label, message: "is required in entry " + (j + 1) });
          }
        }));
      }
      if (f.financeTrigger && !S.isBlank(v) && Number(v) !== 0) {
        out.financeFields.push({ section: sec.label, field: f.label, value: v });
      }
      /* A DEVIATION IS A CHOICE AGAINST A KNOWN POSITION, not a blank. An
         untouched field has not departed from anything. */
      if (f.standard !== undefined && !S.isBlank(v)
        && String(v).trim() !== String(f.standard).trim()) {
        out.deviations.push({ section: sec.key, sectionLabel: sec.label, field: f.key,
          label: f.label, standardValue: String(f.standard), selectedValue: String(v), isDeviation: true });
      }
    }
  }
  return out;
}

/* Mandatory documents, checked by TYPE rather than by count: five files of the
   same kind do not satisfy five different requirements.
 *
 * AND A ROW WITH NO FILE BEHIND IT SATISFIES NOTHING. An attachment whose bytes
 * are not in storage is a record that somebody once chose a file, not a
 * document an approver can read -- so it leaves the requirement MISSING and
 * submission stays blocked. Counting it would be the original defect wearing a
 * checklist: a green tick over a file nobody can open. */
function attachmentState(rec) {
  const required = S.schemaFor(rec.type).requiredAttachments;
  const rows = rec.attachments || [];
  const have = new Set(rows.filter((a) => a.onFile !== false).map((a) => a.docType).filter(Boolean));
  const brokenByType = {};
  for (const a of rows) {
    if (a.onFile === false && a.docType) (brokenByType[a.docType] = brokenByType[a.docType] || []).push(a.name);
  }
  return required.map((t) => ({
    docType: t,
    uploaded: have.has(t),
    /* Named, so the screen can say "recorded but the file was not stored"
       rather than the flat "Missing" that sends somebody hunting for a
       document they already attached. */
    unavailable: !have.has(t) && !!brokenByType[t],
    unavailableNames: brokenByType[t] || [],
  }));
}

function assess(rec) {
  const w = walk(rec);
  const docs = attachmentState(rec);
  const missingDocs = docs.filter((d) => !d.uploaded);
  const financeRequired = w.financeFields.length > 0;
  const problems = w.problems.slice();

  for (const d of missingDocs) {
    problems.push({ section: "attachments", sectionLabel: "Attachments", field: d.docType,
      label: d.docType,
      message: d.unavailable
        ? "was attached but its file was never stored — re-upload it"
        : "has not been attached" });
  }
  /* SPECIAL TERMS BECOME MANDATORY ONCE A STANDARD POSITION IS CHANGED. The
     deviation is the whole reason Legal needs to read prose here. */
  const special = ((rec.values || {}).special || {}).specialTerms;
  if (w.deviations.length > 0 && S.isBlank(special)) {
    problems.push({ section: "special", sectionLabel: "Special terms", field: "specialTerms",
      label: "Special terms", message: "is required because " + w.deviations.length
        + " standard position" + (w.deviations.length === 1 ? " has" : "s have") + " been changed" });
  }
  return {
    ok: problems.length === 0,
    problems,
    deviations: w.deviations,
    financeRequired,
    financeFields: w.financeFields,
    attachments: docs,
  };
}

/* ------------------------------------------------------------ mutations -- */

function log(rec, event, by, detail, changes) {
  rec.timeline.push({
    id: "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    at: now(), event, by: actor(by), byName: (by && by.name) || null,
    detail: str(detail, 1000) || "",
    changes: changes && changes.length ? changes.slice(0, 200) : undefined,
  });
}

function create(type, by, dept) {
  if (!S.CRF_TYPES.some((t) => t.key === type)) {
    return { error: "invalid", errors: ["unknown request type"] };
  }
  const st = read();
  const rec = {
    id: "CR-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
    type,
    status: "Draft",
    values: {
      request: {
        requester: (by && by.name) || "",
        department: dept || (by && by.department) || "",
      },
    },
    attachments: [],
    approvals: [],
    legal: { receivedDate: null, reference: null, assignee: null, targetDate: null, remarks: "" },
    escalated: false,
    createdBy: actor(by), createdAt: now(),
    updatedBy: null, updatedAt: null,
    submittedAt: null, acceptedAt: null, closedAt: null,
    timeline: [],
  };
  log(rec, "Draft Created", by, S.schemaFor(type).label);
  st.requests.unshift(rec);
  st.requests = st.requests.slice(0, MAX);
  write();
  return { request: rec };
}

/* The requester may edit only while it is theirs to edit. Anything else would
   let a request change under the person approving it. */
function editable(rec) { return S.REQUESTER_EDITABLE.includes(rec.status); }

function patch(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (!editable(rec)) {
    return { error: "locked", errors: ["this request is " + rec.status.toLowerCase() + " and cannot be edited"] };
  }
  const section = str((body || {}).section, 60);
  const value = (body || {}).value;
  if (!section) return { error: "invalid", errors: ["a section is required"] };

  const before = rec.values[section];
  rec.values[section] = value;
  rec.updatedBy = actor(by); rec.updatedAt = now();

  /* AUDIT CARRIES OLD AND NEW. "Edited the rent section" answers nothing the
     next person needs; "monthlyRent 250,000 -> 400,000" does. */
  const changes = [];
  if (!Array.isArray(value) && value && typeof value === "object") {
    const b = (before && typeof before === "object") ? before : {};
    for (const k of new Set(Object.keys(b).concat(Object.keys(value)))) {
      const ov = b[k], nv = value[k];
      if (JSON.stringify(ov) !== JSON.stringify(nv)) {
        changes.push({ field: k, from: ov === undefined ? "" : ov, to: nv === undefined ? "" : nv });
      }
    }
  } else if (JSON.stringify(before) !== JSON.stringify(value)) {
    changes.push({ field: section, from: Array.isArray(before) ? (before || []).length + " rows" : before,
      to: Array.isArray(value) ? (value || []).length + " rows" : value });
  }
  /* Autosave writes constantly; only a real change earns a timeline entry. */
  if (changes.length) log(rec, "Edited", by, section, changes);
  write();
  return { request: rec, changed: changes.length };
}

/* CHANGING TYPE IN DRAFT. The answers that belong to the old type would be
   orphaned, so the caller is told exactly what would go and has to confirm. */
function changeType(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (rec.status !== "Draft") {
    return { error: "locked", errors: ["the request type can only be changed while it is a draft"] };
  }
  const next = str((body || {}).type, 20);
  if (!S.CRF_TYPES.some((t) => t.key === next)) return { error: "invalid", errors: ["unknown request type"] };
  if (next === rec.type) return { request: rec, dropped: [] };

  const keep = new Set(S.COMMON.map((s) => s.key));
  const dropped = Object.keys(rec.values).filter((k) => !keep.has(k)
    && !S.isBlank(rec.values[k]) && !(Array.isArray(rec.values[k]) && rec.values[k].length === 0));
  if (dropped.length && !(body || {}).confirm) {
    return { error: "confirm_required", dropped,
      errors: ["changing type will discard " + dropped.length + " section" + (dropped.length === 1 ? "" : "s") + " of answers"] };
  }
  for (const k of dropped) delete rec.values[k];
  const from = rec.type;
  rec.type = next;
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, "Request Type Changed", by, from + " → " + next,
    dropped.map((d) => ({ field: d, from: "answered", to: "discarded" })));
  write();
  return { request: rec, dropped };
}

function addAttachment(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (!editable(rec)) return { error: "locked", errors: ["this request cannot be edited"] };
  const docType = str((body || {}).docType, 120);
  const name = str((body || {}).name, 200);
  if (!name) return { error: "invalid", errors: ["a document name is required"] };
  const a = {
    id: "AT-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    docType: docType || "Other Attachment",
    name,
    annexure: str((body || {}).annexure, 60),
    uploadId: str((body || {}).uploadId, 120) || null,
    driveFileId: str((body || {}).driveFileId, 120) || null,
    addedBy: actor(by), addedAt: now(),
  };
  rec.attachments.push(a);
  log(rec, "Attachment Added", by, a.docType + " — " + a.name);
  write();
  return { request: rec, attachment: a };
}

function removeAttachment(id, attId, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (!editable(rec)) return { error: "locked", errors: ["this request cannot be edited"] };
  const i = (rec.attachments || []).findIndex((a) => a.id === attId);
  if (i < 0) return { error: "not found" };
  const [gone] = rec.attachments.splice(i, 1);
  log(rec, "Attachment Removed", by, gone.docType + " — " + gone.name);
  write();
  return { request: rec };
}

module.exports = { read, reload, byId, assess, walk, attachmentState, create, patch,
  changeType, addAttachment, removeAttachment, editable, log, actor, str, now, write, MAX };

/* ------------------------------------------------------------- workflow -- */

/* The order stages happen in, so "has it reached Legal yet" is one comparison
   rather than a list of statuses repeated at every call site. */
const STAGE_ORDER = ["Draft", "Returned to Requester", "Submitted", "HOD Approval",
  "Finance Review", "Legal Intake", "Accepted & Assigned", "In Drafting", "Closed"];

const isLegalUser = (u) => !!(u && String(u.dept || "Legal") === "Legal"
  && ["head", "lead", "member", "paralegal"].includes(u.rbac));
const isHeadOfLegal = (u) => !!(u && u.rbac === "head");
const isFinanceUser = (u) => !!(u && (String(u.dept || "").toLowerCase() === "finance" || u.finance === true));
const isRequester = (rec, u) => !!(u && rec.createdBy && rec.createdBy.email
  && String(rec.createdBy.email).toLowerCase() === String(u.email || "").toLowerCase());
const isNamedHod = (rec, u) => {
  const hod = ((rec.values || {}).request || {}).approvingHod;
  return !!(hod && u && String(hod).toLowerCase() === String(u.email || "").toLowerCase());
};

function guard(ok, message) {
  return ok ? null : { error: "forbidden", errors: [message] };
}

/* SUBMIT. The server validates; a browser that thinks the form is complete is
   not evidence that it is. */
function submit(id, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isRequester(rec, by) || (by && by.admin), "only the requester can submit this request");
  if (no) return no;
  if (!S.REQUESTER_EDITABLE.includes(rec.status)) {
    return { error: "invalid", errors: ["this request has already been submitted"] };
  }
  const a = assess(rec);
  if (!a.ok) {
    return { error: "incomplete", problems: a.problems,
      errors: [a.problems.length + " item" + (a.problems.length === 1 ? "" : "s") + " need attention"] };
  }
  const resubmission = rec.submittedAt != null;
  rec.financeRequired = a.financeRequired;
  rec.deviations = a.deviations;
  rec.status = "HOD Approval";
  rec.submittedAt = rec.submittedAt || now();
  rec.lastSubmittedAt = now();
  rec.updatedBy = actor(by); rec.updatedAt = now();
  /* The attachment set AS SUBMITTED, so an approval can always be read against
     what was actually in front of the approver. */
  rec.submissions = rec.submissions || [];
  rec.submissions.push({
    at: now(), by: actor(by),
    attachments: (rec.attachments || []).map((x) => ({ id: x.id, docType: x.docType, name: x.name })),
    financeRequired: a.financeRequired, deviations: a.deviations.length,
  });
  log(rec, resubmission ? "Resubmitted" : "Submitted", by,
    a.financeRequired ? "Finance review is required" : "No finance review required");
  write();
  return { request: rec, financeRequired: a.financeRequired };
}

function hodDecide(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (rec.status !== "HOD Approval") return { error: "invalid", errors: ["this request is not awaiting HOD approval"] };
  const no = guard(isNamedHod(rec, by) || isHeadOfLegal(by) || (by && by.admin),
    "only the approving HOD named on this request can decide it");
  if (no) return no;
  const approve = !!(body || {}).approve;
  const comment = str((body || {}).comment, 1000);
  if (!approve && !comment) return { error: "invalid", errors: ["a comment is required to reject or return"] };

  rec.approvals.push({ stage: "HOD", decision: approve ? "Approved" : "Rejected",
    by: actor(by), at: now(), comment });
  if (approve) {
    rec.status = rec.financeRequired ? "Finance Review" : "Legal Intake";
    if (rec.status === "Legal Intake") legalReceive(rec, by);
  } else {
    rec.status = "Returned to Requester";
  }
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, approve ? "HOD Approved" : "HOD Rejected", by, comment);
  write();
  return { request: rec };
}

function financeDecide(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (rec.status !== "Finance Review") return { error: "invalid", errors: ["this request is not awaiting finance review"] };
  const no = guard(isFinanceUser(by) || isHeadOfLegal(by) || (by && by.admin),
    "only Finance can decide a finance review");
  if (no) return no;
  const approve = !!(body || {}).approve;
  const comment = str((body || {}).comment, 1000);
  if (!approve && !comment) return { error: "invalid", errors: ["a comment is required to return"] };

  rec.approvals.push({ stage: "Finance", decision: approve ? "Approved" : "Returned",
    by: actor(by), at: now(), comment });
  if (approve) { rec.status = "Legal Intake"; legalReceive(rec, by); }
  else { rec.status = "Returned to Requester"; }
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, approve ? "Finance Approved" : "Finance Returned", by, comment);
  write();
  return { request: rec };
}

/* THE LEGAL REFERENCE. One per request, allocated once, from a per-type,
   per-year counter that only ever moves forward -- so two requests cannot be
   handed the same number and a deleted request does not free its own. */
/* THE LEGAL REFERENCE IS NAMED, NOT NUMBERED (§33).
   It read "LGL-CRF01-2026-0001": an internal schema id printed on a reference
   the business quotes back at us in emails. The schema id still exists and
   still keys the form; the reference now carries the short NAME of the
   agreement type instead, which is what the reference is for. Sequences stay
   keyed on the schema id so numbering is unbroken across the rename, and
   references already issued are never rewritten. */
const REF_SLUG = (() => {
  const m = {};
  try { for (const t of require("./crf-schemas").CRF_TYPES) {
    m[t.key] = String(t.short || t.key).toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
  } } catch (e) { /* fall back to the key below */ }
  return m;
})();
function nextReference(type) {
  const st = read();
  const year = new Date().getUTCFullYear();
  const key = type.replace("-", "") + ":" + year;
  st.sequences[key] = (st.sequences[key] || 0) + 1;
  const slug = REF_SLUG[type] || type.replace("-", "");
  return "LGL-" + slug + "-" + year + "-" + String(st.sequences[key]).padStart(4, "0");
}

function legalReceive(rec, by) {
  if (!rec.legal.receivedDate) rec.legal.receivedDate = now();
  if (!rec.legal.reference) {
    rec.legal.reference = nextReference(rec.type);
    log(rec, "Legal Received", by, "Legal reference " + rec.legal.reference);
  } else {
    log(rec, "Legal Received", by, "Back with Legal — " + rec.legal.reference);
  }
}

/* LEGAL RETURNS FOR SOMETHING NAMED. "Returned for information" that does not
   say what is missing sends the requester back to guess. */
function legalReturn(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isLegalUser(by) || (by && by.admin), "only Legal can return a request");
  if (no) return no;
  if (STAGE_ORDER.indexOf(rec.status) < STAGE_ORDER.indexOf("Legal Intake")) {
    return { error: "invalid", errors: ["this request has not reached Legal yet"] };
  }
  const fields = Array.isArray((body || {}).missingFields) ? (body || {}).missingFields.map((f) => str(f, 160)).filter(Boolean) : [];
  const docs = Array.isArray((body || {}).missingDocuments) ? (body || {}).missingDocuments.map((f) => str(f, 160)).filter(Boolean) : [];
  const comment = str((body || {}).comment, 1000);
  if (!fields.length && !docs.length) {
    return { error: "invalid", errors: ["state the missing fields or documents you need"] };
  }
  rec.returns = rec.returns || [];
  rec.returns.push({ at: now(), by: actor(by), missingFields: fields, missingDocuments: docs, comment });
  rec.status = "Returned to Requester";
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, "Returned to Requester", by,
    [comment, fields.length ? "Fields: " + fields.join(", ") : "", docs.length ? "Documents: " + docs.join(", ") : ""]
      .filter(Boolean).join(" · "));
  write();
  return { request: rec };
}

/* ACCEPT. An assignee and a target date are the point of accepting -- and the
   SLA starts HERE, not at submission, because everything before this was the
   requester's own approval chain. */
function accept(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isLegalUser(by) || (by && by.admin), "only Legal can accept a request");
  if (no) return no;
  if (STAGE_ORDER.indexOf(rec.status) < STAGE_ORDER.indexOf("Legal Intake")) {
    return { error: "invalid", errors: ["this request has not reached Legal yet"] };
  }
  const assignee = str((body || {}).assignee, 160);
  const targetDate = str((body || {}).targetDate, 40);
  const missing = [];
  if (!assignee) missing.push("an assignee");
  if (!targetDate) missing.push("a target date");
  if (missing.length) return { error: "invalid", errors: ["accepting needs " + missing.join(" and ")] };

  rec.legal.assignee = assignee;
  rec.legal.targetDate = targetDate;
  rec.status = "Accepted & Assigned";
  rec.acceptedAt = now();
  rec.slaStartedAt = rec.acceptedAt;
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, "Accepted", by, "Assigned to " + assignee + ", target " + targetDate + " — SLA starts now");
  write();
  return { request: rec };
}

function setTargetDate(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isLegalUser(by) || (by && by.admin), "only Legal can set a target date");
  if (no) return no;
  const d = str((body || {}).targetDate, 40);
  if (!d) return { error: "invalid", errors: ["a target date is required"] };
  const from = rec.legal.targetDate;
  rec.legal.targetDate = d;
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, "Target Date Set", by, (from ? from + " → " : "") + d, [{ field: "targetDate", from: from || "", to: d }]);
  write();
  return { request: rec };
}

/* Escalation flags for the Head of Legal and changes NOTHING else: the
   assignee stays, the history stays. An escalation that reassigns is a
   reassignment wearing an escalation's name. */
function escalate(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isLegalUser(by) || (by && by.admin), "only Legal can escalate a request");
  if (no) return no;
  const reason = str((body || {}).reason, 1000);
  if (!reason) return { error: "invalid", errors: ["say why it is being escalated"] };
  rec.escalated = true;
  rec.escalatedAt = now();
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, "Escalated", by, reason);
  write();
  return { request: rec };
}

function deescalate(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isHeadOfLegal(by) || (by && by.admin), "only the Head of Legal can clear an escalation");
  if (no) return no;
  rec.escalated = false;
  log(rec, "Escalation Cleared", by, str((body || {}).note, 500));
  write();
  return { request: rec };
}

function setStatus(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isLegalUser(by) || (by && by.admin), "only Legal can move this request");
  if (no) return no;
  const next = str((body || {}).status, 40);
  if (!["In Drafting", "Closed", "Accepted & Assigned"].includes(next)) {
    return { error: "invalid", errors: ["that status cannot be set directly"] };
  }
  if (next !== "Accepted & Assigned" && STAGE_ORDER.indexOf(rec.status) < STAGE_ORDER.indexOf("Accepted & Assigned")) {
    return { error: "invalid", errors: ["a request has to be accepted and assigned first"] };
  }
  const from = rec.status;
  rec.status = next;
  if (next === "Closed") {
    rec.closedAt = now();
    const link = str((body || {}).finalContractId, 120);
    if (link) rec.finalContractId = link;
  }
  rec.updatedBy = actor(by); rec.updatedAt = now();
  log(rec, next === "Closed" ? "Closed" : next, by, str((body || {}).note, 500),
    [{ field: "status", from, to: next }]);
  write();
  return { request: rec };
}

function setRemarks(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  const no = guard(isLegalUser(by) || (by && by.admin), "only Legal can record remarks");
  if (no) return no;
  const from = rec.legal.remarks || "";
  rec.legal.remarks = str((body || {}).remarks, 4000);
  log(rec, "Legal Remarks", by, "", [{ field: "remarks", from, to: rec.legal.remarks }]);
  write();
  return { request: rec };
}

/* MESSAGES BETWEEN THE REQUESTER AND LEGAL.
 *
 * A question about a request belongs on the request, not in somebody's inbox
 * where the next person to pick it up cannot find it. Every participant who may
 * read the request may read and post here, and that is deliberate: this thread
 * is the shared conversation. Legal's private working notes are NOT this --
 * they are INTERNAL_LEGAL documents, which the store refuses to the requester.
 * Keeping the two apart is what lets this one be open.
 */
function addMessage(id, body, by) {
  const rec = byId(id);
  if (!rec) return { error: "not found" };
  if (!permissionsFor(rec, by).view) {
    return { error: "forbidden", errors: ["this request is not yours to read"] };
  }
  const text = str((body || {}).text, 4000);
  if (!text) return { error: "invalid", errors: ["say something"] };
  rec.messages = rec.messages || [];
  const m = {
    id: "MSG-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    at: now(), by: actor(by),
    fromLegal: isLegalUser(by) && !isRequester(rec, by),
    text,
  };
  rec.messages.push(m);
  rec.updatedAt = now();
  log(rec, "Message", by, text.slice(0, 160));
  write();
  return { request: rec, message: m };
}

/* WHAT THIS READER MAY DO, decided here so no screen has to guess and no
   hidden button is the only thing standing between a user and an action. */
function permissionsFor(rec, u) {
  const legal = isLegalUser(u);
  /* A DRAFT IS PRIVATE TO ITS AUTHOR. Legal's intake queue begins at
     submission -- before that the request is half-written and belongs to
     nobody else. This also makes the register agree with the document store,
     which already refuses a draft's documents to everyone but its author. */
  const submitted = rec.status !== "Draft";
  return {
    view: isRequester(rec, u) || !!(u && u.admin)
      || (submitted && (isNamedHod(rec, u) || legal || isFinanceUser(u))),
    edit: (isRequester(rec, u) || !!(u && u.admin)) && S.REQUESTER_EDITABLE.includes(rec.status),
    submit: (isRequester(rec, u) || !!(u && u.admin)) && S.REQUESTER_EDITABLE.includes(rec.status),
    hodDecide: rec.status === "HOD Approval" && (isNamedHod(rec, u) || isHeadOfLegal(u)),
    financeDecide: rec.status === "Finance Review" && (isFinanceUser(u) || isHeadOfLegal(u)),
    legalActions: legal && STAGE_ORDER.indexOf(rec.status) >= STAGE_ORDER.indexOf("Legal Intake"),
    deescalate: isHeadOfLegal(u) && rec.escalated,
  };
}

/* The register row: everything a list needs, and nothing that would make it
   heavy. Computed, so it can never drift from the record. */
function summarise(rec) {
  const a = assess(rec);
  const v = rec.values || {};
  const cps = Array.isArray(v.counterparties) ? v.counterparties : [];
  const target = rec.legal && rec.legal.targetDate;
  const days = target ? Math.ceil((Date.parse(target + "T00:00:00Z") - Date.now()) / 86400000) : null;
  return {
    id: rec.id, type: rec.type,
    typeLabel: (S.CRF_TYPES.find((t) => t.key === rec.type) || {}).short || rec.type,
    reference: (rec.legal && rec.legal.reference) || null,
    status: rec.status,
    requester: (v.request || {}).requester || (rec.createdBy && rec.createdBy.name) || "",
    requesterEmail: (rec.createdBy && rec.createdBy.email) || "",
    department: (v.request || {}).department || "",
    entity: (v.entity || {}).entityName || "",
    counterparty: cps.length ? (cps[0].legalName || "") + (cps.length > 1 ? " +" + (cps.length - 1) : "") : "",
    requiredBy: (v.request || {}).requiredBy || "",
    priority: (v.request || {}).priority || "Standard",
    approvingHod: (v.request || {}).approvingHod || "",
    approvalStage: rec.status === "HOD Approval" ? "HOD" : rec.status === "Finance Review" ? "Finance"
      : rec.status === "Legal Intake" ? "Legal" : rec.status,
    financeRequired: a.financeRequired,
    deviations: a.deviations.length,
    assignee: (rec.legal && rec.legal.assignee) || "",
    targetDate: target || "",
    slaStartedAt: rec.slaStartedAt || null,
    slaDays: days,
    slaState: !rec.slaStartedAt ? "not started"
      : days == null ? "no target" : days < 0 ? "overdue" : days <= 2 ? "at risk" : "on track",
    documents: (rec.attachments || []).length,
    mandatoryTotal: a.attachments.length,
    mandatoryDone: a.attachments.filter((x) => x.uploaded).length,
    attachmentsComplete: a.attachments.every((x) => x.uploaded),
    escalated: !!rec.escalated,
    createdAt: rec.createdAt, updatedAt: rec.updatedAt, submittedAt: rec.submittedAt,
  };
}

module.exports.STAGE_ORDER = STAGE_ORDER;
module.exports.submit = submit;
module.exports.hodDecide = hodDecide;
module.exports.financeDecide = financeDecide;
module.exports.legalReturn = legalReturn;
module.exports.accept = accept;
module.exports.setTargetDate = setTargetDate;
module.exports.escalate = escalate;
module.exports.deescalate = deescalate;
module.exports.setStatus = setStatus;
module.exports.setRemarks = setRemarks;
module.exports.permissionsFor = permissionsFor;
module.exports.addMessage = addMessage;
module.exports.summarise = summarise;
module.exports.isLegalUser = isLegalUser;
module.exports.isFinanceUser = isFinanceUser;
module.exports.isRequester = isRequester;
module.exports.isNamedHod = isNamedHod;
