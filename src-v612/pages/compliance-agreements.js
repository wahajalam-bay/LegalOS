// Lease Agreements and Spend Agreements.
//
// These were one combined "Lease, Loan & Service" register. They are now three
// separate modules, and the split is read from the source: the spend-contract
// trackers carry an explicit "Agreement Type" column, so a lease is a lease
// because the tracker says so, not because its title contains the word.
//
// Leases and services share this file because they share a LIFECYCLE
// (amendment / renewal / novation / termination, then draft -> review ->
// finalize -> signature -> executed -> Drive). They do NOT share a field set:
// a lease has a landlord and a rent, a service agreement has a provider and a
// scope, and neither has a principal or an SBP position.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Modal, Field, Input, Textarea, Section, Pill, Status, Empty, AICard } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { RegisterShell, RegisterTabs } from "../register.js";
import { useFilterLink } from "../filters.js";
import { navigate, useQuery } from "../router.js";
import { openRecord, registerReturnPath, useRecordTab } from "../compliancenav.js";
import { LegalDocuments } from "../legaldocuments.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { useLeases, useServices, useAgreement } from "../compliancedata.js";
import {
  leaseFields, leaseColumns, leaseViews, leaseSearchKeys,
  serviceFields, serviceColumns, serviceViews, serviceSearchKeys,
} from "../compliancedefs.js";
import { ActionPanel, UnifiedTimeline, FieldGrid, Select } from "../complianceui.js";
import { isActiveStatus } from "../compliancemodules.js";

const money = (v, ccy) => (v == null || v === "" ? "—" : (ccy ? ccy + " " : "") + Number(v).toLocaleString());
const dash = (v) => (v == null || v === "" ? "—" : v);
const today = () => new Date().toISOString().slice(0, 10);

const KIND = {
  lease: {
    noun: ["lease", "leases"], ns: "lease", tabId: "leases", icon: "building",
    label: "Lease agreements", route: "lease", base: "/compliance/leases",
    fields: leaseFields, columns: leaseColumns, views: leaseViews, searchKeys: leaseSearchKeys,
    placeholder: "Search leases, landlords, properties…",
    actions: ["amendment", "renewal", "novation", "termination"],
    counterpartyLabel: "Landlord",
  },
  service: {
    noun: ["spend agreement", "spend agreements"], ns: "svc", tabId: "services", icon: "settings",
    label: "Spend agreements", route: "service", base: "/compliance/services",
    fields: serviceFields, columns: serviceColumns, views: serviceViews, searchKeys: serviceSearchKeys,
    placeholder: "Search spend agreements, providers, agreement types…",
    actions: ["amendment", "renewal", "termination", "novation"],
    counterpartyLabel: "Service provider",
  },
};

/* ================================================================ REGISTER */

export function AgreementRegister({ kind, config }) {
  const K = KIND[kind];
  const lease = useLeases();
  const service = useServices();
  const src = kind === "lease" ? lease : service;
  const drill = useFilterLink(K.ns);
  const rows = (src.data && (kind === "lease" ? src.data.leases : src.data.services)) || [];

  const counts = useMemo(() => {
    const t = today();
    const c = { active: 0, expiring: 0, expired: 0, closed: 0 };
    const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    for (const r of rows) {
      if (isActiveStatus(r.status)) c.active++;
      if (/inactive|terminat|ceased/i.test(r.status || "")) c.closed++;
      if (r.end && r.end < t) c.expired++;
      else if (r.end && r.end <= in90) c.expiring++;
    }
    return c;
  }, [rows]);

  const anyFilter = K.fields.some((f) => drill.active(f.key).length > 0) || drill.active("q").length > 0;

  if (src.error) return html`<div class="empty" style="padding:34px"><${Icon} name="alertTriangle" size=32 />
    <div>${src.error.message || "This register could not be read."}</div></div>`;
  if (src.loading && !rows.length) return html`<div class="tiny muted" style="padding:20px 2px">Reading ${K.label.toLowerCase()}…</div>`;

  const summary = html`<div class="regsum">
    <div class="regsum__i"><span class="regsum__v">${rows.length}</span><span class="regsum__l">${K.label}</span></div>
    ${src.data && src.data.classified && html`<div class="regsum__i">
      <span class="regsum__v">${src.data.classified.leases + src.data.classified.services + src.data.classified.other}</span>
      <span class="regsum__l">Spend contracts classified by the tracker's own Agreement Type</span></div>`}
  </div>`;

  return html`<div>
    <${StatStrip} stats=${[
      { value: rows.length, label: K.label, active: !anyFilter,
        onClick: () => drill.clearAll(K.fields),
        title: anyFilter ? "Clear every filter" : "Showing everything" },
      { value: counts.active, label: "Active", onClick: () => drill.set("status", ["Active"]) },
      { value: counts.expiring, label: "Expiring ≤ 90 days", tone: counts.expiring ? "amber" : "",
        onClick: () => drill.set("expiry", ["d90"]) },
      { value: counts.expired, label: "Expired", tone: counts.expired ? "red" : "",
        onClick: () => drill.set("expiry", ["overdue"]) },
      { value: counts.closed, label: "Terminated / inactive", onClick: () => drill.set("status", ["Inactive"]) },
    ]} />

    <${RegisterShell}
      tabId=${K.tabId} ns=${K.ns} rows=${rows}
      fields=${K.fields}
      columns=${(f) => K.columns(f, {
        onOpen: (r) => openRecord(K.base + "/" + encodeURIComponent(r.id), { tab: "documents" }) })}
      views=${K.views} searchKeys=${K.searchKeys}
      searchPlaceholder=${K.placeholder}
      noun=${K.noun}
      onRow=${(r) => openRecord(K.base + "/" + encodeURIComponent(r.id))}
      exportName=${kind === "lease" ? "lease-agreements" : "service-agreements"} emptyIcon=${K.icon}
      defaultSort=${{ key: "end", dir: "asc" }}
      summary=${summary} />
  </div>`;
}

/* ================================================================== DETAIL */

export function AgreementDetail({ kind, id, config }) {
  const K = KIND[kind];
  const { data, loading, error, reload } = useAgreement(kind, id);
  const [action, setAction] = useState(null);
  const [openRec, setOpenRec] = useState(null);
  const [query, patchQ] = useQuery();
  const [tab, setTab] = useRecordTab("overview", query, patchQ);
  const caps = (config && config.capabilities) || {};

  if (error) return html`<div class="page page--wide"><${Empty} icon="alertTriangle" title="Agreement not found"
    text=${error.message || "This record could not be read."}
    action=${html`<${Btn} variant="primary" onClick=${() => navigate(K.base)}>Back to ${K.label.toLowerCase()}</${Btn}>`} /></div>`;
  if (loading || !data) return html`<div class="page page--wide"><div class="tiny muted" style="padding:20px">Reading the agreement…</div></div>`;

  const a = data.agreement;
  const docs = (a.driveFiles || []).concat(a.extraDocuments || []);
  const canAct = caps["compliance.create"];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Documents", count: docs.length },
    { id: "timeline", label: "Timeline", count: (a.timeline || []).length },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${a.title || a.id}
      sub=${[a.agreementType, a.entity, a.counterparty && K.counterpartyLabel + ": " + a.counterparty].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate(registerReturnPath({ path: K.base }, query))}>${K.label}</${Btn}>
        ${canAct && K.actions.map((k) => html`<${Btn} key=${k} variant=${k === "renewal" ? "primary" : "ghost"}
          icon=${k === "renewal" ? "refresh" : k === "termination" ? "x" : "edit"}
          onClick=${() => setAction(k)}>+ ${k.replace(/^\w/, (m) => m.toUpperCase())}</${Btn}>`)}` } />

    <${StatStrip} stats=${[
      { value: a.value != null ? money(a.value, "PKR") : dash(a.valueText), label: kind === "lease" ? "Rent / value" : "Contract value" },
      { value: a.start ? fmt.date(a.start) : "—", label: "Start date" },
      { value: a.end ? fmt.date(a.end) : dash(a.endText), label: "Expiry" },
      { value: (a.children || []).length, label: "Legal actions" },
      { value: dash(a.status), label: "Status" },
    ]} />

    ${/* The shared tab strip. The hand-rolled copies that used to be here
          looked identical and behaved differently: no roving tabindex, so Tab
          walked through every tab rather than the selected one, and no arrow
          keys, so a keyboard user could not move between tabs at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Agreement record" />

    ${tab === "overview" && html`<div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <${Section} title="Agreement" icon="file">
          <${FieldGrid} rows=${[
            ["Record", a.id],
            ["Title", dash(a.title)],
            ["Agreement type", dash(a.agreementType)],
            ["Entity", dash(a.entity)],
            [K.counterpartyLabel, dash(a.counterparty)],
            ["Physical file no.", dash(a.fileNo)],
            ["Department", dash(a.department)],
            ["City / region", dash([a.city, a.region].filter(Boolean).join(" / "))],
          ]} />
        </${Section}>
        <${Section} title="Current terms" icon="activity">
          <${FieldGrid} rows=${[
            ["Status", dash(a.status)],
            ["Start date", a.start ? fmt.date(a.start) : "—"],
            /* An impossible expiry is SHOWN as the tracker recorded it, and
               labelled, rather than silently formatted into a confident date
               and a countdown. One lease records 31 Dec 1931 against a 2022
               start; "34599d overdue" was arithmetic on a typo. */
            ["Expiry", a.dateAnomaly
              ? html`<span>${a.endSource ? fmt.date(a.endSource) : dash(a.endText)}
                  <${Pill} tone="amber">source date is not usable</${Pill}></span>`
              : (a.end ? fmt.date(a.end) : dash(a.endText))],
            ["Time to expiry", a.dateAnomaly
              ? html`<span class="tiny muted">Not calculated — the recorded end date is before the start date</span>`
              : (a.end ? fmt.until(a.end) : "\u2014")],
            [kind === "lease" ? "Rent / contract value" : "Contract value",
              a.value != null ? money(a.value, "PKR") : dash(a.valueText)],
            ["Ongoing", a.ongoing ? "Yes — no end date recorded" : "No"],
          ]} />
        </${Section}>
      </div>

      ${(a.children || []).length > 0 && html`<${Section} title=${"Legal actions (" + a.children.length + ")"} icon="gitBranch">
        <div class="col" style="gap:0">
          ${a.children.map((c) => html`<button key=${c.id} type="button" class="feed__item clickable" style="text-align:left;width:100%"
            onClick=${() => setOpenRec(c.id)}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <span class="cell-mono tiny" style="width:104px;flex:none">${c.id}</span>
              <div style="flex:1;min-width:0">
                <div class="tiny strong">${(c.subtype || "action").replace(/^\w/, (m) => m.toUpperCase())}</div>
                <div class="tiny muted">${c.createdBy ? c.createdBy.name : ""} · ${fmt.date(c.createdAt)}</div></div>
              <${Status} value=${c.statusLabel} />
              ${c.documents ? html`<${Pill} tone="indigo">${c.documents} doc${c.documents === 1 ? "" : "s"}</${Pill}>` : ""}
            </div></button>`)}
        </div>
      </${Section}>`}

      <${Section} title="Source" icon="folder">
        <${FieldGrid} rows=${[
          ["Tracker file", (a.__source && a.__source.file) || "—"],
          ["Tracker sheet", (a.__source && a.__source.sheet) || "—"],
          ["Drive folder", (a.__source && a.__source.folder) || "—"],
        ]} />
      </${Section}>
    </div>`}

    ${tab === "documents" && html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip"
      sub="Read them here. Google Drive remains the source of truth \u2014 LegalOS never alters a file.">
      ${docs.length === 0
        ? html`<${Empty} icon="paperclip"
            title=${a.documentsRestricted ? "No documents you can open" : "No documents"}
            text=${a.documentsRestricted
              ? "No Compliance-accessible documents are available for this record."
              : "No documents are currently linked to this record."} />`
        : html`<${LegalDocuments} files=${docs} recordType="contract" />`}
    </${Section}>`}

    ${tab === "timeline" && html`<${Section} title="Lifecycle" icon="activity"
      sub="Source dates and LegalOS actions in one chronology.">
      <${UnifiedTimeline} items=${a.timeline || []} onOpenRecord=${(rid) => setOpenRec(rid)}
        onOpenDoc=${(f) => f && f.id && navigate("/compliance/document/" + encodeURIComponent(f.id))} />
    </${Section}>`}

    ${action && html`<${AgreementActionModal} agreement=${a} kind=${kind} actionType=${action}
      onClose=${() => setAction(null)} onDone=${(rec) => { setAction(null); reload(); setOpenRec(rec.id); }} />`}
    ${openRec && html`<${ActionPanel} recordId=${openRec} caps=${caps} config=${config}
      onClose=${() => setOpenRec(null)} onChanged=${reload} />`}
  </div>`;
}

/* ================================================================= ACTIONS */

export function AgreementActionModal({ agreement, kind, actionType, onClose, onDone }) {
  const K = KIND[kind];
  const [f, setF] = useState({
    actionType: actionType.replace(/^\w/, (m) => m.toUpperCase()),
    effectiveDate: today(),
    revisedExpiry: "",
    revisedRent: "",
    revisedValue: "",
    revisedTerm: "",
    revisedScope: "",
    newLandlord: "",
    newTenant: "",
    newProvider: "",
    terminationDate: actionType === "termination" ? today() : "",
    reason: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const go = async () => {
    setBusy(true);
    try {
      const call = kind === "lease" ? api.compliance.leaseAction : api.compliance.serviceAction;
      const r = await call(agreement.id, { subtype: actionType, fields: f });
      toast(actionType.replace(/^\w/, (m) => m.toUpperCase()) + " created as " + r.record.id + ".", "success");
      onDone(r.record);
    } catch (e) { toast(e.message || "The action could not be created.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title=${"New " + actionType} icon="edit" width=${660} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${go}>Create ${actionType}</${Btn}>`}>
    <div class="col" style="gap:14px">
      <${Section} title="Existing agreement" icon="info" sub="Carried over automatically.">
        <${FieldGrid} rows=${[
          ["Entity", dash(agreement.entity)],
          [K.counterpartyLabel, dash(agreement.counterparty)],
          ["Agreement type", dash(agreement.agreementType)],
          ["Start date", agreement.start ? fmt.date(agreement.start) : "—"],
          ["Current expiry", agreement.end ? fmt.date(agreement.end) : dash(agreement.endText)],
          [kind === "lease" ? "Current rent / value" : "Current value",
            agreement.value != null ? money(agreement.value, "PKR") : dash(agreement.valueText)],
        ]} />
      </${Section}>

      <${Section} title="Revised terms" icon="edit">
        <div class="col" style="gap:10px">
          <${Field} label="Effective date"><${Input} type="date" value=${f.effectiveDate} onInput=${set("effectiveDate")} /></${Field}>
          ${actionType !== "termination" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
            <${Field} label="Revised expiry"><${Input} type="date" value=${f.revisedExpiry} onInput=${set("revisedExpiry")} /></${Field}>
            ${kind === "lease"
              ? html`<${Field} label="Revised rent"><${Input} type="number" value=${f.revisedRent} onInput=${set("revisedRent")} /></${Field}>`
              : html`<${Field} label="Revised value"><${Input} type="number" value=${f.revisedValue} onInput=${set("revisedValue")} /></${Field}>`}
            <${Field} label="Revised term"><${Input} value=${f.revisedTerm} onInput=${set("revisedTerm")} placeholder="e.g. 3 years" /></${Field}>
            ${kind === "service" && html`<${Field} label="Revised scope"><${Input} value=${f.revisedScope} onInput=${set("revisedScope")} /></${Field}>`}
          </div>`}
          ${actionType === "novation" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
            ${kind === "lease" ? html`
              <${Field} label="New landlord"><${Input} value=${f.newLandlord} onInput=${set("newLandlord")} /></${Field}>
              <${Field} label="New tenant"><${Input} value=${f.newTenant} onInput=${set("newTenant")} /></${Field}>`
              : html`<${Field} label="New provider"><${Input} value=${f.newProvider} onInput=${set("newProvider")} /></${Field}>`}
          </div>`}
          ${actionType === "termination" && html`<${Field} label="Termination date">
            <${Input} type="date" value=${f.terminationDate} onInput=${set("terminationDate")} /></${Field}>`}
          <${Field} label="Reason"><${Input} value=${f.reason} onInput=${set("reason")} /></${Field}>
          <${Field} label="Notes"><${Textarea} rows=${3} value=${f.notes} onInput=${set("notes")} /></${Field}>
        </div>
      </${Section}>
    </div>
  </${Modal}>`;
}
