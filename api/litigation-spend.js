/* LEGAL SPEND.
 *
 * What outside counsel has billed, what has been paid, and what is outstanding
 * -- by firm, by entity, by case and by the nature of the bill.
 *
 * TWO POPULATIONS, DELIBERATELY NOT ADDED TOGETHER BY DEFAULT:
 *
 *   CASE INVOICES are billed against a matter. They answer "what has this case
 *                 cost".
 *   RETAINERS     are billed against a FIRM for a period, not against any
 *                 matter. They answer "what does keeping this firm cost".
 *
 * A retainer split across the cases a firm happens to be running would make
 * every one of those cases cost more than it did, so retainers are reported
 * beside case spend, included in the firm and entity totals, and never
 * attributed to a case.
 *
 * CURRENCIES ARE NOT ADDED. A total that mixes PKR and USD is a number with no
 * meaning. Every total is per-currency, and a caller wanting one figure has to
 * say which rate to use -- which, on this deployment, there is not one of.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "config");
const FILE = path.join(DIR, "litigation-retainers.json");

const str = (v) => String(v == null ? "" : v).trim();
const num = (v) => { const n = Number(String(v == null ? "" : v).replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : 0; };

/* ---- retainers, held on their own because they belong to a firm ---- */

let cache = null;
function readRetainers() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")).retainers || []; }
  catch (e) { cache = []; }
  return cache;
}
function writeRetainers() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ retainers: cache }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) { return false; }
}

function listRetainers() { return readRetainers().slice(); }

function addRetainer(body, who) {
  const b = body || {};
  const firm = str(b.issuingFirm || b.firm);
  if (!firm) return { error: "invalid", errors: ["the issuing firm is required"] };
  if (!num(b.amount)) return { error: "invalid", errors: ["a retainer amount is required"] };
  const l = readRetainers();
  const rec = {
    id: "RET-" + Date.now().toString(36).toUpperCase() + "-" + l.length,
    issuingFirm: firm,
    invoiceNumber: str(b.invoiceNumber),
    dateReceived: /^\d{4}-\d{2}-\d{2}$/.test(str(b.dateReceived)) ? str(b.dateReceived) : "",
    amount: num(b.amount),
    currency: str(b.currency) || "PKR",
    amountPaid: num(b.amountPaid),
    paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(str(b.paymentDate)) ? str(b.paymentDate) : "",
    status: str(b.status) || (num(b.amountPaid) >= num(b.amount) ? "Paid" : num(b.amountPaid) > 0 ? "Partially Paid" : "Unpaid"),
    entity: str(b.entity),
    periodFrom: str(b.periodFrom), periodTo: str(b.periodTo),
    notes: str(b.notes).slice(0, 2000),
    documents: Array.isArray(b.documents) ? b.documents.slice(0, 20) : [],
    recordedBy: (who && who.email) || null,
    recordedAt: new Date().toISOString(),
  };
  rec.outstanding = Math.round((rec.amount - rec.amountPaid) * 100) / 100;
  l.unshift(rec);
  cache = l.slice(0, 5000);
  writeRetainers();
  return { retainer: rec };
}

/* ---- the analytics ---- */

/* Sum per currency. Returns { PKR: {...}, USD: {...} } so nothing is ever
   added across currencies by accident. */
function bucket() { return {}; }
function add(into, currency, amount, paid) {
  const c = str(currency) || "PKR";
  const b = into[c] || (into[c] = { invoiced: 0, paid: 0, outstanding: 0, count: 0 });
  b.invoiced += num(amount);
  b.paid += num(paid);
  b.outstanding = Math.round((b.invoiced - b.paid) * 100) / 100;
  b.invoiced = Math.round(b.invoiced * 100) / 100;
  b.paid = Math.round(b.paid * 100) / 100;
  b.count += 1;
  return into;
}

function group(rows, keyFn, cur, amt, paid) {
  const out = new Map();
  for (const r of rows) {
    const k = str(keyFn(r)) || "Unattributed";
    if (!out.has(k)) out.set(k, bucket());
    add(out.get(k), cur(r), amt(r), paid(r));
  }
  return [...out.entries()]
    .map(([key, byCurrency]) => ({ key, byCurrency }))
    .sort((a, b) => {
      const av = Object.values(a.byCurrency).reduce((s, x) => s + x.invoiced, 0);
      const bv = Object.values(b.byCurrency).reduce((s, x) => s + x.invoiced, 0);
      return bv - av;
    });
}

/* Every case invoice, flattened with the case it belongs to. */
function caseInvoices(cases) {
  const out = [];
  for (const c of (cases || [])) {
    for (const inv of (c.invoices || [])) {
      out.push({
        ...inv,
        caseId: c.id,
        caseName: str(c.caseName || c.title),
        caseNo: str(c.caseNo || c.courtCaseNumber),
        entity: str(c.entity),
        counsel: str(inv.issuingFirm) || str(c.counsel && (c.counsel.firm || c.counsel.lead)) || str(c.counsel),
      });
    }
  }
  return out;
}

function analytics(cases, opts) {
  const o = opts || {};
  let invoices = caseInvoices(cases);
  let retainers = listRetainers();

  const inRange = (d) => {
    if (!o.from && !o.to) return true;
    const v = str(d);
    if (!v) return false;
    if (o.from && v < o.from) return false;
    if (o.to && v > o.to) return false;
    return true;
  };
  if (o.from || o.to) {
    invoices = invoices.filter((i) => inRange(i.invoiceDate));
    retainers = retainers.filter((r) => inRange(r.dateReceived));
  }
  if (o.entity) {
    invoices = invoices.filter((i) => i.entity === o.entity);
    retainers = retainers.filter((r) => r.entity === o.entity);
  }
  if (o.counsel) {
    invoices = invoices.filter((i) => i.counsel === o.counsel);
    retainers = retainers.filter((r) => r.issuingFirm === o.counsel);
  }
  if (o.caseId) { invoices = invoices.filter((i) => i.caseId === o.caseId); retainers = []; }
  if (o.nature) invoices = invoices.filter((i) => i.nature === o.nature);
  if (o.status) {
    invoices = invoices.filter((i) => i.status === o.status);
    retainers = retainers.filter((r) => r.status === o.status);
  }

  const cur = (r) => r.currency;
  const amt = (r) => r.amount;
  const paid = (r) => r.amountPaid;

  const caseTotals = invoices.reduce((acc, i) => add(acc, i.currency, i.amount, i.amountPaid), bucket());
  const retTotals = retainers.reduce((acc, r) => add(acc, r.currency, r.amount, r.amountPaid), bucket());
  /* Firm and entity totals DO include retainers, because "what has this firm
     billed us" is not answerable without them. Case totals never do. */
  const combined = [...invoices.map((i) => ({ ...i, __k: "invoice" })),
    ...retainers.map((r) => ({ ...r, counsel: r.issuingFirm, __k: "retainer" }))];

  return {
    filters: { from: o.from || null, to: o.to || null, entity: o.entity || null,
      counsel: o.counsel || null, caseId: o.caseId || null, nature: o.nature || null, status: o.status || null },
    totals: {
      caseInvoices: caseTotals,
      retainers: retTotals,
      /* Stated separately and not summed for the caller: adding them is a
         decision about what "legal spend" means, and it belongs to whoever is
         reading rather than to this function. */
    },
    byCounsel: group(combined, (r) => r.counsel, cur, amt, paid),
    byEntity: group(combined, (r) => r.entity, cur, amt, paid),
    byCase: group(invoices, (r) => r.caseName || r.caseId, cur, amt, paid),
    byNature: group(invoices, (r) => r.nature, cur, amt, paid),
    byStatus: group(combined, (r) => r.status, cur, amt, paid),
    counts: { invoices: invoices.length, retainers: retainers.length },
    invoices, retainers,
  };
}

module.exports = { analytics, listRetainers, addRetainer, caseInvoices };
