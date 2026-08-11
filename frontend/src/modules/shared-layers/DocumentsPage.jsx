import React, { useState, useEffect } from "react";
import PageHeader from "../../components/PageHeader";
import { FileText, Download, Plus, Search, UploadCloud, FolderOpen, AlertCircle } from "lucide-react";
import { getDocuments, createDocument, updateDocument, deleteDocument, getDocumentById } from "../../service/documentsService";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const newDoc = await createDocument({ category: "General" }, file);
      setDocuments(prev => [newDoc, ...prev]);
      e.target.value = "";
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (id) => {
    try {
      const blob = await api.get(`/hr/documents/${id}/download`, { responseType: "blob" });
      const doc = documents.find(d => d.id === id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc?.name || `document-${id}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Download failed");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader 
        title="Documents" 
        description="Access and manage files, HR handbooks, corporate guidelines, and secure document vaults."
        action={
          <button className="flex items-center gap-2 rounded-full bg-[#FF7A00] hover:bg-[#e56e00] text-white px-4 py-2.5 text-sm font-semibold transition shadow-[0_4px_14px_rgba(255,122,0,0.3)]">
            <Plus className="h-4 w-4" /> Add Document
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Document list */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-2">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-[#FF7A00]" /> Document Repository
            </h3>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Filter files..." 
                className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#FF7A00]"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 font-bold">&times;</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-500">Loading documents...</td></tr>
                ) : documents.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-500">No documents found</td></tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id} className="text-sm text-slate-650 hover:bg-slate-50/50 transition">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
                          <div>
                            <p className="font-bold text-slate-800 leading-snug">{doc.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{doc.size} • by {doc.author}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 font-medium">
                          {doc.category}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-500">{doc.updated}</td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleDownload(doc.id)} className="p-1 text-slate-400 hover:text-[#FF7A00] transition" aria-label="Download document">
                            <Download className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(doc.id)} className="p-1 text-slate-400 hover:text-red-500 transition" aria-label="Delete document">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upload box */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Upload Box</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">Drag and drop file documents, handbooks, reports, or invoices to securely upload them.</p>
            <input type="file" id="file-upload" className="hidden" onChange={handleUpload} disabled={uploading} />
            <label htmlFor="file-upload" className="border-2 border-dashed border-slate-200 hover:border-[#FF7A00]/50 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50/50 cursor-pointer transition">
              <UploadCloud className="h-10 w-10 text-slate-400 mb-3" />
              <p className="text-xs font-bold text-slate-700">Click to upload file</p>
              <p className="text-[10px] text-slate-400 mt-1">PDF, DOCX, XLSX, SQL (Max 20MB)</p>
              {uploading && <p className="text-xs text-blue-600 mt-2">Uploading...</p>}
            </label>
          </div>

          <div className="mt-6 text-center">
            <span className="text-[10px] text-slate-400 font-semibold">Securely encrypted with AES-256</span>
          </div>
        </div>
      </div>
    </div>
  );
}
