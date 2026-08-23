import type { RequestStatus } from "./models/enums";

/** Allowed status transitions (PRD §3.5). Any move not listed is rejected. */
export const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  // Triage can also send an untriaged request back to the requester for more
  // information, or convert it straight to a matter (a deliberate human action).
  Submitted: ["Categorised", "Awaiting Requester", "Converted to Matter"],
  Categorised: ["Assigned"],
  Assigned: ["In Progress", "Converted to Matter"],
  "In Progress": ["Awaiting Requester", "Awaiting Approval", "Delivered", "Converted to Matter"],
  // A request awaiting requester info returns to the triage queue once answered.
  "Awaiting Requester": ["In Progress", "Submitted"],
  "Awaiting Approval": ["In Progress", "Delivered"],
  Delivered: ["Closed"],
  Closed: [],
  "Converted to Matter": ["Closed"],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: RequestStatus): readonly RequestStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}
