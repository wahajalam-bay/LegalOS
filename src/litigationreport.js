// THE WEEKLY LITIGATION REPORT.
//
// Pick a date range, see what the records say happened, edit it, and take it
// away. The draft is assembled from the register — every line traces to a case,
// a hearing or an invoice — and it is a DRAFT until a lawyer has read it.
//
// The edit is deliberately a plain textarea over the generated markdown rather
// than a rich editor: what leaves this screen should be exactly what somebody
// read and approved, and a formatting layer between the two is one more thing
// that can change the words after they were checked.
import { html, fmt, useState } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Section, Empty, Field, DateInput } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";

/* Monday of the current week, and the Sunday before it — the range somebody
   generating a "weekly" report almost always wants. */
function lastWeek() {
  const now = new Date(Date.now() + 5 * 60 * 60000);            // PKT
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() + 6) % 7;
  const thisMon = new Date(d); thisMon.setUTCDate(d.getUTCDate() - back);
  const from = new Date(thisMon); from.setUTCDate(thisMon.getUTCDate() - 7);
  const to = new Date(thisMon); to.setUTCDate(thisMon.getUTCDate() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function LitigationReport() {
  const wk = lastWeek();
  const [from, setFrom] = useState(wk.from);
  const [to, setTo] = useState(wk.to);
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState(null);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.litigation.report(from, to);
      setRep(r); setText(r.draft || ""); setEdited(false);
    } catch (e) { toast(e.message || "The report could not be assembled.", "error"); }
    finally { setBusy(false); }
  };

  const download = () => {
    try {
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "litigation-report-" + from + "-to-" + to + ".md";
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      toast("Report downloaded.", "success");
    } catch (e) { toast("The download failed.", "error"); }
  };

  const t = rep && rep.totals;
  return html`<div class="col" style="gap:16px">
    <${Section} title="Generate a report" icon="fileText"
      sub="What the records say happened between two dates.">
      <div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
        <${Field} label="Start date">
          <${DateInput} value=${from} onInput=${(e) => setFrom(e.target.value)} /></${Field}>
        <${Field} label="End date">
          <${DateInput} value=${to} onInput=${(e) => setTo(e.target.value)} /></${Field}>
        <${Btn} variant="primary" icon="sparkles" disabled=${busy || !from || !to}
          onClick=${generate}>${busy ? "Assembling…" : "Generate report"}</${Btn}>
        ${rep && html`<${Btn} variant="ghost" icon="download" onClick=${download}>Download</${Btn}>`}
      </div>
      <div class="tiny muted" style="padding-top:10px">
        The draft is assembled from the litigation register — hearings, outcomes, cases opened
        and completed, invoices and upcoming dates. Nothing in it is inferred, and every line
        names the case it came from. Read it before you send it.
      </div>
    </${Section}>

    ${!rep
    ? html`<${Empty} icon="fileText" title="No report yet"
        text="Pick a date range and generate one. It defaults to last week." />`
    : html`<${Section} title="What the records say" icon="activity"
        sub=${"Drawn from " + rep.basis.cases + " cases, " + rep.basis.casesInReport + " of which had activity."}>
        <div class="row" style="gap:18px;flex-wrap:wrap">
          ${[["Hearings recorded", t.hearingsHeld], ["Outcomes not recorded", t.outcomesNotRecorded],
    ["Hearing dates with no record", t.awaitingOutcome], ["Cases opened", t.casesOpened],
    ["Cases completed", t.casesCompleted], ["Hearings coming up", t.upcomingHearings]]
    .map(([label, n]) => html`<div key=${label} class="tiny">
              <span class="muted">${label}:</span> <strong>${n}</strong></div>`)}
        </div>
      </${Section}>

      <${Section} title="Draft" icon="edit"
        sub=${edited ? "Edited — what you send is what is below, not what was generated."
    : "Generated from the records. Edit it before circulating."}
        actions=${edited ? html`<${Pill} tone="amber">Edited</${Pill}>`
    : html`<${Pill} tone="gray">As generated</${Pill}>`}>
        <textarea class="input" rows="26" style="font-family:var(--mono);font-size:12px;line-height:1.6"
          value=${text} onInput=${(e) => { setText(e.target.value); setEdited(true); }}></textarea>
        <div class="row" style="gap:10px;padding-top:10px;align-items:center">
          <${Btn} variant="ghost" icon="refresh" disabled=${busy}
            onClick=${() => { setText(rep.draft); setEdited(false); }}>Reset to the generated draft</${Btn}>
          <${Btn} variant="primary" icon="download" onClick=${download}>Download</${Btn}>
          <span class="tiny muted">${text.length.toLocaleString()} characters</span>
        </div>
      </${Section}>`}
  </div>`;
}
