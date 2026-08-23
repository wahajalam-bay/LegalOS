import type {
  AuditEvent, Department, Notification, Request, RequestId, SLAConfiguration, User,
} from "@/domain/models";
import type { Jurisdiction, LegalCategory, Priority } from "@/domain/models/enums";
import type { Repositories } from "./repository";
import { seedData, type SeedData } from "./seed";

interface MutableState {
  requests: Request[];
  audit: AuditEvent[];
  notifications: Notification[];
}

const STORAGE_KEY = "legalos.module1.v1";

function loadPersisted(): MutableState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MutableState;
    if (!Array.isArray(parsed.requests)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(state: MutableState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable / full — degrade to in-memory only */
  }
}

/**
 * Build the repository set. `persist` controls whether mutable collections are
 * written to localStorage (on in the app, off in tests). Static reference data
 * (users, departments, SLA configs) always comes from the seed.
 */
export function createLocalRepositories(options: { persist?: boolean; seed?: SeedData } = {}): Repositories {
  const shouldPersist = options.persist ?? false;
  const seed = options.seed ?? seedData();
  const loaded = shouldPersist ? loadPersisted() : null;

  const state: MutableState = loaded ?? {
    requests: seed.requests,
    audit: seed.audit,
    notifications: seed.notifications,
  };
  const users = seed.users;
  const departments = seed.departments;
  const slaConfigs = seed.slaConfigs;

  const save = () => { if (shouldPersist) persist(state); };
  save(); // materialise the seed on first run

  return {
    requests: {
      list: () => [...state.requests],
      get: (id: RequestId) => state.requests.find((r) => r.id === id),
      add: (req: Request) => { state.requests = [req, ...state.requests]; save(); },
      update: (id, updater) => {
        let updated: Request | undefined;
        state.requests = state.requests.map((r) => {
          if (r.id !== id) return r;
          updated = updater(r);
          return updated;
        });
        save();
        return updated;
      },
      allIds: () => state.requests.map((r) => r.id),
    },
    users: {
      list: () => [...users],
      get: (id: string) => users.find((u) => u.id === id),
    },
    departments: {
      list: () => [...departments],
      get: (id: string) => departments.find((d) => d.id === id),
    },
    audit: {
      list: (entityId?: string) =>
        state.audit.filter((e) => !entityId || e.entityId === entityId).slice().sort((a, b) => a.at.localeCompare(b.at)),
      add: (event: AuditEvent) => { state.audit = [...state.audit, event]; save(); },
    },
    sla: {
      list: () => [...slaConfigs],
      find: (category: LegalCategory, priority: Priority, jurisdiction: Jurisdiction) =>
        slaConfigs.find((s) => s.category === category && s.priority === priority && s.jurisdiction === jurisdiction),
    },
    notifications: {
      list: () => [...state.notifications],
      add: (n: Notification) => { state.notifications = [...state.notifications, n]; save(); },
      markRead: (id: string) => {
        state.notifications = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
        save();
      },
      markAllRead: (recipientUserId: string) => {
        state.notifications = state.notifications.map((n) => (n.recipientUserId === recipientUserId ? { ...n, read: true } : n));
        save();
      },
    },
  } satisfies Repositories;
}

/** Clear persisted state (used by tests / a dev reset). */
export function clearPersisted(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export type { User, Department, SLAConfiguration };
