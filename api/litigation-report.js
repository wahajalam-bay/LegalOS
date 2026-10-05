/* THE WEEKLY LITIGATION REPORT.
 *
 * What happened in a date range, assembled from the records — hearings held,
 * outcomes recorded, cases opened and closed, what was billed, and what is
 * coming next.
 *
 * IT IS ASSEMBLED, NOT WRITTEN. Every line traces to a case, a hearing, an
 * invoice or a date already in the register, and each section carries the ids
 * it was built from so a reader can open the thing being described. There is
 * no model in this file and nothing is inferred: if the register does not say
 * a hearing had an outcome, the report says the outcome was not recorded,
 * which is the useful thing to tell somebody anyway.
 *
 * WHY THAT MATTERS HERE. A weekly report is read by people who will act on it
 * and will not check it. A sentence in it that nobody can trace is worse than
 * a gap, because a gap is visible. So the draft is a rearrangement of facts
 * the register already holds, and a lawyer edits and signs it off before it is
 * anything more than a draft.
 */
const str = (v) => String(v == null ? "" : v).trim();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
const inRange = (d, from, to) => isDate(d) && (!from || d >= from) && (!to || d <= to);

/* A case, reduced to the handful of facts a report line needs. */
function brief(c) {
  return {
    id: c.id,
    caseNo: str(c.caseNo || c.courtCaseNumber),
    name: str(c.caseName || c.title) || c.id,
    entity: str(c.entity),
    counsel: str(c.counsel && (c.counsel.firm || c.counsel.lead)) || str(c.counsel) === "—" ? "" : str(c.counsel),
    caseType: str(c.caseType),
    status: str(c.status),
    position: str(c.companyPosition || c.position),
    exposure: c.exposurePKR != null && c.exposurePKR !== "" ? c.exposurePKR : (c.exposure ?? ""),
    recoverable: c.recoverablePKR != null && c.recoverablePKR !== "" ? c.recoverablePKR : (c.recoverable ?? ""),
    currency: str(c.currency) || "PKR",
  };
}

function build(cases, opts) {
  const o = opts || {};
  const from = isDate(o.from) ? o.from : null;
  const to = isDate(o.to) ? o.to : null;
  const rows = cases || [];

  /* ---- hearings that fell inside the window ---- */
  const heard = [];
  for (const c of rows) {
    for (const h of (c.hearings || [])) {
      if (!inRange(h.date, from, to)) continue;
      heard.push({
        ...brief(c),
        hearingDate: str(h.date),
        purpose: str(h.purpose),
        /* Not "no outcome" as a fact about the hearing -- a fact about the
           RECORD. The distinction is the whole point of the report. */
        outcome: str(h.outcome),
        outcomeRecorded: !!str(h.outcome),
        notes: str(h.notes),
        nextHearing: str(h.nextHearing),
      });
    }
  }
  heard.sort((a, b) => a.hearingDate.localeCompare(b.hearingDate));

  /* ---- what is coming, and what slipped ---- */
  const upcoming = rows
    .filter((c) => isDate(c.nextHearing) && (!to || c.nextHearing > to))
    .map((c) => ({ ...brief(c), nextHearing: str(c.nextHearing) }))
    .sort((a, b) => a.nextHearing.localeCompare(b.nextHearing))
    .slice(0, 40);

  const awaitingOutcome = rows
    .filter((c) => isDate(c.nextHearing) && inRange(c.nextHearing, from, to)
      && !(c.hearings || []).some((h) => str(h.date) === str(c.nextHearing) && str(h.outcome)))
    .map((c) => ({ ...brief(c), hearingDate: str(c.nextHearing) }));

  /* ---- cases that started or finished in the window ---- */
  const opened = rows.filter((c) => inRange(c.filingDate || c.filed || (c.dates && c.dates.filing), from, to)).map(brief);
  const completed = rows.filter((c) => str(c.status) === "Completed"
    && inRange((c.dates && c.dates.closed) || c.closedAt, from, to)).map(brief);

  /* ---- what was billed ---- */
  const invoices = [];
  for (const c of rows) {
    for (const i of (c.invoices || [])) {
      if (!inRange(i.invoiceDate, from, to)) continue;
      invoices.push({ caseId: c.id, caseName: str(c.caseName || c.title),
        invoiceNumber: str(i.invoiceNumber), nature: str(i.nature),
        amount: i.amount, currency: str(i.currency) || "PKR",
        amountPaid: i.amountPaid, outstanding: i.outstanding, firm: str(i.issuingFirm) });
    }
  }
  const billed = {};
  for (const i of invoices) {
    const b = billed[i.currency] || (billed[i.currency] = { invoiced: 0, paid: 0 });
    b.invoiced += Number(i.amount) || 0;
    b.paid += Number(i.amountPaid) || 0;
  }

  /* ---- exposure across the cases the report touches ---- */
  const touched = new Map();
  for (const h of heard) touched.set(h.id, h);
  for (const c of opened) touched.set(c.id, c);
  const exposure = {};
  for (const c of touched.values()) {
    const cur = c.currency || "PKR";
    const e = exposure[cur] || (exposure[cur] = { exposure: 0, recoverable: 0 });
    e.exposure += Number(c.exposure) || 0;
    e.recoverable += Number(c.recoverable) || 0;
  }

  return {
    period: { from, to },
    generatedAt: new Date().toISOString(),
    /* Everything below is drawn from these many case records. */
    basis: { cases: rows.length, casesInReport: touched.size },
    sections: {
      hearingsHeld: heard,
      outcomesNotRecorded: heard.filter((h) => !h.outcomeRecorded),
      awaitingOutcome,
      casesOpened: opened,
      casesCompleted: completed,
      upcomingHearings: upcoming,
      invoices,
    },
    totals: {
      hearingsHeld: heard.length,
      /* Cases whose NEXT-HEARING DATE fell in the window but which carry no
         hearing record for it. Most of the register is like this: the trackers
         were kept by overwriting the date, so the sitting happened and nothing
         was minuted. It is the most useful thing this report can tell a lead,
         and it is a different population from `hearingsHeld` -- which counts
         sittings that were actually recorded. */
      awaitingOutcome: awaitingOutcome.length,
      outcomesRecorded: heard.filter((h) => h.outcomeRecorded).length,
      outcomesNotRecorded: heard.filter((h) => !h.outcomeRecorded).length,
      casesOpened: opened.length,
      casesCompleted: completed.length,
      upcomingHearings: upcoming.length,
      billed,
      exposure,
    },
  };
}

/* The draft, as prose a lawyer will edit. Plain sentences over the same facts;
   no adjectives, no conclusions and nothing the sections above do not contain.
   Every paragraph names the cases it is about so a reader can check it. */
function draft(report) {
  const t = report.totals;
  const s = report.sections;
  const p = report.period;
  const period = (p.from || "the start") + " to " + (p.to || "today");
  const money = (b) => Object.entries(b || {}).map(([c, v]) =>
    c + " " + Number(v.invoiced || v.exposure || 0).toLocaleString()).join(", ");
  const list = (rows, n) => rows.slice(0, n).map((r) =>
    r.name + (r.caseNo ? " (" + r.caseNo + ")" : "")).join("; ");

  const out = [];
  out.push("# Weekly litigation report");
  out.push("");
  out.push("**Period:** " + period + "  ");
  out.push("**Drawn from:** " + report.basis.cases + " cases on the register, "
    + report.basis.casesInReport + " of which had activity in this period.");
  out.push("");

  out.push("## Hearings");
  if (!t.hearingsHeld && !t.awaitingOutcome) {
    out.push("No hearing on the register fell inside this period.");
  } else if (!t.hearingsHeld) {
    out.push(t.awaitingOutcome + " case" + (t.awaitingOutcome === 1 ? "" : "s")
      + " had a hearing date inside this period and carr"
      + (t.awaitingOutcome === 1 ? "ies" : "y") + " no record of what happened:");
    out.push("");
    for (const a of s.awaitingOutcome.slice(0, 25)) {
      out.push("- " + a.hearingDate + " — " + a.name + (a.caseNo ? " (" + a.caseNo + ")" : "")
        + (a.entity ? ", " + a.entity : ""));
    }
  } else {
    out.push(t.hearingsHeld + " hearing" + (t.hearingsHeld === 1 ? "" : "s") + " fell in this period. "
      + t.outcomesRecorded + " " + (t.outcomesRecorded === 1 ? "has" : "have") + " an outcome recorded"
      + (t.outcomesNotRecorded ? "; " + t.outcomesNotRecorded + " do not." : "."));
    out.push("");
    for (const h of s.hearingsHeld.slice(0, 25)) {
      out.push("- **" + h.hearingDate + " — " + h.name + "**"
        + (h.caseNo ? " (" + h.caseNo + ")" : "")
        + (h.purpose ? ". " + h.purpose : "")
        + (h.outcomeRecorded ? ". Outcome: " + h.outcome : ". **No outcome recorded.**")
        + (h.nextHearing ? " Next hearing " + h.nextHearing + "." : ""));
    }
  }
  out.push("");

  if (s.outcomesNotRecorded.length) {
    out.push("## Outcomes still to be recorded");
    out.push("These were heard in the period and the register carries no outcome for them:");
    out.push("");
    for (const h of s.outcomesNotRecorded.slice(0, 25)) {
      out.push("- " + h.hearingDate + " — " + h.name + (h.counsel ? " (" + h.counsel + ")" : ""));
    }
    out.push("");
  }

  out.push("## Cases opened and completed");
  out.push(t.casesOpened
    ? t.casesOpened + " case" + (t.casesOpened === 1 ? " was" : "s were") + " filed in this period: " + list(s.casesOpened, 10) + "."
    : "No case was filed in this period.");
  out.push("");
  out.push(t.casesCompleted
    ? t.casesCompleted + " case" + (t.casesCompleted === 1 ? " was" : "s were") + " completed: " + list(s.casesCompleted, 10) + "."
    : "No case was completed in this period.");
  out.push("");

  out.push("## What is coming");
  out.push(t.upcomingHearings
    ? t.upcomingHearings + " hearing" + (t.upcomingHearings === 1 ? " is" : "s are") + " listed after this period. The nearest are:"
    : "No hearing is listed after this period.");
  if (t.upcomingHearings) {
    out.push("");
    for (const u of s.upcomingHearings.slice(0, 10)) {
      out.push("- " + u.nextHearing + " — " + u.name + (u.entity ? " (" + u.entity + ")" : ""));
    }
  }
  out.push("");

  if (s.invoices.length) {
    out.push("## Legal spend");
    out.push(s.invoices.length + " invoice" + (s.invoices.length === 1 ? " was" : "s were")
      + " raised in this period, totalling " + money(t.billed) + ".");
    out.push("");
  }

  if (Object.keys(t.exposure).length) {
    out.push("## Exposure and recoverable");
    out.push("Across the cases in this report: exposure "
      + Object.entries(t.exposure).map(([c, v]) => c + " " + Number(v.exposure).toLocaleString()).join(", ")
      + "; recoverable "
      + Object.entries(t.exposure).map(([c, v]) => c + " " + Number(v.recoverable).toLocaleString()).join(", ") + ".");
    out.push("");
  }

  out.push("---");
  out.push("*Assembled from the litigation register on " + report.generatedAt.slice(0, 10)
    + ". Every figure above is drawn from a case record; nothing here is inferred. "
    + "Review and edit before circulating.*");
  return out.join("\n");
}

module.exports = { build, draft };
