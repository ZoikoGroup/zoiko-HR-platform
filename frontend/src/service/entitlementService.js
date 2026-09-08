import { api } from "./api";

/**
 * Entitlement API client — fetches the compiled entitlement snapshot
 * for an organization from the server-authoritative resolver.
 */
export const entitlementService = {
  /** Get the full entitlement snapshot for an organization. */
  getSnapshot: (orgId) => api.get(`/billing/entitlements/${orgId}`),

  /**
   * Resolve one feature key to a Section 15 decision.
   * Returns { state, feature_key, allowed, mode, reason_code, required_plan,
   *           limit_ref, retryable, catalog_version, snapshot_version, correlation_id }
   * Client-safe modes/reasons only; the server stays authoritative.
   */
  checkFeature: (orgId, featureKey) =>
    api.get(`/billing/entitlements/${orgId}`, {
      params: { feature_key: featureKey },
    }),
};
