import { useState, useEffect, useCallback } from "react";
import { entitlementService } from "../service/entitlementService";
import { getStoredUser } from "../service/api";

export const ENTITLED_AVAILABLE = "ENTITLED_AVAILABLE";
export const READ_ONLY = "READ_ONLY";

/**
 * Hook to resolve entitlement for one feature key from the
 * server-authoritative Section 15 decision endpoint.
 *
 * Returns:
 *   state        — ENTITLED_AVAILABLE | READ_ONLY | NOT_ENTITLED | ...
 *   mode         — enum value for the resolved client mode
 *   reasonCode   — reason_code for blocked/read-only (null when granted)
 *   requiredPlan — cheapest plan code that grants the key (null when granted)
 *   allowed      — server decision boolean
 *   granted      — true when state is ENTITLED_AVAILABLE or READ_ONLY
 *   loading, error, refetch
 *
 * Fails closed: any transport/resolver error -> state NOT_ENTITLED.
 *
 * Usage:
 *   const { granted, mode, loading, refetch } =
 *     useEntitlement("hr.documents.bulk_distribution");
 *   if (loading) return <Spinner />;
 *   if (!granted) return <EntitlementGate state={state} reason={reasonCode} />;
 */
export function useEntitlement(featureKey) {
  const [state, setState] = useState(null);
  const [mode, setMode] = useState(null);
  const [reasonCode, setReasonCode] = useState(null);
  const [requiredPlan, setRequiredPlan] = useState(null);
  const [allowed, setAllowed] = useState(false);
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

      const decision = await entitlementService.checkFeature(orgId, featureKey);

      setState(decision?.state ?? "NOT_ENTITLED");
      setMode(decision?.mode ?? null);
      setReasonCode(decision?.reason_code ?? null);
      setRequiredPlan(decision?.required_plan ?? null);
      setAllowed(Boolean(decision?.allowed));
    } catch (err) {
      // Fail closed: resolver unavailable or unexpected -> not entitled.
      setError(err.message);
      setState("NOT_ENTITLED");
      setMode(null);
      setReasonCode(null);
      setRequiredPlan(null);
      setAllowed(false);
    } finally {
      setLoading(false);
    }
  }, [featureKey]);

  useEffect(() => {
    fetchEntitlement();
  }, [fetchEntitlement]);

  const granted =
    state === ENTITLED_AVAILABLE || state === READ_ONLY || allowed === true;

  return {
    state,
    mode,
    reasonCode,
    requiredPlan,
    allowed,
    granted,
    loading,
    error,
    refetch: fetchEntitlement,
  };
}