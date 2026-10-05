// A module family's hub — what clicking "Compliance & Licences" opens.
// No dropdown in the rail: the family's tools sit here as large tiles, and every
// destination gets a breadcrumb back (the topbar renders Family → Page with a
// back control — see layout.js).
//
// A tile states how big its register is and what needs attention, read from the
// SAME API the register itself uses. That matters: a hub that shows a count the
// register cannot reproduce is worse than a hub with no counts, and a tile that
// opens an empty page is worse still. Every figure here is live.
import { html, useState, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Empty, Pill } from "../ui.js";
import { PageHead } from "../parts.js";
import { navigate } from "../router.js";
import { NAV_GROUPS } from "../nav.js";
import { useActiveUser, canOpenPath } from "../rbac.js";
import { api } from "../api.js";
import { isActiveStatus } from "../compliancemodules.js";

const BLURB = {
  commercial: "Contract review, risk analysis and the live tracker — the commercial book end to end.",
  compliance: "Loans, leases, service agreements, resolutions, licences and SECP filings — one register each.",
  litigation: "Cases, recoveries, notices and everything in front of a forum.",
  shared: "The department's shared surfaces — repository, entities, templates, clauses and the knowledge base.",
  insight: "Cost, throughput and reporting across the function.",
  admin: "The switches: the requester portal, the organization and system settings.",
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* One fetch of the compliance domain, turned into a headline figure and a
   one-line breakdown per register. Returns null while loading and on refusal,
   so a family the caller cannot read simply shows no numbers rather than zeros
   — zero and "not allowed to know" are different answers. */
function useComplianceCounts(enabled) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([
      api.compliance.loans(), api.compliance.leases(), api.compliance.services(),
      api.compliance.resolutions(), api.compliance.licences(), api.compliance.secp.overview(),
    ]).then(([lo, le, sv, re, li, se]) => {
      if (!alive) return;
      const t = today(), d90 = inDays(90);
      const L = lo.loans || [], LE = le.leases || [], SV = sv.services || [], LI = li.licences || [];
      const expiring = (rows, k) => rows.filter((r) => r[k] && r[k] >= t && r[k] <= d90).length;
      const expired = (rows, k) => rows.filter((r) => r[k] && r[k] < t).length;
      const d = se.dashboard || {};
      setCounts({
        loans: {
          total: L.length,
          sub: `${L.filter((r) => r.category === "international").length} international · ` +
               `${L.filter((r) => r.category === "intercompany").length} intercompany`,
          alert: L.filter((r) => r.current && r.current.repaymentDue && r.current.repaymentDue < t && !r.closed).length,
          alertLabel: "repayment overdue",
        },
        leases: {
          total: LE.length,
          sub: `${LE.filter((r) => isActiveStatus(r.status)).length} active`,
          alert: expiring(LE, "end"), alertLabel: "expiring ≤ 90 days",
        },
        services: {
          total: SV.length,
          sub: `${SV.filter((r) => isActiveStatus(r.status)).length} active`,
          alert: expiring(SV, "end"), alertLabel: "expiring ≤ 90 days",
        },
        resolutions: {
          total: (re.source || 0) + ((re.native || []).length),
          sub: `${(re.byEntity || []).length} entities`,
          alert: (re.native || []).filter((r) => r.signature && (r.signature.key === "pending" || r.signature.key === "partial")).length,
          alertLabel: "awaiting signature",
        },
        licences: {
          total: LI.length,
          sub: `${LI.filter((r) => isActiveStatus(r.status)).length} active · ${LI.reduce((n, r) => n + (r.renewalsOnFile || 0), 0)} renewals on file`,
          alert: expired(LI, "expiry") + expiring(LI, "expiry"), alertLabel: "expired or expiring",
        },
        secp: {
          total: (d.annual ? d.annual.recorded : 0) + (d.event ? d.event.recorded : 0),
          sub: `${d.entities ? d.entities.inScope : 0} entities in scope`,
          alert: (d.annual ? d.annual.overdue : 0) + (d.event ? d.event.overdue : 0),
          alertLabel: "overdue",
          empty: !!d.empty,
        },
      });
    }).catch(() => { /* no access, or the module is unavailable: tiles render without figures */ });
    return () => { alive = false; };
  }, [enabled]);
  return counts;
}

export default function GroupHub({ id }) {
  const me = useActiveUser();
  const g = NAV_GROUPS.find((x) => x.key === id);
  // Compliance has a real dashboard of its own, so a hub of tiles pointing at
  // the same six registers is one navigation layer too many: sidebar → hub →
  // cards → register, where sidebar → Overview → register is enough.
  const isCompliance = id === "compliance";
  useEffect(() => { if (isCompliance) navigate("/compliance"); }, [isCompliance]);
  const counts = useComplianceCounts(false);
  if (isCompliance) {
    return html`<div class="page fade-in"><div class="tiny muted" style="padding:22px 2px">Opening the compliance overview…</div></div>`;
  }

  if (!g) return html`<div class="page fade-in"><${Empty} icon="folder" title="Unknown section" text="This module family does not exist." /></div>`;
  const items = g.items.filter((it) => canOpenPath(me, it.path));

  return html`<div class="page fade-in">
    <${PageHead} title=${g.label} sub=${BLURB[g.key] || ""} />
    <div class="grid grid--3">
      ${items.map((it) => {
        const c = it.count && counts ? counts[it.count] : null;
        return html`<button key=${it.path} class="card card--hover card--pad ghub__tile" onClick=${() => navigate(it.path)}>
          <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name=${it.icon || "folder"} size=18 /></div>
          <div class="strong" style="font-size:14.5px;margin-top:12px">${it.label}</div>
          ${c && html`<div class="ghub__n">${Number(c.total).toLocaleString()}</div>`}
          ${c && html`<div class="ghub__sub">${c.sub}</div>`}
          ${c && c.alert > 0 && html`<div style="margin-top:8px"><${Pill} tone="amber">${c.alert} ${c.alertLabel}</${Pill}></div>`}
          ${c && c.alert === 0 && !c.empty && html`<div class="ghub__ok">Nothing outstanding</div>`}
          ${c && c.empty && html`<div class="ghub__ok">No filings recorded yet</div>`}
          <div class="row" style="gap:6px;margin-top:10px;color:var(--brand)"><span class="tiny strong">Open</span><${Icon} name="chevronRight" size=13 /></div>
        </button>`;
      })}
    </div>
    ${items.length === 0 && html`<${Empty} icon="lock" title="Nothing here for your role" text="None of this family's tools are available to your credential." />`}
  </div>`;
}
