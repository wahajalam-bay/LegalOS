/* PROJECT WISE — the department's live work, cut by the business's own axes.
 *
 * The worklist answers "what is on my desk". This answers the questions the
 * business asks: what is Legal carrying for Real Estate, for the North region,
 * for this project, in this category. Same records, different spine.
 *
 * Every dimension value on this page is a control. Clicking one narrows the
 * work shown here AND writes itself into the URL (§20/§93), so a cut somebody
 * found is a link they can send, a refresh keeps it, and Back undoes exactly
 * one step.
 *
 * WHERE A DIMENSION IS NOT RECORDED IT SAYS SO. "Not recorded" is a group with
 * a count, not an omission: a business line nobody filled in on 40 requests is
 * a finding the intake form needs to hear about, and silently dropping those
 * rows would make every total on the page wrong.
 */
import { html, cx, fmt, useMemo, useState } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Pill, Section, Empty, Chip, Avatar, Status } from "../ui.js";
import { PageHead, StatStrip, DataTable } from "../parts.js";
import { navigate, useQuery } from "../router.js";
import { useCollection } from "../store.js";
import { useActiveUser, filterVisible } from "../rbac.js";
import { useRegister } from "../live.js";
import { unifiedRows, rowTat } from "../flow.js";
import { nameOf, entityName } from "../data.js";
import { requesterOf } from "../requester.js";

const NOT_RECORDED = "Not recorded";
const clean = (v) => { const s = String(v == null ? "" : v).trim(); return s && s !== "—" ? s : ""; };

/* THE DIMENSIONS, DECLARED AS DATA.
   Each one names where it is read from, so a reader can tell a business line
   that is genuinely blank from one this page forgot to look for. */
const DIMENSIONS = [
  { key: "entity",   label: "Entity",            icon: "building", get: (r) => clean(r.__entity) },
  { key: "line",     label: "Business Line",     icon: "briefcase", get: (r) => clean(r.bu) },
  { key: "vertical", label: "Business Vertical", icon: "layers",   get: (r) => clean(r.unit) || clean(r.natureOfMatter) },
  { key: "region",   label: "Region",            icon: "mapPin",   get: (r) => clean(r.region) || clean(r.city) || clean(r.country) },
  { key: "project",  label: "Project",           icon: "grid",     get: (r) => clean(r.__project) },
  { key: "category", label: "Matter Category",   icon: "tag",      get: (r) => clean(r.category) },
  { key: "module",   label: "Legal Module",      icon: "shield",   get: (r) => clean(r.subdivision) || clean(r.legalTeam) },
  { key: "owner",    label: "Owner",             icon: "user",     get: (r) => (r.owner ? nameOf(r.owner) : "") },
  { key: "status",   label: "Status",            icon: "activity", get: (r) => clean(r.status) },
];

const valueOf = (dim, r) => dim.get(r) || NOT_RECORDED;

export default function ProjectWise() {
  const me = useActiveUser();
  const requests = useCollection("requests");
  const matters = useCollection("matters");
  const contracts = useCollection("contracts");
  const repository = useCollection("repository");
  const props = useRegister("properties");
  const [q, patchQ] = useQuery();
  const [group, setGroup] = useState("project");

  /* THE ZD PROJECT MASTER. A project is a "ZD project" when it appears in the
     projects tracker in Drive — not when its name happens to look like one.
     Matching is on the project name and on the entity that holds it, both
     normalised, because the trackers and the request form spell companies
     differently. */
  const zd = useMemo(() => {
    const byName = new Map(), byEntity = new Map();
    for (const p of (props.rows || [])) {
      const name = clean(p.project);
      if (!name) continue;
      const k = name.toLowerCase();
      if (!byName.has(k)) byName.set(k, { name, entity: clean(p.entity), city: clean(p.city), rows: [] });
      byName.get(k).rows.push(p);
      const e = clean(p.entity).toLowerCase();
      if (e && !byEntity.has(e)) byEntity.set(e, name);
    }
    return { byName, byEntity, count: byName.size };
  }, [props.rows]);

  /* ACTIVE WORK ONLY (§17). A finished request is history; this page is for
     deciding what to do next. The register-backed work is not merged in here —
     it has its own registers with their own filters, and duplicating it would
     make the same case countable twice. */
  const rows = useMemo(() => {
    const ctx = { requests, matters, contracts, repository, licenses: [], requesters: [] };
    const vis = filterVisible(me, requests || []);
    const visM = filterVisible(me, matters || []);
    return unifiedRows(vis, visM).map((u) => {
      const rec = u.record;
      const tat = rowTat(rec, ctx);
      const entity = clean(rec.entityName) || clean(entityName(rec.entityId)) || clean((rec.companyTags || []).filter(Boolean)[0]);
      // A request names its project outright, or inherits one from the entity
      // that holds exactly one project in the master.
      const named = clean(rec.project);
      const inherited = entity ? zd.byEntity.get(entity.toLowerCase()) : null;
      return {
        ...rec, id: u.id, title: u.title, __tat: tat,
        __entity: entity,
        __project: named || inherited || "",
        __isZd: !!(named ? zd.byName.has(named.toLowerCase()) : inherited),
        __requester: requesterOf(rec),
      };
    }).filter((r) => !r.__tat.done);
  }, [requests, matters, contracts, repository, me, zd]);

  /* The active dimension filters, straight out of the URL. */
  const active = {};
  for (const d of DIMENSIONS) { const v = q["pw_" + d.key]; if (v) active[d.key] = v; }
  const filtered = rows.filter((r) => DIMENSIONS.every((d) => !active[d.key] || valueOf(d, r) === active[d.key]));

  const setDim = (key, value) => patchQ({ ["pw_" + key]: active[key] === value ? null : value });
  const clearAll = () => patchQ(Object.fromEntries(DIMENSIONS.map((d) => ["pw_" + d.key, null])));

  const groupDim = DIMENSIONS.find((d) => d.key === group) || DIMENSIONS[0];
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const v = valueOf(groupDim, r);
      if (!m.has(v)) m.set(v, []);
      m.get(v).push(r);
    }
    return [...m.entries()]
      .map(([label, items]) => ({
        label, items,
        delayed: items.filter((x) => x.__tat.status === "Delayed").length,
        dueToday: items.filter((x) => x.__tat.status === "Due Today").length,
        zd: items.some((x) => x.__isZd),
      }))
      // "Not recorded" always sinks to the bottom: it is a data gap, not a
      // business unit, and it should never head the list by volume.
      .sort((a, b) => (a.label === NOT_RECORDED) - (b.label === NOT_RECORDED) || b.items.length - a.items.length);
  }, [filtered, groupDim]);

  const anyFilter = Object.keys(active).length > 0;

  return html`<div class="page page--wide fade-in">
    <${PageHead} title="Project Wise"
      sub="Live legal work cut by entity, business line, region, project and category. Every value here filters — and the cut lives in the URL."
      actions=${html`<${Btn} variant="ghost" icon="building" onClick=${() => navigate("/projects")}>Project documents</${Btn}>`} />

    <${StatStrip} stats=${[
      { value: filtered.length, label: "Active items", active: !anyFilter,
        onClick: clearAll, title: anyFilter ? "Clear every cut" : "Showing all active work" },
      { value: filtered.filter((r) => r.__tat.status === "Delayed").length, label: "Delayed",
        tone: filtered.some((r) => r.__tat.status === "Delayed") ? "red" : "" },
      { value: filtered.filter((r) => r.__tat.status === "Due Today").length, label: "Due today" },
      { value: new Set(filtered.map((r) => r.__project).filter(Boolean)).size, label: "Projects with live work" },
      { value: zd.count, label: "ZD projects on the master", onClick: () => navigate("/projects"),
        title: "Open the ZD projects tracker" },
    ]} />

    ${anyFilter && html`<div class="row wrap" style="gap:7px;margin-bottom:12px;align-items:center">
      <span class="tiny muted">Showing:</span>
      ${Object.entries(active).map(([k, v]) => { const d = DIMENSIONS.find((x) => x.key === k);
        return html`<button key=${k} type="button" class="tagchip" onClick=${() => setDim(k, v)}
          title=${"Remove the " + d.label + " cut"}>
          <${Icon} name=${d.icon} size=11 /> ${d.label}: ${v} <${Icon} name="x" size=11 /></button>`; })}
      <button type="button" class="fltbtn" onClick=${clearAll}>Clear all</button>
    </div>`}

    <div class="row wrap" style="gap:8px;margin-bottom:14px;align-items:center">
      <span class="tiny muted">Group by</span>
      ${DIMENSIONS.map((d) => html`<${Chip} key=${d.key} active=${group === d.key} onClick=${() => setGroup(d.key)}>
        <${Icon} name=${d.icon} size=12 /> ${d.label}</${Chip}>`)}
    </div>

    ${filtered.length === 0
      ? html`<${Empty} icon="layers" title="No active work matches this cut"
          text=${anyFilter ? "Clear a dimension above to widen it." : "Nothing in the department is currently open."} />`
      : html`<div class="col" style="gap:16px">
          <${Section} title=${"By " + groupDim.label} icon=${groupDim.icon}
            sub="Click a row to narrow every figure on this page to it.">
            <${DataTable} onRow=${(g) => setDim(groupDim.key, g.label)} rows=${groups} columns=${[
              { key: "label", label: groupDim.label, render: (g) => html`<div class="row" style="gap:8px">
                  <div class=${cx("cell-strong", g.label === NOT_RECORDED && "muted")}>${g.label}</div>
                  ${g.zd && groupDim.key === "project" && html`<${Pill} tone="green" title="On the ZD projects master in Drive">ZD project</${Pill}>`}
                  ${g.label === NOT_RECORDED && html`<${Pill} tone="gray" title="These records carry no value for this dimension">data gap</${Pill}>`}
                </div>` },
              { key: "items", label: "Active items", align: "right", render: (g) => html`<span class="strong">${g.items.length}</span>` },
              { key: "dueToday", label: "Due today", align: "right",
                render: (g) => html`<span class="tiny">${g.dueToday || "—"}</span>` },
              { key: "delayed", label: "Delayed", align: "right",
                render: (g) => (g.delayed
                  ? html`<${Pill} tone="red">${g.delayed}</${Pill}>`
                  : html`<span class="tiny muted">—</span>`) },
            ]} empty=${html`<div class="empty" style="padding:26px">Nothing to group.</div>`} />
          </${Section}>

          <${Section} title=${"Work in this cut (" + filtered.length + ")"} icon="inbox"
            sub="Every dimension in a row is clickable — narrow by it without leaving the page.">
            <div class="dense"><${DataTable} onRow=${(r) => navigate("/workspace/" + r.id)} rows=${filtered.slice(0, 200)} columns=${[
              { key: "title", label: "Work item", render: (r) => html`<div class="wrapcell">
                  <div class="cell-strong">${r.title}</div>
                  <div class="tiny muted">${r.id} · ${r.requestType || r.stage || "—"}</div></div>` },
              { key: "entity", label: "Entity", render: (r) => dimCell(DIMENSIONS[0], r, active, setDim) },
              { key: "line", label: "Business line", render: (r) => dimCell(DIMENSIONS[1], r, active, setDim) },
              { key: "region", label: "Region", render: (r) => dimCell(DIMENSIONS[3], r, active, setDim) },
              { key: "project", label: "Project", render: (r) => html`<div class="row" style="gap:6px">
                  ${dimCell(DIMENSIONS[4], r, active, setDim)}
                  ${r.__isZd && html`<${Pill} tone="green" title="On the ZD projects master">ZD</${Pill}>`}</div>` },
              { key: "category", label: "Matter category", render: (r) => dimCell(DIMENSIONS[5], r, active, setDim) },
              { key: "module", label: "Legal module", render: (r) => dimCell(DIMENSIONS[6], r, active, setDim) },
              { key: "owner", label: "Owner", render: (r) => (r.owner
                  ? html`<div class="row" style="gap:6px"><${Avatar} name=${nameOf(r.owner)} size="sm" />
                      <span class="tiny">${nameOf(r.owner).split(" ")[0]}</span></div>`
                  : html`<span class="tiny muted">Unassigned</span>`) },
              { key: "status", label: "Status", render: (r) => html`<${Status} value=${r.status} />` },
              { key: "due", label: "Due date", align: "right", render: (r) => { const d = r.dueDate || r.due;
                  const late = d && new Date(d) < Date.now();
                  return html`<div><div class=${cx("tiny strong", late && "risk--critical")}>${d ? fmt.dateShort(d) : "—"}</div>
                    <div class="tiny muted">${d ? fmt.until(d) : ""}</div></div>`; } },
            ]} empty=${html`<div class="empty" style="padding:26px">Nothing in this cut.</div>`} /></div>
            ${filtered.length > 200 && html`<div class="tiny muted" style="padding:8px 2px">
              Showing the first 200 of ${filtered.length}. Narrow a dimension above to see the rest.</div>`}
          </${Section}>
        </div>`}
  </div>`;
}

/* A dimension value rendered as the control it is. Not a label that happens to
   be clickable — a real button, with a name that says what activating it does. */
function dimCell(dim, r, active, setDim) {
  const v = valueOf(dim, r);
  const on = active[dim.key] === v;
  if (v === NOT_RECORDED) return html`<span class="tiny muted" title=${dim.label + " is not recorded on this item"}>—</span>`;
  return html`<button type="button" class=${cx("drillcell", on && "drillcell--on")}
    aria-pressed=${on ? "true" : "false"} title=${(on ? "Remove the " : "Narrow to ") + dim.label + " " + v}
    onClick=${(e) => { e.stopPropagation(); setDim(dim.key, v); }}>
    <span class="tiny">${v.length > 26 ? v.slice(0, 26) + "…" : v}</span></button>`;
}
