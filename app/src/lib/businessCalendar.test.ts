import { describe, it, expect } from "vitest";
import { addBusinessDays, businessDaysBetween, calendarFor, isWorkingDay } from "./businessCalendar";

// Reference weekdays (UTC): 2026-01-01 Thu, 01-02 Fri, 01-03 Sat, 01-04 Sun, 01-05 Mon.
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const PK = calendarFor("PK");
const KSA = calendarFor("KSA");

describe("business calendar — different working weeks per jurisdiction", () => {
  it("Pakistan works Mon–Fri (weekend Sat/Sun)", () => {
    expect(isWorkingDay(PK, d("2026-01-02"))).toBe(true);  // Friday
    expect(isWorkingDay(PK, d("2026-01-03"))).toBe(false); // Saturday
    expect(isWorkingDay(PK, d("2026-01-04"))).toBe(false); // Sunday
  });

  it("Saudi Arabia works Sun–Thu (weekend Fri/Sat)", () => {
    expect(isWorkingDay(KSA, d("2026-01-02"))).toBe(false); // Friday
    expect(isWorkingDay(KSA, d("2026-01-03"))).toBe(false); // Saturday
    expect(isWorkingDay(KSA, d("2026-01-04"))).toBe(true);  // Sunday
  });

  it("respects holidays regardless of weekday", () => {
    expect(isWorkingDay(PK, d("2026-08-14"))).toBe(false); // seeded PK holiday
  });
});

describe("addBusinessDays", () => {
  it("skips the PK weekend", () => {
    // Friday + 1 business day → Monday
    expect(addBusinessDays(PK, d("2026-01-02"), 1).toISOString().slice(0, 10)).toBe("2026-01-05");
  });
  it("skips the KSA weekend", () => {
    // Thursday + 1 business day → Sunday (Fri/Sat are weekend)
    expect(addBusinessDays(KSA, d("2026-01-01"), 1).toISOString().slice(0, 10)).toBe("2026-01-04");
  });
  it("does not simply add calendar days", () => {
    // 3 business days from Friday (PK) → Wed (Mon,Tue,Wed), not Monday
    expect(addBusinessDays(PK, d("2026-01-02"), 3).toISOString().slice(0, 10)).toBe("2026-01-07");
  });
});

describe("businessDaysBetween", () => {
  it("counts only working days in (a, b]", () => {
    // Fri → next Fri, PK: Mon,Tue,Wed,Thu,Fri = 5
    expect(businessDaysBetween(PK, d("2026-01-02"), d("2026-01-09"))).toBe(5);
  });
  it("is zero when b precedes a", () => {
    expect(businessDaysBetween(PK, d("2026-01-09"), d("2026-01-02"))).toBe(0);
  });
});
