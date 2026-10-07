import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import {
  AlertTriangle, FileText, ChevronLeft, ChevronRight, Clock, Activity, X, Copy, Check, Search,
} from "lucide-react";
import { superAdminService } from "../../service/superAdminService";
import { formatDateTimeWithZone, timeZoneLabel } from "../../utils/dateTime";
import {
  EMPTY_AUDIT_FILTERS, buildAuditParams, filtersFromSearchParams, filtersToSearchParams,
  hasActiveAuditFilters,
} from "../../utils/auditFilters";

const ACTION_COLORS = {
  create: "bg-emerald-50 text-emerald-600 border border-emerald-100",
  update: "bg-blue-50 text-blue-600 border border-blue-100",
  delete: "bg-red-50 text-red-600 border border-red-100",
  suspend: "bg-amber-50 text-amber-600 border border-amber-100",
  activate: "bg-emerald-50 text-emerald-600 border border-emerald-100",
  reactivated: "bg-emerald-50 text-emerald-600 border border-emerald-100",
  approved: "bg-emerald-50 text-emerald-600 border border-emerald-100",
  rejected: "bg-red-50 text-red-600 border border-red-100",
  on_hold: "bg-amber-50 text-amber-600 border border-amber-100",
  login: "bg-blue-50 text-blue-600 border border-blue-100",
  logout: "bg-slate-50 text-slate-600 border border-slate-100",
  config_change: "bg-blue-50 text-blue-600 border border-blue-100",
};

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 350;

const fieldCls =
  "rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-700 outline-none transition hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-[#3B82F6]/30";

const label = (s) => String(s || "").replace(/_/g, " ");

function CopyButton({ text, title = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) — the value is still selectable */
    }
  };
  return (
    <button type="button" onClick={copy} title={title} aria-label={title}
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function DetailRow({ name, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-slate-100 py-2 text-sm">
      <dt className="font-semibold text-slate-500">{name}</dt>
      <dd className="col-span-2 min-w-0 break-words text-slate-800">{children}</dd>
    </div>
  );
}

function LogDetailsDialog({ log, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Audit log details"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Audit entry #{log.id}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <dl>
          <DetailRow name="Action">{label(log.action)}</DetailRow>
          <DetailRow name="Entity">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ""}</DetailRow>
          <DetailRow name="Performed by">{log.performed_by_email || "System"}</DetailRow>
          <DetailRow name={`Time (${timeZoneLabel(log.created_at ? new Date(log.created_at) : new Date())})`}>{log.created_at ? formatDateTimeWithZone(log.created_at) : "—"}</DetailRow>
          <DetailRow name="IP address">
            {log.ip_address ? (
              <span className="inline-flex items-center gap-1 font-mono">
                {log.ip_address}
                <CopyButton text={log.ip_address} title="Copy IP address" />
              </span>
            ) : "—"}
          </DetailRow>
        </dl>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Details</span>
            {log.details && <CopyButton text={JSON.stringify(log.details, null, 2)} title="Copy details" />}
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {log.details ? JSON.stringify(log.details, null, 2) : "No additional details."}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  // What the query actually uses: text inputs are debounced, selects/dates apply at once.
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [options, setOptions] = useState({ actions: [], entity_types: [] });
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Dropdown options come from the server: every loggable action + entity types present.
  useEffect(() => {
    superAdminService.getAuditLogFilters()
      .then((o) => setOptions({ actions: o.actions || [], entity_types: o.entity_types || [] }))
      .catch(() => { /* the page still works; selects just show "All" */ });
  }, []);

  // Any filter change -> debounce -> apply and go back to page 1.
  useEffect(() => {
    if (JSON.stringify(filters) === JSON.stringify(applied)) return undefined;
    const t = setTimeout(() => { setApplied(filters); setPage(1); }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters, applied]);

  // Keep the URL in sync (shareable / survives reload).
  useEffect(() => {
    setSearchParams(filtersToSearchParams(applied, page), { replace: true });
  }, [applied, page, setSearchParams]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await superAdminService.getAuditLogs(buildAuditParams(applied, { page, pageSize: PAGE_SIZE }));
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load audit logs", e);
      setError(e.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => { setFilters(EMPTY_AUDIT_FILTERS); setApplied(EMPTY_AUDIT_FILTERS); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = hasActiveAuditFilters(filters);

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Audit Logs" description="Track all platform-level actions and configuration changes." />

      {applied.entityId && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#3B82F6]/20 bg-[#3B82F6]/5 px-4 py-3 text-sm text-[#1E40AF]">
          <Activity className="h-4 w-4" />
          <span>Showing audit trail for {applied.entityType || "entity"} <strong>#{applied.entityId}</strong></span>
          <button onClick={() => { setFilter("entityId", ""); setFilter("entityType", ""); }}
            className="ml-auto flex items-center gap-1 text-xs font-semibold hover:underline">
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadLogs} className="ml-auto text-xs font-semibold underline hover:text-red-800">Retry</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Platform Audit Trail ({total})</h3>
          {active && (
            <button onClick={clearFilters} className="text-xs font-semibold text-[#3B82F6] hover:underline">
              Clear filters
            </button>
          )}
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={filters.search} onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Search actor, entity, IP or details…" className={`${fieldCls} w-full pl-9`} aria-label="Search audit logs" />
          </div>
          <select value={filters.action} onChange={(e) => setFilter("action", e.target.value)} className={fieldCls} aria-label="Action">
            <option value="">All actions</option>
            {options.actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </select>
          <select value={filters.entityType} onChange={(e) => setFilter("entityType", e.target.value)} className={fieldCls} aria-label="Entity type">
            <option value="">All entities</option>
            {options.entity_types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" value={filters.actor} onChange={(e) => setFilter("actor", e.target.value)}
            placeholder="Performed by (email)" className={fieldCls} aria-label="Performed by" />
          <input type="text" value={filters.ip} onChange={(e) => setFilter("ip", e.target.value)}
            placeholder="IP address" className={fieldCls} aria-label="IP address" />
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            From
            <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined}
              onChange={(e) => setFilter("dateFrom", e.target.value)} className={`${fieldCls} flex-1`} />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            To
            <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
              onChange={(e) => setFilter("dateTo", e.target.value)} className={`${fieldCls} flex-1`} />
          </label>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <FileText className="mx-auto mb-3 h-10 w-10 text-blue-300 opacity-40" />
            {active ? "No audit logs match these filters." : "No audit logs found"}
            {active && <button onClick={clearFilters} className="ml-2 font-semibold text-[#3B82F6] hover:underline">Clear filters</button>}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Performed By</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {logs.map((log) => (
                    <tr key={log.id} className="text-sm text-slate-700 transition-colors duration-150 hover:bg-blue-50/40">
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] || "bg-slate-50 text-slate-600"}`}>
                          <Activity className="h-3 w-3" />
                          {label(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-blue-400" />
                          <span className="font-semibold text-slate-700">{log.entity_type}</span>
                          {log.entity_id && <span className="text-slate-400">#{log.entity_id}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-500">{log.performed_by_email || "System"}</td>
                      <td className="px-4 py-4">
                        {log.ip_address ? (
                          <span className="block max-w-[11rem] truncate font-mono text-xs text-slate-600" title={log.ip_address}>
                            {log.ip_address}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          {log.created_at ? formatDateTimeWithZone(log.created_at) : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button onClick={() => setSelected(log)} className="text-xs font-semibold text-[#3B82F6] hover:underline">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="-mx-6 -mb-6 mt-6 flex items-center justify-between rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                <span className="text-sm text-slate-500">{total} total logs</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page"
                    className="rounded-lg border border-slate-200 bg-white p-2 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page"
                    className="rounded-lg border border-slate-200 bg-white p-2 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selected && <LogDetailsDialog log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
