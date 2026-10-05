// LOG A HEARING — the thing that happens to a case fifty times.
//
// A case is raised once and heard repeatedly, so this is the screen the
// litigation team actually lives in. Recording a hearing does three things at
// once, and all three matter:
//
//   it becomes a timeline event, so the case reads as a history
//   it MOVES the next-hearing date, rather than leaving the old one behind
//   it replaces the tracked deadline, so nothing is watching a date that has
//   already passed
//
// The last two are why this is not a free-text note. A hearing recorded as
// prose leaves the register still showing last month's date.
import { html, useState, Fragment } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Modal, Field, Input, DateInput, Pill } from "./ui.js";
import { api } from "./api.js";

const KINDS = ["Hearing", "Court Order", "Pleading Filed", "Evidence", "Counsel Update",
  "Settlement", "Judgment", "Recovery", "Internal Note"];

/* IT STARTS FROM THE LAST SITTING (§61).
   A litigator recording the next date has just come from the previous one, and
   most of what they are about to type is a continuation of it. This form
   opened blank on every one of the 357 tracker cases — the case's own history
   was two clicks away on another tab, so the context lived in the lawyer's
   head. The previous hearing is now shown in full, and only the REUSABLE parts
   are prefilled: the purpose usually continues, the forum does not move.

   THE OUTCOME IS NEVER CARRIED FORWARD. Last month's result is not this
   sitting's result, and prefilling it would be the system putting words in a
   lawyer's mouth about something that has not happened yet. */
function priorHearing(record) {
  const all = ((record && (record.caseHearings || record.hearings)) || [])
    .filter((h) => h && h.date)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (all[0]) return all[0];
  /* A tracker case often carries no hearing schedule at all — only the single
     next-hearing date the workbook holds. That date, once it has gone by, IS
     the last sitting, and saying so is better than showing nothing. */
  const next = record && String(record.nextHearing || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(next || "") && next <= new Date().toISOString().slice(0, 10)) {
    return { date: next, purpose: "", outcome: "", nextHearing: "", notes: "", __fromRegister: true };
  }
  return null;
}

export function LogHearing({ caseId, record, onClose, onDone }) {
  const prior = priorHearing(record);
  const [f, setF] = useState({
    kind: "Hearing", date: "", purpose: (prior && prior.purpose) || "", outcome: "", nextHearing: "", text: "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target.value }));
  const isHearing = /hearing|order/i.test(f.kind);

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await api.litigation.addEvent(caseId, f);
      onDone && onDone();
    } catch (e) {
      setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message || "It could not be saved.");
      setSaving(false);
    }
  };

  return html`<${Modal} title="Log case activity" icon="calendar" width=${720} onClose=${onClose}
    footer=${html`<${Fragment}>
      <${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${saving} onClick=${save}>${saving ? "Saving…" : "Save"}</${Btn}>
    </${Fragment}>`}>
    ${err && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-bottom:10px">
      <div class="tiny strong">${err}</div></div>`}
    ${prior && html`<div class="card card--pad" style="margin-bottom:14px;background:var(--surface-2)">
      <div class="row" style="gap:8px;margin-bottom:8px;align-items:center">
        <${Icon} name="clock" size=14 />
        <span class="tiny strong">Last hearing — ${prior.date}</span>
        ${prior.__fromRegister && html`<${Pill} tone="gray">from the tracker's next-hearing date</${Pill}>`}
        <div class="spacer"></div>
        ${!prior.outcome && html`<${Pill} tone="red">Outcome not recorded</${Pill}>`}
      </div>
      <div class="kvgrid" style="grid-template-columns:1fr 1fr">
        <div class="kv"><div class="kv__l">Purpose</div>
          <div class=${"kv__v" + (prior.purpose ? "" : " muted")}>${prior.purpose || "Not recorded"}</div></div>
        <div class="kv"><div class="kv__l">Outcome</div>
          <div class=${"kv__v" + (prior.outcome ? "" : " muted")}>${prior.outcome || "Not recorded"}</div></div>
        <div class="kv"><div class="kv__l">Next date it set</div>
          <div class=${"kv__v" + (prior.nextHearing ? "" : " muted")}>${prior.nextHearing || "None set"}</div></div>
        <div class="kv"><div class="kv__l">Notes left for next time</div>
          <div class=${"kv__v" + (prior.notes ? "" : " muted")}>${prior.notes || "None"}</div></div>
      </div>
      <div class="tiny muted" style="margin-top:8px">
        The purpose is carried forward because it usually continues. The outcome is not — last
        sitting's result is not this one's.</div>
    </div>`}
    <div class="modeditgrid">
      <${Field} label="What happened">
        <select class="select" value=${f.kind} onChange=${set("kind")}>
          ${KINDS.map((k) => html`<option key=${k} value=${k}>${k}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Date"><${DateInput} value=${f.date} onInput=${set("date")} /></${Field}>
      ${isHearing && html`<${Fragment}>
        <${Field} label="Purpose"><${Input} value=${f.purpose} onInput=${set("purpose")} placeholder="e.g. Framing of issues" /></${Field}>
        ${/* No judge/bench here either. The Add hearing sheet dropped it because
              the person recording a date does not have the presiding judge to
              hand and the box sat empty on every hearing entered; this form
              records the same fact about the same case and kept asking. Stored
              values are untouched -- nothing is asked for, nothing is erased. */ ""}
        <${Field} label="Next hearing" hint="Moves the case's next date and its deadline">
          <${DateInput} value=${f.nextHearing} onInput=${set("nextHearing")} />
        </${Field}>
      </${Fragment}>`}
    </div>
    <${Field} label=${isHearing ? "Outcome" : "Note"}>
      <textarea class="input" rows="3" value=${isHearing ? f.outcome : f.text}
        onInput=${isHearing ? set("outcome") : set("text")}></textarea>
    </${Field}>
  </${Modal}>`;
}

export default LogHearing;
