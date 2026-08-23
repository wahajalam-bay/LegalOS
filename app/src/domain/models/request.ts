import type {
  AttachmentId, CommentId, DepartmentId, MatterId, RequestId, StatusHistoryId, UserId,
} from "./ids";
import type {
  BusinessUrgency, Jurisdiction, LegalCategory, Priority, RequestStatus,
} from "./enums";
import type { RequesterCategoryKey } from "../categories";

/** ISO-8601 timestamp string (e.g. 2026-08-23T09:00:00.000Z). */
export type IsoTimestamp = string;

export interface RequestAttachment {
  readonly id: AttachmentId;
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly contentType: string | null;
  readonly uploadedBy: UserId;
  readonly uploadedAt: IsoTimestamp;
}

export interface RequestStatusHistory {
  readonly id: StatusHistoryId;
  readonly from: RequestStatus | null;
  readonly to: RequestStatus;
  readonly at: IsoTimestamp;
  readonly by: UserId;
  readonly reason?: string;
}

export interface RequestAssignment {
  readonly lawyerId: UserId;
  readonly assignedBy: UserId;
  readonly assignedAt: IsoTimestamp;
}

export interface RequestComment {
  readonly id: CommentId;
  readonly authorId: UserId;
  readonly body: string;
  readonly at: IsoTimestamp;
  /** Internal legal note — never exposed to the requester (§ security foundation). */
  readonly internal: boolean;
}

/** A window during which the SLA clock is paused (e.g. Awaiting Requester). */
export interface PausePeriod {
  readonly reason: string;
  readonly start: IsoTimestamp;
  /** null while still paused. */
  readonly end: IsoTimestamp | null;
}

/**
 * The core Request record (PRD §3). Internal-only fields are grouped under
 * `internal` so the permission/serialisation layer can strip them for requesters.
 */
export interface Request {
  readonly id: RequestId;

  // Who / where from
  readonly requesterId: UserId;
  readonly requesterEmail: string;
  readonly requesterEmployeeId: string;
  readonly departmentId: DepartmentId;
  readonly jurisdiction: Jurisdiction;

  // Plain-language intake (requester-facing)
  readonly requesterCategory: RequesterCategoryKey;
  readonly description: string;
  readonly businessContext: string;
  readonly businessUrgency: BusinessUrgency;
  readonly neededByDate: IsoTimestamp | null;
  readonly neededByJustification: string | null;
  /** Answers to the type-specific conditional questions, keyed by intake field key. */
  readonly intakeDetails: Readonly<Record<string, string>>;
  readonly attachments: readonly RequestAttachment[];

  // Legal-assigned (triage)
  readonly legalCategory: LegalCategory;
  readonly priority: Priority;
  readonly slaConfigId: string | null;
  readonly slaDueDate: IsoTimestamp | null;
  readonly assignment: RequestAssignment | null;

  // Lifecycle + clock
  readonly status: RequestStatus;
  readonly pausePeriods: readonly PausePeriod[];

  // Relationships
  readonly matterId: MatterId | null; // set on "Converted to Matter"; Module 2 owns the matter itself

  // Timeline
  readonly statusHistory: readonly RequestStatusHistory[];
  readonly submittedAt: IsoTimestamp;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;

  // Internal-only (stripped from the requester view by the permission layer)
  readonly internal: RequestInternal;
}

export interface RequestInternal {
  readonly comments: readonly RequestComment[];
  readonly triageNotes: string | null;
  /** Free-form internal risk note — distinct from Module 2 risk rating. */
  readonly riskNote: string | null;
}

/** The requester-safe projection of a Request (no internal content). */
export type RequesterVisibleRequest = Omit<Request, "internal">;
