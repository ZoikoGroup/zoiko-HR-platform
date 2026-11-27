// Organization Admin — Audit log (QA bug 29: "View audit log" on the Organization page).
// What people did inside this organisation, newest first, from the platform's activity ledger scoped to the organisation.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, History, Loader2, Search } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { getOrganizationAuditLog } from "../../service/orgAdminService";
import { formatDateTime } from "../../utils/dateTime";

const PAGE_SIZE = 25;
const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300";
const AREA_TONE = {
  Employee: "bg-blue-50 text-blue-700", Leave: "bg-emerald-50 text-emerald-700", Payroll: "bg-amber-50 text-amber-700",
  Settings: "bg-violet-50 text-violet-700", User: "bg-sky-50 text-sky-700", Other: "bg-slate-100 text-slate-600",
};

export default function OrgAdminAuditLogPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // the search box waits for a pause in typing
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getOrganizationAuditLog({ page, page_size: PAGE_SIZE, action_group: area || undefined,
        status: status || undefined, q: q || undefined }));
    } catch (e) {
      setError(e?.message || "The audit log could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, area, status, q]);

  useEffect(() => { load(); }, [load]);

  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const events = data?.events || [];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="What people did inside your organization, newest first." />
      <Link to="/organization-admin/organization" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Organization
      </Link>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_12rem_10rem]">
        <div className="relative">
          <label htmlFor="audit-search" className="sr-only">Search by person or record</label>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input id="audit-search" className={`${inputCls} pl-9`} placeholder="Search by person or record" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="audit-area" className="sr-only">Area</label>
          <select id="audit-area" className={inputCls} value={area} onChange={(e) => { setArea(e.target.value); setPage(1); }}>
            <option value="">All areas</option>
            {(data?.areas || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="audit-status" className="sr-only">Result</label>
          <select id="audit-status" className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All results</option>
            <option value="success">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />Loading the audit log…
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-slate-500">
            <History className="h-8 w-8 text-slate-300" aria-hidden="true" />
            {q || area || status ? "Nothing matches these filters." : "Nothing has been recorded for your organization yet."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Audit log">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">{e.sentence}</p>
                  {(e.changes || []).length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {e.changes.slice(0, 5).map((c, i) => (
                        <li key={i}>{c.label || c.field}: {String(c.from ?? c.before ?? "—")} → {String(c.to ?? c.after ?? "—")}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                  {e.action_group && <span className={`rounded-full px-2 py-0.5 font-semibold ${AREA_TONE[e.action_group] || AREA_TONE.Other}`}>{e.action_group}</span>}
                  {e.status === "failed" && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">Failed</span>}
                  <time className="text-slate-500" dateTime={e.created_at}>{e.created_at ? formatDateTime(e.created_at) : ""}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            <span>Page {page} of {pages} · {total} events</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading} aria-label="Previous page"
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages || loading} aria-label="Next page"
                className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
