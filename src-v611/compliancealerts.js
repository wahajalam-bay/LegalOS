// Compliance deadline alerts.
//
// Section 12 of the requirements asks for renewal and deadline notifications.
// Every alert here is generated from a REAL date or status on a real record —
// there is no schedule of invented reminders. If nothing is due, nothing is
// raised, and a quiet panel is the correct answer rather than a bug.
//
// Deduped by (record, milestone) like the contract reminders, so reloading never
// stacks duplicates, and each alert carries the route that opens the register
// filtered to exactly the records it counted.
import { fmt } from "./core.js";
const DAY = 86400000;
const daysTo = (d, now) => Math.round((new Date(d + "T00:00:00") - now) / DAY);
const iso = (d) => String(d || "").slice(0, 10);

/* Loans — repayment approaching, repayment overdue, SBP registration pending. */
export function loanAlerts(loans = [], now = new Date()) {
  const out = [];
  for (const l of loans) {
    const due = l.current && l.current.repaymentDue;
    if (due && !l.closed) {
      const n = daysTo(iso(due), now);
      if (n < 0) {
        out.push({
          id: `cmp-loan-${l.id}-overdue`, kind: "loan", tone: "red", icon: "alertTriangle",
          title: `${l.borrower || l.title || l.id} — repayment ${Math.abs(n)}d overdue`,
          detail: `Repayment was due ${iso(due)}`,
          dueDays: n, path: "/compliance/loans?loan_repay=overdue",
        });
      } else if (n <= 30) {
        out.push({
          id: `cmp-loan-${l.id}-due`, kind: "loan", tone: n <= 7 ? "red" : "amber", icon: "clock",
          title: `${l.borrower || l.title || l.id} — repayment due in ${n}d`,
          detail: `Repayment date ${iso(due)}`,
          dueDays: n, path: "/compliance/loans?loan_repay=d30",
        });
      }
    }
    // SBP registration is an obligation only where the rules say it applies.
    if (l.sbp && (l.sbp.key === "PENDING" || l.sbp.key === "SUBMITTED")) {
      out.push({
        id: `cmp-loan-${l.id}-sbp`, kind: "loan", tone: "amber", icon: "shield",
        title: `${l.borrower || l.title || l.id} — SBP registration ${l.sbp.label.toLowerCase()}`,
        detail: l.sbp.note || l.sbp.reason || "Awaiting State Bank registration",
        dueDays: 999, path: "/compliance/loans?loan_sbp=Pending%20registration%7CSubmitted",
      });
    }
  }
  return out;
}

/* Leases and service agreements — expiry and renewal windows. */
export function agreementAlerts(rows = [], kind = "lease", now = new Date()) {
  const view = kind === "lease" ? "leases" : "services";
  const ns = kind === "lease" ? "lease" : "svc";
  const out = [];
  for (const r of rows) {
    if (!r.end) continue;
    if (/terminat|inactive|ceased/i.test(r.status || "")) continue;
    const n = daysTo(iso(r.end), now);
    if (n < 0) continue;              // already expired: reported on the register, not as a deadline
    if (n > 90) continue;
    out.push({
      id: `cmp-${ns}-${r.id}-expiry`, kind, tone: n <= 30 ? "red" : "amber", icon: "clock",
      title: `${r.title || r.id} — ${kind === "lease" ? "lease" : "agreement"} expires in ${n}d`,
      detail: `${r.counterparty || ""}${r.counterparty ? " · " : ""}expiry ${iso(r.end)}`,
      dueDays: n, path: `/compliance/${view}?${ns}_expiry=d90`,
    });
  }
  return out;
}

/* Licences — expiry, and applications awaiting an authority response. */
export function licenceAlerts(licences = [], now = new Date()) {
  const out = [];
  for (const l of licences) {
    if (l.expiry) {
      const n = daysTo(iso(l.expiry), now);
      if (n < 0) {
        out.push({
          id: `cmp-lic-${l.id}-expired`, kind: "licence", tone: "red", icon: "alertTriangle",
          /* See the note in contracts.js: the count inside a quarter, the word beyond it. */
          title: `${l.authority || "Licence"} — ${l.entity || ""} expired${Math.abs(n) <= 90 ? " " + Math.abs(n) + "d ago" : " on " + fmt.date(l.expiryDate || l.expiry)}`,
          detail: `Expired ${iso(l.expiry)}`,
          dueDays: n, path: "/compliance/licenses?lic_expiry=overdue",
        });
      } else if (n <= 90) {
        out.push({
          id: `cmp-lic-${l.id}-expiry`, kind: "licence", tone: n <= 30 ? "red" : "amber", icon: "clock",
          title: `${l.authority || "Licence"} — ${l.entity || ""} expires in ${n}d`,
          detail: `Expiry ${iso(l.expiry)}`,
          dueDays: n, path: "/compliance/licenses?lic_expiry=d90",
        });
      }
    }
    for (const a of l.applications || []) {
      if (a.fields && /additional information required/i.test(a.fields.portalStatus || "")) {
        out.push({
          id: `cmp-lic-${a.id}-query`, kind: "licence", tone: "amber", icon: "mail",
          title: `${l.authority || "Licence"} — authority has raised a query`,
          detail: `Application ${a.id}${a.fields.applicationReference ? " · " + a.fields.applicationReference : ""}`,
          dueDays: 0, path: "/compliance/licenses?lic_renewal=In%20progress",
        });
      }
    }
  }
  return out;
}

/* Resolutions created in LegalOS — awaiting signature, or executed but unfiled. */
export function resolutionAlerts(native = [], now = new Date()) {
  const out = [];
  for (const r of native) {
    if (r.signature && (r.signature.key === "pending" || r.signature.key === "partial")) {
      out.push({
        id: `cmp-res-${r.id}-sig`, kind: "resolution", tone: "amber", icon: "edit",
        title: `${(r.fields && r.fields.subject) || r.id} — awaiting signature`,
        detail: `${r.entity || ""}${r.entity ? " · " : ""}${r.signature.label}`,
        dueDays: 0, path: "/compliance/resolutions?rview=all&res_sig=Pending%7CPartially%20signed",
      });
    }
    if (r.status === "EXECUTED" && r.drive && r.drive.status !== "FILED") {
      out.push({
        id: `cmp-res-${r.id}-file`, kind: "resolution", tone: "amber", icon: "folder",
        title: `${(r.fields && r.fields.subject) || r.id} — executed but not filed to Drive`,
        detail: r.entity || "",
        dueDays: 0, path: "/compliance/resolutions?rview=all&res_drive=Not%20filed%7CPending%20upload",
      });
    }
  }
  return out;
}

/* SECP — statutory filing due or overdue. Raised only from filings that EXIST;
   an empty register raises nothing rather than inventing a statutory backlog. */
export function secpAlerts(filings = [], now = new Date()) {
  const out = [];
  for (const f of filings) {
    const st = f.state || {};
    if (st.filed || !st.due) continue;
    const n = daysTo(iso(st.due), now);
    if (st.overdue) {
      out.push({
        id: `cmp-secp-${f.id}-overdue`, kind: "secp", tone: "red", icon: "alertTriangle",
        title: `${f.entity || "Entity"} — ${f.fields && f.fields.form ? "Form " + f.fields.form : "filing"} overdue by ${Math.abs(n)}d`,
        detail: st.overdueReason ? `Reason: ${st.overdueReason}` : "No overdue reason recorded",
        dueDays: n, path: "/compliance/sec-filings?sview=annual&secp_due=overdue",
      });
    } else if (st.dueSoon) {
      out.push({
        id: `cmp-secp-${f.id}-due`, kind: "secp", tone: "amber", icon: "clock",
        title: `${f.entity || "Entity"} — ${f.fields && f.fields.form ? "Form " + f.fields.form : "filing"} due in ${n}d`,
        detail: `${(f.fields && f.fields.financialYear) || ""} · statutory due ${iso(st.due)}`,
        dueDays: n, path: "/compliance/sec-filings?sview=annual&secp_due=d30",
      });
    }
  }
  return out;
}

// Everything, most urgent first. Callers slice; nothing here is capped so a
// count stays truthful.
export function complianceAlerts({ loans = [], leases = [], services = [], licences = [], resolutions = [], filings = [] } = {}, now = new Date()) {
  return [
    ...loanAlerts(loans, now),
    ...agreementAlerts(leases, "lease", now),
    ...agreementAlerts(services, "service", now),
    ...licenceAlerts(licences, now),
    ...resolutionAlerts(resolutions, now),
    ...secpAlerts(filings, now),
  ].sort((a, b) => (a.dueDays || 0) - (b.dueDays || 0));
}
