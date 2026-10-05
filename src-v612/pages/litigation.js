// Litigation — THE COURT CASE REGISTER.
//
// This page has been two things it should not have been. First it rendered 357
// cases and then, underneath them, 255 legal notices, as one scrolling column:
// two unrelated families stacked vertically, which you cannot filter and whose
// counts belong to different things. Then the notices moved out and the page
// grew a tab strip — Cases, Cause list, Invoices & spend, Reports — sitting one
// row under a switcher that already named all four, so three families appeared
// twice on the same screen.
//
// Every family now has its own address and is reached from the switcher. What
// is here is the case register, and nothing else.
import { html, cx, fmt, useState, useEffect, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Section } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { Donut, HBars } from "../charts.js";
import { navigate, redirect, useQuery } from "../router.js";
import { useRegister, invalidateRegister } from "../live.js";
import { RaiseCase } from "../raisecase.js";
import { RegisterShell } from "../register.js";
import { useFilterLink } from "../filters.js";
import RecordWorkspace from "./recordworkspace.js";
import { caseFields, caseColumns, caseViews, caseSearchKeys } from "../registerdefs.js";
import { lifecycleOf, claimTotals } from "../litigationmodel.js";

export default function Litigation({ id }) {
  // A case opens the same full-page record shell every other Legal record uses.
  return id ? html`<${RecordWorkspace} kind="litigation" id=${id} />` : html`<${LitigationWorkspace} />`;
}

function LitigationWorkspace() {
  const [raising, setRaising] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cases = useRegister("litigation", nonce);
  /* THIS REGISTER IS COURT LITIGATION (§12-§15/§29).
     The litigation book was assembled from three trackers, and one of them —
     the refund sheet — is a list of buyer refund claims, most of which were
     never filed anywhere, plus four complaints made at a police station. They
     were counted as Active Cases, diluted Total Claims Value, and put "P.S
     Saddar Faisalabad" in the court analysis next to the Lahore High Court.
     Source classification decides which is which; the rows have not moved
     store and have not lost a byte of lineage, they are simply counted where
     they belong. The other two classes are reachable from the strip below, so
     nothing disappears from the product. */
  const allMatters = cases.rows || [];
  const caseRows = allMatters.filter((r) => (r.matterClass || "COURT_CASE") === "COURT_CASE");
  const policeRows = allMatters.filter((r) => r.matterClass === "POLICE_COMPLAINT");
  const refundRows = allMatters.filter((r) => r.matterClass === "REFUND_CLAIM_NOT_FILED");

  /* ONE PAGE, ONE REGISTER.
     This page carried a tab strip -- Cases, Cause list, Invoices & spend,
     Reports -- directly underneath a chip strip that listed all ten families,
     which the Litigation & Disputes hub already lists. Three navigations for
     one set of destinations, two of them above the register the page exists
     to show.

     Every family now lives at its own address and is reached from the module
     nav, exactly like Asset Recovery and the IP portfolio. What is left here
     is the case register itself.

     The old ?view= addresses still work: they redirect to the module that
     owns them, so a link somebody saved or pasted into a report resolves.
     ?view=notices is in there too -- notices left this page earlier and the
     address had been silently falling through to the case register. */
  const [q] = useQuery();
  useEffect(() => {
    const dest = { causelist: "/m/causelist", spend: "/m/spend", report: "/m/report",
      notices: "/m/notices" }[q.view];
    if (dest) redirect(dest);
  }, [q.view]);

  return html`<div class="page page--wide fade-in">
    ${/* THIS TAB IS LITIGATION. NOT "LITIGATION & DISPUTES".
          That is the FAMILY's name — it covers ten registers, one of which is
          Disputes, which has its own tab and its own source (the developer
          disputes tracker). A page titled after the family it sits in tells a
          reader that everything in the family is on it, and the first question
          that follows is why the developer disputes are missing. This page is
          the court case register. */ ""}
    <${PageHead} title="Litigation"
      sub=${"Court cases: exposure, hearings and outside counsel across every jurisdiction. Developer disputes have their own register — see Disputes."
        + ((policeRows.length || refundRows.length)
          ? " " + (refundRows.length ? refundRows.length + " refund claim" + (refundRows.length === 1 ? "" : "s") + " that were never filed" : "")
            + (policeRows.length && refundRows.length ? " and " : "")
            + (policeRows.length ? policeRows.length + " police complaint" + (policeRows.length === 1 ? "" : "s") : "")
            + " from the same trackers are counted in their own registers, not here."
          : "")}
      actions=${html`<${Fragment}>
        <${Btn} variant="ghost" icon="externalLink"
          onClick=${() => navigate("/datahealth")}>Source & data health</${Btn}>
        ${/* §80 — "+ ADD A CASE". "Raise a case" reads like raising a
              dispute, which is what the business does to us; what a litigation
              associate is doing here is recording a matter that already
              exists. The engine underneath is unchanged — this is what the
              button is called. */ ""}
        <${Btn} variant="primary" icon="plus" onClick=${() => setRaising(true)}>Add a case</${Btn}>
      </${Fragment}>`} />
    ${raising && html`<${RaiseCase} moduleKey="cases" moduleLabel="Litigation"
      onClose=${() => setRaising(false)} onCreated=${() => { setRaising(false); invalidateRegister("litigation"); setNonce((n) => n + 1); }} />`}

    ${/* NO SECOND NAVIGATION ROW.
          A chip strip listing every family in Litigation & Disputes used to sit
          here, naming exactly what the sidebar's Litigation & Disputes group
          already names. Two navigations for one set of destinations, one above
          the register the page exists to show. Navigation belongs in the module
          nav; this page shows the cases. */ ""}
    <${CasesRegister} live=${cases} rows=${caseRows} />
  </div>`;
}

/* ===================================================================== CASES */

function CasesRegister({ live, rows }) {
  const [showAllTypes, setShowAllTypes] = useState(false);
  /* Closed by default: operational work first. */
  const [showCharts, setShowCharts] = useState(false);
  const drill = useFilterLink("cases");

  if (live.loading && !rows.length) return html`<div class="tiny muted" style="padding:20px 2px">Reading the litigation trackers from Drive…</div>`;

  // The adapter writes "—" when the tracker left the status cell empty. In a
  // chart legend a dash reads as a rendering fault; say what it means.
  const stageOf = (l) => { const v = (l.stage || "").trim(); return (!v || v === "—") ? "Unspecified" : v; };

  /* TOTAL CLAIMS VALUE, NOT "EXPOSURE" (§62).
     The tracker's column records what is being CLAIMED — by us or against us.
     Calling it exposure asserts an accounting position a legal register has no
     basis for, and it was the headline figure on this page. Currencies are
     totalled apart: there is no approved rate in the source and adding PKR to
     USD produces a number with no meaning. */
  const claims = claimTotals(rows);
  const activeCases = rows.filter((l) => lifecycleOf(l) === "Active");
  const decidedCases = rows.filter((l) => lifecycleOf(l) === "Decided");

  const PALETTE = ["#0d7a3f", "#10935a", "#27a96d", "#d97706", "#6d28d9", "#0891b2", "#b45309"];
  const stageCounts = {};
  for (const l of rows) { const k = stageOf(l); stageCounts[k] = (stageCounts[k] || 0) + 1; }
  const byStage = Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).slice(0, 7)
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  const typeCounts = {};
  for (const l of rows) { const k = (l.type || "—").trim(); typeCounts[k] = (typeCounts[k] || 0) + 1; }
  const byTypeAll = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  const byType = showAllTypes ? byTypeAll : byTypeAll.slice(0, 8);

  // Every KPI and every chart segment sets the SAME filter the toolbar sets, so
  // the register count a drill-down lands on always reconciles with the number
  // that was clicked.
  /* THREE KPIS, AND THEY ARE THE THREE THE TEAM IS ASKED ABOUT (§61).
     "Next hearing" was one of four: a single date, for one case, standing
     beside three figures about the whole book — and the cause list answers it
     properly, for every case, one click away. There is no fourth card: a row
     padded to look complete is worse than a row of three that all matter. */
  const summary = html`<div>
    <${StatStrip} stats=${[
      { value: activeCases.length, label: "Active cases",
        onClick: () => drill.set("lifecycle", ["Active"]), title: "Filter the register to live matters" },
      { value: claims.pkr ? fmt.money(claims.pkr, "PKR") : "Not quantified",
        label: `Total claims value (${claims.quantified} of ${rows.length} quantified)`,
        onClick: () => drill.set("claim", ["1to10m", "10to100m", "gt100m"]),
        title: claims.usd
          ? `A further ${fmt.money(claims.usd, "USD")} is claimed in US dollars and is never added to the rupee total — there is no approved rate in the source.`
          : "What is being claimed, in the currency the source states it in" },
      { value: decidedCases.length, label: "Decided cases",
        onClick: () => drill.set("lifecycle", ["Decided"]), title: "Filter the register to decided matters" },
    ]} />
    ${claims.usd > 0 && html`<div class="tiny muted" style="margin-top:6px">
      A further ${fmt.money(claims.usd, "USD")} is claimed in US dollars. The two are reported apart —
      there is no approved conversion rate in the source, and one total mixing them would mean nothing.</div>`}
    ${/* THE CHARTS ARE BELOW THE WORK, NOT ABOVE IT.
          A lawyer opening this page is looking for a case. Two 200px charts
          between the KPIs and the register meant scrolling past a donut to
          reach the thing they came for, every time. They are still here, still
          clickable, and now folded away by default — open them when the
          question is "what does the book look like" rather than "where is this
          matter". */ ""}
    <div class="row" style="gap:8px;align-items:center;margin:10px 0 4px">
      <button type="button" class="fltbtn" aria-expanded=${showCharts ? "true" : "false"}
        onClick=${() => setShowCharts(!showCharts)}>
        ${showCharts ? "Hide analytics" : "Show analytics"}</button>
      <span class="tiny muted">Cases by stage and by type</span>
    </div>
    <div class="litcharts" style=${showCharts ? "" : "display:none"}>
      <${Section} title="Cases by Stage" icon="pie" sub="click a slice to filter">
        <div class="row center" style="min-height:200px">
          <${Donut} data=${byStage} size=${168} centerValue=${rows.length} centerLabel="Cases"
            onItem=${(d) => drill.toggle("stage", d.label === "Unspecified" ? "—" : d.label)} />
        </div>
      </${Section}>
      <${Section} title="Cases by Type" icon="barchart" sub="click a type to filter">
        <${HBars} data=${byType} gap=${9} format=${(v) => v + " case" + (v > 1 ? "s" : "")}
          onItem=${(d) => drill.toggle("type", d.label)} />
        ${byTypeAll.length > 8 && html`<button class="linkbtn tiny" style="margin-top:12px"
          onClick=${() => setShowAllTypes(!showAllTypes)}>
          ${showAllTypes ? "Show top 8" : "View all " + byTypeAll.length + " case types"} →</button>`}
      </${Section}>
    </div>
  </div>`;

  return html`<${RegisterShell}
    tabId="cases" ns="cases" rows=${rows}
    fields=${caseFields}
    columns=${(f) => caseColumns(f, { onDocs: (r) => navigate("/litigation/" + r.id) })}
    views=${caseViews}
    searchKeys=${caseSearchKeys}
    searchPlaceholder="Search cases, parties, counsel…"
    noun=${["case", "cases"]}
    onRow=${(r) => navigate("/litigation/" + r.id)}
    exportName="litigation-cases"
    emptyIcon="gavel"
    ${/* Land on live work. See `landing` in the litigation adapter. */ ""}
    defaultSort=${{ key: "landing", dir: "asc" }}
    summary=${summary} />`;
}
