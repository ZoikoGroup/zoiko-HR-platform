import { useState, useEffect, useCallback } from "react";
import { entitlementService } from "../service/entitlementService";
import { getStoredUser } from "../service/api";

export const GRANTED_STATES = new Set(["ENTITLED_AVAILABLE", "READ_ONLY"]);

/**
 * Batch entitlement map for an organization, fetched once from the
 * server-authoritative snapshot endpoint.
 *
 * Returns:
 *   entitlements — { featureKey: { state, granted } } for every resolved key
 *   granted(key) — helper: true when the key resolves to a granted state
 *   allowed(key) — raw boolean decision (false for any grantable state)
 *   loading, error, refetch
 *
 * Fails closed: any orgId/transport error -> loading=false, empty map.
 * Hydration target for Sidebar's entitlement-aware nav filtering and for
 * per-page <EntitlementGuard> gates that call granted(key) directly.
 */
export function useEntitlements() {
  const [entitlements, setEntitlements] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    const user = getStoredUser();
    const orgId = user?.organization_id;
    if (!orgId) {
      setEntitlements({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const snapshot = await entitlementService.getSnapshot(orgId);
      const states = snapshot?.feature_states || {};
      const mapped = {};
      Object.entries(states).forEach(([key, state]) => {
        mapped[key] = { state, granted: GRANTED_STATES.has(state) };
      });
      setEntitlements(mapped);
    } catch (err) {
      setError(err.message);
      setEntitlements({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const granted = useCallback(
    (featureKey) => Boolean(entitlements[featureKey]?.granted),
    [entitlements],
  );

  return { entitlements, granted, loading, error, refetch: fetchAll };
}