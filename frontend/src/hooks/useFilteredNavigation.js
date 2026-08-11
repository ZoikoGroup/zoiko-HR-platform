import { useMemo } from "react";
import { sections as allSections } from "../navigation";
import { ROLE_ALLOWED_PREFIXES, VALID_ROLES, PRODUCT_ALLOWED_PREFIXES, PRODUCTS, ROLES, ROLE_DISALLOWED_PREFIXES } from "../config/roles";

const SECTION_EXCLUSIONS = {
  // "ADMINISTRATION" duplicates the "USER MANAGEMENT" section for super admin
  // (both were literally labeled "User Management" in the sidebar) and points
  // at the single-org employee page, which isn't organization-scoped for a
  // platform-wide super admin. Hidden here only for super_admin — the
  // Administration section still shows for admin/hr_admin roles.
  super_admin: ["HR ADMIN", "ORGANIZATION ADMIN", "PRODUCTS", "MY WORKSPACE", "ADMINISTRATION"],
  hr_admin: ["SHARED LAYERS"],
  employee: ["SHARED LAYERS"],
};

function isAllowedPathForRole(pathname, role) {
  if (!role || !VALID_ROLES.includes(role)) return false;
  const disallowed = ROLE_DISALLOWED_PREFIXES[role] || [];
  if (disallowed.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return false;
  const prefixes = ROLE_ALLOWED_PREFIXES[role] ?? [];
  return prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(prefix);
  });
}

const BADGE_TO_PRODUCT = {
  HR: PRODUCTS.HR,
  Time: PRODUCTS.TIME,
  Payroll: PRODUCTS.PAYROLL,
  Billing: PRODUCTS.BILLING,
  Projects: PRODUCTS.PROJECTS,
  Comply: PRODUCTS.COMPLY,
  Insights: PRODUCTS.INSIGHTS,
  Spend: PRODUCTS.SPEND,
  Inventory: PRODUCTS.INVENTORY,
  Docs: PRODUCTS.DOCS,
};

function isAllowedPathForProducts(pathname, products) {
  if (!products || products.length === 0) return true;
  return products.some((code) => {
    const prefixes = PRODUCT_ALLOWED_PREFIXES[code] ?? [];
    return prefixes.some((prefix) => {
      if (prefix === "/") return pathname === "/";
      return pathname === prefix || pathname.startsWith(prefix);
    });
  });
}

// ProtectedRoute hard-blocks super_admin from any "/hr-admin/" or
// "/organization-admin/" route (those are hr_admin/admin work areas), so
// super admin needs its own href for shared pages reachable under those
// prefixes. /settings/user-management renders the same UserManagementPage
// component and already branches on isSuperAdmin internally.
const SUPER_ADMIN_HREF_OVERRIDES = {
  "/hr-admin/settings": "/settings/user-management",
};

function filterNavItem(item, role, products, calcMode) {
  if (!item) return null;

  if (item.excludeRoles && item.excludeRoles.includes(role)) return null;

  if (item.href === "/payroll/compliances" && calcMode === "simple") return null;

  if (role === ROLES.SUPER_ADMIN) {
    const override = item.href && SUPER_ADMIN_HREF_OVERRIDES[item.href];
    return override ? { ...item, href: override } : item;
  }

  const hasProducts = Array.isArray(products) && products.length > 0;

  if (item.badge && hasProducts) {
    const badgeProduct = BADGE_TO_PRODUCT[item.badge];
    if (badgeProduct && !products.includes(badgeProduct)) return null;
  }

  if (item.href) {
    const roleOk = isAllowedPathForRole(item.href, role);
    const productOk = isAllowedPathForProducts(item.href, products);
    if (!roleOk || !productOk) return null;
    return item;
  }

  if (item.children) {
    const filteredChildren = item.children
      .map((child) => filterNavItem(child, role, products, calcMode))
      .filter(Boolean);

    if (filteredChildren.length === 0) return null;
    return { ...item, children: filteredChildren };
  }

  return item;
}

export default function useFilteredNavigation(role, product, products = []) {
  return useMemo(() => {
    const calcMode = localStorage.getItem("zoiko_payroll_calc_mode") || "standard";

    if (!role || !VALID_ROLES.includes(role)) return allSections;

    const excludedTitles = SECTION_EXCLUSIONS[role] || [];

    if (role === ROLES.SUPER_ADMIN) {
      return allSections
        .map((section) => {
          if (excludedTitles.includes(section.title)) return null;
          if (section.items) {
            const filteredItems = section.items
              .map((item) => filterNavItem(item, role, products, calcMode))
              .filter(Boolean);
            if (filteredItems.length === 0) return null;
            return { ...section, items: filteredItems };
          }
          return section;
        })
        .filter(Boolean);
    }

    return allSections
      .map((section) => {
        if (excludedTitles.includes(section.title)) return null;

        const filteredItems = section.items
          .map((item) => filterNavItem(item, role, products, calcMode))
          .filter(Boolean);

        if (filteredItems.length === 0) return null;
        return { ...section, items: filteredItems };
      })
      .filter(Boolean);
  }, [role, products]);
}
