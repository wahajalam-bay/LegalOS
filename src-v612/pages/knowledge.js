// Knowledge Base — playbooks, precedents, opinions, SOPs.
import { html, cx, fmt, useState, useEffect, useMemo } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Chip, Section, AICard, Modal, Field, Input } from "../ui.js";
import { PageHead } from "../parts.js";
import { nameOf } from "../data.js";
import { useCollection, addItem, updateItem, nextId, nowIso, proposeConfigChange } from "../store.js";
import { useActiveUser, canConfigure, canProposeConfig } from "../rbac.js";
import { toast } from "../toast.js";
import { api } from "../api.js";
import { DocViewerModal } from "./contracts.js";

// Editor for a playbook — the Director publishes directly; an AD proposes the
// change for the Director to publish (PRD §2).
export function PlaybookEditor({ pb, viewer, onClose }) {
  const [title, setTitle] = useState(pb ? pb.title : "");
  const [area, setArea] = useState(pb ? pb.area : "");
  const publish = canConfigure(viewer);
  const save = () => {
    if (!title.trim()) { toast("A title is required", "error"); return; }
    if (publish) {
      if (pb) { updateItem("playbooks", pb.id, { title: title.trim(), area: area.trim(), updatedAt: nowIso() }); toast("Playbook published"); }
      else { addItem("playbooks", { id: nextId("playbooks", "PB-"), title: title.trim(), area: area.trim(), icon: "book", updatedAt: nowIso() }); toast("Playbook added"); }
    } else {
      proposeConfigChange("playbooks", (pb ? "Edit" : "New") + " playbook — " + title.trim(), { id: pb && pb.id, title: title.trim(), area: area.trim() }, viewer.id);
      toast("Proposed to the Director for publishing", "info");
    }
    onClose();
  };
  return html`<${Modal} title=${pb ? "Edit playbook" : "New playbook"} icon="book" width=${520} onClose=${onClose}
    footer=${html`<${Btn} onClick=${onClose}>Cancel</${Btn}><${Btn} variant="primary" icon=${publish ? "check" : "send"} onClick=${save}>${publish ? "Publish" : "Propose to Director"}</${Btn}>`}>
    ${!publish && html`<div class="banner banner--info" style="margin-bottom:12px"><${Icon} name="alertCircle" size=15 /><span class="tiny">You can propose changes; the Director publishes them.</span></div>`}
    <${Field} label="Title *"><${Input} value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="e.g. Commercial Contracting Playbook" /></${Field}>
    <${Field} label="Area / scope"><${Input} value=${area} onInput=${(e) => setArea(e.target.value)} placeholder="e.g. Commercial · fallback positions" /></${Field}>
  </${Modal}>`;
}
// Emptied 2026-09-13: these were invented. Real opinions and SOPs live in
// the Drive library above.
const OPINIONS = [];
// Emptied 2026-09-13: these were invented. Real opinions and SOPs live in
// the Drive library above.
const SOPS = [];

/* ---------------- The real document library (Google Drive) ----------------
   Everything above this line is prototype content held in localStorage. This
   section is different: it is a live, read-only view of the legal department's
   Drive folder, served through /api/knowledge so the browser never holds a
   Google credential. Read-only is enforced at the credential itself — the
   service account has drive.readonly — so nothing here can alter a document. */

function bytes(n) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i];
}

const DOC_ICON = (mime = "") => {
  if (mime.includes("pdf")) return "file";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "grid";
  if (mime.includes("document") || mime.includes("word")) return "fileCheck";
  if (mime.includes("presentation")) return "layers";
  if (mime.includes("image")) return "scan";
  return "file";
};

// One place to turn an API failure into something a lawyer can act on.
function explain(err) {
  if (!err) return null;
  if (err.status === 403) return { tone: "muted", title: "Restricted to the legal department", body: "The document library is available to the legal team. Your account is signed in but not on the legal roster." };
  if (err.status === 401) return { tone: "warn", title: "Not signed in", body: "Cloudflare Access did not present a verified identity for this session. Reload the page to sign in again." };
  if (err.payload && err.payload.error === "not_configured") return { tone: "muted", title: "Not connected yet", body: "No Drive folder has been linked as the knowledge base. Once the folder is shared with the LegalOS service account and its id is set, every document appears here automatically." };
  return { tone: "warn", title: "The library could not be read", body: err.message || "Unknown error" };
}

function Notice({ info }) {
  if (!info) return null;
  return html`<div class="card card--pad" style="text-align:center;padding:28px 24px">
    <div class="metric__icon center" style="width:44px;height:44px;border-radius:14px;margin:0 auto 12px;background:var(--bg-3);color:var(--text-3)"><${Icon} name=${info.tone === "warn" ? "alertCircle" : "folder"} size=20 /></div>
    <div class="strong" style="font-size:14px;margin-bottom:4px">${info.title}</div>
    <div class="tiny muted" style="max-width:460px;margin:0 auto;line-height:1.5">${info.body}</div>
  </div>`;
}

function DocRow({ f, onOpen }) {
  return html`<a key=${f.id} class="feed__item clickable" href=${api.knowledge.fileUrl(f.id)} target="_blank" rel="noopener"
      onClick=${onOpen ? (e) => { e.preventDefault(); onOpen(); } : null}
      style="align-items:center;text-decoration:none;color:inherit">
    <div class="notif__ico" style="width:34px;height:34px;background:var(--brand-soft);color:var(--brand)"><${Icon} name=${DOC_ICON(f.mimeType)} size=16 /></div>
    <div style="flex:1;min-width:0">
      <div class="strong tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
      <div class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${f.folderPath || "Knowledge base"}${f.size ? " · " + bytes(f.size) : ""}${f.modifiedTime ? " · " + fmt.rel(f.modifiedTime) : ""}
      </div>
    </div>
    ${f.match === "content" && html`<${Pill} tone="indigo">in text</${Pill}>`}
    <${Icon} name="chevronRight" size=15 style=${{ color: "var(--text-3)" }} />
  </a>`;
}

export function DriveLibrary({ q }) {
  const [tree, setTree] = useState(null);
  const [err, setErr] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState("");
  // The in-page viewer: which list is open in it, and at which position.
  const [viewer, setViewer] = useState(null); // { files, index } | null

  // Ask the PUBLIC health endpoint first, then only call the protected ones if
  // it says we are signed in and connected. Calling /api/knowledge/tree blind
  // makes the browser log a failed resource whenever the caller is not
  // authenticated — a real console error on a page that is behaving correctly.
  useEffect(() => {
    let alive = true;
    api.health().then(
      (h) => {
        if (!alive) return;
        if (!h.authenticated) { setErr({ status: 401 }); return; }
        if (!h.config || !h.config.drive || !h.config.drive.folderConfigured) {
          setTree({ configured: false, folders: [], fileCount: 0, folderCount: 0, totalBytes: 0, indexedAt: 0 });
          return;
        }
        api.knowledge.tree().then(
          (t) => alive && setTree(t),
          (e) => alive && setErr(e)
        );
      },
      (e) => alive && setErr(e)
    );
    return () => { alive = false; };
  }, []);

  // Debounced, because Drive's full-text search is a network call per keystroke
  // otherwise — and it is the expensive half of this page.
  useEffect(() => {
    const term = (q || "").trim();
    if (!term || err || (tree && tree.configured === false)) { setResults(null); return; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      api.knowledge.search(term).then(
        (r) => { if (alive) { setResults(r); setBusy(false); } },
        (e) => { if (alive) { setErr(e); setBusy(false); } }
      );
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [q, err, tree]);

  const info = explain(err) || (tree && tree.configured === false ? {
    tone: "muted",
    title: "Not connected yet",
    body: "No Drive folder has been linked as the knowledge base. Once the folder is shared with the LegalOS service account and its id is set, every document appears here automatically.",
  } : null);
  if (info) return html`<${Section} title="Document Library" icon="library" sub="The legal department's Drive folder"><${Notice} info=${info} /></${Section}>`;
  if (!tree) return html`<${Section} title="Document Library" icon="library" sub="Reading the Drive folder…"><div class="card card--pad tiny muted" style="text-align:center;padding:24px">Loading…</div></${Section}>`;
  if (tree.error) return html`<${Section} title="Document Library" icon="library"><${Notice} info=${{ tone: "warn", title: "Drive could not be read", body: tree.error }} /></${Section}>`;

  // folderCount is every folder; tree.folders is only those holding documents.
  // Showing the latter under a "folders" label understated the library.
  const sub = tree.fileCount.toLocaleString() + " documents · " + (tree.folderCount || 0).toLocaleString() + " folders · " +
    bytes(tree.totalBytes) + (tree.indexedAt ? " · indexed " + fmt.rel(new Date(tree.indexedAt).toISOString()) : "");

  const viewerEl = viewer && html`<${DocViewerModal} files=${viewer.files} index=${viewer.index}
    onIndex=${(i) => setViewer({ ...viewer, index: i })} onClose=${() => setViewer(null)} initialQuery=${(q || "").trim()} />`;

  if (results) {
    return html`<div>${viewerEl}<${Section} title="Search results" icon="search"
      sub=${busy ? "Searching…" : results.results.length + " match" + (results.results.length === 1 ? "" : "es") + " for “" + results.term + "”" + (results.contentHits ? " · " + results.contentHits + " found inside document text" : "")}
      bodyClass="col">
      ${results.results.length === 0 && !busy && html`<div class="card card--pad tiny muted" style="text-align:center;padding:22px">Nothing matched. Drive searches inside PDFs too, so try a phrase from the document.</div>`}
      ${results.results.map((f, i) => html`<${DocRow} key=${f.id} f=${f} onOpen=${() => setViewer({ files: results.results, index: i })} />`)}
    </${Section}></div>`;
  }

  // Four top-level folders, not 856 folder cards. Pick a root, then a section
  // inside it — that mirrors how the department already files this material.
  return html`<div>${viewerEl}<${Section} title="Document Library" icon="library" sub=${sub}>
    <div class="grid grid--2">
      ${tree.roots.map((r) => html`<button type="button" key=${r.name}
        class="card card--hover card--pad clickable cardbtn"
        aria-expanded=${open === r.name ? "true" : "false"}
        onClick=${() => setOpen(open === r.name ? "" : r.name)}>
        <div class="row" style="margin-bottom:12px">
          <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name="folder" size=18 /></div>
          <div class="spacer"></div>
          <${Icon} name=${open === r.name ? "chevronDown" : "chevronRight"} size=15 style=${{ color: "var(--text-3)" }} />
        </div>
        <div class="strong" style="font-size:14px;margin-bottom:3px;word-break:break-word">${r.name}</div>
        <div class="tiny muted">${r.fileCount.toLocaleString()} documents · ${bytes(r.bytes)} · ${r.folders.length} sections</div>
        ${r.lastModified && html`<div class="tiny muted" style="margin-top:10px">Updated ${fmt.rel(r.lastModified)}</div>`}
      </button>`)}
    </div>
    ${open && html`<${RootSections} root=${tree.roots.find((r) => r.name === open)} onOpen=${(files, i) => setViewer({ files, index: i })} />`}
  </${Section}></div>`;
}

// The sections inside one root. Long lists are capped with a "show all" rather
// than rendered whole — one of these roots has 298 sections.
function RootSections({ root, onOpen }) {
  const [openSec, setOpenSec] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (!root) return null;
  const secs = showAll ? root.folders : root.folders.slice(0, 24);
  return html`<div class="col" style="margin-top:14px">
    <div class="tiny muted" style="padding:2px 4px 8px">${root.name} · ${root.folders.length} sections</div>
    ${secs.map((f) => {
      const full = f.name === "(top level)" ? root.name : root.name + " / " + f.name;
      const isOpen = openSec === full;
      return html`<div key=${f.name}>
        <button type="button" class="feed__item clickable" style="align-items:center"
          aria-expanded=${isOpen ? "true" : "false"}
          onClick=${() => setOpenSec(isOpen ? "" : full)}>
          <div class="notif__ico" style="width:34px;height:34px;background:var(--bg-3);color:var(--text-3)"><${Icon} name="folder" size=15 /></div>
          <div style="flex:1;min-width:0">
            <div class="strong tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name === "(top level)" ? "Top level" : f.name}</div>
            <div class="tiny muted">${f.fileCount} document${f.fileCount === 1 ? "" : "s"} · ${bytes(f.bytes)}</div>
          </div>
          <${Icon} name=${isOpen ? "chevronDown" : "chevronRight"} size=15 style=${{ color: "var(--text-3)" }} />
        </button>
        ${isOpen && html`<${FolderFiles} folder=${full} root=${root.name} onOpen=${onOpen} />`}
      </div>`;
    })}
    ${!showAll && root.folders.length > 24 && html`<button type="button" class="feed__item clickable" style="justify-content:center" onClick=${() => setShowAll(true)}>
      <div class="tiny strong" style="color:var(--brand)">Show all ${root.folders.length} sections</div>
    </button>`}
  </div>`;
}

// Straight from the server's warm index — no Drive round trip per click.
function FolderFiles({ folder, root, onOpen }) {
  const [files, setFiles] = useState(null);
  useEffect(() => {
    let alive = true;
    setFiles(null);
    api.knowledge.files(folder, root).then(
      (r) => alive && setFiles(r.files || []),
      () => alive && setFiles([])
    );
    return () => { alive = false; };
  }, [folder, root]);
  if (!files) return html`<div class="tiny muted" style="padding:12px 0 12px 46px">Opening…</div>`;
  if (!files.length) return html`<div class="tiny muted" style="padding:12px 0 12px 46px">No documents directly in this section.</div>`;
  return html`<div class="col" style="padding-left:34px">
    ${files.map((f, i) => html`<${DocRow} key=${f.id} f=${f} onOpen=${onOpen ? () => onOpen(files, i) : null} />`)}
  </div>`;
}

/* THE KNOWLEDGE BASE IS THE DOCUMENT ESTATE.
   This page used to be four things at once: an ask box, the Drive library, a
   playbook grid, and two panels ("Legal Opinions", "SOPs & Guides") rendering
   EMPTY arrays — invented content that was deleted in September and left
   behind as two headed cards with nothing under them. A card with a title and
   no body is the clearest possible signal that a product is a mock-up.

   What is here now is the library and the search over it. Playbooks and
   precedents — which are written material, maintained by Legal, not files in
   Drive — are their own page at /playbooks. */
export default function Knowledge() {
  const [q, setQ] = useState("");
  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Knowledge Base"
      sub="Every document the legal department holds in Drive — searched by name and by the text inside the file." />

    <div class="card card--pad" style="text-align:center;padding:32px 24px;margin-bottom:8px;background:linear-gradient(135deg,var(--brand-soft),var(--accent-soft))">
      <div class="metric__icon center" style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#0d7a3f,#0891b2);color:#fff;margin:0 auto 14px"><${Icon} name="search" size=24 /></div>
      <div style="font-size:20px;font-weight:750;letter-spacing:-.02em">Search the knowledge base</div>
      <div class="muted" style="margin:6px 0 16px">Looks inside PDFs and scanned documents, not only at file names</div>
      <div class="inputgroup" style="max-width:620px;margin:0 auto">
        <label class="sr-only" for="kb-ask">Search the knowledge base</label>
        <${Icon} name="search" size=17 />
        <input id="kb-ask" class="input" type="search" style="height:44px;padding-left:40px"
          placeholder="e.g. liability cap, force majeure, PACRA rating mandate"
          value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    </div>

    <div style="height:16px"></div>
    <${DriveLibrary} q=${q} />
  </div>`;
}
