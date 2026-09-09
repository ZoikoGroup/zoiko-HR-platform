import { useEffect, useMemo, useState } from "react";
import EmployeePageShell from "../../../../components/employee/EmployeePageShell";
import DocumentPreviewModal from "../../../../components/DocumentPreviewModal";
import DocumentRow from "../../../../components/documents/DocumentRow";
import DocumentEmptyState from "../../../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../../../components/documents/DocumentErrorState";
import { useDocumentFile } from "../../../../hooks/useDocumentFile";
import { getDocuments, uploadDocument } from "../../../../service/employee";
import { useAuth } from "../../../../context/AuthContext";
import { FileText } from "lucide-react";

const docTypeOptions = [
  "Identity Proof",
  "Address Proof",
  "Bank Statement",
  "Medical Certificate",
  "Educational Certificate",
  "Previous Employment Docs",
];

function normalizeStatus(s) {
  const t = String(s || "").toLowerCase();
  if (t.includes("upload") || t.includes("approved") || t.includes("completed")) return "approved";
  if (t.includes("pending") || t.includes("processing") || t.includes("request")) return "pending";
  if (t.includes("reject") || t.includes("denied") || t.includes("failed")) return "rejected";
  return "pending";
}

export default function UploadRequest() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const [form, setForm] = useState({ docType: "Identity Proof", note: "", file: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  useEffect(() => {
    let mounted = true;
    loadDocuments(mounted);
    return () => { mounted = false; };
  }, []);

  async function loadDocuments(mounted = { current: true }) {
    setLoading(true);
    setError(null);
    try {
      // category "employee" is deliberate here — must stay in sync with the
      // TABS mapping in organization-admin/EmployeeDocumentsPage.jsx.
      const res = await getDocuments({ category: "employee" });
      const raw = res?.data;
      const data = Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
      if (mounted?.current !== false) setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      if (mounted?.current === false) return;
      setError(e?.message || "Failed to load upload history");
    } finally {
      if (mounted?.current !== false) setLoading(false);
    }
  }

  const historyItems = useMemo(() => {
    return history.map((d) => {
      const docType = d.title || d.name || d.document_type || d.type || "Document";
      const requestedOn = d.created_at || d.requested_on || d.uploaded_at || "";
      const status = normalizeStatus(d.status || d.document_status);
      const id = d.id || d.document_id;
      const formattedDate = requestedOn
        ? new Date(requestedOn).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "-";
      return { id, docType, requestedOn: formattedDate, status };
    });
  }, [history]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.append("document_type", form.docType);
      if (form.note.trim()) fd.append("note", form.note);
      fd.append("category", "employee");
      if (form.file) fd.append("file", form.file);
      if (user?.id) fd.append("employee_id", user.id);
      await uploadDocument(fd);
      setSubmitted(true);
      loadDocuments();
    } catch (e) {
      setSubmitError(e?.message || "Upload failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSubmitted(false);
    setForm({ docType: "Identity Proof", note: "", file: null });
    setSubmitError(null);
  }

  if (loading) {
    return (
      <EmployeePageShell title="Upload Request" subtitle="Request HR to upload or collect a document from you.">
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-doc-primary" />
          <span className="ml-3 text-doc-ink-soft dark:text-[#94a3b8]">Loading upload history...</span>
        </div>
      </EmployeePageShell>
    );
  }

  return (
    <EmployeePageShell title="Upload Request" subtitle="Request HR to upload or collect a document from you.">
      <DocumentErrorState message={error} />

      {!error && (
        <>
          {/* Request Form */}
          {!submitted ? (
            <div className="p-6 rounded-xl bg-doc-surface dark:bg-[#1e293b] border border-doc-border dark:border-[#334155] max-w-lg mb-7">
              <h3 className="text-base font-bold text-doc-ink dark:text-[#f1f5f9] m-0 mb-4">New Upload Request</h3>
              <div className="flex flex-col gap-3.5">
                <DocumentErrorState message={submitError} />
                <div>
                  <label htmlFor="upload-req-doc-type" className="text-xs font-semibold text-doc-ink dark:text-[#e2e8f0] block mb-1.5">Document Type</label>
                  <select
                    id="upload-req-doc-type"
                    value={form.docType}
                    onChange={(e) => setForm({ ...form, docType: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-doc-border dark:border-[#334155] bg-doc-surface dark:bg-[#0f172a] text-sm text-doc-ink dark:text-[#e2e8f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
                  >
                    {docTypeOptions.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="upload-req-file" className="text-xs font-semibold text-doc-ink dark:text-[#e2e8f0] block mb-1.5">Upload File</label>
                  <input
                    id="upload-req-file"
                    type="file"
                    onChange={(e) => setForm({ ...form, file: e.target.files[0] })}
                    className="w-full px-3 py-2.5 rounded-lg border border-doc-border dark:border-[#334155] text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-doc-primary/10 dark:file:bg-blue-900/30 file:text-doc-primary dark:file:text-blue-300 file:text-xs file:font-semibold hover:file:bg-doc-primary/20 dark:hover:file:bg-blue-900/50 bg-doc-surface dark:bg-[#0f172a] text-doc-ink dark:text-[#e2e8f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
                  />
                </div>
                <div>
                  <label htmlFor="upload-req-note" className="text-xs font-semibold text-doc-ink dark:text-[#e2e8f0] block mb-1.5">Additional Note (optional)</label>
                  <textarea
                    id="upload-req-note"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    rows={3}
                    placeholder="Any specific details for HR..."
                    className="w-full px-3 py-2.5 rounded-lg border border-doc-border dark:border-[#334155] text-sm resize-y box-border bg-doc-surface dark:bg-[#0f172a] text-doc-ink dark:text-[#e2e8f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary"
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-2.5 bg-doc-primary hover:bg-doc-primary-deep text-white border-none rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary-deep"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-800 max-w-lg mb-7 text-center">
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 m-0 mb-2">&#10003; Request Submitted!</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 m-0 mb-4">HR will process your request and notify you shortly.</p>
              <button
                onClick={resetForm}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800 text-white border-none rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
              >
                New Request
              </button>
            </div>
          )}

          {/* History */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-doc-ink dark:text-[#f1f5f9] m-0">Upload History</h3>
            </div>
            <DocumentErrorState message={fileError} />
            {historyItems.length === 0 ? (
              <DocumentEmptyState title="No upload history found" message="Documents you request or upload will appear here." />
            ) : (
              <div className="space-y-3 mt-3">
                {historyItems.map((h) => (
                  <DocumentRow
                    key={h.id || h.docType}
                    icon={FileText}
                    title={h.docType}
                    status={h.status}
                    meta={`Requested on ${h.requestedOn}`}
                    onView={h.id ? () => view(h.id) : undefined}
                    onDownload={h.id ? () => download(h.id) : undefined}
                    busy={busyId === h.id}
                    busyAction={busyAction}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </EmployeePageShell>
  );
}
