// Prefetching, on intent only: hovering or focusing a sidebar link (or touching it) starts the page's code chunk and,
// for the heaviest pages, its first data request, so the click finds both already on the way or in the cache. Nothing
// here runs on its own; a missing or failing prefetch just means the page loads normally on click.
import { queryClient } from "./queryClient";
import { keys } from "../service/queryKeys";

let routeTable = {};

/** App.jsx hands over its path → element table once; each element's component may carry a .preload(). */
export function registerRoutes(table) {
  routeTable = table || {};
}

const cleanPath = (href) => (href ? String(href).split(/[?#]/)[0] : "");

export function preloadChunk(href) {
  const preload = routeTable[cleanPath(href)]?.type?.preload;
  return typeof preload === "function" ? preload() : undefined;
}

// First-page data of the pages where it pays off. The query keys are the ones the pages themselves use (the same
// factory and the same default parameters), so the page reads what was prefetched; staleTime keeps a fresh entry from
// being fetched twice.
const FRESH = 30_000;
const prefetch = (queryKey, queryFn) => queryClient.prefetchQuery({ queryKey, queryFn, staleTime: FRESH }).catch(() => {});

export const ORGANIZATIONS_DEFAULT_PARAMS = { page: 1, page_size: 20, deleted: "active" };
export const EMPLOYEES_DEFAULT_PARAMS = { page: 1, per_page: 10, search: "", status: "", department_id: "", employment_type: "" };

const dataPrefetchers = {
  "/super-admin/organizations": async () => {
    const { superAdminService } = await import("../service/superAdminService");
    return prefetch(keys.superAdmin.organizations.list(ORGANIZATIONS_DEFAULT_PARAMS), () => superAdminService.getOrganizations(ORGANIZATIONS_DEFAULT_PARAMS));
  },
  "/super-admin/audit-logs": async () => {
    const [{ superAdminService }, { buildAuditParams, EMPTY_AUDIT_FILTERS }] = await Promise.all([import("../service/superAdminService"), import("../utils/auditFilters")]);
    const params = buildAuditParams(EMPTY_AUDIT_FILTERS, { page: 1, pageSize: 50 });
    return Promise.all([
      prefetch(keys.superAdmin.auditLogs.list(params), () => superAdminService.getAuditLogs(params)),
      prefetch(keys.superAdmin.auditLogs.filters(), () => superAdminService.getAuditLogFilters()),
    ]);
  },
  "/super-admin/billing": async () => {
    const [{ superAdminService }, { billingService }] = await Promise.all([import("../service/superAdminService"), import("../service/billingService")]);
    const orgParams = { page: 1, page_size: 5 };
    return Promise.all([
      prefetch(keys.billing.plans(), () => billingService.getPlans()),
      prefetch(keys.billing.discounts(), () => billingService.getDiscounts()),
      prefetch(keys.superAdmin.organizations.list(orgParams), () => superAdminService.getOrganizations(orgParams)),
      prefetch(keys.superAdmin.commandCenter.commercialHealth(30), () => superAdminService.getCommandCenterCommercialHealth({ days: 30 })),
      prefetch(keys.superAdmin.commandCenter.lifecycle(), () => superAdminService.getCommandCenterLifecycle()),
      prefetch(keys.billing.delinquency(), () => billingService.getPlatformDelinquency()),
    ]);
  },
  "/zoiko-hr/employee-management/employees": async () => {
    const employee = await import("../service/employee");
    return Promise.all([
      prefetch(keys.hr.employees.list(EMPLOYEES_DEFAULT_PARAMS), () => employee.getEmployees(EMPLOYEES_DEFAULT_PARAMS)),
      prefetch(keys.hr.departments(), () => employee.getDepartments()),
    ]);
  },
};

/** Start what a click on this link will need: its code, and its first data where that is known. Safe to call often. */
export function prefetchRoute(href) {
  try {
    preloadChunk(href);
    dataPrefetchers[cleanPath(href)]?.()?.catch?.(() => {});
  } catch { /* prefetching never breaks the page */ }
}

/** After sign-in, once the landing page has had time to render, warm the next pages the person most likely opens. The
 *  landing page's own data is not touched here: the page asks for that itself. */
const LIKELY_NEXT = {
  super_admin: ["/super-admin/organizations", "/super-admin/audit-logs", "/super-admin/billing"],
  admin: ["/organization-admin/users"],
  hr_admin: ["/zoiko-hr/employee-management/employees"],
};
export function prefetchAfterLogin(role, { delayMs = 1500 } = {}) {
  const hrefs = LIKELY_NEXT[role];
  if (!hrefs || typeof window === "undefined") return () => {};
  const run = () => hrefs.forEach((h) => preloadChunk(h));           // code only: cheap, and never touches the API
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 0));
  const timer = window.setTimeout(() => idle(run), delayMs);
  return () => window.clearTimeout(timer);
}
