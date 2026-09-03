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
};
