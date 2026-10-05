// Licences & Permits — actionable, not just a list.
//
// Every licence carries the renewal chain Drive already proves: the authority
// folders hold dated certificates, so "LCCI — Zameen Developments" with
// certificates from 2022, March 2026 and April 2026 IS a renewal history. Prior
// licence numbers and expiry dates are preserved as history; a renewal adds to
// the chain rather than overwriting what came before.
//
// Portal automation is NOT configured — no credential vault exists, so LegalOS
// holds no authority credentials and performs no automated portal access. The
// application workflow is fully built around that boundary: everything that does
// not need the external secret works.
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
import { useLicences, useLicence, useEntities } from "../compliancedata.js";
import { licenceFields2, licenceColumns2, licenceViews2, licenceSearchKeys2, renewalState } from "../compliancedefs.js";
import { ActionPanel, UnifiedTimeline, FieldGrid, Select } from "../complianceui.js";
import { isActiveStatus } from "../compliancemodules.js";

const dash = (v) => (v == null || v === "" ? "—" : v);
const today = () => new Date().toISOString().slice(0, 10);

/* ================================================================ REGISTER */

export function LicenceRegister({ config }) {
  const { data, loading, error, reload } = useLicences();
  const entities = useEntities();
  const drill = useFilterLink("lic");
  const [newApp, setNewApp] = useState(false);
  const rows = (data && data.licences) || [];
  const caps = (config && config.capabilities) || {};

  const counts = useMemo(() => {
    const t = today();
    const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const c = { active: 0, expiring: 0, expired: 0, renewing: 0 };
    for (const r of rows) {
      if (isActiveStatus(r.status)) c.active++;
      if (r.expiry && r.expiry < t) c.expired++;
      else if (r.expiry && r.expiry <= in90) c.expiring++;
      if (renewalState(r) === "In progress") c.renewing++;
    }
    return c;
  }, [rows]);

  const anyFilter = licenceFields2.some((f) => drill.active(f.key).length > 0) || drill.active("q").length > 0;

  if (error) return html`<div class="empty" style="padding:34px"><${Icon} name="alertTriangle" size=32 />
    <div>${error.message || "The licence register could not be read."}</div></div>`;
  if (loading && !rows.length) return html`<div class="tiny muted" style="padding:20px 2px">Reading the licence register…</div>`;

  const summary = html`<div class="regsum">
    <div class="regsum__i"><span class="regsum__v">${rows.length}</span><span class="regsum__l">Licences & permits</span></div>
    <div class="regsum__i"><span class="regsum__v">${rows.reduce((n, l) => n + (l.renewalsOnFile || 0), 0)}</span>
      <span class="regsum__l">Renewals evidenced in Drive</span></div>
    ${data.driveOnlyLicences > 0 && html`<div class="regsum__i"><span class="regsum__v">${data.driveOnlyLicences}</span>
      <span class="regsum__l">Found in Drive with no tracker row</span></div>`}
  </div>`;

  return html`<div>
    <${StatStrip} stats=${[
      { value: rows.length, label: "Licences & permits", active: !anyFilter,
        onClick: () => drill.clearAll(licenceFields2),
        title: anyFilter ? "Clear every filter" : "Showing all licences" },
      { value: counts.active, label: "Active", onClick: () => drill.set("status", ["Active"]) },
      { value: counts.expiring, label: "Expiring ≤ 90 days", tone: counts.expiring ? "amber" : "",
        onClick: () => drill.set("expiry", ["d90"]) },
      { value: counts.expired, label: "Expired", tone: counts.expired ? "red" : "",
        onClick: () => drill.set("expiry", ["overdue"]) },
      { value: counts.renewing, label: "Renewal application pending",
        onClick: () => drill.set("renewal", ["In progress"]) },
    ]} />

    <div class="row" style="gap:8px;margin-bottom:10px">
      <div class="spacer"></div>
      ${caps["compliance.licence.create"] && html`<${Btn} variant="primary" size="sm" icon="plus"
        onClick=${() => setNewApp(true)}>Apply for new licence</${Btn}>`}
    </div>

    <${RegisterShell}
      tabId="licences" ns="lic" rows=${rows}
      fields=${licenceFields2}
      columns=${(f) => licenceColumns2(f, {
        onOpen: (r) => openRecord("/compliance/licenses/" + encodeURIComponent(r.id), { tab: "documents" }) })}
      views=${licenceViews2} searchKeys=${licenceSearchKeys2}
      searchPlaceholder="Search licences, authorities, entities…"
      noun=${["licence", "licences"]}
      onRow=${(r) => openRecord("/compliance/licenses/" + encodeURIComponent(r.id))}
      exportName="licences" emptyIcon="shield"
      defaultSort=${{ key: "expiry", dir: "asc" }}
      summary=${summary} />

    ${newApp && html`<${NewLicenceModal} config=${config}
      entities=${(entities.data && entities.data.entities) || []}
      onClose=${() => setNewApp(false)}
      onDone=${() => { setNewApp(false); reload(); }} />`}
  </div>`;
}

/* ================================================================== DETAIL */

/* EDITING A DRIVE-DERIVED LICENCE.
   Only the fields the server accepts are offered; anything describing where
   the record CAME FROM -- file ids, folder paths, the source row -- is not
   editable, because that is lineage and not an opinion. Leaving a field blank
   clears the correction and the source value returns. */
const LICENCE_EDIT_FIELDS = [
  ["number", "Licence number", "text"],
  ["authority", "Licensing authority", "text"],
  ["entity", "Entity", "text"],
  ["issued", "Issue date", "date"],
  ["expiry", "Expiry date", "date"],
  ["status", "Status", "text"],
  ["owner", "Owner / contact", "text"],
  ["renewalStatus", "Renewal application status", "text"],
  ["notes", "Notes", "text"],
];

function LicenceEdit({ l, draft, setDraft, err, reason, setReason, saving, onSave }) {
  const val = (k) => (draft[k] !== undefined ? draft[k] : (l[k] == null ? "" : String(l[k])));
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  return html`<div class="col" style="gap:10px">
    <div class="tiny muted">
      Corrections are stored in LegalOS and shown in place of the source value.
      <strong>Google Drive is never modified.</strong> Clear a field to fall back to what the source says.
    </div>
    <div class="modeditgrid">
      ${LICENCE_EDIT_FIELDS.map(([k, label, type]) => html`<${Field} key=${k} label=${label}>
        <input class="input" type=${type} value=${val(k)} onInput=${set(k)} id=${"lic-edit-" + k} />
        ${l.edited && l.edited[k] ? html`<div class="tiny muted">source: ${l.edited[k].from || "(blank)"}</div>` : null}
      </${Field}>`)}
    </div>
    <${Field} label="Why is this being corrected?"
      hint="Recorded with the change, so the next reader can tell a reissue from a typo">
      <input class="input" id="lic-edit-reason" value=${reason}
        onInput=${(e) => setReason(e.target.value)}
        placeholder="e.g. authority reissued the certificate; tracker had a typo" />
    </${Field}>
    ${err ? html`<div class="tiny" style="color:var(--danger)">${err}</div>` : null}
    <div class="row" style="gap:8px">
      <${Btn} variant="primary" onClick=${onSave} disabled=${saving}>${saving ? "Saving…" : "Save correction"}</${Btn}>
    </div>
  </div>`;
}

export function LicenceDetail({ id, config }) {
  const { data, loading, error, reload } = useLicence(id);
  const [renewing, setRenewing] = useState(false);
  const [openRec, setOpenRec] = useState(null);
  const [query, patchQ] = useQuery();
  const [tab, setTab] = useRecordTab("overview", query, patchQ);
  const caps = (config && config.capabilities) || {};
  const portal = (config && config.integrations && config.integrations.authorityPortals) || {};
  /* A correction is held by LegalOS and merged over the Drive-derived record;
     the source is never written to. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [editErr, setEditErr] = useState("");
  const [reason, setReason] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const saveEdit = async () => {
    setSavingEdit(true); setEditErr("");
    try {
      await api.compliance.editLicence(id, draft, reason);
      setEditing(false); setDraft({}); setReason("");
      reload();
    } catch (e) { setEditErr((e && e.message) || "Could not save the correction."); }
    setSavingEdit(false);
  };

  if (error) return html`<div class="page page--wide"><${Empty} icon="alertTriangle" title="Licence not found"
    text=${error.message || "This licence could not be read."}
    action=${html`<${Btn} variant="primary" onClick=${() => navigate("/compliance/licenses")}>Back to licences</${Btn}>`} /></div>`;
  if (loading || !data) return html`<div class="page page--wide"><div class="tiny muted" style="padding:20px">Reading the licence…</div></div>`;

  const l = data.licence;
  const docs = l.folderDocuments || l.driveFiles || [];
  const apps = l.applications || [];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "renewal", label: "Renewal", count: apps.length || null },
    { id: "documents", label: "Documents", count: docs.length },
    { id: "timeline", label: "Timeline", count: (l.timeline || []).length },
  ];

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${[l.authority, l.entity].filter(Boolean).join(" — ")}
      sub=${[l.number, l.status].filter(Boolean).join(" · ")}
      actions=${html`
        <${Btn} variant="ghost" icon="arrowLeft"
          onClick=${() => navigate(registerReturnPath({ path: "/compliance/licenses" }, query))}>Licences</${Btn}>
        ${caps["compliance.licence.renew"] && html`<${Btn} variant="primary" icon="refresh"
          onClick=${() => setRenewing(true)}>Apply for renewal</${Btn}>`}` } />

    <${StatStrip} stats=${[
      { value: dash(l.number), label: "Licence number" },
      { value: l.issued ? fmt.date(l.issued) : "—", label: "Issued" },
      { value: l.expiry ? fmt.date(l.expiry) : "—", label: "Expiry" },
      { value: l.renewalsOnFile || 0, label: "Renewals on file" },
      { value: apps.length, label: "Applications in LegalOS" },
    ]} />

    ${/* The shared tab strip. The hand-rolled copies that used to be here
          looked identical and behaved differently: no roving tabindex, so Tab
          walked through every tab rather than the selected one, and no arrow
          keys, so a keyboard user could not move between tabs at all. */ ""}
    <${RegisterTabs} tabs=${tabs} active=${tab} onChange=${setTab} ariaLabel="Licence record" />

    ${tab === "overview" && html`<div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <${Section} title="Current licence" icon="shield"
          actions=${caps["compliance.edit"] && html`<${Btn} size="sm" variant="ghost" icon=${editing ? "x" : "edit"}
            onClick=${() => { setEditing((v) => !v); setDraft({}); setEditErr(""); }}>${editing ? "Cancel" : "Edit"}</${Btn}>`}>
          ${editing
            ? html`<${LicenceEdit} l=${l} draft=${draft} setDraft=${setDraft} err=${editErr}
                reason=${reason} setReason=${setReason} saving=${savingEdit} onSave=${saveEdit} />`
            : html`<${FieldGrid} rows=${[
                ["Record", l.id],
                // "Licence / type" printed the authority a second time, so every
                // licence showed the same value twice. One row now.
                ["Entity", dash(l.entity)],
                ["Licensing authority", dash(l.authority)],
                ["Licence number", dash(l.number)],
                ["Issue date", l.issued ? fmt.date(l.issued) : "—"],
                ["Expiry date", l.expiry ? fmt.date(l.expiry) : "\u2014"],
                ["Time to expiry", l.expiry ? fmt.until(l.expiry) : "\u2014"],
                ["Status", dash(l.status)],
                ["Owner / contact", dash(l.owner)],
                ["Source", l.origin === "drive" ? "Drive only — no row in the licence summary workbook" : "Licence summary workbook"],
              ]} />`}
          ${!editing && l.edited && html`<div class="tiny muted" style="padding-top:8px">
            ${Object.entries(l.edited).map(([k, e]) => html`<div key=${k}>
              <strong>${k}</strong> corrected in LegalOS to "${e.to}" — the source says
              "${e.from == null || e.from === "" ? "(blank)" : e.from}" · ${e.by} · ${fmt.date(String(e.at).slice(0, 10))}${e.reason ? " · " + e.reason : ""}
            </div>`)}
            <div style="padding-top:4px">Google Drive is unchanged; corrections are held here.</div>
          </div>`}
        </${Section}>

        <${Section} title="Licence history" icon="activity"
          sub="Prior licence numbers and expiry dates are preserved, never overwritten.">
          ${(l.history || []).length === 0
            ? html`<div class="tiny muted">No prior certificates are evidenced in Drive for this licence.</div>`
            : html`<div class="col" style="gap:0">${l.history.map((h) => html`<a key=${h.sequence}
                class="feed__item clickable" style="align-items:center;text-decoration:none;color:inherit"
                href=${h.file.webViewLink} target="_blank" rel="noopener noreferrer">
                <div class="tiny muted" style="width:104px;flex:none">${h.date ? fmt.date(h.date) : "undated"}</div>
                <div style="flex:1;min-width:0"><div class="tiny strong">${h.label}</div>
                  <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.file.name}</div>
                  ${h.validUntilText && html`<div class="tiny muted">valid until ${h.validUntilText}</div>`}</div>
                ${h.quality === "INCOMPLETE_SOURCE" && html`<${Pill} tone="amber">Undated</${Pill}>`}
                <${Icon} name="externalLink" size=14 /></a>`)}</div>`}
        </${Section}>
      </div>

      <${Section} title="Portal" icon="globe" sub="Authority portal access">
        <div class="tiny" style="color:var(--warning-text)">${portal.label || "Portal automation — NOT CONFIGURED"}</div>
        <div class="tiny muted" style="margin-top:6px">${portal.reason ||
          "No credential vault is configured, so LegalOS holds no authority portal credentials and performs no automated portal access."}
          The application workflow below runs manually end to end; a connector can be added without changing it.</div>
      </${Section}>

      ${apps.length > 0 && html`<${Section} title=${"Applications (" + apps.length + ")"} icon="gitBranch">
        <div class="col" style="gap:0">
          ${apps.map((a) => html`<button key=${a.id} type="button" class="feed__item clickable" style="text-align:left;width:100%"
            onClick=${() => setOpenRec(a.id)}>
            <div class="row" style="gap:10px;align-items:center;width:100%">
              <span class="cell-mono tiny" style="width:104px;flex:none">${a.id}</span>
              <div style="flex:1;min-width:0">
                <div class="tiny strong">${a.subtype === "new" ? "New licence application" : "Renewal application"}
                  ${a.fields && a.fields.applicationReference ? " · " + a.fields.applicationReference : ""}</div>
                <div class="tiny muted">${a.createdBy ? a.createdBy.name : ""} · ${fmt.date(a.createdAt)}</div></div>
              <${Status} value=${a.statusLabel} />
              ${a.documents ? html`<${Pill} tone="indigo">${a.documents} doc${a.documents === 1 ? "" : "s"}</${Pill}>` : ""}
            </div></button>`)}
        </div>
      </${Section}>`}
    </div>`}

    ${tab === "renewal" && html`<${LicenceRenewal} licence=${l} apps=${apps} caps=${caps}
      onApply=${() => setRenewing(true)} onOpenRec=${setOpenRec} onChanged=${reload} />`}

    ${tab === "documents" && html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip"
      sub="Applications, certificates, authority notices and correspondence held in Drive \u2014 readable here.">
      ${docs.length === 0
        ? html`<${Empty} icon="paperclip"
            title=${l.documentsRestricted ? "No documents you can open" : "No documents"}
            text=${l.documentsRestricted
              ? "No Compliance-accessible documents are available for this licence."
              : "No documents are currently linked to this licence."} />`
        : html`<${LegalDocuments} files=${docs} recordType="licence" />`}
    </${Section}>`}

    ${tab === "timeline" && html`<${Section} title="Licence timeline" icon="activity"
      sub="The Drive-evidenced renewal chain and every LegalOS application, in one chronology.">
      <${UnifiedTimeline} items=${l.timeline || []}
        onOpenRecord=${(rid) => setOpenRec(rid)}
        onOpenDoc=${(f) => f && f.id && navigate("/compliance/document/" + encodeURIComponent(f.id))} />
    </${Section}>`}

    ${renewing && html`<${RenewalModal} licence=${l} config=${config}
      onClose=${() => setRenewing(false)}
      onDone=${(rec) => { setRenewing(false); reload(); setOpenRec(rec.id); }} />`}
    ${openRec && html`<${ActionPanel} recordId=${openRec} caps=${caps} config=${config}
      onClose=${() => setOpenRec(null)} onChanged=${reload} />`}
  </div>`;
}

/* ================================================================ RENEWAL */

/* THE RENEWAL LIFECYCLE, ON ONE PAGE.
   A licence renewal is not a single act -- it is applied for, drafted, reviewed,
   submitted to the authority, and then either granted or returned. Each stage
   was previously visible only by opening the underlying record, so the licence
   itself never showed where its renewal had got to.
   The stages below are the workflow's own; nothing here invents a status. */
const RENEWAL_STAGES = [
  ["DRAFT", "Draft", "Prepared in LegalOS, not yet reviewed"],
  ["LEGAL_REVIEW", "Legal review", "With Legal for checking"],
  ["FINALIZED", "Ready to submit", "Approved internally, ready for the authority"],
  ["SIGNATURE", "Submitted", "Lodged with the issuing authority"],
  ["EXECUTED", "Renewed", "Granted — a new licence period is in force"],
];
const STAGE_INDEX = (st) => Math.max(0, RENEWAL_STAGES.findIndex(([k]) => k === st));

function LicenceRenewal({ licence, apps, caps, onApply, onOpenRec, onChanged }) {
  const l = licence;
  const renewals = (apps || []).filter((a) => a.subtype !== "new");
  const expiry = l.expiry ? fmt.date(l.expiry) : "—";

  return html`<div class="col" style="gap:16px">
    <${Section} title="Renewal" icon="refresh"
      sub="Where this licence stands, and what has been applied for."
      actions=${caps["compliance.licence.renew"] && html`<${Btn} size="sm" variant="primary" icon="refresh"
        onClick=${onApply}>Apply for renewal</${Btn}>`}>
      <${FieldGrid} rows=${[
        ["Licensing authority", dash(l.authority)],
        ["Licence number", dash(l.number)],
        ["Current expiry", expiry],
        ["Renewals evidenced in Drive", String(l.renewalsOnFile || 0)],
        ["Applications in LegalOS", String(renewals.length)],
      ]} />
      ${renewals.length === 0 && html`<div class="tiny muted" style="padding-top:8px">
        No renewal has been applied for in LegalOS. The renewal chain above is what Drive already evidences.
      </div>`}
    </${Section}>

    ${renewals.map((a) => {
      const f = a.fields || {};
      const at = STAGE_INDEX(a.status);
      const returned = a.status === "CANCELLED";
      return html`<${Section} key=${a.id} title=${"Renewal application " + a.id} icon="gitBranch"
        sub=${f.applicationReference ? "Authority reference " + f.applicationReference : "No authority reference recorded yet"}
        actions=${html`<${Btn} size="sm" variant="ghost" icon="arrowRight"
          onClick=${() => onOpenRec(a.id)}>Open application</${Btn}>`}>
        ${returned
          ? html`<div class="banner banner--warn" style="align-items:flex-start;margin-bottom:10px">
              <${Icon} name="alertTriangle" size=15 />
              <div class="tiny"><strong>Returned or withdrawn.</strong> The licence keeps its existing period;
                nothing about the current instrument has changed.</div></div>`
          : html`<div class="row" style="gap:0;flex-wrap:wrap;margin-bottom:12px">
              ${RENEWAL_STAGES.map(([k, label, note], i) => html`<div key=${k}
                style=${"flex:1;min-width:120px;padding:8px 10px;border-top:3px solid " +
                  (i <= at ? "var(--brand)" : "var(--border)")}>
                <div class=${"tiny " + (i <= at ? "strong" : "muted")}>${label}</div>
                <div class="tiny muted">${i === at ? note : ""}</div>
              </div>`)}
            </div>`}

        <${FieldGrid} rows=${[
          ["Stage", a.statusLabel || a.status],
          ["Applied on", f.applicationStart ? fmt.date(f.applicationStart) : "—"],
          ["Submitted to authority", f.submissionDate ? fmt.date(f.submissionDate) : "Not yet submitted"],
          ["Decision", f.decisionDate ? fmt.date(f.decisionDate) : "Awaiting the authority"],
          ["Licence being renewed", dash(f.currentLicenceNumber || l.number)],
          ["Expiry being renewed", f.currentExpiry ? fmt.date(f.currentExpiry) : expiry],
          ["New licence number", dash(f.renewedLicenceNumber)],
          ["New issue date", f.newIssueDate ? fmt.date(f.newIssueDate) : "—"],
          ["New expiry date", f.newExpiryDate ? fmt.date(f.newExpiryDate) : "—"],
          ["Authority portal status", dash(f.portalStatus)],
          ["Notes", dash(f.notes)],
        ]} />

        ${a.status === "EXECUTED" && html`<div class="tiny muted" style="padding-top:8px">
          The previous licence period and its documents are kept — a renewal adds to the chain
          rather than replacing what came before.
        </div>`}
      </${Section}>`;
    })}
  </div>`;
}

export function RenewalModal({ licence, config, onClose, onDone }) {
  const cfg = (config && config.licences) || {};
  const [f, setF] = useState({
    licenceType: licence.authority || "",
    authority: licence.authority || "",
    currentLicenceNumber: licence.number || "",
    currentExpiry: licence.expiry ? String(licence.expiry).slice(0, 10) : "",
    applicationStart: today(),
    applicationReference: "",
    requiredDate: "",
    portalStatus: (cfg.applicationStatuses && cfg.applicationStatuses[0]) || "Draft",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.licenceRenewal(licence.id, { fields: f });
      toast("Renewal application " + r.record.id + " created.", "success");
      onDone(r.record);
    } catch (e) { toast(e.message || "The renewal could not be created.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="Apply for renewal" icon="refresh" width=${660} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${go}>Create renewal application</${Btn}>`}>
    <div class="col" style="gap:14px">
      <${Section} title="Existing licence" icon="info" sub="Carried over automatically.">
        <${FieldGrid} rows=${[
          ["Entity", dash(licence.entity)],
          ["Authority", dash(licence.authority)],
          ["Current licence number", dash(licence.number)],
          ["Current expiry", licence.expiry ? fmt.date(licence.expiry) : "—"],
          ["Renewals already on file", String(licence.renewalsOnFile || 0)],
        ]} />
      </${Section}>

      <${Section} title="Application" icon="edit">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <${Field} label="Application start"><${Input} type="date" value=${f.applicationStart} onInput=${set("applicationStart")} /></${Field}>
          <${Field} label="Required by"><${Input} type="date" value=${f.requiredDate} onInput=${set("requiredDate")} /></${Field}>
          <${Field} label="Application reference" hint="From the authority, once issued.">
            <${Input} value=${f.applicationReference} onInput=${set("applicationReference")} /></${Field}>
          <${Field} label="Status">
            <${Select} value=${f.portalStatus} onChange=${(v) => setF({ ...f, portalStatus: v })}
              options=${cfg.applicationStatuses || ["Draft", "Submitted", "Under review", "Approved"]} /></${Field}>
        </div>
        <${Field} label="Notes"><${Textarea} rows=${3} value=${f.notes} onInput=${set("notes")} /></${Field}>
      </${Section}>

      <${AICard} title="Requirements">
        LegalOS lists what THIS application is still missing — the fields and documents its own form asks
        for. It does not assert the authority's requirements, because no portal integration is configured
        to read them. Status is updated manually, and nothing here claims automatic synchronisation.
      </${AICard}>
    </div>
  </${Modal}>`;
}

/* ========================================================== NEW APPLICATION */

export function NewLicenceModal({ config, entities, onClose, onDone }) {
  const cfg = (config && config.licences) || {};
  const [entityKey, setEntityKey] = useState("");
  const [f, setF] = useState({
    licenceType: "", authority: "", purpose: "", jurisdiction: "",
    requiredDate: "", applicationStart: today(),
    portalStatus: (cfg.applicationStatuses && cfg.applicationStatuses[0]) || "Draft", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const ent = entities.find((e) => e.key === entityKey);

  const go = async () => {
    setBusy(true);
    try {
      const r = await api.compliance.newLicence({ entityKey, entity: ent ? ent.name : "", fields: f });
      toast("Licence application " + r.record.id + " created.", "success");
      onDone(r.record);
    } catch (e) { toast(e.message || "The application could not be created.", "error"); }
    finally { setBusy(false); }
  };

  return html`<${Modal} title="Apply for a new licence" icon="plus" width=${660} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy || !entityKey || !f.authority.trim()} onClick=${go}>Create application</${Btn}>`}>
    <div class="col" style="gap:12px">
      <${Field} label="Entity">
        <${Select} value=${entityKey} onChange=${setEntityKey} placeholder="— Select an entity —"
          options=${entities.map((e) => ({ value: e.key, label: e.name }))} />
      </${Field}>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <${Field} label="Licence type"><${Input} value=${f.licenceType} onInput=${set("licenceType")} /></${Field}>
        <${Field} label="Licensing authority"><${Input} value=${f.authority} onInput=${set("authority")} placeholder="PSEB, PEC, LCCI, SECP…" /></${Field}>
        <${Field} label="Jurisdiction"><${Input} value=${f.jurisdiction} onInput=${set("jurisdiction")} /></${Field}>
        <${Field} label="Required by"><${Input} type="date" value=${f.requiredDate} onInput=${set("requiredDate")} /></${Field}>
      </div>
      <${Field} label="Purpose"><${Textarea} rows=${3} value=${f.purpose} onInput=${set("purpose")} /></${Field}>
      <${Field} label="Notes"><${Textarea} rows=${2} value=${f.notes} onInput=${set("notes")} /></${Field}>
    </div>
  </${Modal}>`;
}
