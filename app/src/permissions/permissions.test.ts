import { describe, it, expect } from "vitest";
import { seedData } from "@/data/seed";
import { brandId, type UserId } from "@/domain/models/ids";
import { can, canViewInternal, canViewRequest, projectForViewer, canPerformTransition, allowedTransitionsFor } from "./permissions";

const { users, requests } = seedData();
const byRole = (r: string) => users.find((u) => u.role === r)!;
const director = byRole("director");
const requester = byRole("requester");
const paralegal = byRole("paralegal");
const associate = byRole("seniorAssociate");
const manager = byRole("managerAM");
const ad = byRole("adSeniorManager");
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

describe("role-based transitions & authority", () => {
  it("grants approval authority to managers, not associates or paralegals", () => {
    expect(can(manager, "request.approve")).toBe(true);
    expect(can(ad, "request.approve")).toBe(true);
    expect(can(associate, "request.approve")).toBe(false);
    expect(can(paralegal, "request.approve")).toBe(false);
  });

  it("lets legal roles manage tasks but not the requester", () => {
    expect(can(paralegal, "task.manage")).toBe(true);
    expect(can(associate, "task.manage")).toBe(true);
    expect(can(requester, "task.manage")).toBe(false);
  });

  it("requires approval authority to sign off Awaiting Approval → Delivered", () => {
    expect(canPerformTransition(associate, "Awaiting Approval", "Delivered")).toBe(false);
    expect(canPerformTransition(manager, "Awaiting Approval", "Delivered")).toBe(true);
    // but an associate CAN deliver directly from In Progress
    expect(canPerformTransition(associate, "In Progress", "Delivered")).toBe(true);
  });

  it("gives a requester no lifecycle transitions", () => {
    expect(allowedTransitionsFor(requester, "Submitted")).toEqual([]);
    expect(allowedTransitionsFor(requester, "In Progress")).toEqual([]);
  });

  it("gates triage transitions to triage roles", () => {
    expect(canPerformTransition(director, "Submitted", "Categorised")).toBe(true);
    expect(canPerformTransition(associate, "Submitted", "Categorised")).toBe(false);
  });
});
