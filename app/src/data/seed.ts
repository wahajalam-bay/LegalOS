import { brandId, childId } from "@/domain/models/ids";
import type {
  AuditEvent, Department, Notification, Request, SLAConfiguration, Task, TaskId, User,
} from "@/domain/models";
import { JURISDICTIONS, LEGAL_CATEGORIES, PRIORITIES } from "@/domain/models/enums";
import type {
  DepartmentId, RequestId, SLAConfigId, StatusHistoryId, UserId,
} from "@/domain/models/ids";
import type { LegalCategory, Priority } from "@/domain/models/enums";

const dept = (id: string, name: string, isLegal: boolean): Department => ({
  id: brandId<"DepartmentId">(id) as DepartmentId, name, isLegal,
});

export const SEED_DEPARTMENTS: Department[] = [
  dept("DEP-LEGAL", "Legal", true),
  dept("DEP-PROC", "Procurement", false),
  dept("DEP-SALES", "Sales & Marketing", false),
];

const user = (
  id: string, name: string, email: string, employeeId: string,
  role: User["role"], departmentId: string, jurisdiction: User["jurisdiction"],
): User => ({
  id: brandId<"UserId">(id) as UserId, name, email, employeeId, role,
  departmentId: brandId<"DepartmentId">(departmentId) as DepartmentId, jurisdiction, active: true,
});

export const SEED_USERS: User[] = [
  user("USR-DIR", "Layla Al-Rashid", "layla.alrashid@legalos.example", "E-1001", "director", "DEP-LEGAL", "KSA"),
  user("USR-AD", "Priya Nair", "priya.nair@legalos.example", "E-1002", "adSeniorManager", "DEP-LEGAL", "PK"),
  user("USR-MGR", "Sarah Chen", "sarah.chen@legalos.example", "E-1003", "managerAM", "DEP-LEGAL", "PK"),
  user("USR-ASSOC", "Ahmed Raza", "ahmed.raza@legalos.example", "E-1004", "seniorAssociate", "DEP-LEGAL", "PK"),
  user("USR-PARA", "Yousef Nasser", "yousef.nasser@legalos.example", "E-1005", "paralegal", "DEP-LEGAL", "KSA"),
  user("USR-REQ", "Bilal Sheikh", "bilal.sheikh@legalos.example", "E-2001", "requester", "DEP-PROC", "PK"),
];

// Business-day TAT matrix (PRD §3.6), category × priority. "Same day" = 0
// business days (due the same working day). Same targets for both jurisdictions;
// only the working calendar differs per jurisdiction, not the target.
// Columns: Emergency, Time-critical, Important, Routine.
const TAT_MATRIX: Record<LegalCategory, Record<Priority, number>> = {
  NDA: { Emergency: 0, "Time-critical": 1, Important: 1, Routine: 2 },
  "Contract Review — Standard": { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 4 },
  "Contract Review — Complex / High Value": { Emergency: 2, "Time-critical": 3, Important: 4, Routine: 6 },
  "Contract Drafting — From Template": { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 4 },
  "Contract Drafting — Complex / High Value": { Emergency: 2, "Time-critical": 3, Important: 4, Routine: 6 },
  Amendment: { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
  Renewal: { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
  Termination: { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
  "Legal Opinion — Simple/Narrow": { Emergency: 2, "Time-critical": 3, Important: 5, Routine: 7 },
  "Legal Opinion — Complex": { Emergency: 2, "Time-critical": 5, Important: 7, Routine: 10 },
  "Regulatory / Compliance": { Emergency: 1, "Time-critical": 2, Important: 4, Routine: 5 },
  "Dispute — Initial Assessment": { Emergency: 0, "Time-critical": 1, Important: 2, Routine: 3 },
  "IP Filing": { Emergency: 1, "Time-critical": 3, Important: 5, Routine: 10 },
  // Not in the PRD matrix (pre-triage placeholder) — a conservative default.
  "Triage Required": { Emergency: 1, "Time-critical": 2, Important: 3, Routine: 5 },
};

function slaDays(category: LegalCategory, priority: Priority): number {
  return TAT_MATRIX[category][priority];
}

export const SEED_SLA_CONFIGS: SLAConfiguration[] = LEGAL_CATEGORIES.flatMap((category) =>
  PRIORITIES.flatMap((priority) =>
    JURISDICTIONS.map((jurisdiction): SLAConfiguration => ({
      id: brandId<"SLAConfigId">(`SLA-${category}-${priority}-${jurisdiction}`) as SLAConfigId,
      category, priority, jurisdiction, businessDays: slaDays(category, priority),
    })),
  ),
);

// A couple of illustrative requests (deterministic ids/timestamps).
const rid = (n: number): RequestId => brandId<"RequestId">(`REQ-2026-${String(n).padStart(5, "0")}`) as RequestId;
const uid = (id: string): UserId => brandId<"UserId">(id) as UserId;
const did = (id: string): DepartmentId => brandId<"DepartmentId">(id) as DepartmentId;
const shId = (parent: string, n: number): StatusHistoryId => childId<"StatusHistoryId">(parent, "SH", n);

export const SEED_REQUESTS: Request[] = [
  {
    id: rid(1),
    requesterId: uid("USR-REQ"), requesterEmail: "bilal.sheikh@legalos.example", requesterEmployeeId: "E-2001",
    departmentId: did("DEP-PROC"), jurisdiction: "PK",
    requesterCategory: "agreement",
    description: "Signing a services deal with a new cloud vendor.",
    businessContext: "New SaaS vendor for the marketing team; they sent their own contract. We want to sign before month end.",
    businessUrgency: "Important", neededByDate: "2026-09-10T00:00:00.000Z", neededByJustification: null,
    intakeDetails: { counterpartyName: "Acme Cloud Ltd", counterpartyType: "Supplier / Vendor", paper: "Counterparty paper", contractTerm: "12 months, auto-renewing" },
    attachments: [],
    legalCategory: "Contract Review — Standard", priority: "Important",
    slaConfigId: "SLA-Contract Review — Standard-Important-PK", slaDueDate: "2026-08-24T00:00:00.000Z",
    assignment: { lawyerId: uid("USR-ASSOC"), assignedBy: uid("USR-AD"), assignedAt: "2026-08-20T09:00:00.000Z" },
    status: "In Progress", pausePeriods: [],
    matterId: null,
    statusHistory: [
      { id: shId("REQ-2026-00001", 1), from: null, to: "Submitted", at: "2026-08-19T08:00:00.000Z", by: uid("USR-REQ") },
      { id: shId("REQ-2026-00001", 2), from: "Submitted", to: "Categorised", at: "2026-08-19T10:00:00.000Z", by: uid("USR-AD") },
      { id: shId("REQ-2026-00001", 3), from: "Categorised", to: "Assigned", at: "2026-08-20T09:00:00.000Z", by: uid("USR-AD") },
      { id: shId("REQ-2026-00001", 4), from: "Assigned", to: "In Progress", at: "2026-08-20T11:00:00.000Z", by: uid("USR-ASSOC") },
    ],
    submittedAt: "2026-08-19T08:00:00.000Z", createdAt: "2026-08-19T08:00:00.000Z", updatedAt: "2026-08-20T11:00:00.000Z",
    internal: { comments: [], triageNotes: "Standard vendor paper — associate to review against playbook.", riskNote: null },
  },
  {
    id: rid(2),
    requesterId: uid("USR-REQ"), requesterEmail: "bilal.sheikh@legalos.example", requesterEmployeeId: "E-2001",
    departmentId: did("DEP-PROC"), jurisdiction: "PK",
    requesterCategory: "allowed",
    description: "Can we run a prize draw promotion in KSA?",
    businessContext: "Marketing wants to launch a regional prize draw next quarter; need to know if it's permitted.",
    businessUrgency: "Routine", neededByDate: null, neededByJustification: null,
    intakeDetails: { productActivity: "Regional prize-draw promotion", regulator: "" },
    attachments: [],
    legalCategory: "Triage Required", priority: "Routine", slaConfigId: null, slaDueDate: null,
    assignment: null, status: "Submitted", pausePeriods: [], matterId: null,
    statusHistory: [
      { id: shId("REQ-2026-00002", 1), from: null, to: "Submitted", at: "2026-08-22T13:00:00.000Z", by: uid("USR-REQ") },
    ],
    submittedAt: "2026-08-22T13:00:00.000Z", createdAt: "2026-08-22T13:00:00.000Z", updatedAt: "2026-08-22T13:00:00.000Z",
    internal: { comments: [], triageNotes: null, riskNote: null },
  },
];

export const SEED_AUDIT: AuditEvent[] = [];
export const SEED_NOTIFICATIONS: Notification[] = [];

const taskId = (parent: string, n: number): TaskId => childId<"TaskId">(parent, "TASK", n);
export const SEED_TASKS: Task[] = [
  {
    id: taskId("REQ-2026-00001", 1), requestId: rid(1), title: "Review vendor paper against the playbook",
    kind: "task", assigneeId: uid("USR-ASSOC"), dueDate: "2026-08-24T00:00:00.000Z", status: "In Progress",
    createdBy: uid("USR-AD"), createdAt: "2026-08-20T11:00:00.000Z", updatedAt: "2026-08-20T11:00:00.000Z",
  },
  {
    id: taskId("REQ-2026-00001", 2), requestId: rid(1), title: "Prepare the signature pack",
    kind: "document", assigneeId: uid("USR-PARA"), dueDate: "2026-08-26T00:00:00.000Z", status: "To Do",
    createdBy: uid("USR-ASSOC"), createdAt: "2026-08-20T11:05:00.000Z", updatedAt: "2026-08-20T11:05:00.000Z",
  },
];

export interface SeedData {
  users: User[];
  departments: Department[];
  slaConfigs: SLAConfiguration[];
  requests: Request[];
  audit: AuditEvent[];
  notifications: Notification[];
  tasks: Task[];
}

export function seedData(): SeedData {
  return {
    users: SEED_USERS,
    departments: SEED_DEPARTMENTS,
    slaConfigs: SEED_SLA_CONFIGS,
    requests: structuredClone(SEED_REQUESTS),
    audit: [],
    notifications: [],
    tasks: structuredClone(SEED_TASKS),
  };
}
