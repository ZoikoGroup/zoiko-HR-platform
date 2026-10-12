/**
 * utils/auditFilters.js
 * ---------------------
 * Audit Logs filter state <-> API params <-> URL query string. Kept pure so the
 * date-range boundary logic is unit-testable.
 */

export const EMPTY_AUDIT_FILTERS = {
  action: "",
  entityType: "",
  entityId: "",
  actor: "",
  search: "",
  ip: "",
  dateFrom: "", // yyyy-mm-dd in the viewer's local calendar
  dateTo: "", // yyyy-mm-dd, inclusive
};

const URL_KEYS = {
  action: "action",
  entityType: "entity_type",
  entityId: "entity_id",
  actor: "actor",
  search: "search",
  ip: "ip",
  dateFrom: "from",
  dateTo: "to",
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function localMidnight(ymd, addDays = 0) {
  const m = DATE_RE.exec(ymd || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays, 0, 0, 0, 0);
}

/**
 * Inclusive day range in the viewer's timezone -> UTC instants for the API:
 * created_from = local midnight of the first day; created_before = local
 * midnight of the day AFTER the last day (the backend bound is exclusive).
 */
export function buildAuditParams(filters, { page = 1, pageSize = 50 } = {}) {
  const params = { page, page_size: pageSize };
  if (filters.action) params.action = filters.action;
  if (filters.entityType) params.entity_type = filters.entityType;
  if (filters.entityId !== "" && filters.entityId != null && !Number.isNaN(Number(filters.entityId))) {
    params.entity_id = Number(filters.entityId);
  }
  if (filters.actor.trim()) params.actor = filters.actor.trim();
  if (filters.search.trim()) params.search = filters.search.trim();
  if (filters.ip.trim()) params.ip = filters.ip.trim();
  const from = localMidnight(filters.dateFrom);
  if (from) params.created_from = from.toISOString();
  const before = localMidnight(filters.dateTo, 1);
  if (before) params.created_before = before.toISOString();
  return params;
}

export function filtersFromSearchParams(searchParams) {
  const f = { ...EMPTY_AUDIT_FILTERS };
  for (const [key, urlKey] of Object.entries(URL_KEYS)) {
    f[key] = searchParams.get(urlKey) || "";
  }
  return f;
}

/** Only non-empty filters (and page > 1) are written, so the URL stays clean. */
export function filtersToSearchParams(filters, page = 1) {
  const next = new URLSearchParams();
  for (const [key, urlKey] of Object.entries(URL_KEYS)) {
    if (filters[key]) next.set(urlKey, String(filters[key]));
  }
  if (page > 1) next.set("page", String(page));
  return next;
}

export function hasActiveAuditFilters(filters) {
  return Object.keys(EMPTY_AUDIT_FILTERS).some((k) => filters[k] !== EMPTY_AUDIT_FILTERS[k]);
}
