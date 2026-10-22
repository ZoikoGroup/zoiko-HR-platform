import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import {
  getOnboardingDocuments,
  createOnboardingDocument,
  updateOnboardingDocument,
  deleteOnboardingDocument,
  getOnboardingRecords,
  getOnboardingDocumentFile,
  requestOnboardingDocuments,
} from "../../../service/hrService";
import { formatDate } from "../../../utils/dateTime";
import { MAX_FILE_MB, validateUploadForm, serverUploadErrors, fileSizeText, extensionOf } from "../../../utils/onboardingDocForm";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/onboarding" },
  { label: "New Hires", href: "/zoiko-hr/onboarding/new-hires" },
  { label: "Pre-Onboarding", href: "/zoiko-hr/onboarding/pre-onboarding" },
  { label: "Documents", href: "/zoiko-hr/onboarding/documents" },
  { label: "Checklists", href: "/zoiko-hr/onboarding/checklists" },
  { label: "Orientation", href: "/zoiko-hr/onboarding/orientation" },
  { label: "Reports", href: "/zoiko-hr/onboarding/reports" },
  { label: "Settings", href: "/zoiko-hr/onboarding/settings" },
];

export const CATEGORIES = [
  { value: "id_proof", label: "ID proof" },
  { value: "offer_letter", label: "Signed offer letter" },
  { value: "nda", label: "Signed NDA" },
  { value: "education_certificates", label: "Education certificates" },
  { value: "experience_letters", label: "Experience letters" },
  { value: "bank_details", label: "Bank details" },
  { value: "other", label: "Other" },
];

export const STATUSES = [
  { value: "requested", label: "Requested (waiting for new hire)", short: "Requested", cls: "bg-blue-100 text-blue-800" },
  { value: "pending", label: "Needs review", short: "Needs review", cls: "bg-yellow-100 text-yellow-800" },
  { value: "approved", label: "Approved", short: "Approved", cls: "bg-green-100 text-green-800" },
  { value: "rejected", label: "Rejected", short: "Rejected", cls: "bg-red-100 text-red-800" },
];

// HR uploads accept this narrower set (the shared form rules allow more types).
export const UPLOAD_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];

export function validateHrUpload(form) {
  const errors = validateUploadForm(form);
  if (!errors.file && form.file && !UPLOAD_EXTENSIONS.includes(extensionOf(form.file.name))) {
    errors.file = `${extensionOf(form.file.name) || "This"} file type is not allowed. Use a PDF, JPG, PNG or Word (DOC/DOCX) file.`;
  }
  return errors;
}

const CATEGORY_COLORS = {
  id_proof: "bg-blue-100 text-blue-700",
  offer_letter: "bg-[#0A1128]/10 text-[#0A1128]",
  nda: "bg-amber-100 text-amber-700",
  education_certificates: "bg-cyan-100 text-cyan-700",
  experience_letters: "bg-teal-100 text-teal-700",
  bank_details: "bg-emerald-100 text-emerald-700",
  other: "bg-gray-100 text-gray-700",
};

const INACTIVE_HIRE_STATUSES = ["completed", "cancelled"];

const INITIAL_UPLOAD_FORM = {
  title: "",
  category: "",
  file: null,
  onboarding_record_id: "",
};

function SubNav() {
  return (
    <div className="hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/onboarding"}
          className={({ isActive }) =>
            `whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function OnboardingDocuments() {
  const [documents, setDocuments] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [recordFilter, setRecordFilter] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadForm, setUploadForm] = useState({ ...INITIAL_UPLOAD_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [rejectError, setRejectError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);   // changing it empties the file box
  const [busyId, setBusyId] = useState(null);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestHire, setRequestHire] = useState("");
  const [requestCategories, setRequestCategories] = useState([]);
  const [requestError, setRequestError] = useState("");
  const [requesting, setRequesting] = useState(false);

  const fetchDocuments = async (recordId) => {
    setLoading(true);
    try {
      const data = await getOnboardingDocuments(recordId || undefined);
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    try {
      const data = await getOnboardingRecords();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    fetchDocuments(recordFilter);
  }, [recordFilter]);

  const showSuccess = (text) => {
    setError(null);
    setSuccess(text);
    setTimeout(() => setSuccess((s) => (s === text ? "" : s)), 5000);
  };
  const showError = (text) => {
    setSuccess("");
    setError(text);
  };

  const activeHires = records.filter((r) => !INACTIVE_HIRE_STATUSES.includes(r.status));

  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s.value] = documents.filter((d) => (d.status || "pending") === s.value).length;
    return acc;
  }, {});

  const filtered = documents.filter(
    (d) => (!categoryFilter || d.category === categoryFilter) && (!statusFilter || (d.status || "pending") === statusFilter)
  );

  const resetUploadForm = () => {
    setUploadForm({ ...INITIAL_UPLOAD_FORM });
    setFormErrors({});
    setFileInputKey((k) => k + 1);
  };

  // typing or choosing in a field clears that field's message
  const setUploadField = (key, value) => {
    setUploadForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => (prev[key] || prev.submit ? { ...prev, [key]: undefined, submit: undefined } : prev));
  };

  const validateUpload = () => {
    const errors = validateHrUpload(uploadForm);
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const recordName = (id) => {
    if (!id) return "-";
    const r = records.find((x) => x.id === id || x.id === Number(id));
    return r?.candidate_name || `New hire #${id}`;
  };

  const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || value;

  const fetchFile = async (doc) => {
    setBusyId(doc.id);
    try {
      return await getOnboardingDocumentFile(doc.id);
    } catch (err) {
      showError(err.message || "The file could not be loaded.");
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const handleView = async (doc) => {
    const res = await fetchFile(doc);
    if (!res) return;
    const url = URL.createObjectURL(res.blob);
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      showError("The browser blocked the new tab. Use Download instead.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleDownload = async (doc) => {
    const res = await fetchFile(doc);
    if (!res) return;
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename || doc.title;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!validateUpload()) return;
    setSubmitting(true);
    const fillsRequest = uploadForm.onboarding_record_id
      && documents.some((d) => String(d.onboarding_new_hire_id) === String(uploadForm.onboarding_record_id)
        && d.category === uploadForm.category && ["requested", "rejected"].includes(d.status));
    try {
      const fd = new FormData();
      fd.append("title", uploadForm.title.trim().replace(/\s+/g, " "));
      fd.append("category", uploadForm.category);
      fd.append("file", uploadForm.file);
      if (uploadForm.onboarding_record_id) {
        fd.append("onboarding_record_id", uploadForm.onboarding_record_id);
      }
      await createOnboardingDocument(fd);
      setShowUploadModal(false);
      resetUploadForm();
      showSuccess(fillsRequest ? "Document uploaded. It fills the open request and is ready for review." : "Document uploaded.");
      await fetchDocuments(recordFilter);
    } catch (err) {
      const fields = serverUploadErrors(err?.validation ?? err?.detail);
      setFormErrors(Object.keys(fields).length ? fields : { submit: err.message || "The document could not be uploaded. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (doc) => {
    setBusyId(doc.id);
    try {
      await updateOnboardingDocument(doc.id, { status: "approved" });
      showSuccess(`"${doc.title}" approved.`);
      await fetchDocuments(recordFilter);
    } catch (err) {
      showError(err.message || "Failed to approve document");
    } finally {
      setBusyId(null);
    }
  };

  const openRejectModal = (doc) => {
    setRejectTarget(doc);
    setRejectionReason("");
    setRejectError("");
    setShowRejectModal(true);
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setRejectTarget(null);
    setRejectionReason("");
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) { setRejectError("Enter a reason, so the person knows what to fix."); return; }
    setSubmitting(true);
    try {
      await updateOnboardingDocument(rejectTarget.id, {
        status: "rejected",
        rejection_reason: rejectionReason.trim(),
      });
      const who = rejectTarget.onboarding_new_hire_id ? recordName(rejectTarget.onboarding_new_hire_id) : "";
      showSuccess(`"${rejectTarget.title}" rejected.${who ? ` ${who} was emailed to upload it again.` : ""}`);
      closeRejectModal();
      await fetchDocuments(recordFilter);
    } catch (err) {
      setRejectError(err.message || "Failed to reject document");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    setBusyId(doc.id);
    try {
      await deleteOnboardingDocument(doc.id);
      showSuccess("Document deleted.");
      await fetchDocuments(recordFilter);
    } catch (err) {
      showError(err.message || "Failed to delete document");
    } finally {
      setBusyId(null);
    }
  };

  const openRequestModal = () => {
    setRequestHire(recordFilter && activeHires.some((r) => String(r.id) === String(recordFilter)) ? String(recordFilter) : "");
    setRequestCategories([]);
    setRequestError("");
    setShowRequestModal(true);
  };

  const toggleRequestCategory = (value) => {
    setRequestError("");
    setRequestCategories((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!requestHire) { setRequestError("Choose a new hire."); return; }
    if (requestCategories.length === 0) { setRequestError("Choose at least one document."); return; }
    setRequesting(true);
    try {
      const created = await requestOnboardingDocuments(Number(requestHire), requestCategories);
      const n = Array.isArray(created) ? created.length : requestCategories.length;
      setShowRequestModal(false);
      showSuccess(`Requested ${n} document(s); ${recordName(Number(requestHire))} was emailed.`);
      await fetchDocuments(recordFilter);
    } catch (err) {
      setRequestError(err.message || "The documents could not be requested.");
    } finally {
      setRequesting(false);
    }
  };

  if (loading && documents.length === 0 && !error) {
    return (
      <HRPage title="Onboarding Documents" subtitle="Request, collect and review new hires' onboarding documents.">
        <SubNav />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading documents...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Onboarding Documents" subtitle="Request, collect and review new hires' onboarding documents.">
      <SubNav />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-start gap-3">
          <span className="min-w-0 break-words">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-500 hover:text-red-700 font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}
      {success && (
        <div role="status" className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex justify-between items-start gap-3">
          <span className="min-w-0 break-words">{success}</span>
          <button onClick={() => setSuccess("")} aria-label="Dismiss" className="text-green-600 hover:text-green-800 font-bold p-1.5 -m-1.5 shrink-0">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        {/* Status counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s.value ? "" : s.value)}
              className={`text-left bg-white rounded-xl border shadow-sm px-4 py-3 transition-colors ${
                statusFilter === s.value ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-100 hover:border-gray-200"
              }`}
              data-testid={`count-${s.value}`}
            >
              <p className="text-xs text-gray-500 truncate">{s.short}</p>
              <p className="text-xl font-bold text-gray-800">{statusCounts[s.value] || 0}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <select
              aria-label="New hire"
              value={recordFilter}
              onChange={(e) => setRecordFilter(e.target.value)}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All new hires</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.candidate_name || `New hire #${r.id}`}
                </option>
              ))}
            </select>
            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openRequestModal}
              className="border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Request documents from a new hire
            </button>
            <button
              onClick={() => { resetUploadForm(); setShowUploadModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + Upload Document
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <button
            onClick={() => setCategoryFilter("")}
            className={`whitespace-nowrap shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              !categoryFilter ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`whitespace-nowrap shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                categoryFilter === cat.value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-gray-500 font-medium">
              {documents.length === 0
                ? "No documents yet. Upload one or request documents from a new hire."
                : "No documents match the selected filters."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">New hire</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="hidden md:table-cell text-left px-4 py-3 font-semibold text-gray-600">File</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((doc) => {
                    const status = doc.status || "pending";
                    const st = STATUSES.find((s) => s.value === status);
                    const busy = busyId === doc.id;
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800 break-words max-w-[14rem]">{doc.title}</td>
                        <td className="px-4 py-3 text-gray-600 break-words">{recordName(doc.onboarding_new_hire_id)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700"}`}>
                            {categoryLabel(doc.category)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${st?.cls || "bg-gray-100 text-gray-600"}`}>
                            {st?.short || status}
                          </span>
                          {status === "rejected" && doc.rejection_reason ? (
                            <p className="text-xs text-gray-400 mt-1 max-w-[220px] break-words">{doc.rejection_reason}</p>
                          ) : null}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-xs">
                          {doc.file_url ? (
                            <span className="text-gray-600">
                              Uploaded{doc.updated_at || doc.created_at ? ` ${formatDate(doc.updated_at || doc.created_at)}` : ""}
                            </span>
                          ) : (
                            <span className="text-gray-400">Not uploaded</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {doc.file_url && (
                              <>
                                <button onClick={() => handleView(doc)} disabled={busy} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1 disabled:opacity-50">View</button>
                                <button onClick={() => handleDownload(doc)} disabled={busy} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1 disabled:opacity-50">Download</button>
                              </>
                            )}
                            {status === "pending" && (
                              <button onClick={() => handleApprove(doc)} disabled={busy} className="text-green-600 hover:text-green-800 text-xs font-medium px-1 disabled:opacity-50">Approve</button>
                            )}
                            {(status === "pending" || status === "approved") && (
                              <button onClick={() => openRejectModal(doc)} disabled={busy} className="text-red-500 hover:text-red-700 text-xs font-medium px-1 disabled:opacity-50">Reject</button>
                            )}
                            <button onClick={() => handleDelete(doc)} disabled={busy} className="text-gray-400 hover:text-red-600 text-xs px-1 disabled:opacity-50">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {documents.length > 0 && (
          <div className="text-xs text-gray-400">
            Showing {filtered.length} of {documents.length} document{documents.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Upload Document</h2>
              <button onClick={() => { setShowUploadModal(false); resetUploadForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5">&times;</button>
            </div>
            <form noValidate onSubmit={handleUpload} className="p-4 sm:p-6 space-y-4">
              {formErrors.submit && (
                <div role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 p-2 rounded">{formErrors.submit}</div>
              )}
              <div>
                <label htmlFor="od-title" className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  id="od-title"
                  type="text"
                  value={uploadForm.title}
                  maxLength={200}
                  aria-invalid={!!formErrors.title}
                  onChange={(e) => setUploadField("title", e.target.value)}
                  className={`w-full border ${formErrors.title ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.title && <p role="alert" className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
              </div>
              <div>
                <label htmlFor="od-category" className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-red-500">*</span></label>
                <select
                  id="od-category"
                  value={uploadForm.category}
                  aria-invalid={!!formErrors.category}
                  onChange={(e) => setUploadField("category", e.target.value)}
                  className={`w-full border ${formErrors.category ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select category...</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                {formErrors.category && <p role="alert" className="text-red-500 text-xs mt-1">{formErrors.category}</p>}
              </div>
              <div>
                <label htmlFor="od-record" className="block text-sm font-medium text-gray-700 mb-1">New hire</label>
                <select
                  id="od-record"
                  value={uploadForm.onboarding_record_id}
                  onChange={(e) => setUploadField("onboarding_record_id", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.candidate_name || `New hire #${r.id}`}
                    </option>
                  ))}
                </select>
                {formErrors.onboarding_record_id && <p role="alert" className="text-red-500 text-xs mt-1">{formErrors.onboarding_record_id}</p>}
                <p className="text-xs text-gray-400 mt-1">If this new hire has an open request for the same category, the upload fills that request.</p>
              </div>
              <div>
                <label htmlFor="od-file" className="block text-sm font-medium text-gray-700 mb-1">File <span className="text-red-500">*</span></label>
                <input
                  id="od-file"
                  key={fileInputKey}
                  type="file"
                  accept={UPLOAD_EXTENSIONS.join(",")}
                  aria-invalid={!!formErrors.file}
                  onChange={(e) => setUploadField("file", e.target.files?.[0] || null)}
                  className={`w-full border ${formErrors.file ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {uploadForm.file && !formErrors.file ? <p className="text-xs text-gray-400 mt-1 break-all">{uploadForm.file.name} ({fileSizeText(uploadForm.file.size)})</p> : null}
                {!uploadForm.file && !formErrors.file ? <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOC or DOCX. Up to {MAX_FILE_MB} MB.</p> : null}
                {formErrors.file && <p role="alert" className="text-red-500 text-xs mt-1">{formErrors.file}</p>}
              </div>
              <div className="flex flex-wrap justify-end gap-2 sm:gap-3 pt-2">
                <button type="button" onClick={() => { setShowUploadModal(false); resetUploadForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Documents Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Request documents</h2>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5">&times;</button>
            </div>
            <form noValidate onSubmit={handleRequest} className="p-4 sm:p-6 space-y-4">
              {requestError && (
                <div role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 p-2 rounded">{requestError}</div>
              )}
              <div>
                <label htmlFor="req-hire" className="block text-sm font-medium text-gray-700 mb-1">New hire <span className="text-red-500">*</span></label>
                <select
                  id="req-hire"
                  value={requestHire}
                  onChange={(e) => { setRequestHire(e.target.value); setRequestError(""); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a new hire...</option>
                  {activeHires.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.candidate_name || `New hire #${r.id}`}{r.email ? ` (${r.email})` : ""}
                    </option>
                  ))}
                </select>
                {activeHires.length === 0 && <p className="text-xs text-gray-400 mt-1">There are no active new hires.</p>}
              </div>
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-1">Documents to request <span className="text-red-500">*</span></legend>
                <div className="space-y-1">
                  {CATEGORIES.map((cat) => (
                    <label key={cat.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={requestCategories.includes(cat.value)}
                        onChange={() => toggleRequestCategory(cat.value)}
                        className="rounded border-gray-300"
                      />
                      {cat.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-xs text-gray-400">The new hire is emailed a link to upload these through their pre-onboarding page.</p>
              <div className="flex flex-wrap justify-end gap-2 sm:gap-3 pt-2">
                <button type="button" onClick={() => setShowRequestModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={requesting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {requesting ? "Sending..." : "Send request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Reject Document</h2>
              <button onClick={closeRejectModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1.5 -m-1.5">&times;</button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-gray-600 break-words">
                Rejecting: <span className="font-medium text-gray-800">{rejectTarget.title}</span>
                {rejectTarget.onboarding_new_hire_id ? ` (${recordName(rejectTarget.onboarding_new_hire_id)})` : ""}
              </p>
              <div>
                <label htmlFor="od-reject-reason" className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea
                  id="od-reject-reason"
                  rows={3}
                  value={rejectionReason}
                  maxLength={1000}
                  onChange={(e) => { setRejectionReason(e.target.value); setRejectError(""); }}
                  placeholder="Provide a reason for rejection..."
                  className={`w-full border ${rejectError ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {rejectError ? <p role="alert" className="text-red-500 text-xs mt-1">{rejectError}</p> : null}
                {rejectTarget.onboarding_new_hire_id ? (
                  <p className="text-xs text-gray-400 mt-1">The new hire is emailed this reason and asked to upload the document again.</p>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2 sm:gap-3 pt-2">
                <button type="button" onClick={closeRejectModal} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleReject} disabled={submitting} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors">
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </HRPage>
  );
}
