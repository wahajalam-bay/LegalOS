// RUNNING A CASE AFTER IT IS OPENED.
//
// Raising a case is the small part. A litigation matter is then heard a dozen
// times, waits on documents the business has not sent, changes counsel, moves
// stage, and finally closes with an outcome somebody has to record. If those
// things cannot be done here they get done in email and a spreadsheet, and the
// register becomes a list of cases nobody has updated since the day it opened.
//
// Two rules hold throughout:
//
//   EVERY CONTROL WRITES SOMETHING REAL. No dropdown exists for the look of it:
//   each one persists to the case, returns from the API, shows on the detail,
//   and lands on the timeline and the audit trail.
//
//   INTERNAL AND EXTERNAL ARE NOT THE SAME THREAD. A note to the file is
//   privileged. A question to the business is not. They are written, stored and
//   displayed separately, because one accidental merge of the two is a
//   privilege problem, not a UI bug.
import { html, useState, useEffect, Fragment } from "./core.js";
import { Btn, Pill, Modal, Field, Input, Chip, Picker, DateInput } from "./ui.js";
import { Icon } from "./icons.js";
import { api } from "./api.js";
import { toast } from "./toast.js";

/* ONE OPTION CONTROL FOR THE WHOLE MODULE.
   These panels used to carry a local <select> and a local <datalist>, so the
   same menu behaved one way in the intake wizard and another way here, and
   only one of the two was ever tested. Both now delegate to the design
   system's Picker: searchable, keyboard-driven, and rendered so the sheet's
   `overflow:hidden` cannot clip it. The signatures are unchanged so every call
   site keeps working.

   `status` travels with the options on purpose. A control that prints "0
   options" because a request failed is telling the lawyer something false
   about the business. */
const Select = ({ value, onChange, options, blank = "Select…", status, onRetry }) => html`
  <${Picker} options=${options || []} value=${value} allowCustom=${false}
    placeholder=${blank} status=${status || "ok"} onRetry=${onRetry}
    onChange=${(v) => onChange({ target: { value: v } })} />`;

const Combo = ({ id, value, onInput, options, placeholder, status, onRetry }) => html`
  <${Picker} options=${options || []} value=${value} allowCustom=${true}
    placeholder=${placeholder || ""} status=${status || "ok"} onRetry=${onRetry}
    onChange=${(v) => onInput({ target: { value: v } })} />`;

function useMeta() {
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("loading");
  const load = () => {
    setStatus("loading");
    api.litigation.meta().then(
      (m) => { setMeta(m); setStatus("ok"); },
      () => { setMeta(null); setStatus("failed"); });
  };
  useEffect(load, []);
  const m = meta || {};
  m.__status = status;
  m.__retry = load;
  return m;
};

function Sheet({ title, icon, children, onSave, onClose, saving, err, saveLabel = "Save", width = 720 }) {
  return html`<${Modal} title=${title} icon=${icon} width=${width} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${saving} onClick=${onSave}>${saving ? "Saving…" : saveLabel}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-bottom:10px">
      <div class="tiny strong">${err}</div></div>`}
    ${children}
  </${Modal}>`;
}

/* A hearing is scheduled, then completed. Recording the second as a new hearing
   would double every sitting in the history. */
/* ADDING A HEARING STARTS FROM THE LAST ONE (§69).
 *
 * A litigator adding the next date has just come from the previous sitting,
 * and everything they need to write is a continuation of it: the same purpose
 * unless it moved on, the same forum, and the note they left themselves last
 * time about what to do next. The form used to open blank, so that context
 * lived in their head or in a WhatsApp message.
 *
 * The prior hearing is shown in full — date, purpose, outcome, the next date
 * it set and its notes — and only the REUSABLE parts are prefilled. The
 * outcome is never carried forward: the previous result is not this sitting's
 * result, and prefilling it would be the system putting words in a lawyer's
 * mouth about something that has not happened.
 */
export function HearingSheet({ caseId, hearing, record, onClose, onDone }) {
  const m = useMeta();
  const editing = !!hearing;

  /* The most recent sitting BEFORE the one being recorded. Sorted by date so
     "most recent" means the latest date, not the last row somebody typed. */
  const prior = (() => {
    const all = ((record && (record.caseHearings || record.hearings)) || [])
      .filter((h) => h && h.date && (!hearing || h.id !== hearing.id))
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return all[0] || null;
  })();

  const [f, setF] = useState({
    date: (hearing && hearing.date) || "",
    /* Carried forward: the purpose usually continues ("Arguments", "Evidence")
       and the forum does not move. */
    purpose: (hearing && hearing.purpose) || (prior && prior.purpose) || "",
    /* Kept on the record so a hearing that already carries a judge does not
       lose it on an edit; simply no longer asked for. */
    judge: (hearing && hearing.judge) || "",
    /* NOT carried forward. See the note above. */
    outcome: (hearing && hearing.outcome) || "",
    notes: (hearing && hearing.notes) || "", nextHearing: "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    if (!f.date) { setErr("A hearing date is required."); return; }
    setSaving(true); setErr("");
    try {
      if (editing) await api.litigation.updateHearing(caseId, hearing.id, f);
      else await api.litigation.addHearing(caseId, f);
      onDone();
    } catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  return html`<${Sheet} title=${editing ? "Complete hearing" : "Add hearing"} icon="calendar"
    onSave=${save} onClose=${onClose} saving=${saving} err=${err}>
    ${prior && html`<div class="card card--pad" style="margin-bottom:14px;background:var(--surface-2)">
      <div class="row" style="gap:8px;margin-bottom:8px">
        <${Icon} name="clock" size=14 />
        <span class="tiny strong">Last hearing — ${prior.date}</span>
        ${prior.status && html`<${Pill} tone=${prior.outcome ? "green" : "gray"}>${prior.status}</${Pill}>`}
      </div>
      <div class="kvgrid" style="grid-template-columns:1fr 1fr">
        <div class="kv"><div class="kv__l">Purpose</div><div class="kv__v">${prior.purpose || "—"}</div></div>
        <div class="kv"><div class="kv__l">Outcome</div>
          <div class=${"kv__v" + (prior.outcome ? "" : " muted")}>${prior.outcome || "Not recorded"}</div></div>
        <div class="kv"><div class="kv__l">Next date it set</div>
          <div class=${"kv__v" + (prior.nextHearing ? "" : " muted")}>${prior.nextHearing || "None set"}</div></div>
        <div class="kv"><div class="kv__l">Forum</div><div class="kv__v">${prior.court || "—"}</div></div>
      </div>
      ${prior.notes && html`<div style="margin-top:8px">
        <div class="kv__l">Notes left for the next hearing</div>
        <div class="tiny" style="line-height:1.55;margin-top:2px">${prior.notes}</div></div>`}
      <div class="tiny muted" style="margin-top:8px">
        The purpose has been carried across. The outcome deliberately has not — this sitting has not happened yet.
      </div>
    </div>`}
    <div class="modeditgrid">
      <${Field} label="Hearing date *"><${DateInput} value=${f.date} onInput=${set("date")} /></${Field}>
      <${Field} label="Purpose"><${Combo} id="hp" value=${f.purpose} onInput=${set("purpose")} options=${m.hearingPurposes || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      ${/* No judge/bench here. A hearing's presiding judge is not something the
            person recording the date has to hand, and the field sat empty on
            every hearing that has been entered -- an empty box on a form is a
            question the user has to decide not to answer. The case's forum
            already records where it is being heard. */ ""}
      <${Field} label="Outcome" hint=${editing ? "Recording an outcome completes this hearing" : "Leave blank if it has not happened yet"}>
        <${Select} value=${f.outcome} onChange=${set("outcome")} options=${m.hearingOutcomes || []} status=${m.__status} onRetry=${m.__retry} />
      </${Field}>
      <${Field} label="Next hearing" hint="Moves the case's next date and its deadline">
        <${DateInput} value=${f.nextHearing} onInput=${set("nextHearing")} />
      </${Field}>
    </div>
    <${Field} label="Notes for the next hearing"
      hint="What the person taking the next sitting needs to know. This is what appears above when they open this form.">
      <textarea class="input" rows="3" value=${f.notes} onInput=${set("notes")}></textarea></${Field}>
  </${Sheet}>`;
}

export function DeadlineSheet({ caseId, onClose, onDone }) {
  const m = useMeta();
  const [f, setF] = useState({ kind: "", dueDate: "", note: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    if (!f.dueDate) { setErr("A due date is required."); return; }
    setSaving(true); setErr("");
    try { await api.litigation.addDeadline(caseId, f); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  return html`<${Sheet} title="Add deadline" icon="clock" onSave=${save} onClose=${onClose} saving=${saving} err=${err} width=${620}>
    <div class="modeditgrid">
      <${Field} label="Type"><${Select} value=${f.kind} onChange=${set("kind")} options=${m.deadlineKinds || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Due *"><${DateInput} value=${f.dueDate} onInput=${set("dueDate")} /></${Field}>
    </div>
    <${Field} label="Note"><${Input} value=${f.note} onInput=${set("note")} /></${Field}>
    <div class="tiny muted" style="margin-top:8px">
      LegalOS does not calculate limitation periods. A statutory deadline is one you enter, and it is tracked from there.
    </div>
  </${Sheet}>`;
}

export function CounselSheet({ caseId, counsel, onClose, onDone }) {
  const m = useMeta();
  const [f, setF] = useState({
    mode: (counsel && counsel.mode) || "Internal", firm: (counsel && counsel.firm) || "",
    lead: (counsel && counsel.lead) || "", contact: (counsel && counsel.contact) || "",
    engagedAt: (counsel && counsel.engagedAt) || "", feeArrangement: (counsel && counsel.feeArrangement) || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const opts = (m.suggest && m.suggest.counsel) || [];
  const save = async () => {
    setSaving(true); setErr("");
    try { await api.litigation.assignCounsel(caseId, f); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  return html`<${Sheet} title="Assign counsel" icon="user" onSave=${save} onClose=${onClose} saving=${saving} err=${err} width=${680}>
    <div class="modeditgrid">
      <${Field} label="Counsel">
        <select class="select" value=${f.mode} onChange=${set("mode")}>
          <option value="Internal">Internal only</option><option value="External">External counsel</option>
        </select>
      </${Field}>
      ${f.mode === "External" && html`<${Field} label="Firm" hint=${opts.length + " already engaged"}>
        <${Combo} id="cf" value=${f.firm} onInput=${set("firm")} options=${opts} status=${m.__status} onRetry=${m.__retry} /></${Field}>`}
      <${Field} label="Lead counsel"><${Combo} id="cl" value=${f.lead} onInput=${set("lead")} options=${opts} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Contact"><${Input} value=${f.contact} onInput=${set("contact")} /></${Field}>
      <${Field} label="Engaged"><${DateInput} value=${f.engagedAt} onInput=${set("engagedAt")} /></${Field}>
      ${f.mode === "External" && html`<${Field} label="Fee arrangement"><${Input} value=${f.feeArrangement} onInput=${set("feeArrangement")} /></${Field}>`}
    </div>
  </${Sheet}>`;
}

export function PartySheet({ caseId, onClose, onDone }) {
  const m = useMeta();
  const [f, setF] = useState({ name: "", role: "Defendant", kind: "Entity", counsel: "", isUs: false });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    if (!f.name.trim()) { setErr("A party name is required."); return; }
    setSaving(true); setErr("");
    try { await api.litigation.addParty(caseId, f); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  return html`<${Sheet} title="Add party" icon="users" onSave=${save} onClose=${onClose} saving=${saving} err=${err} width=${640}>
    <div class="modeditgrid">
      <${Field} label="Party type">
        <${Select} value=${f.kind} onChange=${set("kind")} options=${m.partyKinds || []} blank="Entity" status=${m.__status} onRetry=${m.__retry} />
      </${Field}>
      <${Field} label="Name *" hint=${f.kind === "Entity" ? "Entities already known to LegalOS are suggested" : ""}>
        <${Combo} id="pn" value=${f.name} onInput=${set("name")} options=${f.kind === "Entity" ? ((m.suggest && m.suggest.entity) || []) : []} status=${m.__status} onRetry=${m.__retry} />
      </${Field}>
      <${Field} label="Role"><${Combo} id="pr" value=${f.role} onInput=${set("role")} options=${(m.suggest && m.suggest.position) || m.partyRoles || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Their counsel"><${Combo} id="pc" value=${f.counsel} onInput=${set("counsel")} options=${(m.suggest && m.suggest.counsel) || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
    </div>
    <label class="tiny" style="display:block;margin-top:8px">
      <input type="checkbox" checked=${f.isUs} onChange=${(e) => setF((d) => ({ ...d, isUs: e.target.checked }))} /> This party is us
    </label>
  </${Sheet}>`;
}

/* The two-way half. A question goes out with a due date; the answer comes back
   onto the case with its documents. */
export function AskSheet({ caseId, onClose, onDone }) {
  const m = useMeta();
  /* "Response due" was removed from this sheet. The field stays on the payload
     (empty) so the request contract is unchanged, and the server already only
     creates a deadline when a date is actually given. */
  const [f, setF] = useState({ recipientType: "Requester", recipient: "", question: "", documentsWanted: "", dueDate: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    if (!f.question.trim()) { setErr("Say what is being asked for."); return; }
    setSaving(true); setErr("");
    try { await api.litigation.ask(caseId, f); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  return html`<${Sheet} title="Request information" icon="mail" onSave=${save} onClose=${onClose} saving=${saving} err=${err} saveLabel="Send request">
    <div class="modeditgrid">
      <${Field} label="Ask"><${Select} value=${f.recipientType} onChange=${set("recipientType")} options=${m.askRecipients || []} blank="Requester" status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Name / contact"><${Input} value=${f.recipient} onInput=${set("recipient")} /></${Field}>
      <${Field} label="Documents wanted"><${Input} value=${f.documentsWanted} onInput=${set("documentsWanted")} /></${Field}>
    </div>
    <${Field} label="What do you need? *">
      <textarea class="input" rows="4" value=${f.question} onInput=${set("question")}></textarea>
    </${Field}>
    <div class="tiny muted" style="margin-top:8px">
      The recipient sees this question and can reply with text and documents. They do not see the case file or any internal note.
    </div>
  </${Sheet}>`;
}

/* MARK DECIDED (§64).
 *
 * "Close case" asked for one word and a date. That is enough to take a matter
 * off the active list and not nearly enough to report on it: a register full of
 * "Dismissed" with no reasoning cannot answer whether the company came out
 * ahead, which firm runs matters well, or what a comparable case settled for.
 *
 * Four things are now REQUIRED — decision date, outcome, a summary in the
 * lawyer's own words, and confirmation about the order or judgment — because
 * each of them is unrecoverable once the person who was in court has moved on.
 * The order/judgment is asked for rather than demanded: it genuinely is not
 * always issued on the day, and blocking the closure on a document that does
 * not exist yet would simply mean nobody closes anything.
 *
 * AND NOTHING HERE INFERS A RESULT. The outcome is chosen by the person who
 * knows; no code reads "dismissed" and decides that was a win.
 */
export function CloseSheet({ caseId, record, onClose, onDone }) {
  const m = useMeta();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    outcome: "", decisionDate: today, outcomeSummary: "",
    settlement: "", recovery: "", finalExposure: "", notes: "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const docs = ((record && (record.caseDocuments || record.documents)) || []).length;
  const save = async () => {
    const missing = [];
    if (!f.outcome) missing.push("the outcome");
    if (!f.decisionDate) missing.push("the decision date");
    if (!f.outcomeSummary.trim()) missing.push("a short summary of the decision");
    if (missing.length) { setErr("Record " + missing.join(", ") + " before marking this decided."); return; }
    setSaving(true); setErr("");
    try { await api.litigation.close(caseId, { ...f, closureDate: f.decisionDate }); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  return html`<${Sheet} title="Mark decided" icon="check" onSave=${save} onClose=${onClose} saving=${saving} err=${err} saveLabel="Mark decided">
    <div class="tiny muted" style="margin-bottom:12px">
      The matter moves from Active to Decided. Its hearings, documents and history stay exactly
      as they are — deciding a case records a result, it does not archive the file.
    </div>
    <div class="modeditgrid">
      <${Field} label="Outcome *" hint="What the forum actually decided">
        <${Select} value=${f.outcome} onChange=${set("outcome")} options=${m.closureOutcomes || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Decision date *"><${DateInput} value=${f.decisionDate} onInput=${set("decisionDate")} /></${Field}>
      <${Field} label="Settlement" hint="Where one was agreed"><${Input} value=${f.settlement} onInput=${set("settlement")} /></${Field}>
      <${Field} label="Recovered"><${Input} value=${f.recovery} onInput=${set("recovery")} /></${Field}>
      <${Field} label="Final claim value"><${Input} value=${f.finalExposure} onInput=${set("finalExposure")} /></${Field}>
    </div>
    <${Field} label="Outcome summary *"
      hint="What was decided and on what basis — the next reader of this file has only this.">
      <textarea class="input" rows="3" value=${f.outcomeSummary} onInput=${set("outcomeSummary")}></textarea></${Field}>
    <${Field} label="Final notes" hint="Anything to carry forward: appeal window, execution, related matters.">
      <textarea class="input" rows="2" value=${f.notes} onInput=${set("notes")}></textarea></${Field}>
    ${/* THE ORDER IS ASKED FOR, NOT DEMANDED. A certified copy often arrives
          days later; refusing the closure until it does would mean the register
          simply never records decisions. */ ""}
    <div class=${docs ? "tiny muted" : "banner banner--warn"} style="margin-top:10px;align-items:flex-start">
      ${docs
        ? html`<span>${docs} document${docs === 1 ? "" : "s"} on file. If the order or judgment is not among them,
            add it from the case page once it is issued.</span>`
        : html`<${Fragment}><${Icon} name="alertTriangle" size=15 />
            <span class="tiny">No document is on file for this case. Attach the order or judgment from
            <strong>Add document</strong> on the case page as soon as it is issued — a decided matter with
            no order is a result nobody can evidence.</span></${Fragment}>`}
    </div>
  </${Sheet}>`;
}

/* Editing what is already there, without losing what the document said. */
export function EditSheet({ caseId, record, onClose, onDone }) {
  const m = useMeta();
  const [f, setF] = useState({
    title: record.title || "", courtCaseNumber: record.courtCaseNumber || record.caseNo || "",
    nature: record.nature || record.type || "",
    status: record.status || "", stage: record.stage || "", risk: record.risk || "",
    priority: record.priority || "", entity: record.entity || "", summary: record.summary || record.proceedings || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const save = async () => {
    setSaving(true); setErr("");
    try { await api.litigation.patch(caseId, f); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setSaving(false); }
  };
  const sug = m.suggest || {};
  return html`<${Sheet} title="Edit case" icon="edit" onSave=${save} onClose=${onClose} saving=${saving} err=${err} width=${820}>
    <div class="modeditgrid">
      <${Field} label="Case title"><${Input} value=${f.title} onInput=${set("title")} /></${Field}>
      <${Field} label="Court case number"><${Input} value=${f.courtCaseNumber} onInput=${set("courtCaseNumber")} /></${Field}>
      <${Field} label="Case category" hint="The classification the register is filed under">
        <${Combo} id="en" value=${f.nature} onInput=${set("nature")}
          options=${(m.lists && m.lists.categories && m.lists.categories.options) || sug.nature || []}
          status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Benchmarked as" hint="Derived from the category — not a separate field">
        <${Input} value=${(m.families && m.families[f.nature]) || record.caseType || ""} disabled=${true} /></${Field}>
      <${Field} label="Entity"><${Combo} id="ee" value=${f.entity} onInput=${set("entity")} options=${(m.lists && m.lists.entities && m.lists.entities.options) || sug.entity || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Status" hint="Close the case from the Close action, so the outcome is recorded">
        <${Select} value=${f.status} onChange=${set("status")} options=${(m.statuses || []).filter((x) => x !== "Closed")} status=${m.__status} onRetry=${m.__retry} />
      </${Field}>
      <${Field} label="Stage"><${Select} value=${f.stage} onChange=${set("stage")} options=${m.workflow || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Risk"><${Select} value=${f.risk} onChange=${set("risk")} options=${m.risks || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
      <${Field} label="Priority" hint="Operational urgency, not legal risk"><${Select} value=${f.priority} onChange=${set("priority")} options=${m.priorities || []} status=${m.__status} onRetry=${m.__retry} /></${Field}>
    </div>
    <${Field} label="Summary"><textarea class="input" rows="4" value=${f.summary} onInput=${set("summary")}></textarea></${Field}>
    <div class="tiny muted" style="margin-top:8px">
      Correcting a value that was read from a document keeps both: what the document said and what you decided.
    </div>
  </${Sheet}>`;
}


/* ADDING A DOCUMENT TO A CASE THAT ALREADY EXISTS.
   Documents could be attached while RAISING a case and never afterwards, so a
   case filed without its plaint had nowhere to put one: the Documents tab
   listed what was there and offered no way to add to it. The upload goes
   through the same endpoint the intake wizard uses -- the file is stored
   content-addressed, so the same document uploaded twice is one document on
   the case -- and what the reader gets back is the extraction's opinion of
   what the file is, offered as a default they can overwrite rather than a
   classification imposed on them. */
export function DocumentSheet({ caseId, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("");
  const [name, setName] = useState("");
  const [reading, setReading] = useState(false);
  const [uploaded, setUploaded] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f); setErr(""); setReading(true);
    try {
      const r = await api.litigation.extract(f);
      setUploaded({ uploadId: r.uploadId, name: r.name });
      setName(r.name || f.name);
      /* What the document says it is. A suggestion, not a verdict. */
      if (r.documentKind) setKind(r.documentKind);
    } catch (ex) {
      setErr(ex.message || "That file could not be read.");
    } finally { setReading(false); }
  };

  const save = async () => {
    if (!uploaded) { setErr("Choose a file first."); return; }
    setSaving(true); setErr("");
    try {
      await api.litigation.attachDocuments(caseId, [{
        name: (name || uploaded.name || "Document").trim(),
        uploadId: uploaded.uploadId,
        kind: kind || "Case document",
        source: "upload",
      }]);
      onDone();
    } catch (e) {
      setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message);
      setSaving(false);
    }
  };

  return html`<${Sheet} title="Add document" icon="paperclip" onSave=${save} onClose=${onClose}
    saving=${saving} err=${err} saveLabel="Attach to case">
    <${Field} label="File *" hint="PDF, Word, image or scan — it is stored in LegalOS and listed on the case">
      <input class="input" type="file" onChange=${pick} />
    </${Field}>
    ${reading && html`<div class="tiny muted">Reading the document…</div>`}
    ${uploaded && html`<${Fragment}>
      <div class="modeditgrid">
        <${Field} label="Document name"><${Input} value=${name} onInput=${(e) => setName(e.target.value)} /></${Field}>
        <${Field} label="Document type" hint="What this is on the case — e.g. Plaint, Written statement, Order">
          <${Input} value=${kind} onInput=${(e) => setKind(e.target.value)} placeholder="Case document" />
        </${Field}>
      </div>
      <div class="tiny muted">Stored as ${uploaded.uploadId}. Uploading the same file again attaches it once.</div>
    </${Fragment}>`}
  </${Sheet}>`;
}


/* DELETING A CASE, WITH A REASON.
   Deliberately not a one-click destructive action, and deliberately not a hard
   delete: the case leaves the active register and keeps its author, its
   hearings, its documents and its audit trail. A reason is required, because
   "deleted by Maryam Haq" tells a reader that something was removed and
   nothing about whether it should have been. */
export function DeleteCaseSheet({ caseId, caseName, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setBusy(true); setErr("");
    /* ASKS; DOES NOT DELETE. A case leaves the register when the head of
       Litigation & Disputes approves, not when somebody presses this. */
    try { await api.litigation.requestDeletion("cases", caseId, caseName || caseId, reason.trim()); onDone(); }
    catch (e) {
      setErr((e.payload && e.payload.errors && e.payload.errors.join(" · "))
        || (e.payload && e.payload.detail) || e.message); setBusy(false);
    }
  };
  return html`<${Sheet} title="Request deletion of this case" icon="alertTriangle" onSave=${go} onClose=${onClose}
    saving=${busy} err=${err} saveLabel="Send for approval">
    <div class="tiny" style="line-height:1.7;padding-bottom:10px">
      <strong>${caseName || caseId}</strong> stays on the register until the head of Litigation &
      Disputes approves. They see your reason and can refuse. If they approve, nothing is destroyed:
      its hearings, documents, invoices and audit trail stay on the record, who created it remains
      visible, and an administrator can restore it.
    </div>
    <${Field} label="Reason *" hint="Why this case should be removed. The head reads this, and it stays on the record.">
      <textarea class="input" rows="3" value=${reason}
        onInput=${(e) => setReason(e.target.value)}
        placeholder="e.g. Raised in error — duplicate of LIT-00014"></textarea>
    </${Field}>
  </${Sheet}>`;
}

/* The action bar. Four things people do constantly, the rest behind More, so
   the header does not become fifteen buttons. */
export function CaseActions({ record, onChanged }) {
  const [open, setOpen] = useState("");
  const [more, setMore] = useState(false);
  const id = record.id;
  const done = () => { setOpen(""); setMore(false); onChanged && onChanged(); };
  const closed = String(record.status || "").toLowerCase() === "closed";
  return html`<${Fragment}>
    <${Btn} variant="ghost" icon="calendar" onClick=${() => setOpen("hearing")}>Add hearing</${Btn}>
    ${/* THE DECISION IS A PRIMARY ACTION, NOT A MENU ITEM.
          It was the last entry under "More", three clicks from the case, while
          the tracker-backed cases — which is almost the whole book — offer it
          on the header. The most reportable fact a litigation department has
          should be recorded from the same place whichever kind of case it is. */ ""}
    ${!closed && html`<${Btn} variant="primary" icon="gavel" onClick=${() => setOpen("close")}>Record the decision</${Btn}>`}
    <${Btn} variant="ghost" icon="mail" onClick=${() => setOpen("ask")}>Request information</${Btn}>
    <${Btn} variant="ghost" icon="edit" onClick=${() => setOpen("edit")}>Edit case</${Btn}>
    <${Btn} variant="ghost" icon="more" onClick=${() => setMore(!more)}>More</${Btn}>
    ${more && html`<div class="card card--pad" style="position:absolute;right:16px;margin-top:40px;z-index:40;min-width:210px">
      ${[["document", "paperclip", "Add document"], ["deadline", "clock", "Add deadline"], ["party", "users", "Add party"], ["counsel", "user", "Assign counsel"]]
        .map(([k, i, label]) => html`<button key=${k} type="button" class="linkbtn tiny" style="display:block;padding:6px 0;background:none;border:0;cursor:pointer;text-align:left;width:100%"
          onClick=${() => { setOpen(k); setMore(false); }}><${Icon} name=${i} size=13 /> ${label}</button>`)}
      ${closed && html`<button type="button" class="linkbtn tiny" style="display:block;padding:6px 0;background:none;border:0;cursor:pointer;text-align:left;width:100%"
        onClick=${async () => { await api.litigation.reopen(id, { reason: "reopened from the case page" }); done(); }}>Reopen case</button>`}
      ${/* Last, and separated: it is the only thing here that can take a case
            off the register -- and it only asks. The head of the team decides. */ ""}
      <button type="button" class="linkbtn tiny" style="display:block;padding:6px 0;background:none;border:0;cursor:pointer;text-align:left;width:100%;color:var(--danger)"
        onClick=${() => { setOpen("delete"); setMore(false); }}><${Icon} name="x" size=13 /> Request deletion</button>
    </div>`}

    ${open === "hearing" && html`<${HearingSheet} caseId=${id} record=${record} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "document" && html`<${DocumentSheet} caseId=${id} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "deadline" && html`<${DeadlineSheet} caseId=${id} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "counsel" && html`<${CounselSheet} caseId=${id} counsel=${record.counsel} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "party" && html`<${PartySheet} caseId=${id} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "ask" && html`<${AskSheet} caseId=${id} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "close" && html`<${CloseSheet} caseId=${id} record=${record} onClose=${() => setOpen("")} onDone=${done} />`}
    ${open === "edit" && html`<${EditSheet} caseId=${id} record=${record} onClose=${() => setOpen("")} onDone=${done} />`}
    ${/* Stays on the case: asking did not remove it. Bouncing the author back
          to the register would read as "deleted" for something still there. */ ""}
    ${open === "delete" && html`<${DeleteCaseSheet} caseId=${id} caseName=${record.caseName || record.title}
      onClose=${() => setOpen("")}
      onDone=${() => { setOpen(""); toast("Sent for approval. The case stays here until the head decides.", "success"); done(); }} />`}
  </${Fragment}>`;
}

/* Hearings, deadlines and the open questions — the three panels that tell a
   lawyer what is happening and what is waiting on somebody. */
export function CasePanels({ record, onChanged }) {
  const hearings = (record.caseHearings || record.hearings || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const deadlines = (record.caseDeadlines || record.deadlines || []);
  const asks = (record.informationRequests || []);
  const [completing, setCompleting] = useState(null);
  const open = deadlines.filter((d) => !d.done);
  const days = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

  return html`<${Fragment}>
    ${completing && html`<${HearingSheet} caseId=${record.id} hearing=${completing} record=${record}
      onClose=${() => setCompleting(null)} onDone=${() => { setCompleting(null); onChanged && onChanged(); }} />`}

    ${hearings.length > 0 && html`<div class="card card--pad">
      <div class="strong" style="font-size:14px;margin-bottom:10px">Hearings</div>
      ${hearings.map((h) => html`<div key=${h.id} class="row" style="gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div class="strong" style="font-size:13px">${h.date}${h.purpose ? " · " + h.purpose : ""}</div>
          <div class="tiny muted">${[h.outcome, h.judge, h.court].filter(Boolean).join(" · ") || "No outcome recorded yet"}</div>
        </div>
        <${Pill} tone=${h.status === "Completed" ? "gray" : "amber"}>${h.status}</${Pill}>
        ${h.status !== "Completed" && html`<${Btn} size="sm" variant="ghost" onClick=${() => setCompleting(h)}>Complete</${Btn}>`}
      </div>`)}
    </div>`}

    ${open.length > 0 && html`<div class="card card--pad">
      <div class="strong" style="font-size:14px;margin-bottom:10px">Deadlines</div>
      ${open.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).map((d) => {
        const n = days(d.dueDate);
        return html`<div key=${d.id} class="row" style="gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1"><div class="strong" style="font-size:13px">${d.kind}</div>
            ${d.note && html`<div class="tiny muted">${d.note}</div>`}</div>
          <span class="tiny">${d.dueDate}</span>
          <${Pill} tone=${n < 0 ? "red" : n <= 14 ? "amber" : "gray"}>${n < 0 ? Math.abs(n) + "d overdue" : n + "d"}</${Pill}>
          <${Btn} size="sm" variant="ghost" onClick=${async () => { await api.litigation.completeDeadline(record.id, d.id, {}); onChanged && onChanged(); }}>Done</${Btn}>
        </div>`;
      })}
    </div>`}

    ${asks.length > 0 && html`<div class="card card--pad">
      <div class="strong" style="font-size:14px;margin-bottom:10px">Waiting on others</div>
      ${asks.map((a) => html`<div key=${a.id} style="padding:7px 0;border-bottom:1px solid var(--border)">
        <div class="row" style="gap:8px">
          <div style="flex:1"><div class="strong" style="font-size:13px">${a.recipientType}${a.recipient ? " · " + a.recipient : ""}</div>
            <div class="tiny muted">${a.question}</div></div>
          <${Pill} tone=${a.status === "Responded" ? "green" : "amber"}>${a.status}</${Pill}>
        </div>
        ${(a.responses || []).map((r, i) => html`<div key=${i} class="tiny muted" style="margin:6px 0 0 12px;padding-left:8px;border-left:2px solid var(--border)">
          <b>${r.byName || r.by}</b>: ${r.text}${(r.documents || []).length ? " · " + r.documents.map((d) => d.name).join(", ") : ""}</div>`)}
      </div>`)}
    </div>`}
  </${Fragment}>`;
}

export default CaseActions;

/* WHAT THIS RECORD GAVE RISE TO.
   A notice that became litigation, a contract now in dispute. The link is held
   on the CASE, so the notice and the contract do not each keep their own copy
   that can drift — they ask, and the answer is whatever the case says today. */
export function CaseLinks({ type, id }) {
  const [cases, setCases] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!type || !id) return undefined;
    api.litigation.bySource(type, id).then(
      (r) => alive && setCases(r.cases || []),
      () => alive && setCases([])
    );
    return () => { alive = false; };
  }, [type, id]);
  if (!cases || !cases.length) return null;
  return html`<div class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning)">
    <div class="strong" style="font-size:13px;margin-bottom:8px">
      ${cases.length === 1 ? "Escalated to litigation" : "Escalated to " + cases.length + " litigation matters"}
    </div>
    ${cases.map((c) => html`<div key=${c.id} class="row" style="gap:8px;padding:5px 0;align-items:center">
      <div style="flex:1">
        <div class="tiny strong">${c.id} · ${c.title}</div>
        <div class="tiny muted">${[c.stage, c.status, c.nextHearing && ("next hearing " + c.nextHearing)].filter(Boolean).join(" · ")}</div>
      </div>
      ${c.risk && html`<${Pill} tone=${/critical|high/i.test(c.risk) ? "red" : "gray"}>${c.risk}</${Pill}>`}
      <${Btn} size="sm" variant="ghost" onClick=${() => { location.hash = "#/rec/litigation/" + c.id; }}>Open case</${Btn}>
    </div>`)}
  </div>`;
}
