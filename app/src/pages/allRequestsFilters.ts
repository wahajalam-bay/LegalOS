import type { Request } from "@/domain/models/request";
import { slaStateOf, type SlaState } from "@/ui/components";

export interface RequestFilters {
  q: string;
  status: string;
  category: string;
  priority: string;
  department: string;
  assignee: string;
  jurisdiction: string;
  slaState: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_FILTERS: RequestFilters = {
  q: "", status: "", category: "", priority: "", department: "",
  assignee: "", jurisdiction: "", slaState: "", dateFrom: "", dateTo: "",
};

export function activeFilterCount(f: RequestFilters): number {
  return Object.values(f).filter((v) => v.trim() !== "").length;
}

export interface FilterContext {
  userName: (id: string) => string;
  deptName: (id: string) => string;
  now?: Date;
}

const counterpartyOf = (r: Request) =>
  (r.intakeDetails?.counterpartyName || r.intakeDetails?.disputeCounterparty || "").trim();

/** Pure filter over requests — reused by the UI and unit-tested directly. */
export function filterRequests(rows: readonly Request[], f: RequestFilters, ctx: FilterContext): Request[] {
  const now = ctx.now ?? new Date();
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.category && r.legalCategory !== f.category) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.department && r.departmentId !== f.department) return false;
    if (f.jurisdiction && r.jurisdiction !== f.jurisdiction) return false;
    if (f.assignee) {
      if (f.assignee === "__unassigned") { if (r.assignment) return false; }
      else if (r.assignment?.lawyerId !== f.assignee) return false;
    }
    if (f.slaState && (slaStateOf(r, now) as SlaState) !== f.slaState) return false;
    if (f.dateFrom && r.submittedAt.slice(0, 10) < f.dateFrom) return false;
    if (f.dateTo && r.submittedAt.slice(0, 10) > f.dateTo) return false;
    if (q) {
      const hay = [
        r.id,
        ctx.userName(r.requesterId),
        ctx.deptName(r.departmentId),
        counterpartyOf(r),
        r.description,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
