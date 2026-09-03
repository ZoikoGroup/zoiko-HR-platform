import { useState, useEffect, useCallback } from "react";
import { entitlementService } from "../service/entitlementService";
import { getStoredUser } from "../service/api";

/**
 * Hook to check entitlement for a specific feature key.
 *
 * Returns { state, loading, error, refetch } where state is one of:
 *   ENTITLED_AVAILABLE, NOT_ENTITLED, ENTITLED_NOT_CONFIGURED,
 *   DEPENDENCY_UNAVAILABLE, ENTITLED_POLICY_BLOCKED
 *
 * Usage:
 *   const { state, loading } = useEntitlement("hr.documents.bulk_distribution");
 *   if (loading) return <Spinner />;
 *   if (state !== "ENTITLED_AVAILABLE") return <EntitlementGate state={state} />;
 *   return <YourComponent />;
 */
export function useEntitlement(featureKey) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEntitlement = useCallback(async () => {
    if (!featureKey) {
      setLoading(false);
      return;
    }

    const user = getStoredUser();
    const orgId = user?.organization_id;
    if (!orgId) {
      setState("NOT_ENTITLED");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // The entitlement service returns the full snapshot.
      // We extract the specific feature state from feature_states.
      const snapshot = await entitlementService.getSnapshot(orgId);
      const featureState = snapshot?.feature_states?.[featureKey];

      setState(featureState || "ENTITLED_NOT_CONFIGURED");
    } catch (err) {
      // On error, fail closed: treat as not entitled
      setError(err.message);
      setState("NOT_ENTITLED");
    } finally {
      setLoading(false);
    }
  }, [featureKey]);

  useEffect(() => {
    fetchEntitlement();
  }, [fetchEntitlement]);

  return { state, loading, error, refetch: fetchEntitlement };
}
