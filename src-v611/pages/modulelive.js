// Live module pages — the /m/* module tiles, populated from the real registers.
// Each is a proper full page: header, KPI strip, search + status filters, a
// sortable table, and every row opens the full-screen Record 360. Module keys
// with no register home fall through to the workflow ModulePage.
import { html, cx, fmt, useState, Fragment } from "../core.js";
import { IntakeDesk } from "../intakedesk.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Chip, Input, Modal, Field, DateInput } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { navigate } from "../router.js";
import { useRegister, invalidateRegister } from "../live.js";
import { RaiseCase } from "../raisecase.js";
import { api } from "../api.js";
import { toast } from "../toast.js";
import { NoticesRegister } from "../noticesregister.js";

// Where a row opens: contracts keep their rich workspace; everything else uses
// the shared full-page RecordWorkspace at /rec/<kind>/<id>.
const recordRoute = (kind, id) => (kind === "contract" ? "/contracts/" + id : "/rec/" + kind + "/" + id);

// key → { title, sub, reg (register), kind (Record360 kind), filter, sort }
const CFG = {
  contracts: { title: "Contract Review", sub: "The commercial contract book — open any contract for the full 360.", reg: "contracts", kind: "contract" },
  vetting: { title: "Risk Analysis", sub: "Contracts flagged higher-risk for review.", reg: "contracts", kind: "contract", filter: (c) => /high|critical/i.test(c.risk || "") },
  agreements: { title: "Lease, Loan & Service", sub: "Loan and financing agreements from the compliance registers.", reg: "loans", kind: "loan" },
  resolutions: { title: "Resolutions", sub: "Board resolutions across every group entity.", reg: "resolutions", kind: "resolution" },
  licenses: { title: "License Renewals", sub: "Licences and permits with renewal countdown.", reg: "licences", kind: "licence", sort: "expiry" },
  notices: { title: "Notices", sub: "Legal notices sent and received.", reg: "notices", kind: "notice" },
  cases: { title: "Case Handling", sub: "Every litigation matter across the group.", reg: "litigation", kind: "litigation" },
  /* A case RAISED from one of these modules belongs to it, full stop.
     These filters read the case's prose, which is right for the thousands of
     tracker rows that carry no module of their own -- but a case raised here
     with a name that does not happen to say "trademark" would have been saved
     correctly and then been missing from the module it was raised in. The
     explicit key wins; the prose match stays for everything from Drive. */
  /* IP PORTFOLIO IS NOT A SLICE OF THE CASE REGISTER.
     It was filtered to litigation matters whose text mentioned IP, which is a
     list of infringement CASES -- a different thing from the trademark estate,
     and it left the actual 57-mark tracker in Drive unread. It renders from
     that tracker instead (src/pages/ipportfolio.js). */
  developerDisputes: { title: "Developer Disputes", sub: "Property, possession and developer-related disputes.", reg: "litigation", kind: "litigation", filter: (c) => c.moduleKey === "developerDisputes" || (!c.moduleKey && /develop|possession|handover|refund|booking|non.?delivery|society|\bplot\b|allot/i.test(((c.title || "") + " " + (c.proceedings || "")).toLowerCase())) },
  /* A recovery view showed an EXPOSURE column, and eight of its nine rows read
     "—" because exposure is not what these matters are about. It shows the
     recoverable amount instead -- the figure the view selects on. */
  /* ASSET RECOVERY IS ITS OWN WORKBOOK, NOT A SLICE OF THE CASES.
     It was filtered to litigation matters carrying a recoverable amount, which
     is a handful of court cases -- while the actual estate, 25 sheets about
     1,357 people who left with company property, sat unread in Drive. It
     renders from that workbook (src/pages/assetrecovery.js). */
  /* POLICE COMPLAINTS IS NOT A FILTERED VIEW OF LITIGATION CASES.
     It was one, and it matched nothing: not a single row in the register is a
     police complaint, so the module was an empty table over somebody else's
     data. A complaint is its own kind of record -- it has a direction, a police
     station, a diary number, an investigating officer, and a 22-A / 22-B
     petition that PAUSES it rather than closing it -- and none of those are
     fields a litigation case has. It renders from its own definition in
     modules.js instead. */
};
export const MODULE_LIVE_KEYS = new Set(Object.keys(CFG));

const docCol = { key: "docs", label: "Docs", align: "center", render: (r) => (r.driveFiles || []).length ? html`<${Pill} tone="indigo">${r.driveFiles.length}</${Pill}>` : html`<span class="tiny muted">—</span>` };
const COLS = {
  contract: [
    { key: "title", label: "Contract", render: (c) => html`<div class="cell-strong">${c.title}</div><div class="tiny muted">${[c.contractType || c.type, c.counterparty].filter(Boolean).join(" · ")}</div>` },
    { key: "entityName", label: "Entity", render: (c) => html`<span class="tiny">${(c.entityName || "—").slice(0, 26)}</span>` },
    { key: "value", label: "Value (PKR)", align: "right", render: (c) => html`<span class="strong">${c.value ? fmt.money(c.value, "PKR") : "—"}</span>` },
    { key: "risk", label: "Risk", render: (c) => html`<${Pill} tone=${/high|critical/i.test(c.risk || "") ? "red" : "gray"}>${c.risk || "—"}</${Pill}>` },
    { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` }, docCol,
  ],
  litigation: [
    { key: "title", label: "Case", render: (c) => html`<div class="cell-strong">${c.title}</div><div class="tiny muted">${[c.type, c.court].filter(Boolean).join(" · ")}</div>` },
    { key: "stage", label: "Stage", render: (c) => html`<${Pill} tone="blue">${c.stage}</${Pill}>` },
    { key: "exposure", label: "Exposure", align: "right", render: (c) => html`<span class="strong">${c.exposure ? fmt.money(c.exposure, c.currency) : "—"}</span>` },
    { key: "entity", label: "Entity", render: (c) => html`<span class="tiny">${(c.entity || "—").slice(0, 26)}</span>` },
    { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` }, docCol,
  ],
  /* Same shape as `litigation`, with Recoverable in place of Exposure. The
     currency is whatever the record states -- never assumed, never converted. */
  litigationRecovery: [
    { key: "title", label: "Case", render: (c) => html`<div class="cell-strong">${c.title}</div><div class="tiny muted">${[c.type, c.court].filter(Boolean).join(" · ")}</div>` },
    { key: "stage", label: "Stage", render: (c) => html`<${Pill} tone="blue">${c.stage}</${Pill}>` },
    { key: "recoverable", label: "Recoverable", align: "right", render: (c) => html`<span class="strong">${c.recoverable ? fmt.money(c.recoverable, c.recoverableCurrency || c.currency) : "—"}</span>` },
    { key: "entity", label: "Entity", render: (c) => html`<span class="tiny">${(c.entity || "—").slice(0, 26)}</span>` },
    { key: "status", label: "Status", render: (c) => html`<${Status} value=${c.status} />` }, docCol,
  ],
  loan: [
    { key: "borrower", label: "Borrower / Lender", render: (l) => html`<div class="cell-strong">${l.borrower}</div><div class="tiny muted">${l.lender || ""}</div>` },
    { key: "amount", label: "Amount", align: "right", render: (l) => html`<span class="strong">${l.amount ? fmt.money(l.amount, l.currency) : "—"}</span>` },
    { key: "ref", label: "Reference", render: (l) => html`<span class="tiny">${(l.ref || "—").slice(0, 28)}</span>` },
    { key: "status", label: "Status", render: (l) => html`<${Status} value=${l.status} />` }, docCol,
  ],
  licence: [
    { key: "entity", label: "Entity", render: (l) => html`<div class="cell-strong">${l.entity}</div><div class="tiny muted">${l.authority || ""}</div>` },
    { key: "number", label: "Number", render: (l) => html`<span class="tiny">${l.number || "—"}</span>` },
    { key: "status", label: "Status", render: (l) => html`<${Status} value=${l.status} />` },
    { key: "expiry", label: "Expiry", align: "right", render: (l) => html`<span class="tiny strong">${l.expiry ? fmt.until(l.expiry) : "—"}</span>` }, docCol,
  ],
  resolution: [
    { key: "agenda", label: "Resolution", render: (r) => html`<div class="cell-strong" style="white-space:normal">${r.agenda}</div>` },
    { key: "docNo", label: "Doc No", render: (r) => html`<span class="tiny mono">${r.docNo || "—"}</span>` },
    { key: "entity", label: "Entity", render: (r) => html`<span class="tiny">${(r.entity || "—").slice(0, 26)}</span>` },
    { key: "date", label: "Date", align: "right", render: (r) => html`<span class="tiny">${r.date ? fmt.date(r.date) : "—"}</span>` }, docCol,
  ],
  notice: [
    { key: "recipient", label: "Notice", render: (n) => html`<div class="cell-strong">${(n.sender || "?") + " → " + (n.recipient || "?")}</div><div class="tiny muted" style="white-space:normal">${(n.details || "").slice(0, 80)}</div>` },
    { key: "category", label: "Category", render: (n) => html`<${Pill} tone="gray">${n.category || "Notice"}</${Pill}>` },
    { key: "noticeDate", label: "Date", align: "right", render: (n) => html`<span class="tiny">${n.noticeDate ? fmt.date(n.noticeDate) : "—"}</span>` },
    { key: "status", label: "Status", render: (n) => html`<${Status} value=${n.status} />` }, docCol,
  ],
};


/* A NEW LEGAL NOTICE.
   Not a case and not a generic legal request. A notice has a direction (did it
   come to us or did we send it), an issuer, a recipient, a subject and — where
   one is demanded — a reply deadline. It has no forum, no cause number and no
   hearing, so it is not raised through the litigation intake form.

   THE DROPDOWNS ARE THE REGISTER'S OWN VALUES. Category and status are read
   off the 255 notices already on file rather than written here, so a notice
   raised today is filterable beside the ones from the trackers instead of
   introducing an eleventh category nobody else uses. */
function NewNoticeModal({ rows, onClose, onDone }) {
  const distinct = (key) => {
    const out = [];
    for (const r of (rows || [])) { const v = String(r[key] || "").trim(); if (v && !out.includes(v)) out.push(v); }
    return out.sort();
  };
  const categories = distinct("category");
  const statuses = distinct("status");

  const [f, setF] = useState({
    direction: "Received", sender: "", recipient: "", entity: "",
    noticeDate: "", receiptDate: "", category: categories[0] || "Legal Notice",
    details: "", responseRequired: "Yes", replyDeadline: "",
    status: "Pending", owner: "", comments: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((d) => ({ ...d, [k]: e.target ? e.target.value : e }));

  const save = async () => {
    if (!f.sender.trim() && !f.recipient.trim()) {
      setErr("Record at least who issued the notice or who received it."); return;
    }
    setBusy(true); setErr("");
    try { await api.litigation.createModuleRecord("notices", f); toast("Legal notice recorded.", "success"); onDone(); }
    catch (e) { setErr(e.message || "The notice could not be saved."); setBusy(false); }
  };

  const sel = (k, label, opts, hint) => html`<${Field} label=${label} hint=${hint}>
    <select class="input" value=${f[k]} onChange=${set(k)}>
      ${(opts || []).map((o) => html`<option key=${o} value=${o} selected=${f[k] === o}>${o}</option>`)}
    </select></${Field}>`;

  return html`<${Modal} title="New legal notice" icon="mail" width=${760} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}>
      <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${save}>Record notice</${Btn}>`}>
    <div class="col" style="gap:14px">
      ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
      <div class="tiny muted">A notice is not a case. If it later becomes litigation, raise the case
        from Litigation and the two stay linked rather than becoming one record.</div>
      <div class="modeditgrid">
        ${sel("direction", "Direction", ["Received", "Sent"], "Did this come to us, or did we send it?")}
        ${sel("category", "Category", categories.length ? categories : ["Legal Notice"],
    "The categories the register already uses")}
        <${Field} label=${f.direction === "Sent" ? "Issuer (us)" : "Issuer / sender"}>
          <${Input} value=${f.sender} onInput=${set("sender")} /></${Field}>
        <${Field} label=${f.direction === "Sent" ? "Recipient" : "Recipient (us)"}>
          <${Input} value=${f.recipient} onInput=${set("recipient")} /></${Field}>
        <${Field} label="Entity"><${Input} value=${f.entity} onInput=${set("entity")} /></${Field}>
        <${Field} label="Notice date" hint="The date on the notice">
          <${DateInput} value=${f.noticeDate} onInput=${set("noticeDate")} /></${Field}>
        <${Field} label="Date received" hint="When it reached the company">
          <${DateInput} value=${f.receiptDate} onInput=${set("receiptDate")} /></${Field}>
        ${sel("responseRequired", "Response required", ["Yes", "No"])}
        ${f.responseRequired === "Yes" ? html`<${Field} label="Response deadline">
          <${DateInput} value=${f.replyDeadline} onInput=${set("replyDeadline")} /></${Field}>` : null}
        ${sel("status", "Status", statuses.length ? statuses : ["Pending"])}
        <${Field} label="Owner" hint="Who in Legal is answering this">
          <${Input} value=${f.owner} onInput=${set("owner")} /></${Field}>
      </div>
      <${Field} label="Subject / allegations"><textarea class="input" rows="3" value=${f.details}
        onInput=${set("details")}></textarea></${Field}>
      <${Field} label="Notes"><textarea class="input" rows="2" value=${f.comments}
        onInput=${set("comments")}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

export default function ModuleLive({ mkey }) {
  const cfg = CFG[mkey];
  const [nonce, setNonce] = useState(0);
  const reg = useRegister(cfg && cfg.reg, nonce);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingNotice, setCreatingNotice] = useState(false);
  if (!cfg) return html`<div class="page"><${PageHead} title="Module" /></div>`;
  /* Only the litigation modules raise cases. The other live modules read
     registers that are maintained elsewhere, and offering a create button that
     writes into the wrong book would be worse than offering none. */
  const canRaise = cfg.kind === "litigation";

  const rows0 = (reg.rows || []).filter(cfg.filter || (() => true));
  const statuses = [...new Set(rows0.map((r) => r.status).filter(Boolean))].slice(0, 8);
  const ql = q.trim().toLowerCase();
  let rows = rows0.filter((r) => (!fStatus || r.status === fStatus) &&
    (!ql || Object.values(r).filter((v) => typeof v === "string").join(" ").toLowerCase().includes(ql)));
  if (cfg.sort === "expiry") rows = [...rows].sort((a, b) => (a.daysToExpiry ?? 9e9) - (b.daysToExpiry ?? 9e9));
  /* WHAT YOU JUST RAISED IS THE FIRST ROW.
     The registers that have a full register shell (the case register, the
     notices register) sort on the adapter's `landing` key, which puts a record
     raised in LegalOS above the tracker's rows. This plain table applied no
     order at all, so /m/cases showed the register in tracker order and a case
     raised a moment earlier was row 332 of 332 -- saved, real, and nowhere a
     person would look. Same key, same rule, wherever the adapter provides one. */
  else if (rows.length && rows[0].landing !== undefined) {
    rows = [...rows].sort((a, b) => String(a.landing).localeCompare(String(b.landing)));
  }
  const withDocs = rows0.filter((r) => (r.driveFiles || []).length).length;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${cfg.title} sub=${cfg.sub}
      actions=${html`<${Fragment}>
        <${Btn} variant="ghost" icon="barchart" onClick=${() => location.hash = "#/reports"}>Analytics</${Btn}>
        ${/* EACH MODULE CREATES ITS OWN KIND OF THING.
              A notice is not a case: it has an issuer, a direction and a reply
              deadline, and no forum, cause number or hearing. Sending somebody
              to "Raise a case" from the notice register asks them for a court
              they have not got and records none of what a notice actually is. */ ""}
        ${cfg.kind === "notice" && html`<${Btn} variant="primary" icon="plus"
          onClick=${() => setCreatingNotice(true)}>New Legal Notice</${Btn}>`}
        ${canRaise && html`<${Btn} variant="primary" icon="plus" onClick=${() => setCreating(true)}>Add a case</${Btn}>`}
      </${Fragment}>`} />
    ${creating && html`<${RaiseCase} moduleKey=${mkey} moduleLabel=${cfg.title} onClose=${() => setCreating(false)}
      onCreated=${() => {
        setCreating(false);
        invalidateRegister(cfg.reg);     // the cached fetch would otherwise hide it
        setNonce((n) => n + 1);
      }} />`}
    ${creatingNotice && html`<${NewNoticeModal} rows=${rows0} onClose=${() => setCreatingNotice(false)}
      onDone=${() => {
        setCreatingNotice(false);
        invalidateRegister(cfg.reg);     // the cached fetch would otherwise hide it
        setNonce((n) => n + 1);
      }} />`}
    ${/* The notices register carries its own summary -- total, resolved, not
          resolved, no reply -- and each figure filters the register. A second
          strip above it repeating the total is the same number twice. */ ""}
    ${cfg.kind !== "notice" && html`<${StatStrip} stats=${[
      { value: rows0.length, label: cfg.kind === "litigation" ? "Cases" : cfg.kind === "contract" ? "Contracts" : "Records" },
      { value: withDocs, label: "With documents" },
      ...(cfg.kind === "litigation" ? [{ value: rows0.filter((r) => r.status === "Open").length, label: "Open" }] : []),
    ]} />`}

    <!-- PRD §3.4: requests triaged onto this desk. Shared with the workflow
         module pages so the two cannot diverge again -- this section existed
         only there, which made a triaged request invisible on the Drive-backed
         register that actually owns its category. -->
    <${IntakeDesk} moduleKey=${mkey} label=${cfg.title} />

    ${/* NOTICES GET THE REAL REGISTER, not a search box.
          Moving notices out of the litigation workspace and onto their own
          module page left them with one status chip and a text search: no
          direction, no entity, no response deadline, no views, no export and
          no KPI card that filters anything. The register shell they had is
          rendered here instead, so nothing was lost in the move. */ ""}
    ${cfg.kind === "notice"
      ? html`<${NoticesRegister} live=${reg} rows=${rows0} />`
      : html`<${Fragment}>
    <div class="row wrap" style="gap:8px;margin-bottom:10px;align-items:center">
      <div style="width:280px"><${Input} placeholder="Search…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      ${statuses.map((s) => html`<${Chip} key=${s} active=${fStatus === s} onClick=${() => setFStatus(fStatus === s ? "" : s)}>${s}</${Chip}>`)}
      ${(q || fStatus) && html`<${Btn} variant="ghost" size="sm" onClick=${() => { setQ(""); setFStatus(""); }}>Clear</${Btn}>`}
      <div class="spacer"></div>
      <span class="tiny muted">${rows.length} of ${rows0.length}</span>
    </div>
    ${reg.loading ? html`<div class="card card--pad center tiny muted" style="padding:44px;text-align:center">Loading from Drive…</div>`
      : html`<${DataTable} onRow=${(r) => navigate(recordRoute(cfg.kind, r.id))} columns=${COLS[cfg.columns || cfg.kind]} rows=${rows}
        empty=${html`<div class="empty" style="padding:36px"><${Icon} name="inbox" size=32 /><div>No records${cfg.filter ? " match this module" : ""}.</div></div>`} />`}
      </${Fragment}>`}
  </div>`;
}
