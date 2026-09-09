import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, FileText, Download, User, Hash,
  Clock, Upload, X, Loader2, Check, Receipt, FileSignature, ShieldCheck, Eye, History
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import DocumentPreviewModal from "../../components/DocumentPreviewModal";
import DocumentEmptyState from "../../components/documents/DocumentEmptyState";
import DocumentErrorState from "../../components/documents/DocumentErrorState";
import { useDocumentFile } from "../../hooks/useDocumentFile";
import { fileTypeIcon, fmtDate } from "../../utils/documents";
import { getDocuments, uploadDocument, getHrEmployees, getDocumentVersions, uploadDocumentVersion, getDocumentVersionFile } from "../../service/hrService";

// "Offer & Contracts" deliberately maps to category "employee", not "contract"
// (a separate HrDocumentCategory value that exists but isn't used here). This
// must stay in sync with the getDocuments({ category: "employee" }) call in
// Employee_OfferContracts.jsx — changing one without the other breaks that page.
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

function getExpiryStatus(d) {
  if (!d.expiry_date) return null;
  const days = Math.ceil((new Date(d.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expired", cls: "bg-rose-100 text-rose-700 border-rose-200" };
  if (days <= 7) return { label: `${days}d left`, cls: "bg-rose-50 text-rose-600 border-rose-200" };
  if (days <= 30) return { label: `${days}d left`, cls: "bg-amber-50 text-amber-600 border-amber-200" };
  return null;
}

export default function OrgAdminEmployeeDocumentsPage() {
  const [tab, setTab] = useState("payslip");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [empIdSearch, setEmpIdSearch] = useState("");

  const [uploadModal, setUploadModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    employee_id: "", title: "", document_type: "", expiry_date: "", category: "payslip",
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [versionModal, setVersionModal] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [uploadVersionModal, setUploadVersionModal] = useState(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { preview, busyId, busyAction, fileError, view, download, closePreview, downloadFromPreview } = useDocumentFile();

  const currentCategory = TABS.find(t => t.key === tab)?.category;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (currentCategory) {
        params.category = currentCategory;
      } else {
        params.exclude_categories = "employee";
      }
      if (empIdSearch.trim()) params.employee_id_str = empIdSearch.trim();
      const res = await getDocuments(params);
      const raw = res?.data;
      setDocs(Array.isArray(raw) ? raw : (raw?.items || raw?.data || []));
    } catch (e) { setError(e?.message || "Failed to load documents."); }
    finally { setLoading(false); }
  }, [tab, empIdSearch]);

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

  const openVersionHistory = async (doc) => {
    setVersionModal(doc); setVersionsLoading(true);
    try {
      const res = await getDocumentVersions(doc.id);
      setVersions(res?.items || res?.data || []);
    } catch { setVersions([]); }
    finally { setVersionsLoading(false); }
  };

  const handleUploadVersion = async () => {
    if (!uploadVersionModal?.file) return;
    setUploadingVersion(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadVersionModal.file);
      if (uploadVersionModal.change_notes) fd.append("change_notes", uploadVersionModal.change_notes);
      await uploadDocumentVersion(uploadVersionModal.docId, fd);
      showToast("success", "New version uploaded");
      setUploadVersionModal(null);
      if (versionModal) openVersionHistory(versionModal);
      load();
    } catch (e) { showToast("error", e?.message || "Upload failed"); }
    finally { setUploadingVersion(false); }
  };

  const filtered = docs.filter(d =>
    !search.trim() || (d.title || "").toLowerCase().includes(search.trim().toLowerCase()) ||
    (d.employee_name || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-doc-surface-soft p-4 font-sans">
      <PageHeader
        title="Employee Documents"
        description="Upload and manage payslips, contracts, tax & compliance documents for employees"
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary-deep ${
                tab === t.key ? "bg-doc-primary text-white shadow-sm" : "bg-doc-surface border border-doc-border text-doc-ink-soft hover:bg-doc-surface-soft"
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleUploadClick}
            className="flex items-center gap-2 text-sm font-semibold text-white bg-doc-primary px-4 py-2 rounded-lg hover:bg-doc-primary-deep transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary-deep">
            <Upload className="w-4 h-4" /> Upload Document
          </button>
          <button onClick={load}
            className="flex items-center gap-2 text-sm font-medium text-doc-ink-soft border border-doc-border bg-doc-surface px-4 py-2 rounded-lg hover:bg-doc-surface-soft transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-doc-ink-soft" />
          <label htmlFor="org-doc-search" className="sr-only">Search by document name or employee</label>
          <input id="org-doc-search" type="text" placeholder="Search by document name or employee..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-doc-border rounded-lg text-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary bg-doc-surface" />
        </div>
        <div className="relative max-w-[220px]">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-doc-ink-soft" />
          <label htmlFor="org-doc-emp-search" className="sr-only">Search by Employee ID</label>
          <input id="org-doc-emp-search" type="text" placeholder="Search by Employee ID..." value={empIdSearch}
            onChange={e => setEmpIdSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-doc-border rounded-lg text-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary bg-doc-surface font-mono" />
        </div>
      </div>

      <DocumentErrorState message={fileError} />
      <div className="h-3" />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-doc-ink-soft">
          <Loader2 className="w-8 h-8 animate-spin text-doc-primary" />
          <span className="text-sm font-medium">Loading documents...</span>
        </div>
      ) : error ? (
        <DocumentErrorState message={error} onRetry={load} />
      ) : (
        <div className="bg-doc-surface rounded-2xl border border-doc-border shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <DocumentEmptyState
              title={search ? "No results found" : "No documents yet"}
              message={search ? "Try a different search term." : "Upload documents using the Upload Document button above."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-doc-surface-soft text-xs uppercase text-doc-ink-soft">
                    <tr>
                      <th className="text-left px-6 py-3 font-semibold"><Hash className="w-3 h-3 inline mr-1" />ID</th>
                      <th className="text-left px-6 py-3 font-semibold"><User className="w-3 h-3 inline mr-1" />Employee</th>
                      <th className="text-left px-6 py-3 font-semibold"><FileText className="w-3 h-3 inline mr-1" />Document</th>
                      <th className="text-center px-6 py-3 font-semibold">Type</th>
                      <th className="text-center px-6 py-3 font-semibold">Status</th>
                      <th className="text-center px-6 py-3 font-semibold">Expiry</th>
                      <th className="text-center px-6 py-3 font-semibold"><Clock className="w-3 h-3 inline mr-1" />Date</th>
                      <th className="text-center px-6 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-doc-border">
                    {filtered.map(d => {
                      const expiry = getExpiryStatus(d);
                      return (
                        <tr key={d.id} className="hover:bg-doc-surface-soft/60 transition-colors">
                          <td className="px-6 py-3 text-xs font-mono text-doc-ink-soft">{d.id}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-doc-primary/10 flex items-center justify-center text-xs font-bold text-doc-primary shrink-0">
                                {(d.employee_name || "?").charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-doc-ink">{d.employee_name || "—"}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg shrink-0">{fileTypeIcon(d.file_name || d.title)}</span>
                              <div>
                                <p className="font-medium text-doc-ink truncate max-w-[200px]">{d.title}</p>
                                {d.file_name && <p className="text-xs text-doc-ink-soft">{d.file_name}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-doc-primary/10 text-doc-primary border border-doc-primary/20">
                              {d.document_type || d.category || "—"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              STATUS_META[d.status]?.bg || "bg-slate-100"} ${STATUS_META[d.status]?.text || "text-slate-500"} ${STATUS_META[d.status]?.border || "border-slate-200"
                            }`}>{d.status}</span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            {expiry ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${expiry.cls}`}>
                                <Clock className="w-3 h-3" /> {expiry.label}
                              </span>
                            ) : d.expiry_date ? (
                              <span className="text-xs text-doc-ink-soft">{fmtDate(d.expiry_date)}</span>
                            ) : <span className="text-xs text-doc-ink-soft">—</span>}
                          </td>
                          <td className="px-6 py-3 text-center text-xs text-doc-ink-soft">{fmtDate(d.created_at)}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => view(d.id)} disabled={busyId === d.id}
                                className="p-1.5 rounded-lg text-doc-primary bg-doc-primary/10 border border-doc-primary/20 hover:bg-doc-primary/15 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary" title="View" aria-label="View document">
                                {busyId === d.id && busyAction === "view" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => download(d.id)} disabled={busyId === d.id}
                                className="p-1.5 rounded-lg text-doc-primary bg-doc-primary/10 border border-doc-primary/20 hover:bg-doc-primary/15 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary" title="Download" aria-label="Download document">
                                {busyId === d.id && busyAction === "download" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => openVersionHistory(d)}
                                className="p-1.5 rounded-lg text-doc-ink-soft bg-doc-surface-soft border border-doc-border hover:bg-doc-border/40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary" title="Version History" aria-label="Version history">
                                <History className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 border-t border-doc-border text-xs text-doc-ink-soft">
                {filtered.length} document{filtered.length !== 1 ? "s" : ""}
              </div>
            </>
          )}
        </div>
      )}

      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-doc-surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-doc-border">
              <div>
                <h2 className="text-lg font-bold text-doc-ink">Upload Document</h2>
                <p className="text-xs text-doc-ink-soft mt-0.5">
                  Assign a document to an employee
                </p>
              </div>
              <button onClick={() => setUploadModal(false)}
                className="p-2 rounded-xl hover:bg-doc-surface-soft text-doc-ink-soft transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-doc-ink-soft mb-1.5 block">
                  Employee <span className="text-rose-500">*</span>
                </label>
                {employeesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-doc-ink-soft py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading employees...
                  </div>
                ) : (
                  <select value={uploadForm.employee_id} onChange={e => setUploadForm(p => ({ ...p, employee_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-doc-border rounded-lg text-sm bg-doc-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary">
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
                <label className="text-xs font-semibold text-doc-ink-soft mb-1.5 block">Category</label>
                  <select value={uploadForm.category} onChange={e => setUploadForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-doc-border rounded-lg text-sm bg-doc-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary">
                    <option value="payslip">Payslip</option>
                    <option value="employee">Offer & Contract</option>
                    <option value="tax">Tax & Compliance</option>
                    <option value="other">Other</option>
                  </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-doc-ink-soft mb-1.5 block">Document Type</label>
                <select value={uploadForm.document_type} onChange={e => setUploadForm(p => ({ ...p, document_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-doc-border rounded-lg text-sm bg-doc-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary">
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
                <label className="text-xs font-semibold text-doc-ink-soft mb-1.5 block">Title</label>
                <input type="text" value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. June 2026 Payslip, Offer Letter, Tax Form"
                  className="w-full px-3 py-2 border border-doc-border rounded-lg text-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold text-doc-ink-soft mb-1.5 block">File <span className="text-rose-500">*</span></label>
                <div className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${uploadFile ? "border-doc-primary/40 bg-doc-primary/5" : "border-doc-border hover:border-slate-300"}`}
                  onClick={() => document.getElementById("org-emp-doc-input").click()}>
                  {uploadFile ? (
                    <div>
                      <span className="text-2xl">📄</span>
                      <p className="text-sm font-medium text-doc-ink mt-1">{uploadFile.name}</p>
                      <p className="text-xs text-doc-ink-soft">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-doc-border mx-auto mb-2" />
                      <p className="text-sm text-doc-ink-soft">Click to select file</p>
                      <p className="text-xs text-doc-ink-soft mt-1">PDF, DOC, XLS, images accepted</p>
                    </div>
                  )}
                </div>
                <input id="org-emp-doc-input" type="file" className="hidden"
                  onChange={e => setUploadFile(e.target.files[0] || null)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-doc-ink-soft mb-1.5 block">Expiry Date (optional)</label>
                <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-doc-border rounded-lg text-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary" />
              </div>
            </div>
            <div className="p-6 pt-0 border-t border-doc-border">
              <button onClick={handleUpload} disabled={!uploadFile || !uploadForm.employee_id || uploading}
                className="w-full py-2.5 rounded-xl bg-doc-primary text-white text-sm font-semibold hover:bg-doc-primary-deep disabled:bg-doc-primary/50 transition flex items-center justify-center gap-2">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload Document</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {versionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-doc-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-doc-border shrink-0">
              <div>
                <h2 className="text-lg font-bold text-doc-ink">Version History</h2>
                <p className="text-xs text-doc-ink-soft mt-0.5">{versionModal.title} · v{versionModal.current_version || 1}</p>
              </div>
              <button onClick={() => { setVersionModal(null); setVersions([]); }} className="p-2 rounded-xl hover:bg-doc-surface-soft text-doc-ink-soft transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {versionsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-doc-primary" /></div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-10 h-10 text-doc-border mx-auto mb-2" />
                  <p className="text-sm text-doc-ink-soft">No version history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((v, i) => (
                    <div key={v.id} className={`p-4 rounded-xl border ${i === 0 ? "border-doc-primary/30 bg-doc-primary/5" : "border-doc-border bg-doc-surface"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-doc-ink">v{v.version}</span>
                        <span className="text-xs text-doc-ink-soft">{fmtDate(v.created_at)}</span>
                      </div>
                      {v.change_notes && <p className="text-xs text-doc-ink-soft mt-1">{v.change_notes}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-doc-ink-soft">{v.uploader_name ? `by ${v.uploader_name}` : ""}</span>
                        <button
                          onClick={() => view(`v-${v.id}`, () => getDocumentVersionFile(versionModal.id, v.id))}
                          disabled={busyId === `v-${v.id}`}
                          className="flex items-center gap-1 text-xs font-semibold text-doc-primary hover:text-doc-primary-deep disabled:opacity-50"
                        >
                          {busyId === `v-${v.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 pt-0 border-t border-doc-border shrink-0">
              <button onClick={() => setUploadVersionModal({ docId: versionModal.id, docName: versionModal.title, file: null, change_notes: "" })}
                className="w-full py-2.5 rounded-xl bg-doc-primary text-white text-sm font-semibold hover:bg-doc-primary-deep transition flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" /> Upload New Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Version Modal */}
      {uploadVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-doc-surface rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-doc-border">
              <div>
                <h2 className="text-lg font-bold text-doc-ink">Upload New Version</h2>
                <p className="text-xs text-doc-ink-soft mt-0.5">{uploadVersionModal.docName}</p>
              </div>
              <button onClick={() => setUploadVersionModal(null)} className="p-2 rounded-xl hover:bg-doc-surface-soft text-doc-ink-soft transition"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-doc-ink-soft uppercase tracking-wide block mb-1.5">File *</label>
                <input type="file" onChange={e => setUploadVersionModal({ ...uploadVersionModal, file: e.target.files[0] })}
                  className="w-full text-sm text-doc-ink-soft file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-doc-primary/10 file:text-doc-primary hover:file:bg-doc-primary/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-doc-ink-soft uppercase tracking-wide block mb-1.5">Change Notes</label>
                <textarea rows={2} value={uploadVersionModal.change_notes} onChange={e => setUploadVersionModal({ ...uploadVersionModal, change_notes: e.target.value })}
                  placeholder="What changed in this version?"
                  className="w-full border border-doc-border rounded-xl px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-doc-primary resize-none" />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setUploadVersionModal(null)} className="flex-1 py-2.5 rounded-xl border border-doc-border text-sm font-semibold text-doc-ink-soft hover:bg-doc-surface-soft transition">Cancel</button>
              <button onClick={handleUploadVersion} disabled={!uploadVersionModal.file || uploadingVersion}
                className="flex-1 py-2.5 rounded-xl bg-doc-primary text-white text-sm font-semibold hover:bg-doc-primary-deep disabled:bg-doc-primary/50 transition flex items-center justify-center gap-2">
                {uploadingVersion ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload</>}
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
    </div>
  );
}
