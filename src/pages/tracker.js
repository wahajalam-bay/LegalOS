// WORKSTREAM F — the Contract Tracker / Command Centre.
//
// The dense operational grid where legal actually WORKS the portfolio: every
// contract and repository record in one sortable, filterable table with inline
// quick-edit on the operational fields, dashboard cards that link back into a
// filtered view, CSV export, and a route from every row into that record's
// WorkflowSpine — which closes the output → process → input loop.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Risk, Avatar, Metric, Empty, Modal, Field, Input } from "../ui.js";
import { PageHead, DataTable } from "../parts.js";
import { navigate } from "../router.js";
import { useCollection, updateItem } from "../store.js";
import {
  nameOf, USERS, entityName, entityById, OFFICE_LOCATIONS, toUsd, licenseStatus,
  contractTypeMeta, subdivisionOf,
} from "../data.js";
import { FilterBar, useFilters, applyFilters, TatCell, SubdivisionPill } from "../shared.js";
import { rowTat } from "../flow.js";
import { tatAnalysis } from "../tat.js";

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
  ["value", "Value"], ["ppaValue", "PPA Value"], ["landValue", "Land Value"],
  ["start", "Start"], ["expiry", "Expiry"], ["renewalNoticeDays", "Renewal Notice (days)"],
  ["tatStatus", "TAT Status"], ["tatDetail", "TAT Detail"],
  ["physicalRecordRef", "Physical Record"], ["officeLocation", "Office Location"],
  ["driveLink", "Drive Link"], ["stage", "Stage"], ["status", "Status"],
];
function exportCsv(rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const flat = rows.map((r) => ({
    ...r,
    entity: entityName(r.entityId),
    ownerName: nameOf(r.owner),
    category: r.category || "",
    subdivision: subdivisionOf(r),
    start: r.start ? new Date(r.start).toISOString().slice(0, 10) : "",
    expiry: r.expiry ? new Date(r.expiry).toISOString().slice(0, 10) : "",
    tatStatus: r.__tat ? r.__tat.status : "",
    tatDetail: r.__tat ? (r.__tat.status === "Delayed" ? `${r.__tat.overdueBy}d over — blocked at ${r.__tat.blockingStage}` : tatAnalysis(r.__tat)) : "",
  }));
  const csv = [CSV_COLS.map(([, h]) => esc(h)).join(",")]
    .concat(flat.map((r) => CSV_COLS.map(([k]) => esc(r[k])).join(",")))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `legalos-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Tracker() {
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const licenses = useCollection("licenses");
  const { filters, patch, toggle, clear } = useFilters("tracker", { sortBy: "expiry", sortDir: "asc" });

  const ctx = { requests, matters, contracts, repository, licenses };
  const rows = useMemo(() => contracts.map((c) => ({ ...c, __tat: rowTat(c, ctx) })), [contracts, repository]);
  const filtered = applyFilters(rows, filters, {
    searchKeys: ["title", "counterparty", "id", "contractType", "landRef", "physicalRecordRef", "officeLocation"],
  });

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
    <${PageHead} title="Contract Tracker"
      sub="The command centre — the operational grid where the portfolio is actually worked. Every row opens its full flow."
      actions=${html`<${Btn} variant="ghost" icon="scan" onClick=${() => navigate("/repository")}>Add document</${Btn}>
        <${Btn} variant="ghost" icon="cpu" onClick=${() => navigate("/analyzer")}>Analyzer</${Btn}>
        <${Btn} variant="primary" icon="download" onClick=${() => exportCsv(filtered)}>Export CSV</${Btn}>`} />

    <!-- dashboard cards: click to narrow the grid below -->
    <div class="grid grid--kpi" style="margin-bottom:18px">
      <${Metric} icon="file" tone="blue" label="Active contracts" value=${activeCount}
        foot=${`not yet expired · ${filtered.length} rows in scope`}
        onClick=${() => patch({ statuses: ["Active"] })} />
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
            { k: "exp30", n: age.d30.length, cap: "≤30 days", tone: "d30" },
            { k: "exp60", n: age.d60.length, cap: "31–60", tone: "d60" },
            { k: "exp90", n: age.d90.length, cap: "61–90", tone: "d90" },
          ].map((x) => html`<button key=${x.k} class=${"agebkt agebkt--" + x.tone}
            title=${`${x.n} contracts ${x.cap.toLowerCase()}`}
            onClick=${() => patch({ dateField: "expiry", datePreset: x.k })}>
            <span class="agebkt__n">${x.n}</span>
            <span class="agebkt__cap">${x.cap}</span>
          </button>`)}
        </div>
      </div>
      <${Metric} icon="alertTriangle" tone="red" label="Overdue" value=${delayed.length}
        foot=${delayed.length ? `blocked at ${[...new Set(delayed.map((d) => d.__tat.blockingStage))].slice(0, 2).join(", ")}` : "nothing past TAT"}
        onClick=${() => patch({ tatStatuses: ["Delayed"] })} />
    </div>

    <${FilterBar} module="tracker" filters=${filters} onPatch=${patch} onToggle=${toggle} onClear=${clear}
      rows=${rows}
      dims=${["departments", "entities", "contractTypes", "subdivisions", "owners", "statuses", "risks", "tatStatuses"]}
      labels=${{ statuses: "Contract status", dates: "Expiry based aging" }}
      dateFields=${[
        { key: "expiry", label: "Expiry" },
        { key: "start", label: "Execution / start" },
      ]}
      placeholder="Search titles, counterparties, deed refs, physical refs…"
      right=${html`<span class="tiny muted">${filtered.length} of ${rows.length} rows</span>`} />

    <div class="dense">
      <${DataTable} rows=${filtered}
        onRow=${(c) => navigate("/contracts/" + c.id)}
        empty=${html`<${Empty} icon="grid" title="No rows match" text="Clear a filter, or widen the date window." />`}
        columns=${[
          // Sr No is inline-editable because it maps to the physical record.
          { key: "srNo", label: "Sr No", width: "70px", render: (c) => html`<${EditText} value=${c.srNo} type="number" width="58px" onSave=${(v) => save(c.id, { srNo: v, physicalRecordRef: v ? "PR-" + v : c.physicalRecordRef })} />` },
          { key: "entityId", label: "Company / Entity", width: "128px", render: (c) => html`<button class="tagchip" onClick=${(e) => { e.stopPropagation(); navigate("/companies/" + c.entityId); }}><${Icon} name="building" size=11 />${entityName(c.entityId)}</button>` },
          { key: "contractType", label: "Contract Type", width: "132px", render: (c) => html`<button class="cellbtn" title=${"Filter to " + c.contractType} onClick=${(e) => { e.stopPropagation(); toggle("contractTypes", c.contractType); }}><${Pill} tone="indigo">${c.contractType}</${Pill}></button>` },
          { key: "title", label: "Contract / Counterparty", render: (c) => html`<div class="wrapcell">
              <div class="cell-strong">${c.title}</div>
              <div class="tiny muted">${c.id} · ${c.counterparty}</div>
            </div>` },
          { key: "category", label: "Category", width: "132px", render: (c) => html`<button class="cellbtn cellbtn--text" title=${"Filter to " + c.category} onClick=${(e) => { e.stopPropagation(); toggle("categories", c.category); }}><span class="tiny">${c.category}</span></button>` },
          { key: "subdivision", label: "Legal Sub-div", width: "120px", render: (c) => html`<button class="cellbtn" title="Filter to this sub-division" onClick=${(e) => { e.stopPropagation(); c.subdivision && toggle("subdivisions", c.subdivision); }}><${SubdivisionPill} item=${c} /></button>` },
          { key: "owner", label: "Owner", width: "116px", render: (c) => html`<${EditSelect} value=${c.owner}
              options=${USERS.slice(0, 12).map((u) => ({ value: u.id, label: u.name.split(" ")[0] + " " + (u.name.split(" ")[1] || "").slice(0, 1) }))}
              onSave=${(v) => save(c.id, { owner: v })} />` },
          { key: "value", label: "Value", align: "right", width: "104px", render: (c) => html`<button class="cellbtn cellbtn--text" style="width:100%;text-align:right" title="Open this contract" onClick=${(e) => { e.stopPropagation(); navigate("/contracts/" + c.id); }}><span class="strong">${fmt.money(c.value, c.currency)}</span></button>` },
          { key: "ppaValue", label: "PPA Value", align: "right", width: "104px", render: (c) => c.ppaValue ? html`<span class="strong">${fmt.money(c.ppaValue, c.currency)}</span>` : html`<span class="tiny muted">—</span>` },
          { key: "landValue", label: "Land Value", align: "right", width: "104px", render: (c) => c.landValue ? html`<span class="strong">${fmt.money(c.landValue, c.currency)}</span>` : html`<span class="tiny muted">—</span>` },
          { key: "start", label: "Start", width: "88px", render: (c) => html`<${EditText} type="date" width="112px" value=${c.start ? new Date(c.start).toISOString().slice(0, 10) : ""} onSave=${(v) => v && save(c.id, { start: new Date(v + "T00:00:00").toISOString() })} />` },
          { key: "expiry", label: "Expiry", width: "88px", render: (c) => html`<${EditText} type="date" width="112px" value=${c.expiry ? new Date(c.expiry).toISOString().slice(0, 10) : ""} onSave=${(v) => v && save(c.id, { expiry: new Date(v + "T00:00:00").toISOString() })} />` },
          { key: "renewalNoticeDays", label: "Renewal / Notice", width: "96px", render: (c) => { const d = Math.round((new Date(c.expiry) - Date.now()) / 86400000); const noticeIn = d - (c.renewalNoticeDays || 0); return html`<div>
              <div class="tiny strong">${c.renewalNoticeDays || 0}d notice</div>
              <div class=${cx("tiny", noticeIn <= 0 ? "risk--critical" : noticeIn <= 14 ? "risk--high" : "muted")}>${noticeIn <= 0 ? "window closed" : "in " + noticeIn + "d"}</div>
            </div>`; } },
          { key: "tat", label: "TAT Status", width: "166px", render: (c) => html`<${TatCell} tat=${c.__tat} />` },
          { key: "physicalRecordRef", label: "Physical Record", width: "104px", render: (c) => c.physicalRecordRef ? html`<button class="cellbtn cellbtn--text" title="Open Intake & Repository" onClick=${(e) => { e.stopPropagation(); navigate("/repository"); }}><span class="mono tiny">${c.physicalRecordRef}</span></button>` : html`<span class="tiny muted">—</span>` },
          { key: "officeLocation", label: "Office Location", width: "150px", render: (c) => html`<${EditSelect} value=${c.officeLocation}
              options=${OFFICE_LOCATIONS.map((o) => ({ value: o, label: o }))} onSave=${(v) => save(c.id, { officeLocation: v })} />` },
          { key: "driveLink", label: "Drive", width: "60px", render: (c) => c.driveLink
            ? html`<a class="tagchip" href=${c.driveLink} target="_blank" rel="noreferrer" onClick=${(e) => e.stopPropagation()}><${Icon} name="externalLink" size=11 />Open</a>`
            : html`<span class="tiny muted">—</span>` },
          { key: "stage", label: "Stage", width: "104px", render: (c) => html`<${Status} value=${c.stage || c.status} />` },
          { key: "flow", label: "", width: "76px", render: (c) => html`<${Btn} variant="soft" size="sm" icon="workflow" onClick=${(e) => { e.stopPropagation(); navigate("/contracts/" + c.id); }}>Flow</${Btn}>` },
        ]} />
    </div>

    <div class="tiny muted" style="margin-top:12px">
      Sr No, owner, dates and office location are inline-editable and persist immediately.
      Every row opens the record's full flow — input, stages, outputs and relationships.
    </div>
  </div>`;
}
