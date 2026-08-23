import { describe, it, expect } from "vitest";
import { seedData } from "@/data/seed";
import { EMPTY_FILTERS, activeFilterCount, filterRequests } from "./allRequestsFilters";

const { requests, users, departments } = seedData();
const ctx = {
  userName: (id: string) => users.find((u) => u.id === id)?.name ?? id,
  deptName: (id: string) => departments.find((d) => d.id === id)?.name ?? id,
};
const ids = (rs: { id: string }[]) => rs.map((r) => r.id);

describe("filterRequests", () => {
  it("returns everything with empty filters", () => {
    expect(filterRequests(requests, EMPTY_FILTERS, ctx)).toHaveLength(requests.length);
  });
  it("filters by status", () => {
    const got = filterRequests(requests, { ...EMPTY_FILTERS, status: "Submitted" }, ctx);
    expect(ids(got)).toContain("REQ-2026-00002");
    expect(ids(got)).not.toContain("REQ-2026-00001");
  });
  it("filters by category", () => {
    expect(ids(filterRequests(requests, { ...EMPTY_FILTERS, category: "Triage Required" }, ctx))).toEqual(["REQ-2026-00002"]);
  });
  it("searches by counterparty (intake detail)", () => {
    expect(ids(filterRequests(requests, { ...EMPTY_FILTERS, q: "acme" }, ctx))).toEqual(["REQ-2026-00001"]);
  });
  it("searches by request id", () => {
    expect(ids(filterRequests(requests, { ...EMPTY_FILTERS, q: "00002" }, ctx))).toEqual(["REQ-2026-00002"]);
  });
  it("filters unassigned", () => {
    const got = filterRequests(requests, { ...EMPTY_FILTERS, assignee: "__unassigned" }, ctx);
    expect(ids(got)).toContain("REQ-2026-00002");
    expect(ids(got)).not.toContain("REQ-2026-00001");
  });
  it("filters by jurisdiction and date range", () => {
    expect(filterRequests(requests, { ...EMPTY_FILTERS, jurisdiction: "PK" }, ctx).length).toBeGreaterThan(0);
    expect(filterRequests(requests, { ...EMPTY_FILTERS, dateFrom: "2027-01-01" }, ctx)).toHaveLength(0);
  });
  it("counts active filters", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, status: "Submitted", q: "x" })).toBe(2);
  });
});
