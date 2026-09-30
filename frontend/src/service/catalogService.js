import { api } from "./api";

// Price catalog client — mirrors the backend /billing/catalog endpoints
// (Section 17 Canonical Price Catalog Governance).
export const catalogService = {
  // Customer-visible catalog (published plans only — drafts never exposed).
  getCatalog: (params) => api.get("/billing/catalog", { params }),

  // Publish an append-only catalog version (Super Admin only). The caller
  // must echo the exact version string in the body as a confirmation step,
  // since publication is irreversible.
  publishCatalogVersion: (catalogVersion) =>
    api.post("/billing/catalog/publish", { catalog_version: catalogVersion }),

  // Copy the current catalog version into the next one as UNPUBLISHED drafts so
  // pricing can be changed and the new version published later. The copy is
  // always complete: the customer catalog serves only the latest published
  // version, so a partial version would hide the plans it leaves out.
  createCatalogVersion: (fromVersion) =>
    api.post("/billing/catalog/versions", fromVersion ? { from_version: fromVersion } : {}),

  // Pre-auth catalog for the registration / public pricing pages. Returns the
  // same published+active plan set the authenticated route does. Rejects
  // nothing and exposes no Stripe ids.
  getPublicCatalog: () => api.get("/billing/public/catalog"),

  // Change a published plan's rate and publish it. The backend cuts the next
  // catalog version, reconciles Stripe, and publishes, so the registration page
  // reflects the new rate on the next load.
  repricePlan: (code, monthlyPrice, annualPrice, publish = true) =>
    api.post("/billing/plans/reprice", {
      code,
      monthly_price: monthlyPrice,
      annual_price: annualPrice,
      publish,
    }),

  // Plans whose Stripe Price disagrees with the catalog rate.
  getStripeDrift: () => api.get("/billing/plans/stripe-drift"),

  // Force a Stripe reconcile for one plan.
  syncPlanToStripe: (planId) => api.post(`/billing/plans/sync-stripe?plan_id=${planId}`),
};
