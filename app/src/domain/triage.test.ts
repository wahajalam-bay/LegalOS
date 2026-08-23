import { describe, it, expect, beforeEach } from "vitest";
import { createLocalRepositories } from "@/data/localRepository";
import type { Repositories } from "@/data/repository";
import { createRequestService, type RequestService } from "@/services/requestService";
import { nullNotifier } from "@/services/notificationService";
import { fixedClock } from "@/lib/clock";
import { brandId, type RequestId, type UserId, type DepartmentId } from "@/domain/models/ids";
import type { Request } from "@/domain/models/request";
import type { NewRequestInput } from "@/lib/validation";
import { proposeCategory, proposePriority, suggestAssignee, computeFlags, similarMatters, URGENCY_TO_PRIORITY } from "./triage";

const REQUESTER = brandId<"UserId">("USR-REQ") as UserId;

const intake = (over: Partial<NewRequestInput> = {}): NewRequestInput => ({
  requesterCategory: "agreement",
  description: "Signing a deal with a new supplier",
  businessContext: "New SaaS vendor; standard terms; need review before month end.",
  businessUrgency: "Important",
  neededByDate: null, neededByJustification: null, jurisdiction: "PK",
  intakeDetails: {}, attachments: [],
  ...over,
});

let repos: Repositories;
let svc: RequestService;
beforeEach(() => {
  repos = createLocalRepositories({ persist: false });
  svc = createRequestService({ repos, clock: fixedClock("2026-01-05T09:00:00.000Z"), notifier: nullNotifier });
});

function make(over: Partial<NewRequestInput>): Request {
  const res = svc.create(intake(over), REQUESTER);
  if (!res.ok) throw new Error("setup failed: " + res.error);
  return res.value;
}

describe("proposeCategory", () => {
  it("detects an NDA from the wording", () => {
    expect(proposeCategory(make({ description: "We need an NDA before sharing data" })).category).toBe("NDA");
  });
  it("routes high-value agreements to the complex review lane", () => {
    expect(proposeCategory(make({ description: "High value acquisition agreement" })).category).toBe("Contract Review — Complex / High Value");
  });
  it("routes our-paper standard drafting to the template lane", () => {
    const r = make({ description: "Draft a standard template agreement", intakeDetails: { counterpartyName: "Acme", paper: "Our paper" } });
    expect(proposeCategory(r).category).toBe("Contract Drafting — From Template");
  });
  it("distinguishes renewal / termination / amendment", () => {
    expect(proposeCategory(make({ requesterCategory: "change", description: "Please renew our MSA", businessContext: "The current MSA expires soon and we want it renewed." })).category).toBe("Renewal");
    expect(proposeCategory(make({ requesterCategory: "change", description: "We want to terminate the contract", businessContext: "We need to end the supplier agreement early." })).category).toBe("Termination");
    expect(proposeCategory(make({ requesterCategory: "change", description: "Change a pricing clause", businessContext: "We want to amend one schedule in the agreement." })).category).toBe("Amendment");
  });
  it("grades advisory complexity", () => {
    expect(proposeCategory(make({ requesterCategory: "advice", description: "Cross-border structuring question", businessContext: "Multi-jurisdiction structuring advice needed." })).category).toBe("Legal Opinion — Complex");
    expect(proposeCategory(make({ requesterCategory: "advice", description: "Quick question", businessContext: "Simple narrow question about one clause." })).category).toBe("Legal Opinion — Simple/Narrow");
  });
  it("always carries a rationale", () => {
    expect(proposeCategory(make({})).rationale.length).toBeGreaterThan(0);
  });
});

describe("proposePriority", () => {
  it("derives priority from business urgency", () => {
    expect(proposePriority(make({ businessUrgency: "Emergency" })).priority).toBe("Emergency");
    expect(URGENCY_TO_PRIORITY.Routine).toBe("Routine");
  });
});

describe("suggestAssignee", () => {
  it("prefers the lightest active workload deterministically", () => {
    // Seed request REQ-2026-00001 is In Progress and assigned to USR-ASSOC, so an
    // eligible owner with zero active work should win; ties break by id (USR-AD).
    const all = repos.requests.list();
    const users = repos.users.list();
    const pick = suggestAssignee("Contract Review — Standard", users, all);
    expect(pick.id).toBe(brandId<"UserId">("USR-AD"));
    expect(pick.rationale.length).toBeGreaterThan(0);
  });
});

/* ---- flags: build request literals for full control over inputs ---- */
const NOW = Date.parse("2026-06-01T00:00:00.000Z");
const DAY = 86_400_000;
const baseReq = (over: Partial<Request> = {}): Request => ({
  id: brandId<"RequestId">("REQ-TEST-1") as RequestId,
  requesterId: REQUESTER, requesterEmail: "r@x", requesterEmployeeId: "E",
  departmentId: brandId<"DepartmentId">("DEP-PROC") as DepartmentId, jurisdiction: "PK",
  requesterCategory: "agreement", description: "desc", businessContext: "x".repeat(60),
  businessUrgency: "Important", neededByDate: null, neededByJustification: null,
  intakeDetails: {}, attachments: [],
  legalCategory: "Contract Review — Standard", priority: "Important", slaConfigId: null, slaDueDate: null,
  assignment: null, status: "Submitted", pausePeriods: [], matterId: null, statusHistory: [],
  submittedAt: "2026-06-01T00:00:00.000Z", createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
  internal: { comments: [], triageNotes: null, riskNote: null },
  ...over,
});

describe("computeFlags", () => {
  it("flags incomplete information when context is thin", () => {
    const flags = computeFlags(baseReq({ businessContext: "too short" }), [], NOW);
    expect(flags.some((f) => f.kind === "incomplete")).toBe(true);
  });
  it("flags an urgency mismatch (routine but needed tomorrow)", () => {
    const r = baseReq({ businessUrgency: "Routine", neededByDate: new Date(NOW + DAY).toISOString() });
    expect(computeFlags(r, [], NOW).some((f) => f.kind === "urgency")).toBe(true);
  });
  it("flags restricted information for disputes", () => {
    expect(computeFlags(baseReq({ requesterCategory: "threat" }), [], NOW).some((f) => f.kind === "restricted")).toBe(true);
  });
  it("flags a potential conflict on a shared counterparty", () => {
    const a = baseReq({ id: brandId<"RequestId">("REQ-A") as RequestId, intakeDetails: { counterpartyName: "Acme Ltd" } });
    const b = baseReq({ id: brandId<"RequestId">("REQ-B") as RequestId, intakeDetails: { counterpartyName: "Acme Ltd" } });
    expect(computeFlags(a, [a, b], NOW).some((f) => f.kind === "conflict")).toBe(true);
  });
  it("every flag names its source rule", () => {
    const flags = computeFlags(baseReq({ businessContext: "short", requesterCategory: "threat" }), [], NOW);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.source.length > 0)).toBe(true);
  });
});

describe("similarMatters", () => {
  it("returns referenced precedents with a source for a known category", () => {
    const got = similarMatters(baseReq({ requesterCategory: "agreement" }));
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((m) => m.reference.length > 0 && m.source.length > 0)).toBe(true);
  });
});
