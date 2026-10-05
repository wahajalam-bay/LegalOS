// WORKSTREAM F — the Contract Tracker / Command Centre.
//
// The dense operational grid where legal actually WORKS the portfolio: every
// contract and repository record in one sortable, filterable table with inline
// quick-edit on the operational fields, dashboard cards that link back into a
// filtered view, CSV export, and a route from every row into that record's
// WorkflowSpine — which closes the output → process → input loop.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Metric, Modal, Field, Input } from "../ui.js";
import { PageHead } from "../parts.js";
import { navigate } from "../router.js";
import { ContractWorkspace } from "./contracts.js";
import { useCollection, updateItem } from "../store.js";
import {
  nameOf, USERS, entityName, entityById, OFFICE_LOCATIONS, toUsd, licenseStatus,
  contractTypeMeta, subdivisionOf, categoryOf,
} from "../data.js";
import { TatCell, SubdivisionPill } from "../shared.js";
import { RegisterShell } from "../register.js";
import { useFilterLink } from "../filters.js";
import { DrillCell, trackerFields, trackerSearchKeys, trackerViews } from "../registerdefs.js";
import { PPA_TITLES, normTitle } from "../ppatitles.js";
import { rowTat } from "../flow.js";
import { tatAnalysis } from "../tat.js";

// Excel formula errors ("#VALUE!", "#REF!", "#N/A", "#DIV/0!"…) are not data —
// they leak in from the source sheet's own broken cells. Blank them on display.
const cleanCell = (v) => { const s = String(v == null ? "" : v).trim(); return (!s || /^#(value|ref|n\/?a|div\/0|name|null|num)\b/i.test(s)) ? "" : s; };

/* ---------------- inline quick-edit cells (persisted) ---------------- */
function EditText({ value, onSave, placeholder, type = "text", width }) {
  const [v, setV] = useState(value == null ? "" : value);
  const [dirty, setDirty] = useState(false);
  const commit = () => {
    if (!dirty) return;
    onSave(type === "number" ? (v === "" ? null : Number(v)) : v);
    setDirty(false);
  };
  return html`<input class="qedit" type=${type} value=${v} placeholder=${placeholder || "—"} style=${width ? `width:${width}` : ""}
    onClick=${(e) => e.stopPropagation()}
    onInput=${(e) => { setV(e.target.value); setDirty(true); }}
    onBlur=${commit}
    onKeyDown=${(e) => { if (e.key === "Enter") { e.target.blur(); } if (e.key === "Escape") { setV(value == null ? "" : value); setDirty(false); e.target.blur(); } }} />`;
}

function EditSelect({ value, options, onSave, render }) {
  return html`<select class="qedit" value=${value == null ? "" : value}
    onClick=${(e) => e.stopPropagation()}
    onChange=${(e) => onSave(e.target.value)}>
    ${options.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
  </select>`;
}

/* ---------------- CSV export (client-side, no deps) ---------------- */
const CSV_COLS = [
  ["srNo", "Sr No"], ["id", "ID"], ["title", "Title"], ["entity", "Company / Entity"],
  ["contractType", "Contract Type"], ["counterparty", "Counterparty"], ["category", "Category"],
  ["subdivision", "Legal Sub-division"], ["ownerName", "Owner"], ["currency", "Currency"],
  ["value", "Value"],
  ["start", "Start"], ["expiry", "Expiry"], ["renewalNoticeDays", "Renewal Notice (days)"],
  ["tatStatus", "TAT Status"], ["tatDetail", "TAT Detail"],
  ["physicalRecordRef", "Physical Record"], ["officeLocation", "Office Location"],
  ["driveLink", "Drive Link"], ["stage", "Stage"], ["status", "Status"],
];

// #/tracker/<contractId> opens the lifecycle IN THE TRACKER. The tracker is the
// current, ongoing work; Contracts is the historic record. Clicking a live row
// should not dump you into the archive.
export default function Tracker({ id }) {
  if (id) return html`<${ContractWorkspace} id=${id} backTo="/tracker" backLabel="Commercial Contract Tracker" />`;
  return html`<${TrackerGrid} />`;
}

function TrackerGrid() {
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const licenses = useCollection("licenses");
  const drill = useFilterLink("trk");

  const ctx = { requests, matters, contracts, repository, licenses };
  // This is the COMMERCIAL contract tracker: it shows only contracts in the
  // Commercial Contracts category (the PPAs, finder's-fee, services, IT/marketing
  // and other commercial agreements) — leases, litigation, compliance and admin
  // records live on their own surfaces and are deliberately excluded here.
  const rows = useMemo(
    () => contracts
      // Commercial category AND actually part of the Zameen Media PPA tracker —
      // rows that come from Other Contracts- Zameen Media (not in the PPA sheet)
      // are excluded here so the tracker mirrors the sheet.
      .filter((c) => categoryOf(c) === "Commercial Contracts" && PPA_TITLES.has(normTitle(c.title)))
      .map((c) => ({ ...c, __tat: rowTat(c, ctx) })),
    [contracts, repository]
  );
  // The register shell owns filtering now. The KPI cards above describe the WHOLE
  // tracker rather than the filtered slice, so a card's number does not change
  // as you filter and then fail to match what clicking it produces.
  const filtered = rows;

  // Dashboard cards — each one narrows the tracker rather than leaving it.
  // "Active" means the contract has not expired — a status of Executed/Signed on
  // a contract whose term ended is not active in any useful sense.
  const activeCount = filtered.filter((c) => c.expiry && new Date(c.expiry) >= new Date()).length;
  const expiring = filtered.filter((c) => { const d = (new Date(c.expiry) - Date.now()) / 86400000; return d >= 0 && d <= 90; });
  const expiringValue = expiring.reduce((s, c) => s + toUsd(c.value, c.currency), 0);
  // Aging by expiry, in one card: the horizon matters more than a single
  // "within 90 days" count, and each bucket is its own drill-down.
  const age = (() => {
    const b = { over: [], d30: [], d60: [], d90: [] };
    filtered.forEach((c) => {
      if (!c.expiry) return;
      const d = (new Date(c.expiry) - Date.now()) / 86400000;
      if (d < 0) b.over.push(c);
      else if (d <= 30) b.d30.push(c);
      else if (d <= 60) b.d60.push(c);
      else if (d <= 90) b.d90.push(c);
    });
    return b;
  })();
  const delayed = filtered.filter((c) => c.__tat.status === "Delayed");
  const byEntity = useMemo(() => {
    const m = new Map();
    filtered.forEach((c) => {
      const k = c.entityId;
      m.set(k, (m.get(k) || 0) + toUsd(c.value, c.currency));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);
  const topEntity = byEntity[0];

  const save = (id, patchObj) => updateItem("contracts", id, patchObj);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Commercial Contract Tracker"
      sub="The command centre — the operational grid where the portfolio is actually worked. Every row opens its full flow."
      actions=${html`<${Btn} variant="ghost" icon="scan" onClick=${() => navigate("/repository")}>Add document</${Btn}>
        <${Btn} variant="ghost" icon="cpu" onClick=${() => navigate("/analyzer")}>Analyzer</${Btn}>
        `} />

    <!-- dashboard cards: click to narrow the grid below -->
    <div class="grid grid--kpi" style="margin-bottom:18px">
      <${Metric} icon="file" tone="blue" label="Active contracts" value=${activeCount}
        foot=${`not yet expired · ${filtered.length} rows in scope`}
        onClick=${() => drill.set("status", ["Active"])} />
      <div class="agetile">
        <div class="agetile__head">
          <span class="agetile__ico"><${Icon} name="clock" size=15 /></span>
          <div style="min-width:0">
            <div class="agetile__label">Contract aging</div>
            <div class="agetile__sub">${fmt.money(expiringValue)} at risk within 90 days</div>
          </div>
        </div>
        <div class="agetile__buckets">
          ${[
            { k: "exp30", bucket: "d30", n: age.d30.length, cap: "≤30 days", tone: "d30" },
            { k: "exp60", bucket: "d90", n: age.d60.length, cap: "31–60", tone: "d60" },
            { k: "exp90", bucket: "d90", n: age.d90.length, cap: "61–90", tone: "d90" },
          ].map((x) => html`<button key=${x.k} class=${"agebkt agebkt--" + x.tone}
            title=${`${x.n} contracts ${x.cap.toLowerCase()}`}
            onClick=${() => drill.set("expiry", [x.bucket])}>
            <span class="agebkt__n">${x.n}</span>
            <span class="agebkt__cap">${x.cap}</span>
          </button>`)}
        </div>
      </div>
      <${Metric} icon="alertTriangle" tone="red" label="Overdue" value=${delayed.length}
        foot=${delayed.length ? `blocked at ${[...new Set(delayed.map((d) => d.__tat.blockingStage))].slice(0, 2).join(", ")}` : "nothing past TAT"}
        onClick=${() => drill.set("status", ["Active"])} />
    </div>

    <${RegisterShell}
      ns="trk" rows=${rows}
      fields=${trackerFields}
      columns=${(f) => [
          // Exactly the PPA tracker's columns, in the tracker's own order:
          // Serial No · Project Name · Start · End · Department · Region ·
          // Agreement Type · Company · Counter Party · Documents · City ·
          // Contract Value (PKR) · Contract Status · Physical Record Number.
          { key: "sr", label: "Serial No.", width: "72px", essential: true, plain: () => "",
            render: (c, i) => html`<span class="mono tiny">${i + 1}</span>` },
          { key: "title", label: "Project Name", width: "230px", essential: true, sortValue: true, plain: (c) => cleanCell(c.title),
            render: (c) => html`<div class="wrapcell"><div class="cell-strong">${cleanCell(c.title) || "(untitled)"}</div></div>` },
          { key: "start", label: "Start Date", width: "104px", sortAs: "date", sortValue: true, plain: (c) => c.start,
            render: (c) => html`<span class="tiny">${c.start ? fmt.date(c.start) : "—"}</span>` },
          { key: "expiry", label: "End Date", width: "104px", sortAs: "date", sortValue: true, plain: (c) => c.expiry,
            render: (c) => html`<span class="tiny">${c.expiry ? fmt.date(c.expiry) : "—"}</span>` },
          { key: "dept", label: "Department", width: "118px", sortValue: true, plain: (c) => cleanCell(c.dept),
            render: (c) => html`<${DrillCell} f=${f} fkey="dept" value=${cleanCell(c.dept)} title="Filter by department"><span class="tiny">${cleanCell(c.dept) || "—"}</span></${DrillCell}>` },
          { key: "region", label: "Region", width: "92px", sortValue: true, plain: (c) => cleanCell(c.region),
            render: (c) => html`<${DrillCell} f=${f} fkey="region" value=${cleanCell(c.region)} title="Filter by region"><span class="tiny">${cleanCell(c.region) || "—"}</span></${DrillCell}>` },
          { key: "contractType", label: "Agreement Type", width: "150px", sortValue: true, plain: (c) => cleanCell(c.contractType),
            render: (c) => html`<${DrillCell} f=${f} fkey="ctype" value=${cleanCell(c.contractType)} title="Filter by agreement type"><span class="tiny">${cleanCell(c.contractType) || "—"}</span></${DrillCell}>` },
          { key: "company", label: "Company", width: "160px", sortValue: true, plain: (c) => cleanCell(c.entityName),
            render: (c) => html`<${DrillCell} f=${f} fkey="entity" value=${cleanCell(c.entityName)} title="Filter by company"><span class="tiny">${cleanCell(c.entityName) || "—"}</span></${DrillCell}>` },
          { key: "counterparty", label: "Counter Party", width: "150px", sortValue: true, plain: (c) => cleanCell(c.counterparty),
            render: (c) => html`<span class="tiny">${cleanCell(c.counterparty) || "—"}</span>` },
          { key: "documents", label: "Documents", width: "116px", align: "center", sortAs: "number", sortValue: true,
            plain: (c) => (c.driveFiles || []).length,
            render: (c) => (c.driveFiles && c.driveFiles.length)
            ? html`<button type="button" class="tagchip" title="Open the linked document(s)" onClick=${(e) => { e.stopPropagation(); navigate("/tracker/" + c.id); }}><${Icon} name="paperclip" size=11 />${c.driveFiles.length} doc${c.driveFiles.length > 1 ? "s" : ""}</button>`
            : html`<span class="tiny muted">—</span>` },
          { key: "city", label: "City", width: "96px", sortValue: true, plain: (c) => cleanCell(c.city),
            render: (c) => html`<${DrillCell} f=${f} fkey="city" value=${cleanCell(c.city)} title="Filter by city"><span class="tiny">${cleanCell(c.city) || "—"}</span></${DrillCell}>` },
          { key: "value", label: "Contract Value (PKR)", align: "right", width: "128px", sortAs: "number", sortValue: true, plain: (c) => c.value || "",
            render: (c) => html`<span class="strong">${fmt.money(c.value, c.currency)}</span>` },
          { key: "status", label: "Contract Status", width: "120px", sortValue: true, plain: (c) => c.status,
            render: (c) => html`<${DrillCell} f=${f} fkey="status" value=${c.status} title="Filter by status"><${Status} value=${c.status} /></${DrillCell}>` },
          { key: "physicalRecord", label: "Physical Record Number", width: "120px", sortValue: true, plain: (c) => cleanCell(c.physicalRecord),
            render: (c) => { const pr = cleanCell(c.physicalRecord); return pr ? html`<span class="mono tiny">${pr}</span>` : html`<span class="tiny muted">—</span>`; } },
      ]}
      views=${trackerViews} searchKeys=${trackerSearchKeys}
      searchPlaceholder="Search titles, counterparties, deed refs, physical refs…"
      noun=${["row", "rows"]}
      onRow=${(c) => navigate("/tracker/" + c.id)}
      exportName="commercial-contract-tracker" emptyIcon="grid"
      ${/* THE ONE REGISTER THAT IS MEANT TO BE WIDER THAN THE SCREEN.
            Every other register in the product shows six to nine columns by
            default and keeps the rest in Columns (§7). This one mirrors the
            source workbook column for column, on purpose — it is how the
            commercial team reconciles against the file they keep — so the
            columns stay, and the Serial No. column is pinned instead, which is
            what makes scrolling across fourteen columns readable at 1366. */ ""}
      pinFirst=${true}
      defaultSort=${{ key: "expiry", dir: "asc" }} />

    <div class="tiny muted" style="margin-top:12px">
      The columns mirror the Zameen Media PPA & contracts tracker exactly — this is the one
      register in LegalOS that deliberately does not narrow itself, because it is read against
      the workbook. The serial column stays pinned while you scroll across it. Every row opens
      the record's full flow — the source document, stages, and relationships.
    </div>
  </div>`;
}
