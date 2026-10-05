// A CASE'S INVOICES.
//
// What outside counsel has billed on this matter, what has been paid, and what
// is outstanding — in chronological order, because the question is nearly
// always "what has this cost so far" rather than "show me the biggest bill".
//
// Payment % and outstanding are DERIVED from the amount and what was paid,
// unless the record states them. A historical row that says 40% when its own
// figures say 38% is telling us what was agreed, and recomputing it silently
// would make the import unreconcilable against its source. Where a figure was
// derived rather than stated, the screen says so.
//
// Every invoice document is also one of the case's documents — the same logical
// document, reachable from either side, not a second copy.
import { html, cx, fmt, useState } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Section, Empty, Field, Input, Modal, DateInput } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";

const NATURES = ["Case Fee", "TADA", "Miscellaneous Expenses"];
const TONE = { Paid: "green", "Partially Paid": "amber", Unpaid: "gray", Disputed: "red" };

const n = (v) => (v === "" || v == null ? null : Number(v));
const amount = (v, cur) => (n(v) == null ? "—" : fmt.money(n(v), cur || "PKR"));

export function CaseInvoices({ record, onChanged }) {
  const [adding, setAdding] = useState(false);
  const invoices = (record.invoices || []).slice()
    .sort((a, b) => String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || "")));

  /* Per currency, because a total that mixes PKR and USD means nothing. */
  const totals = {};
  for (const i of invoices) {
    const c = i.currency || "PKR";
    const t = totals[c] || (totals[c] = { invoiced: 0, paid: 0, outstanding: 0 });
    t.invoiced += n(i.amount) || 0;
    t.paid += n(i.amountPaid) || 0;
    t.outstanding += n(i.outstanding) || 0;
  }

  return html`<div class="col" style="gap:16px">
    <${Section} title=${"Invoices (" + invoices.length + ")"} icon="dollar"
      sub="Billed against this matter, oldest first."
      actions=${html`<${Btn} size="sm" variant="primary" icon="plus"
        onClick=${() => setAdding(true)}>Record an invoice</${Btn}>`}>
      ${invoices.length === 0
    ? html`<${Empty} icon="dollar" title="Nothing billed yet"
        text="No invoice has been recorded against this case." />`
    : html`<${Fragmentish}>
        <div class="row" style="gap:16px;flex-wrap:wrap;padding-bottom:10px">
          ${Object.entries(totals).map(([cur, t]) => html`<div key=${cur} class="tiny">
            <span class="muted">${cur}:</span>
            <strong>${fmt.money(t.invoiced, cur)}</strong> billed ·
            ${fmt.money(t.paid, cur)} paid ·
            <span style=${t.outstanding > 0 ? "color:var(--warning-text);font-weight:600" : ""}>
              ${fmt.money(t.outstanding, cur)} outstanding</span>
          </div>`)}
        </div>
        <div class="tablewrap"><table class="table">
          <thead><tr><th>Date</th><th>Invoice</th><th>Nature</th><th>Firm</th>
            <th style="text-align:right">Amount</th><th style="text-align:right">Paid</th>
            <th style="text-align:right">%</th><th style="text-align:right">Outstanding</th>
            <th>Paid on</th><th>Status</th><th>Docs</th></tr></thead>
          <tbody>${invoices.map((i) => html`<tr key=${i.id}>
            <td><span class="tiny">${i.invoiceDate ? fmt.dateShort(i.invoiceDate) : "—"}</span></td>
            <td><div class="cell-strong">${i.invoiceNumber || i.id}</div>
              ${i.jeffiNo && html`<div class="tiny muted">JEFFI ${i.jeffiNo}</div>`}</td>
            <td><span class="tiny">${i.nature || "—"}</span></td>
            <td><span class="tiny">${i.issuingFirm || "—"}</span></td>
            <td style="text-align:right"><span class="cell-strong">${amount(i.amount, i.currency)}</span></td>
            <td style="text-align:right"><span class="tiny">${amount(i.amountPaid, i.currency)}</span></td>
            <td style="text-align:right">
              ${n(i.paymentPercent) == null ? html`<span class="tiny muted">—</span>`
    : html`<span class="tiny" title=${i.derived && i.derived.paymentPercent
      ? "Worked out from the amount and what has been paid"
      : "Stated on the invoice record, not computed"}>
                    ${i.paymentPercent}%${i.derived && i.derived.paymentPercent ? "" : "*"}</span>`}</td>
            <td style="text-align:right">${n(i.outstanding) == null ? html`<span class="tiny muted">—</span>`
    : html`<span class="tiny" style=${n(i.outstanding) > 0 ? "color:var(--warning-text)" : ""}>
                  ${amount(i.outstanding, i.currency)}</span>`}</td>
            <td><span class="tiny">${i.paymentDate ? fmt.dateShort(i.paymentDate) : "—"}</span></td>
            <td><${Pill} tone=${TONE[i.status] || "gray"}>${i.status}</${Pill}></td>
            <td><span class="tiny">${(i.documents || []).length || "—"}</span></td>
          </tr>`)}</tbody>
        </table></div>
        ${invoices.some((i) => i.derived && (!i.derived.paymentPercent || !i.derived.outstanding))
    && html`<div class="tiny muted" style="padding-top:8px">
          * stated on the record rather than worked out from the figures — the source value is kept.</div>`}
      </${Fragmentish}>`}
    </${Section}>

    ${adding && html`<${InvoiceModal} caseId=${record.id}
      defaultFirm=${(record.counsel && (record.counsel.firm || record.counsel.lead)) || record.counsel || ""}
      defaultTo=${record.entity || ""}
      onClose=${() => setAdding(false)}
      onDone=${() => { setAdding(false); if (onChanged) onChanged(); }} />`}
  </div>`;
}

/* html`` needs a single root; this is the shortest honest way to group. */
const Fragmentish = ({ children }) => html`<div class="col" style="gap:0">${children}</div>`;

function InvoiceModal({ caseId, defaultFirm, defaultTo, onClose, onDone }) {
  const [f, setF] = useState({
    invoiceDate: "", invoiceNumber: "", jeffiNo: "", nature: "Case Fee",
    amount: "", currency: "PKR", amountPaid: "", paymentDate: "",
    transactionId: "", invoicedTo: defaultTo || "", issuingFirm: defaultFirm || "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target ? e.target.value : e }));

  /* Shown live, so what will be stored is visible before it is stored. */
  const amt = Number(f.amount) || 0;
  const paid = Number(f.amountPaid) || 0;
  const pct = amt > 0 ? Math.round((paid / amt) * 1000) / 10 : null;
  const out = amt > 0 ? Math.round((amt - paid) * 100) / 100 : null;

  const save = async () => {
    if (!f.amount) { setErr("An invoice amount is required."); return; }
    setBusy(true); setErr("");
    try { await api.litigation.addInvoice(caseId, f); toast("Invoice recorded.", "success"); onDone(); }
    catch (e) { setErr((e.payload && e.payload.errors && e.payload.errors.join(" · ")) || e.message); setBusy(false); }
  };

  return html`<${Modal} title="Record an invoice" icon="dollar" width=${720} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !f.amount} onClick=${save}>Record invoice</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      <div class="modeditgrid">
        <${Field} label="Invoice date"><${DateInput} value=${f.invoiceDate} onInput=${set("invoiceDate")} /></${Field}>
        <${Field} label="Invoice number"><${Input} value=${f.invoiceNumber} onInput=${set("invoiceNumber")} /></${Field}>
        <${Field} label="JEFFI no."><${Input} value=${f.jeffiNo} onInput=${set("jeffiNo")} /></${Field}>
        <${Field} label="Nature of invoice">
          <select class="input" value=${f.nature} onChange=${set("nature")}>
            ${NATURES.map((x) => html`<option key=${x} value=${x} selected=${f.nature === x}>${x}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Amount *">
          <div class="row" style="gap:8px">
            <${Input} value=${f.amount} onInput=${set("amount")} placeholder="0" />
            <select class="input" style="width:96px;flex:none" value=${f.currency} onChange=${set("currency")}>
              ${["PKR", "USD"].map((c) => html`<option key=${c} value=${c} selected=${f.currency === c}>${c}</option>`)}
            </select>
          </div>
        </${Field}>
        <${Field} label="Amount paid"><${Input} value=${f.amountPaid} onInput=${set("amountPaid")} placeholder="0" /></${Field}>
        <${Field} label="Payment date"><${DateInput} value=${f.paymentDate} onInput=${set("paymentDate")} /></${Field}>
        <${Field} label="Transaction / reference"><${Input} value=${f.transactionId} onInput=${set("transactionId")} /></${Field}>
        <${Field} label="Issuing firm / counsel"><${Input} value=${f.issuingFirm} onInput=${set("issuingFirm")} /></${Field}>
        <${Field} label="Invoiced to"><${Input} value=${f.invoicedTo} onInput=${set("invoicedTo")} /></${Field}>
      </div>
      ${amt > 0 && html`<div class="tiny muted">
        This will be recorded as <strong>${pct}% paid</strong> with
        <strong>${fmt.money(out, f.currency)}</strong> outstanding — worked out from the two figures above,
        not typed in.</div>`}
      <${Field} label="Notes"><textarea class="input" rows="2" value=${f.notes} onInput=${set("notes")}></textarea></${Field}>
    </div>
  </${Modal}>`;
}
