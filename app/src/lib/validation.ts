import type { BusinessUrgency, Jurisdiction } from "@/domain/models/enums";
import type { RequesterCategoryKey } from "@/domain/categories";
import { conditionalFieldsFor } from "@/domain/intake";

/** A file the requester has attached but not yet persisted (no id assigned yet). */
export interface DraftAttachment {
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly contentType: string | null;
}

/** The payload the intake form collects (requester-facing, pre-triage). */
export interface NewRequestInput {
  requesterCategory: RequesterCategoryKey | "";
  description: string;
  businessContext: string;
  businessUrgency: BusinessUrgency;
  neededByDate: string | null;
  neededByJustification: string | null;
  jurisdiction: Jurisdiction;
  /** Answers to the type-specific conditional questions. */
  intakeDetails?: Record<string, string>;
  attachments?: DraftAttachment[];
}

export interface FieldError {
  /** A field of NewRequestInput, or an intake conditional field key. */
  readonly field: string;
  readonly message: string;
}

/** Pure validation of the core intake fields — reused by UI and services. */
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

/**
 * Validate the type-specific conditional questions. Kept separate from the core
 * validator (and from the service) so it only runs where the type is known — the
 * intake wizard — and never blocks lower layers that don't collect these.
 */
export function validateConditional(
  category: RequesterCategoryKey | "",
  details: Record<string, string> = {},
): FieldError[] {
  const errors: FieldError[] = [];
  for (const f of conditionalFieldsFor(category)) {
    if (f.required && !details[f.key]?.trim()) {
      errors.push({ field: f.key, message: `${f.label} is required.` });
    }
  }
  return errors;
}
