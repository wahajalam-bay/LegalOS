import { describe, it, expect } from "vitest";
import type { SlaStatus } from "@/services/slaEngine";
import type { Request } from "@/domain/models/request";
import type { User } from "@/domain/models/user";
import type { UserId } from "@/domain/models/ids";
import { seedData } from "@/data/seed";
import { escalationLevelFor, consumedRatio, isHigher, resolveEscalationRecipients, DEFAULT_ESCALATION } from "./escalation";

const status = (over: Partial<SlaStatus>): SlaStatus => ({
  target: 4, dueDate: new Date("2026-01-10"), consumedBusinessDays: 0, pausedBusinessDays: 0,
  remainingBusinessDays: 4, breached: false, nearBreach: false, ...over,
});

describe("escalation thresholds", () => {
  it("is 'none' below the warn ratio", () => {
    expect(escalationLevelFor(status({ consumedBusinessDays: 2 }), DEFAULT_ESCALATION)).toBe("none");
  });
  it("warns at 80% consumed", () => {
    expect(escalationLevelFor(status({ consumedBusinessDays: 3.2 }))).toBe("warning");
  });
  it("breaches at 100% or when flagged breached", () => {
    expect(escalationLevelFor(status({ consumedBusinessDays: 4 }))).toBe("breach");
    expect(escalationLevelFor(status({ breached: true }))).toBe("breach");
  });
  it("computes the consumed ratio", () => {
    expect(consumedRatio(status({ consumedBusinessDays: 2, target: 4 }))).toBe(0.5);
  });
  it("only escalates upward", () => {
    expect(isHigher("breach", "warning")).toBe(true);
    expect(isHigher("warning", "warning")).toBe(false);
    expect(isHigher("warning", "breach")).toBe(false);
    expect(isHigher("warning", undefined)).toBe(true);
  });
});

describe("escalation recipients (role-resolved, not hardcoded)", () => {
  const { users } = seedData();
  const owner = users.find((u) => u.role === "seniorAssociate")!;
  const req = { assignment: { lawyerId: owner.id } } as unknown as Request;

  it("warns just the owner", () => {
    expect(resolveEscalationRecipients(req, users as User[], "warning")).toEqual([owner.id]);
  });
  it("escalates a breach up the line (owner → AD → Director)", () => {
    const got = resolveEscalationRecipients(req, users as User[], "breach");
    expect(got).toContain(owner.id);
    expect(got).toContain(users.find((u) => u.role === "adSeniorManager")!.id);
    expect(got).toContain(users.find((u) => u.role === "director")!.id);
  });
  it("handles an unassigned request without throwing", () => {
    const none = { assignment: null } as unknown as Request;
    expect(resolveEscalationRecipients(none, users as User[], "warning")).toEqual([] as UserId[]);
  });
});
