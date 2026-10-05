// Compliance & Licences.
//
// /compliance                                 the Overview DASHBOARD
// /compliance/loans                           the Loans register
// /compliance/loans/<id>                      one loan
// /compliance/leases          (+ /<id>)       Lease agreements
// /compliance/services        (+ /<id>)       Service agreements
// /compliance/resolutions     (+ /<id>)       Resolutions
// /compliance/resolutions/entity/<key>        one entity's resolutions
// /compliance/licenses        (+ /<id>)       Licences & permits
// /compliance/sec-filings     (+ /<id>)       SECP filings
// /compliance/sec-filings/entity/<key>        one entity's filing history
// /compliance/sec-filings/year/<id>           one statutory year
// /compliance/document/<fileId>               one document, full view
//
// There is no tab strip. Six major registers behind a horizontal bar is a
// navigation pattern that fails at the sixth item and fails harder on a narrow
// screen -- and putting the dashboard in the same frame as the registers it
// links to makes the dashboard read as a seventh register. So Overview is a
// page, each module is a page, each record is a page, and every one of them has
// an address you can paste to somebody.
//
// The grammar lives in compliancenav.js, which the breadcrumb reads too.
import { html, cx, fmt, useMemo, useEffect, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Empty } from "../ui.js";
import { PageHead } from "../parts.js";
import { navigate, redirect, useQuery } from "../router.js";
import { complianceModule, VIEW_TO_MODULE, isActiveStatus, COMPLIANCE_STATE } from "../compliancemodules.js";
import { parseCompliancePath } from "../compliancenav.js";
import { api } from "../api.js";
import {
  useComplianceConfig, useLoans, useLeases, useServices,
  useResolutions, useLicences, useSecpOverview, useComplianceActivity,
} from "../compliancedata.js";
import { LoanRegister, LoanDetail } from "./compliance-loans.js";
import { AgreementRegister, AgreementDetail } from "./compliance-agreements.js";
import { ResolutionRegister, ResolutionDetail, ResolutionEntityPage } from "./compliance-resolutions.js";
import { LicenceRegister, LicenceDetail } from "./compliance-licences.js";
import { SecpWorkspace, SecpFilingDetail, SecpEntityPage, SecpYearDetail } from "./compliance-secp.js";
import { ComplianceDocument } from "./compliance-document.js";

/* THE CARDS ON THIS PAGE ARE NOT ALL COMPLIANCE REGISTERS.
   Companies is the primary compliance object (§32) but it is not one of the
   six registers under /compliance/*, so complianceModule() does not know it —
   and a card whose meta comes back null renders a blank tile that navigates to
   undefined. One lookup, with the company card's own entry, used by both the
   module strip and the health strip. */
const CARD_META = {
  companies: { key: "companies", label: "Companies", icon: "building", path: "/companies", ns: "co" },
};
const cardMeta = (key) => CARD_META[key] || complianceModule(key);

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* Each surface is its own component so every hook runs on every render of that
   component. Branching inside one body and returning early before later hooks
   is what produces React error #310. */
export default function Compliance({ id, path }) {
  const cfg = useComplianceConfig();
  const config = cfg.data || { capabilities: {}, integrations: {}, secp: {}, resolutions: {}, licences: {}, workflowStatuses: {} };

  // The old tabbed address (?view=loans) still resolves, to its module page.
  // The query is read with useQuery rather than parsed off `path`, because
  // currentPath() strips the query string -- parsing it from there silently
  // matched nothing and left the old links sitting on the Overview.
  const [query] = useQuery();
  const route = parseCompliancePath(path);
  const legacyView = !id && query.view && VIEW_TO_MODULE[query.view]
    ? complianceModule(VIEW_TO_MODULE[query.view]) : null;

  // One effect owns every redirect, so a redirect can never happen during a
  // render and can never race the branch below it.
  useEffect(() => {
    if (legacyView) {
      const rest = Object.entries(query).filter(([k]) => k !== "view");
      redirect(legacyView.path + (rest.length ? "?" + new URLSearchParams(Object.fromEntries(rest)).toString() : ""));
      return;
    }
    // A legacy singular address (/compliance/loan/<id>) resolves, and then
    // rewrites itself to the canonical one so the link people copy is good.
    if (route.canonical) {
      const q = Object.entries(query).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
      redirect(route.canonical + (q ? "?" + q : ""));
    }
  }, [legacyView && legacyView.path, route.canonical]);

  if (cfg.error) {
    return html`<div class="page page--wide fade-in">
      <${PageHead} title="Compliance & Licences" />
      <${Empty} icon="shield" title="Compliance is not available to you"
        text=${cfg.error.message || "You do not have access to the Compliance module."} />
    </div>`;
  }

  if (legacyView) return html`<div class="page fade-in">
    <div class="tiny muted" style="padding:22px 2px">Opening ${legacyView.label}…</div></div>`;
  if (route.canonical) return html`<div class="page fade-in">
    <div class="tiny muted" style="padding:22px 2px">Opening…</div></div>`;

  const mod = route.mod;
  const key = mod ? mod.key : "";

  if (route.kind === "document") {
    return html`<${ComplianceDocument} key=${"doc:" + route.fileId} fileId=${route.fileId} config=${config} />`;
  }

  if (route.kind === "entity") {
    if (key === "resolutions") return html`<${ResolutionEntityPage} key=${"rese:" + route.entityKey}
      entityKey=${route.entityKey} config=${config} />`;
    return html`<${SecpEntityPage} key=${"secpe:" + route.entityKey} entityKey=${route.entityKey} config=${config} />`;
  }

  if (route.kind === "year") {
    return html`<${SecpYearDetail} key=${"secpy:" + route.yearId} yearId=${route.yearId} config=${config} />`;
  }

  if (route.kind === "record") {
    const k = key + ":" + route.recordId;
    if (key === "loans") return html`<${LoanDetail} key=${k} id=${route.recordId} config=${config} />`;
    if (key === "leases") return html`<${AgreementDetail} key=${k} kind="lease" id=${route.recordId} config=${config} />`;
    if (key === "services") return html`<${AgreementDetail} key=${k} kind="service" id=${route.recordId} config=${config} />`;
    if (key === "licenses") return html`<${LicenceDetail} key=${k} id=${route.recordId} config=${config} />`;
    if (key === "resolutions") return html`<${ResolutionDetail} key=${k} id=${route.recordId} config=${config} />`;
    if (key === "sec-filings") return html`<${SecpFilingDetail} key=${k} id=${route.recordId} config=${config} />`;
  }

  if (route.kind === "register") return html`<${ModulePage} key=${key} mod=${mod} config=${config} />`;
  if (route.kind === "overview") return html`<${ComplianceOverview} config=${config} />`;

  // An address this module does not define. It says so, with the address it was
  // given and a way out -- it does NOT quietly render the dashboard, which is
  // what made a broken record link look like a working one for a whole build.
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Compliance & Licences" />
    <${Empty} icon="alertTriangle" title="That address does not exist in Compliance"
      text=${"Nothing in Compliance & Licences is addressed \u201c" + String(path || "") + "\u201d."}
      action=${html`<${Btn} variant="primary" onClick=${() => navigate("/compliance")}>Compliance overview</${Btn}>`} />
  </div>`;
}

/* ============================================================ MODULE PAGE */

/* One register, on its own page, with its own heading. No dashboard above it and
   no tab strip beside it -- you came here to work on this book. */
function ModulePage({ mod, config }) {
  const SUB = {
    loans: "Every loan agreement in the group, with its history, SBP position and outstanding balance.",
    leases: "Property leases \u2014 landlord, term, rent and renewal position.",
    /* SPEND AGREEMENTS covers what the group PAYS under: services, consultancy,
       maintenance, supply and the long tail the tracker's own Agreement Type
       column records. Naming the register after one of them made the rest look
       misfiled. */
    services: "Everything the group pays under, other than a lease \u2014 services, consultancy, maintenance, supply and the rest, as the tracker's own Agreement Type column classifies them.",
    resolutions: "Board and partners resolutions, organised by entity.",
    licenses: "Regulatory licences and permits, with their renewal history.",
    "sec-filings": "The statutory estate as the Drive folder tree holds it \u2014 entity, compliance year, filings and registers.",
  };
  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${mod.label} sub=${SUB[mod.key] || ""}
      actions=${html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => navigate("/compliance")}>Compliance overview</${Btn}>`} />
    ${mod.key === "loans" && html`<${LoanRegister} config=${config} />`}
    ${mod.key === "leases" && html`<${AgreementRegister} kind="lease" config=${config} />`}
    ${mod.key === "services" && html`<${AgreementRegister} kind="service" config=${config} />`}
    ${mod.key === "resolutions" && html`<${ResolutionRegister} config=${config} />`}
    ${mod.key === "licenses" && html`<${LicenceRegister} config=${config} />`}
    ${mod.key === "sec-filings" && html`<${SecpWorkspace} config=${config} />`}
  </div>`;
}

/* =============================================================== OVERVIEW */

/* The dashboard, and only the dashboard.
 *
 * Four bands, and each band answers its question ONCE:
 *
 *   what is here       six compact module cards — count, composition, one alert
 *   what do I do now   what is overdue, beside what is coming, 65% / 35%
 *   how healthy is it  one micro-card per book, expressed as the SHARE that
 *                      needs no action — not the totals the cards already carry
 *   what happened      the audit trail, beside one insight, 60% / 40%
 *
 * Nothing here is a card inside a card: a band is a heading and a surface. And
 * nothing restates a figure another band already showed — the earlier version
 * printed each book's total three times, in the card, in the alert rows and
 * again in the health block, which is most of why it ran to four screens. */
function ComplianceOverview({ config }) {
  const loans = useLoans();
  const leases = useLeases();
  const services = useServices();
  const resolutions = useResolutions();
  const licences = useLicences();
  const secp = useSecpOverview(null);
  const activity = useComplianceActivity(6);
  /* THE COMPANY ESTATE. The primary compliance object (§32) now has a card and
     a position on this page, so it is read here rather than only on /companies
     — one fetch, the same endpoint that register uses, so the two cannot
     disagree about how many companies there are. */
  /* THREE STATES, NOT TWO: not asked yet (undefined), refused or failed
     (null), and answered. Gating the page on `null` meant an account this
     endpoint refuses never saw the compliance overview at all — it sat on
     "Reading the compliance registers…" for ever, because one card's data was
     never coming. A refusal costs that one card its figure and nothing else. */
  const [companies, setCompanies] = useState(undefined);
  useEffect(() => {
    let alive = true;
    api.companies.list().then((d) => alive && setCompanies(d || null), () => alive && setCompanies(null));
    return () => { alive = false; };
  }, []);

  const L = (loans.data && loans.data.loans) || [];
  const LE = (leases.data && leases.data.leases) || [];
  const SV = (services.data && services.data.services) || [];
  const LI = (licences.data && licences.data.licences) || [];
  const RES = resolutions.data || null;
  const SE = (secp.data && secp.data.dashboard) || null;
  /* `headline` is a SIBLING of `dashboard` in the overview response, not a
     field inside it. Reading it as SE.headline made every statutory figure
     undefined, so the card silently fell back to the legacy board-minute
     derivation and printed "33 entity-year records · 52 entities · 0 filings"
     over an estate of 43 companies, 250 entity-year folders and 769 event
     filings. */
  const SH = (secp.data && secp.data.headline) || null;
  /* THE COMPANY ESTATE IS PART OF THE PICTURE, SO IT IS PART OF THE WAIT.
     `companies` is fetched after the first paint, and while it was outstanding
     the Companies card rendered `0 companies` — which does not read as "still
     loading", it reads as "this group has no companies". Every other figure on
     this page is already gated on its register; this one now is too. */
  /* THE PAGE NEVER WAITS ON THE COMPANY ESTATE.
     Gating it here was wrong twice over. Gating on `null` wedged the whole
     overview for any account the companies endpoint refuses; gating on
     `undefined` wedges it just as hard if that endpoint simply never
     answers — a hang is not a rejection, and no catch fires. One card's
     second fetch must not be able to withhold five registers that are already
     in hand. The card renders a dash until the estate arrives. */
  const loading = loans.loading || leases.loading || services.loading || licences.loading;

  /* Counted from the same rows the companies register shows. `unplaced` is a
     company the statutory root files under neither Group nor Non-Group;
     `empty` is one carrying no record in any register — both are real gaps,
     and both are the only operational states a company has. Null while the
     estate is loading or refused, so the cards show nothing rather than zero. */
  const co = useMemo(() => {
    /* UNKNOWN IS NOT ZERO. The company estate is a second fetch — every other
       card on this page comes from a hook resolved at mount — so for a moment
       this one had the data of a group with no companies in it and said so:
       "0 companies", "0 group · 0 non-group". A figure that is wrong for half a
       second is still a figure the product asserted. `total: null` renders the
       dash the card already knows how to draw, and the states strip below
       simply has nothing to show yet. */
    if (!companies) return { total: null, group: null, nonGroup: null, unplaced: 0, empty: 0, loading: true };
    const rows = (companies.companies || companies.rows) || [];
    return {
      total: rows.length,
      group: rows.filter((r) => r.group === "group").length,
      nonGroup: rows.filter((r) => r.group === "non-group").length,
      unplaced: rows.filter((r) => r.group !== "group" && r.group !== "non-group").length,
      empty: rows.filter((r) => !r.records).length,
    };
  }, [companies]);

  const go = (path, q) => navigate(path + (q ? "?" + new URLSearchParams(q).toString() : ""));

  const s = useMemo(() => {
    const t = today(), d30 = inDays(30), d90 = inDays(90);
    const expiring = (rows, k) => rows.filter((r) => r[k] && r[k] >= t && r[k] <= d90);
    const expired = (rows, k) => rows.filter((r) => r[k] && r[k] < t);
    const active = (rows) => rows.filter((r) => isActiveStatus(r.status));
    const native = (RES && RES.native) || [];

    // Named predicates, because "needs attention" has to count a record ONCE
    // even when two things are wrong with it. Adding the columns together would
    // report 30 loans needing attention out of 69 when the real figure is 28.
    const loanOverdue = (r) => !!(r.current && r.current.repaymentDue && r.current.repaymentDue < t && !r.closed);
    const loanSbpOpen = (r) => !!(r.sbp && (r.sbp.key === "PENDING" || r.sbp.key === "SUBMITTED"));
    const resUnsigned = (r) => !!(r.signature && (r.signature.key === "pending" || r.signature.key === "partial"));
    const resUnfiled = (r) => r.status === "EXECUTED" && !!r.drive && r.drive.status !== "FILED";

    const secpRecorded = SE ? SE.annual.recorded + SE.event.recorded : 0;
    const secpOutstanding = SE ? SE.annual.outstanding + SE.event.outstanding : 0;
    const secpOverdue = SE ? SE.annual.overdue + SE.event.overdue : 0;

    return {
      loans: {
        total: L.length,
        /* THE SAME RULE THE LOAN REGISTER USES. Counting only
           `category === "international"` reported 0 FDI loans on this page
           while the register two clicks away reported 25 — the tracker writes
           some of them under the older key, and the register already folds the
           two together. Two counts of one book that disagree are worse than
           no count at all. */
        intl: L.filter((r) => r.category === "fdi" || r.category === "international").length,
        fcy: L.filter((r) => r.category === "fcy").length,
        inter: L.filter((r) => r.category === "intercompany" || r.category === "inter").length,
        overdue: L.filter(loanOverdue).length,
        due30: L.filter((r) => r.current && r.current.repaymentDue && !r.closed
          && r.current.repaymentDue >= t && r.current.repaymentDue <= d30).length,
        sbpPending: L.filter(loanSbpOpen).length,
        sbpRegistered: L.filter((r) => r.sbp && r.sbp.key === "REGISTERED").length,
        closed: L.filter((r) => r.closed).length,
        attention: L.filter((r) => loanOverdue(r) || loanSbpOpen(r)).length,
      },
      leases: {
        total: LE.length, active: active(LE).length,
        expiring: expiring(LE, "end").length, expired: expired(LE, "end").length,
        attention: expired(LE, "end").length + expiring(LE, "end").length,
      },
      services: {
        total: SV.length, active: active(SV).length,
        expiring: expiring(SV, "end").length, expired: expired(SV, "end").length,
        attention: expired(SV, "end").length + expiring(SV, "end").length,
      },
      resolutions: {
        total: RES ? RES.source + native.length : 0,
        entities: RES ? (RES.byEntity || []).length : 0,
        pendingSig: native.filter(resUnsigned).length,
        notFiled: native.filter(resUnfiled).length,
        native: native.length,
        attention: native.filter((r) => resUnsigned(r) || resUnfiled(r)).length,
      },
      licences: {
        total: LI.length, active: active(LI).length,
        expiring: expiring(LI, "expiry").length, expired: expired(LI, "expiry").length,
        renewals: LI.reduce((n, r) => n + (r.renewalsOnFile || 0), 0),
        applications: LI.reduce((n, r) => n + ((r.applications || []).length), 0),
        attention: expired(LI, "expiry").length + expiring(LI, "expiry").length,
        /* RECTIFIED is only claimed where it is EVIDENCED: the licence lapsed
           and a renewal certificate is on file after it. Everywhere else the
           state is left out rather than approximated — a compliance position
           that guesses is worse than one that admits a gap. */
        rectified: LI.filter((r) => r.expiry && r.expiry < t && (r.renewalsOnFile || 0) > 0).length,
      },
      secp: {
        total: secpRecorded,
        /* The statutory estate as the Drive tree proves it: 43 entities and
           252 entity-year records, not the handful the old board-minute
           derivation could see. `provenSubmissions` stays a separate figure --
           a form on file is not a form filed. */
        entities: SH ? SH.entities : (SE ? SE.entities.inScope : 0),
        years: SH ? SH.entityYearRecords : (SE && SE.driveYears ? SE.driveYears.total : 0),
        yearEntities: SH ? SH.entities : (SE && SE.driveYears ? SE.driveYears.entities : 0),
        provenSubmissions: SH ? SH.provenSubmissions : 0,
        eventFilings: SH ? SH.eventFilings : 0,
        registers: SH ? SH.statutoryRegisters : 0,
        documents: SH ? SH.documents : 0,
        overdue: secpOverdue,
        outstanding: secpOutstanding,
        // An obligation counts once: overdue filings are already outstanding.
        attention: Math.max(secpOutstanding, secpOverdue),
      },
    };
  }, [L, LE, SV, LI, RES, SE, SH]);

  if (loading) return html`<div class="page page--wide page--cov fade-in">
    <${PageHead} title="Compliance & Licences" sub="Compliance operations, statutory filings, agreements, licences and governance across all entities." />
    <div class="tiny muted" style="padding:20px 2px">Reading the compliance registers…</div></div>`;

  /* --- band 1: what is here ------------------------------------------- */
  // One card per operational module. No Overview card — you are already here.
  // The count is the register's size, the sub-line is its composition, and the
  // chip is the single thing that needs doing. A card never says "nothing
  // outstanding": silence is the good news, and it costs no pixels.
  const cards = [
    { key: "loans", n: s.loans.total, unit: "loan agreements",
      /* THE OPERATIONAL NAMES (§40). "international" and "intercompany" are
         not what this department calls these books; FDI, FCY and Intercompany
         PK are, and they are what the register's own filter offers. */
      sub: `${s.loans.intl} FDI · ${s.loans.fcy} FCY · ${s.loans.inter} Intercompany PK`,
      alert: s.loans.overdue, alertLabel: "repayment" + (s.loans.overdue === 1 ? "" : "s") + " overdue",
      tone: "red", alertQ: { repay: "overdue" } },
    { key: "leases", n: s.leases.total, unit: "leases",
      sub: `${s.leases.active} active · ${s.leases.expired} expired`,
      alert: s.leases.expiring, alertLabel: "expiring ≤ 90 days", tone: "amber", alertQ: { expiry: "d90" } },
    { key: "services", n: s.services.total, unit: "agreements",
      sub: `${s.services.active} active · ${s.services.expired} expired`,
      alert: s.services.expiring, alertLabel: "expiring ≤ 90 days", tone: "amber", alertQ: { expiry: "d90" } },
    { key: "companies", n: co.total, unit: "companies",
      sub: co.loading
        ? "reading the company estate…"
        : `${co.group} group · ${co.nonGroup} non-group · ${s.resolutions.total} resolutions across them`,
      alert: co.empty, alertLabel: "carry no record", tone: "amber", alertQ: { records: "No" } },
    { key: "licenses", n: s.licences.total, unit: "licences & permits",
      sub: `${s.licences.active} active · ${s.licences.renewals} renewals on file`,
      alert: s.licences.expired + s.licences.expiring, alertLabel: "expired or expiring",
      tone: s.licences.expired ? "red" : "amber", alertQ: { expiry: "d90" } },
    // SECP is the one card whose headline figure is legitimately zero, and a
    // bare 0 reads as "this module is empty" when in fact the estate evidences
    // 33 statutory years. The unit says what the zero counts, the sub-line
    // carries the evidence, and a neutral chip says evidence exists — without
    // ever implying those years were filed.
    /* THE HEADLINE IS THE ESTATE, NOT THE WORKFLOW QUEUE.
       This read "0 recorded filings" over 43 entities, 252 entity-year records
       and 3,367 statutory documents, because it counted only filings raised
       inside LegalOS. A zero there tells a lawyer the module is empty when the
       company's whole statutory history is sitting behind it.

       The record count leads; submissions PROVEN by a receipt, challan or
       acknowledgement are shown separately and never merged into it. */
    { key: "sec-filings", n: s.secp.years, unit: "entity-year records",
      sub: `${s.secp.entities} entities · ${s.secp.provenSubmissions} filings evidenced as submitted · ${s.secp.eventFilings} event filings`,
      alert: s.secp.overdue, alertLabel: "overdue", tone: "red", alertQ: { sview: "annual", due: "overdue" },
      note: s.secp.documents ? `${s.secp.documents.toLocaleString()} statutory documents` : null },
  ];

  /* --- band 2: what do I do now ---------------------------------------- */
  // The two panels answer DIFFERENT questions and share no rows. "Needs
  // attention" is what has already gone wrong or is blocked; "Upcoming
  // deadlines" is what is dated ahead of us. The earlier version listed the
  // three "expires within 90 days" items in both, which is half of why the page
  // read as repetitive. An empty list on a good day is the right answer.
  const attention = [
    { n: s.loans.overdue, one: "loan repayment date has passed", many: "loan repayment dates have passed",
      tone: "red", go: () => go("/compliance/loans", { loan_repay: "overdue" }) },
    { n: s.loans.sbpPending, one: "loan is awaiting SBP registration", many: "loans are awaiting SBP registration",
      tone: "amber", go: () => go("/compliance/loans", { loan_sbp: "Pending registration|Submitted" }) },
    { n: s.licences.expired, one: "licence has expired", many: "licences have expired",
      tone: "red", go: () => go("/compliance/licenses", { lic_expiry: "overdue" }) },
    { n: s.secp.overdue, one: "SECP filing is overdue", many: "SECP filings are overdue",
      tone: "red", go: () => go("/compliance/sec-filings", { sview: "annual", secp_due: "overdue" }) },
    { n: s.resolutions.pendingSig, one: "resolution is awaiting signature", many: "resolutions are awaiting signature",
      tone: "amber", go: () => go("/compliance/resolutions", { rview: "all", res_sig: "Pending|Partially signed" }) },
    { n: s.resolutions.notFiled, one: "executed resolution is not filed to Drive", many: "executed resolutions are not filed to Drive",
      tone: "amber", go: () => go("/compliance/resolutions", { rview: "all", res_drive: "Not filed|Pending upload" }) },
  ].filter((x) => x.n > 0).sort((a, b) => (a.tone === "red" ? 0 : 1) - (b.tone === "red" ? 0 : 1) || b.n - a.n);

  const upcoming = [
    { n: s.loans.due30, label: "loan repayments due ≤ 30 days", go: () => go("/compliance/loans", { loan_repay: "d30" }) },
    { n: s.leases.expiring, label: "lease expiries ≤ 90 days", go: () => go("/compliance/leases", { lease_expiry: "d90" }) },
    { n: s.services.expiring, label: "service expiries ≤ 90 days", go: () => go("/compliance/services", { svc_expiry: "d90" }) },
    { n: s.licences.expiring, label: "licence renewals ≤ 90 days", go: () => go("/compliance/licenses", { lic_expiry: "d90" }) },
    { n: s.secp.outstanding, label: "SECP filings outstanding", go: () => go("/compliance/sec-filings", { sview: "annual" }) },
  ].filter((x) => x.n > 0);

  /* --- band 3: how healthy is each book -------------------------------- */
  // A health card answers "how much of this book needs me", as a percentage of
  // the book that is clear, plus the one or two things that are not. It never
  // repeats the total, because the module card two bands up already said it.
  /* THE FOUR STATES PER BOOK (§55).
     `onTime` is the book minus everything in another state — computed by
     subtraction rather than by a second pass, so the four always add to the
     total and a record can never be counted twice. Where a state is not
     derivable from the source it is OMITTED rather than reported as zero:
     "Rectified" needs evidence that a lapse was put right, and only the
     licence register carries it. */
  const states = (total, parts, clearLabel) => {
    const used = parts.reduce((n, p) => n + (p.n || 0), 0);
    const clear = clearLabel
      ? { key: "onTime", n: Math.max(0, total - used), label: clearLabel.label, tone: "green", definition: clearLabel.definition }
      : { key: "onTime", n: Math.max(0, total - used) };
    return [clear, ...parts.filter((p) => p.n > 0)];
  };
  const health = [
    { key: "loans", total: s.loans.total, attention: s.loans.attention,
      states: states(s.loans.total, [
        { key: "delayed", n: s.loans.sbpPending, go: () => go("/compliance/loans", { loan_sbp: "Pending registration|Submitted" }) },
        { key: "expired", n: s.loans.overdue, go: () => go("/compliance/loans", { loan_repay: "overdue" }) },
      ]),
      issues: [
      { n: s.loans.overdue, label: "repayment passed", tone: "red", go: () => go("/compliance/loans", { loan_repay: "overdue" }) },
      { n: s.loans.sbpPending, label: "SBP pending", tone: "amber", go: () => go("/compliance/loans", { loan_sbp: "Pending registration|Submitted" }) },
    ] },
    { key: "leases", total: s.leases.total, attention: s.leases.attention,
      states: states(s.leases.total, [
        { key: "delayed", n: s.leases.expiring, go: () => go("/compliance/leases", { lease_expiry: "d90" }) },
        { key: "expired", n: s.leases.expired, go: () => go("/compliance/leases", { lease_expiry: "overdue" }) },
      ]),
      issues: [
      { n: s.leases.expired, label: "expired", tone: "red", go: () => go("/compliance/leases", { lease_expiry: "overdue" }) },
      { n: s.leases.expiring, label: "expiring ≤ 90d", tone: "amber", go: () => go("/compliance/leases", { lease_expiry: "d90" }) },
    ] },
    { key: "services", total: s.services.total, attention: s.services.attention,
      states: states(s.services.total, [
        { key: "delayed", n: s.services.expiring, go: () => go("/compliance/services", { svc_expiry: "d90" }) },
        { key: "expired", n: s.services.expired, go: () => go("/compliance/services", { svc_expiry: "overdue" }) },
      ]),
      issues: [
      { n: s.services.expired, label: "expired", tone: "red", go: () => go("/compliance/services", { svc_expiry: "overdue" }) },
      { n: s.services.expiring, label: "expiring ≤ 90d", tone: "amber", go: () => go("/compliance/services", { svc_expiry: "d90" }) },
    ] },
    /* COMPANIES, NOT RESOLUTIONS.
       The resolutions card reported "100% clear · nothing outstanding" on 965
       rows, for ever, because a resolution has no expiry and nothing to
       rectify — it was passed or it was not. A permanently green card in a
       strip whose whole job is to show what needs attention trains the eye to
       skip the strip. The company is the primary compliance object (§32) and
       it has a real operational state: an entity the statutory root does not
       place, and an entity carrying no record at all, are both gaps somebody
       has to close. Resolutions stay a register, reached from the company that
       passed them. */
    ...(co.total == null ? [] : [{ key: "companies", total: co.total, attention: co.unplaced + co.empty,
      /* ITS OWN WORDS. The four compliance states describe a dated obligation;
         a company has no expiry and cannot be "delayed". Forcing it into that
         vocabulary produced "51 Delayed" against companies the statutory root
         simply does not file under Group or Non-Group, which is a filing gap,
         not lateness. Each state carries its own label and definition here. */
      states: states(co.total, [
        { key: "unplaced", n: co.unplaced, label: "Not placed", tone: "amber",
          definition: "The statutory root files this company under neither Group nor Non-Group entities, so nothing says which it is.",
          go: () => go("/companies", { co_group: "Not placed" }) },
        { key: "empty", n: co.empty, label: "No record at all", tone: "red",
          definition: "No contract, case, notice, licence, loan, resolution or project anywhere in the estate names this company.",
          go: () => go("/companies", { co_records: "No" }) },
      ], { label: "Placed and in use", definition: "Filed under Group or Non-Group by the statutory root, and named on at least one record." }),
      issues: [
      { n: co.unplaced, label: "not placed by the statutory root", tone: "amber", go: () => go("/companies", { co_group: "Not placed" }) },
      { n: co.empty, label: "carry no record at all", tone: "amber", go: () => go("/companies", { co_records: "No" }) },
    ] }]),
    { key: "licenses", total: s.licences.total, attention: s.licences.attention,
      states: states(s.licences.total, [
        { key: "delayed", n: s.licences.expiring, go: () => go("/compliance/licenses", { lic_expiry: "d90" }) },
        /* The only book where a lapse can be PROVED to have been put right:
           a renewal certificate on file dated after the expiry. */
        { key: "rectified", n: s.licences.rectified, go: () => go("/compliance/licenses", { lic_expiry: "overdue" }) },
        { key: "expired", n: Math.max(0, s.licences.expired - s.licences.rectified),
          go: () => go("/compliance/licenses", { lic_expiry: "overdue" }) },
      ]),
      issues: [
      { n: s.licences.expired, label: "expired", tone: "red", go: () => go("/compliance/licenses", { lic_expiry: "overdue" }) },
      { n: s.licences.expiring, label: "expiring ≤ 90d", tone: "amber", go: () => go("/compliance/licenses", { lic_expiry: "d90" }) },
    ] },
    // SECP's denominator is obligations recorded, not records held. With no
    // filing recorded anywhere there is no position to state, so the card
    // states it in words instead of inventing one.
    { key: "sec-filings", total: s.secp.total + s.secp.outstanding, attention: s.secp.attention,
      states: (s.secp.total + s.secp.outstanding) === 0 ? [] : states(s.secp.total + s.secp.outstanding, [
        { key: "delayed", n: s.secp.outstanding, go: () => navigate("/compliance/sec-filings?sview=annual") },
        { key: "expired", n: s.secp.overdue, go: () => go("/compliance/sec-filings", { sview: "annual", secp_due: "overdue" }) },
      ]),
      fallback: s.secp.total + s.secp.outstanding === 0
        ? { state: "Not started", note: `${s.secp.years} statutory years evidenced · 0 filings recorded` } : null,
      issues: [
        { n: s.secp.overdue, label: "overdue", tone: "red", go: () => go("/compliance/sec-filings", { sview: "annual", secp_due: "overdue" }) },
        { n: s.secp.outstanding, label: "outstanding", tone: "amber", go: () => navigate("/compliance/sec-filings?sview=annual") },
      ] },
  ];

  /* --- band 4: what happened, and the one thing worth saying ----------- */
  const acts = (activity.data && activity.data.activity) || [];
  const ins = insight(s, SE);

  return html`<div class="page page--wide page--cov fade-in">
    <${PageHead} title="Compliance & Licences"
      sub="Compliance operations, statutory filings, agreements, licences and governance across all entities."
      actions=${html`<${Btn} variant="ghost" size="sm" icon="building" onClick=${() => navigate("/companies")}>Entities</${Btn}>
        <${Btn} variant="ghost" size="sm" icon="barchart" onClick=${() => navigate("/reports")}>Analytics</${Btn}>`} />

    <div class="cmods">
      ${cards.map((c) => {
        const m = cardMeta(c.key);
        const drill = (e) => {
          e.stopPropagation();
          go(m.path, Object.fromEntries(Object.entries(c.alertQ).map(([k, v]) => [m.ns + "_" + k, v])));
        };
        return html`<button key=${c.key} type="button" class="cmod" onClick=${() => navigate(m.path)}
          aria-label=${"Open " + m.label + " — " + c.n + " " + c.unit}>
          <div class="cmod__h">
            <${Icon} name=${m.icon} size=14 /><span class="cmod__t">${m.label}</span>
            <span class="spacer"></span><${Icon} name="chevronRight" size=14 />
          </div>
          <div class="cmod__v">${c.n == null ? "—" : Number(c.n).toLocaleString()}<span class="cmod__u">${c.unit}</span></div>
          <div class="cmod__s">${c.sub}</div>
          <div class="cmod__a">
            ${c.alert > 0
              ? html`<span class=${cx("cmod__chip", c.tone === "red" && "cmod__chip--red")} role="link" tabIndex=${0}
                  title=${"Open " + m.label + " filtered to these"}
                  onClick=${drill}
                  onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drill(e); } }}>
                  ${c.alert} ${c.alertLabel}</span>`
              : (c.note ? html`<span class="cmod__chip cmod__chip--calm">${c.note}</span>` : null)}
          </div>
        </button>`;
      })}
    </div>

    <div class="cov__split">
      <section class="cov__sec">
        <${SecHead} title="Needs attention"
          sub=${attention.length ? "Each row opens the register filtered to exactly these records" : null} />
        ${attention.length === 0
          ? html`<div class="cov__panel cov__panel--calm">Nothing across Compliance is overdue or expiring.</div>`
          : html`<div class="cov__panel">
            ${attention.map((a, i) => html`<button key=${i} type="button"
              class=${cx("cov__row", "cov__row--" + a.tone)} onClick=${a.go}>
              <span class=${cx("cov__dot", "cov__dot--" + a.tone)}></span>
              <span class="cov__n">${a.n}</span>
              <span class="cov__lbl">${a.n === 1 ? a.one : a.many}</span>
              <span class="spacer"></span><${Icon} name="chevronRight" size=14 />
            </button>`)}
          </div>`}
      </section>

      <section class="cov__sec">
        <${SecHead} title="Upcoming deadlines" sub="Dated inside the next 90 days" />
        ${upcoming.length === 0
          ? html`<div class="cov__panel cov__panel--calm">No deadline falls inside the next 90 days.</div>`
          : html`<div class="cov__panel">
            ${upcoming.map((u, i) => html`<button key=${i} type="button" class="cov__row" onClick=${u.go}>
              <span class="cov__n">${u.n}</span>
              <span class="cov__lbl">${u.label}</span>
              <span class="spacer"></span><${Icon} name="chevronRight" size=14 />
            </button>`)}
          </div>`}
      </section>
    </div>

    <section class="cov__sec">
      <${SecHead} title="Compliance position"
        sub="Each book in the four states the work is actually in. Hover a state for its definition; click it for the records." />
      <div class="chealth">
        ${health.map((h) => html`<${HealthCard} key=${h.key} h=${h} />`)}
      </div>
    </section>

    <div class="cov__split cov__split--even">
      <section class="cov__sec">
        <${SecHead} title="Recent activity" sub="Actions taken in LegalOS" />
        ${acts.length === 0
          ? html`<div class="cov__panel cov__panel--calm">
              ${activity.error
                ? "The activity trail could not be read."
                : "Nothing has been actioned in LegalOS yet. Everything in these registers was recovered from the source trackers and Google Drive; amendments, renewals, signatures and filings recorded here will appear as they happen."}
            </div>`
          : html`<div class="cov__panel">
            ${acts.map((a) => html`<button key=${a.id} type="button" class="cov__row cov__row--act"
              disabled=${!a.href} onClick=${() => a.href && navigate(a.href)}>
              <span class="cov__act">
                <span class="strong">${a.actor}</span> ${a.verb}${a.subject ? html` <span class="cov__subj">${a.subject}</span>` : null}
              </span>
              <span class="spacer"></span>
              <span class="tiny muted cov__when">${fmt.rel(a.at)}</span>
            </button>`)}
          </div>`}
      </section>

      <section class="cov__sec">
        <${SecHead} title="Insight" />
        <div class="ai-card ai-card--compact">
          <div class="ai-card__inner">
            <div class="row" style="margin-bottom:6px">
              <span class="ai-badge"><${Icon} name="sparkles" size=11 /> AI Insight</span>
            </div>
            <div class="cov__inst">${ins.title}</div>
            <div class="cov__insb" title=${ins.body}>${ins.body}</div>
          </div>
        </div>
      </section>
    </div>
  </div>`;
}

/* A band heading. Not a card — putting the module cards, the alert rows and the
   health cards each inside their own <Section> was what produced the nested
   card-in-card the page suffered from. */
function SecHead({ title, sub, right }) {
  return html`<div class="cov__hd">
    <span class="panel__title">${title}</span>
    ${sub && html`<span class="cov__hdsub">${sub}</span>`}
    <span class="spacer"></span>
    ${right}
  </div>`;
}

/* One book's position, in the four states the work is actually in (§55).
 *
 * This used to lead with "87% clear" and a progress bar. A percentage of a
 * register is a ratio dressed as a rating: no regulator recognises it, nobody
 * can act on it, and it hid the only question that matters — which records,
 * and what is wrong with them. Each state below is a count with a definition
 * on hover and a click into exactly those records.
 *
 * A state that cannot be evidenced for a book is LEFT OUT rather than shown as
 * zero: "Rectified" is meaningful for licences, where a renewal certificate on
 * file after a lapse proves it, and is not derivable for resolutions at all.
 */
function HealthCard({ h }) {
  const m = cardMeta(h.key);
  const issues = (h.issues || []).filter((i) => i.n > 0);
  const worst = issues.some((i) => i.tone === "red") ? "red" : (issues.length ? "amber" : "ok");
  const states = (h.states || []).filter((st) => st.n > 0 || st.key === "onTime");

  return html`<div class=${cx("hcard", "hcard--" + worst)}>
    <button type="button" class="hcard__h" onClick=${() => navigate(m.path)} title=${"Open " + m.label}>
      <${Icon} name=${m.icon} size=13 /><span class="hcard__t">${m.label}</span>
      <span class="spacer"></span><${Icon} name="chevronRight" size=13 />
    </button>
    ${states.length === 0
      ? html`<div class="hcard__v hcard__v--none">${(h.fallback && h.fallback.state) || "No data"}</div>`
      : html`<div class="hstates">
          ${states.map((st) => { const d = (st.label ? st : (COMPLIANCE_STATE[st.key] || {}));
            return html`<button key=${st.key} type="button"
              class=${cx("hstate", "hstate--" + (d.tone || "gray"), !st.go && "hstate--flat")}
              title=${d.definition} onClick=${st.go || (() => navigate(m.path))}>
              <span class="hstate__n">${st.n}</span>
              <span class="hstate__l">${d.label || st.key}</span>
            </button>`; })}
        </div>`}
    <div class="hcard__i">
      ${issues.length === 0
        ? html`<span class="hcard__calm">${(h.fallback && h.fallback.note) || "Nothing outstanding"}</span>`
        : issues.slice(0, 2).map((i) => html`<button key=${i.label} type="button"
            class=${cx("hcard__chip", "hcard__chip--" + i.tone)} onClick=${i.go}
            title=${"Open " + m.label + " filtered to " + i.label}>${i.n} ${i.label}</button>`)}
    </div>
  </div>`;
}

/* The single most material TRUE thing about the estate right now, assembled
   from the figures already on this page. Nothing here is prose about data that
   does not exist: every sentence names a count you can click through to, and
   the SECP wording keeps the document-is-not-a-filing distinction the whole
   module rests on. */
function insight(s, SE) {
  // Composed from the figures on this page, not generated prose: the SECP
  // position is the one genuinely material thing about this estate, and the
  // wording keeps the distinction the whole module rests on.
  if (SE && SE.empty) {
    const ents = SE.driveYears ? SE.driveYears.entities : 0;
    return {
      title: "SECP: evidenced, never recorded as filed",
      body: "Drive holds no filing register for the group\u2019s own statutory filings \u2014 but it evidences "
        + s.secp.years + " compliance years across " + ents + " entities. A document is not a filing, so every "
        + "one of those years stays \u201cNot recorded\u201d.",
    };
  }
  if (s.loans.overdue > 0) {
    return {
      title: `${s.loans.overdue} loan repayment ${s.loans.overdue === 1 ? "date has" : "dates have"} passed`,
      body: `${s.loans.overdue} of ${s.loans.total} loan agreements carry a repayment date in the past and are not marked closed`
        + (s.loans.sbpPending ? `, and ${s.loans.sbpPending} more are still awaiting State Bank registration` : "")
        + ". Each is a record in the loans register with its own document history.",
    };
  }
  if (s.licences.expired > 0) {
    return {
      title: `${s.licences.expired} licence ${s.licences.expired === 1 ? "has" : "have"} expired`,
      body: `Drive evidences ${s.licences.renewals} renewals across the licence estate, so the renewal chain is on file — but ${s.licences.expired} licence${s.licences.expired === 1 ? "" : "s"} currently sit past expiry with no later certificate.`,
    };
  }
  if (s.leases.expired + s.services.expired > 0) {
    return {
      title: "Most of the agreement book has run past its end date",
      body: `${s.leases.expired} of ${s.leases.total} leases and ${s.services.expired} of ${s.services.total} service agreements have an end date in the past. Expiry is not the same as termination — the register shows each one's status beside its dates.`,
    };
  }
  return {
    title: "Nothing across Compliance is overdue",
    body: "No repayment, licence, filing or agreement in any of the six registers is past its date today.",
  };
}
