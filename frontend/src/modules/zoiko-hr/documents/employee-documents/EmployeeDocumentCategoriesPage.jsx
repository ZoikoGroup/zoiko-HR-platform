import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BellRing, Download, FolderOpen, Loader2 } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import StatusChip from "../components/StatusChip";
import CompletionBadge from "../components/CompletionBadge";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import ReminderDialog from "../components/ReminderDialog";
import { useCancelScheduledReminder, useDocumentEmployee, useSendReminder } from "../hooks/useEmployeeDocuments";
import { downloadEmployeeZip } from "../../../../service/documentsService";
import { saveBlobAs } from "../../../../utils/documents";
import { formatDateTime } from "../../../../utils/dateTime";
import { reminderNotice } from "../constants";

/**
 * Admin → Employee Documents, level 2 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2): one employee's category containers.
 * A missing required container shows "Not uploaded" and a reminder button. Read-only: no upload, no approve.
 */
export default function EmployeeDocumentCategoriesPage() {
  const { employeeId } = useParams();
  const query = useDocumentEmployee(employeeId);
  const remind = useSendReminder();
  const cancelScheduled = useCancelScheduledReminder();
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
              {(data.scheduled_reminders || []).length > 0 && (
                <ul aria-label="Scheduled reminders" className="space-y-2">
                  {data.scheduled_reminders.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
                      <span>Reminder scheduled for {formatDateTime(r.scheduled_for)}{r.category_ids?.length
                        ? ` (${data.categories.filter((c) => r.category_ids.includes(c.id)).map((c) => c.name).join(", ")})` : ""}</span>
                      <button type="button" disabled={cancelScheduled.isPending}
                        onClick={() => cancelScheduled.mutateAsync(r.id).then(() => setNotice("Scheduled reminder cancelled."), (e) => setNotice(e?.message || "That didn't work."))}
                        className="text-xs font-semibold text-blue-800 underline disabled:opacity-60">Cancel</button>
                    </li>
                  ))}
                </ul>
              )}
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
                    {c.is_required && c.can_upload && c.status === "not_uploaded" && data.employee.is_active && c.reminded_at && (
                      <p className="text-xs text-slate-500">Reminded {formatDateTime(c.reminded_at)}. The next reminder about this document can go 24 hours later.</p>
                    )}
                    {c.is_required && c.can_upload && c.status === "not_uploaded" && data.employee.is_active && !c.reminded_at && (
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
        onSubmit={async ({ message, scheduledFor }) => {
          const r = await remind.mutateAsync({ employeeId: Number(employeeId), categoryIds: dialog?.categoryIds, message, scheduledFor });
          setNotice(reminderNotice(r));
        }} />
    </OrganizationDocumentsLayout>
  );
}
