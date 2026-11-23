import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BellRing, CheckCircle2, Clock, Eye, Settings } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import StatusChip from "../components/StatusChip";
import CompletionBadge from "../components/CompletionBadge";
import ReminderDialog from "../components/ReminderDialog";
import Pager from "../components/Pager";
import { useDocumentEmployees, useDocumentEmployeesSummary, useSendBulkReminders } from "../hooks/useEmployeeDocuments";
import { formatDate } from "../../../../utils/dateTime";
import { bulkReminderNotice } from "../constants";

const STATUS_CARDS = [
  { key: "complete", label: "Complete", icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
  { key: "pending", label: "Missing documents", icon: Clock, tone: "text-amber-700 bg-amber-50" },
  { key: "needs_review", label: "Needs review", icon: Eye, tone: "text-violet-700 bg-violet-50" },
  { key: "expired", label: "Expired", icon: AlertTriangle, tone: "text-rose-700 bg-rose-50" },
];

/**
 * Admin → Employee Documents, level 1 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2): every employee with how complete their
 * documents are. READ-ONLY — there is deliberately no upload here: employees upload in My Files and decisions happen in
 * Approval Workflow.
 */
export default function EmployeeDocumentsListPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [reminding, setReminding] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [debounced, status, joinedFrom]);

  const filters = { search: debounced || undefined, status: status || undefined, joined_from: joinedFrom || undefined, page, per_page: 25 };
  const list = useDocumentEmployees(filters);
  const summary = useDocumentEmployeesSummary();
  const bulk = useSendBulkReminders();

  const toggle = (id, on) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <OrganizationDocumentsLayout
      title="Employee Documents"
      subtitle="See each employee's documents and what is missing. Employees upload their own files; decisions happen in Approval Workflow."
      actions={(
        <Link to="/zoiko-hr/documents/settings/categories"
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">
          <Settings size={16} aria-hidden="true" /> Categories
        </Link>
      )}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATUS_CARDS.map((c) => (
            <button key={c.key} type="button" aria-pressed={status === c.key} onClick={() => setStatus(status === c.key ? "" : c.key)}
              className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm dark:bg-[#1e293b] ${status === c.key ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200/80 dark:border-[#334155]"}`}>
              <span className={`rounded-xl p-2 ${c.tone}`}><c.icon size={18} aria-hidden="true" /></span>
              <span>
                <span className="block text-2xl font-bold text-slate-900 dark:text-[#f1f5f9]">{summary.isPending ? "—" : summary.data?.[c.key] ?? 0}</span>
                <span className="text-xs text-slate-500">{c.label}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="sr-only">Search by name or employee ID</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or employee ID…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-600">Joined from</span>
            <input type="date" value={joinedFrom} onChange={(e) => setJoinedFrom(e.target.value)} className="mt-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          {selected.size > 0 && (
            <button type="button" onClick={() => setReminding(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <BellRing size={16} aria-hidden="true" /> Remind {selected.size}
            </button>
          )}
        </div>
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}

        <SectionState query={list} label="Loading employees" isEmpty={(d) => !d?.items?.length}
          empty={{ title: "No employees match", message: "Try a different search or filter." }}>
          {(data) => (
            <>
              <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3"><span className="sr-only">Select</span></th>
                      <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">Completion</th><th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.items.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <input type="checkbox" aria-label={`Select ${e.name}`} checked={selected.has(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} />
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/zoiko-hr/documents/employees/${e.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline dark:text-[#f1f5f9]">{e.name}</Link>
                          <span className="ml-2 font-mono text-xs text-slate-500">{e.employee_id_str}</span>
                          {e.department && <p className="text-xs text-slate-500">{e.department}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{e.designation || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{e.joined_on ? formatDate(e.joined_on) : "—"}</td>
                        <td className="px-4 py-3"><CompletionBadge approved={e.completion.approved} required={e.completion.required} /></td>
                        <td className="px-4 py-3"><StatusChip status={e.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3"><Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} /></div>
            </>
          )}
        </SectionState>
      </div>
      <ReminderDialog open={reminding} who={`${selected.size} employee${selected.size === 1 ? "" : "s"}`}
        onClose={() => setReminding(false)}
        onSubmit={async ({ message, scheduledFor }) => {
          const r = await bulk.mutateAsync({ employeeIds: [...selected], message, scheduledFor });
          setNotice(bulkReminderNotice(r));
          setSelected(new Set());
        }} />
    </OrganizationDocumentsLayout>
  );
}
