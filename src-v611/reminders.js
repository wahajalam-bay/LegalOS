// WORKSTREAM G — company contract-lifecycle reminders.
//
// Auto-reminders for renewals, expiries and notice windows, plus the obligations
// extracted at execution. Deduped by record + milestone so reloading never
// stacks duplicates (same contract as the license alerts in layout.js).
//
// Pure logic: feeds the notifications panel, the dashboard card and the
// per-individual pipelines from one source.
import { fmt } from "./core.js";
import { REMINDER_MILESTONES, entityName, nameOf } from "./data.js";

const days = (d, now) => Math.round((new Date(d) - now) / 86400000);

// One reminder per (record, milestone). The most urgent milestone wins so the
// same contract never shouts four times.
export function contractReminders(contracts = [], now = new Date()) {
  const out = [];
  contracts.forEach((c) => {
    if (!c.expiry) return;
    if (/Terminated|Archived/.test(c.status || "")) return;
    const toExpiry = days(c.expiry, now);
    const notice = c.renewalNoticeDays || 0;
    const toNotice = toExpiry - notice;

    // Notice window is the sharpest signal — it closes before expiry does.
    if (notice > 0 && toNotice <= 14) {
      out.push({
        id: `rem-${c.id}-notice-window`,
        kind: "notice",
        recordId: c.id,
        entityId: c.entityId,
        title: toNotice <= 0
          ? `${c.title} — notice window CLOSED ${Math.abs(toNotice)}d ago`
          : `${c.title} — notice window closes in ${toNotice}d`,
        detail: `${notice}-day notice · ${c.autoRenew ? "auto-renews" : "expires"} ${new Date(c.expiry).toDateString()}`,
        tone: toNotice <= 0 ? "red" : toNotice <= 7 ? "red" : "amber",
        icon: toNotice <= 0 ? "alertTriangle" : "clock",
        owner: c.owner,
        dueDays: toNotice,
        path: "/contracts/" + c.id,
        autoRenew: !!c.autoRenew,
      });
      return;
    }

    // Otherwise the tightest expiry milestone that has been reached.
    const hit = REMINDER_MILESTONES
      .filter((m) => m.basis === "expiry" && toExpiry >= 0 && toExpiry <= m.offsetDays)
      .sort((a, b) => a.offsetDays - b.offsetDays)[0];
    if (hit) {
      out.push({
        id: `rem-${c.id}-${hit.key}`,
        kind: "expiry",
        recordId: c.id,
        entityId: c.entityId,
        title: `${c.title} — ${hit.label.toLowerCase()}`,
        detail: `${entityName(c.entityId)} · ${c.contractType}${c.autoRenew ? " · auto-renews" : ""}`,
        tone: hit.tone,
        icon: hit.icon,
        owner: c.owner,
        dueDays: toExpiry,
        path: "/contracts/" + c.id,
        autoRenew: !!c.autoRenew,
      });
      return;
    }

    // Already lapsed and still on the books.
    if (toExpiry < 0 && /Active|Expiring|Renewal/.test(c.status || "")) {
      out.push({
        id: `rem-${c.id}-lapsed`,
        kind: "lapsed",
        recordId: c.id,
        entityId: c.entityId,
        title: `${c.title} — expired${Math.abs(toExpiry) <= 90 ? " " + Math.abs(toExpiry) + "d ago" : " on " + fmt.date(c.expiry)} but still marked ${c.status}`,
        detail: `${entityName(c.entityId)} · ${c.contractType}`,
        tone: "red",
        icon: "alertTriangle",
        owner: c.owner,
        dueDays: toExpiry,
        path: "/contracts/" + c.id,
      });
    }
  });
  return out;
}

// Obligations extracted at execution that are due or overdue.
export function obligationReminders(contracts = [], now = new Date()) {
  const out = [];
  contracts.forEach((c) => {
    const obs = (c.extractedFields && c.extractedFields.obligations) || [];
    obs.forEach((o) => {
      const d = days(o.due, now);
      if (d > 30) return;
      out.push({
        id: `rem-${o.id}`,
        kind: "obligation",
        recordId: c.id,
        entityId: c.entityId,
        title: `${o.text} — ${c.title}`,
        detail: `${o.basis} · ${d < 0 ? Math.abs(d) + "d overdue" : "due in " + d + "d"}`,
        tone: d < 0 ? "red" : d <= 7 ? "amber" : "blue",
        icon: d < 0 ? "alertTriangle" : "checksquare",
        owner: o.owner,
        dueDays: d,
        path: "/contracts/" + c.id,
      });
    });
  });
  return out;
}

// Everything, most urgent first, deduped by id.
export function allReminders(contracts = [], now = new Date()) {
  const all = [...contractReminders(contracts, now), ...obligationReminders(contracts, now)];
  const seen = new Set();
  return all
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => a.dueDays - b.dueDays);
}

export const remindersForOwner = (contracts, ownerId, now = new Date()) =>
  allReminders(contracts, now).filter((r) => r.owner === ownerId);
