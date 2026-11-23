import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckSquare, Eye, EyeOff, FileText, FileWarning, Folder, FolderPlus, History, RefreshCw, Send, Share2, Trash2, Upload } from "lucide-react";
import { OrganizationDocumentsLayout } from "../ui";
import SectionState from "../components/SectionState";
import DocsBreadcrumb from "../components/DocsBreadcrumb";
import AccessBadge from "../components/AccessBadge";
import StatusChip from "../components/StatusChip";
import ShareModal from "../components/ShareModal";
import CompanyFileDialog from "../components/CompanyFileDialog";
import AckTrackingDrawer from "../components/AckTrackingDrawer";
import FilePreviewDrawer from "../components/FilePreviewDrawer";
import Pager from "../components/Pager";
import {
  useCompanyItems, useCompanyVersions, useCreateCompanyFolder, useDeleteCompanyDocument, usePublishCompanyDocument,
  useUnpublishCompanyDocument, useUploadCompanyDocument, useUploadCompanyVersion,
} from "../hooks/useCompanyDocuments";
import { formatDate, formatDateTime } from "../../../../utils/dateTime";

const SEGMENTS = [["all", "All"], ["expiring_soon", "Expiring soon"], ["expired", "Expired"]];

function VersionsPanel({ document: doc, onClose }) {
  const query = useCompanyVersions(doc?.id);
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`Versions of ${doc.title}`} onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-auto bg-white p-5 shadow-2xl dark:bg-[#1e293b]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Versions of {doc.title}</h2>
          <button type="button" onClick={onClose} className="text-sm underline">Close</button>
        </div>
        <SectionState query={query} skeleton="list" isEmpty={(d) => !d?.length} empty={{ title: "No versions" }}>
          {(rows) => (
            <ol className="space-y-3">
              {rows.map((v) => (
                <li key={v.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="flex items-center gap-2"><strong>v{v.version}</strong><StatusChip status={v.status} />{v.is_current && <span className="text-xs text-emerald-700">current</span>}</div>
                  <p className="text-xs text-slate-500">{formatDateTime(v.uploaded_at)} · {v.uploaded_by}{v.material_change ? "" : " · minor change"}</p>
                  {v.change_notes && <p className="mt-1 text-slate-700">{v.change_notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </SectionState>
      </section>
    </div>
  );
}

/**
 * Admin → Company Documents, level 2 (docs/new_docs/ZHR-DOCS-ARCH-001 §17 A3): the folders and files of one category.
 * Upload and Share sit under the breadcrumb and act on the open category (or folder); New Folder and Refresh too; each file can be shared, versioned, published / unpublished, tracked for read
 * confirmations and removed. Files can be ticked (or all of them on the page at once) and shared together in one action
 * (QA R1-21). A file whose bytes are missing on the server is flagged and offers "Upload it again" (QA R1-22).
 */
export default function CompanyCategoryPage() {
  const { categoryId } = useParams();
  const [params, setParams] = useSearchParams();
  const folderId = Number(params.get("folder")) || null;
  const [segment, setSegment] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);          // { mode: 'new'|'version', document? }
  const [sharing, setSharing] = useState(null);        // { type, id, name }
  const [tracking, setTracking] = useState(null);
  const [versions, setVersions] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [newFolder, setNewFolder] = useState("");
  const [folderError, setFolderError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const query = useCompanyItems(categoryId, { folder_id: folderId || undefined, expiry: segment, search: search.trim() || undefined, page, per_page: 50 });
  const upload = useUploadCompanyDocument();
  const version = useUploadCompanyVersion();
  const publish = usePublishCompanyDocument();
  const unpublish = useUnpublishCompanyDocument();
  const remove = useDeleteCompanyDocument();
  const folder = useCreateCompanyFolder();
  const category = query.data?.category;
  const pageFiles = query.data?.files?.items || [];
  const allChosen = pageFiles.length > 0 && pageFiles.every((f) => selected.has(f.id));
  const someChosen = pageFiles.some((f) => selected.has(f.id));
  const selectAllRef = useRef(null);
  const folderInput = useRef(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someChosen && !allChosen; }, [someChosen, allChosen]);
  // another folder, filter, search or page shows other files: start the selection again
  useEffect(() => { setSelected(new Set()); }, [categoryId, folderId, segment, search, page]);
  const toggle = (id, on) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  const toggleAll = (on) => setSelected(on ? new Set(pageFiles.map((f) => f.id)) : new Set());

  // New Folder (QA R1-18): the name is read from the field itself when the form is sent, so a value put there by browser
  // autofill or a password manager (which may not fire React's change event) still counts; the button never looks stuck.
  const createFolder = async (e) => {
    e.preventDefault();
    const name = String(folderInput.current?.value ?? newFolder).replace(/\s+/g, " ").trim();
    if (!name) { setFolderError("Type a name for the folder."); return; }
    setFolderError(null);
    setNotice(null);
    try {
      await folder.mutateAsync({ name, categoryId: Number(categoryId), parentId: folderId });
      setNewFolder("");
      setNotice(`Folder “${name}” added.`);
    } catch (err) {
      setFolderError(err?.message || "The folder could not be added.");
    }
  };

  const run = async (fn, ok) => {
    setNotice(null);
    try { await fn(); if (ok) setNotice(ok); } catch (e) { setNotice(e?.message || "That didn't work."); }
  };
  const goFolder = (id) => { const p = new URLSearchParams(params); if (id) p.set("folder", String(id)); else p.delete("folder"); setParams(p); setPage(1); };

  const crumbs = [{ label: "Documents", to: "/zoiko-hr/documents" }, { label: "Company Documents", to: "/zoiko-hr/documents/company-documents" },
    { label: category?.name || "Category", to: folderId ? `/zoiko-hr/documents/company-documents/${categoryId}` : undefined },
    ...((query.data?.breadcrumb) || []).map((b, i, all) => ({ label: b.name, to: i < all.length - 1 ? `/zoiko-hr/documents/company-documents/${categoryId}?folder=${b.id}` : undefined }))];

  const openFolder = folderId ? (query.data?.breadcrumb || []).at(-1) : null;
  const targetName = openFolder?.name || category?.name || "";

  return (
    <OrganizationDocumentsLayout title="Company Documents" subtitle="Upload, share and version company-wide files."
      actions={(
        <button type="button" onClick={() => query.refetch()}
          className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      )}>
      <div className="space-y-5">
        <DocsBreadcrumb items={crumbs} />
        {/* Upload and Share act on what is open: the chosen category, or the folder inside it. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{targetName || "Category"}</h2>
            <p className="text-xs text-slate-500">{folderId ? `Folder in ${category?.name || "this category"}` : "Company document category"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog({ mode: "new" })} disabled={!category}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <Upload size={16} aria-hidden="true" /> Upload to {targetName || "category"}
            </button>
            <button type="button" disabled={!category}
              onClick={() => setSharing({ type: folderId ? "folder" : "category", id: folderId || Number(categoryId), name: targetName })}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-[#334155] dark:text-slate-200">
              <Share2 size={16} aria-hidden="true" /> Share {targetName || "category"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="sr-only">Search files</span>
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search files…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <div role="tablist" aria-label="Expiry" className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {SEGMENTS.map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={segment === v} onClick={() => { setSegment(v); setPage(1); }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${segment === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>{l}</button>
            ))}
          </div>
          <form onSubmit={createFolder} noValidate className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="new-folder">New folder name</label>
            <input id="new-folder" ref={folderInput} name="name" value={newFolder} autoComplete="off" placeholder="New folder name" maxLength={255}
              onChange={(e) => { setNewFolder(e.target.value); setFolderError(null); }}
              aria-invalid={Boolean(folderError)} aria-describedby={folderError ? "new-folder-error" : undefined}
              className="w-44 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-[#334155] dark:bg-[#0f172a]" />
            <button type="submit" disabled={!category || folder.isPending}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-[#334155] dark:text-slate-200">
              <FolderPlus size={16} aria-hidden="true" /> New Folder
            </button>
            {folderError && <p id="new-folder-error" role="alert" className="w-full text-xs text-rose-700">{folderError}</p>}
          </form>
        </div>
        {notice && <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">{notice}</p>}
        {selected.size > 0 && (
          <div role="region" aria-label="Selected files" className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
            <span><strong>{selected.size}</strong> selected</span>
            <button type="button" onClick={() => setSharing({ type: "document", ids: [...selected], name: `${selected.size} documents` })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">
              <Share2 size={14} aria-hidden="true" /> Share selected
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-blue-800 underline">Clear</button>
          </div>
        )}

        <SectionState query={query} label="Loading files" isEmpty={() => false}>
          {(data) => (
            <>
              {data.folders.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {data.folders.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-2">
                      <button type="button" onClick={() => goFolder(f.id)} className="flex flex-1 items-center gap-2 text-left text-sm font-medium">
                        <Folder size={16} className="text-amber-500" aria-hidden="true" /> {f.name}
                      </button>
                      <button type="button" aria-label={`Who can see ${f.name}`} onClick={() => setSharing({ type: "folder", id: f.id, name: f.name })} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                        <Share2 size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {data.files.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
                  No files here yet. Use Upload to add the first one.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-[#334155] dark:bg-[#1e293b]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-10 px-4 py-3">
                          <input ref={selectAllRef} type="checkbox" checked={allChosen} onChange={(e) => toggleAll(e.target.checked)}
                            aria-label="Select all files on this page" className="h-4 w-4 rounded border-slate-300" />
                        </th>
                        <th className="px-4 py-3">File</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Who can see</th><th className="px-4 py-3">Read</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.files.items.map((f) => (
                        <tr key={f.id} className={selected.has(f.id) ? "bg-blue-50/60 dark:bg-blue-900/20" : undefined}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selected.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)}
                              aria-label={`Select ${f.title}`} className="h-4 w-4 rounded border-slate-300" />
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 font-medium"><FileText size={16} className="text-slate-400" aria-hidden="true" />{f.title}</span>
                            {f.file_available === false && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                <FileWarning size={12} aria-hidden="true" /> File missing
                              </span>
                            )}
                            <p className="text-xs text-slate-500">{f.uploaded_by?.name} · {formatDate(f.uploaded_at)}</p>
                          </td>
                          <td className="px-4 py-3">v{f.version}</td>
                          <td className={`px-4 py-3 ${f.expiry_state === "expired" ? "text-rose-700 font-semibold" : f.expiry_state === "expiring_soon" ? "text-amber-700 font-semibold" : ""}`}>
                            {f.expiry_date ? formatDate(f.expiry_date) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {f.status === "pending_approval" ? <StatusChip status="pending_approval" href={`/zoiko-hr/documents/approvals?item=${f.id}`} />
                              : <span className="text-xs">{f.publish_state === "published" ? "Published" : f.publish_state === "scheduled" ? `Scheduled ${formatDateTime(f.publish_at)}` : "Unpublished"}</span>}
                          </td>
                          <td className="px-4 py-3"><AccessBadge access={f.access} /></td>
                          <td className="px-4 py-3">{f.ack ? <button type="button" onClick={() => setTracking(f)} className="text-xs font-semibold text-blue-700 hover:underline">{f.ack.acknowledged}/{f.ack.acknowledged + f.ack.pending}</button> : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-1">
                              <IconButton label={`Preview ${f.title}`} onClick={() => setPreviewing(f)} icon={Eye} />
                              <IconButton label={`Who can see ${f.title}`} onClick={() => setSharing({ type: "document", id: f.id, name: f.title })} icon={Share2} />
                              <IconButton label={f.file_available === false ? `Upload ${f.title} again` : `New version of ${f.title}`}
                                onClick={() => setDialog({ mode: "version", document: f })} icon={Upload} />
                              <IconButton label={`Versions of ${f.title}`} onClick={() => setVersions(f)} icon={History} />
                              {f.ack && <IconButton label={`Read confirmations for ${f.title}`} onClick={() => setTracking(f)} icon={CheckSquare} />}
                              {f.publish_state === "published"
                                ? <IconButton label={`Unpublish ${f.title}`} onClick={() => run(() => unpublish.mutateAsync(f.id), "Unpublished.")} icon={EyeOff} />
                                : <IconButton label={`Publish ${f.title} now`} onClick={() => run(() => publish.mutateAsync({ documentId: f.id }), "Published.")} icon={Send} />}
                              <IconButton label={`Remove ${f.title}`} onClick={() => run(() => remove.mutateAsync(f.id), "Removed.")} icon={Trash2} danger />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager page={data.files.page} perPage={data.files.per_page} total={data.files.total} onPage={setPage} />
            </>
          )}
        </SectionState>
        {folderId && <Link to={`/zoiko-hr/documents/company-documents/${categoryId}`} className="text-sm text-blue-700 hover:underline">Back to {category?.name}</Link>}
      </div>

      <CompanyFileDialog open={Boolean(dialog)} mode={dialog?.mode} category={category} document={dialog?.document} folderId={folderId}
        onClose={() => setDialog(null)}
        onSubmit={(v) => (dialog?.mode === "version" ? version.mutateAsync(v) : upload.mutateAsync(v)).then(() => setNotice("Uploaded."))} />
      <ShareModal open={Boolean(sharing)} targetType={sharing?.type} targetId={sharing?.id} targetIds={sharing?.ids} targetName={sharing?.name || ""}
        onClose={() => setSharing(null)}
        onSaved={() => { if (sharing?.ids) { setNotice(`Sharing updated for ${sharing.ids.length} documents.`); setSelected(new Set()); } }} />
      <AckTrackingDrawer open={Boolean(tracking)} document={tracking} onClose={() => setTracking(null)} />
      {versions && <VersionsPanel document={versions} onClose={() => setVersions(null)} />}
      <FilePreviewDrawer open={Boolean(previewing)} documentId={previewing?.id} title={previewing?.title} onClose={() => setPreviewing(null)}
        missingActions={{ upload_version: previewing ? { label: "Upload it again", onClick: () => { setDialog({ mode: "version", document: previewing }); setPreviewing(null); } } : undefined }} />
    </OrganizationDocumentsLayout>
  );
}

function IconButton({ label, onClick, icon: Icon, danger }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`rounded-lg p-1.5 ${danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-600 hover:bg-slate-100"}`}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
