import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Upload, Search, X, Check, RefreshCw, FileText, Eye } from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDocuments, uploadDocument } from "../../../service/hrService";
import { API_BASE_URL } from "../../../service/api";
import { useAuth } from "../../../context/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/zoiko-hr/ess" },
  { label: "Profile", href: "/zoiko-hr/ess/profile" },
  { label: "Leave Management", href: "/zoiko-hr/ess/leave" },
  { label: "Attendance", href: "/zoiko-hr/ess/attendance" },
  { label: "My Documents", href: "/zoiko-hr/ess/my-documents" },
  { label: "Learning", href: "/zoiko-hr/ess/requests" },
  { label: "Settings", href: "/zoiko-hr/ess/settings" },
];

function SubNav() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-100">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === "/zoiko-hr/ess"}
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

const STATUS_META = {
  pending:  { label: "Pending",  bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500"  },
  approved: { label: "Approved", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", bg: "bg-rose-50",    text: "text-rose-700",   border: "border-rose-200",   dot: "bg-rose-500"   },
  expired:  { label: "Expired",  bg: "bg-slate-100",  text: "text-slate-500",  border: "border-slate-200",  dot: "bg-slate-400"  },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};

const CAT_COLORS = {
  company:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  employee: "bg-violet-50 text-violet-700 border-violet-200",
  contract: "bg-cyan-50 text-cyan-700 border-cyan-200",
  policy:   "bg-teal-50 text-teal-700 border-teal-200",
};

const CategoryPill = ({ category }) => {
  const cls = CAT_COLORS[category?.toLowerCase()] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${cls}`}>
      {category || "other"}
    </span>
  );
};

const fileTypeIcon = (filename = "") => {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map = { pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", png: "🖼️", jpg: "🖼️", jpeg: "🖼️", pptx: "📑" };
  return map[ext] || "📎";
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

function UploadModal({ onClose, onUploaded, user }) {
  const [file, setFile]         = useState(null);
  const [name, setName]         = useState("");
  const [category, setCategory] = useState("employee");
  const [description, setDesc]  = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState(null);
  const fileRef                 = useRef();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please select a file to upload."); return; }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", name || file.name);
      formData.append("category", category);
      if (description) formData.append("description", description);
      if (user?.id) formData.append("employee_id", user.id);
      await uploadDocument(formData);
      onUploaded();
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(e => e.msg || e.message || JSON.stringify(e)).join("; ")
        : (typeof detail === "string" ? detail : null);
      setError(msg || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-600" /> Upload Document
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">File *</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
            >
              {file ? (
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
              ) : (
                <>
                  <FileText className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Click to choose a file</p>
                  <p className="text-xs text-slate-300 mt-1">PDF, DOCX, XLSX, PNG…</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files[0] || null)} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Display Name</label>
            <input
              type="text"
              placeholder="Leave blank to use file name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Category *</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="employee">Employee</option>
              <option value="company">Company</option>
              <option value="contract">Contract</option>
              <option value="policy">Policy</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Optional notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {uploading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</>
                : <><Upload className="w-4 h-4" /> Upload</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EssMyDocuments() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState(null);
  const [fileViewUrl, setFileViewUrl] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await getDocuments({ employee_id: user.id });
      const raw = res?.data;
      setDocuments(Array.isArray(raw) ? raw : (raw?.items || raw?.data || []));
    } catch {
      showToast("error", "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = documents.filter((d) =>
    !search || d.title?.toLowerCase().includes(search.toLowerCase()) || d.category?.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, doc) => {
    const cat = doc.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  const categoryIcons = {
    payslips: "💰",
    "tax forms": "📋",
    certificates: "🏆",
    "offer letter": "📄",
    company: "🏢",
    employee: "👤",
    contract: "📝",
    policy: "📋",
    other: "📁",
  };

  const categoryColors = {
    payslips: "bg-blue-50 text-blue-600",
    "tax forms": "bg-orange-50 text-orange-600",
    certificates: "bg-purple-50 text-purple-600",
    "offer letter": "bg-green-50 text-green-600",
    company: "bg-indigo-50 text-indigo-600",
    employee: "bg-violet-50 text-violet-600",
    contract: "bg-cyan-50 text-cyan-600",
    policy: "bg-teal-50 text-teal-600",
    other: "bg-gray-50 text-gray-600",
  };

  return (
    <HRPage title="Employee Self Service" subtitle="Access your payslips, tax forms, certificates and more">
      <SubNav />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
            <p className="text-sm text-gray-500 mt-1">Access your payslips, tax forms, certificates and more</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>
        </div>

        <div className="relative max-w-sm">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400">
            🔍
          </div>
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm font-medium">Loading documents…</span>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">📄</span>
            <p className="text-base font-semibold text-slate-700 mb-1">
              {search ? "No results found" : "No documents yet"}
            </p>
            <p className="text-sm text-slate-400">
              {search ? "Try a different search term." : "Upload your first document using the button above."}
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, docs]) => {
            const catKey = category.toLowerCase();
            const icon = categoryIcons[catKey] || "📁";
            const colorCls = categoryColors[catKey] || "bg-gray-50 text-gray-600";
            return (
              <div key={category} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${colorCls}`}>
                    <span className="text-lg">{icon}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">{category.charAt(0).toUpperCase() + category.slice(1)}</h2>
                  <span className="text-xs text-gray-400">({docs.length} file{docs.length !== 1 ? "s" : ""})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {docs.map((doc) => (
                    <div key={doc.id} className="border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg">
                            <span className="text-lg">{fileTypeIcon(doc.file_name || doc.title)}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                            <p className="text-xs text-gray-400">{doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ""}</p>
                          </div>
                        </div>
                        <StatusBadge status={doc.status} />
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                        <span className="text-xs text-gray-400">Uploaded {fmtDate(doc.created_at)}</span>
                        <div className="flex gap-2">
                          {doc.file_path && (
                            <button
                              onClick={() => setFileViewUrl(`${API_BASE_URL}/${doc.file_path.replace(/\\/g, "/")}`)}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                          )}
                        </div>
                      </div>
                      {doc.rejection_reason && doc.status === "rejected" && (
                        <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                          Reason: {doc.rejection_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={load} user={user} />}

      {fileViewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-slate-900">Document Preview</h3>
              <button onClick={() => setFileViewUrl(null)} className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <iframe src={fileViewUrl} className="w-full h-[70vh] border-0 rounded-lg" title="Document preview" />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"} text-white`}>
          {toast.type === "success" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </HRPage>
  );
}
