import { describe, it, expect } from "vitest";
import { slaStateOf } from "./components";

const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
const now = new Date();

describe("slaStateOf", () => {
  it("is On Track well before the due date", () => {
    expect(slaStateOf({ status: "In Progress", pausePeriods: [], slaDueDate: future }, now)).toBe("ontrack");
  });
  it("is Paused while Awaiting Requester", () => {
    expect(slaStateOf({ status: "Awaiting Requester", pausePeriods: [{ end: null }], slaDueDate: future }, now)).toBe("paused");
  });
  it("is Breached once past due", () => {
    expect(slaStateOf({ status: "In Progress", pausePeriods: [], slaDueDate: past }, now)).toBe("breached");
  });
  it("is Completed for terminal statuses regardless of due date", () => {
    expect(slaStateOf({ status: "Delivered", pausePeriods: [], slaDueDate: past }, now)).toBe("completed");
    expect(slaStateOf({ status: "Closed", pausePeriods: [], slaDueDate: past }, now)).toBe("completed");
  });
  it("is 'none' when no SLA is set yet", () => {
    expect(slaStateOf({ status: "Submitted", pausePeriods: [], slaDueDate: null }, now)).toBe("none");
  });
});
