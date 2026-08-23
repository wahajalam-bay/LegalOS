import type { AuditAction, AuditEvent } from "@/domain/models/audit";
import type { UserId } from "@/domain/models/ids";
import { childId } from "@/domain/models/ids";
import type { AuditRepository } from "@/data/repository";

export interface AuditInput {
  readonly actorId: UserId;
  readonly action: AuditAction;
  readonly entityId: string;
  readonly previousValue?: string | null;
  readonly newValue?: string | null;
  readonly reason?: string | null;
}

/** Append an immutable audit event. Ids are deterministic per entity. */
export function recordAudit(repo: AuditRepository, input: AuditInput, at: string): AuditEvent {
  const seq = repo.list(input.entityId).length + 1;
  const event: AuditEvent = {
    id: childId(input.entityId, "AUD", seq),
    actorId: input.actorId,
    at,
    action: input.action,
    entityType: "request",
    entityId: input.entityId,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason ?? null,
  };
  repo.add(event);
  return event;
}
