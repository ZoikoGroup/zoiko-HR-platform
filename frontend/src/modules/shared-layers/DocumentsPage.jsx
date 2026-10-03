import React, { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { FileText, Download, Plus, Search, UploadCloud, FolderOpen, Trash2 } from "lucide-react";
import {
  ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB, deleteDocument, downloadDocument, getDocuments, getOrganizations,
  uploadDocument, validateFile,
} from "../../service/documentsService";
import { Btn, ErrorNote, Field, Modal, Spinner, SuperAdminOnly, fmt, inputCls, useAction } from "./integrationsUi";

const CATEGORIES = ["company", "policy", "contract", "employee", "payslip", "tax", "other"];
const FILE_TYPES = ["pdf", "docx", "xlsx", "png", "jpg", "txt"];
const PAGE_SIZE = 15;

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AddDocumentDialog({ organizations, orgsLoading, orgsError, onRetryOrgs, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "other", organization_id: "" });
  const [progress, setProgress] = useState(0);
  const { pending, error, run } = useAction();
  const inputRef = useRef(null);

  function choose(f) {
    const problem = validateFile(f);
    setFileError(problem || "");
    setFile(problem ? null : f);
    if (f && !problem && !form.title) setForm((p) => ({ ...p, title: f.name.replace(/\.[^.]+$/, "") }));
  }

  async function submit(e) {
    e.preventDefault();
    if (pending) return;
    const created = await run(() => uploadDocument({ file, ...form }, setProgress));
    if (created) onUploaded(created);
  }

  const blockedReason = orgsLoading
    ? "Organizations are still loading."
    : orgsError
      ? "Organizations could not be loaded. Retry above."
      : !file
        ? "Choose a file to upload."
        : !form.organization_id
          ? "Select an organization."
          : "";

  return (
    <Modal title="Add Document" onClose={pending ? () => {} : onClose}>
      <form onSubmit={submit}>
        <ErrorNote message={error} />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-[#3B82F6] bg-blue-50" : "border-slate-200 bg-slate-50"}`}
        >
          <UploadCloud className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-xs font-bold text-slate-700">{file ? file.name : "Drag & drop a file here, or click to browse"}</p>
          <p className="mt-1 text-[10px] text-slate-400">{ALLOWED_EXTENSIONS.join(", ").toUpperCase()} · max {MAX_FILE_SIZE_MB} MB</p>
          <input ref={inputRef} type="file" className="hidden" data-testid="file-input" disabled={pending}
            onChange={(e) => choose(e.target.files?.[0])} />
        </div>
        <ErrorNote message={fileError} />
        <Field label="Organization" hint="Every document belongs to one organization.">
          <select className={inputCls} required value={form.organization_id} disabled={pending || orgsLoading || Boolean(orgsError)}
            onChange={(e) => setForm({ ...form, organization_id: e.target.value })}>
            <option value="">Select an organization…</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        {orgsLoading ? <p className="mb-3 text-[11px] text-slate-500">Loading organizations…</p> : null}
        {orgsError ? (
          <div className="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-600">
            <p>{orgsError}</p>
            <Btn className="mt-2" onClick={onRetryOrgs} disabled={pending}>Retry</Btn>
          </div>
        ) : null}
        <Field label="Title">
          <input className={inputCls} maxLength={200} value={form.title} disabled={pending}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className={inputCls} value={form.category} disabled={pending} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Description (optional)">
          <textarea className={inputCls} rows={2} maxLength={2000} value={form.description} disabled={pending}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {pending ? (
          <div className="mb-3" aria-label="Upload progress">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 bg-[#3B82F6] transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Uploading… {progress}%</p>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
          <Btn tone="primary" type="submit" disabled={pending || Boolean(blockedReason)}>
            {pending ? "Uploading…" : "Upload"}
          </Btn>
        </div>
        {blockedReason && !pending ? <p className="mt-2 text-right text-[11px] text-slate-500">{blockedReason}</p> : null}
      </form>
    </Modal>
  );
}

export default function DocumentsPage() {
  const [data, setData] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsError, setOrgsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ organization_id: "", category: "", file_type: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const loadSeq = useRef(0);
  const loadAbort = useRef(null);
  const del = useAction();

  useEffect(() => () => loadAbort.current?.abort(), []);

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true);
    setOrgsError("");
    try {
      const r = await getOrganizations();
      setOrgs(r.organizations || []);
    } catch (e) {
      setOrgs([]);
      setOrgsError(e?.message || "Could not load organizations.");
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  // Debounce the search box; a new query always returns to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    // Only the newest request may write state: a slow earlier response (a
    // duplicated mount load, an unfiltered list) used to land last and undo a
    // search or bring a deleted document back.
    const seq = ++loadSeq.current;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;

    const params = { page, page_size: PAGE_SIZE };
    if (query) params.q = query;
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = k.startsWith("date_") ? new Date(v).toISOString() : v;
    });
    setListLoading(true);
    try {
      const result = await getDocuments(params, controller.signal);
      if (seq !== loadSeq.current) return;
      // The last row of the last page was removed/deleted: step back instead of
      // claiming the repository is empty.
      if (result.documents.length === 0 && page > 1) {
        setPage((p) => p - 1);
        return;
      }
      setData(result);
      setError("");
    } catch (e) {
      if (seq !== loadSeq.current || controller.signal.aborted) return;
      setError(e?.message || "Failed to load documents.");
      setData((p) => p || { documents: [], total: 0 });
    } finally {
      if (seq === loadSeq.current) setListLoading(false);
    }
  }, [page, query, filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => { setPage(1); setFilters((p) => ({ ...p, [k]: v })); };
  const hasCriteria = Boolean(query || Object.values(filters).some(Boolean));

  async function handleDownload(doc) {
    setBusyId(doc.id);
    setError("");
    try {
      await downloadDocument(doc);
    } catch (e) {
      setError(e?.message || "Download failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    const res = await del.run(() => deleteDocument(confirmDelete.id));
    if (res) {
      setNotice(res.already_deleted ? "That document was already deleted." : res.message);
      setConfirmDelete(null);
      await load();
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <SuperAdminOnly>
      <div className="space-y-6 font-sans">
        <PageHeader
          title="Documents"
          description="Documents across all organizations. Every file is attributed to its organization."
          action={<Btn tone="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add Document</Btn>}
        />
        {notice ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div> : null}
        <ErrorNote message={error} />

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <FolderOpen className="h-5 w-5 text-[#3B82F6]" /> Document Repository
              </h3>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="search" aria-label="Search documents" placeholder="Search title, file, description, category, organization…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-xs text-slate-800 outline-none focus:border-[#3B82F6] focus:bg-white" />
              </div>
            </div>
            <p aria-live="polite" className="text-[11px] text-slate-500">
              {listLoading
                ? "Searching documents…"
                : query
                  ? `${data ? data.total : 0} result${data && data.total === 1 ? "" : "s"} for “${query}”`
                  : data
                    ? `${data.total} document${data.total === 1 ? "" : "s"}`
                    : ""}
            </p>
            <div className="grid gap-2 md:grid-cols-5">
              <select className={inputCls} aria-label="Organization" value={filters.organization_id} onChange={(e) => setFilter("organization_id", e.target.value)}>
                <option value="">All organizations</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select className={inputCls} aria-label="Category" value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={inputCls} aria-label="File type" value={filters.file_type} onChange={(e) => setFilter("file_type", e.target.value)}>
                <option value="">All file types</option>
                {FILE_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
              <input className={inputCls} type="date" aria-label="Uploaded from" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} />
              <input className={inputCls} type="date" aria-label="Uploaded to" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} />
            </div>
          </div>

          {data === null ? (
            <Spinner />
          ) : data.documents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              {hasCriteria ? (
                <>
                  <p>No documents match your search.</p>
                  <Btn className="mt-3" onClick={() => { setSearch(""); setQuery(""); setPage(1); setFilters({ organization_id: "", category: "", file_type: "", date_from: "", date_to: "" }); }}>
                    Clear search
                  </Btn>
                </>
              ) : (
                <p>No documents yet. Use “Add Document” to upload the first one.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Uploaded</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.documents.map((doc) => (
                    <tr key={doc.id} className="text-sm hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-5 w-5 flex-shrink-0 text-slate-400" />
                          <div>
                            <p className="font-bold leading-snug text-slate-800">{doc.title}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{doc.file_name} · {formatSize(doc.file_size)} · by {doc.uploader_name || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{doc.organization_name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{doc.category}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{fmt(doc.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        // Titles repeat across organizations and uploads, so the id keeps every
                        // row's action unambiguous.
                        <button type="button" aria-label={`Download ${doc.title} (#${doc.id})`} disabled={busyId === doc.id}
                          onClick={() => handleDownload(doc)} className="p-1 text-slate-400 transition hover:text-[#3B82F6] disabled:opacity-40">
                          <Download className="h-4 w-4" />
                        </button>
                        <button type="button" aria-label={`Delete ${doc.title} (#${doc.id})`} onClick={() => setConfirmDelete(doc)}
                          className="p-1 text-slate-400 transition hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between pt-4 text-xs text-slate-500">
                <span>Page {page} of {pages} · {data.total} document{data.total === 1 ? "" : "s"}</span>
                <div className="flex gap-2">
                  <Btn onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</Btn>
                  <Btn onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        {adding ? (
          <AddDocumentDialog organizations={orgs} orgsLoading={orgsLoading} orgsError={orgsError}
            onRetryOrgs={loadOrgs} onClose={() => setAdding(false)}
            onUploaded={(doc) => { setAdding(false); setNotice(`“${doc.title}” was uploaded to ${doc.organization_name}.`); setPage(1); load(); }} />
        ) : null}
        {confirmDelete ? (
          <Modal title="Delete document?" onClose={() => setConfirmDelete(null)}>
            <ErrorNote message={del.error} />
            <p className="text-sm text-slate-600">“{confirmDelete.title}” ({confirmDelete.organization_name}) will be removed from the repository and can no longer be downloaded.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setConfirmDelete(null)} disabled={del.pending}>Cancel</Btn>
              <Btn tone="danger" onClick={handleDelete} disabled={del.pending}>{del.pending ? "Deleting…" : "Delete"}</Btn>
            </div>
          </Modal>
        ) : null}
      </div>
    </SuperAdminOnly>
  );
}
