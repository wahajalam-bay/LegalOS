import { describe, it, expect } from "vitest";
import { REQUESTER_CATEGORIES, legalCategoryFor, requesterCategoryLabel } from "./categories";

describe("requester-facing categories", () => {
  it("exposes the seven plain-language options", () => {
    expect(REQUESTER_CATEGORIES).toHaveLength(7);
  });
  it("maps plain language to a legal category", () => {
    expect(legalCategoryFor("agreement")).toBe("Contract Drafting / Review");
    expect(legalCategoryFor("threat")).toBe("Dispute / Litigation");
    expect(legalCategoryFor("protect")).toBe("IP");
  });
  it("maps 'something else' to Uncategorised (needs triage)", () => {
    expect(legalCategoryFor("other")).toBe("Uncategorised");
  });
  it("returns a readable label", () => {
    expect(requesterCategoryLabel("allowed")).toMatch(/allowed/i);
  });
});
