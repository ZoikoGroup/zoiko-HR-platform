// What each self-serve plan includes, in plain language. Source: ZHR-COM-ENT-001 section 5 (docs/), the
// commercial entitlement matrix. Enterprise is contract-priced and handled by sales, so it is not listed here.
// Values: true = included, false = not included, or a short text for a limit / lighter version of the feature.
// Wording only: this table informs customers, it does not switch features on or off by itself.

export const PLAN_MATRIX = [
  {
    section: "Core HR & self-service",
    rows: [
      { feature: "Employee records, profiles & history", core: true, advanced: true },
      { feature: "Employee directory & org chart", core: true, advanced: true },
      { feature: "Locations, departments & teams", core: true, advanced: true },
      { feature: "Employee & manager self-service, mobile access", core: true, advanced: true },
      { feature: "Legal entities", core: "1 active legal entity", advanced: "Multiple entities" },
      { feature: "Position management", core: false, advanced: true },
      { feature: "Custom HR fields", core: "Standard set", advanced: "Expanded" },
    ],
  },
  {
    section: "Onboarding, leave & documents",
    rows: [
      { feature: "Onboarding plans", core: "Standard templates", advanced: "Custom & reusable" },
      { feature: "Lifecycle automation & conditional tasks", core: false, advanced: true },
      { feature: "Leave requests, balances & calendars", core: "Standard policies", advanced: "Advanced policies" },
      { feature: "Complex accrual & carry-over rules", core: false, advanced: true },
      { feature: "Multi-country leave configuration", core: false, advanced: true },
      { feature: "Documents, employee files & policy acknowledgments", core: true, advanced: true },
      { feature: "Bulk document distribution", core: false, advanced: true },
      { feature: "Document workflows & e-sign orchestration", core: false, advanced: "Where enabled" },
    ],
  },
  {
    section: "Workflows & performance",
    rows: [
      { feature: "Standard HR workflows & approvals", core: true, advanced: true },
      { feature: "Custom workflow builder", core: false, advanced: true },
      { feature: "Conditional & multi-step approvals", core: false, advanced: true },
      { feature: "Bulk operational actions", core: false, advanced: true },
      { feature: "Performance reviews, goals & 1:1s", core: false, advanced: true },
      { feature: "Performance reporting", core: false, advanced: true },
    ],
  },
  {
    section: "Reporting",
    rows: [
      { feature: "Standard dashboards & HR reports", core: true, advanced: true },
      { feature: "CSV / Excel export", core: "Standard", advanced: "Expanded" },
      { feature: "Custom report builder & dashboards", core: false, advanced: true },
      { feature: "Scheduled & shared reports", core: false, advanced: true },
      { feature: "Cross-entity analysis", core: false, advanced: true },
    ],
  },
  {
    section: "AI assistance",
    rows: [
      { feature: "Product help & navigation assistant", core: "Fair-use limits", advanced: true },
      { feature: "Policy & document Q&A", core: "Standard sources", advanced: "Expanded sources" },
      { feature: "Workforce-data questions", core: false, advanced: true },
      { feature: "Summaries & drafting help", core: "Limited to admin-safe content", advanced: true },
      { feature: "Workflow assistance", core: false, advanced: true },
    ],
  },
  {
    section: "Integrations & security",
    rows: [
      { feature: "CSV import / export", core: true, advanced: true },
      { feature: "Third-party integrations", core: "Limited catalog", advanced: "Expanded catalog" },
      { feature: "API access & webhooks", core: false, advanced: true },
      { feature: "Single sign-on (SAML / OIDC)", core: false, advanced: true },
      { feature: "MFA, role-based access, audit trail, tenant isolation", core: true, advanced: true },
    ],
  },
  {
    section: "Support",
    rows: [
      { feature: "Standard support", core: true, advanced: true },
      { feature: "Priority support routing", core: false, advanced: true },
      { feature: "Implementation, data migration & custom integrations", core: "Separate paid service", advanced: "Separate paid service" },
    ],
  },
];

/** The handful of differences worth showing on a plan card: what the plan does NOT include that the other does. */
export function planHighlights(planCode) {
  const key = planCode === "advanced" ? "advanced" : "core";
  const rows = PLAN_MATRIX.flatMap((s) => s.rows);
  if (key === "advanced") {
    return {
      includes: ["Everything in Core", ...rows.filter((r) => r.core === false && r.advanced === true).slice(0, 6).map((r) => r.feature)],
      excludes: [],
    };
  }
  return {
    includes: rows.filter((r) => r.core === true).slice(0, 5).map((r) => r.feature),
    excludes: rows.filter((r) => r.core === false).slice(0, 6).map((r) => r.feature),
  };
}

/** A readable name for a feature key when the page did not pass one. */
export function feature_label_fallback(key) {
  const names = { "hr.performance.cycles": "Performance management" };
  return names[key] || "This feature";
}
