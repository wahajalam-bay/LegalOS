import type { RequestStatus } from "./models/enums";

/** Allowed status transitions (PRD §3.5). Any move not listed is rejected. */
export const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  Submitted: ["Categorised"],
  Categorised: ["Assigned"],
  Assigned: ["In Progress"],
  "In Progress": ["Awaiting Requester", "Awaiting Approval", "Delivered", "Converted to Matter"],
  "Awaiting Requester": ["In Progress"],
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
