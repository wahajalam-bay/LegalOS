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
import { canPerformTransition } from "@/permissions/permissions";
import { calendarFor } from "@/lib/businessCalendar";
import { computeDueDate, computeSlaStatus, type SlaStatus } from "./slaEngine";
import { DEFAULT_ESCALATION, escalationLevelFor, isHigher, resolveEscalationRecipients, type EscalationConfig, type EscalationLevel } from "@/domain/escalation";
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
  /** Kept for back-compat; used as the category-change reason when set. */
  readonly overrideReason?: string | null;
  readonly categoryReason?: string | null;
  readonly priorityReason?: string | null;
  readonly assigneeReason?: string | null;
  /** Manual SLA due-date override (ISO). When set, replaces the calculated date. */
  readonly slaDueDateOverride?: string | null;
  readonly slaReason?: string | null;
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

      const overrode = input.slaDueDateOverride != null && input.slaDueDateOverride !== "";
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
        if (overrode) next = { ...next, slaDueDate: input.slaDueDateOverride!, slaOverridden: true };
        else next = { ...next, slaOverridden: false };
        return next;
      })!;

      const categoryReason = input.categoryReason ?? input.overrideReason ?? null;
      if (current.legalCategory !== input.legalCategory) {
        recordAudit(repos.audit, { actorId, action: "request.category_changed", entityId: requestId, previousValue: current.legalCategory, newValue: input.legalCategory, reason: categoryReason }, at);
        changes.push("category");
      }
      if (current.priority !== input.priority) {
        recordAudit(repos.audit, { actorId, action: "request.priority_changed", entityId: requestId, previousValue: current.priority, newValue: input.priority, reason: input.priorityReason ?? null }, at);
      }
      recordAudit(repos.audit, { actorId, action: "request.sla_changed", entityId: requestId, previousValue: current.slaDueDate, newValue: updated.slaDueDate, reason: overrode ? (input.slaReason ?? null) : null }, at);
      if ((current.assignment?.lawyerId ?? null) !== input.assignedLawyerId) {
        recordAudit(repos.audit, { actorId, action: "request.assignee_changed", entityId: requestId, previousValue: current.assignment?.lawyerId ?? null, newValue: input.assignedLawyerId, reason: input.assigneeReason ?? null }, at);
      }
      if (current.status !== updated.status) {
        recordAudit(repos.audit, { actorId, action: "request.status_changed", entityId: requestId, previousValue: current.status, newValue: updated.status }, at);
      }
      notifier.notify({ kind: "request.assigned", recipientUserId: input.assignedLawyerId, entityId: requestId,
        title: `Assigned ${requestId}`, body: `You are the owner of ${requestId} (${input.legalCategory}).` }, at);
      return ok(updated);
    },

    /** SLA target + due date for a hypothetical category/priority (triage preview). */
    previewSla(req: Request, category: LegalCategory, priority: Priority): { businessDays: number | null; dueDate: string | null } {
      const cfg = repos.sla.find(category, priority, req.jurisdiction);
      if (!cfg) return { businessDays: null, dueDate: null };
      const due = computeDueDate(calendarFor(req.jurisdiction), req.submittedAt, cfg.businessDays, req.pausePeriods, clock());
      return { businessDays: cfg.businessDays, dueDate: due.toISOString() };
    },

    /** Full SLA/TAT status for a request (business-day based). Null if not yet triaged. */
    slaStatusFor(req: Request, now: Date = clock()): SlaStatus | null {
      const cfg = repos.sla.find(req.legalCategory, req.priority, req.jurisdiction);
      if (!cfg) return null;
      return computeSlaStatus(calendarFor(req.jurisdiction), req.submittedAt, cfg.businessDays, req.pausePeriods, now);
    },

    /**
     * Evaluate SLA thresholds across active requests and emit escalation
     * notifications when a request crosses a new level. Idempotent per level
     * (stores the highest level already notified). Returns the count emitted.
     */
    runSlaChecks(config: EscalationConfig = DEFAULT_ESCALATION): number {
      const now = clock();
      const at = now.toISOString();
      const users = repos.users.list();
      let emitted = 0;
      for (const req of repos.requests.list()) {
        if (req.status === "Delivered" || req.status === "Closed" || req.status === "Converted to Matter") continue;
        if (req.pausePeriods.some((p) => p.end === null)) continue; // clock paused — not consuming
        const cfg = repos.sla.find(req.legalCategory, req.priority, req.jurisdiction);
        if (!cfg) continue;
        const status = computeSlaStatus(calendarFor(req.jurisdiction), req.submittedAt, cfg.businessDays, req.pausePeriods, now);
        const level: EscalationLevel = escalationLevelFor(status, config);
        if (level === "none" || !isHigher(level, req.escalationLevel)) continue;
        const recipients = resolveEscalationRecipients(req, users, level);
        const kind = level === "breach" ? "sla.breached" : "sla.near_breach";
        const title = level === "breach" ? `SLA breached — ${req.id}` : `SLA at risk — ${req.id}`;
        const body = level === "breach"
          ? `${req.id} has breached its SLA (due ${status.dueDate.toLocaleDateString()}).`
          : `${req.id} has consumed ${Math.round((status.consumedBusinessDays / status.target) * 100)}% of its SLA.`;
        for (const uid of recipients) { notifier.notify({ kind, recipientUserId: uid, entityId: req.id, title, body }, at); emitted++; }
        repos.requests.update(req.id, (r) => ({ ...r, escalationLevel: level }));
      }
      return emitted;
    },

    /** Triage action: send an untriaged request back to the requester for more info. */
    requestMoreInfo(requestId: RequestId, message: string, actorId: UserId): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      const now = clock();
      const at = now.toISOString();
      const from = current.status;
      const updated = repos.requests.update(requestId, (r) => {
        const pauses: PausePeriod[] = [...r.pausePeriods, { reason: "Awaiting requester information", start: at, end: null }];
        const history: RequestStatusHistory[] = [...r.statusHistory, { id: childId<"StatusHistoryId">(r.id, "SH", r.statusHistory.length + 1), from, to: "Awaiting Requester", at, by: actorId, reason: "More information requested" }];
        const comments = message.trim()
          ? [...r.internal.comments, { id: childId(r.id, "CMT", r.internal.comments.length + 1) as CommentId, authorId: actorId, body: message.trim(), at, internal: false }]
          : r.internal.comments;
        return { ...r, status: "Awaiting Requester", pausePeriods: pauses, statusHistory: history, updatedAt: at, internal: { ...r.internal, comments } };
      })!;
      recordAudit(repos.audit, { actorId, action: "request.status_changed", entityId: requestId, previousValue: from, newValue: "Awaiting Requester", reason: "More information requested" }, at);
      recordAudit(repos.audit, { actorId, action: "request.requester_contacted", entityId: requestId, newValue: "information requested" }, at);
      notifier.notify({ kind: "request.awaiting_requester", recipientUserId: current.requesterId, entityId: requestId, title: `More information needed on ${requestId}`, body: message.trim() || "Legal needs more information to proceed." }, at);
      return ok(updated);
    },

    /** Move to another lifecycle status (pauses/resumes the clock as needed). */
    transition(requestId: RequestId, to: RequestStatus, actorId: UserId, reason?: string): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      const from = current.status;
      if (!canTransition(from, to)) return err(`cannot move from "${from}" to "${to}"`);
      const actor = repos.users.get(actorId);
      if (!actor || !canPerformTransition(actor, from, to)) return err(`your role cannot move a request to "${to}"`);
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
      else if (to === "Delivered") notifier.notify({ kind: "request.delivered", recipientUserId: current.requesterId, entityId: requestId, title: `${requestId} delivered`, body: "Legal has delivered your request. You can review the outcome now." }, at);
      else if (to === "Closed") notifier.notify({ kind: "request.closed", recipientUserId: current.requesterId, entityId: requestId, title: `${requestId} closed`, body: "Your request has been closed." }, at);
      else notifier.notify({ kind: "request.status_changed", recipientUserId: current.requesterId, entityId: requestId, title: `${requestId} — ${to}`, body: `Your request moved to "${to}".` }, at);
      return ok(updated);
    },

    /** Post a comment; internal comments are never shown to the requester. */
    addComment(requestId: RequestId, body: string, internal: boolean, actorId: UserId): Result<Request> {
      const current = repos.requests.get(requestId);
      if (!current) return err("request not found");
      if (!body.trim()) return err("comment cannot be empty");
      const at = nowIso();
      const actor = repos.users.get(actorId);
      // A requester replying while the clock is paused resumes it (TAT resumes on response).
      const isRequesterResponse = actor?.role === "requester" && actorId === current.requesterId && current.status === "Awaiting Requester";
      const comment: RequestComment = {
        id: childId(current.id, "CMT", current.internal.comments.length + 1) as CommentId,
        authorId: actorId, body: body.trim(), at, internal,
      };
      const updated = repos.requests.update(requestId, (r) => {
        const withComment: Request = { ...r, updatedAt: at, internal: { ...r.internal, comments: [...r.internal.comments, comment] } };
        if (!isRequesterResponse) return withComment;
        const pausePeriods = withComment.pausePeriods.map((p) => (p.end === null ? { ...p, end: at } : p));
        const statusHistory = [...withComment.statusHistory, { id: childId<"StatusHistoryId">(r.id, "SH", withComment.statusHistory.length + 1), from: r.status, to: "In Progress" as RequestStatus, at, by: actorId, reason: "Requester responded" }];
        let resumed: Request = { ...withComment, status: "In Progress", pausePeriods, statusHistory };
        resumed = { ...resumed, ...recomputeSla(resumed, clock()) };
        return resumed;
      })!;
      recordAudit(repos.audit, { actorId, action: internal ? "request.edited" : "request.requester_contacted", entityId: requestId, newValue: internal ? "internal note" : "requester contacted" }, at);
      if (isRequesterResponse) {
        recordAudit(repos.audit, { actorId, action: "request.requester_responded", entityId: requestId }, at);
        recordAudit(repos.audit, { actorId, action: "request.status_changed", entityId: requestId, previousValue: "Awaiting Requester", newValue: "In Progress", reason: "Requester responded" }, at);
        if (current.assignment) notifier.notify({ kind: "request.responded", recipientUserId: current.assignment.lawyerId, entityId: requestId, title: `Response on ${requestId}`, body: `${actor?.name ?? "The requester"} replied — the request is back In Progress.` }, at);
      }
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
