// Licenses & Registrations (Feature 1) — auto validity status + renewals.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Tabs, Chip, Drawer, Modal, Field, Input, Progress, Timeline, AICard } from "../ui.js";
import { PageHead, Toolbar, DataTable, StatStrip } from "../parts.js";
import { TagChips, FilterBar, useFilters, applyFilters } from "../shared.js";
import { navigate } from "../router.js";
import { licenseStatus, nameOf, entityName } from "../data.js";
import { useCollection, updateItem, nowIso } from "../store.js";

const JURIS = ["KSA", "UAE", "PK"];

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
  const licenses = useCollection("licenses");
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState(null);
  const { filters, patch, toggle, clear } = useFilters("licenses", { sortBy: "expiry", sortDir: "asc" });
  const [renew, setRenew] = useState(false);
  const open = licenses.find((l) => l.id === openId);

  const inTab = (l) => {
    const k = licenseStatus(l).key;
    if (tab === "all") return true;
    if (tab === "Valid") return k === "Valid";
    if (tab === "Expiring") return k === "Expiring" || k === "Critical";
    if (tab === "Expired") return k === "Expired";
    return true;
  };
  const rows = applyFilters(licenses.filter(inTab), filters, {
    searchKeys: ["name", "authority", "entity", "licenseNumber", "type", "id", "notes"],
  });
  const countKey = (k) => licenses.filter((l) => licenseStatus(l).key === k).length;

  const tabs = [
    { key: "all", label: "All", count: licenses.length },
    { key: "Valid", label: "Valid", count: countKey("Valid") },
    { key: "Expiring", label: "Expiring", count: countKey("Expiring") + countKey("Critical") },
    { key: "Expired", label: "Expired", count: countKey("Expired") },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Licenses & Registrations" sub="Every regulatory license and registration — validity computed automatically, with renewal alerts before they lapse."
      actions=${html`<${Btn} variant="primary" icon="plus">Add license</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: licenses.length, label: "Total licenses" },
      { value: countKey("Expiring") + countKey("Critical"), label: "Expiring ≤90 days", trend: "!", trendDir: "up" },
      { value: countKey("Critical"), label: "Critical (≤30 days)" },
      { value: countKey("Expired"), label: "Expired", trend: countKey("Expired") ? "▲" : undefined, trendDir: "up" },
    ]} />
    <div style="margin-bottom:14px"><${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} /></div>
    <${FilterBar} module="licenses" filters=${filters} onPatch=${patch} onToggle=${toggle} onClear=${clear}
      dims=${["entities", "subdivisions", "owners"]} rows=${licenses}
      dateFields=${[{ key: "expiryDate", label: "Expiry" }, { key: "issueDate", label: "Issue date" }]}
      placeholder="Search licenses, authorities, numbers…"
      right=${html`<span class="tiny muted">${rows.length} of ${licenses.length}</span>`} />

    <${DataTable} onRow=${(l) => setOpenId(l.id)} columns=${[
      { key: "id", label: "ID", mono: true, width: "84px" },
      { key: "name", label: "License", render: (l) => html`<div class="cell-strong">${l.name}</div><div class="tiny muted">${l.authority}</div>` },
      { key: "type", label: "Type", render: (l) => html`<${Pill} tone="gray">${l.type}</${Pill}>` },
      { key: "entity", label: "Entity" },
      { key: "jurisdiction", label: "Region", render: (l) => html`<${Pill} tone="blue">${l.jurisdiction}</${Pill}>` },
      { key: "status", label: "Validity", render: (l) => html`<${StatusPill} lic=${l} />` },
      { key: "expiryDate", label: "Countdown", render: (l) => html`<${Countdown} lic=${l} />` },
      { key: "owner", label: "Owner", render: (l) => html`<${Avatar} name=${nameOf(l.owner)} size="sm" />` },
    ]} rows=${rows} empty=${html`<div class="empty"><${Icon} name="fileCheck" size=36 /><div>No licenses match these filters.</div></div>`} />

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
          ${open.linkedContractId ? html`<button class="tagchip" onClick=${() => navigate("/contracts/" + open.linkedContractId)}><${Icon} name="file" size=12 />${open.linkedContractId}</button>` : ""}
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
