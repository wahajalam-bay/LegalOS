import { describe, it, expect } from "vitest";
import { seedData } from "@/data/seed";
import { brandId, type UserId } from "@/domain/models/ids";
import { can, canViewInternal, canViewRequest, projectForViewer } from "./permissions";

const { users, requests } = seedData();
const byRole = (r: string) => users.find((u) => u.role === r)!;
const director = byRole("director");
const requester = byRole("requester");
const paralegal = byRole("paralegal");
const ownReq = requests[0]; // raised by the requester

describe("permissions", () => {
  it("grants the Director everything and the requester almost nothing", () => {
    expect(can(director, "request.configureSLA")).toBe(true);
    expect(can(director, "request.viewInternal")).toBe(true);
    expect(can(requester, "request.viewInternal")).toBe(false);
    expect(can(requester, "request.triage")).toBe(false);
    expect(can(requester, "request.create")).toBe(true);
  });

  it("keeps internal content from the paralegal by default", () => {
    expect(can(paralegal, "request.viewInternal")).toBe(false);
  });

  it("row-level: a requester sees their own request, not others'", () => {
    expect(canViewRequest(requester, ownReq)).toBe(true);
    expect(canViewRequest(requester, { requesterId: brandId<"UserId">("USR-OTHER") as UserId })).toBe(false);
    expect(canViewRequest(director, { requesterId: brandId<"UserId">("USR-OTHER") as UserId })).toBe(true);
  });

  it("strips internal content in the requester's projection", () => {
    expect(canViewInternal(requester, ownReq)).toBe(false);
    const projected = projectForViewer(requester, ownReq);
    expect(projected).not.toBeNull();
    expect("internal" in (projected as object)).toBe(false);
  });

  it("keeps internal content for privileged legal roles", () => {
    const projected = projectForViewer(director, ownReq);
    expect(projected).not.toBeNull();
    expect("internal" in (projected as object)).toBe(true);
  });
});
