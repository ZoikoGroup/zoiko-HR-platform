import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import SectionState from "../components/SectionState";
import Pager from "../components/Pager";
import { useDocumentAudit } from "../hooks/useApprovals";
import { exportDocumentAuditCsv } from "../../../../service/documentsService";
import { saveBlobAs } from "../../../../utils/documents";
import { formatDateTime } from "../../../../utils/dateTime";

const ACTIONS = [
  ["", "All actions"], ["uploaded", "Uploaded"], ["approved", "Approved"], ["auto_approved", "Auto-approved"],
  ["rejected", "Rejected"], ["reupload_requested", "Re-upload requested"], ["expired", "Expired"], ["viewed", "Viewed"],
  ["downloaded", "Downloaded"], ["access_changed", "Access changed"], ["acknowledged", "Acknowledged"], ["exported", "Exported"],
];
const LABEL = Object.fromEntries(ACTIONS);
const ROLE = { hr_admin: "HR Admin", admin: "Org Admin", employee: "Employee", manager: "Manager" };

/** Audit Log tab: every view, download, upload, decision and access change, filterable and exportable (§17 A4). */
export default function AuditLogTab({ documentId }) {
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const filters = { action: action ? [action] : undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined,
                    document_id: documentId || undefined, page, per_page: 50 };
  const query = useDocumentAudit(filters);

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const text = await exportDocumentAuditCsv({ ...filters, page: undefined, per_page: undefined });
      saveBlobAs(new Blob([text], { type: "text/csv" }), "documents-audit.csv");
    } catch (e) {
      setExportError(e?.message || "The export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">Action</span>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">From</span>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">To</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={exportCsv} disabled={exporting}
          className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {exporting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Export CSV
        </button>
      </div>
      {exportError && <p role="alert" className="text-sm text-rose-700">{exportError}</p>}
      <SectionState query={query} label="Loading the audit log" empty={{ title: "No activity yet", message: "Views, downloads and decisions will appear here." }}
        isEmpty={(d) => !d?.items?.length}>
        {(data) => (
          <>
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white dark:border-[#334155] dark:bg-[#1e293b]">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">By</th><th className="px-4 py-2">Document</th><th className="px-4 py-2">Employee</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">{formatDateTime(r.at)}</td>
                      <td className="px-4 py-2 font-medium">{LABEL[r.action] || r.action}</td>
                      <td className="px-4 py-2">
                        {r.actor ? <>{r.actor.name} <span className="text-xs text-slate-500">{ROLE[r.actor.role] || r.actor.role}</span></>
                          : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">System{r.rule_id ? " · rule" : ""}</span>}
                      </td>
                      <td className="px-4 py-2">{r.document_title || "—"}</td>
                      <td className="px-4 py-2">{r.employee?.name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
          </>
        )}
      </SectionState>
    </div>
  );
}
