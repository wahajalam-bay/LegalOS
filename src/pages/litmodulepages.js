// THE THREE LITIGATION FAMILIES THAT ARE NOT THE CASE REGISTER.
//
// The cause list, the invoice ledger and the weekly report used to be TABS on
// the litigation workspace, underneath a chip strip that named them too -- the
// same three words twice on one screen, one row apart, either one getting you
// the same thing. Asset Recovery, Notices, IP and the rest are each their own
// module page; these three are now too, reached from the module nav like every
// other family, and the litigation page is the case register and nothing else.
//
// Each page is a thin shell: the header that says what it is, and the module
// itself. The data, and every decision about it, stays in the module.
import { html } from "../core.js";
import { PageHead } from "../parts.js";
import { CauseListCalendar } from "../causelist.js";
import { LegalSpend } from "../legalspend.js";
import { LitigationReport } from "../litigationreport.js";

export function CauseListPage() {
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Cause List / Calendar"
      sub="Where the team has to be. The list on the left is the day you have selected; the calendar on the right is the month around it. Every entry is a hearing date on a case — change the date on the case and this moves with it." />
    <${CauseListCalendar} />
  </div>`;
}

export function LegalSpendPage() {
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Invoices & spend"
      sub="What outside counsel has billed against a case, and what has been paid on retainer. Totals are per currency — nothing is converted." />
    <${LegalSpend} />
  </div>`;
}

export function LitigationReportPage() {
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Litigation reports"
      sub="A weekly report assembled from the records themselves — every line traces to a case, a hearing or an invoice. It is a draft until a lawyer has read it." />
    <${LitigationReport} />
  </div>`;
}
