/* COMPANIES — the primary compliance object (§40).
 *
 * A company is the umbrella record: its projects, loans, licences, statutory
 * filings, resolutions, contracts and cases all hang off it. The register used
 * to be assembled in the browser by loading six registers and joining them on
 * an entity name, which meant a compliance account — the people this page is
 * for — could not read half of them and saw a company with no contracts and no
 * cases rather than a company whose contracts they may not open.
 *
 * It is now assembled on the server from every source at once and trimmed to
 * what the caller may see, so the counts on screen and the records behind them
 * are the same set, and a family that was withheld says so.
 *
 * AND NOTHING ABOUT A COMPANY IS INVENTED. Directors, CEO, company secretary,
 * incorporation date and parent company are asked for by the brief and are in
 * no connected source. They are shown as not evidenced, next to the filed
 * documents that would answer them, rather than filled with plausible values.
 */
import { html, cx, fmt, useState, useEffect, useMemo, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Status, Section, Empty, Chip } from "../ui.js";
import { PageHead, StatStrip, DataTable, Toolbar } from "../parts.js";
import { navigate, useQuery } from "../router.js";
import { api } from "../api.js";
import { RegisterShell } from "../register.js";

/* THE COMPANY KEY, NORMALISED EXACTLY AS THE SERVER NORMALISES IT.
   `entityKey` in api/entities.js is the canonical rule; this is the same rule
   on the client, so a link built in the browser resolves on the server. Export
   it — the command palette and every "open this company" link use it, and a
   second spelling of the rule is how "Zameen Media Pvt Ltd" and "Zameen Media
   (Private) Limited" stopped being one company. */
export const normEntity = (s) => String(s || "").toLowerCase()
  .replace(/\(.*?\)/g, " ")
  .replace(/\b(private|pvt|limited|ltd|smc|company|group|the|and|co)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
export const entitySlug = (s) => encodeURIComponent(normEntity(s));
/* THE ADDRESS OF A COMPANY, built in one place.
   A company is addressed by its NORMALISED NAME, because that is the key the
   server assembles it under. Several callers were concatenating an internal
   entity id instead — /companies/CO-22, and /companies/null where the record
   named no entity at all. This returns null when there is nothing to address,
   so a caller can decline to render the link rather than render a broken one. */
export const companyPath = (name) => {
  const k = normEntity(name);
  return k ? "/companies/" + encodeURIComponent(k) : null;
};

/* ------------------------------------------------------------------ hooks */

function useCompanies() {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    api.companies.list().then(
      (d) => alive && setS({ data: d, loading: false, error: null }),
      (e) => alive && setS({ data: null, loading: false, error: e }));
    return () => { alive = false; };
  }, []);
  return s;
}
function useCompany(key) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setS({ data: null, loading: true, error: null });
    api.companies.get(key).then(
      (d) => alive && setS({ data: d, loading: false, error: null }),
      (e) => alive && setS({ data: null, loading: false, error: e }));
    return () => { alive = false; };
  }, [key]);
  return s;
}
function useStructure(enabled) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api.companies.structure().then(
      (d) => alive && setS({ data: d, loading: false, error: null }),
      (e) => alive && setS({ data: null, loading: false, error: e }));
    return () => { alive = false; };
  }, [enabled]);
  return s;
}

const GROUP_LABEL = { group: "Group", "non-group": "Non-group", unplaced: "Not placed" };
const NOT_EVIDENCED = "Not evidenced in any connected source";

/* A field the sources do not state. Written out rather than left blank, so a
   reader can tell "we do not hold this" from "this company has none". */
function Unevidenced({ children }) {
  return html`<span class="tiny muted" title=${NOT_EVIDENCED}>${children || NOT_EVIDENCED}</span>`;
}

/* --------------------------------------------------------------- register */

const companyFields = [
  { key: "type", label: "Company type", type: "multi", get: (r) => r.typeLabel },
  { key: "group", label: "Group / non-group", type: "multi", get: (r) => GROUP_LABEL[r.group] },
  { key: "hasProjects", label: "Has projects", type: "multi", get: (r) => (r.counts.projects ? "Yes" : "No") },
  { key: "hasLinks", label: "Has related companies", type: "multi",
    get: (r) => (r.counts.loans ? "Yes — evidenced by lending" : "Not evidenced") },
  { key: "agm", label: "AGM required", type: "multi",
    get: (r) => (r.agmApplies === true ? "Yes" : r.agmApplies === false ? "No — legal form does not require one" : "Legal form not determined") },
  { key: "state", label: "Holds records", type: "multi", get: (r) => (r.empty ? "No operational records" : "Active records") },
  { key: "statutory", label: "Statutory filings on file", type: "count", get: (r) => r.counts.statutory, advanced: true },
  { key: "docs", label: "Documents", type: "count", get: (r) => r.counts.documents, advanced: true },
];
const companySearchKeys = ["name", "key", (r) => (r.aliases || []).join(" ")];

const companyViews = [
  { id: "group", label: "Group entities", filters: { group: "Group" } },
  { id: "nongroup", label: "Non-group entities", filters: { group: "Non-group" } },
  { id: "projects", label: "With projects", filters: { hasProjects: "Yes" } },
  { id: "empty", label: "Empty companies", filters: { state: "No operational records" } },
  { id: "agm", label: "AGM required", filters: { agm: "Yes" } },
];

const companyColumns = () => [
  { key: "name", label: "Company", essential: true, sortValue: true, plain: (r) => r.name,
    render: (r) => html`<div class="row" style="gap:10px">
      <div class="notif__ico" style="width:32px;height:32px;background:var(--brand-soft);color:var(--brand)">
        <${Icon} name="building" size=16 /></div>
      <div style="min-width:0">
        <div class="cell-strong">${r.name}</div>
        ${/* The type has its own column; repeating it here put the same words
              twice in one row. What belongs under the name is what the name
              does NOT say: how many other spellings this company answers to. */ ""}
        <div class="tiny muted">${r.aliases.length
          ? "also spelled " + r.aliases.length + " other way" + (r.aliases.length === 1 ? "" : "s")
          : "one spelling across every source"}</div>
      </div></div>` },
  { key: "typeLabel", label: "Company type", sortValue: true, plain: (r) => r.typeLabel,
    render: (r) => html`<${Pill} tone=${r.type === "UNKNOWN" || r.type === "CONFLICT" ? "amber" : "gray"}>${r.typeLabel}</${Pill}>` },
  { key: "group", label: "Group", sortValue: true, plain: (r) => GROUP_LABEL[r.group],
    render: (r) => html`<${Pill} tone=${r.group === "group" ? "green" : r.group === "non-group" ? "blue" : "gray"}>${GROUP_LABEL[r.group]}</${Pill}>` },
  /* INCORPORATION AND PARENT ARE ASKED FOR AND NOT IN THE SOURCE (§44).
     The columns exist so the gap is visible in the register rather than only
     on a detail page somebody has to open. */
  { key: "incorporationDate", label: "Incorporated", sortValue: true, plain: () => "",
    render: () => html`<${Unevidenced}>Not stated</${Unevidenced}>` },
  { key: "parentEntity", label: "Parent entity", secondary: true, sortValue: true, plain: () => "",
    render: () => html`<${Unevidenced}>Not stated</${Unevidenced}>` },
  { key: "projects", label: "Projects", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.counts.projects,
    render: (r) => (r.counts.projects ? html`<span class="strong">${r.counts.projects}</span>` : html`<span class="tiny muted">—</span>`) },
  { key: "statutory", label: "Statutory docs", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.counts.statutory,
    render: (r) => (r.counts.statutory ? html`<${Pill} tone="indigo">${r.counts.statutory}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
  { key: "records", label: "Records", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.records,
    render: (r) => (r.records ? html`<span class="strong">${r.records}</span>`
      : html`<${Pill} tone="gray" title="No contract, licence, loan, case, resolution or property is filed against this company">Empty</${Pill}>`) },
];

function CompanyList() {
  const { data, loading, error } = useCompanies();
  const [q, patchQ] = useQuery();
  const tab = q.view === "structure" ? "structure" : "register";
  const structure = useStructure(tab === "structure");

  if (error) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Companies" />
      <${Empty} icon="building" title="The company register is not available to you"
        text=${error.message || "Companies are part of Compliance."} /></div>`;
  }
  if (loading || !data) {
    return html`<div class="page page--wide fade-in"><${PageHead} title="Companies" sub="Assembling every company from the registers and the statutory root…" /></div>`;
  }

  const rows = data.companies;
  const t = data.totals;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Companies"
      sub="Every company in the estate, with everything filed against it. Assembled from the registers and the statutory root — nothing here is typed twice."
      actions=${html`<${Btn} variant="ghost" icon="shield" onClick=${() => navigate("/compliance")}>Compliance overview</${Btn}>`} />

    ${/* §42 — three figures, and every one of them opens the records behind it. */ ""}
    <${StatStrip} stats=${[
      /* The "all" card says when it IS the current view, the way the loan
         register's does. Without the pressed state it is a control that looks
         live and, on an unfiltered register, changes nothing when clicked. */
      { value: t.companies, label: "Total companies",
        active: !q.view && !q.co_group && !q.co_state,
        onClick: () => patchQ({ view: null, co_group: null, co_state: null }), title: "Show every company" },
      { value: t.projects, label: "Total projects",
        onClick: () => navigate("/projects"), title: "Open the ZD project register" },
      { value: t.empty, label: "Empty companies", tone: t.empty ? "amber" : "",
        onClick: () => patchQ({ view: null, co_state: "No operational records" }),
        title: "Companies with no contract, licence, loan, case, resolution or property filed against them" },
      { value: t.group, label: "Group entities",
        onClick: () => patchQ({ view: null, co_group: "Group" }) },
      { value: t.nonGroup, label: "Non-group entities",
        onClick: () => patchQ({ view: null, co_group: "Non-group" }) },
    ]} />

    <div class="row wrap" style="gap:8px;margin:2px 0 14px">
      ${[["register", "Register"], ["structure", "Corporate structure"]].map(([id, label]) =>
        html`<${Chip} key=${id} active=${tab === id} onClick=${() => patchQ({ view: id === "register" ? null : id })}>${label}</${Chip}>`)}
    </div>

    ${tab === "structure"
      ? html`<${CorporateStructure} s=${structure} />`
      : html`<${Fragment}>
          <${RegisterShell}
            tabId="companies" ns="co" rows=${rows}
            fields=${companyFields}
            columns=${companyColumns}
            views=${companyViews} searchKeys=${companySearchKeys}
            searchPlaceholder="Search companies and their other spellings…"
            noun=${["company", "companies"]}
            onRow=${(r) => navigate("/companies/" + encodeURIComponent(r.key))}
            exportName="companies" emptyIcon="building"
            defaultSort=${{ key: "records", dir: "desc" }} />
          <div class="tiny muted" style="margin-top:12px">
            ${data.notEvidenced.reason}
          </div>
        </${Fragment}>`}
  </div>`;
}

/* ----------------------------------------------------- corporate structure */

const LINK_LABEL = {
  "borrows-from": "borrows from",
  "lends-to": "lends to",
  "shares-project": "shares a project with",
};

function CorporateStructure({ s }) {
  const [open, setOpen] = useState({});
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  if (s.error) return html`<${Empty} icon="alertTriangle" title="The structure could not be read" text=${s.error.message || ""} />`;
  if (s.loading || !s.data) return html`<div class="card card--pad tiny muted" style="padding:40px;text-align:center">Building the structure…</div>`;

  const needle = q.trim().toLowerCase();
  const types = [...new Set(s.data.groups.flatMap((g) => g.companies.map((c) => c.typeLabel)))].sort();

  return html`<div class="col" style="gap:16px">
    <div class="banner banner--info" style="align-items:flex-start">
      <${Icon} name="alertCircle" size=15 />
      <div class="tiny">${s.data.basis}</div>
    </div>

    <div class="row wrap" style="gap:10px;align-items:center">
      <div style="width:300px"><${Toolbar} search=${q} onSearch=${setQ} /></div>
      <${Chip} active=${!type} onClick=${() => setType("")}>All company types</${Chip}>
      ${types.map((t) => html`<${Chip} key=${t} active=${type === t} onClick=${() => setType(type === t ? "" : t)}>${t}</${Chip}>`)}
    </div>

    ${s.data.groups.map((g) => {
      const list = g.companies.filter((c) =>
        (!needle || c.name.toLowerCase().includes(needle)) && (!type || c.typeLabel === type));
      if (!list.length) return null;
      return html`<${Section} key=${g.key} title=${g.label + " (" + list.length + ")"} icon="building"
        sub=${g.key === "unplaced"
          ? "Named in a register but not filed under either folder in the statutory root."
          : "As the statutory root files them."}>
        <div class="col" style="gap:0">
          ${list.map((c) => {
            const isOpen = !!open[c.key];
            return html`<div key=${c.key}>
              <div class="row" style="gap:8px;align-items:center;padding:2px 0">
                <button type="button" class="drill__node" style="flex:1"
                  aria-expanded=${isOpen ? "true" : "false"}
                  onClick=${() => setOpen((o) => ({ ...o, [c.key]: !o[c.key] }))}>
                  <${Icon} name=${isOpen ? "chevronDown" : "chevronRight"} size=15 />
                  <div class="notif__ico" style="width:28px;height:28px;background:var(--brand-soft);color:var(--brand);flex:none">
                    <${Icon} name="building" size=14 /></div>
                  <div style="flex:1;min-width:0">
                    <div class="panel__title">${c.name}</div>
                    <div class="tiny muted">${[c.typeLabel,
                      c.counts.projects ? c.counts.projects + " project" + (c.counts.projects === 1 ? "" : "s") : null,
                      c.links.length ? c.links.length + " evidenced link" + (c.links.length === 1 ? "" : "s") : "no evidenced links"
                    ].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span class="drill__n">${c.records}</span>
                </button>
                <${Btn} size="sm" variant="ghost" icon="arrowRight"
                  onClick=${() => navigate("/companies/" + encodeURIComponent(c.key))}>Open</${Btn}>
              </div>
              ${isOpen && html`<div class="drill__kids">
                ${c.links.length === 0
                  ? html`<div class="tiny muted" style="padding:8px 4px">
                      No lending or shared project connects this company to another in the estate.
                      That is an absence of evidence, not evidence of independence — no source here states ownership.</div>`
                  : c.links.map((l, i) => html`<button key=${i} type="button" class="drill__node"
                      onClick=${() => navigate("/companies/" + encodeURIComponent(l.otherKey))}>
                      <div style="flex:1;min-width:0">
                        <div class="strong tiny">${LINK_LABEL[l.kind] || l.kind} ${l.otherName}</div>
                        <div class="tiny muted">${l.detail || ""}</div>
                      </div>
                      <${Icon} name="chevronRight" size=14 />
                    </button>`)}
              </div>`}
            </div>`;
          })}
        </div>
      </${Section}>`;
    })}
  </div>`;
}

/* ------------------------------------------------------------------ detail */

const TABS = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "profile", label: "Corporate Profile", icon: "building" },
  { id: "projects", label: "Projects", icon: "grid" },
  { id: "loans", label: "Loans", icon: "dollar" },
  { id: "licences", label: "Licences", icon: "shield" },
  { id: "secp", label: "SECP", icon: "book" },
  { id: "resolutions", label: "Resolutions", icon: "checksquare" },
  { id: "documents", label: "Documents", icon: "paperclip" },
  { id: "timeline", label: "Timeline", icon: "activity" },
];

const LOAN_CARDS = [
  { key: "fdi", label: "FDI Loans", filter: "FDI Loans" },
  { key: "fcy", label: "FCY Loans", filter: "FCY Loans" },
  { key: "intercompany", label: "Intercompany PK Loans", filter: "Intercompany PK Loans" },
];

function CompanyDetail({ id }) {
  const key = decodeURIComponent(id);
  const { data, loading, error } = useCompany(key);
  const [q, patchQ] = useQuery();
  const tab = TABS.some((t) => t.id === q.tab) ? q.tab : "overview";

  if (error) {
    return html`<div class="page page--wide fade-in">
      <${Btn} icon="arrowLeft" onClick=${() => navigate("/companies")}>Companies</${Btn}>
      <${Empty} icon="building" title="Company not found" text=${error.message || "No company with that key."} /></div>`;
  }
  if (loading || !data) return html`<div class="page page--wide fade-in"><${PageHead} title="Company" sub="Loading…" /></div>`;

  const c = data;
  const recs = c.records || {};
  const docs = (() => {
    const seen = new Map();
    for (const fam of Object.keys(recs)) for (const r of (recs[fam] || [])) for (const f of (r.driveFiles || []))
      if (f && f.id && !seen.has(f.id)) seen.set(f.id, { ...f, fam });
    return [...seen.values()];
  })();
  const withheld = c.withheld || [];

  const loansBy = (k) => (recs.loans || []).filter((l) => l.category === k || (k === "fdi" && l.category === "international"));

  return html`<div class="page page--wide fade-in">
    <${PageHead} title=${c.name}
      sub=${[c.typeLabel, GROUP_LABEL[c.group] + " entity", c.statutoryYears.length ? c.statutoryYears.length + " statutory years on file" : null].filter(Boolean).join(" · ")}
      actions=${html`<${Btn} variant="ghost" icon="arrowLeft" onClick=${() => navigate("/companies")}>Companies</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: c.counts.projects, label: "Projects", onClick: () => patchQ({ tab: "projects" }) },
      { value: c.counts.loans, label: "Loans", onClick: () => patchQ({ tab: "loans" }) },
      { value: c.counts.licences, label: "Licences", onClick: () => patchQ({ tab: "licences" }) },
      { value: c.counts.statutory, label: "Statutory documents", onClick: () => patchQ({ tab: "secp" }) },
      { value: c.counts.resolutions, label: "Resolutions", onClick: () => patchQ({ tab: "resolutions" }) },
    ]} />

    <div class="dashtabs" role="tablist" aria-label="Company record">
      ${TABS.map((t) => html`<button key=${t.id} role="tab" aria-selected=${tab === t.id}
        class=${cx("dashtab", tab === t.id && "on")} onClick=${() => patchQ({ tab: t.id === "overview" ? null : t.id })}>
        <${Icon} name=${t.icon} size=14 /> ${t.label}</button>`)}
    </div>

    ${withheld.length > 0 && html`<div class="banner banner--info" style="margin-bottom:14px;align-items:flex-start">
      <${Icon} name="lock" size=15 />
      <div class="tiny">This company also holds ${withheld.map((w) => c.counts[w] + " " + w).filter((x) => !/^0 /.test(x)).join(", ") || "records"}
        in families your access does not cover. The counts are shown; the records are not.</div>
    </div>`}

    ${tab === "overview" && html`<${Overview} c=${c} recs=${recs} docs=${docs} onTab=${(t) => patchQ({ tab: t })} />`}
    ${tab === "profile" && html`<${CorporateProfile} c=${c} onTab=${(t) => patchQ({ tab: t })} />`}
    ${tab === "projects" && html`<${ProjectsTab} c=${c} rows=${recs.properties || []} />`}
    ${tab === "loans" && html`<${LoansTab} c=${c} loansBy=${loansBy} />`}
    ${tab === "licences" && html`<${SimpleList} title="Licences & permits" icon="shield" rows=${recs.licences || []}
      empty="No licence is filed against this company."
      cols=${[["Authority", (r) => r.authority], ["Number", (r) => r.number], ["Status", (r) => r.status], ["Expiry", (r) => (r.expiry ? fmt.date(r.expiry) : "No expiry recorded")]]}
      onRow=${(r) => navigate("/compliance/licenses/" + encodeURIComponent(r.id))} />`}
    ${tab === "secp" && html`<${SecpTab} c=${c} />`}
    ${tab === "resolutions" && html`<${SimpleList} title="Resolutions" icon="checksquare" rows=${recs.resolutions || []}
      empty="No resolution is filed against this company."
      cols=${[["Reference", (r) => r.docNo], ["Resolution", (r) => r.agenda], ["Date", (r) => (r.date ? fmt.date(r.date) : "—")]]}
      onRow=${(r) => navigate("/compliance/resolutions/" + encodeURIComponent(r.id))} />`}
    ${tab === "documents" && html`<${DocumentsTab} c=${c} docs=${docs} />`}
    ${tab === "timeline" && html`<${TimelineTab} c=${c} recs=${recs} />`}
  </div>`;
}

function Overview({ c, recs, docs, onTab }) {
  const families = [
    ["Contracts", "file", c.counts.contracts, () => navigate("/contracts", { ct_entity: c.name })],
    ["Litigation", "gavel", c.counts.litigation, () => navigate("/litigation", { cases_entity: c.name })],
    ["Notices", "mail", c.counts.notices, () => navigate("/m/notices", { notices_entity: c.name })],
    ["Licences", "shield", c.counts.licences, () => onTab("licences")],
    ["Loans", "dollar", c.counts.loans, () => onTab("loans")],
    ["Resolutions", "checksquare", c.counts.resolutions, () => onTab("resolutions")],
    ["Properties", "building", c.counts.properties, () => onTab("projects")],
    ["Statutory documents", "book", c.counts.statutory, () => onTab("secp")],
  ].filter(([, , n]) => n > 0);

  return html`<div class="col" style="gap:16px">
    <${Section} title="What is filed against this company" icon="folder"
      sub="Only families that hold something are listed — an empty card is not information.">
      ${families.length === 0
        ? html`<${Empty} icon="inbox" title="Nothing is filed against this company"
            text="It is named in the estate but holds no contract, licence, loan, case, resolution or property." />`
        : html`<div class="grid grid--4">
            ${families.map(([label, icon, n, go]) => html`<button key=${label} type="button"
              class="card card--hover card--pad clickable cardbtn" onClick=${go}>
              <div class="row" style="margin-bottom:10px">
                <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name=${icon} size=17 /></div>
                <div class="spacer"></div><${Icon} name="chevronRight" size=14 />
              </div>
              <div class="metric__value">${n}</div>
              <div class="tiny muted" style="margin-top:4px">${label}</div>
            </button>`)}
          </div>`}
    </${Section}>

    <div class="grid grid--2" style="align-items:start">
      <${KeyFacts} c=${c} />
      <${Section} title="Other spellings on record" icon="search"
        sub="The same company as several registers spell it. Everything above is joined across all of them.">
        ${c.aliases.length === 0
          ? html`<div class="tiny muted">Every source spells this company the same way.</div>`
          : html`<div class="col" style="gap:4px">${c.aliases.map((a) => html`<div key=${a} class="tiny">${a}</div>`)}</div>`}
      </${Section}>
    </div>
  </div>`;
}

function KeyFacts({ c }) {
  const rows = [
    ["Registered name", c.name],
    ["Legal form", c.typeLabel],
    ["Group placement", GROUP_LABEL[c.group] + (c.group === "unplaced" ? " — not in the statutory root" : "")],
    ["AGM required", c.agmApplies === true ? "Yes" : c.agmApplies === false ? "No — this legal form holds no AGM" : "Legal form not determined"],
    ["Statutory years on file", c.statutoryYears.length ? c.statutoryYears.join(", ") : "None"],
  ];
  return html`<${Section} title="Key facts" icon="info"
    sub="Every line here is read from a source. What the sources do not state is on the Corporate Profile tab, named as missing.">
    <div class="kvgrid" style="grid-template-columns:1fr">
      ${rows.map(([l, v]) => html`<div key=${l} class="kv">
        <div class="kv__l">${l}</div><div class="kv__v">${v}</div></div>`)}
    </div>
    ${c.statutoryNote && html`<div class="tiny muted" style="margin-top:8px">${c.statutoryNote}</div>`}
  </${Section}>`;
}

/* §44 — the officer and constitutional facts, and what evidences them. */
function CorporateProfile({ c, onTab }) {
  const e = c.officerEvidence || {};
  const related = c.related || [];
  /* WHAT THE REGISTERS SAY, AND WHAT THEY DO NOT.
     This panel used to declare every one of these facts unknowable, on the
     stated ground that "a register of directors is a filed document, not a
     tracker column". The registers have since been read — 91 of the 102 in the
     statutory root are .docx — so the directors, the members and the CUIN are
     now facts on the record. Two fields genuinely remain unread, and the panel
     now says which and why instead of lumping all five together. */
  const directors = Array.isArray(c.directors) ? c.directors : [];
  /* Form 29 has now been READ — the scans were rendered and looked at, which is
     how the chief executive and the company secretary got onto this page. What
     is left in this list is what those filings do not answer. */
  const missing = [
    ...(c.ceo ? [] : [["Chief Executive", "ceo", e.registerOfDirectors,
      c.ceoState === "CEO_NOT_EVIDENCED_AFTER_FORM29_REVIEW"
        ? "All " + c.form29Reviewed + " Form 29 filing(s) on file for this company have been read. None of them names a chief executive."
        : "Named on Form 29. No Form 29 is on file for this company."]]),
    ...(c.companySecretary ? [] : [["Company Secretary", "companySecretary", e.registerOfDirectors,
      c.companySecretaryState === "COMPANY_SECRETARY_NOT_EVIDENCED_AFTER_FORM29_REVIEW"
        ? "All " + c.form29Reviewed + " Form 29 filing(s) on file have been read. None of them names a company secretary."
        : "Named on Form 29. No Form 29 is on file for this company."]]),
    ["Date of incorporation", "incorporationDate", e.corporateActions,
      "The certificate of incorporation, where the statutory folder holds one."],
  ];

  return html`<div class="col" style="gap:16px">
    ${(directors.length || c.parentEntity || c.cuin || c.ceo || c.companySecretary) && html`<${Section} title="From the statutory registers and filings" icon="users"
      sub=${"Read out of this company's own register of directors, register of members and Form 29 filings in the statutory root — not inferred, and not taken from any tracker."
        + (c.form29Reviewed ? " " + c.form29Reviewed + " Form 29 scan(s) were rendered and read." : "")}>
      <div class="kv">
        ${c.cuin && html`<div class="kv__row"><div class="kv__l">Corporate Unique Identification Number</div>
          <div class="kv__v"><span class="cell-mono">${c.cuin}</span></div></div>`}
        ${c.ceo && html`<div class="kv__row"><div class="kv__l">Chief Executive</div>
          <div class="kv__v">${c.ceo.name}
            ${c.ceo.since && html`<span class="tiny muted">${" — since " + fmt.dateShort(c.ceo.since)}</span>`}
            <div class="tiny muted">${"From Form 29 " + ((c.ceo.source && c.ceo.source.name) || "")}</div>
          </div></div>`}
        ${c.companySecretary && html`<div class="kv__row"><div class="kv__l">Company Secretary</div>
          <div class="kv__v">${c.companySecretary.name}
            ${c.companySecretary.since && html`<span class="tiny muted">${" — since " + fmt.dateShort(c.companySecretary.since)}</span>`}
            <div class="tiny muted">${"From Form 29 " + ((c.companySecretary.source && c.companySecretary.source.name) || "")}</div>
          </div></div>`}
        ${c.parentEntity && html`<div class="kv__row"><div class="kv__l">Parent</div>
          <div class="kv__v">${c.parentEntity}
            ${c.parentIsOutsideEstate && html`<span class="tiny muted">
              ${" — a holding company outside this estate, so it has no statutory folder here"}</span>`}
          </div></div>`}
        ${directors.length > 0 && html`<div class="kv__row"><div class="kv__l">
          ${"Directors (" + directors.length + ")"}</div>
          <div class="kv__v"><div class="col" style="gap:4px">
            ${directors.map((d, i) => html`<div key=${i} class="row" style="gap:8px;align-items:baseline">
              <span>${d.name}</span>
              ${d.appointed && html`<span class="tiny muted">${"appointed " + fmt.dateShort(d.appointed)}</span>`}
            </div>`)}
          </div></div></div>`}
        ${(() => {
          /* §21 — who held the office before. Only shown where the filings
             record a change; a single appointment is not a history. */
          const h = (c.officerHistory || {});
          const past = [
            ...(h.ceo || []).map((x) => ({ ...x, office: "Chief Executive" })),
            ...(h.companySecretary || []).map((x) => ({ ...x, office: "Company Secretary" })),
          ].filter((x) => x.when);
          const names = new Set(past.map((x) => String(x.name).toLowerCase()));
          if (past.length < 2 || names.size < 2) return null;
          return html`<div class="kv__row"><div class="kv__l">Officer history</div>
            <div class="kv__v"><div class="col" style="gap:3px">
              ${past.slice(0, 8).map((x, i) => html`<div key=${i} class="tiny">
                <span class="muted">${fmt.dateShort(x.when) + " · "}</span>
                <span>${x.name}</span>
                <span class="muted">${" " + (x.event || "") + " as " + x.office}</span>
              </div>`)}
            </div></div></div>`;
        })()}
        ${c.directorHistory > directors.length && html`<div class="kv__row">
          <div class="kv__l">Former directors on the register</div>
          <div class="kv__v tiny muted">${(c.directorHistory - directors.length) + " recorded, with their resignation dates"}</div></div>`}
      </div>
    </${Section}>`}

    <div class="banner banner--warn" style="align-items:flex-start">
      <${Icon} name="alertTriangle" size=15 />
      <div class="tiny">
        <strong>${"The fields below are still not evidenced."}</strong>
        ${" LegalOS will not put a chief executive, a company secretary or an incorporation date on a statutory record it has not read. Each one names the filed document that would answer it, and how many of those this company has on file."}
      </div>
    </div>

    ${/* NOT EVIDENCED IS NOT A DEAD END (§100).
          Each row named the document that would answer it and then stopped, so
          a reader who wanted the directors read "the contents are in the PDF"
          and had nowhere to go. Where the statutory folder holds that document
          the row now opens it. Where it does not, the row says so and stays
          inert — because there is genuinely nothing to open, which is a
          different answer from "we did not link it". */ ""}
    <${Section} title="Constitutional and officer facts" icon="users">
      <div class="col" style="gap:8px">
        ${missing.map(([label, field, n, where]) => (n
          ? html`<button key=${field} type="button" class="staterow clickable" style="width:100%;text-align:left"
              title=${"Open the " + n + " filed document" + (n === 1 ? "" : "s") + " that would answer this"}
              onClick=${() => onTab && onTab("secp")}>
              <span class="statedot statedot--amber"></span>
              <span class="staterow__l">${label}</span>
              <span class="staterow__s">${where}</span>
              <span class="staterow__n">${n} doc${n === 1 ? "" : "s"} →</span>
            </button>`
          : html`<div key=${field} class="staterow" style="cursor:default">
              <span class="statedot statedot--gray"></span>
              <span class="staterow__l">${label}</span>
              <span class="staterow__s">${where}</span>
              <span class="staterow__n">no document on file</span>
            </div>`))}
      </div>
    </${Section}>

    ${/* SUBSIDIARIES, ANSWERED HONESTLY (§36).
          The question is "does this company have subsidiaries, and if so which".
          Nothing in this estate states ownership — not one tracker, not the
          statutory root — so the honest answer is not "No" and not a made-up
          tree. It is: here are the companies this one is demonstrably tied to,
          here is the record that ties them, and here is why that is not the
          same as a subsidiary. Every row opens the other company. */ ""}
    <${Section} title="Related companies" icon="gitbranch"
      sub=${related.length
        ? "Built from evidenced relationships — intercompany lending and shared projects. Ownership is stated separately, from the register of members; nothing here is asserted to be a parent or a subsidiary."
        : "Nothing in the connected sources ties this company to another one."}>
      ${related.length === 0
        ? html`<div class="tiny muted">No intercompany loan and no shared project links this company to
            any other. That is not evidence that it has no subsidiaries — it is evidence that nothing
            we can read says it does.</div>`
        : html`<div class="col" style="gap:0">
            ${related.map((l, i) => html`<button key=${i} type="button" class="feed__item clickable"
              style="text-align:left;width:100%"
              onClick=${() => { const p = companyPath(l.otherName); if (p) navigate(p); }}>
              <div class="row" style="gap:10px;align-items:center;width:100%">
                <${Pill} tone=${l.kind === "lends-to" ? "blue" : l.kind === "borrows-from" ? "amber" : "gray"}>
                  ${l.kind === "lends-to" ? "Lends to" : l.kind === "borrows-from" ? "Borrows from" : "Shares a project"}</${Pill}>
                <div style="flex:1;min-width:0">
                  <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.otherName}</div>
                  <div class="tiny muted">${l.detail || ""}</div>
                </div>
                <${Icon} name="chevronRight" size=14 />
              </div></button>`)}
          </div>`}
    </${Section}>

    <${Section} title="What the statutory folder does hold" icon="book"
      sub="Counted from the Drive tree. Open the SECP tab to read them.">
      <div class="grid grid--4">
        ${[["Register of directors", e.registerOfDirectors], ["Register of members", e.registerOfMembers],
           ["AGM papers", e.agmPapers], ["Share certificates", e.shareCertificates],
           ["Corporate actions", e.corporateActions]]
          .filter(([, n]) => n > 0)
          .map(([label, n]) => html`<div key=${label} class="card card--pad">
            <div class="metric__value">${n}</div>
            <div class="tiny muted" style="margin-top:4px">${label}</div></div>`)}
      </div>
      ${Object.values(e).every((n) => !n) && html`<div class="tiny muted">
        This company has no statutory folder in the SECP root, so there is no filed document to read.</div>`}
    </${Section}>
  </div>`;
}

/* §47 — the company's projects, with the fields the project register carries. */
function ProjectsTab({ c, rows }) {
  if (!rows.length) {
    return html`<${Empty} icon="grid" title="No project is filed against this company"
      text="The ZD project register names no property held by it." />`;
  }
  const byProject = new Map();
  for (const r of rows) {
    const k = r.project || "Not named in the register";
    if (!byProject.has(k)) byProject.set(k, []);
    byProject.get(k).push(r);
  }
  const list = [...byProject.entries()].map(([name, items]) => ({
    name, items,
    zd: true,                                   // it is on the ZD project register, by definition
    city: (items.find((r) => r.city) || {}).city || "",
    ownership: (items.find((r) => r.ownership) || {}).ownership || "",
    jv: (items.find((r) => r.jv) || {}).jv || "",
    status: (items.find((r) => r.status) || {}).status || "",
    docs: items.reduce((n, r) => n + (r.driveFiles || []).length, 0),
  }));
  return html`<${Section} title=${"Projects (" + list.length + ")"} icon="grid"
    sub="From the ZD projects master in Drive — every one of these is a ZD project by virtue of being on it.">
    <${DataTable} onRow=${() => navigate("/projects")} rows=${list} columns=${[
      { key: "name", label: "Project", render: (p) => html`<div class="row" style="gap:8px">
          <div class="cell-strong">${p.name}</div><${Pill} tone="green">ZD project</${Pill}></div>` },
      { key: "items", label: "Properties", align: "right", render: (p) => html`<span class="strong">${p.items.length}</span>` },
      { key: "city", label: "Region / city", render: (p) => html`<span class="tiny">${p.city || "—"}</span>` },
      { key: "ownership", label: "Ownership", render: (p) => html`<span class="tiny">${p.ownership || "—"}</span>` },
      { key: "jv", label: "JV", render: (p) => html`<span class="tiny">${p.jv || "—"}</span>` },
      { key: "status", label: "Status", render: (p) => (p.status ? html`<${Status} value=${p.status} />` : html`<span class="tiny muted">—</span>`) },
      { key: "docs", label: "Documents", align: "right", render: (p) => (p.docs ? html`<${Pill} tone="indigo">${p.docs}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
    ]} empty=${html`<div class="empty" style="padding:24px">No project.</div>`} />
  </${Section}>`;
}

/* §48 — one card per loan category, shown only where the count is above zero. */
function LoansTab({ c, loansBy }) {
  const cards = LOAN_CARDS.map((k) => ({ ...k, rows: loansBy(k.key) })).filter((k) => k.rows.length > 0);
  if (!cards.length) {
    return html`<${Empty} icon="dollar" title="No loan is filed against this company"
      text="Neither the FDI tracker nor the intercompany tracker names it as a borrower." />`;
  }
  return html`<div class="col" style="gap:16px">
    <div class="grid grid--3">
      ${cards.map((k) => {
        const total = k.rows.reduce((s, l) => s + (Number(l.principal) || 0), 0);
        return html`<button key=${k.key} type="button" class="card card--hover card--pad clickable cardbtn"
          onClick=${() => navigate("/compliance/loans", { loan_category: k.filter, loan_q: c.name })}>
          <div class="row" style="margin-bottom:10px">
            <div class="metric__icon" style="background:var(--brand-soft);color:var(--brand)"><${Icon} name="dollar" size=17 /></div>
            <div class="spacer"></div><${Icon} name="chevronRight" size=14 />
          </div>
          <div class="metric__value">${k.rows.length}</div>
          <div class="tiny muted" style="margin-top:4px">${k.label}</div>
          ${total > 0 && html`<div class="tiny strong" style="margin-top:6px">${fmt.money(total, k.rows[0].currency || "PKR")}</div>`}
        </button>`;
      })}
    </div>
    <${SimpleList} title="Loan agreements" icon="dollar" rows=${LOAN_CARDS.flatMap((k) => loansBy(k.key))}
      empty="No loan."
      cols=${[["Reference", (r) => r.ref || r.id], ["Lender", (r) => r.lender], ["Category", (r) => r.categoryLabel],
        ["Principal", (r) => (r.principal != null ? fmt.money(r.principal, r.currency) : "Not stated")],
        ["Status", (r) => r.status]]}
      onRow=${(r) => navigate("/compliance/loans/" + encodeURIComponent(r.id))} />
  </div>`;
}

function SecpTab({ c }) {
  const s = c.statutory;
  if (!s) {
    return html`<${Empty} icon="book" title="No statutory folder"
      text="This company is named in the registers but has no folder in the SECP root, so there is no filing history to show." />`;
  }
  return html`<div class="col" style="gap:16px">
    <${Section} title="Statutory estate" icon="book"
      sub=${s.folderPath}
      actions=${html`<${Btn} size="sm" variant="ghost" icon="arrowRight"
        onClick=${() => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(c.key))}>Open in SECP</${Btn}>`}>
      <${StatStrip} stats=${[
        { value: s.documents, label: "Documents on file" },
        { value: (s.years || []).length, label: "Compliance years" },
        { value: (s.forms || []).length, label: "Distinct forms" },
      ]} />
    </${Section}>
    <${Section} title="By compliance year" icon="calendar" sub="Drive-backed years only — a year with no folder is not shown as empty, it simply is not there.">
      <${DataTable} rows=${s.years || []}
        onRow=${() => navigate("/compliance/sec-filings/entity/" + encodeURIComponent(c.key))}
        columns=${[
          { key: "year", label: "Year", render: (y) => html`<div class="cell-strong">${y.year}</div>` },
          { key: "documents", label: "Documents", align: "right", render: (y) => html`<span class="strong">${y.documents}</span>` },
          { key: "forms", label: "Forms", render: (y) => html`<span class="tiny">${(y.forms || []).map((f) => "Form " + f).join(", ") || "—"}</span>` },
          { key: "submissionEvidence", label: "Submission evidence", align: "right",
            render: (y) => (y.submissionEvidence ? html`<${Pill} tone="green">${y.submissionEvidence}</${Pill}>` : html`<span class="tiny muted">—</span>`) },
        ]} empty=${html`<div class="empty" style="padding:24px">No compliance year on file.</div>`} />
    </${Section}>
  </div>`;
}

function DocumentsTab({ c, docs }) {
  if (!docs.length) {
    return html`<${Empty} icon="paperclip" title="No linked document"
      text=${c.counts.statutory ? "The operational registers link no document to this company. Its " + c.counts.statutory + " statutory documents are on the SECP tab." : "Nothing in the registers links a document to this company."} />`;
  }
  return html`<${Section} title=${"Documents (" + docs.length + ")"} icon="paperclip"
    sub="Every document the registers link to this company, readable in-app.">
    <${DataTable} rows=${docs} onRow=${(f) => navigate("/compliance/document/" + encodeURIComponent(f.id))}
      columns=${[
        { key: "name", label: "Document", render: (f) => html`<div class="cell-strong">${f.name}</div>
          <div class="tiny muted">${f.folderPath || ""}</div>` },
        { key: "fam", label: "Filed under", render: (f) => html`<${Pill} tone="gray">${f.fam}</${Pill}>` },
      ]} empty=${html`<div class="empty" style="padding:24px">No document.</div>`} />
  </${Section}>`;
}

function TimelineTab({ c, recs }) {
  const events = [];
  const push = (at, label, detail, path) => { if (at) events.push({ at: String(at).slice(0, 10), label, detail, path }); };
  for (const r of (recs.licences || [])) { push(r.issued, "Licence issued", (r.authority || "") + (r.number ? " · " + r.number : ""), "/compliance/licenses/" + r.id); push(r.expiry, "Licence expiry", r.authority || "", "/compliance/licenses/" + r.id); }
  for (const r of (recs.loans || [])) { push(r.agreementDate, "Loan agreement", r.lender ? "from " + r.lender : "", "/compliance/loans/" + r.id); push(r.repaymentDate, "Loan repayment due", r.ref || "", "/compliance/loans/" + r.id); }
  for (const r of (recs.resolutions || [])) push(r.date, "Resolution", r.agenda || "", "/compliance/resolutions/" + r.id);
  for (const r of (recs.litigation || [])) push(r.filed, "Case filed", r.title || "", "/litigation/" + r.id);
  for (const r of (recs.contracts || [])) push(r.start, "Contract executed", r.title || "", "/contracts/" + r.id);
  events.sort((a, b) => b.at.localeCompare(a.at));
  if (!events.length) {
    return html`<${Empty} icon="activity" title="No dated event"
      text="Nothing filed against this company carries a date." />`;
  }
  return html`<${Section} title=${"Timeline (" + events.length + ")"} icon="activity"
    sub="Every dated event the registers hold for this company, newest first.">
    <div class="col" style="gap:0">
      ${events.slice(0, 200).map((e, i) => html`<button key=${i} type="button" class="feed__item clickable"
        style="text-align:left;width:100%" onClick=${() => e.path && navigate(e.path)}>
        <div class="row" style="gap:10px;align-items:center;width:100%">
          <span class="tiny strong" style="width:92px;flex:none">${fmt.date(e.at)}</span>
          <div style="flex:1;min-width:0">
            <div class="tiny strong">${e.label}</div>
            <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.detail}</div>
          </div>
          <${Icon} name="chevronRight" size=14 />
        </div></button>`)}
    </div>
    ${events.length > 200 && html`<div class="tiny muted" style="padding:8px 2px">Showing the 200 most recent of ${events.length}.</div>`}
  </${Section}>`;
}

function SimpleList({ title, icon, rows, cols, onRow, empty }) {
  return html`<${Section} title=${title + " (" + rows.length + ")"} icon=${icon}>
    <${DataTable} rows=${rows} onRow=${onRow} columns=${cols.map(([label, get], i) => ({
      key: "c" + i, label,
      render: (r) => { const v = get(r); return v ? html`<span class=${i === 0 ? "cell-strong" : "tiny"}>${v}</span>` : html`<span class="tiny muted">—</span>`; },
    }))} empty=${html`<div class="empty" style="padding:26px">${empty}</div>`} />
  </${Section}>`;
}

export default function Companies({ id }) {
  return id ? html`<${CompanyDetail} id=${id} />` : html`<${CompanyList} />`;
}
