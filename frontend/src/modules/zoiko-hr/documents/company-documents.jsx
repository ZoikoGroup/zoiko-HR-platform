import { useState, useEffect, useMemo } from "react";
import {
  Search, Hash, Building2, RefreshCw, Lock, Unlock, Eye, Shield, Users,
  UserPlus, X, Loader2, Trash2, Check, Upload, Download,
  FolderPlus, Folder, ChevronRight, Home
} from "lucide-react";
import HRPage from "../../../components/HRPage";
import DocumentPreviewModal from "../../../components/DocumentPreviewModal";
import { useDocumentFile } from "../../../hooks/useDocumentFile";
import { fileTypeIcon, fmtDate } from "../../../utils/documents";
import {
  getDocuments, getHrEmployees, assignDocumentToEmployees,
  getDocumentAssignments, removeDocumentAssignment, uploadDocument,
  getDocumentFolders, getFolderBreadcrumb, createDocumentFolder,
  deleteDocumentFolder, assignFolderToEmployees
} from "../../../service/hrService";

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

  // folder state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folders, setFolders]     = useState([]);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // folder assign modal
  const [folderAssignModal, setFolderAssignModal] = useState(null);
  const [folderAssignEmpIds, setFolderAssignEmpIds] = useState([]);
  const [folderAssigning, setFolderAssigning] = useState(false);

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
  const [uploadForm, setUploadForm] = useState({ description: "", document_type: "", expiry_date: "" });
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [assignAfterUpload, setAssignAfterUpload] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();
  useEffect(() => {
    if (fileError) showToast("error", fileError);
  }, [fileError]);

  const load = () => {
    setLoading(true); setError(null);
    const params = { category: "company", folder_id: currentFolderId ?? undefined };
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

  const loadFolders = () => {
    getDocumentFolders(currentFolderId)
      .then(res => {
        const raw = res?.data;
        setFolders(Array.isArray(raw) ? raw : (raw?.items || raw?.data || []));
      })
      .catch(() => setFolders([]));
  };

  const loadBreadcrumb = () => {
    if (!currentFolderId) { setBreadcrumb([]); return; }
    getFolderBreadcrumb(currentFolderId)
      .then(res => setBreadcrumb(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setBreadcrumb([]));
  };

  useEffect(() => { load(); loadFolders(); loadBreadcrumb(); }, [empIdSearch, currentFolderId]);

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
    if (!uploadFiles.length) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: uploadFiles.length });
    const newDocs = [];
    try {
      for (const f of uploadFiles) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("title", f.name.replace(/\.[^.]+$/, ""));
        fd.append("category", "company");
        if (currentFolderId) fd.append("folder_id", currentFolderId);
        if (uploadForm.description) fd.append("description", uploadForm.description);
        if (uploadForm.document_type) fd.append("document_type", uploadForm.document_type);
        if (uploadForm.expiry_date) fd.append("expiry_date", uploadForm.expiry_date);
        const res = await uploadDocument(fd);
        if (res?.data?.id) newDocs.push(res.data);
        setUploadProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
      if (newDocs.length) setDocs(prev => [...newDocs, ...prev]);
      showToast("success", `${newDocs.length} document${newDocs.length > 1 ? "s" : ""} uploaded`);
      setUploadModal(false);
      setUploadFiles([]);
      setUploadForm({ description: "", document_type: "", expiry_date: "" });
      if (assignAfterUpload && newDocs.length) {
        setAssignAfterUpload(false);
        openAssignModal(newDocs[0]);
      }
    } catch (e) {
      console.error("[Upload] failed:", e);
      showToast("error", e?.message || "Upload failed");
    }
    finally { setUploading(false); setUploadProgress({ done: 0, total: 0 }); }
  };

  const toggleEmp = (id) => {
    setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createDocumentFolder(folderName.trim(), currentFolderId);
      showToast("success", `Folder "${folderName.trim()}" created`);
      setFolderModal(false);
      setFolderName("");
      loadFolders();
    } catch (e) { showToast("error", e?.message || "Failed to create folder"); }
    finally { setCreatingFolder(false); }
  };

  const handleDeleteFolder = async (folderId, folderNameStr) => {
    if (!window.confirm(`Delete folder "${folderNameStr}"? Its documents will be moved to root.`)) return;
    try {
      await deleteDocumentFolder(folderId);
      showToast("success", "Folder deleted");
      loadFolders();
      load();
    } catch (e) { showToast("error", e?.message || "Failed to delete folder"); }
  };

  const enterFolder = (folderId) => {
    setCurrentFolderId(folderId);
    setSearch("");
  };

  const openFolderAssign = (folder) => {
    setFolderAssignModal(folder);
    setFolderAssignEmpIds([]);
    loadEmployees();
  };

  const handleFolderAssign = async () => {
    if (!folderAssignModal || !folderAssignEmpIds.length) return;
    setFolderAssigning(true);
    try {
      const res = await assignFolderToEmployees(folderAssignModal.id, folderAssignEmpIds);
      const d = res?.data || {};
      showToast("success", `Assigned ${d.documents_count || 0} document(s) to ${folderAssignEmpIds.length} employee(s)`);
      setFolderAssignModal(null);
    } catch (e) { showToast("error", e?.message || "Assignment failed"); }
    finally { setFolderAssigning(false); }
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
      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
        <Lock className="w-3 h-3" /> {ACCESS_ROLE_LABELS[role] || role}
      </span>
    );
  };

  return (
    <HRPage title="Company Documents">
      <div className="space-y-6 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-xl"><Building2 className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Company Documents</h2>
              <p className="text-sm text-slate-500">Policies, handbooks, and official company files. Assign to employees.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFolderModal(true)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 border border-gray-200 bg-white px-4 py-2 rounded-lg hover:bg-gray-50 self-start sm:self-center">
              <FolderPlus className="w-4 h-4" /> New Folder
            </button>
            <button onClick={() => setUploadModal(true)}
              className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 self-start sm:self-center">
              <Upload className="w-4 h-4" /> Upload
            </button>
            <button onClick={load} className="flex items-center gap-2 text-sm font-medium text-slate-600 border border-gray-200 bg-white px-4 py-2 rounded-lg hover:bg-gray-50 self-start sm:self-center">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        {(currentFolderId || breadcrumb.length > 0) && (
          <nav className="flex items-center gap-1 text-sm text-slate-500 bg-white px-4 py-2.5 rounded-xl border border-gray-100">
            <button onClick={() => { setCurrentFolderId(null); setSearch(""); }}
              className="flex items-center gap-1 hover:text-blue-600 transition-colors font-medium">
              <Home className="w-3.5 h-3.5" /> Root
            </button>
            {breadcrumb.map((b) => (
              <span key={b.id} className="flex items-center gap-1">
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <button onClick={() => { setCurrentFolderId(b.id); setSearch(""); }}
                  className="hover:text-blue-600 transition-colors font-medium">
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        {/* Folders */}
        {folders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {folders.map(f => (
              <div key={f.id}
                className="group relative p-4 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer"
                onClick={() => enterFolder(f.id)}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-500 group-hover:bg-amber-100 transition-colors">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.name}</p>
                    <p className="text-xs text-slate-400">{f.document_count || 0} doc{(f.document_count || 0) !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id, f.name); }}
                  className="absolute top-2 right-2 p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all" title="Delete folder">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); openFolderAssign(f); }}
                  className="absolute bottom-2 right-2 p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all" title="Assign folder to employees">
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search company documents…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          <div className="relative max-w-[200px]">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by Employee ID…" value={empIdSearch}
              onChange={e => setEmpIdSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${statusFilter === s ? "bg-blue-600 text-white shadow-sm" : "bg-white border border-gray-200 text-slate-600 hover:bg-gray-50"}`}>
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none">
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
                    <p className="font-semibold text-slate-800 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">{d.title}</p>
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
                    <button onClick={() => view(d.id)} disabled={busyId === d.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {busyId === d.id && busyAction === "view" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Preview
                    </button>
                    <button onClick={() => download(d.id)} disabled={busyId === d.id}
                      aria-label={`Download ${d.title}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {busyId === d.id && busyAction === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openAssignModal(d)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                      <UserPlus className="w-3.5 h-3.5" /> Assign
                    </button>
                    <button onClick={() => openViewAssignments(d)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors">
                      <Users className="w-3.5 h-3.5" /> Assignees
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create Folder Modal */}
      {folderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">New Folder</h2>
              <button onClick={() => { setFolderModal(false); setFolderName(""); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6">
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Folder Name</label>
              <input type="text" autoFocus value={folderName} onChange={e => setFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); }}
                placeholder="e.g. Policies, HR Forms"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              {currentFolderId && (
                <p className="text-xs text-slate-400 mt-2">Creating inside current folder</p>
              )}
            </div>
            <div className="p-6 pt-0">
              <button onClick={handleCreateFolder} disabled={!folderName.trim() || creatingFolder}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-400 transition flex items-center justify-center gap-2">
                {creatingFolder ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><FolderPlus className="w-4 h-4" /> Create Folder</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Assign Modal */}
      {folderAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Assign Folder</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="font-semibold">{folderAssignModal.name}</span> · All documents will be assigned
                </p>
              </div>
              <button onClick={() => setFolderAssignModal(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {empLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
              ) : employees.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No active employees found.</p>
              ) : (
                <div className="space-y-1">
                  {employees.map(emp => (
                    <label key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      folderAssignEmpIds.includes(emp.id) ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"
                    }`}>
                      <input type="checkbox" checked={folderAssignEmpIds.includes(emp.id)}
                        onChange={() => setFolderAssignEmpIds(prev => prev.includes(emp.id) ? prev.filter(x => x !== emp.id) : [...prev, emp.id])}
                        className="rounded accent-blue-600 w-4 h-4" />
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                        {(emp.firstName || emp.first_name || "?").charAt(0)}{(emp.lastName || emp.last_name || "").charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName || emp.full_name || `${emp.firstName || emp.first_name || ""} ${emp.lastName || emp.last_name || ""}`}</p>
                        <p className="text-xs text-slate-400"><span className="font-mono text-blue-500">{emp.employeeId || emp.employee_id}</span></p>
                      </div>
                      {folderAssignEmpIds.includes(emp.id) && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 pt-0 border-t border-slate-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600 font-medium">{folderAssignEmpIds.length} selected</span>
              </div>
              <button onClick={handleFolderAssign} disabled={!folderAssignEmpIds.length || folderAssigning}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-400 transition flex items-center justify-center gap-2">
                {folderAssigning ? <><Loader2 className="w-4 h-4 animate-spin" /> Assigning...</> : <><UserPlus className="w-4 h-4" /> Assign to {folderAssignEmpIds.length} Employee{folderAssignEmpIds.length !== 1 ? "s" : ""}</>}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
              ) : employees.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No active employees found.</p>
              ) : (
                <div className="space-y-1">
                  {employees.map(emp => (
                    <label key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      selectedEmpIds.includes(emp.id) ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"
                    }`}>
                      <input type="checkbox" checked={selectedEmpIds.includes(emp.id)}
                        onChange={() => toggleEmp(emp.id)} className="rounded accent-blue-600 w-4 h-4" />
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                        {(emp.firstName || emp.first_name || "?").charAt(0)}{(emp.lastName || emp.last_name || "").charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName || emp.full_name || `${emp.firstName || emp.first_name || ""} ${emp.lastName || emp.last_name || ""}`}</p>
                        <p className="text-xs text-slate-400"><span className="font-mono text-blue-500">{emp.employeeId || emp.employee_id}</span> · {emp.employeeCode || emp.employee_code} · {emp.jobTitle || emp.job_title || ""}</p>
                      </div>
                      {selectedEmpIds.includes(emp.id) && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
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
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-400 transition flex items-center justify-center gap-2">
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
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
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
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                          {((a.employee_name || "??").charAt(0))}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{a.employee_name || "Unknown"}</p>
                          <p className="text-xs text-slate-400">{a.employee_id_str ? <span className="font-mono text-blue-500">{a.employee_id_str}</span> : a.employee_code || ""}</p>
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
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" /> Assign More
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Upload Company Documents</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload policies, handbooks, or company files</p>
              </div>
              <button onClick={() => { setUploadModal(false); setUploadFiles([]); setUploadForm({ description: "", document_type: "", expiry_date: "" }); }}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Files <span className="text-rose-500">*</span></label>
                <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${uploadFiles.length ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
                  onClick={() => document.getElementById("doc-upload-input").click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const dropped = Array.from(e.dataTransfer.files);
                    if (dropped.length) setUploadFiles(prev => [...prev, ...dropped]);
                  }}>
                  <div>
                    <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Click or drag files here</p>
                    <p className="text-xs text-slate-400 mt-1">Select multiple files at once · PDF, DOC, XLS, images</p>
                  </div>
                </div>
                <input id="doc-upload-input" type="file" multiple className="hidden" onChange={e => {
                  const added = Array.from(e.target.files || []);
                  if (added.length) setUploadFiles(prev => [...prev, ...added]);
                  e.target.value = "";
                }} />
              </div>
              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-100 rounded-lg">
                      <span className="text-lg shrink-0">📄</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{f.name}</p>
                        <p className="text-xs text-slate-400">{(f.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0" title="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400 text-right">{uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""} selected</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Document Type</label>
                  <select value={uploadForm.document_type} onChange={e => setUploadForm(p => ({ ...p, document_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white">
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Description</label>
                <textarea value={uploadForm.description} onChange={e => setUploadForm(p => ({ ...p, description: e.target.value }))} rows={2}
                  placeholder="Brief description of this document…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={assignAfterUpload} onChange={e => setAssignAfterUpload(e.target.checked)} className="rounded accent-blue-600 w-4 h-4" />
                Assign to employees after upload
              </label>
            </div>
            <div className="p-6 pt-0 border-t border-slate-100 shrink-0">
              <button onClick={handleUpload} disabled={!uploadFiles.length || uploading}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-400 transition flex items-center justify-center gap-2">
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {uploadProgress.done + 1} of {uploadProgress.total}…</>
                  : <><Upload className="w-4 h-4" /> Upload {uploadFiles.length > 0 ? `${uploadFiles.length} File${uploadFiles.length > 1 ? "s" : ""}` : "Documents"}</>
                }
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

      <DocumentPreviewModal preview={preview} onClose={closePreview} onDownload={downloadFromPreview} />
    </HRPage>
  );
}
