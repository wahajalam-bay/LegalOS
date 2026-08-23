import { useEffect, useRef } from "react";
import { useApp } from "@/state/AppContext";
import { can } from "@/permissions/permissions";

/** Legal users: evaluate SLA escalations once on mount (idempotent per level). */
export function useSlaChecks() {
  const { services, currentUser, reload } = useApp();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (can(currentUser, "request.viewInternal")) {
      const emitted = services.requests.runSlaChecks();
      if (emitted > 0) reload();
    }
  }, [currentUser, services, reload]);
}
