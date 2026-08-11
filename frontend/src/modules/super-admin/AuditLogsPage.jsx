import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/PageHeader";
import { AlertTriangle, Search, FileText, ChevronLeft, ChevronRight, Clock, Activity, Shield } from "lucide-react";
import { superAdminService } from "../../service/superAdminService";

const ACTION_COLORS = {
  create: "bg-emerald-50 text-emerald-600 border border-emerald-100",
  update: "bg-blue-50 text-blue-600 border border-blue-100",
  delete: "bg-red-50 text-red-600 border border-red-100",
  suspend: "bg-amber-50 text-amber-600 border border-amber-100",
  activate: "bg-green-50 text-green-600 border border-green-100",
  login: "bg-purple-50 text-purple-600 border border-purple-100",
  logout: "bg-slate-50 text-slate-600 border border-slate-100",
  config_change: "bg-indigo-50 text-indigo-600 border border-indigo-100",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const params = { page, page_size: pageSize };
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entity_type = entityFilter;
      const data = await superAdminService.getAuditLogs(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load audit logs", e);
      setError(e.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, entityFilter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 font-sans">
      <PageHeader title="Audit Logs" description="Track all platform-level actions and configuration changes." />

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadLogs} className="ml-auto text-red-600 underline hover:text-red-800 text-xs font-semibold">Retry</button>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800">Platform Audit Trail ({total})</h3>
          <div className="flex gap-3 items-center flex-wrap">
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rounded-full border border-slate-200 bg-slate-50 py-2 px-4 text-sm text-slate-700 outline-none focus:border-[#FF7A00]">
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="suspend">Suspend</option>
              <option value="activate">Activate</option>
              <option value="config_change">Config Change</option>
            </select>
            <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
              className="rounded-full border border-slate-200 bg-slate-50 py-2 px-4 text-sm text-slate-700 outline-none focus:border-[#FF7A00]">
              <option value="">All Entities</option>
              <option value="Organization">Organization</option>
              <option value="Subscription">Subscription</option>
              <option value="Product">Product</option>
              <option value="OrganizationProduct">Org Product</option>
              <option value="PlatformSetting">Platform Setting</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No audit logs found
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Performed By</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] || "bg-slate-50 text-slate-600"}`}>
                          <Activity className="h-3 w-3" />
                          {log.action.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-700">{log.entity_type}</span>
                          {log.entity_id && <span className="text-slate-400">#{log.entity_id}</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-500">{log.performed_by_email || "System"}</td>
                      <td className="py-4 px-4">
                        <span className="text-xs text-slate-500 max-w-[200px] truncate block">
                          {log.details ? JSON.stringify(log.details).substring(0, 60) : "-"}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-slate-400 text-xs">
                          <Clock className="h-3 w-3" />
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">{total} total logs</span>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
