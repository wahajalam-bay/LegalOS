import type { Notification, NotificationKind } from "@/domain/models/notification";
import type { NotificationId, UserId } from "@/domain/models/ids";
import { childId } from "@/domain/models/ids";
import type { NotificationRepository } from "@/data/repository";

/** Abstraction so notifications can later be email/push without touching callers. */
export interface Notifier {
  notify(input: NotifyInput, at: string): Notification;
}

export interface NotifyInput {
  readonly kind: NotificationKind;
  readonly recipientUserId?: UserId | null;
  readonly recipientDepartmentId?: string | null;
  readonly title: string;
  readonly body: string;
  readonly entityId: string;
}

export function createRepoNotifier(repo: NotificationRepository): Notifier {
  return {
    notify(input, at) {
      const seq = repo.list().length + 1;
      const n: Notification = {
        id: childId(input.entityId, "NOTIF", seq) as NotificationId,
        kind: input.kind,
        recipientUserId: input.recipientUserId ?? null,
        recipientDepartmentId: input.recipientDepartmentId ?? null,
        title: input.title,
        body: input.body,
        entityId: input.entityId,
        createdAt: at,
        read: false,
      };
      repo.add(n);
      return n;
    },
  };
}

/** A no-op notifier for tests that don't assert on notifications. */
export const nullNotifier: Notifier = {
  notify: (input, at) => ({
    id: childId(input.entityId, "NOTIF", 0) as NotificationId,
    kind: input.kind, recipientUserId: input.recipientUserId ?? null,
    recipientDepartmentId: input.recipientDepartmentId ?? null,
    title: input.title, body: input.body, entityId: input.entityId, createdAt: at, read: false,
  }),
};
