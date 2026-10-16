// Department Settings: the defaults, a tolerant reader for what the server returns, and the same checks the
// server makes (so a mistake is shown next to the field before anything is sent).

export const NOTIFICATION_KEYS = ["created", "updated", "head_changed", "budget_updated", "status_changed", "added_under_hierarchy", "deletion_requested"];
export const ITEMS_PER_PAGE_OPTIONS = [5, 10, 15, 25, 50];
export const SORT_FIELDS = ["name", "code", "employee_count", "budget", "created_at"];

export const DEFAULT_DEPARTMENT_SETTINGS = Object.freeze({
  code_prefix: "DEPT",
  default_status: "active",
  auto_generate_codes: true,
  enforce_unique_codes: true,
  max_hierarchy_depth: 5,
  allow_cross_heads: true,
  require_parent: false,
  enforce_single_parent: true,
  notifications: Object.freeze(Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, true]))),
  show_budget: true,
  show_employee_count: true,
  default_sort_field: "name",
  default_sort_direction: "asc",
  items_per_page: 10,
  compact_mode: false,
});

/** Server response -> complete settings object. Missing or malformed pieces fall back to the default. */
export function normalizeDepartmentSettings(data) {
  const d = DEFAULT_DEPARTMENT_SETTINGS;
  const src = data && typeof data === "object" ? data : {};
  const bool = (key) => (typeof src[key] === "boolean" ? src[key] : d[key]);
  const oneOf = (key, allowed) => (allowed.includes(src[key]) ? src[key] : d[key]);
  const notes = src.notifications && typeof src.notifications === "object" ? src.notifications : {};
  return {
    code_prefix: typeof src.code_prefix === "string" && src.code_prefix ? src.code_prefix : d.code_prefix,
    default_status: oneOf("default_status", ["active", "inactive"]),
    auto_generate_codes: bool("auto_generate_codes"),
    enforce_unique_codes: bool("enforce_unique_codes"),
    max_hierarchy_depth: Number.isInteger(src.max_hierarchy_depth) ? src.max_hierarchy_depth : d.max_hierarchy_depth,
    allow_cross_heads: bool("allow_cross_heads"),
    require_parent: bool("require_parent"),
    enforce_single_parent: bool("enforce_single_parent"),
    notifications: Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, typeof notes[k] === "boolean" ? notes[k] : true])),
    show_budget: bool("show_budget"),
    show_employee_count: bool("show_employee_count"),
    default_sort_field: oneOf("default_sort_field", SORT_FIELDS),
    default_sort_direction: oneOf("default_sort_direction", ["asc", "desc"]),
    items_per_page: ITEMS_PER_PAGE_OPTIONS.includes(src.items_per_page) ? src.items_per_page : d.items_per_page,
    compact_mode: bool("compact_mode"),
  };
}

/** { "tab.field": "message" } for every invalid value; empty when the settings can be saved. */
export function validateDepartmentSettings(s) {
  const errors = {};
  if (!/^[A-Z0-9]{2,6}$/.test(String(s.code_prefix || "").trim().toUpperCase())) {
    errors["general.code_prefix"] = "Use 2 to 6 letters or digits, for example DEPT.";
  }
  const depth = s.max_hierarchy_depth;
  if (!Number.isInteger(depth) || depth < 1 || depth > 10) {
    errors["hierarchy.max_hierarchy_depth"] = "Enter a whole number from 1 to 10.";
  }
  return errors;
}
