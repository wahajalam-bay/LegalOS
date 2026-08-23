import type { SlaStatus } from "@/services/slaEngine";
import type { Request } from "./models/request";
import type { User } from "./models/user";
import type { UserId } from "./models/ids";

/**
 * Configurable escalation (PRD §3.6). Thresholds and recipient resolution live
 * here — NOT in components — so policy can change without touching the UI.
 */
export interface EscalationConfig {
  /** Fraction of the SLA consumed that triggers a warning (e.g. 0.8 = 80%). */
  readonly warnRatio: number;
  /** Fraction that counts as a breach (e.g. 1.0 = 100%). */
  readonly breachRatio: number;
}

export const DEFAULT_ESCALATION: EscalationConfig = { warnRatio: 0.8, breachRatio: 1.0 };

export type EscalationLevel = "none" | "warning" | "breach";
const RANK: Record<EscalationLevel, number> = { none: 0, warning: 1, breach: 2 };

export function consumedRatio(status: SlaStatus): number {
  return status.target > 0 ? status.consumedBusinessDays / status.target : 0;
}

export function escalationLevelFor(status: SlaStatus, config: EscalationConfig = DEFAULT_ESCALATION): EscalationLevel {
  if (status.breached || consumedRatio(status) >= config.breachRatio) return "breach";
  if (consumedRatio(status) >= config.warnRatio) return "warning";
  return "none";
}

/** True when `next` is a higher level than what was already notified. */
export function isHigher(next: EscalationLevel, previous: EscalationLevel | undefined): boolean {
  return RANK[next] > RANK[previous ?? "none"];
}

/**
 * Who hears about an escalation — resolved by ROLE, not hardcoded ids. Warnings
 * go to the owner; breaches also go up the line (AD/Senior Manager, then the
 * Director). Deduplicated, order preserved.
 */
export function resolveEscalationRecipients(req: Request, users: readonly User[], level: EscalationLevel): UserId[] {
  const ids: UserId[] = [];
  if (req.assignment) ids.push(req.assignment.lawyerId);
  if (level === "breach") {
    const ad = users.find((u) => u.role === "adSeniorManager");
    const director = users.find((u) => u.role === "director");
    if (ad) ids.push(ad.id);
    if (director) ids.push(director.id);
  }
  return [...new Set(ids)];
}
