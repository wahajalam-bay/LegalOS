/* REFUND CLAIMS — THE MATTERS THAT WERE NEVER FILED.
 *
 * The refund sheet of "Zameen Pending Litigation.xlsx" records buyers claiming
 * money back on a project. Most of those rows carry no forum at all, because
 * nothing was ever filed: they are claims against the company, at the stage
 * before anybody goes to court. Carried into the main litigation register they
 * inflated Active Cases and diluted the claims total with money nobody is suing
 * for.
 *
 * They are not deleted and they have not moved store — the row keeps its
 * workbook, its sheet and its identifiers. This is where they are counted.
 */
import { html, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Empty, Btn } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { useRegister } from "../live.js";
import { navigate } from "../router.js";

export default function RefundClaims() {
  const [nonce] = useState(0);
  const reg = useRegister("litigation", nonce);
  const rows = (reg.rows || []).filter((r) => r.matterClass === "REFUND_CLAIM_NOT_FILED");

  const total = rows.reduce((n, r) => n + (Number(r.claimAmount) || 0), 0);
  const quantified = rows.filter((r) => Number(r.claimAmount) > 0).length;
  const settled = rows.filter((r) => /settled|paid|resolved/i.test(String(r.status || ""))).length;

  const columns = [
    { key: "counterparty", label: "Claimant", essential: true, sortValue: true,
      render: (r) => html`<div class="wrapcell"><div class="cell-strong">${r.counterparty || "— not named in the source"}</div>
        <div class="tiny muted">${r.entity || ""}</div></div>` },
    { key: "project", label: "Project", sortValue: true, render: (r) => html`<span class="tiny">${r.project || "—"}</span>` },
    { key: "claimAmount", label: "Amount claimed", align: "right", sortValue: true,
      render: (r) => html`<span class="tiny strong">${Number(r.claimAmount) > 0 ? fmt.money(Number(r.claimAmount), "PKR") : "—"}</span>` },
    { key: "status", label: "Status", render: (r) => html`<span class="tiny">${r.status || "—"}</span>` },
    { key: "basis", label: "Why it is here", render: (r) => html`<span class="tiny muted">${r.matterClassBasis || ""}</span>` },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Refund Claims"
      sub="Buyer refund claims recorded on the litigation trackers that were never filed in any court. They are claims against the company, not court cases, so they are counted here and not in the Litigation register."
      actions=${html`<${Btn} variant="ghost" icon="externalLink" onClick=${() => navigate("/litigation")}>Litigation register</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: rows.length, label: "Refund claims" },
      { value: total ? fmt.money(total, "PKR") : "Not quantified",
        label: `Total claimed (${quantified} of ${rows.length} quantified)` },
      { value: settled, label: "Settled per the source" },
    ]} />

    <div class="banner" style="margin:12px 0;align-items:flex-start">
      <${Icon} name="info" size=15 />
      <span class="tiny">${"Every row keeps its original workbook, sheet and row. Nothing was moved in Drive and nothing was deleted — what changed is which register counts it."}</span>
    </div>

    <${DataTable} rows=${rows} columns=${columns} keepHead
      empty=${html`<${Empty} icon="inbox" title="No unfiled refund claims"
        text="Every matter on the litigation trackers records a forum." />`} />
  </div>`;
}
