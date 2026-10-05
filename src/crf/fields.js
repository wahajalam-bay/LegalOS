// THE FIELD RENDERER AND THE REPEATABLE GRID.
//
// Every contract request form in the app is drawn by this file from the schema
// the server serves. There is no per-type form component, so a field added to
// CRF-05 appears without anything here changing, and a field can never exist on
// screen that the server does not know how to validate.
//
// THE GRID is one component for counterparties, lessors, owners, co-employers,
// inventory, instalments, payments, milestones and contributions. Rows are
// structured objects -- never comma-separated text -- so each cell can be
// validated, counted and read back on its own.
import { html, cx, useState, Fragment } from "../core.js";
import { Icon } from "../icons.js";
import { Btn, Input, Field, DateInput, Pill } from "../ui.js";
import { visibleFields, isRequired, computeField, isBlank } from "./rules.js";

const money = (v) => {
  const n = Number(String(v == null ? "" : v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n.toLocaleString() : "";
};

/* One input. `problems` are the SERVER's, matched by key, so the message a
   field shows is the message that actually blocked submission. */
export function CrfField({ f, value, onChange, scope, allValues, problem, idPrefix, disabled }) {
  const id = (idPrefix || "f") + "-" + f.key;
  const calc = computeField(f, scope, allValues);
  const shown = f.calc ? (calc === undefined ? value : calc) : value;
  const ro = !!f.readOnly || !!f.calc || f.type === "auto" || disabled;

  const common = {
    id, disabled: ro,
    "aria-invalid": problem ? "true" : undefined,
    "aria-describedby": problem ? id + "-err" : (f.hint ? id + "-hint" : undefined),
  };

  let control;
  if (f.type === "select") {
    control = html`<select class="input" ...${common} value=${shown || ""}
      onChange=${(e) => onChange(e.target.value)}>
      <option value="">Select…</option>
      ${(f.options || []).map((o) => html`<option key=${o} value=${o}>${o}</option>`)}
    </select>`;
  } else if (f.type === "multiselect") {
    const on = Array.isArray(shown) ? shown : [];
    control = html`<div class="row wrap" style="gap:6px" role="group" aria-labelledby=${id + "-lbl"}>
      ${(f.options || []).map((o) => html`<button key=${o} type="button" disabled=${ro}
        class=${cx("tagchip", on.includes(o) && "tagchip--on")}
        aria-pressed=${on.includes(o) ? "true" : "false"}
        onClick=${() => onChange(on.includes(o) ? on.filter((x) => x !== o) : on.concat(o))}>${o}</button>`)}
    </div>`;
  } else if (f.type === "textarea" || f.type === "richtext") {
    control = html`<textarea class="input" rows=${f.type === "richtext" ? 6 : 3} ...${common}
      value=${shown || ""} onInput=${(e) => onChange(e.target.value)}></textarea>`;
  } else if (f.type === "date") {
    control = html`<${DateInput} ...${common} value=${shown || ""} onInput=${(e) => onChange(e.target.value)} />`;
  } else if (f.type === "money" || f.type === "number" || f.type === "percent") {
    control = html`<div class="row" style="gap:6px;align-items:center">
      <input class="input" type="text" inputMode="decimal" ...${common}
        value=${shown == null ? "" : String(shown)} onInput=${(e) => onChange(e.target.value)} />
      ${f.type === "percent" && html`<span class="tiny muted">%</span>`}
      ${f.type === "money" && money(shown) && html`<span class="tiny muted" style="white-space:nowrap">PKR ${money(shown)}</span>`}
    </div>`;
  } else if (f.type === "subgrid") {
    return html`<div class="crf__sub">
      <div class="row" style="gap:8px;align-items:baseline">
        <span class="tiny strong" id=${id + "-lbl"}>${f.label}</span>
        ${problem && html`<${Pill} tone="red">${problem.message}</${Pill}>`}
      </div>
      <${CrfGrid} columns=${f.columns || []} rows=${Array.isArray(value) ? value : []}
        onChange=${onChange} disabled=${ro} noun=${f.label} compact=${true} idPrefix=${id} />
    </div>`;
  } else {
    control = html`<input class="input" type=${f.type === "email" ? "email" : "text"} ...${common}
      value=${shown == null ? "" : String(shown)} onInput=${(e) => onChange(e.target.value)} />`;
  }

  return html`<div class=${cx("crf__f", problem && "crf__f--bad")} data-field=${f.key}>
    <label class="fldlabel" for=${id} id=${id + "-lbl"}>
      ${f.label}${isRequired(f, scope) ? html`<span class="crf__req" aria-hidden="true"> *</span>` : ""}
      ${f.standard !== undefined && html`<span class="tiny muted"> · standard: ${f.standard}</span>`}
    </label>
    ${control}
    ${problem && html`<div class="crf__err" id=${id + "-err"} role="alert">${problem.message}</div>`}
    ${!problem && f.hint && html`<div class="tiny muted" id=${id + "-hint"}>${f.hint}</div>`}
    ${/* A standard position that has been changed says so where it was changed,
          not only on the review page. */ ""}
    ${f.standard !== undefined && !isBlank(shown) && String(shown) !== String(f.standard)
      && html`<div class="crf__dev"><${Icon} name="alertTriangle" size=12 /> Non-standard — Special Terms will be required</div>`}
  </div>`;
}

/* THE REPEATABLE GRID. Cards on narrow screens, a table on wide ones; both are
   the same rows. Every control is a real button or input, so the whole thing
   is operable from the keyboard without a pointer. */
export function CrfGrid({ columns, rows, onChange, disabled, noun, problems, compact, idPrefix }) {
  const list = Array.isArray(rows) ? rows : [];
  const setRow = (i, key, v) => {
    const next = list.map((r, j) => (j === i ? Object.assign({}, r, { [key]: v }) : r));
    onChange(next);
  };
  const add = () => onChange(list.concat({}));
  const del = (i) => onChange(list.filter((_, j) => j !== i));
  const problemFor = (i, key) => (problems || []).find((p) => p.row === i && p.field === key);

  return html`<div class=${cx("crfgrid", compact && "crfgrid--compact")}>
    ${list.length === 0 && html`<div class="tiny muted" style="padding:8px 2px">
      No ${(noun || "rows").toLowerCase()} yet.</div>`}
    ${list.map((row, i) => html`<div key=${i} class="crfgrid__row" role="group"
      aria-label=${(noun || "Row") + " " + (i + 1)}>
      <div class="crfgrid__n">${i + 1}</div>
      <div class="crfgrid__cells">
        ${visibleFields({ fields: columns }, row).map((c) => html`<${CrfField} key=${c.key} f=${c}
          value=${row[c.key]} scope=${row} allValues=${row} disabled=${disabled}
          idPrefix=${(idPrefix || "g") + "-" + i}
          problem=${problemFor(i, c.key)}
          onChange=${(v) => setRow(i, c.key, v)} />`)}
      </div>
      ${!disabled && html`<button type="button" class="crfgrid__del" title=${"Remove " + (noun || "row") + " " + (i + 1)}
        aria-label=${"Remove " + (noun || "row") + " " + (i + 1)} onClick=${() => del(i)}>
        <${Icon} name="x" size=14 /></button>`}
    </div>`)}
    ${!disabled && html`<${Btn} size="sm" variant="ghost" icon="plus" onClick=${add}>
      Add ${(noun || "row").replace(/s$/, "").toLowerCase()}</${Btn}>`}
  </div>`;
}
