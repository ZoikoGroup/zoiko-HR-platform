import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  GitBranch,
  BarChart3,
  RefreshCw,
  ChevronRight,
  Plus,
} from "lucide-react";
import { getDepartments } from "../../../service/hrService";

export const DEPARTMENT_NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/departments", icon: LayoutDashboard },
  { label: "Department List", href: "/zoiko-hr/departments/list", icon: Building2 },
  { label: "Department Structure", href: "/zoiko-hr/departments/structure", icon: GitBranch },
  { label: "Reports", href: "/zoiko-hr/departments/reports", icon: BarChart3 },
];

const DEPT_SYNC_EVENT = "zoiko-departments-updated";

/**
 * Trigger this anywhere a department is created, updated, or toggled.
 * All open department tabs and views will automatically refresh immediately.
 */
export function notifyDepartmentsUpdated(payload = null) {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      const Evt = typeof window.CustomEvent === "function" ? window.CustomEvent : CustomEvent;
      window.dispatchEvent(new Evt(DEPT_SYNC_EVENT, { detail: payload }));
    } catch {
      // Safe fallback for testing environments
    }
  }
}

/**
 * Hook providing self-updating department data, active counts, refresh action,
 * auto-polling (every 45s when window active), and window-focus sync.
 */
export function useDepartmentData({ autoPoll = true, pollIntervalMs = 45000 } = {}) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchDepts = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const res = await getDepartments({ include_inactive: true, _: Date.now() });
      const raw = res?.data?.data ?? res?.data?.items ?? res?.data ?? res?.items ?? res ?? [];
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
      setDepartments(list);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Department sync failed:", err);
      if (!isBackground) {
        setError(err?.message || "Failed to sync department data");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDepts();

    const handleSync = () => {
      fetchDepts(true);
    };

    window.addEventListener(DEPT_SYNC_EVENT, handleSync);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchDepts(true);
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);

    let intervalId = null;
    if (autoPoll) {
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchDepts(true);
        }
      }, pollIntervalMs);
    }

    return () => {
      window.removeEventListener(DEPT_SYNC_EVENT, handleSync);
      window.removeEventListener("visibilitychange", handleVisibility);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchDepts, autoPoll, pollIntervalMs]);

  return {
    departments,
    setDepartments,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh: () => fetchDepts(false),
  };
}

/**
 * Format relative time (e.g. "Updated just now", "Updated 2m ago")
 */
export function formatLastUpdated(date) {
  if (!date) return "";
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 10) return "Live · Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  return `Updated at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Shared high-end layout for all Department pages with cohesive navy header band,
 * breadcrumbs, live sync status badge, quick actions, and joined folder tabs.
 */
export default function DepartmentLayout({
  title,
  subtitle,
  actions,
  badge,
  refreshing,
  lastUpdated,
  onRefresh,
  children,
}) {
  const rawPathname = typeof window !== "undefined" ? window.location.pathname : "/zoiko-hr/departments";
  const pathname = rawPathname.replace(/\/+$/, "") || "/zoiko-hr/departments";

  return (
    <div className="portal-main min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-slate-900 flex flex-col font-sans">
      <header className="relative overflow-hidden rounded-b-3xl shadow-[0_12px_36px_rgba(4,7,20,0.25)] sm:rounded-3xl bg-gradient-to-r from-[#070D1E] via-[#0E1B38] to-[#142850] text-white">
        {/* Ambient glow effects */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/3 -bottom-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-2xl"
        />

        <div className="relative mx-auto max-w-[1600px] px-4 pt-5 pb-0 sm:px-6 lg:px-8">
          {/* Breadcrumb & Live Auto-Update status */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
              <span className="hover:text-slate-300 transition-colors">Zoiko HR</span>
              <ChevronRight className="h-3 w-3 text-slate-600" aria-hidden="true" />
              <span className="text-slate-300 font-medium">Departments</span>
              <ChevronRight className="h-3 w-3 text-slate-600" aria-hidden="true" />
              <span className="text-blue-300 font-semibold">{title}</span>
            </nav>

            <div className="flex items-center gap-2">
              {lastUpdated && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-white/10 backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>{formatLastUpdated(lastUpdated)}</span>
                </div>
              )}

              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  title="Refresh department data"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/20 transition-all ring-1 ring-white/10 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin text-blue-300" : ""}`} />
                  <span>{refreshing ? "Syncing…" : "Sync"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Title Row & Actions */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pb-2 w-full">
            <div className="flex min-w-0 items-center gap-3 max-w-full">
              <span
                className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 shadow-inner"
                aria-hidden="true"
              >
                <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-300" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl lg:text-[28px] font-bold tracking-tight text-white truncate">
                    {title}
                  </h1>
                  {badge && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-blue-200 ring-1 ring-inset ring-blue-400/30 shrink-0">
                      {badge}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed line-clamp-2 sm:line-clamp-none">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {actions && (
              <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">
                {actions}
              </div>
            )}
          </div>

          {/* Integrated Navigation Tabs joining the page content */}
          <nav aria-label="Departments tabs" className="mt-4 flex items-end gap-1.5 overflow-x-auto border-b border-transparent pt-1 scrollbar-none -mb-px">
            {DEPARTMENT_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isExact = item.href === "/zoiko-hr/departments";
              const active = isExact ? pathname === item.href : pathname.startsWith(item.href);

              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={isExact}
                  className={`group relative inline-flex items-center gap-2 whitespace-nowrap rounded-t-xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all ${
                    active
                      ? "bg-slate-50 text-slate-900 shadow-sm font-semibold -mb-px z-10"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-200"}`} />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute top-0 inset-x-0 h-0.5 rounded-t-xl bg-blue-600" />
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main page content container */}
      <main className="mx-auto max-w-[1600px] w-full px-3 sm:px-6 lg:px-8 py-5 sm:py-6 min-w-0">
        {children}
      </main>
    </div>
  );
}
