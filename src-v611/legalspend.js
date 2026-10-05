// LEGAL SPEND — what outside counsel has billed, and what has been paid.
//
// Two populations, shown apart because they answer different questions:
// invoices are billed against a CASE, retainers against a FIRM for a period.
// Splitting a retainer across the cases a firm happens to be running would make
// every one of those cases look more expensive than it was, so the firm and
// entity totals include retainers and the case totals never do.
//
// CURRENCIES ARE NEVER ADDED. A figure mixing PKR and USD means nothing, and
// there is no approved rate configured to convert with, so every total is shown
// per currency.
import { html, fmt, useState, useEffect } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Section, Empty, Field, Input, Modal, DateInput } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";

const money = (v, c) => fmt.money(Number(v) || 0, c || "PKR");

/* One group's figures, per currency, as a compact line. */
function Figures({ byCurrency }) {
  const rows = Object.entries(byCurrency || {});
  if (!rows.length) return html`<span class="tiny muted">—</span>`;
  return html`<div class="col" style="gap:2px">
    ${rows.map(([cur, v]) => html`<div key=${cur} class="tiny">
      <strong>${money(v.invoiced, cur)}</strong> billed ·
      ${money(v.paid, cur)} paid ·
      <span style=${v.outstanding > 0 ? "color:var(--warning-text);font-weight:600" : ""}>
        ${money(v.outstanding, cur)} outstanding</span>
    </div>`)}
  </div>`;
}

function GroupTable({ title, sub, groups, label }) {
  if (!groups || !groups.length) {
    return html`<${Section} title=${title} icon="dollar" sub=${sub}>
      <div class="tiny muted">Nothing recorded yet.</div></${Section}>`;
  }
  return html`<${Section} title=${title} icon="dollar" sub=${sub}>
    <div class="tablewrap"><table class="table">
      <thead><tr><th>${label}</th><th style="text-align:right">Invoices</th><th>Figures</th></tr></thead>
      <tbody>${groups.map((g) => html`<tr key=${g.key}>
        <td><div class="cell-strong">${g.key}</div></td>
        <td style="text-align:right"><span class="tiny">
          ${Object.values(g.byCurrency).reduce((s, v) => s + v.count, 0)}</span></td>
        <td><${Figures} byCurrency=${g.byCurrency} /></td>
      </tr>`)}</tbody>
    </table></div>
  </${Section}>`;
}

export function LegalSpend() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ from: "", to: "", counsel: "", entity: "", nature: "", status: "" });

  const load = (q) => api.litigation.spend(q).then(setD, setErr);
  useEffect(() => { load({}); }, []);

  if (err) return html`<${Empty} icon="alertTriangle" title="Spend could not be read" text=${err.message || String(err)} />`;
  if (!d) return html`<div class="tiny muted" style="padding:20px 2px">Reading legal spend…</div>`;

  const apply = () => {
    const q = {};
    for (const [k, v] of Object.entries(f)) if (v) q[k === "counsel" ? "counsel" : k] = v;
    load(q);
  };
  const clear = () => { setF({ from: "", to: "", counsel: "", entity: "", nature: "", status: "" }); load({}); };
  const active = Object.values(f).filter(Boolean).length;

  return html`<div class="col" style="gap:16px">
    <${Section} title="What legal work has cost" icon="dollar"
      sub="Invoices billed against cases, and retainers billed against firms. Shown apart, and never added across currencies."
      actions=${html`<${Btn} size="sm" variant="primary" icon="plus"
        onClick=${() => setAdding(true)}>Record a retainer</${Btn}>`}>
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <${Field} label="From"><${DateInput} value=${f.from}
          onInput=${(e) => setF({ ...f, from: e.target.value })} /></${Field}>
        <${Field} label="To"><${DateInput} value=${f.to}
          onInput=${(e) => setF({ ...f, to: e.target.value })} /></${Field}>
        <${Field} label="Counsel / firm"><${Input} value=${f.counsel}
          onChange=${(v) => setF({ ...f, counsel: v })} /></${Field}>
        <${Field} label="Entity"><${Input} value=${f.entity}
          onChange=${(v) => setF({ ...f, entity: v })} /></${Field}>
        <${Field} label="Nature">
          <select class="input" value=${f.nature} onChange=${(e) => setF({ ...f, nature: e.target.value })}>
            <option value="">Any</option>
            ${["Case Fee", "TADA", "Miscellaneous Expenses"].map((x) =>
    html`<option key=${x} value=${x} selected=${f.nature === x}>${x}</option>`)}
          </select></${Field}>
        <${Field} label="Payment status">
          <select class="input" value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Any</option>
            ${["Unpaid", "Partially Paid", "Paid", "Disputed"].map((x) =>
    html`<option key=${x} value=${x} selected=${f.status === x}>${x}</option>`)}
          </select></${Field}>
        <${Btn} variant="primary" onClick=${apply}>Apply</${Btn}>
        ${active > 0 && html`<${Btn} variant="ghost" onClick=${clear}>Clear</${Btn}>`}
      </div>
      <div class="row" style="gap:24px;padding-top:14px;flex-wrap:wrap">
        <div><div class="tiny muted">Case invoices (${d.counts.invoices})</div>
          <${Figures} byCurrency=${d.totals.caseInvoices} /></div>
        <div><div class="tiny muted">Retainers (${d.counts.retainers})</div>
          <${Figures} byCurrency=${d.totals.retainers} /></div>
      </div>
      <div class="tiny muted" style="padding-top:10px">
        A retainer is billed to a firm for a period, not to a matter — it is included in the
        firm and entity totals below and never attributed to a case.
      </div>
    </${Section}>

    <${GroupTable} title="By counsel / law firm" label="Firm"
      sub="Includes each firm's retainers." groups=${d.byCounsel} />
    <${GroupTable} title="By entity" label="Entity" groups=${d.byEntity} />
    <${GroupTable} title="By case" label="Case"
      sub="Case invoices only — retainers are not split across matters." groups=${d.byCase} />
    <${GroupTable} title="By nature of invoice" label="Nature" groups=${d.byNature} />
    <${GroupTable} title="By payment status" label="Status" groups=${d.byStatus} />

    ${adding && html`<${RetainerModal} onClose=${() => setAdding(false)}
      onDone=${() => { setAdding(false); load({}); }} />`}
  </div>`;
}

function RetainerModal({ onClose, onDone }) {
  const [f, setF] = useState({ issuingFirm: "", invoiceNumber: "", dateReceived: "",
    amount: "", currency: "PKR", amountPaid: "", paymentDate: "", entity: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target ? e.target.value : e }));
  const save = async () => {
    if (!f.issuingFirm || !f.amount) { setErr("The firm and the amount are both required."); return; }
    setBusy(true); setErr("");
    try { await api.litigation.addRetainer(f); toast("Retainer recorded.", "success"); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return html`<${Modal} title="Record a retainer" icon="dollar" width=${680} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${save}>Record retainer</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      <div class="tiny muted">A retainer is billed to a firm for a period. It is not attributed to any case.</div>
      <div class="modeditgrid">
        <${Field} label="Issuing firm / law firm *"><${Input} value=${f.issuingFirm} onInput=${set("issuingFirm")} /></${Field}>
        <${Field} label="Retainer invoice number"><${Input} value=${f.invoiceNumber} onInput=${set("invoiceNumber")} /></${Field}>
        <${Field} label="Date received"><${DateInput} value=${f.dateReceived} onInput=${set("dateReceived")} /></${Field}>
        <${Field} label="Amount *">
          <div class="row" style="gap:8px">
            <${Input} value=${f.amount} onInput=${set("amount")} />
            <select class="input" style="width:96px;flex:none" value=${f.currency} onChange=${set("currency")}>
              ${["PKR", "USD"].map((c) => html`<option key=${c} value=${c} selected=${f.currency === c}>${c}</option>`)}
            </select>
          </div></${Field}>
        <${Field} label="Amount paid"><${Input} value=${f.amountPaid} onInput=${set("amountPaid")} /></${Field}>
        <${Field} label="Payment date"><${DateInput} value=${f.paymentDate} onInput=${set("paymentDate")} /></${Field}>
        <${Field} label="Entity"><${Input} value=${f.entity} onInput=${set("entity")} /></${Field}>
      </div>
      <${Field} label="Notes"><textarea class="input" rows="2" value=${f.notes} onInput=${set("notes")}></textarea></${Field}>
    </div>
  </${Modal}>`;
}
