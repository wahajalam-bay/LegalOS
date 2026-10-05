// Administration -> Data Health.
//
// The integrity picture behind everything else in LegalOS: what was read out of
// Drive, what was kept, what could not be placed, and what the source itself
// gets wrong. It exists so a mapping regression shows up as a number on a
// screen instead of as documents quietly going missing from a Documents tab.
//
// This is a STEWARD surface, not business reading - it exposes source
// filenames, sheet names and row numbers - so the route is admin-gated and the
// API refuses a non-admin caller as well.
import { html, fmt, useState, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Tabs, Input } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { RegisterShell } from "../register.js";
import { useQuery } from "../router.js";
import { api } from "../api.js";
import { toast } from "../toast.js";

const QUALITY_TONE = { INCOMPLETE_SOURCE: "amber", CONFLICTING_SOURCE: "red", WEAK_IDENTITY: "blue" };
const DISPOSITION_NOTE = {
  INGESTED_RECORD: "a complete record",
  INCOMPLETE_SOURCE_RECORD: "kept, with a required field blank in the source",
  MERGED_DUPLICATE: "collapsed into another row on a two-part identity",
  NOT_A_REGISTER_SHEET: "the sheet is not this family's register",
  SKIPPED_SHEET: "key/legend/summary tab",
  BLANK_ROW: "no mapped column held a value",
  PADDING_ROW: "spreadsheet filler (a lone 0)",
  UNKNOWN_DROP: "unexplained - must always be zero",
};
const DOC_NOTE = {
  RECORD_DOCUMENT: "attached to one record",
  MULTI_RECORD_DOCUMENT: "attached to several records, with the evidence recorded",
  PROJECT_DOCUMENT: "project hierarchy material",
  MODULE_DOCUMENT: "belongs to a module, not one record",
  TEMPLATE: "template / precedent",
  REFERENCE: "filed under a legal root; no record cites it",
  SOURCE_TRACKER: "a spreadsheet the ingest reads (or ignores) as a source",
  SYSTEM_FILE: "editor lock file / OS artefact",
  UNRESOLVED: "could not be placed - needs a steward",
  // Added by the Compliance rebuild.
  ACTION_DOCUMENT: "a dated lifecycle event on a loan (amendment, registration, repayment)",
  ENTITY_DOCUMENT: "belongs to a known entity folder; no single record claimed it",
  SECP_YEAR_DOCUMENT: "evidences a statutory year (AGM minute, financial-statement approval, SECP form)",
  NOT_A_DOCUMENT: "Word lock / recovery artefact, not compliance material",
};

/* WHAT WE HAVE READ.
   Every other panel on this page is about where a document SITS. This one is
   about whether anybody has opened it, and it is deliberately blunt: this
   estate is mostly scanned paper, there is no OCR on the server, and the number
   of documents whose text we actually hold is a minority. Showing that plainly
   is the point — a page that implied every document was understood would be
   telling a comfortable lie about the evidence behind every other figure here. */
function ContentRead({ c }) {
  const pct = (n) => (c.total ? Math.round((n / c.total) * 100) : 0);
  const types = Object.entries(c.byType || {}).sort((a, b) => b[1] - a[1]);
  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: c.total, label: "Documents in the estate" },
      { value: c.textExtracted, label: "Text extracted and held", tone: "green" },
      { value: c.scanReadViaIndex, label: "Scans read via Drive's OCR index" },
      { value: c.notRead, label: "Not read", tone: c.notRead ? "amber" : undefined },
    ]} />
    <${Section} title="How each document was read" icon="book"
      sub=${"A type taken from full text and a type taken from a few OCR'd words are not the same claim"}>
      <div class="col" style="gap:8px">
        <div class="tiny"><strong>${c.textExtracted}</strong> (${pct(c.textExtracted)}%) — we hold the document's own words.
          Types drawn from these are exact phrase matches.</div>
        <div class="tiny"><strong>${c.scanReadViaIndex}</strong> (${pct(c.scanReadViaIndex)}%) — scanned paper with no text
          layer. Google has OCR'd these in Drive's own index, so we know which measured keywords
          appear in them and nothing more. Accuracy of that index, checked against the documents
          whose text we hold: about 93% precise, 91% complete.</div>
        <div class="tiny"><strong>${c.notRead}</strong> (${pct(c.notRead)}%) — images, legacy .doc files and
          documents too large to fetch. These are counted as unread rather than guessed at.</div>
      </div>
    </${Section}>
    ${types.length > 0 && html`<${Section} title="What the documents say they are" icon="file"
      sub="Derived from the text, not from the file name or the folder">
      <table class="table"><thead><tr><th>Instrument</th><th style="text-align:right">Documents</th></tr></thead>
      <tbody>${types.map(([t, n]) => html`<tr key=${t}>
        <td><div class="cell-strong">${t.replace(/_/g, " ").toLowerCase()}</div></td>
        <td style="text-align:right">${n}</td></tr>`)}</tbody></table>
    </${Section}>`}
  </div>`;
}

/* THE COMMERCIAL REVIEW QUEUE.
   Automation went as far as the evidence safely allowed and then stopped. What
   is here is what it deliberately would not decide — and the point of the
   screen is that a reviewer can decide it WITHOUT redoing the investigation:
   both candidates, the evidence for each, and why the machine could not choose
   are all on the row. A decision is recorded with the reviewer and the reason,
   and later reconciliations leave that document alone. */
/* DEFECTS INSIDE THE DOCUMENTS THEMSELVES.
 *
 * Distinct from the review queue above: nothing here is a decision anyone has to
 * make about mapping. These are faults in what was signed and filed — a footer
 * naming the wrong project, a schedule left blank, a stamp from the wrong
 * jurisdiction. The file is preserved exactly as stored and stays openable in
 * Drive; LegalOS reports the defect and invents nothing in its place. */
function DocumentIntegrity() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.sourceQuality().then(setData, (e) => setErr((e && e.message) || "Could not load document integrity.")); }, []);

  if (err) return html`<${Section} title="Document integrity" icon="alertTriangle"><div class="tiny">${err}</div></${Section}>`;
  if (!data) return html`<div class="tiny muted">Loading…</div>`;

  const sum = data.summary || {};
  const tone = (sev) => (sev === "HIGH" ? "red" : sev === "MEDIUM" ? "amber" : undefined);

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: sum.documentsWithIssues || 0, label: "Documents with a source issue" },
      { value: sum.high || 0, label: "High", tone: (sum.high || 0) ? "red" : undefined },
      { value: sum.medium || 0, label: "Medium", tone: (sum.medium || 0) ? "amber" : undefined },
      { value: sum.low || 0, label: "Low" },
    ]} />
    <div class="tiny muted">
      These are <strong>source quality issues</strong>, not application faults. Each document is preserved
      exactly as stored in Drive, is attached to the correct record, and can be opened from here. LegalOS
      flags the discrepancy and does <strong>not</strong> decide which wording is legally correct —
      contract terms, execution facts, jurisdiction, signatures and schedule contents are never rewritten.
    </div>

    <table class="table"><thead><tr>
      <th>Record</th><th>Document</th><th>Issue</th><th>Severity</th><th>Evidence</th><th>Drive</th><th>Status</th>
    </tr></thead><tbody>
      ${(data.rows || []).map((r) => html`<tr key=${r.fileId}>
        <td>${r.project || html`<span class="muted">—</span>`}</td>
        <td><button class="linkbtn" onClick=${() => setOpen(open === r.fileId ? null : r.fileId)}>${r.filename}</button></td>
        <td>${r.issues.map((i) => html`<div><${Pill} tone=${tone(i.severity)}>${i.type.replace(/_/g, " ")}</${Pill}></div>`)}</td>
        <td><${Pill} tone=${tone(r.severity)}>${r.severity}</${Pill}></td>
        <td class="tiny" style="max-width:420px">${r.issues.map((i) => html`<div>${i.evidence}</div>`)}</td>
        <td><a class="tiny" href=${"https://drive.google.com/file/d/" + r.fileId + "/view"} target="_blank" rel="noopener">Open in Drive</a></td>
        <td class="tiny">${r.status}</td>
      </tr>
      ${open === r.fileId && html`<tr key=${r.fileId + "-x"}><td colspan="7" class="tiny" style="background:var(--surface-2)">
        <div class="col" style="gap:6px;padding:8px 2px">
          <div><strong>Stored at</strong> ${r.folderPath}</div>
          ${r.issues.map((i) => html`<div><strong>${i.type.replace(/_/g, " ")}</strong> — ${i.explanation}</div>`)}
        </div></td></tr>`}`)}
    </tbody></table>
  </div>`;
}

function CommercialReview() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => api.commercialReview.list().then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err) return html`<${Section} title="Commercial review queue" icon="alertTriangle"><div class="tiny">${err}</div></${Section}>`;
  if (!data) return html`<div class="tiny muted">Loading…</div>`;

  const decide = async (item, decision, project) => {
    setBusy(item.fileId);
    try {
      const reason = window.prompt("Why? (recorded with your name against this document)", "") || "";
      await api.commercialReview.decide(item.fileId, decision, project || null, reason);
      await load();
    } catch (e) { setErr((e && e.message) || "Could not record that decision."); }
    finally { setBusy(null); }
  };

  const open = (data.items || []).filter((i) => !i.decided);
  const done = (data.items || []).filter((i) => i.decided);

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: data.summary.total, label: "In the queue" },
      { value: data.summary.open, label: "Awaiting a decision", tone: data.summary.open ? "amber" : undefined },
      { value: data.summary.resolved, label: "Decided", tone: "green" },
    ]} />
    <div class="tiny muted">
      These are the documents automation would not decide. Every row carries both candidates and the
      evidence for each. A decision is recorded against your name and is <strong>not asked again</strong> —
      later reconciliations respect it. Nothing here changes anything in Google Drive.
    </div>

    ${open.map((i) => html`<div key=${i.fileId} class="card"><div class="card__body col" style="gap:8px">
      <div class="row" style="gap:8px;align-items:center">
        <div class="cell-strong" style="flex:1;min-width:0">${i.filename}</div>
        <${Pill} tone="gray">${i.documentType || "type unknown"}</${Pill}>
        <${Pill} tone="amber">${i.reason}</${Pill}>
      </div>
      <div class="tiny muted">${i.drivePath}</div>
      <div class="grid grid--2" style="gap:10px">
        <div><div class="tiny strong">A · ${i.candidateA}</div><div class="tiny muted">${i.evidenceA}</div></div>
        <div><div class="tiny strong">B · ${i.candidateB}</div><div class="tiny muted">${i.evidenceB}</div></div>
      </div>
      <div class="tiny muted"><strong>Why this needs you:</strong> ${i.whyAutomationCannotDecide}</div>
      <div class="tiny muted"><strong>Suggested:</strong> ${i.suggestedAction}</div>
      <div class="row wrap" style="gap:6px">
        <${Btn} size="sm" disabled=${busy === i.fileId}
          onClick=${() => decide(i, "ATTACH_TO_PROJECT", (i.candidateB || "").split(" (")[0])}>Attach to B</${Btn}>
        <${Btn} size="sm" variant="ghost" disabled=${busy === i.fileId} onClick=${() => decide(i, "KEEP_CURRENT")}>Keep as is</${Btn}>
        <${Btn} size="sm" variant="ghost" disabled=${busy === i.fileId} onClick=${() => decide(i, "MARK_DRAFT_COPY")}>Draft copy</${Btn}>
        <${Btn} size="sm" variant="ghost" disabled=${busy === i.fileId} onClick=${() => decide(i, "MARK_TEMPLATE")}>Template</${Btn}>
        <${Btn} size="sm" variant="ghost" disabled=${busy === i.fileId} onClick=${() => decide(i, "MARK_EXECUTED_HISTORICAL")}>Executed, historical</${Btn}>
        <${Btn} size="sm" variant="ghost" disabled=${busy === i.fileId} onClick=${() => decide(i, "MARK_NON_COMMERCIAL")}>Not Commercial</${Btn}>
      </div>
    </div></div>`)}

    ${open.length === 0 && html`<div class="empty" style="padding:30px"><${Icon} name="check" size=28 />
      <div>Nothing is waiting for a decision.</div></div>`}

    ${done.length > 0 && html`<${Section} title=${"Decided (" + done.length + ")"} icon="check"
      sub="Recorded decisions. Later reconciliations respect these and will not ask again.">
      <table class="table"><thead><tr><th>Document</th><th>Decision</th><th>Reviewer</th><th>When</th><th>Reason</th></tr></thead>
      <tbody>${done.map((i) => html`<tr key=${i.fileId}>
        <td><div class="tiny">${i.filename}</div></td>
        <td><${Pill} tone="green">${i.decided.decision}</${Pill}></td>
        <td class="tiny">${i.decided.reviewer}</td>
        <td class="tiny">${fmt.date(i.decided.decidedAt)}</td>
        <td class="tiny muted">${i.decided.reason || "—"}</td>
      </tr>`)}</tbody></table>
    </${Section}>`}
  </div>`;
}

/* The page itself, and the module's default export.
   `export default` was attached to ContentRead, the small panel three hundred
   lines above this one. main.js imports the default and mounts it at
   /datahealth, so the route rendered that panel with no props and threw on its
   first line -- the whole Data Health page was dead, and every panel described
   here was unreachable. */

/* WHY A COMPLIANCE YEAR HOLDS NO ACCOUNTS.
   "No source document" against financial statements is the state this panel
   exists to justify. On the compliance screen a lawyer sees the plain fact --
   not found in source. Here is the working behind it: how many files that year
   holds, what each of them turned out to be, and which folders were walked. A
   year appears in this list only after every descendant of every one of its
   source folders has been given a disposition, so the absence is a finding and
   not a gap in the search. */
function SecpReconciliation() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.secpReconciliation().then(setD, (e) => setErr(e)); }, []);

  if (err) return html`<${Section} title="SECP reconciliation" icon="alertTriangle">
    <div class="tiny">${err.message || String(err)}</div></${Section}>`;
  if (!d) return html`<div class="tiny muted" style="padding:20px 2px">Reading the reconciliation…</div>`;
  if (!d.built) return html`<${Section} title="SECP reconciliation" icon="alertTriangle"
    sub="No reconciliation has been run against the compliance-year folders.">
    <div class="tiny muted">${d.detail}</div></${Section}>`;

  const t = d.totals;
  const ql = q.trim().toLowerCase();
  const rows = (d.yearsWithoutAccounts || [])
    .filter((r) => !ql || (r.entity + " " + r.cy).toLowerCase().includes(ql));

  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
      { value: t.entityYears, label: "Entity-years reconciled" },
      { value: t.files.toLocaleString(), label: "Files given a disposition" },
      { value: t.unclassified, label: "Unclassified", tone: t.unclassified ? "red" : "" },
      { value: t.countMismatches, label: "Count mismatches", tone: t.countMismatches ? "red" : "" },
      { value: t.yearsWithAccounts, label: "Years holding accounts" },
      { value: t.yearsWithoutAccounts, label: "Years without" },
    ]} />

    <${Section} title="How the documents were read" icon="book"
      sub=${"Reconciled " + (d.builtAt ? fmt.date(d.builtAt) : "—")
        + (d.probed ? " · ambiguous files were read through Drive's content index" : "")}>
      <div class="tiny muted" style="line-height:1.6">
        Every file under every compliance-year folder is walked to its leaves and given one
        disposition. <strong>${t.unclassified === 0 ? "None" : t.unclassified}</strong>
        ${t.unclassified === 0 ? " is left unclassified" : " remain unclassified"}, and
        <strong>${t.countMismatches === 0 ? "no" : t.countMismatches}</strong>
        entity-year differs between what Drive holds and what LegalOS counts.
      </div>
      ${d.contentFindings && d.contentFindings.recovered.length > 0 && html`
        <div class="tiny" style="padding-top:10px">
          <strong>${d.contentFindings.recovered.length} document${d.contentFindings.recovered.length === 1 ? "" : "s"}</strong>
          could not be identified from ${d.contentFindings.recovered.length === 1 ? "its" : "their"} filename and
          ${d.contentFindings.recovered.length === 1 ? "was" : "were"} read instead — matched on
          ${d.contentFindings.threshold}+ of ${d.contentFindings.probeWords.length} accounting terms
          in the document's own text:
          <ul style="margin:6px 0 0 16px">
            ${d.contentFindings.recovered.map((f) => html`<li key=${f.name} class="muted">
              ${f.name} — ${f.entity}, ${f.cy}</li>`)}
          </ul>
        </div>`}
    </${Section}>

    <${Section} title=${"Compliance years holding no accounts (" + rows.length + ")"} icon="alertTriangle"
      sub="Each was walked to the last file. The dispositions below are what the folder actually contains."
      actions=${html`<div style="width:220px"><${Input} value=${q} placeholder="Search entity or year…"
        onChange=${setQ} /></div>`}>
      ${rows.length === 0
        ? html`<div class="tiny muted">Every compliance year holds a set of accounts.</div>`
        : html`<div class="tablewrap"><table class="table">
            <thead><tr><th>Entity</th><th>Source</th><th>Year</th>
              <th style="text-align:right">Files</th><th>What the folder holds</th>
              <th style="text-align:right">Folders walked</th></tr></thead>
            <tbody>${rows.map((r) => html`<tr key=${r.entityKey + r.cy}>
              <td><div class="cell-strong">${r.entity}</div></td>
              <td><${Pill} tone="gray">${r.sourceGroup}</${Pill}></td>
              <td><span class="tiny">${r.cy}</span></td>
              <td style="text-align:right"><span class="tiny">${r.totalFiles}</span></td>
              <td><span class="tiny muted">${Object.entries(r.dispositions || {})
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => k.replace(/_/g, " ").toLowerCase() + " " + v).join(", ") || "empty folder"}</span></td>
              <td style="text-align:right" title=${(r.sourceFolders || []).join("\n")}>
                <span class="tiny">${(r.sourceFolders || []).length}</span></td>
            </tr>`)}</tbody>
          </table></div>`}
    </${Section}>
  </div>`;
}


/* WHERE EVERY ITEM IN THE LITIGATION DRIVE ROOT WENT.
   Technical by design: a lawyer does not need to know that a folder failed to
   match on a distinctive party name. What matters here is that nothing in the
   root is silently unaccounted for — and that where a folder has no case, the
   reason is written down rather than left as an absence. */
function LitigationLedger() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.litigation.ledger().then(setD, setErr); }, []);
  if (err) return html`<${Section} title="Litigation root" icon="alertTriangle">
    <div class="tiny">${err.message || String(err)}</div></${Section}>`;
  if (!d) return html`<div class="tiny muted" style="padding:20px 2px">Reading the litigation root…</div>`;
  const t = d.totals;
  const tone = (n) => (n ? "amber" : "");
  return html`<div class="col" style="gap:16px">
    <${StatStrip} stats=${[
    { value: t.files.toLocaleString(), label: "Files in the root" },
    { value: t.filesUnresolved, label: "Files unresolved", tone: t.filesUnresolved ? "red" : "" },
    { value: t.rootChildren, label: "Root children" },
    { value: t.rootChildrenUnresolved, label: "Root children unresolved", tone: t.rootChildrenUnresolved ? "red" : "" },
    { value: t.caseFolders, label: "Case folders" },
    { value: t.caseFoldersMatched, label: "Folders on a case" },
    { value: t.caseFoldersWithoutCase, label: "Folders with no case", tone: tone(t.caseFoldersWithoutCase) },
  ]} />

    <${Section} title="Root children" icon="folder"
      sub="Every first-level item under the litigation root, and the module it feeds.">
      <div class="tablewrap"><table class="table">
        <thead><tr><th>Item</th><th>Source family</th><th style="text-align:right">Files</th><th>Where it is read</th></tr></thead>
        <tbody>${d.rootChildren.map((c) => html`<tr key=${c.name}>
          <td><div class="cell-strong">${c.name}</div>
            ${c.source && html`<div class="tiny muted">${c.source}</div>`}</td>
          <td>${c.family ? html`<${Pill} tone="indigo">${c.family}</${Pill}>` : html`<${Pill} tone="red">unresolved</${Pill}>`}</td>
          <td style="text-align:right"><span class="tiny">${c.files}</span></td>
          <td><span class="tiny muted">${c.route || "—"}</span></td>
        </tr>`)}</tbody>
      </table></div>
    </${Section}>

    <${Section} title=${"Case folders with no case (" + (d.unmatchedCaseFolders || []).length + ")"} icon="alertTriangle"
      sub="Each one says why. A folder is never attached to a nearby case: a wrong document on a case is worse than a missing one.">
      ${!(d.unmatchedCaseFolders || []).length
    ? html`<div class="tiny muted">Every case folder in the root reaches a case.</div>`
    : html`<div class="tablewrap"><table class="table">
      <thead><tr><th>Folder</th><th>Source category</th><th style="text-align:right">Files</th>
        <th>Disposition</th><th>Why</th></tr></thead>
      <tbody>${d.unmatchedCaseFolders.map((c) => html`<tr key=${c.path}>
        <td><div class="cell-strong">${c.leaf}</div></td>
        <td><span class="tiny muted">${c.sourceCategory}</span></td>
        <td style="text-align:right"><span class="tiny">${c.files}</span></td>
        <td><${Pill} tone=${c.disposition === "NO_MATCHING_CASE" ? "amber" : "gray"}>
          ${c.disposition.replace(/_/g, " ").toLowerCase()}</${Pill}></td>
        <td><span class="tiny muted">${c.detail}</span></td>
      </tr>`)}</tbody>
    </table></div>`}
    </${Section}>
  </div>`;
}

export default function DataHealth() {
  // Tab lives in the URL so a link to a specific diagnostic actually opens it.
  const [sec, setSec] = useState(null);      // admin-only security posture
  useEffect(() => { api.securityHealth().then((r) => setSec(r), () => setSec(null)); }, []);
  // The Compliance rebuild's reconciliation — where every source row went, and
  // what every compliance Drive file is.
  const [cr, setCr] = useState(null);
  useEffect(() => { api.complianceReconciliation().then((r) => setCr(r), () => setCr(null)); }, []);
  const [dhq, patchDh] = useQuery();
  const tab = dhq.tab || "overview";
  const setTab = (t) => patchDh({ tab: t === "overview" ? "" : t });
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.registers.health().then((r) => { setD(r); setErr(null); }, (e) => setErr(e));
  useEffect(() => { load(); }, []);

  if (err) return html`<div class="page page--wide fade-in"><${PageHead} title="Data Health" />
    <div class="empty" style="padding:44px"><${Icon} name="lock" size=34 />
      <div>${err.status === 403 ? "Data Health is restricted to administrators." : "Could not load data health."}</div></div></div>`;
  if (!d) return html`<div class="page page--wide fade-in"><${PageHead} title="Data Health" sub="Reading the pipeline..." /></div>`;

  const dg = d.diagnostics || {};
  const disp = dg.rowDispositions || {};
  const docs = d.documentDispositions || {};
  /* Rolled up from the per-family final states, so the headline and the table
     can never drift apart — they are the same numbers added up two ways. */
  const totals = (d.families || []).reduce((t, f) => ({
    complete: t.complete + (f.complete || 0) + (f.native || 0),
    gap: t.gap + (f.completeWithGap || 0),
    precedence: t.precedence + (f.resolvedByPrecedence || 0),
    notEvidenced: t.notEvidenced + (f.notEvidenced || 0),
    ambiguous: t.ambiguous + (f.ambiguous || 0),
    hadConflict: t.hadConflict + (f.hadSourceConflict || 0),
  }), { complete: 0, gap: 0, precedence: 0, notEvidenced: 0, ambiguous: 0, hadConflict: 0 });
  /* A failed re-read used to be swallowed: the spinner stopped and nothing else
     happened, so the operator could not tell whether Drive was unreachable or
     the re-read had quietly succeeded. Say which, and say that the data on
     screen is still the last good read. */
  const refresh = () => {
    setBusy(true);
    api.registers.refresh().then(
      () => { toast("Drive re-read complete"); load(); },
      // api.js puts the server's `detail` in the Error's message and the whole
      // body on `payload`.
      (e) => toast((e && (e.message || (e.payload && e.payload.detail)))
        || "Drive could not be re-read just now — the data shown is the last good read.")
    ).finally(() => setBusy(false));
  };

  const problems = (d.problems || []).filter((p) => !q ||
    (p.title + " " + p.id + " " + p.family + " " + ((p.source && p.source.file) || "")).toLowerCase().includes(q.toLowerCase()));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Data Health" sub="Google Drive to trackers to records to documents. Every source row and every Drive file, accounted for." />

    <${StatStrip} stats=${[
      { value: dg.rawRowsSeen || 0, label: "Source rows read" },
      { value: dg.recordsOut || 0, label: "Records" },
      /* §44 — WHAT STILL NEEDS A PERSON, NOT WHAT THE INGEST RAN INTO.
         "Incomplete" and "Conflicting" counted every record the ingest ever
         stumbled on, including the ones an approved precedence rule settled
         long ago. Those are history and they are reported as history, below.
         The two figures here are the only ones anybody can act on: a value the
         estate does not hold, and a disagreement no rule can settle. */
      { value: totals.notEvidenced, label: "Source value not evidenced",
        tone: totals.notEvidenced ? "amber" : undefined,
        title: "The estate has been searched and does not hold the value. Each record says what was looked for." },
      { value: totals.ambiguous, label: "Needs human confirmation",
        tone: totals.ambiguous ? "red" : undefined,
        title: "The source offers more than one answer and no rule can choose between them." },
      { value: dg.unknownDrop || 0, label: "Unexplained drops", tone: (dg.unknownDrop || 0) ? "red" : undefined },
      { value: docs.UNRESOLVED || 0, label: "Unresolved documents", tone: (docs.UNRESOLVED || 0) ? "amber" : undefined },
    ]} />

    <div class="row wrap" style="gap:14px;margin:2px 0 10px" aria-label="Resolved source history">
      <span class="tiny muted">${"Resolved, and kept on the record: "}</span>
      <span class="tiny"><strong>${totals.complete.toLocaleString()}</strong>${" complete"}</span>
      <span class="tiny"><strong>${totals.precedence}</strong>${" settled by source precedence"}</span>
      <span class="tiny"><strong>${totals.gap}</strong>${" usable with a named gap"}</span>
      <span class="tiny"><strong>${totals.hadConflict}</strong>${" carried a source conflict at ingest"}</span>
    </div>

    <div class="row" style="gap:8px;margin:4px 0 14px;align-items:center">
      <${Pill} tone=${dg.reconciled ? "green" : "red"}>${dg.reconciled ? "Row ledger reconciles" : "LEDGER DOES NOT RECONCILE"}</${Pill}>
      <span class="tiny muted">${dg.expectedRecords} expected, ${dg.recordsOut} held</span>
      <div class="spacer"></div>
      <span class="tiny muted">Last read ${d.builtAt ? fmt.rel(d.builtAt) : "-"}</span>
      <${Btn} size="sm" variant="ghost" icon="refresh" onClick=${refresh} disabled=${busy}>${busy ? "Re-reading..." : "Re-read Drive"}</${Btn}>
    </div>

    <div style="margin-bottom:14px"><${Tabs} active=${tab} onChange=${setTab} tabs=${[
      { key: "overview", label: "Overview", icon: "activity" },
      { key: "rows", label: "Row dispositions", icon: "list" },
      { key: "problems", label: "Records needing attention", icon: "alertTriangle", count: d.problemCount || 0 },
      { key: "documents", label: "Document dispositions", icon: "file" },
      ...(d.contentRead ? [{ key: "content", label: "What we have read", icon: "book" }] : []),
      { key: "creview", label: "Commercial review queue", icon: "alertTriangle" },
      { key: "integrity", label: "Document integrity", icon: "alertTriangle" },
      { key: "sources", label: "Source registry", icon: "database", count: (d.sources || []).length },
      ...(cr ? [{ key: "compliance", label: "Compliance reconciliation", icon: "shield",
        count: cr.documents.unresolvedCount || undefined }] : []),
      /* The working behind every "no source document" on the SECP screens. */
      { key: "secp", label: "SECP compliance years", icon: "calendar" },
      /* Where every item in the litigation Drive root ended up. */
      { key: "litroot", label: "Litigation root", icon: "gavel" },
      ...(sec ? [{ key: "security", label: "Security posture", icon: "shield" }] : []),
    ]} /></div>

    ${tab === "content" && d.contentRead && html`<${ContentRead} c=${d.contentRead} />`}
    ${tab === "creview" && html`<${CommercialReview} />`}
    ${tab === "integrity" && html`<${DocumentIntegrity} />`}
    ${tab === "secp" && html`<${SecpReconciliation} />`}
    ${tab === "litroot" && html`<${LitigationLedger} />`}

    ${tab === "overview" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${Section} title="Per module" icon="layers" bodyClass="">
        <div style="overflow:auto"><table class="table"><thead><tr><th>Register</th><th style="text-align:right">Records</th><th style="text-align:right" title="Nothing missing and nothing open">Complete</th><th style="text-align:right" title="Two sources disagreed; a stated rule decided and both values are kept">By precedence</th><th style="text-align:right" title="Usable; a named field is absent from the estate">With a gap</th><th style="text-align:right" title="The estate does not hold a required value">Not evidenced</th><th style="text-align:right" title="The source offers more than one answer">Needs a person</th><th style="text-align:right">With documents</th></tr></thead>
        <tbody>${(d.families || []).map((f) => html`<tr key=${f.key}>
          <td class="cell-strong">${f.label}</td>
          <td style="text-align:right">${f.records}</td>
          <td style="text-align:right"><span class="tiny">${(f.complete || 0) + (f.native || 0)}</span></td>
          <td style="text-align:right">${f.resolvedByPrecedence ? html`<${Pill} tone="green">${f.resolvedByPrecedence}</${Pill}>` : "-"}</td>
          <td style="text-align:right">${f.completeWithGap ? html`<${Pill} tone="blue">${f.completeWithGap}</${Pill}>` : "-"}</td>
          <td style="text-align:right">${f.notEvidenced ? html`<${Pill} tone="amber">${f.notEvidenced}</${Pill}>` : "-"}</td>
          <td style="text-align:right">${f.ambiguous ? html`<${Pill} tone="red">${f.ambiguous}</${Pill}>` : "-"}</td>
          <td style="text-align:right">${f.withDocuments}</td>
        </tr>`)}</tbody></table></div>
      </${Section}>

      <${Section} title="Sync health" icon="refresh" bodyClass="col">
        ${[["Drive files indexed", (d.drive && d.drive.fileCount) || 0],
           ["Drive folders indexed", (d.drive && d.drive.folderCount) || 0],
           ["Source workbooks read", (d.sources || []).length],
           ["Source rows read", dg.rawRowsSeen || 0],
           ["Records normalized", dg.recordsOut || 0],
           ["Documents linked", dg.documentsLinked || 0],
           ["Documents unlinked", dg.documentsUnlinked || 0],
           ["Fuzzy links pruned", dg.prunedFuzzyLinks || 0],
           ["Ingest errors", (d.errors || []).length]].map(([l, v]) => html`<div key=${l} class="row" style="font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border)">
          <span class="muted">${l}</span><div class="spacer"></div><span class="strong">${v}</span></div>`)}
        ${d.lastDegradedIngest && html`<div class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning);margin-top:8px">
          <div class="tiny strong">Last ingest was rejected as degraded</div>
          <div class="tiny">${d.lastDegradedIngest.reason}</div>
          <div class="tiny muted">${d.lastDegradedIngest.at} - holding ${d.lastDegradedIngest.heldRecords} records</div>
        </div>`}
        ${(d.errors || []).length > 0 && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-top:8px">
          ${(d.errors || []).slice(0, 6).map((e, i) => html`<div key=${i} class="tiny">${e.file || e.stage}: ${e.error}</div>`)}</div>`}

        ${/* What the system can and cannot READ, said in terms of what it costs.
              A reader going missing once turned twenty-three real contracts into
              empty text with nothing failing, so it belongs on the screen -- but
              named by consequence ("legacy Word documents cannot be read"), never
              by package, because the package name means nothing to the person
              reading this page. */
          d.parserGate && !d.parserGate.ok && html`<div class="card card--pad" style="background:var(--danger-bg);border-color:var(--danger);margin-top:8px">
          <div class="tiny strong">Some documents cannot be read right now</div>
          ${(d.parserGate.missing || []).map((m, i) => html`<div key=${i} class="tiny">${m.reads} - cannot be read</div>`)}
          <div class="tiny muted">The last complete set of records is still being shown. It will not be replaced until this is fixed.</div>
        </div>`}
        ${d.parserGate && d.parserGate.ok && d.parserGate.assistantDegraded && html`<div class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning);margin-top:8px">
          <div class="tiny strong">The in-app assistant is unavailable</div>
          <div class="tiny muted">Records and documents are unaffected.</div>
        </div>`}
      </${Section}>

      ${/* The contract templates folder. Worth its own block because both of its
            findings are invisible from the registers: executed agreements were
            filed among the blank forms, and blank forms were being shown on live
            records as though they were that record's agreement. */
        d.templateLibrary && html`<${Section} title="Contract templates" icon="file"
        sub="A folder name is not evidence. Every file in the templates folder is classified by what it actually says.">
        <div style="overflow:auto"><table class="table">
          <thead><tr><th>State</th><th style="text-align:right">Files</th></tr></thead>
          <tbody>
            ${Object.entries(d.templateLibrary.byState || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<tr key=${k}>
              <td>${String(k).toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</td>
              <td style="text-align:right">${v}</td></tr>`)}
            <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${d.templateLibrary.files}</strong></td></tr>
            <tr><td>Not yet classified</td><td style="text-align:right">
              <${Pill} tone=${d.templateLibrary.unclassified ? "red" : "green"}>${d.templateLibrary.unclassified}</${Pill}></td></tr>
          </tbody></table></div>
        ${d.templateLibrary.executedInstrumentsFound > 0 && html`<div class="card card--pad" style="background:var(--warning-bg);border-color:var(--warning);margin-top:8px">
          <div class="tiny strong">${d.templateLibrary.executedInstrumentsFound} signed agreements were found stored in the templates folder</div>
          <div class="tiny muted">They are recorded as executed agreements, not as templates, and remain reachable from their records.</div>
        </div>`}
        ${d.templateLibrary.detachedFromRecords && d.templateLibrary.detachedFromRecords.removed > 0 && html`<div class="card card--pad" style="margin-top:8px">
          <div class="tiny strong">${d.templateLibrary.detachedFromRecords.removed} blank templates were removed from ${d.templateLibrary.detachedFromRecords.records} records</div>
          <div class="tiny muted">A blank agreement looks like a signed one until you open it. These are still in Drive and in the template library; they are no longer shown as a record's own document.</div>
        </div>`}
      </${Section}>`}
    </div>`}

    ${tab === "compliance" && cr && html`<div class="col" style="gap:16px">
      <${Section} title="Where every combined source row went" icon="list"
        sub="Lease / Loan / Service was one family; it is now three registers, split on the trackers' own Agreement Type.">
        <div style="overflow:auto"><table class="table">
          <thead><tr><th>Disposition</th><th style="text-align:right">Rows</th></tr></thead>
          <tbody>
            <tr><td>Combined source rows</td><td style="text-align:right"><strong>${cr.rows.combined.sourceRows}</strong></td></tr>
            <tr><td>→ Leases</td><td style="text-align:right">${cr.rows.combined.leases}</td></tr>
            <tr><td>→ Service Agreements</td><td style="text-align:right">${cr.rows.combined.services}</td></tr>
            <tr><td>→ Neither (NDA, MOU, SPA, franchise, novation)</td><td style="text-align:right">${cr.rows.combined.neither}</td></tr>
            <tr><td><strong>Reconciles</strong></td><td style="text-align:right">
              <${Pill} tone=${cr.rows.combined.balances ? "green" : "red"}>${cr.rows.combined.balances ? "YES" : "NO"}</${Pill}></td></tr>
          </tbody></table></div>
      </${Section}>

      <${Section} title="Loan trackers" icon="dollar"
        sub="The trackers are not one row per loan: the per-entity sheets are each loan's rollover history.">
        <div style="overflow:auto"><table class="table">
          <thead><tr><th>Disposition</th><th style="text-align:right">Rows</th></tr></thead>
          <tbody>
            <tr><td>Ingested source rows</td><td style="text-align:right"><strong>${cr.rows.loans.sourceRows}</strong></td></tr>
            <tr><td>→ Loan agreements</td><td style="text-align:right">${cr.rows.loans.trackerAgreements}</td></tr>
            <tr><td>→ Historical event rows</td><td style="text-align:right">${cr.rows.loans.historyRows}</td></tr>
            <tr><td>→ Repeated header rows (block separators)</td><td style="text-align:right">${cr.rows.loans.headerArtifacts}</td></tr>
            <tr><td><strong>Reconciles</strong></td><td style="text-align:right">
              <${Pill} tone=${cr.rows.loans.balances ? "green" : "red"}>${cr.rows.loans.balances ? "YES" : "NO"}</${Pill}></td></tr>
            <tr><td>+ Agreements evidenced only in Drive</td><td style="text-align:right">${cr.rows.loans.driveOnlyAgreements}</td></tr>
          </tbody></table></div>
      </${Section}>

      <${Section} title=${"Compliance document dispositions (" + cr.documents.total + " files)"} icon="file"
        sub="Every compliance Drive file is named. UNRESOLVED is the working queue.">
        <div style="overflow:auto"><table class="table">
          <thead><tr><th>Disposition</th><th style="text-align:right">Files</th><th>What it means</th></tr></thead>
          <tbody>
            ${Object.entries(cr.documents.disposition).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<tr key=${k}>
              <td><span class="cell-mono tiny">${k}</span></td>
              <td style="text-align:right"><strong>${v.toLocaleString()}</strong></td>
              <td><span class="tiny muted">${DOC_NOTE[k] || ""}</span></td></tr>`)}
            <tr><td><span class="cell-mono tiny">UNRESOLVED</span></td>
              <td style="text-align:right">${cr.documents.unresolvedCount
                ? html`<${Pill} tone="amber">${cr.documents.unresolvedCount}</${Pill}>`
                : html`<${Pill} tone="green">0</${Pill}>`}</td>
              <td><span class="tiny muted">${DOC_NOTE.UNRESOLVED}</span></td></tr>
          </tbody></table></div>
        ${cr.documents.unresolvedCount > 0 && html`<div class="col" style="gap:0;padding-top:10px">
          ${cr.documents.unresolved.map((u) => html`<div key=${u.id} class="feed__item">
            <div style="flex:1;min-width:0"><div class="tiny strong">${u.name}</div>
              <div class="tiny muted">${u.folderPath}</div></div></div>`)}
        </div>`}
      </${Section}>

      <${Section} title="Known unmatched, by reason" icon="alertTriangle"
        sub="Each of these needs a human to resolve the source — not a better heuristic.">
        <div style="overflow:auto"><table class="table">
          <thead><tr><th>Item</th><th style="text-align:right">Count</th></tr></thead>
          <tbody>
            <tr><td>Loan history rows not attached (ambiguous LRN, or a placeholder reference)</td>
              <td style="text-align:right">${cr.unmatched.loanHistoryRows}</td></tr>
            <tr><td>Drive loan folders contested between two loans</td>
              <td style="text-align:right">${cr.unmatched.contestedLoanFolders}</td></tr>
            <tr><td>Loans evidenced in Drive with no tracker row</td>
              <td style="text-align:right">${cr.unmatched.driveOnlyLoans}</td></tr>
            <tr><td>Licences evidenced in Drive with no tracker row</td>
              <td style="text-align:right">${cr.unmatched.driveOnlyLicences}</td></tr>
            <tr><td>Lease / service documents not matched to a tracker row</td>
              <td style="text-align:right">${cr.unmatched.unattachedSpendDocuments}</td></tr>
          </tbody></table></div>
      </${Section}>
    </div>`}

    ${tab === "rows" && html`<${Section} title="Where every source row went" icon="list"
      sub=${(dg.rawRowsSeen || 0) + " rows read from " + (d.sources || []).length + " workbooks. Every row ends in exactly one bucket."} bodyClass="">
      <div style="overflow:auto"><table class="table"><thead><tr><th>Disposition</th><th style="text-align:right">Rows</th><th>What it means</th></tr></thead>
      <tbody>${Object.entries(disp).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<tr key=${k}>
        <td><${Pill} tone=${k === "UNKNOWN_DROP" ? (v ? "red" : "gray") : k === "INGESTED_RECORD" ? "green" : k === "INCOMPLETE_SOURCE_RECORD" ? "amber" : "gray"}>${k}</${Pill}></td>
        <td style="text-align:right" class="strong">${v}</td>
        <td class="tiny muted">${DISPOSITION_NOTE[k] || ""}</td></tr>`)}</tbody></table></div>
    </${Section}>`}

    ${tab === "security" && sec && html`<div class="col" style="gap:14px">
      <div class="tiny muted">Checked ${fmt.rel(sec.checkedAt)}. These are states, not values — no key, token or session
        is reported here, and the tab is not shown to non-administrators.</div>
      ${[
        ["Cloudflare edge", [
          ["Access enforced at the edge", sec.edge.cloudflareAccessEnforced, "Requests reach the origin only through Cloudflare Access."],
          ["Dev bypass OFF", !sec.edge.devBypassActive, "A configured bypass email would accept an unverified identity."],
        ]],
        ["Origin", [
          ["App bound to loopback only", sec.origin.appLoopbackOnly, "Bound to " + sec.origin.appBindHost + ". A public bind answers without passing nginx."],
          ["nginx restricted to Cloudflare ranges", sec.origin.nginxCloudflareAllowList,
            sec.origin.nginxCloudflareAllowList
              ? sec.origin.nginxAllowRules + " allow rules installed"
              : "Needs one privileged step: sudo ./deploy/apply-origin-hardening.sh"],
        ]],
        ["Application", [
          ["Security headers", sec.application.securityHeaders, "nosniff, Referrer-Policy, Permissions-Policy"],
          ["Content-Security-Policy", sec.application.contentSecurityPolicy, "Scoped to the module CDN this app is built on"],
          ["Clickjacking blocked", sec.application.frameAncestorsNone, "frame-ancestors 'none'"],
          ["Session cookie HttpOnly", sec.application.sessionCookieHttpOnly, "Not readable from JavaScript"],
          ["Registers gated per family", sec.application.registersGatedPerFamily, "Module permission decides the rows, not the UI"],
          ["Documents scoped", sec.application.documentsScoped > 0, fmt.num(sec.application.documentsScoped) + " documents carry a module scope"],
        ]],
        ["Data", [
          ["Last ingest healthy", !sec.data.lastDegradedIngest,
            sec.data.lastDegradedIngest ? sec.data.lastDegradedIngest.reason : fmt.num(sec.data.records) + " records held"],
        ]],
      ].map(([group, rows]) => html`<${Section} key=${group} title=${group} icon="shield" bodyClass="col">
        ${rows.map(([label, ok, note]) => html`<div key=${label} class="row" style="gap:10px;padding:7px 2px;border-bottom:1px solid var(--border)">
          <${Pill} tone=${ok ? "green" : "amber"}>${ok ? "OK" : "ACTION"}</${Pill}>
          <div style="flex:1;min-width:0">
            <div class="tiny strong">${label}</div>
            <div class="tiny muted">${note}</div>
          </div>
        </div>`)}
      </${Section}>`)}
    </div>`}

    ${tab === "problems" && (problems.length === 0
      ? html`<div class="empty" style="padding:36px"><${Icon} name="check" size=32 /><div>No records need attention.</div></div>`
      : html`<${RegisterShell}
          ns="dh" rows=${problems}
          fields=${[
            { key: "family",  label: "Register", type: "multi", get: (p) => p.family },
            { key: "quality", label: "Issue",    type: "multi", get: (p) => p.quality },
            { key: "field",   label: "Missing field", type: "multi", multiValue: true, get: (p) => p.missingFields || [] },
            { key: "file",    label: "Source workbook", type: "multi", advanced: true,
              get: (p) => (p.source && p.source.file) || "" },
            { key: "sheet",   label: "Source sheet", type: "multi", advanced: true,
              get: (p) => (p.source && p.source.sheet) || "" },
          ]}
          columns=${(f) => [
            { key: "id", label: "Record", essential: true, mono: true, sortValue: true, plain: (p) => p.id,
              render: (p) => html`<div class="mono tiny">${p.id}</div>
                <div class="tiny muted" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title || "-"}</div>` },
            { key: "family", label: "Register", sortValue: true, plain: (p) => p.family,
              render: (p) => html`<span class="tiny">${p.family}</span>` },
            { key: "quality", label: "Final state", sortValue: true, plain: (p) => p.qualityState || p.quality,
              render: (p) => html`<${Pill} tone=${(p.qualityState || p.quality) === "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION" ? "red" : "amber"}>
                ${(p.qualityState || p.quality) === "SOURCE_AMBIGUITY_REQUIRES_HUMAN_CONFIRMATION" ? "Needs a decision" : "Not in the source"}</${Pill}>` },
            /* §31 — A REVIEW QUEUE, NOT A LIST OF ERROR CODES.
               Somebody has to choose between two values or accept that the
               estate is silent. What they need in front of them is the field,
               both candidate values, where each came from, and why no rule
               could pick — not "CONFLICTING_SOURCE". */
            { key: "detail", label: "What needs deciding",
              plain: (p) => (p.unresolvedConflicts || []).map((c) => c.field).join("; ")
                || Object.keys(p.notEvidenced || {}).join("; "),
              render: (p) => html`<div class="col" style="gap:6px;max-width:520px">
                ${(p.unresolvedConflicts || []).slice(0, 3).map((c, i) => html`<div key=${i} class="tiny">
                  <span class="strong">${c.field}</span>
                  <div style="margin-left:2px">
                    <div>${"A · " + String(c.kept).slice(0, 60)}
                      ${c.keptFrom && html`<span class="muted">${" — " + String(c.keptFrom).slice(0, 34)}</span>`}</div>
                    <div>${"B · " + String(c.alternative).slice(0, 60)}
                      ${c.alternativeFrom && html`<span class="muted">${" — " + String(c.alternativeFrom).slice(0, 34)}</span>`}</div>
                    <div class="muted">${c.why || ""}</div>
                  </div></div>`)}
                ${(p.candidates || []).length > 1 && html`<div class="tiny">
                  <span class="strong">${"identity"}</span>
                  <div class="muted">${p.candidates.length + " matters in the estate answer to this party: "
                    + p.candidates.map((c) => c.name).slice(0, 3).join(" · ")}</div></div>`}
                ${Object.entries(p.notEvidenced || {}).slice(0, 2).map(([f, v], i) => html`<div key=${"n" + i} class="tiny">
                  <span class="strong">${f}</span>
                  <div class="muted">${String(v.detail || "").slice(0, 200)}</div></div>`)}
                ${p.identityNote && html`<div class="tiny muted">${String(p.identityNote.detail || "").slice(0, 200)}</div>`}
              </div>` },
            { key: "source", label: "Source", plain: (p) => (p.source ? [p.source.file, p.source.sheet, p.source.row].join(" / ") : ""),
              render: (p) => html`<span class="tiny muted">${p.source ? (String(p.source.file || "").slice(0, 30) + " / " + String(p.source.sheet || "").slice(0, 18) + " / row " + (p.source.row != null ? p.source.row : "-")) : "-"}</span>` },
          ]}
          searchKeys=${["id", "title", "family", "quality", (p) => (p.missingFields || []).join(" "), (p) => (p.source && p.source.file) || ""]}
          searchPlaceholder="Search records needing attention…"
          noun=${["record", "records"]}
          exportName="data-health-issues" emptyIcon="alertTriangle" />`)}

    ${tab === "documents" && html`<div class="grid" style="grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <${Section} title="Every Drive file, classified" icon="file" sub=${Object.values(docs).reduce((a, b) => a + b, 0) + " files"} bodyClass="">
        <div style="overflow:auto"><table class="table"><thead><tr><th>Disposition</th><th style="text-align:right">Files</th><th>What it means</th></tr></thead>
        <tbody>${Object.entries(docs).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<tr key=${k}>
          <td><${Pill} tone=${k === "UNRESOLVED" ? (v ? "amber" : "gray") : k === "RECORD_DOCUMENT" ? "green" : "gray"}>${k}</${Pill}></td>
          <td style="text-align:right" class="strong">${v}</td>
          <td class="tiny muted">${DOC_NOTE[k] || ""}</td></tr>`)}</tbody></table></div>
      </${Section}>
      <${Section} title="Unresolved documents" icon="alertTriangle"
        sub=${(d.unresolvedDocuments || []).length ? "Files that could not be placed" : "Nothing unresolved"} bodyClass="col">
        ${(d.unresolvedDocuments || []).length === 0
          ? html`<div class="empty" style="padding:28px"><${Icon} name="check" size=30 /><div>Every Drive file has a disposition.</div></div>`
          : (d.unresolvedDocuments || []).slice(0, 60).map((u) => html`<div key=${u.id} class="feed__item" style="align-items:center">
              <div class="notif__ico" style="width:28px;height:28px;background:var(--warning-bg);color:var(--warning)"><${Icon} name="file" size=13 /></div>
              <div style="flex:1;min-width:0"><div class="tiny strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                <div class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.folderPath}</div></div>
            </div>`)}
      </${Section}>
    </div>`}

    ${tab === "sources" && html`<${Section} title="Source registry" icon="database"
      sub="Every workbook the ingest reads, and what it contributed." bodyClass="">
      <div style="overflow:auto"><table class="table"><thead><tr><th>Workbook</th><th>Folder</th><th style="text-align:right">Sheets</th><th style="text-align:right">Records</th><th>Feeds</th><th>Modified</th></tr></thead>
      <tbody>${(d.sources || []).slice().sort((a, b) => (b.records || 0) - (a.records || 0)).map((s) => html`<tr key=${s.fileId}>
        <td><div class="cell-strong tiny" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.file}</div><div class="mono tiny muted">${s.fileId}</div></td>
        <td class="tiny muted" style="max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.folder}</td>
        <td style="text-align:right">${s.sheets}</td>
        <td style="text-align:right" class="strong">${s.records}</td>
        <td>${(s.families || []).map((f) => html`<${Pill} key=${f} tone="blue">${f}</${Pill}>`)}</td>
        <td class="tiny muted">${s.modified ? fmt.date(s.modified) : "-"}</td>
      </tr>`)}</tbody></table></div>
    </${Section}>`}
  </div>`;
}
