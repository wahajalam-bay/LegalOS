/* "SUMMARISE THIS RECORD" — and the line it will not cross.
 *
 * This asks Claude about ONE record using its fields and its documents'
 * METADATA: how many documents, what kind of instrument each is, where each
 * sits in the agreement's life, what is missing. It does not have the text of
 * any document and must never look as though it does.
 *
 * That distinction is the whole design problem here. A fluent paragraph about a
 * contract reads exactly like something written after reading the contract, and
 * a lawyer acting on it would be entitled to assume so. So the panel states
 * what it was given, every time, above the answer — not in a tooltip, not in
 * small print at the bottom of a settings page.
 */
import { html, useState } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill } from "./ui.js";
import { api } from "./api.js";

const ASKS = [
  { key: "summary", label: "Summarise", ask: "Summarise this record and the documents held against it. Note anything missing or inconsistent." },
  { key: "chain", label: "Agreement history", ask: "Describe the sequence of documents — original, amendments, extensions, terminations — in date order. Say plainly if the sequence looks incomplete." },
  { key: "gaps", label: "What's missing", ask: "What would you expect a record of this kind to hold that is absent here? List only what is genuinely missing from the fields and documents given." },
];

export function RecordAssist({ family, rec }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [err, setErr] = useState(null);
  const [used, setUsed] = useState(null);

  if (!family || !rec || !rec.id) return null;

  const run = async (ask) => {
    setBusy(true); setErr(null); setAnswer(null);
    try {
      const r = await api.assistant.record(family, rec.id, ask);
      if (r.ok) { setAnswer(r.answer); setUsed(r.documents); }
      else setErr(r.error || "The assistant could not answer.");
    } catch (e) {
      setErr((e && e.message) || "The assistant is unavailable.");
    } finally { setBusy(false); }
  };

  return html`<div class="col" style="gap:8px">
    <div class="row" style="gap:8px;align-items:center">
      <${Btn} size="sm" variant="ghost" icon="cpu" onClick=${() => setOpen(!open)}>
        ${open ? "Hide assistant" : "Ask Claude about this record"}
      </${Btn}>
      ${open && html`<${Pill} tone="gray"
        title="This summarises the record's fields and its documents' metadata. It has not read the documents.">
        record fields + document metadata
      </${Pill}>`}
    </div>

    ${open && html`<div class="col" style="gap:8px;padding:10px;border:1px solid var(--line);border-radius:8px">
      ${/* Stated ABOVE the answer, every time. A reader who skips it is not who
            this is for; a reader who acts on a fluent paragraph is. */ ""}
      <div class="tiny muted">
        Answers from this record's fields and the <strong>metadata</strong> of its
        ${(rec.driveFiles || []).length} document${(rec.driveFiles || []).length === 1 ? "" : "s"} —
        filenames, instrument types and lifecycle stages. <strong>The documents themselves have not been read.</strong>
        For what a document says, open it.
      </div>
      <div class="row wrap" style="gap:6px">
        ${ASKS.map((a) => html`<${Btn} key=${a.key} size="sm" variant="ghost" disabled=${busy}
          onClick=${() => run(a.ask)}>${a.label}</${Btn}>`)}
      </div>
      ${busy && html`<div class="tiny muted">Thinking…</div>`}
      ${err && html`<div class="tiny" style="color:var(--red,#c00)">${err}</div>`}
      ${answer && html`<div class="col" style="gap:6px">
        <div class="tiny" style="white-space:pre-wrap">${answer}</div>
        <div class="tiny muted">
          <${Icon} name="info" size=11 /> Based on ${used} document${used === 1 ? "" : "s"}' metadata and this record's fields — not on document text.
        </div>
      </div>`}
    </div>`}
  </div>`;
}
