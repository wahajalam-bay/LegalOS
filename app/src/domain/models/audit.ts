import type { AuditEventId, UserId } from "./ids";
import type { IsoTimestamp } from "./request";

/** The auditable actions on a request (PRD Audit section). */
export const AUDIT_ACTIONS = [
  "request.created",
  "request.edited",
  "request.category_changed",
  "request.priority_changed",
  "request.sla_changed",
  "request.assignee_changed",
  "request.status_changed",
  "request.requester_contacted",
  "request.requester_responded",
  "request.attachment_added",
  "request.attachment_removed",
  "request.converted_to_matter",
  "request.delivered",
  "request.closed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly actorId: UserId;
  readonly at: IsoTimestamp;
  readonly action: AuditAction;
  /** Entity type + id the event concerns, e.g. { type:"request", id:"REQ-2026-00001" }. */
  readonly entityType: "request";
  readonly entityId: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly reason: string | null;
}
