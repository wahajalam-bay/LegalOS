import type { TaskId, RequestId, UserId } from "./ids";
import type { IsoTimestamp } from "./request";

export const TASK_STATUSES = ["To Do", "In Progress", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** "task" = a piece of execution work; "document" = contract/document handling. */
export const TASK_KINDS = ["task", "document"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** An execution task hung off a request (PRD §3 — paralegal/associate work). */
export interface Task {
  readonly id: TaskId;
  readonly requestId: RequestId;
  readonly title: string;
  readonly kind: TaskKind;
  readonly assigneeId: UserId | null;
  readonly dueDate: IsoTimestamp | null;
  readonly status: TaskStatus;
  readonly createdBy: UserId;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
