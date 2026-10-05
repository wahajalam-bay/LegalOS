/* THE LEGAL DIVISION CHART, on screen.
 *
 * Who heads each division, who works in it, who a requester's point of contact
 * is, and which matter categories route where. Before this, the department's
 * shape was implicit in three different places — an rbac flag, a user id
 * written into the reminder module, and nothing at all for the requester — and
 * none of them agreed.
 *
 * Read by anyone signed in, because a requester has to be able to learn who
 * their POC is and a lawyer has to be able to see who an escalation reaches.
 * Edited by an administrator; every change is audited on the server.
 */
import { html, cx, useState, useEffect } from "./core.js";
import { Icon } from "./icons.js";
import { Btn, Pill, Section, Field, Avatar, Empty, Picker } from "./ui.js";
import { api } from "./api.js";
import { toast } from "./toast.js";
import { USERS, nameOf, byId } from "./data.js";
import { useActiveUser } from "./rbac.js";

export function useDivisions(nonce) {
  const [s, setS] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    api.divisions.list().then(
      (d) => alive && setS({ data: d, loading: false, error: null }),
      (e) => alive && setS({ data: null, loading: false, error: e }));
    return () => { alive = false; };
  }, [nonce]);
  return s;
}

const staffOptions = () => USERS.filter((u) => u.legalTeam || u.rbac === "head")
  .map((u) => ({ value: u.id, label: u.name + " — " + u.role }));

function Person({ id, role }) {
  if (!id) return html`<span class="tiny muted">Not set</span>`;
  const u = byId(id) || {};
  return html`<div class="row" style="gap:8px;min-width:0">
    <${Avatar} name=${u.name || id} size="sm" />
    <div style="min-width:0">
      <div class="tiny strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.name || id}</div>
      <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${role || u.role || ""}</div>
    </div>
  </div>`;
}

function PeopleList({ ids, empty }) {
  if (!ids || !ids.length) return html`<span class="tiny muted">${empty}</span>`;
  return html`<div class="col" style="gap:6px">${ids.map((id) => html`<${Person} key=${id} id=${id} />`)}</div>`;
}

export function DivisionChart() {
  const me = useActiveUser();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useDivisions(nonce);
  const [editing, setEditing] = useState(null);
  const canEdit = !!(me && me.permissions && me.permissions.groups && me.permissions.groups.admin === "full");

  if (error) return html`<${Empty} icon="users" title="The division chart could not be read" text=${error.message || ""} />`;
  if (loading || !data) return html`<div class="tiny muted" style="padding:20px 2px">Reading the division chart…</div>`;

  return html`<div class="col" style="gap:16px">
    <div class="tiny muted">
      This is what the system routes on. A request's category decides its division, the division decides the
      point of contact a requester is shown, and an escalation goes one step up this chart — never to
      everybody.
    </div>

    ${data.divisions.map((d) => html`<${Section} key=${d.key} title=${d.label} icon="users"
      sub=${(d.categories || []).length ? "Routes: " + d.categories.join(", ") : "No routing categories set"}
      actions=${canEdit && html`<${Btn} size="sm" variant="ghost" icon="edit"
        onClick=${() => setEditing(d)}>Edit</${Btn}>`}>
      <div class="grid grid--4" style="gap:14px">
        <div><div class="kv__l" style="margin-bottom:6px">Division head</div><${Person} id=${d.headUserId} /></div>
        <div><div class="kv__l" style="margin-bottom:6px">Managers</div>
          <${PeopleList} ids=${d.managerUserIds} empty="No manager layer" /></div>
        <div><div class="kv__l" style="margin-bottom:6px">Members</div>
          <${PeopleList} ids=${d.memberUserIds} empty="No members" /></div>
        <div><div class="kv__l" style="margin-bottom:6px">Legal POCs</div>
          <${PeopleList} ids=${d.pocUserIds} empty="Falls back to the head" /></div>
      </div>
    </${Section}>`)}

    <${Section} title="Escalation" icon="arrowUp"
      sub="One step up, and never to everybody. A reminder nobody owns is a reminder nobody reads.">
      <div class="tiny">
        A member escalates to their division's manager, or to the head where the division has no manager
        layer. A manager escalates to the head. A head escalates to
        <strong>${nameOf(data.directorUserId)}</strong>. Outcome reminders on a hearing escalate
        automatically after seven days.
      </div>
    </${Section}>

    ${editing && html`<${EditDivision} division=${editing} all=${data.divisions}
      onClose=${() => setEditing(null)}
      onDone=${() => { setEditing(null); setNonce((n) => n + 1); }} />`}
  </div>`;
}

function EditDivision({ division, all, onClose, onDone }) {
  const [d, setD] = useState({ ...division });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const opts = staffOptions();

  const setList = (k, i, v) => setD((x) => {
    const list = (x[k] || []).slice();
    if (v) list[i] = v; else list.splice(i, 1);
    return { ...x, [k]: list.filter(Boolean) };
  });
  const addTo = (k) => setD((x) => ({ ...x, [k]: (x[k] || []).concat([""]) }));

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const next = all.map((x) => (x.key === d.key ? d : x));
      await api.divisions.save({ divisions: next });
      toast("Division chart updated.", "success");
      onDone();
    } catch (e) { setErr((e.payload && e.payload.detail) || e.message || "Could not save."); setBusy(false); }
  };

  const listField = (k, label, hint) => html`<${Field} label=${label} hint=${hint}>
    <div class="col" style="gap:6px">
      ${(d[k] || []).map((id, i) => html`<div key=${i} class="row" style="gap:6px">
        <div style="flex:1"><${Picker} options=${opts} value=${id} allowCustom=${false}
          placeholder="Select a person…" onChange=${(v) => setList(k, i, v)} /></div>
        <button type="button" class="iconbtn" style="width:28px;height:28px"
          title="Remove" onClick=${() => setList(k, i, "")}><${Icon} name="x" size=14 /></button>
      </div>`)}
      <button type="button" class="fltbtn" onClick=${() => addTo(k)}><${Icon} name="plus" size=12 /> Add</button>
    </div>
  </${Field}>`;

  return html`<div class="sheet" onClick=${onClose}>
    <div class="sheet__panel" onClick=${(e) => e.stopPropagation()}>
      <div class="sheet__bar">
        <span class="strong">${d.label}</span>
        <div class="spacer"></div>
        <button class="iconbtn" onClick=${onClose} title="Close"><${Icon} name="x" size=18 /></button>
      </div>
      <div class="sheet__body">
        <div class="col" style="gap:14px">
          ${err && html`<div class="tiny" style="color:var(--danger-text)">${err}</div>`}
          <${Field} label="Division head" hint="Escalations stop here before the Director.">
            <${Picker} options=${opts} value=${d.headUserId} allowCustom=${false}
              placeholder="Select a person…" onChange=${(v) => setD((x) => ({ ...x, headUserId: v }))} />
          </${Field}>
          ${listField("managerUserIds", "Managers", "A member's escalation goes to a manager before the head.")}
          ${listField("memberUserIds", "Members", "Who can be assigned work in this division.")}
          ${listField("pocUserIds", "Legal points of contact", "Who a requester is offered as a contact. Restricted to this division on purpose.")}
          <${Field} label="Routing categories"
            hint="A request whose matter category matches one of these routes to this division. One per line.">
            <textarea class="input" rows="4" value=${(d.categories || []).join("\\n")}
              onInput=${(e) => setD((x) => ({ ...x, categories: e.target.value.split(/\\n+/).map((s) => s.trim()).filter(Boolean) }))}></textarea>
          </${Field}>
          <div class="row" style="gap:8px">
            <${Btn} onClick=${onClose}>Cancel</${Btn}>
            <${Btn} variant="primary" icon="check" disabled=${busy} onClick=${save}>${busy ? "Saving…" : "Save chart"}</${Btn}>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
