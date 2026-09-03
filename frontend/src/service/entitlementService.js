import { api } from "./api";

/**
 * Entitlement API client — fetches the compiled entitlement snapshot
 * for an organization from the server-authoritative resolver.
 */
export const entitlementService = {
  /**
   * Get the full entitlement snapshot for an organization.
   * Returns { organization_id, package, plan_code, feature_states,
   *           contract_overrides, catalog_version, feature_key_registry_version }
   */
  getSnapshot: (orgId) => api.get(`/billing/entitlements/${orgId}`),

  /**
   * Check a single feature key for the current user's organization.
   * Returns { state, feature_key, catalog_version }
   */
  checkFeature: (orgId, featureKey) =>
    api.get(`/billing/entitlements/${orgId}`, {
      params: { feature_key: featureKey },
    }),
};
