// IP PORTFOLIO — the trademark estate, from the tracker the team keeps.
//
//   Litigation & Dispute - LegalOS / Pending Trademark Tracker (New)- Updated.xlsx
//
// Two sheets, two portfolios: the group's own marks and the ones held through
// joint ventures. They carry the same columns, so they are one register with
// the portfolio on each row — a filter nobody can apply is the same as data
// nobody has.
//
// Every field here is a column in that workbook, and every dropdown is the set
// of values the workbook actually contains. Where the tracker is silent the
// screen says so rather than filling the gap: it records no expiry date, so
// the Renewals view explains that instead of showing an empty list that looks
// like "nothing is due".
import { html, cx, fmt, useState, useEffect, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Empty, Input, Field, Modal, DateInput } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { IntakeDesk } from "../intakedesk.js";
import { useQuery, navigate } from "../router.js";
import { api } from "../api.js";
import { RegisterTabs } from "../register.js";
import { ModuleRecordOrigin } from "../modulerecordactions.js";
import { RowActions, DeleteDialog, RemovedRecords, removedToast, deleteEligibility } from "../rowdelete.js";
import { useActiveUser } from "../rbac.js";
import { toast } from "../toast.js";

/* The tracker's own status words. Only the colour is ours. */
const STATUS_TONE = { Registered: "green", Publication: "indigo", Filed: "gray" };
const SUB_TONE = {
  "Pending Withdrawal": "amber", "Pending Opposition": "red", "Under Renewal": "amber",
  "Pending Publication": "indigo", "Under Examination": "indigo", Renewed: "green",
  "Instruction to file": "gray",
};
const dash = (v) => (v == null || String(v).trim() === "" ? html`<span class="tiny muted">—</span>` : v);

export default function IpPortfolio({ id }) {
  const [q, patch] = useQuery();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [rereading, setRereading] = useState(false);
  const [lastRead, setLastRead] = useState(null);
  const [native, setNative] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [creating, setCreating] = useState(false);
  const me = useActiveUser();
  /* The marks raised here, and the ones removed from the register (§99). */
  const loadNative = () => api.litigation.moduleRecords("ip", true)
    .then((r) => {
      const all = r.records || [];
      setNative(all.filter((x) => !x.deletedAt));
      setRemoved(all.filter((x) => x.deletedAt));
    }, () => { setNative([]); setRemoved([]); });
  useEffect(() => { api.litigation.ipPortfolio().then(setD, setErr); loadNative(); }, []);

  if (err) {
    return html`<div class="page page--wide fade-in">
      <${PageHead} title="PK IP Portfolio" />
      <${Empty} icon="alertTriangle" title="The trademark tracker could not be read"
        text=${(err.payload && err.payload.detail) || err.message} />
    </div>`;
  }
  if (!d) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="PK IP Portfolio" />
      <div class="tiny muted" style="padding:20px 2px">Reading the trademark tracker…</div></div>`;
  }
  const tab = q.iptab || "marks";
  const set = (o) => patch(o);
  /* THE TRACKER'S MARKS, PLUS THE ONES RAISED HERE.
     A mark added in LegalOS carries origin LEGALOS so a reader can always tell
     which rows came out of the workbook and which did not. The workbook is not
     written to. */
  /* RAISED HERE GOES ON TOP, newest first. Appended to the end, a mark somebody
     had just created was row 58 of 58 and read as "it did not save". */
  const nativeMarks = native.slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const marks = nativeMarks.map((r) => ({
    ...r.fields, id: r.id, portfolio: r.fields.portfolio || "Raised in LegalOS",
    sourceSheet: "LegalOS", origin: "LEGALOS",
    createdBy: r.createdBy, createdAt: r.createdAt,
    renewal: { expiryDate: r.fields.expiryDate || "", basis: r.fields.expiryDate
      ? "Recorded when this matter was raised in LegalOS."
      : "No expiry date was recorded when this matter was raised." },
  })).concat(d.marks || []);
  /* A MARK RAISED HERE OPENS LIKE ANY OTHER.
     The detail view read the tracker alone, so a mark created in LegalOS
     appeared on the register and then said "Not in the tracker" when its own
     row was clicked. It reads the merged list, which is what the register
     showed. Placed after the merge so `marks` exists to search. */
  if (id) return html`<${MarkDetail} marks=${marks} source=${d.source} id=${id} />`;

  const f = { portfolio: q.ipfolio || "", status: q.ipstatus || "", sub: q.ipsub || "",
    owner: q.ipowner || "", firm: q.ipfirm || "", cls: q.ipclass || "", term: (q.ipq || "").trim().toLowerCase() };

  const rows = marks.filter((m) => {
    if (f.portfolio && m.portfolio !== f.portfolio) return false;
    if (f.status && m.status !== f.status) return false;
    if (f.sub && m.subStatus !== f.sub) return false;
    if (f.owner && m.owner !== f.owner) return false;
    if (f.firm && m.firm !== f.firm) return false;
    if (f.cls && String(m.class) !== f.cls) return false;
    if (f.term && !(m.markName + " " + m.officialFileNo + " " + m.owner + " " + m.remarks).toLowerCase().includes(f.term)) return false;
    return true;
  });

  const chips = [
    f.term && { label: "Search: " + f.term, clear: { ipq: "" } },
    f.portfolio && { label: f.portfolio, clear: { ipfolio: "" } },
    f.status && { label: f.status, clear: { ipstatus: "" } },
    f.sub && { label: f.sub, clear: { ipsub: "" } },
    f.owner && { label: f.owner, clear: { ipowner: "" } },
    f.firm && { label: f.firm, clear: { ipfirm: "" } },
    f.cls && { label: "Class " + f.cls, clear: { ipclass: "" } },
  ].filter(Boolean);

  const c = d.counts;
  const opposition = marks.filter((m) => /opposition/i.test(m.subStatus)).length;
  const withdrawal = marks.filter((m) => /withdrawal/i.test(m.subStatus)).length;

  const tabs = [
    { id: "marks", label: "Trademarks", n: marks.length },
    { id: "renewals", label: "Renewals" },
    { id: "oppositions", label: "Oppositions", n: opposition },
    { id: "source", label: "Source" },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="PK IP Portfolio"
      sub="Trademarks filed, published and registered, from the team's own tracker."
      actions=${html`<div class="row" style="gap:10px;align-items:center">
        ${lastRead && html`<span class="tiny muted">Read ${fmt.rel(lastRead)}</span>`}
        <${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>New IP Matter</${Btn}>
        <${Btn} variant="ghost" icon="refresh" disabled=${rereading}
          onClick=${async () => {
    setRereading(true);
    try { setD(await api.litigation.ipPortfolio(true)); setLastRead(new Date().toISOString()); }
    catch (e) { setErr(e); } finally { setRereading(false); }
  }}>${rereading ? "Re-reading…" : "Re-read tracker"}</${Btn}>
      </div>`} />

    ${/* REQUESTS TRIAGED TO THIS DESK BELONG ON THIS DESK.
          This register used to be a filtered slice of the case register rendered
          by ModuleLive, which shows the intake desk above the table. Moving it
          onto its own page kept the tracker and lost the desk: a legal request
          routed here by triage was assigned, owned and invisible -- it appeared
          on nobody's register. IntakeDesk renders nothing when there is no
          intake, so this costs an empty desk nothing. */ ""}
    <${IntakeDesk} moduleKey="ip" label="PK IP Portfolio" />

    ${/* Every one filters the register below. */ ""}
    <${StatStrip} stats=${[
    { value: c.total, label: "Trademarks", onClick: () => set({ iptab: "marks", ipfolio: "", ipstatus: "", ipsub: "" }) },
    { value: c.byStatus.Registered || 0, label: "Registered", onClick: () => set({ iptab: "marks", ipstatus: "Registered" }) },
    { value: c.byStatus.Publication || 0, label: "In publication", onClick: () => set({ iptab: "marks", ipstatus: "Publication" }) },
    { value: c.byStatus.Filed || 0, label: "Filed", onClick: () => set({ iptab: "marks", ipstatus: "Filed" }) },
    { value: opposition, label: "Opposition", tone: opposition ? "red" : "",
      onClick: () => set({ iptab: "oppositions" }) },
    { value: withdrawal, label: "Pending withdrawal", tone: withdrawal ? "amber" : "",
      onClick: () => set({ iptab: "marks", ipsub: "Pending Withdrawal" }) },
    { value: (c.byPortfolio["Joint venture"] || 0), label: "Joint-venture marks",
      onClick: () => set({ iptab: "marks", ipfolio: "Joint venture" }) },
  ]} />

    ${/* The shared tab strip. The hand-rolled copies that used to be here
          looked identical and behaved differently: no roving tabindex, so Tab
          walked through every tab rather than the selected one, and no arrow
          keys, so a keyboard user could not move between tabs at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${(id) => set({ iptab: id })} ariaLabel="IP portfolio" />

    ${tab === "marks" && html`<div class="col" style="gap:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:200px"><${Input} value=${q.ipq || ""} placeholder="Search marks, file numbers, owners…"
          aria-label="Search trademarks" onChange=${(v) => set({ ipq: v })} /></div>
        ${[["ipfolio", "Portfolio", d.options.portfolio], ["ipstatus", "Status", d.options.status],
    ["ipsub", "Sub-status", d.options.subStatus], ["ipowner", "Owner", d.options.owner],
    ["ipfirm", "Firm", d.options.firm], ["ipclass", "Class", d.options.class]].map(([k, label, opts]) =>
    html`<div key=${k} style="width:165px"><${Field} label=${label}>
            <select class="input" value=${q[k] || ""} onChange=${(e) => set({ [k]: e.target.value })}>
              <option value="">All</option>
              ${(opts || []).map((o) => html`<option key=${o} value=${o} selected=${q[k] === String(o)}>${o}</option>`)}
            </select></${Field}></div>`)}
      </div>
      ${chips.length > 0 && html`<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
        <span class="tiny muted">Filtered by</span>
        ${chips.map((x, i) => html`<button key=${i} type="button" class="fltbtn fltbtn--on"
          onClick=${() => set(x.clear)}>${x.label} ✕</button>`)}
        <button type="button" class="fltbtn" onClick=${() => set({ ipq: "", ipfolio: "", ipstatus: "",
    ipsub: "", ipowner: "", ipfirm: "", ipclass: "" })}>Clear all</button>
      </div>`}
      <div class="tiny muted">${rows.length} of ${marks.length} shown</div>
      ${rows.length === 0
    ? html`<${Empty} icon="tag" title="No mark matches" text="Clear a filter to widen the register." />`
    : html`<div class="tablewrap"><table class="table">
      <thead><tr><th>Mark</th><th>Class</th><th>File no.</th><th>Filed</th><th>Reg. no.</th>
        <th>Status</th><th>Sub-status</th><th>Owner</th><th>Firm</th><th>Portfolio</th>
        <th style="width:56px" aria-label="Row actions"></th></tr></thead>
      <tbody>${rows.map((m) => html`<tr key=${m.id} class="rowlink" tabIndex=${0} role="link"
        aria-label=${"Open " + m.markName}
        onClick=${() => navigate("/m/ip/" + encodeURIComponent(m.id))}
        onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/m/ip/" + encodeURIComponent(m.id)); } }}>
        <td><div class="cell-strong">${m.markName}</div></td>
        <td><span class="tiny">${dash(m.class)}</span></td>
        <td><span class="cell-mono tiny">${dash(m.officialFileNo)}</span></td>
        <td><span class="tiny">${m.filingDate ? fmt.dateShort(m.filingDate) : "—"}</span></td>
        <td><span class="cell-mono tiny">${dash(m.officialRegNo)}</span></td>
        <td>${m.status ? html`<${Pill} tone=${STATUS_TONE[m.status] || "gray"}>${m.status}</${Pill}>` : dash("")}</td>
        <td>${m.subStatus ? html`<${Pill} tone=${SUB_TONE[m.subStatus] || "gray"}>${m.subStatus}</${Pill}>` : dash("")}</td>
        <td><span class="tiny">${dash(m.owner)}</span></td>
        <td><span class="tiny">${dash(m.firm)}</span></td>
        <td><span class="tiny muted">${m.portfolio}</span></td>
        ${/* §92 — a tracker mark offers Open only; one added here can also be
              removed, and rowdelete.js decides which. */ ""}
        <td style="text-align:right"><${RowActions} items=${[
          { label: "Open", icon: "arrowRight", onClick: () => navigate("/m/ip/" + encodeURIComponent(m.id)) },
          ...(m.origin === "LEGALOS"
            ? [{ label: "Remove", icon: "trash", danger: true, onClick: () => setDeleting(m) }]
            : []),
        ]} /></td>
      </tr>`)}</tbody>
      </table></div>`}

      <${RemovedRecords} rows=${removed} noun="mark"
        labelOf=${(r) => (r.fields && r.fields.markName) || r.id}
        onRestore=${async (r) => {
          await api.litigation.restoreModuleRecord("ip", r.id);
          toast(((r.fields && r.fields.markName) || "Mark") + " restored", "success");
          loadNative();
        }} />
    </div>`}

    ${deleting && (() => {
      const label = deleting.markName || deleting.id;
      const elig = deleteEligibility(deleting, me, { noun: "mark" });
      return html`<${DeleteDialog} record=${deleting} title=${label} eligibility=${elig}
        onDelete=${(reason) => api.litigation.removeModuleRecord("ip", deleting.id, reason)}
        onRequest=${(reason) => api.litigation.requestDeletion("ip", deleting.id, label, reason)}
        onClose=${() => setDeleting(null)}
        onDone=${() => {
          const wasId = deleting.id;
          if (elig.mode === "delete") {
            removedToast(label, async () => {
              await api.litigation.restoreModuleRecord("ip", wasId); loadNative();
            });
          } else {
            toast("Sent for approval. Nothing is removed until the head approves.", "success");
          }
          setDeleting(null); loadNative();
        }} />`;
    })()}

    ${tab === "renewals" && html`<${Section} title="Renewals" icon="clock"
      sub="What the tracker can and cannot tell us about renewal dates.">
      <${Empty} icon="clock" title="No renewal date is recorded in the source"
        text=${d.renewals.detail} />
      <div class="tiny muted" style="padding-top:10px">
        The whole connected Drive was searched for a trademark registration certificate that would
        carry a real registration or expiry date; every "registration certificate" in it is a tax,
        PSEB, trust or charge certificate for an SECP entity. There is nothing to read a date from.
        A Pakistani mark runs ten years from <strong>registration</strong>, so the date could be
        calculated — but calculated from a <strong>filing</strong> date it would be wrong for every
        mark that took years to register, and on screen it would look exactly as authoritative as a
        real one. Add an expiry column to the tracker, or file the registration certificates, and
        reminders at one year, six months and three months follow from it.
      </div>
      ${(() => {
    const registered = (d.marks || []).filter((m) => m.status === "Registered");
    if (!registered.length) return null;
    return html`<div style="padding-top:14px">
          <div class="tiny strong" style="padding-bottom:6px">${registered.length} registered mark${registered.length === 1 ? "" : "s"} would need one:</div>
          <div class="col" style="gap:0">${registered.map((m) => html`<button key=${m.id} type="button"
            class="feed__item clickable" style="text-align:left;width:100%"
            onClick=${() => navigate("/m/ip/" + encodeURIComponent(m.id))}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <div style="flex:1;min-width:0"><div class="tiny strong">${m.markName}</div>
                <div class="tiny muted">Class ${m.class} · ${m.owner} · registered as ${m.officialRegNo || "—"}</div></div>
              ${m.subStatus && html`<${Pill} tone=${SUB_TONE[m.subStatus] || "gray"}>${m.subStatus}</${Pill}>`}
              <${Icon} name="chevronRight" size=14 />
            </div></button>`)}</div>
        </div>`;
  })()}
    </${Section}>`}

    ${tab === "oppositions" && html`<${Section} title="Oppositions" icon="alertTriangle"
      sub="Marks the tracker records as facing or pending an opposition.">
      ${(() => {
    const opp = marks.filter((m) => /opposition/i.test(m.subStatus));
    if (!opp.length) {
      return html`<div class="tiny muted">The tracker records no mark under opposition.</div>`;
    }
    return html`<div class="col" style="gap:0">${opp.map((m) => html`<button key=${m.id} type="button"
      class="feed__item clickable" style="text-align:left;width:100%"
      onClick=${() => navigate("/m/ip/" + encodeURIComponent(m.id))}>
      <div class="row" style="gap:10px;align-items:center;width:100%">
        <div style="flex:1;min-width:0"><div class="tiny strong">${m.markName}</div>
          <div class="tiny muted">Class ${m.class} · ${m.owner} · ${m.firm}</div></div>
        <${Pill} tone="red">${m.subStatus}</${Pill}>
        <${Icon} name="chevronRight" size=14 />
      </div></button>`)}</div>`;
  })()}
    </${Section}>`}

    ${creating && html`<${NewMarkModal} options=${d.options} onClose=${() => setCreating(false)}
      onDone=${() => { setCreating(false); loadNative(); }} />`}

    ${tab === "source" && html`<${Section} title="Source" icon="folder"
      sub="Where every row on this page came from.">
      <div class="tiny" style="line-height:1.8">
        <div><span class="muted">Workbook:</span> <strong>${d.source.file}</strong></div>
        <div><span class="muted">Sheets:</span> ${d.source.sheets.join(", ")}</div>
        <div><span class="muted">Drive path:</span> ${d.source.folderPath}</div>
        <div><span class="muted">Read at:</span> ${d.source.readAt}</div>
      </div>
      <div class="tiny muted" style="padding-top:10px">
        LegalOS reads this workbook and does not write to it. Every dropdown on this page is the set of
        values the workbook actually contains — nothing has been added to make the UI tidier.
      </div>
    </${Section}>`}
  </div>`;
}


/* RAISING A TRADEMARK IN LEGALOS.
   The fields are the tracker's columns and the dropdowns are the tracker's own
   values -- this is the same record the workbook holds, raised here because
   Legal needs to start one without opening Drive first. It is stored in
   LegalOS and marked as such; the workbook is read-only and is not written to.
   Anything the tracker does not have a column for is not asked for. */
function NewMarkModal({ options, onClose, onDone }) {
  const [f, setF] = useState({
    markName: "", class: "", officialFileNo: "", filingDate: "", officialRegNo: "",
    status: "Filed", subStatus: "", paymentStatus: "", owner: "", address: "",
    firm: "", remarks: "", priority: "", portfolio: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target ? e.target.value : e }));
  const save = async () => {
    if (!f.markName.trim()) { setErr("The mark's name is required."); return; }
    setBusy(true); setErr("");
    try { await api.litigation.createModuleRecord("ip", f); onDone(); }
    catch (e) { setErr(e.message || "The matter could not be saved."); setBusy(false); }
  };
  const sel = (k, label, opts, allowBlank) => html`<${Field} label=${label}>
    <select class="input" value=${f[k]} onChange=${set(k)}>
      ${allowBlank !== false && html`<option value="">—</option>`}
      ${(opts || []).map((o) => html`<option key=${o} value=${o} selected=${f[k] === String(o)}>${o}</option>`)}
    </select></${Field}>`;
  return html`<${Modal} title="New IP matter" icon="tag" width=${760} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !f.markName.trim()}
        onClick=${save}>Create IP matter</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      <div class="tiny muted">Every field here is a column in the trademark tracker, and every
        dropdown is the set of values that tracker contains. The record is stored in LegalOS —
        the workbook is read-only and is not written to.</div>
      <div class="modeditgrid">
        <${Field} label="Mark name *"><${Input} value=${f.markName} onInput=${set("markName")} /></${Field}>
        ${sel("class", "Class", options.class)}
        <${Field} label="Official file no."><${Input} value=${f.officialFileNo} onInput=${set("officialFileNo")} /></${Field}>
        <${Field} label="Filing date"><${DateInput} value=${f.filingDate} onInput=${set("filingDate")} /></${Field}>
        <${Field} label="Official registration no."><${Input} value=${f.officialRegNo} onInput=${set("officialRegNo")} /></${Field}>
        ${sel("status", "Status", options.status, false)}
        ${sel("subStatus", "Sub-status", options.subStatus)}
        ${sel("owner", "Owner", options.owner)}
        ${sel("firm", "IP firm / counsel", options.firm)}
        ${sel("portfolio", "Portfolio", options.portfolio)}
        <${Field} label="Payment status"><${Input} value=${f.paymentStatus} onInput=${set("paymentStatus")} /></${Field}>
        <${Field} label="Address"><${Input} value=${f.address} onInput=${set("address")} /></${Field}>
      </div>
      <${Field} label="Remarks"><textarea class="input" rows="3" value=${f.remarks} onInput=${set("remarks")}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

/* One mark: everything the tracker holds about it. */
function MarkDetail({ marks, source, id }) {
  const m = (marks || []).find((x) => x.id === id);
  if (!m) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Trademark" />
      <${Empty} icon="alertTriangle" title="Not in the tracker"
        text="No mark in the workbook has that reference."
        action=${html`<${Btn} variant="primary" onClick=${() => navigate("/m/ip")}>IP Portfolio</${Btn}>`} />
    </div>`;
  }
  const row = (k, v) => html`<div><span class="muted">${k}:</span> ${v || "—"}</div>`;
  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${m.markName}
      sub=${["Class " + m.class, m.owner, m.portfolio + " portfolio"].filter(Boolean).join(" · ")}
      actions=${html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => navigate("/m/ip")}>IP Portfolio</${Btn}>`} />

    <${StatStrip} stats=${[
    { value: m.status || "—", label: "Status" },
    { value: m.subStatus || "—", label: "Sub-status" },
    { value: m.officialFileNo || "—", label: "Official file no." },
    { value: m.officialRegNo || "—", label: "Registration no." },
    { value: m.filingDate ? fmt.dateShort(m.filingDate) : "—", label: "Filed" },
  ]} />

    ${/* A mark raised here can be taken off the register, with a reason, the way
          a case can. A tracker row cannot -- it belongs to the workbook. */ ""}
    <${ModuleRecordOrigin} moduleKey="ip" record=${m} label=${m.markName} />

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${Section} title="The mark" icon="tag">
        <div class="tiny" style="line-height:1.9">
          ${row("Mark name", m.markName)}
          ${row("Class", m.class)}
          ${row("Portfolio", m.portfolio)}
          ${row("Official file no.", m.officialFileNo)}
          ${row("Official registration no.", m.officialRegNo)}
          ${row("Filing date", m.filingDate ? fmt.date(m.filingDate) : "")}
        </div>
      </${Section}>
      <${Section} title="Who holds it, and who acts" icon="building">
        <div class="tiny" style="line-height:1.9">
          ${row("Owner", m.owner)}
          ${row("Address", m.address)}
          ${row("IP firm / counsel", m.firm)}
          ${row("Payment status", m.paymentStatus)}
          ${row("Priority", m.priority)}
        </div>
      </${Section}>
    </div>

    ${m.remarks && html`<${Section} title="Where it has got to" icon="activity"
      sub="The tracker's own note on this mark.">
      <div class="tiny" style="line-height:1.7;white-space:pre-wrap">${m.remarks}</div>
    </${Section}>`}

    <${Section} title="Renewal" icon="clock">
      <div class="tiny muted">${m.renewal.basis}</div>
    </${Section}>

    ${/* WHERE THIS MARK CAME FROM. A tracker row cites its workbook, sheet and
          row; one raised here says so and names who raised it. Neither is
          allowed to describe itself as the other. */ ""}
    <${Section} title="Source" icon="folder">
      ${m.origin === "LEGALOS"
    ? html`<div class="tiny muted">Raised in LegalOS${m.createdBy && m.createdBy.name ? " by " + m.createdBy.name : ""}${m.createdAt ? " on " + fmt.dateShort(m.createdAt) : ""}.
        It is not in the trademark tracker; the workbook is not written to.</div>`
    : html`<div class="tiny muted">Row ${m.sourceRow} of “${m.sourceSheet}” in ${source && source.file}
        — ${source && source.folderPath}</div>`}
    </${Section}>
  </div>`;
}
