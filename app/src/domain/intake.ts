import type { BusinessUrgency } from "./models/enums";
import type { RequesterCategoryKey } from "./categories";

/**
 * Conditional intake questions (PRD §3.2 — Step 3). Each requester category
 * reveals a small, relevant set of follow-ups so the requester is never shown a
 * giant form. Values are stored flat on the request as `intakeDetails` (keyed by
 * `key`); keys are globally unique so switching type never collides.
 */
export type IntakeFieldType = "text" | "textarea" | "date" | "select" | "yesno";

export interface IntakeField {
  readonly key: string;
  readonly label: string;
  readonly type: IntakeFieldType;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly placeholder?: string;
  readonly hint?: string;
}

export const CONDITIONAL_FIELDS: Record<RequesterCategoryKey, readonly IntakeField[]> = {
  agreement: [
    { key: "counterpartyName", label: "Counterparty name", type: "text", required: true, placeholder: "e.g. Acme Cloud Ltd" },
    { key: "counterpartyType", label: "Counterparty type", type: "select", options: ["Supplier / Vendor", "Customer", "Partner / Reseller", "Investor", "Employee / Contractor", "Other"] },
    { key: "paper", label: "Whose contract are we using?", type: "select", options: ["Our paper", "Counterparty paper", "Not sure yet"] },
    { key: "contractTerm", label: "Contract term / duration", type: "text", placeholder: "e.g. 12 months, auto-renewing" },
    { key: "existingAgreement", label: "Is there an existing agreement in place?", type: "yesno" },
  ],
  change: [
    { key: "existingContract", label: "Which agreement is this about?", type: "text", required: true, placeholder: "Counterparty and/or title" },
    { key: "changeNature", label: "What change do you need?", type: "textarea", required: true, placeholder: "Extend, amend a term, terminate…" },
    { key: "effectiveDate", label: "Effective date", type: "date" },
  ],
  advice: [
    { key: "adviceQuestion", label: "What's the question?", type: "textarea", required: true, placeholder: "The specific decision you need help with." },
    { key: "decisionDeadline", label: "Decision deadline", type: "date" },
    { key: "decisionMaker", label: "Who is the decision-maker?", type: "text", placeholder: "e.g. Head of Sales" },
  ],
  threat: [
    { key: "disputeCounterparty", label: "Who is the other party?", type: "text", required: true },
    { key: "claimNature", label: "What is the claim or threat?", type: "textarea", required: true, placeholder: "What happened and what they're asking for." },
    { key: "responseDeadline", label: "Any response deadline?", type: "date" },
    { key: "correspondenceReceived", label: "Have you received correspondence (letter, notice, court document)?", type: "yesno" },
  ],
  allowed: [
    { key: "productActivity", label: "Which product or activity?", type: "text", required: true, placeholder: "What you want to do." },
    { key: "regulator", label: "Relevant regulator (if known)", type: "text", placeholder: "e.g. SECP, SBP" },
  ],
  protect: [
    { key: "assetType", label: "What are we protecting?", type: "select", required: true, options: ["Trademark / Brand", "Patent / Invention", "Copyright", "Design", "Trade secret", "Domain name", "Other"] },
    { key: "ipTiming", label: "Any timing or deadline?", type: "text", placeholder: "e.g. before a public launch" },
  ],
  other: [
    { key: "otherDetail", label: "Tell us more", type: "textarea", required: true, placeholder: "Anything that helps Legal understand what you need." },
  ],
};

export function conditionalFieldsFor(key: RequesterCategoryKey | ""): readonly IntakeField[] {
  return key ? (CONDITIONAL_FIELDS[key] ?? []) : [];
}

/** Plain-language explanation of each business-urgency level for the requester. */
export const URGENCY_HELP: Record<BusinessUrgency, string> = {
  Routine: "No particular time pressure.",
  Important: "Needed reasonably soon, but not blocking work today.",
  "Time-critical": "A deadline is approaching and this is holding things up.",
  Emergency: "Business-critical — a deal or matter is at immediate risk.",
};

export const URGENCY_NOTE =
  "This is your business urgency. Legal sets the actual priority and turnaround (SLA) during triage.";
