// WORKSTREAM E — the Smart Data Analyzer.
//
// Reads the contract + repository corpus and turns it into structured
// intelligence:
//   • Active PPA — every live Property Purchase Agreement with counterparty,
//     PPA value, land value, parcel/plot ref, entity, jurisdiction, expiry
//   • Types of Licenses — rollup by type and jurisdiction, with validity
//   • Extraction panel — editable extracted fields for any selected document
//     that write back to the record
//   • Aggregates — total PPA value, total land value, portfolio value by
//     entity / jurisdiction / contract type, expiring-value radar, confidence
//   • Re-run extraction per doc, and a bulk analyzer over the filtered set
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Risk, Avatar, Metric, Empty, Field, Input, Tabs, AICard, Progress } from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { Donut, HBars, Gauge, AreaTrend, BarChart, CHART_COLORS, seriesColor, foldSeries, VIZ_OTHER } from "../charts.js";
import { navigate } from "../router.js";
import { useCollection, updateItem } from "../store.js";
import {
  nameOf, entityName, entityById, licenseStatus, toUsd, FX_TO_USD,
  typeHasPpa, typeHasLand, contractTypeMeta, extractFromOcr, LEGAL_SUBDIVISIONS,
} from "../data.js";
import { TatCell, SubdivisionPill } from "../shared.js";
import { RegisterShell } from "../register.js";
import { analyzerFields, analyzerSearchKeys, analyzerViews } from "../registerdefs.js";
import { rowTat } from "../flow.js";
import { simulateOcr } from "./repository.js";

const TABS = [
  { key: "ppa", label: "Active PPA", icon: "building" },
  { key: "licenses", label: "Types of Licenses", icon: "fileCheck" },
  { key: "extraction", label: "Extraction", icon: "cpu" },
  { key: "aggregates", label: "Aggregates", icon: "barchart" },
];

const isActive = (c) => !/Terminated|Archived|Expired/.test(c.status || "") && new Date(c.expiry) > Date.now();

/* ============================================================
   Active PPA view
   ============================================================ */
function PpaView({ rows, onDrill }) {
  // Everything that carries a first-class PPA value, still live.
  const ppa = rows.filter((c) => typeHasPpa(c.contractType) && c.ppaValue && isActive(c));
  const totalPpa = ppa.reduce((s, c) => s + toUsd(c.ppaValue, c.currency), 0);
  const totalLand = ppa.reduce((s, c) => s + toUsd(c.landValue || 0, c.currency), 0);
  const landShare = totalPpa ? Math.round((totalLand / totalPpa) * 100) : 0;

  const byJur = useMemo(() => {
    const m = new Map();
    ppa.forEach((c) => m.set(c.jur, (m.get(c.jur) || 0) + toUsd(c.ppaValue, c.currency)));
    // Part-to-whole by jurisdiction: fold past the palette rather than cycle.
    return foldSeries([...m.entries()].map(([k, v]) => [k, Math.round(v / 1e6)]));
  }, [rows]);

  return html`<div class="col" style="gap:16px">
    ${/* FIVE ZEROS ARE NOT A READING, AND THE UNIT WAS WRONG.
          With nothing in scope this printed "0 Active PPAs · PKR 0 total PPA
          value · PKR 0 land value · 0% land share" above an empty state that
          then explained there was nothing to show — the figures asserted the
          group holds no property commitments, which is a claim about the
          business, not about the filter. And the two money labels said PKR
          while the figures were run through toUsd, so a reader was given a
          dollar total under a rupee heading. The strip appears when there is
          something to count, and says what unit it is in. */ ""}
    ${ppa.length > 0 && html`<${StatStrip} stats=${[
      { value: ppa.length, label: "Active PPAs" },
      { value: fmt.money(totalPpa, "USD"), label: "Total PPA value (USD equivalent)",
        title: "Converted for comparison only. The agreement's own currency is on each row." },
      { value: fmt.money(totalLand, "USD"), label: "Total land value (USD equivalent)",
        title: "Converted for comparison only. The agreement's own currency is on each row." },
      { value: landShare + "%", label: "Land share of PPA value" },
      { value: new Set(ppa.map((c) => c.entityId)).size, label: "Entities holding PPAs" },
    ]} />`}

    ${ppa.length === 0
      ? html`<${Empty} icon="building" title="No active PPA is in scope"
          text="No live contract in the current filters carries a PPA value. PPA, SPA, Land/Plot Purchase and Off-plan agreements are the types that do — widen the filters, or this corpus holds none." />`
      : html`<div class="grid" style="grid-template-columns:1fr 300px;gap:16px;align-items:start">
        <div class="card">
          <div class="card__head"><div class="card__title">Active Property Purchase Agreements</div><div class="card__sub">PPA value, land value and the parcel each one sits on</div></div>
          <div class="card__body" style="padding:0">
            <div class="dense">
              <${DataTable} onRow=${(c) => navigate("/contracts/" + c.id)} rows=${ppa}
                columns=${[
                  { key: "id", label: "ID", mono: true, width: "88px" },
                  { key: "title", label: "Agreement", render: (c) => html`<div class="wrapcell"><div class="cell-strong">${c.title}</div><div class="tiny muted">${c.contractType} · ${entityName(c.entityId)}</div></div>` },
                  { key: "counterparty", label: "Counterparty", width: "160px", render: (c) => html`<span class="tiny strong">${c.counterparty}</span>` },
                  { key: "jur", label: "Jur.", width: "52px", render: (c) => html`<${Pill} tone="gray">${c.jur}</${Pill}>` },
                  { key: "ppaValue", label: "PPA Value", align: "right", width: "112px", render: (c) => html`<span class="strong">${fmt.moneyFull(c.ppaValue, c.currency)}</span>` },
                  { key: "landValue", label: "Land Value", align: "right", width: "112px", render: (c) => c.landValue ? html`<span class="strong">${fmt.moneyFull(c.landValue, c.currency)}</span>` : html`<span class="tiny muted">—</span>` },
                  { key: "landRef", label: "Parcel / plot ref", render: (c) => html`<span class="tiny mono">${c.landRef || "—"}</span>` },
                  { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` },
                  { key: "expiry", label: "Expiry / completion", width: "108px", render: (c) => html`<span class="tiny strong">${fmt.dateShort(c.expiry)}</span>` },
                ]} />
            </div>
          </div>
        </div>

        <div class="col" style="gap:14px">
          <div class="card card--pad col" style="gap:12px">
            <span class="strong">PPA value by jurisdiction</span>
            <${Donut} data=${byJur} size=${152} thickness=${20} centerValue=${fmt.money(totalPpa)} centerLabel="total PPA"
              onItem=${(d) => onDrill && onDrill("jur", d.label)} />
            <div class="tiny muted">Values shown in USD millions on the legend.</div>
          </div>
          <div class="card card--pad col" style="gap:10px">
            <span class="strong">Land vs. built value</span>
            <${Progress} value=${landShare} tone=${landShare > 60 ? "amber" : "green"} />
            <div class="row" style="font-size:12.5px"><span class="muted">Land component</span><div class="spacer"></div><span class="strong">${fmt.money(totalLand)}</span></div>
            <div class="row" style="font-size:12.5px"><span class="muted">Balance</span><div class="spacer"></div><span class="strong">${fmt.money(totalPpa - totalLand)}</span></div>
          </div>
          <${AICard} title="Concentration">
            ${byJur.length > 0 ? html`The largest PPA exposure sits in <b>${byJur.slice().sort((a, b) => b.value - a.value)[0].label}</b>.
            Land makes up <b>${landShare}%</b> of committed PPA value — the parcel refs above are what a title search would start from.` : "No PPA exposure in scope."}
          </${AICard}>
        </div>
      </div>`}
  </div>`;
}

/* ============================================================
   Types of Licenses rollup
   ============================================================ */
function LicenseView({ licenses }) {
  const withStatus = licenses.map((l) => ({ ...l, __s: licenseStatus(l) }));
  const byType = useMemo(() => {
    const m = new Map();
    withStatus.forEach((l) => {
      if (!m.has(l.type)) m.set(l.type, []);
      m.get(l.type).push(l);
    });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [licenses]);
  const byJur = useMemo(() => {
    const m = new Map();
    withStatus.forEach((l) => m.set(l.jurisdiction, (m.get(l.jurisdiction) || 0) + 1));
    return foldSeries([...m.entries()]);
  }, [licenses]);
  const counts = {
    Valid: withStatus.filter((l) => l.__s.key === "Valid").length,
    Expiring: withStatus.filter((l) => l.__s.key === "Expiring").length,
    Critical: withStatus.filter((l) => l.__s.key === "Critical").length,
    Expired: withStatus.filter((l) => l.__s.key === "Expired").length,
  };

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: licenses.length, label: "Licenses & registrations" },
      { value: byType.length, label: "Distinct license types" },
      { value: byJur.length, label: "Jurisdictions" },
      { value: counts.Expired, label: "Lapsed" },
      { value: counts.Critical + counts.Expiring, label: "Need attention" },
    ]} />

    <div class="grid" style="grid-template-columns:1fr 300px;gap:16px;align-items:start">
      <div class="card">
        <div class="card__head"><div class="card__title">Types of licenses</div><div class="card__sub">Rollup by type, with validity derived from the expiry date</div></div>
        <div class="card__body col" style="gap:8px">
          ${byType.map(([type, items]) => {
            const bad = items.filter((l) => l.__s.key !== "Valid");
            return html`<div key=${type} class="docrow" style="align-items:flex-start">
              <div class="notif__ico" style="width:32px;height:32px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name="fileCheck" size=15 /></div>
              <div style="flex:1;min-width:0">
                <div class="strong tiny">${type}</div>
                <div class="tiny muted">${[...new Set(items.map((l) => l.jurisdiction))].join(" · ")} · ${[...new Set(items.map((l) => l.entity))].slice(0, 3).join(", ")}</div>
                <div class="row wrap" style="gap:5px;margin-top:6px">
                  ${items.map((l) => html`<button key=${l.id} class="tagchip" style=${l.__s.key === "Expired" ? "border-color:var(--danger);color:var(--danger)" : l.__s.key === "Critical" ? "border-color:var(--warning);color:var(--warning)" : ""}
                    onClick=${() => navigate("/licenses")}>${l.licenseNumber} · ${l.__s.label}</button>`)}
                </div>
              </div>
              <div class="col" style="gap:4px;align-items:flex-end;flex:none">
                <span class="drill__n">${items.length}</span>
                ${bad.length > 0 && html`<${Pill} tone="red">${bad.length} at risk</${Pill}>`}
              </div>
            </div>`;
          })}
        </div>
      </div>

      <div class="col" style="gap:14px">
        <div class="card card--pad col" style="gap:12px">
          <span class="strong">By jurisdiction</span>
          <${Donut} data=${byJur} size=${152} thickness=${20} centerValue=${licenses.length} centerLabel="licenses" />
        </div>
        <div class="card card--pad col" style="gap:10px">
          <span class="strong">Validity</span>
          ${[["Valid", counts.Valid, "green"], ["Expiring soon", counts.Expiring, "amber"], ["Critical (≤30d)", counts.Critical, "orange"], ["Lapsed", counts.Expired, "red"]].map(([l, v, tone]) => html`<div key=${l} class="row" style="font-size:12.5px">
            <${Pill} tone=${tone}>${l}</${Pill}><div class="spacer"></div><span class="strong">${v}</span>
          </div>`)}
          <${Btn} variant="soft" size="sm" icon="arrowRight" onClick=${() => navigate("/licenses")}>Open Licenses</${Btn}>
        </div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   Extraction panel — editable fields that write back
   ============================================================ */
function ExtractionView({ rows, repository }) {
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [bulk, setBulk] = useState(null);

  // Anything with extractable content: repository docs first, then contracts.
  const items = [
    ...repository.map((d) => ({ kind: "doc", id: d.id, label: d.name, sub: `${d.kind} · ${entityName(d.entityId)}`, conf: d.ocrConfidence, rec: d })),
    ...rows.map((c) => ({ kind: "contract", id: c.id, label: c.title, sub: `${c.contractType} · ${entityName(c.entityId)}`, conf: c.extractionConfidence, rec: c })),
  ];
  const sel = items.find((i) => i.id === selId) || items[0] || null;
  const fields = draft || (sel ? (sel.rec.extractedFields || {}) : {});
  const setField = (k, v) => setDraft({ ...fields, [k]: v });

  const save = () => {
    if (!sel || !draft) return;
    if (sel.kind === "doc") {
      updateItem("repository", sel.id, { extractedFields: draft });
      if (sel.rec.contractId) {
        const patch = { extractedFields: draft };
        if (draft.totalValue != null) patch.value = Number(draft.totalValue);
        if (draft.ppaValue != null) patch.ppaValue = Number(draft.ppaValue);
        if (draft.landValue != null) patch.landValue = Number(draft.landValue);
        updateItem("contracts", sel.rec.contractId, patch);
      }
    } else {
      const patch = { extractedFields: draft };
      if (draft.totalValue != null) patch.value = Number(draft.totalValue);
      if (draft.ppaValue != null) patch.ppaValue = Number(draft.ppaValue);
      if (draft.landValue != null) patch.landValue = Number(draft.landValue);
      updateItem("contracts", sel.id, patch);
    }
    setDraft(null);
  };

  const rerunOne = () => {
    if (!sel) return;
    const r = sel.rec;
    const text = sel.kind === "doc" && r.ocrText
      ? r.ocrText
      : simulateOcr({ name: r.name || r.title, kind: r.kind || "Contract", contractType: r.contractType, jur: r.jur, entityId: r.entityId, contract: sel.kind === "contract" ? r : null }).text;
    const f = extractFromOcr(text, r);
    setDraft(f);
  };

  // Bulk analyzer over the filtered set (uses the Master Filter Bar upstream).
  const runBulk = () => {
    let updated = 0, flagged = 0;
    rows.forEach((c) => {
      const text = simulateOcr({ name: c.title, kind: "Contract", contractType: c.contractType, jur: c.jur, entityId: c.entityId, contract: c }).text;
      const f = extractFromOcr(text, c);
      const patch = { extractedFields: { ...(c.extractedFields || {}), ...f } };
      if (f.landValue != null && c.landValue == null) { patch.landValue = f.landValue; }
      if ((f.flags || []).length) flagged++;
      updateItem("contracts", c.id, patch);
      updated++;
    });
    setBulk({ updated, flagged });
  };

  const EDITABLE = [
    ["parties", "Parties", "text"], ["governingLaw", "Governing law", "text"],
    ["term", "Term", "text"], ["noticePeriod", "Notice period", "text"],
    ["registration", "Registration ref", "text"], ["titleRef", "Title / deed ref", "text"],
    ["landRef", "Parcel / plot ref", "text"],
    ["totalValue", "Total value", "number"], ["ppaValue", "PPA value", "number"], ["landValue", "Land value", "number"],
  ];

  return html`<div class="grid" style="grid-template-columns:330px 1fr;gap:16px;align-items:start">
    <div class="card">
      <div class="card__head">
        <div style="min-width:0"><div class="card__title">Corpus</div><div class="card__sub">${items.length} documents & contracts in scope</div></div>
      </div>
      <div class="card__body col" style="gap:4px;max-height:620px;overflow-y:auto">
        ${items.map((i) => html`<button key=${i.kind + i.id} class=${cx("drill__node", sel && sel.id === i.id && "open")} onClick=${() => { setSelId(i.id); setDraft(null); }}>
          <div class="notif__ico" style="width:26px;height:26px;background:var(--surface-3);color:var(--text-2);flex:none"><${Icon} name=${i.kind === "doc" ? "file" : "grid"} size=13 /></div>
          <div style="flex:1;min-width:0">
            <div class="strong tiny" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.label}</div>
            <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.id} · ${i.sub}</div>
          </div>
          <${Pill} tone=${(i.conf || 1) >= 0.9 ? "green" : (i.conf || 1) >= 0.82 ? "amber" : "red"}>${Math.round((i.conf || 1) * 100)}%</${Pill}>
        </button>`)}
      </div>
    </div>

    <div class="col" style="gap:14px">
      <div class="card card--pad col" style="gap:12px">
        <div class="row wrap" style="gap:8px">
          <span class="strong">Bulk analyzer</span>
          <div class="spacer"></div>
          <span class="tiny muted">${rows.length} contracts match the current filters</span>
          <${Btn} variant="soft" size="sm" icon="cpu" onClick=${runBulk}>Re-extract the filtered set</${Btn}>
        </div>
        ${bulk && html`<div class="banner banner--info"><${Icon} name="checkcircle" size=16 /><span>Re-extracted <b>${bulk.updated}</b> contracts; <b>${bulk.flagged}</b> raised a confidence flag.</span></div>`}
      </div>

      ${!sel
        ? html`<${Empty} icon="cpu" title="Nothing to extract" text="Add a document in Intake & Repository first." />`
        : html`<div class="card">
          <div class="card__head">
            <div style="min-width:0">
              <div class="card__title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sel.label}</div>
              <div class="card__sub">${sel.id} · ${sel.sub} · confidence ${Math.round((sel.conf || 1) * 100)}%</div>
            </div>
            <div class="card__actions">
              <${Btn} variant="ghost" size="sm" icon="refresh" onClick=${rerunOne}>Re-run extraction</${Btn}>
              ${draft && html`<${Btn} variant="ghost" size="sm" onClick=${() => setDraft(null)}>Discard</${Btn}>`}
              <${Btn} variant=${draft ? "primary" : "soft"} size="sm" icon="save" disabled=${!draft} onClick=${save}>${draft ? "Save to record" : "No changes"}</${Btn}>
            </div>
          </div>
          <div class="card__body col" style="gap:14px">
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">
              ${EDITABLE.map(([k, label, type]) => html`<${Field} key=${k} label=${label}>
                <${Input} type=${type === "number" ? "number" : "text"} value=${fields[k] == null ? "" : fields[k]} placeholder="—"
                  onInput=${(ev) => setField(k, type === "number" ? (ev.target.value === "" ? null : Number(ev.target.value)) : ev.target.value)} />
              </${Field}>`)}
            </div>
            ${(fields.keyClauses || []).length > 0 && html`<div>
              <div class="fpop__lbl">Key clauses</div>
              <div class="col" style="gap:5px">${fields.keyClauses.map((c, i) => html`<div key=${i} class="row" style="gap:7px"><${Icon} name="dot" size=13 style=${{ color: "var(--brand)" }} /><span class="tiny">${c}</span></div>`)}</div>
            </div>`}
            ${(fields.obligations || []).length > 0 && html`<div>
              <div class="fpop__lbl">Obligations</div>
              <div class="col" style="gap:5px">${fields.obligations.map((o) => html`<div key=${o.id} class="row" style="gap:7px">
                <${Icon} name=${o.status === "Overdue" ? "alertTriangle" : "checksquare"} size=13 style=${{ color: o.status === "Overdue" ? "var(--danger)" : "var(--text-3)" }} />
                <span class="tiny" style="flex:1">${o.text}</span><span class="tiny muted">${fmt.until(o.due)}</span>
              </div>`)}</div>
            </div>`}
            ${(fields.flags || []).length > 0 && html`<div class="banner banner--warn"><${Icon} name="alertTriangle" size=16 /><span>${fields.flags.join(" · ")}</span></div>`}
            ${sel.kind === "doc" && sel.rec.ocrText && html`<div>
              <div class="fpop__lbl">Source OCR text</div>
              <div class="ocrbox">${sel.rec.ocrText}</div>
            </div>`}
          </div>
        </div>`}
    </div>
  </div>`;
}

/* ============================================================
   Aggregates & analytics
   ============================================================ */
function AggregateView({ rows, onDrill }) {
  const live = rows.filter(isActive);
  const totalValue = live.reduce((s, c) => s + toUsd(c.value, c.currency), 0);
  const totalPpa = live.reduce((s, c) => s + toUsd(c.ppaValue || 0, c.currency), 0);
  const totalLand = live.reduce((s, c) => s + toUsd(c.landValue || 0, c.currency), 0);
  const avgConf = rows.length ? rows.reduce((s, c) => s + (c.extractionConfidence || 0.9), 0) / rows.length : 0;

  const group = (keyFn, labelFn) => {
    const m = new Map();
    live.forEach((c) => { const k = keyFn(c); m.set(k, (m.get(k) || 0) + toUsd(c.value, c.currency)); });
    // Nominal categories: every bar takes slot 1. Colouring bars by their own
    // value would double-encode what bar length already shows.
    /* `key` travels with the datum: the LABEL is what a reader sees ("Not
       recorded"), the KEY is what the register filters on (""). Drilling on
       the label set a value no row carries, so the chart appeared to filter
       and the count never moved. */
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => ({ key: k, label: labelFn(k), value: Math.round(v / 1e6), color: seriesColor(0) }));
  };
  /* THE CHART GROUPS ON EXACTLY WHAT THE FILTER READS.
     This grouped by `entityId` and labelled with entityName(), while the
     register's Entity filter reads `r.entityName`. For most rows the two
     agree; for a contract with no entity they do not, so clicking that bar set
     a filter value no row could match and the register came back unchanged —
     a chart that looks like it filtered and did not. One value, both ends. */
  const byEntity = useMemo(() => group((c) => c.entityName || "", (k) => k || "Not recorded"), [rows]);
  const byJur = useMemo(() => group((c) => c.jur, (k) => k), [rows]);
  const byType = useMemo(() => group((c) => c.contractType, (k) => k), [rows]);
  const bySubdiv = useMemo(() => group((c) => c.subdivision, (k) => k), [rows]);

  // Expiring-value radar: value falling due in each forward window.
  const radar = [30, 60, 90, 180, 365].map((d) => {
    const items = live.filter((c) => { const days = (new Date(c.expiry) - Date.now()) / 86400000; return days >= 0 && days <= d; });
    return { label: "≤" + d + "d", value: Math.round(items.reduce((s, c) => s + toUsd(c.value, c.currency), 0) / 1e6) };
  });

  return html`<div class="col" style="gap:16px">
    <div class="grid grid--kpi">
      <${Metric} icon="dollar" tone="green" label="Portfolio value (live)" value=${fmt.money(totalValue)} foot=${`${live.length} live contracts`} />
      <${Metric} icon="building" tone="blue" label="Total PPA value" value=${fmt.money(totalPpa)} foot="property purchase commitments" />
      <${Metric} icon="mapPin" tone="amber" label="Total land value" value=${fmt.money(totalLand)} foot=${totalPpa ? `${Math.round((totalLand / totalPpa) * 100)}% of PPA value` : "—"} />
      <${Metric} icon="cpu" tone="purple" label="Extraction confidence" value=${Math.round(avgConf * 100) + "%"} foot=${`across ${rows.length} records`} />
    </div>

    ${/* EVERY BAR AND EVERY SLICE OPENS THE CONTRACTS BEHIND IT (§100).
          These four read as a finished picture and were entirely inert: a
          reader could see that one entity holds $40M of the live book and had
          no way to ask which contracts those are. Each one now sets the
          analyzer register's OWN filter — the same `anz_*` state the toolbar
          sets — so the chart and the table underneath can never disagree
          about what is being shown. The sub-division chart has no register
          filter of its own, so it is honest about being a summary. */ ""}
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <div class="card card--pad col" style="gap:12px">
        <div class="row"><span class="strong">Portfolio value by entity</span><div class="spacer"></div><span class="tiny muted">USD millions · click to filter</span></div>
        <${HBars} data=${byEntity} format=${(v) => "$" + v + "M"} onItem=${(d) => onDrill("entity", d.key != null ? d.key : d.label)} />
      </div>
      <div class="card card--pad col" style="gap:12px">
        <div class="row"><span class="strong">By contract type</span><div class="spacer"></div><span class="tiny muted">USD millions · click to filter</span></div>
        <${HBars} data=${byType} format=${(v) => "$" + v + "M"} color="#0891b2" onItem=${(d) => onDrill("ctype", d.key != null ? d.key : d.label)} />
      </div>
      <div class="card card--pad col" style="gap:12px">
        <div class="row"><span class="strong">By jurisdiction</span><div class="spacer"></div><span class="tiny muted">click a slice to filter</span></div>
        <${Donut} data=${byJur} size=${160} thickness=${21} centerValue=${fmt.money(totalValue)} centerLabel="live value"
          onItem=${(d) => onDrill("jur", d.key != null ? d.key : d.label)} />
      </div>
      <div class="card card--pad col" style="gap:12px">
        <span class="strong">By legal sub-division</span>
        <${HBars} data=${bySubdiv} format=${(v) => "$" + v + "M"} color="#6d28d9" />
        <span class="tiny muted">A summary only — the contract register carries no sub-division filter to open.</span>
      </div>
    </div>

    <div class="card card--pad col" style="gap:12px">
      <div class="row"><span class="strong">Expiring-value radar</span><div class="spacer"></div><span class="tiny muted">cumulative value falling due, USD millions</span></div>
      <${BarChart} data=${radar} height=${180} format=${(v) => "$" + v + "M"} />
    </div>
  </div>`;
}

/* ============================================================
   The page
   ============================================================ */
export default function Analyzer() {
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const licenses = useCollection("licenses");
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const [tab, setTab] = useState("ppa");
  const ctx = { requests, matters, contracts, repository, licenses };
  // The toolbar's FIELDS describe contracts, because that is the corpus the PPA,
  // extraction and aggregate views analyse. Licences and documents are secondary
  // rollups on this page, so they follow the SEARCH term only — applying a
  // contract's "agreement type" to a licence would be filtering by a field a
  // licence does not have.
  const rows = useMemo(() => contracts.map((c) => ({
    ...c, __tat: rowTat(c, ctx), entityName: entityName(c.entityId) || c.entityName || "",
  })), [contracts, repository]);
  const matchQ = (hay, q) => !q || hay.toLowerCase().includes(q.toLowerCase());

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Data Analyzer"
      sub="Structured intelligence over the contract and document corpus — PPA and land values, licence rollups, and editable extraction."
      actions=${html`<${Btn} variant="ghost" icon="database" onClick=${() => navigate("/repository")}>Repository</${Btn}>
        <${Btn} variant="ghost" icon="grid" onClick=${() => navigate("/tracker")}>Tracker</${Btn}>`} />

    <${RegisterShell}
      ns="anz" rows=${rows}
      fields=${analyzerFields}
      views=${analyzerViews} searchKeys=${analyzerSearchKeys}
      searchPlaceholder="Search the corpus…"
      noun=${["contract", "contracts"]}
      exportName="analyzer-corpus">
      ${(f) => html`<div>
        <div style="margin:4px 0 16px"><${Tabs} tabs=${TABS} active=${tab} onChange=${setTab} ariaLabel="Analyzer views" /></div>
        ${(() => {
          const filtered = f.filtered;
          const filteredLicenses = licenses.filter((l) => matchQ([l.name, l.type, l.authority, l.licenseNumber, l.entity].join(" "), f.q));
          const filteredDocs = repository.filter((d) => matchQ([d.name, d.id, d.kind, d.ocrText].join(" "), f.q));
          return html`<div>
            ${tab === "ppa" && html`<${PpaView} rows=${filtered} onDrill=${(k, v) => f.toggle(k, v)} />`}
            ${tab === "licenses" && html`<${LicenseView} licenses=${filteredLicenses} />`}
            ${tab === "extraction" && html`<${ExtractionView} rows=${filtered} repository=${filteredDocs} />`}
            ${tab === "aggregates" && html`<${AggregateView} rows=${filtered} onDrill=${(k, v) => f.toggle(k, v)} />`}
          </div>`;
        })()}
      </div>`}
    </${RegisterShell}>

    <div class="tiny muted" style="margin-top:16px">
      Extraction is deterministic in the prototype — the provider seam is
      <span class="mono">pages/repository.js#simulateOcr</span> (OCR) and
      <span class="mono">data.js#extractFromOcr</span> (field parsing).
    </div>
  </div>`;
}
