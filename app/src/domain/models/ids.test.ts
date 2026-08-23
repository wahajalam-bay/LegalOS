import { describe, it, expect } from "vitest";
import { childId, formatRequestId, nextRequestId } from "./ids";

describe("identifiers", () => {
  it("formats a human-readable request id", () => {
    expect(formatRequestId(2026, 1)).toBe("REQ-2026-00001");
    expect(formatRequestId(2026, 142)).toBe("REQ-2026-00142");
  });
  it("derives the next id from existing ones", () => {
    expect(nextRequestId(["REQ-2026-00007", "REQ-2026-00003"], 2026)).toBe("REQ-2026-00008");
  });
  it("starts a new year at 00001", () => {
    expect(nextRequestId(["REQ-2025-00090"], 2026)).toBe("REQ-2026-00001");
  });
  it("builds deterministic child ids", () => {
    expect(childId("REQ-2026-00001", "ATT", 2)).toBe("REQ-2026-00001-ATT-2");
  });
});
