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
    employees: { all: ["hr", "employees"], list: (p) => ["hr", "employees", params(p)], detail: (id) => ["hr", "employees", "detail", id] },
    departments: () => ["hr", "departments"],
    designations: () => ["hr", "designations"],
  },
  orgAdmin: {
    all: ["orgAdmin"],
    users: { all: ["orgAdmin", "users"], list: (p) => ["orgAdmin", "users", params(p)] },
  },
  notifications: {
    all: ["notifications"],
    unreadCount: () => ["notifications", "unreadCount"],
    list: (p) => ["notifications", "list", params(p)],
  },
};
