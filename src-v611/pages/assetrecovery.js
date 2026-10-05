// ASSET RECOVERY — company property that left with the people who left.
//
//   Litigation & Dispute - LegalOS / Asset Recovery / Assets Recovery.xlsx
//
// The workbook's 25 sheets are four different things, and this keeps them
// apart because they are answered by different people:
//
//   RECOVERY MATTERS   somebody left and a laptop, a phone or a vehicle did
//                      not come back.
//   FINAL SETTLEMENTS  the leaver's final settlement came out negative — they
//                      owe the company. A different debt, with a show-cause
//                      date rather than an asset.
//   LEGAL ESCALATIONS  the ones that went past HR: a show-cause, a police
//                      application, an FIR. These are Legal's.
//   SOURCE             which sheet every figure came from, and the sheets that
//                      are rollups rather than records.
//
// Percentages and totals in the workbook's Summary tabs are NOT loaded as
// matters. A summary row in a register of people is a row nobody can open.
import { html, cx, fmt, useState, useEffect, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Empty, Input, Field } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { IntakeDesk } from "../intakedesk.js";
import { useQuery, navigate } from "../router.js";
import { api } from "../api.js";
import { RegisterTabs } from "../register.js";

const dash = (v) => (v == null || String(v).trim() === "" ? html`<span class="tiny muted">—</span>` : v);
const money = (v) => (v === "" || v == null ? null : fmt.money(Number(v) || 0, "PKR"));
const STATUS_TONE = { Recovered: "green", Closed: "green", Pending: "amber", "Police Complaint": "red" };

export default function AssetRecovery({ id }) {
  const [q, patch] = useQuery();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [rereading, setRereading] = useState(false);
  const [lastRead, setLastRead] = useState(null);
  useEffect(() => { api.litigation.assetRecovery().then(setD, setErr); }, []);

  if (err) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Asset Recovery" />
      <${Empty} icon="alertTriangle" title="The workbook could not be read"
        text=${(err.payload && err.payload.detail) || err.message} /></div>`;
  }
  if (!d) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Asset Recovery" />
      <div class="tiny muted" style="padding:20px 2px">Reading the asset-recovery workbook…</div></div>`;
  }
  if (id) return html`<${MatterDetail} d=${d} id=${id} />`;

  const tab = q.artab || "matters";
  const set = (o) => patch(o);
  const f = { year: q.aryear || "", region: q.arregion || "", dept: q.ardept || "",
    status: q.arstatus || "", term: (q.arq || "").trim().toLowerCase() };

  const filt = (rows) => rows.filter((m) => {
    if (f.year && m.year !== f.year) return false;
    if (f.region && m.region !== f.region) return false;
    if (f.dept && m.department !== f.dept) return false;
    if (f.status && m.status !== f.status) return false;
    if (f.term && !((m.employee || "") + " " + (m.employeeCode || "") + " " + (m.city || "")
      + " " + (m.comments || "")).toLowerCase().includes(f.term)) return false;
    return true;
  });

  const matters = filt(d.matters || []);
  const settlements = filt(d.settlements || []);
  const escalations = filt(d.escalations || []);
  const c = d.counts;

  const chips = [
    f.term && { label: "Search: " + f.term, clear: { arq: "" } },
    f.year && { label: f.year, clear: { aryear: "" } },
    f.region && { label: f.region, clear: { arregion: "" } },
    f.dept && { label: f.dept, clear: { ardept: "" } },
    f.status && { label: f.status, clear: { arstatus: "" } },
  ].filter(Boolean);

  const tabs = [
    { id: "matters", label: "Recovery matters", n: (d.matters || []).length },
    { id: "settlements", label: "Final settlements", n: (d.settlements || []).length },
    { id: "escalations", label: "Legal escalations", n: (d.escalations || []).length },
    { id: "police", label: "Police applications", n: (d.police || []).length },
    { id: "source", label: "Source" },
  ];

  const filters = html`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:200px"><${Input} value=${q.arq || ""} placeholder="Search people, codes, cities…"
      aria-label="Search asset recovery" onChange=${(v) => set({ arq: v })} /></div>
    ${[["aryear", "Year", d.options.year], ["arregion", "Region", d.options.region],
    ["ardept", "Department", d.options.department], ["arstatus", "Status", d.options.status]]
    .map(([k, label, opts]) => html`<div key=${k} style="width:170px"><${Field} label=${label}>
        <select class="input" value=${q[k] || ""} onChange=${(e) => set({ [k]: e.target.value })}>
          <option value="">All</option>
          ${(opts || []).map((o) => html`<option key=${o} value=${o} selected=${q[k] === o}>${o}</option>`)}
        </select></${Field}></div>`)}
  </div>
  ${chips.length > 0 && html`<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
    <span class="tiny muted">Filtered by</span>
    ${chips.map((x, i) => html`<button key=${i} type="button" class="fltbtn fltbtn--on"
      onClick=${() => set(x.clear)}>${x.label} ✕</button>`)}
    <button type="button" class="fltbtn" onClick=${() => set({ arq: "", aryear: "", arregion: "",
    ardept: "", arstatus: "" })}>Clear all</button>
  </div>`}`;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Asset Recovery"
      sub="Company property that left with the people who left, and the settlements that came out negative."
      actions=${html`<div class="row" style="gap:10px;align-items:center">
        ${lastRead && html`<span class="tiny muted">Read ${fmt.rel(lastRead)}</span>`}
        <${Btn} variant="ghost" icon="refresh" disabled=${rereading}
          onClick=${async () => {
    setRereading(true);
    try { setD(await api.litigation.assetRecovery(true)); setLastRead(new Date().toISOString()); }
    catch (e) { setErr(e); } finally { setRereading(false); }
  }}>${rereading ? "Re-reading…" : "Re-read workbook"}</${Btn}>
      </div>`} />

    ${/* REQUESTS TRIAGED TO THIS DESK BELONG ON THIS DESK.
          This register used to be a filtered slice of the case register rendered
          by ModuleLive, which shows the intake desk above the table. Moving it
          onto its own page kept the tracker and lost the desk: a legal request
          routed here by triage was assigned, owned and invisible -- it appeared
          on nobody's register. IntakeDesk renders nothing when there is no
          intake, so this costs an empty desk nothing. */ ""}
    <${IntakeDesk} moduleKey="assetRecovery" label="Asset Recovery" />

    <${StatStrip} stats=${[
    { value: c.matters.toLocaleString(), label: "Recovery matters", onClick: () => set({ artab: "matters", arstatus: "" }) },
    { value: c.recovered.toLocaleString(), label: "Recovered", onClick: () => set({ artab: "matters", arstatus: "Recovered" }) },
    { value: c.escalations.toLocaleString(), label: "Legal escalations", tone: c.escalations ? "amber" : "",
      onClick: () => set({ artab: "escalations" }) },
    { value: c.policeApplications, label: "Police applications", tone: c.policeApplications ? "red" : "",
      onClick: () => set({ artab: "police" }) },
    { value: c.settlements.toLocaleString(), label: "Negative settlements", onClick: () => set({ artab: "settlements" }) },
    /* Every figure goes somewhere: a total nobody can click is a decoration. */
    { value: fmt.money(c.assetValue, "PKR"), label: "Asset value at purchase",
      onClick: () => set({ artab: "matters", arstatus: "" }) },
    { value: fmt.money(c.outstandingSettlements, "PKR"), label: "Settlements outstanding",
      onClick: () => set({ artab: "settlements" }) },
  ]} />

    ${/* The shared tab strip. The hand-rolled copies that used to be here
          looked identical and behaved differently: no roving tabindex, so Tab
          walked through every tab rather than the selected one, and no arrow
          keys, so a keyboard user could not move between tabs at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${(id) => set({ artab: id })} ariaLabel="Asset recovery" />

    ${(tab === "matters" || tab === "escalations") && html`<div class="col" style="gap:12px">
      ${filters}
      ${(() => {
    const rows = tab === "escalations" ? escalations : matters;
    const all = tab === "escalations" ? (d.escalations || []).length : (d.matters || []).length;
    if (!rows.length) return html`<${Empty} icon="refresh" title="Nothing matches" text="Clear a filter to widen the list." />`;
    return html`<${Fragment2}>
      <div class="tiny muted">${rows.length} of ${all} shown</div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Person</th><th>Code</th><th>Department</th><th>City</th><th>Year</th>
          <th style="text-align:right">Asset value</th><th style="text-align:right">Outstanding</th>
          <th>Status</th>${tab === "escalations" ? html`<th>Escalation</th>` : null}
          <th style="width:80px" aria-label="Open"></th></tr></thead>
        <tbody>${rows.slice(0, 400).map((m) => html`<tr key=${m.id} class="rowlink" tabIndex=${0} role="link"
          aria-label=${"Open " + m.employee}
          onClick=${() => navigate("/m/assetRecovery/" + encodeURIComponent(m.id))}
          onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/m/assetRecovery/" + encodeURIComponent(m.id)); } }}>
          <td><div class="cell-strong">${m.employee}</div>
            ${m.separation && html`<div class="tiny muted">${m.separation}</div>`}</td>
          <td><span class="cell-mono tiny">${dash(m.employeeCode)}</span></td>
          <td><span class="tiny">${dash(m.department)}</span></td>
          <td><span class="tiny">${dash(m.city)}</span></td>
          <td><span class="tiny muted">${dash(m.year)}</span></td>
          <td style="text-align:right"><span class="tiny">${money(m.assetPurchaseValue) || dash("")}</span></td>
          <td style="text-align:right"><span class="tiny strong">${money(m.outstanding) || dash("")}</span></td>
          <td>${m.status ? html`<${Pill} tone=${STATUS_TONE[m.status] || "gray"}>${m.status}</${Pill}>`
      : (m.recoveredOn ? html`<${Pill} tone="green">Recovered</${Pill}>` : dash(""))}</td>
          ${tab === "escalations" ? html`<td><span class="tiny">${
        [m.firDate && "FIR " + fmt.dateShort(m.firDate),
          m.policeApplicationDate && "Police " + fmt.dateShort(m.policeApplicationDate),
          m.showCauseDate && "Show cause " + fmt.dateShort(m.showCauseDate),
          m.legalActionRef].filter(Boolean).join(" · ") || "—"}</span></td>` : null}
          <td><span class="tiny" style="color:var(--brand);font-weight:600">Open →</span></td>
        </tr>`)}</tbody>
      </table></div>
      ${rows.length > 400 && html`<div class="tiny muted">Showing the first 400 of ${rows.length}. Narrow with a filter.</div>`}
    </${Fragment2}>`;
  })()}
    </div>`}

    ${tab === "settlements" && html`<div class="col" style="gap:12px">
      ${filters}
      <div class="tiny muted">${settlements.length} of ${(d.settlements || []).length} shown —
        a negative final settlement is money the leaver owes the company, not an unreturned asset.</div>
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Person</th><th>Company</th><th>Department</th><th>Left on</th>
          <th style="text-align:right">Negative amount</th><th style="text-align:right">Received</th>
          <th style="text-align:right">Outstanding</th><th>Show cause</th><th>Status</th></tr></thead>
        <tbody>${settlements.slice(0, 400).map((s) => html`<tr key=${s.id}>
          <td><div class="cell-strong">${s.employee}</div>
            <div class="tiny muted">${dash(s.employeeCode)}</div></td>
          <td><span class="tiny">${dash(s.company)}</span></td>
          <td><span class="tiny">${dash(s.department)}</span></td>
          <td><span class="tiny">${s.leftOn ? fmt.dateShort(s.leftOn) : "—"}</span></td>
          <td style="text-align:right"><span class="tiny">${money(s.negativeAmount) || dash("")}</span></td>
          <td style="text-align:right"><span class="tiny">${money(s.receivedAmount) || dash("")}</span></td>
          <td style="text-align:right"><span class="tiny strong"
            title=${s.outstandingDerived ? "Worked out from the negative amount less what was received" : "As the sheet states it"}>
            ${money(s.outstanding) || dash("")}${s.outstandingDerived ? "" : "*"}</span></td>
          <td><span class="tiny">${s.showCauseDate ? fmt.dateShort(s.showCauseDate) : "—"}</span></td>
          <td>${s.status ? html`<${Pill} tone=${STATUS_TONE[s.status] || "gray"}>${s.status}</${Pill}>` : dash("")}</td>
        </tr>`)}</tbody>
      </table></div>
      <div class="tiny muted">* stated on the sheet rather than worked out from the two figures.</div>
    </div>`}

    ${tab === "police" && html`<${Section} title=${"Police applications (" + (d.police || []).length + ")"} icon="alertTriangle"
      sub="Recovery matters the workbook records as having gone to a police station.">
      ${!(d.police || []).length
    ? html`<div class="tiny muted">The workbook records no police application.</div>`
    : html`<div class="tablewrap"><table class="table">
        <thead><tr><th>Applicant</th><th>Accused</th><th>Police station</th><th>Sub-division</th><th>District</th></tr></thead>
        <tbody>${d.police.map((x) => html`<tr key=${x.id}>
          <td><span class="tiny">${dash(x.applicant)}</span></td>
          <td><div class="cell-strong">${x.accused}</div></td>
          <td><span class="tiny">${dash(x.policeStation)}</span></td>
          <td><span class="tiny">${dash(x.subDivision)}</span></td>
          <td><span class="tiny">${dash(x.district)}</span></td>
        </tr>`)}</tbody>
      </table></div>`}
    </${Section}>`}

    ${tab === "source" && html`<div class="col" style="gap:16px">
      <${Section} title="Source" icon="folder" sub="Where every figure on this page came from.">
        <div class="tiny" style="line-height:1.8">
          <div><span class="muted">Workbook:</span> <strong>${d.source.file}</strong></div>
          <div><span class="muted">Drive path:</span> ${d.source.folderPath}</div>
          <div><span class="muted">Sheets:</span> ${d.source.sheets}</div>
          <div><span class="muted">Read at:</span> ${d.source.readAt}</div>
        </div>
      </${Section}>
      <${Section} title="What each sheet is" icon="layers"
        sub="Every sheet in the workbook has a disposition. A sheet that is a rollup is not loaded as records.">
        <div class="tablewrap"><table class="table">
          <thead><tr><th>Sheet</th><th>What it is</th><th style="text-align:right">Rows</th>
            <th style="text-align:right">Records taken</th></tr></thead>
          <tbody>${d.sheets.map((s) => html`<tr key=${s.name}>
            <td><span class="cell-strong">${s.name}</span></td>
            <td><${Pill} tone=${s.disposition === "UNDISPOSITIONED" ? "red"
    : /SUMMARY|EMPTY/.test(s.disposition) ? "gray" : "indigo"}>
              ${s.disposition.replace(/_/g, " ").toLowerCase()}</${Pill}></td>
            <td style="text-align:right"><span class="tiny">${s.rows}</span></td>
            <td style="text-align:right"><span class="tiny">${s.recordsTaken || "—"}</span></td>
          </tr>`)}</tbody>
        </table></div>
        <div class="tiny muted" style="padding-top:10px">
          Summary sheets hold percentages computed from the sheets above them — they are not records
          of anything and are deliberately not loaded as matters.
          ${d.counts.undispositionedSheets === 0
    ? " Every sheet in the workbook is accounted for."
    : " " + d.counts.undispositionedSheets + " sheet(s) have no disposition and are not being read."}
        </div>
      </${Section}>
    </div>`}
  </div>`;
}

/* html`` wants a single root. */
const Fragment2 = ({ children }) => html`<div class="col" style="gap:12px">${children}</div>`;

/* One recovery matter: the person, the property, and what was done about it. */
function MatterDetail({ d, id }) {
  const m = (d.matters || []).find((x) => x.id === id);
  if (!m) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Recovery matter" />
      <${Empty} icon="alertTriangle" title="Not in the workbook"
        text="No recovery matter has that reference."
        action=${html`<${Btn} variant="primary" onClick=${() => navigate("/m/assetRecovery")}>Asset Recovery</${Btn}>`} />
    </div>`;
  }
  const row = (k, v) => html`<div><span class="muted">${k}:</span> ${v || "—"}</div>`;
  /* The same person's negative settlement, where the workbook has one. */
  const settlement = (d.settlements || []).find((s) =>
    s.employee.toLowerCase() === m.employee.toLowerCase());

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${m.employee}
      sub=${[m.employeeCode, m.department, m.city, m.year].filter(Boolean).join(" · ")}
      actions=${html`<${Btn} variant="ghost" icon="arrowLeft"
        onClick=${() => navigate("/m/assetRecovery")}>Asset Recovery</${Btn}>`} />

    <${StatStrip} stats=${[
    { value: money(m.assetPurchaseValue) || "—", label: "Asset value at purchase" },
    { value: money(m.outstanding) || "—", label: "For the legal department" },
    { value: m.recoveredOn ? fmt.dateShort(m.recoveredOn) : "—", label: "Recovered on" },
    { value: m.status || (m.recoveredOn ? "Recovered" : "—"), label: "Status" },
    { value: m.complaintDate ? fmt.dateShort(m.complaintDate) : "—", label: "Complaint raised" },
  ]} />

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${Section} title="The person" icon="users">
        <div class="tiny" style="line-height:1.9">
          ${row("Name", m.employee)}
          ${row("Employee code", m.employeeCode)}
          ${row("Department", m.department)}
          ${row("Region / city", [m.region, m.city].filter(Boolean).join(" · "))}
          ${row("Director", m.director)}
          ${row("Separation", m.separation)}
          ${row("Last working day", m.leftOn ? fmt.date(m.leftOn) : "")}
        </div>
      </${Section}>
      <${Section} title="The property and the money" icon="dollar">
        <div class="tiny" style="line-height:1.9">
          ${row("Assets", m.assetsName)}
          ${row("Purchase value", money(m.assetPurchaseValue))}
          ${row("Payable to the employee", money(m.payableToEmployee))}
          ${row("Net for the legal department", money(m.netForLegal))}
          ${row("Recovered on", m.recoveredOn ? fmt.date(m.recoveredOn) : "")}
          ${row("Received by", m.receivedBy)}
          ${row("Action", m.action)}
        </div>
      </${Section}>
    </div>

    ${(m.showCauseDate || m.policeApplicationDate || m.firDate || m.legalActionRef)
    && html`<${Section} title="Legal escalation" icon="alertTriangle"
      sub="What was done when the property did not come back.">
      <div class="tiny" style="line-height:1.9">
        ${row("Show-cause issued", m.showCauseDate ? fmt.date(m.showCauseDate) : "")}
        ${row("Police application", m.policeApplicationDate ? fmt.date(m.policeApplicationDate) : "")}
        ${row("FIR", m.firDate ? fmt.date(m.firDate) : "")}
        ${row("Legal action reference", m.legalActionRef)}
      </div>
    </${Section}>`}

    ${settlement && html`<${Section} title="Final settlement" icon="dollar"
      sub="The same person's final settlement came out negative. A separate debt from the unreturned property — shown here because it is the same conversation, not because it is the same amount.">
      <div class="tiny" style="line-height:1.9">
        ${row("Negative amount", money(settlement.negativeAmount))}
        ${row("Received", money(settlement.receivedAmount))}
        ${row("Outstanding", money(settlement.outstanding))}
        ${row("Show cause", settlement.showCauseDate ? fmt.date(settlement.showCauseDate) : "")}
        ${row("Status", settlement.status)}
      </div>
    </${Section}>`}

    ${m.comments && html`<${Section} title="Notes" icon="message">
      <div class="tiny" style="line-height:1.7;white-space:pre-wrap">${m.comments}</div></${Section}>`}

    <${Section} title="Source" icon="folder">
      <div class="tiny muted">Row ${m.sourceRow} of “${m.sourceSheet}” in ${d.source.file}
        — ${d.source.folderPath}</div>
      ${m.personnelFileLink && html`<div class="tiny muted" style="padding-top:6px">
        Personnel file: ${m.personnelFileLink}</div>`}
    </${Section}>
  </div>`;
}
