import type { Jurisdiction } from "@/domain/models/enums";

/**
 * A jurisdiction's business calendar. `workingWeekdays` uses JS UTC day numbers
 * (0=Sun … 6=Sat). Holidays are ISO date keys (YYYY-MM-DD). All arithmetic runs
 * in UTC so results are deterministic and timezone-independent.
 */
/** Working hours in a jurisdiction's local time (24h). Kept configurable so the
 * TAT abstraction can move to business-hours later without touching callers. */
export interface WorkingHours {
  readonly startHour: number;
  readonly endHour: number;
  /** IANA-ish label for display; the day-based engine does not depend on it. */
  readonly timeZone: string;
}

export interface BusinessCalendar {
  readonly jurisdiction: Jurisdiction;
  readonly workingWeekdays: readonly number[];
  readonly holidays: ReadonlySet<string>;
  readonly workingHours: WorkingHours;
}

// Pakistan: Mon–Fri (weekend Sat/Sun). Saudi Arabia: Sun–Thu (weekend Fri/Sat).
// Calendars are fully independent — no shared/hardcoded assumptions across them.
export const CALENDARS: Record<Jurisdiction, BusinessCalendar> = {
  PK: {
    jurisdiction: "PK",
    workingWeekdays: [1, 2, 3, 4, 5],
    holidays: new Set<string>(["2026-03-23", "2026-08-14", "2026-12-25"]),
    workingHours: { startHour: 9, endHour: 18, timeZone: "Asia/Karachi" },
  },
  KSA: {
    jurisdiction: "KSA",
    workingWeekdays: [0, 1, 2, 3, 4],
    holidays: new Set<string>(["2026-09-23"]),
    workingHours: { startHour: 8, endHour: 17, timeZone: "Asia/Riyadh" },
  },
};

export function calendarFor(jurisdiction: Jurisdiction): BusinessCalendar {
  return CALENDARS[jurisdiction];
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(cal: BusinessCalendar, d: Date): boolean {
  return cal.workingWeekdays.includes(d.getUTCDay()) && !cal.holidays.has(dateKey(d));
}

/** Add `days` business days to `from` (0 → the same day if working, else the next working day). */
export function addBusinessDays(cal: BusinessCalendar, from: Date, days: number): Date {
  const d = new Date(from.getTime());
  if (days <= 0) {
    while (!isWorkingDay(cal, d)) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(cal, d)) remaining--;
  }
  return d;
}

/** Whole business days elapsed in the interval (a, b]. 0 if b precedes a. */
export function businessDaysBetween(cal: BusinessCalendar, a: Date, b: Date): number {
  if (b <= a) return 0;
  const d = new Date(a.getTime());
  let count = 0;
  while (d < b) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d <= b && isWorkingDay(cal, d)) count++;
  }
  return count;
}
