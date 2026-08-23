import { describe, it, expect } from "vitest";
import { REQUESTER_CATEGORIES, legalCategoryFor, requesterCategoryLabel } from "./categories";

describe("requester-facing categories", () => {
  it("exposes the seven plain-language options", () => {
    expect(REQUESTER_CATEGORIES).toHaveLength(7);
  });
  it("maps plain language to a proposed legal category", () => {
    expect(legalCategoryFor("agreement")).toBe("Contract Review — Standard");
    expect(legalCategoryFor("threat")).toBe("Dispute — Initial Assessment");
    expect(legalCategoryFor("protect")).toBe("IP Filing");
  });
  it("maps 'something else' to Triage Required (needs a human)", () => {
    expect(legalCategoryFor("other")).toBe("Triage Required");
  });
  it("returns a readable label", () => {
    expect(requesterCategoryLabel("allowed")).toMatch(/allowed/i);
  });
});
