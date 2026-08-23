import type { Task, TaskKind, TaskStatus } from "@/domain/models/task";
import type { RequestId, TaskId, UserId } from "@/domain/models/ids";
import { childId } from "@/domain/models/ids";
import type { Repositories } from "@/data/repository";
import type { Clock } from "@/lib/clock";
import { can } from "@/permissions/permissions";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";

export interface NewTaskInput {
  readonly requestId: RequestId;
  readonly title: string;
  readonly kind?: TaskKind;
  readonly assigneeId?: UserId | null;
  readonly dueDate?: string | null;
}

export interface TaskServiceDeps {
  readonly repos: Repositories;
  readonly clock: Clock;
}

export function createTaskService({ repos, clock }: TaskServiceDeps) {
  const requireManage = (actorId: UserId): boolean => {
    const actor = repos.users.get(actorId);
    return !!actor && can(actor, "task.manage");
  };

  return {
    create(input: NewTaskInput, actorId: UserId): Result<Task> {
      if (!requireManage(actorId)) return err("you cannot manage tasks");
      if (!repos.requests.get(input.requestId)) return err("request not found");
      if (!input.title.trim()) return err("a task title is required");
      const at = clock().toISOString();
      const seq = repos.tasks.list(input.requestId).length + 1;
      const task: Task = {
        id: childId<"TaskId">(input.requestId, "TASK", seq),
        requestId: input.requestId,
        title: input.title.trim(),
        kind: input.kind ?? "task",
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        status: "To Do",
        createdBy: actorId,
        createdAt: at,
        updatedAt: at,
      };
      repos.tasks.add(task);
      return ok(task);
    },

    setStatus(taskId: TaskId, status: TaskStatus, actorId: UserId): Result<Task> {
      if (!requireManage(actorId)) return err("you cannot manage tasks");
      const at = clock().toISOString();
      const updated = repos.tasks.update(taskId, (t) => ({ ...t, status, updatedAt: at }));
      return updated ? ok(updated) : err("task not found");
    },

    reassign(taskId: TaskId, assigneeId: UserId | null, actorId: UserId): Result<Task> {
      if (!requireManage(actorId)) return err("you cannot manage tasks");
      const at = clock().toISOString();
      const updated = repos.tasks.update(taskId, (t) => ({ ...t, assigneeId, updatedAt: at }));
      return updated ? ok(updated) : err("task not found");
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
