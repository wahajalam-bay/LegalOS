import { describe, it, expect } from "vitest";
import { validateNewRequest, type NewRequestInput } from "./validation";

const base: NewRequestInput = {
  requesterCategory: "agreement",
  description: "Signing a supplier deal",
  businessContext: "New SaaS vendor, need it reviewed before month end.",
  businessUrgency: "Important",
  neededByDate: null,
  neededByJustification: null,
  jurisdiction: "PK",
};

describe("validateNewRequest", () => {
  it("passes a complete input", () => {
    expect(validateNewRequest(base)).toEqual([]);
  });
  it("flags missing category / description / context", () => {
    const errs = validateNewRequest({ ...base, requesterCategory: "", description: "", businessContext: "" });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("requesterCategory");
    expect(fields).toContain("description");
    expect(fields).toContain("businessContext");
  });
  it("requires a justification when the date is tight", () => {
    const errs = validateNewRequest({ ...base, neededByJustification: null }, { requiresJustification: true });
    expect(errs.map((e) => e.field)).toContain("neededByJustification");
  });
});
