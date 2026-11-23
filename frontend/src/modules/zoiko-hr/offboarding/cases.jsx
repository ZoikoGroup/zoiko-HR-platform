/* Exit Cases: every exit in the organisation, with search and filters; a row opens the case. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, UserMinus, Users } from "lucide-react";
import { errorMessage, exportExitCases, listExitCases } from "../../../service/offboardingService";
import { Card, EmptyState, FilterSelect, Pagination, PersonCell, SearchInput, SecondaryButton, Table, shortDate, td } from "../recruitment/ui";
import OffboardingLayout from "./OffboardingLayout";
import { CaseStatusPill, EXIT_TYPES, ErrorBanner, ExitTypePill, Loading, ProgressBar, daysUntil, inDays, inputClass, useLoad } from "./shared";

const STATUS_OPTIONS = [
  { value: "open", label: "Open (all in progress)" },
  { value: "submitted", label: "Awaiting decision" },
  { value: "serving_notice", label: "Serving notice" },
  { value: "exited", label: "Exited" },
  { value: "closed", label: "Closed" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "cancelled", label: "Cancelled" },
];

export default function OffboardingCases() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("open");
  const [exitType, setExitType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced, status, exitType, from, to, perPage]);
  const { data, error, loading } = useLoad(() => listExitCases({
    status: status || undefined, exit_type: exitType || undefined, search: debounced.trim() || undefined,
    lwd_from: from || undefined, lwd_to: to || undefined, page, per_page: perPage,
  }), [debounced, status, exitType, from, to, page, perPage]);
  const items = data?.items || [];
  const open = (id) => navigate(`/zoiko-hr/offboarding/cases/${id}`);
  const doExport = async () => {
    setExportError("");
    try { await exportExitCases(status || undefined); } catch (e) { setExportError(errorMessage(e)); }
  };
  return (
    <OffboardingLayout title="Exit Cases" subtitle="Every resignation and exit, from the request to closure."
      actions={<SecondaryButton icon={Download} onClick={doExport}>Export CSV</SecondaryButton>}>
      <div className="space-y-4">
        <ErrorBanner message={error || exportError} />
        <Card bodyClass="p-0">
          <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, e-mail, code or case number" label="Search exit cases" />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All statuses" />
            <FilterSelect label="Exit type" value={exitType} onChange={setExitType} options={EXIT_TYPES} allLabel="All types" />
            <div>
              <label htmlFor="lwd-from" className="mb-1 block text-xs font-medium text-gray-600">Last day from</label>
              <input id="lwd-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="lwd-to" className="mb-1 block text-xs font-medium text-gray-600">Last day to</label>
              <input id="lwd-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          {loading && !data ? <Loading label="Loading exit cases…" /> : (
            <Table columns={[{ label: "Employee" }, { label: "Department" }, { label: "Type" }, { label: "Status" }, { label: "Notice date" },
              { label: "Last working day" }, { label: "Clearance" }, { label: "Assets" }]}
              empty={items.length === 0 && (
                <EmptyState icon={status === "open" ? UserMinus : Users} title="No exit cases match">
                  {status === "open" ? "No one is leaving right now." : "Try other filters."}
                </EmptyState>
              )}>
              {items.map((c) => {
                const n = daysUntil(c.last_working_day);
                const upcoming = ["approved", "submitted"].includes(c.status);
                return (
                  <tr key={c.id} tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => { if (e.key === "Enter") open(c.id); }}
                    className="cursor-pointer hover:bg-slate-50 focus:bg-blue-50 focus:outline-none" aria-label={`Open exit case of ${c.employee?.name}`}>
                    <td className={td}><PersonCell name={c.employee?.name} sub={`${c.employee?.employee_code || ""} · ${c.case_number}`} /></td>
                    <td className={td}>{c.employee?.department || "—"}</td>
                    <td className={td}><ExitTypePill type={c.exit_type} label={c.exit_type_label} /></td>
                    <td className={td}><CaseStatusPill status={c.display_status} /></td>
                    <td className={td}>{shortDate(c.resignation_date)}</td>
                    <td className={td}>
                      <p>{shortDate(c.last_working_day)}</p>
                      {upcoming && n != null && <p className={`text-xs ${n < 0 ? "text-rose-600" : "text-gray-500"}`}>{inDays(n)}</p>}
                    </td>
                    <td className={td}><ProgressBar done={c.progress?.tasks_done} total={c.progress?.tasks_total} label={`Clearance of ${c.employee?.name}`} /></td>
                    <td className={td}>
                      {c.progress?.assets_pending ? <span className="font-semibold text-amber-700">{c.progress.assets_pending} to return</span>
                        : <span className="text-gray-400">{c.progress?.assets_total ? "All back" : "—"}</span>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          {data && data.total > 0 && (
            <Pagination page={page} pageSize={perPage} total={data.total} onPage={setPage} onPageSize={setPerPage} />
          )}
        </Card>
      </div>
    </OffboardingLayout>
  );
}
