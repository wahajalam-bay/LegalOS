import type { BusinessCalendar } from "@/lib/businessCalendar";
import { addBusinessDays, businessDaysBetween } from "@/lib/businessCalendar";
import type { PausePeriod } from "@/domain/models/request";

export interface SlaStatus {
  readonly target: number;
  readonly dueDate: Date;
  readonly consumedBusinessDays: number;
  readonly pausedBusinessDays: number;
  readonly remainingBusinessDays: number;
  readonly breached: boolean;
  readonly nearBreach: boolean;
}

/** Business days spent in pause windows (requester waiting time), clamped to now. */
export function pausedBusinessDays(cal: BusinessCalendar, pauses: readonly PausePeriod[], now: Date): number {
  let total = 0;
  for (const p of pauses) {
    const start = new Date(p.start);
    const end = p.end ? new Date(p.end) : now;
    const clampedEnd = end > now ? now : end;
    if (clampedEnd > start) total += businessDaysBetween(cal, start, clampedEnd);
  }
  return total;
}

/**
 * The operative SLA due date: start + target business days, then pushed out by
 * any paused (requester-waiting) business days — the clock never runs against
 * Legal while the ball is with the requester.
 */
export function computeDueDate(
  cal: BusinessCalendar,
  startIso: string,
  targetBusinessDays: number,
  pauses: readonly PausePeriod[],
  now: Date,
): Date {
  const start = new Date(startIso);
  const base = addBusinessDays(cal, start, targetBusinessDays);
  const paused = pausedBusinessDays(cal, pauses, now);
  return paused > 0 ? addBusinessDays(cal, base, paused) : base;
}

export function computeSlaStatus(
  cal: BusinessCalendar,
  startIso: string,
  targetBusinessDays: number,
  pauses: readonly PausePeriod[],
  now: Date,
): SlaStatus {
  const start = new Date(startIso);
  const paused = pausedBusinessDays(cal, pauses, now);
  const elapsed = businessDaysBetween(cal, start, now);
  const consumed = Math.max(0, elapsed - paused);
  const remaining = targetBusinessDays - consumed;
  const dueDate = computeDueDate(cal, startIso, targetBusinessDays, pauses, now);
  return {
    target: targetBusinessDays,
    dueDate,
    consumedBusinessDays: consumed,
    pausedBusinessDays: paused,
    remainingBusinessDays: remaining,
    breached: now > dueDate,
    nearBreach: remaining <= 1 && now <= dueDate,
  };
}
