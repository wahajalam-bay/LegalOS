import type { Role, RequestStatus } from "@/domain/models/enums";
import type { User } from "@/domain/models/user";
import type { Request, RequesterVisibleRequest } from "@/domain/models/request";
import { canTransition, nextStatuses } from "@/domain/lifecycle";

export const PERMISSIONS = [
  "request.create",
  "request.viewOwn",
  "request.viewTeam",
  "request.viewAll",
  "request.triage",
  "request.assign",
  "request.editCategory",
  "request.changeStatus",
  "request.convertToMatter",
  "request.approve",
  "request.viewInternal",
  "request.configureSLA",
  "request.export",
  "task.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Role → granted permissions (PRD §2 / §7.3). Enforced centrally, not by hiding UI. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  director: [...PERMISSIONS],
  adSeniorManager: [
    "request.create", "request.viewTeam", "request.viewAll", "request.triage", "request.assign",
    "request.editCategory", "request.changeStatus", "request.convertToMatter", "request.approve",
    "request.viewInternal", "task.manage",
  ],
  managerAM: [
    "request.create", "request.viewTeam", "request.assign", "request.editCategory",
    "request.changeStatus", "request.convertToMatter", "request.approve", "request.viewInternal", "task.manage",
  ],
  seniorAssociate: [
    "request.create", "request.viewTeam", "request.changeStatus", "request.viewInternal", "task.manage",
  ],
  // Paralegal: task execution + registers; no triage/assign/approval; restricted
  // from privileged/internal content by default.
  paralegal: ["request.create", "request.viewTeam", "request.changeStatus", "task.manage"],
  requester: ["request.create", "request.viewOwn"],
};

export const isLegalRole = (role: Role): boolean => role !== "requester";

export function can(user: User, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

/**
 * Which permission a transition into a given status requires. Centralised so no
 * role/transition rule is scattered across components or services (PRD §3.5).
 */
const TRANSITION_PERMISSION: Record<RequestStatus, Permission> = {
  Submitted: "request.changeStatus",       // resume back to the triage queue
  Categorised: "request.triage",
  Assigned: "request.triage",
  "In Progress": "request.changeStatus",
  "Awaiting Requester": "request.changeStatus",
  "Awaiting Approval": "request.changeStatus",
  Delivered: "request.changeStatus",
  Closed: "request.changeStatus",
  "Converted to Matter": "request.convertToMatter",
};

export function permissionForTransition(to: RequestStatus): Permission {
  return TRANSITION_PERMISSION[to] ?? "request.changeStatus";
}

/** A transition is allowed only if the lifecycle permits it AND the role may perform it. */
export function canPerformTransition(user: User, from: RequestStatus, to: RequestStatus): boolean {
  if (!canTransition(from, to)) return false;
  // Signing off an approval (Awaiting Approval → Delivered) needs approval authority;
  // delivering directly from In Progress only needs changeStatus.
  if (from === "Awaiting Approval" && to === "Delivered") return can(user, "request.approve");
  return can(user, permissionForTransition(to));
}

/** The next statuses THIS user is allowed to move a request to. */
export function allowedTransitionsFor(user: User, from: RequestStatus): RequestStatus[] {
  return nextStatuses(from).filter((to) => canPerformTransition(user, from, to));
}

/** Row-level read access to a specific request. */
export function canViewRequest(user: User, req: Pick<Request, "requesterId">): boolean {
  if (can(user, "request.viewAll")) return true;
  if (can(user, "request.viewTeam") && isLegalRole(user.role)) return true;
  if (can(user, "request.viewOwn") && req.requesterId === user.id) return true;
  return false;
}

/** Whether the viewer may see internal-only content (comments, triage/risk notes). */
export function canViewInternal(user: User, _req: Pick<Request, "requesterId">): boolean {
  return can(user, "request.viewInternal");
}

/** Strip all internal-only content — the requester-safe projection. */
export function stripInternal(req: Request): RequesterVisibleRequest {
  const clone: Record<string, unknown> = { ...req };
  delete clone.internal;
  return clone as unknown as RequesterVisibleRequest;
}

/**
 * Project a request for a specific viewer: full record for privileged legal
 * roles, internal-stripped for everyone else. Returns null if not viewable.
 */
export function projectForViewer(user: User, req: Request): Request | RequesterVisibleRequest | null {
  if (!canViewRequest(user, req)) return null;
  return canViewInternal(user, req) ? req : stripInternal(req);
}
