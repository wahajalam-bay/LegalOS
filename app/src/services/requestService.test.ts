import { describe, it, expect, beforeEach } from "vitest";
import { createLocalRepositories } from "@/data/localRepository";
import type { Repositories } from "@/data/repository";
import { createRequestService, type RequestService } from "./requestService";
import { nullNotifier, createRepoNotifier } from "./notificationService";
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
    expect(res.value.legalCategory).toBe("Contract Review — Standard");
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
      legalCategory: "Legal Opinion — Complex", priority: "High", assignedLawyerId: ASSOC, overrideReason: "Really an advisory question",
    }, AD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Assigned");
    expect(res.value.assignment?.lawyerId).toBe(ASSOC);
    expect(res.value.legalCategory).toBe("Legal Opinion — Complex");
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
    svc.applyTriage(id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
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

describe("requestService.applyTriage — overrides & SLA", () => {
  it("logs a reason for each overridden field and records an SLA override", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    const res = svc.applyTriage(id, {
      legalCategory: created.value.legalCategory, // unchanged
      priority: "Urgent", assignedLawyerId: ASSOC,
      priorityReason: "board deadline", assigneeReason: "domain expert",
      slaDueDateOverride: "2026-01-20T00:00:00.000Z", slaReason: "client-imposed date",
    }, AD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.slaOverridden).toBe(true);
    expect(res.value.slaDueDate).toBe("2026-01-20T00:00:00.000Z");
    const audit = repos.audit.list(id);
    expect(audit.some((e) => e.action === "request.priority_changed" && e.reason === "board deadline")).toBe(true);
    expect(audit.some((e) => e.action === "request.assignee_changed" && e.reason === "domain expert")).toBe(true);
    expect(audit.some((e) => e.action === "request.sla_changed" && e.reason === "client-imposed date")).toBe(true);
    // category unchanged → no category_changed event
    expect(audit.some((e) => e.action === "request.category_changed")).toBe(false);
  });
});

describe("requestService.requestMoreInfo", () => {
  it("sends the request back to the requester, pauses the clock, and audits it", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    const res = svc.requestMoreInfo(id, "Please share the counterparty draft.", AD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Awaiting Requester");
    expect(res.value.pausePeriods.length).toBe(1);
    expect(res.value.pausePeriods[0].end).toBeNull();
    expect(res.value.internal.comments.some((c) => !c.internal && c.body.includes("counterparty draft"))).toBe(true);
    const audit = repos.audit.list(id);
    expect(audit.some((e) => e.action === "request.status_changed" && e.newValue === "Awaiting Requester")).toBe(true);
    expect(audit.some((e) => e.action === "request.requester_contacted")).toBe(true);
  });
});

describe("requestService.transition — role enforcement", () => {
  it("blocks a requester from moving a request and allows the assigned lawyer", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    svc.applyTriage(id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    expect(svc.transition(id, "In Progress", REQUESTER).ok).toBe(false); // requester lacks changeStatus
    expect(svc.transition(id, "In Progress", ASSOC).ok).toBe(true);      // senior associate may
  });
});

describe("requestService.addComment — requester response resumes the clock", () => {
  it("moves Awaiting Requester back to In Progress and closes the pause", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    svc.applyTriage(id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    svc.transition(id, "In Progress", ASSOC);
    svc.transition(id, "Awaiting Requester", ASSOC, "need info");
    const res = svc.addComment(id, "Here is the information you asked for.", false, REQUESTER);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("In Progress");
    expect(res.value.pausePeriods[0].end).not.toBeNull();
    expect(repos.audit.list(id).some((e) => e.action === "request.requester_responded")).toBe(true);
  });
});

describe("requestService — lifecycle notifications", () => {
  it("notifies the requester on delivery and closure", () => {
    const r = createLocalRepositories({ persist: false });
    const s = createRequestService({ repos: r, clock: fixedClock("2026-01-05T09:00:00.000Z"), notifier: createRepoNotifier(r.notifications) });
    const created = s.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    s.applyTriage(id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    s.transition(id, "In Progress", ASSOC);
    s.transition(id, "Delivered", ASSOC);
    s.transition(id, "Closed", ASSOC);
    const kinds = r.notifications.list().map((n) => n.kind);
    expect(kinds).toContain("request.delivered");
    expect(kinds).toContain("request.closed");
  });
});

describe("requestService.runSlaChecks — escalation", () => {
  it("emits a breach escalation once, then is idempotent", () => {
    const r = createLocalRepositories({ persist: false });
    const early = createRequestService({ repos: r, clock: fixedClock("2026-01-05T09:00:00.000Z"), notifier: createRepoNotifier(r.notifications) });
    const created = early.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    early.applyTriage(created.value.id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    // A much later clock — well past the due date.
    const late = createRequestService({ repos: r, clock: fixedClock("2026-03-01T09:00:00.000Z"), notifier: createRepoNotifier(r.notifications) });
    const first = late.runSlaChecks();
    expect(first).toBeGreaterThan(0);
    expect(r.notifications.list().some((n) => n.kind === "sla.breached")).toBe(true);
    expect(late.runSlaChecks()).toBe(0); // already escalated at this level
  });
});

describe("requestService.previewSla", () => {
  it("returns the business-day target and a due date for a valid combination", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const sla = svc.previewSla(created.value, "Contract Review — Standard", "Medium");
    expect(sla.businessDays).toBeGreaterThan(0);
    expect(sla.dueDate).toBeTruthy();
  });

  it("slaStatusFor reports business-day consumption once triaged", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    svc.applyTriage(created.value.id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    const status = svc.slaStatusFor(repos.requests.get(created.value.id)!);
    expect(status).not.toBeNull();
    expect(status!.target).toBeGreaterThan(0);
  });
});

describe("requestService.convertToMatter", () => {
  it("can convert straight from triage (Submitted) — a deliberate action", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const res = svc.convertToMatter(created.value.id, AD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Converted to Matter");
  });

  it("links a matter and records the conversion (Module 2 not built)", () => {
    const created = svc.create(intake(), REQUESTER);
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;
    svc.applyTriage(id, { legalCategory: "Contract Review — Standard", priority: "Medium", assignedLawyerId: ASSOC }, AD);
    svc.transition(id, "In Progress", ASSOC);
    const res = svc.convertToMatter(id, ASSOC);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("Converted to Matter");
    expect(res.value.matterId).toMatch(/^MAT-/);
    expect(repos.audit.list(id).some((e) => e.action === "request.converted_to_matter")).toBe(true);
  });
});
