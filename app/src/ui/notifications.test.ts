import { describe, it, expect } from "vitest";
import { notificationsFor } from "./notifications";
import type { Notification } from "@/domain/models/notification";
import type { User } from "@/domain/models/user";
import { brandId } from "@/domain/models/ids";
import type { UserId, DepartmentId, NotificationId } from "@/domain/models/ids";

const user = (id: string, dept: string): User => ({
  id: brandId<"UserId">(id) as UserId, name: "T", email: "t@x", employeeId: "E",
  role: "requester", departmentId: brandId<"DepartmentId">(dept) as DepartmentId, jurisdiction: "PK", active: true,
});

const notif = (id: string, over: Partial<Notification>): Notification => ({
  id: brandId<"NotificationId">(id) as NotificationId,
  kind: "request.status_changed", recipientUserId: null, recipientDepartmentId: null,
  title: id, body: "", entityId: "REQ-2026-00001", createdAt: "2026-01-01T00:00:00.000Z", read: false,
  ...over,
});

describe("notificationsFor", () => {
  const me = user("USR-ME", "DEP-A");
  const mine = notif("mine", { recipientUserId: me.id, createdAt: "2026-01-02T00:00:00.000Z" });
  const deptQueue = notif("dept", { recipientDepartmentId: me.departmentId, createdAt: "2026-01-03T00:00:00.000Z" });
  const someoneElse = notif("other-user", { recipientUserId: brandId<"UserId">("USR-X") as UserId });
  const otherDept = notif("other-dept", { recipientDepartmentId: brandId<"DepartmentId">("DEP-B") as DepartmentId });

  it("includes notifications addressed to the user or their department", () => {
    const got = notificationsFor(me, [mine, deptQueue, someoneElse, otherDept]).map((n) => n.id);
    expect(got).toContain("mine");
    expect(got).toContain("dept");
  });

  it("excludes notifications for other users and other departments", () => {
    const got = notificationsFor(me, [mine, deptQueue, someoneElse, otherDept]).map((n) => n.id);
    expect(got).not.toContain("other-user");
    expect(got).not.toContain("other-dept");
  });

  it("returns newest first", () => {
    const got = notificationsFor(me, [mine, deptQueue]).map((n) => n.id);
    expect(got).toEqual(["dept", "mine"]);
  });
});
