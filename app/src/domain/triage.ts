import type { Request } from "./models/request";
import type { User } from "./models/user";
import type { BusinessUrgency, LegalCategory, Priority, Role } from "./models/enums";
import type { UserId } from "./models/ids";
import { legalCategoryFor } from "./categories";

/**
 * Assisted triage (PRD §3.3). Every function here is PURE and DETERMINISTIC —
 * the system only *proposes*; a human confirms or overrides. Nothing here writes
 * state or makes an unsupported claim: proposals carry a rationale, flags carry a
 * rule name, and precedents carry a reference.
 */

export const URGENCY_TO_PRIORITY: Record<BusinessUrgency, Priority> = {
  Emergency: "Urgent", "Time-critical": "High", Important: "Medium", Routine: "Low",
};

/** Roles that can own (be assigned) a request. */
export const ASSIGNABLE_ROLES: readonly Role[] = ["adSeniorManager", "managerAM", "seniorAssociate"];
const ACTIVE_STATUSES = (r: Request) => r.status !== "Delivered" && r.status !== "Closed" && r.status !== "Converted to Matter";

function requestText(req: Request): string {
  return [req.description, req.businessContext, ...Object.values(req.intakeDetails ?? {})].join(" ").toLowerCase();
}

/** Refine the coarse plain-language mapping into a specific internal category. */
export function proposeCategory(req: Request): { category: LegalCategory; rationale: string } {
  const text = requestText(req);
  const highValue = /high[ -]?value|multimillion|million|acquisition|merger|\bm&a\b|material/.test(text);

  if (/\bnda\b|non[- ]?disclosure|confidentiality agreement/.test(text)) {
    return { category: "NDA", rationale: "Language mentions an NDA / confidentiality agreement." };
  }
  switch (req.requesterCategory) {
    case "agreement": {
      if (highValue) return { category: "Contract Review — Complex / High Value", rationale: "Agreement with high-value / complexity signals in the description." };
      if (req.intakeDetails?.paper === "Our paper") {
        return /template|standard/.test(text)
          ? { category: "Contract Drafting — From Template", rationale: "We're drafting on our paper from a standard template." }
          : { category: "Contract Drafting — Complex / High Value", rationale: "We're drafting on our own paper (bespoke)." };
      }
      return { category: "Contract Review — Standard", rationale: "Reviewing a counterparty agreement of standard scope." };
    }
    case "change": {
      if (/renew/.test(text)) return { category: "Renewal", rationale: "Request describes renewing an existing agreement." };
      if (/terminat|cancel|end the|wind[- ]?down|exit/.test(text)) return { category: "Termination", rationale: "Request describes ending / terminating an agreement." };
      return { category: "Amendment", rationale: "Request describes amending an existing agreement." };
    }
    case "advice": {
      if (highValue || /cross[- ]?border|multi[- ]?jurisd|structuring|restructur/.test(text)) {
        return { category: "Legal Opinion — Complex", rationale: "Advisory question shows cross-border / structuring complexity." };
      }
      return { category: "Legal Opinion — Simple/Narrow", rationale: "Narrow advisory question." };
    }
    case "threat":
      return { category: "Dispute — Initial Assessment", rationale: "Potential dispute — needs an initial assessment." };
    case "allowed":
      return { category: "Regulatory / Compliance", rationale: "Permission / compliance question." };
    case "protect":
      return { category: "IP Filing", rationale: "Protecting an IP asset." };
    default:
      return { category: legalCategoryFor(req.requesterCategory), rationale: "Needs a human to categorise." };
  }
}

export function proposePriority(req: Request): { priority: Priority; rationale: string } {
  const priority = URGENCY_TO_PRIORITY[req.businessUrgency];
  return { priority, rationale: `Derived from the requester's "${req.businessUrgency}" business urgency.` };
}

/** Deterministic workload-aware owner suggestion. */
export function suggestAssignee(
  category: LegalCategory, users: readonly User[], allRequests: readonly Request[],
): { id: UserId | null; rationale: string } {
  const eligible = users.filter((u) => u.active && ASSIGNABLE_ROLES.includes(u.role));
  if (eligible.length === 0) return { id: null, rationale: "No eligible legal owner is available." };

  const activeCount = (uid: UserId) => allRequests.filter((r) => r.assignment?.lawyerId === uid && ACTIVE_STATUSES(r)).length;
  const categoryCount = (uid: UserId) => allRequests.filter((r) => r.assignment?.lawyerId === uid && r.legalCategory === category).length;

  // Lightest active workload wins; tie-break by most experience in this category,
  // then by id for full determinism.
  const ranked = [...eligible].sort((a, b) => {
    const w = activeCount(a.id) - activeCount(b.id);
    if (w !== 0) return w;
    const c = categoryCount(b.id) - categoryCount(a.id);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
  const pick = ranked[0];
  const open = activeCount(pick.id);
  const done = categoryCount(pick.id);
  const rationale = done > 0
    ? `${pick.name} has the lightest active workload (${open} open) and has handled ${done} ${category} request${done === 1 ? "" : "s"}.`
    : `${pick.name} has the lightest active workload (${open} open).`;
  return { id: pick.id, rationale };
}

export interface TriageProposal {
  readonly category: LegalCategory;
  readonly categoryRationale: string;
  readonly priority: Priority;
  readonly priorityRationale: string;
  readonly assigneeId: UserId | null;
  readonly assigneeRationale: string;
}

export function proposeTriage(req: Request, users: readonly User[], allRequests: readonly Request[]): TriageProposal {
  const cat = proposeCategory(req);
  const prio = proposePriority(req);
  const assignee = suggestAssignee(cat.category, users, allRequests);
  return {
    category: cat.category, categoryRationale: cat.rationale,
    priority: prio.priority, priorityRationale: prio.rationale,
    assigneeId: assignee.id, assigneeRationale: assignee.rationale,
  };
}

/* ---------------- flags (rule-based) ---------------- */

export type FlagSeverity = "info" | "warning" | "danger";
export interface TriageFlag {
  readonly kind: string;
  readonly label: string;
  readonly detail: string;
  readonly severity: FlagSeverity;
  /** The rule that raised the flag — never an unsupported AI claim. */
  readonly source: string;
}

// Illustrative watchlist for the mock sensitivity rule.
const SENSITIVE_TERMS = ["ministry", "government", "regulator", "secp", "central bank", "state ", "authority"];

const DAY = 86_400_000;

export function computeFlags(req: Request, allRequests: readonly Request[], now: number): TriageFlag[] {
  const flags: TriageFlag[] = [];
  const text = requestText(req);
  const counterparty = (req.intakeDetails?.counterpartyName || req.intakeDetails?.disputeCounterparty || "").trim();

  // Incomplete information
  if (req.businessContext.trim().length < 40) {
    flags.push({ kind: "incomplete", label: "Incomplete information", severity: "warning",
      detail: "The business context is very short — consider requesting more information.", source: "Intake completeness rule" });
  }

  // Urgency vs needed-by mismatch
  if (req.neededByDate) {
    const days = Math.round((new Date(req.neededByDate).getTime() - now) / DAY);
    if (req.businessUrgency === "Routine" && days <= 3) {
      flags.push({ kind: "urgency", label: "Urgency mismatch", severity: "warning",
        detail: `Marked Routine but needed in ${days} day${days === 1 ? "" : "s"}.`, source: "Urgency vs needed-by rule" });
    } else if ((req.businessUrgency === "Emergency" || req.businessUrgency === "Time-critical") && days >= 30) {
      flags.push({ kind: "urgency", label: "Urgency mismatch", severity: "info",
        detail: `Marked ${req.businessUrgency} but not needed for ${days} days.`, source: "Urgency vs needed-by rule" });
    }
  } else if (req.businessUrgency === "Emergency") {
    flags.push({ kind: "urgency", label: "Urgency mismatch", severity: "info",
      detail: "Marked Emergency but no needed-by date was provided.", source: "Urgency vs needed-by rule" });
  }

  // Sensitive counterparty (mock watchlist)
  if (counterparty && SENSITIVE_TERMS.some((t) => counterparty.toLowerCase().includes(t.trim()))) {
    flags.push({ kind: "sensitive", label: "Sensitive counterparty", severity: "warning",
      detail: `"${counterparty}" matches the sensitive-counterparty watchlist.`, source: "Sensitive-counterparty watchlist (mock)" });
  }

  // Potential conflict — same counterparty already appears on another request
  if (counterparty) {
    const other = allRequests.find((r) => r.id !== req.id &&
      [r.intakeDetails?.counterpartyName, r.intakeDetails?.disputeCounterparty].some((n) => (n || "").trim().toLowerCase() === counterparty.toLowerCase()));
    if (other) {
      flags.push({ kind: "conflict", label: "Potential conflict", severity: "warning",
        detail: `"${counterparty}" also appears on ${other.id}.`, source: "Cross-request counterparty match" });
    }
  }

  // Restricted information — disputes are privileged/need-to-know by default
  if (req.requesterCategory === "threat" || /litigation|court|lawsuit|privileg/.test(text)) {
    flags.push({ kind: "restricted", label: "Restricted information", severity: "info",
      detail: "Dispute / litigation content — restrict to need-to-know and treat as privileged.", source: "Dispute-handling policy" });
  }

  return flags;
}

/* ---------------- similar past matters (mock retrieval) ---------------- */

export interface SimilarMatter {
  readonly reference: string;
  readonly title: string;
  readonly reason: string;
  readonly status: string;
  /** Where the record comes from — this is illustrative sample data, not an AI claim. */
  readonly source: string;
}

const SOURCE = "Historic matter index (illustrative sample)";

const SIMILAR: Record<string, SimilarMatter[]> = {
  agreement: [
    { reference: "COM-2025-0089", title: "Cloud services agreement — vendor paper", reason: "Same department, contract review", status: "Completed", source: SOURCE },
    { reference: "COM-2024-0312", title: "SaaS subscription — supplier", reason: "Similar counterparty type", status: "Completed", source: SOURCE },
  ],
  change: [
    { reference: "COM-2025-0154", title: "MSA amendment — pricing schedule", reason: "Amendment of an existing agreement", status: "Completed", source: SOURCE },
  ],
  advice: [
    { reference: "ADV-2025-0044", title: "Promotion permissibility in KSA", reason: "Similar legal question", status: "Completed", source: SOURCE },
    { reference: "ADV-2024-0207", title: "Cross-border data transfer opinion", reason: "Advisory / opinion", status: "Completed", source: SOURCE },
  ],
  threat: [
    { reference: "DIS-2025-0021", title: "Supplier breach allegation", reason: "Dispute initial assessment", status: "Closed", source: SOURCE },
  ],
  allowed: [
    { reference: "REG-2025-0063", title: "New payments feature — regulatory check", reason: "Regulatory / compliance question", status: "Completed", source: SOURCE },
  ],
  protect: [
    { reference: "IP-2025-0012", title: "Brand trademark filing", reason: "IP filing", status: "Completed", source: SOURCE },
  ],
  other: [],
};

export function similarMatters(req: Request): SimilarMatter[] {
  return SIMILAR[req.requesterCategory] ?? [];
}
