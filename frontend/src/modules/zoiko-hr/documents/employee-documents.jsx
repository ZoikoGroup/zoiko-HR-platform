import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, FileText, Download, User, Briefcase, Hash,
  Clock, AlertTriangle, History, Upload, X, Loader2, Eye, Check
} from "lucide-react";
import HRPage from "../../../components/HRPage";
import { getDocuments, getDocumentVersions, uploadDocumentVersion } from "../../../service/hrService";
import { API_BASE_URL } from "../../../service/api";

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

export default function EmployeeDocuments() {
  const [docs, setDocs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [empIdSearch, setEmpIdSearch] = useState("");
  const [versionModal, setVersionModal] = useState(null);
  const [versions, setVersions]   = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast]         = useState(null);

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = { category: "employee" };
      if (search.trim()) params.search = search.trim();
      if (empIdSearch.trim()) params.employee_id_str = empIdSearch.trim();
      const res = await getDocuments(params);
      const raw = res?.data;
      setDocs(Array.isArray(raw) ? raw : (raw?.items || raw?.data || []));
    } catch (e) { setError(e?.message || "Failed to load documents."); }
    finally { setLoading(false); }
  }, [search, empIdSearch]);

  useEffect(() => { load(); }, [load]);

  const openVersionHistory = async (doc) => {
    setVersionModal(doc); setVersionsLoading(true);
    try {
      const res = await getDocumentVersions(doc.id);
      setVersions(res?.items || res?.data || []);
    } catch { setVersions([]); }
    finally { setVersionsLoading(false); }
  };

  const handleUploadVersion = async () => {
    if (!uploadModal?.file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadModal.file);
      if (uploadModal.change_notes) fd.append("change_notes", uploadModal.change_notes);
      await uploadDocumentVersion(uploadModal.docId, fd);
      showToast("success", "New version uploaded");
      setUploadModal(null);
      if (versionModal) openVersionHistory(versionModal);
    } catch (e) { showToast("error", e?.message || "Upload failed"); }
    finally { setUploading(false); }
  };

  const getDownloadUrl = (d) => {
    if (d.file_url) return d.file_url;
    if (d.file_path) return `${API_BASE_URL}/${d.file_path.replace(/\\/g, "/")}`;
    return null;
  };

  const getExpiryStatus = (d) => {
    if (!d.expiry_date) return null;
    const days = Math.ceil((new Date(d.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: "Expired", cls: "bg-rose-100 text-rose-700 border-rose-200" };
    if (days <= 7) return { label: `${days}d left`, cls: "bg-rose-50 text-rose-600 border-rose-200" };
    if (days <= 30) return { label: `${days}d left`, cls: "bg-amber-50 text-amber-600 border-amber-200" };
    return null;
  };

  const filtered = docs;

  return (
    <HRPage title="Employee Documents">
      <div className="space-y-6 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Employee Documents</h2>
            <p className="text-sm text-slate-500 mt-0.5">View documents uploaded by employees. Track versions and expirations.</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button onClick={load} className="p-2 rounded-lg border border-gray-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-gray-50" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by document name…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div className="relative max-w-[200px]">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by Employee ID…" value={empIdSearch}
              onChange={e => setEmpIdSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono" />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm font-medium">Loading employee documents…</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <span className="text-5xl mb-4">📄</span>
                <p className="text-base font-semibold text-slate-700 mb-1">{search ? "No results found" : "No employee documents yet"}</p>
                <p className="text-sm text-slate-400">{search ? "Try a different search term." : "Documents will appear here once employees upload them."}</p>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-400">
                    <tr>
                      <th className="text-left px-6 py-3 font-semibold"><Hash className="w-3 h-3 inline mr-1" />ID</th>
                      <th className="text-left px-6 py-3 font-semibold"><User className="w-3 h-3 inline mr-1" />Employee</th>
                      <th className="text-left px-6 py-3 font-semibold"><FileText className="w-3 h-3 inline mr-1" />Document</th>
                      <th className="text-center px-6 py-3 font-semibold">Status</th>
                      <th className="text-center px-6 py-3 font-semibold">Expiry</th>
                      <th className="text-center px-6 py-3 font-semibold"><History className="w-3 h-3 inline mr-1" />Version</th>
                      <th className="text-center px-6 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(d => {
                      const expiry = getExpiryStatus(d);
                      return (
                        <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-6 py-3 text-xs font-mono text-slate-400">{d.id}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                                {(d.employee_name || d.uploader_name || "?").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{d.employee_name || d.uploader_name || "—"}</p>
                                {d.employee_id_str && <p className="text-xs font-mono text-indigo-600">{d.employee_id_str}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg shrink-0">{fileTypeIcon(d.file_name || d.title)}</span>
                              <div>
                                <p className="font-medium text-slate-800 truncate max-w-[180px]">{d.title}</p>
                                {d.file_name && <p className="text-xs text-slate-400">{d.file_name}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              d.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              d.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                              d.status === "rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
                              "bg-slate-100 text-slate-500 border-slate-200"
                            }`}>{d.status}</span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            {expiry ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${expiry.cls}`}>
                                <Clock className="w-3 h-3" /> {expiry.label}
                              </span>
                            ) : d.expiry_date ? (
                              <span className="text-xs text-slate-400">{fmtDate(d.expiry_date)}</span>
                            ) : <span className="text-xs text-slate-400">—</span>}
                          </td>
                          <td className="px-6 py-3 text-center text-sm text-slate-600">{d.current_version || 1}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center justify-center gap-2">
                              {getDownloadUrl(d) && (
                                <a href={getDownloadUrl(d)} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors" title="Download">
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button onClick={() => openVersionHistory(d)}
                                className="p-1.5 rounded-lg text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors" title="Version History">
                                <History className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-6 py-3 border-t border-gray-100 text-xs text-slate-400">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Version History Modal */}
      {versionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Version History</h2>
                <p className="text-xs text-slate-400 mt-0.5">{versionModal.title} · v{versionModal.current_version || 1}</p>
              </div>
              <button onClick={() => { setVersionModal(null); setVersions([]); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {versionsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No version history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((v, i) => (
                    <div key={v.id} className={`p-4 rounded-xl border ${i === 0 ? "border-indigo-200 bg-indigo-50" : "border-slate-100 bg-white"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">v{v.version}</span>
                        <span className="text-xs text-slate-400">{fmtDate(v.created_at)}</span>
                      </div>
                      {v.change_notes && <p className="text-xs text-slate-600 mt-1">{v.change_notes}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-slate-400">{v.uploader_name ? `by ${v.uploader_name}` : ""}</span>
                        {v.file_url && (
                          <a href={v.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                            <Eye className="w-3 h-3" /> View
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 pt-0 border-t border-slate-100 shrink-0">
              <button onClick={() => setUploadModal({ docId: versionModal.id, docName: versionModal.title, file: null, change_notes: "" })}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" /> Upload New Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Version Modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Upload New Version</h2>
                <p className="text-xs text-slate-400 mt-0.5">{uploadModal.docName}</p>
              </div>
              <button onClick={() => setUploadModal(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">File *</label>
                <input type="file" onChange={e => setUploadModal({ ...uploadModal, file: e.target.files[0] })}
                  className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Change Notes</label>
                <textarea rows={2} value={uploadModal.change_notes} onChange={e => setUploadModal({ ...uploadModal, change_notes: e.target.value })}
                  placeholder="What changed in this version?"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setUploadModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={handleUploadVersion} disabled={!uploadModal.file || uploading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 transition flex items-center justify-center gap-2">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4" /> Upload</>}
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
