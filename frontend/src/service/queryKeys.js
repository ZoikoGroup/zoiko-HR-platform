// Query keys for the TanStack Query cache: ["module", "resource", params].
//
// One factory per resource, so a page that reads data and a page that changes it agree on the key. Invalidating a
// prefix (e.g. keys.superAdmin.organizations.all) refreshes the lists and the details under it.
const params = (p) => ({ ...(p || {}) });

export const keys = {
  superAdmin: {
    all: ["superAdmin"],
    commandCenter: {
      all: ["superAdmin", "commandCenter"],
      overview: (days) => ["superAdmin", "commandCenter", "overview", { days }],
      attention: () => ["superAdmin", "commandCenter", "attention"],
      customerHealth: () => ["superAdmin", "commandCenter", "customerHealth"],
      commercialHealth: (days) => ["superAdmin", "commandCenter", "commercialHealth", { days }],
      lifecycle: () => ["superAdmin", "commandCenter", "lifecycle"],
      platformHealth: () => ["superAdmin", "commandCenter", "platformHealth"],
      security: (days) => ["superAdmin", "commandCenter", "security", { days }],
      recentAudit: (limit) => ["superAdmin", "commandCenter", "recentAudit", { limit }],
    },
    organizations: {
      all: ["superAdmin", "organizations"],
      list: (p) => ["superAdmin", "organizations", params(p)],
      detail: (id) => ["superAdmin", "organizations", "detail", id],
      // the parts of one organization's page (audit, billing, delinquency, support grants) share the detail prefix, so
      // invalidating the organization (or the detail) refreshes all of them
      detailPart: (id, part) => ["superAdmin", "organizations", "detail", id, part],
    },
    auditLogs: {
      all: ["superAdmin", "auditLogs"],
      list: (p) => ["superAdmin", "auditLogs", params(p)],
      filters: () => ["superAdmin", "auditLogs", "filters"],
    },
    notifications: {
      all: ["superAdmin", "notifications"],
      list: (p) => ["superAdmin", "notifications", params(p)],
    },
  },
  billing: {
    all: ["billing"],
    plans: () => ["billing", "plans"],
    discounts: () => ["billing", "discounts"],
    delinquency: () => ["billing", "delinquency"],
    refunds: { all: ["billing", "refunds"], list: (p) => ["billing", "refunds", params(p)], summary: (p) => ["billing", "refunds", "summary", params(p)] },
    invoices: { all: ["billing", "invoices"], list: (p) => ["billing", "invoices", params(p)] },
    evaluations: { all: ["billing", "evaluations"], list: (p) => ["billing", "evaluations", params(p)] },
  },
  hr: {
    all: ["hr"],
    dashboard: () => ["hr", "dashboard"],
    leave: { requests: (employeeId) => ["hr", "leave", "requests", employeeId], balances: (employeeId) => ["hr", "leave", "balances", employeeId] },
    me: () => ["hr", "me"],                                  // the signed-in employee's own record
    employees: { all: ["hr", "employees"], list: (p) => ["hr", "employees", params(p)], detail: (id) => ["hr", "employees", "detail", id], profile: (id) => ["hr", "employees", "detail", id, "profile"] },
    departments: () => ["hr", "departments"],
    designations: () => ["hr", "designations"],
  },
  // Documents module (docs/new_docs/ZHR-DOCS-ARCH-001 §9.6). Invalidation rules: modules/zoiko-hr/documents/hooks/invalidation.js
  documents: {
    all: ["documents"],
    employees: {
      all: ["documents", "employees"],
      list: (p) => ["documents", "employees", "list", params(p)],
      detail: (id) => ["documents", "employees", id],
      files: (id, cat) => ["documents", "employees", id, "files", cat],
    },
    employeeCategories: () => ["documents", "employee-categories"],
    company: {
      all: ["documents", "company"],
      categories: (p) => ["documents", "company", "categories", params(p)],
      items: (cat, p) => ["documents", "company", "items", cat, params(p)],
      flat: (p) => ["documents", "company", "flat", params(p)],
      access: (t, id) => ["documents", "access", t, id],
      acks: (id, p) => ["documents", "acks", id, params(p)],
    },
    approvals: {
      all: ["documents", "approvals"],
      summary: () => ["documents", "approvals", "summary"],
      list: (p) => ["documents", "approvals", "list", params(p)],
    },
    audit: (p) => ["documents", "audit", params(p)],
    versions: (id) => ["documents", "versions", id],
    me: {
      all: ["documents", "me"],
      counts: () => ["documents", "me", "counts"],
      categories: () => ["documents", "me", "categories"],
      files: (c) => ["documents", "me", "files", c],
      company: (p) => ["documents", "me", "company", params(p)],
      actions: (k) => ["documents", "me", "actions", k],
      payslips: (p) => ["documents", "me", "payslips", params(p)],
      issued: (k) => ["documents", "me", "issued", k],
    },
  },
  automation: {
    all: ["automation"],
    catalog: () => ["automation", "catalog"],
    rules: (p) => ["automation", "rules", params(p)],
    rule: (id) => ["automation", "rule", id],
    runs: (p) => ["automation", "runs", params(p)],
    run: (id) => ["automation", "run", id],
    settings: () => ["automation", "settings"],
    templates: () => ["automation", "templates"],
    template: (k, c, l) => ["automation", "template", k, c, l],
    retention: () => ["automation", "retention"],
  },
  orgAdmin: {
    all: ["orgAdmin"],
    users: { all: ["orgAdmin", "users"], list: (p) => ["orgAdmin", "users", params(p)] },
    assignableRoles: () => ["orgAdmin", "assignableRoles"],
  },
  notifications: {
    all: ["notifications"],
    unreadCount: () => ["notifications", "unreadCount"],
    list: (p) => ["notifications", "list", params(p)],
  },
};
