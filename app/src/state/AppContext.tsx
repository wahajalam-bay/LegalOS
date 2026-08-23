import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@/domain/models/user";
import type { Repositories } from "@/data/repository";
import { createLocalRepositories } from "@/data/localRepository";
import { createRequestService, type RequestService } from "@/services/requestService";
import { createRepoNotifier } from "@/services/notificationService";
import { systemClock } from "@/lib/clock";

interface AppValue {
  readonly currentUser: User;
  readonly users: readonly User[];
  setCurrentUserId(id: string): void;
  readonly repos: Repositories;
  readonly services: { readonly requests: RequestService };
  /** bumps when data mutates so consumers re-read from the repositories. */
  readonly version: number;
  reload(): void;
}

const AppCtx = createContext<AppValue | null>(null);

export function AppProvider({ children, initialUserId }: { children: ReactNode; initialUserId?: string }) {
  const reposRef = useRef<Repositories | null>(null);
  if (!reposRef.current) reposRef.current = createLocalRepositories({ persist: true });
  const repos = reposRef.current;

  const servicesRef = useRef<{ requests: RequestService } | null>(null);
  if (!servicesRef.current) {
    servicesRef.current = {
      requests: createRequestService({ repos, clock: systemClock, notifier: createRepoNotifier(repos.notifications) }),
    };
  }

  const users = useMemo(() => repos.users.list(), [repos]);
  const [currentUserId, setCurrentUserId] = useState<string>(
    () => (initialUserId && users.some((u) => u.id === initialUserId) ? initialUserId : users.find((u) => u.role === "director")?.id ?? users[0].id),
  );
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const currentUser = repos.users.get(currentUserId) ?? users[0];

  const value = useMemo<AppValue>(
    () => ({ currentUser, users, setCurrentUserId, repos, services: servicesRef.current!, version, reload }),
    [currentUser, users, repos, version, reload],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used within <AppProvider>");
  return v;
}

export const useCurrentUser = (): User => useApp().currentUser;
