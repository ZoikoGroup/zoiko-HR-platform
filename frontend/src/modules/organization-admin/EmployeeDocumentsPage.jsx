import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, FileText, Download, User, Hash,
  Clock, Upload, X, Loader2, Check, Filter, Receipt, FileSignature, ShieldCheck, Eye
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { getDocuments, uploadDocument, getHrEmployees } from "../../service/hrService";
import { API_BASE_URL, getAccessToken } from "../../service/api";

const TABS = [
  { key: "payslip",  label: "Payslips",           icon: Receipt,       category: "payslip" },
  { key: "employee", label: "Offer & Contracts",   icon: FileSignature, category: "employee" },
  { key: "tax",      label: "Tax & Compliance",    icon: ShieldCheck,   category: "tax" },
  { key: "all",      label: "All Documents",       icon: FileText,      category: null },
];

const STATUS_META = {
  pending:  { label: "Pending",  bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200" },
  approved: { label: "Approved", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  rejected: { label: "Rejected", bg: "bg-rose-50",    text: "text-rose-700",   border: "border-rose-200" },
  expired:  { label: "Expired",  bg: "bg-slate-100",  text: "text-slate-500",  border: "border-slate-200" },
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

export default function OrgAdminEmployeeDocumentsPage() {
  const [tab, setTab] = useState("payslip");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [uploadModal, setUploadModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    employee_id: "", title: "", document_type: "", expiry_date: "", category: "payslip",
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [fileViewUrl, setFileViewUrl] = useState(null);
  const [fileViewLoading, setFileViewLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const currentCategory = TABS.find(t => t.key === tab)?.category;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (currentCategory) params.category = currentCategory;
      const res = await getDocuments(params);
      const raw = res?.data;
      setDocs(Array.isArray(raw) ? raw : (raw?.items || raw?.data || []));
    } catch (e) { setError(e?.message || "Failed to load documents."); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const res = await getHrEmployees({ status: "active" });
      const raw = res?.items || res?.data || res;
      setEmployees(Array.isArray(raw) ? raw : []);
    } catch { setEmployees([]); }
    finally { setEmployeesLoading(false); }
  };

  const handleUploadClick = () => {
    const defCat = currentCategory || "employee";
    const defType = defCat === "employee" ? "contract" : defCat === "payslip" ? "payslip" : defCat === "tax" ? "tax_form" : "";
    setUploadForm({ employee_id: "", title: "", document_type: defType, expiry_date: "", category: defCat });
    setUploadFile(null);
    loadEmployees();
    setUploadModal(true);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadForm.employee_id) { showToast("error", "Select employee and file"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("title", uploadForm.title || uploadFile.name);
      fd.append("category", uploadForm.category);
      fd.append("employee_id", uploadForm.employee_id);
      if (uploadForm.document_type) fd.append("document_type", uploadForm.document_type);
      if (uploadForm.expiry_date) fd.append("expiry_date", uploadForm.expiry_date);
      await uploadDocument(fd);
      showToast("success", "Document uploaded successfully");
      setUploadModal(false);
      load();
    } catch (e) { showToast("error", e?.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const filtered = docs.filter(d =>
    !search.trim() || (d.title || "").toLowerCase().includes(search.trim().toLowerCase()) ||
    (d.employee_name || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  const getDownloadUrl = (d) => {
    if (d.file_url) return d.file_url;
    if (d.file_path) return `${API_BASE_URL || ""}/${d.file_path.replace(/\\/g, "/")}`;
    return null;
  };

  const handleView = async (d) => {
    setFileViewLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/hr/documents/${d.id}/file`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      setFileViewUrl(URL.createObjectURL(await res.blob()));
    } catch {
      showToast("error", "Could not load document for preview");
    } finally {
      setFileViewLoading(false);
    }
  };

  const closeFileView = () => {
    if (fileViewUrl && fileViewUrl.startsWith("blob:")) URL.revokeObjectURL(fileViewUrl);
    setFileViewUrl(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F4FB] p-4 font-sans">
      <PageHeader
        title="Employee Documents"
        description="Upload and manage payslips, contracts, tax & compliance documents for employees"
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? "bg-indigo-600 text-white shadow-sm" : "bg-white border border-gray-200 text-slate-600 hover:bg-gray-50"
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleUploadClick}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
            <Upload className="w-4 h-4" /> Upload Document
          </button>
          <button onClick={load}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 border border-gray-200 bg-white px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search by document name or employee..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white" />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-sm font-medium">Loading documents...</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <span className="text-5xl mb-4">📄</span>
              <p className="text-base font-semibold text-slate-700 mb-1">
                {search ? "No results found" : "No documents yet"}
              </p>
              <p className="text-sm text-slate-400">
                {search ? "Try a different search term." : "Upload documents using the Upload Document button above."}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold"><Hash className="w-3 h-3 inline mr-1" />ID</th>
                    <th className="text-left px-6 py-3 font-semibold"><User className="w-3 h-3 inline mr-1" />Employee</th>
                    <th className="text-left px-6 py-3 font-semibold"><FileText className="w-3 h-3 inline mr-1" />Document</th>
                    <th className="text-center px-6 py-3 font-semibold">Type</th>
                    <th className="text-center px-6 py-3 font-semibold">Status</th>
                    <th className="text-center px-6 py-3 font-semibold"><Clock className="w-3 h-3 inline mr-1" />Date</th>
                    <th className="text-center px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-3 text-xs font-mono text-slate-400">{d.id}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                            {(d.employee_name || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">{d.employee_name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg shrink-0">{fileTypeIcon(d.file_name || d.title)}</span>
                          <div>
                            <p className="font-medium text-slate-800 truncate max-w-[200px]">{d.title}</p>
                            {d.file_name && <p className="text-xs text-slate-400">{d.file_name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {d.document_type || d.category || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          STATUS_META[d.status]?.bg || "bg-slate-100"} ${STATUS_META[d.status]?.text || "text-slate-500"} ${STATUS_META[d.status]?.border || "border-slate-200"
                        }`}>{d.status}</span>
                      </td>
                      <td className="px-6 py-3 text-center text-xs text-slate-400">{fmtDate(d.created_at)}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {getDownloadUrl(d) && (
                            <>
                              <button onClick={() => handleView(d)} disabled={fileViewLoading}
                                className="p-1.5 rounded-lg text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 transition-colors" title="View">
                                {fileViewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <a href={getDownloadUrl(d)} download
                                className="p-1.5 rounded-lg text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors" title="Download">
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-6 py-3 border-t border-gray-100 text-xs text-slate-400">
                {filtered.length} document{filtered.length !== 1 ? "s" : ""}
              </div>
            </>
          )}
        </div>
      )}

      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Upload Document</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Assign a document to an employee
                </p>
              </div>
              <button onClick={() => setUploadModal(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
                  Employee <span className="text-rose-500">*</span>
                </label>
                {employeesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading employees...
                  </div>
                ) : (
                  <select value={uploadForm.employee_id} onChange={e => setUploadForm(p => ({ ...p, employee_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                    <option value="">Select employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName || emp.full_name || `${emp.firstName || emp.first_name || ""} ${emp.lastName || emp.last_name || ""}`}
                        {emp.employeeCode || emp.employee_code ? ` (${emp.employeeCode || emp.employee_code})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Category</label>
                  <select value={uploadForm.category} onChange={e => setUploadForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                    <option value="payslip">Payslip</option>
                    <option value="employee">Offer & Contract</option>
                    <option value="tax">Tax & Compliance</option>
                    <option value="other">Other</option>
                  </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Document Type</label>
                <select value={uploadForm.document_type} onChange={e => setUploadForm(p => ({ ...p, document_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                  <option value="">Select type...</option>
                  <option value="payslip">Payslip</option>
                  <option value="offer_letter">Offer Letter</option>
                  <option value="contract">Contract</option>
                  <option value="nda">NDA</option>
                  <option value="tax_form">Tax Form</option>
                  <option value="compliance">Compliance Document</option>
                  <option value="appraisal">Appraisal</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Title</label>
                <input type="text" value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. June 2026 Payslip, Offer Letter, Tax Form"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">File <span className="text-rose-500">*</span></label>
                <div className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${uploadFile ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
                  onClick={() => document.getElementById("org-emp-doc-input").click()}>
                  {uploadFile ? (
                    <div>
                      <span className="text-2xl">📄</span>
                      <p className="text-sm font-medium text-slate-700 mt-1">{uploadFile.name}</p>
                      <p className="text-xs text-slate-400">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Click to select file</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, DOC, XLS, images accepted</p>
                    </div>
                  )}
                </div>
                <input id="org-emp-doc-input" type="file" className="hidden"
                  onChange={e => setUploadFile(e.target.files[0] || null)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Expiry Date (optional)</label>
                <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </div>
            <div className="p-6 pt-0 border-t border-slate-100">
              <button onClick={handleUpload} disabled={!uploadFile || !uploadForm.employee_id || uploading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 transition flex items-center justify-center gap-2">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload Document</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {fileViewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeFileView}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-slate-900">Document Preview</h3>
              <button onClick={closeFileView} className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600">
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
          {toast.msg}
        </div>
      )}
    </div>
  );
}
