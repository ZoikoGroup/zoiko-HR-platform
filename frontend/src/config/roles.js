export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  HR_ADMIN: "hr_admin",
  MANAGER: "manager",
  EMPLOYEE: "employee",
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Organization Admin",
  [ROLES.HR_ADMIN]: "HR Admin",
  [ROLES.EMPLOYEE]: "Employee",
};

// Default landing after role-based redirect
export const ROLE_DEFAULT_REDIRECT = {
  [ROLES.SUPER_ADMIN]: "/super-admin/dashboard",
  [ROLES.ADMIN]: "/organization-admin/dashboard",
  [ROLES.HR_ADMIN]: "/hr-admin/dashboard",
  [ROLES.MANAGER]: "/zoiko-hr",
  [ROLES.EMPLOYEE]: "/employee/ess",
};

// Define who can create which roles (fixes the UserManagementPage bug)
export const ROLE_CREATION_RULES = {
  [ROLES.SUPER_ADMIN]: [ROLES.ADMIN],
  [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.EMPLOYEE],
  [ROLES.HR_ADMIN]: [ROLES.EMPLOYEE],
  [ROLES.EMPLOYEE]: [],
};

// Route-prefix access matrix (authoritative for both guards and sidebar filtering)
// Every product's primary path MUST appear in every role that should see it.
// Product paths: hr=/zoiko-hr, time=/zoikotime, payroll=/payroll, billing=/billing,
//   projects=/projects, comply=/comply, insights=/insights, spend=/spend, inventory=/inventory
export const ROLE_ALLOWED_PREFIXES = {
  [ROLES.SUPER_ADMIN]: [
    // ── Billing & Subscription (ZHR-COM-BILL-001 Section 19 — Organization Owner) ──
    "/super-admin/billing",
    "/super-admin/billing/plans",
    "/super-admin/billing/discounts",
    // ── Platform administration ──
    "/super-admin/dashboard",
    "/super-admin/organizations",
    "/super-admin/access",
    "/super-admin/audit-logs",
    "/super-admin/settings",
    "/super-admin/notifications",
    // ── Shared & platform ──
    "/dashboard",
    "/organizations",
    "/subscriptions",
    "/shared/",
    "/admin-profile",
    "/settings/",
    // ── Read-only product paths (view-only; no HR/IT/Security admin writes) ──
    "/zoiko-hr",
    "/zoikotime",
    "/payroll",
    "/billing",
    "/projects",
    "/comply",
    "/insights",
    "/spend",
    "/inventory",
  ],

  // Organization Admin – sees ALL product navigation the org has subscribed to
  [ROLES.ADMIN]: [
    "/organization-admin/dashboard",
    "/organization-admin/organization",
    "/organization-admin/assets",
    "/organization-admin/assets/requests",
    "/organization-admin/users",
    "/organization-admin/metrics",
    "/organization-admin/payroll-guidance",
    // ── All product paths ──
    "/zoiko-hr",
    "/zoikotime",
    "/payroll",
    "/billing",
    "/projects",
    "/comply",
    "/insights",
    "/spend",
    "/inventory",
    "/settings/",
    "/shared/",
  ],

  // HR Admin – Zoiko HR product + dedicated /hr-admin routes + shared product access
  [ROLES.HR_ADMIN]: [
    "/hr-admin/dashboard",
    "/hr-admin/my-organization",
    "/hr-admin/employees",
    "/hr-admin/departments",
    "/hr-admin/designations",
    "/hr-admin/attendance",
    "/hr-admin/leave",
    "/hr-admin/onboarding",
    "/hr-admin/recruitment",
    "/hr-admin/performance",
    "/hr-admin/assets",
    "/hr-admin/learning",
    "/hr-admin/documents",
    "/hr-admin/reports",
    "/hr-admin/settings",
    // ── All product paths ──
    "/zoiko-hr",
    "/zoikotime",
    "/payroll",
    "/billing",
    "/projects",
    "/comply",
    "/insights",
    "/spend",
    "/inventory",
    "/settings/",
    "/shared/",
  ],

  // Manager – HR + employee self-service + all product paths
  [ROLES.MANAGER]: [
    "/zoiko-hr",
    "/employee/profile",
    "/employee/ess",
    "/employee/leaves",
    "/employee/documents",
    "/employee/travel",
    // ── All product paths ──
    "/zoikotime",
    "/payroll",
    "/billing",
    "/projects",
    "/comply",
    "/insights",
    "/spend",
    "/inventory",
    "/settings/",
    "/shared/",
  ],

  // Employee – self-service modules only + settings/shared
  [ROLES.EMPLOYEE]: [
    // ── Profile ──────────────────────────────────────────────
    "/employee/profile",
    "/employee/profile/bank-details",
    "/employee/profile/assets",
    "/employee/profile/emergency-contacts",
    "/employee/profile/settings",

    // ── ESS ──────────────────────────────────────────────────
    "/employee/ess",
    "/employee/ess/attendance",
    "/employee/ess/requests",
    "/employee/ess/settings",

    // ── Leaves ───────────────────────────────────────────────
    "/employee/leaves",
    "/employee/leaves/apply",
    "/employee/leaves/calendar",
    "/employee/leaves/history",

    // ── Documents ────────────────────────────────────────────
    "/employee/documents",
    "/employee/documents/my-files",
    "/employee/documents/payslips",
    "/employee/documents/contracts",
    "/employee/documents/tax",
    "/employee/documents/upload-request",

    // ── Travel ───────────────────────────────────────────────
    "/employee/travel",
    "/employee/travel/requests",
    "/employee/travel/approvals",
    "/employee/travel/expenses",
    "/employee/travel/settings",

    // ── Shared & settings ──
    "/settings/",
    "/shared/",
  ],
};

// Route prefixes blocked for specific roles (checked before ROLE_ALLOWED_PREFIXES)
export const ROLE_DISALLOWED_PREFIXES = {
  [ROLES.ADMIN]: ["/zoiko-hr/ess", "/zoiko-hr/employee-management"],
  [ROLES.HR_ADMIN]: ["/zoiko-hr/employee-management"],
};

export const VALID_ROLES = Object.values(ROLES);

// ── Product selection for multi-tenant SaaS registration ──
export const PRODUCTS = {
  HR: "hr",
  TIME: "time",
  PAYROLL: "payroll",
  BILLING: "billing",
  PROJECTS: "projects",
  COMPLY: "comply",
  INSIGHTS: "insights",
  SPEND: "spend",
  INVENTORY: "inventory",
  DOCS: "docs",
  ALL: "all",
};

export const PRODUCT_LABELS = {
  [PRODUCTS.HR]: "Zoiko HR",
  [PRODUCTS.TIME]: "ZoikoTime",
  [PRODUCTS.PAYROLL]: "Zoiko Payroll",
  [PRODUCTS.BILLING]: "Zoiko Billing",
  [PRODUCTS.PROJECTS]: "Zoiko Projects",
  [PRODUCTS.COMPLY]: "Zoiko Comply",
  [PRODUCTS.INSIGHTS]: "Zoiko Insights",
  [PRODUCTS.SPEND]: "Zoiko Spend",
  [PRODUCTS.INVENTORY]: "Zoiko Inventory",
  [PRODUCTS.DOCS]: "Zoiko Docs Pro",
  [PRODUCTS.ALL]: "All",
};

export const PRODUCT_LANDING_ROUTES = {
  [PRODUCTS.HR]: "/organization-admin/dashboard",
  [PRODUCTS.TIME]: "/zoikotime",
  [PRODUCTS.PAYROLL]: "/payroll",
  [PRODUCTS.BILLING]: "/billing",
  [PRODUCTS.PROJECTS]: "/projects",
  [PRODUCTS.COMPLY]: "/comply",
  [PRODUCTS.INSIGHTS]: "/insights",
  [PRODUCTS.SPEND]: "/spend/purchase-requests",
  [PRODUCTS.INVENTORY]: "/inventory/items",
  [PRODUCTS.DOCS]: "/settings/user-management",
};

// Allowed navigation prefixes per product.
// null means allow everything (no restriction).
export const PRODUCT_ALLOWED_PREFIXES = {
  [PRODUCTS.HR]: [
    "/dashboard",
    "/zoiko-hr",
    "/zoikotime",
    "/hr-admin",
    "/employee",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.TIME]: [
    "/dashboard",
    "/zoikotime",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.PAYROLL]: [
    "/dashboard",
    "/payroll",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.BILLING]: [
    "/dashboard",
    "/billing",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.PROJECTS]: [
    "/dashboard",
    "/projects",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.COMPLY]: [
    "/dashboard",
    "/comply",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.INSIGHTS]: [
    "/dashboard",
    "/insights",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.SPEND]: [
    "/dashboard",
    "/spend",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.INVENTORY]: [
    "/dashboard",
    "/inventory",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.DOCS]: [
    "/dashboard",
    "/settings/",
    "/shared/",
    "/organization-admin",
  ],
  [PRODUCTS.ALL]: null,
};
