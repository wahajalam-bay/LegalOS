// "From intake — assigned to this desk": the triaged requests whose confirmed
// category belongs to THIS module, shown on the module's own register.
//
// PRD §3.4. It existed only inside src/pages/module.js, so it worked on the
// workflow module pages and vanished on the ones backed by real Drive registers
// — and those are exactly the desks the categories map to: Contract Drafting →
// contracts, Dispute / Litigation → cases, IP → ip. A request could be triaged
// onto a desk and then be invisible on it.
//
// One implementation now, imported by both, so the two cannot drift again.
import { html, fmt, useMemo } from "./core.js";
import { Pill, Avatar } from "./ui.js";
import { navigate } from "./router.js";
import { useCollection } from "./store.js";
import { nameOf, byId } from "./data.js";

// Which desk owns a triaged category.
export const CATEGORY_MODULE = {
  "Contract Drafting / Review": "contracts",
  "Amendment / Renewal / Termination": "contracts",
  "Legal Opinion / Advisory": "vetting",
  "Dispute / Litigation": "cases",
  "IP": "ip",
  "Regulatory / Compliance": "filings",
};
// Work that has left the desk: it is finished, not waiting.
export const INTAKE_DONE = ["Closed", "Delivered", "Completed", "Executed", "Approved"];

const personName = (uid) => (uid ? (nameOf(uid) || (byId(uid) || {}).name || "—") : "—");

/* The requests triaged onto `moduleKey`, soonest due first. */
export function useIntakeItems(moduleKey) {
  const requests = useCollection("requests");
  return useMemo(() => (requests || []).filter((r) => {
    const cat = r.category || r.proposedCategory;
    if (CATEGORY_MODULE[cat] !== moduleKey) return false;
    // Still in triage and not yet confirmed? Then it is not on a desk yet.
    if (!r.categoryConfirmed && ["New", "Triage"].includes(r.status)) return false;
    return !INTAKE_DONE.includes(r.status);
  }).sort((a, b) => new Date((a.tat && a.tat.dueAt) || 0) - new Date((b.tat && b.tat.dueAt) || 0)),
  [requests, moduleKey]);
}

export function IntakeDesk({ moduleKey, label }) {
  const items = useIntakeItems(moduleKey);
  if (!items.length) return null;
  return html`<div class="card" style="padding:0;margin-bottom:16px;border-color:color-mix(in srgb, var(--brand) 28%, var(--border))">
    <div class="row" style="padding:14px 16px 6px;align-items:baseline">
      <span class="panel__title">From intake — assigned to this desk</span>
      <span class="tiny muted" style="margin-left:8px">— requests triaged into ${label || moduleKey}</span>
      <span class="spacer"></span><${Pill} tone="green">${items.length}</${Pill}>
    </div>
    <div class="tablewrap"><table class="table">
      <thead><tr><th>Ref</th><th>Request</th><th>Requesting dept</th><th>Owner</th><th>Stage</th><th>Expected</th></tr></thead>
      <tbody>
        ${items.map((r) => html`<tr key=${r.id} class="clickable" onClick=${() => navigate("/workspace/" + r.id)}>
          <td class="mono tiny">${r.id}</td>
          <td style="max-width:320px"><div class="ellipsis" title=${r.title}>${r.title}</div>
            <div class="tiny muted">${r.category || r.proposedCategory || "—"}</div></td>
          <td class="tiny">${r.department || r.requestingDept || "—"}</td>
          <td><span class="row" style="gap:7px"><${Avatar} name=${personName(r.owner)} size="xs" />${personName(r.owner).split(" ")[0]}</span></td>
          <td><${Pill} tone=${r.status === "Closed" ? "gray" : "blue"}>${r.stage || r.status}</${Pill}></td>
          <td class="tiny">${r.tat && r.tat.dueAt ? fmt.date(r.tat.dueAt) : "—"}</td>
        </tr>`)}
      </tbody>
    </table></div>
  </div>`;
}
