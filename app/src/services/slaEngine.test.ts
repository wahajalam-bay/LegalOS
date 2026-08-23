import { describe, it, expect } from "vitest";
import { calendarFor } from "@/lib/businessCalendar";
import type { PausePeriod } from "@/domain/models/request";
import { computeDueDate, computeSlaStatus, pausedBusinessDays } from "./slaEngine";

const PK = calendarFor("PK");
const iso = (s: string) => `${s}T00:00:00.000Z`;
const d = (s: string) => new Date(iso(s));

describe("SLA engine", () => {
  it("computes the due date in business days (PK)", () => {
    // Friday 2026-01-02 + 3 business days → Wednesday 2026-01-07
    const due = computeDueDate(PK, iso("2026-01-02"), 3, [], d("2026-01-02"));
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-07");
  });

  it("pushes the due date out by paused (requester-waiting) business days", () => {
    const pauses: PausePeriod[] = [{ reason: "Awaiting Requester", start: iso("2026-01-05"), end: iso("2026-01-07") }];
    // 2 business days paused (Mon→Wed) → due moves from Wed 07 to Fri 09
    const due = computeDueDate(PK, iso("2026-01-02"), 3, pauses, d("2026-01-09"));
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-09");
  });

  it("counts paused business days, clamped to now", () => {
    const pauses: PausePeriod[] = [{ reason: "x", start: iso("2026-01-05"), end: null }];
    expect(pausedBusinessDays(PK, pauses, d("2026-01-07"))).toBe(2); // Mon→Wed
  });

  it("flags a breach once now passes the due date", () => {
    const status = computeSlaStatus(PK, iso("2026-01-02"), 3, [], d("2026-01-12"));
    expect(status.breached).toBe(true);
    expect(status.remainingBusinessDays).toBeLessThan(0);
  });

  it("is on-track before the due date", () => {
    const status = computeSlaStatus(PK, iso("2026-01-02"), 3, [], d("2026-01-05"));
    expect(status.breached).toBe(false);
  });
});
