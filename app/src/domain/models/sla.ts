import type { SLAConfigId } from "./ids";
import type { Jurisdiction, LegalCategory, Priority } from "./enums";

/**
 * An SLA target keyed by Category × Priority × Jurisdiction, expressed in
 * BUSINESS days (not calendar days). Resolution is handled by the SLA engine
 * against a jurisdiction's business calendar.
 */
export interface SLAConfiguration {
  readonly id: SLAConfigId;
  readonly category: LegalCategory;
  readonly priority: Priority;
  readonly jurisdiction: Jurisdiction;
  readonly businessDays: number;
  readonly description?: string;
}
