// Licenses & Registrations (Feature 1) — auto validity status + renewals.
import { activeUser, canOpenPath } from "../rbac.js";
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Drawer, Modal, Field, Input, Progress, Timeline, AICard } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { TagChips } from "../shared.js";
import { RegisterShell } from "../register.js";
import { useFilterLink } from "../filters.js";
import { DrillCell, licenceSeedFields, licenceSeedSearchKeys, licenceSeedViews } from "../registerdefs.js";
import { navigate } from "../router.js";
import { licenseStatus, nameOf, entityName } from "../data.js";
import { useCollection, updateItem, nowIso } from "../store.js";
import { useRegister } from "../live.js";

const JURIS = ["KSA", "UAE", "PK"];

// Map a live Drive `licences` register row into the shape this page renders, so
// the License Register shows the REAL licences (the seed `licenses` collection is
// empty). licenseStatus() derives Valid/Expiring/Expired from expiryDate, so we
// feed it that. Read-only: renewal actions no-op harmlessly on live rows.
function fromLive(r) {
  return {
    id: r.id,
    name: r.entity,
    authority: r.authority,
    licenseNumber: r.number,
    type: r.authority || "Licence",
    jurisdiction: "PK",
    issueDate: r.issued || null,
    expiryDate: r.expiry || null,
    owner: "u1",
    entity: r.entity,
    notes: "",
    renewalHistory: [],
    companyTags: [],
    driveFiles: Array.isArray(r.driveFiles) ? r.driveFiles : [],
    __live: true,
  };
}

function StatusPill({ lic }) {
  const s = licenseStatus(lic);
  return html`<${Pill} tone=${s.tone} dot=${true}>${s.label}</${Pill}>`;
}

function Countdown({ lic }) {
  const s = licenseStatus(lic);
  const cls = s.key === "Expired" ? "risk--critical" : s.key === "Critical" ? "risk--high" : "";
  return html`<span class=${cx("tiny", cls)} style="font-weight:600">${fmt.until(lic.expiryDate)}</span>`;
}

function MarkRenewedModal({ lic, onClose }) {
  const def = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(def);
  const submit = () => {
    const newExpiry = new Date(date + "T00:00:00").toISOString();
    updateItem("licenses", lic.id, {
      issueDate: nowIso(),
      expiryDate: newExpiry,
      renewalHistory: [...(lic.renewalHistory || []), { date: nowIso(), action: "Renewed — new expiry " + fmt.date(newExpiry), by: "u1" }],
    });
    onClose();
  };
  return html`<${Modal} title="Mark license renewed" icon="refresh" width=${480} onClose=${onClose}
    footer=${html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon="check" onClick=${submit}>Confirm renewal</${Btn}>`}>
    <div class="col" style="gap:16px">
      <div class="row" style="gap:10px"><div class="notif__ico" style="width:34px;height:34px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="fileCheck" size=17 /></div><div><div class="strong">${lic.name}</div><div class="tiny muted">${lic.authority} · ${lic.licenseNumber}</div></div></div>
      <${Field} label="New expiry date" hint="Defaults to one year from today."><${Input} type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
      <${AICard} title="On confirm">I'll reset the issue date to today, set the new expiry, append this action to the renewal history, and clear the auto-generated expiry alert.</${AICard}>
    </div>
  </${Modal}>`;
}

export default function Licenses() {
  const seed = useCollection("licenses");
  const live = useRegister("licences");
  // Prefer the live Drive register; fall back to the (currently empty) seed only
  // if the register hasn't loaded, so the page is never blank when data exists.
  const licenses = (live.rows && live.rows.length) ? live.rows.map(fromLive) : seed;
  const [openId, setOpenId] = useState(null);
  const [renew, setRenew] = useState(false);
  const open = licenses.find((l) => l.id === openId);
  const drill = useFilterLink("lcn");
  // Validity is computed per record (expiry vs its own renewal lead time), so the
  // old status tabs are a filter with live counts rather than a parallel control.
  const fields = useMemo(() => licenceSeedFields(licenseStatus), []);
  const countKey = (k) => licenses.filter((l) => licenseStatus(l).key === k).length;
  // Is anything narrowing the register right now?
  const anyLicenceFilter = fields.some((f) => drill.active(f.key).length > 0) || drill.active("q").length > 0;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Licenses & Registrations" sub="Every regulatory license and registration — validity computed automatically, with renewal alerts before they lapse."
      actions=${html`<${Btn} variant="ghost" icon="shield"
        onClick=${() => navigate("/compliance/licenses")}>Licence register</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: licenses.length, label: "Total licenses",
        // Pressed when the register already shows everything, so "nothing
        // happened" reads as "you are already here" rather than a dead control.
        // Same treatment as the Total contracts KPI.
        active: !anyLicenceFilter,
        onClick: () => drill.clearAll(fields),
        title: anyLicenceFilter ? "Clear every filter and show all licenses" : "Showing all licenses" },
      { value: countKey("Expiring") + countKey("Critical"), label: "Expiring ≤90 days",
        onClick: () => drill.set("validity", ["Expiring", "Critical"]) },
      { value: countKey("Critical"), label: "Critical (≤30 days)",
        onClick: () => drill.set("validity", ["Critical"]) },
      { value: countKey("Expired"), label: "Expired", tone: countKey("Expired") ? "red" : "",
        onClick: () => drill.set("validity", ["Expired"]) },
    ]} />

    <${RegisterShell}
      ns="lcn" rows=${licenses}
      fields=${fields}
      columns=${(f) => [
        { key: "id", label: "ID", mono: true, width: "84px", essential: true, sortValue: true, plain: (l) => l.id },
        { key: "name", label: "License", essential: true, sortValue: true, plain: (l) => l.name,
          render: (l) => html`<div class="cell-strong">${l.name}</div><div class="tiny muted">${l.authority}</div>` },
        { key: "type", label: "Type", sortValue: true, plain: (l) => l.type,
          render: (l) => html`<${DrillCell} f=${f} fkey="type" value=${l.type} title="Filter by type"><${Pill} tone="gray">${l.type}</${Pill}></${DrillCell}>` },
        { key: "entity", label: "Entity", sortValue: true, plain: (l) => l.entity,
          render: (l) => html`<${DrillCell} f=${f} fkey="entity" value=${l.entity} title="Filter by entity"><span class="tiny">${l.entity}</span></${DrillCell}>` },
        { key: "authority", label: "Authority", sortValue: true, plain: (l) => l.authority,
          render: (l) => html`<span class="tiny">${l.authority || "—"}</span>` },
        { key: "jurisdiction", label: "Region", sortValue: true, plain: (l) => l.jurisdiction,
          render: (l) => html`<${DrillCell} f=${f} fkey="region" value=${l.jurisdiction} title="Filter by region"><${Pill} tone="blue">${l.jurisdiction}</${Pill}></${DrillCell}>` },
        { key: "status", label: "Validity", sortValue: true, plain: (l) => licenseStatus(l).label,
          render: (l) => html`<${StatusPill} lic=${l} />` },
        { key: "expiryDate", label: "Countdown", sortAs: "date", sortValue: true, plain: (l) => l.expiryDate,
          render: (l) => html`<${Countdown} lic=${l} />` },
        { key: "issueDate", label: "Issued", sortAs: "date", sortValue: true, plain: (l) => l.issueDate,
          render: (l) => html`<span class="tiny muted">${l.issueDate ? fmt.dateShort(l.issueDate) : "—"}</span>` },
        { key: "owner", label: "Owner", sortValue: true, plain: (l) => nameOf(l.owner),
          render: (l) => html`<${Avatar} name=${nameOf(l.owner)} size="sm" /> ` },
      ]}
      views=${licenceSeedViews} searchKeys=${licenceSeedSearchKeys}
      searchPlaceholder="Search licenses, authorities, numbers…"
      noun=${["license", "licenses"]}
      onRow=${(l) => setOpenId(l.id)}
      exportName="licenses" emptyIcon="fileCheck"
      defaultSort=${{ key: "expiryDate", dir: "asc" }} />

    ${open && html`<${Drawer} title=${open.id} width=${480} onClose=${() => setOpenId(null)}
      footer=${html`<${Btn} variant="ghost" icon="download">Certificate</${Btn}><${Btn} variant="primary" icon="refresh" onClick=${() => setRenew(true)}>Mark renewed</${Btn}>`}>
      <div class="col" style="gap:18px;padding:20px">
        <div>
          <div class="row" style="gap:8px;margin-bottom:8px"><${Pill} tone="gray">${open.type}</${Pill}><${StatusPill} lic=${open} /><${Pill} tone="blue">${open.jurisdiction}</${Pill}></div>
          <div style="font-size:17px;font-weight:700;line-height:1.3">${open.name}</div>
          <div class="tiny muted" style="margin-top:3px">${open.authority} · ${open.licenseNumber}</div>
        </div>

        <div>
          <div class="tiny muted" style="margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Validity</div>
          ${(() => {
            const total = new Date(open.expiryDate) - new Date(open.issueDate);
            const done = Date.now() - new Date(open.issueDate);
            const pct = total > 0 ? Math.round((done / total) * 100) : 100;
            const s = licenseStatus(open);
            const tone = s.key === "Expired" ? "red" : s.key === "Valid" ? "green" : "amber";
            return html`<div class="row" style="gap:10px;margin-bottom:6px"><div style="flex:1"><${Progress} value=${Math.max(0, Math.min(100, pct))} tone=${tone} /></div><span class="tiny strong">${fmt.until(open.expiryDate)}</span></div>`;
          })()}
          <${Timeline} items=${[
            { title: "Issued", meta: fmt.date(open.issueDate), tone: "gray" },
            { title: "Today", meta: fmt.date(new Date()), tone: "" },
            { title: "Expires", meta: fmt.date(open.expiryDate), tone: licenseStatus(open).key === "Expired" ? "red" : "amber" },
          ]} />
        </div>

        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
          ${[["Entity", open.entity], ["Jurisdiction", open.jurisdiction], ["Issue date", fmt.date(open.issueDate)], ["Expiry date", fmt.date(open.expiryDate)], ["Renewal lead", (open.renewalLeadDays || 90) + " days"], ["Owner", nameOf(open.owner)]].map(([l, v]) => html`<div key=${l}><div class="tiny muted">${l}</div><div class="strong" style="font-size:13px;margin-top:2px">${v}</div></div>`)}
        </div>

        ${open.notes ? html`<div><div class="tiny muted" style="margin-bottom:4px;font-weight:600">Notes</div><div class="tiny" style="line-height:1.5">${open.notes}</div></div>` : ""}

        ${(open.companyTags || []).length ? html`<div><div class="tiny muted" style="margin-bottom:6px;font-weight:600">Company tags</div><${TagChips} ids=${open.companyTags} /></div>` : ""}

        ${(open.linkedMatterId || open.linkedContractId) ? html`<div><div class="tiny muted" style="margin-bottom:6px;font-weight:600">Linked records</div><div class="row wrap" style="gap:6px">
          ${open.linkedContractId && canOpenPath(activeUser(), "/contracts") ? html`<button class="tagchip" onClick=${() => navigate("/contracts/" + open.linkedContractId)}><${Icon} name="file" size=12 />${open.linkedContractId}</button>` : ""}
          ${open.linkedMatterId ? html`<button class="tagchip" onClick=${() => navigate("/matters/" + open.linkedMatterId)}><${Icon} name="folder" size=12 />${open.linkedMatterId}</button>` : ""}
        </div></div>` : ""}

        <div>
          <div class="tiny muted" style="margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Renewal history</div>
          ${(open.renewalHistory || []).length ? html`<${Timeline} items=${[...open.renewalHistory].reverse().map((h) => ({ title: h.action, meta: nameOf(h.by) + " · " + fmt.date(h.date), tone: "" }))} />`
            : html`<div class="tiny muted">No renewals recorded yet.</div>`}
        </div>
      </div>
    </${Drawer}>`}

    ${renew && open && html`<${MarkRenewedModal} lic=${open} onClose=${() => setRenew(false)} />`}
  </div>`;
}
