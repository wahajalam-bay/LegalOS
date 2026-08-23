import type {
  AuditEvent, Department, Notification, Request, RequestId, SLAConfiguration, User,
} from "@/domain/models";
import type { Jurisdiction, LegalCategory, Priority } from "@/domain/models/enums";

// The repository layer is the ONLY thing that knows where data lives. Swapping
// the localStorage implementation for an HTTP/API client later requires no
// change above this line (services, state, UI all depend on these interfaces).

export interface RequestRepository {
  list(): Request[];
  get(id: RequestId): Request | undefined;
  add(req: Request): void;
  update(id: RequestId, updater: (r: Request) => Request): Request | undefined;
  allIds(): string[];
}

export interface UserRepository {
  list(): User[];
  get(id: string): User | undefined;
}

export interface DepartmentRepository {
  list(): Department[];
  get(id: string): Department | undefined;
}

export interface AuditRepository {
  list(entityId?: string): AuditEvent[];
  add(event: AuditEvent): void;
}

export interface SlaRepository {
  list(): SLAConfiguration[];
  find(category: LegalCategory, priority: Priority, jurisdiction: Jurisdiction): SLAConfiguration | undefined;
}

export interface NotificationRepository {
  list(): Notification[];
  add(n: Notification): void;
}

export interface Repositories {
  readonly requests: RequestRepository;
  readonly users: UserRepository;
  readonly departments: DepartmentRepository;
  readonly audit: AuditRepository;
  readonly sla: SlaRepository;
  readonly notifications: NotificationRepository;
}
