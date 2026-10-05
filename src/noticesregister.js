// THE LEGAL NOTICES REGISTER.
//
// Lives here rather than inside the litigation workspace because notices are
// their own module at /m/notices -- a notice has an issuer, a direction and a
// reply deadline, and no forum, cause number or hearing. Keeping the register
// in one place means the module page gets the real thing: filters, views,
// columns, export and KPI cards that drill, rather than a search box.
//
// THE PRIMARY CUT IS DIRECTION. A notice the company sent and a notice served
// ON the company are different work with different urgency, and the register
// opened on all 255 of them mixed together. Received / Sent / All sits above
// everything else, in the URL, so the two halves are separate addresses.
import { html, useMemo } from "./core.js";
import { Icon } from "./icons.js";
import { navigate, useQuery } from "./router.js";
import { RegisterShell } from "./register.js";
import { StatStrip } from "./parts.js";
import { useFilterLink } from "./filters.js";
import { noticeFields, noticeColumns, noticeViews, noticeSearchKeys } from "./registerdefs.js";

// "Resolved" is not a field in the notices tracker — it is a reading of the
// status text the tracker does carry. Deriving the set of resolved statuses from
// the data (rather than hardcoding a vocabulary) means the summary figures and
// the filter always describe the same rows.
const RESOLVED_RE = /resolv|closed|complete|replied|withdraw/i;

const CUTS = [
  { id: "all", label: "All" },
  { id: "Received", label: "Received" },
  { id: "Sent", label: "Sent" },
];

export function NoticesRegister({ live, rows }) {
  // Every hook runs before any early return. React counts hooks per render, so
  // a `useMemo` behind a loading guard changes the hook order the moment the
  // data arrives, and the register dies with "rendered more hooks than during
  // the previous render" the first time it is opened on a warm cache.
  const drill = useFilterLink("notices");
  const [q, patchQ] = useQuery();
  const statuses = useMemo(() => [...new Set(rows.map((n) => (n.status || "—").trim()))], [rows]);

  if (live.loading && !rows.length) return html`<div class="tiny muted" style="padding:20px 2px">Reading the notices register from Drive…</div>`;

  const cut = CUTS.some((c) => c.id === q.dir) ? q.dir : "all";
  const shown = cut === "all" ? rows : rows.filter((n) => n.direction === cut);

  const counts = {
    all: rows.length,
    Received: rows.filter((n) => n.direction === "Received").length,
    Sent: rows.filter((n) => n.direction === "Sent").length,
  };
  const unknown = rows.filter((n) => n.direction === "Not recorded").length;
  const derived = rows.filter((n) => n.directionBasis).length;

  const resolvedStatuses   = statuses.filter((s) => RESOLVED_RE.test(s));
  const unresolvedStatuses = statuses.filter((s) => !RESOLVED_RE.test(s));
  const resolved   = shown.filter((n) => RESOLVED_RE.test(n.status || "")).length;
  const unresolved = shown.length - resolved;
  const awaitingReply = shown.filter((n) => !n.replyDate).length;
  /* THE BIFURCATION, AS FIGURES. Counted on the rows on screen, so the cards
     and the cut can never disagree. */
  const received = shown.filter((n) => n.direction === "Received").length;
  const sent = shown.filter((n) => n.direction === "Sent").length;
  /* "No reply recorded" on its own counts notices that never asked for one,
     which is not a gap. What a lawyer needs is the notices that DO require a
     response and have none on file. */
  const replyOwed = shown.filter((n) => !n.replyDate
    && /^(y|yes|true|required)/i.test(String(n.responseRequired || ""))).length;

  // Quick views built from the register's own status vocabulary.
  const views = [
    { id: "unresolved", label: "Not resolved", filters: { status: unresolvedStatuses } },
    { id: "resolved",   label: "Resolved",     filters: { status: resolvedStatuses } },
    { id: "awaiting",   label: "Response required, not replied",
      filters: { response: "Yes", replied: "No reply recorded" } },
    ...noticeViews.filter((v) => v.id !== "unresolved"),
  ];

  const summary = html`<div>
    ${/* THE BIFURCATION, ABOVE EVERYTHING. It is a set of real buttons with a
          pressed state rather than a filter buried in a dropdown, because it
          is the first decision a reader makes on this page. */ ""}
    <div class="row wrap" style="gap:8px;align-items:center;margin-bottom:12px">
      <div class="calnav" role="group" aria-label="Notice direction">
        ${CUTS.map((c) => html`<button key=${c.id} type="button"
          class=${"calnav__b calnav__b--wide" + (cut === c.id ? " calnav__b--on" : "")}
          aria-pressed=${cut === c.id ? "true" : "false"}
          onClick=${() => patchQ({ dir: c.id === "all" ? null : c.id })}>
          ${c.label} <span class="callegend__n" style="margin-left:6px">${counts[c.id]}</span></button>`)}
      </div>
      ${unknown > 0 && html`<button type="button" class="fltbtn"
        title="These notices name neither party as a group company, so no direction could be read from them"
        onClick=${() => { patchQ({ dir: null }); drill.set("direction", ["Not recorded"]); }}>
        ${unknown} with no direction recorded</button>`}
    </div>

    ${/* PROPER KPI CARDS, THE SAME ONES THE REST OF THE PRODUCT USES.
          This was a flat strip of four figures in a thin box — visually a
          caption, not a reading, and nothing about it said the numbers were
          clickable. They are the same cards as every other module now, they
          carry the tone that matches what they report (red where a reply is
          owed, green where the notice is closed out), and each one drills the
          register to exactly the rows it counted. Every figure is computed from
          the rows ON SCREEN, so switching to Received or Sent moves all of
          them together rather than leaving a total that contradicts the cut. */ ""}
    <${StatStrip} stats=${[
      { value: shown.length.toLocaleString(),
        label: cut === "all" ? "Notices" : cut + " notices", tone: "blue" },
      { value: received.toLocaleString(), label: "Received", tone: "purple",
        title: "Notices served ON a group company", active: cut === "Received",
        onClick: () => patchQ({ dir: cut === "Received" ? null : "Received" }) },
      { value: sent.toLocaleString(), label: "Sent", tone: "blue",
        title: "Notices issued BY a group company", active: cut === "Sent",
        onClick: () => patchQ({ dir: cut === "Sent" ? null : "Sent" }) },
      { value: unresolved.toLocaleString(), label: "Not recorded as resolved", tone: "amber",
        title: "The status on the record is not one that closes it out",
        onClick: () => drill.set("status", unresolvedStatuses) },
      { value: resolved.toLocaleString(), label: "Resolved", tone: "green",
        onClick: () => drill.set("status", resolvedStatuses) },
      { value: awaitingReply.toLocaleString(), label: "No reply recorded", tone: "red",
        /* THE BASIS, ON THE CARD. The trackers carry no "response required"
           column — only notices recorded in LegalOS state it — so a card
           headed "reply required, none recorded" read 0 of 255 and looked like
           a bug. This counts what the source can actually answer: no reply
           date on the record. Where the response IS stated, the count says so. */
        title: replyOwed > 0
          ? `${replyOwed} of these state that a response is required. The rest carry no reply date and the source does not say whether one was due.`
          : "No reply date is on the record. The trackers carry no response-required column, so this does not distinguish a missing reply from a notice that never needed one.",
        onClick: () => drill.set("replied", ["No reply recorded"]) },
    ]} />

    ${derived > 0 && html`<div class="tiny muted" style="margin:8px 0 2px">
      The trackers record a sender and a recipient but no direction. ${derived} of these were read off the
      parties by matching them against the group's own companies; a notice recorded in LegalOS states its
      direction outright. Hover a Direction badge to see which.</div>`}
  </div>`;

  return html`<${RegisterShell}
    tabId="notices" ns="notices" rows=${shown}
    fields=${noticeFields}
    columns=${(f) => noticeColumns(f, { onDocs: (r) => navigate("/rec/notice/" + encodeURIComponent(r.id)) })}
    views=${views}
    searchKeys=${noticeSearchKeys}
    searchPlaceholder="Search notices, parties, subjects…"
    noun=${["notice", "notices"]}
    onRow=${(r) => navigate("/rec/notice/" + encodeURIComponent(r.id))}
    exportName="legal-notices"
    emptyIcon="mail"
    ${/* Newly recorded notices first, then the tracker's by date. See
          `landing` in the notices adapter. */ ""}
    defaultSort=${{ key: "landing", dir: "asc" }}
    summary=${summary} />`;
}
