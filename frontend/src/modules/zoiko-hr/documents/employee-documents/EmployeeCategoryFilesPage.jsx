import { useState } from "react";
import { useParams } from "react-router-dom";
import { BellRing, Download, Eye, FileText } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import StatusChip from "../components/StatusChip";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import FilePreviewDrawer from "../components/FilePreviewDrawer";
import ReminderDialog from "../components/ReminderDialog";
import { useEmployeeCategoryFiles, useSendReminder } from "../hooks/useEmployeeDocuments";
import { getDocumentFile } from "../../../../service/hrService";
import { saveBlobAs } from "../../../../utils/documents";
import { formatDate } from "../../../../utils/dateTime";
import { EXPIRY_SOON_DAYS } from "../constants";

const LINK_TO_QUEUE = new Set(["pending_approval", "rejected", "reupload_requested"]);

function expiryTone(iso) {
  if (!iso) return "";
  const days = (new Date(iso) - new Date()) / 86400000;
  if (days < 0) return "text-rose-700 font-semibold";
  if (days <= EXPIRY_SOON_DAYS) return "text-amber-700 font-semibold";
  return "";
}

/**
 * Admin → Employee Documents, level 3 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A2): the files in one container. Preview,
 * download and remind only. A pending or rejected file links to its item in Approval Workflow, where decisions are made.
 */
export default function EmployeeCategoryFilesPage() {
  const { employeeId, categoryId } = useParams();
  const query = useEmployeeCategoryFiles(employeeId, categoryId);
  const remind = useSendReminder();
  const [previewing, setPreviewing] = useState(null);
  const [reminding, setReminding] = useState(false);
  const [notice, setNotice] = useState(null);
  const employeeName = query.data?.employee?.name || "Employee";
  const categoryName = query.data?.category?.name || "Documents";

  const download = async (f) => {
    try {
      const { blob, filename } = await getDocumentFile(f.id);
      saveBlobAs(blob, filename || f.file_name);
    } catch (e) {
      setNotice(e?.message || "The download failed.");
    }
  };

  return (
    <OrganizationDocumentsLayout title="Employee Documents" subtitle="Read-only. Decisions are made in Approval Workflow.">
      <div className="space-y-5">
        <DocsBreadcrumb items={[{ label: "Documents", to: "/zoiko-hr/documents" }, { label: "Employee Documents", to: "/zoiko-hr/documents/employees" },
          { label: employeeName, to: `/zoiko-hr/documents/employees/${employeeId}` }, { label: categoryName }]} />
        {notice && <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">{notice}</p>}
        <SectionState query={query} label="Loading files" isEmpty={() => false}>
          {(data) => (data.files.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center dark:bg-[#1e293b]">
              <StatusChip status="not_uploaded" />
              <p className="text-sm text-slate-600">{employeeName} hasn't uploaded their {categoryName} yet.</p>
              {data.category.can_upload && data.employee.is_active && (
                <button type="button" onClick={() => setReminding(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <BellRing size={16} aria-hidden="true" /> Send reminder
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Uploaded</th><th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Version</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.files.map((f) => (
                    <tr key={f.id}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-[#f1f5f9]"><FileText size={16} className="text-slate-400" aria-hidden="true" />{f.title}</span>
                        {f.rejection_reason && <p className="mt-1 text-xs text-slate-500">Reason: {f.rejection_reason}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{f.uploaded_at ? formatDate(f.uploaded_at) : "—"}</td>
                      <td className={`px-4 py-3 ${expiryTone(f.expiry_date)}`}>{f.expiry_date ? formatDate(f.expiry_date) : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">v{f.version}</td>
                      <td className="px-4 py-3">
                        <StatusChip status={f.status} href={LINK_TO_QUEUE.has(f.status) ? `/zoiko-hr/documents/approvals?tab=${f.status === "pending_approval" ? "pending" : "all"}&item=${f.id}` : undefined} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setPreviewing(f)} aria-label={`Preview ${f.title}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Eye size={14} aria-hidden="true" /> Preview
                          </button>
                          <button type="button" onClick={() => download(f)} aria-label={`Download ${f.title}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Download size={14} aria-hidden="true" /> Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </SectionState>
      </div>
      <FilePreviewDrawer open={Boolean(previewing)} documentId={previewing?.id} title={previewing?.title} onClose={() => setPreviewing(null)} />
      <ReminderDialog open={reminding} who={employeeName} what={`They will be asked to upload their ${categoryName}.`} onClose={() => setReminding(false)}
        onSubmit={async ({ message }) => {
          await remind.mutateAsync({ employeeId: Number(employeeId), categoryIds: [Number(categoryId)], message });
          setNotice("Reminder sent.");
        }} />
    </OrganizationDocumentsLayout>
  );
}
