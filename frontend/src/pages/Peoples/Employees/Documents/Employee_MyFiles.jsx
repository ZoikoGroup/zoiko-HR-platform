import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, FileText, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { EmployeeDocumentsLayout } from "../../../../modules/zoiko-hr/documents/ui";
import SectionState from "../../../../modules/zoiko-hr/documents/components/SectionState";
import StatusChip from "../../../../modules/zoiko-hr/documents/components/StatusChip";
import UploadDialog from "../../../../modules/zoiko-hr/documents/components/UploadDialog";
import FilePreviewDrawer from "../../../../modules/zoiko-hr/documents/components/FilePreviewDrawer";
import { useMyCategories, useUploadMyDocument, useWithdrawMyDocument } from "../../../../modules/zoiko-hr/documents/hooks/useMyDocuments";
import { DocumentStatus } from "../../../../modules/zoiko-hr/documents/types";
import { formatDate } from "../../../../utils/dateTime";

const NEEDS_NEW_COPY = new Set([DocumentStatus.REJECTED, DocumentStatus.REUPLOAD_REQUESTED, DocumentStatus.EXPIRED]);

/**
 * My Files (docs/new_docs/ZHR-DOCS-ARCH-001 §17 D2): the person uploads their own documents into category containers.
 * Every upload goes to HR for approval; a rejected, re-requested or expired file can be replaced with a new copy, and a
 * copy still waiting for review can be removed. Categories HR fills (payslips, tax, contracts) are read-only here.
 */
export default function MyFiles() {
  const query = useMyCategories();
  const upload = useUploadMyDocument();
  const withdraw = useWithdrawMyDocument();
  // ?category=<id> (a "Documents to action" upload task links here): that category starts open.
  const [openIds, setOpenIds] = useState(() => {
    const wanted = Number(typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("category") : null);
    return new Set(wanted ? [wanted] : []);
  });
  const [dialog, setDialog] = useState(null);           // { category, replacesDocumentId?, replacingTitle? }
  const [previewing, setPreviewing] = useState(null);   // file
  const [notice, setNotice] = useState(null);

  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const summary = useMemo(() => {
    const cats = Array.isArray(query.data) ? query.data : [];
    const required = cats.filter((c) => c.is_required && c.can_upload);
    const done = required.filter((c) => c.status === DocumentStatus.APPROVED).length;
    const attention = cats.filter((c) => NEEDS_NEW_COPY.has(c.status) || (c.is_required && c.can_upload && c.status === "not_uploaded")).length;
    return { required: required.length, done, attention };
  }, [query.data]);

  const submit = async (values) => {
    await upload.mutateAsync(values);
    setNotice("Uploaded. HR will review it and you'll be notified.");
    setOpenIds((prev) => new Set(prev).add(values.categoryId));
  };

  const remove = async (file) => {
    try {
      await withdraw.mutateAsync(file.id);
      setNotice("Removed.");
    } catch (e) {
      setNotice(e?.message || "That file could not be removed.");
    }
  };

  return (
    <EmployeeDocumentsLayout
      title="My Files"
      subtitle="Upload your documents for HR to review. Required documents are marked."
      actions={(
        <button type="button" onClick={() => query.refetch()} disabled={query.isFetching}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-60">
          <RefreshCw size={16} className={query.isFetching ? "animate-spin" : ""} aria-hidden="true" /> Refresh
        </button>
      )}
    >
      <div className="mx-auto max-w-4xl space-y-4">
        {notice && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold underline">Dismiss</button>
          </div>
        )}

        <SectionState query={query} skeleton="list" label="Loading your documents"
          empty={{ title: "No document categories yet", message: "Your organization has not set up document categories." }}>
          {(categories) => (
            <>
              {summary.required > 0 && (
                <p className="text-sm text-slate-600 dark:text-[#94a3b8]" data-testid="my-files-summary">
                  {summary.done} of {summary.required} required documents approved
                  {summary.attention > 0 && <> · <strong className="text-amber-700">{summary.attention} need your attention</strong></>}
                </p>
              )}
              <ul className="space-y-3">
                {categories.map((cat) => {
                  const expanded = openIds.has(cat.id);
                  const panelId = `cat-panel-${cat.id}`;
                  return (
                    <li key={cat.id} className="rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <button type="button" onClick={() => toggle(cat.id)} aria-expanded={expanded} aria-controls={panelId}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                          <span className="font-semibold text-slate-900 dark:text-[#f1f5f9]">{cat.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cat.is_required ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                            {cat.is_required ? "Required" : "Optional"}
                          </span>
                          <span className="text-xs text-slate-500">{cat.file_count} file{cat.file_count === 1 ? "" : "s"}</span>
                        </button>
                        <StatusChip status={cat.status} />
                        {cat.can_upload && cat.status === "not_uploaded" && (
                          <button type="button" onClick={() => setDialog({ category: cat })}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                            <UploadCloud size={14} aria-hidden="true" /> Upload
                          </button>
                        )}
                      </div>
                      {expanded && (
                        <div id={panelId} className="border-t border-gray-100 px-5 py-3 dark:border-[#334155]">
                          {!cat.can_upload && (
                            <p className="mb-2 text-xs text-slate-500">HR issues the documents in this category; you can view them here.</p>
                          )}
                          {cat.files.length === 0 ? (
                            <p className="py-3 text-sm text-slate-500">Nothing here yet.</p>
                          ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-[#334155]">
                              {cat.files.map((f) => (
                                <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                                  <FileText size={18} className="text-slate-400" aria-hidden="true" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-[#f1f5f9]">{f.title}</p>
                                    <p className="text-xs text-slate-500">
                                      {[`v${f.version}`, f.uploaded_at && `Uploaded ${formatDate(f.uploaded_at)}`,
                                        f.expiry_date && `Expires ${formatDate(f.expiry_date)}`].filter(Boolean).join(" · ")}
                                    </p>
                                    {f.rejection_reason && (
                                      <p className="mt-1 text-xs text-rose-700"><span className="font-semibold">Reason:</span> {f.rejection_reason}</p>
                                    )}
                                  </div>
                                  <StatusChip status={f.status} />
                                  <button type="button" onClick={() => setPreviewing(f)} aria-label={`View ${f.title}`}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    <Eye size={14} aria-hidden="true" /> View
                                  </button>
                                  {cat.can_upload && NEEDS_NEW_COPY.has(f.status) && (
                                    <button type="button" onClick={() => setDialog({ category: cat, replacesDocumentId: f.id, replacingTitle: f.title })}
                                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                                      <UploadCloud size={14} aria-hidden="true" /> Upload new copy
                                    </button>
                                  )}
                                  {cat.can_upload && f.status === DocumentStatus.PENDING && !f.decided_by && (
                                    <button type="button" onClick={() => remove(f)} disabled={withdraw.isPending}
                                      aria-label={`Remove ${f.title}`}
                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                                      {withdraw.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />} Remove
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {cat.can_upload && cat.status !== "not_uploaded" && (!cat.max_files || cat.file_count < cat.max_files) && (
                            <button type="button" onClick={() => setDialog({ category: cat })}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
                              <UploadCloud size={14} aria-hidden="true" /> Add another file
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </SectionState>
      </div>

      <UploadDialog open={Boolean(dialog)} category={dialog?.category || null} replacesDocumentId={dialog?.replacesDocumentId}
        replacingTitle={dialog?.replacingTitle} onSubmit={submit} onClose={() => setDialog(null)} />
      <FilePreviewDrawer open={Boolean(previewing)} documentId={previewing?.id} title={previewing?.title}
        onClose={() => setPreviewing(null)} />
    </EmployeeDocumentsLayout>
  );
}
