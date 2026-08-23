import type { DepartmentId, UserId } from "./ids";
import type { Jurisdiction, Role } from "./enums";

export interface Department {
  readonly id: DepartmentId;
  readonly name: string;
  /** true for the Legal department itself; business departments raise requests. */
  readonly isLegal: boolean;
}

export interface User {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly employeeId: string;
  readonly role: Role;
  readonly departmentId: DepartmentId;
  /** Primary jurisdiction — seeds the request jurisdiction and working calendar. */
  readonly jurisdiction: Jurisdiction;
  readonly active: boolean;
}
