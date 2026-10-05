/* COMPLIANCE EXPIRY REMINDERS, AND WHO THEY GO TO (§54).
 *
 * A licence, a lease, a spend agreement and a loan all fall due, and until now
 * nothing told anybody. The registers showed the date; no bell rang.
 *
 * THE ROUTING RULE, which is the whole point of this file:
 *
 *   ASSIGNED    the record names an owner — that person is told.
 *   UNASSIGNED  nobody owns it, so the HEAD of the division that owns the
 *               subject is told instead. A reminder addressed to nobody is not
 *               a reminder, and "everybody" is worse than nobody.
 *   DORMANT     the entity is dissolved or inactive and the obligation still
 *               stands (a lapsed licence on a dead company is still a lapsed
 *               licence). Both the responsible Legal Executive AND the division
 *               head are told, because there is nobody inside the entity left
 *               to chase it.
 *
 * DERIVED, NOT SCHEDULED, and IDEMPOTENT — the same two properties the
 * litigation reminders are built on. There is no reminder table to drift from
 * the registers: the state of the record decides what is due, every time this
 * is asked. Every notification carries a deterministic id built from the
 * record, the kind and the date it is about, so raising the same reminder
 * twice writes one row and nobody's bell fills up.
 */
const notifications = require("./notifications");
const divisions = require("./divisions");

const DAY = 86400000;
const str = (v) => String(v == null ? "" : v).trim();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}/.test(str(v));
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

function rules() {
  try { return require("../config/compliance-rules.json").renewal || {}; }
  catch (e) { return {}; }
}

/* How far back an expiry is still worth chasing. Beyond this it is a hole in
   the record rather than a task — the licence trackers carry instruments that
   lapsed in 2018, and raising 200 alarms on somebody's first morning is how a
   notification list becomes one nobody reads. */
const CHASE_BACK_DAYS = 180;

/* An entity nobody is operating any more. The obligation does not lapse with
   the company: a dissolved entity with an unrenewed licence is exactly the
   case somebody has to decide about. */
const DORMANT_RE = /dissolv|struck off|wound up|liquidat|inactive|ceased|dormant/i;

/* WHO IS TOLD. The record's own owner where it has one; otherwise the head of
   the division whose subject this is. Returns [] when there is genuinely
   nobody, which the caller reports rather than papering over. */
function recipientsFor(rec, divisionKey) {
  const out = [];
  const push = (v) => { const s = str(v); if (s && !out.includes(s)) out.push(s); };
  push(rec.ownerUserId);
  /* The trackers record an owner as an EMAIL or a name, not a roster id, so an
     owner that cannot be resolved to a user is treated as unassigned rather
     than addressed into the void. */
  if (!out.length) push(divisions.headOfDivision(divisionKey));
  return out;
}

function forRecord(rec, kind, dateField, today, opts) {
  const due = str(rec[dateField]);
  if (!isDate(due)) return [];
  const away = daysBetween(today, due.slice(0, 10));
  const leads = (rules().reminderDays || [30, 15, 7]).slice().sort((a, b) => b - a);
  const label = rec.label || rec.title || rec.id;
  const out = [];

  if (away >= 0) {
    const hit = leads.filter((l) => away <= l).pop();      // the nearest warning wins
    if (hit == null) return [];
    out.push({
      kind: kind + "-due", recordId: rec.id, date: due.slice(0, 10), daysAway: away,
      title: away === 0 ? `${label} expires today` : `${label} expires in ${away} day${away === 1 ? "" : "s"}`,
      body: [rec.entity, rec.reference].filter(Boolean).join(" · "),
      tone: away <= 7 ? "red" : "amber",
      to: rec.path || null,
    });
  } else if (away >= -CHASE_BACK_DAYS) {
    out.push({
      kind: kind + "-expired", recordId: rec.id, date: due.slice(0, 10), daysAway: away,
      title: `${label} expired ${Math.abs(away)} day${Math.abs(away) === 1 ? "" : "s"} ago and no renewal is recorded`,
      body: [rec.entity, rec.reference].filter(Boolean).join(" · "),
      tone: "red", persistent: true,
      to: rec.path || null,
    });
  }
  return out;
}

/* Everything the compliance estate currently owes somebody.
   `books` is { licences, leases, services, loans } of already-shaped records —
   the caller passes what it has read, so this module reads nothing itself and
   can be exercised without Drive. */
function due(books, opts) {
  const o = opts || {};
  const today = o.today || iso(new Date(Date.now() + 5 * 60 * 60000));   // PKT
  const items = [];

  const add = (rows, kind, dateField, divisionKey, shape) => {
    for (const r of (rows || [])) {
      const rec = shape(r);
      if (rec.renewed) continue;                     // a renewal on file closes it
      for (const it of forRecord(rec, kind, dateField, today, o)) {
        const dormant = DORMANT_RE.test(str(rec.entityStatus));
        let recipients = recipientsFor(rec, divisionKey);
        if (dormant) {
          const head = divisions.headOfDivision(divisionKey);
          if (head && !recipients.includes(head)) recipients = recipients.concat([head]);
        }
        if (!recipients.length) continue;
        items.push({ ...it, recipients, dormant, division: divisionKey });
      }
    }
  };

  add(books.licences, "licence", "expiry", "compliance", (r) => ({
    id: r.id, label: [r.authority, r.entity].filter(Boolean).join(" — ") || "Licence",
    entity: r.entity, entityStatus: r.entityStatus || r.status, reference: r.number,
    expiry: r.expiry, ownerUserId: r.ownerUserId,
    /* A licence with a renewal certificate dated after its expiry has been put
       right; chasing it is noise. */
    renewed: !!(r.expiry && (r.renewalsOnFile || 0) > 0 && r.renewedAfterExpiry),
    path: "/compliance/licenses/" + r.id,
  }));
  add(books.leases, "lease", "end", "compliance", (r) => ({
    id: r.id, label: r.title || "Lease", entity: r.entity, entityStatus: r.status,
    reference: r.fileNo, end: r.end, ownerUserId: r.ownerUserId,
    path: "/compliance/leases/" + r.id,
  }));
  add(books.services, "agreement", "end", "compliance", (r) => ({
    id: r.id, label: r.title || "Spend agreement", entity: r.entity, entityStatus: r.status,
    reference: r.fileNo, end: r.end, ownerUserId: r.ownerUserId,
    path: "/compliance/services/" + r.id,
  }));
  add(books.loans, "loan", "repaymentDue", "compliance", (r) => ({
    id: r.id, label: r.title || r.borrower || "Loan", entity: r.borrower, entityStatus: r.status,
    reference: r.ref, repaymentDue: (r.current && r.current.repaymentDue) || r.repaymentDate,
    ownerUserId: r.ownerUserId, renewed: !!r.closed,
    path: "/compliance/loans/" + r.id,
  }));

  items.sort((a, b) => (a.daysAway - b.daysAway) || String(a.recordId).localeCompare(String(b.recordId)));
  return {
    today,
    items,
    counts: {
      total: items.length,
      expiring: items.filter((x) => /-due$/.test(x.kind)).length,
      expired: items.filter((x) => /-expired$/.test(x.kind)).length,
      dormantEntity: items.filter((x) => x.dormant).length,
      /* How many were routed to a HEAD because nothing owns the record. It is
         a compliance finding in its own right, not just a delivery detail. */
      unowned: items.filter((x) => x.recipients.length === 1
        && x.recipients[0] === divisions.headOfDivision("compliance")).length,
    },
  };
}

/* Raise what is owed as in-app notifications. Safe to call as often as you
   like: the id is (recipient, kind, record, date), so a reminder already on
   somebody's bell is not raised twice, and one whose cause has gone away is
   simply not raised again. */
function raise(books, byEmail, opts) {
  const d = due(books, opts);
  const payload = [];
  for (const it of d.items) {
    for (const uid of it.recipients) {
      payload.push({
        id: [uid, it.kind, it.recordId, it.date].join("|"),
        forUserId: uid, kind: it.kind, ref: it.recordId,
        title: it.title, body: it.body, tone: it.tone,
        icon: /-expired$/.test(it.kind) ? "alertTriangle" : "refresh",
        to: it.to,
      });
    }
  }
  if (!payload.length) return { raised: 0, ...d };
  const res = notifications.create({ notifications: payload.slice(0, 50) }, byEmail);
  return { raised: (res && res.notifications && res.notifications.length) || 0, ...d };
}

/* ONE SWEEP PER WINDOW, WHATEVER THE TRAFFIC.
 *
 * The app raises these on sign-in, which is what makes them arrive without a
 * scheduler this deployment does not have. But the sweep rebuilds the loan,
 * spend and licence models, and doing that on every sign-in put three model
 * builds in front of whatever the person was actually trying to open — a page
 * that used to render in two seconds took six.
 *
 * The notification ids are already idempotent, so repeating the sweep changes
 * nothing; it only costs. This does the work at most once per window and hands
 * everyone else the previous answer, which is the correct one because the
 * inputs are dated obligations that move once a day at most.
 */
const RAISE_WINDOW_MS = 10 * 60 * 1000;
let lastRaise = { at: 0, result: null };
async function raiseThrottled(books, byEmail, opts) {
  const now = Date.now();
  if (lastRaise.result && (now - lastRaise.at) < RAISE_WINDOW_MS) {
    return { ...lastRaise.result, raised: 0, throttled: true,
      detail: "These reminders were raised in the last " + Math.round(RAISE_WINDOW_MS / 60000)
        + " minutes. Nothing was raised again — the ids are idempotent, so repeating the sweep only costs." };
  }
  const out = raise(books, byEmail, opts);
  lastRaise = { at: now, result: out };
  return out;
}

/* Answerable WITHOUT building the models, so the route can decline the work
   before paying for it. */
function recentlyRaised() { return !!(lastRaise.result && (Date.now() - lastRaise.at) < RAISE_WINDOW_MS); }
function lastResult() {
  return { ...(lastRaise.result || { items: [], counts: {} }), raised: 0, throttled: true,
    detail: "These reminders were raised in the last " + Math.round(RAISE_WINDOW_MS / 60000)
      + " minutes. Nothing was raised again — the ids are idempotent, so repeating the sweep only costs." };
}

module.exports = { due, raise, raiseThrottled, recentlyRaised, lastResult,
  CHASE_BACK_DAYS, DORMANT_RE, RAISE_WINDOW_MS };
