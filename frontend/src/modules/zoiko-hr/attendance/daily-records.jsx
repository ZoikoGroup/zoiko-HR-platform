import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, History, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import HRPage from "../../../components/HRPage";
import AttendanceSubNav from "./components/AttendanceSubNav";
import AttendanceStatusChip from "./components/AttendanceStatusChip";
import AuditTrailDrawer from "./components/AuditTrailDrawer";
import DateRangeFilter from "./components/DateRangeFilter";
import RecordFormDialog from "./components/RecordFormDialog";
import Pager from "../documents/components/Pager";
import { formatMinutes, SOURCE_LABEL, STATUS } from "./constants";
import {
  useAttendanceRecords, useCreateAttendanceRecord, useDeleteAttendanceRecord, useUpdateAttendanceRecord,
} from "./hooks/useAttendanceAdmin";
import { getAttendanceRecord } from "../../../service/attendanceService";
import { exportAttendanceCsv, exportAttendanceExcel, getDepartments, getHrEmployees } from "../../../service/hrService";
import { keys } from "../../../service/queryKeys";
import { formatDate } from "../../../utils/dateTime";

const PER_PAGE = 25;
const STATUS_FILTERS = ["present", "late", "half_day", "absent", "on_leave", "remote", "holiday", "weekly_off", "missed_punch"];

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Admin → Daily Attendance Records (attendance plan M5): the attendance log with server-side filters, date presets and
 * paging; columns for department, break, hours, overtime and source; add / edit with a required reason; removal with a
 * reason; each record's history; exports that follow the current filters.
 */
export default function DailyAttendanceRecords() {
  const [range, setRange] = useState({ preset: "today" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);          // { mode: "new" } | { mode: "edit", record }
  const [history, setHistory] = useState(null);
  const [notice, setNotice] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const qc = useQueryClient();
  const term = useDebounced(search);

  const filters = useMemo(() => ({
    ...range, search: term.trim() || undefined, status: status || undefined, department_id: departmentId || undefined,
    source: source || undefined, page, per_page: PER_PAGE,
  }), [range, term, status, departmentId, source, page]);
  const query = useAttendanceRecords(filters);
  const create = useCreateAttendanceRecord();
  const update = useUpdateAttendanceRecord();
  const remove = useDeleteAttendanceRecord();

  useEffect(() => {
    getDepartments().then((r) => setDepartments(Array.isArray(r?.data) ? r.data : r?.data?.items || [])).catch(() => setDepartments([]));
    getHrEmployees({ per_page: 200 }).then((r) => setEmployees(r?.items || r?.data || (Array.isArray(r) ? r : []))).catch(() => setEmployees([]));
  }, []);
  useEffect(() => { setPage(1); }, [range, term, status, departmentId, source]);

  const exportParams = () => {
    const { page: _p, per_page: _pp, ...rest } = filters;
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== ""));
  };
  const doExport = async (kind) => {
    setExporting(kind);
    setNotice(null);
    try { await (kind === "csv" ? exportAttendanceCsv : exportAttendanceExcel)(exportParams()); }
    catch (e) { setNotice({ ok: false, text: e?.message || "The export failed." }); }
    finally { setExporting(null); }
  };
  const openEdit = async (row) => {
    try {
      const full = await qc.fetchQuery({ queryKey: keys.attendance.records.detail(row.id), queryFn: () => getAttendanceRecord(row.id) });
      setDialog({ mode: "edit", record: full });
    } catch (e) {
      setNotice({ ok: false, text: e?.message || "This record could not be opened." });
    }
  };
  const doDelete = async (row) => {
    const reason = typeof window !== "undefined" ? window.prompt(`Why remove ${row.employee_name}'s record for ${formatDate(row.date)}? (kept in the history)`) : null;
    if (!reason || reason.trim().length < 3) return;
    try { await remove.mutateAsync({ id: row.id, reason: reason.trim() }); setNotice({ ok: true, text: "Record removed. It stays in the history." }); }
    catch (e) { setNotice({ ok: false, text: e?.message || "The record was not removed." }); }
  };

  const data = query.data;
  const rows = data?.items || [];
  const filtered = Boolean(term || status || departmentId || source);
  const control = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm";

  return (
    <HRPage title="Daily Attendance Records" subtitle="Every punch, correction and change, with who made it and why."
      actions={(
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => doExport("csv")} disabled={Boolean(exporting)}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60">
            {exporting === "csv" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} CSV
          </button>
          <button type="button" onClick={() => doExport("excel")} disabled={Boolean(exporting)}
            className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60">
            {exporting === "excel" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Excel
          </button>
          <button type="button" onClick={() => setDialog({ mode: "new" })}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus size={16} aria-hidden="true" /> Add Record
          </button>
        </div>
      )}>
      <AttendanceSubNav />
      <div className="space-y-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search employee, code or department</span>
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, code or department"
              className={`${control} w-full pl-8`} />
          </label>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={control}>
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}
          </select>
          <select aria-label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={control}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className={control}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {notice && <p role={notice.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"}`}>{notice.text}</p>}

        {query.isError ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{query.error?.message || "Attendance could not be loaded."}{" "}
            <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>
        ) : query.isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading records" />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
            <p className="font-semibold text-slate-700">No records found</p>
            <p>{filtered ? "No records match these filters." : "Nobody has punched in or been marked for these dates yet."}</p>
            {filtered && <button type="button" className="mt-2 text-blue-700 underline" onClick={() => { setSearch(""); setStatus(""); setDepartmentId(""); setSource(""); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Check-in</th><th className="px-4 py-3">Check-out</th><th className="px-4 py-3">Break</th>
                  <th className="px-4 py-3">Total</th><th className="px-4 py-3">Overtime</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{r.employee_name}</p><p className="font-mono text-xs text-slate-500">{r.employee_code}</p></td>
                    <td className="px-4 py-3 text-slate-600">{r.department || "—"}</td>
                    <td className="px-4 py-3">{formatDate(r.date)}</td>
                    <td className="px-4 py-3 font-mono">{r.check_in_time || "—"}{r.late_minutes > 0 && <span className="ml-1 text-xs text-amber-700">+{r.late_minutes}m</span>}</td>
                    <td className="px-4 py-3 font-mono">{r.check_out_time || "—"}</td>
                    <td className="px-4 py-3">{r.break_minutes ? formatMinutes(r.break_minutes) : "—"}</td>
                    <td className="px-4 py-3">{r.worked_minutes ? formatMinutes(r.worked_minutes) : "—"}</td>
                    <td className="px-4 py-3">{r.overtime_minutes ? formatMinutes(r.overtime_minutes) : "—"}</td>
                    <td className="px-4 py-3"><AttendanceStatusChip status={r.status} />{r.status_locked && <span className="ml-1 text-[10px] text-slate-500" title="Set by HR">HR</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{SOURCE_LABEL[r.source] || r.source}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" aria-label={`Edit ${r.employee_name} on ${r.date}`} onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><Pencil size={16} aria-hidden="true" /></button>
                        <button type="button" aria-label={`History of ${r.employee_name} on ${r.date}`} onClick={() => setHistory(r)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><History size={16} aria-hidden="true" /></button>
                        <button type="button" aria-label={`Remove ${r.employee_name} on ${r.date}`} onClick={() => doDelete(r)} className="rounded-lg p-1.5 text-rose-700 hover:bg-rose-50"><Trash2 size={16} aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}
      </div>
      {dialog && (
        <RecordFormDialog mode={dialog.mode} record={dialog.record} employees={employees} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            if (dialog.mode === "edit") await update.mutateAsync({ id: dialog.record.id, ...body });
            else await create.mutateAsync(body);
            setNotice({ ok: true, text: dialog.mode === "edit" ? "Record updated." : "Record added." });
          }} />
      )}
      {history && <AuditTrailDrawer record={history} onClose={() => setHistory(null)} />}
    </HRPage>
  );
}
