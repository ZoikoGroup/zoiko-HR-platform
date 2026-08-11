import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import HRPage from "../../../components/HRPage";
import {
  getOnboardingDocuments,
  createOnboardingDocument,
  updateOnboardingDocument,
  deleteOnboardingDocument,
  getOnboardingRecords,
} from "../../../service/hrService";

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

const CATEGORIES = [
  { value: "id_proof", label: "ID Proof" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "nda", label: "NDA" },
  { value: "education_certificates", label: "Education Certificates" },
  { value: "experience_letters", label: "Experience Letters" },
  { value: "bank_details", label: "Bank Details" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const CATEGORY_COLORS = {
  id_proof: "bg-blue-100 text-blue-700",
  offer_letter: "bg-indigo-100 text-indigo-700",
  nda: "bg-purple-100 text-purple-700",
  education_certificates: "bg-cyan-100 text-cyan-700",
  experience_letters: "bg-teal-100 text-teal-700",
  bank_details: "bg-emerald-100 text-emerald-700",
  other: "bg-gray-100 text-gray-700",
};

const INITIAL_UPLOAD_FORM = {
  title: "",
  category: "",
  file: null,
  onboarding_record_id: "",
};

export default function OnboardingDocuments() {
  const [documents, setDocuments] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [recordFilter, setRecordFilter] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadForm, setUploadForm] = useState({ ...INITIAL_UPLOAD_FORM });
  const [formErrors, setFormErrors] = useState({});

  const fetchDocuments = async (recordId) => {
    setLoading(true);
    setError(null);
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

  const filtered = categoryFilter
    ? documents.filter((d) => d.category === categoryFilter)
    : documents;

  const resetUploadForm = () => {
    setUploadForm({ ...INITIAL_UPLOAD_FORM });
    setFormErrors({});
  };

  const validateUpload = () => {
    const errors = {};
    if (!uploadForm.title.trim()) errors.title = "Title is required";
    if (!uploadForm.category) errors.category = "Category is required";
    if (!uploadForm.file) errors.file = "File is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!validateUpload()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", uploadForm.title.trim());
      fd.append("category", uploadForm.category);
      fd.append("file", uploadForm.file);
      if (uploadForm.onboarding_record_id) {
        fd.append("onboarding_record_id", uploadForm.onboarding_record_id);
      }
      await createOnboardingDocument(fd);
      setShowUploadModal(false);
      resetUploadForm();
      await fetchDocuments(recordFilter);
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to upload document" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await updateOnboardingDocument(id, { status: "approved" });
      await fetchDocuments(recordFilter);
    } catch (err) {
      setError(err.message || "Failed to approve document");
    }
  };

  const openRejectModal = (doc) => {
    setRejectTarget(doc);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await updateOnboardingDocument(rejectTarget.id, {
        status: "rejected",
        rejection_reason: rejectionReason.trim() || null,
      });
      setShowRejectModal(false);
      setRejectTarget(null);
      setRejectionReason("");
      await fetchDocuments(recordFilter);
    } catch (err) {
      setError(err.message || "Failed to reject document");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await deleteOnboardingDocument(id);
      await fetchDocuments(recordFilter);
    } catch (err) {
      setError(err.message || "Failed to delete document");
    }
  };

  if (loading && documents.length === 0) {
    return (
      <HRPage title="Onboarding Documents" subtitle="Upload and verify employee onboarding documents.">
        <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
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
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading documents...</span>
        </div>
      </HRPage>
    );
  }

  return (
    <HRPage title="Onboarding Documents" subtitle="Upload and verify employee onboarding documents.">
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
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

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={recordFilter}
              onChange={(e) => setRecordFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Records</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.candidate_name || `Record #${r.id}`}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { resetUploadForm(); setShowUploadModal(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Upload Document
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter("")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              !categoryFilter
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                categoryFilter === cat.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                ? "No documents yet. Upload the first document."
                : "No documents match the selected category."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Uploaded Date</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((doc) => {
                    const catDef = CATEGORIES.find((c) => c.value === doc.category);
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{doc.title}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700"}`}>
                            {catDef?.label || doc.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-600"}`}>
                            {doc.status ? doc.status.charAt(0).toUpperCase() + doc.status.slice(1) : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {doc.file_url && (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium px-1"
                              >
                                Download
                              </a>
                            )}
                            {doc.status !== "approved" && (
                              <button
                                onClick={() => handleApprove(doc.id)}
                                className="text-green-600 hover:text-green-800 text-xs font-medium px-1"
                              >
                                Approve
                              </button>
                            )}
                            {doc.status !== "rejected" && (
                              <button
                                onClick={() => openRejectModal(doc)}
                                className="text-red-500 hover:text-red-700 text-xs font-medium px-1"
                              >
                                Reject
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="text-gray-400 hover:text-red-600 text-xs px-1"
                            >
                              Delete
                            </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Upload Document</h2>
              <button onClick={() => { setShowUploadModal(false); resetUploadForm(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpload} className="p-6 space-y-4">
              {formErrors.submit && (
                <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{formErrors.submit}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className={`w-full border ${formErrors.title ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
                  className={`w-full border ${formErrors.category ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select category...</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                {formErrors.category && <p className="text-red-500 text-xs mt-1">{formErrors.category}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding Record</label>
                <select
                  value={uploadForm.onboarding_record_id}
                  onChange={(e) => setUploadForm({ ...uploadForm, onboarding_record_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.candidate_name || `Record #${r.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                <input
                  type="file"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files[0] })}
                  className={`w-full border ${formErrors.file ? "border-red-300" : "border-gray-200"} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {formErrors.file && <p className="text-red-500 text-xs mt-1">{formErrors.file}</p>}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowUploadModal(false); resetUploadForm(); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors">
                  {submitting ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {showRejectModal && rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Reject Document</h2>
              <button onClick={() => { setShowRejectModal(false); setRejectTarget(null); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Rejecting: <span className="font-medium text-gray-800">{rejectTarget.title}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide a reason for rejection..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowRejectModal(false); setRejectTarget(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleReject} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">
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
