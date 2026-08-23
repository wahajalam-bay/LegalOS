import type { BusinessUrgency, Jurisdiction } from "@/domain/models/enums";
import type { RequesterCategoryKey } from "@/domain/categories";

/** The payload the intake form collects (requester-facing, pre-triage). */
export interface NewRequestInput {
  requesterCategory: RequesterCategoryKey | "";
  description: string;
  businessContext: string;
  businessUrgency: BusinessUrgency;
  neededByDate: string | null;
  neededByJustification: string | null;
  jurisdiction: Jurisdiction;
}

export interface FieldError {
  readonly field: keyof NewRequestInput;
  readonly message: string;
}

/** Pure validation — no side effects — reused by UI and services. */
export function validateNewRequest(
  input: NewRequestInput,
  opts: { requiresJustification?: boolean } = {},
): FieldError[] {
  const errors: FieldError[] = [];
  if (!input.requesterCategory) {
    errors.push({ field: "requesterCategory", message: "Choose the option that best describes your request." });
  }
  if (input.description.trim().length < 5) {
    errors.push({ field: "description", message: "Tell us in a sentence what you need." });
  }
  if (input.businessContext.trim().length < 10) {
    errors.push({ field: "businessContext", message: "Add a little context so Legal can act without coming back to you." });
  }
  if (opts.requiresJustification && !input.neededByJustification?.trim()) {
    errors.push({ field: "neededByJustification", message: "This date is tighter than standard — a short justification is required." });
  }
  return errors;
}
