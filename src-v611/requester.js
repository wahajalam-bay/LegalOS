/* WHO RAISED THIS — one answer, everywhere.
 *
 * A request carries several overlapping ideas of "requester": the roster user
 * who typed it, the DEPARTMENT it was raised on behalf of, the portal account,
 * and the free-text name the intake form captured. Every screen picked a
 * different one, and the worst of them rendered the department id where the
 * person's name belongs — "dept-sales" printed under an avatar, as though a
 * human being were called that.
 *
 * `requesterOf` resolves them in one order, once:
 *
 *   1. what the intake actually CAPTURED about the person (`requestedBy`),
 *      because that is the individual who filled the form in;
 *   2. the portal requester registry, for a request raised at /portal/;
 *   3. the staff roster, for one raised inside Legal;
 *   4. nothing — and "nothing" is reported as "Not recorded", never as the id.
 *
 * DEPARTMENT IS NEVER A NAME. If all we hold is a department, the name field
 * says so in words and the department is shown as a department. A reader must
 * be able to tell "raised by Sales" from "raised by a person called Sales".
 *
 * EMPLOYEE CODE IS NEVER INVENTED (§22). LegalOS has no HR integration, so the
 * code is whatever a canonical HR source supplied and otherwise an explicit
 * statement that HR has not supplied one. Generating something plausible here
 * would put a fabricated staff number on an auditable record.
 */
import { html, cx } from "./core.js";
import { Icon } from "./icons.js";
import { Avatar, Pill } from "./ui.js";
import { byId } from "./data.js";
import { requesterById } from "./store.js";

export const NO_EMPLOYEE_CODE = "Employee code not available from HR source";

const clean = (v) => { const s = String(v == null ? "" : v).trim(); return s && s !== "—" ? s : ""; };

/* A department id ("dept-sales") is not a person. Recognising the shape is what
   stops it being rendered as one. */
const isDeptId = (id) => /^dept[-_]/i.test(String(id || ""));

export function requesterOf(rec) {
  const r = rec || {};
  const captured = r.requestedBy && typeof r.requestedBy === "object" ? r.requestedBy : {};
  const id = clean(r.requesterUserId) || clean(r.requestedById) || clean(r.requesterId) || clean(r.requester);
  const portal = id && String(id).startsWith("RQ-") ? (requesterById(id) || {}) : {};
  const staff = id && !isDeptId(id) && !String(id).startsWith("RQ-") ? (byId(id) || {}) : {};

  const name = clean(captured.name) || clean(portal.name) || clean(staff.name) || clean(r.requesterName);
  const department = clean(r.requesterDepartment) || clean(r.department) || clean(r.dept)
    || clean(portal.department) || clean(staff.dept) || clean(staff.team);
  const unit = clean(r.requesterBusinessUnit) || clean(r.bu) || clean(r.unit) || clean(portal.businessUnit);
  const email = clean(r.requesterEmail) || clean(captured.email) || clean(r.requestedByEmail)
    || clean(portal.email) || clean(staff.email);

  return {
    /* The USER id, or null. A department id is deliberately not returned here:
       it is an organisational unit, and handing it back as a user id is how it
       ended up in avatars and name columns. */
    userId: id && !isDeptId(id) ? id : null,
    departmentId: isDeptId(id) ? id : null,
    name: name || "",
    /* What to SHOW where a person's name goes. Never the raw id. */
    displayName: name || (department ? "Not recorded — raised for " + department : "Not recorded"),
    known: !!name,
    department: department || "",
    businessUnit: unit || "",
    email: email || "",
    designation: clean(captured.designation) || clean(staff.role) || "",
    /* §22 — from HR, or explicitly absent. Never derived, never generated. */
    employeeCode: clean(r.requesterEmployeeCode) || clean(captured.employeeCode) || clean(staff.employeeCode) || null,
    channel: clean(r.channel) || "",
    source: clean(r.source) || "",
  };
}

export const requesterName = (rec) => requesterOf(rec).displayName;

/* The compact cell for a register row. */
export function RequesterCell({ record, compact }) {
  const q = requesterOf(record);
  const second = [q.department, q.businessUnit].filter(Boolean).join(" · ") || q.email || "—";
  return html`<div class="row" style="gap:7px;min-width:0">
    ${q.known
      ? html`<${Avatar} name=${q.name} size="sm" />`
      : html`<span class="calpip calpip--blue" title="No individual recorded — raised on behalf of a department"
          style="width:26px;height:26px"><${Icon} name="users" size=13 /></span>`}
    <div style="min-width:0">
      <div class=${cx("tiny", q.known ? "strong" : "muted")} style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${compact && q.known ? q.name.split(" ")[0] : q.displayName}</div>
      <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${second}</div>
    </div>
  </div>`;
}

/* The full identity panel for a record page. Every field §21 requires, with the
   ones the source did not supply named as missing rather than left blank. */
export function RequesterCard({ record }) {
  const q = requesterOf(record);
  const rows = [
    ["Requester", q.known ? q.name : "Not recorded in the request"],
    ["Employee code", q.employeeCode || NO_EMPLOYEE_CODE],
    ["Department", q.department || "Not recorded"],
    ["Business unit", q.businessUnit || "Not recorded"],
    ["Email", q.email || "Not recorded"],
    ["Designation", q.designation || "Not recorded"],
    ["Raised through", q.channel === "portal" ? "Requester portal" : q.channel ? q.channel : "Internal intake"],
  ];
  return html`<div class="kvgrid" style="grid-template-columns:1fr">
    ${rows.map(([l, v]) => html`<div key=${l} class="kv">
      <div class="kv__l">${l}</div>
      <div class=${cx("kv__v", /^Not recorded|^Employee code not/.test(String(v)) && "muted")}
        style="overflow-wrap:anywhere">${v}</div>
    </div>`)}
    ${q.departmentId && !q.known && html`<div class="tiny muted" style="padding-top:6px">
      This request was raised on behalf of a department rather than by a named individual.
      LegalOS records the department; it does not present it as a person.</div>`}
  </div>`;
}
