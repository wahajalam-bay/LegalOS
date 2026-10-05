/* REMOVING SOMETHING FROM A TABLE — ONE RULE, ONE DIALOG, EVERY REGISTER.
 *
 * Before this, removing a row meant opening the record, finding the action and
 * asking the head of the team — for everything, including a draft you had
 * raised by mistake thirty seconds earlier. Meanwhile most registers offered no
 * removal at all, so a mistyped notice or a duplicate visit simply stayed on
 * the book for ever.
 *
 * The question "can this be removed, and by whom" has exactly three answers in
 * this product, and they are decided here so that no table can invent a fourth:
 *
 *   DELETE      Yours, raised in LegalOS, and still at a stage where nothing
 *               downstream depends on it. You remove it yourself, with a
 *               reason, and it is a SOFT delete: the record, its author, who
 *               removed it and why all stay on file, and it can be restored.
 *
 *   REQUEST     Raised in LegalOS but not yours, or past the point where it is
 *               only yours to decide. It goes to the head of the team, who sees
 *               the reason and can refuse. Nothing leaves the register until
 *               they approve. This is the pre-existing path and it is unchanged.
 *
 *   PROTECTED   It came from Drive — a tracker row, a filed document, a
 *               statutory record — or it has dependent activity hanging off it.
 *               LegalOS does not own it and will not pretend to delete it. The
 *               dialog says so and names the business action that IS correct
 *               (withdraw, close, mark decided, archive), rather than offering
 *               a button that would either lie or destroy evidence.
 *
 * Nothing here cascades. A record with linked activity is refused with the
 * activity named, because silently deleting a case's hearings and invoices
 * along with it is not a convenience, it is data loss with a friendly label.
 */
import { html, cx, fmt, useState, useEffect, Fragment } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Modal, Field, Pill, Empty, Dropdown, MenuItem } from "./ui.js";
import { toast } from "./toast.js";

/* The reasons a legally meaningful record is removed. "Other" demands a
   sentence, because "Other" on its own tells the next reader nothing. */
export const DELETE_REASONS = [
  "Duplicate entry",
  "Created in error",
  "Incorrect record",
  "Request withdrawn",
  "Replaced by another record",
  "Other",
];

/* A record is the caller's own when they raised it. `createdBy` is the module
   store's shape; the register adapters flatten it to `raisedBy`. */
function ownedBy(record, viewer) {
  if (!record || !viewer) return false;
  const c = record.createdBy || record.__raisedBy || record.raisedBy || record.requestedBy || null;
  const id = (c && (c.id || c)) || record.createdById || record.requesterId || record.requestedById || record.ownerId || null;
  const email = (c && c.email) || record.createdByEmail || record.requestedByEmail || null;
  return (id && id === viewer.id) || (email && viewer.email && email.toLowerCase() === String(viewer.email).toLowerCase());
}

/* Did this row come out of Drive? Every adapter marks its own rows; anything
   NOT marked as raised in the app is treated as source-backed, because failing
   closed is the only safe default for a corpus this system does not own. */
export function isSourceBacked(record) {
  if (!record) return true;
  if (record.__origin === "LEGALOS" || record.origin === "LEGALOS") return false;
  if (record.raisedInApp === true) return false;
  if (record.__sourceType === "LEGALOS_NATIVE") return false;
  // A module-record store row always carries a module + createdAt.
  if (record.module && record.createdAt && !record.__source) return false;
  return true;
}

/* States past which a record is no longer only its author's business. */
const SETTLED = /^(approved|executed|signed|active|closed|completed|decided|delivered|filed|submitted|in review|legal review|under review|assigned|accepted)/i;
const DRAFTY = /^(draft|new|to be assigned|triage|open|pending|raised|complaint raised|scheduled|inspection scheduled|conducted)/i;

/* What depends on this record. Nothing is deleted while any of it exists. */
function dependenciesOf(record) {
  const out = [];
  const n = (v) => (Array.isArray(v) ? v.length : Number(v) || 0);
  if (n(record.caseHearings || record.hearings)) out.push(n(record.caseHearings || record.hearings) + " hearing(s)");
  if (n(record.invoices)) out.push(n(record.invoices) + " invoice(s)");
  if (n(record.driveFiles)) out.push(n(record.driveFiles) + " linked document(s)");
  if (record.linkedCaseId || record.caseId) out.push("a linked litigation case");
  if (n(record.approvals)) out.push(n(record.approvals) + " approval(s)");
  return out;
}

/**
 * The one decision. Returns:
 *   { mode: "delete"|"request"|"protected", noun, why, action }
 * `why` is shown to the reader; `action` names the correct business step when
 * deletion is the wrong verb.
 */
export function deleteEligibility(record, viewer, opts = {}) {
  const noun = opts.noun || "record";
  if (!record) return { mode: "protected", noun, why: "There is no record here." };

  /* A register whose rows are LegalOS's own says so. isSourceBacked fails
     CLOSED — anything it cannot recognise is treated as Drive's — which is the
     right default for a corpus this system does not own, but it means a store
     with its own shape (requests, tasks) has to declare itself rather than be
     guessed at. */
  if (!opts.native && isSourceBacked(record)) {
    return {
      mode: "protected", noun,
      why: "This row comes from the source tracker in Drive, not from LegalOS. Removing it here would "
        + "not remove it from the source, and the next refresh would bring it back — so LegalOS does not "
        + "offer to delete it.",
      action: opts.sourceAction || "Correct it at the source, or use the record's own business action "
        + "(close, withdraw, mark decided) if it has run its course.",
    };
  }

  const deps = dependenciesOf(record);
  if (deps.length) {
    return {
      mode: "protected", noun,
      why: "This " + noun + " has activity recorded against it — " + deps.join(", ") + ". Deleting it would "
        + "take that with it.",
      action: opts.dependencyAction || "Close or withdraw it instead; the history stays readable.",
    };
  }

  const status = String(record.status || record.stage || record.__stage || "").trim();
  const mine = ownedBy(record, viewer);
  const settled = status && SETTLED.test(status) && !DRAFTY.test(status);

  if (mine && !settled) {
    return { mode: "delete", noun, why: "You raised this and nothing has happened to it yet." };
  }
  if (settled) {
    return {
      mode: "request", noun,
      why: "This has moved past the point where it is only yours to withdraw"
        + (status ? " — it is at " + status + "." : "."),
    };
  }
  return { mode: "request", noun, why: "This was raised by someone else, so the head of the team decides." };
}

/* ------------------------------------------------------------- the dialog */

/**
 * One confirmation for every table. Never `window.confirm`: a browser dialog
 * cannot say what will happen, cannot take a reason and cannot be styled to
 * look like it belongs to this product.
 *
 * `onDelete(reason)` must return a promise. The caller removes the row from
 * its own list on success — the table must not wait for a reload.
 */
export function DeleteDialog({ record, title, eligibility, requireReason = true, onDelete, onRequest, onClose, onDone }) {
  const e = eligibility;
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsNote = reason === "Other";
  const full = reason === "Other" ? note.trim() : (reason + (note.trim() ? " — " + note.trim() : ""));

  const go = async () => {
    if (requireReason && !reason) { setErr("Choose a reason."); return; }
    if (needsNote && !note.trim()) { setErr("Say what the reason is."); return; }
    setBusy(true); setErr("");
    try {
      if (e.mode === "delete") { await onDelete(full); }
      else { await onRequest(full); }
      onDone && onDone(full);
    } catch (x) {
      setErr((x.payload && x.payload.errors && x.payload.errors.join(" · "))
        || (x.payload && x.payload.detail) || x.message || "It could not be done.");
      setBusy(false);
    }
  };

  const heading = e.mode === "protected" ? "This cannot be deleted"
    : e.mode === "request" ? "Ask for this to be removed"
      : "Remove this " + e.noun + "?";

  return html`<${Modal} title=${heading} icon=${e.mode === "protected" ? "lock" : "trash"} width=${560} onClose=${onClose}
    footer=${e.mode === "protected"
      ? html`<${Btn} variant="primary" onClick=${onClose}>Close</${Btn}>`
      : html`<${Fragment}>
          <${Btn} onClick=${onClose}>Cancel</${Btn}>
          <${Btn} variant=${e.mode === "delete" ? "danger" : "primary"} icon="check" disabled=${busy} onClick=${go}>
            ${busy ? "Working…" : e.mode === "delete" ? "Remove" : "Send for approval"}</${Btn}>
        </${Fragment}>`}>
    ${err && html`<div class="banner banner--warn" style="margin-bottom:12px">
      <${Icon} name="alertTriangle" size=15 /><span class="tiny">${err}</span></div>`}

    <div class="card card--pad" style="background:var(--surface-2);margin-bottom:14px">
      <div class="strong" style="font-size:13.5px">${title || record.id}</div>
      <div class="tiny muted" style="margin-top:4px;line-height:1.5">${e.why}</div>
    </div>

    ${e.mode === "protected" && e.action && html`<div class="tiny" style="line-height:1.6">
      <strong>What to do instead.</strong> ${e.action}</div>`}

    ${e.mode !== "protected" && html`<${Fragment}>
      <div class="tiny muted" style="margin-bottom:12px;line-height:1.6">
        ${e.mode === "delete"
          ? "It leaves the active register. Nothing is destroyed — the record, who raised it, who removed it and why all stay on file, and it can be restored."
          : "It stays on the register until the head of the team approves. They see your reason and can refuse."}
      </div>
      <${Field} label="Reason *">
        <div class="row wrap" style="gap:8px">
          ${DELETE_REASONS.map((r) => html`<button key=${r} type="button"
            class=${cx("fltbtn", reason === r && "fltbtn--on")}
            aria-pressed=${reason === r ? "true" : "false"}
            onClick=${() => setReason(r)}>${r}</button>`)}
        </div>
      </${Field}>
      <${Field} label=${needsNote ? "Say what the reason is *" : "Anything to add"}>
        <textarea class="input" rows="2" value=${note} onInput=${(ev) => setNote(ev.target.value)}
          placeholder=${needsNote ? "e.g. raised against the wrong entity" : "Optional"}></textarea>
      </${Field}>
    </${Fragment}>`}
  </${Modal}>`;
}

/* ------------------------------------------------------- the row control */

/**
 * The row's action area: one Open, and everything else behind a menu, so a
 * table does not grow five permanent buttons per row. It is a real button in
 * the tab order — a delete that only appears on hover cannot be reached by
 * keyboard and does not exist on a touch screen.
 */
export function RowActions({ items }) {
  const live = (items || []).filter(Boolean);
  if (!live.length) return null;
  /* The trigger is NOT a <button>: Dropdown wraps whatever it is given in its
     own <button class="ddtrigger">, and a button inside a button is invalid
     markup whose inner click the browser may swallow — which is exactly what
     happened the first time this was wired. A span, styled as the icon
     control, keeps one real button in the tab order. */
  /* THE MENU IS NOT THE ROW. The row opens the record on click; the action
     control sits inside it, so without this the same click did both — opened
     the menu AND opened the editor behind it, leaving two dialogs stacked.
     One wrapper swallows the click for the whole control, trigger and items
     alike, rather than each item remembering to. */
  return html`<div style="display:inline-flex" onClick=${(e) => e.stopPropagation()}>
    <${Dropdown} align="right" width=${210} label="More actions for this row"
      trigger=${html`<span class="iconbtn" aria-hidden="true"><${Icon} name="moreV" size=16 /></span>`}>
      ${live.map((it) => html`<${MenuItem} key=${it.label} icon=${it.icon} danger=${it.danger}
        onClick=${() => it.onClick()}>${it.label}</${MenuItem}>`)}
    </${Dropdown}>
  </div>`;
}

/* The toast a removal leaves behind, with the one control that matters.
   Undo is here rather than only in a Removed view because the mistake a person
   most wants back is the one they made two seconds ago, and making them go
   looking for it is how a soft delete ends up feeling like a hard one. */
export function removedToast(label, onUndo) {
  const name = label || "Record";
  if (!onUndo) { toast(name + " removed", "success"); return; }
  toast(name + " removed", "success", undefined, {
    action: { label: "Undo", onClick: async () => { await onUndo(); toast(name + " restored", "success"); } },
  });
}

/* ------------------------------------------------------- the removed view */

/* WHERE A SOFT DELETE GOES (§99).
 *
 * A soft delete that nobody can see is indistinguishable from a hard one: the
 * record is on the server with its author, its remover and its reason, and if
 * the only way to reach any of that is a database query then the "restore with
 * history intact" we promise in the dialog is a promise to nobody.
 *
 * So every register that can remove a row can also show what it removed. It is
 * deliberately a footnote and not a tab — removed records are not part of the
 * working register, and putting them level with it would invite people to read
 * the two as one list. It appears only when there is something in it.
 */
export function RemovedRecords({ rows, labelOf, onRestore, noun = "record" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const list = rows || [];
  if (!list.length) return null;

  const restore = async (r) => {
    setBusy(r.id);
    try { await onRestore(r); } finally { setBusy(null); }
  };

  return html`<${Fragment}>
    <div class="row" style="margin-top:10px">
      <button type="button" class="linkbtn tiny muted" onClick=${() => setOpen(true)}>
        <${Icon} name="trash" size=13 />
        ${" " + list.length + " removed " + (list.length === 1 ? noun : noun + "s") + " — view or restore"}
      </button>
    </div>
    ${open && html`<${Modal} title="Removed records" size="lg" onClose=${() => setOpen(false)}
      footer=${html`<${Btn} onClick=${() => setOpen(false)}>Close</${Btn}>`}>
      <p class="tiny muted" style="margin:0 0 12px">
        ${"Nothing here has been destroyed. Each record is on file with who raised it, who removed it and why, and restoring one brings it back to the register with its history intact."}
      </p>
      <div class="tablewrap">
        <table class="dt">
          <thead><tr><th>${"Record"}</th><th>${"Removed"}</th><th>${"By"}</th><th>${"Reason"}</th><th></th></tr></thead>
          <tbody>
            ${list.map((r) => html`<tr key=${r.id}>
              <td><span class="cell-strong">${labelOf ? labelOf(r) : r.id}</span></td>
              <td class="tiny muted">${r.deletedAt ? fmt.date(r.deletedAt) : "—"}</td>
              <td class="tiny">${r.deletedBy || "—"}</td>
              <td class="tiny muted">${reasonOf(r) || "—"}</td>
              <td style="text-align:right">
                <${Btn} size="sm" icon="refresh" disabled=${busy === r.id}
                  onClick=${() => restore(r)}>${busy === r.id ? "Restoring…" : "Restore"}</${Btn}>
              </td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </${Modal}>`}
  </${Fragment}>`;
}

/* The reason lives on the audit entry, which is where it belongs — a reason
   without who gave it and when is not a reason, it is a note. */
function reasonOf(r) {
  const log = (r && r.audit) || [];
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i] && log[i].action === "deleted") return log[i].detail || "";
  }
  return r && r.deleteReason ? r.deleteReason : "";
}

/* --------------------------------------------------------- removing many */

/**
 * BULK REMOVAL (§101), WHICH IS NOT "THE SAME DIALOG, N TIMES".
 *
 * A selection is almost never uniform: some rows are yours and untouched, some
 * have moved on, some came out of Drive. A bulk control that either refuses the
 * whole selection or silently deletes the part it can are both wrong — the
 * first makes the feature useless on any real selection, the second removes
 * things the reader did not realise were included.
 *
 * So the dialog SORTS the selection first and says, in plain numbers, what will
 * happen to each part before anything happens to any of it. It acts only on the
 * removable ones, reports what it actually did, and leaves the rest selected so
 * the reader can see what was left behind.
 */
export function BulkDeleteDialog({ records, viewer, noun = "record", onDelete, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState(null);
  const needsNote = reason === "Other";
  const full = reason === "Other" ? note.trim() : (reason + (note.trim() ? " — " + note.trim() : ""));

  const sorted = (records || []).reduce((acc, r) => {
    const e = deleteEligibility(r, viewer, { noun, native: true });
    acc[e.mode].push(r);
    return acc;
  }, { delete: [], request: [], protected: [] });

  const go = async () => {
    if (!reason) { setErr("Choose a reason."); return; }
    if (needsNote && !note.trim()) { setErr("Say what the reason is."); return; }
    setBusy(true); setErr("");
    const done = [], failed = [];
    for (let i = 0; i < sorted.delete.length; i++) {
      setProgress({ i: i + 1, n: sorted.delete.length });
      try { await onDelete(sorted.delete[i], full); done.push(sorted.delete[i]); }
      catch (x) { failed.push({ r: sorted.delete[i], msg: x.message || "refused" }); }
    }
    setProgress(null); setBusy(false);
    if (failed.length && !done.length) { setErr(failed.length + " could not be removed: " + failed[0].msg); return; }
    onDone && onDone({ removed: done, failed });
  };

  const plural = (n) => n + " " + noun + (n === 1 ? "" : "s");

  return html`<${Modal} title=${"Remove " + plural(sorted.delete.length) + "?"} icon="trash" width=${560} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="danger" icon="check" disabled=${busy || !sorted.delete.length} onClick=${go}>
        ${busy ? (progress ? "Removing " + progress.i + " of " + progress.n + "…" : "Working…")
          : "Remove " + plural(sorted.delete.length)}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="banner banner--warn" style="margin-bottom:12px">
      <${Icon} name="alertTriangle" size=15 /><span class="tiny">${err}</span></div>`}

    <div class="card card--pad" style="background:var(--surface-2);margin-bottom:14px">
      <div class="tiny" style="line-height:1.7">
        <div><strong>${plural(sorted.delete.length)}</strong>${" will be removed. Nothing is destroyed — each stays on file and can be restored."}</div>
        ${sorted.request.length > 0 && html`<div style="margin-top:6px">
          <strong>${plural(sorted.request.length)}</strong>
          ${" will be left alone — they have moved past the point where they are yours to withdraw, and need the head of the team. Remove those one at a time so the reason reaches the right person."}</div>`}
        ${sorted.protected.length > 0 && html`<div style="margin-top:6px">
          <strong>${plural(sorted.protected.length)}</strong>
          ${" cannot be removed at all — they come from the source tracker, or have activity recorded against them."}</div>`}
      </div>
    </div>

    ${sorted.delete.length === 0
      ? html`<div class="tiny muted" style="line-height:1.6">
          ${"Nothing in this selection can be removed here. Clear it and pick rows you raised that have not moved on."}</div>`
      : html`<${Fragment}>
        <${Field} label="Reason * — the same reason is recorded against every one of them">
          <div class="row wrap" style="gap:8px">
            ${DELETE_REASONS.map((r) => html`<button key=${r} type="button"
              class=${cx("fltbtn", reason === r && "fltbtn--on")}
              aria-pressed=${reason === r ? "true" : "false"}
              onClick=${() => setReason(r)}>${r}</button>`)}
          </div>
        </${Field}>
        <${Field} label=${needsNote ? "Say what the reason is *" : "Anything to add"}>
          <textarea class="input" rows="2" value=${note} onInput=${(ev) => setNote(ev.target.value)}
            placeholder=${needsNote ? "e.g. duplicated by an import" : "Optional"}></textarea>
        </${Field}>
      </${Fragment}>`}
  </${Modal}>`;
}

/* ------------------------------------------------- archiving, and bulk edit */

export const ARCHIVE_REASONS = [
  "Concluded", "Superseded by a later record", "Expired and not renewed",
  "Transferred out of Legal", "No longer relevant", "Other",
];

/**
 * ARCHIVE IS NOT DELETE, SO IT DOES NOT ASK THE DELETE QUESTIONS.
 *
 * Deleting needs an eligibility ladder because it says a record should not
 * exist. Archiving says the opposite — this happened and it is finished — so
 * anything can be archived, including a row that came out of a Drive workbook:
 * the state is LegalOS's own overlay and Drive is never written to. It is one
 * click to reverse and the audit records who did it.
 */
export function ArchiveDialog({ records, noun = "record", labelOf, onArchive, onClose, onDone }) {
  const many = (records || []).length > 1;
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState(null);
  const needsNote = reason === "Other";
  const full = reason === "Other" ? note.trim() : (reason + (note.trim() ? " — " + note.trim() : ""));

  const go = async () => {
    if (!reason) { setErr("Choose a reason."); return; }
    if (needsNote && !note.trim()) { setErr("Say what the reason is."); return; }
    setBusy(true); setErr("");
    const done = [], failed = [];
    for (let i = 0; i < records.length; i++) {
      setProgress({ i: i + 1, n: records.length });
      try { await onArchive(records[i], full); done.push(records[i]); }
      catch (x) { failed.push({ r: records[i], msg: x.message || "refused" }); }
    }
    setProgress(null); setBusy(false);
    if (failed.length && !done.length) { setErr(failed[0].msg); return; }
    onDone && onDone({ archived: done, failed });
  };

  const title = many ? "Archive " + records.length + " " + noun + "s?"
    : "Archive this " + noun + "?";

  return html`<${Modal} title=${title} icon="box" width=${560} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${go}>
        ${busy ? (progress ? "Archiving " + progress.i + " of " + progress.n + "…" : "Working…")
          : (many ? "Archive " + records.length + " " + noun + "s" : "Archive")}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="banner banner--warn" style="margin-bottom:12px">
      <${Icon} name="alertTriangle" size=15 /><span class="tiny">${err}</span></div>`}

    <div class="card card--pad" style="background:var(--surface-2);margin-bottom:14px">
      ${!many && html`<div class="strong" style="font-size:13.5px">${(labelOf && labelOf(records[0])) || records[0].id}</div>`}
      <div class="tiny muted" style="margin-top:4px;line-height:1.55">
        ${"It comes off the working register and out of the counts. Nothing is deleted — the record keeps every field, every document and its whole history, it stays searchable, and it can be brought back in one click. Nothing is written back to Drive."}
      </div>
    </div>

    <${Field} label="Reason *">
      <div class="row wrap" style="gap:8px">
        ${ARCHIVE_REASONS.map((r) => html`<button key=${r} type="button"
          class=${cx("fltbtn", reason === r && "fltbtn--on")}
          aria-pressed=${reason === r ? "true" : "false"}
          onClick=${() => setReason(r)}>${r}</button>`)}
      </div>
    </${Field}>
    <${Field} label=${needsNote ? "Say what the reason is *" : "Anything to add"}>
      <textarea class="input" rows="2" value=${note} onInput=${(e) => setNote(e.target.value)}
        placeholder=${needsNote ? "e.g. the project completed and the file is closed" : "Optional"}></textarea>
    </${Field}>
  </${Modal}>`;
}

/**
 * CHANGING ONE FIELD ON SEVERAL RECORDS AT ONCE.
 *
 * The thing people actually do to a table after selecting rows is not delete
 * them — it is set them all to the same thing: assign a batch, move a stage,
 * mark a status. Doing that one row at a time is how a register of two hundred
 * becomes an afternoon.
 *
 * ONE FIELD PER PASS, ON PURPOSE. A form that edits six fields at once cannot
 * show you what it is about to change, and "apply to 40 records" is not a
 * moment for ambiguity: pick the field, pick the value, see the count, confirm.
 * The old value of every record is returned so the caller can offer an undo.
 */
export function BulkEditDialog({ records, fields, noun = "record", labelOf, onApply, onClose, onDone }) {
  const [field, setField] = useState((fields && fields[0] && fields[0].key) || "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState(null);
  const def = (fields || []).find((f) => f.key === field) || null;
  const n = (records || []).length;

  /* What each record holds today, so the reader can see what they are about to
     overwrite rather than discovering it afterwards. */
  const current = {};
  for (const r of records || []) {
    const v = String(r[field] == null ? "" : r[field]).trim() || "—";
    current[v] = (current[v] || 0) + 1;
  }
  const distinct = Object.entries(current).sort((a, b) => b[1] - a[1]);

  const go = async () => {
    if (!field) { setErr("Choose what to change."); return; }
    if (value === "" || value == null) { setErr("Choose the new value."); return; }
    setBusy(true); setErr("");
    const done = [], failed = [];
    for (let i = 0; i < records.length; i++) {
      setProgress({ i: i + 1, n: records.length });
      const was = records[i][field];
      try { await onApply(records[i], field, value); done.push({ record: records[i], was }); }
      catch (x) { failed.push({ r: records[i], msg: x.message || "refused" }); }
    }
    setProgress(null); setBusy(false);
    if (failed.length && !done.length) { setErr(failed[0].msg); return; }
    onDone && onDone({ changed: done, failed, field, value });
  };

  return html`<${Modal} title=${"Update " + n + " " + noun + (n === 1 ? "" : "s")} icon="edit" width=${580} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !field || value === ""} onClick=${go}>
        ${busy ? (progress ? "Updating " + progress.i + " of " + progress.n + "…" : "Working…")
          : "Update " + n + " " + noun + (n === 1 ? "" : "s")}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="banner banner--warn" style="margin-bottom:12px">
      <${Icon} name="alertTriangle" size=15 /><span class="tiny">${err}</span></div>`}

    <${Field} label="What to change">
      <div class="row wrap" style="gap:8px">
        ${(fields || []).map((f) => html`<button key=${f.key} type="button"
          class=${cx("fltbtn", field === f.key && "fltbtn--on")}
          aria-pressed=${field === f.key ? "true" : "false"}
          onClick=${() => { setField(f.key); setValue(""); }}>${f.label}</button>`)}
      </div>
    </${Field}>

    ${field && html`<div class="card card--pad" style="background:var(--surface-2);margin:2px 0 14px">
      <div class="tiny muted" style="line-height:1.6">
        ${"These " + n + " " + noun + (n === 1 ? "" : "s") + " currently hold: "}
        ${distinct.slice(0, 4).map(([v, c], i) => html`<span key=${i}><strong>${v}</strong>${" ×" + c}${i < Math.min(distinct.length, 4) - 1 ? ", " : ""}</span>`)}
        ${distinct.length > 4 && html`<span>${" and " + (distinct.length - 4) + " more"}</span>`}
        ${". Every one of them will be set to the value below."}
      </div>
    </div>`}

    <${Field} label=${"New value" + (def ? " for " + def.label : "")}>
      ${def && def.options && def.options.length
        ? html`<select class="input" value=${value} onChange=${(e) => setValue(e.target.value)}>
            <option value="">${"Choose…"}</option>
            ${def.options.map((o) => html`<option key=${o} value=${o}>${o}</option>`)}
          </select>`
        : html`<input class="input" value=${value} onInput=${(e) => setValue(e.target.value)}
            placeholder=${def ? "The new " + def.label.toLowerCase() : "New value"} />`}
    </${Field}>
  </${Modal}>`;
}
