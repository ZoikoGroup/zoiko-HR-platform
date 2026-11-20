import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BellRing, Download, FolderOpen, Loader2 } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import StatusChip from "../components/StatusChip";
import CompletionBadge from "../components/CompletionBadge";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import ReminderDialog from "../components/ReminderDialog";
import { useDocumentEmployee, useSendReminder } from "../hooks/useEmployeeDocuments";
import { downloadEmployeeZip } from "../../../../service/documentsService";
import { saveBlobAs } from "../../../../utils/documents";
import { formatDateTime } from "../../../../utils/dateTime";

/**
 * Admin → Employee Documents, level 2 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2): one employee's category containers.
 * A missing required container shows "Not uploaded" and a reminder button. Read-only: no upload, no approve.
 */
export default function EmployeeDocumentCategoriesPage() {
  const { employeeId } = useParams();
  const query = useDocumentEmployee(employeeId);
  const remind = useSendReminder();
  const [dialog, setDialog] = useState(null);          // { categoryIds?, what }
  const [notice, setNotice] = useState(null);
  const [zipping, setZipping] = useState(false);
  const name = query.data?.employee?.name || "Employee";

  const zip = async () => {
    setZipping(true);
    setNotice(null);
    try {
      const { blob, filename } = await downloadEmployeeZip(employeeId, true);
      saveBlobAs(blob, filename);
    } catch (e) {
      setNotice(e?.message || "The download failed.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <OrganizationDocumentsLayout title="Employee Documents" subtitle="Each container holds one kind of document. Employees upload; HR reviews in Approval Workflow.">
      <div className="space-y-5">
        <DocsBreadcrumb items={[{ label: "Documents", to: "/zoiko-hr/documents" }, { label: "Employee Documents", to: "/zoiko-hr/documents/employees" }, { label: name }]} />
        <SectionState query={query} skeleton="cards" label="Loading documents" isEmpty={() => false}>
          {(data) => (
            <>
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-slate-900 dark:text-[#f1f5f9]">{data.employee.name}
                    <span className="ml-2 font-mono text-xs text-slate-500">{data.employee.employee_id_str}</span></p>
                  <p className="text-xs text-slate-500">
                    {data.last_reminder_at ? `Last reminded ${formatDateTime(data.last_reminder_at)}` : "No reminders sent yet"}
                    {!data.employee.is_active && " · No longer active"}
                  </p>
                </div>
                <CompletionBadge approved={data.employee.completion.approved} required={data.employee.completion.required} />
                <StatusChip status={data.employee.status} size="md" />
                <button type="button" disabled={!data.employee.is_active} onClick={() => setDialog({})}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  <BellRing size={16} aria-hidden="true" /> Remind about missing
                </button>
                <button type="button" onClick={zip} disabled={zipping}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {zipping ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />} Download all (ZIP)
                </button>
              </div>
              {notice && <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">{notice}</p>}
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.categories.map((c) => (
                  <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                    <div className="flex items-start gap-3">
                      <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><FolderOpen size={18} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/zoiko-hr/documents/employees/${employeeId}/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline dark:text-[#f1f5f9]">{c.name}</Link>
                        <p className="text-xs text-slate-500">{c.file_count} file{c.file_count === 1 ? "" : "s"} · {c.is_required ? "Required" : "Optional"}
                          {c.uploader !== "employee" && " · Issued by HR"}</p>
                      </div>
                      <StatusChip status={c.status} />
                    </div>
                    {c.is_required && c.can_upload && c.status === "not_uploaded" && data.employee.is_active && (
                      <button type="button" onClick={() => setDialog({ categoryIds: [c.id], what: `They will be asked to upload their ${c.name}.` })}
                        className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-blue-700 hover:underline">
                        <BellRing size={14} aria-hidden="true" /> Send reminder
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionState>
      </div>
      <ReminderDialog open={Boolean(dialog)} who={name} what={dialog?.what} onClose={() => setDialog(null)}
        onSubmit={async ({ message }) => {
          const r = await remind.mutateAsync({ employeeId: Number(employeeId), categoryIds: dialog?.categoryIds, message });
          setNotice(r.sent ? "Reminder sent." : "Nothing is missing, so no reminder was sent.");
        }} />
    </OrganizationDocumentsLayout>
  );
}
