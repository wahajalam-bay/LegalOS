/* THE CAUSE LIST.
 *
 * What the litigation team has to turn up to, this week and next.
 *
 * It is DERIVED, every time it is asked for, from the next-hearing date on each
 * live case. That is the whole point: a cause list kept as its own copied
 * dataset is a spreadsheet that starts drifting from the cases the moment a
 * date moves, and the team then has two answers to "when are we in court" and
 * no way to tell which is right. There is nothing to refresh here and nothing
 * to regenerate -- move a hearing and the cause list has already moved.
 *
 * WEEKS RUN MONDAY TO SUNDAY, in Pakistan Standard Time, because that is where
 * the courts and the people reading this are. Computing the week boundary in
 * UTC puts a Monday morning hearing in the previous week for five hours every
 * Monday, which is exactly when somebody is looking at it.
 */

/* PKT is UTC+5 with no daylight saving. */
const PKT_OFFSET_MIN = 5 * 60;

function pktNow(now) {
  const d = now ? new Date(now) : new Date();
  return new Date(d.getTime() + PKT_OFFSET_MIN * 60000);
}
const iso = (d) => d.toISOString().slice(0, 10);

/* The Monday of the week a given instant falls in, in PKT. */
function weekStart(now) {
  const d = pktNow(now);
  const dow = d.getUTCDay();                 // 0 = Sunday
  const back = (dow + 6) % 7;                // days since Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() - back);
  return m;
}
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

const str = (v) => String(v == null ? "" : v).trim();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));

/* One row of the list. Only what somebody standing up in court needs, plus the
   id to open the case. */
function row(c) {
  return {
    id: c.id,
    date: str(c.nextHearing),
    caseNo: str(c.caseNo),
    caseName: str(c.caseName || c.title),
    entity: str(c.entity),
    counsel: str(c.counsel) === "—" ? "" : str(c.counsel),
    caseType: str(c.caseType || c.type || c.nature),
    court: str(c.court),
    status: str(c.status),
    position: str(c.position || c.companyPosition),
  };
}

/* Build the list from whatever the litigation register currently holds. */
function build(cases, now) {
  const thisMon = weekStart(now);
  const thisSun = addDays(thisMon, 6);
  const nextMon = addDays(thisMon, 7);
  const nextSun = addDays(nextMon, 6);
  const today = iso(pktNow(now));

  const dated = (cases || []).filter((c) => isDate(c.nextHearing));
  const between = (a, b) => dated
    .filter((c) => str(c.nextHearing) >= iso(a) && str(c.nextHearing) <= iso(b))
    .map(row)
    .sort((x, y) => x.date.localeCompare(y.date) || x.caseName.localeCompare(y.caseName));

  /* A hearing whose date has passed and which nobody has recorded an outcome
     for. Not part of either week, but the reason somebody should look at this
     screen -- a date that slid past is how a case goes quiet. */
  const overdue = dated
    .filter((c) => str(c.nextHearing) < today)
    .map(row)
    .sort((x, y) => y.date.localeCompare(x.date));

  return {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Karachi (UTC+5)",
    today,
    weeks: {
      thisWeek: { from: iso(thisMon), to: iso(thisSun), hearings: between(thisMon, thisSun) },
      nextWeek: { from: iso(nextMon), to: iso(nextSun), hearings: between(nextMon, nextSun) },
    },
    /* Capped, because this is a prompt to act and not a register: the full
       history lives in the case list. */
    pastDue: { total: overdue.length, hearings: overdue.slice(0, 25) },
    counts: {
      thisWeek: between(thisMon, thisSun).length,
      nextWeek: between(nextMon, nextSun).length,
      pastDue: overdue.length,
      /* How many cases carry a usable date at all. A cause list built over a
         register where most dates read "No date fixed" is thin for a reason,
         and the screen should be able to say so rather than look empty. */
      withDate: dated.length,
      total: (cases || []).length,
    },
  };
}

module.exports = { build, weekStart, PKT_OFFSET_MIN };
