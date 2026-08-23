import type {
  Request, RequestComment, RequestStatusHistory, PausePeriod,
} from "@/domain/models/request";
import type { LegalCategory, Priority, RequestStatus, BusinessUrgency } from "@/domain/models/enums";
import type { MatterId, RequestId, UserId, CommentId, AttachmentId } from "@/domain/models/ids";
import { brandId, childId, nextRequestId } from "@/domain/models/ids";
import { legalCategoryFor } from "@/domain/categories";
import { conditionalFieldsFor } from "@/domain/intake";
import type { RequestAttachment } from "@/domain/models/request";
import { canTransition } from "@/domain/lifecycle";
import { calendarFor } from "@/lib/businessCalendar";
import { computeDueDate } from "./slaEngine";
import type { Clock } from "@/lib/clock";
import type { Repositories } from "@/data/repository";
import type { NewRequestInput } from "@/lib/validation";
import { validateNewRequest } from "@/lib/validation";
import { recordAudit } from "./auditService";
import type { Notifier } from "./notificationService";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";

const URGENCY_PRIORITY: Record<BusinessUrgency, Priority> = {
  Emergency: "Urgent", "Time-critical": "High", Important: "Medium", Routine: "Low",
};

export interface RequestServiceDeps {
  readonly repos: Repositories;
  readonly clock: Clock;
  readonly notifier: Notifier;
}

export interface TriageInput {
  readonly legalCategory: LegalCategory;
  readonly priority: Priority;
  readonly assignedLawyerId: UserId;
  readonly overrideReason?: string | null;
}

export function createRequestService({ repos, clock, notifier }: RequestServiceDeps) {
  const nowIso = () => clock().toISOString();

  function recomputeSla(req: Request, at: Date): { slaConfigId: string | null; slaDueDate: string | null } {
    const cfg = repos.sla.find(req.legalCategory, req.priority, req.jurisdiction);
    if (!cfg) return { slaConfigId: null, slaDueDate: null };
    const due = computeDueDate(calendarFor(req.jurisdiction), req.submittedAt, cfg.businessDays, req.pausePeriods, at);
    return { slaConfigId: cfg.id, slaDueDate: due.toISOString() };
  }

  function isNeedByTight(input: NewRequestInput, category: LegalCategory, priority: Priority): boolean {
    if (!input.neededByDate) return false;
    const cfg = repos.sla.find(category, priority, input.jurisdiction);
    if (!cfg) return false;
    const now = clock();
    const due = computeDueDate(calendarFor(input.jurisdiction), now.toISOString(), cfg.businessDays, [], now);
    return new Date(input.neededByDate) < due;
  }

  return {
    isNeedByTight,

    /** Convenience for the intake UI: is the needed-by date tighter than SLA? */
    previewTight(input: NewRequestInput): boolean {
      if (!input.requesterCategory) return false;
      const category = legalCategoryFor(input.requesterCategory);
      const priority = URGENCY_PRIORITY[input.businessUrgency];
      return isNeedByTight(input, category, priority);
    },

    /** Create a request from the plain-language intake (status: Submitted). */
    create(input: NewRequestInput, requesterId: UserId): Result<Request> {
      const requester = repos.users.get(requesterId);
      if (!requester) return err("unknown requester");
      if (!input.requesterCategory) return err("a request type is required");
      const category = legalCategoryFor(input.requesterCategory);
      const priority = URGENCY_PRIORITY[input.businessUrgency];
      const tight = isNeedByTight(input, category, priority);
      const problems = validateNewRequest(input, { requiresJustification: tight });
      if (problems.length) return err(problems.map((p) => p.message).join(" "));

      const now = clock();
      const at = now.toISOString();
      const id = nextRequestId(repos.requests.allIds(), now.getUTCFullYear());
      const history: RequestStatusHistory = { id: childId(id, "SH", 1), from: null, to: "Submitted", at, by: requesterId };

      // Keep only the answers relevant to the chosen type (drop stale values left
      // behind if the requester switched request type mid-form).
      const relevant = new Set(conditionalFieldsFor(input.requesterCategory).map((f) => f.key));
      const intakeDetails: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.intakeDetails ?? {})) {
        if (relevant.has(k) && v.trim() !== "") intakeDetails[k] = v.trim();
      }
      const attachments: RequestAttachment[] = (input.attachments ?? []).map((a, i) => ({
        id: childId(id, "ATT", i + 1) as AttachmentId,
        name: a.name, sizeBytes: a.sizeBytes, contentType: a.contentType,
        uploadedBy: requesterId, uploadedAt: at,
      }));

      let req: Request = {
        id,
        requesterId, requesterEmail: requester.email, requesterEmployeeId: requester.employeeId,
        departmentId: requester.departmentId, jurisdiction: input.jurisdiction,
        requesterCategory: input.requesterCategory,
        description: input.description.trim(), businessContext: input.businessContext.trim(),
        businessUrgency: input.businessUrgency, neededByDate: input.neededByDate,
        neededByJustification: tight ? (input.neededByJustification?.trim() ?? null) : null,
        intakeDetails,
        attachments,
        legalCategory: category, priority, slaConfigId: null, slaDueDate: null, assignment: null,
        status: "Submitted", pausePeriods: [], matterId: null,
        statusHistory: [history], submittedAt: at, createdAt: at, updatedAt: at,
        internal: { comments: [], triageNotes: null, riskNote: null },
      };
      const sla = recomputeSla(req, now);
      req = { ...req, ...sla };

      repos.requests.add(req);
      recordAudit(repos.audit, { actorId: requesterId, action: "request.created", entityId: id, newValue: category }, at);
      const legalDept = repos.departments.list().find((d) => d.isLegal);
      notifier.notify({ kind: "request.submitted", recipientDepartmentId: legalDept?.id ?? null, entityId: id,
        title: `New request ${id}`, body: `${requester.name} raised a ${input.requesterCategory} request.` }, at);
      return ok(req);
    },

    /** Categorise, prioritise and assign (triage). */
    applyTriage(requestId: RequestId, input: TriageInput, actorId: UserId): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      const now = clock();
      const at = now.toISOString();
      const changes: string[] = [];

      const updated = repos.requests.update(requestId, (r) => {
        const history = [...r.statusHistory];
        if (r.status === "Submitted") {
          history.push({ id: childId(r.id, "SH", history.length + 1), from: "Submitted", to: "Categorised", at, by: actorId });
          history.push({ id: childId(r.id, "SH", history.length + 1), from: "Categorised", to: "Assigned", at, by: actorId });
        }
        let next: Request = {
          ...r,
          legalCategory: input.legalCategory,
          priority: input.priority,
          assignment: { lawyerId: input.assignedLawyerId, assignedBy: actorId, assignedAt: at },
          status: r.status === "Submitted" ? "Assigned" : r.status,
          statusHistory: history, updatedAt: at,
        };
        next = { ...next, ...recomputeSla(next, now) };
        return next;
      })!;

      if (current.legalCategory !== input.legalCategory) {
        recordAudit(repos.audit, { actorId, action: "request.category_changed", entityId: requestId, previousValue: current.legalCategory, newValue: input.legalCategory, reason: input.overrideReason ?? null }, at);
        changes.push("category");
      }
      if (current.priority !== input.priority) {
        recordAudit(repos.audit, { actorId, action: "request.priority_changed", entityId: requestId, previousValue: current.priority, newValue: input.priority }, at);
      }
      recordAudit(repos.audit, { actorId, action: "request.sla_changed", entityId: requestId, previousValue: current.slaDueDate, newValue: updated.slaDueDate }, at);
      recordAudit(repos.audit, { actorId, action: "request.assignee_changed", entityId: requestId, previousValue: current.assignment?.lawyerId ?? null, newValue: input.assignedLawyerId }, at);
      if (current.status !== updated.status) {
        recordAudit(repos.audit, { actorId, action: "request.status_changed", entityId: requestId, previousValue: current.status, newValue: updated.status }, at);
      }
      notifier.notify({ kind: "request.assigned", recipientUserId: input.assignedLawyerId, entityId: requestId,
        title: `Assigned ${requestId}`, body: `You are the owner of ${requestId} (${input.legalCategory}).` }, at);
      return ok(updated);
    },

    /** Move to another lifecycle status (pauses/resumes the clock as needed). */
    transition(requestId: RequestId, to: RequestStatus, actorId: UserId, reason?: string): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      const from = current.status;
      if (!canTransition(from, to)) return err(`cannot move from "${from}" to "${to}"`);
      const now = clock();
      const at = now.toISOString();

      const updated = repos.requests.update(requestId, (r) => {
        let pauses: PausePeriod[] = [...r.pausePeriods];
        if (to === "Awaiting Requester") {
          pauses = [...pauses, { reason: reason ?? "Awaiting requester", start: at, end: null }];
        } else if (from === "Awaiting Requester") {
          pauses = pauses.map((p) => (p.end === null ? { ...p, end: at } : p));
        }
        const history: RequestStatusHistory[] = [...r.statusHistory, { id: childId<"StatusHistoryId">(r.id, "SH", r.statusHistory.length + 1), from, to, at, by: actorId, ...(reason ? { reason } : {}) }];
        let next: Request = { ...r, status: to, pausePeriods: pauses, statusHistory: history, updatedAt: at };
        next = { ...next, ...recomputeSla(next, now) };
        return next;
      })!;

      recordAudit(repos.audit, { actorId, action: "request.status_changed", entityId: requestId, previousValue: from, newValue: to, reason: reason ?? null }, at);
      if (to === "Delivered") recordAudit(repos.audit, { actorId, action: "request.delivered", entityId: requestId }, at);
      if (to === "Closed") recordAudit(repos.audit, { actorId, action: "request.closed", entityId: requestId }, at);
      if (to === "Awaiting Requester") notifier.notify({ kind: "request.awaiting_requester", recipientUserId: current.requesterId, entityId: requestId, title: `Action needed on ${requestId}`, body: "Legal needs something from you to proceed." }, at);
      return ok(updated);
    },

    /** Post a comment; internal comments are never shown to the requester. */
    addComment(requestId: RequestId, body: string, internal: boolean, actorId: UserId): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      if (!body.trim()) return err("comment cannot be empty");
      const at = nowIso();
      const comment: RequestComment = {
        id: childId(current.id, "CMT", current.internal.comments.length + 1) as CommentId,
        authorId: actorId, body: body.trim(), at, internal,
      };
      const updated = repos.requests.update(requestId, (r) => ({
        ...r, updatedAt: at, internal: { ...r.internal, comments: [...r.internal.comments, comment] },
      }))!;
      recordAudit(repos.audit, { actorId, action: internal ? "request.edited" : "request.requester_contacted", entityId: requestId, newValue: internal ? "internal note" : "requester contacted" }, at);
      return ok(updated);
    },

    /** Create the forward link to a Matter (Module 2 owns the matter itself). */
    convertToMatter(requestId: RequestId, actorId: UserId): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      if (!canTransition(current.status, "Converted to Matter")) return err(`cannot convert from "${current.status}"`);
      const at = nowIso();
      const matterId = brandId<"MatterId">(`MAT-${current.id.replace("REQ-", "")}`) as MatterId;
      const updated = repos.requests.update(requestId, (r) => ({
        ...r, matterId, status: "Converted to Matter", updatedAt: at,
        statusHistory: [...r.statusHistory, { id: childId(r.id, "SH", r.statusHistory.length + 1), from: r.status, to: "Converted to Matter", at, by: actorId }],
      }))!;
      recordAudit(repos.audit, { actorId, action: "request.converted_to_matter", entityId: requestId, newValue: matterId }, at);
      return ok(updated);
    },
  };
}

export type RequestService = ReturnType<typeof createRequestService>;
