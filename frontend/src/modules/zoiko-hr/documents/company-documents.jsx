import { useState, useEffect, useMemo } from "react";
import {
  Search, Hash, Building2, RefreshCw, Lock, Unlock, Eye, Shield, Users,
  UserPlus, X, Loader2, Trash2, Check, UserCheck, Upload
} from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDocuments, getHrEmployees, assignDocumentToEmployees, getDocumentAssignments, removeDocumentAssignment, uploadDocument } from "../../../service/hrService";

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

const STATUS_FILTERS = ["all", "pending", "approved", "rejected", "expired"];

const ACCESS_ROLE_LABELS = {
  all: "All Employees", employee: "All Employees", manager: "Managers+",
  hr_admin: "HR Admin+", admin: "Admin Only",
};

export default function CompanyDocuments() {
  const [docs, setDocs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState("");
  const [empIdSearch, setEmpIdSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // assign modal
  const [assignModal, setAssignModal] = useState(null);
  const [employees, setEmployees]     = useState([]);
  const [empLoading, setEmpLoading]   = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [assigning, setAssigning]     = useState(false);

  // view assignments modal
  const [viewAssignModal, setViewAssignModal] = useState(null);
  const [assignments, setAssignments]   = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // upload modal
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: "", description: "", document_type: "", expiry_date: "" });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [assignAfterUpload, setAssignAfterUpload] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const load = () => {
    setLoading(true); setError(null);
    const params = {};
    if (empIdSearch.trim()) params.employee_id_str = empIdSearch.trim();
    return getDocuments(params)
      .then(res => {
        const raw = res?.data;
        const items = Array.isArray(raw) ? raw : (raw?.items || raw?.data || []);
        setDocs(items);
      })
      .catch(err => { console.error("[CompanyDocs] load error:", err); setError("Could not fetch company documents."); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [empIdSearch]);

  const loadEmployees = async () => {
    setEmpLoading(true);
    try {
      const res = await getHrEmployees({ status: "active" });
      const raw = res?.items || res?.data || res;
      setEmployees(Array.isArray(raw) ? raw : []);
    } catch { setEmployees([]); }
    finally { setEmpLoading(false); }
  };

  const openAssignModal = (doc) => {
    setAssignModal(doc);
    setSelectedEmpIds([]);
    loadEmployees();
  };

  const handleAssign = async () => {
    if (!selectedEmpIds.length) return;
    setAssigning(true);
    try {
      await assignDocumentToEmployees(assignModal.id, selectedEmpIds, "");
      showToast("success", `Document assigned to ${selectedEmpIds.length} employee(s)`);
      setAssignModal(null);
    } catch (e) { showToast("error", e?.message || "Assignment failed"); }
    finally { setAssigning(false); }
  };

  const openViewAssignments = async (doc) => {
    setViewAssignModal(doc);
    setAssignLoading(true);
    try {
      const res = await getDocumentAssignments(doc.id);
      setAssignments(res?.items || res?.data || []);
    } catch { setAssignments([]); }
    finally { setAssignLoading(false); }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await removeDocumentAssignment(assignmentId);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      showToast("success", "Assignment removed");
    } catch (e) { showToast("error", e?.message || "Failed to remove"); }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("title", uploadForm.title || uploadFile.name);
      fd.append("category", "company");
      if (uploadForm.description) fd.append("description", uploadForm.description);
      if (uploadForm.document_type) fd.append("document_type", uploadForm.document_type);
      if (uploadForm.expiry_date) fd.append("expiry_date", uploadForm.expiry_date);
      const res = await uploadDocument(fd);
      const newDoc = res?.data;
      if (newDoc?.id) {
        setDocs(prev => [newDoc, ...prev]);
      }
      showToast("success", `"${uploadForm.title || uploadFile.name}" uploaded`);
      setUploadModal(false);
      setUploadFile(null);
      setUploadForm({ title: "", description: "", document_type: "", expiry_date: "" });
      if (assignAfterUpload && newDoc?.id) {
        setAssignAfterUpload(false);
        openAssignModal(newDoc);
      }
    } catch (e) {
      console.error("[Upload] failed:", e);
      showToast("error", e?.message || "Upload failed");
    }
    finally { setUploading(false); }
  };

  const toggleEmp = (id) => {
    setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const companyDocs = useMemo(() =>
    docs
      .filter(d => statusFilter === "all" || d.status === statusFilter)
      .filter(d => !search.trim() || d.title?.toLowerCase().includes(search.trim().toLowerCase())),
    [docs, search, statusFilter]
  );

  const renderAccessBadge = (d) => {
    const ac = d.access_control;
    if (!ac) return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
        <Unlock className="w-3 h-3" /> All
      </span>
    );
    const roles = Array.isArray(ac.roles) ? ac.roles : [];
    const role = roles[0] || "all";
    return (
      <span className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
        <Lock className="w-3 h-3" /> {ACCESS_ROLE_LABELS[role] || role}
      </span>
    );
  };

  return (
    <HRPage title="Company Documents">
      <div className="space-y-6 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 rounded-xl"><Building2 className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Company Documents</h2>
              <p className="text-sm text-slate-500">Policies, handbooks, and official company files. Assign to employees.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setUploadModal(true)}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 self-start sm:self-center">
              <Upload className="w-4 h-4" /> Upload
            </button>
            <button onClick={load} className="flex items-center gap-2 text-sm font-medium text-slate-600 border border-gray-200 bg-white px-4 py-2 rounded-lg hover:bg-gray-50 self-start sm:self-center">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search company documents…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div className="relative max-w-[200px]">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by Employee ID…" value={empIdSearch}
              onChange={e => setEmpIdSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${statusFilter === s ? "bg-indigo-600 text-white shadow-sm" : "bg-white border border-gray-200 text-slate-600 hover:bg-gray-50"}`}>
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm font-medium">Loading company documents…</span>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-rose-500 text-sm font-medium bg-rose-50 rounded-xl border border-rose-100 p-6">{error}</div>
        ) : companyDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-5xl mb-4">🏢</span>
            <p className="text-base font-semibold text-slate-700 mb-1">{search || statusFilter !== "all" ? "No results found" : "No company documents yet"}</p>
            <p className="text-sm text-slate-400">{search || statusFilter !== "all" ? "Try adjusting your search or filter." : "Company policies and handbooks will appear here once uploaded."}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400 font-medium">{companyDocs.length} document{companyDocs.length !== 1 ? "s" : ""}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {companyDocs.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-3 group">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl select-none shrink-0 mt-0.5">{fileTypeIcon(d.file_name || d.title)}</span>
                    <p className="font-semibold text-slate-800 leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors">{d.title}</p>
                  </div>
                  {d.description && <p className="text-xs text-slate-400 line-clamp-2">{d.description}</p>}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                    <StatusBadge status={d.status} />
                    <span className="text-xs text-slate-400">{fmtDate(d.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {renderAccessBadge(d)}
                    {d.is_template && (
                      <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Template
                      </span>
                    )}
                  </div>
                  {/* Action row */}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => openAssignModal(d)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors">
                      <UserPlus className="w-3.5 h-3.5" /> Assign
                    </button>
                    <button onClick={() => openViewAssignments(d)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors">
                      <Users className="w-3.5 h-3.5" /> View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Assign Document</h2>
                <p className="text-xs text-slate-400 mt-0.5">{assignModal.title} · Select employees</p>
              </div>
              <button onClick={() => setAssignModal(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {empLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
              ) : employees.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No active employees found.</p>
              ) : (
                <div className="space-y-1">
                  {employees.map(emp => (
                    <label key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      selectedEmpIds.includes(emp.id) ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50 border border-transparent"
                    }`}>
                      <input type="checkbox" checked={selectedEmpIds.includes(emp.id)}
                        onChange={() => toggleEmp(emp.id)} className="rounded accent-indigo-600 w-4 h-4" />
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                        {(emp.firstName || emp.first_name || "?").charAt(0)}{(emp.lastName || emp.last_name || "").charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName || emp.full_name || `${emp.firstName || emp.first_name || ""} ${emp.lastName || emp.last_name || ""}`}</p>
                        <p className="text-xs text-slate-400"><span className="font-mono text-indigo-500">{emp.employeeId || emp.employee_id}</span> · {emp.employeeCode || emp.employee_code} · {emp.jobTitle || emp.job_title || ""}</p>
                      </div>
                      {selectedEmpIds.includes(emp.id) && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 pt-0 border-t border-slate-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600 font-medium">{selectedEmpIds.length} selected</span>
              </div>
              <button onClick={handleAssign} disabled={!selectedEmpIds.length || assigning}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 transition flex items-center justify-center gap-2">
                {assigning ? <><Loader2 className="w-4 h-4 animate-spin" /> Assigning...</> : <><UserPlus className="w-4 h-4" /> Assign to {selectedEmpIds.length} Employee{selectedEmpIds.length !== 1 ? "s" : ""}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Assignments Modal */}
      {viewAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Assigned Employees</h2>
                <p className="text-xs text-slate-400 mt-0.5">{viewAssignModal.title}</p>
              </div>
              <button onClick={() => { setViewAssignModal(null); setAssignments([]); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {assignLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No assignments yet. Assign this document to employees.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignments.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                          {((a.employee_name || "??").charAt(0))}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{a.employee_name || "Unknown"}</p>
                          <p className="text-xs text-slate-400">{a.employee_id_str ? <span className="font-mono text-indigo-500">{a.employee_id_str}</span> : a.employee_code || ""}</p>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium mt-1 ${
                            a.status === "pending" ? "bg-amber-50 text-amber-700" :
                            a.status === "acknowledged" ? "bg-emerald-50 text-emerald-700" :
                            "bg-blue-50 text-blue-700"
                          }`}>{a.status}</span>
                          {a.acknowledged_at && <span className="text-xs text-slate-400 ml-2">{fmtDate(a.acknowledged_at)}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleRemoveAssignment(a.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 pt-0 border-t border-slate-100 shrink-0">
              <button onClick={() => { setViewAssignModal(null); setAssignments([]); openAssignModal(viewAssignModal); }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" /> Assign More
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Upload Company Document</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload a policy, handbook, or company file</p>
              </div>
              <button onClick={() => { setUploadModal(false); setUploadFile(null); setUploadForm({ title: "", description: "", document_type: "", expiry_date: "" }); }}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">File <span className="text-rose-500">*</span></label>
                <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${uploadFile ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}
                  onClick={() => document.getElementById("doc-upload-input").click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}>
                  {uploadFile ? (
                    <div>
                      <span className="text-3xl">📄</span>
                      <p className="text-sm font-medium text-slate-700 mt-1">{uploadFile.name}</p>
                      <p className="text-xs text-slate-400">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Click or drag file here</p>
                      <p className="text-xs text-slate-400 mt-1">PDF, DOC, XLS, images accepted</p>
                    </div>
                  )}
                </div>
                <input id="doc-upload-input" type="file" className="hidden" onChange={e => setUploadFile(e.target.files[0] || null)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Title</label>
                <input type="text" value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
                  placeholder={uploadFile?.name?.replace(/\.[^.]+$/, "") || "Document title"}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Document Type</label>
                  <select value={uploadForm.document_type} onChange={e => setUploadForm(p => ({ ...p, document_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white">
                    <option value="">Select type</option>
                    <option value="policy">Policy</option>
                    <option value="handbook">Handbook</option>
                    <option value="contract">Contract</option>
                    <option value="report">Report</option>
                    <option value="form">Form</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Expiry Date</label>
                  <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description</label>
                <textarea value={uploadForm.description} onChange={e => setUploadForm(p => ({ ...p, description: e.target.value }))} rows={2}
                  placeholder="Brief description of this document…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={assignAfterUpload} onChange={e => setAssignAfterUpload(e.target.checked)} className="rounded accent-indigo-600 w-4 h-4" />
                Assign to employees after upload
              </label>
            </div>
            <div className="p-6 pt-0 border-t border-slate-100">
              <button onClick={handleUpload} disabled={!uploadFile || uploading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 transition flex items-center justify-center gap-2">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload Document</>}
              </button>
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
    </HRPage>
  );
}
