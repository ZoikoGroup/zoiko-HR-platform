import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BadgeCheck,
  Layers,
  BarChart3,
  RefreshCw,
  ChevronRight,
  Plus,
} from "lucide-react";
import * as hrService from "../../../service/hrService";

export const DESIGNATION_NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/designations", icon: LayoutDashboard },
  { label: "Designation List", href: "/zoiko-hr/designations/list", icon: BadgeCheck },
  { label: "Level Matrix", href: "/zoiko-hr/designations/levels", icon: Layers },
  { label: "Reports", href: "/zoiko-hr/designations/reports", icon: BarChart3 },
];

const DESIG_SYNC_EVENT = "zoiko-designations-updated";

/**
 * Trigger this anywhere a designation is created, edited, deleted, or assigned.
 * All designation views and tabs will automatically update immediately.
 */
export function notifyDesignationsUpdated(payload = null) {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      const Evt = typeof window.CustomEvent === "function" ? window.CustomEvent : CustomEvent;
      window.dispatchEvent(new Evt(DESIG_SYNC_EVENT, { detail: payload }));
    } catch {
      // Safe fallback
    }
  }
}

// In-memory cache for instant 0ms tab navigation
let cachedDesignations = null;
let cachedDepartments = null;
let lastFetchTime = 0;

/**
 * Hook providing cached, high-performance designation & department data with auto-sync.
 */
export function useDesignationData({ autoPoll = true, pollIntervalMs = 45000 } = {}) {
  const [designations, setDesignations] = useState(cachedDesignations || []);
  const [departments, setDepartments] = useState(cachedDepartments || []);
  const [loading, setLoading] = useState(!cachedDesignations);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const getDesigFn = typeof hrService.getDesignations === "function" ? hrService.getDesignations : async () => ({ data: [] });
      const getDeptFn = typeof hrService.getDepartments === "function" ? hrService.getDepartments : async () => ({ data: [] });
      const [desigRes, deptRes] = await Promise.all([
        getDesigFn().catch(() => ({ data: [] })),
        getDeptFn({ include_inactive: true }).catch(() => ({ data: [] })),
      ]);

      const rawDesig = desigRes?.data?.data ?? desigRes?.data?.items ?? desigRes?.data ?? desigRes?.items ?? desigRes ?? [];
      const desigList = Array.isArray(rawDesig) ? rawDesig : (Array.isArray(rawDesig?.items) ? rawDesig.items : []);

      const rawDept = deptRes?.data?.data ?? deptRes?.data?.items ?? deptRes?.data ?? deptRes?.items ?? deptRes ?? [];
      const deptList = Array.isArray(rawDept) ? rawDept : (Array.isArray(rawDept?.items) ? rawDept.items : []);

      cachedDesignations = desigList;
      cachedDepartments = deptList;
      lastFetchTime = Date.now();

      setDesignations(desigList);
      setDepartments(deptList);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Designation sync error:", err);
      if (!isBackground) {
        setError(err?.message || "Failed to load designations");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // If cache is older than 30s or empty, fetch fresh data; otherwise use instant cache and background-validate
    const isStale = !cachedDesignations || Date.now() - lastFetchTime > 30000;
    if (isStale) {
      fetchData();
    } else {
      fetchData(true);
    }

    const handleSync = () => {
      fetchData(true);
    };

    window.addEventListener(DESIG_SYNC_EVENT, handleSync);
    window.addEventListener("focus", handleSync);

    let intervalId = null;
    if (autoPoll) {
      intervalId = setInterval(() => {
        if (typeof document !== "undefined" && !document.hidden) {
          fetchData(true);
        }
      }, pollIntervalMs);
    }

    return () => {
      window.removeEventListener(DESIG_SYNC_EVENT, handleSync);
      window.removeEventListener("focus", handleSync);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchData, autoPoll, pollIntervalMs]);

  return {
    designations,
    departments,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh: () => fetchData(false),
  };
}

export default function DesignationLayout({
  title,
  subtitle,
  actions,
  children,
  lastUpdated,
  isRefreshing,
  onRefresh,
}) {
  return (
    <div className="portal-main min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Navy Gradient Hero Banner */}
      <header className="relative overflow-hidden rounded-b-3xl shadow-[0_12px_36px_rgba(4,7,20,0.25)] sm:rounded-3xl bg-gradient-to-r from-[#070D1E] via-[#0E1B38] to-[#142850] text-white">
        {/* Subtle Ambient Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/3 -bottom-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-2xl"
        />

        <div className="relative mx-auto max-w-[1600px] px-4 pt-5 pb-0 sm:px-6 lg:px-8">
          {/* Breadcrumb + Live Status Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
              <span className="hover:text-slate-300 transition-colors">Zoiko HR</span>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <span className="text-slate-300 font-medium">Designations</span>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <span className="text-blue-300 font-semibold">{title}</span>
            </nav>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-white/10 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>Live · Updated just now</span>
              </div>

              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  title="Refresh designation data"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/20 transition-all ring-1 ring-white/10 disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isRefreshing ? "animate-spin text-blue-300" : ""}`}
                  />
                  <span>Sync</span>
                </button>
              )}
            </div>
          </div>

          {/* Title Area + Action Buttons */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pb-2 w-full">
            <div className="flex min-w-0 items-center gap-3 max-w-full">
              <span
                aria-hidden="true"
                className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/25 to-indigo-600/35 ring-1 ring-white/15 backdrop-blur-sm text-blue-300 shadow-inner"
              >
                <BadgeCheck className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.2]" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-[28px] font-bold tracking-tight text-white truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed line-clamp-2 sm:line-clamp-none">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">{actions}</div>}
          </div>

          {/* Unified White Folder Navigation Tabs */}
          <nav aria-label="Designations tabs" className="mt-4 flex items-end gap-1.5 overflow-x-auto border-b border-transparent pt-1 scrollbar-none -mb-px">
            {DESIGNATION_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === "/zoiko-hr/designations"}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2 whitespace-nowrap rounded-t-xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? "bg-slate-50 text-slate-900 shadow-[0_-2px_8px_rgba(0,0,0,0.12)] -mb-px z-10"
                        : "text-slate-300/80 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          isActive
                            ? "text-blue-600"
                            : "text-slate-400 group-hover:text-slate-200"
                        }`}
                      />
                      <span>{item.label}</span>
                      {isActive && (
                        <span className="absolute top-0 inset-x-0 h-0.5 rounded-t-xl bg-blue-600" />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="mx-auto max-w-[1600px] w-full px-3 sm:px-6 lg:px-8 py-5 sm:py-6 min-w-0">
        {children}
      </main>
    </div>
  );
}
