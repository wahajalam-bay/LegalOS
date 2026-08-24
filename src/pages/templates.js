// Templates — document automation ("Builder") + version control (Feature 5).
import { html, cx, fmt, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Avatar, Pill, Status, Segmented, Modal, Drawer, Field, Input, AICard, Chip } from "../ui.js";
import { PageHead, StatStrip } from "../parts.js";
import { COUNTRIES, nameOf } from "../data.js";
import { useCollection, updateItem, addItem, nextId, nowIso } from "../store.js";
import { activeUser } from "../rbac.js";
import { navigate } from "../router.js";
import { toast } from "../toast.js";

/* ---- Feature 5: version helpers + line diff ---- */
const currentApproved = (t) => (t.versions || []).find((v) => v.status === "Approved") || (t.versions || [])[(t.versions || []).length - 1] || { version: "v" + t.version };
function bumpVersion(versions) {
  const nums = (versions || []).map((v) => parseFloat(String(v.version).replace(/[^0-9.]/g, ""))).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1.0;
  return "v" + (max + 0.1).toFixed(1);
}
// Tiny LCS line diff — no library.
function lineDiff(aText, bText) {
  const a = (aText || "").split("\n"), b = (bText || "").split("\n");
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: "same", v: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", v: a[i] }); i++; }
    else { out.push({ t: "add", v: b[j] }); j++; }
  }
  while (i < m) out.push({ t: "del", v: a[i++] });
  while (j < n) out.push({ t: "add", v: b[j++] });
  return out;
}
function DiffView({ a, b }) {
  const rows = lineDiff(a && a.body, b && b.body);
  return html`<div class="doc" style="padding:14px 16px;font-size:12.5px;line-height:1.7">
    ${rows.map((r, i) => html`<div key=${i} style=${r.t === "add" ? "background:color-mix(in srgb,var(--success) 16%,transparent);border-radius:3px" : r.t === "del" ? "background:color-mix(in srgb,var(--danger) 14%,transparent);border-radius:3px;text-decoration:line-through;opacity:.75" : ""}>
      <span class="mono" style="color:var(--text-3);margin-right:8px">${r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>${r.v || " "}
    </div>`)}
  </div>`;
}

function VersionDrawer({ t, onClose }) {
  const versions = t.versions || [];
  const sorted = [...versions].sort((x, y) => new Date(y.date) - new Date(x.date));
  const [mode, setMode] = useState("list");
  const [a, setA] = useState((sorted[1] || sorted[0] || {}).version);
  const [b, setB] = useState((sorted[0] || {}).version);
  const vById = (ver) => versions.find((v) => v.version === ver);
  const restore = (v) => updateItem("templates", t.id, { versions: [...versions, { version: bumpVersion(versions), date: nowIso(), author: "u1", status: "Draft", changelog: "Restored from " + v.version + " as a new draft.", body: v.body }] });
  return html`<${Drawer} title=${t.title + " · versions"} width=${540} onClose=${onClose}>
    <div class="col" style="gap:16px;padding:20px">
      <div class="row"><span class="tiny muted">Only one Approved version at a time · ${versions.length} total</span><div class="spacer"></div><${Segmented} value=${mode} onChange=${setMode} options=${[{ label: "History", value: "list" }, { label: "Compare", value: "compare" }]} /></div>
      ${mode === "list" ? html`<div class="col" style="gap:10px">
        ${sorted.map((v) => html`<div key=${v.version} class="card card--pad col" style="gap:6px">
          <div class="row" style="gap:8px"><span class="strong">${v.version}</span><${Status} value=${v.status} /><div class="spacer"></div><span class="tiny muted">${fmt.date(v.date)} · ${nameOf(v.author)}</span></div>
          <div class="tiny" style="line-height:1.5">${v.changelog}</div>
          ${v.status !== "Approved" ? html`<div class="row"><div class="spacer"></div><${Btn} variant="ghost" size="sm" icon="copy" onClick=${() => restore(v)}>Restore as new draft</${Btn}></div>` : ""}
        </div>`)}
      </div>` : html`<div class="col" style="gap:12px">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
          <${Field} label="Base"><select class="select" value=${a} onChange=${(e) => setA(e.target.value)}>${versions.map((v) => html`<option key=${v.version} value=${v.version}>${v.version} · ${v.status}</option>`)}</select></${Field}>
          <${Field} label="Compare against"><select class="select" value=${b} onChange=${(e) => setB(e.target.value)}>${versions.map((v) => html`<option key=${v.version} value=${v.version}>${v.version} · ${v.status}</option>`)}</select></${Field}>
        </div>
        <${DiffView} a=${vById(a)} b=${vById(b)} />
        <div class="row" style="gap:16px"><span class="tiny"><span class="tag-dot" style="background:var(--success)"></span> added in compare</span><span class="tiny"><span class="tag-dot" style="background:var(--danger)"></span> removed</span></div>
      </div>`}
    </div>
  </${Drawer}>`;
}

const RULES = [
  { c: "Country = Saudi Arabia", a: "Insert Saudi governing-law & Sharia-compliance clauses" },
  { c: "Payment > $1,000,000", a: "Add CFO approval step to the workflow" },
  { c: "Data processing = Yes", a: "Insert Data Processing Addendum (DPA)" },
  { c: "Auto-renewal = Yes", a: "Add 60-day opt-out renewal clause" },
  { c: "Counterparty = Government", a: "Insert public-sector & anti-bribery terms" },
];

const CAT_ICON = { Confidentiality: "lock", Commercial: "briefcase", Employment: "users", Procurement: "clipboard", "Real Estate": "building", "Data Privacy": "shield", Corporate: "gavel", Litigation: "scale" };

export default function Templates() {
  const templates = useCollection("templates");
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [gen, setGen] = useState(null);
  const [genCp, setGenCp] = useState("");
  const [genCountry, setGenCountry] = useState(COUNTRIES[0]);
  // STATIC generation, deliberately: the output IS the approved template body
  // (with the party/country stamped in) — no AI drafting here. Real clause-level
  // assembly lives in Module 3 (/drafting).
  const generateStatic = (t) => {
    const v = currentApproved(t);
    const bodyText = `${t.title.toUpperCase()}\n\nBetween: Northwind Global Holdings\nAnd: ${genCp.trim() || "[Counterparty]"}\nCountry: ${genCountry}\nTemplate: ${t.id} ${v.version} (approved)\n\n${v.body || "1. Standard clauses per the approved template."}`;
    const doc = {
      id: nextId("repository", "DOC-"),
      name: `${t.title} — ${genCp.trim() || "draft"} (${v.version}).docx`,
      kind: "Draft", source: "Generated",
      contractId: null, requestId: null, entityId: null,
      jur: genCountry, uploadedBy: activeUser().id, uploadedAt: nowIso(),
      pages: Math.max(2, Math.round((v.body || "").length / 900)), sizeKb: 96,
      ocrStatus: "Not required", ocrConfidence: 1,
      srNo: null, physicalRecordRef: null, officeLocation: null,
      storagePath: `/legal/templates/${t.id}/${genCp.trim() || "draft"}.docx`,
      driveLink: null, ocrText: bodyText, extractedFields: {},
      templateId: t.id, templateVersion: v.version,
    };
    addItem("repository", doc);
    updateItem("templates", t.id, { usage: (t.usage || 0) + 1 });
    setGen(null); setGenCp("");
    toast(doc.name + " created from the approved template");
    navigate("/repository/" + doc.id);
  };
  const [histId, setHistId] = useState(null);
  const hist = templates.find((t) => t.id === histId);
  const cats = ["All", ...new Set(templates.map((t) => t.category))];
  const mostUsed = [...templates].sort((a, b) => b.usage - a.usage)[0] || { title: "—" };
  let rows = templates.filter((t) => (cat === "All" || t.category === cat) && (!q || t.title.toLowerCase().includes(q.toLowerCase())));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Templates" sub="One master template, thousands of governed outputs — conditional logic assembles the right clauses automatically."
      actions=${html`<${Btn} variant="primary" icon="plus">New template</${Btn}>`} />
    <${StatStrip} stats=${[
      { value: templates.length, label: "Templates" },
      { value: mostUsed.title, label: "Most used" },
      { value: new Set(templates.map((t) => t.jurisdiction)).size, label: "Jurisdictions" },
      { value: "1,240", label: "Docs generated (mo)", trend: "+18%", trendDir: "up" },
    ]} />

    <div class="row wrap" style="gap:8px;margin-bottom:16px">
      <div style="width:260px"><${Input} placeholder="Search templates…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      ${cats.map((c) => html`<${Chip} key=${c} active=${cat === c} onClick=${() => setCat(c)}>${c}</${Chip}>`)}
    </div>

    <div class="grid grid--3">
      ${rows.map((t) => html`<div key=${t.id} class="card card--hover card--pad" style="cursor:pointer" onClick=${() => setGen(t)}>
        <div class="row" style="margin-bottom:12px">
          <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name=${CAT_ICON[t.category] || "template"} size=18 /></div>
          <div class="spacer"></div>
          <${Pill} tone="green">${currentApproved(t).version}</${Pill}>
          <${Pill} tone="gray">${t.category}</${Pill}>
        </div>
        <div class="strong" style="font-size:14.5px;margin-bottom:3px">${t.title}</div>
        <div class="tiny muted">${t.jurisdiction} · ${fmt.num(t.usage)} uses · updated ${fmt.rel(t.updated)}</div>
        <div class="row" style="gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <${Avatar} name=${nameOf(t.owner)} size="sm" />
          <span class="tiny muted">${nameOf(t.owner).split(" ")[0]}</span>
          <div class="spacer"></div>
          <button class="tiny" style="color:var(--brand);font-weight:600" onClick=${(e) => { e.stopPropagation(); setHistId(t.id); }}><${Icon} name="layers" size=12 style=${{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />${(t.versions || []).length} versions</button>
        </div>
      </div>`)}
    </div>

    ${gen && html`<${Modal} title="Generate document" icon="sparkles" width=${600} onClose=${() => setGen(null)}
      footer=${html`<${Btn} variant="ghost" onClick=${() => setGen(null)}>Cancel</${Btn}><${Btn} variant="gradient" icon="sparkles" onClick=${() => generateStatic(gen)}>Generate document</${Btn}>`}>
      <div class="col" style="gap:18px">
        <div class="row" style="gap:10px"><div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name=${CAT_ICON[gen.category] || "template"} size=18 /></div><div style="flex:1"><div class="strong">${gen.title}</div><div class="tiny muted">${gen.jurisdiction} · ${fmt.num(gen.usage)} uses</div></div><${Pill} tone="green" dot=${true}>Uses ${currentApproved(gen).version}</${Pill}></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
          <${Field} label="Counterparty"><${Input} placeholder="e.g. Acme Corp" value=${genCp} onInput=${(e) => setGenCp(e.target.value)} /></${Field}>
          <${Field} label="Country"><select class="select" value=${genCountry} onChange=${(e) => setGenCountry(e.target.value)}>${COUNTRIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></${Field}>
        </div>
        <div>
          <div class="row" style="margin-bottom:10px"><${Icon} name="gitbranch" size=16 style=${{ color: "var(--accent-500)" }} /><span class="strong tiny" style="margin-left:8px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)">Smart template rules</span></div>
          <div class="col" style="gap:8px">
            ${RULES.map((r, i) => html`<div key=${i} class="row" style="gap:10px;padding:9px 11px;background:var(--surface-2);border:1px solid var(--border);border-radius:9px">
              <${Pill} tone="indigo">IF</${Pill}>
              <span class="tiny strong">${r.c}</span>
              <${Icon} name="arrowRight" size=14 style=${{ color: "var(--text-3)", flex: "none" }} />
              <span class="tiny dim" style="flex:1">${r.a}</span>
            </div>`)}
          </div>
        </div>
        <${AICard} title="Static generation">The document is produced <b>verbatim from the approved template</b> (${"body kept in the output"}) with the party and country stamped in — nothing is drafted by AI here. For clause-level assembly with deviation control, use <b>Contract Intelligence → Create draft</b>.</${AICard}>
      </div>
    </${Modal}>`}
    ${hist && html`<${VersionDrawer} t=${hist} onClose=${() => setHistId(null)} />`}
  </div>`;
}
