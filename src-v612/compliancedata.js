// Data hooks for the Compliance workspace.
//
// Each hook owns one server resource and exposes { data, loading, error,
// reload }. `reload` matters: every workflow action changes server state, and
// the register it came from has to re-read rather than patch a local copy --
// otherwise an amendment that the server refused would still appear to have
// happened, which is exactly the "no fake persistence" failure mode.
import { useState, useEffect, useCallback, useRef } from "./core.js";
import { api } from "./api.js";

function useResource(fetcher, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setState((s) => ({ ...s, loading: true }));
    fetcher().then(
      (data) => { if (alive.current) setState({ data, loading: false, error: null }); },
      (e) => { if (alive.current) setState({ data: null, loading: false, error: e }); }
    );
    return () => { alive.current = false; };
    // eslint-disable-next-line
  }, [...(deps || []), tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// The caller's capabilities and the configured business rules. Everything in the
// workspace keys off this, so it loads once and is passed down rather than
// re-fetched per component.
export function useComplianceConfig() {
  return useResource(() => api.compliance.config(), []);
}

export function useLoans() { return useResource(() => api.compliance.loans(), []); }
export function useLoan(id) { return useResource(() => (id ? api.compliance.loan(id) : Promise.resolve(null)), [id]); }

export function useLeases() { return useResource(() => api.compliance.leases(), []); }
export function useServices() { return useResource(() => api.compliance.services(), []); }
export function useAgreement(kind, id) {
  return useResource(() => {
    if (!id) return Promise.resolve(null);
    return kind === "lease" ? api.compliance.lease(id) : api.compliance.service(id);
  }, [kind, id]);
}

export function useResolutions() { return useResource(() => api.compliance.resolutions(), []); }
export function useResolution(id) { return useResource(() => (id ? api.compliance.resolution(id) : Promise.resolve(null)), [id]); }
export function useResolutionEntity(key) { return useResource(() => (key ? api.compliance.resolutionEntity(key) : Promise.resolve(null)), [key]); }
export function useLicences() { return useResource(() => api.compliance.licences(), []); }
export function useLicence(id) { return useResource(() => (id ? api.compliance.licence(id) : Promise.resolve(null)), [id]); }

export function useSecpOverview(fy) { return useResource(() => api.compliance.secp.overview(fy), [fy]); }
export function useSecpFilings(q) { return useResource(() => api.compliance.secp.filings(q), [q]); }
export function useSecpEntity(key) { return useResource(() => (key ? api.compliance.secp.entity(key) : Promise.resolve(null)), [key]); }
export function useSecpYears() { return useResource(() => api.compliance.secp.years(), []); }
export function useSecpYear(id) { return useResource(() => (id ? api.compliance.secp.year(id) : Promise.resolve(null)), [id]); }
/* The Drive-backed statutory registers. These are historical record built from
   the folder tree; the LegalOS-native filings above are what the team raises
   from here on. Both belong to one statutory history, so neither replaces the
   other. */
export function useSecpAnnual(q) { return useResource(() => api.compliance.secp.annual(q), [q]); }
export function useSecpAnnualRecord(id) { return useResource(() => (id ? api.compliance.secp.annualRecord(id) : Promise.resolve(null)), [id]); }
export function useSecpEvents(q) { return useResource(() => api.compliance.secp.events(q), [q]); }
export function useSecpRegisters(q) { return useResource(() => api.compliance.secp.registers(q), [q]); }
export function useSecpUpcoming(q) { return useResource(() => api.compliance.secp.upcoming(q), [q]); }

export function useEntities() { return useResource(() => api.compliance.entities(), []); }
export function useComplianceSources() { return useResource(() => api.compliance.sources(), []); }

// The append-only audit trail, newest first. Empty until somebody acts in
// LegalOS -- the Overview says so rather than filling the panel with document
// dates that nobody produced.
export function useComplianceActivity(limit) { return useResource(() => api.compliance.activity(limit), [limit]); }

// One Drive document's metadata and the compliance records that cite it. The
// bytes come from the knowledge file route, which enforces the same object-level
// authorization -- a file id is not permission to read the file.
export function useComplianceDocument(id) { return useResource(() => (id ? api.compliance.document(id) : Promise.resolve(null)), [id]); }
