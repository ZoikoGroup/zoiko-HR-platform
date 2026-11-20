// Shared pieces for the admin Assets and Asset Requests pages (audit batch 2: A3, A4, A5, A9).
// Lists page on the server; the employee and asset pickers search the server as the admin types.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAssetEmployeeOptions, getAssets } from "../../service/hrService";

export const PAGE_SIZE = 20;

/** Today as YYYY-MM-DD in the browser's own time zone (for <input type="date" max>). */
export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A purchase date after today is a typo (e.g. 2099); the server refuses it too. */
export function isFutureDate(iso, today = todayISO()) {
  return Boolean(iso) && iso > today;
}

export function pageCount(total, perPage = PAGE_SIZE) {
  return Math.max(1, Math.ceil((Number(total) || 0) / perPage));
}

/** `value`, settled for `delay` ms (so a request goes out when the admin stops typing, not on every key). */
export function useDebounced(value, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

/** Search results from the server, newest query wins. `load(query)` returns a promise of an array or {items}. */
function useServerSearch(load, query, enabled, deps = []) {
  const settled = useDebounced(query);
  const [state, setState] = useState({ items: [], loading: false, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve(load(settled.trim()))
      .then((data) => {
        if (live) setState({ items: Array.isArray(data) ? data : data?.items || [], loading: false, error: null });
      })
      .catch((err) => {
        if (live) setState({ items: [], loading: false, error: err?.message || "Search failed" });
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, enabled, ...deps]);
  return state;
}

/** Active staff (or everyone, with includeInactive, for filtering by holder), ordered by name, matched on the server. */
export function useEmployeeOptions(query, { enabled = true, includeInactive = false, limit = 10 } = {}) {
  return useServerSearch(
    (search) => getAssetEmployeeOptions({ search: search || undefined, limit, include_inactive: includeInactive || undefined }),
    query, enabled, [includeInactive, limit],
  );
}

/** Available assets matching the query (for fulfilling a request). */
export function useAvailableAssets(query, { enabled = true, limit = 10 } = {}) {
  return useServerSearch(
    (search) => getAssets({ status: "available", search: search || undefined, per_page: limit, sort_by: "name", sort_order: "asc" }),
    query, enabled, [limit],
  );
}

export function Pager({ page, total, perPage = PAGE_SIZE, onPage, label = "items" }) {
  const pages = pageCount(total, perPage);
  if (!total) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-[#334155] text-xs text-slate-500 dark:text-slate-400" data-testid="pager">
      <span>{from}–{to} of {total} {label}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-[#334155] hover:bg-slate-50 dark:hover:bg-slate-700/40 disabled:opacity-40">
          <ChevronLeft size={14} />
        </button>
        <span>Page {page} of {pages}</span>
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-[#334155] hover:bg-slate-50 dark:hover:bg-slate-700/40 disabled:opacity-40">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
