import { describe, it, expect } from "vitest";
import { canTransition, nextStatuses } from "./lifecycle";

describe("request lifecycle", () => {
  it("allows the happy-path transitions", () => {
    expect(canTransition("Submitted", "Categorised")).toBe(true);
    expect(canTransition("Categorised", "Assigned")).toBe(true);
    expect(canTransition("Assigned", "In Progress")).toBe(true);
    expect(canTransition("Delivered", "Closed")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransition("Submitted", "Closed")).toBe(false);
    expect(canTransition("Closed", "In Progress")).toBe(false);
  });
  it("supports the Awaiting Requester round-trip and Convert to Matter branch", () => {
    expect(canTransition("In Progress", "Awaiting Requester")).toBe(true);
    expect(canTransition("Awaiting Requester", "In Progress")).toBe(true);
    expect(nextStatuses("In Progress")).toContain("Converted to Matter");
  });
});
