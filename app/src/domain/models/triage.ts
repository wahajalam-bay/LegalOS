import type { RequestId, UserId } from "./ids";
import type { LegalCategory, Priority } from "./enums";
import type { IsoTimestamp } from "./request";

/** The system's suggested categorisation for a submitted request (§3.4). */
export interface TriageRecommendation {
  readonly requestId: RequestId;
  readonly legalCategory: LegalCategory;
  readonly priority: Priority;
  readonly suggestedLawyerId: UserId | null;
  readonly slaBusinessDays: number | null;
  readonly rationale: string;
}

/** A lawyer's accept/override decision — every override carries a reason (logged). */
export interface TriageDecision {
  readonly requestId: RequestId;
  readonly decidedBy: UserId;
  readonly decidedAt: IsoTimestamp;
  readonly accepted: boolean;
  readonly legalCategory: LegalCategory;
  readonly priority: Priority;
  readonly assignedLawyerId: UserId | null;
  readonly overrideReason: string | null;
}
