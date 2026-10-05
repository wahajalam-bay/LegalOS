/* RECORD THE DECISION — what actually happened to a case.
 *
 * The register reported "Outcome not recorded" against every decided matter in
 * the book, and it was right to: there was nowhere to record one. "Mark
 * decided" existed, but only on a case raised inside LegalOS — one of three
 * hundred and fifty-eight. Every other case comes from a Drive tracker, is
 * read-only, and could be given a hearing but never a result.
 *
 * Two rules this form exists to keep:
 *
 *   NOTHING IS INFERRED. A win is recorded by a person, here, or it is not a
 *   win. The trackers' status text ("Disposed", "Dismissed") says a matter
 *   ended, not who came out ahead — a suit against the company that was
 *   dismissed and a suit of the company's that was dismissed read identically.
 *
 *   A DECISION IS A RECORD, NOT A FLAG. The date, the result, what was decided
 *   and the judgment it came from are all part of it, so the next person to
 *   open the case can see what happened without asking the lawyer who closed it.
 */
import { html, useState, useEffect, Fragment } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Modal, Field, Input, Textarea, DateInput, Pill } from "./ui.js";
import { api } from "./api.js";
import { OUTCOMES, OUTCOME_TONE } from "./litigationmodel.js";

/* "Not Recorded" is offered LAST and is not a result — it is how a decision
   entered in error is taken back to "we do not know". The seven states are the
   product's own; see litigationmodel.js. */
const CHOICES = OUTCOMES.filter((o) => o !== "Not Recorded");

const HINT = {
  "Successful / Won": "The forum decided in the company's favour.",
  "Adverse / Lost": "The forum decided against the company.",
  "Settled": "Ended by agreement between the parties, in or out of court.",
  "Withdrawn": "The party that brought it took it back.",
  "Dismissed": "The forum dismissed it — say in the summary whose case was dismissed.",
  "Partial / Other": "Split, remanded, transferred, or anything the five above do not describe.",
};

export function RecordDecision({ caseId, record, onClose, onDone }) {
  const [f, setF] = useState({ outcomeCode: "", decisionDate: "", summary: "", judgment: "", notes: "" });
  const [existing, setExisting] = useState(undefined);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));

  /* A decision already on file is loaded in, so this screen corrects rather
     than silently replacing — and the reader can see what is being changed. */
  useEffect(() => {
    let alive = true;
    api.litigation.decision(caseId).then((r) => {
      if (!alive) return;
      const d = r && r.decision;
      setExisting(d || null);
      if (d) setF({ outcomeCode: d.outcomeCode || "", decisionDate: d.decisionDate || "",
        summary: d.summary || "", judgment: d.judgment || "", notes: d.notes || "" });
    }, () => alive && setExisting(null));
    return () => { alive = false; };
  }, [caseId]);

  const save = async () => {
    if (!f.outcomeCode) { setErr("Say what the result was."); return; }
    if (!f.decisionDate) { setErr("A decision needs the date it was given."); return; }
    setSaving(true); setErr("");
    try {
      await api.litigation.recordDecision(caseId, f);
      onDone && onDone();
    } catch (e) {
      setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message || "It could not be saved.");
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true); setErr("");
    try { await api.litigation.clearDecision(caseId); onDone && onDone(); }
    catch (e) { setErr(e.message || "It could not be cleared."); setSaving(false); }
  };

  return html`<${Modal} title=${existing ? "Correct the decision" : "Record the decision"} icon="gavel"
    width=${820} onClose=${onClose}
    footer=${html`<${Fragment}>
      ${existing && html`<${Btn} onClick=${clear} disabled=${saving}>Remove the decision</${Btn}>`}
      <div class="spacer"></div>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${saving} onClick=${save}>
        ${saving ? "Saving…" : existing ? "Save the correction" : "Record it"}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="banner banner--warn" style="margin-bottom:12px">
      <${Icon} name="alertTriangle" size=15 /><span class="tiny">${err}</span></div>`}

    <div class="tiny muted" style="margin-bottom:12px">
      ${record && record.title ? record.title + " · " : ""}This is the only thing in LegalOS that says a case
      was won or lost. Nothing is read from the tracker's status text, because "disposed" and "dismissed"
      describe how a matter ended, not who came out ahead.
    </div>

    ${existing && html`<div class="banner" style="margin-bottom:12px">
      <${Icon} name="clock" size=15 />
      <span class="tiny">Recorded as <b>${existing.outcomeCode}</b> on ${existing.decisionDate}
        by ${existing.recordedByName || existing.recordedBy || "someone"}.
        ${(existing.history || []).length ? ` Corrected ${existing.history.length} time${existing.history.length === 1 ? "" : "s"} before.` : ""}
        Saving again keeps the old entry in the case's history.</span>
    </div>`}

    <${Field} label="What was the result *">
      <div class="row wrap" style="gap:8px">
        ${CHOICES.map((o) => html`<button key=${o} type="button"
          class=${"fltbtn" + (f.outcomeCode === o ? " fltbtn--on" : "")}
          aria-pressed=${f.outcomeCode === o ? "true" : "false"}
          title=${HINT[o]}
          onClick=${() => setF((d) => ({ ...d, outcomeCode: o }))}>
          <${Pill} tone=${OUTCOME_TONE[o] || "gray"}>${o}</${Pill}></button>`)}
      </div>
    </${Field}>
    ${f.outcomeCode && html`<div class="tiny muted" style="margin:-4px 0 12px">${HINT[f.outcomeCode]}</div>`}

    <div class="modeditgrid">
      <${Field} label="Decision date *" hint="The day the forum gave it — not the day it was recorded here.">
        <${DateInput} value=${f.decisionDate} onInput=${set("decisionDate")} /></${Field}>
      <${Field} label="Judgment / order reference" hint="How the order is identified — its number, or where the copy is filed.">
        <${Input} value=${f.judgment} onInput=${set("judgment")} placeholder="e.g. Order dated 12/03/2026, C.M. 4471/25" /></${Field}>
    </div>
    <${Field} label="What was decided"
      hint="A sentence a colleague can read in a year. For a dismissal, say whose case was dismissed.">
      <${Textarea} rows=${3} value=${f.summary} onInput=${set("summary")} /></${Field}>
    <${Field} label="Final notes" hint="Anything that follows from it — costs, appeal period, what has to happen next.">
      <${Textarea} rows=${3} value=${f.notes} onInput=${set("notes")} /></${Field}>
  </${Modal}>`;
}
