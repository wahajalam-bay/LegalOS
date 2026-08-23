// Branded, immutable identifiers. Branding prevents accidentally passing a
// DepartmentId where a UserId is expected — a compile-time guarantee only.
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type DepartmentId = Brand<string, "DepartmentId">;
export type RequestId = Brand<string, "RequestId">;
export type MatterId = Brand<string, "MatterId">;
export type AttachmentId = Brand<string, "AttachmentId">;
export type CommentId = Brand<string, "CommentId">;
export type StatusHistoryId = Brand<string, "StatusHistoryId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type NotificationId = Brand<string, "NotificationId">;
export type SLAConfigId = Brand<string, "SLAConfigId">;

/** Cast a raw string to a branded id (use only at trust boundaries / seeds). */
export const brandId = <B extends string>(value: string): Brand<string, B> =>
  value as Brand<string, B>;

/** Human-readable request id, e.g. REQ-2026-00001. */
export function formatRequestId(year: number, sequence: number): RequestId {
  return `REQ-${year}-${String(sequence).padStart(5, "0")}` as RequestId;
}

/** Next request id for a year, derived from the ids already in the store. */
export function nextRequestId(existingIds: readonly string[], year: number): RequestId {
  const prefix = `REQ-${year}-`;
  const maxSeq = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return formatRequestId(year, maxSeq + 1);
}

/** Deterministic child id, e.g. childId("REQ-2026-00001","ATT",2) → REQ-2026-00001-ATT-2 */
export function childId<B extends string>(parent: string, kind: string, seq: number): Brand<string, B> {
  return `${parent}-${kind}-${seq}` as Brand<string, B>;
}
