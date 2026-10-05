// SECP Filings — organised by ENTITY and FINANCIAL YEAR.
//
// This module deliberately has NO request workflow. SECP filings are not raised
// by a department and routed to Legal; Legal identifies them because the
// Companies Act requires them. So "+ New Filing" creates a FILING, and the
// lifecycle is a filer's lifecycle (Identified/due -> Preparation -> Ready to
// file -> Filed -> Acknowledged), not the generic requester workflow.
//
// THE AGM RULE. A Single Member Company has one member and holds no AGM, so an
// SMC must never show an overdue AGM. Entity type comes from api/entities.js,
// which reads every spelling of a company across the source AND the Drive folder
// names — and where two sources disagree, the requirement is withheld rather
// than guessed. That disagreement is shown, not hidden.
import { html, cx, fmt, useState, useEffect, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Modal, Field, Input, Textarea, Section, Pill, Status, Empty, AICard } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { RegisterShell, downloadCsv, RegisterTabs } from "../register.js";
import { useFilterLink } from "../filters.js";
import { navigate, useQuery } from "../router.js";
import { openRecord, registerReturnPath, useRecordTab, usePublishCrumbLeaf } from "../compliancenav.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { useSecpOverview, useSecpFilings, useSecpEntity, useSecpYears, useSecpYear, useEntities,
  useSecpAnnual, useSecpEvents, useSecpRegisters, useSecpUpcoming } from "../compliancedata.js";
import { secpFields, secpColumns, secpViews, secpSearchKeys } from "../compliancedefs.js";
import { ActionPanel, UnifiedTimeline, FieldGrid, Select, WorkflowStepper } from "../complianceui.js";
import { LegalDocuments } from "../legaldocuments.js";
import { DocViewerModal } from "./contracts.js";

const dash = (v) => (v == null || v === "" ? "—" : v);

/* WHAT A TRIGGERING EVENT IS CALLED ON SCREEN.
   The model keys events as CORPORATE_ACTION, EOGM, SECP_NOTICE. The table cell
   already lower-cased them, but the filter dropdown listed the raw keys, so a
   lawyer choosing what to look at was offered "CORPORATE_ACTION". A stored key
   is not a label; the filter keeps the key as its value and shows this. */
const EVENT_LABEL = {
  FORM_FILING: "Form filing",
  CORPORATE_ACTION: "Corporate action",
  EOGM: "Extraordinary general meeting",
  SECP_NOTICE: "SECP notice",
  ENTITY_LEVEL: "Entity record",
  CORRESPONDENCE: "Correspondence",
};
/* A form code prints as itself ("Form 29"); anything else is an event type. */
const r_isForm = (v) => /^Form\b/i.test(String(v || ""));
const eventLabel = (v) => EVENT_LABEL[v]
  || String(v || "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/* The part of the URL that describes WHICH ENTITIES are on screen — the branch
   a user filtered down to. It is what travels into a record and what Back
   restores; nothing else in the query is a filter. */
const REGISTER_KEYS = ["sview", "escope", "group", "form", "evidence", "docs", "eq", "cyfrom", "cyto", "esort", "edir"];
function registerQuery(q) {
  return REGISTER_KEYS.filter((k) => q[k]).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");
}
const today = () => new Date().toISOString().slice(0, 10);

export function SecpWorkspace({ config }) {
  const [query, patch] = useQuery();
  const fy = query.fy || null;
  /* Old links to the retired tabs land on the workspace that replaced them. */
  const RETIRED = { years: "entities", annual: "entities" };
  const view = RETIRED[query.sview] || query.sview || "overview";
  const ov = useSecpOverview(fy);
  const filings = useSecpFilings(null);
  const [creating, setCreating] = useState(null);
  const [panelRecord, setPanelRecord] = useState(null);
  const caps = (config && config.capabilities) || {};
  const scfg = (config && config.secp) || {};
  const years = (scfg.financialYears && scfg.financialYears.years) || [];
  const currentFY = fy || (scfg.financialYears && scfg.financialYears.current) || "";

  const d = (ov.data && ov.data.dashboard) || null;
  const ents = (ov.data && ov.data.entities) || [];
  /* The entity population is two different numbers and the tab used to print
     the larger one without saying which: 43 companies have a statutory folder
     in Drive, while LegalOS knows 72 in total. "52 entities" over an estate of
     43 is what that ambiguity looked like on screen. */
  const stat = (ov.data && ov.data.statutory) || null;
  const rows = (filings.data && filings.data.filings) || [];

  const cyears = useSecpYears();
  const yearRows = (cyears.data && cyears.data.years) || [];

  /* The statutory estate as the Drive folder tree proves it. This is history
     the company already has; the LegalOS-native filings above are what gets
     raised from here on. The tabs used to count only the native records, so a
     Drive holding 250 entity-year folders, 769 event filings and 130 statutory
     registers read as "0". Both populations are shown, labelled for what they
     are, and neither overwrites the other. */
  const dAnnual = useSecpAnnual(null);
  const dEvents = useSecpEvents(null);
  const dRegisters = useSecpRegisters(null);
  const annualRows = (dAnnual.data && dAnnual.data.annual) || [];
  const eventRows = (dEvents.data && dEvents.data.events) || [];
  const registerRows = (dRegisters.data && dRegisters.data.registers) || [];
  const estateLoading = dAnnual.loading || dEvents.loading || dRegisters.loading;
  /* The CY range lives in the URL so a filtered view can be shared, and so the
     Compliance-years and Annual-compliance tabs agree about what is on screen. */
  const cy = { from: query.cyfrom || "", to: query.cyto || "" };
  const setCy = (next) => patch({ cyfrom: next.from || "", cyto: next.to || "" });

  const dUpcoming = useSecpUpcoming(null);
  const upcomingRows = (dUpcoming.data && dUpcoming.data.upcoming) || [];

  /* FIVE TABS, NOT SEVEN.
     "Compliance years" and "Annual compliance" were two names for the same 250
     entity-year records, and "Entities" was a third way into them. A Legal user
     had to learn which of three screens to open for one question. The history
     now lives in one workspace, reached through the company it belongs to. */
  const sub = [
    { id: "overview", label: "Overview" },
    { id: "entities", label: "Entities & filing history", count: stat ? stat.entities : ents.length },
    { id: "event", label: "Event filings", count: estateLoading ? null : eventRows.length },
    { id: "registers", label: "Statutory registers", count: estateLoading ? null : registerRows.length },
    /* Requirements, not companies. The upcoming rows are one per company, so
       this tab counted 43 beside a KPI reading 147 under the same words. */
    { id: "upcoming", label: "Upcoming obligations",
      count: dUpcoming.loading ? null : upcomingRows.reduce((n, u) =>
        n + (u.requirements || []).filter((i) => i.documentStatus !== "AVAILABLE").length, 0) },
  ];

  const reloadAll = () => { ov.reload(); filings.reload(); cyears.reload(); dAnnual.reload(); dEvents.reload(); dRegisters.reload(); dUpcoming.reload(); };

  return html`<div>
    <div class="row" style="gap:6px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      ${sub.map((s) => html`<button key=${s.id} type="button"
        class=${cx("fltbtn", view === s.id && "fltbtn--on")}
        aria-pressed=${view === s.id ? "true" : "false"}
        onClick=${() => patch({ sview: s.id })}>${s.label}${s.count != null ? " (" + s.count + ")" : ""}</button>`)}
      <div class="spacer"></div>
      ${caps["compliance.portal.open"] && scfg.portal && scfg.portal.configured && html`
        <a class="btn btn--ghost btn--sm" href=${scfg.portal.url} target="_blank" rel="noopener noreferrer"
          title="Opens the SECP portal in a new tab. LegalOS links out to it and files nothing automatically.">
          <${Icon} name="externalLink" size=14 /> Open eZfile</a>`}
      ${caps["compliance.filing.create"] && html`<${Btn} variant="primary" size="sm" icon="plus"
        onClick=${() => setCreating({ financialYear: currentFY })}>+ New filing</${Btn}>`}
    </div>

    ${ov.loading && !d && html`<div class="tiny muted" style="padding:20px 2px">Reading SECP compliance…</div>`}

    ${view === "overview" && d && html`<${SecpOverview} d=${d} ents=${ents} stat=${stat} onGo=${(v, q) => patch({ sview: v, ...(q || {}) })} />`}

    ${view === "years" && html`<${SecpYears} rows=${yearRows} cy=${cy} setCy=${setCy}
      onOpenYear=${(y) => openRecord("/compliance/sec-filings/year/" + encodeURIComponent(y.id))}
      onOpenEntity=${(k) => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(k))} />`}

    ${view === "annual" && html`<${SecpAnnualCompliance} rows=${annualRows} res=${dAnnual} cy=${cy} setCy=${setCy}
      native=${rows.filter((r) => r.subtype !== "event")} config=${config}
      onOpenYear=${(r) => navigate("/compliance/sec-filings/year/" + encodeURIComponent(r.id))}
      onOpenEntity=${(k) => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(k))} />`}

    ${view === "event" && html`<${SecpEventFilings} rows=${eventRows} res=${dEvents}
      native=${rows.filter((r) => r.subtype === "event")} config=${config}
      onOpenEntity=${(k) => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(k))} />`}

    ${view === "registers" && html`<${SecpStatutoryRegisters} rows=${registerRows} res=${dRegisters}
      onOpenEntity=${(k) => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(k))} />`}

    ${view === "upcoming" && html`<${SecpUpcoming} rows=${upcomingRows} res=${dUpcoming}
      basis=${dUpcoming.data && dUpcoming.data.basis} fy=${currentFY} years=${years}
      onFY=${(v) => patch({ fy: v })}
      onOpenEntity=${(k) => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(k))}
      onOpenYear=${(id) => navigate("/compliance/sec-filings/year/" + encodeURIComponent(id))} />`}

    ${/* THE BRANCH SURVIVES THE DRILL-DOWN.
          Opening a company from "Group + Public Limited + CY 2022-2026" and
          coming back landed on the unfiltered register, so the filter had to be
          rebuilt by hand every time. The register's own query travels with the
          link, and Back restores exactly the branch that was left. */ ""}
    ${view === "entities" && html`<${SecpEntities} ents=${ents} stat=${stat} q=${query} patch=${patch}
      onOpen=${(k) => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(k)
        + "?from=" + encodeURIComponent(registerQuery(query)))} />`}

    ${view === "entity" && query.entity && html`<${Redirect}
      to=${"/compliance/sec-filings/entity/" + encodeURIComponent(query.entity)} />`}

    ${creating && html`<${NewFilingModal} seed=${creating} config=${config}
      onClose=${() => setCreating(null)}
      onDone=${(rec) => { setCreating(null); navigate("/compliance/sec-filings/" + encodeURIComponent(rec.id)); }} />`}
    ${panelRecord && html`<${ActionPanel} recordId=${panelRecord} caps=${caps} config=${config}
      onClose=${() => setPanelRecord(null)} onChanged=${reloadAll} />`}
  </div>`;
}

/* ================================================================ OVERVIEW */

/* THE OVERVIEW IS A SET OF DOORS, NOT AN ESSAY.
   It opened with a paragraph of AI prose above two cards of zeros, and none of
   the figures went anywhere. A Legal user arriving here should be able to see
   the size of the estate and click straight into the part of it they came for:
   every number below is a link, and the two bifurcations the source actually
   has -- Group / Non-Group, and legal form -- are on the screen rather than
   buried in a filter menu. */
function SecpOverview({ d, ents, onGo, stat }) {
  const dy = (d && d.driveYears) || {};
  const inScope = ents.filter((e) => e.statutory);
  /* The bifurcation is Drive's own: the source root's first level is "Group
     Entities" beside the rest, and api/secp carries that through on
     e.statutory.group. It is not something LegalOS decides. */
  const group = inScope.filter((e) => e.statutory.group === "group");
  const nonGroup = inScope.filter((e) => e.statutory.group !== "group");
  const byForm = (t) => inScope.filter((e) => e.type === t).length;
  /* Both of these are estate-wide totals from the source, not sums of the
     per-entity columns: documents overlap between populations, and an
     obligation is a requirement, not a company that has one. */
  const docTotal = (stat && stat.documents) || dy.documents || 0;
  const upcoming = (stat && stat.upcomingObligations) || 0;

  const kpis = [
    { value: inScope.length, label: "Entities in scope", to: ["entities", {}] },
    { value: (dy.total || 0).toLocaleString(), label: "Entity-year records", to: ["entities", {}] },
    { value: dy.withRecordedFilings || 0, label: "With filing evidence", to: ["entities", { evidence: "yes" }] },
    { value: ((stat && stat.eventFilings) || 0).toLocaleString(), label: "Event filings", to: ["event", {}] },
    { value: (stat && stat.statutoryRegisters) || 0, label: "Statutory registers", to: ["registers", {}] },
    { value: docTotal.toLocaleString(), label: "Statutory documents", to: ["entities", { docs: "yes" }],
      hint: (stat && stat.duplicateSourceCopies)
        ? stat.physicalFiles.toLocaleString() + " files in Drive; " + stat.duplicateSourceCopies
          + " are the same instrument filed in a second source folder and are counted once"
        : null },
    { value: upcoming.toLocaleString(), label: "Upcoming obligations", to: ["upcoming", {}] },
  ];

  const Chip = ({ label, count, on }) => html`<button type="button" class="fltbtn" onClick=${on}
    style="display:flex;gap:8px;align-items:baseline">
    <span class="strong">${count}</span><span>${label}</span></button>`;

  return html`<div class="col" style="gap:18px">
    <${StatStrip} stats=${kpis.map((k) => ({ value: k.value, label: k.label, title: k.hint || null,
      onClick: () => onGo(k.to[0], k.to[1]) }))} />

    <${Section} title="Where the company sits in Drive" icon="folder"
      sub="The source root splits the estate in two. Click either to work through it.">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <${Chip} label="Group entities" count=${group.length} on=${() => onGo("entities", { group: "group" })} />
        <${Chip} label="Non-group entities" count=${nonGroup.length} on=${() => onGo("entities", { group: "non-group" })} />
      </div>
    </${Section}>

    <${Section} title="Legal form" icon="building"
      sub="What each company is registered as, and therefore what it owes.">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <${Chip} label="Private limited" count=${byForm("PRIVATE")} on=${() => onGo("entities", { form: "PRIVATE" })} />
        <${Chip} label="Single member company" count=${byForm("SMC")} on=${() => onGo("entities", { form: "SMC" })} />
        <${Chip} label="Public limited" count=${byForm("PUBLIC")} on=${() => onGo("entities", { form: "PUBLIC" })} />
      </div>
      <div class="tiny muted" style="padding-top:8px">
        A single member company holds no AGM. Partnerships and foreign entities are not SECP
        filing companies, so they are not a legal form here.
        ${byForm("CONFLICT") > 0 && html` ${byForm("CONFLICT")} compan${byForm("CONFLICT") === 1 ? "y is" : "ies are"} named
          inconsistently across the sources; the form is shown as disputed rather than guessed.`}
      </div>
    </${Section}>

    ${(() => {
      /* The companies with the most outstanding requirements, so the screen
         ends on something to do rather than a summary of itself. */
      const needs = inScope.filter((e) => e.outstandingGenerated > 0)
        .sort((a, b) => (b.overdueGenerated - a.overdueGenerated) || (b.outstandingGenerated - a.outstandingGenerated))
        .slice(0, 6);
      if (!needs.length) return null;
      return html`<${Section} title="Needs attention" icon="alertTriangle"
        sub="Computed from the configured statutory rules — not something Drive asserts.">
        <div class="col" style="gap:0">
          ${needs.map((e) => html`<button key=${e.key} type="button" class="feed__item clickable"
            style="text-align:left;width:100%" onClick=${() => onGo("upcoming", { entity: e.key })}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <div style="flex:1;min-width:0"><div class="tiny strong">${e.name}</div>
                <div class="tiny muted">${e.typeLabel}</div></div>
              ${e.overdueGenerated
                ? html`<${Pill} tone="red">${e.overdueGenerated} past due</${Pill}>`
                : html`<${Pill} tone="amber">${e.outstandingGenerated} outstanding</${Pill}>`}
              <${Icon} name="chevronRight" size=14 />
            </div></button>`)}
        </div>
      </${Section}>`;
    })()}

    ${/* THE EXPLANATION SITS UNDER THE NUMBERS, NOT OVER THEM.
          This was a block of prose at the top of the screen, above two cards of
          zeros, so the first thing a Legal user read was a paragraph about the
          data rather than the data. What it says is worth keeping -- which
          figures Drive proves and which LegalOS computes is exactly the
          distinction people get wrong -- so it stays, at the foot of the page. */ ""}
    <${AICard} title="What these numbers are">
      Everything above except <strong>Upcoming obligations</strong> is what the Drive source root
      actually holds: a compliance year is counted because the company has a folder for it, a document
      because the file is there. LegalOS invents no year and drops none. Upcoming obligations are the
      one computed figure — the configured statutory rules applied to each company's legal form — and
      they are marked as system-generated wherever they appear. A company with no folder has not
      necessarily filed nothing; it means this root holds no record of it.
    </${AICard}>
  </div>`;
}

/* ================================================================ REGISTER */

function SecpFilingRegister({ rows, kind, config }) {
  const drill = useFilterLink("secp");
  if (!rows.length) {
    return html`<${Empty} icon="calendar"
      title=${"No " + (kind === "event" ? "event-based" : "annual") + " filings recorded"}
      text="No SECP filing register exists in Drive, so this fills as Legal records filings. Use + New filing to record one." />`;
  }
  return html`<${RegisterShell}
    tabId=${"secp-" + kind} ns="secp" rows=${rows}
    fields=${secpFields}
    columns=${(f) => secpColumns(f, {
      onOpen: (r) => openRecord("/compliance/sec-filings/" + encodeURIComponent(r.id), { tab: "documents" }) })}
    views=${secpViews} searchKeys=${secpSearchKeys}
    searchPlaceholder="Search filings, entities, forms…"
    noun=${["filing", "filings"]}
    onRow=${(r) => openRecord("/compliance/sec-filings/" + encodeURIComponent(r.id))}
    exportName=${"secp-" + kind + "-filings"} emptyIcon="calendar"
    defaultSort=${{ key: "due", dir: "asc" }} />`;
}

/* ========================================================= COMPLIANCE YEARS */

/* What Drive PROVES about each company's statutory year. There is no filing
   register in the estate, but the entity folders do hold pre/post-AGM board
   minutes and resolutions approving audited accounts — real events, with real
   dates and the document that evidences each one.

   The distinction this view exists to hold: a document is not a filing. An AGM
   minute proves a MEETING was held; it does not prove the annual return went in.
   So every row says what it proves and carries "Not recorded" until someone
   records the filing itself. */
/* THE COMPLIANCE YEARS, BY YEAR.
   This route now serves the Drive-backed statutory model -- the same records
   the annual register holds -- but the component still rendered the older
   board-minute shape: `proves`, `financialYear`, `agm.date`. `proves` no
   longer exists, so `.join` threw on every render and took the whole
   drill-down down with it. Rendered from the fields the record actually has. */
function SecpYears({ rows, onOpenEntity, onOpenYear, cy = {}, setCy }) {
  if (!rows.length) {
    return html`<${Empty} icon="calendar" title="No compliance year folder in Drive"
      text="No CY folder was found for any entity under the SECP source root." />`;
  }
  const years = [...new Set(rows.map((r) => r.sourcePeriodLabel))].sort();
  const shown = rows.filter((r) => inCyRange(r.sourcePeriodLabel, cy.from, cy.to));
  return html`<div class="col" style="gap:12px">
    ${setCy && html`<div class="row" style="gap:8px;flex-wrap:wrap">
      <${CyRange} years=${years} from=${cy.from} to=${cy.to} idPrefix="secp-yrs"
        onFrom=${(v) => setCy({ from: v, to: cy.to })} onTo=${(v) => setCy({ from: cy.from, to: v })} />
      <div class="tiny muted" style="align-self:center">${shown.length} of ${rows.length} shown</div>
    </div>`}
    <div class="tiny muted">
      ${shown.length} entity-year record${shown.length === 1 ? "" : "s"} across
      ${new Set(shown.map((r) => r.entityKey)).size} entities and
      ${new Set(shown.map((r) => r.sourcePeriodLabel)).size} compliance years, built from the Drive folder tree.
      <strong>A document on file is not a filing with SECP.</strong>
    </div>
    <div class="tablewrap"><table class="table">
      <thead><tr>
        <th>Entity</th><th>Compliance year</th><th>Financial statements</th><th>AGM</th>
        <th>Forms on file</th><th>Filing</th><th style="text-align:right">Documents</th>
      </tr></thead>
      <tbody>
        ${shown.map((y) => html`<tr key=${y.id} class="rowlink" tabIndex=${0} role="link"
          aria-label=${"Open the " + y.sourcePeriodLabel + " compliance year for " + y.entity}
          onClick=${() => onOpenYear(y)}
          onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenYear(y); } }}>
          <td><button type="button" class="linkbtn" title=${"All SECP history for " + y.entity}
            onClick=${(e) => { e.stopPropagation(); onOpenEntity(y.entityKey); }}>
            <span class="cell-strong">${dash(y.entity)}</span></button>
            <div class="tiny muted">${y.group === "group" ? "Group" : "Non-group"}</div></td>
          <td><${Pill} tone="gray" title=${"Source folder: " + y.sourceFolder}>${y.sourcePeriodLabel}</${Pill}></td>
          <td><${StatePill} v=${y.financialStatements && y.financialStatements.status} /></td>
          <td>${y.agm && y.agm.applicable
            ? html`<${StatePill} v=${y.agm.status} />`
            : html`<${Pill} tone="gray" title=${(y.agm && y.agm.reason) || "not applicable"}>Not applicable</${Pill}>`}</td>
          <td><span class="tiny">${(y.forms || []).filter((f) => f.documentStatus === "AVAILABLE")
            .map((f) => f.form.replace(/^Form /, "")).join(", ") || "—"}</span></td>
          <td><${StatePill} v=${y.filingStatus} /></td>
          <td style="text-align:right"><span class="tiny">${y.documentCount}</span></td>
        </tr>`)}
      </tbody>
    </table></div>
  </div>`;
}

/* ========================================== DRIVE-BACKED STATUTORY ESTATE */
/* These three registers render what the Drive folder tree proves. They report
   three states per item and never merge them: a Form 29 on file is not a Form
   29 filed, and a filing is not an acknowledged filing. */

/* A COMPLIANCE-YEAR RANGE, FROM THE YEARS THAT ACTUALLY EXIST.
   The options are the CY folders Drive holds -- not a generated series -- so a
   range can never offer a year the estate does not have. The choice is kept in
   the URL, so a filtered view can be sent to a colleague and opens the same. */
function CyRange({ years, from, to, onFrom, onTo, idPrefix }) {
  if (!years.length) return null;
  const opts = (blank) => [{ value: "", label: blank }].concat(years.map((y) => ({ value: y, label: y })));
  return html`<${Fragment}>
    <label class="tiny muted" style="align-self:center" for=${idPrefix + "-from"}>From CY</label>
    <div style="width:118px"><${Select} id=${idPrefix + "-from"} value=${from} onChange=${onFrom}
      options=${opts("Earliest")} /></div>
    <label class="tiny muted" style="align-self:center" for=${idPrefix + "-to"}>To CY</label>
    <div style="width:118px"><${Select} id=${idPrefix + "-to"} value=${to} onChange=${onTo}
      options=${opts("Latest")} /></div>
  </${Fragment}>`;
}

/* Inclusive, and tolerant of the two being set the wrong way round -- a range
   entered back to front is a slip, not a request for no rows. */
function inCyRange(label, from, to) {
  const n = (v) => { const m = String(v || "").match(/(\d{4})/); return m ? Number(m[1]) : null; };
  const y = n(label); if (y == null) return true;
  let lo = n(from), hi = n(to);
  if (lo != null && hi != null && lo > hi) { const t = lo; lo = hi; hi = t; }
  if (lo != null && y < lo) return false;
  if (hi != null && y > hi) return false;
  return true;
}

const STATE_TONE = { AVAILABLE: "green", EVIDENCE_OF_SUBMISSION: "green", RECEIVED: "green",
  NOT_RECORDED: "gray", NONE: "gray", NO_SOURCE_DOCUMENT: "amber", NOT_APPLICABLE: "gray", EVIDENCED: "green" };
const STATE_WORD = { AVAILABLE: "On file", NO_SOURCE_DOCUMENT: "No source document",
  EVIDENCE_OF_SUBMISSION: "Submission evidenced", NOT_RECORDED: "Not recorded",
  RECEIVED: "Acknowledged", NONE: "No acknowledgement", NOT_APPLICABLE: "Not applicable", EVIDENCED: "Evidenced" };
const StatePill = ({ v, title }) => html`<${Pill} tone=${STATE_TONE[v] || "gray"} title=${title || v}>
  ${STATE_WORD[v] || v || "—"}</${Pill}>`;

/* A register that is still loading, failed, or is genuinely empty must say
   which. Rendering all three as an empty table is how "0 filings" came to be
   printed over an estate of 3,367 documents. */
function EstateState({ res, rows, icon, what, children }) {
  if (res && res.loading && !rows.length) {
    return html`<div class="tiny muted" style="padding:20px 2px">Reading ${what} from Drive…</div>`;
  }
  if (res && res.error) {
    return html`<${Empty} icon="alertTriangle" title=${"Could not read " + what}
      text=${String((res.error && res.error.message) || res.error)}
      action=${res.reload && html`<${Btn} size="sm" icon="refresh" onClick=${() => res.reload()}>Retry</${Btn}>`} />`;
  }
  if (!rows.length) {
    return html`<${Empty} icon=${icon} title=${"No " + what + " found in Drive"}
      text="Nothing under the SECP source root maps to this register." />`;
  }
  return children;
}

/* Search across a statutory register. It reaches the things a lawyer actually
   knows when looking something up -- the company, the year, the form number,
   the event, and the NAME OF A DOCUMENT -- rather than only the columns that
   happen to be rendered. Document names are searched because "find the PACRA
   letter" is how the question is really asked. */
function secpMatch(r, q) {
  if (!q) return true;
  const t = q.toLowerCase();
  const hay = [r.entity, r.entityKey, r.entityType, r.group, r.sourcePeriodLabel,
    r.complianceYear, r.form, r.formCode, r.eventType, r.register, r.category,
    r.eventDate, r.filingStatus, r.acknowledgementStatus, r.sourceFolder]
    /* Only forms actually ON FILE. Every annual record carries a row for each
       configured form, present or not, so matching those made a search for
       "Form 9" return all 250 records -- including every year that holds no
       Form 9 at all. */
    .concat((r.forms || []).filter((f) => f.documentStatus === "AVAILABLE").map((f) => f.form))
    .concat((r.eventFormsInYear || []).map((f) => f.form))
    .concat((r.documents || []).map((d) => d.name));
  return hay.some((v) => v != null && String(v).toLowerCase().includes(t));
}

/* Input is a raw <input> passthrough, so its handler receives the EVENT, not
   the value -- unwrapping it here rather than at each call site. */
const SecpSearch = ({ value, onChange, id, placeholder }) => html`
  <div class="inputgroup" style="width:280px"><${Icon} name="search" size=15 />
    <input class="input" id=${id} type="search" value=${value} placeholder=${placeholder}
      aria-label=${placeholder} onInput=${(e) => onChange(e.target.value)} /></div>`;

function SecpAnnualCompliance({ rows, res, native, config, onOpenYear, onOpenEntity, cy, setCy }) {
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const entities = [...new Set(rows.map((r) => r.entity))].sort();
  const years = [...new Set(rows.map((r) => r.sourcePeriodLabel))].sort();
  const shown = rows.filter((r) => (!entity || r.entity === entity)
    && inCyRange(r.sourcePeriodLabel, cy.from, cy.to) && secpMatch(r, q));

  return html`<${EstateState} res=${res} rows=${rows} icon="calendar" what="annual compliance records">
    <div class="col" style="gap:16px">
      ${native.length > 0 && html`<${Section} title=${"Filings recorded in LegalOS (" + native.length + ")"} icon="edit"
        sub="Raised here by the team. Drive-backed history and LegalOS filings are one statutory history, so both stay reachable.">
        <${SecpFilingRegister} rows=${native} kind="annual" config=${config} />
      </${Section}>`}
      <div class="tiny muted">
        ${rows.length} entity-year record${rows.length === 1 ? "" : "s"} across
        ${new Set(rows.map((r) => r.entityKey)).size} entities, built from the Drive folder tree.
        ${native.length ? native.length + " filing" + (native.length === 1 ? " is" : "s are") + " recorded in LegalOS." : "No LegalOS filing has been recorded against these years yet."}
        <strong>A document on file is not a filing with SECP.</strong>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <div style="width:260px"><${Select} value=${entity} onChange=${setEntity} id="secp-ann-entity"
          options=${[{ value: "", label: "All entities" }].concat(entities.map((e) => ({ value: e, label: e })))} /></div>
        <${CyRange} years=${years} from=${cy.from} to=${cy.to} idPrefix="secp-ann"
          onFrom=${(v) => setCy({ from: v, to: cy.to })} onTo=${(v) => setCy({ from: cy.from, to: v })} />
        <${SecpSearch} id="secp-ann-q" value=${q} onChange=${setQ}
          placeholder="Search entity, year, form or document…" />
        <div class="tiny muted" style="align-self:center">${shown.length} shown</div>
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Entity</th><th>Year</th><th>Financial statements</th><th>AGM</th>
          <th>Forms on file</th><th>Filing</th><th>Acknowledgement</th><th>Documents</th></tr></thead>
        <tbody>
          ${shown.map((r) => html`<tr key=${r.id} class="rowlink" tabIndex=${0} role="link"
            aria-label=${"Open " + r.entity + " " + r.sourcePeriodLabel}
            onClick=${() => onOpenYear(r)}
            onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenYear(r); } }}>
            <td><button type="button" class="linkbtn" onClick=${(e) => { e.stopPropagation(); onOpenEntity(r.entityKey); }}>
              <span class="cell-strong">${dash(r.entity)}</span></button>
              <div class="tiny muted">${r.entityType === "SMC" ? "SMC" : r.entityType === "PRIVATE_LIMITED" ? "Private Limited" : "Other"} · ${r.group === "group" ? "Group" : "Non-group"}</div></td>
            <td><${Pill} tone="gray" title=${"Source folder: " + r.sourceFolder}>${r.sourcePeriodLabel}</${Pill}></td>
            <td><${StatePill} v=${r.financialStatements.status} /></td>
            <td>${r.agm.applicable
              ? html`<${StatePill} v=${r.agm.status} />`
              : html`<${Pill} tone="gray" title=${r.agm.reason || "not applicable"}>Not applicable</${Pill}>`}</td>
            <td><span class="tiny">${r.forms.filter((f) => f.documentStatus === "AVAILABLE").map((f) => f.form.replace(/^Form /, "")).join(", ") || "—"}</span>
              ${r.eventFormsInYear && r.eventFormsInYear.length
                ? html`<div class="tiny muted" title="Event-triggered forms filed in this year's folder. They are recorded in the event register, not as annual requirements.">+${r.eventFormsInYear.length} event form${r.eventFormsInYear.length === 1 ? "" : "s"}</div>` : null}</td>
            <td><${StatePill} v=${r.filingStatus} /></td>
            <td><${StatePill} v=${r.acknowledgementStatus} /></td>
            <td><span class="tiny">${r.documentCount}</span></td>
          </tr>`)}
        </tbody>
      </table></div>
    </div>
  </${EstateState}>`;
}

function SecpEventFilings({ rows, res, native, config, onOpenEntity }) {
  const [entity, setEntity] = useState("");
  const [form, setForm] = useState("");
  const [q, setQ] = useState("");
  const entities = [...new Set(rows.map((r) => r.entity))].sort();
  const forms = [...new Set(rows.map((r) => r.form || r.eventType))].sort()
    .map((v) => ({ value: v, label: r_isForm(v) ? v : eventLabel(v) }));
  const shown = rows.filter((r) => (!entity || r.entity === entity) && (!form || (r.form || r.eventType) === form) && secpMatch(r, q));

  return html`<${EstateState} res=${res} rows=${rows} icon="zap" what="event-based filings">
    <div class="col" style="gap:16px">
      ${native.length > 0 && html`<${Section} title=${"Filings recorded in LegalOS (" + native.length + ")"} icon="edit"
        sub="Raised here by the team, alongside the event filings the Drive estate evidences.">
        <${SecpFilingRegister} rows=${native} kind="event" config=${config} />
      </${Section}>`}
      <div class="tiny muted">
        ${rows.length} event-triggered filing${rows.length === 1 ? "" : "s"} across
        ${new Set(rows.map((r) => r.entityKey)).size} entities — shares allotted, officers changed,
        meetings convened. ${native.length ? native.length + " recorded in LegalOS." : ""}
        <strong>Dates are read from the document, never from Drive's upload time.</strong>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <div style="width:260px"><${Select} value=${entity} onChange=${setEntity} id="secp-ev-entity"
          options=${[{ value: "", label: "All entities" }].concat(entities.map((e) => ({ value: e, label: e })))} /></div>
        <div style="width:200px"><${Select} value=${form} onChange=${setForm} id="secp-ev-form"
          options=${[{ value: "", label: "All forms and events" }].concat(forms)} /></div>
        <${SecpSearch} id="secp-ev-q" value=${q} onChange=${setQ}
          placeholder="Search entity, form, event or document…" />
        <div class="tiny muted" style="align-self:center">${shown.length} shown</div>
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Entity</th><th>Form / event</th><th>Event date</th><th>Compliance year</th>
          <th>Filing</th><th>Acknowledgement</th><th>Documents</th></tr></thead>
        <tbody>
          ${shown.map((r) => html`<tr key=${r.id}>
            <td><button type="button" class="linkbtn" onClick=${() => onOpenEntity(r.entityKey)}>
              <span class="cell-strong">${dash(r.entity)}</span></button></td>
            <td><span class="tiny">${r.form || eventLabel(r.eventType)}</span></td>
            <td><span class="tiny">${r.eventDate ? fmt.date(r.eventDate) : html`<span class="muted" title="No date is stated in the source document.">Undated</span>`}</span></td>
            <td><span class="tiny muted">${r.sourcePeriodLabel || "—"}</span></td>
            <td><${StatePill} v=${r.filingStatus} /></td>
            <td><${StatePill} v=${r.acknowledgementStatus} /></td>
            <td><span class="tiny">${r.documentCount}</span></td>
          </tr>`)}
        </tbody>
      </table></div>
    </div>
  </${EstateState}>`;
}

function SecpStatutoryRegisters({ rows, res, onOpenEntity }) {
  const [q, setQ] = useState("");
  const shown = rows.filter((r) => secpMatch(r, q));
  return html`<${EstateState} res=${res} rows=${rows} icon="book" what="statutory registers">
    <div class="col" style="gap:12px">
      <div class="tiny muted">
        ${rows.length} entity-level statutory register${rows.length === 1 ? "" : "s"} — registers of
        members and directors, share certificates and other corporate records.
        <strong>These are corporate records, not filings, and are never counted as filings.</strong>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <${SecpSearch} id="secp-rg-q" value=${q} onChange=${setQ}
          placeholder="Search entity, register or document…" />
        <div class="tiny muted" style="align-self:center">${shown.length} shown</div>
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Entity</th><th>Register</th><th>Category</th><th>Documents</th></tr></thead>
        <tbody>
          ${shown.map((r) => html`<tr key=${r.id}>
            <td><button type="button" class="linkbtn" onClick=${() => onOpenEntity(r.entityKey)}>
              <span class="cell-strong">${dash(r.entity)}</span></button></td>
            <td><span class="tiny">${dash(r.register)}</span></td>
            <td><${Pill} tone="gray">${String(r.category || "").replace(/_/g, " ").toLowerCase()}</${Pill}></td>
            <td><span class="tiny">${r.documentCount}</span></td>
          </tr>`)}
        </tbody>
      </table></div>
    </div>
  </${EstateState}>`;
}

/* ===================================================== UPCOMING OBLIGATIONS */
/* NOT DRIVE. Everything in the registers above exists because a folder exists.
   These exist because a rule says a deadline is coming. The workspace used to
   put "FY 2028 / FY 2027 / FY 2026" -- a formula's output -- in the header
   above ten years of real filings, where it read exactly like source. They are
   here instead, labelled, with the configured rule that produced each date. */
function SecpUpcoming({ rows, res, basis, fy, years, onFY, onOpenEntity, onOpenYear }) {
  const [group, setGroup] = useState("");
  const shown = rows.filter((r) => !group || r.group === group);
  const overdue = shown.reduce((a, r) => a + r.overdue, 0);

  return html`<${EstateState} res=${res} rows=${rows} icon="calendar" what="upcoming obligations">
    <div class="col" style="gap:12px">
      <div class="alertrow alertrow--warn" style="cursor:default">
        <${Icon} name="alertTriangle" size=15 />
        <span><strong>System-generated — not a Drive record.</strong>
          ${" " + (basis || "Computed from the statutory rules in the compliance configuration.")}
          ${" Nothing in Google Drive asserts these; they are what the configured rules say is due."}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <div style="width:200px"><${Select} value=${group} onChange=${setGroup} id="secp-up-group"
          options=${[{ value: "", label: "All entities" }, { value: "group", label: "Group entities" },
            { value: "non-group", label: "Non-group entities" }]} /></div>
        ${years && years.length ? html`<label class="tiny muted" style="align-self:center" for="secp-fy">Planning year</label>
          <div style="width:130px"><${Select} value=${fy} onChange=${onFY} options=${years} id="secp-fy" /></div>` : null}
        <div class="tiny muted" style="align-self:center">${shown.length} entities · ${overdue} requirement${overdue === 1 ? "" : "s"} past a configured due date</div>
      </div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Entity</th><th>Compliance year</th><th>Year end</th>
          <th>Requirements outstanding</th><th>Past due date</th><th>Source year</th></tr></thead>
        <tbody>
          ${shown.map((r) => html`<tr key=${r.id}>
            <td><button type="button" class="linkbtn" onClick=${() => onOpenEntity(r.entityKey)}>
              <span class="cell-strong">${dash(r.entity)}</span></button>
              <div class="tiny muted">${r.entityType === "SMC" ? "SMC · no AGM required" : "Private Limited"} · ${r.group === "group" ? "Group" : "Non-group"}</div></td>
            <td><${Pill} tone="amber" title="System-generated planning period, not a Drive folder">${r.sourcePeriodLabel}</${Pill}></td>
            <td><span class="tiny">${fmt.date(r.yearEnd)}</span></td>
            <td><span class="tiny">${r.requirements.filter((i) => i.documentStatus !== "AVAILABLE")
              .map((i) => i.requirement.replace(/^Form /, "")).join(", ") || "None"}</span></td>
            <td>${r.overdue
              ? html`<${Pill} tone="red" title="Past the due date the configuration computes">${r.overdue}</${Pill}>`
              : html`<span class="tiny muted">—</span>`}</td>
            <td>${r.sourceBacked
              ? html`<button type="button" class="linkbtn" onClick=${() => onOpenYear(r.sourceYearId)}>
                  <span class="tiny">${r.sourcePeriodLabel} on file →</span></button>`
              : html`<span class="tiny muted" title="Drive holds no folder for this compliance year yet">Not yet in Drive</span>`}</td>
          </tr>`)}
        </tbody>
      </table></div>
      <div class="tiny muted">
        Due dates are computed from the year end and the days allowed after it in the
        compliance configuration. A requirement already satisfied by a document in Drive is
        not listed as outstanding.
      </div>
    </div>
  </${EstateState}>`;
}

/* ================================================================ ENTITIES */

/* ONE WORKSPACE, NOT THREE.
   "Entities", "Compliance years" and "Annual compliance" were three screens
   over the same 250 entity-year records, and a Legal user had to know which one
   answered their question. There is now one register: the company is the row,
   its filing history is what you get when you click it.

   DRIVE DECIDES WHO IS LISTED. LegalOS knows more companies than the statutory
   estate holds -- old spellings ("Deever Developers (Pvt) Ltd" beside "Deevar
   Developers (Private) Limited"), former names, and foreign entities outside
   SECP jurisdiction. Those are reachable behind the scope filter, because a
   company LegalOS knows about is not deleted for being absent from one root. */

const SECP_COLS = [
  { id: "name", label: "Entity", get: (e) => e.name.toLowerCase(), align: "left" },
  { id: "form", label: "Legal form", get: (e) => e.typeLabel || "", align: "left" },
  { id: "firstCY", label: "First CY", get: (e) => e.firstCY || 0, align: "right",
    title: "Earliest compliance year Drive holds a folder for" },
  { id: "latestCY", label: "Latest CY", get: (e) => e.latestCY || 0, align: "right",
    title: "Most recent compliance year Drive holds a folder for" },
  { id: "years", label: "Years on file", get: (e) => e.complianceYears || 0, align: "right",
    title: "Compliance-year folders this company has in Drive" },
  { id: "evidence", label: "Filing evidence", get: (e) => e.evidencedYears || 0, align: "right",
    title: "Years where Drive holds evidence of submission — an acknowledgement, not merely a prepared form" },
  { id: "events", label: "Event filings", get: (e) => e.eventFilings || 0, align: "right",
    title: "Event-triggered filings the Drive estate evidences" },
  { id: "registers", label: "Registers", get: (e) => e.statutoryRegisters || 0, align: "right",
    title: "Registers of members and directors, share certificates" },
  { id: "docs", label: "Documents", get: (e) => e.statutoryDocuments || 0, align: "right",
    title: "Statutory documents held in this company's own folders" },
  { id: "upcoming", label: "Upcoming", get: (e) => (e.overdueGenerated || 0) * 1000 + (e.outstandingGenerated || 0), align: "right",
    title: "Requirements the configured statutory rules say are outstanding. System-generated, not something Drive asserts." },
];

function SecpEntities({ ents, onOpen, stat, q, patch }) {
  /* Every filter is in the URL, so a filtered register is a link somebody can
     send to a colleague and a browser Back returns to it. */
  const scope = q.escope || "secp";
  const group = q.group || "";
  const form = q.form || "";
  const evidence = q.evidence || "";
  const docs = q.docs || "";
  const term = q.eq || "";
  const cyFrom = q.cyfrom || "";
  const cyTo = q.cyto || "";
  const sort = q.esort || "name";
  const dir = q.edir || (q.esort && q.esort !== "name" ? "desc" : "asc");
  const set = (o) => patch(o);

  /* THE SCOPE IS A BRANCH OF THE ESTATE, NOT A TOGGLE.
     A partnership firm and an offshore holding company are not SECP filing
     companies -- no AGM, no Form A, no Form 9 or 19 is owed and none is
     generated for them. Listing them beside companies with ten years of
     filings made the estate look full of companies that had filed nothing.
     They keep their own branch: reachable, counted, and never mixed into the
     company-filing population. */
  const COMPANY_FORMS = ["PRIVATE", "SMC", "PUBLIC", "CONFLICT"];
  const branches = {
    secp: ents.filter((e) => e.statutory && COMPANY_FORMS.includes(e.type)),
    foreign: ents.filter((e) => e.type === "FOREIGN"),
    partnership: ents.filter((e) => e.type === "PARTNERSHIP"),
    absent: ents.filter((e) => !e.statutory && COMPANY_FORMS.includes(e.type)),
    all: ents,
  };
  const base = branches[scope] || branches.secp;
  const filesWithSecp = scope === "secp" || scope === "absent" || scope === "all";
  const inDrive = branches.secp;
  const notInDrive = branches.absent;

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    let out = base.filter((e) => {
      if (t && !(e.name.toLowerCase().includes(t) || String(e.key).includes(t))) return false;
      if (group && e.statutory && (e.statutory.group === "group") !== (group === "group")) return false;
      if (group && !e.statutory) return false;
      if (form && e.type !== form) return false;
      if (evidence === "yes" && !(e.evidencedYears > 0)) return false;
      if (evidence === "no" && e.evidencedYears > 0) return false;
      if (docs === "yes" && !(e.statutoryDocuments > 0)) return false;
      if (docs === "no" && e.statutoryDocuments > 0) return false;
      /* A CY range asks "who has filings in these years", so an entity is kept
         when its years on file overlap the range at all -- not when they sit
         inside it. */
      if (cyFrom && e.latestCY != null && e.latestCY < Number(cyFrom)) return false;
      if (cyTo && e.firstCY != null && e.firstCY > Number(cyTo)) return false;
      if ((cyFrom || cyTo) && e.firstCY == null) return false;
      return true;
    });
    const col = SECP_COLS.find((c) => c.id === sort) || SECP_COLS[0];
    const m = dir === "asc" ? 1 : -1;
    out = out.slice().sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (x < y) return -1 * m;
      if (x > y) return 1 * m;
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [base, term, group, form, evidence, docs, cyFrom, cyTo, sort, dir]);

  const years = useMemo(() => {
    const ys = new Set();
    for (const e of ents) { if (e.firstCY) ys.add(e.firstCY); if (e.latestCY) ys.add(e.latestCY); }
    return [...ys].sort((a, b) => a - b);
  }, [ents]);

  const onSort = (id) => {
    if (sort === id) return set({ edir: dir === "asc" ? "desc" : "asc" });
    /* Names read A–Z; counts read biggest-first, because nobody opens a count
       column to find the zeroes. */
    set({ esort: id, edir: id === "name" || id === "form" ? "asc" : "desc" });
  };

  const chips = [
    term && { label: "Search: " + term, clear: { eq: "" } },
    scope !== "secp" && { label: { foreign: "Foreign / offshore", partnership: "Partnerships",
      absent: "No Drive folder", all: "All known entities" }[scope], clear: { escope: "" } },
    group && { label: group === "group" ? "Group entities" : "Non-group entities", clear: { group: "" } },
    form && { label: (SECP_COLS && (ents.find((e) => e.type === form) || {}).typeLabel) || form, clear: { form: "" } },
    evidence && { label: evidence === "yes" ? "Has filing evidence" : "No filing evidence", clear: { evidence: "" } },
    docs && { label: docs === "yes" ? "Has documents" : "No documents", clear: { docs: "" } },
    (cyFrom || cyTo) && { label: "CY " + (cyFrom || "earliest") + "–" + (cyTo || "latest"), clear: { cyfrom: "", cyto: "" } },
  ].filter(Boolean);

  const Arrow = ({ on }) => (on ? html`<span aria-hidden="true" style="padding-left:4px">${dir === "asc" ? "▲" : "▼"}</span>` : null);

  /* THE COUNTS BELONG TO THE BRANCH ON SCREEN.
     A global total sitting over a filtered table is a lie by adjacency: pick
     Group + Public Limited and the header still read "3,367 documents" while
     one row was showing. Every figure here is summed over exactly the rows
     below it, so the number and the table can never disagree. */
  const totals = useMemo(() => rows.reduce((t, e) => ({
    entities: t.entities + 1,
    years: t.years + (e.complianceYears || 0),
    evidence: t.evidence + (e.evidencedYears || 0),
    events: t.events + (e.eventFilings || 0),
    registers: t.registers + (e.statutoryRegisters || 0),
    docs: t.docs + (e.statutoryDocuments || 0),
    upcoming: t.upcoming + (e.outstandingGenerated || 0),
  }), { entities: 0, years: 0, evidence: 0, events: 0, registers: 0, docs: 0, upcoming: 0 }), [rows]);

  const exportBranch = () => downloadCsv(
    "secp-entities" + (scope !== "secp" ? "-" + scope : "") + (group ? "-" + group : "")
      + (form ? "-" + form.toLowerCase() : "") + (cyFrom || cyTo ? "-cy" + (cyFrom || "") + "-" + (cyTo || "") : ""),
    [
      { key: "name", label: "Entity" },
      { key: "typeLabel", label: "Legal form" },
      { key: "sourceGroup", label: "Source group" },
      { key: "firstCY", label: "First CY" },
      { key: "latestCY", label: "Latest CY" },
      { key: "complianceYears", label: "Years on file" },
      { key: "evidencedYears", label: "Filing evidence" },
      { key: "eventFilings", label: "Event filings" },
      { key: "statutoryRegisters", label: "Statutory registers" },
      { key: "statutoryDocuments", label: "Documents" },
      { key: "outstandingGenerated", label: "Upcoming obligations" },
      { key: "drivePath", label: "Drive path" },
    ],
    /* The CURRENT branch, in the order it is on screen -- not the whole
       estate. Somebody exporting a filtered register means that filter. */
    rows.map((e) => ({ ...e,
      sourceGroup: e.statutory ? (e.statutory.group === "group" ? "Group" : "Non-group") : "",
      drivePath: e.statutory ? e.statutory.folderPath : "" })),
  );

  return html`<div class="col" style="gap:12px">
    ${stat && html`<div class="tiny muted">
      <strong>${inDrive.length} compan${inDrive.length === 1 ? "y holds" : "ies hold"} a statutory folder in Drive</strong>
      — ${stat.groupEntities} group, ${stat.nonGroupEntities} non-group. LegalOS knows ${ents.length}
      entities in all; the other ${notInDrive.length} have no folder under the SECP source root —
      former names, alternative spellings and foreign entities outside SECP jurisdiction.
      That is not the same as having filed nothing.
    </div>`}

    ${!filesWithSecp && html`<div class="banner banner--info tiny">
      <strong>SECP company filing: not applicable.</strong>
      ${scope === "partnership"
        ? " A registered partnership is not a company under the Companies Act. It holds no AGM and owes no Form A, Form 9 or Form 19, so none is generated here."
        : " Foreign and offshore entities are outside SECP jurisdiction. No annual return, AGM or statutory form is owed to SECP, so none is generated here."}
      These entities are listed so they can be inspected — never counted in the company-filing population.
    </div>`}

    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:220px">
        <${Input} value=${term} placeholder="Search entities…" aria-label="Search entities"
          onChange=${(v) => set({ eq: v })} /></div>
      <div style="width:150px"><${Select} value=${group} onChange=${(v) => set({ group: v })} id="secp-f-group"
        label="Source" options=${[{ value: "", label: "Group & non-group" },
          { value: "group", label: "Group only" }, { value: "non-group", label: "Non-group only" }]} /></div>
      <div style="width:170px"><${Select} value=${form} onChange=${(v) => set({ form: v })} id="secp-f-form"
        label="Legal form" options=${[{ value: "", label: "Any legal form" },
          { value: "PRIVATE", label: "Private limited" }, { value: "SMC", label: "Single member company" },
          { value: "PUBLIC", label: "Public limited" }]} /></div>
      <div style="width:160px"><${Select} value=${evidence} onChange=${(v) => set({ evidence: v })} id="secp-f-ev"
        label="Filing evidence" options=${[{ value: "", label: "Any" },
          { value: "yes", label: "Has evidence" }, { value: "no", label: "No evidence" }]} /></div>
      <div style="width:150px"><${Select} value=${docs} onChange=${(v) => set({ docs: v })} id="secp-f-docs"
        label="Documents" options=${[{ value: "", label: "Any" },
          { value: "yes", label: "Has documents" }, { value: "no", label: "None held" }]} /></div>
      <${CyRange} years=${years} from=${cyFrom} to=${cyTo} idPrefix="secp-ent"
        onFrom=${(v) => set({ cyfrom: v })} onTo=${(v) => set({ cyto: v })} />
      <div style="width:210px"><${Select} value=${scope} onChange=${(v) => set({ escope: v, group: "", form: "" })} id="secp-ent-scope"
        label="Scope" options=${[
          { value: "secp", label: "In-scope SECP (" + branches.secp.length + ")" },
          { value: "foreign", label: "Foreign / offshore (" + branches.foreign.length + ")" },
          { value: "partnership", label: "Partnerships (" + branches.partnership.length + ")" },
          { value: "absent", label: "No Drive folder (" + branches.absent.length + ")" },
          { value: "all", label: "All known entities (" + branches.all.length + ")" },
        ]} /></div>
    </div>

    ${chips.length > 0 && html`<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
      <span class="tiny muted">Filtered by</span>
      ${chips.map((c, i) => html`<button key=${i} type="button" class="fltbtn fltbtn--on"
        title="Remove this filter" onClick=${() => set(c.clear)}>${c.label} ✕</button>`)}
      <button type="button" class="fltbtn" onClick=${() => set({ eq: "", escope: "", group: "", form: "",
        evidence: "", docs: "", cyfrom: "", cyto: "" })}>Clear all</button>
    </div>`}

    ${filesWithSecp
      ? html`<${StatStrip} stats=${[
          { value: totals.entities, label: totals.entities === 1 ? "Entity" : "Entities" },
          { value: totals.years.toLocaleString(), label: "Entity-year records" },
          { value: totals.evidence, label: "With filing evidence" },
          { value: totals.events.toLocaleString(), label: "Event filings" },
          { value: totals.registers, label: "Statutory registers" },
          { value: totals.docs.toLocaleString(), label: "Documents",
            title: "Distinct instruments. Where the same document is filed in two source folders it is counted once, and both copies are kept on the document." },
          { value: totals.upcoming, label: "Upcoming obligations" },
        ]} />`
      : null}

    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
      <div class="tiny muted">${rows.length} of ${base.length} shown${chips.length
        ? " — every figure above is this branch only" : ""}</div>
      <div class="spacer"></div>
      ${rows.length > 0 && html`<button type="button" class="fltbtn" onClick=${exportBranch}
        title="Exports exactly the rows below, with the filters that produced them">
        Export this branch (${rows.length})</button>`}
    </div>

    ${rows.length === 0
      ? html`<${Empty} icon="building" title="No entities match" text="No company matches these filters. Clear one to widen the register." />`
      : !filesWithSecp
      ? html`${/* Ten columns of em dashes beside a partnership is how this
                   estate came to look full of companies that had filed
                   nothing. An entity that owes SECP nothing is shown as owing
                   SECP nothing, not as having a row of zeroes. */ ""}
        <div class="tablewrap"><table class="table">
          <thead><tr><th>Entity</th><th>Legal form</th><th>SECP company filing</th></tr></thead>
          <tbody>${rows.map((e) => html`<tr key=${e.key}>
            <td><div class="cell-strong">${e.name}</div>
              ${e.outOfScopeReason && html`<div class="tiny muted">${e.outOfScopeReason}</div>`}</td>
            <td><${Pill} tone="gray">${e.typeLabel}</${Pill}></td>
            <td><span class="tiny muted">Not applicable</span></td>
          </tr>`)}</tbody>
        </table></div>`
      : html`<div class="tablewrap"><table class="table">
    <thead><tr>
      ${SECP_COLS.map((c) => html`<th key=${c.id} style=${"text-align:" + c.align}
        aria-sort=${sort === c.id ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" class="thsort" title=${c.title || ("Sort by " + c.label)}
          onClick=${() => onSort(c.id)}>${c.label}<${Arrow} on=${sort === c.id} /></button></th>`)}
      ${/* A header with no text is invisible to a screen reader, which then
            announces the last column as nothing at all. The label is there and
            visually hidden rather than absent. */ ""}
      <th style="width:110px" aria-label="Open"></th>
    </tr></thead>
    <tbody>
      ${rows.map((e) => html`<tr key=${e.key} class="rowlink" tabIndex=${0} role="link"
        aria-label=${"Open the SECP filing history for " + e.name}
        onClick=${() => onOpen(e.key)}
        onKeyDown=${(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(e.key); } }}>
        <td><div class="cell-strong">${e.name}</div>
          ${e.statutory && html`<div class="tiny muted">${e.statutory.group === "group" ? "Group" : "Non-group"}</div>`}
          ${!e.inScope && html`<div class="tiny muted">${e.outOfScopeReason || "Outside SECP scope"}</div>`}</td>
        <td><${Pill} tone=${e.type === "CONFLICT" ? "amber" : e.type === "SMC" ? "gray" : "indigo"}
          title=${e.type === "CONFLICT" ? "The sources disagree about this company's legal form, so no obligation is asserted from it" : null}
          >${e.typeLabel}</${Pill}></td>
        ${/* Every figure here is what the Drive estate holds for this company.
              An em dash means the estate holds none of that thing — never that
              the number was unavailable. */ ""}
        <td style="text-align:right">${e.firstCY || html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.latestCY || html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.complianceYears || html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.evidencedYears
    ? html`<${Pill} tone="green">${e.evidencedYears}</${Pill}>`
    : html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.eventFilings || html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.statutoryRegisters || html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.statutoryDocuments
    ? html`<span class="cell-strong">${e.statutoryDocuments}</span>`
    : html`<span class="tiny muted">—</span>`}</td>
        <td style="text-align:right">${e.outstandingGenerated
    ? html`<${Pill} tone=${e.overdueGenerated ? "red" : "amber"}
        title="Computed from the configured statutory rules — not a Drive record">${e.outstandingGenerated}</${Pill}>`
    : html`<span class="tiny muted">—</span>`}</td>
        <td><span class="tiny" style="color:var(--brand);font-weight:600">Filing history →</span></td>
      </tr>`)}
    </tbody>
  </table></div>`}
  </div>`;
}

/* ========================================================== ENTITY HISTORY */

/* A status or a count in the year table opens the year ON the tab that holds
   the documents behind it. Where there is nothing behind a cell, the cell is
   not a link -- an empty state that pretends to be clickable is worse than one
   that admits it is empty. */
function openYearTab(y, tab) {
  navigate("/compliance/sec-filings/year/" + encodeURIComponent(y.id) + (tab === "overview" ? "" : "?tab=" + tab));
}
function YearCell({ y, tab, has, children }) {
  if (!has) return children;
  return html`<button type="button" class="cellbtn" title="Open the documents behind this"
    onClick=${(ev) => { ev.stopPropagation(); openYearTab(y, tab); }}>${children}</button>`;
}

function SecpEntityDetail({ entityKey, config, onBack, onOpenRecord, onNewFiling }) {
  const { data, loading, error } = useSecpEntity(entityKey);
  const [mode, setMode] = useState("year");
  const [range, setRange] = useState({ from: "", to: "" });
  const caps = (config && config.capabilities) || {};

  if (error) return html`<${Empty} icon="alertTriangle" title="Entity not found" text=${error.message} />`;
  if (loading || !data) return html`<div class="tiny muted" style="padding:20px 2px">Reading the entity…</div>`;

  const e = data.entity;
  /* THE COMPANY'S OWN COMPLIANCE YEARS, FROM ITS OWN DRIVE FOLDER.
     This page used to render secp.financialYears() -- FY 2021..FY 2028 from a
     formula -- so every company opened on the same eight generated rows with
     generated deadlines, whatever its Drive estate held. A company with ten CY
     folders and 83 statutory documents looked identical to one with none. */
  const cy = data.complianceYears || [];
  /* The same CY range as the registers, on this company's own history. */
  const cyYears = [...new Set(cy.map((y) => y.sourcePeriodLabel))].sort();
  const shownCy = cy.filter((y) => inCyRange(y.sourcePeriodLabel, range.from, range.to));
  const registers = data.statutoryRegisters || [];
  const driveEvents = data.eventFilings || [];
  const upcoming = data.upcoming || [];
  const src = data.source;

  /* One screen per question, instead of six stacked sections a user had to
     scroll past to reach the one they came for. */
  /* Distinct Drive files, not the sum of three document counts: an event
     filing's documents are the same files as the compliance year folder that
     holds them, so adding the populations overstates the company's estate. */
  const docTotal = (() => {
    const ids = new Set();
    for (const y of cy) for (const d of (y.documents || [])) ids.add(d.id);
    for (const v of driveEvents) for (const d of (v.documents || [])) ids.add(d.id);
    for (const r of registers) for (const d of (r.documents || [])) ids.add(d.id);
    return ids.size;
  })();
  const upcomingCount = upcoming.reduce((n, u) => n + u.requirements.length, 0);
  const upcomingOverdue = upcoming.some((u) => u.requirements.some((i) =>
    i.statutoryDueDate && i.statutoryDueDate < today() && i.documentStatus !== "AVAILABLE"));
  const etabs = [
    { id: "year", label: "Compliance years", count: cy.length },
    { id: "events", label: "Event filings", count: driveEvents.length },
    { id: "registers", label: "Statutory registers", count: registers.length },
    { id: "documents", label: "Documents", count: docTotal },
    { id: "upcoming", label: "Upcoming obligations", count: upcomingCount },
    { id: "chrono", label: "Chronology" },
  ];

  return html`<div class="col" style="gap:16px">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <${Btn} size="sm" icon="arrowLeft" onClick=${onBack}>All entities</${Btn}>
      <div>
        <div class="strong">${e.name}</div>
        <div class="tiny muted">${e.typeLabel}
          ${src ? " · " + src.groupFolderName : ""}
          ${e.requirements && e.requirements.note ? " · " + e.requirements.note : ""}</div>
      </div>
      <div class="spacer"></div>
      ${caps["compliance.filing.create"] && html`<${Btn} variant="primary" size="sm" icon="plus"
        onClick=${() => onNewFiling({ entityKey: e.key, entity: e.name })}>+ New filing</${Btn}>`}
    </div>

    ${/* The company's own numbers, before any of its tables. Each one is the
          size of the tab it belongs to, so the tab bar below is not a guess. */ ""}
    <${StatStrip} stats=${[
      { value: cy.length, label: "Compliance years", onClick: () => setMode("year") },
      { value: cy.length ? cy[cy.length - 1].sourcePeriodLabel.replace("CY ", "") + "–" + cy[0].sourcePeriodLabel.replace("CY ", "") : "—",
        label: "Years covered" },
      { value: driveEvents.length, label: "Event filings", onClick: () => setMode("events") },
      { value: registers.length, label: "Statutory registers", onClick: () => setMode("registers") },
      { value: docTotal, label: "Documents", onClick: () => setMode("documents") },
      { value: upcomingCount || "—", label: "Upcoming obligations",
        tone: upcomingOverdue ? "red" : "", onClick: upcomingCount ? () => setMode("upcoming") : null },
    ]} />

    <${RegisterTabs} tabs=${etabs} active=${mode} onChange=${setMode} ariaLabel=${e.name + " filing history"} />

    ${e.typeConflict && html`<div class="tiny" style="color:var(--warning-text)">
      Sources disagree about this entity's legal form
      (${e.typeConflict.map((c) => c.label + ": " + c.spellings.join(", ")).join("  |  ")}).
      Its statutory requirements are withheld until the spelling is settled in the source data.</div>`}

    ${src && html`<${Section} title="Source" icon="folder" sub="Where this company sits in the Drive estate.">
      <${FieldGrid} rows=${[
        ["Source group", src.groupFolderName],
        ["Source folder", src.entityFolderName],
        ["Drive path", src.rootFolderName + " / " + src.groupFolderName + " / " + src.entityFolderName],
      ]} />
    </${Section}>`}

    ${mode === "year" ? html`<div class="col" style="gap:14px">
      <${Section} title=${"Compliance years (" + shownCy.length + (shownCy.length !== cy.length ? " of " + cy.length : "") + ")"} icon="calendar"
        sub="Exactly the year folders Drive holds for this company — no year invented, none dropped."
        actions=${cyYears.length > 1 && html`<div class="row" style="gap:8px">
          <${CyRange} years=${cyYears} from=${range.from} to=${range.to} idPrefix="secp-ent"
            onFrom=${(v) => setRange({ from: v, to: range.to })}
            onTo=${(v) => setRange({ from: range.from, to: v })} />
        </div>`}>
        ${shownCy.length === 0
          ? html`<${Empty} icon="calendar" title="No compliance year folder in Drive"
              text="The SECP source root holds no CY folder for this company. That is not the same as having filed nothing." />`
          : html`<div class="tablewrap"><table class="table">
              <thead><tr><th>Year</th><th>Financial statements</th><th>AGM</th><th>Forms on file</th>
                <th>Filing</th><th>Acknowledgement</th><th style="text-align:right">Documents</th></tr></thead>
              <tbody>
                ${shownCy.map((y) => html`<tr key=${y.id} class="rowlink" tabIndex=${0} role="link"
                  aria-label=${"Open " + y.sourcePeriodLabel}
                  onClick=${() => navigate("/compliance/sec-filings/year/" + encodeURIComponent(y.id))}
                  onKeyDown=${(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); navigate("/compliance/sec-filings/year/" + encodeURIComponent(y.id)); } }}>
                  ${/* EVERY CELL IS A DOOR TO ITS OWN EVIDENCE.
                        "A, 9, 19" was plain text and the document count was a
                        dead number, so a reader could see that a form existed
                        but had no way to reach it. Each cell now opens the year
                        on the tab holding the documents behind that cell.
                        stopPropagation keeps the row's own click intact. */ ""}
                  <td><${Pill} tone="gray" title=${"Source folder: " + y.sourceFolder}>${y.sourcePeriodLabel}</${Pill}></td>
                  <td><${YearCell} y=${y} tab="accounts" has=${y.financialStatements.documents.length}>
                    <${StatePill} v=${y.financialStatements.status} /></${YearCell}></td>
                  <td>${y.agm.applicable
                    ? html`<${YearCell} y=${y} tab="agm" has=${(y.agm.documents || []).length}>
                        <${StatePill} v=${y.agm.status} /></${YearCell}>`
                    : html`<${Pill} tone="gray" title=${y.agm.reason || "not applicable"}>Not applicable</${Pill}>`}</td>
                  <td>${(() => {
    const on = y.forms.filter((f) => f.documentStatus === "AVAILABLE");
    if (!on.length) return html`<span class="tiny muted">—</span>`;
    return html`<div class="row" style="gap:4px;flex-wrap:wrap">${on.map((f) => html`
                      <button key=${f.form} type="button" class="linkish tiny" data-open="forms"
                        title=${"Open the " + ((f.documents || []).length) + " document(s) on file for " + f.form}
                        onClick=${(ev) => { ev.stopPropagation(); openYearTab(y, "forms"); }}>
                        ${f.form.replace(/^Form /, "")}</button>`)}</div>`;
  })()}</td>
                  <td><${YearCell} y=${y} tab="evidence" has=${y.filingStatus === "EVIDENCE_OF_SUBMISSION"}>
                    <${StatePill} v=${y.filingStatus} /></${YearCell}></td>
                  <td><${YearCell} y=${y} tab="evidence" has=${y.acknowledgementStatus === "RECEIVED"}>
                    <${StatePill} v=${y.acknowledgementStatus} /></${YearCell}></td>
                  <td style="text-align:right">${y.documentCount
    ? html`<button type="button" class="linkish tiny strong" data-open="documents"
        title=${"Open all " + y.documentCount + " documents in " + y.sourcePeriodLabel}
        onClick=${(ev) => { ev.stopPropagation(); openYearTab(y, "documents"); }}>${y.documentCount}</button>`
    : html`<span class="tiny muted">—</span>`}</td>
                </tr>`)}
              </tbody>
            </table></div>`}
      </${Section}>

    </div>` : null}

    ${mode === "registers" ? html`<div class="col" style="gap:14px">
      <${Section} title=${"Statutory registers (" + registers.length + ")"} icon="book"
        sub="Entity-level corporate records — never counted as filings.">
        ${registers.length === 0
          ? html`<div class="tiny muted">Drive holds no entity-level statutory register folder for this company.</div>`
          : html`<div class="col" style="gap:0">${registers.map((r) => html`<div key=${r.id} class="feed__item" style="align-items:center">
              <div style="flex:1;min-width:0"><div class="tiny strong">${r.register}</div>
                <div class="tiny muted">${String(r.category || "").replace(/_/g, " ").toLowerCase()}</div></div>
              <${Pill} tone="gray">${r.documentCount} document${r.documentCount === 1 ? "" : "s"}</${Pill}>
            </div>`)}</div>`}
      </${Section}>

    </div>` : null}

    ${mode === "events" ? html`<div class="col" style="gap:14px">
      <${Section} title=${"Event-based filings (" + driveEvents.length + ")"} icon="zap"
        sub="Triggered by a corporate event — shares allotted, officers changed, meetings convened.">
        ${driveEvents.length === 0
          ? html`<div class="tiny muted">No event-triggered filing is evidenced in this company's folders.</div>`
          : html`<div class="tablewrap"><table class="table">
              <thead><tr><th>Form / event</th><th>Date</th><th>Year</th><th>Filing</th><th style="text-align:right">Documents</th></tr></thead>
              <tbody>${driveEvents.slice(0, 40).map((v) => html`<tr key=${v.id}>
                <td><span class="tiny">${v.form || eventLabel(v.eventType)}</span></td>
                <td><span class="tiny">${v.eventDate ? fmt.date(v.eventDate) : html`<span class="muted">Undated</span>`}</span></td>
                <td><span class="tiny muted">${v.sourcePeriodLabel || "—"}</span></td>
                <td><${StatePill} v=${v.filingStatus} /></td>
                <td style="text-align:right"><span class="tiny">${v.documentCount}</span></td>
              </tr>`)}</tbody>
            </table></div>
            ${driveEvents.length > 40 ? html`<div class="tiny muted" style="padding-top:6px">
              Showing 40 of ${driveEvents.length}. The full list is in the event register.</div>` : null}`}
      </${Section}>

    </div>` : null}

    ${mode === "upcoming" ? html`<div class="col" style="gap:14px">
      ${upcoming.length === 0
        ? html`<${Empty} icon="clock" title="Nothing outstanding"
            text="The configured statutory rules raise no outstanding requirement for this company." />`
        : html`<${Section} title="Upcoming obligations" icon="clock"
        sub="System-generated from the configured statutory rules — not a Drive record.">
        ${upcoming.map((u) => html`<div key=${u.id} class="col" style="gap:6px">
          <div class="tiny muted">${u.sourcePeriodLabel} · year end ${fmt.date(u.yearEnd)}
            ${u.sourceBacked ? " · this year already has a folder in Drive" : " · no folder in Drive yet"}</div>
          <div class="col" style="gap:0">${u.requirements.map((i) => html`<div key=${i.requirement} class="feed__item" style="align-items:center">
            <div style="flex:1;min-width:0"><div class="tiny strong">${i.requirement}</div>
              <div class="tiny muted">due ${i.statutoryDueDate ? fmt.date(i.statutoryDueDate) : "—"} · ${i.basis}</div></div>
            <${StatePill} v=${i.documentStatus} />
          </div>`)}</div>
        </div>`)}
      </${Section}>`}
    </div>` : null}

    ${mode === "documents" ? html`<${SecpEntityDocuments} cy=${cy} events=${driveEvents} registers=${registers} total=${docTotal} />` : null}

    ${mode === "chrono" ? html`<${Section} title="Chronological SECP history" icon="activity"
      sub="Annual and event-based filings and Drive evidence in one chronology.">
      <${UnifiedTimeline} items=${(data.timeline || []).map((t) => ({ ...t, date: t.at }))}
        onOpenRecord=${onOpenRecord}
        onOpenDoc=${(f) => f && f.webViewLink && window.open(f.webViewLink, "_blank", "noopener")} />
    </${Section}>` : null}

    ${(mode === "year" || mode === "chrono") && (data.events || []).length > 0 && html`<${Section} title=${"Filings recorded in LegalOS (" + data.events.length + ")"} icon="edit"
      sub="Raised in LegalOS. Drive history and LegalOS filings form one statutory history.">
      <div class="col" style="gap:0">
        ${data.events.map((r) => html`<button key=${r.id} type="button" class="feed__item clickable"
          style="text-align:left;width:100%" onClick=${() => onOpenRecord(r.id)}>
          <div class="row" style="gap:10px;align-items:center;width:100%">
            <span class="cell-mono tiny" style="width:104px;flex:none">${r.id}</span>
            <div style="flex:1;min-width:0"><div class="tiny strong">${r.fields.form ? "Form " + r.fields.form : "Filing"}
              ${r.fields.event ? " · " + r.fields.event : ""}</div>
              <div class="tiny muted">${r.fields.financialYear || ""}</div></div>
            <${Status} value=${r.fields.filingStatus || "Identified / due"} />
          </div></button>`)}
      </div>
    </${Section}>`}
  </div>`;
}


/* THE COMPANY'S DOCUMENTS, SPLIT BY WHAT THEY ARE.
   3,367 statutory files sit under this estate, and a single flat list of one
   company's 83 is not something anyone reads. Drive already categorises them --
   the folder a file sits in IS its category -- so the split is the source's,
   not an invention. Documents open in the app, never as a Drive redirect: a
   Legal user reading a register should not have to leave the tool and
   authenticate against Drive to see the page they are already entitled to. */
function SecpEntityDocuments({ cy, events, registers, total }) {
  const [viewer, setViewer] = useState(null);
  const [open, setOpen] = useState({});
  const [term, setTerm] = useState("");

  const groups = useMemo(() => {
    /* ONE FILE IS ONE FILE.
       An event filing's documents are the SAME Drive files as the compliance
       year folder they sit in -- Form 29 appears under CY 2026 and under the
       officer-change event it evidences. Summing the three populations counted
       this company at 106 documents where the register says 83, and two
       screens in the same tool must not disagree about one number. The file is
       listed once, carrying every population it belongs to. */
    const seen = new Map();
    const byCat = new Map();
    const push = (d, origin) => {
      const prev = seen.get(d.id);
      if (prev) { if (!prev.origins.includes(origin)) prev.origins.push(origin); return; }
      const cat = d.category || "UNCATEGORISED";
      const rec = { ...d, origins: [origin] };
      seen.set(d.id, rec);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(rec);
    };
    for (const y of cy) for (const d of (y.documents || [])) push(d, y.sourcePeriodLabel);
    for (const v of events) for (const d of (v.documents || [])) push(d, v.form || v.sourcePeriodLabel || "Event");
    for (const r of registers) for (const d of (r.documents || [])) push(d, r.register);
    const t = term.trim().toLowerCase();
    return [...byCat.entries()]
      .map(([cat, files]) => ({
        cat,
        /* Sentence case, except the acronyms — "Agm" and "Eogm" are not words,
           and a register labelled that reads like a typo to the lawyer using it. */
        label: cat.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())
          .replace(/\b(agm|eogm|secp|ctc|soi|smc|ntn|cnic)\b/gi, (w) => w.toUpperCase()),
        files: files
          .filter((d) => !t || d.name.toLowerCase().includes(t))
          /* Newest first: the current year's filing is what someone opening
             this tab is nearly always looking for. */
          .sort((a, b) => String(b.documentDate || b.modifiedTime || "").localeCompare(String(a.documentDate || a.modifiedTime || ""))),
        all: files.length,
      }))
      .filter((g) => g.files.length > 0)
      .sort((a, b) => b.files.length - a.files.length);
  }, [cy, events, registers, term]);

  const shown = groups.reduce((n, g) => n + g.files.length, 0);
  const flat = groups.flatMap((g) => g.files);

  if (total === 0) return html`<${Empty} icon="file" title="No statutory documents"
    text="Drive holds no document under this company's statutory folders." />`;

  return html`<div class="col" style="gap:12px">
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <${Input} value=${term} placeholder="Search this company's documents…"
          aria-label="Search documents" onChange=${setTerm} /></div>
      <div class="tiny muted">${shown} of ${total} document${total === 1 ? "" : "s"} in ${groups.length} categor${groups.length === 1 ? "y" : "ies"}</div>
    </div>

    ${groups.length === 0
      ? html`<${Empty} icon="file" title="No document matches" text="Nothing in this company's folders matches that." />`
      : groups.map((g) => {
        /* Open by default. A documents tab whose default state shows no
           documents is a tab that looks broken. */
        const isOpen = open[g.cat] !== false;
        return html`<${Section} key=${g.cat} title=${g.label + " (" + g.files.length + ")"} icon="folder"
          actions=${html`<button type="button" class="fltbtn"
            onClick=${() => setOpen({ ...open, [g.cat]: !isOpen })}>${isOpen ? "Hide" : "Show"}</button>`}>
          ${isOpen && html`<div class="col" style="gap:0">
            ${g.files.map((d) => html`<button key=${d.id} type="button" class="feed__item clickable"
              style="text-align:left;width:100%"
              onClick=${() => setViewer(flat.findIndex((x) => x.id === d.id))}>
              <div class="row" style="gap:10px;align-items:center;width:100%">
                <div class="notif__ico" style="width:28px;height:28px;background:var(--brand-soft);color:var(--brand)">
                  <${Icon} name="file" size=13 /></div>
                <div style="flex:1;min-width:0">
                  <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
                  <div class="tiny muted">${d.origins.join(" · ")}${d.form ? " · " + d.form : ""}
                    ${d.modifiedTime ? " · " + fmt.date(d.modifiedTime) : ""}</div></div>
                ${d.submissionEvidence && html`<${Pill} tone="green"
                  title="Evidence the filing was submitted — an acknowledgement, not merely a prepared form">Evidence</${Pill}>`}
                <${Icon} name="chevronRight" size=14 />
              </div></button>`)}
          </div>`}
        </${Section}>`;
      })}

    ${viewer != null && viewer >= 0 && flat[viewer] && html`<${DocViewerModal} c=${null}
      files=${flat} index=${viewer} onIndex=${setViewer} onClose=${() => setViewer(null)} />`}
  </div>`;
}

/* ============================================================== NEW FILING */

export function NewFilingModal({ seed, config, onClose, onDone }) {
  const scfg = (config && config.secp) || {};
  const years = (scfg.financialYears && scfg.financialYears.years) || [];
  const [entityKey, setEntityKey] = useState(seed.entityKey || "");
  const [entities, setEntities] = useState([]);
  const [f, setF] = useState({
    filingCategory: "annual",
    financialYear: seed.financialYear || (scfg.financialYears && scfg.financialYears.current) || "",
    form: "",
    event: "",
    eventDate: "",
    statutoryDueDate: "",
    filingDate: "",
    filingStatus: (scfg.filingStatuses && scfg.filingStatuses[0]) || "Identified / due",
    overdueReason: "",
    authorizedFiler: "",
    ctcApplied: "",
    acknowledgementRef: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  useEffect(() => { api.compliance.entities().then((r) => setEntities(r.entities || []), () => {}); }, []);
  const ent = entities.find((e) => e.key === entityKey) || (seed.entity ? { key: seed.entityKey, name: seed.entity } : null);

  const formOptions = (scfg.forms || [])
    .filter((x) => f.filingCategory === "annual" ? (x.category === "annual" || x.code === "OTHER") : (x.category === "event" || x.code === "OTHER"))
    .map((x) => ({ value: x.code, label: x.label }));

  const isOverdue = f.statutoryDueDate && f.statutoryDueDate < today() && !/^(filed|acknowledged)/i.test(f.filingStatus);

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.secp.createFiling({
        ...f, entityKey, entity: ent ? ent.name : null,
      });
      toast("Filing " + r.record.id + " created.", "success");
      onDone(r.record);
    } catch (e) { toast(e.message || "The filing could not be created.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="New SECP filing" icon="plus" width=${700} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check"
        disabled=${busy || !entityKey || !f.financialYear || (isOverdue && !f.overdueReason)}
        onClick=${go}>Create filing</${Btn}>`}>
    <div class="col" style="gap:12px">
      <div class="tiny muted">This creates a <strong>filing record</strong>, not a legal request.
        SECP filings are initiated by Legal under statute, so they do not enter the request queue.</div>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Entity">
          <${Select} value=${entityKey} onChange=${setEntityKey} placeholder="— Select an entity —"
            options=${entities.map((e) => ({ value: e.key, label: e.name }))} /></${Field}>
        <${Field} label="Financial year">
          <${Select} value=${f.financialYear} onChange=${(v) => setF({ ...f, financialYear: v })} options=${years} /></${Field}>
        <${Field} label="Filing type">
          <${Select} value=${f.filingCategory} onChange=${(v) => setF({ ...f, filingCategory: v, form: "" })}
            options=${[
              { value: "annual", label: "Annual (periodic)" },
              { value: "event", label: "Event-based" },
              { value: "period", label: "Annual period record (financial statements / AGM)" },
            ]} /></${Field}>
        ${f.filingCategory !== "period" && html`<${Field} label="SECP form">
          <${Select} value=${f.form} onChange=${(v) => setF({ ...f, form: v })} placeholder="— Select a form —"
            options=${formOptions} /></${Field}>`}
      </div>

      ${f.filingCategory === "event" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Event / trigger"><${Input} value=${f.event} onInput=${set("event")}
          placeholder="Allotment of shares, change of directors…" /></${Field}>
        <${Field} label="Event date"><${Input} type="date" value=${f.eventDate} onInput=${set("eventDate")} /></${Field}>
      </div>`}

      ${f.filingCategory === "period" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Audited financial statements received">
          <${Input} type="date" value=${f.financialStatementsDate || ""} onInput=${set("financialStatementsDate")} /></${Field}>
        <${Field} label="AGM date" hint="Leave blank for a Single Member Company — no AGM is required.">
          <${Input} type="date" value=${f.agmDate || ""} onInput=${set("agmDate")} /></${Field}>
      </div>`}

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Statutory due date"><${Input} type="date" value=${f.statutoryDueDate} onInput=${set("statutoryDueDate")} /></${Field}>
        <${Field} label="Filing date"><${Input} type="date" value=${f.filingDate} onInput=${set("filingDate")} /></${Field}>
        <${Field} label="Status">
          <${Select} value=${f.filingStatus} onChange=${(v) => setF({ ...f, filingStatus: v })}
            options=${scfg.filingStatuses || []} /></${Field}>
        <${Field} label="Authorised person to file"><${Input} value=${f.authorizedFiler} onInput=${set("authorizedFiler")} /></${Field}>
        <${Field} label="Acknowledgement reference"><${Input} value=${f.acknowledgementRef} onInput=${set("acknowledgementRef")} /></${Field}>
        <${Field} label="CTC applied">
          <${Select} value=${f.ctcApplied} onChange=${(v) => setF({ ...f, ctcApplied: v })} placeholder="—"
            options=${["Yes", "No"]} /></${Field}>
      </div>

      ${isOverdue && html`<${Field} label="Reason for overdue"
        hint="This filing is past its statutory due date. Record why — LegalOS will not pick a reason for you.">
        <${Select} value=${f.overdueReason} onChange=${(v) => setF({ ...f, overdueReason: v })}
          placeholder="— Select a reason —" options=${scfg.overdueReasons || []} />
      </${Field}>`}

      <${Field} label="Notes"><${Textarea} rows=${2} value=${f.notes} onInput=${set("notes")} /></${Field}>
    </div>
  </${Modal}>`;
}

/* A legacy in-page view (?sview=entity&entity=…) that is now a real address.
   Redirecting in an effect, never during a render. */
function Redirect({ to }) {
  useEffect(() => { navigate(to); }, [to]);
  return html`<div class="tiny muted" style="padding:20px 2px">Opening…</div>`;
}

/* ====================================================== ENTITY, AS A PAGE */

/* /compliance/sec-filings/entity/<key>
   The same filing history that used to live inside a query parameter, given its
   own address so it can be linked, refreshed and reached by Back. The body is
   the existing SecpEntityDetail unchanged — this adds the page around it. */
export function SecpEntityPage({ entityKey, config }) {
  const [query, patch] = useQuery();
  const { data } = useSecpEntity(entityKey);
  const [panelRecord, setPanelRecord] = useState(null);
  const [creating, setCreating] = useState(null);
  const caps = (config && config.capabilities) || {};
  const e = data && data.entity;
  usePublishCrumbLeaf(e && e.name);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${e ? e.name : "Entity"}
      sub=${e ? [e.typeLabel, "SECP filing history"].filter(Boolean).join(" · ") : "SECP filing history"}
      actions=${html`<${Btn} variant="ghost" icon="arrowLeft"
        onClick=${() => navigate(registerReturnPath({ path: "/compliance/sec-filings" }, query) + (query.from ? "" : "?sview=entities"))}>SECP filings</${Btn}>`} />
    <${SecpEntityDetail} entityKey=${entityKey} config=${config}
      onBack=${() => navigate(query.from
        ? "/compliance/sec-filings?" + query.from
        : "/compliance/sec-filings?sview=entities")}
      onOpenRecord=${(id) => navigate("/compliance/sec-filings/" + encodeURIComponent(id))}
      onNewFiling=${(seed) => setCreating(seed)} />
    ${creating && html`<${NewFilingModal} seed=${creating} config=${config}
      onClose=${() => setCreating(null)}
      onDone=${(rec) => { setCreating(null); navigate("/compliance/sec-filings/" + encodeURIComponent(rec.id)); }} />`}
    ${panelRecord && html`<${ActionPanel} recordId=${panelRecord} caps=${caps} config=${config}
      onClose=${() => setPanelRecord(null)} onChanged=${() => {}} />`}
  </div>`;
}

/* ================================================== ONE STATUTORY YEAR */

/* /compliance/sec-filings/year/<id>
 *
 * The record this module exists to keep honest. A compliance year is DERIVED
 * from documents in Drive, and the page says that in every place a reader might
 * otherwise assume otherwise: what the evidence proves, which document proves
 * it, and — separately, never merged — what has actually been recorded as filed.
 * The two are different columns, different sections and different words. */
/* ONE STATUTORY YEAR, AS THE SOURCE PROVES IT.
   Built from the Drive-backed compliance record. The tabs follow the order a
   statutory year actually runs -- accounts, meeting, forms, lodgement,
   acknowledgement -- and each stage reports what is ON FILE separately from
   what was FILED. A year with no Form A says "no source document found"; it is
   never dropped from the register for being incomplete. */
export function SecpYearDetail({ yearId, config }) {
  const { data, loading, error } = useSecpYear(yearId);
  const [query, patch] = useQuery();
  const [tab, setTab] = useRecordTab("overview", query, patch);
  const caps = (config && config.capabilities) || {};
  const [creating, setCreating] = useState(null);
  const [openForm, setOpenForm] = useState(null);
  // Above the early returns — see compliance-document.js.
  usePublishCrumbLeaf(data && data.year && (data.year.entity + " " + (data.year.sourcePeriodLabel || data.year.financialYear || "")));

  if (error) return html`<div class="page page--wide fade-in">
    <${PageHead} title="Compliance year" />
    <${Empty} icon="alertTriangle" title="Compliance year not found"
      text=${error.message || "No statutory year has that reference."}
      action=${html`<${Btn} variant="primary" onClick=${() => navigate("/compliance/sec-filings?sview=annual")}>Annual compliance</${Btn}>`} /></div>`;
  if (loading || !data) return html`<div class="page page--wide fade-in">
    <div class="tiny muted" style="padding:20px 2px">Reading the compliance year…</div></div>`;

  const y = data.year || {};
  const docs = y.documents || [];
  const forms = y.forms || [];
  const events = y.eventFilings || [];
  const recorded = y.recorded || [];
  const period = y.sourcePeriodLabel || y.financialYear || "—";
  const stage = (n) => docs.filter((d) => d.stage === n);
  const fsDocs = (y.financialStatements && y.financialStatements.documents) || [];
  const agmDocs = (y.agm && y.agm.documents) || [];
  const evidence = stage("SUBMISSION_EVIDENCE").concat(stage("ACKNOWLEDGEMENT"));

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "accounts", label: "Financial statements", count: fsDocs.length },
    { id: "agm", label: "AGM", count: y.agm && y.agm.applicable ? agmDocs.length : null },
    { id: "forms", label: "Forms", count: forms.length },
    { id: "evidence", label: "Filing evidence", count: evidence.length },
    { id: "documents", label: "Documents", count: docs.length },
    { id: "timeline", label: "Timeline" },
  ];

  const DocList = ({ list, empty }) => (list.length
    ? html`<${LegalDocuments} files=${list} recordType="resolution" />`
    : html`<${Empty} icon="paperclip" title=${empty} text="Nothing in the source folder maps to this stage." />`);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${y.entity + " — " + period}
      sub=${[y.entityType === "SMC" ? "SMC" : y.entityType === "PRIVATE_LIMITED" ? "Private Limited" : y.entityType,
        y.group === "group" ? "Group entity" : "Non-group entity",
        y.periodType ? y.periodType + " " + y.complianceYear : null].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate("/compliance/sec-filings?sview=annual")}>Annual compliance</${Btn}>
        <${Btn} variant="ghost" icon="building"
          onClick=${() => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(y.entityKey))}>${y.entity}</${Btn}>
        ${caps["compliance.filing.create"] && html`<${Btn} variant="primary" size="sm" icon="plus"
          onClick=${() => setCreating({ entityKey: y.entityKey, entity: y.entity, financialYear: String(y.complianceYear || "") })}>Record a filing</${Btn}>`}` } />

    ${/* NO STATUS WITHOUT ACCESSIBLE EVIDENCE.
          Every figure here was flat text. "Submission evidenced" asserted that
          a receipt exists without offering any way to see it, and "49" counted
          documents nobody could open from the number. Each one now opens the
          tab holding the actual documents behind it -- and where there is no
          evidence there is nothing to open, which is itself the honest state. */ ""}
    <${StatStrip} stats=${[
      { value: period, label: "Compliance year" },
      { value: STATE_WORD[y.financialStatements && y.financialStatements.status] || "—", label: "Financial statements",
        onClick: fsDocs.length ? () => setTab("accounts") : null },
      { value: y.agm && !y.agm.applicable ? "Not applicable" : (STATE_WORD[y.agm && y.agm.status] || "—"), label: "AGM",
        onClick: agmDocs.length ? () => setTab("agm") : null },
      { value: forms.filter((f) => f.documentStatus === "AVAILABLE").length + " / " + forms.length, label: "Annual forms on file",
        onClick: forms.length ? () => setTab("forms") : null },
      { value: STATE_WORD[y.filingStatus] || "—", label: "Filing", tone: y.filingStatus === "EVIDENCE_OF_SUBMISSION" ? "" : "amber",
        onClick: evidence.length ? () => setTab("evidence") : null },
      { value: docs.length, label: "Documents", onClick: docs.length ? () => setTab("documents") : null },
    ]} />

    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Compliance year" />

    ${tab === "overview" && html`<div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <${Section} title="What is on file" icon="folder"
          sub="Read from this company's own statutory folder in Drive.">
          <${FieldGrid} rows=${[
            ["Entity", y.entity],
            ["Legal form", y.entityType === "SMC" ? "Single Member Company" : y.entityType === "PRIVATE_LIMITED" ? "Private Limited" : dash(y.entityType)],
            ["Compliance year", period + (y.periodType ? "  (source wording preserved)" : "")],
            ["Financial statements", STATE_WORD[y.financialStatements && y.financialStatements.status] || "—"],
            ["AGM", y.agm && !y.agm.applicable
              ? "Not applicable — " + (y.agm.reason || "legal form does not require one")
              : (STATE_WORD[y.agm && y.agm.status] || "—")],
            ["Annual forms on file", forms.filter((f) => f.documentStatus === "AVAILABLE").map((f) => f.form).join(", ") || "None"],
            ["Documents", String(docs.length) + (y.physicalFileCount && y.physicalFileCount !== docs.length
              ? "  (" + y.physicalFileCount + " physical copies in Drive)" : "")],
            ["Source completeness", dash(y.dataCompleteness)],
          ]} />
        </${Section}>

        <${Section} title="What was FILED" icon="alertTriangle"
          sub="A different question, deliberately kept apart from the one on the left.">
          <${FieldGrid} rows=${[
            ["Filing status", STATE_WORD[y.filingStatus] || dash(y.filingStatus)],
            ["Acknowledgement", STATE_WORD[y.acknowledgementStatus] || dash(y.acknowledgementStatus)],
            ["Evidence status", dash(y.evidenceStatus)],
            ["Event filings in this year", String(events.length)],
            ["Filings recorded in LegalOS", String(recorded.length)],
          ]} />
          <div class="tiny muted" style="padding-top:8px">
            A form on file proves the company <strong>prepared</strong> it. Only a receipt,
            challan or acknowledgement proves SECP received it.
          </div>
        </${Section}>
      </div>

      <${Section} title="Source" icon="folder" sub="Every record here traces to one folder in Drive.">
        <div class="tiny muted" style="word-break:break-word">${dash(y.sourceFolder)}</div>
      </${Section}>
    </div>`}

    ${tab === "accounts" && html`<${Section} title="Financial statements" icon="fileText"
      sub=${STATE_WORD[y.financialStatements && y.financialStatements.status] || ""}>
      <${DocList} list=${fsDocs} empty="No financial statements found in the source" />
    </${Section}>`}

    ${tab === "agm" && html`<${Section} title="Annual general meeting" icon="users"
      sub=${y.agm && !y.agm.applicable ? (y.agm.reason || "Not applicable to this legal form") : ""}>
      ${y.agm && !y.agm.applicable
        ? html`<${Empty} icon="users" title="No AGM is required"
            text=${"A " + (y.entityType === "SMC" ? "single member company" : "company of this legal form")
              + " holds no annual general meeting, so LegalOS raises no AGM item and never reports one as overdue."} />`
        : html`<${DocList} list=${agmDocs} empty="No AGM document found in the source" />`}
    </${Section}>`}

    ${tab === "forms" && html`<div class="col" style="gap:16px">
      <${Section} title="Annual forms" icon="fileText"
        sub="The forms configured as annual requirements. Each reports availability and filing separately.">
        ${/* A form on file that cannot be opened is a claim, not a record.
              Clicking the row shows the actual document underneath it. */ ""}
        <div class="tablewrap"><table class="table">
          <thead><tr><th>Form</th><th>Document</th><th>Filing</th><th style="text-align:right">Documents</th><th style="width:90px" aria-label="Open"></th></tr></thead>
          <tbody>
            ${forms.map((f) => {
    const n = (f.documents || []).length;
    return html`<tr key=${f.form} class=${n ? "rowlink" : ""} tabIndex=${n ? 0 : -1} role=${n ? "button" : null}
              aria-label=${n ? "Open the " + n + " document(s) on file for " + f.form : null}
              onClick=${n ? () => setOpenForm(f) : null}
              onKeyDown=${n ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpenForm(f); } } : null}>
              <td><span class="cell-strong">${f.form}</span></td>
              <td><${StatePill} v=${f.documentStatus} /></td>
              <td><${StatePill} v=${f.filingStatus} /></td>
              <td style="text-align:right"><span class="tiny">${n || "—"}</span></td>
              <td>${n
      ? html`<span class="tiny" style="color:var(--brand);font-weight:600">Open →</span>`
      : html`<span class="tiny muted">Not on file</span>`}</td>
            </tr>`;
  })}
          </tbody>
        </table></div>
      </${Section}>

      ${openForm && html`<${Section} title=${openForm.form + " — " + ((openForm.documents || []).length)
    + " document" + ((openForm.documents || []).length === 1 ? "" : "s") + " on file"} icon="fileText"
        sub=${"Exactly what the source folder holds for " + openForm.form + " in " + period + "."}
        actions=${html`<button type="button" class="fltbtn" onClick=${() => setOpenForm(null)}>Close</button>`}>
        <${LegalDocuments} files=${openForm.documents || []} recordType="resolution" />
      </${Section}>`}

      ${(y.eventFormsInYear || []).length > 0 && html`<${Section} title="Event-triggered forms in this folder" icon="zap"
        sub="Filed in this year, but triggered by a corporate event — recorded in the event register, not as annual requirements.">
        <div class="tiny muted">${y.eventFormsInYear.map((f) => f.form + " (" + f.documentCount + ")").join(" · ")}</div>
      </${Section}>`}

      ${events.length > 0 && html`<${Section} title=${"Event filings in " + period} icon="zap">
        <div class="tablewrap"><table class="table">
          <thead><tr><th>Form / event</th><th>Date</th><th>Filing</th><th style="text-align:right">Documents</th></tr></thead>
          <tbody>
            ${events.map((e) => html`<tr key=${e.id}>
              <td><span class="tiny">${e.form || eventLabel(e.eventType)}</span></td>
              <td><span class="tiny">${e.eventDate ? fmt.date(e.eventDate) : html`<span class="muted">Undated</span>`}</span></td>
              <td><${StatePill} v=${e.filingStatus} /></td>
              <td style="text-align:right"><span class="tiny">${e.documentCount}</span></td>
            </tr>`)}
          </tbody>
        </table></div>
      </${Section}>`}
    </div>`}

    ${tab === "evidence" && html`<div class="col" style="gap:16px">
      <${Section} title="Filing evidence" icon="check"
        sub="Receipts, challans and acknowledgements — the only things that prove a lodgement.">
        <${DocList} list=${evidence} empty="No submission evidence found in the source" />
      </${Section}>
      ${recorded.length > 0 && html`<${Section} title="Filings recorded in LegalOS" icon="edit"
        sub="Raised in LegalOS. Drive history and LegalOS filings form one statutory history.">
        <div class="col" style="gap:6px">
          ${recorded.map((r) => html`<button key=${r.id} type="button" class="alertrow"
            onClick=${() => navigate("/compliance/sec-filings/" + encodeURIComponent(r.id))}>
            <div class="row" style="gap:10px;width:100%;align-items:center">
              <div style="flex:1;text-align:left"><div class="cell-strong">${r.title || r.id}</div>
                <div class="tiny muted">${r.fields && r.fields.financialYear || ""}</div></div>
              <${Status} value=${(r.fields && r.fields.filingStatus) || "Identified / due"} />
              <${Icon} name="chevronRight" size=14 />
            </div></button>`)}
        </div>
      </${Section}>`}
    </div>`}

    ${tab === "documents" && html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip"
      sub="Every Drive file mapped to this compliance year, in the order the year runs.">
      ${docs.length === 0
        ? html`<${Empty} icon="paperclip" title="No documents" text="No Drive document is attached to this year." />`
        : html`<${LegalDocuments} files=${docs} recordType="resolution" />`}
    </${Section}>`}

    ${tab === "timeline" && html`<${Section} title="Timeline" icon="clock"
      sub="Built only from dates the documents themselves state. Drive's upload time is never used.">
      ${(() => {
        const ev2 = docs.filter((d) => d.documentDate)
          .map((d) => ({ date: d.documentDate, stage: d.stage, name: d.name }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const undated = docs.length - ev2.length;
        return ev2.length === 0
          ? html`<${Empty} icon="clock" title="No dated evidence"
              text="No document in this year states a date, so no chronology can be shown without inventing one." />`
          : html`<div class="col" style="gap:8px">
              ${ev2.map((e, i) => html`<div key=${i} class="row" style="gap:10px;align-items:baseline">
                <span class="tiny muted" style="width:92px;flex:none">${fmt.date(e.date)}</span>
                <${Pill} tone="gray">${String(e.stage || "").replace(/_/g, " ").toLowerCase()}</${Pill}>
                <span class="tiny">${e.name}</span></div>`)}
              ${undated > 0 && html`<div class="tiny muted" style="padding-top:8px">
                ${undated} further document${undated === 1 ? "" : "s"} in this year state${undated === 1 ? "s" : ""} no date
                and ${undated === 1 ? "is" : "are"} not placed in the chronology.</div>`}
            </div>`;
      })()}
    </${Section}>`}

    ${creating && html`<${NewFilingModal} seed=${creating} config=${config}
      onClose=${() => setCreating(null)}
      onDone=${(rec) => { setCreating(null); navigate("/compliance/sec-filings/" + encodeURIComponent(rec.id)); }} />`}
  </div>`;
}

/* ================================================== ONE RECORDED FILING */

/* /compliance/sec-filings/<id> — a filing Legal actually recorded. */
export function SecpFilingDetail({ id, config }) {
  const [query, patch] = useQuery();
  const [tab, setTab] = useRecordTab("overview", query, patch);
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState(null);
  const [panel, setPanel] = useState(false);
  const caps = (config && config.capabilities) || {};
  const scfg = (config && config.secp) || {};

  // /records/<id> serves any workflow record, so a loan amendment's id pasted
  // under /sec-filings/ would otherwise render here as if it were a filing.
  const load = () => api.compliance.record(id).then(
    (r) => (r.record && r.record.type === "secpFiling"
      ? setRec(r.record)
      : setErr(new Error("That record is not an SECP filing."))),
    (e) => setErr(e));
  useEffect(() => { setRec(null); setErr(null); load(); }, [id]);

  if (err) return html`<div class="page page--wide fade-in">
    <${PageHead} title="SECP filing" />
    <${Empty} icon="alertTriangle" title="Filing not found"
      text=${err.message || "No SECP filing has that reference."}
      action=${html`<${Btn} variant="primary"
        onClick=${() => navigate(registerReturnPath({ path: "/compliance/sec-filings" }, query))}>SECP filings</${Btn}>`} /></div>`;
  if (!rec) return html`<div class="page page--wide fade-in">
    <div class="tiny muted" style="padding:20px 2px">Reading the filing…</div></div>`;

  const f = rec.fields || {};
  const docs = rec.documents || [];
  const audit = rec.audit || [];
  const overdue = f.statutoryDueDate && f.statutoryDueDate < today() && !/^(filed|acknowledged)/i.test(f.filingStatus || "");

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Documents", count: docs.length },
    { id: "history", label: "History", count: audit.length },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${(f.form ? "Form " + f.form : "SECP filing") + " — " + (rec.entity || "")}
      sub=${[f.financialYear, f.filingCategory === "event" ? "Event-based" : "Annual", f.filingStatus].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate(registerReturnPath({ path: "/compliance/sec-filings" }, query))}>SECP filings</${Btn}>
        ${rec.entityKey && html`<${Btn} variant="ghost" icon="building"
          onClick=${() => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(rec.entityKey))}>${rec.entity}</${Btn}>`}
        ${scfg.portal && scfg.portal.configured && caps["compliance.portal.open"] && html`
          <a class="btn btn--ghost" href=${scfg.portal.url} target="_blank" rel="noopener noreferrer">
            <${Icon} name="externalLink" size=16 /> eZfile</a>`}
        <${Btn} variant="primary" icon="settings" onClick=${() => setPanel(true)}>Workflow</${Btn}>` } />

    <${StatStrip} stats=${[
      { value: rec.id, label: "Filing ID" },
      { value: dash(f.form), label: "Form" },
      { value: f.statutoryDueDate ? fmt.date(f.statutoryDueDate) : "—", label: "Statutory due date",
        tone: overdue ? "red" : "" },
      { value: f.filingDate ? fmt.date(f.filingDate) : "—", label: "Filed on" },
      { value: dash(f.filingStatus), label: "Status" },
    ]} />

    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="SECP filing" />

    ${tab === "overview" && html`<div class="col" style="gap:16px">
      <${WorkflowStepper} record=${rec} />
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <${Section} title="Filing" icon="calendar">
          <${FieldGrid} rows=${[
            ["Filing ID", rec.id],
            ["Entity", dash(rec.entity)],
            ["Financial year", dash(f.financialYear)],
            ["Category", f.filingCategory === "event" ? "Event-based" : "Annual"],
            ["Form", dash(f.form)],
            ["Triggering event", dash(f.event)],
            ["Event date", f.eventDate ? fmt.date(f.eventDate) : "—"],
            ["Statutory due date", f.statutoryDueDate ? fmt.date(f.statutoryDueDate) : "—"],
            ["Filed on", f.filingDate ? fmt.date(f.filingDate) : "—"],
            ["Status", dash(f.filingStatus)],
          ]} />
        </${Section}>
        <${Section} title="Submission" icon="check">
          <${FieldGrid} rows=${[
            ["Authorized filer", dash(f.authorizedFiler)],
            ["CTC applied", dash(f.ctcApplied)],
            ["Acknowledgement reference", dash(f.acknowledgementRef)],
            ["Overdue reason", dash(f.overdueReason)],
            ["Created by", rec.createdBy ? rec.createdBy.name : "—"],
            ["Created", rec.createdAt ? fmt.date(rec.createdAt) : "—"],
            ["Last updated", rec.updatedAt ? fmt.date(rec.updatedAt) : "—"],
          ]} />
          ${overdue && !f.overdueReason && html`<div class="tiny" style="color:var(--warning-text);padding-top:8px">
            This filing is past its statutory due date and carries no recorded reason.</div>`}
        </${Section}>
      </div>
      ${f.notes && html`<${Section} title="Notes" icon="message">
        <div class="tiny" style="white-space:pre-wrap;line-height:1.6">${f.notes}</div></${Section}>`}
    </div>`}

    ${tab === "documents" && html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip"
      sub="Everything attached to this filing.">
      ${docs.length === 0
        ? html`<${Empty} icon="paperclip" title="No documents" text="Nothing has been attached to this filing yet." />`
        : html`<div class="col" style="gap:0">${docs.map((d) => html`<div key=${d.id} class="feed__item" style="align-items:center">
            <div class="notif__ico" style="width:30px;height:30px;background:var(--brand-soft);color:var(--brand)">
              <${Icon} name="file" size=14 /></div>
            <div style="flex:1;min-width:0">
              <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.name}</div>
              <div class="tiny muted">${d.kind || "document"} · ${d.uploadedAt ? fmt.date(d.uploadedAt) : ""}</div></div>
            <a class="btn btn--ghost btn--sm" href=${api.compliance.documentUrl(rec.id, d.id)} target="_blank" rel="noopener noreferrer">Open</a>
          </div>`)}</div>`}
    </${Section}>`}

    ${tab === "history" && html`<${Section} title="History" icon="activity"
      sub="Every step taken on this filing, from the append-only audit trail.">
      ${audit.length === 0
        ? html`<div class="tiny muted">Nothing has happened to this filing since it was created.</div>`
        : html`<div class="col" style="gap:0">${audit.map((a, i) => html`<div key=${a.id || i} class="feed__item">
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <span class="tiny strong" style="flex:1;min-width:0">${(a.actor && a.actor.name) || "—"} · ${a.action}</span>
              <span class="tiny muted">${a.at ? fmt.rel(a.at) : ""}</span>
            </div></div>`)}</div>`}
    </${Section}>`}

    ${panel && html`<${ActionPanel} recordId=${rec.id} caps=${caps} config=${config}
      onClose=${() => setPanel(false)} onChanged=${load} />`}
  </div>`;
}
