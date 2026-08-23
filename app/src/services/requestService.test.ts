import { describe, it, expect, beforeEach } from "vitest";
import { createLocalRepositories } from "@/data/localRepository";
import type { Repositories } from "@/data/repository";
import { createRequestService, type RequestService } from "./requestService";
import { nullNotifier } from "./notificationService";
import { fixedClock } from "@/lib/clock";
import { brandId, type RequestId, type UserId } from "@/domain/models/ids";
import type { NewRequestInput } from "@/lib/validation";

const REQUESTER = brandId<"UserId">("USR-REQ") as UserId;
const AD = brandId<"UserId">("USR-AD") as UserId;
const ASSOC = brandId<"UserId">("USR-ASSOC") as UserId;

const intake = (over: Partial<NewRequestInput> = {}): NewRequestInput => ({
  requesterCategory: "agreement",
  description: "Signing a deal with a new supplier",
  businessContext: "New SaaS vendor; their paper; need review before month end.",
  businessUrgency: "Important",
  neededByDate: null,
  neededByJustification: null,
  jurisdiction: "PK",
  ...over,
});

let repos: Repositories;
let svc: RequestService;
beforeEach(() => {
  repos = createLocalRepositories({ persist: false });
  svc = createRequestService({ repos, clock: fixedClock("2026-01-05T09:00:00.000Z"), notifier: nullNotifier });
});

describe("requestService.create", () => {
  it("creates a Submitted request with a proposed category and an audit event", () => {
    const res = svc.create(intake(), REQUESTER);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Submitted");
    expect(res.value.legalCategory).toBe("Contract Drafting / Review");
    expect(res.value.id).toMatch(/^REQ-2026-\d{5}$/);
    const audit = repos.audit.list(res.value.id);
    expect(audit.some((e) => e.action === "request.created")).toBe(true);
  });

  it("requires a justification when the needed-by date is tighter than SLA", () => {
    const res = svc.create(intake({ neededByDate: "2026-01-05T00:00:00.000Z", neededByJustification: null }), REQUESTER);
    expect(res.ok).toBe(false);
  });
});

describe("requestService.applyTriage", () => {
  it("assigns, sets category/priority, and logs the override reason", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const res = svc.applyTriage(created.value.id, {
      legalCategory: "Legal Opinion / Advisory", priority: "High", assignedLawyerId: ASSOC, overrideReason: "Really an advisory question",
    }, AD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Assigned");
    expect(res.value.assignment?.lawyerId).toBe(ASSOC);
    expect(res.value.legalCategory).toBe("Legal Opinion / Advisory");
    const audit = repos.audit.list(created.value.id);
    expect(audit.some((e) => e.action === "request.category_changed" && e.reason === "Really an advisory question")).toBe(true);
    expect(audit.some((e) => e.action === "request.assignee_changed")).toBe(true);
  });
});

describe("requestService.transition — clock pause/resume", () => {
  it("opens a pause on Awaiting Requester and closes it on resume", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id: RequestId = created.value.id;
    svc.applyTriage(id, { legalCategory: "Contract Drafting / Review", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    svc.transition(id, "In Progress", ASSOC);
    const paused = svc.transition(id, "Awaiting Requester", ASSOC, "Need the counterparty draft");
    expect(paused.ok && paused.value.pausePeriods.length).toBe(1);
    expect(paused.ok && paused.value.pausePeriods[0].end).toBeNull();
    const resumed = svc.transition(id, "In Progress", ASSOC);
    expect(resumed.ok && resumed.value.pausePeriods[0].end).not.toBeNull();
  });

  it("rejects an illegal transition", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const res = svc.transition(created.value.id, "Closed", ASSOC);
    expect(res.ok).toBe(false);
  });
});

describe("requestService.convertToMatter", () => {
  it("links a matter and records the conversion (Module 2 not built)", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    svc.applyTriage(id, { legalCategory: "Contract Drafting / Review", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    svc.transition(id, "In Progress", ASSOC);
    const res = svc.convertToMatter(id, ASSOC);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Converted to Matter");
    expect(res.value.matterId).toMatch(/^MAT-/);
    expect(repos.audit.list(id).some((e) => e.action === "request.converted_to_matter")).toBe(true);
  });
});
