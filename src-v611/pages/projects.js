// Project Documents — the ZD real-estate projects, read from Drive.
//
// The "ZD Projects Master Data" tracker lists each project's properties
// (ownership, JV structure, address) and, in the same Drive tree, holds the
// title deeds, partnership deeds, JV agreements and land documents. There was no
// existing home for these — the compliance page is entities & licences, the
// contracts book is executed agreements — so this is a minimal, read-only view
// in the same visual language: one row per project, expandable to its
// properties and its documents, every document viewed IN-APP.
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Pill, Section } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { Input } from "../ui.js";
import { navigate } from "../router.js";
import { useRegister } from "../live.js";
import { DocViewerModal } from "./contracts.js";

// Dedup a project's documents (fill-down means several property rows of the same
// project carry the same matched file set).
function projectDocs(rows) {
  const seen = new Map();
  for (const r of rows) for (const f of r.driveFiles || []) if (!seen.has(f.id)) seen.set(f.id, f);
  return [...seen.values()].sort((a, b) => (a.folderPath || "").localeCompare(b.folderPath || "") || a.name.localeCompare(b.name));
}
// The document's sub-category is the folder it sits in under the project
// ("Land Documents", "JV Agreement", "Partnership Deed" …).
const docGroup = (f) => (String(f.folderPath || "").split(" / ").slice(2).join(" / ") || "Documents");

export default function Projects() {
  const { rows, loading, error } = useRegister("properties");
  const [open, setOpen] = useState("");
  const [q, setQ] = useState("");
  const [doc, setDoc] = useState(null);
  const [rec, setRec] = useState(null);

  if (loading) return html`<div class="page page--wide fade-in"><${PageHead} title="Project Documents" sub="Reading the ZD projects tracker from Drive…" /></div>`;
  if (error || !rows || !rows.length) return html`<div class="page page--wide fade-in"><${PageHead} title="Project Documents" sub="No ZD project data found in the shared Drive folders." /></div>`;

  // Group property rows by project.
  const byProject = {};
  for (const r of rows) { const k = r.project || "Unattributed"; (byProject[k] = byProject[k] || []).push(r); }
  let projects = Object.entries(byProject).map(([name, list]) => ({
    name, list,
    entity: (list.find((r) => r.entity) || {}).entity || "",
    city: (list.find((r) => r.city) || {}).city || "",
    docs: projectDocs(list),
  })).sort((a, b) => b.docs.length - a.docs.length || a.name.localeCompare(b.name));

  const totalDocs = projects.reduce((s, p) => s + p.docs.length, 0);
  const cities = new Set(rows.map((r) => r.city).filter(Boolean));
  if (q) { const t = q.toLowerCase(); projects = projects.filter((p) => (p.name + " " + p.entity + " " + p.city).toLowerCase().includes(t)); }

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Project Documents"
      sub="Every ZD real-estate project — its properties, ownership and title documents, read from Drive and viewed in-app." />
    <${StatStrip} stats=${[
      { value: Object.keys(byProject).length, label: "Projects" },
      { value: rows.length, label: "Property records" },
      { value: totalDocs, label: "Documents" },
      { value: cities.size, label: "Cities" },
    ]} />

    <div class="row wrap" style="gap:8px;margin:4px 0 14px">
      <div style="width:280px"><${Input} placeholder="Search projects…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    </div>

    <${Section} title="Projects" icon="building" sub=${projects.length + " project" + (projects.length === 1 ? "" : "s")} bodyClass="col">
      ${projects.map((p) => {
        const isOpen = open === p.name;
        const groups = {};
        for (const f of p.docs) { const g = docGroup(f); (groups[g] = groups[g] || []).push(f); }
        return html`<div key=${p.name}>
          <button type="button" class=${cx("feed__item", "clickable")} style="align-items:center"
            aria-expanded=${isOpen ? "true" : "false"} onClick=${() => setOpen(isOpen ? "" : p.name)}>
            <div class="notif__ico" style="width:32px;height:32px;background:var(--brand-soft);color:var(--brand)"><${Icon} name="building" size=15 /></div>
            <div style="flex:1;min-width:0">
              <div class="strong tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
              <div class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${[p.entity, p.city].filter(Boolean).join(" · ") || "—"} · ${p.list.length} propert${p.list.length === 1 ? "y" : "ies"}</div>
            </div>
            ${p.docs.length ? html`<${Pill} tone="indigo">${p.docs.length} doc${p.docs.length === 1 ? "" : "s"}</${Pill}>` : html`<span class="tiny muted">no documents</span>`}
            <${Icon} name=${isOpen ? "chevronDown" : "chevronRight"} size=15 style=${{ color: "var(--text-3)" }} />
          </button>
          ${isOpen && html`<div class="col" style="padding-left:34px;gap:10px;margin:6px 0 12px">
            ${p.list.length > 0 && html`<div class="col" style="gap:2px">
              <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:2px">Properties (${p.list.length})</div>
              ${p.list.map((pr, i) => html`<button type="button" key=${"pr" + i} class="feed__item clickable" style="align-items:center;padding:6px 8px" onClick=${() => navigate("/rec/property/" + pr.id)}>
                <${Icon} name="grid" size=14 style=${{ color: "var(--brand)", flex: "none" }} />
                <div class="tiny" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pr.address || pr.project}</div>
                ${(pr.driveFiles || []).length ? html`<${Pill} tone="indigo">${pr.driveFiles.length}</${Pill}>` : ""}
                <${Icon} name="chevronRight" size=13 style=${{ color: "var(--text-3)" }} />
              </button>`)}
            </div>`}
            ${Object.entries(groups).map(([g, fs]) => html`<div key=${g} class="col" style="gap:2px">
              <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:2px">${g}</div>
              ${fs.map((f) => html`<button type="button" key=${f.id} class="feed__item clickable" style="align-items:center;padding:6px 8px"
                onClick=${() => setDoc({ files: p.docs, i: p.docs.indexOf(f) })}>
                <${Icon} name="file" size=14 style=${{ color: "var(--brand)", flex: "none" }} />
                <div class="tiny" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
                <span class="tiny muted">${(f.mimeType || "").split(/[/.]/).pop().slice(0, 12).toUpperCase()}</span>
              </button>`)}
            </div>`)}
            ${!p.docs.length && html`<div class="tiny muted" style="padding:6px 4px">No documents matched this project in Drive.</div>`}
          </div>`}
        </div>`;
      })}
    </${Section}>
    ${doc && html`<${DocViewerModal} c=${null} files=${doc.files} index=${doc.i} onIndex=${(i) => setDoc({ ...doc, i })} onClose=${() => setDoc(null)} />`}
  </div>`;
}
