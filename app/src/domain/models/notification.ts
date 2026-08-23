import type { NotificationId, UserId } from "./ids";
import type { IsoTimestamp } from "./request";

export const NOTIFICATION_KINDS = [
  "request.submitted",
  "request.assigned",
  "request.status_changed",
  "request.awaiting_requester",
  "request.responded",
  "request.delivered",
  "request.closed",
  "sla.near_breach",
  "sla.breached",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  readonly id: NotificationId;
  readonly kind: NotificationKind;
  /** The recipient — a user, or a department queue. */
  readonly recipientUserId: UserId | null;
  readonly recipientDepartmentId: string | null;
  readonly title: string;
  readonly body: string;
  readonly entityId: string;
  readonly createdAt: IsoTimestamp;
  readonly read: boolean;
}
