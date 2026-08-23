import { describe, it, expect, beforeEach } from "vitest";
import { createLocalRepositories } from "@/data/localRepository";
import type { Repositories } from "@/data/repository";
import { createRequestService, type RequestService } from "@/services/requestService";
import { createRepoNotifier } from "@/services/notificationService";
import { fixedClock } from "@/lib/clock";
import { brandId, type UserId } from "@/domain/models/ids";
import type { NewRequestInput } from "@/lib/validation";

const REQ = brandId<"UserId">("USR-REQ") as UserId;
const AD = brandId<"UserId">("USR-AD") as UserId;
const ASSOC = brandId<"UserId">("USR-ASSOC") as UserId;

const intake: NewRequestInput = {
  requesterCategory: "agreement",
  description: "Sign a services agreement with a new supplier",
  businessContext: "New SaaS vendor for marketing; their paper; sign before month end.",
  businessUrgency: "Important",
  neededByDate: null, neededByJustification: null, jurisdiction: "PK",
  intakeDetails: { counterpartyName: "Acme Cloud Ltd", paper: "Counterparty paper" },
  attachments: [{ name: "msa.pdf", sizeBytes: 1200, contentType: "application/pdf" }],
};

let repos: Repositories;
let svc: RequestService;
beforeEach(() => {
  repos = createLocalRepositories({ persist: false });
  svc = createRequestService({ repos, clock: fixedClock("2026-01-05T09:00:00.000Z"), notifier: createRepoNotifier(repos.notifications) });
});

describe("end-to-end request journey", () => {
  it("runs requester → triage → lawyer → delivery → close with correct state, audit and notifications", () => {
    // REQUESTER submits
    const created = svc.create(intake, REQ);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    expect(id).toMatch(/^REQ-2026-\d{5}$/);
    expect(created.value.status).toBe("Submitted");
    expect(created.value.attachments).toHaveLength(1);
    expect(created.value.intakeDetails.counterpartyName).toBe("Acme Cloud Ltd");

    // LEGAL triages (accept proposal + assign)
    const triaged = svc.applyTriage(id, {
      legalCategory: created.value.legalCategory, priority: created.value.priority, assignedLawyerId: ASSOC,
    }, AD);
    expect(triaged.ok && triaged.value.status).toBe("Assigned");
    expect(triaged.ok && triaged.value.assignment?.lawyerId).toBe(ASSOC);

    // LAWYER works it, needs info, requester responds (TAT resumes)
    expect(svc.transition(id, "In Progress", ASSOC).ok).toBe(true);
    const paused = svc.transition(id, "Awaiting Requester", ASSOC, "Need the signed NDA");
    expect(paused.ok && paused.value.pausePeriods[0].end).toBeNull();
    const resumed = svc.addComment(id, "Attached the signed NDA.", false, REQ);
    expect(resumed.ok && resumed.value.status).toBe("In Progress");
    expect(resumed.ok && resumed.value.pausePeriods[0].end).not.toBeNull();

    // LAWYER delivers, then closes
    expect(svc.transition(id, "Delivered", ASSOC).ok).toBe(true);
    const closed = svc.transition(id, "Closed", ASSOC);
    expect(closed.ok && closed.value.status).toBe("Closed");

    // AUDIT: the important events are all recorded
    const actions = repos.audit.list(id).map((e) => e.action);
    for (const a of ["request.created", "request.assignee_changed", "request.status_changed", "request.requester_responded", "request.delivered", "request.closed"]) {
      expect(actions).toContain(a);
    }

    // NOTIFICATIONS reach the requester on delivery + closure
    const kinds = repos.notifications.list().map((n) => n.kind);
    expect(kinds).toContain("request.delivered");
    expect(kinds).toContain("request.closed");

    // DATA INTEGRITY: ids unique, timestamps ordered, single request in store
    const all = repos.requests.list();
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    const hist = closed.ok ? closed.value.statusHistory : [];
    for (let i = 1; i < hist.length; i++) expect(hist[i].at >= hist[i - 1].at).toBe(true);
  });

  it("does not auto-convert requests to matters (conversion is deliberate)", () => {
    const created = svc.create(intake, REQ);
    if (!created.ok) return;
    svc.applyTriage(created.value.id, { legalCategory: created.value.legalCategory, priority: "Medium", assignedLawyerId: ASSOC }, AD);
    svc.transition(created.value.id, "In Progress", ASSOC);
    svc.transition(created.value.id, "Delivered", ASSOC);
    // Delivered is terminal-ish; the request was never silently converted.
    expect(repos.requests.get(created.value.id)!.matterId).toBeNull();
  });
});
