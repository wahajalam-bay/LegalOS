// Settings → Knowledge Base.
//
// What this screen is for: saying plainly what LegalOS has taken from Google
// Drive, which module each piece feeds, and — the part people actually need —
// what is sitting in Drive that the system is NOT reading. A register that
// silently ingests nothing looks identical to one with nothing to ingest, so
// the gaps are given the same prominence as the totals.
import { html, cx, fmt, useState, useEffect } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section } from "../ui.js";
import { api } from "../api.js";
import { toast } from "../toast.js";

function bytes(n) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i];
}

export default function KnowledgeBaseSettings() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showGaps, setShowGaps] = useState(false);

  const [me, setMe] = useState(null);
  const load = () => api.registers.coverage().then(setData, setErr);
  useEffect(() => {
    load();
    // Who the SERVER says you are. The sign-in screen in this app is still a
    // persona picker that enforces nothing; this is the identity Cloudflare
    // Access verified and the one every /api answer is actually scoped to.
    api.health().then((h) => setMe(h.you || null), () => {});
  }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      await api.registers.refresh();
      await load();
      toast("Re-read every tracker in Drive");
    } catch (e) {
      toast(e.message || "Refresh failed", "error");
    }
    setBusy(false);
  };

  if (err) {
    return html`<${Section} title="Knowledge base" icon="database">
      <div class="card card--pad tiny muted" style="text-align:center;padding:26px">
        ${err.status === 403
          ? "The knowledge base is restricted to the legal department."
          : "Could not read the knowledge base: " + (err.message || "unknown error")}
      </div>
    </${Section}>`;
  }
  if (!data) {
    return html`<${Section} title="Knowledge base" icon="database">
      <div class="card card--pad tiny muted" style="text-align:center;padding:26px">Reading the library…</div>
    </${Section}>`;
  }

  const { drive, registers, coverage } = data;
  const counts = registers.counts || {};
  const labels = registers.labels || {};
  const surfaces = registers.surfaces || {};
  const dupes = registers.duplicates || {};
  const sources = registers.sources || [];
  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  // Group registers by the module that shows them.
  const byModule = {};
  for (const key of Object.keys(counts)) {
    const m = (surfaces[key] && surfaces[key].module) || "Not surfaced yet";
    (byModule[m] = byModule[m] || []).push(key);
  }

  const sourcesFor = (key) => sources.filter((s) => (s.families || []).includes(key) && s.records > 0);

  return html`<div class="col" style="gap:16px">

    ${me && html`<div class="card card--pad" style="padding:14px 16px">
      <div class="row" style="gap:12px;align-items:center">
        <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name="shield" size=17 /></div>
        <div style="flex:1;min-width:0">
          <div class="strong tiny">Signed in as ${me.email}</div>
          <div class="tiny muted">
            ${me.role}${me.admin ? " · administrator" : ""} — verified by Cloudflare Access.
            ${me.canReadKnowledge ? "" : " This account cannot read the knowledge base."}
          </div>
        </div>
        <${Pill} tone=${me.canReadKnowledge ? "green" : "amber"}>${me.canReadKnowledge ? "Full access" : "Restricted"}</${Pill}>
      </div>
      <div class="tiny muted" style="margin-top:10px;padding-top:9px;border-top:1px solid var(--border)">
        This is the identity the API is scoped to, whichever persona the app is displaying.
      </div>
    </div>`}

    <${Section} title="Connected library" icon="database"
      sub=${"Google Drive · read-only · " + (drive.indexedAt ? "indexed " + fmt.rel(new Date(drive.indexedAt).toISOString()) : "not yet indexed")}
      actions=${html`<${Btn} icon="refresh" onClick=${refresh} disabled=${busy}>${busy ? "Re-reading…" : "Re-read Drive"}</${Btn}>`}>
      <div class="grid grid--4" style="margin-bottom:14px">
        ${[["Documents", drive.fileCount.toLocaleString()], ["Folders", drive.folderCount.toLocaleString()],
           ["Library size", bytes(drive.totalBytes)], ["Records extracted", totalRecords.toLocaleString()]].map(([l, v]) => html`
          <div key=${l} class="card card--pad"><div class="metric__value">${v}</div><div class="metric__label" style="margin-top:6px">${l}</div></div>`)}
      </div>
      <div class="col">
        ${(drive.roots || []).map((r) => html`<div key=${r.name} class="feed__item" style="align-items:center">
          <div class="notif__ico" style="width:30px;height:30px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="folder" size=14 /></div>
          <div style="flex:1;min-width:0"><div class="strong tiny">${r.name}</div>
            <div class="tiny muted">${r.fileCount.toLocaleString()} documents · ${r.sections} sections</div></div>
          <span class="tiny muted">${bytes(r.bytes)}</span>
        </div>`)}
      </div>
      <div class="tiny muted" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        Sharing a Drive folder with the LegalOS service account is all it takes to add it — the library
        discovers what it can see on every refresh. Nothing here can be edited or deleted by LegalOS.
      </div>
    </${Section}>

    <${Section} title="What each module knows" icon="layers"
      sub="Every register, the tracker it came from, and where it is read">
      <div class="col" style="gap:18px">
        ${Object.entries(byModule).map(([moduleName, keys]) => html`<div key=${moduleName}>
          <div class="row" style="gap:8px;margin-bottom:8px">
            <div class="strong" style="font-size:13px">${moduleName}</div>
            <${Pill} tone="gray">${keys.reduce((n, k) => n + (counts[k] || 0), 0).toLocaleString()} records</${Pill}>
          </div>
          <div class="col">
            ${keys.map((k) => {
              const srcs = sourcesFor(k);
              const empty = counts[k] === 0;
              return html`<div key=${k} class="card card--pad" style="padding:12px">
                <div class="row" style="gap:10px">
                  <div class="strong tiny" style="flex:1">${labels[k] || k}</div>
                  <${Pill} tone=${empty ? "amber" : "green"}>${(counts[k] || 0).toLocaleString()}</${Pill}>
                </div>
                <div class="tiny muted" style="margin-top:4px">${(surfaces[k] && surfaces[k].note) || "Not shown in any module yet."}</div>
                <div class="tiny muted" style="margin-top:8px">
                  ${srcs.length
                    ? "From " + srcs.length + " tracker" + (srcs.length === 1 ? "" : "s") + ": " + srcs.slice(0, 3).map((s) => s.file).join(", ") + (srcs.length > 3 ? " +" + (srcs.length - 3) + " more" : "")
                    : "No tracker in Drive currently feeds this."}
                </div>
                ${dupes[k] > 0 && html`<div class="tiny muted" style="margin-top:6px">
                  ${dupes[k].toLocaleString()} duplicate rows collapsed — the same register exists more than once in Drive.
                </div>`}
              </div>`;
            })}
          </div>
        </div>`)}
      </div>
    </${Section}>

    <${Section} title="What is NOT being read" icon="alertCircle"
      sub=${coverage.spreadsheetsUnclaimed + " spreadsheets in Drive feed no register" + (coverage.emptySources.length ? " · " + coverage.emptySources.length + " matched a register but yielded nothing" : "")}
      actions=${html`<${Btn} onClick=${() => setShowGaps(!showGaps)}>${showGaps ? "Hide" : "Show"}</${Btn}>`}>
      <div class="tiny muted" style="padding:2px 4px 10px">
        A file appears here because no register recognises it, or because it parsed to zero rows.
        Neither is necessarily wrong — a ledger or a summary sheet is not a register — but this is
        where to look when something you expect to see in a module is missing.
      </div>
      ${showGaps && html`<div class="col">
        ${(coverage.unclaimed || []).map((u, i) => html`<div key=${"u" + i} class="feed__item" style="align-items:center">
          <div class="notif__ico" style="width:30px;height:30px;background:var(--bg-3);color:var(--text-3)"><${Icon} name="file" size=14 /></div>
          <div style="flex:1;min-width:0">
            <div class="tiny strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.file}</div>
            <div class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.reason}</div>
          </div>
          <span class="tiny muted">${bytes(u.size)}</span>
        </div>`)}
        ${(coverage.emptySources || []).map((e, i) => html`<div key=${"e" + i} class="feed__item" style="align-items:center">
          <div class="notif__ico" style="width:30px;height:30px;background:var(--warning-bg);color:var(--warning)"><${Icon} name="alertCircle" size=14 /></div>
          <div style="flex:1;min-width:0">
            <div class="tiny strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.file}</div>
            <div class="tiny muted">matched ${(e.families || []).join(", ")} but produced no rows</div>
          </div>
        </div>`)}
      </div>`}
    </${Section}>

    ${(registers.errors || []).length > 0 && html`<${Section} title="Read errors" icon="alertCircle" bodyClass="col">
      ${registers.errors.map((e, i) => html`<div key=${i} class="feed__item">
        <div style="flex:1"><div class="tiny strong">${e.file || e.stage}</div><div class="tiny muted">${e.error}</div></div>
      </div>`)}
    </${Section}>`}
  </div>`;
}
