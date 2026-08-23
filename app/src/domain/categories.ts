import type { LegalCategory } from "./models/enums";

/**
 * Requester-facing, plain-language options (PRD §3.2). The requester never sees
 * the legal category; the system maps their choice to a proposed one for triage.
 */
export const REQUESTER_CATEGORIES = [
  { key: "agreement", label: "We're entering into an agreement with someone", legalCategory: "Contract Review — Standard" },
  { key: "change", label: "We need to change or end an existing agreement", legalCategory: "Amendment" },
  { key: "advice", label: "We need advice on whether we can do something", legalCategory: "Legal Opinion — Simple/Narrow" },
  { key: "threat", label: "Someone is threatening or has commenced action", legalCategory: "Dispute — Initial Assessment" },
  { key: "allowed", label: "We need to check if this is allowed", legalCategory: "Regulatory / Compliance" },
  { key: "protect", label: "We need to protect something we've created", legalCategory: "IP Filing" },
  { key: "other", label: "Something else", legalCategory: "Triage Required" },
] as const satisfies ReadonlyArray<{ key: string; label: string; legalCategory: LegalCategory }>;

export type RequesterCategoryKey = (typeof REQUESTER_CATEGORIES)[number]["key"];

const BY_KEY = new Map(REQUESTER_CATEGORIES.map((c) => [c.key, c]));

export function requesterCategoryLabel(key: RequesterCategoryKey): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** The proposed legal category for a requester's plain-language choice. */
export function legalCategoryFor(key: RequesterCategoryKey): LegalCategory {
  return BY_KEY.get(key)?.legalCategory ?? "Triage Required";
}
