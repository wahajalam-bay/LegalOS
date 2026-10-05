/* LITIGATION REMINDERS.
 *
 * Three things a litigation team forgets, and what this raises for each:
 *
 *   A HEARING THAT IS COMING     15 days out, and again 2 days out.
 *   A HEARING THAT HAS PASSED    with no outcome recorded. Persistent: it
 *                                keeps being raised until somebody writes down
 *                                what happened, because a hearing nobody
 *                                minuted is a case that has gone quiet.
 *   A WITNESS LIST               due 7 days after issues are framed. Two
 *                                reminders before the deadline, and they stop
 *                                the moment the list is filed.
 *
 * DERIVED, NOT SCHEDULED. There is no cron and no reminder table: the state of
 * the case decides what is due, every time this is asked. A reminder queue that
 * is written once and then diverges from the cases is worse than none, because
 * it is trusted. Move a hearing and the reminders move with it; record an
 * outcome and the chase stops on the next read.
 *
 * IDEMPOTENT. Every notification carries a deterministic id built from the
 * case, the kind and the date it is about, so raising the same reminder twice
 * writes one record. That is what lets this run on every request without
 * anybody's bell filling up with duplicates.
 *
 * NO EMAIL IS CLAIMED. Section AA of the brief asks for Gmail as well as in-app.
 * No Gmail connector is configured on this deployment, so `channels` reports
 * email as unavailable and nothing pretends to have sent one.
 */
const notifications = require("./notifications");
const divisions = require("./divisions");

const DAY = 86400000;
const str = (v) => String(v == null ? "" : v).trim();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/* How far ahead each warning fires, and how it should read. */
const HEARING_LEAD_DAYS = [15, 2];
const WITNESS_LIST_DAYS = 7;          // after issues are framed
const WITNESS_LEAD_DAYS = [5, 2];
/* How far back a passed hearing is still worth chasing an outcome for. Beyond
   this it is a hole in the history, not a task. */
const OUTCOME_CHASE_DAYS = 60;
/* HOW LONG A HEARING CAN SIT UNMINUTED BEFORE IT STOPS BEING THE OWNER'S
   PROBLEM ALONE. Seven days is the department's rule: a week is long enough
   that "I have not written it up yet" has stopped being true and short enough
   that the person who was in court still remembers it. At that point the line
   manager is told as well -- told, not handed it: the owner keeps the task. */
const OUTCOME_ESCALATE_DAYS = 7;

/* Is email actually wired up? Reported, never assumed. */
function channels() {
  let gmail = null;
  try { gmail = (require("../config/compliance-rules.json").integrations || {}).gmail || null; } catch (e) { gmail = null; }
  return {
    inApp: { available: true },
    email: {
      available: !!(gmail && gmail.configured),
      detail: gmail && gmail.configured
        ? "Reminders are also sent by email."
        : "No Gmail connector is configured, so reminders are in-app only. Nothing is emailed.",
    },
  };
}

/* Who should be told. The case's owner if it has one, otherwise whoever leads
   litigation -- never "everybody", which is how a reminder becomes noise. */
function recipientsFor(c, opts) {
  const fallback = (opts && opts.fallbackUserId) || "u6";
  const ids = [];
  const push = (v) => { const s = str(v); if (s && !ids.includes(s)) ids.push(s); };
  push(c.ownerId || c.owner);
  push(c.assignedTo);
  if (!ids.length) push(fallback);
  return ids;
}

/* Every reminder this case is currently due, as plain facts. */
function forCase(c, today) {
  const out = [];
  const id = str(c.id);
  const name = str(c.caseName || c.title) || id;
  const next = str(c.nextHearing);

  if (isDate(next)) {
    const away = daysBetween(today, next);
    if (away >= 0) {
      for (const lead of HEARING_LEAD_DAYS) {
        /* Fires on the day it is due and stays due until the hearing, so a
           reminder is not missed because nobody opened the app that morning. */
        if (away <= lead) {
          out.push({
            kind: "hearing-due", caseId: id, date: next, leadDays: lead, daysAway: away,
            title: away === 0 ? "Hearing today — " + name
              : "Hearing in " + away + " day" + (away === 1 ? "" : "s") + " — " + name,
            body: [str(c.caseNo), str(c.court), str(c.entity)].filter(Boolean).join(" · "),
            tone: away <= 2 ? "red" : "amber",
          });
          break;                       // the nearer warning wins; never both
        }
      }
    } else {
      /* The date has gone by. Was it minuted? */
      const heard = (c.hearings || []).some((h) => str(h.date) === next && str(h.outcome));
      if (!heard) {
        /* CHASE WHAT IS STILL WORTH CHASING.
           194 of the imported rows carry a next-hearing date that passed years
           ago -- the tracker was kept by writing over the date, so the last one
           it holds is simply the last one somebody typed. Raising a reminder
           for each would put 194 bells on one person's screen on their first
           morning, and a notification list that long is one nobody reads.

           A hearing that passed inside the window is a real chase: it happened
           last week and nobody has minuted it. Anything older is a gap in the
           historical record, which is a different problem with a different
           fix, and it is reported as a backlog rather than as 194 alarms. */
        const stale = away < -OUTCOME_CHASE_DAYS;
        const overdueDays = Math.abs(away);
        out.push({
          kind: stale ? "outcome-missing-historic" : "outcome-due",
          caseId: id, date: next, daysAway: away,
          title: stale ? "No outcome on file — " + name : "Outcome pending — " + name,
          body: "The hearing on " + next + " has passed and no outcome is on the case."
            + (str(c.caseNo) ? " " + str(c.caseNo) : ""),
          tone: stale ? "gray" : "red",
          persistent: !stale,
          /* Only the live ones are raised as notifications. */
          notify: !stale,
        });
        /* AFTER A WEEK, THE LINE MANAGER IS TOLD TOO.
           A separate reminder rather than a re-addressed one: the owner still
           owns it, and the manager needs to know it has been sitting. Its id
           is keyed on the case and the hearing date, so it is raised once no
           matter how often this runs, and it stops the moment an outcome is
           recorded. */
        if (!stale && overdueDays >= OUTCOME_ESCALATE_DAYS) {
          out.push({
            kind: "outcome-escalated",
            caseId: id, date: next, daysAway: away,
            title: "Escalation — outcome still not recorded after " + overdueDays + " days: " + name,
            body: "The hearing on " + next + " has had no outcome recorded for " + overdueDays
              + " days. The owner has been reminded since it passed.",
            tone: "red",
            persistent: true,
            notify: true,
            escalation: true,
          });
        }
      }
    }
  }

  /* The witness list, counted from the day issues were framed. */
  const framed = str(c.issuesFramedDate || (c.dates && c.dates.issuesFramed));
  const filed = str(c.witnessListSubmittedDate || (c.dates && c.dates.witnessListSubmitted));
  if (isDate(framed) && !isDate(filed)) {
    const due = iso(new Date(Date.parse(framed + "T00:00:00Z") + WITNESS_LIST_DAYS * DAY));
    const away = daysBetween(today, due);
    for (const lead of WITNESS_LEAD_DAYS) {
      if (away <= lead) {
        out.push({
          kind: "witness-list-due", caseId: id, date: due, leadDays: lead, daysAway: away,
          title: away < 0 ? "Witness list overdue — " + name
            : "Witness list due in " + away + " day" + (away === 1 ? "" : "s") + " — " + name,
          body: "Issues were framed on " + framed + ", so the list is due " + due + ".",
          tone: away <= 0 ? "red" : "amber",
          persistent: away < 0,
        });
        break;
      }
    }
  }

  return out;
}

/* Everything due across the register. */
function due(cases, opts) {
  const today = (opts && opts.today) || iso(new Date(Date.now() + 5 * 60 * 60000));  // PKT
  const items = [];
  for (const c of (cases || [])) {
    const owners = recipientsFor(c, opts);
    for (const r of forCase(c, today)) {
      /* An escalation goes UP, to the line manager of whoever holds it — read
         from the configured division chart, not from a user id written into
         this file. Where the owner has no manager above them (the Director)
         there is nobody to escalate to and the item is dropped rather than
         mailed back to the person it is about. */
      let recipients = owners;
      if (r.escalation) {
        recipients = owners.map((o) => divisions.lineManagerFor(o)).filter(Boolean)
          .filter((m, i, a) => a.indexOf(m) === i && !owners.includes(m));
        if (!recipients.length) continue;
      }
      items.push({ ...r, recipients, caseName: str(c.caseName || c.title) });
    }
  }
  items.sort((a, b) => (a.daysAway - b.daysAway) || String(a.caseId).localeCompare(String(b.caseId)));
  return { today, channels: channels(), items,
    counts: {
      hearingDue: items.filter((x) => x.kind === "hearing-due").length,
      outcomeDue: items.filter((x) => x.kind === "outcome-due").length,
      outcomeEscalated: items.filter((x) => x.kind === "outcome-escalated").length,
      outcomeMissingHistoric: items.filter((x) => x.kind === "outcome-missing-historic").length,
      witnessListDue: items.filter((x) => x.kind === "witness-list-due").length,
      total: items.length,
    } };
}

/* Raise what is due as in-app notifications. Deterministic ids mean this can be
   called as often as you like; a reminder that is already on somebody's bell is
   not raised twice, and one whose cause has gone away is simply not raised
   again. */
function raise(cases, byEmail, opts) {
  const d = due(cases, opts);
  const payload = [];
  for (const it of d.items) {
    if (it.notify === false) continue;
    for (const uid of it.recipients) {
      payload.push({
        /* case + kind + the date it concerns. A reminder about a hearing that
           MOVES is a different reminder, which is correct: the old one stops
           being raised and the new date raises its own. */
        id: [uid, it.kind, it.caseId, it.date].join("|"),
        forUserId: uid, kind: it.kind, ref: it.caseId,
        title: it.title, body: it.body, tone: it.tone,
        icon: (it.kind === "outcome-due" || it.kind === "outcome-escalated") ? "alertTriangle" : "calendar",
        to: "/litigation/" + it.caseId,
      });
    }
  }
  if (!payload.length) return { raised: 0, ...d };
  const res = notifications.create({ notifications: payload.slice(0, 50) }, byEmail);
  return { raised: (res && res.notifications && res.notifications.length) || 0, ...d };
}

module.exports = { due, raise, forCase, channels,
  HEARING_LEAD_DAYS, WITNESS_LIST_DAYS, WITNESS_LEAD_DAYS, OUTCOME_CHASE_DAYS, OUTCOME_ESCALATE_DAYS };
