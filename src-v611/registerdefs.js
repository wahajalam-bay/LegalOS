// Per-family register configuration.
//
// Every operational table in LegalOS is defined here as data — its columns, its
// contextual filters and its quick views — and rendered by the one shell in
// register.js. That is deliberate: filters are only useful when they answer a
// question someone actually asks of THAT register, so Litigation gets Next
// hearing and Licences gets Expiry, and neither gets the other's.
//
// EVERY field below exists in the adapters in live.js, which in turn map named
// columns out of the Drive workbooks. Nothing here is aspirational: if the
// source has no "response due" column, there is no Response due filter, and
// TABLE_FILTER_AUDIT.md records why.
import { html, cx, fmt } from "./core.js";
import { Icon } from "./icons.js";
import { Pill, Risk, Status } from "./ui.js";
import { dueState, MONEY_BUCKETS } from "./filters.js";
import { AGE_BUCKETS, OUTCOME_TONE, OUTCOME_SHORT } from "./litigationmodel.js";
import { navigate } from "./router.js";

/* ------------------------------------------------------------ shared cells -- */

const docCount = (r) => (r.driveFiles || []).length;

/* THE SOURCE'S CODES, IN THE WORDS A LAWYER USES (§85/§86).
 *
 * The ingest pipeline classifies every record it reads — COMPLETE,
 * INCOMPLETE_SOURCE, CONFLICTING_SOURCE, WEAK_IDENTITY — and those codes were
 * showing up verbatim in a filter called "Source quality" on six operational
 * registers. They are pipeline vocabulary. A compliance lawyer filtering a
 * licence register does not think in ingest states; they think "is anything
 * missing off this record".
 *
 * The codes are unchanged and still drive Data Health, which is where the
 * lineage, the drop counts and the reconciliation belong. What changes is the
 * word on the operational screen.
 */
export const QUALITY_LABEL = {
  COMPLETE: "Complete",
  INCOMPLETE_SOURCE: "Missing information",
  CONFLICTING_SOURCE: "Sources disagree",
  WEAK_IDENTITY: "Identity uncertain",
  NEEDS_INFORMATION: "Needs information",
};
export const qualityLabel = (v) => {
  const k = String(v == null ? "" : v).trim();
  if (!k) return null;
  return QUALITY_LABEL[k] || (/_/.test(k)
    ? k.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
    : k);
};

// A dated obligation, rendered honestly.
//
// This is the cell that used to read "527d overdue" against cases closed years
// ago. A past date on a finished matter is history, not a missed deadline, so
// only a record that still needs action can be overdue. `dueState` is the same
// function the Next-hearing filter uses, so the badge and the filter can never
// disagree about what "overdue" means.
export function DueCell({ row, field }) {
  const st = dueState(row, field);
  if (st.kind === "none") return html`<span class="tiny muted">—</span>`;
  if (st.kind === "past") {
    // Closed matter: show the date plainly, with no urgency styling.
    return html`<span class="tiny muted" title="Recorded date on a closed record">${fmt.dateShort(st.date)}</span>`;
  }
  /* THE DATE IS THE ANSWER; THE URGENCY IS THE ANNOTATION.
     This cell used to REPLACE the date with "2337d overdue", so a column
     headed Expiry showed no expiry -- and a reader had to do arithmetic to
     learn when a lease actually ended. The date is now always shown, with the
     urgency underneath it. */
  if (st.kind === "overdue") {
    /* A DAY COUNT IS USEFUL FOR A WEEK, NOT FOR A DECADE.
       "2765d overdue" reads as a system fault rather than a fact about a lease
       that ended in 2018. Inside three months the count is the point; beyond
       it, the word is. */
    const n = Math.abs(st.days);
    return html`<span class="tiny strong risk--high" title=${n + " days past this date"}>
      <${Icon} name="alertTriangle" size=11 /> ${fmt.dateShort(st.date)}
      <span class="tiny" style="font-weight:400;opacity:.85"> · ${n <= 90 ? n + "d overdue" : "overdue"}</span></span>`;
  }
  const soon = st.days <= 10;
  return html`<span class=${cx("tiny", soon ? "strong risk--high" : "")} title=${fmt.until(st.date)}>
    ${soon ? html`<${Icon} name="clock" size=11 /> ` : ""}${fmt.dateShort(st.date)}
    ${soon ? html`<span class="tiny" style="font-weight:400;opacity:.85"> · ${fmt.until(st.date)}</span>` : ""}</span>`;
}

/* A HEARING DATE THAT HAS GONE BY IS NOT "OVERDUE".
   DueCell is built for an obligation with a deadline — a licence expiry, a
   reply date — where a date in the past is a failure and "810d overdue" in red
   is the right alarm. A hearing is not that. The date went by because the
   matter was heard, or because it was adjourned; either way the court moved on
   and what is missing is the RECORD, not the action. The register was showing
   a wall of red "810d overdue" against cases where nothing at all had gone
   wrong, which trains a reader to ignore the column.

   So: the date, always. If it is in the past, one quiet line saying the
   outcome has not been recorded — which is the thing somebody can actually do
   something about, and it is the same reading the cause list's "Outcome
   pending" gives. No day count, no red. */
export function HearingCell({ row }) {
  const iso = String((row && row.nextHearing) || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return html`<span class="tiny muted">—</span>`;
  const today = new Date().toISOString().slice(0, 10);
  if (iso > today) {
    const days = Math.round((new Date(iso) - new Date(today)) / 86400000);
    const soon = days <= 10;
    return html`<span class=${cx("tiny", soon && "strong")} title=${fmt.until(iso)}>
      ${fmt.dateShort(iso)}${soon ? html`<span class="tiny" style="font-weight:400;opacity:.85"> · ${fmt.until(iso)}</span>` : ""}</span>`;
  }
  if (iso === today) return html`<span class="tiny strong" title="Listed today">${fmt.dateShort(iso)} · today</span>`;
  /* A DECIDED CASE IS NOT WAITING FOR AN OUTCOME. Its last listed date is
     simply the last time it was in court; saying "outcome not recorded"
     against a matter whose decision is on the record is the register
     contradicting itself one column over. */
  const decided = row && (row.lifecycle === "Decided" || row.outcomeCode);
  if (decided) return html`<span class="tiny muted" title="The last listed date before the case was decided">${fmt.dateShort(iso)}</span>`;
  return html`<span class="tiny muted" title="The listed date has gone by and no outcome is recorded against it">
    ${fmt.dateShort(iso)}<span class="tiny" style="opacity:.8"> · outcome not recorded</span></span>`;
}

/* AN EXPIRY DATE, IN WORDS A PERSON USES.
 *
 * The register used to render "2765d overdue" against a licence that lapsed in
 * 2018. Nobody counts in thousands of days, the number implied an urgency that
 * had passed seven years ago, and the column headed Expiry did not show the
 * expiry. A lapsed instrument is EXPIRED -- that is the fact, and the date says
 * when.
 *
 * Four states, and they are the only four:
 *   No expiry recorded   the source states none
 *   Expired              the date has gone by
 *   Expires in N days    inside the renewal window (90 days)
 *   Upcoming             beyond it
 *
 * The recent past keeps its day count ("Expired 12 days ago") because that IS
 * actionable; beyond three months it is simply expired.
 */
export function ExpiryCell({ date, window = 90 }) {
  if (!date) return html`<span class="tiny muted">No expiry recorded</span>`;
  const d = new Date(String(date).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return html`<span class="tiny muted">No expiry recorded</span>`;
  const days = Math.round((d - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) {
    const recent = days >= -90;
    return html`<span class="tiny strong risk--high" title=${fmt.date(date)}>
      <${Icon} name="alertTriangle" size=11 /> Expired
      <span class="tiny" style="font-weight:400;opacity:.85"> · ${recent ? Math.abs(days) + " days ago" : fmt.dateShort(date)}</span></span>`;
  }
  if (days <= window) {
    return html`<span class="tiny strong risk--med" title=${fmt.date(date)}>
      <${Icon} name="clock" size=11 /> Expires in ${days} day${days === 1 ? "" : "s"}
      <span class="tiny" style="font-weight:400;opacity:.85"> · ${fmt.dateShort(date)}</span></span>`;
  }
  return html`<span class="tiny" title=${fmt.date(date)}>${fmt.dateShort(date)}
    <span class="muted"> · upcoming</span></span>`;
}

// A drill-down badge: narrows the register it sits in. A real <button> so it is
// reachable by keyboard, and stopPropagation so it filters instead of opening
// the row it lives in.
export function DrillCell({ f, fkey, value, title, children }) {
  /* A WHITESPACE VALUE IS NOT A VALUE. Several source cells hold a single
     space; treating one as real produced a button whose label, content and
     title were all blank — a control a screen reader announces as nothing. */
  value = typeof value === "string" ? value.trim() : value;
  if (!value || value === "—") return html`<span class="tiny muted">—</span>`;
  const on = (f.active[fkey] || []).includes(value);
  return html`<button type="button" class=${cx("drillcell", on && "drillcell--on")}
    title=${title || `Filter by ${value}`}
    aria-pressed=${on ? "true" : "false"}
    onClick=${(e) => { e.stopPropagation(); f.toggle(fkey, value); }}>${children}</button>`;
}

export function DocsCell({ row, onOpen }) {
  const n = docCount(row);
  if (!n) return html`<span class="tiny muted">—</span>`;
  return html`<button type="button" class="drillcell" title=${`Open ${n} document${n > 1 ? "s" : ""}`}
    onClick=${(e) => { e.stopPropagation(); onOpen(row); }}><${Pill} tone="indigo">${n}</${Pill}></button>`;
}

const money = (v, cur) => (Number(v) > 0 ? fmt.money(v, cur || "PKR") : "—");
const plainDate = (v) => (v ? fmt.date(v) : "");

/* ============================================================ LITIGATION CASES */

/* LIFECYCLE AND OUTCOME ARE SEPARATE FILTERS, because they are separate facts.
   "Status" used to be the only one, and it answered a question nobody asks: is
   this matter finished. Whether the company WON is the question, and until
   these were split there was no way to ask it. Court and City are promoted out
   of the advanced drawer (§67) — they are the first two things a litigation
   associate narrows by. */
export const caseFields = [
  { key: "lifecycle", label: "Lifecycle",  type: "multi", get: (r) => r.lifecycle },
  { key: "outcome",   label: "Outcome",    type: "multi", get: (r) => r.outcomeState },
  { key: "forag",     label: "For / Against", type: "multi", get: (r) => r.forAgainst },
  { key: "type",      label: "Case type",  type: "multi", get: (r) => r.type },
  { key: "court",     label: "Court / forum", type: "multi", get: (r) => r.court },
  { key: "city",      label: "City",       type: "multi", get: (r) => r.city },
  { key: "hearing",   label: "Next hearing", type: "date", get: (r) => r.nextHearing },
  // --- More filters ---
  { key: "counsel",  label: "Law firm / counsel", type: "multi", get: (r) => r.counsel, advanced: true },
  { key: "entity",   label: "Entity",       type: "multi", get: (r) => r.entity,       advanced: true },
  { key: "stage",    label: "Stage",        type: "multi", get: (r) => r.stage,        advanced: true },
  { key: "risk",     label: "Risk",         type: "multi", get: (r) => r.risk,         advanced: true },
  { key: "age",      label: "Matter age",   type: "multi", get: (r) => {
      const b = AGE_BUCKETS.find((x) => x.id === r.ageBucket); return b ? b.label : null; }, advanced: true },
  { key: "year",     label: "Filed in",     type: "multi", get: (r) => r.filedYear,    advanced: true },
  { key: "claim",    label: "Claim value",  type: "money", get: (r) => (Number(r.exposure) > 0 ? r.exposure : (r.exposure === 0 ? 0 : null)), advanced: true },
  { key: "docs",     label: "Documents",    type: "count", get: docCount,              advanced: true },
  { key: "filed",    label: "Filed",        type: "datePast", get: (r) => r.filed,     advanced: true },
  { key: "quality",  label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.dataQuality), advanced: true },
];

export const caseSearchKeys = ["title", "entity", "court", "city", "caseNo", "counsel", "type", "position", "outcome"];

export const caseViews = [
  { id: "active",   label: "Active cases",      filters: { lifecycle: "Active" } },
  { id: "hearing7", label: "Hearings next 7 days", filters: { hearing: "d7" } },
  { id: "overdue",  label: "Overdue hearings",  filters: { hearing: "overdue" } },
  { id: "against",  label: "Brought against us", filters: { forag: "Against" } },
  { id: "decided",  label: "Decided cases",     filters: { lifecycle: "Decided" } },
  { id: "noresult", label: "Decided, outcome not recorded", filters: { lifecycle: "Decided", outcome: "Not Recorded" } },
  { id: "nodocs",   label: "No documents",      filters: { docs: "none" } },
];

/* THE DEFAULT REGISTER IS WHAT A LITIGATION ASSOCIATE READS (§65), AND IT HAS
   TO FIT ON THEIR SCREEN (§7/§89).
   Measured at 1366x768 this table ran 700px past its container: sixteen
   columns is a database dump, not a register. Ten are on by default — the ones
   that answer "which case, whose side, what is it worth, who is running it,
   where has it got to, when am I next in court" — and the other six are one
   click away in Columns, still sortable and still exported.
   Filed Date is gone from the default set: it is history, it is in the drawer,
   and it was occupying a column at 1366px that Position, City and Outcome each
   needed more. Exposure is now Claim Value — the tracker records what is being
   CLAIMED, and calling that exposure asserts an accounting position the legal
   register has no basis for. */
export const caseColumns = (f, { onDocs }) => [
  { key: "id", label: "ID", mono: true, width: "96px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "title", label: "Case", essential: true, sortValue: true, plain: (r) => r.title,
    render: (r) => html`<div class="cell-strong">${r.title}</div>
      <div class="tiny muted">${[r.caseNo, r.court || r.jurisdiction].filter(Boolean).join(" · ")}</div>` },
  { key: "type", label: "Case type", sortValue: true, plain: (r) => r.type,
    render: (r) => html`<${DrillCell} f=${f} fkey="type" value=${r.type} title="Filter by case type"><${Pill} tone="gray">${r.type}</${Pill}></${DrillCell}>` },
  { key: "forAgainst", label: "Position", sortValue: true, plain: (r) => r.forAgainst,
    render: (r) => html`<${DrillCell} f=${f} fkey="forag" value=${r.forAgainst} title="Filter by side">
      <${Pill} tone=${r.forAgainst === "For" ? "blue" : r.forAgainst === "Against" ? "amber" : "gray"}>${r.forAgainst === "Not stated in source" ? "Not stated" : r.forAgainst}</${Pill}></${DrillCell}>` },
  { key: "court", label: "Court", secondary: true, sortValue: true, plain: (r) => r.court,
    render: (r) => html`<${DrillCell} f=${f} fkey="court" value=${r.court} title="Filter by court"><span class="tiny">${(r.court || "—").slice(0, 28)}</span></${DrillCell}>` },
  { key: "city", label: "City", secondary: true, sortValue: true, plain: (r) => r.city,
    render: (r) => html`<${DrillCell} f=${f} fkey="city" value=${r.city} title="Filter by city">
      <span class=${r.city === "Not stated in source" ? "tiny muted" : "tiny"}>${r.city === "Not stated in source" ? "—" : r.city}</span></${DrillCell}>` },
  { key: "exposure", label: "Claim value", align: "right", sortAs: "number", sortValue: true,
    plain: (r) => (Number(r.exposure) > 0 ? r.exposure : ""),
    render: (r) => html`<span class="strong">${money(r.exposure, r.currency)}</span>` },
  { key: "counsel", label: "Law firm / counsel", sortValue: true, plain: (r) => r.counsel,
    render: (r) => html`<${DrillCell} f=${f} fkey="counsel" value=${r.counsel} title="Filter by law firm"><span class="tiny">${r.counsel}</span></${DrillCell}>` },
  { key: "entity", label: "Entity", secondary: true, sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title="Filter by entity"><span class="tiny">${(r.entity || "—").slice(0, 28)}</span></${DrillCell}>` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onDocs} />` },
  { key: "lifecycle", label: "Lifecycle", sortValue: true, plain: (r) => r.lifecycle,
    render: (r) => html`<${DrillCell} f=${f} fkey="lifecycle" value=${r.lifecycle} title="Filter by lifecycle">
      <${Pill} tone=${r.lifecycle === "Active" ? "green" : "gray"}>${r.lifecycle}</${Pill}></${DrillCell}>` },
  { key: "outcomeState", label: "Outcome", sortValue: true, plain: (r) => r.outcomeState,
    render: (r) => (r.lifecycle === "Active"
      ? html`<span class="tiny muted">—</span>`
      : html`<${DrillCell} f=${f} fkey="outcome" value=${r.outcomeState} title=${r.outcomeState + " — filter by outcome"}>
          <${Pill} tone=${OUTCOME_TONE[r.outcomeState] || "gray"}>${OUTCOME_SHORT[r.outcomeState] || r.outcomeState}</${Pill}></${DrillCell}>`) },
  { key: "nextHearing", label: "Next hearing", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.nextHearing),
    render: (r) => html`<${HearingCell} row=${r} />` },
  { key: "filed", label: "Filed", secondary: true, sortAs: "date", sortValue: true, plain: (r) => plainDate(r.filed),
    render: (r) => html`<span class="tiny muted">${r.filed ? fmt.dateShort(r.filed) : "—"}</span>` },
  { key: "risk", label: "Risk", secondary: true, sortValue: true, plain: (r) => r.risk,
    render: (r) => html`<${DrillCell} f=${f} fkey="risk" value=${r.risk} title="Filter by risk"><${Risk} level=${r.risk} /></${DrillCell}>` },
  { key: "stage", label: "Stage", secondary: true, sortValue: true, plain: (r) => r.stage,
    render: (r) => html`<${DrillCell} f=${f} fkey="stage" value=${r.stage} title="Filter by stage"><${Pill} tone="blue">${r.stage}</${Pill}></${DrillCell}>` },
];

/* ============================================================== LEGAL NOTICES */
// The source columns are: date of notice, date of receipt, sender, recipient,
// category, details, status, date of reply, comments. There is NO owner, NO
// entity, NO jurisdiction and NO response-DUE column — "date of reply" records
// when a reply went out, not when one is owed. So those filters do not exist
// here, rather than existing and being empty. See TABLE_FILTER_AUDIT.md.

export const noticeFields = [
  /* DIRECTION IS THE FIRST QUESTION ANYBODY ASKS OF A NOTICE: did this come to
     us, or did we send it. It was an advanced filter, behind "More", on a
     register of 255 rows. A notice recorded in LegalOS states its direction; a
     tracker row does not, and the server reads it off the parties against the
     group's own companies rather than guessing from whoever the sender happens
     to be — see deriveNoticeDirection in api/registers.js. A row naming us on
     both sides or neither stays "Not recorded". */
  { key: "direction", label: "Direction",  type: "multi", get: (r) => r.direction },
  { key: "category", label: "Notice type", type: "multi", get: (r) => r.category },
  { key: "entity",    label: "Entity",     type: "multi", get: (r) => r.entity },
  { key: "status",   label: "Status",      type: "multi", get: (r) => r.status },
  { key: "replied",  label: "Reply",       type: "multi", get: (r) => (r.replyDate ? "Replied" : "No reply recorded") },
  { key: "issued",   label: "Notice date", type: "datePast", get: (r) => r.noticeDate },
  // --- More filters ---
  { key: "sender",   label: "Sender",      type: "multi", get: (r) => r.sender, advanced: true },
  { key: "recipient", label: "Recipient",  type: "multi",    get: (r) => r.recipient,  advanced: true },
  { key: "response",  label: "Response required", type: "multi", get: (r) => r.responseRequired, advanced: true },
  { key: "deadline",  label: "Response deadline", type: "date",  get: (r) => r.replyDeadline, advanced: true },
  { key: "owner",     label: "Owner",      type: "multi", get: (r) => r.owner,     advanced: true },
  { key: "received",  label: "Date received", type: "datePast", get: (r) => r.receiptDate, advanced: true },
  { key: "docs",      label: "Documents",  type: "count",    get: docCount,            advanced: true },
  { key: "quality",   label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.dataQuality), advanced: true },
];

export const noticeSearchKeys = ["sender", "recipient", "details", "category", "status", "comments"];

export const noticeViews = [
  { id: "unresolved", label: "Not resolved",   filters: { status: [] } },   // replaced at build time
  { id: "noreply",    label: "No reply recorded", filters: { replied: "No reply recorded" } },
  { id: "recent",     label: "Issued this month", filters: { issued: "p30" } },
  { id: "nodocs",     label: "No documents",   filters: { docs: "none" } },
];

export const noticeColumns = (f, { onDocs }) => [
  { key: "id", label: "ID", mono: true, width: "104px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "direction", label: "Direction", width: "108px", sortValue: true, plain: (r) => r.direction,
    render: (r) => html`<${DrillCell} f=${f} fkey="direction" value=${r.direction}
      title=${r.directionBasis ? "Direction " + r.directionBasis : "Filter by direction"}>
      <${Pill} tone=${r.direction === "Sent" ? "blue" : r.direction === "Received" ? "amber" : "gray"}>
        ${r.direction}</${Pill}></${DrillCell}>` },
  { key: "details", label: "Notice / subject", essential: true, sortValue: true, plain: (r) => r.details,
    render: (r) => html`<div class="cell-strong">${r.details || r.category}</div>
      <div class="tiny muted">${r.sender} → ${r.recipient}</div>` },
  { key: "category", label: "Type", sortValue: true, plain: (r) => r.category,
    render: (r) => html`<${DrillCell} f=${f} fkey="category" value=${r.category} title="Filter by notice type"><${Pill} tone="gray">${r.category}</${Pill}></${DrillCell}>` },
  { key: "sender", label: "Sender", sortValue: true, plain: (r) => r.sender,
    render: (r) => html`<${DrillCell} f=${f} fkey="sender" value=${r.sender} title="Filter by sender"><span class="tiny">${(r.sender || "—").slice(0, 30)}</span></${DrillCell}>` },
  { key: "recipient", label: "Recipient", secondary: true, sortValue: true, plain: (r) => r.recipient,
    render: (r) => html`<span class="tiny">${(r.recipient || "—").slice(0, 30)}</span>` },
  { key: "noticeDate", label: "Issued", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.noticeDate),
    render: (r) => html`<span class="tiny">${r.noticeDate ? fmt.dateShort(r.noticeDate) : "—"}</span>` },
  { key: "receiptDate", label: "Received", secondary: true, sortAs: "date", sortValue: true, plain: (r) => plainDate(r.receiptDate),
    render: (r) => html`<span class="tiny muted">${r.receiptDate ? fmt.dateShort(r.receiptDate) : "—"}</span>` },
  { key: "replyDate", label: "Replied", secondary: true, sortAs: "date", sortValue: true, plain: (r) => plainDate(r.replyDate),
    render: (r) => html`<span class="tiny muted">${r.replyDate ? fmt.dateShort(r.replyDate) : "—"}</span>` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onDocs} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status} /></${DrillCell}>` },
];

/* ================================================================== LICENCES */
// Source columns: entity, authority, number, issued, expiry, status, owner.

export const LICENCE_EXPIRY = [
  { value: "expired", label: "Expired" },
  { value: "d30",     label: "Expires ≤ 30 days" },
  { value: "d60",     label: "Expires ≤ 60 days" },
  { value: "d90",     label: "Expires ≤ 90 days" },
  { value: "valid90", label: "Valid beyond 90 days" },
  { value: "none",    label: "No expiry recorded" },
];
// Licence expiry is a hard calendar fact from the regulator, so unlike a hearing
// date it IS overdue once passed regardless of the row's status text.
export function licenceExpiryMatch(r, preset) {
  const d = r.expiry ? new Date(r.expiry) : null;
  if (!d || isNaN(d)) return preset === "none";
  const days = Math.round((d - new Date(new Date().toDateString())) / 86400000);
  switch (preset) {
    case "expired": return days < 0;
    case "d30":  return days >= 0 && days <= 30;
    case "d60":  return days >= 0 && days <= 60;
    case "d90":  return days >= 0 && days <= 90;
    case "valid90": return days > 90;
    default: return false;
  }
}
export const licenceFields = [
  { key: "status",    label: "Status",    type: "multi", get: (r) => r.status },
  { key: "entity",    label: "Entity",    type: "multi", get: (r) => r.entity },
  { key: "authority", label: "Regulator", type: "multi", get: (r) => r.authority },
  { key: "expiry",    label: "Expiry",    type: "bucket", get: (r) => r.expiry,
    // Presented as buckets, matched by the calendar rule above.
    options: LICENCE_EXPIRY, custom: licenceExpiryMatch },
  { key: "owner",     label: "Owner",     type: "multi", get: (r) => r.owner,   advanced: true },
  { key: "issued",    label: "Issued",    type: "datePast", get: (r) => r.issued, advanced: true },
  { key: "docs",      label: "Documents", type: "count", get: docCount,         advanced: true },
  { key: "quality",   label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.dataQuality), advanced: true },
];
export const licenceSearchKeys = ["entity", "authority", "number", "status", "owner"];
export const licenceViews = [
  { id: "expired", label: "Expired",          filters: { expiry: "expired" } },
  { id: "d90",     label: "Expiring ≤ 90 days", filters: { expiry: "d90" } },
  { id: "valid",   label: "Valid beyond 90 days", filters: { expiry: "valid90" } },
  { id: "nodocs",  label: "No documents",     filters: { docs: "none" } },
];
export const licenceColumns = (f, { onDocs }) => [
  { key: "number", label: "Reference", mono: true, essential: true, sortValue: true, plain: (r) => r.number,
    render: (r) => html`<span class="cell-mono">${r.number || r.id}</span>` },
  { key: "entity", label: "Entity", essential: true, sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<div class="cell-strong">${r.entity || "—"}</div><div class="tiny muted">${r.authority || ""}</div>` },
  { key: "authority", label: "Regulator", sortValue: true, plain: (r) => r.authority,
    render: (r) => html`<${DrillCell} f=${f} fkey="authority" value=${r.authority} title="Filter by regulator"><span class="tiny">${r.authority}</span></${DrillCell}>` },
  { key: "issued", label: "Issued", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.issued),
    render: (r) => html`<span class="tiny muted">${r.issued ? fmt.dateShort(r.issued) : "—"}</span>` },
  { key: "expiry", label: "Expiry", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.expiry),
    render: (r) => html`<${LicenceExpiryCell} row=${r} />` },
  { key: "owner", label: "Owner", sortValue: true, plain: (r) => r.owner,
    render: (r) => html`<span class="tiny">${r.owner || "—"}</span>` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onDocs} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status} /></${DrillCell}>` },
];
function LicenceExpiryCell({ row }) {
  return html`<${ExpiryCell} date=${row.expiry} />`;
}

/* ===================================================================== LOANS */
// Source columns: ref, borrower, lender, amount, currency, interest, term,
// agreement date, repayment date, status.
export const loanFields = [
  { key: "status",   label: "Status",       type: "multi", get: (r) => r.status },
  { key: "borrower", label: "Borrower",     type: "multi", get: (r) => r.borrower },
  { key: "lender",   label: "Lender",       type: "multi", get: (r) => r.lender },
  { key: "amount",   label: "Value",        type: "money", get: (r) => (r.amount || r.amount === 0 ? r.amount : null) },
  { key: "repay",    label: "Repayment",    type: "date",  get: (r) => r.repaymentDate },
  { key: "term",     label: "Term",         type: "multi", get: (r) => r.term,     advanced: true },
  { key: "signed",   label: "Agreement date", type: "datePast", get: (r) => r.agreementDate, advanced: true },
  { key: "docs",     label: "Documents",    type: "count", get: docCount,          advanced: true },
  { key: "quality",  label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.dataQuality), advanced: true },
];
export const loanSearchKeys = ["ref", "borrower", "lender", "status", "term"];
export const loanViews = [
  { id: "repay30", label: "Repayment ≤ 30 days", filters: { repay: "d30" } },
  { id: "overdue", label: "Repayment passed",    filters: { repay: "overdue" } },
  { id: "big",     label: "PKR 100M+",           filters: { amount: "gt100m" } },
  { id: "nodocs",  label: "No documents",        filters: { docs: "none" } },
];
export const loanColumns = (f, { onDocs }) => [
  { key: "ref", label: "Reference", mono: true, essential: true, sortValue: true, plain: (r) => r.ref,
    render: (r) => html`<span class="cell-mono">${r.ref || r.id}</span>` },
  { key: "borrower", label: "Agreement", essential: true, sortValue: true, plain: (r) => r.borrower,
    render: (r) => html`<div class="cell-strong">${r.borrower || "—"}</div>
      <div class="tiny muted">${r.lender ? "← " + r.lender : ""}</div>` },
  { key: "lender", label: "Lender / counterparty", sortValue: true, plain: (r) => r.lender,
    render: (r) => html`<${DrillCell} f=${f} fkey="lender" value=${r.lender} title="Filter by lender"><span class="tiny">${(r.lender || "—").slice(0, 30)}</span></${DrillCell}>` },
  { key: "amount", label: "Value", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.amount || "",
    render: (r) => html`<span class="strong">${money(r.amount, r.currency)}</span>` },
  { key: "term", label: "Term", sortValue: true, plain: (r) => r.term,
    render: (r) => html`<span class="tiny">${r.term || "—"}</span>` },
  { key: "agreementDate", label: "Start", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.agreementDate),
    render: (r) => html`<span class="tiny muted">${r.agreementDate ? fmt.dateShort(r.agreementDate) : "—"}</span>` },
  { key: "repaymentDate", label: "Repayment", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.repaymentDate),
    render: (r) => html`<${DueCell} row=${r} field="repaymentDate" />` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onDocs} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status} /></${DrillCell}>` },
];

/* =============================================================== RESOLUTIONS */
// Source columns: date, agenda, docNo; entity is derived from the Drive folder.
export const resolutionFields = [
  { key: "entity", label: "Entity", type: "multi", get: (r) => r.entity },
  { key: "date",   label: "Date",   type: "datePast", get: (r) => r.date },
  { key: "docs",   label: "Documents", type: "count", get: docCount },
  { key: "quality", label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.dataQuality), advanced: true },
];
export const resolutionSearchKeys = ["agenda", "entity", "docNo"];
export const resolutionViews = [
  { id: "year",   label: "Passed this year", filters: { date: "p365" } },
  { id: "nodocs", label: "No documents",     filters: { docs: "none" } },
];
export const resolutionColumns = (f, { onDocs }) => [
  { key: "docNo", label: "Reference", mono: true, width: "120px", essential: true, sortValue: true, plain: (r) => r.docNo,
    render: (r) => html`<span class="cell-mono">${r.docNo || r.id}</span>` },
  { key: "agenda", label: "Resolution", essential: true, sortValue: true, plain: (r) => r.agenda,
    render: (r) => html`<div class="cell-strong">${r.agenda || "—"}</div>` },
  { key: "entity", label: "Entity", sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title="Filter by entity"><span class="tiny">${r.entity}</span></${DrillCell}>` },
  { key: "date", label: "Date", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.date),
    render: (r) => html`<span class="tiny">${r.date ? fmt.date(r.date) : "—"}</span>` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onDocs} />` },
];

/* ================================================================ PROPERTIES */
// Source columns: project, address, city, entity, ownership, jv, value, start,
// contractor, status.
export const propertyFields = [
  { key: "entity",    label: "Entity",    type: "multi", get: (r) => r.entity },
  { key: "city",      label: "City",      type: "multi", get: (r) => r.city },
  { key: "ownership", label: "Ownership", type: "multi", get: (r) => r.ownership },
  { key: "status",    label: "Status",    type: "multi", get: (r) => r.status },
  { key: "value",     label: "Value",     type: "money", get: (r) => (r.value || r.value === 0 ? r.value : null), advanced: true },
  { key: "jv",        label: "JV partner",type: "multi", get: (r) => r.jv,        advanced: true },
  { key: "contractor",label: "Contractor",type: "multi", get: (r) => r.contractor, advanced: true },
  { key: "start",     label: "Start date",type: "datePast", get: (r) => r.start,   advanced: true },
  { key: "docs",      label: "Documents", type: "count", get: docCount,           advanced: true },
];
export const propertySearchKeys = ["project", "entity", "city", "address", "contractor", "jv"];
export const propertyViews = [
  { id: "nodocs", label: "No documents", filters: { docs: "none" } },
];
export const propertyColumns = (f, { onDocs }) => [
  { key: "id", label: "ID", mono: true, width: "104px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "project", label: "Property / project", essential: true, sortValue: true, plain: (r) => r.project,
    render: (r) => html`<div class="cell-strong">${r.project || "—"}</div>
      <div class="tiny muted">${[r.address, r.city].filter(Boolean).join(", ")}</div>` },
  { key: "entity", label: "Entity", sortValue: true, plain: (r) => r.entity,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entity} title="Filter by entity"><span class="tiny">${(r.entity || "—").slice(0, 26)}</span></${DrillCell}>` },
  { key: "city", label: "Location", sortValue: true, plain: (r) => r.city,
    render: (r) => html`<${DrillCell} f=${f} fkey="city" value=${r.city} title="Filter by city"><span class="tiny">${r.city}</span></${DrillCell}>` },
  { key: "ownership", label: "Ownership", sortValue: true, plain: (r) => r.ownership,
    render: (r) => html`<span class="tiny">${r.ownership || "—"}</span>` },
  { key: "value", label: "Value", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.value || "",
    render: (r) => html`<span class="strong">${money(r.value)}</span>` },
  { key: "docs", label: "Docs", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => html`<${DocsCell} row=${r} onOpen=${onDocs} />` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status} /></${DrillCell}>` },
];

/* ================================================================= CONTRACTS */
// Source fields via adaptContracts: title, type/contractType, counterparty,
// entityName/entityNames, status, risk, value, start, expiry, city, region,
// dept, handlerName, category, docFiles (named in the tracker), driveFiles
// (actually linked in Drive).

// Expiry on a contract is a date fact, not a status — the register has no
// "Expiring" status, it has end dates.
export const CONTRACT_EXPIRY = [
  { value: "expired", label: "Expired" },
  { value: "d30",     label: "Expiring ≤ 30 days" },
  { value: "d90",     label: "Expiring ≤ 90 days" },
  { value: "d365",    label: "Expiring within a year" },
  { value: "beyond",  label: "Runs beyond a year" },
  { value: "none",    label: "No expiry recorded" },
];
export function contractExpiryMatch(r, preset) {
  const d = r.expiry ? new Date(r.expiry) : null;
  if (!d || isNaN(d)) return preset === "none";
  const days = Math.round((d - new Date(new Date().toDateString())) / 86400000);
  switch (preset) {
    case "expired": return days < 0;
    case "d30":  return days >= 0 && days <= 30;
    case "d90":  return days >= 0 && days <= 90;
    case "d365": return days >= 0 && days <= 365;
    case "beyond": return days > 365;
    default: return false;
  }
}

export const contractFields = [
  { key: "status",   label: "Status",        type: "multi", get: (r) => r.status },
  { key: "category", label: "Category",      type: "multi", get: (r) => r.category },
  { key: "ctype",    label: "Contract type", type: "multi", get: (r) => r.contractType },
  { key: "risk",     label: "Risk",          type: "multi", get: (r) => r.risk },
  { key: "expiry",   label: "Expiry",        type: "bucket", options: CONTRACT_EXPIRY, custom: contractExpiryMatch },
  // --- More filters ---
  { key: "entity",   label: "Entity",        type: "multi", get: (r) => r.entityName,   advanced: true },
  { key: "party",    label: "Counterparty",  type: "multi", get: (r) => r.counterparty, advanced: true },
  { key: "owner",    label: "Owner",         type: "multi", get: (r) => r.handlerName,  advanced: true },
  { key: "dept",     label: "Department",    type: "multi", get: (r) => r.dept,         advanced: true },
  { key: "city",     label: "City",          type: "multi", get: (r) => r.city,         advanced: true },
  { key: "value",    label: "Value",         type: "money", get: (r) => (r.value || r.value === 0 ? r.value : null), advanced: true },
  { key: "start",    label: "Execution date",type: "datePast", get: (r) => r.start,     advanced: true },
  { key: "docs",     label: "Documents",     type: "count", get: docCount,              advanced: true },
  { key: "quality",  label: "Record completeness", type: "multi", get: (r) => qualityLabel(r.dataQuality), advanced: true },
];
export const contractSearchKeys = ["title", "counterparty", "id", "contractType", "entityName", "physicalRecord"];
export const contractViews = [
  { id: "active",   label: "Active",             filters: { status: "Active" } },
  { id: "expiring", label: "Expiring ≤ 30 days", filters: { expiry: "d30" } },
  { id: "expired",  label: "Expired",            filters: { expiry: "expired" } },
  { id: "highrisk", label: "High / critical risk", filters: { risk: ["high", "critical"] } },
  { id: "highval",  label: "PKR 100M+",          filters: { value: "gt100m" } },
  { id: "nodocs",   label: "No linked documents", filters: { docs: "none" } },
];
export const contractColumns = (f, { onDocs, CategoryPill }) => [
  { key: "sr", label: "Sr", width: "48px", mono: true, essential: true, plain: (r, i) => "",
    render: (r, i) => html`<span class="tiny muted">${i + 1}</span>` },
  { key: "id", label: "ID", mono: true, width: "86px", essential: true, sortValue: true, plain: (r) => r.id },
  { key: "title", label: "Contract", essential: true, sortValue: true, plain: (r) => r.title,
    render: (r) => html`<div class="cell-strong">${r.title}</div>
      <div class="tiny muted">${[r.counterparty, r.contractType].filter(Boolean).join(" · ")}</div>` },
  { key: "entityName", label: "Entity", width: "116px", sortValue: true, plain: (r) => r.entityName,
    render: (r) => html`<${DrillCell} f=${f} fkey="entity" value=${r.entityName} title="Filter by entity"><span class="tiny strong">${r.entityName || "—"}</span></${DrillCell}>` },
  { key: "category", label: "Category", sortValue: true, plain: (r) => r.category,
    render: (r) => html`<${DrillCell} f=${f} fkey="category" value=${r.category} title="Filter by category">
      ${CategoryPill ? html`<${CategoryPill} item=${r} />` : html`<${Pill} tone="gray">${r.category}</${Pill}>`}</${DrillCell}>` },
  { key: "docs", label: "Docs", width: "74px", align: "center", sortAs: "number", sortValue: true, plain: docCount,
    render: (r) => {
      const n = docCount(r);
      if (n) return html`<button type="button" class="drillcell" title=${`Open ${n} linked document${n > 1 ? "s" : ""}`}
        onClick=${(e) => { e.stopPropagation(); onDocs(r); }}><${Pill} tone="green"><${Icon} name="file" size=11 />${n}</${Pill}></button>`;
      const named = (r.docFiles || []).length;
      // Gray means the tracker NAMES documents that are not in the Drive library
      // yet — a real gap in the record, not a zero.
      return named ? html`<${Pill} tone="gray" title="Named in the tracker, not in the Drive library yet">${named}</${Pill}>`
        : html`<span class="tiny muted">—</span>`;
    } },
  { key: "value", label: "Value", align: "right", sortAs: "number", sortValue: true, plain: (r) => r.value || "",
    render: (r) => html`<span class="strong">${money(r.value, r.currency)}</span>` },
  { key: "risk", label: "Risk", sortValue: true, plain: (r) => r.risk,
    render: (r) => html`<${DrillCell} f=${f} fkey="risk" value=${r.risk} title="Filter by risk"><${Risk} level=${r.risk} /></${DrillCell}>` },
  { key: "status", label: "Status", sortValue: true, plain: (r) => r.status,
    render: (r) => html`<${DrillCell} f=${f} fkey="status" value=${r.status} title="Filter by status"><${Status} value=${r.status} /></${DrillCell}>` },
  { key: "expiry", label: "Expiry", sortAs: "date", sortValue: true, plain: (r) => plainDate(r.expiry),
    render: (r) => html`<${ContractExpiryCell} row=${r} />` },
];
function ContractExpiryCell({ row }) {
  if (!row.expiry) return html`<span class="tiny muted">—</span>`;
  const days = Math.round((new Date(row.expiry) - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return html`<span class="tiny muted" title=${fmt.date(row.expiry)}>Expired · ${fmt.dateShort(row.expiry)}</span>`;
  return html`<span class=${cx("tiny strong", days < 30 && "risk--high")}>
    ${days < 30 ? html`<${Icon} name="clock" size=11 /> ` : ""}${fmt.date(row.expiry)}</span>`;
}

/* ========================================================== LEGAL REQUESTS */
// Fields on a request: requestDate/created, title, requestType, contractType,
// counterparty, requesterId, department, category, entityId, value, dueDate,
// status, stage, priority, risk, owner, bu, and the computed __tat.
//
// SLA here is the computed TAT status (On Track / Due Today / Delayed), not a
// stored column — which is why it is derived rather than read.
export const requestFields = ({ nameOf, entityName }) => [
  { key: "status",   label: "Status",       type: "multi", get: (r) => r.status },
  { key: "rtype",    label: "Request type", type: "multi", get: (r) => r.requestType },
  { key: "sla",      label: "SLA",          type: "multi", get: (r) => (r.__tat && r.__tat.status) || "—" },
  { key: "priority", label: "Priority",     type: "multi", get: (r) => r.priority },
  { key: "dept",     label: "Department",   type: "multi", get: (r) => r.department || r.dept },
  { key: "due",      label: "Required by",  type: "date",  get: (r) => r.dueDate || r.due },
  // --- More filters ---
  { key: "owner",    label: "Assigned to",  type: "multi", get: (r) => (r.owner ? nameOf(r.owner) : ""), advanced: true },
  { key: "requester",label: "Requester",    type: "multi", get: (r) => nameOf(r.requesterId || r.requester), advanced: true },
  { key: "entity",   label: "Entity",       type: "multi", get: (r) => entityName(r.entityId),      advanced: true },
  { key: "category", label: "Category",     type: "multi", get: (r) => r.category,                  advanced: true },
  { key: "risk",     label: "Risk",         type: "multi", get: (r) => r.risk,                      advanced: true },
  { key: "stage",    label: "Stage",        type: "multi", get: (r) => r.stage,                     advanced: true },
  { key: "value",    label: "Contract value", type: "money", get: (r) => (r.value || r.value === 0 ? r.value : null), advanced: true },
  { key: "raised",   label: "Submitted",    type: "datePast", get: (r) => r.requestDate || r.created, advanced: true },
];
export const requestSearchKeys = ["title", "counterparty", "id", "requestType", "contractType", "matterId"];
export const requestViews = [
  { id: "untriaged", label: "To be assigned", filters: { status: ["New", "Triage"] } },
  { id: "delayed",   label: "SLA breached",    filters: { sla: "Delayed" } },
  { id: "duetoday",  label: "Due today",       filters: { sla: "Due Today" } },
  { id: "overdue",   label: "Past required-by date", filters: { due: "overdue" } },
  { id: "week",      label: "Required this week",    filters: { due: "d7" } },
];

/* ============================================ REGISTERS MIGRATED OFF FilterBar */
// These seven surfaces ran on the older `FilterBar` (single-select dropdowns,
// state kept in localStorage, nothing in the URL). They now use the same engine
// and the same controls as every other register. Fields below come from each
// page's ACTUAL dataset — a tracker row is a contract, a repository row is a
// scanned document, a workspace row is a request — so none of them inherits
// filters that mean nothing on that surface.

/* ------------------------------------------- Commercial Contract Tracker (trk) */
// Rows are contracts in the Commercial category that appear in the PPA sheet.
export const trackerFields = [
  { key: "status",   label: "Contract status", type: "multi", get: (r) => r.status },
  { key: "ctype",    label: "Agreement type",  type: "multi", get: (r) => r.contractType },
  { key: "entity",   label: "Company",         type: "multi", get: (r) => r.entityName },
  { key: "expiry",   label: "End date",        type: "bucket", options: CONTRACT_EXPIRY, custom: contractExpiryMatch },
  { key: "docs",     label: "Documents",       type: "count", get: docCount },
  // --- More filters ---
  { key: "party",    label: "Counter party",   type: "multi", get: (r) => r.counterparty, advanced: true },
  { key: "dept",     label: "Department",      type: "multi", get: (r) => r.dept,         advanced: true },
  { key: "region",   label: "Region",          type: "multi", get: (r) => r.region,       advanced: true },
  { key: "city",     label: "City",            type: "multi", get: (r) => r.city,         advanced: true },
  { key: "risk",     label: "Risk",            type: "multi", get: (r) => r.risk,         advanced: true },
  { key: "value",    label: "Contract value",  type: "money", get: (r) => (r.value || r.value === 0 ? r.value : null), advanced: true },
  { key: "start",    label: "Start date",      type: "datePast", get: (r) => r.start,     advanced: true },
];
export const trackerSearchKeys = ["title", "counterparty", "id", "contractType", "landRef", "physicalRecord", "entityName"];
export const trackerViews = [
  { id: "active",   label: "Active",              filters: { status: "Active" } },
  { id: "expiring", label: "Ending ≤ 30 days",    filters: { expiry: "d30" } },
  { id: "expired",  label: "Ended",               filters: { expiry: "expired" } },
  { id: "nodocs",   label: "No linked documents", filters: { docs: "none" } },
];

/* -------------------------------------------------- Document Repository (repo) */
// Rows are scanned/ingested documents, not contracts.
export const repoFields = [
  { key: "source",   label: "Source",        type: "multi", get: (r) => r.source },
  { key: "kind",     label: "Document kind", type: "multi", get: (r) => r.kind },
  { key: "entity",   label: "Entity",        type: "multi", get: (r) => r.entityName || r.entityId },
  { key: "ctype",    label: "Contract type", type: "multi", get: (r) => r.contractType },
  { key: "mapped",   label: "Tracker row",   type: "multi",
    get: (r) => (r.contractId ? "Linked to a tracker row" : "Standalone") },
  // --- More filters ---
  { key: "ocr",      label: "OCR confidence", type: "bucket", advanced: true,
    options: [
      { value: "high", label: "90%+" },
      { value: "mid",  label: "85–89%" },
      { value: "low",  label: "Below 85%" },
    ],
    custom: (r, v) => { const c = Math.round((r.ocrConfidence == null ? 1 : r.ocrConfidence) * 100);
      return v === "high" ? c >= 90 : v === "mid" ? (c >= 85 && c < 90) : c < 85; } },
  { key: "physical", label: "Physical record", type: "multi", advanced: true,
    get: (r) => (r.physicalRecordRef ? "Mapped" : "Not mapped") },
  { key: "office",   label: "Office location", type: "multi", get: (r) => r.officeLocation, advanced: true },
  { key: "uploader", label: "Uploaded by",     type: "multi", get: (r) => r.uploadedByName, advanced: true },
  { key: "drive",    label: "Drive link",      type: "multi", advanced: true,
    get: (r) => (r.driveLink ? "Has a Drive link" : "No Drive link") },
];
export const repoSearchKeys = ["name", "id", "kind", "contractType", "physicalRecordRef", "officeLocation"];
export const repoViews = [
  { id: "unmapped", label: "Not mapped to a physical record", filters: { physical: "Not mapped" } },
  { id: "standalone", label: "Standalone (no tracker row)",   filters: { mapped: "Standalone" } },
  { id: "lowocr",   label: "OCR below 85%",                   filters: { ocr: "low" } },
];

/* --------------------------------------------- Licences & Registrations (lcn) */
// The seeded/derived licence view. Validity is computed from expiry and the
// record's own renewal lead time, so it is a rule, not a stored column.
export const LICENCE_VALIDITY = [
  { value: "Valid",    label: "Valid" },
  { value: "Expiring", label: "Expiring soon" },
  { value: "Critical", label: "Critical (≤ 30 days)" },
  { value: "Expired",  label: "Expired" },
];
export const licenceSeedFields = (licenseStatus) => [
  { key: "validity",  label: "Validity",   type: "bucket", options: LICENCE_VALIDITY,
    custom: (r, v) => licenseStatus(r).key === v },
  { key: "type",      label: "Type",       type: "multi", get: (r) => r.type },
  { key: "entity",    label: "Entity",     type: "multi", get: (r) => r.entity },
  { key: "authority", label: "Authority",  type: "multi", get: (r) => r.authority },
  { key: "region",    label: "Region",     type: "multi", get: (r) => r.jurisdiction },
  // --- More filters ---
  { key: "owner",     label: "Owner",      type: "multi", get: (r) => r.ownerName, advanced: true },
  { key: "expiry",    label: "Expiry",     type: "date",  get: (r) => r.expiryDate, advanced: true },
  { key: "issued",    label: "Issue date", type: "datePast", get: (r) => r.issueDate, advanced: true },
];
export const licenceSeedSearchKeys = ["name", "authority", "entity", "licenseNumber", "type", "id", "notes"];
export const licenceSeedViews = [
  { id: "expired",  label: "Expired",              filters: { validity: "Expired" } },
  { id: "critical", label: "Critical (≤ 30 days)", filters: { validity: "Critical" } },
  { id: "expiring", label: "Expiring soon",        filters: { validity: "Expiring" } },
  { id: "valid",    label: "Valid",                filters: { validity: "Valid" } },
];

/* -------------------------------------------------- PPA / Land Analyzer (anz) */
// Rows are PPA agreements: the analysis is about value and land references.
export const analyzerFields = [
  { key: "status",  label: "Status",       type: "multi", get: (r) => r.status },
  { key: "entity",  label: "Entity",       type: "multi", get: (r) => r.entityName },
  { key: "jur",     label: "Jurisdiction", type: "multi", get: (r) => r.jur },
  { key: "ctype",   label: "Agreement type", type: "multi", get: (r) => r.contractType },
  { key: "expiry",  label: "Completion",   type: "bucket", options: CONTRACT_EXPIRY, custom: contractExpiryMatch },
  // --- More filters ---
  { key: "party",   label: "Counterparty", type: "multi", get: (r) => r.counterparty, advanced: true },
  { key: "ppa",     label: "PPA value",    type: "money", get: (r) => (r.ppaValue || r.ppaValue === 0 ? r.ppaValue : null), advanced: true },
  { key: "land",    label: "Land value",   type: "money", get: (r) => (r.landValue || r.landValue === 0 ? r.landValue : null), advanced: true },
  { key: "parcel",  label: "Parcel ref",   type: "multi", advanced: true,
    get: (r) => (r.landRef ? "Has a parcel reference" : "No parcel reference") },
  { key: "risk",    label: "Risk",         type: "multi", get: (r) => r.risk, advanced: true },
];
export const analyzerSearchKeys = ["title", "counterparty", "id", "contractType", "landRef", "entityName"];
export const analyzerViews = [
  { id: "noparcel", label: "No parcel reference", filters: { parcel: "No parcel reference" } },
  { id: "bigppa",   label: "PKR 100M+ PPA value", filters: { ppa: "gt100m" } },
  { id: "ending",   label: "Completion ≤ 90 days", filters: { expiry: "d90" } },
];

/* ------------------------------------------------- Legal Workspace (wsp) ---- */
// The workspace shows several LENSES over different datasets — the unified
// worklist, the contract book, the compliance areas, the request log. Each lens
// gets the fields its own records actually have, rather than one shared set that
// is half-meaningless on every lens.
export const workspaceFields = (lens, { nameOf, entityName }) => {
  const tat = { key: "tat", label: "SLA", type: "multi", get: (r) => (r.__tat && r.__tat.status) || "" };
  const owner = { key: "owner", label: "Owner", type: "multi", get: (r) => (r.owner ? nameOf(r.owner) : "") };
  if (lens === "compliance") {
    return [
      { key: "status", label: "Status", type: "multi", get: (r) => r.status },
      { key: "area",   label: "Area",   type: "multi", get: (r) => r.area },
      { key: "region", label: "Region", type: "multi", get: (r) => r.region },
      owner,
    ];
  }
  if (lens === "contracts" || lens === "browse") {
    return [
      { key: "status", label: "Status",        type: "multi", get: (r) => r.status },
      { key: "ctype",  label: "Contract type", type: "multi", get: (r) => r.contractType },
      { key: "entity", label: "Entity",        type: "multi", get: (r) => entityName(r.entityId) || r.entityName },
      { key: "risk",   label: "Risk",          type: "multi", get: (r) => r.risk },
      { key: "expiry", label: "Expiry",        type: "bucket", options: CONTRACT_EXPIRY, custom: contractExpiryMatch },
      owner,
      { key: "dept",   label: "Department",    type: "multi", get: (r) => r.dept || r.department, advanced: true },
      { key: "value",  label: "Value",         type: "money", get: (r) => (r.value || r.value === 0 ? r.value : null), advanced: true },
      { key: "docs",   label: "Documents",     type: "count", get: docCount, advanced: true },
    ];
  }
  /* THE TASK WORKSPACE FILTERS (§82).
     The department does not only ask "what is delayed" — it asks what is
     delayed FOR REAL ESTATE, in the NORTH, on THIS PROJECT, on the COMPLIANCE
     desk. Those are the business's own axes and they were only available on
     Project Wise, which meant the worklist could not answer a question the
     worklist is for. Every one of these reads a field the record already
     carries; nothing here is a filter over a value nobody fills in. */
  const clean = (v) => { const x = String(v == null ? "" : v).trim(); return x && x !== "—" ? x : null; };
  return [
    { key: "status",  label: "Status",       type: "multi", get: (r) => r.status },
    { key: "stage",   label: "Stage",        type: "multi", get: (r) => r.stage },
    tat,
    owner,
    { key: "category", label: "Matter category", type: "multi", get: (r) => r.category },
    { key: "due",     label: "Due",          type: "date",  get: (r) => r.dueDate || r.due },
    { key: "module",  label: "Legal module", type: "multi", get: (r) => clean(r.subdivision) || clean(r.legalTeam) },
    { key: "line",    label: "Business line", type: "multi", get: (r) => clean(r.bu), advanced: true },
    { key: "vertical", label: "Business vertical", type: "multi", get: (r) => clean(r.unit) || clean(r.natureOfMatter), advanced: true },
    { key: "region",  label: "Region",       type: "multi", get: (r) => clean(r.region) || clean(r.city) || clean(r.country), advanced: true },
    { key: "project", label: "Project",      type: "multi", get: (r) => clean(r.project), advanced: true },
    { key: "rtype",   label: "Request type", type: "multi", get: (r) => r.requestType, advanced: true },
    { key: "entity",  label: "Entity",       type: "multi", get: (r) => entityName(r.entityId), advanced: true },
    { key: "dept",    label: "Requesting department", type: "multi", get: (r) => r.department || r.dept, advanced: true },
    { key: "risk",    label: "Risk",         type: "multi", get: (r) => r.risk, advanced: true },
    { key: "priority", label: "Priority",    type: "multi", get: (r) => r.priority, advanced: true },
    { key: "raised",  label: "Raised",       type: "datePast", get: (r) => r.requestDate || r.created, advanced: true },
  ];
};
export const workspaceSearchKeys = (lens) => lens === "compliance"
  ? ["area", "region", "id"]
  : (lens === "contracts" || lens === "browse")
    ? ["title", "counterparty", "id", "contractType", "landRef", "physicalRecord"]
    : ["title", "counterparty", "id", "requestType", "contractType", "natureOfMatter"];
/* THE NAMED VIEWS A TEAM ACTUALLY WORKS FROM (§82/§94).
   Three of these existed; "Due this week" is the horizon a lawyer plans a week
   around and there was no way to ask for it. A view is a named filter state —
   nothing here is a second filtering model, and a view whose filter matches
   everything is not added, because a button that does nothing is worse than no
   button. */
export const workspaceViews = (lens) => (lens === "worklist" || lens === "log")
  ? [
      { id: "delayed",   label: "Delayed",           filters: { tat: "Delayed" } },
      { id: "today",     label: "Due today",         filters: { tat: "Due Today" } },
      { id: "thisweek",  label: "Due this week",     filters: { due: "thisweek" } },
      { id: "overdue",   label: "Past due date",     filters: { due: "overdue" } },
    ]
  : (lens === "contracts" || lens === "browse")
    ? [
        { id: "active",   label: "Active",           filters: { status: "Active" } },
        { id: "expiring", label: "Expiring ≤30 days", filters: { expiry: "d30" } },
        { id: "nodocs",   label: "No documents",     filters: { docs: "none" } },
      ]
    : [];

/* ------------------------------------------------------- Pipelines (pipe) --- */
// Rows are the open work items behind the team-load view: filtering them changes
// every number on the page, which is the point.
export const pipelineFields = ({ nameOf, entityName }) => [
  { key: "status",  label: "Status",   type: "multi", get: (r) => r.status },
  { key: "stage",   label: "Stage",    type: "multi", get: (r) => r.stage },
  { key: "tat",     label: "SLA",      type: "multi", get: (r) => (r.__tat && r.__tat.status) || "" },
  { key: "owner",   label: "Owner",    type: "multi", get: (r) => (r.owner ? nameOf(r.owner) : "") },
  { key: "category", label: "Category", type: "multi", get: (r) => r.category },
  { key: "entity",  label: "Entity",   type: "multi", get: (r) => entityName(r.entityId), advanced: true },
  { key: "risk",    label: "Risk",     type: "multi", get: (r) => r.risk,    advanced: true },
  { key: "priority", label: "Priority", type: "multi", get: (r) => r.priority, advanced: true },
  { key: "due",     label: "Due",      type: "date",  get: (r) => r.dueDate || r.due, advanced: true },
];
export const pipelineSearchKeys = ["title", "id", "counterparty", "requestType", "contractType"];
export const pipelineViews = [
  { id: "delayed", label: "SLA breached", filters: { tat: "Delayed" } },
  { id: "today",   label: "Due today",    filters: { tat: "Due Today" } },
];

/* --------------------------------------------------------- Reports (rpt) ---- */
// An analytics surface over the contract book: the filters decide what every
// chart on the page is computed from.
export const reportFields = ({ entityName }) => [
  { key: "entity",  label: "Entity",        type: "multi", get: (r) => entityName(r.entityId) || r.entityName },
  { key: "ctype",   label: "Contract type", type: "multi", get: (r) => r.contractType },
  { key: "status",  label: "Status",        type: "multi", get: (r) => r.status },
  { key: "risk",    label: "Risk",          type: "multi", get: (r) => r.risk },
  { key: "city",    label: "City",          type: "multi", get: (r) => r.city },
  { key: "expiry",  label: "Expiry",        type: "bucket", options: CONTRACT_EXPIRY, custom: contractExpiryMatch, advanced: true },
  { key: "start",   label: "Start",         type: "datePast", get: (r) => r.start, advanced: true },
  { key: "value",   label: "Value",         type: "money", get: (r) => (r.value || r.value === 0 ? r.value : null), advanced: true },
];
export const reportSearchKeys = ["title", "counterparty", "id", "contractType", "entityName"];
