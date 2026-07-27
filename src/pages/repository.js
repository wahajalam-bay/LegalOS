// WORKSTREAM D — Intake & Repository: the input pipeline, made visible.
//
//   1 Add a document   upload a file OR scan a hard copy
//   2 OCR              raw text lifted off the page
//   3 Extraction       the Smart Data Analyzer pulls structured fields
//   4 Repository       the record is created and organised into TWO destinations
//                      at once — the Drive/folder file AND the tracker row
//   5 Operational      Sr No mapped against the physical record, physical office
//                      location, entity, type, value, key dates, owner, status
//
// The repository is the single source of truth linking
//   digital file (drive link) ←→ operational row (tracker) ←→ physical record.
import { html, cx, fmt, useState, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import {
  Btn, Pill, Status, Risk, Avatar, Modal, Field, Input, Textarea, Empty,
  Progress, AICard, Tabs, Segmented,
} from "../ui.js";
import { PageHead, DataTable, StatStrip } from "../parts.js";
import { navigate } from "../router.js";
import { useCollection, addItem, updateItem, nextId, nextSrNo, nowIso } from "../store.js";
import {
  extractFromOcr, entityName, entityById, GROUP_ENTITIES, CONTRACT_TYPE_CODES,
  OFFICE_LOCATIONS, nameOf, USERS, ACCESS_LEVELS, ACCESS_LABEL, typeHasPpa,
  contractTypeMeta, inferSubdivision,
} from "../data.js";
import { FilterBar, useFilters, applyFilters, DestinationChips, SubdivisionPill } from "../shared.js";

const DOC_KINDS = ["Contract", "Deed", "Lease", "Amendment", "License", "Notice", "Correspondence"];

const PIPELINE = [
  { key: "Added", label: "Document added", hint: "upload or scan" },
  { key: "OCR", label: "OCR", hint: "raw text lifted" },
  { key: "Extraction", label: "Extraction", hint: "structured fields" },
  { key: "Repository", label: "Repository record", hint: "drive + tracker" },
  { key: "Operational", label: "Operational fields", hint: "Sr No + physical record" },
];
const stageIndex = (doc) => {
  if (!doc) return 0;
  if (doc.srNo && doc.physicalRecordRef && doc.officeLocation) return 4;
  if (doc.stage === "Repository") return 3;
  if (doc.stage === "Extraction") return 2;
  if (doc.ocrStatus && doc.ocrStatus !== "Pending") return 1;
  return 0;
};

/* ============================================================
   // OCR provider seam
   Everything in this function is the PROTOTYPE stand-in for a real OCR pass.
   Swap the body for a call to your OCR service / vision model and return
   `{ text, confidence }` — nothing downstream changes: the extraction step
   (data.js#extractFromOcr) already consumes plain text.
   Deterministic on purpose, so the demo is stable.
   ============================================================ */
export function simulateOcr({ name = "", kind, contractType, jur, entityId, contract }) {
  const ent = entityName(entityId);
  const cp = (contract && contract.counterparty) || "COUNTERPARTY";
  const cur = jur === "PK" ? "PKR" : jur === "UAE" ? "AED" : "SAR";
  const law = jur === "PK" ? "laws of Pakistan" : jur === "UAE" ? "laws of the UAE; Dubai Courts have jurisdiction" : "the laws of the Kingdom of Saudi Arabia";
  const val = (contract && contract.value) || 0;
  const land = (contract && contract.landValue) || Math.round(val * 0.42);
  const num = (n) => Number(n || 0).toLocaleString("en-US");

  // Scans read worse than native uploads — the confidence follows the source.
  const scanned = /scan/i.test(name) || kind === "Deed";
  const confidence = scanned ? 0.79 : 0.93;

  const head = {
    "Deed": "TITLE DEED / ALLOTMENT",
    "Lease": jur === "KSA" ? "EJAR LEASE CONTRACT" : "TENANCY AGREEMENT",
    "Amendment": "VARIATION / AMENDMENT AGREEMENT",
    "License": "REGULATORY LICENSE CERTIFICATE",
    "Notice": "NOTICE OF TERMINATION / NON-RENEWAL",
    "Correspondence": "COUNTERPARTY CORRESPONDENCE",
  }[kind] || (contractType ? String(contractType).toUpperCase() + " AGREEMENT" : "AGREEMENT");

  const lines = [
    `${head} — ${contractType || kind || "document"}`,
    `Seller: ${cp.toUpperCase()}. Purchaser: ${ent.toUpperCase()}.`,
    val ? `Total consideration ${cur} ${num(val)}${typeHasPpa(contractType) && land ? `; land value ${cur} ${num(land)}` : ""}.` : "",
    contract && contract.landRef ? `${contract.landRef}.` : "",
    contract && contract.start ? `Term: commencing ${fmt.date(contract.start)} and expiring ${fmt.date(contract.expiry)}.` : "",
    contract && contract.renewalNoticeDays ? `Notice of renewal or non-renewal: ${contract.renewalNoticeDays} days before expiry.` : "",
    `Governing law: ${law}.`,
    jur === "KSA" ? "Registered on the Ejar platform per REGA requirements where applicable." : "",
    jur === "PK" ? "Stamp duty and CVT payable by the purchaser; mutation to follow in the revenue record." : "",
    "Termination for convenience on thirty (30) days' written notice.",
    scanned ? "[Scan quality poor on some pages — values require manual confirmation.]" : "",
  ].filter(Boolean);

  return { text: lines.join("\n"), confidence };
}

/* ============================================================
   Add-document wizard: the five steps, each visible as it happens
   ============================================================ */
function AddDocModal({ onClose, onCreated }) {
  const contracts = useCollection("contracts");
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: "", kind: "Contract", source: "Upload",
    entityId: (GROUP_ENTITIES[0] || {}).id || "CO-22",
    contractType: "", contractId: "",
    officeLocation: OFFICE_LOCATIONS[0], owner: "u10",
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [ocr, setOcr] = useState(null);
  const [extracted, setExtracted] = useState(null);

  const entity = entityById(f.entityId) || {};
  const contract = contracts.find((c) => c.id === f.contractId) || null;
  const entityContracts = contracts.filter((c) => c.entityId === f.entityId);

  const runOcr = () => {
    const res = simulateOcr({ name: f.name || (f.source === "Scan" ? "scan.pdf" : "upload.pdf"), kind: f.kind, contractType: f.contractType, jur: entity.jur, entityId: f.entityId, contract });
    setOcr(res);
    setStep(2);
  };
  const runExtract = () => {
    // `// extraction model seam` — deterministic parser today, model tomorrow.
    setExtracted(extractFromOcr(ocr.text, { entityId: f.entityId, contractType: f.contractType, jur: entity.jur }));
    setStep(3);
  };

  const create = () => {
    const srNo = nextSrNo();
    const id = nextId("repository", "DOC-");
    const doc = {
      id,
      name: f.name.trim() || `${f.kind} — ${entity.name} (${f.source.toLowerCase()}).pdf`,
      kind: f.kind, source: f.source,
      contractId: f.contractId || null,
      entityId: f.entityId, contractType: f.contractType || null, jur: entity.jur || "—",
      uploadedBy: f.owner, uploadedAt: nowIso(),
      pages: f.source === "Scan" ? 8 : 18, sizeKb: f.source === "Scan" ? 4200 : 980,
      stage: "Repository",
      ocrStatus: ocr.confidence >= 0.85 ? "Complete" : "Low confidence",
      ocrConfidence: ocr.confidence,
      ocrText: ocr.text,
      extractedFields: extracted,
      // Operational fields — Sr No is mapped AGAINST THE PHYSICAL RECORD.
      srNo,
      physicalRecordRef: "PR-" + srNo,
      officeLocation: f.officeLocation,
      // Destination 1: the file in storage. `// Google Drive / server / folder seam`
      // A real integration replaces both of these with the Drive file id + webViewLink.
      storagePath: `/legal/${entity.jur || "XX"}/${String(f.contractType || f.kind).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}/${id}.pdf`,
      driveLink: `https://drive.google.com/file/d/legalos-${id.toLowerCase()}/view`,
      access: [{ userId: f.owner, level: "edit" }, { userId: "u1", level: "comment" }, { userId: "u11", level: "view" }],
    };
    addItem("repository", doc);

    // Destination 2: the tracker row. If the doc is attached to a contract we
    // write the operational fields back onto it; otherwise the doc IS the row.
    if (contract) {
      updateItem("contracts", contract.id, {
        driveLink: doc.driveLink,
        storagePath: doc.storagePath,
        physicalRecordRef: doc.physicalRecordRef,
        officeLocation: doc.officeLocation,
        extractionConfidence: doc.ocrConfidence,
        extractedFields: { ...(contract.extractedFields || {}), ...stripEmpty(extracted) },
      });
    }
    onCreated && onCreated(doc);
    onClose();
  };

  const stepper = html`<div class="pipeline" style="margin-bottom:16px">
    ${PIPELINE.map((p, i) => html`<div key=${p.key} class=${cx("pstep", i < step && "pstep--done", i === step && "pstep--active")}>
      <span class="pstep__n">${i < step ? html`<${Icon} name="check" size=11 />` : i + 1}</span>
      <div style="min-width:0"><div class="strong tiny">${p.label}</div><div class="tiny muted">${p.hint}</div></div>
    </div>`)}
  </div>`;

  return html`<${Modal} title="Add a document" icon="scan" width=${700} onClose=${onClose}
    footer=${step === 0
      ? html`<${Btn} variant="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" iconRight="arrowRight" onClick=${() => setStep(1)}>Continue</${Btn}>`
      : step === 1
        ? html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(0)}>Back</${Btn}><${Btn} variant="primary" icon="scan" onClick=${runOcr}>Run OCR</${Btn}>`
        : step === 2
          ? html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(1)}>Back</${Btn}><${Btn} variant="primary" icon="cpu" onClick=${runExtract}>Extract fields</${Btn}>`
          : html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => setStep(2)}>Back</${Btn}><${Btn} variant="primary" icon="check" onClick=${create}>Create repository record</${Btn}>`}>

    ${stepper}

    ${step === 0 && html`<div class="col" style="gap:16px">
      <${Field} label="How is the document arriving?">
        <${Segmented} value=${f.source} onChange=${(v) => set("source", v)} options=${[
          { label: "Upload a file", value: "Upload", icon: "upload" },
          { label: "Scan a hard copy", value: "Scan", icon: "scan" },
        ]} />
      </${Field}>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Document kind"><select class="select" value=${f.kind} onChange=${(e) => set("kind", e.target.value)}>${DOC_KINDS.map((k) => html`<option key=${k}>${k}</option>`)}</select></${Field}>
        <${Field} label="File name"><${Input} placeholder=${f.source === "Scan" ? "e.g. DHA-plot-allotment-scan.pdf" : "e.g. Riyadh-Front-PPA-executed.pdf"} value=${f.name} onInput=${(e) => set("name", e.target.value)} /></${Field}>
      </div>
      <div class="banner banner--info" style="align-items:flex-start">
        <${Icon} name="database" size=17 />
        <div>
          <div class="strong tiny">Where this ends up</div>
          <div class="tiny" style="margin-top:3px;opacity:.85">
            The file is stored on the server/Drive folder and the link is saved on the record;
            a tracker row is created at the same time; and the Sr No is mapped against the
            physical hard copy so nothing is orphaned.
          </div>
        </div>
      </div>
    </div>`}

    ${step === 1 && html`<div class="col" style="gap:16px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
        <${Field} label="Company / entity"><select class="select" value=${f.entityId} onChange=${(e) => set("entityId", e.target.value)}>${GROUP_ENTITIES.map((c) => html`<option key=${c.id} value=${c.id}>${c.name} · ${c.jur}</option>`)}</select></${Field}>
        <${Field} label="Type of contract"><select class="select" value=${f.contractType} onChange=${(e) => set("contractType", e.target.value)}><option value="">— none —</option>${CONTRACT_TYPE_CODES.map((c) => html`<option key=${c}>${c}</option>`)}</select></${Field}>
        <${Field} label="Attach to an existing contract" hint="Optional — writes the operational fields back onto that tracker row.">
          <select class="select" value=${f.contractId} onChange=${(e) => set("contractId", e.target.value)}>
            <option value="">— standalone document —</option>
            ${entityContracts.map((c) => html`<option key=${c.id} value=${c.id}>${c.id} · ${c.title}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Physical office location" hint="Where the hard copy actually sits.">
          <select class="select" value=${f.officeLocation} onChange=${(e) => set("officeLocation", e.target.value)}>${OFFICE_LOCATIONS.map((o) => html`<option key=${o}>${o}</option>`)}</select>
        </${Field}>
        <${Field} label="Owner"><select class="select" value=${f.owner} onChange=${(e) => set("owner", e.target.value)}>${USERS.slice(0, 12).map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}</select></${Field}>
      </div>
    </div>`}

    ${step === 2 && ocr && html`<div class="col" style="gap:12px">
      <div class="row">
        <span class="strong">OCR output</span>
        <div class="spacer"></div>
        <${Pill} tone=${ocr.confidence >= 0.85 ? "green" : "amber"}>confidence ${Math.round(ocr.confidence * 100)}%</${Pill}>
      </div>
      <div class="ocrbox">${ocr.text}</div>
      <div class="tiny muted">Raw text only — no fields have been interpreted yet. Extraction is the next step.</div>
    </div>`}

    ${step === 3 && extracted && html`<div class="col" style="gap:14px">
      <div class="row"><span class="strong">Extracted fields</span><div class="spacer"></div><span class="tiny muted">editable after the record is created</span></div>
      <div class="kvgrid">
        ${[["Parties", extracted.parties], ["Governing law", extracted.governingLaw], ["Term", extracted.term], ["Notice period", extracted.noticePeriod],
          ["Registration ref", extracted.registration], ["Title / deed ref", extracted.titleRef],
          ["Total value", extracted.totalValue != null ? fmt.moneyFull(extracted.totalValue, extracted.currency) : null],
          ["PPA value", extracted.ppaValue != null ? fmt.moneyFull(extracted.ppaValue, extracted.currency) : null],
          ["Land value", extracted.landValue != null ? fmt.moneyFull(extracted.landValue, extracted.currency) : null],
        ].filter((r) => r[1]).map(([l, v]) => html`<div key=${l} class="kv"><div class="kv__l">${l}</div><div class="kv__v">${v}</div></div>`)}
      </div>
      ${(extracted.keyClauses || []).length > 0 && html`<div>
        <div class="fpop__lbl">Key clauses detected</div>
        <div class="col" style="gap:4px">${extracted.keyClauses.map((c, i) => html`<div key=${i} class="row" style="gap:7px"><${Icon} name="dot" size=13 style=${{ color: "var(--brand)" }} /><span class="tiny">${c}</span></div>`)}</div>
      </div>`}
      ${(extracted.flags || []).length > 0 && html`<div class="banner banner--warn"><${Icon} name="alertTriangle" size=16 /><span>${extracted.flags.join(" · ")}</span></div>`}
      <${AICard} title="On create">
        Sr No <b>${nextSrNo()}</b> will be assigned and mapped to physical record <b>PR-${nextSrNo()}</b> at
        <b>${f.officeLocation}</b>. The file link is saved on the record and a tracker row is created
        ${contract ? html`— writing these fields back onto <b>${contract.id}</b>` : ""}.
      </${AICard}>
    </div>`}
  </${Modal}>`;
}

const stripEmpty = (o) => {
  const out = {};
  Object.keys(o || {}).forEach((k) => { const v = o[k]; if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) out[k] = v; });
  return out;
};

/* ============================================================
   The repository list
   ============================================================ */
function RepositoryList() {
  const repository = useCollection("repository");
  const contracts = useCollection("contracts");
  const [add, setAdd] = useState(false);
  const { filters, patch, toggle, clear } = useFilters("repository", { sortBy: "srNo", sortDir: "desc" });

  const rows = applyFilters(repository, filters, { searchKeys: ["name", "id", "kind", "physicalRecordRef", "officeLocation", "ocrText"] });
  const lowConf = repository.filter((d) => (d.ocrConfidence || 1) < 0.85);
  const unmapped = repository.filter((d) => !d.srNo || !d.officeLocation);

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Intake & Repository"
      sub="Add or scan a document, run OCR, extract the fields — then it lands in the Drive folder, the tracker and the physical-record index at once."
      actions=${html`<${Btn} variant="ghost" icon="grid" onClick=${() => navigate("/tracker")}>Open tracker</${Btn}>
        <${Btn} variant="primary" icon="plus" onClick=${() => setAdd(true)}>Add document</${Btn}>`} />

    <!-- the pipeline, as a mini spine -->
    <div class="card card--pad" style="margin-bottom:16px">
      <div class="row" style="margin-bottom:11px">
        <span class="strong">The intake pipeline</span>
        <div class="spacer"></div>
        <span class="tiny muted">every document walks these five steps</span>
      </div>
      <div class="pipeline">
        ${PIPELINE.map((p, i) => html`<div key=${p.key} class="pstep pstep--done">
          <span class="pstep__n">${i + 1}</span>
          <div style="min-width:0"><div class="strong tiny">${p.label}</div><div class="tiny muted">${p.hint}</div></div>
        </div>`)}
      </div>
    </div>

    <${StatStrip} stats=${[
      { value: repository.length, label: "Documents" },
      { value: repository.filter((d) => d.source === "Scan").length, label: "Scanned hard copies" },
      { value: lowConf.length, label: "Low-confidence OCR" },
      { value: unmapped.length, label: "Not mapped to a physical record" },
      { value: new Set(repository.map((d) => d.officeLocation).filter(Boolean)).size, label: "Office locations" },
    ]} />

    <${FilterBar} module="repository" filters=${filters} onPatch=${patch} onToggle=${toggle} onClear=${clear}
      dims=${["entities", "contractTypes", "owners"]} rows=${repository}
      dateFields=${[{ key: "uploadedAt", label: "Date added" }]}
      placeholder="Search documents, OCR text, physical refs…" />

    <div class="dense">
      <${DataTable} onRow=${(d) => navigate("/repository/" + d.id)} rows=${rows}
        empty=${html`<${Empty} icon="database" title="No documents match" text="Add a document, or clear the filters." action=${html`<${Btn} variant="primary" icon="plus" onClick=${() => setAdd(true)}>Add document</${Btn}>`} />`}
        columns=${[
          { key: "srNo", label: "Sr No", width: "60px", render: (d) => d.srNo ? html`<span class="mono strong">${d.srNo}</span>` : html`<span class="tiny muted">—</span>` },
          { key: "name", label: "Document", render: (d) => html`<div class="wrapcell">
              <div class="cell-strong">${d.name}</div>
              <div class="tiny muted">${d.id} · ${d.kind} · ${d.pages}p · ${nameOf(d.uploadedBy)}</div>
            </div>` },
          { key: "source", label: "Source", width: "78px", render: (d) => html`<${Pill} tone=${d.source === "Scan" ? "amber" : d.source === "Generated" ? "purple" : "gray"}>${d.source}</${Pill}>` },
          { key: "entityId", label: "Entity", width: "112px", render: (d) => html`<span class="tiny strong">${entityName(d.entityId)}</span>` },
          { key: "contractType", label: "Contract type", width: "128px", render: (d) => d.contractType ? html`<${Pill} tone="indigo">${d.contractType}</${Pill}>` : html`<span class="tiny muted">—</span>` },
          { key: "ocr", label: "OCR", width: "92px", render: (d) => html`<${Pill} tone=${(d.ocrConfidence || 1) >= 0.9 ? "green" : (d.ocrConfidence || 1) >= 0.85 ? "amber" : "red"}>${Math.round((d.ocrConfidence || 1) * 100)}%</${Pill}>` },
          { key: "physicalRecordRef", label: "Physical record", width: "108px", render: (d) => d.physicalRecordRef ? html`<span class="mono tiny">${d.physicalRecordRef}</span>` : html`<span class="tiny muted">not mapped</span>` },
          { key: "officeLocation", label: "Office location", render: (d) => html`<span class="tiny">${d.officeLocation || "—"}</span>` },
          { key: "driveLink", label: "Drive", width: "62px", render: (d) => d.driveLink
            ? html`<a class="tagchip" href=${d.driveLink} target="_blank" rel="noreferrer" onClick=${(e) => e.stopPropagation()}><${Icon} name="externalLink" size=11 />Open</a>`
            : html`<span class="tiny muted">—</span>` },
          { key: "contractId", label: "Tracker row", width: "94px", render: (d) => d.contractId
            ? html`<button class="facechip" onClick=${(e) => { e.stopPropagation(); navigate("/contracts/" + d.contractId); }}>${d.contractId}</button>`
            : html`<span class="tiny muted">standalone</span>` },
        ]} />
    </div>

    ${add && html`<${AddDocModal} onClose=${() => setAdd(false)} onCreated=${(d) => navigate("/repository/" + d.id)} />`}
  </div>`;
}

/* ============================================================
   A single document: pipeline · OCR · editable extraction · destinations · access
   ============================================================ */
function DocDetail({ id }) {
  const repository = useCollection("repository");
  const contracts = useCollection("contracts");
  const doc = repository.find((d) => d.id === id);
  const [tab, setTab] = useState("extraction");
  const [draft, setDraft] = useState(null);

  if (!doc) {
    return html`<div class="page">
      <${Btn} variant="ghost" icon="arrowLeft" onClick=${() => navigate("/repository")}>Repository</${Btn}>
      <${Empty} icon="database" title="Document not found" text="It may have been removed from the repository." />
    </div>`;
  }

  const contract = contracts.find((c) => c.id === doc.contractId) || null;
  const idx = stageIndex(doc);
  const e = draft || doc.extractedFields || {};
  const setField = (k, v) => setDraft({ ...e, [k]: v });

  // Editable extracted fields write back to the record (and its contract).
  const saveFields = () => {
    updateItem("repository", doc.id, { extractedFields: e });
    if (contract) {
      const patch = { extractedFields: { ...(contract.extractedFields || {}), ...stripEmpty(e) } };
      if (e.totalValue != null) patch.value = Number(e.totalValue);
      if (e.ppaValue != null) patch.ppaValue = Number(e.ppaValue);
      if (e.landValue != null) patch.landValue = Number(e.landValue);
      updateItem("contracts", contract.id, patch);
    }
    setDraft(null);
  };

  const rerunOcr = () => {
    const res = simulateOcr({ name: doc.name, kind: doc.kind, contractType: doc.contractType, jur: doc.jur, entityId: doc.entityId, contract });
    const fields = extractFromOcr(res.text, doc);
    updateItem("repository", doc.id, { ocrText: res.text, ocrConfidence: res.confidence, ocrStatus: res.confidence >= 0.85 ? "Complete" : "Low confidence", extractedFields: fields });
    setDraft(null);
  };

  const EDITABLE = [
    ["parties", "Parties", "text"], ["governingLaw", "Governing law", "text"],
    ["term", "Term", "text"], ["noticePeriod", "Notice period", "text"],
    ["registration", "Registration ref", "text"], ["titleRef", "Title / deed ref", "text"],
    ["totalValue", "Total value", "number"], ["ppaValue", "PPA value", "number"], ["landValue", "Land value", "number"],
  ];

  return html`<div class="page page--wide fade-in">
    <div class="row" style="margin-bottom:14px">
      <${Btn} variant="ghost" size="sm" icon="arrowLeft" onClick=${() => navigate("/repository")}>Repository</${Btn}>
    </div>

    <div class="pagehead" style="margin-bottom:16px">
      <div class="pagehead__main">
        <div class="row wrap" style="gap:8px;margin-bottom:8px">
          <span class="mono muted">${doc.id}</span>
          <${Pill} tone="gray">${doc.kind}</${Pill}>
          <${Pill} tone=${doc.source === "Scan" ? "amber" : doc.source === "Generated" ? "purple" : "indigo"}>${doc.source}</${Pill}>
          ${doc.contractType && html`<${Pill} tone="indigo">${doc.contractType}</${Pill}>`}
          <${Pill} tone=${(doc.ocrConfidence || 1) >= 0.9 ? "green" : "amber"}>OCR ${Math.round((doc.ocrConfidence || 1) * 100)}%</${Pill}>
        </div>
        <div class="pagehead__title">${doc.name}</div>
        <div class="pagehead__sub">${entityName(doc.entityId)} · ${doc.pages} pages · added ${fmt.date(doc.uploadedAt)} by ${nameOf(doc.uploadedBy)}</div>
      </div>
      <div class="pagehead__actions">
        <${Btn} variant="ghost" icon="refresh" onClick=${rerunOcr}>Re-run extraction</${Btn}>
        ${doc.driveLink && html`<a class="btn btn--ghost" href=${doc.driveLink} target="_blank" rel="noreferrer"><${Icon} name="externalLink" size=16 />Open in Drive</a>`}
        ${contract && html`<${Btn} variant="primary" icon="workflow" onClick=${() => navigate("/contracts/" + contract.id)}>Open the flow</${Btn}>`}
      </div>
    </div>

    <!-- this document's position in the pipeline -->
    <div class="card card--pad" style="margin-bottom:16px">
      <div class="pipeline">
        ${PIPELINE.map((p, i) => html`<div key=${p.key} class=${cx("pstep", i < idx && "pstep--done", i === idx && "pstep--active")}>
          <span class="pstep__n">${i < idx ? html`<${Icon} name="check" size=11 />` : i + 1}</span>
          <div style="min-width:0"><div class="strong tiny">${p.label}</div><div class="tiny muted">${p.hint}</div></div>
        </div>`)}
      </div>
    </div>

    <!-- the three destinations -->
    <div class="dest" style="margin-bottom:16px">
      <div class=${cx("dest__card", !doc.driveLink && "dest__card--empty")}>
        <div class="dest__ico" style="background:var(--accent-soft);color:var(--accent-500)"><${Icon} name="externalLink" size=16 /></div>
        <div style="flex:1;min-width:0">
          <div class="dest__l">Drive / folder</div>
          ${doc.driveLink ? html`<a class="dest__v" href=${doc.driveLink} target="_blank" rel="noreferrer">Open the file →</a>` : html`<div class="dest__v muted">Not stored</div>`}
          <div class="tiny muted mono" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${doc.storagePath || ""}</div>
        </div>
      </div>
      <div class=${cx("dest__card", !doc.contractId && "dest__card--empty")}>
        <div class="dest__ico" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name="grid" size=16 /></div>
        <div style="flex:1;min-width:0">
          <div class="dest__l">Tracker row</div>
          ${doc.contractId
            ? html`<button class="dest__v" onClick=${() => navigate("/tracker")}>${doc.contractId} →</button><div class="tiny muted" style="margin-top:2px">operational row</div>`
            : html`<div class="dest__v muted">Standalone document</div>`}
        </div>
      </div>
      <div class=${cx("dest__card", !doc.srNo && "dest__card--empty")}>
        <div class="dest__ico" style="background:var(--warning-bg);color:var(--warning)"><${Icon} name="database" size=16 /></div>
        <div style="flex:1;min-width:0">
          <div class="dest__l">Physical record</div>
          ${doc.srNo
            ? html`<div class="dest__v">Sr No ${doc.srNo} · ${doc.physicalRecordRef}</div><div class="tiny muted" style="margin-top:2px">${doc.officeLocation}</div>`
            : html`<div class="dest__v muted">Not mapped</div>`}
        </div>
      </div>
    </div>

    <div class="card">
      <div style="padding:6px 18px 0">
        <${Tabs} active=${tab} onChange=${setTab} tabs=${[
          { key: "extraction", label: "Extracted fields", icon: "cpu" },
          { key: "ocr", label: "OCR text", icon: "scan" },
          { key: "operational", label: "Operational", icon: "database" },
          { key: "access", label: "Access", icon: "lock", count: (doc.access || []).length },
        ]} />
      </div>
      <div class="card__body">
        ${tab === "extraction" && html`<div class="col" style="gap:14px">
          <div class="row">
            <span class="strong">Editable extracted fields</span>
            <div class="spacer"></div>
            ${draft && html`<${Btn} variant="ghost" size="sm" onClick=${() => setDraft(null)}>Discard</${Btn}>`}
            <${Btn} variant=${draft ? "primary" : "soft"} size="sm" icon="save" disabled=${!draft} onClick=${saveFields}>
              ${draft ? "Save to record" : "No changes"}
            </${Btn}>
          </div>
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px">
            ${EDITABLE.map(([k, label, type]) => html`<${Field} key=${k} label=${label}>
              <${Input} type=${type === "number" ? "number" : "text"} value=${e[k] == null ? "" : e[k]}
                placeholder="—" onInput=${(ev) => setField(k, type === "number" ? (ev.target.value === "" ? null : Number(ev.target.value)) : ev.target.value)} />
            </${Field}>`)}
          </div>
          ${(e.keyClauses || []).length > 0 && html`<div>
            <div class="fpop__lbl">Key clauses detected</div>
            <div class="col" style="gap:5px">${e.keyClauses.map((c, i) => html`<div key=${i} class="row" style="gap:7px"><${Icon} name="dot" size=13 style=${{ color: "var(--brand)" }} /><span class="tiny">${c}</span></div>`)}</div>
          </div>`}
          ${(e.flags || []).length > 0 && html`<div class="banner banner--warn"><${Icon} name="alertTriangle" size=16 /><span>${e.flags.join(" · ")}</span></div>`}
          ${contract && html`<div class="banner banner--info"><${Icon} name="link" size=16 /><span>Saving writes these values back onto tracker row <b>${contract.id}</b>, so the analyzer and filters see them immediately.</span></div>`}
        </div>`}

        ${tab === "ocr" && html`<div class="col" style="gap:12px">
          <div class="row">
            <span class="strong">Raw OCR text</span>
            <div class="spacer"></div>
            <${Pill} tone=${(doc.ocrConfidence || 1) >= 0.9 ? "green" : "amber"}>${doc.ocrStatus} · ${Math.round((doc.ocrConfidence || 1) * 100)}%</${Pill}>
            <${Btn} variant="soft" size="sm" icon="refresh" onClick=${rerunOcr}>Re-run OCR</${Btn}>
          </div>
          <div class="ocrbox">${doc.ocrText || "No OCR text captured for this document."}</div>
          <div class="tiny muted">A real OCR provider plugs in at <span class="mono">pages/repository.js#simulateOcr</span> — the extraction step already consumes plain text.</div>
        </div>`}

        ${tab === "operational" && html`<div class="col" style="gap:14px">
          <div class="kvgrid">
            <div class="kv"><div class="kv__l">Sr No</div><div class="kv__v mono">${doc.srNo || "—"}</div></div>
            <div class="kv"><div class="kv__l">Physical record ref</div><div class="kv__v mono">${doc.physicalRecordRef || "—"}</div></div>
            <div class="kv"><div class="kv__l">Physical office location</div><div class="kv__v">${doc.officeLocation || "—"}</div></div>
            <div class="kv"><div class="kv__l">Entity</div><div class="kv__v">${entityName(doc.entityId)}</div></div>
            <div class="kv"><div class="kv__l">Jurisdiction</div><div class="kv__v">${doc.jur}</div></div>
            <div class="kv"><div class="kv__l">Contract type</div><div class="kv__v">${doc.contractType || "—"}</div></div>
            <div class="kv"><div class="kv__l">Owner</div><div class="kv__v">${nameOf(doc.uploadedBy)}</div></div>
            <div class="kv"><div class="kv__l">Storage path</div><div class="kv__v mono" style="font-size:11px">${doc.storagePath || "—"}</div></div>
          </div>
          <${Field} label="Physical office location" hint="Move the hard copy — the index updates immediately.">
            <select class="select" value=${doc.officeLocation || ""} onChange=${(ev) => updateItem("repository", doc.id, { officeLocation: ev.target.value })}>
              ${OFFICE_LOCATIONS.map((o) => html`<option key=${o}>${o}</option>`)}
            </select>
          </${Field}>
        </div>`}

        ${tab === "access" && html`<div class="col" style="gap:12px">
          <div class="banner banner--info" style="align-items:flex-start">
            <${Icon} name="lock" size=17 />
            <div>
              <div class="strong tiny">Drive-style access — view · comment/annotate · edit, per user</div>
              <div class="tiny" style="margin-top:3px;opacity:.85">The drafter and the approver are deliberately different people. Real Drive ACLs plug in where this list is written.</div>
            </div>
          </div>
          ${(doc.access || []).map((a, i) => html`<div key=${a.userId} class="docrow">
            <${Avatar} name=${nameOf(a.userId)} size="md" />
            <div style="flex:1;min-width:0"><div class="strong tiny">${nameOf(a.userId)}</div><div class="tiny muted">${(USERS.find((u) => u.id === a.userId) || {}).role || "—"}</div></div>
            <select class="select" style="width:132px;height:32px" value=${a.level} onChange=${(ev) => {
              const next = (doc.access || []).map((x, j) => (j === i ? { ...x, level: ev.target.value } : x));
              updateItem("repository", doc.id, { access: next });
            }}>
              ${ACCESS_LEVELS.map((l) => html`<option key=${l} value=${l}>${ACCESS_LABEL[l]}</option>`)}
            </select>
          </div>`)}
          <${Field} label="Grant access to another user">
            <select class="select" value="" onChange=${(ev) => {
              if (!ev.target.value) return;
              updateItem("repository", doc.id, { access: [...(doc.access || []), { userId: ev.target.value, level: "view" }] });
            }}>
              <option value="">— pick a user —</option>
              ${USERS.filter((u) => !(doc.access || []).some((a) => a.userId === u.id)).map((u) => html`<option key=${u.id} value=${u.id}>${u.name} · ${u.role}</option>`)}
            </select>
          </${Field}>
        </div>`}
      </div>
    </div>
  </div>`;
}

export default function Repository({ id }) {
  return id ? html`<${DocDetail} id=${id} />` : html`<${RepositoryList} />`;
}
